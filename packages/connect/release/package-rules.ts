/**
 * What a packed SDK tarball must and must not contain. Each rule returns readable problems; an empty
 * list means the tarball passed. Used by scripts/check-sdk-packages.ts.
 *
 *  - Files: package.json, README.md, LICENSE, CHANGELOG.md and THIRD_PARTY_NOTICES.md present; no
 *    TypeScript source, tests, tsconfig/build info, environment files, keys, lockfiles or node_modules.
 *  - Content: no private key block, registry/cloud/payment token or local absolute path anywhere.
 *  - Manifest: a 0.x pre-release ESM package with only the deliberate exports (types + import
 *    conditions to files in the tarball), files/sideEffects/license set, no scripts or
 *    devDependencies, dependencies pinned (no workspace:/file:/link:), internal ones to the sibling
 *    tarball's version, every third-party dependency named in the notices; "UNLICENSED" only
 *    together with "private": true (the publication lock).
 *  - Modules: every relative import resolves inside the tarball; bare imports are declared
 *    dependencies or peers; "use client" kept where the source has it.
 *  - Source maps: one per module, sources resolving inside the package, every source embedded.
 */
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import ts from "typescript";

export interface PackageExpectation {
  /** The export keys this package deliberately offers, and nothing else. */
  exports: string[];
  /** The package's source folder in the repository, to compare "use client" directives. */
  sourceDir: string;
  /** Versions of the sibling SDK tarballs, by name. */
  siblings: Map<string, string>;
}

const REQUIRED = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md"];
const FORBIDDEN_PATH: [RegExp, string][] = [
  [/(^|\/)\.env(\.|$)|\.local$|(^|\/)\.npmrc$/u, "an environment or npm configuration file"],
  [/\.(pem|key|p12|pfx|jks|keystore|crt)$|(^|\/)id_(rsa|ed25519|ecdsa)/u, "a key or certificate"],
  [/(^|\/)(tests?|__tests__|fixtures)\/|\.(test|spec)\.[cm]?[jt]sx?$/u, "a test file"],
  [/(?<!\.d)\.[cm]?tsx?$/u, "TypeScript source"],
  [/(^|\/)tsconfig[^/]*\.json$|\.tsbuildinfo$/u, "build configuration"],
  [
    /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$|(^|\/)node_modules\//u,
    "a lockfile or node_modules",
  ],
];
const SECRET: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, "a private key"],
  [/\bnpm_[A-Za-z0-9]{36}\b|_authToken\s*=/u, "an npm token"],
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}|\bwhsec_[A-Za-z0-9]{10,}/u, "a Stripe key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/u, "a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/u, "an AWS access key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u, "a JSON Web Token"],
  [/(?:\/Users\/|\/home\/|[A-Z]:\\\\Users\\\\)[A-Za-z0-9._-]+/u, "an absolute local path"],
];
const PRE_RELEASE = /^0\.\d+\.\d+-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/u;

