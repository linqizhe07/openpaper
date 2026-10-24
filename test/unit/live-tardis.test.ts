import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Listing } from "../../src/portfolio/live/public-markets.ts";
import { BOOK_LEVELS, bookLevel, fetchTardis, firstAt, hyperliquidReplaySource, lastAt, latestFreeDay, parseBooks, parseTickers, parseTrades, replayMarket, replaySpan, tardisDay, tardisFree, tardisPath, tardisUrl, tradeBars, type Books, type Trades } from "../../src/portfolio/live/tardis.ts";

/** TARDIS.DEV'S RECORDED DAYS (live/tardis.ts): a day's files fetched once into the cache (the first of a month needs no key; any other
 * day is refused in words that name TARDIS_API_KEY), read into typed arrays in time order, and played back as a public source whose
 * every answer — the listing, the book, the trades, the candles, the funding — is the recording's state at the clock it is given. */
const T0 = Date.parse("2026-10-01T00:00:00Z");
const S = 1_000;
const MIN = 60_000;
const HOUR = 3_600_000;
const us = (ms: number): string => `${ms}000`;
const tradesCsv = (rows: Array<[ms: number, side: string, price: number | string, amount: number | string]>): string =>
  ["exchange,symbol,timestamp,local_timestamp,id,side,price,amount", ...rows.map(([ms, side, p, a], i) => `hyperliquid,BTC,${us(ms)},${us(ms + 1_800)},${1000 + i},${side},${p},${a}`)].join("\n") + "\n";
const booksCsv = (rows: Array<[ms: number, levels: Array<[askP: number, askA: number, bidP: number, bidA: number]>]>): string => {
  const head = ["exchange", "symbol", "timestamp", "local_timestamp"];
  for (let l = 0; l < BOOK_LEVELS; l++) head.push(`asks[${l}].price`, `asks[${l}].amount`, `bids[${l}].price`, `bids[${l}].amount`);
  const lines = rows.map(([ms, levels]) => {
    const f: string[] = ["hyperliquid", "BTC", us(ms), us(ms + 1_500)];
    for (let l = 0; l < BOOK_LEVELS; l++) {
      const lv = levels[l];
      f.push(...(lv ? lv.map(String) : ["", "", "", ""]));
    }
    return f.join(",");
  });
  return [head.join(","), ...lines].join("\n") + "\n";
};
const tickersCsv = (rows: Array<[ms: number, funding: number | "", oi: number | "", index: number | "", mark: number | ""]>): string =>
  ["exchange,symbol,timestamp,local_timestamp,funding_timestamp,funding_rate,predicted_funding_rate,open_interest,last_price,index_price,mark_price", ...rows.map(([ms, f, oi, ix, mk]) => `hyperliquid,BTC,${us(ms)},${us(ms)},,${f},,${oi},,${ix},${mk}`)].join("\n") + "\n";
const five = (ask: number, bid: number): Array<[number, number, number, number]> => [0, 1, 2, 3, 4].map((l) => [ask + l, 10 - l, bid - l, 10 - l]);

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "tardis-"));
  homes.push(d);
  return d;
};

