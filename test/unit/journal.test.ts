import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { debriefOf, FEW, type DebriefTrade } from "../../src/portfolio/account/debrief.ts";
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

describe("the debrief", () => {
  /** a closed trade on $1,000 of entry: its result before costs and its costs in percent of the entry, how it ended, the plan it carried */
  const t = (i: number, o: { gross: number; cost?: number; end?: DebriefTrade["end"]; mae?: number; mfe?: number; conf?: number; side?: "long" | "short"; symbol?: string; hours?: number; tp?: number; sl?: number; who?: "owner" | "desk" }): DebriefTrade => {
    const cost = o.cost ?? 0.2;
    const entryUsd = 1000;
    const grossUsd = (o.gross / 100) * entryUsd;
    const feesUsd = (cost / 100) * entryUsd;
    const netUsd = grossUsd - feesUsd;
    const side = o.side ?? "long";
    const entryPrice = 100;
    return {
      symbol: o.symbol ?? "BTC-PERP", kind: "perp", side, openedAt: at(i * 3), closedAt: at(i * 3 + (o.hours ?? 2)), hours: o.hours ?? 2, openRef: `p${i}`, closeRef: `q${i}`,
      ...(o.tp !== undefined ? { takeProfit: side === "long" ? entryPrice * (1 + o.tp / 100) : entryPrice * (1 - o.tp / 100) } : {}),
      ...(o.sl !== undefined ? { stopLoss: side === "long" ? entryPrice * (1 - o.sl / 100) : entryPrice * (1 + o.sl / 100) } : {}),
      qty: 10, entryPrice, exitPrice: entryPrice * (1 + (side === "long" ? 1 : -1) * (o.gross / 100)), entryUsd, grossUsd, feesUsd, fundingUsd: 0, netUsd, returnPct: (netUsd / entryUsd) * 100,
      maePct: o.mae ?? Math.min(0, o.gross), mfePct: o.mfe ?? Math.max(0, o.gross), hi: 0, lo: 0, fills: 2, end: o.end ?? "closed",
      ...(o.conf !== undefined ? { lead: { id: `L-${String(i).padStart(4, "0")}`, thesis: "momentum", confidence: o.conf } } : {}),
      by: o.who === "desk" ? { who: "desk", role: "sniper" } : { who: "owner" },
    };
  };

  it("A COST MACHINE: no edge before costs, the loss is the costs — turned round it would pay them twice; the win rate its sizes and its plan need, beside what it won", () => {
    // symmetric exits of 0.4%, half of them won before costs, 0.2% a trade in costs: the money-losing machine of the 2026-10-01 replay
    const trades = Array.from({ length: 40 }, (_, i) => t(i, { gross: i % 2 ? 0.4 : -0.4, end: i % 2 ? "take-profit" : "stop-loss", tp: 0.4, sl: 0.4 }));
    const d = debriefOf(trades);
    expect(d).toMatchObject({ trades: 40, few: false, wins: 20, losses: 20, winRatePct: 50, grossUsd: 0, feesUsd: 80, costUsd: 80, netUsd: -80 });
    expect(d.perTrade).toMatchObject({ netPct: -0.2, grossPct: 0, grossT: 0, costPct: 0.2 });
    expect(d.inversion.verdict).toBe("costs");
    expect(d.inversion.words).toContain("no edge either way. The loss is the costs, 0.200% a trade. Turned round it would pay them twice");
    // a win of +0.2%, a loss of −0.6%: 75% must win to break even — and the plan's exits say the same
    expect(d.breakEven.winRatePct).toBe(75);
    expect(d.breakEven.plan).toEqual({ winRatePct: 75, takeProfitPct: 0.4, stopPct: 0.4, costPct: 0.2, trades: 40 });
    expect(d.ends).toEqual([{ end: "take-profit", n: 20, netUsd: 40, winRatePct: 100 }, { end: "stop-loss", n: 20, netUsd: -120, winRatePct: 0 }]);
    // each stop-out lost 1.5R net (0.6% on 0.4% risked) and none went past its stop before costs
    expect(d.r).toMatchObject({ trades: 40, meanR: -0.5, pastStop: 0 });
    expect(d.notes[0]).toBe(d.inversion.words);
    expect(d.notes).toContain("At an average win of +0.20% and an average loss of −0.60%, breaking even takes winning 75% of trades; 50% won.");
    expect(d.curve[d.curve.length - 1]![1]).toBe(-80);
  });

  it("an edge the costs eat, a loss beyond chance and bigger than its costs (worth testing the other way), one too small to turn round, a real edge, one not yet told from luck, and too few to say", () => {
    const noise = (i: number) => ((i * 7919) % 11) / 10 - 0.5;
    const of = (gross: (i: number) => number, cost = 0.2, n = 40) => debriefOf(Array.from({ length: n }, (_, i) => t(i, { gross: gross(i), cost })));
    expect(of((i) => 0.15 + noise(i) * 0.1).inversion).toMatchObject({ verdict: "costs", words: expect.stringContaining("an edge, and the costs (0.200% a trade) ate it") });
    const turned = of((i) => -1 + noise(i) * 0.2);
    expect(turned.inversion.verdict).toBe("invertible");
    expect(turned.inversion.words).toMatch(/Turned round, it would have made about 0\.\d{3}% a trade before slippage — a hypothesis for the lab, not a result/);
    expect(of((i) => -0.1 + noise(i) * 0.02).inversion.verdict).toBe("not-enough");
    expect(of((i) => 1 + noise(i)).inversion.verdict).toBe("edge");
    expect(of((i) => 0.3 + noise(i) * 4).inversion.verdict).toBe("unproven");
    const few = of((i) => noise(i), 0.2, FEW - 1);
    expect(few).toMatchObject({ few: true, inversion: { verdict: "few" } });
    expect(debriefOf([])).toMatchObject({ trades: 0, few: true, notes: [], curve: [] });
  });

  it("slices with their counts, FEW marked; the desk's confidence against how often it won; the losers that were up first; the streaks", () => {
    const trades = [
      ...Array.from({ length: 12 }, (_, i) => t(i, { gross: i % 3 ? -1 : 1, conf: 0.85, symbol: "ETH-PERP", who: "desk", mfe: 1.2 })),
      ...Array.from({ length: 8 }, (_, i) => t(20 + i, { gross: 1, conf: 0.55, side: "short", hours: 30, who: "desk" })),
      t(40, { gross: -0.5 }),
    ];
    const d = debriefOf(trades);
    expect(d.slices.market.map((x) => [x.label, x.n, x.few])).toEqual([["ETH-PERP", 12, true], ["BTC-PERP", 9, true]]);
    expect(d.slices.side.map((x) => [x.label, x.n])).toEqual([["long", 13], ["short", 8]]);
    expect(d.slices.held.map((x) => [x.label, x.n])).toEqual([["1–4 hours", 13], ["over a day", 8]]);
    expect(d.slices.by.map((x) => [x.label, x.n])).toEqual([["The desk (sniper)", 20], ["You", 1]]);
    // Search said 85% and won a third; it said 55% and won every time
    expect(d.calibration).toEqual([{ label: "under 0.6", n: 8, saidPct: 55, wonPct: 100 }, { label: "0.8 and over", n: 12, saidPct: 85, wonPct: 33.33 }]);
    // eight losers on ETH were up 1.2% before losing 1.2% net: each gave it back; the last loser on BTC never was up
    expect(d.excursions.gaveBack).toBe(8);
    expect(d.streaks).toMatchObject({ now: { won: false, n: 1 } });
    // the worst mean among the slices of ten trades or more: the thirteen longs (the eight losers on ETH and the one on BTC among them)
    expect(d.notes).toContain("The weakest slice with ten trades or more: long trades — 13 trades, −0.546% a trade, 31% won.");
    expect(d.notes).toContain("8 of 9 losing trades were up at least as much as they finally lost before turning.");
  });
});
