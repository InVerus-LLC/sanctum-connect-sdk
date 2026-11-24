/** Manual release only. Never substitute local publication without provenance. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repository = "InVerus-LLC/sanctum-connect-sdk";
const version = "0.1.0-alpha.0";
const dryRun = process.argv.length === 3 && process.argv[2] === "--dry-run";
if (process.argv.length > 2 && !dryRun) throw new Error("Only --dry-run is supported");
if (
  !dryRun &&
  (process.env["GITHUB_ACTIONS"] !== "true" ||
    process.env["GITHUB_EVENT_NAME"] !== "workflow_dispatch" ||
    process.env["GITHUB_REPOSITORY"] !== repository ||
    process.env["GITHUB_REF"] !== "refs/heads/dev" ||
    !process.env["ACTIONS_ID_TOKEN_REQUEST_URL"] ||
    !process.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"])
) {
  throw new Error("Publication requires the reviewed manual GitHub provenance workflow");
}
for (const name of ["connect", "connect-react"]) {
  const manifest: unknown = JSON.parse(readFileSync(`packages/${name}/dist/package.json`, "utf8"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !("name" in manifest) ||
    manifest.name !== `@sanctum.ai/${name}` ||
    !("version" in manifest) ||
    manifest.version !== version ||
    ("private" in manifest && manifest.private === true)
  ) {
    throw new Error(`Unexpected release manifest for ${name}`);
  }
  // npm treats an unprefixed directory/name as GitHub shorthand, even with .tgz.
  const result = spawnSync(
    "npm",
    [
      "publish",
      `./release-artifacts/sanctum.ai-${name}-${version}.tgz`,
      "--provenance",
      "--access",
      "public",
      "--tag",
      "next",
      "--ignore-scripts",
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`Publication failed for ${name}; inspect registry before retrying`);
}
