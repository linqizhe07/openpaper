/** THE SCREEN: many trades judged at once over recorded bars, fast — to ask what random entries would have made beside a run's own, and what
 * other exits would have made of its entries. A run through the paper account (backtest/engine.ts, backtest/desk.ts) takes a second or ten;
 * "were these entries better than chance?" asks a thousand of them, and "would a wider stop have saved these trades?" hundreds. The screen
 * answers both from the bars alone, held in typed arrays, by the paper account's own rules for a bar (live/paper.ts catchUp). A trade
 *   ENTERS at the open of its bar, at the ask for a long and the bid for a short (the cost model's half spread, backtest/source.ts), paying
 *     the fee on what it entered at
 *   is CLOSED by the first of
 *     its stop, where a bar reached it: at the stop, or at the bar's open where the bar opened past it — taken before the take-profit within
 *       one bar, since which came first the bar does not say
 *     its take-profit, where a bar reached it: at its price
 *     its time limit: at the open of the bar after its last, at the bid for a long and the ask for a short
 *     the end of the bars: at the last close, as the window ends
 *   paying the fee on what it closed at, and a perpetual's funding for each bar it was held through: the bar's recorded rates on its close,
 *     before the bar's exits are judged (the paper account's own order)
 * It leaves out the book's deeper levels (a size past the first fills there whole), a perpetual's liquidation (a stop past it is taken at the
 * stop) and the price step a bracket is rounded to. So a screen SCREENS: it says which questions are worth a run, never what a run made —
 * and a baseline says how far the screen was from the paper account on the run's own trades, every time.
 *
 *   THE BASELINE (baselineOf): a run's entries beside random ones. Each of `monkeys` tries takes as many trades as the run did, on the same
 *     markets, on the same sides, with the same exits — a desk lead's take-profit, stop and time limit; a strategy's trade held as many bars
 *     as it was — each entered at a bar drawn at random from the run's window. Where the run's own entries, screened the same way, rank among
 *     the tries says whether their timing beat chance. The draws come from a seed (the run's id): the same run, the same tries
 *   THE SWEEP (sweepOf): a desk run's entries closed by every exit rule of a grid — take-profit × stop × time limit — each rule's net a
 *     trade, how often it won, and its Sharpe a year: its trades at the run's own sizes, each booked on the day it closed, over the run's
 *     money, as a run's equity is read. The best rule is judged twice for luck: its Sharpe DEFLATED by the rules tried (stats.ts dsr), and
 *     the whole sweep tried again on random entries — as many, on the same markets and sides — to see how often the best rule of a try
 *     does as well: where it often does, what the rule found is the window's prices, not the entries. The lab writes a sweep in the trials
 *     ledger with every rule's Sharpe, each counted as a strategy tried (backtest/lab.ts)
 * Nothing else here is random: the same inputs give the same figures. */
import { createHash } from "node:crypto";
import { FEW } from "../account/debrief.ts";
import type { TradeLead } from "../account/journal.ts";
import { INTERVAL_MS } from "../live/trade.ts";
import type { ClosedTrip } from "../live/trips.ts";
import type { BacktestMarket } from "./source.ts";
import { expectedMaxSharpe, moments, psr } from "./stats.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** a market's bars as the screen reads them: a typed array a field, oldest first */
export interface Tape {
  symbol: string;
  step: number;
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  /** the funding rates a perpetual paid while each bar was judged, summed: the hours after its start, up to its end (0 for a coin or a share) */
  fund: Float64Array;
}

