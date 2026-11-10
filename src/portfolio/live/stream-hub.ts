/** THE MARKET-DATA HUB (feat/paper-live, phase 2): the venues' own public WebSocket streams, read without a key and kept in memory, for the
 * markets someone is looking at now — a paper account's resting orders and positions (live/paper.ts: each look renews its interest) and the
 * markets a page on the push channel shows (service.ts followMarkets) — so a paper fill, a stop's trigger, a perpetual's mark and the page's
 * quote are the venue's price of this moment, not a listing a minute old. Nothing is written anywhere and nothing goes to a store of ours:
 * what a stream says lives here while its market is wanted, and a minute after, and goes.
 *
 *   the venues     four, each ONE WebSocket for every market wanted there, keyless, the message shapes as checked live on 2026-10-16
 *                  (.claude/paper-live/paperlive-audit.md, "Report: streams"):
 *                    Hyperliquid   wss://api.hyperliquid.xyz/ws — bbo (the best bid and ask with their sizes, each block they change),
 *                                  trades, activeAssetCtx (the mark, the oracle and the hourly funding, about once a second: a perpetual is
 *                                  marked and liquidated at its markPx), candle (the live one-minute bar), and l2Book {fast: true} (five
 *                                  levels about every half second) while a page shows the book. It closes a connection that sends nothing
 *                                  for sixty seconds: {"method":"ping"} goes at least every KEEPALIVE_MS, and whenever the connection has
 *                                  said nothing for QUIET_PING_MS — its pong says the connection still carries, so a quiet market's last
 *                                  price is still its price
 *                    Coinbase      wss://advanced-trade-ws.coinbase.com (Advanced Trade, no `jwt`) — ticker (the last trade and the best bid
 *                                  and ask with their sizes — but only when a trade happens: "price updates on every match, batched during
 *                                  cascading matches", its docs say, so on a quiet pair its best bid and ask are as old as its last trade),
 *                                  market_trades, heartbeats (one a second: a channel with nothing to say is closed after a minute or so
 *                                  without them), and level2 (it answers as l2_data: a snapshot, then each level's new size, 0 for gone)
 *                                  while a page shows the book — every change of the book, so while it is kept its top is the market's best
 *                                  bid and ask. Its sequence_num rises by one a message on a connection: a gap sends for the book afresh (at
 *                                  most once in RESYNC_MS)
 *                    Kraken        wss://ws.kraken.com/v2 — ticker with event_trigger "bbo" (every change of the best bid or ask), trade, ohlc
 *                                  (one-minute bars), and book at depth 10 while a page shows it: each book message's CRC32 of the top ten is
 *                                  checked against the book kept here, its prices and sizes written at the pair's own precision as its
 *                                  instrument channel says it (krakenChecksum), and a book that differs is sent for afresh. It sends a
 *                                  heartbeat every second by itself; {"method":"ping"} goes at least every KEEPALIVE_MS
 *                    OKX           wss://ws.okx.com:8443/ws/v5/public — bbo-tbt (the best bid and ask, tick by tick), tickers (the last price,
 *                                  at once on subscribing), trades, and books5 (five levels, whole each time) while a page shows the book. It
 *                                  closes a connection silent for thirty seconds: the text 'ping' goes whenever it has said nothing for
 *                                  QUIET_PING_MS (its answer is the text 'pong')
 *                  Binance and Bybit have no stream here, ever: their REST refuses this network from where the account was built (HTTP 451,
 *                  a CloudFront 403), and their market data from another host (data-stream.binance.vision, Bybit's WebSocket) would be the
 *                  way around a venue's own rule that the account never takes. A US share has no stream here either: its real-time quotes
 *                  are Robinhood's and Nasdaq's REST answers, read as they are written by the background reader beside this hub
 *                  (live/us-quotes.ts UsQuoteFeed), the two joined as one (joinHubs)
 *   which market  a market as a public source lists it (public-markets.ts), by that source's id and its own symbol, is streamed by that
 *                  source's own venue only (streamOf): Coinbase's BTC/USD as BTC-USD, Kraken's BTC/USD as BTC/USD, OKX's BTC/USDT as
 *                  BTC-USDT, Hyperliquid's BTC-PERP as BTC and a HIP-3 market's io:ANTH-PERP as io:ANTH — a market's listing source alone: a
 *                  stream stands only for the same source's REST read, never for another venue's market of the same name
 *   interest       a market is streamed while it is wanted: HELD by a page that shows it (hold → its release; `book` its book too), or
 *                  WANTED by the paper account for IDLE_MS from its last look (want). Once nothing wants it any more it is let go IDLE_MS
 *                  later (its book likewise, apart). At most MAX_MARKETS are streamed at once: one more is not (it stays on REST, its age
 *                  said), unless one no one wants any more can make room for it
 *   what is kept   per market: the best bid and ask with their sizes, the last trade, a perpetual's mark, oracle and funding, the venue's
 *                  own time of the latest message (at), when it came here (recvAt), the latest moment the stream confirmed its best bid and
 *                  ask (seenAt: where the venue's best-bid-and-ask channel speaks on every change of them — BBO_EVERY_CHANGE — a heartbeat or
 *                  a pong later on the same connection says nothing changed in between, a socket carrying its messages in order; Coinbase's
 *                  ticker does not, so its best bid and ask are confirmed only by its own next word, or by its level2 book while one is kept),
 *                  the venue's own moment of that best bid and ask (priceAt: their channel's stamp, or the book's where its top stands for
 *                  them — never another channel's, nor this machine's clock where the venue stamps nothing), a seq that rises with every
 *                  message (one count for every market of the hub: a market let go and taken again goes on from above where it stood, so a
 *                  judge's place in its trades never points past them); the book's levels while it is shown (its
 *                  top BOOK_TOP read out); the last RING_SIZE trades, each with the seq it came under and whether it came in a
 *                  subscription's snapshot (the paper account judges a resting order against their highest and lowest since it last looked:
 *                  since(), so a touch between two quotes is still a touch — ordered by seq alone, a snapshot's trades cut by the venue's
 *                  stamp); the live one-minute bar where the venue streams one. What a subscription said of the market now — its best bid
 *                  and ask, a perpetual's mark — goes with it (the connection lost, the market subscribed again): nothing of it stands until
 *                  the venue says it again
 *   live           a market is LIVE only while its connection has spoken in the last LIVE_MS and the venue's best-bid-and-ask channel has
 *                  spoken since the market was subscribed (each venue sends its snapshot then; a trade, the mark or the bar coming first is
 *                  not it): otherwise its price is said with its true age, and the paper account reads REST instead. A change of it is told
 *                  (a "live" tick)
 *   reconnects     a connection that closes, errs, stays silent past DEAD_MS or does not open within OPEN_MS is opened again after a
 *                  jittered wait between BACKOFF_MIN_MS and BACKOFF_MAX_MS (the ceiling doubling with each try, back to the shortest once
 *                  one carries a message), and every market still wanted is subscribed again. A clock that jumped — the hub's own look
 *                  every LOOK_MS came SLEEP_MS late: the Mac slept, and its sockets died without a word — opens every connection again, one
 *                  after another (STAGGER_MS apart), and no market is live until its stream speaks again
 *   location       a venue is streamed only while its REST answers this network (`answers(venue)`: the service's own read cache says the
 *                  venue's keyless listing answered and nothing holds it back): a venue whose REST is refused here — its place rule, an
 *                  edge, a ban — has its stream closed with it, and opened only once its REST answers again. No other host is ever tried
 *   lazy           nothing runs until a market is wanted: no socket, no timer — so a server starts listening without waiting on any of it.
 *                  close() ends every connection and every timer
 *
 * The hub only listens: it never sends a venue anything but its subscriptions and its keepalive, and no key, no order, nothing signed. */
import { crc32 } from "node:zlib";
import type { PublicTrade, Side } from "./trade.ts";
import type { UsQuote } from "./us-quotes.ts";

export type HubVenue = "hyperliquid" | "coinbase" | "kraken" | "okx";
export const HUB_VENUES: readonly HubVenue[] = ["hyperliquid", "coinbase", "kraken", "okx"];
/** each venue's public stream, the only host the hub opens for it */
export const HUB_URLS: Readonly<Record<HubVenue, string>> = {
  hyperliquid: "wss://api.hyperliquid.xyz/ws",
  coinbase: "wss://advanced-trade-ws.coinbase.com",
  kraken: "wss://ws.kraken.com/v2",
  okx: "wss://ws.okx.com:8443/ws/v5/public",
};
/** the stream's name, in words, as a quote says where it came from */
export const HUB_NAMES: Readonly<Record<HubVenue, string>> = { hyperliquid: "Hyperliquid", coinbase: "Coinbase", kraken: "Kraken", okx: "OKX" };

