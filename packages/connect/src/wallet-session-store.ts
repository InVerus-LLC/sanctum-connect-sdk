/** Persistence ownership for SDK wallet sessions; operations serialize per store and key. */

/** App-chosen storage for one opaque session string; credentials never enter a URL. */
export interface WalletSessionStore {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

/** Page-local memory by default; surviving reloads is an explicit application choice. */
export function memoryWalletSessionStore(): WalletSessionStore {
  const items = new Map<string, string>();
  return { get: (key) => items.get(key) ?? null, set: (key, value) => { items.set(key, value); }, remove: (key) => { items.delete(key); } };
}

const pending = new WeakMap<WalletSessionStore, Map<string, Promise<void>>>();

/** Serializes this SDK's mutations/read-modify-write operations, including async app stores. */
export function withWalletSessionStore<T>(store: WalletSessionStore, key: string, run: () => Promise<T>): Promise<T> {
  let keys = pending.get(store);
  if (!keys) { keys = new Map(); pending.set(store, keys); }
  const operation = (keys.get(key) ?? Promise.resolve()).then(run);
  const settled = operation.then(() => undefined, () => undefined);
  keys.set(key, settled);
  const ownKeys = keys;
  void settled.then(() => { if (ownKeys.get(key) === settled) ownKeys.delete(key); });
  return operation;
}

/** Never remove a session written by a newer connection or a different provider. */
export async function forgetWalletSession(store: WalletSessionStore, key: string, expected: string | null): Promise<void> {
  if (expected === null) return;
  await withWalletSessionStore(store, key, async () => {
    if (await store.get(key) === expected) await store.remove(key);
  });
}
