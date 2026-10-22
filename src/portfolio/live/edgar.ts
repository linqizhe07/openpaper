/** SEC EDGAR, KEYLESS (after OpenStock's stock pages, which show a company's financials): a US company's own filed figures for the stock
 * drawer's Financials — revenue, net income, diluted earnings a share, shares outstanding — read from the SEC's XBRL "company facts", the
 * tagged numbers of every 10-K and 10-Q the company filed. Two GETs, each through the fixed-host guard (public-markets.ts fixedHosts),
 * their shapes as read on 2026-10-22:
 *   GET https://www.sec.gov/files/company_tickers.json                every listed company's ticker → CIK (10,428 rows, 780 KB that day):
 *                       {"0": {cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP"}, "1": …}. A class share is written with a dash
 *                       (BRK-B) where the account writes a dot (BRK.B). Kept a day
 *   GET https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json  every fact the company ever tagged (Apple: 3.8 MB): {cik, entityName,
 *                       facts: {"us-gaap": {<Concept>: {label, units: {USD: [{start?, end, val, accn, fy, fp, form, filed, frame?}]}}},
 *                       dei: {EntityCommonStockSharesOutstanding: {units: {shares: [{end, val, …}]}}}}. A 10-Q carries its own quarter
 *                       (start to end about 91 days; `frame` CY2026Q2) and the year to date (start the fiscal year's first day); a 10-K the
 *                       fiscal year (about 365 days; frame CY2025). No fourth quarter is filed on its own, and none is worked out here. The
 *                       same period comes again in later filings as a comparative, under the later filing's fiscal year (Apple's third
 *                       quarter of 2025 in the third quarter's 10-Q of 2026, under fy 2026): one period is one row here, labelled and
 *                       valued by the filing that first reported it — an amendment of that same filing (10-K/A, 10-Q/A) winning over it.
 *                       Kept twelve hours
 * THE SEC'S FAIR-ACCESS RULE (sec.gov/os/accessing-edgar-data): at most ten requests a second, and a User-Agent that says who is asking and
 * how to reach them. It answers HTTP 403 — a "Request Rate Threshold Exceeded" page — to a reader without an address in its user agent
 * (checked from here 2026-10-22: a name and a repository URL alone were refused, a name with an address was answered). So the account
 * asks only with the contact the owner set (SEC_CONTACT, an email address) and says so where none is set: it never makes an address up
 * and never pretends to be a browser. A refusal is said in the SEC's own words (public-markets.ts publicNo) and held as any public
 * source's is (holdBackMs). Nothing here is estimated: a period the filings do not carry is not a row. */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { holdBackMs, publicNo } from "./public-markets.ts";
import { unreachable, type Http } from "./types.ts";

export const SEC_HOSTS: readonly string[] = ["www.sec.gov", "data.sec.gov"];
export const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
export const secFactsUrl = (cik: string): string => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`;
/** the company's filings on the SEC's own site, for a person to read */
export const secFilingsUrl = (cik: string): string => `https://www.sec.gov/edgar/browse/?CIK=${Number(cik)}&owner=exclude`;
export const SEC_VENUE = "sec";
export const SEC_NAME = "SEC EDGAR";
/** whose figures they are, as the drawer says it */
export const SEC_SOURCE = "SEC EDGAR · XBRL company facts";
export const TICKERS_KEEP_MS = 24 * 3_600_000;
export const FACTS_KEEP_MS = 12 * 3_600_000;
/** a refusal that names no wait of its own is asked again after this long */
export const FAIL_KEEP_MS = 60_000;
/** the SEC allows ten requests a second: the account sends at most eight */
export const SEC_GAP_MS = 125;
export const SEC_TIMEOUT_MS = 8_000;
/** a ticker as the account writes one: letters, a class after a dot or a dash (BRK.B, BRK-B) */
export const SEC_TICKER = /^[A-Z]{1,6}([.-][A-Z]{1,2})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** what the drawer says where no contact is set: nothing is asked of the SEC without one */
export const SEC_CONTACT_WORDS = "The SEC asks every reader of EDGAR to say who they are and how to reach them: start the account with SEC_CONTACT set to your email address, and this reads the company's own filings";

/** the account's user agent at the SEC — its name and the owner's contact — or undefined where SEC_CONTACT is not an address (nothing is
 * asked then) */
