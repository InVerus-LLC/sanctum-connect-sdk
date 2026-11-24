/**
 * Wallet sessions for apps: connect to a person's Sanctum wallet the way a dapp connects through
 * WalletConnect, and use it as an EIP-1193 provider for `personal_sign` and
 * `eth_signTypedData_v4`. The person approves the connection on Sanctum's pairing page and every
 * request on Sanctum's Wallets page; the provider only ever sees the approved address and the
 * signatures Sanctum verified.
 *
 * The protocol sits behind `WalletSessionTransport`, so another relay (for example a reviewed
 * WalletConnect adapter) can implement it without changing apps. `sanctumTransport` is the
 * HTTPS transport to Sanctum's `/connect/v1` API.
 *
 * Errors are `ProviderRpcError`s with EIP-1193 / EIP-1474 codes (`PROVIDER_ERRORS`): 4001 the person
 * rejected or the caller aborted (reason "aborted"), 4100 not authorized (including a method the
 * session didn't approve), 4200 unsupported method (reason "method_unsupported", also from the
 * server), 4900 the session is over (also a disabled app, "app_disabled"), 4902 a chain the session
 * didn't approve, -32602 invalid parameters, -32005 a limit was reached, -32603 Sanctum couldn't be
 * reached or failed. The server's reason (for example "session_inactive", "request_limit") is
 * `reason`; `{ status, error }` is `data`. Every call takes an optional AbortSignal.
 *
 * This module is the port and Sanctum's transport; the provider (events, polling, pending requests)
 * is wallet-session-provider.ts, connecting and resuming wallet-session-connect.ts.
 */
export type WalletSessionMethod = "personal_sign" | "eth_signTypedData_v4";

export interface WalletSessionState {
  sessionId: string;
  status: "proposed" | "active" | "rejected" | "ended" | "expired";
  accounts: string[];
  chain: string | null;
  expiresAt: string;
}
export interface PairingProposal extends WalletSessionState {
  sessionToken: string;
  pairingUri: string;
}
/** `cancelled`: the app withdrew it; `closed`: the session ended before the person decided. */
export interface RequestState {
  requestId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled" | "closed";
  result?: string;
}

/** A session as the app holds it: its ID and its bearer token (keep it like a password; never in a URL). */
export type WalletSessionHandle = { sessionId: string; sessionToken: string };
type Session = WalletSessionHandle;
type Signal = { signal?: AbortSignal };

/**
 * The port: how an app reaches the wallet side. Implementations should honour `signal`, and report
 * failures as ProviderRpcErrors (`transportError` maps an HTTP-style status, error and reason).
 */
export interface WalletSessionTransport {
  propose(input: { chains: string[]; methods: WalletSessionMethod[] }, options?: Signal): Promise<PairingProposal>;
  state(session: Session, options?: Signal): Promise<WalletSessionState>;
  send(
    session: Session,
    request: { requestKey: string; method: WalletSessionMethod; params: unknown[] },
    options?: Signal,
  ): Promise<RequestState>;
  result(session: Session, requestId: string, options?: Signal): Promise<RequestState>;
  /** Withdraws the app's own pending request (it stops waiting for the person); a decided one is returned as it is. */
  cancel?(session: Session, requestId: string, options?: Signal): Promise<RequestState>;
  end(session: Session, options?: Signal): Promise<void>;
}

/** EIP-1193 provider codes (with EIP-3326's 4902) and the EIP-1474 JSON-RPC codes this SDK uses. */
export const PROVIDER_ERRORS = Object.freeze({
  userRejected: 4001,
  unauthorized: 4100,
  unsupportedMethod: 4200,
  disconnected: 4900,
  unrecognizedChain: 4902,
  invalidParams: -32602,
  internal: -32603,
  limitExceeded: -32005,
} as const);
export type ProviderRpcErrorCode = (typeof PROVIDER_ERRORS)[keyof typeof PROVIDER_ERRORS];

/** An EIP-1193 provider error with a typed code; `reason` is Sanctum's reason, `data` the HTTP status and error. */
export class ProviderRpcError extends Error {
  readonly code: ProviderRpcErrorCode;
  readonly reason: string | undefined;
  readonly data: { status: number; error: string | undefined } | undefined;
  constructor(
    code: ProviderRpcErrorCode,
    message: string,
    reason?: string,
    data?: { status: number; error: string | undefined },
  ) {
    super(message);
    this.name = "ProviderRpcError";
    this.code = code;
    this.reason = reason;
    this.data = data;
  }
}

