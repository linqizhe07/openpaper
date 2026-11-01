import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { appendTrade, type JournalTrade } from "../../src/portfolio/account/journal.ts";
import { bookOf, licenseCap, licenseHeld, licenseView, pooledChance, recordLevel, type LicenseBooks, type LicenseTrade, type SessionTries } from "../../src/portfolio/account/license.ts";
import { parseSelfLimits, selfWords, tighter } from "../../src/portfolio/account/plans.ts";
import { appendPractice, practiceId, practiceTriesPath, triesHash, writeTries, type KeptTries, type PracticeWindow } from "../../src/portfolio/account/practice.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { register, type LiveDeps } from "../../src/portfolio/live/index.ts";
import type { LiveTrader, Market, OrderState } from "../../src/portfolio/live/trade.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** THE LICENSE (account/license.ts): what the owner's record in the simulator lets one real order of their own be worth — the checks on
 * each window's record, the random records pooled from the sessions' kept tries, the ladder, the level held where the owner's own limits
 * name it — and, at the service, the record read from the journal and the practice record, a level signed only once the record shows it,
 * and the door holding the owner's own real entries to it, never a close and never an agent's order */
type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const START = Date.parse("2026-10-29T12:00:00.000Z");
const H = 3_600_000;
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));

/** a practice trade: won +0.5% of a $1,000 entry, or lost −0.4% — a plan with its stop $10 away (1R) and how sure it was */
function trade(o: { won: boolean; confidence?: number | undefined; stop?: number | null; pastStop?: boolean }): LicenseTrade {
  const returnPct = o.won ? 0.5 : -0.4;
  const netUsd = (returnPct * 1_000) / 100;
  return { netUsd, grossUsd: o.pastStop ? -15 : netUsd + 0.5, returnPct, entryPrice: 100, qty: 10, plan: { why: "a pullback to the open", ...(o.stop === null ? {} : { stop: o.stop ?? 99 }), ...(o.confidence !== undefined ? { confidence: o.confidence } : { confidence: 0.7 }), at: new Date(START).toISOString() } };
}
/** n trades, seven in ten won */
const trades = (n: number, o: Partial<Parameters<typeof trade>[0]> = {}): LicenseTrade[] => Array.from({ length: n }, (_, i) => trade({ won: i % 10 < 7, ...o }));
/** a session's tries: a thousand random records' nets a trade, spread evenly over ±spread around `mid` (%) */
const tries = (n: number, ownPct: number, mid = 0, spread = 0.2): SessionTries => ({ trades: n, ownPct, means: Array.from({ length: 1_000 }, (_, i) => mid - spread + ((i * 7919) % 1_000) * ((2 * spread) / 999)) });
const empty = (w: PracticeWindow) => bookOf(w, { trades: [], sessions: 0, tries: [] });

