import { describe, expect, it } from "vitest";
import { riskOf } from "../../src/portfolio/live/risk.ts";
import type { Candle } from "../../src/portfolio/live/trade.ts";

/** PORTFOLIO RISK (live/risk.ts): the arithmetic over a small portfolio made to a known rule — a long, a short, cash, a line with no
 * bars — its exposure, concentration, each line's volatility and share of the whole, the value at risk read off the portfolio's own days,
 * the beta to a benchmark, the net worth's drawdown, the stresses. Nothing leaves the process */
const DAY = 86_400_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");
function bars(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ t: T0 + i * DAY, o: c, h: c, l: c, c }));
}
function walk(n: number, seed: number, scale = 0.02): number[] {
  let x = seed;
  const out = [100];
  for (let i = 1; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(out[i - 1]! * Math.exp(((x / 2147483648) - 0.5) * 2 * scale));
  }
  return out;
}
const A = walk(120, 3);
const B = walk(120, 11);
const DOUBLE = A.map((c, i) => (i ? A[0]! * Math.exp(2 * Math.log(c / A[0]!)) : c));

describe("the portfolio's risk", () => {
  const lines = [
    { key: "crypto:BTC", name: "BTC", class: "crypto", usd: 6000, venue: "ex", venueName: "Exchange", candles: bars(A) },
    { key: "equity:AAPL", name: "AAPL", class: "equity", usd: 3000, venue: "broker", venueName: "Broker", candles: bars(B) },
    { key: "perp:ex|ETH/USDT:USDT", name: "ETH perp short", class: "perp", usd: -1000, venue: "ex", venueName: "Exchange", candles: bars(DOUBLE), leverage: 5 },
    { key: "cash:USD", name: "USD", class: "cash", usd: 2000, venue: "broker", venueName: "Broker" },
    { key: "rwa:XYZ", name: "XYZ token", class: "rwa", usd: 500, venue: "wallet", venueName: "Wallet", candles: bars([1, 1.1]) },
  ];
  const history = [{ at: "2026-01-01T00:00:00.000Z", usd: 10000 }, { at: "2026-02-01T00:00:00.000Z", usd: 12000 }, { at: "2026-03-01T00:00:00.000Z", usd: 9000 }, { at: "2026-04-01T00:00:00.000Z", usd: 11500 }];
  const v = riskOf(lines, [{ key: "stock:SPY", name: "SPY", candles: bars(A) }, { key: "coin:BTC", name: "BTC", candles: bars(B.slice(0, 5)) }], history, T0 + 200 * DAY);

  it("the exposure: net, gross, long and short; each line's weight of the gross, a short's negative, the largest first; by class and by venue; the concentration", () => {
    expect([v.netUsd, v.grossUsd, v.longUsd, v.shortUsd]).toEqual([10500, 12500, 11500, -1000]);
    expect(v.lines.map((l) => [l.key, l.usd, l.weightPct])).toEqual([["crypto:BTC", 6000, 48], ["equity:AAPL", 3000, 24], ["cash:USD", 2000, 16], ["perp:ex|ETH/USDT:USDT", -1000, -8], ["rwa:XYZ", 500, 4]]);
    expect(v.lines[3]).toMatchObject({ leverage: 5, venue: "ex", venueName: "Exchange", bars: 120 });
    expect(v.byClass).toEqual([{ name: "crypto", usd: 6000, weightPct: 48, lines: 1 }, { name: "equity", usd: 3000, weightPct: 24, lines: 1 }, { name: "cash", usd: 2000, weightPct: 16, lines: 1 }, { name: "perp", usd: -1000, weightPct: -8, lines: 1 }, { name: "rwa", usd: 500, weightPct: 4, lines: 1 }]);
    expect(v.byVenue).toEqual([{ venue: "ex", venueName: "Exchange", usd: 5000, weightPct: 40, lines: 2 }, { venue: "broker", venueName: "Broker", usd: 5000, weightPct: 40, lines: 2 }, { venue: "wallet", venueName: "Wallet", usd: 500, weightPct: 4, lines: 1 }]);
    expect(v.concentration).toEqual({ top1Pct: 48, top3Pct: 88, hhi: 0.3216, effective: 3.11 });
    expect(v.unpriced).toEqual([{ key: "cash:USD", name: "USD", usd: 2000, why: "cash: no market price moves it" }, { key: "rwa:XYZ", name: "XYZ token", usd: 500, why: "too few bars (ten days at least)" }]);
  });

  it("each priced line's volatility and share of the portfolio's variance (the shares adding up to the priced whole), its own VaR; the portfolio's days, volatility, historical and normal VaR, expected shortfall, worst and best day, the recent strip", () => {
    const btc = v.lines.find((l) => l.key === "crypto:BTC")!;
    expect(btc.volatilityPct).toBeGreaterThan(10);
    expect(btc.var95Usd).toBeGreaterThan(0);
    expect(btc.var95Usd).toBeLessThan(600);
    expect(v.lines.find((l) => l.key === "cash:USD")!.volatilityPct).toBeUndefined();
    const shares = v.lines.map((l) => l.riskContributionPct).filter((x): x is number => x !== undefined);
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    const p = v.portfolio;
    expect(p.days).toBe(119);
    expect(p.pricedPct).toBe(80);
    expect(p.volatilityPct).toBeGreaterThan(5);
    expect(p.var95Usd).toBeGreaterThan(0);
    expect(p.var99Usd).toBeGreaterThanOrEqual(p.var95Usd!);
    expect(p.var95Pct).toBeCloseTo((p.var95Usd! / 12500) * 100, 1);
    expect(p.normalVar95Usd).toBeGreaterThan(0);
    expect(p.normalVar99Usd).toBeGreaterThan(p.normalVar95Usd!);
    expect(p.es95Usd).toBeGreaterThanOrEqual(p.var95Usd!);
    expect(p.worstDayPct).toBeLessThan(0);
    expect(p.bestDayPct).toBeGreaterThan(0);
    expect(p.worstDay).toMatch(/^2026-/);
    expect(p.recent).toHaveLength(90);
    expect(p.recent[89]!.t).toBe(T0 + 119 * DAY);
  });

  it("the betas: the portfolio on a benchmark over the days both have, none under ten; the drawdown from each peak the net worth saw; the stresses on every priced line and on each class", () => {
    expect(v.benchmarks[0]!.key).toBe("stock:SPY");
    expect(v.benchmarks[0]!.days).toBe(119);
    expect(v.benchmarks[0]!.beta).toBeGreaterThan(0);
    expect(v.benchmarks[0]!.correlation).toBeGreaterThan(0);
    expect(v.benchmarks[1]).toEqual({ key: "coin:BTC", name: "BTC", days: 4 });
    expect(v.drawdown).toEqual({ points: 4, maxPct: -25, maxFrom: "2026-02-01T00:00:00.000Z", maxTo: "2026-03-01T00:00:00.000Z", currentPct: -4.17, peakUsd: 12000, peakAt: "2026-02-01T00:00:00.000Z" });
    expect(v.stress.slice(0, 3)).toEqual([{ name: "Everything priced -5%", movePct: -5, usd: -425, pct: -3.4 }, { name: "Everything priced -10%", movePct: -10, usd: -850, pct: -6.8 }, { name: "Everything priced -20%", movePct: -20, usd: -1700, pct: -13.6 }]);
    expect(v.stress.find((s) => s.class === "crypto")).toEqual({ name: "crypto -30%", movePct: -30, class: "crypto", usd: -1800, pct: -14.4 });
    expect(v.stress.find((s) => s.class === "perp")).toEqual({ name: "perp -30%", movePct: -30, class: "perp", usd: 300, pct: 2.4 });
    expect(v.stress.find((s) => s.class === "equity")).toEqual({ name: "equity -10%", movePct: -10, class: "equity", usd: -300, pct: -2.4 });
    expect(v.notes).toHaveLength(3);
  });

  it("an empty account, and one with cash alone: the exposure said, no volatility, no VaR, no betas", () => {
    const e = riskOf([], [], [], T0);
    expect(e).toMatchObject({ netUsd: 0, grossUsd: 0, lines: [], byClass: [], concentration: {}, portfolio: { days: 0, pricedPct: 0, recent: [] }, benchmarks: [], drawdown: { points: 0 }, stress: [{ name: "Everything priced -5%", usd: 0, pct: 0 }, { name: "Everything priced -10%", usd: 0, pct: 0 }, { name: "Everything priced -20%", usd: 0, pct: 0 }] });
    const c = riskOf([{ key: "cash:USD", name: "USD", class: "cash", usd: 1000 }], [{ key: "stock:SPY", name: "SPY", candles: bars(A) }], [], T0);
    expect(c.lines[0]).toMatchObject({ weightPct: 100, bars: 0 });
    expect(c.portfolio.volatilityPct).toBeUndefined();
    expect(c.portfolio.var95Usd).toBeUndefined();
    expect(c.benchmarks[0]).toEqual({ key: "stock:SPY", name: "SPY", days: 0 });
    expect(c.unpriced[0]!.why).toBe("cash: no market price moves it");
  });
});
