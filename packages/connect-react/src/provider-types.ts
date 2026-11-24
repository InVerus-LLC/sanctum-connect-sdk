import type { ReactNode } from "react";
import type { SignInHint } from "@sanctum.ai/connect";
import type { SanctumReactError } from "./errors.ts";
import type { SanctumEventListener } from "./events.ts";
import type { TransactionStore } from "./transactions.ts";

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

export interface SignInOptions {
  prompt?: "login" | "consent";
  maxAge?: number;
  hint?: SignInHint;
}

export interface SanctumProviderProps extends SanctumConfig {
  /** Where sign-in transactions wait between redirect and callback; default: this tab's sessionStorage. */
  transactionStore?: TransactionStore;
  /** Typed events (no tokens). A new function re-subscribes; memoize it to avoid that churn. */
  onEvent?: SanctumEventListener;
  children?: ReactNode;
}
