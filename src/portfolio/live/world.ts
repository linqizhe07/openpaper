/** THE WORLD'S MARKETS, KEYLESS: the four boards a terminal keeps on one screen — the equity indices, the US yield curve, the currencies,
 * the commodities — each from a public source read without a key, each said with where it comes from and how far behind it is. Nothing
 * here is the account's own figure.
 *
 *   INDICES      Cboe's delayed index quotes, cdn-api.cboe.com/api/global/delayed_quotes/quotes/_SPX.json (the same host and shape as its
 *                stock quotes, public-stocks.ts): {timestamp (UTC, when Cboe wrote the file), data: {symbol "^SPX", security_type "index",
 *                current_price, price_change, price_change_percent, open, high, low, close, prev_day_close, last_trade_time (New York
 *                time, no zone written; ^TNX writes Chicago's with its offset)}}, FIFTEEN MINUTES BEHIND. Read from this machine on
 *                2026-11-09 at 14:08 New York: ^SPX ^NDX ^DJX ^RUT ^OEX ^XSP ^VIX ^VXN ^VVIX ^MXEA ^MXEF ^TNX answered (0.2–0.7 s); ^SOX
 *                and ^DJI stood days old (not read); ^DXY and ^COMP answered 403. ^DJX is the Dow divided by a hundred, said so; ^TNX is
 *                the 10-year yield times ten (48.8 = 4.88%), said as a yield
 *   RATES        the US Treasury's par yield curve, home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/
 *                {year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv — a CSV, one row a day, newest
 *                first: Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr", the
 *                yields in percent, written once a day after the close (read 2026-11-09: the newest row 11/06/2026, 0.5 s, 4 KB); last
 *                year's file for the curve a year ago. The official figures, a day behind by nature
 *   CURRENCIES   Kraken's spot tickers for its fiat pairs, api.kraken.com/0/public/Ticker?pair=EURUSD,… (read 2026-11-09, 0.24 s): {result:
 *                {ZEURZUSD: {a [ask], b [bid], c [last], o today's open, h, l, v}}} — a key is the pair with Kraken's Z before a fiat code —
 *                LIVE, a real market's own prices, nine pairs (its asset list names AUD/JPY, EUR/AUD and EUR/CAD too, but on 2026-11-09 the
 *                ticker answered 503 "EService:Unavailable" to most requests that named one of them, and the same 503 now and then to any
 *                request at all — so those three are not asked, a 503 is asked once more a moment later, and the last answer stands in
 *                where it is still refused); and the ECB's euro
 *                reference rates, www.ecb.europa.eu/stats/eurofxref/
 *                eurofxref-daily.xml (<Cube time='2026-11-09'><Cube currency='USD' rate='1.1216'/>…>, thirty currencies, once a day
 *                around 16:00 Frankfurt) for the currencies Kraken does not trade, each said as the ECB's fixing of that day
 *   COMMODITIES  Hyperliquid's xyz builder-dex perpetuals (api.hyperliquid.xyz/info {"type":"metaAndAssetCtxs","dex":"xyz"}, the POST
 *                public-markets.ts hyperliquidInfo makes, read 2026-11-09: 144 markets, 0.22 s): for GOLD, SILVER, COPPER, PLATINUM,
 *                PALLADIUM, CL (WTI), BRENTOIL, NATGAS, CORN, WHEAT the context's oraclePx — the reference price the dex marks the
 *                contract to, around the clock — with the mark, the 24-hour change (prevDayPx) and the day's volume. A perpetual's
 *                oracle is not the commodity's exchange price: it is said as "Hyperliquid xyz · oracle", and the board says so once
 * Every GET goes through the fixed-host guard (WORLD_HOSTS; the Treasury's CSV and the ECB's XML read whole, within WORLD_MAX_BYTES);
 * Hyperliquid's POST through hyperliquidInfo. Each source is kept its own while, refused its own while (holdBackMs, a minute at least), and
 * a source late or refusing now has its last answer stand in, said so */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { fin, fixedHosts, holdBackMs, hyperliquidInfo, isRec, list, pos, publicNo, rec, str } from "./public-markets.ts";
import { cboeTimeMs } from "./public-stocks.ts";
import { unreachable, type Http, type HttpReply } from "./types.ts";

