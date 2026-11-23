<p align="center">
  <img src="assets/brand/sanctum-connect-mark.svg" alt="Sanctum Connect" width="72" height="72" />
</p>

# Sanctum Connect

**Authentication SDKs for TypeScript, React and Next.js.**

Add OpenID Connect sign-in with PKCE, wallet connections and scoped AI agent access
to your application. Use the TypeScript client directly or start with React hooks
and ready-made sign-in components.

[Getting started](#getting-started) · [TypeScript](packages/connect/README.md) ·
[React](packages/connect-react/README.md) · [Examples](examples/README.md) ·
[Releases](https://github.com/InVerus-LLC/sanctum-connect-sdk/releases)

## Installation

```sh
# TypeScript, JavaScript or Node.js
npm install @inverus/connect@next

# React 19 or Next.js
npm install @inverus/connect@next @inverus/connect-react@next
```

The same packages work with `pnpm add` and `yarn add`. Both are ESM packages with
TypeScript declarations. The SDKs are currently **alpha**; pin a tested version
and review the changelog before upgrading.

## Getting started

You need a Sanctum Connect issuer and a registered client. Get these from your
issuer operator; the SDK does not start an authentication server.

1. Register your application's exact callback URL, such as
   `https://app.example.com/callback`, and its post-logout URL.
2. Use a public client for browser applications. Keep confidential-client secrets
   on your server.
3. Enable the project's hosted sign-in methods. Passkeys, social login and
   enterprise SSO depend on the issuer's configuration.

Each application and environment can have its own callback URLs. The issuer is
the authentication service's HTTPS origin, not the product website.

```ts
import { SanctumConnect } from "@inverus/connect";

const connect = await SanctumConnect.discover({
  issuer: "https://id.example.com",
  clientId: "YOUR_CLIENT_ID",
  redirectUri: "https://app.example.com/callback",
});

const { url, transaction } = await connect.startSignIn();
// Save transaction in this user's server session or browser tab sessionStorage.
// Redirect to url; on return, consume that transaction with finishSignIn().
```

Follow the [TypeScript guide](packages/connect/README.md#sign-in-flow) for callback,
refresh and logout handling, or the [React quick start](packages/connect-react/README.md#quick-start)
for `SanctumProvider`, sign-in controls and callback routing.

## Packages

| Package | What it provides |
| --- | --- |
| [@inverus/connect](https://www.npmjs.com/package/@inverus/connect) | OIDC/PKCE, token lifecycle, wallet sessions and agent access |
| [@inverus/connect-react](https://www.npmjs.com/package/@inverus/connect-react) | React provider, hooks, sign-in drawer, callback and wallet components |

Optional core entry points keep specialized features separate:

| Import | Purpose |
| --- | --- |
| `@inverus/connect/wallets` | EIP-6963 wallet discovery and search |
| `@inverus/connect/qr` | QR encoding for pairing and agent claims |
| `@inverus/connect/workloads` | Tokens for configured workload trusts |
| `@inverus/connect/receipts` | Signed receipt verification with trusted issuer keys |

Authentication, resource consent, agent delegation and wallet signing are separate
permissions. Connecting a wallet does not authorize payments. Native mobile SDKs
and WalletConnect/Reown transport are not included in this alpha.

## Examples

Every example includes configuration, commands, expected behavior and troubleshooting.
Start with the [examples guide](examples/README.md).

| Example | Integration |
| --- | --- |
| [Browser TypeScript](examples/browser-ts/README.md) | Framework-free sign-in with PKCE and tab-scoped transactions |
| [React](examples/react-app/README.md) | Sign-in drawer, hooks, session events and wallet pairing |
| [Next.js App Router](examples/next-app/README.md) | Shared provider, callback route and server rendering |
| [Node.js server](examples/node-server/README.md) | Confidential client with server-held tokens |
| [Agent authentication](examples/agent-claim/README.md) | Public-key registration, owner claim and delegated resource access |

## Requirements

- SDK consumers: Node.js 22.15.1 or newer; checked on Node 22.15.1 and 26.13.1.
- React bindings: React 19. The packed Next.js example is checked on 16.4.6.
- Browser integrations: Fetch, Web Crypto, URL and sessionStorage APIs.
- Repository development: Node.js 26.13.1 and the committed npm lockfile.

Firefox/WebKit, native devices and live-provider acceptance remain outside the
current verified compatibility matrix. See each package guide for session behavior
and runtime-specific details.

## Development and support

```sh
npm ci --ignore-scripts
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for builds, isolated consumer checks and
review requirements. Releases are manual; pushes do not trigger CI or deployments.

Report bugs with a minimal reproduction in
[GitHub Issues](https://github.com/InVerus-LLC/sanctum-connect-sdk/issues).
Send sensitive vulnerability reports privately to **bobir@inverus.tech** without
credentials or customer data. Learn about the product at [mysanctum.ai/connect](https://www.mysanctum.ai/connect).

## License

MIT © 2026 inVerus. See [LICENSE](LICENSE),
[TypeScript dependency notices](packages/connect/THIRD_PARTY_NOTICES.md) and
[React dependency and brand notices](packages/connect-react/THIRD_PARTY_NOTICES.md).
The SDK code license does not grant trademark rights to the Sanctum logo.
