/**
 * The tarball rules behind `npm run sdk:check` catch what they claim to (W-16): a clean package
 * passes; TypeScript source, tests, environment files, keys, tokens, local paths, a missing
 * LICENSE, an export to source or an extra entry point, an unpinned or workspace dependency, an
 * unnamed third-party dependency, an unlicensed package without the publication lock, a dangling
 * relative import, an undeclared bare import and a source map leaving the package are each refused.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFiles, checkManifest, checkModules, checkSourceMaps } from "../../packages/connect/release/package-rules.ts";

const MANIFEST = {
  name: "@sanctum/connect", version: "0.1.0-alpha.0", description: "SDK", license: "UNLICENSED", private: true, type: "module", engines: { node: ">=22.15.1" },
  sideEffects: false, files: ["esm"], exports: { ".": { types: "./esm/index.d.ts", import: "./esm/index.js" } }, dependencies: { oauth4webapi: "3.8.8" },
};
const MAP = JSON.stringify({ version: 3, sourceRoot: "../src/", sources: ["index.ts"], sourcesContent: ["export {};"], mappings: "" });

function clean(): Map<string, Buffer> {
  return new Map(Object.entries({
    "package.json": JSON.stringify(MANIFEST), "README.md": "# SDK", LICENSE: "All rights reserved.", "CHANGELOG.md": "# Changelog", "THIRD_PARTY_NOTICES.md": "oauth4webapi (MIT)",
    "esm/index.js": "import * as oauth from \"oauth4webapi\";\nexport { x } from \"./x.js\";\n//# sourceMappingURL=index.js.map", "esm/index.js.map": MAP,
    "esm/index.d.ts": "export { x } from \"./x.js\";", "esm/x.js": "export const x = 1;", "esm/x.js.map": MAP, "esm/x.d.ts": "export declare const x = 1;",
  }).map(([path, body]) => [path, Buffer.from(body)]));
}
const expected = { exports: ["."], sourceDir: "/nonexistent", siblings: new Map([["@sanctum/connect", "0.1.0-alpha.0"]]) };
const all = (files: Map<string, Buffer>, manifest: typeof MANIFEST | Record<string, unknown> = MANIFEST) => [
  ...checkFiles(files), ...checkManifest(manifest as typeof MANIFEST, files, expected), ...checkModules(manifest as typeof MANIFEST, files, expected), ...checkSourceMaps(files),
];
const withFile = (path: string, body: string) => new Map([...clean(), [path, Buffer.from(body)]]);

test("a clean package passes every rule", () => {
  assert.deepEqual(all(clean()), []);
});

test("files that must never ship are refused", () => {
  const cases: [string, string, RegExp][] = [
    ["src/index.ts", "export {};", /TypeScript source/u],
    ["esm/index.test.js", "", /a test file/u],
    [".env", "SECRET=1", /environment/u],
    ["keys/signing.pem", "", /a key or certificate/u],
    ["tsconfig.json", "{}", /build configuration/u],
    ["esm/leak.js", "const k = `-----BEGIN " + "PRIVATE KEY-----`;", /a private key/u],
    ["esm/token.js", "const t = \"npm_abcdefghijklmnopqrstuvwxyz0123456789\";", /an npm token/u],
    ["esm/stripe.js", "const s = \"sk_test_abcdefghijklmnop\";", /a Stripe key/u],
    ["esm/path.js", "const p = \"/Users/someone/project\";", /an absolute local path/u],
  ];
  for (const [path, body, problem] of cases) assert.ok(all(withFile(path, body)).some((found) => problem.test(found)), `${path} should be refused (${problem})`);
  const noLicense = clean();
  noLicense.delete("LICENSE");
  assert.ok(all(noLicense).includes("missing LICENSE"));
});

test("the manifest must be the deliberate published shape", () => {
  const variants: [Record<string, unknown>, RegExp][] = [
    [{ version: "1.0.0" }, /not a 0\.x pre-release/u],
    [{ exports: { ".": { types: "./esm/index.d.ts", import: "./src/index.ts" } } }, /import is not JavaScript/u],
    [{ exports: { ".": { types: "./esm/index.d.ts", import: "./esm/index.js" }, "./internal": "./esm/x.js" } }, /exports .* differ/u],
    [{ dependencies: { oauth4webapi: "^3.8.8" } }, /not pinned exactly/u],
    [{ dependencies: { oauth4webapi: "3.8.8", "@sanctum/web-client": "workspace:*" } }, /uses workspace:|not the packed sibling/u],
    [{ dependencies: { oauth4webapi: "3.8.8", jose: "6.2.17" } }, /jose is not named in THIRD_PARTY_NOTICES/u],
    [{ private: false }, /UNLICENSED needs "private": true/u],
    [{ scripts: { postinstall: "node x.js" } }, /scripts must not be published/u],
  ];
  for (const [change, problem] of variants) {
    const found = all(clean(), { ...MANIFEST, ...change });
    assert.ok(found.some((entry) => problem.test(entry)), `${JSON.stringify(change)} should be refused: ${found.join("; ")}`);
  }
});

test("modules must resolve inside the tarball and maps must stay in the package", () => {
  assert.ok(all(withFile("esm/index.js", "export { y } from \"./missing.js\";")).some((found) => /not in the tarball/u.test(found)));
  assert.ok(all(withFile("esm/index.js", "import \"left-pad\";")).some((found) => /not a declared dependency/u.test(found)));
  assert.deepEqual(all(withFile("esm/index.js", "/** import \"@sanctum/connect-react/styles.css\" in your app */\nexport {};")).filter((found) => /declared/u.test(found)), [], "imports in doc comments are prose");
  const outside = JSON.stringify({ version: 3, sources: ["../../../src/index.ts"], sourcesContent: ["export {};"], mappings: "" });
  assert.ok(all(withFile("esm/x.js.map", outside)).some((found) => /points outside the package/u.test(found)));
  const absolute = JSON.stringify({ version: 3, sourceRoot: "file:///Users/someone/", sources: ["index.ts"], sourcesContent: ["export {};"], mappings: "" });
  assert.ok(all(withFile("esm/x.js.map", absolute)).some((found) => /points outside the package/u.test(found)));
  const notEmbedded = JSON.stringify({ version: 3, sourceRoot: "../src/", sources: ["index.ts"], mappings: "" });
  assert.ok(all(withFile("esm/x.js.map", notEmbedded)).some((found) => /doesn't embed/u.test(found)));
});

test("module inspection distinguishes indexed types and strings from static, dynamic and type imports", () => {
  const declaration = 'export interface Options { from?: Other["from"]; anchor?: Other["anchor"] }';
  assert.deepEqual(checkModules(MANIFEST, withFile("esm/receipt.d.ts", declaration), expected), []);
  for (const code of ['export { x } from "undeclared";', 'const lazy = import("undeclared");', 'export type T = import("undeclared").Value;']) {
    assert.ok(checkModules(MANIFEST, withFile("esm/receipt.d.ts", code), expected).some((entry) => entry.includes("imports undeclared")));
  }
});
