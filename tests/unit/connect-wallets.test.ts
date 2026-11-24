/**
 * Wallet discovery, the catalogue search and sign-in hints in the core SDK (no browser): EIP-6963
 * announcements are deduplicated and their untrusted metadata constrained; search is case- and
 * accent-insensitive with a chain filter, stable order and no double listing of an installed
 * wallet; hints are validated before they reach the authorization URL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SanctumConnect,
  searchWallets,
  WALLET_CATALOGUE,
  watchInjectedWallets,
  type InjectedWallet,
} from "../../packages/connect/src/index.ts";

const provider = { request: async () => null };
const announce = (target: EventTarget, info: Record<string, unknown>) =>
  target.dispatchEvent(Object.assign(new Event("eip6963:announceProvider"), { detail: { info, provider } }));
const UUID = (n: number) => `6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4${n}`;
const ICON = "data:image/svg+xml;base64,PHN2Zy8+";

test("EIP-6963: subscribe first, accept late wallets, ignore repeats and constrain untrusted metadata", () => {
  const target = new EventTarget();
  let requested = 0;
  target.addEventListener("eip6963:requestProvider", () => {
    requested += 1;
    announce(target, { uuid: UUID(1), name: "First‮ Wallet\u0000", icon: ICON, rdns: "com.example.first" });
  });
  const seen: InjectedWallet[][] = [];
  const stop = watchInjectedWallets((wallets) => seen.push(wallets), target);
  assert.equal(requested, 1, "asked once, after subscribing, so the immediate answer is caught");
  announce(target, { uuid: UUID(1), name: "Impostor", icon: ICON, rdns: "com.example.first" });
  announce(target, { uuid: UUID(2), name: "Late", icon: "javascript:alert(1)", rdns: "Not A Reverse DNS" });
  announce(target, { uuid: "not-a-uuid", name: "Broken", icon: ICON, rdns: "com.example.broken" });
  announce(target, { uuid: UUID(3), name: "", icon: ICON, rdns: "com.example.empty" });
  stop();
  announce(target, { uuid: UUID(4), name: "After stop", icon: ICON, rdns: "com.example.after" });
  const last = seen.at(-1)!;
  assert.deepEqual(
    last.map((wallet) => [wallet.name, wallet.icon, wallet.rdns]),
    [
      ["First Wallet", ICON, "com.example.first"],
      ["Late", null, null],
    ],
  );
  assert.equal(seen.length, 2, "a repeated UUID doesn't replace the first announcement");
});

test("catalogue search: names and aliases, accents and case ignored, filtered by chain, stable, no double listing", () => {
  const installed = [
    { uuid: UUID(1), name: "Zeta Wallet", icon: null, rdns: "com.example.zeta", provider },
    { uuid: UUID(2), name: "MetaMask", icon: null, rdns: "io.metamask", provider },
  ];
  const all = searchWallets({ query: "", family: "all", installed });
  assert.deepEqual(
    all.installed.map((wallet) => wallet.name),
    ["MetaMask", "Zeta Wallet"],
  );
  assert.equal(
    all.other.some((wallet) => wallet.id === "metamask"),
    false,
    "an installed wallet isn't listed again from the catalogue",
  );
  assert.deepEqual(
    all.other.map((wallet) => wallet.name),
    [...all.other.map((wallet) => wallet.name)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
  );
  assert.deepEqual(
    searchWallets({ query: "  HIRO ", family: "all", installed }).other.map((wallet) => wallet.id),
    ["leather"],
    "aliases match",
  );
  assert.deepEqual(
    searchWallets({ query: "ünisat", family: "all", installed }).other.map((wallet) => wallet.id),
    ["unisat"],
    "accents are ignored",
  );
  const bitcoin = searchWallets({ query: "", family: "bitcoin", installed });
  assert.deepEqual(
    [bitcoin.installed.length, bitcoin.other.every((wallet) => wallet.families.includes("bitcoin"))],
    [0, true],
  );
  assert.deepEqual(searchWallets({ query: "nothing like this", family: "all", installed }), {
    installed: [],
    other: [],
  });
  assert.ok(
    WALLET_CATALOGUE.every((wallet) => new URL(wallet.homepage).protocol === "https:"),
    "reviewed https home pages only",
  );
  assert.ok(Object.isFrozen(WALLET_CATALOGUE) && Object.isFrozen(WALLET_CATALOGUE[0]));
});

test("sign-in hints are validated and become sanctum_method / sanctum_wallet", async () => {
  const metadata = {
    issuer: "https://id.example.com",
    authorization_endpoint: "https://id.example.com/authorize",
    token_endpoint: "https://id.example.com/token",
    jwks_uri: "https://id.example.com/jwks",
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["ES256"],
    authorization_response_iss_parameter_supported: true,
    response_types_supported: ["code"],
    subject_types_supported: ["pairwise"],
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(metadata), { headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const sanctum = await SanctumConnect.discover({
      issuer: "https://id.example.com",
      clientId: "client-1",
      redirectUri: "https://app.example.com/callback",
    });
    const { url } = await sanctum.startSignIn({ hint: { method: "wallet", wallet: "io.metamask" } });
    assert.deepEqual(
      [url.searchParams.get("sanctum_method"), url.searchParams.get("sanctum_wallet")],
      ["wallet", "io.metamask"],
    );
    const plain = (await sanctum.startSignIn()).url;
    assert.equal(plain.searchParams.has("sanctum_method"), false);
    await assert.rejects(sanctum.startSignIn({ hint: { method: "teleport" as "wallet" } }), { code: "configuration" });
    await assert.rejects(sanctum.startSignIn({ hint: { method: "passkey", wallet: "io.metamask" } }), {
      code: "configuration",
    });
    await assert.rejects(sanctum.startSignIn({ hint: { method: "wallet", wallet: "javascript:alert(1)" } }), {
      code: "configuration",
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
