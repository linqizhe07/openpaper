import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { COMPANY_KEEP_MS, COMPANY_SOURCE, FACTS_KEEP_MS, FAIL_KEEP_MS, pickCompany, pickFinancials, SEC_CONTACT_WORDS, SEC_HOSTS, SEC_TICKERS_URL, secFactsUrl, SecEdgar, secSubmissionsUrl, secUserAgent, TICKERS_KEEP_MS, type Company, type Financials } from "../../src/portfolio/live/edgar.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";
import { AAPL_FACTS, AAPL_SUBMISSIONS, SEC_TICKERS } from "./live-edgar-fixture.ts";
import { json, type Rec } from "./live-public-markets-fixtures.ts";

/** SEC EDGAR, KEYLESS (live/edgar.ts): a US company's own filed figures for the stock drawer — the fiscal years and quarters as filed, with
 * revenue, net income and earnings a share, and the shares outstanding — picked from the SEC's XBRL company facts as it answered them for
 * Apple on 2026-10-22 (the fixture), and read over a stand-in network with the account's user agent: the owner's contact, without which
 * nothing is asked; the SEC's refusals in its own words, each held; the ticker map and the facts kept; the route behind the server's guard.
 * Nothing leaves the process. */
const START = Date.parse("2026-10-22T14:00:00.000Z");
const UA = "openpaper qa@example.com";
const AAPL_CIK = "0000320193";
/** the SEC's own 403 page for a reader without an address in its user agent, as it answered this machine on 2026-10-22 */
const THRESHOLD: HttpReply = { status: 403, body: undefined, text: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head>\n<title>SEC.gov | Request Rate Threshold Exceeded</title>' };

/** a stand-in SEC: GETs answered by URL, each request kept with the headers it carried */
function sec(routes: Array<[string, HttpReply | (() => HttpReply)]>) {
  const sent: Array<{ url: string; headers: Record<string, string> }> = [];
  const http: Http = async (url, init = {}) => {
    sent.push({ url, headers: init.headers ?? {} });
    const hit = routes.find(([k]) => url.includes(k));
    if (!hit) return json({ error: "not found" }, 404);
    return typeof hit[1] === "function" ? hit[1]() : hit[1];
  };
  return { http, sent };
}
const ROUTES = (): Array<[string, HttpReply]> => [["company_tickers.json", json(SEC_TICKERS)], [`CIK${AAPL_CIK}.json`, json(AAPL_FACTS)]];
/** a reader over the stand-in network, behind the same fixed-host guard the service puts it behind, its clock the test's; `userAgent`
 * null is a reader with no contact set */
function reader(net: { http: Http }, clock: () => number, userAgent: string | null = UA) {
  return new SecEdgar({ http: fixedHosts(net.http, SEC_HOSTS, 8_000), clock, userAgent: userAgent ?? undefined });
}
const ok = (r: Financials | Refusal): Financials => {
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
};
const refusal = (r: Financials | Refusal): Refusal => {
  if (!isRefusal(r)) throw new Error(`expected a refusal, got ${r.symbol}`);
  return r;
};

describe("the figures picked from a company's facts (pickFinancials)", () => {
  const f = ok(pickFinancials(AAPL_FACTS, "AAPL", new Date(START).toISOString()));

  it("the fiscal years as the 10-Ks filed them, newest first, each with its revenue, net income and diluted earnings a share", () => {
    expect([f.company, f.cik, f.symbol, f.currency, f.source, f.filingsUrl, f.readAt]).toEqual(["Apple Inc.", AAPL_CIK, "AAPL", "USD", "SEC EDGAR · XBRL company facts", "https://www.sec.gov/edgar/browse/?CIK=320193&owner=exclude", "2026-10-22T14:00:00.000Z"]);
    expect(f.annual.map((p) => p.end)).toEqual(["2025-09-27", "2024-09-28", "2023-09-30"]);
    expect(f.annual[0]).toEqual({ start: "2024-09-29", end: "2025-09-27", days: 363, form: "10-K", filed: "2025-10-31", fy: 2025, fp: "FY", revenue: 416_161_000_000, netIncome: 112_010_000_000, eps: 7.46 });
    expect(f.annual[2]).toMatchObject({ end: "2023-09-30", form: "10-K", fy: 2023, fp: "FY", revenue: 383_285_000_000, netIncome: 96_995_000_000, eps: 6.13 });
  });

  it("the quarters as each 10-Q filed its own — never a year to date, never a fourth quarter worked out — labelled by the filing that first reported them, not a later filing's comparative", () => {
    expect(f.quarterly.map((p) => [p.end, p.fy, p.fp, p.filed])).toEqual([["2026-06-27", 2026, "Q3", "2026-07-31"], ["2026-03-28", 2026, "Q2", "2026-05-01"], ["2025-12-27", 2026, "Q1", "2026-01-30"], ["2025-06-28", 2025, "Q3", "2025-08-01"]]);
    expect(f.quarterly[0]).toEqual({ start: "2026-03-29", end: "2026-06-27", days: 90, form: "10-Q", filed: "2026-07-31", fy: 2026, fp: "Q3", revenue: 109_417_000_000, netIncome: 29_789_000_000, eps: 2.02 });
    // the third quarter of 2025 came again in 2026's third-quarter 10-Q as a comparative, under fy 2026: the row is 2025's own
    expect(f.quarterly[3]).toMatchObject({ start: "2025-03-30", end: "2025-06-28", revenue: 94_036_000_000, fy: 2025, filed: "2025-08-01" });
    // the year to date the same 10-Q carries (2025-09-28 to 2026-06-27, 272 days) is no quarter
    expect(f.quarterly.some((p) => p.days > 100)).toBe(false);
    expect(f.quarterly.some((p) => p.revenue === 364_357_000_000)).toBe(false);
  });

  it("the shares outstanding as the latest cover page says them, which concept each column is, and the latest filing", () => {
    expect(f.shares).toEqual({ value: 14_594_180_000, asOf: "2026-07-17", form: "10-Q", filed: "2026-07-31" });
    // Revenues, the concept Apple stopped filing under in 2018, is not the column: the one with the latest year is
    expect(f.concepts).toEqual({ revenue: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", netIncome: "us-gaap:NetIncomeLoss", eps: "us-gaap:EarningsPerShareDiluted", shares: "dei:EntityCommonStockSharesOutstanding" });
    expect(f.latest).toEqual({ form: "10-Q", filed: "2026-07-31" });
  });

  it("an amendment of the filing that first reported a period wins over it; a later filing's comparative never does; a company with nothing tagged, or an answer with no facts, is a refusal in words", () => {
    const fact = (start: string, end: string, val: number, fy: number, fp: string, form: string, filed: string) => ({ start, end, val, accn: "", fy, fp, form, filed });
    const facts: Rec = {
      cik: 42,
      entityName: "Test Co",
      facts: {
        "us-gaap": {
          Revenues: { label: "Revenues", units: { USD: [fact("2024-01-01", "2024-12-31", 100, 2024, "FY", "10-K", "2025-02-20"), fact("2024-01-01", "2024-12-31", 105, 2024, "FY", "10-K/A", "2025-04-02"), fact("2024-01-01", "2024-12-31", 999, 2025, "FY", "10-K", "2026-02-19"), fact("2025-01-01", "2025-12-31", 130, 2025, "FY", "10-K", "2026-02-19")] } },
          NetIncomeLoss: { label: "Net income", units: { USD: [fact("2025-01-01", "2025-12-31", 13, 2025, "FY", "10-K", "2026-02-19")] } },
        },
      },
    };
    const t = ok(pickFinancials(facts, "TEST", new Date(START).toISOString()));
    expect(t.annual.map((p) => [p.end, p.revenue, p.netIncome, p.form, p.filed])).toEqual([["2025-12-31", 130, 13, "10-K", "2026-02-19"], ["2024-12-31", 105, undefined, "10-K/A", "2025-04-02"]]);
    expect(t.quarterly).toEqual([]);
    expect(t.shares).toBeUndefined();
    expect(t.concepts).toEqual({ revenue: "us-gaap:Revenues", netIncome: "us-gaap:NetIncomeLoss" });
    expect(t.cik).toBe("0000000042");
    const none = refusal(pickFinancials({ cik: 7, entityName: "A Fund", facts: { dei: {} } }, "FUND", ""));
    expect([none.code, none.message]).toEqual(["E_VENUE_REJECTED", "SEC EDGAR has no revenue, income or share figures tagged for A Fund: a fund, a trust, or a company that files no 10-K or 10-Q has none"]);
    expect(refusal(pickFinancials({ hello: "world" }, "X", "")).message).toBe("SEC EDGAR answered in a way this could not read");
    expect(refusal(pickFinancials("<html>", "X", "")).message).toBe("SEC EDGAR answered in a way this could not read");
  });
});

describe("the reader (SecEdgar)", () => {
  it("asks with the account's user agent — its name and the owner's contact — reads the ticker map once and a company's facts once, keeps both, and asks the SEC's spelling of a class share", async () => {
    let t = START;
    const net = sec(ROUTES());
    const r = reader(net, () => t);
    const f = ok(await r.financials("aapl"));
    expect([f.symbol, f.company, f.annual.length, f.quarterly.length]).toEqual(["AAPL", "Apple Inc.", 3, 4]);
    expect(net.sent.map((s) => s.url)).toEqual([SEC_TICKERS_URL, secFactsUrl(AAPL_CIK)]);
    for (const s of net.sent) expect([s.headers["user-agent"], s.headers.accept]).toEqual([UA, "application/json"]);
    // kept: nothing more is asked for the same company, nor for the map
    expect(ok(await r.financials("AAPL")).company).toBe("Apple Inc.");
    expect(net.sent.length).toBe(2);
    // BRK.B is BRK-B at the SEC: its CIK is asked for (the stand-in has no facts for it: the SEC's answer is said as it came)
    const b = refusal(await r.financials("BRK.B"));
    expect(net.sent[2]?.url).toBe(secFactsUrl("0001067983"));
    expect(b.message).toContain("SEC EDGAR");
    // the map is asked again once it is a day old, the facts once they are twelve hours old
    t = START + TICKERS_KEEP_MS + 1;
    ok(await r.financials("AAPL"));
    expect(net.sent.slice(3).map((s) => s.url)).toEqual([SEC_TICKERS_URL, secFactsUrl(AAPL_CIK)]);
    expect(FACTS_KEEP_MS).toBeLessThan(TICKERS_KEEP_MS);
  });

  it("without a contact nothing is asked, and the words say what to set; the user agent is the account's name and the address, or nothing", async () => {
    const net = sec(ROUTES());
    const r = refusal(await reader(net, () => START, null).financials("AAPL"));
    expect([r.code, r.message, net.sent.length]).toEqual(["E_ACCOUNT_CREDENTIAL", SEC_CONTACT_WORDS, 0]);
    expect(secUserAgent({})).toBeUndefined();
    expect(secUserAgent({ SEC_CONTACT: "not an address" })).toBeUndefined();
    expect(secUserAgent({ SEC_CONTACT: " qa@example.com " })).toBe(UA);
  });

  it("a ticker the SEC does not list is said so, in words; one that is not a ticker is refused at the door", async () => {
    const net = sec(ROUTES());
    const r = reader(net, () => START);
    expect(refusal(await r.financials("ZZZZ")).message).toBe("SEC EDGAR lists no company under ZZZZ: a fund, a foreign listing or a very new one has no filings of its own there");
    expect(net.sent.length).toBe(1);
    for (const bad of ["", "AAPL;DROP", "aapl/usd", "TOOLONGTICKER", "0x1"]) expect(refusal(await r.financials(bad)).code).toBe("E_ACCOUNT_BAD_ACTION");
    expect(net.sent.length).toBe(1);
  });

  it("the SEC's own refusals, each in words and each held: the undeclared-reader page, a wait it asked for, no answer at all", async () => {
    let t = START;
    // the 403 page it answers a reader without an address: said as its rule, held a minute, then asked again
    const shut = sec([["company_tickers.json", THRESHOLD]]);
    const r1 = reader(shut, () => t);
    const a = refusal(await r1.financials("AAPL"));
    expect([a.code, a.message]).toEqual(["E_VENUE_REJECTED", "SEC EDGAR turned the request away as an undeclared reader (its fair-access rule): SEC_CONTACT is sent as the account's contact, so set it to an address the SEC can reach"]);
    expect(refusal(await r1.financials("AAPL")).message).toBe(a.message);
    expect(shut.sent.length).toBe(1);
    t = START + FAIL_KEEP_MS + 1;
    refusal(await r1.financials("AAPL"));
    expect(shut.sent.length).toBe(2);
    // a 429 with a wait: held for the wait, not a minute (the wait's end is on the real clock — public-markets.ts rateLimitedNo — so this
    // reader's clock starts from it)
    const real = Date.now();
    t = real;
    const busy = sec([["company_tickers.json", { status: 429, body: undefined, text: "", retryAfterMs: 120_000 }]]);
    const r2 = reader(busy, () => t);
    expect(refusal(await r2.financials("AAPL")).code).toBe("E_VENUE_UNREACHABLE");
    t = real + 61_000;
    refusal(await r2.financials("AAPL"));
    expect(busy.sent.length).toBe(1);
    t = real + 125_000;
    refusal(await r2.financials("AAPL"));
    expect(busy.sent.length).toBe(2);
    // no answer at all (the network threw): could not be reached, held
    const down = { http: (async () => { throw new TypeError("fetch failed"); }) as Http };
    const r3 = reader(down, () => START);
    const d = refusal(await r3.financials("AAPL"));
    expect([d.code, d.message]).toEqual(["E_VENUE_UNREACHABLE", "SEC EDGAR could not be reached"]);
    // the facts refused while the map answered: the map stays kept, the facts are asked again after the hold
    t = START;
    const half = sec([["company_tickers.json", json(SEC_TICKERS)], [`CIK${AAPL_CIK}.json`, { status: 503, body: undefined, text: "" }]]);
    const r4 = reader(half, () => t);
    expect(refusal(await r4.financials("AAPL")).message).toBe("SEC EDGAR did not answer");
    refusal(await r4.financials("AAPL"));
    expect(half.sent.map((s) => s.url)).toEqual([SEC_TICKERS_URL, secFactsUrl(AAPL_CIK)]);
    t = START + FAIL_KEEP_MS + 1;
    refusal(await r4.financials("AAPL"));
    expect(half.sent.map((s) => s.url)).toEqual([SEC_TICKERS_URL, secFactsUrl(AAPL_CIK), secFactsUrl(AAPL_CIK)]);
  });

  it("the fixed-host guard: only the SEC's two hosts, by GET, over https", async () => {
    const net = sec(ROUTES());
    const guarded = fixedHosts(net.http, SEC_HOSTS, 8_000);
    await expect(guarded("https://evil.example/company_tickers.json")).rejects.toThrow("is not asked");
    await expect(guarded("http://www.sec.gov/files/company_tickers.json")).rejects.toThrow("is not asked");
    await expect(guarded(SEC_TICKERS_URL, { method: "POST", body: "{}" })).rejects.toThrow("is not asked");
    expect((await guarded(SEC_TICKERS_URL)).status).toBe(200);
    expect(SEC_HOSTS).toEqual(["www.sec.gov", "data.sec.gov"]);
  });
});

describe("GET /api/account/financials", () => {
  const home = mkdtempSync(join(tmpdir(), "live-edgar-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  it("answers a company's figures behind the server's guard, a refusal in words for a ticker the SEC does not list, and the contact to set where none is", async () => {
    const net = sec(ROUTES());
    const liveDeps = { clock: () => START, http: net.http, price: async () => undefined };
    const svc = await PortfolioService.create({ home: join(home, "a"), venues: "frontline", real: true, liveDeps, publicMarkets: [], sec: { userAgent: UA } });
    const srv = await startPortfolioServer({ port: 0, service: svc });
    try {
      const get = async (path: string, headers: Record<string, string> = {}) => {
        const r = await fetch(`${srv.url}${path}`, { headers });
        return { status: r.status, body: (await r.json().catch(() => ({}))) as Rec };
      };
      const a = await get("/api/account/financials?symbol=aapl");
      expect(a.status).toBe(200);
      expect([a.body.ok, a.body.symbol, a.body.company, (a.body.annual as Array<{ fy: number }>).map((p) => p.fy), (a.body.shares as { value: number }).value]).toEqual([true, "AAPL", "Apple Inc.", [2025, 2024, 2023], 14_594_180_000]);
      // the SEC was asked with the account's user agent, through the guard: its two hosts only
      expect(net.sent.map((s) => [new URL(s.url).host, s.headers["user-agent"]])).toEqual([["www.sec.gov", UA], ["data.sec.gov", UA]]);
      const z = await get("/api/account/financials?symbol=ZZZZ");
      expect([z.status, (z.body.refusal as { message: string }).message]).toEqual([409, "SEC EDGAR lists no company under ZZZZ: a fund, a foreign listing or a very new one has no filings of its own there"]);
      expect((await get("/api/account/financials?symbol=AAPL;x")).status).toBe(409);
      expect((await get("/api/account/financials")).status).toBe(409);
      // another site's page is turned away before the route sees it
      expect((await get("/api/account/financials?symbol=AAPL", { origin: "https://evil.example" })).status).toBe(403);
    } finally {
      await srv.close();
    }
    // a server whose environment names no contact: nothing is asked of the SEC, and the answer says what to set
    const quiet = sec(ROUTES());
    const svc2 = await PortfolioService.create({ home: join(home, "b"), venues: "frontline", real: true, liveDeps: { ...liveDeps, http: quiet.http }, publicMarkets: [], sec: { env: {} } });
    const srv2 = await startPortfolioServer({ port: 0, service: svc2 });
    try {
      const r = await fetch(`${srv2.url}/api/account/financials?symbol=AAPL`);
      expect(r.status).toBe(409);
      expect(((await r.json()) as { refusal: { message: string } }).refusal.message).toBe(SEC_CONTACT_WORDS);
      expect(quiet.sent).toEqual([]);
    } finally {
      await srv2.close();
    }
  });
});

const refusalC = (r: Company | Refusal): Refusal => {
  if (!isRefusal(r)) throw new Error(`expected a refusal, got ${r.name}`);
  return r;
};

describe("the company's record picked from the SEC's submissions file (pickCompany)", () => {
  const c = (() => {
    const r = pickCompany(AAPL_SUBMISSIONS, "AAPL", new Date(START).toISOString());
    if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
    return r;
  })();

  it("who the company is, as the record says: name, tickers, exchange, its SIC and what it means, its fiscal year end in words, where it is incorporated, its sites", () => {
    expect([c.symbol, c.cik, c.name, c.tickers, c.exchanges, c.sic, c.sicDescription, c.category]).toEqual(["AAPL", AAPL_CIK, "Apple Inc.", ["AAPL"], ["Nasdaq"], "3571", "Electronic Computers", "Large accelerated filer"]);
    expect(c.fiscalYearEnd).toEqual({ month: 9, day: 27, words: "September 27" });
    expect([c.stateOfIncorporation, c.stateOfIncorporationWords, c.website, c.investorWebsite]).toEqual(["CA", "CA", "https://www.apple.com", "https://investor.apple.com"]);
    expect([c.source, c.filingsUrl, c.readAt]).toEqual([COMPANY_SOURCE, "https://www.sec.gov/edgar/browse/?CIK=320193&owner=exclude", new Date(START).toISOString()]);
  });

  it("the latest annual and quarterly reports, found past the ten newest filings if need be, each with its document on the SEC's site", () => {
    expect(c.latest.annual).toEqual({ form: "10-K", filed: "2025-10-31", reportDate: "2025-09-27", description: "10-K", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000123/aapl-20250927.htm", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000123/" });
    expect(c.latest.quarterly).toMatchObject({ form: "10-Q", filed: "2026-07-31", reportDate: "2026-06-27" });
  });

  it("the ten newest filings, newest first — an 8-K said by its items in plain words where the record gives no description, a form by its name", () => {
    expect(c.filings).toHaveLength(10);
    expect(c.filings.map((f) => f.form)).toEqual(["8-K", "4", "SC 13G/A", "10-Q", "8-K", "10-Q", "10-Q", "10-K", "8-K", "4"]);
    expect(c.filings[0]).toMatchObject({ form: "8-K", filed: "2026-10-15", description: "8-K", items: ["5.02", "9.01"] });
    expect(c.filings[4]).toMatchObject({ form: "8-K", filed: "2026-07-30", description: "results of operations, exhibits", items: ["2.02", "9.01"] });
    expect(c.filings[2]).toMatchObject({ form: "SC 13G/A", description: "SC 13G/A" });
    expect(c.filings[2]!.reportDate).toBe("2026-08-18");
    expect(c.filings[1]!.reportDate).toBeUndefined();
    for (const f of c.filings) {
      expect(f.url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/\d{18}\/.+$/);
      expect(f.indexUrl).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/\d{18}\/$/);
    }
  });

  it("a foreign filer's 20-F is its annual report; a record with no filings is still a record; a site that is not a web address is left out; junk is a refusal", () => {
    const foreign = pickCompany({ ...AAPL_SUBMISSIONS, name: "Nestlé S.A.", filings: { recent: { accessionNumber: ["0001-26-1"], filingDate: ["2026-03-10"], reportDate: ["2025-12-31"], form: ["20-F"], items: [""], primaryDocument: ["nsrgy-20251231.htm"], primaryDocDescription: ["20-F"] } } }, "NSRGY", "t");
    if (isRefusal(foreign)) throw new Error(foreign.message);
    expect(foreign.latest.annual?.form).toBe("20-F");
    expect(foreign.latest.quarterly).toBeUndefined();
    const bare = pickCompany({ cik: 1, name: "New Co", website: "www.newco.example", fiscalYearEnd: "1301" }, "NEWCO", "t");
    if (isRefusal(bare)) throw new Error(bare.message);
    expect([bare.cik, bare.filings, bare.latest, bare.website, bare.fiscalYearEnd, bare.tickers]).toEqual(["0000000001", [], {}, undefined, undefined, []]);
    const junk = pickCompany({ error: "no" }, "X", "t");
    expect(isRefusal(junk) && junk.code).toBe("E_VENUE_REJECTED");
  });
});

describe("the company's record over the stand-in network (SecEdgar.company)", () => {
  it("asks the ticker map and then the submissions file with the account's user agent, keeps the record an hour, and asks once however many drawers ask", async () => {
    let t = START;
    const net = sec([[`submissions/CIK${AAPL_CIK}.json`, json(AAPL_SUBMISSIONS)], ...ROUTES()]);
    const r = reader(net, () => t);
    const [a, b] = await Promise.all([r.company("aapl"), r.company("AAPL")]);
    expect(isRefusal(a) ? a.code : a.name).toBe("Apple Inc.");
    expect(b).toEqual(a);
    expect(net.sent.map((s) => s.url)).toEqual([SEC_TICKERS_URL, secSubmissionsUrl(AAPL_CIK)]);
    expect(net.sent.every((s) => s.headers["user-agent"] === UA)).toBe(true);
    t += COMPANY_KEEP_MS - 1;
    await r.company("AAPL");
    expect(net.sent).toHaveLength(2);
    t += 2;
    await r.company("AAPL");
    expect(net.sent).toHaveLength(3);
  });

  it("nothing is asked without a contact, a ticker the SEC does not list is refused in its words, and a bad ticker before anything is asked", async () => {
    const net = sec([[`submissions/CIK${AAPL_CIK}.json`, json(AAPL_SUBMISSIONS)], ...ROUTES()]);
    const none = refusalC(await reader(net, () => START, null).company("AAPL"));
    expect([none.code, none.message]).toEqual(["E_ACCOUNT_CREDENTIAL", SEC_CONTACT_WORDS]);
    expect(net.sent).toHaveLength(0);
    const r = reader(net, () => START);
    expect(refusalC(await r.company("ZZZZ")).message).toContain("lists no company under ZZZZ");
    expect(refusalC(await r.company("not a ticker")).code).toBe("E_ACCOUNT_BAD_ACTION");
  });
});
