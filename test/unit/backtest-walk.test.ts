import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { parseBacktestArgs } from "../../src/portfolio/account-backtest.ts";
import { labRead, readTrials, type LabDeps, type TrialRow } from "../../src/portfolio/backtest/lab.ts";
import { DEFAULT_COSTS } from "../../src/portfolio/backtest/source.ts";
import { combinations, labWalkForward, walkAskOf, walkSummary, type WalkAsk, type WalkOutcome } from "../../src/portfolio/backtest/walk.ts";
import { standinHistory } from "../standin/history.ts";

/** WALK-FORWARD (backtest/walk.ts, the command's --grid and --folds): a strategy's numbers picked on each fold's past and tried on the fold,
 * every try counted in the ledger, the out-of-sample runs chained into the walk. History from the stand-in (test/standin/history.ts) */
const NOW = Date.parse("2026-10-29T12:34:00Z");
const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
function lab(): LabDeps {
  const home = mkdtempSync(join(tmpdir(), "backtest-walk-"));
  homes.push(home);
  return { home, cache: join(home, "history"), sources: standinHistory(() => NOW), clock: () => NOW };
}
const ask = (o: Partial<WalkAsk> = {}): WalkAsk => ({ strategy: "sma", grid: { fast: [5, 10], slow: [30, 60] }, fixed: {}, folds: 3, rolling: false, refs: [{ cls: "perp", base: "BTC" }], interval: "4h", from: Date.parse("2026-03-01T00:00:00Z"), to: Date.parse("2026-07-31T00:00:00Z"), cashUsd: 10_000, feeBps: 10, costs: DEFAULT_COSTS, by: "terminal", ...o });
const ok = (r: WalkOutcome | Refusal): WalkOutcome => {
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
};

describe("a grid", () => {
  it("is every combination of the values named, in their order", () => {
    expect(combinations({ fast: [5, 10], slow: [30, 60] })).toEqual([{ fast: 5, slow: 30 }, { fast: 5, slow: 60 }, { fast: 10, slow: 30 }, { fast: 10, slow: 60 }]);
    expect(combinations({})).toEqual([{}]);
  });
});

