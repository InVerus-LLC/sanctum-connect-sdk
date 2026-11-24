import assert from "node:assert/strict";
import { test } from "node:test";
import { publicDependencies, rewriteModuleSpecifiers } from "../../packages/connect/release/public-names.ts";
import { checkManifest, checkModules } from "../../packages/connect/release/package-rules.ts";

const names = new Map([
  ["@sanctum/connect", { name: "@publicx/connect", version: "0.1.0-alpha.0" }],
  ["@sanctum/connect-react", { name: "@publicx/connect-react", version: "0.1.0-alpha.0" }],
]);

test("release dependencies name the public sibling, never the internal workspace package", () => {
  assert.deepEqual(publicDependencies({ "@sanctum/connect": "0.0.0", jose: "6.2.17" }, names), {
    "@publicx/connect": "0.1.0-alpha.0",
    jose: "6.2.17",
  });
  assert.throws(() => publicDependencies({ "@sanctum/database": "0.0.0" }, names), /not a public SDK/u);
});

test("only actual module specifiers change, preserving directives and source-map columns", () => {
  const source =
    '"use client";\n// from "@sanctum/connect" is prose\nconst prose = "@sanctum/connect";\n' +
    'import { x } from "@sanctum/connect";\nexport { y } from "@sanctum/connect/wallets";\n' +
    'export type T = import("@sanctum/connect").Options;\nconst lazy = import("@sanctum/connect/receipts");\n' +
    'export { local } from "./local.ts";\n';
  const result = rewriteModuleSpecifiers(source, names);
  assert.equal(
    result,
    '"use client";\n// from "@sanctum/connect" is prose\nconst prose = "@sanctum/connect";\n' +
      'import { x } from "@publicx/connect";\nexport { y } from "@publicx/connect/wallets";\n' +
      'export type T = import("@publicx/connect").Options;\nconst lazy = import("@publicx/connect/receipts");\n' +
      'export { local } from "./local.js";\n',
  );
  assert.equal(result.length, source.length);
  assert.throws(() => rewriteModuleSpecifiers('import "@sanctum/database";', names), /not a public SDK/u);
  assert.throws(
    () =>
      rewriteModuleSpecifiers(
        'import "@sanctum/connect";',
        new Map([["@sanctum/connect", { name: "@different/core", version: "0.1.0-alpha.0" }]]),
      ),
    /source.map columns/u,
  );
});

test("React tarball import validation rejects an undeclared internal dependency and accepts public exports", () => {
  const manifest = {
    name: "@publicx/connect-react",
    version: "0.1.0-alpha.0",
    exports: {},
    dependencies: { "@publicx/connect": "0.1.0-alpha.0" },
  };
  const expected = {
    exports: [],
    sourceDir: "/nonexistent",
    siblings: new Map([["@publicx/connect", "0.1.0-alpha.0"]]),
  };
  const source = 'export type Wallet = import("@sanctum/connect/wallets").Wallet;';
  const files = new Map([["esm/wallet.d.ts", Buffer.from(source)]]);
  assert.ok(checkModules(manifest, files, expected).some((problem) => problem.includes("not a declared dependency")));
  files.set("esm/wallet.d.ts", Buffer.from(rewriteModuleSpecifiers(source, names)));
  assert.deepEqual(checkModules(manifest, files, expected), []);
});

test("a public tarball cannot declare a private workspace dependency even when its version matches", () => {
  const manifest = {
    name: "@publicx/connect-react",
    version: "0.1.0-alpha.0",
    type: "module",
    license: "MIT",
    description: "Synthetic SDK",
    engines: { node: ">=22.15.1" },
    files: ["esm"],
    sideEffects: false,
    exports: {},
    dependencies: { "@sanctum/connect": "0.1.0-alpha.0" },
  };
  const expected = {
    exports: [],
    sourceDir: "/nonexistent",
    siblings: new Map([["@sanctum/connect", "0.1.0-alpha.0"]]),
  };
  assert.ok(
    checkManifest(manifest, new Map(), expected).some((problem) =>
      problem.includes("cannot depend on private @sanctum"),
    ),
  );
});
