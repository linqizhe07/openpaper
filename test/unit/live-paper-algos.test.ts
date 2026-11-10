import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { paperSource } from "../../src/portfolio/live/paper.ts";
import type { Listing, PublicSource } from "../../src/portfolio/live/public-markets.ts";
import { algoText, parseAlgo, type Candle, type LiveTrader, type Market, type OrderRequest, type OrderState } from "../../src/portfolio/live/trade.ts";
import { benchmarksOf, costBps, sliceSizes, tcaOf, vwapWeights, type Tca } from "../../src/portfolio/live/tca.ts";

/** WORKED ORDERS ON THE PAPER ACCOUNT (live/paper.ts advanceAlgo; live/tca.ts): a twap cut into slices over time, a vwap's slices sized by
 * the market's volume a day back, an iceberg shown a part at a time — one parent order with one ref, its children on the book, its fill its
 * children's, what the whole needs held by the parent alone, canceled with its open child — and the transaction-cost analysis written on
 * the parent as it fills: the arrival, the average, the shortfall and the cost against the market's own averages, in basis points */
const NOW = 1791484300000;
const MIN = 60_000;
let now = NOW;
const clock = () => now;
let n = 0;
const clientId = () => (++n).toString(16).padStart(32, "0");
type Row = Listing & { price: number; bid: number; ask: number };
const row = (symbol: string, price: number, extra: Partial<Row> = {}): Row => ({ symbol, name: `${symbol} market`, kind: "spot", base: symbol.split("/")[0]!, quote: "USD", price, bid: price - price * 0.0002, ask: price + price * 0.0002, open: true, types: [], volumeUsd24h: 2e9, changePct24h: 1.2, qtyStep: 0.000001, ...extra });
function source(rows: Row[], extra: Partial<PublicSource> = {}): PublicSource & { rows: Row[] } {
  return {
    id: "coinbase",
    name: "Coinbase",
    kind: "exchange",
    connectTo: "coinbase",
    connector: "live:exchange:coinbase",
    rows,
    async listings(o) {
      const Q = (o.q ?? "").trim().toUpperCase();
      return (Q ? rows.filter((m) => m.symbol.toUpperCase().includes(Q) || m.base.toUpperCase().includes(Q)) : rows).slice(0, o.limit).map((m) => ({ ...m }));
    },
    ...extra,
  };
}
const reprice = (s: { rows: Row[] }, symbol: string, price: number, spread = 0.0002) => {
  const m = s.rows.find((x) => x.symbol === symbol)!;
  m.price = price;
  m.bid = price - price * spread;
  m.ask = price + price * spread;
};
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const ok = <T>(x: T | Refusal): T => {
  if (isRefusal(x)) throw new Error(`expected an answer, got ${x.code}: ${x.message}`);
  return x;
};
const refusal = (x: unknown): Refusal => {
  if (!isRefusal(x)) throw new Error(`expected a refusal, got ${JSON.stringify(x)}`);
  return x;
};
/** a paper account over one stand-in source (its bars where given) */
async function open(o: { bars?: Candle[] | undefined; cash?: number } = {}): Promise<{ t: LiveTrader; s: ReturnType<typeof source>; market: () => Promise<Market> }> {
  const h = mkdtempSync(join(tmpdir(), "paper-algos-"));
  homes.push(h);
  const s = source([row("BTC/USD", 60000)], o.bars ? { candles: async (_symbol, _interval, w) => ({ bars: o.bars!.filter((b) => b.t >= (w?.since ?? -Infinity) && b.t <= (w?.until ?? Infinity)), more: false }) } : {});
  const opened = await paperSource({ home: h, venue: "paper-1", label: "", cashUsd: o.cash ?? 10_000, sources: () => [s], clock });
  if (isRefusal(opened)) throw new Error(`${opened.code}: ${opened.message}`);
  const t = opened.source.trader!;
  return { t, s, market: async () => ok(await t.market("BTC/USD")) };
}
const order = (o: Partial<OrderRequest> = {}): OrderRequest => ({ symbol: "BTC/USD", side: "buy", type: "market", qty: 0.06, clientId: clientId(), ...o });
type Native = { algo?: { kind: string; placed: number; slices?: number; minutes?: number; show?: number; weighted?: boolean }; tca?: Tca; arrival?: number; legs?: Array<{ ref: string; status: string; qty: number; avgPrice?: number; type: string; note?: string }> };
const native = (st: OrderState): Native => st.native as Native;

