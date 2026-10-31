import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appendTrade, journalPath, readJournal, type JournalTrade } from "../../src/portfolio/account/journal.ts";
import { tripFill, tripFunding, tripPrice, tripRange, type ClosedTrip, type OpenTrip, type TripFill } from "../../src/portfolio/live/trips.ts";

/** THE BLACK BOX (account/journal.ts) and the round trips it keeps (live/trips.ts): a market held from nothing back to nothing, its fills
 * summed, its extremes kept from every price seen, its result said once it is closed — and every closed trip one line of a hash-chained
 * journal that is never cut, an append reading only its end. Pure here: the paper account's own trips are in account-paper.test.ts, the
 * desk's in backtest-desk.test.ts */
const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "journal-"));
  homes.push(d);
  return d;
};

const T0 = Date.parse("2026-10-01T00:00:00Z");
const at = (h: number): string => new Date(T0 + h * 3_600_000).toISOString();
const fillOf = (o: Partial<TripFill> & Pick<TripFill, "side" | "qty" | "price">, h: number): TripFill => ({ symbol: "BTC-PERP", kind: "perp", feeUsd: 0, at: at(h), ref: `p${h}`, clientId: `c${h}`, ...o });

describe("a round trip", () => {
  it("long: opened from nothing, added to, taken from in two, closed — the average entry and exit, the most held, gross, fees, funding and net, its extremes from every price seen", () => {
    const trips: Record<string, OpenTrip> = {};
    expect(tripFill(trips, fillOf({ side: "buy", qty: 1, price: 100, feeUsd: 0.1, takeProfit: 120, stopLoss: 90 }, 0), 0, 1)).toBeUndefined();
    tripPrice(trips, "BTC-PERP", 97);
    expect(tripFill(trips, fillOf({ side: "buy", qty: 1, price: 98, feeUsd: 0.098 }, 1), 1, 2)).toBeUndefined();
    tripRange(trips, "BTC-PERP", 95, 104);
    tripFunding(trips, "BTC-PERP", 0.5);
    tripFunding(trips, "BTC-PERP", -0.2);
    expect(tripFill(trips, fillOf({ side: "sell", qty: 1, price: 103, feeUsd: 0.103 }, 2), 2, 1)).toBeUndefined();
    // a price that is no price widens nothing
    tripPrice(trips, "BTC-PERP", 0);
    tripPrice(trips, "BTC-PERP", Number.NaN);
    const t = tripFill(trips, fillOf({ side: "sell", qty: 1, price: 106, feeUsd: 0.106 }, 5), 1, 0)!;
    expect(trips).toEqual({});
    expect(t).toMatchObject({ symbol: "BTC-PERP", side: "long", openedAt: at(0), closedAt: at(5), hours: 5, openRef: "p0", openClientId: "c0", closeRef: "p5", closeClientId: "c5", takeProfit: 120, stopLoss: 90, qty: 2, entryPrice: 99, exitPrice: 104.5, entryUsd: 198, grossUsd: 11, fundingUsd: 0.3, hi: 106, lo: 95, fills: 4, end: "closed" });
    expect(t.feesUsd).toBeCloseTo(0.407, 9);
    expect(t.netUsd).toBeCloseTo(11 - 0.407 - 0.3, 6);
    expect(t.returnPct).toBeCloseTo(((11 - 0.407 - 0.3) / 198) * 100, 3);
    // from the entry's average (99): down to 95, up to 106
    expect(t.maePct).toBeCloseTo((95 / 99 - 1) * 100, 3);
    expect(t.mfePct).toBeCloseTo((106 / 99 - 1) * 100, 3);
  });

  it("short: sold first, bought back at its stop — its extremes the other way round, and how it ended as the paper account said it", () => {
    const trips: Record<string, OpenTrip> = {};
    tripFill(trips, fillOf({ side: "sell", qty: 2, price: 50, feeUsd: 0.1 }, 0), 0, -2);
    tripPrice(trips, "BTC-PERP", 48);
    tripPrice(trips, "BTC-PERP", 51);
    const t = tripFill(trips, fillOf({ side: "buy", qty: 2, price: 52, feeUsd: 0.104, end: "stop-loss" }, 3), -2, 0)!;
    expect(t).toMatchObject({ side: "short", entryPrice: 50, exitPrice: 52, grossUsd: -4, end: "stop-loss", hi: 52, lo: 48 });
    expect(t.maePct).toBeCloseTo(-4, 6);
    expect(t.mfePct).toBeCloseTo(4, 6);
    expect(t.netUsd).toBeCloseTo(-4.204, 6);
  });

  it("a market held before its trips were kept opens none until it is held from nothing again; markets are their own trips", () => {
    const trips: Record<string, OpenTrip> = {};
    // a book from before trips: the position was there, a fill takes from it, another closes it — no trip, nothing said
    expect(tripFill(trips, fillOf({ side: "sell", qty: 1, price: 100 }, 0), 3, 2)).toBeUndefined();
    expect(tripFill(trips, fillOf({ side: "sell", qty: 2, price: 101 }, 1), 2, 0)).toBeUndefined();
    expect(trips).toEqual({});
    // from nothing again: kept, and another market beside it is a trip of its own
    tripFill(trips, fillOf({ side: "buy", qty: 1, price: 100 }, 2), 0, 1);
    tripFill(trips, fillOf({ symbol: "ETH-PERP", side: "sell", qty: 3, price: 10 }, 2), 0, -3);
    expect(Object.keys(trips).sort()).toEqual(["BTC-PERP", "ETH-PERP"]);
    tripPrice(trips, "ETH-PERP", 12);
    expect(trips["BTC-PERP"]).toMatchObject({ hi: 100, lo: 100 });
    expect(trips["ETH-PERP"]).toMatchObject({ hi: 12, lo: 10 });
  });

  it("an event contract settled at nothing: zero is its price, and the trip lost all it put in", () => {
    const trips: Record<string, OpenTrip> = {};
    tripFill(trips, fillOf({ symbol: "FED:Yes", kind: "event", side: "buy", qty: 100, price: 0.4, feeUsd: 0.04 }, 0), 0, 100);
    const t = tripFill(trips, fillOf({ symbol: "FED:Yes", kind: "event", side: "sell", qty: 100, price: 0, end: "settled" }, 30), 100, 0)!;
    expect(t).toMatchObject({ end: "settled", entryPrice: 0.4, exitPrice: 0, grossUsd: -40, lo: 0, maePct: -100, mfePct: 0 });
  });
});

