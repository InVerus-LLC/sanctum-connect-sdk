import * as oauth from "oauth4webapi";
import { abortedBy, SanctumConnectError } from "./errors.ts";
import { WALLET_RDNS } from "./wallets.ts";
import type { CallOptions, SanctumConnectConfig, SignInHint } from "./auth-types.ts";

/** Only loopback development relaxes https (oauth4webapi's marker for that, deprecated for anything else). */
export type HttpOptions = {
  [oauth.allowInsecureRequests]?: true;
  [oauth.customFetch]?: (url: string, options: oauth.CustomFetchOptions<string, unknown>) => Promise<Response>;
  signal?: AbortSignal;
};

export function httpOptions(config: SanctumConnectConfig): HttpOptions {
  const send = config.fetch;
  return {
    ...(config.allowInsecureLoopback === true ? { [oauth.allowInsecureRequests]: true as const } : {}),
    ...(send
      ? {
          [oauth.customFetch]: (url: string, init: oauth.CustomFetchOptions<string, unknown>) =>
            send(url, init as RequestInit),
        }
      : {}),
  };
}

/** Rethrows the typed "aborted" error when the call's own signal fired, otherwise `fallback`. */
export function failed(
  signal: AbortSignal | undefined,
  error: unknown,
  fallback: SanctumConnectError,
): SanctumConnectError {
  return abortedBy(signal, error) ?? fallback;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const signalOf = (options: CallOptions) => (options.signal ? { signal: options.signal } : {});

export function checkUrl(value: string, what: string, allowInsecureLoopback: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SanctumConnectError("configuration", `${what} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && !(allowInsecureLoopback && url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new SanctumConnectError(
      "configuration",
      `${what} must use https (http only on loopback with allowInsecureLoopback)`,
    );
  }
  return url;
}

const HINT_METHODS = new Set(["passkey", "signup", "wallet", "bitcoin", "sso", "providers"]);

export function checkSignInHint(hint: SignInHint): SignInHint {
  if (!HINT_METHODS.has(hint.method)) throw new SanctumConnectError("configuration", "Unknown sign-in hint method");
  if (hint.wallet !== undefined && (hint.method !== "wallet" || !WALLET_RDNS.test(hint.wallet))) {
    throw new SanctumConnectError("configuration", 'A wallet hint must be a reverse-DNS id, with method "wallet"');
  }
  return hint;
}
