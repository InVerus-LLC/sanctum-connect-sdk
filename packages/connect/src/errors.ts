/**
 * The core SDK's error, with a stable `code` for apps to branch on. `aborted` means the caller's own
 * AbortSignal fired (not that a person or Sanctum refused anything).
 */
export type SanctumConnectErrorCode =
  | "configuration" | "discovery" | "access_denied" | "login_required" | "consent_required" | "invalid_response" | "token_failed" | "expired" | "aborted";

export class SanctumConnectError extends Error {
  readonly code: SanctumConnectErrorCode;
  constructor(code: SanctumConnectErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SanctumConnectError";
    this.code = code;
  }
}

/** Refuses to start a call whose signal already fired (a fetch that ignores signals would still send). */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SanctumConnectError("aborted", "Cancelled by the caller's AbortSignal", { cause: signal.reason });
}

/** The typed error for a call whose AbortSignal fired, or null when `signal` didn't abort. */
export function abortedBy(signal: AbortSignal | undefined, cause: unknown): SanctumConnectError | null {
  return signal?.aborted ? new SanctumConnectError("aborted", "Cancelled by the caller's AbortSignal", { cause }) : null;
}
