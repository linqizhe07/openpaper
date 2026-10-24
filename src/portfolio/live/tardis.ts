/** TARDIS.DEV'S RECORDED DAYS, PLAYED BACK AT THE ACCOUNT'S CLOCK (the replay: account-replay.ts).
 *
 * Tardis.dev records the exchanges' own WebSocket feeds — every trade, every change of the order book, a perpetual's funding, mark and
 * open interest — and sells the recording by the day: one gzipped CSV an exchange, a data type, a day and a symbol, at
 * datasets.tardis.dev/v1/{exchange}/{dataType}/{YYYY}/{MM}/{DD}/{SYMBOL}.csv.gz (docs.tardis.dev, downloadable-csv-files; read
 * 2026-10-24). THE FIRST DAY OF EACH MONTH IS FREE AND NEEDS NO KEY; any other day needs a Data API key (the Academic plan, for students
 * and researchers, is the cheapest: $350 a month for the perpetuals, billed by the quarter or the year), sent as `Authorization: Bearer`.
 * Nothing else of Tardis is used here — no client library, no tardis-machine: a GET, a gunzip and a CSV read. Hyperliquid is recorded
 * since 2024-10-29 (its trades since 2024-12-01), Binance since 2019-03-30; 50-odd exchanges in all.
 *
 * What is read, per market (Hyperliquid's BTC on 2026-10-01: 294,079 trades, 155,774 book snapshots, 52,637 ticker rows, 12 MB gzipped):
 *   trades             exchange,symbol,timestamp,local_timestamp,id,side,price,amount — `timestamp` the exchange's own, in MICROSECONDS
 *                      UTC (`local_timestamp` is Tardis's arrival time, a second or two later), `side` the taker's
 *   book_snapshot_5    …,asks[0].price,asks[0].amount,bids[0].price,bids[0].amount,… — five levels a side, best first, a row on every
 *                      change of them, rebuilt by Tardis from the exchange's book feed
 *   derivative_ticker  …,funding_timestamp,funding_rate,predicted_funding_rate,open_interest,last_price,index_price,mark_price — a row
 *                      on every change; a field the exchange did not send is empty
 * A file is held in memory as typed arrays by the exchange's time, oldest first (a file's rows come in arrival order, so they are put
 * in time order here), and a moment's state is the latest row at or before it (lastAt, a binary search). THE BOOK AT A MOMENT is the
 * latest snapshot before it: the book's state until its next change, so it is stamped with the clock, not the snapshot's own time (a
 * paper account fills a coin only at a quote FILL_FRESH_MS old at most, live/paper.ts). Hyperliquid's book was snapshotted about every
 * 5.4 s before 2026-06-17 (l2Book) and every 500 ms since (fastBook: docs.tardis.dev historical-data-details/hyperliquid).
 *
 * THE REPLAY SOURCE (hyperliquidReplaySource) is a PublicSource like the keyless ones Markets reads (live/public-markets.ts), so nothing
 * downstream knows it is a recording: the paper account lists its markets and prices them by it, fills against its book by the paper
 * account's own rule, Markets shows them, the desk scans them — all at the clock the source is given, which the replay moves. Its
 * perpetuals are Hyperliquid's (`<COIN>-PERP`, USDC, the hourly funding, Hyperliquid's own lot and tick from the trades' decimals), its
 * 24-hour figures are the replayed day's so far (statsFrom says so: only the day is loaded, and its first trade is the day's open), its
 * candles are folded from its trades (foldBars), its funding history is the ticker's rate at each top of the hour. Its name and its notes
 * say what it is: a recording, nothing live. */
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { hlPerpSteps } from "./hl-rules.ts";
import { foldBars } from "./history.ts";
import type { Listing, PublicSource } from "./public-markets.ts";
import type { Candle, CandleInterval, CandlePage, CandleWindow, MarketStats, OrderBook, PublicTrade } from "./trade.ts";

export const TARDIS_DATASETS = "https://datasets.tardis.dev/v1";
export type TardisDataType = "trades" | "book_snapshot_5" | "derivative_ticker";
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
/** the levels a side a book_snapshot_5 file holds */
export const BOOK_LEVELS = 5;

