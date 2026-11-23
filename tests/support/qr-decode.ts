/**
 * Independent QR checks for tests: rasterize a module matrix (or an SVG path drawn by the React
 * SDK) to RGBA pixels and decode it with jsQR 1.4.0 (Apache-2.0, a separate implementation from
 * the encoder), so a test compares the text a scanner would read.
 */
import jsqrModule from "jsqr";

type Decode = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
// jsqr is CommonJS: its default import is the function itself, or an object holding it as `default`.
const loaded = jsqrModule as unknown as Decode | { default: Decode };
const jsQR: Decode = typeof loaded === "function" ? loaded : loaded.default;

const QUIET = 4;
const SCALE = 4;

export function rasterize(modules: boolean[][]): { pixels: Uint8ClampedArray; width: number } {
  const side = (modules.length + QUIET * 2) * SCALE;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < SCALE; dy += 1) {
      for (let dx = 0; dx < SCALE; dx += 1) {
        const offset = (((y + QUIET) * SCALE + dy) * side + (x + QUIET) * SCALE + dx) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
  }));
  return { pixels, width: side };
}

export function decodeModules(modules: boolean[][]): string | null {
  const { pixels, width } = rasterize(modules);
  return jsQR(pixels, width, width)?.data ?? null;
}

export function decodePixels(pixels: number[] | Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(Uint8ClampedArray.from(pixels), width, height)?.data ?? null;
}

/** The matrix an SVG path of "M x y h w v1 h-w z" runs describes (quiet zone removed). */
export function modulesFromPath(path: string, size: number): boolean[][] {
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/gu)) {
    for (let dx = 0; dx < Number(w); dx += 1) modules[Number(y) - QUIET]![Number(x) - QUIET + dx] = true;
  }
  return modules;
}
