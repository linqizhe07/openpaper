import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { atmIv, bsDelta, CBOE_OPTIONS, CHAIN_EACH_SIDE, DERIBIT_KEEP_MS, DERIBIT_SUMMARY, expiriesOf, expiryMs, ivAtDelta, maxPain, nearTheMoney, normCdf, OPTIONS_FAIL_MS, OPTIONS_HOSTS, OPTIONS_KEEP_MS, optionsDesk, pickCboeChain, pickDeribitChain, rowsOf, skew25, straddle, summarize, viewOf, whichChain, type Chain, type OptionRow, type OptionsView } from "../../src/portfolio/live/options.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** OPTIONS (live/options.ts): Cboe's chain file and Deribit's summary read into a chain — the shapes as read from this machine on
 * 2026-11-09, cut — the arithmetic a terminal does over a chain (the at-the-money IV, put/call, max pain, the straddle, the 25-delta
 * skew, the rows around the money), the view of one expiry, what is asked checked first, each chain kept its while and its last answer
 * standing in, the hosts, and the route. Nothing leaves the process */
const START = Date.parse("2026-11-09T21:32:10Z");
const json = (body: unknown, status = 200): HttpReply => ({ status, body, text: JSON.stringify(body).slice(0, 2000) });
const opt = (option: string, o: Record<string, unknown>) => ({ option, bid_size: 10, ask_size: 10, rho: 0, open: 0, high: 0, low: 0, tick: "up", percent_change: 0, prev_day_close: 0, ...o });
/** AAPL's file, cut to the rows the tests need: two expiries, a series under another root, a contract Cboe has no IV for */
const AAPL = {
  timestamp: "2026-11-09 21:26:23",
  data: {
    symbol: "AAPL", security_type: "stock", exchange_id: 5, current_price: 350.51, price_change: 8.32, price_change_percent: 2.4301, bid: 350.5, ask: 350.55, open: 345, high: 351, low: 344, close: 350.51, prev_day_close: 342.19, volume: 1, iv30: 22.87, iv30_change: -2.52, iv30_change_percent: -9.9, seqno: 1, last_trade_time: "2026-11-09T15:59:59",
    options: [
      opt("AAPL261111C00340000", { bid: 11.2, ask: 11.5, iv: 0.3012, open_interest: 900, volume: 300, delta: 0.84, gamma: 0.02, vega: 0.05, theta: -0.5, theo: 11.3, change: 1, last_trade_price: 11.3, last_trade_time: "2026-11-09T15:58:00" }),
      opt("AAPL261111P00340000", { bid: 0.6, ask: 0.7, iv: 0.3058, open_interest: 1_500, volume: 800, delta: -0.16, gamma: 0.02, vega: 0.05, theta: -0.5, theo: 0.65, change: -1, last_trade_price: 0.66, last_trade_time: "2026-11-09T15:59:00" }),
      opt("AAPL261111C00350000", { bid: 3, ask: 3.25, iv: 0.2642, open_interest: 1_374, volume: 12_564, delta: 0.5451, gamma: 0.0567, vega: 0.1035, theta: -0.796, theo: 3.1534, change: 1.375, last_trade_price: 3.11, last_trade_time: "2026-11-09T15:59:52" }),
      opt("AAPL261111P00350000", { bid: 2.41, ask: 2.55, iv: 0.2653, open_interest: 895, volume: 15_905, delta: -0.4554, gamma: 0.0568, vega: 0.1035, theta: -0.7975, theo: 2.432, change: -5.63, last_trade_price: 2.41, last_trade_time: "2026-11-09T15:59:58" }),
      opt("AAPL261111C00360000", { bid: 0.5, ask: 0.6, iv: 0.2555, open_interest: 2_000, volume: 5_000, delta: 0.19, gamma: 0.03, vega: 0.06, theta: -0.4, theo: 0.55, change: 0.2, last_trade_price: 0.55, last_trade_time: "2026-11-09T15:50:00" }),
      opt("AAPL261111P00360000", { bid: 9.8, ask: 10.2, iv: 0.2691, open_interest: 400, volume: 100, delta: -0.81, gamma: 0.03, vega: 0.06, theta: -0.4, theo: 10, change: -2, last_trade_price: 10, last_trade_time: null }),
      opt("AAPL261218C00350000", { bid: 11.5, ask: 11.85, iv: 0.2332, open_interest: 26_501, volume: 2_274, delta: 0.5462, gamma: 0.0147, vega: 0.4541, theta: -0.1357, theo: 11.7217, change: 2.62, last_trade_price: 11.72, last_trade_time: "2026-11-09T15:59:23" }),
      opt("AAPL261218P00350000", { bid: 9.7, ask: 9.95, iv: 0.2341, open_interest: 4_554, volume: 1_470, delta: -0.4621, gamma: 0.0152, vega: 0.4535, theta: -0.1397, theo: 9.7829, change: -4.55, last_trade_price: 9.85, last_trade_time: "2026-11-09T15:58:32" }),
      // a contract Cboe writes no IV for, and no trade
      opt("AAPL261218C00500000", { bid: 0, ask: 0.05, iv: 0, open_interest: 12, volume: 0, delta: 0.01, gamma: 0, vega: 0.001, theta: 0, theo: 0.01, change: 0, last_trade_price: 0, last_trade_time: null }),
      // a series under another root: not this chain's
      opt("B1AAPL261218C00350000", { bid: 0.89, ask: 0, iv: 0, open_interest: 0, volume: 0, delta: 0.0041, gamma: -0.0001, vega: -0.0019, theta: 0.0381, theo: 0.85, change: 0, last_trade_price: 0, last_trade_time: null }),
      // one Cboe stamped in the future (a clock of its own): the stamp is dropped, the figures kept
      opt("AAPL261218P00300000", { bid: 1, ask: 1.1, iv: 0.3, open_interest: 50, volume: 5, delta: -0.1, gamma: 0.01, vega: 0.1, theta: -0.1, theo: 1.05, change: 0, last_trade_price: 1.05, last_trade_time: "2030-01-01T10:00:00" }),
    ],
  },
};
const SPX_HEAD = { timestamp: "2026-11-09 21:26:40", data: { symbol: "^SPX", security_type: "index", current_price: 7549.9399, price_change: 173.0799, price_change_percent: 2.3463, iv30: 15.44, iv30_change: -3.92, last_trade_time: "2026-11-09T16:14:59", options: [opt("SPX261120C07550000", { bid: 89, ask: 90.2, iv: 0.1652, open_interest: 6294, volume: 2509, delta: 0.519, gamma: 0.0019, vega: 5.1538, theta: -4.0532, theo: 88.7859, change: 50.4, last_trade_price: 94.9, last_trade_time: "2026-11-09T15:53:13" }), opt("SPX261120P07550000", { bid: 80.3, ask: 81.4, iv: 0.1651, open_interest: 9885, volume: 2944, delta: -0.4808, gamma: 0.0019, vega: 5.1538, theta: -4.0541, theo: 81.5663, change: -112.05, last_trade_price: 81.6, last_trade_time: "2026-11-09T16:05:01" })] } };
const drb = (instrument_name: string, o: Record<string, unknown>) => ({ instrument_name, high: null, low: null, interest_rate: 0, creation_timestamp: 1794259623101, underlying_index: instrument_name.split("-").slice(0, 2).join("-"), base_currency: "BTC", quote_currency: "BTC", estimated_delivery_price: 74762.55, ...o });
const BTC = {
  jsonrpc: "2.0",
  result: [
    drb("BTC-25DEC26-104000-C", { last: 0.0014, bid_price: 0.0014, ask_price: 0.0017, open_interest: 180.2, mark_price: 0.00153488, price_change: -22.2222, volume: 3.4, mark_iv: 45.44, underlying_price: 75290.09, volume_usd: 379.86, mid_price: 0.00155 }),
    drb("BTC-10NOV26-75000-C", { last: 0.0038, bid_price: 0.0033, ask_price: 0.0038, open_interest: 131.4, mark_price: 0.003531, price_change: -36.6667, volume: 156.3, mark_iv: 31.03, underlying_price: 74881.13, volume_usd: 43_000, mid_price: 0.00355 }),
    drb("BTC-10NOV26-75000-P", { last: 0.0075, bid_price: 0.0047, ask_price: 0.0055, open_interest: 24.7, mark_price: 0.005128, price_change: -34.7826, volume: 21.2, mark_iv: 31.03, underlying_price: 74881.13, volume_usd: 6_000, mid_price: 0.0051 }),
    drb("BTC-10NOV26-72000-P", { last: 0.0004, bid_price: 0.0003, ask_price: 0.0005, open_interest: 400.1, mark_price: 0.0004, price_change: 0, volume: 50, mark_iv: 38.2, underlying_price: 74881.13, volume_usd: 1_000, mid_price: 0.0004 }),
    drb("BTC-10NOV26-78000-C", { last: 0.0003, bid_price: 0.0002, ask_price: 0.0004, open_interest: 350.5, mark_price: 0.0003, price_change: 0, volume: 70, mark_iv: 35.1, underlying_price: 74881.13, volume_usd: 1_500, mid_price: 0.0003 }),
    // another coin's row in the wrong file, a name this cannot read: both left out
    drb("ETH-10NOV26-2100-C", { bid_price: 0.01, ask_price: 0.02, mark_iv: 50, underlying_price: 2130, open_interest: 1, volume: 1, mark_price: 0.015 }),
    drb("BTC-PERPETUAL", { bid_price: 1, ask_price: 1 }),
  ],
};
const view = (v: OptionsView | Refusal): OptionsView => {
  if (isRefusal(v)) throw new Error(`${v.code}: ${v.message}`);
  return v;
};

