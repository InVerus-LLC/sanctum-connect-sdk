"use client";
/**
 * The redirect URI's page: `useSignInCallback` finishes the sign-in the URL belongs to, once, and
 * removes the one-time code and state from the address bar and history. `<SignInCallback>` shows
 * progress or a plain failure with "Start again". A reloaded, replayed or other-tab callback fails
 * truthfully; a late result after unmount is ignored.
 */
import { createElement as h, useEffect, useRef, useState } from "react";
import { describeError, SanctumReactError } from "./errors.ts";
import { useSanctum, type SanctumSession } from "./provider.ts";
import { useSignIn } from "./sign-in.ts";

const RESPONSE_PARAMS = ["code", "state", "iss", "error", "error_description", "error_uri", "session_state"];

function withoutResponse(url: string): string {
  const parsed = new URL(url);
  for (const name of RESPONSE_PARAMS) parsed.searchParams.delete(name);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export type CallbackState =
  | { status: "working" }
  | { status: "done"; session: SanctumSession }
  | { status: "error"; error: SanctumReactError };

export function useSignInCallback(options: { onSignedIn?: (session: SanctumSession) => void } = {}): CallbackState {
  const { status, error: discoveryError, completeCallback } = useSanctum();
  // Read once on the client: the address bar is cleaned below, and StrictMode re-runs effects with this same state.
  const [url] = useState(() => (typeof window === "undefined" ? null : window.location.href));
  const [outcome, setOutcome] = useState<CallbackState | null>(null);
  const onSignedIn = useRef(options.onSignedIn);
  useEffect(() => { onSignedIn.current = options.onSignedIn; });

  useEffect(() => {
    if (status !== "ready" || url === null) return;
    let active = true;
    window.history.replaceState(window.history.state, "", withoutResponse(url));
    completeCallback(url).then(
      (session) => {
        if (!active) return;
        setOutcome({ status: "done", session });
        onSignedIn.current?.(session);
      },
      (failure: unknown) => { if (active) setOutcome({ status: "error", error: SanctumReactError.from(failure) }); },
    );
    return () => { active = false; };
  }, [status, url, completeCallback]);

  if (outcome) return outcome;
  if (discoveryError) return { status: "error", error: discoveryError };
  return { status: "working" };
}

export function SignInCallback({ onSignedIn, className }: { onSignedIn?: (session: SanctumSession) => void; className?: string }) {
  const state = useSignInCallback(onSignedIn ? { onSignedIn } : {});
  const { signIn, pending } = useSignIn();
  const classes = className ? `sanctum-callback ${className}` : "sanctum-callback";
  if (state.status === "error") {
    return h("div", { className: classes, "data-sanctum-callback": "error" },
      h("p", { role: "alert" }, describeError(state.error)),
      h("button", { type: "button", className: "sanctum-button", disabled: pending, onClick: () => void signIn() }, "Start again"));
  }
  return h("p", { className: classes, role: "status", "data-sanctum-callback": state.status }, state.status === "done" ? "Signed in." : "Finishing sign-in…");
}
