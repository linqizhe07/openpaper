/** WHICH OPENPAPER THIS IS: the version from package.json, and the commit the checkout is at, read from .git without the git command (the
 * background service has only the user's PATH, and a copy unpacked from an archive has no .git at all, in which case there is no commit
 * to name). Shown by `/api/now`, the Settings sheet, the service's `status` and the server's first line, so a bug report can say it. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** the version in package.json */
export const VERSION: string = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version?: string }).version ?? "0.0.0";

/** the first seven characters of the commit `root`'s checkout is at, or undefined where there is no .git to read */
export function commit(root: string = ROOT): string | undefined {
  try {
    const git = join(root, ".git");
    const head = readFileSync(join(git, "HEAD"), "utf8").trim();
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    const sha = ref ? refSha(git, ref) : head;
    return sha && /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 7) : undefined;
  } catch {
    return undefined;
  }
}

/** a ref's sha: its own file, else the line in packed-refs */
function refSha(git: string, ref: string): string | undefined {
  const file = join(git, ...ref.split("/"));
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const packed = join(git, "packed-refs");
  if (!existsSync(packed)) return undefined;
  for (const line of readFileSync(packed, "utf8").split("\n")) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && sha) return sha;
  }
  return undefined;
}

/** "openpaper v0.1.0 (9e0ce79)", or without the commit where there is none */
export function versionLine(root?: string): string {
  const c = commit(root);
  return `openpaper v${VERSION}${c ? ` (${c})` : ""}`;
}
