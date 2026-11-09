import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { COMMODITIES, curveAt, ECB_URL, ecbQuotes, FX_KEEP_MS, FX_PAIRS, INDICES, INDICES_KEEP_MS, KRAKEN_TICKER, pickCommodities, pickCurves, pickEcb, pickIndex, pickKraken, treasuryUrl, WORLD_FAIL_MS, WORLD_HOSTS, WorldDesk, worldDesk, type WorldView } from "../../src/portfolio/live/world.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** THE WORLD'S BOARDS (live/world.ts): Cboe's index quotes, the Treasury's CSV, Kraken's tickers, the ECB's XML and the xyz dex's contexts
 * read into four boards — the shapes as read from this machine on 2026-11-09 (the bodies below are those answers, cut) — each source kept
 * its own while and its last answer standing in when it is late or refuses, Hyperliquid's POST through its own guard, the hosts, and the
 * route. Nothing leaves the process */
const START = Date.parse("2026-11-09T19:08:34Z");
const json = (body: unknown, status = 200): HttpReply => ({ status, body, text: JSON.stringify(body).slice(0, 2000) });
const text = (t: string, status = 200): HttpReply => ({ status, body: undefined, text: t });
const SPX = { timestamp: "2026-11-09 19:08:34", data: { symbol: "^SPX", security_type: "index", exchange_id: 5, current_price: 7553.3301, price_change: 176.4701, price_change_percent: 2.3922, bid: 7552.7998, ask: 7555.79, open: 7422.2402, high: 7556.2598, low: 7422.2402, close: 7553.3301, prev_day_close: 7376.8599, last_trade_time: "2026-11-09T13:53:34" } };
const DJX = { timestamp: "2026-11-09 19:08:34", data: { symbol: "^DJX", security_type: "index", current_price: 524.17, price_change: 11.31, price_change_percent: 2.2053, prev_day_close: 512.86, open: 516.43, high: 524.33, low: 516.43, last_trade_time: "2026-11-09T13:53:34" } };
const TNX = { timestamp: "2026-11-09 19:05:14", data: { symbol: "^TNX", security_type: "index", current_price: 48.8, price_change: 0.21, price_change_percent: 0.4322, prev_day_close: 48.59, open: 48.39, high: 48.86, low: 48.31, last_trade_time: "2026-11-09T13:05:03.836000-06:00" } };
const CSV_2026 = `Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"\n11/06/2026,4.02,4.07,4.15,4.19,4.19,4.23,4.33,4.51,4.59,4.64,4.74,4.86,5.29,5.26\n11/05/2026,4.03,4.07,4.15,4.17,4.16,4.19,4.28,4.46,4.53,4.59,4.70,4.84,5.27,5.25\n10/30/2026,4.05,4.09,4.14,4.15,4.14,4.16,4.22,4.38,4.44,4.49,4.60,4.75,5.20,5.18\n10/07/2026,4.10,4.12,4.14,4.15,4.12,4.10,4.08,4.12,4.14,4.20,4.32,4.48,4.98,4.98\n`;
const CSV_2025 = `Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"\n11/06/2025,3.98,4.00,3.97,3.92,3.90,3.80,3.68,3.59,3.60,3.73,3.90,4.10,4.70,4.69\n`;
const KRAKEN = { error: [], result: { AUDUSD: { a: ["0.69135", "1964", "1964.000"], b: ["0.69129", "66", "66.000"], c: ["0.69133", "37.62000000"], v: ["1272192.65", "2251055.17"], p: ["0.68944", "0.68827"], t: [2775, 3721], l: ["0.68661", "0.68135"], h: ["0.69180", "0.69180"], o: "0.68679" }, ZEURZUSD: { a: ["1.12021", "8840", "8840.000"], b: ["1.12017", "6879", "6879.000"], c: ["1.12017", "9.90000000"], v: ["30342534.96", "38533152.35"], p: ["1.11838", "1.11737"], t: [58380, 75245], l: ["1.10813", "1.10813"], h: ["1.12060", "1.12060"], o: "1.11426" }, ZUSDZJPY: { a: ["161.089", "4257", "4257.000"], b: ["157.360", "1", "1.000"], c: ["161.085", "10.0"], v: ["1", "2"], p: ["160.9", "160.8"], t: [10, 20], l: ["160.5", "160.5"], h: ["161.2", "161.2"], o: "160.890" } } };
const ECB = `<?xml version="1.0" encoding="UTF-8"?>\n<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">\n<gesmes:subject>Reference rates</gesmes:subject>\n<Cube>\n<Cube time='2026-11-09'>\n<Cube currency='USD' rate='1.1216'/>\n<Cube currency='JPY' rate='176.79'/>\n<Cube currency='CNY' rate='7.4843'/>\n<Cube currency='GBP' rate='0.83430'/>\n<Cube currency='KRW' rate='1510.58'/>\n</Cube></Cube></gesmes:Envelope>`;
const XYZ = [
  { universe: [{ szDecimals: 4, name: "xyz:XYZ100", maxLeverage: 30 }, { szDecimals: 4, name: "xyz:GOLD", maxLeverage: 25 }, { szDecimals: 3, name: "xyz:CL", maxLeverage: 20 }, { szDecimals: 0, name: "xyz:CORN", maxLeverage: 20, isDelisted: true }] },
  [{ markPx: "27867.0", oraclePx: "27872.0", prevDayPx: "27024.0", dayNtlVlm: "705393408.4", funding: "0.00000625", openInterest: "7884.7" }, { markPx: "4105.1", oraclePx: "4103.4", prevDayPx: "4063.8", dayNtlVlm: "76242585.8", funding: "0.00000625", openInterest: "74676.7" }, { markPx: "86.439", oraclePx: "86.72", prevDayPx: "90.1", dayNtlVlm: "389000000", funding: "0", openInterest: "1" }, { markPx: "4.61", oraclePx: "4.61", prevDayPx: "4.61", dayNtlVlm: "0", funding: "0", openInterest: "0" }],
];
const view = (v: WorldView | Refusal): WorldView => {
  if (isRefusal(v)) throw new Error(`${v.code}: ${v.message}`);
  return v;
};

