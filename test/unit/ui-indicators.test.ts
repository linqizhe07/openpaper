import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Script, createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

/* ui/indicators.js: the arithmetic the chart lays over its candles — each indicator as its textbook says it, null until enough bars stand
   behind it; the list's string read and written; what inCompute says to draw. Pure: run in a bare vm, no page */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
function load() {
  const ctx = createContext({ console });
  new Script(readFileSync(`${UI}indicators.js`, "utf8"), { filename: "indicators.js" }).runInContext(ctx);
  return <T = unknown>(code: string): T => runInContext(code, ctx) as T;
}
const run = load();
const HOUR = 3_600_000;
/* ten bars whose closes rise and dip (10 11 13 12 15 14 16 18 17 20), each a point either side of its close, with volume */
const CLOSES = [10, 11, 13, 12, 15, 14, 16, 18, 17, 20];
const BARS = CLOSES.map((c, i) => ({ t: 1_700_000_000_000 + i * HOUR, o: c - 0.5, h: c + 1, l: c - 1, c, v: 100 + i }));
const near = (got: unknown, want: Array<number | null>, digits = 3) => {
  expect((got as unknown[]).length).toBe(want.length);
  (got as Array<number | null>).forEach((v, i) => (want[i] === null ? expect(v, `at ${i}`).toBeNull() : expect(v, `at ${i}`).toBeCloseTo(want[i]!, digits)));
};

describe("the moving averages and the bands", () => {
  it("SMA: the simple average of the last n closes, null until n stand; EMA: seeded with the first n's average, then α = 2 / (n + 1)", () => {
    near(run(`inSma(${JSON.stringify(CLOSES)}, 3)`), [null, null, 11.3333, 12, 13.3333, 13.6667, 15, 16, 17, 18.3333]);
    near(run(`inEma(${JSON.stringify(CLOSES)}, 3)`), [null, null, 11.3333, 11.6667, 13.3333, 13.6667, 14.8333, 16.4167, 16.7083, 18.3542]);
    // a hole in the values restarts the window
    near(run("inSma([1, 2, 3, null, 4, 5, 6], 3)"), [null, null, 2, null, null, null, 5]);
    expect(run("inSma([], 3)")).toEqual([]);
  });

  it("Bollinger: the average and k population standard deviations either side", () => {
    const b = run<{ mid: number[]; upper: number[]; lower: number[] }>(`inBollinger(${JSON.stringify(CLOSES)}, 3, 2)`);
    expect(b.mid[2]).toBeCloseTo(11.3333, 3);
    expect(b.upper[2]).toBeCloseTo(13.8278, 3);
    expect(b.lower[2]).toBeCloseTo(8.8389, 3);
    expect([b.mid[1], b.upper[1], b.lower[1]]).toEqual([null, null, null]);
    expect(b.upper[9]! - b.lower[9]!).toBeCloseTo(4 * Math.sqrt(((18 - 18.3333) ** 2 + (17 - 18.3333) ** 2 + (20 - 18.3333) ** 2) / 3), 3);
  });

  it("VWAP: the volume-weighted typical price from each day's first bar, in the market's own day; null without any volume", () => {
    const bars = [{ t: 0, h: 11, l: 9, c: 10, v: 10 }, { t: HOUR, h: 13, l: 11, c: 12, v: 30 }, { t: 25 * HOUR, h: 21, l: 19, c: 20, v: 5 }, { t: 26 * HOUR, h: 23, l: 21, c: 22, v: 0 }];
    const day = "(t) => Math.floor(t / 86400000)";
    // day one: 10 at 10, 12 at 30 → (100 + 360) / 40; day two starts again: 20, then a bar with no volume keeps the average where it was
    near(run(`inVwap(${JSON.stringify(bars)}, ${day})`), [10, 11.5, 20, 20]);
    expect(run(`inVwap(${JSON.stringify(bars.map((b) => ({ ...b, v: 0 })))}, ${day})`)).toEqual([null, null, null, null]);
  });
});

