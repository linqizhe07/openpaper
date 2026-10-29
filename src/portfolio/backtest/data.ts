/** THE PAST, FETCHED AND KEPT: a backtest's bars and funding (backtest/source.ts), read from the keyless public sources the account already
 * reads (live/public-markets.ts, live/public-stocks.ts) and kept in the home, so a window read once is never asked of the network again.
 *
 * Three kinds of market, each from the source that keeps the longest history of it without a key:
 *   perp:BTC    Hyperliquid's perpetual `BTC-PERP` — its bars (it keeps the latest 5,000 at each size: about 208 days of hourly bars,
 *               833 of 4-hour ones, every day since it opened in 2023 — said in the notes when a window reaches before them), its hourly
 *               funding rates (fundingHistory), its most leverage, lot and tick
 *   spot:BTC    Coinbase Exchange's `BTC-USD`, as the paper account lists it (`BTC/USD`): years of hourly bars
 *   stock:AAPL  the US stocks line (Nasdaq's history): daily bars only, split-adjusted and not dividend-adjusted, as its source says — a share
 *               pays no dividend in a backtest, so a dividend payer's return is understated by its yield
 * Only bars that had closed when they were read are kept (the bar still forming is asked again next time), oldest first, one per start.
 *
 * THE CACHE: <home>/history/<source>/<symbol>/<interval>.json and funding.json (0600 in 0700 directories, written to a temp file and renamed
 * into place), each with the window it covers. A window the file covers is answered from it; a wider one asks only for what is missing,
 * at its two ends, in pieces of CHUNK bars (or CHUNK hours of funding). A piece the source refused or did not answer is not covered, and
 * is asked again next time; a piece the source answered with nothing — its history starts after it — is covered, and its words kept. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { exchangeTickers, hyperliquidPublic, type Listing, type PublicDeps, type PublicSource } from "../live/public-markets.ts";
import { usStocksPublic } from "../live/public-stocks.ts";
import { INTERVAL_MS, type Candle, type CandleInterval, type CandlePage } from "../live/trade.ts";
import type { BacktestMarket } from "./source.ts";

export type MarketClass = "perp" | "spot" | "stock";
export interface MarketRef {
  cls: MarketClass;
  /** the coin or the ticker, upper case: BTC, AAPL, BRK.B */
  base: string;
}
export const MARKET_CLASSES: readonly MarketClass[] = ["perp", "spot", "stock"];
/** the most markets one backtest reads */
export const MAX_MARKETS = 12;
/** bars (or hours of funding) one ask of a source covers */
const CHUNK = 4000;
/** the most asks one market's window may take: about 18 years of hourly bars */
const MAX_CHUNKS = 40;

/** `perp:BTC,spot:ETH,stock:AAPL` read, or why not */
export function parseMarkets(text: string): MarketRef[] | string {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "name at least one market: perp:BTC (Hyperliquid), spot:BTC (Coinbase) or stock:AAPL (US stocks)";
  if (parts.length > MAX_MARKETS) return `a backtest reads at most ${MAX_MARKETS} markets`;
  const out: MarketRef[] = [];
  for (const p of parts) {
    const m = /^(perp|spot|stock):([A-Za-z0-9][A-Za-z0-9.]{0,11})$/.exec(p);
    if (!m) return `a market is perp:COIN, spot:COIN or stock:TICKER, not "${p.slice(0, 30)}"`;
    const ref = { cls: m[1] as MarketClass, base: m[2]!.toUpperCase() };
    if (out.some((x) => x.cls === ref.cls && x.base === ref.base)) return `${p} is named twice`;
    out.push(ref);
  }
  return out;
}
export const marketText = (r: MarketRef): string => `${r.cls}:${r.base}`;

/** the source each kind of market is read from */
export interface HistorySources {
  perp: PublicSource;
  spot: PublicSource;
  stock: PublicSource;
}
export const realHistorySources = (deps: PublicDeps = {}): HistorySources => ({ perp: hyperliquidPublic(deps), spot: exchangeTickers("coinbase", deps), stock: usStocksPublic(deps) });

