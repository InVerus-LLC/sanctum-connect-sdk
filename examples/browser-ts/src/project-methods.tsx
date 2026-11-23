/**
 * The sign-in methods this app may offer: Sanctum's public kit document for the client
 * (`GET /connect/v1/apps/:clientId/kit`) already intersects the app's wallet kit with its App
 * project's enforced sign-in policy. Showing only these avoids dead ends; it is presentation, not
 * security: Sanctum refuses any other method itself (403 sign_in_method_not_allowed).
 * (.tsx only so the repository's Node-typed root project leaves this DOM code to the DOM-typed SDK
 * project; there is no JSX.)
 */
import type { SignInHint } from "@inverus/connect";

export interface OfferedMethod { label: string; hint: SignInHint }

const LABELS: Record<string, OfferedMethod> = {
  evm_wallet: { label: "Continue with an Ethereum wallet", hint: { method: "wallet" } },
  bitcoin: { label: "Continue with a Bitcoin wallet", hint: { method: "bitcoin" } },
  sso: { label: "Sign in with SSO", hint: { method: "sso" } },
  providers: { label: "Continue with another account", hint: { method: "providers" } },
};

export async function offeredMethods(issuer: string, clientId: string, signal: AbortSignal): Promise<{ appName: string; methods: OfferedMethod[] }> {
  const response = await fetch(`${issuer}/connect/v1/apps/${encodeURIComponent(clientId)}/kit`, { credentials: "omit", signal });
  if (!response.ok) throw new Error(response.status === 404 ? "This app isn't active (unknown client, or its project is disabled or archived)" : `The kit couldn't load (${response.status})`);
  const kit = (await response.json()) as { app_name?: unknown; passkey?: unknown; sign_in_methods?: unknown };
  const names = Array.isArray(kit.sign_in_methods) ? kit.sign_in_methods.filter((name): name is string => typeof name === "string") : [];
  const methods = [
    ...(kit.passkey !== false ? [{ label: "Continue with a passkey", hint: { method: "passkey" } } satisfies OfferedMethod] : []),
    ...names.flatMap((name) => (LABELS[name] ? [LABELS[name]] : [])),
  ];
  return { appName: typeof kit.app_name === "string" ? kit.app_name.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 80) : "this app", methods };
}
