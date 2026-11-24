/**
 * For agent runtimes: tokens for an agent's delegations, and calls with them.
 *
 *  - requestAgentToken: a token for one delegation (`grant_id`) at one resource server.
 *  - exchangeAgentToken: hand work to another agent of the same owner with OAuth 2.0 Token
 *    Exchange (RFC 8693). The receiving agent authenticates as itself and exchanges the token the
 *    first agent gave it for its own token, limited to the tools it asks for. Sanctum records a
 *    sub-delegation that never outlives the token given; nothing is refreshed.
 *  - DPoP (RFC 9449): with a key from createDpopKey, the token is bound to it and works only with a
 *    fresh proof by that key for each request (agentResourceRequest adds it). The private key is
 *    not extractable; keep the pair in the runtime, never in a prompt. A response that isn't bound
 *    when DPoP was asked for is refused. When a server asks for a nonce (`use_dpop_nonce`, RFC 9449
 *    §8 and §9), the request is sent once more with it; nonces are remembered per key and origin.
 *
 * The protocol work is oauth4webapi's (MIT, pinned 3.8.8), including the DPoP proofs.
 */
import * as oauth from "oauth4webapi";
import { abortedBy, SanctumConnectError, throwIfAborted } from "./errors.ts";

export const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
export const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const JWT_BEARER = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A DPoP key pair (ES256) from createDpopKey. */
export type DpopKeyPair = Awaited<ReturnType<typeof oauth.generateKeyPair>>;

/** How the agent authenticates: its client secret, or a client assertion it signed for this request. */
export type AgentAuthentication = { clientId: string; clientSecret: string } | { clientAssertion: string };

export interface AgentHttpOptions {
  fetch?: typeof fetch;
  /** Loopback development only: allows http:// on localhost or 127.0.0.1. */
  allowInsecureLoopback?: boolean;
  /** Seconds to add to this machine's clock when signing proofs, if it is known to be off. */
  clockSkewSeconds?: number;
  /** Cancels the call; it then rejects with SanctumConnectError code "aborted". */
  signal?: AbortSignal;
}

export interface AgentTokenRequest extends AgentHttpOptions {
  issuer: string;
  auth: AgentAuthentication;
  resource: string;
  /** Binds the token to this key (DPoP). */
  dpop?: DpopKeyPair;
}

export interface AgentToken {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer" | "DPoP";
}

/** Lower limits for a token-exchange sub-delegation (RFC 9396 §6.2); each must be within the delegation's. */
export interface ExchangeLimits {
  calls?: number;
  spend?: { asset: string; amount: string };
  recipients?: string[];
  durationHours?: number;
}

/** One `sanctum_delegation` authorization detail asking for less than the delegation allows. */
export function narrowing(resource: string, tools: string[], limits: ExchangeLimits = {}): string {
  const bounds = {
    ...(limits.calls !== undefined ? { calls: limits.calls } : {}),
    ...(limits.spend ? { spend: limits.spend } : {}),
  };
  return JSON.stringify([
    {
      type: "sanctum_delegation",
      locations: [resource],
      actions: tools,
      ...(Object.keys(bounds).length ? { limits: bounds } : {}),
      ...(limits.recipients ? { recipients: limits.recipients } : {}),
      ...(limits.durationHours !== undefined ? { duration_hours: limits.durationHours } : {}),
    },
  ]);
}
export interface ExchangedAgentToken extends AgentToken {
  tools: string[];
}

/** A DPoP key pair (ES256) for an agent runtime; the private key can't be exported. */
export function createDpopKey(): Promise<DpopKeyPair> {
  return oauth.generateKeyPair("ES256");
}

export function loopbackOnly(value: string, options: AgentHttpOptions, what: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(options.allowInsecureLoopback && url.protocol === "http:" && LOOPBACK.has(url.hostname))
  ) {
    throw new SanctumConnectError(
      "configuration",
      `${what} must use https (http only on loopback with allowInsecureLoopback)`,
    );
  }
  return url;
}

/** One DPoP handle per key, so the nonces servers hand out (cached per origin) carry over between calls. */
const handles = new WeakMap<DpopKeyPair, oauth.DPoPHandle>();
function dpopHandle(client: oauth.Client, key: DpopKeyPair): oauth.DPoPHandle {
  let handle = handles.get(key);
  if (!handle) {
    handle = oauth.DPoP(client, key);
    handles.set(key, handle);
  }
  return handle;
}

