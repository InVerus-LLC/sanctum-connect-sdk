/**
 * Project branding in the SDK (ADR-0033) without a browser: the kit document's branding is kept only
 * as plain text, an #rrggbb accent and a logo on the configured issuer's own logo path; the drawer's
 * header shows that logo with the display name as its alternative text (Sanctum's mark otherwise),
 * and the accent only as a decorative SVG bar (no inline style); and the core transport proposes to a
 * Wallet project by its project ID, never together with a client ID.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { sanctumTransport } from "../../packages/connect/src/index.ts";
import { DrawerAccent, DrawerBrand } from "../../packages/connect-react/src/drawer-brand.ts";
import { parseKit } from "../../packages/connect-react/src/index.ts";

const ISSUER = "https://id.example.com";
const LOGO = `${ISSUER}/assets/project-logos/2f0c6a8e-0000-4000-8000-000000000001/${"ab".repeat(32)}`;
const document = (branding: unknown) => ({
  app_name: "Acme Store",
  sign_in_methods: ["evm_wallet"],
  passkey: true,
  branding,
});

test("the kit's branding is plain text, an #rrggbb accent and a logo from the issuer's own logo path", () => {
  assert.deepEqual(
    parseKit(document({ display_name: "Acme Store", accent_color: "#1D4ED8", logo_url: LOGO }), ISSUER)?.branding,
    { displayName: "Acme Store", accentColor: "#1d4ed8", logoUrl: LOGO },
  );
  assert.equal(parseKit(document(null), ISSUER)?.branding, null, "no branding");
  assert.equal(
    parseKit({ app_name: "Old issuer", sign_in_methods: [] }, ISSUER)?.branding,
    null,
    "an issuer that sends none",
  );
  const hostile = parseKit(
    document({
      display_name: "Acme‮\u0000 Store",
      accent_color: "red;background:url(https://evil.example)",
      logo_url: "https://evil.example/assets/project-logos/x.png",
    }),
    ISSUER,
  )?.branding;
  assert.deepEqual(
    hostile,
    { displayName: "Acme Store", accentColor: null, logoUrl: null },
    "controls stripped; a foreign logo or a non-hex accent dropped",
  );
  assert.equal(
    parseKit(document({ logo_url: `${ISSUER}/assets/project-logos/../../oauth/authorize` }), ISSUER)?.branding,
    null,
    "only the logo path itself",
  );
  assert.equal(parseKit(document({ logo_url: LOGO }))?.branding, null, "without the issuer, no logo is trusted");
  assert.equal(parseKit(document({ display_name: "x".repeat(200) }), ISSUER)?.branding?.displayName?.length, 60);
});

test("the drawer header shows the app's logo with its name as alternative text, or Sanctum's mark", () => {
  const branded = parseKit(document({ display_name: "Acme Store", accent_color: "#1d4ed8", logo_url: LOGO }), ISSUER);
  const header = renderToString(h(DrawerBrand, { kit: branded }));
  assert.match(header, /<img [^>]*src="https:\/\/id\.example\.com\/assets\/project-logos\/[^"]+"/u);
  assert.match(header, /alt="Acme Store"/u);
  assert.doesNotMatch(header, /<svg/u, "the logo replaces the mark");
  const unnamed = parseKit({ ...document({ logo_url: LOGO }), app_name: "Client name" }, ISSUER);
  assert.match(
    renderToString(h(DrawerBrand, { kit: unnamed })),
    /alt="Client name"/u,
    "without a display name, the app's name",
  );
  for (const kit of [null, parseKit(document(null), ISSUER)]) {
    const plain = renderToString(h(DrawerBrand, { kit }));
    assert.match(plain, /<svg[^>]*aria-hidden="true"/u, "Sanctum's mark");
    assert.doesNotMatch(plain, /<img/u);
  }
});

test("the accent is a decorative SVG bar with a fill attribute, never a style", () => {
  const bar = renderToString(h(DrawerAccent, { kit: parseKit(document({ accent_color: "#1d4ed8" }), ISSUER) }));
  assert.match(bar, /<svg[^>]*aria-hidden="true"[^>]*>.*<rect[^>]*fill="#1d4ed8"/u);
  assert.doesNotMatch(bar, /style=/u);
  assert.equal(renderToString(h(DrawerAccent, { kit: parseKit(document({ display_name: "No accent" }), ISSUER) })), "");
});

test("the transport proposes to a Wallet project by its project ID, never with a client ID too", async () => {
  const sent: unknown[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        session_id: "s",
        status: "proposed",
        accounts: [],
        chain: null,
        expires_at: "2026-11-17T00:00:00Z",
        session_token: "t",
        pairing_uri: "p",
      }),
      { status: 201 },
    );
  }) as typeof fetch;
  await sanctumTransport({
    issuer: ISSUER,
    projectId: "2f0c6a8e-0000-4000-8000-000000000001",
    fetch: fakeFetch,
  }).propose({ chains: ["eip155:84532"], methods: ["personal_sign"] });
  await sanctumTransport({ issuer: ISSUER, clientId: "client-1", fetch: fakeFetch }).propose({
    chains: ["eip155:84532"],
    methods: ["personal_sign"],
  });
  assert.deepEqual(sent, [
    { project_id: "2f0c6a8e-0000-4000-8000-000000000001", chains: ["eip155:84532"], methods: ["personal_sign"] },
    { client_id: "client-1", chains: ["eip155:84532"], methods: ["personal_sign"] },
  ]);
  assert.throws(() => sanctumTransport({ issuer: ISSUER, clientId: "c", projectId: "p" } as never), TypeError);
  assert.throws(() => sanctumTransport({ issuer: ISSUER } as never), TypeError);
});
