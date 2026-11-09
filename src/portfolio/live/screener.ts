/** THE SCREENER, KEYLESS: every US-listed share as Nasdaq's screener lists it — the symbol, the name, the last sale, the day's change, the
 * market cap, the country, the IPO year, the volume, the sector and the industry — read in one file and screened here by the account's
 * own rule (a terminal's EQS), and folded by sector and industry into a map weighted by market cap (IMAP). Every figure is Nasdaq's as
 * written; the screen is arithmetic over them.
 *
 *   api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true (the host of the calendars, the quotes and the
 *   security pages, read with the same desktop browser user agent) answers the whole list at once under `download=true`: {data: {asOf,
 *   headers, rows: [{symbol "A", name, lastsale "$174.72", netchange "2.94", pctchange "1.711%", marketCap "49258609371.00" (or ""),
 *   country, ipoyear "1999" (or ""), volume "2048545", sector, industry, url}]}} — 7,127 rows, 2.2 MB, 0.8 s from this machine on
 *   2026-11-09; 13 sectors (700 rows with none), 152 industries; 1,316 rows with no market cap (preferred shares, units, warrants,
 *   funds); a preferred share's symbol carries a caret (ABR^D). The list is kept SCREENER_KEEP_MS (the quotes in it are the day's, not
 *   live: a screen is a list to look at, each row opening the market with the account's own quote).
 * Every GET goes through the fixed-host guard (SCREENER_HOSTS); a refusal held a minute at least (holdBackMs) */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { figure } from "./calendars.ts";
import { fixedHosts, holdBackMs, isRec, list, publicNo, rec, str } from "./public-markets.ts";
import { type Http, type HttpReply, unreachable } from "./types.ts";
import { NASDAQ_UA } from "./us-quotes.ts";