export function secUserAgent(env: Record<string, string | undefined> = process.env): string | undefined {
  const contact = (env.SEC_CONTACT ?? "").trim();
  return EMAIL.test(contact) ? `Gravit buyer-agent-demo ${contact}` : undefined;
}

// ---- the company's own record and its latest filings: the SEC's "submissions" file --------------------------------------------------------

/** GET https://data.sec.gov/submissions/CIK##########.json   the company's record and its filings, newest first (about 1 MB for Apple), in
 *   the shape the SEC documents (sec.gov/search-filings/edgar-application-programming-interfaces): {cik, entityType, sic, sicDescription,
 *   name, tickers, exchanges, fiscalYearEnd ("0927"), stateOfIncorporation, stateOfIncorporationDescription, website, investorWebsite,
 *   category, filings: {recent: {accessionNumber[], filingDate[], reportDate[], form[], items[], primaryDocument[],
 *   primaryDocDescription[], …}, files}} — the `recent` arrays are index-aligned, one filing per index. The file was not read live from the
 *   machine this was written on (the SEC refuses a reader without a contact address, which this did not send): every field is read as the
 *   SEC documents it, and one it does not carry is left out. Kept an hour: an 8-K can land any day of the year */
export const secSubmissionsUrl = (cik: string): string => `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
export const COMPANY_KEEP_MS = 3_600_000;
export const COMPANY_SOURCE = "SEC EDGAR · submissions";
/** a filing's primary document on the SEC's site, and the folder it sits in */
export const secDocumentUrl = (cik: string, accession: string, doc: string): string => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${doc}`;
export const secIndexUrl = (cik: string, accession: string): string => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/`;
/** the items an 8-K names, in plain words (the SEC's own item numbers; one it does not list is said by its number) */
export const ITEMS_8K: Readonly<Record<string, string>> = {
  "1.01": "a material agreement",
  "1.02": "an agreement ended",
  "1.03": "bankruptcy or receivership",
  "2.01": "an acquisition or disposition",
  "2.02": "results of operations",
  "2.03": "a new obligation",
  "2.04": "an obligation brought forward",
  "2.05": "exit or disposal costs",
  "2.06": "an impairment",
  "3.01": "a listing notice",
  "3.02": "unregistered sales of shares",
  "3.03": "a change to holders' rights",
  "4.01": "a change of auditor",
  "4.02": "financial statements not to be relied on",
  "5.01": "a change in control",
  "5.02": "officers and directors",
  "5.03": "bylaws or the fiscal year",
  "5.07": "a shareholder vote",
  "5.08": "shareholder nominations",
  "7.01": "a Regulation FD disclosure",
  "8.01": "other events",
  "9.01": "exhibits",
};
const ANNUAL_FORMS: ReadonlySet<string> = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const QUARTERLY_FORMS: ReadonlySet<string> = new Set(["10-Q", "10-Q/A"]);
const FILINGS_SHOWN = 10;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HTTP_URL = /^https?:\/\/[^\s]+$/i;

/** one filing as the record lists it */
export interface Filing {
  form: string;
  /** the day it was filed (ISO date) */
  filed: string;
  /** the period it reports on, where the record gives one */
  reportDate?: string | undefined;
  /** the SEC's description of its primary document, else — for an 8-K — its items in plain words, else the form */
  description: string;
  /** an 8-K's item numbers */
  items?: string[] | undefined;
  url: string;
  indexUrl: string;
}

/** a company's own record: who it is, when its year ends, where it is incorporated, its latest annual and quarterly reports and its
 * newest filings — all as the SEC's record says, nothing guessed */
export interface Company {
  symbol: string;
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic?: string | undefined;
  sicDescription?: string | undefined;
  fiscalYearEnd?: { month: number; day: number; words: string } | undefined;
  stateOfIncorporation?: string | undefined;
  stateOfIncorporationWords?: string | undefined;
  website?: string | undefined;
  investorWebsite?: string | undefined;
  category?: string | undefined;
  latest: { annual?: Filing | undefined; quarterly?: Filing | undefined };
  /** the newest filings, at most ten */
  filings: Filing[];
  filingsUrl: string;
  source: string;
  readAt: string;
}

/** the record as the drawer and the agents want it, or a refusal where the body is not the SEC's record */
export function pickCompany(body: unknown, symbol: string, readAt: string): Company | Refusal {
  if (!isRec(body) || typeof body.name !== "string" || !body.name.trim()) return no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} answered the company's record in a way this could not read` });
  const cik = String(typeof body.cik === "number" || typeof body.cik === "string" ? body.cik : "").padStart(10, "0");
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
  const site = (v: unknown): string | undefined => { const s = str(v); return s && HTTP_URL.test(s) ? s : undefined; };
  const fye = str(body.fiscalYearEnd);
  const my = fye && /^\d{4}$/.test(fye) ? { month: Number(fye.slice(0, 2)), day: Number(fye.slice(2)) } : undefined;
  const fiscalYearEnd = my && my.month >= 1 && my.month <= 12 && my.day >= 1 && my.day <= 31 ? { ...my, words: `${MONTHS[my.month - 1]} ${my.day}` } : undefined;
  const recent = isRec(body.filings) && isRec(body.filings.recent) ? body.filings.recent : {};
  const col = (k: string): unknown[] => (Array.isArray(recent[k]) ? (recent[k] as unknown[]) : []);
  const rowAt = (i: number): Filing | undefined => {
    const acc = col("accessionNumber")[i];
    const form = col("form")[i];
    const filed = col("filingDate")[i];
    if (typeof acc !== "string" || !acc.trim() || typeof form !== "string" || !form.trim() || typeof filed !== "string" || !DATE.test(filed)) return undefined;
    const doc = col("primaryDocument")[i];
    const report = col("reportDate")[i];
    const itemsRaw = col("items")[i];
    const items = typeof itemsRaw === "string" ? itemsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const said = str(col("primaryDocDescription")[i]);
    const description = said ?? (form.startsWith("8-K") && items.length ? items.map((it) => ITEMS_8K[it] ?? `item ${it}`).join(", ") : form);
    return {
      form: form.trim(),
      filed,
      ...(typeof report === "string" && DATE.test(report) ? { reportDate: report } : {}),
      description,
      ...(items.length ? { items } : {}),
      url: typeof doc === "string" && doc.trim() ? secDocumentUrl(cik, acc, doc.trim()) : secIndexUrl(cik, acc),
      indexUrl: secIndexUrl(cik, acc),
    };
  };
  const filings: Filing[] = [];
  let annual: Filing | undefined;
  let quarterly: Filing | undefined;
  const n = col("accessionNumber").length;
  for (let i = 0; i < n; i++) {
    const f = rowAt(i);
    if (!f) continue;
    if (filings.length < FILINGS_SHOWN) filings.push(f);
    if (!annual && ANNUAL_FORMS.has(f.form)) annual = f;
    if (!quarterly && QUARTERLY_FORMS.has(f.form)) quarterly = f;
    if (filings.length >= FILINGS_SHOWN && annual && quarterly) break;
  }
  return {
    symbol,
    cik,
    name: body.name.trim(),
    tickers: strs(body.tickers),
    exchanges: strs(body.exchanges),
    ...(str(body.sic) ? { sic: str(body.sic) } : {}),
    ...(str(body.sicDescription) ? { sicDescription: str(body.sicDescription) } : {}),
    ...(fiscalYearEnd ? { fiscalYearEnd } : {}),
    ...(str(body.stateOfIncorporation) ? { stateOfIncorporation: str(body.stateOfIncorporation) } : {}),
    ...(str(body.stateOfIncorporationDescription) ? { stateOfIncorporationWords: str(body.stateOfIncorporationDescription) } : {}),
    ...(site(body.website) ? { website: site(body.website) } : {}),
    ...(site(body.investorWebsite) ? { investorWebsite: site(body.investorWebsite) } : {}),
    ...(str(body.category) ? { category: str(body.category) } : {}),
    latest: { ...(annual ? { annual } : {}), ...(quarterly ? { quarterly } : {}) },
    filings,
    filingsUrl: secFilingsUrl(cik),
    source: COMPANY_SOURCE,
    readAt,
  };
}

