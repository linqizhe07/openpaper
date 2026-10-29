import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { backtest, backtestWords, parseBacktestArgs, type BacktestOptions } from "../../src/portfolio/account-backtest.ts";
import { loadHistory, parseMarkets, type HistorySources } from "../../src/portfolio/backtest/data.ts";
import { runBacktest, stepsOf, type BacktestRequest, type BacktestRun } from "../../src/portfolio/backtest/engine.ts";
import { drawdown, metricsOf, stepReturns } from "../../src/portfolio/backtest/metrics.ts";
import { historySource, type BacktestMarket } from "../../src/portfolio/backtest/source.ts";
import { strategySpec, type StrategySpec } from "../../src/portfolio/backtest/strategies.ts";
import { liquidationPriceOf, paperSource } from "../../src/portfolio/live/paper.ts";
import type { Listing, PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { Candle, CandlePage, OrderBook } from "../../src/portfolio/live/trade.ts";

/** THE BACKTEST (src/portfolio/backtest/, account-backtest.ts): recorded bars played through the paper account itself. Every price here is
 * made up — paths simple enough that what the paper account must do with them can be worked out by hand — and every source a stand-in, so
 * nothing leaves the process. What is checked: the source answers only what was known at the clock; the engine's fills, fees, funding and
 * liquidations are the paper account's and reconcile with a hand calculation; a strategy never trades on the bar under way; a run is the
 * same run twice; the figures are the textbook's; the specs hold to their bounds; the history is read once and kept; the command reads its
 * options strictly and keeps the run in the home. */
const H = 3_600_000;
const D = 86_400_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "backtest-"));
  homes.push(d);
  return d;
};

/** bars one an hour from `start`, from [open, high, low, close] rows, each trading `v` units */
const barsOf = (rows: ReadonlyArray<readonly [number, number, number, number]>, v = 1_000_000, start = T0): Candle[] => rows.map(([o, h, l, c], i) => ({ t: start + i * H, o, h, l, c, v }));
/** a path of closes as bars: each bar opens at the close before it */
const pathOf = (closes: readonly number[], v = 1_000_000, start = T0): Candle[] =>
  closes.map((c, i) => {
    const o = i ? closes[i - 1]! : c;
    return { t: start + i * H, o, h: Math.max(o, c), l: Math.min(o, c), c, v };
  });
const perp = (bars: Candle[], extra: Partial<BacktestMarket> = {}): BacktestMarket => ({ symbol: "X-PERP", kind: "perp", base: "X", quote: "USDC", name: "X perpetual", from: "made up", interval: "1h", bars, maxLeverage: 20, fundingEveryH: 1, ...extra });
const spot = (bars: Candle[], extra: Partial<BacktestMarket> = {}): BacktestMarket => ({ symbol: "X/USD", kind: "spot", base: "X", quote: "USD", name: "X / USD", from: "made up", interval: "1h", bars, ...extra });
const spec = (id: string, params: Record<string, number> = {}): StrategySpec => {
  const s = strategySpec(id, params);
  if (typeof s === "string") throw new Error(s);
  return s;
};
async function run(o: Partial<BacktestRequest> & Pick<BacktestRequest, "markets" | "strategy">): Promise<BacktestRun> {
  const last = Math.max(...o.markets.map((m) => m.bars[m.bars.length - 1]!.t + H));
  const r = await runBacktest({ from: T0, to: last, cashUsd: 10_000, feeBps: 10, costs: { halfSpreadBps: 0 }, home: tmp(), ...o });
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
}

