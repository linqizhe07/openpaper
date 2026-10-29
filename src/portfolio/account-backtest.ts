/** A STRATEGY BACKTESTED ON RECORDED BARS, THROUGH THE PAPER ACCOUNT ITSELF (npm run account:backtest).
 *
 * The markets' bars and funding are read from the keyless public sources the account already reads, and kept in the home
 * (backtest/data.ts: Hyperliquid's perpetuals, Coinbase's coins, the US stocks line); the strategy (backtest/strategies.ts: hold, sma,
 * tsmom, carry — numbers, never code) decides at each bar from what had closed; its weights become the paper account's own market orders,
 * filled by its own rule against a cost model's book at the bar's open, its resting orders, funding and liquidations judged bar by bar the way
 * the paper account judges time it did not watch (backtest/source.ts, backtest/engine.ts). Beside it, unless told not to, the same markets
 * bought and held through the same paper account at the same costs: the benchmark. It says what came of each (backtest/metrics.ts) and keeps
 * the run in <home>/backtest/runs/<id>.json.
 *
 * WHAT A BACKTEST IS NOT. It is the paper account's rule over recorded bars, not the market's: a fill is at a bar's open plus a modelled
 * spread and impact, a stop inside a bar fills at its price, a share pays no dividend, a coin is never shorted, a perpetual's margin is
 * isolated. Bars older than a source keeps are not there (Hyperliquid keeps the latest 5,000 of a size). No model's judgement is tested: a
 * model asked about a past it was trained on would be judged with hindsight, so the strategies are rules.
 *
 * EVERY RUN IS COUNTED, and none reaches the held-out data unless the owner says so (backtest/lab.ts): the data from the holdout's start on
 * (the 90 days before the first run, unless moved) is held back, a run's window ends there at the latest, and each run is a row of
 * <home>/backtest/trials.jsonl, whose distinct strategies deflate the Sharpe of the next.
 *
 *   npm run account:backtest -- --strategy tsmom --markets perp:BTC,perp:ETH --interval 1h --from 2026-02-01 --to 2026-07-31 --cash 10000
 *   --strategy   hold · sma · tsmom · carry (default tsmom), or desk: the account's own desk over the bars (backtest/desk.ts: perp: markets,
 *                1h or 4h, its numbers sizeUsd · tpPct · slPct · maxHours · riskPct · maxOpen)
 *   --markets    perp:COIN, spot:COIN, stock:TICKER, comma-separated (perp:BTC)
 *   --interval   1h · 4h · 1d for the coins and perpetuals (1h; a share is read in daily bars)    --param name=value  a strategy's number, again for each
 *   --from --to  the window, YYYY-MM-DD (the 180 days before --to; --to: the holdout's start)    --cash  the paper money (10000)
 *   --fee-bps    the paper account's fee a fill (10; 0 when every market is a share)   --leverage  a perpetual's (the strategy's own need)
 *   --half-spread-bps · --participation · --level-bps   the cost model (1 · 0.05 · 2)  --no-benchmark  no buy-and-hold beside it
 *   --grid name=a,b,c   (again for each number) and --folds N (2–10; 4 with a grid alone), --rolling: a WALK-FORWARD instead of one run
 *                (backtest/walk.ts): the grid's combinations tried on each fold's past, the best run on the fold, the folds chained
 *   --holdout    run on the held-out data instead, from the holdout's start to --to (now): the owner's own look, counted
 *   --set-holdout YYYY-MM-DD   hold out the data from that day on (never back over days already tried on)
 *   --trials     the ledger: the holdout, the runs tried, newest first
 *   --json       the run as JSON         --no-save  keep no run (it is counted still)   --cache DIR  the bars' cache (<home>/history)
 *   --home DIR   the home                --quiet    no progress lines */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRefusal, type Refusal } from "../core/errors.ts";
