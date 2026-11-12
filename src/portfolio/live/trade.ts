/** TRADING at a venue connected live: the markets it lists, an order, and what became of it.
 *
 * Every venue speaks its own language — an exchange's unified library, a broker's REST API, a prediction market's signed orders, a DEX
 * aggregator's transaction for the user's own wallet. This file is the one shape the account sees all of them through:
 *
 *   markets(query)      what can be traded there that matches a few letters
 *   market(symbol)      one market, with a fresh price, the smallest order, the steps of size and price, whether it takes orders now,
 *                       and — a stock — the venue's trading session (in session now, when it next opens or closes)
 *   place(order)        one order, at the venue, with the account's id for it (the venue's idempotency key, where it takes one):
 *                       market, limit, stop (a market order once a trigger price is reached) or stop-limit, with the time in force,
 *                       post-only and reduce-only flags the venue takes in that market
 *   cancel / status     what became of it: open, partly filled, filled, canceled, rejected
 *   amend               an open order changed in place — its size, its limit, its stop — where the venue can
 *   positions / close   what is held there (perpetuals, shares, event contracts), and a position closed at the venue
 *   setLeverage         a perpetual's leverage and margin mode, where the venue lets it be set
 *
 * A trader offers only what its venue really takes: an option a market does not list (`types`, `tifs`, `postOnly`, `reduceOnly`) is
 * refused by the account before the venue is asked, and a method a trader does not have is a door the account says is closed there.
 *
 * Nothing here decides WHETHER an order is placed. The account's door does that (account/live-orders.ts): the server's switch and cap, the
 * owner's signature or the agent's limit, the mode. A trader only speaks the venue's language, and its refusal is the venue's own.
 *
 * Every market is priced in DOLLARS (USD or a dollar stablecoin), so that a cap and a budget mean dollars; a market priced in something
 * else is not offered.
 */
