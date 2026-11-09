import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE MONITOR PANE (ui/monitor.js): a layout's words read and checked, the tiles to show (the address's, this browser's last, the desk
 * preset), each tile drawn by its page's own function from the read its page makes — a market with its line, a board, headlines, today's
 * calendar, an option chain's nearest expiry — the presets, the add form, a tile removed or opened, a market joining from the command
 * line, a tile's refusal in words. Run as the page runs it: plain scripts in one global scope after the pages it borrows from, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "connect.js", "asset.js", "markets.js", "world.js", "news.js", "calendar.js", "options.js", "monitor.js"];
/** Monday 9 November 2026, 16:32 New York */
const NOW = "2026-11-09T21:32:10.000Z";

function page(answer: (path: string) => unknown, stored: Record<string, string> = {}) {
  const asked: string[] = [];
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "" });
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a: ConstructorParameters<typeof Date>) {
      super(...((a.length ? a : [NOW]) as ConstructorParameters<typeof Date>));
    }
    static override now() {
      return Date.parse(NOW);
    }
  }
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" }, classList: { add() {}, remove() {} } }, hidden: false, activeElement: null },
    location: { hash: "#/monitor", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: { getItem: (k: string) => stored[k] ?? null, setItem: (k: string, v: string) => void (stored[k] = v) },
    Owner: { role: "owner", kid: "k1", why: () => "" },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    console,
    URLSearchParams,
    Intl,
    Date: FixedDate,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    fetch: async (path: string) => {
      asked.push(path);
      const body = await answer(path);
      if (body === undefined) return new Promise(() => {});
      return { status: 200, statusText: "OK", json: async () => body };
    },
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "monitor"; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: () => null }; var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h); var OPENED = []; function openMarket(x) { OPENED.push(x); }`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, stored };
}
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
const ANSWERS: Record<string, unknown> = {
  "/api/account/explore?key=coin%3ABTC": { ok: true, items: [{ key: "coin:BTC", name: "BTC", kind: "coin", base: "BTC", price: 62609.7, changePct24h: 3.22, at: [{ venue: "ex", venueName: "Stand-in Exchange", symbol: "BTC/USDT", price: 62609.7, open: true, connected: true, canTrade: true }] }] },
  "/api/account/explore?key=stock%3AAAPL": { ok: true, items: [{ key: "stock:AAPL", name: "Apple Inc. common stock", kind: "stock", base: "AAPL", price: 228.49, changePct24h: 0.68, at: [{ venue: "broker", venueName: "Stand-in Broker", symbol: "AAPL", price: 228.49, open: true, connected: true, canTrade: true, session: { open: false, opensAt: "2026-11-10T14:30:00.000Z" } }] }] },
  "/api/account/explore?key=stock%3AZZZZ": { ok: true, items: [] },
  "/api/account/candles?venue=ex&symbol=BTC%2FUSDT&interval=5m&range=1D": { ok: true, venue: "ex", venueName: "Stand-in Exchange", symbol: "BTC/USDT", interval: "5m", candles: Array.from({ length: 12 }, (_, i) => ({ t: Date.parse("2026-11-09T20:30:00Z") + i * 300_000, o: 62_000 + i * 50, h: 62_100 + i * 50, l: 61_950 + i * 50, c: 62_050 + i * 50 })) },
  "/api/account/world": {
    ok: true, asOf: NOW,
    indices: Array.from({ length: 11 }, (_, i) => ({ id: `cboe:^I${i}`, name: `Index ${i}`, symbol: `^I${i}`, price: 1000 + i, change: 1, changePct: 0.1, at: NOW, from: "Cboe · 15 min delayed", delayMs: 900_000 })),
    rates: { latest: { day: "2026-11-06", points: [{ tenor: "1 Mo", months: 1, yield: 4.02 }, { tenor: "2 Yr", months: 24, yield: 4.51 }, { tenor: "10 Yr", months: 120, yield: 4.86 }, { tenor: "30 Yr", months: 360, yield: 5.26 }] }, spreads: { "2s10s": 0.35, "3m10y": 0.67, "5s30s": -0.62 }, from: "US Treasury par yield curve · 2026-11-06" },
    fx: [{ id: "kraken:EUR/USD", name: "EUR/USD", symbol: "EUR/USD", price: 1.12017, bid: 1.12017, ask: 1.12021, changePct: 0.53, from: "Kraken · live", delayMs: 0 }, { id: "ecb:USD/CNY", name: "USD/CNY", symbol: "USD/CNY", price: 6.6729, from: "ECB reference rates · 2026-11-09" }],
    commodities: [{ id: "hl:xyz:GOLD", name: "Gold", symbol: "xyz:GOLD", price: 4103.4, mark: 4105.1, changePct: 1.02, volumeUsd24h: 76_242_585.8, from: "Hyperliquid xyz · oracle", delayMs: 0, unit: "$/oz" }],
    sources: [], missing: [], notes: [],
  },
  "/api/account/news?topic=markets&limit=8": { ok: true, items: [{ id: "a", title: "Stocks climb <b>into</b> the close", url: "https://news.example/a", at: "2026-11-09T20:59:00.000Z", source: "wire", sourceName: "Stand-in Wire" }, { id: "b", title: "Yields slip", at: "2026-11-09T18:00:00.000Z", source: "wire", sourceName: "Stand-in Wire" }], total: 2, sources: [], missing: [], notes: [] },
  "/api/account/news?topic=crypto&limit=8": { ok: true, items: [], total: 0, sources: [], missing: [], notes: [] },
  "/api/account/calendar?kind=economic&limit=12": { ok: true, kind: "economic", items: [{ kind: "economic", day: "2026-11-09", at: "2026-11-09T13:30:00.000Z", time: "08:30", country: "United States", event: "Core CPI (MoM)", actual: "0.3%", consensus: "0.2%", previous: "0.3%", against: "above" }], total: 14, days: [], missing: [], notes: [] },
  "/api/account/calendar?kind=splits&limit=12": { ok: true, kind: "splits", items: [], total: 0, days: [], missing: [], notes: [] },
  "/api/account/options?symbol=SPX": { ok: true, symbol: "SPX", kind: "index", underlying: { symbol: "^SPX", price: 7549.94, changePct: 2.35, iv30: 15.44, from: "Cboe · 15 min delayed", delayMs: 900_000 }, expiry: "2026-11-20", expiries: [{ expiry: "2026-11-20", days: 11, contracts: 1110, atmIv: 16.52, callOi: 836898, putOi: 1249715, callVolume: 51450, putVolume: 71660, pcOi: 1.49, pcVolume: 1.39, maxPain: 7590, straddle: { strike: 7550, price: 170.45, pct: 2.26 }, skew25: 5.12 }], chain: [], smile: [], from: "Cboe · 15 min delayed", readAt: NOW, unit: "USD", notes: [] },
  "/api/account/options?symbol=ZZZZ": { ok: false, refusal: { code: "E_VENUE_REJECTED", message: "Cboe has no options file for ZZZZ (HTTP 403)" } },
};
const answer = (path: string) => ANSWERS[path];

describe("the monitor pane", () => {
  it("reads a layout's words: the five kinds and what each shows, a board, a topic, a calendar and a symbol only as listed, a market only by a key, no tile twice, twelve at most, a symbol in capitals with its ^ read through; the tiles to show are the address's, else this browser's last, else the desk preset; each tile's read", () => {
    const p = page(answer);
    expect(p.run("monParse('w=indices,m=coin:BTC,n=markets,c=economic,o=^spx,w=indices,x=1,w=moon,n=gossip,c=sports,o=not a ticker,m=BTC,')")).toEqual([{ kind: "w", arg: "indices" }, { kind: "m", arg: "coin:BTC" }, { kind: "n", arg: "markets" }, { kind: "c", arg: "economic" }, { kind: "o", arg: "SPX" }]);
    expect(p.run("monParse(Array.from({ length: 20 }, (_, i) => 'm=stock:S' + i).join(',')).length")).toBe(12);
    expect(p.run("monWords(monParse('o=spx, w=rates'))")).toBe("o=SPX,w=rates");
    expect(p.run("monWords(monTiles({}))")).toBe("w=indices,w=rates,m=coin:BTC,n=markets,c=economic,o=SPX");
    expect(p.run("monWords(monTiles({ tiles: 'n=crypto,o=BTC' }))")).toBe("n=crypto,o=BTC");
    expect(p.run("monWords(monTiles({ tiles: 'x=nothing' }))")).toBe("w=indices,w=rates,m=coin:BTC,n=markets,c=economic,o=SPX");
    const q = page(answer, { "mon.tiles": "w=fx,c=splits" });
    expect(q.run("monWords(monTiles({}))")).toBe("w=fx,c=splits");
    expect(q.run("monWords(monTiles({ tiles: 'o=ETH' }))")).toBe("o=ETH");
    expect(p.run("[monPath({ kind: 'm', arg: 'coin:BTC' }), monPath({ kind: 'w', arg: 'fx' }), monPath({ kind: 'n', arg: 'macro' }), monPath({ kind: 'c', arg: 'ipos' }), monPath({ kind: 'o', arg: 'BRK.B' })]")).toEqual(["/api/account/explore?key=coin%3ABTC", "/api/account/world", "/api/account/news?topic=macro&limit=8", "/api/account/calendar?kind=ipos&limit=12", "/api/account/options?symbol=BRK.B"]);
    expect(p.run("[monTitle({ kind: 'm', arg: 'stock:AAPL' }), monTitle({ kind: 'm', arg: 'stock:AAPL' }, { items: [{ name: 'Apple' }] }), monTitle({ kind: 'w', arg: 'rates' }), monTitle({ kind: 'n', arg: 'macro' }), monTitle({ kind: 'c', arg: 'ipos' }), monTitle({ kind: 'o', arg: 'SPX' })]")).toEqual(["AAPL", "Apple", "Yield curve", "News · Macro", "Today · IPOs", "SPX options"]);
  });

  it("draws the tiles from their pages' reads: a market with its price, change, venue and day's line; the indices cut to eight; the curve with its spreads; the live pairs alone; the commodities; the headlines; today's releases; an option chain's nearest expiry — each a skeleton until read, a word where there is nothing, the refusal in words", async () => {
    const p = page(answer);
    const tiles = "m=coin:BTC,m=stock:AAPL,m=stock:ZZZZ,w=indices,w=rates,w=fx,w=commodities,n=markets,n=crypto,c=economic,c=splits,o=SPX";
    p.run(`ROUTE.params = { tiles: ${JSON.stringify(tiles)} }; renderMonitor({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })`);
    const first = p.run<string>("EL.innerHTML");
    expect(first.match(/class="skel-rows"/g)!.length).toBe(12);
    expect(first).toContain('<div class="seg mon-presets" role="group" aria-label="Preset"><button type="button" data-mon="preset" data-preset="desk" aria-pressed="false">Desk</button>');
    expect(first).toContain('<form class="mon-add" data-mon="add"><select name="tile" class="mon-pick" aria-label="A tile to add"><optgroup label="A board"><option value="w=indices">Indices</option>');
    expect(new Set(p.asked)).toEqual(new Set(["/api/account/explore?key=coin%3ABTC", "/api/account/explore?key=stock%3AAAPL", "/api/account/explore?key=stock%3AZZZZ", "/api/account/world", "/api/account/news?topic=markets&limit=8", "/api/account/news?topic=crypto&limit=8", "/api/account/calendar?kind=economic&limit=12", "/api/account/calendar?kind=splits&limit=12", "/api/account/options?symbol=SPX"]));
    await settle();
    p.run("renderMonitor({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    await settle();
    p.run("renderMonitor({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).not.toContain("skel-rows");
    // the market: its line asked once the leg is known
    expect(p.asked).toContain("/api/account/candles?venue=ex&symbol=BTC%2FUSDT&interval=5m&range=1D");
    expect(html).toContain('<section class="sec mon-tile mon-m" data-k="m=coin:BTC" aria-label="BTC"><div class="sec-head"><h2 class="h2">BTC</h2><span class="mon-tools"><button type="button" class="link" data-mon="open" data-i="0">Open</button><button type="button" class="icon-btn mon-x" data-mon="remove" data-i="0" aria-label="Remove BTC">×</button></span></div><p class="mon-px"><span class="mon-num">$62,609.70</span> <span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 3.2%</span><span class="dim small"> · Stand-in Exchange</span></p><svg class="spark mk-chart"');
    expect(html).toContain('<h2 class="h2">Apple Inc. common stock</h2>');
    expect(html).toContain('<span class="dim small"> · Stand-in Broker · closed</span>');
    expect(html).toContain('<p class="small dim mon-why">No market by this key is listed just now.</p>');
    // the boards, by the World page's own hands
    expect(html.match(/<tr data-k="cboe:\^I\d+">/g)!.length).toBe(8);
    expect(html).toContain('<svg class="wd-curve"');
    expect(html).toContain('<span class="wd-spread"><span class="label">5s30s</span> <b class="down">−62 bp</b></span>');
    expect(html).toContain('<tr data-k="kraken:EUR/USD">');
    expect(html).not.toContain('<tr data-k="ecb:USD/CNY">');
    expect(html).toContain('<tr data-k="hl:xyz:GOLD">');
    // the headlines, the News page's rows; a topic with none says so
    expect(html).toContain('<ol class="nw-list nw-compact"><li class="nw-row" data-k="a">');
    expect(html).toContain('<a class="nw-title" href="https://news.example/a" target="_blank" rel="noopener noreferrer">Stocks climb &lt;b&gt;into&lt;/b&gt; the close</a>');
    expect(html).toContain('<p class="small dim mon-why">No headline on this topic just now.</p>');
    // today's releases, the Calendar page's rows; a kind with none says so
    expect(html).toContain("Core CPI (MoM)");
    expect(html).toContain('<p class="small dim">1 of 14 rows.</p>');
    expect(html).toContain('<p class="small dim mon-why">Nothing today in Nasdaq&#39;s splits calendar.</p>');
    // the chain's nearest expiry, the Options page's tiles
    expect(html).toContain('<section class="sec mon-tile mon-o" data-k="o=SPX" aria-label="SPX options"><div class="sec-head"><h2 class="h2">SPX options</h2>');
    expect(html).toContain('<p class="mon-px"><span class="mon-num">7,549.94</span> <span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 2.4%</span> <span class="dim small">· IV30 15.4%</span></p><p class="small dim mon-exp">20 Nov · 11 d · Cboe · 15 min delayed</p><div class="op-stats"><div class="op-stat" title="the venue&#39;s implied volatility at the two strikes around the underlying, interpolated"><span class="label">ATM IV</span><b>16.5%</b></div>');
    expect(html).toContain('<span class="label">Straddle</span><b>170.45 <span class="dim small">±2.3%</span></b>');
    expect(html).toContain('<p class="small dim mon-foot">Each tile reads what its page reads');
    // a tile refused: its words
    const q = page(answer);
    q.run("ROUTE.params = { tiles: 'o=ZZZZ' }; renderMonitor({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    await settle();
    q.run("renderMonitor({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(q.run<string>("EL.innerHTML")).toContain('<p class="small dim mon-why">Couldn&#39;t read the chain: Cboe has no options file for ZZZZ (HTTP 403).</p>');
  });

  it("moves the layout in place and keeps it: a preset, a tile removed, one added from the form, a market joining from the command line (from another page too); a tile opened goes to its page", () => {
    const p = page(answer);
    const press = (dataset: Record<string, string>) => `monClick({ target: { closest: (s) => (s === "[data-mon]" ? { dataset: ${JSON.stringify(dataset)} } : null) } })`;
    p.run(`ROUTE.params = {}; ${press({ mon: "preset", preset: "crypto" })}`);
    expect(p.run("MOVES")).toEqual(["#/monitor?tiles=m%3Dcoin%3ABTC%2Cm%3Dcoin%3AETH%2Cw%3Dcommodities%2Cn%3Dcrypto%2Co%3DBTC%2Co%3DETH"]);
    expect(p.stored["mon.tiles"]).toBe("m=coin:BTC,m=coin:ETH,w=commodities,n=crypto,o=BTC,o=ETH");
    p.run(`ROUTE.params = { tiles: "w=indices,w=rates,n=markets" }; ${press({ mon: "remove", i: "1" })}`);
    expect(p.run("MOVES.at(-1)")).toBe("#/monitor?tiles=w%3Dindices%2Cn%3Dmarkets");
    expect(p.stored["mon.tiles"]).toBe("w=indices,n=markets");
    p.run(`ROUTE.params = { tiles: "w=indices" }; monSubmit({ preventDefault() {}, target: { closest: (s) => (s === "[data-mon=add]" ? { querySelector: () => ({ value: "c=earnings" }) } : null) } })`);
    expect(p.run("MOVES.at(-1)")).toBe("#/monitor?tiles=w%3Dindices%2Cc%3Dearnings");
    p.run(`ROUTE.params = { tiles: "w=indices" }; monSubmit({ preventDefault() {}, target: { closest: (s) => (s === "[data-mon=add]" ? { querySelector: () => ({ value: "w=indices" }) } : null) } })`);
    expect(p.run("MOVES.at(-1)")).toBe("#/monitor?tiles=w%3Dindices");
    // from the command line, on another page: the kept layout plus the market, the page opened
    p.run("ROUTE.tab = 'markets'; ROUTE.params = { tab: 'stocks' }; monAdd('m', 'stock:AAPL')");
    expect(p.run("location.hash")).toBe("#/monitor?tiles=w%3Dindices%2Cm%3Dstock%3AAAPL");
    expect(p.stored["mon.tiles"]).toBe("w=indices,m=stock:AAPL");
    // a tile opened
    p.run(`ROUTE.tab = "monitor"; ROUTE.params = { tiles: "m=stock:AAPL,w=fx,n=macro,c=ipos,o=SPX" }; ${press({ mon: "open", i: "0" })}`);
    expect(p.run("OPENED")).toEqual([{ key: "stock:AAPL" }]);
    p.run(press({ mon: "open", i: "2" }));
    expect(p.run("location.hash")).toBe("#/news?topic=macro");
    p.run(press({ mon: "open", i: "3" }));
    expect(p.run("location.hash")).toBe("#/calendar?kind=ipos");
    p.run(press({ mon: "open", i: "1" }));
    expect(p.run("location.hash")).toBe("#/world?board=fx");
    p.run(press({ mon: "open", i: "4" }));
    expect(p.run("location.hash")).toBe("#/options?symbol=SPX&view=chain");
  });
});
