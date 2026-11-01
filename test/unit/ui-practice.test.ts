import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE PRACTICE PANE (ui/practice.js): the simulator as the account reads it — the practice account to open, the session on with its clock,
 * its chart (no date: its days D−2, D−1 and the Day) and its quote, the position and the trades so far; the score at the bell with the day
 * told; the sessions played — and the Debrief's switch to the practice trades (ui/debrief.js). Run as the page runs them: plain scripts in
 * one global scope after ui/core.js, in a vm with a stand-in document */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "debrief.js", "practice.js"];

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

const M = 60_000;
/** session 3's day on the practice calendar: Wednesday 17 January 2001 */
const FROM = Date.parse("2001-01-17T00:00:00Z");
/** minutes from two days before the session to its 40th minute: a slow rise */
const BARS = Array.from({ length: 2 * 1440 + 40 }, (_, i) => {
  const t = FROM - 2 * 1440 * M + i * M;
  const o = 98 + i * 0.0006;
  return { t, o, h: o + 0.03, l: o - 0.02, c: o + 0.0006, v: 1500 };
});
const SESSION = { id: "s3-ab12cd34", n: 3, window: "train", symbol: "P3-PERP", name: "Practice market 3", hours: 24, cashUsd: 10_000, from: new Date(FROM).toISOString(), to: new Date(FROM + 1440 * M).toISOString(), now: new Date(FROM + 40 * M).toISOString(), running: true, speed: 30, minute: 40, minutes: 1440, startedAt: "2026-10-31T20:00:00.000Z" };
const READ = {
  ok: true,
  connected: true,
  venue: "practice",
  session: SESSION,
  quote: { price: 99.75, bid: 99.74, ask: 99.76 },
  account: {
    cashUsd: 9_001.2,
    position: { symbol: "P3-PERP", name: "Practice market 3", kind: "perp", side: "long", qty: 10, entryPrice: 99.5, markPrice: 99.75, unrealizedUsd: 2.5, leverage: 1 },
    orders: [{ id: "ord-0007", side: "sell", type: "stop", qty: 10, status: "open", at: "2026-10-31T20:01:00Z", stopPrice: 99.1 }],
    trades: [{ side: "short", openedAt: new Date(FROM + 5 * M).toISOString(), closedAt: new Date(FROM + 12 * M).toISOString(), qty: 10, entryPrice: 99.6, exitPrice: 99.4, netUsd: 0.01, returnPct: 0.001, end: "closed", closedBy: "owner", why: "lower high", setup: "trend", stop: 100, r: 0.002 }],
  },
  sessions: [],
  record: { rows: 1, intact: true },
  left: { train: 729, exam: 90 },
  holdout: "2026-07-31",
  asks: { coins: ["BTC", "ETH", "SOL"], coinsDefault: ["BTC", "ETH", "SOL"], speeds: [10, 20, 30, 50], cashDefault: 10_000, hoursMost: 24 },
};
const SCORE = {
  you: { trades: 2, wins: 1, losses: 1, netUsd: -12.4, netPct: -0.124, feesUsd: 4, planned: 2, rMean: -0.31, pastStop: 1 },
  chance: { trades: 2, monkeys: 1000, ownPct: -0.06, medianPct: 0.01, lowPct: -0.4, highPct: 0.4, rank: 0.42, p: 0.8, verdict: "few", words: "" },
  hold: { netUsd: 31.5, netPct: 0.315 },
  desk: { netUsd: -3.2, netPct: -0.032, trades: 4, fills: 9, open: true },
  reveal: { day: "2025-03-12", coin: "ETH", scale: 100 / 1873.4, window: "exam" },
  words: ["You: −$12.40 (−0.12%) in 2 trades, 1 won · −0.31 R a trade · 1 lost more than the plan's 1R"],
};

