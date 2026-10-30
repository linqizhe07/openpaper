/** THE RECORDINGS ON DISK (npm run account:record): what Hyperliquid's public stream said, as it said it, kept in the home for backtests
 * and research. Recording is the owner's own act — a command started at their terminal — and nothing of the page reads or writes here:
 * Markets and the charts still ask the venues when they are asked, and write nothing (live/history.ts, the owner's rule of 2026-10-16).
 *
 *   <home>/recordings/hyperliquid/
 *     raw/<COIN>/<channel>/<YYYY-MM-DD>/<HH>.jsonl   a line a message, {"r": the ms this machine received it, "d": its data as sent},
 *                                                   appended while its hour (UTC, by arrival) is under way; once the hour has ended the
 *                                                   file is gzipped to <HH>.jsonl.gz and never written again
 *     sessions/<YYYY-MM-DD>.jsonl                   the recording's own record of itself: "open" (subscribed: the coins and channels),
 *                                                   "alive" (once a minute while it carries), "close" and why — so what it covered is
 *                                                   known (coverage), and a gap is said, never filled
 *     manifest/<YYYY-MM-DD>.json                    a day: what was covered, each closed file with its lines, size and sha256, and the
 *                                                   day's bars checked against Hyperliquid's own (record/check.ts)
 *     bars/<COIN>/1m/<YYYY-MM-DD>.json              a day's one-minute bars built from its recorded trades (record/check.ts)
 *     recorder.lock                                 the recorder writing here: one at a time
 * Files are the user's alone (0600 in 0700 directories). A file is written whole to a temporary name and renamed into place — save a raw
 * hour under way, which is appended to every second or so (FLUSH: a recorder killed loses at most that much). */
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { appendJsonl } from "../../core/jsonl.ts";

export const RECORD_VENUE = "hyperliquid";
/** what is recorded of each coin: every trade, every change of the best bid and ask, the mark, oracle and funding */
export const CHANNELS = ["trades", "bbo", "activeAssetCtx"] as const;
export type Channel = (typeof CHANNELS)[number];
export const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
/** an hour's raw file is closed this long after its hour ends: what arrived in the hour is on disk by then */
export const HOUR_GRACE_MS = 5_000;

