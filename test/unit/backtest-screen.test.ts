import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { parseBacktestArgs, screenWords, trialsWords } from "../../src/portfolio/account-backtest.ts";
import { loadHistory } from "../../src/portfolio/backtest/data.ts";
import { deskSpec, labEvaluate, labList, labRead, labRun, labScreen, runFile, screenAskOf, type LabAsk, type LabDeps, type LabOutcome, type ScreenOutcome, type ScreenRow } from "../../src/portfolio/backtest/lab.ts";
import { barsOf, baselineOf, screenCosts, screenTrade, SWEEP_GRID, sweepOf, tapeOf, tradesOf, type ScreenedTrade } from "../../src/portfolio/backtest/screen.ts";
import { DEFAULT_COSTS, type BacktestMarket } from "../../src/portfolio/backtest/source.ts";
import { strategySpec } from "../../src/portfolio/backtest/strategies.ts";
import { INTERVAL_MS, type CandleInterval } from "../../src/portfolio/live/trade.ts";
import { standinHistory } from "../standin/history.ts";

/** THE SCREEN (backtest/screen.ts): trades judged over recorded bars by the paper account's own rules for a bar — entered at the open at the
 * ask or the bid, the stop taken before the take-profit within a bar and at the open where a bar gapped past it, the time limit closed at
 * the next open, the fee both ways, a perpetual's funding bar by bar — fast enough to set a run's entries beside a thousand tries of random
 * ones (the baseline) and to close them by hundreds of exit rules (the sweep), every rule counted in the trials ledger (backtest/lab.ts
 * labScreen). Checked against the paper account itself on a desk run's own round trips. History from the stand-in: no network */
const H = 3_600_000;
const NOW = Date.parse("2026-10-29T12:34:00Z");
const T0 = Date.parse("2026-01-01T00:00:00Z");
const ID = "20261029T120000-0123456789";

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
function lab(): LabDeps {
  const home = mkdtempSync(join(tmpdir(), "backtest-screen-"));
  homes.push(home);
  return { home, cache: join(home, "history"), sources: standinHistory(() => NOW), clock: () => NOW };
}
const ok = <T>(r: T | Refusal): T => {
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
};
const desk = (o: Partial<LabAsk> = {}): LabAsk => ({ spec: deskSpec() as LabAsk["spec"], refs: [{ cls: "perp", base: "BTC" }, { cls: "perp", base: "ETH" }], interval: "4h", window: "train", cashUsd: 25_000, feeBps: 10, costs: DEFAULT_COSTS, benchmark: false, save: true, by: "terminal", ...o });

/** a market from [open, high, low, close] rows, each a bar of `interval` from T0: a perpetual unless said */
function market(rows: Array<[number, number, number, number]>, o: Partial<BacktestMarket> = {}): BacktestMarket {
  const interval: CandleInterval = o.interval ?? "1h";
  return { symbol: "BTC-PERP", kind: "perp", base: "BTC", quote: "USD", name: "Bitcoin", from: "a test", interval, bars: rows.map(([op, hi, lo, cl], i) => ({ t: T0 + i * INTERVAL_MS[interval], o: op, h: hi, l: lo, c: cl })), ...o };
}
const NO_COST = { half: 0, fee: 0 };
/** a 10 bps fee and a 1 bp half spread */
const COST = screenCosts(10, 1);
const net = (side: number, entry: number, exit: number, fee = 0.001): number => (side * (exit - entry) - fee * (entry + exit)) / entry;

