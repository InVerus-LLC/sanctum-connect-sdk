# Node.js server authentication example

A confidential OpenID Connect client built with `node:http` and
`@inverus/connect`. Sign-in transactions and tokens stay on the server behind an
opaque `HttpOnly`, `SameSite=Lax` session cookie.

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

Register a **confidential** client:

| Setting | Value |
| --- | --- |
| Redirect URI | `http://127.0.0.1:4430/callback` |
| Post-logout redirect URI | `http://127.0.0.1:4430/` |

Create `.local/node-server.env` locally. The `.local/` directory is ignored by Git.
Supply the real client ID and secret through your editor or secret manager, not
through a command saved in shell history.

```dotenv
SANCTUM_ISSUER=http://localhost:4400
SANCTUM_CLIENT_ID=YOUR_CLIENT_ID
SANCTUM_CLIENT_SECRET=YOUR_CLIENT_SECRET
SANCTUM_ALLOW_LOOPBACK=1
PORT=4430
```

The server derives its callback from `http://127.0.0.1:${PORT}`. If you change the
port, update both registered URLs. The secret is required and remains server-side.

## Run

```sh
node --env-file=.local/node-server.env examples/node-server/src/server.ts
```

After discovery succeeds, the terminal prints `Listening on http://127.0.0.1:4430`.
Open that URL. Ctrl+C stops the server.

## Try the flow

1. Select **Sign in with Sanctum** and complete hosted authentication.
2. Visit `/me` to read the authenticated subject through UserInfo.
3. Select **Refresh** to exercise refresh-token rotation, when a refresh token
   has been issued to this client.
4. Select **Sign out** to revoke tokens and end the issuer session.

| Route | Purpose |
| --- | --- |
| `GET /login` | Begin sign-in and save the transaction server-side |
| `GET /callback` | Consume the transaction and validate the response |
| `GET /me` | Fetch UserInfo for the signed-in subject |
| `POST /refresh` | Rotate the refresh token |
| `POST /logout` | Revoke tokens and redirect to issuer logout |

## Application boundaries

This is a local development example. Sessions are an in-memory map with no
production expiry or capacity policy; restarting signs everyone out. The server
binds to loopback HTTP, and its cookie deliberately lacks `Secure` for that local
setup. A deployed application needs HTTPS, secure cookies, bounded durable
sessions and its own lifecycle and request controls. Do not expose this example
server directly to the internet.

See [server.ts](src/server.ts) for the full implementation and the
[TypeScript SDK guide](../../packages/connect/README.md) for API details.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Process exits before listening | All required variables exist and issuer discovery succeeds. |
| Callback rejected | Register the exact loopback host and port used by the server. |
| Refresh returns `signed_out` | The client needs a valid refresh token; sign in again if it expired. |
| A POST returns `cross_origin` | Use the page's own forms from `127.0.0.1`, not another origin. |
