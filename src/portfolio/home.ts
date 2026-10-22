/** Where the account keeps what outlives a run: ledgers, key files, seat keys, agent wallets. One place, shared by the server, the MCP seat
 * and the command lines, so that all of them find the same things. `OPENPAPER_HOME` moves it (`BUYER_HOME`, the earlier name, still does);
 * `--home` moves it for one server. */
import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** the home's folder name under the user's home directory, and the one earlier versions used */
export const HOME_NAME = ".openpaper";
export const OLD_HOME_NAME = ".buyer-agent-demo";

/** the home when --home is not given: OPENPAPER_HOME, else BUYER_HOME, else ~/.openpaper, else ~/.buyer-agent-demo where an earlier version
 * left one (the account goes on using it, and says so at start: homeNote), else ~/.openpaper. Never moved by the account itself: the
 * service carries the home's path, and a move under a running account would cut its ledger chain */
export function defaultHome(env: Record<string, string | undefined> = process.env, userHome: string = homedir(), exists: (p: string) => boolean = existsSync): string {
  const named = env.OPENPAPER_HOME || env.BUYER_HOME;
  if (named) return named;
  const fresh = join(userHome, HOME_NAME);
  const old = join(userHome, OLD_HOME_NAME);
  if (exists(fresh)) return fresh;
  if (exists(old)) return old;
  return fresh;
}

/** the line the server prints once when the home is the earlier name's, with the move it suggests */
export function homeNote(home: string): string | undefined {
  if (!home.endsWith(OLD_HOME_NAME)) return undefined;
  const to = join(dirname(home), HOME_NAME);
  return `home: ${home} — the earlier name. To move it: stop the account (and uninstall the service), mv ${home} ${to}, then start it again (and install the service again)`;
}

/** a terminal demo's home: a fresh folder of its own under the system's temp dir, every time. Never the account's home — and never
 * `OPENPAPER_HOME` either, which names that home: a demo starts its ledger over, and a fresh-start ledger in the account's own home would end
 * the chain the running account restores from, and land on its statement beside the real venues' lines. `--home` is the one way to put a
 * demo somewhere else, and each demo reads that flag itself before asking here */
export const demoHome = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));
