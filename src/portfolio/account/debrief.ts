/** THE DEBRIEF: what a set of round trips (live/trips.ts) says about why they made or lost money — the journal's (account/journal.ts), at
 * one paper account or all of them, or a backtest's run. Nothing here reads a file, a clock or the network, and nothing is fitted: the same
 * trades give the same figures. Every figure says how many trades it stands on, and fewer than FEW is said so: a debrief of a handful of
 * trades is a sketch, not a finding.
 *
 *   the result      gross (what was sold less what was bought), the costs (fees and funding), net; per trade, in percent of what the
 *                   entry came to — the mean net with its standard error and 95% range, the mean gross with its t
 *   wins and losses the win rate, the average win and loss, the payoff (average win over average loss), the profit factor (all won over all
 *                   lost), and the win rate those sizes need to break even: |loss| / (win + |loss|)
 *   the plan        where the trades carried a take-profit and a stop (a bracket, the desk's plan), the win rate the plan's exits need once
 *                   the costs are paid: (stop + costs) / (take-profit + stop)
 *   can it be       THE INVERSION TEST — a run that loses is worth turning round only where it lost BEFORE its costs, beyond chance, and by
 *   turned round    more than the costs it would pay again the other way. A run whose loss is its costs pays them twice turned round
 *   excursions      how far the price went against each trade and for it while it was open (MAE, MFE): the heat the winners took, how
 *                   many losers were up as much as they finally lost before they turned
 *   R               where the stop is known, each trade's result in units of what it risked to its stop
 *   how they ended  take-profit, stop-loss, liquidated, settled, closed by an order — each with its count and result
 *   slices          the market, the side, the New York hours it was entered in, how long it was held, who traded it, the desk's
 *                   confidence — each with its count, win rate and mean net, and FEW marked
 *   calibration     for the desk's leads, the confidence Search gave against how often its leads won
 *   notes           the findings in plain sentences, numbers only from the trades */
import type { ClosedTrip, TripEnd } from "../live/trips.ts";
import type { TradeHand, TradeLead } from "./journal.ts";
import { et } from "./calendar.ts";

/** fewer trades than this, and a figure is said to stand on too few */
export const FEW = 30;
/** the most points the cumulative result and the excursions' scatter are drawn with: the latest */
const CURVE_MOST = 400;
const SCATTER_MOST = 600;

/** a round trip as the debrief reads it: the journal's line, or a backtest's trip (no venue, no hands) */
export type DebriefTrade = ClosedTrip & { lead?: TradeLead | undefined; by?: TradeHand | undefined; venue?: string | undefined; venueName?: string | undefined };

export interface DebriefSlice {
  label: string;
  n: number;
  wins: number;
  winRatePct: number;
  netUsd: number;
  /** the mean net a trade, in percent of its entry */
  meanPct: number;
  few: boolean;
}

export interface Debrief {
  trades: number;
  few: boolean;
  from?: string | undefined;
  to?: string | undefined;
  wins: number;
  losses: number;
  winRatePct: number;
  grossUsd: number;
  feesUsd: number;
  fundingUsd: number;
  costUsd: number;
  netUsd: number;
  /** per trade, in percent of what its entry came to */
  perTrade: { netPct: number; se: number; low: number; high: number; grossPct: number; grossT: number; costPct: number };
  avgWinPct: number;
  avgLossPct: number;
  payoff: number | null;
  profitFactor: number | null;
  breakEven: { winRatePct: number | null; plan?: { winRatePct: number; takeProfitPct: number; stopPct: number; costPct: number; trades: number } | undefined };
  inversion: { verdict: "few" | "costs" | "invertible" | "not-enough" | "edge" | "unproven"; words: string };
  excursions: { maePct: number; mfePct: number; winnersMaePct: number | null; losersMfePct: number | null; gaveBack: number; points: Array<[number, number, 0 | 1]> };
  /** each trade's result in units of what it risked to its stop: their mean, how many lost more than the stop allowed before costs, the
   * spread of them */
  r?: { trades: number; meanR: number; pastStop: number; bins: Array<{ label: string; n: number }> } | undefined;
  ends: Array<{ end: TripEnd; n: number; netUsd: number; winRatePct: number }>;
  slices: { market: DebriefSlice[]; side: DebriefSlice[]; hours: DebriefSlice[]; held: DebriefSlice[]; by: DebriefSlice[]; confidence: DebriefSlice[] };
  calibration: Array<{ label: string; n: number; saidPct: number; wonPct: number }>;
  streaks: { longestLosing: number; now: { won: boolean; n: number } | null };
  /** the result trade after trade: [closed at, ms; the net so far, $] */
  curve: Array<[number, number]>;
  notes: string[];
}

