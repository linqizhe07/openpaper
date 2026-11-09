/** PORTFOLIO RISK, from the account's own holdings and the bars it already reads: what a terminal's PORT risk tab shows — the exposure by
 * line, class and venue; the concentration; each line's historical volatility and the portfolio's, with how much each line adds; the
 * one-day value at risk read off the portfolio's own history of daily returns (and the normal one beside it); the betas to a benchmark;
 * the net worth's drawdown; and what a uniform move would do. Every figure is arithmetic over the venues' own bars and the account's own
 * balances, said so; nothing is a forecast.
 *
 * The lines come in priced (the holdings read's rows, and the perpetual positions with their signed notional) with the daily closes the
 * candles read gives for each; a line with no bars (cash, a stablecoin, an event contract, a token no venue charts) weighs in the exposure
 * and carries no volatility of its own — said in `unpriced`. Weights are each line's dollars over the whole; a short position's weight is
 * negative. The portfolio's daily return is the weighted sum of the lines' returns over the days every priced line has */
import type { Candle } from "./trade.ts";

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const variance = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1);
};
/** the standard normal's quantile for the usual confidences */
const Z: Record<string, number> = { "95": 1.6449, "99": 2.3263 };

export interface RiskLineIn {
  /** the holdings row's key (crypto:BTC, equity:AAPL, stable:USDC) or a position's (perp:ex|BTC/USDT:USDT) */
  key: string;
  name: string;
  class: string;
  /** dollars, signed: a short position's are negative */
  usd: number;
  venue?: string | undefined;
  venueName?: string | undefined;
  /** the bars the candles read gave for it, where it has a market */
  candles?: Candle[] | undefined;
  /** a perpetual's leverage, where the venue says */
  leverage?: number | undefined;
}
export interface RiskLine {
  key: string;
  name: string;
  class: string;
  usd: number;
  /** of the gross exposure, signed */
  weightPct: number;
  venue?: string | undefined;
  venueName?: string | undefined;
  bars: number;
  volatilityPct?: number | undefined;
  /** the line's share of the portfolio's variance, in percent of the whole */
  riskContributionPct?: number | undefined;
  /** the loss at the 95 % one-day VaR, were this line alone, in dollars */
  var95Usd?: number | undefined;
  leverage?: number | undefined;
}
export interface RiskView {
  asOf: string;
  /** the dollars every line adds up to, signed, and the gross (every line's absolute dollars) */
  netUsd: number;
  grossUsd: number;
  longUsd: number;
  shortUsd: number;
  lines: RiskLine[];
  byClass: Array<{ name: string; usd: number; weightPct: number; lines: number }>;
  byVenue: Array<{ venue: string; venueName: string; usd: number; weightPct: number; lines: number }>;
  concentration: { top1Pct?: number | undefined; top3Pct?: number | undefined; hhi?: number | undefined; effective?: number | undefined };
  /** the lines with no bars, which weigh in the exposure and carry no volatility here */
  unpriced: Array<{ key: string; name: string; usd: number; why: string }>;
  portfolio: {
    /** days every priced line has in common, over which the portfolio's daily returns are made */
    days: number;
    /** of the gross exposure, how much is priced */
    pricedPct: number;
    volatilityPct?: number | undefined;
    /** one-day value at risk in dollars and in percent of the gross, from the history of the portfolio's own daily returns */
    var95Usd?: number | undefined;
    var95Pct?: number | undefined;
    var99Usd?: number | undefined;
    var99Pct?: number | undefined;
    /** the same under a normal distribution with the measured volatility, beside the historical */
    normalVar95Usd?: number | undefined;
    normalVar99Usd?: number | undefined;
    /** the expected shortfall beyond the 95 % VaR */
    es95Usd?: number | undefined;
    worstDayPct?: number | undefined;
    worstDay?: string | undefined;
    bestDayPct?: number | undefined;
    /** the portfolio's daily returns, latest 90, for a strip */
    recent: Array<{ t: number; pct: number }>;
  };
  benchmarks: Array<{ key: string; name: string; days: number; beta?: number | undefined; correlation?: number | undefined }>;
  drawdown: { points: number; maxPct?: number | undefined; maxFrom?: string | undefined; maxTo?: string | undefined; currentPct?: number | undefined; peakUsd?: number | undefined; peakAt?: string | undefined };
  stress: Array<{ name: string; movePct: number; class?: string | undefined; usd: number; pct: number }>;
  notes: string[];
}

