/**
 * Packs a staged SDK package with `npm pack` (never `npm publish`) and reads the tarball back, so the
 * checks look at exactly the bytes a registry would receive. The reader handles the ustar files npm
 * writes (a "package/" prefix, PAX headers skipped); it refuses links, devices and paths that leave
 * the package.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

export interface PackResult {
  /** Absolute path of the .tgz. */
  tarball: string;
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  integrity: string;
  /** Paths inside the package, as npm listed them. */
  listed: string[];
}

/** `npm pack <stageDir> --pack-destination <dest>`, without running any lifecycle script. */
export function pack(stageDir: string, destination: string): PackResult {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const run = spawnSync(npm, ["pack", stageDir, "--pack-destination", destination, "--json", "--ignore-scripts"], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`npm pack ${stageDir} failed: ${run.stderr}`);
  const [result] = JSON.parse(run.stdout) as { filename: string; name: string; version: string; size: number; unpackedSize: number; integrity: string; files: { path: string }[] }[];
  if (!result) throw new Error(`npm pack ${stageDir} reported nothing`);
  return {
    tarball: join(destination, result.filename), name: result.name, version: result.version, size: result.size, unpackedSize: result.unpackedSize,
    integrity: result.integrity, listed: result.files.map((file) => file.path).sort(),
  };
}

const text = (block: Buffer, start: number, length: number) => block.subarray(start, start + length).toString("utf8").replace(/\0.*$/su, "");

/** The files in an npm tarball, keyed by their path inside the package. */
export function readTarball(path: string): Map<string, Buffer> {
  const archive = gunzipSync(readFileSync(path));
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(text(header, 124, 12).trim() || "0", 8);
    const type = text(header, 156, 1) || "0";
    const prefix = text(header, 345, 155);
    const name = prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100);
    const body = archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x" || type === "g" || type === "5") continue;
    if (type !== "0") throw new Error(`${path}: ${name} is not a regular file (type ${type})`);
    if (!name.startsWith("package/") || name.split("/").includes("..")) throw new Error(`${path}: ${name} is outside the package`);
    files.set(name.slice("package/".length), Buffer.from(body));
  }
  return files;
}
