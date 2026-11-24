"use client";
/**
 * `useWalletSession`: connect to a person's Sanctum wallet (WalletConnect-style, over Sanctum's
 * transport) as a small state machine. Every connection attempt has a number; anything that
 * arrives for an older attempt (a late pairing link or approval after Cancel) is ignored, and a
 * late approval is ended at once. Cancel and unmount abort the wait and end the proposed or held
 * session, so the pairing link stops working. The pairing link is a one-time capability: it is
 * kept only while waiting and is never logged.
 *
 * While connected the hook listens for the session's end (the person disconnected on Sanctum, the app
 * was withdrawn, it expired: the provider notices by polling) and returns to idle with a message.
 * With a `store` (see resumeSanctumWallet for the trade-off) a connection survives a reload: the hook
 * resumes it on mount, and unmounting only stops listening instead of ending it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  connectSanctumWallet,
  ProviderRpcError,
  resumeSanctumWallet,
  sanctumTransport,
  type SanctumWalletProvider,
  type WalletSessionMethod,
  type WalletSessionStore,
} from "@sanctum.ai/connect";
import { describeError } from "./errors.ts";
import { useSanctum } from "./provider.ts";

export type WalletStatus = "idle" | "proposing" | "awaiting_approval" | "connected" | "rejected" | "failed";

export interface WalletState {
  status: WalletStatus;
  attempt: number;
  /** Only while awaiting approval. */
  pairingUri: string | null;
  /** When the pairing link stops working (only while awaiting approval). */
  pairingExpiresAt: Date | null;
  accounts: string[];
  /** Hex chain ID, as EIP-1193 reports it. */
  chainId: string | null;
  error: string | null;
}

export type WalletAction =
  | { type: "start" | "reset"; attempt: number }
  | { type: "paired"; attempt: number; pairingUri: string; expiresAt: Date }
  | { type: "connected" | "resumed"; attempt: number; accounts: string[]; chainId: string }
  | { type: "rejected" | "failed" | "ended"; attempt: number; message: string };

export const initialWalletState: WalletState = {
  status: "idle",
  attempt: 0,
  pairingUri: null,
  pairingExpiresAt: null,
  accounts: [],
  chainId: null,
  error: null,
};

/** Pure transitions; actions for any attempt but the current one are ignored. */
export function walletReducer(state: WalletState, action: WalletAction): WalletState {
  if (action.type === "start" || action.type === "reset") {
    if (action.attempt <= state.attempt) return state;
    return { ...initialWalletState, attempt: action.attempt, status: action.type === "start" ? "proposing" : "idle" };
  }
  if (action.attempt !== state.attempt) return state;
  switch (action.type) {
    case "paired":
      return state.status === "proposing"
        ? { ...state, status: "awaiting_approval", pairingUri: action.pairingUri, pairingExpiresAt: action.expiresAt }
        : state;
    case "connected":
    case "resumed":
      return state.status === (action.type === "resumed" ? "idle" : "proposing") ||
        (action.type === "connected" && state.status === "awaiting_approval")
        ? {
            ...state,
            status: "connected",
            pairingUri: null,
            pairingExpiresAt: null,
            accounts: [...action.accounts],
            chainId: action.chainId,
            error: null,
          }
        : state;
    case "ended":
      return state.status === "connected"
        ? { ...initialWalletState, attempt: state.attempt, error: action.message }
        : state;
    case "rejected":
    case "failed":
      return state.status === "connected"
        ? state
        : { ...state, status: action.type, pairingUri: null, pairingExpiresAt: null, error: action.message };
  }
}

export interface WalletSessionOptions {
  /** CAIP-2 chains, for example ["eip155:84532"]; the app's wallet kit must allow them. */
  chains: string[];
  methods: WalletSessionMethod[];
  /** How often to ask whether the person decided (ms); default 1500. */
  pollMs?: number;
  /** Where to remember the connection across reloads (never the URL); without one, unmounting ends it. */
  store?: WalletSessionStore;
  /** The store key (default "sanctum.walletSession"). */
  storeKey?: string;
}