import type { Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { isStable, type MarginMode } from "./types.ts";

export type Side = "buy" | "sell";
/** market · limit · stop (a market order once the price reaches `stopPrice`) · stop_limit (a limit order at `limitPrice` once it does) ·
 * trailing_stop (a stop that follows the price: `trailPercent` or `trailPrice` behind the best price since it was placed) */
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
/** how long an order stays: until canceled · what fills at once, the rest canceled · all at once or nothing · until the session's end */
export type TimeInForce = "gtc" | "ioc" | "fok" | "day";
export const ORDER_TYPES: readonly OrderType[] = ["market", "limit", "stop", "stop_limit", "trailing_stop"];
/** HOW A LARGE ORDER IS WORKED, where the venue works orders (Market.algos — the paper account does; a venue connected live takes none
 * from here): twap — a market order cut into `slices` equal children, one every `minutes / slices` minutes; vwap — the same slices, each
 * sized by the market's own volume at that time of day (its 1-minute bars a day back; equal where it keeps none); iceberg — a limit order
 * that shows `show` units at a time, the next child placed as each fills. The parent is one order with one ref: its fills are its
 * children's, its average theirs; canceled, its open child goes with it and what filled stands. Judged by the venue's own rule, child by
 * child; a transaction-cost analysis (live/tca.ts) is written on the parent as it goes */
export type AlgoKind = "twap" | "vwap" | "iceberg";
export const ALGO_KINDS: readonly AlgoKind[] = ["twap", "vwap", "iceberg"];
export interface AlgoRequest {
  kind: AlgoKind;
  /** twap · vwap: over how many minutes (1 to 1440) and in how many slices (2 to 200) */
  minutes?: number | undefined;
  slices?: number | undefined;
  /** iceberg: how many units each child shows (less than the order's size) */
  show?: number | undefined;
}
/** an algo as it is signed, in one string: "twap 30m 6" · "vwap 30m 6" · "iceberg 0.25"; "" for none. Parsed back by parseAlgo */
export const algoText = (a: AlgoRequest | undefined): string => (!a ? "" : a.kind === "iceberg" ? `iceberg ${a.show}` : `${a.kind} ${a.minutes}m ${a.slices}`);
export function parseAlgo(text: string): AlgoRequest | undefined | string {
  const t = text.trim();
  if (!t) return undefined;
  const m = /^(twap|vwap)\s+(\d{1,4})m\s+(\d{1,3})$/.exec(t);
  if (m) {
    const minutes = Number(m[2]);
    const slices = Number(m[3]);
    if (minutes < 1 || minutes > 1440) return "a twap or a vwap runs over 1 to 1440 minutes";
    if (slices < 2 || slices > 200) return "a twap or a vwap is cut into 2 to 200 slices";
    return { kind: m[1] as AlgoKind, minutes, slices };
  }
  const i = /^iceberg\s+(\d{1,12}(?:\.\d{1,10})?)$/.exec(t);
  if (i) {
    const show = Number(i[1]);
    if (!(show > 0)) return "an iceberg shows a positive size at a time";
    return { kind: "iceberg", show };
  }
  return 'an algo is "twap 30m 6" (over 30 minutes in 6 slices), "vwap 30m 6", or "iceberg 0.25" (0.25 units shown at a time)';
}
export const TIFS: readonly TimeInForce[] = ["gtc", "ioc", "fok", "day"];
export type MarketKind = "spot" | "perp" | "future" | "stock" | "crypto" | "event" | "token";

export interface Market {
  /** the account's name for it — what the owner and an agent type: `BTC/USDT` at an exchange, `AAPL` at a broker, `BTC-USD` at Robinhood
   * Crypto, `KXFED-25DEC-T4.00:YES` at Kalshi, `<token id>` or `<slug>:<outcome>` at Polymarket, `WETH/USDC@Base` from a wallet */
  symbol: string;
  /** a perpetual's margin modes the venue lets be set from here (none listed: the venue sets none per market, so the page offers none) */
  marginModes?: MarginMode[] | undefined;
  /** an entry order may carry its exits here (a BRACKET: `takeProfit` and `stopLoss`, either or both, placed by the venue once the entry
   * fills, one canceling the other) */
  brackets?: boolean | undefined;
  /** the ways the venue works a large order here (AlgoKind; none listed: an order is sent whole) */
  algos?: AlgoKind[] | undefined;
  /** where the 24-hour figures came from when they are not the venue's own documented reading (an exchange library's unified ticker) */
  statsFrom?: string | undefined;
  /** in words */
  name: string;
  kind: MarketKind;
  /** what is bought (BTC, AAPL, one YES contract) and what it is paid in (USDT, USD) */
  base: string;
  quote: string;
  /** what one unit of `base` last traded at, or the middle of the book, in `quote` */
  price?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  /** the smallest order the venue takes, in base units; the step of a size; the step of a price; the smallest order in dollars */
  minQty?: number | undefined;
  qtyStep?: number | undefined;
  priceStep?: number | undefined;
  minNotional?: number | undefined;
  /** a contract (a perp, a future) is this much base */
  contractSize?: number | undefined;
  /** the venue takes orders in it now. An event past its close, a pair or a stock the venue halted does not; a stock outside its session
   * may — Alpaca takes an order at night and holds it for the open, Robinhood sends every stock order for the regular session — so
   * whether the market is in session is `session`, never this */
  open: boolean;
  /** the venue's trading session, where it keeps one (a stock market): in session now, and when it next opens / closes (ISO 8601). Outside
   * it a venue may still take an order and hold it for the open: `open` says whether it takes orders now. From the venue's own clock
   * (Alpaca's GET /v2/clock) or the market calendar the venue sends its orders by (account/calendar.ts); absent where neither said */
  session?: MarketSession | undefined;
  /** why not, or what the owner should know (extended hours, a market order queued for the open) */
  note?: string | undefined;
  /** a perpetual: the leverage set for this market at the venue now, where the venue says it before any position is open (a paper
   * account's: 1x unless set) — what an order would open at */
  leverage?: number | undefined;
  /** the venue's own rule for how an order fills, where it says one for every market (a paper account's: live/paper.ts paperRule) — long,
   * and the same for each market: the ticket folds it under "How it fills here", and a list's line of the market never carries it */
  rule?: string | undefined;
  /** the order types the venue takes here */
  types: OrderType[];
  /** an order type listed here that the market cannot take NOW, and why, in the venue's words — a paper account's US share whose only quote
   * is Cboe's, fifteen minutes behind the market, takes no market order (live/paper.ts: a limit rests until a real-time quote reaches it).
   * The account refuses such an order when it prepares it, with these words (account/live-orders.ts plan) */
  refusesNow?: Partial<Record<OrderType, string>> | undefined;
  /** the times in force it takes here (absent: only its own default, which is not chosen) */
  tifs?: TimeInForce[] | undefined;
  /** where a venue takes a time in force for some order types only (Robinhood: "day" for a crypto stop, not a crypto limit): per type, the
   * ones it takes. A type not named takes all of `tifs` */
  tifsByType?: Partial<Record<OrderType, TimeInForce[]>> | undefined;
  /** a limit order may be post-only here: it rests on the book as a maker, or is refused rather than taking */
  postOnly?: boolean | undefined;
  /** an order may be reduce-only here: it can only shrink a position, never open or grow one */
  reduceOnly?: boolean | undefined;
  /** a sell here can only sell what is held (a prediction market's shares, a cash account's coins): it can never open a short, so a plain
   * sell of what is held closes a long without a reduce-only flag */
  sellsReduce?: boolean | undefined;
  /** the most leverage a perpetual takes here, when the venue says */
  maxLeverage?: number | undefined;
  // ---- what the venue's own listing already says about it (filled only where it does; never estimated) ----
  /** the last 24 hours: the change of the price in percent and in `quote` (an event contract: in dollars per contract, so 0.03 = 3¢), and
   * the value traded, in dollars */
  changePct24h?: number | undefined;
  change24h?: number | undefined;
  volumeUsd24h?: number | undefined;
  /** the last 24 hours' volume where the venue counts it in contracts and not in dollars (Kalshi's `volume_24h_fp`: each pays $1 at
   * settlement) — never turned into dollars */
  contracts24h?: number | undefined;
  /** when it stops trading — an event's close, a dated future's expiry — ISO 8601 */
  closeTime?: string | undefined;
  /** the venue's own category for it, in its own words ("Economics", "Sports", "Crypto") */
  category?: string | undefined;
  /** an event contract's question, which its outcomes share — the venue's id for it (Kalshi's market ticker, Polymarket's condition id) and
   * the question in words — and which outcome this market is ("YES", "NO", a candidate's name). A pre-IPO perpetual's company instead:
   * `preipo:<slug>` and the company's name (live/preipo.ts), which its contracts at every venue share */
  group?: { id: string; title: string } | undefined;
  outcome?: string | undefined;
  /** a perpetual's funding rate per interval (0.0001 = 0.01%) and when it is next paid, ISO 8601 */
  fundingRate?: number | undefined;
  nextFundingAt?: string | undefined;
  /** a perpetual: the hours between two funding payments, where the venue says (Hyperliquid pays every hour: 1) — what makes the rate a
   * day's or a year's, and the next payment after `nextFundingAt` */
  fundingEveryH?: number | undefined;
  /** A PERPETUAL'S OWN PRICES AND DAY, as its venue says them: its MARK, the price positions are valued and liquidated at (Hyperliquid's
   * markPx — not its mid); its ORACLE, the index its funding measures the mark against (oraclePx); its PREMIUM, the venue's own measure of
   * the mark over the oracle that its funding comes from (Hyperliquid's premium: -0.0003749 = −0.0375%); and its OPEN INTEREST, the
   * contracts open now in base units (openInterest) — and that worth at the mark, in dollars (openInterestUsd: the coins times the mark,
   * as Hyperliquid's own page shows it). Each only where the venue says it */
  markPrice?: number | undefined;
  oraclePrice?: number | undefined;
  premium?: number | undefined;
  openInterest?: number | undefined;
  openInterestUsd?: number | undefined;
  /** a token an issuer stands behind (category RWA_CATEGORY, live/categories.ts): who issues it, and whom the issuer says it is not for, in
   * the issuer's own words (dex.ts carries them; a venue that says nothing of it leaves them out) */
  issuer?: string | undefined;
  eligibility?: string | undefined;
  /** a PRE-IPO PERPETUAL (category "Pre-IPO", live/preipo.ts): a contract on the venue's estimate of a private company's valuation, not a
   * share. The venue prices it in a unit of its own — $1 of price for $1,000,000,000 of implied valuation at every venue and instrument but
   * OKX's ANTHROPIC and OPENAI swaps, $10,000,000,000 there since its 10:1 rebase of 30 June 2026 — so `perPoint` is the dollars of valuation
   * one dollar of price stands for, `unit` that rule in words, and `usd` the valuation the price implies now (price × perPoint), where a
   * price is known (a listing's always; a trader's start-from list carries none until the market is read) */
  implied?: { perPoint: number; unit: string; usd?: number | undefined } | undefined;
  // ---- where a stock's price is from, and how old it is ----
  /** the price's own time, ISO 8601 — the last trade or the quote it is, as its source stamps it — where the source stamps one: a paper
   * account fills a stock only at a quote stamped inside a session it trades in (paper.ts) */
  quoteAt?: string | undefined;
  /** how far behind the market the source's price is, in ms (Cboe's delayed file: 15 minutes; 0: real time), where the source says */
  delayMs?: number | undefined;
  /** which source the price came from, in words ("Nasdaq · real time"), where a line reads more than one */
  quoteFrom?: string | undefined;
}

/** a venue's trading session (Market.session): in session now, and when it next opens and next closes, ISO 8601 — each where the venue or
 * the calendar says it */
/** which of a stock market's sessions is on: the regular one, or one the venue trades outside it */
export type SessionPhase = "pre" | "regular" | "after" | "overnight" | "closed";
export interface MarketSession {
  /** the regular session is on */
  open: boolean;
  opensAt?: string | undefined;
  closesAt?: string | undefined;
  /** which session is on now, where the venue trades outside the regular one (Alpaca: pre-market 04:00 to the open, after-hours from the
   * close to 20:00, overnight 20:00 to 04:00 New York time, before a trading day); absent where the venue said only open or closed */
  phase?: SessionPhase | undefined;
  /** when this phase ends (ISO 8601), where known */
  phaseEndsAt?: string | undefined;
  /** a limit order may be sent for THIS session now (Alpaca's extended_hours): the venue trades this market in the session that is on. An
   * order sent without the flag waits for the regular session */
  extendedHours?: boolean | undefined;
}

/** A stock market's clock, as a public source knows it from its calendar (account/calendar.ts): which phase an instant is in — so a
 * quote's own time can be judged, not only now — and when a DAY order placed at an instant ends */
export interface SessionClock {
  /** "New York" */
  city: string;
  zone: string;
  /** the phase at `ms` */
  phaseAt(ms: number): SessionPhase;
  /** the end of the trading day a DAY order placed at `ms` is for — that day's close while it is open or before it, the next market day's
   * after it — or, `extended`, the end of that day's last extended session */
  dayEndAt(ms: number, extended: boolean): number;
}

/** a market's last 24 hours, as the venue reports it */
export interface MarketStats {
  price?: number | undefined;
  changePct24h?: number | undefined;
  change24h?: number | undefined;
  volumeUsd24h?: number | undefined;
  high24h?: number | undefined;
  low24h?: number | undefined;
  /** where these figures came from when not the venue's own documented reading (see Market.statsFrom) */
  statsFrom?: string | undefined;
}

/** ONE MARKET'S ORDER BOOK, as its source gives it: the price levels people are bidding and offering at, each with the size resting there.
 * Prices in the market's quote (an event contract's in dollars per contract: 0.62 = 62¢), sizes in the units an order is sized in there —
 * coins, shares, contracts (a contract market's contracts, `contractSize` each) — best first: the highest bid first, the lowest ask first.
 * Every level is the source's own; none is made up, filled in or spread out. `depth` says how much of the book the source gives:
 *   full   its own levels, as many as were asked (up to fifty a side) and it holds
 *   top    only its best bid and its best ask — the source publishes no depth (a US stock's public quote) — and a size only where it gives
 *          one (null where it does not) */
export interface OrderBook {
  bids: Array<[price: number, size: number | null]>;
  asks: Array<[price: number, size: number | null]>;
  /** when the source stamped the book (ISO 8601), else when it was read */
  at: string;
  /** whose book it is, in words: the venue's name, or the source a stock's quote came from ("Nasdaq · real time") */
  from: string;
  depth: "full" | "top";
  /** a "full" book's sides that may go on past their last level: the source sent as many levels as it was asked for, or as many as it ever
   * sends (Hyperliquid twenty), or more than the depth asked and the rest were cut off here. A side marked false came back shorter than all
   * that — the source sent every level it holds. Grouped prices at the far end of a side that may go on hold only the levels that were read
   * of that range (the page says so of that row). Absent: not known, and taken as may go on */
  more?: { bids: boolean; asks: boolean } | undefined;
  /** why a "top" book is only the best bid and ask: `none` — its source publishes no depth at all (a US stock's public quote) — or `unread`
   * — the source has a book the account does not read (an exchange's pre-IPO contract, xStocks at Gate, a venue connected whose trader
   * reads no book). Absent: taken as `unread` */
  topOnly?: "none" | "unread" | undefined;
  /** a "top" book whose quote carries no time of its own and came from a list kept a while (a public listing: up to a hundred and ten
   * seconds — its source keeps the quote ninety, the service the listing twenty more — and a paper account's market three more): how old the
   * quote may be at most, in ms — `at` is then when it was read here, not when it was quoted */
  upToMs?: number | undefined;
}

/** One trade that happened in a market, as its source publishes it: the price, the size (in the units of its book), the side of the order
 * that took it — `buy` when a buyer took an offer, `sell` when a seller took a bid — only where the source says which side took, and when */
export interface PublicTrade {
  price: number;
  size: number;
  side?: Side | undefined;
  at: string;
}

/** THE BAR SIZES OF A PRICE HISTORY (feat/paper-live phase H): a minute, five, fifteen, an hour, four hours, a day, a week. A source that
 * publishes no bar of a size folds it from its own finer real bars (live/history.ts foldBars: 4h from 1h, 1w from 1d, Monday weeks) and says
 * so; nothing is ever made up between them */
export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
export const CANDLE_INTERVALS: readonly CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
/** how long a bar of each size lasts, in ms (a week is seven days, whatever the day it starts on) */
export const INTERVAL_MS: Readonly<Record<CandleInterval, number>> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 };
/** THE RANGES a chart is asked for, as a trading screen names them: a day, five, a month, three, six, the year so far, a year, five, all of it */
export type CandleRange = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";
export const CANDLE_RANGES: readonly CandleRange[] = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"];
/** the most bars one ask of a history gives: a view that would hold more is given the latest this many, and scrolling left pages the rest
 * (about ten Binance-sized calls, the crypto report's first-view budget: history-sources.md) */
