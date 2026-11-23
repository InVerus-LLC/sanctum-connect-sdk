/**
 * Stable errors for React apps: the core SDK's codes plus the few this package adds. Messages are
 * for developers; `describeError` gives a plain sentence to show people.
 */
import { PROVIDER_ERRORS, ProviderRpcError, SanctumConnectError, type ProviderRpcErrorCode, type SanctumConnectErrorCode } from "@inverus/connect";

export type SanctumReactErrorCode = SanctumConnectErrorCode
  /** The callback's sign-in isn't waiting in this tab: already completed, expired, replayed or from another tab. */
  | "transaction_missing"
  /** Used before discovery finished, outside a browser, or without a provider. */
  | "not_ready"
  /** A network or unexpected failure. */
  | "unexpected";

export class SanctumReactError extends Error {
  readonly code: SanctumReactErrorCode;
  constructor(code: SanctumReactErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SanctumReactError";
    this.code = code;
  }

  static from(error: unknown): SanctumReactError {
    if (error instanceof SanctumReactError) return error;
    if (error instanceof SanctumConnectError) return new SanctumReactError(error.code, error.message, { cause: error });
    return new SanctumReactError("unexpected", error instanceof Error ? error.message : "Unexpected failure", { cause: error });
  }
}

const SENTENCES: Partial<Record<SanctumReactErrorCode, string>> = {
  access_denied: "Sign-in was cancelled.",
  aborted: "Cancelled.",
  login_required: "Sign in to Sanctum to continue.",
  consent_required: "Sign-in needs your permission to continue.",
  transaction_missing: "This sign-in was already completed or has expired. Start again.",
  invalid_response: "This response belongs to another sign-in. Start again.",
  discovery: "Sanctum couldn’t be reached. Check your connection and try again.",
  not_ready: "Sanctum is still loading. Try again in a moment.",
};

const WALLET_SENTENCES: Record<ProviderRpcErrorCode, string> = {
  [PROVIDER_ERRORS.userRejected]: "The request was rejected or cancelled.",
  [PROVIDER_ERRORS.unauthorized]: "This app isn’t allowed to ask the wallet for that.",
  [PROVIDER_ERRORS.unsupportedMethod]: "Sanctum wallets don’t support that request.",
  [PROVIDER_ERRORS.disconnected]: "The wallet connection ended. Connect again.",
  [PROVIDER_ERRORS.unrecognizedChain]: "This wallet connection is for another network. Connect again to use this one.",
  [PROVIDER_ERRORS.invalidParams]: "The wallet request wasn’t valid.",
  [PROVIDER_ERRORS.limitExceeded]: "Too many wallet requests are waiting. Try again later.",
  [PROVIDER_ERRORS.internal]: "Sanctum couldn’t be reached. Try again.",
};

export function describeError(error: unknown): string {
  if (error instanceof ProviderRpcError) return WALLET_SENTENCES[error.code] ?? WALLET_SENTENCES[PROVIDER_ERRORS.disconnected];
  const code = SanctumReactError.from(error).code;
  return SENTENCES[code] ?? "Sign-in couldn’t be completed. Try again.";
}