/** one period as a filing reports it, with the figures the three concepts give for it (each only where the filing tagged one) */
export interface FinancialPeriod {
  /** the period's first and last day (ISO dates) and its length in days */
  start: string;
  end: string;
  days: number;
  /** the filing that first reported it (an amendment of it winning): its form (10-K, 10-Q, 20-F …), the day it was filed, and the fiscal
   * year and period it reports (FY, Q1, Q2, Q3) */
  form: string;
  filed: string;
  fy: number;
  fp: string;
  revenue?: number | undefined;
  netIncome?: number | undefined;
  eps?: number | undefined;
}

export interface Financials {
  symbol: string;
  cik: string;
  company: string;
  /** the fiscal years as filed (a 10-K's own year), newest first, at most four */
  annual: FinancialPeriod[];
  /** the quarters as filed (each 10-Q's own quarter; a year's fourth is in the 10-K and is not a row), newest first, at most four */
  quarterly: FinancialPeriod[];
  /** the shares outstanding as the latest filing's cover page says them */
  shares?: { value: number; asOf: string; form: string; filed: string } | undefined;
  /** which tagged concept each column is, in the taxonomy's own words ("us-gaap:NetIncomeLoss"), where one was found */
  concepts: { revenue?: string | undefined; netIncome?: string | undefined; eps?: string | undefined; shares?: string | undefined };
  /** the money's unit (USD; a foreign filer's own) */
  currency: string;
  source: string;
  filingsUrl: string;
  /** the latest filing among the rows and the shares: its form and the day it was filed */
  latest?: { form: string; filed: string } | undefined;
  readAt: string;
}

