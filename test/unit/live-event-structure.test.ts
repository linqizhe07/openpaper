import { describe, expect, it } from "vitest";
import { isRefusal } from "../../src/core/errors.ts";
import { catalogueOf, deviationOf, feeAt, kalshiContracts, kalshiFee, lastDayOf, pairByBrain, pmusContracts, pmusFee, rulesDiff, scanStructure, shapeOf, topicOf, type EventContract, type Relation } from "../../src/portfolio/live/event-structure.ts";
import { kalshiPublic, polymarketUsPublic } from "../../src/portfolio/live/public-markets.ts";
import { KALSHI_EVENTS, KALSHI_SERIES, NOW, PMUS_LIST, PMUS_SEARCH } from "./live-event-structure-fixtures.ts";
import { json, network, type Rec } from "./live-public-markets-fixtures.ts";

/** THE RULE STRUCTURE of the event contracts (live/event-structure.ts), read from the venues' own recorded answers (live-event-structure-
 * fixtures.ts: Kalshi's events with their rules and series, Polymarket US's search) — the contracts as the readers make them, the
 * catalogue of relations the rules make (one event's exclusive sets, ladders, chains of dates; the same question at two venues), the
 * deviation at the books, the fees, the flag, the words where two rules differ; and a brain's candidates, kept apart from every number.
 * Nothing leaves the process: the two public sources answer from a stand-in network here */

const events = (series: string): Rec[] => (KALSHI_EVENTS[series]!.events as Rec[]);
const seriesOf = (ticker: string): Rec | undefined => KALSHI_SERIES[ticker]?.series as Rec | undefined;
const KALSHI = { venue: "kalshi", venueName: "Kalshi", connector: "live:kalshi", now: NOW };
const PMUS = { venue: "polymarket-us", venueName: "Polymarket US", connector: "live:polymarket-us", now: NOW };
const kalshi = (...series: string[]): EventContract[] => kalshiContracts(series.flatMap(events), seriesOf, KALSHI);
const pmus = (...queries: string[]): EventContract[] => pmusContracts(queries.flatMap((q) => PMUS_SEARCH[q]!.events as Rec[]), PMUS);
const byId = (cs: EventContract[], id: string): EventContract => {
  const c = cs.find((x) => x.id === id);
  if (!c) throw new Error(`no contract ${id}`);
  return c;
};
const find = (rs: Relation[], kind: Relation["kind"], ...ids: string[]): Relation | undefined => rs.find((r) => r.kind === kind && ids.every((id, i) => r.legs[i]?.id === id));
const ids = (r: Relation | undefined): string[] => (r ? r.legs.map((l) => l.id) : []);