/** the closes by day: a daily bar's start, UTC; the bars oldest first */
function closesByDay(c: Candle[] | undefined): Map<number, number> {
  const by = new Map<number, number>();
  for (const b of [...(c ?? [])].sort((a, b) => a.t - b.t)) if (Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0) by.set(Math.floor(b.t / DAY) * DAY, b.c);
  return by;
}
function returnsByDay(by: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  let prev: number | undefined;
  for (const [t, c] of by) {
    if (prev !== undefined) out.set(t, Math.log(c / prev));
    prev = c;
  }
  return out;
}
const barsPerYear = (times: number[]) => (times.length < 2 ? 0 : Math.round(((times.length - 1) / (times[times.length - 1]! - times[0]!)) * 365.25 * DAY));
/** the quantile of a sorted sample, the loss side: the k-th worst where k = (1 − confidence) × n, interpolated */
function quantile(sortedAsc: number[], p: number): number | undefined {
  if (!sortedAsc.length) return undefined;
  const pos = p * (sortedAsc.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (pos - lo);
}

/** THE VIEW: the lines with their bars, the benchmarks with theirs, the net worth's points */
export function riskOf(lines: RiskLineIn[], benchmarks: Array<{ key: string; name: string; candles: Candle[] }>, history: Array<{ at: string; usd: number }>, now: number): RiskView {
  const gross = lines.reduce((a, l) => a + Math.abs(l.usd), 0);
  const net = lines.reduce((a, l) => a + l.usd, 0);
  const longUsd = lines.filter((l) => l.usd > 0).reduce((a, l) => a + l.usd, 0);
  const shortUsd = lines.filter((l) => l.usd < 0).reduce((a, l) => a + l.usd, 0);
  const w = (usd: number) => (gross > 0 ? (usd / gross) * 100 : 0);
  // each line's daily returns
  const rets = lines.map((l) => returnsByDay(closesByDay(l.candles)));
  const priced = lines.map((l, i) => ({ l, r: rets[i]!, i })).filter((x) => x.r.size >= 10);
  const unpriced = lines.filter((l, i) => rets[i]!.size < 10 && l.usd !== 0).map((l) => ({ key: l.key, name: l.name, usd: l.usd, why: /^(cash|stable|earn)/.test(l.class) ? "cash: no market price moves it" : (l.candles?.length ?? 0) < 2 ? "no bars from any venue for it" : "too few bars (ten days at least)" }));
  // the days every priced line has
  let common: number[] = [];
  if (priced.length) {
    const sets = priced.map((x) => new Set(x.r.keys()));
    common = [...sets[0]!].filter((t) => sets.every((s) => s.has(t))).sort((a, b) => a - b);
  }
  const pricedUsd = priced.reduce((a, x) => a + Math.abs(x.l.usd), 0);
  const bpy = barsPerYear(common);
  // the portfolio's daily return: the weighted sum of its priced lines' (weights over the gross, so cash drags the figure down, as it should)
  const port = common.map((t) => priced.reduce((a, x) => a + (x.l.usd / gross) * x.r.get(t)!, 0));
  const vol = common.length >= 10 && bpy ? Math.sqrt(variance(port) * bpy) : undefined;
  const sorted = [...port].sort((a, b) => a - b);
  const q95 = quantile(sorted, 0.05);
  const q99 = quantile(sorted, 0.01);
  const loss = (q: number | undefined) => (q === undefined ? undefined : Math.max(0, -(Math.exp(q) - 1)));
  const es = (() => {
    if (q95 === undefined) return undefined;
    const tail = sorted.filter((x) => x <= q95);
    return tail.length ? Math.max(0, -(Math.exp(mean(tail)) - 1)) : undefined;
  })();
  const daily = vol && bpy ? vol / Math.sqrt(bpy) : undefined;
  const worstI = port.length ? port.indexOf(Math.min(...port)) : -1;
  // each line's own volatility and its share of the portfolio's variance (its weight times its covariance with the portfolio, over the variance)
  const portVar = common.length >= 10 ? variance(port) : NaN;
  const pm = mean(port);
  const out: RiskLine[] = lines.map((l, i) => {
    const r = rets[i]!;
    const times = [...r.keys()];
    const lbpy = barsPerYear(times);
    const own = r.size >= 10 && lbpy ? Math.sqrt(variance([...r.values()]) * lbpy) : undefined;
    let contribution: number | undefined;
    if (own !== undefined && Number.isFinite(portVar) && portVar > 0 && common.length >= 10) {
      const xs = common.map((t) => r.get(t)!);
      const xm = mean(xs);
      let cov = 0;
      for (let k = 0; k < common.length; k++) cov += (xs[k]! - xm) * (port[k]! - pm);
      cov /= common.length - 1;
      contribution = ((l.usd / gross) * cov) / portVar;
    }
    const ownDaily = own !== undefined && lbpy ? own / Math.sqrt(lbpy) : undefined;
    return {
      key: l.key,
      name: l.name,
      class: l.class,
      usd: r2(l.usd),
      weightPct: r2(w(l.usd)),
      ...(l.venue ? { venue: l.venue } : {}),
      ...(l.venueName ? { venueName: l.venueName } : {}),
      bars: closesByDay(l.candles).size,
      ...(own !== undefined ? { volatilityPct: r2(own * 100) } : {}),
      ...(contribution !== undefined ? { riskContributionPct: r2(contribution * 100) } : {}),
      ...(ownDaily !== undefined ? { var95Usd: r2(Math.abs(l.usd) * ownDaily * Z["95"]!) } : {}),
      ...(l.leverage !== undefined ? { leverage: l.leverage } : {}),
    };
  }).sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));
  const byClass = [...lines.reduce((m, l) => m.set(l.class, { usd: (m.get(l.class)?.usd ?? 0) + l.usd, lines: (m.get(l.class)?.lines ?? 0) + 1 }), new Map<string, { usd: number; lines: number }>())].map(([name, v]) => ({ name, usd: r2(v.usd), weightPct: r2(w(v.usd)), lines: v.lines })).sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));
  const byVenue = [...lines.filter((l) => l.venue).reduce((m, l) => m.set(l.venue!, { venueName: l.venueName ?? l.venue!, usd: (m.get(l.venue!)?.usd ?? 0) + l.usd, lines: (m.get(l.venue!)?.lines ?? 0) + 1 }), new Map<string, { venueName: string; usd: number; lines: number }>())].map(([venue, v]) => ({ venue, venueName: v.venueName, usd: r2(v.usd), weightPct: r2(w(v.usd)), lines: v.lines })).sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));
  const weights = out.map((l) => Math.abs(l.weightPct) / 100).sort((a, b) => b - a);
  const hhi = weights.reduce((a, x) => a + x * x, 0);
  const concentration = gross > 0 ? { top1Pct: r2((weights[0] ?? 0) * 100), top3Pct: r2(weights.slice(0, 3).reduce((a, b) => a + b, 0) * 100), hhi: r4(hhi), effective: hhi > 0 ? r2(1 / hhi) : undefined } : {};
  // the benchmarks: the portfolio's daily returns regressed on each benchmark's, over the days both have
  const bench = benchmarks.map((b) => {
    const br = returnsByDay(closesByDay(b.candles));
    const days = common.filter((t) => br.has(t));
    if (days.length < 10) return { key: b.key, name: b.name, days: days.length };
    const x = days.map((t) => br.get(t)!);
    const y = days.map((t) => port[common.indexOf(t)]!);
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let k = 0; k < x.length; k++) {
      sxy += (x[k]! - mx) * (y[k]! - my);
      sxx += (x[k]! - mx) ** 2;
      syy += (y[k]! - my) ** 2;
    }
    return { key: b.key, name: b.name, days: days.length, ...(sxx > 0 ? { beta: r4(sxy / sxx) } : {}), ...(sxx > 0 && syy > 0 ? { correlation: r4(sxy / Math.sqrt(sxx * syy)) } : {}) };
  });
  // the net worth's drawdown
  const pts = history.filter((p) => Number.isFinite(p.usd) && p.usd > 0 && Number.isFinite(Date.parse(p.at)));
  let peak = -Infinity;
  let peakAt = "";
  let maxDd = 0;
  let maxFrom = "";
  let maxTo = "";
  for (const p of pts) {
    if (p.usd > peak) {
      peak = p.usd;
      peakAt = p.at;
    }
    const dd = p.usd / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      maxFrom = peakAt;
      maxTo = p.at;
    }
  }
  const last = pts[pts.length - 1];
  const drawdown = pts.length ? { points: pts.length, maxPct: r2(maxDd * 100), ...(maxFrom ? { maxFrom, maxTo } : {}), currentPct: last ? r2((last.usd / peak - 1) * 100) : undefined, peakUsd: r2(peak), peakAt } : { points: 0 };
  // what a uniform move would do: every priced line moved together, and each class alone
  const classes = [...new Set(lines.filter((l, i) => rets[i]!.size >= 10 || /^(crypto|equity|perp|rwa)/.test(l.class)).map((l) => l.class))];
  const stress: RiskView["stress"] = [];
  for (const move of [-5, -10, -20]) {
    const usd = lines.filter((l) => !/^(cash|stable|earn)/.test(l.class)).reduce((a, l) => a + l.usd * (move / 100), 0);
    stress.push({ name: `Everything priced ${move}%`, movePct: move, usd: r2(usd), pct: r2(gross ? (usd / gross) * 100 : 0) });
  }
  for (const c of classes) {
    const move = c === "crypto" || c === "perp" ? -30 : -10;
    const usd = lines.filter((l) => l.class === c).reduce((a, l) => a + l.usd * (move / 100), 0);
    stress.push({ name: `${c} ${move}%`, movePct: move, class: c, usd: r2(usd), pct: r2(gross ? (usd / gross) * 100 : 0) });
  }
  return {
    asOf: new Date(now).toISOString(),
    netUsd: r2(net),
    grossUsd: r2(gross),
    longUsd: r2(longUsd),
    shortUsd: r2(shortUsd),
    lines: out,
    byClass,
    byVenue,
    concentration,
    unpriced,
    portfolio: {
      days: common.length,
      pricedPct: r2(gross ? (pricedUsd / gross) * 100 : 0),
      ...(vol !== undefined ? { volatilityPct: r2(vol * 100) } : {}),
      ...(loss(q95) !== undefined && common.length >= 10 ? { var95Usd: r2(loss(q95)! * gross), var95Pct: r2(loss(q95)! * 100) } : {}),
      ...(loss(q99) !== undefined && common.length >= 10 ? { var99Usd: r2(loss(q99)! * gross), var99Pct: r2(loss(q99)! * 100) } : {}),
      ...(daily !== undefined ? { normalVar95Usd: r2(daily * Z["95"]! * gross), normalVar99Usd: r2(daily * Z["99"]! * gross) } : {}),
      ...(es !== undefined && common.length >= 10 ? { es95Usd: r2(es * gross) } : {}),
      ...(worstI >= 0 ? { worstDayPct: r2((Math.exp(port[worstI]!) - 1) * 100), worstDay: new Date(common[worstI]!).toISOString().slice(0, 10), bestDayPct: r2((Math.exp(Math.max(...port)) - 1) * 100) } : {}),
      recent: common.slice(-90).map((t, k) => ({ t, pct: r2((Math.exp(port[common.length - Math.min(90, common.length) + k]!) - 1) * 100) })),
    },
    benchmarks: bench,
    drawdown,
    stress,
    notes: [
      "Every figure here is arithmetic over the account's own balances and the bars its candles read gives for each line (daily bars over the last year): weights are each line's dollars over the gross exposure, a short position's negative; the portfolio's daily return is the weighted sum of its priced lines' log returns over the days every priced line has; cash, stablecoins and lines with no bars weigh in the exposure and carry no volatility here.",
      "The value at risk is read off the history of those daily returns (the 5th and 1st percentile, as a loss in dollars of the gross), with the normal distribution's figure at the measured volatility beside it, and the expected shortfall beyond the 95 % line; each line's own VaR is its dollars times its daily volatility times 1.645. The betas regress the portfolio's daily returns on each benchmark's over the days both have.",
      "The drawdown is the net worth curve's own, from each peak the account has seen; the stresses move every priced line, or one class, by a flat percentage, the dollars that would be. Nothing here is a forecast, and none of it is a venue's figure.",
    ],
  };
}