import { parseMarkets, realHistorySources, type HistorySources, type MarketRef } from "./backtest/data.ts";
import { DESK_PARAMS } from "./backtest/desk-params.ts";
import { labWalkForward, type WalkOutcome } from "./backtest/walk.ts";
import { deskSpec, labList, labRun, setHoldout, type DeskSpec, type Holdout, type LabOutcome } from "./backtest/lab.ts";
import type { Metrics } from "./backtest/metrics.ts";
import { DEFAULT_COSTS, type BacktestCosts } from "./backtest/source.ts";
import { STRATEGIES, STRATEGY_IDS, strategySpec, type StrategySpec } from "./backtest/strategies.ts";
import { defaultHome } from "./home.ts";
import type { CandleInterval } from "./live/trade.ts";
import { PAPER_FEE_BPS } from "./live/paper.ts";

const DAY_MS = 86_400_000;
export const BACKTEST_INTERVALS: readonly CandleInterval[] = ["1h", "4h", "1d"];

export interface BacktestOptions {
  spec: StrategySpec | DeskSpec;
  refs: MarketRef[];
  interval: CandleInterval;
  /** the window asked, ms: none, the lab's (backtest/lab.ts LabAsk) */
  from?: number | undefined;
  to?: number | undefined;
  /** run on the held-out data: the owner's look at their own terminal */
  holdout: boolean;
  /** a walk-forward instead of one run (backtest/walk.ts): the grid of numbers picked from on each fold's past, the folds, rolling or anchored */
  walk?: { grid: Record<string, number[]>; folds: number; rolling: boolean } | undefined;
  cashUsd: number;
  feeBps: number;
  leverage?: number | undefined;
  costs: BacktestCosts;
  benchmark: boolean;
  json: boolean;
  save: boolean;
  cache: string;
  home: string;
  say?: ((line: string) => void) | undefined;
}

export type BacktestOutcome = LabOutcome;
export { runId } from "./backtest/lab.ts";

/** the backtest, from its options to its outcome, at the owner's terminal (see the top of this file) */
export async function backtest(o: BacktestOptions, sources: HistorySources = realHistorySources(), clock: () => number = Date.now): Promise<BacktestOutcome | Refusal> {
  return labRun({ spec: o.spec, refs: o.refs, interval: o.interval, from: o.from, to: o.to, window: o.holdout ? "holdout" : "train", cashUsd: o.cashUsd, feeBps: o.feeBps, ...(o.leverage !== undefined ? { leverage: o.leverage } : {}), costs: o.costs, benchmark: o.benchmark, save: o.save, by: "terminal" }, { home: o.home, cache: o.cache, sources, clock, say: o.say });
}

// ---- the words ----

