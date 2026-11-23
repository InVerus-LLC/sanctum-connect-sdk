import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(new URL("../../.github/workflows/alpha-tags.yml", import.meta.url), "utf8");
const embedded = workflow.split("node --input-type=module <<'JS'\n")[1]?.split("\n          JS")[0];
assert.ok(embedded, "the workflow must contain its reviewed tag maintenance script");
const script = embedded.replace("import { execFileSync } from 'node:child_process';", "");
const version = "0.1.0-alpha.0";
const names = ["@inverus/connect", "@inverus/connect-react"];
type Tags = { next?: string; latest?: string };

function exercise(tags: Tags[], drift = false) {
  const removed: string[] = [];
  let reads = 0;
  const execute = () => runInNewContext(script, {
    execFileSync(command: string, args: string[]) {
      assert.equal(command, "npm");
      const name = args[0] === "view" ? args[1] : args[2];
      assert.ok(name);
      const index = names.indexOf(name);
      assert.notEqual(index, -1, "only the two approved SDK packages may change");
      if (args[0] === "view") {
        assert.deepEqual([...args].slice(2), ["dist-tags", "--json", "--prefer-online"]);
        reads += 1;
        return JSON.stringify(drift && reads > 2 ? { next: version, latest: "1.0.0" } : tags[index]);
      }
      assert.deepEqual([...args], ["dist-tag", "rm", name, "latest"]);
      removed.push(name);
      delete tags[index]!.latest;
      return "";
    },
  });
  return { execute, removed };
}

test("alpha tag repair removes only both unintended latest pointers", () => {
  const run = exercise(names.map(() => ({ next: version, latest: version })));
  run.execute();
  assert.deepEqual(run.removed, names);
});

test("alpha tag repair is idempotent when latest is absent", () => {
  const run = exercise(names.map(() => ({ next: version })));
  run.execute();
  assert.deepEqual(run.removed, []);
});

test("all packages pass preflight before any tag mutation", () => {
  for (const invalid of [{ next: "0.2.0-alpha.0", latest: version }, { next: version, latest: "1.0.0" }]) {
    const run = exercise([{ next: version, latest: version }, invalid]);
    assert.throws(run.execute, /approved alpha|another release/u);
    assert.deepEqual(run.removed, []);
  }
});

test("alpha tag repair refuses tags changed after its preflight", () => {
  const run = exercise(names.map(() => ({ next: version, latest: version })), true);
  assert.throws(run.execute, /changed after preflight/u);
  assert.deepEqual(run.removed, []);
});