describe("the practice pane", () => {
  it("before the practice account: what it is, and the owner's button to open it — signed as a paper account of its own", () => {
    const p = page();
    p.set("PR.read", { ...READ, connected: false, session: undefined, account: undefined });
    const html = p.run<string>("prOpenHtml()");
    expect(html).toContain("The practice account");
    expect(html).toContain('data-pr="open"');
    expect(html).toContain("your own limits never count them");
  });

  it("the session on: its clock on the practice calendar — the weekday and time, never a date — how much is played, the controls; the quote against the session's open; the position, the orders open, the trades so far with their R and plan", () => {
    const p = page();
    p.set("PR.bars", BARS);
    p.set("PR.read", READ);
    const html = p.run<string>("prSessionHtml(PR.read)");
    expect(html).toContain("Session 3");
    expect(html).toContain('<span class="pr-num">Wed 00:40 UTC</span>');
    expect(html).toContain("minute 40 of 1440 · 30× — a minute every 2.0 s");
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('data-pr="stop">Pause</button>');
    expect(html).toMatch(/data-speed="30" aria-pressed="true"/);
    // the quote against the session's first minute, and its bid and ask
    expect(html).toContain("since the session opened at 99.73 · bid 99.74 · ask 99.76");
    expect(html).toContain("<b>Long 10</b> from 99.50 · +$2.50 open · 1×");
    expect(html).toContain("sell 10 · stop stop 99.10");
    expect(html).toContain("Paper cash $9,001.20 of $10,000.00");
    expect(html).toContain("This session's trades · 1");
    expect(html).toContain("+0.00 R");
    expect(html).toContain('lower high <span class="tag">trend</span>');
    // no year, no month, no real price anywhere the session is drawn
    expect(html).not.toMatch(/2001|Jan/);
  });

  it("the chart: the minutes folded as asked, the latest 96 bars, the days named from the session's — D−1 and the Day — said for a screen reader", () => {
    const p = page();
    p.set("PR.bars", BARS);
    p.set("PR.size", 60);
    const html = p.run<string>("prChartHtml(" + JSON.stringify(SESSION) + ")");
    expect(html).toContain('aria-pressed="true">1h</button>');
    expect((html.match(/<g class="(up|down)">/g) ?? []).length).toBe(49);
    expect(html).toContain(">D−1</text>");
    expect(html).toContain(">Day</text>");
    expect(html).not.toContain("D−2");
    expect(html).toMatch(/role="img" aria-label="49 bars of 60 minutes: from \d+\.\d\d to \d+\.\d\d, between/);
    // a fold's bar is its minutes': the first open, the highest high, the lowest low, the last close
    const folded = p.run<Array<{ t: number; o: number; h: number; l: number; c: number }>>(`prFold(${JSON.stringify(BARS.slice(0, 120))}, 60)`);
    expect(folded).toHaveLength(2);
    expect(folded[0]).toMatchObject({ t: BARS[0]!.t, o: BARS[0]!.o, h: BARS[59]!.h, l: BARS[0]!.l, c: BARS[59]!.c });
  });

  it("the bell: the day and the coin told, the factor said as the price it was; you, chance, holding and the desk — its position still open said — and the way to the Debrief's practice trades", () => {
    const p = page();
    p.set("PR.read", READ);
    const ended = { ...SESSION, running: false, endedAt: "2026-10-31T20:30:00Z", end: "bell", score: SCORE };
    const html = p.run<string>(`prScoreHtml(${JSON.stringify(ended)}, PR.read)`);
    expect(html).toContain("Session 3: the bell");
    expect(html).toContain("It was <b>ETH</b> on <b>Wed 12 Mar 2025</b>, a day of the held-out data — rebased: its 100.00 here was 1,873.40.");
    expect(html).toContain('<th scope="row">You</th><td class="r">−$12.40 <span class="dim">−0.12% · 2 trades, 1 won · −0.31 R a trade</span>');
    expect(html).toContain("beat 42% <span class=\"dim\">of 1,000 random entries with your sides and holding times · too few trades to say</span>");
    expect(html).toContain('<th scope="row">Holding it</th><td class="r">+$31.50 <span class="dim">+0.32%</span>');
    expect(html).toContain("−$3.20 <span class=\"dim\">−0.03% · 4 closed trades and one open at the end</span>");
    expect(html).toContain('data-pr="debrief"');
    // before the desk's run is done
    const waiting = p.run<string>(`prScoreHtml(${JSON.stringify({ ...ended, score: { ...SCORE, desk: undefined } })}, PR.read)`);
    expect(waiting).toContain("being run over the same bars…");
  });

  it("the sessions played, newest first; the start card with the days left, its form asking the account's words before it is signed", () => {
    const p = page();
    p.set("PR.read", READ);
    const list = [{ id: "s2-x", n: 2, window: "exam", day: "2026-08-02", coin: "SOL", hours: 24, cashUsd: 10_000, endedAt: "2026-10-30T20:00:00Z", end: "owner", score: { ...SCORE, words: [] } }];
    const html = p.run<string>(`prHistoryHtml(${JSON.stringify(list)})`);
    expect(html).toContain('<td>2 <span class="tag warn">Exam</span></td><td>SOL · Sun 2 Aug 2026</td><td class="r">−0.12% <span class="dim">· 2 trades</span></td><td class="r">42%</td><td class="r">+0.32%</td><td class="r">−0.03%</td>');
    const start = p.run<string>("prStartHtml(PR.read)");
    expect(start).toContain("729 days to practise on · 90 exam days left");
    expect(start).toContain("from the two years before the lab's holdout (2026-07-31)");
    expect(start).toContain('data-pr="start"');
    expect(p.run<string>("prDuration(1440 / 50)")).toBe("29 min");
    expect(p.run<string>("prDuration(1440 / 20)")).toBe("1 h 12 min");
    expect(p.run<string>("prDuration(1440 / 10)")).toBe("2 h 24 min");
  });

  it("reads again about once a practice minute while the clock runs, none while it is stopped; the Debrief reads the practice trades apart when switched to them", () => {
    const p = page();
    p.run(`ROUTE.tab = "practice"`);
    p.set("PR.read", READ);
    p.run("prNext()");
    expect(p.run<number>("PR.timer")).not.toBe(0);
    p.run("clearTimeout(PR.timer); PR.timer = 0");
    p.set("PR.read", { ...READ, session: { ...SESSION, running: false } });
    p.run("prNext()");
    expect(p.run<number>("PR.timer")).toBe(0);
    // the Debrief: the practice switch, its read, no window over the practice calendar
    p.run(`DB.practice = "1"; DB.days = "30"; dbRead()`);
    expect(p.asked[p.asked.length - 1]).toBe("/api/account/debrief?practice=1");
    const head = p.run<string>("dbHeadHtml(null)");
    expect(head).toContain('data-db-kind="1" aria-pressed="true">Practice</button>');
    expect(head).not.toContain("data-db-days");
    expect(p.run<string>("dbEmptyHtml()")).toContain("No practice trade yet");
  });
});

/* the account's license (service.ts license): practice passing, the exam short of level 2 — as GET /api/account/license answers */
const check = (ok: boolean, words: string) => ({ ok, words });
const BOOK = (window: string, o: Record<string, unknown> = {}) => ({ window, sessions: 10, trades: 100, edge: check(true, "+0.230% a trade after costs; its 95% range +0.150% to +0.310%, all of it above zero"), chance: { ...check(true, "100 trades beat 100% of 1,000 random records with the same sides and holding times (90% at least)"), judged: 10, left: 0, broken: 0 }, plans: { ...check(true, "100 of 100 trades kept their plan — 100%, 90% at least"), kept: 100, unsaid: 0, pastStop: 0 }, calibration: { ...check(true, "100 trades said how sure: 70% on average, and 70% won — 0.0 points off, band by band (10 at most)"), sure: 100, bands: [] }, ...o });
const LADDER = [
  { level: 0, name: "Student", capUsd: 0, needs: {}, words: "no real order of your own: paper and practice only" },
  { level: 1, name: "Learner", capUsd: 25, needs: { train: 100 }, words: "up to $25.00 an order — practice: 100 trades, every check passed" },
  { level: 2, name: "Licensed", capUsd: 100, needs: { train: 100, exam: 50 }, words: "up to $100.00 an order — practice: 100 trades, and the exam: 50 trades, every check passed" },
  { level: 3, name: "Senior", capUsd: null, needs: { train: 300, exam: 100 }, words: "up to the server's own cap — practice: 300 trades, and the exam: 100 trades, every check passed" },
];
const LICENSE = {
  ok: true,
  level: 1,
  name: "Learner",
  books: { train: BOOK("train"), exam: BOOK("exam", { sessions: 2, trades: 12, calibration: { ...check(false, "12 trades said how sure they were: 30 at least are needed to judge it — say it under the plan's How sure"), sure: 12, bands: [] } }) },
  next: { level: 2, name: "Licensed", missing: ["50 trades in the exam (12 so far)", "calibration in the exam: 12 trades said how sure they were: 30 at least are needed to judge it — say it under the plan's How sure"] },
  serverCapUsd: 100,
  ladder: LADDER,
  self: { entriesToday: 0 },
};

describe("your license, on the practice pane", () => {
  it("not held: the ladder with the record's level, the two windows' checks — passed or not, in a glyph and a word — what the next level needs, that it does not bind, and the owner's Hold…", () => {
    const p = page();
    p.set("L", LICENSE);
    const html = p.run<string>("prLicenseHtml(L)");
    expect(html).toContain('<h2 class="h2" id="pr-l-h">Your license</h2><span class="chip">Level 1 · Learner</span>');
    expect(html).toContain('<li class="done"><span class="pr-rung"><b>0 · Student</b></span>');
    expect(html).toContain('<li class="at"><span class="pr-rung"><b>1 · Learner</b> <span class="tag up">Your record</span></span><span class="small">up to $25.00 an order — practice: 100 trades, every check passed</span></li>');
    expect(html).toContain("up to the server&#39;s own cap — practice: 300 trades, and the exam: 100 trades, every check passed ($100.00 now)");
    // each window: its trades against what level 2 needs of it, and the checks
    expect(html).toContain('<h3>Practice</h3><ul class="pr-checks"><li class="ok"><span class="pr-mark" aria-hidden="true">✓</span><span><b>Trades</b> 100 trades in 10 sessions — level 2 needs 100</span></li>');
    expect(html).toContain('<h3>The exam</h3><ul class="pr-checks"><li class="no"><span class="pr-mark" aria-hidden="true">✗</span><span><b>Trades</b> 12 trades in 2 sessions — level 2 needs 50</span></li>');
    expect(html).toContain('<li class="no"><span class="pr-mark" aria-hidden="true">✗</span><span><b>Calibration</b><span class="sr"> not yet:</span> 12 trades said how sure they were');
    expect(html).toContain('<b>Edge after costs</b><span class="sr"> passed:</span> +0.230% a trade after costs');
    // what level 2 needs, each from a capital
    expect(html).toContain("<h3>Level 2 · Licensed needs</h3><ul><li>50 trades in the exam (12 so far)</li><li>Calibration in the exam: 12 trades said how sure");
    expect(html).toContain("It does not bind now: your own real orders are held by the server's cap alone ($100.00 an order).");
    expect(html).toContain('data-pr="lic-hold">Hold my real orders to it…</button>');
    expect(html).not.toContain('data-pr="lic-off"');
  });

  it("held: what one real entry of the owner's own may be worth now and why — a record under what was signed said — a step up where the record shows more, a loosening waiting, Stop…; and level 0's none", () => {
    const p = page();
    p.set("L", { ...LICENSE, signed: 2, held: 1, capUsd: 25, self: { now: { license: 2, liftHours: 24 }, entriesToday: 0 } });
    const held = p.run<string>("prLicenseHtml(L)");
    expect(held).toContain("Your own real entries: up to <b>$25.00</b> an order — level 1 (Learner): you signed up to level 2, and your record shows level 1 now. A close always goes.");
    expect(held).toContain('<b>1 · Learner</b> <span class="tag up">Your record</span> <span class="tag">Held</span>');
    expect(held).not.toContain('data-pr="lic-up"');
    expect(held).toContain('data-pr="lic-off">Stop holding them to it…</button>');
    p.set("L", { ...LICENSE, level: 2, name: "Licensed", next: { level: 3, name: "Senior", missing: ["300 trades in practice (100 so far)"] }, signed: 1, held: 1, capUsd: 25, self: { now: { license: 1, liftHours: 24 }, pending: { to: { license: 2, liftHours: 24 }, signedAt: "2026-10-31T15:00:00.000Z", from: "2026-11-01T15:00:00.000Z" }, entriesToday: 0 } });
    const up = p.run<string>("prLicenseHtml(L)");
    expect(up).toContain('data-pr="lic-up">Step up to level 2…</button>');
    expect(up).toMatch(/<span class="tag warn">Waiting<\/span> level 2 from Sun 1 Nov 1\d:00 New York\./);
    p.set("L", { ...LICENSE, level: 0, name: "Student", signed: 0, held: 0, capUsd: 0, self: { now: { license: 0, liftHours: 24 }, entriesToday: 0 } });
    expect(p.run<string>("prLicenseHtml(L)")).toContain("<b>No real entry of your own</b>: paper and practice only — level 0 (Student). A close always goes.");
    expect(p.run<string>("prLicenseHtml(null)")).toBe("");
    // a server started read-only places no real order: nothing to hold, nothing to sign
    p.set("L", { ...LICENSE, readOnly: true, serverCapUsd: 0 });
    const ro = p.run<string>("prLicenseHtml(L)");
    expect(ro).toContain("This server was started read-only: it places no real order, so the license has nothing to hold here.");
    expect(ro).not.toContain("data-pr=\"lic-");
    expect(ro).not.toContain("now)</span>");
  });

  it("the owner's word on it: own limits signed again with the license in them — the ones in force kept — after a yes that says what it does; a step up says it waits; let go of, the license alone takes them all away", async () => {
    const p = page();
    p.run("LIC_SENT = []; LIC_ASKED = []; confirmSheet = async (m, o) => { LIC_ASKED.push([o.title, m]); return true; }; own = async (d) => { LIC_SENT.push(d); return { status: 200, body: { ok: true } }; }");
    const sent = () => p.run<Array<{ type: string; change: string; value: string }>>("LIC_SENT").map((d) => ({ ...d, value: d.value ? JSON.parse(d.value) : "" }));
    p.set("PR.license", { ...LICENSE, self: { now: { maxEntries: 5, liftHours: 48, words: "5 entries a day at most — loosened only 48 h after it is signed" }, entriesToday: 0 } });
    await p.run<Promise<void>>('prLicenseAct("lic-hold")');
    expect(p.run("LIC_ASKED")).toEqual([["Hold your real orders to your license", "From now on a real order of your own that opens or adds to a position may be worth up to $25.00 — level 1 (Learner), what your record shows now — and less at once if your record falls. A close always goes; an agent keeps to its own limits. Letting go of it later waits 48 h, as your own limits say."]]);
    expect(sent()).toEqual([{ type: "setPolicy", change: "self", value: { maxEntries: 5, license: 1, liftHours: 48 } }]);
    p.run("LIC_SENT = []; LIC_ASKED = []");
    p.set("PR.license", { ...LICENSE, level: 2, name: "Licensed", signed: 1, held: 1, capUsd: 25, self: { now: { maxEntries: 5, license: 1, liftHours: 48 }, entriesToday: 0 } });
    await p.run<Promise<void>>('prLicenseAct("lic-up")');
    expect(p.run("LIC_ASKED")).toEqual([["Step up to level 2", "Level 2 (Licensed): a real order of your own may be worth up to $100.00. A loosening, so it holds 48 h after you sign — and only as far as your record still shows then."]]);
    expect(sent()).toEqual([{ type: "setPolicy", change: "self", value: { maxEntries: 5, license: 2, liftHours: 48 } }]);
    p.run("LIC_SENT = []; LIC_ASKED = []");
    await p.run<Promise<void>>('prLicenseAct("lic-off")');
    expect(p.run<Array<[string, string]>>("LIC_ASKED")[0]![1]).toBe("48 h from now, as your own limits say, your real orders are held by the server's cap alone ($100.00 an order); until then your license holds. Your other own limits stay as they are.");
    expect(sent()).toEqual([{ type: "setPolicy", change: "self", value: { maxEntries: 5, liftHours: 48 } }]);
    p.run("LIC_SENT = []");
    p.set("PR.license", { ...LICENSE, signed: 1, held: 1, capUsd: 25, self: { now: { license: 1, liftHours: 0 }, entriesToday: 0 } });
    await p.run<Promise<void>>('prLicenseAct("lic-off")');
    expect(sent()).toEqual([{ type: "setPolicy", change: "self", value: "" }]);
    // a viewer signs nothing; the license is read from the account
    p.run('Owner.role = "viewer"; LIC_SENT = []');
    await p.run<Promise<void>>('prLicenseAct("lic-hold")');
    expect(p.run("LIC_SENT")).toEqual([]);
    p.run("prLicense()");
    expect(p.asked[p.asked.length - 1]).toBe("/api/account/license");
  });
});
