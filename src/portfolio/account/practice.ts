/** THE SIMULATOR — a past day played back BLIND, ten to fifty times faster than it happened, for the owner to trade with the same ticket, the
 * same door and the same journal as their paper trading, and scored at the bell beside chance, holding the market, and the desk.
 *
 * THE DAY. Picked at random by the account, never by the owner: for PRACTICE a day of the two years before the lab's holdout (backtest/lab.ts
 * — the data strategies are tried on), for an EXAM a whole day of the holdout itself, up to yesterday: the held-out data is the exam, and a day
 * seen is a day spent. No day another session played is picked again, practice or exam. Its minute bars are Coinbase Exchange's — the coin's
 * USD pair — since a perpetual's minutes are nowhere to be read without a key once they are old (Hyperliquid keeps its latest 5,000), from
 * two days before it, shown as the context a trader opens the screen to, to its end.
 *
 * BLIND. What a trader could tell the day by is taken away until the bell:
 *   the date    the bars are moved by whole weeks onto THE PRACTICE CALENDAR, the n-th session in the n-th week from Monday 1 January 2001:
 *               the weekday and the time of day are the day's own, the date is the calendar's, wherever the account writes it — the
 *               orders, the fills, the journal
 *   the price   rebased so that the session opens at 100: every price times one factor and the volumes divided by it, so the dollars
 *               traded — the depth of the book the paper account walks — are the day's own
 *   the coin    named by the session: P7-PERP is the seventh session's market
 * It is traded as a PERPETUAL without funding — long or short, up to 10× — at the paper account's own fee and rule for a fill: the minutes
 * are a coin's spot prices, and no perpetual's funding of that day is in them. A minute in which nothing traded (Coinbase writes no bar
 * for it) is a flat bar at the close before it.
 *
 * THE CLOCK. The practice account runs on a clock of its own: `speed` times the account's own clock while it runs (10× to 50× — a day in
 * 2 h 24 min down to 29 min), still while it is paused, never past the session's end. A session starts paused, so the owner reads the two
 * days before it first. The paper account judges the time between two looks against the minute bars, as a backtest's does (live/paper.ts
 * bars): a stop or a limit a minute reached filled in that minute.
 *
 * THE BELL. At the session's end its open orders are canceled and its positions closed at the last price, by the venue; then the score:
 *   you       the session's trades as the journal keeps them: the net, the trades, the wins, the result in R and the stops kept
 *   chance    1,000 random entries with your trades' count, sides and holding times, on the same minutes (backtest/screen.ts baselineOf):
 *             where yours rank among them — the tries themselves kept for the license (<home>/practice/tries/<id>.json, account/license.ts)
 *   holding   the market bought at the session's first ask and sold at its last bid, the fee paid both ways
 *   the desk  the account's desk (the momentum script for a brain: backtest/desk.ts) over the same bars, folded to five minutes, with the
 *             same money
 * and the day, the coin and the factor are told. The practice record, <home>/practice/sessions.jsonl, is hash-chained like the journal: a
 * row when a session starts — its day spent from then, whatever becomes of it — and a row with its score when it ends.
 *
 * Nothing here reads the network or a clock: the service loads the bars, keeps the session and runs the desk. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonical, sha256 } from "../../core/hash.ts";
import { appendJsonl } from "../../core/jsonl.ts";
import { baselineOf, screenCosts, tapeOf, tradesOf, type Baseline } from "../backtest/screen.ts";
import type { BacktestCosts, BacktestMarket } from "../backtest/source.ts";
import { PAPER_FEE_BPS } from "../live/paper.ts";
import type { Candle } from "../live/trade.ts";
import type { ClosedTrip } from "../live/trips.ts";
import type { JournalRow } from "./journal.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const GENESIS = "0".repeat(64);

/** the practice account's venue id and connector: one of its kind on an account */
export const PRACTICE_VENUE = "practice";
export const PRACTICE_CONNECTOR = "live:practice";
/** the speeds a session runs at, times the account's own clock */
export const PRACTICE_SPEEDS: readonly number[] = [10, 20, 30, 50];
/** the coins a day is picked from: Coinbase Exchange's USD pairs with years of minute bars */
export const PRACTICE_COINS: readonly string[] = ["BTC", "ETH", "SOL", "XRP", "DOGE", "LTC", "LINK", "AVAX"];
export const PRACTICE_COINS_DEFAULT: readonly string[] = ["BTC", "ETH", "SOL"];
/** practice days: the two years before the holdout */
export const PRACTICE_TRAIN_DAYS = 730;
/** the days shown before the session's start */
export const PRACTICE_CONTEXT_DAYS = 2;
/** where the session opens, rebased */
export const PRACTICE_OPEN = 100;
export const PRACTICE_LEVERAGE = 10;
export const PRACTICE_CASH_DEFAULT = 10_000;
const CASH_LEAST = 100;
const CASH_MOST = 10_000_000;
/** Monday 1 January 2001, 00:00 UTC: the practice calendar's first week */
export const PRACTICE_EPOCH = Date.UTC(2001, 0, 1);
/** the share of a session's minutes Coinbase must have a bar for, else another day is picked */
export const PRACTICE_BARS_LEAST = 0.9;
/** the book a practice market's orders meet (backtest/source.ts): a tight spread, and the levels holding what the minute before traded —
 * a practice is about when and why, not about moving a thin market */