const usd = (n: number): string => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}%`;
const num = (n: number, places = 2): string => (n < 0 ? `−${Math.abs(n).toFixed(places)}` : n.toFixed(places));
const day = (s: string): string => s.slice(0, 16).replace("T", " ");

/** the figures of a run and its benchmark side by side, one row a figure */
export function metricRows(m: Metrics, b?: Metrics): string[] {
  const rows: Array<[string, (x: Metrics) => string]> = [
    ["Return", (x) => pct(x.returnPct)],
    ["CAGR", (x) => pct(x.cagrPct)],
    ["Sharpe", (x) => `${num(x.sharpe)} ±${x.sharpeSe.toFixed(2)}`],
    ["Sortino", (x) => num(x.sortino)],
    ["Volatility", (x) => `${x.volPct.toFixed(1)}%`],
    ["Max drawdown", (x) => `${pct(-x.maxDrawdownPct)} · ${x.maxDrawdownDays.toFixed(1)} d under`],
    ["Calmar", (x) => num(x.calmar)],
    ["Exposure", (x) => `${x.exposurePct.toFixed(0)}%`],
    ["Fills · turnover", (x) => `${x.fills} · ${x.turnover.toFixed(1)}x a year`],
    ["Fees", (x) => usd(x.feesUsd)],
    ["Funding", (x) => (x.fundingUsd > 0 ? `${usd(x.fundingUsd)} paid` : x.fundingUsd < 0 ? `${usd(-x.fundingUsd)} received` : "none")],
    ["Slippage", (x) => usd(x.slippageUsd)],
    ["End", (x) => usd(x.endUsd)],
  ];
  const w = Math.max(...rows.map(([, f]) => f(m).length), "Strategy".length);
  const head = `${"".padEnd(18)}${"Strategy".padStart(w)}${b ? `   ${"Buy and hold"}` : ""}`;
  return [head, ...rows.map(([k, f]) => `${k.padEnd(18)}${f(m).padStart(w)}${b ? `   ${f(b)}` : ""}`)];
}

export function backtestWords(out: BacktestOutcome): string {
  const r = out.run;
  const lines: string[] = [];
  lines.push(`Backtest ${out.id} · ${r.strategy.name} (${r.strategy.id}) · ${r.strategy.paramWords}`);
  lines.push(`  ${r.strategy.words}`);
  for (const m of r.markets) lines.push(`  ${m.symbol.padEnd(11)} ${m.from} · ${m.interval} · ${day(m.first)} → ${day(m.last)} · ${m.bars.toLocaleString("en-US")} bars${m.fundingHours ? ` · ${m.fundingHours.toLocaleString("en-US")} funding hours` : ""}`);
  const c = r.costs;
  const perps = r.markets.some((m) => m.kind === "perp");
  lines.push(`Window ${day(r.from)} → ${day(r.to)} UTC · ${r.metrics.steps.toLocaleString("en-US")} steps · ${usd(r.cashUsd)} of paper money · fee ${r.feeBps} bps a fill${perps ? ` · perpetuals at ${r.leverage}x` : ""} · the cost model: ${c.halfSpreadBps} bps half spread, ${c.levels} levels ${c.levelBps} bps apart holding ${(c.participation * 100).toFixed(1)}% of the bar before's dollars`);
  lines.push("");
  lines.push(...metricRows(r.metrics, out.benchmark?.metrics));
  lines.push("");
  lines.push(...judgedLines(out), "");
  if (r.refused.length) lines.push(`Not filled: ${r.refused.length} order${r.refused.length === 1 ? "" : "s"} — the first at ${day(r.refused[0]!.at)}: ${r.refused[0]!.why}`);
  for (const n of [...out.notes, ...r.notes]) lines.push(`· ${n}`);
  lines.push(`· a Sharpe's ± is one standard error (Lo 2002): ${r.metrics.steps.toLocaleString("en-US")} steps of ${r.metrics.perYear.toFixed(0)} a year · ${r.wallMs.toLocaleString("en-US")} ms`);
  if (out.saved) lines.push(`Kept: ${out.saved}`);
  return lines.join("\n");
}

/** how the run is judged against every run tried: a training run's Sharpe deflated by them, its kin's odds of overfitting; a look at the
 * holdout, the odds its Sharpe is above zero and how many looks there have been */
export function judgedLines(out: BacktestOutcome): string[] {
  const lines: string[] = [];
  if (out.window === "holdout") {
    lines.push(`Holdout      look ${out.looks ?? 1} at the data held out from ${out.holdout.start} · the probability its Sharpe is above zero: ${out.psr === undefined || Number.isNaN(out.psr) ? "—" : out.psr.toFixed(2)}`);
  } else {
    const d = out.deflated;
    if (d) lines.push(`Deflated     ${d.dsr.toFixed(2)}: the probability the Sharpe is real, counting the ${d.trials} distinct strateg${d.trials === 1 ? "y" : "ies"} tried before the holdout${d.trials > 1 ? ` (the best of ${d.trials} would show ${num(d.sr0)} a year by chance alone)` : ""}`);
    const o = out.overfit;
    if (o) lines.push(`Overfitting  PBO ${o.pbo.toFixed(2)}: across ${o.combinations.toLocaleString("en-US")} ways of halving the ${o.steps.toLocaleString("en-US")} steps these ${o.trials} runs share, the run best on one half ranked in the bottom half of the other ${Math.round(o.pbo * 100)}% of the time`);
  }
  const l = out.ledger;
  lines.push(`Trials       row ${out.trial.seq} of the ledger · ${l.rows} rows, ${l.intact ? "the chain intact" : `the chain BROKEN at row ${l.brokenAt}: ${l.why}`}`);
  return lines;
}

/** a walk-forward in words: the grid and the folds, each fold's pick and what it did out of sample, the walk chained, what share of the
 * picks' in-sample Sharpe it kept, and the rows it added to the ledger */
