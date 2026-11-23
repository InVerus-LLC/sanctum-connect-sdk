# Browser TypeScript authentication example

A framework-free browser application using `@inverus/connect`. It displays the
project's available sign-in methods, starts an OpenID Connect flow with PKCE,
handles the callback and signs the person out.

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

Register a **public** client with these URLs:

| Setting | Value |
| --- | --- |
| Redirect URI | `http://127.0.0.1:5173/` |
| Post-logout redirect URI | `http://127.0.0.1:5173/` |
| Application origin | `http://127.0.0.1:5173` |

Bind the client to an enabled App project with at least one sign-in method.
In [index.html](index.html), update the attributes on `#app`:

| Attribute | Set it to |
| --- | --- |
| `data-issuer` | Your issuer origin; local default `http://localhost:4400` |
| `data-client-id` | The registered public client ID |
| `data-redirect-uri` | The exact redirect URI above |

No client secret is needed. The source enables insecure HTTP only for loopback
development; remote issuer URLs must use HTTPS.

## Run

```sh
npm exec -- esbuild examples/browser-ts/src/main.tsx --bundle --format=esm \
  --outdir=examples/browser-ts/out --servedir=examples/browser-ts \
  --serve=127.0.0.1:5173
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Keep the terminal open;
press Ctrl+C to stop. Restart the command after editing source files.

## Try the flow

1. Choose an available sign-in method.
2. Complete authentication on the issuer's hosted page.
3. Return to the example and check that the signed-in subject appears.
4. Select **Sign out** to revoke the tokens and end the issuer session.

The PKCE transaction waits in this tab's `sessionStorage` and is consumed once.
Tokens stay in memory; reloading the app starts a new client session.

## Code guide

- [main.tsx](src/main.tsx): page setup and sign-in method controls.
- [session.tsx](src/session.tsx): transaction storage, callback and logout.
- [project-methods.tsx](src/project-methods.tsx): the project's public sign-in kit.

The `.tsx` files contain ordinary TypeScript without JSX. They are checked with
the browser compiler configuration used by the SDK consumer suite.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Discovery fails | The issuer is running and its origin matches `data-issuer`. |
| No sign-in methods | The client is bound to an enabled App project with allowed methods. |
| Callback is rejected | The registered URI includes the same host, port and trailing slash. |
| Transaction is missing | Start sign-in again in the same tab; do not replay a callback URL. |

See the [TypeScript SDK guide](../../packages/connect/README.md) for error codes.
