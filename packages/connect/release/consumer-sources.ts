/** Rewrite only copied consumer fixtures; the workspace examples keep internal package imports. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rewriteModuleSpecifiers, type PublicNames } from "./public-names.ts";

export function rewriteConsumerSources(directory: string, names: PublicNames): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rewriteConsumerSources(path, names);
    else if (/\.(?:[cm]?js|tsx?)$/u.test(entry.name)) writeFileSync(path, rewriteModuleSpecifiers(readFileSync(path, "utf8"), names));
  }
}