export function walkWords(w: WalkOutcome, markets: string, interval: string): string {
  const lines: string[] = [];
  const grid = Object.entries(w.grid).map(([k, v]) => `${k} ${v.join(",")}`).join(" × ") || "the numbers as given";
  lines.push(`Walk-forward · ${w.strategy.name} (${w.strategy.id}) · ${w.combos} combination${w.combos === 1 ? "" : "s"} (${grid}) · ${w.folds.length} folds, ${w.rolling ? "rolling" : "anchored"} · ${markets} ${interval} · ${day(w.window.from)} → ${day(w.window.to)} UTC`);
  for (const f of w.folds) {
    const picked = Object.entries(f.picked).map(([k, v]) => `${k} ${v}`).join(" · ") || "the defaults";
    lines.push(`  fold ${f.fold}  in ${f.inSample.from.slice(0, 10)} → ${f.inSample.to.slice(0, 10)}: ${picked} (Sharpe ${num(f.inSharpe)}, the best of ${f.tried})  ·  out ${f.outSample.from.slice(0, 10)} → ${f.outSample.to.slice(0, 10)}: ${pct(f.out.returnPct)}, Sharpe ${num(f.out.sharpe)}, drawdown ${pct(-f.out.maxDrawdownPct)}, ${f.out.fills} fills  ${f.out.id}`);
  }
  const m = w.metrics;
  lines.push("");
  lines.push(`Out of sample, chained: ${pct(m.returnPct)} · Sharpe ${num(m.sharpe)} ±${m.sharpeSe.toFixed(2)} · max drawdown ${pct(-m.maxDrawdownPct)} · ${m.fills} fills · fees ${usd(m.feesUsd)}`);
  lines.push(w.efficiency === null ? `In sample, the picks' mean Sharpe ${num(w.inSharpeMean)}: nothing above zero for the walk to keep` : w.efficiency >= 0 ? `In sample, the picks' mean Sharpe ${num(w.inSharpeMean)}; out of sample ${num(w.outSharpe)}: ${Math.round(w.efficiency * 100)}% of it kept (the walk-forward efficiency)` : `In sample, the picks' mean Sharpe ${num(w.inSharpeMean)}; out of sample ${num(w.outSharpe)}: none of it kept — the walk-forward efficiency is ${num(w.efficiency * 100, 0)}%`);
  lines.push(`Trials       ${w.trials.added} rows added (${w.trials.inSample} tries in sample, ${w.trials.outSample} runs out of sample) · the ledger ${w.ledger.rows} rows, ${w.ledger.intact ? "the chain intact" : "the chain BROKEN"}`);
  for (const n of w.notes) lines.push(`· ${n}`);
  return lines.join("\n");
}

/** the ledger in words (--trials): the holdout, how many runs and strategies, and the latest runs, newest first */
export function trialsWords(list: ReturnType<typeof labList>): string {
  const lines: string[] = [];
  const h = list.holdout as Holdout | Refusal;
  lines.push(isRefusal(h) ? `Holdout: ${h.message}` : `Holdout: the data from ${h.start} on (${h.setBy === "default" ? `the default, written ${h.setAt.slice(0, 10)}` : `set by the ${h.setBy} ${h.setAt.slice(0, 10)}`}) · ${list.ledger.looks} look${list.ledger.looks === 1 ? "" : "s"} at it`);
  const l = list.ledger;
  lines.push(`Ledger: ${l.rows} rows, ${l.intact ? "the chain intact" : `the chain BROKEN at row ${l.brokenAt}: ${l.why}`} · ${l.trials} run${l.trials === 1 ? "" : "s"}, ${l.distinct} distinct strateg${l.distinct === 1 ? "y" : "ies"} tried before the holdout`);
  for (const t of list.runs) {
    const params = Object.entries(t.params).map(([k, v]) => `${k} ${v}`).join(" · ");
    const head = `  ${String(t.seq).padStart(4)}  ${day(t.ts)}  ${t.by.padEnd(8)} ${t.window.padEnd(7)} ${t.strategy.padEnd(5)} ${t.markets.join(",")} ${t.interval}  ${t.from.slice(0, 10)} → ${t.to.slice(0, 10)}`;
    lines.push("figures" in t ? `${head}  (what came of it is the owner's)${params ? `  (${params})` : ""}` : `${head}  ${pct(t.returnPct).padStart(8)}  Sharpe ${num(t.sharpe).padStart(5)}  DD ${pct(-t.maxDrawdownPct)}  ${t.fills} fills${params ? `  (${params})` : ""}${t.kept ? `  ${t.run}` : ""}`);
  }
  return lines.join("\n");
}

