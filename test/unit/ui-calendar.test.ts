import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE CALENDAR PANE (ui/calendar.js): one day of one kind as GET /api/account/calendar gives it — the kinds as a seg, the week's days
 * with Today marked and the picked one pressed, each kind's own table (a release's time, country, consensus and what came out coloured
 * against it; who reports and when; the dividends; the splits; the IPOs by stage), a share alone where the route names one, the skeleton
 * and the refusal, the route moved in place. Run as the page runs it: plain scripts in one global scope after ui/core.js, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "calendar.js"];
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
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" } }, hidden: false },
    location: { hash: "#/calendar", origin: "http://127.0.0.1:4820" },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "calendar"; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false }; var OPENED = []; function openMarket(x) { OPENED.push(x); }`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const ECO = {
  ok: true, asOf: NOW, kind: "economic", from: "2026-11-09", to: "2026-11-09", total: 3,
  items: [
    { kind: "economic", day: "2026-11-09", at: "2026-11-09T13:30:00.000Z", time: "08:30", country: "United States", event: "Core CPI (MoM) <b>x</b>", actual: "0.3%", consensus: "0.2%", previous: "0.3%", against: "above", description: "Prices paid by consumers, food & energy apart" },
    { kind: "economic", day: "2026-11-09", at: "2026-11-09T15:00:00.000Z", time: "10:00", country: "United States", event: "Consumer Sentiment", actual: "66.1", consensus: "68.0", previous: "67.1", against: "below" },
    { kind: "economic", day: "2026-11-09", country: "Japan", event: "Bank holiday" },
  ],
  days: [{ day: "2026-11-09", count: 3, readAt: NOW }], missing: [],
  notes: ["Nasdaq's calendars, read without a key.", "Times are New York's."],
};
const EARN = { ...ECO, kind: "earnings", total: 2, items: [
  { kind: "earnings", day: "2026-11-09", symbol: "CEG", name: "Constellation Energy", when: "pre", marketCapUsd: 88_559_133_000, quarterEnding: "Sep/2026", epsForecast: 3.9, estimates: 5, lastYearEps: 3.04 },
  { kind: "earnings", day: "2026-11-09", symbol: "AAPL", name: "Apple Inc.", when: "post", marketCapUsd: 3.4e12, epsForecast: -0.2, estimates: 28 },
] };

describe("the calendar pane", () => {
  it("reads the route: economic and today where nothing is named, a day and a kind where they are, a share in capitals; the week's days Monday first, Today marked, the picked one pressed; a month for IPOs", () => {
    const p = page(() => undefined);
    expect(p.run("calParams({})")).toEqual({ kind: "economic", day: "2026-11-09", today: "2026-11-09", symbol: "" });
    expect(p.run("calParams({ kind: 'earnings', day: '2026-11-12', symbol: 'aapl' })")).toEqual({ kind: "earnings", day: "2026-11-12", today: "2026-11-09", symbol: "AAPL" });
    expect(p.run("calParams({ kind: 'sports', day: 'tomorrow' })")).toEqual({ kind: "economic", day: "2026-11-09", today: "2026-11-09", symbol: "" });
    expect(p.run("[calMonday('2026-11-09'), calMonday('2026-11-15'), calMonday('2026-11-16'), calShift('2026-11-09', -1), calDayWords('2026-11-09')]")).toEqual(["2026-11-09", "2026-11-09", "2026-11-16", "2026-11-08", "Mon 9 Nov"]);
    const strip = p.run<string>("calStripHtml(calParams({ day: '2026-11-12' }))");
    expect(strip).toContain('data-cal="day" data-day="2026-11-02" aria-label="The week before"');
    expect(strip).toContain('<button type="button" class="cal-day today" data-cal="day" data-day="2026-11-09" aria-pressed="false"><span class="cal-dow">Mon</span><span class="cal-dom">9</span></button>');
    expect(strip).toContain('class="cal-day" data-cal="day" data-day="2026-11-12" aria-pressed="true"');
    expect(strip).toContain('data-day="2026-11-16" aria-label="The week after"');
    expect(strip).toContain('<button type="button" class="btn btn-sm" data-cal="day" data-day="2026-11-09">Today</button>');
    expect(p.run<string>("calStripHtml(calParams({}))")).not.toContain(">Today</button>");
    const month = p.run<string>("calStripHtml(calParams({ kind: 'ipos', day: '2026-11-09' }))");
    expect(month).toContain('<span class="cal-month">November 2026</span>');
    expect(month).toContain('data-day="2026-10-01" aria-label="The month before"');
    expect(month).toContain('data-day="2026-12-01" aria-label="The month after"');
  });

  it("draws each kind's rows: a release's New York time, its figures escaped and what came out coloured against the consensus, a dash where none; who reports, when, the money short, a loss with its sign; the symbol a button that opens the market", () => {
    const p = page(() => undefined);
    const eco = p.run<string>(`calRowsHtml("economic", ${JSON.stringify(ECO.items)})`);
    expect(eco).toContain('<time class="mono" datetime="2026-11-09T13:30:00.000Z">08:30</time>');
    expect(eco).toContain('<span class="cal-ev" title="Prices paid by consumers, food &amp; energy apart">Core CPI (MoM) &lt;b&gt;x&lt;/b&gt;</span>');
    expect(eco).toContain('<span class="up">0.3%</span>');
    expect(eco).toContain('<span class="down">66.1</span>');
    expect(eco).toContain('<td class="r"><span class="dim">—</span></td>');
    expect(eco).toContain("Bank holiday");
    const earn = p.run<string>(`calRowsHtml("earnings", ${JSON.stringify(EARN.items)})`);
    expect(earn).toContain("Before the open");
    expect(earn).toContain("After the close");
    expect(earn).toContain('<button type="button" class="link cal-sym mono" data-cal="open" data-symbol="CEG">CEG</button>');
    expect(earn).toContain("$88.6B");
    expect(earn).toContain("$3.40T");
    expect(earn).toContain('$3.90 <span class="dim small">(5)</span>');
    expect(earn).toContain("−$0.20");
    expect(p.run<string>('calRowsHtml("economic", [])')).toBe("");
    expect(p.run<string>(`calRowsHtml("ipos", ${JSON.stringify([{ kind: "ipo", stage: "priced", day: "2026-11-02", symbol: "NARA", name: "Narragansett", exchange: "NASDAQ Capital", priceUsd: 10, raisedUsd: 90_988_000 }, { kind: "ipo", stage: "withdrawn", day: "2026-11-04", name: "DT House" }])})`)).toContain('<span class="tag up">Priced</span>');
    expect(p.run<string>(`calRowsHtml("dividends", ${JSON.stringify([{ kind: "dividend", day: "2026-11-09", symbol: "BWFG", name: "Bankwell", exDay: "2026-11-09", paymentDay: "2026-11-20", amount: 0.2, annual: 0.8 }])})`)).toContain("$0.20");
    expect(p.run<string>(`calRowsHtml("splits", ${JSON.stringify([{ kind: "split", day: "2026-11-09", symbol: "SNDK", name: "Sandisk", ratio: "8:1", executionDay: "2026-11-20" }])})`)).toContain('<span class="mono">8:1</span>');
    p.run(`calClick({ target: { closest: (s) => (s === "[data-cal]" ? { dataset: { cal: "open", symbol: "CEG" } } : null) } })`);
    expect(p.run("OPENED")).toEqual([{ key: "stock:CEG" }]);
  });

  it("draws the pane: a skeleton while the day is read, then the heading, the kinds, the strip and the rows, the as-of line and the notes folded; a share alone with its Clear; the refusal in words; the route moved in place by the seg and the strip", async () => {
    const p = page((path) => (path.includes("kind=earnings") ? EARN : ECO));
    p.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain('class="skel-rows"');
    expect(p.asked).toEqual(["/api/account/calendar?kind=economic&from=2026-11-09&to=2026-11-09&limit=500"]);
    await settle();
    await settle();
    p.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<h2 class="h2">Economic · Today · Mon 9 Nov</h2>');
    expect(html).toContain('<button type="button" data-cal="kind" data-kind="economic" aria-pressed="true">Economic</button>');
    expect(html).toContain("Core CPI (MoM)");
    expect(html).toContain("Read 14:30 New York · Nasdaq's calendar, as written<details class=\"cal-foot\"><summary>Where this comes from</summary><p>Nasdaq&#39;s calendars, read without a key.</p>");
    // a share alone, on another day
    p.run("ROUTE.params = { kind: 'earnings', day: '2026-11-12', symbol: 'AAPL' }");
    p.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    expect(p.asked.at(-1)).toBe("/api/account/calendar?kind=earnings&from=2026-11-12&to=2026-11-12&symbol=AAPL&limit=500");
    await settle();
    await settle();
    p.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: ROUTE.params })");
    const share = p.run<string>("EL.innerHTML");
    expect(share).toContain('<h2 class="h2">Earnings · Thu 12 Nov</h2>');
    expect(share).toContain('<p class="cal-q">AAPL alone <button type="button" class="link" data-cal="clear">Every share</button></p>');
    // the route moves in place: a kind, a day (today is left unnamed), Clear
    p.run("var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h)");
    // (the stand-in browser's hash never moves, so the route is set by hand before each press, as the page's would be after the one before)
    const at = `{ kind: 'earnings', day: '2026-11-12', symbol: 'AAPL' }`;
    p.run(`ROUTE.params = ${at}; calClick({ target: { closest: (s) => (s === "[data-cal]" ? { dataset: { cal: "kind", kind: "splits" } } : null) } })`);
    p.run(`ROUTE.params = ${at}; calClick({ target: { closest: (s) => (s === "[data-cal]" ? { dataset: { cal: "day", day: "2026-11-09" } } : null) } })`);
    p.run(`ROUTE.params = ${at}; calClick({ target: { closest: (s) => (s === "[data-cal]" ? { dataset: { cal: "clear" } } : null) } })`);
    expect(p.run("MOVES")).toEqual(["#/calendar?kind=splits&day=2026-11-12&symbol=AAPL", "#/calendar?kind=earnings&symbol=AAPL", "#/calendar?kind=earnings&day=2026-11-12"]);
    // a refusal
    const q = page(() => ({ ok: false, refusal: { code: "E_VENUE_UNREACHABLE", message: "Nasdaq's calendars did not answer" } }));
    q.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    await settle();
    await settle();
    q.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(q.run<string>("EL.innerHTML")).toContain('<div class="msg no">Couldn\'t read the calendar: Nasdaq&#39;s calendars did not answer.</div>');
    // nothing on the day
    const e = page(() => ({ ...ECO, items: [], total: 0 }));
    e.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    await settle();
    await settle();
    e.run("renderCalendar({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(e.run<string>("EL.innerHTML")).toContain('<p class="empty">Nothing on this day in Nasdaq\'s economic calendar.</p>');
  });
});