/** the index of the last of `t` at or before `at`, or -1 */
function indexAt(t: Float64Array, at: number): number {
  let lo = 0;
  let hi = t.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** a market's bars that start from `from` and before `to`, as a tape */
export function tapeOf(m: BacktestMarket, from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY): Tape {
  const bars = m.bars.filter((b) => b.t >= from && b.t < to);
  const n = bars.length;
  const step = INTERVAL_MS[m.interval];
  const tape: Tape = { symbol: m.symbol, step, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), fund: new Float64Array(n) };
  bars.forEach((b, i) => {
    tape.t[i] = b.t;
    tape.o[i] = b.o;
    tape.h[i] = b.h;
    tape.l[i] = b.l;
    tape.c[i] = b.c;
  });
  if (m.kind === "perp")
    for (const f of m.funding ?? []) {
      // paid at `at`: by the bar judged then, the one that runs to `at` or past it (its start before `at`, its end at or after it)
      const i = indexAt(tape.t, f.at - 1);
      if (i >= 0 && f.at <= tape.t[i]! + step) tape.fund[i] = tape.fund[i]! + f.rate;
    }
  return tape;
}

/** how a trade is closed: a take-profit and a stop, as fractions of its entry (Infinity: none), and the most bars it is held */
export interface ExitRule {
  tp: number;
  sl: number;
  bars: number;
}
/** what a trade pays, as fractions: half the spread, and the fee on each side */
export interface ScreenCosts {
  half: number;
  fee: number;
}
export const screenCosts = (feeBps: number, halfSpreadBps: number): ScreenCosts => ({ half: halfSpreadBps / 10_000, fee: feeBps / 10_000 });
/** a time limit in hours as the bars a clock stepping from bar to bar holds a trade: to the first step at or past it (the desk's own rule) */
export const barsOf = (hours: number, step: number): number => Math.max(1, Math.ceil((hours * HOUR_MS) / step - 1e-9));

/** the bar the trade judged last was closed in, on its tape: read right after screenTrade, so a sweep books each trade on the day it closed
 * without making an object a trade */
let closedIn = 0;

/** ONE TRADE SCREENED (see the top of this file): entered at the open of bar `i` on `side` (1 a long, −1 a short), closed by `rule` — its
 * net over what it entered at, a fraction */
export function screenTrade(tape: Tape, i: number, side: number, rule: ExitRule, costs: ScreenCosts): number {
  const { o, h, l, c, fund } = tape;
  const n = o.length;
  const entry = o[i]! * (1 + side * costs.half);
  const take = entry * (1 + side * rule.tp);
  const stop = entry * (1 - side * rule.sl);
  const last = Math.min(n - 1, i + rule.bars - 1);
  let funding = 0;
  let exit = Number.NaN;
  for (let k = i; k <= last; k++) {
    funding += fund[k]! * c[k]!;
    closedIn = k;
    if (side > 0) {
      if (l[k]! <= stop) {
        exit = Math.min(stop, o[k]!);
        break;
      }
      if (h[k]! >= take) {
        exit = take;
        break;
      }
    } else {
      if (h[k]! >= stop) {
        exit = Math.max(stop, o[k]!);
        break;
      }
      if (l[k]! <= take) {
        exit = take;
        break;
      }
    }
  }
  // the time limit: the open of the bar after the last, at the bid for a long and the ask for a short — past the bars, their last close
  if (Number.isNaN(exit)) {
    closedIn = Math.min(n - 1, i + rule.bars);
    exit = (i + rule.bars < n ? o[i + rule.bars]! : c[n - 1]!) * (1 - side * costs.half);
  }
  return (side * (exit - entry) - costs.fee * (entry + exit) - side * funding) / entry;
}

/** a trade the screen judges: on tape `tape`, entered at bar `bar` on `side`, closed by `rule` — for a run's own, what it entered at in
 * dollars, the desk lead's plan it was closed by where it had one, and what the paper account made of it (its trip's net over its entry, a
 * fraction) */
export interface ScreenedTrade {
  tape: number;
  bar: number;
  side: 1 | -1;
  rule: ExitRule;
  usd?: number | undefined;
  plan?: { tpPct: number; slPct: number; maxHours: number } | undefined;
  paper?: number | undefined;
}