export const PRACTICE_COSTS: Readonly<BacktestCosts> = { halfSpreadBps: 1, participation: 1, levelBps: 2, levels: 5 };
/** the desk's bar over a session's minutes */
export const PRACTICE_DESK_MINUTES = 5;

export type PracticeWindow = "train" | "exam";

/** what the owner asks for when they start a session (setPractice change "start") */
export interface PracticeAsk {
  coins: string[];
  cashUsd: number;
  speed: number;
  /** how much of the day, from 00:00 UTC */
  hours: number;
  exam: boolean;
}
const ASK_FIELDS = ["coins", "cash", "speed", "hours", "exam"] as const;
const named = (k: string): string => (/^[A-Za-z_]\w{0,30}$/.test(k) ? `"${k}"` : "a field it was sent");

/** A SESSION ASKED FOR, read strictly: JSON of its own fields and no other — the coins (from PRACTICE_COINS), the paper money, the speed
 * (PRACTICE_SPEEDS), the hours of the day (1 to 24) and whether it is an exam. The ask, or why not */
export function parsePracticeAsk(value: string): PracticeAsk | string {
  let b: unknown;
  try {
    b = JSON.parse(value || "{}");
  } catch {
    return `a session is asked as JSON: {${ASK_FIELDS.join(", ")}}`;
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return `a session is asked as JSON: {${ASK_FIELDS.join(", ")}}`;
  const o = b as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !(ASK_FIELDS as readonly string[]).includes(k));
  if (extra !== undefined) return `a session is asked with ${ASK_FIELDS.join(", ")} only, not ${named(extra)}`;
  const coins = o.coins === undefined ? [...PRACTICE_COINS_DEFAULT] : Array.isArray(o.coins) ? o.coins.map((c) => String(c).trim().toUpperCase()) : null;
  if (!coins || !coins.length || coins.length > PRACTICE_COINS.length || coins.some((c) => !PRACTICE_COINS.includes(c)) || new Set(coins).size !== coins.length) return `the coins are some of ${PRACTICE_COINS.join(", ")}, each once`;
  const cashUsd = o.cash === undefined ? PRACTICE_CASH_DEFAULT : Number(o.cash);
  if (!Number.isFinite(cashUsd) || cashUsd < CASH_LEAST || cashUsd > CASH_MOST) return `the paper money is $${CASH_LEAST} to $${CASH_MOST.toLocaleString("en-US")}`;
  const speed = o.speed === undefined ? 20 : Number(o.speed);
  if (!PRACTICE_SPEEDS.includes(speed)) return `the speed is ${PRACTICE_SPEEDS.join(", ")} times`;
  const hours = o.hours === undefined ? 24 : Number(o.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) return "the hours are a whole number, 1 to 24, from the day's 00:00 UTC";
  if (o.exam !== undefined && typeof o.exam !== "boolean") return "exam is true or false";
  return { coins, cashUsd: Math.round(cashUsd * 100) / 100, speed, hours, exam: o.exam === true };
}

