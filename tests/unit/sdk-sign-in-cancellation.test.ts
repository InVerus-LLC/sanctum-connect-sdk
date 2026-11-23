/** A cancelled sign-in must not finish while its final ID-token signature check is in flight. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { SanctumConnect, SanctumConnectError } from "../../packages/connect/src/index.ts";

const ISSUER = "https://id.example.test";
const CLIENT = "sdk-cancellation-client";
const REDIRECT = "https://app.example.test/callback";
const METADATA = {
  issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`,
  userinfo_endpoint: `${ISSUER}/userinfo`, revocation_endpoint: `${ISSUER}/revoke`, end_session_endpoint: `${ISSUER}/logout`,
  code_challenge_methods_supported: ["S256"], id_token_signing_alg_values_supported: ["ES256"], authorization_response_iss_parameter_supported: true,
};

async function heldKeys(honorAbort = true) {
  const pair = await generateKeyPair("ES256");
  const publicKey = { ...await exportJWK(pair.publicKey), kid: "synthetic-key", alg: "ES256", use: "sig" };
  let nonce = "";
  let release: () => void = () => { throw new Error("keys not initialized"); };
  const held = new Promise<void>((resolve) => { release = resolve; });
  let requested: () => void = () => { throw new Error("request not initialized"); };
  const started = new Promise<void>((resolve) => { requested = resolve; });
  const keySignals: (AbortSignal | null | undefined)[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    if (path === "/.well-known/openid-configuration") return Response.json(METADATA);
    if (path === "/token") {
      const token = await new SignJWT({ nonce }).setProtectedHeader({ alg: "ES256", kid: publicKey.kid })
        .setIssuer(ISSUER).setAudience(CLIENT).setSubject("synthetic-person").setIssuedAt().setExpirationTime("5m").sign(pair.privateKey);
      return Response.json({ access_token: "synthetic-access-token", token_type: "Bearer", expires_in: 300, id_token: token });
    }
    if (path !== "/jwks") throw new Error("Unexpected synthetic issuer request");
    keySignals.push(init.signal);
    requested();
    await held;
    if (honorAbort && init.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    return Response.json({ keys: [publicKey] });
  };
  const client = await SanctumConnect.discover({ issuer: ISSUER, clientId: CLIENT, redirectUri: REDIRECT, fetch: fetcher });
  const { transaction } = await client.startSignIn();
  nonce = transaction.nonce;
  const callback = `${REDIRECT}?code=synthetic-code&state=${transaction.state}&iss=${encodeURIComponent(ISSUER)}`;
  return { client, callback, transaction, started, release, keySignals };
}

test("finishSignIn sends its AbortSignal to the JWKS request and rejects cancellation during signature validation", async () => {
  const issuer = await heldKeys();
  const controller = new AbortController();
  const running = issuer.client.finishSignIn(issuer.callback, issuer.transaction, { signal: controller.signal });
  await issuer.started;
  controller.abort();
  issuer.release();
  await assert.rejects(running, (error: unknown) => error instanceof SanctumConnectError && error.code === "aborted");
  assert.equal(issuer.keySignals[0]?.aborted, true, "the final network request follows the caller's cancellation");
});


test("finishSignIn rejects a late valid key response from a fetch that ignores cancellation", async () => {
  const issuer = await heldKeys(false);
  const controller = new AbortController();
  const running = issuer.client.finishSignIn(issuer.callback, issuer.transaction, { signal: controller.signal });
  await issuer.started;
  controller.abort();
  issuer.release();
  await assert.rejects(running, (error: unknown) => error instanceof SanctumConnectError && error.code === "aborted");
});


test("uncancelled sign-in still verifies the ID token and returns its subject", async () => {
  const issuer = await heldKeys();
  const running = issuer.client.finishSignIn(issuer.callback, issuer.transaction);
  await issuer.started;
  issuer.release();
  const signedIn = await running;
  assert.equal(signedIn.subject, "synthetic-person");
  assert.equal(signedIn.claims.iss, ISSUER);
  assert.equal(signedIn.claims.aud, CLIENT);
});