const iso = (ms: number): string => new Date(ms).toISOString();
/** a day as Tardis names it, `YYYY-MM-DD`, or nothing */
export const tardisDay = (s: string): string | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && iso(Date.parse(`${s}T00:00:00Z`)).startsWith(s) ? s : undefined);
/** the day's first moment, ms UTC */
export const tardisDayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`);
/** Tardis gives the first day of each month without a key */
export const tardisFree = (day: string): boolean => day.endsWith("-01");
/** the latest first-of-a-month before `now` (today's own data is not whole, and Tardis publishes a day once it has passed) */
export function latestFreeDay(now = Date.now()): string {
  const d = new Date(now);
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const at = first + DAY_MS <= Math.floor(now / DAY_MS) * DAY_MS ? first : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  return iso(at).slice(0, 10);
}
const fileSymbol = (symbol: string): string => symbol.trim().toUpperCase().replace(/[/:]/g, "-");
export function tardisUrl(exchange: string, dataType: TardisDataType, day: string, symbol: string): string {
  const [y, m, d] = day.split("-");
  return `${TARDIS_DATASETS}/${encodeURIComponent(exchange)}/${dataType}/${y}/${m}/${d}/${encodeURIComponent(fileSymbol(symbol))}.csv.gz`;
}
/** where a day's file is kept: <cache>/<exchange>/<dataType>/<day>/<SYMBOL>.csv.gz */
export const tardisPath = (cache: string, exchange: string, dataType: TardisDataType, day: string, symbol: string): string => join(cache, exchange, dataType, day, `${fileSymbol(symbol)}.csv.gz`);

export interface TardisFetch {
  cache: string;
  exchange: string;
  dataType: TardisDataType;
  day: string;
  symbol: string;
  /** a Data API key (TARDIS_API_KEY), for a day that is not the first of a month */
  apiKey?: string | undefined;
  /** the network; the real one by default */
  fetch?: typeof fetch | undefined;
}
export interface TardisFile {
  path: string;
  from: "cache" | "download";
  bytes: number;
}
/** the day's file, from the cache or downloaded into it (written whole, then moved into place), or Tardis's refusal in words: a day
 * that is not free without a key, a symbol it has nothing for, a network that did not answer */
export async function fetchTardis(o: TardisFetch): Promise<TardisFile | Refusal> {
  const path = tardisPath(o.cache, o.exchange, o.dataType, o.day, o.symbol);
  if (existsSync(path)) return { path, from: "cache", bytes: statSync(path).size };
  const url = tardisUrl(o.exchange, o.dataType, o.day, o.symbol);
  const venue = `tardis:${o.exchange}`;
  let r: Response;
  try {
    r = await (o.fetch ?? fetch)(url, { headers: { accept: "application/gzip", ...(o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {}) } });
  } catch (err) {
    return no("E_VENUE_UNREACHABLE", { venue, message: `datasets.tardis.dev did not answer for ${o.exchange} ${o.dataType} ${o.day} ${fileSymbol(o.symbol)}: ${String((err as Error)?.message ?? err).slice(0, 160)}` });
  }
  if (r.status === 401 || r.status === 403) {
    const why = tardisFree(o.day)
      ? `Tardis refused ${url} (${r.status})${o.apiKey ? " with the key given" : ", although the first day of a month needs no key"}`
      : `${o.day} is not the first day of a month: Tardis gives only the first day of each month without a key. Set TARDIS_API_KEY to a tardis.dev Data API key for other days, or replay ${o.day.slice(0, 8)}01`;
    return no("E_ACCOUNT_CREDENTIAL", { venue, message: why });
  }
  if (r.status === 404) return no("E_VENUE_REJECTED", { venue, message: `Tardis has no ${o.dataType} for ${fileSymbol(o.symbol)} at ${o.exchange} on ${o.day} (404): its symbols are at https://api.tardis.dev/v1/exchanges/${o.exchange}` });
  if (r.status !== 200) return no("E_VENUE_REJECTED", { venue, message: `Tardis answered ${r.status} for ${url}` });
  const bytes = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  const part = `${path}.part`;
  writeFileSync(part, bytes);
  renameSync(part, path);
  return { path, from: "download", bytes: bytes.length };
}

