/**
 * Builds @inverus/connect and then @inverus/connect-react from internal @sanctum workspaces with the
 * TypeScript compiler only (tsc emit: ESM JavaScript, .d.ts declarations and source maps that embed
 * their sources). No bundler: each source module becomes one ESM module, relative `.ts` imports are
 * rewritten to `.js`, and "use client" directives stay first in their modules.
 *
 * The workspace manifests keep exporting TypeScript source, because the monorepo (Node type
 * stripping in tests, Next.js `transpilePackages`, mutation runs) consumes the source. Each
 * package's `sanctumPublish` section is the published shape; this script writes it as the staged
 * package's manifest, with internal dependencies pinned to their published versions, and refuses
 * an export that differs from the workspace's or a target the build didn't produce.
 *
 *   node packages/connect/release/build-sdk.ts            → packages/connect/dist, packages/connect-react/dist
 *   node packages/connect/release/build-sdk.ts --out DIR  → DIR/connect, DIR/connect-react (checks use a temporary DIR)
 *
 * Pack a staged package with `npm pack packages/connect/dist` (never `npm publish`; see RELEASING.md).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicDependencies, rewriteModuleSpecifiers, type PublicNames } from "./public-names.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PACKAGES = ["packages/connect", "packages/connect-react"] as const;
const DOCUMENTS = ["README.md", "CHANGELOG.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];

type Exports = Record<string, string | { types: string; import: string }>;
interface Publish {
  name: string; version: string; description: string; license: string; private?: boolean; engines: Record<string, string>; sideEffects: boolean | string[];
  repository: { type: string; url: string; directory: string };
  homepage: string; bugs: { url: string }; author: { name: string }; keywords: string[];
  exports: Exports; files: string[]; publishConfig: Record<string, unknown>;
}
interface Manifest {
  name: string; type: string; exports: Record<string, string>; dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; sanctumPublish: Publish;
}

const read = (path: string) => readFileSync(path, "utf8");
const manifestOf = (dir: string) => JSON.parse(read(join(ROOT, dir, "package.json"))) as Manifest;

function fail(message: string): never {
  console.error(`build-sdk: ${message}`);
  process.exit(1);
}

function outputDirectory(dir: string, outRoot: string | null): string {
  return outRoot ? join(outRoot, basename(dir)) : join(ROOT, dir, "dist");
}

/** The published manifest: workspace identity and dependencies, the `sanctumPublish` shape. */
function publishedManifest(manifest: Manifest, names: PublicNames): Record<string, unknown> {
  const { sanctumPublish: publish } = manifest;
  const workspaceKeys = Object.keys(manifest.exports).sort().join(",");
  if (Object.keys(publish.exports).sort().join(",") !== workspaceKeys) fail(`${manifest.name}: published exports differ from the workspace's (${workspaceKeys})`);
  const dependencies = publicDependencies(manifest.dependencies ?? {}, names);
  return {
    name: publish.name, version: publish.version, description: publish.description, license: publish.license,
    ...(publish.private ? { private: true } : {}), type: manifest.type, engines: publish.engines, sideEffects: publish.sideEffects,
    exports: publish.exports, files: publish.files,
    ...(Object.keys(dependencies).length ? { dependencies } : {}), ...(manifest.peerDependencies ? { peerDependencies: manifest.peerDependencies } : {}),
    repository: publish.repository, publishConfig: publish.publishConfig,
    homepage: publish.homepage, bugs: publish.bugs, author: publish.author, keywords: publish.keywords,
  };
}