export const SCREENER_HOSTS: readonly string[] = ["api.nasdaq.com"];
export const SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true";
export const SCREENER_KEEP_MS = 300_000;
export const SCREENER_FAIL_MS = 60_000;
export const SCREENER_TIMEOUT_MS = 20_000;
export const SCREENER_MAX_BYTES = 20_000_000;
export const SCREEN_LIMIT_MOST = 500;
export const SCREEN_LIMIT = 100;
/** the sorts a screen takes, each a column of the row */
export const SCREEN_SORTS = ["marketCap", "changePct", "volume", "price", "symbol", "name", "ipoYear", "dollarVolume"] as const;
export type ScreenSort = (typeof SCREEN_SORTS)[number];
const SYMBOL = /^[A-Z]{1,5}([./-][A-Z])?$/;
const WORD = /^[A-Za-z0-9 &'.,:/()-]{1,80}$/;

export interface ScreenRow {
  symbol: string;
  name: string;
  price?: number | undefined;
  change?: number | undefined;
  changePct?: number | undefined;
  marketCapUsd?: number | undefined;
  volume?: number | undefined;
  /** the day's dollar volume: the last sale times the volume, where both are there */
  dollarVolume?: number | undefined;
  country?: string | undefined;
  ipoYear?: number | undefined;
  sector?: string | undefined;
  industry?: string | undefined;
}
export interface ScreenAsk {
  sector?: string | undefined;
  industry?: string | undefined;
  country?: string | undefined;
  /** market cap in dollars */
  capMin?: number | undefined;
  capMax?: number | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  /** the day's change in percent */
  changeMin?: number | undefined;
  changeMax?: number | undefined;
  volumeMin?: number | undefined;
  ipoFrom?: number | undefined;
  ipoTo?: number | undefined;
  /** words of the name or the symbol */
  q?: string | undefined;
  sort?: ScreenSort | undefined;
  dir?: "asc" | "desc" | undefined;
  limit?: number | undefined;
}
export interface MapCell {
  name: string;
  /** rows with a market cap, which weigh the change; `rows` every row in the group */
  n: number;
  rows: number;
  capUsd: number;
  /** the day's change in percent, weighted by market cap over the rows that have one */
  changePct?: number | undefined;
  /** the largest by cap, for a label */
  top: Array<{ symbol: string; capUsd: number; changePct?: number | undefined }>;
}
export interface SectorCell extends MapCell {
  industries: MapCell[];
}
export interface ScreenView {
  asOf: string;
  readAt: string;
  /** Nasdaq's own stamp of the list, as written */
  listAsOf?: string | undefined;
  /** how many rows the whole list has, and how many the screen matched */
  universe: number;
  matched: number;
  rows: ScreenRow[];
  /** every sector with its industries, by market cap: the map, and the pickers' choices */
  sectors: SectorCell[];
  countries: Array<{ name: string; n: number }>;
  ask: ScreenAsk;
  from: string;
  notes: string[];
}
export interface ScreenerReader {
  screen(ask: ScreenAsk): Promise<ScreenView | Refusal>;
  clear(): void;
}
export interface ScreenerDeps {
  http: Http;
  clock?: (() => number) | undefined;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Nasdaq's rows as rows: the figures from their strings; a row that is no common share's (a caret, a unit, a warrant) left out */
export function pickRows(body: unknown): { rows: ScreenRow[]; listAsOf?: string | undefined } {
  const d = rec(rec(body).data);
  const out: ScreenRow[] = [];
  for (const r of list(d.rows)) {
    if (!isRec(r)) continue;
    const symbol = (str(r.symbol) ?? "").trim().toUpperCase();
    if (!SYMBOL.test(symbol)) continue;
    const name = (str(r.name) ?? "").trim().slice(0, 120);
    if (!name) continue;
    const price = figure(r.lastsale);
    const change = figure(String(r.netchange ?? "").replace(/^\+/, ""));
    const changePct = figure(String(r.pctchange ?? "").replace(/^\+/, ""));
    const cap = figure(r.marketCap);
    const volume = figure(r.volume);
    const ipo = figure(r.ipoyear);
    const sector = (str(r.sector) ?? "").trim();
    const industry = (str(r.industry) ?? "").trim();
    const country = (str(r.country) ?? "").trim();
    out.push({
      symbol,
      name,
      ...(price !== undefined && price > 0 ? { price } : {}),
      ...(change !== undefined ? { change } : {}),
      ...(changePct !== undefined ? { changePct } : {}),
      ...(cap !== undefined && cap > 0 ? { marketCapUsd: cap } : {}),
      ...(volume !== undefined && volume >= 0 ? { volume } : {}),
      ...(price !== undefined && price > 0 && volume !== undefined ? { dollarVolume: Math.round(price * volume) } : {}),
      ...(country ? { country: country.slice(0, 40) } : {}),
      ...(ipo !== undefined && ipo >= 1900 ? { ipoYear: ipo } : {}),
      ...(sector ? { sector: sector.slice(0, 60) } : {}),
      ...(industry ? { industry: industry.slice(0, 80) } : {}),
    });
  }
  const asOf = str(d.asOf);
  return { rows: out, ...(asOf ? { listAsOf: asOf } : {}) };
}
/** what is asked, checked: words and figures in their places; a refusal where one is not */
export function checkAsk(raw: Record<string, unknown>): ScreenAsk | Refusal {
  const ask: ScreenAsk = {};
  const word = (k: "sector" | "industry" | "country") => {
    const v = raw[k];
    if (v === undefined || v === "") return undefined;
    if (typeof v !== "string" || !WORD.test(v)) return no("E_ACCOUNT_BAD_ACTION", { message: `${k} is a name as Nasdaq writes it (letters, digits, spaces, & ' . , : / ( ) -), 80 characters at most` });
    ask[k] = v.trim();
    return undefined;
  };
  for (const k of ["sector", "industry", "country"] as const) {
    const r = word(k);
    if (r) return r;
  }
  const num = (k: keyof ScreenAsk, min: number, max: number) => {
    const v = raw[k];
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d{1,15}(\.\d{1,6})?$/.test(v.trim()) ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < min || n > max) return no("E_ACCOUNT_BAD_ACTION", { message: `${k} is a figure between ${min} and ${max}` });
    (ask as Record<string, unknown>)[k] = n;
    return undefined;
  };
  for (const [k, min, max] of [["capMin", 0, 1e15], ["capMax", 0, 1e15], ["priceMin", 0, 1e7], ["priceMax", 0, 1e7], ["changeMin", -100, 100_000], ["changeMax", -100, 100_000], ["volumeMin", 0, 1e12], ["ipoFrom", 1900, 2100], ["ipoTo", 1900, 2100], ["limit", 1, SCREEN_LIMIT_MOST]] as const) {
    const r = num(k, min, max);
    if (r) return r;
  }
  if (raw.q !== undefined && raw.q !== "") {
    if (typeof raw.q !== "string" || raw.q.length > 60) return no("E_ACCOUNT_BAD_ACTION", { message: "q is a few words of the name or the symbol, 60 characters at most" });
    ask.q = raw.q.trim();
  }
  if (raw.sort !== undefined && raw.sort !== "") {
    if (!SCREEN_SORTS.includes(raw.sort as ScreenSort)) return no("E_ACCOUNT_BAD_ACTION", { message: `sort is one of ${SCREEN_SORTS.join(", ")}` });
    ask.sort = raw.sort as ScreenSort;
  }
  if (raw.dir !== undefined && raw.dir !== "") {
    if (raw.dir !== "asc" && raw.dir !== "desc") return no("E_ACCOUNT_BAD_ACTION", { message: "dir is asc or desc" });
    ask.dir = raw.dir;
  }
  return ask;
}
const same = (a: string | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();
/** the rows a screen keeps, in the order asked (market cap, the largest first, unless said) */
export function screen(rows: ScreenRow[], ask: ScreenAsk): ScreenRow[] {
  const q = ask.q ? ask.q.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const kept = rows.filter((r) =>
    (ask.sector === undefined || same(r.sector, ask.sector)) &&
    (ask.industry === undefined || same(r.industry, ask.industry)) &&
    (ask.country === undefined || same(r.country, ask.country)) &&
    (ask.capMin === undefined || (r.marketCapUsd !== undefined && r.marketCapUsd >= ask.capMin)) &&
    (ask.capMax === undefined || (r.marketCapUsd !== undefined && r.marketCapUsd <= ask.capMax)) &&
    (ask.priceMin === undefined || (r.price !== undefined && r.price >= ask.priceMin)) &&
    (ask.priceMax === undefined || (r.price !== undefined && r.price <= ask.priceMax)) &&
    (ask.changeMin === undefined || (r.changePct !== undefined && r.changePct >= ask.changeMin)) &&
    (ask.changeMax === undefined || (r.changePct !== undefined && r.changePct <= ask.changeMax)) &&
    (ask.volumeMin === undefined || (r.volume !== undefined && r.volume >= ask.volumeMin)) &&
    (ask.ipoFrom === undefined || (r.ipoYear !== undefined && r.ipoYear >= ask.ipoFrom)) &&
    (ask.ipoTo === undefined || (r.ipoYear !== undefined && r.ipoYear <= ask.ipoTo)) &&
    (!q.length || q.every((w) => r.symbol.toLowerCase().includes(w) || r.name.toLowerCase().includes(w))),
  );
  const sort: ScreenSort = ask.sort ?? "marketCap";
  const dir = ask.dir ?? (sort === "symbol" || sort === "name" ? "asc" : "desc");
  const key = (r: ScreenRow): number | string | undefined => (sort === "marketCap" ? r.marketCapUsd : sort === "changePct" ? r.changePct : sort === "volume" ? r.volume : sort === "price" ? r.price : sort === "ipoYear" ? r.ipoYear : sort === "dollarVolume" ? r.dollarVolume : sort === "name" ? r.name : r.symbol);
  const sign = dir === "asc" ? 1 : -1;
  return kept.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    // a row without the figure goes last whichever way
    if (ka === undefined && kb === undefined) return a.symbol < b.symbol ? -1 : 1;
    if (ka === undefined) return 1;
    if (kb === undefined) return -1;
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
}
function cell(name: string, rows: ScreenRow[]): MapCell {
  const capped = rows.filter((r) => r.marketCapUsd !== undefined && r.marketCapUsd > 0);
  const capUsd = capped.reduce((a, r) => a + r.marketCapUsd!, 0);
  const weighed = capped.filter((r) => r.changePct !== undefined);
  const wcap = weighed.reduce((a, r) => a + r.marketCapUsd!, 0);
  const changePct = wcap > 0 ? r2(weighed.reduce((a, r) => a + r.marketCapUsd! * r.changePct!, 0) / wcap) : undefined;
  const top = [...capped].sort((a, b) => b.marketCapUsd! - a.marketCapUsd!).slice(0, 5).map((r) => ({ symbol: r.symbol, capUsd: r.marketCapUsd!, ...(r.changePct !== undefined ? { changePct: r.changePct } : {}) }));
  return { name, n: capped.length, rows: rows.length, capUsd, ...(changePct !== undefined ? { changePct } : {}), top };
}
/** the map: every sector with its industries, the largest by cap first */
export function fold(rows: ScreenRow[]): SectorCell[] {
  const bySector = new Map<string, ScreenRow[]>();
  for (const r of rows) {
    const k = r.sector || "No sector";
    if (!bySector.has(k)) bySector.set(k, []);
    bySector.get(k)!.push(r);
  }
  return [...bySector.entries()].map(([name, list]) => {
    const byIndustry = new Map<string, ScreenRow[]>();
    for (const r of list) {
      const k = r.industry || "No industry";
      if (!byIndustry.has(k)) byIndustry.set(k, []);
      byIndustry.get(k)!.push(r);
    }
    return { ...cell(name, list), industries: [...byIndustry.entries()].map(([n, l]) => cell(n, l)).sort((a, b) => b.capUsd - a.capUsd) };
  }).sort((a, b) => b.capUsd - a.capUsd);
}
export function countriesOf(rows: ScreenRow[]): Array<{ name: string; n: number }> {
  const by = new Map<string, number>();
  for (const r of rows) if (r.country) by.set(r.country, (by.get(r.country) ?? 0) + 1);
  return [...by.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
}

interface Kept {
  until: number;
  value: { rows: ScreenRow[]; listAsOf?: string | undefined; readAt: number } | Refusal;
}
/** THE LIST, read once and screened many times */
export class NasdaqScreener implements ScreenerReader {
  private readonly guarded: Http;
  private readonly clock: () => number;
  private kept: Kept | undefined;
  private inflight: Promise<Kept["value"]> | undefined;
  private sectors: SectorCell[] | undefined;
  private countries: Array<{ name: string; n: number }> | undefined;
  constructor(deps: ScreenerDeps & { guarded: Http }) {
    this.guarded = deps.guarded;
    this.clock = deps.clock ?? Date.now;
  }
  clear(): void {
    if (this.kept && isRefusal(this.kept.value)) this.kept = undefined;
  }
  private list(): Promise<Kept["value"]> {
    const now = this.clock();
    if (this.kept && now < this.kept.until) return Promise.resolve(this.kept.value);
    if (this.inflight) return this.inflight;
    const run = async (): Promise<Kept["value"]> => {
      let r: HttpReply;
      try {
        r = await this.guarded(SCREENER_URL, { headers: { "user-agent": NASDAQ_UA, accept: "application/json, text/plain, */*" }, timeoutMs: SCREENER_TIMEOUT_MS });
      } catch (err) {
        return unreachable("nasdaq", "Nasdaq", err);
      }
      if (r.tooLong) return no("E_VENUE_REJECTED", { venue: "nasdaq", message: `Nasdaq's screener answered more than ${Math.round(SCREENER_MAX_BYTES / 1_000_000)} MB, so it was not read` });
      if (r.status < 200 || r.status >= 300) return publicNo("nasdaq", "Nasdaq", r);
      const picked = pickRows(r.body);
      if (!picked.rows.length) return no("E_VENUE_REJECTED", { venue: "nasdaq", message: "Nasdaq's screener answered in a way this could not read" });
      return { rows: picked.rows, ...(picked.listAsOf ? { listAsOf: picked.listAsOf } : {}), readAt: this.clock() };
    };
    this.inflight = run().then((v) => {
      const at = this.clock();
      this.kept = { until: at + (isRefusal(v) ? Math.max(holdBackMs(v), SCREENER_FAIL_MS) : SCREENER_KEEP_MS), value: v };
      if (!isRefusal(v)) {
        this.sectors = fold(v.rows);
        this.countries = countriesOf(v.rows);
      }
      this.inflight = undefined;
      return v;
    });
    return this.inflight;
  }
  async screen(raw: ScreenAsk | Record<string, unknown> = {}): Promise<ScreenView | Refusal> {
    const ask = checkAsk(raw as Record<string, unknown>);
    if (isRefusal(ask)) return ask;
    const l = await this.list();
    if (isRefusal(l)) return l;
    const matched = screen(l.rows, ask);
    const limit = ask.limit ?? SCREEN_LIMIT;
    return {
      asOf: new Date(this.clock()).toISOString(),
      readAt: new Date(l.readAt).toISOString(),
      ...(l.listAsOf ? { listAsOf: l.listAsOf } : {}),
      universe: l.rows.length,
      matched: matched.length,
      rows: matched.slice(0, limit),
      sectors: this.sectors ?? fold(l.rows),
      countries: this.countries ?? countriesOf(l.rows),
      ask,
      from: "Nasdaq's screener · as written",
      notes: [
        "Every US-listed common share as Nasdaq's screener lists it, read in one file: the last sale, the day's change and the volume are the day's figures as Nasdaq wrote them when the list was read, not live quotes; a row opens the market, where the account's own quote is. Preferred shares, units and warrants are left out.",
        `Kept ${SCREENER_KEEP_MS / 60_000} minutes. The screen and the sort are arithmetic over Nasdaq's figures; the map weighs each sector's and industry's day by market cap over the rows that have one.`,
      ],
    };
  }
}
/** the reader as the service makes it: the GET behind the fixed-host guard, the whole file within SCREENER_MAX_BYTES */
export const nasdaqScreener = (deps: ScreenerDeps): NasdaqScreener => new NasdaqScreener({ ...deps, guarded: fixedHosts(deps.http, SCREENER_HOSTS, SCREENER_TIMEOUT_MS, { maxBytes: SCREENER_MAX_BYTES }) });
