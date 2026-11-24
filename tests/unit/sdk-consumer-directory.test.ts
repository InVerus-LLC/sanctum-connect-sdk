import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createConsumerDirectory } from "../../packages/connect/release/consumer-directory.ts";

test("consumer setup never replaces existing data and only creates a new outside directory", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sanctum-consumer-safety-"));
  try {
    const repo = join(scratch, "repo");
    mkdirSync(repo);
    const occupied = join(scratch, "occupied");
    mkdirSync(occupied);
    const sentinel = join(occupied, "keep.txt");
    writeFileSync(sentinel, "keep me");
    symlinkSync(repo, join(scratch, "repo-link"));
    for (const target of [
      undefined,
      "",
      scratch,
      repo,
      occupied,
      join(repo, "..scratch"),
      join(repo, "child"),
      join(scratch, "repo-link", "child"),
    ]) {
      assert.throws(() => createConsumerDirectory(target, repo), String(target));
      assert.equal(readFileSync(sentinel, "utf8"), "keep me");
    }
    const fresh = join(scratch, "new-consumer");
    assert.equal(createConsumerDirectory(fresh, repo), realpathSync(fresh));
    assert.throws(() => createConsumerDirectory(fresh, repo), /exists/u);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the consumer CLI refuses a missing target and existing target without touching the caller directory", () => {
  const scratch = mkdtempSync(join(tmpdir(), "sanctum-consumer-cli-"));
  const script = fileURLToPath(new URL("../../packages/connect/release/consumer-smoke.ts", import.meta.url));
  try {
    const sentinel = join(scratch, "keep.txt");
    writeFileSync(sentinel, "keep me");
    for (const args of [[], [scratch]]) {
      const run = spawnSync(process.execPath, [script, ...args], { cwd: scratch, encoding: "utf8" });
      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, args.length ? /EEXIST/u : /Give a new consumer directory/u);
      assert.equal(readFileSync(sentinel, "utf8"), "keep me");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
