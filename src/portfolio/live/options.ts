/** OPTIONS, KEYLESS: a listed option chain as its venue publishes it, and the figures a terminal reads off one — per expiry the at-the-money
 * implied volatility, the put/call ratio by open interest and by volume, the strike of greatest pain, the at-the-money straddle's price (the
 * move the market prices in) and the 25-delta skew; for one expiry every strike's call and put with its bid, ask, last, mark, implied
 * volatility, greeks, open interest and volume, and the smile. Nothing here is the account's own figure, and nothing is estimated: every
 * implied volatility and every greek is the venue's own, and the rest is arithmetic over them, said so in `notes`.
 *
 *   US SHARES AND ETFs   Cboe's delayed option quotes, cdn-api.cboe.com/api/global/delayed_quotes/options/AAPL.json (the same host as its
 *                        stock and index quotes, public-stocks.ts, world.ts): {timestamp, data: {symbol, security_type, current_price,
 *                        price_change, price_change_percent, bid, ask, open, high, low, prev_day_close, iv30, iv30_change, last_trade_time
 *                        (New York, no zone), options: [{option "AAPL261120C00275000" (the root, YYMMDD, C or P, the strike times a thousand
 *                        in eight digits), bid, bid_size, ask, ask_size, iv (a decimal: 0.2765 is 27.65 %; 0 where Cboe has none),
 *                        open_interest, volume, delta, gamma, theta, vega, rho, theo, last_trade_price, last_trade_time, change,
 *                        prev_day_close}]}}, FIFTEEN MINUTES BEHIND. Read from this machine 2026-11-09: AAPL 3,398 contracts over 24
 *                        expiries in 1.5 MB and 0.34 s; TSLA 2.4 MB; SPY 5.9 MB; QQQ 5.2 MB. Series under another root (B1SPY…, an
 *                        adjusted or non-standard series) are left out. Every file is read whole, within OPTIONS_MAX_BYTES
 *   CBOE INDICES         the same file under Cboe's underscore, _SPX.json (14 MB, 1.1 s), _XSP (7 MB), _NDX (7.7 MB), _RUT (5 MB), _VIX
 *                        (0.7 MB): INDEX_OPTIONS, asked by name
 *   BTC AND ETH          Deribit's public summary of every live option, www.deribit.com/api/v2/public/get_book_summary_by_currency?
 *                        currency=BTC&kind=option (878 instruments, 0.39 MB, 0.23 s on 2026-11-09): [{instrument_name "BTC-25DEC26-104000-C"
 *                        (the coin, DDMMMYY, the strike, C or P), bid_price, ask_price, mid_price, mark_price, last (all in the coin),
 *                        mark_iv (percent), open_interest and volume (in coins), volume_usd, underlying_price (the expiry's future),
 *                        estimated_delivery_price (the index)}]. LIVE. Deribit's summary carries no greeks: the delta each strike's skew
 *                        and smile need is Black–Scholes's from Deribit's own mark IV, said so. Prices are shown in dollars at the expiry's
 *                        underlying, said so; Deribit's options expire 08:00 UTC
 * Every GET goes through the fixed-host guard (OPTIONS_HOSTS). A chain is kept a minute (Cboe) or thirty seconds (Deribit), a refusal held
 * a minute at least (holdBackMs), and a venue late or refusing now has its last chain within the hour stand in, said so (`late`) */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { fin, fixedHosts, holdBackMs, isRec, list, pos, publicNo, rec, str } from "./public-markets.ts";
import { cboeTimeMs } from "./public-stocks.ts";
import { unreachable, type Http, type HttpReply } from "./types.ts";