/** a market is live while its connection spoke within this, ms */
export const LIVE_MS = 3_000;
/** how long a market no one wants any more is still streamed, ms (and how long the paper account's want lasts from its last look) */
export const IDLE_MS = 60_000;
/** the most markets streamed at once */
export const MAX_MARKETS = 100;
/** the trades kept per market */
export const RING_SIZE = 200;
/** the levels a side of a book is read out to */
export const BOOK_TOP = 20;
/** a connection's wait before it is opened again: between these, the ceiling doubling with each try */
export const BACKOFF_MIN_MS = 500;
export const BACKOFF_MAX_MS = 30_000;
/** the hub's own look: idle markets let go, keepalives, silent connections, the gate, live flips — and the clock it watches for a sleep */
const LOOK_MS = 500;
/** a look this much later than it was due: the machine slept */
const SLEEP_MS = 5_000;
/** a connection open and silent this long is dead (a ping went every QUIET_PING_MS meanwhile) */
const DEAD_MS = 10_000;
/** a connection not open within this is given up and tried again */
const OPEN_MS = 10_000;
/** a connection that said nothing for this long is pinged (where the venue answers a ping), so a quiet market is still known to be live */
const QUIET_PING_MS = 1_500;
/** the longest a connection goes without the hub sending anything (Hyperliquid closes one after sixty seconds of it) */
const KEEPALIVE_MS = 25_000;
/** the connections opened again after a sleep, this far apart */
const STAGGER_MS = 250;
/** the levels a side of a book is kept to (Coinbase's level2 sends the whole book): past twice this, the farthest go — and the price of the
 * farthest kept is that side's boundary from then on (Mkt.bidCut / askCut): an update beyond it is let go, never added back over levels
 * forgotten, so the side is the venue's own, level for level, from its best to its boundary. A side with fewer than CUT_DEPTH_MIN levels left
 * inside its boundary (the price moved toward it) is sent for afresh */
const LEVELS_KEPT = 400;
/** the levels a cut side must still hold inside its boundary: what a paper fill walks (live/paper.ts WALK_DEPTH) */
const CUT_DEPTH_MIN = 50;
/** Kraken's book is subscribed at this depth and kept to it (its checksum is of the top ten) */
const KRAKEN_DEPTH = 10;
/** a book sent for afresh at most once in this, per market: one found wrong sooner is shown no more, and sent for once this has passed (the
 * hub's own look) */
const RESYNC_MS = 10_000;
/** WHETHER A VENUE'S BEST-BID-AND-ASK CHANNEL SPEAKS ON EVERY CHANGE of the best bid or ask: Hyperliquid's bbo (each block they change),
 * Kraken's ticker with event_trigger "bbo", OKX's bbo-tbt (tick by tick; its tickers, which stand before bbo-tbt's first word, on every
 * trade and every change of the best bid or ask too) — so while the connection carries, any later word on it (a heartbeat, a pong) confirms
 * the best bid and ask as they stand. Coinbase's ticker speaks only when a trade happens: its best bid and ask are as old as its last
 * ticker, however many heartbeats came since — unless its level2 book is kept (a page shows it), which says every change: then the book's
 * top is the best bid and ask, and the connection's words confirm it */
export const BBO_EVERY_CHANGE: Readonly<Record<HubVenue, boolean>> = { hyperliquid: true, coinbase: false, kraken: true, okx: true };

/** a WebSocket as the hub uses one: Node's global WebSocket, or a test's stand-in */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (ev: { data?: unknown }) => void): void;
}
export type WebSocketMaker = new (url: string) => WebSocketLike;

/** a market as its stream has it now (quote) */
export interface HubQuote {
  bid?: number | undefined;
  ask?: number | undefined;
  bidSz?: number | undefined;
  askSz?: number | undefined;
  /** the last trade's price */
  last?: number | undefined;
  /** a perpetual: the venue's mark (Hyperliquid's markPx), its oracle, and its funding rate as the venue gives it (hourly at Hyperliquid) */
  mark?: number | undefined;
  oracle?: number | undefined;
  funding?: number | undefined;
  /** a perpetual, as its venue streams its day (Hyperliquid's activeAssetCtx, about every second): the contracts open, in base units
   * (openInterest), the dollars traded over the last 24 hours (dayNtlVlm), the price 24 hours ago (prevDayPx), and the venue's premium of the
   * mark over the oracle that its funding comes from (premium: -0.0003749 = −0.0375%) — each where the venue said it */
  openInterest?: number | undefined;
  volumeUsd24h?: number | undefined;
  prevDayPx?: number | undefined;
  premium?: number | undefined;
  /** the venue's own time of the latest message, ms (this machine's when the venue stamps none) */
  at: number;
  /** THE VENUE'S OWN MOMENT OF THE BEST BID AND ASK this quote carries, ms: their own channel's stamp (Hyperliquid's bbo, Coinbase's and
   * Kraken's ticker, OKX's bbo-tbt — or its tickers before bbo-tbt has spoken), or the book's where its top stands for them (Coinbase's
   * level2 while one is kept: the stamp of the message that last moved its top). What a page measures how long a price took to reach its
   * screen from. Undefined where the venue stamped none, or before it has said them on this subscription — never another channel's moment
   * (Hyperliquid's activeAssetCtx carries none, and the latest message's `at` is this machine's own clock then) */
  priceAt?: number | undefined;
  /** when the latest message came here, ms */
  recvAt: number;
  /** the latest moment the stream confirmed the market's best bid and ask as they stand (their own message, or a later one on the same live
   * connection where the venue's best-bid-and-ask channel speaks on every change: BBO_EVERY_CHANGE), ms — before the venue has said them on
   * this subscription, its latest message's */
  seenAt: number;
  /** the stream it came over, in words: "Coinbase" */
  src: string;
  /** rises with each message for the market (one count for every market of the hub) */
  seq: number;
  live: boolean;
  /** the live one-minute bar, where the venue streams one */
  bar?: { t: number; o: number; h: number; l: number; c: number; v?: number | undefined } | undefined;
  /** WHERE A QUOTE THAT IS NO STREAM'S CAME FROM, in its source's words ("Robinhood · real time"), how far behind the market that source is
   * (0), how often it writes the quote anew (`everyMs`: Robinhood's fifteen seconds, read as it is written) or — for a source that writes
   * nothing on a cadence of its own, whose stamp is its last trade's (Nasdaq's, to the minute) — how often the account asks it
   * (`askedEveryMs`), a US share's quote from the background reader beside the venues' streams (live/us-quotes.ts UsQuoteFeed), read over
   * REST and pushed as it moves — and the quote itself as that source gave it. A stream's quote has none of them: it is `<src> · live` */
  from?: string | undefined;
  delayMs?: number | undefined;
  everyMs?: number | undefined;
  askedEveryMs?: number | undefined;
  us?: UsQuote | undefined;
}
/** a market's book as its stream has it: best first, each side its top levels */
export interface HubBook {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  /** the venue's time of the book's latest message, when it came here, and the latest moment the stream confirmed it, ms */
  at: number;
  recvAt: number;
  seenAt: number;
  src: string;
  live: boolean;
  /** the stream keeps the venue's WHOLE book (Coinbase's level2) to the depth asked: a side shorter than asked is every level the venue
   * holds. Not said of a side cut (LEVELS_KEPT) with fewer levels inside its boundary than asked, nor of a stream that sends only its top
   * levels (Hyperliquid's and OKX's five, Kraken's ten): a side may go on past its last */
  whole?: true | undefined;
}
/** what moved: the market's quote, its trades, its book, or whether it is live */
export interface HubTick {
  source: string;
  symbol: string;
  what: "quote" | "trades" | "book" | "live";
}
/** the trades' extremes since a moment: their highest and lowest prices, how many, and the seq the market stands at now (the next since's
 * start). `partial`: the ring no longer holds every trade since then */
export interface HubRange {
  hi?: number | undefined;
  lo?: number | undefined;
  trades: number;
  seq: number;
  partial?: true | undefined;
}
/** WHICH TRADES SINCE A SEQ COUNT (since()): every trade that came live after it, by its seq alone — a venue's trades come here up to half a
 * second after the venue stamped them (Hyperliquid's), after the quote that moved a judge, so the venue's stamp is never weighed against
 * this machine's moment for them — and of the trades that came in a subscription's SNAPSHOT (the venue's recent trades, sent again on every
 * subscription, a reconnect's among them: what it holds may have printed long before) only those the venue stamped after `snapshotAfter`,
 * the moment of the judge before. `after`: only trades the venue stamped after this moment, live or not — an order never judged on a tick,
 * counted from when it was placed (or last changed): a trade from before it never touches it */
export interface SinceCut {
  after?: number | undefined;
  snapshotAfter?: number | undefined;
}

/** WHAT THE PAPER ACCOUNT AND THE SERVICE ASK OF A HUB (the hub here, or a stand-in's: test/standin) */
export interface MarketHub {
  /** whether the market — its source's id and its symbol as the listing names them — has a stream here */
  covers(source: string, symbol: string): boolean;
  /** wanted for IDLE_MS from now (the paper account's look renews it): false when it has no stream, or the hub is full */
  want(source: string, symbol: string): boolean;
  /** held while the release has not been called (a page showing it), its book too with `book` */
  hold(source: string, symbol: string, o?: { book?: boolean | undefined }): () => void;
  /** the market as its stream has it now; undefined before its first message */
  quote(source: string, symbol: string): HubQuote | undefined;
  book(source: string, symbol: string, depth?: number): HubBook | undefined;
  /** its latest trades, newest first */
  trades(source: string, symbol: string, limit: number): PublicTrade[];
  /** the trades' highest and lowest since `seq` (the market's own, from an earlier since() or quote()), cut as `cut` says (SinceCut: a
   * snapshot's trades by the venue's stamp, an order never judged from its own moment) */
  since(source: string, symbol: string, seq: number, cut?: SinceCut): HubRange;
  /** a price the stream confirmed within `maxAgeMs` — waiting up to `waitMs` for a word on the connection that confirms it, when it is live
   * but the last confirmation is older — or undefined */
  confirmed(source: string, symbol: string, maxAgeMs: number, waitMs: number): Promise<HubQuote | undefined>;
  onTick(fn: (t: HubTick) => void): () => void;
  close(): void;
  /** the hub carries the market's PRICE alone — no book, no trades (a US share's quote, live/us-quotes.ts): a page is told its quote only.
   * Absent: the hub's markets carry all three */
  pricesOnly?(source: string, symbol: string): boolean;
}