describe("THE LICENSE'S CHECKS, on one window's record", () => {
  it("pools the sessions' tries into random records of all their trades, each session weighted by its trades: where the record ranks, the middle one and the 90th percentile", () => {
    // two sessions: 2 trades and 3; record k is (2 × the first's k-th try + 3 × the second's) / 5, and the trades are pooled the same way
    const a = { trades: 2, ownPct: 0.05, means: [0.1, -0.1, 0, 0.2] };
    const b = { trades: 3, ownPct: 0.05, means: [0, 0.1, -0.2, 0.05] };
    const p = pooledChance([a, b])!;
    // the records: 0.04, 0.02, −0.12, 0.11 — the trades' 0.05 beats three of four
    expect([p.rank, p.tries, p.trades, p.ownPct]).toEqual([0.75, 4, 5, 0.05]);
    expect(p.medianPct).toBeCloseTo(0.04, 12);
    expect(p.barPct).toBeCloseTo(0.11, 12);
    // a tie counts half; no tries, nothing; sessions with tries of different lengths pool the shortest
    expect(pooledChance([{ trades: 1, ownPct: 0.1, means: [0.1, 0, 0.2] }])!.rank).toBeCloseTo(0.5, 12);
    expect(pooledChance([])).toBeUndefined();
    expect(pooledChance([a, { ...b, means: [0, 0.1] }])!.tries).toBe(2);
  });

  it("a record that passes: 100 trades, the edge's 95% range above zero, beside chance, its plans kept, calibrated", () => {
    const b = bookOf("train", { trades: trades(100), sessions: 10, tries: Array.from({ length: 10 }, () => tries(10, 0.23)) });
    expect([b.trades, b.sessions, b.edge.ok, b.chance.ok, b.plans.ok, b.calibration.ok]).toEqual([100, 10, true, true, true, true]);
    expect(b.edge).toMatchObject({ meanPct: 0.23 });
    expect(b.edge.lowPct!).toBeGreaterThan(0);
    expect(b.edge.words).toMatch(/^\+0\.230% a trade after costs; its 95% range \+0\.1\d\d% to \+0\.3\d\d%, all of it above zero$/);
    expect(b.chance).toMatchObject({ rank: 1, tries: 1_000, judged: 10, left: 0, broken: 0 });
    expect(b.chance.words).toBe("100 trades beat 100% of 1,000 random records with the same sides and holding times (90% at least): +0.230% a trade, theirs 0.000% in the middle and +0.160% at the 90th percentile");
    expect(b.plans).toMatchObject({ kept: 100, unsaid: 0, pastStop: 0, words: "100 of 100 trades kept their plan — 100%, 90% at least" });
    expect(b.calibration).toMatchObject({ sure: 100, gapPts: 0, words: "100 trades said how sure: 70% on average, and 70% won — 0.0 points off, band by band (10 at most)" });
  });

  it("and what each check says where it is not passed", () => {
    // the edge: a mean a trade whose range takes in zero
    const flat = bookOf("train", { trades: Array.from({ length: 40 }, (_, i) => trade({ won: i % 2 === 0 })), sessions: 4, tries: [] });
    expect(flat.edge.ok).toBe(false);
    expect(flat.edge.words).toMatch(/ — its low end has to be above zero$/);
    expect(bookOf("train", { trades: trades(1), sessions: 1, tries: [] }).edge.words).toBe("one trade: no range to judge yet");
    // chance: the record beats too few; a session's tries changed or gone; one from before a bell kept them
    const weak = bookOf("train", { trades: trades(100), sessions: 10, tries: [tries(100, 0.1, 0, 0.2)] });
    expect([weak.chance.ok, weak.chance.rank]).toEqual([false, 0.75]);
    expect(bookOf("train", { trades: trades(100), sessions: 10, tries: [tries(100, 0.23)], broken: 2 }).chance).toMatchObject({ ok: false, words: "the random entries of 2 sessions are missing, or are not what their bell kept: chance is not judged" });
    expect(bookOf("train", { trades: trades(100), sessions: 10, tries: [], left: 1 }).chance.words).toBe("no random entries to judge by yet — 1 session from before the bell kept its random entries is left out");
    // plans: a stop and no 1R named on 15 of them, and 1 that lost more than its 1R before costs
    const loose = bookOf("train", { trades: [...trades(84), ...trades(15, { stop: null }), trade({ won: false, pastStop: true })], sessions: 10, tries: [] });
    expect(loose.plans).toMatchObject({ ok: false, kept: 84, unsaid: 15, pastStop: 1, words: "84 of 100 trades kept their plan — 84%, 90% at least; 15 trades named no stop and no 1R, 1 trade lost more than the plan's 1R before costs" });
    // calibration: too few said how sure; sure of every one, and seven in ten won
    const unsure = bookOf("train", { trades: [...trades(29), ...trades(71, { confidence: undefined })].map((t, i) => (i < 29 ? t : { ...t, plan: { why: "w", stop: 99, at: t.plan!.at } })), sessions: 10, tries: [] });
    expect(unsure.calibration).toMatchObject({ ok: false, sure: 29, words: "29 trades said how sure they were: 30 at least are needed to judge it — say it under the plan's How sure" });
    const sure = bookOf("train", { trades: trades(100, { confidence: 0.95 }), sessions: 10, tries: [] });
    expect(sure.calibration).toMatchObject({ ok: false, gapPts: 25, words: "100 trades said how sure: 95% on average, and 70% won — 25.0 points off, band by band (10 at most)" });
    expect(sure.calibration.bands).toEqual([{ label: "0.8 and over", n: 100, saidPct: 95, wonPct: 70 }]);
  });
});

