# @inverus/connect-react

React 19 bindings for [`@inverus/connect`](../connect/README.md): "Continue with Sanctum" sign-in for browser apps
(public clients with PKCE), the callback page, an in-memory session, and connecting to a person's Sanctum wallet. No
framework is required; it works with Next.js (App Router included), Vite or a plain bundler.

**Status: 0.1.0-alpha.0 release candidate.** This repository contains MIT SDK source and a manually triggered release workflow. Check npm for actual publication status; source availability does not establish hosted-service readiness. Native mobile and WalletConnect/Reown transport are not included. Brand terms and third-party notices remain in effect.

## Use

```tsx
import { SanctumProvider, SignInButton, SignInCallback, useSession } from "@inverus/connect-react";
import "@inverus/connect-react/styles.css";

function Root() {
  return (
    <SanctumProvider issuer="https://id.example.com" clientId="YOUR_CLIENT_ID" redirectUri="https://app.example.com/callback">
      {location.pathname === "/callback" ? <SignInCallback onSignedIn={() => history.replaceState(null, "", "/")} /> : <Home />}
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
import { SanctumWalletConnect, useWalletSession } from "@inverus/connect-react";

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
import { SignInDrawerButton } from "@inverus/connect-react";

<SignInDrawerButton />; // "Continue with Sanctum" → the drawer
```

Complete examples: [examples/react-app](../../examples/react-app/README.md) (no framework) and
[examples/next-app](../../examples/next-app/README.md) (Next.js App Router: the provider in the root layout, the SDK
imported from server components).

## Events, errors and headless use

Typed events, without tokens: pass `onEvent` to `<SanctumProvider>` or `subscribe` from `useSanctum()`.

```tsx
<SanctumProvider issuer={issuer} clientId={clientId} redirectUri={redirectUri} onEvent={(event) => {
  // event.type: "ready" | "sign_in_started" | "signed_in" | "refreshed" | "signed_out" | "error" (with `during`)
}} />
```

Each outcome is announced once, also under StrictMode. Errors are `SanctumReactError` with a `code` (the core SDK's
codes, including `aborted`, plus `transaction_missing`, `not_ready` and `unexpected`); wallet errors are the core SDK's
typed `ProviderRpcError` codes. `describeError(error)` returns a plain sentence for each. For your own controls, use
the hooks and reducers the components use: `useSignIn`, `useSignInCallback`, `useSession`, `useWalletSession` +
`walletReducer`, `useSignInKit` + `useInjectedWallets` + `drawerReducer`, `qrPath`, `themeCss`.

## What it does, and doesn't