export const WORLD_HOSTS: readonly string[] = ["cdn-api.cboe.com", "home.treasury.gov", "api.kraken.com", "www.ecb.europa.eu"];
export const WORLD_MAX_BYTES = 2_000_000;
export const WORLD_TIMEOUT_MS = 8_000;
/** how long each board's answer is kept */
export const INDICES_KEEP_MS = 60_000;
export const RATES_KEEP_MS = 3_600_000;
export const FX_KEEP_MS = 10_000;
export const ECB_KEEP_MS = 3_600_000;
export const COMMODITIES_KEEP_MS = 20_000;
export const WORLD_FAIL_MS = 60_000;
export const WORLD_LAST_MS = 3_600_000;
export const WORLD_WAIT_MS = 5_000;
export const CBOE_DELAY_MS = 15 * 60_000;
const CBOE_QUOTES = "https://cdn-api.cboe.com/api/global/delayed_quotes/quotes";
export const treasuryUrl = (year: number): string => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
export const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const KRAKEN_TICKER = "https://api.kraken.com/0/public/Ticker";

/** the indices read, in the board's order: Cboe's symbol, the name, how the figure is said */
export const INDICES: ReadonlyArray<{ symbol: string; name: string; unit?: "yield" | undefined; times?: number | undefined; note?: string | undefined }> = [
  { symbol: "^SPX", name: "S&P 500" },
  { symbol: "^NDX", name: "Nasdaq-100" },
  { symbol: "^DJX", name: "Dow Jones Industrial", times: 100, note: "Cboe's DJX, the Dow divided by a hundred, times a hundred" },
  { symbol: "^RUT", name: "Russell 2000" },
  { symbol: "^OEX", name: "S&P 100" },
  { symbol: "^MXEA", name: "MSCI EAFE" },
  { symbol: "^MXEF", name: "MSCI Emerging Markets" },
  { symbol: "^VIX", name: "VIX" },
  { symbol: "^VXN", name: "VXN (Nasdaq-100 volatility)" },
  { symbol: "^VVIX", name: "VVIX" },
  { symbol: "^TNX", name: "US 10-year yield", unit: "yield", times: 0.1, note: "Cboe's TNX, the yield times ten, divided by ten" },
];
/** the fiat pairs Kraken trades, in the board's order */
export const FX_PAIRS: readonly string[] = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "EUR/GBP", "EUR/JPY", "EUR/CHF"];
/** the ECB's currencies shown against the dollar, beside Kraken's pairs: the ones Kraken does not trade */
export const ECB_SHOWN: readonly string[] = ["CNY", "HKD", "SGD", "KRW", "INR", "BRL", "MXN", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "ZAR", "NZD", "ILS", "THB", "IDR", "MYR", "PHP"];
/** the xyz perpetuals read as commodities, in the board's order: the coin and the name */
export const COMMODITIES: ReadonlyArray<{ coin: string; name: string; unit: string }> = [
  { coin: "GOLD", name: "Gold", unit: "$/oz" },
  { coin: "SILVER", name: "Silver", unit: "$/oz" },
  { coin: "PLATINUM", name: "Platinum", unit: "$/oz" },
  { coin: "PALLADIUM", name: "Palladium", unit: "$/oz" },
  { coin: "COPPER", name: "Copper", unit: "$/lb" },
  { coin: "CL", name: "WTI crude", unit: "$/bbl" },
  { coin: "BRENTOIL", name: "Brent crude", unit: "$/bbl" },
  { coin: "NATGAS", name: "Natural gas", unit: "$/MMBtu" },
  { coin: "CORN", name: "Corn", unit: "$/bu" },
  { coin: "WHEAT", name: "Wheat", unit: "$/bu" },
];
export const HL_WORLD_DEX = "xyz";
/** the Treasury's tenors, as its header names them, in months */
export const TENORS: ReadonlyArray<[string, number]> = [["1 Mo", 1], ["1.5 Month", 1.5], ["2 Mo", 2], ["3 Mo", 3], ["4 Mo", 4], ["6 Mo", 6], ["1 Yr", 12], ["2 Yr", 24], ["3 Yr", 36], ["5 Yr", 60], ["7 Yr", 84], ["10 Yr", 120], ["20 Yr", 240], ["30 Yr", 360]];

