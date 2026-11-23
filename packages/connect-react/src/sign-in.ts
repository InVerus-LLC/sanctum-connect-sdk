"use client";
/**
 * Starting sign-in: `useSignIn` (guards double clicks; resets if the person comes back with the
 * browser's Back button) and `<SignInButton>`, "Continue with Sanctum" with the exact mark. The
 * button is disabled until discovery finishes, so a server render is inert, not broken.
 */
import { createElement as h, useCallback, useEffect, useRef, useState } from "react";
import { describeError, SanctumReactError } from "./errors.ts";
import { SanctumMark } from "./mark.ts";
import { useSanctum, type SignInOptions } from "./provider.ts";

export function useSignIn() {
  const { status, signIn } = useSanctum();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SanctumReactError | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    // Returning from Sanctum with Back restores this page from the back/forward cache: allow another try.
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      busy.current = false;
      setPending(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  const start = useCallback(async (options?: SignInOptions) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await signIn(options);
    } catch (failure) {
      busy.current = false;
      setPending(false);
      setError(SanctumReactError.from(failure));
    }
  }, [signIn]);

  return { signIn: start, pending, error, ready: status === "ready" };
}

export interface SignInButtonProps {
  /** Default "Continue with Sanctum". */
  label?: string;
  className?: string;
  /** "login" asks Sanctum to authenticate again even with a session. */
  prompt?: "login" | "consent";
}

export function SignInButton({ label = "Continue with Sanctum", className, prompt }: SignInButtonProps) {
  const { status, error: discoveryError, retry } = useSanctum();
  const { signIn, pending, error, ready } = useSignIn();
  const shown = error ?? discoveryError;
  return h("span", { className: "sanctum-sign-in" },
    h("button", {
      type: "button", className: className ? `sanctum-button ${className}` : "sanctum-button", disabled: !ready || pending,
      "aria-busy": pending || status === "loading" ? true : undefined, onClick: () => void signIn(prompt ? { prompt } : undefined),
    }, h(SanctumMark, { className: "sanctum-mark", width: 20, height: 20 }), h("span", null, label)),
    shown ? h("span", { className: "sanctum-error", role: "alert" }, describeError(shown)) : null,
    status === "error" ? h("button", { type: "button", className: "sanctum-link-button", onClick: retry }, "Try again") : null,
  );
}
