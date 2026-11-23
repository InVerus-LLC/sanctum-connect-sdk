# React authentication and wallet example

A React 19 application using `@inverus/connect-react`. It demonstrates the sign-in
drawer, callback, session hooks, typed events and an optional Sanctum wallet session.
React StrictMode is enabled.

## Prerequisites

Use Node.js **26.13.1** to run this repository's TypeScript examples. You also need
a separately running Sanctum Connect issuer and permission to register a test client.
The SDK repository does not include the issuer or hosted sign-in service.

From a terminal:

```sh
git clone https://github.com/InVerus-LLC/sanctum-connect-sdk.git
cd sanctum-connect-sdk
npm ci --ignore-scripts
```

If you already cloned the repository, use that checkout. Run the commands below
from the **repository root**, not from this example's directory.

## Configure

Register a **public** client:

| Setting | Value |
| --- | --- |
| Redirect URI | `http://127.0.0.1:5174/callback` |
| Application origin | `http://127.0.0.1:5174` |

Set `data-issuer`, `data-client-id` and `data-redirect-uri` on `#root` in
[index.html](index.html). The default issuer is `http://localhost:4400`.
Use your registered public client ID, never a client secret.

For the wallet walkthrough, configure the client's wallet kit to allow:

- Origin `http://127.0.0.1:5174`.
- Base Sepolia, `eip155:84532`.
- The `personal_sign` method.

The account's **Sign out** control revokes this app's tokens. It does not request
issuer-wide logout; the separate browser and Node examples demonstrate that flow.

## Run

```sh
npm exec -- esbuild examples/react-app/src/app.tsx --bundle --format=esm \
  --jsx=automatic --outdir=examples/react-app/out \
  --servedir=examples/react-app --serve=127.0.0.1:5174 \
  --serve-fallback=examples/react-app/index.html
```

Open [http://127.0.0.1:5174/](http://127.0.0.1:5174/). The fallback serves the same
application at `/callback`. Keep the terminal open; Ctrl+C stops it. Restart after
editing source files.

## Try the flow

1. Select **Continue with Sanctum**, then choose a configured sign-in method.
2. Complete hosted authentication. The callback returns to the account view
   without reloading the provider.
3. Inspect the event names below the app. They contain no access tokens.
4. Optionally connect a Sanctum wallet and approve **Sign “Hello Sanctum”**.
5. Disconnect the wallet or select **Sign out** for the app session.

Tokens are in memory. Reloading signs this client out. Pairing and each signing
request require separate approval; the example does not send a transaction.

## Code guide

[app.tsx](src/app.tsx) contains the small example's provider, callback routing,
account controls, wallet controls and event display. The SDK components and hooks
are documented in the [React guide](../../packages/connect-react/README.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Sign-in stays disabled | The issuer's discovery endpoint is reachable and the client ID is valid. |
| `/callback` returns 404 | Include `--serve-fallback` in the command above. |
| Controls have no styling | The HTML loads `/out/app.css`; both JS and CSS must be built. |
| Wallet connection is refused | The wallet kit permits the exact origin, chain and method. |
| Session disappears after refresh | Expected: this example keeps tokens in memory. |
