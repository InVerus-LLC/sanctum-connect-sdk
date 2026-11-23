/**
 * Installs the packed SDK tarballs into a throwaway consumer project OUTSIDE the repository and
 * proves a consumer can use them (W-16, W-18, W-20):
 *  1. scripts/check-sdk-packages.ts builds, packs and checks the tarballs into <dir>/tarballs;
 *  2. `npm install --offline` from those tarballs (no registry, no network);
 *  3. tsc (skipLibCheck off) for a browser/React consumer and a Node-only consumer, including the
 *     examples copied from examples/, against the installed declarations;
 *  4. consumer/smoke.mjs under every Node version given (ESM import, exports map, typed errors,
 *     abort, a React server render that touches no browser API);
 *  5. esbuild browser bundles of the browser examples from the installed packages;
 *  6. with --next: `next build` of examples/next-app (App Router: the SDK imported from server
 *     components, every page prerendered on the server) and checks of the prerendered HTML.
 *
 *   node packages/connect/release/consumer-smoke.ts <new dir outside the repo> [--deps-from-workspace] [--next] [--node <path>]…
 *
 * `--offline` needs every third-party package in npm's cache. With --deps-from-workspace, the exact
 * versions already installed in this repository's node_modules are packed into <dir>/deps instead
 * (still offline; same versions as package-lock.json, not the registry's tarball bytes).
 */
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { rewriteConsumerSources } from "./consumer-sources.ts";
import { rewriteModuleSpecifiers } from "./public-names.ts";
import { createConsumerDirectory } from "./consumer-directory.ts";
import { nativeCompilerPackage } from "./native-compiler.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const names = new Map(["connect", "connect-react"].map((pkg) => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "packages", pkg, "package.json"), "utf8")) as { name: string; sanctumPublish: { name: string; version: string } };
  return [manifest.name, manifest.sanctumPublish];
}));
const FIXTURES = fileURLToPath(new URL("consumer/", import.meta.url));
const args = process.argv.slice(2);
const directoryArgument = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--node");
const fromWorkspace = args.includes("--deps-from-workspace");
const withNext = args.includes("--next");
const nodes = args.flatMap((arg, index) => (args[index - 1] === "--node" ? [arg] : []));
const dir = createConsumerDirectory(directoryArgument, ROOT);

/** Third-party packages the consumer installs (the SDK's dependencies, React, types, and jose for the agent example). */
const THIRD_PARTY = ["oauth4webapi", "uqr", "react", "react-dom", "scheduler", "@types/react", "@types/react-dom", "csstype", "@types/node", "undici-types", "jose"];
/** Next.js and what it needs to build offline (its native compiler for this machine, TypeScript for its type check). */
const NEXT = ["next", "@next/env", "@swc/helpers", "tslib", "baseline-browser-mapping", "caniuse-lite", "postcss", "nanoid", "picocolors", "source-map-js", "styled-jsx", "client-only", ...(withNext ? [nativeCompilerPackage(ROOT)] : []), "typescript"];
/** Where the workspace installed a package Next depends on (Next's own nested copy first). */
const installedDir = (name: string): string => {
  const path = [join(ROOT, "node_modules", "next", "node_modules", name), join(ROOT, "node_modules", name)].find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`Missing installed consumer dependency: ${name}`);
  return path;
};

function run(command: string, commandArgs: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, commandArgs, { cwd: dir, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, ...options });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} failed (${result.status}):\n${output}`);
  return output;
}
const versionOf = (name: string) => (JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;

mkdirSync(join(dir, "tarballs"), { recursive: true });
console.log(run(process.execPath, [join(ROOT, "scripts/check-sdk-packages.ts"), "--pack-destination", join(dir, "tarballs")], { cwd: ROOT }).trim());

const tarballs = readdirSync(join(dir, "tarballs")).filter((name) => name.endsWith(".tgz"));
const sdk = (prefix: string) => `file:tarballs/${tarballs.find((name) => name.startsWith(prefix) && /^\d/u.test(name.slice(prefix.length)))}`;
const dependencies: Record<string, string> = Object.fromEntries([...names.values()].map(({ name }) => [name, sdk(`${name.slice(1).replace("/", "-")}-`)]));
if (fromWorkspace) {
  mkdirSync(join(dir, "deps"));
  for (const name of [...THIRD_PARTY, ...(withNext ? NEXT : [])]) {
    const packed = JSON.parse(run("npm", ["pack", installedDir(name), "--pack-destination", join(dir, "deps"), "--json", "--ignore-scripts"])) as { filename: string }[];
    dependencies[name] = `file:deps/${packed[0]!.filename}`;
  }
} else {
  for (const name of [...THIRD_PARTY, ...(withNext ? NEXT : [])]) dependencies[name] = versionOf(name);
}
writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "sanctum-sdk-consumer", private: true, type: "module", dependencies }, null, 2)}\n`);
writeFileSync(join(dir, "css.d.ts"), "declare module \"*.css\";\n");
for (const file of ["tsconfig.json", "tsconfig.node.json", "check.tsx", "node-check.ts", "smoke.mjs"]) {
  const source = readFileSync(join(FIXTURES, file), "utf8");
  writeFileSync(join(dir, file), file.endsWith(".json") ? source : rewriteModuleSpecifiers(source, names));
}
const examples: [string, string][] = [["browser-ts/src", "browser-ts"], ["react-app/src", "react-app"], ["node-server/src", "node-server"], ["agent-claim/src", "agent-claim"]];
for (const [from, to] of examples) {
  cpSync(join(ROOT, "examples", from), join(dir, "examples", to), { recursive: true });
  rewriteConsumerSources(join(dir, "examples", to), names);
}

