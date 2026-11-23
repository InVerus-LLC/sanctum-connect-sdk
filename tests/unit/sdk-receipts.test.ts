import assert from "node:assert/strict";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifySignedReceipts } from "@inverus/connect/receipts";
import { GENESIS_HASH, RECEIPT_CHECKPOINT_CLAIM, RECEIPT_CHECKPOINT_TYP } from "../../packages/connect/src/receipt-chain.ts";

const issuer = "https://issuer.example.test";
const owner = "receipt-owner";
async function fixture() {
  const pair = await generateKeyPair("ES256", { extractable: true });
  const key = { ...await exportJWK(pair.publicKey), kid: "receipt-key", alg: "ES256", use: "sig" };
  const head = { seq: 0, hash: GENESIS_HASH };
  const checkpoint = await new SignJWT({ iss: issuer, [RECEIPT_CHECKPOINT_CLAIM]: { v: 1, owner, seq: 0, head: head.hash } })
    .setProtectedHeader({ alg: "ES256", kid: key.kid, typ: RECEIPT_CHECKPOINT_TYP }).sign(pair.privateKey);
  return { exported: { version: 1, owner, receipts: [], head, next: null, checkpoint }, options: { issuer, owner, keys: { keys: [key] } } };
}

test("SDK receipt entry requires signed evidence bound to the expected issuer and owner", async () => {
  const { exported, options } = await fixture();
  assert.equal((await verifySignedReceipts(exported, options)).valid, true);
  assert.equal((await verifySignedReceipts(exported, { ...options, issuer: "https://other.example.test" })).valid, false);
  assert.equal((await verifySignedReceipts(exported, { ...options, owner: "other-owner" })).valid, false);
  assert.equal((await verifySignedReceipts({ ...exported, checkpoint: null }, options)).valid, false);
  assert.equal((await verifySignedReceipts(exported, { ...options, keys: { keys: [] } })).valid, false);
});

test("SDK receipt boundary rejects malformed JSON values without throwing or accepting partial exports", async () => {
  const { exported, options } = await fixture();
  for (const value of [null, [], {}, "export", { ...exported, head: null }, { ...exported, receipts: [null] },
    { ...exported, head: { seq: -1, hash: GENESIS_HASH } }, { ...exported, next: 1 },
    { ...exported, receipts: [{ seq: 1, prevHash: GENESIS_HASH, hash: GENESIS_HASH, body: {} }] }]) {
    assert.equal((await verifySignedReceipts(value, options)).valid, false);
  }
  assert.equal((await verifySignedReceipts(exported, { ...options, issuer: "" })).valid, false);
  assert.equal((await verifySignedReceipts(exported, { ...options, from: { seq: -1, hash: GENESIS_HASH } })).valid, false);
});