describe("the pickers", () => {
  it("Cboe's file as a chain: the symbol read from each option's name, the expiry and the strike with it, the IV in percent (none where Cboe writes 0), the greeks and the open interest, the last trade's New York time (a stamp from the future dropped), a series under another root left out, the share's own price and 30-day IV", () => {
    const c = pickCboeChain(AAPL, "AAPL", START)!;
    expect(c.kind).toBe("stock");
    expect(c.symbol).toBe("AAPL");
    expect(c.underlying).toEqual({ symbol: "AAPL", price: 350.51, change: 8.32, changePct: 2.4301, at: "2026-11-09T20:59:59.000Z", iv30: 22.87, iv30Change: -2.52, from: "Cboe · 15 min delayed", delayMs: 900_000 });
    expect(c.venueAt).toBe("2026-11-09T21:26:23.000Z");
    expect(c.contracts).toHaveLength(10);
    expect(c.contracts.map((x) => `${x.expiry} ${x.type} ${x.strike}`)).toEqual(["2026-11-11 C 340", "2026-11-11 P 340", "2026-11-11 C 350", "2026-11-11 P 350", "2026-11-11 C 360", "2026-11-11 P 360", "2026-12-18 C 350", "2026-12-18 P 350", "2026-12-18 C 500", "2026-12-18 P 300"]);
    expect(c.contracts[2]!.leg).toEqual({ bid: 3, ask: 3.25, last: 3.11, mark: 3.1534, iv: 26.42, delta: 0.5451, gamma: 0.0567, theta: -0.796, vega: 0.1035, oi: 1374, volume: 12564, change: 1.375, at: "2026-11-09T20:59:52.000Z" });
    const none = c.contracts.find((x) => x.strike === 500)!.leg;
    expect(none.iv).toBeUndefined();
    expect(none.last).toBeUndefined();
    expect(none.bid).toBeUndefined();
    expect(none.ask).toBe(0.05);
    expect(c.contracts.find((x) => x.strike === 300)!.leg.at).toBeUndefined();
    const spx = pickCboeChain(SPX_HEAD, "SPX", START)!;
    expect(spx.kind).toBe("index");
    expect(spx.underlying.symbol).toBe("^SPX");
    expect(spx.contracts.map((x) => x.strike)).toEqual([7550, 7550]);
    expect(pickCboeChain(AAPL, "MSFT", START)).toBeUndefined();
    expect(pickCboeChain({ data: { symbol: "AAPL", options: [] } }, "AAPL", START)).toBeUndefined();
    expect(pickCboeChain({ error: "Access Denied" }, "AAPL", START)).toBeUndefined();
  });

  it("Deribit's summary as a chain: the expiry from DDMMMYY, the strike and the side from the name, the prices in dollars at the expiry's underlying, the mark IV as it is, the delta Black–Scholes's from it, the coin's index as the underlying; another coin's row and a perpetual left out", () => {
    const c = pickDeribitChain(BTC, "BTC", START)!;
    expect(c.kind).toBe("crypto");
    expect(c.underlying).toEqual({ symbol: "BTC/USD", price: 74762.55, at: "2026-11-09T21:32:10.000Z", from: "Deribit · live", delayMs: 0 });
    expect(c.contracts.map((x) => `${x.expiry} ${x.type} ${x.strike}`)).toEqual(["2026-12-25 C 104000", "2026-11-10 C 75000", "2026-11-10 P 75000", "2026-11-10 P 72000", "2026-11-10 C 78000"]);
    const call = c.contracts[1]!;
    expect(call.underlying).toBe(74881.13);
    expect(call.leg).toMatchObject({ bid: 247.11, ask: 284.55, last: 284.55, mark: 264.41, iv: 31.03, oi: 131.4, volume: 156.3, change: -36.6667 });
    // 0.4 days out, at the money: a call's delta a little under a half, the put's a half below it
    expect(call.leg.delta).toBeGreaterThan(0.4);
    expect(call.leg.delta).toBeLessThan(0.5);
    expect(c.contracts[2]!.leg.delta).toBeCloseTo(call.leg.delta! - 1, 3);
    expect(c.contracts[0]!.leg.delta).toBeLessThan(0.1);
    expect(pickDeribitChain(BTC, "ETH", START)!.contracts).toHaveLength(1);
    expect(pickDeribitChain({ result: [] }, "BTC", START)).toBeUndefined();
    expect(pickDeribitChain({ error: { code: 10001 } }, "BTC", START)).toBeUndefined();
  });

  it("the normal distribution, Black–Scholes's delta, and when a contract stops: 16:00 New York on Cboe (21:00 UTC in November, 20:00 in June), 08:00 UTC on Deribit", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normCdf(-1.959964)).toBeCloseTo(0.025, 5);
    expect(bsDelta("C", 100, 100, 20, 1)).toBeCloseTo(0.5398, 3);
    expect(bsDelta("P", 100, 100, 20, 1)).toBeCloseTo(-0.4602, 3);
    expect(bsDelta("C", 100, 150, 20, 0.1)).toBeLessThan(0.001);
    expect(bsDelta("C", 100, 100, 0, 1)).toBeUndefined();
    expect(bsDelta("C", 100, 100, 20, 0)).toBeUndefined();
    expect(new Date(expiryMs("2026-11-20", "stock")).toISOString()).toBe("2026-11-20T21:00:00.000Z");
    expect(new Date(expiryMs("2026-06-19", "index")).toISOString()).toBe("2026-06-19T20:00:00.000Z");
    expect(new Date(expiryMs("2026-03-08", "stock")).toISOString()).toBe("2026-03-08T20:00:00.000Z");
    expect(new Date(expiryMs("2026-03-07", "stock")).toISOString()).toBe("2026-03-07T21:00:00.000Z");
    expect(new Date(expiryMs("2026-11-10", "crypto")).toISOString()).toBe("2026-11-10T08:00:00.000Z");
  });
});

