"use client";
/**
 * <SanctumProvider>: one Sanctum issuer and public client (PKCE, no secret) for a React app.
 *
 *  - SSR-safe: nothing touches the browser while rendering; discovery runs in an effect on the
 *    client (once per configuration in a page), so a server render shows the loading state.
 *  - The signed-in session lives in memory only. The SDK never writes a token to storage, a URL
 *    or a message; a reload signs the app out. Apps that need longer sessions use a server-side
 *    (confidential) integration instead.
 *  - Late results after the provider unmounts change nothing (React drops their state updates).
 *  - Typed events (`onEvent`, or `subscribe` from useSanctum) report ready, sign-in, refresh,
 *    sign-out and errors once each, without tokens (events.ts).
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SanctumConnect, type SanctumConnectConfig, type SignInHint, type SignInResult } from "@inverus/connect";
import { SanctumReactError } from "./errors.ts";
import { createEventHub, type SanctumEvent, type SanctumEventListener } from "./events.ts";
import { completeSignIn, sessionTransactionStore, type TransactionStore } from "./transactions.ts";

export interface SanctumConfig {
  /** The Sanctum issuer origin, for example https://id.example.com. */
  issuer: string;
  clientId: string;
  /** Exactly as registered; the page that renders <SignInCallback>. */
  redirectUri: string;
  /** Default "openid". */
  scope?: string;
  /** Loopback development only: allows an http:// issuer on localhost or 127.0.0.1. */
  allowInsecureLoopback?: boolean;
}

export interface SanctumSession {
  /** The pairwise subject Sanctum issues for this app. */
  subject: string;
  /** The verified ID token's claims. */
  claims: Readonly<Record<string, unknown>>;
  accessToken: string;
  /** When the access token expires (ms since the epoch), or null if the issuer didn't say. */
  expiresAt: number | null;
  scope: string | null;
}

export interface SanctumContextValue {
  status: "loading" | "ready" | "error";
  error: SanctumReactError | null;
  config: SanctumConfig;
  session: SanctumSession | null;
  /** Redirects to Sanctum (opening the hinted method first). The transaction waits in this tab's sessionStorage. */
  signIn(options?: SignInOptions): Promise<void>;
  /** Finishes the sign-in a callback URL belongs to (at most once per sign-in). */
  completeCallback(url: string): Promise<SanctumSession>;
  /** Uses the rotated refresh token for a new access token. */
  refresh(): Promise<SanctumSession>;
  /** Forgets the session and revokes its tokens; optionally also ends the Sanctum session (redirect). */
  signOut(options?: { endSanctumSession?: boolean; postLogoutRedirectUri?: string }): Promise<void>;
  /** Retries discovery after an error. */
  retry(): void;
  /** Listens to this provider's typed events; returns the function that stops listening. */
  subscribe(listener: SanctumEventListener): () => void;
}

export interface SignInOptions { prompt?: "login" | "consent"; maxAge?: number; hint?: SignInHint }

export interface SanctumProviderProps extends SanctumConfig {
  /** Where sign-in transactions wait between redirect and callback; default: this tab's sessionStorage. */
  transactionStore?: TransactionStore;
  /** Typed events (no tokens). A new function re-subscribes; memoize it to avoid that churn. */
  onEvent?: SanctumEventListener;
  children?: ReactNode;
}

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

const toSession = (result: Pick<SignInResult, "subject" | "claims" | "accessToken" | "expiresIn" | "scope">, now: number): SanctumSession => ({
  subject: result.subject, claims: Object.freeze({ ...result.claims }), accessToken: result.accessToken,
  expiresAt: result.expiresIn ? now + result.expiresIn * 1000 : null, scope: result.scope ?? null,
});

