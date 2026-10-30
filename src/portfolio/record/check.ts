/** A RECORDED DAY'S BARS, CHECKED (npm run account:record -- --check YYYY-MM-DD, and by the running recorder once a day has ended):
 * one-minute bars built from the day's recorded trades and set beside Hyperliquid's own one-minute candles for the day.
 *
 * The bars: each trade once — a subscription's first message repeats Hyperliquid's recent trades (live/stream-hub.ts), so a trade is kept
 * by its `tid` the first time it came — in the minute of the exchange's own time, in the order they came: the first trade's price the
 * open, the highest and lowest, the last the close, the sizes summed (`v`), the trades counted (`n`), and beside them what Hyperliquid's
 * candles do not say — the size bought by takers (`buy`) and the volume-weighted price (`vwap`). A trade can arrive in the hour after its
 * own, so the hour on either side of the day is read too.
 *
 * The check: Hyperliquid's candleSnapshot (open, high, low, close, volume and `n`, its count of trades) for the day, minute by minute,
 * over the minutes the recording covered whole (record/store.ts coverage) — a minute neither side traded in matches; one that only one
 * side has, or whose figures differ, is counted and the first few said. A minute not covered whole is not compared: what was not recorded
 * is not checked, and never filled. Hyperliquid keeps its latest 5,000 one-minute candles — three and a half days — so a day is checked
 * within three of its end. The bars and the check are kept (store.ts barsFile; the day's manifest says the check). */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import type { hyperliquidInfo } from "../live/public-markets.ts";
import type { HttpReply } from "../live/types.ts";
import { no } from "../refuse.ts";
import { barsFile, coverage, DAY_MS, dayOf, dayStart, isDay, MINUTE_MS, readManifest, recordDir, writeManifest, writeWhole } from "./store.ts";

/** the one-minute candles Hyperliquid answers: its latest 5,000 */
const HL_MINUTES = 5_000;
/** the differing minutes a check says, at most */
const EXAMPLES = 5;

export interface RecordedTrade {
  tid: string;
  /** the exchange's own time, ms */
  time: number;
  px: number;
  sz: number;
  /** the taker's side: B bought, A sold */
  side: "B" | "A" | undefined;
}
export interface MinuteBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  /** the size takers bought */
  buy: number;
  vwap: number;
}
/** one of Hyperliquid's own one-minute candles, its prices as it writes them */
export interface HlMinute {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  n: number;
}
export type MinutesOf = (coin: string, from: number, to: number) => Promise<HlMinute[] | Refusal>;

export interface DayCheck {
  coin: string;
  day: string;
  /** the day's trades kept, and those that came twice (a subscription's first message) */
  trades: number;
  repeated: number;
  bars: number;
  /** the minutes the recording covered whole, compared, and how many matched */
  compared: number;
  matched: number;
  differ: number;
  /** a minute with trades here and none at Hyperliquid, and the other way */
  onlyHere: number;
  onlyThere: number;
  /** minutes not covered whole: not compared */
  outside: number;
  examples: string[];
  checkedAt: string;
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

/** the raw files of a coin's channel in a day, those of one hour only when `hour` is said: the closed ones and the one under way */
function hourFiles(home: string, coin: string, day: string, hour?: string): string[] {
  const dir = join(recordDir(home), "raw", coin, "trades", day);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => (f.endsWith(".jsonl") || f.endsWith(".jsonl.gz")) && (hour === undefined || f.startsWith(`${hour}.`)))
    .sort()
    .map((f) => join(dir, f));
}

