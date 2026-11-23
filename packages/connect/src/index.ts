/**
 * @inverus/connect: the framework-independent TypeScript client for apps that sign people in
 * with Sanctum Connect.
 *
 * OpenID Connect authorization code flow with PKCE (S256), `state`, `nonce` and the RFC 9207
 * `iss` response parameter. ID tokens are checked for issuer, audience, expiry and nonce, and
 * also for their signature against the issuer's published keys. The protocol work is done by
 * oauth4webapi (MIT, pinned 3.8.8); this package adds Sanctum's profile checks and a small API.
 *
 * Needs fetch and WebCrypto. Supported on Node 22.15.1+ (`engines`; the packed tarball is
 * smoke-tested on 22.15.1 and 26.13.1) and current Chrome; other browsers are expected, not run
 * (support matrix in the README). A confidential client's secret belongs on a server; browser and
 * native apps are public clients (PKCE, no secret). Every network call takes an optional
 * AbortSignal; an abort rejects with SanctumConnectError code "aborted".
 */
import * as oauth from "oauth4webapi";
import { abortedBy, SanctumConnectError, throwIfAborted } from "./errors.ts";
import { WALLET_RDNS } from "./wallets.ts";

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
export interface CallOptions { signal?: AbortSignal }

/** Only loopback development relaxes https (oauth4webapi's marker for that, deprecated for anything else). */
type HttpOptions = {
  [oauth.allowInsecureRequests]?: true; [oauth.customFetch]?: (url: string, options: oauth.CustomFetchOptions<string, unknown>) => Promise<Response>; signal?: AbortSignal;
};

function httpOptions(config: SanctumConnectConfig): HttpOptions {
  const send = config.fetch;
  return {
    ...(config.allowInsecureLoopback === true ? { [oauth.allowInsecureRequests]: true as const } : {}),
    ...(send ? { [oauth.customFetch]: (url: string, init: oauth.CustomFetchOptions<string, unknown>) => send(url, init as RequestInit) } : {}),
  };
}

/** Kept by the app between starting and finishing sign-in (a server session or sessionStorage; never the URL). */
export interface SignInTransaction { state: string; nonce: string; codeVerifier: string; redirectUri: string; maxAge?: number }

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

export { SanctumConnectError, type SanctumConnectErrorCode } from "./errors.ts";