describe("Kalshi's events as contracts", () => {
  it("reads each active market still open: its YES leg, its event's exclusivity, its strike, its rules, its sources, its book, its series' fee", () => {
    const cs = kalshi("KXINX");
    expect(cs).toHaveLength(30);
    const low = byId(cs, "KXINX-26NOV06H1600-T7350");
    expect(low).toMatchObject({ venue: "kalshi", venueName: "Kalshi", connector: "live:kalshi", symbol: "KXINX-26NOV06H1600-T7350:YES", event: { id: "KXINX-26NOV06H1600", title: "S&P price range on Nov 6, 2026 at 4pm EST?", exclusive: true, series: "KXINX" }, words: "7,349.9999 or below", strike: { type: "less", cap: 7350 }, bid: 0.03, ask: 0.21, tick: 0.01, open: true, category: "Financials", closeTime: "2026-11-06T21:00:00Z" });
    expect(low.rules).toBe("If the end-of-day S&P 500 index value on November 06, 2026 is below 7350, then the market resolves to Yes.");
    expect(low.settles.sources).toEqual(["For example, Google Finance"]);
    expect(low.fee).toEqual({ kind: "quadratic", rate: 0.07, maker: 0, rounding: "up-cent", words: "Kalshi: 7% × p × (1 − p) a contract, rounded up to the cent on each order; makers pay none" });
    const mid = byId(cs, "KXINX-26NOV06H1600-B7362");
    expect(mid.strike).toEqual({ type: "between", floor: 7350, cap: 7374.9999 });
    // an empty side of Kalshi's book (0.0000) is no bid
    expect("bid" in mid).toBe(false);
  });

  it("a series with maker fees says so; a custom strike is kept as the venue writes it; a market past its close or not active is left out", () => {
    const fed = kalshi("KXFEDDECISION");
    expect(fed.map((c) => c.id)).toEqual(["KXFEDDECISION-26DEC-C26", "KXFEDDECISION-26DEC-C25", "KXFEDDECISION-26DEC-H0", "KXFEDDECISION-26DEC-H25", "KXFEDDECISION-26DEC-H26"]);
    expect(byId(fed, "KXFEDDECISION-26DEC-C25").strike).toEqual({ type: "custom", custom: { Cut: "25" } });
    expect(byId(fed, "KXFEDDECISION-26DEC-C25").fee).toMatchObject({ kind: "quadratic", rate: 0.07, maker: 0.25, words: expect.stringContaining("a maker pays 25% of it") });
    expect(byId(fed, "KXFEDDECISION-26DEC-H0").settles).toEqual({ sources: ["Federal Reserve"], at: "2026-12-09T19:05:00Z" });
    // the IPO event lists twelve dates; six are finalized (before Nov 1) and left out
    const ipo = kalshi("KXIPOANTHROPIC");
    expect(ipo.map((c) => c.words)).toEqual(["Before Nov 16, 2026", "Before Dec 1, 2026", "Before Jan 1, 2027", "Before Feb 1, 2027", "Before Mar 1, 2027", "Before Apr 1, 2027"]);
    expect(ipo[0]!.settles.sources.slice(0, 2)).toEqual(["the New York Times", "ABC"]);
  });

  it("the fee models: Kalshi's general rate scaled by the series' multiplier, an event's override first, a flat series said unread; Polymarket US's coefficient", () => {
    expect(kalshiFee({ fee_type: "quadratic", fee_multiplier: 0.5 }, undefined)).toMatchObject({ kind: "quadratic", rate: 0.035, maker: 0 });
    expect(kalshiFee({ fee_type: "quadratic", fee_multiplier: 1 }, { fee_type_override: "quadratic_with_combo_maker_fees", fee_multiplier_override: 2 })).toMatchObject({ rate: 0.14, maker: 0.5 });
    expect(kalshiFee({ fee_type: "flat", fee_multiplier: 1 }, undefined)).toMatchObject({ kind: "unread", rate: 0.07, words: expect.stringContaining("not read") });
    expect(pmusFee({ feeCoefficient: 0.1 })).toMatchObject({ kind: "quadratic", rate: 0.1, maker: 0, rounding: "nearest-cent" });
    expect(pmusFee({})).toMatchObject({ rate: 0.0695 });
    // the schedule's own example: 1,000 contracts at $0.50 pay $17.38 at Polymarket US, $17.50 at Kalshi before rounding
    expect(feeAt(pmusFee({}), 0.5) * 1000).toBeCloseTo(17.375, 3);
    expect(feeAt(kalshiFee(undefined, undefined), 0.5) * 1000).toBeCloseTo(17.5, 6);
  });
});

describe("Polymarket US's events as contracts", () => {
  it("reads each open market: its event, its rules (description), the source its rules name, its book, its tick, its coefficient; resolved markets are left out", () => {
    const cs = pmus("anthropic");
    const ipo = cs.filter((c) => c.event.id === "anthropic");
    expect(ipo.map((c) => c.words)).toEqual(["November 30, 2026", "December 31, 2026", "June 30, 2027"]);
    const nov = byId(cs, "ipcc-anthropic-2026-11-30");
    expect(nov).toMatchObject({ venue: "polymarket-us", symbol: "ipcc-anthropic-2026-11-30:YES", question: "Anthropic IPO Officially Confirmed By", event: { id: "anthropic", title: "Anthropic IPO Officially Confirmed?", exclusive: false }, bid: 0.81, ask: 0.82, tick: 0.01, category: "finance", closeTime: "2027-07-15T03:00:00Z" });
    expect(nov.rules.startsWith("If Anthropic confirms an IPO by November 30, 2026, 11:59 PM ET, this market will settle to Yes.")).toBe(true);
    expect(nov.settles.sources).toEqual(["Anthropic, the relevant IPO regulatory authority, and the IPOs primary listing exchange"]);
    expect(nov.fee).toMatchObject({ kind: "quadratic", rate: 0.0695, maker: 0, rounding: "nearest-cent" });
    const opus = cs.filter((c) => c.event.id === "anthr-opus-gte5pt6");
    expect(opus.map((c) => [c.words, c.bid, c.ask])).toEqual([["By November 13, 2026", 0.58, 0.59], ["By November 20, 2026", 0.62, 0.63], ["By November 30, 2026", 0.6, 0.61]]);
  });

  it("a market whose rules say only one outcome resolves Yes marks its event exclusive; a plain list of markets is one event each", () => {
    const range = pmus("bitcoin").filter((c) => c.event.id === "btc-pricerange-yr-12-31-2026");
    expect(range.length).toBeGreaterThan(3);
    expect(range.every((c) => c.event.exclusive)).toBe(true);
    const single = pmusContracts((PMUS_LIST.markets as Rec[]).map((m) => ({ slug: m.slug, title: m.question, markets: [m] })), PMUS);
    expect(single.map((c) => c.event.id)).toContain("cpc-btc-100k-11-30-2026");
    expect(single.find((c) => c.id === "cpc-btc-100k-11-30-2026")!.event.exclusive).toBe(false);
  });
});

