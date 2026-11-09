/** A SECURITY'S OWN PAGE, KEYLESS: what Nasdaq's pages for one US share say of it — the description, the key figures, the analysts, the
 * earnings, the dividends, the short interest, the holders — read into one view, as a terminal's DES · ANR · EE · DVD · SI · HDS. Every
 * figure is Nasdaq's as written; nothing is estimated or rated here. The account's own quote of the share is the Markets page's; Nasdaq's
 * last sale is carried beside it, said as Nasdaq's.
 *
 *   The pages of api.nasdaq.com (the host of the calendars and the real-time quotes, read with the same desktop browser user agent), each
 *   verified from this machine on 2026-11-09 (64 ms – 1.3 s each; AAPL's twelve together under two seconds in a paced line):
 *   /api/quote/{SYM}/info?assetclass=stocks           the company's name, its stock type, the exchange, isNasdaq100, the market status,
 *                                                       primaryData (last sale, change, the stamp "Nov 9, 2026 5:13 PM ET", bid, ask,
 *                                                       volume) and secondaryData (the close, after hours); an ETF answers only under
 *                                                       assetclass=etf (SPY), so an info that says "Symbol not exists" is asked once more as one
 *   /api/quote/{SYM}/summary?assetclass=stocks        summaryData: exchange, sector, industry, the one-year target, today's high/low, share
 *                                                       volume, average volume, previous close, the 52-week high/low, market cap, the
 *                                                       annualized dividend, ex-dividend and pay dates, the yield — every value a string
 *   /api/company/{SYM}/company-profile                 the description, sector, industry, region
 *   /api/quote/{SYM}/dividends?assetclass=stocks      the header (yield, annual, payout ratio) and every dividend paid (AAPL: 84 rows):
 *                                                       ex date, type, amount, declaration, record and payment dates
 *   /api/quote/{SYM}/short-interest?assetClass=stocks  each settlement's short interest, average daily volume and days to cover
 *   /api/analyst/{SYM}/ratings                        the mean rating and how many analysts stand behind it
 *   /api/analyst/{SYM}/targetprice                    the consensus target (low, mean, high) with buy / hold / sell counts, and a year of
 *                                                       monthly consensus history
 *   /api/company/{SYM}/earnings-surprise              the last quarters: fiscal quarter, date reported, EPS, consensus, surprise
 *   /api/analyst/{SYM}/earnings-forecast              the quarters and years ahead: consensus, high, low, estimates, revisions up and down
 *   /api/analyst/{SYM}/peg-ratio                      the forward PEG, the P/E actual and estimated by year, the growth rates
 *   /api/company/{SYM}/insider-trades                 the counts of trades and shares over three and twelve months, and the latest trades
 *   /api/company/{SYM}/institutional-holdings         the institutional share, the shares outstanding, the holders who increased, decreased,
 *                                                       held, opened and sold out, and the largest holders by value
 *   Nasdaq answers {data, status: {rCode}}; a part it has nothing for answers data null (or rCode 400 "Symbol not exists."): that part is
 *   left out and said in `missing`, the rest shown. An ETF has no profile, analysts, earnings or holders here: those parts are not asked.
 * Every GET goes through the fixed-host guard (SECURITY_HOSTS). A view is kept five minutes, a refusal a minute at least (holdBackMs);
 * the calls of one read go three at a time, a quarter second apart, so the quotes on the same host are not crowded */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { figure, usDay } from "./calendars.ts";
import { fin, fixedHosts, holdBackMs, isRec, list, publicNo, rec, str } from "./public-markets.ts";
import { type Http, type HttpReply, unreachable } from "./types.ts";
import { NASDAQ_UA } from "./us-quotes.ts";

export const SECURITY_HOSTS: readonly string[] = ["api.nasdaq.com"];
export const SECURITY_KEEP_MS = 300_000;
export const SECURITY_FAIL_MS = 60_000;
export const SECURITY_TIMEOUT_MS = 12_000;
export const SECURITY_GAP_MS = 250;
export const SECURITY_LANES = 3;
const TICKER = /^[A-Z]{1,5}([.-][A-Z])?$/;
const NASDAQ = "https://api.nasdaq.com/api";
/** the parts of a view, in the order they are asked */
export const SECURITY_PARTS = ["info", "summary", "profile", "dividends", "short", "ratings", "target", "surprise", "forecast", "peg", "insider", "institutions"] as const;
export type SecurityPart = (typeof SECURITY_PARTS)[number];
/** the parts an ETF has: Nasdaq keeps no profile, analysts, earnings or holders for one */
export const ETF_PARTS: readonly SecurityPart[] = ["info", "summary", "dividends", "short"];