export function SanctumProvider({ issuer, clientId, redirectUri, scope, allowInsecureLoopback, transactionStore, onEvent, children }: SanctumProviderProps) {
  const config = useMemo<SanctumConfig>(() => ({
    issuer, clientId, redirectUri, ...(scope ? { scope } : {}), ...(allowInsecureLoopback ? { allowInsecureLoopback: true } : {}),
  }), [issuer, clientId, redirectUri, scope, allowInsecureLoopback]);
  const key = JSON.stringify([issuer, clientId, redirectUri, scope ?? null, allowInsecureLoopback === true]);
  const [loaded, setLoaded] = useState<{ key: string; client: SanctumConnect | null; error: SanctumReactError | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The session and the tokens that go with it, in memory only.
  const [auth, setAuth] = useState<{ session: SanctumSession; idToken: string; refreshToken: string | undefined } | null>(null);
  const session = auth?.session ?? null;
  const store = useMemo(() => transactionStore ?? sessionTransactionStore(), [transactionStore]);
  const client = loaded?.key === key ? loaded.client : null;
  const error = loaded?.key === key ? loaded.error : null;
  const [hub] = useState(createEventHub);
  // StrictMode and shared callbacks settle the same result twice: announce each outcome once.
  const [announced] = useState(() => new WeakSet<object>());
  useEffect(() => (onEvent ? hub.subscribe(onEvent) : undefined), [hub, onEvent]);
  const emit = useCallback((event: SanctumEvent, outcome?: object) => {
    if (outcome) {
      if (announced.has(outcome)) return;
      announced.add(outcome);
    }
    hub.emit(event);
  }, [hub, announced]);

  useEffect(() => {
    let active = true;
    discover(key, config).then(
      (found) => { if (!active) return; setLoaded({ key, client: found, error: null }); emit({ type: "ready", issuer: found.issuer }); },
      (failure: unknown) => {
        if (!active) return;
        const typed = SanctumReactError.from(failure);
        setLoaded({ key, client: null, error: typed });
        emit({ type: "error", during: "discovery", error: typed });
      },
    );
    return () => { active = false; };
  }, [key, config, attempt, emit]);

  const ready = useCallback((): SanctumConnect => {
    if (!client) throw new SanctumReactError("not_ready", "Sanctum is still loading (discovery hasn't finished)");
    return client;
  }, [client]);

  const signIn = useCallback(async (options: SignInOptions = {}) => {
    try {
      const started = await ready().startSignIn(options);
      store.put(started.transaction);
      emit({ type: "sign_in_started", method: options.hint?.method ?? null });
      window.location.assign(started.url.href);
    } catch (failure) {
      const typed = SanctumReactError.from(failure);
      emit({ type: "error", during: "sign_in", error: typed });
      throw typed;
    }
  }, [ready, store, emit]);

  const completeCallback = useCallback(async (url: string) => {
    let result: SignInResult;
    try {
      result = await completeSignIn(ready(), store, url);
    } catch (failure) {
      const typed = SanctumReactError.from(failure);
      emit({ type: "error", during: "callback", error: typed }, failure instanceof Error ? failure : undefined);
      throw typed;
    }
    const next = toSession(result, Date.now());
    setAuth({ session: next, idToken: result.idToken, refreshToken: result.refreshToken });
    emit({ type: "signed_in", subject: next.subject }, result);
    return next;
  }, [ready, store, emit]);

  const refresh = useCallback(async () => {
    const current = auth;
    if (!current?.refreshToken) throw new SanctumReactError("not_ready", "There is no session to refresh");
    const next = await ready().refresh(current.refreshToken).catch((failure: unknown) => {
      const typed = SanctumReactError.from(failure);
      emit({ type: "error", during: "refresh", error: typed });
      throw typed;
    });
    const updated: SanctumSession = { ...current.session, accessToken: next.accessToken, expiresAt: next.expiresIn ? Date.now() + next.expiresIn * 1000 : null };
    // Sanctum rotates refresh tokens: keep only the newest.
    setAuth({ session: updated, idToken: current.idToken, refreshToken: next.refreshToken ?? current.refreshToken });
    emit({ type: "refreshed", subject: updated.subject });
    return updated;
  }, [ready, auth, emit]);

  const signOut = useCallback(async (options: { endSanctumSession?: boolean; postLogoutRedirectUri?: string } = {}) => {
    const current = auth;
    setAuth(null);
    if (current) emit({ type: "signed_out", endSanctumSession: options.endSanctumSession === true });
    if (!client || !current) return;
    await Promise.allSettled([current.refreshToken ? client.revoke(current.refreshToken) : null, client.revoke(current.session.accessToken)]);
    if (options.endSanctumSession) {
      window.location.assign(client.signOutUrl({ idTokenHint: current.idToken, ...(options.postLogoutRedirectUri ? { postLogoutRedirectUri: options.postLogoutRedirectUri } : {}) }).href);
    }
  }, [client, auth, emit]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const value = useMemo<SanctumContextValue>(() => ({
    status: error ? "error" : client ? "ready" : "loading", error, config, session, signIn, completeCallback, refresh, signOut, retry, subscribe: hub.subscribe,
  }), [error, client, config, session, signIn, completeCallback, refresh, signOut, retry, hub]);
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
