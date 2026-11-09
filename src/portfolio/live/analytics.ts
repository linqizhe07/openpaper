/** ANALYTICS OVER THE ACCOUNT'S OWN PRICE HISTORIES: what a terminal's COMP, CORR, HVG, BETA and SEAG draw, computed here from the bars
 * the candles read already gives (service.ts candles) for a few markets at once — nothing new is read, and every figure is arithmetic over
 * the venues' own bars, said so.
 *
 *   COMP   the markets rebased to 100 at the first bar they all have, with each one's total return, annualised volatility, deepest
 *          drawdown and best and worst bar over the range
 *   CORR   the correlation of their bar returns, pairwise over the bars both have
 *   HVG    historical volatility: the annualised standard deviation of returns over a rolling window of 20 and 60 bars, as a series, with
 *          where it stands now against its range
 *   BETA   each market's beta to the first (the regression slope of its returns on the first's), its correlation, R² and annualised alpha
 *   SEAG   seasonality: the average return by calendar month over the range, with how many years each month was seen, and by weekday
 * Returns are log returns bar to bar; bars are matched by their start time (a daily bar's day), so a share's closed days and a coin's
 * weekends simply are not common bars. Annualisation uses the bars a year each market actually showed over the range (a share about 252,
 * a coin 365), said in `barsPerYear` */
