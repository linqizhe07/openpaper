/**
 * The site's Progress section: the merged pull requests, baked into site/data/progress.json so the page has them when GitHub does not
 * answer (site/main.js shows the live list when it does).
 *
 *   node --import tsx scripts/site-progress.ts            refreshes site/data/progress.json from GitHub: this repository first, then its
 *                                                         earlier home, whose pull requests the history still names
 *   node --import tsx scripts/site-progress.ts --check    exit 1 when the newest merge on this branch is not the file's first entry — so a
 *                                                         stale file stops the Pages publish, as a stale numbers.json does (pages.yml)
 *
 * The check needs no network and no token: it reads the newest merge commit's subject ("Merge pull request #N from owner/branch") and
 * compares its number and branch with the file. Pull request numbers restarted at #1 when the repository moved, so the number alone
 * would not do; the branch tells them apart. A pull request merged without a merge commit (squashed) is not seen by the check.
 * The earlier home's list is kept to the pull requests this history merged: the two homes diverged by a pull request after the move,
 * and the site shows this repository's history, not the other's.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PROGRESS_FILE = join(ROOT, "site", "data", "progress.json");
/** where the pull requests before this repository's #1 were merged: the history's merge commits still name their numbers */
export const EARLIER_HOME = "linqizhe07/account";

export interface Merged {
  number: number;
  title: string;
  mergedAt: string;
  url: string;
  /** the head branch, which with the number names a pull request across the repository's homes */
  branch?: string;
}
export interface Progress {
  asOf: string;
  source: string;
  merged: Merged[];
}

/** this repository, by name: the site's Progress and its "Read all" link are this repository's pull requests */
export const REPO = "linqizhe07/openpaper";

/** the newest merged pull request a git log names, from its merge subjects (newest first) */
export function newestMerge(log: string): { number: number; branch: string } | undefined {
  for (const line of log.split("\n")) {
    const m = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(line.trim());
    if (m) return { number: Number(m[1]), branch: m[2]! };
  }
  return undefined;
}

/** every merged pull request a git log names, as "number|branch", for keeping the earlier home's list to this history */
export function mergedInHistory(log: string): Set<string> {
  const out = new Set<string>();
  for (const line of log.split("\n")) {
    const m = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(line.trim());
    if (m) out.add(`${Number(m[1])}|${m[2]}`);
  }
  return out;
}

/** does the file's first entry name the newest merge? (an entry without a branch, from before branches were kept, matches by number) */
export function isFresh(file: Progress, newest: { number: number; branch: string } | undefined): boolean {
  if (!newest) return true;
  const first = file.merged[0];
  if (!first) return false;
  return first.number === newest.number && (first.branch === undefined || first.branch === newest.branch);
}

/** the merged pull requests of `repo`, newest first, as the page wants them */
export async function fetchMerged(repo: string, perPage = 100): Promise<Merged[]> {
  const r = await fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${perPage}`, { headers: { accept: "application/vnd.github+json", "user-agent": "openpaper site-progress" } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${repo}`);
  const list = (await r.json()) as Array<{ number: number; title: string; merged_at: string | null; html_url: string; head?: { ref?: string } }>;
  return list
    .filter((p) => p.merged_at)
    .map((p) => ({ number: p.number, title: p.title, mergedAt: p.merged_at!, url: p.html_url, ...(p.head?.ref ? { branch: p.head.ref } : {}) }))
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
}

/** this repository's merged pull requests, then the earlier home's that this history merged */
export async function refresh(history: Set<string> = mergedInHistory(execFileSync("git", ["log", "--merges", "--first-parent", "--format=%s"], { cwd: ROOT, encoding: "utf8" }))): Promise<Progress> {
  const earlier = (await fetchMerged(EARLIER_HOME)).filter((e) => (e.branch ? history.has(`${e.number}|${e.branch}`) : [...history].some((h) => h.startsWith(`${e.number}|`))));
  const merged = [...(await fetchMerged(REPO)), ...earlier];
  return { asOf: new Date().toISOString().slice(0, 10), source: `https://api.github.com/repos/${REPO}/pulls?state=closed`, merged };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--check")) {
    const file = JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) as Progress;
    const log = execFileSync("git", ["log", "--merges", "--first-parent", "-1", "--format=%s"], { cwd: ROOT, encoding: "utf8" });
    const newest = newestMerge(log);
    if (!isFresh(file, newest)) {
      console.error(`site/data/progress.json is stale: its first entry is #${file.merged[0]?.number ?? "none"}, the newest merge is #${newest?.number} (${newest?.branch}). Run \`npm run site:progress\``);
      process.exit(1);
    }
    console.log("site/data/progress.json names the newest merge");
  } else {
    const p = await refresh();
    writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2) + "\n");
    console.log(`wrote ${relative(ROOT, PROGRESS_FILE)}: ${p.merged.length} merged pull requests, newest #${p.merged[0]?.number}`);
  }
}
