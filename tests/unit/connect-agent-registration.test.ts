/**
 * The SDK's agent registration helper against a fake issuer: it sends only the public key, honours
 * pending and slow_down, returns the client ID once claimed, and ends truthfully when the claim is
 * denied or the registration expired; it refuses a private key and plain http off loopback.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { registerAgentWithSanctum } from "../../packages/connect/src/index.ts";

const PUBLIC = { kty: "OKP", crv: "Ed25519", x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" };

function fakeIssuer(answers: Record<string, unknown>[], interval = 0.001) {
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    sent.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    if (path === "/agent/v1/registrations") {
      return new Response(JSON.stringify({ device_code: "d".repeat(43), user_code: "WDJB-MJHT", verification_uri: "https://id.example.com/agents/claim",
        verification_uri_complete: "https://id.example.com/agents/claim#code=WDJB-MJHT", expires_in: 600, interval }), { status: 201 });
    }
    const answer = answers.shift() ?? { error: "expired_token" };
    return new Response(JSON.stringify(answer), { status: "client_id" in answer ? 200 : 400 });
  }) as typeof fetch;
  return { sent, fetcher };
}

test("registers with the public key only and waits through pending until claimed", async () => {
  const { sent, fetcher } = fakeIssuer([{ error: "authorization_pending" }, { error: "authorization_pending" }, { client_id: "agt_example", owner_kind: "organization" }]);
  const registration = await registerAgentWithSanctum({ issuer: "https://id.example.com", name: "Helper", publicKey: PUBLIC, fetch: fetcher });
  assert.deepEqual([registration.userCode, registration.verificationUriComplete], ["WDJB-MJHT", "https://id.example.com/agents/claim#code=WDJB-MJHT"]);
  assert.deepEqual(await registration.waitForClaim(), { clientId: "agt_example", ownerKind: "organization" });
  assert.deepEqual(sent[0], { path: "/agent/v1/registrations", body: { name: "Helper", public_key: PUBLIC } });
  assert.deepEqual(sent.slice(1).map((call) => call.body), Array(3).fill({ device_code: "d".repeat(43) }));
});

test("a denied or expired registration ends with a clear error; cancelling stops waiting", async () => {
  const denied = await registerAgentWithSanctum({ issuer: "https://id.example.com", name: "Helper", publicKey: PUBLIC, fetch: fakeIssuer([{ error: "access_denied" }]).fetcher });
  await assert.rejects(denied.waitForClaim(), { code: "access_denied" });
  const expired = await registerAgentWithSanctum({ issuer: "https://id.example.com", name: "Helper", publicKey: PUBLIC, fetch: fakeIssuer([{ error: "expired_token" }]).fetcher });
  await assert.rejects(expired.waitForClaim(), { code: "expired" });
  const slow = await registerAgentWithSanctum({ issuer: "https://id.example.com", name: "Helper", publicKey: PUBLIC, fetch: fakeIssuer([], 60).fetcher });
  const abort = new AbortController();
  const waiting = slow.waitForClaim({ signal: abort.signal });
  abort.abort();
  await assert.rejects(waiting, { code: "aborted" }, "a cancelled wait says it was cancelled, not denied");
});

test("a private key or a plain-http issuer off loopback is refused before anything is sent", async () => {
  const { sent, fetcher } = fakeIssuer([]);
  await assert.rejects(registerAgentWithSanctum({ issuer: "https://id.example.com", name: "Helper", publicKey: { ...PUBLIC, d: "secret" }, fetch: fetcher }), { code: "configuration" });
  await assert.rejects(registerAgentWithSanctum({ issuer: "http://id.example.com", name: "Helper", publicKey: PUBLIC, fetch: fetcher }), { code: "configuration" });
  assert.equal(sent.length, 0);
});