describe("the walk", () => {
  it("cuts the window into folds + 1 stretches, picks each fold's best Sharpe in sample (anchored: every stretch before it), runs it out of sample, and counts every run", async () => {
    const deps = lab();
    const w = ok(await labWalkForward(ask(), deps));
    expect(w.combos).toBe(4);
    expect(w.folds.map((f) => [f.inSample.from.slice(0, 10), f.inSample.to.slice(0, 10)])).toEqual([["2026-03-01", "2026-04-08"], ["2026-03-01", "2026-05-16"], ["2026-03-01", "2026-06-23"]]);
    expect(w.folds.map((f) => f.outSample.to.slice(0, 10))).toEqual(["2026-05-16", "2026-06-23", "2026-07-31"]);
    // every in-sample try and every out-of-sample run is a row: four combinations over three folds, and three runs out of sample
    expect(w.trials).toEqual({ added: 4 * 3 + 3, inSample: 12, outSample: 3 });
    const rows = readTrials(deps.home).rows.filter((r): r is TrialRow => r.kind === "trial");
    expect(rows).toHaveLength(15);
    // each fold's pick is the combination with the best in-sample Sharpe among its four tries
    for (const [k, f] of w.folds.entries()) {
      const tries = rows.slice(k * 5, k * 5 + 4);
      const best = tries.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
      expect(f.picked).toEqual({ fast: best.params.fast, slow: best.params.slow });
      expect(f.inSharpe).toBe(best.sharpe);
      expect(rows[k * 5 + 4]).toMatchObject({ run: f.out.id, kept: true, params: { fast: f.picked.fast, slow: f.picked.slow } });
      // the out-of-sample run opens like any run
      expect(isRefusal(labRead(deps.home, f.out.id))).toBe(false);
    }
    // the in-sample tries are counted, not kept
    expect(rows.filter((r) => !r.kept)).toHaveLength(12);
  });

  it("chains the out-of-sample runs from the walk's money into one curve, says its figures and how much of the picks' in-sample Sharpe it kept", async () => {
    const w = ok(await labWalkForward(ask({ rolling: true }), lab()));
    expect(w.folds.map((f) => f.inSample.from.slice(0, 10))).toEqual(["2026-03-01", "2026-04-08", "2026-05-16"]);
    expect(w.equity[0]!.usd).toBe(10_000);
    // in time order, one curve
    expect(w.equity.map((p) => p.t)).toEqual([...w.equity.map((p) => p.t)].sort((a, b) => a - b));
    const chained = w.folds.reduce((x, f) => x * (1 + f.out.returnPct / 100), 1);
    expect(w.metrics.returnPct).toBeCloseTo((chained - 1) * 100, 1);
    expect(w.metrics.fills).toBe(w.folds.reduce((s, f) => s + f.out.fills, 0));
    expect(w.outSharpe).toBe(w.metrics.sharpe);
    if (w.inSharpeMean > 0) expect(w.efficiency).toBeCloseTo(w.metrics.sharpe / w.inSharpeMean, 9);
    else expect(w.efficiency).toBeNull();
  });

  it("refuses a grid it cannot walk — a number out of bounds, too many combinations, folds out of range, a window past the holdout — before it runs anything", async () => {
    const deps = lab();
    const no = async (o: Partial<WalkAsk>) => ((await labWalkForward(ask(o), deps)) as Refusal).message;
    expect(await no({ grid: { fast: [5, 1000] } })).toMatch(/^sma's fast is /);
    expect(await no({ grid: { fast: Array.from({ length: 8 }, (_, i) => i + 2), slow: Array.from({ length: 7 }, (_, i) => i + 30) } })).toBe("a grid holds 50 combinations at most; this one holds 56");
    expect(await no({ folds: 1 })).toBe("a walk-forward has 2 to 10 folds");
    expect(await no({ fixed: { fast: 5 } })).toBe("fast is both a grid and a fixed number");
    expect(await no({ to: Date.parse("2026-09-01T00:00:00Z") })).toMatch(/^the data from 2026-07-31 on is held out: a walk-forward walks before it/);
    expect(readTrials(deps.home).rows.filter((r) => r.kind === "trial")).toHaveLength(0);
  });
});

describe("a walk a request asks for", () => {
  it("is read strictly: the grid as {name: [numbers]}, the folds, rolling, the rest as one run is asked — its numbers checked with the grid's first values", () => {
    const w = walkAskOf({ strategy: "sma", grid: { fast: [5, 10, 5] }, folds: 3, rolling: true, params: { slow: 15 }, markets: "perp:BTC", interval: "4h", seat: "0xSeat" });
    expect(w).toMatchObject({ strategy: "sma", grid: { fast: [5, 10] }, fixed: { slow: 15, weight: 1 }, folds: 3, rolling: true, refs: [{ cls: "perp", base: "BTC" }], interval: "4h", seat: "0xSeat" });
    expect(walkAskOf({})).toMatchObject({ strategy: "tsmom", grid: {}, folds: 4, rolling: false });
    const no = (body: Record<string, unknown>) => walkAskOf(body) as string;
    expect(no({ grid: [5, 10] })).toBe("grid is {name: [numbers]}");
    expect(no({ grid: { fast: "5,10" } })).toBe("grid.fast is a list of 1 to 20 numbers");
    expect(no({ grid: { fast: [] } })).toBe("grid.fast is a list of 1 to 20 numbers");
    expect(no({ grid: { "fa st": [5] } })).toBe('grid names a number by its name, not "fa st"');
    expect(no({ folds: 11 })).toBe("folds is a whole number, 2 to 10");
    expect(no({ rolling: "yes" })).toBe("rolling is true or false");
    expect(no({ benchmark: true })).toBe("a walk-forward runs no buy-and-hold beside it: no benchmark");
    expect(no({ strategy: "desk" })).toMatch(/^the desk does not walk/);
    expect(no({ strategy: "sma", grid: { fast: [5] }, params: { fast: 6 } })).toBe("fast is both a grid and a fixed number");
    expect(no({ strategy: "sma", grid: { fast: [50] }, params: { slow: 40 } })).toBe("sma's fast average is shorter than its slow one");
    expect(no({ code: "x" })).toMatch(/^a backtest is asked with /);
  });

  it("is refused before anything runs when it would take more than the work it may — with its estimate — and its answer carries a thinned curve", async () => {
    const deps = lab();
    const over = (await labWalkForward(ask({ maxWork: 1_000 }), deps)) as Refusal;
    expect(over).toMatchObject({ code: "E_ACCOUNT_LIMIT" });
    expect(over.message).toMatch(/^a walk-forward here takes 1,000 steps across its markets at most; this one would take about [\d,]+ — fewer combinations or folds/);
    expect(readTrials(deps.home).rows.filter((r) => r.kind === "trial")).toHaveLength(0);
    const w = ok(await labWalkForward(ask({ maxWork: 100_000, seat: "0xSeat" }), deps));
    expect(readTrials(deps.home).rows.filter((r): r is TrialRow => r.kind === "trial").every((r) => r.seat === "0xSeat" && r.by === "terminal")).toBe(true);
    const sum = walkSummary(w) as { curve: Array<[number, number]>; equity?: unknown; markets: string[]; interval: string };
    expect(sum.equity).toBeUndefined();
    expect(sum.curve.length).toBeLessThanOrEqual(400);
    expect(sum.curve[0]).toEqual([w.equity[0]!.t, w.equity[0]!.usd]);
    expect([sum.markets, sum.interval]).toEqual([["perp:BTC"], "4h"]);
  });
});

describe("the command", () => {
  it("reads --grid (again for each number), --folds and --rolling, and refuses a grid that is not name=a,b", () => {
    const o = parseBacktestArgs(["--strategy", "sma", "--grid", "fast=5,10,20", "--grid=slow=50,100", "--folds", "4", "--rolling", "--param", "weight=0.5"], { OPENPAPER_HOME: "/h" }, NOW) as { walk?: { grid: Record<string, number[]>; folds: number; rolling: boolean } };
    expect(o.walk).toEqual({ grid: { fast: [5, 10, 20], slow: [50, 100] }, folds: 4, rolling: true });
    expect((parseBacktestArgs(["--folds", "3"], {}, NOW) as { walk?: unknown }).walk).toEqual({ grid: {}, folds: 3, rolling: false });
    // the numbers are checked with the grid's own values: fast 5 under slow 15 is a cross, though the default fast (20) is not
    expect((parseBacktestArgs(["--strategy", "sma", "--grid", "fast=5,10", "--param", "slow=15"], {}, NOW) as { walk?: unknown }).walk).toEqual({ grid: { fast: [5, 10] }, folds: 4, rolling: false });
    expect((parseBacktestArgs(["--strategy", "sma", "--grid", "fast=50", "--param", "slow=40"], {}, NOW) as { error: string }).error).toBe("sma's fast average is shorter than its slow one");
    const err = (argv: string[]) => (parseBacktestArgs(argv, {}, NOW) as { error: string }).error;
    expect(err(["--grid", "fast"])).toBe('--grid is name=a,b,c, not "fast"');
    expect(err(["--grid", "fast=5,x"])).toBe('--grid fast takes numbers, not "x"');
    expect(err(["--strategy", "desk", "--folds", "3"])).toBe("a walk-forward walks a strategy: hold, sma, tsmom, carry (the desk runs whole, at its own pace)");
    expect(err(["--folds", "3", "--holdout"])).toBe("a walk-forward walks the data before the holdout: no --holdout");
  });
});