/** A RUN'S ROUND TRIPS as the screen takes them: on its tapes, at the bar each was entered in, closed by a desk lead's plan (its take-profit,
 * its stop, its time limit in whole bars of the desk's clock) or else held as many bars as it was. A trip whose market or entry the tapes
 * do not hold is left out */
export function tradesOf(trips: ReadonlyArray<ClosedTrip & { lead?: TradeLead | undefined }>, tapes: readonly Tape[]): ScreenedTrade[] {
  const by = new Map(tapes.map((t, k) => [t.symbol, k] as const));
  const out: ScreenedTrade[] = [];
  for (const trip of trips) {
    const k = by.get(trip.symbol);
    if (k === undefined) continue;
    const tape = tapes[k]!;
    const opened = Date.parse(trip.openedAt);
    const bar = indexAt(tape.t, opened);
    if (bar < 0 || !(opened < tape.t[bar]! + tape.step)) continue;
    const p = trip.lead;
    const plan = p?.tpPct !== undefined && p.slPct !== undefined && p.maxHours !== undefined ? { tpPct: p.tpPct, slPct: p.slPct, maxHours: p.maxHours } : undefined;
    const rule: ExitRule = plan ? { tp: plan.tpPct / 100, sl: plan.slPct / 100, bars: barsOf(plan.maxHours, tape.step) } : { tp: Number.POSITIVE_INFINITY, sl: Number.POSITIVE_INFINITY, bars: Math.max(1, Math.round((Date.parse(trip.closedAt) - opened) / tape.step)) };
    out.push({ tape: k, bar, side: trip.side === "long" ? 1 : -1, rule, usd: trip.entryUsd, ...(plan ? { plan } : {}), paper: trip.returnPct / 100 });
  }
  return out;
}