// ---- the command ----

const USAGE = `usage: npm run account:backtest -- [--strategy ${STRATEGY_IDS.join("|")}|desk] [--markets perp:BTC,spot:ETH,stock:AAPL] [--interval ${BACKTEST_INTERVALS.join("|")}] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--cash 10000] [--fee-bps 10] [--leverage N] [--param name=value]… [--half-spread-bps 1] [--participation 0.05] [--level-bps 2] [--holdout] [--no-benchmark] [--json] [--no-save] [--cache DIR] [--home DIR] [--quiet]
       npm run account:backtest -- --strategy sma --grid fast=10,20,40 --grid slow=50,100,200 --folds 4 [--rolling] [the run's options]
       npm run account:backtest -- --trials [--json] [--home DIR]
       npm run account:backtest -- --set-holdout YYYY-MM-DD [--home DIR]
A strategy backtested on recorded bars through the paper account itself, beside buying and holding the same markets. Every run is counted
in <home>/backtest/trials.jsonl; the data from the holdout's start on is held out, and only --holdout (or the owner's signature) runs on it.
${STRATEGY_IDS.map((id) => `  ${id.padEnd(6)} ${STRATEGIES[id].name}: ${STRATEGIES[id].words}${Object.keys(STRATEGIES[id].params).length ? `\n         ${Object.entries(STRATEGIES[id].params).map(([k, p]) => `${k}=${p.default} (${p.min}–${p.max})`).join(" · ")}` : ""}`).join("\n")}
  desk   The desk: the account's own desk over the bars, hired at a paper account with the momentum script for a brain (perp: markets, 1h or 4h)
         ${Object.entries(DESK_PARAMS).map(([k, p]) => `${k}=${p.default} (${p.min}–${p.max})`).join(" · ")}`;

