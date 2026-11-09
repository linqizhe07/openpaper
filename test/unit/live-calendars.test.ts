import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { against, CALENDAR_FAIL_MS, CALENDAR_HOSTS, CALENDAR_KEEP_MS, CALENDAR_PAST_KEEP_MS, CALENDAR_TIMEOUT_MS, figure, NasdaqCalendars, nyDayOf, pickDividends, pickEarnings, pickEconomic, pickIpos, pickSplits, releaseAt, usDay, type CalendarView } from "../../src/portfolio/live/calendars.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";
import { NASDAQ_UA } from "../../src/portfolio/live/us-quotes.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** THE CALENDARS (live/calendars.ts): Nasdaq's calendar pages read keyless a day at a time — the shapes as read on Mon 2026-11-09 (the rows
 * below are those answers, cut to a few), the field named gmt read as New York time, the figures Nasdaq writes as text read as numbers, a
 * day kept a quarter hour and a past day a day, a refusal held, the days of one read asked today first and one at a time, one share's rows
 * alone, and the route. Nothing leaves the process */
const START = Date.parse("2026-11-09T19:00:00Z");
const json = (body: unknown, status = 200): HttpReply => ({ status, body, text: JSON.stringify(body).slice(0, 2000) });
const wrap = (data: unknown) => ({ data, message: null, status: { rCode: 200, bCodeMessage: null, developerMessage: null } });
/** Nasdaq's rows, as answered 2026-11-09 (cut) */
const ECO = wrap({ asOf: "Mon, Nov 9, 2026", rows: [
  { gmt: "18:50", country: "Japan", eventName: "Foreign Reserves (USD)", actual: "1,179.1B", consensus: " ", previous: "1,178.4B", description: "Official reserve assets comprises foreign currency reserves, IMF reserve position, SDRs and gold." },
  { gmt: "19:30", country: "Australia", eventName: "Building Approvals", actual: "-0.80%", consensus: "-0.80%", previous: "12.10%", description: "Building Approvals measures the change in the number of new building approvals issued by the government." },
  { gmt: "08:30", country: "United States", eventName: "Core <b>CPI</b> (MoM)", actual: "0.3%", consensus: "0.2%", previous: "0.3%", description: "" },
  { gmt: "", country: "United States", eventName: "Fed Chair speaks", actual: "", consensus: "", previous: "" },
  { gmt: "10:00", country: "United States", eventName: "", actual: "1", consensus: "2", previous: "3" },
] });
const EARN = wrap({ asOf: "Mon, Nov 9, 2026", rows: [
  { lastYearRptDt: "11/07/2025", lastYearEPS: "$3.04", time: "time-pre-market", symbol: "CEG", name: "Constellation Energy Corporation", marketCap: "$88,559,133,000", fiscalQuarterEnding: "Sep/2026", epsForecast: "$3.90", noOfEsts: "5" },
  { lastYearRptDt: "11/12/2025", lastYearEPS: "$0.99", time: "time-pre-market", symbol: "IX", name: "ORIX Corporation", marketCap: "$37,972,586,000", fiscalQuarterEnding: "Sep/2026", epsForecast: "", noOfEsts: "" },
  { lastYearRptDt: "", lastYearEPS: "($0.12)", time: "time-after-hours", symbol: "zz", name: "A loss maker", marketCap: "", fiscalQuarterEnding: "Sep/2026", epsForecast: "($0.20)", noOfEsts: "2" },
  { time: "time-not-supplied", symbol: "", name: "No symbol" },
] });
const DIV = wrap({ calendar: { asOf: "Mon, Nov 9, 2026", rows: [
  { companyName: "Bankwell Financial Group, Inc. Common Stock", symbol: "BWFG", dividend_Ex_Date: "11/09/2026", payment_Date: "11/20/2026", record_Date: "11/09/2026", dividend_Rate: 0.2, indicated_Annual_Dividend: 0.8, announcement_Date: "10/28/2026" },
  { companyName: "No ex-day", symbol: "XX", dividend_Ex_Date: "N/A", dividend_Rate: 1 },
] } });
const SPLT = wrap({ asOf: "Mon, Nov 9, 2026", rows: [{ symbol: "SNDK", name: "Sandisk Corporation", ratio: "8:1", executionDate: "11/20/2026" }, { symbol: "BITI", name: "ProShares Short Bitcoin ETF", ratio: "1 : 2", executionDate: "11/19/2026" }, { symbol: "", name: "nothing", ratio: "" }] });
const IPO = wrap({
  priced: { asOf: null, rows: [{ dealID: "1390143-118358", proposedTickerSymbol: "NARA", companyName: "Narragansett Bancorp, Inc.", proposedExchange: "NASDAQ Capital", proposedSharePrice: "10.00", sharesOffered: "9,098,800", pricedDate: "11/02/2026", dollarValueOfSharesOffered: "$90,988,000", dealStatus: "Priced" }] },
  upcoming: { upcomingTable: { rows: [{ proposedTickerSymbol: "UPCO", companyName: "Upcoming Co", proposedExchange: "NYSE", proposedSharePrice: "15.00-17.00", sharesOffered: "5,000,000", expectedPriceDate: "11/20/2026", dollarValueOfSharesOffered: "$85,000,000" }] }, lastUpdatedTime: "" },
  filed: { rows: [{ dealID: "1409334-119869", proposedTickerSymbol: null, companyName: "UC Automotive Holdings Inc.", filedDate: "11/06/2026", dollarValueOfSharesOffered: "$28,750,000" }] },
  withdrawn: { rows: [{ dealID: "1326992-116748", proposedTickerSymbol: null, companyName: "DT House Ltd", proposedExchange: null, sharesOffered: "5,000,000", filedDate: "1/20/2026", dollarValueOfSharesOffered: "$31,625,000", withdrawDate: "11/04/2026" }] },
  month: 11, year: 2026, totalResults: 4,
});
const EMPTY = { data: null, message: null, status: { rCode: 400, bCodeMessage: [{ code: 1001, errorMessage: "No data" }], developerMessage: null } };

