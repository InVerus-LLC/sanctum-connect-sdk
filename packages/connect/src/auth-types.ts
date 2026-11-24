import type * as oauth from "oauth4webapi";

export interface SanctumConnectConfig {
  /** The Sanctum issuer, an origin such as https://id.example.com. */
  issuer: string;
  clientId: string;
  /** Exactly as registered. */
  redirectUri: string;
  /** Confidential (server-side) clients only. Never ship a secret to a browser or native app. */
  clientSecret?: string;
  /** Default "openid". */
  scope?: string;
  /** Loopback development only: allows an http:// issuer on localhost or 127.0.0.1. */
  allowInsecureLoopback?: boolean;
  /** A fetch implementation to use instead of the global one (tests, proxies, instrumentation). */
  fetch?: typeof fetch;
}

/** Per-call options for calls that reach the network. */
export interface CallOptions {
  signal?: AbortSignal;
}

/** Kept by the app between starting and finishing sign-in (a server session or sessionStorage; never the URL). */
export interface SignInTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  maxAge?: number;
}

export interface SignInResult {
  /** The pairwise subject Sanctum issues for this app; stable per person and app. */
  subject: string;
  claims: oauth.IDToken;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

/** How the person chose to sign in in the app; `wallet` is an EIP-6963 reverse-DNS id (only with method "wallet"). */
export interface SignInHint {
  method: "passkey" | "signup" | "wallet" | "bitcoin" | "sso" | "providers";
  wallet?: string;
}