describe("THE LADDER: the level the record shows, the level held, what an order of the owner's own may be worth", () => {
  const passing = (w: PracticeWindow, n: number) => bookOf(w, { trades: trades(n), sessions: Math.ceil(n / 10), tries: [tries(n, 0.23)] });

  it("practice alone, 100 trades passing: Learner; and the exam's 50: Licensed; 300 and 100: Senior — each level's needs its own and the ones under it", () => {
    const none: LicenseBooks = { train: empty("train"), exam: empty("exam") };
    expect(recordLevel(none)).toBe(0);
    expect(recordLevel({ train: passing("train", 99), exam: empty("exam") })).toBe(0);
    expect(recordLevel({ train: passing("train", 100), exam: empty("exam") })).toBe(1);
    expect(recordLevel({ train: passing("train", 100), exam: passing("exam", 50) })).toBe(2);
    expect(recordLevel({ train: passing("train", 299), exam: passing("exam", 100) })).toBe(2);
    expect(recordLevel({ train: passing("train", 300), exam: passing("exam", 100) })).toBe(3);
    // an exam that passes is no use without the practice under it
    expect(recordLevel({ train: passing("train", 40), exam: passing("exam", 100) })).toBe(0);
  });

  it("the view: the record's level and what the next one misses — a window with no trades only its count — the ladder; held at the lower of what was signed and what the record shows, under the server's cap", () => {
    const books: LicenseBooks = { train: passing("train", 100), exam: empty("exam") };
    const v = licenseView({ books, serverCapUsd: 100 });
    expect([v.level, v.name, v.held, v.capUsd]).toEqual([1, "Learner", undefined, undefined]);
    expect(v.next).toEqual({ level: 2, name: "Licensed", missing: ["50 trades in the exam (0 so far)"] });
    expect(v.ladder.map((l) => [l.level, l.name, l.capUsd, l.needs, l.words])).toEqual([
      [0, "Student", 0, {}, "no real order of your own: paper and practice only"],
      [1, "Learner", 25, { train: 100 }, "up to $25.00 an order — practice: 100 trades, every check passed"],
      [2, "Licensed", 100, { train: 100, exam: 50 }, "up to $100.00 an order — practice: 100 trades, and the exam: 50 trades, every check passed"],
      [3, "Senior", null, { train: 300, exam: 100 }, "up to the server's own cap — practice: 300 trades, and the exam: 100 trades, every check passed"],
    ]);
    expect(licenseView({ books, signed: 1, serverCapUsd: 100 })).toMatchObject({ signed: 1, held: 1, capUsd: 25 });
    // signed higher than the record shows now: the record holds; a server cap under the level's: the server's
    expect(licenseView({ books, signed: 2, serverCapUsd: 100 })).toMatchObject({ signed: 2, held: 1, capUsd: 25 });
    expect(licenseView({ books, signed: 1, serverCapUsd: 20 })).toMatchObject({ held: 1, capUsd: 20 });
    expect([licenseCap(0, 100), licenseCap(2, 100), licenseCap(3, 5_000), licenseCap(3, 50)]).toEqual([0, 100, 5_000, 50]);
    // what the next level misses once the exam has trades: its count, and each check not passed
    const short = licenseView({ books: { train: books.train, exam: bookOf("exam", { trades: trades(12), sessions: 2, tries: [tries(12, 0.23)] }) }, serverCapUsd: 100 });
    expect(short.next!.missing).toEqual(["50 trades in the exam (12 so far)", "calibration in the exam: 12 trades said how sure they were: 30 at least are needed to judge it — say it under the plan's How sure"]);
  });

  it("the door's words: a level that allows no real entry, an order worth more than the level allows — the next level's needs, a close that always goes — and nothing where it fits or where nothing was signed", () => {
    const zero = licenseView({ books: { train: empty("train"), exam: empty("exam") }, signed: 0, serverCapUsd: 100 });
    expect(licenseHeld(zero, 5)).toBe("You hold your own real orders to your license, and it is at level 0 (Student): no real entry of your own until your record in the simulator shows level 1. Level 1 (Learner) needs 100 trades in practice (0 so far). A close always goes.");
    const one = licenseView({ books: { train: passing("train", 100), exam: bookOf("exam", { trades: trades(12), sessions: 2, tries: [tries(12, 0.23)] }) }, signed: 2, serverCapUsd: 100 });
    expect(licenseHeld(one, 55.09)).toBe("$55.09 is more than your license lets one real order of your own be worth: $25.00 at level 1 (Learner) — you signed up to level 2, and your record in the simulator shows level 1 now. Level 2 (Licensed) needs 50 trades in the exam (12 so far); calibration in the exam: 12 trades said how sure they were: 30 at least are needed to judge it — say it under the plan's How sure. A close always goes.");
    expect(licenseHeld(one, 25)).toBeUndefined();
    expect(licenseHeld(licenseView({ books: one.books, serverCapUsd: 100 }), 1_000)).toBeUndefined();
  });
});