describe("the past as a source, at the clock", () => {
  it("quotes the bar under way at its open with the half spread either side, lists nothing before the first bar and the last close after the last, and tells only bars that have closed", async () => {
    const m = perp(barsOf([[100, 110, 90, 105], [105, 120, 100, 118], [118, 118, 118, 118]]), { funding: [{ at: T0 + H, rate: 0.0001 }, { at: T0 + 2 * H, rate: 0.0002 }], qtyStep: 0.001, minNotional: 10 });
    let clock = T0 - 1;
    const src = historySource({ markets: [m], clock: () => clock, costs: { halfSpreadBps: 10, participation: 0.1, levelBps: 5, levels: 3 } });
    expect(await src.listings({ limit: 5 })).toEqual([]);
    clock = T0 + H;
    const [l] = (await src.listings({ q: "X-PERP", limit: 5 })) as Listing[];
    expect(l).toMatchObject({ symbol: "X-PERP", kind: "perp", price: 105, bid: 104.895, ask: 105.105, open: true, markPrice: 105, fundingRate: 0.0001, fundingEveryH: 1, maxLeverage: 20, qtyStep: 0.001, minNotional: 10, quoteAt: new Date(T0 + H).toISOString() });
    // the bar under way's high, low and close are not told: only the first bar has closed
    const page = (await src.candles!("X-PERP", "1h", {})) as CandlePage;
    expect(page.bars.map((b) => b.t)).toEqual([T0]);
    // a finer size: its history starts after any time asked, so the paper account asks a coarser one
    expect(await src.candles!("X-PERP", "1m", { since: T0, until: T0 + H })).toMatchObject({ bars: [], ends: "the backtest holds X-PERP in 1h bars only" });
    // the book: three levels 10, 15 and 20 bps out, holding together a tenth of the dollars the bar before traded
    const book = (await src.book!("X-PERP", 10)) as OrderBook;
    expect(book.asks.map(([p]) => p)).toEqual([105.105, 105.1575, 105.21]);
    expect(book.bids.map(([p]) => p)).toEqual([104.895, 104.8425, 104.79]);
    expect(book.asks[0]![1]).toBeCloseTo((0.1 * 1_000_000 * 105) / 3 / 105.105, 6);
    expect(book).toMatchObject({ at: new Date(T0 + H).toISOString(), depth: "full", more: { bids: false, asks: false } });
    // funding paid by the clock only
    expect(await src.fundingHistory!("X-PERP", 0, T0 + 10 * H)).toEqual([{ at: T0 + H, rate: 0.0001 }]);
    // past the last bar: listed closed at its last close, no bid or ask, no book
    clock = T0 + 3 * H;
    const [after] = (await src.listings({ limit: 5 })) as Listing[];
    expect(after).toMatchObject({ price: 118, open: false });
    expect(after!.bid).toBeUndefined();
    expect(isRefusal(await src.book!("X-PERP", 5))).toBe(true);
  });

  it("folds a coarser size from whole buckets only, and a first bar's book is as deep as any order", async () => {
    const m = spot(pathOf([1, 2, 3, 4, 5, 6, 7, 8].map((x) => 100 + x)));
    let clock = T0 + 6 * H;
    const src = historySource({ markets: [m], clock: () => clock });
    const four = (await src.candles!("X/USD", "4h", {})) as CandlePage;
    // bars 0–3 make the first 4-hour bar; bars 4 and 5 have closed but the bucket they start has not
    expect(four.bars).toEqual([{ t: T0, o: 101, h: 104, l: 101, c: 104, v: 4_000_000 }]);
    clock = T0;
    const book = (await src.book!("X/USD", 5)) as OrderBook;
    expect(book.asks[0]![1]).toBe(1e15);
  });

  it("steps from one bar's start to the next across every market, and ends at the window's end", () => {
    const a = perp(pathOf([1, 2, 3].map((x) => 100 + x)));
    const b = spot(pathOf([1, 2].map((x) => 50 + x), 1, T0 + 30 * 60_000));
    expect(stepsOf([a, b], T0 + 1, T0 + 3 * H)).toEqual([T0 + 30 * 60_000, T0 + H, T0 + 90 * 60_000, T0 + 2 * H, T0 + 3 * H]);
  });
});

