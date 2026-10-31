import { describe, expect, it } from "vitest";
import { LIFT_HOURS_DEFAULT, parsePlan, parseSelfLimits, selfAt, selfBlock, selfWords, signSelf, tighter, type OwnTrade, type SelfLimits } from "../../src/portfolio/account/plans.ts";

/** THE OWNER'S PLAN AND OWN LIMITS (account/plans.ts), with no account round them: a plan read strictly; the limits read strictly, a
 * tightening holding at once and a loosening waiting the hours the limits in force say; what holds a new entry back, and until when, on New
 * York's day. The door and the service that keep them are tested on the stand-in account (account-paper.test.ts) */
const AT = "2026-11-03T15:00:00.000Z";
const HOUR = 3_600_000;
const later = (h: number): string => new Date(Date.parse(AT) + h * HOUR).toISOString();

describe("a plan (parsePlan)", () => {
  it("is JSON of its own fields and no other: why in a sentence, the setup a short tag, the numbers in their bounds — numbers typed as text read as numbers, an empty field as none", () => {
    expect(parsePlan(JSON.stringify({ why: "Held the breakout's retest on rising volume", setup: "pullback", confidence: 0.7, stop: 57000, target: 66000, riskUsd: 30 }), AT)).toEqual({ why: "Held the breakout's retest on rising volume", setup: "pullback", confidence: 0.7, stop: 57000, target: 66000, riskUsd: 30, at: AT });
    expect(parsePlan(JSON.stringify({ why: "x", stop: "57000.5", target: "", confidence: null }), AT)).toEqual({ why: "x", stop: 57000.5, at: AT });
    // the why on one line, cut to 300 characters; the setup to 40
    const p = parsePlan(JSON.stringify({ why: `  two\n\tlines\u0000 ${"w".repeat(400)}`, setup: "s".repeat(60) }), AT);
    if (typeof p === "string") throw new Error(p);
    expect(p.why.startsWith("two lines w")).toBe(true);
    expect(p.why).toHaveLength(300);
    expect(p.setup).toHaveLength(40);
  });

  it("says why it is not one: not JSON, not an object, a field it does not take (named only where it is a plain name), no why, a number out of its bounds or not a number", () => {
    expect(parsePlan("why: breakout", AT)).toBe("a plan is JSON: {why, setup, confidence, stop, target, riskUsd}");
    expect(parsePlan("[1]", AT)).toBe("a plan is {why, setup, confidence, stop, target, riskUsd}");
    expect(parsePlan(JSON.stringify({ why: "x", size: 2 }), AT)).toBe('a plan takes why, setup, confidence, stop, target, riskUsd: "size" is not one of them');
    expect(parsePlan(JSON.stringify({ why: "x", "<b>odd</b>": 2 }), AT)).toBe("a plan takes why, setup, confidence, stop, target, riskUsd: a field it was sent is not one of them");
    expect(parsePlan(JSON.stringify({ why: " \n ", stop: 1 }), AT)).toBe("a plan says why, in a sentence");
    expect(parsePlan(JSON.stringify({ why: "x", confidence: 1.5 }), AT)).toBe("a plan's confidence is 0 to 1, not 1.5");
    expect(parsePlan(JSON.stringify({ why: "x", stop: "low" }), AT)).toBe("a plan's stop is a number");
    expect(parsePlan(JSON.stringify({ why: "x", riskUsd: 0 }), AT)).toBe("a plan's riskUsd is 0.01 to 1000000000, not 0");
  });
});

