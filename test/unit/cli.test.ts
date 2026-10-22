import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHECK_FLAGS, CHECK_USAGE, checkServerArgs, DEFAULT_CAP_USD, DEFAULT_PORT, ENV_VARS, parseFlags, SERVER_FLAGS, SERVER_USAGE, serviceUsage, SERVICE_COMMANDS, usage } from "../../src/portfolio/cli.ts";

/** The command lines: a misspelt option is refused with the list, `--help` says everything, and the server, the check and the service read
 * the same tables the README prints. */
describe("the command lines", () => {
  const names = SERVER_FLAGS.map((f) => `--${f.name}`);

  it("refuses an option it does not know, naming every option it does — so --readonly never leaves trading on by accident", () => {
    const p = parseFlags(["--readonly"], SERVER_FLAGS, SERVER_USAGE);
    expect(p.kind).toBe("refused");
    if (p.kind !== "refused") return;
    expect(p.text).toContain("unknown option --readonly");
    for (const n of names) expect(p.text).toContain(n);
    expect(p.text).toContain("--help");
  });

  it("refuses a value that is not what the option takes, a missing value, and a stray word", () => {
    expect(parseFlags(["--port", "abc"], SERVER_FLAGS, SERVER_USAGE)).toMatchObject({ kind: "refused", text: expect.stringContaining("--port takes a whole number from 1 to 65535") });
    expect(parseFlags(["--port", "70000"], SERVER_FLAGS, SERVER_USAGE)).toMatchObject({ kind: "refused" });
    expect(parseFlags(["--live-cap", "0"], SERVER_FLAGS, SERVER_USAGE)).toMatchObject({ kind: "refused", text: expect.stringContaining("more than zero") });
    expect(parseFlags(["--live-cap", "12.345"], SERVER_FLAGS, SERVER_USAGE)).toMatchObject({ kind: "refused" });
    expect(parseFlags(["--live-cap"], SERVER_FLAGS, SERVER_USAGE)).toMatchObject({ kind: "refused", text: expect.stringContaining("--live-cap") });
    expect(parseFlags(["serve"], SERVER_FLAGS, SERVER_USAGE)).toMatchObject({ kind: "refused", text: expect.stringContaining('"serve"') });
  });

  it("reads the options the README shows, with their defaults where they are left out", () => {
    const p = parseFlags(["--port", "4825", "--home", "/tmp/second", "--live-cap", "20", "--fresh"], SERVER_FLAGS, SERVER_USAGE);
    expect(p.kind).toBe("ok");
    if (p.kind !== "ok") return;
    expect([p.number("port"), p.get("home"), p.number("live-cap"), p.has("fresh"), p.has("read-only")]).toEqual([4825, "/tmp/second", 20, true, false]);
    const none = parseFlags([], SERVER_FLAGS, SERVER_USAGE);
    if (none.kind !== "ok") throw new Error(none.text);
    expect([none.number("port") ?? DEFAULT_PORT, none.number("live-cap") ?? DEFAULT_CAP_USD]).toEqual([4820, 100]);
  });

  it("--help and -h answer with every option, its default, and every environment variable", () => {
    for (const args of [["--help"], ["-h"]]) {
      const p = parseFlags(args, SERVER_FLAGS, SERVER_USAGE);
      expect(p.kind).toBe("help");
      if (p.kind !== "help") return;
      for (const n of names) expect(p.text).toContain(n);
      expect(p.text).toContain(`(${DEFAULT_PORT})`);
      expect(p.text).toContain(`(${DEFAULT_CAP_USD})`);
      for (const v of ENV_VARS) expect(p.text).toContain(v.name);
    }
    const check = parseFlags(["--help"], CHECK_FLAGS, CHECK_USAGE);
    if (check.kind !== "help") throw new Error("the check has no help");
    for (const f of CHECK_FLAGS) expect(check.text).toContain(`--${f.name}`);
    expect(check.text).not.toContain("Environment:");
    const service = serviceUsage();
    for (const c of SERVICE_COMMANDS) expect(service).toContain(c.name);
    for (const n of names) expect(service).toContain(n);
  });

  it("says which server options the service may be installed with, in one sentence, and nothing for ones the server takes", () => {
    expect(checkServerArgs(["--live-cap", "20", "--port", "4820"])).toBeUndefined();
    expect(checkServerArgs([])).toBeUndefined();
    expect(checkServerArgs(["--readonly"])).toContain("unknown option --readonly");
    expect(checkServerArgs(["--read-only", "--live-writes"])).toContain("opposite things");
    expect(checkServerArgs(["--help"])).toContain("--help");
  });

  it("every environment variable it lists is read somewhere in src, by the file it names", () => {
    for (const v of ENV_VARS) {
      const name = v.name.replace("<CHAIN>", "");
      const text = readFileSync(`src/portfolio/${v.where}`, "utf8");
      expect(text, `${v.name} in ${v.where}`).toContain(name);
    }
  });

  it("the usage text wraps nothing and holds no placeholder a reader would have to replace", () => {
    const text = usage(SERVER_FLAGS, SERVER_USAGE);
    for (const line of text.split("\n")) expect(line.length).toBeLessThan(200);
    expect(text).not.toMatch(/<your|YOUR_|xxx/i);
  });
});
