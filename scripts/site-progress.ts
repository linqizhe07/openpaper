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

/** a merge commit's subject, as GitHub writes it ("Merge pull request #24 from owner/branch"): the number and the branch. A subject
 * written by hand may lack its number (one on this repository's main does): the branch still names the pull request */
export interface MergeRef {
  number?: number;
  branch: string;
}
const MERGE_SUBJECT = /^Merge pull request #(\d*) from [^/\s]+\/(\S+)/;
export function mergeRef(line: string): MergeRef | undefined {
  const m = MERGE_SUBJECT.exec(line.trim());
  if (!m) return undefined;
  return { ...(m[1] ? { number: Number(m[1]) } : {}), branch: m[2]! };
}
/** the newest merged pull request a git log names, from its merge subjects (newest first) */
export function newestMerge(log: string): MergeRef | undefined {
  for (const line of log.split("\n")) {
    const r = mergeRef(line);
    if (r) return r;
  }
  return undefined;
}
/** every merged pull request a git log names, newest first: the order the repository merged them, which is the order the page shows them
 * (a batch pushed at once has one merge time at GitHub for all of it, so the time says nothing of the order) */
export function mergedOrder(log: string): MergeRef[] {
  const out: MergeRef[] = [];
  for (const line of log.split("\n")) {
    const r = mergeRef(line);
    if (r) out.push(r);
  }
  return out;
}
/** does an entry name a merge: the same branch, and the same number where both say one (numbers alone collide across the repository's
 * homes); an entry baked before branches were kept, by its number alone */
export function sameMerge(e: { number: number; branch?: string }, h: MergeRef): boolean {
  if (e.branch) return e.branch === h.branch && (h.number === undefined || h.number === e.number);
  return h.number === e.number;
}
/** where an entry stands in the history's order; the history's length where it names none (merged elsewhere, or a shallow checkout) */
export function historyRank(e: { number: number; branch?: string }, order: MergeRef[]): number {
  const i = order.findIndex((h) => sameMerge(e, h));
  return i < 0 ? order.length : i;
}
/** the list in the history's order, newest first; an entry the history does not name after the named ones, by its merge time */
export function orderByHistory(list: Merged[], log: string): Merged[] {
  const order = mergedOrder(log);
  return [...list].sort((a, b) => historyRank(a, order) - historyRank(b, order) || Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
}

/** does the file's first entry name the newest merge? (an entry without a branch, from before branches were kept, matches by number) */
export function isFresh(file: Progress, newest: MergeRef | undefined): boolean {
  if (!newest) return true;
  const first = file.merged[0];
  return !!first && sameMerge(first, newest);
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
export async function refresh(log: string = execFileSync("git", ["log", "--merges", "--first-parent", "--format=%s"], { cwd: ROOT, encoding: "utf8" })): Promise<Progress> {
  const order = mergedOrder(log);
  const earlier = (await fetchMerged(EARLIER_HOME)).filter((e) => historyRank(e, order) < order.length);
  const merged = orderByHistory([...(await fetchMerged(REPO)), ...earlier], log);
  return { asOf: new Date().toISOString().slice(0, 10), source: `https://api.github.com/repos/${REPO}/pulls?state=closed`, merged };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--check")) {
    const file = JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) as Progress;
    const log = execFileSync("git", ["log", "--merges", "--first-parent", "-1", "--format=%s"], { cwd: ROOT, encoding: "utf8" });
    const newest = newestMerge(log);
    if (!isFresh(file, newest)) {
      console.error(`site/data/progress.json is stale: its first entry is #${file.merged[0]?.number ?? "none"}, the newest merge is ${newest?.number === undefined ? "" : `#${newest.number} `}(${newest?.branch}). Run \`npm run site:progress\``);
      process.exit(1);
    }
    console.log("site/data/progress.json names the newest merge");
  } else {
    const p = await refresh();
    writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2) + "\n");
    console.log(`wrote ${relative(ROOT, PROGRESS_FILE)}: ${p.merged.length} merged pull requests, newest #${p.merged[0]?.number}`);
  }
}