describe("the words an algo is signed in", () => {
  it("parses and prints the three kinds, and says what is wrong", () => {
    expect(parseAlgo("")).toBeUndefined();
    expect(parseAlgo("twap 30m 6")).toEqual({ kind: "twap", minutes: 30, slices: 6 });
    expect(parseAlgo(" vwap 1440m 200 ")).toEqual({ kind: "vwap", minutes: 1440, slices: 200 });
    expect(parseAlgo("iceberg 0.25")).toEqual({ kind: "iceberg", show: 0.25 });
    expect(parseAlgo("twap 0m 6")).toBe("a twap or a vwap runs over 1 to 1440 minutes");
    expect(parseAlgo("twap 30m 1")).toBe("a twap or a vwap is cut into 2 to 200 slices");
    expect(parseAlgo("iceberg 0")).toBe("an iceberg shows a positive size at a time");
    expect(parseAlgo("pov 10%")).toContain('an algo is "twap 30m 6"');
    expect(algoText({ kind: "twap", minutes: 30, slices: 6 })).toBe("twap 30m 6");
    expect(algoText({ kind: "iceberg", show: 0.25 })).toBe("iceberg 0.25");
    expect(algoText(undefined)).toBe("");
  });
});

describe("the analysis and the slicing (live/tca.ts)", () => {
  it("costs in basis points against the arrival and the market's averages: positive is a cost, a buy above or a sell below", () => {
    expect(costBps("buy", 60060, 60000)).toBe(10);
    expect(costBps("sell", 60060, 60000)).toBe(-10);
    const bars: Candle[] = [{ t: NOW, o: 1, h: 1, l: 1, c: 60000, v: 2 }, { t: NOW + MIN, o: 1, h: 1, l: 1, c: 60300, v: 1 }, { t: NOW + 2 * MIN, o: 1, h: 1, l: 1, c: 59700, v: 1 }, { t: NOW + 60 * MIN, o: 1, h: 1, l: 1, c: 70000, v: 9 }];
    expect(benchmarksOf(bars, NOW, NOW + 2 * MIN)).toEqual({ vwap: 60000, twap: 60000, volume: 4 });
    expect(benchmarksOf(bars.map((b) => ({ ...b, v: undefined })), NOW, NOW + 2 * MIN)).toEqual({ twap: 60000 });
    expect(benchmarksOf(bars, NOW + 10 * MIN, NOW + 20 * MIN)).toBeUndefined();
    const tca = tcaOf({ side: "buy", arrival: 60000, arrivalAt: NOW, fills: [{ qty: 0.02, price: 60012, feeUsd: 1.2, at: NOW }, { qty: 0.02, price: 60120, feeUsd: 1.2, at: NOW + MIN }, { qty: 0.02, price: 59912, feeUsd: 1.2, at: NOW + 2 * MIN }], bars })!;
    expect(tca.qty).toBe(0.06);
    expect(tca.avgPrice).toBeCloseTo(60014.667, 2);
    expect(tca.notionalUsd).toBe(3600.88);
    expect(tca.feesUsd).toBe(3.6);
    expect(tca.feeBps).toBe(10);
    expect(tca.shortfallBps).toBe(2.44);
    expect(tca.vwap).toBe(60000);
    expect(tca.vsVwapBps).toBe(2.44);
    expect(tca.twap).toBe(60000);
    expect(tca.participation).toBe(0.015);
    expect(tca.spanMs).toBe(2 * MIN);
    expect(tca.fills).toBe(3);
    expect(tcaOf({ side: "buy", arrival: 60000, arrivalAt: NOW, fills: [] })).toBeUndefined();
  });
  it("cuts a size into slices on the market's step — equal, or by weights — the last taking the remainder, one under a step folded into the next", () => {
    expect(sliceSizes(0.06, 3, 0.000001)).toEqual([0.02, 0.02, 0.02]);
    expect(sliceSizes(1, 3, 0.1)).toEqual([0.3, 0.3, 0.4]);
    expect(sliceSizes(0.06, 3, 0.000001, [3, 1, 2])).toEqual([0.03, 0.01, 0.02]);
    expect(sliceSizes(0.06, 3, 0.01, [1, 1, 1])).toEqual([0.02, 0.02, 0.02]);
    // a weight too small for a step: that slice is folded into the next
    expect(sliceSizes(0.03, 3, 0.01, [1, 1, 100])).toEqual([0, 0, 0.03]);
    // a vwap's weights: the market's volume in each slice's stretch a day back; none where the bars carry no volume
    const dayAgo = NOW - 86_400_000;
    const bars: Candle[] = [{ t: dayAgo + MIN, o: 1, h: 1, l: 1, c: 1, v: 30 }, { t: dayAgo + 12 * MIN, o: 1, h: 1, l: 1, c: 1, v: 10 }, { t: dayAgo + 25 * MIN, o: 1, h: 1, l: 1, c: 1, v: 20 }];
    expect(vwapWeights(bars, NOW, 30, 3)).toEqual([30, 10, 20]);
    expect(vwapWeights(bars.map((b) => ({ ...b, v: undefined })), NOW, 30, 3)).toBeUndefined();
    expect(vwapWeights(bars, NOW + 3 * 60 * MIN, 30, 3)).toBeUndefined();
  });
});