describe("the arithmetic over a chain", () => {
  const chain = pickCboeChain(AAPL, "AAPL", START)!;
  const rows = rowsOf(chain.contracts, "2026-11-11");
  it("one expiry's rows by strike, calls and puts side by side; the at-the-money IV interpolated between the strikes around the underlying; the strike of greatest pain; the straddle at the strike nearest the underlying; the IV at a delta and the 25-delta skew", () => {
    expect(rows.map((r) => r.strike)).toEqual([340, 350, 360]);
    expect(rows[1]!.call!.iv).toBe(26.42);
    expect(rows[1]!.put!.delta).toBe(-0.4554);
    // 350.51 sits between 350 (IV 26.42/26.53 → 26.475) and 360 (25.55/26.91 → 26.23)
    expect(atmIv(rows, 350.51)).toBe(26.46);
    expect(atmIv(rows, 300)).toBe(30.35);
    expect(atmIv(rows, 400)).toBe(26.23);
    expect(atmIv(rows, undefined)).toBeUndefined();
    expect(atmIv([{ strike: 1 }], 1)).toBeUndefined();
    // the pain at 340: calls 340 pay nothing, calls 350/360 nothing, puts 350 (895 × 10) and 360 (400 × 20) = 16,950; at 350: calls 340 (900 × 10) + puts 360 (400 × 10) = 13,000; at 360: calls 340 (900 × 20) + 350 (1,374 × 10) = 31,740
    expect(maxPain(rows)).toBe(350);
    expect(maxPain([{ strike: 1, call: { bid: 1 } }])).toBeUndefined();
    expect(straddle(rows, 350.51)).toEqual({ strike: 350, price: 5.61, pct: 1.6 });
    expect(straddle(rows, 356)).toEqual({ strike: 360, price: 10.55, pct: 2.96 });
    expect(straddle([], 350)).toBeUndefined();
    // the put side's |delta| runs 0.16 (340) · 0.4554 (350) · 0.81 (360): 0.25 falls between 340 and 350
    expect(ivAtDelta(rows, "put", 0.25)).toBeCloseTo(30.58 + ((0.25 - 0.16) / (0.4554 - 0.16)) * (26.53 - 30.58), 6);
    expect(ivAtDelta(rows, "call", 0.25)).toBeCloseTo(25.55 + ((0.25 - 0.19) / (0.5451 - 0.19)) * (26.42 - 25.55), 6);
    expect(skew25(rows)).toBe(3.65);
    expect(skew25([rows[1]!])).toBeUndefined();
    expect(ivAtDelta(rows, "call", 0.9)).toBeUndefined();
  });

  it("one expiry's figures together, the expiries that have not passed, and the rows cut to the money's neighbourhood", () => {
    const s = summarize(chain, "2026-11-11", START);
    expect(s).toEqual({ expiry: "2026-11-11", days: 2, contracts: 6, atmIv: 26.46, callOi: 4274, putOi: 2795, callVolume: 17864, putVolume: 16805, pcOi: 0.65, pcVolume: 0.94, maxPain: 350, straddle: { strike: 350, price: 5.61, pct: 1.6 }, skew25: 3.65, underlying: 350.51 });
    expect(summarize(chain, "2026-12-18", START).contracts).toBe(4);
    expect(expiriesOf(chain, START)).toEqual(["2026-11-11", "2026-12-18"]);
    expect(expiriesOf(chain, Date.parse("2026-11-11T21:00:01Z"))).toEqual(["2026-12-18"]);
    const many: OptionRow[] = Array.from({ length: 200 }, (_, i) => ({ strike: 100 + i }));
    const cut = nearTheMoney(many, 200);
    expect(cut).toHaveLength(CHAIN_EACH_SIDE * 2);
    expect(cut[0]!.strike).toBe(160);
    expect(cut.at(-1)!.strike).toBe(239);
    expect(nearTheMoney(many, 100)[0]!.strike).toBe(100);
    expect(nearTheMoney(many, 1000).at(-1)!.strike).toBe(299);
    expect(nearTheMoney(many, undefined)).toHaveLength(200);
    expect(nearTheMoney(rows, 350)).toEqual(rows);
  });

  it("the view: every expiry's figures, the nearest expiry's rows and smile unless a day is asked (the first on or after it, else the last, said in a note), the venue's words, nothing estimated said so", () => {
    const v = viewOf(chain, { symbol: "AAPL" }, START, START - 1000, false);
    expect(v.expiry).toBe("2026-11-11");
    expect(v.expiries.map((e) => e.expiry)).toEqual(["2026-11-11", "2026-12-18"]);
    expect(v.chain).toEqual(rows);
    expect(v.strikes).toBeUndefined();
    expect(v.smile).toEqual([{ strike: 340, callIv: 30.12, putIv: 30.58, callDelta: 0.84, putDelta: -0.16 }, { strike: 350, callIv: 26.42, putIv: 26.53, callDelta: 0.5451, putDelta: -0.4554 }, { strike: 360, callIv: 25.55, putIv: 26.91, callDelta: 0.19, putDelta: -0.81 }]);
    expect(v).toMatchObject({ asOf: "2026-11-09T21:32:10.000Z", symbol: "AAPL", kind: "stock", from: "Cboe · 15 min delayed", readAt: "2026-11-09T21:32:09.000Z", unit: "USD" });
    expect(v.late).toBeUndefined();
    expect(v.notes[0]).toContain("Cboe's delayed quotes");
    expect(v.notes[1]).toContain("nothing estimated");
    const asked = viewOf(chain, { symbol: "AAPL", expiry: "2026-12-01" }, START, START, true);
    expect(asked.expiry).toBe("2026-12-18");
    expect(asked.late).toBe(true);
    expect(asked.notes[0]).toBe("No expiry on 2026-12-01: the first on or after it, 2026-12-18, is shown.");
    // the 500 strike has no IV: not in the smile; the 300 strike's put is
    expect(asked.smile.map((p) => p.strike)).toEqual([300, 350]);
    const past = viewOf(chain, { symbol: "AAPL", expiry: "2027-06-01" }, START, START, false);
    expect(past.expiry).toBe("2026-12-18");
    expect(past.notes[0]).toBe("No expiry on 2027-06-01: the last, 2026-12-18, is shown.");
    const crypto = viewOf(pickDeribitChain(BTC, "BTC", START)!, { symbol: "BTC" }, START, START, false);
    expect(crypto.expiry).toBe("2026-11-10");
    expect(crypto.expiries[0]).toMatchObject({ expiry: "2026-11-10", contracts: 4, underlying: 74881.13, callOi: 481.9, putOi: 424.8 });
    expect(crypto.notes[0]).toContain("Black–Scholes");
  });

  it("what is asked, checked: a ticker is Cboe's file, an index by name Cboe's under an underscore (a leading ^ read through), BTC and ETH Deribit's; anything else refused with the rule", () => {
    expect(whichChain("aapl")).toEqual({ kind: "stock", symbol: "AAPL", url: `${CBOE_OPTIONS}/AAPL.json` });
    expect(whichChain("BRK.B")).toEqual({ kind: "stock", symbol: "BRK.B", url: `${CBOE_OPTIONS}/BRK.B.json` });
    expect(whichChain("^SPX")).toEqual({ kind: "index", symbol: "SPX", url: `${CBOE_OPTIONS}/_SPX.json` });
    expect(whichChain("vix")).toEqual({ kind: "index", symbol: "VIX", url: `${CBOE_OPTIONS}/_VIX.json` });
    expect(whichChain("btc")).toEqual({ kind: "crypto", symbol: "BTC", url: `${DERIBIT_SUMMARY}?currency=BTC&kind=option` });
    for (const bad of ["", "not a ticker", "AAPL;DROP", "TOOLONGX", "../x", "^", "SPX.json"]) {
      const r = whichChain(bad);
      expect(isRefusal(r), bad).toBe(true);
      if (isRefusal(r)) expect(r.code).toBe("E_ACCOUNT_BAD_ACTION");
    }
    // SOL is a ticker by its letters: it is asked of Cboe, which lists none (the desk says so)
    expect(whichChain("SOL")).toMatchObject({ kind: "stock", symbol: "SOL" });
  });
});

