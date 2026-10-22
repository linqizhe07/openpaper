import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

/** the files this process has already made the user's alone (one stat per file per run) */
const tightened = new Set<string>();

/** Append one JSON row to a `.jsonl` file, creating its directory. Synchronous
 * on purpose: a ledger row must be on disk before the next step runs.
 * The file is the user's alone, like every other file in the home: made 0600 in a 0700 directory, and one made by an earlier
 * version with wider bits is tightened the first time it is written to (file modes mean nothing on Windows, so not there). */
export function appendJsonl(file: string, row: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  if (!tightened.has(file)) {
    if (process.platform !== "win32" && existsSync(file) && statSync(file).mode & 0o077) chmodSync(file, 0o600);
    tightened.add(file);
  }
  appendFileSync(file, JSON.stringify(row) + "\n", { encoding: "utf8", mode: 0o600 });
}

/** Read every row of a `.jsonl` file; a missing file is an empty list. */
export function readJsonl<T = unknown>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}
