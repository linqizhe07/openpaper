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
 *     and bars are judged together too, for how likely picking the best of them was picking the luckiest (pbo). An exit sweep over a desk
 *     run's entries (labScreen, backtest/screen.ts) is a row too, with every rule it screened — each one a strategy tried, never run.
 *
 * A run itself is the engine's (backtest/engine.ts) over the history kept in the home (backtest/data.ts), with the same markets bought and
 * held beside it, and it is kept in <home>/backtest/runs/<id>.json — with its round trips beside random entries on the same markets, sides
 * and exits (backtest/screen.ts baselineOf), where it closed any. Who asked is said, not proven: an unsigned request names the seat it
 * says it is (the service's routes take no signature to run a backtest, and an unsigned run never reaches the holdout); the owner's look at
 * the holdout is theirs by signature, and so is a run of the desk itself (deskAskOf), which builds a whole account to trade in. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { canonical, sha256 } from "../../core/hash.ts";
import { FEW } from "../account/debrief.ts";
import { appendJsonl } from "../../core/jsonl.ts";
import { PAPER_FEE_BPS } from "../live/paper.ts";
import { INTERVAL_MS, type CandleInterval } from "../live/trade.ts";
import { no } from "../refuse.ts";
import { loadHistory, marketText, parseMarkets, type HistorySources, type MarketRef } from "./data.ts";
import { runBacktest, type BacktestRun } from "./engine.ts";
import { stepReturns } from "./metrics.ts";
import { DEFAULT_COSTS, type BacktestCosts, type BacktestMarket } from "./source.ts";
import { makeStrategy, STRATEGIES, strategySpec, type StrategySpec } from "./strategies.ts";
import { DESK_NAME, DESK_PARAMS, deskParams, type DeskParams } from "./desk-params.ts";
import { baselineOf, screenCosts, SWEEP_GRID, SWEEP_WORK_MOST, sweepOf, tapeOf, tradesOf, type Baseline, type Sweep, type SweepGrid, type SweepRule } from "./screen.ts";
import { dsr, expectedMaxSharpe, moments, pbo, psr } from "./stats.ts";

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
/** an exit sweep over a kept desk run's entries (labScreen): every rule of its grid a strategy tried and never run, its net a trade and its
 * Sharpe a year kept in the grid's order */
export interface ScreenEntry {
  kind: "screen";
  by: LabWho;
  seat?: string | undefined;
  /** the kept run whose entries were screened */
  run: string;
  window: "train";
  /** what was screened, hashed: the run's own key, the grid and the costs — the same sweep, the same key */
  key: string;
  strategy: string;
  params: Record<string, number>;
  markets: string[];
  interval: CandleInterval;
  from: string;
  to: string;
  cashUsd: number;
  feeBps: number;
  costs: BacktestCosts;
  trades: number;
  grid: SweepGrid;
  rules: number;
  means: number[];
  sharpes: number[];
  best: SweepRule;
  own?: (SweepRule & { rank: number }) | undefined;
  /** the best rule's deflated Sharpe, the Sharpe a year the best of that many would show by chance, the strategies counted */
  dsr: number;
  sr0: number;
  trials: number;
  chance: Sweep["chance"];
  /** what the sweep found, in words (backtest/screen.ts) */
  words: string;
}
export type LabEntry = TrialEntry | HoldoutEntry | ScreenEntry;
export type LabRow = LabEntry & { v: 1; seq: number; ts: string; prev: string; hash: string };
export type TrialRow = TrialEntry & { v: 1; seq: number; ts: string; prev: string; hash: string };
export type ScreenRow = ScreenEntry & { v: 1; seq: number; ts: string; prev: string; hash: string };

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
const isScreen = (r: LabRow): r is ScreenRow => r.kind === "screen";

/** the distinct strategies tried before the holdout: the latest run of each key */
export function trainingTrials(rows: readonly LabRow[]): TrialRow[] {
  const byKey = new Map<string, TrialRow>();
  for (const r of rows) if (isTrial(r) && r.window === "train") byKey.set(r.key, r);
  return [...byKey.values()];
}
/** the strategies screened before the holdout and never run: every rule of every distinct exit sweep */
export function screenedRules(rows: readonly LabRow[]): number {
  const byKey = new Map<string, number>();
  for (const r of rows) if (isScreen(r)) byKey.set(r.key, r.rules);
  return [...byKey.values()].reduce((s, n) => s + n, 0);
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
  const tried = ledger.rows.filter((r): r is TrialRow | ScreenRow => (isTrial(r) || isScreen(r)) && r.window === "train" && Date.parse(r.to) > ms);
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
 * read at this run's steps a year. The rules an exit sweep screened count too, each a strategy tried — varying as chance alone makes a zero
 * Sharpe vary over this run's steps, or as the runs' Sharpes do where they vary more: a rule's own Sharpe is mostly what its costs take
 * (backtest/screen.ts), which is no luck */
export function deflate(rows: readonly LabRow[], t: TrialEntry): Deflated | undefined {
  if (!(t.steps > 1) || !(t.perYear > 0)) return undefined;
  const root = Math.sqrt(t.perYear);
  const tried = trainingTrials(rows);
  const sharpes = (tried.some((x) => x.key === t.key) ? tried : [...tried, t]).map((x) => x.sharpe / root);
  const rules = screenedRules(rows);
  if (!rules) {
    const d = dsr({ sr: t.sr, n: t.steps, skew: t.skew, kurt: t.kurt, trialSharpes: sharpes });
    return { dsr: d.dsr, sr0: d.sr0 * root, trials: d.trials };
  }
  const variance = Math.max(sharpes.length > 1 ? moments(sharpes).sd ** 2 : 0, 1 / (t.steps - 1));
  const trials = sharpes.length + rules;
  const sr0 = expectedMaxSharpe(trials, variance);
  return { dsr: psr(t.sr, sr0, t.steps, t.skew, t.kurt), sr0: sr0 * root, trials };
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

/** the desk itself as a run's strategy (backtest/desk.ts): its numbers read as deskParams reads them */
export interface DeskSpec {
  id: "desk";
  params: DeskParams;
}
export const isDesk = (s: StrategySpec | DeskSpec): s is DeskSpec => s.id === "desk";
export function deskSpec(raw: Record<string, number | string> = {}): DeskSpec | string {
  const p = deskParams(raw);
  return typeof p === "string" ? p : { id: "desk", params: p };
}

export interface LabAsk {
  /** a strategy (backtest/strategies.ts), or the desk itself (backtest/desk.ts: the owner's signature and terminal only) */
  spec: StrategySpec | DeskSpec;
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
  /** its round trips beside random entries on the same markets, sides and exits (backtest/screen.ts), where it closed any */
  baseline?: Baseline | undefined;
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
export function runId(o: { spec: StrategySpec | DeskSpec; refs: MarketRef[]; interval: CandleInterval; from: number; to: number; cashUsd: number; feeBps: number; leverage?: number | undefined; costs: BacktestCosts }, at: number): string {
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
  const desk = isDesk(ask.spec);
  if (desk && ask.refs.some((r) => r.cls !== "perp")) return no("E_ACCOUNT_BAD_ACTION", { message: "the desk trades perpetuals here: perp:COIN markets only" });
  if (desk && ask.interval === "1d") return no("E_ACCOUNT_BAD_ACTION", { message: "the desk steps over 1h or 4h bars: a day's bar is longer than its longest cycle" });
  // what the run reads before its first step (the desk reads none: its brain is a script that names the markets in turn)
  const strategy = desk ? { name: DESK_NAME, warmupMs: 0 } : makeStrategy(ask.spec as StrategySpec);
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
  if (start > from) notes.push(strategy.warmupMs > 0 ? `the run starts at the first bar after ${iso(start).slice(0, 16).replace("T", " ")} UTC, not ${dayOf(from)}: the ${strategy.name.toLowerCase()} reads ${Math.round(strategy.warmupMs / DAY_MS)} days of bars first, and the bars start ${dayOf(ready - strategy.warmupMs)}` : `the run starts at its markets' first bar, ${iso(start).slice(0, 16).replace("T", " ")} UTC, not ${dayOf(from)}: their bars start then`);
  if (!(to > start)) return no("E_ACCOUNT_BAD_ACTION", { message: `nothing is left to run: the history the strategy needs first reaches to ${dayOf(start)}` });
  if (ask.window === "train") notes.push(`the data from ${holdout.start} on is held out${holdout.setBy === "default" ? ` (the ${HOLDOUT_DEFAULT_DAYS} days before the first run)` : ""}: this run ends ${iso(to).slice(0, 16).replace("T", " ")} UTC`);
  else notes.push(`a look at the held-out data, from ${holdout.start}: counted, since a holdout looked at often is a holdout no more`);
  const work = mkdtempSync(join(tmpdir(), "openpaper-backtest-"));
  try {
    // the desk fills at its paper account's own fee: the buy-and-hold beside it pays the same
    const feeBps = desk ? PAPER_FEE_BPS : ask.feeBps;
    const base = { markets: loaded.markets, from: start, to, cashUsd: ask.cashUsd, feeBps, costs: ask.costs, ...(ask.maxSteps !== undefined ? { maxSteps: ask.maxSteps } : {}) };
    const run = desk
      ? await (await import("./desk.ts")).runDeskBacktest({ markets: loaded.markets, from: start, to, cashUsd: ask.cashUsd, costs: ask.costs, params: (ask.spec as DeskSpec).params, work: join(work, "desk"), ...(ask.maxSteps !== undefined ? { maxSteps: ask.maxSteps } : {}), say: deps.say })
      : await runBacktest({ ...base, ...(ask.leverage !== undefined ? { leverage: ask.leverage } : {}), strategy: ask.spec as StrategySpec, home: join(work, "run"), say: deps.say });
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
    // its round trips beside random entries, drawn from what the run was (its id but the time it ran): the same run, the same tries
    const baseline = run.trips?.length ? baselineOfRun(run, loaded.markets, start, to, id.slice(16)) : undefined;
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
      feeBps,
      ...(ask.leverage !== undefined && !desk ? { leverage: ask.leverage } : {}),
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
      writeWhole(saved, JSON.stringify({ version: 1, id, at: iso(at), by: ask.by, ...(ask.seat ? { seat: ask.seat } : {}), window: ask.window, holdout: holdout.start, markets: ask.refs.map(marketText), interval: ask.interval, notes, run, ...(benchmark ? { benchmark } : {}), ...(baseline ? { baseline } : {}) }));
    }
    const trial = appendTrial(deps.home, { ...trialOf, key: keyOf(trialOf) } as TrialEntry, at) as TrialRow;
    if (ask.save) pruneRuns(deps.home);
    const ledger = readTrials(deps.home);
    const judged = judge(deps.home, ledger.rows, trial);
    return { id, run, ...(benchmark ? { benchmark } : {}), notes, ...(baseline ? { baseline } : {}), ...(saved ? { saved } : {}), window: ask.window, holdout, trial, ...judged, ledger: { rows: ledger.rows.length, intact: ledger.intact, ...(ledger.intact ? {} : { brokenAt: ledger.brokenAt, why: ledger.why }) } };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** a run's round trips beside random entries (backtest/screen.ts baselineOf): over its markets' bars in its window, at its fee and spread */
function baselineOfRun(run: BacktestRun, markets: readonly BacktestMarket[], from: number, to: number, seed: string): Baseline | undefined {
  const tapes = markets.map((m) => tapeOf(m, from, to));
  return baselineOf({ tapes, trades: tradesOf(run.trips ?? [], tapes), costs: screenCosts(run.feeBps, run.costs.halfSpreadBps), seed });
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
  if (body.strategy === "desk") return "the desk runs by the owner's signature (the Backtest page's desk mode: setBacktest desk) or at their terminal (npm run account:backtest -- --strategy desk): it builds a whole account to trade in, so no unsigned request runs it";
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

const DESK_FIELDS = ["markets", "interval", "from", "to", "cash", "params", "halfSpreadBps", "participation", "levelBps"] as const;
/** the bars the desk steps over: a day's bar is longer than its longest cycle */
export const DESK_INTERVALS: readonly CandleInterval[] = ["1h", "4h"];

/** WHAT THE OWNER'S SIGNATURE ASKS OF THE DESK (setBacktest desk, the Backtest page's desk mode): the signed value is the ask as JSON, read
 * as strictly as a request is — the markets (perpetuals), the bars (1h or 4h), the window, the money, the desk's own numbers
 * (desk-params.ts) and the cost model, a field it does not know refused. What it leaves out is a request's default. A training run like any
 * other: its window ends at the holdout's start at the latest. The desk fills at its paper account's own fee */
export function deskAskOf(value: string): (Omit<LabAsk, "by" | "window" | "save" | "maxSteps" | "benchmark" | "spec"> & { spec: DeskSpec }) | string {
  if (value.length > 2_000) return "the desk's ask is 2,000 characters of JSON at most";
  let body: unknown;
  try {
    body = JSON.parse(value);
  } catch {
    return `the desk's ask is JSON: {${DESK_FIELDS.join(", ")}}`;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return `the desk's ask is {${DESK_FIELDS.join(", ")}}`;
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!(DESK_FIELDS as readonly string[]).includes(k)) return `the desk is asked with ${DESK_FIELDS.join(", ")} — not "${k.slice(0, 30)}"`;
  const { params, ...rest } = b;
  if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) return "params is {name: number}";
  for (const [k, v] of Object.entries(params ?? {})) if (typeof v !== "number") return `params.${k.slice(0, 30)} is a number`;
  const spec = deskSpec((params ?? {}) as Record<string, number>);
  if (typeof spec === "string") return spec;
  // the rest is read as a request's is, its words and its defaults
  const ask = askOf({ ...rest, strategy: "hold" });
  if (typeof ask === "string") return ask;
  if (ask.refs.some((r) => r.cls !== "perp")) return "the desk trades perpetuals here: perp:COIN markets only";
  if (!DESK_INTERVALS.includes(ask.interval)) return "the desk steps over 1h or 4h bars: a day's bar is longer than its longest cycle";
  const { benchmark: _benchmark, ...run } = ask;
  return { ...run, spec, feeBps: PAPER_FEE_BPS };
}

/** WHAT CAN BE ASKED, for a form (the page's Backtest) and an agent alike: the strategies with each number's default, bounds and words, the
 * bar sizes, the kinds of market and where each is read from, the defaults a request leaves to the lab, the holdout's default days */
export function labCatalog(): Record<string, unknown> {
  return {
    strategies: STRATEGIES,
    intervals: ASK_INTERVALS,
    markets: {
      most: 12,
      kinds: [
        { cls: "perp", example: "perp:BTC", words: "Hyperliquid's perpetuals and their hourly funding: about 208 days of 1h bars, 833 of 4h, daily since 2023" },
        { cls: "spot", example: "spot:ETH", words: "Coinbase's coins against the dollar" },
        { cls: "stock", example: "stock:SPY", words: "US stocks in daily bars, split-adjusted, no dividends" },
      ],
    },
    defaults: { strategy: "tsmom", markets: "perp:BTC", interval: "1h", cash: 10_000, feeBps: PAPER_FEE_BPS, sharesFeeBps: 0, costs: DEFAULT_COSTS, windowDays: WINDOW_DEFAULT_DAYS, benchmark: true },
    holdoutDays: HOLDOUT_DEFAULT_DAYS,
  };
}

/** a curve of at most `most` points, [t, usd] each, its first and last kept: enough to draw, small enough to send */
export function thinCurve(equity: ReadonlyArray<{ t: number; usd: number }>, most = 400): Array<[number, number]> {
  if (equity.length <= most) return equity.map((p) => [p.t, p.usd]);
  const out: Array<[number, number]> = [];
  const every = (equity.length - 1) / (most - 1);
  for (let i = 0; i < most; i++) {
    const p = equity[Math.round(i * every)]!;
    out.push([p.t, p.usd]);
  }
  return out;
}

/** a run as an answer that fits a tool's reply: the figures, the judgement and the notes, with the trades and the curve left in the kept run
 * (GET /api/account/backtest?id=) — or, with `curve`, the curves beside them, thinned (the owner's look at the holdout: what came of it is
 * answered to their signature only, never read back unsigned) */
export function outcomeSummary(out: LabOutcome, o: { curve?: boolean } = {}): Record<string, unknown> {
  const r = out.run;
  return {
    ...(o.curve ? { curve: thinCurve(r.equity), ...(out.benchmark ? { benchmarkCurve: thinCurve(out.benchmark.equity) } : {}) } : {}),
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
    ...(out.baseline ? { baseline: out.baseline } : {}),
    trial: out.trial.seq,
    ledger: out.ledger,
    kept: out.saved !== undefined,
    notes: [...out.notes, ...r.notes],
  };
}

// ---- what is kept ----

/** the ledger and the holdout as they stand — the holdout's default written down if nothing has asked before — and the latest runs and
 * exit sweeps (the ledger's rows: what was tried, by whom, with its figures; a sweep's every rule left in its row, read with its run),
 * newest first. The distinct strategies tried count every rule screened */
export function labList(home: string, now: number, limit = 50, o: { owner?: boolean } = {}): { holdout: Holdout | Refusal; ledger: { rows: number; intact: boolean; brokenAt?: number | undefined; why?: string | undefined; trials: number; distinct: number; looks: number; screens: number }; runs: Array<TrialRow | LookRow | ScreenLine> } {
  const ledger = readTrials(home);
  const trials = ledger.rows.filter(isTrial);
  return {
    holdout: readHoldout(home, now),
    ledger: { rows: ledger.rows.length, intact: ledger.intact, ...(ledger.intact ? {} : { brokenAt: ledger.brokenAt, why: ledger.why }), trials: trials.length, distinct: trainingTrials(ledger.rows).length + screenedRules(ledger.rows), looks: trials.filter((t) => t.window === "holdout").length, screens: ledger.rows.filter(isScreen).length },
    runs: ledger.rows
      .filter((r): r is TrialRow | ScreenRow => isTrial(r) || isScreen(r))
      .slice(-Math.max(1, Math.min(500, limit)))
      .reverse()
      .map((t) => (isScreen(t) ? lineOf(t) : o.owner || t.window !== "holdout" ? t : lookOf(t))),
  };
}

/** an exit sweep as the ledger's list shows it: its every rule's figures left in its row */
export type ScreenLine = Omit<ScreenRow, "means" | "sharpes">;
const lineOf = ({ means: _means, sharpes: _sharpes, ...line }: ScreenRow): ScreenLine => line;

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
  // its exit sweeps, newest first, every rule's figures with them
  const screens = ledger.rows.filter((r): r is ScreenRow => isScreen(r) && r.run === id).slice(-SCREENS_READ).reverse();
  return { ...kept, ...(trial ? { trial, ...judge(home, ledger.rows, trial) } : {}), ...(screens.length ? { screens } : {}), ledger: { rows: ledger.rows.length, intact: ledger.intact } };
}
/** a kept run's exit sweeps read with it, the latest */
const SCREENS_READ = 3;

/** THE OWNER'S LOOK AT THE HOLDOUT: a training run tried again exactly — the strategy, its numbers, the markets, the bars, the money, the fee
 * and the costs — on the held-out data, from the holdout's start to now. `run` is the training run's id */
export async function labEvaluate(run: string, deps: LabDeps, by: LabWho): Promise<LabOutcome | Refusal> {
  if (!RUN_ID.test(run)) return no("E_ACCOUNT_BAD_ACTION", { message: "a run's id is like 20261029T120000-0123456789" });
  const t = readTrials(deps.home).rows.filter(isTrial).find((r) => r.run === run);
  if (!t) return no("E_ACCOUNT_BAD_ACTION", { message: `no trial ran as ${run}` });
  if (t.window !== "train") return no("E_ACCOUNT_BAD_ACTION", { message: `${run} was itself a look at the holdout: look again from the training run it tried` });
  const spec = t.strategy === "desk" ? deskSpec(t.params) : strategySpec(t.strategy, t.params);
  if (typeof spec === "string") return no("E_ACCOUNT_BAD_ACTION", { message: spec });
  const refs = parseMarkets(t.markets.join(","));
  if (typeof refs === "string") return no("E_ACCOUNT_BAD_ACTION", { message: refs });
  return labRun({ spec, refs, interval: t.interval, window: "holdout", cashUsd: t.cashUsd, feeBps: t.feeBps, ...(t.leverage !== undefined ? { leverage: t.leverage } : {}), costs: t.costs, benchmark: true, save: true, by }, deps);
}

// ---- an exit sweep ----

/** what an exit sweep is asked: the kept desk run whose entries are screened, the rules (each list's values; none named, SWEEP_GRID's), who
 * asks */
export interface ScreenAsk {
  run: string;
  grid: SweepGrid;
  by: LabWho;
  seat?: string | undefined;
}
export interface ScreenOutcome {
  sweep: Sweep;
  row: ScreenRow;
  notes: string[];
  ledger: { rows: number; intact: boolean; brokenAt?: number | undefined; why?: string | undefined };
}
/** the most rules a sweep tries, and the most values a list of its grid holds */
export const SWEEP_RULES_MOST = 4_000;
export const SWEEP_VALUES_MOST = 20;

/** AN EXIT SWEEP over a kept desk run's entries (backtest/screen.ts sweepOf): every rule of the grid screened over the run's own bars at its
 * fee and spread, the best judged for luck twice — deflated by these rules and every strategy tried before the holdout, and the sweep tried
 * again on random entries — and written in the ledger with every rule's figures, each rule counted from then on as a strategy tried. On
 * training data only: exits picked on a look at the held-out data would hold nothing out. A screen, not a run: what a rule would have made
 * is a run of the desk with it, since the desk's next leads come in as its last ones close */
export async function labScreen(ask: ScreenAsk, deps: LabDeps): Promise<ScreenOutcome | Refusal> {
  if (!RUN_ID.test(ask.run)) return no("E_ACCOUNT_BAD_ACTION", { message: "a run's id is like 20261029T120000-0123456789" });
  const holdout = readHoldout(deps.home, deps.clock());
  if (isRefusal(holdout)) return holdout;
  const before = readTrials(deps.home);
  const t = before.rows.filter(isTrial).find((r) => r.run === ask.run);
  if (!t) return no("E_ACCOUNT_BAD_ACTION", { message: `no trial ran as ${ask.run}` });
  if (t.window !== "train") return no("E_ACCOUNT_OWNER_ONLY", { message: `${ask.run} is a look at the held-out data: exits picked on it would hold nothing out — sweep the training run it tried` });
  if (t.strategy !== "desk") return no("E_ACCOUNT_BAD_ACTION", { message: `an exit sweep tries a desk run's leads with other take-profits, stops and time limits: ${t.strategy} closes its trades by its own signal` });
  const f = runFile(deps.home, ask.run);
  if (!existsSync(f)) return no("E_ACCOUNT_BAD_ACTION", { message: `run ${ask.run} is not kept: a sweep reads a kept run's round trips` });
  let run: BacktestRun | undefined;
  try {
    run = (JSON.parse(readFileSync(f, "utf8")) as { run?: BacktestRun }).run;
  } catch {
    return no("E_ACCOUNT_BAD_ACTION", { message: `run ${ask.run} does not read` });
  }
  const trips = run?.trips ?? [];
  if (trips.length < FEW) return no("E_ACCOUNT_BAD_ACTION", { message: `an exit sweep needs ${FEW} round trips at least: run ${ask.run} closed ${trips.length}` });
  const rules = ask.grid.tpPct.length * ask.grid.slPct.length * ask.grid.hours.length;
  if (rules > SWEEP_RULES_MOST) return no("E_ACCOUNT_BAD_ACTION", { message: `${rules.toLocaleString("en-US")} rules: a sweep tries ${SWEEP_RULES_MOST.toLocaleString("en-US")} at most` });
  if (rules * trips.length > SWEEP_WORK_MOST) return no("E_ACCOUNT_BAD_ACTION", { message: `${rules.toLocaleString("en-US")} rules over ${trips.length.toLocaleString("en-US")} round trips is ${(rules * trips.length).toLocaleString("en-US")} trades to screen, ${SWEEP_WORK_MOST.toLocaleString("en-US")} at most: fewer values` });
  const refs = parseMarkets(t.markets.join(","));
  if (typeof refs === "string") return no("E_ACCOUNT_BAD_ACTION", { message: refs });
  const from = Date.parse(t.from);
  const to = Date.parse(t.to);
  const loaded = await loadHistory({ refs, interval: t.interval, from, to, cache: deps.cache, sources: deps.sources, clock: deps.clock, say: deps.say });
  if (isRefusal(loaded)) return loaded;
  const tapes = loaded.markets.map((m) => tapeOf(m, from, to));
  const trades = tradesOf(trips, tapes);
  if (trades.length < FEW) return no("E_ACCOUNT_BAD_ACTION", { message: `the bars hold ${trades.length} of run ${ask.run}'s round trips: an exit sweep needs ${FEW} at least` });
  // the same run, rules and costs, the same sweep: its rules counted once however often it is screened
  const key = sha256(canonical({ of: t.key, grid: ask.grid, feeBps: t.feeBps, costs: t.costs })).slice(0, 16);
  const others = trainingTrials(before.rows).length + screenedRules(before.rows.filter((r) => !(isScreen(r) && r.key === key)));
  const sweep = sweepOf({ tapes, trades, grid: ask.grid, costs: screenCosts(t.feeBps, t.costs.halfSpreadBps), from, to, cashUsd: t.cashUsd, seed: key, others });
  if (!sweep) return no("E_ACCOUNT_BAD_ACTION", { message: `run ${ask.run} has no round trip on its bars to sweep` });
  const notes = [...loaded.notes];
  if (trades.length < trips.length) notes.push(`${trips.length - trades.length} of the run's round trips are not on its bars and were left out`);
  const entry: ScreenEntry = {
    kind: "screen",
    by: ask.by,
    ...(ask.seat ? { seat: ask.seat } : {}),
    run: ask.run,
    window: "train",
    key,
    strategy: t.strategy,
    params: t.params,
    markets: t.markets,
    interval: t.interval,
    from: t.from,
    to: t.to,
    cashUsd: t.cashUsd,
    feeBps: t.feeBps,
    costs: t.costs,
    trades: sweep.trades,
    grid: sweep.grid,
    rules: sweep.rules,
    means: sweep.means,
    sharpes: sweep.sharpes,
    best: sweep.best,
    ...(sweep.own ? { own: sweep.own } : {}),
    dsr: sweep.deflated.dsr,
    sr0: sweep.deflated.sr0,
    trials: sweep.deflated.trials,
    chance: sweep.chance,
    words: sweep.words,
  };
  const row = appendTrial(deps.home, entry, deps.clock()) as ScreenRow;
  const ledger = readTrials(deps.home);
  return { sweep, row, notes, ledger: { rows: ledger.rows.length, intact: ledger.intact, ...(ledger.intact ? {} : { brokenAt: ledger.brokenAt, why: ledger.why }) } };
}

const SCREEN_FIELDS = ["run", "tpPct", "slPct", "hours", "seat"] as const;

/** WHAT AN EXIT SWEEP IS ASKED (POST /api/account/backtest/screen, portfolio_backtest_screen), read strictly: the kept desk run, and each
 * list of the grid within the desk's own bounds for that number (desk-params.ts) — a list left out, the default grid's (SWEEP_GRID). `seat`
 * names who asks — said, not proven */
export function screenAskOf(body: Record<string, unknown>): Omit<ScreenAsk, "by"> | string {
  for (const k of Object.keys(body)) if (!(SCREEN_FIELDS as readonly string[]).includes(k)) return `an exit sweep is asked with ${SCREEN_FIELDS.join(", ")} — not "${k.slice(0, 30)}"`;
  if (typeof body.run !== "string" || !RUN_ID.test(body.run.trim())) return "run is a kept desk run's id, like 20261029T120000-0123456789";
  const list = (k: keyof SweepGrid, bounds: { min: number; max: number }): number[] | string => {
    const v = body[k];
    if (v === undefined) return [...SWEEP_GRID[k]];
    if (!Array.isArray(v) || !v.length || v.length > SWEEP_VALUES_MOST || !v.every((x) => typeof x === "number" && Number.isFinite(x) && x >= bounds.min && x <= bounds.max)) return `${k} is a list of 1 to ${SWEEP_VALUES_MOST} numbers, each ${bounds.min} to ${bounds.max}`;
    return [...new Set(v as number[])].sort((a, b) => a - b);
  };
  const tpPct = list("tpPct", DESK_PARAMS.tpPct);
  const slPct = list("slPct", DESK_PARAMS.slPct);
  const hours = list("hours", DESK_PARAMS.maxHours);
  for (const x of [tpPct, slPct, hours]) if (typeof x === "string") return x;
  const seat = body.seat;
  if (seat !== undefined && !(typeof seat === "string" && /^[\w.:@-]{1,80}$/.test(seat))) return "seat names who asks: up to 80 letters, digits and . : @ _ -";
  return { run: body.run.trim(), grid: { tpPct: tpPct as number[], slPct: slPct as number[], hours: hours as number[] }, ...(typeof seat === "string" ? { seat } : {}) };
}

/** a sweep as an answer: what was screened, its best rules, how its best is judged, its words — and with `grid`, every rule's net a trade and
 * Sharpe a year in the grid's order (the page draws them; an agent's reply leaves them in the ledger's row) */
export function screenSummary(out: ScreenOutcome, o: { grid?: boolean } = {}): Record<string, unknown> {
  const s = out.sweep;
  const r = out.row;
  return {
    run: r.run,
    strategy: r.strategy,
    markets: r.markets,
    interval: r.interval,
    from: r.from,
    to: r.to,
    trades: s.trades,
    rules: s.rules,
    grid: s.grid,
    ...(o.grid ? { means: s.means, sharpes: s.sharpes } : {}),
    best: s.best,
    top: s.top,
    ...(s.own ? { own: s.own } : {}),
    deflated: s.deflated,
    chance: s.chance,
    words: s.words,
    trial: r.seq,
    ledger: out.ledger,
    notes: out.notes,
  };
}
