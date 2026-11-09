import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import { assemble, ETF_PARTS, nasdaqData, nasdaqSecurity, partUrl, pickDividends, pickForecast, pickInfo, pickInsiders, pickInstitutions, pickPeg, pickProfile, pickRatings, pickShort, pickSummary, pickSurprise, pickTarget, SECURITY_FAIL_MS, SECURITY_HOSTS, SECURITY_KEEP_MS, SECURITY_PARTS, usWords, type SecurityView } from "../../src/portfolio/live/security.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";
import { NASDAQ_UA } from "../../src/portfolio/live/us-quotes.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** A SECURITY'S PAGE (live/security.ts): Nasdaq's twelve pages for one share read into one view — the shapes as read from this machine
 * on 2026-11-09 (the bodies below are those answers, cut) — each picker, Nasdaq's answer envelope, the parts assembled, the reader's
 * twelve GETs with their user agent, an ETF asked once more as one, a part Nasdaq has nothing for named, a refusal held, the view kept, the
 * hosts, and the route. Nothing leaves the process */
const START = Date.parse("2026-11-09T22:17:00Z");
const ok = (data: unknown): HttpReply => ({ status: 200, body: { data, message: null, status: { rCode: 200, bCodeMessage: null, developerMessage: null } }, text: "" });
const none = (): HttpReply => ({ status: 200, body: { data: null, message: null, status: { rCode: 400, bCodeMessage: [{ code: 1001, errorMessage: "Symbol not exists." }], developerMessage: null } }, text: "" });
const lv = (label: string, value: unknown) => ({ label, value });
const INFO = { symbol: "AAPL", companyName: "Apple Inc. Common Stock", stockType: "Common Stock", exchange: "NASDAQ-GS", isNasdaqListed: true, isNasdaq100: true, isHeld: false, primaryData: { lastSalePrice: "$350.80", netChange: "+0.11", percentageChange: "+0.03%", deltaIndicator: "up", lastTradeTimestamp: "Nov 9, 2026 5:13 PM ET", isRealTime: true, bidPrice: "$350.71", askPrice: "$350.99", bidSize: "169", askSize: "12", volume: "47,513,300.700045", currency: null }, secondaryData: { lastSalePrice: "$350.69", netChange: "+8.32", percentageChange: "+2.43%", deltaIndicator: "up", lastTradeTimestamp: "Closed at Nov 9, 2026 4:00 PM ET", isRealTime: true, bidPrice: "", askPrice: "", bidSize: "", askSize: "", volume: "", currency: null }, marketStatus: "After-Hours", assetClass: "STOCKS" };
const SUMMARY = { symbol: "AAPL", summaryData: { Exchange: lv("Exchange", "NASDAQ-GS"), Sector: lv("Sector", "Technology"), Industry: lv("Industry", "Computer Manufacturing"), OneYrTarget: lv("1 Year Target", "$350.00"), TodayHighLow: lv("Today's High/Low", "$352.28/$344.78"), ShareVolume: lv("Share Volume", "47,512,996.933697"), AverageVolume: lv("Average Volume", "43,273,285"), PreviousClose: lv("Previous Close", "$342.37"), FiftTwoWeekHighLow: lv("52 Week High/Low", "$355.38/$243.42"), MarketCap: lv("Market Cap", "5,096,290,905,580"), AnnualizedDividend: lv("Annualized Dividend", "$1.08"), ExDividendDate: lv("Ex Dividend Date", "Aug 10, 2026"), DividendPaymentDate: lv("Dividend Pay Date", "Aug 13, 2026"), Yield: lv("Current Yield", "0.32%") }, assetClass: "STOCKS" };
const PROFILE = { CompanyName: lv("Company Name", "Apple Inc."), Symbol: lv("Symbol", "AAPL"), Address: lv("Address", null), Industry: lv("Industry", "Computer Manufacturing"), Sector: lv("Sector", "Technology"), Region: lv("Region", "North America"), CompanyDescription: lv("Company Description", "Apple revolutionized personal technology with the introduction of the Macintosh in 1984.") };
const DIVIDENDS = { dividendHeaderValues: [lv("Ex-Dividend Date", "08/10/2026"), lv("Dividend Yield", "0.32%"), lv("Annual Dividend", "$1.08"), lv("P/E Ratio", "39.1")], exDividendDate: "08/10/2026", dividendPaymentDate: "08/13/2026", yield: "0.32%", annualizedDividend: "1.08", payoutRatio: "39.1", dividends: { asOf: null, headers: {}, rows: [{ exOrEffDate: "11/12/2026", type: "Cash", amount: "$0.27", declarationDate: "11/02/2026", recordDate: "11/12/2026", paymentDate: "11/16/2026", currency: "USD" }, { exOrEffDate: "08/10/2026", type: "Cash", amount: "$0.27", declarationDate: "07/30/2026", recordDate: "08/10/2026", paymentDate: "08/13/2026", currency: "USD" }] } };
const SHORT = { symbol: "aapl", shortInterestTable: { headers: {}, rows: [{ settlementDate: "10/15/2026", interest: "131,591,865", avgDailyShareVolume: "35,498,663", daysToCover: 3.706953 }, { settlementDate: "09/30/2026", interest: "120,763,539", avgDailyShareVolume: "39,858,260", daysToCover: 3.029825 }] } };
const RATINGS = { symbol: "aapl", meanRatingType: "Hold", ratingsSummary: "Based on 29 analysts offering recommendations for 'AAPL'.", upgradesDowngrades: [], brokerNames: ["B OF A GLBL RES", "BAIRD R W"] };
const TARGET = { symbol: "aapl", consensusOverview: { lowPriceTarget: 250, highPriceTarget: 400, priceTarget: 338.28, buy: 15, sell: 6, hold: 8 }, historicalConsensus: [{ z: { buy: 18, hold: 12, sell: 2, date: "11/01/2025", consensus: "Buy", latest: null }, x: 1761955200, y: 270.37 }, { z: { buy: 15, hold: 8, sell: 6, date: "11/01/2026", consensus: "Buy", latest: { high: 349.19, avg: 341.77, low: 334.35 } }, x: 1793491200, y: 338.28 }] };
const SURPRISE = { symbol: "aapl", chart: [], earningsSurpriseTable: { headers: {}, rows: [{ fiscalQtrEnd: "Sep 2026", dateReported: "11/2/2026", eps: 2.05, consensusForecast: "1.98", percentageSurprise: "3.54" }, { fiscalQtrEnd: "Jun 2026", dateReported: "7/30/2026", eps: 1.91, consensusForecast: "1.88", percentageSurprise: "1.6" }] } };
const FORECAST = { symbol: "aapl", quarterlyForecast: { asOf: null, headers: {}, rows: [{ fiscalEnd: "Dec 2026", consensusEPSForecast: 2.94, highEPSForecast: 3.18, lowEPSForecast: 2.86, noOfEstimates: 9, up: 4, down: 1 }] }, yearlyForecast: { asOf: null, headers: {}, rows: [{ fiscalEnd: "Sep 2027", consensusEPSForecast: 9.68, highEPSForecast: 11.04, lowEPSForecast: 8.89, noOfEstimates: 12, up: 4, down: 6 }] } };
const PEG = { pegr: { label: "Forecast 12 Month Forward PEG Ratio", text: "…", pegValue: 3.29 }, per: { peRatioChart: [{ x: "2026 Actual", y: 39.76 }, { x: "2027 Estimates", y: 36.23 }], label: "Price/Earnings Ratio", text: "…" }, gr: { peGrowthChart: [{ z: "Growth", x: "2027", y: 9.73 }, { z: "Growth", x: "2028", y: 11.96 }, { z: "P/E Ratios", x: "2027", y: 36.23 }], title: "Forecast P/E Growth Rates" } };
const INSIDER = { title: null, numberOfTrades: { rows: [{ insiderTrade: "Number of Open Market Buys", months3: "0", months12: "0" }, { insiderTrade: "Number of Sells", months3: "26", months12: "45" }, { insiderTrade: "Total Insider Trades", months3: "26", months12: "45" }] }, numberOfSharesTraded: { rows: [{ insiderTrade: "Number of Shares Bought", months3: "0", months12: "0" }, { insiderTrade: "Number of Shares Sold", months3: "694,883", months12: "1,356,455" }, { insiderTrade: "Total Shares Traded", months3: "694,883", months12: "1,356,455" }, { insiderTrade: "Net Activity", months3: "(694,883)", months12: "(1,356,455)" }] }, transactionTable: { totalRecords: "117", table: { headers: {}, rows: [{ insider: "NEWSTEAD JENNIFER", relation: "Officer", lastDate: "11/03/2026", transactionType: "Automatic Sell", ownType: "Direct", sharesTraded: "2,399", lastPrice: "$325.75", sharesHeld: "29,997", url: "/market-activity/insiders/newstead-jennifer-1089520" }] } } };
const INST = { ownershipSummary: { SharesOutstandingPCT: lv("Institutional Ownership", "76.93%"), ShareoutstandingTotal: lv("Total Shares Outstanding (millions)", "14,532"), TotalHoldingsValue: lv("Total Value of Holdings (millions)", "$3,827,766") }, activePositions: { rows: [{ positions: "Increased Positions", holders: "2,762", shares: "320,927,686" }, { positions: "Decreased Positions", holders: "3,313", shares: "224,132,119" }, { positions: "Held Positions", holders: "399", shares: "10,635,144,123" }, { positions: "Total Institutional Shares", holders: "6,474", shares: "11,180,203,928" }] }, newSoldOutPositions: { rows: [{ positions: "New Positions", holders: "186", shares: "33,946,350" }, { positions: "Sold Out Positions", holders: "87", shares: "12,867,403" }] }, holdingsTransactions: { table: { headers: {}, rows: [{ ownerName: "Vanguard Group Inc", date: "12/31/2025", sharesHeld: "1,426,283,914", sharesChange: "26,856,752", sharesChangePCT: "1.919%", marketValue: "$488,316,824", url: "/x" }, { ownerName: "Blackrock, Inc.", date: "6/30/2026", sharesHeld: "1,162,996,939", sharesChange: "-1,301,514", sharesChangePCT: "-0.112%", marketValue: "$398,175,262" }] } } };
const PAGES: Record<string, unknown> = { info: INFO, summary: SUMMARY, profile: PROFILE, dividends: DIVIDENDS, short: SHORT, ratings: RATINGS, target: TARGET, surprise: SURPRISE, forecast: FORECAST, peg: PEG, insider: INSIDER, institutions: INST };
const view = (v: SecurityView | Refusal): SecurityView => {
  if (isRefusal(v)) throw new Error(`${v.code}: ${v.message}`);
  return v;
};