export interface SecurityQuote {
  last?: number | undefined;
  change?: number | undefined;
  changePct?: number | undefined;
  /** Nasdaq's stamp, as written ("Nov 9, 2026 5:13 PM ET") */
  at?: string | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  volume?: number | undefined;
  marketStatus?: string | undefined;
  realTime?: boolean | undefined;
  /** the regular session's close, where Nasdaq shows one apart (after hours) */
  close?: number | undefined;
  closeChange?: number | undefined;
  closeChangePct?: number | undefined;
}
export interface SecurityStats {
  previousClose?: number | undefined;
  dayLow?: number | undefined;
  dayHigh?: number | undefined;
  week52Low?: number | undefined;
  week52High?: number | undefined;
  volume?: number | undefined;
  averageVolume?: number | undefined;
  marketCapUsd?: number | undefined;
  sharesOutstanding?: number | undefined;
  annualDividend?: number | undefined;
  dividendYieldPct?: number | undefined;
  exDividend?: string | undefined;
  payDate?: string | undefined;
  oneYearTarget?: number | undefined;
  payoutRatioPct?: number | undefined;
  peRatio?: number | undefined;
  forwardPeg?: number | undefined;
  institutionalPct?: number | undefined;
}
export interface DividendRow {
  exDate?: string | undefined;
  type?: string | undefined;
  amount?: number | undefined;
  declared?: string | undefined;
  record?: string | undefined;
  payment?: string | undefined;
}
export interface ShortRow {
  settlement?: string | undefined;
  shares?: number | undefined;
  avgDailyVolume?: number | undefined;
  daysToCover?: number | undefined;
}
export interface Analysts {
  rating?: string | undefined;
  summary?: string | undefined;
  count?: number | undefined;
  targetLow?: number | undefined;
  targetMean?: number | undefined;
  targetHigh?: number | undefined;
  buy?: number | undefined;
  hold?: number | undefined;
  sell?: number | undefined;
  /** a year of monthly consensus, oldest first */
  history: Array<{ month?: string | undefined; buy?: number | undefined; hold?: number | undefined; sell?: number | undefined; consensus?: string | undefined; target?: number | undefined }>;
}
export interface Earnings {
  surprises: Array<{ quarter?: string | undefined; reported?: string | undefined; eps?: number | undefined; consensus?: number | undefined; surprisePct?: number | undefined }>;
  quarters: Array<{ period?: string | undefined; consensus?: number | undefined; high?: number | undefined; low?: number | undefined; estimates?: number | undefined; revisionsUp?: number | undefined; revisionsDown?: number | undefined }>;
  years: Earnings["quarters"];
  /** the P/E Nasdaq shows: the actual year and the estimates */
  pe: Array<{ period: string; value: number }>;
  growth: Array<{ period: string; value: number }>;
}
export interface Insiders {
  buys3m?: number | undefined;
  sells3m?: number | undefined;
  buys12m?: number | undefined;
  sells12m?: number | undefined;
  bought3m?: number | undefined;
  sold3m?: number | undefined;
  bought12m?: number | undefined;
  sold12m?: number | undefined;
  net3m?: number | undefined;
  net12m?: number | undefined;
  trades: Array<{ insider?: string | undefined; relation?: string | undefined; date?: string | undefined; type?: string | undefined; ownType?: string | undefined; shares?: number | undefined; price?: number | undefined; held?: number | undefined }>;
}
export interface Institutions {
  pct?: number | undefined;
  sharesOutstandingM?: number | undefined;
  valueM?: number | undefined;
  increased?: { holders?: number | undefined; shares?: number | undefined } | undefined;
  decreased?: Institutions["increased"];
  held?: Institutions["increased"];
  total?: Institutions["increased"];
  opened?: Institutions["increased"];
  soldOut?: Institutions["increased"];
  /** the largest holders by value: the value Nasdaq writes in thousands, here in dollars */
  holders: Array<{ name?: string | undefined; date?: string | undefined; shares?: number | undefined; change?: number | undefined; changePct?: number | undefined; valueUsd?: number | undefined }>;
}
export interface SecurityView {
  asOf: string;
  readAt: string;
  symbol: string;
  kind: "stock" | "etf";
  name?: string | undefined;
  stockType?: string | undefined;
  exchange?: string | undefined;
  sector?: string | undefined;
  industry?: string | undefined;
  region?: string | undefined;
  description?: string | undefined;
  nasdaq100?: boolean | undefined;
  quote: SecurityQuote;
  stats: SecurityStats;
  dividends: DividendRow[];
  shortInterest: ShortRow[];
  analysts?: Analysts | undefined;
  earnings?: Earnings | undefined;
  insiders?: Insiders | undefined;
  institutions?: Institutions | undefined;
  /** the parts that answered, and the ones that did not with Nasdaq's words */
  parts: SecurityPart[];
  missing: Array<{ part: SecurityPart; why: string; code?: string | undefined }>;
  from: string;
  notes: string[];
}
export interface SecurityReader {
  security(symbol: string): Promise<SecurityView | Refusal>;
  clear(): void;
}
export interface SecurityDeps {
  http: Http;
  clock?: (() => number) | undefined;
}

