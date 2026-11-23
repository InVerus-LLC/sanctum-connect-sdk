# @inverus/connect

The framework-independent TypeScript SDK for apps that sign people in with Sanctum Connect, connect to a person's
Sanctum wallet, and run agents. React bindings are [`@inverus/connect-react`](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect-react/README.md); native SDKs
are not built yet.

Under the hood it is OpenID Connect's authorization code flow with PKCE (S256), `state`, `nonce` and the RFC 9207 `iss`
response parameter. Protocol work is done by [oauth4webapi](https://github.com/panva/oauth4webapi) 3.8.8 (MIT, by the
author of `openid-client`). This package adds Sanctum's profile checks and a small API; it doesn't re-implement OAuth.

**Alpha: `0.1.0-alpha.0` (`next` tag).** APIs may change. A configured Sanctum Connect issuer and registered client are required; installing this SDK does not provision a hosted service. Native mobile and WalletConnect/Reown transport are not included.

## Install

```sh
npm install @inverus/connect@next
```

React bindings require React 19. Use ESM imports; CommonJS `require()` is not exported.
Check the [npm package](https://www.npmjs.com/package/@inverus/connect) for available versions.

## Before you start

Obtain a compatible issuer origin and client ID. Register the exact callback and
post-logout URLs for each environment. Browser apps use public clients with PKCE
and no secret; confidential-client secrets belong only on your server. All example
domains are placeholders. Passkeys, social providers and SSO are configured at the
issuer and completed on its hosted pages, not by these package controls.

## Entry points

| Import | Contents | Pulls in |
| --- | --- | --- |
| `@inverus/connect` | `SanctumConnect` (sign-in, userinfo, refresh, revoke, sign-out URL), wallet sessions, agent registration and tokens, errors | oauth4webapi (checked: no uqr) |
| `@inverus/connect/wallets` | EIP-6963 discovery, the wallet catalogue and search | nothing else (checked: no oauth4webapi, no uqr) |
| `@inverus/connect/qr` | `qrModules`, `qrTerminal` | uqr only (checked: no oauth4webapi) |
| `@inverus/connect/receipts` | Signed receipt export verification with trusted owner/issuer/keys | jose (checked: no oauth4webapi, uqr or pg) |
| `@inverus/connect/workloads` | `requestWorkloadToken` for existing workload trusts and delegations | oauth4webapi (checked: no jose, uqr or pg) |

There are no other entry points: internals and source are not exported, and the package is ESM only (`import`, not
`require`).

## Sign-in flow

The following is a flow outline across two requests, not a standalone HTTP handler.
Save and consume the transaction in your session adapter; `request` is your callback
request. The [Node example](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/examples/node-server/README.md) supplies the complete wiring.


```ts
import { SanctumConnect } from "@inverus/connect";

const sanctum = await SanctumConnect.discover({
  issuer: "https://id.example.com",
  clientId: process.env.SANCTUM_CLIENT_ID!,
  clientSecret: process.env.SANCTUM_CLIENT_SECRET, // server-side apps only
  redirectUri: "https://app.example.com/callback",
}, { signal: AbortSignal.timeout(10_000) });

// 1. Start: keep the transaction in your server session (never in the URL), then redirect.
const { url, transaction } = await sanctum.startSignIn();

// 2. On the callback: checks state, issuer, PKCE, nonce and the ID token's signature.
const result = await sanctum.finishSignIn(request.url, transaction, { signal: AbortSignal.timeout(10_000) });
result.subject; // the pairwise subject Sanctum issues for this app

// Later
await sanctum.userInfo(result.accessToken, result.subject);
if (result.refreshToken) {
  const next = await sanctum.refresh(result.refreshToken);
  // Store the rotated token atomically; never reuse the old refresh token.
}
const signOut = sanctum.signOutUrl({ idTokenHint: result.idToken, postLogoutRedirectUri: "https://app.example.com/" });
```

`startSignIn({ hint: { method: "wallet", wallet: "io.metamask" } })` passes the person's choice to Sanctum's page
(`sanctum_method`, `sanctum_wallet`); a hint proves nothing and grants nothing.

## Errors, cancellation and events

Every call that reaches the network takes an optional `AbortSignal` (`{ signal }` as the last argument, or `signal` in
the agent helpers' options). A signal that already fired sends nothing; an abort rejects with code `aborted`. A
`fetch` option lets tests, proxies or instrumentation replace the global one.

Errors are `SanctumConnectError` with a stable `code`:

| Code | Meaning |
| --- | --- |
| `configuration` | Bad issuer, redirect URI, client ID or hint |
| `discovery` | The issuer's metadata couldn't be loaded, named another issuer, or lacked S256 PKCE, ES256 ID tokens or the `iss` parameter |
| `access_denied`, `login_required`, `consent_required` | The person didn't complete sign-in (or an agent claim was denied) |
| `invalid_response` | The callback belongs to another sign-in or issuer |
| `token_failed` | A token request failed or a token didn't validate |
| `expired` | An agent registration expired or was used |
| `aborted` | The caller's own `AbortSignal` fired |

An abort after the code exchange left may still have redeemed the code: start a new sign-in. `waitForClaim` reports
its own cancellation as `access_denied` ("Cancelled"), as before; that will move to `aborted` with its test.

Wallet sessions (`connectSanctumWallet`, `resumeSanctumWallet`, `SanctumWalletProvider`, `sanctumTransport`) are
EIP-1193 providers. Their errors are `ProviderRpcError` with typed codes (`PROVIDER_ERRORS`), Sanctum's `reason` and
`data: { status, error }`:

| Code | When |
| --- | --- |
| 4001 `userRejected` | The person rejected or didn't answer, or the caller aborted (`reason: "aborted"`) |
| 4100 `unauthorized` | Not authorized, including a method the session didn't approve (`method_not_approved`) |
| 4200 `unsupportedMethod` | Anything but the methods below (`method_unsupported`, also from the server); `wallet_getCapabilities` (`capabilities_unsupported`: no EIP-5792 capability) |
| 4900 `disconnected` | The session ended, expired, was withdrawn by the app's developer or is unknown (`session_inactive`), or the app is disabled (`app_disabled`) |
| 4902 `unrecognizedChain` | `wallet_switchEthereumChain` to another chain than the session's (`chain_not_approved`): connect again |
| -32602 `invalidParams` | A malformed request, a reused request key, or a request Sanctum won't sign (see below; `reason` says which) |
| -32005 `limitExceeded` | Too many proposals or waiting requests (`proposal_limit`, `request_limit`) |
| -32603 `internal` | Sanctum failed or couldn't be reached (`network_error`) |

Methods: `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `personal_sign`, `eth_signTypedData_v4` and
`wallet_switchEthereumChain` to the session's own chain (a session holds one wallet on one network). The provider
emits `accountsChanged` (`[]`), `chainChanged` and `disconnect` once (`provider.on(…)`, `provider.removeListener(…)`;
typed by `WalletProviderEvents`). While anyone listens it reads the session's state every `watchMs` (default 15 s,
0.5 s to 2 min, doubling while Sanctum can't be reached), so a Disconnect on Sanctum's Wallets page, a withdrawn app
or an expiry reaches the app without a request; there is no push channel. `pendingRequests()` lists the requests
still waiting for the person and `cancelRequest(key)` (or the request's AbortSignal) withdraws one at Sanctum.

What a session signs (security review round 4): `personal_sign` of readable text only (raw bytes, such as a 32-byte
hash, are refused: `raw_bytes_refused`), and `eth_signTypedData_v4` of off-chain typed data only (a domain naming a
`verifyingContract` is `contract_typed_data_refused`; the domain must commit to the session's chain,
`typed_domain_invalid`). Sign-In with Ethereum messages are refused (`siwe_origin_unverified` for one bound to the
session): the origin a session records is the one the app's calls state, which Sanctum shows the person as stated by
the app (`originVerified: false`), and no browser-bound proof of it exists yet. Sign people in with `SanctumConnect`
instead. This wallet provider does not execute value transfers; payment execution is a separate service contract.

Resume after a reload: `connectSanctumWallet` remembers the session in a `store` (`get`/`set`/`remove`), by default
`memoryWalletSessionStore()` in this page's memory, so a reload starts over; `resumeSanctumWallet({ transport, store })`
returns the provider while the session is active and forgets it otherwise. The session token is never put in a URL.
A store over sessionStorage or localStorage lets the session survive reloads, but any script that can read that
store can use the session until it ends (at most 7 days), only to ask for signatures the person approves on Sanctum.

The transport is a port (`WalletSessionTransport`, with an optional `cancel`; `transportError` maps HTTP-style
failures); another relay can implement it without changing apps. `tests/unit/wallet-session-relay.test.ts` runs the
same conformance suite against an in-process fake relay as `tests/integration/wallet-session-conformance.test.ts`
runs against Sanctum.

## Agents

```ts
import { registerAgentWithSanctum, requestAgentToken, agentResourceRequest } from "@inverus/connect";

const registration = await registerAgentWithSanctum({ issuer: "https://id.example.com", name: "Inbox helper", publicKey: publicJwk });
console.log(`Claim me at ${registration.verificationUri} with code ${registration.userCode}`);
const { clientId } = await registration.waitForClaim(); // then authenticate with signed assertions (RFC 7523)
const token = await requestAgentToken({ issuer, auth: { clientAssertion }, resource, grantId });
const response = await agentResourceRequest({ token, method: "GET", url: `${resource}/orders` });
```

`createDpopKey`, `exchangeAgentToken` (RFC 8693, narrowed with `tools`/`limits`) and DPoP-bound tokens are covered in
the source comments. For a terminal, `qrTerminal(registration.verificationUriComplete)` from `@inverus/connect/qr`
prints the claim link as a QR code. The private key never leaves the runtime, and a claimed agent has no access until
someone delegates it some.

## Runtime support

| Runtime | Support | Evidence |
| --- | --- | --- |
| Node 22 LTS (≥ 22.15.1) and Node 26 | Supported (`engines: >=22.15.1`) | The packed tarball is imported and used on 22.15.1 and 26.13.1 (consumer smoke test) |
| Node 24 | Expected to work | Not run here |
| Node 20 | Not supported (end of life since April 2026) | Not in the supported release matrix |
| Chrome (current) | Supported | Issuer-backed Chrome tests in the separate private service repository |
| Firefox, Safari | Expected (standard `fetch`, WebCrypto, `URL`) | Not run here |
| Server rendering, edge/server runtimes | Importing touches no browser global | `tests/unit/sdk-ssr.test.ts` and the consumer smoke test trap `window`, `document`, `navigator`, storage, `location` |

TypeScript: the declarations need either the DOM library or `@types/node` (for `fetch`, `AbortSignal`, `EventTarget`);
both are type-checked in the consumer smoke test with `skipLibCheck` off.

## Security notes

- **Browser and native apps** are public clients: PKCE and no secret; keep the transaction in `sessionStorage` or the
  platform's equivalent. The issuer grants CORS for discovery and JWKS to any origin, and for token, revocation and
  UserInfo responses only to the registered redirect-URI origins of public clients, without credentials.
- **Secrets:** a client secret is only for server-side apps.
- **Plain http:** `allowInsecureLoopback: true` allows `http://` only for `localhost`, `127.0.0.1` or `[::1]`.
- **ID token signatures** are verified against the issuer's published keys, not trusted because they came over TLS.
- **Code replay:** Sanctum redeems a code once; a replay is refused and revokes what that code issued.

## Packaging

The workspace manifest exports TypeScript source for the monorepo. `npm run sdk:build` compiles both SDK packages with
`tsc` into `packages/connect/dist` and `packages/connect-react/dist` (ESM `.js`, `.d.ts`, source maps with embedded
sources) and writes the published manifest from `sanctumPublish`. `npm run sdk:check` (part of `npm run check`) packs
and checks the tarballs, including a gzip budget per entry point; `npm run sdk:pack` keeps them in
`.local/sdk-tarballs`. The release checklist is [release/RELEASING.md](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect/release/RELEASING.md).

## Verification

This public repository runs SDK unit tests and isolated packed-consumer checks
for types, ESM/SSR, browser bundles and Next.js. Private service integration and
Chrome suites exercise the issuer-backed flows separately; those tests are not
included here and are not proof of hosted-provider acceptance.
See the repository [verification instructions](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/README.md#compatibility-and-verification).

## Verify an exported receipt chain

Import `verifySignedReceipts` from `@inverus/connect/receipts`. It runs with Web
Crypto in browsers and Node and has no database or network dependency:

```ts
const result = await verifySignedReceipts(parsedExport, {
  issuer: configuredIssuer,
  owner: expectedOwner,
  keys: trustedIssuerJwks,
  // anchor: previouslyVerifiedHead,
});
if (!result.valid) throw new Error(`Receipt rejected: ${result.problem}`);
```

Supply the expected owner and issuer keys from trusted application configuration,
not from the downloaded JSON. Bound the download size before parsing. An export
with another page remaining is refused. Retain a verified head as an anchor to
check later exports for rollback or rewritten history. A signed historical
checkpoint proves the issuer signed that head; it does not prove freshness,
current authorization, or that an external action occurred. The lower-level
`verifyReceipts` supports integrity-only inspection when no keys are supplied;
use `verifySignedReceipts` when accepting evidence from another party.

## License and support

MIT © 2026 inVerus. See [LICENSE](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect/LICENSE) and
[third-party notices](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect/THIRD_PARTY_NOTICES.md); the Sanctum brand has separate terms.
Report ordinary bugs through [GitHub Issues](https://github.com/InVerus-LLC/sanctum-connect-sdk/issues).
Use the [security policy](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/SECURITY.md) for sensitive reports.
