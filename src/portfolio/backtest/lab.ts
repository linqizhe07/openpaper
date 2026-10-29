/** THE LAB: where backtests are run, kept and COUNTED — the command (account-backtest.ts), the service's routes and its MCP tools all run
 * them here, so every strategy tried on the account's history is on one record.
 *
 * A backtest that is tried again and again on the same history finds a strategy that fits that history — and a Sharpe that only says how
 * hard it was looked for. Two things here keep that honest:
 *
 *   THE HOLDOUT (<home>/backtest/holdout.json): the data from a day on is held back. A strategy is tried on what came before it — a run's
 *     window ends at the holdout's start at the latest, and that is where a run's window ends unless it says otherwise — and runs on the
 *     held-out data only when the owner says so: their signature (setBacktest, through the door) or the command at their own terminal
 *     (--holdout). Every look at it is counted, since a holdout looked at often is a holdout no more. The first time anything asks, the
 *     holdout is the 90 days before that moment, from midnight UTC, written down so that it never moves by itself; the owner moves it, and
 *     not back over days a strategy was already tried on.
 *   THE TRIALS (<home>/backtest/trials.jsonl): every run — a training run or a look at the holdout — one row, with what was tried (the
 *     strategy, its numbers, the markets, the window, the costs), who asked, and its figures; hash-chained like the account's own ledger
 *     (agent/ledger.ts: each row's hash covers the one before it), so a row taken out or changed is seen. A run's Sharpe is DEFLATED by
 *     every distinct strategy tried before the holdout (backtest/stats.ts dsr): the more tried, the higher the bar. Runs on the same markets
 *     and bars are judged together too, for how likely picking the best of them was picking the luckiest (pbo).
 *
 * A run itself is the engine's (backtest/engine.ts) over the history kept in the home (backtest/data.ts), with the same markets bought and
 * held beside it, and it is kept in <home>/backtest/runs/<id>.json. Who asked is said, not proven: an unsigned request names the seat it
 * says it is (the service's routes take no signature to run a backtest, and an unsigned run never reaches the holdout); the owner's look at
 * the holdout is theirs by signature. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { canonical, sha256 } from "../../core/hash.ts";
import { appendJsonl } from "../../core/jsonl.ts";
import { PAPER_FEE_BPS } from "../live/paper.ts";
import { INTERVAL_MS, type CandleInterval } from "../live/trade.ts";
import { no } from "../refuse.ts";
import { loadHistory, marketText, parseMarkets, type HistorySources, type MarketRef } from "./data.ts";
import { runBacktest, type BacktestRun } from "./engine.ts";
import { stepReturns } from "./metrics.ts";
import { DEFAULT_COSTS, type BacktestCosts } from "./source.ts";
import { makeStrategy, strategySpec, type StrategySpec } from "./strategies.ts";
import { dsr, moments, pbo, psr } from "./stats.ts";

const DAY_MS = 86_400_000;
/** the held-out days when nothing has said otherwise: the 90 before the first time anything asks */
export const HOLDOUT_DEFAULT_DAYS = 90;
/** a training run's window when it names no start: the 180 days before its end */
export const WINDOW_DEFAULT_DAYS = 180;
/** the earliest a holdout may start */
const HOLDOUT_EARLIEST = "2015-01-01";
/** the most runs judged together for the probability of overfitting: the latest of them */
const PBO_MOST = 40;
const GENESIS = "0".repeat(64);

/** who asked for a run: the owner by signature, the command at the owner's terminal, or an unsigned request (an agent's seat, the page) */
export type LabWho = "owner" | "terminal" | "request";

export interface Holdout {
  version: 1;
  /** the first held-out day, YYYY-MM-DD (from its midnight UTC) */
  start: string;
  setAt: string;
  setBy: LabWho | "default";
}

/** one strategy tried — a run, as the ledger keeps it */
export interface TrialEntry {
  kind: "trial";
  by: LabWho;
  /** the seat an unsigned request named (said, not proven) */
  seat?: string | undefined;
  run: string;
  window: "train" | "holdout";
  /** what was tried, hashed: the same strategy, numbers, markets, bars, window and costs, the same key */
  key: string;
  strategy: string;
  params: Record<string, number>;
  markets: string[];
  interval: CandleInterval;
  from: string;
  to: string;
  cashUsd: number;
  feeBps: number;
  /** as asked: none, the strategy's own */
  leverage?: number | undefined;
  costs: BacktestCosts;
  steps: number;
  perYear: number;
  /** the Sharpe a year, and per step with the step returns' skewness and kurtosis, which the deflated Sharpe reads */
  sharpe: number;
  sr: number;
  skew: number;
  kurt: number;
  returnPct: number;
  maxDrawdownPct: number;
  fills: number;
  /** its run kept in <home>/backtest/runs/<run>.json */
  kept: boolean;
}
/** the holdout set or moved */
export interface HoldoutEntry {
  kind: "holdout";
  by: LabWho | "default";
  start: string;
  was?: string | undefined;
}
export type LabEntry = TrialEntry | HoldoutEntry;
export type LabRow = LabEntry & { v: 1; seq: number; ts: string; prev: string; hash: string };
export type TrialRow = TrialEntry & { v: 1; seq: number; ts: string; prev: string; hash: string };

