import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { backup, BACKUP_FLAGS, BACKUP_USAGE, defaultOut, describe as words, FOLDERS } from "../../src/portfolio/account-backup.ts";
import { parseFlags } from "../../src/portfolio/cli.ts";

/** One archive of the home for the user alone: every folder but the logs, 0600, and the words that say what is in it and what is not. */
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const temp = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

describe("account:backup", () => {
  it("archives the home's folders but the logs, readable by the user alone, and says what went in and what stayed out", () => {
    if (process.platform === "win32") return;
    const home = temp("backup-home-");
    for (const d of ["portfolio", "credentials/okx", "seats", "paper/paper-1", "logs"]) mkdirSync(join(home, d), { recursive: true });
    writeFileSync(join(home, "portfolio", "ledger-x.jsonl"), '{"kind":"intent"}\n', { mode: 0o600 });
    writeFileSync(join(home, "credentials", "okx", "api-key.json"), '{"apiKey":"not-a-real-key"}\n', { mode: 0o600 });
    writeFileSync(join(home, "seats", "claude-code.json"), "{}\n", { mode: 0o600 });
    writeFileSync(join(home, "paper", "paper-1", "book.json"), "{}\n", { mode: 0o600 });
    writeFileSync(join(home, "logs", "account.log"), "TRADING IS ON\n");
    const out = join(temp("backup-out-"), "home.tgz");
    const b = backup(home, out);
    expect(b.out).toBe(out);
    expect(statSync(out).mode & 0o777).toBe(0o600);
    expect(b.bytes).toBeGreaterThan(0);
    const listed = execFileSync("tar", ["-tzf", out], { encoding: "utf8" }).split("\n").map((l) => l.replace(/^\.\//, "")).filter(Boolean);
    expect(listed).toContain("portfolio/ledger-x.jsonl");
    expect(listed).toContain("credentials/okx/api-key.json");
    expect(listed).toContain("seats/claude-code.json");
    expect(listed).toContain("paper/paper-1/book.json");
    expect(listed.some((l) => l.startsWith("logs"))).toBe(false);
    expect(b.inside.map((f) => f.dir)).toEqual(["portfolio", "credentials", "seats", "paper"]);
    expect(b.leftOut).toEqual(["logs"]);
    const said = words(b, home);
    expect(said).toContain("readable by you alone");
    expect(said).toContain("left out: logs/");
    expect(said).toContain("owner's key");
    expect(said).toContain("--home <that folder>");
  });

  it("refuses a home that is not there, names the archive after today, and takes --home, --out and --help only", () => {
    expect(() => backup(join(tmpdir(), "no-such-home-here"), "/tmp/x.tgz")).toThrow(/no home at/);
    expect(defaultOut(new Date("2026-10-22T15:00:00Z"))).toMatch(/\/openpaper-backup-2026-10-22\.tgz$/);
    expect(parseFlags(["--out", "/tmp/a.tgz"], BACKUP_FLAGS, BACKUP_USAGE)).toMatchObject({ kind: "ok" });
    expect(parseFlags(["--keys"], BACKUP_FLAGS, BACKUP_USAGE)).toMatchObject({ kind: "refused" });
    const help = parseFlags(["--help"], BACKUP_FLAGS, BACKUP_USAGE);
    expect(help.kind).toBe("help");
    if (help.kind === "help") for (const f of BACKUP_FLAGS) expect(help.text).toContain(`--${f.name}`);
    // every folder the words describe is one the account writes
    for (const f of FOLDERS) expect(["portfolio", "credentials", "seats", "agent-wallets", "paper", "desk", "memory"]).toContain(f.dir);
  });
});