describe("the shape of a market: what it compares, with what, by when", () => {
  it("the last day a sentence is about: before and until end the day before, by and on are that day, a month alone its first or last", () => {
    expect(lastDayOf("If Anthropic confirms an IPO before Dec 1, 2026, then the market resolves to Yes.")).toBe("2026-11-30");
    expect(lastDayOf("Anthropic IPO Officially Confirmed By November 30, 2026")).toBe("2026-11-30");
    expect(lastDayOf("by December 31, 2026, 11:59 PM ET")).toBe("2026-12-31");
    expect(lastDayOf("at any point after the creation of this market and before 12:00 AM ET on January 1, 2027")).toBe("2026-12-31");
    expect(lastDayOf("from the creation of this market until 12:00 AM ET on January 1, 2027")).toBe("2026-12-31");
    expect(lastDayOf("When will Bitcoin cross $100k again? Before December 2026")).toBe("2026-11-30");
    expect(lastDayOf("Claude Opus 5.6+ Released? By November 2026")).toBe("2026-11-30");
    expect(lastDayOf("Fed decision in Dec 2026?")).toBeUndefined();
  });

  it("Kalshi's strikes are the edges: above X is at least X + a cent, below X at most X − a cent, between both; a custom strike with a date is a deadline", () => {
    const cpi = kalshi("KXCPI");
    expect(shapeOf(byId(cpi, "KXCPI-26OCT-T0.2"))).toMatchObject({ kind: "point", lo: 0.21, day: "2026-11-10" });
    const inx = kalshi("KXINX");
    expect(shapeOf(byId(inx, "KXINX-26NOV06H1600-T7350"))).toMatchObject({ kind: "point", hi: 7349.99, day: "2026-11-06" });
    expect(shapeOf(byId(inx, "KXINX-26NOV06H1600-B7362"))).toMatchObject({ kind: "point", lo: 7350, hi: 7374.9999, day: "2026-11-06" });
    const ipo = kalshi("KXIPOANTHROPIC");
    expect(shapeOf(byId(ipo, "KXIPOANTHROPIC-DATE-26DEC01"))).toMatchObject({ kind: "by", day: "2026-11-30", topic: ["anthropic", "confirms", "ipo"] });
    expect(shapeOf(byId(kalshi("KXFEDDECISION"), "KXFEDDECISION-26DEC-C25")).kind).toBe("custom");
  });

  it("Polymarket US's words are read the same way: a touch before a deadline, a range at a moment, a thing done by a date", () => {
    const btc = pmus("bitcoin");
    expect(shapeOf(byId(btc, "cpc-btc-hitprice-high-yr-12-31-2026-90k"))).toMatchObject({ kind: "touch", lo: 90000, day: "2026-12-31" });
    expect(shapeOf(byId(btc, "cpc-btc-100k-12-31-2026"))).toMatchObject({ kind: "touch", lo: 100000.01, day: "2026-12-31" });
    expect(shapeOf(byId(btc, "cpc-btc-hitprice-low-yr-12-31-2026-55k"))).toMatchObject({ kind: "touch", hi: 54999.99, day: "2026-12-31" });
    expect(shapeOf(byId(btc, "cpc-btc-pricerange-yr-12-31-2026-above-150k"))).toMatchObject({ kind: "point", lo: 150000 });
    expect(shapeOf(byId(pmus("anthropic"), "ipcc-anthropic-2026-11-30"))).toMatchObject({ kind: "by", day: "2026-11-30", topic: ["anthropic", "confirms", "ipo"] });
    expect(shapeOf(byId(pmus("fed rate"), "rvcus-fedfnds-ondt-2027-12-31-gte3pt25"))).toMatchObject({ kind: "point", lo: 3.25, day: "2027-12-31" });
  });

  it("the topic of a rule is its content words, each venue's name for a thing read as one", () => {
    expect(topicOf("If the Federal Reserve does a Cut of 25bps on December 09, 2026, then the market resolves to Yes.")).toEqual(["bps", "cut", "fed"]);
    expect(topicOf("This market will settle to Yes if the price of Bitcoin is above $100,000.00 at any point after the creation of this market and before 12:00 AM ET on January 1, 2027.")).toEqual(["bitcoin"]);
  });
});

