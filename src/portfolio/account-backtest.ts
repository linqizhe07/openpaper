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
 *   npm run account:backtest -- --strategy tsmom --markets perp:BTC,perp:ETH --interval 1h --from 2026-05-01 --to 2026-10-28 --cash 10000
 *   --strategy   hold · sma · tsmom · carry (default tsmom)           --markets  perp:COIN, spot:COIN, stock:TICKER, comma-separated (perp:BTC)
 *   --interval   1h · 4h · 1d for the coins and perpetuals (1h; a share is read in daily bars)    --param name=value  a strategy's number, again for each
 *   --from --to  the window, YYYY-MM-DD (the 180 days before --to; --to: now)        --cash  the paper money (10000)
 *   --fee-bps    the paper account's fee a fill (10; 0 when every market is a share)   --leverage  a perpetual's (the strategy's own need)
 *   --half-spread-bps · --participation · --level-bps   the cost model (1 · 0.05 · 2)  --no-benchmark  no buy-and-hold beside it
 *   --json       the run as JSON         --no-save  keep nothing         --cache DIR  the bars' cache (<home>/history)   --home DIR   the home
 *   --quiet      no progress lines */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRefusal, type Refusal } from "../core/errors.ts";
import { loadHistory, marketText, parseMarkets, realHistorySources, type HistorySources, type MarketRef } from "./backtest/data.ts";
import { runBacktest, type BacktestRun } from "./backtest/engine.ts";
import type { Metrics } from "./backtest/metrics.ts";
import { DEFAULT_COSTS, type BacktestCosts } from "./backtest/source.ts";
import { makeStrategy, STRATEGIES, STRATEGY_IDS, strategySpec, type StrategySpec } from "./backtest/strategies.ts";
import { defaultHome } from "./home.ts";
import { INTERVAL_MS, type CandleInterval } from "./live/trade.ts";
import { PAPER_FEE_BPS } from "./live/paper.ts";
import { no } from "./refuse.ts";

const DAY_MS = 86_400_000;
export const BACKTEST_INTERVALS: readonly CandleInterval[] = ["1h", "4h", "1d"];