const iso = (ms: number): string => new Date(ms).toISOString();
const dayOf = (ms: number): string => iso(ms).slice(0, 10);
const labDir = (home: string): string => join(home, "backtest");
export const holdoutFile = (home: string): string => join(labDir(home), "holdout.json");
export const trialsFile = (home: string): string => join(labDir(home), "trials.jsonl");
export const runFile = (home: string, id: string): string => join(labDir(home), "runs", `${id}.json`);
/** a run's id as the lab makes them: when it ran, and a hash of what it was */
export const RUN_ID = /^\d{8}T\d{6}-[0-9a-f]{10}$/;

/** a file written whole or not at all, the user's alone (0600 in a 0700 directory) */
function writeWhole(file: string, text: string): void {
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
}

// ---- the trials ----

/** THE LEDGER as it is on disk, its chain checked from the first row: the rows up to the first that breaks it, and where and why it broke */
export function readTrials(home: string): { rows: LabRow[]; intact: boolean; brokenAt?: number | undefined; why?: string | undefined } {
  const f = trialsFile(home);
  if (!existsSync(f)) return { rows: [], intact: true };
  const lines = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
  const rows: LabRow[] = [];
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let row: LabRow;
    try {
      row = JSON.parse(lines[i]!) as LabRow;
    } catch {
      return { rows, intact: false, brokenAt: i + 1, why: `row ${i + 1} is not JSON` };
    }
    const { hash, ...rest } = row;
    if (rest.seq !== i + 1) return { rows, intact: false, brokenAt: i + 1, why: `row ${i + 1} says it is row ${String(rest.seq)}` };
    if (rest.prev !== prev) return { rows, intact: false, brokenAt: i + 1, why: `row ${i + 1} does not follow the row before it` };
    if (sha256(prev + canonical(rest)) !== hash) return { rows, intact: false, brokenAt: i + 1, why: `row ${i + 1} is not what was written` };
    rows.push(row);
    prev = hash;
  }
  return { rows, intact: true };
}

/** one row more, chained to the last row ON DISK (read again now: the command and the service may both write) */
export function appendTrial<E extends LabEntry>(home: string, entry: E, now: number): E & { v: 1; seq: number; ts: string; prev: string; hash: string } {
  const f = trialsFile(home);
  let prev = GENESIS;
  let seq = 0;
  if (existsSync(f)) {
    const lines = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
    if (lines.length) {
      const last = lines[lines.length - 1]!;
      seq = lines.length;
      try {
        prev = String((JSON.parse(last) as { hash?: unknown }).hash ?? sha256(last));
      } catch {
        // a last row that does not read: chained to its text, and readTrials says where the chain broke
        prev = sha256(last);
      }
    }
  }
  const unhashed = { v: 1 as const, seq: seq + 1, ts: iso(now), prev, ...entry };
  const row = { ...unhashed, hash: sha256(prev + canonical(unhashed)) } as E & { v: 1; seq: number; ts: string; prev: string; hash: string };
  appendJsonl(f, row);
  return row;
}

const isTrial = (r: LabRow): r is TrialRow => r.kind === "trial";

/** the distinct strategies tried before the holdout: the latest run of each key */
export function trainingTrials(rows: readonly LabRow[]): TrialRow[] {
  const byKey = new Map<string, TrialRow>();
  for (const r of rows) if (isTrial(r) && r.window === "train") byKey.set(r.key, r);
  return [...byKey.values()];
}

// ---- the holdout ----

/** THE HOLDOUT as it stands — the first time it is asked, the default written down (and said in the ledger), so that it never moves by
 * itself. A holdout file that does not read is refused, not replaced: a new default would move the holdout */
