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

describe("the desk's lessons (dbLessonsHtml)", () => {
  /* a read as the account answers it (service.ts debrief): a candidate, one already kept, and a lesson in each state */
  const READ = {
    desk: true,
    deskTrades: 80,
    candidates: [
      { from: "market", slice: "DOGE/USDT", text: "Leave DOGE/USDT alone: the desk's 40 trades there made −0.600% a trade, the other 40 +0.200%.", rule: { kind: "markets", skip: ["DOGE/USDT"] }, words: "never DOGE/USDT", n: 40, meanPct: -0.6, winRatePct: 0, netUsd: -240, rest: { n: 40, meanPct: 0.2 }, t: -9.3, looked: 2 },
      { from: "hours", slice: "00–04", text: "No new lead 00–04 New York: …", rule: { kind: "hours", skip: ["00–04"] }, words: "no lead entered 00–04 New York", n: 31, meanPct: -0.3, winRatePct: 20, netUsd: -93, rest: { n: 49, meanPct: 0.1 }, t: -2.4, looked: 1, kept: { id: "LS-0004", state: "adopted" } },
    ],
    lessons: [
      { id: "LS-0005", at: "2026-10-30T01:10:00Z", from: "evening", text: "Keep the size small while the tape is thin.", roles: ["search", "risk", "exit", "head"], state: "proposed", source: "the evening report of 2026-10-29" },
      { id: "LS-0004", at: "2026-10-29T01:10:00Z", from: "debrief", text: "No new lead 00–04 New York.", roles: ["search", "risk"], rule: { kind: "hours", skip: ["00–04"] }, words: "no lead entered 00–04 New York", state: "adopted", decidedAt: "2026-10-29T14:00:00Z", source: "the Debrief: the hours slice 00–04", effect: { trades: 80, unjudged: 3, stopped: { n: 12, netUsd: -40.1, meanPct: -0.31, winRatePct: 25 }, kept: { n: 68, netUsd: 12, meanPct: 0.02, winRatePct: 51 }, few: true } },
      { id: "LS-0003", at: "2026-10-28T01:10:00Z", from: "you", text: "Close by four hours.", roles: ["risk", "exit"], rule: { kind: "plan", maxHours: 4 }, words: "the plan held to 4 h at most", state: "adopted", decidedAt: "2026-10-28T14:00:00Z" },
      { id: "LS-0002", at: "2026-10-27T01:10:00Z", from: "weekly", text: "Stop trading <b>thin</b> coins.", roles: ["search", "risk"], state: "rejected", decidedAt: "2026-10-27T14:00:00Z", why: "too vague" },
    ],
  };

  it("what the desk's trades here put forward, the ones waiting for the owner, the ones in force with what each rule would have done, the ones given up — escaped, with the owner's buttons", () => {
    const p = page();
    p.set("R", READ);
    const html = p.run<string>("dbLessonsHtml(R)");
    expect(html).toContain('<h2 class="h2" id="db-ls-h">Lessons for the desk</h2><span class="dim small">2 adopted · 1 waiting for you</span>');
    expect(html).toContain("A lesson changes nothing until you adopt it.");
    // the candidate: its rule, its trades, how many slices were looked at; the one already kept says so and offers nothing
    expect(html).toContain("Rule: never DOGE/USDT · 0% of the 40 trades won · t −9.3, the worst of 2 market slices with 30 trades or more");
    expect(html).toContain('data-db-ls="cand-adopt" data-i="0">Adopt…</button>');
    expect(html).toContain('<span class="tag up">LS-0004 · Adopted</span>');
    expect(html).not.toContain('data-i="1"');
    // waiting: Adopt and Reject; in force: Retire, and what the rule would have done here; a plan rule sends to the exit sweep
    expect(html).toContain('<li class="db-ls proposed"><div class="db-ls-head"><b>LS-0005</b> <span class="tag warn">Waiting for you</span> <span class="dim small">from the evening report of 2026-10-29 · to Search, Risk, Exit, the Head</span></div>');
    expect(html).toContain('data-db-ls="reject" data-id="LS-0005"');
    expect(html).toContain("Words only: no rule binds the desk to it.");
    expect(html).toContain("Here it would have stopped 12 trades of the desk&#39;s 80: -$40.10, −0.310% a trade, 25% won; the 68 it let through made $12.00, +0.020% a trade. 3 trades it could not judge: the number it needs was not kept with them.");
    expect(html).toContain('data-db-ls="retire" data-id="LS-0004"');
    expect(html).toContain("A plan rule changes exits: what it would have made is a run's to say");
    expect(html).toContain("<summary>Rejected and retired · 1</summary>");
    expect(html).toContain("Stop trading &lt;b&gt;thin&lt;/b&gt; coins.");
    expect(html).toContain("Why: too vague");
    expect(html).toContain('data-db-ls="write">Write a lesson…</button>');
  });

  it("a viewer reads and signs nothing; no desk and no lesson draws nothing; fewer than thirty of the desk's trades put nothing forward, said so", () => {
    const p = page();
    p.set("R", READ);
    p.run('Owner.role = "viewer"');
    const html = p.run<string>("dbLessonsHtml(R)");
    expect(html).toContain("Lessons for the desk");
    expect(html).not.toContain("data-db-ls=");
    p.run('Owner.role = "owner"');
    expect(p.run<string>("dbLessonsHtml({ desk: false, lessons: [], candidates: [] })")).toBe("");
    expect(p.run<string>("dbLessonsHtml({ desk: true, deskTrades: 12, lessons: [], candidates: [] })")).toContain("12 trades of the desk's here: a slice is put forward from 30 trades in it.");
    expect(p.run<string>("dbLessonsHtml({ desk: true, deskTrades: 80, lessons: [], candidates: [] })")).toContain("No slice of the desk's trades here lost beyond chance against the rest");
  });

  it("the sheet that writes one reads the rule from its fields — what is missing said — and words it as the desk does", () => {
    const p = page();
    const form = (checked: string[] = []) => ({ querySelectorAll: () => checked.map((value) => ({ value })) });
    p.set("F", { kind: "chase", maxPct: "8" });
    expect(p.run("dbRuleOf(F, { querySelectorAll: () => [] })")).toEqual({ kind: "chase", maxPct: 8 });
    expect(p.run('dbRuleOf({ kind: "" }, null)')).toBeUndefined();
    expect(p.run('dbRuleOf({ kind: "volume", minUsd: "" }, null)')).toBe("Say the least a market trades over the day.");
    (p.run("globalThis") as Record<string, unknown>).FORM = form(["00–04", "20–24"]);
    expect(p.run('dbRuleOf({ kind: "hours" }, FORM)')).toEqual({ kind: "hours", skip: ["00–04", "20–24"] });
    expect(p.run('dbRuleOf({ kind: "markets", skipMarkets: " DOGE/USDT, ,PEPE/USDT" }, null)')).toEqual({ kind: "markets", skip: ["DOGE/USDT", "PEPE/USDT"] });
    expect(p.run('dbRuleOf({ kind: "plan", minTpPct: "", minSlPct: "", maxHours: "" }, null)')).toBe("Give the plan at least one bound.");
    expect(p.run('dbRuleOf({ kind: "plan", minTpPct: "2", minSlPct: "", maxHours: "24" }, null)')).toEqual({ kind: "plan", minTpPct: 2, maxHours: 24 });
    expect(p.run('dbRuleWords({ kind: "plan", minTpPct: 2, maxHours: 24 })')).toBe("the plan held to a take-profit of at least 2%, 24 h at most");
    expect(p.run('dbRuleWords({ kind: "chase", maxPct: 8 })')).toBe("no lead on a market that moved more than 8% over the day its way");
    expect(p.run('dbRuleWords({ kind: "volume", minUsd: 10000000 })')).toBe("no lead on a market that traded less than $10M over the day");
  });

  it("the owner's word, signed as the desk takes it: a candidate adopted after a yes, kept as a proposal without one; a lesson adopted, rejected and retired by its id; nothing signed on a no", async () => {
    const p = page();
    p.set("R", READ);
    p.run("DB.read = R; LS_SENT = []; LS_YES = true; confirmSheet = async () => LS_YES; own = async (d) => { LS_SENT.push(d); return { status: 200, body: { ok: true } }; }");
    const sent = () => (p.run<Array<{ type: string; change: string; value: string }>>("LS_SENT")).map((d) => ({ type: d.type, change: d.change, ...JSON.parse(d.value) }));
    await p.run<Promise<void>>('dbLessonAct("cand-adopt", { i: "0" })');
    await p.run<Promise<void>>('dbLessonAct("cand-propose", { i: "0" })');
    await p.run<Promise<void>>('dbLessonAct("adopt", { id: "LS-0005" })');
    await p.run<Promise<void>>('dbLessonAct("retire", { id: "LS-0004" })');
    p.run("LS_YES = false");
    await p.run<Promise<void>>('dbLessonAct("reject", { id: "LS-0005" })');
    expect(sent()).toEqual([
      { type: "setDesk", change: "lesson", op: "adopt", text: READ.candidates[0]!.text, rule: { kind: "markets", skip: ["DOGE/USDT"] }, from: "debrief", source: "the Debrief: the market slice DOGE/USDT" },
      { type: "setDesk", change: "lesson", op: "propose", text: READ.candidates[0]!.text, rule: { kind: "markets", skip: ["DOGE/USDT"] }, from: "debrief", source: "the Debrief: the market slice DOGE/USDT" },
      { type: "setDesk", change: "lesson", op: "adopt", id: "LS-0005" },
      { type: "setDesk", change: "lesson", op: "retire", id: "LS-0004" },
    ]);
  });
});