describe("the catalogue: what the rules bind together", () => {
  it("one exclusive event is one set, its ranges tiling the line (exhaustive); a ladder of thresholds is a chain of implications, the higher floor implying the lower", () => {
    const rs = catalogueOf(kalshi("KXINX", "KXCPI"));
    const set = rs.find((r) => r.kind === "exclusive");
    expect(set).toMatchObject({ how: "event", exhaustive: true });
    expect(set!.legs).toHaveLength(30);
    expect(set!.legs[0]!.id).toBe("KXINX-26NOV06H1600-T7350");
    expect(set!.legs[29]!.words).toBe("8,050 or above");
    expect(rs.filter((r) => r.kind === "exclusive")).toHaveLength(1);
    // CPI in October: twelve thresholds, eleven rungs; November's seven, six — and no relation across the two months
    const oct = rs.filter((r) => r.kind === "implies" && r.legs[0]!.id.startsWith("KXCPI-26OCT"));
    expect(oct).toHaveLength(11);
    expect(oct.every((r) => r.how === "ladder" && r.legs[1]!.id.startsWith("KXCPI-26OCT"))).toBe(true);
    expect(ids(find(rs, "implies", "KXCPI-26OCT-T0.3"))).toEqual(["KXCPI-26OCT-T0.3", "KXCPI-26OCT-T0.2"]);
    expect(rs.filter((r) => r.kind === "implies" && r.legs[0]!.id.startsWith("KXCPI-26NOV"))).toHaveLength(6);
    expect(rs.filter((r) => r.legs.some((l) => l.id.startsWith("KXCPI-26OCT")) && r.legs.some((l) => l.id.startsWith("KXCPI-26NOV")))).toHaveLength(0);
  });

  it("a custom set (the Fed's decision) is exclusive but not known to be exhaustive", () => {
    const rs = catalogueOf(kalshi("KXFEDDECISION"));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ kind: "exclusive", how: "event" });
    expect(rs[0]!.exhaustive).toBeUndefined();
    expect(rs[0]!.legs.map((l) => l.words)).toEqual(["Cut >25bps", "Cut 25bps", "Fed maintains rate", "Hike 25bps", "Hike >25bps"]);
  });

  it("a chain of dates in one event: done before the earlier date is done before the later, at either venue", () => {
    const k = catalogueOf(kalshi("KXIPOANTHROPIC"));
    expect(k.map((r) => [r.kind, r.how, ...ids(r)])).toEqual([
      ["implies", "dates", "KXIPOANTHROPIC-DATE-26NOV16", "KXIPOANTHROPIC-DATE-26DEC01"],
      ["implies", "dates", "KXIPOANTHROPIC-DATE-26DEC01", "KXIPOANTHROPIC-DATE-27JAN01"],
      ["implies", "dates", "KXIPOANTHROPIC-DATE-27JAN01", "KXIPOANTHROPIC-DATE-27FEB01"],
      ["implies", "dates", "KXIPOANTHROPIC-DATE-27FEB01", "KXIPOANTHROPIC-DATE-27MAR01"],
      ["implies", "dates", "KXIPOANTHROPIC-DATE-27MAR01", "KXIPOANTHROPIC-DATE-27APR01"],
    ]);
    const p = catalogueOf(pmus("anthropic"));
    expect(ids(find(p, "implies", "aimc-anthr-opus-gte5pt6-2026-11-13"))).toEqual(["aimc-anthr-opus-gte5pt6-2026-11-13", "aimc-anthr-opus-gte5pt6-2026-11-20"]);
    expect(ids(find(p, "implies", "aimc-anthr-opus-gte5pt6-2026-11-20"))).toEqual(["aimc-anthr-opus-gte5pt6-2026-11-20", "aimc-anthr-opus-gte5pt6-2026-11-30"]);
    expect(ids(find(p, "implies", "ipcc-anthropic-2026-11-30"))).toEqual(["ipcc-anthropic-2026-11-30", "ipcc-anthropic-2026-12-31"]);
    expect(p.filter((r) => r.kind === "implies")).toHaveLength(4);
  });

  it("the same question at two venues: Kalshi's 'before Dec 1, 2026' and Polymarket US's 'by November 30, 2026', the same words in both rules — with where they differ", () => {
    const rs = catalogueOf([...kalshi("KXIPOANTHROPIC"), ...pmus("anthropic")]);
    const same = rs.filter((r) => r.kind === "same");
    expect(same.map((r) => [r.how, ...ids(r)])).toEqual([
      ["shape", "KXIPOANTHROPIC-DATE-26DEC01", "ipcc-anthropic-2026-11-30"],
      ["shape", "KXIPOANTHROPIC-DATE-27JAN01", "ipcc-anthropic-2026-12-31"],
    ]);
    const r = same[0]!;
    expect(r.legs.map((l) => [l.venue, l.symbol, l.bid, l.ask])).toEqual([["kalshi", "KXIPOANTHROPIC-DATE-26DEC01:YES", 0.79, 0.8], ["polymarket-us", "ipcc-anthropic-2026-11-30:YES", 0.81, 0.82]]);
    // the deciding sentences are near-twins (the same words but for the date); what differs is what "confirmed" means at each
    expect(r.rulesDiff).toContain("Kalshi says: An IPO is confirmed if 1) the SEC declares the company's Form S-1 effective OR 2) the IPO is priced OR 3) a securities exchange has assigned a ticker to it.");
    expect(r.rulesDiff).toContain("Polymarket US says: Outcome verified by Anthropic, the relevant IPO regulatory authority, and the IPOs primary listing exchange. An IPO is confirmed when i) the SEC declares the specified companys Form S-1");
    // the event's own sources (its series names the BBC in their place)
    expect(r.settles).toBe("Kalshi: the New York Times, ABC, Bloomberg, The Wall Street Journal, Financial Times, CNBC, Reuters, Anthropic · 2027-04-01 14:00 UTC · Polymarket US: Anthropic, the relevant IPO regulatory authority, and the IPOs primary listing exchange · 2027-07-15 03:00 UTC");
    // across the two venues' date chains: an earlier deadline at one implies the next later one at the other — neighbours only, the rest
    // following from those (Nov 16 at Kalshi implies Nov 30 at Polymarket US, not also its Dec 31)
    expect(rs.filter((r) => r.how === "shape" && r.kind === "implies").map(ids)).toEqual([
      ["KXIPOANTHROPIC-DATE-26NOV16", "ipcc-anthropic-2026-11-30"],
      ["KXIPOANTHROPIC-DATE-26DEC01", "ipcc-anthropic-2026-12-31"],
      ["ipcc-anthropic-2026-11-30", "KXIPOANTHROPIC-DATE-27JAN01"],
      ["ipcc-anthropic-2026-12-31", "KXIPOANTHROPIC-DATE-27FEB01"],
      ["KXIPOANTHROPIC-DATE-27APR01", "ipcc-anthropic-2027-06-30"],
    ]);
  });

  it("the same shape in two events of one venue: 'hit $150k before January 2027' and 'how high this year? above $149,999.99', made together, are one question; an earlier deadline implies the later; a ladder of touches is a ladder", () => {
    const rs = catalogueOf(pmus("bitcoin"));
    expect(ids(find(rs, "same", "cpc-btc-150k-12-31-2026"))).toEqual(["cpc-btc-150k-12-31-2026", "cpc-btc-hitprice-high-yr-12-31-2026-150k"]);
    expect(find(rs, "implies", "cpc-btc-150k-11-30-2026", "cpc-btc-hitprice-high-yr-12-31-2026-150k")).toMatchObject({ how: "shape" });
    expect(find(rs, "implies", "cpc-btc-hitprice-high-yr-12-31-2026-150k", "cpc-btc-hitprice-high-yr-12-31-2026-140k")).toMatchObject({ how: "ladder" });
    expect(find(rs, "implies", "cpc-btc-hitprice-low-yr-12-31-2026-40k", "cpc-btc-hitprice-low-yr-12-31-2026-45k")).toMatchObject({ how: "ladder" });
    // a point at the year's end and a touch by it are not one question; the price ranges are one exclusive set, the six read not tiling the line
    expect(rs.filter((r) => r.kind === "same" && r.legs.some((l) => l.id.startsWith("cpc-btc-pricerange")))).toHaveLength(0);
    expect(rs.find((r) => r.kind === "exclusive")).toMatchObject({ how: "event", exhaustive: false });
    expect(rs.find((r) => r.kind === "exclusive")!.legs.map((l) => l.words)).toEqual(["125,000 to 129,999.99", "130,000 to 134,999.99", "135,000 to 139,999.99", "140,000 to 144,999.99", "145,000 to 149,999.99", "150,000 or above"]);
  });

  it("two touches to one level by one day made more than a day apart are not one question: the younger implies the older", () => {
    const cs = pmus("bitcoin");
    const aged = cs.map((c) => (c.id === "cpc-btc-150k-12-31-2026" ? { ...c, since: "2026-09-01T00:00:00Z" } : c));
    const rs = catalogueOf(aged);
    expect(find(rs, "same", "cpc-btc-150k-12-31-2026")).toBeUndefined();
    expect(find(rs, "implies", "cpc-btc-150k-12-31-2026", "cpc-btc-hitprice-high-yr-12-31-2026-150k")).toMatchObject({ how: "shape" });
  });

  it("different questions stay apart: the Fed's December cut at Kalshi and a cut in 2026 at Polymarket US, bitcoin at 5pm and bitcoin at any point", () => {
    const rs = catalogueOf([...kalshi("KXFEDDECISION", "KXBTCD"), ...pmus("fed rate", "bitcoin")]);
    expect(rs.filter((r) => r.legs.some((l) => l.venue === "kalshi") && r.legs.some((l) => l.venue === "polymarket-us"))).toHaveLength(0);
    // the hourly bitcoin ladder is still a ladder
    expect(rs.filter((r) => r.how === "ladder" && r.legs[0]!.id.startsWith("KXBTCD"))).toHaveLength(5);
  });

  it("where two rules differ: one sentence a side, or the words alone when the rule is the same but for its numbers", () => {
    const cpi = kalshi("KXCPI");
    expect(rulesDiff(byId(cpi, "KXCPI-26OCT-T0.3"), byId(cpi, "KXCPI-26OCT-T0.2"))).toBe("the same rule but for “0.3%” against “0.2%”");
    const a = byId(cpi, "KXCPI-26OCT-T0.3");
    expect(rulesDiff(a, a)).toBe("the same rule, word for word");
  });
});

