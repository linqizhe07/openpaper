/** ONE ARCHIVE OF THE HOME, for the user alone: everything the account keeps there — the ledgers, the venue key files, the seat keys, the
 * agent wallets, the paper books, the desk, the memories — except the logs. The one thing it cannot hold is the owner's key, which lives in
 * the browser and cannot be exported: a restored home is restored with the same browser, or paired again with the code the next start prints.
 *
 *   npm run account:backup                        writes ~/openpaper-backup-<today>.tgz, readable by you alone (0600)
 *   npm run account:backup -- --out <file>        writes it there instead
 *   npm run account:backup -- --home <dir>        the home to archive (default $BUYER_HOME or ~/.buyer-agent-demo)
 *
 * To restore: unpack it somewhere and start the account there — `npm run account -- --home <that folder>` — or, with the account and its
 * service stopped, unpack it over the home. The archive holds your venue keys: keep it where only you can read it, and off shared drives.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Flag, parseFlags } from "./cli.ts";
import { defaultHome } from "./home.ts";

export const BACKUP_FLAGS: readonly Flag[] = [
  { name: "home", value: "dir", help: "the home to archive", default: "$BUYER_HOME, else ~/.buyer-agent-demo" },
  { name: "out", value: "dir", help: "the archive to write", default: "~/openpaper-backup-<today>.tgz" },
  { name: "help", help: "this list" },
];
export const BACKUP_USAGE = { command: "npm run account:backup --", intro: "One archive of the home — ledgers, key files, seats, agent wallets, paper books, desk, memories — for you alone.", env: false };

/** what the home's folders hold, in the words the archive is described with */
export const FOLDERS: ReadonlyArray<{ dir: string; holds: string }> = [
  { dir: "portfolio", holds: "the ledgers (every signed instruction, order, fill and payment) and the net worth history" },
  { dir: "credentials", holds: "venue key files, and model keys pasted on the page" },
  { dir: "seats", holds: "agent seats' own keys" },
  { dir: "agent-wallets", holds: "agent wallets' keys" },
  { dir: "paper", holds: "paper accounts' books" },
  { dir: "desk", holds: "the desk and its room" },
  { dir: "memory", holds: "what agents remember about you" },
];

/** the archive's name for today */
export const defaultOut = (today = new Date()): string => join(homedir(), `openpaper-backup-${today.toISOString().slice(0, 10)}.tgz`);

export interface Backup {
  out: string;
  bytes: number;
  /** the home's folders that went in, with what they hold */
  inside: Array<{ dir: string; holds: string }>;
  /** folders left out on purpose */
  leftOut: string[];
}

/** write the archive: tar, run with the user's umask set so the file is born 0600, every folder but logs */
export function backup(home: string, out: string, run: (file: string, args: string[]) => void = (f, a) => void execFileSync(f, a, { stdio: ["ignore", "pipe", "pipe"] })): Backup {
  const h = resolve(home);
  if (!existsSync(h) || !statSync(h).isDirectory()) throw new Error(`there is no home at ${h}: nothing to archive`);
  const present = readdirSync(h).filter((d) => statSync(join(h, d)).isDirectory());
  const inside = FOLDERS.filter((f) => present.includes(f.dir));
  const leftOut = present.filter((d) => d === "logs");
  const before = process.umask(0o077);
  try {
    run("tar", ["-czf", out, "-C", h, "--exclude=./logs", "."]);
  } finally {
    process.umask(before);
  }
  chmodSync(out, 0o600);
  return { out, bytes: statSync(out).size, inside, leftOut };
}

/** the sentences printed after a backup */
export function describe(b: Backup, home: string): string {
  const kb = Math.max(1, Math.round(b.bytes / 1024));
  return [
    `wrote ${b.out} (${kb} KB, readable by you alone)`,
    `  from ${home}`,
    ...b.inside.map((f) => `  · ${f.dir}/: ${f.holds}`),
    `  left out: ${b.leftOut.length ? b.leftOut.map((d) => `${d}/`).join(", ") : "nothing"}; and the owner's key, which lives in your browser and cannot be exported`,
    `  to restore: unpack it and run npm run account -- --home <that folder>, or unpack it over the home while the account is stopped`,
    `  it holds your venue keys: keep it where only you can read it, off shared drives`,
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const opts = parseFlags(process.argv.slice(2), BACKUP_FLAGS, BACKUP_USAGE);
  if (opts.kind !== "ok") {
    (opts.kind === "help" ? process.stdout : process.stderr).write(opts.kind === "help" ? opts.text : `${opts.text}\n`);
    process.exit(opts.kind === "help" ? 0 : 2);
  }
  const home = opts.get("home") ?? defaultHome();
  const b = backup(home, opts.get("out") ?? defaultOut());
  console.log(describe(b, home));
}