const dayText = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

/** THE DAYS A SESSION MAY BE PICKED FROM, oldest first (see the top of this file): practice — the PRACTICE_TRAIN_DAYS before the holdout's
 * start, a day whose minutes all end before it; an exam — the holdout's whole days up to yesterday (UTC). Never a day already spent */
export function practiceDays(o: { holdoutStart: number; now: number; exam: boolean; used: ReadonlySet<string> }): string[] {
  const out: string[] = [];
  const from = o.exam ? dayStart(o.holdoutStart) : dayStart(o.holdoutStart) - PRACTICE_TRAIN_DAYS * DAY_MS;
  const to = o.exam ? dayStart(o.now) : dayStart(o.holdoutStart);
  for (let d = from; d + DAY_MS <= to; d += DAY_MS) {
    const t = dayText(d);
    if (!o.used.has(t)) out.push(t);
  }
  return out;
}

/** a day and a coin, drawn with `random` (0 ≤ x < 1) */
export function pickPractice(days: readonly string[], coins: readonly string[], random: () => number): { day: string; coin: string } | undefined {
  if (!days.length || !coins.length) return undefined;
  const at = (n: number): number => Math.min(n - 1, Math.floor(random() * n));
  return { day: days[at(days.length)]!, coin: coins[at(coins.length)]! };
}

/** where the n-th session's day starts on the practice calendar: the n-th week from PRACTICE_EPOCH, on the real day's own weekday */
export function practiceDayStart(n: number, day: string): number {
  const real = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(real).getUTCDay() + 6) % 7;
  return PRACTICE_EPOCH + (n - 1) * WEEK_MS + weekday * DAY_MS;
}

const round = (x: number, places: number): number => Number(x.toFixed(places));

/** A SESSION'S MARKET: the day's minute bars rebased, moved onto the practice calendar and named by the session, with the bell's minute after
 * its last — or why the day will not do (too few of its minutes have a bar). `bars` are the real minutes from PRACTICE_CONTEXT_DAYS before
 * the day to the session's end */
export function practiceMarket(o: { coin: string; bars: readonly Candle[]; day: string; n: number; hours: number }): { market: BacktestMarket; scale: number; shiftMs: number; from: number; to: number } | string {
  const start = Date.parse(`${o.day}T00:00:00Z`);
  const end = start + o.hours * HOUR_MS;
  const first = start - PRACTICE_CONTEXT_DAYS * DAY_MS;
  const real = o.bars.filter((b) => b.t >= first && b.t < end && b.t % MINUTE_MS === 0 && b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0).sort((a, b) => a.t - b.t);
  const inSession = real.filter((b) => b.t >= start).length;
  const minutes = (end - start) / MINUTE_MS;
  if (inSession < minutes * PRACTICE_BARS_LEAST) return `${o.coin} on ${o.day}: ${inSession} of the session's ${minutes} minutes have a bar`;
  const opening = real.find((b) => b.t >= start);
  if (!opening) return `${o.coin} on ${o.day}: no bar at the session's start`;
  const scale = PRACTICE_OPEN / opening.o;
  const shiftMs = practiceDayStart(o.n, o.day) - start;
  // every minute from the first bar on: a minute without a bar is flat at the close before it, its volume unknown
  const by = new Map(real.map((b) => [b.t, b] as const));
  const bars: Candle[] = [];
  let last: Candle | undefined;
  for (let t = real[0]!.t; t < end; t += MINUTE_MS) {
    const b = by.get(t);
    const px = (x: number): number => round(x * scale, 6);
    if (b) {
      last = b;
      bars.push({ t: t + shiftMs, o: px(b.o), h: px(b.h), l: px(b.l), c: px(b.c), ...(b.v !== undefined && Number.isFinite(b.v) ? { v: round(b.v / scale, 6) } : {}) });
    } else if (last) {
      const c = round(last.c * scale, 6);
      bars.push({ t: t + shiftMs, o: c, h: c, l: c, c });
    }
  }
  // the bell's minute after the session's last: flat at its last close, the price the bell closes what is open at
  const close = bars[bars.length - 1]!.c;
  bars.push({ t: end + shiftMs, o: close, h: close, l: close, c: close });
  const base = `P${o.n}`;
  const market: BacktestMarket = {
    symbol: `${base}-PERP`,
    kind: "perp",
    base,
    quote: "USD",
    name: `Practice market ${o.n}`,
    from: "A day of a coin's minutes, rebased (practice)",
    interval: "1m",
    bars,
    maxLeverage: PRACTICE_LEVERAGE,
    qtyStep: 0.001,
    minQty: 0.001,
    priceStep: 0.01,
    minNotional: 10,
  };
  return { market, scale, shiftMs, from: start + shiftMs, to: end + shiftMs };
}

