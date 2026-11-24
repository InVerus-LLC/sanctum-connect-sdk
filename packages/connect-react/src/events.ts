/**
 * Typed events from <SanctumProvider>, for analytics, logging or app state outside React. They carry
 * no token, code, pairing link or claim: only what happened, the pairwise subject and a typed error.
 * Listeners run synchronously; one that throws doesn't stop the others or the SDK.
 */
import type { SignInHint } from "@sanctum.ai/connect";
import type { SanctumReactError } from "./errors.ts";

export type SanctumEvent =
  /** Discovery finished: sign-in can start. */
  | { type: "ready"; issuer: string }
  /** The app is about to leave for Sanctum; `method` is the hinted method, if any. */
  | { type: "sign_in_started"; method: SignInHint["method"] | null }
  | { type: "signed_in"; subject: string }
  | { type: "refreshed"; subject: string }
  | { type: "signed_out"; endSanctumSession: boolean }
  | { type: "error"; during: "discovery" | "sign_in" | "callback" | "refresh"; error: SanctumReactError };

export type SanctumEventListener = (event: SanctumEvent) => void;

export interface SanctumEventHub {
  emit(event: SanctumEvent): void;
  /** Adds a listener; returns the function that removes it. */
  subscribe(listener: SanctumEventListener): () => void;
}

export function createEventHub(): SanctumEventHub {
  const listeners = new Set<SanctumEventListener>();
  return {
    emit(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // A listener's failure is the app's; it must not change sign-in.
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
