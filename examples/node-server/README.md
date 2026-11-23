# Node server example (`@inverus/connect`, confidential client)

A server-side web app on plain `node:http`: the client secret stays on the server, the sign-in transaction waits in the
server's session (an opaque `HttpOnly`, `SameSite=Lax` cookie), and tokens are never sent to the browser, logged or
rendered. Routes: `/login`, `/callback` (finished once), `/me` (userinfo for the signed-in subject), `POST /refresh`
(refresh-token rotation), `POST /logout` (revokes both tokens, then Sanctum's RP-initiated logout). POSTs must come from
the example's own origin. Every call to Sanctum carries a 10-second `AbortSignal`.

## Run with a separately configured issuer

1. Start a compatible Sanctum Connect issuer separately. These instructions assume a development issuer
   at `http://localhost:4400`; this SDK repository does not contain the service or an `npm run dev` command.
2. In the console, create a **confidential** test app with the redirect URI `http://127.0.0.1:4430/callback` and the
   post-logout redirect URI `http://127.0.0.1:4430/`. Keep the secret it shows you out of source control.
3. Supply `SANCTUM_CLIENT_SECRET` through your local secret manager or protected
   process environment; do not put its value in shell history. Then run:

   ```sh
   SANCTUM_ISSUER=http://localhost:4400 SANCTUM_CLIENT_ID=YOUR_CLIENT_ID \
   SANCTUM_ALLOW_LOOPBACK=1 PORT=4430 node examples/node-server/src/server.ts
   ```

4. Open `http://127.0.0.1:4430/`.

Sessions are in memory: restarting the process signs everyone out. A production app would keep sessions in its own
store and serve over https.

## Verification scope

References below to `tests/integration` or `tests/e2e` belong to the separate private service
repository. This public repository verifies packed-consumer types and builds; it does not
include those issuer-backed tests or establish live provider acceptance.

### Recorded checks

`tests/integration/sdk-examples.test.ts` starts the local issuer, registers this example as a confidential client,
spawns this file and signs a person in through it: userinfo, refresh rotation, a replayed callback refused, a
cross-origin POST refused, sign-out, and no token or secret in its output. The consumer smoke test type-checks it
against the packed tarballs.