describe("a twap on the paper account", () => {
  it("is one order whose slices fill one by one as they come due — the first at once — its fill its children's, its average theirs, the analysis on it; what the whole needs is held by the parent, so another order the paper money cannot cover beside it is refused", async () => {
    now = NOW;
    const { t, s, market } = await open();
    expect((await market()).algos).toEqual(["twap", "vwap", "iceberg"]);
    const st = ok(await t.place(order({ algo: { kind: "twap", minutes: 30, slices: 3 } })));
    expect(st.status).toBe("open");
    expect(st.filledQty).toBe(0.02);
    expect(native(st).algo).toEqual({ kind: "twap", placed: 1, slices: 3, minutes: 30 });
    expect(native(st).arrival).toBe(60000);
    expect(native(st).legs!.map((l) => [l.type, l.status, l.qty, l.avgPrice])).toEqual([["market", "filled", 0.02, 60012]]);
    expect(native(st).tca!.shortfallBps).toBe(2);
    // the parent holds what is left to fill: a second order the money cannot cover is refused for it
    const r = refusal(await t.place(order({ qty: 0.12 })));
    expect(r.code).toBe("E_VENUE_INSUFFICIENT");
    expect(r.message).toContain("held for 1 open order");
    // not yet due: nothing more
    now = NOW + 5 * MIN;
    expect(ok(await t.status(st.ref, "BTC/USD")).filledQty).toBe(0.02);
    // the second slice at the price then, the third at its
    now = NOW + 10 * MIN;
    reprice(s, "BTC/USD", 60100);
    const second = ok(await t.status(st.ref, "BTC/USD"));
    expect(second.filledQty).toBe(0.04);
    expect(native(second).algo!.placed).toBe(2);
    now = NOW + 20 * MIN;
    reprice(s, "BTC/USD", 59900);
    const done = ok(await t.status(st.ref, "BTC/USD"));
    expect(done.status).toBe("filled");
    expect(done.filledQty).toBe(0.06);
    expect(native(done).legs!.map((l) => l.avgPrice)).toEqual([60012, 60112.02, 59911.98]);
    expect(done.avgPrice).toBeCloseTo((60012 + 60112.02 + 59911.98) / 3, 6);
    expect(done.feeUsd).toBeCloseTo(0.02 * (60012 + 60112.02 + 59911.98) * 0.001, 6);
    const tca = native(done).tca!;
    expect(tca.arrival).toBe(60000);
    expect(tca.fills).toBe(3);
    expect(tca.spanMs).toBe(20 * MIN);
    expect(tca.shortfallBps).toBe(2);
    expect(tca.feeBps).toBe(10);
    expect((native(done) as { note?: string }).note).toBe("twap: 3 slices filled over 20 min");
    // the holding is the three slices', and the paper money moved by what they came to
    const rows = ok(await t.positions!());
    expect(rows.find((p) => p.symbol === "BTC/USD")!.qty).toBeCloseTo(0.06, 9);
  });

  it("canceled mid-way: what filled stands, the slices still due are not placed, and the hold is let go", async () => {
    now = NOW;
    const { t } = await open();
    const st = ok(await t.place(order({ algo: { kind: "twap", minutes: 30, slices: 3 } })));
    const c = ok(await t.cancel(st.ref, "BTC/USD"));
    expect(c.status).toBe("canceled");
    expect(c.filledQty).toBe(0.02);
    expect((native(c) as { note?: string }).note).toBe("twap canceled: 0.02 of 0.06 filled in 1 slice");
    now = NOW + 30 * MIN;
    expect(ok(await t.status(st.ref, "BTC/USD")).filledQty).toBe(0.02);
    // the hold went with it: an order for the rest of the money is taken
    expect(ok(await t.place(order({ qty: 0.12 }))).status).toBe("filled");
  });

  it("refuses what is not a worked order: slices under the market's step, a twap typed as a limit, an iceberg typed as a market or shown whole, exits or fill-at-once on one", async () => {
    now = NOW;
    const { t } = await open();
    expect(refusal(await t.place(order({ qty: 0.000002, algo: { kind: "twap", minutes: 30, slices: 3 } }))).message).toContain("fewer slices");
    expect(refusal(await t.place(order({ type: "limit", limitPrice: 59000, algo: { kind: "twap", minutes: 30, slices: 3 } }))).message).toContain("a twap is a market order worked over time");
    expect(refusal(await t.place(order({ algo: { kind: "iceberg", show: 0.02 } }))).message).toContain("an iceberg is a limit order");
    expect(refusal(await t.place(order({ type: "limit", limitPrice: 59000, algo: { kind: "iceberg", show: 0.06 } }))).message).toContain("shows less than its size");
    expect(refusal(await t.place(order({ takeProfit: 65000, algo: { kind: "twap", minutes: 30, slices: 3 } }))).message).toContain("carries no exits");
    expect(refusal(await t.place(order({ tif: "fok", algo: { kind: "twap", minutes: 30, slices: 3 } }))).message).toContain("good till canceled");
    expect(refusal(await t.place(order({ algo: { kind: "twap", minutes: 0, slices: 3 } }))).message).toContain("1 to 1440 minutes");
  });
});