export const HISTORY_MOST = 5_000;
/** one bar of price history: its start (ms), open, high, low, close, and the volume when the venue says, in base units */
export interface Candle { t: number; o: number; h: number; l: number; c: number; v?: number | undefined }

/** THE STRETCH OF TIME a price history is asked for. A chart's first view asks a range's start (`since`) and HISTORY_MOST bars at most; a
 * chart scrolled left asks the page before the first bar it has (`until`, no `since`) */
export interface CandleWindow {
  /** the first bar wanted starts at or after this (ms). Absent: ONE page of the source's own — one request, the latest bars before `until` —
   * which is what a chart scrolled left asks, so each scroll costs the venue one request */
  since?: number | undefined;
  /** every bar given starts before this (ms). Absent: now, the bar still forming included */
  until?: number | undefined;
  /** at most this many bars, the latest where more lie in the window (HISTORY_MOST at most; a page: the source's own page at most) */
  limit?: number | undefined;
  /** the view was asked as a range (`since` is that range's start on the calendar): a source whose market keeps sessions may count it in
   * them — a US stock's 1D is its latest session, its 5D the latest five — and a source that keeps only so many bars at a size draws the
   * range in a coarser one rather than a part of it (Hyperliquid's latest 5,000) */
  range?: CandleRange | undefined;
  /** the venue's OWN bars only, never another venue's drawn in their place: a paper account judging the time it slept against its market's
   * listing source alone (live/paper.ts catchUp) — where a chart of a Kraken pair is drawn from a venue with a longer history, this asks
   * Kraken's own (live/public-markets.ts). Every other source draws only its own anyway */
  own?: true | undefined;
}

