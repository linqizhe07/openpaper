/** THE CALENDARS, KEYLESS: what is scheduled — the economic releases of the day with their consensus and what came out, the companies
 * reporting earnings with the EPS the analysts expect, the shares going ex-dividend, the splits, the IPOs of the month — read from the
 * same Nasdaq pages the quotes are (us-quotes.ts: api.nasdaq.com, a desktop browser's user agent, since the API answers nothing else),
 * through the fixed-host guard, one day a request, each day kept a while. Nothing is estimated here: the consensus is Nasdaq's figure as
 * written, and a figure not written is a dash.
 *
 * What is read, as read from this machine on Mon 2026-11-09 (14:00–15:10 New York, 1.1–3.5 s a call):
 *   GET api.nasdaq.com/api/calendar/economicevents?date=YYYY-MM-DD  {data: {asOf: "Mon, Nov 9, 2026", headers, rows: [{gmt: "18:50", country:
 *                       "Japan", eventName: "Foreign Reserves (USD)", actual: "1,179.1B", consensus: " ", previous: "1,178.4B", description}]}}.
 *                       THE FIELD NAMED gmt IS NEW YORK TIME: Japan's reserves come out at 08:50 Tokyo, which is 18:50 the day before in
 *                       New York (the row's date is the New York date), so it is read as New York's and said as the page says every time
 *   GET api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD        {data: {asOf, rows: [{time: "time-pre-market" | "time-after-hours" |
 *                       "time-not-supplied", symbol, name, marketCap: "$88,559,133,000", fiscalQuarterEnding: "Sep/2026", epsForecast: "$3.90",
 *                       noOfEsts: "5", lastYearRptDt: "11/07/2025", lastYearEPS: "$3.04"}]}} — 227 rows on a day in earnings season
 *   GET api.nasdaq.com/api/calendar/dividends?date=YYYY-MM-DD       {data: {calendar: {asOf, rows: [{symbol, companyName, dividend_Ex_Date:
 *                       "11/09/2026", payment_Date, record_Date, dividend_Rate: 0.2, indicated_Annual_Dividend: 0.8, announcement_Date}]}}}
 *   GET api.nasdaq.com/api/calendar/splits?date=YYYY-MM-DD          {data: {asOf, rows: [{symbol, name, ratio: "8:1", executionDate: "11/20/2026"}]}}
 *                       — the rows are the splits announced around the date, not the ones executing on it
 *   GET api.nasdaq.com/api/ipo/calendar?date=YYYY-MM                 {data: {priced: {rows: [{proposedTickerSymbol, companyName, proposedExchange,
 *                       proposedSharePrice, sharesOffered, pricedDate, dollarValueOfSharesOffered, dealStatus}]}, upcoming: {upcomingTable:
 *                       {rows: [{… expectedPriceDate}]}}, filed: {rows: [{companyName, filedDate, dollarValueOfSharesOffered}]}, withdrawn}}
 * Every answer: {data, message, status: {rCode, bCodeMessage}}; a day with nothing answers rows: [] or data: null. Dates are written as the
 * US writes them (MM/DD/YYYY); money as strings with "$" and commas; the EPS as "$3.90" or "($0.12)" for a loss. These are the website's own
 * unofficial endpoints, not a licensed feed: either may change or refuse without notice, and the answer says which did. */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { fromEt } from "../account/calendar.ts";
import { no } from "../refuse.ts";
import { fin, holdBackMs, isRec, list, publicNo, rec, str } from "./public-markets.ts";
import { unreachable, type Http } from "./types.ts";
import { NASDAQ_UA } from "./us-quotes.ts";

export const CALENDAR_HOSTS: readonly string[] = ["api.nasdaq.com"];
export const CALENDAR_BASE = "https://api.nasdaq.com/api";
export const CALENDAR_VENUE = "nasdaq-calendar";
export const CALENDAR_NAME = "Nasdaq's calendars";
export const CALENDAR_TIMEOUT_MS = 8_000;
/** a day's rows are kept this long: a past day's for a day (what came out does not change), today's and the days to come a quarter hour */
export const CALENDAR_KEEP_MS = 900_000;
export const CALENDAR_PAST_KEEP_MS = 86_400_000;
export const CALENDAR_FAIL_MS = 60_000;
/** the most days one read spans */
export const CALENDAR_DAYS_MOST = 7;
/** one day's calls are made one at a time, this far apart, beside the quotes' own pace at the same host (history.ts HOST_LIMITS nasdaq: 8
 * in 2 s shared): a calendar never takes more than one slot a quarter second */
