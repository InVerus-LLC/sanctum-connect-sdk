import { existsSync } from "node:fs";
import { join } from "node:path";

/** npm selects the host ABI using each SWC package's os/cpu/libc metadata. */
export function nativeCompilerPackage(
  root: string,
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  const prefix = `@next/swc-${platform}-${arch}`;
  const installed = [prefix, `${prefix}-gnu`, `${prefix}-musl`, `${prefix}-msvc`].filter((name) =>
    existsSync(join(root, "node_modules", name)),
  );
  if (installed.length !== 1)
    throw new Error("Expected exactly one installed Next.js compiler for the host platform and ABI");
  return installed[0]!;
}