export function readHoldout(home: string, now: number): Holdout | Refusal {
  const f = holdoutFile(home);
  if (existsSync(f)) {
    try {
      const h = JSON.parse(readFileSync(f, "utf8")) as Holdout;
      if (h && typeof h.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.start) && Number.isFinite(Date.parse(`${h.start}T00:00:00Z`))) return h;
    } catch {
      // said below
    }
    return no("E_ACCOUNT_BAD_ACTION", { message: `the holdout file (${f}) does not read: put back the day it held out, or remove it to hold out the ${HOLDOUT_DEFAULT_DAYS} days before now` });
  }
  const h: Holdout = { version: 1, start: dayOf(Math.floor(now / DAY_MS) * DAY_MS - HOLDOUT_DEFAULT_DAYS * DAY_MS), setAt: iso(now), setBy: "default" };
  writeWhole(f, JSON.stringify(h, null, 1));
  appendTrial(home, { kind: "holdout", by: "default", start: h.start }, now);
  return h;
}

export const holdoutStartMs = (h: Holdout): number => Date.parse(`${h.start}T00:00:00Z`);

/** THE HOLDOUT MOVED, as the owner says (their signature, or their terminal): to a day that has come, never back over days a strategy was
 * already tried on — those would be held out after they were looked at */
export function setHoldout(home: string, start: string, by: LabWho, now: number): Holdout | Refusal {
  const day = start.trim();
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(ms) || dayOf(ms) !== day) return no("E_ACCOUNT_BAD_ACTION", { message: `a holdout starts on a day, YYYY-MM-DD, not "${day.slice(0, 20)}"` });
  if (day < HOLDOUT_EARLIEST) return no("E_ACCOUNT_BAD_ACTION", { message: `a holdout starts on ${HOLDOUT_EARLIEST} or later` });
  if (ms > now) return no("E_ACCOUNT_BAD_ACTION", { message: `a holdout starts on a day that has come: ${day} is after today (${dayOf(now)})` });
  const was = readHoldout(home, now);
  if (isRefusal(was)) return was;
  if (day === was.start) return no("E_ACCOUNT_BAD_ACTION", { message: `the holdout already starts on ${day}` });
  const ledger = readTrials(home);
  const tried = ledger.rows.filter(isTrial).filter((r) => r.window === "train" && Date.parse(r.to) > ms);
  if (tried.length) {
    const last = tried.reduce((a, b) => (Date.parse(b.to) > Date.parse(a.to) ? b : a));
    return no("E_ACCOUNT_BAD_ACTION", { message: `the days after ${day} were already tried on (trial ${last.seq} ran to ${last.to.slice(0, 10)}): a holdout starts after every training run's end, ${last.to.slice(0, 10)} or later` });
  }
  const h: Holdout = { version: 1, start: day, setAt: iso(now), setBy: by };
  writeWhole(holdoutFile(home), JSON.stringify(h, null, 1));
  appendTrial(home, { kind: "holdout", by, start: day, was: was.start }, now);
  return h;
}

// ---- the judgement ----

export interface Deflated {
  /** the probability that the Sharpe is real once every distinct training trial is counted */
  dsr: number;
  /** the Sharpe a year the best of that many trials would show by chance alone */
  sr0: number;
  trials: number;
}

/** a training run's Sharpe deflated by the distinct strategies tried before the holdout (this one among them): every trial's Sharpe a year
 * read at this run's steps a year */
export function deflate(rows: readonly LabRow[], t: TrialEntry): Deflated | undefined {
  if (!(t.steps > 1) || !(t.perYear > 0)) return undefined;
  const root = Math.sqrt(t.perYear);
  const tried = trainingTrials(rows);
  const sharpes = (tried.some((x) => x.key === t.key) ? tried : [...tried, t]).map((x) => x.sharpe / root);
  const d = dsr({ sr: t.sr, n: t.steps, skew: t.skew, kurt: t.kurt, trialSharpes: sharpes });
  return { dsr: d.dsr, sr0: d.sr0 * root, trials: d.trials };
}

export interface Overfit {
  pbo: number;
  /** the runs judged together, on how many shared steps, in how many blocks and halves */
  trials: number;
  steps: number;
  blocks: number;
  combinations: number;
}

/** how likely picking the best of the runs on these markets and bars was picking the luckiest (stats.ts pbo): the distinct training trials
 * on the same markets and bar size whose runs are kept, the latest PBO_MOST of them, on the steps they share */