describe("a trade on the screen", () => {
  it("enters at the open at the ask, and is closed by its stop before its take-profit within one bar — at the stop, or at the open where the bar gapped past it — or by its take-profit at its price", () => {
    const rule = { tp: 0.02, sl: 0.01, bars: 10 };
    const entry = 100 * 1.0001;
    const both = tapeOf(market([[100, 101, 99.5, 100.5], [100.5, 103, 98, 101]]));
    expect(screenTrade(both, 0, 1, rule, COST)).toBeCloseTo(net(1, entry, entry * 0.99), 12);
    const up = tapeOf(market([[100, 101, 99.5, 100.5], [100.5, 103, 100, 102]]));
    expect(screenTrade(up, 0, 1, rule, COST)).toBeCloseTo(net(1, entry, entry * 1.02), 12);
    const gap = tapeOf(market([[100, 101, 99.5, 100.5], [97, 98, 96, 97.5]]));
    expect(screenTrade(gap, 0, 1, rule, COST)).toBeCloseTo(net(1, entry, 97), 12);
    // a short the other way round: in at the bid, its stop above, its take-profit below — the stop first where a bar reached both
    const sold = 100 * 0.9999;
    const down = tapeOf(market([[100, 100.5, 99, 99.5], [99.5, 101.5, 97, 98]]));
    expect(screenTrade(down, 0, -1, rule, COST)).toBeCloseTo(net(-1, sold, sold * 1.01), 12);
    expect(screenTrade(tapeOf(market([[100, 100.5, 99, 99.5], [99.5, 99.8, 97, 98]])), 0, -1, rule, COST)).toBeCloseTo(net(-1, sold, sold * 0.98), 12);
  });

  it("is closed by its time limit at the open of the bar after its last, at the bid — and past the bars, at their last close", () => {
    const flat = tapeOf(market([[100, 100.5, 99.8, 100.2], [100.2, 100.6, 99.9, 100.4], [100.4, 100.7, 100, 100.6], [100.6, 100.9, 100.3, 100.8]]));
    const entry = 100 * 1.0001;
    expect(screenTrade(flat, 0, 1, { tp: 0.02, sl: 0.01, bars: 2 }, COST)).toBeCloseTo(net(1, entry, 100.4 * 0.9999), 12);
    expect(screenTrade(flat, 0, 1, { tp: 0.02, sl: 0.01, bars: 10 }, COST)).toBeCloseTo(net(1, entry, 100.8 * 0.9999), 12);
    // no take-profit and no stop: held as many bars as asked
    expect(screenTrade(flat, 1, 1, { tp: Number.POSITIVE_INFINITY, sl: Number.POSITIVE_INFINITY, bars: 1 }, NO_COST)).toBeCloseTo(100.4 / 100.2 - 1, 12);
    // a time limit in hours, in bars of the desk's clock: the first step at or past it
    expect([barsOf(24, H), barsOf(24, 4 * H), barsOf(5, 4 * H), barsOf(0.5, H)]).toEqual([24, 6, 2, 1]);
  });

  it("pays a perpetual's funding for every bar it was held through — each rate in the bar that ends at it or after it, on the bar's close — and a coin's none", () => {
    const rows: Array<[number, number, number, number]> = [
      [100, 100.5, 99.5, 100],
      [100, 100.5, 99.5, 100],
      [100, 100.5, 99.5, 100],
    ];
    const funding = [
      { at: T0 + H, rate: 0.001 },
      { at: T0 + 2 * H, rate: 0.002 },
      { at: T0 + 3 * H, rate: 0.0005 },
    ];
    const tape = tapeOf(market(rows, { funding }));
    expect(Array.from(tape.fund)).toEqual([0.001, 0.002, 0.0005]);
    const held = { tp: Number.POSITIVE_INFINITY, sl: Number.POSITIVE_INFINITY, bars: 2 };
    // the long pays the two bars it was held through, the short is paid them
    expect(screenTrade(tape, 0, 1, held, NO_COST)).toBeCloseTo(-0.003, 12);
    expect(screenTrade(tape, 0, -1, held, NO_COST)).toBeCloseTo(0.003, 12);
    expect(Array.from(tapeOf(market(rows, { kind: "spot", funding })).fund)).toEqual([0, 0, 0]);
    // a 4h bar holds its four hours' rates
    const four = tapeOf(market([[100, 101, 99, 100]], { interval: "4h", funding: [1, 2, 3, 4].map((k) => ({ at: T0 + k * H, rate: 0.0001 })) }));
    expect(four.fund[0]).toBeCloseTo(0.0004, 12);
  });
});

