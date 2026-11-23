/**
 * A connected wallet session as an EIP-1193 provider (matrix W-08, W-09).
 *
 *  - Methods: `eth_accounts`/`eth_requestAccounts`, `eth_chainId`, `personal_sign` and
 *    `eth_signTypedData_v4` (each waits for the person on Sanctum), `wallet_switchEthereumChain` to
 *    the session's own chain (null). A session holds one wallet on one network, so any other chain is
 *    4902 "chain_not_approved": connect again to use another network. `wallet_getCapabilities` is
 *    4200 "capabilities_unsupported" (no EIP-5792 capability: no batches, paymasters or
 *    `wallet_sendCalls`); every other method is 4200 "method_unsupported" (transactions go through
 *    Sanctum Payments, never through an app's session).
 *  - Events: `accountsChanged` ([] once the session is over), `chainChanged` (only if Sanctum ever
 *    reports another chain, which a session never has) and `disconnect`, each once.
 *  - While anyone listens, the session's state is read every `watchMs` (default 15 s, 0.5 s to 2 min),
 *    so a Disconnect on Sanctum's Wallets page, a withdrawn app or an expiry is noticed without a
 *    request; while Sanctum can't be reached the wait doubles up to 2 minutes. Polling stops when the
 *    last listener is removed or the session is over. There is no push channel.
 *  - Pending requests: `pendingRequests()` lists this provider's requests still waiting;
 *    `cancelRequest(key)` (or the request's AbortSignal) stops waiting and withdraws it at Sanctum, so
 *    the person no longer sees it and it stops counting toward the session's five pending requests. A
 *    request aborted before Sanctum answered its send can't be withdrawn; it expires after 5 minutes.
 */
import {
  cancelled, PROVIDER_ERRORS, ProviderRpcError, type WalletSessionHandle, type WalletSessionMethod, type WalletSessionState, type WalletSessionTransport,
} from "./wallet-session.ts";

/** Waits between polls. An already-aborted signal (cancelled while a poll request was running) stops at once. */
export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(cancelled());
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(cancelled()); }, { once: true });
});

/** EIP-1193 events a Sanctum wallet session emits, with their arguments. */
export interface WalletProviderEvents {
  accountsChanged: [accounts: string[]];
  chainChanged: [chainId: string];
  disconnect: [error: ProviderRpcError];
}
type Listener<E extends keyof WalletProviderEvents> = (...args: WalletProviderEvents[E]) => void;

export interface WalletProviderOptions {
  /** How often to ask whether the person decided a request (ms); default 1500. */
  pollMs?: number;
  /** How often to read the session's state while someone listens (ms); default 15000, kept within 500-120000. */
  watchMs?: number;
  /** Called once when the session is over (the SDK forgets a stored session here). */
  onClose?: () => void;
}

/** A request this provider sent that is still waiting for the person. */
export interface PendingWalletRequest { requestKey: string; requestId: string | null; method: WalletSessionMethod; startedAt: Date }

const MAX_WATCH_MS = 120_000;
const hexChain = (chain: string | null) => `0x${Number(chain?.split(":")[1] ?? 0).toString(16)}`;

export class SanctumWalletProvider {
  readonly #transport: WalletSessionTransport;
  readonly #session: WalletSessionHandle;
  #state: WalletSessionState;
  readonly #pollMs: number;
  readonly #watchMs: number;
  readonly #onClose: (() => void) | undefined;
  readonly #listeners = new Map<keyof WalletProviderEvents, Set<Listener<keyof WalletProviderEvents>>>();
  readonly #pending = new Map<string, PendingWalletRequest & { abort: AbortController }>();
  #closed: ProviderRpcError | null = null;
  #count = 0;
  #watch: ReturnType<typeof setTimeout> | null = null;

