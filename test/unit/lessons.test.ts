import { describe, expect, it } from "vitest";
import type { DebriefTrade } from "../../src/portfolio/account/debrief.ts";
import { candidatesOf, effectOf, fundingPctDay, holdPlan, judge, LESSONS_KEPT, makeRoom, noChange, parseRoles, parseRule, ruleKey, ruleWords, sameLesson, type Lesson, type LeadFacts, type LessonRule } from "../../src/portfolio/account/lessons.ts";

/** LESSONS (account/lessons.ts): the rules a lesson may be — read strictly, said in words, judged on a lead as Risk sees it and on the
 * trades the journal kept — what a rule would have done to the desk's trades, and the candidates the Debrief puts forward: a slice of the
 * desk's own trades that lost beyond chance against the rest, the worst of its cut */
const T0 = Date.parse("2026-10-01T00:00:00Z");
const at = (h: number): string => new Date(T0 + h * 3_600_000).toISOString();

/** a desk's closed trade on $1,000 of entry: its net in percent, its market, side and hours, the lead that placed it and Risk's numbers */
function trade(i: number, net: number, o: { symbol?: string; side?: "long" | "short"; hour?: number; held?: number; conf?: number; change?: number | null; desk?: boolean; kind?: DebriefTrade["kind"] } = {}): DebriefTrade {
  const opened = o.hour ?? i * 5;
  const usd = (net / 100) * 1000;
  return {
    symbol: o.symbol ?? "BTC/USDT",
    kind: o.kind ?? "spot",
    side: o.side ?? "long",
    openedAt: at(opened),
    closedAt: at(opened + (o.held ?? 2)),
    hours: o.held ?? 2,
    openRef: `p${i}`,
    closeRef: `q${i}`,
    qty: 10,
    entryPrice: 100,
    exitPrice: 100 + net,
    entryUsd: 1000,
    grossUsd: usd + 2,
    feesUsd: 2,
    fundingUsd: 0,
    netUsd: usd,
    returnPct: net,
    maePct: Math.min(0, net),
    mfePct: Math.max(0, net),
    hi: 0,
    lo: 0,
    fills: 2,
    end: net > 0 ? "take-profit" : "stop-loss",
    ...(o.desk === false ? {} : { lead: { id: `L-${String(i).padStart(4, "0")}`, thesis: "momentum", ...(o.conf !== undefined ? { confidence: o.conf } : {}), checks: { spreadPct: 0.1, maxSizeUsd: 1000, lossRoomUsd: 250, minNotionalUsd: null, ...(o.change !== undefined ? { changePct24h: o.change } : {}) } } }),
  };
}
/** a little noise around a mean, the same each run */
const wobble = (i: number, mean: number): number => mean + ((i * 7919) % 11) / 10 - 0.5;

