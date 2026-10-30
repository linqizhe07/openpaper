import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { debriefOf, type DebriefTrade } from "../../src/portfolio/account/debrief.ts";

/** THE DEBRIEF PANE (ui/debrief.js): the journal's trades as the account debriefs them — what the trades say (the inversion test first),
 * the figures, where the money went, how trades ended, how far each went, R, the slices, the desk's calibration, the curve, the latest
 * trades — and a kept backtest run's debrief under its result (ui/backtest.js). Run as the page runs them: plain scripts in one global
 * scope after ui/core.js, in a vm with a stand-in document; the debriefs are the account's own (account/debrief.ts) */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "debrief.js", "backtest.js"];

function page() {
  const asked: string[] = [];
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" } }, hidden: false },
    location: { hash: "", origin: "http://127.0.0.1:4820" },
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
    setTimeout,
    clearTimeout,
    fetch: async (path: string) => {
      asked.push(path);
      return new Promise(() => {});
    },
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`) };
}

const T0 = Date.parse("2026-10-01T00:00:00Z");
const at = (h: number): string => new Date(T0 + h * 3_600_000).toISOString();
/** a closed trade on $1,000 of entry, as the journal keeps it: its result before costs and its costs in percent, its plan, its lead */
const trade = (i: number, gross: number, o: { cost?: number; end?: DebriefTrade["end"]; conf?: number; thesis?: string } = {}): DebriefTrade => {
  const fees = ((o.cost ?? 0.2) / 100) * 1000;
  const g = (gross / 100) * 1000;
  return { symbol: "BTC-PERP", kind: "perp", side: "long", openedAt: at(i * 3), closedAt: at(i * 3 + 2), hours: 2, openRef: `p${i}`, closeRef: `q${i}`, takeProfit: 100.4, stopLoss: 99.6, qty: 10, entryPrice: 100, exitPrice: 100 + gross, entryUsd: 1000, grossUsd: g, feesUsd: fees, fundingUsd: 0, netUsd: g - fees, returnPct: ((g - fees) / 1000) * 100, maePct: Math.min(0, gross), mfePct: Math.max(0, gross), hi: 0, lo: 0, fills: 2, end: o.end ?? "closed", ...(o.conf !== undefined ? { lead: { id: `L-${String(i).padStart(4, "0")}`, thesis: o.thesis ?? "BTC keeps its momentum on volume", confidence: o.conf } } : {}), by: { who: "desk", role: "sniper" } };
};
/** the money-losing machine: symmetric 0.4% exits, half won before costs, 0.2% a trade in costs */
const MACHINE = Array.from({ length: 40 }, (_, i) => trade(i, i % 2 ? 0.4 : -0.4, { end: i % 2 ? "take-profit" : "stop-loss", conf: 0.55 + (i % 4) * 0.1 }));

describe("the debrief's body (debriefHtml)", () => {
  it("leads with what the trades say — the inversion test in the account's words — then the figures, where the money went, how trades ended, R, the slices and the desk's calibration, each said for a screen reader", () => {
    const p = page();
    p.set("D", debriefOf(MACHINE));
    const html = p.run<string>("debriefHtml(D)");
    expect(html).toContain("What the trades say");
    expect(html).toContain('<div class="db-verdict warn"><div class="label">The loss is the costs</div>');
    expect(html).toContain("no edge either way. The loss is the costs, 0.200% a trade. Turned round it would pay them twice");
    // the figures: the count, the net a trade with its range, the break-even win rate beside the one won, the plan's
    expect(html).toMatch(/<th scope="row">Trades<\/th><td class="r">40 <span class="dim">· 20 won, 20 lost<\/span><\/td>/);
    expect(html).toContain('<th scope="row">Break-even win rate</th><td class="r">75% <span class="dim">· 50% won</span></td>');
    expect(html).toContain('<th scope="row">The plan&#39;s break-even</th><td class="r">75% <span class="dim">· take-profit 0.40%, stop 0.40%</span></td>');
    // where the money went: one scale, said in words
    expect(html).toContain('aria-label="Before costs $0.00; fees $80.00; funding $0.00; net -$80.00"');
    // how trades ended, R, the slices, the calibration
    expect(html).toContain("Take-profit");
    expect(html).toContain("Stop-loss");
    expect(html).toContain("Result in R");
    expect(html).toContain("Where it worked and where it didn't");
    expect(html).toContain("The desk's calibration");
    expect(html).toContain('role="img"');
    // forty trades are enough for the whole (the Trades row carries no mark), but a slice of ten is marked as standing on too few
    expect(html).toContain('<td>under 0.6 <span class="tag" title="Fewer than 30 trades: a sketch, not a finding">few</span></td>');
  });

  it("a handful of trades: the verdict says too few, and each figure that stands on fewer than thirty is marked", () => {
    const p = page();
    p.set("D", debriefOf(MACHINE.slice(0, 5)));
    const html = p.run<string>("debriefHtml(D)");
    expect(html).toContain('<div class="label">Too few trades to say</div>');
    expect(html).toContain('<span class="tag" title="Fewer than 30 trades: a sketch, not a finding">few</span>');
    expect(p.run<string>("debriefHtml({ trades: 0 })")).toContain("No closed trade: nothing to debrief.");
  });
});

describe("the pane", () => {
  it("asks the account for the debrief of the trades chosen — whose, which paper account, the window — and draws the header's choices pressed", () => {
    const p = page();
    p.run("dbRead()");
    p.run('DB.who = "desk"; DB.days = "30"; DB.venue = "paper-1"; dbRead()');
    expect(p.asked).toEqual(["/api/account/debrief", "/api/account/debrief?venue=paper-1&who=desk&days=30"]);
    const head = p.run<string>('dbHeadHtml({ venues: [{ id: "paper-1", name: "Momentum", trades: 40 }, { id: "paper-2", name: "Carry", trades: 3 }], intact: false })');
    expect(head).toContain('<button type="button" data-db-who="desk" aria-pressed="true">The desk</button>');
    expect(head).toContain('<button type="button" data-db-days="30" aria-pressed="true">30 days</button>');
    expect(head).toContain('<option value="paper-1" selected>Momentum · 40 trades</option>');
    expect(head).toContain("Journal broken");
    // one paper account: nothing to choose between
    expect(p.run<string>('dbHeadHtml({ venues: [{ id: "paper-1", name: "Momentum", trades: 40 }], intact: true })')).not.toContain("<select");
  });

  it("lists the latest trades with the desk's thesis beside each, escaped as the page escapes anything from outside", () => {
    const p = page();
    p.set("L", [{ ...trade(1, -0.4, { conf: 0.7, thesis: "<img src=x onerror=alert(1)> breaks out" }), venue: "paper-1" }]);
    const html = p.run<string>("dbLatestHtml(L)");
    expect(html).toContain("The latest trades");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Desk sniper");
    // an average entry and exit to seven figures
    p.set("L2", [{ ...trade(2, 0.4), entryPrice: 218013.70451234, exitPrice: 217141.64971234 }]);
    expect(p.run<string>("dbLatestHtml(L2)")).toContain("218,013.7 → 217,141.6");
    expect(html).toContain("Closed by an order");
  });
});

describe("a kept backtest run (ui/backtest.js)", () => {
  it("shows its round trips debriefed under its result, the verdict in the summary's words; a run kept without trips shows none", () => {
    const p = page();
    p.set("K", { ok: true, id: "20261029T162730-aaaaaaaaaa", run: { strategy: { id: "desk", name: "The desk", params: {} }, markets: [], equity: [], fills: [], notes: [] }, debrief: debriefOf(MACHINE) });
    const html = p.run<string>("btResultHtml(btViewOfKept(K))");
    expect(html).toContain('<details class="bt-debrief"><summary>Debrief · 40 round trips · the loss is the costs</summary>');
    expect(html).toContain("What the trades say");
    p.set("K2", { ok: true, id: "20261029T162730-bbbbbbbbbb", run: { strategy: { id: "hold", name: "Buy and hold", params: {} }, markets: [], equity: [], fills: [], notes: [] } });
    expect(p.run<string>("btResultHtml(btViewOfKept(K2))")).not.toContain("bt-debrief");
  });
});
