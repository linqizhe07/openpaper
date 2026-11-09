import { describe, expect, it } from "vitest";
import { isRefusal } from "../../src/core/errors.ts";
import { analyticsOf, barsPerYear, beta, checkMarkets, comp, corr, hvg, seag, statsOf, type SeriesIn } from "../../src/portfolio/live/analytics.ts";
import type { Candle } from "../../src/portfolio/live/trade.ts";

/** ANALYTICS (live/analytics.ts): the arithmetic a terminal's COMP, CORR, HVG, BETA and SEAG do over the account's own bars, checked on
 * bars made to a known rule — a market whose returns are twice another's, a market missing days, a coin trading every day beside a share
 * that does not — and the view assembled with what was missing. Nothing leaves the process */
const DAY = 86_400_000;
const T0 = Date.parse("2025-01-01T00:00:00Z");
/** daily bars from a list of closes; weekends skipped where asked (a share) */
function bars(closes: number[], { weekdaysOnly = false, start = T0 } = {}): Candle[] {
  const out: Candle[] = [];
  let t = start;
  for (const c of closes) {
    while (weekdaysOnly && [0, 6].includes(new Date(t).getUTCDay())) t += DAY;
    out.push({ t, o: c, h: c, l: c, c });
    t += DAY;
  }
  return out;
}
const series = (key: string, candles: Candle[]): SeriesIn => ({ key, venue: key.split("|")[0]!, venueName: `Venue ${key.split("|")[0]}`, symbol: key.split("|")[1]!, interval: "1d", candles });
/** a walk with a seed, as closes */
function walk(n: number, seed: number, drift = 0, scale = 0.01): number[] {
  let x = seed;
  const out = [100];
  for (let i = 1; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const r = ((x / 2147483648) - 0.5) * 2 * scale + drift;
    out.push(out[i - 1]! * Math.exp(r));
  }
  return out;
}