const pct = (v: unknown): number | undefined => figure(v);
/** a figure Nasdaq writes with its sign ("+0.11", "+2.43%", "-0.42") */
const signed = (v: unknown): number | undefined => figure(String(v ?? "").trim().replace(/^\+/, ""));
/** Nasdaq's words, or none where it writes none ("N/A", "") */
const txt = (v: unknown): string | undefined => {
  const s = str(v)?.trim();
  return s && !/^(n\/a|na|-|—)$/i.test(s) ? s : undefined;
};
/** the parts in words, for what Nasdaq has nothing of */
export const PART_WORDS: Record<SecurityPart, string> = { info: "quote", summary: "summary", profile: "company profile", dividends: "dividend history", short: "short interest", ratings: "analyst ratings", target: "price targets", surprise: "earnings surprises", forecast: "earnings forecasts", peg: "PEG and P/E", insider: "insider trades", institutions: "institutional holdings" };
/** a "label/value" pair of Nasdaq's summaryData */
const val = (d: Record<string, unknown>, key: string): unknown => rec(d[key]).value;
/** "$352.28/$344.78" or "243.42 - 355.38" as [low, high] */
function range(v: unknown): [number | undefined, number | undefined] {
  const parts = String(v ?? "").split(/\s*[/–-]\s*|\s+-\s+/).map((x) => figure(x));
  if (parts.length < 2) return [undefined, undefined];
  const a = parts[0];
  const b = parts[1];
  return a !== undefined && b !== undefined ? [Math.min(a, b), Math.max(a, b)] : [a, b];
}
/** "Aug 10, 2026" as a day */
export function usWords(v: unknown): string | undefined {
  const m = /^([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(String(v ?? "").trim());
  if (!m) return usDay(v);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(m[1]!) + 1;
  if (!month) return undefined;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}
/** Nasdaq's answer: its data where rCode is 200 and data is there; undefined where it says it has nothing; a refusal elsewhere */
export function nasdaqData(r: HttpReply, part: string): Record<string, unknown> | undefined | Refusal {
  const b = rec(r.body);
  const status = rec(b.status);
  const code = fin(status.rCode);
  const said = list(status.bCodeMessage).map((m) => str(rec(m).errorMessage)).filter((m): m is string => !!m).join("; ");
  if (code === 400 || (code !== undefined && code !== 200 && b.data === null)) return said ? (/not exist/i.test(said) ? undefined : no("E_VENUE_REJECTED", { venue: "nasdaq", message: `Nasdaq answered for ${part}: ${said.slice(0, 160)}` })) : undefined;
  if (b.data === null || b.data === undefined) return undefined;
  if (!isRec(b.data)) return no("E_VENUE_REJECTED", { venue: "nasdaq", message: `Nasdaq answered ${part} in a way this could not read` });
  return b.data;
}

// ---- the pickers, one a part ---------------------------------------------------------------------------------------------------------

export function pickInfo(d: Record<string, unknown>): { name?: string | undefined; stockType?: string | undefined; exchange?: string | undefined; nasdaq100?: boolean | undefined; quote: SecurityQuote } {
  const p = rec(d.primaryData);
  const s = rec(d.secondaryData);
  const after = /after|pre|closed/i.test(str(d.marketStatus) ?? "") && figure(s.lastSalePrice) !== undefined;
  const quote: SecurityQuote = {
    ...(figure(p.lastSalePrice) !== undefined ? { last: figure(p.lastSalePrice) } : {}),
    ...(signed(p.netChange) !== undefined ? { change: signed(p.netChange) } : {}),
    ...(signed(p.percentageChange) !== undefined ? { changePct: signed(p.percentageChange) } : {}),
    ...(txt(p.lastTradeTimestamp) ? { at: txt(p.lastTradeTimestamp) } : {}),
    ...(figure(p.bidPrice) !== undefined ? { bid: figure(p.bidPrice) } : {}),
    ...(figure(p.askPrice) !== undefined ? { ask: figure(p.askPrice) } : {}),
    ...(figure(p.volume) !== undefined ? { volume: Math.round(figure(p.volume)!) } : {}),
    ...(txt(d.marketStatus) ? { marketStatus: txt(d.marketStatus) } : {}),
    ...(typeof p.isRealTime === "boolean" ? { realTime: p.isRealTime } : {}),
    ...(after ? { close: figure(s.lastSalePrice), ...(signed(s.netChange) !== undefined ? { closeChange: signed(s.netChange) } : {}), ...(signed(s.percentageChange) !== undefined ? { closeChangePct: signed(s.percentageChange) } : {}) } : {}),
  };
  return { ...(txt(d.companyName) ? { name: txt(d.companyName) } : {}), ...(txt(d.stockType) ? { stockType: txt(d.stockType) } : {}), ...(txt(d.exchange) ? { exchange: txt(d.exchange) } : {}), ...(typeof d.isNasdaq100 === "boolean" ? { nasdaq100: d.isNasdaq100 } : {}), quote };
}
export function pickSummary(d: Record<string, unknown>): { exchange?: string | undefined; sector?: string | undefined; industry?: string | undefined; stats: SecurityStats } {
  const s = rec(d.summaryData);
  const [dayLow, dayHigh] = range(val(s, "TodayHighLow"));
  const [w52Low, w52High] = range(val(s, "FiftTwoWeekHighLow"));
  const stats: SecurityStats = {
    ...(figure(val(s, "PreviousClose")) !== undefined ? { previousClose: figure(val(s, "PreviousClose")) } : {}),
    ...(dayLow !== undefined ? { dayLow } : {}),
    ...(dayHigh !== undefined ? { dayHigh } : {}),
    ...(w52Low !== undefined ? { week52Low: w52Low } : {}),
    ...(w52High !== undefined ? { week52High: w52High } : {}),
    ...(figure(val(s, "ShareVolume")) !== undefined ? { volume: Math.round(figure(val(s, "ShareVolume"))!) } : {}),
    ...(figure(val(s, "AverageVolume")) !== undefined ? { averageVolume: Math.round(figure(val(s, "AverageVolume"))!) } : {}),
    ...(figure(val(s, "MarketCap")) !== undefined ? { marketCapUsd: figure(val(s, "MarketCap")) } : {}),
    ...(figure(val(s, "AnnualizedDividend")) !== undefined ? { annualDividend: figure(val(s, "AnnualizedDividend")) } : {}),
    ...(pct(val(s, "Yield")) !== undefined ? { dividendYieldPct: pct(val(s, "Yield")) } : {}),
    ...(usWords(val(s, "ExDividendDate")) ? { exDividend: usWords(val(s, "ExDividendDate")) } : {}),
    ...(usWords(val(s, "DividendPaymentDate")) ? { payDate: usWords(val(s, "DividendPaymentDate")) } : {}),
    ...(figure(val(s, "OneYrTarget")) !== undefined ? { oneYearTarget: figure(val(s, "OneYrTarget")) } : {}),
  };
  return { ...(txt(val(s, "Exchange")) ? { exchange: txt(val(s, "Exchange")) } : {}), ...(txt(val(s, "Sector")) ? { sector: txt(val(s, "Sector")) } : {}), ...(txt(val(s, "Industry")) ? { industry: txt(val(s, "Industry")) } : {}), stats };
}
export function pickProfile(d: Record<string, unknown>): { description?: string | undefined; sector?: string | undefined; industry?: string | undefined; region?: string | undefined; name?: string | undefined } {
  const g = (k: string) => txt(rec(d[k]).value);
  return { ...(g("CompanyDescription") ? { description: g("CompanyDescription")!.slice(0, 2000) } : {}), ...(g("Sector") ? { sector: g("Sector") } : {}), ...(g("Industry") ? { industry: g("Industry") } : {}), ...(g("Region") ? { region: g("Region") } : {}), ...(g("CompanyName") ? { name: g("CompanyName") } : {}) };
}
export function pickDividends(d: Record<string, unknown>): { rows: DividendRow[]; payoutRatioPct?: number | undefined; peRatio?: number | undefined; yieldPct?: number | undefined; annual?: number | undefined } {
  const rows: DividendRow[] = list(rec(d.dividends).rows).filter(isRec).slice(0, 40).map((r) => ({
    ...(usDay(r.exOrEffDate) ? { exDate: usDay(r.exOrEffDate) } : {}),
    ...(txt(r.type) ? { type: txt(r.type) } : {}),
    ...(figure(r.amount) !== undefined ? { amount: figure(r.amount) } : {}),
    ...(usDay(r.declarationDate) ? { declared: usDay(r.declarationDate) } : {}),
    ...(usDay(r.recordDate) ? { record: usDay(r.recordDate) } : {}),
    ...(usDay(r.paymentDate) ? { payment: usDay(r.paymentDate) } : {}),
  }));
  const heads = list(d.dividendHeaderValues).filter(isRec);
  const head = (label: string) => heads.find((h) => str(h.label) === label)?.value;
  return { rows, ...(figure(d.payoutRatio) !== undefined ? { payoutRatioPct: figure(d.payoutRatio) } : {}), ...(figure(head("P/E Ratio")) !== undefined ? { peRatio: figure(head("P/E Ratio")) } : {}), ...(pct(d.yield) !== undefined ? { yieldPct: pct(d.yield) } : {}), ...(figure(d.annualizedDividend) !== undefined ? { annual: figure(d.annualizedDividend) } : {}) };
}
export function pickShort(d: Record<string, unknown>): ShortRow[] {
  return list(rec(d.shortInterestTable).rows).filter(isRec).slice(0, 26).map((r) => ({
    ...(usDay(r.settlementDate) ? { settlement: usDay(r.settlementDate) } : {}),
    ...(figure(r.interest) !== undefined ? { shares: figure(r.interest) } : {}),
    ...(figure(r.avgDailyShareVolume) !== undefined ? { avgDailyVolume: figure(r.avgDailyShareVolume) } : {}),
    ...(fin(r.daysToCover) !== undefined ? { daysToCover: Math.round(fin(r.daysToCover)! * 100) / 100 } : {}),
  }));
}
export function pickRatings(d: Record<string, unknown>): Pick<Analysts, "rating" | "summary" | "count"> {
  const names = list(d.brokerNames).filter((x): x is string => typeof x === "string");
  const m = /based on (\d+) analyst/i.exec(str(d.ratingsSummary) ?? "");
  return { ...(txt(d.meanRatingType) ? { rating: txt(d.meanRatingType) } : {}), ...(txt(d.ratingsSummary) ? { summary: txt(d.ratingsSummary) } : {}), ...(m ? { count: Number(m[1]) } : names.length ? { count: names.length } : {}) };
}
export function pickTarget(d: Record<string, unknown>): Pick<Analysts, "targetLow" | "targetMean" | "targetHigh" | "buy" | "hold" | "sell" | "history"> {
  const c = rec(d.consensusOverview);
  const history = list(d.historicalConsensus).filter(isRec).map((h) => {
    const z = rec(h.z);
    return { ...(usDay(z.date) ? { month: usDay(z.date)!.slice(0, 7) } : {}), ...(fin(z.buy) !== undefined ? { buy: fin(z.buy) } : {}), ...(fin(z.hold) !== undefined ? { hold: fin(z.hold) } : {}), ...(fin(z.sell) !== undefined ? { sell: fin(z.sell) } : {}), ...(txt(z.consensus) ? { consensus: txt(z.consensus) } : {}), ...(fin(h.y) !== undefined ? { target: fin(h.y) } : {}) };
  });
  return { ...(fin(c.lowPriceTarget) !== undefined ? { targetLow: fin(c.lowPriceTarget) } : {}), ...(fin(c.priceTarget) !== undefined ? { targetMean: fin(c.priceTarget) } : {}), ...(fin(c.highPriceTarget) !== undefined ? { targetHigh: fin(c.highPriceTarget) } : {}), ...(fin(c.buy) !== undefined ? { buy: fin(c.buy) } : {}), ...(fin(c.hold) !== undefined ? { hold: fin(c.hold) } : {}), ...(fin(c.sell) !== undefined ? { sell: fin(c.sell) } : {}), history };
}
export function pickSurprise(d: Record<string, unknown>): Earnings["surprises"] {
  return list(rec(d.earningsSurpriseTable).rows).filter(isRec).map((r) => ({ ...(txt(r.fiscalQtrEnd) ? { quarter: txt(r.fiscalQtrEnd) } : {}), ...(usDay(r.dateReported) ? { reported: usDay(r.dateReported) } : {}), ...(figure(r.eps) !== undefined ? { eps: figure(r.eps) } : {}), ...(figure(r.consensusForecast) !== undefined ? { consensus: figure(r.consensusForecast) } : {}), ...(figure(r.percentageSurprise) !== undefined ? { surprisePct: figure(r.percentageSurprise) } : {}) }));
}
const forecastRows = (v: unknown): Earnings["quarters"] => list(rec(v).rows).filter(isRec).map((r) => ({ ...(txt(r.fiscalEnd) ? { period: txt(r.fiscalEnd) } : {}), ...(figure(r.consensusEPSForecast) !== undefined ? { consensus: figure(r.consensusEPSForecast) } : {}), ...(figure(r.highEPSForecast) !== undefined ? { high: figure(r.highEPSForecast) } : {}), ...(figure(r.lowEPSForecast) !== undefined ? { low: figure(r.lowEPSForecast) } : {}), ...(figure(r.noOfEstimates) !== undefined ? { estimates: figure(r.noOfEstimates) } : {}), ...(figure(r.up) !== undefined ? { revisionsUp: figure(r.up) } : {}), ...(figure(r.down) !== undefined ? { revisionsDown: figure(r.down) } : {}) }));
export function pickForecast(d: Record<string, unknown>): { quarters: Earnings["quarters"]; years: Earnings["quarters"] } {
  return { quarters: forecastRows(d.quarterlyForecast), years: forecastRows(d.yearlyForecast) };
}
export function pickPeg(d: Record<string, unknown>): { forwardPeg?: number | undefined; pe: Earnings["pe"]; growth: Earnings["growth"] } {
  const pe = list(rec(d.per).peRatioChart).filter(isRec).map((p) => ({ period: str(p.x) ?? "", value: fin(p.y) })).filter((p): p is { period: string; value: number } => !!p.period && p.value !== undefined);
  const growth = list(rec(d.gr).peGrowthChart).filter(isRec).filter((p) => str(p.z) === "Growth").map((p) => ({ period: str(p.x) ?? "", value: fin(p.y) })).filter((p): p is { period: string; value: number } => !!p.period && p.value !== undefined);
  const peg = fin(rec(d.pegr).pegValue);
  return { ...(peg !== undefined && peg > 0 ? { forwardPeg: peg } : {}), pe, growth };
}
export function pickInsiders(d: Record<string, unknown>): Insiders {
  const rowOf = (table: unknown, label: RegExp) => list(rec(table).rows).filter(isRec).find((r) => label.test(str(r.insiderTrade) ?? ""));
  const n3 = (table: unknown, label: RegExp) => figure(rowOf(table, label)?.months3);
  const n12 = (table: unknown, label: RegExp) => figure(rowOf(table, label)?.months12);
  const t = d.numberOfTrades;
  const s = d.numberOfSharesTraded;
  const trades: Insiders["trades"] = list(rec(rec(d.transactionTable).table).rows).filter(isRec).slice(0, 15).map((r) => ({ ...(txt(r.insider) ? { insider: txt(r.insider) } : {}), ...(txt(r.relation) ? { relation: txt(r.relation) } : {}), ...(usDay(r.lastDate) ? { date: usDay(r.lastDate) } : {}), ...(txt(r.transactionType) ? { type: txt(r.transactionType) } : {}), ...(txt(r.ownType) ? { ownType: txt(r.ownType) } : {}), ...(figure(r.sharesTraded) !== undefined ? { shares: figure(r.sharesTraded) } : {}), ...(figure(r.lastPrice) !== undefined ? { price: figure(r.lastPrice) } : {}), ...(figure(r.sharesHeld) !== undefined ? { held: figure(r.sharesHeld) } : {}) }));
  const put = (k: string, v: number | undefined) => (v !== undefined ? { [k]: v } : {});
  return { ...put("buys3m", n3(t, /open market buys/i)), ...put("sells3m", n3(t, /^number of sells/i)), ...put("buys12m", n12(t, /open market buys/i)), ...put("sells12m", n12(t, /^number of sells/i)), ...put("bought3m", n3(s, /shares bought/i)), ...put("sold3m", n3(s, /shares sold/i)), ...put("bought12m", n12(s, /shares bought/i)), ...put("sold12m", n12(s, /shares sold/i)), ...put("net3m", n3(s, /net activity/i)), ...put("net12m", n12(s, /net activity/i)), trades };
}
export function pickInstitutions(d: Record<string, unknown>): Institutions {
  const o = rec(d.ownershipSummary);
  const pos = (table: unknown, label: RegExp) => {
    const r = list(rec(table).rows).filter(isRec).find((x) => label.test(str(x.positions) ?? ""));
    return r ? { ...(figure(r.holders) !== undefined ? { holders: figure(r.holders) } : {}), ...(figure(r.shares) !== undefined ? { shares: figure(r.shares) } : {}) } : undefined;
  };
  const holders: Institutions["holders"] = list(rec(rec(d.holdingsTransactions).table).rows).filter(isRec).slice(0, 15).map((r) => ({ ...(txt(r.ownerName) ? { name: txt(r.ownerName) } : {}), ...(usDay(r.date) ? { date: usDay(r.date) } : {}), ...(figure(r.sharesHeld) !== undefined ? { shares: figure(r.sharesHeld) } : {}), ...(signed(r.sharesChange) !== undefined ? { change: signed(r.sharesChange) } : {}), ...(signed(r.sharesChangePCT) !== undefined ? { changePct: signed(r.sharesChangePCT) } : {}), ...(figure(r.marketValue) !== undefined ? { valueUsd: figure(r.marketValue)! * 1000 } : {}) }));
  const put = (k: string, v: unknown) => (v !== undefined ? { [k]: v } : {});
  return {
    ...put("pct", pct(rec(o.SharesOutstandingPCT).value)),
    ...put("sharesOutstandingM", figure(rec(o.ShareoutstandingTotal).value)),
    ...put("valueM", figure(rec(o.TotalHoldingsValue).value)),
    ...put("increased", pos(d.activePositions, /increased/i)),
    ...put("decreased", pos(d.activePositions, /decreased/i)),
    ...put("held", pos(d.activePositions, /^held/i)),
    ...put("total", pos(d.activePositions, /total/i)),
    ...put("opened", pos(d.newSoldOutPositions, /new/i)),
    ...put("soldOut", pos(d.newSoldOutPositions, /sold out/i)),
    holders,
  };
}

/** the address of each part */
export function partUrl(part: SecurityPart, symbol: string, kind: "stock" | "etf"): string {
  const ac = kind === "etf" ? "etf" : "stocks";
  switch (part) {
    case "info": return `${NASDAQ}/quote/${symbol}/info?assetclass=${ac}`;
    case "summary": return `${NASDAQ}/quote/${symbol}/summary?assetclass=${ac}`;
    case "profile": return `${NASDAQ}/company/${symbol}/company-profile`;
    case "dividends": return `${NASDAQ}/quote/${symbol}/dividends?assetclass=${ac}`;
    case "short": return `${NASDAQ}/quote/${symbol}/short-interest?assetClass=${ac}`;
    case "ratings": return `${NASDAQ}/analyst/${symbol}/ratings`;
    case "target": return `${NASDAQ}/analyst/${symbol}/targetprice`;
    case "surprise": return `${NASDAQ}/company/${symbol}/earnings-surprise`;
    case "forecast": return `${NASDAQ}/analyst/${symbol}/earnings-forecast`;
    case "peg": return `${NASDAQ}/analyst/${symbol}/peg-ratio`;
    case "insider": return `${NASDAQ}/company/${symbol}/insider-trades?limit=15&type=ALL&sortColumn=lastDate&sortOrder=DESC`;
    case "institutions": return `${NASDAQ}/company/${symbol}/institutional-holdings?limit=15&type=TOTAL&sortColumn=marketValue`;
  }
}
/** the parts read as one view */
export function assemble(symbol: string, kind: "stock" | "etf", parts: Partial<Record<SecurityPart, Record<string, unknown>>>, missing: SecurityView["missing"], now: number, readAt: number): SecurityView {
  const info = parts.info ? pickInfo(parts.info) : undefined;
  const summary = parts.summary ? pickSummary(parts.summary) : undefined;
  const profile = parts.profile ? pickProfile(parts.profile) : undefined;
  const dividends = parts.dividends ? pickDividends(parts.dividends) : undefined;
  const ratings = parts.ratings ? pickRatings(parts.ratings) : undefined;
  const target = parts.target ? pickTarget(parts.target) : undefined;
  const forecast = parts.forecast ? pickForecast(parts.forecast) : undefined;
  const peg = parts.peg ? pickPeg(parts.peg) : undefined;
  const institutions = parts.institutions ? pickInstitutions(parts.institutions) : undefined;
  const analysts: Analysts | undefined = ratings || target ? { ...ratings, ...(target ?? { history: [] }) } : undefined;
  const earnings: Earnings | undefined = parts.surprise || forecast || peg ? { surprises: parts.surprise ? pickSurprise(parts.surprise) : [], quarters: forecast?.quarters ?? [], years: forecast?.years ?? [], pe: peg?.pe ?? [], growth: peg?.growth ?? [] } : undefined;
  const stats: SecurityStats = { ...summary?.stats, ...(dividends?.payoutRatioPct !== undefined ? { payoutRatioPct: dividends.payoutRatioPct } : {}), ...(dividends?.peRatio !== undefined ? { peRatio: dividends.peRatio } : {}), ...(peg?.forwardPeg !== undefined ? { forwardPeg: peg.forwardPeg } : {}), ...(institutions?.pct !== undefined ? { institutionalPct: institutions.pct } : {}), ...(institutions?.sharesOutstandingM !== undefined ? { sharesOutstanding: Math.round(institutions.sharesOutstandingM * 1e6) } : {}) };
  const name = info?.name ?? profile?.name;
  const exchange = info?.exchange ?? summary?.exchange;
  const sector = profile?.sector ?? summary?.sector;
  const industry = profile?.industry ?? summary?.industry;
  return {
    asOf: new Date(now).toISOString(),
    readAt: new Date(readAt).toISOString(),
    symbol,
    kind,
    ...(name ? { name } : {}),
    ...(info?.stockType ? { stockType: info.stockType } : {}),
    ...(exchange ? { exchange } : {}),
    ...(sector ? { sector } : {}),
    ...(industry ? { industry } : {}),
    ...(profile?.region ? { region: profile.region } : {}),
    ...(profile?.description ? { description: profile.description } : {}),
    ...(info?.nasdaq100 !== undefined ? { nasdaq100: info.nasdaq100 } : {}),
    quote: info?.quote ?? {},
    stats,
    dividends: dividends?.rows ?? [],
    shortInterest: parts.short ? pickShort(parts.short) : [],
    ...(analysts ? { analysts } : {}),
    ...(earnings ? { earnings } : {}),
    ...(parts.insider ? { insiders: pickInsiders(parts.insider) } : {}),
    ...(institutions ? { institutions } : {}),
    parts: SECURITY_PARTS.filter((p) => parts[p] !== undefined),
    missing,
    from: "Nasdaq · as written",
    notes: [
      "Nasdaq's own pages for the share, read without a key, each figure as Nasdaq writes it: the analysts' consensus, targets and estimates are theirs, counted by Nasdaq; the insider trades and the institutional holdings are from the filings Nasdaq collects; nothing here is estimated or rated by the account.",
      `Kept ${SECURITY_KEEP_MS / 60_000} minutes; a part Nasdaq has nothing for is left out and named in \`missing\`. The account's own quote of the share is the Markets page's; Nasdaq's last sale is carried here as Nasdaq's.`,
    ],
  };
}

interface Kept {
  until: number;
  value: SecurityView | Refusal;
}
/** THE PAGES, read: twelve GETs a share in a paced line, kept five minutes, a refusal held a minute at least */
export class NasdaqSecurity implements SecurityReader {
  private readonly guarded: Http;
  private readonly clock: () => number;
  private readonly gapMs: number;
  private readonly kept = new Map<string, Kept>();
  private readonly inflight = new Map<string, Promise<SecurityView | Refusal>>();
  constructor(deps: SecurityDeps & { guarded: Http; gapMs?: number | undefined }) {
    this.guarded = deps.guarded;
    this.clock = deps.clock ?? Date.now;
    this.gapMs = deps.gapMs ?? SECURITY_GAP_MS;
  }
  clear(): void {
    for (const [k, v] of this.kept) if (isRefusal(v.value)) this.kept.delete(k);
  }
  private async get(url: string, part: string): Promise<Record<string, unknown> | undefined | Refusal> {
    let r: HttpReply;
    try {
      r = await this.guarded(url, { headers: { "user-agent": NASDAQ_UA, accept: "application/json, text/plain, */*" }, timeoutMs: SECURITY_TIMEOUT_MS });
    } catch (err) {
      return unreachable("nasdaq", "Nasdaq", err);
    }
    if (r.status < 200 || r.status >= 300) return publicNo("nasdaq", "Nasdaq", r);
    return nasdaqData(r, part);
  }
  async security(raw: string): Promise<SecurityView | Refusal> {
    const symbol = String(raw ?? "").trim().toUpperCase();
    if (!TICKER.test(symbol)) return no("E_ACCOUNT_BAD_ACTION", { message: `"${String(raw ?? "").slice(0, 20)}" is not a US share's ticker (AAPL, BRK.B)` });
    const now = this.clock();
    const hit = this.kept.get(symbol);
    if (hit && now < hit.until) return hit.value;
    const going = this.inflight.get(symbol);
    if (going) return going;
    const p = this.read(symbol).then((v) => {
      const at = this.clock();
      this.kept.set(symbol, { until: at + (isRefusal(v) ? Math.max(holdBackMs(v), SECURITY_FAIL_MS) : SECURITY_KEEP_MS), value: v });
      this.inflight.delete(symbol);
      return v;
    });
    this.inflight.set(symbol, p);
    return p;
  }
  private async read(symbol: string): Promise<SecurityView | Refusal> {
    const started = this.clock();
    // the name first: a share answers as one; an ETF only as one
    let kind: "stock" | "etf" = "stock";
    let info = await this.get(partUrl("info", symbol, "stock"), "info");
    if (info === undefined) {
      info = await this.get(partUrl("info", symbol, "etf"), "info");
      if (info !== undefined && !isRefusal(info)) kind = "etf";
    }
    if (isRefusal(info)) return info;
    if (info === undefined) return no("E_VENUE_REJECTED", { venue: "nasdaq", message: `Nasdaq lists no share or ETF named ${symbol}`, native: { status: 400 } });
    const parts: Partial<Record<SecurityPart, Record<string, unknown>>> = { info };
    const missing: SecurityView["missing"] = [];
    const rest = (kind === "etf" ? ETF_PARTS : SECURITY_PARTS).filter((p) => p !== "info");
    // three lanes, each a gap apart, so a share's page is not twelve requests in the same instant on the quotes' host
    const lanes: SecurityPart[][] = Array.from({ length: SECURITY_LANES }, () => []);
    rest.forEach((p, i) => lanes[i % SECURITY_LANES]!.push(p));
    await Promise.all(lanes.map(async (lane, li) => {
      if (li && this.gapMs) await new Promise((go) => setTimeout(go, (this.gapMs * li) / SECURITY_LANES));
      for (const [i, part] of lane.entries()) {
        if (i && this.gapMs) await new Promise((go) => setTimeout(go, this.gapMs));
        const d = await this.get(partUrl(part, symbol, kind), part);
        if (isRefusal(d)) missing.push({ part, why: d.message, code: d.code });
        else if (d === undefined) missing.push({ part, why: `Nasdaq has no ${PART_WORDS[part]} for ${symbol}` });
        else parts[part] = d;
      }
    }));
    return assemble(symbol, kind, parts, missing, this.clock(), started);
  }
}
/** the reader as the service makes it: every GET behind the fixed-host guard */
export const nasdaqSecurity = (deps: SecurityDeps): NasdaqSecurity => new NasdaqSecurity({ ...deps, guarded: fixedHosts(deps.http, SECURITY_HOSTS, SECURITY_TIMEOUT_MS) });
