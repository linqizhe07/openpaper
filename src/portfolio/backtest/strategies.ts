/** THE STRATEGIES A BACKTEST RUNS: built in, each named by an id and a few numbers (StrategySpec) — never code. An agent asking for a
 * backtest over MCP names one of these and its parameters, each held to its bounds, so nothing it sends is ever run as a program.
 *
 * A strategy sees what a trader would have seen at the clock (StrategyView): the bars that had CLOSED, the funding paid so far, what is held,
 * the equity — never the bar under way. It answers with WEIGHTS: each market's notional over the equity, signed for a perpetual (a short is
 * negative), from 0 up for a coin or a share (they are bought and sold, never shorted), or nothing, to leave the book as it is. The engine
 * turns weights into the paper account's own market orders at the bar's open (backtest/engine.ts).
 *
 *   hold    every market bought at the first bar in equal parts and held: the benchmark every run is read against
 *   sma     the moving-average cross: long while the fast average of the closes is above the slow one; below, a perpetual short and a coin or
 *           a share sold. It trades only when the cross does
 *   tsmom   time-series momentum (Moskowitz, Ooi and Pedersen 2012): each market long when its return over the lookback is up, a perpetual
 *           short when down, each sized to its share of a volatility target from its own recent volatility (Carver's scaling; the markets'
 *           correlation is left out, said in the report). Rebalanced every `rebalanceHours`
 *   carry   funding carry: for a coin whose perpetual and spot are both in the run, long the spot and short the perpetual in equal dollars
 *           while the perpetual's funding over the lookback pays more than `enterApr` a year (the shorts are paid when funding is positive),
 *           back to flat when it falls under `exitApr`. Price moves cancel between the two legs; what is left is the funding, less the fees
 *           and the spread of four trades a round */
import type { Candle } from "../live/trade.ts";
import type { BacktestMarket } from "./source.ts";

export type StrategyId = "hold" | "sma" | "tsmom" | "carry";
export interface StrategySpec {
  id: StrategyId;
  params: Record<string, number>;
}

export interface StrategyView {
  now: number;
  markets: readonly BacktestMarket[];
  /** how many of the market's bars have closed by now */
  count(symbol: string): number;
  /** the last `k` bars that closed by now, oldest first (fewer where fewer have) */
  last(symbol: string, k: number): readonly Candle[];
  /** a perpetual's rates paid after `since` and by now, oldest first */
  funding(symbol: string, since: number): ReadonlyArray<{ at: number; rate: number }>;
  /** what is held, signed: a long or a holding positive, a short negative (base units) */
  held(symbol: string): number;
  equityUsd: number;
}
/** each market's weight (its notional over the equity), or undefined: nothing changes */
export type Weights = Record<string, number> | undefined;

export interface Strategy {
  spec: StrategySpec;
  name: string;
  /** the decision itself, in a sentence with its numbers */
  words: string;
  /** how much history it reads before its first decision, ms (the run loads that much before its start) */
  warmupMs: number;
  /** the leverage a perpetual is set to when the run names none: what its weights can need at most, so the margins it puts up together stay
   * inside the equity — a market held at one times its notional (hold) is never liquidated */
  leverage(markets: readonly BacktestMarket[]): number;
  decide(v: StrategyView): Weights;
}

