/**
 * Where a sign-in waits between the redirect to Sanctum and the callback: this browser tab's
 * sessionStorage, one entry per `state`, taken once. Only the transaction (state, nonce, PKCE
 * verifier, redirect URI) is stored, never a token; entries expire after ten minutes.
 *
 * `completeSignIn` shares concurrent identical callbacks within one client and store, so React's
 * StrictMode double effects or two components on the callback page share one token exchange,
 * and a reloaded or replayed callback fails truthfully ("transaction_missing").
 */
import type { SanctumConnect, SignInResult, SignInTransaction } from "@sanctum.ai/connect";
import { SanctumReactError } from "./errors.ts";

export interface TransactionStore {
  put(transaction: SignInTransaction): void;
  /** Removes and returns the transaction for `state`, or null if there is none (used, expired or unknown). */
  take(state: string): SignInTransaction | null;
}

const PREFIX = "sanctum.signin.";
const TTL_MS = 10 * 60_000;
const STATE = /^[A-Za-z0-9_-]{16,128}$/u;

function isTransaction(value: unknown): value is SignInTransaction {
  if (typeof value !== "object" || value === null) return false;
  const tx = value as Record<string, unknown>;
  return (
    typeof tx.state === "string" &&
    typeof tx.nonce === "string" &&
    typeof tx.codeVerifier === "string" &&
    typeof tx.redirectUri === "string" &&
    (tx.maxAge === undefined || typeof tx.maxAge === "number")
  );
}

/**
 * The default store: this tab's sessionStorage, looked up when used (never during server
 * rendering, and never a server runtime's own storage). Pass `storage` and `now` only in tests.
 */
export function sessionTransactionStore(given?: Storage, now: () => number = Date.now): TransactionStore {
  const resolve = (): Storage | undefined =>
    given ?? (typeof window === "undefined" ? undefined : window.sessionStorage);
  const purge = () => {
    const storage = resolve();
    if (!storage) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const entry = JSON.parse(storage.getItem(key) ?? "null") as { at?: unknown } | null;
        if (typeof entry?.at !== "number" || now() - entry.at > TTL_MS) storage.removeItem(key);
      } catch {
        storage.removeItem(key);
      }
    }
  };
  return {
    put(transaction) {
      const storage = resolve();
      if (!storage)
        throw new SanctumReactError("not_ready", "Sign-in needs a browser tab (sessionStorage is unavailable)");
      purge();
      const { state, nonce, codeVerifier, redirectUri, maxAge } = transaction;
      storage.setItem(
        PREFIX + state,
        JSON.stringify({
          at: now(),
          tx: { state, nonce, codeVerifier, redirectUri, ...(maxAge !== undefined ? { maxAge } : {}) },
        }),
      );
    },
    take(state) {
      const storage = resolve();
      if (!storage || !STATE.test(state)) return null;
      const raw = storage.getItem(PREFIX + state);
      storage.removeItem(PREFIX + state);
      if (raw === null) return null;
      try {
        const entry = JSON.parse(raw) as { at?: unknown; tx?: unknown };
        if (
          typeof entry.at !== "number" ||
          now() - entry.at > TTL_MS ||
          !isTransaction(entry.tx) ||
          entry.tx.state !== state
        )
          return null;
        return entry.tx;
      } catch {
        return null;
      }
    },
  };
}

type CallbackClient = Pick<SanctumConnect, "finishSignIn">;
const inflight = new WeakMap<CallbackClient, WeakMap<TransactionStore, Map<string, Promise<SignInResult>>>>();

/**
 * Shares identical in-flight callbacks only within the same client and transaction store. The stored
 * transaction is consumed before the token exchange, so a failed exchange can't be retried with it.
 */
export function completeSignIn(
  client: CallbackClient,
  store: TransactionStore,
  callback: string,
): Promise<SignInResult> {
  let state: string | null;
  try {
    state = new URL(callback).searchParams.get("state");
  } catch {
    state = null;
  }
  if (!state) return Promise.reject(new SanctumReactError("invalid_response", "The callback has no sign-in state"));
  let stores = inflight.get(client);
  if (!stores) {
    stores = new WeakMap();
    inflight.set(client, stores);
  }
  let pending = stores.get(store);
  if (!pending) {
    pending = new Map();
    stores.set(store, pending);
  }
  const running = pending.get(callback);
  if (running) return running;
  const transaction = store.take(state);
  if (!transaction)
    return Promise.reject(
      new SanctumReactError(
        "transaction_missing",
        "This sign-in was already completed, expired, or started in another tab",
      ),
    );
  const finishing = client
    .finishSignIn(callback, transaction)
    .catch((error: unknown) => {
      throw SanctumReactError.from(error);
    })
    .finally(() => {
      pending.delete(callback);
    });
  pending.set(callback, finishing);
  return finishing;
}
