/**
 * AbortSignal on every long-running core SDK call (W-19): discovery, the code exchange, userinfo,
 * refresh, revocation, agent registration and its polling, agent tokens, token exchange and
 * resource calls. The caller's signal reaches fetch; an abort rejects with SanctumConnectError code
 * "aborted" (a typed code, not a raw DOMException), already-aborted signals send nothing, and a
 * call without a signal still works. Uses fake issuers; nothing leaves the process.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentResourceRequest, exchangeAgentToken, registerAgentWithSanctum, requestAgentToken, SanctumConnect, SanctumConnectError,
} from "../../packages/connect/src/index.ts";

const ISSUER = "https://id.example.com";
const METADATA = {
  issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`,
  userinfo_endpoint: `${ISSUER}/userinfo`, revocation_endpoint: `${ISSUER}/revoke`, end_session_endpoint: `${ISSUER}/logout`,
  code_challenge_methods_supported: ["S256"], id_token_signing_alg_values_supported: ["ES256"], authorization_response_iss_parameter_supported: true,
};

/** Answers discovery and agent registration at once; every other request waits until its signal aborts. */
function fakeIssuer() {
  const requests: { path: string; signal: AbortSignal | null | undefined }[] = [];
  const fetcher = ((input: string | URL, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, signal: init.signal });
    if (init.signal?.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
    if (path === "/.well-known/openid-configuration") return Promise.resolve(Response.json(METADATA));
    if (path === "/agent/v1/registrations") {
      return Promise.resolve(Response.json({ device_code: "d".repeat(43), user_code: "WDJB-MJHT", verification_uri: `${ISSUER}/agents/claim`, verification_uri_complete: `${ISSUER}/agents/claim#c`, expires_in: 600, interval: 0.001 }, { status: 201 }));
    }
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;
  return { requests, fetcher };
}

const isAborted = (error: unknown) => error instanceof SanctumConnectError && error.code === "aborted";

/** Starts `run` with a fresh signal, aborts it once the request is in flight, and expects "aborted". */
async function abortsInFlight(issuer: ReturnType<typeof fakeIssuer>, path: string, run: (signal: AbortSignal) => Promise<unknown>) {
  const abort = new AbortController();
  const before = issuer.requests.length;
  const running = run(abort.signal);
  for (let tries = 0; tries < 50 && !issuer.requests.slice(before).some((request) => request.path === path); tries += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  const request = issuer.requests.slice(before).find((entry) => entry.path === path);
  assert.ok(request, `a request to ${path} was sent`);
  assert.equal(request.signal?.aborted, false);
  abort.abort();
  await assert.rejects(running, isAborted, path);
  assert.equal(request.signal?.aborted, true, `the caller's signal reached the ${path} request`);
}

test("discovery, the code exchange, userinfo, refresh and revocation take an AbortSignal", async () => {
  const issuer = fakeIssuer();
  const config = { issuer: ISSUER, clientId: "client-1", redirectUri: "https://app.example.com/callback", fetch: issuer.fetcher };
  const early = new AbortController();
  early.abort();
  await assert.rejects(SanctumConnect.discover(config, { signal: early.signal }), isAborted, "an aborted discovery");
  const client = await SanctumConnect.discover(config);
  const { transaction } = await client.startSignIn();
  const callback = `https://app.example.com/callback?code=c0de&state=${transaction.state}&iss=${encodeURIComponent(ISSUER)}`;
  await abortsInFlight(issuer, "/token", (signal) => client.finishSignIn(callback, transaction, { signal }));
  await abortsInFlight(issuer, "/token", (signal) => client.refresh("r".repeat(43), { signal }));
  await abortsInFlight(issuer, "/revoke", (signal) => client.revoke("t".repeat(43), { signal }));
  await abortsInFlight(issuer, "/userinfo", (signal) => client.userInfo("t".repeat(43), "subject", { signal }));
});

test("agent registration, tokens, token exchange and resource calls take an AbortSignal", async () => {
  const issuer = fakeIssuer();
  const PUBLIC = { kty: "OKP", crv: "Ed25519", x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" };
  const early = new AbortController();
  early.abort();
  await assert.rejects(registerAgentWithSanctum({ issuer: ISSUER, name: "Helper", publicKey: PUBLIC, fetch: issuer.fetcher, signal: early.signal }), isAborted);
  const registration = await registerAgentWithSanctum({ issuer: ISSUER, name: "Helper", publicKey: PUBLIC, fetch: issuer.fetcher });
  const polling = new AbortController();
  const waiting = registration.waitForClaim({ signal: polling.signal });
  for (let tries = 0; tries < 50 && !issuer.requests.some((request) => request.path === "/agent/v1/registrations/poll"); tries += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  polling.abort();
  await assert.rejects(waiting, SanctumConnectError, "a cancelled wait ends");
  assert.equal(issuer.requests.find((request) => request.path === "/agent/v1/registrations/poll")?.signal, polling.signal, "the poll request carries the signal");

  const auth = { clientId: "agt_1", clientSecret: "s".repeat(43) };
  await abortsInFlight(issuer, "/token", (signal) => requestAgentToken({ issuer: ISSUER, auth, resource: "https://api.example.com", grantId: "g1", fetch: issuer.fetcher, signal }));
  await abortsInFlight(issuer, "/token", (signal) => exchangeAgentToken({ issuer: ISSUER, auth, resource: "https://api.example.com", subjectToken: "x".repeat(43), fetch: issuer.fetcher, signal }));
  const token = { accessToken: "a".repeat(43), expiresIn: 60, tokenType: "Bearer" as const };
  await abortsInFlight(issuer, "/orders", (signal) => agentResourceRequest({ token, method: "GET", url: `${ISSUER}/orders`, fetch: issuer.fetcher, signal }));
});

test("an already-aborted signal sends nothing, even through a fetch that ignores signals", async () => {
  let sent = 0;
  const ignoring = (async () => { sent += 1; return Response.json(METADATA); }) as typeof fetch;
  const early = new AbortController();
  early.abort();
  const config = { issuer: ISSUER, clientId: "client-1", redirectUri: "https://app.example.com/callback", fetch: ignoring };
  await assert.rejects(SanctumConnect.discover(config, { signal: early.signal }), isAborted);
  const client = await SanctumConnect.discover(config);
  sent = 0;
  await assert.rejects(client.refresh("r".repeat(43), { signal: early.signal }), isAborted);
  await assert.rejects(client.revoke("t".repeat(43), { signal: early.signal }), isAborted);
  await assert.rejects(client.userInfo("t".repeat(43), "subject", { signal: early.signal }), isAborted);
  const auth = { clientId: "agt_1", clientSecret: "s".repeat(43) };
  await assert.rejects(requestAgentToken({ issuer: ISSUER, auth, resource: "https://api.example.com", grantId: "g1", fetch: ignoring, signal: early.signal }), isAborted);
  await assert.rejects(agentResourceRequest({ token: { accessToken: "a".repeat(43), expiresIn: 60, tokenType: "Bearer" }, method: "GET", url: `${ISSUER}/x`, fetch: ignoring, signal: early.signal }), isAborted);
  assert.equal(sent, 0, "nothing was sent");
});

test("the typed codes include aborted, and a call without a signal is unchanged", async () => {
  const error = new SanctumConnectError("aborted", "Cancelled");
  assert.deepEqual([error.name, error.code], ["SanctumConnectError", "aborted"]);
  const issuer = fakeIssuer();
  const client = await SanctumConnect.discover({ issuer: ISSUER, clientId: "client-1", redirectUri: "https://app.example.com/callback", fetch: issuer.fetcher });
  assert.equal(client.issuer, ISSUER);
  assert.equal(issuer.requests.length, 1);
  assert.ok(issuer.requests[0]!.signal === undefined || issuer.requests[0]!.signal?.aborted === false);
});
