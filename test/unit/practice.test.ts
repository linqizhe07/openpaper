import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { readJournal } from "../../src/portfolio/account/journal.ts";
import { appendPractice, chanceOf, clockAt, clockMoved, holdOf, parsePracticeAsk, pickPractice, PRACTICE_EPOCH, practiceDayStart, practiceDays, practiceLedgerPath, practiceMarket, practiceUsed, readPractice, readSession, scoreWords, youOf } from "../../src/portfolio/account/practice.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import type { HistorySources } from "../../src/portfolio/backtest/data.ts";
import type { LiveDeps } from "../../src/portfolio/live/index.ts";
import type { PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { Candle } from "../../src/portfolio/live/trade.ts";
import type { ClosedTrip } from "../../src/portfolio/live/trips.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { PortfolioService, type PracticeView } from "../../src/portfolio/service.ts";

/** THE SIMULATOR (account/practice.ts; service.ts practice…; the practice account, live/index.ts live:practice): a past day drawn at random,
 * its minutes rebased and moved onto the practice calendar, traded with the same door — every entry with its plan, no agent there, none of
 * the owner's own limits counting it — at ten to fifty times its speed, and scored at its bell beside chance, holding and the desk. History
 * from a stand-in: no network. */
type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const M = 60_000;
const H = 3_600_000;
const D = 86_400_000;
const START = Date.parse("2026-10-29T12:00:00Z");
const owner = simKey("owner");
const cc = simKey("agent:claude-code");

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

/** a coin's minutes: a slow wave and a fast one around 30,000, a minute without a trade every 97th (Coinbase writes no bar for it) */
const px = (t: number): number => 30_000 * (1 + 0.01 * Math.sin(t / (37 * M)) + 0.004 * Math.sin(t / (7 * M)));
function minutes(from: number, to: number): Candle[] {
  const out: Candle[] = [];
  for (let t = Math.ceil(from / M) * M; t < to; t += M) {
    if ((t / M) % 97 === 0) continue;
    const o = px(t);
    const c = px(t + M);
    out.push({ t, o, h: Math.max(o, c) * 1.0004, l: Math.min(o, c) * 0.9996, c, v: 5 });
  }
  return out;
}
function coinbase(): PublicSource {
  return {
    id: "coinbase",
    name: "Stand-in Coinbase",
    kind: "exchange",
    connectTo: "coinbase",
    connector: "live:exchange:coinbase",
    listings: async () => [{ symbol: "BTC/USD", name: "BTC (stand-in)", kind: "spot", base: "BTC", quote: "USD", open: true, types: [] }],
    candles: async (_s, interval, w) => {
      if (interval !== "1m") return { bars: [], more: false };
      return { bars: minutes(w.since!, Math.min(w.until!, START)), more: false, source: "Stand-in Coinbase · BTC-USD" };
    },
  };
}
const nothing = (id: string): PublicSource => ({ id, name: id, kind: "exchange", connectTo: id, connector: `live:${id}`, listings: async () => [] });
/** draws in a fixed order: the same days and coins every run */
function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

async function boot(o: { home?: string; nonceFrom?: number; at?: number; desk?: boolean } = {}) {
  const home = o.home ?? mkdtempSync(join(tmpdir(), "practice-"));
  if (!o.home) homes.push(home);
  let n = o.nonceFrom ?? 0;
  const clock = { real: START + (o.at ?? 0) };
  const sources: HistorySources = { perp: nothing("hl"), spot: coinbase(), stock: nothing("us") };
  const liveDeps: Partial<LiveDeps> = { clock: () => clock.real, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({
    home,
    now: () => new Date(clock.real).toISOString(),
    venues: "frontline",
    real: true,
    liveDeps,
    publicMarkets: [],
    liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" },
    account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] },
    backtest: { sources },
    // the desk's run stood in for where a test does not watch it (a whole account stepping takes a second or two)
    practice: { random: seeded(7), ...(o.desk === false ? { desk: async () => no("E_ACCOUNT_BAD_ACTION", { message: "the desk was not run in this test" }) } : {}) },
  });
  await svc.restoring;
  const engine = svc.account!;
  const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: clock.real + ++n } as OwnerAction));
  const ag = async (a: NoNonce<AgentAction>) => svc.exchange(await signAgent(cc, { ...a, nonce: clock.real + ++n } as AgentAction));
  const order = async (draft: Record<string, unknown>) => {
    const p = await engine.prepare({ type: "liveOrder", venue: "practice", ...draft });
    if (isRefusal(p)) return p;
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveOrder" }>;
    return own(rest as NoNonce<OwnerAction>);
  };
  const view = async (since?: number): Promise<PracticeView> => {
    const v = await svc.practice(since === undefined ? {} : { since });
    if (isRefusal(v)) throw new Error(v.message);
    return v;
  };
  return { svc, engine, home, own, ag, order, view, clock };
}
const said = (o: Outcome | Refusal): string => (isRefusal(o) ? `${o.code}: ${o.message}` : o.kind === "account" ? o.summary : o.kind);
const connect = { type: "connectVenue", venue: "practice", connector: "live:practice", label: "Practice", credentialRef: "10000" } as const;
const start = (ask: Record<string, unknown>): NoNonce<OwnerAction> => ({ type: "setPractice", change: "start", value: JSON.stringify(ask) });
const planFor = (side: string, plan: Record<string, unknown>): NoNonce<OwnerAction> => ({ type: "setPlan", venue: "practice", symbol: "P1-PERP", side, value: JSON.stringify(plan) });