export function overfit(home: string, rows: readonly LabRow[], t: TrialEntry): Overfit | undefined {
  const family = (x: TrialEntry): string => `${[...x.markets].sort().join(",")}|${x.interval}`;
  const kin = trainingTrials(rows)
    .filter((x) => x.kept && family(x) === family(t))
    .slice(-PBO_MOST);
  if (kin.length < 2) return undefined;
  const curves: Array<Map<number, number>> = [];
  for (const x of kin) {
    try {
      const kept = JSON.parse(readFileSync(runFile(home, x.run), "utf8")) as { run?: BacktestRun };
      const eq = kept.run?.equity;
      if (Array.isArray(eq) && eq.length > 2) curves.push(new Map(eq.map((p) => [p.t, p.usd])));
    } catch {
      // a run no longer kept is left out
    }
  }
  if (curves.length < 2) return undefined;
  const shared = [...curves[0]!.keys()].filter((at) => curves.every((c) => c.has(at))).sort((a, b) => a - b);
  if (shared.length < 9) return undefined;
  const returns = curves.map((c) => stepReturns(shared.map((at) => ({ t: at, usd: c.get(at)! }))));
  const p = pbo(returns);
  return p ? { pbo: p.pbo, trials: p.trials, steps: p.steps, blocks: p.blocks, combinations: p.combinations } : undefined;
}

// ---- a run ----

export interface LabAsk {
  spec: StrategySpec;
  refs: MarketRef[];
  interval: CandleInterval;
  /** the window, ms. A training run: its end at the holdout's start at the latest (and there when none is said), its start the 180 days
   * before its end when none is said. A look at the holdout: from the holdout's start to `to` (now when none is said) */
  from?: number | undefined;
  to?: number | undefined;
  window: "train" | "holdout";
  cashUsd: number;
  feeBps: number;
  leverage?: number | undefined;
  costs: BacktestCosts;
  benchmark: boolean;
  /** keep the run in the home (the trial is counted either way: it was tried) */
  save: boolean;
  by: LabWho;
  seat?: string | undefined;
  /** the most steps this run may take (the engine's own most otherwise) */
  maxSteps?: number | undefined;
}

export interface LabDeps {
  home: string;
  /** where the bars are kept (<home>/history) */
  cache: string;
  sources: HistorySources;
  clock: () => number;
  say?: ((line: string) => void) | undefined;
}

export interface LabOutcome {
  id: string;
  run: BacktestRun;
  benchmark?: BacktestRun | undefined;
  /** what was said before the run: the window, a source's words */
  notes: string[];
  saved?: string | undefined;
  window: "train" | "holdout";
  holdout: Holdout;
  trial: TrialRow;
  /** a training run: its Sharpe deflated by the distinct strategies tried before the holdout */
  deflated?: Deflated | undefined;
  /** a look at the holdout: the probability its Sharpe is above zero, and how many looks the holdout has had, this one among them */
  psr?: number | undefined;
  looks?: number | undefined;
  overfit?: Overfit | undefined;
  ledger: { rows: number; intact: boolean; brokenAt?: number | undefined; why?: string | undefined };
}

/** the run's id: when it ran, and a hash of what it was (the same spec, markets, window and costs, the same hash) */
export function runId(o: { spec: StrategySpec; refs: MarketRef[]; interval: CandleInterval; from: number; to: number; cashUsd: number; feeBps: number; leverage?: number | undefined; costs: BacktestCosts }, at: number): string {
  const what = JSON.stringify([o.spec, o.refs.map(marketText), o.interval, o.from, o.to, o.cashUsd, o.feeBps, o.leverage ?? null, o.costs]);
  return `${iso(at).replace(/[-:]/g, "").slice(0, 15)}-${createHash("sha256").update(what).digest("hex").slice(0, 10)}`;
}

/** what a trial is, hashed: its key */
const keyOf = (t: Pick<TrialEntry, "strategy" | "params" | "markets" | "interval" | "from" | "to" | "cashUsd" | "feeBps" | "leverage" | "costs">): string =>
  sha256(canonical({ strategy: t.strategy, params: t.params, markets: [...t.markets].sort(), interval: t.interval, from: t.from, to: t.to, cashUsd: t.cashUsd, feeBps: t.feeBps, leverage: t.leverage ?? null, costs: t.costs })).slice(0, 16);

/** A BACKTEST RUN, from what was asked to what came of it — on the right side of the holdout, counted in the ledger, kept in the home (see
 * the top of this file) */