describe("the screen beside the paper account", () => {
  it("makes of a desk run's own round trips what the paper account made of them — trip by trip, at the stops, take-profits and time limits alike — and every run that closed some keeps its baseline", async () => {
    const deps = lab();
    const r = ok(await labRun(desk({ from: Date.parse("2026-07-01T00:00:00Z") }), deps));
    const trips = r.run.trips ?? [];
    expect(trips.length).toBeGreaterThan(20);
    expect(new Set(trips.map((t) => t.end))).toEqual(new Set(["take-profit", "stop-loss", "closed"]));
    const from = Date.parse(r.run.from);
    const to = Date.parse(r.run.to);
    const loaded = await loadHistory({ refs: [{ cls: "perp", base: "BTC" }, { cls: "perp", base: "ETH" }], interval: "4h", from, to, cache: deps.cache, sources: deps.sources, clock: deps.clock });
    if (isRefusal(loaded)) throw new Error(loaded.message);
    const tapes = loaded.markets.map((m) => tapeOf(m, from, to));
    const trades = tradesOf(trips, tapes);
    expect(trades).toHaveLength(trips.length);
    // the desk's plan: its take-profit, stop and time limit in 4h bars
    expect(trades[0]).toMatchObject({ plan: { tpPct: 2, slPct: 1, maxHours: 24 }, rule: { tp: 0.02, sl: 0.01, bars: 6 } });
    const costs = screenCosts(r.run.feeBps, r.run.costs.halfSpreadBps);
    for (const x of trades) expect(Math.abs(screenTrade(tapes[x.tape]!, x.bar, x.side, x.rule, costs) - x.paper!)).toBeLessThan(1e-6);
    // the run's baseline, kept with it: its own trades screened within a hair of the paper account's
    expect(r.baseline).toMatchObject({ trades: trips.length, monkeys: 1_000 });
    expect(r.baseline!.gapPct).toBeLessThan(0.0001);
    expect(r.baseline!.words).toMatch(/^This run's \d+ entries made [+−][\d.]+% a trade, screened; random entries on the same markets and sides, with the same exits, made /);
    const kept = JSON.parse(readFileSync(runFile(deps.home, r.id), "utf8")) as { baseline?: unknown };
    expect(kept.baseline).toEqual(r.baseline);
  });
});

/** a tape of flat hourly bars at 100, with a bar that rises to 103 every ten (and one that falls to 97 five after it) */
function sawtooth(n = 300): BacktestMarket {
  const rows: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) rows.push(i % 10 === 0 ? [100, 103, 99.9, 100] : i % 10 === 5 ? [100, 100.1, 97, 100] : [100, 100.3, 99.7, 100]);
  return market(rows);
}
const plan = { tpPct: 2, slPct: 1, maxHours: 3 };
const at = (bars: number[]): ScreenedTrade[] => bars.map((bar) => ({ tape: 0, bar, side: 1 as const, rule: { tp: 0.02, sl: 0.01, bars: 3 }, usd: 1_000, plan }));