/** SEVERAL HUBS AS ONE: the venues' streams, and beside them the US shares' background reader (live/us-quotes.ts UsQuoteFeed) — each market
 * asked of the first hub that covers it, every hub's ticks told, all of them closed together. What the paper account and the service ask of
 * one hub they ask of this */
export function joinHubs(...hubs: MarketHub[]): MarketHub {
  const of = (source: string, symbol: string): MarketHub | undefined => hubs.find((h) => h.covers(source, symbol));
  return {
    covers: (source, symbol) => !!of(source, symbol),
    want: (source, symbol) => of(source, symbol)?.want(source, symbol) ?? false,
    hold: (source, symbol, o) => of(source, symbol)?.hold(source, symbol, o) ?? (() => undefined),
    quote: (source, symbol) => of(source, symbol)?.quote(source, symbol),
    book: (source, symbol, depth) => of(source, symbol)?.book(source, symbol, depth),
    trades: (source, symbol, limit) => of(source, symbol)?.trades(source, symbol, limit) ?? [],
    since: (source, symbol, seq, cut) => of(source, symbol)?.since(source, symbol, seq, cut) ?? { trades: 0, seq: 0 },
    confirmed: async (source, symbol, maxAgeMs, waitMs) => of(source, symbol)?.confirmed(source, symbol, maxAgeMs, waitMs),
    pricesOnly: (source, symbol) => of(source, symbol)?.pricesOnly?.(source, symbol) === true,
    onTick: (fn) => {
      const offs = hubs.map((h) => h.onTick(fn));
      return () => offs.forEach((off) => off());
    },
    close: () => hubs.forEach((h) => h.close()),
  };
}

export interface StreamHubOptions {
  /** the WebSocket to open (Node's global one unless said; none: nothing is ever streamed) */
  WebSocket?: WebSocketMaker | undefined;
  /** whether the venue's REST answers this network now (the service's read cache); a venue it does not is not streamed. All, unless said */
  answers?: ((venue: HubVenue) => boolean) | undefined;
  clock?: (() => number) | undefined;
  maxMarkets?: number | undefined;
  /** the jitter's dice (Math.random unless said) */
  random?: (() => number) | undefined;
}

/** a coin pair as an exchange's listing names it (BTC/USD) — spot only, never a derivative's `:` */
const PAIR = /^([A-Z0-9]{1,20})\/([A-Z0-9]{1,10})$/;
/** a Hyperliquid perpetual (BTC-PERP), and a HIP-3 deployer's (io:ANTH-PERP) */
const HL_PERP = /^([A-Za-z0-9]{1,20})-PERP$/;
const HIP3_PERP = /^([A-Za-z][A-Za-z0-9]{0,15}:[A-Za-z0-9]{1,20})-PERP$/;

/** THE STREAM OF A MARKET, as its own listing source names it: the venue whose stream it is, and the venue's own symbol for it there — or
 * undefined: its source has no stream here (a stock, an event contract, a token, Binance, Bybit, a pre-IPO venue's contract) */
export function streamOf(source: string, symbol: string): { venue: HubVenue; sym: string } | undefined {
  const s = String(symbol ?? "").trim();
  if (source === "coinbase" || source === "kraken" || source === "okx") {
    const p = PAIR.exec(s);
    if (!p) return undefined;
    return { venue: source, sym: source === "kraken" ? `${p[1]}/${p[2]}` : `${p[1]}-${p[2]}` };
  }
  if (source === "hyperliquid") {
    const k = HL_PERP.exec(s);
    return k ? { venue: "hyperliquid", sym: k[1]! } : undefined;
  }
  if (source === "hyperliquid-preipo" || source === "hyperliquid-world") {
    const k = HIP3_PERP.exec(s);
    return k ? { venue: "hyperliquid", sym: k[1]! } : undefined;
  }
  return undefined;
}

/** KRAKEN'S BOOK CHECKSUM (docs.kraken.com, WebSocket v2 book): the top ten asks, lowest first, then the top ten bids, highest first, each
 * level its price and then its size written at the pair's precision with the point and the leading zeros taken out, all of it one string,
 * and its CRC32 as an unsigned 32-bit number */
export function krakenChecksum(asks: ReadonlyArray<readonly [number, number]>, bids: ReadonlyArray<readonly [number, number]>, pricePrecision: number, qtyPrecision: number): number {
  const part = (x: number, places: number): string => x.toFixed(places).replace(".", "").replace(/^0+/, "");
  let s = "";
  for (const [p, q] of asks.slice(0, 10)) s += part(p, pricePrecision) + part(q, qtyPrecision);
  for (const [p, q] of bids.slice(0, 10)) s += part(p, pricePrecision) + part(q, qtyPrecision);
  return crc32(s) >>> 0;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const pos = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
};
const nonNeg = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && n >= 0 ? n : undefined;
};
/** a moment as a venue writes it — ms, or a time written (ISO 8601, Coinbase's nanoseconds and all) — as ms; undefined when it is neither */
const whenMs = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v !== "string" || !v.trim()) return undefined;
  if (/^\d+$/.test(v.trim())) return Number(v.trim());
  // a fraction of a second past the milliseconds (Coinbase writes nanoseconds) is cut to them: Date.parse reads three places
  const t = Date.parse(v.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(t) ? t : undefined;
};

interface RingTrade {
  price: number;
  size: number;
  side?: Side | undefined;
  at: number;
  seq: number;
  id?: string | undefined;
  /** it came in a subscription's snapshot (the venue's recent trades sent on subscribing), not live */
  snap?: true | undefined;
}
interface Mkt {
  key: string;
  source: string;
  symbol: string;
  venue: HubVenue;
  sym: string;
  /** pages holding it, and holding its book; the paper account's want (and a release's) until */
  holds: number;
  bookHolds: number;
  until: number;
  bookUntil: number;
  /** subscribed at the venue now: its own channels, its book */
  on: boolean;
  bookOn: boolean;
  /** what the venue said refusing it, in its words: it is not asked for again while it is kept */
  refused?: string | undefined;
  /** a message has come since it was subscribed; the book's snapshot has come since its book was */
  snapped: boolean;
  bookSnapped: boolean;
  /** the venue's best-bid-and-ask channel has spoken since it was subscribed: its bid and ask are this subscription's (Hyperliquid's bbo,
   * Coinbase's ticker, Kraken's ticker, OKX's bbo-tbt — or OKX's tickers before bbo-tbt has spoken), and when its latest came here */
  bboSnapped: boolean;
  bboRecvAt: number;
  /** the venue's own stamp of that channel's latest message (undefined where it stamped none), and of the book message that last moved the
   * book's top (Coinbase's level2 while it stands for the best bid and ask: bookTop) — the quote's priceAt */
  bboAt?: number | undefined;
  topAt?: number | undefined;
  /** OKX: bbo-tbt has spoken on this subscription, so its tickers' bid and ask stand no more */
  tbt: boolean;
  /** Hyperliquid: the trades channel's first message since it was subscribed (its snapshot of the recent trades) has come */
  tradesSnapped: boolean;
  /** its book was found wrong while a resync could not be sent yet (RESYNC_MS): sent for afresh at the hub's first look after that */
  resyncDue: boolean;
  /** the seq of the newest trade the ring has let go of: a range from before it is partial */
  evictedSeq: number;
  bid?: number | undefined;
  ask?: number | undefined;
  bidSz?: number | undefined;
  askSz?: number | undefined;
  last?: number | undefined;
  mark?: number | undefined;
  oracle?: number | undefined;
  funding?: number | undefined;
  openInterest?: number | undefined;
  volumeUsd24h?: number | undefined;
  prevDayPx?: number | undefined;
  premium?: number | undefined;
  at: number;
  recvAt: number;
  seq: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
  bookAt: number;
  bookRecvAt: number;
  resyncAt: number;
  /** levels of its book were cut off here (Coinbase's whole book, kept to its best LEVELS_KEPT) since its last snapshot */
  cut: boolean;
  /** where each side was cut: the worst bid kept, the worst ask kept — every level past it forgotten, and an update past it let go */
  bidCut?: number | undefined;
  askCut?: number | undefined;
  ring: RingTrade[];
  ids: Set<string>;
  bar?: { t: number; o: number; h: number; l: number; c: number; v?: number | undefined } | undefined;
  live: boolean;
}
interface Conn {
  venue: HubVenue;
  ws: WebSocketLike | undefined;
  state: "closed" | "connecting" | "open";
  /** tries since one last carried a message (the wait's ceiling doubles with each) */
  attempt: number;
  openedAt: number;
  lastMsgAt: number;
  lastSentAt: number;
  pingAt: number;
  retry: ReturnType<typeof setTimeout> | undefined;
  /** the sequence_num Coinbase's next message should carry (a gap: its books are sent for afresh) */
  cbSeq?: number | undefined;
  /** Kraken's pairs' precision, from its instrument channel, by symbol */
  precision: Map<string, { price: number; qty: number }>;
  /** waiting for a word on this connection that confirms their market (confirmed): each is asked at every message (`final` once the
   * connection is gone) and says whether it is done */
  waiters: Array<(final: boolean) => boolean>;
}