describe("the days and the files", () => {
  it("names a day, says which are free, and the latest free one before now", () => {
    expect(tardisDay("2026-10-01")).toBe("2026-10-01");
    expect(tardisDay("2026-02-30")).toBeUndefined();
    expect(tardisDay("20261001")).toBeUndefined();
    expect(tardisFree("2026-10-01")).toBe(true);
    expect(tardisFree("2026-10-02")).toBe(false);
    // the first of this month once it has passed whole; else the first of last month
    expect(latestFreeDay(Date.parse("2026-10-24T12:00:00Z"))).toBe("2026-10-01");
    expect(latestFreeDay(Date.parse("2026-10-02T00:00:00Z"))).toBe("2026-10-01");
    expect(latestFreeDay(Date.parse("2026-10-01T05:00:00Z"))).toBe("2026-09-01");
    expect(latestFreeDay(Date.parse("2026-01-01T05:00:00Z"))).toBe("2025-12-01");
  });

  it("builds Tardis's URL and the cache's path: a symbol upper-cased, its / and : as -", () => {
    expect(tardisUrl("hyperliquid", "trades", "2026-10-01", "btc")).toBe("https://datasets.tardis.dev/v1/hyperliquid/trades/2026/10/01/BTC.csv.gz");
    expect(tardisUrl("binance", "book_snapshot_5", "2026-10-01", "BTC/USDT:USDT")).toBe("https://datasets.tardis.dev/v1/binance/book_snapshot_5/2026/10/01/BTC-USDT-USDT.csv.gz");
    expect(tardisPath("/c", "hyperliquid", "derivative_ticker", "2026-10-01", "eth")).toBe(join("/c", "hyperliquid", "derivative_ticker", "2026-10-01", "ETH.csv.gz"));
  });

  it("fetches a day once into the cache — whole, then moved into place — and reads it from there after; the key as a bearer", async () => {
    const cache = tmp();
    const bytes = gzipSync(Buffer.from(tradesCsv([[T0 + S, "buy", 83_600, 0.001]])));
    const asked: Array<{ url: string; auth: string | undefined }> = [];
    const fetchOf = (status: number) => (async (url: string | URL | Request, init?: RequestInit) => {
      asked.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.authorization });
      return new Response(status === 200 ? bytes : "no", { status });
    }) as typeof fetch;
    const one = await fetchTardis({ cache, exchange: "hyperliquid", dataType: "trades", day: "2026-10-01", symbol: "BTC", fetch: fetchOf(200) });
    if (isRefusal(one)) throw new Error(one.message);
    expect(one).toEqual({ path: tardisPath(cache, "hyperliquid", "trades", "2026-10-01", "BTC"), from: "download", bytes: bytes.length });
    expect(readFileSync(one.path)).toEqual(bytes);
    expect(existsSync(`${one.path}.part`)).toBe(false);
    expect(asked).toEqual([{ url: "https://datasets.tardis.dev/v1/hyperliquid/trades/2026/10/01/BTC.csv.gz", auth: undefined }]);
    // the second ask reads the cache: nothing fetched
    const two = await fetchTardis({ cache, exchange: "hyperliquid", dataType: "trades", day: "2026-10-01", symbol: "btc", fetch: fetchOf(200) });
    expect(two).toEqual({ path: one.path, from: "cache", bytes: bytes.length });
    expect(asked).toHaveLength(1);
    // a key goes as a bearer
    await fetchTardis({ cache, exchange: "hyperliquid", dataType: "trades", day: "2026-10-02", symbol: "BTC", apiKey: "TD.key", fetch: fetchOf(200) });
    expect(asked[1]?.auth).toBe("Bearer TD.key");
  });

  it("says Tardis's refusals in words: a day that is not free without a key, a symbol it has nothing for, a network that did not answer", async () => {
    const cache = tmp();
    const ask = (day: string, fetch: typeof globalThis.fetch, symbol = "BTC") => fetchTardis({ cache, exchange: "hyperliquid", dataType: "trades", day, symbol, fetch }) as Promise<Refusal>;
    const status = (n: number) => (async () => new Response("no", { status: n })) as typeof fetch;
    const notFree = await ask("2026-10-02", status(403));
    expect(notFree.code).toBe("E_ACCOUNT_CREDENTIAL");
    expect(notFree.message).toContain("Tardis gives only the first day of each month without a key");
    expect(notFree.message).toContain("TARDIS_API_KEY");
    expect(notFree.message).toContain("replay 2026-10-01");
    const free = await ask("2026-10-01", status(401));
    expect(free.message).toContain("although the first day of a month needs no key");
    const none = await ask("2026-10-01", status(404), "NOPE");
    expect(none.code).toBe("E_VENUE_REJECTED");
    expect(none.message).toBe("Tardis has no trades for NOPE at hyperliquid on 2026-10-01 (404): its symbols are at https://api.tardis.dev/v1/exchanges/hyperliquid");
    const down = await ask("2026-10-01", (async () => { throw new Error("ECONNRESET"); }) as typeof fetch);
    expect(down.code).toBe("E_VENUE_UNREACHABLE");
    expect(down.message).toContain("did not answer");
    expect(down.message).toContain("ECONNRESET");
    const other = await ask("2026-10-01", status(503));
    expect(other.message).toBe("Tardis answered 503 for https://datasets.tardis.dev/v1/hyperliquid/trades/2026/10/01/BTC.csv.gz");
    // nothing was written for any of them
    expect(existsSync(dirname(tardisPath(cache, "hyperliquid", "trades", "2026-10-01", "BTC")))).toBe(false);
  });
});

