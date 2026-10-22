import { describe, expect, it } from "vitest";
import { codeLine, LABEL, manager, plan, planSystemd, quoteUnit, rotateLogs, stillLeaving, tryAgain, unquoteUnit, untilGone } from "../../src/portfolio/account-service.ts";

/** The LaunchAgent that keeps the account up for agents: what launchd is told to run, and what it is not given */
describe("the account as a background service", () => {
  const p = plan(["--live-cap", "20", "--port", "4820"], { node: "/opt/homebrew/bin/node", root: "/Users/me/demo", home: "/Users/me/.buyer-agent-demo", env: { PATH: "/Users/me/demo/node_modules/.bin:/opt/homebrew/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/opt/homebrew/bin:/usr/bin", HOME: "/Users/me", PORTFOLIO_RPC_BASE: "https://rpc.example", SECRET_TOKEN: "x", SEC_CONTACT: "owner@example.org", PORTFOLIO_MM_BIN: "/opt/homebrew/bin/mm", PORTFOLIO_MM_WRITES: "1", ANTHROPIC_API_KEY: "sk-ant-not-for-the-plist", OPENAI_API_KEY: "sk-not-for-the-plist" } });

  it("runs this folder's server under node and tsx by their full paths, with the options given", () => {
    expect(p.args).toEqual(["/opt/homebrew/bin/node", "/Users/me/demo/node_modules/tsx/dist/cli.mjs", "/Users/me/demo/src/portfolio/server.ts", "--live-cap", "20", "--port", "4820"]);
    expect(p.plist).toContain(`<key>Label</key><string>${LABEL}</string>`);
    expect(p.plist).toContain("<key>WorkingDirectory</key><string>/Users/me/demo</string>");
  });

  it("starts at login, starts again only after an exit by accident, and logs where only the user can read", () => {
    expect(p.plist).toMatch(/<key>RunAtLoad<\/key><true\/>/);
    expect(p.plist).toMatch(/<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key><false\/>/);
    expect(p.plist).toContain("<key>Umask</key><integer>63</integer>");
    expect([p.log, p.errLog]).toEqual(["/Users/me/.buyer-agent-demo/logs/account.log", "/Users/me/.buyer-agent-demo/logs/account.err.log"]);
  });

  it("keeps the user's PATH, HOME, RPC settings, SEC contact and MetaMask switches — not npm's own folders, never a model key, and nothing else", () => {
    expect(p.plist).toContain("<key>PATH</key><string>/opt/homebrew/bin:/usr/bin</string>");
    expect(p.plist).toContain("<key>PORTFOLIO_RPC_BASE</key><string>https://rpc.example</string>");
    expect(p.plist).toContain("<key>SEC_CONTACT</key><string>owner@example.org</string>");
    expect(p.plist).toContain("<key>PORTFOLIO_MM_BIN</key><string>/opt/homebrew/bin/mm</string>");
    expect(p.plist).toContain("<key>PORTFOLIO_MM_WRITES</key><string>1</string>");
    expect(p.plist).not.toContain("SECRET_TOKEN");
    expect(p.plist).not.toContain("ANTHROPIC_API_KEY");
    expect(p.plist).not.toContain("OPENAI_API_KEY");
    expect(p.plist).not.toContain("not-for-the-plist");
    expect(p.plist).not.toContain("node_modules/.bin");
  });

  it("writes what it is given as XML text", () => {
    expect(plan(["--home", "/tmp/a&b<c>"], { node: "/n", root: "/r", home: "/h", env: {} }).plist).toContain("<string>/tmp/a&amp;b&lt;c&gt;</string>");
  });

  it("`code` shows the pairing code of the run that is up now — the last one it said: a new one replaces the code it started with once the last browser signs out — never an earlier run's", () => {
    const earlier = "TRADING IS ON · real orders …\n  pairing code: AAAA-BBBB — the first browser becomes the owner only with this code, typed on the page";
    const started = "TRADING IS ON · real orders …\n  pairing code: CCCC-DDDD — the first browser becomes the owner only with this code, typed on the page";
    const signedOut = "signed out: no browser signs for the account now\n  pairing code: EEEE-FFFF — the next browser becomes the owner only with this code, typed on the page (the code before it no longer works)";
    expect(codeLine(`${earlier}\nyour account at …\n${started}\nyour account at …`)).toBe("pairing code: CCCC-DDDD — the first browser becomes the owner only with this code, typed on the page");
    expect(codeLine(`${earlier}\n${started}\n${signedOut}\n${signedOut.replace("EEEE-FFFF", "GGGG-HHHH")}`)).toBe("pairing code: GGGG-HHHH — the next browser becomes the owner only with this code, typed on the page (the code before it no longer works)");
    // a run that started owned said no code: an earlier run's is not this run's
    expect(codeLine(`${earlier}\nTRADING IS ON · real orders …\nyour account at …`)).toBeUndefined();
    expect(codeLine("")).toBeUndefined();
  });
});