describe("THE LICENSE IN YOUR OWN LIMITS (account/plans.ts)", () => {
  it("is a level, 0 to 3, a limit of its own; lowered or first named, a tightening — raised or taken away, a loosening; said in words", () => {
    expect(parseSelfLimits(JSON.stringify({ license: 1 }))).toEqual({ license: 1, liftHours: 24 });
    expect(parseSelfLimits(JSON.stringify({ license: 0, planFirst: true, liftHours: 48 }))).toEqual({ planFirst: true, license: 0, liftHours: 48 });
    expect(parseSelfLimits(JSON.stringify({ license: 4 }))).toBe("license is 0 to 3, not 4");
    expect(parseSelfLimits(JSON.stringify({ license: 1.5 }))).toBe("license is a whole number");
    const held = { license: 2, liftHours: 24 };
    expect([tighter(held, { license: 1, liftHours: 24 }), tighter(held, { license: 2, liftHours: 24 }), tighter(held, { license: 3, liftHours: 24 }), tighter(held, { planFirst: true, liftHours: 24 }), tighter({ planFirst: true, liftHours: 24 }, { planFirst: true, license: 3, liftHours: 24 })]).toEqual([true, true, false, false, true]);
    expect(selfWords({ maxEntries: 3, license: 1, liftHours: 24 })).toBe("3 entries a day at most · your own real entries held to your license, up to level 1 (Learner) — loosened only 24 h after it is signed");
  });
});

// ---- at the service ----