function network(routes: Record<string, HttpReply | (() => HttpReply | Promise<HttpReply>)>) {
  const sent: Array<{ url: string; headers: Record<string, string> | undefined; at: number }> = [];
  const http: Http = async (url, init) => {
    sent.push({ url, headers: init?.headers, at: Date.now() });
    const key = Object.keys(routes).find((k) => url === k);
    if (!key) return json({ message: `not set up: ${url}` }, 404);
    const r = routes[key]!;
    return typeof r === "function" ? r() : r;
  };
  return { http, sent };
}
const U = "https://api.nasdaq.com/api";
function reader(routes: Record<string, HttpReply | (() => HttpReply | Promise<HttpReply>)>) {
  const net = network(routes);
  let t = START;
  const r = new NasdaqCalendars({ http: fixedHosts(net.http, CALENDAR_HOSTS, CALENDAR_TIMEOUT_MS), clock: () => t });
  return { r, net, tick: (ms: number) => void (t += ms) };
}
const view = (v: CalendarView | Refusal): CalendarView => {
  if (isRefusal(v)) throw new Error(`${v.code}: ${v.message}`);
  return v;
};

describe("the calendars' pickers", () => {
  it("economic releases: the row's gmt is New York time on the row's day, the figures as written, what came out against the consensus where both are figures, markup out of a name; a row with no name is no row", () => {
    const rows = pickEconomic(ECO, "2026-11-09");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ kind: "economic", day: "2026-11-09", at: "2026-11-09T23:50:00.000Z", time: "18:50", country: "Japan", event: "Foreign Reserves (USD)", actual: "1,179.1B", previous: "1,178.4B", description: "Official reserve assets comprises foreign currency reserves, IMF reserve position, SDRs and gold." });
    expect(rows[1]).toMatchObject({ at: "2026-11-10T00:30:00.000Z", actual: "-0.80%", consensus: "-0.80%", against: "same" });
    expect(rows[2]).toMatchObject({ at: "2026-11-09T13:30:00.000Z", event: "Core CPI (MoM)", against: "above" });
    expect(rows[2]!.description).toBeUndefined();
    expect(rows[3]).toEqual({ kind: "economic", day: "2026-11-09", country: "United States", event: "Fed Chair speaks" });
    // the summer: the same wall clock is an hour earlier in UTC
    expect(releaseAt("2026-07-09", "08:30")).toBe("2026-07-09T12:30:00.000Z");
    expect(releaseAt("2026-11-09", "24:00")).toBeUndefined();
    expect(releaseAt("2026-11-09", "")).toBeUndefined();
    expect(releaseAt("not a day", "08:30")).toBeUndefined();
    expect([against("1,179.1B", "1,100B"), against("-0.8%", "-0.5%"), against("3", "3"), against("", "3"), against("n/a", "3")]).toEqual(["above", "below", "same", undefined, undefined]);
  });

  it("earnings: before the open or after the close, the money and the EPS as numbers (a loss in brackets), a dash as nothing, the symbol in capitals; no symbol is no row", () => {
    const rows = pickEarnings(EARN, "2026-11-09");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ kind: "earnings", day: "2026-11-09", symbol: "CEG", name: "Constellation Energy Corporation", when: "pre", marketCapUsd: 88_559_133_000, quarterEnding: "Sep/2026", epsForecast: 3.9, estimates: 5, lastYearDay: "2025-11-07", lastYearEps: 3.04 });
    expect(rows[1]).toEqual({ kind: "earnings", day: "2026-11-09", symbol: "IX", name: "ORIX Corporation", when: "pre", marketCapUsd: 37_972_586_000, quarterEnding: "Sep/2026", lastYearDay: "2025-11-12", lastYearEps: 0.99 });
    expect(rows[2]).toEqual({ kind: "earnings", day: "2026-11-09", symbol: "ZZ", name: "A loss maker", when: "post", quarterEnding: "Sep/2026", epsForecast: -0.2, estimates: 2, lastYearEps: -0.12 });
    expect([figure("$88,559,133,000"), figure("($0.12)"), figure("1,179.1B"), figure("225K"), figure("4.2%"), figure("-0.8%"), figure("N/A"), figure(""), figure("15.00-17.00"), figure(0.2)]).toEqual([88_559_133_000, -0.12, 1_179_100_000_000, 225_000, 4.2, -0.8, undefined, undefined, undefined, 0.2]);
    expect([usDay("11/07/2025"), usDay("1/20/2026"), usDay("2026-11-09"), usDay("13/40/2026"), usDay("")]).toEqual(["2025-11-07", "2026-01-20", undefined, undefined, undefined]);
  });

  it("dividends, splits and IPOs: each row as the page shows it, a row without its day or its symbol left out, the IPO stages in order with each stage's own day", () => {
    expect(pickDividends(DIV, "2026-11-09")).toEqual([{ kind: "dividend", day: "2026-11-09", symbol: "BWFG", name: "Bankwell Financial Group, Inc. Common Stock", exDay: "2026-11-09", paymentDay: "2026-11-20", recordDay: "2026-11-09", announcedDay: "2026-10-28", amount: 0.2, annual: 0.8 }]);
    expect(pickSplits(SPLT, "2026-11-09")).toEqual([{ kind: "split", day: "2026-11-09", symbol: "SNDK", name: "Sandisk Corporation", ratio: "8:1", executionDay: "2026-11-20" }, { kind: "split", day: "2026-11-09", symbol: "BITI", name: "ProShares Short Bitcoin ETF", ratio: "1 : 2", executionDay: "2026-11-19" }]);
    expect(pickIpos(IPO, "2026-11")).toEqual([
      { kind: "ipo", stage: "priced", day: "2026-11-02", symbol: "NARA", name: "Narragansett Bancorp, Inc.", exchange: "NASDAQ Capital", priceUsd: 10, shares: 9_098_800, raisedUsd: 90_988_000 },
      { kind: "ipo", stage: "upcoming", day: "2026-11-20", symbol: "UPCO", name: "Upcoming Co", exchange: "NYSE", shares: 5_000_000, raisedUsd: 85_000_000 },
      { kind: "ipo", stage: "filed", day: "2026-11-06", name: "UC Automotive Holdings Inc.", raisedUsd: 28_750_000 },
      { kind: "ipo", stage: "withdrawn", day: "2026-11-04", name: "DT House Ltd", shares: 5_000_000, raisedUsd: 31_625_000 },
    ]);
    expect(pickEconomic(EMPTY, "2026-11-09")).toEqual([]);
    expect(pickEarnings({}, "2026-11-09")).toEqual([]);
    expect(pickIpos(null, "2026-11")).toEqual([]);
  });
});