describe("your own limits, read (parseSelfLimits)", () => {
  it("are JSON of their fields, one limit at least, the wait 24 hours where not said — or nothing at all, to take them all away", () => {
    expect(parseSelfLimits(JSON.stringify({ dayLossUsd: 250, streak: { losses: 3, coolMin: 30 }, maxEntries: 4, planFirst: true, liftHours: 48 }))).toEqual({ dayLossUsd: 250, streak: { losses: 3, coolMin: 30 }, maxEntries: 4, planFirst: true, liftHours: 48 });
    expect(parseSelfLimits(JSON.stringify({ maxEntries: "3" }))).toEqual({ maxEntries: 3, liftHours: LIFT_HOURS_DEFAULT });
    expect(parseSelfLimits(JSON.stringify({ planFirst: true, liftHours: 0 }))).toEqual({ planFirst: true, liftHours: 0 });
    expect(parseSelfLimits("")).toBeNull();
    expect(parseSelfLimits("  ")).toBeNull();
  });

  it("says why they are not: not JSON, a field they do not take, none of them named, a number out of its bounds or not whole, a streak without both its numbers", () => {
    expect(parseSelfLimits("3 a day")).toBe("your own limits are JSON: {dayLossUsd, streak, maxEntries, planFirst, liftHours}, or nothing to take them all away");
    expect(parseSelfLimits("[]")).toBe("your own limits are {dayLossUsd, streak, maxEntries, planFirst, liftHours}");
    expect(parseSelfLimits(JSON.stringify({ maxLoss: 10 }))).toBe('your own limits are dayLossUsd, streak, maxEntries, planFirst, liftHours: "maxLoss" is not one of them');
    // a wait alone, or a plan not asked for, limits nothing
    for (const v of [{}, { liftHours: 12 }, { planFirst: false }]) expect(parseSelfLimits(JSON.stringify(v))).toMatch(/^your own limits name one at least/);
    expect(parseSelfLimits(JSON.stringify({ dayLossUsd: 0.5 }))).toBe("dayLossUsd is 1 to 10000000, not 0.5");
    expect(parseSelfLimits(JSON.stringify({ maxEntries: 2.5 }))).toBe("maxEntries is a whole number");
    expect(parseSelfLimits(JSON.stringify({ maxEntries: 3, liftHours: 200 }))).toBe("liftHours is 0 to 168, not 200");
    expect(parseSelfLimits(JSON.stringify({ streak: { losses: 3 } }))).toBe("streak names both: how many losses in a row, and the minutes to cool");
    expect(parseSelfLimits(JSON.stringify({ streak: { losses: 1, coolMin: 30 } }))).toBe("losses is 2 to 20, not 1");
    expect(parseSelfLimits(JSON.stringify({ streak: { losses: 3, coolMin: 30, after: 1 } }))).toBe('streak is {losses, coolMin}: "after" is not one of them');
    expect(parseSelfLimits(JSON.stringify({ streak: [3, 30] }))).toBe("streak is {losses, coolMin}");
    expect(parseSelfLimits(JSON.stringify({ planFirst: "yes" }))).toBe("planFirst is true or false");
  });

  it("are said in words, as the page and the door say them", () => {
    expect(selfWords({ dayLossUsd: 250, streak: { losses: 3, coolMin: 30 }, maxEntries: 4, planFirst: true, liftHours: 24 })).toBe("no new entry after a day's loss of $250.00 · 30 minutes' pause after 3 losses in a row · 4 entries a day at most · a plan before every entry — loosened only 24 h after it is signed");
    expect(selfWords({ maxEntries: 1, liftHours: 0 })).toBe("1 entry a day at most — loosened as soon as it is signed");
  });
});

describe("your own limits, signed (tighter, signSelf, selfAt)", () => {
  const A: SelfLimits = { dayLossUsd: 200, streak: { losses: 3, coolMin: 30 }, maxEntries: 4, liftHours: 24 };

  it("a tightening is every limit as tight or tighter, none taken away, the wait no shorter; a limit added is tighter, null never is", () => {
    expect(tighter(A, { ...A, dayLossUsd: 100 })).toBe(true);
    expect(tighter(A, { ...A, streak: { losses: 2, coolMin: 60 }, planFirst: true, liftHours: 48 })).toBe(true);
    expect(tighter({ maxEntries: 4, liftHours: 24 }, { maxEntries: 4, dayLossUsd: 50, liftHours: 24 })).toBe(true);
    expect(tighter(A, { ...A, dayLossUsd: 300 })).toBe(false);
    expect(tighter(A, { ...A, dayLossUsd: undefined })).toBe(false);
    expect(tighter(A, { ...A, streak: { losses: 3, coolMin: 15 } })).toBe(false);
    expect(tighter({ planFirst: true, liftHours: 24 }, { maxEntries: 9, liftHours: 24 })).toBe(false);
    expect(tighter(A, { ...A, liftHours: 0 })).toBe(false);
    expect(tighter(A, null)).toBe(false);
  });

  it("the first limits and a tightening hold at once; a loosening waits the hours the limits in force say, they holding until then", () => {
    expect(signSelf({}, A, AT)).toEqual({ state: { now: A }, from: AT });
    const tight = { ...A, maxEntries: 2 };
    expect(signSelf({ now: A }, tight, AT)).toEqual({ state: { now: tight }, from: AT });
    const loose = { ...A, maxEntries: 8 };
    const signed = signSelf({ now: A }, loose, AT);
    expect(signed).toEqual({ state: { now: A, pending: { to: loose, signedAt: AT, from: later(24) } }, from: later(24) });
    // until its hour the limits in force hold; from it, the loosening
    expect(selfAt(signed.state, Date.parse(later(24)) - 1)).toBe(signed.state);
    expect(selfAt(signed.state, Date.parse(later(24)))).toEqual({ now: loose });
  });

  it("taking them all away is a loosening too; a later signature replaces one still waiting — a loosening waits again from its own signature, a tightening holds at once and drops it", () => {
    const off = signSelf({ now: A }, null, AT);
    expect(off.state.pending).toEqual({ to: null, signedAt: AT, from: later(24) });
    expect(selfAt(off.state, Date.parse(later(24)))).toEqual({});
    const other = { ...A, maxEntries: 10 };
    const again = signSelf(off.state, other, later(1));
    expect(again.state).toEqual({ now: A, pending: { to: other, signedAt: later(1), from: later(25) } });
    const tight = { ...A, maxEntries: 1 };
    expect(signSelf(again.state, tight, later(2))).toEqual({ state: { now: tight }, from: later(2) });
  });

  it("a shorter wait is a loosening, so it waits the old one; with no wait at all a loosening holds at once — and a longer wait holds at once", () => {
    const quick = signSelf({ now: A }, { ...A, liftHours: 0 }, AT);
    expect(quick.from).toBe(later(24));
    const none = { maxEntries: 4, liftHours: 0 };
    expect(signSelf({ now: none }, null, AT)).toEqual({ state: {}, from: AT });
    expect(signSelf({ now: none }, { maxEntries: 4, liftHours: 72 }, AT)).toEqual({ state: { now: { maxEntries: 4, liftHours: 72 } }, from: AT });
  });
});