/** a stream of draws in [0, 1) from a seed: mulberry32 started from the seed's hash — the same seed, the same draws */
export function seeded(seed: string): () => number {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** a bar drawn at random from a tape: one from which `bars` bars later still lies on it, where the tape is that long */
function drawBar(tape: Tape, bars: number, rand: () => number): number {
  const last = tape.o.length - 1 - bars;
  return Math.floor(rand() * ((last >= 0 ? last : tape.o.length - 1) + 1));
}

const pct = (x: number, places = 3): string => `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(places)}%`;
const share = (x: number): string => `${Math.round(x * 100)}%`;
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const round = (x: number, places: number): number => Number(x.toFixed(places));

// ---- the baseline ----

export interface Baseline {
  trades: number;
  monkeys: number;
  /** the run's own entries, screened as the tries are: their net a trade, % */
  ownPct: number;
  /** what the paper account made of the same trades (their trips), % a trade, and how far the screen was from it, trade by trade (the mean
   * of the gaps, in points of a percent): the screen's check on itself */
  paperPct: number;
  gapPct: number;
  /** the tries' nets a trade, %: the middle one, and nine tries in ten between low and high */
  medianPct: number;
  lowPct: number;
  highPct: number;
  /** the share of tries the run's own entries did better than, a tie counted half */
  rank: number;
  /** how often chance did as well — or, where they did worse than chance, as badly: (1 + such tries) / (1 + the tries) */
  p: number;
  verdict: "better" | "worse" | "chance" | "few";
  words: string;
  /** the tries' nets in twenty bins, for a picture: where the first starts and how wide each is, % */
  bins: { fromPct: number; widthPct: number; counts: number[] };
}
/** the tries a baseline takes, and the most trades it judges in all (tries × trades): past it, fewer tries */
export const BASELINE_MONKEYS = 1_000;
export const BASELINE_WORK_MOST = 2_000_000;
const BINS = 20;

/** THE BASELINE (see the top of this file): the run's own entries — `trades`, on `tapes` cut to the run's window — beside `monkeys` tries of
 * random ones, drawn from `seed`. None without trades */
export function baselineOf(o: { tapes: readonly Tape[]; trades: readonly ScreenedTrade[]; costs: ScreenCosts; seed: string; monkeys?: number | undefined }): Baseline | undefined {
  const n = o.trades.length;
  if (!n) return undefined;
  const tries = Math.max(1, Math.min(o.monkeys ?? BASELINE_MONKEYS, Math.floor(BASELINE_WORK_MOST / n)));
  let own = 0;
  let paper = 0;
  let gap = 0;
  let checked = 0;
  for (const x of o.trades) {
    const r = screenTrade(o.tapes[x.tape]!, x.bar, x.side, x.rule, o.costs);
    own += r;
    if (x.paper !== undefined) {
      paper += x.paper;
      gap += Math.abs(r - x.paper);
      checked++;
    }
  }
  own /= n;
  const rand = seeded(o.seed);
  const means = new Float64Array(tries);
  for (let m = 0; m < tries; m++) {
    let sum = 0;
    for (const x of o.trades) {
      const tape = o.tapes[x.tape]!;
      sum += screenTrade(tape, drawBar(tape, x.rule.bars, rand), x.side, x.rule, o.costs);
    }
    means[m] = sum / n;
  }
  const sorted = Array.from(means).sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(tries - 1, Math.max(0, Math.round(q * (tries - 1))))]!;
  const below = sorted.filter((x) => x < own).length;
  const above = sorted.filter((x) => x > own).length;
  const rank = (below + (tries - below - above) / 2) / tries;
  const pBetter = (1 + tries - below) / (1 + tries);
  const pWorse = (1 + tries - above) / (1 + tries);
  const verdict: Baseline["verdict"] = n < FEW ? "few" : pBetter <= 0.05 ? "better" : pWorse <= 0.05 ? "worse" : "chance";
  const p = verdict === "worse" ? pWorse : pBetter;
  const lo = Math.min(sorted[0]!, own);
  const hi = Math.max(sorted[tries - 1]!, own);
  const width = hi > lo ? (hi - lo) / BINS : 1e-6;
  const counts = new Array<number>(BINS).fill(0);
  for (const x of sorted) counts[Math.min(BINS - 1, Math.floor((x - lo) / width))]!++;
  const [ownPct, medianPct, lowPct, highPct] = [own, at(0.5), at(0.05), at(0.95)].map((x) => x * 100) as [number, number, number, number];
  const head = `This run's ${n} entries made ${pct(ownPct)} a trade, screened; random entries on the same markets and sides, with the same exits, made ${pct(medianPct)} (the middle of ${tries.toLocaleString("en-US")} tries; nine in ten between ${pct(lowPct)} and ${pct(highPct)}).`;
  const said = {
    better: ` Its entries did better than ${share(rank)} of the tries: their timing beat chance (p ${p.toFixed(3)}).`,
    worse: ` Its entries did better than only ${share(rank)} of the tries: their timing did worse than chance (p ${p.toFixed(3)}) — they came at the wrong moments.`,
    chance: ` Its entries did better than ${share(rank)} of the tries: no better than chance.`,
    few: ` ${n} trade${n === 1 ? " is" : "s are"} too few to tell timing from chance (${FEW} at least).`,
  }[verdict];
  const off = checked ? (gap / checked) * 100 : 0;
  const check = checked ? ` The screen was ${off < 0.001 ? "less than 0.001" : off.toFixed(3)} points of a percent from the paper account's own figure for each of these trades, on average.` : "";
  return {
    trades: n,
    monkeys: tries,
    ownPct: round(ownPct, 4),
    paperPct: round(checked ? (paper / checked) * 100 : Number.NaN, 4),
    gapPct: round(checked ? (gap / checked) * 100 : Number.NaN, 4),
    medianPct: round(medianPct, 4),
    lowPct: round(lowPct, 4),
    highPct: round(highPct, 4),
    rank: round(rank, 4),
    p: round(p, 4),
    verdict,
    words: head + said + check,
    bins: { fromPct: round(lo * 100, 6), widthPct: round(width * 100, 6), counts },
  };
}