export interface WorldQuote {
  id: string;
  name: string;
  symbol: string;
  price?: number | undefined;
  change?: number | undefined;
  changePct?: number | undefined;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
  prevClose?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  /** the figure's own time, where the source stamped one */
  at?: string | undefined;
  /** whose figure it is, in words */
  from: string;
  /** how far behind the market it is, where the source says */
  delayMs?: number | undefined;
  unit?: string | undefined;
  note?: string | undefined;
  /** a perpetual's mark beside its oracle, its day's volume in dollars */
  mark?: number | undefined;
  volumeUsd24h?: number | undefined;
}
export interface CurvePoint {
  tenor: string;
  months: number;
  yield: number;
}
export interface Curve {
  day: string;
  points: CurvePoint[];
}
export interface RatesBoard {
  /** the newest curve, and the curves a week, a month and a year before it (where the files have them) */
  latest?: Curve | undefined;
  weekAgo?: Curve | undefined;
  monthAgo?: Curve | undefined;
  yearAgo?: Curve | undefined;
  /** the spreads a terminal watches, in percentage points */
  spreads?: { "2s10s"?: number | undefined; "3m10y"?: number | undefined; "5s30s"?: number | undefined } | undefined;
  from: string;
}
export interface WorldSource {
  id: string;
  name: string;
  readAt?: string | undefined;
  late?: true | undefined;
}
export interface WorldView {
  asOf: string;
  indices: WorldQuote[];
  rates: RatesBoard;
  fx: WorldQuote[];
  commodities: WorldQuote[];
  sources: WorldSource[];
  missing: Array<{ venue: string; venueName: string; why: string; code?: string | undefined }>;
  notes: string[];
}
export interface WorldReader {
  world(): Promise<WorldView | Refusal>;
  clear(): void;
}
export interface WorldDeps {
  /** the network as it is: the GETs are guarded here (WORLD_HOSTS), Hyperliquid's POST by hyperliquidInfo */
  http: Http;
  clock?: (() => number) | undefined;
  waitMs?: number | undefined;
}

// ---- the pickers ---------------------------------------------------------------------------------------------------------------------