describe("a session asked for, a day drawn, its market made blind (account/practice.ts)", () => {
  it("reads an ask strictly: its own fields, coins from the list once each, the speeds, whole hours, paper money in bounds — defaults where unsaid", () => {
    expect(parsePracticeAsk("")).toEqual({ coins: ["BTC", "ETH", "SOL"], cashUsd: 10_000, speed: 20, hours: 24, exam: false });
    expect(parsePracticeAsk(JSON.stringify({ coins: ["eth"], cash: 2500.257, speed: 50, hours: 6, exam: true }))).toEqual({ coins: ["ETH"], cashUsd: 2500.26, speed: 50, hours: 6, exam: true });
    expect(parsePracticeAsk(JSON.stringify({ coins: ["BTC", "BTC"] }))).toBe("the coins are some of BTC, ETH, SOL, XRP, DOGE, LTC, LINK, AVAX, each once");
    expect(parsePracticeAsk(JSON.stringify({ coins: ["PEPE"] }))).toMatch(/^the coins are some of/);
    expect(parsePracticeAsk(JSON.stringify({ speed: 15 }))).toBe("the speed is 10, 20, 30, 50 times");
    expect(parsePracticeAsk(JSON.stringify({ hours: 2.5 }))).toBe("the hours are a whole number, 1 to 24, from the day's 00:00 UTC");
    expect(parsePracticeAsk(JSON.stringify({ cash: 50 }))).toBe("the paper money is $100 to $10,000,000");
    expect(parsePracticeAsk(JSON.stringify({ day: "2025-03-12" }))).toBe('a session is asked with coins, cash, speed, hours, exam only, not "day"');
    expect(parsePracticeAsk("[1]")).toMatch(/^a session is asked as JSON/);
  });

  it("draws practice days from the two years before the holdout and exams from its whole days up to yesterday, never a day spent; the practice calendar keeps the weekday", () => {
    const holdout = Date.parse("2026-07-31T00:00:00Z");
    const now = Date.parse("2026-08-04T15:00:00Z");
    const train = practiceDays({ holdoutStart: holdout, now, exam: false, used: new Set(["2026-07-30"]) });
    expect(train[0]).toBe("2024-07-31");
    expect(train[train.length - 1]).toBe("2026-07-29");
    expect(train).toHaveLength(729);
    expect(practiceDays({ holdoutStart: holdout, now, exam: true, used: new Set(["2026-08-01"]) })).toEqual(["2026-07-31", "2026-08-02", "2026-08-03"]);
    expect(pickPractice([], ["BTC"], () => 0)).toBeUndefined();
    expect(pickPractice(["a", "b", "c"], ["BTC", "ETH"], () => 0.999999)).toEqual({ day: "c", coin: "ETH" });
    // Wednesday 12 March 2025, the third session: the Wednesday of the practice calendar's third week
    const at = practiceDayStart(3, "2025-03-12");
    expect(new Date(at).toISOString()).toBe("2001-01-17T00:00:00.000Z");
    expect(new Date(at).getUTCDay()).toBe(new Date("2025-03-12T00:00:00Z").getUTCDay());
    expect(at - PRACTICE_EPOCH).toBe(16 * D);
  });

  it("makes the session's market: rebased to open at 100, the volumes the other way, a minute without a trade flat at the close before it, on the practice calendar, a bell bar at its end — or says the day is too thin", () => {
    const day = Date.parse("2025-03-12T00:00:00Z");
    const real = minutes(day - 2 * D, day + 2 * H);
    const made = practiceMarket({ coin: "BTC", bars: real, day: "2025-03-12", n: 3, hours: 2 });
    if (typeof made === "string") throw new Error(made);
    const m = made.market;
    expect(m).toMatchObject({ symbol: "P3-PERP", kind: "perp", base: "P3", quote: "USD", interval: "1m", maxLeverage: 10, qtyStep: 0.001 });
    expect(made.from).toBe(practiceDayStart(3, "2025-03-12"));
    expect(made.to - made.from).toBe(2 * H);
    const first = m.bars.find((b) => b.t === made.from)!;
    expect(first.o).toBe(100);
    expect(made.scale).toBeCloseTo(100 / px(day), 12);
    // every minute from the first bar to the end, and the bell's minute after it, flat at the last close
    expect(m.bars).toHaveLength((2 * D + 2 * H) / M + 1);
    const bell = m.bars[m.bars.length - 1]!;
    expect(bell.t).toBe(made.to);
    expect([bell.o, bell.h, bell.l, bell.c]).toEqual(Array(4).fill(m.bars[m.bars.length - 2]!.c));
    // the dollars a minute traded are the day's own
    const k = m.bars.findIndex((b) => b.t === made.from + 10 * M);
    const r = real.find((b) => b.t === day + 10 * M)!;
    expect(Math.abs((m.bars[k]!.v! * m.bars[k]!.c) / (r.v! * r.c) - 1)).toBeLessThan(1e-8);
    // the missing minute: flat, no volume said
    const gap = Math.ceil((day - 2 * D) / (97 * M)) * 97 * M;
    const flat = m.bars.find((b) => b.t === gap + made.shiftMs)!;
    expect(flat.o).toBe(flat.c);
    expect(flat.v).toBeUndefined();
    expect(practiceMarket({ coin: "BTC", bars: real.filter((b) => b.t < day + 30 * M), day: "2025-03-12", n: 3, hours: 2 })).toBe("BTC on 2025-03-12: 30 of the session's 120 minutes have a bar");
  });

  it("runs the clock at its speed while it runs, still while it is stopped, never past the end — a change taken from where it stands", () => {
    const c = { at: 1_000 * M, realAt: 0, running: true, speed: 20 };
    expect(clockAt(c, 30_000, 2_000 * M)).toBe(1_000 * M + 600_000);
    expect(clockAt(c, 10 * H, 2_000 * M)).toBe(2_000 * M);
    const stopped = clockMoved(c, 30_000, 2_000 * M, { running: false });
    expect(stopped).toEqual({ at: 1_000 * M + 600_000, realAt: 30_000, running: false, speed: 20 });
    expect(clockAt(stopped, 90_000, 2_000 * M)).toBe(1_000 * M + 600_000);
    const faster = clockMoved(stopped, 90_000, 2_000 * M, { running: true, speed: 50 });
    expect(clockAt(faster, 91_000, 2_000 * M)).toBe(1_000 * M + 650_000);
  });

  it("scores your side from the journal's trades — the net over the money, the wins, R where the plan said its risk, a loss past it — and holding the market, and chance with your sides and holds", () => {
    const you = youOf([
      { netUsd: 25, feesUsd: 2, grossUsd: 27, entryPrice: 100, qty: 10, plan: { why: "w", stop: 99, at: "x" } },
      { netUsd: -18, feesUsd: 2, grossUsd: -16, entryPrice: 100, qty: 10, plan: { why: "w", riskUsd: 12, at: "x" } },
      { netUsd: -4, feesUsd: 1, grossUsd: -3, entryPrice: 100, qty: 5 },
    ], 10_000);
    expect(you).toEqual({ trades: 3, wins: 1, losses: 2, netUsd: 3, netPct: 0.03, feesUsd: 5, planned: 2, rMean: 0.5, pastStop: 1 });
    const day = Date.parse("2025-03-12T00:00:00Z");
    const made = practiceMarket({ coin: "BTC", bars: minutes(day - 2 * D, day + 2 * H), day: "2025-03-12", n: 1, hours: 2 });
    if (typeof made === "string") throw new Error(made);
    const hold = holdOf(made.market, made.from, made.to, 10_000);
    const last = made.market.bars.filter((b) => b.t < made.to).pop()!.c;
    expect(hold.netPct).toBeCloseTo(((last * 0.9999 * 0.999) / (100 * 1.0001 * 1.001) - 1) * 100, 4);
    const trip = { symbol: "P1-PERP", kind: "perp", side: "long", openedAt: new Date(made.from + 5 * M).toISOString(), closedAt: new Date(made.from + 35 * M).toISOString() } as ClosedTrip;
    const chance = chanceOf(made.market, made.from, made.to, [trip], "s1-test");
    expect(chance).toMatchObject({ trades: 1, monkeys: 1_000, verdict: "few" });
    expect(chanceOf(made.market, made.from, made.to, [], "s1-test")).toBeUndefined();
    expect(scoreWords({ you, chance, hold, reveal: { day: "2025-03-12", coin: "BTC", scale: made.scale, window: "train" } })[0]).toBe("You: +$3.00 (+0.03%) in 3 trades, 1 won · +0.50 R a trade · 1 lost more than the plan's 1R");
  });

  it("keeps the record hash-chained: a session's start spends its day, its numbers count on; a row changed is seen", () => {
    const home = mkdtempSync(join(tmpdir(), "practice-record-"));
    homes.push(home);
    appendPractice(home, { kind: "start", id: "s1-a", n: 1, window: "train", day: "2025-03-12", coin: "BTC", hours: 24, cashUsd: 10_000, speed: 20 }, START);
    appendPractice(home, { kind: "start", id: "s2-b", n: 2, window: "exam", day: "2026-08-02", coin: "ETH", hours: 24, cashUsd: 10_000, speed: 20 }, START + 1);
    const read = readPractice(home);
    expect(read.intact).toBe(true);
    expect(practiceUsed(read.rows)).toEqual({ days: new Set(["2025-03-12", "2026-08-02"]), next: 3 });
    const f = practiceLedgerPath(home);
    writeFileSync(f, readFileSync(f, "utf8").replace('"coin":"ETH"', '"coin":"SOL"'));
    expect(readPractice(home)).toMatchObject({ intact: false, brokenAt: 2, why: "line 2 was changed after it was written" });
  });
});