interface ParamDef {
  default: number;
  min: number;
  max: number;
  integer?: true;
  words: string;
}
export interface StrategyDef {
  name: string;
  words: string;
  params: Record<string, ParamDef>;
}
export const STRATEGIES: Readonly<Record<StrategyId, StrategyDef>> = {
  hold: { name: "Buy and hold", words: "every market bought at the first bar in equal parts and held", params: {} },
  sma: {
    name: "Moving-average cross",
    words: "long while the fast average of the closes is above the slow one; below, a perpetual short and a coin or a share sold",
    params: {
      fast: { default: 20, min: 2, max: 500, integer: true, words: "bars in the fast average" },
      slow: { default: 100, min: 3, max: 2000, integer: true, words: "bars in the slow average" },
      weight: { default: 1, min: 0.05, max: 3, words: "the whole run's weight, shared equally by the markets" },
    },
  },
  tsmom: {
    name: "Time-series momentum",
    words: "each market long when its return over the lookback is up, a perpetual short when it is down, sized to a volatility target",
    params: {
      lookbackDays: { default: 30, min: 1, max: 365, words: "days the return is measured over" },
      volTarget: { default: 0.2, min: 0.02, max: 1, words: "the yearly volatility the whole run aims at (0.2: 20%)" },
      volDays: { default: 30, min: 3, max: 365, words: "days the volatility is measured over" },
      rebalanceHours: { default: 24, min: 1, max: 720, words: "hours between rebalances" },
      maxWeight: { default: 1.5, min: 0.1, max: 5, words: "the most any one market may weigh" },
      buffer: { default: 0.1, min: 0, max: 1, words: "a market is traded only when its weight is this far from its target, as a share of the target (Carver's buffer)" },
    },
  },
  carry: {
    name: "Funding carry",
    words: "long the spot and short the perpetual of a coin in equal dollars while the perpetual's funding pays more than a threshold a year",
    params: {
      lookbackHours: { default: 72, min: 1, max: 2160, integer: true, words: "hours of funding averaged" },
      enterApr: { default: 0.1, min: 0, max: 5, words: "the yearly funding rate that opens the carry (0.1: 10%)" },
      exitApr: { default: 0.02, min: -1, max: 5, words: "the yearly funding rate under which it closes" },
      weight: { default: 0.5, min: 0.05, max: 2, words: "each leg's weight, shared equally by the coins carried" },
    },
  },
};
export const STRATEGY_IDS = Object.keys(STRATEGIES) as StrategyId[];

const YEAR_MS = 365 * 86_400_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** a spec checked: an id the account knows and every parameter inside its bounds (absent ones take their defaults); or why not */
export function strategySpec(id: string, params: Record<string, unknown> = {}): StrategySpec | string {
  const def = (STRATEGIES as Record<string, StrategyDef | undefined>)[id];
  if (!def) return `a strategy is one of ${STRATEGY_IDS.join(", ")}, not "${String(id).slice(0, 30)}"`;
  const out: Record<string, number> = {};
  for (const k of Object.keys(params)) if (!(k in def.params)) return `${id} takes ${Object.keys(def.params).join(", ") || "no parameter"}, not "${k.slice(0, 30)}"`;
  for (const [k, p] of Object.entries(def.params)) {
    const raw = params[k];
    const v = raw === undefined ? p.default : typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
    if (!Number.isFinite(v)) return `${id}'s ${k} is a number`;
    if (v < p.min || v > p.max) return `${id}'s ${k} is ${p.min} to ${p.max} (${p.words}), not ${v}`;
    if (p.integer && !Number.isInteger(v)) return `${id}'s ${k} is a whole number`;
    out[k] = v;
  }
  if (id === "sma" && !(out.fast! < out.slow!)) return "sma's fast average is shorter than its slow one";
  if (id === "carry" && !(out.exitApr! <= out.enterApr!)) return "carry's exitApr is at most its enterApr";
  return { id: id as StrategyId, params: out };
}

/** a spec's parameters in words: "fast 20 · slow 100 · weight 1" */
export const paramWords = (s: StrategySpec): string => Object.entries(s.params).map(([k, v]) => `${k} ${v}`).join(" · ") || "no parameters";

