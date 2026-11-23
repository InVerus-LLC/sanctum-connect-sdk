/**
 * A browser app with no framework that uses only the headless core SDK, @inverus/connect: it lists
 * the sign-in methods its App project allows (project-methods.tsx), starts sign-in with the chosen
 * method as a hint, finishes the callback on its own page and signs out. Everything is rendered
 * with textContent, never as HTML. Configuration comes from #app's data attributes.
 */
import { SanctumConnect, SanctumConnectError, type SignInResult } from "@inverus/connect";
import { offeredMethods } from "./project-methods.tsx";
import { finishIfCallback, signOut, startSignIn } from "./session.tsx";

const root = document.getElementById("app")!;
const status = document.getElementById("status")!;
const methods = document.getElementById("methods")!;
const account = document.getElementById("account")!;
const { issuer = "", clientId = "", redirectUri = "" } = root.dataset;
const say = (text: string) => { status.textContent = text; };

function describe(error: unknown): string {
  if (error instanceof SanctumConnectError) return `Sign-in didn't complete (${error.code}).`;
  return error instanceof Error ? error.message : "Something went wrong.";
}

function showSignedIn(sanctum: SanctumConnect, result: SignInResult): void {
  methods.replaceChildren();
  account.hidden = false;
  document.getElementById("subject")!.textContent = `Signed in as ${result.subject}`;
  document.getElementById("sign-out")!.addEventListener("click", () => void signOut(sanctum, result, redirectUri), { once: true });
  say("Signed in.");
}

async function showMethods(sanctum: SanctumConnect): Promise<void> {
  const { appName, methods: offered } = await offeredMethods(issuer, clientId, AbortSignal.timeout(10_000));
  methods.replaceChildren(...offered.map(({ label, hint }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      button.disabled = true;
      startSignIn(sanctum, hint).catch((error: unknown) => { button.disabled = false; say(describe(error)); });
    });
    return button;
  }));
  say(offered.length ? `Sign in to ${appName}.` : `${appName} offers no sign-in method here.`);
}

try {
  const sanctum = await SanctumConnect.discover({ issuer, clientId, redirectUri, allowInsecureLoopback: true }, { signal: AbortSignal.timeout(10_000) });
  const result = await finishIfCallback(sanctum).catch((error: unknown) => { say(describe(error)); return null; });
  if (result) showSignedIn(sanctum, result);
  else await showMethods(sanctum);
} catch (error) {
  say(describe(error));
}