/** THE PRACTICE CLOCK: where it stood (`at`, practice ms) at the account's moment `realAt`, and whether it runs, at what speed */
export interface PracticeClock {
  at: number;
  realAt: number;
  running: boolean;
  speed: number;
}
/** the practice clock at the account's moment `realNow`, never past `end` */
export function clockAt(c: PracticeClock, realNow: number, end: number): number {
  if (!c.running) return Math.min(c.at, end);
  return Math.min(end, c.at + Math.max(0, realNow - c.realAt) * c.speed);
}
/** the clock started, stopped or set to another speed at `realNow`: from where it stands then */
export function clockMoved(c: PracticeClock, realNow: number, end: number, change: { running?: boolean | undefined; speed?: number | undefined }): PracticeClock {
  return { at: clockAt(c, realNow, end), realAt: realNow, running: change.running ?? c.running, speed: change.speed ?? c.speed };
}

/** what a session is, as the service keeps it (<home>/practice/session.json): the day, the coin and the factor are told only at the bell */
export interface PracticeSession {
  v: 1;
  id: string;
  n: number;
  window: PracticeWindow;
  day: string;
  coin: string;
  scale: number;
  shiftMs: number;
  symbol: string;
  /** the session's start and end on the practice clock, ms */
  from: number;
  to: number;
  hours: number;
  cashUsd: number;
  clock: PracticeClock;
  /** when it was started and ended, on the account's clock (ISO) */
  startedAt: string;
  endedAt?: string | undefined;
  /** how it ended: its clock reached its end, or the owner ended it */
  end?: "bell" | "owner" | undefined;
  score?: PracticeScore | undefined;
}

/** the session's id: its number and a hash of what was drawn */
export function practiceId(n: number, day: string, coin: string, at: string): string {
  return `s${n}-${createHash("sha256").update(`${n}|${day}|${coin}|${at}`).digest("hex").slice(0, 8)}`;
}

// ---- the score ----

/** what the session's trades came to, as the journal keeps them */
export interface PracticeYou {
  trades: number;
  wins: number;
  losses: number;
  netUsd: number;
  /** of the session's money */
  netPct: number;
  feesUsd: number;
  /** the trades that carried a plan, their mean result in R where their risk was said, and how many lost more than it */
  planned: number;
  rMean?: number | undefined;
  pastStop: number;
}
export interface PracticeScore {
  you: PracticeYou;
  /** `kept`: the hash of the session's tries as its bell kept them for the license (KeptTries) */
  chance?: (Pick<Baseline, "trades" | "monkeys" | "ownPct" | "medianPct" | "lowPct" | "highPct" | "rank" | "p" | "verdict" | "words"> & { kept?: string | undefined }) | undefined;
  hold: { netUsd: number; netPct: number };
  /** `open`: the desk ended its run holding a position, marked at the last price (a run does not close what it holds at its end) */
  desk?: { netUsd: number; netPct: number; trades: number; fills: number; open?: boolean | undefined } | { error: string } | undefined;
  /** told at the bell */
  reveal: { day: string; coin: string; scale: number; window: PracticeWindow };
}

