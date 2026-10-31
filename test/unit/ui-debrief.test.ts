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
    expect(html).toContain("On every trade here, the ones it was likely found in among them: it would have stopped 12 trades of the desk&#39;s 80: -$40.10, −0.310% a trade, 25% won; the 68 it let through made $12.00, +0.020% a trade. 3 trades it could not judge: the number it needs was not kept with them.");
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

describe("a lesson's test, the lab and the desk's versions (ui/debrief.js)", () => {
  const RULE = { kind: "markets", skip: ["DOGE/USDT"] };
  const R = {
    desk: true,
    deskTrades: 80,
    candidates: [],
    lessons: [{ id: "LS-0004", at: "2026-10-29T01:10:00Z", from: "debrief", text: "Leave DOGE/USDT alone.", roles: ["search", "risk"], rule: RULE, words: "never DOGE/USDT", state: "proposed", test: { since: "2026-10-29T01:10:00Z", trades: 52, unjudged: 2, stopped: { n: 31, netUsd: -45.2, meanPct: -0.29, winRatePct: 20 }, kept: { n: 21, netUsd: 12, meanPct: 0.05, winRatePct: 55 }, t: -2.6, verdict: "helps", words: "Of the desk's 52 trades since 2026-10-29, it would have stopped 31 — −$45.20, −0.290% a trade, t −2.6: they lost beyond chance, so the rule would have kept $45.20." } }],
    versions: [{ v: 2, at: "2026-10-30T14:00:00Z", change: "lesson", words: "lesson LS-0003 adopted: no lead entered 00–04 New York", hash: "bbbbbbbbbbbb" }, { v: 1, at: "2026-10-28T14:00:00Z", change: "hire", words: "desk hired: 5 seats at Paper", hash: "aaaaaaaaaaaa" }],
    debrief: { slices: { version: [{ label: "v1", n: 40, wins: 18, winRatePct: 45, netUsd: -20, meanPct: -0.05, few: false }, { label: "v2", n: 12, wins: 7, winRatePct: 58, netUsd: 9, meanPct: 0.075, few: true }] } },
  };

  it("says each lesson's test with its verdict, offers Test in the lab… to the owner where it has a rule, and lists the desk's versions with what each one's trades made", () => {
    const p = page();
    p.set("R", R);
    const html = p.run<string>("dbLessonsHtml(R)");
    expect(html).toContain('<p class="small db-ls-test"><span class="tag up">Helps</span> Of the desk&#39;s 52 trades since 2026-10-29, it would have stopped 31 — −$45.20, −0.290% a trade, t −2.6: they lost beyond chance, so the rule would have kept $45.20. <span class="dim">2 trades it could not judge.</span></p>');
    expect(html).toContain('data-db-ls="lab" data-id="LS-0004">Test in the lab…</button>');
    expect(html).toContain("<h3>The desk's versions</h3>");
    expect(html).toContain("<td><b>v2</b></td>");
    expect(html).toContain("lesson LS-0003 adopted: no lead entered 00–04 New York");
    expect(html).toContain('12 <span class="tag" title="Fewer than 30 trades: a sketch, not a finding">few</span>');
    p.run('Owner.role = "viewer"');
    expect(p.run<string>("dbLessonsHtml(R)")).not.toContain('data-db-ls="lab"');
  });

  it("Test in the lab… puts the lesson's rule alone in the Backtest page's desk form, in desk mode, and goes there", async () => {
    const p = page();
    p.set("R", R);
    p.run("DB.read = R; WENT = []; go = (tab) => WENT.push(tab); toast = () => {}");
    p.run('BT.deskRules = [{ rule: { kind: "side", only: "buy" }, words: "longs only" }]');
    await p.run<Promise<void>>('dbLessonAct("lab", { id: "LS-0004" })');
    expect(p.run("BT.mode")).toBe("desk");
    expect(p.run("BT.deskRules")).toEqual([{ id: "LS-0004", rule: RULE, words: "never DOGE/USDT" }]);
    expect(p.run("WENT")).toEqual(["backtest"]);
  });
});