describe("the engine, through the paper account", () => {
  it("holds a perpetual bought at the first bar's open and reconciles to the cent: the fee, an hour's funding at each hour's rate, the end at the last close", async () => {
    // up 1% a bar for 50 bars, then down 0.5% for 50
    const closes: number[] = [];
    for (let i = 0; i < 100; i++) closes.push((closes[i - 1] ?? 100) * (i < 50 ? 1.01 : 0.995));
    const bars = closes.map((c, i) => ({ t: T0 + i * H, o: i ? closes[i - 1]! : 100, h: Math.max(c, i ? closes[i - 1]! : 100), l: Math.min(c, i ? closes[i - 1]! : 100), c, v: 1e9 }));
    const rate = 0.0001;
    const r = await run({ markets: [perp(bars, { funding: bars.map((b) => ({ at: b.t, rate })) })], strategy: spec("hold") });
    const qty = (0.99 * 10_000) / 100;
    expect(r.fills).toEqual([{ at: new Date(T0).toISOString(), symbol: "X-PERP", side: "buy", qty, price: 100, feeUsd: 9.9, refPrice: 100 }]);
    let funding = 0;
    for (let h = 1; h < 100; h++) funding += qty * bars[h]!.o * rate;
    expect(r.funding).toEqual({ paidUsd: Number(funding.toFixed(2)), receivedUsd: 0, hours: 99 });
    const expected = 10_000 - 9.9 + qty * (closes[99]! - 100) - funding;
    expect(r.metrics.endUsd).toBe(Number(expected.toFixed(2)));
    expect(r.leverage).toBe(1);
    expect(r.metrics).toMatchObject({ fills: 1, feesUsd: 9.9, slippageUsd: 0 });
  });

  it("pays the half spread on a fill, and a short perpetual receives what the longs pay", async () => {
    const bars = pathOf(Array.from({ length: 30 }, (_, i) => 100 - i * 0.5));
    const r = await run({ markets: [perp(bars, { funding: bars.map((b) => ({ at: b.t, rate: 0.0002 })) })], strategy: spec("sma", { fast: 2, slow: 5, weight: 1 }), costs: { halfSpreadBps: 5 } });
    const open = r.fills[0]!;
    expect(open.side).toBe("sell");
    // a sell takes the bid: the open less 5 bps
    expect(open.price).toBeCloseTo(open.refPrice! * (1 - 0.0005), 8);
    expect(r.metrics.slippageUsd).toBeCloseTo(open.qty * open.refPrice! * 0.0005, 2);
    expect(r.funding.receivedUsd).toBeGreaterThan(0);
    expect(r.funding.paidUsd).toBe(0);
    expect(r.metrics.fundingUsd).toBe(-r.funding.receivedUsd);
  });

  it("never trades on the bar under way: a jump inside a bar is acted on at the next bar's open", async () => {
    const closes = [...Array<number>(30).fill(100), 200, ...Array<number>(10).fill(200)];
    const r = await run({ markets: [spot(pathOf(closes))], strategy: spec("sma", { fast: 2, slow: 5, weight: 1 }) });
    // bar 30 opened at 100 and closed at 200: the cross is seen when it has closed, and bought at bar 31's open
    expect(r.fills[0]).toMatchObject({ side: "buy", at: new Date(T0 + 31 * H).toISOString(), price: 200 });
  });

  it("turns a perpetual from long to short in two orders at one bar — the long closed, then the short opened", async () => {
    const closes = [...Array.from({ length: 15 }, (_, i) => 100 + i), ...Array.from({ length: 15 }, (_, i) => 114 - i * 2)];
    const r = await run({ markets: [perp(pathOf(closes))], strategy: spec("sma", { fast: 2, slow: 5, weight: 0.5 }) });
    const flip = r.fills.findIndex((f) => f.side === "sell");
    expect(flip).toBeGreaterThan(0);
    const [close, open] = [r.fills[flip]!, r.fills[flip + 1]!];
    expect(close.at).toBe(open.at);
    expect(open.side).toBe("sell");
    // the close is the whole long, and realises its result; the short opens fresh
    expect(close.qty).toBe(r.fills.filter((f, i) => i < flip && f.side === "buy").reduce((s, f) => s + f.qty, 0));
    expect(close.realizedUsd).toBeDefined();
    expect(open.realizedUsd).toBeUndefined();
  });

  it("liquidates a perpetual inside the bar that crossed its liquidation price, at that price, as the paper account judges a bar it did not watch", async () => {
    const bars = barsOf([[100, 100, 100, 100], [100, 100, 96, 99], [99, 99, 99, 99]], 1e9);
    const r = await run({ markets: [perp(bars)], strategy: spec("hold"), leverage: 20 });
    const qty = 99;
    const liq = liquidationPriceOf({ side: "long", qty, entryPrice: 100, marginUsd: 100 * qty / 20 }, 20)!;
    const gone = r.fills[1]!;
    expect(gone).toMatchObject({ side: "sell", qty, price: liq, at: new Date(T0 + 2 * H).toISOString() });
    expect(gone.note).toMatch(/liquidated/);
    expect(r.metrics.endUsd).toBeLessThan(10_000 - (100 * qty) / 20 / 2);
  });

  it("a paper account stepped over bars (bars: true) fills a resting stop inside the bar that reached it, at its stop — never at the next bar's open — and one without it only at the open", async () => {
    const bars = barsOf([[100, 100, 100, 100], [100, 101, 94, 99], [99, 99, 99, 99], [99, 99, 99, 99]], 1e9);
    const stopAt = async (o: { bars?: true }) => {
      let clock = T0;
      const src = historySource({ markets: [spot(bars)], clock: () => clock, costs: { halfSpreadBps: 0 } });
      const made = await paperSource({ home: tmp(), venue: "paper-backtest", label: "Backtest", cashUsd: 10_000, sources: () => [src], clock: () => clock, memory: true, ...o });
      if (isRefusal(made)) throw new Error(made.message);
      const paper = made.source;
      const fills: Array<{ clientId?: string | undefined; at: string; price: number; note?: string | undefined }> = [];
      const off = paper.paperEvents!.listen((c) => void fills.push(...c.fills));
      await paper.settle!();
      expect(await paper.trader!.place({ symbol: "X/USD", side: "buy", type: "market", qty: 10, worstPrice: 101, clientId: "in" })).toMatchObject({ status: "filled", avgPrice: 100 });
      expect(await paper.trader!.place({ symbol: "X/USD", side: "sell", type: "stop", qty: 10, stopPrice: 95, clientId: "out" })).toMatchObject({ status: "open" });
      for (const t of [T0 + H, T0 + 2 * H, T0 + 3 * H]) {
        clock = t;
        await paper.settle!();
      }
      off();
      paper.stop?.();
      return fills.find((f) => f.clientId === "out");
    };
    const judged = await stopAt({ bars: true });
    expect(judged).toMatchObject({ price: 95, at: new Date(T0 + 2 * H).toISOString() });
    expect(judged!.note).toContain("the 1h bar from 2026-01-01 01:00 UTC (94–101) reached it");
    // without it the bar between two looks is never judged: the price at the looks (100, 99, 99) never reached the stop
    expect(await stopAt({})).toBeUndefined();
  });

  it("refuses what the book does not hold — a share of the bar before's dollars — and says so", async () => {
    const bars = barsOf([[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100]], 1);
    const r = await run({ markets: [spot(bars)], strategy: spec("hold"), from: T0 + H, costs: { halfSpreadBps: 0, participation: 0.05 } });
    expect(r.fills).toEqual([]);
    expect(r.refused).toHaveLength(1);
    expect(r.notes.some((n) => n.startsWith("1 order was not filled"))).toBe(true);
    expect(r.metrics.endUsd).toBe(10_000);
  });

  it("scales weights that ask for more than the equity holds — a coin paid in full — rather than see the orders refused", async () => {
    const a = spot(pathOf(Array.from({ length: 30 }, (_, i) => 100 + i)));
    const b = { ...spot(pathOf(Array.from({ length: 30 }, (_, i) => 50 + i))), symbol: "Y/USD", base: "Y" };
    const r = await run({ markets: [a, b], strategy: spec("sma", { fast: 2, slow: 5, weight: 3 }) });
    expect(r.refused).toEqual([]);
    expect(r.notes.some((n) => /^1 decision asked for more than the equity holds .* was scaled down to fit it$/.test(n))).toBe(true);
    expect(r.fills.filter((f) => f.side === "buy")).toHaveLength(2);
  });

  it("carries funding: long the spot and short the perpetual while the funding pays past the threshold, flat once it falls", async () => {
    const bars = pathOf(Array.from({ length: 60 }, () => 100), 1e9);
    const rates = bars.map((x, i) => ({ at: x.t, rate: i < 30 ? 0.0001 : 0 }));
    const r = await run({ markets: [perp(bars, { funding: rates }), spot(bars)], strategy: spec("carry", { lookbackHours: 5, enterApr: 0.1, exitApr: 0.02, weight: 0.5 }) });
    const at = (k: number) => new Date(T0 + k * H).toISOString();
    // nothing until the window holds five hours' funding: at hour 4 it holds hours 0–4, at 0.01% an hour (87.6% a year) — the two legs at once
    expect(r.fills.map((f) => [f.symbol, f.side, f.qty, f.at])).toEqual([
      ["X/USD", "buy", 50, at(4)],
      ["X-PERP", "sell", 50, at(4)],
      // the rate is 0 from hour 30: at hour 34 the window is all of it, under 2% a year, and both legs come back
      ["X/USD", "sell", 50, at(34)],
      ["X-PERP", "buy", 50, at(34)],
    ]);
    // the short received each hour's 0.01% of its $5,000 from hour 5 to hour 29: 25 hours at $0.50; four fills at $5 each
    expect(r.funding).toEqual({ paidUsd: 0, receivedUsd: 12.5, hours: 25 });
    expect(r.metrics.endUsd).toBe(10_000 - 4 * 5 + 12.5);
    expect(r.leverage).toBe(2);
  });

  it("is the same run twice: the same bars, spec and costs give the same fills and the same equity", async () => {
    const closes: number[] = [];
    let p = 100;
    for (let i = 0; i < 400; i++) closes.push((p *= 1 + Math.sin(i / 7) * 0.01));
    const m = perp(pathOf(closes), { funding: pathOf(closes).map((b, i) => ({ at: b.t, rate: Math.cos(i / 9) * 0.0001 })) });
    const once = await run({ markets: [m], strategy: spec("tsmom", { lookbackDays: 2, volDays: 3, rebalanceHours: 6 }) });
    const twice = await run({ markets: [m], strategy: spec("tsmom", { lookbackDays: 2, volDays: 3, rebalanceHours: 6 }) });
    expect(once.fills.length).toBeGreaterThan(4);
    expect(twice.fills).toEqual(once.fills);
    expect(twice.equity).toEqual(once.equity);
    expect(twice.metrics).toEqual(once.metrics);
  });

  it("refuses a run it cannot make, in words", async () => {
    const m = perp(pathOf([100, 101]));
    const r = (o: Partial<BacktestRequest>) => runBacktest({ markets: [m], strategy: spec("hold"), from: T0, to: T0 + 2 * H, cashUsd: 10_000, feeBps: 10, home: tmp(), ...o }) as Promise<Refusal>;
    expect((await r({ markets: [] })).message).toBe("a backtest needs at least one market");
    expect((await r({ to: T0 })).message).toBe("a backtest's window ends after it starts");
    expect((await r({ cashUsd: 5 })).message).toMatch(/\$100 to/);
    expect((await r({ from: T0 + 10 * H, to: T0 + 20 * H })).message).toMatch(/^no bar of X-PERP starts between/);
  });
});