describe("the files read", () => {
  it("trades: in time order whatever the file's order, a running sum of dollars, the lot from the amounts' decimals, the taker's side", () => {
    const tr = parseTrades(tradesCsv([[T0 + 2 * S, "sell", 83_700, "0.00020"], [T0 + S, "buy", 83_600, 0.001], [T0 + 3 * S, "x", 83_650, "0.00005"], [T0 + 4 * S, "buy", 0, 1], [T0 + 5 * S, "buy", 1, 0]]));
    expect(tr.n).toBe(3);
    expect([...tr.t]).toEqual([T0 + S, T0 + 2 * S, T0 + 3 * S]);
    expect([...tr.price]).toEqual([83_600, 83_700, 83_650]);
    expect([...tr.amount]).toEqual([0.001, 0.0002, 0.00005]);
    expect([...tr.side]).toEqual([1, -1, 0]);
    expect([...tr.usd].map((x) => Number(x.toFixed(6)))).toEqual([83.6, 100.34, 104.5225]);
    // "0.00020" is four places (its trailing zero is not a place); "0.00005" five
    expect(tr.amountDecimals).toBe(5);
    expect(() => parseTrades("exchange,symbol,timestamp\nhyperliquid,BTC,1\n")).toThrow(/without its side column/);
  });

  it("books: five levels a side, a missing level NaN, read by row and level", () => {
    const b = parseBooks(booksCsv([[T0 + MIN, five(83_701, 83_699)], [T0, [[83_601, 1, 83_599, 2], [83_602, 3, 83_598, 4]]]]));
    expect(b.n).toBe(2);
    expect([...b.t]).toEqual([T0, T0 + MIN]);
    expect(bookLevel(b, 0, 0)).toEqual([83_601, 1, 83_599, 2]);
    expect(bookLevel(b, 0, 1)).toEqual([83_602, 3, 83_598, 4]);
    expect(bookLevel(b, 0, 2).every((x) => Number.isNaN(x))).toBe(true);
    expect(bookLevel(b, 1, 4)).toEqual([83_705, 6, 83_695, 6]);
  });

  it("tickers: a field the exchange did not send is NaN; the latest number at a moment looks back past it", async () => {
    const tk = parseTickers(tickersCsv([[T0, 0.0000125, 35_000, 83_622, 83_607], [T0 + 2 * S, "", 35_001, "", ""]]));
    expect(tk.n).toBe(2);
    expect([...tk.funding].map((x) => (Number.isNaN(x) ? "nan" : x))).toEqual([0.0000125, "nan"]);
    expect([...tk.openInterest]).toEqual([35_000, 35_001]);
    const m = replayMarket("btc", parseTrades(tradesCsv([[T0 + S, "buy", 83_600, 0.001]])), parseBooks(booksCsv([[T0, five(83_601, 83_599)]])), tk);
    const src = hyperliquidReplaySource({ day: "2026-10-01", markets: [m], clock: () => T0 + 3 * S });
    const [l] = (await src.listings({ limit: 10 })) as Listing[];
    expect(l?.fundingRate).toBe(0.0000125);
    expect(l?.markPrice).toBe(83_607);
    expect(l?.openInterest).toBe(35_001);
  });

  it("finds a moment's row by binary search, and makes minute bars from the trades", () => {
    const t = Float64Array.from([10, 20, 20, 30]);
    expect(lastAt(t, 4, 5)).toBe(-1);
    expect(lastAt(t, 4, 10)).toBe(0);
    expect(lastAt(t, 4, 25)).toBe(2);
    expect(lastAt(t, 4, 99)).toBe(3);
    expect(firstAt(t, 4, 20)).toBe(1);
    expect(firstAt(t, 4, 21)).toBe(3);
    expect(firstAt(t, 4, 31)).toBe(4);
    const tr = parseTrades(tradesCsv([[T0 + S, "buy", 100, 1], [T0 + 30 * S, "sell", 101, 2], [T0 + 59 * S, "buy", 99, 1], [T0 + 2 * MIN + S, "buy", 102, 0.5]]));
    expect(tradeBars(tr, T0, T0 + 3 * MIN)).toEqual([{ t: T0, o: 100, h: 101, l: 99, c: 99, v: 4 }, { t: T0 + 2 * MIN, o: 102, h: 102, l: 102, c: 102, v: 0.5 }]);
    // a window: from is included, to is not
    expect(tradeBars(tr, T0 + 2 * MIN, T0 + 2 * MIN + S)).toEqual([]);
    expect(tradeBars(tr, T0 + 2 * MIN, T0 + 2 * MIN + 2 * S)).toHaveLength(1);
  });
});

