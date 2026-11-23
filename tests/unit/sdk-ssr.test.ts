/**
 * Server-side rendering fixtures for the SDKs (W-18): with every browser global trapped (window,
 * document, navigator, location, history, localStorage, sessionStorage, matchMedia), importing
 * @inverus/connect, /wallets, /qr and @inverus/connect-react and rendering every exported control
 * with react-dom/server uses none of them and sends no request. The traps answer undefined, as a
 * server runtime would; the only reads allowed are `typeof <global>` guards (checked against the
 * source line), such as oauth4webapi's User-Agent check and the callback hook's `typeof window`.
 * Also the provider's typed event hub: ordered delivery, unsubscribe, a throwing listener isolated.
 * The same import-and-render check runs against the packed tarballs under Node 20, 22 and 26 in the
 * consumer smoke test (packages/connect/release/consumer/smoke.mjs).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const BROWSER_GLOBALS = ["window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "matchMedia", "HTMLElement", "customElements"];
const touched: string[] = [];
/** Where the read came from: the first stack frame outside this getter, relative to the repository. */
const reader = () => (new Error().stack ?? "").split("\n")[3]?.replace(/^.*\((.*)\)$|^\s*at\s+/u, "$1").replace(pathToFileURL(process.cwd()).href + "/", "") ?? "";
for (const name of BROWSER_GLOBALS) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(`${name} ${reader()}`); return undefined; } });
}
/** A read is fine only when the source at that position is `typeof <name>` (a guard, never a use). */
function guarded(entry: string): boolean {
  const match = /^(\w+) (.+):(\d+):(\d+)$/u.exec(entry);
  if (!match) return false;
  const [, name, file, line, column] = match;
  const text = readFileSync(file!.replace(/^file:\/\//u, ""), "utf8").split("\n")[Number(line) - 1] ?? "";
  // V8 points at the `typeof` operator, or at the start of an `if (typeof …)` statement.
  return new RegExp(`^(?:if\\s*\\(\\s*)?typeof ${name}\\b`, "u").test(text.slice(Number(column) - 1));
}
const sdkReads = () => touched.filter((entry) => !guarded(entry));
let requests = 0;
globalThis.fetch = (() => { requests += 1; return Promise.reject(new Error("no requests during server rendering")); }) as typeof fetch;

// Computed specifiers: loaded after the traps are in place (static imports would run first), and
// untyped here so React's global DOM stand-ins stay out of the repository's Node-typed root project.
const load = (path: string) => import(pathToFileURL(path).href) as Promise<Record<string, unknown>>;
type Element = unknown;
type Component = (props: Record<string, unknown>) => Element;
const react = (await import(["react"].join(""))) as { createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: Element[]) => Element };
const server = (await import(["react-dom", "server"].join("/"))) as { renderToString: (element: Element) => string };
const h = react.createElement;
const renderToString = server.renderToString;

test("the core entry points import without touching a browser global", async () => {
  const core = await load("packages/connect/src/index.ts");
  const wallets = await load("packages/connect/src/wallets.ts");
  const qr = await load("packages/connect/src/qr.ts");
  assert.equal(typeof core.SanctumConnect, "function");
  assert.equal(typeof wallets.searchWallets, "function");
  assert.equal((qr.qrModules as (value: string) => boolean[][])("https://id.example.com").length > 0, true);
  assert.deepEqual(sdkReads(), [], touched.join("; "));
});

test("every React control renders on the server without a browser global or a request", async () => {
  const sdk = await load("packages/connect-react/src/index.ts");
  const component = (name: string) => sdk[name] as Component;
  const useWalletSession = sdk.useWalletSession as (options: { chains: string[]; methods: string[] }) => unknown;
  function Wallet() {
    return h(component("SanctumWalletConnect"), { wallet: useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"] }) });
  }
  const tree = h(component("SanctumProvider"), { issuer: "https://id.example.com", clientId: "client-1", redirectUri: "https://app.example.com/callback", onEvent: () => undefined },
    h(component("SignInButton")), h(component("SignInDrawerButton")), h(component("SanctumSignInDrawer"), { open: false, onClose: () => undefined }),
    h(component("SignInCallback")), h(Wallet), h(component("SanctumMark"), { width: 20, height: 20 }),
    h(component("SanctumQrCode"), { value: "https://id.example.com/wallet-link#x", label: "QR code" }));
  const html = renderToString(tree);
  assert.match(html, /Continue with Sanctum/u);
  assert.match(html, /Connect Sanctum wallet/u);
  assert.match(html, /role="img" aria-label="QR code"/u);
  assert.deepEqual(sdkReads(), [], `no browser global was read during import or render: ${touched.join("; ")}`);
  assert.equal(requests, 0, "discovery and the kit wait for the client");
});

test("the event hub delivers in order, stops after unsubscribe and isolates a throwing listener", async () => {
  const { createEventHub } = await load("packages/connect-react/src/events.ts") as { createEventHub: () => { emit(event: unknown): void; subscribe(listener: (event: { type: string }) => void): () => void } };
  const hub = createEventHub();
  const heard: string[] = [];
  hub.subscribe(() => { throw new Error("the app's bug"); });
  const stop = hub.subscribe((event) => heard.push(`a:${event.type}`));
  hub.subscribe((event) => heard.push(`b:${event.type}`));
  hub.emit({ type: "ready", issuer: "https://id.example.com" });
  stop();
  hub.emit({ type: "signed_out", endSanctumSession: false });
  assert.deepEqual(heard, ["a:ready", "b:ready", "b:signed_out"]);
});