describe("the calendars' reader", () => {
  it("one day one GET with a desktop browser's user agent, kept a quarter hour (a past day a day) and asked again after; a day Nasdaq has nothing for is an empty day; every kind at its own address", async () => {
    let calls = 0;
    const { r, net, tick } = reader({
      [`${U}/calendar/economicevents?date=2026-11-09`]: () => (calls++, json(ECO)),
      [`${U}/calendar/economicevents?date=2026-11-08`]: json(EMPTY),
      [`${U}/calendar/earnings?date=2026-11-09`]: json(EARN),
      [`${U}/calendar/dividends?date=2026-11-09`]: json(DIV),
      [`${U}/calendar/splits?date=2026-11-09`]: json(SPLT),
      [`${U}/ipo/calendar?date=2026-11`]: json(IPO),
    });
    expect(nyDayOf(START)).toBe("2026-11-09");
    const v = view(await r.events());
    expect(v).toMatchObject({ kind: "economic", from: "2026-11-09", to: "2026-11-09", total: 4 });
    expect(v.days).toEqual([{ day: "2026-11-09", count: 4, readAt: new Date(START).toISOString() }]);
    expect(net.sent[0]!.headers!["user-agent"]).toBe(NASDAQ_UA);
    // the releases in the day's order by their moment, the undated last
    expect(v.items.map((e) => (e.kind === "economic" ? e.time ?? "—" : ""))).toEqual(["08:30", "18:50", "19:30", "—"]);
    expect(calls).toBe(1);
    tick(CALENDAR_KEEP_MS - 1);
    await r.events();
    expect(calls).toBe(1);
    tick(2);
    await r.events();
    expect(calls).toBe(2);
    // a past day: an empty answer (Nasdaq's own code 400) is a day with nothing, kept a whole day
    const past = view(await r.events({ from: "2026-11-08" }));
    expect(past.items).toEqual([]);
    expect(past.days).toEqual([{ day: "2026-11-08", count: 0, readAt: new Date(START + CALENDAR_KEEP_MS + 1).toISOString() }]);
    expect(past.missing).toEqual([]);
    const before = net.sent.length;
    tick(CALENDAR_PAST_KEEP_MS - 10);
    await r.events({ from: "2026-11-08" });
    expect(net.sent.length).toBe(before);
    for (const [kind, url] of [["earnings", `${U}/calendar/earnings?date=2026-11-09`], ["dividends", `${U}/calendar/dividends?date=2026-11-09`], ["splits", `${U}/calendar/splits?date=2026-11-09`], ["ipos", `${U}/ipo/calendar?date=2026-11`]] as const) {
      // the clock stands a day on by now: the day is named
      const k = view(await r.events({ kind, from: "2026-11-09" }));
      expect(k.kind).toBe(kind);
      expect(k.items.length).toBeGreaterThan(0);
      expect(net.sent.at(-1)!.url).toBe(url);
    }
    expect(view(await r.events({ kind: "ipos", from: "2026-11-09" })).items.map((e) => (e.kind === "ipo" ? e.stage : ""))).toEqual(["priced", "upcoming", "filed", "withdrawn"]);
    expect(view(await r.events({ kind: "earnings", from: "2026-11-09" })).items.map((e) => (e.kind === "earnings" ? e.symbol : ""))).toEqual(["CEG", "IX", "ZZ"]);
  });

  it("several days: asked today first, one at a time and a gap apart, each day said with its count or its refusal; a refusal held a minute at least, a network failure said; the days and the kinds and the share are checked before anything is asked", async () => {
    let mode: "ok" | "429" | "throw" = "ok";
    const { r, net, tick } = reader({
      [`${U}/calendar/earnings?date=2026-11-09`]: json(EARN),
      [`${U}/calendar/earnings?date=2026-11-10`]: () => (mode === "429" ? { status: 429, body: undefined, text: "slow down", retryAfterMs: 120_000 } : mode === "throw" ? Promise.reject(new TypeError("fetch failed")) : json(EARN)),
      [`${U}/calendar/earnings?date=2026-11-08`]: json(EMPTY),
    });
    const v = view(await r.events({ kind: "earnings", from: "2026-11-08", to: "2026-11-10" }));
    expect(net.sent.map((s) => s.url.slice(-10))).toEqual(["2026-11-09", "2026-11-10", "2026-11-08"]);
    expect(net.sent[1]!.at - net.sent[0]!.at).toBeGreaterThanOrEqual(200);
    expect(v.days.map((d) => [d.day, d.count])).toEqual([["2026-11-08", 0], ["2026-11-09", 3], ["2026-11-10", 3]]);
    expect(v.items.map((e) => e.day)).toEqual(["2026-11-09", "2026-11-09", "2026-11-09", "2026-11-10", "2026-11-10", "2026-11-10"]);
    // one share alone
    const ceg = view(await r.events({ kind: "earnings", from: "2026-11-08", to: "2026-11-10", symbol: "ceg" }));
    expect(ceg.symbol).toBe("CEG");
    expect(ceg.items.map((e) => (e.kind === "earnings" ? [e.day, e.symbol] : []))).toEqual([["2026-11-09", "CEG"], ["2026-11-10", "CEG"]]);
    // a refusal: that day says why, the others stand; held two minutes as Nasdaq asked, a minute at least
    mode = "429";
    tick(CALENDAR_KEEP_MS + 1);
    const held = view(await r.events({ kind: "earnings", from: "2026-11-09", to: "2026-11-10" }));
    expect(held.days[1]).toMatchObject({ day: "2026-11-10", count: 0, why: "Nasdaq's calendars is rate-limiting this machine: try again in 2 minutes" });
    expect(held.missing).toEqual([{ venue: "nasdaq-calendar", venueName: "Nasdaq's calendars", why: "2026-11-10: Nasdaq's calendars is rate-limiting this machine: try again in 2 minutes", code: "E_VENUE_UNREACHABLE" }]);
    const n = net.sent.length;
    tick(CALENDAR_FAIL_MS + 1);
    await r.events({ kind: "earnings", from: "2026-11-10" });
    expect(net.sent.length).toBe(n);
    tick(120_000);
    mode = "throw";
    const down = view(await r.events({ kind: "earnings", from: "2026-11-10" }));
    expect(down.missing[0]).toMatchObject({ code: "E_VENUE_UNREACHABLE" });
    r.clear();
    mode = "ok";
    expect(view(await r.events({ kind: "earnings", from: "2026-11-10" })).items).toHaveLength(3);
    // what is refused before anything is asked
    const before = net.sent.length;
    for (const ask of [{ kind: "sports" }, { from: "9 Nov" }, { from: "2026-11-09", to: "2026-11-08" }, { from: "2026-11-01", to: "2026-11-08" }, { symbol: "not a ticker" }, { from: "2026-13-45" }]) {
      const x = (await r.events(ask)) as Refusal;
      expect(x.code, JSON.stringify(ask)).toBe("E_ACCOUNT_BAD_ACTION");
    }
    expect(net.sent.length).toBe(before);
    // the hosts: Nasdaq's API alone
    expect(CALENDAR_HOSTS).toEqual(["api.nasdaq.com"]);
    await expect(fixedHosts(net.http, CALENDAR_HOSTS, 1_000)("https://www.nasdaq.com/x")).rejects.toThrow("is not asked");
  });
});

