/**
 * @sanctum.ai/connect: the framework-independent TypeScript client for apps that sign people in
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
export { SanctumConnect } from "./auth-client.ts";
export type { CallOptions, SanctumConnectConfig, SignInHint, SignInResult, SignInTransaction } from "./auth-types.ts";
export { SanctumConnectError, type SanctumConnectErrorCode } from "./errors.ts";

export {
  PROVIDER_ERRORS,
  ProviderRpcError,
  sanctumTransport,
  transportError,
  type PairingProposal,
  type ProviderRpcErrorCode,
  type RequestState,
  type WalletSessionApp,
  type WalletSessionHandle,
  type WalletSessionMethod,
  type WalletSessionState,
  type WalletSessionTransport,
} from "./wallet-session.ts";
export {
  SanctumWalletProvider,
  type PendingWalletRequest,
  type WalletProviderEvents,
  type WalletProviderOptions,
} from "./wallet-session-provider.ts";
export {
  connectSanctumWallet,
  memoryWalletSessionStore,
  resumeSanctumWallet,
  type WalletSessionStore,
} from "./wallet-session-connect.ts";
export { registerAgentWithSanctum, type AgentRegistration } from "./agent-registration.ts";
export {
  agentResourceRequest,
  createDpopKey,
  exchangeAgentToken,
  requestAgentToken,
  type AgentAuthentication,
  type AgentHttpOptions,
  type AgentToken,
  type AgentTokenRequest,
  type DpopKeyPair,
  type ExchangedAgentToken,
  type ExchangeLimits,
} from "./agent-tokens.ts";
export {
  getPaymentStatus,
  newPaymentIdempotencyKey,
  proposePayment,
  sanctumPaymentsResource,
  type PaymentProposalOutcome,
  type PaymentProposalRequest,
  type PaymentStatus,
  type PaymentStatusRequest,
  type ProposedPayment,
} from "./agent-payments.ts";
export {
  searchWallets,
  WALLET_CATALOGUE,
  WALLET_RDNS,
  watchInjectedWallets,
  type CatalogueWallet,
  type ChainFamily,
  type InjectedWallet,
  type WalletSearchResult,
} from "./wallets.ts";