export const CALENDAR_GAP_MS = 250;
export type CalendarKind = "economic" | "earnings" | "dividends" | "splits" | "ipos";
export const CALENDAR_KINDS: ReadonlyArray<{ id: CalendarKind; label: string; code: string }> = [
  { id: "economic", label: "Economic releases", code: "ECO" },
  { id: "earnings", label: "Earnings", code: "ERN" },
  { id: "dividends", label: "Dividends", code: "DVD" },
  { id: "splits", label: "Splits", code: "SPLT" },
  { id: "ipos", label: "IPOs", code: "IPO" },
];
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** one economic release */
export interface EconomicEvent {
  kind: "economic";
  /** the New York day (YYYY-MM-DD) and the moment, where the row gave a time */
  day: string;
  at?: string | undefined;
  /** the time as the row wrote it, New York's (HH:MM), for a row whose moment this could not make */
  time?: string | undefined;
  country: string;
  event: string;
  actual?: string | undefined;
  consensus?: string | undefined;
  previous?: string | undefined;
  /** what came out against the consensus, where both are figures: above, below, or the same */
  against?: "above" | "below" | "same" | undefined;
  description?: string | undefined;
}
export interface EarningsEvent {
  kind: "earnings";
  day: string;
  symbol: string;
  name: string;
  /** before the open, after the close, or not said */
  when: "pre" | "post" | "unknown";
  marketCapUsd?: number | undefined;
  quarterEnding?: string | undefined;
  epsForecast?: number | undefined;
  estimates?: number | undefined;
  lastYearDay?: string | undefined;
  lastYearEps?: number | undefined;
}
export interface DividendEvent {
  kind: "dividend";
  day: string;
  symbol: string;
  name: string;
  exDay: string;
  paymentDay?: string | undefined;
  recordDay?: string | undefined;
  announcedDay?: string | undefined;
  amount?: number | undefined;
  annual?: number | undefined;
}
export interface SplitEvent {
  kind: "split";
  day: string;
  symbol: string;
  name: string;
  ratio: string;
  executionDay?: string | undefined;
}
export interface IpoEvent {
  kind: "ipo";
  /** priced, upcoming (expected to price), filed, withdrawn */
  stage: "priced" | "upcoming" | "filed" | "withdrawn";
  day: string;
  symbol?: string | undefined;
  name: string;
  exchange?: string | undefined;
  priceUsd?: number | undefined;
  shares?: number | undefined;
  raisedUsd?: number | undefined;
}
export type CalendarEvent = EconomicEvent | EarningsEvent | DividendEvent | SplitEvent | IpoEvent;
export interface CalendarAsk {
  kind?: CalendarKind | string | undefined;
  /** the first day (YYYY-MM-DD, New York's); today where none is given */
  from?: string | undefined;
  /** the last day, at most CALENDAR_DAYS_MOST − 1 after `from`; `from` where none is given. IPOs are read by the month `from` falls in */
  to?: string | undefined;
  /** earnings, dividends and splits of one share alone */
  symbol?: string | undefined;
  limit?: number | undefined;
}
export interface CalendarView {
  asOf: string;
  kind: CalendarKind;
  from: string;
  to: string;
  items: CalendarEvent[];
  total: number;
  /** the days read, each with how many rows it gave and when it was read; one that could not be read says why */
  days: Array<{ day: string; count: number; readAt?: string | undefined; why?: string | undefined }>;
  missing: Array<{ venue: string; venueName: string; why: string; code?: string | undefined }>;
  notes: string[];
  symbol?: string | undefined;
}
export interface CalendarReader {
  events(ask?: CalendarAsk): Promise<CalendarView | Refusal>;
  clear(): void;
}
export interface CalendarDeps {
  /** the network, already behind fixedHosts(CALENDAR_HOSTS, …) */
  http: Http;
  clock?: (() => number) | undefined;
}