/** A PAGE OF A PRICE HISTORY, as a source that pages says it: the bars, whether older ones exist, and, where the history ends inside what was
 * asked, why — in words the chart shows at that edge. A source that says none of it answers a plain list of bars (live/history.ts pageOf) */
export interface CandlePage {
  /** oldest first */
  bars: Candle[];
  /** older bars exist before the first one: the next page is asked with `until` set to the first bar's start */
  more: boolean;
  /** the answer stops short of what was asked for a reason other than the history: a page older than the ones answered was refused, or
   * did not answer, so the bars may not reach the window's start (`more` is said too). A chart draws them; whoever must see the whole window
   * — the paper account judging the time it slept (live/paper.ts catchUp) — does not take them */
  partial?: true | undefined;
  /** where the history ends, when it ends inside what was asked, in a sentence: "Coinbase Exchange's BTC-USD history starts Mon 20 Jul 2015",
   * "Hyperliquid keeps only the latest 5,000 bars at this size", "Intraday history starts …" */
  ends?: string | undefined;
  /** the bars' own size, where the source drew them coarser than asked (Hyperliquid's latest 5,000 bars do not reach the range's start),
   * and why, in a sentence the chart shows beside them */
  interval?: CandleInterval | undefined;
  note?: string | undefined;
  /** whose bars these are, in words: the venue and its market ("Coinbase Exchange · BTC-USD", "Robinhood · AAPL") */
  source?: string | undefined;
  /** what the prices are adjusted for, where a source adjusts them (US stocks: "split-adjusted, not dividend-adjusted") */
  adjustment?: string | undefined;
  /** which hours the bars cover, where a market keeps sessions ("pre-market, regular and after-hours, 04:00–20:00 New York · no overnight
   * data", "regular session only") */
  session?: string | undefined;
  /** the bars were folded from finer real bars of the same source, in words ("4h bars folded from 1h bars") */
  folded?: string | undefined;
  /** stretches inside the bars where the source has none, said and never filled: [from, to) ms and why ("No overnight data") */
  gaps?: Array<{ from: number; to: number; why: string }> | undefined;
  /** the last bar is not the source's own daily bar but built from its intraday bars of a session the daily bars do not have yet: its start,
   * and the words it carries ("Today so far") */
  today?: { t: number; words: string } | undefined;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  type: OrderType;
  /** in base units: coins, shares, contracts */
  qty: number;
  limitPrice?: number | undefined;
  /** a MARKET order: the worst price it may fill at — the most a buy pays, the least a sell takes, per unit. The trader keeps the fill
   * inside it (a marketable limit order that fills at once or not at all, a maximum cost, an aggregator's minimum out); a venue that has no
   * way to bound a market order is sent the limit order instead */
  worstPrice?: number | undefined;
  /** the account's id for this order: the venue's idempotency key where it takes one, so a retry is the same order and not a second one.
   * Thirty-two lower-case hex digits, new for every order in every run of the account */
  clientId: string;
  /** a stop or stop-limit order: the price that triggers it (a buy stop when the price rises to it, a sell stop when it falls to it). A STOP
   * order also carries `worstPrice`: where the venue can, the trader bounds its fill there (a stop-limit at that price) */
  stopPrice?: number | undefined;
  /** only when the market lists it in `tifs`; absent: the venue's own default */
  tif?: TimeInForce | undefined;
  /** only for a limit order, and only where the market says `postOnly` */
  postOnly?: boolean | undefined;
  /** only where the market says `reduceOnly` */
  reduceOnly?: boolean | undefined;
  /** a limit order for the extended session that is on (pre-market, after-hours, overnight): only where the market's session says
   * `extendedHours`, and only a limit order (Alpaca takes nothing else there) */
  extendedHours?: boolean | undefined;
  /** a TRAILING STOP: how far behind the best price since it was placed its stop follows — in percent, or in the market's quote (one of the
   * two) */
  trailPercent?: number | undefined;
  trailPrice?: number | undefined;
  /** a BRACKET's exits, where the market says `brackets`: once this order fills, a limit order the other way at `takeProfit` and a stop the
   * other way at `stopLoss` (either or both), the one that fills canceling the other */
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  /** how the order is worked, where the market lists the kind in `algos`: a twap or a vwap on a market order, an iceberg on a limit */
  algo?: AlgoRequest | undefined;
}