type Manifest = Record<string, unknown> & {
  name: string;
  version: string;
  exports: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export function checkFiles(files: Map<string, Buffer>): string[] {
  const problems = REQUIRED.filter((name) => !files.has(name)).map((name) => `missing ${name}`);
  for (const path of files.keys()) {
    for (const [pattern, what] of FORBIDDEN_PATH) if (pattern.test(path)) problems.push(`${path} is ${what}`);
  }
  for (const [path, body] of files) {
    const content = body.toString("utf8");
    for (const [pattern, what] of SECRET) if (pattern.test(content)) problems.push(`${path} contains ${what}`);
  }
  return problems;
}

export function checkManifest(manifest: Manifest, files: Map<string, Buffer>, expected: PackageExpectation): string[] {
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`package.json: ${problem}`);
  if (Object.keys(manifest.dependencies ?? {}).some((name) => name.startsWith("@sanctum/")))
    say("published packages cannot depend on private @sanctum workspaces");
  if (!PRE_RELEASE.test(manifest.version)) say(`version ${manifest.version} is not a 0.x pre-release`);
  if (manifest.type !== "module") say('type must be "module"');
  for (const field of ["files", "sideEffects", "license", "description", "engines"])
    if (manifest[field] === undefined) say(`${field} is missing`);
  for (const field of ["scripts", "devDependencies", "bundleDependencies", "bundledDependencies"])
    if (manifest[field] !== undefined) say(`${field} must not be published`);
  if (manifest.license === "UNLICENSED" && manifest.private !== true)
    say('UNLICENSED needs "private": true until the owner chooses a license');
  const keys = Object.keys(manifest.exports ?? {}).sort();
  if (keys.join(",") !== [...expected.exports].sort().join(","))
    say(`exports ${keys.join(", ")} differ from ${expected.exports.join(", ")}`);
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    const conditions = typeof target === "string" ? { file: target } : target;
    if (typeof target !== "string" && Object.keys(target).join(",") !== "types,import")
      say(`export ${key} conditions must be types then import`);
    for (const [condition, file] of Object.entries(conditions)) {
      if (!files.has(posix.normalize(file)))
        say(`export ${key} (${condition}) points at ${file}, which is not in the tarball`);
      if (condition === "types" && !file.endsWith(".d.ts")) say(`export ${key} types is not a declaration file`);
      if (condition === "import" && !file.endsWith(".js")) say(`export ${key} import is not JavaScript`);
    }
  }
  const notices = files.get("THIRD_PARTY_NOTICES.md")?.toString("utf8") ?? "";
  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    if (/^(workspace|file|link|git|https?):/u.test(range)) say(`dependency ${name} uses ${range}`);
    const sibling = expected.siblings.get(name);
    if ((name.startsWith("@sanctum/") || name.startsWith("@sanctum.ai/")) && sibling !== range)
      say(`dependency ${name}@${range} is not the packed sibling (${sibling ?? "none"})`);
    if (sibling === undefined && !name.startsWith("@sanctum/") && !notices.includes(name))
      say(`dependency ${name} is not named in THIRD_PARTY_NOTICES.md`);
    if (sibling === undefined && !name.startsWith("@sanctum/") && !/^\d+\.\d+\.\d+$/u.test(range))
      say(`dependency ${name}@${range} is not pinned exactly`);
  }
  return problems;
}

export function checkModules(manifest: Manifest, files: Map<string, Buffer>, expected: PackageExpectation): string[] {
  const problems: string[] = [];
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  for (const [path, body] of files) {
    if (!path.endsWith(".js") && !path.endsWith(".d.ts")) continue;
    const content = body.toString("utf8");
    // Parse imports with the pinned compiler; indexed types and prose are not dependencies.
    for (const { fileName: specifier } of ts.preProcessFile(content, true, true).importedFiles) {
      if (specifier.startsWith(".")) {
        const target = posix.normalize(posix.join(posix.dirname(path), specifier));
        const candidates = path.endsWith(".d.ts") ? [target.replace(/\.js$/u, ".d.ts")] : [target];
        if (!candidates.some((candidate) => files.has(candidate)))
          problems.push(`${path} imports ${specifier}, which is not in the tarball`);
        continue;
      }
      const bare = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
      if (!declared.has(bare))
        problems.push(`${path} imports ${specifier}, which is not a declared dependency or peer`);
    }
    if (path.endsWith(".js")) {
      const source = `${expected.sourceDir}/${posix.basename(path, ".js")}.ts`;
      if (
        existsSync(source) &&
        readFileSync(source, "utf8").startsWith('"use client";') &&
        !content.startsWith('"use client";')
      )
        problems.push(`${path} lost "use client"`);
      if (!files.has(`${path}.map`)) problems.push(`${path} has no source map`);
    }
  }
  return problems;
}

export function checkSourceMaps(files: Map<string, Buffer>): string[] {
  const problems: string[] = [];
  for (const [path, body] of files) {
    if (!path.endsWith(".map")) continue;
    const map = JSON.parse(body.toString("utf8")) as {
      sourceRoot?: string;
      sources?: string[];
      sourcesContent?: (string | null)[];
    };
    const sources = map.sources ?? [];
    if (sources.length === 0) problems.push(`${path} lists no sources`);
    sources.forEach((source, index) => {
      const joined = posix.join(posix.dirname(path), map.sourceRoot ?? "", source);
      if (/^[a-z]+:|^\//iu.test(`${map.sourceRoot ?? ""}${source}`) || posix.normalize(joined).startsWith(".."))
        problems.push(`${path} points outside the package (${joined})`);
      if (typeof map.sourcesContent?.[index] !== "string") problems.push(`${path} doesn't embed ${source}`);
    });
  }
  return problems;
}