describe("the boards' pickers", () => {
  it("an index as Cboe writes it: the level and its change, the Dow times a hundred and the 10-year yield divided by ten, each said with its words, the last trade's New York time (Chicago's with its offset for the yield), fifteen minutes behind", () => {
    const spx = pickIndex(SPX, INDICES[0]!, START)!;
    expect(spx).toMatchObject({ id: "cboe:^SPX", name: "S&P 500", symbol: "^SPX", price: 7553.3301, change: 176.4701, changePct: 2.3922, open: 7422.2402, high: 7556.2598, low: 7422.2402, prevClose: 7376.8599, at: "2026-11-09T18:53:34.000Z", from: "Cboe · 15 min delayed", delayMs: 900_000 });
    expect(spx.unit).toBeUndefined();
    const djx = pickIndex(DJX, INDICES.find((i) => i.symbol === "^DJX")!, START)!;
    expect(djx).toMatchObject({ name: "Dow Jones Industrial", price: 52417, change: 1131, changePct: 2.2053, prevClose: 51286, note: "Cboe's DJX, the Dow divided by a hundred, times a hundred" });
    const tnx = pickIndex(TNX, INDICES.find((i) => i.symbol === "^TNX")!, START)!;
    expect(tnx).toMatchObject({ name: "US 10-year yield", price: 4.88, change: 0.021, unit: "%", at: "2026-11-09T19:05:03.836Z" });
    expect(pickIndex({ data: { symbol: "AAPL", security_type: "stock", current_price: 1 } }, INDICES[0]!, START)).toBeUndefined();
    expect(pickIndex({ data: null }, INDICES[0]!, START)).toBeUndefined();
    // a stamp from the future is not one
    expect(pickIndex({ data: { ...SPX.data, last_trade_time: "2030-01-01T10:00:00" } }, INDICES[0]!, START)!.at).toBeUndefined();
  });

  it("the Treasury's CSV as curves, newest first, each tenor in months; the curve on or before a day", () => {
    const curves = pickCurves(CSV_2026);
    expect(curves.map((c) => c.day)).toEqual(["2026-11-06", "2026-11-05", "2026-10-30", "2026-10-07"]);
    expect(curves[0]!.points.slice(0, 3)).toEqual([{ tenor: "1 Mo", months: 1, yield: 4.02 }, { tenor: "1.5 Month", months: 1.5, yield: 4.07 }, { tenor: "2 Mo", months: 2, yield: 4.15 }]);
    expect(curves[0]!.points.at(-1)).toEqual({ tenor: "30 Yr", months: 360, yield: 5.26 });
    expect(curveAt(curves, "2026-11-01")!.day).toBe("2026-10-30");
    expect(curveAt(curves, "2026-11-05")!.day).toBe("2026-11-05");
    expect(curveAt(curves, "2026-01-01")).toBeUndefined();
    expect(pickCurves("")).toEqual([]);
    expect(pickCurves("<!doctype html><html>nope</html>")).toEqual([]);
    expect(pickCurves(`﻿Date,"1 Mo","10 Yr"\n11/06/2026,4.02,N/A\n`)).toEqual([{ day: "2026-11-06", points: [{ tenor: "1 Mo", months: 1, yield: 4.02 }] }]);
  });

  it("Kraken's tickers as pairs in the board's order (its Z before a fiat code read through), the last, bid, ask, the day's change from the open; the ECB's fixing crossed to the dollar; the xyz dex's commodities by their oracle, a delisted one left out", () => {
    const fx = pickKraken(KRAKEN, START);
    expect(fx.map((q) => q.name)).toEqual(["EUR/USD", "USD/JPY", "AUD/USD"]);
    expect(fx[0]).toMatchObject({ id: "kraken:EUR/USD", price: 1.12017, bid: 1.12017, ask: 1.12021, open: 1.11426, change: 0.00591, changePct: 0.5304, from: "Kraken · live", delayMs: 0 });
    expect(pickKraken({ error: ["EService:Unavailable"] }, START)).toEqual([]);
    const fix = pickEcb(ECB)!;
    expect(fix.day).toBe("2026-11-09");
    expect(fix.rates.get("USD")).toBe(1.1216);
    const e = ecbQuotes(fix);
    expect(e.map((q) => q.name)).toEqual(["USD/CNY", "USD/KRW"]);
    expect(e[0]!.price).toBeCloseTo(7.4843 / 1.1216, 5);
    expect(e[1]!.price).toBeCloseTo(1510.58 / 1.1216, 4);
    expect(e[0]).toMatchObject({ from: "ECB reference rates · 2026-11-09", at: "2026-11-09T15:15:00.000Z" });
    expect(pickEcb("<html>nope</html>")).toBeUndefined();
    const c = pickCommodities(XYZ, START);
    expect(c.map((q) => q.name)).toEqual(["Gold", "WTI crude"]);
    expect(c[0]).toMatchObject({ id: "hl:xyz:GOLD", symbol: "xyz:GOLD", price: 4103.4, mark: 4105.1, prevClose: 4063.8, change: 41.3, changePct: 1.0163, volumeUsd24h: 76242585.8, from: "Hyperliquid xyz · oracle", unit: "$/oz" });
    expect(c[1]!.changePct).toBeLessThan(0);
    expect(pickCommodities(null, START)).toEqual([]);
    expect(COMMODITIES.map((x) => x.coin)).toContain("CORN");
  });
});