const closes = (bars: readonly Candle[], n: number): number[] => bars.slice(Math.max(0, bars.length - n)).map((b) => b.c);
const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
/** the standard deviation of the log returns of the last `n` closes, a year's worth of them by `perYear` bars */
function yearlyVol(bars: readonly Candle[], n: number, perYear: number): number | undefined {
  const c = closes(bars, n + 1);
  if (c.length < 3) return undefined;
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1]! > 0 && c[i]! > 0) r.push(Math.log(c[i]! / c[i - 1]!));
  if (r.length < 2) return undefined;
  const m = mean(r);
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
  return sd * Math.sqrt(perYear);
}
/** the bars a market closes in a year: its own (BacktestMarket.perYear), else 24/7 at its size */
export const perYearOf = (m: BacktestMarket): number => m.perYear ?? YEAR_MS / intervalMs(m);
const intervalMs = (m: BacktestMarket): number => ({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": DAY_MS, "1w": 7 * DAY_MS })[m.interval];
/** how many of a market's bars span `ms` */
const barsIn = (m: BacktestMarket, ms: number): number => Math.max(1, Math.round((ms / YEAR_MS) * perYearOf(m)));

/** a strategy, made from a checked spec: a fresh one for each run (some keep what they decided last) */
export function makeStrategy(spec: StrategySpec): Strategy {
  const def = STRATEGIES[spec.id];
  const p = spec.params;
  switch (spec.id) {
    case "hold": {
      let bought = false;
      return {
        spec,
        name: def.name,
        words: "every market bought at the first bar in equal parts, then held",
        warmupMs: 0,
        leverage: () => 1,
        decide: (v) => {
          if (bought) return undefined;
          bought = true;
          // a hair under the whole equity: the fee is paid out of the cash too
          const w = 0.99 / Math.max(1, v.markets.length);
          return Object.fromEntries(v.markets.map((m) => [m.symbol, w]));
        },
      };
    }
    case "sma": {
      const last = new Map<string, number>();
      const fast = p.fast!;
      const slow = p.slow!;
      return {
        spec,
        name: def.name,
        words: `long while the ${fast}-bar average of the closes is above the ${slow}-bar one; below, a perpetual short and a coin or a share sold; ${p.weight} of the equity shared by the markets`,
        warmupMs: 0,
        leverage: () => Math.max(1, Math.ceil(p.weight! * 1.25)),
        decide: (v) => {
          const share = p.weight! / Math.max(1, v.markets.length);
          let changed = false;
          const out: Record<string, number> = {};
          for (const m of v.markets) {
            const bars = v.last(m.symbol, slow);
            if (bars.length < slow) continue;
            const f = mean(closes(bars, fast));
            const s = mean(closes(bars, slow));
            const signal = f > s ? 1 : m.kind === "perp" ? -1 : 0;
            if (last.get(m.symbol) !== signal) changed = true;
            last.set(m.symbol, signal);
            out[m.symbol] = signal * share;
          }
          return changed ? out : undefined;
        },
      };
    }
    case "tsmom": {
      let lastAt = Number.NEGATIVE_INFINITY;
      const every = p.rebalanceHours! * HOUR_MS;
      return {
        spec,
        name: def.name,
        words: `each market long when its ${p.lookbackDays}-day return is up, a perpetual short when down, sized to its share of a ${Math.round(p.volTarget! * 100)}% yearly volatility target from its ${p.volDays}-day volatility, at most ${p.maxWeight} a market, looked at every ${p.rebalanceHours} h and traded where it is more than ${Math.round(p.buffer! * 100)}% off its target`,
        warmupMs: Math.max(p.lookbackDays!, p.volDays!) * DAY_MS,
        leverage: (markets) => Math.max(1, Math.min(10, Math.ceil(p.maxWeight! * markets.length * 1.25))),
        decide: (v) => {
          if (v.now - lastAt < every - 1) return undefined;
          lastAt = v.now;
          const share = p.volTarget! / Math.sqrt(Math.max(1, v.markets.length));
          const lev = Math.max(1, Math.min(10, Math.ceil(p.maxWeight! * v.markets.length * 1.25)));
          const targets: Array<{ m: BacktestMarket; target: number; last: number }> = [];
          for (const m of v.markets) {
            const look = barsIn(m, p.lookbackDays! * DAY_MS);
            const volBars = barsIn(m, p.volDays! * DAY_MS);
            const bars = v.last(m.symbol, Math.max(look, volBars) + 1);
            const last = bars[bars.length - 1]?.c ?? 0;
            // its return and its volatility over the whole of their windows, or nothing yet
            if (bars.length <= Math.max(look, volBars)) {
              targets.push({ m, target: 0, last });
              continue;
            }
            const then = bars[bars.length - 1 - look]!.c;
            const up = last > then ? 1 : last < then ? -1 : 0;
            const signal = m.kind === "perp" ? up : Math.max(0, up);
            const vol = yearlyVol(bars, volBars, perYearOf(m));
            targets.push({ m, target: !vol || !signal ? 0 : Math.max(-p.maxWeight!, Math.min(p.maxWeight!, (signal * share) / vol)), last });
          }
          // what the account can hold: a coin or a share paid in full, a perpetual's margin at the leverage — targets past it are scaled down
          // together, so the buffer below compares what is held with a target that can be reached
          const need = targets.reduce((s, x) => s + (x.m.kind === "perp" ? Math.abs(x.target) / lev : Math.max(0, x.target)), 0);
          const k = need > 0.95 ? 0.95 / need : 1;
          const out: Record<string, number> = {};
          for (const { m, target: raw, last } of targets) {
            const target = raw * k;
            // the weight held now, at the last close: a market close enough to its target is left as it is (the buffer)
            const now0 = v.equityUsd > 0 ? (v.held(m.symbol) * last) / v.equityUsd : 0;
            if (target === 0 ? now0 === 0 : Math.sign(target) === Math.sign(now0) && Math.abs(target - now0) <= p.buffer! * Math.abs(target)) continue;
            out[m.symbol] = target;
          }
          return Object.keys(out).length ? out : undefined;
        },
      };
    }
    case "carry": {
      const carrying = new Map<string, boolean>();
      return {
        spec,
        name: def.name,
        words: `long the spot and short the perpetual of a coin, ${p.weight} of the equity a leg shared by the coins, while the perpetual's funding over ${p.lookbackHours} h pays more than ${(p.enterApr! * 100).toFixed(1)}% a year; flat again under ${(p.exitApr! * 100).toFixed(1)}%`,
        warmupMs: p.lookbackHours! * HOUR_MS,
        // the spot leg is paid in cash and the perpetual's margin put up beside it: at 2x the two together are 1.5 times the leg
        leverage: () => 2,
        decide: (v) => {
          const pairs = carryPairs(v.markets);
          if (!pairs.length) return undefined;
          let changed = false;
          const out: Record<string, number> = {};
          const share = p.weight! / pairs.length;
          for (const { base, spot, perp } of pairs) {
            const every = perp.fundingEveryH ?? 1;
            const rates = v.funding(perp.symbol, v.now - p.lookbackHours! * HOUR_MS);
            // the funding of the whole window, or nothing yet: a print an hour (or each `every` hours) over the lookback
            const apr = rates.length >= Math.max(1, Math.floor(p.lookbackHours! / every)) ? mean(rates.map((f) => f.rate)) * (8760 / every) : undefined;
            const was = carrying.get(base) ?? false;
            const now = apr === undefined ? false : was ? apr > p.exitApr! : apr > p.enterApr!;
            if (now !== was) changed = true;
            carrying.set(base, now);
            out[spot.symbol] = now ? share : 0;
            out[perp.symbol] = now ? -share : 0;
          }
          return changed ? out : undefined;
        },
      };
    }
  }
}

/** the coins a carry can be built on: a perpetual and a spot of the same base in the run */
export function carryPairs(markets: readonly BacktestMarket[]): Array<{ base: string; spot: BacktestMarket; perp: BacktestMarket }> {
  const out: Array<{ base: string; spot: BacktestMarket; perp: BacktestMarket }> = [];
  for (const perp of markets.filter((m) => m.kind === "perp")) {
    const spot = markets.find((m) => m.kind === "spot" && m.base.toUpperCase() === perp.base.toUpperCase());
    if (spot) out.push({ base: perp.base.toUpperCase(), spot, perp });
  }
  return out;
}