/** an open order changed in place: what changes, as the venue would take it (the rest stays) */
export interface OrderChange {
  qty?: number | undefined;
  limitPrice?: number | undefined;
  stopPrice?: number | undefined;
}

/** something held at a venue: a perpetual's position, shares, event contracts */
export interface Position {
  symbol: string;
  name: string;
  kind: MarketKind;
  side: "long" | "short";
  /** in base units, as orders are sized there (contracts for a perpetual) */
  qty: number;
  entryPrice?: number | undefined;
  markPrice?: number | undefined;
  /** what it is worth now, in dollars */
  usd?: number | undefined;
  unrealizedUsd?: number | undefined;
  leverage?: number | undefined;
  marginMode?: "cross" | "isolated" | undefined;
  liquidationPrice?: number | undefined;
  /** what was paid for it in dollars, fees in it, where the venue keeps that (a paper account's book) */
  costUsd?: number | undefined;
  /** a perpetual's margin: what the venue holds against the position now, in dollars, where it says (a paper account's isolated margin,
   * Hyperliquid's marginUsed) */
  marginUsd?: number | undefined;
  /** a perpetual's funding since it opened, in dollars: above zero the position paid it, below zero it received it — only where the venue
   * keeps it with a sign it documents (a paper account's book) */
  fundingUsd?: number | undefined;
  native: unknown;
}

