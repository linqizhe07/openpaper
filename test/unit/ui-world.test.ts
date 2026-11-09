import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE WORLD PANE (ui/world.js): the four boards as GET /api/account/world gives them — the indices (a note on hover, a yield said in
 * percent with its change in basis points), the yield curve (the SVG with the curves a month and a year before, the legend, the spreads,
 * each tenor against a week, a month and a year), the currencies (live or a fixing, said as a tag), the commodities (the oracle, the mark,
 * the unit, the volume); the sources under the page, late ones standing in; the skeleton, the refusal, a refusal after a good read; a
 * function's way to a board. Run as the page runs it: plain scripts in one global scope after ui/core.js, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "world.js"];
/** Monday 9 November 2026, 14:30 New York */
const NOW = "2026-11-09T19:30:00.000Z";

function page(answer: (path: string) => unknown) {
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
    location: { hash: "#/world", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "world"; var SCROLLS = []; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: (s) => ({ sel: s, scrollIntoView: (o) => SCROLLS.push([s, o]) }) };`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const pts = (ys: number[]) => [1, 3, 24, 60, 120, 360].map((months, i) => ({ tenor: ["1 Mo", "3 Mo", "2 Yr", "5 Yr", "10 Yr", "30 Yr"][i], months, yield: ys[i] }));
const GOOD = {
  ok: true,
  asOf: "2026-11-09T19:08:34.000Z",
  indices: [
    { id: "cboe:^SPX", name: "S&P 500", symbol: "^SPX", price: 7553.3301, change: 176.4701, changePct: 2.3922, open: 7422.2402, high: 7556.2598, low: 7422.2402, prevClose: 7376.8599, at: "2026-11-09T18:53:34.000Z", from: "Cboe · 15 min delayed", delayMs: 900_000 },
    { id: "cboe:^DJX", name: "Dow Jones Industrial", symbol: "^DJX", price: 52417, change: -1131, changePct: -2.2053, at: "2026-11-09T18:53:34.000Z", from: "Cboe · 15 min delayed", delayMs: 900_000, note: "Cboe's DJX, the Dow divided by a hundred, times a hundred" },
    { id: "cboe:^TNX", name: "US 10-year yield", symbol: "^TNX", price: 4.88, change: 0.021, changePct: 0.4322, high: 4.886, low: 4.831, at: "2026-11-09T19:05:03.836Z", from: "Cboe · 15 min delayed", delayMs: 900_000, unit: "%" },
  ],
  rates: {
    latest: { day: "2026-11-06", points: pts([4.02, 4.19, 4.51, 4.64, 4.86, 5.26]) },
    weekAgo: { day: "2026-10-30", points: pts([4.05, 4.15, 4.38, 4.49, 4.75, 5.18]) },
    monthAgo: { day: "2026-10-07", points: pts([4.1, 4.15, 4.12, 4.2, 4.48, 4.98]) },
    yearAgo: { day: "2025-11-06", points: pts([3.98, 3.92, 3.59, 3.73, 4.1, 4.69]) },
    spreads: { "2s10s": 0.35, "3m10y": 0.67, "5s30s": -0.62 },
    from: "US Treasury par yield curve · 2026-11-06",
  },
  fx: [
    { id: "kraken:EUR/USD", name: "EUR/USD", symbol: "EUR/USD", price: 1.12017, bid: 1.12017, ask: 1.12021, open: 1.11426, change: 0.00591, changePct: 0.5304, at: "2026-11-09T19:08:34.000Z", from: "Kraken · live", delayMs: 0 },
    { id: "ecb:USD/CNY", name: "USD/CNY", symbol: "USD/CNY", price: 6.672878, at: "2026-11-09T15:15:00.000Z", from: "ECB reference rates · 2026-11-09", note: "the ECB's euro fixing of the day, crossed through EUR/USD; not a live price" },
  ],
  commodities: [{ id: "hl:xyz:GOLD", name: "Gold", symbol: "xyz:GOLD", price: 4103.4, mark: 4105.1, prevClose: 4063.8, change: 41.3, changePct: 1.0163, volumeUsd24h: 76_242_585.8, at: "2026-11-09T19:08:34.000Z", from: "Hyperliquid xyz · oracle", delayMs: 0, unit: "$/oz", note: "a perpetual's oracle price" }],
  sources: [
    { id: "indices", name: "Cboe's indices", readAt: "2026-11-09T19:08:34.000Z" },
    { id: "rates", name: "the US Treasury", readAt: "2026-11-09T19:08:34.000Z" },
    { id: "kraken", name: "Kraken", readAt: "2026-11-09T19:07:00.000Z", late: true },
    { id: "ecb", name: "the ECB", readAt: "2026-11-09T19:08:34.000Z" },
    { id: "commodities", name: "Hyperliquid xyz", readAt: "2026-11-09T19:08:34.000Z" },
  ],
  missing: [
    { venue: "kraken", venueName: "Kraken", why: "Kraken did not answer", code: "E_VENUE_UNREACHABLE" },
    { venue: "cboe", venueName: "Cboe", why: "VIX: Cboe refused the request (HTTP 403)" },
  ],
  notes: ["The indices are Cboe's delayed quotes, fifteen minutes behind the market.", "The yield curve is the US Treasury's own par curve."],
};

describe("the world pane", () => {
  it("says a figure its own way: an index to two decimals past a thousand, a currency to four or five, a difference in basis points with its sign, a change coloured, a stamp as New York time", () => {
    const p = page(() => undefined);
    expect(p.run("[wdPx(7553.3301), wdPx(524.17), wdPx(1.12017), wdPx(0.69133), wdPx('x'), wdNum(4.88, 3), wdNum(76242585.8, 0)]")).toEqual(["7,553.33", "524.170", "1.1202", "0.69133", "—", "4.880", "76,242,586"]);
    expect(p.run("[wdBp(0.35), wdBp(-0.12), wdBp(0), wdBp(), wdBp(0.021)]")).toEqual(["+35 bp", "−12 bp", "0 bp", "—", "+2 bp"]);
    expect(p.run("[wdDelta({ change: 176.4701, price: 7553.33 }), wdDelta({ change: -1131, price: 52417 }), wdDelta({ change: 0, price: 1.1 }), wdDelta({ change: 0.00591 }), wdDelta({})]")).toEqual(['<span class="up">+176.47</span>', '<span class="down">−1,131.00</span>', '<span class="flat">0.0000</span>', '<span class="up">+0.00591</span>', '<span class="dim">—</span>']);
    expect(p.run("[wdWhen('2026-11-09T18:53:34.000Z'), wdWhen(undefined), wdWhen('soon')]")).toEqual(["13:53", "—", "—"]);
  });

  it("draws each board: the Dow's note on hover and the yield in percent with its change in basis points, the day's range in a column that folds; the curve's SVG with the earlier curves, the legend, the spreads and each tenor against a week, a month and a year; a pair live or a fixing; a commodity with its unit, oracle, mark and volume", () => {
    const p = page(() => undefined);
    const ix = p.run<string>(`wdIndicesHtml(${JSON.stringify(GOOD.indices)})`);
    expect(ix).toContain('<th scope="col" class="r wd-day">Day</th>');
    expect(ix).toContain('<tr data-k="cboe:^SPX"><td><span class="wd-name">S&amp;P 500</span></td><td class="r"><span class="wd-num">7,553.33</span></td><td class="r"><span class="up">+176.47</span></td>');
    expect(ix).toContain(p.run("chg(2.3922)"));
    expect(ix).toContain('<td class="r wd-day"><span class="dim small">7,422.24–7,556.26</span></td><td class="r"><span class="dim small mono">13:53</span></td>');
    expect(ix).toContain('<span class="wd-name" title="Cboe&#39;s DJX, the Dow divided by a hundred, times a hundred">Dow Jones Industrial</span>');
    expect(ix).toContain('<span class="down">−1,131.00</span>');
    expect(ix).toContain('<td class="r"><span class="wd-num">4.880%</span></td><td class="r">+2 bp</td><td class="r"></td><td class="r wd-day"><span class="dim small">4.831–4.886</span></td>');
    expect(p.run<string>("wdIndicesHtml([])")).toBe('<p class="empty">No index answered.</p>');
    const rates = p.run<string>(`wdRatesHtml(${JSON.stringify(GOOD.rates)})`);
    expect(rates).toContain('<svg class="wd-curve" viewBox="0 0 420 150" role="img" aria-label="The yield curve: 2026-11-06, a month before dashed, a year before dotted">');
    expect(rates).toContain('<path class="wd-line latest" d="M');
    expect(rates).toContain('<path class="wd-line monthAgo" d="M');
    expect(rates).toContain('<path class="wd-line yearAgo" d="M');
    expect(rates).toContain(">1M</text>");
    expect(rates).toContain(">10Y</text>");
    expect(rates).toContain(">30Y</text>");
    expect(rates).toContain('<span class="wd-key latest"></span> 2026-11-06 · <span class="wd-key monthAgo"></span> 2026-10-07 · <span class="wd-key yearAgo"></span> 2025-11-06</p>');
    expect(rates).toContain('<span class="wd-spread"><span class="label">2s10s</span> <b class="">+35 bp</b></span>');
    expect(rates).toContain('<span class="wd-spread"><span class="label">5s30s</span> <b class="down">−62 bp</b></span>');
    expect(rates).toContain('<tr data-k="10 Yr"><td>10 Yr</td><td class="r"><span class="wd-num">4.86%</span></td><td class="r"><span class="up">+11 bp</span></td><td class="r"><span class="up">+38 bp</span></td><td class="r"><span class="up">+76 bp</span></td></tr>');
    expect(p.run<string>("wdRatesHtml({ from: 'US Treasury par yield curve' })")).toBe('<p class="empty">US Treasury par yield curve could not be read.</p>');
    expect(p.run<string>("wdRatesHtml(undefined)")).toBe('<p class="empty">The US Treasury&#39;s curve could not be read.</p>');
    // a curve a week old only: no earlier curves, no legend entries for them, the differences dashed
    const lone = p.run<string>(`wdRatesHtml({ latest: ${JSON.stringify(GOOD.rates.latest)}, from: "x" })`);
    expect(lone).toContain('aria-label="The yield curve: 2026-11-06">');
    expect(lone).not.toContain("monthAgo");
    expect(lone).toContain('<td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td></tr>');
    const fx = p.run<string>(`wdFxHtml(${JSON.stringify(GOOD.fx)})`);
    expect(fx).toContain('<tr data-k="kraken:EUR/USD"><td><span class="wd-name mono">EUR/USD</span></td><td class="r"><span class="wd-num">1.1202</span></td><td class="r"><span class="dim small mono">1.1202 / 1.1202</span></td>');
    expect(fx).toContain('<td><span class="tag up" title="Kraken · live">live</span></td>');
    expect(fx).toContain('<tr data-k="ecb:USD/CNY"><td><span class="wd-name mono">USD/CNY</span></td><td class="r"><span class="wd-num">6.6729</span></td><td class="r"></td><td class="r"></td><td><span class="tag" title="ECB reference rates · 2026-11-09 — the ECB&#39;s euro fixing of the day, crossed through EUR/USD; not a live price">fixing</span></td></tr>');
    expect(p.run<string>("wdFxHtml([])")).toBe('<p class="empty">No currency answered.</p>');
    const c = p.run<string>(`wdCommoditiesHtml(${JSON.stringify(GOOD.commodities)})`);
    expect(c).toContain('<tr data-k="hl:xyz:GOLD"><td><span class="wd-name">Gold</span> <span class="dim small">$/oz</span></td><td class="r"><span class="wd-num">4,103.40</span></td><td class="r"><span class="dim">4,105.10</span></td>');
    expect(c).toContain('<td class="r"><span class="dim small">76,242,586</span></td></tr>');
    expect(p.run<string>("wdCommoditiesHtml([])")).toBe('<p class="empty">No commodity answered.</p>');
    expect(p.run<string>(`wdSourcesHtml(${JSON.stringify(GOOD)})`)).toBe('<p class="small dim wd-sources">Read 14:08 New York · standing in from an earlier answer: Kraken · Cboe: VIX: Cboe refused the request (HTTP 403).</p>');
    expect(p.run<string>(`wdSourcesHtml({ asOf: "2026-11-09T19:08:34.000Z", sources: [], missing: [] })`)).toBe('<p class="small dim wd-sources">Read 14:08 New York.</p>');
  });

  it("draws the pane: a skeleton while the boards are read, then the four cards with whose figures they are, the sources and the notes folded; a board named by a function brought into view once; the refusal in words; a refusal after a good read keeps the boards and says so", async () => {
    const p = page(() => GOOD);
    p.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain('class="skel-rows"');
    expect(p.asked).toEqual(["/api/account/world"]);
    await settle();
    await settle();
    p.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<section class="sec wd-card" id="wd-indices" data-k="indices" aria-label="Indices"><div class="sec-head"><h2 class="h2">Indices</h2><span class="small dim">Cboe · 15 min delayed</span></div>');
    expect(html).toContain('<section class="sec wd-card" id="wd-rates" data-k="rates" aria-label="Yield curve"><div class="sec-head"><h2 class="h2">Yield curve</h2><span class="small dim">US Treasury par yield curve · 2026-11-06</span></div>');
    expect(html).toContain('<section class="sec wd-card" id="wd-fx" data-k="fx" aria-label="Currencies"><div class="sec-head"><h2 class="h2">Currencies</h2><span class="small dim">Kraken · live · ECB reference rates · 2026-11-09</span></div>');
    expect(html).toContain('<section class="sec wd-card" id="wd-commodities" data-k="commodities" aria-label="Commodities"><div class="sec-head"><h2 class="h2">Commodities</h2><span class="small dim">Hyperliquid xyz · oracle</span></div>');
    expect(html).toContain('<p class="small dim wd-sources">Read 14:08 New York · standing in from an earlier answer: Kraken · Cboe: VIX: Cboe refused the request (HTTP 403).</p>');
    expect(html).toContain('<details class="wd-foot small dim"><summary>Where this comes from</summary><p>The indices are Cboe&#39;s delayed quotes, fifteen minutes behind the market.</p>');
    expect(html).not.toContain("mk-missing");
    expect(p.asked).toEqual(["/api/account/world"]);
    // a function named a board: brought into view once it is drawn, and not again on the next draw
    p.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: { board: 'fx' } })");
    expect(p.run("SCROLLS")).toEqual([["#wd-fx", { block: "start", behavior: "smooth" }]]);
    p.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: { board: 'fx' } })");
    expect(p.run("SCROLLS.length")).toBe(1);
    p.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: { board: 'sports' } })");
    expect(p.run("SCROLLS.length")).toBe(1);
    // the boards read again and refused: what was read stands, the refusal under it
    p.run("WD.read = { at: Date.now(), body: { ok: false, refusal: { code: 'E_VENUE_UNREACHABLE', message: 'Cboe did not answer' } }, good: WD.read.good }");
    p.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    const again = p.run<string>("EL.innerHTML");
    expect(again).toContain('id="wd-indices"');
    expect(again).toContain(`<p class="mk-missing">Couldn't read the boards again just now: Cboe did not answer. This is what was read at 14:08.</p>`);
    // the way to a board: the page, and the board in the route; in place where the page already shows
    p.run("var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h); ROUTE.tab = 'markets'; wdGo('indices')");
    expect(p.run("location.hash")).toBe("#/world?board=indices");
    expect(p.run("MOVES")).toEqual([]);
    p.run("ROUTE.tab = 'world'; wdGo('fx')");
    expect(p.run("MOVES")).toEqual(["#/world?board=fx"]);
    expect(p.run("WD.scrolled")).toBe("");
    // a refusal from the first read
    const q = page(() => ({ ok: false, refusal: { code: "E_VENUE_UNREACHABLE", message: "nothing answered" } }));
    q.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    await settle();
    await settle();
    q.run("renderWorld({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(q.run<string>("EL.innerHTML")).toBe(`<div class="wd"><div class="msg no">Couldn't read the boards: nothing answered.</div></div>`);
    expect(q.run("SCROLLS")).toEqual([]);
  });
});
