/* TRANSACTION-COST ANALYSIS of a worked order (live/paper.ts: a twap, a vwap, an iceberg — and any order with fills), in the terms a desk
   reads: the arrival price (the market when the order was placed: the middle of the book, else its last), the order's own average, the
   IMPLEMENTATION SHORTFALL against the arrival in basis points — positive is a cost, a buy that paid more than the arrival or a sell that
   took less — the same against the market's own volume-weighted average over the time the order worked (its 1-minute bars, each bar's
   close at its volume; the plain average of closes where the bars carry no volume) and against the time-weighted one, the fees in dollars
   and in basis points of what was done, how much of the market's volume over that time the order was (participation), how long it took,
   and how many children filled. Nothing here is estimated: every figure is from the fills and the bars given */

import type { Candle, Side } from "./trade.ts";

export interface TcaFill {
  qty: number;
  price: number;
  feeUsd?: number | undefined;
  /** when it filled (ms) */
  at: number;
}
export interface Tca {
  /** the market when the order was placed, and when (ms) */
  arrival: number;
  arrivalAt: number;
  /** what filled: units, the average price a unit (fees apart), what it came to, the fees */
  qty: number;
  avgPrice: number;
  notionalUsd: number;
  feesUsd: number;
  feeBps: number;
  /** the order's average against the arrival, in basis points: positive is a cost (a buy paid more, a sell took less) */
  shortfallBps: number;
  /** the market's volume-weighted and time-weighted averages over the time the order worked, and the order's average against each (positive
   * a cost), where bars for that time were given */
  vwap?: number | undefined;
  vsVwapBps?: number | undefined;
  twap?: number | undefined;
  vsTwapBps?: number | undefined;
  /** the order's units as a share of the market's volume over that time (0 to 1), where the bars carry volume */
  participation?: number | undefined;
  /** from the arrival to the last fill (ms), and how many fills */
  spanMs: number;
  fills: number;
}

const round = (x: number, places: number): number => Number(x.toFixed(places));
/** basis points the order's average is worse than a benchmark: a buy above it, a sell below it */
export const costBps = (side: Side, avg: number, bench: number): number => round(((side === "buy" ? avg - bench : bench - avg) / bench) * 10_000, 2);

/** the market's averages over [from, to] from its bars: the volume-weighted (each bar's close at its volume) where the bars carry volume,
 * the time-weighted (the plain average of closes) always; the volume summed where carried. Undefined where no bar falls in the window */
export function benchmarksOf(bars: readonly Candle[], from: number, to: number): { vwap?: number | undefined; twap: number; volume?: number | undefined } | undefined {
  const inWindow = bars.filter((b) => b.t >= from - 60_000 && b.t <= to && Number.isFinite(b.c) && b.c > 0);
  if (!inWindow.length) return undefined;
  const twap = round(inWindow.reduce((s, b) => s + b.c, 0) / inWindow.length, 10);
  const withVol = inWindow.filter((b) => b.v !== undefined && b.v > 0);
  if (!withVol.length) return { twap };
  const volume = withVol.reduce((s, b) => s + b.v!, 0);
  const vwap = round(withVol.reduce((s, b) => s + b.c * b.v!, 0) / volume, 10);
  return { vwap, twap, volume: round(volume, 8) };
}

/** the analysis of an order's fills against its arrival, and against the market's bars over the time it worked where given */
export function tcaOf(o: { side: Side; arrival: number; arrivalAt: number; fills: readonly TcaFill[]; bars?: readonly Candle[] | undefined }): Tca | undefined {
  const fills = o.fills.filter((f) => f.qty > 0 && Number.isFinite(f.price) && f.price > 0);
  if (!fills.length || !(o.arrival > 0)) return undefined;
  const qty = round(fills.reduce((s, f) => s + f.qty, 0), 12);
  const notional = round(fills.reduce((s, f) => s + f.qty * f.price, 0), 8);
  const avg = round(notional / qty, 10);
  const fees = round(fills.reduce((s, f) => s + (f.feeUsd ?? 0), 0), 6);
  const last = Math.max(...fills.map((f) => f.at));
  const bench = o.bars ? benchmarksOf(o.bars, o.arrivalAt, last) : undefined;
  return {
    arrival: o.arrival,
    arrivalAt: o.arrivalAt,
    qty,
    avgPrice: avg,
    notionalUsd: round(notional, 2),
    feesUsd: fees,
    feeBps: notional > 0 ? round((fees / notional) * 10_000, 2) : 0,
    shortfallBps: costBps(o.side, avg, o.arrival),
    ...(bench?.vwap !== undefined ? { vwap: bench.vwap, vsVwapBps: costBps(o.side, avg, bench.vwap) } : {}),
    ...(bench ? { twap: bench.twap, vsTwapBps: costBps(o.side, avg, bench.twap) } : {}),
    ...(bench?.volume !== undefined && bench.volume > 0 ? { participation: round(Math.min(1, qty / bench.volume), 6) } : {}),
    spanMs: Math.max(0, last - o.arrivalAt),
    fills: fills.length,
  };
}

/** a twap's or a vwap's slices: `slices` sizes summing to `qty`, each a multiple of `step` (the last takes the remainder), weighted by
 * `weights` where given (a vwap: the market's volume at each slice's time of day), equal otherwise. A size under one step is folded into
 * the next, so no child is smaller than the market takes */
export function sliceSizes(qty: number, slices: number, step: number, weights?: readonly number[] | undefined): number[] {
  const n = Math.max(1, Math.floor(slices));
  const w = weights && weights.length === n && weights.every((x) => Number.isFinite(x) && x >= 0) && weights.some((x) => x > 0) ? weights : Array.from({ length: n }, () => 1);
  const total = w.reduce((s, x) => s + x, 0);
  const places = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step))));
  const floorTo = (x: number): number => Number((Math.floor(x / step + 1e-9) * step).toFixed(places));
  const sizes: number[] = [];
  let left = qty;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      sizes.push(Number(left.toFixed(places)));
      break;
    }
    const want = floorTo((qty * w[i]!) / total + carry);
    const size = Math.min(want, left);
    if (size < step - 1e-12) {
      carry = (qty * w[i]!) / total + carry;
      sizes.push(0);
      continue;
    }
    carry = 0;
    sizes.push(size);
    left = Number((left - size).toFixed(places));
  }
  return sizes;
}

/** a vwap's weights: the market's volume in each slice's stretch of the day, read from its 1-minute bars a day back (the same minutes of
 * the day before); equal where the bars carry no volume or do not cover the stretch */
export function vwapWeights(bars: readonly Candle[], startAt: number, minutes: number, slices: number): number[] | undefined {
  const dayAgo = startAt - 86_400_000;
  const each = (minutes * 60_000) / slices;
  const weights: number[] = [];
  for (let i = 0; i < slices; i++) {
    const from = dayAgo + i * each;
    const to = from + each;
    const v = bars.filter((b) => b.t >= from && b.t < to && b.v !== undefined && b.v > 0).reduce((s, b) => s + b.v!, 0);
    weights.push(v);
  }
  return weights.some((x) => x > 0) ? weights : undefined;
}