  /** `options` as a number is the request poll interval (the earlier signature). */
  constructor(transport: WalletSessionTransport, session: WalletSessionHandle, state: WalletSessionState, options: number | WalletProviderOptions = {}) {
    const settings = typeof options === "number" ? { pollMs: options } : options;
    this.#transport = transport;
    this.#session = session;
    this.#state = state;
    this.#pollMs = settings.pollMs ?? 1500;
    this.#watchMs = Math.min(Math.max(settings.watchMs ?? 15_000, 500), MAX_WATCH_MS);
    this.#onClose = settings.onClose;
  }

  get accounts(): string[] { return this.#closed ? [] : [...this.#state.accounts]; }
  get chainId(): string { return hexChain(this.#state.chain); }

  on<E extends keyof WalletProviderEvents>(event: E, listener: Listener<E>): this {
    const set = this.#listeners.get(event) ?? new Set();
    set.add(listener as Listener<keyof WalletProviderEvents>);
    this.#listeners.set(event, set);
    this.#schedule(this.#watchMs);
    return this;
  }

  removeListener<E extends keyof WalletProviderEvents>(event: E, listener: Listener<E>): this {
    this.#listeners.get(event)?.delete(listener as Listener<keyof WalletProviderEvents>);
    if (!this.#listening()) this.#stopWatching();
    return this;
  }

  #listening(): boolean { return [...this.#listeners.values()].some((set) => set.size > 0); }

  #emit<E extends keyof WalletProviderEvents>(event: E, ...args: WalletProviderEvents[E]): void {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) {
      try { (listener as Listener<E>)(...args); } catch { /* listeners can't break the provider */ }
    }
  }

  #schedule(delay: number): void {
    if (this.#closed || this.#watch !== null || !this.#listening()) return;
    this.#watch = setTimeout(() => { this.#watch = null; void this.#check(delay); }, delay);
    // In Node, watching alone doesn't keep a process alive.
    (this.#watch as { unref?: () => void }).unref?.();
  }

  #stopWatching(): void {
    if (this.#watch !== null) clearTimeout(this.#watch);
    this.#watch = null;
  }

  /** One read of the session's state: over → close; Sanctum unreachable → wait twice as long. */
  async #check(delay: number): Promise<void> {
    let next = this.#watchMs;
    try {
      const state = await this.#transport.state(this.#session);
      if (this.#closed) return;
      if (state.status !== "active") return this.#close(new ProviderRpcError(PROVIDER_ERRORS.disconnected, `The wallet session is ${state.status}`, state.status));
      if (state.chain !== this.#state.chain) {
        this.#state = { ...this.#state, chain: state.chain };
        this.#emit("chainChanged", hexChain(state.chain));
      }
    } catch (error) {
      if (error instanceof ProviderRpcError && error.code === PROVIDER_ERRORS.disconnected) return this.#close(error);
      next = Math.min(delay * 2, MAX_WATCH_MS);
    }
    this.#schedule(next);
  }

  /** Marks the session over once, stops polling and pending requests, and tells listeners. */
  #close(error: ProviderRpcError): void {
    if (this.#closed) return;
    this.#closed = error;
    this.#stopWatching();
    for (const entry of this.#pending.values()) entry.abort.abort();
    try { this.#onClose?.(); } catch { /* forgetting is best effort */ }
    this.#emit("accountsChanged", []);
    this.#emit("disconnect", error);
  }

  /** This provider's requests still waiting for the person. */
  pendingRequests(): PendingWalletRequest[] {
    return [...this.#pending.values()].map(({ requestKey, requestId, method, startedAt }) => ({ requestKey, requestId, method, startedAt }));
  }

  /** Stops waiting for one request and withdraws it at Sanctum; false if it isn't pending here. */
  async cancelRequest(requestKey: string): Promise<boolean> {
    const entry = this.#pending.get(requestKey);
    if (!entry) return false;
    entry.abort.abort();
    return true;
  }

  async request({ method, params = [] }: { method: string; params?: unknown[] }, signal?: AbortSignal): Promise<unknown> {
    if (this.#closed) throw new ProviderRpcError(PROVIDER_ERRORS.disconnected, "The wallet session is over; connect again");
    if (method === "eth_accounts" || method === "eth_requestAccounts") return this.accounts;
    if (method === "eth_chainId") return this.chainId;
    if (method === "wallet_switchEthereumChain") return this.#switchChain(params);
    if (method === "wallet_getCapabilities") throw new ProviderRpcError(PROVIDER_ERRORS.unsupportedMethod, "Sanctum wallet sessions have no EIP-5792 capabilities", "capabilities_unsupported");
    if (method !== "personal_sign" && method !== "eth_signTypedData_v4") throw new ProviderRpcError(PROVIDER_ERRORS.unsupportedMethod, `${method} is not supported by Sanctum wallet sessions`, "method_unsupported");
    return this.#sign(method, params, signal);
  }

  #switchChain(params: unknown[]): null {
    const chainId = (params[0] as { chainId?: unknown } | undefined)?.chainId;
    if (typeof chainId !== "string" || !/^0x[1-9a-f][0-9a-f]*$/u.test(chainId)) throw new ProviderRpcError(PROVIDER_ERRORS.invalidParams, "wallet_switchEthereumChain needs a 0x chain ID", "params_invalid");
    if (chainId !== this.chainId) throw new ProviderRpcError(PROVIDER_ERRORS.unrecognizedChain, "This wallet session isn't approved for that chain; connect again to use it", "chain_not_approved");
    return null;
  }

  async #sign(method: WalletSessionMethod, params: unknown[], signal?: AbortSignal): Promise<unknown> {
    const requestKey = `${Date.now().toString(36)}-${(this.#count += 1).toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const entry = { requestKey, requestId: null as string | null, method, startedAt: new Date(), abort: new AbortController() };
    const follow = () => entry.abort.abort();
    if (signal?.aborted) entry.abort.abort();
    signal?.addEventListener("abort", follow, { once: true });
    this.#pending.set(requestKey, entry);
    // The entry follows the caller and also covers cancelRequest and session closure.
    const options = { signal: entry.abort.signal };
    try {
      if (entry.abort.signal.aborted) throw cancelled();
      let state = await this.#transport.send(this.#session, { requestKey, method, params }, options);
      entry.requestId = state.requestId;
      while (state.status === "pending") {
        await sleep(this.#pollMs, entry.abort.signal);
        state = await this.#transport.result(this.#session, state.requestId, options);
      }
      if (this.#closed) throw this.#closed;
      if (entry.abort.signal.aborted) throw cancelled();
      if (state.status === "approved" && state.result) return state.result;
      if (state.status === "closed") throw new ProviderRpcError(PROVIDER_ERRORS.disconnected, "The wallet session ended before the person answered", "session_inactive");
      if (state.status === "cancelled") throw cancelled();
      throw new ProviderRpcError(PROVIDER_ERRORS.userRejected, state.status === "expired" ? "The person didn't answer in time" : "The person rejected the request", state.status);
    } catch (error) {
      if (error instanceof ProviderRpcError && error.code === PROVIDER_ERRORS.disconnected) this.#close(error);
      else if (entry.abort.signal.aborted && entry.requestId !== null && !this.#closed) {
        // Not with the aborted signal: withdrawing must still reach Sanctum.
        void this.#transport.cancel?.(this.#session, entry.requestId).catch(() => undefined);
      }
      throw this.#closed ?? (entry.abort.signal.aborted ? cancelled() : error);
    } finally {
      this.#pending.delete(requestKey);
      signal?.removeEventListener("abort", follow);
    }
  }

  /** Ends local use immediately, emits once, then asks Sanctum to end the session. */
  async disconnect(): Promise<void> {
    this.#close(new ProviderRpcError(PROVIDER_ERRORS.disconnected, "The app disconnected the wallet session", "disconnected"));
    await this.#transport.end(this.#session);
  }
}
