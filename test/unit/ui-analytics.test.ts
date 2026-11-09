import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE ANALYTICS PANE (ui/analytics.js): the route's markets, range and view read and checked, the path it asks, the five views drawn
 * from the account's answer — the comparison's lines and figures, the correlation's toned matrix, the volatility's lines and standings,
 * the betas, the seasons — the pane's states, a market added from the search or a function and removed by its chip, the range and the
 * view moving the route in place. Run as the page runs it: plain scripts in one global scope after ui/core.js and the Markets page it
 * borrows a market's candle leg from, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "connect.js", "asset.js", "markets.js", "analytics.js"];
/** Monday 9 November 2026, 18:27 New York */
const NOW = "2026-11-09T23:27:00.000Z";

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
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" }, classList: { add() {}, remove() {} } }, hidden: false, activeElement: null },
    location: { hash: "#/analytics", origin: "http://127.0.0.1:4820" },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "analytics"; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: () => null }; var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h);`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked };
}
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};
const DAY = 86_400_000;
const T0 = Date.parse("2026-01-05T00:00:00Z");
const t = Array.from({ length: 5 }, (_, i) => T0 + i * DAY);
const GOOD = {
  ok: true, asOf: NOW, interval: "1d", range: "1Y",
  markets: [{ key: "ex|BTC/USDT", venue: "ex", venueName: "Stand-in Exchange", symbol: "BTC/USDT", bars: 5 }, { key: "broker|AAPL", venue: "broker", venueName: "Stand-in Broker", symbol: "AAPL", bars: 5 }],
  comp: { t, rebased: { "ex|BTC/USDT": [100, 102, 101, null, 105], "broker|AAPL": [100, 99, 101, 103, 102] }, stats: [{ key: "ex|BTC/USDT", venue: "ex", venueName: "Stand-in Exchange", symbol: "BTC/USDT", bars: 5, first: "", last: "", barsPerYear: 365, totalReturnPct: 5, annualisedReturnPct: 12.3, volatilityPct: 49.7, maxDrawdownPct: -1.2, bestBarPct: 2, worstBarPct: -0.98, sharpe: 0.31 }, { key: "broker|AAPL", venue: "broker", venueName: "Stand-in Broker", symbol: "AAPL", bars: 5, first: "", last: "", barsPerYear: 252, totalReturnPct: 2, maxDrawdownPct: -1 }] },
  corr: { keys: ["ex|BTC/USDT", "broker|AAPL"], matrix: [[1, -0.35], [-0.35, 1]], bars: [[4, 3], [3, 4]] },
  hvg: { windows: [20, 60], series: { "ex|BTC/USDT": { t: t.slice(1), hv: { "20": [null, null, 40.5, 42.1], "60": [null, null, null, null] }, now: { "20": 42.1 }, low: { "20": 40.5 }, high: { "20": 42.1 } }, "broker|AAPL": { t: t.slice(1), hv: { "20": [null, 20, 21, 19.5], "60": [null, null, null, null] }, now: { "20": 19.5 }, low: { "20": 19.5 }, high: { "20": 21 } } } },
  beta: [{ key: "broker|AAPL", against: "ex|BTC/USDT", bars: 3, beta: -0.0131, correlation: -0.0255, r2: 0.0006, alphaPct: 0.07 }],
  seag: { months: [{ month: "Jan", by: { "ex|BTC/USDT": { avgPct: 3.1, years: 2, upYears: 1 }, "broker|AAPL": { years: 0, upYears: 0 } } }, { month: "Feb", by: { "ex|BTC/USDT": { avgPct: -1.5, years: 1, upYears: 0 }, "broker|AAPL": { avgPct: 0.4, years: 1, upYears: 1 } } }], weekdays: [{ day: "Mon", by: { "ex|BTC/USDT": { avgPct: 0.123, n: 40, upShare: 0.55 }, "broker|AAPL": { n: 0 } } }] },
  missing: [{ key: "ex|ZZZ", why: "Stand-in Exchange lists no ZZZ", code: "E_VENUE_REJECTED" }],
  notes: ["Every figure here is arithmetic over the bars."],
};

describe("the analytics pane", () => {
  it("reads the route: the markets as venue|symbol (eight at most, no repeats, a bad one dropped), the range with its bars, the view; the path it asks; a market's short name with its venue where two share a symbol", () => {
    const p = page(() => undefined);
    expect(p.run("anParams({})")).toEqual({ markets: [], range: "1Y", interval: "1d", view: "comp" });
    expect(p.run("anParams({ markets: 'ex|BTC/USDT, broker|AAPL,ex|BTC/USDT,AAPL,Ex|X', range: '5Y', view: 'seag' })")).toEqual({ markets: ["ex|BTC/USDT", "broker|AAPL"], range: "5Y", interval: "1w", view: "seag" });
    expect(p.run("anParams({ markets: Array.from({ length: 10 }, (_, i) => 'ex|M' + i).join(','), range: '2Y', view: 'greeks' }).markets.length")).toBe(8);
    expect(p.run("anPath(anParams({ markets: 'ex|BTC/USDT,broker|AAPL', range: '3M' }))")).toBe("/api/account/analytics?markets=ex%7CBTC%2FUSDT%2Cbroker%7CAAPL&interval=4h&range=3M");
    expect(p.run("[anName('ex|BTC/USDT', ['ex|BTC/USDT', 'broker|AAPL']), anName('ex|AAPL', ['ex|AAPL', 'broker|AAPL']), anPct(5), anPct(-1.234, 2), anPct(0), anPct(undefined)]")).toEqual(["BTC/USDT", "AAPL @ ex", '<span class="up">+5.0%</span>', '<span class="down">−1.23%</span>', '<span class="flat">0.0%</span>', '<span class="dim">—</span>']);
  });

  it("draws the five views: the comparison's lines (a gap left where a market has no bar) with the legend and each market's figures; the correlation matrix toned, the common bars on hover; the volatility lines and standings; the betas to the first; the months with the years up and the weekdays", () => {
    const p = page(() => undefined);
    const pr = `{ markets: ["ex|BTC/USDT", "broker|AAPL"], range: "1Y", interval: "1d", view: "comp" }`;
    const comp = p.run<string>(`anCompHtml(${JSON.stringify(GOOD)}, ${pr})`);
    expect(comp).toContain('<p class="small an-legend"><span class="an-key an-c0"></span> BTC/USDT · <span class="an-key an-c1"></span> AAPL</p>');
    expect(comp).toContain('<svg class="an-chart" viewBox="0 0 720 220" role="img" aria-label="BTC/USDT, AAPL">');
    expect(comp).toContain('<line class="an-base"');
    expect(comp).toMatch(/<path class="an-line an-c0" d="M[\d. ]+L[\d. ]+L[\d. ]+M[\d. ]+" \/>/);
    expect(comp).toMatch(/<path class="an-line an-c1" d="M[\d. ]+L[\d. ]+L[\d. ]+L[\d. ]+L[\d. ]+" \/>/);
    expect(comp).toContain('<tr data-k="ex|BTC/USDT"><td><span class="an-name"><span class="an-key an-c0"></span> BTC/USDT</span> <span class="dim small">Stand-in Exchange</span></td><td class="r"><span class="up">+5.0%</span></td><td class="r"><span class="up">+12.3%</span></td><td class="r">49.7%</td><td class="r"><span class="down">−1.2%</span></td><td class="r"><span class="up">+2.00%</span></td><td class="r"><span class="down">−0.98%</span></td><td class="r">0.31</td><td class="r"><span class="dim small">5 · 365/yr</span></td></tr>');
    expect(comp).toContain('<td class="r"><span class="up">+2.0%</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="down">−1.0%</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim small">5 · 252/yr</span></td></tr>');
    expect(comp).toContain("Rebased to 100 at the first bar every market has, over 1Y of 1d bars");
    const corr = p.run<string>(`anCorrHtml(${JSON.stringify(GOOD)})`);
    expect(corr).toContain('<table class="t an-table an-matrix"><thead><tr><th scope="col"></th><th scope="col" class="r">BTC/USDT</th><th scope="col" class="r">AAPL</th></tr></thead>');
    expect(corr).toContain('<tr data-k="ex|BTC/USDT"><th scope="row">BTC/USDT</th><td class="r an-hi" title="4 common bars">1.00</td><td class="r an-midlo" title="3 common bars">-0.35</td></tr>');
    expect(p.run<string>(`anCorrHtml({ corr: { keys: ["a|b"], matrix: [[1]], bars: [[3]] } })`)).toContain("Two markets at least");
    const hvg = p.run<string>(`anHvgHtml(${JSON.stringify(GOOD)})`);
    expect(hvg).toContain("the 20-bar window</p>");
    expect(hvg).toContain('<svg class="an-chart"');
    expect(hvg).toContain('<th scope="col" class="r">20-bar now</th><th scope="col" class="r">low – high</th><th scope="col" class="r">60-bar now</th>');
    expect(hvg).toContain('<tr data-k="ex|BTC/USDT"><td><span class="an-name"><span class="an-key an-c0"></span> BTC/USDT</span></td><td class="r"><b>42.1%</b></td><td class="r"><span class="dim small">40.5% – 42.1%</span></td><td class="r"><span class="dim">—</span></td><td class="r"></td></tr>');
    const beta = p.run<string>(`anBetaHtml(${JSON.stringify(GOOD)})`);
    expect(beta).toContain('<th scope="col" class="r">Beta to BTC/USDT</th>');
    expect(beta).toContain('<tr data-k="broker|AAPL"><td><span class="an-name"><span class="an-key an-c1"></span> AAPL</span></td><td class="r"><b>-0.01</b></td><td class="r">-0.03</td><td class="r">0.00</td><td class="r"><span class="up">+0.1%</span></td><td class="r"><span class="dim small">3</span></td></tr>');
    expect(beta).toContain("The first market named is the one measured against: put the index first.");
    const seag = p.run<string>(`anSeagHtml(${JSON.stringify(GOOD)})`);
    expect(seag).toContain('<tr data-k="Jan"><th scope="row">Jan</th><td class="r"><span class="up">+3.1%</span> <span class="dim small">1/2</span></td><td class="r"><span class="dim">—</span></td></tr>');
    expect(seag).toContain('<h3 class="label an-h3">By weekday</h3>');
    expect(seag).toContain('<tr data-k="Mon"><th scope="row">Mon</th><td class="r"><span class="up">+0.123%</span> <span class="dim small">55% up · 40</span></td><td class="r"><span class="dim">—</span></td></tr>');
  });

  it("draws the pane: the chips, the search and the presets alone where no market is named; a skeleton then the view; the range and the view move the route in place, a chip removes its market, a found market joins, a function adds or shows; the refusal in words", async () => {
    const p = page((path) => (path.includes("/api/account/analytics") ? GOOD : path.includes("explore?q=sol") ? { ok: true, items: [{ key: "coin:SOL", kind: "coin", base: "SOL", name: "SOL", at: [{ venue: "ex", venueName: "Stand-in Exchange", symbol: "SOL/USDT", connected: true, price: 1 }] }] } : { ok: true, items: [] }));
    p.run("renderAnalytics({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    const empty = p.run<string>("EL.innerHTML");
    expect(empty).toContain('<div class="an-chips"><span class="small dim">No market yet.</span></div>');
    expect(empty).toContain('<input class="an-in" name="q" value="" placeholder="Add a market: AAPL, BTC, SPY…"');
    expect(empty).toContain('<button type="button" class="link" data-an="preset" data-syms="SPY,QQQ,IWM,DIA">US indices</button>');
    expect(empty).toContain("<p class=\"empty\">Name a market or two");
    expect(p.asked).toEqual([]);
    p.run("ROUTE.params = { markets: 'ex|BTC/USDT,broker|AAPL' }; renderAnalytics({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.run<string>("EL.innerHTML")).toContain('class="skel-rows"');
    expect(p.asked).toEqual(["/api/account/analytics?markets=ex%7CBTC%2FUSDT%2Cbroker%7CAAPL&interval=1d&range=1Y"]);
    await settle();
    p.run("renderAnalytics({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<span class="chip an-chip an-c0" data-k="ex|BTC/USDT"><span class="an-key an-c0"></span>BTC/USDT<button type="button" class="an-x" data-an="remove" data-key="ex|BTC/USDT" aria-label="Remove BTC/USDT">×</button></span>');
    expect(html).toContain('<button type="button" data-an="range" data-range="1Y" aria-pressed="true" title="1d bars">1Y</button>');
    expect(html).toContain('<section class="sec an-card" id="an-comp" data-k="comp" aria-label="Compare"><div class="sec-head"><h2 class="h2">Compare</h2><div class="seg an-views" role="group" aria-label="View"><button type="button" data-an="view" data-view="comp" aria-pressed="true">Compare</button>');
    expect(html).toContain('<p class="mk-missing">ZZZ: Stand-in Exchange lists no ZZZ.</p>');
    expect(html).toContain('<p class="small dim an-asof">Read 18:27 New York · BTC/USDT at Stand-in Exchange, 5 bars; AAPL at Stand-in Broker, 5 bars<details class="an-foot">');
    // the route moves in place
    const press = (dataset: Record<string, string>) => `anClick({ target: { closest: (s) => (s === "[data-an]" ? { dataset: ${JSON.stringify(dataset)} } : null) } })`;
    p.run(`ROUTE.params = { markets: 'ex|BTC/USDT,broker|AAPL' }; ${press({ an: "view", view: "corr" })}`);
    p.run(`ROUTE.params = { markets: 'ex|BTC/USDT,broker|AAPL', view: 'corr' }; ${press({ an: "range", range: "5Y" })}`);
    p.run(`ROUTE.params = { markets: 'ex|BTC/USDT,broker|AAPL', view: 'corr', range: '5Y' }; ${press({ an: "remove", key: "broker|AAPL" })}`);
    p.run(`ROUTE.params = { markets: 'ex|BTC/USDT', view: 'corr', range: '5Y' }; ${press({ an: "add", key: "ex|SOL/USDT" })}`);
    expect(p.run("MOVES")).toEqual(["#/analytics?markets=ex%7CBTC%2FUSDT%2Cbroker%7CAAPL&view=corr", "#/analytics?markets=ex%7CBTC%2FUSDT%2Cbroker%7CAAPL&range=5Y&view=corr", "#/analytics?markets=ex%7CBTC%2FUSDT&range=5Y&view=corr", "#/analytics?markets=ex%7CBTC%2FUSDT%2Cex%7CSOL%2FUSDT&range=5Y&view=corr"]);
    // the search: the matches as chips, each a candle leg
    p.run("anSearch('sol')");
    await settle();
    p.run("ROUTE.params = { markets: 'ex|BTC/USDT' }; renderAnalytics({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.run<string>("EL.innerHTML")).toContain('<div class="an-found"><button type="button" class="chip" data-an="add" data-key="ex|SOL/USDT">SOL <span class="dim">· Stand-in Exchange</span></button></div>');
    // a function's way, from another page: a market joins the kept set, or the view shows
    p.run("location.hash = '#/markets'; ROUTE.tab = 'markets'; ROUTE.params = {}; anShow({ kind: 'stock', base: 'NVDA', name: 'NVIDIA', at: [{ venue: 'broker', venueName: 'Stand-in Broker', symbol: 'NVDA', connected: true, price: 1 }] }, 'beta')");
    expect(p.run("location.hash")).toBe("#/analytics?markets=broker%7CNVDA&view=beta");
    p.run("location.hash = '#/markets'; anShow(null, 'seag')");
    expect(p.run("location.hash")).toBe("#/analytics?view=seag");
    // the refusal
    const q = page(() => ({ ok: false, refusal: { code: "E_ACCOUNT_BAD_ACTION", message: "8 markets at most" } }));
    q.run("ROUTE.params = { markets: 'ex|BTC/USDT' }; renderAnalytics({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    await settle();
    q.run("renderAnalytics({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(q.run<string>("EL.innerHTML")).toContain(`<div class="msg no">Couldn't read the bars: 8 markets at most.</div>`);
  });
});
