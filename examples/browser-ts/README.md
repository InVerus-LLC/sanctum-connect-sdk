# Plain TypeScript browser example (`@inverus/connect`, headless)

A browser app with no framework and no UI package: it shows the sign-in methods its **App project** allows, starts
sign-in with the chosen method as a hint, finishes the callback on its own page and signs out (both tokens revoked,
then Sanctum's RP-initiated logout). It is a public client: PKCE and no secret; the transaction waits in this tab's
`sessionStorage` and is taken once; tokens stay in memory, so a reload signs the app out.

| File | What it shows |
| --- | --- |
| [src/project-methods.tsx](src/project-methods.tsx) | The app's kit document, which Sanctum computes from the app's wallet kit **within its project's enforced sign-in policy** |
| [src/session.tsx](src/session.tsx) | `startSignIn` with a hint, `finishSignIn` once with an AbortSignal, revocation and `signOutUrl` |
| [src/main.tsx](src/main.tsx) | Wiring with `textContent` only (no HTML injection) |

The files are `.tsx` without JSX only so that the repository's Node-typed root TypeScript project leaves this DOM code
to the DOM-typed SDK project (`packages/connect-react/tsconfig.json` type-checks it).

## Run with a separately configured issuer

1. Start a compatible Sanctum Connect issuer separately. These instructions assume a development issuer
   at `http://localhost:4400`; this SDK repository does not contain the service or an `npm run dev` command.
2. In the console (`http://localhost:4400/console`), create a **public** test app with the redirect URI
   `http://127.0.0.1:5173/` (exactly, with the slash) and the post-logout redirect URI `http://127.0.0.1:5173/`.
3. Projects: under Projects, create an **App** project, choose its sign-in methods (for example passkeys and Ethereum
   wallets only) and bind the test app to it. The page then offers only those methods. A method outside the policy is
   refused by Sanctum itself (`403 sign_in_method_not_allowed`), whatever this page shows; a disabled or archived
   project's app gets a 404 kit and can't sign anyone in.
4. Put the client ID into `data-client-id` in [index.html](index.html), then serve:

   ```sh
   npx esbuild examples/browser-ts/src/main.tsx --bundle --format=esm --outdir=examples/browser-ts/out \
     --servedir=examples/browser-ts --serve=127.0.0.1:5173
   ```

5. Open `http://127.0.0.1:5173/`.

`allowInsecureLoopback: true` only permits `http://` for a `localhost`/`127.0.0.1` issuer; an `https` issuer ignores it.

## Verification scope

References below to `tests/integration` or `tests/e2e` belong to the separate private service
repository. This public repository verifies packed-consumer types and builds; it does not
include those issuer-backed tests or establish live provider acceptance.

### Recorded checks

The consumer smoke test type-checks and bundles these files against the packed SDK tarballs (browser platform, no
Node built-ins). There is no Chrome run of this page yet; the same SDK calls run in Chrome in
`tests/e2e/connect-browser.test.ts`.
