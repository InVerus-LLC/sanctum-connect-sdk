/**
 * Type-check fixture for a Node-only consumer of the PACKED core SDK (NodeNext resolution,
 * @types/node, no DOM lib, skipLibCheck off), copied into the consumer project by consumer-smoke.ts.
 * Inside the repository the root TypeScript project also compiles it against the workspace source.
 * The core SDK's declarations need only what Node provides (fetch, AbortSignal, EventTarget).
 */
import {
  agentResourceRequest,
  createDpopKey,
  exchangeAgentToken,
  registerAgentWithSanctum,
  requestAgentToken,
  SanctumConnect,
  SanctumConnectError,
  type AgentToken,
  type SanctumConnectErrorCode,
} from "@sanctum.ai/connect";
import { qrTerminal } from "@sanctum.ai/connect/qr";

export async function confidential(signal: AbortSignal): Promise<string> {
  const sanctum = await SanctumConnect.discover(
    {
      issuer: "https://id.example.com",
      clientId: "c",
      clientSecret: "s",
      redirectUri: "https://app.example.com/cb",
      fetch,
    },
    { signal },
  );
  const next = await sanctum.refresh("r", { signal });
  await sanctum.revoke(next.accessToken, { signal });
  return sanctum.signOutUrl({ idTokenHint: "t" }).href;
}

export async function agent(signal: AbortSignal): Promise<number> {
  const registration = await registerAgentWithSanctum({
    issuer: "https://id.example.com",
    name: "Agent",
    publicKey: { kty: "OKP" },
    signal,
  });
  console.log(qrTerminal(registration.verificationUriComplete));
  const { clientId } = await registration.waitForClaim({ signal });
  const dpop = await createDpopKey();
  const token: AgentToken = await requestAgentToken({
    issuer: "https://id.example.com",
    auth: { clientId, clientSecret: "s" },
    resource: "https://api.example.com",
    grantId: "g",
    dpop,
    signal,
  });
  const handed = await exchangeAgentToken({
    issuer: "https://id.example.com",
    auth: { clientAssertion: "jwt" },
    resource: "https://api.example.com",
    subjectToken: token.accessToken,
    tools: ["read"],
    signal,
  });
  const response = await agentResourceRequest({
    token: handed,
    dpop,
    method: "GET",
    url: "https://api.example.com/x",
    signal,
  });
  return response.status;
}

export const cancelled = (error: unknown): boolean =>
  error instanceof SanctumConnectError && error.code === ("aborted" satisfies SanctumConnectErrorCode);