describe("the deviation: what hitting both books now would leave", () => {
  const leg = (venue: string, id: string, bid: number | undefined, ask: number | undefined, rate = 0.07): Relation["legs"][number] => ({ venue, venueName: venue, symbol: `${id}:YES`, id, question: id, words: id, ...(bid !== undefined ? { bid } : {}), ...(ask !== undefined ? { ask } : {}), tick: 0.01, settles: { sources: [] }, fee: `${venue}: ${rate * 100}% × p × (1 − p) a contract` });
  const rel = (kind: Relation["kind"], legs: Relation["legs"], extra: Partial<Relation> = {}): Relation => ({ id: "R-test", kind, how: "event", legs, rulesDiff: "", settles: "", ...extra });

  it("implies: a bid on the implying market above the ask on the implied one, less both takers' fees; flagged at a tick", () => {
    const d = deviationOf(rel("implies", [leg("a", "A", 0.62, 0.63, 0.0695), leg("b", "B", 0.6, 0.61, 0.0695)]))!;
    expect(d.gross).toBeCloseTo(0.01, 6);
    expect(d.fees).toBeCloseTo(0.0695 * 0.62 * 0.38 + 0.0695 * 0.61 * 0.39, 6);
    expect(d.net).toBeCloseTo(0.01 - d.fees, 6);
    expect(d.flagged).toBe(false);
    expect(d.trade).toBe("sell A:YES at 0.62 · buy B:YES at 0.61");
    expect(d.legs).toEqual([{ symbol: "A:YES", side: "sell", price: 0.62, fee: expect.closeTo(0.0695 * 0.62 * 0.38, 6) }, { symbol: "B:YES", side: "buy", price: 0.61, fee: expect.closeTo(0.0695 * 0.61 * 0.39, 6) }]);
    const wide = deviationOf(rel("implies", [leg("a", "A", 0.7, 0.71), leg("b", "B", 0.6, 0.61)]))!;
    expect(wide.gross).toBeCloseTo(0.09, 6);
    expect(wide.flagged).toBe(true);
    // the books honour it: the gross is negative, and nothing is flagged
    expect(deviationOf(rel("implies", [leg("a", "A", 0.5, 0.51), leg("b", "B", 0.6, 0.61)]))).toMatchObject({ gross: expect.closeTo(-0.11, 6), flagged: false });
    // a side the trade needs is missing: no deviation
    expect(deviationOf(rel("implies", [leg("a", "A", undefined, 0.51), leg("b", "B", 0.6, 0.61)]))).toBeUndefined();
    // a dollar threshold instead of a tick
    expect(deviationOf(rel("implies", [leg("a", "A", 0.7, 0.71), leg("b", "B", 0.6, 0.61)]), 0.2)!.flagged).toBe(false);
  });

  it("same: the better of the two ways round", () => {
    const d = deviationOf(rel("same", [leg("k", "K", 0.79, 0.8), leg("p", "P", 0.81, 0.82, 0.0695)]))!;
    expect(d.trade).toBe("sell P:YES at 0.81 · buy K:YES at 0.8");
    expect(d.gross).toBeCloseTo(0.01, 6);
  });

  it("exclusive: all sold at their bids pays out at most a dollar; all bought at their asks pays exactly one where the set is exhaustive", () => {
    const sold = deviationOf(rel("exclusive", [leg("k", "A", 0.44, 0.46), leg("k", "B", 0.44, 0.46), leg("k", "C", 0.29, 0.31)]))!;
    expect(sold.gross).toBeCloseTo(0.17, 6);
    expect(sold.trade).toBe("sell all 3 at their bids (0.44 + 0.44 + 0.29)");
    expect(sold.flagged).toBe(true);
    const bought = deviationOf(rel("exclusive", [leg("k", "A", 0.2, 0.25), leg("k", "B", 0.2, 0.25), leg("k", "C", 0.2, 0.4)], { exhaustive: true }))!;
    expect(bought.gross).toBeCloseTo(0.1, 6);
    expect(bought.trade).toBe("buy all 3 at their asks (0.25 + 0.25 + 0.4)");
    // not known to be exhaustive: only the sale is counted, and here it is no deviation
    expect(deviationOf(rel("exclusive", [leg("k", "A", 0.2, 0.25), leg("k", "B", 0.2, 0.25), leg("k", "C", 0.2, 0.4)]))).toMatchObject({ gross: expect.closeTo(-0.4, 6), flagged: false });
    // a candidate is never priced
    expect(deviationOf(rel("same", [leg("k", "A", 0.9, 0.91), leg("p", "B", 0.1, 0.11)], { candidate: true }))).toBeUndefined();
  });

  it("the scan over the recorded books: the catalogue counted, the flagged first, the rest only when asked, the venues read", () => {
    const all = scanStructure([...kalshi("KXINX", "KXCPI", "KXFEDDECISION", "KXIPOANTHROPIC"), ...pmus("anthropic", "bitcoin")], { now: NOW, all: true, limit: 500 });
    expect(all.contracts).toBe(30 + 19 + 5 + 6 + 7 + 23);
    expect(all.venues).toEqual([{ venue: "kalshi", venueName: "Kalshi", contracts: 60 }, { venue: "polymarket-us", venueName: "Polymarket US", contracts: 30 }]);
    // the S&P ranges, the Fed's decision and the bitcoin price ranges; the Kalshi IPO dates and the Polymarket US IPO dates twice over
    // (the same question at both) and the two bitcoin touches; ladders (CPI 11 + 6, the bitcoin touches 4 + 5 + 1), chains of dates
    // (Kalshi IPO 5, Opus 2, Polymarket US IPO 2, bitcoin 1 + 1) and the shapes across events and venues (5 + 1)
    expect(all.counts).toEqual({ same: 3, implies: 44, exclusive: 3, candidates: 0 });
    expect(all.minNet).toBe("tick");
    // that evening's books: the opus chain is broken (the bid by November 20 above the ask by November 30), but not by a tick after fees
    const opus = all.relations.find((r) => r.legs[0]!.id === "aimc-anthr-opus-gte5pt6-2026-11-20")!;
    expect(opus.deviation).toMatchObject({ gross: expect.closeTo(0.01, 6), flagged: false });
    expect(all.flagged).toBe(0);
    expect(all.relations.map((r) => r.deviation?.net ?? -Infinity)).toEqual([...all.relations.map((r) => r.deviation?.net ?? -Infinity)].sort((a, b) => b - a));
    const few = scanStructure([...kalshi("KXINX"), ...pmus("anthropic")], { now: NOW });
    expect(few.relations).toEqual([]);
    expect(few.notes[1]).toContain("flagged at one tick or more");
    // a book moved: the Polymarket US IPO bid far above the Kalshi ask flags the same question first — and the chains it sits in after it;
    // without `all` the flagged are all there is
    const moved = [...kalshi("KXIPOANTHROPIC"), ...pmus("anthropic")].map((c) => (c.id === "ipcc-anthropic-2026-11-30" ? { ...c, bid: 0.95, ask: 0.96 } : c));
    const hot = scanStructure(moved, { now: NOW });
    expect(hot.flagged).toBeGreaterThanOrEqual(1);
    expect(hot.relations).toHaveLength(hot.flagged);
    expect(hot.relations.every((r) => r.deviation?.flagged && r.legs.some((l) => l.id === "ipcc-anthropic-2026-11-30"))).toBe(true);
    expect(hot.relations[0]).toMatchObject({ kind: "same", legs: [{ id: "KXIPOANTHROPIC-DATE-26DEC01" }, { id: "ipcc-anthropic-2026-11-30" }], deviation: { gross: expect.closeTo(0.15, 6), flagged: true, trade: "sell ipcc-anthropic-2026-11-30:YES at 0.95 · buy KXIPOANTHROPIC-DATE-26DEC01:YES at 0.8" } });
    expect(hot.relations[0]!.deviation!.net).toBeCloseTo(0.15 - 0.0695 * 0.95 * 0.05 - 0.07 * 0.8 * 0.2, 6);
  });
});