function network(routes: Record<string, HttpReply | ((init?: { body?: string }) => HttpReply | Promise<HttpReply>)>) {
  const sent: Array<{ url: string; method: string; body?: string | undefined }> = [];
  const http: Http = async (url, init) => {
    sent.push({ url, method: init?.method ?? "GET", body: init?.body });
    const key = Object.keys(routes).find((k) => url === k);
    if (!key) return json({ message: `not set up: ${url}` }, 404);
    const r = routes[key]!;
    return typeof r === "function" ? r(init) : r;
  };
  return { http, sent };
}
const HL = "https://api.hyperliquid.xyz/info";
const cboe = (s: string) => `https://cdn-api.cboe.com/api/global/delayed_quotes/quotes/_${s}.json`;
function allRoutes(over: Record<string, HttpReply | ((init?: { body?: string }) => HttpReply | Promise<HttpReply>)> = {}) {
  const routes: Record<string, HttpReply | ((init?: { body?: string }) => HttpReply | Promise<HttpReply>)> = {};
  for (const i of INDICES) routes[cboe(i.symbol.slice(1))] = json(i.symbol === "^TNX" ? TNX : i.symbol === "^DJX" ? DJX : { ...SPX, data: { ...SPX.data, symbol: i.symbol } });
  routes[treasuryUrl(2026)] = text(CSV_2026);
  routes[treasuryUrl(2025)] = text(CSV_2025);
  routes[`${KRAKEN_TICKER}?pair=${FX_PAIRS.map((p) => p.replace("/", "")).join(",")}`] = json(KRAKEN);
  routes[ECB_URL] = text(ECB);
  routes[HL] = json(XYZ);
  return { ...routes, ...over };
}

