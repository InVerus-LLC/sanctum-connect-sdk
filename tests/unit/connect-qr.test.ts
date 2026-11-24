/**
 * QR codes for Sanctum links, checked by an independent decoder (jsQR): the core matrix decodes to
 * the exact link; the terminal rendering has the expected shape; values are bounded.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { qrModules, qrTerminal } from "../../packages/connect/src/qr.ts";
import { decodeModules } from "../support/qr-decode.ts";

const PAIRING = `https://id.example.com/wallet-link#${"Ab3_-".repeat(8)}xyz`;
const CLAIM = "https://id.example.com/agents/claim#code=WDJB-MJHT";

test("the module matrix decodes to exactly the link (independent decoder)", () => {
  for (const value of [PAIRING, CLAIM, "http://localhost:4100/wallet-link#" + "z".repeat(43)]) {
    const modules = qrModules(value);
    assert.equal(modules.length, modules[0]!.length, "square");
    assert.equal((modules.length - 17) % 4, 0, "a valid QR version size");
    assert.equal(decodeModules(modules), value);
  }
});

test("the terminal rendering is half blocks with a quiet zone; values are 1 to 512 characters", () => {
  const lines = qrTerminal(CLAIM).split("\n").filter(Boolean);
  const side = qrModules(CLAIM).length + 4;
  assert.equal(lines.length, Math.ceil(side / 2));
  assert.ok(
    lines.every((line) => /^[ ▀▄█]+$/u.test(line) && [...line].length === side),
    "only half blocks, one column per module",
  );
  assert.notEqual(qrTerminal(CLAIM, { invert: true }), qrTerminal(CLAIM));
  assert.throws(() => qrModules(""), RangeError);
  assert.throws(() => qrModules("x".repeat(513)), RangeError);
});
