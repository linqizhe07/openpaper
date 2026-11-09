import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** A SECURITY'S PAGE (ui/security.js): the route's ticker read (the last one remembered), the head with who it is, Nasdaq's last sale,
 * the ways to its other pages, the figures and the description; the analysts' bar, targets against the price and history; the earnings
 * tables; the dividends; the short interest with its share of the float; the holders; the pane's states; the ticker box and the ways
 * moving the route; a function's way to a part. Run as the page runs it: plain scripts in one global scope after ui/core.js and the
 * Markets page it borrows a date from, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "connect.js", "asset.js", "markets.js", "security.js"];
/** Monday 9 November 2026, 17:17 New York */
const NOW = "2026-11-09T22:17:00.000Z";

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
    location: { hash: "#/security", origin: "http://127.0.0.1:4820" },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "security"; var SCROLLS = []; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: (s) => ({ sel: s, scrollIntoView: (o) => SCROLLS.push([s, o]) }) }; var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h); var OPENED = []; openMarket = (x) => OPENED.push(x);`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, stored };
}
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};
const GOOD = {
  ok: true, asOf: NOW, readAt: NOW, symbol: "AAPL", kind: "stock", name: "Apple Inc. Common Stock", stockType: "Common Stock", exchange: "NASDAQ-GS", sector: "Technology", industry: "Computer Manufacturing", region: "North America", description: "Apple revolutionized personal technology <b>in</b> 1984.", nasdaq100: true,
  quote: { last: 350.82, change: 0.11, changePct: 0.03, at: "Nov 9, 2026 5:13 PM ET", bid: 350.82, ask: 350.99, volume: 47523581, marketStatus: "After-Hours", realTime: true, close: 350.69, closeChangePct: 2.43 },
  stats: { previousClose: 342.37, dayLow: 344.78, dayHigh: 352.28, week52Low: 243.42, week52High: 355.38, volume: 47523581, averageVolume: 43273285, marketCapUsd: 5096290905580, sharesOutstanding: 14532000000, annualDividend: 1.08, dividendYieldPct: 0.32, exDividend: "2026-08-10", payDate: "2026-08-13", oneYearTarget: 350, payoutRatioPct: 39.1, peRatio: 39.1, forwardPeg: 3.29, institutionalPct: 76.93 },
  dividends: [{ exDate: "2026-11-12", type: "Cash", amount: 0.27, declared: "2026-11-02", record: "2026-11-12", payment: "2026-11-16" }],
  shortInterest: [{ settlement: "2026-10-15", shares: 131591865, avgDailyVolume: 35498663, daysToCover: 3.71 }, { settlement: "2026-09-30", shares: 120763539, avgDailyVolume: 39858260, daysToCover: 3.03 }],
  analysts: { rating: "Hold", summary: "Based on 29 analysts offering recommendations for 'AAPL'.", count: 29, targetLow: 250, targetMean: 338.28, targetHigh: 400, buy: 15, hold: 8, sell: 6, history: [{ month: "2025-11", buy: 18, hold: 12, sell: 2, consensus: "Buy", target: 270.37 }, { month: "2026-11", buy: 15, hold: 8, sell: 6, consensus: "Buy", target: 338.28 }] },
  earnings: { surprises: [{ quarter: "Sep 2026", reported: "2026-11-02", eps: 2.05, consensus: 1.98, surprisePct: 3.54 }], quarters: [{ period: "Dec 2026", consensus: 2.94, high: 3.18, low: 2.86, estimates: 9, revisionsUp: 4, revisionsDown: 1 }], years: [{ period: "Sep 2027", consensus: 9.68, high: 11.04, low: 8.89, estimates: 12, revisionsUp: 4, revisionsDown: 6 }], pe: [{ period: "2026 Actual", value: 39.76 }], growth: [{ period: "2027", value: 9.73 }] },
  insiders: { buys3m: 0, sells3m: 26, buys12m: 0, sells12m: 45, net3m: -694883, net12m: -1356455, trades: [{ insider: "NEWSTEAD JENNIFER", relation: "Officer", date: "2026-11-03", type: "Automatic Sell", ownType: "Direct", shares: 2399, price: 325.75, held: 29997 }] },
  institutions: { pct: 76.93, total: { holders: 6474, shares: 11180203928 }, increased: { holders: 2762, shares: 320927686 }, decreased: { holders: 3313, shares: 224132119 }, opened: { holders: 186, shares: 33946350 }, soldOut: { holders: 87, shares: 12867403 }, holders: [{ name: "Vanguard Group Inc", date: "2025-12-31", shares: 1426283914, change: 26856752, changePct: 1.919, valueUsd: 488316824000 }, { name: "Blackrock, Inc.", date: "2026-06-30", shares: 1162996939, change: -1301514, changePct: -0.112, valueUsd: 398175262000 }] },
  parts: ["info", "summary", "profile", "dividends", "short", "ratings", "target", "surprise", "forecast", "peg", "insider", "institutions"],
  missing: [{ part: "x", why: "Nasdaq has no x for AAPL" }],
  from: "Nasdaq · as written",
  notes: ["Nasdaq's own pages for the share, read without a key."],
};

describe("a security's page", () => {
  it("reads the route: the ticker in capitals, the last one read where none is named, nothing at first; a part only as listed; the path; the figures said short", () => {
    const p = page(() => undefined);
    expect(p.run("scParams({})")).toEqual({ symbol: "", part: "" });
    expect(p.run("scParams({ symbol: 'brk.b', part: 'anr' })")).toEqual({ symbol: "BRK.B", part: "anr" });
    expect(p.run("scParams({ symbol: 'not a ticker', part: 'greeks' })")).toEqual({ symbol: "", part: "" });
    expect(page(() => undefined, { "sc.symbol": "NVDA" }).run("scParams({})")).toEqual({ symbol: "NVDA", part: "" });
    expect(p.run("scPath('BRK.B')")).toBe("/api/account/security?symbol=BRK.B");
    expect(p.run("[scShort(5096290905580, '$'), scShort(47523581), scShort(694883), scShort(-1356455), scShort(950), scShort('x'), scPct(0.32), scPct(76.93, 1), scSigned(3.54), scSigned(-0.42), scInt(1426283914), scDay('2026-11-12')]")).toEqual(["$5.1T", "47.5M", "695K", "−1.4M", "950", "—", "0.32%", "76.9%", "+3.54", "−0.42", "1,426,283,914", "12 Nov 2026"]);
  });

  it("draws the parts: the head with who it is, Nasdaq's last sale and the close, the ways, the twelve figures, the description escaped, what is missing; the analysts' bar, the targets against the price, the history newest first; the earnings; the dividends; the short interest with its share of the float and its change; the holders", () => {
    const p = page(() => undefined);
    const head = p.run<string>(`scHeadHtml(${JSON.stringify(GOOD)})`);
    expect(head).toContain('<section class="sec sc-card" id="sc-des" data-k="des" aria-label="Apple Inc. Common Stock"><div class="sec-head"><h2 class="h2">Apple Inc. Common Stock</h2><span class="small dim">AAPL · Common Stock · <span class="tag">Nasdaq-100</span></span></div><p class="sc-who">NASDAQ-GS · Technology · Computer Manufacturing</p>');
    expect(head).toContain('<p class="sc-quote"><span class="sc-num">350.82</span> <span class="up">+0.11</span> <span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 0.03%</span> <span class="tag">After-Hours</span> <span class="dim small">closed at 350.69 (+2.43%)</span><span class="dim small"> · Nasdaq\'s last sale, Nov 9, 2026 5:13 PM ET, real time</span></p>');
    expect(head).toContain('<button type="button" class="btn btn-sm" data-sc="market">Market</button><button type="button" class="btn btn-sm" data-sc="options">Options</button><button type="button" class="btn btn-sm" data-sc="news">News</button><button type="button" class="btn btn-sm" data-sc="earnings">Earnings calendar</button><button type="button" class="btn btn-sm" data-sc="filings">Filings</button>');
    expect(head).toContain('<div class="sc-stat"><span class="label">Previous close</span><b>342.37</b></div><div class="sc-stat"><span class="label">Day&#39;s range</span><b>344.78 – 352.28</b></div><div class="sc-stat"><span class="label">52-week range</span><b>243.42 – 355.38</b></div><div class="sc-stat"><span class="label">Volume · average</span><b>47.5M <span class="dim small">· 43.3M</span></b></div><div class="sc-stat"><span class="label">Market cap</span><b>$5.1T</b></div><div class="sc-stat"><span class="label">Shares outstanding</span><b>14.5B</b></div><div class="sc-stat"><span class="label">Dividend · yield</span><b>$1.08 <span class="dim small">· 0.32%</span></b></div><div class="sc-stat"><span class="label">Ex-dividend · pay</span><b>10 Aug 2026 <span class="dim small">· 13 Aug 2026</span></b></div>');
    expect(head).toContain('<span class="label">P/E</span><b>39.1</b>');
    expect(head).toContain('<span class="label">Forward PEG</span><b>3.29</b>');
    expect(head).toContain('<span class="label">Held by institutions</span><b>76.93%</b>');
    expect(head).toContain('<p class="sc-desc">Apple revolutionized personal technology &lt;b&gt;in&lt;/b&gt; 1984.</p><p class="small dim sc-missing">Nasdaq has no x for AAPL.</p>');
    const anr = p.run<string>(`scAnalystsHtml(${JSON.stringify(GOOD)})`);
    expect(anr).toContain('<h2 class="h2">Analysts</h2><span class="small dim"><b>Hold</b> · 29 analysts</span>');
    expect(anr).toContain('<div class="sc-bar" role="img" aria-label="15 buy, 8 hold, 6 sell"><span class="buy" style="width:51.724137931034484%"></span><span class="hold" style="width:27.586206896551722%"></span><span class="sell" style="width:20.689655172413794%"></span></div><p class="small sc-bar-words"><span class="up">15 buy</span> · 8 hold · <span class="down">6 sell</span></p>');
    expect(anr).toContain('<div class="sc-stat"><span class="label">Mean target</span><b>338.28 <span class="down small">−3.6%</span></b></div><div class="sc-stat"><span class="label">High target</span><b>400.00 <span class="up small">+14.0%</span></b></div>');
    expect(anr).toContain('<tr data-k="2026-11"><td>2026-11</td><td>Buy</td><td class="r">15</td><td class="r">8</td><td class="r">6</td><td class="r">338.28</td></tr><tr data-k="2025-11">');
    expect(p.run<string>(`scAnalystsHtml({ symbol: "BRK.B", analysts: { summary: "Consensus information is not available for this symbol", history: [] } })`)).toContain('<span class="small dim">Consensus information is not available for this symbol</span>');
    expect(p.run<string>(`scAnalystsHtml({ symbol: "SPY" })`)).toContain('<p class="empty">Nasdaq has no analyst consensus for SPY.</p>');
    const ee = p.run<string>(`scEarningsHtml(${JSON.stringify(GOOD)})`);
    expect(ee).toContain('<tr data-k="Sep 2026"><td>Sep 2026</td><td>2 Nov 2026</td><td class="r"><span class="sc-num">2.05</span></td><td class="r">1.98</td><td class="r"><span class="up">+3.54%</span></td></tr>');
    expect(ee).toContain('<h3 class="label sc-h3">Quarters ahead</h3>');
    expect(ee).toContain('<tr data-k="Dec 2026"><td>Dec 2026</td><td class="r"><span class="sc-num">2.94</span></td><td class="r"><span class="dim">2.86 – 3.18</span></td><td class="r">9</td><td class="r"><span class="up">4</span> / <span class="down">1</span></td></tr>');
    expect(ee).toContain('<p class="small sc-pe"><span class="label">P/E</span> 2026 Actual <b>39.8</b> <span class="dim">·</span> <span class="label">Growth</span> 2027 <b>9.7%</b></p>');
    const dvd = p.run<string>(`scDividendsHtml(${JSON.stringify(GOOD)})`);
    expect(dvd).toContain('<h2 class="h2">Dividends</h2><span class="small dim">1 paid, the newest first</span>');
    expect(dvd).toContain('<span class="label">Payout ratio</span><b>39.1%</b>');
    expect(dvd).toContain('<tr data-k="2026-11-12"><td>12 Nov 2026</td><td class="r"><span class="sc-num">$0.27</span></td><td>Cash</td><td>2 Nov 2026</td><td>12 Nov 2026</td><td>16 Nov 2026</td></tr>');
    expect(p.run<string>(`scDividendsHtml({ symbol: "PLTR", stats: {}, dividends: [] })`)).toContain('<p class="empty">Nasdaq lists no dividend paid by PLTR.</p>');
    const si = p.run<string>(`scShortHtml(${JSON.stringify(GOOD)})`);
    expect(si).toContain('<div class="sc-stat" title="as of the 15 Oct 2026 settlement"><span class="label">Short interest</span><b>132M</b></div><div class="sc-stat" title="the latest short interest over the shares outstanding Nasdaq counts"><span class="label">Of shares outstanding</span><b>0.91%</b></div><div class="sc-stat" title="the short interest over the average daily volume, as Nasdaq computes it"><span class="label">Days to cover</span><b>3.71</b></div><div class="sc-stat"><span class="label">Change on the settlement before</span><b><span class="up">+9.0%</span></b></div>');
    expect(si).toContain('<tr data-k="2026-10-15"><td>15 Oct 2026</td><td class="r"><span class="sc-num">131,591,865</span></td><td class="r">35,498,663</td><td class="r">3.71</td></tr>');
    const hds = p.run<string>(`scHoldersHtml(${JSON.stringify(GOOD)})`);
    expect(hds).toContain('<h3 class="label sc-h3">Institutions</h3><div class="sc-stats"><div class="sc-stat"><span class="label">Held by institutions</span><b>76.93%</b></div><div class="sc-stat"><span class="label">Holders</span><b>6,474 <span class="dim small">· 11.2B sh</span></b></div>');
    expect(hds).toContain('<tr data-k="Blackrock, Inc."><td><span class="sc-name">Blackrock, Inc.</span></td><td>30 Jun 2026</td><td class="r">1,162,996,939</td><td class="r"><span class="down">−1,301,514 <span class="small">(−0.1%)</span></span></td><td class="r">$398B</td></tr>');
    expect(hds).toContain('<h3 class="label sc-h3">Insiders</h3><div class="sc-stats"><div class="sc-stat"><span class="label">Buys · sells, 3 months</span><b><span class="up">0</span> · <span class="down">26</span></b></div>');
    expect(hds).toContain('<span class="label">Net shares, 12 months</span><b><span class="down">−1,356,455</span></b>');
    expect(hds).toContain('<td><span class="sc-name">NEWSTEAD JENNIFER</span> <span class="dim small">Officer</span></td><td>3 Nov 2026</td><td>Automatic Sell <span class="dim small">Direct</span></td><td class="r">2,399</td><td class="r">325.75</td><td class="r">29,997</td>');
    expect(p.run<string>(`scHoldersHtml({ symbol: "SPY" })`)).toContain('<p class="empty">Nasdaq has no holders for SPY.</p>');
  });

  it("draws the pane: the box alone where no share is named; a skeleton while the page is read, then every card, the ticker remembered; an ETF without the analysts, the earnings and the holders; a part named by a function brought into view once; the ways to the other pages; the box moving the route; the refusal in words", async () => {
    const p = page((path) => (path.includes("SPY") ? { ...GOOD, symbol: "SPY", kind: "etf", name: "SPDR", analysts: undefined, earnings: undefined, insiders: undefined, institutions: undefined } : GOOD));
    p.run("renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain("<p class=\"empty\">Name a US share to read its page");
    expect(p.asked).toEqual([]);
    p.run("ROUTE.params = { symbol: 'AAPL' }; renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.run<string>("EL.innerHTML")).toContain('class="skel-rows"');
    expect(p.asked).toEqual(["/api/account/security?symbol=AAPL"]);
    await settle();
    p.run("renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const html = p.run<string>("EL.innerHTML");
    for (const id of ["des", "anr", "ee", "dvd", "si", "hds"]) expect(html, id).toContain(`id="sc-${id}"`);
    expect(html).toContain('<input class="sc-in mono" name="symbol" data-sc="symbol" value="AAPL"');
    expect(html).toContain('<p class="small dim sc-asof">Read 17:17 New York · Nasdaq · as written<details class="sc-foot"><summary>Where this comes from</summary><p>Nasdaq&#39;s own pages for the share, read without a key.</p></details></p>');
    expect(p.stored["sc.symbol"]).toBe("AAPL");
    // a part named: brought into view once
    p.run("ROUTE.params = { symbol: 'AAPL', part: 'si' }; renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.run("SCROLLS")).toEqual([["#sc-si", { block: "start", behavior: "smooth" }]]);
    p.run("renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.run("SCROLLS.length")).toBe(1);
    // the ways
    const press = (sc: string) => `scClick({ target: { closest: (s) => (s === "[data-sc]" ? { dataset: { sc: "${sc}" } } : null) } })`;
    p.run(`ROUTE.params = { symbol: 'AAPL' }; ${press("market")}`);
    expect(p.run("OPENED")).toEqual([{ key: "stock:AAPL" }]);
    p.run(press("news"));
    expect(p.run("location.hash")).toBe("#/news?symbol=AAPL");
    p.run(press("earnings"));
    expect(p.run("location.hash")).toBe("#/calendar?kind=earnings&symbol=AAPL");
    p.run(press("options"));
    expect(p.run("location.hash")).toBe("#/options?symbol=AAPL");
    // the box, in place; a function's way from another page
    p.run("ROUTE.tab = 'security'; ROUTE.params = { symbol: 'AAPL' }; scSubmit({ preventDefault() {}, target: { closest: (s) => (s === '[data-sc=form]' ? { querySelector: () => ({ value: ' nvda ' }) } : null) } })");
    expect(p.run("MOVES")).toEqual(["#/security?symbol=NVDA"]);
    p.run("ROUTE.tab = 'markets'; scGo('TSLA', 'hds')");
    expect(p.run("location.hash")).toBe("#/security?symbol=TSLA&part=hds");
    p.run("ROUTE.tab = 'security'; scGo('TSLA', 'des')");
    expect(p.run("MOVES.at(-1)")).toBe("#/security?symbol=TSLA");
    // an ETF
    p.run("ROUTE.params = { symbol: 'SPY' }; renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    await settle();
    p.run("renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const etf = p.run<string>("EL.innerHTML");
    expect(etf).toContain('id="sc-dvd"');
    expect(etf).not.toContain('id="sc-anr"');
    expect(etf).not.toContain('id="sc-hds"');
    // the refusal
    const q = page(() => ({ ok: false, refusal: { code: "E_VENUE_REJECTED", message: "Nasdaq lists no share or ETF named ZZZZ" } }));
    q.run("ROUTE.params = { symbol: 'ZZZZ' }; renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    await settle();
    q.run("renderSecurity({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(q.run<string>("EL.innerHTML")).toContain(`<div class="msg no">Couldn't read ZZZZ: Nasdaq lists no share or ETF named ZZZZ.</div>`);
    expect(q.stored["sc.symbol"]).toBeUndefined();
  });
});