/** one Cboe index quote as the board shows it; undefined where the body is not an index's quote */
export function pickIndex(body: unknown, spec: (typeof INDICES)[number], now: number): WorldQuote | undefined {
  const d = rec(rec(body).data);
  if (str(d.security_type) !== "index") return undefined;
  const k = spec.times ?? 1;
  const scale = (v: unknown): number | undefined => {
    const n = fin(v);
    return n === undefined ? undefined : Math.round(n * k * 1e6) / 1e6;
  };
  const price = scale(d.current_price);
  if (price === undefined) return undefined;
  const raw = str(d.last_trade_time);
  // Cboe writes New York time with no zone for most indices; the yield index writes Chicago's with its offset
  const tradeMs = raw && /[+-]\d{2}:\d{2}$/.test(raw) ? Date.parse(raw) : cboeTimeMs(raw);
  const at = Number.isFinite(tradeMs) && tradeMs !== undefined && tradeMs <= now + 60_000 ? new Date(tradeMs).toISOString() : undefined;
  return {
    id: `cboe:${spec.symbol}`,
    name: spec.name,
    symbol: spec.symbol,
    price,
    ...(scale(d.price_change) !== undefined ? { change: scale(d.price_change) } : {}),
    ...(fin(d.price_change_percent) !== undefined ? { changePct: fin(d.price_change_percent) } : {}),
    ...(scale(d.open) !== undefined ? { open: scale(d.open) } : {}),
    ...(scale(d.high) !== undefined ? { high: scale(d.high) } : {}),
    ...(scale(d.low) !== undefined ? { low: scale(d.low) } : {}),
    ...(scale(d.prev_day_close) !== undefined ? { prevClose: scale(d.prev_day_close) } : {}),
    ...(at ? { at } : {}),
    from: "Cboe · 15 min delayed",
    delayMs: CBOE_DELAY_MS,
    ...(spec.unit === "yield" ? { unit: "%" } : {}),
    ...(spec.note ? { note: spec.note } : {}),
  };
}
/** a Treasury CSV as its curves, newest first: a day a row, the tenors as the header names them */
export function pickCurves(csv: string): Curve[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0]!.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const out: Curve[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cells[0] ?? "");
    if (!m) continue;
    const day = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
    const points: CurvePoint[] = [];
    for (const [tenor, months] of TENORS) {
      const i = header.indexOf(tenor);
      const y = i >= 0 ? fin(cells[i]) : undefined;
      if (y !== undefined) points.push({ tenor, months, yield: y });
    }
    if (points.length) out.push({ day, points });
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
/** the curve on or before a day */
export const curveAt = (curves: Curve[], day: string): Curve | undefined => curves.find((c) => c.day <= day);
const yieldAt = (c: Curve | undefined, months: number): number | undefined => c?.points.find((p) => p.months === months)?.yield;
/** Kraken's tickers as quotes, in FX_PAIRS's order; a pair not in the answer is left out */
export function pickKraken(body: unknown, now: number): WorldQuote[] {
  const result = rec(rec(body).result);
  const byPair = new Map<string, Record<string, unknown>>();
  for (const [k, v] of Object.entries(result)) if (isRec(v)) byPair.set(k.replace(/Z([A-Z]{3})/g, "$1").replace(/^X([A-Z]{3})/g, "$1"), v);
  const out: WorldQuote[] = [];
  for (const pair of FX_PAIRS) {
    const t = byPair.get(pair.replace("/", ""));
    if (!t) continue;
    const last = pos(list(t.c)[0]);
    const open = pos(t.o);
    const bid = pos(list(t.b)[0]);
    const ask = pos(list(t.a)[0]);
    if (last === undefined) continue;
    const change = open !== undefined ? Math.round((last - open) * 1e6) / 1e6 : undefined;
    out.push({ id: `kraken:${pair}`, name: pair, symbol: pair, price: last, ...(bid !== undefined ? { bid } : {}), ...(ask !== undefined ? { ask } : {}), ...(open !== undefined ? { open } : {}), ...(pos(list(t.h)[1]) !== undefined ? { high: pos(list(t.h)[1]) } : {}), ...(pos(list(t.l)[1]) !== undefined ? { low: pos(list(t.l)[1]) } : {}), ...(change !== undefined ? { change, changePct: open ? Math.round((change / open) * 1e6) / 1e4 : undefined } : {}), at: new Date(now).toISOString(), from: "Kraken · live", delayMs: 0 });
  }
  return out;
}
/** the ECB's reference rates: the day, and each currency's rate per euro */
export function pickEcb(xml: string): { day: string; rates: Map<string, number> } | undefined {
  const day = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!day) return undefined;
  const rates = new Map<string, number>();
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const r = Number(m[2]);
    if (Number.isFinite(r) && r > 0) rates.set(m[1]!, r);
  }
  return rates.size ? { day, rates } : undefined;
}
/** the ECB's currencies against the dollar, through the euro: USD/CNY = (EUR/CNY) / (EUR/USD) */
export function ecbQuotes(fix: { day: string; rates: Map<string, number> }): WorldQuote[] {
  const usd = fix.rates.get("USD");
  if (!usd) return [];
  const out: WorldQuote[] = [];
  for (const ccy of ECB_SHOWN) {
    const r = fix.rates.get(ccy);
    if (!r) continue;
    out.push({ id: `ecb:USD/${ccy}`, name: `USD/${ccy}`, symbol: `USD/${ccy}`, price: Math.round((r / usd) * 1e6) / 1e6, at: `${fix.day}T15:15:00.000Z`, from: `ECB reference rates · ${fix.day}`, note: "the ECB's euro fixing of the day, crossed through EUR/USD; not a live price" });
  }
  return out;
}
/** the xyz dex's commodities from its meta and contexts: the oracle as the price, the mark beside it, the day's change from prevDayPx */
export function pickCommodities(body: unknown, now: number): WorldQuote[] {
  const parts = list(body);
  const universe = list(rec(parts[0]).universe);
  const ctxs = list(parts[1]);
  const out: WorldQuote[] = [];
  for (const spec of COMMODITIES) {
    const i = universe.findIndex((u) => isRec(u) && u.name === `${HL_WORLD_DEX}:${spec.coin}`);
    if (i < 0) continue;
    // a market the dex delisted keeps a context that no longer moves (CORN, WHEAT, VIX and DXY on 2026-11-09): not a price
    if (rec(universe[i]).isDelisted === true) continue;
    const c = rec(ctxs[i]);
    const oracle = pos(c.oraclePx);
    const mark = pos(c.markPx);
    const prev = pos(c.prevDayPx);
    const price = oracle ?? mark;
    if (price === undefined) continue;
    const base = mark ?? price;
    const change = prev !== undefined ? Math.round((base - prev) * 1e6) / 1e6 : undefined;
    out.push({ id: `hl:${HL_WORLD_DEX}:${spec.coin}`, name: spec.name, symbol: `${HL_WORLD_DEX}:${spec.coin}`, price, ...(mark !== undefined ? { mark } : {}), ...(prev !== undefined ? { prevClose: prev } : {}), ...(change !== undefined ? { change, changePct: prev ? Math.round((change / prev) * 1e6) / 1e4 : undefined } : {}), ...(pos(c.dayNtlVlm) !== undefined ? { volumeUsd24h: pos(c.dayNtlVlm) } : {}), at: new Date(now).toISOString(), from: "Hyperliquid xyz · oracle", delayMs: 0, unit: spec.unit, note: "a perpetual's oracle price — the reference the dex marks the contract to — not the commodity's own exchange" });
  }
  return out;
}