/** one tagged value as the SEC gives it */
interface Fact {
  start?: string | undefined;
  end: string;
  val: number;
  form: string;
  filed: string;
  fy: number;
  fp: string;
}
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** the concepts each column may come from, in the order one is preferred where several carry the same latest period: the US GAAP names
 * companies file under now, the ones they filed under before, the IFRS names a foreign filer uses */
const REVENUE_CONCEPTS = ["us-gaap:Revenues", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:SalesRevenueNet", "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax", "ifrs-full:Revenue"];
const NET_INCOME_CONCEPTS = ["us-gaap:NetIncomeLoss", "us-gaap:ProfitLoss", "ifrs-full:ProfitLossAttributableToOwnersOfParent", "ifrs-full:ProfitLoss"];
const EPS_CONCEPTS = ["us-gaap:EarningsPerShareDiluted", "ifrs-full:DilutedEarningsLossPerShare", "us-gaap:EarningsPerShareBasic", "ifrs-full:BasicEarningsLossPerShare"];
const SHARES_CONCEPTS = ["dei:EntityCommonStockSharesOutstanding"];
/** a fiscal year's length, and a quarter's, in days: what a period must be to be a row */
const YEAR_DAYS: readonly [number, number] = [350, 380];
const QUARTER_DAYS: readonly [number, number] = [80, 100];
const ROWS = 4;

const days = (start: string, end: string): number => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
const within = (n: number, [lo, hi]: readonly [number, number]): boolean => n >= lo && n <= hi;

/** a concept's tagged values in one unit — the money's USD (or, for a filer that reports in another currency, the first unit it has),
 * earnings a share in USD/shares, a count in shares — or nothing where the company never tagged it */
function factsOf(facts: Rec, name: string, preferred: string): { unit: string; list: Fact[] } | undefined {
  const [taxonomy, concept] = name.split(":");
  const tax = facts[taxonomy!];
  const c = isRec(tax) ? tax[concept!] : undefined;
  const units = isRec(c) ? c.units : undefined;
  if (!isRec(units)) return undefined;
  const unit = preferred in units ? preferred : Object.keys(units)[0];
  const raw = unit === undefined ? undefined : units[unit];
  if (unit === undefined || !Array.isArray(raw)) return undefined;
  const list: Fact[] = [];
  for (const x of raw) {
    if (!isRec(x) || typeof x.end !== "string" || !DATE.test(x.end) || typeof x.val !== "number" || !Number.isFinite(x.val) || typeof x.filed !== "string" || typeof x.form !== "string") continue;
    list.push({ ...(typeof x.start === "string" && DATE.test(x.start) ? { start: x.start } : {}), end: x.end, val: x.val, form: x.form, filed: x.filed, fy: typeof x.fy === "number" ? x.fy : 0, fp: typeof x.fp === "string" ? x.fp : "" });
  }
  return list.length ? { unit, list } : undefined;
}

/** a duration concept's periods of one length, each once: the filing that first reported the period (the lowest fiscal year the period
 * is filed under; among those the latest filed, so an amendment wins over what it amends), by the period's first and last day */
function periodsOf(list: Fact[], length: readonly [number, number]): Map<string, Fact> {
  const out = new Map<string, Fact>();
  for (const f of list) {
    if (!f.start || !within(days(f.start, f.end), length)) continue;
    const key = `${f.start}|${f.end}`;
    const was = out.get(key);
    if (!was || f.fy < was.fy || (f.fy === was.fy && f.filed > was.filed)) out.set(key, f);
  }
  return out;
}

/** the concept a column comes from: of the candidates the company tagged, the one whose latest period of that length is the latest — a
 * company that moved from Revenues to RevenueFromContractWithCustomer keeps its new rows, not the ones it stopped filing in 2018 */
function choose(facts: Rec, candidates: readonly string[], unit: string, length: readonly [number, number]): { name: string; unit: string; periods: Map<string, Fact> } | undefined {
  let best: { name: string; unit: string; periods: Map<string, Fact>; latest: string } | undefined;
  for (const name of candidates) {
    const got = factsOf(facts, name, unit);
    if (!got) continue;
    const periods = periodsOf(got.list, length);
    const latest = [...periods.values()].reduce((m, f) => (f.end > m ? f.end : m), "");
    if (!periods.size) continue;
    if (!best || latest > best.latest) best = { name, unit: got.unit, periods, latest };
  }
  return best;
}

/** THE FIGURES, from a company's facts as the SEC answered them: the fiscal years and the quarters as filed, newest first, each with the
 * revenue, net income and earnings a share the filings tagged for it; the shares outstanding as the latest cover says. A pure function
 * of the answer. A refusal where the facts hold none of them (a fund, a trust, a company that files no 10-K or 10-Q) */
export function pickFinancials(body: unknown, symbol: string, readAt: string): Financials | Refusal {
  const facts = isRec(body) && isRec(body.facts) ? body.facts : undefined;
  const cikRaw = isRec(body) ? body.cik : undefined;
  const cik = typeof cikRaw === "number" || typeof cikRaw === "string" ? String(cikRaw).replace(/\D/g, "").padStart(10, "0") : "";
  const company = isRec(body) && typeof body.entityName === "string" && body.entityName.trim() ? body.entityName.trim() : symbol;
  if (!facts || !cik) return no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} answered in a way this could not read`, native: { page: "companyfacts" } });
  const rows = (length: readonly [number, number]): { periods: FinancialPeriod[]; concepts: Financials["concepts"]; currency: string | undefined } => {
    const revenue = choose(facts, REVENUE_CONCEPTS, "USD", length);
    const netIncome = choose(facts, NET_INCOME_CONCEPTS, "USD", length);
    const eps = choose(facts, EPS_CONCEPTS, "USD/shares", length);
    const byKey = new Map<string, FinancialPeriod>();
    const take = (got: ReturnType<typeof choose>, field: "revenue" | "netIncome" | "eps") => {
      if (!got) return;
      for (const [key, f] of got.periods) {
        const p = byKey.get(key) ?? { start: f.start!, end: f.end, days: days(f.start!, f.end), form: f.form, filed: f.filed, fy: f.fy, fp: f.fp };
        p[field] = f.val;
        // the row's filing is the latest of the figures' (an amendment of one column dates the row)
        if (f.filed > p.filed) Object.assign(p, { form: f.form, filed: f.filed });
        byKey.set(key, p);
      }
    };
    take(revenue, "revenue");
    take(netIncome, "netIncome");
    take(eps, "eps");
    return {
      periods: [...byKey.values()].sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0)).slice(0, ROWS),
      concepts: { ...(revenue ? { revenue: revenue.name } : {}), ...(netIncome ? { netIncome: netIncome.name } : {}), ...(eps ? { eps: eps.name } : {}) },
      currency: revenue?.unit ?? netIncome?.unit,
    };
  };
  const annual = rows(YEAR_DAYS);
  const quarterly = rows(QUARTER_DAYS);
  // the shares outstanding: an instant, the latest one on any filing's cover
  let shares: Financials["shares"];
  let sharesConcept: string | undefined;
  for (const name of SHARES_CONCEPTS) {
    const got = factsOf(facts, name, "shares");
    if (!got) continue;
    const latest = got.list.reduce<Fact | undefined>((m, f) => (!m || f.end > m.end || (f.end === m.end && f.filed > m.filed) ? f : m), undefined);
    if (latest) {
      shares = { value: latest.val, asOf: latest.end, form: latest.form, filed: latest.filed };
      sharesConcept = name;
      break;
    }
  }
  if (!annual.periods.length && !quarterly.periods.length && !shares) return no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} has no revenue, income or share figures tagged for ${company}: a fund, a trust, or a company that files no 10-K or 10-Q has none`, native: { cik } });
  const filings = [...annual.periods, ...quarterly.periods, ...(shares ? [shares] : [])];
  const latest = filings.reduce<{ form: string; filed: string } | undefined>((m, f) => (!m || f.filed > m.filed ? { form: f.form, filed: f.filed } : m), undefined);
  return {
    symbol,
    cik,
    company,
    annual: annual.periods,
    quarterly: quarterly.periods,
    ...(shares ? { shares } : {}),
    concepts: { ...annual.concepts, ...quarterly.concepts, ...(sharesConcept ? { shares: sharesConcept } : {}) },
    currency: annual.currency ?? quarterly.currency ?? "USD",
    source: SEC_SOURCE,
    filingsUrl: secFilingsUrl(cik),
    ...(latest ? { latest } : {}),
    readAt,
  };
}

