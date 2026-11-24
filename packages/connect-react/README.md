# @sanctum.ai/connect-react

React 19 bindings for [`@sanctum.ai/connect`](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect/README.md): "Continue with Sanctum" sign-in for browser apps
(public clients with PKCE), the callback page, an in-memory session, and connecting to a person's Sanctum wallet. No
framework is required; it works with Next.js (App Router included), Vite or a plain bundler.

**Alpha: `0.1.0-alpha.0` (`next` tag).** APIs may change. A configured Sanctum Connect issuer and registered client are required; installing this SDK does not provision a hosted service. Native mobile and WalletConnect/Reown transport are not included.

## Install

```sh
npm install @sanctum.ai/connect@next @sanctum.ai/connect-react@next
```

React bindings require React 19. Use ESM imports; CommonJS `require()` is not exported.
Check the [npm package](https://www.npmjs.com/package/@sanctum.ai/connect-react) for available versions.

## Before you start

Obtain a compatible issuer origin and client ID. Register the exact callback and
post-logout URLs for each environment. Browser apps use public clients with PKCE
and no secret; confidential-client secrets belong only on your server. All example
domains are placeholders. Passkeys, social providers and SSO are configured at the
issuer and completed on its hosted pages, not by these package controls.

## Quick start

This browser-only example uses React state to leave the callback without reloading
and losing its in-memory session. Mount it at both `/` and `/callback`; configure
your development server to serve the app at both paths. For Next.js, use the
[App Router example](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/examples/next-app/README.md) instead of reading `location`
during a server render.

```tsx
import { useState } from "react";
import { SanctumProvider, SignInButton, SignInCallback, useSession } from "@sanctum.ai/connect-react";
import "@sanctum.ai/connect-react/styles.css";

export function App() {
  const [callback, setCallback] = useState(() => location.pathname === "/callback");
  function finish() {
    history.replaceState(null, "", "/");
    setCallback(false);
  }
  return (
    <SanctumProvider
      issuer="https://id.example.com"
      clientId="YOUR_CLIENT_ID"
      redirectUri="https://app.example.com/callback"
    >
      {callback ? <SignInCallback onSignedIn={finish} /> : <Home />}
    </SanctumProvider>
  );
}

function Home() {
  const { session, signOut } = useSession();
  return session ? <button onClick={() => void signOut()}>Sign out</button> : <SignInButton />;
}
```

Wallet sessions (the app's wallet kit must allow the chain, the method and the app's origin):

```tsx
import { SanctumWalletConnect, useWalletSession } from "@sanctum.ai/connect-react";

function Wallet() {
  const wallet = useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"] });
  const sign = () => wallet.request({ method: "personal_sign", params: ["0x48656c6c6f", wallet.state.accounts[0]] });
  return (
    <>
      <SanctumWalletConnect wallet={wallet} />
      {wallet.state.status === "connected" ? <button onClick={() => void sign()}>Sign</button> : null}
    </>
  );
}
```

The sign-in drawer (methods and a wallet picker) instead of a plain button:

```tsx
import { SignInDrawerButton } from "@sanctum.ai/connect-react";

<SignInDrawerButton />; // "Continue with Sanctum" → the drawer
```

Complete examples: [examples/react-app](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/examples/react-app/README.md) (no framework) and
[examples/next-app](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/examples/next-app/README.md) (Next.js App Router: the provider in the root layout, the SDK
imported from server components).

## Events, errors and headless use

Typed events, without tokens: pass `onEvent` to `<SanctumProvider>` or `subscribe` from `useSanctum()`.

```tsx
<SanctumProvider
  issuer={issuer}
  clientId={clientId}
  redirectUri={redirectUri}
  onEvent={(event) => {
    // event.type: "ready" | "sign_in_started" | "signed_in" | "refreshed" | "signed_out" | "error" (with `during`)
  }}
/>
```

Each outcome is announced once, also under StrictMode. Errors are `SanctumReactError` with a `code` (the core SDK's
codes, including `aborted`, plus `transaction_missing`, `not_ready` and `unexpected`); wallet errors are the core SDK's
typed `ProviderRpcError` codes. `describeError(error)` returns a plain sentence for each. For your own controls, use
the hooks and reducers the components use: `useSignIn`, `useSignInCallback`, `useSession`, `useWalletSession` +
`walletReducer`, `useSignInKit` + `useInjectedWallets` + `drawerReducer`, `qrPath`, `themeCss`.

## Components and session behavior

| Piece                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SanctumProvider`                           | Discovers the issuer in an effect, once per configuration in a page; a server render shows the loading state and makes no request.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SignInButton`, `useSignIn`                 | Disabled until discovery finishes; ignores double clicks; resets when the person comes back with Back. The transaction (state, nonce, PKCE verifier) waits in this tab's `sessionStorage` for at most ten minutes.                                                                                                                                                                                                                                                                                                                                         |
| `SignInCallback`, `useSignInCallback`       | Finishes the sign-in once per `state` in a page (StrictMode's double effects share one token exchange), removes `code` and `state` from the address bar and history, and fails truthfully for a reloaded, replayed or other-tab callback (`transaction_missing`).                                                                                                                                                                                                                                                                                          |
| `useSession`                                | The session lives in memory only: no token is ever written to storage, a URL or a message, so a reload signs the app out. `refresh()` keeps only the newest (rotated) refresh token; `signOut()` revokes both tokens, and `{ endSanctumSession: true }` also ends the Sanctum session (RP-initiated logout). Apps that need longer sessions should use a server-side (confidential) integration with `@sanctum.ai/connect`.                                                                                                                                |
| `useWalletSession`, `SanctumWalletConnect`  | Each connection attempt has a number; a late pairing link or approval for an older attempt is ignored, and a late approval is ended. Cancel, Disconnect and unmount end the proposed or connected session. The pairing link is a one-time capability: it's kept only while waiting and never rendered as text. Requests go through `wallet.request` (EIP-1193 `personal_sign`, `eth_signTypedData_v4`); the person approves each one in Sanctum.                                                                                                           |
| `SignInDrawerButton`, `SanctumSignInDrawer` | The embedded sign-in chooser. It is a native `<dialog>`: modal, Escape or the backdrop closes it, and focus returns to the opener. On phones it is a bottom sheet, and motion is off under reduced-motion settings. It reads the app's public wallet kit, so it offers only methods Sanctum will accept for this app. The person's choice travels as a sign-in hint (`sanctum_method`, plus `sanctum_wallet` for a browser wallet), and Sanctum's page opens that way. Every proof (passkey, wallet signature, SSO) still happens on Sanctum's own origin. |
| Wallet picker (in the drawer)               | Lists Ethereum wallets this browser announces through EIP-6963. Their names and icons are untrusted: icons are drawn only as data-URI `<img>`, and the reverse-DNS id is just a hint. It also lists catalogue wallets: Ethereum ones link to their reviewed home pages because they can't sign in until installed, and Bitcoin ones sign a BIP-322 message on Sanctum. Search ignores case and accents and matches aliases; there is a chain filter, Clear, empty results and arrow-key movement.                                                          |
| `SanctumQrCode`                             | A QR code drawn as one SVG path, dark on light, with no injected HTML (encoder: uqr 0.1.3 through `@sanctum.ai/connect/qr`). The wallet controls use it for the pairing link and say when the link stops working.                                                                                                                                                                                                                                                                                                                                          |
| `SanctumMark`                               | The exact Sanctum Connect mark (checked against `assets/brand/sanctum-connect-mark.svg`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `themeCss`                                  | Typed theme tokens to CSS custom properties for your own stylesheet: no inline styles or injected `<style>`, so a strict Content Security Policy works. Values that could inject CSS are refused.                                                                                                                                                                                                                                                                                                                                                          |

## Runtime support and server rendering

| Where                                 | Support                                                                           | Evidence                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| React 19 in Chrome                    | Browser integration target                                                        | Standard browser APIs; issuer required for sign-in                                                                   |
| Firefox, Safari                       | Expected (native `<dialog>`, standard APIs)                                       | Not run here                                                                                                         |
| Server rendering (`react-dom/server`) | Supported: renders inert controls, touches no browser global, sends no request    | `tests/unit/sdk-ssr.test.ts`, `tests/unit/connect-react.test.ts`, and the packed tarball on Node 22.15.1 and 26.13.1 |
| Next.js App Router                    | Supported: import from server components; the client modules carry `"use client"` | `next build` of examples/next-app (16.4.6) against the packed tarballs                                               |
| Node for SSR                          | 22 LTS (≥ 22.15.1) and 26                                                         | As for `@sanctum.ai/connect`                                                                                         |

Nothing reads `window`, `document` or storage while rendering; discovery, the kit, wallet discovery and the session
start in effects on the client. The session lives in memory, so a server render is always signed out.

A manual screen-reader and 200% zoom pass has not been recorded yet; automated checks (axe) do not establish full
conformance.

The available hosted sign-in methods depend on issuer configuration. These React controls do not implement
email/SMS delivery, WalletConnect relay transport or native SDKs.

## Development

The repository checks server rendering, transactions, wallet state, theme validation,
cancellation and package exports. Packed consumers cover React SSR, browser bundles
and Next.js prerendering. Live sign-in requires your configured issuer.
See the [contributor guide](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/CONTRIBUTING.md) for verification commands.

## License and support

MIT © 2026 inVerus. See [LICENSE](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect-react/LICENSE) and
[third-party notices](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect-react/THIRD_PARTY_NOTICES.md); the Sanctum brand has separate terms.
Report ordinary bugs through [GitHub Issues](https://github.com/InVerus-LLC/sanctum-connect-sdk/issues).
For sensitive vulnerability reports, email **bobir@inverus.tech** privately. Never include credentials or customer data.