/** `install` over a running copy: launchd answers `bootout` before the copy has left, and a `bootstrap` inside that moment fails with
 * "5: Input/output error" (seen 2026-10-22: SIGTERM at 10:43:59.910, the service removed at 10:44:00.030, the bootstrap between them) */
describe("install over a running copy", () => {
  /** a clock and a pause that moves it, so the waits are counted and not slept */
  const fakes = () => {
    let t = 1_000_000;
    const pauses: number[] = [];
    return { now: () => t, pause: (ms: number) => { pauses.push(ms); t += ms; }, pauses, at: () => t };
  };

  it("asks launchd until the service is gone, a pause between asks, and is done the moment it is", () => {
    const f = fakes();
    let asks = 0;
    const gone = untilGone(() => ++asks <= 3, { now: f.now, pause: f.pause });
    expect(gone).toBe(true);
    expect(asks).toBe(4);
    expect(f.pauses).toEqual([100, 100, 100]);
  });

  it("does not pause at all when nothing is loaded", () => {
    const f = fakes();
    expect(untilGone(() => false, { now: f.now, pause: f.pause })).toBe(true);
    expect(f.pauses).toEqual([]);
  });

  it("gives up once the time allowed has passed, so the installer can say so instead of hanging", () => {
    const f = fakes();
    const gone = untilGone(() => true, { now: f.now, pause: f.pause, forMs: 30_000, everyMs: 100 });
    expect(gone).toBe(false);
    expect(f.pauses.length).toBe(300);
    expect(f.at()).toBe(1_030_000);
  });

  it("knows launchd's answer while the label is still leaving, from the command's stderr or its message, and nothing else", () => {
    expect(stillLeaving(Object.assign(new Error("Command failed: launchctl bootstrap gui/501 /x.plist"), { stderr: "Bootstrap failed: 5: Input/output error\nTry re-running the command as root for richer errors.\n" }))).toBe(true);
    expect(stillLeaving(new Error("Command failed: launchctl bootstrap gui/501 /x.plist\nBootstrap failed: 5: Input/output error"))).toBe(true);
    expect(stillLeaving(Object.assign(new Error("Command failed"), { stderr: "Bootstrap failed: 37: Operation already in progress\n" }))).toBe(false);
    expect(stillLeaving(Object.assign(new Error("Command failed"), { stderr: "Bootstrap failed: 119: Service is disabled\n" }))).toBe(false);
    expect(stillLeaving(undefined)).toBe(false);
  });

  it("bootstraps again after a pause while launchd says the label is still leaving, a few times in all, and throws anything else at once", () => {
    const f = fakes();
    // as execFileSync throws it: the command in the message with stderr appended, and stderr on its own
    const eio = () => Object.assign(new Error("Command failed: launchctl bootstrap gui/501 /x.plist\nBootstrap failed: 5: Input/output error\n"), { stderr: "Bootstrap failed: 5: Input/output error\n" });
    let calls = 0;
    expect(tryAgain(() => (++calls < 3 ? (() => { throw eio(); })() : "ok"), { again: stillLeaving, pause: f.pause })).toBe("ok");
    expect(calls).toBe(3);
    expect(f.pauses).toEqual([500, 500]);

    calls = 0;
    expect(() => tryAgain(() => { calls++; throw eio(); }, { again: stillLeaving, pause: f.pause, tries: 5 })).toThrow(/Input\/output error/);
    expect(calls).toBe(5);
    expect(f.pauses).toEqual([500, 500, 500, 500, 500, 500]);

    calls = 0;
    const other = Object.assign(new Error("Command failed: launchctl bootstrap gui/501 /x.plist\nBootstrap failed: 119: Service is disabled\n"), { stderr: "Bootstrap failed: 119: Service is disabled\n" });
    expect(() => tryAgain(() => { calls++; throw other; }, { again: stillLeaving, pause: f.pause })).toThrow(/Service is disabled/);
    expect(calls).toBe(1);
    expect(f.pauses.length).toBe(6);
  });
});