const owner = simKey("owner");
const agentKey = simKey("agent:claude-code");
const BTC: Market = { symbol: "BTC/USDT", name: "BTC/USDT", kind: "spot", base: "BTC", quote: "USDT", price: 60_000, bid: 59_990, ask: 60_010, minQty: 0.0001, qtyStep: 0.0001, priceStep: 0.1, open: true, types: ["market", "limit"] };
const placed: string[] = [];
const trader: LiveTrader = {
  can: true,
  what: "spot",
  async markets(q) {
    return q.toUpperCase().startsWith("BTC") ? [{ ...BTC }] : [];
  },
  async market(symbol) {
    return symbol === BTC.symbol ? { ...BTC } : no("E_VENUE_REJECTED", { venue: "standin", message: `no market ${symbol}` });
  },
  async place(o) {
    placed.push(`${o.side} ${o.qty}`);
    const s: OrderState = { ref: `x-${placed.length}`, status: o.type === "market" ? "filled" : "open", filledQty: o.type === "market" ? o.qty : 0, ...(o.type === "market" ? { avgPrice: o.side === "buy" ? 60_010 : 59_990, feeUsd: 0.01 } : {}), native: {} };
    return s;
  },
  async cancel(ref) {
    return { ref, status: "canceled", filledQty: 0, native: {} };
  },
  async status(ref) {
    return { ref, status: "filled", filledQty: 0, native: {} };
  },
};
register({ kind: "standin-license", label: "a venue that trades real money", needs: "key-file", example: "", venues: [], async open(req) {
  return { source: { name: req.label || "Stand-in", kind: "cex", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDT", amount: 500, usd: 500 }], trader, readOnlyBecause: "the stand-in moves no money" }, first: [{ asset: "USDT", amount: 500, usd: 500 }], summary: "connected" };
} });

/** a record in the home, as the simulator writes it: `sessions` sessions of a window, each with `each` trades seven in ten won — or all
 * lost — its start and its session row in the practice record, its trades in the journal, its tries kept under the row's hash */
let made = 0;
function record(home: string, o: { window: PracticeWindow; sessions: number; each: number; lost?: boolean | undefined; at: number }): void {
  for (let k = 0; k < o.sessions; k++) {
    const n = ++made;
    const day = new Date(Date.UTC(2025, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
    const id = practiceId(n, day, "BTC", new Date(o.at).toISOString());
    appendPractice(home, { kind: "start", id, n, window: o.window, day, coin: "BTC", hours: 2, cashUsd: 10_000, speed: 50 }, o.at);
    for (let i = 0; i < o.each; i++) {
      const t = trade({ won: !o.lost && i % 10 < 7 });
      const opened = Date.UTC(2001, 0, 1) + n * 7 * 86_400_000 + i * 60_000;
      const row: JournalTrade = { symbol: `P${n}-PERP`, kind: "perp", side: "long", openedAt: new Date(opened).toISOString(), closedAt: new Date(opened + 30_000).toISOString(), hours: 0.01, openRef: `o${n}-${i}`, closeRef: `c${n}-${i}`, qty: 10, entryPrice: 100, exitPrice: 100 + t.returnPct / 10, entryUsd: 1_000, grossUsd: t.grossUsd, feesUsd: 0.5, fundingUsd: 0, netUsd: t.netUsd, returnPct: t.returnPct, maePct: -0.4, mfePct: 0.5, hi: 100.5, lo: 99.6, fills: 2, end: "closed", venue: "practice", venueName: "Practice · paper", paper: true, by: { who: "owner" }, closedBy: { who: "owner" }, plan: t.plan, practice: { session: id, n } };
      appendTrade(home, row, o.at);
    }
    const ownPct = o.lost ? -0.4 : 0.23;
    const kept: KeptTries = { v: 1, id, trades: o.each, ownPct, means: tries(o.each, ownPct).means.map((x) => Number(x.toFixed(6))) };
    writeTries(home, kept);
    const score = { you: { trades: o.each, wins: 0, losses: 0, netUsd: 0, netPct: 0, feesUsd: 0, planned: o.each, pastStop: 0 }, chance: { trades: o.each, monkeys: 1_000, ownPct, medianPct: 0, lowPct: -0.2, highPct: 0.2, rank: 1, p: 0.001, verdict: "better" as const, words: "", kept: triesHash(kept) }, hold: { netUsd: 0, netPct: 0 }, reveal: { day, coin: "BTC", scale: 1, window: o.window } };
    appendPractice(home, { kind: "session", id, n, window: o.window, day, coin: "BTC", scale: 1, hours: 2, cashUsd: 10_000, from: new Date(o.at).toISOString(), to: new Date(o.at + 2 * H).toISOString(), startedAt: new Date(o.at).toISOString(), endedAt: new Date(o.at).toISOString(), end: "bell", endedAtPractice: new Date(o.at).toISOString(), score }, o.at);
  }
}

async function boot() {
  const home = mkdtempSync(join(tmpdir(), "license-"));
  homes.push(home);
  const clock = { at: START, real: 5_000_000 };
  let n = 0;
  const liveDeps: Partial<LiveDeps> = { clock: () => clock.real, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({ home, now: () => new Date(clock.at).toISOString(), venues: "frontline", real: true, liveDeps, liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
  const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + ++n } as OwnerAction));
  const ag = async (a: NoNonce<AgentAction>) => svc.exchange(await signAgent(agentKey, { ...a, nonce: START + ++n } as AgentAction));
  const connected = await own({ type: "connectVenue", venue: "ex", connector: "live:standin-license", label: "Stand-in", credentialRef: "" });
  if (isRefusal(connected)) throw new Error(connected.message);
  const prepared = async (draft: Record<string, unknown>) => svc.account!.prepare({ type: "liveOrder", venue: "ex", symbol: "BTC/USDT", orderType: "market", ...draft });
  const sign = async (draft: Record<string, unknown>) => {
    const p = await prepared(draft);
    if (isRefusal(p)) return p;
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveOrder" }>;
    return own(rest as NoNonce<OwnerAction>);
  };
  const self = (limits: Record<string, unknown> | "") => own({ type: "setPolicy", change: "self", value: limits === "" ? "" : JSON.stringify(limits) });
  return { svc, home, clock, own, ag, prepared, sign, self };
}
const said = (o: Outcome | Refusal | unknown): string => (isRefusal(o as Refusal) ? `${(o as Refusal).code}: ${(o as Refusal).message}` : "ok");

describe("THE LICENSE AT THE SERVICE: the record read, a level signed only once the record shows it, the owner's real entries held to it", () => {
  it("reads the simulator's two windows apart, signs a level no higher than the record shows, holds the owner's own real entries to it — never a close, never an agent's order — steps up only after the wait, and falls with the record at once", async () => {
    const x = await boot();
    record(x.home, { window: "train", sessions: 10, each: 10, at: START - 48 * H });
    const v = x.svc.license();
    expect([v.level, v.name, v.books.train.trades, v.books.train.sessions, v.books.exam.trades, v.held]).toEqual([1, "Learner", 100, 10, 0, undefined]);
    expect(v.books.train.chance).toMatchObject({ ok: true, rank: 1, judged: 10, broken: 0 });
    expect(v.next!.missing).toEqual(["50 trades in the exam (0 so far)"]);
    // not signed: the server's cap alone holds the owner's real orders
    expect(isRefusal(await x.prepared({ side: "buy", usd: "60" }))).toBe(false);
    // a level above what the record shows is not signed
    expect(said(await x.self({ license: 2 }))).toBe("E_ACCOUNT_LIMIT: Your record in the simulator shows level 1 (Learner) now, and a license is signed no higher than the record shows. Level 2 (Licensed) needs 50 trades in the exam (0 so far).");
    expect(said(await x.self({ license: 1, maxEntries: 5 }))).toBe("ok");
    expect(x.svc.license()).toMatchObject({ signed: 1, held: 1, capUsd: 25 });
    expect(x.svc.license().self.now).toMatchObject({ license: 1, maxEntries: 5, words: "5 entries a day at most · your own real entries held to your license, up to level 1 (Learner) — loosened only 24 h after it is signed" });
    // an entry of the owner's own worth more than $25: refused before it is signed, with what level 2 needs; under it, it goes
    expect(said(await x.prepared({ side: "buy", usd: "60" }))).toBe("E_ACCOUNT_LIMIT: $55.09 is more than your license lets one real order of your own be worth: $25.00 at level 1 (Learner). Level 2 (Licensed) needs 50 trades in the exam (0 so far). A close always goes.");
    expect(said(await x.sign({ side: "buy", usd: "20" }))).toBe("ok");
    // a sell of what is held — a close — is never held; nor is an agent's order inside its own limit
    expect(isRefusal(await x.prepared({ side: "sell", orderType: "limit", qty: "0.001", limitPrice: "60000" }))).toBe(false);
    await x.own({ type: "approveAgent", agentAddress: agentKey.address, agentName: "Claude Code", validUntil: START + 30 * 86_400_000 });
    await x.own({ type: "approveSpend", agent: agentKey.address, scope: "trade", allow: "ex", perPayment: "60", budget: "100", windowHours: 0, validUntil: START + 7 * 86_400_000 });
    const asked = await x.ag({ type: "agentLiveOrder", venue: "ex", symbol: "BTC/USDT", side: "buy", orderType: "market", qty: "", usd: "50", limitPrice: "" });
    expect(isRefusal(asked) ? asked.code : "a card or an order").toBe("a card or an order");
    // the exam passed: level 2 is signed — a loosening, so it waits the 24 hours, and the license holds at level 1 till then
    record(x.home, { window: "exam", sessions: 5, each: 10, at: START - H });
    expect(x.svc.license().level).toBe(2);
    expect(said(await x.self({ license: 2, maxEntries: 5 }))).toBe("ok");
    expect(x.svc.license()).toMatchObject({ signed: 1, held: 1, capUsd: 25, self: { pending: { to: { license: 2 } } } });
    x.clock.at += 24 * H;
    expect(x.svc.license()).toMatchObject({ signed: 2, held: 2, capUsd: 100 });
    expect(said(await x.prepared({ side: "buy", usd: "60" }))).toBe("ok");
    // the record falls — practice that lost, every trade of it: held at level 0 at once, whatever was signed
    record(x.home, { window: "train", sessions: 10, each: 10, lost: true, at: START + 25 * H });
    expect(x.svc.license()).toMatchObject({ level: 0, signed: 2, held: 0, capUsd: 0 });
    expect(said(await x.prepared({ side: "buy", usd: "20" }))).toMatch(/^E_ACCOUNT_LIMIT: You hold your own real orders to your license, and it is at level 0 \(Student\) — you signed up to level 2, and your record in the simulator shows level 0 now: no real entry of your own until your record in the simulator shows level 1\. Level 1 \(Learner\) needs the edge in practice: /);
    // let go of: a loosening, it waits; then the server's cap alone
    expect(said(await x.self({ maxEntries: 5 }))).toBe("ok");
    expect(said(await x.prepared({ side: "buy", usd: "20" }))).toMatch(/^E_ACCOUNT_LIMIT: You hold your own real orders/);
    x.clock.at += 24 * H;
    expect(said(await x.prepared({ side: "buy", usd: "20" }))).toBe("ok");
    expect(x.svc.license().held).toBeUndefined();
  }, 30_000);

  it("a session's kept tries that are not what its row says leave chance not judged; a session from before the bell kept them is left out and said", async () => {
    const x = await boot();
    record(x.home, { window: "train", sessions: 10, each: 10, at: START - 48 * H });
    expect(x.svc.license().level).toBe(1);
    // one session's tries changed after its bell: the license reads the record again, and chance is not judged
    const first = practiceId(made - 9, new Date(Date.UTC(2025, 0, 1) + (made - 9) * 86_400_000).toISOString().slice(0, 10), "BTC", new Date(START - 48 * H).toISOString());
    writeFileSync(practiceTriesPath(x.home, first), `${JSON.stringify({ v: 1, id: first, trades: 10, ownPct: 0.23, means: [0] })}\n`);
    record(x.home, { window: "exam", sessions: 1, each: 1, at: START });
    const v = x.svc.license();
    expect([v.level, v.books.train.chance.ok, v.books.train.chance.broken]).toEqual([0, false, 1]);
    expect(v.next!.missing).toContain("chance in practice: the random entries of 1 session are missing, or are not what its bell kept: chance is not judged");
  });
});
