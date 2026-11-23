# Changelog: @inverus/connect

Versions follow [Semantic Versioning](https://semver.org/). While the major version is 0, a minor release may break
the API (named under "Breaking"); patch releases don't. Pre-releases are `0.x.y-alpha.n`. `@inverus/connect` and
`@inverus/connect-react` are released together with the same version. See [release/RELEASING.md](release/RELEASING.md).

## 0.1.0-alpha.0 — release candidate

### Packaging

- Public packages are `@inverus/connect` and `@inverus/connect-react`. Emitted JavaScript, declarations and sibling dependencies use public names; workspace identities remain unchanged. Original sources remain embedded in source maps.

### Licensing

- Owner selected MIT for SDK code on 23 November 2026. Both license files and package metadata now record MIT. Publication remains locked until final reviewed publication under the owner-selected `@inverus` scope; third-party notices and brand-asset terms are unchanged.

### Added

- Browser-safe `./receipts` entry with `verifySignedReceipts`: validates untrusted export structure and requires the caller’s trusted issuer, owner and checkpoint keys. The existing server verifier shares its implementation. No automatic key discovery or authorization is inferred. Initial gzip budget 7,200 bytes (6,194 measured); isolated from the sign-in bundle.

- Agent payment helpers (Sanctum Payments, a simulator in this stage): `proposePayment` and `getPaymentStatus`
  over the agent payments resource with the agent's token (DPoP when the token is bound), `sanctumPaymentsResource`
  (the `resource` for `requestAgentToken`) and `newPaymentIdempotencyKey`. Each new proposal gets a fresh
  idempotency key; outcomes are typed (`requires_approval`, `approved` by a standing approval or the person,
  `refused` with Sanctum's deny-reason code, `unknown` with the key to retry with). A proposal is never retried with
  a new key. Types `PaymentProposalOutcome`, `PaymentProposalRequest`, `PaymentStatus`, `PaymentStatusRequest`,
  `ProposedPayment`, exported from `.`.
- `proposePayment` takes `timeoutMs` (default 30 000). A signal that fired before sending rejects with `aborted`, as
  every call does; once the proposal may have been sent, a timeout or cancellation is the `unknown` outcome instead
  of an error, because Sanctum may already have the payment.
- Wallet-session lifecycle (matrix W-08, W-09): `chainChanged` joins the provider's events; while anyone listens the
  provider reads the session's state every `watchMs` (default 15 s, 0.5 s to 2 min, doubling while Sanctum can't
  be reached) and emits `accountsChanged([])` and `disconnect` when the person disconnected, the app was withdrawn
  or the session expired. `pendingRequests()` and `cancelRequest(key)`; an aborted request is withdrawn at Sanctum
  (`WalletSessionTransport.cancel`, optional; `sanctumTransport` implements it). `wallet_switchEthereumChain` to the
  session's own chain answers null, to any other chain 4902 (`PROVIDER_ERRORS.unrecognizedChain`, reason
  `chain_not_approved`). `wallet_getCapabilities` is refused with 4200 `capabilities_unsupported`.
- Resume after a reload: `resumeSanctumWallet`, `WalletSessionStore` and `memoryWalletSessionStore` (the default:
  this page's memory only); `connectSanctumWallet` takes `store`, `storeKey` and `watchMs`. The token is never
  put in a URL. Types `PendingWalletRequest`, `WalletProviderOptions`, `WalletSessionHandle`.
- `transportError(status, error, reason)`, the typed error for transports other than Sanctum's.

### Changed

- `sanctumTransport` maps the server's `method_unsupported` to 4200 and `app_disabled` (403) to 4900.
- `RequestState.status` can be `cancelled` (the app withdrew the request) or `closed` (the session ended first);
  a closed request rejects with 4900 and disconnects the provider.
- `watchInjectedWallets` (also `./wallets`): a re-announcement of a known UUID with a new provider replaces the
  provider (keeping the first name and icon) and reports the list again; the same provider again is still ignored.

### Breaking (against 0.1.0-alpha.0, unpublished)

- `ProviderRpcErrorCode` has the new member 4902; exhaustive switches need a case for it.
- `SanctumWalletProvider`'s fourth constructor argument may be an options object (a number is still the poll interval).

## 0.1.0-alpha.0 (prepared 17 November 2026; not published)

First packaged pre-release. Nothing has been published to a registry.

### Added

- Built package: ESM JavaScript, `.d.ts` declarations and source maps (sources embedded), compiled by `tsc`; exports
  `.`, `./wallets` and `./qr` only, with `types` and `import` conditions; `sideEffects: false`; Node ≥ 22.15.1.
- `AbortSignal` on every network call: `SanctumConnect.discover(config, { signal })`, `finishSignIn`, `userInfo`,
  `refresh`, `revoke`, `registerAgentWithSanctum`, `requestAgentToken`, `exchangeAgentToken`,
  `agentResourceRequest`, and every `WalletSessionTransport` method. New error code `aborted`.
- `fetch` option on `SanctumConnectConfig`.
- `PROVIDER_ERRORS` and the `ProviderRpcErrorCode` type; `ProviderRpcError.data` (`{ status, error }`).
- EIP-1193 events on `SanctumWalletProvider`: `on`/`removeListener` for `accountsChanged` and `disconnect`
  (`WalletProviderEvents`).
- LICENSE (MIT), THIRD_PARTY_NOTICES.md (oauth4webapi 3.8.8 MIT, uqr 0.1.3 MIT).

### Changed

- `sanctumTransport` maps each HTTP failure to its own typed code. Before, every failure but 404 was 4100; now
  409 `session_inactive` is 4900, 429 is -32005, invalid requests are -32602, `method_not_approved` and 401/403 stay
  4100, server and network failures are -32603.
- A disconnected `SanctumWalletProvider` refuses further requests with 4900 and reports no accounts.

### Breaking (against the unpublished workspace 0.0.0)

- `ProviderRpcError.code` is the `ProviderRpcErrorCode` union instead of `number`, and apps that treated every
  wallet-session failure as 4100 must handle the new codes.
- `SanctumConnectErrorCode` has the new member `aborted`; exhaustive switches need a case for it.
- A cancelled `waitForClaim` rejects with `aborted` (it used to report `access_denied`).

### Known gaps

- MIT selected; publication remains locked until the reviewed public release.