function network(routes: Record<string, HttpReply | (() => HttpReply | Promise<HttpReply>)>) {
  const sent: Array<{ url: string; method: string }> = [];
  const http: Http = async (url, init) => {
    sent.push({ url, method: init?.method ?? "GET" });
    const key = Object.keys(routes).find((k) => url === k);
    if (!key) return json({ message: `not set up: ${url}` }, 404);
    const r = routes[key]!;
    return typeof r === "function" ? r() : r;
  };
  return { http, sent };
}

describe("the options desk", () => {
  it("reads a chain once and keeps it its while (Cboe a minute, Deribit thirty seconds), answers the view, checks the symbol and the day before asking, says when Cboe keeps no file for a symbol, holds a refusal a minute at least, and lets the last chain stand in when the venue is late or refuses", async () => {
    let cboeMode: "ok" | "403" | "hang" = "ok";
    const net = network({
      [`${CBOE_OPTIONS}/AAPL.json`]: () => (cboeMode === "ok" ? json(AAPL) : cboeMode === "403" ? ({ status: 403, body: undefined, text: "" } as HttpReply) : new Promise<HttpReply>(() => {})),
      [`${CBOE_OPTIONS}/ZZZZ.json`]: { status: 403, body: undefined, text: "" },
      [`${DERIBIT_SUMMARY}?currency=BTC&kind=option`]: json(BTC),
      [`${DERIBIT_SUMMARY}?currency=ETH&kind=option`]: json({ jsonrpc: "2.0", error: { code: 10004, message: "not_found" } }, 400),
    });
    let t = START;
    const d = optionsDesk({ http: net.http, clock: () => t, waitMs: 100 });
    const v = view(await d.options({ symbol: " aapl " }));
    expect(v.symbol).toBe("AAPL");
    expect(v.expiry).toBe("2026-11-11");
    expect(v.readAt).toBe(new Date(START).toISOString());
    expect(net.sent).toHaveLength(1);
    // another expiry of the same chain: nothing asked again
    const dec = view(await d.options({ symbol: "AAPL", expiry: "2026-12-18" }));
    expect(dec.expiry).toBe("2026-12-18");
    expect(net.sent).toHaveLength(1);
    t += OPTIONS_KEEP_MS - 1;
    await d.options({ symbol: "AAPL" });
    expect(net.sent).toHaveLength(1);
    t += 2;
    await d.options({ symbol: "AAPL" });
    expect(net.sent).toHaveLength(2);
    // Deribit, kept thirty seconds
    view(await d.options({ symbol: "BTC" }));
    t += DERIBIT_KEEP_MS + 1;
    view(await d.options({ symbol: "BTC" }));
    expect(net.sent.filter((s) => s.url.includes("deribit"))).toHaveLength(2);
    // checked before anything is asked
    for (const ask of [{ symbol: "" }, { symbol: "not a ticker" }, { symbol: "AAPL", expiry: "tomorrow" }, { symbol: "AAPL", expiry: "2026-13-45" }]) {
      const r = await d.options(ask);
      expect(isRefusal(r) && r.code, JSON.stringify(ask)).toBe("E_ACCOUNT_BAD_ACTION");
    }
    expect(net.sent.filter((s) => s.url.includes("AAPL"))).toHaveLength(2);
    // a symbol Cboe keeps no file for
    const zz = await d.options({ symbol: "ZZZZ" });
    expect(isRefusal(zz) && zz.code).toBe("E_VENUE_REJECTED");
    expect(isRefusal(zz) && zz.message).toContain("Cboe has no options file for ZZZZ (HTTP 403)");
    // Deribit refusing in its own words
    const eth = await d.options({ symbol: "ETH" });
    expect(isRefusal(eth) && eth.code).toBe("E_VENUE_REJECTED");
    // held: asked again only after a minute
    const before = net.sent.length;
    t += OPTIONS_FAIL_MS - 1;
    await d.options({ symbol: "ZZZZ" });
    expect(net.sent.length).toBe(before);
    t += 2;
    await d.options({ symbol: "ZZZZ" });
    expect(net.sent.length).toBe(before + 1);
    // Cboe refusing a chain it answered before: the last chain stands in, marked late
    cboeMode = "403";
    t += OPTIONS_KEEP_MS + 1;
    const standIn = view(await d.options({ symbol: "AAPL" }));
    expect(standIn.late).toBe(true);
    expect(standIn.expiries).toHaveLength(2);
    // and late: the same
    cboeMode = "hang";
    t += OPTIONS_FAIL_MS + 1;
    const late = view(await d.options({ symbol: "AAPL" }));
    expect(late.late).toBe(true);
    // past the hour the stand-in is gone: the wait is said
    const d2 = optionsDesk({ http: net.http, clock: () => t, waitMs: 50 });
    const none = await d2.options({ symbol: "AAPL" });
    expect(isRefusal(none) && none.code).toBe("E_VENUE_UNREACHABLE");
    expect(isRefusal(none) && none.message).toBe("Cboe did not answer in 0 s");
    d.clear();
  });

  it("the hosts: Cboe and Deribit through the fixed-host guard, nothing elsewhere", async () => {
    expect(OPTIONS_HOSTS).toEqual(["cdn-api.cboe.com", "www.deribit.com"]);
    const spy: Http = async () => json({});
    await expect(fixedHosts(spy, OPTIONS_HOSTS, 1_000)("https://api.nasdaq.com/x")).rejects.toThrow("is not asked");
    await expect(fixedHosts(spy, OPTIONS_HOSTS, 1_000)("http://www.deribit.com/x")).rejects.toThrow("is not asked");
    const d = optionsDesk({ http: spy, waitMs: 50 });
    const r = await d.options({ symbol: "AAPL" });
    expect(isRefusal(r) && r.message).toBe("Cboe lists no options for AAPL");
  });
});

