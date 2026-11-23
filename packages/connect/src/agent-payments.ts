/**
 * For agent runtimes: propose payments to Sanctum Payments (a simulator in this stage; no real
 * money) and read their status, with the agent's token for that resource: requestAgentToken with
 * `resource: sanctumPaymentsResource(issuer)` and the delegation's `grantId`, and the same DPoP key
 * when the token is bound to one (agentResourceRequest signs each call).
 *
 * Each proposal carries an idempotency key, generated here for a new proposal unless the caller
 * gives one. Sanctum binds the key to the agent and the exact payment: the same key again returns
 * the same payment, never a second one, and a changed payment under it is refused. When no answer
 * arrives (timeout, network failure, cancellation after sending, a server error) the outcome is
 * `unknown` with the key: retry with that key, never a new one. The SDK never retries a proposal
 * with a new key.
 */
import * as oauth from "oauth4webapi";
import { agentResourceRequest, type AgentHttpOptions, type AgentToken, type DpopKeyPair } from "./agent-tokens.ts";
import { SanctumConnectError, throwIfAborted } from "./errors.ts";

export type PaymentStatus = "requires_approval" | "approved" | "submitted" | "settled" | "failed" | "unknown" | "review_required" | "reversed" | "rejected" | "expired";
const STATUSES = new Set<string>(["requires_approval", "approved", "submitted", "settled", "failed", "unknown", "review_required", "reversed", "rejected", "expired"]);
const KEY = /^[A-Za-z0-9_-]{16,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CODE = /^[a-z][a-z0-9_]{0,79}$/u;

export interface ProposedPayment { id: string; status: PaymentStatus; operationHash: string; approvalUrl: string }

export type PaymentProposalOutcome =
  /** Waiting for the person, who approves at `payment.approvalUrl`. */
  | { outcome: "requires_approval"; idempotencyKey: string; replayed: boolean; payment: ProposedPayment }
  /** Approved: at once by the person's standing approval, or (for a repeated key) by the person earlier. */
  | { outcome: "approved"; approvedBy: "standing_approval" | "person"; idempotencyKey: string; replayed: boolean; payment: ProposedPayment }
  /**
   * Not accepted. `reason` is Sanctum's code, such as `recipient_mismatch`, `spend_limit_reached`,
   * `idempotency_key_reused` or `invalid_token`; or `rejected`/`expired` with `payment` when an
   * earlier proposal under this key was declined by the person or expired.
   */
  | { outcome: "refused"; reason: string; httpStatus: number; idempotencyKey: string; payment?: ProposedPayment }
  /** No answer: Sanctum may or may not have the proposal. Retry with `idempotencyKey`, never a new key. */
  | { outcome: "unknown"; cause: "timeout" | "aborted" | "network" | "server_error" | "rate_limited" | "invalid_response"; idempotencyKey: string };

export interface PaymentProposalRequest extends AgentHttpOptions {
  issuer: string; token: AgentToken; dpop?: DpopKeyPair;
  /** A recipient the delegation allows, for example "sim:paper-shop". */
  recipient: string;
  /** A decimal amount with at most two places, for example "20.00". */
  amount: string;
  memo?: string;
  /** Only to retry: the key of an earlier proposal (an `unknown` outcome's). New proposals get a fresh one. */
  idempotencyKey?: string;
  /** Milliseconds to wait for Sanctum's answer before the outcome is `unknown` (default 30 000). */
  timeoutMs?: number;
}

export interface PaymentStatusRequest extends AgentHttpOptions { issuer: string; token: AgentToken; dpop?: DpopKeyPair; paymentId: string }

/** The resource URI of Sanctum Payments at `issuer`: the `resource` for the agent's token. */
export function sanctumPaymentsResource(issuer: string): string {
  return `${new URL(issuer).origin}/payments/agent`;
}

/** A fresh idempotency key (32 random bytes, base64url). Keep it with the proposal until Sanctum answers. */
export function newPaymentIdempotencyKey(): string {
  return oauth.generateRandomState();
}

const transport = (request: AgentHttpOptions): AgentHttpOptions => ({
  ...(request.fetch ? { fetch: request.fetch } : {}), ...(request.allowInsecureLoopback ? { allowInsecureLoopback: true } : {}),
  ...(request.clockSkewSeconds ? { clockSkewSeconds: request.clockSkewSeconds } : {}),
});

function proposed(answer: Record<string, unknown>): ProposedPayment | null {
  const { id, status, operation_hash: operationHash, approval_url: approvalUrl } = answer;
  if (typeof id !== "string" || typeof status !== "string" || !STATUSES.has(status) || typeof operationHash !== "string" || typeof approvalUrl !== "string") return null;
  return { id, status: status as PaymentStatus, operationHash, approvalUrl };
}

/** Proposes a payment under the agent's delegation; the person (or their standing approval) decides. */
export async function proposePayment(request: PaymentProposalRequest): Promise<PaymentProposalOutcome> {
  const idempotencyKey = request.idempotencyKey ?? newPaymentIdempotencyKey();
  if (!KEY.test(idempotencyKey)) throw new SanctumConnectError("configuration", "An idempotency key is 16 to 128 of A-Z, a-z, 0-9, _ and -");
  throwIfAborted(request.signal);
  const timeout = AbortSignal.timeout(request.timeoutMs ?? 30_000);
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
  const body = JSON.stringify({ recipient: request.recipient, amount: request.amount, ...(request.memo !== undefined ? { memo: request.memo } : {}), idempotency_key: idempotencyKey });
  let response: Response;
  let answer: Record<string, unknown> | null;
  try {
    response = await agentResourceRequest({
      ...transport(request), signal, token: request.token, ...(request.dpop ? { dpop: request.dpop } : {}),
      method: "POST", url: `${sanctumPaymentsResource(request.issuer)}/v1/intents`, headers: { "content-type": "application/json" }, body,
    });
    answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  } catch (error) {
    if (error instanceof SanctumConnectError && error.code === "configuration") throw error;
    return { outcome: "unknown", cause: request.signal?.aborted ? "aborted" : timeout.aborted ? "timeout" : "network", idempotencyKey };
  }
  if (response.status === 429) return { outcome: "unknown", cause: "rate_limited", idempotencyKey };
  if (response.status >= 500) return { outcome: "unknown", cause: "server_error", idempotencyKey };
  if (response.status === 200 || response.status === 201) {
    const payment = answer ? proposed(answer) : null;
    if (!payment || (answer!.approval !== "person" && answer!.approval !== "standing_approval")) return { outcome: "unknown", cause: "invalid_response", idempotencyKey };
    const replayed = response.status === 200;
    if (answer!.approval === "standing_approval") return { outcome: "approved", approvedBy: "standing_approval", idempotencyKey, replayed, payment };
    if (payment.status === "requires_approval") return { outcome: "requires_approval", idempotencyKey, replayed, payment };
    if (payment.status === "rejected" || payment.status === "expired") return { outcome: "refused", reason: payment.status, httpStatus: response.status, idempotencyKey, payment };
    return { outcome: "approved", approvedBy: "person", idempotencyKey, replayed, payment };
  }
  if (response.status >= 400) {
    const code = [answer?.reason, answer?.error].find((value): value is string => typeof value === "string" && CODE.test(value));
    return { outcome: "refused", reason: code ?? `http_${response.status}`, httpStatus: response.status, idempotencyKey };
  }
  return { outcome: "unknown", cause: "invalid_response", idempotencyKey };
}

/** A payment this agent proposed (null when it is not this agent's or doesn't exist). */
export async function getPaymentStatus(request: PaymentStatusRequest): Promise<{ id: string; status: PaymentStatus; failureReason: string | null } | null> {
  if (!UUID.test(request.paymentId)) throw new SanctumConnectError("configuration", "A payment id is a UUID");
  const response = await agentResourceRequest({
    ...transport(request), ...(request.signal ? { signal: request.signal } : {}), token: request.token, ...(request.dpop ? { dpop: request.dpop } : {}),
    method: "GET", url: `${sanctumPaymentsResource(request.issuer)}/v1/intents/${request.paymentId}`,
  });
  if (response.status === 404) return null;
  const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.status === 401 || response.status === 403) throw new SanctumConnectError("access_denied", `The status read was refused (${String(answer?.reason ?? answer?.error ?? response.status)})`);
  const { id, status, failure_reason: failureReason } = answer ?? ({} as Record<string, unknown>);
  if (response.status !== 200 || id !== request.paymentId || typeof status !== "string" || !STATUSES.has(status) || (failureReason !== null && typeof failureReason !== "string")) {
    throw new SanctumConnectError("invalid_response", "Sanctum Payments answered the status read unexpectedly");
  }
  return { id, status: status as PaymentStatus, failureReason: failureReason as string | null };
}
