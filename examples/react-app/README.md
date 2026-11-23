# React example (`@inverus/connect-react`)

A small app with no framework: "Continue with Sanctum" opens the sign-in drawer (methods and the wallet picker), the
callback page finishes sign-in once, the session lives in memory with Sign out, a Sanctum wallet session asks the person
to sign "Hello Sanctum", and the SDK's typed events are listed under "Events". It runs in React StrictMode.

## Run it against the local stack

1. Start the stack: `npm run dev` (issuer and hosted pages on `http://localhost:4400`).
2. In the console (`http://localhost:4400/console`), create a **public** test app with the redirect URI
   `http://127.0.0.1:5174/callback`. In its wallet kit, allow the origin `http://127.0.0.1:5174`, the network
   Base Sepolia (`eip155:84532`) and `personal_sign`.
3. Put the client ID into `data-client-id` in [index.html](index.html).
4. Serve it with esbuild (already a dev dependency of the repository):

   ```sh
   npx esbuild examples/react-app/src/app.tsx --bundle --format=esm --jsx=automatic \
     --outdir=examples/react-app/out --servedir=examples/react-app \
     --serve=127.0.0.1:5174 --serve-fallback=examples/react-app/index.html
   ```

5. Open `http://127.0.0.1:5174/`.

Inside this repository `@inverus/connect-react` resolves to the workspace source. In your own app, install the packed
SDK instead (`npm run sdk:pack` writes the tarballs to `.local/sdk-tarballs`; see
[packages/connect/release/RELEASING.md](../../packages/connect/release/RELEASING.md)).

## Tested

`tests/e2e/connect-react.test.ts` (Chrome) bundles this file and runs it on another origin than the issuer: drawer
sign-up, one token exchange under StrictMode, nothing left in storage, a replayed callback refused, sign-out revoking
the tokens, the typed events (`ready signed_in signed_out`, and `error:callback` for the replay), a wallet session
(cancel, approve, sign, disconnect), and axe on each state. `tests/e2e/connect-react-drawer.test.ts` covers the
drawer and wallet picker. The packed tarballs are type-checked with this file in the consumer smoke test.
