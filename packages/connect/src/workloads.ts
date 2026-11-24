/** RFC 7523 workload grants. The workload assertion is not an OAuth client assertion. */
import * as oauth from "oauth4webapi";
import {
  http,
  loopbackOnly,
  narrowing,
  tokenAnswer,
  tokenOf,
  type AgentHttpOptions,
  type AgentToken,
  type DpopKeyPair,
} from "./agent-tokens.ts";
import { SanctumConnectError, throwIfAborted } from "./errors.ts";

export const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

export interface WorkloadTokenRequest extends AgentHttpOptions {
  /** Sanctum issuer origin, from trusted deployment configuration. */
  issuer: string;
  clientId: string;
  /** Short-lived signed assertion obtained from the runtime's trusted CI/cloud platform. */
  workloadAssertion: string;
  grantId: string;
  resource: string;
  /** Optional narrowing; never adds tools beyond the existing delegation. */
  tools?: string[];
  dpop?: DpopKeyPair;
}

/**
 * Exchanges an already obtained platform assertion for one existing delegation/resource.
 * This helper cannot register a trust, create consent, or authenticate an untrusted platform.
 * The issuer checks its owner-approved trust, exact claims, current grant and one-use assertion.
 * Supply a new assertion for a new attempt; never put one in logs, URLs or persistent browser storage.
 */
export async function requestWorkloadToken(request: WorkloadTokenRequest): Promise<AgentToken> {
  throwIfAborted(request.signal);
  const issuer = loopbackOnly(request.issuer, request, "The issuer");
  if (
    issuer.origin !== request.issuer ||
    issuer.username ||
    issuer.password ||
    !/^agt_[A-Za-z0-9_-]{24,64}$/u.test(request.clientId) ||
    !request.workloadAssertion ||
    request.workloadAssertion.length > 8192 ||
    !request.grantId ||
    !request.resource
  ) {
    throw new SanctumConnectError(
      "configuration",
      "Workload requests require an issuer origin, agent client ID, bounded assertion, delegation and resource",
    );
  }
  const client: oauth.Client = {
    client_id: request.clientId,
    ...(request.clockSkewSeconds ? { [oauth.clockSkew]: request.clockSkewSeconds } : {}),
  };
  const as: oauth.AuthorizationServer = { issuer: issuer.origin, token_endpoint: `${issuer.origin}/token` };
  const parameters = new URLSearchParams({
    client_id: request.clientId,
    assertion: request.workloadAssertion,
    grant_id: request.grantId,
    resource: request.resource,
  });
  if (request.tools) parameters.set("authorization_details", narrowing(request.resource, request.tools));
  const options = http(request, request.dpop, client);
  const answer = await tokenAnswer("The workload token request", Boolean(request.dpop), request.signal, async () =>
    oauth.processGenericTokenEndpointResponse(
      as,
      client,
      await oauth.genericTokenEndpointRequest(as, client, oauth.None(), JWT_BEARER_GRANT, parameters, options),
    ),
  );
  return tokenOf(answer);
}