describe("the world desk", () => {
  it("reads every source at once and answers the four boards with where each came from; the curve beside a week, a month and a year before with its spreads; Hyperliquid asked by its own POST for the xyz dex; each source kept its own while", async () => {
    const net = network(allRoutes());
    let t = START;
    const d = worldDesk({ http: net.http, clock: () => t, waitMs: 200 });
    const v = view(await d.world());
    expect(v.indices.map((q) => q.name)).toEqual(INDICES.map((i) => i.name));
    expect(v.rates.latest!.day).toBe("2026-11-06");
    expect(v.rates.weekAgo!.day).toBe("2026-10-30");
    expect(v.rates.monthAgo!.day).toBe("2026-10-07");
    expect(v.rates.yearAgo!.day).toBe("2025-11-06");
    expect(v.rates.spreads).toEqual({ "2s10s": 0.35, "3m10y": 0.67, "5s30s": 0.62 });
    expect(v.rates.from).toBe("US Treasury par yield curve · 2026-11-06");
    expect(v.fx.map((q) => q.name)).toEqual(["EUR/USD", "USD/JPY", "AUD/USD", "USD/CNY", "USD/KRW"]);
    expect(v.commodities.map((q) => q.name)).toEqual(["Gold", "WTI crude"]);
    expect(v.sources.map((s) => [s.id, !!s.readAt, s.late ?? false])).toEqual([["indices", true, false], ["rates", true, false], ["kraken", true, false], ["ecb", true, false], ["commodities", true, false]]);
    expect(v.missing).toEqual([]);
    expect(v.notes.length).toBeGreaterThan(3);
    // Hyperliquid: one POST, the dex named
    const hl = net.sent.filter((s) => s.url === HL);
    expect(hl).toHaveLength(1);
    expect(JSON.parse(hl[0]!.body!)).toEqual({ type: "metaAndAssetCtxs", dex: "xyz" });
    // every GET on a listed host, the Treasury's two years asked
    expect(net.sent.filter((s) => s.url !== HL).every((s) => WORLD_HOSTS.includes(new URL(s.url).hostname))).toBe(true);
    expect(net.sent.filter((s) => s.url.includes("treasury"))).toHaveLength(2);
    // kept: the currencies ten seconds, the indices a minute
    const before = net.sent.length;
    t += FX_KEEP_MS - 1;
    await d.world();
    expect(net.sent.length).toBe(before);
    t += 2;
    await d.world();
    expect(net.sent.filter((s) => s.url.startsWith(KRAKEN_TICKER))).toHaveLength(2);
    expect(net.sent.filter((s) => s.url.startsWith("https://cdn-api.cboe.com"))).toHaveLength(INDICES.length);
    t += INDICES_KEEP_MS;
    await d.world();
    expect(net.sent.filter((s) => s.url.startsWith("https://cdn-api.cboe.com"))).toHaveLength(INDICES.length * 2);
  });

  it("a source refusing or late is said in its words, its last answer standing in; a refusal held a minute at least; an index Cboe refuses is left out and said; Kraken's 503 asked once more", async () => {
    let krakenMode: "ok" | "503" | "503-then-ok" = "ok";
    let krakenCalls = 0;
    let hlHang = false;
    const net = network(allRoutes({
      [`${KRAKEN_TICKER}?pair=${FX_PAIRS.map((p) => p.replace("/", "")).join(",")}`]: () => {
        krakenCalls++;
        if (krakenMode === "503" || (krakenMode === "503-then-ok" && krakenCalls % 2 === 1)) return json({ error: ["EService:Unavailable"] }, 503);
        return json(KRAKEN);
      },
      [HL]: () => (hlHang ? new Promise<HttpReply>(() => {}) : json(XYZ)),
      [cboe("VIX")]: json({ message: "no" }, 403),
    }));
    let t = START;
    // the wait longer than the 300 ms Kraken is asked again after, so a 503 answered on the second ask is not called late
    const d = worldDesk({ http: net.http, clock: () => t, waitMs: 600 });
    const first = view(await d.world());
    expect(first.indices.map((q) => q.symbol)).not.toContain("^VIX");
    expect(first.missing.find((m) => m.venue === "cboe")).toMatchObject({ venueName: "Cboe", why: expect.stringContaining("VIX: Cboe refused the request (HTTP 403)") });
    // a 503 once: asked again a moment later and answered
    krakenMode = "503-then-ok";
    krakenCalls = 0;
    t += FX_KEEP_MS + 1;
    const again = view(await d.world());
    expect(krakenCalls).toBe(2);
    expect(again.fx.some((q) => q.from === "Kraken · live")).toBe(true);
    // refusing for good: the last answer stands in, the refusal said, the source held a minute at least
    krakenMode = "503";
    krakenCalls = 0;
    t += FX_KEEP_MS + 1;
    const held = view(await d.world());
    expect(krakenCalls).toBe(2);
    expect(held.sources.find((s) => s.id === "kraken")).toMatchObject({ late: true });
    expect(held.fx.some((q) => q.from === "Kraken · live")).toBe(true);
    expect(held.missing.find((m) => m.venue === "kraken")).toMatchObject({ venueName: "Kraken", code: "E_VENUE_UNREACHABLE" });
    t += FX_KEEP_MS + 1;
    await d.world();
    expect(krakenCalls).toBe(2);
    t += WORLD_FAIL_MS;
    await d.world();
    expect(krakenCalls).toBe(4);
    // Hyperliquid late: its last answer stands in and the wait is said
    hlHang = true;
    t += 30_000;
    const late = view(await d.world());
    expect(late.sources.find((s) => s.id === "commodities")).toMatchObject({ late: true });
    expect(late.commodities.map((q) => q.name)).toEqual(["Gold", "WTI crude"]);
    expect(late.missing.find((m) => m.venue === "commodities")).toEqual({ venue: "commodities", venueName: "Hyperliquid xyz", why: "Hyperliquid xyz did not answer in 1 s" });
    d.clear();
  });

  it("the hosts: Cboe, the Treasury, Kraken and the ECB through the fixed-host guard, nothing elsewhere; Hyperliquid through its own guard", async () => {
    expect(WORLD_HOSTS).toEqual(["cdn-api.cboe.com", "home.treasury.gov", "api.kraken.com", "www.ecb.europa.eu"]);
    const spy: Http = async () => json({});
    await expect(fixedHosts(spy, WORLD_HOSTS, 1_000)("https://api.nasdaq.com/x")).rejects.toThrow("is not asked");
    await expect(fixedHosts(spy, WORLD_HOSTS, 1_000)("http://home.treasury.gov/x")).rejects.toThrow("is not asked");
    const d = new WorldDesk({ http: spy, guarded: fixedHosts(spy, WORLD_HOSTS, 1_000, { maxBytes: 10 }), waitMs: 50 });
    expect(isRefusal(await d.world())).toBe(false);
  });
});

