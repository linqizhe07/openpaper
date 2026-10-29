/** WALK-FORWARD (npm run account:backtest -- --grid name=a,b,c --folds 4): a strategy's numbers picked on each fold's past, then tried on the
 * fold — what picking would have earned, had it been done as time went, before the holdout.
 *
 * The training window (it ends at the holdout's start at the latest, as every run here) is cut into folds + 1 equal stretches. For fold i,
 * the stretch i is its OUT OF SAMPLE; its IN SAMPLE is every stretch before it (anchored, the default) or the one just before it
 * (--rolling). Every combination of the grid — the cartesian product of the values named, the strategy's other numbers as given or at their
 * defaults — runs in sample; the one with the best Sharpe there (the first, on a tie) runs out of sample. The out-of-sample runs, chained
 * one after another, are the walk: its return, Sharpe and drawdown are what the picking earned on data it had not seen when it picked.
 * Beside it, how much of the picks' in-sample Sharpe survived out of sample (the walk-forward efficiency): near 1, the picking found
 * something that lasted; near 0 or below, it found the past.
 *
 * EVERY RUN IS COUNTED (backtest/lab.ts): each in-sample try and each out-of-sample run is a row of the trials ledger — a grid of six over
 * four folds is twenty-eight trials, and the next run's Sharpe is deflated by every distinct one of them. The out-of-sample runs are kept
 * (they can be opened like any run); the in-sample tries are counted, not kept. */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import type { CandleInterval } from "../live/trade.ts";
import { no } from "../refuse.ts";
import { loadHistory, type MarketRef } from "./data.ts";
import { holdoutStartMs, labRun, readHoldout, readTrials, WINDOW_DEFAULT_DAYS, type LabDeps, type LabWho } from "./lab.ts";
import { metricsOf, type EquityPoint, type Metrics } from "./metrics.ts";
import type { BacktestCosts } from "./source.ts";
import { makeStrategy, STRATEGIES, strategySpec, type StrategyId, type StrategySpec } from "./strategies.ts";

const DAY_MS = 86_400_000;
/** the most combinations a grid may hold, the most folds, and the most runs a walk may take in all */
export const WALK_COMBOS_MOST = 50;
export const WALK_FOLDS: readonly [number, number] = [2, 10];
export const WALK_RUNS_MOST = 300;

export interface WalkAsk {
  strategy: StrategyId;
  /** each named number's values to try */
  grid: Record<string, number[]>;
  /** the strategy's other numbers, the same in every combination (the rest at their defaults) */
  fixed: Record<string, number>;
  folds: number;
  /** in sample: every stretch before the fold (anchored), or the one just before it (rolling) */
  rolling: boolean;
  refs: MarketRef[];
  interval: CandleInterval;
  from?: number | undefined;
  to?: number | undefined;
  cashUsd: number;
  feeBps: number;
  leverage?: number | undefined;
  costs: BacktestCosts;
  by: LabWho;
}

export interface WalkFold {
  fold: number;
  inSample: { from: string; to: string };
  outSample: { from: string; to: string };
  /** the combination picked, its Sharpe in sample, and how many were tried */
  picked: Record<string, number>;
  inSharpe: number;
  tried: number;
  /** the out-of-sample run: kept, so it opens like any run */
  out: { id: string; returnPct: number; sharpe: number; maxDrawdownPct: number; fills: number; feesUsd: number };
}

export interface WalkOutcome {
  strategy: { id: StrategyId; name: string };
  grid: Record<string, number[]>;
  fixed: Record<string, number>;
  combos: number;
  folds: WalkFold[];
  rolling: boolean;
  window: { from: string; to: string };
  /** the out-of-sample runs chained, from the walk's money: its curve and its figures (the fills and the fees summed across the folds) */
  equity: EquityPoint[];
  metrics: Metrics;
  /** the picks' mean Sharpe in sample, the walk's out of sample, and what share of the first the second kept */
  inSharpeMean: number;
  outSharpe: number;
  efficiency: number | null;
  /** the ledger's rows this walk added: its in-sample tries and its out-of-sample runs */
  trials: { added: number; inSample: number; outSample: number };
  ledger: { rows: number; intact: boolean };
  notes: string[];
}