describe("the figures", () => {
  it("are the textbook's: return, the deepest drawdown and the time under it, a Sharpe scaled by the steps in a year", () => {
    const eq = [100, 110, 99, 120].map((usd, i) => ({ t: T0 + i * D, usd }));
    expect(stepReturns(eq).map((x) => Number(x.toFixed(6)))).toEqual([0.1, -0.1, Number((120 / 99 - 1).toFixed(6))]);
    expect(drawdown(eq)).toEqual({ max: 0.1, longestMs: D });
    const m = metricsOf(eq, { fills: 2, tradedUsd: 200, feesUsd: 0.2, fundingUsd: -1, slippageUsd: 0.1 });
    const rets = stepReturns(eq);
    const mean = rets.reduce((s, x) => s + x, 0) / 3;
    const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / 2);
    const perYear = 3 / (3 / 365);
    expect(m).toMatchObject({ startUsd: 100, endUsd: 120, returnPct: 20, maxDrawdownPct: 10, maxDrawdownDays: 1, steps: 3, perYear: 365, fills: 2, feesUsd: 0.2, fundingUsd: -1 });
    expect(m.sharpe).toBeCloseTo((mean / sd) * Math.sqrt(perYear), 2);
    expect(m.sharpeSe).toBeCloseTo(Math.sqrt((1 + (mean / sd) ** 2 / 2) / 3) * Math.sqrt(perYear), 2);
    expect(m.cagrPct).toBeCloseTo((1.2 ** (365 / 3) - 1) * 100, -2);
  });
});