export interface BacktestOptions {
  spec: StrategySpec;
  refs: MarketRef[];
  interval: CandleInterval;
  from: number;
  to: number;
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

export interface BacktestOutcome {
  id: string;
  run: BacktestRun;
  benchmark?: BacktestRun | undefined;
  /** what was said before the run: a window moved for the history, a source's words */
  notes: string[];
  saved?: string | undefined;
}

/** the run's id: when it ran, and a hash of what it was (the same spec, markets, window and costs, the same hash) */
export function runId(o: Pick<BacktestOptions, "spec" | "refs" | "interval" | "from" | "to" | "cashUsd" | "feeBps" | "leverage" | "costs">, at: number): string {
  const what = JSON.stringify([o.spec, o.refs.map(marketText), o.interval, o.from, o.to, o.cashUsd, o.feeBps, o.leverage ?? null, o.costs]);
  return `${new Date(at).toISOString().replace(/[-:]/g, "").slice(0, 15)}-${createHash("sha256").update(what).digest("hex").slice(0, 10)}`;
}

/** the backtest, from its options to its outcome (see the top of this file) */
export async function backtest(o: BacktestOptions, sources: HistorySources = realHistorySources(), clock: () => number = Date.now): Promise<BacktestOutcome | Refusal> {
  const strategy = makeStrategy(o.spec);
  const notes: string[] = [];
  const loaded = await loadHistory({ refs: o.refs, interval: o.interval, from: o.from - strategy.warmupMs, to: o.to, cache: o.cache, sources, clock, say: o.say });
  if (isRefusal(loaded)) return loaded;
  notes.push(...loaded.notes);
  // the run starts once every market has the history its strategy reads first
  const ready = Math.max(...loaded.markets.map((m) => (m.bars[0]?.t ?? o.from) + strategy.warmupMs));
  const from = Math.max(o.from, ready);
  if (from > o.from) notes.push(`the run starts at the first bar after ${new Date(from).toISOString().slice(0, 16).replace("T", " ")} UTC, not ${new Date(o.from).toISOString().slice(0, 10)}: the ${strategy.name.toLowerCase()} reads ${Math.round(strategy.warmupMs / DAY_MS)} days of bars first, and the bars start ${new Date(ready - strategy.warmupMs).toISOString().slice(0, 10)}`);
  if (!(o.to > from)) return no("E_ACCOUNT_BAD_ACTION", { message: `nothing is left to run: the history the strategy needs first reaches to ${new Date(from).toISOString().slice(0, 10)}` });
  const work = mkdtempSync(join(tmpdir(), "openpaper-backtest-"));
  try {
    const base = { markets: loaded.markets, from, to: o.to, cashUsd: o.cashUsd, feeBps: o.feeBps, ...(o.leverage !== undefined ? { leverage: o.leverage } : {}), costs: o.costs };
    const run = await runBacktest({ ...base, strategy: o.spec, home: join(work, "run"), say: o.say });
    if (isRefusal(run)) return run;
    let benchmark: BacktestRun | undefined;
    if (o.benchmark && o.spec.id !== "hold") {
      const hold = strategySpec("hold");
      if (typeof hold !== "string") {
        const b = await runBacktest({ ...base, leverage: undefined, strategy: hold, home: join(work, "hold") });
        if (!isRefusal(b)) benchmark = b;
        else notes.push(`the buy-and-hold beside it did not run: ${b.message ?? b.code}`);
      }
    }
    const id = runId(o, clock());
    let saved: string | undefined;
    if (o.save) {
      const dir = join(o.home, "backtest", "runs");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      saved = join(dir, `${id}.json`);
      const tmp = `${saved}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, id, at: new Date(clock()).toISOString(), markets: o.refs.map(marketText), interval: o.interval, notes, run, ...(benchmark ? { benchmark } : {}) }), { mode: 0o600 });
      renameSync(tmp, saved);
    }
    return { id, run, ...(benchmark ? { benchmark } : {}), notes, ...(saved ? { saved } : {}) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
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
  if (r.refused.length) lines.push(`Not filled: ${r.refused.length} order${r.refused.length === 1 ? "" : "s"} — the first at ${day(r.refused[0]!.at)}: ${r.refused[0]!.why}`);
  for (const n of [...out.notes, ...r.notes]) lines.push(`· ${n}`);
  lines.push(`· a Sharpe's ± is one standard error (Lo 2002): ${r.metrics.steps.toLocaleString("en-US")} steps of ${r.metrics.perYear.toFixed(0)} a year · ${r.wallMs.toLocaleString("en-US")} ms`);
  if (out.saved) lines.push(`Kept: ${out.saved}`);
  return lines.join("\n");
}

// ---- the command ----

const USAGE = `usage: npm run account:backtest -- [--strategy ${STRATEGY_IDS.join("|")}] [--markets perp:BTC,spot:ETH,stock:AAPL] [--interval ${BACKTEST_INTERVALS.join("|")}] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--cash 10000] [--fee-bps 10] [--leverage N] [--param name=value]… [--half-spread-bps 1] [--participation 0.05] [--level-bps 2] [--no-benchmark] [--json] [--no-save] [--cache DIR] [--home DIR] [--quiet]
A strategy backtested on recorded bars through the paper account itself, beside buying and holding the same markets.
${STRATEGY_IDS.map((id) => `  ${id.padEnd(6)} ${STRATEGIES[id].name}: ${STRATEGIES[id].words}${Object.keys(STRATEGIES[id].params).length ? `\n         ${Object.entries(STRATEGIES[id].params).map(([k, p]) => `${k}=${p.default} (${p.min}–${p.max})`).join(" · ")}` : ""}`).join("\n")}`;

export function parseBacktestArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env, now = Date.now()): BacktestOptions | { error: string } | { help: true } {
  const flags = new Map<string, string | true>();
  const params: Record<string, string> = {};
  const switches = new Set(["--no-benchmark", "--json", "--no-save", "--quiet", "--help", "-h"]);
  const known = new Set(["--strategy", "--markets", "--interval", "--from", "--to", "--cash", "--fee-bps", "--leverage", "--param", "--half-spread-bps", "--participation", "--level-bps", "--cache", "--home", ...switches]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const eq = a.indexOf("=");
    const name = eq > 0 && a.startsWith("--") && !a.startsWith("--param=") ? a.slice(0, eq) : a.startsWith("--param=") ? "--param" : a;
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
    flags.set(name, value);
  }
  if (flags.has("--help") || flags.has("-h")) return { help: true };
  const str = (name: string, fallback: string): string => {
    const v = flags.get(name);
    return typeof v === "string" ? v : fallback;
  };
  const numberOf = (name: string, fallback: number | undefined): number | undefined | string => {
    const v = flags.get(name);
    if (typeof v !== "string") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : `${name} is a number, not "${v.slice(0, 20)}"`;
  };
  const spec = strategySpec(str("--strategy", "tsmom"), params);
  if (typeof spec === "string") return { error: spec };
  const refs = parseMarkets(str("--markets", "perp:BTC"));
  if (typeof refs === "string") return { error: refs };
  const interval = str("--interval", "1h") as CandleInterval;
  if (!BACKTEST_INTERVALS.includes(interval)) return { error: `--interval is ${BACKTEST_INTERVALS.join(", ")}, not "${interval.slice(0, 10)}"` };
  const date = (name: string, fallback: number): number | string => {
    const v = flags.get(name);
    if (typeof v !== "string") return fallback;
    const ms = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : Number.NaN;
    return Number.isFinite(ms) ? ms : `${name} is YYYY-MM-DD, not "${v.slice(0, 20)}"`;
  };
  const step = INTERVAL_MS[interval];
  const to = date("--to", Math.floor(now / step) * step);
  if (typeof to === "string") return { error: to };
  const from = date("--from", to - 180 * DAY_MS);
  if (typeof from === "string") return { error: from };
  if (!(to > from)) return { error: "--to is after --from" };
  if (to > now + DAY_MS) return { error: "--to is not in the future" };
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
    from,
    to,
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
  const out = await backtest(parsed);
  if (isRefusal(out)) {
    console.error(`${out.code}: ${out.message}`);
    process.exit(1);
  }
  console.log(parsed.json ? JSON.stringify(out, null, 1) : backtestWords(out));
  process.exit(0);
}