export const OPTIONS_HOSTS: readonly string[] = ["cdn-api.cboe.com", "www.deribit.com"];
export const OPTIONS_MAX_BYTES = 20_000_000;
export const OPTIONS_TIMEOUT_MS = 15_000;
export const OPTIONS_KEEP_MS = 60_000;
export const DERIBIT_KEEP_MS = 30_000;
export const OPTIONS_FAIL_MS = 60_000;
export const OPTIONS_LAST_MS = 3_600_000;
export const OPTIONS_WAIT_MS = 8_000;
export const CBOE_DELAY_MS = 15 * 60_000;
export const CBOE_OPTIONS = "https://cdn-api.cboe.com/api/global/delayed_quotes/options";
export const DERIBIT_SUMMARY = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency";
/** the Cboe indices whose options are read, by name (Cboe's file is under an underscore: _SPX.json) */
export const INDEX_OPTIONS: readonly string[] = ["SPX", "XSP", "NDX", "RUT", "VIX"];
/** the coins Deribit lists options on that are read */
export const DERIBIT_COINS: readonly string[] = ["BTC", "ETH"];
/** how many strikes each side of the money a chain's rows carry at most (the whole chain is kept; the view is cut to what a page shows) */
export const CHAIN_EACH_SIDE = 40;
const TICKER = /^[A-Z]{1,5}(\.[A-Z])?$/;
const DAY = 86_400_000;
/** Cboe's option symbol: the root, the expiry YYMMDD, C or P, the strike times a thousand in eight digits */
const OCC = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
/** Deribit's instrument: BTC-25DEC26-104000-C */
const DERIBIT_NAME = /^([A-Z]+)-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/;
const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

export type OptionKind = "stock" | "index" | "crypto";
export interface OptionLeg {
  bid?: number | undefined;
  ask?: number | undefined;
  last?: number | undefined;
  /** the venue's theoretical value (Cboe's theo, Deribit's mark) */
  mark?: number | undefined;
  /** implied volatility in percent, the venue's own */
  iv?: number | undefined;
  delta?: number | undefined;
  gamma?: number | undefined;
  theta?: number | undefined;
  vega?: number | undefined;
  oi?: number | undefined;
  volume?: number | undefined;
  change?: number | undefined;
  /** the last trade's time, where the venue stamped one */
  at?: string | undefined;
}
export interface OptionRow {
  strike: number;
  call?: OptionLeg | undefined;
  put?: OptionLeg | undefined;
}
export interface ExpirySummary {
  /** the expiry day, YYYY-MM-DD */
  expiry: string;
  /** days to expiry, one decimal (Cboe: 16:00 New York; Deribit: 08:00 UTC) */
  days: number;
  contracts: number;
  /** the implied volatility at the money, percent: the two strikes around the underlying, calls and puts together, interpolated */
  atmIv?: number | undefined;
  callOi: number;
  putOi: number;
  callVolume: number;
  putVolume: number;
  pcOi?: number | undefined;
  pcVolume?: number | undefined;
  /** the strike at which the open interest, taken together, is worth least to its holders */
  maxPain?: number | undefined;
  /** the at-the-money straddle: the strike nearest the underlying, the call's and the put's mid prices together, and that as a share of the underlying */
  straddle?: { strike: number; price: number; pct: number } | undefined;
  /** the 25-delta put's implied volatility less the 25-delta call's, in points of volatility */
  skew25?: number | undefined;
  /** the underlying this expiry is priced off (Deribit: the expiry's future; Cboe: the share) */
  underlying?: number | undefined;
}
export interface SmilePoint {
  strike: number;
  callIv?: number | undefined;
  putIv?: number | undefined;
  callDelta?: number | undefined;
  putDelta?: number | undefined;
}
export interface OptionsUnderlying {
  symbol: string;
  price?: number | undefined;
  change?: number | undefined;
  changePct?: number | undefined;
  at?: string | undefined;
  /** Cboe's 30-day implied volatility of the share, percent, and its change */
  iv30?: number | undefined;
  iv30Change?: number | undefined;
  from: string;
  delayMs: number;
}
export interface OptionsView {
  asOf: string;
  symbol: string;
  kind: OptionKind;
  underlying: OptionsUnderlying;
  expiries: ExpirySummary[];
  /** the expiry whose rows and smile follow */
  expiry?: string | undefined;
  chain: OptionRow[];
  /** how many strikes the whole expiry has, where the rows were cut to the money's neighbourhood */
  strikes?: number | undefined;
  smile: SmilePoint[];
  /** whose figures these are */
  from: string;
  readAt: string;
  late?: true | undefined;
  /** prices' unit: the quote currency */
  unit: string;
  notes: string[];
}
export interface OptionsAsk {
  symbol: string;
  /** an expiry day, YYYY-MM-DD: the first on or after it is shown; the nearest unless said */
  expiry?: string | undefined;
}
export interface OptionsReader {
  options(ask: OptionsAsk): Promise<OptionsView | Refusal>;
  clear(): void;
}
export interface OptionsDeps {
  http: Http;
  clock?: (() => number) | undefined;
  waitMs?: number | undefined;
}