const iso = (ms: number): string => new Date(ms).toISOString();
export const dayOf = (ms: number): string => iso(ms).slice(0, 10);
export const dayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`);
export const isDay = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(dayStart(day)) && dayOf(dayStart(day)) === day;
export const recordDir = (home: string): string => join(home, "recordings", RECORD_VENUE);
export const rawFile = (home: string, coin: string, channel: Channel, at: number): string => join(recordDir(home), "raw", coin, channel, dayOf(at), `${iso(at).slice(11, 13)}.jsonl`);
export const sessionsFile = (home: string, day: string): string => join(recordDir(home), "sessions", `${day}.jsonl`);
export const manifestFile = (home: string, day: string): string => join(recordDir(home), "manifest", `${day}.json`);
export const barsFile = (home: string, coin: string, day: string): string => join(recordDir(home), "bars", coin, "1m", `${day}.json`);
export const lockFile = (home: string): string => join(recordDir(home), "recorder.lock");

/** a file written whole or not at all, the user's alone */
export function writeWhole(file: string, data: string | Buffer): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, file);
}

// ---- the sessions: what the recording covered ----

export type SessionRow =
  | { at: string; event: "open"; coins: string[]; channels: readonly string[]; continued?: true | undefined }
  | { at: string; event: "alive" }
  | { at: string; event: "close"; why: string };

export function readSessions(home: string, day: string): SessionRow[] {
  const f = sessionsFile(home, day);
  if (!existsSync(f)) return [];
  const rows: SessionRow[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as SessionRow;
      if (r && typeof r.at === "string" && (r.event === "open" || r.event === "alive" || r.event === "close")) rows.push(r);
    } catch {
      // a line cut short by a kill: the rows around it still say what was covered
    }
  }
  return rows;
}

export interface Covered {
  from: string;
  to: string;
  why: string;
}

/** WHAT THE RECORDING COVERED of a day: each session from its "open" to its "close" — or, one never closed (the recorder killed, the
 * machine turned off), to the last "alive" it wrote: what came after that is not known to be whole */
export function coverage(home: string, day: string): Covered[] {
  const out: Covered[] = [];
  let start: number | undefined;
  let seen = 0;
  const end = (at: number, why: string): void => {
    if (start !== undefined && at > start) out.push({ from: iso(start), to: iso(at), why });
    start = undefined;
  };
  for (const r of readSessions(home, day)) {
    const at = Date.parse(r.at);
    if (!Number.isFinite(at)) continue;
    if (r.event === "open") {
      end(seen, "the recorder stopped without closing it");
      start = at;
      seen = at;
    } else if (r.event === "alive") {
      if (start !== undefined) seen = Math.max(seen, at);
    } else end(at, r.why);
  }
  end(seen, "recording");
  return out;
}

// ---- the manifest: a day's files and checks ----

export interface ClosedFile {
  /** under <home>/recordings/hyperliquid, "/" between its parts */
  path: string;
  lines: number;
  bytes: number;
  sha256: string;
}
export interface DayManifest {
  version: 1;
  venue: typeof RECORD_VENUE;
  day: string;
  covered: Covered[];
  files: ClosedFile[];
  /** the day's bars checked against Hyperliquid's own, by coin (record/check.ts) */
  checks: Record<string, unknown>;
  savedAt: string;
}

/** a day's manifest — a new one where none is kept; one that does not read is kept aside, never written over */
export function readManifest(home: string, day: string): DayManifest {
  const f = manifestFile(home, day);
  if (existsSync(f)) {
    try {
      const m = JSON.parse(readFileSync(f, "utf8")) as DayManifest;
      if (m && m.version === 1 && Array.isArray(m.files)) return { ...m, covered: m.covered ?? [], checks: m.checks ?? {} };
    } catch {
      // said below
    }
    renameSync(f, `${f}.unread-${Date.now()}`);
  }
  return { version: 1, venue: RECORD_VENUE, day, covered: [], files: [], checks: {}, savedAt: "" };
}
/** a day's manifest written, its coverage read again from the sessions */
export function writeManifest(home: string, m: DayManifest, now: number): void {
  writeWhole(manifestFile(home, m.day), JSON.stringify({ ...m, covered: coverage(home, m.day), savedAt: iso(now) }, null, 1));
}

// ---- the lock: one recorder a home ----

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};
/** the recorder's lock taken (its token), or why not: another recorder whose process still runs holds it. One whose process is gone is
 * taken over */
export function takeLock(home: string): { token: string } | { error: string } {
  const f = lockFile(home);
  mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
  if (existsSync(f)) {
    const pid = Number(readFileSync(f, "utf8").split(" ")[0]);
    if (Number.isInteger(pid) && pid > 0 && alive(pid)) return { error: `a recorder is writing to ${recordDir(home)} already (process ${pid}): one at a time` };
    rmSync(f, { force: true });
  }
  const token = `${process.pid} ${randomUUID()}`;
  try {
    writeFileSync(f, token, { flag: "wx", mode: 0o600 });
  } catch {
    return { error: `another recorder took ${f} at the same moment` };
  }
  return { token };
}
export function releaseLock(home: string, token: string): void {
  const f = lockFile(home);
  if (existsSync(f) && readFileSync(f, "utf8") === token) rmSync(f, { force: true });
}

// ---- the writer ----

/** where a raw file's day and hour are: <coin>/<channel>/<day>/<HH>.jsonl */
function hourEndOf(file: string): number {
  const parts = file.split(sep);
  const day = parts[parts.length - 2]!;
  const hh = parts[parts.length - 1]!.slice(0, 2);
  return Date.parse(`${day}T${hh}:00:00Z`) + HOUR_MS;
}

/** THE RAW HOURS AND THE SESSIONS, WRITTEN (see the top of this file) */
export class RecordStore {
  /** lines waiting for the next flush, by file */
  private readonly pending = new Map<string, string[]>();
  /** the raw hours still open: written this run, or left open by an earlier one */
  private readonly open = new Set<string>();
  /** the session open now (its coins and channels), and the day its last row went to: a session that crosses midnight is closed at
   * midnight in its first day's record and opened again in the next's, so each day's record says that day's coverage alone */
  private session: { coins: string[]; channels: readonly string[] } | undefined;
  private sessionDay: string | undefined;

  constructor(readonly home: string) {}

  /** the raw hours an earlier run left open (killed in the middle of one): closed on the next look, once their hour is over */
  adoptLeftovers(): void {
    const raw = join(recordDir(this.home), "raw");
    if (!existsSync(raw)) return;
    for (const f of readdirSync(raw, { recursive: true, encoding: "utf8" })) if (f.endsWith(".jsonl")) this.open.add(join(raw, f));
  }

  /** one message, as it came: {r: when it arrived, d: its data} */
  write(coin: string, channel: Channel, at: number, data: unknown): void {
    const file = rawFile(this.home, coin, channel, at);
    let lines = this.pending.get(file);
    if (!lines) this.pending.set(file, (lines = []));
    lines.push(`${JSON.stringify({ r: at, d: data })}\n`);
    this.open.add(file);
  }

  /** what is waiting, appended to its files */
  flush(): void {
    for (const [file, lines] of this.pending) {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      appendFileSync(file, lines.join(""), { mode: 0o600 });
    }
    this.pending.clear();
  }

  /** THE HOURS THAT HAVE ENDED: each raw hour whose hour ended HOUR_GRACE_MS ago or more gzipped (never over a file already closed for
   * it), hashed and put in its day's manifest. Answers the files closed */
  closeHours(now: number): ClosedFile[] {
    this.flush();
    const closed: ClosedFile[] = [];
    const days = new Map<string, ClosedFile[]>();
    for (const file of [...this.open].sort()) {
      if (hourEndOf(file) + HOUR_GRACE_MS > now) continue;
      this.open.delete(file);
      if (!existsSync(file)) continue;
      const text = readFileSync(file);
      const gz = gzipSync(text);
      const base = `${file}.gz`;
      const target = existsSync(base) ? base.replace(/\.jsonl\.gz$/, `.${now}.jsonl.gz`) : base;
      writeWhole(target, gz);
      rmSync(file, { force: true });
      const path = relative(recordDir(this.home), target).split(sep).join("/");
      const entry: ClosedFile = { path, lines: text.toString("utf8").split("\n").filter((l) => l.trim()).length, bytes: gz.length, sha256: createHash("sha256").update(gz).digest("hex") };
      closed.push(entry);
      const day = path.split("/")[3]!;
      days.set(day, [...(days.get(day) ?? []), entry]);
    }
    for (const [day, entries] of days) {
      const m = readManifest(this.home, day);
      const paths = new Set(entries.map((e) => e.path));
      m.files = [...m.files.filter((f) => !paths.has(f.path)), ...entries].sort((a, b) => a.path.localeCompare(b.path));
      writeManifest(this.home, m, now);
    }
    return closed;
  }

  /** a row of the sessions record, in the day it happened — a session open across midnight closed at midnight in the day before and
   * opened again in this one first */
  log(row: SessionRow): void {
    const at = Date.parse(row.at);
    const day = dayOf(at);
    if (this.session && this.sessionDay && this.sessionDay < day) {
      appendJsonl(sessionsFile(this.home, this.sessionDay), { at: iso(dayStart(this.sessionDay) + DAY_MS), event: "close", why: "the day ended" } satisfies SessionRow);
      appendJsonl(sessionsFile(this.home, day), { at: iso(dayStart(day)), event: "open", coins: this.session.coins, channels: this.session.channels, continued: true } satisfies SessionRow);
    }
    appendJsonl(sessionsFile(this.home, day), row);
    if (row.event === "open") this.session = { coins: row.coins, channels: row.channels };
    else if (row.event === "close") this.session = undefined;
    this.sessionDay = day;
  }

  /** whether anything was recorded on a day */
  recorded(day: string): boolean {
    return existsSync(sessionsFile(this.home, day));
  }
}
