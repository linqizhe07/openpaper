/** THE PAST AS A PUBLIC SOURCE (the backtest: backtest/engine.ts).
 *
 * A backtest here is the paper account played over recorded bars: the same book, the same orders and the same rule for a fill as the paper
 * account the desk trades (live/paper.ts), reading its prices through a PublicSource like every keyless one Markets reads, so nothing
 * downstream knows the prices are the past. The replay of a tardis.dev day does the same for a recorded order book (live/tardis.ts); this
 * does it for bars, over months or years, at the clock the engine moves from the start of one bar to the start of the next.
 *
 * What the source answers, at the clock:
 *   a quote     the OPEN of the bar under way — the bar from `t` to `t` + its size that holds the clock. Its ask is that open plus the half
 *               spread, its bid the open less it (BacktestCosts.halfSpreadBps), its mark the open. Nothing of that bar but its open is known
 *               at the clock: its high, its low, its close and its volume are told only once it has closed
 *   a book      `levels` levels either side of the open, each `levelBps` further out than the one before, holding together `participation`
 *               of the dollars the bar BEFORE traded (the volume of the bar under way is not known yet). A market order the levels hold
 *               walks them by the paper account's own rule; one they do not hold fills nothing, since the paper account fills nothing in
 *               part — so the size a market takes is bounded by what it traded, and a strategy too big for its market is told so. A market
 *               whose bars carry no volume has a book as deep as any order
 *   bars        only bars that have CLOSED by the clock: at the size they were recorded in, and coarser sizes folded from them (whole buckets
 *               only). A finer size answers that the history at it starts after the time asked: the paper account judging the time between
 *               two looks (its catchUp, at every look of a book opened with `bars: true`, since no stream runs in a backtest) asks its finest
 *               bars first and goes on to coarser ones, so it judges each bar of the recorded size —
 *               a stop the bar reached triggered, a resting limit it reached filled, a perpetual whose bar crossed its liquidation price was
 *               liquidated, each hour's funding paid at the hour's own rate
 *   funding     a perpetual's rates paid at or before the clock, as recorded
 * A market outside its bars has no bar under way: before the first it is not listed; after the last it is listed closed, at its last
 * close. Every number the source gives is a recorded one or the cost model's, and the listing's words say which. */
