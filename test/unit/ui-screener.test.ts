import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE SCREENER PANE (ui/screener.js): the route's rule read and checked, the path it asks, the form of the rule from the list's own
 * sectors, industries and countries, the rows, the squarified map of the sectors and a sector's industries, the pane's states, the form,
 * the view, a tile and the clear moving the route in place, a row opening its market, a function's way to a view. Run as the page runs
 * it: plain scripts in one global scope after ui/core.js, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "screener.js"];
/** Monday 9 November 2026, 17:40 New York */
const NOW = "2026-11-09T22:40:00.000Z";

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
    location: { hash: "#/screener", origin: "http://127.0.0.1:4820" },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "screener"; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: () => null }; var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h); var OPENED = []; function openMarket(x) { OPENED.push(x); }`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked };
}
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};
const cell = (name: string, capUsd: number, changePct: number | undefined, top: string[], rows = 3) => ({ name, n: rows, rows, capUsd, ...(changePct !== undefined ? { changePct } : {}), top: top.map((symbol) => ({ symbol, capUsd: capUsd / 3 })) });
const GOOD = {
  ok: true, asOf: NOW, readAt: NOW, listAsOf: "Nov 9, 2026", universe: 6717, matched: 3, ask: { sector: "Technology" },
  rows: [
    { symbol: "AAPL", name: "Apple Inc. Common Stock", price: 342.37, change: -1.8, changePct: -0.523, marketCapUsd: 4975383151340, volume: 44703810, dollarVolume: 1, country: "United States", ipoYear: 1980, sector: "Technology", industry: "Computer Manufacturing" },
    { symbol: "NVDA", name: "NVIDIA Corporation Common Stock <b>x</b>", price: 186.64, change: 5.04, changePct: 2.775, marketCapUsd: 4498024000000, volume: 180000000, sector: "Technology", industry: "Semiconductors" },
    { symbol: "ZZZZ", name: "A fund with nothing" },
  ],
  sectors: [
    { ...cell("Technology", 41.5e12, 1.95, ["AAPL", "NVDA", "MSFT"], 779), industries: [cell("Semiconductors", 20e12, 2.8, ["NVDA", "AVGO", "TSM"]), cell("Computer Manufacturing", 5e12, -0.5, ["AAPL", "DELL", "HPQ"])] },
    { ...cell("Finance", 11.6e12, -0.6, ["JPM", "BAC", "WFC"], 1707), industries: [cell("Major Banks", 6e12, -1.2, ["JPM", "BAC", "WFC"])] },
    { ...cell("Energy", 3e12, 0.02, ["XOM", "CVX", "COP"]), industries: [] },
    { ...cell("No sector", 0, undefined, []), industries: [] },
  ],
  countries: [{ name: "United States", n: 5008 }, { name: "China", n: 258 }],
  from: "Nasdaq's screener · as written",
  notes: ["Every US-listed common share as Nasdaq's screener lists it."],
};

describe("the screener pane", () => {
  it("reads the route's rule as the account would check it (a bad word or figure dropped), the view, and the path it asks; says a figure short and a day as a tone", () => {
    const p = page(() => undefined);
    expect(p.run("eqParams({})")).toEqual({ ask: {}, view: "table" });
    expect(p.run("eqParams({ sector: 'Technology', industry: 'Computer Software: Prepackaged Software', country: 'United States', capMin: '1000000000', priceMax: '50.5', changeMin: '-5', volumeMin: '100000', ipoFrom: '2015', q: ' apple ', sort: 'changePct', dir: 'asc', limit: '25', view: 'map' })")).toEqual({ ask: { sector: "Technology", industry: "Computer Software: Prepackaged Software", country: "United States", capMin: "1000000000", priceMax: "50.5", changeMin: "-5", volumeMin: "100000", ipoFrom: "2015", q: "apple", sort: "changePct", dir: "asc", limit: "25" }, view: "map" });
    expect(p.run("eqParams({ sector: '<b>x</b>', capMin: 'lots', sort: 'sideways', dir: 'up', view: 'chart', q: '' })")).toEqual({ ask: {}, view: "table" });
    expect(p.run("eqPath({})")).toBe("/api/account/screener");
    expect(p.run("eqPath({ sector: 'Technology', capMin: '1000', q: 'a b', view: 'map', nonsense: '1' })")).toBe("/api/account/screener?sector=Technology&capMin=1000&q=a+b");
    expect(p.run("[eqShort(4975383151340, '$'), eqShort(44703810), eqShort(950), eqShort(-1.4e9), eqShort('x'), eqTone(0.05), eqTone(0.5), eqTone(1.2), eqTone(2.9), eqTone(9), eqTone(-0.3), eqTone(-4), eqTone(undefined)]")).toEqual(["$5.0T", "44.7M", "950", "−1.4B", "—", "flat", "up1", "up2", "up3", "up3", "dn1", "dn3", "flat"]);
  });

  it("draws the form from the list: every sector with its count, the chosen sector's industries alone (all of them otherwise), the countries, the band the rule's cap falls in, the figures, the words, the sort; the rows with each symbol a button; the map squarified — every sector a tile, its size by cap, its tone by the day, the large ones labelled with the day and the top names; one sector's industries", () => {
    const p = page(() => undefined);
    const form = p.run<string>(`eqFormHtml({ sector: "Technology", capMin: "10000000000", capMax: "200000000000", priceMax: "50", q: "chip", sort: "changePct" }, ${JSON.stringify(GOOD)})`);
    expect(form).toContain('<select name="sector"><option value="">Any sector</option><option value="Technology" selected>Technology (779)</option><option value="Finance">Finance (1707)</option>');
    expect(form).toContain('<select name="industry"><option value="" selected>Any industry</option><option value="Semiconductors">Semiconductors (3)</option><option value="Computer Manufacturing">Computer Manufacturing (3)</option></select>');
    expect(form).toContain('<option value="United States">United States (5008)</option>');
    expect(form).toContain('<option value="10000000000-200000000000" selected>Large · $10B – $200B</option>');
    expect(form).toContain('<input type="number" name="priceMax" value="50" step="0.01" placeholder="$" inputmode="decimal" />');
    expect(form).toContain('<input type="text" name="q" value="chip" maxlength="60" autocomplete="off" />');
    expect(form).toContain('<option value="changePct" selected>Day&#39;s change</option>');
    expect(form).toContain('<button type="submit" class="btn btn-sm">Screen</button><button type="button" class="link" data-eq="clear">Clear</button>');
    const all = p.run<string>(`eqFormHtml({}, ${JSON.stringify(GOOD)})`);
    expect(all).toContain('<option value="Computer Manufacturing">Computer Manufacturing (3)</option><option value="Major Banks">Major Banks (3)</option><option value="Semiconductors">Semiconductors (3)</option>');
    expect(all).toContain('<option value="" selected>Any size</option>');
    expect(p.run<string>("eqFormHtml({}, null)")).toContain('<select name="sector"><option value="" selected>Any sector</option></select>');
    const rows = p.run<string>(`eqRowsHtml(${JSON.stringify(GOOD)})`);
    expect(rows).toContain('<tr data-k="AAPL"><td><button type="button" class="link eq-sym mono" data-eq="open" data-symbol="AAPL">AAPL</button></td><td><span class="eq-name">Apple Inc. Common Stock</span></td><td class="r"><span class="eq-num">342.37</span></td><td class="r"><span class="down"><span aria-hidden="true">▼</span><span class="sr">down</span> 0.52%</span></td><td class="r">$5.0T</td><td class="r"><span class="dim">44.7M</span></td><td><span class="dim small">Technology · Computer Manufacturing</span></td><td class="r"><span class="dim small">1980</span></td></tr>');
    expect(rows).toContain("NVIDIA Corporation Common Stock &lt;b&gt;x&lt;/b&gt;");
    expect(rows).toContain('<tr data-k="ZZZZ"><td><button type="button" class="link eq-sym mono" data-eq="open" data-symbol="ZZZZ">ZZZZ</button></td><td><span class="eq-name">A fund with nothing</span></td><td class="r"><span class="eq-num">—</span></td><td class="r"><span class="flat">—</span></td><td class="r">—</td><td class="r"><span class="dim">—</span></td><td><span class="dim small">—</span></td><td class="r"><span class="dim small">—</span></td></tr>');
    expect(p.run<string>("eqRowsHtml({ rows: [] })")).toBe('<p class="empty">No share meets the rule.</p>');
    // the squarify: the areas add up to the box, the largest first, each a rectangle inside it
    const boxes = p.run<Array<{ i: number; x: number; y: number; w: number; h: number }>>("eqSquarify([6, 6, 4, 3, 2, 2, 1], 0, 0, 600, 400)");
    expect(boxes).toHaveLength(7);
    expect(boxes.reduce((a, b) => a + b.w * b.h, 0)).toBeCloseTo(240_000, 3);
    expect(boxes[0]!.w * boxes[0]!.h).toBeCloseTo(60_000, 3);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-1e-9);
      expect(b.y).toBeGreaterThanOrEqual(-1e-9);
      expect(b.x + b.w).toBeLessThanOrEqual(600 + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(400 + 1e-9);
    }
    expect(p.run("eqSquarify([], 0, 0, 10, 10)")).toEqual([]);
    expect(p.run("eqSquarify([0, 0], 0, 0, 10, 10)")).toEqual([]);
    const map = p.run<string>(`eqMapHtml(${JSON.stringify(GOOD)}, {})`);
    expect(map).toContain('<p class="small dim eq-map-words">Every sector; a sector opens into its industries, an industry into the table · a tile');
    expect(map).toContain('<svg class="eq-map" viewBox="0 0 1000 560" role="group" aria-label="The sectors by market cap">');
    expect(map.match(/<g class="eq-cell/g)!.length).toBe(3);
    expect(map).toContain('<g class="eq-cell up2" data-eq="sector" data-name="Technology" tabindex="0" role="button" aria-label="Technology: $41.5T, +1.95%, 779 shares — AAPL, NVDA, MSFT"><title>Technology: $41.5T, +1.95%, 779 shares — AAPL, NVDA, MSFT</title><rect x="0.0" y="0.0"');
    expect(map).toContain('class="eq-cell-name">Technology</text>');
    expect(map).toContain('class="eq-cell-chg">+1.95% · $41.5T</text>');
    expect(map).toContain('class="eq-cell-top">AAPL · NVDA · MSFT</text>');
    expect(map).toContain('<g class="eq-cell dn1" data-eq="sector" data-name="Finance"');
    expect(map).toContain('<g class="eq-cell flat" data-eq="sector" data-name="Energy"');
    const tech = p.run<string>(`eqMapHtml(${JSON.stringify(GOOD)}, { sector: "Technology" })`);
    expect(tech).toContain("Technology's industries · <button type=\"button\" class=\"link\" data-eq=\"sector\" data-name=\"\">every sector</button>");
    expect(tech).toContain('aria-label="Technology&#39;s industries by market cap"');
    expect(tech).toContain('<g class="eq-cell up3" data-eq="industry" data-name="Semiconductors"');
    expect(tech).toContain('<g class="eq-cell dn1" data-eq="industry" data-name="Computer Manufacturing"');
    expect(p.run<string>(`eqMapHtml({ sectors: [] }, {})`)).toBe('<p class="empty">Nothing to map.</p>');
  });

  it("draws the pane: a skeleton with the bare form while the list is read, then the rows with how many matched (or the map), the form filled from the list; the view, a tile, the clear and the form move the route in place; a row opens its market; a function's way; the refusal in words", async () => {
    const p = page(() => GOOD);
    p.run("ROUTE.params = { sector: 'Technology' }; renderScreener({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const first = p.run<string>("EL.innerHTML");
    expect(first).toContain('class="skel-rows"');
    expect(first).toContain('<h2 class="h2">Screener</h2><div class="seg eq-views" role="group" aria-label="View"><button type="button" data-eq="view" data-view="table" aria-pressed="true">Table</button><button type="button" data-eq="view" data-view="map" aria-pressed="false">Map</button></div>');
    expect(p.asked).toEqual(["/api/account/screener?sector=Technology"]);
    await settle();
    p.run("renderScreener({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<section class="sec eq-card" id="eq-rows" data-k="rows" aria-label="The shares"><div class="sec-head"><h2 class="h2">Shares</h2><span class="small dim">3 of 6,717 shares</span></div>');
    expect(html).toContain('<option value="Technology" selected>Technology (779)</option>');
    expect(html).toContain('<p class="small dim eq-asof">Read 17:40 New York · Nasdaq&#39;s screener · as written · Nasdaq&#39;s list as of Nov 9, 2026<details class="eq-foot">');
    expect(p.asked).toHaveLength(1);
    // the map view
    p.run("ROUTE.params = { sector: 'Technology', view: 'map' }; renderScreener({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.run<string>("EL.innerHTML")).toContain('<h2 class="h2">Sector map</h2>');
    expect(p.asked).toHaveLength(1);
    // the route moves in place (the hash is set by hand before each press, as the page's would be after the one before)
    const press = (dataset: Record<string, string>) => `eqClick({ target: { closest: (s) => (s === "[data-eq]" ? { dataset: ${JSON.stringify(dataset)} } : null) } })`;
    p.run(`ROUTE.params = { sector: 'Technology' }; ${press({ eq: "view", view: "map" })}`);
    p.run(`ROUTE.params = { sector: 'Technology', view: 'map' }; ${press({ eq: "industry", name: "Semiconductors" })}`);
    p.run(`ROUTE.params = { sector: 'Technology', industry: 'Semiconductors' }; ${press({ eq: "sector", name: "" })}`);
    p.run(`location.hash = "#/screener?sector=Technology&industry=Semiconductors"; ROUTE.params = { sector: 'Technology', industry: 'Semiconductors' }; ${press({ eq: "clear" })}`);
    p.run(`ROUTE.params = {}; ${press({ eq: "open", symbol: "AAPL" })}`);
    expect(p.run("MOVES")).toEqual(["#/screener?sector=Technology&view=map", "#/screener?sector=Technology&industry=Semiconductors", "#/screener?view=map", "#/screener"]);
    expect(p.run("OPENED")).toEqual([{ key: "stock:AAPL" }]);
    // the form
    const fields: Record<string, string> = { sector: "Finance", industry: "Major Banks", country: "", cap: "10000000000-200000000000", priceMin: "10", priceMax: "", changeMin: "", changeMax: "", volumeMin: "100000", ipoFrom: "", ipoTo: "", q: " bank ", sort: "changePct", dir: "asc" };
    p.run(`ROUTE.params = {}; eqSubmit({ preventDefault() {}, target: { closest: (s) => (s === "[data-eq=form]" ? { querySelector: (sel) => ({ value: (${JSON.stringify(fields)})[sel.slice(7, -2)] }) } : null) } })`);
    expect(p.run("MOVES.at(-1)")).toBe("#/screener?sector=Finance&industry=Major+Banks&capMin=10000000000&capMax=200000000000&priceMin=10&volumeMin=100000&q=bank&sort=changePct&dir=asc");
    // a function's way: the rule as it stands, from another page nothing
    p.run("ROUTE.params = { sector: 'Energy' }; eqShow('map')");
    expect(p.run("MOVES.at(-1)")).toBe("#/screener?sector=Energy&view=map");
    p.run("location.hash = '#/markets'; ROUTE.tab = 'markets'; eqShow('table')");
    expect(p.run("location.hash")).toBe("#/screener");
    // the refusal
    const q = page(() => ({ ok: false, refusal: { code: "E_VENUE_UNREACHABLE", message: "Nasdaq did not answer" } }));
    q.run("ROUTE.params = {}; renderScreener({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    await settle();
    q.run("renderScreener({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(q.run<string>("EL.innerHTML")).toContain(`<div class="msg no">Couldn't read the list: Nasdaq did not answer.</div>`);
  });
});