/** the SEC's own page for a reader it does not take: a 403 that names its rule */
const UNDECLARED = /Request Rate Threshold Exceeded|Undeclared Automated Tool/i;

export interface SecEdgarDeps {
  /** the network, already behind the fixed-host guard for SEC_HOSTS */
  http: Http;
  clock?: (() => number) | undefined;
  /** the account's user agent at the SEC (secUserAgent); undefined: nothing is asked, and every read says why */
  userAgent?: string | undefined;
}

/** THE READER: the ticker map and a company's facts, each asked once and kept — an answer for its while (TICKERS_KEEP_MS, FACTS_KEEP_MS),
 * a refusal for the wait it names or FAIL_KEEP_MS — one request at a time per URL, paced under the SEC's limit */
export class SecEdgar {
  private readonly http: Http;
  private readonly clock: () => number;
  private readonly userAgent: string | undefined;
  private tickers: { until: number; value: Map<string, { cik: string; title: string }> | Refusal } | undefined;
  private readonly facts = new Map<string, { until: number; value: Financials | Refusal }>();
  private readonly companies = new Map<string, { until: number; value: Company | Refusal }>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private nextAt = 0;

  constructor(deps: SecEdgarDeps) {
    this.http = deps.http;
    this.clock = deps.clock ?? Date.now;
    this.userAgent = deps.userAgent;
  }