/** a New York day (YYYY-MM-DD) for a moment */
export function nyDayOf(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** a day as the US writes it (MM/DD/YYYY, or M/D/YYYY) as ISO; undefined for anything else */
export function usDay(s: unknown): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return undefined;
  const [, mo, d, y] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** a figure Nasdaq writes as text — "$88,559,133,000", "($0.12)" for a loss, "1,179.1B", "4.2%", "N/A" — as a number; undefined where it is none */
export function figure(s: unknown): number | undefined {
  if (typeof s === "number") return Number.isFinite(s) ? s : undefined;
  let t = String(s ?? "").trim();
  if (!t || /^(n\/a|na|-|—|–)$/i.test(t)) return undefined;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-") || t.startsWith("−")) {
    neg = !neg;
    t = t.slice(1);
  }
  const m = /^\$?\s*([\d,]*\.?\d+)\s*([KMBT%]?)$/i.exec(t);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, "%": 1, "": 1 }[m[2]!.toUpperCase() as "K" | "M" | "B" | "T" | "%" | ""] ?? 1;
  return (neg ? -n : n) * scale;
}
/** a release's moment: the row's New York time on its New York day, where the row gave one (HH:MM); the figure's words say the rest */
export function releaseAt(day: string, time: unknown): string | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (h > 23 || min > 59 || !d) return undefined;
  const ms = fromEt(Number(d[1]), Number(d[2]), Number(d[3]), h, min);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}
/** what came out against the consensus, where both are figures */
export function against(actual: unknown, consensus: unknown): EconomicEvent["against"] {
  const a = figure(actual);
  const c = figure(consensus);
  if (a === undefined || c === undefined) return undefined;
  return a > c ? "above" : a < c ? "below" : "same";
}
const plain = (s: unknown, max: number): string | undefined => {
  const t = str(s)?.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};

// ---- the pickers: one day's rows as events ---------------------------------------------------------------------------------------------

