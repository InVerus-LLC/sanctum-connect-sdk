"use client";
/**
 * The app's public wallet-kit document (`/connect/v1/apps/:clientId/kit` on the issuer): the app's
 * name and the sign-in methods its sign-in page will offer (the kit's choices within the app
 * project's enforced policy), so the drawer shows only what Sanctum will accept. Read when the
 * drawer opens; unknown method names are ignored; `passkey: false` hides passkeys (an issuer that
 * doesn't send it offers them). Its project's branding (ADR-0033) is kept only as plain text, an
 * `#rrggbb` accent and a logo served by the same issuer; anything else is dropped.
 */
import { useCallback, useEffect, useState } from "react";
import { useSanctum } from "./provider.ts";

export type KitMethod = "providers" | "evm_wallet" | "bitcoin" | "sso";
/** The app's branding: the accent met WCAG 2.2 AA on Sanctum (white text on it, 3:1 on the drawer's surfaces). */
export interface KitBranding { displayName: string | null; accentColor: string | null; logoUrl: string | null }
export interface SignInKit { appName: string; passkey: boolean; methods: ReadonlySet<KitMethod>; branding: KitBranding | null }

const KNOWN: readonly KitMethod[] = ["providers", "evm_wallet", "bitcoin", "sso"];

const text = (value: string, limit: number) => value.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, limit);

/** Branding from the kit document: text only, a #rrggbb accent, and a logo only from `issuer`'s own logo path. */
export function parseBranding(value: unknown, issuer: string | undefined): KitBranding | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { display_name?: unknown; accent_color?: unknown; logo_url?: unknown };
  const prefix = issuer === undefined || !URL.canParse(issuer) ? null : `${new URL(issuer).origin}/assets/project-logos/`;
  const logo = typeof record.logo_url === "string" && prefix !== null && record.logo_url.startsWith(prefix) && /^[0-9a-f/-]+$/u.test(record.logo_url.slice(prefix.length)) ? record.logo_url : null;
  const branding = {
    displayName: typeof record.display_name === "string" && text(record.display_name, 60) ? text(record.display_name, 60) : null,
    accentColor: typeof record.accent_color === "string" && /^#[0-9a-f]{6}$/iu.test(record.accent_color) ? record.accent_color.toLowerCase() : null,
    logoUrl: logo,
  };
  return branding.displayName === null && branding.accentColor === null && branding.logoUrl === null ? null : branding;
}

export function parseKit(body: unknown, issuer?: string): SignInKit | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as { app_name?: unknown; sign_in_methods?: unknown; passkey?: unknown; branding?: unknown };
  if (typeof record.app_name !== "string" || !Array.isArray(record.sign_in_methods)) return null;
  const methods = new Set(KNOWN.filter((method) => (record.sign_in_methods as unknown[]).includes(method)));
  return { appName: text(record.app_name, 80), passkey: record.passkey !== false, methods, branding: parseBranding(record.branding, issuer) };
}

export function useSignInKit(active: boolean) {
  const { config } = useSanctum();
  const [state, setState] = useState<{ key: string; kit: SignInKit | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${config.issuer}|${config.clientId}|${attempt}`;

  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    fetch(`${config.issuer}/connect/v1/apps/${encodeURIComponent(config.clientId)}/kit`, { credentials: "omit", signal: abort.signal })
      .then(async (response) => {
        const kit = response.ok ? parseKit(await response.json(), config.issuer) : null;
        setState({ key, kit, failed: kit === null });
      })
      .catch(() => { if (!abort.signal.aborted) setState({ key, kit: null, failed: true }); });
    return () => abort.abort();
  }, [active, config.issuer, config.clientId, key]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const current = state?.key === key ? state : null;
  return { status: current ? (current.failed ? "error" as const : "ready" as const) : "loading" as const, kit: current?.kit ?? null, retry };
}