/** WHAT AN ORDER WOULD LEAVE by the venue's own rule, said before the order where the venue keeps a rule it can say then (a paper account's
 * book: its fee, and a perpetual's liquidation price once the order has opened or added to the position at the leverage set there, under the
 * same rule its looks liquidate by). Nothing here is estimated from outside the venue's rule: a venue that says nothing before an order has
 * no `estimate`, and a figure it cannot say is absent */
export interface OrderEstimate {
  /** the fee the order would pay at `price`, in dollars, and that fee's rate in basis points of the notional */
  feeUsd?: number | undefined;
  feeBps?: number | undefined;
  /** a perpetual: the liquidation price of the position as the order would leave it (absent: no position left, or one that cannot be
   * liquidated — a long whose margin covers the whole notional), and the leverage it would stand at */
  liquidationPrice?: number | undefined;
  leverage?: number | undefined;
  /** why the venue's own rule would refuse the order now, in words — what open orders hold of the cash or the holding, a book that does not
   * hold a market order's size within its worst price — so the account says it before anything is signed */
  refuses?: string | undefined;
  /** what that refusal is for want of, where it is for want of one thing a reader can act on — "money": the venue has not the buying power
   * (cash, or margin) for the order now. Absent on every other refusal (a sell of what is not held, a book too thin). The desk reads it: a
   * lead its venue has no money for stops the scanning until the venue has more (account/desk.ts) */
  lacks?: "money" | undefined;
  /** what else the order would do, in words (a close of a whole holding: the open sells on it canceled with it) */
  note?: string | undefined;
}

/** `pending`: taken by the venue, not yet on its book (or, from a wallet, waiting for the wallet to send it) */
export type OrderStatus = "pending" | "open" | "partial" | "filled" | "canceled" | "rejected" | "expired";
export const DONE: ReadonlySet<OrderStatus> = new Set(["filled", "canceled", "rejected", "expired"]);

