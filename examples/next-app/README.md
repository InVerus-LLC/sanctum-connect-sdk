# Next.js App Router example (`@inverus/connect-react`)

The root layout (a server component) renders `<SanctumProvider>`, so the in-memory session survives client navigation
from `/callback` to `/`. The home page is a server component that renders the exact mark on the server and a client
component with the sign-in drawer, the signed-in account with Sign out (tokens revoked, then Sanctum's session ended)
and a Sanctum wallet session that signs "Hello Sanctum". `/callback` finishes the sign-in once and goes home.

## Run with a separately configured issuer

1. Start a compatible Sanctum Connect issuer separately. These instructions assume a development issuer
   at `http://localhost:4400`; this SDK repository does not contain the service or an `npm run dev` command.
2. In the console, create a **public** test app with the redirect URI `http://127.0.0.1:5175/callback` and the
   post-logout redirect URI `http://127.0.0.1:5175/`; in its wallet kit allow the origin `http://127.0.0.1:5175`, Base
   Sepolia (`eip155:84532`) and `personal_sign`.
3. In your own project, install the packed SDK (`npm run sdk:pack` writes the tarballs to `.local/sdk-tarballs`) plus
   `next`, `react` and `react-dom`, copy `app/`, `next.config.mjs` and `tsconfig.json`, then:

   ```sh
   NEXT_PUBLIC_SANCTUM_ISSUER=http://localhost:4400 NEXT_PUBLIC_SANCTUM_CLIENT_ID=… \
   NEXT_PUBLIC_SANCTUM_REDIRECT_URI=http://127.0.0.1:5175/callback \
   npx next dev --hostname 127.0.0.1 --port 5175
   ```

`transpilePackages` in [next.config.mjs](next.config.mjs) is only needed inside this repository, where the SDK resolves
to its TypeScript source; with the published packages it is harmless.

## Verification scope

References below to `tests/integration` or `tests/e2e` belong to the separate private service
repository. This public repository verifies packed-consumer types and builds; it does not
include those issuer-backed tests or establish live provider acceptance.

### Recorded checks

`npm run sdk:consumer -- <dir outside the repo> --deps-from-workspace --next` installs the packed tarballs into a
throwaway project and runs `next build` on this example (Next.js 16.4.6, offline): the SDK is imported from server
components and `/` and `/callback` are prerendered on the server without touching a browser API; the HTML contains the
drawer button, the closed `<dialog>` and the exact mark. Not run yet: `next dev` inside this repository and a Chrome
run of this example against the local stack (the same controls run in Chrome through `examples/react-app`).