/** one contract as read: its expiry, its side, its strike, its figures; the underlying it is priced off where the venue says one */
export interface Contract {
  expiry: string;
  type: "C" | "P";
  strike: number;
  leg: OptionLeg;
  underlying?: number | undefined;
}
/** a venue's whole chain as kept */
export interface Chain {
  kind: OptionKind;
  symbol: string;
  underlying: OptionsUnderlying;
  contracts: Contract[];
  from: string;
  unit: string;
  /** the venue's own stamp of the file, where it writes one */
  venueAt?: string | undefined;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const pct = (v: unknown): number | undefined => {
  const n = fin(v);
  return n !== undefined && n > 0 ? r2(n) : undefined;
};

// ---- the pickers ---------------------------------------------------------------------------------------------------------------------

/** Cboe's file as a chain; undefined where it is not a chain of the symbol asked */
export function pickCboeChain(body: unknown, symbol: string, now: number): Chain | undefined {
  const d = rec(rec(body).data);
  const options = list(d.options);
  if (!options.length) return undefined;
  const kind: OptionKind = str(d.security_type) === "index" ? "index" : "stock";
  const price = pos(d.current_price);
  const stampMs = cboeTimeMs(str(d.last_trade_time));
  const at = stampMs !== undefined && Number.isFinite(stampMs) && stampMs <= now + 60_000 ? new Date(stampMs).toISOString() : undefined;
  const contracts: Contract[] = [];
  for (const o of options) {
    if (!isRec(o)) continue;
    const m = OCC.exec(str(o.option) ?? "");
    if (!m || m[1] !== symbol) continue;
    const strike = Number(m[6]) / 1000;
    if (!(strike > 0)) continue;
    const iv = fin(o.iv);
    const lastMs = cboeTimeMs(str(o.last_trade_time));
    contracts.push({
      expiry: `20${m[2]}-${m[3]}-${m[4]}`,
      type: m[5] as "C" | "P",
      strike,
      leg: {
        ...(pos(o.bid) !== undefined ? { bid: pos(o.bid) } : {}),
        ...(pos(o.ask) !== undefined ? { ask: pos(o.ask) } : {}),
        ...(pos(o.last_trade_price) !== undefined ? { last: pos(o.last_trade_price) } : {}),
        ...(pos(o.theo) !== undefined ? { mark: r4(pos(o.theo)!) } : {}),
        ...(iv !== undefined && iv > 0 ? { iv: r2(iv * 100) } : {}),
        ...(fin(o.delta) !== undefined ? { delta: r4(fin(o.delta)!) } : {}),
        ...(fin(o.gamma) !== undefined ? { gamma: r4(fin(o.gamma)!) } : {}),
        ...(fin(o.theta) !== undefined ? { theta: r4(fin(o.theta)!) } : {}),
        ...(fin(o.vega) !== undefined ? { vega: r4(fin(o.vega)!) } : {}),
        ...(fin(o.open_interest) !== undefined ? { oi: fin(o.open_interest) } : {}),
        ...(fin(o.volume) !== undefined ? { volume: fin(o.volume) } : {}),
        ...(fin(o.change) !== undefined ? { change: fin(o.change) } : {}),
        ...(lastMs !== undefined && Number.isFinite(lastMs) && lastMs <= now + 60_000 ? { at: new Date(lastMs).toISOString() } : {}),
      },
    });
  }
  if (!contracts.length) return undefined;
  const venueRaw = str(rec(body).timestamp);
  const venueMs = venueRaw ? Date.parse(`${venueRaw.replace(" ", "T")}Z`) : NaN;
  return {
    kind,
    symbol,
    underlying: {
      symbol: kind === "index" ? `^${symbol}` : symbol,
      ...(price !== undefined ? { price } : {}),
      ...(fin(d.price_change) !== undefined ? { change: fin(d.price_change) } : {}),
      ...(fin(d.price_change_percent) !== undefined ? { changePct: fin(d.price_change_percent) } : {}),
      ...(at ? { at } : {}),
      ...(pct(d.iv30) !== undefined ? { iv30: pct(d.iv30) } : {}),
      ...(fin(d.iv30_change) !== undefined ? { iv30Change: r2(fin(d.iv30_change)!) } : {}),
      from: "Cboe · 15 min delayed",
      delayMs: CBOE_DELAY_MS,
    },
    contracts,
    from: "Cboe · 15 min delayed",
    unit: "USD",
    ...(Number.isFinite(venueMs) ? { venueAt: new Date(venueMs).toISOString() } : {}),
  };
}

/** the standard normal's distribution function: Φ(x) = (1 + erf(x / √2)) / 2, erf by Abramowitz and Stegun 7.1.26 (within 1.5e-7) */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return 0.5 * (1 + (x >= 0 ? erf : -erf));
}
/** Black–Scholes's delta from an implied volatility (percent), the underlying, the strike and the years to expiry; no rate, no carry */
export function bsDelta(type: "C" | "P", S: number, K: number, ivPct: number, years: number): number | undefined {
  if (!(S > 0) || !(K > 0) || !(ivPct > 0) || !(years > 0)) return undefined;
  const sigma = ivPct / 100;
  const d1 = (Math.log(S / K) + (sigma * sigma * years) / 2) / (sigma * Math.sqrt(years));
  const n = normCdf(d1);
  return r4(type === "C" ? n : n - 1);
}
/** when an expiry day's contracts stop: Cboe's at 16:00 New York (the day's close), Deribit's at 08:00 UTC */
export function expiryMs(expiry: string, kind: OptionKind): number {
  if (kind === "crypto") return Date.parse(`${expiry}T08:00:00Z`);
  // New York's 16:00 is 21:00 UTC in winter and 20:00 in summer: the US clock changes on the second Sunday of March and the first of November
  const [y, m, d] = expiry.split("-").map(Number) as [number, number, number];
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const dayN = Date.UTC(y, m - 1, d);
  const summer = dayN >= Date.UTC(y, 2, nthSunday(3, 2)) && dayN < Date.UTC(y, 10, nthSunday(11, 1));
  return dayN + (summer ? 20 : 21) * 3_600_000;
}