describe("the oscillators and the range", () => {
  it("RSI: Wilder's — the first average over n changes, then smoothed; 100 with no loss, 0 with no gain", () => {
    near(run(`inRsi(${JSON.stringify(CLOSES)}, 3)`), [null, null, null, 75, 88.2353, 69.7674, 81.4286, 88.2353, 69.2101, 84.3727]);
    near(run("inRsi([1, 2, 3, 4, 5], 3)"), [null, null, null, 100, 100]);
    near(run("inRsi([5, 4, 3, 2, 1], 3)"), [null, null, null, 0, 0]);
  });

  it("MACD: the fast EMA less the slow, the signal an EMA of that seeded where the line begins, the histogram the difference", () => {
    const m = run<{ macd: Array<number | null>; signal: Array<number | null>; hist: Array<number | null> }>(`inMacd(${JSON.stringify(CLOSES)}, 2, 3, 2)`);
    expect([m.macd.length, m.signal.length, m.hist.length]).toEqual([10, 10, 10]);
    expect([m.macd[0], m.macd[1], m.signal[2], m.hist[2]]).toEqual([null, null, null, null]);
    expect(m.macd[2]).toBeCloseTo(0.8333, 3);
    expect(m.macd[3]).toBeCloseTo(0.3889, 3);
    expect(m.signal[3]).toBeCloseTo(0.6111, 3);
    expect(m.hist[3]).toBeCloseTo(-0.2222, 3);
  });

  it("Stochastic: where the close sits in the last n bars' range, 0 to 100 (50 where the range is one price), %K smoothed over k and %D over d", () => {
    const raw = run<{ k: Array<number | null>; d: Array<number | null> }>(`inStoch(${JSON.stringify(BARS)}, 3, 1, 1)`);
    near(raw.k.slice(0, 5), [null, null, 80, 50, 80]);
    expect(raw.d).toEqual(raw.k);
    const smooth = run<{ k: Array<number | null>; d: Array<number | null> }>(`inStoch(${JSON.stringify(BARS)}, 3, 2, 2)`);
    expect(smooth.k[3]).toBeCloseTo(65, 6);
    expect(smooth.k[4]).toBeCloseTo(65, 6);
    expect(smooth.d[4]).toBeCloseTo(65, 6);
    for (const v of [...smooth.k, ...smooth.d]) if (v !== null) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
    const flat = run<{ k: Array<number | null> }>("inStoch([{ h: 5, l: 5, c: 5 }, { h: 5, l: 5, c: 5 }], 2, 1, 1)");
    expect(flat.k).toEqual([null, 50]);
  });

  it("ATR: Wilder's average of the true range (the bar's own, or its reach from the close before), the first simple over n bars", () => {
    near(run<Array<number | null>>(`inAtr(${JSON.stringify(BARS)}, 3)`).slice(0, 5), [null, null, 2.3333, 2.2222, 2.8148]);
  });
});