import type { Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { foldBars } from "../live/history.ts";
import type { Listing, PublicSource } from "../live/public-markets.ts";
import { INTERVAL_MS, type Candle, type CandleInterval, type CandlePage, type CandleWindow, type MarketStats, type OrderBook } from "../live/trade.ts";

/** one market of a backtest, with its recorded bars */
export interface BacktestMarket {
  /** as the backtest names it, and the paper account trades it: `BTC-PERP`, `BTC/USD`, `AAPL` */
  symbol: string;
  kind: "perp" | "spot";
  base: string;
  quote: string;
  name: string;
  /** whose bars these are, in words ("Hyperliquid · BTC", "Coinbase Exchange · BTC-USD", "US stocks · AAPL") */
  from: string;
  interval: CandleInterval;
  /** oldest first, each a whole bar of `interval` */
  bars: Candle[];
  /** the bars it closes in a year, where that is not every bar around the clock: a US share's daily bars, 252 */
  perYear?: number | undefined;
  /** a perpetual's rates as recorded, oldest first: the moment each was paid (ms) and its rate for one funding interval */
  funding?: Array<{ at: number; rate: number }> | undefined;
  /** the hours one funding interval lasts (Hyperliquid's one) */
  fundingEveryH?: number | undefined;
  maxLeverage?: number | undefined;
  qtyStep?: number | undefined;
  minQty?: number | undefined;
  priceStep?: number | undefined;
  minNotional?: number | undefined;
}

/** THE COST MODEL: what the bars do not say, said as a model (see the top of this file) */
export interface BacktestCosts {
  /** half the spread, in basis points of the open: the ask this far above it, the bid this far below */
  halfSpreadBps: number;
  /** of the dollars the bar before traded, how much the book's levels hold together (0.05: five percent) */
  participation: number;
  /** basis points between one level and the next: what walking the book costs */
  levelBps: number;
  levels: number;
}
export const DEFAULT_COSTS: Readonly<BacktestCosts> = { halfSpreadBps: 1, participation: 0.05, levelBps: 2, levels: 5 };

export const BACKTEST_SOURCE_ID = "backtest";
export const BACKTEST_SOURCE_NAME = "Backtest";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const round = (x: number, places: number): number => Number(x.toFixed(places));
const SIZES: readonly CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
const finer = (a: CandleInterval, b: CandleInterval): boolean => SIZES.indexOf(a) < SIZES.indexOf(b);

/** the index of the last bar starting at or before `at`, or -1 */
export function barIndexAt(bars: readonly Candle[], at: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.t <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
/** the bar under way at `now` (its index), or -1 where no bar holds the moment */
export function barUnderWay(m: Pick<BacktestMarket, "bars" | "interval">, now: number): number {
  const i = barIndexAt(m.bars, now);
  return i >= 0 && now < m.bars[i]!.t + INTERVAL_MS[m.interval] ? i : -1;
}
/** how many bars have closed by `now` (the bars told so far are bars[0 … n-1]) */
export function barsClosed(m: Pick<BacktestMarket, "bars" | "interval">, now: number): number {
  return barIndexAt(m.bars, now - INTERVAL_MS[m.interval]) + 1;
}
/** the rate paid last at or before `now`, if any */
function rateAt(m: BacktestMarket, now: number): number | undefined {
  const f = m.funding;
  if (!f?.length) return undefined;
  let lo = 0;
  let hi = f.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (f[mid]!.at <= now) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? f[found]!.rate : undefined;
}

export interface HistorySourceOptions {
  markets: BacktestMarket[];
  clock: () => number;
  costs?: Partial<BacktestCosts> | undefined;
}

/** the recorded bars of a backtest, as a public source at a clock (see the top of this file) */
export function historySource(o: HistorySourceOptions): PublicSource {
  const costs: BacktestCosts = { ...DEFAULT_COSTS, ...(o.costs ?? {}) };
  const by = new Map(o.markets.map((m) => [m.symbol.toUpperCase(), m] as const));
  const unknown = (symbol: string): Refusal => no("E_VENUE_REJECTED", { venue: BACKTEST_SOURCE_ID, message: `the backtest holds ${o.markets.map((m) => m.symbol).join(", ") || "no market"}, not ${symbol.slice(0, 40)}` });
  const quoteWords = (m: BacktestMarket): string => `${m.from} · ${m.interval} bar's open (backtest)`;

  const listingAt = (m: BacktestMarket, now: number): Listing | undefined => {
    const i = barUnderWay(m, now);
    const closed = barsClosed(m, now);
    // before its first bar the market is not listed; after its last, listed closed at its last close
    if (i < 0 && closed === 0) return undefined;
    const price = i >= 0 ? m.bars[i]!.o : m.bars[closed - 1]!.c;
    const half = (price * costs.halfSpreadBps) / 10_000;
    // the 24 hours that closed before the clock: the change from the close before them, the dollars traded in them
    const dayAgo = barsClosed(m, now - DAY_MS);
    const before = dayAgo > 0 ? m.bars[dayAgo - 1]!.c : undefined;
    let volumeUsd24h = 0;
    let volumeKnown = closed > dayAgo;
    for (let k = dayAgo; k < closed; k++) {
      const v = m.bars[k]!.v;
      if (v === undefined) volumeKnown = false;
      else volumeUsd24h += v * m.bars[k]!.c;
    }
    const rate = m.kind === "perp" ? rateAt(m, now) : undefined;
    const every = m.fundingEveryH ?? 1;
    return {
      symbol: m.symbol,
      name: `${m.name} (backtest)`,
      kind: m.kind,
      base: m.base,
      quote: m.quote,
      price,
      ...(i >= 0 ? { bid: round(price - half, 10), ask: round(price + half, 10) } : {}),
      open: i >= 0,
      types: [],
      ...(before !== undefined && before > 0 ? { change24h: round(price - before, 10), changePct24h: round(((price - before) / before) * 100, 6) } : {}),
      ...(volumeKnown ? { volumeUsd24h: round(volumeUsd24h, 2) } : {}),
      statsFrom: "the backtest's own bars that closed in the 24 hours before the clock",
      ...(m.kind === "perp" ? { markPrice: price, ...(rate !== undefined ? { fundingRate: rate, nextFundingAt: iso(Math.floor(now / (every * HOUR_MS)) * every * HOUR_MS + every * HOUR_MS), fundingEveryH: every } : {}) } : {}),
      ...(m.maxLeverage !== undefined ? { maxLeverage: m.maxLeverage } : {}),
      ...(m.qtyStep !== undefined ? { qtyStep: m.qtyStep } : {}),
      ...(m.minQty !== undefined ? { minQty: m.minQty } : {}),
      ...(m.priceStep !== undefined ? { priceStep: m.priceStep } : {}),
      ...(m.minNotional !== undefined ? { minNotional: m.minNotional } : {}),
      ...(i < 0 ? { note: `the backtest's bars of ${m.symbol} end at ${iso(m.bars[closed - 1]!.t + INTERVAL_MS[m.interval])}` } : {}),
      quoteAt: iso(now),
      quoteFrom: quoteWords(m),
      venueName: BACKTEST_SOURCE_NAME,
    };
  };
  const statsOf = (l: Listing): MarketStats => ({ ...(l.price !== undefined ? { price: l.price } : {}), ...(l.changePct24h !== undefined ? { changePct24h: l.changePct24h, change24h: l.change24h } : {}), ...(l.volumeUsd24h !== undefined ? { volumeUsd24h: l.volumeUsd24h } : {}) });

  /** the bars told at `now` in `interval`: the recorded size as it is, a coarser one folded from it (whole buckets only) */
  const barsAt = (m: BacktestMarket, interval: CandleInterval, now: number): Candle[] => {
    const told = m.bars.slice(0, barsClosed(m, now));
    if (interval === m.interval) return told;
    const step = INTERVAL_MS[interval];
    return foldBars(told, interval).filter((b) => b.t + step <= now && b.t >= (told[0]?.t ?? Number.POSITIVE_INFINITY));
  };

  return {
    id: BACKTEST_SOURCE_ID,
    name: BACKTEST_SOURCE_NAME,
    kind: "exchange",
    connectTo: BACKTEST_SOURCE_ID,
    connector: "live:backtest",
    readOnly: "recorded bars played back: their markets trade in a backtest's paper account only",
    listings: async (q) => {
      const Q = (q.q ?? "").trim().toUpperCase();
      const now = o.clock();
      const exact = o.markets.filter((m) => m.symbol.toUpperCase() === Q);
      const rest = o.markets.filter((m) => m.symbol.toUpperCase() !== Q && (!Q || m.symbol.toUpperCase().includes(Q) || m.base.toUpperCase().includes(Q)));
      return [...exact, ...rest]
        .map((m) => listingAt(m, now))
        .filter((l): l is Listing => l !== undefined)
        .slice(0, Math.max(1, q.limit));
    },
    stats: async (symbols) => {
      const now = o.clock();
      const out = new Map<string, MarketStats>();
      for (const m of o.markets) {
        if (symbols && !symbols.some((s) => s.toUpperCase() === m.symbol.toUpperCase())) continue;
        const l = listingAt(m, now);
        if (l) out.set(m.symbol, statsOf(l));
      }
      return out;
    },
    book: async (symbol, depth) => {
      const m = by.get(symbol.trim().toUpperCase());
      if (!m) return unknown(symbol);
      const now = o.clock();
      const i = barUnderWay(m, now);
      if (i < 0) return no("E_VENUE_RAIL_CLOSED", { venue: BACKTEST_SOURCE_ID, message: `the backtest has no ${m.symbol} bar under way at ${iso(now)}` });
      const open = m.bars[i]!.o;
      // the levels hold together a share of what the bar BEFORE traded; with no volume told, as much as any order
      const prev = i > 0 ? m.bars[i - 1] : undefined;
      const heldUsd = prev && prev.v !== undefined ? costs.participation * prev.v * prev.c : Number.POSITIVE_INFINITY;
      const levels = Math.max(1, Math.min(costs.levels, Math.max(1, depth)));
      const bids: OrderBook["bids"] = [];
      const asks: OrderBook["asks"] = [];
      for (let k = 0; k < levels; k++) {
        const away = (costs.halfSpreadBps + k * costs.levelBps) / 10_000;
        const ask = round(open * (1 + away), 10);
        const bid = round(open * (1 - away), 10);
        const each = heldUsd / levels;
        asks.push([ask, Number.isFinite(each) ? round(each / ask, 12) : 1e15]);
        bids.push([bid, Number.isFinite(each) ? round(each / bid, 12) : 1e15]);
      }
      return { bids, asks, at: iso(now), from: `${m.from} (backtest: the bar's open, ${costs.halfSpreadBps} bps half spread, ${levels} levels ${costs.levelBps} bps apart)`, depth: "full", more: { bids: false, asks: false } };
    },
    candles: async (symbol, interval, w: CandleWindow): Promise<CandlePage | Refusal> => {
      const m = by.get(symbol.trim().toUpperCase());
      if (!m) return unknown(symbol);
      const now = o.clock();
      // a finer size than recorded: the history at it starts after any time asked, so the paper account asks a coarser one
      if (finer(interval, m.interval)) return { bars: [], more: false, ends: `the backtest holds ${m.symbol} in ${m.interval} bars only`, source: m.from };
      const all = barsAt(m, interval, now);
      const until = w.until ?? Number.POSITIVE_INFINITY;
      const since = w.since ?? Number.NEGATIVE_INFINITY;
      let bars = all.filter((b) => b.t >= since && b.t < until);
      const limit = w.limit !== undefined && w.limit > 0 ? Math.floor(w.limit) : undefined;
      const cut = limit !== undefined && bars.length > limit;
      if (cut) bars = bars.slice(-limit);
      const first = all[0]?.t;
      const more = cut || (bars.length > 0 && first !== undefined && bars[0]!.t > first && w.since === undefined);
      const ends = first !== undefined && since < first ? `the backtest's ${m.symbol} bars start ${iso(first)}` : undefined;
      return { bars, more, ...(ends ? { ends } : {}), source: m.from, ...(interval !== m.interval ? { folded: `${interval} bars folded from the backtest's ${m.interval} bars` } : {}) };
    },
    fundingHistory: async (symbol, from, to) => {
      const m = by.get(symbol.trim().toUpperCase());
      if (!m) return unknown(symbol);
      const until = Math.min(to, o.clock());
      return (m.funding ?? []).filter((f) => f.at >= from && f.at <= until).map((f) => ({ at: f.at, rate: f.rate }));
    },
    notes: () => [`Backtest: ${o.markets.length} market${o.markets.length === 1 ? "" : "s"} played back from recorded bars at the backtest's clock — nothing here is live.`],
  };
}