describe("GET /api/account/world", () => {
  const home = mkdtempSync(join(tmpdir(), "world-route-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it("answers the reader's view and turns another site's page away", async () => {
    let calls = 0;
    const svc = await PortfolioService.create({
      home,
      venues: "frontline",
      real: true,
      liveDeps: { http: async () => text("", 599), price: async () => undefined },
      readers: {
        world: {
          async world() {
            calls++;
            if (calls === 2) return no("E_VENUE_UNREACHABLE", { message: "nothing answered" });
            return { asOf: "2026-11-09T19:00:00.000Z", indices: [{ id: "cboe:^SPX", name: "S&P 500", symbol: "^SPX", price: 7553.33, from: "Cboe · 15 min delayed" }], rates: { from: "US Treasury par yield curve" }, fx: [], commodities: [], sources: [], missing: [], notes: [] };
          },
          clear() {},
        },
      },
    });
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const r = await fetch(`${srv.url}/api/account/world`);
      expect(r.status).toBe(200);
      const b = (await r.json()) as { ok: boolean; indices: Array<{ name: string }> };
      expect(b.ok).toBe(true);
      expect(b.indices[0]!.name).toBe("S&P 500");
      expect((await fetch(`${srv.url}/api/account/world`)).status).toBe(409);
      expect((await fetch(`${srv.url}/api/account/world`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});