describe("the arithmetic", () => {
  it("bars a year as observed: a coin's daily bars about 365, a share's about 261 (its weekdays), nothing from one bar", () => {
    expect(barsPerYear(bars(walk(400, 1)).map((b) => b.t))).toBe(365);
    expect(barsPerYear(bars(walk(300, 1), { weekdaysOnly: true }).map((b) => b.t))).toBeGreaterThanOrEqual(258);
    expect(barsPerYear(bars(walk(300, 1), { weekdaysOnly: true }).map((b) => b.t))).toBeLessThanOrEqual(264);
    expect(barsPerYear([T0])).toBe(0);
    expect(barsPerYear([])).toBe(0);
  });

  it("one market's figures: the total and annualised return, the annualised volatility, the deepest drawdown, the best and worst bar, the Sharpe of its own mean", () => {
    const closes = [100, 110, 99, 120, 108, 130];
    const s = statsOf(series("ex|X", bars(closes)));
    expect(s).toMatchObject({ key: "ex|X", bars: 6, barsPerYear: 365, totalReturnPct: 30, maxDrawdownPct: -10, bestBarPct: r(120 / 99 - 1), worstBarPct: -10 });
    expect(s.first).toBe("2025-01-01T00:00:00.000Z");
    expect(s.last).toBe("2025-01-06T00:00:00.000Z");
    expect(s.volatilityPct).toBeGreaterThan(100);
    expect(s.annualisedReturnPct).toBeGreaterThan(1000);
    expect(statsOf(series("ex|Y", bars([100])))).toMatchObject({ bars: 1, barsPerYear: 0 });
    expect(statsOf(series("ex|Y", bars([100])))).not.toHaveProperty("totalReturnPct");
    // a bar with no close, or a repeated time, is not counted
    expect(statsOf(series("ex|Z", [{ t: T0, o: 1, h: 1, l: 1, c: 100 }, { t: T0, o: 1, h: 1, l: 1, c: 105 }, { t: T0 + DAY, o: 1, h: 1, l: 1, c: NaN }, { t: T0 + 2 * DAY, o: 1, h: 1, l: 1, c: 110 }])).bars).toBe(2);
  });

  it("the comparison: every market rebased to 100 at the first bar all of them have, a market missing a day carrying null there; the correlation of returns over the bars each pair shares, one on the diagonal, none under ten; a market whose returns are twice another's has a beta of 2, a correlation of 1 and no alpha", () => {
    const a = walk(120, 7);
    const twice = a.map((c, i) => (i ? a[0]! * Math.exp(2 * Math.log(c / a[0]!)) : c));
    const late = bars(a.slice(5), { start: T0 + 5 * DAY });
    const A = series("ex|A", bars(a));
    const B = series("ex|B", bars(twice));
    const L = series("ex|L", late);
    const v = comp([A, B, L]);
    expect(v.t[0]).toBe(T0 + 5 * DAY);
    expect(v.t).toHaveLength(115);
    expect(v.rebased["ex|A"]![0]).toBe(100);
    expect(v.rebased["ex|L"]![0]).toBe(100);
    expect(v.rebased["ex|A"]!.at(-1)).toBe(Math.round((a[119]! / a[5]!) * 100 * 100) / 100);
    expect(v.stats.map((s) => s.key)).toEqual(["ex|A", "ex|B", "ex|L"]);
    // a market missing a day in the middle
    const gappy = series("ex|G", bars(a).filter((_, i) => i !== 50));
    const g = comp([A, gappy]);
    expect(g.t).toHaveLength(120);
    expect(g.rebased["ex|G"]![50]).toBeNull();
    expect(g.rebased["ex|G"]![51]).not.toBeNull();
    const c = corr([A, B, L]);
    expect(c.keys).toEqual(["ex|A", "ex|B", "ex|L"]);
    expect(c.matrix[0]![0]).toBe(1);
    expect(c.matrix[0]![1]).toBe(1);
    expect(c.matrix[1]![0]).toBe(1);
    expect(c.matrix[0]![2]).toBe(1);
    expect(c.bars[0]![1]).toBe(119);
    expect(c.bars[0]![2]).toBe(114);
    const few = corr([A, series("ex|F", bars(a.slice(0, 8)))]);
    expect(few.matrix[0]![1]).toBeNull();
    expect(few.bars[0]![1]).toBe(7);
    const b = beta([A, B, L]);
    expect(b.map((x) => x.key)).toEqual(["ex|B", "ex|L"]);
    expect(b[0]).toMatchObject({ against: "ex|A", bars: 119, beta: 2, correlation: 1, r2: 1 });
    expect(Math.abs(b[0]!.alphaPct!)).toBeLessThan(0.01);
    expect(b[1]).toMatchObject({ beta: 1, correlation: 1, bars: 114 });
    expect(beta([A])).toEqual([]);
    expect(beta([A, series("ex|F", bars(a.slice(0, 8)))])[0]).toEqual({ key: "ex|F", against: "ex|A", bars: 7 });
    // an opposite market: beta −1
    const mirror = a.map((c, i) => (i ? a[0]! * Math.exp(-Math.log(c / a[0]!)) : c));
    expect(beta([A, series("ex|M", bars(mirror))])[0]).toMatchObject({ beta: -1, correlation: -1 });
  });

  it("historical volatility: the rolling 20 and 60 bar windows annualised, null until the window is full, where it stands now against its range; a flat market has none", () => {
    const A = series("ex|A", bars(walk(100, 3)));
    const h = hvg([A]);
    expect(h.windows).toEqual([20, 60]);
    const s = h.series["ex|A"]!;
    expect(s.t).toHaveLength(99);
    expect(s.hv["20"]!.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(s.hv["20"]![19]).not.toBeNull();
    expect(s.hv["60"]![58]).toBeNull();
    expect(s.hv["60"]![59]).toBeGreaterThan(0);
    expect(s.now!["20"]).toBe(s.hv["20"]!.at(-1));
    expect(s.low!["20"]).toBeLessThanOrEqual(s.now!["20"]!);
    expect(s.high!["20"]).toBeGreaterThanOrEqual(s.now!["20"]!);
    const flat = hvg([series("ex|F", bars(Array(30).fill(100)))]);
    expect(flat.series["ex|F"]!.hv["20"]![28]).toBe(0);
  });

  it("seasonality: each calendar month's bars compounded and averaged over the years seen, with how many were up; each weekday's average bar; a share with no weekend bars shows none", () => {
    // two years of daily bars: every January up 1% a day, every other month flat
    const closes: number[] = [100];
    let t = T0;
    const times: number[] = [T0];
    for (let i = 1; i < 730; i++) {
      t += DAY;
      const up = new Date(t).getUTCMonth() === 0 ? 0.01 : 0;
      closes.push(closes[i - 1]! * Math.exp(up));
      times.push(t);
    }
    const S = series("ex|S", closes.map((c, i) => ({ t: times[i]!, o: c, h: c, l: c, c })));
    const v = seag([S]);
    expect(v.months.map((m) => m.month)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    const jan = v.months[0]!.by["ex|S"]!;
    expect(jan.years).toBe(2);
    expect(jan.upYears).toBe(2);
    expect(jan.avgPct).toBeGreaterThan(30);
    expect(v.months[1]!.by["ex|S"]).toEqual({ avgPct: 0, years: 2, upYears: 0 });
    expect(v.weekdays.map((w) => w.day)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    const share = seag([series("b|SH", bars(walk(60, 5), { weekdaysOnly: true }))]);
    expect(share.weekdays.map((w) => w.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(share.weekdays[0]!.by["b|SH"]!.n).toBeGreaterThan(5);
  });

  it("what is asked, checked: markets as venue|symbol apart by commas or as a list, no repeats, eight at most, the venue by its id; the view assembled with the markets that gave bars and the ones that did not named", () => {
    expect(checkMarkets("ex|BTC/USDT, broker|AAPL,ex|BTC/USDT")).toEqual([{ venue: "ex", symbol: "BTC/USDT", key: "ex|BTC/USDT" }, { venue: "broker", symbol: "AAPL", key: "broker|AAPL" }]);
    expect(checkMarkets(["ex|ETH/USDT"])).toEqual([{ venue: "ex", symbol: "ETH/USDT", key: "ex|ETH/USDT" }]);
    for (const bad of ["", "AAPL", "Ex|AAPL", "ex|", "|AAPL", Array.from({ length: 9 }, (_, i) => `ex|M${i}`).join(","), 42]) {
      const r = checkMarkets(bad);
      expect(isRefusal(r), String(bad)).toBe(true);
    }
    const a = walk(50, 9);
    const v = analyticsOf([series("ex|A", bars(a)), series("ex|B", bars(a.map((c) => c * 2))), series("ex|N", [])], [{ key: "x|Y", why: "Venue x lists no Y", code: "E_VENUE_REJECTED" }], "1d", "1Y", T0);
    expect(v.markets.map((m) => m.key)).toEqual(["ex|A", "ex|B"]);
    expect(v.comp.stats).toHaveLength(2);
    expect(v.corr.matrix[0]![1]).toBe(1);
    expect(v.beta[0]!.beta).toBe(1);
    expect(v.missing).toEqual([{ key: "x|Y", why: "Venue x lists no Y", code: "E_VENUE_REJECTED" }, { key: "ex|N", why: "Venue ex gave no bars for N over this range" }]);
    expect(v.notes).toHaveLength(3);
    expect(v).toMatchObject({ asOf: "2025-01-01T00:00:00.000Z", interval: "1d", range: "1Y" });
  });
});
const r = (x: number) => Math.round(x * 100 * 100) / 100;