  /** a company's figures by its ticker, as the account writes it (BRK.B): the SEC's spelling is asked (BRK-B) */
  async financials(symbol: string): Promise<Financials | Refusal> {
    const sym = symbol.trim().toUpperCase();
    if (!SEC_TICKER.test(sym)) return no("E_ACCOUNT_BAD_ACTION", { message: "financials are read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
    if (!this.userAgent) return no("E_ACCOUNT_CREDENTIAL", { venue: SEC_VENUE, message: SEC_CONTACT_WORDS, detail: { setting: "SEC_CONTACT" } });
    const map = await this.tickerMap();
    if (isRefusal(map)) return map;
    const hit = map.get(sym.replace(".", "-"));
    if (!hit) return no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} lists no company under ${sym}: a fund, a foreign listing or a very new one has no filings of its own there`, native: { symbol: sym } });
    return this.companyFacts(hit.cik, sym);
  }

  /** a company's own record — who it is, its fiscal year end, where it is incorporated, its latest reports and newest filings — by its
   * ticker, through the same door as its figures */
  async company(symbol: string): Promise<Company | Refusal> {
    const sym = symbol.trim().toUpperCase();
    if (!SEC_TICKER.test(sym)) return no("E_ACCOUNT_BAD_ACTION", { message: "a company's record is read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
    if (!this.userAgent) return no("E_ACCOUNT_CREDENTIAL", { venue: SEC_VENUE, message: SEC_CONTACT_WORDS, detail: { setting: "SEC_CONTACT" } });
    const map = await this.tickerMap();
    if (isRefusal(map)) return map;
    const hit = map.get(sym.replace(".", "-"));
    if (!hit) return no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} lists no company under ${sym}: a fund, a foreign listing or a very new one has no filings of its own there`, native: { symbol: sym } });
    return this.submissions(hit.cik, sym);
  }

  private async submissions(cik: string, symbol: string): Promise<Company | Refusal> {
    const now = this.clock();
    const kept = this.companies.get(cik);
    if (kept && now < kept.until) return kept.value;
    const url = secSubmissionsUrl(cik);
    const got = await this.once(url, async () => {
      const r = await this.get(url);
      return isRefusal(r) ? r : pickCompany(r, symbol, new Date(this.clock()).toISOString());
    });
    this.companies.set(cik, { until: this.clock() + (isRefusal(got) ? this.holdOf(got) : COMPANY_KEEP_MS), value: got });
    if (this.companies.size > 200) this.companies.delete(this.companies.keys().next().value!);
    return got;
  }

  private async tickerMap(): Promise<Map<string, { cik: string; title: string }> | Refusal> {
    const now = this.clock();
    if (this.tickers && now < this.tickers.until) return this.tickers.value;
    const got = await this.once(SEC_TICKERS_URL, async () => {
      const r = await this.get(SEC_TICKERS_URL);
      if (isRefusal(r)) return r;
      const map = new Map<string, { cik: string; title: string }>();
      for (const row of Object.values(isRec(r) ? r : {})) {
        if (!isRec(row) || typeof row.ticker !== "string" || (typeof row.cik_str !== "number" && typeof row.cik_str !== "string")) continue;
        map.set(row.ticker.toUpperCase(), { cik: String(row.cik_str).padStart(10, "0"), title: typeof row.title === "string" ? row.title : row.ticker });
      }
      return map.size ? map : no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} answered its ticker list in a way this could not read` });
    });
    this.tickers = { until: this.clock() + (isRefusal(got) ? this.holdOf(got) : TICKERS_KEEP_MS), value: got };
    return got;
  }

  private async companyFacts(cik: string, symbol: string): Promise<Financials | Refusal> {
    const now = this.clock();
    const kept = this.facts.get(cik);
    if (kept && now < kept.until) return kept.value;
    const url = secFactsUrl(cik);
    const got = await this.once(url, async () => {
      const r = await this.get(url);
      return isRefusal(r) ? r : pickFinancials(r, symbol, new Date(this.clock()).toISOString());
    });
    this.facts.set(cik, { until: this.clock() + (isRefusal(got) ? this.holdOf(got) : FACTS_KEEP_MS), value: got });
    // the map and the facts are kept small: a drawer opens a company at a time
    if (this.facts.size > 200) this.facts.delete(this.facts.keys().next().value!);
    return got;
  }

  /** a refusal is kept for the wait it names (public-markets.ts holdBackMs), else a minute */
  private holdOf(r: Refusal): number {
    return Math.max(holdBackMs(r, this.clock()), FAIL_KEEP_MS);
  }

  /** one request at a time per URL, however many drawers ask */
  private once<T>(url: string, run: () => Promise<T>): Promise<T> {
    const was = this.pending.get(url) as Promise<T> | undefined;
    if (was) return was;
    const p = run().finally(() => this.pending.delete(url));
    this.pending.set(url, p);
    return p;
  }

  /** one GET, paced, with the account's user agent: the JSON it answered, or a refusal in the SEC's words */
  private async get(url: string): Promise<unknown | Refusal> {
    await this.pace();
    let r;
    try {
      r = await this.http(url, { headers: { "user-agent": this.userAgent!, accept: "application/json" }, timeoutMs: SEC_TIMEOUT_MS });
    } catch (err) {
      return unreachable(SEC_VENUE, SEC_NAME, err);
    }
    if (r.status === 403 && UNDECLARED.test(r.text)) return no("E_VENUE_REJECTED", { venue: SEC_VENUE, message: `${SEC_NAME} turned the request away as an undeclared reader (its fair-access rule): SEC_CONTACT is sent as the account's contact, so set it to an address the SEC can reach`, native: { status: 403, said: "Request Rate Threshold Exceeded" } });
    if (r.status < 200 || r.status >= 300 || r.body === undefined) return publicNo(SEC_VENUE, SEC_NAME, r);
    return r.body;
  }

  private pace(): Promise<void> {
    const now = this.clock();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + SEC_GAP_MS;
    return at > now ? new Promise((resolve) => setTimeout(resolve, at - now)) : Promise.resolve();
  }
}
