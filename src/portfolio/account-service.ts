/** The Account as a background service on this Mac, so that an agent can call it at any time: started when the user logs in, started again if
 * it stops by accident, its log where only the user can read it. macOS's own launchd runs it (a LaunchAgent in ~/Library/LaunchAgents),
 * and nothing about it needs an administrator.
 *
 *   npm run account:service -- install --live-cap 20     run `npm run account -- --live-cap 20` in the background, from now on
 *   npm run account:service -- status                    is it running, and does it answer
 *   npm run account:service -- restart                   start it again (after an update, or to pick up new code)
 *   npm run account:service -- logs                      the last lines it wrote
 *   npm run account:service -- code                      the pairing code, when the account has no owner yet
 *   npm run account:service -- uninstall                 stop it and take it out of launchd
 *   npm run account:service -- help                      these commands and the server's options; an unknown command, or a server option
 *                                                        the server would refuse, is refused here before anything is written
 *
 * What it runs is the code in this folder: a change here reaches it on the next restart. Its state is the account's own (the ledgers in the
 * home, account/restore.ts): a restart brings back the owner's browser, the venues, the agents and their limits.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultHome } from "./home.ts";
import { checkServerArgs, SERVICE_COMMANDS, serviceUsage } from "./cli.ts";

export const LABEL = "com.buyer-agent-demo.account";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface ServicePlan {
  plist: string;
  path: string;
  log: string;
  errLog: string;
  args: string[];
}

const d0 = (f: string): boolean => {
  try {
    return existsSync(f) && !f.includes("/node_modules/");
  } catch {
    return false;
  }
};
const xml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** the LaunchAgent for `npm run account -- <serverArgs>`: node and tsx by their full paths (launchd has no shell to find them), this
 * folder as the working directory, restarted when it exits by accident, a log only the user can read (umask 077) */