import type { Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import type { Candle } from "./trade.ts";

export const ANALYTICS_MOST = 8;
export const ANALYTICS_KINDS = ["comp", "corr", "hvg", "beta", "seag"] as const;
export type AnalyticsKind = (typeof ANALYTICS_KINDS)[number];
export const HV_WINDOWS = [20, 60] as const;
const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface SeriesIn {
  /** venue|symbol, as the page names a market's bars */
  key: string;
  venue: string;
  venueName: string;
  symbol: string;
  interval: string;
  candles: Candle[];
}
export interface MarketStats {
  key: string;
  venue: string;
  venueName: string;
  symbol: string;
  bars: number;
  first: string;
  last: string;
  /** bars a year as observed over the range */
  barsPerYear: number;
  totalReturnPct?: number | undefined;
  annualisedReturnPct?: number | undefined;
  volatilityPct?: number | undefined;
  maxDrawdownPct?: number | undefined;
  bestBarPct?: number | undefined;
  worstBarPct?: number | undefined;
  sharpe?: number | undefined;
}
export interface CompView {
  /** the common bars' times, and each market's level rebased to 100 at the first */
  t: number[];
  rebased: Record<string, Array<number | null>>;
  stats: MarketStats[];
}
export interface CorrView {
  keys: string[];
  /** matrix[i][j]: the correlation of i's and j's returns over the bars both have; null where fewer than 10 */
  matrix: Array<Array<number | null>>;
  /** how many bars each pair shared */
  bars: number[][];
}
export interface HvgView {
  windows: readonly number[];
  series: Record<string, { t: number[]; hv: Record<string, Array<number | null>>; now?: Record<string, number | undefined> | undefined; low?: Record<string, number | undefined> | undefined; high?: Record<string, number | undefined> | undefined }>;
}
export interface BetaRow {
  key: string;
  against: string;
  bars: number;
  beta?: number | undefined;
  correlation?: number | undefined;
  r2?: number | undefined;
  /** the regression intercept per bar, annualised, in percent */
  alphaPct?: number | undefined;
}
export interface SeagView {
  months: Array<{ month: string; by: Record<string, { avgPct?: number | undefined; years: number; upYears: number }> }>;
  weekdays: Array<{ day: string; by: Record<string, { avgPct?: number | undefined; n: number; upShare?: number | undefined }> }>;
}
export interface AnalyticsView {
  asOf: string;
  interval: string;
  range: string;
  markets: Array<{ key: string; venue: string; venueName: string; symbol: string; bars: number }>;
  comp: CompView;
  corr: CorrView;
  hvg: HvgView;
  beta: BetaRow[];
  seag: SeagView;
  /** a market asked for that gave no bars, with the venue's words */
  missing: Array<{ key: string; why: string; code?: string | undefined }>;
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const variance = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1);
};
/** the closes by bar start, the bars oldest first and each time once */
function closes(c: Candle[]): Map<number, number> {
  const by = new Map<number, number>();
  for (const b of [...c].sort((a, b) => a.t - b.t)) if (Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0) by.set(b.t, b.c);
  return by;
}
/** log returns bar to bar, keyed by the later bar's time */
function returns(by: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  let prev: number | undefined;
  for (const [t, c] of by) {
    if (prev !== undefined) out.set(t, Math.log(c / prev));
    prev = c;
  }
  return out;
}
/** bars a year as observed: the bars over the span from the first to the last, a year being 365.25 days */
export function barsPerYear(times: number[]): number {
  if (times.length < 2) return 0;
  const span = times[times.length - 1]! - times[0]!;
  if (span <= 0) return 0;
  return Math.round(((times.length - 1) / span) * 365.25 * DAY);
}
/** one market's figures over its own bars */
export function statsOf(s: SeriesIn): MarketStats {
  const by = closes(s.candles);
  const times = [...by.keys()];
  const vals = [...by.values()];
  const n = times.length;
  const bpy = barsPerYear(times);
  const base: MarketStats = { key: s.key, venue: s.venue, venueName: s.venueName, symbol: s.symbol, bars: n, first: n ? new Date(times[0]!).toISOString() : "", last: n ? new Date(times[n - 1]!).toISOString() : "", barsPerYear: bpy };
  if (n < 2) return base;
  const rets = [...returns(by).values()];
  const total = vals[n - 1]! / vals[0]! - 1;
  const years = (times[n - 1]! - times[0]!) / (365.25 * DAY);
  let peak = vals[0]!;
  let dd = 0;
  for (const v of vals) {
    if (v > peak) peak = v;
    dd = Math.min(dd, v / peak - 1);
  }
  const vol = bpy && rets.length > 1 ? Math.sqrt(variance(rets) * bpy) : undefined;
  const annual = years > 0 ? Math.pow(1 + total, 1 / years) - 1 : undefined;
  return {
    ...base,
    totalReturnPct: r2(total * 100),
    ...(annual !== undefined && Number.isFinite(annual) ? { annualisedReturnPct: r2(annual * 100) } : {}),
    ...(vol !== undefined ? { volatilityPct: r2(vol * 100) } : {}),
    maxDrawdownPct: r2(dd * 100),
    bestBarPct: r2((Math.exp(Math.max(...rets)) - 1) * 100),
    worstBarPct: r2((Math.exp(Math.min(...rets)) - 1) * 100),
    ...(vol && bpy ? { sharpe: r2((mean(rets) * bpy) / vol) } : {}),
  };
}
/** the markets rebased to 100 at the first bar every one of them has; a market missing a later bar carries null there */
export function comp(series: SeriesIn[]): CompView {
  const maps = series.map((s) => closes(s.candles));
  const all = new Set<number>();
  for (const m of maps) for (const t of m.keys()) all.add(t);
  const times = [...all].sort((a, b) => a - b);
  const firstCommon = times.find((t) => maps.every((m) => m.has(t)));
  const from = firstCommon === undefined ? times[0] : firstCommon;
  const t = from === undefined ? [] : times.filter((x) => x >= from);
  const rebased: Record<string, Array<number | null>> = {};
  series.forEach((s, i) => {
    const m = maps[i]!;
    const base = from !== undefined ? m.get(from) : undefined;
    rebased[s.key] = t.map((x) => (base && m.has(x) ? r2((m.get(x)! / base) * 100) : null));
  });
  return { t, rebased, stats: series.map(statsOf) };
}
function pairwise(a: Map<number, number>, b: Map<number, number>): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const [t, ra] of a) {
    const rb = b.get(t);
    if (rb !== undefined) {
      x.push(ra);
      y.push(rb);
    }
  }
  return { x, y };
}
function correlation(x: number[], y: number[]): number | undefined {
  if (x.length < 10) return undefined;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : undefined;
}
/** the correlation of returns, every pair over the bars both have */
export function corr(series: SeriesIn[]): CorrView {
  const rets = series.map((s) => returns(closes(s.candles)));
  const keys = series.map((s) => s.key);
  const matrix: Array<Array<number | null>> = [];
  const bars: number[][] = [];
  for (let i = 0; i < series.length; i++) {
    matrix.push([]);
    bars.push([]);
    for (let j = 0; j < series.length; j++) {
      const { x, y } = pairwise(rets[i]!, rets[j]!);
      const c = i === j ? (x.length ? 1 : undefined) : correlation(x, y);
      matrix[i]!.push(c === undefined ? null : r4(c));
      bars[i]!.push(x.length);
    }
  }
  return { keys, matrix, bars };
}
/** historical volatility over rolling windows, annualised by the bars a year observed */
export function hvg(series: SeriesIn[]): HvgView {
  const out: HvgView["series"] = {};
  for (const s of series) {
    const by = closes(s.candles);
    const times = [...by.keys()];
    const bpy = barsPerYear(times);
    const rets = [...returns(by).entries()];
    const hv: Record<string, Array<number | null>> = {};
    const now: Record<string, number | undefined> = {};
    const low: Record<string, number | undefined> = {};
    const high: Record<string, number | undefined> = {};
    for (const w of HV_WINDOWS) {
      const line: Array<number | null> = rets.map((_, i) => {
        if (i + 1 < w || !bpy) return null;
        const window = rets.slice(i + 1 - w, i + 1).map(([, r]) => r);
        return r2(Math.sqrt(variance(window) * bpy) * 100);
      });
      hv[String(w)] = line;
      const have = line.filter((v): v is number => v !== null);
      now[String(w)] = have.length ? have[have.length - 1] : undefined;
      low[String(w)] = have.length ? Math.min(...have) : undefined;
      high[String(w)] = have.length ? Math.max(...have) : undefined;
    }
    out[s.key] = { t: rets.map(([t]) => t), hv, now, low, high };
  }
  return { windows: HV_WINDOWS, series: out };
}
/** each market's beta to the first: the slope of its returns on the first's over the bars both have */
export function beta(series: SeriesIn[]): BetaRow[] {
  if (!series.length) return [];
  const against = series[0]!;
  const ra = returns(closes(against.candles));
  const bpy = barsPerYear([...closes(against.candles).keys()]);
  return series.slice(1).map((s) => {
    const { x, y } = pairwise(ra, returns(closes(s.candles)));
    const row: BetaRow = { key: s.key, against: against.key, bars: x.length };
    if (x.length < 10) return row;
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < x.length; i++) {
      sxy += (x[i]! - mx) * (y[i]! - my);
      sxx += (x[i]! - mx) ** 2;
    }
    if (sxx <= 0) return row;
    const b = sxy / sxx;
    const c = correlation(x, y);
    const alpha = my - b * mx;
    return { ...row, beta: r4(b), ...(c !== undefined ? { correlation: r4(c), r2: r4(c * c) } : {}), ...(bpy ? { alphaPct: r2(alpha * bpy * 100) } : {}) };
  });
}
/** seasonality: the average of each calendar month's return (the bars of the month compounded) over the years seen, and each weekday's bar return */
export function seag(series: SeriesIn[]): SeagView {
  const months: SeagView["months"] = MONTHS.map((month) => ({ month, by: {} }));
  const weekdays: SeagView["weekdays"] = WEEKDAYS.map((day) => ({ day, by: {} }));
  for (const s of series) {
    const rets = returns(closes(s.candles));
    const byMonth = new Map<string, number>();
    const byWeekday: number[][] = WEEKDAYS.map(() => []);
    for (const [t, r] of rets) {
      const d = new Date(t);
      const ym = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + r);
      byWeekday[d.getUTCDay()]!.push(r);
    }
    for (let m = 0; m < 12; m++) {
      const seen = [...byMonth.entries()].filter(([k]) => Number(k.split("-")[1]) === m).map(([, v]) => Math.exp(v) - 1);
      months[m]!.by[s.key] = { ...(seen.length ? { avgPct: r2(mean(seen) * 100) } : {}), years: seen.length, upYears: seen.filter((v) => v > 0).length };
    }
    for (let w = 0; w < 7; w++) {
      const xs = byWeekday[w]!;
      weekdays[w]!.by[s.key] = { ...(xs.length ? { avgPct: r4(mean(xs.map((v) => Math.exp(v) - 1)) * 100), upShare: r2(xs.filter((v) => v > 0).length / xs.length) } : {}), n: xs.length };
    }
  }
  return { months, weekdays: weekdays.filter((w) => series.some((s) => (w.by[s.key]?.n ?? 0) > 0)) };
}
/** what is asked, checked: up to eight markets as venue|symbol, the interval and range as the candles read takes them */
export function checkMarkets(raw: unknown): Array<{ venue: string; symbol: string; key: string }> | Refusal {
  const list = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []).map((x) => String(x).trim()).filter(Boolean);
  if (!list.length) return no("E_ACCOUNT_BAD_ACTION", { message: "markets are named venue|symbol, one or more apart by commas (ex|BTC/USDT, broker|AAPL)" });
  if (list.length > ANALYTICS_MOST) return no("E_ACCOUNT_BAD_ACTION", { message: `${ANALYTICS_MOST} markets at most` });
  const out: Array<{ venue: string; symbol: string; key: string }> = [];
  for (const x of list) {
    const i = x.indexOf("|");
    const venue = i > 0 ? x.slice(0, i) : "";
    const symbol = i > 0 ? x.slice(i + 1) : "";
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(venue) || !symbol || symbol.length > 160) return no("E_ACCOUNT_BAD_ACTION", { message: `"${x.slice(0, 40)}" is not a market: venue|symbol, the venue by its id` });
    if (!out.some((o) => o.key === `${venue}|${symbol}`)) out.push({ venue, symbol, key: `${venue}|${symbol}` });
  }
  return out;
}
/** the view, from the series the candles read gave and the ones it refused */
export function analyticsOf(series: SeriesIn[], missing: AnalyticsView["missing"], interval: string, range: string, now: number): AnalyticsView {
  const have = series.filter((s) => s.candles.length >= 2);
  return {
    asOf: new Date(now).toISOString(),
    interval,
    range,
    markets: have.map((s) => ({ key: s.key, venue: s.venue, venueName: s.venueName, symbol: s.symbol, bars: s.candles.length })),
    comp: comp(have),
    corr: corr(have),
    hvg: hvg(have),
    beta: beta(have),
    seag: seag(have),
    missing: [...missing, ...series.filter((s) => s.candles.length < 2).map((s) => ({ key: s.key, why: `${s.venueName} gave ${s.candles.length === 1 ? "one bar" : "no bars"} for ${s.symbol} over this range` }))],
    notes: [
      "Every figure here is arithmetic over the bars the account's own candles read gives for each market at its venue (the same bars the chart draws), nothing read anew: returns are log returns bar to bar; bars are matched by their start time, so a share's closed days and a coin's weekends are simply not common bars; annualisation uses the bars a year each market actually showed over the range (barsPerYear).",
      "The comparison rebases every market to 100 at the first bar all of them have; the correlation and the beta take each pair over the bars both have (fewer than ten gives none); historical volatility is the annualised standard deviation of returns over a rolling window of 20 and 60 bars; seasonality compounds each calendar month's bars and averages the months seen, with how many of them were up.",
      "Nothing here is a forecast, and nothing is the account's own figure.",
    ],
  };
}