describe("the strategies' specs", () => {
  it("take the defaults, read numbers given as words, and refuse an unknown id, an unknown parameter, a value out of bounds or out of order", () => {
    expect(strategySpec("tsmom")).toEqual({ id: "tsmom", params: { lookbackDays: 30, volTarget: 0.2, volDays: 30, rebalanceHours: 24, maxWeight: 1.5, buffer: 0.1 } });
    expect(strategySpec("sma", { fast: "10", slow: 50 })).toEqual({ id: "sma", params: { fast: 10, slow: 50, weight: 1 } });
    expect(strategySpec("hold")).toEqual({ id: "hold", params: {} });
    expect(strategySpec("magic")).toBe('a strategy is one of hold, sma, tsmom, carry, not "magic"');
    expect(strategySpec("hold", { weight: 1 })).toBe('hold takes no parameter, not "weight"');
    expect(strategySpec("sma", { fast: 50, slow: 20 })).toBe("sma's fast average is shorter than its slow one");
    expect(strategySpec("sma", { fast: 2.5 })).toBe("sma's fast is a whole number");
    expect(strategySpec("tsmom", { volTarget: 3 })).toMatch(/^tsmom's volTarget is 0.02 to 1/);
    expect(strategySpec("carry", { enterApr: 0.05, exitApr: 0.1 })).toBe("carry's exitApr is at most its enterApr");
    expect(strategySpec("tsmom", { lookbackDays: "soon" })).toBe("tsmom's lookbackDays is a number");
  });
});

/** a stand-in public source: hourly bars from `first` on (a price of 100 + the hour), funding of 0.00001 an hour, every ask written down */
function standIn(id: string, symbol: string, o: { first?: number; now: () => number; refuse?: boolean; ends?: string } = { now: () => T0 + 1000 * H }): PublicSource & { asked: string[] } {
  const asked: string[] = [];
  const first = o.first ?? T0 - 10_000 * H;
  return {
    id,
    name: `Stand-in ${id}`,
    kind: "exchange",
    connectTo: id,
    connector: `live:${id}`,
    asked,
    listings: async (q) => {
      asked.push(`listings:${q.q ?? ""}`);
      return [{ symbol, name: `${symbol} (stand-in)`, kind: symbol.endsWith("-PERP") ? "perp" : "spot", base: symbol.split(/[-/]/)[0]!, quote: symbol.endsWith("-PERP") ? "USDC" : "USD", open: true, types: [], maxLeverage: 25, qtyStep: 0.001, fundingEveryH: 1 }];
    },
    candles: async (s, interval, w) => {
      asked.push(`candles:${s}:${interval}:${new Date(w.since!).toISOString().slice(0, 13)}`);
      if (o.refuse) return { ok: false, code: "E_VENUE_UNREACHABLE", layer: "VENUE", message: "the stand-in does not answer" } as unknown as Refusal;
      const step = interval === "1d" ? D : H;
      const bars: Candle[] = [];
      for (let t = Math.max(w.since!, first); t < w.until! && t <= o.now(); t += step) bars.push({ t, o: 100 + t / H - T0 / H, h: 101 + t / H - T0 / H, l: 99 + t / H - T0 / H, c: 100.5 + t / H - T0 / H, v: 10 });
      return { bars, more: false, source: `Stand-in ${id} · ${s}`, ...(o.ends && !bars.length ? { ends: o.ends } : {}), ...(id === "us" ? { adjustment: "split-adjusted, not dividend-adjusted" } : {}) };
    },
    fundingHistory: async (s, from, to) => {
      asked.push(`funding:${s}:${new Date(from).toISOString().slice(0, 13)}`);
      const out: Array<{ at: number; rate: number }> = [];
      for (let t = Math.ceil(from / H) * H; t <= to; t += H) if (t >= first) out.push({ at: t, rate: 0.00001 });
      return out;
    },
  };
}

describe("the history, fetched and kept", () => {
  it("reads perp:, spot: and stock: markets, and refuses anything else, naming it", () => {
    expect(parseMarkets("perp:btc, spot:ETH,stock:brk.b")).toEqual([{ cls: "perp", base: "BTC" }, { cls: "spot", base: "ETH" }, { cls: "stock", base: "BRK.B" }]);
    expect(parseMarkets("")).toMatch(/^name at least one market/);
    expect(parseMarkets("future:BTC")).toBe('a market is perp:COIN, spot:COIN or stock:TICKER, not "future:BTC"');
    expect(parseMarkets("perp:BTC,perp:btc")).toBe("perp:btc is named twice");
    expect(parseMarkets(Array.from({ length: 13 }, (_, i) => `spot:C${i}`).join(","))).toBe("a backtest reads at most 12 markets");
  });

  it("asks once and keeps it: a window the cache covers asks nothing again, a wider one only its new end — bars that had closed only, with the funding and the market's steps", async () => {
    let now = T0 + 500 * H + 30 * 60_000;
    const sources: HistorySources = { perp: standIn("hl", "BTC-PERP", { now: () => now }), spot: standIn("cb", "BTC/USD", { now: () => now }), stock: standIn("us", "AAPL", { now: () => now }) };
    const cache = tmp();
    const ask = (to: number) => loadHistory({ refs: [{ cls: "perp", base: "BTC" }], interval: "1h", from: T0, to, cache, sources, clock: () => now });
    const first = await ask(T0 + 600 * H);
    if (isRefusal(first)) throw new Error(first.message);
    const m = first.markets[0]!;
    // the bar still forming at 08:30 (it started at 08:00 on the 500th hour) is not kept
    expect(m.bars.length).toBe(500);
    expect(m.bars[m.bars.length - 1]!.t).toBe(T0 + 499 * H);
    expect(m).toMatchObject({ symbol: "BTC-PERP", kind: "perp", quote: "USDC", maxLeverage: 25, qtyStep: 0.001, fundingEveryH: 1, from: "Stand-in hl · BTC-PERP", interval: "1h" });
    expect(m.funding!.length).toBe(501);
    const file = join(cache, "hl", "BTC-PERP", "1h.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const asked = (sources.perp as unknown as { asked: string[] }).asked;
    const before = asked.filter((a) => a.startsWith("candles")).length;
    // the same window again: nothing asked of the source's bars
    await ask(T0 + 500 * H);
    expect(asked.filter((a) => a.startsWith("candles")).length).toBe(before);
    // later, a wider window: only from the last bar kept on
    now = T0 + 700 * H;
    const wider = await ask(T0 + 700 * H);
    if (isRefusal(wider)) throw new Error(wider.message);
    expect(asked.filter((a) => a.startsWith("candles")).slice(before)).toEqual(["candles:BTC-PERP:1h:2026-01-21T19"]);
    expect(wider.markets[0]!.bars.length).toBe(700);
  });

  it("reads a share in daily bars whatever is asked, says the source's adjustment, and refuses a market with no bar in the window", async () => {
    const now = T0 + 400 * D;
    const sources: HistorySources = { perp: standIn("hl", "BTC-PERP", { now: () => now }), spot: standIn("cb", "BTC/USD", { now: () => now }), stock: standIn("us", "AAPL", { now: () => now, first: T0 }) };
    const got = await loadHistory({ refs: [{ cls: "stock", base: "AAPL" }], interval: "1h", from: T0, to: T0 + 30 * D, cache: tmp(), sources, clock: () => now });
    if (isRefusal(got)) throw new Error(got.message);
    expect(got.markets[0]).toMatchObject({ interval: "1d", kind: "spot", perYear: 252, from: "Stand-in us · AAPL (split-adjusted, not dividend-adjusted)" });
    const refused = (await loadHistory({ refs: [{ cls: "spot", base: "BTC" }], interval: "1h", from: T0, to: T0 + 10 * H, cache: tmp(), sources: { ...sources, spot: standIn("cb", "BTC/USD", { now: () => now, refuse: true }) }, clock: () => now })) as Refusal;
    expect(refused.message).toBe("spot:BTC: the stand-in does not answer");
  });
});

describe("the command", () => {
  const NOW = Date.parse("2026-10-24T12:34:00Z");
  const parse = (argv: string[]) => parseBacktestArgs(argv, { OPENPAPER_HOME: "/h" }, NOW);

  it("defaults to momentum on Bitcoin's perpetual, hourly, the 180 days to now, $10,000 at the paper account's fee, with the buy-and-hold beside it; reads each option, = or not", () => {
    const d = parse([]) as BacktestOptions;
    expect(d).toMatchObject({ spec: { id: "tsmom" }, refs: [{ cls: "perp", base: "BTC" }], interval: "1h", to: Date.parse("2026-10-24T12:00:00Z"), cashUsd: 10_000, feeBps: 10, benchmark: true, json: false, save: true, home: "/h", cache: join("/h", "history") });
    expect(d.from).toBe(d.to - 180 * D);
    expect(d.leverage).toBeUndefined();
    const o = parse(["--strategy=sma", "--markets", "perp:ETH,spot:SOL", "--interval", "4h", "--from", "2026-01-01", "--to=2026-06-01", "--cash", "5000", "--fee-bps", "4.5", "--leverage", "3", "--param", "fast=10", "--param=slow=40", "--half-spread-bps", "2", "--participation", "0.01", "--level-bps", "3", "--no-benchmark", "--json", "--no-save", "--cache", "/c", "--quiet"]) as BacktestOptions;
    expect(o).toMatchObject({ spec: { id: "sma", params: { fast: 10, slow: 40, weight: 1 } }, refs: [{ cls: "perp", base: "ETH" }, { cls: "spot", base: "SOL" }], interval: "4h", from: Date.parse("2026-01-01T00:00:00Z"), to: Date.parse("2026-06-01T00:00:00Z"), cashUsd: 5000, feeBps: 4.5, leverage: 3, costs: { halfSpreadBps: 2, participation: 0.01, levelBps: 3, levels: 5 }, benchmark: false, json: true, save: false, cache: "/c" });
    expect(o.say).toBeUndefined();
    // shares alone pay no fee by default, as the paper account charges none for a share
    expect((parse(["--markets", "stock:SPY,stock:QQQ"]) as BacktestOptions).feeBps).toBe(0);
  });

  it("refuses what it cannot read, naming it, and prints the usage for --help or a stray option", () => {
    const err = (argv: string[]) => (parse(argv) as { error: string }).error;
    expect(err(["--days", "1"])).toMatch(/^unknown option --days\nusage: npm run account:backtest/);
    expect(err(["--strategy", "magic"])).toBe('a strategy is one of hold, sma, tsmom, carry, not "magic"');
    expect(err(["--param", "lookbackDays=500"])).toMatch(/^tsmom's lookbackDays is 1 to 365/);
    expect(err(["--param", "nope"])).toBe('--param is name=value, not "nope"');
    expect(err(["--interval", "5m"])).toBe('--interval is 1h, 4h, 1d, not "5m"');
    expect(err(["--from", "yesterday"])).toBe('--from is YYYY-MM-DD, not "yesterday"');
    expect(err(["--from", "2026-06-01", "--to", "2026-05-01"])).toBe("--to is after --from");
    expect(err(["--cash", "5"])).toBe("--cash is 100 to 100000000");
    expect(err(["--leverage", "100"])).toBe("--leverage is 1 to 50");
    expect(err(["--participation", "0"])).toBe("--participation is more than 0, at most 1");
    expect(err(["--markets"])).toMatch(/^--markets needs a value/);
    expect(parse(["--help"])).toEqual({ help: true });
  });

  it("runs the strategy and the buy-and-hold over the history it reads, keeps the run in the home (0600), and says it in words", async () => {
    const now = T0 + 2000 * H;
    const sources: HistorySources = { perp: standIn("hl", "BTC-PERP", { now: () => now }), spot: standIn("cb", "BTC/USD", { now: () => now }), stock: standIn("us", "AAPL", { now: () => now }) };
    const home = tmp();
    const o = parseBacktestArgs(["--strategy", "sma", "--param", "fast=5", "--param", "slow=20", "--markets", "perp:BTC", "--from", "2026-02-01", "--to", "2026-03-01", "--quiet"], { OPENPAPER_HOME: home }, now) as BacktestOptions;
    const out = await backtest(o, sources, () => now);
    if (isRefusal(out)) throw new Error(out.message);
    expect(out.run.strategy).toMatchObject({ id: "sma", name: "Moving-average cross", paramWords: "fast 5 · slow 20 · weight 1" });
    expect(out.benchmark?.strategy.id).toBe("hold");
    expect(out.saved).toBe(join(home, "backtest", "runs", `${out.id}.json`));
    expect(statSync(out.saved!).mode & 0o777).toBe(0o600);
    const kept = JSON.parse(readFileSync(out.saved!, "utf8")) as { version: number; id: string; markets: string[]; run: BacktestRun; benchmark: BacktestRun };
    expect(kept).toMatchObject({ version: 1, id: out.id, markets: ["perp:BTC"] });
    expect(kept.run.metrics).toEqual(out.run.metrics);
    const words = backtestWords(out);
    expect(words).toMatch(new RegExp(`^Backtest ${out.id} · Moving-average cross \\(sma\\) · fast 5 · slow 20 · weight 1`));
    expect(words).toContain("BTC-PERP    Stand-in hl · BTC-PERP · 1h");
    expect(words).toMatch(/Strategy +Buy and hold/);
    expect(words).toContain(`Kept: ${out.saved}`);
    // the cache was written in the home, beside the run
    expect(existsSync(join(home, "history", "hl", "BTC-PERP", "1h.json"))).toBe(true);
  });
});