// ---- the files read ------------------------------------------------------------------------------------------------------------------

/** µs since the epoch, as Tardis stamps a row, to whole ms */
const msOf = (us: string | undefined): number => (us ? Math.floor(Number(us) / 1000) : NaN);
const numOf = (s: string | undefined): number => (s === undefined || s === "" ? NaN : Number(s));

function csvOf(text: string, what: string, needed: readonly string[]): { col: (name: string) => number; lines: string[] } {
  const lines = text.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const head = (lines.shift() ?? "").split(",").map((h) => h.trim());
  const at = new Map(head.map((h, i) => [h, i] as const));
  for (const n of needed) if (!at.has(n)) throw new Error(`a Tardis ${what} file without its ${n} column (its columns: ${head.join(", ").slice(0, 200)})`);
  return { col: (name) => at.get(name) ?? -1, lines };
}
/** the order that puts rows in time order (a file's rows come in Tardis's arrival order; the exchange's own time may run a little behind
 * or ahead of it), or nothing when they are in order already */
function timeOrder(t: ArrayLike<number>, n: number): Int32Array | undefined {
  let sorted = true;
  for (let i = 1; i < n && sorted; i++) if (t[i]! < t[i - 1]!) sorted = false;
  if (sorted) return undefined;
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  // a stable sort: equal times keep their arrival order
  return idx.sort((a, b) => t[a]! - t[b]! || a - b);
}
const permute = (a: Float64Array, idx: Int32Array | undefined): Float64Array => (idx ? Float64Array.from(idx, (i) => a[i]!) : a);
const permute8 = (a: Int8Array, idx: Int32Array | undefined): Int8Array => (idx ? Int8Array.from(idx, (i) => a[i]!) : a);

export interface Trades {
  n: number;
  /** ms UTC, oldest first */
  t: Float64Array;
  price: Float64Array;
  /** in the coin */
  amount: Float64Array;
  /** the taker's side: 1 buy, -1 sell, 0 not said */
  side: Int8Array;
  /** dollars traded up to and including each row (a running sum: a window's volume is a difference of two) */
  usd: Float64Array;
  /** the most places after the point an amount had: the exchange's lot, as the file shows it (Hyperliquid's szDecimals) */
  amountDecimals: number;
}
export function parseTrades(text: string): Trades {
  const { col, lines } = csvOf(text, "trades", ["timestamp", "side", "price", "amount"]);
  const [cT, cS, cP, cA] = [col("timestamp"), col("side"), col("price"), col("amount")];
  const n = lines.length;
  const t = new Float64Array(n);
  const price = new Float64Array(n);
  const amount = new Float64Array(n);
  const side = new Int8Array(n);
  let decimals = 0;
  let k = 0;
  for (const line of lines) {
    const f = line.split(",");
    const p = numOf(f[cP]);
    const a = numOf(f[cA]);
    const ts = msOf(f[cT]);
    if (!(p > 0) || !(a > 0) || !Number.isFinite(ts)) continue;
    t[k] = ts;
    price[k] = p;
    amount[k] = a;
    side[k] = f[cS] === "buy" ? 1 : f[cS] === "sell" ? -1 : 0;
    const dot = f[cA]!.indexOf(".");
    if (dot >= 0) decimals = Math.max(decimals, f[cA]!.replace(/0+$/, "").length - dot - 1);
    k++;
  }
  const order = timeOrder(t, k);
  const T = permute(t.subarray(0, k), order);
  const P = permute(price.subarray(0, k), order);
  const A = permute(amount.subarray(0, k), order);
  const usd = new Float64Array(k);
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += P[i]! * A[i]!;
    usd[i] = sum;
  }
  return { n: k, t: T, price: P, amount: A, side: permute8(side.subarray(0, k), order), usd, amountDecimals: Math.max(0, decimals) };
}