export interface OrderState {
  /** the venue's own id for the order */
  ref: string;
  status: OrderStatus;
  /** in base units */
  filledQty: number;
  avgPrice?: number | undefined;
  feeUsd?: number | undefined;
  /** the venue's own answer, with nothing secret in it */
  native: unknown;
  /** a DEX order from a wallet: the transaction(s) the wallet is asked to send, in order (an approval first, when one is needed) */
  walletTxs?: Array<{ chainId: number; chainIdHex: `0x${string}`; from: `0x${string}`; to: `0x${string}`; data: `0x${string}`; value: `0x${string}`; /** the gas the route needs, when the venue says: the wallet is given it */ gas?: `0x${string}` | undefined; what: string }> | undefined;
}

/** ONE FUNDING PAYMENT on a perpetual position (LiveTrader.funding): when (ISO 8601), the market, the position's side and size then, the
 * price it was settled at where the venue says (the oracle at Hyperliquid), the rate, and the dollars — paid out of the position (above
 * zero) or received (below). `quoted`: the rate was the one the quote carried, the venue's own history not having said it (a paper
 * account's) */
export interface FundingLine {
  at: string;
  symbol: string;
  side?: "long" | "short" | undefined;
  qty?: number | undefined;
  price?: number | undefined;
  rate?: number | undefined;
  usd: number;
  quoted?: true | undefined;
}

export interface LiveTrader {
  /** may this key or sign-in trade here: what the venue said, `unknown` where it has no call that says (its first refusal will) */
  can: boolean | "unknown";
  /** why it may not, in the venue's terms, when `can` is false (a key without the trading permission; no Agentic account) */
  whyNot?: string | undefined;
  /** what is traded here, in a few words: "spot and perpetuals", "US stocks and ETFs", "event contracts" */
  what: string;
  /** the kinds of market traded here, where the trader says them itself (the mm trader: tokens, event contracts, perpetuals); absent: the
   * account reads them from the connector the owner signed (accounts.ts tradeKinds) */
  kinds?: MarketKind[] | undefined;
  /** a few markets to start from (query empty), or the ones matching a query; about 20 — an exchange's start-from list carries its pre-IPO
   * perpetuals too, after the well-known markets, so that Markets groups them with the public venues' (exchange-trade.ts) */
  markets(query: string): Promise<Market[] | Refusal>;
  /** one market, with a fresh price */
  market(symbol: string): Promise<Market | Refusal>;
  place(order: OrderRequest): Promise<OrderState | Refusal>;
  cancel(ref: string, symbol: string): Promise<OrderState | Refusal>;
  status(ref: string, symbol: string): Promise<OrderState | Refusal>;
  /** a wallet's DEX order: the account hears which transaction the wallet sent (the last one); `expected` is the transaction the account
   * built, so the trader can check on chain that the hash is that transaction and not another one; it asks the chain from then on */
  sent?(ref: string, hash: `0x${string}`, expected?: NonNullable<OrderState["walletTxs"]>[number]): Promise<OrderState | Refusal>;
  /** a wallet's DEX order whose approval is now on chain: the swap built again from a fresh quote, held to the same order (its size, side and
   * worst price), so a slow approval does not leave the wallet a stale swap that reverts */
  requote?(order: OrderRequest): Promise<OrderState | Refusal>;
  /** an open order changed in place where the venue can (Alpaca's replace, an exchange's edit, Kalshi's amend). `order` is the order as it
   * was placed, `change` what is to differ. The answer is the order as it stands after: its ref may be new (a replace is a new order) */
  amend?(ref: string, symbol: string, change: OrderChange, order: OrderRequest): Promise<OrderState | Refusal>;
  /** what is held here, where the venue lists positions */
  positions?(): Promise<Position[] | Refusal>;
  /** THE FUNDING ITS PERPETUALS PAID AND RECEIVED, hour by hour, newest first — `limit` lines at most, none from before `since` (ms) where
   * said — where the venue lists it: a paper account's book, Hyperliquid's userFunding for the account's address */
  funding?(o: { limit: number; since?: number | undefined }): Promise<FundingLine[] | Refusal>;
  /** a position closed by the venue's own call (Alpaca's DELETE /positions); absent: the account closes it with a reduce-only market order */
  close?(symbol: string, qty: number, clientId: string): Promise<OrderState | Refusal>;
  /** what an order of `qty` at `price` would leave by the venue's own rule (OrderEstimate: its fee, a perpetual's liquidation price, and
   * whether the rule would refuse it now), where the venue keeps one it can say before the order; absent where it does not. Its type, its
   * limit, stop and worst prices where the order has them; `close`: the order is a close of the whole position (LiveTrader.close) */
  estimate?(o: { symbol: string; side: Side; qty: number; price: number; reduceOnly?: boolean | undefined; type?: OrderType | undefined; limitPrice?: number | undefined; stopPrice?: number | undefined; worstPrice?: number | undefined; close?: boolean | undefined }): Promise<OrderEstimate | Refusal>;
  /** a perpetual's leverage, and its margin mode where the venue lets it be set */
  setLeverage?(symbol: string, leverage: number, marginMode?: "cross" | "isolated"): Promise<{ leverage: number; marginMode?: "cross" | "isolated" | undefined; native: unknown } | Refusal>;
  // ---- reading the market (no order, nothing signed) ----
  /** the last 24 hours of many markets in one call where the venue has one: by symbol. `symbols` absent: the venue's well-known markets */
  stats?(symbols?: string[]): Promise<Map<string, MarketStats> | Refusal>;
  /** event contracts, each carrying its `group` (the question), `closeTime` and `category`: the open ones, in one category when asked,
   * closing within `closingWithinMs` when asked, at most `limit`, most traded first */
  events?(o: { category?: string | undefined; closingWithinMs?: number | undefined; limit: number }): Promise<Market[] | Refusal>;
  /** price history in a window (CandleWindow: a first view's range, or one page before the first bar a chart has), oldest first: a page
   * that says whether older bars exist and where the history ends (CandlePage), or a plain list where the venue says nothing of it */
  candles?(symbol: string, interval: CandleInterval, window: CandleWindow): Promise<Candle[] | CandlePage | Refusal>;
  /** whose prices a market's history and book are, where that is not the venue's own: a paper account's market's public source ("Kraken",
   * "US stocks"); absent, the venue's own */
  pricesFrom?(symbol: string): Promise<string | undefined>;
  /** the market's order book, `depth` levels a side at most (1 to 50), best first; a venue that publishes none has no `book` (a paper
   * account's answers from its market's public source, and says so where that source has none) */
  book?(symbol: string, depth: number): Promise<OrderBook | Refusal>;
  /** the market's latest trades, newest first, `limit` at most (1 to 100) */
  trades?(symbol: string, limit: number): Promise<PublicTrade[] | Refusal>;
}

