import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { nativeCompilerPackage } from "../../packages/connect/release/native-compiler.ts";

test("consumer uses the installed platform-specific compiler, including Linux ABI suffixes", () => {
  for (const [platform, arch, suffix] of [
    ["linux", "x64", "-gnu"],
    ["linux", "arm64", "-musl"],
    ["darwin", "arm64", ""],
    ["win32", "x64", "-msvc"],
  ]) {
    const root = mkdtempSync(join(tmpdir(), "sdk-compiler-"));
    try {
      const name = `@next/swc-${platform}-${arch}${suffix}`;
      mkdirSync(join(root, "node_modules", name), { recursive: true });
      assert.equal(nativeCompilerPackage(root, platform!, arch!), name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("missing or ambiguous native compilers fail before packaging", () => {
  const root = mkdtempSync(join(tmpdir(), "sdk-compiler-"));
  try {
    assert.throws(() => nativeCompilerPackage(root, "linux", "x64"), /exactly one/u);
    for (const suffix of ["gnu", "musl"])
      mkdirSync(join(root, "node_modules", `@next/swc-linux-x64-${suffix}`), { recursive: true });
    assert.throws(() => nativeCompilerPackage(root, "linux", "x64"), /exactly one/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
