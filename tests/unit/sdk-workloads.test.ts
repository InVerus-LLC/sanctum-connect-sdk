import assert from "node:assert/strict";
import { test } from "node:test";
import { createDpopKey } from "../../packages/connect/src/agent-tokens.ts";
import { requestWorkloadToken, JWT_BEARER_GRANT } from "../../packages/connect/src/workloads.ts";

const request = {
  issuer: "https://issuer.example.test",
  clientId: `agt_${"a".repeat(24)}`,
  workloadAssertion: "synthetic.signed.assertion",
  grantId: "11111111-1111-4111-8111-111111111111",
  resource: "https://tools.example.test/mcp",
};

test("workload SDK sends RFC7523 grant assertion without client-secret/client-assertion authentication", async () => {
  let calls = 0;
  const token = await requestWorkloadToken({
    ...request,
    tools: ["read_profile"],
    fetch: async (url, init) => {
      calls += 1;
      assert.equal(String(url), "https://issuer.example.test/token");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("grant_type"), JWT_BEARER_GRANT);
      assert.equal(body.get("client_id"), request.clientId);
      assert.equal(body.get("assertion"), request.workloadAssertion);
      assert.equal(body.get("grant_id"), request.grantId);
      assert.equal(body.get("resource"), request.resource);
      assert.deepEqual(JSON.parse(body.get("authorization_details")!), [
        { type: "sanctum_delegation", locations: [request.resource], actions: ["read_profile"] },
      ]);
      assert.equal(body.has("client_assertion"), false);
      assert.equal(body.has("client_secret"), false);
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return Response.json({ access_token: "synthetic-token", token_type: "Bearer", expires_in: 120 });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(token, { accessToken: "synthetic-token", tokenType: "Bearer", expiresIn: 120 });
});

test("workload configuration and pre-aborted calls fail before exposing an assertion to fetch", async () => {
  let calls = 0;
  const send: typeof fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };
  for (const changed of [
    { issuer: "http://issuer.example.test" },
    { issuer: "https://issuer.example.test/other" },
    { issuer: "https://user:secret@issuer.example.test" },
    { clientId: "ordinary-client" },
    { workloadAssertion: "" },
    { workloadAssertion: "a".repeat(8193) },
    { grantId: "" },
    { resource: "" },
  ])
    await assert.rejects(requestWorkloadToken({ ...request, ...changed, fetch: send }), { code: "configuration" });
  await assert.rejects(requestWorkloadToken({ ...request, fetch: send, signal: AbortSignal.abort() }), {
    code: "aborted",
  });
  assert.equal(calls, 0);
});

test("workload token refusals and malformed successes do not become usable tokens", async () => {
  for (const response of [
    () => Response.json({ error: "invalid_grant", error_description: "assertion_replayed" }, { status: 400 }),
    () => Response.json({ token_type: "Bearer", expires_in: 300 }),
  ]) {
    let calls = 0;
    await assert.rejects(
      requestWorkloadToken({
        ...request,
        fetch: async () => {
          calls += 1;
          return response();
        },
      }),
      { code: "token_failed" },
    );
    assert.equal(calls, 1, "ordinary token failures never replay a one-use assertion");
  }
});

test("workload DPoP retries only the nonce challenge and refuses an unbound token", async () => {
  const dpop = await createDpopKey();
  let calls = 0;
  await assert.rejects(
    requestWorkloadToken({
      ...request,
      dpop,
      fetch: async (_url, init) => {
        calls += 1;
        assert.ok(new Headers(init?.headers).get("dpop"));
        return calls === 1
          ? Response.json({ error: "use_dpop_nonce" }, { status: 400, headers: { "dpop-nonce": "synthetic-nonce" } })
          : Response.json({ access_token: "synthetic-token", token_type: "Bearer", expires_in: 120 });
      },
    }),
    { code: "token_failed" },
  );
  assert.equal(calls, 2);
});