/** Deribit's summary as a chain of one coin; the legs in dollars at the expiry's underlying; the delta Black–Scholes's from Deribit's mark IV */
export function pickDeribitChain(body: unknown, coin: string, now: number): Chain | undefined {
  const rows = list(rec(body).result);
  if (!rows.length) return undefined;
  const contracts: Contract[] = [];
  let index: number | undefined;
  for (const o of rows) {
    if (!isRec(o)) continue;
    const m = DERIBIT_NAME.exec(str(o.instrument_name) ?? "");
    if (!m || m[1] !== coin) continue;
    const month = MONTHS[m[3]!];
    if (!month) continue;
    const expiry = `20${m[4]}-${month}-${m[2]!.padStart(2, "0")}`;
    const strike = Number(m[5]);
    const under = pos(o.underlying_price);
    if (!(strike > 0) || under === undefined) continue;
    index ??= pos(o.estimated_delivery_price);
    const type = m[6] as "C" | "P";
    const usd = (v: unknown): number | undefined => {
      const p = pos(v);
      return p === undefined ? undefined : r2(p * under);
    };
    const iv = pct(o.mark_iv);
    const years = (expiryMs(expiry, "crypto") - now) / (365 * DAY);
    const delta = iv !== undefined ? bsDelta(type, under, strike, iv, years) : undefined;
    contracts.push({
      expiry,
      type,
      strike,
      underlying: under,
      leg: {
        ...(usd(o.bid_price) !== undefined ? { bid: usd(o.bid_price) } : {}),
        ...(usd(o.ask_price) !== undefined ? { ask: usd(o.ask_price) } : {}),
        ...(usd(o.last) !== undefined ? { last: usd(o.last) } : {}),
        ...(usd(o.mark_price) !== undefined ? { mark: usd(o.mark_price) } : {}),
        ...(iv !== undefined ? { iv } : {}),
        ...(delta !== undefined ? { delta } : {}),
        ...(fin(o.open_interest) !== undefined ? { oi: fin(o.open_interest) } : {}),
        ...(fin(o.volume) !== undefined ? { volume: fin(o.volume) } : {}),
        ...(fin(o.price_change) !== undefined ? { change: fin(o.price_change) } : {}),
      },
    });
  }
  if (!contracts.length) return undefined;
  return {
    kind: "crypto",
    symbol: coin,
    underlying: { symbol: `${coin}/USD`, ...(index !== undefined ? { price: index } : {}), at: new Date(now).toISOString(), from: "Deribit · live", delayMs: 0 },
    contracts,
    from: "Deribit · live",
    unit: "USD",
  };
}