/** a market's symbol at its source, and as the backtest's paper account trades it */
export const symbolOf = (r: MarketRef): string => (r.cls === "perp" ? `${r.base}-PERP` : r.cls === "spot" ? `${r.base}/USD` : r.base);
/** the bar size a market is read in: a share's daily bars whatever is asked */
export const intervalOf = (r: MarketRef, asked: CandleInterval): CandleInterval => (r.cls === "stock" ? "1d" : asked);

interface KeptBars {
  version: 1;
  symbol: string;
  interval: CandleInterval;
  /** the window asked and answered, ms */
  from: number;
  to: number;
  bars: Candle[];
  /** whose bars, in the source's words, and what they are adjusted for */
  words?: string | undefined;
  adjustment?: string | undefined;
  /** where the source said its history ends, when it does inside the window */
  ends?: string | undefined;
  savedAt: string;
}
interface KeptFunding {
  version: 1;
  symbol: string;
  from: number;
  to: number;
  rows: Array<{ at: number; rate: number }>;
  savedAt: string;
}
interface KeptMeta {
  version: 1;
  symbol: string;
  name: string;
  quote: string;
  maxLeverage?: number | undefined;
  qtyStep?: number | undefined;
  minQty?: number | undefined;
  priceStep?: number | undefined;
  minNotional?: number | undefined;
  fundingEveryH?: number | undefined;
  savedAt: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const fileSafe = (s: string): string => s.replace(/[^A-Za-z0-9.-]/g, "_");
function readJson<T>(path: string): T | undefined {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
  } catch {
    // a file that does not read is asked for again, and written over
    return undefined;
  }
}
function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, path);
}
/** bars merged by their start, the later answer kept where two say the same start, oldest first */
function mergeBars(a: readonly Candle[], b: readonly Candle[]): Candle[] {
  const by = new Map<number, Candle>();
  for (const x of a) by.set(x.t, x);
  for (const x of b) by.set(x.t, x);
  return [...by.values()].sort((x, y) => x.t - y.t);
}

export interface LoadRequest {
  refs: MarketRef[];
  interval: CandleInterval;
  /** the window, ms, its warm-up included */
  from: number;
  to: number;
  /** <home>/history */
  cache: string;
  sources: HistorySources;
  clock: () => number;
  say?: ((line: string) => void) | undefined;
}
export interface Loaded {
  markets: BacktestMarket[];
  notes: string[];
}

/** what is missing of [from, to) from a file that covers [had.from, had.to): at most two pieces, before it and after it */
function missing(from: number, to: number, had: { from: number; to: number } | undefined, step: number): Array<[number, number]> {
  if (!had) return to > from ? [[from, to]] : [];
  const out: Array<[number, number]> = [];
  if (from < had.from) out.push([from, Math.min(had.from, to)]);
  // the last bar kept may have been read whole only just: the end is asked again from it
  if (to > had.to) out.push([Math.max(from, had.to - step), to]);
  return out.filter(([a, b]) => b > a);
}