describe("a vwap on the paper account", () => {
  it("sizes its slices by the market's volume at the same minutes a day back, and says so; equal slices, said on the order, where the source keeps no bars", async () => {
    now = NOW;
    const dayAgo = NOW - 86_400_000;
    // the same minutes a day back carry the volume the slices follow; the order's own stretch carries the bars its analysis is judged by
    const bars: Candle[] = [{ t: dayAgo + MIN, o: 1, h: 1, l: 1, c: 60000, v: 30 }, { t: dayAgo + 12 * MIN, o: 1, h: 1, l: 1, c: 60000, v: 10 }, { t: dayAgo + 25 * MIN, o: 1, h: 1, l: 1, c: 60000, v: 20 }, { t: NOW + MIN, o: 1, h: 1, l: 1, c: 59900, v: 4 }, { t: NOW + 15 * MIN, o: 1, h: 1, l: 1, c: 60300, v: 2 }];
    const a = await open({ bars });
    const st = ok(await a.t.place(order({ algo: { kind: "vwap", minutes: 30, slices: 3 } })));
    expect(native(st).algo).toEqual({ kind: "vwap", placed: 1, slices: 3, minutes: 30, weighted: true });
    expect(st.filledQty).toBe(0.03);
    now = NOW + 10 * MIN;
    expect(ok(await a.t.status(st.ref, "BTC/USD")).filledQty).toBe(0.04);
    now = NOW + 20 * MIN;
    const done = ok(await a.t.status(st.ref, "BTC/USD"));
    expect(done.status).toBe("filled");
    expect(native(done).legs!.map((l) => l.qty)).toEqual([0.03, 0.01, 0.02]);
    // the benchmarks, from the same source's bars, once it is done (read in the background, then told)
    await new Promise((r) => setTimeout(r, 30));
    const again = ok(await a.t.status(st.ref, "BTC/USD"));
    expect(native(again).tca!.vwap).toBeCloseTo(60033.333, 2);
    expect(native(again).tca!.twap).toBe(60100);
    expect(native(again).tca!.vsVwapBps).toBe(-3.55);
    expect(native(again).tca!.participation).toBe(0.01);
    now = NOW;
    const b = await open();
    const eq = ok(await b.t.place(order({ algo: { kind: "vwap", minutes: 30, slices: 3 } })));
    expect(native(eq).algo!.weighted).toBe(false);
    expect((native(eq) as { note?: string }).note).toBe("equal slices: BTC/USD market's source keeps no volume by the minute for the same stretch a day back");
    expect(eq.filledQty).toBe(0.02);
  });
});

