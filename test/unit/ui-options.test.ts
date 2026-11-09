import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE OPTIONS PANE (ui/options.js): the route's symbol and expiry read (the last symbol remembered, SPY at first), the head card with the
 * symbol box, the chips, the underlying and the expiry strip, the chosen expiry's figures as tiles, the volatility card (the term
 * structure and every expiry's row), the smile, the chain with calls and puts either side of the strike (a leg in the money shaded, the
 * strike nearest the underlying marked), the pane's states, the route moved in place by a chip, an expiry and the box, a function's way to
 * a view, and the market a chain is read for. Run as the page runs it: plain scripts in one global scope after ui/core.js, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "options.js"];
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
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" }, classList: { add() {}, remove() {} } }, hidden: false },
    location: { hash: "#/options", origin: "http://127.0.0.1:4820" },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "options"; var SCROLLS = []; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: (s) => ({ sel: s, scrollIntoView: (o) => SCROLLS.push([s, o]) }) }; var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h);`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, stored };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const leg = (o: Record<string, unknown>) => ({ bid: 3, ask: 3.25, last: 3.11, mark: 3.15, iv: 26.42, delta: 0.5451, gamma: 0.0567, theta: -0.796, vega: 0.1035, oi: 1374, volume: 12564, change: 1.375, at: "2026-11-09T20:59:52.000Z", ...o });
const GOOD = {
  ok: true,
  asOf: NOW,
  symbol: "AAPL",
  kind: "stock",
  underlying: { symbol: "AAPL", price: 350.51, change: 8.32, changePct: 2.4301, at: "2026-11-09T20:59:59.000Z", iv30: 22.87, iv30Change: -2.52, from: "Cboe · 15 min delayed", delayMs: 900_000 },
  expiries: [
    { expiry: "2026-11-11", days: 2, contracts: 96, atmIv: 26.35, callOi: 15376, putOi: 19998, callVolume: 111994, putVolume: 65382, pcOi: 1.3, pcVolume: 0.58, maxPain: 347.5, straddle: { strike: 350, price: 5.61, pct: 1.6 }, skew25: 3.3, underlying: 350.51 },
    { expiry: "2026-12-18", days: 39, contracts: 204, atmIv: 23.37, callOi: 381650, putOi: 348025, callVolume: 32201, putVolume: 48839, pcOi: 0.91, pcVolume: 1.52, maxPain: 330, straddle: { strike: 350, price: 21.5, pct: 6.13 }, skew25: -0.4, underlying: 350.51 },
    { expiry: "2027-01-15", days: 67, contracts: 180, callOi: 1000, putOi: 900, callVolume: 10, putVolume: 20, underlying: 350.51 },
  ],
  expiry: "2026-11-11",
  chain: [
    { strike: 340, call: leg({ bid: 11.2, ask: 11.5, last: 11.3, iv: 30.12, delta: 0.84 }), put: leg({ bid: 0.6, ask: 0.7, last: 0.66, iv: 30.58, delta: -0.16, oi: 1500, volume: 800 }) },
    { strike: 350, call: leg({}), put: leg({ bid: 2.41, ask: 2.55, last: 2.41, iv: 26.53, delta: -0.4554, oi: 895, volume: 15905 }) },
    { strike: 360, call: leg({ bid: 0.5, ask: 0.6, last: 0.55, iv: 25.55, delta: 0.19, oi: 2000, volume: 5000 }) },
  ],
  strikes: 48,
  smile: [{ strike: 340, callIv: 30.12, putIv: 30.58, callDelta: 0.84, putDelta: -0.16 }, { strike: 350, callIv: 26.42, putIv: 26.53, callDelta: 0.5451, putDelta: -0.4554 }, { strike: 360, callIv: 25.55, callDelta: 0.19 }],
  from: "Cboe · 15 min delayed",
  readAt: NOW,
  unit: "USD",
  notes: ["Cboe's delayed quotes, fifteen minutes behind the market: every implied volatility and every greek is Cboe's own.", "Read off the chain, nothing estimated."],
};

describe("the options pane", () => {
  it("reads the route: SPY where nothing is named and nothing remembered, the last symbol read where one is, a symbol in capitals with its ^ read through, a day only as YYYY-MM-DD, a view only chain or skew; the path it asks", () => {
    const p = page(() => undefined);
    expect(p.run("opParams({})")).toEqual({ symbol: "SPY", expiry: "", view: "" });
    expect(p.run("opParams({ symbol: '^spx', expiry: '2026-12-18', view: 'skew' })")).toEqual({ symbol: "SPX", expiry: "2026-12-18", view: "skew" });
    expect(p.run("opParams({ symbol: 'not a ticker', expiry: 'friday', view: 'greeks' })")).toEqual({ symbol: "SPY", expiry: "", view: "" });
    expect(p.run("opPath({ symbol: 'BRK.B', expiry: '2026-12-18' })")).toBe("/api/account/options?symbol=BRK.B&expiry=2026-12-18");
    const q = page(() => undefined, { "op.symbol": "NVDA" });
    expect(q.run("opParams({})")).toEqual({ symbol: "NVDA", expiry: "", view: "" });
    expect(q.run("opParams({ symbol: 'btc' })")).toEqual({ symbol: "BTC", expiry: "", view: "" });
  });

  it("says a figure its own way: a count whole or to a tenth, an IV to a tenth with its sign, a delta to two places, a day as a person reads it", () => {
    const p = page(() => undefined);
    expect(p.run("[opNum(7553.3301), opNum(4.88, 3), opCount(15376), opCount(131.4), opCount('x'), opIv(26.35), opIv(undefined), opDelta(0.5451), opDelta(-0.4554), opSigned(3.3), opSigned(-0.4), opSigned(0), opDays(2), opDays(0.4), opDay('2026-11-20'), opDay('2027-01-15'), opWhen('2026-11-09T20:59:59.000Z')]")).toEqual(["7,553.33", "4.880", "15,376", "131.4", "—", "26.4%", "—", "0.55", "−0.46", "+3.3", "−0.4", "0.0", "2 d", "0.4 d", "20 Nov", "15 Jan 27", "15:59"]);
  });

  it("draws the parts: the underlying with its 30-day IV, the strip with the chosen expiry pressed, the tiles, every expiry's row, the smile and the term structure as SVGs, and the chain with calls and puts either side of the strike — the money's row marked, a leg in the money shaded, a missing leg seven empty cells", () => {
    const p = page(() => undefined);
    const under = p.run<string>(`opUnderHtml(${JSON.stringify(GOOD.underlying)}, "stock")`);
    expect(under).toContain('<span class="op-sym mono">AAPL</span> <span class="op-num">350.51</span>');
    expect(under).toContain('<span class="up">+8.32</span>');
    expect(under).toContain('IV30 <b>22.9%</b> <span class="down small">−2.5</span>');
    expect(under).toContain("Cboe · 15 min delayed · 15:59 New York</span>");
    expect(p.run<string>(`opUnderHtml({ symbol: "BTC/USD", price: 74881.15, from: "Deribit · live", delayMs: 0 }, "crypto")`)).toContain("Deribit · live · prices in dollars at each expiry's underlying");
    const strip = p.run<string>(`opStripHtml(${JSON.stringify(GOOD.expiries)}, "2026-12-18")`);
    expect(strip).toContain('<button type="button" class="op-exp" data-op="expiry" data-expiry="2026-11-11" aria-pressed="false"><span class="op-exp-day">11 Nov</span><span class="op-exp-sub">2 d · 26.4%</span></button>');
    expect(strip).toContain('data-expiry="2026-12-18" aria-pressed="true"');
    expect(strip).toContain('<span class="op-exp-day">15 Jan 27</span><span class="op-exp-sub">67 d</span>');
    const tiles = p.run<string>(`opSummaryHtml(${JSON.stringify(GOOD.expiries[0])}, "stock")`);
    expect(tiles).toContain('<span class="label">ATM IV</span><b>26.4%</b>');
    expect(tiles).toContain('<span class="label">Put / call · OI</span><b>1.30</b>');
    expect(tiles).toContain('<span class="label">Max pain</span><b>347.50</b>');
    expect(tiles).toContain('<span class="label">Straddle</span><b>5.61 <span class="dim small">±1.6%</span></b>');
    expect(tiles).toContain('<span class="label">Skew 25Δ</span><b>+3.3 <span class="dim small">pts</span></b>');
    expect(tiles).toContain('<b><span class="small">15,376 C · 19,998 P</span></b>');
    expect(tiles).not.toContain("Underlying future");
    expect(p.run<string>(`opSummaryHtml(${JSON.stringify(GOOD.expiries[0])}, "crypto")`)).toContain('<span class="label">Underlying future</span><b>350.51</b>');
    expect(p.run<string>(`opSummaryHtml(${JSON.stringify(GOOD.expiries[2])}, "stock")`)).toContain('<span class="label">ATM IV</span><b>—</b>');
    const terms = p.run<string>(`opExpiriesTable(${JSON.stringify(GOOD.expiries)}, "2026-11-11")`);
    expect(terms).toContain('<tr data-k="2026-11-11" class="op-on"><td><button type="button" class="link op-exp-link on" data-op="expiry" data-expiry="2026-11-11">11 Nov</button></td><td class="r"><span class="dim">2 d</span></td><td class="r"><span class="op-num">26.4%</span></td><td class="r"><span class="">+3.3</span></td><td class="r">1.30</td><td class="r">347.50</td><td class="r"><span title="5.61 at the 350 strike">±1.6%</span></td></tr>');
    expect(terms).toContain('<tr data-k="2026-12-18"><td><button type="button" class="link op-exp-link" data-op="expiry" data-expiry="2026-12-18">18 Dec</button></td>');
    expect(terms).toContain('<span class="down">−0.4</span>');
    expect(terms).toContain('<td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td></tr>');
    const term = p.run<string>(`opTermHtml(${JSON.stringify(GOOD.expiries)})`);
    expect(term).toContain('<svg class="op-svg" viewBox="0 0 420 150" role="img" aria-label="At-the-money implied volatility by expiry">');
    expect(term).toContain('<path class="op-line term" d="M');
    expect(term).toContain(">11 Nov</text>");
    expect(p.run<string>(`opTermHtml([${JSON.stringify(GOOD.expiries[0])}])`)).toBe("");
    const smile = p.run<string>(`opSmileHtml(${JSON.stringify(GOOD.smile)}, ${JSON.stringify(GOOD.chain)}, 350.51)`);
    expect(smile).toContain('aria-label="Implied volatility by strike: calls and puts"');
    expect(smile).toContain('<path class="op-line call" d="M');
    expect(smile).toContain('<path class="op-line put" d="M');
    expect(smile).toContain('<line class="op-mark"');
    expect(smile).toContain('<span class="op-key call"></span> calls · <span class="op-key put"></span> puts · <span class="op-key mark"></span> the underlying</p>');
    expect(p.run<string>(`opSmileHtml([{ strike: 1, callIv: 20 }], [], 1)`)).toBe('<p class="empty">Too few implied volatilities to draw a smile.</p>');
    const chain = p.run<string>(`opChainHtml(${JSON.stringify(GOOD.chain)}, 350.51)`);
    expect(chain).toContain('<th scope="colgroup" colspan="7" class="op-side">Calls</th><th scope="col" class="op-strike r">Strike</th><th scope="colgroup" colspan="7" class="op-side">Puts</th>');
    // 340: the call in the money (shaded), the put not
    expect(chain).toContain('<tr data-k="340"><td class="op-itm r">11.20</td><td class="op-itm r">11.50</td><td class="op-itm r">11.30</td><td class="op-itm r">30.1%</td><td class="op-itm r">0.84</td><td class="op-itm r">1,374</td><td class="op-itm r">12,564</td><td class="op-strike r"><b>340</b></td><td class="r">0.60</td><td class="r">0.70</td><td class="r">0.66</td><td class="r">30.6%</td><td class="r">−0.16</td><td class="r">1,500</td><td class="r">800</td></tr>');
    // 350: the money's row
    // 350: the money's row; its call is in the money by the 0.51, so shaded
    expect(chain).toContain('<tr data-k="350" class="op-atm"><td class="op-itm r">3.00</td>');
    // 360: the put side missing, in the money: seven shaded empty cells
    expect(chain).toContain('<td class="op-strike r"><b>360</b></td>' + '<td class="op-itm r"></td>'.repeat(7) + "</tr>");
    expect(p.run<string>("opChainHtml([], 1)")).toBe('<p class="empty">No strikes in this expiry.</p>');
  });

  it("draws the pane: a skeleton with the symbol box while the chain is read, then the cards; the last symbol remembered; a chip, an expiry and the box move the route in place; a function's view brought into view once; the refusal in words", async () => {
    const p = page(() => GOOD);
    // (the stand-in browser's hash never moves, so the route is set by hand, as the page's would be from the address)
    p.run("ROUTE.params = { symbol: 'AAPL' }; renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'AAPL' } })");
    const first = p.run<string>("EL.innerHTML");
    expect(first).toContain('class="skel-rows"');
    expect(first).toContain('<input class="op-in mono" name="symbol" data-op="symbol" value="AAPL"');
    expect(p.asked).toEqual(["/api/account/options?symbol=AAPL"]);
    await settle();
    await settle();
    p.run("renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'AAPL' } })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<section class="sec op-card" id="op-head" data-k="head" aria-label="Options · AAPL"><div class="sec-head"><h2 class="h2">Options · AAPL</h2><span class="small dim">Cboe · 15 min delayed</span></div>');
    expect(html).toContain('<button type="button" class="chip on" data-op="chip" data-symbol="AAPL" aria-pressed="true">AAPL</button>');
    expect(html).toContain('<button type="button" class="chip" data-op="chip" data-symbol="SPY" aria-pressed="false">SPY</button>');
    expect(html).toContain('id="op-skew" data-k="skew" aria-label="Volatility"');
    expect(html).toContain('<h2 class="h2">Smile · 11 Nov</h2>');
    expect(html).toContain('<h2 class="h2">Chain · 11 Nov</h2><span class="small dim">2 d · 96 contracts · 3 of 48 strikes, around the money</span>');
    expect(html).toContain('<p class="small dim op-asof">Read 16:32 New York · Cboe · 15 min delayed<details class="op-foot"><summary>Where this comes from</summary><p>Cboe&#39;s delayed quotes, fifteen minutes behind the market: every implied volatility and every greek is Cboe&#39;s own.</p>');
    expect(html).not.toContain("mk-missing");
    expect(p.stored["op.symbol"]).toBe("AAPL");
    expect(p.asked).toEqual(["/api/account/options?symbol=AAPL"]);
    // a function named a view: brought into view once
    p.run("renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'AAPL', view: 'skew' } })");
    expect(p.run("SCROLLS")).toEqual([["#op-skew", { block: "start", behavior: "smooth" }]]);
    p.run("renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'AAPL', view: 'skew' } })");
    expect(p.run("SCROLLS.length")).toBe(1);
    // the route moves in place (the stand-in browser's hash never moves, so the route is set by hand before each press)
    p.run("ROUTE.params = { symbol: 'AAPL', view: 'skew' }; opClick({ target: { closest: (s) => (s === '[data-op]' ? { dataset: { op: 'expiry', expiry: '2026-12-18' } } : null) } })");
    p.run("ROUTE.params = { symbol: 'AAPL', expiry: '2026-12-18' }; opClick({ target: { closest: (s) => (s === '[data-op]' ? { dataset: { op: 'chip', symbol: 'SPX' } } : null) } })");
    p.run("ROUTE.params = { symbol: 'SPX' }; opSubmit({ preventDefault() {}, target: { closest: (s) => (s === '[data-op=form]' ? { querySelector: () => ({ value: ' ^vix ' }) } : null) } })");
    p.run("ROUTE.params = { symbol: 'VIX' }; opSubmit({ preventDefault() {}, target: { closest: (s) => (s === '[data-op=form]' ? { querySelector: () => ({ value: 'not a ticker' }) } : null) } })");
    expect(p.run("MOVES")).toEqual(["#/options?symbol=AAPL&expiry=2026-12-18", "#/options?symbol=SPX", "#/options?symbol=VIX"]);
    // a late read: the refusal under the boards that stand
    p.run("WD = undefined; OP.read = { ...OP.read, body: { ok: false, refusal: { code: 'E_VENUE_UNREACHABLE', message: 'Cboe did not answer' } } }");
    p.run("renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'AAPL' } })");
    expect(p.run<string>("EL.innerHTML")).toContain(`<p class="mk-missing">Couldn't read the chain again just now: Cboe did not answer. This is what was read at 16:32.</p>`);
    // a refusal from the first read
    const q = page(() => ({ ok: false, refusal: { code: "E_VENUE_REJECTED", message: "Cboe has no options file for ZZZZ (HTTP 403)" } }));
    q.run("ROUTE.params = { symbol: 'ZZZZ' }; renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'ZZZZ' } })");
    await settle();
    await settle();
    q.run("renderOptions({ el: EL, owner: true, lens: { kind: 'all' }, params: { symbol: 'ZZZZ' } })");
    const no = q.run<string>("EL.innerHTML");
    expect(no).toContain('<h2 class="h2">Options · ZZZZ</h2>');
    expect(no).toContain(`<div class="msg no">Couldn't read the chain: Cboe has no options file for ZZZZ (HTTP 403).</div>`);
    expect(q.stored["op.symbol"]).toBeUndefined();
  });

  it("names the market a chain is read for — a US share's ticker, BTC or ETH from a coin or a perpetual (Kraken's XBT read as BTC), nothing for the rest — and finds its way to the page: a symbol where one is given, the page's own otherwise, in place where the page shows", () => {
    const p = page(() => undefined);
    p.run("function mkTicker(item) { return item && item.kind === 'stock' ? String(item.base).toUpperCase() : ''; } function mkIsPreipo(x) { return !!x && !!x.implied; }");
    expect(p.run("opSymbolOf({ kind: 'stock', base: 'aapl', name: 'Apple' })")).toBe("AAPL");
    expect(p.run("opSymbolOf({ kind: 'stock', base: 'OPNAI', name: 'OpenAI', implied: 1 })")).toBe("");
    expect(p.run("opSymbolOf({ kind: 'coin', base: 'BTC', name: 'Bitcoin' })")).toBe("BTC");
    expect(p.run("opSymbolOf({ kind: 'perp', base: 'xyz:ETH', name: 'ETH perp' })")).toBe("ETH");
    expect(p.run("opSymbolOf({ kind: 'coin', base: 'XBT', name: 'Bitcoin' })")).toBe("BTC");
    expect(p.run("opSymbolOf({ kind: 'coin', base: 'SOL', name: 'Solana' })")).toBe("");
    expect(p.run("opSymbolOf({ kind: 'event', base: 'FED', name: 'Fed cut' })")).toBe("");
    expect(p.run("opSymbolOf(null)")).toBe("");
    p.run("ROUTE.tab = 'markets'; opGo('NVDA', 'chain')");
    expect(p.run("location.hash")).toBe("#/options?symbol=NVDA&view=chain");
    expect(p.run("MOVES")).toEqual([]);
    p.run("ROUTE.tab = 'options'; ROUTE.params = { symbol: 'NVDA', expiry: '2026-12-18' }; opGo('', 'skew')");
    expect(p.run("MOVES")).toEqual(["#/options?symbol=NVDA&view=skew"]);
    expect(p.run("OP.scrolled")).toBe("");
  });
});
