import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, HUB_URLS, IDLE_MS, krakenChecksum, LIVE_MS, StreamHub, streamOf, type HubTick, type WebSocketLike } from "../../src/portfolio/live/stream-hub.ts";

/** THE MARKET-DATA HUB (live/stream-hub.ts; feat/paper-live p2a) against a stand-in for a WebSocket — no network. Each venue's stream as its
 * messages were checked live on 2026-10-16: the subscriptions sent (one connection a venue, nothing before a market is wanted), a snapshot
 * and an update read into the market's quote, its book (Kraken's CRC32 checked, a book that differs sent for afresh) and its trades (the
 * ring's highest and lowest since a judge looked), the keepalive each venue needs, a market live only while its connection spoke in the
 * last three seconds, a connection that drops or goes silent opened again after a jittered wait and every market subscribed again, a sleep
 * found by the clock, the gate (a venue whose REST does not answer here is not streamed), the idle drop, the cap and a venue's refusal */

/** a WebSocket as the hub uses one: what was sent, and the venue's side — open(), say(), drop() */
class FakeWs implements WebSocketLike {
  static all: FakeWs[] = [];
  readyState = 0;
  readonly sent: string[] = [];
  closed = false;
  private readonly on = new Map<string, Array<(ev: { data?: unknown }) => void>>();
  constructor(readonly url: string) {
    FakeWs.all.push(this);
  }
  addEventListener(type: string, fn: (ev: { data?: unknown }) => void): void {
    this.on.set(type, [...(this.on.get(type) ?? []), fn]);
  }
  send(data: string): void {
    if (this.readyState !== 1) throw new Error("not open");
    this.sent.push(data);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.emit("close");
  }
  open(): void {
    this.readyState = 1;
    this.emit("open");
  }
  say(msg: unknown): void {
    this.emit("message", { data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
  /** the venue let go of the connection without a word */
  drop(): void {
    this.readyState = 3;
    this.closed = true;
    this.emit("close");
  }
  private emit(type: string, ev: { data?: unknown } = {}): void {
    for (const fn of this.on.get(type) ?? []) fn(ev);
  }
  get json(): unknown[] {
    return this.sent.map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    });
  }
}
const socketsTo = (venue: keyof typeof HUB_URLS) => FakeWs.all.filter((w) => w.url === HUB_URLS[venue]);
const last = (venue: keyof typeof HUB_URLS) => socketsTo(venue).at(-1)!;
/** the end of this turn: the hub sets its subscriptions there (several wants at once are one set of messages) */
const turn = () => vi.advanceTimersByTimeAsync(0);

let hub: StreamHub;
beforeEach(() => {
  FakeWs.all = [];
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-16T15:00:00Z"));
});
afterEach(() => {
  hub?.close();
  vi.useRealTimers();
});
const make = (o: { answers?: (v: string) => boolean; maxMarkets?: number; random?: () => number } = {}) => (hub = new StreamHub({ WebSocket: FakeWs, ...(o.answers ? { answers: o.answers } : {}), ...(o.maxMarkets ? { maxMarkets: o.maxMarkets } : {}), random: o.random ?? (() => 0.5) }));

describe("which market is streamed, and by whom (streamOf)", () => {
  it("a market by its own listing source's venue only, in that venue's own symbol — and never Binance, Bybit, a stock, an event or a pre-IPO venue's contract", () => {
    expect(streamOf("coinbase", "BTC/USD")).toEqual({ venue: "coinbase", sym: "BTC-USD" });
    expect(streamOf("kraken", "BTC/USD")).toEqual({ venue: "kraken", sym: "BTC/USD" });
    expect(streamOf("okx", "BTC/USDT")).toEqual({ venue: "okx", sym: "BTC-USDT" });
    expect(streamOf("hyperliquid", "BTC-PERP")).toEqual({ venue: "hyperliquid", sym: "BTC" });
    expect(streamOf("hyperliquid-preipo", "io:ANTH-PERP")).toEqual({ venue: "hyperliquid", sym: "io:ANTH" });
    expect(streamOf("hyperliquid-world", "xyz:GOLD-PERP")).toEqual({ venue: "hyperliquid", sym: "xyz:GOLD" });
    for (const [s, sym] of [["binance", "BTC/USDT"], ["bybit", "BTC/USDT"], ["us-stocks", "AAPL"], ["kalshi", "KXFED-25DEC-T4.00:YES"], ["okx-preipo", "ANTHROPIC/USDT:USDT"], ["okx", "BTC/USDT:USDT"], ["hyperliquid", "io:ANTH-PERP"]] as const) expect(streamOf(s, sym)).toBeUndefined();
    make();
    expect(hub.covers("binance", "BTC/USDT")).toBe(false);
    expect(hub.want("bybit", "BTC/USDT")).toBe(false);
    expect(FakeWs.all).toHaveLength(0);
  });
});

describe("the stream hub (live/stream-hub.ts)", () => {
  it("opens nothing until a market is wanted; then one connection a venue, whatever the number of markets, and each venue's own subscriptions", async () => {
    make();
    await turn();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeWs.all).toHaveLength(0);
    hub.want("coinbase", "BTC/USD");
    hub.want("coinbase", "ETH/USD");
    hub.want("hyperliquid", "BTC-PERP");
    hub.want("kraken", "BTC/USD");
    hub.want("okx", "BTC/USDT");
    await turn();
    expect(FakeWs.all.map((w) => w.url).sort()).toEqual(Object.values(HUB_URLS).sort());
    for (const w of FakeWs.all) w.open();
    expect(last("coinbase").json).toEqual([{ type: "subscribe", channel: "heartbeats" }, { type: "subscribe", product_ids: ["BTC-USD", "ETH-USD"], channel: "ticker" }, { type: "subscribe", product_ids: ["BTC-USD", "ETH-USD"], channel: "market_trades" }]);
    expect(last("hyperliquid").json).toEqual(["bbo", "trades", "activeAssetCtx"].map((type) => ({ method: "subscribe", subscription: { type, coin: "BTC" } })).concat([{ method: "subscribe", subscription: { type: "candle", coin: "BTC", interval: "1m" } } as never]));
    expect(last("kraken").json).toEqual([{ method: "subscribe", params: { channel: "instrument", snapshot: true } }, { method: "subscribe", params: { channel: "ticker", symbol: ["BTC/USD"], event_trigger: "bbo" } }, { method: "subscribe", params: { channel: "trade", symbol: ["BTC/USD"], snapshot: true } }, { method: "subscribe", params: { channel: "ohlc", symbol: ["BTC/USD"], interval: 1 } }]);
    expect(last("okx").json).toEqual([{ op: "subscribe", args: ["bbo-tbt", "tickers", "trades"].map((channel) => ({ channel, instId: "BTC-USDT" })) }]);
    // a market wanted while the connection is open is subscribed on it, not on another
    hub.want("coinbase", "SOL/USD");
    await turn();
    expect(socketsTo("coinbase")).toHaveLength(1);
    expect(last("coinbase").json.slice(3)).toEqual([{ type: "subscribe", product_ids: ["SOL-USD"], channel: "ticker" }, { type: "subscribe", product_ids: ["SOL-USD"], channel: "market_trades" }]);
  });

  it("reads each venue's snapshot and updates into the market's quote — the bid, the ask, their sizes, the last trade, a perpetual's mark and funding — with the venue's own time, when it came, and a seq that rises", async () => {
    make();
    const ticks: HubTick[] = [];
    hub.onTick((t) => ticks.push(t));
    for (const [s, sym] of [["coinbase", "BTC/USD"], ["hyperliquid", "BTC-PERP"], ["kraken", "BTC/USD"], ["okx", "BTC/USDT"]] as const) hub.want(s, sym);
    await turn();
    for (const w of FakeWs.all) w.open();
    expect(hub.quote("coinbase", "BTC/USD")).toBeUndefined();
    const t0 = Date.now();
    last("coinbase").say({ channel: "ticker", timestamp: "2026-10-16T14:59:59.900123456Z", sequence_num: 0, events: [{ type: "snapshot", tickers: [{ type: "ticker", product_id: "BTC-USD", price: "81765.12", best_bid: "81765.01", best_ask: "81765.99", best_bid_quantity: "0.5", best_ask_quantity: "1.25" }] }] });
    // the best bid and ask at the venue's own moment of them (priceAt: the ticker's stamp)
    expect(hub.quote("coinbase", "BTC/USD")).toEqual({ bid: 81765.01, ask: 81765.99, bidSz: 0.5, askSz: 1.25, last: 81765.12, at: Date.parse("2026-10-16T14:59:59.900Z"), priceAt: Date.parse("2026-10-16T14:59:59.900Z"), recvAt: t0, seenAt: t0, src: "Coinbase", seq: 1, live: true });
    last("coinbase").say({ channel: "ticker", timestamp: "2026-10-16T15:00:00.050Z", sequence_num: 1, events: [{ type: "update", tickers: [{ product_id: "BTC-USD", price: "81766", best_bid: "81766", best_ask: "81767", best_bid_quantity: "2", best_ask_quantity: "3" }] }] });
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ bid: 81766, ask: 81767, last: 81766, seq: 2 });
    last("hyperliquid").say({ channel: "bbo", data: { coin: "BTC", time: t0 - 300, bbo: [{ px: "81765.0", sz: "5.27304", n: 20 }, { px: "81766.0", sz: "1.1", n: 3 }] } });
    last("hyperliquid").say({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { funding: "0.0000125", openInterest: "1000", prevDayPx: "80000", dayNtlVlm: "2599518859.45", premium: "-0.0003749322", markPx: "81765.5", oraclePx: "81760.0", midPx: "81765.5" } } });
    // the seq is one count for every market of the hub (Coinbase's two messages came first): it only rises, market by market. A perpetual's
    // day as the venue streams it: its open interest in coins, its dollars traded, the price 24 hours ago, its premium
    expect(hub.quote("hyperliquid", "BTC-PERP")).toMatchObject({ bid: 81765, ask: 81766, bidSz: 5.27304, askSz: 1.1, mark: 81765.5, oracle: 81760, funding: 0.0000125, openInterest: 1000, volumeUsd24h: 2599518859.45, prevDayPx: 80000, premium: -0.0003749322, src: "Hyperliquid", live: true, seq: 4 });
    // a message without them (the venue says its context in parts): what it said before stands
    last("hyperliquid").say({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { funding: "0.000013", markPx: "81766" } } });
    expect(hub.quote("hyperliquid", "BTC-PERP")).toMatchObject({ mark: 81766, funding: 0.000013, openInterest: 1000, volumeUsd24h: 2599518859.45, prevDayPx: 80000, premium: -0.0003749322, seq: 5 });
    last("kraken").say({ channel: "ticker", type: "snapshot", data: [{ symbol: "BTC/USD", bid: 81760.1, bid_qty: 0.3, ask: 81760.2, ask_qty: 0.7, last: 81760.1, timestamp: "2026-10-16T14:59:59.950Z" }] });
    expect(hub.quote("kraken", "BTC/USD")).toMatchObject({ bid: 81760.1, ask: 81760.2, last: 81760.1, src: "Kraken" });
    // OKX: the ticker's figures stand until bbo-tbt's first, then bbo-tbt's
    last("okx").say({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [{ instId: "BTC-USDT", last: "81770.1", bidPx: "81770", bidSz: "1", askPx: "81770.2", askSz: "2", ts: String(t0) }] });
    expect(hub.quote("okx", "BTC/USDT")).toMatchObject({ bid: 81770, ask: 81770.2, last: 81770.1 });
    last("okx").say({ arg: { channel: "bbo-tbt", instId: "BTC-USDT" }, data: [{ asks: [["81771", "0.4", "0", "2"]], bids: [["81769.9", "0.6", "0", "1"]], ts: String(t0 + 5) }] });
    expect(hub.quote("okx", "BTC/USDT")).toMatchObject({ bid: 81769.9, ask: 81771, bidSz: 0.6, askSz: 0.4, last: 81770.1, at: t0 + 5 });
    // each market told once a message, and that it went live
    expect(ticks.filter((t) => t.source === "coinbase").map((t) => t.what)).toEqual(["live", "quote", "quote"]);
  });

  it("stamps a quote's best bid and ask with the venue's own moment of them (priceAt) — their channel's stamp, or the book's message that moved its top — never another channel's moment, nor this machine's where the venue stamped none, and none once the subscription goes", async () => {
    make();
    for (const [s, sym] of [["hyperliquid", "BTC-PERP"], ["coinbase", "BTC/USD"], ["kraken", "BTC/USD"]] as const) hub.want(s, sym);
    const release = hub.hold("coinbase", "BTC/USD", { book: true });
    await turn();
    for (const w of FakeWs.all) w.open();
    const t0 = Date.now();
    // Hyperliquid: the bbo's block time; the mark and funding that follow (activeAssetCtx carries no time: `at` is this machine's then) and a
    // trade leave it as it was
    last("hyperliquid").say({ channel: "bbo", data: { coin: "BTC", time: t0 - 370, bbo: [{ px: "81765", sz: "1", n: 2 }, { px: "81766", sz: "1", n: 2 }] } });
    expect(hub.quote("hyperliquid", "BTC-PERP")).toMatchObject({ at: t0 - 370, priceAt: t0 - 370 });
    await vi.advanceTimersByTimeAsync(400);
    last("hyperliquid").say({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { funding: "0.00001", markPx: "81765.5", oraclePx: "81760" } } });
    last("hyperliquid").say({ channel: "trades", data: [{ coin: "BTC", side: "B", px: "81766", sz: "0.1", time: t0 + 10, tid: 1 }] });
    expect(hub.quote("hyperliquid", "BTC-PERP")).toMatchObject({ at: Date.now(), priceAt: t0 - 370, mark: 81765.5, last: 81766 });
    last("hyperliquid").say({ channel: "bbo", data: { coin: "BTC", time: t0 + 30, bbo: [{ px: "81766", sz: "1", n: 2 }, { px: "81767", sz: "1", n: 2 }] } });
    expect(hub.quote("hyperliquid", "BTC-PERP")!.priceAt).toBe(t0 + 30);
    // a best bid and ask the venue stamped no moment on: none is said for them
    last("kraken").say({ channel: "ticker", type: "snapshot", data: [{ symbol: "BTC/USD", bid: 81760.1, bid_qty: 0.3, ask: 81760.2, ask_qty: 0.7, last: 81760.1 }] });
    expect(hub.quote("kraken", "BTC/USD")).not.toHaveProperty("priceAt");
    // Coinbase's book stands for its best bid and ask while it is kept: the moment of the book message that moved its top — and not of one
    // that moved only a deeper level
    last("coinbase").say({ channel: "ticker", timestamp: new Date(t0 + 5).toISOString(), sequence_num: 0, events: [{ type: "snapshot", tickers: [{ product_id: "BTC-USD", price: "81700", best_bid: "81699", best_ask: "81702", best_bid_quantity: "1", best_ask_quantity: "1" }] }] });
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ bid: 81699, priceAt: t0 + 5 });
    last("coinbase").say({ channel: "l2_data", timestamp: new Date(t0 + 50).toISOString(), sequence_num: 1, events: [{ type: "snapshot", product_id: "BTC-USD", updates: Array.from({ length: 25 }, (_, i) => [{ side: "bid", event_time: new Date(t0 + 40).toISOString(), price_level: String(81700 - i), new_quantity: "1" }, { side: "offer", event_time: new Date(t0 + 40).toISOString(), price_level: String(81701 + i), new_quantity: "1" }]).flat() }] });
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ bid: 81700, ask: 81701, priceAt: t0 + 40 });
    last("coinbase").say({ channel: "l2_data", timestamp: new Date(t0 + 70).toISOString(), sequence_num: 2, events: [{ type: "update", product_id: "BTC-USD", updates: [{ side: "bid", event_time: new Date(t0 + 60).toISOString(), price_level: "81690", new_quantity: "3" }] }] });
    expect(hub.quote("coinbase", "BTC/USD")!.priceAt).toBe(t0 + 40);
    last("coinbase").say({ channel: "l2_data", timestamp: new Date(t0 + 90).toISOString(), sequence_num: 3, events: [{ type: "update", product_id: "BTC-USD", updates: [{ side: "bid", event_time: new Date(t0 + 80).toISOString(), price_level: "81700.5", new_quantity: "2" }] }] });
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ bid: 81700.5, priceAt: t0 + 80 });
    // the connection lost: what the subscription said of the best bid and ask goes with it, and its moment too
    last("hyperliquid").close();
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    last("hyperliquid").open();
    last("hyperliquid").say({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { funding: "0.00001", markPx: "81770", oraclePx: "81765" } } });
    expect(hub.quote("hyperliquid", "BTC-PERP")).not.toHaveProperty("priceAt");
    release();
  });

  it("keeps the last trades, once each, and says their highest and lowest since a judge looked — by seq, and only those the venue stamped after a moment, so a snapshot sent again on a reconnect is not taken as news", async () => {
    make();
    hub.want("kraken", "ETH/USD");
    await turn();
    last("kraken").open();
    const t0 = Date.now();
    last("kraken").say({ channel: "trade", type: "snapshot", data: [{ symbol: "ETH/USD", side: "buy", price: 2450.5, qty: 1, trade_id: 1, timestamp: new Date(t0 - 60_000).toISOString() }, { symbol: "ETH/USD", side: "sell", price: 2449, qty: 2, trade_id: 2, timestamp: new Date(t0 - 30_000).toISOString() }] });
    const q = hub.quote("kraken", "ETH/USD")!;
    expect(q.last).toBe(2449);
    last("kraken").say({ channel: "trade", type: "update", data: [{ symbol: "ETH/USD", side: "sell", price: 2440, qty: 0.5, trade_id: 3, timestamp: new Date(t0 + 10).toISOString() }, { symbol: "ETH/USD", side: "buy", price: 2455, qty: 0.5, trade_id: 4, timestamp: new Date(t0 + 20).toISOString() }, { symbol: "ETH/USD", side: "buy", price: 2451, qty: 0.5, trade_id: 4, timestamp: new Date(t0 + 20).toISOString() }] });
    expect(hub.since("kraken", "ETH/USD", q.seq)).toEqual({ hi: 2455, lo: 2440, trades: 2, seq: q.seq + 2 });
    expect(hub.since("kraken", "ETH/USD", 0, { after: t0 })).toMatchObject({ hi: 2455, lo: 2440, trades: 2 });
    // a snapshot's trades count only where the venue stamped them after the last judge; a live trade by its seq alone, however late it
    // came after its stamp (Hyperliquid's come half a second behind)
    expect(hub.since("kraken", "ETH/USD", 0, { snapshotAfter: t0 })).toMatchObject({ hi: 2455, lo: 2440, trades: 2 });
    expect(hub.since("kraken", "ETH/USD", 0, { snapshotAfter: t0 - 45_000 })).toMatchObject({ hi: 2455, lo: 2440, trades: 3 });
    expect(hub.trades("kraken", "ETH/USD", 3)).toEqual([
      { price: 2455, size: 0.5, side: "buy", at: new Date(t0 + 20).toISOString() },
      { price: 2440, size: 0.5, side: "sell", at: new Date(t0 + 10).toISOString() },
      { price: 2449, size: 2, side: "sell", at: new Date(t0 - 30_000).toISOString() },
    ]);
    // the newest trade by the venue's time is the last price, whatever came last on the wire
    const judged = hub.since("kraken", "ETH/USD", 0).seq;
    last("kraken").say({ channel: "trade", type: "update", data: [{ symbol: "ETH/USD", side: "sell", price: 2430, qty: 0.5, trade_id: 5, timestamp: new Date(t0 - 400).toISOString() }] });
    expect(hub.quote("kraken", "ETH/USD")!.last).toBe(2455);
    // a live trade that came after a judge counts by its seq, its venue's stamp before the judge's moment or not
    expect(hub.since("kraken", "ETH/USD", judged, { snapshotAfter: t0 })).toEqual({ hi: 2430, lo: 2430, trades: 1, seq: judged + 1 });
  });

  it("Coinbase's whole book cut to its best levels keeps where it was cut: an update past the cut is let go, never added back over the levels forgotten — the book is the venue's level for level to its cut, said whole only to a depth the cut holds, and sent for afresh once fewer than a fill walks are left inside it", async () => {
    make();
    hub.hold("coinbase", "BTC/USD", { book: true });
    await turn();
    last("coinbase").open();
    const cb = last("coinbase");
    const at = "2026-10-16T15:00:00Z";
    const bid = (px: number, qty = "1") => ({ side: "bid", event_time: at, price_level: px.toFixed(2), new_quantity: qty });
    const cents = (from: number, n: number) => Array.from({ length: n }, (_, i) => Math.round(from * 100 - i) / 100);
    // a snapshot of 1,001 bids, 1,000.00 down to 990.00, and one ask: cut to the best 400 bids (1,000.00 … 996.01)
    cb.say({ channel: "l2_data", timestamp: at, sequence_num: 0, events: [{ type: "snapshot", product_id: "BTC-USD", updates: [...cents(1000, 1001).map((p) => bid(p)), { side: "offer", event_time: at, price_level: "1000.01", new_quantity: "1" }] }] });
    // far bids the venue sends later, at 500.xx: past the cut, let go
    cb.say({ channel: "l2_data", timestamp: at, sequence_num: 1, events: [{ type: "update", product_id: "BTC-USD", updates: cents(500.24, 25).map((p) => bid(p)) }] });
    const deep = hub.book("coinbase", "BTC/USD", 100)!;
    expect(deep.bids.at(-1)).toEqual([999.01, 1]);
    expect(deep.bids.some(([p]) => p < 990)).toBe(false);
    expect(deep.whole).toBe(true);
    // the top 340 taken: 60 levels left inside the cut — whole to 50, not to 100
    cb.say({ channel: "l2_data", timestamp: at, sequence_num: 2, events: [{ type: "update", product_id: "BTC-USD", updates: cents(1000, 340).map((p) => bid(p, "0")) }] });
    expect(hub.book("coinbase", "BTC/USD", 50)).toMatchObject({ whole: true, live: true });
    const after = hub.book("coinbase", "BTC/USD", 100)!;
    expect([after.bids.length, after.bids[0], after.bids.at(-1), after.whole]).toEqual([60, [996.6, 1], [996.01, 1], undefined]);
    // twenty more: fewer than a fill walks inside the cut — the book is shown no more, and sent for afresh
    cb.sent.length = 0;
    cb.say({ channel: "l2_data", timestamp: at, sequence_num: 3, events: [{ type: "update", product_id: "BTC-USD", updates: cents(996.6, 20).map((p) => bid(p, "0")) }] });
    expect(hub.book("coinbase", "BTC/USD")).toBeUndefined();
    expect(cb.json).toEqual([{ type: "unsubscribe", product_ids: ["BTC-USD"], channel: "level2" }, { type: "subscribe", product_ids: ["BTC-USD"], channel: "level2" }]);
  });

  it("keeps a book only while a page holds it with its book: Coinbase's level2 snapshot and updates, Hyperliquid's l2Book and OKX's books5 whole each time, read out best first", async () => {
    make();
    const off = hub.hold("coinbase", "BTC/USD", { book: true });
    hub.hold("hyperliquid", "ETH-PERP", { book: true });
    hub.hold("okx", "SOL/USDT", { book: true });
    await turn();
    for (const w of FakeWs.all) w.open();
    expect(last("coinbase").json).toContainEqual({ type: "subscribe", product_ids: ["BTC-USD"], channel: "level2" });
    expect(last("hyperliquid").json).toContainEqual({ method: "subscribe", subscription: { type: "l2Book", coin: "ETH", fast: true } });
    expect(last("okx").json).toContainEqual({ op: "subscribe", args: [{ channel: "books5", instId: "SOL-USDT" }] });
    const cb = last("coinbase");
    cb.say({ channel: "l2_data", timestamp: "2026-10-16T15:00:00Z", sequence_num: 0, events: [{ type: "snapshot", product_id: "BTC-USD", updates: [{ side: "bid", event_time: "2026-10-16T15:00:00Z", price_level: "100", new_quantity: "1" }, { side: "bid", price_level: "101", new_quantity: "2" }, { side: "offer", price_level: "103", new_quantity: "3" }, { side: "offer", price_level: "102", new_quantity: "4" }] }] });
    cb.say({ channel: "l2_data", timestamp: "2026-10-16T15:00:00.1Z", sequence_num: 1, events: [{ type: "update", product_id: "BTC-USD", updates: [{ side: "bid", price_level: "101", new_quantity: "0" }, { side: "offer", price_level: "101.5", new_quantity: "0.5" }] }] });
    expect(hub.book("coinbase", "BTC/USD")).toMatchObject({ bids: [[100, 1]], asks: [[101.5, 0.5], [102, 4], [103, 3]], src: "Coinbase", live: true });
    last("hyperliquid").say({ channel: "l2Book", data: { coin: "ETH", time: Date.now(), levels: [[{ px: "2450", sz: "3", n: 1 }, { px: "2449.5", sz: "1", n: 1 }], [{ px: "2450.5", sz: "2", n: 1 }]] } });
    expect(hub.book("hyperliquid", "ETH-PERP")).toMatchObject({ bids: [[2450, 3], [2449.5, 1]], asks: [[2450.5, 2]] });
    last("okx").say({ arg: { channel: "books5", instId: "SOL-USDT" }, data: [{ asks: [["150.1", "10", "0", "1"]], bids: [["150", "5", "0", "2"]], ts: String(Date.now()) }] });
    last("okx").say({ arg: { channel: "books5", instId: "SOL-USDT" }, data: [{ asks: [["150.2", "1", "0", "1"]], bids: [["150.1", "5", "0", "2"]], ts: String(Date.now()) }] });
    expect(hub.book("okx", "SOL/USDT")).toMatchObject({ bids: [[150.1, 5]], asks: [[150.2, 1]] });
    // the page let go of it: the book is unsubscribed a minute later, the market itself a minute after nothing wants it either (Coinbase's
    // heartbeats keep the connection meanwhile)
    off();
    for (let s = 0; s <= IDLE_MS / 1_000; s++) {
      cb.say({ channel: "heartbeats", events: [{ heartbeat_counter: s }] });
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(cb.json).toContainEqual({ type: "unsubscribe", product_ids: ["BTC-USD"], channel: "level2" });
    expect(cb.json).toContainEqual({ type: "unsubscribe", product_ids: ["BTC-USD"], channel: "ticker" });
    expect(hub.book("coinbase", "BTC/USD")).toBeUndefined();
    expect(hub.quote("coinbase", "BTC/USD")).toBeUndefined();
    // nothing is wanted at Coinbase any more: its connection is closed, and not opened again
    expect(cb.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(socketsTo("coinbase")).toHaveLength(1);
  });

  it("checks Kraken's book against its CRC32 (the pair's precision from its instrument channel): a book that matches is shown, one that differs is sent for afresh and shown again only from its new snapshot", async () => {
    make();
    hub.hold("kraken", "BTC/USD", { book: true });
    await turn();
    const kr = last("kraken");
    kr.open();
    kr.say({ channel: "instrument", type: "snapshot", data: { assets: [], pairs: [{ symbol: "BTC/USD", price_precision: 1, qty_precision: 8 }] } });
    const bids: Array<[number, number]> = [[45283.5, 0.1], [45283.4, 1.1]];
    const asks: Array<[number, number]> = [[45285.2, 0.0011], [45286.6, 2]];
    const sum = krakenChecksum(asks, bids, 1, 8);
    // the docs' own steps: price and size at the pair's precision, the point and the leading zeros gone, asks then bids
    expect(sum).toBe(krakenChecksum([[45285.2, 0.0011], [45286.6, 2]], [[45283.5, 0.1], [45283.4, 1.1]], 1, 8));
    const level = ([price, qty]: [number, number]) => ({ price, qty });
    kr.say({ channel: "book", type: "snapshot", data: [{ symbol: "BTC/USD", bids: bids.map(level), asks: asks.map(level), checksum: sum, timestamp: "2026-10-16T15:00:00Z" }] });
    expect(hub.book("kraken", "BTC/USD")).toMatchObject({ bids, asks, src: "Kraken" });
    // an update: one level gone, one new — and its checksum as Kraken would say it
    const nextBids: Array<[number, number]> = [[45283.5, 0.1], [45283, 3]];
    kr.say({ channel: "book", type: "update", data: [{ symbol: "BTC/USD", bids: [{ price: 45283.4, qty: 0 }, { price: 45283, qty: 3 }], asks: [], checksum: krakenChecksum(asks, nextBids, 1, 8), timestamp: "2026-10-16T15:00:00.1Z" }] });
    expect(hub.book("kraken", "BTC/USD")!.bids).toEqual(nextBids);
    // a checksum that is not the book's: no book shown, and it is sent for afresh
    const before = kr.sent.length;
    kr.say({ channel: "book", type: "update", data: [{ symbol: "BTC/USD", bids: [{ price: 45282, qty: 1 }], asks: [], checksum: 12345, timestamp: "2026-10-16T15:00:00.2Z" }] });
    expect(hub.book("kraken", "BTC/USD")).toBeUndefined();
    expect(kr.json.slice(before)).toEqual([{ method: "unsubscribe", params: { channel: "book", symbol: ["BTC/USD"], depth: 10 } }, { method: "subscribe", params: { channel: "book", symbol: ["BTC/USD"], depth: 10 } }]);
    // an update before the new snapshot is not a book
    kr.say({ channel: "book", type: "update", data: [{ symbol: "BTC/USD", bids: [{ price: 45281, qty: 1 }], asks: [], checksum: 1, timestamp: "2026-10-16T15:00:00.3Z" }] });
    expect(hub.book("kraken", "BTC/USD")).toBeUndefined();
    kr.say({ channel: "book", type: "snapshot", data: [{ symbol: "BTC/USD", bids: bids.map(level), asks: asks.map(level), checksum: sum, timestamp: "2026-10-16T15:00:01Z" }] });
    expect(hub.book("kraken", "BTC/USD")!.bids).toEqual(bids);
  });

  it("a market is live only while its connection spoke in the last three seconds: Hyperliquid and OKX are pinged after a second and a half of quiet, Coinbase's heartbeats and Kraken's keep theirs, and Hyperliquid is pinged at least every 25 s whatever it says", async () => {
    make();
    hub.want("hyperliquid", "BTC-PERP");
    hub.want("okx", "BTC/USDT");
    hub.want("coinbase", "BTC/USD");
    await turn();
    for (const w of FakeWs.all) w.open();
    last("hyperliquid").say({ channel: "bbo", data: { coin: "BTC", time: Date.now(), bbo: [{ px: "100", sz: "1" }, { px: "101", sz: "1" }] } });
    last("okx").say({ arg: { channel: "bbo-tbt", instId: "BTC-USDT" }, data: [{ asks: [["101", "1"]], bids: [["100", "1"]], ts: String(Date.now()) }] });
    last("coinbase").say({ channel: "ticker", sequence_num: 0, events: [{ type: "snapshot", tickers: [{ product_id: "BTC-USD", price: "100", best_bid: "100", best_ask: "101" }] }] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(last("hyperliquid").sent.at(-1)).toBe('{"method":"ping"}');
    expect(last("okx").sent.at(-1)).toBe("ping");
    // the answers say the connections still carry: the quiet markets are still live, confirmed now
    last("hyperliquid").say({ channel: "pong" });
    last("okx").say("pong");
    for (let i = 0; i < 3; i++) last("coinbase").say({ channel: "heartbeats", sequence_num: i + 1, events: [{ current_time: new Date().toISOString(), heartbeat_counter: i }] });
    const q = hub.quote("hyperliquid", "BTC-PERP")!;
    expect([q.live, Date.now() - q.seenAt, Date.now() - q.recvAt]).toEqual([true, 0, 2_000]);
    expect(hub.quote("coinbase", "BTC/USD")!.live).toBe(true);
    // nothing more from OKX: three seconds after its last word its market is not live, and its age is said as it is
    await vi.advanceTimersByTimeAsync(LIVE_MS);
    expect(hub.quote("okx", "BTC/USDT")).toMatchObject({ live: false, bid: 100 });
    expect(Date.now() - hub.quote("okx", "BTC/USDT")!.seenAt).toBeGreaterThanOrEqual(LIVE_MS);
    // Hyperliquid speaking all the time still hears from the hub every 25 s (it closes a connection silent for sixty)
    const hl = last("hyperliquid");
    const pings = () => hl.sent.filter((s) => s === '{"method":"ping"}').length;
    const before = pings();
    for (let i = 0; i < 60; i++) {
      hl.say({ channel: "bbo", data: { coin: "BTC", time: Date.now(), bbo: [{ px: "100", sz: "1" }, { px: "101", sz: "1" }] } });
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(pings() - before).toBe(1);
  });

  it("a connection that drops, or goes silent, is opened again after a jittered wait between half a second and its ceiling — longer each try, back to the shortest once one carries — and every market wanted is subscribed again, live only from its first message", async () => {
    let dice = 0;
    make({ random: () => dice });
    const ticks: HubTick[] = [];
    hub.onTick((t) => ticks.push(t));
    // held by a page, so its interest outlasts every wait below
    hub.hold("coinbase", "BTC/USD");
    await turn();
    last("coinbase").open();
    last("coinbase").say({ channel: "ticker", sequence_num: 0, events: [{ type: "snapshot", tickers: [{ product_id: "BTC-USD", price: "100", best_bid: "100", best_ask: "101" }] }] });
    expect(hub.quote("coinbase", "BTC/USD")!.live).toBe(true);
    last("coinbase").drop();
    expect(hub.quote("coinbase", "BTC/USD")).toBeUndefined();
    expect(ticks.at(-1)).toEqual({ source: "coinbase", symbol: "BTC/USD", what: "live" });
    // the first try: at the shortest wait (the dice at 0)
    await vi.advanceTimersByTimeAsync(BACKOFF_MIN_MS - 1);
    expect(socketsTo("coinbase")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socketsTo("coinbase")).toHaveLength(2);
    // it fails without a word: the next wait's ceiling has doubled (the dice at the top: the ceiling itself)
    dice = 1;
    last("coinbase").drop();
    await vi.advanceTimersByTimeAsync(2 * BACKOFF_MIN_MS - 1);
    expect(socketsTo("coinbase")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(socketsTo("coinbase")).toHaveLength(3);
    // it opens: everything wanted is subscribed again, and the market is live only once its snapshot comes
    last("coinbase").open();
    expect(last("coinbase").json).toEqual([{ type: "subscribe", channel: "heartbeats" }, { type: "subscribe", product_ids: ["BTC-USD"], channel: "ticker" }, { type: "subscribe", product_ids: ["BTC-USD"], channel: "market_trades" }]);
    expect(hub.quote("coinbase", "BTC/USD")).toBeUndefined();
    last("coinbase").say({ channel: "ticker", sequence_num: 0, events: [{ type: "snapshot", tickers: [{ product_id: "BTC-USD", price: "102", best_bid: "102", best_ask: "103" }] }] });
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ live: true, bid: 102 });
    // open and silent past ten seconds: dead, given up, and opened again at the shortest wait (it carried a message, so the tries start over)
    dice = 0;
    await vi.advanceTimersByTimeAsync(10_500);
    expect(last("coinbase").closed).toBe(true);
    await vi.advanceTimersByTimeAsync(BACKOFF_MIN_MS + 500);
    expect(socketsTo("coinbase")).toHaveLength(4);
    // the ceiling doubles with each try that carries nothing, and never passes thirty seconds
    dice = 1;
    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      const had = socketsTo("coinbase").length;
      last("coinbase").drop();
      let waited = 0;
      while (socketsTo("coinbase").length === had) {
        await vi.advanceTimersByTimeAsync(100);
        waited += 100;
      }
      waits.push(waited);
    }
    // the dead connection's try was the first since one carried (half a second at most); these are the second on: a ceiling of one second,
    // then two, four, eight, sixteen, and thirty from then on
    expect(waits).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
  });

  it("a clock that jumped — the Mac asleep — opens every connection again, one after another, and no market is live until its stream speaks again", async () => {
    make();
    // held by a page (a sleep longer than the paper account's minute would let its wants run out: its next look wants them again)
    hub.hold("coinbase", "BTC/USD");
    hub.hold("kraken", "BTC/USD");
    await turn();
    for (const w of FakeWs.all) w.open();
    last("coinbase").say({ channel: "ticker", sequence_num: 0, events: [{ type: "snapshot", tickers: [{ product_id: "BTC-USD", price: "100", best_bid: "100", best_ask: "101" }] }] });
    last("kraken").say({ channel: "ticker", type: "snapshot", data: [{ symbol: "BTC/USD", bid: 100, ask: 101, last: 100 }] });
    const [cb, kr] = [last("coinbase"), last("kraken")];
    // asleep for a minute: no timer ran, the wall clock moved on
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(500);
    expect([cb.closed, kr.closed]).toEqual([true, true]);
    expect(hub.quote("coinbase", "BTC/USD")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(600);
    expect(socketsTo("coinbase")).toHaveLength(2);
    expect(socketsTo("kraken")).toHaveLength(2);
  });

  it("streams a venue only while its REST answers this network: none opened while it does not, the one open closed when it stops, and opened again once it answers", async () => {
    let answering = false;
    make({ answers: (v) => v !== "kraken" || answering });
    hub.want("kraken", "BTC/USD");
    hub.want("coinbase", "BTC/USD");
    await turn();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(socketsTo("kraken")).toHaveLength(0);
    expect(socketsTo("coinbase")).toHaveLength(1);
    answering = true;
    await vi.advanceTimersByTimeAsync(600);
    expect(socketsTo("kraken")).toHaveLength(1);
    last("kraken").open();
    answering = false;
    await vi.advanceTimersByTimeAsync(600);
    expect(last("kraken").closed).toBe(true);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(socketsTo("kraken")).toHaveLength(1);
  });

  it("a market the paper account wants is streamed a minute from its last want; past the cap no more is taken unless one no one wants any more makes room; a market the venue refuses is not streamed (its REST stands)", async () => {
    make({ maxMarkets: 2 });
    expect(hub.want("coinbase", "BTC/USD")).toBe(true);
    expect(hub.want("coinbase", "ETH/USD")).toBe(true);
    expect(hub.want("coinbase", "SOL/USD")).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    hub.want("coinbase", "BTC/USD");
    await vi.advanceTimersByTimeAsync(31_000);
    // ETH's want ran out: it makes room
    expect(hub.want("coinbase", "SOL/USD")).toBe(true);
    expect(hub.covers("coinbase", "ETH/USD")).toBe(true);
    // Kraken refuses a pair: not live, and not asked for again while it is kept
    hub.close();
    make();
    hub.want("kraken", "XYZ/USD");
    await turn();
    last("kraken").open();
    last("kraken").say({ method: "subscribe", success: false, error: "Currency pair not supported XYZ/USD", symbol: "XYZ/USD" });
    expect(hub.want("kraken", "XYZ/USD")).toBe(false);
    expect(hub.quote("kraken", "XYZ/USD")).toBeUndefined();
  });

  it("a price confirmed within a second: at once while the stream's last word is that fresh; else the hub waits a moment for the connection's next word (a ping asked for it); undefined when none comes or the market is not live", async () => {
    make();
    hub.want("okx", "BTC/USDT");
    await turn();
    last("okx").open();
    last("okx").say({ arg: { channel: "bbo-tbt", instId: "BTC-USDT" }, data: [{ asks: [["101", "1"]], bids: [["100", "1"]], ts: String(Date.now()) }] });
    expect(await hub.confirmed("okx", "BTC/USDT", 1_000, 400)).toMatchObject({ bid: 100 });
    await vi.advanceTimersByTimeAsync(1_200);
    const asked = hub.confirmed("okx", "BTC/USDT", 1_000, 400);
    expect(last("okx").sent.at(-1)).toBe("ping");
    last("okx").say("pong");
    expect(await asked).toMatchObject({ bid: 100, live: true });
    await vi.advanceTimersByTimeAsync(1_200);
    const none = hub.confirmed("okx", "BTC/USDT", 1_000, 400);
    await vi.advanceTimersByTimeAsync(400);
    expect(await none).toBeUndefined();
    expect(await hub.confirmed("kraken", "BTC/USD", 1_000, 400)).toBeUndefined();
  });

  it("Coinbase's ticker speaks only on a trade: its heartbeats keep the market live but never confirm its best bid and ask — its own next ticker does, or its level2 book's top while a page keeps the book, which the heartbeats then confirm", async () => {
    make();
    hub.want("coinbase", "BTC/USD");
    await turn();
    const cb = last("coinbase");
    cb.open();
    let n = 0;
    const t0 = Date.now();
    cb.say({ channel: "ticker", sequence_num: n++, events: [{ type: "snapshot", tickers: [{ product_id: "BTC-USD", price: "60000", best_bid: "59999", best_ask: "60001", best_bid_quantity: "1", best_ask_quantity: "1" }] }] });
    // thirty seconds of heartbeats and no trade: live, and its best bid and ask as old as the ticker
    for (let s = 0; s < 30; s++) {
      await vi.advanceTimersByTimeAsync(1_000);
      cb.say({ channel: "heartbeats", sequence_num: n++, events: [{ heartbeat_counter: s }] });
    }
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ live: true, bid: 59999, ask: 60001, seenAt: t0 });
    const asked = hub.confirmed("coinbase", "BTC/USD", 1_000, 400);
    // a heartbeat within the wait does not confirm it; nothing does
    cb.say({ channel: "heartbeats", sequence_num: n++, events: [{ heartbeat_counter: 30 }] });
    await vi.advanceTimersByTimeAsync(400);
    expect(await asked).toBeUndefined();
    // a ticker within the wait does
    const again = hub.confirmed("coinbase", "BTC/USD", 1_000, 400);
    cb.say({ channel: "heartbeats", sequence_num: n++, events: [{ heartbeat_counter: 31 }] });
    cb.say({ channel: "ticker", sequence_num: n++, events: [{ type: "update", tickers: [{ product_id: "BTC-USD", price: "60010", best_bid: "60009", best_ask: "60011", best_bid_quantity: "1", best_ask_quantity: "1" }] }] });
    expect(await again).toMatchObject({ bid: 60009, ask: 60011, seenAt: Date.now() });
    // a page keeps its book: the book's top is the best bid and ask, and every word on the connection confirms it from then on
    hub.hold("coinbase", "BTC/USD", { book: true });
    await turn();
    cb.say({ channel: "l2_data", sequence_num: n++, events: [{ type: "snapshot", product_id: "BTC-USD", updates: [{ side: "bid", price_level: "60005", new_quantity: "2" }, { side: "bid", price_level: "60004", new_quantity: "3" }, { side: "offer", price_level: "60006", new_quantity: "0.5" }] }] });
    await vi.advanceTimersByTimeAsync(5_000);
    cb.say({ channel: "heartbeats", sequence_num: n++, events: [{ heartbeat_counter: 32 }] });
    expect(hub.quote("coinbase", "BTC/USD")).toMatchObject({ live: true, bid: 60005, bidSz: 2, ask: 60006, askSz: 0.5, seenAt: Date.now() });
    expect(await hub.confirmed("coinbase", "BTC/USD", 1_000, 400)).toMatchObject({ bid: 60005, ask: 60006 });
    expect(hub.book("coinbase", "BTC/USD")).toMatchObject({ whole: true });
  });

  it("after a reconnect a market is live only once its best bid and ask are said again: a trade or the mark coming first leaves it not live, with no bid or ask from before the drop — and OKX's tickers stand for its best bid and ask again until bbo-tbt speaks on the new subscription", async () => {
    make({ random: () => 0 });
    hub.hold("hyperliquid", "BTC-PERP");
    hub.hold("okx", "BTC/USDT");
    await turn();
    for (const w of FakeWs.all) w.open();
    last("hyperliquid").say({ channel: "bbo", data: { coin: "BTC", time: Date.now(), bbo: [{ px: "59999", sz: "1" }, { px: "60001", sz: "1" }] } });
    last("hyperliquid").say({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { markPx: "60000", oraclePx: "60000", funding: "0" } } });
    last("okx").say({ arg: { channel: "bbo-tbt", instId: "BTC-USDT" }, data: [{ asks: [["60001", "1"]], bids: [["59999", "1"]], ts: String(Date.now()) }] });
    expect(hub.quote("hyperliquid", "BTC-PERP")).toMatchObject({ live: true, bid: 59999, mark: 60000 });
    // both drop; twenty seconds on, the price has moved to 62,000
    last("hyperliquid").drop();
    last("okx").drop();
    await vi.advanceTimersByTimeAsync(BACKOFF_MIN_MS);
    vi.setSystemTime(Date.now() + 20_000);
    for (const v of ["hyperliquid", "okx"] as const) last(v).open();
    // Hyperliquid's mark and a trade come before its bbo: not live, and nothing of the old best bid and ask
    last("hyperliquid").say({ channel: "activeAssetCtx", data: { coin: "BTC", ctx: { markPx: "62000", oraclePx: "62000", funding: "0" } } });
    last("hyperliquid").say({ channel: "trades", data: [{ coin: "BTC", side: "B", px: "62000", sz: "0.1", time: Date.now(), tid: 9 }] });
    const q = hub.quote("hyperliquid", "BTC-PERP")!;
    expect([q.live, q.bid, q.ask, q.mark, q.last]).toEqual([false, undefined, undefined, 62000, 62000]);
    expect(await hub.confirmed("hyperliquid", "BTC-PERP", 1_000, 0)).toBeUndefined();
    last("hyperliquid").say({ channel: "bbo", data: { coin: "BTC", time: Date.now(), bbo: [{ px: "61999", sz: "1" }, { px: "62001", sz: "1" }] } });
    expect(hub.quote("hyperliquid", "BTC-PERP")).toMatchObject({ live: true, bid: 61999, ask: 62001 });
    // OKX: the new subscription's tickers stand for its best bid and ask (the old bbo-tbt's are gone), until bbo-tbt speaks again
    last("okx").say({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [{ last: "62000", bidPx: "61998", bidSz: "1", askPx: "62002", askSz: "1", ts: String(Date.now()) }] });
    expect(hub.quote("okx", "BTC/USDT")).toMatchObject({ live: true, bid: 61998, ask: 62002 });
    last("okx").say({ arg: { channel: "bbo-tbt", instId: "BTC-USDT" }, data: [{ asks: [["62001.5", "1"]], bids: [["61999.5", "1"]], ts: String(Date.now()) }] });
    last("okx").say({ arg: { channel: "tickers", instId: "BTC-USDT" }, data: [{ last: "62000", bidPx: "61990", bidSz: "1", askPx: "62010", askSz: "1", ts: String(Date.now()) }] });
    expect(hub.quote("okx", "BTC/USDT")).toMatchObject({ bid: 61999.5, ask: 62001.5 });
  });

  it("a Kraken book whose checksum fails again within ten seconds of its last resync is not left dead: shown no more, and sent for afresh by the hub's own look once ten seconds have passed", async () => {
    make();
    hub.hold("kraken", "BTC/USD", { book: true });
    await turn();
    const kr = last("kraken");
    kr.open();
    kr.say({ channel: "instrument", type: "snapshot", data: { assets: [], pairs: [{ symbol: "BTC/USD", price_precision: 1, qty_precision: 8 }] } });
    const bids: Array<[number, number]> = [[45283.5, 0.1], [45283.4, 1.1]];
    const asks: Array<[number, number]> = [[45285.2, 0.0011], [45286.6, 2]];
    const level = ([price, qty]: [number, number]) => ({ price, qty });
    const snapshot = () => kr.say({ channel: "book", type: "snapshot", data: [{ symbol: "BTC/USD", bids: bids.map(level), asks: asks.map(level), checksum: krakenChecksum(asks, bids, 1, 8), timestamp: new Date().toISOString() }] });
    const bad = () => kr.say({ channel: "book", type: "update", data: [{ symbol: "BTC/USD", bids: [{ price: 45282, qty: 1 }], asks: [], checksum: 12345, timestamp: new Date().toISOString() }] });
    const resyncs = () => kr.json.filter((m) => (m as { method?: string; params?: { channel?: string } }).method === "subscribe" && (m as { params: { channel: string } }).params.channel === "book").length;
    const beat = () => kr.say({ channel: "heartbeat" });
    snapshot();
    bad();
    expect(resyncs()).toBe(2);
    snapshot();
    expect(hub.book("kraken", "BTC/USD")!.bids).toEqual(bids);
    // two seconds later, a second mismatch: too soon for another resync — the book is shown no more, and the resync waits
    await vi.advanceTimersByTimeAsync(2_000);
    beat();
    bad();
    expect(hub.book("kraken", "BTC/USD")).toBeUndefined();
    expect(resyncs()).toBe(2);
    for (let s = 0; s < 8; s++) {
      await vi.advanceTimersByTimeAsync(1_000);
      beat();
    }
    expect(resyncs()).toBe(3);
    snapshot();
    expect(hub.book("kraken", "BTC/USD")).toMatchObject({ bids, live: true });
  });

  it("a market let go and taken again goes on from above the seq it stood at: a judge's place in its trades never points past them", async () => {
    make();
    hub.want("kraken", "ETH/USD");
    await turn();
    last("kraken").open();
    for (let i = 1; i <= 5; i++) last("kraken").say({ channel: "trade", type: "update", data: [{ symbol: "ETH/USD", side: "buy", price: 2450 + i, qty: 1, trade_id: i, timestamp: new Date().toISOString() }] });
    const judged = hub.since("kraken", "ETH/USD", 0).seq;
    // a minute and more with nothing wanting it: let go
    for (let s = 0; s <= IDLE_MS / 1_000 + 1; s++) {
      await vi.advanceTimersByTimeAsync(1_000);
      last("kraken").say({ channel: "heartbeat" });
    }
    expect(hub.quote("kraken", "ETH/USD")).toBeUndefined();
    hub.want("kraken", "ETH/USD");
    await turn();
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    const kr = last("kraken");
    if (kr.readyState !== 1) kr.open();
    kr.say({ channel: "trade", type: "update", data: [{ symbol: "ETH/USD", side: "sell", price: 2400, qty: 1, trade_id: 99, timestamp: new Date().toISOString() }] });
    expect(hub.since("kraken", "ETH/USD", judged)).toMatchObject({ lo: 2400, trades: 1 });
  });

  it("close() ends every connection and timer: nothing is opened after it", async () => {
    make();
    hub.want("coinbase", "BTC/USD");
    await turn();
    last("coinbase").open();
    hub.close();
    expect(last("coinbase").closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(hub.want("coinbase", "BTC/USD")).toBe(false);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(socketsTo("coinbase")).toHaveLength(1);
  });
});
