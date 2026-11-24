/**
 * QR codes for Sanctum links (wallet pairing, agent claims): "@sanctum.ai/connect/qr". Encoding is
 * uqr 0.1.3 (MIT; a port of Project Nayuki's QR Code generator), not Sanctum code, at error
 * correction level M.
 *  - `qrModules`: the module matrix (true = dark) without a quiet zone, for renderers that draw it
 *    themselves (the React SDK draws one SVG path; no HTML is generated or injected).
 *  - `qrTerminal`: Unicode half blocks with a quiet zone, for agent runtimes printing a claim link.
 * A pairing link is a one-time capability: show its QR code only to the person it is meant for,
 * and never log it.
 */
import { encode, renderUnicodeCompact } from "uqr";

const MAX_LENGTH = 512;

function checked(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_LENGTH)
    throw new RangeError(`QR values are 1 to ${MAX_LENGTH} characters`);
  return value;
}

export function qrModules(value: string): boolean[][] {
  return encode(checked(value), { ecc: "M", border: 0 }).data;
}

/** For a terminal; `invert` suits light-on-dark themes where scanners expect dark-on-light. */
export function qrTerminal(value: string, options: { invert?: boolean } = {}): string {
  return renderUnicodeCompact(checked(value), { ecc: "M", border: 2, invert: options.invert === true });
}