describe("the pickers, one a page", () => {
  it("the quote page: the name, the kind, the exchange, the Nasdaq-100, the last sale with its sign read, the stamp as written, the close apart after hours", () => {
    const i = pickInfo(INFO);
    expect(i).toEqual({ name: "Apple Inc. Common Stock", stockType: "Common Stock", exchange: "NASDAQ-GS", nasdaq100: true, quote: { last: 350.8, change: 0.11, changePct: 0.03, at: "Nov 9, 2026 5:13 PM ET", bid: 350.71, ask: 350.99, volume: 47513301, marketStatus: "After-Hours", realTime: true, close: 350.69, closeChange: 8.32, closeChangePct: 2.43 } });
    const open = pickInfo({ ...INFO, marketStatus: "Open", primaryData: { ...INFO.primaryData, netChange: "-0.42", percentageChange: "-0.12%" } });
    expect(open.quote.change).toBe(-0.42);
    expect(open.quote.close).toBeUndefined();
    expect(pickInfo({}).quote).toEqual({});
  });

  it("the summary page: every value a string read into a figure, the ranges split low and high, the dates as days; the profile; the dividends with the header's payout and P/E; the short interest", () => {
    const s = pickSummary(SUMMARY);
    expect(s).toEqual({ exchange: "NASDAQ-GS", sector: "Technology", industry: "Computer Manufacturing", stats: { previousClose: 342.37, dayLow: 344.78, dayHigh: 352.28, week52Low: 243.42, week52High: 355.38, volume: 47512997, averageVolume: 43273285, marketCapUsd: 5096290905580, annualDividend: 1.08, dividendYieldPct: 0.32, exDividend: "2026-08-10", payDate: "2026-08-13", oneYearTarget: 350 } });
    expect(pickSummary({ summaryData: { Sector: lv("Sector", "N/A"), TodayHighLow: lv("x", "N/A") } })).toEqual({ stats: {} });
    expect(usWords("Aug 10, 2026")).toBe("2026-08-10");
    expect(usWords("Sept 3, 2026")).toBe("2026-09-03");
    expect(usWords("08/10/2026")).toBe("2026-08-10");
    expect(usWords("soon")).toBeUndefined();
    expect(pickProfile(PROFILE)).toEqual({ description: "Apple revolutionized personal technology with the introduction of the Macintosh in 1984.", sector: "Technology", industry: "Computer Manufacturing", region: "North America", name: "Apple Inc." });
    const d = pickDividends(DIVIDENDS);
    expect(d.rows).toEqual([{ exDate: "2026-11-12", type: "Cash", amount: 0.27, declared: "2026-11-02", record: "2026-11-12", payment: "2026-11-16" }, { exDate: "2026-08-10", type: "Cash", amount: 0.27, declared: "2026-07-30", record: "2026-08-10", payment: "2026-08-13" }]);
    expect([d.payoutRatioPct, d.peRatio, d.yieldPct, d.annual]).toEqual([39.1, 39.1, 0.32, 1.08]);
    expect(pickShort(SHORT)).toEqual([{ settlement: "2026-10-15", shares: 131591865, avgDailyVolume: 35498663, daysToCover: 3.71 }, { settlement: "2026-09-30", shares: 120763539, avgDailyVolume: 39858260, daysToCover: 3.03 }]);
  });

  it("the analysts: the rating and the count from the sentence, the targets and the counts, a year of history by month; the earnings: the surprises, the quarters and years ahead, the PEG (none where Nasdaq writes 0), the P/E and the growth", () => {
    expect(pickRatings(RATINGS)).toEqual({ rating: "Hold", summary: "Based on 29 analysts offering recommendations for 'AAPL'.", count: 29 });
    expect(pickRatings({ meanRatingType: "", ratingsSummary: "Consensus information is not available for this symbol", brokerNames: [] })).toEqual({ summary: "Consensus information is not available for this symbol" });
    expect(pickTarget(TARGET)).toEqual({ targetLow: 250, targetMean: 338.28, targetHigh: 400, buy: 15, hold: 8, sell: 6, history: [{ month: "2025-11", buy: 18, hold: 12, sell: 2, consensus: "Buy", target: 270.37 }, { month: "2026-11", buy: 15, hold: 8, sell: 6, consensus: "Buy", target: 338.28 }] });
    expect(pickSurprise(SURPRISE)).toEqual([{ quarter: "Sep 2026", reported: "2026-11-02", eps: 2.05, consensus: 1.98, surprisePct: 3.54 }, { quarter: "Jun 2026", reported: "2026-07-30", eps: 1.91, consensus: 1.88, surprisePct: 1.6 }]);
    expect(pickForecast(FORECAST)).toEqual({ quarters: [{ period: "Dec 2026", consensus: 2.94, high: 3.18, low: 2.86, estimates: 9, revisionsUp: 4, revisionsDown: 1 }], years: [{ period: "Sep 2027", consensus: 9.68, high: 11.04, low: 8.89, estimates: 12, revisionsUp: 4, revisionsDown: 6 }] });
    expect(pickPeg(PEG)).toEqual({ forwardPeg: 3.29, pe: [{ period: "2026 Actual", value: 39.76 }, { period: "2027 Estimates", value: 36.23 }], growth: [{ period: "2027", value: 9.73 }, { period: "2028", value: 11.96 }] });
    expect(pickPeg({ pegr: { pegValue: 0 }, per: {}, gr: {} })).toEqual({ pe: [], growth: [] });
  });

  it("the insiders: the counts over three and twelve months (a bracketed net read as negative) and the latest trades; the institutions: the share held, the positions, the largest holders with the value Nasdaq writes in thousands read in dollars and a fall read with its sign", () => {
    const n = pickInsiders(INSIDER);
    expect(n).toEqual({ buys3m: 0, sells3m: 26, buys12m: 0, sells12m: 45, bought3m: 0, sold3m: 694883, bought12m: 0, sold12m: 1356455, net3m: -694883, net12m: -1356455, trades: [{ insider: "NEWSTEAD JENNIFER", relation: "Officer", date: "2026-11-03", type: "Automatic Sell", ownType: "Direct", shares: 2399, price: 325.75, held: 29997 }] });
    const i = pickInstitutions(INST);
    expect(i).toEqual({ pct: 76.93, sharesOutstandingM: 14532, valueM: 3827766, increased: { holders: 2762, shares: 320927686 }, decreased: { holders: 3313, shares: 224132119 }, held: { holders: 399, shares: 10635144123 }, total: { holders: 6474, shares: 11180203928 }, opened: { holders: 186, shares: 33946350 }, soldOut: { holders: 87, shares: 12867403 }, holders: [{ name: "Vanguard Group Inc", date: "2025-12-31", shares: 1426283914, change: 26856752, changePct: 1.919, valueUsd: 488316824000 }, { name: "Blackrock, Inc.", date: "2026-06-30", shares: 1162996939, change: -1301514, changePct: -0.112, valueUsd: 398175262000 }] });
  });

  it("Nasdaq's envelope: the data where it answers, nothing where it says the symbol does not exist or writes data null, its own words as a refusal elsewhere; every part's address, an ETF's under its own asset class", () => {
    expect(nasdaqData(ok({ a: 1 }), "info")).toEqual({ a: 1 });
    expect(nasdaqData(none(), "info")).toBeUndefined();
    expect(nasdaqData({ status: 200, body: { data: null, status: { rCode: 200 } }, text: "" }, "peg")).toBeUndefined();
    const r = nasdaqData({ status: 200, body: { data: null, status: { rCode: 400, bCodeMessage: [{ code: 2, errorMessage: "Rate limited" }] } }, text: "" }, "peg");
    expect(isRefusal(r) && r.message).toBe("Nasdaq answered for peg: Rate limited");
    expect(isRefusal(nasdaqData({ status: 200, body: { data: [1, 2], status: { rCode: 200 } }, text: "" }, "peg"))).toBe(true);
    expect(partUrl("info", "AAPL", "stock")).toBe("https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks");
    expect(partUrl("summary", "SPY", "etf")).toBe("https://api.nasdaq.com/api/quote/SPY/summary?assetclass=etf");
    expect(partUrl("short", "AAPL", "stock")).toBe("https://api.nasdaq.com/api/quote/AAPL/short-interest?assetClass=stocks");
    expect(partUrl("institutions", "AAPL", "stock")).toBe("https://api.nasdaq.com/api/company/AAPL/institutional-holdings?limit=15&type=TOTAL&sortColumn=marketValue");
    expect(SECURITY_PARTS).toHaveLength(12);
    expect(ETF_PARTS).toEqual(["info", "summary", "dividends", "short"]);
  });

  it("the parts assembled: the name from the quote page, the sector from the profile over the summary's, the figures of the summary, the dividends' payout and P/E, the PEG, the institutions' share and shares outstanding in one `stats`; what is missing named", () => {
    const parts = Object.fromEntries(SECURITY_PARTS.map((p) => [p, PAGES[p]])) as Parameters<typeof assemble>[2];
    const v = assemble("AAPL", "stock", parts, [{ part: "peg", why: "x" }], START, START - 2000);
    expect(v).toMatchObject({ asOf: "2026-11-09T22:17:00.000Z", readAt: "2026-11-09T22:16:58.000Z", symbol: "AAPL", kind: "stock", name: "Apple Inc. Common Stock", stockType: "Common Stock", exchange: "NASDAQ-GS", sector: "Technology", industry: "Computer Manufacturing", region: "North America", nasdaq100: true, from: "Nasdaq · as written" });
    expect(v.stats).toEqual({ previousClose: 342.37, dayLow: 344.78, dayHigh: 352.28, week52Low: 243.42, week52High: 355.38, volume: 47512997, averageVolume: 43273285, marketCapUsd: 5096290905580, annualDividend: 1.08, dividendYieldPct: 0.32, exDividend: "2026-08-10", payDate: "2026-08-13", oneYearTarget: 350, payoutRatioPct: 39.1, peRatio: 39.1, forwardPeg: 3.29, institutionalPct: 76.93, sharesOutstanding: 14532000000 });
    expect(v.analysts).toMatchObject({ rating: "Hold", count: 29, targetMean: 338.28, buy: 15 });
    expect(v.earnings!.surprises).toHaveLength(2);
    expect(v.insiders!.trades).toHaveLength(1);
    expect(v.institutions!.holders).toHaveLength(2);
    expect(v.parts).toEqual([...SECURITY_PARTS]);
    expect(v.missing).toEqual([{ part: "peg", why: "x" }]);
    expect(v.notes).toHaveLength(2);
    const etf = assemble("SPY", "etf", { info: { companyName: "SPDR", primaryData: { lastSalePrice: "$753.29" } } }, [], START, START);
    expect(etf).toMatchObject({ kind: "etf", name: "SPDR", quote: { last: 753.29 }, stats: {}, dividends: [], shortInterest: [], parts: ["info"] });
    expect(etf.analysts).toBeUndefined();
    expect(etf.earnings).toBeUndefined();
  });
});