/** The same service as a systemd user unit on Linux: the same command, environment, restart rule, umask and log files as the LaunchAgent */
describe("the account as a systemd user service", () => {
  const env = { PATH: "/home/me/demo/node_modules/.bin:/usr/local/bin:/usr/bin", HOME: "/home/me", PORTFOLIO_RPC_BASE: "https://rpc.example", SECRET_TOKEN: "x", SEC_CONTACT: "owner@example.org", ANTHROPIC_API_KEY: "sk-ant-not-for-the-unit" };
  const p = planSystemd(["--live-cap", "20", "--port", "4820"], { node: "/usr/local/bin/node", root: "/home/me/demo", home: "/home/me/.buyer-agent-demo", env });

  it("runs this folder's server under node and tsx by their full paths, with the options given, from this folder", () => {
    expect(p.unit).toContain("ExecStart=/usr/local/bin/node /home/me/demo/node_modules/tsx/dist/cli.mjs /home/me/demo/src/portfolio/server.ts --live-cap 20 --port 4820\n");
    expect(p.unit).toContain("WorkingDirectory=/home/me/demo\n");
    expect(p.args).toEqual(["/usr/local/bin/node", "/home/me/demo/node_modules/tsx/dist/cli.mjs", "/home/me/demo/src/portfolio/server.ts", "--live-cap", "20", "--port", "4820"]);
    expect(p.text).toBe(p.unit);
  });

  it("restarts only after a failure, writes files for the user alone, appends to the same two logs, and starts with the user's session", () => {
    expect(p.unit).toContain("Restart=on-failure\n");
    expect(p.unit).toContain("RestartSec=30\n");
    expect(p.unit).toContain("UMask=0077\n");
    expect(p.unit).toContain("StandardOutput=append:/home/me/.buyer-agent-demo/logs/account.log\n");
    expect(p.unit).toContain("StandardError=append:/home/me/.buyer-agent-demo/logs/account.err.log\n");
    expect(p.unit).toContain("WantedBy=default.target\n");
    expect([p.log, p.errLog]).toEqual(["/home/me/.buyer-agent-demo/logs/account.log", "/home/me/.buyer-agent-demo/logs/account.err.log"]);
  });

  it("keeps the same few variables as the LaunchAgent and nothing else, and lives under the user's config directory", () => {
    expect(p.unit).toContain("Environment=PATH=/usr/local/bin:/usr/bin\n");
    expect(p.unit).toContain("Environment=HOME=/home/me\n");
    expect(p.unit).toContain("Environment=PORTFOLIO_RPC_BASE=https://rpc.example\n");
    expect(p.unit).toContain("Environment=SEC_CONTACT=owner@example.org\n");
    expect(p.unit).not.toContain("SECRET_TOKEN");
    expect(p.unit).not.toContain("ANTHROPIC_API_KEY");
    expect(p.path).toBe(`/home/me/.config/systemd/user/${LABEL}.service`);
    expect(planSystemd([], { node: "/n", root: "/r", home: "/h", env: { ...env, XDG_CONFIG_HOME: "/xdg" } }).path).toBe(`/xdg/systemd/user/${LABEL}.service`);
  });

  it("quotes a word with a space, a quote or a backslash the way systemd reads it, and reads it back", () => {
    const words = ["/n", "/r/src/portfolio/server.ts", "--home", "/tmp/a b\"c\\d", "--live-cap", "20", ""];
    const line = words.map(quoteUnit).join(" ");
    expect(line).toBe('/n /r/src/portfolio/server.ts --home "/tmp/a b\\"c\\\\d" --live-cap 20 ""');
    expect(unquoteUnit(line)).toEqual(words);
    const q = planSystemd(["--home", "/tmp/a b\"c"], { node: "/n", root: "/r", home: "/h", env: {} });
    expect(unquoteUnit(/^ExecStart=(.*)$/m.exec(q.unit!)![1]!)).toEqual(["/n", "/r/node_modules/tsx/dist/cli.mjs", "/r/src/portfolio/server.ts", "--home", "/tmp/a b\"c"]);
  });

  it("is the manager on Linux, launchd is on macOS, and Windows gets a sentence instead of a service", () => {
    expect(manager("linux").name).toBe("systemd");
    expect(manager("darwin").name).toBe("launchd");
    expect(() => manager("win32")).toThrow(/npm run account/);
  });
});

/** The logs are rotated when the service is started again: a big one becomes .1, the earlier ones shift, the oldest is dropped */
describe("log rotation", () => {
  const fake = (sizes: Record<string, number>) => {
    const files = { ...sizes };
    const moves: string[] = [];
    return {
      files,
      moves,
      fs: {
        existsSync: (f: string) => f in files,
        statSync: (f: string) => ({ size: files[f]! }),
        renameSync: (a: string, b: string) => { files[b] = files[a]!; delete files[a]; moves.push(`${a} → ${b}`); },
        rmSync: (f: string) => { delete files[f]; moves.push(`rm ${f}`); },
      },
    };
  };

  it("rotates a log over the limit, shifting the earlier ones and dropping the oldest; leaves a small or missing one alone", () => {
    const f = fake({ "/l/account.log": 6_000_000, "/l/account.log.1": 10, "/l/account.log.2": 20, "/l/account.log.3": 30, "/l/account.err.log": 100 });
    expect(rotateLogs(["/l/account.log", "/l/account.err.log", "/l/none.log"], { maxBytes: 5_000_000, keep: 3, fs: f.fs })).toEqual(["/l/account.log"]);
    expect(f.moves).toEqual(["rm /l/account.log.3", "/l/account.log.2 → /l/account.log.3", "/l/account.log.1 → /l/account.log.2", "/l/account.log → /l/account.log.1"]);
    expect(f.files).toEqual({ "/l/account.log.1": 6_000_000, "/l/account.log.2": 10, "/l/account.log.3": 20, "/l/account.err.log": 100 });
  });
});