/** every combination of a grid, in the order its names and values were given */
export function combinations(grid: Record<string, number[]>): Array<Record<string, number>> {
  let out: Array<Record<string, number>> = [{}];
  for (const [name, values] of Object.entries(grid)) out = out.flatMap((c) => values.map((v) => ({ ...c, [name]: v })));
  return out;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** THE WALK (see the top of this file): the folds cut, each fold's combinations tried in sample and its pick run out of sample, the
 * out-of-sample runs chained — every run counted in the ledger */
export async function labWalkForward(ask: WalkAsk, deps: LabDeps): Promise<WalkOutcome | Refusal> {
  if (!(ask.strategy in STRATEGIES)) return no("E_ACCOUNT_BAD_ACTION", { message: `a walk-forward walks one of ${Object.keys(STRATEGIES).join(", ")}` });
  if (!(Number.isInteger(ask.folds) && ask.folds >= WALK_FOLDS[0] && ask.folds <= WALK_FOLDS[1])) return no("E_ACCOUNT_BAD_ACTION", { message: `a walk-forward has ${WALK_FOLDS[0]} to ${WALK_FOLDS[1]} folds` });
  for (const name of Object.keys(ask.grid)) if (name in ask.fixed) return no("E_ACCOUNT_BAD_ACTION", { message: `${name} is both a grid and a fixed number` });
  const combos = combinations(ask.grid);
  if (combos.length > WALK_COMBOS_MOST) return no("E_ACCOUNT_BAD_ACTION", { message: `a grid holds ${WALK_COMBOS_MOST} combinations at most; this one holds ${combos.length}` });
  if (combos.length * ask.folds + ask.folds > WALK_RUNS_MOST) return no("E_ACCOUNT_BAD_ACTION", { message: `a walk-forward takes ${WALK_RUNS_MOST} runs at most; ${combos.length} combinations over ${ask.folds} folds would take ${combos.length * ask.folds + ask.folds}` });
  // every combination read as a strategy's numbers before anything runs: one out of bounds is refused, naming it
  const specs: StrategySpec[] = [];
  for (const c of combos) {
    const s = strategySpec(ask.strategy, { ...ask.fixed, ...c });
    if (typeof s === "string") return no("E_ACCOUNT_BAD_ACTION", { message: s });
    specs.push(s);
  }
  // the training window, as a run's: before the holdout
  const holdout = readHoldout(deps.home, deps.clock());
  if (isRefusal(holdout)) return holdout;
  const cut = holdoutStartMs(holdout);
  const to = ask.to ?? cut;
  if (to > cut) return no("E_ACCOUNT_OWNER_ONLY", { message: `the data from ${holdout.start} on is held out: a walk-forward walks before it (a window ending ${holdout.start} at the latest)`, detail: { holdout: holdout.start } });
  const asked = ask.from ?? to - WINDOW_DEFAULT_DAYS * DAY_MS;
  if (!(to > asked)) return no("E_ACCOUNT_BAD_ACTION", { message: "a walk-forward's window ends after it starts" });
  const notes: string[] = [];
  // the folds are cut from where every market has the history the hungriest combination reads first: a source that keeps fewer bars
  // (Hyperliquid's latest 5,000) moves the walk's start, said, rather than leaving the first fold with nothing to run on
  const warmupMs = Math.max(...specs.map((x) => makeStrategy(x).warmupMs));
  const loaded = await loadHistory({ refs: ask.refs, interval: ask.interval, from: asked - warmupMs, to, cache: deps.cache, sources: deps.sources, clock: deps.clock, say: deps.say });
  if (isRefusal(loaded)) return loaded;
  const ready = Math.max(...loaded.markets.map((m) => (m.bars[0]?.t ?? asked) + warmupMs));
  const from = Math.max(asked, ready);
  if (from > asked) notes.push(`the walk starts ${iso(from).slice(0, 10)}, not ${iso(asked).slice(0, 10)}: its markets' bars start ${iso(ready - warmupMs).slice(0, 10)}${warmupMs ? `, and the grid reads ${Math.round(warmupMs / DAY_MS)} days of bars first` : ""}`);
  if (!(to - from > DAY_MS * (ask.folds + 1))) return no("E_ACCOUNT_BAD_ACTION", { message: `nothing is left to walk: the history reaches back to ${iso(ready - warmupMs).slice(0, 10)}, too little before ${iso(to).slice(0, 10)} for ${ask.folds + 1} stretches of a day at least` });
  const stretch = (to - from) / (ask.folds + 1);
  const cutAt = (i: number): number => Math.round(from + i * stretch);
  const rowsBefore = readTrials(deps.home).rows.length;
  const base = { refs: ask.refs, interval: ask.interval, cashUsd: ask.cashUsd, feeBps: ask.feeBps, ...(ask.leverage !== undefined ? { leverage: ask.leverage } : {}), costs: ask.costs, by: ask.by };
  const folds: WalkFold[] = [];
  const outs: EquityPoint[][] = [];
  let fills = 0;
  let tradedUsd = 0;
  let feesUsd = 0;
  let fundingUsd = 0;
  let slippageUsd = 0;
  for (let i = 1; i <= ask.folds; i++) {
    const inFrom = ask.rolling ? cutAt(i - 1) : cutAt(0);
    const inTo = cutAt(i);
    const outTo = cutAt(i + 1);
    let best = -1;
    let bestSharpe = Number.NEGATIVE_INFINITY;
    for (let c = 0; c < specs.length; c++) {
      const r = await labRun({ ...base, spec: specs[c]!, from: inFrom, to: inTo, window: "train", benchmark: false, save: false }, deps);
      if (isRefusal(r)) return no(r.code, { message: `fold ${i}, in sample, ${Object.entries(combos[c]!).map(([k, v]) => `${k} ${v}`).join(" · ") || "the defaults"}: ${r.message ?? r.code}` });
      if (r.run.metrics.sharpe > bestSharpe) [best, bestSharpe] = [c, r.run.metrics.sharpe];
    }
    const out = await labRun({ ...base, spec: specs[best]!, from: inTo, to: outTo, window: "train", benchmark: false, save: true }, deps);
    if (isRefusal(out)) return no(out.code, { message: `fold ${i}, out of sample: ${out.message ?? out.code}` });
    const m = out.run.metrics;
    folds.push({ fold: i, inSample: { from: iso(inFrom), to: iso(inTo) }, outSample: { from: out.run.from, to: out.run.to }, picked: { ...combos[best]!, ...ask.fixed }, inSharpe: bestSharpe, tried: specs.length, out: { id: out.id, returnPct: m.returnPct, sharpe: m.sharpe, maxDrawdownPct: m.maxDrawdownPct, fills: m.fills, feesUsd: m.feesUsd } });
    outs.push(out.run.equity);
    fills += m.fills;
    tradedUsd += m.tradedUsd;
    feesUsd += m.feesUsd;
    fundingUsd += m.fundingUsd;
    slippageUsd += m.slippageUsd;
  }
  // the out-of-sample runs chained: each fold's curve carried on from where the one before ended
  const equity: EquityPoint[] = [];
  for (const curve of outs) {
    if (!curve.length) continue;
    const scale = equity.length ? equity[equity.length - 1]!.usd / curve[0]!.usd : ask.cashUsd / curve[0]!.usd;
    for (const p of equity.length ? curve.slice(1) : curve) equity.push({ t: p.t, usd: Number((p.usd * scale).toFixed(6)), ...(p.grossUsd !== undefined ? { grossUsd: Number((p.grossUsd * scale).toFixed(2)) } : {}) });
  }
  const metrics = metricsOf(equity, { fills, tradedUsd, feesUsd, fundingUsd, slippageUsd });
  const inSharpeMean = folds.reduce((s, f) => s + f.inSharpe, 0) / Math.max(1, folds.length);
  const efficiency = inSharpeMean > 0 ? metrics.sharpe / inSharpeMean : null;
  if (efficiency === null) notes.push("the picks' mean Sharpe in sample was not above zero: no share of it to keep, so no efficiency is said");
  notes.push("the walk's fills, fees, funding and slippage are each fold's own, at the fold's own money; its curve carries each fold on from the last");
  const ledger = readTrials(deps.home);
  return {
    strategy: { id: ask.strategy, name: STRATEGIES[ask.strategy].name },
    grid: ask.grid,
    fixed: ask.fixed,
    combos: combos.length,
    folds,
    rolling: ask.rolling,
    window: { from: iso(from), to: iso(to) },
    equity,
    metrics,
    inSharpeMean,
    outSharpe: metrics.sharpe,
    efficiency,
    trials: { added: ledger.rows.length - rowsBefore, inSample: combos.length * ask.folds, outSample: ask.folds },
    ledger: { rows: ledger.rows.length, intact: ledger.intact },
    notes,
  };
}