| Piece | Behaviour |
| --- | --- |
| `SanctumProvider` | Discovers the issuer in an effect, once per configuration in a page; a server render shows the loading state and makes no request. |
| `SignInButton`, `useSignIn` | Disabled until discovery finishes; ignores double clicks; resets when the person comes back with Back. The transaction (state, nonce, PKCE verifier) waits in this tab's `sessionStorage` for at most ten minutes. |
| `SignInCallback`, `useSignInCallback` | Finishes the sign-in once per `state` in a page (StrictMode's double effects share one token exchange), removes `code` and `state` from the address bar and history, and fails truthfully for a reloaded, replayed or other-tab callback (`transaction_missing`). |
| `useSession` | The session lives in memory only: no token is ever written to storage, a URL or a message, so a reload signs the app out. `refresh()` keeps only the newest (rotated) refresh token; `signOut()` revokes both tokens, and `{ endSanctumSession: true }` also ends the Sanctum session (RP-initiated logout). Apps that need longer sessions should use a server-side (confidential) integration with `@inverus/connect`. |
| `useWalletSession`, `SanctumWalletConnect` | Each connection attempt has a number; a late pairing link or approval for an older attempt is ignored, and a late approval is ended. Cancel, Disconnect and unmount end the proposed or connected session. The pairing link is a one-time capability: it's kept only while waiting and never rendered as text. Requests go through `wallet.request` (EIP-1193 `personal_sign`, `eth_signTypedData_v4`); the person approves each one in Sanctum. |
| `SignInDrawerButton`, `SanctumSignInDrawer` | The embedded sign-in chooser, structured after the Skiper 21 reference and implemented independently (no Skiper source). It is a native `<dialog>`: modal, Escape or the backdrop closes it, and focus returns to the opener. On phones it is a bottom sheet, and motion is off under reduced-motion settings. It reads the app's public wallet kit, so it offers only methods Sanctum will accept for this app. The person's choice travels as a sign-in hint (`sanctum_method`, plus `sanctum_wallet` for a browser wallet), and Sanctum's page opens that way. Every proof (passkey, wallet signature, SSO) still happens on Sanctum's own origin. |
| Wallet picker (in the drawer) | Lists Ethereum wallets this browser announces through EIP-6963. Their names and icons are untrusted: icons are drawn only as data-URI `<img>`, and the reverse-DNS id is just a hint. It also lists catalogue wallets: Ethereum ones link to their reviewed home pages because they can't sign in until installed, and Bitcoin ones sign a BIP-322 message on Sanctum. Search ignores case and accents and matches aliases; there is a chain filter, Clear, empty results and arrow-key movement. There is no inflated wallet count. |
| `SanctumQrCode` | A QR code drawn as one SVG path, dark on light, with no injected HTML (encoder: uqr 0.1.3 through `@inverus/connect/qr`). The wallet controls use it for the pairing link and say when the link stops working. |
| `SanctumMark` | The exact Sanctum Connect mark (checked against `assets/brand/sanctum-connect-mark.svg`). |
| `themeCss` | Typed theme tokens to CSS custom properties for your own stylesheet: no inline styles or injected `<style>`, so a strict Content Security Policy works. Values that could inject CSS are refused. |

## Runtime support and server rendering

| Where | Support | Evidence |
| --- | --- | --- |
| React 19 in Chrome | Supported | `tests/e2e/connect-react.test.ts`, `tests/e2e/connect-react-drawer.test.ts` (axe on every state, keyboard, focus return) |
| Firefox, Safari | Expected (native `<dialog>`, standard APIs) | Not run here |
| Server rendering (`react-dom/server`) | Supported: renders inert controls, touches no browser global, sends no request | `tests/unit/sdk-ssr.test.ts`, `tests/unit/connect-react.test.ts`, and the packed tarball on Node 20.20.2, 22.15.1 and 26.13.1 |
| Next.js App Router | Supported: import from server components; the client modules carry `"use client"` | `next build` of examples/next-app (16.4.6) against the packed tarballs |
| Node for SSR | 22 LTS (≥ 22.15.1) and 26 | As for `@inverus/connect` |

Nothing reads `window`, `document` or storage while rendering; discovery, the kit, wallet discovery and the session
start in effects on the client. The session lives in memory, so a server render is always signed out.

A manual screen-reader and 200% zoom pass has not been recorded yet; automated checks (axe) do not establish full
conformance.

Not included: email or phone codes (Sanctum has no configured delivery for them), WalletConnect relay wallets, and
native SDKs.

## Tested

- `tests/unit/sdk-ssr.test.ts`: every control rendered on the server with browser globals trapped; the event hub.
- `tests/unit/connect-react.test.ts`: server rendering, the exact mark, the transaction store, single completion, the
  wallet state machine, theme validation, and the core SDK ending a cancelled proposal.
- `tests/e2e/connect-react.test.ts` (Chrome): the example app on another origin, in StrictMode, against the local issuer
  and hosted pages. It covers:
  - sign-in through the drawer's "Create a Sanctum account", which opens account creation on Sanctum;
  - one token exchange and nothing left in storage;
  - a replayed callback refused, and sign-out revoking the tokens;
  - the typed events (`ready signed_in signed_out`, and one `error:callback` for a replayed callback);
  - a wallet session: cancel, approve, sign, disconnect.
- `tests/e2e/connect-react-drawer.test.ts` (Chrome): the drawer with two EIP-6963 wallets. It covers kit-filtered
  methods, Escape and focus return, search, the chain filter, links, arrow keys and Back focus. Choosing a wallet stores
  the hint and Sanctum uses that wallet without a picker. On a phone the drawer is a bottom sheet.
- `tests/unit/connect-wallets.test.ts`: discovery, catalogue search and hint validation (core SDK).