export function pickEconomic(body: unknown, day: string): EconomicEvent[] {
  const rows = list(rec(rec(body).data).rows);
  return rows.filter(isRec).flatMap((r): EconomicEvent[] => {
    const event = plain(r.eventName, 160);
    if (!event) return [];
    const time = plain(r.gmt, 8);
    const at = releaseAt(day, time);
    const actual = plain(r.actual, 24);
    const consensus = plain(r.consensus, 24);
    const previous = plain(r.previous, 24);
    return [{ kind: "economic", day, ...(at ? { at } : {}), ...(time && /^\d{1,2}:\d{2}$/.test(time) ? { time } : {}), country: plain(r.country, 40) ?? "", event, ...(actual ? { actual } : {}), ...(consensus ? { consensus } : {}), ...(previous ? { previous } : {}), ...(actual && consensus ? { against: against(actual, consensus) } : {}), ...(plain(r.description, 400) ? { description: plain(r.description, 400) } : {}) }];
  });
}
export function pickEarnings(body: unknown, day: string): EarningsEvent[] {
  const rows = list(rec(rec(body).data).rows);
  return rows.filter(isRec).flatMap((r): EarningsEvent[] => {
    const symbol = plain(r.symbol, 12)?.toUpperCase();
    if (!symbol) return [];
    const t = String(r.time ?? "");
    const when: EarningsEvent["when"] = /pre/i.test(t) ? "pre" : /after/i.test(t) ? "post" : "unknown";
    const cap = figure(r.marketCap);
    const eps = figure(r.epsForecast);
    const ests = figure(r.noOfEsts);
    const lastDay = usDay(r.lastYearRptDt);
    const lastEps = figure(r.lastYearEPS);
    return [{ kind: "earnings", day, symbol, name: plain(r.name, 120) ?? symbol, when, ...(cap !== undefined ? { marketCapUsd: cap } : {}), ...(plain(r.fiscalQuarterEnding, 12) ? { quarterEnding: plain(r.fiscalQuarterEnding, 12) } : {}), ...(eps !== undefined ? { epsForecast: eps } : {}), ...(ests !== undefined ? { estimates: ests } : {}), ...(lastDay ? { lastYearDay: lastDay } : {}), ...(lastEps !== undefined ? { lastYearEps: lastEps } : {}) }];
  });
}
export function pickDividends(body: unknown, day: string): DividendEvent[] {
  const rows = list(rec(rec(rec(body).data).calendar).rows);
  return rows.filter(isRec).flatMap((r): DividendEvent[] => {
    const symbol = plain(r.symbol, 12)?.toUpperCase();
    const exDay = usDay(r.dividend_Ex_Date);
    if (!symbol || !exDay) return [];
    const amount = fin(r.dividend_Rate);
    const annual = fin(r.indicated_Annual_Dividend);
    return [{ kind: "dividend", day, symbol, name: plain(r.companyName, 120) ?? symbol, exDay, ...(usDay(r.payment_Date) ? { paymentDay: usDay(r.payment_Date) } : {}), ...(usDay(r.record_Date) ? { recordDay: usDay(r.record_Date) } : {}), ...(usDay(r.announcement_Date) ? { announcedDay: usDay(r.announcement_Date) } : {}), ...(amount !== undefined ? { amount } : {}), ...(annual !== undefined ? { annual } : {}) }];
  });
}
export function pickSplits(body: unknown, day: string): SplitEvent[] {
  const rows = list(rec(rec(body).data).rows);
  return rows.filter(isRec).flatMap((r): SplitEvent[] => {
    const symbol = plain(r.symbol, 12)?.toUpperCase();
    const ratio = plain(r.ratio, 12);
    if (!symbol || !ratio) return [];
    return [{ kind: "split", day, symbol, name: plain(r.name, 120) ?? symbol, ratio, ...(usDay(r.executionDate) ? { executionDay: usDay(r.executionDate) } : {}) }];
  });
}
export function pickIpos(body: unknown, month: string): IpoEvent[] {
  const d = rec(rec(body).data);
  const one = (stage: IpoEvent["stage"], rows: unknown[], dayOf: (r: Record<string, unknown>) => string | undefined): IpoEvent[] =>
    rows.filter(isRec).flatMap((r): IpoEvent[] => {
      const name = plain(r.companyName, 120);
      if (!name) return [];
      const price = figure(r.proposedSharePrice);
      const shares = figure(r.sharesOffered);
      const raised = figure(r.dollarValueOfSharesOffered);
      const symbol = plain(r.proposedTickerSymbol, 12)?.toUpperCase();
      return [{ kind: "ipo", stage, day: dayOf(r) ?? `${month}-01`, ...(symbol ? { symbol } : {}), name, ...(plain(r.proposedExchange, 40) ? { exchange: plain(r.proposedExchange, 40) } : {}), ...(price !== undefined ? { priceUsd: price } : {}), ...(shares !== undefined ? { shares } : {}), ...(raised !== undefined ? { raisedUsd: raised } : {}) }];
    });
  return [
    ...one("priced", list(rec(d.priced).rows), (r) => usDay(r.pricedDate)),
    ...one("upcoming", list(rec(rec(d.upcoming).upcomingTable).rows), (r) => usDay(r.expectedPriceDate)),
    ...one("filed", list(rec(d.filed).rows), (r) => usDay(r.filedDate)),
    ...one("withdrawn", list(rec(d.withdrawn).rows), (r) => usDay(r.withdrawDate) ?? usDay(r.filedDate)),
  ];
}

interface Kept {
  until: number;
  value: CalendarEvent[] | Refusal;
  readAt: number;
}
/** THE CALENDARS: a day of a kind is one GET, kept a quarter hour (a past day a whole day), a refusal held a minute at least; the calls of one
 * read go one at a time, a quarter second apart, so the quotes keep their pace at the same host */
