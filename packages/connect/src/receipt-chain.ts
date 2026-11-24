/**
 * Verifying exported action receipts (matrix G-22). Self-contained: it needs only `jose` and Web
 * Crypto (SHA-256), never the database, so an SDK or an auditor's script can reuse it.
 *
 * Receipt form v1 (migration 0078): each owner's receipts are one chain. Receipt n has seq n, the
 * hash of receipt n-1 (64 zeros for the first) and
 *   hash = SHA-256(UTF-8("sanctum.receipt.v1" + "\n" + prevHash + "\n" + body))   (hex, lower case)
 * where body is canonical: one flat JSON object, keys of [a-z_] sorted, no whitespace, values only
 * strings, integers of at most 15 digits, booleans and null; it always has v (1), seq and owner.
 *
 * The verifier detects a deleted receipt (a gap in seq or a broken prevHash link), receipts out of
 * order, and any edit (the hash no longer matches, or the next link breaks). A checkpoint is the
 * issuer's signature (ES256 JWT, kid in its header, JWT type `sanctum-receipt-checkpoint+jwt`, which
 * the verifier requires so no other JWT the issuer's key signs passes for one) over the owner, the
 * last seq and the head hash at export: it shows the export is the chain Sanctum held. A rewritten
 * chain (every hash recomputed, then signed anew) is detected against an earlier checkpoint the owner
 * kept (`anchor`).
 */
import { compactVerify } from "jose/jws/compact/verify";
import { createLocalJWKSet } from "jose/jwks/local";
import type { JSONWebKeySet } from "jose";

export const RECEIPT_VERSION = 1;
/** The checkpoint JWT's claim: { v, owner, seq, head }. */
export const RECEIPT_CHECKPOINT_CLAIM = "sanctum_receipt_checkpoint";
/** The checkpoint JWT's `typ` header (RFC 8725 §3.11 explicit typing). */
export const RECEIPT_CHECKPOINT_TYP = "sanctum-receipt-checkpoint+jwt";
export const GENESIS_HASH = "0".repeat(64);

export type ReceiptValue = string | number | boolean | null;
export interface ReceiptRecord {
  seq: number;
  prevHash: string;
  hash: string;
  body: string;
}
/** An owner's receipts after `next`-less export: the whole chain (or the part after an earlier head), its head and a checkpoint. */
export interface ReceiptExport {
  version: 1;
  owner: string;
  receipts: ReceiptRecord[];
  head: { seq: number; hash: string };
  next: number | null;
  checkpoint: string | null;
}
export interface ReceiptCheckpoint {
  v: 1;
  owner: string;
  seq: number;
  head: string;
}

export type ReceiptProblem =
  | "version_unsupported"
  | "incomplete"
  | "sequence_gap"
  | "previous_hash_mismatch"
  | "hash_mismatch"
  | "body_invalid"
  | "not_canonical"
  | "owner_mismatch"
  | "head_mismatch"
  | "anchor_missing"
  | "anchor_mismatch"
  | "checkpoint_missing"
  | "checkpoint_invalid"
  | "checkpoint_mismatch";
export type ReceiptVerification =
  | {
      valid: true;
      seq: number;
      head: string;
      receipts: Record<string, ReceiptValue>[];
      checkpoint: (ReceiptCheckpoint & { kid: string }) | null;
    }
  | { valid: false; problem: ReceiptProblem; seq: number | null };

export interface VerifyOptions {
  /** The issuer's published keys (its /jwks); with them a valid checkpoint is required. */
  keys?: JSONWebKeySet;
  /** The issuer identifier the checkpoint must name. */
  issuer?: string;
  /** Where this export continues from: the last receipt already verified (default: the start). */
  from?: { seq: number; hash: string };
  /** An earlier checkpoint (or verified head) the chain must still contain. */
  anchor?: { seq: number; hash: string };
}

const KEY = /^[a-z_]{1,32}$/u;
const HEX = /^[0-9a-f]{64}$/u;

/** The canonical text of a receipt's fields (form v1). Throws for a field the form doesn't allow. */
export function canonicalReceipt(fields: Record<string, ReceiptValue>): string {
  const keys = Object.keys(fields).sort();
  const parts = keys.map((key) => {
    const value = fields[key];
    const allowed =
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) < 1e15);
    if (!KEY.test(key) || !allowed) throw new TypeError(`receipt field ${key} is not allowed in form v1`);
    return `${JSON.stringify(key)}:${JSON.stringify(value)}`;
  });
  return `{${parts.join(",")}}`;
}