// ---- sizes and prices ------------------------------------------------------------------------------

/** a market priced in dollars: the only kind the account trades, so that every limit means dollars */
export const inDollars = (quote: string): boolean => quote.toUpperCase() === "USD" || isStable(quote);

const decimals = (step: number): number => {
  if (!(step > 0)) return 8;
  const s = step.toExponential();
  const [m, e] = s.split("e");
  const frac = (m!.split(".")[1] ?? "").length;
  return Math.max(0, frac - Number(e));
};

/** down to the step (never up: an order is never bigger than asked), with no binary dust */
export function floorTo(x: number, step: number | undefined): number {
  if (!(step && step > 0)) return x;
  const n = Math.floor(x / step + 1e-9);
  return Number((n * step).toFixed(decimals(step)));
}

/** up to the step (a sell's worst price is never looser than asked) */
export function ceilTo(x: number, step: number | undefined): number {
  if (!(step && step > 0)) return x;
  const n = Math.ceil(x / step - 1e-9);
  return Number((n * step).toFixed(decimals(step)));
}

/** is `x` a whole number of steps */
export function onStep(x: number, step: number | undefined): boolean {
  if (!(step && step > 0)) return true;
  return Math.abs(x / step - Math.round(x / step)) < 1e-6;
}

/** a number as a venue wants it in JSON: plain decimal, never 1e-7 */
export function plain(x: number, places = 10): string {
  if (!Number.isFinite(x)) return "0";
  const s = x.toFixed(places);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** what an order of `qty` is worth at `price`, in dollars */
export const notionalOf = (m: Pick<Market, "contractSize">, qty: number, price: number): number => qty * price * (m.contractSize ?? 1);

/** the market's own words for an order that it cannot take as written */
export function badOrder(venue: string, name: string, message: string, detail?: Record<string, unknown>): Refusal {
  return no("E_VENUE_ORDER_INVALID", { venue, message: `${name}: ${message}`, ...(detail ? { detail } : {}) });
}

/** a few markets out of many: the ones whose symbol or name starts with the query first, then the ones that contain it */
export function pick<T extends { symbol: string; name: string }>(all: T[], query: string, max = 20): T[] {
  const q = query.trim().toUpperCase();
  if (!q) return all.slice(0, max);
  const starts = all.filter((m) => m.symbol.toUpperCase().startsWith(q) || m.name.toUpperCase().startsWith(q));
  const has = all.filter((m) => !starts.includes(m) && (m.symbol.toUpperCase().includes(q) || m.name.toUpperCase().includes(q)));
  return [...starts, ...has].slice(0, max);
}