describe("GET /api/account/calendar", () => {
  const home = mkdtempSync(join(tmpdir(), "calendar-route-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it("answers the reader's view with what was asked, refuses what the reader refuses, and turns another site's page away", async () => {
    const asked: unknown[] = [];
    const svc = await PortfolioService.create({
      home,
      venues: "frontline",
      real: true,
      liveDeps: { http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined },
      readers: {
        calendar: {
          async events(ask) {
            asked.push(ask);
            if (ask?.kind === "sports") return no("E_ACCOUNT_BAD_ACTION", { message: "no such kind" });
            return { asOf: "2026-11-09T19:00:00.000Z", kind: "earnings", from: "2026-11-09", to: "2026-11-09", items: [{ kind: "earnings", day: "2026-11-09", symbol: "CEG", name: "Constellation", when: "pre" }], total: 1, days: [], missing: [], notes: [] };
          },
          clear() {},
        },
      },
    });
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const r = await fetch(`${srv.url}/api/account/calendar?kind=earnings&from=2026-11-09&to=2026-11-11&symbol=ceg&limit=50`);
      expect(r.status).toBe(200);
      const b = (await r.json()) as { ok: boolean; items: Array<{ symbol: string }> };
      expect(b.ok).toBe(true);
      expect(b.items[0]!.symbol).toBe("CEG");
      expect(asked[0]).toEqual({ kind: "earnings", from: "2026-11-09", to: "2026-11-11", symbol: "ceg", limit: 50 });
      expect((await fetch(`${srv.url}/api/account/calendar?kind=sports`)).status).toBe(409);
      expect((await fetch(`${srv.url}/api/account/calendar`)).status).toBe(200);
      expect(asked[2]).toEqual({});
      expect((await fetch(`${srv.url}/api/account/calendar`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});