export class NasdaqCalendars implements CalendarReader {
  private readonly http: Http;
  private readonly clock: () => number;
  private readonly kept = new Map<string, Kept>();
  private readonly inflight = new Map<string, Promise<CalendarEvent[] | Refusal>>();
  private line: Promise<unknown> = Promise.resolve();
  constructor(deps: CalendarDeps) {
    this.http = deps.http;
    this.clock = deps.clock ?? Date.now;
  }
  clear(): void {
    for (const [k, v] of this.kept) if (isRefusal(v.value)) this.kept.delete(k);
  }
  private url(kind: CalendarKind, day: string): string {
    if (kind === "ipos") return `${CALENDAR_BASE}/ipo/calendar?date=${day.slice(0, 7)}`;
    const path = { economic: "economicevents", earnings: "earnings", dividends: "dividends", splits: "splits" }[kind];
    return `${CALENDAR_BASE}/calendar/${path}?date=${day}`;
  }
  /** one day's (one month's, for IPOs) events of a kind, kept or read now, one read at a time */
  private day(kind: CalendarKind, day: string): Promise<CalendarEvent[] | Refusal> {
    const key = `${kind}|${kind === "ipos" ? day.slice(0, 7) : day}`;
    const now = this.clock();
    const hit = this.kept.get(key);
    if (hit && now < hit.until) return Promise.resolve(hit.value);
    const going = this.inflight.get(key);
    if (going) return going;
    const p = this.line.then(() => this.read(kind, day)).then(async (v) => {
      const readAt = this.clock();
      const past = day < nyDayOf(readAt) && kind !== "ipos";
      const hold = isRefusal(v) ? Math.max(holdBackMs(v), CALENDAR_FAIL_MS) : past ? CALENDAR_PAST_KEEP_MS : CALENDAR_KEEP_MS;
      this.kept.set(key, { until: readAt + hold, value: v, readAt });
      this.inflight.delete(key);
      if (this.kept.size > 400) for (const [k, e] of this.kept) if (this.clock() >= e.until) this.kept.delete(k);
      return v;
    });
    this.inflight.set(key, p);
    // the next call of the line waits for this one and a gap
    this.line = p.then(() => new Promise((go) => setTimeout(go, CALENDAR_GAP_MS)), () => new Promise((go) => setTimeout(go, CALENDAR_GAP_MS)));
    return p;
  }
  private async read(kind: CalendarKind, day: string): Promise<CalendarEvent[] | Refusal> {
    let r;
    try {
      r = await this.http(this.url(kind, day), { headers: { "user-agent": NASDAQ_UA, accept: "application/json, text/plain, */*" }, timeoutMs: CALENDAR_TIMEOUT_MS });
    } catch (err) {
      return unreachable(CALENDAR_VENUE, CALENDAR_NAME, err);
    }
    if (r.status < 200 || r.status >= 300 || r.body === undefined) return publicNo(CALENDAR_VENUE, CALENDAR_NAME, r);
    const status = rec(rec(r.body).status);
    const code = fin(status.rCode);
    // Nasdaq answers 200 with its own code: 400 for a day it has nothing for is an empty day, not a refusal
    if (code !== undefined && code !== 200 && code !== 400) return no("E_VENUE_REJECTED", { venue: CALENDAR_VENUE, message: `${CALENDAR_NAME} refused the read (its code ${code})`, native: { status: code } });
    switch (kind) {
      case "economic": return pickEconomic(r.body, day);
      case "earnings": return pickEarnings(r.body, day);
      case "dividends": return pickDividends(r.body, day);
      case "splits": return pickSplits(r.body, day);
      case "ipos": return pickIpos(r.body, day.slice(0, 7));
    }
  }

