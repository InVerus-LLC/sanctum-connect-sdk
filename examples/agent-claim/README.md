# Agent example (`@inverus/connect`: registration, delegation token, resource call)

An agent runtime that registers itself with only a public key (`registerAgentWithSanctum`), prints the claim code and a
terminal QR code of the claim link (`qrTerminal` from `@inverus/connect/qr`), waits until a person or an organization
administrator claims it, then, given the ID of a delegation that person made, gets a token for it with
`requestAgentToken` and a signed client assertion (RFC 7523). With `SANCTUM_RESOURCE_URL` it also calls that URL with
`agentResourceRequest`. Tokens are never printed. The private key stays in memory here; a real runtime keeps it in its
own secret store or KMS. `jose` signs the assertion; the SDK only sends it.

## Run with a separately configured issuer

1. Start a compatible development issuer separately at `http://localhost:4400` and register the
   intended resource server. This SDK repository does not start a backend or simulator.
2. Run:

   ```sh
   SANCTUM_ISSUER=http://localhost:4400 SANCTUM_ALLOW_LOOPBACK=1 \
   SANCTUM_RESOURCE=<resource URI of a registered resource server> \
   node examples/agent-claim/src/agent.ts
   ```

3. Claim the agent at `http://localhost:4400/agents/claim` with the printed code (or scan the QR code).
4. On the Agents page, delegate some tools of that resource server to the agent, then paste the delegation ID into the
   agent's prompt. It prints `Token: issued for the delegation`.

## Verification scope

References below to `tests/integration` or `tests/e2e` belong to the separate private service
repository. This public repository verifies packed-consumer types and builds; it does not
include those issuer-backed tests or establish live provider acceptance.

### Recorded checks

`tests/integration/agent-claim-example.test.ts` spawns this file against the local issuer: registration, code and QR
code, claim, delegation and the token request through the SDK, with no token or secret in the output.