/** The chain hash of a receipt body after the receipt whose hash is `prevHash` (hex). */
export async function receiptHash(prevHash: string, body: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`sanctum.receipt.v1\n${prevHash}\n${body}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A body's fields, if it is canonical form v1 (else null). */
export function parseReceipt(body: string): Record<string, ReceiptValue> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const fields: Record<string, ReceiptValue> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== null && typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number")
      return null;
    Object.defineProperty(fields, key, { value, enumerable: true });
  }
  try {
    return canonicalReceipt(fields) === body ? fields : null;
  } catch {
    return null;
  }
}

export async function verifyReceipts(
  exported: ReceiptExport,
  options: VerifyOptions = {},
): Promise<ReceiptVerification> {
  const fail = (problem: ReceiptProblem, seq: number | null = null): ReceiptVerification => ({
    valid: false,
    problem,
    seq,
  });
  if (exported.version !== RECEIPT_VERSION) return fail("version_unsupported");
  if (exported.next !== null) return fail("incomplete");
  let last = options.from ?? { seq: 0, hash: GENESIS_HASH };
  const fields: Record<string, ReceiptValue>[] = [];
  const seen = new Map<number, string>([[last.seq, last.hash]]);
  for (const receipt of exported.receipts) {
    if (receipt.seq !== last.seq + 1) return fail("sequence_gap", receipt.seq);
    if (receipt.prevHash !== last.hash) return fail("previous_hash_mismatch", receipt.seq);
    if (!HEX.test(receipt.hash) || (await receiptHash(receipt.prevHash, receipt.body)) !== receipt.hash)
      return fail("hash_mismatch", receipt.seq);
    const parsed = parseReceipt(receipt.body);
    if (!parsed) return fail("not_canonical", receipt.seq);
    if (parsed.v !== RECEIPT_VERSION || parsed.seq !== receipt.seq || typeof parsed.kind !== "string")
      return fail("body_invalid", receipt.seq);
    if (parsed.owner !== exported.owner) return fail("owner_mismatch", receipt.seq);
    fields.push(parsed);
    last = { seq: receipt.seq, hash: receipt.hash };
    seen.set(last.seq, last.hash);
  }
  if (exported.head.seq !== last.seq || exported.head.hash !== last.hash) return fail("head_mismatch", last.seq);
  if (options.anchor) {
    const held = seen.get(options.anchor.seq);
    if (held === undefined) return fail("anchor_missing", options.anchor.seq);
    if (held !== options.anchor.hash) return fail("anchor_mismatch", options.anchor.seq);
  }
  if (!options.keys) return { valid: true, seq: last.seq, head: last.hash, receipts: fields, checkpoint: null };
  if (!exported.checkpoint) return fail("checkpoint_missing");
  let checkpoint: ReceiptCheckpoint & { kid: string };
  try {
    const verified = await compactVerify(exported.checkpoint, createLocalJWKSet(options.keys), {
      algorithms: ["ES256"],
    });
    if (verified.protectedHeader.typ !== RECEIPT_CHECKPOINT_TYP) return fail("checkpoint_invalid");
    const claims: unknown = JSON.parse(new TextDecoder().decode(verified.payload));
    if (!isRecord(claims)) return fail("checkpoint_invalid");
    const claim = claims[RECEIPT_CHECKPOINT_CLAIM];
    if (
      (options.issuer !== undefined && claims.iss !== options.issuer) ||
      !isRecord(claim) ||
      claim.v !== RECEIPT_VERSION ||
      typeof claim.owner !== "string" ||
      typeof claim.seq !== "number" ||
      !Number.isSafeInteger(claim.seq) ||
      claim.seq < 0 ||
      typeof claim.head !== "string" ||
      !HEX.test(claim.head) ||
      typeof verified.protectedHeader.kid !== "string" ||
      !verified.protectedHeader.kid
    )
      return fail("checkpoint_invalid");
    checkpoint = { v: 1, owner: claim.owner, seq: claim.seq, head: claim.head, kid: verified.protectedHeader.kid };
  } catch {
    return fail("checkpoint_invalid");
  }
  if (checkpoint.owner !== exported.owner || checkpoint.seq !== last.seq || checkpoint.head !== last.hash)
    return fail("checkpoint_mismatch", checkpoint.seq);
  return { valid: true, seq: last.seq, head: last.hash, receipts: fields, checkpoint };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