console.log(`npm install --offline (${fromWorkspace ? "SDK tarballs plus dependencies packed from the workspace" : "SDK tarballs plus npm's cache"})`);
console.log(run("npm", ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts", ...(withNext ? ["--omit=optional"] : [])]).trim());
const installed = JSON.parse(readFileSync(join(dir, "node_modules", "@inverus", "connect", "package.json"), "utf8")) as { version: string };
if (existsSync(join(dir, "node_modules", "@inverus", "connect", "src"))) throw new Error("TypeScript source was installed");
if (existsSync(join(dir, "node_modules", "@sanctum"))) throw new Error("Private workspace packages leaked into the consumer");
console.log(`installed @inverus/connect ${installed.version} from the tarball`);

const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
run(process.execPath, [tsc, "-p", "tsconfig.json"]);
console.log("tsc (browser + React, skipLibCheck off, examples included): no errors");
run(process.execPath, [tsc, "-p", "tsconfig.node.json"]);
console.log("tsc (Node only, NodeNext, no DOM, skipLibCheck off, examples included): no errors");

for (const node of [process.execPath, ...nodes]) console.log(run(node, ["smoke.mjs"]).trim());

for (const entry of ["examples/browser-ts/main.tsx", "examples/react-app/app.tsx"]) {
  const bundled = await build({
    entryPoints: [join(dir, entry)], absWorkingDir: dir, bundle: true, minify: true, format: "esm", platform: "browser", target: "es2022",
    jsx: "automatic", write: false, metafile: true, outdir: "out", logLevel: "silent", define: { "process.env.NODE_ENV": "\"production\"" },
  });
  const inputs = Object.keys(bundled.metafile.inputs);
  if (inputs.some((input) => !input.startsWith("node_modules/") && !input.startsWith("examples/"))) throw new Error(`${entry} bundled files from outside the consumer`);
  if (inputs.some((input) => input.includes("@inverus/") && !input.includes("/esm/") && !input.endsWith(".css"))) throw new Error(`${entry} bundled SDK files other than the built ESM`);
  const js = bundled.outputFiles.find((file) => file.path.endsWith(".js"))!;
  console.log(`esbuild ${entry} for browsers: ${js.contents.length} bytes, ${inputs.filter((input) => input.includes("@inverus/")).length} SDK modules from the tarballs`);
}
if (withNext) {
  const app = join(dir, "examples", "next-app");
  cpSync(join(ROOT, "examples", "next-app"), app, { recursive: true, filter: (path) => !/[/\\](\.next|node_modules)$/u.test(path) });
  rewriteConsumerSources(app, names);
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SANCTUM_ISSUER: "https://id.example.com", NEXT_PUBLIC_SANCTUM_CLIENT_ID: "client-1", NEXT_PUBLIC_SANCTUM_REDIRECT_URI: "https://app.example.com/callback" };
  const output = run(process.execPath, [join(dir, "node_modules", "next", "dist", "bin", "next"), "build", app], { env });
  if (/(window|document|navigator|localStorage|sessionStorage) is not defined/u.test(output)) throw new Error(`next build touched a browser API:\n${output}`);
  const home = readFileSync(join(app, ".next", "server", "app", "index.html"), "utf8");
  const callback = readFileSync(join(app, ".next", "server", "app", "callback.html"), "utf8");
  if (!home.includes("Continue with Sanctum") || !home.includes("M73.9216 7.17157V38.2486") || !/<dialog class="sanctum-drawer"/u.test(home)) throw new Error("the home page wasn't prerendered with the SDK's controls");
  if (!callback.includes("Finishing sign-in")) throw new Error("the callback page wasn't prerendered");
  console.log(`next build (App Router, SDK from server components): ${/Next\.js [\d.]+/u.exec(output)?.[0] ?? "Next.js"}; / and /callback prerendered on the server`);
}
console.log(`consumer smoke passed in ${dir}`);