describe("an iceberg on the paper account", () => {
  it("shows a part at its limit, resting while the quote is above it; when the quote crosses, the part fills and the next is shown — to the whole; canceled, its shown part goes with it", async () => {
    now = NOW;
    const { t, s } = await open();
    const st = ok(await t.place(order({ type: "limit", limitPrice: 59000, algo: { kind: "iceberg", show: 0.02 } })));
    expect(st.status).toBe("open");
    expect(st.filledQty).toBe(0);
    expect(native(st).algo).toEqual({ kind: "iceberg", placed: 1, show: 0.02 });
    expect(native(st).legs!.map((l) => [l.type, l.status, l.qty])).toEqual([["limit", "open", 0.02]]);
    now = NOW + MIN;
    expect(ok(await t.status(st.ref, "BTC/USD")).filledQty).toBe(0);
    // the quote comes down through the limit: the shown part fills at the limit, and the next is shown — crossing still, it fills too
    now = NOW + 2 * MIN;
    reprice(s, "BTC/USD", 58950);
    const done = ok(await t.status(st.ref, "BTC/USD"));
    expect(done.status).toBe("filled");
    expect(done.filledQty).toBe(0.06);
    // the part that rested fills at its own limit, as a rested limit does; the parts shown while the quote crosses take the quote
    expect(native(done).legs!.map((l) => [l.status, l.qty, l.avgPrice])).toEqual([["filled", 0.02, 59000], ["filled", 0.02, 58961.79], ["filled", 0.02, 58961.79]]);
    expect(done.avgPrice).toBeCloseTo((59000 + 2 * 58961.79) / 3, 6);
    expect(native(done).tca!.shortfallBps).toBe(-170.91);
    expect((native(done) as { note?: string }).note).toBe("iceberg: 3 shown parts filled over 2 min");
    // another, canceled while resting: its shown part is canceled with it
    const st2 = ok(await t.place(order({ type: "limit", limitPrice: 58000, algo: { kind: "iceberg", show: 0.02 } })));
    const c = ok(await t.cancel(st2.ref, "BTC/USD"));
    expect(c.status).toBe("canceled");
    expect(native(c).legs!.map((l) => [l.status, l.note])).toEqual([["canceled", `canceled with its parent ${st2.ref}`]]);
  });
});