export interface Books {
  n: number;
  /** ms UTC, oldest first */
  t: Float64Array;
  /** per row, BOOK_LEVELS levels, each ask price, ask size, bid price, bid size (NaN where the snapshot had fewer levels) */
  px: Float64Array;
}
export function parseBooks(text: string): Books {
  const need = ["timestamp", "asks[0].price", "asks[0].amount", "bids[0].price", "bids[0].amount"];
  const { col, lines } = csvOf(text, "book_snapshot_5", need);
  const cT = col("timestamp");
  const cols: number[] = [];
  for (let l = 0; l < BOOK_LEVELS; l++) cols.push(col(`asks[${l}].price`), col(`asks[${l}].amount`), col(`bids[${l}].price`), col(`bids[${l}].amount`));
  const n = lines.length;
  const t = new Float64Array(n);
  const px = new Float64Array(n * BOOK_LEVELS * 4);
  let k = 0;
  for (const line of lines) {
    const f = line.split(",");
    const ts = msOf(f[cT]);
    if (!Number.isFinite(ts)) continue;
    t[k] = ts;
    const base = k * BOOK_LEVELS * 4;
    for (let j = 0; j < cols.length; j++) px[base + j] = cols[j]! >= 0 ? numOf(f[cols[j]!]) : NaN;
    k++;
  }
  const order = timeOrder(t, k);
  if (!order) return { n: k, t: t.subarray(0, k), px: px.subarray(0, k * BOOK_LEVELS * 4) };
  const P = new Float64Array(k * BOOK_LEVELS * 4);
  order.forEach((from, to) => P.set(px.subarray(from * BOOK_LEVELS * 4, (from + 1) * BOOK_LEVELS * 4), to * BOOK_LEVELS * 4));
  return { n: k, t: permute(t.subarray(0, k), order), px: P };
}
/** one level of a snapshot: [ask price, ask size, bid price, bid size], NaN where the snapshot had no such level */
export const bookLevel = (b: Books, row: number, level: number): [number, number, number, number] => {
  const at = (row * BOOK_LEVELS + level) * 4;
  return [b.px[at]!, b.px[at + 1]!, b.px[at + 2]!, b.px[at + 3]!];
};

export interface Tickers {
  n: number;
  t: Float64Array;
  /** the funding rate per hour (Hyperliquid pays hourly), NaN where the row had none */
  funding: Float64Array;
  openInterest: Float64Array;
  index: Float64Array;
  mark: Float64Array;
}
export function parseTickers(text: string): Tickers {
  const { col, lines } = csvOf(text, "derivative_ticker", ["timestamp", "funding_rate", "open_interest", "index_price", "mark_price"]);
  const [cT, cF, cO, cI, cM] = [col("timestamp"), col("funding_rate"), col("open_interest"), col("index_price"), col("mark_price")];
  const n = lines.length;
  const t = new Float64Array(n);
  const funding = new Float64Array(n);
  const oi = new Float64Array(n);
  const index = new Float64Array(n);
  const mark = new Float64Array(n);
  let k = 0;
  for (const line of lines) {
    const f = line.split(",");
    const ts = msOf(f[cT]);
    if (!Number.isFinite(ts)) continue;
    t[k] = ts;
    funding[k] = numOf(f[cF]);
    oi[k] = numOf(f[cO]);
    index[k] = numOf(f[cI]);
    mark[k] = numOf(f[cM]);
    k++;
  }
  const order = timeOrder(t, k);
  return { n: k, t: permute(t.subarray(0, k), order), funding: permute(funding.subarray(0, k), order), openInterest: permute(oi.subarray(0, k), order), index: permute(index.subarray(0, k), order), mark: permute(mark.subarray(0, k), order) };
}

/** the index of the latest row at or before `ms` in a time array (oldest first), or -1 before the first */
export function lastAt(t: ArrayLike<number>, n: number, ms: number): number {
  let lo = 0;
  let hi = n - 1;
  let out = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= ms) {
      out = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return out;
}
/** the index of the first row at or after `ms`, or n */
export const firstAt = (t: ArrayLike<number>, n: number, ms: number): number => lastAt(t, n, ms - 1) + 1;
/** the latest value at or before `ms` that is a number, looking back at most `back` rows (a ticker row may leave a field empty) */
function lastNumberAt(t: Float64Array, v: Float64Array, n: number, ms: number, back = 64): number | undefined {
  for (let i = lastAt(t, n, ms), k = 0; i >= 0 && k < back; i--, k++) if (Number.isFinite(v[i]!)) return v[i]!;
  return undefined;
}

