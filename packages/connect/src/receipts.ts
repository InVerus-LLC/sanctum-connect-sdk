/** Browser-safe verification. Keys, issuer and owner must come from trusted caller configuration. */
import { verifyReceipts, type ReceiptExport, type ReceiptVerification, type VerifyOptions } from "./receipt-chain.ts";
import type { JSONWebKeySet } from "jose";

export {
  canonicalReceipt, GENESIS_HASH, parseReceipt, RECEIPT_CHECKPOINT_CLAIM,
  RECEIPT_CHECKPOINT_TYP, RECEIPT_VERSION, receiptHash, verifyReceipts,
  type ReceiptCheckpoint, type ReceiptExport, type ReceiptProblem, type ReceiptRecord,
  type ReceiptValue, type ReceiptVerification, type VerifyOptions,
} from "./receipt-chain.ts";

export interface SignedReceiptOptions {
  keys: JSONWebKeySet;
  issuer: string;
  owner: string;
  from?: VerifyOptions["from"];
  anchor?: VerifyOptions["anchor"];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function hash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}
function head(value: unknown): value is { seq: number; hash: string } {
  return record(value) && sequence(value.seq) && hash(value.hash);
}
function receiptExport(value: unknown): value is ReceiptExport {
  return record(value) && value.version === 1 && typeof value.owner === "string" && value.owner.length > 0
    && head(value.head) && (value.next === null || sequence(value.next))
    && (value.checkpoint === null || typeof value.checkpoint === "string")
    && Array.isArray(value.receipts) && value.receipts.every((receipt: unknown) => record(receipt)
      && sequence(receipt.seq) && receipt.seq > 0 && hash(receipt.prevHash) && hash(receipt.hash) && typeof receipt.body === "string");
}

/**
 * Verifies an untrusted parsed JSON export and its ES256 checkpoint, not just chain integrity.
 * No key discovery or network requests occur here. Never take keys/issuer/owner from the export.
 * `from` and `anchor` must be previously verified heads. A valid historical checkpoint does not
 * prove freshness or current authorization; compare with a separately retained head for rollback.
 * Apply download/body-size limits before parsing large exports.
 */
export async function verifySignedReceipts(value: unknown, options: SignedReceiptOptions): Promise<ReceiptVerification> {
  if (!receiptExport(value)) return { valid: false, problem: "body_invalid", seq: null };
  if (!options.issuer || !options.owner || !options.keys || !Array.isArray(options.keys.keys) || options.keys.keys.length === 0
    || (options.from !== undefined && !head(options.from)) || (options.anchor !== undefined && !head(options.anchor))) {
    return { valid: false, problem: "checkpoint_invalid", seq: null };
  }
  if (value.owner !== options.owner) return { valid: false, problem: "owner_mismatch", seq: null };
  return verifyReceipts(value, {
    keys: options.keys, issuer: options.issuer,
    ...(options.from ? { from: options.from } : {}), ...(options.anchor ? { anchor: options.anchor } : {}),
  });
}
