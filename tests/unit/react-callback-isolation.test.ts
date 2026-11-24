import assert from "node:assert/strict";
import { test } from "node:test";
import { completeSignIn, type TransactionStore } from "../../packages/connect-react/src/transactions.ts";
import type { SignInResult } from "../../packages/connect/src/index.ts";

const result: SignInResult = {
  subject: "synthetic-subject",
  claims: { sub: "synthetic-subject", iss: "https://id.example.test", aud: "synthetic-client", iat: 0, exp: 300 },
  idToken: "synthetic-id",
  accessToken: "synthetic-access",
};

function transaction(state: string): TransactionStore {
  let taken = false;
  return {
    put() {
      throw new Error("not used");
    },
    take() {
      if (taken) return null;
      taken = true;
      return {
        state,
        nonce: "synthetic-nonce",
        codeVerifier: "synthetic-verifier",
        redirectUri: "https://app.example.test/callback",
      };
    },
  };
}

test("a callback result is never shared with another client or store", async () => {
  const state = crypto.randomUUID();
  const url = `https://app.example.test/callback?state=${state}&code=synthetic-code`;
  const gate = Promise.withResolvers<SignInResult>();
  const client = { finishSignIn: () => gate.promise };
  const store = transaction(state);
  const first = completeSignIn(client, store, url);
  const other = {
    finishSignIn: async () => {
      throw new Error("foreign client must not exchange");
    },
  };
  const empty: TransactionStore = { put() {}, take: () => null };
  const otherClient = assert.rejects(completeSignIn(other, empty, url), { code: "transaction_missing" });
  const otherStore = assert.rejects(completeSignIn(client, empty, url), { code: "transaction_missing" });
  gate.resolve(result);
  await Promise.all([otherClient, otherStore]);
  await first;
});

test("only identical concurrent callbacks share an exchange; settled results are forgotten", async () => {
  const state = crypto.randomUUID();
  const url = `https://app.example.test/callback?state=${state}&code=synthetic-code`;
  const gate = Promise.withResolvers<SignInResult>();
  let calls = 0;
  const client = {
    finishSignIn() {
      calls += 1;
      return gate.promise;
    },
  };
  const store = transaction(state);
  const first = completeSignIn(client, store, url);
  const second = completeSignIn(client, store, url);
  const changed = assert.rejects(completeSignIn(client, store, `${url}-changed`), { code: "transaction_missing" });
  gate.resolve(result);
  await changed;
  assert.deepEqual(await Promise.all([first, second]), [result, result]);
  assert.equal(calls, 1);
  await assert.rejects(completeSignIn(client, store, url), { code: "transaction_missing" });
});
