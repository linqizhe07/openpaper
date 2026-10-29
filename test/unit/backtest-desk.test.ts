import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { parseBacktestArgs, type BacktestOptions } from "../../src/portfolio/account-backtest.ts";
import { DESK_PARAMS, deskParams } from "../../src/portfolio/backtest/desk-params.ts";
import { askOf, deskSpec, labEvaluate, labRun, readTrials, runFile, setHoldout, type LabAsk, type LabDeps, type LabOutcome } from "../../src/portfolio/backtest/lab.ts";
import { DEFAULT_COSTS } from "../../src/portfolio/backtest/source.ts";
import { standinHistory } from "../standin/history.ts";

/** THE DESK OVER RECORDED BARS (backtest/desk.ts, through the lab): the account's own desk — its seats, Risk, the plan's exits, the
 * limits, the door — hired at a paper account in an account of its own and played over bars, the momentum script for a brain; a session
 * that ends before the window does started again; every fill the paper book wrote counted; the run kept and counted in the ledger like any
 * strategy's, beside the buy-and-hold, on the right side of the holdout — and the owner's look at the held-out data plays the desk again
 * over it. History from the stand-in (test/standin/history.ts): no network */
const D = 86_400_000;
const NOW = Date.parse("2026-10-29T12:34:00Z");

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
function lab(): LabDeps {
  const home = mkdtempSync(join(tmpdir(), "backtest-desk-"));
  homes.push(home);
  return { home, cache: join(home, "history"), sources: standinHistory(() => NOW), clock: () => NOW };
}
const desk = (params: Record<string, number> = {}) => {
  const s = deskSpec(params);
  if (typeof s === "string") throw new Error(s);
  return s;
};
const ask = (o: Partial<LabAsk> = {}): LabAsk => ({ spec: desk(), refs: [{ cls: "perp", base: "BTC" }, { cls: "perp", base: "ETH" }], interval: "4h", window: "train", cashUsd: 25_000, feeBps: 10, costs: DEFAULT_COSTS, benchmark: true, save: true, by: "terminal", ...o });
const ok = (r: LabOutcome | Refusal): LabOutcome => {
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
};

describe("the desk's numbers", () => {
  it("take their defaults, and refuse a name the desk does not take, a number out of its bounds or not whole where it must be", () => {
    expect(deskParams()).toEqual({ sizeUsd: 1000, tpPct: 2, slPct: 1, maxHours: 24, riskPct: 10, maxOpen: 3, dayLossPct: 5 });
    expect(deskParams({ tpPct: "3", maxOpen: 5 })).toMatchObject({ tpPct: 3, maxOpen: 5 });
    expect(deskParams({ lookbackDays: 30 })).toBe(`the desk takes ${Object.keys(DESK_PARAMS).join(", ")}, not "lookbackDays"`);
    expect(deskParams({ slPct: 90 })).toBe("the desk's slPct is 0.1 to 50 (the stop, % from the entry), not 90");
    expect(deskParams({ maxOpen: 2.5 })).toBe("the desk's maxOpen is a whole number");
    expect(deskParams({ sizeUsd: "lots" })).toBe("the desk's sizeUsd is a number");
  });

  it("are asked for at the owner's terminal only: the command reads them, a request is told where the desk runs", () => {
    const o = parseBacktestArgs(["--strategy", "desk", "--markets", "perp:BTC,perp:SOL", "--param", "sizeUsd=500", "--param", "tpPct=3"], { OPENPAPER_HOME: "/h" }, NOW) as BacktestOptions;
    expect(o.spec).toEqual({ id: "desk", params: { sizeUsd: 500, tpPct: 3, slPct: 1, maxHours: 24, riskPct: 10, maxOpen: 3, dayLossPct: 5 } });
    expect((parseBacktestArgs(["--strategy", "desk", "--param", "fast=3"], {}, NOW) as { error: string }).error).toMatch(/^the desk takes sizeUsd/);
    expect(askOf({ strategy: "desk" })).toBe("the desk runs at the owner's terminal (npm run account:backtest -- --strategy desk), where it builds a whole account to trade in: a request runs a strategy");
  });
});

