/**
 * Checks the distributable SDKs as a registry would receive them (W-16): builds @inverus/connect and
 * @inverus/connect-react into a fresh temporary directory (packages/connect/release/build-sdk.ts),
 * packs each with `npm pack` (never publish), reads the tarballs back and checks them with
 * packages/connect/release/package-rules.ts: required documents, no tests, sources, keys, tokens or
 * local paths, a deliberate manifest, resolvable modules and self-contained source maps.
 *
 * Then it installs the tarballs' contents as a consumer would see them and bundles every entry point
 * with esbuild (already a dev dependency; minified ESM for browsers, React external) to enforce a
 * gzip budget per entry point and the tree-shaking boundaries: "." doesn't pull in uqr, "./wallets"
 * neither oauth4webapi nor uqr, "./qr" not oauth4webapi.
 *
 *   node scripts/check-sdk-packages.ts                         (npm run sdk:check)
 *   node scripts/check-sdk-packages.ts --pack-destination DIR  (also keeps the tarballs in DIR)
 *
 * Budgets were set on 17 November 2026 from measured sizes plus about 15% headroom; the measured
 * numbers are printed on every run. Raise a budget only with a reason in the CHANGELOG.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { checkFiles, checkManifest, checkModules, checkSourceMaps } from "../packages/connect/release/package-rules.ts";
import { pack, readTarball, type PackResult } from "../packages/connect/release/tarball.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGES = [
  { dir: "packages/connect", stage: "connect", exports: [".", "./wallets", "./qr", "./receipts", "./workloads"] },
  { dir: "packages/connect-react", stage: "connect-react", exports: [".", "./styles.css"] },
] as const;

/** Gzip budgets (bytes) per entry point: the whole minified bundle an app ships for it, React excluded. */
const BUDGETS: Record<string, number> = {
  "@inverus/connect": 18_700, // measured 16,255 (includes oauth4webapi)
  "@inverus/connect/wallets": 1_400, // measured 1,198
  "@inverus/connect/qr": 4_800, // measured 4,169 (includes uqr)
  "@inverus/connect/workloads": 8_000, // Initial workload entry: measured 7,338 B (~9% headroom).
  "@inverus/connect/receipts": 7_200, // Initial receipt entry: measured 6,194 B + ~16% headroom.
  "@inverus/connect-react": 31_800, // measured 27,657 (includes @inverus/connect, oauth4webapi, uqr)
  "@inverus/connect-react/styles.css": 2_300, // measured 1,968
};
/** Packages an entry point must never pull in. */
const MUST_NOT_INCLUDE: Record<string, string[]> = {
  "@inverus/connect": ["uqr", "jose"],
  "@inverus/connect/receipts": ["oauth4webapi", "uqr", "pg"],
  "@inverus/connect/workloads": ["jose", "uqr", "pg"],
  "@inverus/connect/wallets": ["oauth4webapi", "uqr"],
  "@inverus/connect/qr": ["oauth4webapi"],
};

const flag = process.argv.indexOf("--pack-destination");
const work = mkdtempSync(join(tmpdir(), "sanctum-sdk-check-"));
const destination = flag >= 0 ? resolve(process.argv[flag + 1] ?? "") : join(work, "tarballs");
mkdirSync(destination, { recursive: true });
const problems: string[] = [];

try {
  const built = spawnSync(process.execPath, [join(ROOT, "packages/connect/release/build-sdk.ts"), "--out", join(work, "stage")], { cwd: ROOT, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`the SDK build failed:\n${built.stdout}${built.stderr}`);

  const packed = PACKAGES.map((entry) => {
    const result = pack(join(work, "stage", entry.stage), destination);
    const files = readTarball(result.tarball);
    return { entry, result, files, manifest: JSON.parse(files.get("package.json")!.toString("utf8")) as Parameters<typeof checkManifest>[0] };
  });
  const siblings = new Map(packed.map(({ manifest }) => [manifest.name, manifest.version]));

  for (const { entry, result, files, manifest } of packed) {
    const expected = { exports: [...entry.exports], sourceDir: join(ROOT, entry.dir, "src"), siblings };
    const found = [
      ...checkFiles(files), ...checkManifest(manifest, files, expected), ...checkModules(manifest, files, expected), ...checkSourceMaps(files),
      ...(result.listed.join("\n") === [...files.keys()].sort().join("\n") ? [] : ["npm's file list differs from the tarball's contents"]),
    ];
    problems.push(...found.map((problem) => `${manifest.name}: ${problem}`));
    // Installed as a consumer sees it: node_modules/<name>/…
    for (const [path, body] of files) {
      const target = join(work, "consumer", "node_modules", manifest.name, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
  }

  const sizes: { entry: string; bytes: number; gzip: number; budget: number }[] = [];
  for (const { entry, manifest } of packed) {
    for (const key of entry.exports) {
      const specifier = key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`;
      let code: Buffer;
      if (key.endsWith(".css")) {
        code = readFileSync(join(work, "consumer", "node_modules", manifest.name, String(manifest.exports[key])));
      } else {
        const bundled = await build({
          stdin: { contents: `export * from ${JSON.stringify(specifier)};`, resolveDir: join(work, "consumer"), loader: "js" },
          bundle: true, minify: true, format: "esm", platform: "browser", target: "es2022", write: false, metafile: true, logLevel: "silent",
          external: ["react", "react-dom", "react/jsx-runtime"], nodePaths: [join(ROOT, "node_modules")],
        });
        code = Buffer.from(bundled.outputFiles[0]!.contents);
        const inputs = Object.keys(bundled.metafile.inputs);
        for (const forbidden of MUST_NOT_INCLUDE[specifier] ?? []) {
          if (inputs.some((input) => input.includes(`node_modules/${forbidden}/`))) problems.push(`${specifier} pulls in ${forbidden}`);
        }
        if (inputs.some((input) => input.includes("/src/") && input.endsWith(".ts"))) problems.push(`${specifier} bundled TypeScript source`);
      }
      const gzip = gzipSync(code, { level: 9 }).length;
      const budget = BUDGETS[specifier] ?? 0;
      sizes.push({ entry: specifier, bytes: code.length, gzip, budget });
      if (gzip > budget) problems.push(`${specifier} is ${gzip} bytes gzipped, over its ${budget}-byte budget`);
    }
  }

  console.log("SDK tarballs (npm pack):");
  for (const { result, files } of packed) console.log(`  ${describe(result)}; ${files.size} files`);
  console.log("Entry points (minified ESM bundle, React external; gzip level 9):");
  for (const size of sizes) console.log(`  ${size.entry.padEnd(36)} ${String(size.bytes).padStart(7)} B  ${String(size.gzip).padStart(6)} B gzip  (budget ${size.budget})`);
  for (const { manifest } of packed) {
    if (manifest.license === "UNLICENSED") console.log(`  publication lock: ${manifest.name} is UNLICENSED and private until the owner chooses a license`);
  }
  if (flag >= 0) console.log(`Tarballs kept in ${destination}`);
} catch (error) {
  problems.push(error instanceof Error ? error.message : String(error));
} finally {
  rmSync(work, { recursive: true, force: true });
}

function describe(result: PackResult): string {
  return `${result.name}@${result.version}: ${result.size} B packed, ${result.unpackedSize} B unpacked, ${result.integrity.slice(0, 22)}…`;
}

if (problems.length) {
  console.error(`SDK package check failed (${problems.length}):\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("SDK package check passed.");
}