async function loadBars(r: MarketRef, src: PublicSource, interval: CandleInterval, from: number, to: number, req: LoadRequest, notes: string[]): Promise<KeptBars | Refusal> {
  const symbol = symbolOf(r);
  const step = INTERVAL_MS[interval];
  const file = join(req.cache, src.id, fileSafe(symbol), `${interval}.json`);
  const had = readJson<KeptBars>(file);
  const kept: KeptBars = had && had.version === 1 && Array.isArray(had.bars) ? had : { version: 1, symbol, interval, from, to: from, bars: [], savedAt: iso(req.clock()) };
  const pieces = missing(from, to, had ? { from: kept.from, to: kept.to } : undefined, step);
  if (!pieces.length) return kept;
  if (!src.candles) return no("E_VENUE_RAIL_CLOSED", { venue: src.id, message: `${src.name} gives no price history` });
  const now = req.clock();
  let asks = 0;
  for (const [a, b] of pieces) {
    let coveredTo = a;
    for (let since = a; since < b; since += CHUNK * step) {
      if (++asks > MAX_CHUNKS) {
        notes.push(`${symbol}: the window was read in ${MAX_CHUNKS} asks at most; it stops at ${iso(since)}`);
        break;
      }
      const until = Math.min(b, since + CHUNK * step);
      const got = await src.candles(symbol, interval, { since, until, own: true });
      if (isRefusal(got)) {
        if (!kept.bars.length) return got;
        notes.push(`${symbol}: ${src.name} did not give the bars from ${iso(since)} (${got.message ?? got.code}); the run uses what it has`);
        break;
      }
      const page: CandlePage = Array.isArray(got) ? { bars: got, more: false } : got;
      if (page.partial) {
        notes.push(`${symbol}: ${src.name}'s bars from ${iso(since)} came back cut short; they are asked again next time`);
        break;
      }
      // only bars inside the ask that had closed by now
      const bars = page.bars.filter((x) => x && Number.isFinite(x.t) && x.t >= since && x.t < until && x.t + step <= now && [x.o, x.h, x.l, x.c].every((v) => Number.isFinite(v) && v > 0));
      kept.bars = mergeBars(kept.bars, bars);
      if (page.source) kept.words = page.source;
      if (page.adjustment) kept.adjustment = page.adjustment;
      if (page.ends && !bars.length) kept.ends = page.ends;
      coveredTo = until;
      if (req.say) req.say(`${symbol} ${interval}: ${kept.bars.length} bars kept`);
    }
    kept.from = Math.min(kept.from, a);
    kept.to = Math.max(kept.to, Math.min(coveredTo, Math.floor(now / step) * step));
  }
  kept.savedAt = iso(now);
  writeJson(file, kept);
  return kept;
}

async function loadFunding(r: MarketRef, src: PublicSource, from: number, to: number, req: LoadRequest, notes: string[]): Promise<KeptFunding> {
  const symbol = symbolOf(r);
  const hour = 3_600_000;
  const file = join(req.cache, src.id, fileSafe(symbol), "funding.json");
  const had = readJson<KeptFunding>(file);
  const kept: KeptFunding = had && had.version === 1 && Array.isArray(had.rows) ? had : { version: 1, symbol, from, to: from, rows: [], savedAt: iso(req.clock()) };
  const pieces = missing(from, to, had ? { from: kept.from, to: kept.to } : undefined, hour);
  if (!pieces.length || !src.fundingHistory) return kept;
  const now = req.clock();
  for (const [a, b] of pieces) {
    let coveredTo = a;
    for (let since = a; since < b; since += CHUNK * hour) {
      const until = Math.min(b, since + CHUNK * hour);
      const got = await src.fundingHistory(symbol, since, until);
      if (isRefusal(got)) {
        notes.push(`${symbol}: ${src.name} did not give the funding from ${iso(since)} (${got.message ?? got.code}); hours without a rate pay none`);
        break;
      }
      const by = new Map(kept.rows.map((x) => [x.at, x.rate] as const));
      for (const x of got) if (Number.isFinite(x.at) && Number.isFinite(x.rate) && x.at <= now) by.set(x.at, x.rate);
      kept.rows = [...by].map(([at, rate]) => ({ at, rate })).sort((x, y) => x.at - y.at);
      coveredTo = until;
    }
    kept.from = Math.min(kept.from, a);
    kept.to = Math.max(kept.to, Math.min(coveredTo, Math.floor(now / hour) * hour));
  }
  kept.savedAt = iso(now);
  writeJson(file, kept);
  return kept;
}