/** THE DAY'S RECORDED TRADES of a coin, each once, by the exchange's time (see the top of this file) */
export function tradesOf(home: string, coin: string, day: string): { trades: RecordedTrade[]; repeated: number } {
  const from = dayStart(day);
  const to = from + DAY_MS;
  const files = [...hourFiles(home, coin, dayOf(from - 1), "23"), ...hourFiles(home, coin, day), ...hourFiles(home, coin, dayOf(to), "00")];
  const seen = new Set<string>();
  const trades: RecordedTrade[] = [];
  let repeated = 0;
  for (const f of files) {
    const buf = readFileSync(f);
    const text = (f.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row: Record<string, unknown>;
      try {
        row = rec(JSON.parse(line));
      } catch {
        continue;
      }
      if (!Array.isArray(row.d)) continue;
      for (const x of row.d.map(rec)) {
        const tid = String(x.tid ?? "");
        const time = Number(x.time);
        const px = Number(x.px);
        const sz = Number(x.sz);
        if (!tid || !Number.isFinite(time) || !(px > 0) || !(sz > 0) || x.coin !== coin) continue;
        if (seen.has(tid)) {
          repeated++;
          continue;
        }
        seen.add(tid);
        if (time >= from && time < to) trades.push({ tid, time, px, sz, side: x.side === "B" || x.side === "A" ? x.side : undefined });
      }
    }
  }
  // by the exchange's time; trades of one moment in the order they came (the sort is stable)
  trades.sort((a, b) => a.time - b.time);
  return { trades, repeated };
}

/** trades made one-minute bars (see the top of this file) */
export function minuteBars(trades: readonly RecordedTrade[]): MinuteBar[] {
  const out: MinuteBar[] = [];
  let bar: (MinuteBar & { pv: number }) | undefined;
  const done = (): void => {
    if (!bar) return;
    const { pv, ...b } = bar;
    out.push({ ...b, vwap: b.v > 0 ? pv / b.v : b.c });
  };
  for (const x of trades) {
    const t = Math.floor(x.time / MINUTE_MS) * MINUTE_MS;
    if (!bar || bar.t !== t) {
      done();
      bar = { t, o: x.px, h: x.px, l: x.px, c: x.px, v: 0, n: 0, buy: 0, vwap: 0, pv: 0 };
    }
    bar.h = Math.max(bar.h, x.px);
    bar.l = Math.min(bar.l, x.px);
    bar.c = x.px;
    bar.v += x.sz;
    bar.n += 1;
    if (x.side === "B") bar.buy += x.sz;
    bar.pv += x.px * x.sz;
  }
  done();
  return out;
}

const same = (a: MinuteBar, b: HlMinute): boolean => a.o === Number(b.o) && a.h === Number(b.h) && a.l === Number(b.l) && a.c === Number(b.c) && a.n === b.n && Math.abs(a.v - Number(b.v)) <= 1e-9 * Math.max(1, Number(b.v));
const hhmm = (t: number): string => new Date(t).toISOString().slice(11, 16);
const said = (b: MinuteBar | HlMinute | undefined): string => (b ? `o ${b.o} h ${b.h} l ${b.l} c ${b.c} v ${typeof b.v === "number" ? Number(b.v.toFixed(8)) : b.v} n ${b.n}` : "nothing");