describe("THE SIMULATOR AT THE SERVICE: the practice account, the door, the journal, the bell", () => {
  it("a session: the practice account connected; a day drawn and spent, blind — no date, no coin, no price level said — its clock waiting; an entry without its plan refused at the door, one with it placed; the clock at fifty times; the bell closing what is open; the score with the day told, chance, holding and the desk; the record and the journal keeping it apart from the paper trading", async () => {
    const { svc, own, order, view, home, clock } = await boot();
    expect(said(await own(connect))).toMatch(/^Practice · paper connected · PAPER, no real money · \$10,000\.00 there now · Practice · paper: the simulator's paper account/);
    // before a session: nothing on, the days there are
    const before = await view();
    expect(before).toMatchObject({ connected: true, venue: "practice", sessions: [], holdout: "2026-07-31", left: { train: 730, exam: 90 } });
    expect(before.session).toBeUndefined();
    // the words before it is signed
    const words = await svc.account!.prepare({ type: "setPractice", change: "start", value: JSON.stringify({ coins: ["BTC"], cash: 10_000, speed: 50, hours: 2 }) });
    if (isRefusal(words)) throw new Error(words.message);
    expect(words.quote?.words).toBe("Start a practice session: a day of the two years before the holdout of BTC, drawn at random and played back blind at 50× for 2 h from its 00:00 UTC, with $10,000.00 of paper money — the practice account's book starts again with it. Every entry there carries its plan; the day and the coin are told at the bell.");
    const started = await own(start({ coins: ["BTC"], cash: 10_000, speed: 50, hours: 2 }));
    if (isRefusal(started) || started.kind !== "result") throw new Error(said(started));
    const v = started.result as PracticeView;
    const s = readSession(home)!;
    expect(s).toMatchObject({ n: 1, window: "train", coin: "BTC", symbol: "P1-PERP", hours: 2, cashUsd: 10_000, clock: { running: false, speed: 50 } });
    expect(s.day >= "2024-08-01" && s.day <= "2026-07-30").toBe(true);
    expect(v.session).toMatchObject({ id: s.id, n: 1, window: "train", symbol: "P1-PERP", running: false, speed: 50, minute: 0, minutes: 120, now: new Date(s.from).toISOString() });
    expect(new Date(s.from).getUTCFullYear()).toBe(2001);
    // two days of minutes before it to read, all closed by its clock; the quote is its first minute's open, rebased
    expect(v.bars!.length).toBe(2 * 24 * 60);
    expect(v.bars!.every((b) => b.t + M <= s.from)).toBe(true);
    expect(v.quote).toEqual({ price: 100, bid: 99.99, ask: 100.01 });
    // blind: nothing the page reads of the session says the day, the coin or the price it traded at (the coins it may be are the asks')
    const text = JSON.stringify({ ...v, asks: undefined });
    expect(text).not.toContain(s.day);
    expect(text).not.toContain("BTC");
    expect(text).not.toMatch(/\b3\d{4}\.\d/);
    // a second session while this one is on: refused
    expect(said(await own(start({ coins: ["ETH"] })))).toBe("E_ACCOUNT_BAD_ACTION: practice session 1 is on: end it before starting another");

    // an entry without its plan: the door holds it; with its plan, placed and carrying it
    expect(said(await order({ symbol: "P1-PERP", side: "buy", orderType: "market", qty: "10" }))).toBe("E_ACCOUNT_LIMIT: In practice every entry carries its plan: say why, where it is wrong (the stop) and what it puts at risk in the ticket's Plan, then send it again");
    expect(said(await own(planFor("buy", { why: "the low held twice", setup: "pullback", confidence: 0.6, stop: 99, riskUsd: 10 })))).toMatch(/^a plan for your next/);
    const placed = await order({ symbol: "P1-PERP", side: "buy", orderType: "market", qty: "10" });
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(said(placed));
    expect(placed.order).toMatchObject({ entry: true, plan: { why: "the low held twice", setup: "pullback", stop: 99, riskUsd: 10 } });

    // the clock runs at fifty times: a real minute, fifty of the session's
    expect(svc.practiceClock({ run: true })).toMatchObject({ ok: true, clock: { running: true, speed: 50 } });
    clock.real += M;
    const mid = await view(v.bars![v.bars!.length - 1]!.t);
    expect(mid.session).toMatchObject({ running: true, minute: 50 });
    expect(mid.bars!.map((b) => (b.t - s.from) / M)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    // two more real minutes: past the end — the bell
    clock.real += 2 * M;
    await vi.waitFor(async () => expect((await view()).session?.score?.desk).toBeDefined(), { timeout: 20_000, interval: 50 });
    const end = await view();
    expect(end.session).toMatchObject({ running: false, minute: 120, end: "bell" });
    const score = end.session!.score!;
    expect(score.reveal).toEqual({ day: s.day, coin: "BTC", scale: s.scale, window: "train" });
    expect(score.you).toMatchObject({ trades: 1, planned: 1, pastStop: 0 });
    expect(score.you.rMean).toBeCloseTo(score.you.netUsd / 10, 3);
    expect(score.chance).toMatchObject({ trades: 1, verdict: "few" });
    expect(score.hold.netPct).toBeCloseTo(holdOf(JSON.parse(readFileSync(join(home, "practice", "bars.json"), "utf8")), s.from, s.to, 10_000).netPct, 6);
    expect(score.desk && "netUsd" in score.desk ? typeof score.desk.netUsd : (score.desk as { error: string }).error).toBe("number");
    expect(score.words[0]).toMatch(/^You: [+−]\$\d/);
    // the trade, in the journal: the owner's, its plan, closed by the bell, the session named; its times the practice calendar's
    const rows = readJournal(home).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ venue: "practice", symbol: "P1-PERP", side: "long", by: { who: "owner" }, closedBy: { who: "venue" }, plan: { setup: "pullback" }, practice: { session: s.id, n: 1 } });
    expect(rows[0]!.closedAt).toBe(new Date(s.to).toISOString());
    // the record: the start, and the session with its score
    const record = readPractice(home);
    expect(record.intact).toBe(true);
    expect(record.rows.map((r) => r.kind)).toEqual(["start", "session"]);
    expect(end.sessions).toHaveLength(1);
    expect(end.sessions[0]).toMatchObject({ n: 1, day: s.day, coin: "BTC", end: "bell" });
    expect(end.left).toEqual({ train: 729, exam: 90 });
    // the Debrief leaves it out of the paper trading, and reads it alone when asked
    const paper = svc.debrief({});
    const practice = svc.debrief({ practice: true });
    if (isRefusal(paper) || isRefusal(practice)) throw new Error("debrief");
    expect(paper.debrief.trades).toBe(0);
    expect(practice.debrief.trades).toBe(1);
    expect(practice.venues).toEqual([{ id: "practice", name: "Practice · paper", trades: 1 }]);
    // the clock of an ended session is not started again
    expect(said(svc.practiceClock({ run: true }) as Refusal)).toBe("E_ACCOUNT_BAD_ACTION: no practice session is on");
  }, 60_000);

  it("ended by the owner before its bell: at the price then, the rest not played; an exam drawn from the holdout, its day spent for good; your own limits never count the practice account's entries; no agent trades there", async () => {
    const { svc, own, ag, order, view, home, clock } = await boot({ desk: false });
    expect(said(await own(connect))).toMatch(/^Practice · paper connected/);
    // your own limits: one entry a day, a plan first — the practice account's entries are not theirs to count
    expect(said(await own({ type: "setPolicy", change: "self", value: JSON.stringify({ maxEntries: 1, planFirst: true }) }))).toMatch(/^your own limits hold now/);
    const exam = await own(start({ coins: ["ETH"], cash: 5_000, speed: 10, hours: 3, exam: true }));
    if (isRefusal(exam) || exam.kind !== "result") throw new Error(said(exam));
    const s = readSession(home)!;
    expect(s).toMatchObject({ window: "exam", coin: "ETH", n: 1, cashUsd: 5_000 });
    expect(s.day >= "2026-07-31" && s.day <= "2026-10-28").toBe(true);
    // two entries — the second adds to the first — past the one a day the owner's own limits allow, and neither counted there
    for (const why of ["the first leg", "adding on the retest"]) {
      expect(said(await own(planFor("buy", { why, stop: 98 })))).toMatch(/^a plan for your next/);
      const o = await order({ symbol: "P1-PERP", side: "buy", orderType: "market", qty: "5" });
      if (isRefusal(o) || o.kind !== "order") throw new Error(said(o));
      expect(o.order.entry).toBe(true);
    }
    expect(svc.selfView().entriesToday).toBe(0);
    // an agent let in, with a limit at the practice account: refused there all the same
    await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * D });
    await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "practice", perPayment: "1000", budget: "5000", windowHours: 0, validUntil: START + 30 * D, renewHours: 24 });
    expect(said(await ag({ type: "agentLiveOrder", venue: "practice", symbol: "P1-PERP", side: "buy", orderType: "market", qty: "1", usd: "", limitPrice: "" }))).toBe("E_ACCOUNT_BAD_ACTION: Practice · paper is the owner's practice account: no agent trades there");
    // twenty minutes at ten times, then ended: the position closed at the price of its twenty-second minute
    svc.practiceClock({ run: true });
    clock.real += 2 * M + 10_000;
    const words = await svc.account!.prepare({ type: "setPractice", change: "end", value: s.id });
    expect(!isRefusal(words) && words.quote?.words).toBe("End practice session 1 now: its open orders canceled, its positions closed at the price now, and its score made — the rest of its day is not played.");
    const ended = await own({ type: "setPractice", change: "end", value: s.id });
    expect(said(ended)).toBe("result");
    await vi.waitFor(async () => expect((await view()).session?.score?.desk).toBeDefined(), { timeout: 10_000, interval: 50 });
    const v = await view();
    expect(v.session).toMatchObject({ end: "owner", minute: 21 });
    expect(v.session!.score!.desk).toEqual({ error: "the desk was not run in this test" });
    const rows = readJournal(home).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ practice: { n: 1 }, closedAt: new Date(s.from + 21 * M).toISOString() });
    expect(v.left?.exam).toBe(89);
    expect(v.sessions[0]).toMatchObject({ window: "exam", end: "owner" });
  }, 30_000);

  it("a restart brings the session back where its clock stood, stopped; the practice account opens on it", async () => {
    const first = await boot({ desk: false });
    expect(said(await first.own(connect))).toMatch(/^Practice · paper connected/);
    const ok = await first.own(start({ coins: ["SOL"], speed: 30, hours: 4 }));
    if (isRefusal(ok)) throw new Error(ok.message);
    first.svc.practiceClock({ run: true });
    first.clock.real += M;
    await first.view();
    const s = readSession(first.home)!;
    expect(clockAt(s.clock, first.clock.real, s.to)).toBe(s.from + 30 * M);
    // the service stops; an hour later it starts again on the same home
    const again = await boot({ home: first.home, nonceFrom: 500, at: H, desk: false });
    const v = await again.view();
    expect(v.session).toMatchObject({ id: s.id, running: false, minute: 30 });
    again.svc.practiceClock({ run: true });
    again.clock.real += 20_000;
    expect((await again.view()).session).toMatchObject({ running: true, minute: 40 });
  }, 30_000);
});