/** one-minute bars from the trades with from <= t < to, oldest first: the first trade's price opens, the last closes, the volume in the
 * coin. A minute with no trade has no bar, as an exchange's own candles have none */
export function tradeBars(tr: Trades, from: number, to: number): Candle[] {
  const out: Candle[] = [];
  for (let i = firstAt(tr.t, tr.n, from); i < tr.n && tr.t[i]! < to; i++) {
    const start = Math.floor(tr.t[i]! / MINUTE_MS) * MINUTE_MS;
    const p = tr.price[i]!;
    const a = tr.amount[i]!;
    const last = out[out.length - 1];
    if (last && last.t === start) {
      last.h = Math.max(last.h, p);
      last.l = Math.min(last.l, p);
      last.c = p;
      last.v = (last.v ?? 0) + a;
    } else out.push({ t: start, o: p, h: p, l: p, c: p, v: a });
  }
  return out;
}

// ---- the source ----------------------------------------------------------------------------------------------------------------------

export interface ReplayMarket {
  /** Hyperliquid's coin (BTC), which Tardis names the symbol by */
  coin: string;
  /** the account's symbol for it, as Hyperliquid's listing names it: BTC-PERP */
  symbol: string;
  trades: Trades;
  books: Books;
  tickers?: Tickers | undefined;
  /** Hyperliquid's szDecimals, read from the trades' amounts: its lot and tick (hl-rules.ts hlPerpSteps) */
  szDecimals: number;
}
export const replayMarket = (coin: string, trades: Trades, books: Books, tickers?: Tickers): ReplayMarket => ({ coin: coin.toUpperCase(), symbol: `${coin.toUpperCase()}-PERP`, trades, books, ...(tickers ? { tickers } : {}), szDecimals: Math.min(8, trades.amountDecimals) });
/** the first and last moment a market's recording covers */
export const replaySpan = (m: ReplayMarket): { from: number; to: number } => {
  const firsts = [m.trades.t[0], m.books.t[0]].filter((x): x is number => x !== undefined);
  const lasts = [m.trades.t[m.trades.n - 1], m.books.t[m.books.n - 1]].filter((x): x is number => x !== undefined);
  return { from: firsts.length ? Math.min(...firsts) : NaN, to: lasts.length ? Math.max(...lasts) : NaN };
};

export const REPLAY_SOURCE_ID = "replay-hyperliquid";
export const REPLAY_VENUE_NAME = "Hyperliquid";