export function http(options: AgentHttpOptions, dpop: DpopKeyPair | undefined, client: oauth.Client) {
  const send = options.fetch;
  return {
    ...(send
      ? {
          [oauth.customFetch]: (url: string, init: oauth.CustomFetchOptions<string, unknown>) =>
            send(url, init as RequestInit),
        }
      : {}),
    ...(options.allowInsecureLoopback ? { [oauth.allowInsecureRequests]: true as const } : {}),
    ...(dpop ? { DPoP: dpopHandle(client, dpop) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

/** Sends a request once more when the server asked for a DPoP nonce; the handle now has it. */
async function withNonce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (oauth.isDPoPNonceError(error)) return run();
    throw error;
  }
}

function clientFor(options: AgentTokenRequest) {
  throwIfAborted(options.signal);
  const issuer = loopbackOnly(options.issuer, options, "The issuer");
  const auth = options.auth;
  const client: oauth.Client = {
    client_id: "clientSecret" in auth ? auth.clientId : "agent",
    ...(options.clockSkewSeconds ? { [oauth.clockSkew]: options.clockSkewSeconds } : {}),
  };
  const clientAuth: oauth.ClientAuth =
    "clientSecret" in auth
      ? oauth.ClientSecretBasic(auth.clientSecret)
      : (_as, _client, body) => {
          body.set("client_assertion_type", JWT_BEARER);
          body.set("client_assertion", auth.clientAssertion);
        };
  const as: oauth.AuthorizationServer = { issuer: issuer.origin, token_endpoint: `${issuer.origin}/token` };
  return { as, client, clientAuth, options: http(options, options.dpop, client) };
}

export async function tokenAnswer(
  what: string,
  dpop: boolean,
  signal: AbortSignal | undefined,
  run: () => Promise<oauth.TokenEndpointResponse>,
): Promise<oauth.TokenEndpointResponse> {
  let answer;
  try {
    answer = await withNonce(run);
  } catch (error) {
    const aborted = abortedBy(signal, error);
    if (aborted) throw aborted;
    if (error instanceof oauth.ResponseBodyError)
      throw new SanctumConnectError("token_failed", `${what} was refused (${error.error_description ?? error.error})`, {
        cause: error,
      });
    throw new SanctumConnectError("token_failed", `${what} failed`, { cause: error });
  }
  if (dpop && answer.token_type !== "dpop")
    throw new SanctumConnectError("token_failed", `${what} returned a token that isn't bound to the DPoP key`);
  return answer;
}

export const tokenOf = (answer: oauth.TokenEndpointResponse): AgentToken => ({
  accessToken: answer.access_token,
  expiresIn: Number(answer.expires_in ?? 0),
  tokenType: answer.token_type === "dpop" ? "DPoP" : "Bearer",
});

/**
 * A token for the delegation `grantId` at `resource` (client credentials, Sanctum's agent profile).
 * `tools` limits this token to some of the delegation's tools (RFC 9396 §6.2).
 */
export async function requestAgentToken(
  request: AgentTokenRequest & { grantId: string; tools?: string[] },
): Promise<AgentToken> {
  const { as, client, clientAuth, options } = clientFor(request);
  const parameters = {
    resource: request.resource,
    grant_id: request.grantId,
    ...(request.tools ? { authorization_details: narrowing(request.resource, request.tools) } : {}),
  };
  const answer = await tokenAnswer("The token request", Boolean(request.dpop), request.signal, async () =>
    oauth.processClientCredentialsResponse(
      as,
      client,
      await oauth.clientCredentialsGrantRequest(as, client, clientAuth, parameters, options),
    ),
  );
  return tokenOf(answer);
}

/**
 * Token exchange (RFC 8693). `tools` narrows the sub-delegation to some tools; `limits` also lowers
 * its call or spend limit, recipients or life (sent as authorization_details, which needs `tools`).
 */
export async function exchangeAgentToken(
  request: AgentTokenRequest & { subjectToken: string; tools?: string[]; limits?: ExchangeLimits },
): Promise<ExchangedAgentToken> {
  const { as, client, clientAuth, options } = clientFor(request);
  if (request.limits && !request.tools)
    throw new SanctumConnectError("configuration", "Narrowing limits needs the tools to hand over");
  const parameters = new URLSearchParams({
    subject_token: request.subjectToken,
    subject_token_type: ACCESS_TOKEN_TYPE,
    resource: request.resource,
  });
  if (request.limits)
    parameters.set("authorization_details", narrowing(request.resource, request.tools!, request.limits));
  else if (request.tools) parameters.set("scope", request.tools.join(" "));
  const answer = await tokenAnswer("Token exchange", Boolean(request.dpop), request.signal, async () =>
    oauth.processGenericTokenEndpointResponse(
      as,
      client,
      await oauth.genericTokenEndpointRequest(as, client, clientAuth, TOKEN_EXCHANGE_GRANT, parameters, options),
    ),
  );
  if (answer.issued_token_type !== ACCESS_TOKEN_TYPE)
    throw new SanctumConnectError("token_failed", "Token exchange returned another kind of token");
  return {
    ...tokenOf(answer),
    tools: String(answer.scope ?? "")
      .split(" ")
      .filter(Boolean),
  };
}

/**
 * Calls a resource with an agent token: `Authorization: Bearer`, or for a DPoP-bound token
 * `Authorization: DPoP` with a fresh proof by `dpop` (required then). Returns the response,
 * including a 401 with its challenge.
 */
export async function agentResourceRequest(
  request: AgentHttpOptions & {
    token: AgentToken;
    dpop?: DpopKeyPair;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<Response> {
  if (request.token.tokenType === "DPoP" && !request.dpop)
    throw new SanctumConnectError("configuration", "A DPoP-bound token needs its DPoP key");
  const url = loopbackOnly(request.url, request, "The resource");
  throwIfAborted(request.signal);
  const options = http(request, request.token.tokenType === "DPoP" ? request.dpop : undefined, {
    client_id: "agent",
    ...(request.clockSkewSeconds ? { [oauth.clockSkew]: request.clockSkewSeconds } : {}),
  });
  try {
    return await withNonce(() =>
      oauth.protectedResourceRequest(
        request.token.accessToken,
        request.method,
        url,
        new Headers(request.headers),
        request.body ?? null,
        options,
      ),
    );
  } catch (error) {
    if (error instanceof oauth.WWWAuthenticateChallengeError) return error.response;
    throw abortedBy(request.signal, error) ?? error;
  }
}
