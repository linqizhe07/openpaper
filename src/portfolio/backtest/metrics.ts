/** WHAT A BACKTEST CAME TO, in the figures a desk reads one by (backtest/engine.ts gives the equity at every step, the fills and the funding).
 *
 * Returns are the equity's from one step to the next, and a year holds as many steps as the run took per year of its own clock (a run of
 * hourly bars around the clock, about 8,760; of a US share's daily bars, about 252), so the yearly figures need no calendar of their own.
 *   return, CAGR    the end over the start; compounded to a year
 *   volatility      the standard deviation of the step returns, scaled to a year by the square root of the steps in one
 *   Sharpe          the mean step return over its standard deviation, scaled the same way, with no risk-free rate taken off; its standard
 *                   error is Lo's (2002) for returns with no serial correlation, sqrt((1 + SR²/2) / n) at the step's own scale, scaled to a
 *                   year — a Sharpe of 1 over six months of hourly steps is about ±0.7 a year either side
 *   Sortino         the same mean over the downside deviation (the root mean square of the returns below zero, over all the steps)
 *   drawdown        the deepest fall from a peak of the equity, in percent, and the longest time below a peak, in days
 *   Calmar          the CAGR over the deepest drawdown
 *   turnover        the dollars traded over the average equity, a year
 *   costs           the fees, the funding (paid less received), and the slippage: what the fills paid past each bar's open, the half
 *                   spread and the walk of the book together
 *   exposure        the average of the gross notional held over the equity, at the steps */
export interface EquityPoint {
  t: number;
  usd: number;
  /** the gross notional held at that step, at the bars' opens */
  grossUsd?: number | undefined;
}

export interface Metrics {
  startUsd: number;
  endUsd: number;
  returnPct: number;
  years: number;
  cagrPct: number;
  volPct: number;
  sharpe: number;
  sharpeSe: number;
  sortino: number;
  maxDrawdownPct: number;
  maxDrawdownDays: number;
  calmar: number;
  steps: number;
  perYear: number;
  fills: number;
  tradedUsd: number;
  turnover: number;
  feesUsd: number;
  fundingUsd: number;
  slippageUsd: number;
  exposurePct: number;
}

const YEAR_MS = 365 * 86_400_000;
const DAY_MS = 86_400_000;
const r = (x: number, places = 4): number => (Number.isFinite(x) ? Number(x.toFixed(places)) : 0);

/** the step returns of an equity series, oldest first */
export function stepReturns(equity: readonly EquityPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const a = equity[i - 1]!.usd;
    const b = equity[i]!.usd;
    out.push(a > 0 ? b / a - 1 : 0);
  }
  return out;
}

/** the deepest fall from a peak, as a fraction, and the longest time spent under a peak, ms */
export function drawdown(equity: readonly EquityPoint[]): { max: number; longestMs: number } {
  let peak = Number.NEGATIVE_INFINITY;
  let peakAt = equity[0]?.t ?? 0;
  let max = 0;
  let longest = 0;
  for (const p of equity) {
    if (p.usd >= peak) {
      peak = p.usd;
      peakAt = p.t;
    } else {
      max = Math.max(max, peak > 0 ? (peak - p.usd) / peak : 0);
      longest = Math.max(longest, p.t - peakAt);
    }
  }
  return { max, longestMs: longest };
}

export interface CostsSeen {
  fills: number;
  tradedUsd: number;
  feesUsd: number;
  fundingUsd: number;
  slippageUsd: number;
}

/** the figures of a run (see the top of this file) */
export function metricsOf(equity: readonly EquityPoint[], costs: CostsSeen): Metrics {
  const start = equity[0]?.usd ?? 0;
  const end = equity[equity.length - 1]?.usd ?? start;
  const span = equity.length > 1 ? equity[equity.length - 1]!.t - equity[0]!.t : 0;
  const years = span / YEAR_MS;
  const rets = stepReturns(equity);
  const n = rets.length;
  const perYear = years > 0 ? n / years : 0;
  const mean = n ? rets.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const down = n ? Math.sqrt(rets.reduce((s, x) => s + (x < 0 ? x * x : 0), 0) / n) : 0;
  const srStep = sd > 0 ? mean / sd : 0;
  const scale = Math.sqrt(perYear);
  const dd = drawdown(equity);
  const cagr = years > 0 && start > 0 && end > 0 ? (end / start) ** (1 / years) - 1 : 0;
  const avgEquity = equity.length ? equity.reduce((s, p) => s + p.usd, 0) / equity.length : 0;
  const grossSeen = equity.filter((p) => p.grossUsd !== undefined && p.usd > 0);
  const exposure = grossSeen.length ? grossSeen.reduce((s, p) => s + p.grossUsd! / p.usd, 0) / grossSeen.length : 0;
  return {
    startUsd: r(start, 2),
    endUsd: r(end, 2),
    returnPct: r(start > 0 ? (end / start - 1) * 100 : 0, 3),
    years: r(years, 4),
    cagrPct: r(cagr * 100, 3),
    volPct: r(sd * scale * 100, 3),
    sharpe: r(srStep * scale, 3),
    sharpeSe: r(n > 0 ? Math.sqrt((1 + (srStep * srStep) / 2) / n) * scale : 0, 3),
    sortino: r(down > 0 ? (mean / down) * scale : 0, 3),
    maxDrawdownPct: r(dd.max * 100, 3),
    maxDrawdownDays: r(dd.longestMs / DAY_MS, 2),
    calmar: r(dd.max > 0 ? cagr / dd.max : 0, 3),
    steps: n,
    perYear: r(perYear, 1),
    fills: costs.fills,
    tradedUsd: r(costs.tradedUsd, 2),
    turnover: r(avgEquity > 0 && years > 0 ? costs.tradedUsd / avgEquity / years : 0, 2),
    feesUsd: r(costs.feesUsd, 2),
    fundingUsd: r(costs.fundingUsd, 2),
    slippageUsd: r(costs.slippageUsd, 2),
    exposurePct: r(exposure * 100, 2),
  };
}