function network(answer: (url: string) => HttpReply | undefined) {
  const sent: Array<{ url: string; ua: string | undefined; at: number }> = [];
  let t = START;
  const http: Http = async (url, init) => {
    sent.push({ url, ua: init?.headers?.["user-agent"], at: Date.now() });
    const r = answer(url);
    return r ?? { status: 404, body: undefined, text: "" };
  };
  return { http, sent, clock: () => t, tick: (ms: number) => void (t += ms) };
}
const partOf = (url: string): string | undefined => SECURITY_PARTS.find((p) => url === partUrl(p, "AAPL", "stock") || url === partUrl(p, "SPY", "etf") || url === partUrl(p, "SPY", "stock") || url === partUrl(p, "ZZZZ", "stock") || url === partUrl(p, "ZZZZ", "etf"));

describe("the reader", () => {
  it("reads a share's twelve pages with the desktop browser's user agent into one view, kept five minutes and asked again after; an ETF's quote page asked under its own asset class and its four parts alone; a part Nasdaq has nothing for named and the rest shown; a ticker that is none refused before anything is asked; a symbol Nasdaq lists under neither class refused and held", async () => {
    const net = network((url) => {
      const part = partOf(url);
      if (!part) return undefined;
      if (url.includes("/ZZZZ/")) return none();
      if (url.includes("/SPY/")) return url.includes("assetclass=etf") || part === "short" ? (part === "short" ? none() : ok({ ...INFO, companyName: "State Street SPDR S&P 500 ETF Trust", isNasdaq100: false })) : none();
      if (part === "peg") return none();
      if (part === "insider") return { status: 200, body: { data: null, status: { rCode: 400, bCodeMessage: [{ code: 2, errorMessage: "Please slow down" }] } }, text: "" };
      return ok(PAGES[part]);
    });
    const d = nasdaqSecurity({ http: net.http, clock: net.clock });
    (d as unknown as { gapMs: number }).gapMs = 0;
    const v = view(await d.security(" aapl "));
    expect(v.symbol).toBe("AAPL");
    expect(v.parts).toEqual(SECURITY_PARTS.filter((p) => p !== "peg" && p !== "insider"));
    expect(v.missing).toEqual([{ part: "peg", why: "Nasdaq has no PEG and P/E for AAPL" }, { part: "insider", why: "Nasdaq answered for insider: Please slow down", code: "E_VENUE_REJECTED" }]);
    expect(v.stats.forwardPeg).toBeUndefined();
    expect(v.insiders).toBeUndefined();
    expect(v.institutions!.pct).toBe(76.93);
    expect(net.sent).toHaveLength(12);
    expect(net.sent.every((s) => s.ua === NASDAQ_UA)).toBe(true);
    expect(net.sent.every((s) => new URL(s.url).hostname === "api.nasdaq.com")).toBe(true);
    expect(net.sent[0]!.url).toBe(partUrl("info", "AAPL", "stock"));
    // kept
    await d.security("AAPL");
    expect(net.sent).toHaveLength(12);
    net.tick(SECURITY_KEEP_MS + 1);
    await d.security("AAPL");
    expect(net.sent).toHaveLength(24);
    // an ETF: the share's quote page says it does not exist, the ETF's answers; then its four parts only
    const spy = view(await d.security("SPY"));
    expect(spy.kind).toBe("etf");
    expect(spy.name).toBe("State Street SPDR S&P 500 ETF Trust");
    expect(spy.parts).toEqual(["info", "summary", "dividends"]);
    expect(spy.missing).toEqual([{ part: "short", why: "Nasdaq has no short interest for SPY" }]);
    const spyUrls = net.sent.slice(24).map((s) => s.url);
    expect(spyUrls[0]).toBe(partUrl("info", "SPY", "stock"));
    expect(spyUrls[1]).toBe(partUrl("info", "SPY", "etf"));
    expect(spyUrls).toHaveLength(5);
    expect(spyUrls.some((u) => u.includes("analyst"))).toBe(false);
    // checked before anything is asked
    for (const bad of ["", "not a ticker", "../x", "AAPL;", "TOOLONGX"]) {
      const r = await d.security(bad);
      expect(isRefusal(r) && r.code, bad).toBe("E_ACCOUNT_BAD_ACTION");
    }
    expect(net.sent).toHaveLength(29);
    // listed under neither class: refused, and held a minute
    const zz = await d.security("ZZZZ");
    expect(isRefusal(zz) && zz.message).toBe("Nasdaq lists no share or ETF named ZZZZ");
    expect(net.sent).toHaveLength(31);
    await d.security("ZZZZ");
    expect(net.sent).toHaveLength(31);
    net.tick(SECURITY_FAIL_MS + 1);
    await d.security("ZZZZ");
    expect(net.sent).toHaveLength(33);
    d.clear();
  });

  it("the hosts: Nasdaq through the fixed-host guard, nothing elsewhere; the network failing is said", async () => {
    expect(SECURITY_HOSTS).toEqual(["api.nasdaq.com"]);
    const spy: Http = async () => ({ status: 200, body: {}, text: "" });
    await expect(fixedHosts(spy, SECURITY_HOSTS, 1_000)("https://www.nasdaq.com/x")).rejects.toThrow("is not asked");
    const down = nasdaqSecurity({ http: async () => { throw new Error("ECONNRESET"); } });
    const r = await down.security("AAPL");
    expect(isRefusal(r) && r.code).toBe("E_VENUE_UNREACHABLE");
  });
});

