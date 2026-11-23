/**
 * The React wallet-session state machine (@inverus/connect-react, matrix W-08): a session resumed
 * after a reload becomes connected only from idle; a session that ends while connected (the person
 * disconnected on Sanctum, the app was withdrawn, it expired) returns to idle with an explanation;
 * both are ignored for an older attempt.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { initialWalletState, walletReducer } from "../../packages/connect-react/src/index.ts";

test("resumed and ended transitions, for the current attempt only", () => {
  const resumed = walletReducer({ ...initialWalletState, attempt: 1 }, { type: "resumed", attempt: 1, accounts: ["0x1"], chainId: "0x14a34" });
  assert.deepEqual([resumed.status, resumed.accounts, resumed.chainId], ["connected", ["0x1"], "0x14a34"]);
  const proposing = walletReducer(initialWalletState, { type: "start", attempt: 2 });
  assert.equal(walletReducer(proposing, { type: "resumed", attempt: 2, accounts: ["0x1"], chainId: "0x14a34" }), proposing, "a resume never replaces a connection in progress");
  const ended = walletReducer(resumed, { type: "ended", attempt: 1, message: "The wallet session ended." });
  assert.deepEqual([ended.status, ended.accounts, ended.error], ["idle", [], "The wallet session ended."]);
  assert.equal(walletReducer(resumed, { type: "ended", attempt: 0, message: "stale" }), resumed, "an older attempt's end is ignored");
  assert.equal(walletReducer(proposing, { type: "ended", attempt: 2, message: "x" }), proposing, "only a connected session can end");
});