/** Which typed code an HTTP failure from Sanctum's wallet-session API is. */
function codeFor(status: number, error: string | undefined, reason: string | undefined): ProviderRpcErrorCode {
  if (
    status === 404 ||
    reason === "session_inactive" ||
    error === "app_disabled" ||
    (status === 409 && error === "invalid_state")
  )
    return PROVIDER_ERRORS.disconnected;
  if (reason === "method_unsupported") return PROVIDER_ERRORS.unsupportedMethod;
  if (status === 401 || status === 403 || reason === "method_not_approved") return PROVIDER_ERRORS.unauthorized;
  if (status === 429) return PROVIDER_ERRORS.limitExceeded;
  if (status === 400 || status === 409 || status === 422) return PROVIDER_ERRORS.invalidParams;
  return PROVIDER_ERRORS.internal;
}

/** The typed error for a failure reported as an HTTP status, error and reason (for transports other than Sanctum's too). */
export function transportError(status: number, error?: string, reason?: string): ProviderRpcError {
  return new ProviderRpcError(codeFor(status, error, reason), reason ?? error ?? `HTTP ${status}`, reason, {
    status,
    error,
  });
}

/** The 4001 a cancelled (aborted) call rejects with. */
export const cancelled = () => new ProviderRpcError(PROVIDER_ERRORS.userRejected, "Cancelled", "aborted");

/**
 * Who proposes: an app's OAuth client (its wallet kit), or a Wallet project by its project ID, whose
 * networks, methods and origins Sanctum enforces (ADR-0033). Exactly one.
 */
export type WalletSessionApp =
  { clientId: string; projectId?: undefined } | { projectId: string; clientId?: undefined };

export function sanctumTransport(
  config: { issuer: string; fetch?: typeof fetch } & WalletSessionApp,
): WalletSessionTransport {
  if ((config.clientId === undefined) === (config.projectId === undefined))
    throw new TypeError("sanctumTransport: give a clientId or a projectId");
  const app = config.projectId === undefined ? { client_id: config.clientId } : { project_id: config.projectId };
  const base = `${config.issuer}/connect/v1/wallet-sessions`;
  const call = async (path: string, init: RequestInit & { token?: string }, options: Signal = {}) => {
    if (options.signal?.aborted) throw cancelled();
    let response: Response;
    try {
      response = await (config.fetch ?? fetch)(`${base}${path}`, {
        ...init,
        credentials: "omit",
        ...(options.signal ? { signal: options.signal } : {}),
        headers: {
          "content-type": "application/json",
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
      });
    } catch {
      if (options.signal?.aborted) throw cancelled();
      throw new ProviderRpcError(PROVIDER_ERRORS.internal, "Sanctum couldn't be reached", "network_error");
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw transportError(
        response.status,
        typeof body.error === "string" ? body.error : undefined,
        typeof body.reason === "string" ? body.reason : undefined,
      );
    }
    return body;
  };
  const state = (body: Record<string, unknown>): WalletSessionState => ({
    sessionId: String(body.session_id),
    status: body.status as WalletSessionState["status"],
    accounts: (body.accounts as string[]) ?? [],
    chain: (body.chain as string | null) ?? null,
    expiresAt: String(body.expires_at),
  });
  const request = (body: Record<string, unknown>): RequestState => ({
    requestId: String(body.request_id),
    status: body.status as RequestState["status"],
    ...(typeof body.result === "string" ? { result: body.result } : {}),
  });
  return {
    async propose(input, options) {
      const body = await call(
        "",
        { method: "POST", body: JSON.stringify({ ...app, chains: input.chains, methods: input.methods }) },
        options,
      );
      return { ...state(body), sessionToken: String(body.session_token), pairingUri: String(body.pairing_uri) };
    },
    async state(session, options) {
      return state(await call(`/${session.sessionId}`, { method: "GET", token: session.sessionToken }, options));
    },
    async send(session, input, options) {
      const payload = JSON.stringify({ request_key: input.requestKey, method: input.method, params: input.params });
      return request(
        await call(
          `/${session.sessionId}/requests`,
          { method: "POST", token: session.sessionToken, body: payload },
          options,
        ),
      );
    },
    async result(session, requestId, options) {
      return request(
        await call(
          `/${session.sessionId}/requests/${encodeURIComponent(requestId)}`,
          { method: "GET", token: session.sessionToken },
          options,
        ),
      );
    },
    async cancel(session, requestId, options) {
      return request(
        await call(
          `/${session.sessionId}/requests/${encodeURIComponent(requestId)}/cancel`,
          { method: "POST", token: session.sessionToken, body: "{}" },
          options,
        ),
      );
    },
    async end(session, options) {
      await call(`/${session.sessionId}/end`, { method: "POST", token: session.sessionToken, body: "{}" }, options);
    },
  };
}