describe("the baseline", () => {
  it("ranks a run's own entries among random ones on the same markets, sides and exits: before every rise better than chance, before every fall worse, a few too few to say", () => {
    const tapes = [tapeOf(sawtooth())];
    const rises = at(Array.from({ length: 30 }, (_, k) => k * 10));
    const better = baselineOf({ tapes, trades: rises, costs: COST, seed: "a" })!;
    expect(better).toMatchObject({ trades: 30, monkeys: 1_000, verdict: "better", rank: 1 });
    // (1 + no try as good) / (1 + the tries), to four places
    expect(better.p).toBe(0.001);
    expect(better.ownPct).toBeGreaterThan(better.highPct);
    expect(better.words).toContain("their timing beat chance (p 0.001)");
    const falls = baselineOf({ tapes, trades: at(Array.from({ length: 30 }, (_, k) => k * 10 + 5)), costs: COST, seed: "a" })!;
    expect(falls).toMatchObject({ verdict: "worse", rank: 0 });
    expect(falls.words).toContain("their timing did worse than chance");
    expect(baselineOf({ tapes, trades: rises.slice(0, 10), costs: COST, seed: "a" })).toMatchObject({ trades: 10, verdict: "few" });
    expect(baselineOf({ tapes, trades: [], costs: COST, seed: "a" })).toBeUndefined();
    // drawn from its seed: the same seed, the same tries; and its tries in twenty bins, every one of them counted
    expect(baselineOf({ tapes, trades: rises, costs: COST, seed: "a" })).toEqual(better);
    expect(better.bins.counts.reduce((s, n) => s + n, 0)).toBe(1_000);
    expect(baselineOf({ tapes, trades: rises, costs: COST, seed: "b" })!.medianPct).not.toBe(better.medianPct);
  });
});

