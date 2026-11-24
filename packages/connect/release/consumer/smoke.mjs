/**
 * Runtime smoke test of the PACKED SDK tarballs in an isolated consumer (run by consumer-smoke.ts
 * with each Node version found). Browser globals are trapped before anything is imported; the only
 * reads allowed are `typeof <global>` guards. It checks: ESM import of every entry point on a server
 * runtime, deep imports and require() refused by the exports map, typed errors and an aborted call,
 * a sign-in URL from a fake issuer, and a React server render of every control with react-dom/server
 * that touches no browser API and sends no request.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const GLOBALS = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "matchMedia",
  "HTMLElement",
  "customElements",
];
const reads = [];
for (const name of GLOBALS) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      reads.push(`${name} ${(new Error().stack ?? "").split("\n")[2] ?? ""}`);
      return undefined;
    },
  });
}
function unguarded() {
  return reads.filter((entry) => {
    const match = /^(\w+) .*?(file:\/\/[^\s)]+):(\d+):(\d+)/u.exec(entry);
    if (!match) return true;
    const line = readFileSync(fileURLToPath(match[2]), "utf8").split("\n")[Number(match[3]) - 1] ?? "";
    return !new RegExp(`^(?:if\\s*\\(\\s*)?typeof ${match[1]}\\b`, "u").test(line.slice(Number(match[4]) - 1));
  });
}
let requests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = () => {
  requests += 1;
  return Promise.reject(new Error("no requests during server rendering"));
};

const core = await import("@sanctum.ai/connect");
const wallets = await import("@sanctum.ai/connect/wallets");
const qr = await import("@sanctum.ai/connect/qr");
const workloads = await import("@sanctum.ai/connect/workloads");
assert.equal(typeof workloads.requestWorkloadToken, "function");
const receipts = await import("@sanctum.ai/connect/receipts");
assert.equal(
  (await receipts.verifySignedReceipts(null, { issuer: "https://id.example.test", owner: "owner", keys: { keys: [] } }))
    .valid,
  false,
);
const sdk = await import("@sanctum.ai/connect-react");
const { createElement: h } = await import("react");
const { renderToString } = await import("react-dom/server");
assert.deepEqual(unguarded(), [], "importing touched a browser global");

// The exports map is the only way in: no internals, no source, ESM only.
for (const deep of [
  "@sanctum.ai/connect/esm/index.js",
  "@sanctum.ai/connect/package.json",
  "@sanctum.ai/connect-react/src/index.ts",
  "@sanctum.ai/connect-react/esm/provider.js",
]) {
  await assert.rejects(import(deep), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }, deep);
}
assert.throws(
  () => createRequire(import.meta.url)("@sanctum.ai/connect"),
  { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" },
  "ESM only: no require condition",
);

// Typed errors, the provider error codes, wallet search and QR encoding.
assert.equal(new core.SanctumConnectError("aborted", "x").code, "aborted");
assert.deepEqual([core.PROVIDER_ERRORS.disconnected, core.PROVIDER_ERRORS.limitExceeded], [4900, -32005]);
assert.equal(wallets.searchWallets({ query: "META", family: "all", installed: [] }).other[0]?.name, "MetaMask");
assert.ok(qr.qrModules("https://id.example.com/agents/claim").length >= 21);
assert.match(qr.qrTerminal("https://id.example.com"), /[▀▄█]/u);

// A sign-in URL from a fake issuer, and an aborted discovery as a typed error.
const issuer = "https://id.example.com";
const metadata = {
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
  end_session_endpoint: `${issuer}/logout`,
  code_challenge_methods_supported: ["S256"],
  id_token_signing_alg_values_supported: ["ES256"],
  authorization_response_iss_parameter_supported: true,
};
const fake = async () => new Response(JSON.stringify(metadata), { headers: { "content-type": "application/json" } });
const client = await core.SanctumConnect.discover({
  issuer,
  clientId: "client-1",
  redirectUri: "https://app.example.com/callback",
  fetch: fake,
});
const { url, transaction } = await client.startSignIn({ hint: { method: "passkey" } });
assert.equal(url.searchParams.get("code_challenge_method"), "S256");
assert.equal(url.searchParams.get("sanctum_method"), "passkey");
assert.ok(!url.href.includes(transaction.codeVerifier), "the verifier stays out of the URL");
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  core.SanctumConnect.discover(
    { issuer, clientId: "c", redirectUri: "https://app.example.com/cb", fetch: fake },
    { signal: aborted.signal },
  ),
  { code: "aborted" },
);

// A server render of every control: inert, no browser API, no request.
function Wallet() {
  return h(sdk.SanctumWalletConnect, {
    wallet: sdk.useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"] }),
  });
}
const html = renderToString(
  h(
    sdk.SanctumProvider,
    { issuer, clientId: "client-1", redirectUri: "https://app.example.com/callback", onEvent: () => undefined },
    h(sdk.SignInButton),
    h(sdk.SignInDrawerButton),
    h(sdk.SignInCallback),
    h(Wallet),
    h(sdk.SanctumMark, { width: 20, height: 20 }),
    h(sdk.SanctumQrCode, { value: "https://id.example.com/wallet-link#x", label: "QR code" }),
  ),
);
assert.match(
  html,
  /<button type="button" class="sanctum-button" disabled="" aria-busy="true">/u,
  "controls wait for the client",
);
assert.match(
  html,
  /<dialog class="sanctum-drawer" aria-labelledby="[^"]+"><\/dialog>/u,
  "the drawer is a closed, empty dialog",
);
assert.match(html, /Connect Sanctum wallet/u);
assert.deepEqual(unguarded(), [], "rendering touched a browser global");
assert.equal(requests, 0, "no request while rendering");
globalThis.fetch = realFetch;
console.log(
  `smoke ok: Node ${process.version}, ${html.length} characters of server HTML, guarded reads: ${reads.length}`,
);