describe("GET /api/account/options", () => {
  const home = mkdtempSync(join(tmpdir(), "options-route-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it("answers the reader's view for the symbol and day asked, refuses what the reader refuses and a missing symbol, and turns another site's page away", async () => {
    const asked: unknown[] = [];
    const chain: Chain = pickCboeChain(AAPL, "AAPL", START)!;
    const svc = await PortfolioService.create({
      home,
      venues: "frontline",
      real: true,
      liveDeps: { http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined },
      readers: {
        options: {
          async options(ask) {
            asked.push(ask);
            if (!ask.symbol) return no("E_ACCOUNT_BAD_ACTION", { message: "a symbol is needed" });
            if (ask.symbol === "ZZZZ") return no("E_VENUE_REJECTED", { message: "Cboe has no options file for ZZZZ" });
            return viewOf(chain, ask, START, START, false);
          },
          clear() {},
        },
      },
    });
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const r = await fetch(`${srv.url}/api/account/options?symbol=AAPL&expiry=2026-12-18`);
      expect(r.status).toBe(200);
      const b = (await r.json()) as { ok: boolean; expiry: string; chain: unknown[] };
      expect(b.ok).toBe(true);
      expect(b.expiry).toBe("2026-12-18");
      expect(asked[0]).toEqual({ symbol: "AAPL", expiry: "2026-12-18" });
      expect((await fetch(`${srv.url}/api/account/options?symbol=ZZZZ`)).status).toBe(409);
      expect((await fetch(`${srv.url}/api/account/options`)).status).toBe(409);
      expect(asked[2]).toEqual({ symbol: "" });
      expect((await fetch(`${srv.url}/api/account/options?symbol=AAPL`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});