async function loadMeta(r: MarketRef, src: PublicSource, req: LoadRequest): Promise<KeptMeta> {
  const symbol = symbolOf(r);
  const file = join(req.cache, src.id, fileSafe(symbol), "meta.json");
  const got = await src.listings({ q: symbol, limit: 5 });
  const l: Listing | undefined = Array.isArray(got) ? got.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase()) : undefined;
  if (l) {
    const meta: KeptMeta = {
      version: 1,
      symbol,
      name: l.name,
      quote: l.quote,
      ...(l.maxLeverage !== undefined ? { maxLeverage: l.maxLeverage } : {}),
      ...(l.qtyStep !== undefined ? { qtyStep: l.qtyStep } : {}),
      ...(l.minQty !== undefined ? { minQty: l.minQty } : {}),
      ...(l.priceStep !== undefined ? { priceStep: l.priceStep } : {}),
      ...(l.minNotional !== undefined ? { minNotional: l.minNotional } : {}),
      ...(l.fundingEveryH !== undefined ? { fundingEveryH: l.fundingEveryH } : {}),
      savedAt: iso(req.clock()),
    };
    writeJson(file, meta);
    return meta;
  }
  // the listing did not answer: what was kept of it last, else the market's plain name
  return readJson<KeptMeta>(file) ?? { version: 1, symbol, name: r.cls === "perp" ? `${r.base} perpetual` : r.cls === "spot" ? `${r.base} / USD` : r.base, quote: r.cls === "perp" ? "USDC" : "USD", savedAt: iso(req.clock()) };
}

/** every market of a run, read (from the cache where it covers the window) and made a BacktestMarket (see the top of this file) */
export async function loadHistory(req: LoadRequest): Promise<Loaded | Refusal> {
  const notes: string[] = [];
  const markets: BacktestMarket[] = [];
  for (const r of req.refs) {
    const src = req.sources[r.cls];
    const interval = intervalOf(r, req.interval);
    const meta = await loadMeta(r, src, req);
    const bars = await loadBars(r, src, interval, req.from, req.to, req, notes);
    if (isRefusal(bars)) return no(bars.code, { ...(bars.venue ? { venue: bars.venue } : {}), message: `${marketText(r)}: ${bars.message ?? bars.code}` });
    const inWindow = bars.bars.filter((b) => b.t >= req.from && b.t < req.to);
    if (!inWindow.length) return no("E_ACCOUNT_BAD_ACTION", { message: `${marketText(r)}: ${src.name} has no ${interval} bar between ${iso(req.from)} and ${iso(req.to)}${bars.ends ? ` (${bars.ends})` : ""}` });
    if (inWindow[0]!.t > req.from + INTERVAL_MS[interval] * 2 && bars.ends) notes.push(`${marketText(r)}: ${bars.ends} — its bars start ${iso(inWindow[0]!.t)}`);
    const funding = r.cls === "perp" ? await loadFunding(r, src, req.from, req.to, req, notes) : undefined;
    markets.push({
      symbol: symbolOf(r),
      kind: r.cls === "perp" ? "perp" : "spot",
      base: r.base,
      quote: meta.quote,
      name: meta.name,
      from: `${bars.words ?? src.name}${bars.adjustment ? ` (${bars.adjustment})` : ""}`,
      interval,
      bars: inWindow,
      ...(r.cls === "stock" ? { perYear: 252 } : {}),
      ...(funding ? { funding: funding.rows.filter((f) => f.at >= req.from && f.at <= req.to), fundingEveryH: meta.fundingEveryH ?? 1 } : {}),
      ...(meta.maxLeverage !== undefined ? { maxLeverage: meta.maxLeverage } : {}),
      ...(meta.qtyStep !== undefined ? { qtyStep: meta.qtyStep } : {}),
      ...(meta.minQty !== undefined ? { minQty: meta.minQty } : {}),
      ...(meta.priceStep !== undefined ? { priceStep: meta.priceStep } : {}),
      ...(meta.minNotional !== undefined ? { minNotional: meta.minNotional } : {}),
    });
  }
  return { markets, notes };
}