describe("the replay source", () => {
  const trades = parseTrades(tradesCsv([[T0 + 5 * S, "buy", 83_600, 0.001], [T0 + 65 * S, "sell", 83_700, 0.002], [T0 + 125 * S, "buy", 83_500, 0.001]]));
  const books = parseBooks(booksCsv([[T0, five(83_601, 83_599)], [T0 + 60 * S, five(83_701, 83_699)]]));
  const tickers = parseTickers(tickersCsv([[T0, 0.0000125, 35_000, 83_622, 83_607], [T0 + HOUR, 0.00002, 35_100, 83_650, 83_640]]));
  const btc = replayMarket("BTC", trades, books, tickers);
  const eth = replayMarket("eth", parseTrades(tradesCsv([[T0 + 10 * S, "buy", 2_450, 0.01]])), parseBooks(booksCsv([[T0, five(2_451, 2_449)]])));
  const at = (ms: number) => hyperliquidReplaySource({ day: "2026-10-01", markets: [btc, eth], clock: () => ms });
  const listing = async (ms: number, symbol = "BTC-PERP"): Promise<Listing> => {
    const r = await at(ms).listings({ limit: 10 });
    if (isRefusal(r)) throw new Error(r.message);
    const l = r.find((x) => x.symbol === symbol);
    if (!l) throw new Error(`no ${symbol}`);
    return l;
  };

  it("is Hyperliquid's perpetual at the clock: the last trade's price, the latest book's top, the day's change and volume from its first trade, the ticker's funding and mark, the lot from the amounts", async () => {
    const l = await listing(T0 + 70 * S);
    expect(l).toMatchObject({ symbol: "BTC-PERP", name: "BTC perpetual on Hyperliquid (replay of 2026-10-01)", kind: "perp", base: "BTC", quote: "USDC", price: 83_700, bid: 83_699, ask: 83_701, open: true, types: [], fundingRate: 0.0000125, nextFundingAt: "2026-10-01T01:00:00.000Z", fundingEveryH: 1, markPrice: 83_607, oraclePrice: 83_622, openInterest: 35_000, quoteAt: "2026-10-01T00:01:10.000Z", quoteFrom: "Hyperliquid · replay" });
    expect(l.change24h).toBe(100);
    expect(l.changePct24h).toBeCloseTo((100 / 83_600) * 100, 8);
    expect(l.volumeUsd24h).toBeCloseTo(83.6 + 167.4, 6);
    expect(l.statsFrom).toBe("the recording's trades since 00:00 UTC of 2026-10-01");
    expect(l.openInterestUsd).toBe(Math.round(35_000 * 83_607 * 100) / 100);
    // Hyperliquid's lot from the amounts' three decimals here, its $10 minimum (hl-rules.ts)
    expect(l).toMatchObject({ qtyStep: 0.001, minQty: 0.001, minNotional: 10 });
    expect(l.priceStep).toBeGreaterThan(0);
    // the busier first, the list cut to the limit, a search by coin
    const both = await at(T0 + 70 * S).listings({ limit: 10 });
    expect((both as Listing[]).map((x) => x.symbol)).toEqual(["BTC-PERP", "ETH-PERP"]);
    expect(((await at(T0 + 70 * S).listings({ limit: 1 })) as Listing[]).map((x) => x.symbol)).toEqual(["BTC-PERP"]);
    expect(((await at(T0 + 70 * S).listings({ q: "eth", limit: 10 })) as Listing[]).map((x) => x.symbol)).toEqual(["ETH-PERP"]);
    expect(((await at(T0 + 70 * S).listings({ q: "SOL", limit: 10 })) as Listing[]).length).toBe(0);
  });

  it("before its first trade a market is priced at the book's middle; before its first book and trade it is not listed, and its book is refused", async () => {
    const early = await listing(T0 + S);
    expect(early.price).toBe(83_600);
    expect(early.change24h).toBeUndefined();
    expect(early.volumeUsd24h).toBe(0);
    const none = await at(T0 - S).listings({ limit: 10 });
    expect(none).toEqual([]);
    const book = (await at(T0 - S).book!("BTC-PERP", 5)) as Refusal;
    expect(book.code).toBe("E_VENUE_REJECTED");
    expect(book.message).toBe("Hyperliquid · replay of 2026-10-01 has no BTC-PERP book before 2026-10-01T00:00:00.000Z");
    const unknown = (await at(T0 + MIN).book!("SOL-PERP", 5)) as Refusal;
    expect(unknown.message).toBe("Hyperliquid · replay of 2026-10-01 holds BTC-PERP, ETH-PERP, not SOL-PERP");
  });

  it("the book is the latest snapshot, stamped with the clock, as many levels as asked of the five; the trades the latest, newest first", async () => {
    const book = await at(T0 + 70 * S).book!("btc-perp", 5);
    if (isRefusal(book)) throw new Error(book.message);
    expect(book).toEqual({ bids: [[83_699, 10], [83_698, 9], [83_697, 8], [83_696, 7], [83_695, 6]], asks: [[83_701, 10], [83_702, 9], [83_703, 8], [83_704, 7], [83_705, 6]], at: "2026-10-01T00:01:10.000Z", from: "Hyperliquid (replay of 2026-10-01)", depth: "full", more: { bids: true, asks: true } });
    const two = await at(T0 + 70 * S).book!("BTC-PERP", 2);
    if (isRefusal(two)) throw new Error(two.message);
    expect(two.bids).toHaveLength(2);
    // the earlier snapshot while the clock is before the second
    const first = await at(T0 + 30 * S).book!("BTC-PERP", 1);
    if (isRefusal(first)) throw new Error(first.message);
    expect(first.asks).toEqual([[83_601, 10]]);
    const trades = await at(T0 + 70 * S).trades!("BTC-PERP", 10);
    expect(trades).toEqual([{ price: 83_700, size: 0.002, at: "2026-10-01T00:01:05.000Z", side: "sell" }, { price: 83_600, size: 0.001, at: "2026-10-01T00:00:05.000Z", side: "buy" }]);
    expect(await at(T0 + 70 * S).trades!("BTC-PERP", 1)).toHaveLength(1);
  });

  it("candles are the trades' minute bars, folded to the size asked, never past the clock; the page says the day is all there is", async () => {
    const page = await at(T0 + 130 * S).candles!("BTC-PERP", "1m", { since: T0 });
    if (isRefusal(page) || Array.isArray(page)) throw new Error("a page was expected");
    expect(page.bars).toEqual([{ t: T0, o: 83_600, h: 83_600, l: 83_600, c: 83_600, v: 0.001 }, { t: T0 + MIN, o: 83_700, h: 83_700, l: 83_700, c: 83_700, v: 0.002 }, { t: T0 + 2 * MIN, o: 83_500, h: 83_500, l: 83_500, c: 83_500, v: 0.001 }]);
    expect(page).toMatchObject({ more: false, ends: "Hyperliquid · replay of 2026-10-01 holds 2026-10-01 alone: nothing older is recorded here", source: "Hyperliquid · BTC-PERP (replay of 2026-10-01)" });
    expect(page.folded).toBeUndefined();
    // the clock cuts the window: the third trade has not happened yet
    const sofar = await at(T0 + 70 * S).candles!("BTC-PERP", "1m", { since: T0 });
    expect((sofar as { bars: unknown[] }).bars).toHaveLength(2);
    // folded, and said so; the latest `limit` bars; `until` ends the window
    const five = await at(T0 + 130 * S).candles!("BTC-PERP", "5m", { since: T0 });
    expect((five as { bars: unknown[]; folded?: string }).bars).toEqual([{ t: T0, o: 83_600, h: 83_700, l: 83_500, c: 83_500, v: 0.004 }]);
    expect((five as { folded?: string }).folded).toBe("5m bars folded from the recording's trades, minute by minute");
    expect((await at(T0 + 130 * S).candles!("BTC-PERP", "1m", { since: T0, limit: 1 }) as { bars: Array<{ t: number }> }).bars.map((b) => b.t)).toEqual([T0 + 2 * MIN]);
    expect((await at(T0 + 130 * S).candles!("BTC-PERP", "1m", { since: T0, until: T0 + MIN }) as { bars: unknown[] }).bars).toHaveLength(1);
    expect(isRefusal(await at(T0 + 130 * S).candles!("DOGE-PERP", "1m", { since: T0 }))).toBe(true);
  });

  it("the funding history is the ticker's rate at each top of the hour up to the clock; the stats and the notes say what this is", async () => {
    const h = await at(T0 + 2 * HOUR).fundingHistory!("BTC-PERP", T0 - 10 * MIN, T0 + 3 * HOUR);
    expect(h).toEqual([{ at: T0, rate: 0.0000125 }, { at: T0 + HOUR, rate: 0.00002 }, { at: T0 + 2 * HOUR, rate: 0.00002 }]);
    expect(await at(T0 + 2 * HOUR).fundingHistory!("ETH-PERP", T0, T0 + HOUR)).toEqual([]);
    const stats = await at(T0 + 70 * S).stats!(["btc-perp"]);
    if (isRefusal(stats)) throw new Error(stats.message);
    expect([...stats.keys()]).toEqual(["BTC-PERP"]);
    expect(stats.get("BTC-PERP")).toMatchObject({ price: 83_700, change24h: 100 });
    const src = at(T0 + MIN);
    expect(src.notes!({})).toEqual(["Hyperliquid · replay of 2026-10-01: 2 perpetuals of 2026-10-01 as tardis.dev recorded them, played back at the account's clock — nothing here is live."]);
    expect(src).toMatchObject({ id: "replay-hyperliquid", name: "Hyperliquid · replay of 2026-10-01", kind: "exchange", connector: "live:replay", readOnly: "a recorded day (2026-10-01) played back: its markets trade in a paper account only" });
    expect(replaySpan(btc)).toEqual({ from: T0, to: T0 + 125 * S });
  });
});

/** a market is made from files on disk too: the parsers read what fetchTardis kept */
describe("a day from the cache", () => {
  it("reads the three files a market needs", () => {
    const cache = tmp();
    const put = (dataType: "trades" | "book_snapshot_5" | "derivative_ticker", text: string) => {
      const p = tardisPath(cache, "hyperliquid", dataType, "2026-10-01", "BTC");
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, gzipSync(Buffer.from(text)));
      return p;
    };
    const t = put("trades", tradesCsv([[T0 + S, "buy", 83_600, 0.001]]));
    const b = put("book_snapshot_5", booksCsv([[T0, five(83_601, 83_599)]]));
    const k = put("derivative_ticker", tickersCsv([[T0, 0.0000125, 35_000, 83_622, 83_607]]));
    const read = (p: string): string => gunzipSync(readFileSync(p)).toString("utf8");
    const m = replayMarket("BTC", parseTrades(read(t)) as Trades, parseBooks(read(b)) as Books, parseTickers(read(k)));
    expect([m.trades.n, m.books.n, m.tickers?.n, m.szDecimals]).toEqual([1, 1, 1, 3]);
  });
});