  async events(ask: CalendarAsk = {}): Promise<CalendarView | Refusal> {
    const kind = CALENDAR_KINDS.find((k) => k.id === ask.kind)?.id ?? (ask.kind ? undefined : "economic");
    if (!kind) return no("E_ACCOUNT_BAD_ACTION", { message: `the calendar has these kinds: ${CALENDAR_KINDS.map((k) => k.id).join(" · ")}` });
    const today = nyDayOf(this.clock());
    const from = ask.from ? String(ask.from).trim() : today;
    const to = ask.to ? String(ask.to).trim() : from;
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) || !Number.isFinite(Date.parse(`${to}T00:00:00Z`))) return no("E_ACCOUNT_BAD_ACTION", { message: "a calendar is read for days written YYYY-MM-DD" });
    const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
    if (span < 0 || span >= CALENDAR_DAYS_MOST) return no("E_ACCOUNT_BAD_ACTION", { message: `a calendar is read for ${CALENDAR_DAYS_MOST} days at most, from the first day on` });
    const symbol = String(ask.symbol ?? "").trim().toUpperCase();
    if (symbol && !/^[A-Z]{1,6}([.-][A-Z]{1,2})?$/.test(symbol)) return no("E_ACCOUNT_BAD_ACTION", { message: "a share's calendar is read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
    const limit = Math.min(500, Math.max(1, Math.trunc(Number(ask.limit) || 200)));
    // IPOs are a month's; the other kinds a day each, today first, then the days after, then the days before
    const days = kind === "ipos" ? [from] : Array.from({ length: span + 1 }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10));
    const order = [...days].sort((a, b) => (a === today ? -1 : b === today ? 1 : a < today && b >= today ? 1 : a >= today && b < today ? -1 : a < b ? -1 : 1));
    const answers = new Map<string, CalendarEvent[] | Refusal>();
    for (const d of order) answers.set(d, await this.day(kind, d));
    const dayRows: CalendarView["days"] = [];
    const missing: CalendarView["missing"] = [];
    let items: CalendarEvent[] = [];
    for (const d of days) {
      const a = answers.get(d)!;
      const kept = this.kept.get(`${kind}|${kind === "ipos" ? d.slice(0, 7) : d}`);
      if (isRefusal(a)) {
        dayRows.push({ day: d, count: 0, why: a.message });
        missing.push({ venue: CALENDAR_VENUE, venueName: CALENDAR_NAME, why: `${d}: ${a.message}`, code: a.code });
        continue;
      }
      dayRows.push({ day: d, count: a.length, ...(kept ? { readAt: new Date(kept.readAt).toISOString() } : {}) });
      items = items.concat(a);
    }
    if (symbol) items = items.filter((e) => "symbol" in e && e.symbol === symbol);
    // the day's order: releases by their moment, earnings before the open first, then by size; dividends and splits by symbol; IPOs by stage
    items.sort((a, b) => (kind === "ipos" || a.day === b.day ? within(a, b) : a.day < b.day ? -1 : 1));
    const total = items.length;
    const notes = [
      "Nasdaq's calendars, read without a key from its own pages: the consensus is the figure Nasdaq writes, what came out is as it wrote it, and nothing here is estimated by the account.",
      kind === "economic" ? "Times are New York's. A release whose row carries no time is listed without one." : kind === "earnings" ? "Before the open, after the close or not said, as Nasdaq has it; the EPS forecast is the analysts' consensus Nasdaq shows, with how many estimates stand behind it." : kind === "ipos" ? "The month's deals by stage: priced, expected to price, filed, withdrawn." : "",
      `Today's and the coming days' rows are kept ${Math.round(CALENDAR_KEEP_MS / 60_000)} minutes; a past day's a day.`,
    ].filter(Boolean);
    return { asOf: new Date(this.clock()).toISOString(), kind, from, to, items: items.slice(0, limit), total, days: dayRows, missing, notes, ...(symbol ? { symbol } : {}) };
  }
}
/** the order inside one day */
function within(a: CalendarEvent, b: CalendarEvent): number {
  if (a.kind === "economic" && b.kind === "economic") {
    // by the moment, the undated last (compared as code points: a locale's collation would put the undated first)
    const ta = a.at ?? "~";
    const tb = b.at ?? "~";
    return ta < tb ? -1 : ta > tb ? 1 : a.country.localeCompare(b.country);
  }
  if (a.kind === "earnings" && b.kind === "earnings") {
    const w = { pre: 0, unknown: 1, post: 2 };
    return w[a.when] - w[b.when] || (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0) || a.symbol.localeCompare(b.symbol);
  }
  if (a.kind === "ipo" && b.kind === "ipo") {
    const s = { priced: 0, upcoming: 1, filed: 2, withdrawn: 3 };
    return s[a.stage] - s[b.stage] || a.day.localeCompare(b.day);
  }
  const sa = "symbol" in a ? a.symbol ?? "" : "";
  const sb = "symbol" in b ? b.symbol ?? "" : "";
  return sa.localeCompare(sb);
}
