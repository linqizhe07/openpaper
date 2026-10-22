import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { historyRank, isFresh, mergedOrder, mergeRef, newestMerge, orderByHistory, PROGRESS_FILE, REPO, type Merged, type Progress } from "../../scripts/site-progress.ts";

/** The site's baked Progress list: the check that keeps it fresh reads the newest merge commit, number and branch, and no network. */
describe("the site's progress file", () => {
  const log = "Merge pull request #2 from linqizhe07/ci/typecheck-and-tests\nMerge pull request #1 from linqizhe07/chore/rename-openpaper\nMerge pull request #45 from linqizhe07/fix/from-zero-beta\n";

  it("reads the newest merge's number and branch from the log — the branch alone where a hand-written subject has no number — and nothing from a log without merges", () => {
    expect(newestMerge(log)).toEqual({ number: 2, branch: "ci/typecheck-and-tests" });
    expect(newestMerge("Merge pull request # from linqizhe07/fix/by-hand\n" + log)).toEqual({ branch: "fix/by-hand" });
    expect(mergeRef("The project is openpaper")).toBeUndefined();
    expect(newestMerge("The project is openpaper\nA changelog and a version\n")).toBeUndefined();
    expect(newestMerge("")).toBeUndefined();
  });

  it("names every merge in the log, newest first, so the earlier home's list is kept to what this history merged — by branch and number, by branch alone where the subject has none, by number alone for an entry baked without a branch", () => {
    expect(mergedOrder(log)).toEqual([{ number: 2, branch: "ci/typecheck-and-tests" }, { number: 1, branch: "chore/rename-openpaper" }, { number: 45, branch: "fix/from-zero-beta" }]);
    expect(mergedOrder("nothing merged\n")).toEqual([]);
    const order = mergedOrder("Merge pull request # from linqizhe07/fix/by-hand\n" + log);
    const e = (number: number, branch?: string): Merged => ({ number, title: "t", mergedAt: "2026-10-22T00:00:00Z", url: "u", ...(branch ? { branch } : {}) });
    expect([historyRank(e(26, "fix/by-hand"), order), historyRank(e(2, "ci/typecheck-and-tests"), order), historyRank(e(2), order), historyRank(e(2, "fix/other"), order), historyRank(e(7, "feat/elsewhere"), order), historyRank(e(26), order)]).toEqual([0, 1, 1, 4, 4, 4]);
  });

  it("orders the list as the history merged them — not by GitHub's merge time, which is one time for a batch pushed at once — the ones the history does not name last, by their time", () => {
    const e = (number: number, branch: string | undefined, mergedAt: string): Merged => ({ number, title: "t", mergedAt, url: "u", ...(branch ? { branch } : {}) });
    const list = [e(1, "chore/rename-openpaper", "2026-10-22T20:00:00Z"), e(45, "fix/from-zero-beta", "2026-10-21T00:00:00Z"), e(7, "feat/elsewhere", "2026-10-22T21:00:00Z"), e(2, "ci/typecheck-and-tests", "2026-10-22T19:59:00Z"), e(9, undefined, "2026-10-22T22:00:00Z"), e(45, undefined, "2026-10-20T00:00:00Z")];
    expect(orderByHistory(list, log).map((x) => [x.number, x.branch ?? "", x.mergedAt])).toEqual([
      [2, "ci/typecheck-and-tests", "2026-10-22T19:59:00Z"],
      [1, "chore/rename-openpaper", "2026-10-22T20:00:00Z"],
      [45, "fix/from-zero-beta", "2026-10-21T00:00:00Z"],
      [45, "", "2026-10-20T00:00:00Z"],
      [9, "", "2026-10-22T22:00:00Z"],
      [7, "feat/elsewhere", "2026-10-22T21:00:00Z"],
    ]);
    expect(orderByHistory([], log)).toEqual([]);
  });

  it("is fresh when its first entry is the newest merge by number and branch — numbers alone collide across the repository's homes", () => {
    const entry = (number: number, branch?: string) => ({ number, title: "t", mergedAt: "2026-10-22T00:00:00Z", url: "u", ...(branch ? { branch } : {}) });
    const file = (...merged: ReturnType<typeof entry>[]): Progress => ({ asOf: "2026-10-22", source: "s", merged });
    const newest = { number: 2, branch: "ci/typecheck-and-tests" };
    expect(isFresh(file(entry(2, "ci/typecheck-and-tests"), entry(1, "chore/rename-openpaper")), newest)).toBe(true);
    expect(isFresh(file(entry(1, "chore/rename-openpaper")), newest)).toBe(false);
    expect(isFresh(file(entry(2, "fix/something-else")), newest)).toBe(false);
    // an entry baked before branches were kept matches by number alone
    expect(isFresh(file(entry(2)), newest)).toBe(true);
    expect(isFresh(file(), newest)).toBe(false);
    expect(isFresh(file(), undefined)).toBe(true);
    // a merge whose subject lost its number: its branch decides, and an entry without a branch cannot match it
    expect(isFresh(file(entry(25, "fix/by-hand")), { branch: "fix/by-hand" })).toBe(true);
    expect(isFresh(file(entry(24, "feat/shortcuts-sheet")), { branch: "fix/by-hand" })).toBe(false);
    expect(isFresh(file(entry(25)), { branch: "fix/by-hand" })).toBe(false);
  });

  it("the committed file has the shape the page reads, newest first, and its source is this repository", () => {
    const file = JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) as Progress;
    expect(file.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(file.source).toBe(`https://api.github.com/repos/${REPO}/pulls?state=closed`);
    expect(file.merged.length).toBeGreaterThan(0);
    for (const m of file.merged) {
      expect(typeof m.number).toBe("number");
      expect(m.title.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(m.mergedAt))).toBe(true);
      expect(m.url).toMatch(/^https:\/\/github\.com\/linqizhe07\/(openpaper|account)\/pull\/\d+$/);
    }
    // this repository's pull requests first (in the order they were merged: the history's, which no checkout here can read), then the
    // earlier home's, each merged on its own, so their times run newest first
    const home = (m: Merged) => (m.url.includes("/openpaper/") ? 0 : 1);
    for (let i = 1; i < file.merged.length; i++) expect(home(file.merged[i - 1]!)).toBeLessThanOrEqual(home(file.merged[i]!));
    const earlier = file.merged.filter((m) => home(m) === 1);
    for (let i = 1; i < earlier.length; i++) expect(Date.parse(earlier[i - 1]!.mergedAt)).toBeGreaterThanOrEqual(Date.parse(earlier[i]!.mergedAt));
  });
});