describe("the desk over the bars, through the lab", () => {
  it("trades through its own account — leads placed by its seats, exits judged inside the bar that reached them — counted and kept like any run, beside the buy-and-hold at the same fee", async () => {
    const deps = lab();
    const r = ok(await labRun(ask({ from: Date.parse("2026-07-20T00:00:00Z") }), deps));
    expect(r.run.strategy).toMatchObject({ id: "desk", name: "The desk", paramWords: "sizeUsd 1000 · tpPct 2 · slPct 1 · maxHours 24 · riskPct 10 · maxOpen 3 · dayLossPct 5" });
    expect(r.run).toMatchObject({ from: "2026-07-20T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z", feeBps: 10, cashUsd: 25_000 });
    // a step a bar: eleven days of 4-hour bars, the last look at the window's end
    expect(r.run.equity).toHaveLength(11 * 6 + 1);
    expect(r.run.fills.length).toBeGreaterThan(4);
    expect(r.run.fills.some((f) => /^(take-profit|stop-loss|stop) of p\d+ · the 4h bar from 2026-07-\d\d \d\d:00 UTC \(/.test(f.note ?? ""))).toBe(true);
    expect(r.run.metrics.fills).toBe(r.run.fills.length);
    expect(r.run.metrics.exposurePct).toBeGreaterThan(0);
    expect(r.run.notes[0]).toMatch(/^the desk ran 1 session of 264 h at most, a cycle every 240 min: \d+ cycles, \d+ leads scanned, \d+ cleared and \d+ turned down by Risk, \d+ placed, \d+ closed$/);
    expect(r.benchmark).toMatchObject({ strategy: { id: "hold" }, feeBps: 10 });
    expect(r.trial).toMatchObject({ kind: "trial", strategy: "desk", params: { sizeUsd: 1000 }, markets: ["perp:BTC", "perp:ETH"], interval: "4h", window: "train", by: "terminal", feeBps: 10, kept: true });
    expect(r.deflated?.trials).toBe(1);
    const kept = JSON.parse(readFileSync(runFile(deps.home, r.id), "utf8")) as { run: { strategy: { id: string } } };
    expect(kept.run.strategy.id).toBe("desk");
  });

  it("starts a new session when one ends before the window does — fourteen days at most a session — and counts every fill the book wrote, not only the latest it keeps", async () => {
    const deps = lab();
    const r = ok(await labRun(ask({ from: Date.parse("2026-07-10T00:00:00Z"), spec: desk({ tpPct: 1, slPct: 0.5, maxHours: 4 }) }), deps));
    expect(r.run.notes[0]).toMatch(/^the desk ran 2 sessions of 336 h at most/);
    const fills = r.run.fills;
    expect(fills.length).toBe(r.run.metrics.fills);
    // in time order, each once
    expect(fills.map((f) => f.at)).toEqual([...fills.map((f) => f.at)].sort());
    expect(new Set(fills.map((f) => `${f.at}|${f.symbol}|${f.side}|${f.qty}|${f.price}`)).size).toBe(fills.length);
  });

  it("waits out a day's halt — the session runs on, its new leads held until the next day — rather than starting another or stopping", async () => {
    const deps = lab();
    // a tight line: one stop on a lead half the equity's size crosses it
    const r = ok(await labRun(ask({ from: Date.parse("2026-07-17T00:00:00Z"), spec: desk({ sizeUsd: 12_500, riskPct: 50, slPct: 0.5, tpPct: 5, dayLossPct: 0.1 }) }), deps));
    expect(r.run.notes[0]).toMatch(/^the desk ran 1 session of 336 h at most, .*; the day's loss line \(0\.1%\) halted new leads \d+ times?, each until the next day$/);
    expect(r.run.equity).toHaveLength(14 * 6 + 1);
  });

  it("keeps to the lab's rules: perpetuals only, 1h or 4h bars, the window before the holdout — and the owner's look plays the desk again over the held-out data", async () => {
    const deps = lab();
    const no = async (o: Partial<LabAsk>) => ((await labRun(ask(o), deps)) as Refusal).message;
    expect(await no({ refs: [{ cls: "spot", base: "BTC" }] })).toBe("the desk trades perpetuals here: perp:COIN markets only");
    expect(await no({ interval: "1d" })).toBe("the desk steps over 1h or 4h bars: a day's bar is longer than its longest cycle");
    expect(await no({ to: Date.parse("2026-09-01T00:00:00Z") })).toMatch(/^the data from 2026-07-31 on is held out/);
    // a short holdout, so the look is a few days of bars
    expect(setHoldout(deps.home, "2026-10-20", "terminal", NOW)).toMatchObject({ start: "2026-10-20" });
    const train = ok(await labRun(ask({ from: Date.parse("2026-10-15T00:00:00Z") }), deps));
    const look = ok(await labEvaluate(train.id, deps, "owner"));
    expect(look).toMatchObject({ window: "holdout", looks: 1, trial: { strategy: "desk", window: "holdout", by: "owner", params: train.trial.params } });
    expect(look.run.from).toBe("2026-10-20T00:00:00.000Z");
    expect(readTrials(deps.home).rows.filter((x) => x.kind === "trial").map((x) => (x as { strategy: string }).strategy)).toEqual(["desk", "desk"]);
  });
});
