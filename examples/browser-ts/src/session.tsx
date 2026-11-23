/**
 * The sign-in round trip for a browser app (a public client: PKCE, no secret). The transaction waits
 * in this tab's sessionStorage and is taken once; tokens stay in memory only, so a reload signs the
 * app out. The callback's code and state are removed from the address bar before the exchange.
 */
import { SanctumConnectError, type SanctumConnect, type SignInHint, type SignInResult, type SignInTransaction } from "@inverus/connect";

const KEY = "example.sanctum.transaction";

export async function startSignIn(sanctum: SanctumConnect, hint: SignInHint): Promise<void> {
  const { url, transaction } = await sanctum.startSignIn({ hint });
  sessionStorage.setItem(KEY, JSON.stringify(transaction));
  window.location.assign(url.href);
}

/** Finishes the sign-in this page's URL belongs to, or returns null when it isn't a callback. */
export async function finishIfCallback(sanctum: SanctumConnect): Promise<SignInResult | null> {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("state")) return null;
  const stored = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  const clean = new URL(url);
  for (const name of ["code", "state", "iss", "error", "error_description"]) clean.searchParams.delete(name);
  window.history.replaceState(null, "", clean.href);
  if (!stored) throw new SanctumConnectError("invalid_response", "This sign-in was already finished or started in another tab");
  return sanctum.finishSignIn(url, JSON.parse(stored) as SignInTransaction, { signal: AbortSignal.timeout(15_000) });
}

/** Revokes both tokens, then ends the Sanctum session for this app (RP-initiated logout). */
export async function signOut(sanctum: SanctumConnect, result: SignInResult, returnTo: string): Promise<void> {
  const options = { signal: AbortSignal.timeout(10_000) };
  await Promise.allSettled([result.refreshToken ? sanctum.revoke(result.refreshToken, options) : null, sanctum.revoke(result.accessToken, options)]);
  window.location.assign(sanctum.signOutUrl({ idTokenHint: result.idToken, postLogoutRedirectUri: returnTo }).href);
}