const r2 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0);
const r4 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 10_000) / 10_000 : 0);
const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const mean = (xs: readonly number[]): number => (xs.length ? sum(xs) / xs.length : 0);
function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};
const pctOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const won = (t: DebriefTrade): boolean => t.netUsd > 0;
const costOf = (t: DebriefTrade): number => t.feesUsd + t.fundingUsd;
const grossPct = (t: DebriefTrade): number => pctOf(t.grossUsd, t.entryUsd);
const costPct = (t: DebriefTrade): number => pctOf(costOf(t), t.entryUsd);
const usd = (n: number): string => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, places = 2): string => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(places)}%`;
const signedPct = (n: number, places = 2): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(places)}%`;

function sliceOf(label: string, ts: readonly DebriefTrade[]): DebriefSlice {
  const wins = ts.filter(won).length;
  return { label, n: ts.length, wins, winRatePct: r2(pctOf(wins, ts.length)), netUsd: r2(sum(ts.map((t) => t.netUsd))), meanPct: r4(mean(ts.map((t) => t.returnPct))), few: ts.length < FEW };
}
/** the trades cut by `keyOf`, each part a slice, in `order` where it is given (else the most trades first); a trade with no key is in none */
function slicesBy(ts: readonly DebriefTrade[], keyOf: (t: DebriefTrade) => string | undefined, order?: readonly string[]): DebriefSlice[] {
  const parts = new Map<string, DebriefTrade[]>();
  for (const t of ts) {
    const k = keyOf(t);
    if (k === undefined) continue;
    (parts.get(k) ?? parts.set(k, []).get(k)!).push(t);
  }
  const out = [...parts].map(([k, xs]) => sliceOf(k, xs));
  return order ? out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : out.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

const HOURS = ["00–04", "04–08", "08–12", "12–16", "16–20", "20–24"];
const HELD = ["under an hour", "1–4 hours", "4–24 hours", "over a day"];
const CONFIDENCE = ["under 0.6", "0.6–0.7", "0.7–0.8", "0.8 and over"];
const heldOf = (h: number): string => (h < 1 ? HELD[0]! : h < 4 ? HELD[1]! : h < 24 ? HELD[2]! : HELD[3]!);
const confidenceOf = (c: number): string => (c < 0.6 ? CONFIDENCE[0]! : c < 0.7 ? CONFIDENCE[1]! : c < 0.8 ? CONFIDENCE[2]! : CONFIDENCE[3]!);
const handOf = (b: TradeHand | undefined): string | undefined => (!b ? undefined : b.who === "owner" ? "You" : b.who === "desk" ? `The desk${b.role ? ` (${b.role})` : ""}` : b.who === "agent" ? (b.name ?? "An agent") : "The venue");

/** what the stop risked, in percent of the entry: the bracket's stop where the trade carried one, else the desk's plan */
function riskPctOf(t: DebriefTrade): number | undefined {
  if (t.stopLoss !== undefined && t.entryPrice > 0) {
    const d = t.side === "long" ? t.entryPrice - t.stopLoss : t.stopLoss - t.entryPrice;
    if (d > 0) return (d / t.entryPrice) * 100;
  }
  return t.lead?.slPct !== undefined && t.lead.slPct > 0 ? t.lead.slPct : undefined;
}
/** the take-profit, in percent of the entry: the bracket's where the trade carried one, else the desk's plan */
function takePctOf(t: DebriefTrade): number | undefined {
  if (t.takeProfit !== undefined && t.entryPrice > 0) {
    const d = t.side === "long" ? t.takeProfit - t.entryPrice : t.entryPrice - t.takeProfit;
    if (d > 0) return (d / t.entryPrice) * 100;
  }
  return t.lead?.tpPct !== undefined && t.lead.tpPct > 0 ? t.lead.tpPct : undefined;
}

/** THE INVERSION TEST (see the top of this file), in words */
function inversionOf(n: number, g: { mean: number; t: number }, cost: number, net: { mean: number; low: number; high: number }): Debrief["inversion"] {
  if (n < FEW) return { verdict: "few", words: `${n} trade${n === 1 ? "" : "s"}: too few to tell an edge from luck, or the market from the costs. Read every figure here as a sketch.` };
  const before = `Before costs a trade ${g.mean < 0 ? "lost" : "made"} ${pct(Math.abs(g.mean), 3)} on average (t ${g.t < 0 ? "−" : ""}${Math.abs(g.t).toFixed(1)})`;
  if (net.mean < 0) {
    if (g.t <= -2 && -g.mean > cost) return { verdict: "invertible", words: `${before}: a loss beyond chance, and bigger than the ${pct(cost, 3)} a trade the costs take. Turned round, it would have made about ${pct(-g.mean - cost, 3)} a trade before slippage — a hypothesis for the lab, not a result: test it there before trusting it.` };
    if (g.t <= -2) return { verdict: "not-enough", words: `${before}: a loss beyond chance, but no bigger than the ${pct(cost, 3)} a trade the costs take. Turned round it would pay those costs again and still lose.` };
    if (g.t >= 2) return { verdict: "costs", words: `${before}: an edge, and the costs (${pct(cost, 3)} a trade) ate it. Keep the signal; cut what each trade pays — fewer trades, wider targets, a cheaper venue.` };
    return { verdict: "costs", words: `${before}: no edge either way. The loss is the costs, ${pct(cost, 3)} a trade. Turned round it would pay them twice; the lesson is to trade less or aim wider, not to trade the other way.` };
  }
  if (net.low > 0) return { verdict: "edge", words: `It made ${signedPct(net.mean, 3)} a trade after costs, and the 95% range (${signedPct(net.low, 3)} to ${signedPct(net.high, 3)}) stays above zero.` };
  return { verdict: "unproven", words: `It made ${signedPct(net.mean, 3)} a trade after costs, but the 95% range (${signedPct(net.low, 3)} to ${signedPct(net.high, 3)}) takes in zero: not yet told apart from luck.` };
}

/** THE DEBRIEF of these round trips (see the top of this file), oldest first or in any order */
export function debriefOf(trades: readonly DebriefTrade[]): Debrief {
  const ts = [...trades].sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
  const n = ts.length;
  const wins = ts.filter(won);
  const losses = ts.filter((t) => !won(t));
  const grossUsd = sum(ts.map((t) => t.grossUsd));
  const feesUsd = sum(ts.map((t) => t.feesUsd));
  const fundingUsd = sum(ts.map((t) => t.fundingUsd));
  const netUsd = sum(ts.map((t) => t.netUsd));
  const nets = ts.map((t) => t.returnPct);
  const netMean = mean(nets);
  const se = n > 1 ? sd(nets) / Math.sqrt(n) : 0;
  const grosses = ts.map(grossPct);
  const gMean = mean(grosses);
  const gSe = n > 1 ? sd(grosses) / Math.sqrt(n) : 0;
  const gT = gSe > 0 ? gMean / gSe : 0;
  const cost = mean(ts.map(costPct));
  const avgWin = mean(wins.map((t) => t.returnPct));
  const avgLoss = mean(losses.map((t) => t.returnPct));
  const wonUsd = sum(wins.map((t) => t.netUsd));
  const lostUsd = -sum(losses.map((t) => t.netUsd));

  // the plan's exits, where most trades carried both: their typical take-profit and stop, and the costs a trade paid
  const planned = ts.map((t) => ({ tp: takePctOf(t), sl: riskPctOf(t), c: costPct(t) })).filter((x): x is { tp: number; sl: number; c: number } => x.tp !== undefined && x.sl !== undefined);
  const plan = planned.length >= Math.max(1, n / 2) ? (() => {
    const tp = median(planned.map((x) => x.tp));
    const sl = median(planned.map((x) => x.sl));
    const c = mean(planned.map((x) => x.c));
    return { winRatePct: r2(pctOf(sl + c, tp + sl)), takeProfitPct: r4(tp), stopPct: r4(sl), costPct: r4(c), trades: planned.length };
  })() : undefined;

  // R: each trade's result, net, over what it risked to its stop — and past the stop, the trades whose loss BEFORE costs went beyond it (a
  // gap through the stop, a stop filled late): net, every stop-out sits a little past -1R by its costs alone
  const risked = ts.map((t) => ({ t, risk: riskPctOf(t) })).filter((x): x is { t: DebriefTrade; risk: number } => x.risk !== undefined);
  const rs = risked.map((x) => x.t.returnPct / x.risk);
  const pastStop = risked.filter((x) => grossPct(x.t) / x.risk < -1.05).length;
  const BINS: Array<[string, (r: number) => boolean]> = [["−2R or worse", (r) => r <= -2], ["−2R to −1R", (r) => r > -2 && r <= -1], ["−1R to 0", (r) => r > -1 && r <= 0], ["0 to 1R", (r) => r > 0 && r <= 1], ["1R to 2R", (r) => r > 1 && r <= 2], ["over 2R", (r) => r > 2]];

  // the streaks, trade after trade
  let longestLosing = 0;
  let run = 0;
  for (const t of ts) {
    run = won(t) ? 0 : run + 1;
    longestLosing = Math.max(longestLosing, run);
  }
  let now: Debrief["streaks"]["now"] = null;
  if (n) {
    const last = won(ts[n - 1]!);
    let k = 0;
    for (let i = n - 1; i >= 0 && won(ts[i]!) === last; i--) k++;
    now = { won: last, n: k };
  }

  let cum = 0;
  const curveAll: Array<[number, number]> = ts.map((t) => [Date.parse(t.closedAt), r2((cum += t.netUsd))]);
  const step = Math.max(1, Math.ceil(curveAll.length / CURVE_MOST));
  const curve = curveAll.filter((_, i) => i % step === 0 || i === curveAll.length - 1);

  const ends = (["take-profit", "stop-loss", "closed", "liquidated", "settled"] as TripEnd[])
    .map((end) => {
      const xs = ts.filter((t) => t.end === end);
      return { end, n: xs.length, netUsd: r2(sum(xs.map((t) => t.netUsd))), winRatePct: r2(pctOf(xs.filter(won).length, xs.length)) };
    })
    .filter((e) => e.n > 0);

  const gaveBack = losses.filter((t) => t.mfePct > 0 && t.mfePct >= -t.returnPct).length;
  const inversion = inversionOf(n, { mean: gMean, t: gT }, cost, { mean: netMean, low: netMean - 1.96 * se, high: netMean + 1.96 * se });
  const breakEven = { winRatePct: wins.length && losses.length ? r2(pctOf(-avgLoss, avgWin - avgLoss)) : null, ...(plan ? { plan } : {}) };
  const slices: Debrief["slices"] = {
    market: slicesBy(ts, (t) => t.symbol),
    side: slicesBy(ts, (t) => t.side, ["long", "short"]),
    hours: slicesBy(ts, (t) => HOURS[Math.floor((et(Date.parse(t.openedAt)).minutes % 1440) / 240)], HOURS),
    held: slicesBy(ts, (t) => heldOf(t.hours), HELD),
    by: slicesBy(ts, (t) => handOf(t.by)),
    confidence: slicesBy(ts, (t) => (t.lead?.confidence !== undefined ? confidenceOf(t.lead.confidence) : undefined), CONFIDENCE),
  };
  const calibration = CONFIDENCE.map((label) => {
    const xs = ts.filter((t) => t.lead?.confidence !== undefined && confidenceOf(t.lead.confidence) === label);
    return { label, n: xs.length, saidPct: r2(mean(xs.map((t) => t.lead!.confidence! * 100))), wonPct: r2(pctOf(xs.filter(won).length, xs.length)) };
  }).filter((c) => c.n > 0);

  // THE NOTES: the findings, most telling first
  const notes: string[] = [];
  if (n) {
    notes.push(inversion.words);
    const costUsd = feesUsd + fundingUsd;
    const costs = `The costs — ${usd(feesUsd)} in fees, ${usd(fundingUsd)} in funding —`;
    if (costUsd > 0) notes.push(grossUsd <= 0 ? `Before costs the trades lost ${usd(-grossUsd)}; the costs — ${usd(feesUsd)} in fees, ${usd(fundingUsd)} in funding — added ${usd(costUsd)}.` : costUsd > 2 * grossUsd ? `${costs} were ${(costUsd / grossUsd).toFixed(1)} times the ${usd(grossUsd)} the trades made before costs.` : `${costs} took ${pct(pctOf(costUsd, grossUsd), 0)} of the ${usd(grossUsd)} the trades made before costs.`);
    if (breakEven.winRatePct !== null) notes.push(`At an average win of ${signedPct(avgWin)} and an average loss of ${signedPct(avgLoss)}, breaking even takes winning ${pct(breakEven.winRatePct, 0)} of trades; ${pct(pctOf(wins.length, n), 0)} won.`);
    if (plan) notes.push(`The plan's exits (a take-profit of ${pct(plan.takeProfitPct)}, a stop of ${pct(plan.stopPct)}, costs of ${pct(plan.costPct, 3)} a trade) need ${pct(plan.winRatePct, 0)} of trades to win.`);
    if (losses.length) notes.push(`${gaveBack} of ${losses.length} losing trade${losses.length === 1 ? " was" : "s were"} up at least as much as ${losses.length === 1 ? "it" : "they"} finally lost before turning.`);
    // the slice each is read as, in words: a market, a side, the New York hours it was entered in, how long it was held, Search's confidence
    const named: Array<[DebriefSlice, string]> = [...slices.market.map((x): [DebriefSlice, string] => [x, x.label]), ...slices.side.map((x): [DebriefSlice, string] => [x, `${x.label} trades`]), ...slices.hours.map((x): [DebriefSlice, string] => [x, `entered ${x.label} New York`]), ...slices.held.map((x): [DebriefSlice, string] => [x, `held ${x.label}`]), ...slices.confidence.map((x): [DebriefSlice, string] => [x, `Search's confidence ${x.label}`])];
    const weakest = named.filter(([x]) => x.n >= 10 && x.meanPct < 0).sort((a, b) => a[0].meanPct - b[0].meanPct)[0];
    if (weakest) notes.push(`The weakest slice with ten trades or more: ${weakest[1]} — ${weakest[0].n} trades, ${signedPct(weakest[0].meanPct, 3)} a trade, ${pct(weakest[0].winRatePct, 0)} won.`);
  }

  return {
    trades: n,
    few: n < FEW,
    ...(n ? { from: ts[0]!.openedAt, to: ts[n - 1]!.closedAt } : {}),
    wins: wins.length,
    losses: losses.length,
    winRatePct: r2(pctOf(wins.length, n)),
    grossUsd: r2(grossUsd),
    feesUsd: r2(feesUsd),
    fundingUsd: r2(fundingUsd),
    costUsd: r2(feesUsd + fundingUsd),
    netUsd: r2(netUsd),
    perTrade: { netPct: r4(netMean), se: r4(se), low: r4(netMean - 1.96 * se), high: r4(netMean + 1.96 * se), grossPct: r4(gMean), grossT: r2(gT), costPct: r4(cost) },
    avgWinPct: r4(avgWin),
    avgLossPct: r4(avgLoss),
    payoff: wins.length && losses.length && avgLoss < 0 ? r2(avgWin / -avgLoss) : null,
    profitFactor: lostUsd > 0 ? r2(wonUsd / lostUsd) : null,
    breakEven,
    inversion,
    excursions: {
      maePct: r4(mean(ts.map((t) => t.maePct))),
      mfePct: r4(mean(ts.map((t) => t.mfePct))),
      winnersMaePct: wins.length ? r4(mean(wins.map((t) => t.maePct))) : null,
      losersMfePct: losses.length ? r4(mean(losses.map((t) => t.mfePct))) : null,
      gaveBack,
      points: ts.slice(-SCATTER_MOST).map((t) => [r4(t.maePct), r4(t.mfePct), won(t) ? 1 : 0]),
    },
    ...(rs.length ? { r: { trades: rs.length, meanR: r2(mean(rs)), pastStop, bins: BINS.map(([label, has]) => ({ label, n: rs.filter(has).length })) } } : {}),
    ends,
    slices,
    calibration,
    streaks: { longestLosing, now },
    curve,
    notes,
  };
}
