<p align="center">
  <img src="assets/brand/sanctum-connect-mark.svg" alt="Sanctum Connect" width="64" height="64" />
</p>

# Sanctum Connect SDKs

**Sign-in, wallet connections and scoped agent access for TypeScript and React.**

Build on Sanctum Connect with OpenID Connect and PKCE, typed APIs, React controls,
and separate entry points for wallets, QR codes, workload federation and receipts.
Maintained by **inVerus**. SDK code is **MIT licensed**.

[Product](https://www.mysanctum.ai/connect) ·
[TypeScript SDK](packages/connect/README.md) ·
[React SDK](packages/connect-react/README.md) ·
[Examples](examples) · [Contributing](CONTRIBUTING.md)

> **Alpha:** `0.1.0-alpha.0` is available on npm through the `next` tag.
> APIs may change. You need access to a configured Sanctum Connect issuer and a
> registered client; installing these packages does not provision an identity
> service. The product website is not an issuer URL.

## Choose your package

| Package | Use it for | Guide |
| --- | --- | --- |
| [`@inverus/connect`](https://www.npmjs.com/package/@inverus/connect) | Framework-independent sign-in, wallet sessions and agent helpers | [TypeScript](packages/connect/README.md) |
| [`@inverus/connect-react`](https://www.npmjs.com/package/@inverus/connect-react) | React 19 hooks, sign-in buttons, drawer, callback and wallet controls | [React](packages/connect-react/README.md) |

```sh
# TypeScript / server / browser
npm install @inverus/connect@next

# React 19 application
npm install @inverus/connect@next @inverus/connect-react@next
```

Use `pnpm add` or `yarn add` with the same package names if your app uses those
package managers. Pin a tested alpha version in production-facing applications.
See the [release and verification record](RELEASE_VERIFICATION.md) for the exact
source, registry checks and current distribution-tag status.

## Configure sign-in

1. Obtain your issuer origin and register a client with that issuer's operator.
2. Register the exact callback URL for each environment, including scheme, port,
   path and trailing slash. Register post-logout URLs separately.
3. Choose a **public client** for browser apps: PKCE, with no client secret.
   Keep confidential-client secrets and tokens on your server.
4. Enable the sign-in methods your project needs at the issuer. The SDK starts the
   hosted flow; passkeys, social accounts and enterprise SSO depend on that setup.

Each application has its own callbacks. All example domains below are placeholders.
Use HTTPS outside explicitly enabled loopback development.

```ts
import { SanctumConnect } from "@inverus/connect";

const connect = await SanctumConnect.discover({
  issuer: "https://id.example.com",
  clientId: "YOUR_REGISTERED_CLIENT_ID",
  redirectUri: "https://app.example.com/callback",
}, { signal: AbortSignal.timeout(10_000) });

const { url, transaction } = await connect.startSignIn();
// Save transaction in this user's server session or tab sessionStorage.
// Then redirect to url. Never include transaction in a URL or log it.
```

On the callback, retrieve and consume that same transaction, then call
`connect.finishSignIn(callbackUrl, transaction)`. It validates the response and
ID token, including state, issuer, nonce, PKCE and signature. See the
[complete Node example](examples/node-server) or [browser example](examples/browser-ts)
for transaction storage, callbacks, refresh and logout.

## React and Next.js

Wrap your application in `SanctumProvider`, import
`@inverus/connect-react/styles.css`, and use `SignInButton` or
`SignInDrawerButton`. Render `SignInCallback` at your registered callback route.

The [React quick start](packages/connect-react/README.md#quick-start) includes the
complete provider and callback wiring. The [Next.js example](examples/next-app)
keeps the provider in the shared layout so client navigation retains the session.
Tokens stay in memory; reloading the page signs this client out. Use a server-side
session integration when your application needs durable sessions.

## Capabilities and boundaries

| Capability | SDK behavior |
| --- | --- |
| Authentication | OIDC authorization code + S256 PKCE, typed errors, cancellation, refresh, revocation and logout URLs |
| React UI | Ready-made controls or headless hooks, typed events, wallet search, QR pairing and theme tokens |
| Wallets | EIP-6963 discovery and Sanctum-owned wallet sessions with per-request approval |
| Agents | Registration/claim, scoped delegation tokens, DPoP helpers and narrowed token exchange |
| Workloads | Token requests for preconfigured workload trusts through `@inverus/connect/workloads` |
| Receipts | Signed export verification against trusted issuer keys through `@inverus/connect/receipts` |

Sign-in, resource consent, agent delegation, wallet signing and payment approval
remain separate. Wallet connection grants no payment authority. Reown transport,
native mobile SDKs and general external-wallet interoperability are not included.
Existing payment helpers are not evidence of a live payment service.

## Examples

| Example | Demonstrates |
| --- | --- |
| [Browser TypeScript](examples/browser-ts) | Headless sign-in, project methods, callback and logout |
| [React](examples/react-app) | Sign-in drawer, session, events and wallet controls |
| [Next.js](examples/next-app) | App Router, shared provider and server rendering |
| [Node server](examples/node-server) | Confidential client, server-held tokens and session handling |
| [Agent](examples/agent-claim) | Registration, owner claim and delegated resource access |

Examples need a separately running, compatible issuer. No backend or deployment
is included in this repository.

## Compatibility and verification

ESM only; use `import`, not `require`. Packed consumers are checked on Node
22.15.1 and 26.13.1, React 19 and Next.js 16.4.6. Browser builds use standard Fetch,
Web Crypto and URL APIs. Firefox/WebKit, physical devices and hosted-provider
acceptance are not established by these checks.

```sh
# Repository development: Node 26.13.1, npm, committed lockfile
npm ci --ignore-scripts
npm run check
npm run build
npm run consumer -- /tmp/sanctum-sdk-consumer-new --deps-from-workspace --next
```

The consumer directory must not exist. Checks validate types, unit behavior,
packed files, exports, dependency boundaries and bundle budgets; the isolated
consumer checks ESM/SSR, browser bundles and Next.js prerendering.

## Contributing, support and releases

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the SDK. Report reproducible
bugs through [GitHub Issues](https://github.com/InVerus-LLC/sanctum-connect-sdk/issues).
For sensitive reports, follow [SECURITY.md](SECURITY.md); never post credentials.

Releases use the [manual workflow](.github/workflows/release.yml), reviewed commit
SHAs and npm provenance. Pushes and pull requests do not trigger CI or deployment.
See the [release guide](packages/connect/release/RELEASING.md).

## License

SDK code is [MIT licensed](LICENSE). Preserve the
[core dependency notices](packages/connect/THIRD_PARTY_NOTICES.md) and
[React/brand notices](packages/connect-react/THIRD_PARTY_NOTICES.md).
The Sanctum mark has separate brand terms; MIT grants no trademark rights.

This repository contains only the selected SDK source, examples and release tools.
`SOURCE_EXPORT.json` records the original export; subsequent changes are recorded
in Git. Private backend code, migrations, infrastructure and customer data are absent.