/** a trade's risk in dollars as its plan says it — its 1R, else its stop's distance on what it held (the license reads it too) */
export function riskOf(t: Pick<JournalRow, "plan" | "entryPrice" | "qty">): number | undefined {
  const p = t.plan;
  if (!p) return undefined;
  if (p.riskUsd !== undefined && p.riskUsd > 0) return p.riskUsd;
  if (p.stop !== undefined && p.stop > 0 && t.qty > 0) {
    const r = Math.abs(t.entryPrice - p.stop) * t.qty;
    return r > 0 ? r : undefined;
  }
  return undefined;
}

/** YOUR SIDE OF THE SCORE: the session's trades (journal rows) over its money */
export function youOf(rows: ReadonlyArray<Pick<JournalRow, "netUsd" | "feesUsd" | "grossUsd" | "plan" | "entryPrice" | "qty">>, cashUsd: number): PracticeYou {
  let net = 0;
  let fees = 0;
  let wins = 0;
  let losses = 0;
  let planned = 0;
  let pastStop = 0;
  let rSum = 0;
  let rN = 0;
  for (const t of rows) {
    net += t.netUsd;
    fees += t.feesUsd;
    if (t.netUsd > 0) wins++;
    else if (t.netUsd < 0) losses++;
    if (t.plan) planned++;
    const risk = riskOf(t);
    if (risk !== undefined) {
      rSum += t.netUsd / risk;
      rN++;
      if (t.grossUsd < -1.05 * risk) pastStop++;
    }
  }
  return { trades: rows.length, wins, losses, netUsd: round(net, 2), netPct: round(cashUsd > 0 ? (net / cashUsd) * 100 : 0, 4), feesUsd: round(fees, 2), planned, ...(rN ? { rMean: round(rSum / rN, 3) } : {}), pastStop };
}

/** HOLDING THE MARKET the whole session: bought at its first minute's ask, sold at its last minute's bid, the paper fee both ways */
export function holdOf(m: BacktestMarket, from: number, to: number, cashUsd: number, costs: Pick<BacktestCosts, "halfSpreadBps"> = PRACTICE_COSTS, feeBps = PAPER_FEE_BPS): { netUsd: number; netPct: number } {
  const bars = m.bars.filter((b) => b.t >= from && b.t < to);
  if (!bars.length) return { netUsd: 0, netPct: 0 };
  const half = costs.halfSpreadBps / 10_000;
  const fee = feeBps / 10_000;
  const buy = bars[0]!.o * (1 + half);
  const sell = bars[bars.length - 1]!.c * (1 - half);
  const pct = ((sell * (1 - fee)) / (buy * (1 + fee)) - 1) * 100;
  return { netUsd: round((cashUsd * pct) / 100, 2), netPct: round(pct, 4) };
}

function baselineAt(m: BacktestMarket, from: number, to: number, trips: ReadonlyArray<ClosedTrip>, seed: string, costs: Pick<BacktestCosts, "halfSpreadBps">, feeBps: number, keep: boolean): Baseline | undefined {
  const tapes = [tapeOf(m, from, to)];
  return baselineOf({ tapes, trades: tradesOf(trips, tapes), costs: screenCosts(feeBps, costs.halfSpreadBps), seed, keep });
}
const chancePart = (b: Baseline): NonNullable<PracticeScore["chance"]> => ({ trades: b.trades, monkeys: b.monkeys, ownPct: b.ownPct, medianPct: b.medianPct, lowPct: b.lowPct, highPct: b.highPct, rank: b.rank, p: b.p, verdict: b.verdict, words: b.words });

/** CHANCE: random entries beside yours — as many trades, on the same sides, each held as long as yours was, on the session's minutes
 * (backtest/screen.ts). None where you made no trade */
export function chanceOf(m: BacktestMarket, from: number, to: number, trips: ReadonlyArray<ClosedTrip>, seed: string, costs: Pick<BacktestCosts, "halfSpreadBps"> = PRACTICE_COSTS, feeBps = PAPER_FEE_BPS): PracticeScore["chance"] {
  const b = baselineAt(m, from, to, trips, seed, costs, feeBps, false);
  return b ? chancePart(b) : undefined;
}