export async function labRun(ask: LabAsk, deps: LabDeps): Promise<LabOutcome | Refusal> {
  const now = deps.clock();
  const holdout = readHoldout(deps.home, now);
  if (isRefusal(holdout)) return holdout;
  const cut = holdoutStartMs(holdout);
  const step = INTERVAL_MS[ask.interval];
  const strategy = makeStrategy(ask.spec);
  const notes: string[] = [];
  let from: number;
  let to: number;
  if (ask.window === "train") {
    to = ask.to ?? cut;
    if (to > cut) return no("E_ACCOUNT_OWNER_ONLY", { message: `the data from ${holdout.start} on is held out: a strategy is tried before it (a window ending ${holdout.start} at the latest), and runs on it only when the account's owner says so`, detail: { holdout: holdout.start } });
    from = ask.from ?? to - WINDOW_DEFAULT_DAYS * DAY_MS;
  } else {
    from = cut;
    to = ask.to ?? Math.floor(now / step) * step;
    if (!(to > from)) return no("E_ACCOUNT_BAD_ACTION", { message: `nothing is held out yet: the holdout starts ${holdout.start}` });
  }
  if (!(to > from)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest's window ends after it starts" });
  const loaded = await loadHistory({ refs: ask.refs, interval: ask.interval, from: from - strategy.warmupMs, to, cache: deps.cache, sources: deps.sources, clock: deps.clock, say: deps.say });
  if (isRefusal(loaded)) return loaded;
  notes.push(...loaded.notes);
  // the run starts once every market has the history its strategy reads first
  const ready = Math.max(...loaded.markets.map((m) => (m.bars[0]?.t ?? from) + strategy.warmupMs));
  const start = Math.max(from, ready);
  if (start > from) notes.push(`the run starts at the first bar after ${iso(start).slice(0, 16).replace("T", " ")} UTC, not ${dayOf(from)}: the ${strategy.name.toLowerCase()} reads ${Math.round(strategy.warmupMs / DAY_MS)} days of bars first, and the bars start ${dayOf(ready - strategy.warmupMs)}`);
  if (!(to > start)) return no("E_ACCOUNT_BAD_ACTION", { message: `nothing is left to run: the history the strategy needs first reaches to ${dayOf(start)}` });
  if (ask.window === "train") notes.push(`the data from ${holdout.start} on is held out${holdout.setBy === "default" ? ` (the ${HOLDOUT_DEFAULT_DAYS} days before the first run)` : ""}: this run ends ${iso(to).slice(0, 16).replace("T", " ")} UTC`);
  else notes.push(`a look at the held-out data, from ${holdout.start}: counted, since a holdout looked at often is a holdout no more`);
  const work = mkdtempSync(join(tmpdir(), "openpaper-backtest-"));
  try {
    const base = { markets: loaded.markets, from: start, to, cashUsd: ask.cashUsd, feeBps: ask.feeBps, costs: ask.costs, ...(ask.maxSteps !== undefined ? { maxSteps: ask.maxSteps } : {}) };
    const run = await runBacktest({ ...base, ...(ask.leverage !== undefined ? { leverage: ask.leverage } : {}), strategy: ask.spec, home: join(work, "run"), say: deps.say });
    if (isRefusal(run)) return run;
    let benchmark: BacktestRun | undefined;
    if (ask.benchmark && ask.spec.id !== "hold") {
      const hold = strategySpec("hold");
      if (typeof hold !== "string") {
        const b = await runBacktest({ ...base, strategy: hold, home: join(work, "hold") });
        if (!isRefusal(b)) benchmark = b;
        else notes.push(`the buy-and-hold beside it did not run: ${b.message ?? b.code}`);
      }
    }
    const at = deps.clock();
    const id = runId({ ...ask, from: start, to }, at);
    const m = run.metrics;
    const shape = moments(stepReturns(run.equity));
    const trialOf: Omit<TrialEntry, "key"> = {
      kind: "trial",
      by: ask.by,
      ...(ask.seat ? { seat: ask.seat } : {}),
      run: id,
      window: ask.window,
      strategy: ask.spec.id,
      params: ask.spec.params,
      markets: ask.refs.map(marketText),
      interval: ask.interval,
      from: iso(start),
      to: iso(to),
      cashUsd: ask.cashUsd,
      feeBps: ask.feeBps,
      ...(ask.leverage !== undefined ? { leverage: ask.leverage } : {}),
      costs: ask.costs,
      steps: m.steps,
      perYear: m.perYear,
      sharpe: m.sharpe,
      sr: m.perYear > 0 ? m.sharpe / Math.sqrt(m.perYear) : 0,
      skew: shape.skew,
      kurt: shape.kurt,
      returnPct: m.returnPct,
      maxDrawdownPct: m.maxDrawdownPct,
      fills: m.fills,
      kept: ask.save,
    };
    let saved: string | undefined;
    if (ask.save) {
      saved = runFile(deps.home, id);
      writeWhole(saved, JSON.stringify({ version: 1, id, at: iso(at), by: ask.by, ...(ask.seat ? { seat: ask.seat } : {}), window: ask.window, holdout: holdout.start, markets: ask.refs.map(marketText), interval: ask.interval, notes, run, ...(benchmark ? { benchmark } : {}) }));
    }
    const trial = appendTrial(deps.home, { ...trialOf, key: keyOf(trialOf) } as TrialEntry, at) as TrialRow;
    if (ask.save) pruneRuns(deps.home);
    const ledger = readTrials(deps.home);
    const judged = judge(deps.home, ledger.rows, trial);
    return { id, run, ...(benchmark ? { benchmark } : {}), notes, ...(saved ? { saved } : {}), window: ask.window, holdout, trial, ...judged, ledger: { rows: ledger.rows.length, intact: ledger.intact, ...(ledger.intact ? {} : { brokenAt: ledger.brokenAt, why: ledger.why }) } };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** a trial judged against the ledger as it stands: a training run deflated by the trials and judged with its kin for overfitting; a look at
 * the holdout, its probability of a Sharpe above zero and the looks so far */
function judge(home: string, rows: readonly LabRow[], t: TrialEntry): Pick<LabOutcome, "deflated" | "psr" | "looks" | "overfit"> {
  if (t.window === "holdout") {
    const looks = rows.filter((r) => isTrial(r) && r.window === "holdout").length;
    return { psr: t.steps > 1 ? psr(t.sr, 0, t.steps, t.skew, t.kurt) : Number.NaN, looks };
  }
  const deflated = deflate(rows, t);
  const o = overfit(home, rows, t);
  return { ...(deflated ? { deflated } : {}), ...(o ? { overfit: o } : {}) };
}

// ---- what is asked ----

const ASK_FIELDS = ["strategy", "params", "markets", "interval", "from", "to", "cash", "feeBps", "leverage", "halfSpreadBps", "participation", "levelBps", "benchmark", "seat"] as const;
export const ASK_INTERVALS: readonly CandleInterval[] = ["1h", "4h", "1d"];

/** WHAT AN UNSIGNED REQUEST ASKS (the service's POST /api/account/backtest, portfolio_backtest), read strictly: a field it does not know is
 * refused, every number is in its bounds, the window is days. What it leaves out is the command's default: momentum on Bitcoin's
 * perpetual, hourly, the 180 days before the holdout, $10,000 at the paper account's fee (none on shares), the buy-and-hold beside it.
 * `seat` names who asks — said, not proven */
export function askOf(body: Record<string, unknown>): Omit<LabAsk, "by" | "window" | "save" | "maxSteps"> | string {
  for (const k of Object.keys(body)) if (!(ASK_FIELDS as readonly string[]).includes(k)) return `a backtest is asked with ${ASK_FIELDS.join(", ")} — not "${k.slice(0, 30)}"`;
  if (body.strategy !== undefined && typeof body.strategy !== "string") return "strategy is one of hold, sma, tsmom, carry";
  if (body.params !== undefined && (typeof body.params !== "object" || body.params === null || Array.isArray(body.params))) return "params is {name: number}";
  const params = (body.params ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(params)) if (typeof v !== "number" && typeof v !== "string") return `params.${k.slice(0, 30)} is a number`;
  const spec = strategySpec(typeof body.strategy === "string" ? body.strategy : "tsmom", params as Record<string, number | string>);
  if (typeof spec === "string") return spec;
  const markets = body.markets === undefined ? "perp:BTC" : typeof body.markets === "string" ? body.markets : Array.isArray(body.markets) && body.markets.every((m) => typeof m === "string") ? body.markets.join(",") : undefined;
  if (markets === undefined || markets.length > 400) return 'markets is "perp:BTC,spot:ETH,stock:AAPL", or a list of them';
  const refs = parseMarkets(markets);
  if (typeof refs === "string") return refs;
  const interval = body.interval === undefined ? "1h" : body.interval;
  if (typeof interval !== "string" || !(ASK_INTERVALS as readonly string[]).includes(interval)) return `interval is ${ASK_INTERVALS.join(", ")}`;
  const day = (k: "from" | "to"): number | undefined | string => {
    const v = body[k];
    if (v === undefined) return undefined;
    const ms = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) : Number.NaN;
    return Number.isFinite(ms) && dayOf(ms) === v ? ms : `${k} is a day, YYYY-MM-DD`;
  };
  const from = day("from");
  const to = day("to");
  if (typeof from === "string") return from;
  if (typeof to === "string") return to;
  if (from !== undefined && to !== undefined && !(to > from)) return "to is after from";
  const num = (k: string, lo: number, hi: number, fallback: number | undefined, open = false): number | undefined | string => {
    const v = body[k];
    if (v === undefined) return fallback;
    return typeof v === "number" && Number.isFinite(v) && (open ? v > lo : v >= lo) && v <= hi ? v : `${k} is ${open ? "more than " : ""}${lo} to ${hi}`;
  };
  const shares = refs.every((r) => r.cls === "stock");
  const cash = num("cash", 100, 100_000_000, 10_000);
  const fee = num("feeBps", 0, 500, shares ? 0 : PAPER_FEE_BPS);
  const leverage = num("leverage", 1, 50, undefined);
  const half = num("halfSpreadBps", 0, 500, DEFAULT_COSTS.halfSpreadBps);
  const part = num("participation", 0, 1, DEFAULT_COSTS.participation, true);
  const level = num("levelBps", 0, 500, DEFAULT_COSTS.levelBps);
  for (const v of [cash, fee, leverage, half, part, level]) if (typeof v === "string") return v;
  if (body.benchmark !== undefined && typeof body.benchmark !== "boolean") return "benchmark is true or false";
  const seat = body.seat;
  if (seat !== undefined && !(typeof seat === "string" && /^[\w.:@-]{1,80}$/.test(seat))) return "seat names who asks: up to 80 letters, digits and . : @ _ -";
  return {
    spec,
    refs,
    interval: interval as CandleInterval,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    cashUsd: cash as number,
    feeBps: fee as number,
    ...(leverage !== undefined ? { leverage: leverage as number } : {}),
    costs: { ...DEFAULT_COSTS, halfSpreadBps: half as number, participation: part as number, levelBps: level as number },
    benchmark: body.benchmark !== false,
    ...(typeof seat === "string" ? { seat } : {}),
  };
}

/** a run as an answer that fits a tool's reply: the figures, the judgement and the notes, with the trades and the curve left in the kept run
 * (GET /api/account/backtest?id=) */
export function outcomeSummary(out: LabOutcome): Record<string, unknown> {
  const r = out.run;
  return {
    id: out.id,
    window: out.window,
    holdout: out.holdout.start,
    strategy: r.strategy,
    markets: r.markets,
    from: r.from,
    to: r.to,
    cashUsd: r.cashUsd,
    feeBps: r.feeBps,
    leverage: r.leverage,
    costs: r.costs,
    metrics: r.metrics,
    ...(out.benchmark ? { benchmark: { strategy: out.benchmark.strategy.id, metrics: out.benchmark.metrics } } : {}),
    fills: r.fills.length,
    refused: r.refused.length,
    funding: r.funding,
    ...(out.deflated ? { deflated: out.deflated } : {}),
    ...(out.psr !== undefined ? { psr: Number.isNaN(out.psr) ? null : out.psr, looks: out.looks } : {}),
    ...(out.overfit ? { overfit: out.overfit } : {}),
    trial: out.trial.seq,
    ledger: out.ledger,
    kept: out.saved !== undefined,
    notes: [...out.notes, ...r.notes],
  };
}

// ---- what is kept ----

/** the ledger and the holdout as they stand — the holdout's default written down if nothing has asked before — and the latest runs (the
 * ledger's rows: what was tried, by whom, with its figures), newest first */
export function labList(home: string, now: number, limit = 50, o: { owner?: boolean } = {}): { holdout: Holdout | Refusal; ledger: { rows: number; intact: boolean; brokenAt?: number | undefined; why?: string | undefined; trials: number; distinct: number; looks: number }; runs: Array<TrialRow | LookRow> } {
  const ledger = readTrials(home);
  const trials = ledger.rows.filter(isTrial);
  return {
    holdout: readHoldout(home, now),
    ledger: { rows: ledger.rows.length, intact: ledger.intact, ...(ledger.intact ? {} : { brokenAt: ledger.brokenAt, why: ledger.why }), trials: trials.length, distinct: trainingTrials(ledger.rows).length, looks: trials.filter((t) => t.window === "holdout").length },
    runs: trials
      .slice(-Math.max(1, Math.min(500, limit)))
      .reverse()
      .map((t) => (o.owner || t.window !== "holdout" ? t : lookOf(t))),
  };
}

/** a look at the held-out data as anyone but the owner reads it: that it was taken, by whom, of what — never what came of it */
export type LookRow = Pick<TrialRow, "v" | "seq" | "ts" | "kind" | "by" | "run" | "window" | "strategy" | "params" | "markets" | "interval" | "from" | "to"> & { figures: "the owner's" };
const lookOf = (t: TrialRow): LookRow => ({ v: t.v, seq: t.seq, ts: t.ts, kind: t.kind, by: t.by, run: t.run, window: t.window, strategy: t.strategy, params: t.params, markets: t.markets, interval: t.interval, from: t.from, to: t.to, figures: "the owner's" });

/** THE RUNS KEPT, at most: the oldest TRAINING runs past it are let go (their rows stay in the ledger, saying what was tried; a run read
 * back is then said not to be kept, and the overfitting leaves it out). The owner's looks at the holdout are always kept */
export const RUNS_KEPT = 200;
export function pruneRuns(home: string, keep = RUNS_KEPT): void {
  const dir = join(labDir(home), "runs");
  if (!existsSync(dir)) return;
  const trials = readTrials(home).rows.filter(isTrial);
  const holdout = new Set(trials.filter((t) => t.window === "holdout").map((t) => t.run));
  // oldest first by the ledger's own order (runs made in the same second share their id's time); a file the ledger does not name, first
  const seq = new Map(trials.map((t) => [t.run, t.seq] as const));
  const train = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && RUN_ID.test(f.slice(0, -5)) && !holdout.has(f.slice(0, -5)))
    .map((f) => f.slice(0, -5))
    .sort((a, b) => (seq.get(a) ?? 0) - (seq.get(b) ?? 0) || a.localeCompare(b));
  for (const id of train.slice(0, Math.max(0, train.length - keep))) rmSync(runFile(home, id), { force: true });
}

/** one run as it was kept, its trial, and how it is judged against the ledger NOW (more trials since deflate it more). A look at the
 * held-out data is the owner's (`owner`: their terminal): to anyone else, what came of it is not said — an agent that saw it could choose
 * among strategies by it, and the holdout would be a holdout no more */
export function labRead(home: string, id: string, o: { owner?: boolean } = {}): Record<string, unknown> | Refusal {
  if (!RUN_ID.test(id)) return no("E_ACCOUNT_BAD_ACTION", { message: "a run's id is like 20261029T120000-0123456789" });
  const f = runFile(home, id);
  if (!o.owner && readTrials(home).rows.some((r) => isTrial(r) && r.run === id && r.window === "holdout")) return no("E_ACCOUNT_OWNER_ONLY", { message: `${id} is a look at the held-out data: what came of it is the owner's, answered to their signature and kept in the home` });
  if (!existsSync(f)) return no("E_ACCOUNT_BAD_ACTION", { message: `no run ${id} is kept` });
  let kept: Record<string, unknown>;
  try {
    kept = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  } catch {
    return no("E_ACCOUNT_BAD_ACTION", { message: `run ${id} does not read` });
  }
  const ledger = readTrials(home);
  const trial = ledger.rows.filter(isTrial).find((r) => r.run === id);
  return { ...kept, ...(trial ? { trial, ...judge(home, ledger.rows, trial) } : {}), ledger: { rows: ledger.rows.length, intact: ledger.intact } };
}

/** THE OWNER'S LOOK AT THE HOLDOUT: a training run tried again exactly — the strategy, its numbers, the markets, the bars, the money, the fee
 * and the costs — on the held-out data, from the holdout's start to now. `run` is the training run's id */
export async function labEvaluate(run: string, deps: LabDeps, by: LabWho): Promise<LabOutcome | Refusal> {
  if (!RUN_ID.test(run)) return no("E_ACCOUNT_BAD_ACTION", { message: "a run's id is like 20261029T120000-0123456789" });
  const t = readTrials(deps.home).rows.filter(isTrial).find((r) => r.run === run);
  if (!t) return no("E_ACCOUNT_BAD_ACTION", { message: `no trial ran as ${run}` });
  if (t.window !== "train") return no("E_ACCOUNT_BAD_ACTION", { message: `${run} was itself a look at the holdout: look again from the training run it tried` });
  const spec = strategySpec(t.strategy, t.params);
  if (typeof spec === "string") return no("E_ACCOUNT_BAD_ACTION", { message: spec });
  const refs = parseMarkets(t.markets.join(","));
  if (typeof refs === "string") return no("E_ACCOUNT_BAD_ACTION", { message: refs });
  return labRun({ spec, refs, interval: t.interval, window: "holdout", cashUsd: t.cashUsd, feeBps: t.feeBps, ...(t.leverage !== undefined ? { leverage: t.leverage } : {}), costs: t.costs, benchmark: true, save: true, by }, deps);
}
