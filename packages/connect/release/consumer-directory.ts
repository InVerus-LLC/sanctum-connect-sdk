/** Create a new consumer workspace without deleting or reusing any caller-owned directory. */
import { mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

export function createConsumerDirectory(argument: string | undefined, repository: string): string {
  if (!argument?.trim()) throw new Error("Give a new consumer directory outside the repository");
  const requested = resolve(argument);
  // Resolve the existing parent to catch aliases into the repository. Requiring an existing parent
  // also avoids creating a chain of directories on a misspelled path.
  const directory = join(realpathSync(dirname(requested)), basename(requested));
  const root = realpathSync(repository);
  if (contains(root, directory) || contains(directory, root)) {
    throw new Error("Consumer directory must be outside the repository and not its ancestor");
  }
  // Exclusive, non-recursive mkdir refuses existing directories, files and symlinks. There is no
  // cleanup of a supplied path: even failed consumer runs leave their newly created artifacts.
  mkdirSync(directory, { mode: 0o700 });
  return directory;
}