export function parseBacktestArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env, now = Date.now()): BacktestOptions | { error: string } | { help: true } | { trials: true; home: string; json: boolean } | { setHoldout: string; home: string } {
  const flags = new Map<string, string | true>();
  const params: Record<string, string> = {};
  const switches = new Set(["--no-benchmark", "--json", "--no-save", "--quiet", "--holdout", "--trials", "--rolling", "--help", "-h"]);
  const known = new Set(["--strategy", "--markets", "--interval", "--from", "--to", "--cash", "--fee-bps", "--leverage", "--param", "--grid", "--folds", "--half-spread-bps", "--participation", "--level-bps", "--cache", "--home", "--set-holdout", ...switches]);
  const grid: Record<string, number[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const eq = a.indexOf("=");
    const name = a.startsWith("--param=") ? "--param" : a.startsWith("--grid=") ? "--grid" : eq > 0 && a.startsWith("--") ? a.slice(0, eq) : a;
    if (!known.has(name)) return { error: `unknown option ${a.slice(0, 40)}\n${USAGE}` };
    if (switches.has(name)) {
      flags.set(name, true);
      continue;
    }
    const value = eq > 0 && a.startsWith(`${name}=`) ? a.slice(name.length + 1) : argv[++i];
    if (value === undefined || value.startsWith("--")) return { error: `${name} needs a value\n${USAGE}` };
    if (name === "--param") {
      const m = /^([A-Za-z]+)=(.+)$/.exec(value);
      if (!m) return { error: `--param is name=value, not "${value.slice(0, 30)}"` };
      params[m[1]!] = m[2]!;
      continue;
    }
    if (name === "--grid") {
      const m = /^([A-Za-z]+)=(.+)$/.exec(value);
      if (!m) return { error: `--grid is name=a,b,c, not "${value.slice(0, 30)}"` };
      const values: number[] = [];
      for (const v of m[2]!.split(",").map((x) => x.trim())) {
        const n = Number(v);
        if (v === "" || !Number.isFinite(n)) return { error: `--grid ${m[1]} takes numbers, not "${v.slice(0, 20)}"` };
        values.push(n);
      }
      grid[m[1]!] = [...new Set(values)];
      continue;
    }
    flags.set(name, value);
  }
  if (flags.has("--help") || flags.has("-h")) return { help: true };
  const str = (name: string, fallback: string): string => {
    const v = flags.get(name);
    return typeof v === "string" ? v : fallback;
  };
  // the ledger read, or the holdout moved: nothing else is said with them
  const alone = (what: string, allowed: string[]): string | undefined => {
    const other = [...flags.keys()].find((k) => k !== what && !allowed.includes(k));
    return other ? `${what} goes with ${allowed.length ? allowed.join(" and ") : "nothing else"}, not ${other}` : Object.keys(params).length ? `${what} goes with no --param` : undefined;
  };
  if (flags.has("--trials")) {
    const wrong = alone("--trials", ["--json", "--home"]);
    return wrong ? { error: wrong } : { trials: true, home: str("--home", defaultHome(env)), json: flags.has("--json") };
  }
  if (flags.has("--set-holdout")) {
    const wrong = alone("--set-holdout", ["--home"]);
    return wrong ? { error: wrong } : { setHoldout: str("--set-holdout", ""), home: str("--home", defaultHome(env)) };
  }
  const numberOf = (name: string, fallback: number | undefined): number | undefined | string => {
    const v = flags.get(name);
    if (typeof v !== "string") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : `${name} is a number, not "${v.slice(0, 20)}"`;
  };
  const id = str("--strategy", "tsmom");
  // a walk-forward's numbers checked with each grid's first value in place (the walk checks every combination before it runs)
  const firstOfGrid = Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, v[0]!]));
  const spec = id === "desk" ? deskSpec(params) : strategySpec(id, { ...params, ...firstOfGrid });
  if (typeof spec === "string") return { error: spec };
  const refs = parseMarkets(str("--markets", "perp:BTC"));
  if (typeof refs === "string") return { error: refs };
  const interval = str("--interval", "1h") as CandleInterval;
  if (!BACKTEST_INTERVALS.includes(interval)) return { error: `--interval is ${BACKTEST_INTERVALS.join(", ")}, not "${interval.slice(0, 10)}"` };
  const date = (name: string): number | undefined | string => {
    const v = flags.get(name);
    if (typeof v !== "string") return undefined;
    const ms = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : Number.NaN;
    return Number.isFinite(ms) ? ms : `${name} is YYYY-MM-DD, not "${v.slice(0, 20)}"`;
  };
  const to = date("--to");
  if (typeof to === "string") return { error: to };
  const from = date("--from");
  if (typeof from === "string") return { error: from };
  const holdout = flags.has("--holdout");
  if (holdout && from !== undefined) return { error: "--holdout runs from the holdout's start: no --from" };
  // a walk-forward: a grid, folds or rolling said; folds 4 when only a grid is
  const walking = Object.keys(grid).length > 0 || flags.has("--folds") || flags.has("--rolling");
  if (walking && spec.id === "desk") return { error: "a walk-forward walks a strategy: hold, sma, tsmom, carry (the desk runs whole, at its own pace)" };
  if (walking && holdout) return { error: "a walk-forward walks the data before the holdout: no --holdout" };
  const folds = flags.has("--folds") ? Number(flags.get("--folds")) : 4;
  if (walking && !(Number.isInteger(folds) && folds >= 2 && folds <= 10)) return { error: "--folds is a whole number, 2 to 10" };
  if (from !== undefined && to !== undefined && !(to > from)) return { error: "--to is after --from" };
  if (to !== undefined && to > now + DAY_MS) return { error: "--to is not in the future" };
  const shares = refs.every((r) => r.cls === "stock");
  const nums = { cash: numberOf("--cash", 10_000), fee: numberOf("--fee-bps", shares ? 0 : PAPER_FEE_BPS), leverage: numberOf("--leverage", undefined), half: numberOf("--half-spread-bps", DEFAULT_COSTS.halfSpreadBps), part: numberOf("--participation", DEFAULT_COSTS.participation), level: numberOf("--level-bps", DEFAULT_COSTS.levelBps) };
  for (const v of Object.values(nums)) if (typeof v === "string") return { error: v };
  const [cash, fee, leverage, half, part, level] = [nums.cash, nums.fee, nums.leverage, nums.half, nums.part, nums.level] as Array<number | undefined>;
  if (!(cash! >= 100 && cash! <= 100_000_000)) return { error: "--cash is 100 to 100000000" };
  if (!(fee! >= 0 && fee! <= 500)) return { error: "--fee-bps is 0 to 500" };
  if (leverage !== undefined && !(leverage >= 1 && leverage <= 50)) return { error: "--leverage is 1 to 50" };
  if (!(half! >= 0 && half! <= 500)) return { error: "--half-spread-bps is 0 to 500" };
  if (!(part! > 0 && part! <= 1)) return { error: "--participation is more than 0, at most 1" };
  if (!(level! >= 0 && level! <= 500)) return { error: "--level-bps is 0 to 500" };
  const home = str("--home", defaultHome(env));
  return {
    spec,
    refs,
    interval,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    holdout,
    ...(walking ? { walk: { grid, folds, rolling: flags.has("--rolling") } } : {}),
    cashUsd: cash!,
    feeBps: fee!,
    ...(leverage !== undefined ? { leverage } : {}),
    costs: { ...DEFAULT_COSTS, halfSpreadBps: half!, participation: part!, levelBps: level! },
    benchmark: !flags.has("--no-benchmark"),
    json: flags.has("--json"),
    save: !flags.has("--no-save"),
    cache: str("--cache", join(home, "history")),
    home,
    ...(flags.has("--quiet") ? {} : { say: (line: string) => console.error(line) }),
  };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const parsed = parseBacktestArgs(process.argv.slice(2));
  if ("help" in parsed) {
    console.log(USAGE);
    process.exit(0);
  }
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(2);
  }
  if ("trials" in parsed) {
    const list = labList(parsed.home, Date.now(), 50, { owner: true });
    console.log(parsed.json ? JSON.stringify(list, null, 1) : trialsWords(list));
    process.exit(0);
  }
  if ("setHoldout" in parsed) {
    const h = setHoldout(parsed.home, parsed.setHoldout, "terminal", Date.now());
    if (isRefusal(h)) {
      console.error(`${h.code}: ${h.message}`);
      process.exit(1);
    }
    console.log(`The data from ${h.start} on is held out.`);
    process.exit(0);
  }
  if (parsed.walk) {
    // the parser lets no desk walk: the strategy's numbers outside the grid, as given or at their defaults, are the same in every combination
    if (parsed.spec.id === "desk") process.exit(2);
    const grid = parsed.walk.grid;
    const w = await labWalkForward({ strategy: parsed.spec.id, grid, fixed: Object.fromEntries(Object.entries(parsed.spec.params).filter(([k]) => !(k in grid))), folds: parsed.walk.folds, rolling: parsed.walk.rolling, refs: parsed.refs, interval: parsed.interval, from: parsed.from, to: parsed.to, cashUsd: parsed.cashUsd, feeBps: parsed.feeBps, ...(parsed.leverage !== undefined ? { leverage: parsed.leverage } : {}), costs: parsed.costs, by: "terminal" }, { home: parsed.home, cache: parsed.cache, sources: realHistorySources(), clock: Date.now, say: parsed.say });
    if (isRefusal(w)) {
      console.error(`${w.code}: ${w.message}`);
      process.exit(1);
    }
    console.log(parsed.json ? JSON.stringify(w, null, 1) : walkWords(w, parsed.refs.map((r) => `${r.cls}:${r.base}`).join(","), parsed.interval));
    process.exit(0);
  }
  const out = await backtest(parsed);
  if (isRefusal(out)) {
    console.error(`${out.code}: ${out.message}`);
    process.exit(1);
  }
  console.log(parsed.json ? JSON.stringify(out, null, 1) : backtestWords(out));
  process.exit(0);
}