describe("your plans and your own limits (account/debrief.ts plans, ui/debrief.js)", () => {
  /** a trade of the owner's own: with a plan signed for it where given, without the bracket where it had none */
  const mine = (i: number, gross: number, o: { end?: DebriefTrade["end"]; plan?: Record<string, unknown>; bracket?: false } = {}): DebriefTrade => {
    const { takeProfit: _tp, stopLoss: _sl, lead: _l, ...t } = trade(i, gross, o.end ? { end: o.end } : {});
    return { ...t, ...(o.bracket === false ? {} : { takeProfit: 100.4, stopLoss: 99.6 }), by: { who: "owner" }, ...(o.plan ? { plan: { at: at(i * 3), why: `trade ${i}`, ...o.plan } as DebriefTrade["plan"] } : {}) };
  };
  const OWN = [
    mine(0, 0.4, { end: "take-profit", plan: { setup: "breakout", confidence: 0.8, stop: 99.6, target: 100.4, riskUsd: 4 } }),
    mine(1, -0.4, { end: "stop-loss", plan: { setup: "breakout", confidence: 0.6, stop: 99.6, riskUsd: 4 } }),
    // gapped through its stop: 0.8% lost against 0.4% risked
    mine(2, -0.8, { end: "stop-loss", plan: { setup: "pullback", confidence: 0.65, stop: 99.6, riskUsd: 4 } }),
    // no bracket and no 1R: its R from the plan's own stop, 1% away; closed by hand at a gain short of its target
    mine(3, 0.5, { bracket: false, plan: { confidence: 0.5, stop: 99, target: 102 } }),
    mine(4, -0.4),
    // the desk's are not the owner's
    ...MACHINE.slice(0, 3),
  ];

  it("debriefOf: the owner's trades with a plan beside those without; in R by the plan's 1R or its stop, the stops not kept, the winners closed before their target, the setups, how sure they said — and nothing where no trade is the owner's", () => {
    const d = debriefOf(OWN);
    expect(d.plans).toMatchObject({ planned: { label: "with a plan", n: 4, wins: 2, winRatePct: 50, meanPct: -0.275 }, unplanned: { n: 1, meanPct: -0.6 }, r: { trades: 4, meanR: -0.8, pastStop: 1 }, early: 1 });
    expect(d.plans!.setups.map((x) => [x.label, x.n]).sort()).toEqual([["breakout", 2], ["pullback", 1]]);
    expect(d.plans!.calibration).toEqual([{ label: "under 0.6", n: 1, saidPct: 50, wonPct: 100 }, { label: "0.6–0.7", n: 2, saidPct: 62.5, wonPct: 0 }, { label: "0.8 and over", n: 1, saidPct: 80, wonPct: 100 }]);
    expect(d.notes).toContain("Your trades with a plan made −0.275% a trade (4); without one, −0.600% (1).");
    expect(d.notes).toContain("1 of your planned trades lost more than their stop allowed: the stop was not kept, the price gapped through it, or the size was more than the plan's 1R.");
    expect(d.notes).toContain("You closed 1 winner before its target.");
    expect(debriefOf(MACHINE).plans).toBeUndefined();
  });

  it("the Debrief's Your plans: the two rows, R and the stops, the setups, how sure — and, with no plan made, how to make one", () => {
    const p = page();
    p.set("D", debriefOf(OWN));
    const html = p.run<string>("debriefHtml(D)");
    expect(html).toContain('<h2 class="h2" id="db-pl-h">Your plans</h2>');
    expect(html).toMatch(/<th scope="row">With a plan<\/th><td class="r">4 <span class="tag"[^>]*>few<\/span><\/td><td class="r">50%<\/td>/);
    expect(html).toContain("In R: −0.80 a trade over 4 trades with a stop.");
    expect(html).toContain("1 trade lost more than the stop allowed: the stop was not kept, the price gapped through it, or the size was more than the plan&#39;s 1R.");
    expect(html).toContain("1 winner closed before the target.");
    expect(html).toContain("<h3>By setup</h3>");
    expect(html).toContain("<h3>How sure you said you were</h3>");
    p.set("U", debriefOf([mine(0, 0.4), mine(1, -0.4)]));
    expect(p.run<string>("dbPlansHtml(U)")).toContain("None of your 2 trades here had a plan. On the Trade ticket, at a paper account, write why under Plan before you sign");
    p.set("M", debriefOf(MACHINE));
    expect(p.run<string>("dbPlansHtml(M)")).toBe("");
  });

  /* the account's answer (service.ts selfView): limits in force, a loosening waiting, what holds a new entry back */
  const SELF = {
    now: { maxEntries: 2, planFirst: true, liftHours: 24, words: "2 entries a day at most · a plan before every entry — loosened only 24 h after it is signed" },
    pending: { to: { maxEntries: 5, liftHours: 24, words: "5 entries a day at most — loosened only 24 h after it is signed" }, signedAt: "2026-10-12T15:00:00.000Z", from: "2026-10-13T15:00:00.000Z" },
    held: { why: "your own limit is 2 entries a day, and today has had 2: no new entry until midnight New York", until: "2026-10-13T04:00:00.000Z" },
    entriesToday: 2,
  };

  it("Your own limits: what holds a new entry back, what holds now, a loosening waiting and from when; the owner's Change and Take away — a viewer's none; none set says what they are", () => {
    const p = page();
    p.set("X", SELF);
    const html = p.run<string>("dbSelfHtml(X)");
    expect(html).toContain('<h2 class="h2" id="db-self-h">Your own limits</h2><span class="dim small">2 entries today</span>');
    expect(html).toContain('<div class="msg no" role="status">your own limit is 2 entries a day, and today has had 2: no new entry until midnight New York</div>');
    expect(html).toContain('<p class="db-self-now">2 entries a day at most · a plan before every entry — loosened only 24 h after it is signed.</p>');
    expect(html).toContain('<span class="tag warn">Waiting</span> 5 entries a day at most — loosened only 24 h after it is signed — from Tue 13 Oct 11:00 New York; signed Mon 12 Oct 11:00.');
    expect(html).toContain('data-db-ls="self">Change them…</button>');
    expect(html).toContain('data-db-ls="self-off">Take them away…</button>');
    p.run('Owner.role = "viewer"');
    expect(p.run<string>("dbSelfHtml(X)")).not.toContain("data-db-ls=");
    p.run('Owner.role = "owner"');
    const none = p.run<string>("dbSelfHtml({ entriesToday: 0 })");
    expect(none).toContain("None set. Signed while calm, they hold your paper trading when it is not");
    expect(none).toContain('data-db-ls="self">Set your own limits…</button>');
    expect(p.run<string>("dbSelfHtml(undefined)")).toBe("");
  });

  it("the sheet that sets them starts from the limits in force and signs setPolicy self — a streak's pause 30 minutes where not said, one limit at least; taking them away says when it holds, after a yes", async () => {
    const p = page();
    p.run("globalThis.FormData = class { constructor(f) { this.f = f; } entries() { return Object.entries(this.f); } }");
    p.set("X", SELF);
    p.run("DB.read = { self: X }; QD = null; quoteDialog = (o) => { QD = o; }");
    p.run("dbSelfForm()");
    expect(p.run<string>("QD.fields")).toContain('name="maxEntries" type="number" inputmode="decimal" min="1" max="200" step="1" placeholder="none" value="2"');
    expect(p.run<string>("QD.fields")).toContain('<input type="checkbox" name="planFirst" checked>');
    const draft = p.run<{ type: string; change: string; value: string }>('QD.draft({ dayLossUsd: "250", losses: "3", coolMin: "", maxEntries: "4", planFirst: "on", liftHours: "48" })');
    expect({ ...draft, value: JSON.parse(draft.value) }).toEqual({ type: "setPolicy", change: "self", value: { dayLossUsd: 250, streak: { losses: 3, coolMin: 30 }, maxEntries: 4, planFirst: true, liftHours: 48 } });
    expect(p.run('QD.draft({ dayLossUsd: "", losses: "", coolMin: "", maxEntries: "", liftHours: "24" })')).toBe("Set one limit at least — to take them all away, use Take them away… instead.");
    // what is signed, in the account's words, and when it holds
    expect(p.run<string>('QD.show({ action: { value: JSON.stringify({ dayLossUsd: 250, streak: { losses: 3, coolMin: 30 }, maxEntries: 1, planFirst: true, liftHours: 0 }) } })')).toContain("no new entry after a day&#39;s loss of $250.00 · 30 minutes&#39; pause after 3 losses in a row · 1 entry a day at most · a plan before every entry — loosened as soon as it is signed");
    expect(p.run<string>('QD.show({ action: { value: JSON.stringify({ maxEntries: 5, liftHours: 24 }) } })')).toContain("looser in any, they hold 24 h after you sign");
    p.run("SELF_SENT = []; SELF_ASKED = []; confirmSheet = async (m) => { SELF_ASKED.push(m); return true; }; own = async (d) => { SELF_SENT.push(d); return { status: 200, body: { ok: true } }; }");
    await p.run<Promise<void>>('dbLessonAct("self-off", {})');
    expect(p.run("SELF_ASKED")).toEqual(["Your own limits stop holding 24 h from now, as you set them to: until then they hold as they are."]);
    expect(p.run("SELF_SENT")).toEqual([{ type: "setPolicy", change: "self", value: "" }]);
  });
});
