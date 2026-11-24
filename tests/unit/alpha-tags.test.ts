import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(new URL("../../.github/workflows/alpha-tags.yml", import.meta.url), "utf8");
const embedded = workflow.split("node --input-type=module <<'JS'\n")[1]?.split("\n          JS")[0];
assert.ok(embedded, "the workflow must contain its reviewed tag verification script");
const script = embedded.replace("import { execFileSync } from 'node:child_process';", "");
const version = "0.1.0-alpha.0";
const names = ["@sanctum.ai/connect", "@sanctum.ai/connect-react"];
type Tags = { next?: string; latest?: string };

function exercise(tags: Tags[]) {
  const reads: string[] = [];
  const messages: string[] = [];
  const execute = () =>
    runInNewContext(script, {
      execFileSync(command: string, args: string[]) {
        assert.equal(command, "npm");
        const name = args[1];
        assert.ok(name);
        assert.ok(names.includes(name));
        assert.deepEqual([...args], ["view", name, "dist-tags", "--json", "--prefer-online"], "no registry mutations");
        reads.push(name);
        return JSON.stringify(tags[names.indexOf(name)]);
      },
      console: { log: (message: string) => messages.push(message) },
    });
  return { execute, reads, messages };
}

test("alpha tag verification accepts npm's initial latest alias and reports prerelease status", () => {
  const run = exercise(names.map(() => ({ next: version, latest: version })));
  run.execute();
  assert.deepEqual(run.reads, names);
  assert.equal(run.messages.length, 2);
  assert.ok(run.messages.every((message) => message.includes("alpha, not a stable release")));
});

test("alpha tag verification also accepts a missing latest alias", () => {
  const run = exercise(names.map(() => ({ next: version })));
  run.execute();
  assert.deepEqual(run.reads, names);
});

test("alpha tag verification refuses unexpected published versions", () => {
  for (const invalid of [
    { next: "0.2.0-alpha.0", latest: version },
    { next: version, latest: "1.0.0" },
  ]) {
    const run = exercise([{ next: version, latest: version }, invalid]);
    assert.throws(run.execute, /approved alpha|another release/u);
  }
});

test("tag verification needs no publish credential and is manually triggered only", () => {
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|secrets\.|dist-tag.*rm/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^ {2}(?:push|pull_request|schedule):/mu);
});
