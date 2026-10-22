import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The English README says where things are and what runs: its structure block names every folder under src, and every command it shows
 * is one package.json has (the docs-contract test checks the latter for every doc; this one pins the tree). */
describe("README.md", () => {
  const readme = readFileSync("README.md", "utf8");
  const tree = readme.slice(readme.indexOf("## Project structure"), readme.indexOf("## Tech stack"));

  it("names every folder under src/ and src/portfolio/ in its project structure", () => {
    const dirs = (p: string) => readdirSync(p).filter((d) => statSync(`${p}/${d}`).isDirectory());
    for (const d of dirs("src")) expect(tree, `src/${d}`).toContain(`src/${d}/`);
    for (const d of dirs("src/portfolio")) expect(tree, `src/portfolio/${d}`).toContain(`${d}/`);
  });

  it("has a table of contents whose every entry is a heading of the file", () => {
    const contents = readme.slice(readme.indexOf("## Contents"), readme.indexOf("## The page"));
    const anchors = [...contents.matchAll(/\]\(#([a-z-]+)\)/g)].map((m) => m[1]!);
    expect(anchors.length).toBeGreaterThan(10);
    const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/ +/g, "-"));
    for (const a of anchors) expect(headings, a).toContain(a);
  });

  it("says that no real key or wallet has been used, and no longer calls the cap hard", () => {
    expect(readme).toContain("No real key and no real wallet has ever been used");
    expect(readme).not.toMatch(/hard cap/i);
  });
});