/** Rethrows the typed "aborted" error when the call's own signal fired, otherwise `fallback`. */
function failed(signal: AbortSignal | undefined, error: unknown, fallback: SanctumConnectError): SanctumConnectError {
  return abortedBy(signal, error) ?? fallback;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const signalOf = (options: CallOptions) => (options.signal ? { signal: options.signal } : {});

function checkUrl(value: string, what: string, allowInsecureLoopback: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SanctumConnectError("configuration", `${what} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && !(allowInsecureLoopback && url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new SanctumConnectError("configuration", `${what} must use https (http only on loopback with allowInsecureLoopback)`);
  }
  return url;
}

export class SanctumConnect {
  readonly #as: oauth.AuthorizationServer;
  readonly #client: oauth.Client;
  readonly #auth: oauth.ClientAuth;
  readonly #config: SanctumConnectConfig;
  readonly #http: HttpOptions;

  private constructor(as: oauth.AuthorizationServer, config: SanctumConnectConfig, http: HttpOptions) {
    this.#as = as;
    this.#config = config;
    this.#http = http;
    this.#client = { client_id: config.clientId, id_token_signed_response_alg: "ES256" };
    this.#auth = config.clientSecret ? oauth.ClientSecretBasic(config.clientSecret) : oauth.None();
  }

  /** Fetches and checks the issuer's metadata. Refuses a server that lacks what this SDK relies on. */
  static async discover(config: SanctumConnectConfig, options: CallOptions = {}): Promise<SanctumConnect> {
    const insecure = config.allowInsecureLoopback === true;
    const issuer = checkUrl(config.issuer, "issuer", insecure);
    if (issuer.origin !== config.issuer) throw new SanctumConnectError("configuration", "issuer must be an origin without path or trailing slash");
    checkUrl(config.redirectUri, "redirectUri", true);
    if (!config.clientId) throw new SanctumConnectError("configuration", "clientId is required");
    const http = httpOptions(config);
    let as: oauth.AuthorizationServer;
    try {
      throwIfAborted(options.signal);
      as = await oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer, { ...http, ...signalOf(options), algorithm: "oidc" }));
    } catch (error) {
      throw failed(options.signal, error, new SanctumConnectError("discovery", "The issuer's OpenID configuration could not be loaded or does not name this issuer", { cause: error }));
    }
    const missing = [
      !as.code_challenge_methods_supported?.includes("S256") && "PKCE S256",
      !as.id_token_signing_alg_values_supported?.includes("ES256") && "ES256 ID tokens",
      as.authorization_response_iss_parameter_supported !== true && "the iss response parameter",
      !as.authorization_endpoint && "an authorization endpoint",
      !as.token_endpoint && "a token endpoint",
      !as.jwks_uri && "a key set",
    ].filter(Boolean);
    if (missing.length) throw new SanctumConnectError("discovery", `The issuer doesn't offer ${missing.join(", ")}`);
    return new SanctumConnect(as, config, http);
  }

  get issuer(): string {
    return this.#as.issuer;
  }

  /**
   * The URL to send the person to, and the transaction to keep until they return. A `hint` says
   * how the person already chose to sign in (and which browser wallet); Sanctum's page opens that
   * way first. It proves nothing: Sanctum still authenticates the person itself.
   */
  async startSignIn(options: { scope?: string; prompt?: "login" | "consent" | "none"; maxAge?: number; hint?: SignInHint } = {}): Promise<{ url: URL; transaction: SignInTransaction }> {
    const hint = options.hint ? checkSignInHint(options.hint) : null;
    const codeVerifier = oauth.generateRandomCodeVerifier();
    const transaction: SignInTransaction = {
      state: oauth.generateRandomState(), nonce: oauth.generateRandomNonce(), codeVerifier, redirectUri: this.#config.redirectUri,
      ...(options.maxAge !== undefined ? { maxAge: options.maxAge } : {}),
    };
    const url = new URL(this.#as.authorization_endpoint!);
    const params: Record<string, string> = {
      client_id: this.#config.clientId, redirect_uri: this.#config.redirectUri, response_type: "code", scope: options.scope ?? this.#config.scope ?? "openid",
      code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier), code_challenge_method: "S256", state: transaction.state, nonce: transaction.nonce,
      ...(options.prompt ? { prompt: options.prompt } : {}), ...(options.maxAge !== undefined ? { max_age: String(options.maxAge) } : {}),
      ...(hint ? { sanctum_method: hint.method, ...(hint.wallet ? { sanctum_wallet: hint.wallet } : {}) } : {}),
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return { url, transaction };
  }

  /**
   * Checks the callback against the transaction, redeems the code and validates the ID token. An
   * abort after the request left may still have redeemed the code: start a new sign-in then.
   */
  async finishSignIn(callback: URL | string, transaction: SignInTransaction, options: CallOptions = {}): Promise<SignInResult> {
    let params: URLSearchParams;
    try {
      params = oauth.validateAuthResponse(this.#as, this.#client, new URL(callback), transaction.state);
    } catch (error) {
      if (error instanceof oauth.AuthorizationResponseError) {
        const code = error.error === "access_denied" ? "access_denied" : error.error === "login_required" || error.error === "interaction_required" ? "login_required" : error.error === "consent_required" ? "consent_required" : "invalid_response";
        throw new SanctumConnectError(code, `Sign-in was not completed: ${error.error}`, { cause: error });
      }
      throw new SanctumConnectError("invalid_response", "The callback doesn't belong to this sign-in (state or issuer mismatch)", { cause: error });
    }
    let result: oauth.TokenEndpointResponse;
    try {
      throwIfAborted(options.signal);
      const http = { ...this.#http, ...signalOf(options) };
      const response = await oauth.authorizationCodeGrantRequest(this.#as, this.#client, this.#auth, params, transaction.redirectUri, transaction.codeVerifier, http);
      result = await oauth.processAuthorizationCodeResponse(this.#as, this.#client, response, {
        expectedNonce: transaction.nonce, requireIdToken: true, ...(transaction.maxAge !== undefined ? { maxAge: transaction.maxAge } : {}),
      });
      // The ID token's signature against the issuer's published keys, not only TLS to the token endpoint.
      throwIfAborted(options.signal);
      await oauth.validateApplicationLevelSignature(this.#as, response, http);
      throwIfAborted(options.signal);
    } catch (error) {
      throw failed(options.signal, error, new SanctumConnectError("token_failed", "The code could not be redeemed or the ID token is invalid", { cause: error }));
    }
    const claims = oauth.getValidatedIdTokenClaims(result)!;
    return {
      subject: claims.sub, claims, idToken: result.id_token!, accessToken: result.access_token,
      ...(result.refresh_token ? { refreshToken: result.refresh_token } : {}), ...(result.expires_in !== undefined ? { expiresIn: result.expires_in } : {}), ...(result.scope ? { scope: result.scope } : {}),
    };
  }

  /** The person's userinfo; refuses a response for anyone but `expectedSubject`. */
  async userInfo(accessToken: string, expectedSubject: string, options: CallOptions = {}): Promise<oauth.UserInfoResponse> {
    try {
      throwIfAborted(options.signal);
      const http = { ...this.#http, ...signalOf(options) };
      return await oauth.processUserInfoResponse(this.#as, this.#client, expectedSubject, await oauth.userInfoRequest(this.#as, this.#client, accessToken, http));
    } catch (error) {
      throw failed(options.signal, error, new SanctumConnectError("token_failed", "Userinfo could not be read for this subject", { cause: error }));
    }
  }

  /** Exchanges a refresh token (rotated by Sanctum: keep only the newest). */
  async refresh(refreshToken: string, options: CallOptions = {}): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    try {
      throwIfAborted(options.signal);
      const response = await oauth.refreshTokenGrantRequest(this.#as, this.#client, this.#auth, refreshToken, { ...this.#http, ...signalOf(options) });
      const result = await oauth.processRefreshTokenResponse(this.#as, this.#client, response);
      return { accessToken: result.access_token, ...(result.refresh_token ? { refreshToken: result.refresh_token } : {}), ...(result.expires_in !== undefined ? { expiresIn: result.expires_in } : {}) };
    } catch (error) {
      throw failed(options.signal, error, new SanctumConnectError("token_failed", "The refresh token was refused", { cause: error }));
    }
  }

  async revoke(token: string, options: CallOptions = {}): Promise<void> {
    try {
      throwIfAborted(options.signal);
      await oauth.processRevocationResponse(await oauth.revocationRequest(this.#as, this.#client, this.#auth, token, { ...this.#http, ...signalOf(options) }));
    } catch (error) {
      throw failed(options.signal, error, new SanctumConnectError("token_failed", "The token could not be revoked", { cause: error }));
    }
  }

  /** Where to send the person to sign out of Sanctum for this app (RP-initiated logout). */
  signOutUrl(options: { idTokenHint: string; postLogoutRedirectUri?: string; state?: string }): URL {
    if (!this.#as.end_session_endpoint) throw new SanctumConnectError("discovery", "The issuer has no end-session endpoint");
    const url = new URL(this.#as.end_session_endpoint);
    url.searchParams.set("client_id", this.#config.clientId);
    url.searchParams.set("id_token_hint", options.idTokenHint);
    if (options.postLogoutRedirectUri) url.searchParams.set("post_logout_redirect_uri", options.postLogoutRedirectUri);
    if (options.state) url.searchParams.set("state", options.state);
    return url;
  }
}

/** How the person chose to sign in in the app; `wallet` is an EIP-6963 reverse-DNS id (only with method "wallet"). */
export interface SignInHint { method: "passkey" | "signup" | "wallet" | "bitcoin" | "sso" | "providers"; wallet?: string }

const HINT_METHODS = new Set(["passkey", "signup", "wallet", "bitcoin", "sso", "providers"]);

function checkSignInHint(hint: SignInHint): SignInHint {
  if (!HINT_METHODS.has(hint.method)) throw new SanctumConnectError("configuration", "Unknown sign-in hint method");
  if (hint.wallet !== undefined && (hint.method !== "wallet" || !WALLET_RDNS.test(hint.wallet))) {
    throw new SanctumConnectError("configuration", "A wallet hint must be a reverse-DNS id, with method \"wallet\"");
  }
  return hint;
}

export {
  PROVIDER_ERRORS, ProviderRpcError, sanctumTransport, transportError,
  type PairingProposal, type ProviderRpcErrorCode, type RequestState, type WalletSessionApp, type WalletSessionHandle, type WalletSessionMethod, type WalletSessionState, type WalletSessionTransport,
} from "./wallet-session.ts";
export { SanctumWalletProvider, type PendingWalletRequest, type WalletProviderEvents, type WalletProviderOptions } from "./wallet-session-provider.ts";
export { connectSanctumWallet, memoryWalletSessionStore, resumeSanctumWallet, type WalletSessionStore } from "./wallet-session-connect.ts";
export { registerAgentWithSanctum, type AgentRegistration } from "./agent-registration.ts";
export {
  agentResourceRequest, createDpopKey, exchangeAgentToken, requestAgentToken, type AgentAuthentication, type AgentHttpOptions, type AgentToken, type AgentTokenRequest, type DpopKeyPair, type ExchangedAgentToken, type ExchangeLimits,
} from "./agent-tokens.ts";
export {
  getPaymentStatus, newPaymentIdempotencyKey, proposePayment, sanctumPaymentsResource,
  type PaymentProposalOutcome, type PaymentProposalRequest, type PaymentStatus, type PaymentStatusRequest, type ProposedPayment,
} from "./agent-payments.ts";
export {
  searchWallets, WALLET_CATALOGUE, WALLET_RDNS, watchInjectedWallets,
  type CatalogueWallet, type ChainFamily, type InjectedWallet, type WalletSearchResult,
} from "./wallets.ts";