describe("a brain's pairings are candidates, never numbers", () => {
  it("what it names among the ids it was shown is listed as a candidate without a deviation; what it was not shown, the same event, or a bad kind is dropped", async () => {
    const cs = [...kalshi("KXIPOANTHROPIC"), ...pmus("anthropic")];
    const asked: Array<{ system: string; input: string }> = [];
    const decide = async (p: { system: string; input: string }) => {
      asked.push(p);
      return JSON.stringify({ pairs: [{ a: "kalshi|KXIPOANTHROPIC-DATE-26DEC01", b: "polymarket-us|apdc-daramo-anthceo-2026-12-31", kind: "implies", why: "a guess" }, { a: "kalshi|KXIPOANTHROPIC-DATE-26DEC01", b: "polymarket-us|ipcc-anthropic-2026-11-30", kind: "same", why: "already known" }, { a: "kalshi|KXIPOANTHROPIC-DATE-26DEC01", b: "kalshi|KXIPOANTHROPIC-DATE-27JAN01", kind: "same", why: "one event" }, { a: "kalshi|NOPE", b: "polymarket-us|ipcc-anthropic-2026-11-30", kind: "same", why: "not shown" }, { a: "kalshi|KXIPOANTHROPIC-DATE-27JAN01", b: "polymarket-us|apdc-daramo-anthceo-2026-12-31", kind: "excludes", why: "no such kind" }] });
    };
    const known = catalogueOf(cs);
    const got = await pairByBrain(cs, decide, known);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.input.split("\n")).toHaveLength(cs.length);
    expect(asked[0]!.input).toContain("polymarket-us|ipcc-anthropic-2026-11-30\tPolymarket US\tAnthropic IPO Officially Confirmed By\tNovember 30, 2026\t");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "implies", how: "brain", candidate: true, why: "a guess", legs: [{ id: "KXIPOANTHROPIC-DATE-26DEC01" }, { id: "apdc-daramo-anthceo-2026-12-31" }] });
    expect("deviation" in got[0]!).toBe(false);
    // in a scan it comes last, still unpriced, and counted as a candidate
    const scan = scanStructure(cs, { now: NOW, all: true, candidates: got });
    expect(scan.counts.candidates).toBe(1);
    expect(scan.relations.at(-1)).toMatchObject({ candidate: true, how: "brain" });
    expect(scan.relations.at(-1)!.deviation).toBeUndefined();
    expect(scan.notes.at(-1)).toBe("A brain's pairings are candidates: listed, never priced, never a lead.");
    // a brain that answers nothing, or not JSON, pairs nothing
    expect(await pairByBrain(cs, async () => "I cannot say")).toEqual([]);
    expect(await pairByBrain(cs, async () => { throw new Error("no key"); })).toEqual([]);
  });
});