/** CHANCE AT THE BELL, and its tries kept for the license: the session's id is the seed, and the score's chance carries the tries' hash */
export function chanceKept(m: BacktestMarket, from: number, to: number, trips: ReadonlyArray<ClosedTrip>, id: string, costs: Pick<BacktestCosts, "halfSpreadBps"> = PRACTICE_COSTS, feeBps = PAPER_FEE_BPS): { chance: NonNullable<PracticeScore["chance"]>; tries: KeptTries } | undefined {
  const b = baselineAt(m, from, to, trips, id, costs, feeBps, true);
  if (!b) return undefined;
  const tries: KeptTries = { v: 1, id, trades: b.trades, ownPct: b.ownPct, means: b.means ?? [] };
  return { chance: { ...chancePart(b), kept: triesHash(tries) }, tries };
}

const money = (n: number): string => `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, places = 2): string => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(places)}%`;

/** THE SCORE IN WORDS, a line each */
export function scoreWords(s: PracticeScore): string[] {
  const y = s.you;
  const lines = [y.trades ? `You: ${money(y.netUsd)} (${pct(y.netPct)}) in ${y.trades} trade${y.trades === 1 ? "" : "s"}, ${y.wins} won${y.rMean !== undefined ? ` · ${y.rMean >= 0 ? "+" : "−"}${Math.abs(y.rMean).toFixed(2)} R a trade` : ""}${y.pastStop ? ` · ${y.pastStop} lost more than the plan's 1R` : ""}` : "You made no trade."];
  if (s.chance) lines.push(`Chance: your entries beat ${Math.round(s.chance.rank * 100)}% of ${s.chance.monkeys.toLocaleString("en-US")} random ones with your sides and holding times (theirs: ${pct(s.chance.medianPct, 3)} a trade in the middle, yours ${pct(s.chance.ownPct, 3)}) — ${s.chance.verdict === "few" ? "too few trades to say" : s.chance.verdict === "better" ? "better than chance" : s.chance.verdict === "worse" ? "worse than chance" : "no better than chance"}.`);
  lines.push(`Holding the market all session: ${money(s.hold.netUsd)} (${pct(s.hold.netPct)}).`);
  if (s.desk && "error" in s.desk) lines.push(`The desk: not run — ${s.desk.error}`);
  else if (s.desk) lines.push(`The desk (the momentum script, five-minute bars): ${money(s.desk.netUsd)} (${pct(s.desk.netPct)}) in ${s.desk.trades} closed trade${s.desk.trades === 1 ? "" : "s"}${s.desk.open ? ", and a position still open at the end, marked at its last price" : ""}.`);
  else lines.push("The desk: its run over the same bars is under way.");
  return lines;
}

// ---- the record ----

export const practiceDir = (home: string): string => join(home, "practice");
export const practiceLedgerPath = (home: string): string => join(practiceDir(home), "sessions.jsonl");
export const practiceSessionPath = (home: string): string => join(practiceDir(home), "session.json");
/** the session's market, as it is traded: rebased, on the practice calendar */
export const practiceBarsPath = (home: string): string => join(practiceDir(home), "bars.json");
/** a session's id as practiceId makes it: the only names a session's kept tries are read or written under */
const SESSION_ID = /^s\d{1,6}-[0-9a-f]{8}$/;
export const practiceTriesPath = (home: string, id: string): string => join(practiceDir(home), "tries", `${id}.json`);

/** a row of the practice record: a session started (its day spent), or ended with its score */
export type PracticeEntry =
  | { kind: "start"; id: string; n: number; window: PracticeWindow; day: string; coin: string; hours: number; cashUsd: number; speed: number }
  | { kind: "session"; id: string; n: number; window: PracticeWindow; day: string; coin: string; scale: number; hours: number; cashUsd: number; from: string; to: string; startedAt: string; endedAt: string; end: "bell" | "owner"; endedAtPractice: string; score: PracticeScore };
export type PracticeRow = PracticeEntry & { v: 1; seq: number; ts: string; prev: string; hash: string };

/** THE PRACTICE RECORD as it is on disk, its chain checked from the first line: the rows up to the first that breaks it */
export function readPractice(home: string): { rows: PracticeRow[]; intact: boolean; brokenAt?: number | undefined; why?: string | undefined } {
  const f = practiceLedgerPath(home);
  if (!existsSync(f)) return { rows: [], intact: true };
  const lines = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
  const rows: PracticeRow[] = [];
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let row: PracticeRow;
    try {
      row = JSON.parse(lines[i]!) as PracticeRow;
    } catch {
      return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} is not JSON` };
    }
    const { hash, ...rest } = row;
    if (rest.seq !== i + 1) return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} says it is line ${String(rest.seq)}` };
    if (rest.prev !== prev) return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} does not follow the line before it` };
    if (sha256(prev + canonical(rest)) !== hash) return { rows, intact: false, brokenAt: i + 1, why: `line ${i + 1} was changed after it was written` };
    rows.push(row);
    prev = hash;
  }
  return { rows, intact: true };
}

/** a row added to the practice record, chained to the last one */
export function appendPractice(home: string, entry: PracticeEntry, now: number): PracticeRow {
  const { rows } = readPractice(home);
  const last = rows[rows.length - 1];
  const unhashed = { v: 1 as const, seq: (last?.seq ?? 0) + 1, ts: new Date(now).toISOString(), prev: last?.hash ?? GENESIS, ...entry };
  const row = { ...unhashed, hash: sha256(unhashed.prev + canonical(unhashed)) } as PracticeRow;
  appendJsonl(practiceLedgerPath(home), row);
  return row;
}

/** the days sessions have spent (every session started), and the next session's number */
export function practiceUsed(rows: readonly PracticeRow[]): { days: Set<string>; next: number } {
  const days = new Set<string>();
  let n = 0;
  for (const r of rows) {
    if (r.kind !== "start") continue;
    days.add(r.day);
    n = Math.max(n, r.n);
  }
  return { days, next: n + 1 };
}

function writeWhole(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
}
export function writeSession(home: string, s: PracticeSession): void {
  writeWhole(practiceSessionPath(home), `${JSON.stringify(s)}\n`);
}
export function readSession(home: string): PracticeSession | undefined {
  try {
    const s = JSON.parse(readFileSync(practiceSessionPath(home), "utf8")) as PracticeSession;
    return s && s.v === 1 && typeof s.id === "string" ? s : undefined;
  } catch {
    return undefined;
  }
}
/** A SESSION'S RANDOM ENTRIES, kept at its bell for the license (account/license.ts, which pools many sessions' tries into random records
 * of all their trades): how many of the session's trades they were drawn beside, what those trades made screened as the tries were, and
 * each try's net a trade — percent, in the order drawn. The session's row in the practice record carries the hash of it (`chance.kept`): a
 * file that is not what the row says is not read */
export interface KeptTries {
  v: 1;
  id: string;
  trades: number;
  ownPct: number;
  means: number[];
}
export const triesHash = (t: KeptTries): string => sha256(canonical(t));
export function writeTries(home: string, t: KeptTries): void {
  if (!SESSION_ID.test(t.id)) throw new Error(`not a session's id: ${t.id}`);
  writeWhole(practiceTriesPath(home, t.id), `${JSON.stringify(t)}\n`);
}
/** a session's kept tries, where the file is there and is what the row's hash says */
export function readTries(home: string, id: string, kept: string): KeptTries | "missing" | "changed" {
  if (!SESSION_ID.test(id)) return "missing";
  let t: KeptTries;
  try {
    t = JSON.parse(readFileSync(practiceTriesPath(home, id), "utf8")) as KeptTries;
  } catch {
    return "missing";
  }
  return t && t.v === 1 && t.id === id && Array.isArray(t.means) && triesHash(t) === kept ? t : "changed";
}

export function writeBars(home: string, m: BacktestMarket): void {
  writeWhole(practiceBarsPath(home), `${JSON.stringify(m)}\n`);
}
export function readBars(home: string): BacktestMarket | undefined {
  try {
    const m = JSON.parse(readFileSync(practiceBarsPath(home), "utf8")) as BacktestMarket;
    return m && Array.isArray(m.bars) && typeof m.symbol === "string" ? m : undefined;
  } catch {
    return undefined;
  }
}
