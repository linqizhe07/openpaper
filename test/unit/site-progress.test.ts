import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isFresh, mergedInHistory, newestMerge, PROGRESS_FILE, REPO, type Progress } from "../../scripts/site-progress.ts";

/** The site's baked Progress list: the check that keeps it fresh reads the newest merge commit, number and branch, and no network. */
describe("the site's progress file", () => {
  const log = "Merge pull request #2 from linqizhe07/ci/typecheck-and-tests\nMerge pull request #1 from linqizhe07/chore/rename-openpaper\nMerge pull request #45 from linqizhe07/fix/from-zero-beta\n";

  it("reads the newest merge's number and branch from the log, and nothing from a log without merges", () => {
    expect(newestMerge(log)).toEqual({ number: 2, branch: "ci/typecheck-and-tests" });
    expect(newestMerge("The project is openpaper\nA changelog and a version\n")).toBeUndefined();
    expect(newestMerge("")).toBeUndefined();
  });

  it("names every merge in the log by number and branch, so the earlier home's list is kept to what this history merged", () => {
    expect(mergedInHistory(log)).toEqual(new Set(["2|ci/typecheck-and-tests", "1|chore/rename-openpaper", "45|fix/from-zero-beta"]));
    expect(mergedInHistory("nothing merged\n").size).toBe(0);
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
    for (let i = 1; i < file.merged.length; i++) expect(Date.parse(file.merged[i - 1]!.mergedAt)).toBeGreaterThanOrEqual(Date.parse(file.merged[i]!.mergedAt));
  });
});