export function useWalletSession({ chains, methods, pollMs, store, storeKey }: WalletSessionOptions) {
  const { config } = useSanctum();
  const [state, dispatch] = useReducer(walletReducer, initialWalletState);
  const attempts = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const held = useRef<SanctumWalletProvider | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const wanted = useRef({ chains, methods });
  useEffect(() => {
    wanted.current = { chains, methods };
  });
  const transport = useMemo(
    () => sanctumTransport({ issuer: config.issuer, clientId: config.clientId }),
    [config.issuer, config.clientId],
  );
  const remembering = useMemo(
    () => ({ ...(store ? { store } : {}), ...(storeKey ? { storeKey } : {}), ...(pollMs ? { pollMs } : {}) }),
    [store, storeKey, pollMs],
  );
  const unlisten = useRef<(() => void) | null>(null);

  /** Holds a connected provider and returns to idle when its session ends. */
  const hold = useCallback((provider: SanctumWalletProvider, attempt: number) => {
    unlisten.current?.();
    held.current = provider;
    const ended = () => {
      if (held.current !== provider) return;
      held.current = null;
      dispatch({ type: "ended", attempt, message: "The wallet session ended. Connect again to continue." });
    };
    provider.on("disconnect", ended);
    unlisten.current = () => provider.removeListener("disconnect", ended);
  }, []);

  /** Aborts a pending attempt and ends a held session (best effort). */
  const release = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    unlisten.current?.();
    unlisten.current = null;
    const provider = held.current;
    held.current = null;
    if (provider) void provider.disconnect().catch(() => undefined);
  }, []);

  useEffect(() => {
    const alive = new AbortController();
    lifetime.current = alive;
    if (store) {
      const attempt = (attempts.current += 1);
      dispatch({ type: "reset", attempt });
      resumeSanctumWallet({ transport, signal: alive.signal, ...remembering }).then(
        (provider) => {
          if (!provider) return;
          if (alive.signal.aborted || attempts.current !== attempt) return;
          hold(provider, attempt);
          dispatch({ type: "resumed", attempt, accounts: provider.accounts, chainId: provider.chainId });
        },
        () => undefined,
      );
    }
    return () => {
      alive.abort();
      if (!store) return release();
      // Remembered: stop listening and polling, keep the session for the next mount or reload.
      pending.current?.abort();
      unlisten.current?.();
      unlisten.current = null;
      held.current = null;
    };
  }, [release, hold, transport, remembering, store]);

  const connect = useCallback(async () => {
    release();
    const attempt = (attempts.current += 1);
    const abort = new AbortController();
    pending.current = abort;
    dispatch({ type: "start", attempt });
    try {
      const provider = await connectSanctumWallet({
        transport,
        chains: wanted.current.chains,
        methods: wanted.current.methods,
        signal: abort.signal,
        ...remembering,
        onPairingUri: (pairingUri, expiresAt) => dispatch({ type: "paired", attempt, pairingUri, expiresAt }),
      });
      if (abort.signal.aborted || attempts.current !== attempt) {
        void provider.disconnect().catch(() => undefined);
        return;
      }
      pending.current = null;
      hold(provider, attempt);
      dispatch({ type: "connected", attempt, accounts: provider.accounts, chainId: provider.chainId });
    } catch (failure) {
      if (abort.signal.aborted) return;
      pending.current = null;
      const rejected = failure instanceof ProviderRpcError && failure.code === 4001;
      dispatch({
        type: rejected ? "rejected" : "failed",
        attempt,
        message: rejected ? "The connection was declined or expired." : describeError(failure),
      });
    }
  }, [transport, remembering, release, hold]);

  /** Cancels a pending connection or disconnects a connected one. */
  const disconnect = useCallback(() => {
    release();
    dispatch({ type: "reset", attempt: (attempts.current += 1) });
  }, [release]);

  /** An EIP-1193 request through the connected session; the person approves it in Sanctum. */
  const request = useCallback(async (args: { method: string; params?: unknown[] }): Promise<unknown> => {
    const provider = held.current;
    if (!provider) throw new ProviderRpcError(4900, "No Sanctum wallet is connected");
    try {
      return await provider.request(args, lifetime.current?.signal);
    } catch (failure) {
      if (
        failure instanceof ProviderRpcError &&
        (failure.code === 4900 || failure.reason === "session_inactive") &&
        held.current === provider
      ) {
        held.current = null;
        unlisten.current?.();
        dispatch({ type: "reset", attempt: (attempts.current += 1) });
      }
      throw failure;
    }
  }, []);

  return { state, connect, cancel: disconnect, disconnect, request };
}

export type WalletSession = ReturnType<typeof useWalletSession>;
