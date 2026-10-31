/** THE BLACK BOX: every round trip a paper account closes (live/trips.ts), one line of <home>/journal/trades.jsonl — never cut. The desk's
 * record keeps its last 400 leads, its room its last 3,000 lines, a paper book its last 500 fills; this keeps every trade, with who opened
 * it, who closed it and, for the desk's lead, why: what the debrief reads to learn from what lost.
 *
 * A line is the trip — its market, side, entry and exit, the most it held, gross, fees, funding, net, the furthest the price went against it
 * and for it (MAE, MFE), how it ended — with the venue, the hands that opened and closed it (the owner, an agent by its name, the desk's
 * seat by its role, or the venue itself: a bracket's exit, a liquidation, a settlement) and the desk's lead where one placed it (its thesis,
 * Search's confidence, Risk's reason and plan, why it was closed). The service writes it as the paper book tells the trip closed
 * (service.ts journalTrip).
 *
 * Hash-chained as the account's ledger is (agent/ledger.ts): each line's hash covers the one before it, so a line taken out or changed is
 * seen. A line is chained to the last one ON DISK, read from the end of the file: an append costs the same however long the journal is.
 * The user's alone (0600 in a 0700 directory, core/jsonl.ts). */
import { appendFileSync, closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { canonical, sha256 } from "../../core/hash.ts";
import { appendJsonl } from "../../core/jsonl.ts";
import type { ClosedTrip } from "../live/trips.ts";

const GENESIS = "0".repeat(64);
const TAIL_CHUNK = 16 * 1024;

export const journalPath = (home: string): string => join(home, "journal", "trades.jsonl");

/** who opened or closed a trade: the owner, an agent by its name, the desk's house seat by its role, or the venue itself (a paper account's
 * bracket exit, a liquidation, a settlement — or an order the account has no record of) */
export interface TradeHand {
  who: "owner" | "agent" | "desk" | "venue";
  name?: string | undefined;
  address?: string | undefined;
  role?: string | undefined;
}

/** the desk's lead a trade was: its words, Search's confidence, Risk's reason, plan and hard checks, and why the desk closed it where it did */
export interface TradeLead {
  id: string;
  thesis: string;
  confidence?: number | undefined;
  cleared?: string | undefined;
  sizeUsd?: number | undefined;
  tpPct?: number | undefined;
  slPct?: number | undefined;
  maxHours?: number | undefined;
  exitWhy?: string | undefined;
  checks?: { spreadPct: number | null; maxSizeUsd: number; lossRoomUsd: number; minNotionalUsd: number | null; changePct24h?: number | null | undefined; fundingPctDay?: number | null | undefined; volumeUsd24h?: number | null | undefined } | undefined;
  /** the desk's version the lead was found under (desk.ts DeskVersion) */
  version?: number | undefined;
}

/** one trade as the journal keeps it */
export interface JournalTrade extends ClosedTrip {
  venue: string;
  venueName: string;
  paper: true;
  by: TradeHand;
  closedBy: TradeHand;
  lead?: TradeLead | undefined;
}
export type JournalRow = JournalTrade & { v: 1; seq: number; ts: string; prev: string; hash: string };

/** a line as a backtest's run keeps it (backtest/desk.ts): the trade and the lead that placed it, without the chain and the hands (a desk's
 * run is all the desk's) */
export function tripOfRow(row: JournalRow): ClosedTrip & { lead?: TradeLead | undefined } {
  const { v: _v, seq: _seq, ts: _ts, prev: _prev, hash: _hash, venue: _venue, venueName: _name, paper: _paper, by: _by, closedBy: _closedBy, ...trip } = row;
  return trip;
}

/** THE JOURNAL as it is on disk, its chain checked from the first line: the lines up to the first that breaks it, and where and why it broke */
export function readJournal(home: string): { rows: JournalRow[]; intact: boolean; brokenAt?: number | undefined; why?: string | undefined } {
  const f = journalPath(home);
  if (!existsSync(f)) return { rows: [], intact: true };
  const lines = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
  const rows: JournalRow[] = [];
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let row: JournalRow;
    try {
      row = JSON.parse(lines[i]!) as JournalRow;
    } catch {
      return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} is not JSON` };
    }
    const { hash, ...rest } = row;
    if (rest.seq !== i + 1) return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} says it is line ${String(rest.seq)}` };
    if (rest.prev !== prev) return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} does not follow the line before it` };
    if (sha256(prev + canonical(rest)) !== hash) return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} is not what was written` };
    rows.push(row);
    prev = hash;
  }
  return { rows, intact: true };
}

/** the last line of a file, read from its end a chunk at a time (bytes joined before they are read as text, so a character split across two
 * chunks stays whole), and whether the file ends its last line; undefined for a file empty or missing */
function lastLine(file: string): { line: string; ended: boolean } | undefined {
  let fd: number;
  try {
    fd = openSync(file, "r");
  } catch {
    return undefined;
  }
  try {
    let end = fstatSync(fd).size;
    let tail = Buffer.alloc(0);
    while (end > 0) {
      const n = Math.min(TAIL_CHUNK, end);
      const chunk = Buffer.alloc(n);
      readSync(fd, chunk, 0, n, end - n);
      end -= n;
      tail = Buffer.concat([chunk, tail]);
      const whole = tail.toString("utf8");
      const text = whole.replace(/\n+$/, "");
      const at = text.lastIndexOf("\n");
      if (at >= 0 || end === 0) return text.slice(at + 1) ? { line: text.slice(at + 1), ended: whole.endsWith("\n") } : undefined;
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** one trade more, chained to the last line on disk (read again now: another process may have written since). A last line that does not
 * read — the process died writing it — is ended where it stops, counted from the whole file and chained to as text, and readJournal says
 * where the chain broke; the line written after it is whole */
export function appendTrade(home: string, trade: JournalTrade, now: number): JournalRow {
  const f = journalPath(home);
  let prev = GENESIS;
  let seq = 0;
  const last = lastLine(f);
  if (last !== undefined) {
    try {
      const row = JSON.parse(last.line) as { seq?: unknown; hash?: unknown };
      if (typeof row.seq !== "number" || typeof row.hash !== "string") throw new Error("no seq or hash");
      seq = row.seq;
      prev = row.hash;
    } catch {
      seq = readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).length;
      prev = sha256(last.line);
    }
    if (!last.ended) appendFileSync(f, "\n");
  }
  const unhashed = { v: 1 as const, seq: seq + 1, ts: new Date(now).toISOString(), prev, ...trade };
  const row = { ...unhashed, hash: sha256(prev + canonical(unhashed)) } as JournalRow;
  appendJsonl(f, row);
  return row;
}