interface Kept<T> {
  until: number;
  value: T | Refusal;
  readAt: number;
}
/** THE BOARDS, read: each source kept its own while, held when it refuses, its last answer standing in when late */
export class WorldDesk implements WorldReader {
  private readonly http: Http;
  private readonly guarded: Http;
  private readonly hl: ReturnType<typeof hyperliquidInfo>;
  private readonly clock: () => number;
  private readonly waitMs: number;
  private readonly kept = new Map<string, Kept<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly last = new Map<string, { value: unknown; at: number }>();
  constructor(deps: WorldDeps & { guarded: Http }) {
    this.http = deps.http;
    this.guarded = deps.guarded;
    this.hl = hyperliquidInfo(deps.http, WORLD_TIMEOUT_MS);
    this.clock = deps.clock ?? Date.now;
    this.waitMs = deps.waitMs ?? WORLD_WAIT_MS;
  }
  clear(): void {
    for (const [k, v] of this.kept) if (isRefusal(v.value)) this.kept.delete(k);
  }
  /** one source's answer, kept `keepMs`, read once at a time */
  private keep<T>(key: string, keepMs: number, run: () => Promise<T | Refusal>): Promise<T | Refusal> {
    const now = this.clock();
    const hit = this.kept.get(key);
    if (hit && now < hit.until) return Promise.resolve(hit.value as T | Refusal);
    const going = this.inflight.get(key);
    if (going) return going as Promise<T | Refusal>;
    const p = run().then((v) => {
      const readAt = this.clock();
      this.kept.set(key, { until: readAt + (isRefusal(v) ? Math.max(holdBackMs(v), WORLD_FAIL_MS) : keepMs), value: v, readAt });
      if (!isRefusal(v)) this.last.set(key, { value: v, at: readAt });
      this.inflight.delete(key);
      return v;
    });
    this.inflight.set(key, p);
    return p;
  }
  private async get(venue: string, name: string, url: string, headers: Record<string, string> = {}): Promise<HttpReply | Refusal> {
    let r: HttpReply;
    try {
      r = await this.guarded(url, { headers, timeoutMs: WORLD_TIMEOUT_MS });
    } catch (err) {
      return unreachable(venue, name, err);
    }
    if (r.tooLong) return no("E_VENUE_REJECTED", { venue, message: `${name} answered more than ${Math.round(WORLD_MAX_BYTES / 1_000_000)} MB, so it was not read` });
    if (r.status < 200 || r.status >= 300) return publicNo(venue, name, r);
    return r;
  }
  /** Cboe's indices: every symbol asked at once; a symbol that refuses is left out and said */
  private indices(): Promise<{ quotes: WorldQuote[]; missing: string[] } | Refusal> {
    return this.keep("indices", INDICES_KEEP_MS, async () => {
      const now = this.clock();
      const answers = await Promise.all(INDICES.map(async (spec) => ({ spec, r: await this.get("cboe", "Cboe", `${CBOE_QUOTES}/_${spec.symbol.slice(1)}.json`) })));
      const quotes: WorldQuote[] = [];
      const missing: string[] = [];
      for (const { spec, r } of answers) {
        if (isRefusal(r)) {
          missing.push(`${spec.name}: ${r.message}`);
          continue;
        }
        const q = pickIndex(r.body, spec, now);
        if (q) quotes.push(q);
        else missing.push(`${spec.name}: Cboe answered in a way this could not read`);
      }
      if (!quotes.length) return answers.length && isRefusal(answers[0]!.r) ? answers[0]!.r : no("E_VENUE_REJECTED", { venue: "cboe", message: "Cboe answered none of the indices in a way this could read" });
      return { quotes, missing };
    });
  }
  private rates(): Promise<RatesBoard | Refusal> {
    return this.keep("rates", RATES_KEEP_MS, async () => {
      const now = this.clock();
      const year = new Date(now).getUTCFullYear();
      const thisYear = await this.get("treasury", "the US Treasury", treasuryUrl(year), { accept: "text/csv, text/plain, */*" });
      if (isRefusal(thisYear)) return thisYear;
      let curves = pickCurves(thisYear.text);
      // January: the newest rows may be last year's still; and the curve a year ago is in last year's file either way
      const lastYear = await this.get("treasury", "the US Treasury", treasuryUrl(year - 1), { accept: "text/csv, text/plain, */*" });
      if (!isRefusal(lastYear)) curves = [...curves, ...pickCurves(lastYear.text)].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
      const latest = curves[0];
      if (!latest) return no("E_VENUE_REJECTED", { venue: "treasury", message: "the US Treasury's file carried no curve this could read" });
      const back = (days: number) => curveAt(curves, new Date(Date.parse(`${latest.day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10));
      const weekAgo = back(7);
      const monthAgo = back(30);
      const yearAgo = back(365);
      const y = (m: number) => yieldAt(latest, m);
      const spread = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined ? Math.round((a - b) * 1000) / 1000 : undefined);
      return {
        latest,
        ...(weekAgo && weekAgo.day !== latest.day ? { weekAgo } : {}),
        ...(monthAgo && monthAgo.day !== latest.day ? { monthAgo } : {}),
        ...(yearAgo && yearAgo.day !== latest.day ? { yearAgo } : {}),
        spreads: { "2s10s": spread(y(120), y(24)), "3m10y": spread(y(120), y(3)), "5s30s": spread(y(360), y(60)) },
        from: `US Treasury par yield curve · ${latest.day}`,
      };
    });
  }
  private kraken(): Promise<WorldQuote[] | Refusal> {
    return this.keep("kraken", FX_KEEP_MS, async () => {
      const url = `${KRAKEN_TICKER}?pair=${FX_PAIRS.map((p) => p.replace("/", "")).join(",")}`;
      let r = await this.get("kraken", "Kraken", url);
      // Kraken answers 503 "EService:Unavailable" to one request in a few (measured 2026-11-09, the same pairs answering the next second):
      // asked once more, a moment later, before it is called late
      if (isRefusal(r) && (r.native as { status?: unknown } | undefined)?.status === 503) {
        await new Promise((go) => setTimeout(go, 300));
        r = await this.get("kraken", "Kraken", url);
      }
      if (isRefusal(r)) return r;
      const errs = list(rec(r.body).error);
      if (errs.length) return no("E_VENUE_REJECTED", { venue: "kraken", message: `Kraken answered: ${String(errs[0]).slice(0, 120)}` });
      const quotes = pickKraken(r.body, this.clock());
      return quotes.length ? quotes : no("E_VENUE_REJECTED", { venue: "kraken", message: "Kraken answered none of the pairs in a way this could read" });
    });
  }
  private ecb(): Promise<WorldQuote[] | Refusal> {
    return this.keep("ecb", ECB_KEEP_MS, async () => {
      const r = await this.get("ecb", "the ECB", ECB_URL, { accept: "application/xml, text/xml, */*" });
      if (isRefusal(r)) return r;
      const fix = pickEcb(r.text);
      if (!fix) return no("E_VENUE_REJECTED", { venue: "ecb", message: "the ECB answered something that is not its reference rates" });
      return ecbQuotes(fix);
    });
  }
  private commodities(): Promise<WorldQuote[] | Refusal> {
    return this.keep("commodities", COMMODITIES_KEEP_MS, async () => {
      let r: HttpReply;
      try {
        r = await this.hl({ type: "metaAndAssetCtxs", dex: HL_WORLD_DEX });
      } catch (err) {
        return unreachable("hyperliquid", "Hyperliquid", err);
      }
      if (r.status < 200 || r.status >= 300 || r.body === undefined) return publicNo("hyperliquid", "Hyperliquid", r);
      const quotes = pickCommodities(r.body, this.clock());
      return quotes.length ? quotes : no("E_VENUE_REJECTED", { venue: "hyperliquid", message: "Hyperliquid's xyz dex listed none of the commodities" });
    });
  }

  async world(): Promise<WorldView | Refusal> {
    const started = this.clock();
    const late = (): Promise<"late"> =>
      new Promise((go) => {
        const t = setTimeout(() => go("late"), this.waitMs);
        if (typeof t === "object" && t && "unref" in t) t.unref();
      });
    const [ix, rates, kraken, ecb, commodities] = await Promise.all([Promise.race([this.indices(), late()]), Promise.race([this.rates(), late()]), Promise.race([this.kraken(), late()]), Promise.race([this.ecb(), late()]), Promise.race([this.commodities(), late()])]);
    const sources: WorldSource[] = [];
    const missing: WorldView["missing"] = [];
    const take = <T>(key: string, name: string, a: T | Refusal | "late"): T | undefined => {
      const was = this.last.get(key);
      const standIn = was && started - was.at <= WORLD_LAST_MS ? (was.value as T) : undefined;
      if (a === "late" || isRefusal(a)) {
        const r: Refusal | undefined = a === "late" ? undefined : (a as Refusal);
        missing.push({ venue: key, venueName: name, why: r ? r.message : `${name} did not answer in ${Math.round(this.waitMs / 1000)} s`, ...(r ? { code: r.code } : {}) });
        if (standIn) sources.push({ id: key, name, readAt: new Date(was!.at).toISOString(), late: true });
        else sources.push({ id: key, name });
        return standIn;
      }
      sources.push({ id: key, name, ...(was ? { readAt: new Date(was.at).toISOString() } : {}) });
      return a;
    };
    const indices = take("indices", "Cboe's indices", ix);
    for (const m of indices?.missing ?? []) missing.push({ venue: "cboe", venueName: "Cboe", why: m });
    const r = take("rates", "the US Treasury", rates);
    const k = take("kraken", "Kraken", kraken) ?? [];
    const e = take("ecb", "the ECB", ecb) ?? [];
    const c = take("commodities", "Hyperliquid xyz", commodities) ?? [];
    return {
      asOf: new Date(this.clock()).toISOString(),
      indices: indices?.quotes ?? [],
      rates: r ?? { from: "US Treasury par yield curve" },
      fx: [...k, ...e],
      commodities: c,
      sources,
      missing,
      notes: [
        "The indices are Cboe's delayed quotes, fifteen minutes behind the market; the Dow is Cboe's DJX times a hundred and the 10-year yield its TNX divided by ten.",
        "The yield curve is the US Treasury's own par curve, published once a day after the close; the spreads are read off it.",
        "The currencies are Kraken's live spot pairs where it trades them, else the ECB's euro reference rate of the day crossed through EUR/USD — a fixing, not a live price.",
        "The commodities are the oracle prices of Hyperliquid's xyz perpetuals, around the clock: the reference the dex marks each contract to, not the commodity's own exchange.",
        `Kept ${FX_KEEP_MS / 1000} s (currencies), ${COMMODITIES_KEEP_MS / 1000} s (commodities), a minute (indices) and an hour (the curve, the fixing); a source late or refusing has its last answer stand in and says so.`,
      ],
    };
  }
}
/** the desk as the service makes it: the GETs behind the fixed-host guard, whole text bodies for the CSV and the XML */
export const worldDesk = (deps: WorldDeps): WorldDesk => new WorldDesk({ ...deps, guarded: fixedHosts(deps.http, WORLD_HOSTS, WORLD_TIMEOUT_MS, { maxBytes: WORLD_MAX_BYTES }) });