describe("the public sources' contracts, over a stand-in network", () => {
  it("Kalshi: every series' open events and each series' own record, as contracts; a series that refuses is left out, every one refusing is the refusal", async () => {
    const net = network([
      ["/trade-api/v2/events?series_ticker=KXINX", json(KALSHI_EVENTS.KXINX)],
      ["/trade-api/v2/events?series_ticker=KXCPI&", json(KALSHI_EVENTS.KXCPI)],
      ["/trade-api/v2/events?series_ticker=KXIPOANTHROPIC", json(KALSHI_EVENTS.KXIPOANTHROPIC)],
      ["/trade-api/v2/events?series_ticker=KXFEDDECISION", json({ error: { code: "service_unavailable", message: "unavailable" } }, 503)],
      ["/trade-api/v2/events", json({ events: [], cursor: "" })],
      ["/trade-api/v2/series/KXINX", json(KALSHI_SERIES.KXINX)],
      ["/trade-api/v2/series/KXCPI", json(KALSHI_SERIES.KXCPI)],
      ["/trade-api/v2/series/KXIPOANTHROPIC", json(KALSHI_SERIES.KXIPOANTHROPIC)],
      ["/trade-api/v2/series/", json({ error: "not found" }, 404)],
    ]);
    const src = kalshiPublic({ http: net.http, clock: () => NOW });
    const got = await src.contracts!();
    if (isRefusal(got)) throw new Error(got.message);
    // in the order of the account's short list of series (categories.ts KALSHI_SERIES)
    expect(got.map((c) => c.event.id).filter((v, i, a) => a.indexOf(v) === i)).toEqual(["KXCPI-26OCT", "KXCPI-26NOV", "KXINX-26NOV06H1600", "KXIPOANTHROPIC-DATE"]);
    expect(got.find((c) => c.id === "KXCPI-26OCT-T0.2")!.fee.maker).toBe(0.25);
    expect(got.every((c) => c.venue === "kalshi" && c.connector === "live:kalshi")).toBe(true);
    // one GET of events and one of the series record a series; a second read answers from what was kept
    const reads = net.sent.filter((s) => s.url.includes("/events?")).length;
    await src.contracts!();
    expect(net.sent.filter((s) => s.url.includes("/events?")).length).toBe(reads);
    const down = kalshiPublic({ http: network([["/trade-api/v2/", json({ error: { code: "service_unavailable", message: "unavailable" } }, 503)]]).http, clock: () => NOW });
    expect(isRefusal(await down.contracts!())).toBe(true);
  });

  it("Polymarket US: its search for each of the questions Kalshi's list is about, each event whole, and its busiest markets as events of their own", async () => {
    const net = network([
      ["/v1/search?query=bitcoin", json(PMUS_SEARCH.bitcoin)],
      ["/v1/search?query=anthropic", json(PMUS_SEARCH.anthropic)],
      ["/v1/search?query=fed", json(PMUS_SEARCH["fed rate"])],
      ["/v1/search", json({ events: [] })],
      ["/v1/markets?active=true", (url: string) => (url.includes("categories=crypto") ? json(PMUS_LIST) : json({ markets: [] }))],
    ]);
    const src = polymarketUsPublic({ http: net.http, clock: () => NOW });
    const got = await src.contracts!();
    if (isRefusal(got)) throw new Error(got.message);
    expect(got.every((c) => c.venue === "polymarket-us" && c.connector === "live:polymarket-us")).toBe(true);
    expect(got.find((c) => c.id === "ipcc-anthropic-2026-11-30")!.event.id).toBe("anthropic");
    // the busiest list's markets the searches brought already are not listed twice
    expect(got.filter((c) => c.id === "cpc-btc-100k-11-30-2026")).toHaveLength(1);
    expect(got.find((c) => c.id === "cpc-btc-100k-11-30-2026")!.event.id).toBe("btc-100k");
    expect(net.sent.filter((s) => s.url.includes("/v1/search")).length).toBe(12);
  });
});