// ---- the sweep ----

export interface SweepGrid {
  tpPct: number[];
  slPct: number[];
  hours: number[];
}
/** the rules a sweep tries when none are named: eight take-profits × eight stops × six time limits */
export const SWEEP_GRID: Readonly<SweepGrid> = { tpPct: [0.25, 0.5, 1, 1.5, 2, 3, 5, 8], slPct: [0.25, 0.5, 1, 1.5, 2, 3, 5, 8], hours: [1, 4, 12, 24, 72, 168] };
/** the most trades a sweep judges (rules × entries); its tries on random entries judge at most CHANCE_WORK_MOST in all, in 10 to 100 tries */
export const SWEEP_WORK_MOST = 3_000_000;
const CHANCE_WORK_MOST = 20_000_000;
const CHANCE_TRIES: readonly [number, number] = [10, 100];
const YEAR_ROOT = Math.sqrt(365);

export interface SweepRule {
  tpPct: number;
  slPct: number;
  hours: number;
  /** its net a trade and how often it won, % */
  meanPct: number;
  winRatePct: number;
  /** its Sharpe a year: its trades at the run's own sizes, each booked on the day it closed, over the run's money */
  sharpe: number;
}
export interface Sweep {
  trades: number;
  grid: SweepGrid;
  rules: number;
  /** every rule's net a trade (%) and Sharpe a year, in the grid's order: the time limits slowest, then the stops, then the take-profits */
  means: number[];
  sharpes: number[];
  best: SweepRule;
  /** the ten best by Sharpe, the best first */
  top: SweepRule[];
  /** the run's own exits, where one plan closed every trade: screened, and where they rank by Sharpe among the rules (1: the best) */
  own?: (SweepRule & { rank: number }) | undefined;
  /** the best rule's Sharpe deflated by every rule tried: the probability it is real, the Sharpe a year the best of that many would show by
   * chance alone, the rules counted */
  deflated: { dsr: number; sr0: number; trials: number };
  /** the sweep tried again on random entries, `tries` times: each try's best Sharpe a year (the middle try's, and nine in ten at most
   * `highSharpe`), what the best rule here made on them (% a trade, the middle try), and how often a try's best did as well as the best
   * here: (1 + those tries) / (1 + the tries) */
  chance: { tries: number; medianSharpe: number; highSharpe: number; sameRulePct: number; p: number };
  words: string;
}

interface SweepIn {
  tapes: readonly Tape[];
  trades: readonly ScreenedTrade[];
  costs: ScreenCosts;
  /** the window's start, and the run's money its trades' results are read over */
  from: number;
  cashUsd: number;
}

/** one rule over every trade — entered at its own bar, or at `at`'s — its nets summed and its wins, and its result day by day as a share of
 * the money, written into `days` */
function over(o: SweepIn, rule: ExitRule, days: Float64Array, at?: Int32Array): { sum: number; wins: number } {
  days.fill(0);
  let sum = 0;
  let wins = 0;
  for (let k = 0; k < o.trades.length; k++) {
    const x = o.trades[k]!;
    const tape = o.tapes[x.tape]!;
    const r = screenTrade(tape, at ? at[k]! : x.bar, x.side, rule, o.costs);
    sum += r;
    if (r > 0) wins++;
    const d = Math.min(days.length - 1, Math.max(0, Math.floor((tape.t[closedIn]! - o.from) / DAY_MS)));
    days[d] = days[d]! + (r * (x.usd ?? 0)) / o.cashUsd;
  }
  return { sum, wins };
}

/** a result day by day, its Sharpe a day: none for one that does not move */
function dailySharpe(days: Float64Array): number {
  const n = days.length;
  if (n < 2) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += days[i]!;
  const mean = s / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (days[i]! - mean) ** 2;
  const sd = Math.sqrt(v / (n - 1));
  return sd > 1e-12 ? mean / sd : 0;
}