export interface ReplaySourceOptions {
  /** the day replayed, YYYY-MM-DD: the first moment of it is the day's open (the 24-hour figures count from there) */
  day: string;
  markets: ReplayMarket[];
  /** the replay's clock, ms: every answer is the recording's state at this moment */
  clock: () => number;
}
/** Hyperliquid's perpetuals of one recorded day, as a public source at a clock (see the top of this file) */
export function hyperliquidReplaySource(o: ReplaySourceOptions): PublicSource {
  const id = REPLAY_SOURCE_ID;
  const name = `${REPLAY_VENUE_NAME} · replay of ${o.day}`;
  const by = new Map(o.markets.map((m) => [m.symbol.toUpperCase(), m] as const));
  const dayStart = tardisDayStart(o.day);
  const unknown = (symbol: string): Refusal => no("E_VENUE_REJECTED", { venue: id, message: `${name} holds ${o.markets.map((m) => m.symbol).join(", ") || "no market"}, not ${symbol.slice(0, 40)}` });
  const nextFundingAt = (now: number): string => iso(Math.ceil((now + 1) / HOUR_MS) * HOUR_MS);
  /** the best bid and ask of the latest snapshot at or before now */
  const topAt = (m: ReplayMarket, now: number): { bid?: number | undefined; ask?: number | undefined; row: number } => {
    const row = lastAt(m.books.t, m.books.n, now);
    if (row < 0) return { row };
    const [askP, , bidP] = bookLevel(m.books, row, 0);
    return { row, ...(Number.isFinite(bidP) && bidP > 0 ? { bid: bidP } : {}), ...(Number.isFinite(askP) && askP > 0 ? { ask: askP } : {}) };
  };
  const listingAt = (m: ReplayMarket, now: number): Listing | undefined => {
    const i = lastAt(m.trades.t, m.trades.n, now);
    const top = topAt(m, now);
    const mid = top.bid !== undefined && top.ask !== undefined ? (top.bid + top.ask) / 2 : (top.bid ?? top.ask);
    const price = i >= 0 ? m.trades.price[i]! : mid;
    if (price === undefined) return undefined;
    // the day so far: the open is the first trade since the day began (or since 24 hours ago, once the clock is a day in), the volume
    // the dollars traded since it
    const from = Math.max(dayStart, now - DAY_MS);
    const j = firstAt(m.trades.t, m.trades.n, from);
    const open = j < m.trades.n && j <= i ? m.trades.price[j]! : undefined;
    const volumeUsd24h = i >= 0 && j <= i ? m.trades.usd[i]! - (j > 0 ? m.trades.usd[j - 1]! : 0) : 0;
    const tk = m.tickers;
    const funding = tk ? lastNumberAt(tk.t, tk.funding, tk.n, now) : undefined;
    const mark = tk ? lastNumberAt(tk.t, tk.mark, tk.n, now) : undefined;
    const index = tk ? lastNumberAt(tk.t, tk.index, tk.n, now) : undefined;
    const oi = tk ? lastNumberAt(tk.t, tk.openInterest, tk.n, now) : undefined;
    return {
      symbol: m.symbol,
      name: `${m.coin} perpetual on ${REPLAY_VENUE_NAME} (replay of ${o.day})`,
      kind: "perp",
      base: m.coin,
      quote: "USDC",
      price,
      ...(top.bid !== undefined ? { bid: top.bid } : {}),
      ...(top.ask !== undefined ? { ask: top.ask } : {}),
      open: true,
      types: [],
      ...(open !== undefined && open > 0 ? { change24h: price - open, changePct24h: ((price - open) / open) * 100 } : {}),
      volumeUsd24h,
      statsFrom: `the recording's trades since ${iso(from).slice(11, 16)} UTC of ${iso(from).slice(0, 10)}`,
      ...(funding !== undefined ? { fundingRate: funding, nextFundingAt: nextFundingAt(now), fundingEveryH: 1 } : {}),
      ...(mark !== undefined && mark > 0 ? { markPrice: mark } : {}),
      ...(index !== undefined && index > 0 ? { oraclePrice: index } : {}),
      ...(oi !== undefined && oi >= 0 ? { openInterest: oi, ...(mark !== undefined && mark > 0 ? { openInterestUsd: Math.round(oi * mark * 100) / 100 } : {}) } : {}),
      quoteAt: iso(now),
      quoteFrom: `${REPLAY_VENUE_NAME} · replay`,
      ...hlPerpSteps(m.szDecimals, price),
    };
  };
  const statsOf = (l: Listing): MarketStats => ({ ...(l.price !== undefined ? { price: l.price } : {}), ...(l.changePct24h !== undefined ? { changePct24h: l.changePct24h, change24h: l.change24h } : {}), ...(l.volumeUsd24h !== undefined ? { volumeUsd24h: l.volumeUsd24h } : {}), ...(l.statsFrom ? { statsFrom: l.statsFrom } : {}) });
  return {
    id,
    name,
    kind: "exchange",
    connectTo: id,
    connector: "live:replay",
    readOnly: `a recorded day (${o.day}) played back: its markets trade in a paper account only`,
    listings: async (q) => {
      const Q = (q.q ?? "").trim().toUpperCase();
      const now = o.clock();
      return o.markets
        .filter((m) => !Q || m.symbol.toUpperCase().includes(Q) || m.coin.toUpperCase().includes(Q))
        .map((m) => listingAt(m, now))
        .filter((l): l is Listing => l !== undefined)
        .sort((a, b) => (b.volumeUsd24h ?? 0) - (a.volumeUsd24h ?? 0))
        .slice(0, Math.max(1, q.limit));
    },
    stats: async (symbols) => {
      const now = o.clock();
      const out = new Map<string, MarketStats>();
      for (const m of o.markets) {
        if (symbols && !symbols.some((s) => s.toUpperCase() === m.symbol)) continue;
        const l = listingAt(m, now);
        if (l) out.set(m.symbol, statsOf(l));
      }
      return out;
    },
    book: async (symbol, depth) => {
      const m = by.get(symbol.trim().toUpperCase());
      if (!m) return unknown(symbol);
      const now = o.clock();
      const row = lastAt(m.books.t, m.books.n, now);
      if (row < 0) return no("E_VENUE_REJECTED", { venue: id, message: `${name} has no ${m.symbol} book before ${iso(m.books.t[0] ?? dayStart)}` });
      const bids: OrderBook["bids"] = [];
      const asks: OrderBook["asks"] = [];
      for (let l = 0; l < Math.min(BOOK_LEVELS, Math.max(1, depth)); l++) {
        const [askP, askA, bidP, bidA] = bookLevel(m.books, row, l);
        if (Number.isFinite(askP) && askP > 0) asks.push([askP, Number.isFinite(askA) ? askA : null]);
        if (Number.isFinite(bidP) && bidP > 0) bids.push([bidP, Number.isFinite(bidA) ? bidA : null]);
      }
      // the book's state until its next change: stamped now. Five levels are what the recording holds; the venue's book goes on past them
      return { bids, asks, at: iso(now), from: `${REPLAY_VENUE_NAME} (replay of ${o.day})`, depth: "full", more: { bids: true, asks: true } };
    },
    trades: async (symbol, limit) => {
      const m = by.get(symbol.trim().toUpperCase());
      if (!m) return unknown(symbol);
      const i = lastAt(m.trades.t, m.trades.n, o.clock());
      const out: PublicTrade[] = [];
      for (let k = i; k >= 0 && out.length < Math.max(1, Math.min(100, limit)); k--) {
        const s = m.trades.side[k]!;
        out.push({ price: m.trades.price[k]!, size: m.trades.amount[k]!, at: iso(m.trades.t[k]!), ...(s === 1 ? { side: "buy" as const } : s === -1 ? { side: "sell" as const } : {}) });
      }
      return out;
    },
    candles: async (symbol, interval, w) => replayCandles(by.get(symbol.trim().toUpperCase()), symbol, interval, w, o.clock(), name, o.day, unknown),
    fundingHistory: async (symbol, from, to) => {
      const m = by.get(symbol.trim().toUpperCase());
      if (!m) return unknown(symbol);
      const tk = m.tickers;
      const out: Array<{ at: number; rate: number }> = [];
      if (!tk) return out;
      const until = Math.min(to, o.clock());
      for (let h = Math.ceil(from / HOUR_MS) * HOUR_MS; h <= until; h += HOUR_MS) {
        const rate = lastNumberAt(tk.t, tk.funding, tk.n, h);
        if (rate !== undefined) out.push({ at: h, rate });
      }
      return out;
    },
    notes: () => [`${name}: ${o.markets.length} perpetual${o.markets.length === 1 ? "" : "s"} of ${o.day} as tardis.dev recorded them, played back at the account's clock — nothing here is live.`],
  };
}

/** a market's bars in a window, from its trades: one-minute bars folded to the size asked (UTC buckets), at most `limit` of the latest,
 * nothing after the clock; the page says the recording holds the day alone */
function replayCandles(m: ReplayMarket | undefined, symbol: string, interval: CandleInterval, w: CandleWindow, now: number, name: string, day: string, unknown: (s: string) => Refusal): CandlePage | Refusal {
  if (!m) return unknown(symbol);
  const start = m.trades.t[0] ?? tardisDayStart(day);
  const until = Math.min(w.until ?? now, now + 1);
  const from = Math.max(w.since ?? start, start);
  let bars: Candle[] = from < until ? tradeBars(m.trades, from, until) : [];
  if (interval !== "1m") bars = foldBars(bars, interval, "utc");
  const limit = Math.max(1, Math.min(5_000, w.limit ?? 5_000));
  if (bars.length > limit) bars = bars.slice(bars.length - limit);
  return {
    bars,
    more: false,
    ends: `${name} holds ${day} alone: nothing older is recorded here`,
    source: `${REPLAY_VENUE_NAME} · ${m.symbol} (replay of ${day})`,
    ...(interval !== "1m" ? { folded: `${interval} bars folded from the recording's trades, minute by minute` } : {}),
  };
}
