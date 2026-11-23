# Node server example (`@inverus/connect`, confidential client)

A server-side web app on plain `node:http`: the client secret stays on the server, the sign-in transaction waits in the
server's session (an opaque `HttpOnly`, `SameSite=Lax` cookie), and tokens are never sent to the browser, logged or
rendered. Routes: `/login`, `/callback` (finished once), `/me` (userinfo for the signed-in subject), `POST /refresh`
(refresh-token rotation), `POST /logout` (revokes both tokens, then Sanctum's RP-initiated logout). POSTs must come from
the example's own origin. Every call to Sanctum carries a 10-second `AbortSignal`.

## Run it against the local stack

1. `npm run dev` (issuer on `http://localhost:4400`).
2. In the console, create a **confidential** test app with the redirect URI `http://127.0.0.1:4430/callback` and the
   post-logout redirect URI `http://127.0.0.1:4430/`. Keep the secret it shows you out of source control.
3. Run:

   ```sh
   SANCTUM_ISSUER=http://localhost:4400 SANCTUM_CLIENT_ID=… SANCTUM_CLIENT_SECRET=… \
   SANCTUM_ALLOW_LOOPBACK=1 PORT=4430 node examples/node-server/src/server.ts
   ```

4. Open `http://127.0.0.1:4430/`.

Sessions are in memory: restarting the process signs everyone out. A production app would keep sessions in its own
store and serve over https.

## Tested

`tests/integration/sdk-examples.test.ts` starts the local issuer, registers this example as a confidential client,
spawns this file and signs a person in through it: userinfo, refresh rotation, a replayed callback refused, a
cross-origin POST refused, sign-out, and no token or secret in its output. The consumer smoke test type-checks it
against the packed tarballs.