/** what a venue's connection asks of it: its subscriptions, its keepalive, what it sends first */
const PING: Readonly<Record<HubVenue, string | undefined>> = { hyperliquid: '{"method":"ping"}', coinbase: undefined, kraken: '{"method":"ping"}', okx: "ping" };
/** Coinbase answers no ping: its heartbeats (subscribed first, one a second) keep its channels open and say the connection carries */
const FIRST: Readonly<Record<HubVenue, string[]>> = {
  hyperliquid: [],
  coinbase: [JSON.stringify({ type: "subscribe", channel: "heartbeats" })],
  kraken: [JSON.stringify({ method: "subscribe", params: { channel: "instrument", snapshot: true } })],
  okx: [],
};
/** the messages that subscribe (or unsubscribe) these markets' own channels — or their books — at the venue */
function messages(venue: HubVenue, syms: string[], what: "base" | "book", on: boolean): string[] {
  if (!syms.length) return [];
  if (venue === "hyperliquid") {
    const method = on ? "subscribe" : "unsubscribe";
    const subs = what === "book" ? syms.map((coin) => ({ type: "l2Book", coin, fast: true })) : syms.flatMap((coin) => [{ type: "bbo", coin }, { type: "trades", coin }, { type: "activeAssetCtx", coin }, { type: "candle", coin, interval: "1m" }]);
    return subs.map((subscription) => JSON.stringify({ method, subscription }));
  }
  if (venue === "coinbase") {
    const type = on ? "subscribe" : "unsubscribe";
    return (what === "book" ? ["level2"] : ["ticker", "market_trades"]).map((channel) => JSON.stringify({ type, product_ids: syms, channel }));
  }
  if (venue === "kraken") {
    const method = on ? "subscribe" : "unsubscribe";
    if (what === "book") return [JSON.stringify({ method, params: { channel: "book", symbol: syms, depth: KRAKEN_DEPTH } })];
    return [JSON.stringify({ method, params: { channel: "ticker", symbol: syms, event_trigger: "bbo" } }), JSON.stringify({ method, params: { channel: "trade", symbol: syms, ...(on ? { snapshot: true } : {}) } }), JSON.stringify({ method, params: { channel: "ohlc", symbol: syms, interval: 1 } })];
  }
  const op = on ? "subscribe" : "unsubscribe";
  const channels = what === "book" ? ["books5"] : ["bbo-tbt", "tickers", "trades"];
  return [JSON.stringify({ op, args: syms.flatMap((instId) => channels.map((channel) => ({ channel, instId }))) })];
}

/** a book's side, best first, its top `depth` levels */
const sideOut = (m: Map<number, number>, bids: boolean, depth: number): Array<[number, number]> =>
  [...m.entries()].sort((a, b) => (bids ? b[0] - a[0] : a[0] - b[0])).slice(0, depth);

export class StreamHub implements MarketHub {
  private readonly Ws: WebSocketMaker | undefined;
  private readonly answers: (venue: HubVenue) => boolean;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly max: number;
  private readonly markets = new Map<string, Mkt>();
  /** each venue's markets by the venue's own symbol */
  private readonly bySym = new Map<HubVenue, Map<string, Mkt>>(HUB_VENUES.map((v) => [v, new Map()]));
  private readonly conns = new Map<HubVenue, Conn>(HUB_VENUES.map((v) => [v, { venue: v, ws: undefined, state: "closed", attempt: 0, openedAt: 0, lastMsgAt: 0, lastSentAt: 0, pingAt: 0, retry: undefined, precision: new Map(), waiters: [] }]));
  private readonly listeners = new Set<(t: HubTick) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastLook = 0;
  /** the venues whose subscriptions are to be set again at the end of this turn (wake) */
  private readonly due = new Set<HubVenue>();
  private closed = false;
  /** the count every market's seq is taken from: it only rises, so a market let go and taken again goes on from above where it stood */
  private seqNo = 0;

  constructor(o: StreamHubOptions = {}) {
    this.Ws = o.WebSocket ?? (globalThis as { WebSocket?: WebSocketMaker }).WebSocket;
    this.answers = o.answers ?? (() => true);
    this.clock = o.clock ?? Date.now;
    this.random = o.random ?? Math.random;
    this.max = o.maxMarkets ?? MAX_MARKETS;
  }

  covers(source: string, symbol: string): boolean {
    return !!this.Ws && streamOf(source, symbol) !== undefined;
  }

  want(source: string, symbol: string): boolean {
    const mk = this.ensure(source, symbol);
    if (!mk) return false;
    mk.until = Math.max(mk.until, this.clock() + IDLE_MS);
    this.wake(mk.venue);
    return !mk.refused;
  }

