/**
 * Typed wallet-session errors and events in the core SDK (W-19): `sanctumTransport` maps each HTTP
 * failure to the EIP-1193 or EIP-1474 code an app can branch on (it used to report every non-404
 * failure as 4100 "unauthorized"), keeps the server's reason and status as data, maps a lost network
 * to an internal error and an aborted call to 4001; the provider passes the caller's AbortSignal to
 * every transport call and emits EIP-1193 `accountsChanged` ([]) and `disconnect` once, when the app
 * disconnects or the session turns out to be over.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectSanctumWallet, PROVIDER_ERRORS, ProviderRpcError, sanctumTransport, SanctumWalletProvider, type WalletSessionTransport,
} from "../../packages/connect/src/index.ts";

const SESSION = { sessionId: "6f1c2d1e-5b8a-4c39-9a52-0a3c1b2d3e4f", sessionToken: "t".repeat(43) };
const ACTIVE = { sessionId: SESSION.sessionId, status: "active" as const, accounts: ["0x1111111111111111111111111111111111111111"], chain: "eip155:84532", expiresAt: "" };

function answering(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

const transportWith = (fetcher: typeof fetch) => sanctumTransport({ issuer: "https://id.example.com", clientId: "client-1", fetch: fetcher });
const sending = (fetcher: typeof fetch) => transportWith(fetcher).send(SESSION, { requestKey: "k".repeat(12), method: "personal_sign", params: ["0x6d6573736167652030"] });

async function failure(promise: Promise<unknown>): Promise<ProviderRpcError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  assert.ok(error instanceof ProviderRpcError, `expected a ProviderRpcError, got ${String(error)}`);
  return error;
}

test("each wallet-session failure has its own typed code, with the server's reason and status as data", async () => {
  const cases: [number, Record<string, string>, number][] = [
    [409, { error: "invalid_state", reason: "session_inactive" }, PROVIDER_ERRORS.disconnected],
    [404, { error: "not_found" }, PROVIDER_ERRORS.disconnected],
    [429, { error: "limit_reached", reason: "request_limit" }, PROVIDER_ERRORS.limitExceeded],
    [429, { error: "limit_reached", reason: "proposal_limit" }, PROVIDER_ERRORS.limitExceeded],
    [400, { error: "invalid_request", reason: "method_not_approved" }, PROVIDER_ERRORS.unauthorized],
    [400, { error: "invalid_request", reason: "request_key_invalid" }, PROVIDER_ERRORS.invalidParams],
    [409, { error: "conflict", reason: "request_key_reused" }, PROVIDER_ERRORS.invalidParams],
    [403, { error: "forbidden" }, PROVIDER_ERRORS.unauthorized],
    [500, {}, PROVIDER_ERRORS.internal],
  ];
  for (const [status, body, code] of cases) {
    const error = await failure(sending(answering(status, body)));
    assert.equal(error.code, code, `${status} ${JSON.stringify(body)}`);
    assert.equal(error.reason, body.reason, "the server's reason is kept");
    assert.deepEqual(error.data, { status, error: body.error }, "the HTTP status and error are data, not the message");
  }
  assert.deepEqual([PROVIDER_ERRORS.userRejected, PROVIDER_ERRORS.unauthorized, PROVIDER_ERRORS.unsupportedMethod, PROVIDER_ERRORS.disconnected], [4001, 4100, 4200, 4900]);
  assert.deepEqual([PROVIDER_ERRORS.invalidParams, PROVIDER_ERRORS.internal, PROVIDER_ERRORS.limitExceeded], [-32602, -32603, -32005], "JSON-RPC (EIP-1474) codes");
});

test("a lost network is an internal error, not a disconnection; an aborted call is 4001 with reason aborted", async () => {
  const offline = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  const lost = await failure(sending(offline));
  assert.deepEqual([lost.code, lost.reason], [PROVIDER_ERRORS.internal, "network_error"]);

  const seen: (AbortSignal | null | undefined)[] = [];
  const hanging = ((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    seen.push(init.signal);
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const abort = new AbortController();
  const waiting = transportWith(hanging).state(SESSION, { signal: abort.signal });
  abort.abort();
  const cancelled = await failure(waiting);
  assert.deepEqual([cancelled.code, cancelled.reason], [PROVIDER_ERRORS.userRejected, "aborted"]);
  assert.equal(seen[0], abort.signal, "the caller's signal reaches fetch");
});

function recordingTransport(results: ("pending" | "approved" | "inactive")[]) {
  const signals: { call: string; signal: AbortSignal | undefined }[] = [];
  let ended = 0;
  const transport: WalletSessionTransport = {
    propose: async (_input, options) => { signals.push({ call: "propose", signal: options?.signal }); return { ...ACTIVE, status: "proposed", accounts: [], chain: null, sessionToken: SESSION.sessionToken, pairingUri: "https://id.example.com/wallet-link#p" }; },
    state: async (_session, options) => { signals.push({ call: "state", signal: options?.signal }); return ACTIVE; },
    send: async (_session, _request, options) => { signals.push({ call: "send", signal: options?.signal }); return { requestId: "r1", status: "pending" }; },
    result: async (_session, _id, options) => {
      signals.push({ call: "result", signal: options?.signal });
      const next = results.shift() ?? "approved";
      if (next === "inactive") throw new ProviderRpcError(PROVIDER_ERRORS.disconnected, "session_inactive", "session_inactive");
      return next === "approved" ? { requestId: "r1", status: "approved", result: "0xsig" } : { requestId: "r1", status: "pending" };
    },
    end: async (_session, options) => { ended += 1; signals.push({ call: "end", signal: options?.signal }); },
  };
  return { transport, signals, ended: () => ended };
}

test("connections carry the caller signal and request polling shares its cancellable operation signal", async () => {
  const { transport, signals } = recordingTransport(["pending", "approved"]);
  const connecting = new AbortController();
  const provider = await connectSanctumWallet({ transport, chains: ["eip155:84532"], methods: ["personal_sign"], pollMs: 1, signal: connecting.signal, onPairingUri: () => undefined });
  assert.ok(signals.filter((entry) => entry.call === "propose" || entry.call === "state").every((entry) => entry.signal === connecting.signal));
  const asking = new AbortController();
  assert.equal(await provider.request({ method: "personal_sign", params: ["0x6d6573736167652030", ACTIVE.accounts[0]] }, asking.signal), "0xsig");
  const requestCalls = signals.filter((entry) => entry.call === "send" || entry.call === "result");
  assert.equal(requestCalls.length, 3);
  const operationSignal = requestCalls[0]!.signal;
  assert.ok(operationSignal && !operationSignal.aborted, "a successful request has a live cancellation signal");
  assert.ok(requestCalls.every((entry) => entry.signal === operationSignal), "send and every poll share the operation's cancellation");
});

test("disconnect and accountsChanged are emitted once: on disconnect() and when the session is found to be over", async () => {
  const { transport, ended } = recordingTransport(["inactive"]);
  const provider = new SanctumWalletProvider(transport, SESSION, ACTIVE, 1);
  const events: string[] = [];
  const onDisconnect = (error: ProviderRpcError) => events.push(`disconnect:${error.code}`);
  provider.on("disconnect", onDisconnect);
  provider.on("accountsChanged", (accounts) => events.push(`accounts:${accounts.length}`));
  const error = await failure(provider.request({ method: "personal_sign", params: ["0x6d6573736167652030", ACTIVE.accounts[0]] }));
  assert.equal(error.code, PROVIDER_ERRORS.disconnected);
  assert.deepEqual(events, ["accounts:0", "disconnect:4900"], "the app learns the session ended");
  await provider.disconnect();
  assert.deepEqual(events, ["accounts:0", "disconnect:4900"], "emitted once");
  assert.equal(ended(), 1, "disconnect still ends the session at Sanctum");

  const second = new SanctumWalletProvider(recordingTransport([]).transport, SESSION, ACTIVE, 1);
  const heard: string[] = [];
  const listener = () => heard.push("disconnect");
  second.on("disconnect", listener);
  second.removeListener("disconnect", listener);
  second.on("disconnect", (reason) => heard.push(`again:${reason.code}`));
  await second.disconnect();
  assert.deepEqual(heard, ["again:4900"], "a removed listener hears nothing");
  await assert.rejects(second.request({ method: "personal_sign", params: [] }), (rejected: unknown) => rejected instanceof ProviderRpcError && rejected.code === 4900, "a disconnected provider refuses requests");
  assert.deepEqual(second.accounts, [], "no accounts after disconnecting");
});
