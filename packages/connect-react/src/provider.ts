"use client";
/**
 * <SanctumProvider>: one Sanctum issuer and public client (PKCE, no secret) for a React app.
 *
 *  - SSR-safe: nothing touches the browser while rendering; discovery runs in an effect on the
 *    client (once per configuration in a page), so a server render shows the loading state.
 *  - The signed-in session lives in memory only. The SDK never writes a token to storage, a URL
 *    or a message; a reload signs the app out. Apps that need longer sessions use a server-side
 *    (confidential) integration instead.
 *  - Sign-out, reconfiguration and unmount invalidate pending operations and suppress stale events.
 *  - Typed events (`onEvent`, or `subscribe` from useSanctum) report ready, sign-in, refresh,
 *    sign-out and errors once each, without tokens (events.ts).
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SanctumConnect, type SanctumConnectConfig } from "@sanctum.ai/connect";
import { SanctumReactError } from "./errors.ts";
import { createEventHub, type SanctumEvent } from "./events.ts";
import { sessionTransactionStore } from "./transactions.ts";

export type {
  SanctumConfig,
  SanctumSession,
  SanctumContextValue,
  SignInOptions,
  SanctumProviderProps,
} from "./provider-types.ts";
import type { SanctumConfig, SanctumContextValue, SanctumProviderProps } from "./provider-types.ts";
import { useSessionActions } from "./session-actions.ts";

const SanctumContext = createContext<SanctumContextValue | null>(null);
const discoveries = new Map<string, Promise<SanctumConnect>>();

function discover(key: string, config: SanctumConnectConfig): Promise<SanctumConnect> {
  let found = discoveries.get(key);
  if (!found) {
    found = SanctumConnect.discover(config);
    discoveries.set(key, found);
    found.catch(() => discoveries.delete(key));
  }
  return found;
}

export function SanctumProvider(props: SanctumProviderProps) {
  const { issuer, clientId, redirectUri, scope, allowInsecureLoopback } = props;
  const key = JSON.stringify([issuer, clientId, redirectUri, scope ?? null, allowInsecureLoopback === true]);
  return createElement(ScopedSanctumProvider, { ...props, key });
}

function ScopedSanctumProvider({
  issuer,
  clientId,
  redirectUri,
  scope,
  allowInsecureLoopback,
  transactionStore,
  onEvent,
  children,
}: SanctumProviderProps) {
  const config = useMemo<SanctumConfig>(
    () => ({
      issuer,
      clientId,
      redirectUri,
      ...(scope ? { scope } : {}),
      ...(allowInsecureLoopback ? { allowInsecureLoopback: true } : {}),
    }),
    [issuer, clientId, redirectUri, scope, allowInsecureLoopback],
  );
  const key = JSON.stringify([issuer, clientId, redirectUri, scope ?? null, allowInsecureLoopback === true]);
  const [loaded, setLoaded] = useState<{
    key: string;
    client: SanctumConnect | null;
    error: SanctumReactError | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const store = useMemo(() => {
    const backing = transactionStore ?? sessionTransactionStore();
    // Callback exchanges belong to this provider lifetime, even when apps share a backing store.
    return {
      put: (transaction: Parameters<typeof backing.put>[0]) => backing.put(transaction),
      take: (state: string) => backing.take(state),
    };
  }, [transactionStore]);
  const client = loaded?.key === key ? loaded.client : null;
  const error = loaded?.key === key ? loaded.error : null;
  const [hub] = useState(createEventHub);
  // StrictMode and shared callbacks settle the same result twice: announce each outcome once.
  const [announced] = useState(() => new WeakSet<object>());
  useEffect(() => (onEvent ? hub.subscribe(onEvent) : undefined), [hub, onEvent]);
  const emit = useCallback(
    (event: SanctumEvent, outcome?: object) => {
      if (outcome) {
        if (announced.has(outcome)) return;
        announced.add(outcome);
      }
      hub.emit(event);
    },
    [hub, announced],
  );

  useEffect(() => {
    let active = true;
    discover(key, config).then(
      (found) => {
        if (!active) return;
        setLoaded({ key, client: found, error: null });
        emit({ type: "ready", issuer: found.issuer });
      },
      (failure: unknown) => {
        if (!active) return;
        const typed = SanctumReactError.from(failure);
        setLoaded({ key, client: null, error: typed });
        emit({ type: "error", during: "discovery", error: typed });
      },
    );
    return () => {
      active = false;
    };
  }, [key, config, attempt, emit]);

  const ready = useCallback((): SanctumConnect => {
    if (!client) throw new SanctumReactError("not_ready", "Sanctum is still loading (discovery hasn't finished)");
    return client;
  }, [client]);

  const { session, signIn, completeCallback, refresh, signOut } = useSessionActions(ready, store, emit);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const value = useMemo<SanctumContextValue>(
    () => ({
      status: error ? "error" : client ? "ready" : "loading",
      error,
      config,
      session,
      signIn,
      completeCallback,
      refresh,
      signOut,
      retry,
      subscribe: hub.subscribe,
    }),
    [error, client, config, session, signIn, completeCallback, refresh, signOut, retry, hub],
  );
  return createElement(SanctumContext.Provider, { value }, children);
}

/** The nearest <SanctumProvider>'s state and actions. */
export function useSanctum(): SanctumContextValue {
  const value = useContext(SanctumContext);
  if (!value) throw new SanctumReactError("not_ready", "useSanctum must be used inside <SanctumProvider>");
  return value;
}

/** The signed-in session (memory only) and the actions that change it. */
export function useSession(): Pick<SanctumContextValue, "session" | "refresh" | "signOut"> {
  const { session, refresh, signOut } = useSanctum();
  return { session, refresh, signOut };
}
