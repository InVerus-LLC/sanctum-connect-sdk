# Next.js App Router authentication example

A Next.js application using the Sanctum React SDK. A shared layout owns the
provider, `/callback` finishes sign-in, and client navigation preserves the
in-memory session. Server components can render the SDK's inert initial controls.

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

Register a **public** client with these settings:

| Setting | Value |
| --- | --- |
| Redirect URI | `http://127.0.0.1:5175/callback` |
| Post-logout redirect URI | `http://127.0.0.1:5175/` |
| Application origin | `http://127.0.0.1:5175` |

For the optional wallet example, also allow `eip155:84532` and `personal_sign` in
the client's wallet kit.

| Environment variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SANCTUM_ISSUER` | Issuer origin, without a path or trailing slash |
| `NEXT_PUBLIC_SANCTUM_CLIENT_ID` | Registered public client ID |
| `NEXT_PUBLIC_SANCTUM_REDIRECT_URI` | Exact callback URL |

These values are public browser configuration. Never put a client secret in a
`NEXT_PUBLIC_` variable. The example permits HTTP only on loopback hosts.

## Run

Replace `YOUR_CLIENT_ID`, then run from the repository root:

```sh
NEXT_PUBLIC_SANCTUM_ISSUER=http://localhost:4400 \
NEXT_PUBLIC_SANCTUM_CLIENT_ID=YOUR_CLIENT_ID \
NEXT_PUBLIC_SANCTUM_REDIRECT_URI=http://127.0.0.1:5175/callback \
npm exec -- next dev examples/next-app --hostname 127.0.0.1 --port 5175
```

Open [http://127.0.0.1:5175/](http://127.0.0.1:5175/). Ctrl+C stops the server.
Restart after changing environment variables.

## Try the flow

1. Open the sign-in drawer and complete hosted authentication.
2. The callback uses `router.replace("/")` to return home through client navigation.
3. Confirm the account view appears. Optionally connect a wallet and approve the
   example's text signature.
4. Select **Sign out** to revoke tokens and end the issuer session.

Keep `SanctumProvider` in the shared root layout. A full page reload or provider
remount clears this example's in-memory tokens.

## Code guide

- [layout.tsx](app/layout.tsx): environment configuration, styles and shared provider.
- [page.tsx](app/page.tsx): server-rendered page composition.
- [account.tsx](app/account.tsx): client-side account and wallet controls.
- [finish.tsx](app/callback/finish.tsx): callback completion and client navigation.

`transpilePackages` in [next.config.mjs](next.config.mjs) supports this repository's
TypeScript workspace sources. Published packages already contain ESM JavaScript.

## Use in your own Next.js app

Install `@inverus/connect@next` and `@inverus/connect-react@next`. Copy the provider
and callback patterns into your own routes, use your registered URLs, and import
`@inverus/connect-react/styles.css` from your root layout. The local consumer suite
checks the example's production build on Next.js 16.4.6.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Callback rejected | The registered URL matches the environment value exactly. |
| Configuration changes have no effect | Restart Next.js after editing environment variables. |
| Session disappears on navigation | Keep one provider above both routes; use client navigation. |
| Discovery fails | Use an available issuer origin, not the product landing page. |
