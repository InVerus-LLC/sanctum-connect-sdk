"use client";
import { useEffect, useMemo, useState } from "react";
import type { SanctumConnect, SignInResult } from "@sanctum.ai/connect";
import { SanctumReactError } from "./errors.ts";
import type { SanctumEvent } from "./events.ts";
import type { SanctumContextValue, SanctumSession, SignInOptions } from "./provider-types.ts";
import { completeSignIn, type TransactionStore } from "./transactions.ts";

interface Auth {
  session: SanctumSession;
  idToken: string;
  refreshToken: string | undefined;
}

function toAuth(result: SignInResult): Auth {
  return {
    session: {
      subject: result.subject,
      claims: Object.freeze({ ...result.claims }),
      accessToken: result.accessToken,
      expiresAt: result.expiresIn === undefined ? null : Date.now() + result.expiresIn * 1000,
      scope: result.scope ?? null,
    },
    idToken: result.idToken,
    refreshToken: result.refreshToken,
  };
}

type Emit = (event: SanctumEvent, outcome?: object) => void;
type Actions = Pick<SanctumContextValue, "signIn" | "completeCallback" | "refresh" | "signOut">;
interface Lifecycle {
  active: boolean;
  generation: number;
  auth: Auth | null;
  refresh: Promise<SanctumSession> | null;
  callback: { url: string; promise: Promise<SanctumSession> } | null;
}

/** Operations belong to one mounted provider and one session generation. */
export function useSessionActions(ready: () => SanctumConnect, store: TransactionStore, emit: Emit) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [life] = useState<Lifecycle>(() => ({
    active: true,
    generation: 0,
    auth: null,
    refresh: null,
    callback: null,
  }));
  useEffect(() => {
    life.active = true;
    return () => {
      life.active = false;
      life.generation += 1;
      life.auth = null;
      life.refresh = null;
      life.callback = null;
    };
  }, [life]);

  const actions = useMemo<Actions>(() => {
    const active = (generation: number) => life.active && life.generation === generation;
    const assertActive = (generation: number) => {
      if (!active(generation))
        throw new SanctumReactError("aborted", "The sign-in session changed while this operation was pending");
    };
    const commit = (next: Auth | null) => {
      life.auth = next;
      setAuth(next);
    };
    const revoke = (client: SanctumConnect, tokens: { accessToken: string; refreshToken?: string }) =>
      Promise.allSettled([
        client.revoke(tokens.accessToken),
        ...(tokens.refreshToken ? [client.revoke(tokens.refreshToken)] : []),
      ]);

    return {
      async signIn(options: SignInOptions = {}) {
        assertActive(life.generation);
        const generation = ++life.generation;
        life.callback = null;
        life.refresh = null;
        try {
          const started = await ready().startSignIn(options);
          assertActive(generation);
          store.put(started.transaction);
          emit({ type: "sign_in_started", method: options.hint?.method ?? null });
          window.location.assign(started.url.href);
        } catch (failure) {
          const error = SanctumReactError.from(failure);
          if (active(generation)) emit({ type: "error", during: "sign_in", error });
          throw error;
        }
      },
      async completeCallback(url) {
        assertActive(life.generation);
        if (life.callback?.url === url) return life.callback.promise;
        const client = ready();
        const generation = ++life.generation;
        life.refresh = null;
        const pending = (async () => {
          try {
            const result = await completeSignIn(client, store, url);
            if (!active(generation)) void revoke(client, result);
            assertActive(generation);
            const next = toAuth(result);
            commit(next);
            emit({ type: "signed_in", subject: next.session.subject }, result);
            return next.session;
          } catch (failure) {
            const error = SanctumReactError.from(failure);
            if (active(generation)) emit({ type: "error", during: "callback", error }, error);
            throw error;
          }
        })();
        life.callback = { url, promise: pending };
        try {
          return await pending;
        } finally {
          if (life.callback?.promise === pending) life.callback = null;
        }
      },
      async refresh() {
        assertActive(life.generation);
        if (life.refresh) return life.refresh;
        const current = life.auth;
        if (!current?.refreshToken) throw new SanctumReactError("not_ready", "There is no session to refresh");
        const refreshToken = current.refreshToken;
        const client = ready();
        const generation = life.generation;
        const pending = (async () => {
          try {
            const tokens = await client.refresh(refreshToken);
            if (!active(generation)) void revoke(client, tokens);
            assertActive(generation);
            const session = {
              ...current.session,
              accessToken: tokens.accessToken,
              expiresAt: tokens.expiresIn === undefined ? null : Date.now() + tokens.expiresIn * 1000,
            };
            commit({ ...current, session, refreshToken: tokens.refreshToken ?? current.refreshToken });
            emit({ type: "refreshed", subject: session.subject });
            return session;
          } catch (failure) {
            const error = SanctumReactError.from(failure);
            if (active(generation)) emit({ type: "error", during: "refresh", error });
            throw error;
          }
        })();
        life.refresh = pending;
        try {
          return await pending;
        } finally {
          if (life.refresh === pending) life.refresh = null;
        }
      },
      async signOut(options = {}) {
        assertActive(life.generation);
        const current = life.auth;
        const generation = ++life.generation;
        life.refresh = null;
        life.callback = null;
        commit(null);
        if (!current) return;
        emit({ type: "signed_out", endSanctumSession: options.endSanctumSession === true });
        const client = ready();
        await revoke(client, {
          accessToken: current.session.accessToken,
          ...(current.refreshToken ? { refreshToken: current.refreshToken } : {}),
        });
        if (options.endSanctumSession && active(generation)) {
          window.location.assign(
            client.signOutUrl({
              idTokenHint: current.idToken,
              ...(options.postLogoutRedirectUri ? { postLogoutRedirectUri: options.postLogoutRedirectUri } : {}),
            }).href,
          );
        }
      },
    };
  }, [ready, store, emit, life]);
  return { session: auth?.session ?? null, ...actions };
}