/** A per-build tsconfig (outside the package, so it is never packed) that compiles src into out/esm. */
function compile(dir: string, out: string, paths: Record<string, string[]>): void {
  const scratch = mkdtempSync(join(tmpdir(), "sanctum-sdk-build-"));
  try {
    const config = join(scratch, "tsconfig.json");
    writeFileSync(config, JSON.stringify({
      extends: join(ROOT, dir, "tsconfig.build.json"),
      compilerOptions: { rootDir: join(ROOT, dir, "src"), outDir: join(out, "esm"), paths: {
        // Core declarations live in a temporary directory outside node_modules during packing.
        // Resolve their external type dependency explicitly, with declaration checking enabled.
        oauth4webapi: [join(ROOT, "node_modules/oauth4webapi/build/index.d.ts")], ...paths,
      } },
      include: [join(ROOT, dir, "src", "**", "*.ts")], exclude: [],
    }));
    const tsc = spawnSync(process.execPath, [join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", config], { cwd: ROOT, stdio: "inherit" });
    if (tsc.status !== 0) fail(`tsc failed for ${dir}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Rewrite actual emitted imports, preserving directives and compiler source maps. */
function rewriteModules(out: string, names: PublicNames): void {
  for (const file of readdirSync(join(out, "esm")).filter((name) => name.endsWith(".js") || name.endsWith(".d.ts"))) {
    const path = join(out, "esm", file);
    writeFileSync(path, rewriteModuleSpecifiers(read(path), names));
  }
}

/** "use client" must stay the first statement of every module that has it in source. */
function checkDirectives(dir: string, out: string): void {
  for (const file of readdirSync(join(ROOT, dir, "src")).filter((name) => name.endsWith(".ts"))) {
    if (!read(join(ROOT, dir, "src", file)).startsWith("\"use client\";")) continue;
    const built = join(out, "esm", file.replace(/\.ts$/u, ".js"));
    if (!read(built).startsWith("\"use client\";")) fail(`${built} lost its "use client" directive`);
  }
}

/** Every export target exists and no export points at TypeScript source. */
function checkExports(name: string, out: string, exports: Exports): void {
  for (const [key, target] of Object.entries(exports)) {
    for (const file of typeof target === "string" ? [target] : [target.types, target.import]) {
      if (/\.ts$/u.test(file) && !file.endsWith(".d.ts")) fail(`${name} export ${key} points at TypeScript source (${file})`);
      if (!existsSync(join(out, file))) fail(`${name} export ${key}: ${file} was not built`);
    }
  }
}

export function buildSdk(outRoot: string | null): string[] {
  const manifests = PACKAGES.map((dir) => ({ dir, manifest: manifestOf(dir) }));
  const names = new Map(manifests.map(({ manifest }) => [manifest.name, { name: manifest.sanctumPublish.name, version: manifest.sanctumPublish.version }]));
  const publishedNames = [...names.values()].map(({ name }) => name);
  if (new Set(publishedNames).size !== publishedNames.length || publishedNames.some((name) => !/^@inverus\/[a-z0-9-]+$/u.test(name))) fail("invalid or duplicate public SDK names");
  const built: string[] = [];
  for (const { dir, manifest } of manifests) {
    const out = outputDirectory(dir, outRoot);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    // The React package compiles against the core package's built declarations, as a consumer would.
    const core = outputDirectory("packages/connect", outRoot);
    const paths = dir === "packages/connect-react"
      ? Object.fromEntries(["", "/wallets", "/qr"].map((sub) => [`@inverus/connect${sub}`, [join(core, "esm", `${sub.slice(1) || "index"}.d.ts`)]]))
      : {};
    compile(dir, out, paths);
    rewriteModules(out, names);
    checkDirectives(dir, out);
    for (const document of DOCUMENTS) {
      if (!existsSync(join(ROOT, dir, document))) fail(`${dir}/${document} is missing`);
      copyFileSync(join(ROOT, dir, document), join(out, document));
    }
    for (const [key, target] of Object.entries(manifest.exports)) {
      if (target.endsWith(".css")) copyFileSync(join(ROOT, dir, target), join(out, String(manifest.sanctumPublish.exports[key])));
    }
    const published = publishedManifest(manifest, names);
    checkExports(manifest.name, out, manifest.sanctumPublish.exports);
    writeFileSync(join(out, "package.json"), `${JSON.stringify(published, null, 2)}\n`);
    built.push(out);
  }
  return built;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf("--out");
  const outRoot = flag >= 0 ? resolve(process.argv[flag + 1] ?? fail("--out needs a directory")) : null;
  for (const out of buildSdk(outRoot)) console.log(`built ${out}`);
}
