import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE RISK PANE (ui/risk.js): the portfolio's figures as tiles, the strip of its days, the lines with their weights and volatility, the
 * exposure by class and venue with the concentration, the betas and the stresses, the unpriced lines named; the pane's states. Run as the
 * page runs it: plain scripts in one global scope after ui/core.js, in a vm */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "risk.js"];
/** Monday 9 November 2026, 18:40 New York */
const NOW = "2026-11-09T23:40:00.000Z";

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
    location: { hash: "#/risk", origin: "http://127.0.0.1:4820" },
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
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "risk"; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false, querySelector: () => null };`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked };
}
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
};
const GOOD = {
  ok: true, asOf: NOW, netUsd: 10500, grossUsd: 12500, longUsd: 11500, shortUsd: -1000,
  lines: [
    { key: "crypto:BTC", name: "BTC", class: "crypto", usd: 6000, weightPct: 48, venue: "ex", venueName: "Exchange", bars: 120, volatilityPct: 49.65, riskContributionPct: 55.67, var95Usd: 331.19 },
    { key: "perp:ex|ETH/USDT:USDT", name: "ETH perpetual short", class: "perp", usd: -1000, weightPct: -8, venue: "ex", venueName: "Exchange", bars: 120, volatilityPct: 47.37, riskContributionPct: -4.1, var95Usd: 49.2, leverage: 5 },
    { key: "cash:USD", name: "USD", class: "cash", usd: 2000, weightPct: 16, venue: "broker", venueName: "Broker", bars: 0 },
  ],
  byClass: [{ name: "crypto", usd: 6000, weightPct: 48, lines: 1 }, { name: "cash", usd: 2000, weightPct: 16, lines: 1 }, { name: "perp", usd: -1000, weightPct: -8, lines: 1 }],
  byVenue: [{ venue: "ex", venueName: "Exchange", usd: 5000, weightPct: 40, lines: 2 }, { venue: "broker", venueName: "Broker", usd: 2000, weightPct: 16, lines: 1 }],
  concentration: { top1Pct: 48, top3Pct: 88, hhi: 0.3216, effective: 3.11 },
  unpriced: [{ key: "cash:USD", name: "USD", usd: 2000, why: "cash: no market price moves it" }],
  portfolio: { days: 119, pricedPct: 80, volatilityPct: 17.94, var95Usd: 463.33, var95Pct: 1.55, var99Usd: 614.14, var99Pct: 2.06, normalVar95Usd: 461.14, normalVar99Usd: 652.18, es95Usd: 560.08, worstDayPct: -2.24, worstDay: "2026-07-02", bestDayPct: 2.41, recent: [{ t: Date.parse("2026-11-05T00:00:00Z"), pct: 0.5 }, { t: Date.parse("2026-11-06T00:00:00Z"), pct: -1.2 }, { t: Date.parse("2026-11-09T00:00:00Z"), pct: 0.1 }] },
  benchmarks: [{ key: "stock:SPY", name: "SPY", days: 119, beta: -0.1182, correlation: -0.0725 }, { key: "coin:BTC", name: "BTC", days: 4 }],
  drawdown: { points: 61, maxPct: -2.06, maxFrom: "2026-11-04T03:40:13.983Z", maxTo: "2026-11-08T23:40:13.983Z", currentPct: -0.33, peakUsd: 29234.2, peakAt: "2026-11-04T03:40:13.983Z" },
  stress: [{ name: "Everything priced -5%", movePct: -5, usd: -425, pct: -3.4 }, { name: "crypto -30%", movePct: -30, class: "crypto", usd: -1800, pct: -14.4 }, { name: "perp -30%", movePct: -30, class: "perp", usd: 300, pct: 2.4 }],
  notes: ["Every figure here is arithmetic over the account's own balances."],
};

describe("the risk pane", () => {
  it("draws the parts: the figures as tiles with their words on hover, the strip of days, the lines with a short's dollars red and its leverage, the groups and the concentration, the betas (none under ten days) and the stresses", () => {
    const p = page(() => undefined);
    expect(p.run("[rkUsd(29861.26), rkUsd(-425), rkUsd(12.5), rkUsd(undefined), rkPct(17.94), rkPct(undefined), rkSigned(-2.24, 2), rkSigned(2.41, 2), rkSigned(0)]")).toEqual(["$29,861", "−$425", "$12.50", "—", "17.9%", '<span class="dim">—</span>', '<span class="down">−2.24%</span>', '<span class="up">+2.41%</span>', '<span class="flat">0.0%</span>']);
    const head = p.run<string>(`rkHeadHtml(${JSON.stringify(GOOD)})`);
    expect(head).toContain('<div class="rk-stat" title="every line&#39;s dollars added up, a short&#39;s negative"><span class="label">Net exposure</span><b>$10,500</b></div>');
    expect(head).toContain('<span class="label">Gross</span><b>$12,500 <span class="dim small">$11,500 long · −$1,000 short</span></b>');
    expect(head).toContain('<span class="label">Priced</span><b>80.0% <span class="dim small">of the gross · 119 days</span></b>');
    expect(head).toContain('<span class="label">Volatility</span><b>17.9% <span class="dim small">annualised</span></b>');
    expect(head).toContain('<span class="label">VaR 95 %, one day</span><b>$463 <span class="dim small">1.6% · normal $461</span></b>');
    expect(head).toContain('<span class="label">Expected shortfall 95 %</span><b>$560</b>');
    expect(head).toContain('<span class="label">Worst · best day</span><b><span class="down">−2.24%</span> <span class="dim small">2026-07-02</span> · <span class="up">+2.41%</span></b>');
    expect(head).toContain('<span class="label">Drawdown</span><b><span class="down">−2.1%</span> <span class="dim small">deepest · now -0.3%</span></b>');
    const strip = p.run<string>(`rkStripHtml(${JSON.stringify(GOOD.portfolio.recent)})`);
    expect(strip).toContain('<svg class="rk-strip" viewBox="0 0 720 90" role="img" aria-label="The portfolio\'s daily returns, the latest 3 days">');
    expect(strip).toContain('<rect class="down"');
    expect(strip).toContain("<title>2026-11-06: -1.20%</title>");
    expect(strip).toContain("the tallest bar 1.20%");
    expect(p.run<string>("rkStripHtml([])")).toBe("");
    const lines = p.run<string>(`rkLinesHtml(${JSON.stringify(GOOD)})`);
    expect(lines).toContain('<tr data-k="crypto:BTC"><td><span class="rk-name">BTC</span> <span class="dim small">crypto · Exchange</span></td><td class="r"><span class="">$6,000</span></td><td class="r"><span class="rk-num">48.0%</span></td><td class="r">49.7%</td><td class="r">55.7%</td><td class="r">$331</td><td class="r"><span class="dim small">120</span></td></tr>');
    expect(lines).toContain('<span class="dim small">perp · Exchange · 5×</span></td><td class="r"><span class="down">−$1,000</span></td><td class="r"><span class="rk-num">-8.0%</span></td>');
    expect(lines).toContain('<tr data-k="cash:USD"><td><span class="rk-name">USD</span> <span class="dim small">cash · Broker</span></td><td class="r"><span class="">$2,000</span></td><td class="r"><span class="rk-num">16.0%</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r">—</td><td class="r"><span class="dim small">0</span></td></tr>');
    expect(p.run<string>("rkLinesHtml({ lines: [] })")).toBe('<p class="empty">Nothing held.</p>');
    const groups = p.run<string>(`rkGroupsHtml(${JSON.stringify(GOOD)})`);
    expect(groups).toContain('<h3 class="label rk-h3">By class</h3>');
    expect(groups).toContain('<tr data-k="crypto"><td>crypto</td><td class="r">$6,000</td><td class="r">48.0%</td><td class="r"><span class="dim small">1</span></td></tr>');
    expect(groups).toContain('<tr data-k="ex"><td>Exchange</td><td class="r">$5,000</td><td class="r">40.0%</td><td class="r"><span class="dim small">2</span></td></tr>');
    expect(groups).toContain('<span class="label">Largest line</span><b>48.0%</b>');
    expect(groups).toContain('<span class="label">Herfindahl</span><b>0.322</b>');
    expect(groups).toContain('<span class="label">Effective lines</span><b>3.1</b>');
    const bs = p.run<string>(`rkBetaStressHtml(${JSON.stringify(GOOD)})`);
    expect(bs).toContain('<tr data-k="stock:SPY"><td><span class="rk-name">SPY</span></td><td class="r"><b>-0.12</b></td><td class="r">-0.07</td><td class="r"><span class="dim small">119</span></td></tr>');
    expect(bs).toContain('<tr data-k="coin:BTC"><td><span class="rk-name">BTC</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim">—</span></td><td class="r"><span class="dim small">4</span></td></tr>');
    expect(bs).toContain('<tr data-k="crypto -30%"><td>crypto -30%</td><td class="r"><span class="down">−$1,800</span></td><td class="r"><span class="down">−14.4%</span></td></tr>');
    expect(bs).toContain('<tr data-k="perp -30%"><td>perp -30%</td><td class="r"><span class="up">$300</span></td><td class="r"><span class="up">+2.4%</span></td></tr>');
  });

  it("draws the pane: a skeleton while the risk is read, then the four cards, the unpriced lines named, the notes folded; the refusal in words; a refusal after a good read keeps the figures and says so", async () => {
    const p = page(() => GOOD);
    p.run("renderRisk({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain('class="skel-rows"');
    expect(p.asked).toEqual(["/api/account/risk"]);
    await settle();
    p.run("renderRisk({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    const html = p.run<string>("EL.innerHTML");
    for (const id of ["head", "lines", "groups", "beta"]) expect(html, id).toContain(`id="rk-${id}"`);
    expect(html).toContain('<h2 class="h2">Risk</h2><span class="small dim">the account&#39;s own lines · 18:40 New York</span>');
    expect(html).toContain('<p class="small dim rk-unpriced">Weighing in the exposure, with no volatility of their own here: USD (cash: no market price moves it).</p>');
    expect(html).toContain('<p class="small dim rk-asof">Read 18:40 New York<details class="rk-foot"><summary>How this is counted</summary><p>Every figure here is arithmetic over the account&#39;s own balances.</p></details></p>');
    expect(p.asked).toHaveLength(1);
    p.run("RK.read = { at: Date.now(), body: { ok: false, refusal: { code: 'E_VENUE_UNREACHABLE', message: 'a venue did not answer' } }, good: RK.read.good }");
    p.run("renderRisk({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain(`<p class="mk-missing">Couldn't read the risk again just now: a venue did not answer. This is what was read at 18:40.</p>`);
    const q = page(() => ({ ok: false, refusal: { code: "E_ACCOUNT_BAD_ACTION", message: "the account layer is not mounted" } }));
    q.run("renderRisk({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    await settle();
    q.run("renderRisk({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(q.run<string>("EL.innerHTML")).toBe(`<div class="rk"><div class="msg no">Couldn't read the risk: the account layer is not mounted.</div></div>`);
  });
});
