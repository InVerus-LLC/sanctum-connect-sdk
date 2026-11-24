import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectSanctumWallet,
  ProviderRpcError,
  type WalletSessionTransport,
} from "../../packages/connect/src/index.ts";

test("a cancelled wallet connection ends its proposed session (core SDK)", async () => {
  const ended: string[] = [];
  let proposals = 0;
  const transport: WalletSessionTransport = {
    propose: async () => {
      proposals += 1;
      return {
        sessionId: "s1",
        sessionToken: "t1",
        pairingUri: "https://id.example.com/wallet-link#p",
        status: "proposed",
        accounts: [],
        chain: null,
        expiresAt: "",
      };
    },
    state: async () => ({ sessionId: "s1", status: "proposed", accounts: [], chain: null, expiresAt: "" }),
    send: async () => {
      throw new Error("unused");
    },
    result: async () => {
      throw new Error("unused");
    },
    end: async (session) => {
      ended.push(session.sessionId);
    },
  };
  const abort = new AbortController();
  const pairing: string[] = [];
  const connecting = connectSanctumWallet({
    transport,
    chains: ["eip155:84532"],
    methods: ["personal_sign"],
    pollMs: 5,
    signal: abort.signal,
    onPairingUri: (uri) => pairing.push(uri),
  });
  setTimeout(() => abort.abort(), 20);
  await assert.rejects(connecting, (error: unknown) => error instanceof ProviderRpcError && error.code === 4001);
  assert.deepEqual([pairing.length, ended], [1, ["s1"]]);
  const early = new AbortController();
  early.abort();
  await assert.rejects(
    connectSanctumWallet({
      transport,
      chains: ["eip155:84532"],
      methods: ["personal_sign"],
      signal: early.signal,
      onPairingUri: (uri) => pairing.push(uri),
    }),
  );
  assert.deepEqual(
    [proposals, pairing.length, ended],
    [1, 1, ["s1"]],
    "already aborted: no additional proposal, pairing link or session to end",
  );
  // An in-flight proposal can still arrive after cancellation if transport ignores the signal.
  let releaseProposal: () => void = () => {
    throw new Error("proposal gate not ready");
  };
  const proposalGate = new Promise<void>((resolve) => {
    releaseProposal = resolve;
  });
  let proposalStarted: () => void = () => {
    throw new Error("proposal start gate not ready");
  };
  const started = new Promise<void>((resolve) => {
    proposalStarted = resolve;
  });
  const late: WalletSessionTransport = {
    ...transport,
    propose: async (input, options) => {
      const proposal = await transport.propose(input, options);
      proposalStarted();
      await proposalGate;
      return proposal;
    },
  };
  const cancelledProposal = new AbortController();
  const proposing = connectSanctumWallet({
    transport: late,
    chains: ["eip155:84532"],
    methods: ["personal_sign"],
    signal: cancelledProposal.signal,
    onPairingUri: (uri) => pairing.push(uri),
  });
  await started;
  cancelledProposal.abort();
  releaseProposal();
  await assert.rejects(
    proposing,
    (error: unknown) => error instanceof ProviderRpcError && error.code === 4001 && error.reason === "aborted",
  );
  assert.deepEqual(
    [proposals, pairing.length, ended],
    [2, 1, ["s1", "s1"]],
    "late proposal is ended without displaying its pairing link",
  );
  // Cancelled while a state request is running: the next wait stops at once instead of polling on.
  let polls = 0;
  const slow: WalletSessionTransport = {
    ...transport,
    state: async () => {
      polls += 1;
      if (polls > 20) throw new Error("still polling after cancel");
      await new Promise((resolve) => setTimeout(resolve, 30));
      return transport.state({ sessionId: "s1", sessionToken: "t1" });
    },
  };
  const during = new AbortController();
  const waiting = connectSanctumWallet({
    transport: slow,
    chains: ["eip155:84532"],
    methods: ["personal_sign"],
    pollMs: 1,
    signal: during.signal,
    onPairingUri: () => undefined,
  });
  setTimeout(() => during.abort(), 10);
  await assert.rejects(waiting, (error: unknown) => error instanceof ProviderRpcError && error.code === 4001);
  assert.deepEqual([polls, ended.length], [1, 3], "one poll, then the proposal is ended");
});
