/**
 * An agent runtime that registers itself with Sanctum and waits to be claimed (development
 * example). It creates an Ed25519 key pair in memory, sends only the public key, prints the code
 * and a QR code of the claim link for its operator, then prints its client ID once claimed. The
 * operator can then paste the ID of a delegation they gave it: the agent gets an access token for
 * SANCTUM_RESOURCE with the SDK's requestAgentToken and a signed assertion (RFC 7523), and reports
 * only that it worked (the token itself is never printed). With SANCTUM_RESOURCE_URL it also calls
 * that URL with the token (agentResourceRequest) and prints the status.
 * A real runtime keeps its private key in its own secret store; this example keeps it in memory.
 * jose signs the assertion here; any JWS library (or a KMS) works, the SDK only sends it.
 *
 *   SANCTUM_ISSUER=https://id.example.com node examples/agent-claim/src/agent.ts
 *   (SANCTUM_ALLOW_LOOPBACK=1 allows an http://localhost issuer during development; see README.md)
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  agentResourceRequest,
  registerAgentWithSanctum,
  requestAgentToken,
  SanctumConnectError,
} from "@sanctum.ai/connect";
import { qrTerminal } from "@sanctum.ai/connect/qr";

const issuer = process.env.SANCTUM_ISSUER ?? "";
const allowInsecureLoopback = process.env.SANCTUM_ALLOW_LOOPBACK === "1";
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
const publicJwk = await exportJWK(publicKey);

const registration = await registerAgentWithSanctum({
  issuer,
  name: process.env.SANCTUM_AGENT_NAME ?? "Example agent",
  publicKey: publicJwk as Record<string, unknown>,
  allowInsecureLoopback,
});
console.log(`Claim this agent at ${registration.verificationUri}`);
console.log(`Code: ${registration.userCode}`);
console.log(qrTerminal(registration.verificationUriComplete));
console.log(`The code works until ${registration.expiresAt.toLocaleTimeString()}.`);

const { clientId, ownerKind } = await registration.waitForClaim();
console.log(
  `Claimed: ${clientId} (owned by ${ownerKind === "organization" ? "an organization" : "a person"}; no access until something is delegated)`,
);

const resource = process.env.SANCTUM_RESOURCE;
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const grantId = resource ? (await prompt.question("Delegation ID (Enter to finish): ")).trim() : "";
prompt.close();
if (grantId && resource) {
  const now = Math.floor(Date.now() / 1000);
  // A fresh, short-lived assertion for this one request (RFC 7523); the private key never leaves.
  const clientAssertion = await new SignJWT({
    iss: clientId,
    sub: clientId,
    aud: issuer,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: "EdDSA" })
    .sign(privateKey);
  try {
    const token = await requestAgentToken({
      issuer,
      auth: { clientAssertion },
      resource,
      grantId,
      allowInsecureLoopback,
      signal: AbortSignal.timeout(15_000),
    });
    console.log("Token: issued for the delegation");
    const url = process.env.SANCTUM_RESOURCE_URL;
    if (url) {
      const response = await agentResourceRequest({
        token,
        method: "GET",
        url,
        allowInsecureLoopback,
        signal: AbortSignal.timeout(15_000),
      });
      console.log(`Resource: ${response.status}`);
    }
  } catch (error) {
    console.log(`Token: refused (${error instanceof SanctumConnectError ? error.code : "error"})`);
  }
}