/** A RECORDED DAY CHECKED (see the top of this file): its bars built, kept, and set beside Hyperliquid's own */
export async function checkDay(home: string, coin: string, day: string, minutesOf: MinutesOf, now: number): Promise<DayCheck | Refusal> {
  if (!isDay(day)) return no("E_ACCOUNT_BAD_ACTION", { message: `a day is YYYY-MM-DD, not "${day.slice(0, 20)}"` });
  const from = dayStart(day);
  const to = from + DAY_MS;
  if (to > now) return no("E_ACCOUNT_BAD_ACTION", { message: `${day} has not ended: a day is checked once it is over` });
  if (from < Math.floor(now / MINUTE_MS) * MINUTE_MS - HL_MINUTES * MINUTE_MS) return no("E_ACCOUNT_BAD_ACTION", { message: `Hyperliquid keeps its latest ${HL_MINUTES.toLocaleString("en-US")} one-minute candles, about three and a half days: ${day} is checked within three days of its end` });
  const { trades, repeated } = tradesOf(home, coin, day);
  const bars = minuteBars(trades);
  const theirs = await minutesOf(coin, from, to);
  if (isRefusal(theirs)) return theirs;
  const covered = coverage(home, day).map((c) => [Date.parse(c.from), Date.parse(c.to)] as const);
  const ours = new Map(bars.map((b) => [b.t, b] as const));
  // a quiet minute Hyperliquid answers flat, with no trade: no bar
  const there = new Map(theirs.filter((c) => c.n > 0).map((c) => [c.t, c] as const));
  const check: DayCheck = { coin, day, trades: trades.length, repeated, bars: bars.length, compared: 0, matched: 0, differ: 0, onlyHere: 0, onlyThere: 0, outside: 0, examples: [], checkedAt: new Date(now).toISOString() };
  for (let t = from; t < to; t += MINUTE_MS) {
    if (!covered.some(([a, b]) => a <= t && t + MINUTE_MS <= b)) {
      check.outside++;
      continue;
    }
    check.compared++;
    const a = ours.get(t);
    const b = there.get(t);
    if (!a && !b) check.matched++;
    else if (a && b && same(a, b)) check.matched++;
    else {
      if (a && b) check.differ++;
      else if (a) check.onlyHere++;
      else check.onlyThere++;
      if (check.examples.length < EXAMPLES) check.examples.push(`${hhmm(t)} here ${said(a)}; Hyperliquid ${said(b)}`);
    }
  }
  writeWhole(barsFile(home, coin, day), JSON.stringify({ version: 1, venue: "hyperliquid", coin, day, interval: "1m", from: "trades recorded from Hyperliquid's WebSocket (npm run account:record)", bars, check }));
  const m = readManifest(home, day);
  m.checks[coin] = check;
  writeManifest(home, m, now);
  return check;
}

/** a check in a line */
export function checkWords(c: DayCheck): string {
  const minutes = (n: number): string => `${n.toLocaleString("en-US")} minute${n === 1 ? "" : "s"}`;
  const off = [c.differ ? `${minutes(c.differ)} differ` : "", c.onlyHere ? `${minutes(c.onlyHere)} only here` : "", c.onlyThere ? `${minutes(c.onlyThere)} only at Hyperliquid` : ""].filter(Boolean);
  return `${c.coin} ${c.day}: ${c.trades.toLocaleString("en-US")} trades in ${c.bars.toLocaleString("en-US")} one-minute bars · ${minutes(c.compared)} compared, ${c.matched.toLocaleString("en-US")} the same${off.length ? `, ${off.join(", ")}` : ""} · ${minutes(c.outside)} not covered${c.examples.length ? `\n  ${c.examples.join("\n  ")}` : ""}`;
}

/** Hyperliquid's own one-minute candles for a window, with each minute's count of trades — through the account's guarded ask
 * (live/public-markets.ts hyperliquidInfo) */
export function hyperliquidMinutes(info: ReturnType<typeof hyperliquidInfo>): MinutesOf {
  return async (coin, from, to) => {
    let r: HttpReply;
    try {
      r = await info({ type: "candleSnapshot", req: { coin, interval: "1m", startTime: from, endTime: to - 1 } });
    } catch (e) {
      return no("E_VENUE_UNREACHABLE", { venue: "hyperliquid", message: `Hyperliquid could not be reached: ${String((e as Error)?.message ?? e).slice(0, 120)}` });
    }
    if (r.status !== 200 || !Array.isArray(r.body)) return no("E_VENUE_REJECTED", { venue: "hyperliquid", message: `Hyperliquid answered ${r.status} for ${coin}'s one-minute candles` });
    return r.body
      .map(rec)
      .map((x) => ({ t: Number(x.t), o: String(x.o), h: String(x.h), l: String(x.l), c: String(x.c), v: String(x.v), n: Number(x.n) }))
      .filter((c) => Number.isFinite(c.t) && c.t >= from && c.t < to && Number.isFinite(c.n));
  };
}
