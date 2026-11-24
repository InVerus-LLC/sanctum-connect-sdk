/**
 * Connecting to a person's Sanctum wallet, and resuming a connection after a reload (matrix W-08).
 *
 * Resume needs the session's ID and bearer token from before the reload. The SDK never puts them in
 * a URL and, by default, keeps them only in this page's memory (`memoryWalletSessionStore`), so a
 * reload starts over. An app that wants sessions to survive reloads passes its own store, for example
 * one over sessionStorage. The trade-off is the app's: any script that can read that store can use the
 * session until it ends (at most 7 days), though only to ask for signatures that the person must
 * approve on Sanctum. Sanctum never signs on its own, and the token reveals nothing about the wallet beyond
 * its address. A stored session that is over, or an entry that isn't one, is forgotten.
 */
import {
  cancelled,
  PROVIDER_ERRORS,
  ProviderRpcError,
  type WalletSessionHandle,
  type WalletSessionMethod,
  type WalletSessionState,
  type WalletSessionTransport,
} from "./wallet-session.ts";
import { sleep, SanctumWalletProvider } from "./wallet-session-provider.ts";

import {
  forgetWalletSession,
  memoryWalletSessionStore,
  withWalletSessionStore,
  type WalletSessionStore,
} from "./wallet-session-store.ts";
export { memoryWalletSessionStore, type WalletSessionStore } from "./wallet-session-store.ts";

const DEFAULT_STORE = memoryWalletSessionStore();
const DEFAULT_KEY = "sanctum.walletSession";
const STORED = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

interface Remembering {
  store?: WalletSessionStore;
  storeKey?: string;
  pollMs?: number;
  watchMs?: number;
}

function providerFor(
  transport: WalletSessionTransport,
  session: WalletSessionHandle,
  state: WalletSessionState,
  options: Remembering,
  stored: string,
): SanctumWalletProvider {
  const store = options.store ?? DEFAULT_STORE;
  const key = options.storeKey ?? DEFAULT_KEY;
  return new SanctumWalletProvider(transport, session, state, {
    ...(options.pollMs ? { pollMs: options.pollMs } : {}),
    ...(options.watchMs ? { watchMs: options.watchMs } : {}),
    onClose: () => {
      void forgetWalletSession(store, key, stored).catch(() => undefined);
    },
  });
}

function parsed(value: string | null): WalletSessionHandle | null {
  if (value === null) return null;
  try {
    const entry = JSON.parse(value) as { v?: unknown; sessionId?: unknown; sessionToken?: unknown };
    if (
      entry.v !== 1 ||
      typeof entry.sessionId !== "string" ||
      !SESSION_ID.test(entry.sessionId) ||
      typeof entry.sessionToken !== "string" ||
      !STORED.test(entry.sessionToken)
    )
      return null;
    return { sessionId: entry.sessionId, sessionToken: entry.sessionToken };
  } catch {
    return null;
  }
}

/**
 * Proposes a session, hands the pairing link to the app (show it as a link or QR code), waits for
 * the person's decision and returns the provider, remembered in `store` (default: this page's memory).
 * Rejection and expiry throw 4001. A cancelled (aborted) or failed attempt ends its own session, best
 * effort, so its pairing link stops working and a late approval can't leave a connected session nobody holds.
 */
export async function connectSanctumWallet(
  options: {
    transport: WalletSessionTransport;
    chains: string[];
    methods: WalletSessionMethod[];
    signal?: AbortSignal;
    /** The pairing link (show it as a link or QR code, never log it) and when it stops working. */
    onPairingUri: (uri: string, expiresAt: Date) => void;
  } & Remembering,
): Promise<SanctumWalletProvider> {
  if (options.signal?.aborted) throw cancelled();
  const store = options.store ?? DEFAULT_STORE;
  const key = options.storeKey ?? DEFAULT_KEY;
  const signal = options.signal ? { signal: options.signal } : {};
  const proposal = await options.transport.propose({ chains: options.chains, methods: options.methods }, signal);
  const session = { sessionId: proposal.sessionId, sessionToken: proposal.sessionToken };
  const stored = JSON.stringify({ v: 1, ...session });
  let state: WalletSessionState = proposal;
  try {
    if (options.signal?.aborted) throw cancelled();
    options.onPairingUri(proposal.pairingUri, new Date(proposal.expiresAt));
    while (state.status === "proposed") {
      await sleep(options.pollMs ?? 1500, options.signal);
      state = await options.transport.state(session, signal);
    }
    if (options.signal?.aborted) throw cancelled();
    if (state.status !== "active")
      throw new ProviderRpcError(PROVIDER_ERRORS.userRejected, `The connection was ${state.status}`, state.status);
    await withWalletSessionStore(store, key, async () => {
      if (options.signal?.aborted) throw cancelled();
      await store.set(key, stored);
    });
    if (options.signal?.aborted) throw cancelled();
    return providerFor(options.transport, session, state, options, stored);
  } catch (error) {
    await forgetWalletSession(store, key, stored).catch(() => undefined);
    // Not with the caller's signal: ending must still reach Sanctum after a cancel.
    await options.transport.end(session).catch(() => undefined);
    throw options.signal?.aborted ? cancelled() : error;
  }
}

/**
 * The session remembered in `store` (default: this page's memory), if it is still active at Sanctum;
 * otherwise null, and the entry is forgotten. Network failures reject (the entry is kept).
 */
export async function resumeSanctumWallet(
  options: { transport: WalletSessionTransport; signal?: AbortSignal } & Remembering,
): Promise<SanctumWalletProvider | null> {
  if (options.signal?.aborted) throw cancelled();
  const store = options.store ?? DEFAULT_STORE;
  const key = options.storeKey ?? DEFAULT_KEY;
  const stored = await withWalletSessionStore(store, key, async () => store.get(key));
  if (options.signal?.aborted) throw cancelled();
  const session = parsed(stored);
  const forget = async () => {
    await forgetWalletSession(store, key, stored);
    return null;
  };
  if (!session || stored === null) return forget();
  let state: WalletSessionState;
  try {
    state = await options.transport.state(session, options.signal ? { signal: options.signal } : {});
  } catch (error) {
    if (options.signal?.aborted) throw cancelled();
    if (error instanceof ProviderRpcError && error.code === PROVIDER_ERRORS.disconnected) return forget();
    throw error;
  }
  if (options.signal?.aborted) throw cancelled();
  if (state.status !== "active") return forget();
  return providerFor(options.transport, session, state, options, stored);
}