describe("the journal", () => {
  const trade = (n: number, extra: Partial<JournalTrade> = {}): JournalTrade => {
    const trips: Record<string, OpenTrip> = {};
    tripFill(trips, fillOf({ side: "buy", qty: 1, price: 100 + n, feeUsd: 0.1 }, n), 0, 1);
    const t = tripFill(trips, fillOf({ side: "sell", qty: 1, price: 101 + n, feeUsd: 0.1 }, n + 1), 1, 0) as ClosedTrip;
    return { ...t, venue: "paper-1", venueName: "Paper", paper: true, by: { who: "owner" }, closedBy: { who: "owner" }, ...extra };
  };

  it("one chained line a trade, read back whole with who made it and the desk's lead; a line changed is seen where it was changed", () => {
    const home = tmp();
    expect(readJournal(home)).toEqual({ rows: [], intact: true });
    const a = appendTrade(home, trade(1), T0);
    const b = appendTrade(home, trade(2, { by: { who: "desk", role: "sniper", name: "Desk Sniper", address: "0xab" }, closedBy: { who: "venue" }, lead: { id: "L-0007", thesis: "BTC leads on volume", confidence: 0.7, tpPct: 2, slPct: 1, maxHours: 24 } }), T0 + 1);
    appendTrade(home, trade(3), T0 + 2);
    expect(a).toMatchObject({ v: 1, seq: 1, prev: "0".repeat(64) });
    expect(b.prev).toBe(a.hash);
    const j = readJournal(home);
    expect(j.intact).toBe(true);
    expect(j.rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(j.rows[1]).toMatchObject({ by: { who: "desk", role: "sniper" }, closedBy: { who: "venue" }, lead: { id: "L-0007", thesis: "BTC leads on volume" }, entryPrice: 102, exitPrice: 103 });
    // the user's alone
    expect(readFileSync(journalPath(home)).length).toBeGreaterThan(0);
    const lines = readFileSync(journalPath(home), "utf8").split("\n").filter(Boolean);
    writeFileSync(journalPath(home), [lines[0], lines[1]!.replace('"netUsd":0.8', '"netUsd":80.8'), lines[2], ""].join("\n"));
    expect(readJournal(home)).toMatchObject({ intact: false, brokenAt: 2, why: "line 2 is not what was written" });
    expect(readJournal(home).rows).toHaveLength(1);
  });

  it("an append reads only the end of the file: a long journal is chained to its last line, and a last line cut mid-write is chained to as text and said where the chain broke", () => {
    const home = tmp();
    for (let i = 0; i < 2_000; i++) appendTrade(home, trade(i), T0 + i);
    const last = appendTrade(home, trade(2_000), T0 + 2_000);
    expect(last.seq).toBe(2_001);
    expect(readJournal(home)).toMatchObject({ intact: true });
    expect(readJournal(home).rows).toHaveLength(2_001);
    // the process died writing a line: the next append counts the lines and chains to the cut one's text
    appendFileSync(journalPath(home), '{"v":1,"seq":2002,"ts":"2026');
    const after = appendTrade(home, trade(2_002), T0 + 2_002);
    expect(after.seq).toBe(2_003);
    expect(readJournal(home)).toMatchObject({ intact: false, brokenAt: 2_002, why: "line 2002 is not JSON" });
  });
});