  hold(source: string, symbol: string, o: { book?: boolean | undefined } = {}): () => void {
    const mk = this.ensure(source, symbol);
    if (!mk) return () => undefined;
    const book = o.book === true;
    mk.holds++;
    if (book) mk.bookHolds++;
    this.wake(mk.venue);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (this.markets.get(mk.key) !== mk) return;
      const now = this.clock();
      mk.holds = Math.max(0, mk.holds - 1);
      mk.until = Math.max(mk.until, now + IDLE_MS);
      if (book) {
        mk.bookHolds = Math.max(0, mk.bookHolds - 1);
        mk.bookUntil = Math.max(mk.bookUntil, now + IDLE_MS);
      }
      this.wake(mk.venue);
    };
  }

  /** the market as its stream has it now: its best bid and ask — the venue's best-bid-and-ask channel's, or, where that channel does not
   * speak on every change (Coinbase's ticker), its level2 book's top while one is kept — confirmed as BBO_EVERY_CHANGE says: by any later
   * word on the live connection where the channel (or the book) speaks on every change, else only by its own message. Undefined before the
   * market's first message on this subscription */
  quote(source: string, symbol: string): HubQuote | undefined {
    const mk = this.markets.get(`${source}|${symbol}`);
    if (!mk || !mk.snapped) return undefined;
    const now = this.clock();
    const live = this.isLive(mk, now);
    const c = this.conns.get(mk.venue)!;
    const top = this.bookTop(mk);
    const [bid, bidSz, ask, askSz] = top ?? [mk.bid, mk.bidSz, mk.ask, mk.askSz];
    // the moment the best bid and ask are confirmed to: the book's top, on the book's own messages and every word after them; a channel that
    // speaks on every change, on its own and every word after it; Coinbase's ticker, on its own alone. None said yet: the latest message's
    const seenAt = top ? (live ? Math.max(mk.bookRecvAt, c.lastMsgAt) : mk.bookRecvAt) : mk.bboSnapped ? (live && BBO_EVERY_CHANGE[mk.venue] ? Math.max(mk.bboRecvAt, c.lastMsgAt) : mk.bboRecvAt) : mk.recvAt;
    // the venue's own moment of that best bid and ask: the book's top's message, else their channel's — none before either has spoken
    const priceAt = top ? mk.topAt : mk.bboSnapped ? mk.bboAt : undefined;
    return { ...(bid !== undefined ? { bid } : {}), ...(ask !== undefined ? { ask } : {}), ...(bid !== undefined && bidSz !== undefined ? { bidSz } : {}), ...(ask !== undefined && askSz !== undefined ? { askSz } : {}), ...(mk.last !== undefined ? { last: mk.last } : {}), ...(mk.mark !== undefined ? { mark: mk.mark } : {}), ...(mk.oracle !== undefined ? { oracle: mk.oracle } : {}), ...(mk.funding !== undefined ? { funding: mk.funding } : {}), ...(mk.openInterest !== undefined ? { openInterest: mk.openInterest } : {}), ...(mk.volumeUsd24h !== undefined ? { volumeUsd24h: mk.volumeUsd24h } : {}), ...(mk.prevDayPx !== undefined ? { prevDayPx: mk.prevDayPx } : {}), ...(mk.premium !== undefined ? { premium: mk.premium } : {}), at: mk.at, ...(priceAt !== undefined ? { priceAt } : {}), recvAt: mk.recvAt, seenAt, src: HUB_NAMES[mk.venue], seq: mk.seq, live, ...(mk.bar ? { bar: { ...mk.bar } } : {}) };
  }

  book(source: string, symbol: string, depth = BOOK_TOP): HubBook | undefined {
    const mk = this.markets.get(`${source}|${symbol}`);
    if (!mk || !mk.bookOn || !mk.bookSnapped) return undefined;
    const now = this.clock();
    const c = this.conns.get(mk.venue)!;
    // a book is live on its own messages: its market's ticker need not have spoken yet
    const live = c.state === "open" && !mk.refused && now - c.lastMsgAt < LIVE_MS;
    const d = Math.max(1, Math.min(BOOK_TOP * 5, Math.floor(depth)));
    // Coinbase's book is the venue's whole, level for level, to each side's boundary (where it was cut): whole for a depth that boundary
    // holds, and not beyond it
    const whole = mk.venue === "coinbase" && (mk.bidCut === undefined || mk.bids.size >= d) && (mk.askCut === undefined || mk.asks.size >= d);
    return { bids: sideOut(mk.bids, true, d), asks: sideOut(mk.asks, false, d), at: mk.bookAt, recvAt: mk.bookRecvAt, seenAt: live ? Math.max(mk.bookRecvAt, c.lastMsgAt) : mk.bookRecvAt, src: HUB_NAMES[mk.venue], live, ...(whole ? { whole: true as const } : {}) };
  }

  trades(source: string, symbol: string, limit: number): PublicTrade[] {
    const mk = this.markets.get(`${source}|${symbol}`);
    if (!mk) return [];
    const n = Math.max(1, Math.min(RING_SIZE, Math.floor(limit) || 30));
    return [...mk.ring]
      .sort((a, b) => b.at - a.at || b.seq - a.seq)
      .slice(0, n)
      .map((t) => ({ price: t.price, size: t.size, ...(t.side ? { side: t.side } : {}), at: new Date(t.at).toISOString() }));
  }

  since(source: string, symbol: string, seq: number, cut: SinceCut = {}): HubRange {
    const mk = this.markets.get(`${source}|${symbol}`);
    if (!mk) return { trades: 0, seq: 0 };
    let hi: number | undefined;
    let lo: number | undefined;
    let n = 0;
    for (const t of mk.ring) {
      if (t.seq <= seq) continue;
      if (cut.after !== undefined && t.at <= cut.after) continue;
      if (t.snap && cut.snapshotAfter !== undefined && t.at <= cut.snapshotAfter) continue;
      n++;
      hi = hi === undefined ? t.price : Math.max(hi, t.price);
      lo = lo === undefined ? t.price : Math.min(lo, t.price);
    }
    return { ...(hi !== undefined ? { hi } : {}), ...(lo !== undefined ? { lo } : {}), trades: n, seq: mk.seq, ...(mk.evictedSeq > seq ? { partial: true as const } : {}) };
  }

  async confirmed(source: string, symbol: string, maxAgeMs: number, waitMs: number): Promise<HubQuote | undefined> {
    const fresh = (): HubQuote | undefined => {
      const q = this.quote(source, symbol);
      return q?.live && this.clock() - q.seenAt <= maxAgeMs ? q : undefined;
    };
    const now = fresh();
    if (now) return now;
    const mk = this.markets.get(`${source}|${symbol}`);
    const c = mk ? this.conns.get(mk.venue) : undefined;
    if (!mk || !c || c.state !== "open" || !mk.on || mk.refused || !(waitMs > 0)) return undefined;
    // a venue that answers a ping is asked now: where its best-bid-and-ask channel speaks on every change, its answer, or any message before
    // it, confirms the market as it stands (Coinbase answers none: only its ticker, or its book while one is kept, confirms its price)
    const ping = PING[c.venue];
    if (ping && this.clock() - c.pingAt >= 200) {
      this.send(c, ping);
      c.pingAt = this.clock();
    }
    return new Promise<HubQuote | undefined>((go) => {
      let done = false;
      const end = (q: HubQuote | undefined): void => {
        if (done) return;
        done = true;
        clearTimeout(t);
        go(q);
      };
      const t = setTimeout(() => end(fresh()), waitMs);
      t.unref?.();
      // asked at each word on the connection: done once one confirms the market (a heartbeat does not confirm a ticker that speaks only on a
      // trade), or once the connection is gone
      c.waiters.push((final) => {
        if (done) return true;
        const q = fresh();
        if (!q && !final) return false;
        end(q);
        return true;
      });
    });
  }

  onTick(fn: (t: HubTick) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const c of this.conns.values()) this.shut(c);
    this.markets.clear();
    for (const m of this.bySym.values()) m.clear();
    this.listeners.clear();
  }

  /** the markets streamed now, by their key (`source|symbol`), and whether each is live: what a page's health line and a test read */
  status(): Array<{ key: string; venue: HubVenue; live: boolean; book: boolean; refused?: string | undefined }> {
    const now = this.clock();
    return [...this.markets.values()].map((m) => ({ key: m.key, venue: m.venue, live: this.isLive(m, now), book: m.bookOn, ...(m.refused ? { refused: m.refused } : {}) }));
  }

  // ---- interest and subscriptions ----------------------------------------------------------------------------------------------------

  /** the market's entry, made when it has a stream and there is room: one no one wants any more makes room for it */
  private ensure(source: string, symbol: string): Mkt | undefined {
    if (this.closed) return undefined;
    const key = `${source}|${symbol}`;
    const had = this.markets.get(key);
    if (had) return had;
    const s = streamOf(source, symbol);
    if (!s || !this.Ws) return undefined;
    if (this.markets.size >= this.max) {
      const now = this.clock();
      const spare = [...this.markets.values()].filter((m) => !m.holds && (now >= m.until || !!m.refused)).sort((a, b) => a.until - b.until)[0];
      if (!spare) return undefined;
      this.drop(spare);
    }
    const mk: Mkt = { key, source, symbol, venue: s.venue, sym: s.sym, holds: 0, bookHolds: 0, until: 0, bookUntil: 0, on: false, bookOn: false, snapped: false, bookSnapped: false, bboSnapped: false, bboRecvAt: 0, tbt: false, tradesSnapped: false, resyncDue: false, evictedSeq: 0, at: 0, recvAt: 0, seq: this.seqNo, bids: new Map(), asks: new Map(), bookAt: 0, bookRecvAt: 0, resyncAt: 0, cut: false, ring: [], ids: new Set(), live: false };
    this.markets.set(key, mk);
    this.bySym.get(s.venue)!.set(s.sym, mk);
    this.start();
    return mk;
  }

  /** a market let go: unsubscribed where it was subscribed, and forgotten */
  private drop(mk: Mkt): void {
    const c = this.conns.get(mk.venue)!;
    if (c.state === "open") {
      if (mk.bookOn) for (const t of messages(mk.venue, [mk.sym], "book", false)) this.send(c, t);
      if (mk.on) for (const t of messages(mk.venue, [mk.sym], "base", false)) this.send(c, t);
    }
    this.markets.delete(mk.key);
    if (this.bySym.get(mk.venue)!.get(mk.sym) === mk) this.bySym.get(mk.venue)!.delete(mk.sym);
    if (mk.live) {
      mk.live = false;
      this.tell(mk, "live");
    }
  }

  /** the venue's subscriptions set again at the end of this turn: several wants and holds at once are one set of messages */
  private wake(venue: HubVenue): void {
    if (this.due.has(venue)) return;
    this.due.add(venue);
    queueMicrotask(() => {
      this.due.delete(venue);
      this.sync(venue);
    });
  }

  /** THE VENUE AS IT SHOULD BE NOW: its connection open while a market there is wanted and its REST answers this network (closed
   * otherwise), and each market wanted subscribed — its book while a page shows it — and each no longer wanted unsubscribed */
  private sync(venue: HubVenue): void {
    if (this.closed) return;
    const c = this.conns.get(venue)!;
    const now = this.clock();
    const all = [...this.bySym.get(venue)!.values()];
    const base = all.filter((m) => !m.refused && (m.holds > 0 || now < m.until));
    if (!base.length || !this.answers(venue)) {
      // nothing wanted there, or its REST refused here: no stream (and no try to open one) until that changes
      if (c.state !== "closed" || c.retry) this.shut(c);
      return;
    }
    if (c.state === "closed") {
      if (!c.retry) this.open(c);
      return;
    }
    if (c.state !== "open") return;
    const book = new Set(base.filter((m) => m.bookHolds > 0 || now < m.bookUntil));
    const wanted = new Set(base);
    const subBase = base.filter((m) => !m.on);
    const unBase = all.filter((m) => m.on && !wanted.has(m));
    const subBook = [...book].filter((m) => !m.bookOn);
    const unBook = all.filter((m) => m.bookOn && !book.has(m));
    for (const t of messages(venue, unBook.map((m) => m.sym), "book", false)) this.send(c, t);
    for (const m of unBook) this.unbook(m);
    for (const t of messages(venue, unBase.map((m) => m.sym), "base", false)) this.send(c, t);
    for (const m of unBase) {
      m.on = false;
      this.forget(m);
    }
    for (const t of messages(venue, subBase.map((m) => m.sym), "base", true)) this.send(c, t);
    for (const m of subBase) {
      m.on = true;
      this.forget(m);
    }
    for (const t of messages(venue, subBook.map((m) => m.sym), "book", true)) this.send(c, t);
    for (const m of subBook) {
      this.unbook(m);
      m.bookOn = true;
    }
  }

  /** WHAT A SUBSCRIPTION SAID OF THE MARKET NOW, let go with it (the connection gone, the market unsubscribed, or subscribed again): its best
   * bid and ask and their sizes, a perpetual's mark, oracle and funding — none of it stands for the market until the venue says it again on
   * the new subscription, so a word of another channel that comes first (a trade, the mark, the bar) never makes the old best bid and ask
   * live, and a stop is never judged at a price from before the drop. Its last trade, its trades and its bar stay: they are what traded */
  private forget(m: Mkt): void {
    m.snapped = false;
    m.bboSnapped = false;
    m.bboAt = undefined;
    m.tbt = false;
    m.tradesSnapped = false;
    m.bid = undefined;
    m.ask = undefined;
    m.bidSz = undefined;
    m.askSz = undefined;
    m.mark = undefined;
    m.oracle = undefined;
    m.funding = undefined;
  }
  /** the market's book let go (unsubscribed, the connection gone): nothing of it kept, no resync waiting */
  private unbook(m: Mkt): void {
    m.bookOn = false;
    m.bookSnapped = false;
    m.resyncDue = false;
    m.cut = false;
    m.bidCut = undefined;
    m.askCut = undefined;
    m.topAt = undefined;
    m.bids.clear();
    m.asks.clear();
  }

  // ---- connections ---------------------------------------------------------------------------------------------------------------------

  private open(c: Conn): void {
    if (!this.Ws || this.closed) return;
    c.state = "connecting";
    c.openedAt = this.clock();
    c.cbSeq = undefined;
    let ws: WebSocketLike;
    try {
      ws = new this.Ws(HUB_URLS[c.venue]);
    } catch {
      c.ws = undefined;
      return void this.gone(c, undefined);
    }
    c.ws = ws;
    ws.addEventListener("open", () => {
      if (c.ws !== ws) return;
      c.state = "open";
      c.lastMsgAt = this.clock();
      for (const m of this.bySym.get(c.venue)!.values()) {
        m.on = false;
        this.forget(m);
        this.unbook(m);
      }
      for (const t of FIRST[c.venue]) this.send(c, t);
      this.sync(c.venue);
    });
    ws.addEventListener("message", (e) => {
      if (c.ws !== ws) return;
      const d = e.data;
      const text = typeof d === "string" ? d : d instanceof ArrayBuffer ? Buffer.from(d).toString("utf8") : ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength).toString("utf8") : "";
      if (text) this.heard(c, text);
    });
    ws.addEventListener("close", () => this.gone(c, ws));
    ws.addEventListener("error", () => this.gone(c, ws));
  }

  /** the connection let go of by the hub itself (nothing wanted there, the gate shut, the hub closing): no try to open it again */
  private shut(c: Conn): void {
    if (c.retry) clearTimeout(c.retry);
    c.retry = undefined;
    const ws = c.ws;
    c.ws = undefined;
    c.state = "closed";
    try {
      ws?.close(1000, "not wanted");
    } catch {
      // gone already
    }
    this.lost(c);
  }

  /** the connection closed or failed by itself (or was given up: silent, not open in time): opened again after a jittered wait while a
   * market there is still wanted */
  private gone(c: Conn, ws: WebSocketLike | undefined): void {
    if (ws !== undefined && c.ws !== ws) return;
    c.ws = undefined;
    c.state = "closed";
    try {
      ws?.close();
    } catch {
      // gone already
    }
    this.lost(c);
    if (this.closed || c.retry) return;
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** c.attempt);
    const wait = BACKOFF_MIN_MS + this.random() * (cap - BACKOFF_MIN_MS);
    c.attempt = Math.min(c.attempt + 1, 16);
    c.retry = setTimeout(() => {
      c.retry = undefined;
      this.sync(c.venue);
    }, wait);
    c.retry.unref?.();
  }

  /** what a connection that is no more leaves: no market of it subscribed or live, nothing it said of them now kept (forget), its waiters
   * answered */
  private lost(c: Conn): void {
    for (const m of this.bySym.get(c.venue)!.values()) {
      m.on = false;
      this.forget(m);
      this.unbook(m);
      this.flip(m, this.clock());
    }
    for (const w of c.waiters.splice(0)) w(true);
  }

  private send(c: Conn, text: string): void {
    if (!c.ws || c.state !== "open") return;
    try {
      c.ws.send(text);
      c.lastSentAt = this.clock();
    } catch {
      this.gone(c, c.ws);
    }
  }

  /** THE HUB'S OWN LOOK, every LOOK_MS while a market is kept: a sleep found (the look came late) opens every connection again; a market
   * no one wants any more is let go; a connection silent too long, or not open in time, is given up; a quiet one is pinged; each venue set
   * as it should be (sync: the gate among it); and each market's live told when it changed */
  private look(): void {
    const now = this.clock();
    const late = this.lastLook ? now - this.lastLook - LOOK_MS : 0;
    this.lastLook = now;
    if (late > SLEEP_MS) this.woke();
    for (const mk of [...this.markets.values()]) if (!mk.holds && now >= mk.until) this.drop(mk);
    for (const c of this.conns.values()) {
      if (c.state === "connecting" && now - c.openedAt > OPEN_MS) this.gone(c, c.ws);
      else if (c.state === "open") {
        if (now - c.lastMsgAt > DEAD_MS) this.gone(c, c.ws);
        else {
          const ping = PING[c.venue];
          if (ping && (now - c.lastSentAt >= KEEPALIVE_MS || (now - c.lastMsgAt >= QUIET_PING_MS && now - c.pingAt >= QUIET_PING_MS))) {
            this.send(c, ping);
            c.pingAt = now;
          }
        }
      }
      this.sync(c.venue);
    }
    // a book found wrong while its last resync was too recent to send another: sent for afresh now that it may be (resync), so a book is
    // never left unshown for want of a message that would ask for it again (an update is not read while its book waits for a snapshot)
    for (const mk of this.markets.values()) {
      const c = this.conns.get(mk.venue)!;
      if (mk.resyncDue && mk.bookOn && c.state === "open" && now - mk.resyncAt >= RESYNC_MS) this.resync(c, mk, now);
    }
    for (const mk of this.markets.values()) this.flip(mk, now);
    if (!this.markets.size && [...this.conns.values()].every((c) => c.state === "closed" && !c.retry)) this.stop();
  }

  /** the machine slept: every connection open is let go and opened again, one after another, its tries counted afresh */
  private woke(): void {
    let i = 0;
    for (const c of this.conns.values()) {
      if (c.state === "closed" && !c.retry) continue;
      this.shut(c);
      c.attempt = 0;
      const wait = i++ * STAGGER_MS;
      c.retry = setTimeout(() => {
        c.retry = undefined;
        this.sync(c.venue);
      }, wait);
      c.retry.unref?.();
    }
  }

  private start(): void {
    if (this.timer || this.closed) return;
    this.lastLook = this.clock();
    this.timer = setInterval(() => this.look(), LOOK_MS);
    this.timer.unref?.();
  }
  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.lastLook = 0;
  }

  /** live: the connection open and spoken within LIVE_MS, the market subscribed, and its best bid and ask said on this subscription (its
   * best-bid-and-ask channel, or the book's top where that stands for it) — a trade, the mark or the bar coming first after a reconnect is
   * not it */
  private isLive(mk: Mkt, now: number): boolean {
    const c = this.conns.get(mk.venue)!;
    return c.state === "open" && mk.on && mk.snapped && (mk.bboSnapped || this.bookTop(mk) !== undefined) && !mk.refused && now - c.lastMsgAt < LIVE_MS;
  }
  /** THE BOOK'S TOP AS THE BEST BID AND ASK, where the venue's best-bid-and-ask channel does not speak on every change (Coinbase's ticker)
   * and its book, which does, is kept whole now (a page shows it, its snapshot has come and nothing has found it wrong since): [bid, its
   * size, ask, its size] — else undefined */
  private bookTop(mk: Mkt): [number, number, number, number] | undefined {
    if (BBO_EVERY_CHANGE[mk.venue] || !mk.bookOn || !mk.bookSnapped || !mk.bids.size || !mk.asks.size) return undefined;
    let bid = -Infinity;
    let ask = Infinity;
    for (const p of mk.bids.keys()) if (p > bid) bid = p;
    for (const p of mk.asks.keys()) if (p < ask) ask = p;
    return [bid, mk.bids.get(bid)!, ask, mk.asks.get(ask)!];
  }
  private flip(mk: Mkt, now: number): void {
    const live = this.isLive(mk, now);
    if (live === mk.live) return;
    mk.live = live;
    this.tell(mk, "live");
  }
  private tell(mk: Mkt, what: HubTick["what"]): void {
    const t: HubTick = { source: mk.source, symbol: mk.symbol, what };
    for (const fn of [...this.listeners]) {
      try {
        fn(t);
      } catch {
        // a listener's fault is its own
      }
    }
  }

  // ---- what the venues say -------------------------------------------------------------------------------------------------------------

  /** one message from a venue: the connection spoke (its waiters answered, its tries counted afresh), then read by the venue's own shapes.
   * Every market the message moved is told once, after all of it is read */
  private heard(c: Conn, text: string): void {
    const now = this.clock();
    c.lastMsgAt = now;
    c.attempt = 0;
    const moved = new Map<Mkt, Set<HubTick["what"]>>();
    const touch = (mk: Mkt, what: HubTick["what"]) => {
      const s = moved.get(mk) ?? new Set();
      s.add(what);
      moved.set(mk, s);
    };
    if (text.trim() !== "pong") {
      let msg: unknown;
      try {
        msg = JSON.parse(text);
      } catch {
        msg = undefined;
      }
      if (msg !== undefined) {
        if (c.venue === "hyperliquid") this.hl(c, msg, now, touch);
        else if (c.venue === "coinbase") this.cb(c, msg, now, touch);
        else if (c.venue === "kraken") this.kr(c, msg, now, touch);
        else this.okx(c, msg, now, touch);
      }
    }
    for (const [mk, whats] of moved) {
      this.flip(mk, now);
      for (const w of whats) this.tell(mk, w);
    }
    if (c.waiters.length) c.waiters = c.waiters.filter((w) => !w(false));
  }

  /** the market a venue's message names, while it is subscribed */
  private named(c: Conn, sym: string | undefined): Mkt | undefined {
    if (!sym) return undefined;
    const mk = this.bySym.get(c.venue)!.get(sym);
    return mk && mk.on ? mk : undefined;
  }
  private stamp(mk: Mkt, at: number | undefined, now: number): void {
    mk.at = at !== undefined ? Math.max(mk.at, at) : now;
    mk.recvAt = now;
    mk.seq = ++this.seqNo;
    mk.snapped = true;
  }
  /** the best bid and ask as the venue's best-bid-and-ask channel says them: this subscription's from now (bboSnapped), at the moment the
   * venue stamped this message (none where it stamped none: their moment is not known, and this machine's clock never stands in for it) */
  private bbo(mk: Mkt, bid: number | undefined, bidSz: number | undefined, ask: number | undefined, askSz: number | undefined, at: number | undefined, now: number): void {
    mk.bid = bid;
    mk.bidSz = bid !== undefined ? bidSz : undefined;
    mk.ask = ask;
    mk.askSz = ask !== undefined ? askSz : undefined;
    mk.bboSnapped = true;
    mk.bboRecvAt = now;
    mk.bboAt = at;
    this.stamp(mk, at, now);
  }
  /** a trade, once (by the venue's id where it gives one: a snapshot sent again holds trades already here), into the ring — `snap` where it
   * came in a subscription's snapshot */
  private trade(mk: Mkt, t: { price: number | undefined; size: number | undefined; side?: Side | undefined; at: number | undefined; id?: string | undefined; snap?: boolean | undefined }, now: number): boolean {
    if (t.price === undefined || t.size === undefined) return false;
    if (t.id !== undefined && mk.ids.has(t.id)) return false;
    this.stamp(mk, t.at, now);
    // the newest trade by the venue's time is the last price
    const at = t.at ?? now;
    const newest = mk.ring.reduce((x, r) => Math.max(x, r.at), 0);
    if (at >= newest) mk.last = t.price;
    mk.ring.push({ price: t.price, size: t.size, ...(t.side ? { side: t.side } : {}), at, seq: mk.seq, ...(t.id !== undefined ? { id: t.id } : {}), ...(t.snap ? { snap: true as const } : {}) });
    if (t.id !== undefined) mk.ids.add(t.id);
    while (mk.ring.length > RING_SIZE) {
      const gone = mk.ring.shift()!;
      mk.evictedSeq = Math.max(mk.evictedSeq, gone.seq);
      if (gone.id !== undefined) mk.ids.delete(gone.id);
    }
    return true;
  }
  /** a book's side set from levels [price, size]: `whole` replaces it, otherwise each level's new size (0: gone) */
  private levels(side: Map<number, number>, rows: Array<[number | undefined, number | undefined]>, whole: boolean): void {
    if (whole) side.clear();
    for (const [p, s] of rows) {
      if (p === undefined || s === undefined) continue;
      if (s <= 0) side.delete(p);
      else side.set(p, s);
    }
  }
  /** a side longer than `keep` and `slack` more cut back to its best `keep` levels: true when it was */
  private trim(side: Map<number, number>, bids: boolean, keep: number, slack = 0): boolean {
    if (side.size <= keep + slack) return false;
    const best = sideOut(side, bids, keep);
    side.clear();
    for (const [p, s] of best) side.set(p, s);
    return true;
  }
  /** A BOOK FOUND WRONG (a checksum that differs, a message missed, a side cut too short): nothing of it is shown or walked from now until
   * the venue's new snapshot, and it is sent for afresh (unsubscribed and subscribed again: the snapshot follows) — at most once in
   * RESYNC_MS; one found wrong sooner after the last is sent for by the hub's own look once RESYNC_MS has passed (resyncDue), since its
   * updates are not read meanwhile and none of them would ask for it again */
  private resync(c: Conn, mk: Mkt, now: number): void {
    if (!mk.bookOn) return;
    mk.bookSnapped = false;
    mk.cut = false;
    mk.bidCut = undefined;
    mk.askCut = undefined;
    mk.topAt = undefined;
    mk.bids.clear();
    mk.asks.clear();
    if (now - mk.resyncAt < RESYNC_MS) {
      mk.resyncDue = true;
      return;
    }
    mk.resyncAt = now;
    mk.resyncDue = false;
    for (const t of messages(c.venue, [mk.sym], "book", false)) this.send(c, t);
    for (const t of messages(c.venue, [mk.sym], "book", true)) this.send(c, t);
  }
  private booked(mk: Mkt, at: number | undefined, now: number): void {
    mk.bookAt = at ?? now;
    mk.bookRecvAt = now;
    mk.seq = ++this.seqNo;
  }

  /** Hyperliquid: {channel, data} — bbo, trades, activeAssetCtx, candle, l2Book; pong; subscriptionResponse; error */
  private hl(c: Conn, raw: unknown, now: number, touch: (mk: Mkt, what: HubTick["what"]) => void): void {
    const m = rec(raw);
    const d = m.data;
    if (m.channel === "bbo") {
      const x = rec(d);
      const mk = this.named(c, str(x.coin));
      if (!mk) return;
      const [b, a] = list(x.bbo).map(rec);
      this.bbo(mk, pos(b?.px), pos(b?.sz), pos(a?.px), pos(a?.sz), whenMs(x.time), now);
      touch(mk, "quote");
    } else if (m.channel === "trades") {
      // a market's first trades message since it was subscribed is its snapshot: the venue's recent trades, sent again on every subscription
      const first = new Set<Mkt>();
      for (const t of list(d).map(rec)) {
        const mk = this.named(c, str(t.coin));
        if (!mk) continue;
        if (!mk.tradesSnapped) first.add(mk);
        if (this.trade(mk, { price: pos(t.px), size: pos(t.sz), side: t.side === "B" ? "buy" : t.side === "A" ? "sell" : undefined, at: whenMs(t.time), id: str(t.tid), snap: first.has(mk) }, now)) touch(mk, "trades");
      }
      for (const mk of first) mk.tradesSnapped = true;
    } else if (m.channel === "activeAssetCtx") {
      const x = rec(d);
      const mk = this.named(c, str(x.coin));
      if (!mk) return;
      const ctx = rec(x.ctx);
      mk.mark = pos(ctx.markPx) ?? mk.mark;
      mk.oracle = pos(ctx.oraclePx) ?? mk.oracle;
      mk.funding = num(ctx.funding) ?? mk.funding;
      mk.openInterest = nonNeg(ctx.openInterest) ?? mk.openInterest;
      mk.volumeUsd24h = nonNeg(ctx.dayNtlVlm) ?? mk.volumeUsd24h;
      mk.prevDayPx = pos(ctx.prevDayPx) ?? mk.prevDayPx;
      mk.premium = num(ctx.premium) ?? mk.premium;
      this.stamp(mk, undefined, now);
      touch(mk, "quote");
    } else if (m.channel === "candle") {
      const x = rec(d);
      const mk = this.named(c, str(x.s));
      const [t, o, h, l, cl] = [whenMs(x.t), pos(x.o), pos(x.h), pos(x.l), pos(x.c)];
      if (!mk || t === undefined || o === undefined || h === undefined || l === undefined || cl === undefined) return;
      const v = nonNeg(x.v);
      mk.bar = { t, o, h, l, c: cl, ...(v !== undefined ? { v } : {}) };
    } else if (m.channel === "l2Book") {
      const x = rec(d);
      const mk = this.named(c, str(x.coin));
      if (!mk || !mk.bookOn) return;
      const lv = list(x.levels);
      if (lv.length !== 2) return;
      const side = (rows: unknown): Array<[number | undefined, number | undefined]> => list(rows).map((r) => [pos(rec(r).px), pos(rec(r).sz)]);
      this.levels(mk.bids, side(lv[0]), true);
      this.levels(mk.asks, side(lv[1]), true);
      mk.bookSnapped = true;
      this.booked(mk, whenMs(x.time), now);
      touch(mk, "book");
    }
  }

  /** Coinbase Advanced Trade: {channel, timestamp, sequence_num, events: [...]} — ticker, market_trades, l2_data, heartbeats, subscriptions;
   * {type: "error", message} */
  private cb(c: Conn, raw: unknown, now: number, touch: (mk: Mkt, what: HubTick["what"]) => void): void {
    const m = rec(raw);
    const seq = num(m.sequence_num);
    if (seq !== undefined) {
      // a message missed on the connection: its books may have missed a change, so they are sent for afresh
      if (c.cbSeq !== undefined && seq > c.cbSeq) {
        for (const mk of this.bySym.get("coinbase")!.values()) {
          if (!mk.bookOn) continue;
          const shown = mk.bookSnapped;
          this.resync(c, mk, now);
          // its top stood for the market's best bid and ask: the ticker's stand again
          if (shown) {
            touch(mk, "book");
            touch(mk, "quote");
          }
        }
      }
      c.cbSeq = seq + 1;
    }
    const at = whenMs(m.timestamp);
    const ch = m.channel;
    for (const ev of list(m.events).map(rec)) {
      if (ch === "ticker" || ch === "ticker_batch") {
        for (const t of list(ev.tickers).map(rec)) {
          const mk = this.named(c, str(t.product_id));
          if (!mk) continue;
          this.bbo(mk, pos(t.best_bid), pos(t.best_bid_quantity), pos(t.best_ask), pos(t.best_ask_quantity), at, now);
          const last = pos(t.price);
          if (last !== undefined) mk.last = last;
          touch(mk, "quote");
        }
      } else if (ch === "market_trades") {
        // a Coinbase trade's side is left unsaid: its docs do not say whose side it is (public-markets.ts says the same of its REST trades)
        for (const t of list(ev.trades).map(rec)) {
          const mk = this.named(c, str(t.product_id));
          if (mk && this.trade(mk, { price: pos(t.price), size: pos(t.size), at: whenMs(t.time), id: str(t.trade_id), snap: ev.type === "snapshot" }, now)) touch(mk, "trades");
        }
      } else if (ch === "l2_data") {
        const mk = this.named(c, str(ev.product_id));
        if (!mk || !mk.bookOn) continue;
        const whole = ev.type === "snapshot";
        if (!whole && !mk.bookSnapped) continue;
        const ups = list(ev.updates).map(rec);
        if (whole) {
          mk.cut = false;
          mk.bidCut = undefined;
          mk.askCut = undefined;
        }
        // an update past a side's boundary is of a level forgotten there: let go, never added back over the levels between it and the kept
        // ones, which this book no longer knows
        const inside = (side: string, p: number | undefined): boolean => p !== undefined && (side === "bid" ? mk.bidCut === undefined || p >= mk.bidCut - 1e-12 : mk.askCut === undefined || p <= mk.askCut + 1e-12);
        const rows = (side: string): Array<[number | undefined, number | undefined]> => ups.filter((u) => u.side === side).map((u): [number | undefined, number | undefined] => [pos(u.price_level), nonNeg(u.new_quantity)]).filter(([p]) => inside(side, p));
        // the book's top is the market's best bid and ask while the book is kept (bookTop): a change of it is a quote too
        const was = this.bookTop(mk)?.join("|");
        this.levels(mk.bids, rows("bid"), whole);
        this.levels(mk.asks, rows("offer"), whole);
        // the whole book is far longer than anything shown: its farthest levels go, the side's boundary where they were cut — and a side left
        // with fewer than a fill walks inside its boundary (the price came toward it) is sent for afresh: the levels past the boundary the
        // venue still has are not known here
        if (this.trim(mk.bids, true, LEVELS_KEPT, LEVELS_KEPT)) {
          mk.cut = true;
          mk.bidCut = Math.min(...mk.bids.keys());
        }
        if (this.trim(mk.asks, false, LEVELS_KEPT, LEVELS_KEPT)) {
          mk.cut = true;
          mk.askCut = Math.max(...mk.asks.keys());
        }
        if (whole) mk.bookSnapped = true;
        if ((mk.bidCut !== undefined && mk.bids.size < CUT_DEPTH_MIN) || (mk.askCut !== undefined && mk.asks.size < CUT_DEPTH_MIN)) {
          this.resync(c, mk, now);
          touch(mk, "book");
          touch(mk, "quote");
          continue;
        }
        const evAt = ups.reduce<number | undefined>((x, u) => {
          const t = whenMs(u.event_time);
          return t === undefined ? x : Math.max(x ?? 0, t);
        }, undefined);
        this.booked(mk, evAt ?? at, now);
        touch(mk, "book");
        if (this.bookTop(mk)?.join("|") !== was) {
          // the best bid and ask moved with this message: theirs is its moment now
          mk.topAt = evAt ?? at;
          touch(mk, "quote");
        }
      }
    }
  }

  /** Kraken v2: {channel, type, data: [...]} — ticker, trade, ohlc, book (with its checksum), instrument, heartbeat, status; {method,
   * success, error, symbol} answers; pong */
  private kr(c: Conn, raw: unknown, now: number, touch: (mk: Mkt, what: HubTick["what"]) => void): void {
    const m = rec(raw);
    if (m.method === "subscribe" || m.method === "unsubscribe") {
      if (m.success === false && m.method === "subscribe") {
        const mk = this.named(c, str(m.symbol) ?? str(rec(m.result).symbol));
        if (mk) this.refuse(mk, `Kraken: ${String(m.error ?? "the subscription was refused").slice(0, 160)}`, now);
      }
      return;
    }
    const ch = m.channel;
    if (ch === "instrument") {
      for (const p of list(rec(m.data).pairs).map(rec)) {
        const s = str(p.symbol);
        const price = num(p.price_precision);
        const qty = num(p.qty_precision);
        if (s && price !== undefined && qty !== undefined) c.precision.set(s, { price, qty });
      }
      return;
    }
    if (ch !== "ticker" && ch !== "trade" && ch !== "ohlc" && ch !== "book") return;
    for (const d of list(m.data).map(rec)) {
      const mk = this.named(c, str(d.symbol));
      if (!mk) continue;
      if (ch === "ticker") {
        this.bbo(mk, pos(d.bid), pos(d.bid_qty), pos(d.ask), pos(d.ask_qty), whenMs(d.timestamp), now);
        const last = pos(d.last);
        if (last !== undefined) mk.last = last;
        touch(mk, "quote");
      } else if (ch === "trade") {
        if (this.trade(mk, { price: pos(d.price), size: pos(d.qty), side: d.side === "buy" || d.side === "sell" ? d.side : undefined, at: whenMs(d.timestamp), id: str(d.trade_id), snap: m.type === "snapshot" }, now)) touch(mk, "trades");
      } else if (ch === "ohlc") {
        const [t, o, h, l, cl] = [whenMs(d.interval_begin), pos(d.open), pos(d.high), pos(d.low), pos(d.close)];
        if (t === undefined || o === undefined || h === undefined || l === undefined || cl === undefined) continue;
        const v = nonNeg(d.volume);
        mk.bar = { t, o, h, l, c: cl, ...(v !== undefined ? { v } : {}) };
      } else if (mk.bookOn) {
        const whole = m.type === "snapshot";
        if (!whole && !mk.bookSnapped) continue;
        const side = (rows: unknown): Array<[number | undefined, number | undefined]> => list(rows).map((r) => [pos(rec(r).price), nonNeg(rec(r).qty)]);
        this.levels(mk.bids, side(d.bids), whole);
        this.levels(mk.asks, side(d.asks), whole);
        // the book is kept to the depth subscribed: a level pushed out of it is not sent as gone
        this.trim(mk.bids, true, KRAKEN_DEPTH);
        this.trim(mk.asks, false, KRAKEN_DEPTH);
        const want = num(d.checksum);
        const p = c.precision.get(mk.sym);
        if (want !== undefined && p) {
          const got = krakenChecksum(sideOut(mk.asks, false, 10), sideOut(mk.bids, true, 10), p.price, p.qty);
          if (got !== want >>> 0) {
            // the book here is not Kraken's: sent for afresh (now, or once RESYNC_MS allows), and nothing of it shown meanwhile
            const shown = mk.bookSnapped;
            this.resync(c, mk, now);
            if (shown) touch(mk, "book");
            continue;
          }
        }
        if (whole) mk.bookSnapped = true;
        this.booked(mk, whenMs(d.timestamp), now);
        touch(mk, "book");
      }
    }
  }

  /** OKX: {arg: {channel, instId}, data: [...]} — bbo-tbt, tickers, trades, books5; {event: subscribe | error, ...}; the text pong */
  private okx(c: Conn, raw: unknown, now: number, touch: (mk: Mkt, what: HubTick["what"]) => void): void {
    const m = rec(raw);
    if (typeof m.event === "string") {
      if (m.event === "error") {
        const id = /instId:\s*([A-Za-z0-9-]+)/.exec(String(m.msg ?? ""))?.[1];
        const mk = this.named(c, id);
        if (mk) this.refuse(mk, `OKX: ${String(m.msg ?? "the subscription was refused").slice(0, 160)}`, now);
      }
      return;
    }
    const arg = rec(m.arg);
    const mk = this.named(c, str(arg.instId));
    if (!mk) return;
    const ch = arg.channel;
    for (const d of list(m.data).map(rec)) {
      const ts = whenMs(d.ts);
      const top = (rows: unknown): [number | undefined, number | undefined] => {
        const r = list(list(rows)[0]);
        return [pos(r[0]), pos(r[1])];
      };
      if (ch === "bbo-tbt") {
        const [bid, bidSz] = top(d.bids);
        const [ask, askSz] = top(d.asks);
        mk.tbt = true;
        this.bbo(mk, bid, bidSz, ask, askSz, ts, now);
        touch(mk, "quote");
      } else if (ch === "tickers") {
        const last = pos(d.last);
        if (last !== undefined) mk.last = last;
        // the best bid and ask come tick by tick on bbo-tbt; until its first on this subscription, the ticker's stand
        if (!mk.tbt) this.bbo(mk, pos(d.bidPx), pos(d.bidSz), pos(d.askPx), pos(d.askSz), ts, now);
        else this.stamp(mk, ts, now);
        touch(mk, "quote");
      } else if (ch === "trades") {
        if (this.trade(mk, { price: pos(d.px), size: pos(d.sz), side: d.side === "buy" || d.side === "sell" ? d.side : undefined, at: ts, id: str(d.tradeId) }, now)) touch(mk, "trades");
      } else if (ch === "books5" && mk.bookOn) {
        const side = (rows: unknown): Array<[number | undefined, number | undefined]> => list(rows).map((r) => [pos(list(r)[0]), pos(list(r)[1])]);
        this.levels(mk.bids, side(d.bids), true);
        this.levels(mk.asks, side(d.asks), true);
        mk.bookSnapped = true;
        this.booked(mk, ts, now);
        touch(mk, "book");
      }
    }
  }

  /** a market the venue refused to stream (its words): not live, not asked for again while it is kept — its REST stands for it */
  private refuse(mk: Mkt, why: string, now: number): void {
    mk.refused = why;
    mk.on = false;
    this.forget(mk);
    this.unbook(mk);
    this.flip(mk, now);
  }
}
