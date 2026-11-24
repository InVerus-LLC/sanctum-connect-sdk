/**
 * For agent runtimes: register with Sanctum using only a public key, show the operator the code,
 * and wait until a person (or an organization's administrator) claims the agent. The private key
 * never leaves the runtime; afterwards the agent authenticates with signed assertions (RFC 7523)
 * as the returned client ID, and has no access until someone delegates it some.
 * `signal` cancels the registration request ("aborted"); a cancelled `waitForClaim` rejects with
 * "aborted" ("Cancelled"), like every other cancelled call.
 */
import { abortedBy, SanctumConnectError } from "./errors.ts";

export interface AgentRegistration {
  /** For the operator to type into Sanctum, for example "WDJB-MJHT". */
  userCode: string;
  verificationUri: string;
  /** Opens Sanctum's claim page with the code filled in (it travels in the URL fragment). */
  verificationUriComplete: string;
  expiresAt: Date;
  /** Polls until the agent is claimed; rejects with code "access_denied", "expired" or, when cancelled, "aborted". */
  waitForClaim(options?: { signal?: AbortSignal }): Promise<{ clientId: string; ownerKind: "person" | "organization" }>;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export async function registerAgentWithSanctum(options: {
  issuer: string;
  name: string;
  publicKey: Record<string, unknown>;
  fetch?: typeof fetch;
  allowInsecureLoopback?: boolean;
  signal?: AbortSignal;
}): Promise<AgentRegistration> {
  const issuer = new URL(options.issuer);
  if (
    issuer.protocol !== "https:" &&
    !(options.allowInsecureLoopback && issuer.protocol === "http:" && LOOPBACK.has(issuer.hostname))
  ) {
    throw new SanctumConnectError(
      "configuration",
      "The issuer must use https (http only on loopback with allowInsecureLoopback)",
    );
  }
  if ("d" in options.publicKey)
    throw new SanctumConnectError("configuration", "Send the public key only; the private key stays with the agent");
  const call = options.fetch ?? fetch;
  const post = (path: string, body: unknown, signal?: AbortSignal) =>
    call(`${issuer.origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      ...(signal ? { signal } : {}),
    });
  let response: Response;
  try {
    if (options.signal?.aborted) throw options.signal.reason;
    response = await post(
      "/agent/v1/registrations",
      { name: options.name, public_key: options.publicKey },
      options.signal,
    );
  } catch (error) {
    throw abortedBy(options.signal, error) ?? error;
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status !== 201 || typeof body.device_code !== "string" || typeof body.user_code !== "string") {
    throw new SanctumConnectError(
      "configuration",
      `Registration was refused (${String(body.reason ?? body.error ?? response.status)})`,
    );
  }
  const deviceCode = body.device_code;
  let intervalMs = Number(body.interval ?? 5) * 1000;
  return {
    userCode: body.user_code,
    verificationUri: String(body.verification_uri),
    verificationUriComplete: String(body.verification_uri_complete),
    expiresAt: new Date(Date.now() + Number(body.expires_in ?? 600) * 1000),
    async waitForClaim({ signal } = {}) {
      for (;;) {
        await new Promise<void>((resolve, reject) => {
          if (signal?.aborted) return reject(new SanctumConnectError("aborted", "Cancelled"));
          const timer = setTimeout(resolve, intervalMs);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new SanctumConnectError("aborted", "Cancelled"));
            },
            { once: true },
          );
        });
        const polled = await post("/agent/v1/registrations/poll", { device_code: deviceCode }, signal).catch(
          (error: unknown) => {
            throw signal?.aborted ? new SanctumConnectError("aborted", "Cancelled", { cause: error }) : error;
          },
        );
        const answer = (await polled.json().catch(() => ({}))) as Record<string, unknown>;
        if (polled.ok && typeof answer.client_id === "string")
          return {
            clientId: answer.client_id,
            ownerKind: answer.owner_kind === "organization" ? "organization" : "person",
          };
        if (answer.error === "authorization_pending") continue;
        if (answer.error === "slow_down") {
          intervalMs += 5_000;
          continue;
        }
        if (answer.error === "access_denied") throw new SanctumConnectError("access_denied", "The claim was denied");
        throw new SanctumConnectError("expired", "The registration expired or was already used; register again");
      }
    },
  };
}