describe("the sweep", () => {
  it("closes a run's entries by every rule of the grid — in the grid's order, the run's own exits ranked among them — deflates the best by every strategy counted, and tries it all again on random entries", () => {
    const tapes = [tapeOf(sawtooth())];
    const trades = at(Array.from({ length: 30 }, (_, k) => k * 10));
    const grid = { tpPct: [1, 2, 4], slPct: [0.5, 1], hours: [1, 3] };
    const o = { tapes, trades, grid, costs: COST, from: T0, to: T0 + 300 * H, cashUsd: 10_000, seed: "s" };
    const s = sweepOf(o)!;
    expect(s).toMatchObject({ trades: 30, rules: 12, grid });
    expect(s.means).toHaveLength(12);
    expect(s.sharpes).toHaveLength(12);
    // the time limits slowest, then the stops, then the take-profits: the first rule 1% · 0.5% · 1 h, the second 2% · 0.5% · 1 h
    const one = (tpPct: number, slPct: number, hours: number) => (trades.reduce((sum, x) => sum + screenTrade(tapes[0]!, x.bar, 1, { tp: tpPct / 100, sl: slPct / 100, bars: hours }, COST), 0) / 30) * 100;
    expect(s.means[0]).toBeCloseTo(one(1, 0.5, 1), 3);
    expect(s.means[1]).toBeCloseTo(one(2, 0.5, 1), 3);
    expect(s.means[3]).toBeCloseTo(one(1, 1, 1), 3);
    // a rise reaches 2% within its bar, never 4%: the best rule takes 2%
    expect(s.best).toMatchObject({ tpPct: 2, winRatePct: 100 });
    expect(s.top[0]).toEqual(s.best);
    expect(s.own).toMatchObject({ tpPct: 2, slPct: 1, hours: 3 });
    expect(s.deflated.trials).toBe(12);
    expect(s.chance.tries).toBe(100);
    expect(s.words).toMatch(/^12 exit rules screened on this run's 30 entries\. The best — a take-profit at 2%, a stop at [\d.]+%, \d h at most — made \+[\d.]+% a trade and won 100% of them/);
    expect(s.words).toContain("Screened, not run: what a rule would have made is a run of the desk with it");
    // the strategies tried before it count too; the same sweep, the same figures
    expect(sweepOf({ ...o, others: 5 })!.deflated.trials).toBe(17);
    expect(sweepOf(o)).toEqual(s);
    expect(sweepOf({ ...o, trades: [] })).toBeUndefined();
  });
});

describe("an exit sweep in the lab", () => {
  it("sweeps a kept desk run's exits: a row of the ledger with every rule's figures, each rule a strategy tried from then on — counted once however often the same sweep runs — listed with the runs and read with its run", async () => {
    const deps = lab();
    const r = ok(await labRun(desk({ from: Date.parse("2026-06-15T00:00:00Z") }), deps));
    const trips = r.run.trips!.length;
    expect(trips).toBeGreaterThanOrEqual(30);
    const before = labList(deps.home, NOW).ledger;
    const grid = { tpPct: [1, 2, 4], slPct: [0.5, 1, 2], hours: [12, 24, 72] };
    const s = ok(await labScreen({ run: r.id, grid, by: "request", seat: "0xScreener" }, deps));
    expect(s.row).toMatchObject({ kind: "screen", by: "request", seat: "0xScreener", run: r.id, window: "train", strategy: "desk", markets: ["perp:BTC", "perp:ETH"], interval: "4h", trades: trips, grid, rules: 27, feeBps: 10, cashUsd: 25_000 });
    expect(s.row.means).toHaveLength(27);
    expect(s.row.sharpes).toEqual(s.sweep.sharpes);
    // the desk's own exits among the rules; the best deflated by the rules and the run tried before them
    expect(s.sweep.own).toMatchObject({ tpPct: 2, slPct: 1, hours: 24 });
    expect(s.sweep.deflated.trials).toBe(27 + 1);
    expect(labList(deps.home, NOW).ledger).toMatchObject({ rows: before.rows + 1, trials: before.trials, distinct: before.distinct + 27, screens: 1, intact: true });
    // the same sweep again: a row more, its rules counted once
    ok(await labScreen({ run: r.id, grid, by: "terminal" }, deps));
    const L = labList(deps.home, NOW);
    expect(L.ledger).toMatchObject({ distinct: before.distinct + 27, screens: 2 });
    const line = L.runs[0] as Record<string, unknown>;
    expect(line).toMatchObject({ kind: "screen", run: r.id, rules: 27, best: s.sweep.best });
    expect(line.means).toBeUndefined();
    expect(trialsWords(L)).toMatch(/sweep perp:BTC,perp:ETH 4h {2}2026-06-15 → 2026-07-31 {2}27 exit rules over run \d{8}T\d{6}-[0-9a-f]{10}'s \d+ round trips: the best, TP/);
    // read with its run, newest first, with every rule's figures
    const read = ok(labRead(deps.home, r.id)) as { screens: ScreenRow[]; baseline: { trades: number } };
    expect(read.screens.map((x) => x.by)).toEqual(["terminal", "request"]);
    expect(read.screens[0]!.sharpes).toHaveLength(27);
    expect(read.baseline.trades).toBe(trips);
    // a later run's Sharpe deflated by the rules as strategies tried
    const sma = ok(await labRun({ ...desk(), spec: strategySpec("sma", { fast: 10, slow: 40 }) as LabAsk["spec"], refs: [{ cls: "perp", base: "BTC" }], from: Date.parse("2026-06-15T00:00:00Z") }, deps));
    expect(sma.deflated!.trials).toBe(2 + 27);
    expect(screenWords(s)).toMatch(/^Exit sweep of run \S+ · desk · 27 rules over \d+ round trips · perp:BTC,perp:ETH 4h/);
  });

  it("refuses what it cannot sweep: no such run, a strategy's run, a look at the held-out data, a run not kept, too few round trips, too many rules", async () => {
    const deps = lab();
    const grid = { tpPct: [1, 2], slPct: [1], hours: [24] };
    const sweep = (run: string, g = grid) => labScreen({ run, grid: g, by: "request" }, deps) as Promise<ScreenOutcome | Refusal>;
    expect(await sweep(ID)).toMatchObject({ code: "E_ACCOUNT_BAD_ACTION", message: `no trial ran as ${ID}` });
    expect(await sweep("../secrets")).toMatchObject({ message: "a run's id is like 20261029T120000-0123456789" });
    const sma = ok(await labRun({ ...desk(), spec: strategySpec("sma", { fast: 10, slow: 40 }) as LabAsk["spec"], refs: [{ cls: "perp", base: "BTC" }], from: Date.parse("2026-06-15T00:00:00Z") }, deps));
    expect(await sweep(sma.id)).toMatchObject({ message: "an exit sweep tries a desk run's leads with other take-profits, stops and time limits: sma closes its trades by its own signal" });
    const look = ok(await labEvaluate(sma.id, deps, "terminal"));
    expect(await sweep(look.id)).toMatchObject({ code: "E_ACCOUNT_OWNER_ONLY", message: `${look.id} is a look at the held-out data: exits picked on it would hold nothing out — sweep the training run it tried` });
    const unkept = ok(await labRun(desk({ from: Date.parse("2026-07-20T00:00:00Z"), save: false }), deps));
    expect(await sweep(unkept.id)).toMatchObject({ message: `run ${unkept.id} is not kept: a sweep reads a kept run's round trips` });
    const short = ok(await labRun(desk({ from: Date.parse("2026-07-28T00:00:00Z") }), deps));
    expect(await sweep(short.id)).toMatchObject({ message: `an exit sweep needs 30 round trips at least: run ${short.id} closed ${short.run.trips!.length}` });
    const r = ok(await labRun(desk({ from: Date.parse("2026-06-15T00:00:00Z") }), deps));
    const many = Array.from({ length: 20 }, (_, k) => k + 1);
    expect(await sweep(r.id, { tpPct: many, slPct: many, hours: many })).toMatchObject({ message: "8,000 rules: a sweep tries 4,000 at most" });
  });
});

describe("an exit sweep, asked", () => {
  it("is read strictly — the run's id, each list within the desk's own bounds, a list left out the default grid's — at the terminal too", () => {
    expect(screenAskOf({ run: ID })).toEqual({ run: ID, grid: { tpPct: [...SWEEP_GRID.tpPct], slPct: [...SWEEP_GRID.slPct], hours: [...SWEEP_GRID.hours] } });
    expect(screenAskOf({ run: ID, tpPct: [2, 1, 2], seat: "0xA" })).toMatchObject({ grid: { tpPct: [1, 2] }, seat: "0xA" });
    expect(screenAskOf({ run: "x" })).toBe("run is a kept desk run's id, like 20261029T120000-0123456789");
    expect(screenAskOf({ run: ID, depth: 1 })).toBe('an exit sweep is asked with run, tpPct, slPct, hours, seat — not "depth"');
    expect(screenAskOf({ run: ID, slPct: [0.05] })).toBe("slPct is a list of 1 to 20 numbers, each 0.1 to 50");
    expect(screenAskOf({ run: ID, hours: [] })).toBe("hours is a list of 1 to 20 numbers, each 1 to 720");
    expect(screenAskOf({ run: ID, tpPct: "1,2" })).toBe("tpPct is a list of 1 to 20 numbers, each 0.1 to 50");
    expect(screenAskOf({ run: ID, seat: "a b" })).toBe("seat names who asks: up to 80 letters, digits and . : @ _ -");
    expect(parseBacktestArgs(["--screen", ID, "--tp-pct", "1,2", "--hours", "24"], { OPENPAPER_HOME: "/h" }, NOW)).toMatchObject({ screen: { run: ID, grid: { tpPct: [1, 2], slPct: [...SWEEP_GRID.slPct], hours: [24] } }, home: "/h", cache: "/h/history", json: false });
    expect(parseBacktestArgs(["--screen", ID, "--sl-pct", "x"], {}, NOW)).toEqual({ error: "--sl-pct is a list of 1 to 20 numbers, each 0.1 to 50" });
    expect(parseBacktestArgs(["--screen", ID, "--strategy", "sma"], {}, NOW)).toEqual({ error: "--screen goes with --tp-pct and --sl-pct and --hours and --json and --cache and --home and --quiet, not --strategy" });
  });
});
