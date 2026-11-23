# Agent authentication and delegation example

A terminal agent using `@inverus/connect`. It creates an Ed25519 key pair,
registers its public key, waits for its owner to claim it, and requests a scoped
resource token after an explicit delegation. The private key stays in memory.

## Prerequisites

Use Node.js **26.13.1** to run this repository's TypeScript examples. You also need
a separately running Sanctum Connect issuer with agent registration enabled and a registered resource server.
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

| Environment variable | Required | Purpose |
| --- | --- | --- |
| `SANCTUM_ISSUER` | Yes | Compatible issuer origin |
| `SANCTUM_AGENT_NAME` | No | Display name; defaults to `Example agent` |
| `SANCTUM_ALLOW_LOOPBACK` | For local HTTP | Set to `1` for a loopback development issuer |
| `SANCTUM_RESOURCE` | For token request | Exact URI of the registered resource server |
| `SANCTUM_RESOURCE_URL` | No | Allowed resource endpoint to call with the issued token |

Use a resource URI supplied by your issuer operator. The resource endpoint, tools
and limits must agree with the delegation; arbitrary URLs do not gain access.
No OAuth client secret is needed: the example signs a short-lived client assertion
with its generated private key.

## Run

Replace the resource placeholder before running:

```sh
SANCTUM_ISSUER=http://localhost:4400 \
SANCTUM_ALLOW_LOOPBACK=1 \
SANCTUM_RESOURCE=https://resource.example.com \
node examples/agent-claim/src/agent.ts
```

Omit `SANCTUM_RESOURCE` if you only want to demonstrate registration and owner claim.

## Try the flow

1. Open the verification URL printed by the terminal, or scan its QR code.
2. Authenticate with the issuer and claim the agent using the displayed code.
3. Create a delegation for the claimed agent, the configured resource and the
   permitted tools or limits.
4. Enter that delegation ID at the terminal prompt.
5. Successful token issuance prints `Token: issued for the delegation` without
   printing the token. If `SANCTUM_RESOURCE_URL` is configured, the example also
   makes a GET request and prints the response status.

Claiming the agent alone grants no resource access. Keep the claim code and QR
private; they are temporary capabilities intended for the owner. Ctrl+C stops the
process, and a restart generates a new key and registration. This example has no
persistent key custody and makes no payment request.

## Code guide

[agent.ts](src/agent.ts) contains registration, QR rendering, owner claim,
client-assertion signing and the delegated request. `jose` signs the assertion;
the SDK carries it to the issuer. See the [agent API guide](../../packages/connect/README.md#agents).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Registration is refused | The issuer supports registration and permits this request. |
| Claim code expired | Restart and use the newly issued URL and code. |
| No delegation prompt appears | Set `SANCTUM_RESOURCE` before starting the process. |
| Token request is refused | The grant is active and names this agent and resource. |
| Resource call is denied | Its URL and required operation are within the delegated authority. |
