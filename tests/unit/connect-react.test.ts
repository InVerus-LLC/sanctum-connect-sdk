/**
 * @inverus/connect-react without a browser: server rendering touches no browser API and makes no
 * request; the mark is the canonical geometry; the transaction store keeps only the transaction,
 * once, for ten minutes; a callback is finished once per sign-in; the wallet state machine ignores
 * stale attempts; theme values can't inject CSS; and a cancelled wallet connection ends its
 * proposed session (core SDK).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { connectSanctumWallet, ProviderRpcError, type WalletSessionTransport } from "../../packages/connect/src/index.ts";
import {
  completeSignIn, drawerReducer, initialDrawerState, initialWalletState, parseKit, SanctumMark, SanctumProvider, SanctumWalletConnect, sessionTransactionStore,
  SignInButton, SignInCallback, SignInDrawerButton, themeCss, useSanctum, useWalletSession, walletReducer,
} from "../../packages/connect-react/src/index.ts";
import { MARK_PATH, MARK_VIEW_BOX } from "../../packages/connect-react/src/mark-path.ts";
import { qrModules } from "../../packages/connect/src/qr.ts";
import { SanctumQrCode } from "../../packages/connect-react/src/index.ts";
import { decodeModules, modulesFromPath } from "../support/qr-decode.ts";

const CONFIG = { issuer: "https://id.example.com", clientId: "client-1", redirectUri: "https://app.example.com/callback" };

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
    clear: () => items.clear(),
  };
}

const tx = (state: string) => ({ state, nonce: "n".repeat(43), codeVerifier: "v".repeat(43), redirectUri: CONFIG.redirectUri });

test("server rendering is inert: no browser API, no request, controls disabled until the client discovers", () => {
  assert.equal(typeof (globalThis as { window?: unknown }).window, "undefined");
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => { requests += 1; return Promise.reject(new Error("no requests while rendering")); }) as typeof fetch;
  try {
    function Wallet() {
      return h(SanctumWalletConnect, { wallet: useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"] }) });
    }
    const html = renderToString(h(SanctumProvider, CONFIG, h(SignInButton), h(SignInCallback), h(Wallet), h(SignInDrawerButton, { label: "Sign in" })));
    assert.match(html, /aria-haspopup="dialog">.*Sign in<\/span><\/button><dialog class="sanctum-drawer" aria-labelledby="[^"]+"><\/dialog>/u, "the drawer is a closed, empty dialog until opened");
    assert.match(html, /<button type="button" class="sanctum-button" disabled="" aria-busy="true">/u);
    assert.match(html, /Continue with Sanctum/u);
    assert.match(html, /role="status" data-sanctum-callback="working">Finishing sign-in…/u);
    assert.match(html, /Connect Sanctum wallet/u);
    assert.equal(requests, 0, "discovery waits for the client");
  } finally {
    globalThis.fetch = realFetch;
  }
  function Outside() { useSanctum(); return null; }
  assert.throws(() => renderToString(h(Outside)), /inside <SanctumProvider>/u);
});

test("the mark is the canonical Sanctum Connect geometry, hidden from assistive technology", () => {
  const svg = readFileSync(new URL("../../assets/brand/sanctum-connect-mark.svg", import.meta.url), "utf8");
  assert.equal(MARK_PATH, /\sd="([^"]+)"/u.exec(svg)![1]);
  assert.equal(MARK_VIEW_BOX, /viewBox="([^"]+)"/u.exec(svg)![1]);
  const html = renderToString(h(SanctumMark, { width: 20 }));
  assert.match(html, /^<svg viewBox="0 0 196 196" fill="none" aria-hidden="true" focusable="false" width="20">/u);
});

test("the transaction store keeps only the transaction, hands it out once and forgets it after ten minutes", () => {
  const storage = memoryStorage();
  let now = 1_000_000;
  const store = sessionTransactionStore(storage, () => now);
  const state = "s".repeat(43);
  store.put({ ...tx(state), accessToken: "never-stored" } as ReturnType<typeof tx>);
  const raw = storage.getItem(`sanctum.signin.${state}`) ?? "";
  assert.deepEqual(Object.keys(JSON.parse(raw).tx).sort(), ["codeVerifier", "nonce", "redirectUri", "state"]);
  assert.equal(raw.includes("never-stored"), false);
  assert.deepEqual(store.take(state), tx(state));
  assert.equal(store.take(state), null, "taken once");
  store.put(tx("t".repeat(43)));
  now += 10 * 60_000 + 1;
  assert.equal(store.take("t".repeat(43)), null, "expired");
  assert.equal(store.take("short"), null, "malformed state");
  store.put(tx("u".repeat(43)));
  store.put(tx("w".repeat(43)));
  assert.equal(storage.length, 2, "expired entries are purged when another sign-in starts");
});

test("a callback is finished once per sign-in; replays and failures are truthful", async () => {
  const store = sessionTransactionStore(memoryStorage());
  const state = "a".repeat(43);
  store.put(tx(state));
  let calls = 0;
  const client = {
    finishSignIn: async (callback: URL | string) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (String(callback).includes("fail")) throw new Error("token endpoint unreachable");
      return { subject: "p1.subject", claims: {}, idToken: "id", accessToken: "at" } as never;
    },
  };
  const url = `${CONFIG.redirectUri}?code=c&state=${state}`;
  const [first, second] = await Promise.all([completeSignIn(client, store, url), completeSignIn(client, store, url)]);
  assert.equal(first, second);
  assert.equal(calls, 1, "StrictMode's second effect shares the first exchange");
  await assert.rejects(completeSignIn(client, store, `${CONFIG.redirectUri}?code=c&state=${"b".repeat(43)}`), { code: "transaction_missing" });
  await assert.rejects(completeSignIn(client, store, `${CONFIG.redirectUri}?code=c`), { code: "invalid_response" });
  const failing = "f".repeat(43);
  store.put(tx(failing));
  await assert.rejects(completeSignIn(client, store, `${CONFIG.redirectUri}?code=fail&state=${failing}`), { name: "SanctumReactError", code: "unexpected" });
  assert.equal(store.take(failing), null, "a failed exchange consumed its transaction");
});

test("the wallet state machine ignores anything for an older attempt", () => {
  let state = walletReducer(initialWalletState, { type: "start", attempt: 1 });
  state = walletReducer(state, { type: "paired", attempt: 1, pairingUri: "https://id.example.com/wallet-link#secret", expiresAt: new Date(0) });
  assert.deepEqual([state.status, state.pairingUri], ["awaiting_approval", "https://id.example.com/wallet-link#secret"]);
  state = walletReducer(state, { type: "reset", attempt: 2 });
  assert.deepEqual([state.status, state.pairingUri], ["idle", null], "cancel forgets the pairing link");
  assert.equal(walletReducer(state, { type: "connected", attempt: 1, accounts: ["0xabc"], chainId: "0x14a34" }), state, "a late approval is ignored");
  assert.equal(walletReducer(state, { type: "start", attempt: 2 }), state, "attempt numbers only move forward");
  // Cancel and connect again quickly: the first attempt's link or approval must not land on the second.
  const second = walletReducer(walletReducer(initialWalletState, { type: "start", attempt: 1 }), { type: "start", attempt: 2 });
  assert.equal(walletReducer(second, { type: "paired", attempt: 1, pairingUri: "https://id.example.com/wallet-link#old", expiresAt: new Date(0) }), second, "an older attempt's link isn't shown");
  assert.equal(walletReducer(second, { type: "connected", attempt: 1, accounts: ["0xold"], chainId: "0x14a34" }), second, "an older attempt's approval isn't taken");
  state = walletReducer(walletReducer(state, { type: "start", attempt: 3 }), { type: "connected", attempt: 3, accounts: ["0xabc"], chainId: "0x14a34" });
  assert.deepEqual([state.status, state.accounts, state.pairingUri], ["connected", ["0xabc"], null]);
  assert.equal(walletReducer(state, { type: "failed", attempt: 3, message: "late" }), state, "a connected session isn't overwritten by a failure");
});

test("theme tokens become CSS custom properties; values that could inject CSS are refused", () => {
  assert.equal(themeCss({ accent: "#0b57d0", radius: "16px", font: "\"Inter\", sans-serif" }, ".app"),
    ".app { --sanctum-accent: #0b57d0; --sanctum-radius: 16px; --sanctum-font: \"Inter\", sans-serif; }");
  for (const value of ["red; } body { display: none", "url(https://attacker.example/x.png)", "red\\3b", "<style>"]) {
    assert.throws(() => themeCss({ accent: value }), TypeError, value);
  }
  assert.throws(() => themeCss({ accent: "red" }, "body { color: red } .x"), TypeError);
});

test("a cancelled wallet connection ends its proposed session (core SDK)", async () => {
  const ended: string[] = [];
  let proposals = 0;
  const transport: WalletSessionTransport = {
    propose: async () => {
      proposals += 1;
      return { sessionId: "s1", sessionToken: "t1", pairingUri: "https://id.example.com/wallet-link#p", status: "proposed", accounts: [], chain: null, expiresAt: "" };
    },
    state: async () => ({ sessionId: "s1", status: "proposed", accounts: [], chain: null, expiresAt: "" }),
    send: async () => { throw new Error("unused"); },
    result: async () => { throw new Error("unused"); },
    end: async (session) => { ended.push(session.sessionId); },
  };
  const abort = new AbortController();
  const pairing: string[] = [];
  const connecting = connectSanctumWallet({ transport, chains: ["eip155:84532"], methods: ["personal_sign"], pollMs: 5, signal: abort.signal, onPairingUri: (uri) => pairing.push(uri) });
  setTimeout(() => abort.abort(), 20);
  await assert.rejects(connecting, (error: unknown) => error instanceof ProviderRpcError && error.code === 4001);
  assert.deepEqual([pairing.length, ended], [1, ["s1"]]);
  const early = new AbortController();
  early.abort();
  await assert.rejects(connectSanctumWallet({ transport, chains: ["eip155:84532"], methods: ["personal_sign"], signal: early.signal, onPairingUri: (uri) => pairing.push(uri) }));
  assert.deepEqual([proposals, pairing.length, ended], [1, 1, ["s1"]], "already aborted: no additional proposal, pairing link or session to end");
  // An in-flight proposal can still arrive after cancellation if transport ignores the signal.
  let releaseProposal: () => void = () => { throw new Error("proposal gate not ready"); };
  const proposalGate = new Promise<void>((resolve) => { releaseProposal = resolve; });
  let proposalStarted: () => void = () => { throw new Error("proposal start gate not ready"); };
  const started = new Promise<void>((resolve) => { proposalStarted = resolve; });
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
  const proposing = connectSanctumWallet({ transport: late, chains: ["eip155:84532"], methods: ["personal_sign"], signal: cancelledProposal.signal, onPairingUri: (uri) => pairing.push(uri) });
  await started;
  cancelledProposal.abort();
  releaseProposal();
  await assert.rejects(proposing, (error: unknown) => error instanceof ProviderRpcError && error.code === 4001 && error.reason === "aborted");
  assert.deepEqual([proposals, pairing.length, ended], [2, 1, ["s1", "s1"]], "late proposal is ended without displaying its pairing link");
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
  const waiting = connectSanctumWallet({ transport: slow, chains: ["eip155:84532"], methods: ["personal_sign"], pollMs: 1, signal: during.signal, onPairingUri: () => undefined });
  setTimeout(() => during.abort(), 10);
  await assert.rejects(waiting, (error: unknown) => error instanceof ProviderRpcError && error.code === 4001);
  assert.deepEqual([polls, ended.length], [1, 3], "one poll, then the proposal is ended");
});

test("the drawer's views: wallets forward, back to methods, closing resets search and chain", () => {
  let state = drawerReducer(initialDrawerState, { type: "wallets" });
  assert.deepEqual([state.view, state.direction], ["wallets", "forward"]);
  state = drawerReducer(drawerReducer(state, { type: "search", query: "x".repeat(100) }), { type: "family", family: "bitcoin" });
  assert.deepEqual([state.query.length, state.family], [64, "bitcoin"], "a search is at most 64 characters");
  state = drawerReducer(state, { type: "back" });
  assert.deepEqual([state.view, state.direction], ["methods", "back"]);
  assert.equal(drawerReducer(state, { type: "back" }), state, "back on the first view does nothing");
  assert.deepEqual(drawerReducer(drawerReducer(state, { type: "wallets" }), { type: "reset" }), initialDrawerState);
  assert.equal(drawerReducer(state, { type: "wallets" }).query, "", "the wallet list opens with an empty search");
});

test("the kit document: known methods only, a cleaned app name, anything else refused", () => {
  const kit = parseKit({ app_name: "Demo\u202E app", sign_in_methods: ["sso", "evm_wallet", "teleport"] });
  assert.deepEqual([kit?.appName, kit?.passkey, [...(kit?.methods ?? [])].sort()], ["Demo app", true, ["evm_wallet", "sso"]], "an issuer that doesn't say offers passkeys");
  assert.equal(parseKit({ app_name: "A", passkey: false, sign_in_methods: [] })?.passkey, false, "an app whose policy disallows passkeys");
  assert.equal(parseKit({ sign_in_methods: [] }), null);
  assert.equal(parseKit("nope"), null);
});

test("the QR component draws one path that decodes to the link, dark on light, labelled", () => {
  const value = `https://id.example.com/wallet-link#${"q".repeat(43)}`;
  const html = renderToString(h(SanctumQrCode, { value, label: "QR code that opens Sanctum" }));
  assert.match(html, /^<svg role="img" aria-label="QR code that opens Sanctum" viewBox="0 0 (\d+) \1"/u);
  assert.equal(html.match(/<path /gu)?.length, 1);
  assert.match(html, /<rect[^>]*fill="#ffffff"/u);
  const path = /<path d="([^"]+)" fill="#000000"/u.exec(html)![1]!;
  const modules = modulesFromPath(path, qrModules(value).length);
  assert.deepEqual(modules, qrModules(value), "the path is exactly the matrix");
  assert.equal(decodeModules(modules), value);
});