/** THE SWEEP (see the top of this file): a run's own `trades`, over `tapes` cut to its window from `from` to `to`, at their sizes over
 * `cashUsd`, closed by every rule of `grid` — then tried again on random entries drawn from `seed`. `others`: the strategies tried before
 * it, which its best rule is deflated by too. None without trades */
export function sweepOf(o: SweepIn & { grid: SweepGrid; to: number; seed: string; tries?: number | undefined; others?: number | undefined }): Sweep | undefined {
  const n = o.trades.length;
  if (!n) return undefined;
  const step = o.tapes[o.trades[0]!.tape]!.step;
  const days = new Float64Array(Math.max(1, Math.ceil((o.to - o.from) / DAY_MS)));
  const named: Array<Pick<SweepRule, "tpPct" | "slPct" | "hours">> = [];
  const exits: ExitRule[] = [];
  for (const hours of o.grid.hours)
    for (const slPct of o.grid.slPct)
      for (const tpPct of o.grid.tpPct) {
        named.push({ tpPct, slPct, hours });
        exits.push({ tp: tpPct / 100, sl: slPct / 100, bars: barsOf(hours, step) });
      }
  const daily = new Float64Array(exits.length);
  const rules: SweepRule[] = exits.map((rule, k) => {
    const { sum, wins } = over(o, rule, days);
    daily[k] = dailySharpe(days);
    return { ...named[k]!, meanPct: round((sum / n) * 100, 4), winRatePct: round((wins / n) * 100, 2), sharpe: round(daily[k]! * YEAR_ROOT, 4) };
  });
  let b = 0;
  for (let k = 1; k < rules.length; k++) if (daily[k]! > daily[b]!) b = k;
  const best = rules[b]!;
  // THE BEST RULE DEFLATED, against the Sharpe the best of every rule tried — and of every strategy tried before them, `others` — would
  // show over these days had none an edge: their Sharpes a day varying as chance alone makes a zero Sharpe vary over that many days. Not
  // as much as the rules' own Sharpes vary: a tight rule pays its costs again and again and loses steadily, which is no luck
  over(o, exits[b]!, days);
  const shape = moments(Array.from(days));
  const trials = exits.length + (o.others ?? 0);
  const sr0 = expectedMaxSharpe(trials, 1 / Math.max(1, days.length - 1));
  const d = { dsr: psr(daily[b]!, sr0, days.length, shape.skew, shape.kurt), sr0, trials };
  // the run's own exits, where one plan closed every trade
  const plan = o.trades[0]!.plan;
  let own: (SweepRule & { rank: number }) | undefined;
  if (plan && o.trades.every((x) => x.plan?.tpPct === plan.tpPct && x.plan.slPct === plan.slPct && x.plan.maxHours === plan.maxHours)) {
    const { sum, wins } = over(o, { tp: plan.tpPct / 100, sl: plan.slPct / 100, bars: barsOf(plan.maxHours, step) }, days);
    const s = dailySharpe(days);
    own = { tpPct: plan.tpPct, slPct: plan.slPct, hours: plan.maxHours, meanPct: round((sum / n) * 100, 4), winRatePct: round((wins / n) * 100, 2), sharpe: round(s * YEAR_ROOT, 4), rank: 1 + Array.from(daily).filter((x) => x > s).length };
  }
  // the sweep again on random entries: each try as many trades, on the same markets and sides, each at a bar drawn at random
  const tries = Math.max(CHANCE_TRIES[0], Math.min(o.tries ?? CHANCE_TRIES[1], Math.floor(CHANCE_WORK_MOST / (exits.length * n))));
  const rand = seeded(`${o.seed}|sweep`);
  const at = new Int32Array(n);
  const bests = new Float64Array(tries);
  const same = new Float64Array(tries);
  for (let t = 0; t < tries; t++) {
    for (let k = 0; k < n; k++) {
      const x = o.trades[k]!;
      at[k] = drawBar(o.tapes[x.tape]!, x.rule.bars, rand);
    }
    let top = Number.NEGATIVE_INFINITY;
    for (const rule of exits) {
      over(o, rule, days, at);
      top = Math.max(top, dailySharpe(days));
    }
    bests[t] = top;
    same[t] = over(o, exits[b]!, days, at).sum / n;
  }
  const byBest = Array.from(bests).sort((x, y) => x - y);
  const bySame = Array.from(same).sort((x, y) => x - y);
  const q = (xs: readonly number[], p: number): number => xs[Math.round(p * (xs.length - 1))]!;
  const asGood = byBest.filter((x) => x >= daily[b]!).length;
  const chance = { tries, medianSharpe: round(q(byBest, 0.5) * YEAR_ROOT, 4), highSharpe: round(q(byBest, 0.9) * YEAR_ROOT, 4), sameRulePct: round(q(bySame, 0.5) * 100, 4), p: round((1 + asGood) / (1 + tries), 4) };
  const rule = (r: Pick<SweepRule, "tpPct" | "slPct" | "hours">): string => `a take-profit at ${r.tpPct}%, a stop at ${r.slPct}%, ${r.hours} h at most`;
  const mine = own ? `; the run's own exits (${rule(own)}) made ${pct(own.meanPct)}, ${ordinal(own.rank)} of ${rules.length} by Sharpe` : "";
  const made = best.meanPct > 0;
  const counted = o.others ? `${rules.length} rules and the ${o.others} strateg${o.others === 1 ? "y" : "ies"} before them` : `${rules.length} rules`;
  const head = made
    ? `${rules.length} exit rules screened on this run's ${n} entries. The best — ${rule(best)} — made ${pct(best.meanPct)} a trade and won ${best.winRatePct}% of them, a Sharpe of ${best.sharpe.toFixed(2)} a year${mine}.`
    : `${rules.length} exit rules screened on this run's ${n} entries, and none made money on them: the best — ${rule(best)} — made ${pct(best.meanPct)} a trade${mine}.`;
  const luck = !made
    ? ""
    : d.dsr >= 0.95
      ? ` Counting all ${counted} tried, its edge holds: a deflated Sharpe of ${share(d.dsr)}.`
      : d.dsr >= 0.5
        ? ` Counting all ${counted} tried, its edge is not proven: a deflated Sharpe of ${share(d.dsr)}.`
        : ` Counting all ${counted} tried, it is more likely luck than an edge: a deflated Sharpe of only ${share(d.dsr)}.`;
  const prices = !made
    ? ""
    : ` On random entries — as many, on the same markets and sides — this rule made ${pct(chance.sameRulePct)} a trade against ${pct(best.meanPct)} on these, and the best rule of a try did as well as this one in ${share(asGood / tries)} of ${tries} tries${chance.p <= 0.05 ? `: these entries made a difference (p ${chance.p.toFixed(2)})` : `: the window's prices made ${chance.sameRulePct >= best.meanPct / 2 ? "most" : "part"} of it, not these entries`}.`;
  return {
    trades: n,
    grid: { tpPct: [...o.grid.tpPct], slPct: [...o.grid.slPct], hours: [...o.grid.hours] },
    rules: rules.length,
    means: rules.map((r) => r.meanPct),
    sharpes: rules.map((r) => r.sharpe),
    best,
    top: rules
      .map((r, k) => [r, k] as const)
      .sort((x, y) => daily[y[1]]! - daily[x[1]]! || x[1] - y[1])
      .slice(0, 10)
      .map(([r]) => r),
    ...(own ? { own } : {}),
    deflated: { dsr: round(d.dsr, 6), sr0: round(d.sr0 * YEAR_ROOT, 4), trials: d.trials },
    chance,
    words: `${head}${luck}${prices} Screened, not run: what a rule would have made is a run of the desk with it, since its next leads come in as its last ones close.`,
  };
}