describe("a rule, read strictly", () => {
  it("takes each kind with its own numbers, inside their bounds — a hyphen taken for the hours' dash, a market named once — and says the rule as a person reads it", () => {
    expect(parseRule({ kind: "chase", maxPct: 8 })).toEqual({ kind: "chase", maxPct: 8 });
    expect(parseRule({ kind: "funding", maxPctDay: "0.1" })).toEqual({ kind: "funding", maxPctDay: 0.1 });
    expect(parseRule({ kind: "hours", skip: ["20-24", "00–04", "00-04"] })).toEqual({ kind: "hours", skip: ["00–04", "20–24"] });
    expect(parseRule({ kind: "markets", skip: ["DOGE/USDT", " DOGE/USDT "] })).toEqual({ kind: "markets", skip: ["DOGE/USDT"] });
    expect(parseRule({ kind: "plan", maxHours: 24, minSlPct: null })).toEqual({ kind: "plan", maxHours: 24 });
    const words = (r: unknown) => ruleWords(parseRule(r) as LessonRule);
    expect(words({ kind: "chase", maxPct: 8 })).toBe("no lead on a market that moved more than 8% over the day its way");
    expect(words({ kind: "volume", minUsd: 10_000_000 })).toBe("no lead on a market that traded less than $10M over the day");
    expect(words({ kind: "hours", skip: ["00–04"] })).toBe("no lead entered 00–04 New York");
    expect(words({ kind: "side", only: "sell" })).toBe("shorts only");
    expect(words({ kind: "confidence", min: 0.6 })).toBe("no lead Search is less than 0.6 sure of");
    expect(words({ kind: "plan", minTpPct: 2, maxHours: 24 })).toBe("the plan held to a take-profit of at least 2%, 24 h at most");
  });

  it("refuses what is not one, in words: no object, a kind it does not know, a field beside its own, a number out of its bounds or not a number, every hour skipped, too many markets, a plan with no bound", () => {
    expect(parseRule([])).toBe("a rule is one object: its kind and its numbers");
    expect(parseRule({ kind: "vibes" })).toMatch(/^a rule's kind is one of chase, funding/);
    expect(parseRule({ kind: "chase", maxPct: 8, sk_live_abc: 1 })).toBe('a chase rule takes maxPct: "sk_live_abc" is not one of them');
    expect(parseRule({ kind: "chase", maxPct: 8, "a b": 1 })).toBe("a chase rule takes maxPct: a field it was sent is not one of them");
    expect(parseRule({ kind: "chase", maxPct: 0.1 })).toBe("a chase rule's maxPct is 0.5 to 100, not 0.1");
    expect(parseRule({ kind: "confidence", min: "high" })).toBe("a confidence rule's min is a number");
    expect(parseRule({ kind: "hours", skip: ["00–04", "04–08", "08–12", "12–16", "16–20", "20–24"] })).toMatch(/stops the desk: pause it instead/);
    expect(parseRule({ kind: "hours", skip: ["09–13"] })).toMatch(/^an hours rule's hours are 00–04/);
    expect(parseRule({ kind: "markets", skip: Array.from({ length: 21 }, (_, i) => `C${i}/USDT`) })).toBe("a markets rule names 20 markets at most");
    expect(parseRule({ kind: "plan" })).toBe("a plan rule names at least one of minTpPct, minSlPct, maxHours");
    expect(parseRule({ kind: "side", only: "both" })).toMatch(/^a side rule is/);
  });

  it("the seats a lesson goes to: a rule on which leads to take to Search and Risk, a plan to Risk and Exit, words to every seat that thinks; named, the thinking seats only", () => {
    expect(parseRoles(undefined, { kind: "chase", maxPct: 8 })).toEqual(["search", "risk"]);
    expect(parseRoles(undefined, { kind: "plan", maxHours: 24 })).toEqual(["risk", "exit"]);
    expect(parseRoles(undefined)).toEqual(["search", "risk", "exit", "head"]);
    expect(parseRoles(["exit", "search", "exit"])).toEqual(["search", "exit"]);
    expect(parseRoles(["sniper"])).toBe("a lesson goes to the seats that think: search, risk, exit, head");
    expect(parseRoles([])).toMatch(/^a lesson's seats are a list of/);
  });

  it("the same lesson is the same words or the same rule; 'none' is no change; room is made by letting the oldest unanswered proposal of the Head's go, never the owner's", () => {
    expect(ruleKey({ kind: "markets", skip: ["B", "A"] })).toBe(ruleKey({ kind: "markets", skip: ["A", "B"] }));
    const l = (id: string, o: Partial<Lesson> = {}): Lesson => ({ id, at: at(0), from: "evening", text: `lesson ${id}`, roles: ["risk"], state: "proposed", ...o });
    const kept = [l("LS-0001", { text: "Stop chasing pumps." }), l("LS-0002", { rule: { kind: "chase", maxPct: 8 } })];
    expect(sameLesson(kept, "stop chasing  pumps")?.id).toBe("LS-0001");
    expect(sameLesson(kept, "other words", { kind: "chase", maxPct: 8 })?.id).toBe("LS-0002");
    expect(sameLesson(kept, "other words", { kind: "chase", maxPct: 9 })).toBeUndefined();
    // proposed again after a rejection: the one waiting is found, not the one turned down
    const again = [l("LS-0001", { rule: { kind: "side", only: "buy" }, state: "rejected" }), l("LS-0002", { rule: { kind: "side", only: "buy" } })];
    expect(sameLesson(again, "longs only", { kind: "side", only: "buy" })?.id).toBe("LS-0002");
    expect(sameLesson(again.slice(0, 1), "longs only", { kind: "side", only: "buy" })?.id).toBe("LS-0001");
    for (const s of ["none", "Nothing yet.", "No change.", "—"]) expect(noChange(s)).toBe(true);
    expect(noChange("Keep the size small while the tape is thin.")).toBe(false);
    const full = Array.from({ length: LESSONS_KEPT }, (_, i) => l(`LS-${i}`, { from: i === 0 ? "you" : "evening", state: i === 1 ? "adopted" : "proposed" }));
    expect(makeRoom(full)).toBe(true);
    expect(full.map((x) => x.id).slice(0, 3)).toEqual(["LS-0", "LS-1", "LS-3"]);
    const theirs = Array.from({ length: LESSONS_KEPT }, (_, i) => l(`LS-${i}`, { from: "you" }));
    expect(makeRoom(theirs)).toBe(false);
  });
});

describe("a rule on a lead", () => {
  const lead = (o: Partial<LeadFacts> = {}): LeadFacts => ({ symbol: "ETH/USDT", side: "buy", at: Date.parse("2026-10-01T14:00:00Z"), perp: false, confidence: 0.7, changePct24h: 9.2, volumeUsd24h: 5e6, ...o });

  it("stops a lead in numbers, its way: a long after a rise and a short after a fall; funding a long pays, on a perpetual only; a thin market; the hours; a side; a market; Search's confidence", () => {
    expect(judge({ kind: "chase", maxPct: 8 }, lead())).toEqual({ stop: true, why: "ETH/USDT moved +9.20% over the day" });
    expect(judge({ kind: "chase", maxPct: 8 }, lead({ side: "sell" }))).toEqual({ stop: false });
    expect(judge({ kind: "chase", maxPct: 8 }, lead({ side: "sell", changePct24h: -9 })).stop).toBe(true);
    // 0.01% an hour is 0.24% a day: a long pays it, a short is paid
    const day = fundingPctDay(0.0001, 1);
    expect(day).toBe(0.24);
    expect(judge({ kind: "funding", maxPctDay: 0.1 }, lead({ perp: true, fundingPctDay: day }))).toEqual({ stop: true, why: "a long on ETH/USDT pays 0.2400% of funding a day" });
    expect(judge({ kind: "funding", maxPctDay: 0.1 }, lead({ perp: true, side: "sell", fundingPctDay: day }))).toEqual({ stop: false });
    expect(judge({ kind: "funding", maxPctDay: 0.1 }, lead({ fundingPctDay: day }))).toEqual({ stop: false });
    expect(judge({ kind: "volume", minUsd: 1e7 }, lead())).toEqual({ stop: true, why: "ETH/USDT traded $5M over the day" });
    // 14:00 UTC is 10:00 New York in October
    expect(judge({ kind: "hours", skip: ["08–12"] }, lead())).toEqual({ stop: true, why: "it is 08–12 New York" });
    expect(judge({ kind: "hours", skip: ["12–16"] }, lead())).toEqual({ stop: false });
    expect(judge({ kind: "side", only: "sell" }, lead())).toEqual({ stop: true, why: "a long" });
    expect(judge({ kind: "markets", skip: ["eth/usdt"] }, lead())).toEqual({ stop: true, why: "ETH/USDT is one of them" });
    expect(judge({ kind: "confidence", min: 0.75 }, lead())).toEqual({ stop: true, why: "Search was 0.7 sure" });
    expect(judge({ kind: "plan", maxHours: 4 }, lead())).toEqual({ stop: false });
  });

  it("a number the market did not give lets the lead through, said not judged — never stopped on a guess, never passed in silence", () => {
    expect(judge({ kind: "chase", maxPct: 8 }, lead({ changePct24h: null }))).toEqual({ stop: false, unjudged: "no day's change" });
    expect(judge({ kind: "funding", maxPctDay: 0.1 }, lead({ perp: true, fundingPctDay: null }))).toEqual({ stop: false, unjudged: "no funding rate" });
    expect(judge({ kind: "volume", minUsd: 1e7 }, lead({ volumeUsd24h: undefined }))).toEqual({ stop: false, unjudged: "no day's volume" });
    expect(judge({ kind: "confidence", min: 0.6 }, lead({ confidence: undefined }))).toEqual({ stop: false, unjudged: "no confidence from Search" });
  });

  it("a plan held: a take-profit and a stop no tighter, a time limit no longer than each rule says; the rules that moved it named", () => {
    const plan = { tpPct: 1.5, slPct: 0.8, maxHours: 12 };
    expect(holdPlan(plan, [{ id: "LS-0001", rule: { kind: "plan", minSlPct: 1 } }, { id: "LS-0002", rule: { kind: "plan", maxHours: 24 } }, { id: "LS-0003", rule: { kind: "plan", maxHours: 4, minTpPct: 1 } }])).toEqual({ tpPct: 1.5, slPct: 1, maxHours: 4, held: ["LS-0001", "LS-0003"] });
    expect(holdPlan(plan, [])).toEqual({ ...plan, held: [] });
  });
});

describe("what a rule would have done, and what the Debrief puts forward", () => {
  it("a rule on the desk's trades: the ones it stops and what they made against the ones it lets through, the ones whose number was not kept let through and counted; no trade a lead did not place; a plan rule says nothing", () => {
    const trades = [trade(1, -0.5, { change: 12 }), trade(2, -0.3, { change: 9 }), trade(3, 0.4, { change: 2 }), trade(4, 0.2), trade(5, 1, { desk: false, change: 20 })];
    const e = effectOf({ kind: "chase", maxPct: 8 }, trades)!;
    expect(e).toEqual({ trades: 4, unjudged: 1, stopped: { n: 2, netUsd: -8, meanPct: -0.4, winRatePct: 0 }, kept: { n: 2, netUsd: 6, meanPct: 0.3, winRatePct: 100 }, few: true });
    expect(effectOf({ kind: "plan", maxHours: 4 }, trades)).toBeUndefined();
  });

  it("a market that lost beyond chance against the rest is put forward with the rule that leaves it alone — the worst of its cut, with how many slices were looked at", () => {
    const trades = [...Array.from({ length: 40 }, (_, i) => trade(i, wobble(i, -0.8), { symbol: "DOGE/USDT" })), ...Array.from({ length: 40 }, (_, i) => trade(100 + i, wobble(i, 0.1), { symbol: "BTC/USDT" })), ...Array.from({ length: 35 }, (_, i) => trade(200 + i, wobble(i, -0.1), { symbol: "ETH/USDT" }))];
    const c = candidatesOf(trades);
    const market = c.find((x) => x.from === "market")!;
    expect(market.rule).toEqual({ kind: "markets", skip: ["DOGE/USDT"] });
    expect(market.slice).toBe("DOGE/USDT");
    expect(market.n).toBe(40);
    expect(market.looked).toBe(3);
    expect(market.t).toBeLessThanOrEqual(-2);
    expect(market.text).toBe("Leave DOGE/USDT alone: the desk's 40 trades there made −0.775% a trade, the other 75 +0.020%.");
  });

  it("nothing put forward within chance, on fewer than 30 desk trades, or from trades no lead placed", () => {
    const even = Array.from({ length: 80 }, (_, i) => trade(i, wobble(i, 0), { symbol: i % 2 ? "BTC/USDT" : "ETH/USDT" }));
    expect(candidatesOf(even)).toEqual([]);
    const few = Array.from({ length: 29 }, (_, i) => trade(i, i < 15 ? -1 : 1, { symbol: i < 15 ? "DOGE/USDT" : "BTC/USDT" }));
    expect(candidatesOf(few)).toEqual([]);
    const yours = Array.from({ length: 80 }, (_, i) => trade(i, i < 40 ? wobble(i, -1) : wobble(i, 0.2), { symbol: i < 40 ? "DOGE/USDT" : "BTC/USDT", desk: false }));
    expect(candidatesOf(yours)).toEqual([]);
  });

  it("how long held is said as a time limit, Search's confidence as the least it must be — only where every band below lost too — and the hours as hours to skip", () => {
    const long = [...Array.from({ length: 40 }, (_, i) => trade(i, wobble(i, -1), { held: 30 })), ...Array.from({ length: 40 }, (_, i) => trade(100 + i, wobble(i, 0.2), { held: 2 }))];
    expect(candidatesOf(long).find((x) => x.from === "held")).toMatchObject({ slice: "over a day", rule: { kind: "plan", maxHours: 24 } });
    const unsure = [...Array.from({ length: 40 }, (_, i) => trade(i, wobble(i, -1), { conf: 0.55 })), ...Array.from({ length: 40 }, (_, i) => trade(100 + i, wobble(i, 0.2), { conf: 0.85 }))];
    expect(candidatesOf(unsure).find((x) => x.from === "confidence")).toMatchObject({ slice: "under 0.6", rule: { kind: "confidence", min: 0.6 } });
    // the middle band lost, but the band under it made money: no least confidence says that
    const middle = [...Array.from({ length: 40 }, (_, i) => trade(i, wobble(i, -1), { conf: 0.65 })), ...Array.from({ length: 40 }, (_, i) => trade(100 + i, wobble(i, 0.4), { conf: 0.55 })), ...Array.from({ length: 40 }, (_, i) => trade(200 + i, wobble(i, 0.2), { conf: 0.85 }))];
    expect(candidatesOf(middle).find((x) => x.from === "confidence")).toBeUndefined();
    // entered 02:00 New York (06:00 UTC) against 10:00 (14:00 UTC), a day apart each
    const night = [...Array.from({ length: 40 }, (_, i) => trade(i, wobble(i, -1), { hour: i * 24 + 6 })), ...Array.from({ length: 40 }, (_, i) => trade(100 + i, wobble(i, 0.2), { hour: i * 24 + 14 }))];
    expect(candidatesOf(night).find((x) => x.from === "hours")).toMatchObject({ slice: "00–04", rule: { kind: "hours", skip: ["00–04"] } });
  });
});