describe("GET /api/account/security", () => {
  const home = mkdtempSync(join(tmpdir(), "security-route-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it("answers the reader's view for the symbol asked, refuses what the reader refuses and a missing symbol, and turns another site's page away", async () => {
    const asked: string[] = [];
    const parts = Object.fromEntries(SECURITY_PARTS.map((p) => [p, PAGES[p]])) as Parameters<typeof assemble>[2];
    const svc = await PortfolioService.create({
      home,
      venues: "frontline",
      real: true,
      liveDeps: { http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined },
      readers: {
        security: {
          async security(symbol) {
            asked.push(symbol);
            if (!symbol) return no("E_ACCOUNT_BAD_ACTION", { message: "a ticker is needed" });
            if (symbol === "ZZZZ") return no("E_VENUE_REJECTED", { message: "Nasdaq lists no share or ETF named ZZZZ" });
            return assemble(symbol, "stock", parts, [], START, START);
          },
          clear() {},
        },
      },
    });
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const r = await fetch(`${srv.url}/api/account/security?symbol=AAPL`);
      expect(r.status).toBe(200);
      const b = (await r.json()) as { ok: boolean; symbol: string; parts: string[]; analysts: { count: number } };
      expect([b.ok, b.symbol, b.parts.length, b.analysts.count]).toEqual([true, "AAPL", 12, 29]);
      expect(asked).toEqual(["AAPL"]);
      expect((await fetch(`${srv.url}/api/account/security?symbol=ZZZZ`)).status).toBe(409);
      expect((await fetch(`${srv.url}/api/account/security`)).status).toBe(409);
      expect(asked[2]).toBe("");
      expect((await fetch(`${srv.url}/api/account/security?symbol=AAPL`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});