describe("the list's string, and what is drawn", () => {
  it("reads its own string back; drops what it does not know, a length out of range, a second of a kind, a MACD whose fast is not shorter; a parameter left out is its default; at most three under the price", () => {
    const all = "sma:20,ema:50,bb:20:2,vwap,rsi:14,macd:12:26:9,stoch:14:3:3,atr:14";
    expect(run(`inString(inParse(${JSON.stringify(all)}))`)).toBe("sma:20,ema:50,bb:20:2,vwap,rsi:14,macd:12:26:9,stoch:14:3:3");
    expect(run('inString(inParse("foo,sma:abc,sma:1,rsi:0,ema,bb:20:2.5,macd:26:12:9"))')).toBe("ema:50,bb:20:2.5");
    expect(run('inString(inParse("sma:20,sma:30, RSI:7 ,atr:14,macd:12:26:9,stoch:14:3:3"))')).toBe("sma:20,rsi:7,atr:14,macd:12:26:9");
    expect(run("inParse(undefined)")).toEqual([]);
    expect(run("inParse(123)")).toEqual([]);
    expect(run("inString(null)")).toBe("");
    expect(run('inParse("sma:20")')).toEqual([{ id: "sma", params: [20] }]);
    // one turned on with its defaults or its own figures, or off; the cap holds
    expect(run('inString(inWith(inParse("sma:20"), "rsi", true))')).toBe("sma:20,rsi:14");
    expect(run('inString(inWith(inParse("sma:20,rsi:14"), "sma", true, [50]))')).toBe("sma:50,rsi:14");
    expect(run('inString(inWith(inParse("sma:20,rsi:14"), "sma", true, [1]))')).toBe("rsi:14");
    expect(run('inString(inWith(inParse("bb:20:2"), "bb", true, [30]))')).toBe("bb:30:2");
    expect(run('inString(inWith(inParse("sma:20,rsi:14"), "rsi", false))')).toBe("sma:20");
    expect(run('inString(inWith(inParse("rsi:14,macd:12:26:9,stoch:14:3:3"), "atr", true))')).toBe("rsi:14,macd:12:26:9,stoch:14:3:3");
    expect(run('inString(inWith([], "nope", true))')).toBe("");
    expect(run('[inLabel({ id: "sma", params: [20] }), inLabel({ id: "bb", params: [20, 2] }), inLabel({ id: "macd", params: [12, 26, 9] }), inLabel({ id: "stoch", params: [14, 3, 3] }), inLabel({ id: "vwap", params: [] }), inLabel({ id: "x" })]')).toEqual(["SMA 20", "BB 20, 2", "MACD 12 26 9", "Stoch 14 3 3", "VWAP", ""]);
  });

  it("inCompute: each indicator's label, pane, series (name, colour class, how its figures are written), the pane's range and guides, the band's pair; VWAP's note where it cannot be read", () => {
    // (a fourth under the price, ATR, is past the cap: read on its own below)
    const outs = run<Array<Record<string, unknown>>>(`inCompute(${JSON.stringify(BARS)}, inParse("sma:3,bb:3:2,vwap,rsi:3,macd:2:3:2,stoch:3:1:1,atr:3"), { dayOf: (t) => Math.floor(t / 86400000), intraday: true })`);
    expect(outs.map((o) => [o.id, o.label, o.pane])).toEqual([["sma", "SMA 3", "over"], ["bb", "BB 3, 2", "over"], ["vwap", "VWAP", "over"], ["rsi", "RSI 3", "under"], ["macd", "MACD 2 3 2", "under"], ["stoch", "Stoch 3 1 1", "under"]]);
    const atr = run<Array<Record<string, unknown>>>(`inCompute(${JSON.stringify(BARS)}, inParse("atr:3"), {})`);
    const series = (id: string) => ((id === "atr" ? atr : outs).find((o) => o.id === id)!.series as Array<{ name: string; cls: string; fmt: string; kind?: string; values: Array<number | null> }>);
    expect(series("sma").map((s) => [s.name, s.cls, s.fmt])).toEqual([["SMA 3", "in-a", "price"]]);
    near(series("sma")[0]!.values, run(`inSma(${JSON.stringify(CLOSES)}, 3)`) as number[]);
    expect(series("bb").map((s) => s.name)).toEqual(["BB mid", "BB upper", "BB lower"]);
    expect(outs[1]!.band).toEqual([1, 2]);
    expect(series("vwap")[0]!.values[0]).toBeCloseTo((11 + 9 + 10) / 3, 6);
    expect([outs[3]!.range, outs[3]!.guides, outs[5]!.range, outs[5]!.guides, outs[4]!.guides]).toEqual([[0, 100], [30, 70], [0, 100], [20, 80], [0]]);
    expect(series("rsi")[0]!.fmt).toBe("plain");
    expect(series("macd").map((s) => [s.name, s.cls, s.kind ?? ""])).toEqual([["MACD", "in-a", ""], ["Signal", "in-b", ""], ["Hist", "in-hist", "bars"]]);
    expect(series("stoch").map((s) => s.name)).toEqual(["%K", "%D"]);
    expect(series("atr")[0]!.values[2]).toBeCloseTo(2.3333, 3);
    // VWAP on daily bars, or on bars without volume: no values, and why
    const daily = run<Array<Record<string, unknown>>>(`inCompute(${JSON.stringify(BARS)}, inParse("vwap"), { intraday: false })`);
    expect(daily[0]!.note).toBe("VWAP is read on intraday bars");
    expect((daily[0]!.series as Array<{ values: unknown[] }>)[0]!.values.every((v) => v === null)).toBe(true);
    const noVol = run<Array<Record<string, unknown>>>(`inCompute(${JSON.stringify(BARS.map((b) => ({ ...b, v: 0 })))}, inParse("vwap"), { intraday: true })`);
    expect(noVol[0]!.note).toBe("VWAP needs volume, which these bars do not carry");
    // nothing on, nothing drawn; junk in the list is skipped
    expect(run("inCompute([], [], {})")).toEqual([]);
    expect(run(`inCompute(${JSON.stringify(BARS)}, [{ id: "x" }, null], {})`)).toEqual([]);
  });
});