describe("what holds a new entry back (selfBlock), on New York's day", () => {
  /** 10:00 New York on Tuesday 3 November 2026 (EST): its midnight is 05:00 UTC on the 4th */
  const NOW = Date.parse(AT);
  const MIDNIGHT = "2026-11-04T05:00:00.000Z";
  const t = (closedAt: string, netUsd: number): OwnTrade => ({ openedAt: new Date(Date.parse(closedAt) - HOUR).toISOString(), closedAt, netUsd });
  const none = { trades: [] as OwnTrade[], entriesToday: 0, planned: true, nowMs: NOW };

  it("a day's loss line: the paper trades closed today in New York — not yesterday evening's — until midnight there", () => {
    const trades = [t("2026-11-03T04:30:00Z", -500), t("2026-11-03T14:00:00Z", -60), t("2026-11-03T14:30:00Z", -50), t("2026-11-03T14:40:00Z", 15)];
    expect(selfBlock({ dayLossUsd: 100, liftHours: 24 }, { ...none, trades })).toBeUndefined();
    expect(selfBlock({ dayLossUsd: 100, liftHours: 24 }, { ...none, trades: trades.slice(0, 3) })).toEqual({ why: "your own day's loss line is $100.00, and today's paper trades lost $110.00: no new entry until midnight New York", until: MIDNIGHT });
  });

  it("a losing streak's pause: the last trades by when they closed, all losses, and the minutes after the last of them", () => {
    const streak: SelfLimits = { streak: { losses: 3, coolMin: 30 }, liftHours: 24 };
    const lost = [t("2026-11-03T14:20:00Z", -10), t("2026-11-03T14:00:00Z", -10), t("2026-11-03T14:10:00Z", -10)];
    const at = (iso: string) => ({ ...none, trades: lost, nowMs: Date.parse(iso) });
    expect(selfBlock(streak, at("2026-11-03T14:30:00Z"))).toEqual({ why: "your own pause: 3 losing trades in a row, so no new entry for 30 minutes after the last — until 09:50 New York", until: "2026-11-03T14:50:00.000Z" });
    expect(selfBlock(streak, at("2026-11-03T14:50:00Z"))).toBeUndefined();
    // a win among the last three, or fewer trades than the streak, is no streak
    expect(selfBlock(streak, { ...at("2026-11-03T14:30:00Z"), trades: [...lost.slice(0, 2), t("2026-11-03T14:05:00Z", 4)] })).toBeUndefined();
    expect(selfBlock(streak, { ...at("2026-11-03T14:30:00Z"), trades: lost.slice(0, 2) })).toBeUndefined();
  });

  it("the most entries a day, until midnight; a plan first, with nothing to wait for — the day's loss said first where several hold", () => {
    expect(selfBlock({ maxEntries: 3, liftHours: 24 }, { ...none, entriesToday: 3 })).toEqual({ why: "your own limit is 3 entries a day, and today has had 3: no new entry until midnight New York", until: MIDNIGHT });
    expect(selfBlock({ maxEntries: 1, liftHours: 24 }, { ...none, entriesToday: 1 })?.why).toBe("your own limit is 1 entry a day, and today has had 1: no new entry until midnight New York");
    expect(selfBlock({ maxEntries: 3, liftHours: 24 }, { ...none, entriesToday: 2 })).toBeUndefined();
    expect(selfBlock({ planFirst: true, liftHours: 24 }, { ...none, planned: false })).toEqual({ why: "your own rule is a plan before every entry: write it on the ticket (why, the setup, the stop) and sign it with the order" });
    expect(selfBlock({ planFirst: true, liftHours: 24 }, none)).toBeUndefined();
    expect(selfBlock({ dayLossUsd: 10, maxEntries: 1, planFirst: true, liftHours: 24 }, { ...none, trades: [t("2026-11-03T14:00:00Z", -20)], entriesToday: 5, planned: false })?.why).toMatch(/^your own day's loss line/);
  });

  it("midnight is New York's on the day the clocks go back too: on Saturday 31 October 2026 (EDT) the next day starts at 04:00 UTC", () => {
    const sat = Date.parse("2026-10-31T14:00:00Z");
    expect(selfBlock({ maxEntries: 1, liftHours: 24 }, { ...none, entriesToday: 1, nowMs: sat })?.until).toBe("2026-11-01T04:00:00.000Z");
  });
});