// ---- the arithmetic over a chain -------------------------------------------------------------------------------------------------------

const mid = (l: OptionLeg | undefined): number | undefined => (l && l.bid !== undefined && l.ask !== undefined && l.ask >= l.bid ? (l.bid + l.ask) / 2 : l?.mark ?? l?.last);
/** y at x between two known points (x0, y0) and (x1, y1) */
const between = (x: number, x0: number, y0: number, x1: number, y1: number): number => (x1 === x0 ? (y0 + y1) / 2 : y0 + ((x - x0) * (y1 - y0)) / (x1 - x0));
/** the rows of one expiry by strike, ascending */
export function rowsOf(contracts: Contract[], expiry: string): OptionRow[] {
  const by = new Map<number, OptionRow>();
  for (const c of contracts) {
    if (c.expiry !== expiry) continue;
    const row = by.get(c.strike) ?? { strike: c.strike };
    if (c.type === "C") row.call = c.leg;
    else row.put = c.leg;
    by.set(c.strike, row);
  }
  return [...by.values()].sort((a, b) => a.strike - b.strike);
}
/** the implied volatility at the money: the two strikes around the underlying, the call's and the put's IV averaged at each, interpolated */
export function atmIv(rows: OptionRow[], S: number | undefined): number | undefined {
  if (S === undefined) return undefined;
  const pts = rows.map((r) => ({ k: r.strike, iv: [r.call?.iv, r.put?.iv].filter((v): v is number => v !== undefined) })).filter((p) => p.iv.length).map((p) => ({ k: p.k, iv: p.iv.reduce((a, b) => a + b, 0) / p.iv.length }));
  if (!pts.length) return undefined;
  const below = [...pts].reverse().find((p) => p.k <= S);
  const above = pts.find((p) => p.k >= S);
  if (below && above) return r2(between(S, below.k, below.iv, above.k, above.iv));
  return r2((below ?? above)!.iv);
}
/** the strike at which the open interest, calls and puts together, pays its holders least */
export function maxPain(rows: OptionRow[]): number | undefined {
  const withOi = rows.filter((r) => (r.call?.oi ?? 0) > 0 || (r.put?.oi ?? 0) > 0);
  if (!withOi.length) return undefined;
  let best: { k: number; pain: number } | undefined;
  for (const at of withOi) {
    let pain = 0;
    for (const r of withOi) {
      if (r.call?.oi) pain += r.call.oi * Math.max(0, at.strike - r.strike);
      if (r.put?.oi) pain += r.put.oi * Math.max(0, r.strike - at.strike);
    }
    if (!best || pain < best.pain) best = { k: at.strike, pain };
  }
  return best?.k;
}
/** the at-the-money straddle: the strike nearest the underlying with a price on both legs */
export function straddle(rows: OptionRow[], S: number | undefined): ExpirySummary["straddle"] {
  if (S === undefined) return undefined;
  const priced = rows.filter((r) => mid(r.call) !== undefined && mid(r.put) !== undefined);
  if (!priced.length) return undefined;
  const near = priced.reduce((a, b) => (Math.abs(b.strike - S) < Math.abs(a.strike - S) ? b : a));
  const price = mid(near.call)! + mid(near.put)!;
  return { strike: near.strike, price: r2(price), pct: r2((price / S) * 100) };
}
/** the implied volatility at a delta, interpolated along one side's strikes */
export function ivAtDelta(rows: OptionRow[], side: "call" | "put", target: number): number | undefined {
  const pts = rows.map((r) => r[side]).filter((l): l is OptionLeg => !!l && l.iv !== undefined && l.delta !== undefined).map((l) => ({ d: Math.abs(l.delta!), iv: l.iv! })).sort((a, b) => a.d - b.d);
  if (pts.length < 2) return undefined;
  const below = [...pts].reverse().find((p) => p.d <= target);
  const above = pts.find((p) => p.d >= target);
  if (!below || !above) return undefined;
  return between(target, below.d, below.iv, above.d, above.iv);
}
/** the 25-delta skew: the put's implied volatility less the call's, in points */
export function skew25(rows: OptionRow[]): number | undefined {
  const p = ivAtDelta(rows, "put", 0.25);
  const c = ivAtDelta(rows, "call", 0.25);
  return p !== undefined && c !== undefined ? r2(p - c) : undefined;
}
/** one expiry's figures */
export function summarize(chain: Chain, expiry: string, now: number): ExpirySummary {
  const rows = rowsOf(chain.contracts, expiry);
  const under = chain.contracts.find((c) => c.expiry === expiry && c.underlying !== undefined)?.underlying ?? chain.underlying.price;
  const sum = (side: "call" | "put", key: "oi" | "volume") => rows.reduce((a, r) => a + (r[side]?.[key] ?? 0), 0);
  // Deribit counts in coins, to a tenth: the sums are rounded so a tenth and a tenth do not read 0.20000000000000001
  const callOi = r2(sum("call", "oi"));
  const putOi = r2(sum("put", "oi"));
  const callVolume = r2(sum("call", "volume"));
  const putVolume = r2(sum("put", "volume"));
  const iv = atmIv(rows, under);
  const pain = maxPain(rows);
  const st = straddle(rows, under);
  const sk = skew25(rows);
  return {
    expiry,
    days: Math.max(0, Math.round(((expiryMs(expiry, chain.kind) - now) / DAY) * 10) / 10),
    contracts: rows.reduce((a, r) => a + (r.call ? 1 : 0) + (r.put ? 1 : 0), 0),
    ...(iv !== undefined ? { atmIv: iv } : {}),
    callOi,
    putOi,
    callVolume,
    putVolume,
    ...(callOi > 0 ? { pcOi: r2(putOi / callOi) } : {}),
    ...(callVolume > 0 ? { pcVolume: r2(putVolume / callVolume) } : {}),
    ...(pain !== undefined ? { maxPain: pain } : {}),
    ...(st ? { straddle: st } : {}),
    ...(sk !== undefined ? { skew25: sk } : {}),
    ...(under !== undefined ? { underlying: under } : {}),
  };
}
/** the expiries of a chain that have not passed, nearest first */
export function expiriesOf(chain: Chain, now: number): string[] {
  return [...new Set(chain.contracts.map((c) => c.expiry))].filter((e) => expiryMs(e, chain.kind) > now).sort();
}
/** the rows cut to the money's neighbourhood: CHAIN_EACH_SIDE strikes below the underlying and as many above */
export function nearTheMoney(rows: OptionRow[], S: number | undefined, each = CHAIN_EACH_SIDE): OptionRow[] {
  if (S === undefined || rows.length <= each * 2) return rows;
  let i = rows.findIndex((r) => r.strike >= S);
  if (i < 0) i = rows.length;
  const lo = Math.max(0, Math.min(i - each, rows.length - each * 2));
  return rows.slice(lo, lo + each * 2);
}
/** the view of a chain: every expiry's figures, one expiry's rows and smile */
export function viewOf(chain: Chain, ask: OptionsAsk, now: number, readAt: number, late: boolean): OptionsView {
  const expiries = expiriesOf(chain, now);
  const expiry = ask.expiry ? (expiries.find((e) => e >= ask.expiry!) ?? expiries.at(-1)) : expiries[0];
  const all = expiry ? rowsOf(chain.contracts, expiry) : [];
  const under = expiry ? (chain.contracts.find((c) => c.expiry === expiry && c.underlying !== undefined)?.underlying ?? chain.underlying.price) : chain.underlying.price;
  const rows = nearTheMoney(all, under);
  const notes = [
    chain.kind === "crypto"
      ? "Deribit's own live summary: every implied volatility is Deribit's mark IV, and the prices are Deribit's in the coin, shown in dollars at the expiry's underlying future. Deribit's summary carries no greeks: each delta here is Black–Scholes's from Deribit's mark IV, the strike and the time to expiry, with no rate — a computation over the venue's figures, not the venue's."
      : "Cboe's delayed quotes, fifteen minutes behind the market: every implied volatility and every greek is Cboe's own; a series under another root (an adjusted or non-standard one) is left out.",
    "Read off the chain, nothing estimated: the at-the-money IV interpolates the venue's IVs at the two strikes around the underlying; the put/call ratios divide open interest and volume; max pain is the strike at which the open interest, calls and puts together, would pay its holders least; the straddle is the call's and the put's mid prices at the strike nearest the underlying, and its share of the underlying; the 25-delta skew is the 25-delta put's IV less the 25-delta call's, interpolated by delta.",
    `Kept ${chain.kind === "crypto" ? DERIBIT_KEEP_MS / 1000 : OPTIONS_KEEP_MS / 1000} s; a venue late or refusing has its last chain within the hour stand in, marked \`late\`.`,
  ];
  if (ask.expiry && expiry && expiry !== ask.expiry) notes.unshift(`No expiry on ${ask.expiry}: the ${expiry < ask.expiry ? "last" : "first on or after it"}, ${expiry}, is shown.`);
  return {
    asOf: new Date(now).toISOString(),
    symbol: chain.symbol,
    kind: chain.kind,
    underlying: chain.underlying,
    expiries: expiries.map((e) => summarize(chain, e, now)),
    ...(expiry ? { expiry } : {}),
    chain: rows,
    ...(rows.length !== all.length ? { strikes: all.length } : {}),
    smile: all.map((r) => ({ strike: r.strike, ...(r.call?.iv !== undefined ? { callIv: r.call.iv } : {}), ...(r.put?.iv !== undefined ? { putIv: r.put.iv } : {}), ...(r.call?.delta !== undefined ? { callDelta: r.call.delta } : {}), ...(r.put?.delta !== undefined ? { putDelta: r.put.delta } : {}) })).filter((p) => p.callIv !== undefined || p.putIv !== undefined),
    from: chain.from,
    readAt: new Date(readAt).toISOString(),
    ...(late ? { late: true as const } : {}),
    unit: chain.unit,
    notes,
  };
}

