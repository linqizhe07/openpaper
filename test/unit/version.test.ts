import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commit, VERSION, versionLine } from "../../src/portfolio/version.ts";

/** Which openpaper this is: package.json's version, the commit where there is a .git, and a changelog whose newest release is that version. */
describe("the version", () => {
  it("is package.json's, and the commit is the checkout's first seven characters, or nothing without a .git", () => {
    expect(VERSION).toBe((JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version);
    expect(commit()).toMatch(/^[0-9a-f]{7}$/);
    const empty = mkdtempSync(join(tmpdir(), "no-git-"));
    try {
      expect(commit(empty)).toBeUndefined();
      expect(versionLine(empty)).toBe(`openpaper v${VERSION}`);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    expect(versionLine()).toBe(`openpaper v${VERSION} (${commit()})`);
  });

  it("CHANGELOG.md's newest release is this version, and every line under Unreleased links its pull request in this repository", () => {
    const log = readFileSync("CHANGELOG.md", "utf8");
    const releases = [...log.matchAll(/^## v(\S+) — (\d{4}-\d{2}-\d{2})$/gm)].map((m) => m[1]);
    expect(releases[0]).toBe(VERSION);
    const unreleased = log.slice(log.indexOf("## Unreleased"), log.indexOf(`## v${VERSION}`));
    const lines = unreleased.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/\[#\d+\]\(https:\/\/github\.com\/linqizhe07\/openpaper\/pull\/\d+\)$/);
  });
});