export function plan(serverArgs: string[], o: { node?: string; root?: string; home?: string; env?: Record<string, string | undefined> } = {}): ServicePlan {
  const env = o.env ?? process.env;
  // node as the PATH finds it (Homebrew's /opt/homebrew/bin/node), not the versioned folder it resolves to: an upgrade does not break it
  const node = o.node ?? (env.PATH ?? "").split(":").map((d) => join(d, "node")).find((f) => d0(f)) ?? process.execPath;
  const root = o.root ?? ROOT;
  const home = o.home ?? defaultHome();
  const logs = join(home, "logs");
  const log = join(logs, "account.log");
  const errLog = join(logs, "account.err.log");
  const args = [node, join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "portfolio", "server.ts"), ...serverArgs];
  // the commands the account itself runs (mm for the MetaMask Agent Wallet) are found on the user's own PATH; the home, if moved, moves too
  // (without the folders npm puts first on PATH while it runs this script: they are npm's, not the user's)
  const path = (env.PATH ?? "").split(":").filter((d) => d !== "" && !d.includes("/node_modules/")).join(":");
  // what travels with the service: the home, the SEC contact, the RPC endpoints, and the MetaMask Agent Wallet's command and its own switch
  // for real transfers (PORTFOLIO_MM_WRITES=1; without it mm transfers were silently off under the service). Never a model key from the
  // shell (ANTHROPIC_*, OPENAI_*): the plist is a 0644 file, and a key belongs in the home's key files, which the page writes 0600
  const keep = Object.fromEntries(Object.entries({ PATH: path, HOME: env.HOME ?? homedir(), BUYER_HOME: env.BUYER_HOME, SEC_CONTACT: env.SEC_CONTACT, PORTFOLIO_MM_BIN: env.PORTFOLIO_MM_BIN, PORTFOLIO_MM_WRITES: env.PORTFOLIO_MM_WRITES, ...Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("PORTFOLIO_RPC_"))) }).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(keep).map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`).join("\n")}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(errLog)}</string>
  <key>ProcessType</key><string>Standard</string>
</dict>
</plist>
`;
  return { plist, path: join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`), log, errLog, args };
}

/** THE PAIRING CODE IN THE SERVICE'S LOG, as `code` shows it: the last one the run that is up now said — after its start line — which is the
 * one it started with, or the new one it made when the last device that signed for the account signed out (service.ts newPairingCode). An
 * earlier run's code is not this run's */
export function codeLine(log: string): string | undefined {
  const lines = log.split("\n");
  const start = lines.map((l) => l.startsWith("TRADING IS ON") || l.startsWith("read-only:")).lastIndexOf(true);
  return start >= 0 ? lines.slice(start + 1).findLast((l) => l.includes("pairing code:"))?.trim() : undefined;
}

const domain = (): string => `gui/${userInfo().uid}`;
const launchctl = (args: string[], quiet = false): string => {
  try {
    return execFileSync("launchctl", args, { encoding: "utf8", stdio: quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (quiet) return "";
    throw err;
  }
};

/** whether launchd still has the service: loaded, or on its way out */
const loaded = (): boolean => launchctl(["print", `${domain()}/${LABEL}`], true) !== "";

/** a pause without a shell (this script is synchronous), after which launchd is asked again */
const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/** `launchctl bootout` answers before the service is gone: launchd first ends the process (SIGTERM; the account server closes and exits in
 * about a tenth of a second) and only then removes the service — and a `bootstrap` of the same label inside that moment fails with
 * "Bootstrap failed: 5: Input/output error". So the installer asks until the service is gone: true then; false once `forMs` have passed */
export function untilGone(stillThere: () => boolean, o: { forMs?: number; everyMs?: number; pause?: (ms: number) => void; now?: () => number } = {}): boolean {
  const forMs = o.forMs ?? 30_000;
  const everyMs = o.everyMs ?? 100;
  const now = o.now ?? Date.now;
  const wait = o.pause ?? pause;
  const until = now() + forMs;
  while (stillThere()) {
    if (now() >= until) return false;
    wait(everyMs);
  }
  return true;
}

/** launchd's answer while the label is still leaving (the moment above, where its removal was not seen in time) */
export const stillLeaving = (err: unknown): boolean => /Input\/output error/.test(String((err as { stderr?: unknown } | undefined)?.stderr ?? (err as Error | undefined)?.message ?? err));

/** `step`, and when it fails the way `again` names, a pause and `step` once more — `tries` times in all; any other failure is thrown at once */
export function tryAgain<T>(step: () => T, o: { again: (err: unknown) => boolean; tries?: number; everyMs?: number; pause?: (ms: number) => void }): T {
  const tries = o.tries ?? 5;
  const wait = o.pause ?? pause;
  for (let i = 1; ; i++) {
    try {
      return step();
    } catch (err) {
      if (i >= tries || !o.again(err)) throw err;
      wait(o.everyMs ?? 500);
    }
  }
}

/** the port the service listens on, as its arguments say (4820 unless --port) */
const portOf = (args: string[]): number => {
  const i = args.indexOf("--port");
  return i >= 0 ? Number(args[i + 1]) : 4820;
};

async function answers(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/now`, { signal: AbortSignal.timeout(2_000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** how many owners the running account has (its signers), or undefined when it does not answer */
async function ownerCount(port: number): Promise<number | undefined> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/account`, { signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return undefined;
    const a = (await r.json()) as { signers?: { owners?: unknown[] } };
    return Array.isArray(a.signers?.owners) ? a.signers.owners.length : undefined;
  } catch {
    return undefined;
  }
}

/** the server's own options in the installed LaunchAgent (what follows server.ts in its ProgramArguments) */
function installed(): { args: string[] } | undefined {
  const p = plan([]).path;
  if (!existsSync(p)) return undefined;
  const block = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(readFileSync(p, "utf8"))?.[1] ?? "";
  const strings = [...block.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  const i = strings.findIndex((s) => s.endsWith("/src/portfolio/server.ts"));
  return { args: i >= 0 ? strings.slice(i + 1) : [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd = "status", ...rest] = process.argv.slice(2);
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(serviceUsage());
    process.exit(0);
  }
  if (!SERVICE_COMMANDS.some((c) => c.name === cmd)) {
    process.stderr.write(`unknown command ${cmd}; npm run account:service takes: ${SERVICE_COMMANDS.map((c) => c.name).join(", ")}\n`);
    process.exit(2);
  }
  const p = plan(rest);
  if (cmd === "install") {
    if (process.platform !== "darwin") throw new Error("this installs a macOS LaunchAgent: on another system run `npm run account` under its own service manager");
    // the server's options are checked here, before they are written into launchd: the server would refuse them and never start
    const refused = checkServerArgs(rest);
    if (refused) {
      process.stderr.write(`${refused}\n`);
      process.exit(2);
    }
    mkdirSync(dirname(p.log), { recursive: true, mode: 0o700 });
    mkdirSync(dirname(p.path), { recursive: true });
    // a running copy of an earlier install is taken out first: one service, one port — and waited for, since launchd answers bootout
    // before the copy has left (untilGone): a bootstrap inside that moment fails with "Input/output error", and is then tried again
    launchctl(["bootout", `${domain()}/${LABEL}`], true);
    if (!untilGone(loaded)) throw new Error(`the running copy of ${LABEL} has not stopped in 30 s: npm run account:service -- status, and install again once it has`);
    writeFileSync(p.path, p.plist, { mode: 0o644 });
    tryAgain(() => launchctl(["bootstrap", domain(), p.path]), { again: stillLeaving });
    launchctl(["enable", `${domain()}/${LABEL}`], true);
    console.log(`installed: ${p.path}\n  runs: npm run account -- ${rest.join(" ") || "(no options)"} — at login, and again if it stops by accident\n  log: ${p.log} (only you can read it)\n  the account is at http://127.0.0.1:${portOf(rest)} · npm run account:service -- status`);
  } else if (cmd === "uninstall") {
    launchctl(["bootout", `${domain()}/${LABEL}`], true);
    rmSync(p.path, { force: true });
    console.log(`uninstalled: the account no longer runs in the background (its ledgers and keys are untouched in ${defaultHome()})`);
  } else if (cmd === "restart") {
    launchctl(["kickstart", "-k", `${domain()}/${LABEL}`]);
    console.log("restarted: it continues the account from its ledgers (owner, venues, agents and limits come back)");
  } else if (cmd === "logs") {
    for (const f of [p.log, p.errLog]) if (existsSync(f)) console.log(`== ${f}\n${readFileSync(f, "utf8").split("\n").slice(-40).join("\n")}`);
  } else if (cmd === "code") {
    // the code of the run that is up now, and only while no browser owns the account: a code already used, or an earlier run's, is not shown —
    // and the last one this run said (the last device signed out: a new code replaced the one it started with)
    const port = portOf(installed()?.args ?? rest);
    const owners = await ownerCount(port);
    if (owners === undefined) console.log(`the account is not answering on ${port} yet: give it a few seconds (npm run account:service -- status)`);
    else if (owners > 0) console.log("no pairing code is needed: the account already has its owner's browser");
    else {
      const line = codeLine(existsSync(p.log) ? readFileSync(p.log, "utf8") : "");
      console.log(line ?? "no pairing code in this run's log: npm run account:service -- logs");
    }
  } else {
    const info = launchctl(["print", `${domain()}/${LABEL}`], true);
    const state = /state = (\w+)/.exec(info)?.[1];
    const pid = /pid = (\d+)/.exec(info)?.[1];
    const args = installed()?.args ?? rest;
    const port = portOf(args);
    console.log(info ? `${LABEL}: ${state ?? "loaded"}${pid ? ` (pid ${pid})` : ""} · ${(await answers(port)) ? `answering at http://127.0.0.1:${port}` : `not answering on ${port} yet`}` : `${LABEL}: not installed (npm run account:service -- install --live-cap 20)`);
  }
}
