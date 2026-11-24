import type { ProviderRpcError, WalletSessionMethod } from "./wallet-session.ts";

/** EIP-1193 events a Sanctum wallet session emits, with their arguments. */
export interface WalletProviderEvents {
  accountsChanged: [accounts: string[]];
  chainChanged: [chainId: string];
  disconnect: [error: ProviderRpcError];
}
export type Listener<E extends keyof WalletProviderEvents> = (...args: WalletProviderEvents[E]) => void;

export interface WalletProviderOptions {
  /** How often to ask whether the person decided a request (ms); default 1500. */
  pollMs?: number;
  /** How often to read the session's state while someone listens (ms); default 15000, kept within 500-120000. */
  watchMs?: number;
  /** Called once when the session is over (the SDK forgets a stored session here). */
  onClose?: () => void;
}

/** A request this provider sent that is still waiting for the person. */
export interface PendingWalletRequest {
  requestKey: string;
  requestId: string | null;
  method: WalletSessionMethod;
  startedAt: Date;
}