/** what was asked, checked: the symbol's kind and the venue's name for it, or the refusal */
export function whichChain(raw: string): { kind: OptionKind; symbol: string; url: string } | Refusal {
  const s = raw.trim().toUpperCase().replace(/^\^/, "");
  if (DERIBIT_COINS.includes(s)) return { kind: "crypto", symbol: s, url: `${DERIBIT_SUMMARY}?currency=${s}&kind=option` };
  if (INDEX_OPTIONS.includes(s)) return { kind: "index", symbol: s, url: `${CBOE_OPTIONS}/_${s}.json` };
  if (TICKER.test(s)) return { kind: "stock", symbol: s, url: `${CBOE_OPTIONS}/${s}.json` };
  return no("E_ACCOUNT_BAD_ACTION", { message: `"${raw.slice(0, 20)}" is not a symbol options are read for: a US share's ticker (AAPL), one of Cboe's indices (${INDEX_OPTIONS.join(", ")}) or ${DERIBIT_COINS.join(" / ")}` });
}
const EXPIRY_DAY = /^\d{4}-\d{2}-\d{2}$/;

interface Kept {
  until: number;
  value: Chain | Refusal;
  readAt: number;
}
/** THE CHAINS, read: one venue file a symbol, kept its while, held when it refuses, its last chain standing in when late */
export class OptionsDesk implements OptionsReader {
  private readonly guarded: Http;
  private readonly clock: () => number;
  private readonly waitMs: number;
  private readonly kept = new Map<string, Kept>();
  private readonly inflight = new Map<string, Promise<Chain | Refusal>>();
  private readonly last = new Map<string, { value: Chain; at: number }>();
  constructor(deps: OptionsDeps & { guarded: Http }) {
    this.guarded = deps.guarded;
    this.clock = deps.clock ?? Date.now;
    this.waitMs = deps.waitMs ?? OPTIONS_WAIT_MS;
  }
  clear(): void {
    for (const [k, v] of this.kept) if (isRefusal(v.value)) this.kept.delete(k);
  }
  private read(which: { kind: OptionKind; symbol: string; url: string }): Promise<Chain | Refusal> {
    const key = `${which.kind}:${which.symbol}`;
    const now = this.clock();
    const hit = this.kept.get(key);
    if (hit && now < hit.until) return Promise.resolve(hit.value);
    const going = this.inflight.get(key);
    if (going) return going;
    const venue = which.kind === "crypto" ? "deribit" : "cboe";
    const name = which.kind === "crypto" ? "Deribit" : "Cboe";
    const run = async (): Promise<Chain | Refusal> => {
      let r: HttpReply;
      try {
        r = await this.guarded(which.url, { headers: { accept: "application/json" }, timeoutMs: OPTIONS_TIMEOUT_MS });
      } catch (err) {
        return unreachable(venue, name, err);
      }
      if (r.tooLong) return no("E_VENUE_REJECTED", { venue, message: `${name}'s file for ${which.symbol} is longer than ${Math.round(OPTIONS_MAX_BYTES / 1_000_000)} MB, so it was not read` });
      // Cboe keeps no file for a symbol it lists no options on and answers 403 with no words (2026-11-09: ZZZZ, _DXY), the same 403 its
      // edge gives a place it refuses; a symbol's own 403 is read as the first, since the symbols Cboe does list answer beside it
      if ((r.status === 403 || r.status === 404) && which.kind !== "crypto") return no("E_VENUE_REJECTED", { venue, message: `Cboe has no options file for ${which.symbol} (HTTP ${r.status}): no options are listed under that symbol as Cboe writes it (AAPL; SPX, not ^SPX, for an index)`, native: { status: r.status } });
      if (r.status < 200 || r.status >= 300) return publicNo(venue, name, r);
      const chain = which.kind === "crypto" ? pickDeribitChain(r.body, which.symbol, this.clock()) : pickCboeChain(r.body, which.symbol, this.clock());
      return chain ?? no("E_VENUE_REJECTED", { venue, message: `${name} lists no options for ${which.symbol}` });
    };
    const p = run().then((v) => {
      const readAt = this.clock();
      const keepMs = which.kind === "crypto" ? DERIBIT_KEEP_MS : OPTIONS_KEEP_MS;
      this.kept.set(key, { until: readAt + (isRefusal(v) ? Math.max(holdBackMs(v), OPTIONS_FAIL_MS) : keepMs), value: v, readAt });
      if (!isRefusal(v)) this.last.set(key, { value: v, at: readAt });
      this.inflight.delete(key);
      return v;
    });
    this.inflight.set(key, p);
    return p;
  }
  async options(ask: OptionsAsk): Promise<OptionsView | Refusal> {
    if (typeof ask.symbol !== "string" || !ask.symbol.trim()) return no("E_ACCOUNT_BAD_ACTION", { message: "a symbol is needed: a US share's ticker (AAPL), one of Cboe's indices (SPX, XSP, NDX, RUT, VIX) or BTC / ETH" });
    const which = whichChain(ask.symbol);
    if (isRefusal(which)) return which;
    if (ask.expiry !== undefined && (typeof ask.expiry !== "string" || !EXPIRY_DAY.test(ask.expiry) || !Number.isFinite(Date.parse(`${ask.expiry}T00:00:00Z`)))) return no("E_ACCOUNT_BAD_ACTION", { message: `an expiry is a day, YYYY-MM-DD: "${String(ask.expiry).slice(0, 20)}" is not one` });
    const key = `${which.kind}:${which.symbol}`;
    const started = this.clock();
    const late = new Promise<"late">((go) => {
      const t = setTimeout(() => go("late"), this.waitMs);
      if (typeof t === "object" && t && "unref" in t) t.unref();
    });
    const a = await Promise.race([this.read(which), late]);
    const was = this.last.get(key);
    const standIn = was && started - was.at <= OPTIONS_LAST_MS ? was : undefined;
    if (a === "late" || isRefusal(a)) {
      if (standIn) return viewOf(standIn.value, { symbol: which.symbol, ...(ask.expiry ? { expiry: ask.expiry } : {}) }, this.clock(), standIn.at, true);
      return a === "late" ? no("E_VENUE_UNREACHABLE", { venue: which.kind === "crypto" ? "deribit" : "cboe", message: `${which.kind === "crypto" ? "Deribit" : "Cboe"} did not answer in ${Math.round(this.waitMs / 1000)} s` }) : a;
    }
    return viewOf(a, { symbol: which.symbol, ...(ask.expiry ? { expiry: ask.expiry } : {}) }, this.clock(), this.kept.get(key)?.readAt ?? this.clock(), false);
  }
}
/** the desk as the service makes it: every GET behind the fixed-host guard, whole files within OPTIONS_MAX_BYTES */
export const optionsDesk = (deps: OptionsDeps): OptionsDesk => new OptionsDesk({ ...deps, guarded: fixedHosts(deps.http, OPTIONS_HOSTS, OPTIONS_TIMEOUT_MS, { maxBytes: OPTIONS_MAX_BYTES }) });
