/** A PAPER ACCOUNT the account keeps itself (the connector live:paper): paper dollars, every market the public sources list, fills by the
 * account's own declared rule, a book in the home. Nothing to connect, so it is the account's way in for someone with no wallet, no
 * exchange account and no key: the first flight, with every door, limit, card and statement line the real thing has, and no money. It is
 * the account's own paper broker, as Alpaca's paper account is Alpaca's: US shares in every session the public quotes cover — pre-market,
 * the regular session, after-hours, overnight — coins and perpetuals around the clock, event contracts until they settle.
 *
 * What it is made of:
 *   prices    the public market data Markets reads without a key (public-markets.ts: the exchanges' tickers, Hyperliquid's perpetuals,
 *             Kalshi's, Polymarket's and Polymarket US's event contracts, Robinhood's Stock Tokens, xStocks at Gate and Ondo Stocks
 *             (public-rwa.ts), US stocks (public-stocks.ts: real-time quotes where a public source gives them, Cboe's delayed file
 *             behind them), the pre-IPO perpetuals). A market is listed here under the symbol its source lists it by (`BTC/USD` from
 *             Coinbase, `BTC-PERP` from Hyperliquid, `AAPL`, a Kalshi ticker); where two sources list the same symbol, the first in the
 *             sources' order speaks for it — the US stock line before Robinhood's Stock Tokens, so `NVDA` here is the share, not the token;
 *             and a coin pair COINBASE's where Coinbase lists it, else Kraken's, else OKX's (paperOrder: Coinbase's deep history, its keyless
 *             ticker with the best bid and ask). A market the book has traded is its source's alone: when that source does not answer, the
 *             market has no quote, and no other source's market of the same symbol stands in for it (a BTC/USD bought at Kraken stays
 *             Kraken's). A quote is, FIRST, the market's own venue's live stream (live/stream-hub.ts: Coinbase, Kraken, OKX, Hyperliquid —
 *             the best bid and ask of this moment, the last trade, a perpetual's mark and funding) while it is live, over the listing its
 *             source last gave (what the market is: its name, its steps, its leverage, whether it takes orders); else the source's listing
 *             as the service and the source keep it, as old as the moment its venue answered. Every quote says its moment (quoteAt — the
 *             moment the stream last confirmed it, a stock's own stamp, else when its venue answered, public-markets.ts readAtOf) and where
 *             it came from (quoteFrom: "Coinbase · live", "Kraken · order book", the source), and a stock's carries its source's delay too
 *   orders    market, limit, stop (a market order once the price reaches the stop), stop-limit (a limit order once it does) and trailing
 *             stop (a stop a percent or a price behind the best price since it was placed, moving with it) — an event contract takes
 *             market and limit orders only; a time in force of good-till-canceled, immediate-or-cancel or fill-or-kill (the same thing
 *             here: nothing fills in part — a market order of anything but a stock takes fill-or-kill alone, so it never promises a part
 *             filled), and for a stock DAY, which ends with the market's session (the regular one's close, or the
 *             extended one's for an order sent for extended hours), a stock's default; and a BRACKET: an entry with its exits, a
 *             take-profit limit and a stop-loss stop placed the moment it fills, the one that fills canceling the other. Exits go with
 *             their position: canceled once it is closed, sold, liquidated or settled (on a perpetual, every reduce-only order with them),
 *             and one larger than what is left closes what is left
 *   fills     the account's OWN RULE, said everywhere it shows: a market order fills at once, whole, at the ask (a buy) or the bid (a sell)
 *             — a size the best level does not hold WALKS THE BOOK, level by level, at the average of what it took (the stream's book, or
 *             the order book its source gives, read for it — the source's own where the stream's top levels do not hold it), and one the
 *             book does not hold within the worst price the account's door gave it fills nothing (no partial fills), nor one whose source
 *             has a book that did not answer — inside that worst price; a COIN OR A PERPETUAL fills, triggers and rests only at a bid and
 *             an ask at most FILL_FRESH_MS old: its stream's, else its source's order book read now (as old as BOOK_FRESH_MS from when its
 *             venue answered), else nothing, and the order is refused (or waits) saying why — a listing that gives the last trade only
 *             (Coinbase's, Hyperliquid's mid) is no such price; a market whose source has neither a stream nor a book (a pre-IPO venue's
 *             contract) fills at its listing, whose age the fill says. A limit order that crosses the quote when it is placed fills at
 *             once at the
 *             quote (where that is better than its limit), one that rests fills at its limit when the quote reaches it (a bracket's
 *             take-profit beyond its entry's fill rests from the moment it is placed; a stock's rest lasts the session it rested in, and
 *             no further) — and one that never rested (past the quote the moment
 *             it was changed, triggered, placed as a bracket's exit after a gap, or let back into its session or out of a halt) takes the
 *             quote as one crossing when placed does; a stop triggers when the bid (a sell) or the ask (a buy) reaches
 *             it. A market its source says takes no orders now (a halt, a contract no longer active) fills nothing. Resting orders are judged
 *             ON EACH TICK of their market's live stream (onTick: that market's orders only, against the quote of that moment AND the
 *             highest and lowest trade since each was last judged — a stop the price touched between two quotes has triggered, and fills at
 *             its stop or past it where the price is past it now; a resting limit the trades reached fills at its limit), and whenever the
 *             account looks — a read, a poll, the positions, and the service's own look every few seconds, the sweep that ends days, pays
 *             funding, settles events and, after the machine slept — or the service was not running: the book keeps when it was last looked at
 *             (lookedAt) — judges the time it slept against its markets' own real bars, one-minute ones where they reach back to it, and only
 *             where they cover the whole of it (catchUp); a market whose bars do not come back whole is owed that time, judged at no quote
 *             meanwhile and asked again at the next look, and no tick of the streams judges anything while the time asleep is unjudged. No
 *             partial fills, no queue. What an open order may need is HELD (P1): a buy's cash at its price (its limit, its
 *             stop, its worst) with its fee, a perpetual's margin and fee where it would open or add, a plain sell's units of the holding —
 *             an order whose need is not free is refused when it is placed, and a fill takes nothing another open order holds.
 *             A STOCK fills only at a REAL-TIME quote (Robinhood's or Nasdaq's: never Cboe's, fifteen minutes behind the market — a
 *             market order whose only quote is Cboe's is refused, saying so, and the market says it before the order is prepared:
 *             Market.refusesNow; a limit waits for a real-time quote) stamped inside a session the order trades in, while its market is in
 *             that session as its source sees it: the regular session for every order; pre-market, after-hours and overnight (New York)
 *             for a limit order sent for extended hours where the market's session takes one. An order placed now takes a real-time quote
 *             as old as the US line takes one (us-quotes.ts FRESH_MS); an open order — a resting limit, a stop, a trailing stop, a market
 *             order queued for its session — is judged only at one STOCK_JUDGE_MS old at most, and on each word of the US shares'
 *             background reader (us-quotes.ts UsQuoteFeed: Robinhood read as it writes, Nasdaq beside it) as the venues' streams' ticks
 *             judge a coin's. A quote older than its source's delay and QUOTE_GRACE_MS fills nothing. A share the book knows is priced by
 *             its line alone (PublicSource.line: one GET of Cboe at most, never a search of its ticker). A market order out of the session
 *             is QUEUED for it (as a broker holds
 *             one for the open), and at its session's first real-time quote fills inside the worst price signed, taken afresh from that
 *             quote but never past the signed one — an open past it cancels it, nothing filled; one sent immediate-or-cancel is canceled
 *             instead; stops on a stock are watched in the regular session
 *             only. Charges: a US share none (no commission, as a broker charges none); everything else `feeBps` of the notional (0.10%)
 *   holdings  a coin, a token, a share or an event contract bought is held and sold only as far as it is held (no shorting them, no
 *             margin on them). A PERPETUAL is a position, long or short, with ISOLATED margin at
 *             the leverage set for the market (1x unless set, up to the most the market's source shows): the notional over the leverage
 *             is put up as margin, the unrealised profit is marked at the quote, a close (reduce-only, or the opposite side up to the
 *             position) realises it; the side is never flipped by one order. The margin is all a position can lose: a close past it gives
 *             nothing back and takes nothing from the cash, and a part closed past its own share of the margin takes the rest of its loss
 *             out of the margin of what is left. Each look marks the perpetuals before it judges the orders.
 *             FUNDING is paid or received out of the margin each whole hour the position stands, at the rate the source shows when the
 *             account looks, or when an order fills on the position before it moves it (Hyperliquid's rate is hourly; another venue's is
 *             for its eight-hour interval, so an eighth of it an hour), on
 *             the notional at the mark, the long paying when the rate is above zero; a market whose source shows no rate pays none.
 *             LIQUIDATION: when the margin left — the margin put up, less the loss and the funding paid — falls to the maintenance margin,
 *             half the initial margin at the market's most leverage (the notional at the mark over twice that leverage), the position is
 *             closed at the mark — a mark fresh enough to fill at, as every fill's price is (its venue's mark on its live stream, the middle
 *             of an order book read now; never a listing minutes old, never the book's last kept price), its source and age said — what is
 *             left of the margin after the fee goes back to cash, and the fill says "liquidated". At 1x a long
 *             cannot be liquidated; a short at 1x is, once the price has risen by a third (as at a venue that keeps that rule).
 *             An EVENT CONTRACT is marked at its price and, once its venue says the market has settled (public-markets.ts `settlement`),
 *             paid out at what its venue paid — $1 a contract to the side that won, nothing to the other — and taken off the book; a
 *             market that has closed and not settled is said to be waiting. A venue that does not say settlements never settles here
 *   the book  <home>/paper/<venue>/book.json, the user's alone (0600), rewritten atomically (a temp file renamed into place): before the
 *             owner's own instruction is answered; within FILL_SAVE_MS of a fill the stream or a look found (written in the background,
 *             never blocking the next tick), within TRAIL_SAVE_MS of a trailing stop's move; a look's change before the look ends. In it:
 *             cash, holdings (with what they cost), positions (with their leverage and the funding paid), the leverage set per market, every
 *             order that filled (the book's past is told again from them, paper-history.ts) — one closed with nothing filled (canceled,
 *             expired, rejected) more than PRUNE_AFTER_MS ago goes to the month's archive beside it, orders-YYYY-MM.json — the last 500 fills (a settlement, a liquidation and a
 *             bracket's exit are fills with a note), the funding settled hour by hour, the paper money its owner added, and each traded
 *             market's source. Connecting the same venue id again continues the book (the connect form says so first); another id is
 *             another account — several can be open at once, each its own venue. Its OWNER runs it, each by a signature
 *             (account/exchange.ts): paper money added to its cash (topUpPaper: written as put in, never a gain), or the account started
 *             again with a new sum (resetPaper: the book as it stands archived beside it as book-<the moment>.json, never deleted, and a
 *             new one in its place under the same id, its order numbers going on)
 *
 * The source says `paper: true` (types.ts): its balance is not money, its orders are rehearsals the door holds to the owner's signature or
 * an agent's limit and not to the server's cap, Markets keeps its line after every real venue's, the comparison leaves it out.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import type { AssetClass } from "../accounts.ts";
import { no } from "../refuse.ts";
import { coarserThan } from "./history.ts";
import { readAtOf, type Listing, type PublicSource } from "./public-markets.ts";
import { usClock } from "../account/calendar.ts";
import { CBOE_DELAY_MS, cboeQuoteInSession, US_STOCKS_ID, usLineAt, usSession } from "./public-stocks.ts";
import type { HubQuote, HubRange, HubTick, MarketHub } from "./stream-hub.ts";
import { FRESH_MS as US_FRESH_MS } from "./us-quotes.ts";
import { badOrder, CANDLE_INTERVALS, ceilTo, floorTo, HISTORY_MOST, INTERVAL_MS, inDollars, onStep, pick, type Candle, type CandleInterval, type CandlePage, type LiveTrader, type Market, type MarketKind, type MarketStats, type OrderBook, type OrderEstimate, type OrderRequest, type OrderState, type OrderStatus, type OrderType, type Position, type SessionPhase, type Side, type TimeInForce } from "./trade.ts";
import { isStable, type LiveBalance, type LiveSource, type PaperControls, type PaperEvents } from "./types.ts";

export const PAPER_DEFAULT_CASH = 10_000;
export const PAPER_MAX_CASH = 100_000_000;
export const PAPER_FEE_BPS = 10;
/** how long one source has to answer a listing */
const SOURCE_MS = 4_000;
const LIST_LIMIT = 40;
const FILLS_KEPT = 500;
/** the funding settlements kept in the book, hour by hour: a year of one position */
const FUNDING_KEPT = 10_000;
export const DEFAULT_QTY_STEP = 0.000001;
const HOUR = 3_600_000;
/** how often an event market the account holds is asked whether it has settled: every minute once past its close, every ten before it
 * (a market may settle early) */
const SETTLE_AFTER_CLOSE_MS = 60_000;
const SETTLE_BEFORE_CLOSE_MS = 600_000;
/** an hour of funding is settled at the rate its source's history says (Hyperliquid's fundingHistory), waited for this long after the hour
 * — the venue writes it a moment after — before it is settled at the rate the quote carries instead; the history asked again at most this
 * often while it does not say it; and each market's last this many hours of rates kept in memory */
const RATE_WAIT_MS = 60_000;
const RATES_AGAIN_MS = 10_000;
const RATES_KEPT = 2_000;
/** the sources whose funding rate is hourly (Hyperliquid's); another perpetual venue's rate is for an eight-hour interval */
const HOURLY_FUNDING = /^hyperliquid/;
/** how much older than its source's own delay a stock's quote may be and still fill: a quote that stopped moving (a halt, a feed gone
 * quiet, the last trade of a session hours ago) fills nothing. A last-trade stamp of a quiet share can be minutes old in session */
const QUOTE_GRACE_MS = 15 * 60_000;

const FUNDING_INTERVAL_HOURS = 8;
const DAY = 86_400_000;
/** a coin's or a perpetual's fill uses a price at most this old: its stream's, else its source's order book read for it */
export const FILL_FRESH_MS = 1_000;
/** A US SHARE'S OPEN ORDER — a resting limit, a stop, a trailing stop, a market order queued for its session — is judged only at a
 * real-time quote at most this old by its own stamp (Robinhood's "unchanged since", Nasdaq's last trade): never Cboe's, fifteen minutes
 * behind. An order placed now takes any real-time quote the US line takes as one (us-quotes.ts FRESH_MS); a market order with none — Cboe's
 * the only quote — is refused, saying so */
export const STOCK_JUDGE_MS = 60_000;
/** an order book read over REST stands for a fill this old at most (its source keeps a book a second and a half: public-markets.ts
 * BOOK_MS) */
const BOOK_FRESH_MS = 2_000;
/** how long a fill waits for a live stream's next word, when its last is older than FILL_FRESH_MS (a heartbeat due) */
const CONFIRM_WAIT_MS = 400;
/** the levels a book is read to when a fill walks it */
const WALK_DEPTH = 50;
/** how long an order's estimate waits for its market's book, to say before the order is signed whether the book holds its size */
const BOOK_PREVIEW_MS = 1_000;
/** a coin's or a perpetual's limit placed when no price fresh enough to judge it was at hand says so until one judges it */
const FRESH_WAIT_NOTE = "waiting for a fresh price: judged at the next one";
/** a US share's trailing stop placed out of its session with no real-time quote at hand says so until its trail starts */
const TRAIL_WAIT_NOTE = "its trail starts at the session's first real-time quote";
/** the band a queued market order's worst price stands from its session's first real-time quote where the order says none of its own (a
 * book from before it did): the account's door's own (account/live-orders.ts SLIPPAGE) */
const QUEUED_BAND = 0.02;
/** a market's listing, as its source last gave it, stands under its stream's prices this long: what the market is — its name, its steps,
 * its leverage, whether it takes orders — is read again after it */
const LISTING_STANDS_MS = 5 * 60_000;
/** a fill the stream or a look found is on disk within this; a trailing stop's move within the longer one */
export const FILL_SAVE_MS = 50;
export const TRAIL_SAVE_MS = 1_000;
/** a closed order that filled nothing goes to the month's archive this long after it last changed; the book looks for them at most this
 * often */
export const PRUNE_AFTER_MS = 90 * DAY;
const PRUNE_EVERY_MS = 3_600_000;
/** a look this long after the one before it: the machine slept (or the service was not running), and the time between is judged against
 * the markets' real bars (catchUp) — before an owner's instruction that changes the book, too (lookFirst) */
const CATCH_UP_MS = 30_000;
/** a look's moment (lookedAt) is on disk this soon after it at the latest, while something is open — written with the book whenever the
 * book is written anyway — so a restart that was not a clean one (a crash, the power) judges no more than this of time already looked at */
const LOOK_SAVE_MS = 60_000;
/** how long a market's time asleep is owed — its bars asked again at each look, its orders judged at no quote meanwhile — before it is given
 * up and its orders are judged at the quote from then on, saying so: a source whose bars do not come back for this long is not coming back
 * for this sleep */
export const OWED_MOST_MS = 10 * 60_000;
/** the bars the time asleep is judged against: the finest the public sources give, one-minute bars (feat/paper-live phase H) — and, for a
 * sleep longer than one ask of them reaches (HISTORY_MOST minutes: three and a half days), the finest size whose HISTORY_MOST bars reach
 * back to it, so no part of the time asleep goes unjudged */
export const CATCH_UP_BAR: CandleInterval = "1m";
const CATCH_UP_SIZES: readonly CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
/** the bar size the time asleep from `from` to `to` is judged in (see CATCH_UP_BAR) */
export function catchUpBar(from: number, to: number): CandleInterval {
  return CATCH_UP_SIZES.find((s) => (to - from) / INTERVAL_MS[s] <= HISTORY_MOST - 2) ?? "1d";
}

/** THE EXCHANGES A COIN PAIR'S LISTING IS TAKEN FROM FIRST, in this order (every other source keeps its place in the sources' order):
 * Coinbase where it lists the pair — its history reaches back years, its keyless ticker carries the best bid and ask, its stream is
 * live/stream-hub.ts's — then Kraken (its bars reach back only 720), then OKX. A market the book has traded stays its own source's
 * (Pricer.find): a BTC/USD bought at Kraken is Kraken's still */
export const PAPER_SPOT_FIRST: readonly string[] = ["coinbase", "kraken", "okx"];
export function paperOrder(sources: PublicSource[]): PublicSource[] {
  const slots = sources.map((s, i) => (PAPER_SPOT_FIRST.includes(s.id) ? i : -1)).filter((i) => i >= 0);
  const picked = slots.map((i) => sources[i]!).sort((a, b) => PAPER_SPOT_FIRST.indexOf(a.id) - PAPER_SPOT_FIRST.indexOf(b.id));
  const out = [...sources];
  slots.forEach((slot, k) => (out[slot] = picked[k]!));
  return out;
}

export interface PaperMarketRef {
  /** the public source that lists it (PublicSource.id) */
  source: string;
  kind: MarketKind;
  base: string;
  quote: string;
  name: string;
  /** the last quote read, for a mark when no fresh one is at hand */
  last?: { price?: number | undefined; bid?: number | undefined; ask?: number | undefined; at: number } | undefined;
  /** a perpetual: the most leverage its source showed when it was last read */
  maxLeverage?: number | undefined;
  /** an event contract: when its venue said it closes, and what its venue has said since — closed and not settled, or settled and paid */
  closeTime?: string | undefined;
  closed?: true | undefined;
  settled?: { payout: number; at: string } | undefined;
}
export interface PaperHolding {
  qty: number;
  /** what was paid for it, fees included */
  costUsd: number;
  /** what its fills came to at their prices, fees left out — its average fill price, the entry the account shows (as a venue shows a
   * position's entry: the average of its fills), scaled down with each sell as `costUsd` is. A book from before it: none, and the entry is
   * what was paid a unit, fees in */
  entryUsd?: number | undefined;
}
export interface PaperPosition {
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  /** the margin put up (the notional over the leverage), less the loss realised by nothing yet, less the funding paid */
  marginUsd: number;
  /** the leverage it was opened at (a book from before leverage: 1) */
  leverage?: number | undefined;
  /** the funding paid out of the margin so far (negative: received), and the hour it was last settled to, ms */
  fundingUsd?: number | undefined;
  fundedAt?: number | undefined;
  /** when it was opened, ms: the time asleep is judged against bars from then on only (catchUp). A book from before it: its fundedAt */
  openedAt?: number | undefined;
}
export interface PaperOrder {
  ref: string;
  clientId: string;
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number | undefined;
  worstPrice?: number | undefined;
  /** a stop or a stop-limit: where it triggers; a trailing stop: where it triggers now (it moves with `hwm`) */
  stopPrice?: number | undefined;
  /** a trailing stop: its trail, in percent or in the market's quote, and the best price since it was placed (the highest for a sell, the
   * lowest for a buy) */
  trailPercent?: number | undefined;
  trailPrice?: number | undefined;
  hwm?: number | undefined;
  /** a stop that has triggered: from then on it is the market (or limit) order it became */
  triggeredAt?: string | undefined;
  /** a limit (or a stop-limit that has triggered) that has RESTED: judged at a quote that could fill it and did not reach it. From then on
   * it is the book's maker and fills at its own price when the quote reaches it; one that never rested — past the quote the moment it was
   * placed, changed or triggered, or let back into its session — takes the quote where that is better than its limit. Its market out of
   * session, or taking no orders, it rests no more; a quote that only stopped moving while the market is in session leaves it resting. A
   * bracket's take-profit beyond its entry's fill rests from birth */
  rested?: true | undefined;
  /** a stock's rest: the end of the session it rested in (the regular close, or for an order sent for extended hours the end of
   * after-hours, on its market's own clock, no line's delay in it). A rest is that session's alone: once the market as a quote sees it (the
   * quote's line's delay behind) is past it — whether or not a look fell between the close and the next open — it rests no more, and a
   * quote already past its limit at the open takes the quote. None for a market that never closes */
  restedTill?: string | undefined;
  tif?: TimeInForce | undefined;
  /** a DAY order: when its session ends, and it with it */
  expiresAt?: string | undefined;
  reduceOnly?: boolean | undefined;
  /** a limit order sent for the extended session (a US stock's pre-market, after-hours, overnight) */
  extendedHours?: boolean | undefined;
  /** an entry with exits (a bracket): the take-profit limit and the stop-loss stop placed once it fills, and their refs once placed */
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  children?: string[] | undefined;
  /** an exit of a bracket: its entry, and the other exit (the one that fills cancels the other) */
  parent?: string | undefined;
  oco?: string | undefined;
  status: OrderStatus;
  filledQty: number;
  avgPrice?: number | undefined;
  feeUsd?: number | undefined;
  /** when it filled */
  filledAt?: string | undefined;
  /** a close: what its fill realised (PaperFill.realizedUsd) — said on its statement line as the trade's closed P&L */
  realizedUsd?: number | undefined;
  /** a perpetual's close (or its liquidation) whose loss, with the fee, went past the position's own margin: the part isolated margin did
   * not take, so the cash moved by that much less than the price says (paper-history.ts can add it back). A liquidation always says it: 0,
   * nothing past the margin — so the book's past tells a liquidation the margin covered from one written before the figure was (none) */
  lossPastMarginUsd?: number | undefined;
  at: string;
  updatedAt: string;
  /** when the owner last changed its size, its limit or its stop (amend): a price traded before then never fills or triggers it */
  amendedAt?: string | undefined;
  /** a MARKET ORDER QUEUED FOR ITS SESSION (a share's, placed out of it): the band its worst price stood from the price it was valued at
   * when it was queued (its door's 2%), and — once its session's first real-time quote has come — when its worst price was taken afresh from
   * that quote by the same band, never past the worst price signed, or when that quote, past the signed one, canceled it (queuedOpen). A book
   * from before either is read as the door's own band, from its first quote in session */
  queuedBand?: number | undefined;
  queuedOpen?: string | undefined;
  /** A CLOSE OF THE WHOLE HOLDING (LiveTrader.close): it sells what is held when it fills, whatever plain sells hold of it (P1) — and those
   * sells, with nothing left to sell once it has, are canceled with it */
  closesAll?: true | undefined;
  note?: string | undefined;
}
export interface PaperFill {
  ref: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  feeUsd: number;
  at: string;
  /** a close: what it realised — a perpetual reduced, at its price (the fee is `feeUsd`, beside it); a holding sold, its proceeds less its
   * fee and what that part cost (fees in); a liquidation, a settlement. A book from before a sale said it: a perpetual's only */
  realizedUsd?: number | undefined;
  /** a settlement or a liquidation: what happened, in words */
  note?: string | undefined;
}
/** ONE HOUR OF A PERPETUAL'S FUNDING as the book settled it (payFunding): when (the top of the hour), the market, what was paid out of the
 * margin (above zero) or received (below), and — from 2026-10-20 — the position's side and size then, the price it was settled at (the
 * oracle, else the mark), the hour's rate, and `quoted` where that rate was the quote's and not the source's history's. An older book's
 * lines carry the first three alone, and may stand for several hours */
export interface PaperFunding {
  at: string;
  symbol: string;
  usd: number;
  side?: "long" | "short" | undefined;
  qty?: number | undefined;
  price?: number | undefined;
  rate?: number | undefined;
  quoted?: true | undefined;
}

export interface PaperBook {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  startCashUsd: number;
  feeBps: number;
  cashUsd: number;
  holdings: Record<string, PaperHolding>;
  positions: Record<string, PaperPosition>;
  orders: Record<string, PaperOrder>;
  fills: PaperFill[];
  markets: Record<string, PaperMarketRef>;
  /** the leverage set per perpetual market (1x where none is set) */
  leverage?: Record<string, number> | undefined;
  /** the funding each perpetual paid (above zero) or received (below) out of its margin, hour by hour as it was settled — the last
   * FUNDING_KEPT — so the book's past can be told again exactly (paper-history.ts). A book from before it has none */
  funding?: Array<PaperFunding> | undefined;
  /** the paper money the owner added since the book started (topUpPaper): each when, and how much — money put in, never a gain, so the
   * book's past adds it at its moment (paper-history.ts) and what it made or lost since it started counts it as put in. A book from before
   * it has none */
  deposits?: Array<{ at: string; usd: number }> | undefined;
  /** a book started again (resetPaper): the archive the book before it was written to, beside it, and when */
  resetFrom?: { file: string; at: string } | undefined;
  /** WHEN THE ACCOUNT LAST LOOKED AT THE BOOK (settle): the moment the time since — the Mac asleep, the service not running (a restart, a
   * crash, a reboot) — is judged against the markets' real bars from (catchUp), read back when the book is opened again. Written with each
   * write of the book, and by a look at least every LOOK_SAVE_MS while something is open. A book from before it: none, and a restart's
   * downtime is judged at the quote after it, as it was */
  lookedAt?: string | undefined;
  /** the markets whose time asleep is still owed (catchUp could not read whole bars for it yet: its source's bars did not come back, or
   * came back cut short): from when, and since when it has been owed — judged against bars at a later look, never at the quote in the
   * meantime, and given up only past OWED_MOST_MS, saying so on its orders */
  owed?: Record<string, { from: string; since: string }> | undefined;
  seq: number;
}

/** a quote as the paper account reads it: its source, its listing and when it was read — and where its prices came from instead of the
 * listing (`from`): the market's live stream (with its mark for a perpetual, the sizes at the best bid and ask, the seq it stands at) or its
 * order book read for a fill (its levels, for the walk) */
type Quoted = { source: PublicSource; m: Listing; at: number; from?: "stream" | "book" | undefined; mark?: number | undefined; bidSz?: number | undefined; askSz?: number | undefined; seq?: number | undefined; book?: { bids: Array<[number, number | null]>; asks: Array<[number, number | null]> } | undefined };

export interface PaperRequest {
  home: string;
  /** the venue id on the account: the book's own directory */
  venue: string;
  label: string;
  /** the paper money a NEW book starts with; a book that exists keeps its own */
  cashUsd: number;
  sources: () => PublicSource[];
  clock: () => number;
  /** the venues' live streams (live/stream-hub.ts), when the account runs them: asked each time, since the real server starts its hub after
   * the account has opened its paper accounts. None: every quote is the source's listing, as before */
  hub?: (() => MarketHub | undefined) | undefined;
  /** the fee a NEW book charges, in basis points of the notional (a backtest's own, backtest/engine.ts); none: PAPER_FEE_BPS. A book that
   * exists keeps the fee it was started with */
  feeBps?: number | undefined;
  /** told each hour of funding the book settles, as it is written in the book (a backtest counts them all: the book keeps the latest
   * FUNDING_KEPT only) */
  onFunding?: ((row: PaperFunding) => void) | undefined;
  /** the book kept IN MEMORY ONLY: never read from disk, written or archived — a backtest's (backtest/engine.ts), whose run would otherwise
   * write the whole book at every fill and every hour's funding. Everything else is the same book, told the same way */
  memory?: true | undefined;
  /** the account STEPPED OVER RECORDED BARS (a backtest's, backtest/engine.ts): its clock jumps a bar at a time and no stream runs, so every
   * look past CATCH_UP_MS after the one before it judges the time between against the source's bars (catchUp) as a look after the Mac
   * slept does where the account streams the markets — a perpetual liquidated inside the bar whose low (or high) crossed its liquidation
   * price, a stop or a limit filled where its bar reached it — never only at the price of the bar the clock stopped at */
  bars?: true | undefined;
}

const round = (x: number, places: number): number => Number(x.toFixed(places));
const iso = (ms: number): string => new Date(ms).toISOString();
const usd = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 8 });
/** a price or a step in the paper account's words — its notes and refusals, which the page shows: grouped the en-US way, at the figure's
 * own places (at most ten), as the account's statement writes prices (account/statement.ts figure) — 62548.3 is "62,548.3". The book's
 * numbers stay numbers */
const fig = (x: number): string => (Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: 10 }).replace(/^-0$/, "0") : "0");
const pos = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const signed = (n: number): string => `${n < 0 ? "−" : "+"}${usd(Math.abs(n))}`;

/** the words the paper account's rule is said in, wherever it shows */
export const paperRule = (feeBps: number): string =>
  `a paper account: fills at the public quote by the account's own rule — a market order at the ask or the bid, a size the best level does not hold walking the order book at the average of what it took, whole or not at all (no partial fills); a limit order when the quote crosses it (at the quote when it crosses at once, at its limit once it rested), a stop when the price or a trade reaches it; a coin or a perpetual only at a bid and an ask at most ${FILL_FRESH_MS / 1000} s old — its live stream's, else its order book read then — or not at all, saying why; what open orders may need held from the buying power (a buy's cash, a sell's units, a perpetual's margin); a stock only at a real-time quote from inside its session (Robinhood's or Nasdaq's, never Cboe's fifteen-minute delayed one: a market order with no other is refused, and an open order is judged only at one at most ${STOCK_JUDGE_MS / 1000} s old) — the regular session, or for a limit order sent for extended hours the pre-market, after-hours or overnight session where it is offered — a market order out of the session queued for it, and filled at the session's first real-time quote inside the worst price signed (an open past it cancels it); US shares no commission, everything else a ${(feeBps / 100).toFixed(2)}% fee; perpetuals with isolated margin at the leverage set (up to the market's most), funding each hour at the source's rate, liquidated at the mark when the margin left falls to half the initial margin at the market's most leverage; event contracts marked at their price and paid out when their venue settles them. Paper money: nothing here is real`;

/** the starting paper money, as the owner wrote it in the connection's reference: nothing for the default, else dollars ("25000",
 * "$25,000") */
export function parsePaperCash(reference: string, venue: string): number | Refusal {
  const raw = reference.trim().replace(/^\$/, "").replace(/,/g, "");
  if (raw === "") return PAPER_DEFAULT_CASH;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw) || !(Number(raw) > 0)) return no("E_ACCOUNT_CREDENTIAL", { venue, message: `a paper account's starting money is a number of dollars (10000, or $25,000), not "${reference.trim().slice(0, 40)}"; leave it empty for ${usd(PAPER_DEFAULT_CASH)}`, detail: { field: "credentialRef" } });
  const cash = Number(raw);
  if (cash > PAPER_MAX_CASH) return no("E_ACCOUNT_CREDENTIAL", { venue, message: `a paper account starts with at most ${usd(PAPER_MAX_CASH)}`, detail: { field: "credentialRef", max: PAPER_MAX_CASH } });
  return cash;
}

export const paperDir = (home: string, venue: string): string => join(home, "paper", venue);
export const paperBookPath = (home: string, venue: string): string => join(paperDir(home, venue), "book.json");

export function loadBook(path: string): PaperBook | undefined {
  if (!existsSync(path)) return undefined;
  const b = JSON.parse(readFileSync(path, "utf8")) as PaperBook;
  if (b?.version !== 1 || typeof b.cashUsd !== "number") throw new Error(`${path} is not a paper book this account can read`);
  // a name written before a paper account's name was said once ("Paper account · paper") reads as it would be written now
  const name = typeof b.name === "string" ? b.name.replace(/^(.*paper.*) · paper$/i, "$1") : b.name;
  return { ...b, name, holdings: b.holdings ?? {}, positions: b.positions ?? {}, orders: b.orders ?? {}, fills: b.fills ?? [], markets: b.markets ?? {}, leverage: b.leverage ?? {} };
}

/** the book, rewritten whole and atomically, the user's alone */
function saveBook(path: string, b: PaperBook, now: number): void {
  b.updatedAt = iso(now);
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(b, null, 1), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}
/** THE BOOK WRITTEN IN THE BACKGROUND (P13): `text` written to a temp file of its own without blocking anything — then, in one step that
 * nothing can come between, renamed into place only if no newer write has reached the disk meanwhile (`mayLand`: an owner's instruction is
 * written at once, and a write that began before it must never land over it), else let go. The user's alone (0600) */
async function writeBookSoon(path: string, text: string, tag: string, mayLand: () => boolean): Promise<void> {
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${tag}.tmp`;
  await writeFile(tmp, text, { mode: 0o600 });
  if (!mayLand()) {
    try {
      unlinkSync(tmp);
    } catch {
      // gone already
    }
    return;
  }
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}
/** the paper accounts opened in this process, each its own writer: its temp files named apart from another's of the same book */
let writers = 0;
/** an order that ended with nothing filled: canceled, expired, rejected */
const endedUnfilled = (o: PaperOrder): boolean => (o.status === "canceled" || o.status === "expired" || o.status === "rejected") && !(o.filledQty > 0);
/** THE BOOK KEPT SMALL: every order that ended with nothing filled and last changed more than PRUNE_AFTER_MS before `now`, moved out of the
 * book into the archive of the month it last changed in, beside it — orders-YYYY-MM.json, {version, id, orders}, merged with what that
 * archive holds already, the user's alone (0600), written to a temp file and renamed — and only then taken out of the book. Orders that
 * filled stay in the book: its past is told again from them (paper-history.ts). How many went */
export function pruneBook(path: string, b: PaperBook, now: number): number {
  const old = Object.values(b.orders).filter((o) => o && endedUnfilled(o) && Date.parse(o.updatedAt) < now - PRUNE_AFTER_MS);
  if (!old.length) return 0;
  const byMonth = new Map<string, PaperOrder[]>();
  for (const o of old) {
    const month = o.updatedAt.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), o]);
  }
  const dir = join(path, "..");
  for (const [month, orders] of byMonth) {
    const file = join(dir, `orders-${month}.json`);
    let kept: { version: 1; id: string; orders: Record<string, PaperOrder> } = { version: 1, id: b.id, orders: {} };
    if (existsSync(file)) {
      try {
        const was = JSON.parse(readFileSync(file, "utf8")) as typeof kept;
        if (was && typeof was.orders === "object") kept = { version: 1, id: b.id, orders: was.orders };
      } catch {
        // an archive this account cannot read is not written over: these orders wait in the book for the next look
        continue;
      }
    }
    for (const o of orders) kept.orders[o.ref] = o;
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(kept, null, 1), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
    for (const o of orders) delete b.orders[o.ref];
  }
  return old.length - old.filter((o) => b.orders[o.ref]).length;
}

/** THE BOOK STARTED AGAIN (resetPaper): the book as it stands written whole beside it, as book-<the moment>.json (its colons and its point
 * as dashes, so the name is a file name everywhere), the user's alone (0600), written to a temp file and renamed into place — an archive,
 * never deleted or read back as the account's book. The file's name */
function archiveBook(path: string, b: PaperBook, now: number): string {
  const file = `book-${iso(now).replace(/[:.]/g, "-")}.json`;
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const to = join(dir, file);
  const tmp = `${to}.tmp`;
  writeFileSync(tmp, JSON.stringify(b, null, 1), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, to);
  return file;
}
/** a book started again from `was`: its id and its name kept, its order numbers going on from the last (p13 after p12: an order the
 * account's statement names stays one order), `cashUsd` of paper money and nothing else — no holding, position, order, fill or funding */
function freshBook(was: PaperBook, cashUsd: number, now: number, archived: string): PaperBook {
  return { version: 1, id: was.id, name: was.name, createdAt: iso(now), updatedAt: iso(now), startCashUsd: cashUsd, feeBps: PAPER_FEE_BPS, cashUsd, holdings: {}, positions: {}, orders: {}, fills: [], markets: {}, leverage: {}, funding: [], deposits: [], resetFrom: { file: archived, at: iso(now) }, seq: Math.max(0, Math.floor(was.seq ?? 0)) };
}
/** what a paper account's book says of itself, without its orders: its id, name, cash, what it started with and when, and the paper money
 * added since — what the connect form says of a book that connecting would continue, and what a reset's words say it archives */
export interface PaperBookSummary {
  venue: string;
  name: string;
  cashUsd: number;
  startCashUsd: number;
  addedUsd: number;
  createdAt: string;
  updatedAt: string;
  /** what it holds besides its cash: holdings and perpetual positions, by count */
  holdings: number;
  positions: number;
  /** orders open in it (resting, stops waiting) */
  open: number;
}
/** WHAT THE BOOK TELLS AS IT CHANGES (the account's push channel, account/stream.ts; service.ts paperSaid listens to each paper account it
 * keeps): each write of the book set beside the one before it — every order whose state moved (placed, filled, a stop triggered, a trailing
 * stop's stop moved, changed, canceled, ended with its day; one still open when the book started again, told as canceled with it), every
 * fill since (a bracket's exit, a liquidation and a settlement among them), every position or holding that changed or went, the paper cash
 * when it moved, the book started again — and the book said of itself, told to whoever listens, once a write. A look of the service's own
 * (watchPaper) tells its fills in the same words as the owner's own order tells its: the same write, the same change. A write that moved
 * none of it (a market's leverage set with nothing held) tells nothing */
export interface PaperChange {
  orders: PaperOrderSaid[];
  fills: PaperFillSaid[];
  positions: PaperPositionSaid[];
  /** the paper cash, when this write moved it */
  cashUsd?: number | undefined;
  /** the book was started again (resetPaper) by this write: what was there is archived as `archived`, and nothing a listener kept of it
   * stands — it reads the account afresh */
  reset?: { archived: string; at: string } | undefined;
  summary: PaperBookSummary;
}
/** an order as the book tells it: the venue's own ref and the client id the account gave it (its LiveOrder's), and its state */
export interface PaperOrderSaid {
  ref: string;
  clientId: string;
  symbol: string;
  name: string;
  kind: MarketKind;
  side: Side;
  type: OrderType;
  qty: number;
  status: OrderStatus;
  filledQty: number;
  avgPrice?: number | undefined;
  feeUsd?: number | undefined;
  limitPrice?: number | undefined;
  stopPrice?: number | undefined;
  /** a bracket's exit: the entry it closes */
  parent?: string | undefined;
  note?: string | undefined;
  at: string;
  updatedAt: string;
}
/** a fill as the book tells it: the fill itself, the market's name and kind, and its order's client id and what of it has filled now */
export interface PaperFillSaid extends PaperFill {
  name: string;
  kind: MarketKind;
  clientId?: string | undefined;
  filledQty?: number | undefined;
}
/** a position or a holding as the book tells it now: the very row the account's positions read lists for it (Position — built by the same
 * code, positionRow, so a row a page patched from it and a row it read agree), marked at the market's last quote the book kept and that
 * quote's moment (native.markAt: the page says how old the mark is); `position` null when it is gone */
export interface PaperPositionSaid {
  symbol: string;
  position: Position | null;
}
/** `open`: how many orders are open, where the caller keeps the count already (the book's own index of its open orders, paperSource) — else
 * counted from every order */
export function summaryOf(b: PaperBook, open?: number): PaperBookSummary {
  return { venue: b.id, name: b.name, cashUsd: round(b.cashUsd, 2), startCashUsd: b.startCashUsd, addedUsd: round((b.deposits ?? []).reduce((x, d) => x + (Number.isFinite(d?.usd) ? d.usd : 0), 0), 2), createdAt: b.createdAt, updatedAt: b.updatedAt, holdings: Object.values(b.holdings ?? {}).filter((h) => h && h.qty > 0).length, positions: Object.keys(b.positions ?? {}).length, open: open ?? Object.values(b.orders ?? {}).filter((o) => o && (o.status === "open" || o.status === "pending")).length };
}
/** a paper account's id, as a book's folder is named: what a venue's id may be (service.ts plugLive) — never a path */
const BOOK_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** the paper books kept in the home (<home>/paper/<venue>/book.json), each said of itself (summaryOf): what connecting would continue. A
 * folder whose book cannot be read is left out */
export function paperBooksOnDisk(home: string): PaperBookSummary[] {
  const root = join(home, "paper");
  if (!existsSync(root)) return [];
  const out: PaperBookSummary[] = [];
  for (const venue of readdirSync(root)) {
    if (!BOOK_ID.test(venue)) continue;
    try {
      const b = loadBook(paperBookPath(home, venue));
      if (b) out.push(summaryOf(b));
    } catch {
      // a book this account cannot read is not one it would continue
    }
  }
  return out.sort((a, b) => a.venue.localeCompare(b.venue));
}
/** A PAPER ACCOUNT NOT CONNECTED NOW started again (resetPaper on a book in the home that no connection has open): its book archived beside
 * it and a new one written in its place with `cashUsd` — the same as a connected one's reset (paperSource's own), so the next connection of
 * that id starts on the new book, never the old one */
export function resetBookOnDisk(home: string, venue: string, cashUsd: number, now: number): { archived: string; book: PaperBook } | Refusal {
  if (!BOOK_ID.test(venue)) return no("E_ACCOUNT_BAD_ACTION", { venue, message: "a paper account's id is lower-case letters, digits and dashes" });
  const path = paperBookPath(home, venue);
  let was: PaperBook | undefined;
  try {
    was = loadBook(path);
  } catch (err) {
    return no("E_ACCOUNT_BAD_ACTION", { venue, message: `the paper account's book could not be read: ${String((err as Error)?.message ?? err).slice(0, 160)}` });
  }
  if (!was) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue, message: `there is no paper account ${venue} on this machine to start again` });
  try {
    const archived = archiveBook(path, was, now);
    const book = freshBook(was, cashUsd, now, archived);
    saveBook(path, book, now);
    return { archived, book };
  } catch (err) {
    return no("E_ACCOUNT_BAD_ACTION", { venue, message: `the paper account's book could not be written: ${String((err as Error)?.message ?? err).slice(0, 160)}` });
  }
}

/** a call, or nothing when it is not back in time */
function inTime<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => undefined), new Promise<undefined>((go) => (t = setTimeout(() => go(undefined), ms)))]).finally(() => clearTimeout(t));
}

/** what the sources list: each asked at once and given its time; a market is listed by the first source that names its symbol, and only
 * when it is priced in dollars (a dated future is not offered) */
class Pricer {
  private readonly known = new Map<string, { source: string; m: Listing; at: number }>();
  constructor(private readonly sources: () => PublicSource[], private readonly clock: () => number) {}

  /** which source a symbol is remembered by. Two sources may name the same symbol (the US share NVDA and Robinhood's Stock Token NVDA):
   * the one first in the account's own order keeps it, whichever answered last, so a source that was slow to answer once (the share's line
   * at startup) takes its symbol back when it answers, and the other never takes it from it again — a market asked by that symbol is the
   * same market every time */
  private remember(symbol: string, source: string, m: Listing): void {
    const was = this.known.get(symbol);
    if (was && was.source !== source) {
      const order = this.sources().map((s) => s.id);
      const [mine, theirs] = [order.indexOf(source), order.indexOf(was.source)];
      if (theirs !== -1 && (mine === -1 || theirs < mine)) return;
    }
    this.known.set(symbol, { source, m, at: this.clock() });
  }

  /** every source's listing for `q`, in the sources' order — or, where `one` names the market looked for and a source answers one market
   * alone (PublicSource.line), that market's line from it instead of its search (P16) */
  async listAll(q: string, limit: number, one?: string): Promise<Array<{ source: PublicSource; m: Listing }>> {
    const all = this.sources();
    const answers = await Promise.all(
      all.map((s) =>
        one && s.line
          ? inTime(s.line(one), SOURCE_MS).then((x) => (x === undefined || x === null ? [] : isRefusal(x) ? x : [x]))
          : inTime(s.listings({ ...(q ? { q } : {}), limit }), SOURCE_MS),
      ),
    );
    const out: Array<{ source: PublicSource; m: Listing }> = [];
    const seen = new Set<string>();
    answers.forEach((a, i) => {
      if (!Array.isArray(a)) return;
      const source = all[i]!;
      for (const m of a) {
        if (!m || typeof m.symbol !== "string" || seen.has(m.symbol) || !this.offered(m)) continue;
        seen.add(m.symbol);
        this.remember(m.symbol, source.id, m);
        out.push({ source, m });
      }
    });
    return out;
  }

  async events(o: { category?: string | undefined; closingWithinMs?: number | undefined; limit: number }): Promise<Array<{ source: PublicSource; m: Listing }>> {
    const all = this.sources().filter((s) => s.events);
    const answers = await Promise.all(all.map((s) => inTime(s.events!(o), SOURCE_MS)));
    const out: Array<{ source: PublicSource; m: Listing }> = [];
    const seen = new Set<string>();
    answers.forEach((a, i) => {
      if (!Array.isArray(a)) return;
      for (const m of a) {
        if (!m || typeof m.symbol !== "string" || seen.has(m.symbol) || !this.offered(m)) continue;
        seen.add(m.symbol);
        this.remember(m.symbol, all[i]!.id, m);
        out.push({ source: all[i]!, m });
      }
    });
    return out;
  }

  private offered(m: Listing): boolean {
    return inDollars(String(m.quote ?? "")) && m.kind !== "future";
  }

  /** the source a symbol was last listed by, if any (for a settlement asked of it after its listing has gone) */
  sourceOf(id: string): PublicSource | undefined {
    return this.sources().find((s) => s.id === id);
  }

  /** a symbol's listing as it was last read here, and when — by the book's own source where the book has traded it (never another
   * source's market of the same symbol) — or nothing: what a stream's prices stand on (they say the price, the listing what the market is) */
  knownOf(symbol: string, ref: PaperMarketRef | undefined): { source: PublicSource; m: Listing; at: number } | undefined {
    const k = this.known.get(symbol);
    if (!k || (ref && ref.source !== k.source)) return undefined;
    const source = this.sourceOf(k.source);
    return source ? { source, m: k.m, at: k.at } : undefined;
  }

  /** a market's listing, asked of its source now (the service and the source keep a listing a while: how old it is, the quote says —
   * marketOf's quoteAt): from its
   * own source by its base, then by its symbol, then its source's own few. A market whose source is known (the book's, or the one that
   * listed it) and still read is that source's alone: when it does not answer, or lists it no more, the market has no quote now — another
   * source's market of the same symbol (Robinhood's Stock Token NVDA for the share NVDA) never stands in for it. Only a market with no such
   * source is asked of every source, and one the book holds only as the kind it holds. A market no source names now is not found. What
   * is remembered here is which source lists a symbol, never a price */
  async find(symbol: string, ref: PaperMarketRef | undefined): Promise<{ source: PublicSource; m: Listing; at: number } | undefined> {
    const k = this.known.get(symbol);
    const source = this.sourceOf(ref?.source ?? k?.source ?? "");
    const base = ref?.base ?? k?.m.base ?? symbol.split(/[/:@-]/)[0] ?? symbol;
    // a source that answers one market alone (PublicSource.line: the US stocks line) is asked for this one market and nothing else — never
    // the search of its base, which for a short ticker reads forty quotes (P16)
    const lineOf = (s: PublicSource) => async (): Promise<Listing[] | Refusal | undefined> => {
      const one = await inTime(s.line!(symbol), SOURCE_MS);
      return one === undefined || one === null ? [] : isRefusal(one) ? one : [one];
    };
    const tries: Array<() => Promise<Listing[] | Refusal | undefined>> = !source
      ? []
      : source.line
        ? [lineOf(source)]
        : [() => inTime(source.listings({ q: base, limit: LIST_LIMIT }), SOURCE_MS), () => inTime(source.listings({ q: symbol, limit: LIST_LIMIT }), SOURCE_MS), () => inTime(source.listings({ limit: 60 }), SOURCE_MS)];
    for (const t of tries) {
      const a = await t();
      const m = Array.isArray(a) ? a.find((x) => x?.symbol === symbol) : undefined;
      if (m && this.offered(m)) {
        const at = this.clock();
        this.known.set(symbol, { source: source!.id, m, at });
        return { source: source!, m, at };
      }
    }
    if (source) return undefined;
    for (const q of [base, symbol]) {
      const got = (await this.listAll(q, LIST_LIMIT, symbol)).find((x) => x.m.symbol === symbol && (!ref || x.m.kind === ref.kind));
      if (got) return { ...got, at: this.clock() };
    }
    return undefined;
  }
}

const classOf = (kind: MarketKind, base: string): AssetClass => (kind === "event" ? "event" : kind === "token" ? "rwa" : kind === "stock" ? "equity" : isStable(base) ? "stable" : "crypto");

/** a perpetual's liquidation price under the rule above (the maintenance margin is the notional at the mark over twice the market's most
 * leverage): the mark at which the margin left equals it. None where it cannot be reached (a long whose margin covers the whole notional) */
export function liquidationPriceOf(p: Pick<PaperPosition, "side" | "qty" | "entryPrice" | "marginUsd">, maxLeverage: number): number | undefined {
  const k = 1 / (2 * Math.max(1, maxLeverage));
  if (!(p.qty > 0)) return undefined;
  const px = p.side === "long" ? (p.entryPrice * p.qty - p.marginUsd) / (p.qty * (1 - k)) : (p.entryPrice * p.qty + p.marginUsd) / (p.qty * (1 + k));
  return px > 0 ? round(px, 6) : undefined;
}

/** Open a paper account — the book in the home, continued when it exists, started with `cashUsd` when it does not — and its trader */
export async function paperSource(req: PaperRequest): Promise<{ source: LiveSource; first: LiveBalance[] } | Refusal> {
  const venue = req.venue;
  const path = paperBookPath(req.home, venue);
  const now = req.clock();
  let book: PaperBook | undefined;
  try {
    book = req.memory ? undefined : loadBook(path);
  } catch (err) {
    return no("E_ACCOUNT_CREDENTIAL", { venue, message: `the paper account's book could not be read: ${String((err as Error)?.message ?? err).slice(0, 160)}`, detail: { path } });
  }
  // a paper account says so in its name, whatever the owner called it
  const label = req.label.trim();
  const name = `${label || "Paper account"}${/paper/i.test(label || "Paper account") ? "" : " · paper"}`;
  if (!book) {
    book = { version: 1, id: venue, name, createdAt: iso(now), updatedAt: iso(now), startCashUsd: req.cashUsd, feeBps: req.feeBps ?? PAPER_FEE_BPS, cashUsd: req.cashUsd, holdings: {}, positions: {}, orders: {}, fills: [], markets: {}, leverage: {}, funding: [], seq: 0 };
  } else if (label) book.name = name;
  const b = book;
  // the last look this book had, in the run before this one (lookedAt): the time since — the service not running, a restart — is judged
  // from it against the markets' real bars once the account streams them (settle). Read before anything is written, and never a moment
  // ahead of now (a clock set back)
  const lookedBefore = Date.parse(b.lookedAt ?? "");
  try {
    if (!req.memory) saveBook(path, b, now);
  } catch (err) {
    return no("E_ACCOUNT_CREDENTIAL", { venue, message: `the paper account's book could not be written: ${String((err as Error)?.message ?? err).slice(0, 160)}`, detail: { path } });
  }
  // a coin pair's listing from Coinbase first, then Kraken, then OKX (paperOrder)
  const sources = (): PublicSource[] => paperOrder(req.sources());
  const pricer = new Pricer(sources, req.clock);
  const rule = paperRule(b.feeBps);

  // ---- THE BOOK'S OPEN ORDERS, INDEXED (what a tick, a look, a hold and a word of the book's change read) ------------------------------
  /** the orders that may be open, by market: every order put on the book open goes in (placed, a bracket's exit), and one found closed is
   * taken out as it is read (openIn) — an order never opens again once closed, so this holds every open order and few others. A tick of a
   * market with nothing open reads nothing; a look reads only what is open, never the book's whole past (P13: a busy book holds tens of
   * thousands of filled orders) */
  const openBy = new Map<string, Set<string>>();
  /** each order's ref by the client id it was placed under (place: the same instruction twice is the same order) */
  const byClient = new Map<string, string>();
  /** what the book's word of its change (tell) has still to look at besides the open orders: orders put on the book since (open or not — a
   * liquidation, a settlement, an order canceled at once), and orders found closed since (taken out of openBy) */
  const freshRefs = new Set<string>();
  /** orders went from the book (pruned to the archive, or the book started again) since the last word: the word looks for them */
  let ordersGone = false;
  const live = (o: { status: OrderStatus }): boolean => o.status === "open" || o.status === "pending";
  /** an order put on the book: indexed, and looked at by the next word of the book's change */
  const track = (o: PaperOrder): void => {
    byClient.set(o.clientId, o.ref);
    freshRefs.add(o.ref);
    if (!live(o)) return;
    const set = openBy.get(o.symbol) ?? new Set<string>();
    set.add(o.ref);
    openBy.set(o.symbol, set);
  };
  /** the index made again from the book as it stands (opened, started again) */
  const reindex = (): void => {
    openBy.clear();
    byClient.clear();
    for (const o of Object.values(b.orders)) {
      if (!o) continue;
      byClient.set(o.clientId, o.ref);
      if (!live(o)) continue;
      const set = openBy.get(o.symbol) ?? new Set<string>();
      set.add(o.ref);
      openBy.set(o.symbol, set);
    }
  };
  reindex();
  /** the orders open in one market now (open or pending), oldest first — the closed ones found on the way taken out of the index */
  const openIn = (symbol: string): PaperOrder[] => {
    const set = openBy.get(symbol);
    if (!set) return [];
    const out: PaperOrder[] = [];
    for (const ref of set) {
      const o = b.orders[ref];
      if (o && live(o) && o.symbol === symbol) out.push(o);
      else {
        set.delete(ref);
        if (o) freshRefs.add(ref);
      }
    }
    if (!set.size) openBy.delete(symbol);
    return out.sort((x, y) => Number(x.ref.slice(1)) - Number(y.ref.slice(1)));
  };
  /** every order open now, oldest first */
  const openAll = (): PaperOrder[] => [...openBy.keys()].flatMap((s) => openIn(s)).sort((x, y) => Number(x.ref.slice(1)) - Number(y.ref.slice(1)));
  /** the order placed under a client id, if the book has it */
  const ofClient = (clientId: string): PaperOrder | undefined => {
    const ref = byClient.get(clientId);
    const o = ref ? b.orders[ref] : undefined;
    return o && o.clientId === clientId ? o : undefined;
  };

  // ---- THE BOOK WRITTEN (P13) ----------------------------------------------------------------------------------------------------------
  /** the writes begun, and the newest that reached the disk: a background write that began before a newer one never lands over it */
  let begun = 0;
  let landed = 0;
  let soonTimer: ReturnType<typeof setTimeout> | undefined;
  let soonAt = Number.POSITIVE_INFINITY;
  let chain: Promise<void> = Promise.resolve();
  let queued: Promise<void> | undefined;
  let prunedAt = Number.NEGATIVE_INFINITY;
  /** the look's moment (PaperBook.lookedAt) the newest write put on disk, and when that write was (the book is written as it opens) */
  let lookWritten = b.lookedAt;
  let writtenAt = now;
  const writer = ++writers;
  /** the closed orders that filled nothing, a quarter old, to the month's archive beside the book (pruneBook) — looked for once an hour */
  const pruneNow = (now: number): void => {
    if (req.memory || now - prunedAt < PRUNE_EVERY_MS) return;
    prunedAt = now;
    try {
      if (pruneBook(path, b, now) > 0) ordersGone = true;
    } catch {
      // an archive that could not be written: its orders wait in the book for the next try
    }
  };
  const stopSoon = (): void => {
    if (soonTimer) clearTimeout(soonTimer);
    soonTimer = undefined;
    soonAt = Number.POSITIVE_INFINITY;
  };
  /** the book written NOW — before the owner's own instruction is answered — then told to whoever listens (PaperChange: what this write
   * moved). A background write waiting is this one */
  const save = () => {
    stopSoon();
    pruneNow(req.clock());
    if (req.memory) b.updatedAt = iso(req.clock());
    else saveBook(path, b, req.clock());
    landed = ++begun;
    lookWritten = b.lookedAt;
    writtenAt = req.clock();
    tell();
  };
  /** the book written in the background, as it stands when the write begins: one write at a time, and one waiting at most (it writes
   * whatever came by then). Its promise is the write's */
  const flush = (): Promise<void> => {
    stopSoon();
    if (queued) return queued;
    const run = chain.then(async () => {
      queued = undefined;
      const tag = ++begun;
      const now = req.clock();
      pruneNow(now);
      b.updatedAt = iso(now);
      const looked = b.lookedAt;
      if (req.memory) {
        if (landed < tag) [landed, lookWritten, writtenAt] = [tag, looked, now];
        return;
      }
      await writeBookSoon(path, JSON.stringify(b, null, 1), `${writer}.${tag}`, () => {
        if (landed > tag) return false;
        landed = tag;
        lookWritten = looked;
        writtenAt = now;
        return true;
      });
    });
    queued = run;
    chain = run.catch(() => undefined);
    return run;
  };
  /** what the stream or a look found: told at once and written within FILL_SAVE_MS — or, a trailing stop's move and nothing more
   * ("trail"), told and written within TRAIL_SAVE_MS, so a stop that follows every tick is one word and one write a second */
  const saveSoon = (kind: "fill" | "trail"): void => {
    if (kind === "fill") tell();
    const ms = kind === "fill" ? FILL_SAVE_MS : TRAIL_SAVE_MS;
    const at = req.clock() + ms;
    if (soonTimer && soonAt <= at) return;
    if (soonTimer) clearTimeout(soonTimer);
    soonAt = at;
    soonTimer = setTimeout(() => {
      soonTimer = undefined;
      soonAt = Number.POSITIVE_INFINITY;
      tell();
      void flush().catch(() => undefined);
    }, ms);
    soonTimer.unref?.();
  };
  /** when each held event market was last asked whether it had settled */
  const settleAsked = new Map<string, number>();

  // an event contract is named by its question and its outcome, as the holdings row says it
  const nameOf = (m: Listing): string => (m.kind === "event" && m.group?.title ? `${m.group.title} · ${m.outcome ?? m.name}` : m.name);
  const refOf = (source: PublicSource, m: Listing): PaperMarketRef => {
    const was = b.markets[m.symbol];
    return { source: source.id, kind: m.kind, base: m.base, quote: m.quote, name: nameOf(m), ...(was?.last ? { last: was.last } : {}), ...(pos(m.maxLeverage) !== undefined ? { maxLeverage: m.maxLeverage } : was?.maxLeverage ? { maxLeverage: was.maxLeverage } : {}), ...(m.closeTime ? { closeTime: m.closeTime } : was?.closeTime ? { closeTime: was.closeTime } : {}), ...(was?.closed ? { closed: true } : {}), ...(was?.settled ? { settled: was.settled } : {}) };
  };
  /** the leverage a market is set to, held to the most its source shows */
  const levOf = (symbol: string, max: number): number => Math.max(1, Math.min(max, Math.floor(b.leverage?.[symbol] ?? 1)));

  /** how far behind the market a stock's quote is, as the line that answered says: a line that keeps the market's clock and stamps its
   * quotes, its own delay for this quote (the US line answers with a real-time quote where one is given, and Cboe's fifteen minutes behind
   * where it is not, so it is the quote's, not the line's once and for all); the old delayed line without a stamp, Cboe's fifteen minutes;
   * anything else, none */
  const delayOf = (q: Quoted): number => (q.source.sessions && Number.isFinite(Date.parse(q.m.quoteAt ?? "")) ? Math.max(0, q.m.delayMs ?? 0) : q.source.id === US_STOCKS_ID ? CBOE_DELAY_MS : 0);
  /** A STOCK'S SESSION, as its quote tells it: the phase the quote's own time is in, and the phase the market is in now as its source sees
   * it (its delay behind, delayOf). A quote older than its source's delay and QUOTE_GRACE_MS is in no phase: a quote that stopped moving
   * fills nothing. A source that stamps no time is judged by its session now — and the old delayed line (Cboe without a stamp) by its window */
  const stockPhases = (q: Quoted, at: number): { quote: SessionPhase; now: SessionPhase } => {
    const clock = q.source.sessions;
    const stamped = q.m.quoteAt ? Date.parse(q.m.quoteAt) : NaN;
    if (clock && Number.isFinite(stamped)) {
      const delay = delayOf(q);
      const nowPhase = clock.phaseAt(at - delay);
      return { quote: at - stamped > delay + QUOTE_GRACE_MS ? "closed" : clock.phaseAt(stamped), now: nowPhase };
    }
    if (q.source.id === US_STOCKS_ID) {
      const open = cboeQuoteInSession(at);
      return { quote: open ? "regular" : "closed", now: open ? "regular" : "closed" };
    }
    const s = q.m.session;
    const p: SessionPhase = s?.phase ?? (s ? (s.open ? "regular" : "closed") : "regular");
    return { quote: p, now: p };
  };
  /** an order trades in a phase: the regular session always; pre-market, after-hours and overnight only a limit order sent for extended
   * hours, where the market's session takes one now */
  const tradesIn = (phase: SessionPhase, o: Pick<PaperOrder, "type" | "extendedHours">, m: Listing): boolean => phase === "regular" || (o.type === "limit" && o.extendedHours === true && m.session?.extendedHours === true && (phase === "pre" || phase === "after" || phase === "overnight"));
  /** whether the quote can fill this order now: anything but a stock any time its market takes orders; a stock when both its quote and its
   * market are in a phase the order trades in */
  const canFillNow = (o: Pick<PaperOrder, "type" | "extendedHours">, q: Quoted, at: number): boolean => {
    if (q.m.kind !== "stock") return true;
    const ph = stockPhases(q, at);
    return tradesIn(ph.quote, o, q.m) && tradesIn(ph.now, o, q.m);
  };
  /** whether the market's own session takes this order now, as its source sees it, whatever the quote's own stamp says: a quote that
   * stopped moving, or is stamped in another phase, fills nothing, but the market is still in a session the order trades in — a resting
   * limit is still on the book */
  const sessionTakes = (o: Pick<PaperOrder, "type" | "extendedHours">, q: Quoted, at: number): boolean => q.m.kind !== "stock" || tradesIn(stockPhases(q, at).now, o, q.m);
  /** THE PHASE A STOCK'S MARKET IS IN NOW, on the market's own clock — no quote's delay in it (stockPhases says the market as a quote fifteen
   * minutes behind sees it, which is only for whether that quote may fill): whether an order is one for now or for a later session. From
   * 16:00 to 16:15 New York the market is in after-hours, though Cboe's quote of 15:50 sees the regular session; from 09:30 to 09:45 it is
   * open, though that quote sees pre-market. A source that keeps no clock: its session as the quote says it */
  const marketPhase = (q: Quoted, at: number): SessionPhase => {
    const clock = q.source.sessions ?? (q.source.id === US_STOCKS_ID ? usClock : undefined);
    return clock ? clock.phaseAt(at) : stockPhases(q, at).now;
  };
  /** whether the market itself takes this order now, by its own clock (marketPhase): a market order in its session is one for now — filled
   * at a real-time quote or refused for want of one — and out of it one queued for the session, whichever quote is at hand */
  const marketTakes = (o: Pick<PaperOrder, "type" | "extendedHours">, q: Quoted, at: number): boolean => q.m.kind !== "stock" || tradesIn(marketPhase(q, at), o, q.m);
  /** a stop, or a trailing stop, is watched only in the regular session for a stock (as a broker's are) */
  const canTriggerNow = (q: Quoted, at: number): boolean => {
    if (q.m.kind !== "stock") return true;
    const ph = stockPhases(q, at);
    return ph.quote === "regular" && ph.now === "regular";
  };
  /** the end of the session a stock's REST belongs to: its market's trading day — the regular close, or for an order sent for extended
   * hours the end of after-hours — the session the market is in as the quote it rested at sees it (its delay behind, delayOf), and its end
   * on the market's own clock, no line's delay in it: each later quote is weighed against it by where the market is as that quote sees it
   * (judge), so a rest earned on a real-time quote is still the session's when a quote fifteen minutes behind answers after the close.
   * Nothing for a market that never closes */
  const restEnd = (o: Pick<PaperOrder, "extendedHours">, q: Quoted, at: number): string | undefined => {
    if (q.m.kind !== "stock") return undefined;
    const clock = q.source.sessions ?? (q.source.id === US_STOCKS_ID ? usClock : undefined);
    if (!clock) return undefined;
    return iso(clock.dayEndAt(at - delayOf(q), o.extendedHours === true));
  };
  /** an order RESTS from now, judged at a quote that could fill it and did not reach it: the book's maker, filled at its own price when the
   * quote reaches it — a stock's within the session it rested in (restEnd) */
  const rest = (o: PaperOrder, q: Quoted, at: number): void => {
    o.rested = true;
    const till = restEnd(o, q, at);
    if (till) o.restedTill = till;
    else delete o.restedTill;
  };

  /** a market as the paper account trades it: the source's own figures, the account's own steps and rule */
  const marketOf = (source: PublicSource, m: Listing): Market => {
    const perp = m.kind === "perp";
    const event = m.kind === "event";
    const stock = m.kind === "stock";
    const ownNote = typeof m.note === "string" && m.note ? ` · ${m.note}` : "";
    const { symbol, name: mname, kind, base, quote, price, bid, ask, open, changePct24h, change24h, volumeUsd24h, contracts24h, closeTime, category, group, outcome, fundingRate, nextFundingAt, fundingEveryH, markPrice, oraclePrice, premium, openInterest, openInterestUsd, implied, issuer, eligibility, session, quoteAt, delayMs, quoteFrom, pastEnd: _p, ...rest } = m as Listing & { pastEnd?: unknown };
    void rest;
    const at = req.clock();
    const stockSession = stock ? (session ?? usSession(at)) : undefined;
    // in session by the market's own clock now (marketTakes), never by a delayed quote's view of it: from 16:00 a market order is queued for
    // the open whatever priced the line, and from 09:30 one is for now — filled at a real-time quote, or refused for want of one
    const inSession = stock ? marketTakes({ type: "market" }, { source, m, at }, at) : true;
    const stockNote = stock && !inSession ? ` · the regular session is not on now: a market order waits for it (queued for the open), a limit order rests${m.session?.extendedHours ? " — or trades now, sent for extended hours" : ""}` : "";
    // a US share in a session that would take a market order now, with no real-time quote at hand (Cboe's the only one, fifteen minutes
    // behind): no market order now, and why — the account's door refuses one when it prepares it (account/live-orders.ts plan)
    // — nor a trailing stop, whose trail starts from the price of this moment
    const refuses = stock && inSession && !realTime({ source, m, at }, US_FRESH_MS) ? { market: stockStale({ source, m, at }, US_FRESH_MS, "taken"), trailing_stop: stockStale({ source, m, at }, US_FRESH_MS, "trail") } : undefined;
    // what the paper account takes here: stops and trailing stops everywhere but an event contract; DAY orders where the market keeps a
    // session (a stock), good-till-canceled everywhere
    // WHERE THE PRICE IS FROM, AND WHEN, on every quote: the source's own stamp where it stamps one (a US stock's line), else the moment its
    // venue answered the read the price came in (public-markets.ts readAtOf) — never the moment a cache handed it on — and the line that
    // priced it. A price is shown as "now" only as old as this says (the page shows its age)
    const own = quoteAt ? Date.parse(quoteAt) : NaN;
    const seen = Number.isFinite(own) ? own : readAtOf(m);
    const from = quoteFrom ?? m.venueName ?? source.name;
    const types: OrderType[] = event ? ["market", "limit"] : ["market", "limit", "stop", "stop_limit", "trailing_stop"];
    const tifs: TimeInForce[] = stock ? ["day", "gtc", "ioc", "fok"] : ["gtc", "ioc", "fok"];
    // a coin's, a perpetual's or a contract's market order is fill-or-kill, and says so: it fills whole or not at all (the book walked), so
    // an immediate-or-cancel one would promise a part filled that never is
    const tifsByType: Partial<Record<OrderType, TimeInForce[]>> = stock ? { stop: ["day", "gtc"], stop_limit: ["day", "gtc"], trailing_stop: ["day", "gtc"] } : { market: ["fok"], stop: ["gtc"], stop_limit: ["gtc"], trailing_stop: ["gtc"] };
    const step = event ? 1 : (pos(m.qtyStep) ?? DEFAULT_QTY_STEP);
    return {
      symbol,
      name: mname,
      kind,
      base,
      quote,
      ...(pos(price) !== undefined ? { price } : {}),
      ...(pos(bid) !== undefined ? { bid } : {}),
      ...(pos(ask) !== undefined ? { ask } : {}),
      minQty: event ? 1 : (pos(m.minQty) ?? step),
      qtyStep: step,
      ...(event ? { priceStep: 0.01 } : pos(m.priceStep) !== undefined ? { priceStep: m.priceStep } : {}),
      // the smallest order its venue takes, where its source says one (Hyperliquid's $10: public-markets.ts hlSteps), else a dollar
      minNotional: pos(m.minNotional) ?? 1,
      open: open !== false,
      // what is said of this market now — its source's own words, its session — apart from the account's fill rule (`rule`), which the
      // ticket folds under "How it fills here": a list's line of it (the Where box) is a line, never the whole rule
      ...(`${ownNote}${stockNote}` ? { note: `${ownNote}${stockNote}`.replace(/^ · /, "") } : {}),
      rule,
      types,
      tifs,
      tifsByType,
      postOnly: false,
      brackets: !event,
      // a perpetual's leverage set here now — the open position's, else the market's (1x unless set): what an order would open at
      ...(perp ? { reduceOnly: true, contractSize: 1, maxLeverage: Math.max(1, Math.floor(pos(m.maxLeverage) ?? 1)), leverage: b.positions[symbol]?.leverage ?? levOf(symbol, Math.max(1, Math.floor(pos(m.maxLeverage) ?? b.markets[symbol]?.maxLeverage ?? 1))), marginModes: ["isolated"] } : { sellsReduce: true }),
      ...(changePct24h !== undefined ? { changePct24h } : {}),
      ...(change24h !== undefined ? { change24h } : {}),
      ...(volumeUsd24h !== undefined ? { volumeUsd24h } : {}),
      ...(contracts24h !== undefined ? { contracts24h } : {}),
      ...(closeTime ? { closeTime } : {}),
      ...(category ? { category } : {}),
      ...(group ? { group } : {}),
      ...(outcome ? { outcome } : {}),
      ...(fundingRate !== undefined ? { fundingRate } : {}),
      ...(nextFundingAt ? { nextFundingAt } : {}),
      ...(fundingEveryH !== undefined ? { fundingEveryH } : {}),
      ...(markPrice !== undefined ? { markPrice } : {}),
      ...(oraclePrice !== undefined ? { oraclePrice } : {}),
      ...(premium !== undefined ? { premium } : {}),
      ...(openInterest !== undefined ? { openInterest } : {}),
      ...(openInterestUsd !== undefined ? { openInterestUsd } : {}),
      ...(implied ? { implied } : {}),
      ...(issuer ? { issuer } : {}),
      ...(eligibility ? { eligibility } : {}),
      ...(stockSession ? { session: stockSession } : session ? { session } : {}),
      ...(seen !== undefined ? { quoteAt: Number.isFinite(own) ? quoteAt! : iso(seen) } : {}),
      ...(delayMs !== undefined ? { delayMs } : {}),
      quoteFrom: from,
      ...(refuses ? { refusesNow: refuses } : {}),
    };
  };

  /** the moment a quote's price is from: its source's own stamp, else when its venue answered the read it came in (public-markets.ts
   * readAtOf) — undefined where neither says */
  const stampOf = (q: Quoted): number | undefined => {
    const own = q.m.quoteAt ? Date.parse(q.m.quoteAt) : NaN;
    return Number.isFinite(own) ? own : readAtOf(q.m);
  };
  // ---- THE STREAM FIRST (live/stream-hub.ts) ------------------------------------------------------------------------------------------
  /** the hub as the account runs it now (none: every quote is the listing, as before it was built), its ticks listened to from the first
   * time it is seen; none once the account is let go (stop) */
  let heardHub: MarketHub | undefined;
  let offTicks: (() => void) | undefined;
  let stopped = false;
  const hubNow = (): MarketHub | undefined => {
    if (stopped) return undefined;
    const hub = req.hub?.();
    if (hub && hub !== heardHub) {
      offTicks?.();
      heardHub = hub;
      offTicks = hub.onTick((t) => onTick(t));
    }
    return hub;
  };
  /** A LISTING WITH ITS STREAM'S PRICES OVER IT: the best bid and ask of the stream's moment (and their sizes), the price as the listing
   * says it — a perpetual's its mid (its mark where there is no book), a coin's its last trade — a perpetual's mark (Hyperliquid's markPx,
   * what it is marked and liquidated at) and its funding rate, the moment the stream last confirmed it, and the stream it came over. What
   * the market is stays the listing's */
  const streamed = (q: { source: PublicSource; m: Listing }, st: HubQuote): Quoted => {
    // A US SHARE's quote from the background reader (live/us-quotes.ts UsQuoteFeed: Robinhood's or Nasdaq's, read as they write it): the
    // line said again at it — its price, bid, ask, own stamp, delay and source, the session and the extended-hours offer as the line says them
    // with it (public-stocks.ts usLineAt) — never the moment it was read
    if (q.m.kind === "stock" && st.us) return { source: q.source, m: usLineAt(q.m, st.us, req.clock()), at: st.recvAt, from: "stream", seq: st.seq };
    const perp = q.m.kind === "perp";
    const mid = st.bid !== undefined && st.ask !== undefined && st.ask >= st.bid ? round((st.bid + st.ask) / 2, 10) : undefined;
    const price = perp ? (mid ?? st.mark ?? st.last) : (st.last ?? mid);
    // a perpetual's own figures as its stream says them now (Hyperliquid's activeAssetCtx): its mark, oracle, premium and open interest
    // (in dollars at that mark), the day's dollars traded, and the day's change at this price from the price 24 hours ago
    const mark = perp ? (st.mark ?? q.m.markPrice) : undefined;
    const day = perp && price !== undefined && st.prevDayPx !== undefined ? { change24h: round(price - st.prevDayPx, 10), changePct24h: round((price / st.prevDayPx - 1) * 100, 10) } : {};
    const own: Partial<Listing> = perp ? { ...(st.mark !== undefined ? { markPrice: st.mark } : {}), ...(st.oracle !== undefined ? { oraclePrice: st.oracle } : {}), ...(st.premium !== undefined ? { premium: st.premium } : {}), ...(st.openInterest !== undefined ? { openInterest: st.openInterest, ...(mark !== undefined ? { openInterestUsd: round(st.openInterest * mark, 2) } : {}) } : {}), ...(st.volumeUsd24h !== undefined ? { volumeUsd24h: st.volumeUsd24h } : {}), ...day } : {};
    const m: Listing = { ...q.m, ...(price !== undefined ? { price } : {}), bid: st.bid, ask: st.ask, quoteAt: iso(st.seenAt), quoteFrom: `${st.src} · live`, ...(perp && st.funding !== undefined ? { fundingRate: st.funding } : {}), ...own };
    return { source: q.source, m, at: st.seenAt, from: "stream", ...(st.mark !== undefined ? { mark: st.mark } : {}), ...(st.bidSz !== undefined ? { bidSz: st.bidSz } : {}), ...(st.askSz !== undefined ? { askSz: st.askSz } : {}), seq: st.seq };
  };
  /** the market's live stream over `k` (its listing as its source gave it) while the stream is live — its book too, where a page holds
   * it — and, where `want` says, the market wanted from the hub as it is asked (its interest renewed a minute) */
  const fromStream = (symbol: string, k: { source: PublicSource; m: Listing }, want: boolean): Quoted | undefined => {
    const hub = hubNow();
    if (!hub || !hub.covers(k.source.id, symbol)) return undefined;
    if (want) hub.want(k.source.id, symbol);
    const st = hub.quote(k.source.id, symbol);
    if (!st?.live) return undefined;
    const q = streamed(k, st);
    const hb = hub.book(k.source.id, symbol, WALK_DEPTH);
    return hb?.live ? { ...q, book: { bids: hb.bids, asks: hb.asks } } : q;
  };
  /** kept as the market's last quote, with the moment it is from (the stream's, or when its venue answered, where that is known) — a
   * perpetual's price there its mark, where its stream gives one */
  const keepLast = (symbol: string, got: Quoted): Quoted => {
    const ref = b.markets[symbol];
    if (!ref) return got;
    const price = got.m.kind === "perp" ? (got.mark ?? pos(got.m.price)) : pos(got.m.price);
    ref.last = { ...(price !== undefined ? { price } : {}), ...(pos(got.m.bid) !== undefined ? { bid: got.m.bid } : {}), ...(pos(got.m.ask) !== undefined ? { ask: got.m.ask } : {}), at: stampOf(got) ?? got.at };
    if (pos(got.m.maxLeverage) !== undefined) ref.maxLeverage = got.m.maxLeverage;
    if (got.m.closeTime) ref.closeTime = got.m.closeTime;
    return got;
  };
  /** WHETHER THE BOOK HAS AN INTEREST IN A MARKET NOW — an order open or waiting in it, a perpetual position, a holding — so its stream is
   * wanted as it is quoted (the hub streams what the account trades and what a page shows, and no more: a market traded once and left is
   * read, never streamed again for it) */
  const interested = (symbol: string): boolean => !!b.positions[symbol] || (b.holdings[symbol]?.qty ?? 0) > 0 || openIn(symbol).length > 0;
  /** A QUOTE for a market the book knows or the sources list: its live stream's while it is live and the listing it stands on is young
   * (LISTING_STANDS_MS) — nothing asked of the source then — else its source's listing (and its stream's prices over it, where the stream
   * has come live meanwhile), and how old it is. Its stream is wanted from the hub (`want`) where the book has an interest in the market
   * (interested), or the caller says so (an order being placed, a ticket's market): a read that only looks — the 24 hours of every market
   * the book ever traded, a market's bars — reads the stream where someone else wants it, and renews no interest */
  const quote = async (symbol: string, o: { want?: boolean | undefined } = {}): Promise<Quoted | undefined> => {
    const ref = b.markets[symbol];
    const want = o.want ?? interested(symbol);
    const k = pricer.knownOf(symbol, ref);
    const fast = k && req.clock() - k.at < LISTING_STANDS_MS ? fromStream(symbol, k, want) : undefined;
    if (fast) return keepLast(symbol, fast);
    const got = await pricer.find(symbol, ref);
    if (!got) return got;
    return keepLast(symbol, fromStream(symbol, got, want) ?? got);
  };

  // ---- A PRICE FRESH ENOUGH TO FILL AT, AND THE BOOK WALKED --------------------------------------------------------------------------
  /** the markets whose fills need a price FILL_FRESH_MS old at most: a coin or a perpetual an exchange lists — not a stock (its sessions
   * and its source's delay rule its fills), an event contract, a token */
  const crypto = (q: Quoted): boolean => (q.m.kind === "spot" || q.m.kind === "perp") && q.source.kind === "exchange";
  const ageOf = (q: Quoted): number => req.clock() - (stampOf(q) ?? q.at);
  /** whether anything fresher than its listing can be had for a market: its live stream, or its source's order book. A market whose source
   * has neither (a pre-IPO venue's contract) fills, triggers and rests at its listing, whose age the fill says — as it did before streams */
  const fresherCanBe = (q: Quoted): boolean => !!q.source.book || !!hubNow()?.covers(q.source.id, q.m.symbol);
  /** A PRICE A COIN'S OR A PERPETUAL'S FILL MAY TAKE — ONE RULE for an order placed and an order resting alike: a bid AND an ask (a listing
   * that gives the last trade only — Coinbase's, Hyperliquid's mid — is no price to fill at, buy or sell), at most FILL_FRESH_MS old where
   * the stream said them, at most BOOK_FRESH_MS from when its venue answered where the source's order book was read for it (the source keeps
   * a book BOOK_MS). A market nothing fresher can be had for: its listing as it is. Anything else: always */
  const fresh = (q: Quoted): boolean => (q.m.kind === "stock" ? realTime(q, STOCK_JUDGE_MS) : !crypto(q) || !fresherCanBe(q) || (pos(q.m.bid) !== undefined && pos(q.m.ask) !== undefined && ageOf(q) <= (q.from === "book" ? BOOK_FRESH_MS : FILL_FRESH_MS)));
  /** A US SHARE'S REAL-TIME QUOTE, at most `maxAgeMs` old by its own stamp: no delay said (Robinhood's, Nasdaq's — never Cboe's file,
   * fifteen minutes behind, nor the old delayed line with no stamp), and a stamp its source gave. An order placed now takes one as old as
   * the US line takes a real-time quote at all (US_FRESH_MS); an open order is judged only at one STOCK_JUDGE_MS old at most */
  const realTime = (q: Quoted, maxAgeMs: number): boolean => q.m.kind === "stock" && delayOf(q) === 0 && Number.isFinite(Date.parse(q.m.quoteAt ?? "")) && ageOf(q) <= maxAgeMs;
  const secs = (ms: number): string => (ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
  /** why a US share's quote fills nothing now, in words: the only quote is Cboe's — fifteen minutes behind the market — or the old delayed
   * line's; or its real-time quote is older than the order may take */
  const stockStale = (q: Quoted, maxAgeMs: number, said: "filled" | "taken" | "trail" = "filled"): string => {
    const name = q.m.name || q.m.symbol;
    const delay = delayOf(q);
    const so = said === "filled" ? "so nothing was filled" : said === "taken" ? "so it takes no market order now" : "so a trailing stop has no price of this moment to trail from";
    // the source by its name alone ("Cboe · 15 min delayed" is Cboe's)
    if (delay > 0) return `the only quote of ${name} just now is ${(q.m.quoteFrom ?? q.source.name).replace(/\s*·.*$/, "")}'s, ${Math.round(delay / 60_000)} minutes behind the market: a paper account never fills a stock at a delayed quote, ${so} — use a limit order, which rests until a real-time quote reaches it`;
    const at = Date.parse(q.m.quoteAt ?? "");
    if (!Number.isFinite(at)) return `${name}'s quote carries no time of its own, so it is not known to be real time: ${so} — use a limit order, which rests until a real-time quote reaches it`;
    return `the latest real-time quote of ${name} (${q.m.quoteFrom ?? q.source.name}) is ${secs(ageOf(q))} old: a stock fills only at a real-time quote at most ${secs(maxAgeMs)} old, ${so} — try again in a moment, or use a limit order`;
  };
  /** A US SHARE'S QUOTE A FILL MAY TAKE: the one at hand where it is real time and young enough (realTime), else the background reader's
   * live quote of it now (live/us-quotes.ts UsQuoteFeed, over its listing), else why not, in words (stockStale) */
  const stockFor = (q: Quoted, symbol: string, maxAgeMs: number): Quoted | string => {
    if (realTime(q, maxAgeMs)) return q;
    const hub = hubNow();
    const st = hub?.covers(q.source.id, symbol) ? hub.quote(q.source.id, symbol) : undefined;
    const s = st?.live ? streamed(q, st) : undefined;
    return s && realTime(s, maxAgeMs) ? s : stockStale(q, maxAgeMs);
  };
  /** an order book as a quote's prices: its best bid and ask, read at `at`, and its levels (for the walk) */
  const fromBook = (q: Quoted, book: OrderBook, at: number): Quoted => {
    const [bid, bidSz] = book.bids[0] ?? [];
    const [ask, askSz] = book.asks[0] ?? [];
    return { ...q, m: { ...q.m, bid: pos(bid), ask: pos(ask), quoteAt: iso(at), quoteFrom: `${book.from} · order book` }, at, from: "book", ...(pos(bidSz) !== undefined ? { bidSz: pos(bidSz) } : {}), ...(pos(askSz) !== undefined ? { askSz: pos(askSz) } : {}), book: { bids: book.bids, asks: book.asks } };
  };
  /** the source's order book read for a fill, while it is fresh enough to stand for one (BOOK_FRESH_MS, from when its venue answered) */
  const bookNow = async (q: Quoted, symbol: string): Promise<{ book: OrderBook; at: number } | undefined> => {
    if (!q.source.book) return undefined;
    const book = await inTime(q.source.book(symbol, WALK_DEPTH), SOURCE_MS);
    if (!book || isRefusal(book) || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return undefined;
    const stamped = Date.parse(book.at);
    const at = readAtOf(book) ?? (Number.isFinite(stamped) ? stamped : undefined);
    if (at === undefined || req.clock() - at > BOOK_FRESH_MS) return undefined;
    return { book, at };
  };
  /** A PRICE FRESH ENOUGH TO FILL AT (fresh: a bid and an ask, FILL_FRESH_MS old for a coin or a perpetual): the quote as it is when it is;
   * else its live stream's next word that confirms it (waited for CONFIRM_WAIT_MS); else its source's order book read now; else why not,
   * in words. A market whose source has neither a stream nor a book (a pre-IPO venue's contract) is fresh as it is (fresherCanBe) */
  const freshFor = async (q: Quoted, symbol: string): Promise<Quoted | string> => {
    if (fresh(q)) return q;
    // a US share: a real-time quote STOCK_JUDGE_MS old at most — the background reader's where the one at hand is not — or why not
    if (q.m.kind === "stock") return stockFor(q, symbol, STOCK_JUDGE_MS);
    const hub = hubNow();
    const streams = !!hub && hub.covers(q.source.id, symbol);
    if (hub && streams) {
      const st = await hub.confirmed(q.source.id, symbol, FILL_FRESH_MS, CONFIRM_WAIT_MS);
      const s = st ? streamed(q, st) : undefined;
      if (s && fresh(s)) return s;
    }
    const read = await bookNow(q, symbol);
    const fromRead = read ? fromBook(q, read.book, read.at) : undefined;
    if (fromRead && fresh(fromRead)) return fromRead;
    const name = q.m.venueName ?? q.source.name;
    const sided = pos(q.m.bid) !== undefined && pos(q.m.ask) !== undefined;
    const said = sided ? `the latest price of ${q.m.name} is ${secs(ageOf(q))} old` : q.from === "stream" ? `the latest quote of ${q.m.name} on its stream carries no bid and ask` : `the latest quote of ${q.m.name} is its last trade only, with no bid and ask`;
    const stream = !streams ? `${name} streams no price here` : hub?.quote(q.source.id, symbol)?.live ? `no newer price has come on ${name}'s live stream` : `${name}'s live stream is not live just now`;
    return `${said} (${stream}, and its order book did not answer in time): a paper fill takes a bid and an ask at most ${FILL_FRESH_MS / 1000} s old, so nothing was filled — try again in a moment`;
  };
  /** A MARKET ORDER WALKS THE BOOK (P2): the levels on its side, best first, as far as the worst price its door gave it, until its size is
   * filled — at the average of what it took. A book that does not hold the size within that: how much it does hold (no partial fills), and
   * whether a level past the worst price is what stopped the walk (`worst`: a deeper book would not change it) */
  const walk = (side: Side, qty: number, levels: ReadonlyArray<readonly [number, number | null]>, worst?: number): { avg: number } | { short: number; levels: number; worst: boolean } => {
    let left = qty;
    let cost = 0;
    let shown = 0;
    let n = 0;
    for (const [px, sz] of levels) {
      if (worst !== undefined && (side === "buy" ? px > worst + 1e-12 : px < worst - 1e-12)) return { short: round(shown, 12), levels: n, worst: true };
      if (!(typeof sz === "number" && sz > 0)) continue;
      n++;
      const take = Math.min(left, sz);
      cost += take * px;
      left = round(left - take, 12);
      shown += sz;
      if (left <= 1e-12) return { avg: round(cost / qty, 10) };
    }
    return { short: round(shown, 12), levels: n, worst: false };
  };
  /** an average a walk of the book came to, to two places past the market's own price step (an event contract's cent): a fill's price is
   * said as a price, never as a float's tail (13.78556909 at a step of 0.001 is 13.78557). A market whose step is not said: as it came */
  const stepAvg = (avg: number, q: Quoted): number => {
    const step = q.m.kind === "event" ? 0.01 : pos(q.m.priceStep);
    if (step === undefined) return avg;
    const places = Math.min(10, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)) + 2);
    return round(avg, places);
  };
  /** THE PRICE A MARKET ORDER FILLS AT: the ask (a buy) or the bid (a sell) where the best level holds its size; else the book walked — the
   * one at hand (its stream's, or the one read for this fill) or the source's read now, and where the stream's book (its venue's top
   * levels only: Hyperliquid's and OKX's five, Kraken's ten) does not hold the size, the source's own read for it (WALK_DEPTH levels)
   * before the order is refused. Only a source that publishes no book, with no size said at its best level, fills at the top as it is: a
   * size known to be more than the best level holds, or a book that did not answer in time, fills nothing. Or why not, in words */
  const takeAt = async (o: Pick<PaperOrder, "side" | "qty" | "worstPrice" | "symbol">, q: Quoted): Promise<number | string> => {
    const px = sideQuote(o.side, q.m);
    if (px === undefined) return `${q.m.name} shows no ${o.side === "buy" ? "ask" : "bid"} just now`;
    const top = o.side === "buy" ? q.askSz : q.bidSz;
    if (top !== undefined && o.qty <= top + 1e-12) return px;
    const sideOf = (bk: { bids: Array<[number, number | null]>; asks: Array<[number, number | null]> }) => (o.side === "buy" ? bk.asks : bk.bids);
    const sized = (lv: ReadonlyArray<readonly [number, number | null]> | undefined): boolean => !!lv?.length && !lv.every(([, sz]) => sz === null);
    let levels = q.book ? sideOf(q.book) : undefined;
    let w = sized(levels) ? walk(o.side, o.qty, levels!, o.worstPrice) : undefined;
    // no book at hand, or the stream's top levels hold less than the size short of the worst price: the source's own book, read for it
    const deeper = !!w && "short" in w && !w.worst && q.from === "stream" && levels!.length < WALK_DEPTH;
    if (!w || deeper) {
      const read = await bookNow(q, o.symbol);
      const more = read ? sideOf(read.book) : undefined;
      if (sized(more)) {
        levels = more;
        w = walk(o.side, o.qty, more!, o.worstPrice);
      }
    }
    if (!w) {
      if (!q.source.book && top === undefined) return px;
      const why = q.source.book ? "the order book did not answer in time to walk" : `${q.m.venueName ?? q.source.name} gives no order book to walk`;
      return top !== undefined
        ? `the best ${o.side === "buy" ? "ask" : "bid"} holds ${qtyText(top)}, less than the ${qtyText(o.qty)} asked, and ${why}: a market order larger than the best level fills only against the book, whole or not at all — a smaller size, or try again in a moment`
        : `the best ${o.side === "buy" ? "ask" : "bid"} says no size, and ${why}: a market order fills only against the book it can see, whole or not at all — try again in a moment`;
    }
    if ("avg" in w) return stepAvg(w.avg, q);
    const ref = b.markets[o.symbol];
    const unit = ref?.kind === "event" ? "contracts" : (ref?.base ?? q.m.base);
    return `the order book shows ${qtyText(w.short)} ${unit} on the ${o.side === "buy" ? "ask" : "bid"} side ${o.worstPrice !== undefined ? `within the worst price the order allows (${fig(o.worstPrice)})` : `in the ${w.levels} levels read`}, less than the ${qtyText(o.qty)} asked: a market order here fills whole or not at all — a smaller size, or a limit order that rests until it can`;
  };

  const stateOf = (o: PaperOrder): OrderState => {
    const legs = (o.children ?? []).map((r) => b.orders[r]).filter((x): x is PaperOrder => !!x);
    return { ref: o.ref, status: o.status, filledQty: o.filledQty, ...(o.avgPrice !== undefined ? { avgPrice: o.avgPrice } : {}), ...(o.feeUsd !== undefined ? { feeUsd: o.feeUsd } : {}), native: { paper: true, book: b.id, order: o.ref, type: o.type, ...(o.realizedUsd !== undefined ? { realizedUsd: o.realizedUsd } : {}), ...(o.stopPrice !== undefined ? { stopPrice: o.stopPrice } : {}), ...(o.triggeredAt ? { triggeredAt: o.triggeredAt } : {}), ...(o.expiresAt ? { expiresAt: o.expiresAt } : {}), ...(o.note ? { note: o.note } : {}), ...(legs.length ? { legs: legs.map((l) => ({ ref: l.ref, clientId: l.clientId, at: l.at, type: l.type, side: l.side, qty: l.qty, status: l.status, filledQty: l.filledQty, ...(l.feeUsd !== undefined ? { feeUsd: l.feeUsd } : {}), ...(l.limitPrice !== undefined ? { limitPrice: l.limitPrice } : {}), ...(l.stopPrice !== undefined ? { stopPrice: l.stopPrice } : {}), ...(l.avgPrice !== undefined ? { avgPrice: l.avgPrice } : {}), ...(l.filledAt ? { filledAt: l.filledAt } : {}), ...(l.note ? { note: l.note } : {}) })) } : {}) } };
  };
  const reject = (message: string): Refusal => no("E_VENUE_REJECTED", { venue, message: `${b.name}: ${message}` });
  const record = (f: PaperFill): void => {
    b.fills.push(f);
    if (b.fills.length > FILLS_KEPT) b.fills.splice(0, b.fills.length - FILLS_KEPT);
  };

  /** A POSITION OR A HOLDING AS THE ACCOUNT READS IT (Position): what positions() lists, and what the book tells as it changes
   * (PaperPositionSaid) — one shape from one place, so a row a page patched from a change and the row it reads next agree. A perpetual: its
   * side, size, entry, what it is worth at `mark` and its result there, its leverage, isolated margin, its liquidation price (at the most
   * leverage its source shows: the market's kept, else `maxLeverage` as the quote said it), its margin and funding; a holding: its size,
   * what was paid a unit (fees in it) and what it cost, what it is worth at `mark` and its result. `markAt`, the moment the mark is from,
   * goes with the mark. Nothing held in the market: undefined */
  function positionRow(symbol: string, mark: number | undefined, markAt: number | undefined, maxLeverage?: number): Position | undefined {
    const ref = b.markets[symbol];
    const p = b.positions[symbol];
    const marked = mark !== undefined && markAt !== undefined ? { markAt } : {};
    if (p) {
      const pnl = mark !== undefined ? round((p.side === "long" ? mark - p.entryPrice : p.entryPrice - mark) * p.qty, 6) : undefined;
      const most = Math.max(1, ref?.maxLeverage ?? maxLeverage ?? 1);
      const liq = liquidationPriceOf(p, most);
      return { symbol, name: ref?.name ?? symbol, kind: "perp", side: p.side, qty: p.qty, entryPrice: p.entryPrice, ...(mark !== undefined ? { markPrice: mark, usd: round(p.qty * mark, 2) } : {}), ...(pnl !== undefined ? { unrealizedUsd: pnl } : {}), leverage: p.leverage ?? 1, marginMode: "isolated", ...(liq !== undefined ? { liquidationPrice: liq } : {}), marginUsd: p.marginUsd, fundingUsd: p.fundingUsd ?? 0, native: { paper: true, book: b.id, marginUsd: p.marginUsd, fundingUsd: p.fundingUsd ?? 0, maxLeverage: most, ...marked } };
    }
    const h = b.holdings[symbol];
    if (!ref || !h || !(h.qty > 0)) return undefined;
    const worth = mark !== undefined ? round(h.qty * mark, 2) : undefined;
    // its entry: the average price its fills were at, as a venue says a position's entry — the fees left out of it (they are in its cost,
    // and so in its result); a book from before that was kept: what was paid a unit, fees in it
    const entry = pos(h.entryUsd) !== undefined ? h.entryUsd! / h.qty : h.costUsd / h.qty;
    return { symbol, name: ref.name, kind: ref.kind, side: "long", qty: h.qty, entryPrice: round(entry, 10), ...(mark !== undefined ? { markPrice: mark } : {}), ...(worth !== undefined ? { usd: worth, unrealizedUsd: round(worth - h.costUsd, 2) } : {}), costUsd: round(h.costUsd, 6), native: { paper: true, book: b.id, ...marked } };
  }

  // ---- what the book tells as it changes (PaperChange): each write set beside the one before it ----
  const listeners = new Set<(c: PaperChange) => void>();
  /** an order as it was last told: the fields whose change is worth a word (a trailing stop's stop among them) */
  const orderSig = (o: PaperOrder): string => `${o.status}|${o.filledQty}|${o.qty}|${o.limitPrice ?? ""}|${o.stopPrice ?? ""}|${o.triggeredAt ?? ""}|${o.avgPrice ?? ""}|${o.note ?? ""}`;
  /** a market's position or holding as it was last told ("" when there is none) */
  const heldSig = (symbol: string): string => {
    const p = b.positions[symbol];
    const h = b.holdings[symbol];
    return p ? `p|${p.side}|${p.qty}|${p.entryPrice}|${p.marginUsd}|${p.leverage ?? 1}` : h && h.qty > 0 ? `h|${h.qty}|${h.costUsd}` : "";
  };
  const toldOrders = new Map<string, string>();
  /** the orders told as still on the book (open, partial, pending), as they were told: one gone from the book with no word of its end (the
   * book started again) is told once more, canceled, with the fields a page's row of it has */
  const toldOpen = new Map<string, PaperOrderSaid>();
  const onBook = (o: { status: OrderStatus }): boolean => o.status === "open" || o.status === "partial" || o.status === "pending";
  const toldHeld = new Map<string, string>();
  let toldFill: PaperFill | undefined;
  let toldCash = b.cashUsd;
  let toldReset = b.resetFrom?.at;
  /** the book as it stands taken as told: nothing in it is news to a listener that comes now */
  const toldNow = (): void => {
    toldOrders.clear();
    toldOpen.clear();
    for (const o of Object.values(b.orders)) {
      toldOrders.set(o.ref, orderSig(o));
      if (onBook(o)) toldOpen.set(o.ref, orderSaid(o));
    }
    toldHeld.clear();
    for (const s of new Set([...Object.keys(b.positions), ...Object.keys(b.holdings)])) {
      const sig = heldSig(s);
      if (sig) toldHeld.set(s, sig);
    }
    toldFill = b.fills[b.fills.length - 1];
    toldCash = b.cashUsd;
    toldReset = b.resetFrom?.at;
  };
  const orderSaid = (o: PaperOrder): PaperOrderSaid => {
    const ref = b.markets[o.symbol];
    return { ref: o.ref, clientId: o.clientId, symbol: o.symbol, name: ref?.name ?? o.symbol, kind: ref?.kind ?? "spot", side: o.side, type: o.type, qty: o.qty, status: o.status, filledQty: o.filledQty, ...(o.avgPrice !== undefined ? { avgPrice: o.avgPrice } : {}), ...(o.feeUsd !== undefined ? { feeUsd: o.feeUsd } : {}), ...(o.limitPrice !== undefined ? { limitPrice: o.limitPrice } : {}), ...(o.stopPrice !== undefined ? { stopPrice: o.stopPrice } : {}), ...(o.parent ? { parent: o.parent } : {}), ...(o.note ? { note: o.note } : {}), at: o.at, updatedAt: o.updatedAt };
  };
  const fillSaid = (f: PaperFill): PaperFillSaid => {
    const o = b.orders[f.ref];
    const ref = b.markets[f.symbol];
    return { ...f, name: ref?.name ?? f.symbol, kind: ref?.kind ?? "spot", ...(o ? { clientId: o.clientId, filledQty: o.filledQty } : {}) };
  };
  /** a market's position or holding as the book tells it: positionRow, marked at the last quote the book kept for the market (a fill's own,
   * usually: no quote is asked here — the book is told as it is written) as positions() marks it — a perpetual at the price, a holding at
   * the price or else the bid */
  const positionSaid = (symbol: string): PaperPositionSaid => {
    const last = b.markets[symbol]?.last;
    const mark = pos(last?.price) ?? (b.positions[symbol] ? undefined : pos(last?.bid));
    return { symbol, position: positionRow(symbol, mark, last?.at) ?? null };
  };
  /** this write set beside the one before it, and told: nothing when no one listens (the first listener takes the book as it stands then) or
   * when the write moved none of it. A listener that throws is its own fault: the book and the other listeners go on */
  const tell = (): void => {
    if (!listeners.size) {
      // no one listens: the first listener takes the book as it stands then (toldNow)
      freshRefs.clear();
      ordersGone = false;
      return;
    }
    const orders: PaperOrderSaid[] = [];
    // the orders that can have moved since the last word: those open (the index), those put on the book since and those found closed since
    // (freshRefs), and those told as still on the book — an order closed changes no more, so the book's whole past is never read again here
    const refs = new Set<string>([...freshRefs, ...toldOpen.keys()]);
    for (const set of openBy.values()) for (const r of set) refs.add(r);
    freshRefs.clear();
    for (const ref of [...refs].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))) {
      const o = b.orders[ref];
      if (!o) continue;
      const sig = orderSig(o);
      if (toldOrders.get(o.ref) === sig) continue;
      toldOrders.set(o.ref, sig);
      const said = orderSaid(o);
      if (onBook(o)) toldOpen.set(o.ref, said);
      else toldOpen.delete(o.ref);
      orders.push(said);
    }
    // the orders gone from the book (the book started again, or pruned to the archive): forgotten — and one last told as still on it is
    // told once more, canceled with the book, so a page's list of open orders never keeps a row for an order that is no more
    if (ordersGone || [...toldOpen.keys()].some((r) => !b.orders[r])) {
      ordersGone = false;
      for (const ref of [...toldOrders.keys()]) {
        if (b.orders[ref]) continue;
        toldOrders.delete(ref);
        const was = toldOpen.get(ref);
        toldOpen.delete(ref);
        if (was) orders.push({ ...was, status: "canceled", note: "the book started again", updatedAt: iso(req.clock()) });
      }
    }
    // the fills after the last one told: every fill there when that one is not (the book started again)
    const from = toldFill ? b.fills.lastIndexOf(toldFill) : -1;
    const fills = b.fills.slice(from + 1).map(fillSaid);
    toldFill = b.fills[b.fills.length - 1];
    const positions: PaperPositionSaid[] = [];
    for (const s of new Set([...Object.keys(b.positions), ...Object.keys(b.holdings), ...toldHeld.keys()])) {
      const sig = heldSig(s);
      if ((toldHeld.get(s) ?? "") === sig) continue;
      if (sig) toldHeld.set(s, sig);
      else toldHeld.delete(s);
      positions.push(positionSaid(s));
    }
    const cash = b.cashUsd !== toldCash ? round(b.cashUsd, 2) : undefined;
    toldCash = b.cashUsd;
    const reset = b.resetFrom && b.resetFrom.at !== toldReset ? { archived: b.resetFrom.file, at: b.resetFrom.at } : undefined;
    toldReset = b.resetFrom?.at;
    if (!orders.length && !fills.length && !positions.length && cash === undefined && !reset) return;
    const change: PaperChange = { orders, fills, positions, ...(cash !== undefined ? { cashUsd: cash } : {}), ...(reset ? { reset } : {}), summary: summaryNow() };
    for (const fn of [...listeners]) {
      try {
        fn(change);
      } catch {
        // a listener's fault is its own
      }
    }
  };
  /** the book said of itself (summaryOf), its open orders counted from the index */
  const summaryNow = (): PaperBookSummary => summaryOf(b, openAll().length);
  const events: PaperEvents = {
    listen(fn) {
      if (!listeners.size) toldNow();
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
  /** what a fill pays in charges, in dollars: a US share nothing (no commission, as a broker charges none), anything else the book's fee */
  const chargesOf = (ref: PaperMarketRef, notional: number): number => (ref.kind === "stock" ? 0 : round((notional * b.feeBps) / 10_000, 6));

  /** A POSITION'S EXITS GO WITH IT: once a perpetual position or a holding is gone — closed, sold, liquidated — every exit still open in its
   * market is canceled: a bracket's take-profit and stop-loss and, on a perpetual, any reduce-only order. Nothing is left for them to
   * close, and left standing one would close the next position opened in the market. `side`: only the exits on that side (a holding's
   * are sells; the buy-back of a sell's bracket needs no holding) */
  const cancelExits = (symbol: string, side: Side | undefined, note: string, at: number): void => {
    for (const x of openIn(symbol)) if (x.status === "open" && (x.parent || x.reduceOnly) && (!side || x.side === side)) Object.assign(x, { status: "canceled", note, updatedAt: iso(at) });
  };

  /** the fill itself: money, holdings or the position moved by the account's rule, or why the paper money is not there. `q` is the quote it
   * fills at: a perpetual's funding owed is settled at it before the position moves */
  const fill = (o: PaperOrder, px: number, at: number, q: Quoted): Refusal | undefined => {
    const ref = b.markets[o.symbol]!;
    // a bracket's exit closes what is left of its position and never more: one larger than what is held now (the position reduced, or part
    // of the holding sold, since it was placed) is trimmed to it, as a venue's reduce-only order is — and so is a close of the whole holding
    if (o.parent || o.closesAll) {
      const p = b.positions[o.symbol];
      const left = ref.kind === "perp" ? (p && (p.side === "long" ? "sell" : "buy") === o.side ? p.qty : undefined) : o.side === "sell" ? b.holdings[o.symbol]?.qty : undefined;
      if (left !== undefined && left > 0 && o.qty > left + 1e-12) o.qty = left;
    }
    const notional = round(o.qty * px, 8);
    const fee = chargesOf(ref, notional);
    let realized: number | undefined;
    /** the position or the holding this fill closed whole, and a perpetual's position this fill reduced rather than opened or added to */
    let gone = false;
    let reduced = false;
    /** a part closed at a loss past its own share of the margin: what the margin of the rest of the position took of it */
    let fromRest = 0;
    if (ref.kind === "perp") {
      const p = b.positions[o.symbol];
      const opposite = !!p && ((p.side === "long" && o.side === "sell") || (p.side === "short" && o.side === "buy"));
      if (o.reduceOnly && !opposite) return reject(`reduce-only: no ${o.side === "sell" ? "long" : "short"} position in ${o.symbol} to reduce`);
      if (opposite && p) {
        if (o.qty > p.qty + 1e-12) return reject(o.reduceOnly ? `reduce-only: ${qtyText(o.qty)} is more than the ${qtyText(p.qty)} held` : `${qtyText(o.qty)} is more than the ${p.side} position of ${qtyText(p.qty)}: it would flip the side — close the position first, then open the other way`);
        // the funding of every whole hour it stood is paid before the close takes its margin: a close by hand, or an exit judged while the
        // look's own quote did not come back, never drops the hours owed
        payFunding(o.symbol, p, q, at);
        reduced = true;
        const part = o.qty / p.qty;
        const margin = round(p.marginUsd * part, 6);
        realized = round((p.side === "long" ? px - p.entryPrice : p.entryPrice - px) * o.qty, 6);
        // isolated margin: the position's own margin, and nothing more, is lost — a close past it (a stop after a gap, the owner's close of a
        // position the look has not liquidated yet) gives nothing back and takes nothing from the cash; what it did not take is written on
        // the order, so the book's past can be told again exactly
        const back = margin + realized - fee;
        let lost = back < 0 ? round(-back, 6) : 0;
        b.cashUsd = round(b.cashUsd + Math.max(0, back), 6);
        if (o.qty >= p.qty - 1e-12) {
          delete b.positions[o.symbol];
          gone = true;
        } else {
          // a part closed past its own share of the margin: the margin is the whole position's, so the rest of that loss comes out of the
          // margin of what is left first — a remainder whose margin is gone is liquidated at the next look — and only what is past all of it
          // is lost to isolated margin
          fromRest = round(Math.min(lost, Math.max(0, p.marginUsd - margin)), 6);
          lost = round(lost - fromRest, 6);
          p.qty = round(p.qty - o.qty, 12);
          p.marginUsd = round(p.marginUsd - margin - fromRest, 6);
        }
        if (lost > 0) o.lossPastMarginUsd = lost;
      } else {
        const lev = p?.leverage ?? levOf(o.symbol, ref.maxLeverage ?? 1);
        const margin = round(notional / lev, 6);
        // what the other open orders hold is not this order's to take (P1)
        const h = holds(o);
        if (b.cashUsd - h.cashUsd + 1e-9 < margin + fee) return no("E_VENUE_INSUFFICIENT", { venue, message: `${b.name}: not enough paper money — ${usd(margin + fee)} needed as margin and fee at ${lev}x, ${usd(h.cashUsd > 0 ? Math.max(0, b.cashUsd - h.cashUsd) : b.cashUsd)} ${h.cashUsd > 0 ? "free" : "there"}${heldWords(h)}` });
        // added to: the hours it stood are paid at the size it stood at, before it grows
        if (p) payFunding(o.symbol, p, q, at);
        b.cashUsd = round(b.cashUsd - margin - fee, 6);
        if (p) {
          p.entryPrice = round((p.entryPrice * p.qty + px * o.qty) / (p.qty + o.qty), 10);
          p.qty = round(p.qty + o.qty, 12);
          p.marginUsd = round(p.marginUsd + margin, 6);
        } else b.positions[o.symbol] = { side: o.side === "buy" ? "long" : "short", qty: o.qty, entryPrice: px, marginUsd: margin, leverage: lev, fundingUsd: 0, fundedAt: at, openedAt: at };
      }
    } else if (o.side === "buy") {
      const others = holds(o);
      if (b.cashUsd - others.cashUsd + 1e-9 < notional + fee) return no("E_VENUE_INSUFFICIENT", { venue, message: `${b.name}: not enough paper money — ${usd(notional + fee)} needed, ${usd(others.cashUsd > 0 ? Math.max(0, b.cashUsd - others.cashUsd) : b.cashUsd)} ${others.cashUsd > 0 ? "free" : "there"}${heldWords(others)}` });
      b.cashUsd = round(b.cashUsd - notional - fee, 6);
      const h = b.holdings[o.symbol] ?? { qty: 0, costUsd: 0, entryUsd: 0 };
      // the entry, fees left out: a holding from before it was kept starts it from what it cost (its fees in it), so its average stays one
      if (h.entryUsd === undefined) h.entryUsd = h.costUsd;
      h.qty = round(h.qty + o.qty, 12);
      h.costUsd = round(h.costUsd + notional + fee, 6);
      h.entryUsd = round(h.entryUsd + notional, 6);
      b.holdings[o.symbol] = h;
    } else {
      const h = b.holdings[o.symbol];
      // a plain sell takes nothing another plain sell holds (P1); a bracket's exit sells what its entry bought, and a close of the whole
      // holding what is held (the plain sells on it go with it)
      const selling = o.parent || o.closesAll ? 0 : (holds(o).units.get(o.symbol) ?? 0);
      if (!h || h.qty - selling + 1e-12 < o.qty) return no("E_VENUE_INSUFFICIENT", { venue, message: `${b.name}: a sell sells only what the paper account holds — ${qtyText(h?.qty ?? 0)} ${ref.base} held${selling > 0 ? `, ${qtyText(selling)} of it in open sell orders` : ""}, ${qtyText(o.qty)} asked` });
      b.cashUsd = round(b.cashUsd + notional - fee, 6);
      const part = o.qty / h.qty;
      realized = round(notional - fee - h.costUsd * part, 6);
      h.costUsd = round(h.costUsd * (1 - part), 6);
      if (h.entryUsd !== undefined) h.entryUsd = round(h.entryUsd * (1 - part), 6);
      h.qty = round(h.qty - o.qty, 12);
      if (h.qty <= 1e-12) {
        delete b.holdings[o.symbol];
        gone = true;
      }
    }
    const when = iso(at);
    o.status = "filled";
    o.filledQty = o.qty;
    o.avgPrice = px;
    o.feeUsd = fee;
    o.filledAt = when;
    o.updatedAt = when;
    if (realized !== undefined) o.realizedUsd = realized;
    // what went past this part's share of the margin is what the rest of the margin took and what went past all of it, both said
    const lossPast = o.lossPastMarginUsd ?? 0;
    const past = fromRest > 0
      ? `isolated margin: the loss went ${usd(fromRest + lossPast)} past this part's share of the margin: ${usd(fromRest)} of it taken from the margin of what is left${lossPast > 0 ? `, and ${usd(lossPast)} past all of it — only the margin was lost` : ""}`
      : lossPast > 0 ? `isolated margin: the loss went ${usd(lossPast)} past the position's margin, and only the margin was lost` : "";
    if (past) o.note = past;
    const said = [o.parent ? `${o.type === "limit" ? "take-profit" : "stop-loss"} of ${o.parent}` : "", past].filter(Boolean).join(" · ");
    // what a close realised — a perpetual's at the price (its fee said beside it), a holding sold its proceeds less its fee and what that part
    // cost (fees in): the trade's result, said on the fill as a venue's trade history says a closed trade's
    record({ ref: o.ref, symbol: o.symbol, side: o.side, qty: o.qty, price: px, feeUsd: fee, at: when, ...(realized !== undefined ? { realizedUsd: realized } : {}), ...(said ? { note: said } : {}) });
    // one exit of a bracket filled: the other is no longer needed
    if (o.oco) {
      const sib = b.orders[o.oco];
      if (sib && (sib.status === "open" || sib.status === "pending")) {
        sib.status = "canceled";
        sib.note = `canceled: the other exit of ${o.parent ?? "its bracket"} (${o.ref}) filled`;
        sib.updatedAt = when;
      }
    }
    if (gone) cancelExits(o.symbol, ref.kind === "perp" ? undefined : "sell", ref.kind === "perp" ? `canceled: the position it was to close is closed (${o.ref})` : `canceled: what it was to sell is sold (${o.ref})`, at);
    // a close of the whole holding sold it: the plain sells resting on it have nothing left to sell
    if (gone && o.closesAll) for (const x of openIn(o.symbol)) if (x.status === "open" && x.side === "sell" && x !== o) Object.assign(x, { status: "canceled", note: `canceled: the holding it was to sell was closed whole (${o.ref})`, updatedAt: iso(at) });
    // an entry with exits: the exits go on the book now, for what filled, the one that fills canceling the other — unless, on a perpetual,
    // it reduced the position on the other side instead of opening one: there is nothing of its own for them to close
    if (o.takeProfit !== undefined || o.stopLoss !== undefined) {
      if (reduced) o.note = [past, `its exits were not placed: it reduced the ${o.side === "sell" ? "long" : "short"} position open in ${o.symbol} rather than opening one, so there is nothing of its own for them to close`].filter(Boolean).join(" · ");
      else placeExits(o, px, at, q);
    }
    return undefined;
  };

  /** a bracket's exits, placed the moment its entry fills at `px`: a limit the other way at the take-profit, a stop the other way at the
   * stop-loss, each knowing the other (the one that fills cancels the other); good till canceled, never for extended hours; a perpetual's
   * reduce-only. A take-profit beyond the fill price (above a buy's, below a sell's) is out of the quote's reach when it is placed — a buy
   * filled at the ask or under it, and its take-profit sells at the bid — so it RESTS from birth: a quote that passes through it before
   * the next look fills it at its limit — a stock's within the session its entry filled in (restEnd). One at the fill price or past it (an
   * entry filled at the open after a gap) never rested, and takes the quote. `q` is the quote the entry filled at */
  const placeExits = (o: PaperOrder, px: number, at: number, q: Quoted): void => {
    const ref = b.markets[o.symbol];
    const side: Side = o.side === "buy" ? "sell" : "buy";
    const beyond = (price: number): boolean => (o.side === "buy" ? price > px + 1e-12 : price < px - 1e-12);
    // exits are never for extended hours: a stock's take-profit rests to its regular close
    const till = restEnd({}, q, at);
    const leg = (kind: "tp" | "sl", type: "limit" | "stop", price: number): PaperOrder => ({ ref: `p${++b.seq}`, clientId: `${o.clientId}-${kind}`, symbol: o.symbol, side, type, qty: o.filledQty, ...(type === "limit" ? { limitPrice: price, ...(beyond(price) ? { rested: true as const, ...(till ? { restedTill: till } : {}) } : {}) } : { stopPrice: price }), tif: "gtc", ...(ref?.kind === "perp" ? { reduceOnly: true } : {}), status: "open", filledQty: 0, parent: o.ref, at: iso(at), updatedAt: iso(at) });
    const legs: PaperOrder[] = [];
    if (o.takeProfit !== undefined) legs.push(leg("tp", "limit", o.takeProfit));
    if (o.stopLoss !== undefined) legs.push(leg("sl", "stop", o.stopLoss));
    if (legs.length === 2) {
      legs[0]!.oco = legs[1]!.ref;
      legs[1]!.oco = legs[0]!.ref;
    }
    for (const l of legs) {
      b.orders[l.ref] = l;
      track(l);
    }
    o.children = legs.map((l) => l.ref);
  };

  /** the price a fill is at: the ask for a buy, the bid for a sell (the last price where the source shows no book) */
  const sideQuote = (side: Side, m: Listing): number | undefined => (side === "buy" ? (pos(m.ask) ?? pos(m.price)) : (pos(m.bid) ?? pos(m.price)));
  /** a quote that has passed the order's worst price (a market order's bound from the account's door) */
  const pastWorst = (o: PaperOrder, px: number): boolean => o.worstPrice !== undefined && (o.side === "buy" ? px > o.worstPrice + 1e-12 : px < o.worstPrice - 1e-12);
  /** fill it at px, or mark it rejected with why the paper money was not there */
  const fillOrReject = (o: PaperOrder, px: number, at: number, q: Quoted): void => {
    const r = fill(o, px, at, q);
    if (r) {
      o.status = "rejected";
      o.note = r.message;
      o.updatedAt = iso(at);
      // a bracket's exit that could not fill takes the other with it: they stood together
      if (o.oco) {
        const sib = b.orders[o.oco];
        if (sib && sib.status === "open") {
          sib.status = "canceled";
          sib.note = `canceled: the other exit (${o.ref}) could not fill`;
          sib.updatedAt = iso(at);
        }
      }
    }
  };

  /** an order whose market does not take it now — out of the session the order trades in, or taking no orders — rests no more: when its
   * market takes it again, a quote already past its limit fills it at that quote, as the open (or a halt's end) fills a broker's resting
   * limit. A quote that only stopped moving (a stale stamp, the market still in session) ends no rest; the end of the session it rested in
   * (restedTill) does. True when that changed it */
  const unrest = (o: PaperOrder): boolean => {
    if (!o.rested) return false;
    delete o.rested;
    delete o.restedTill;
    return true;
  };

  /** an order's day over at `t` (its expiresAt reached): expired, its bracket sibling canceled with it. True */
  const expire = (o: PaperOrder, t: number): boolean => {
    o.status = "expired";
    o.note = `${o.tif === "day" ? "a day order" : "it"} expired at the end of its session (${o.expiresAt})${o.note ? ` · ${o.note}` : ""}`;
    o.updatedAt = iso(t);
    if (o.oco) {
      const sib = b.orders[o.oco];
      if (sib && sib.status === "open") {
        sib.status = "canceled";
        sib.note = `canceled: the other exit (${o.ref}) expired`;
        sib.updatedAt = iso(t);
      }
    }
    return true;
  };

  /** ONE OPEN ORDER JUDGED against a fresh quote — its day over, its trailing stop moved, its stop triggered, its price crossed — by the
   * account's rule (the top of this file). Its day is judged at `at`, the moment it was asked about, and again at the moment its quote is
   * back (a session that ended while the quote was asked ends the order, never fills it after its own end); everything else at that moment.
   * The order is looked at again then: the owner may have canceled it, an amend changed it, or another judgement filled it while the quote
   * was asked, and what the owner was told stands. `given`: a quote at hand — the stream's tick (onTick), with nothing asked of the source —
   * and the trades' highest and lowest since this order was last judged, with the stop it had then (`stood`): a stop the price touched
   * between two quotes has triggered, and a resting limit the trades reached has filled. A coin's or a perpetual's trigger, fill or rest is
   * taken only at a fresh price (fresh): one found at an older quote is judged again at a fresh one (freshFor), and waits when there is
   * none. An order of a book started again while it was judged (controls.reset) is that book's no more: nothing of it is done. True when
   * the book changed */
  const judge = async (o: PaperOrder, at: number, given?: { q: Quoted; range?: HubRange | undefined; stood?: number | undefined }): Promise<boolean> => {
    if (o.status !== "open") return false;
    if (o.expiresAt && at >= Date.parse(o.expiresAt)) return expire(o, at);
    const gen = generation;
    /** still this book's open order, after a wait: the book not started again meanwhile, the order not filled or canceled */
    const still = (): boolean => gen === generation && b.orders[o.ref] === o && o.status === "open";
    const q = given?.q ?? (await quote(o.symbol));
    if (!q) return false;
    if (!still()) return false;
    // the moment the quote is back: everything from here on — the end of a rest, a trigger, a fill — is at it, never at the moment the quote
    // was asked. The owner may have filled an order meanwhile (an add to the position this order closes): what this one does comes after it
    // on the book, so its past, told again in time order, is the book's own
    const now = req.clock();
    if (o.expiresAt && now >= Date.parse(o.expiresAt)) return expire(o, now);
    // a rest is the session's it was earned in: once the market as this quote sees it (its line's delay behind, delayOf) is past that
    // session's end it rests no more, whether or not a look fell between the close and the open (the Mac asleep overnight, the source
    // silent out of hours) — the next session's quote past its limit takes the quote
    let changed = o.restedTill !== undefined && now - delayOf(q) >= Date.parse(o.restedTill) ? unrest(o) : false;
    // judged at a fresh price at last: no longer waiting for one
    if (o.note === FRESH_WAIT_NOTE && fresh(q)) {
      delete o.note;
      changed = true;
    }
    // a market its source says takes no orders now (a halted token, a contract no longer active, a pair with its trading off) fills
    // nothing, triggers nothing, moves no trail — as the account takes no new order in it
    if (q.m.open === false) return unrest(o) || changed;
    const range = given?.range;
    /** a trigger or a fill found at a quote too old for one: judged again at a fresh price, or left as it stands when there is none */
    const again = async (): Promise<boolean> => {
      const f = await freshFor(q, o.symbol);
      if (!still()) return gen === generation && changed;
      if (typeof f === "string" || !fresh(f)) return changed;
      return (await judge(o, at, { q: f, ...(range ? { range } : {}), ...(given?.stood !== undefined ? { stood: given.stood } : {}) })) || changed;
    };
    /** the stop a trade between two quotes touched (the quote now back on the other side of it): the order fills at it, or past it */
    let touchedAt: number | undefined;
    // a stop not yet triggered: watched (in the regular session for a stock), its trail moved, triggered when the price reaches it
    if ((o.type === "stop" || o.type === "stop_limit" || o.type === "trailing_stop") && !o.triggeredAt) {
      if (!canTriggerNow(q, now)) return changed;
      // a US share's stop is watched only at a real-time quote STOCK_JUDGE_MS old at most — its trail moved by one too: never by Cboe's,
      // fifteen minutes behind — the background reader's where the quote at hand is not one
      if (q.m.kind === "stock" && !fresh(q)) return again();
      const watch = o.side === "sell" ? (pos(q.m.bid) ?? pos(q.m.price)) : (pos(q.m.ask) ?? pos(q.m.price));
      if (watch === undefined) return changed;
      // THE STOP THE TRADES PRINTED AGAINST: the trades since this order was last judged printed while its stop stood where that judgement
      // left it. A sell's trail only ever moves its stop up, toward the price (a buy's down), so the stop a trade of that window could have
      // reached is the one it had when the window began — the lowest of the window for a sell, the highest for a buy — and never the one
      // this quote moves it to: a rally past the trail in one window is a move of the stop, not a touch of it. A trailing stop never judged
      // on a tick has no such stop said (its trail may have moved at the looks since it was placed): its trades touch nothing until one is
      const before = o.stopPrice;
      const stood = given?.stood === undefined ? (o.type === "trailing_stop" ? undefined : before) : before === undefined ? given.stood : o.side === "sell" ? Math.min(given.stood, before) : Math.max(given.stood, before);
      if (o.type === "trailing_stop") {
        const best = o.hwm === undefined ? watch : o.side === "sell" ? Math.max(o.hwm, watch) : Math.min(o.hwm, watch);
        const stop = trailStop(o.side, best, o);
        if (best !== o.hwm || stop !== o.stopPrice) {
          // a share's trail that waited for a real-time quote starts here
          if (o.hwm === undefined && o.note === TRAIL_WAIT_NOTE) delete o.note;
          o.hwm = best;
          o.stopPrice = stop;
          changed = true;
        }
      }
      if (o.stopPrice === undefined) return changed;
      const reached = o.side === "sell" ? watch <= o.stopPrice + 1e-12 : watch >= o.stopPrice - 1e-12;
      // the trades since this order was last judged: a price that touched the stop as it stood between two quotes reached it
      const touched = !reached && range !== undefined && stood !== undefined && (o.side === "sell" ? range.lo !== undefined && range.lo <= stood + 1e-12 : range.hi !== undefined && range.hi >= stood - 1e-12);
      if (!reached && !touched) return changed;
      if (!fresh(q)) return again();
      o.triggeredAt = iso(now);
      o.updatedAt = iso(now);
      changed = true;
      if (touched) touchedAt = stood;
    }
    const as: Pick<PaperOrder, "type" | "extendedHours"> = o.type === "limit" || o.type === "stop_limit" ? { type: "limit", extendedHours: o.extendedHours } : { type: "market" };
    if (!canFillNow(as, q, now)) return (!sessionTakes(as, q, now) && unrest(o)) || changed;
    const px = sideQuote(o.side, q.m);
    if (px === undefined) return changed;
    if (o.type === "limit" || o.type === "stop_limit") {
      if (o.limitPrice === undefined) return changed;
      const crossed = o.side === "buy" ? px <= o.limitPrice + 1e-12 : px >= o.limitPrice - 1e-12;
      // a resting limit the trades reached since it was last judged: the price came to it between two quotes, and it filled at its limit
      const reachedByTrades = !crossed && o.rested === true && range !== undefined && (o.side === "buy" ? range.lo !== undefined && range.lo <= o.limitPrice + 1e-12 : range.hi !== undefined && range.hi >= o.limitPrice - 1e-12);
      if (!crossed && !reachedByTrades) {
        // a quote that could fill it and does not reach it: it rests from now, the book's maker — judged at a fresh price only (a coin's last
        // trade, or a listing a minute old, is not where the book stands: an order that never rested takes the quote once one crosses it)
        if (!o.rested && fresh(q)) {
          rest(o, q, now);
          changed = true;
        }
        return changed;
      }
      if (!fresh(q)) return again();
      // a limit that rested fills at its own price when the quote reaches it. One that never rested — past the quote the moment it was
      // placed (a bracket's take-profit after a gap), changed (an amend), triggered (a stop-limit) or let back into its session — crosses
      // at once, so it takes the quote where that is better than its limit, as a limit crossing when it is placed does
      fillOrReject(o, o.rested ? o.limitPrice : o.side === "buy" ? Math.min(px, o.limitPrice) : Math.max(px, o.limitPrice), now, q);
      return true;
    }
    // A MARKET ORDER QUEUED FOR ITS SESSION, at the session's first real-time quote (P4). The worst price it was queued with is WHAT THE
    // OWNER SIGNED (the door held it to the signed maxNotional — a buy's most it may cost, a sell's worth less 2%: account/live-orders.ts
    // hold), and an agent's trading limit was charged by it: the open never moves it past that. Inside it, the worst price is taken afresh
    // from the open's quote by the band the door gave it — tighter, never looser: the open at 195 holds a buy signed to 204.04 at 198.90, not
    // the last session's 2% from 200. An open that gapped PAST the signed worst price ends the order at once, canceled, nothing filled, with
    // the open's price and the signed one said — a broker's fill at any open would cost more than was signed, and waiting past it all day
    // (the order before P4) helped no one. Once, and only at a fresh quote (a share's real-time one, never Cboe's fifteen minutes behind)
    if (o.type === "market" && !o.triggeredAt && !o.queuedOpen && o.worstPrice !== undefined && (o.queuedBand !== undefined || /^queued for the open|^waiting: the quote .* is past the worst price/.test(o.note ?? ""))) {
      if (!fresh(q)) return again();
      const signed = o.worstPrice;
      o.queuedOpen = iso(now);
      o.updatedAt = iso(now);
      if (pastWorst(o, px)) {
        o.status = "canceled";
        o.note = `the open (${fig(px)}) gapped past the worst price signed (${fig(signed)}): canceled, nothing filled — place it again at the open's price`;
        return true;
      }
      const band = o.queuedBand ?? QUEUED_BAND;
      const step = marketOf(q.source, q.m).priceStep;
      const afresh = o.side === "buy" ? floorTo(px * (1 + band), step) : ceilTo(px * (1 - band), step);
      o.worstPrice = o.side === "buy" ? Math.min(afresh, signed) : Math.max(afresh, signed);
      o.note = `its session's first real-time quote (${fig(px)}): its worst price ${o.worstPrice === signed ? `stays the ${fig(signed)} signed` : `taken afresh from it, ${fig(o.worstPrice)} (inside the ${fig(signed)} signed)`}`;
      changed = true;
    }
    // a market order queued for the session, or a stop that triggered: at the quote — the book walked for a size its best level does not
    // hold — inside the worst price its door gave it; past it, it waits there as a limit would
    if (pastWorst(o, px)) {
      const note = `waiting: the quote (${fig(px)}) is past the worst price the order allows (${fig(o.worstPrice!)})`;
      if (o.note !== note) {
        o.note = note;
        o.updatedAt = iso(now);
        return true;
      }
      return changed;
    }
    if (!fresh(q)) return again();
    const taken = await takeAt(o, q);
    // looked at again after the book was read: another judgement, or the owner, may have moved it meanwhile — or the book was started again
    if (!still()) return gen === generation;
    if (typeof taken === "string") {
      const note = `waiting: ${taken}`;
      if (o.note !== note) {
        o.note = note;
        o.updatedAt = iso(req.clock());
        return true;
      }
      return changed;
    }
    // a stop the trades touched, the quote back on the other side of it since: it filled when it triggered, at the stop it touched or past it
    const fillPx = touchedAt !== undefined ? (o.side === "sell" ? Math.min(touchedAt, taken) : Math.max(touchedAt, taken)) : taken;
    fillOrReject(o, fillPx, now, q);
    return true;
  };

  /** the funding rate of a perpetual's quote per hour: Hyperliquid's as it is, another venue's an eighth of its interval's */
  const hourlyFunding = (source: PublicSource, m: Listing): number | undefined => {
    const r = m.fundingRate;
    if (typeof r !== "number" || !Number.isFinite(r)) return undefined;
    return HOURLY_FUNDING.test(source.id) ? r : r / FUNDING_INTERVAL_HOURS;
  };
  /** each perpetual's hourly funding rates as its source's history says them (PublicSource.fundingHistory: Hyperliquid's), by the hour
   * paid, ms — read once each, kept in memory only — and when each market's history was last asked */
  const hourRates = new Map<string, Map<number, number>>();
  const ratesAskedAt = new Map<string, number>();
  /** THE RATES OF THE HOURS A POSITION IS DUE TO SETTLE (`from` its last settlement, to `to`), read from its source's history where the
   * source publishes one, before they are settled (payFunding): asked only for hours not read yet, and while an hour just paid is not in
   * the answer yet (the venue writes it a moment after the hour), again at most every RATES_AGAIN_MS */
  const readRates = async (symbol: string, source: PublicSource | undefined, from: number, to: number): Promise<void> => {
    if (!source?.fundingHistory) return;
    const first = (Math.floor(from / HOUR) + 1) * HOUR;
    if (first > to) return;
    const known = hourRates.get(symbol);
    let missing = false;
    for (let h = first; h <= to; h += HOUR) if (!known?.has(h)) missing = true;
    if (!missing || req.clock() - (ratesAskedAt.get(symbol) ?? Number.NEGATIVE_INFINITY) < RATES_AGAIN_MS) return;
    ratesAskedAt.set(symbol, req.clock());
    const got = await inTime(source.fundingHistory(symbol, first, to), SOURCE_MS);
    if (!got || isRefusal(got)) return;
    const into = hourRates.get(symbol) ?? new Map<number, number>();
    for (const x of got) into.set(x.at, x.rate);
    // the last RATES_KEPT hours of each market
    while (into.size > RATES_KEPT) into.delete(into.keys().next().value!);
    hourRates.set(symbol, into);
  };
  /** A POSITION'S FUNDING settled AS HYPERLIQUID SETTLES IT: at each hour ON THE CLOCK (the top of the hour, UTC) it stood across since it
   * was last settled, its size times the ORACLE price times that hour's rate — Hyperliquid's docs: "the funding payment at the end of the
   * interval is position_size * oracle_price * funding_rate", the oracle and not the mark — paid out of the margin, the long paying when the
   * rate is above zero. The hour's rate is the one its source's history says it was paid at (readRates); a source with no history, or one
   * that has not answered a minute after the hour (RATE_WAIT_MS — the venue writes it a moment after), at the rate the quote carries. The
   * price: the quote's oracle, else its mark, else its price (a bar's close, while the account slept: catchUp). Only at a quote that is
   * the source's answer (`q`) — a source that did not answer in time has said no rate, and the hours wait for a quote that has it. Every look
   * settles it (markPerps), and so does every fill on the position before it moves it (fill): a close by hand, or an exit judged at a quote
   * the look's own did not have, never takes the position off with hours unpaid. Each hour written down as it is settled — when, the size,
   * the price, the rate and what was paid — so the book's past can be told again exactly (paper-history.ts) and listed hour by hour. True
   * when the book changed */
  const payFunding = (symbol: string, p: PaperPosition, q: Quoted | undefined, at: number): boolean => {
    if (!q) return false;
    const fundedAt = p.fundedAt ?? at;
    const first = (Math.floor(fundedAt / HOUR) + 1) * HOUR;
    if (first > at) return false;
    const price = pos(q.m.oraclePrice) ?? q.mark ?? pos(q.m.price) ?? b.markets[symbol]?.last?.price;
    if (price === undefined) return false;
    const now = hourlyFunding(q.source, q.m);
    const known = hourRates.get(symbol);
    let settled = fundedAt;
    for (let h = first; h <= at; h += HOUR) {
      const read = known?.get(h);
      // an hour its source's history will say, not said yet: waited for, a minute at most
      if (read === undefined && q.source.fundingHistory && req.clock() - h < RATE_WAIT_MS) break;
      const rate = read ?? now;
      if (rate !== undefined && rate !== 0) {
        // the long pays when the rate is above zero, the short receives; the other way round below zero
        const paid = round(p.qty * price * rate * (p.side === "long" ? 1 : -1), 6);
        p.marginUsd = round(p.marginUsd - paid, 6);
        p.fundingUsd = round((p.fundingUsd ?? 0) + paid, 6);
        const row: PaperFunding = { at: iso(h), symbol, usd: paid, side: p.side, qty: p.qty, price, rate, ...(read === undefined ? { quoted: true as const } : {}) };
        (b.funding ??= []).push(row);
        if (b.funding.length > FUNDING_KEPT) b.funding.splice(0, b.funding.length - FUNDING_KEPT);
        req.onFunding?.(row);
      }
      settled = h;
    }
    if (settled === fundedAt) return false;
    p.fundedAt = settled;
    return true;
  };
  /** A PERPETUAL LIQUIDATED at `mark`: closed at it, what is left of its margin after the fee back to cash, the fill saying so — and its
   * exits canceled, nothing being left for them to close. `note` adds how it was found (the time asleep, catchUp) */
  const liquidate = (symbol: string, p: PaperPosition, mark: number, left: number, maintenance: number, at: number, note?: string): void => {
    const notional = mark * p.qty;
    const pnl = (p.side === "long" ? mark - p.entryPrice : p.entryPrice - mark) * p.qty;
    const fee = round((notional * b.feeBps) / 10_000, 6);
    const back = round(Math.max(0, left - fee), 6);
    b.cashUsd = round(b.cashUsd + back, 6);
    const said = `liquidated at the mark (${fig(mark)}): the margin left (${usd(left)}) fell to the maintenance margin (${usd(maintenance)}); ${usd(back)} went back to cash${note ? ` · ${note}` : ""}`;
    const o: PaperOrder = { ref: `p${++b.seq}`, clientId: `liquidation-${b.seq}`, symbol, side: p.side === "long" ? "sell" : "buy", type: "market", qty: p.qty, reduceOnly: true, status: "filled", filledQty: p.qty, avgPrice: mark, feeUsd: fee, lossPastMarginUsd: round(Math.max(0, fee - left), 6), realizedUsd: round(pnl, 6), at: iso(at), updatedAt: iso(at), filledAt: iso(at), note: said };
    b.orders[o.ref] = o;
    track(o);
    record({ ref: o.ref, symbol, side: o.side, qty: p.qty, price: mark, feeUsd: fee, at: iso(at), realizedUsd: round(pnl, 6), note: o.note });
    delete b.positions[symbol];
    // its exits have nothing left to close
    cancelExits(symbol, undefined, `canceled: the position was liquidated (${o.ref})`, at);
  };
  /** THE PRICE A PERPETUAL IS LIQUIDATED AT — the one forced fill, held to the rule every fill is (fresh: a bid and an ask at most
   * FILL_FRESH_MS old, or from an order book read at most BOOK_FRESH_MS ago): its venue's mark (Hyperliquid's markPx) where its live stream
   * gives one, else the middle of that bid and ask; for a market nothing fresher than its listing can be had for (fresherCanBe: a pre-IPO venue's
   * contract), its listing's mark or price, as old as it is. With where it is from and how old it is, which the liquidation says. Nothing:
   * no price fresh enough — the position is marked at what there is, and waits for the next fresh price to be liquidated at. Never the
   * book's last kept price */
  const liqPrice = (q: Quoted): { px: number; from: string; age: number } | undefined => {
    const bid = pos(q.m.bid);
    const ask = pos(q.m.ask);
    const mid = bid !== undefined && ask !== undefined && ask >= bid ? round((bid + ask) / 2, 10) : undefined;
    const age = Math.max(0, ageOf(q));
    const from = q.m.quoteFrom ?? q.m.venueName ?? q.source.name;
    let px: number | undefined;
    if (crypto(q) && fresherCanBe(q)) {
      if (fresh(q)) px = q.from === "stream" ? (q.mark ?? mid) : mid;
    } else px = q.mark ?? pos(q.m.price);
    return px !== undefined ? { px, from, age } : undefined;
  };
  /** what a perpetual's margin left and its maintenance margin are at `mark`, and whether it is to be liquidated there */
  const liqAt = (symbol: string, p: PaperPosition, mark: number, q: Quoted | undefined): { left: number; maintenance: number; due: boolean } => {
    const maxLeverage = Math.max(1, b.markets[symbol]?.maxLeverage ?? pos(q?.m.maxLeverage) ?? 1);
    const left = p.marginUsd + (p.side === "long" ? mark - p.entryPrice : p.entryPrice - mark) * p.qty;
    const maintenance = (mark * p.qty) / (2 * maxLeverage);
    return { left, maintenance, due: left <= maintenance + 1e-9 };
  };
  /** ONE PERPETUAL MARKED at `q`: its funding settled (payFunding), and the position liquidated at the mark when the margin left has fallen
   * to the maintenance margin — at a price fresh enough to fill at (liqPrice: the venue's mark from its live stream, a book read now), the
   * liquidation saying where that price is from and how old it is. A quote too old for it marks the position and liquidates nothing; no
   * quote, nothing. True when the book changed */
  const markOne = (symbol: string, p: PaperPosition, q: Quoted | undefined, at: number): boolean => {
    if (!q) return false;
    let changed = payFunding(symbol, p, q, at);
    const lp = liqPrice(q);
    if (!lp) return changed;
    const { left, maintenance, due } = liqAt(symbol, p, lp.px, q);
    if (due) {
      liquidate(symbol, p, lp.px, left, maintenance, at, `the mark from ${lp.from}, ${secs(lp.age)} old`);
      changed = true;
    }
    return changed;
  };
  /** every perpetual position marked (markOne). A position the owner closed (or closed and opened again) while its quote was asked is not
   * this one: it is left to the next look. One the owner added to or closed part of meanwhile is the same position, grown or shrunk: it is
   * marked as it stands when its quote is back, at that moment — so its funding and its liquidation come after the owner's order on the
   * book, never before it. A quote too old to liquidate at that would liquidate the position (its stream not live: a listing up to minutes
   * old) asks for a fresh one first — the stream's next word, else the order book read now (freshFor) — and without one the position waits.
   * A market whose time asleep is still owed (catchUp) is marked by nothing at its quote. True when the book changed */
  const markPerps = async (): Promise<boolean> => {
    let changed = false;
    for (const [symbol, p] of Object.entries(b.positions)) {
      if (owed.has(symbol)) continue;
      let q = await quote(symbol);
      if (b.positions[symbol] !== p) continue;
      // the rates of the hours it is due to settle, from its source's history, before markOne settles them (payFunding)
      await readRates(symbol, q?.source, p.fundedAt ?? req.clock(), req.clock());
      if (b.positions[symbol] !== p) continue;
      const stale = q?.mark ?? pos(q?.m.price);
      if (q && !liqPrice(q) && stale !== undefined && liqAt(symbol, p, stale, q).due) {
        const f = await freshFor(q, symbol);
        if (b.positions[symbol] !== p) continue;
        if (typeof f !== "string") q = f;
      }
      if (markOne(symbol, p, q, req.clock())) changed = true;
    }
    return changed;
  };

  /** every event contract held: once its venue says the market has settled, paid out at what the venue paid and taken off the book; a
   * market closed and not settled is marked so. Asked at most every minute past the market's close, every ten minutes before it (a market
   * may settle early). A holding sold whole (or sold and bought again) while its venue was asked is not the one asked about: what is held
   * now is asked about at the next look. True when the book changed */
  const settleEvents = async (at: number): Promise<boolean> => {
    let changed = false;
    for (const [symbol, h] of Object.entries(b.holdings)) {
      const ref = b.markets[symbol];
      if (!ref || ref.kind !== "event" || !(h.qty > 0)) continue;
      const source = pricer.sourceOf(ref.source);
      if (!source?.settlement) continue;
      const closeMs = ref.closeTime ? Date.parse(ref.closeTime) : NaN;
      const every = Number.isFinite(closeMs) && at < closeMs ? SETTLE_BEFORE_CLOSE_MS : SETTLE_AFTER_CLOSE_MS;
      const asked = settleAsked.get(symbol);
      if (asked !== undefined && at - asked < every) continue;
      settleAsked.set(symbol, at);
      const s = await inTime(source.settlement(symbol), SOURCE_MS);
      if (b.holdings[symbol] !== h) {
        settleAsked.delete(symbol);
        continue;
      }
      if (!s || isRefusal(s)) continue;
      if (!s.settled) {
        if (s.closed && !ref.closed) {
          ref.closed = true;
          changed = true;
        }
        continue;
      }
      const paid = round(h.qty * s.payout, 6);
      b.cashUsd = round(b.cashUsd + paid, 6);
      const o: PaperOrder = { ref: `p${++b.seq}`, clientId: `settlement-${b.seq}`, symbol, side: "sell", type: "market", qty: h.qty, status: "filled", filledQty: h.qty, avgPrice: s.payout, feeUsd: 0, realizedUsd: round(paid - h.costUsd, 6), at: iso(at), updatedAt: iso(at), filledAt: iso(at), note: `settled by ${source.name}: ${usd(s.payout)} a contract${s.payout >= 1 ? " to this side, which won" : s.payout <= 0 ? " — this side lost" : ""}, ${usd(paid)} for ${qtyText(h.qty)}` };
      b.orders[o.ref] = o;
      track(o);
      record({ ref: o.ref, symbol, side: "sell", qty: h.qty, price: s.payout, feeUsd: 0, at: iso(at), realizedUsd: round(paid - h.costUsd, 6), note: o.note });
      ref.settled = { payout: s.payout, at: s.at ?? iso(at) };
      delete ref.closed;
      delete b.holdings[symbol];
      // its exits have nothing left to sell
      for (const x of openIn(symbol)) if (x.status === "open") Object.assign(x, { status: "canceled", note: `canceled: the market settled (${o.ref})`, updatedAt: iso(at) });
      changed = true;
    }
    return changed;
  };

  /** THE TIME ASLEEP JUDGED (catchUp): the machine slept, or the service stood still, more than CATCH_UP_MS between two looks — each coin's
   * and perpetual's resting orders and its position against its market's own real bars (CATCH_UP_BAR, the finest the public sources give
   * the account now) that lie wholly inside the gap and after the order was placed (or last changed), and after the position was opened,
   * oldest first. A perpetual whose bar crossed its liquidation price was liquidated there — but where the bar OPENED on the position's
   * side of that price, its stop exits between the open and the liquidation price (a long's sell stops at or under the open, above it) came
   * first on any path from the open, nearest the open first, and only what they left of the position is liquidated; a bar that opened past
   * the liquidation price (a gap) liquidates it first. A stop whose bar reached it triggered there — and filled at its stop, or at the bar's
   * open where the bar opened past it (a stop-limit became its limit); a trailing stop's trail followed each bar's best; a resting limit
   * whose bar reached it filled at its limit; within one bar the stops are taken before the limits (which came first the bar does not say,
   * and a bracket's stop-loss is the worse of its two exits). Each at its bar's close, with a note that says so. Real bars only, never made
   * up, and only the listing source's own (CandleWindow.own: a Kraken pair is judged on Kraken's bars, never on the venue its chart is
   * drawn from). The bars are taken only where they cover the whole gap from its start: an answer cut short (`partial`: an older page
   * refused or not in time) judges nothing, since a later bar judged with an earlier one missing could fill a bracket's take-profit its
   * stop-loss should have closed first; and a source whose history at that size ends after the gap began (`ends`: Kraken's latest 720) is
   * asked again in the next coarser size, at most to days. A MARKET WHOSE BARS DID NOT COME BACK WHOLE — its source not in time, refusing,
   * cut short, or its listing not known yet (right after a Mac wakes, before Wi-Fi is back) — is OWED its time asleep (owed): nothing of it
   * is judged at a quote meanwhile (settle, tick), and at each later look its bars are asked again from where the owed time began to the new
   * moment, until they cover it; past OWED_MOST_MS, or where its source's history at every size starts after the gap began, the time is
   * given up and its orders say so. A market whose source gives no such bars is judged at its quote now, as it always was. `slept`: the
   * start of the gap since the last look, if there is one; the markets owed are judged from their own start. Nothing of it lands in a book
   * started again meanwhile. True when the book changed */
  const catchUp = async (slept: number | undefined, to: number): Promise<boolean> => {
    let changed = false;
    const gen = generation;
    const symbols = new Set([...openAll().map((o) => o.symbol), ...Object.keys(b.positions), ...owed.keys()]);
    for (const symbol of symbols) {
      const from = Math.min(owed.get(symbol)?.from ?? Number.POSITIVE_INFINITY, slept ?? Number.POSITIVE_INFINITY);
      if (!Number.isFinite(from)) continue;
      const ref = b.markets[symbol];
      const source = ref ? pricer.sourceOf(ref.source) : undefined;
      // nothing of it left to judge (closed meanwhile), or a market whose source gives no such bars: judged at its quote, as it always was
      if (!ref || (ref.kind !== "spot" && ref.kind !== "perp") || !source?.candles || source.kind !== "exchange" || (!openIn(symbol).length && !b.positions[symbol])) {
        unowe(symbol);
        continue;
      }
      let size = catchUpBar(from, to);
      let bars: Candle[] | undefined;
      let ends = false;
      for (;;) {
        const got = await inTime(source.candles(symbol, size, { since: from, until: to, own: true }), SOURCE_MS);
        if (gen !== generation) return false;
        const page: CandlePage | undefined = Array.isArray(got) ? { bars: got, more: false } : got && !isRefusal(got) && Array.isArray(got.bars) ? got : undefined;
        if (!page || page.partial) break;
        const first = page.bars.reduce((m, x) => (x && x.t >= from ? Math.min(m, x.t) : m), Number.POSITIVE_INFINITY);
        // the source's history at this size starts after the gap did: a coarser size may reach back to it
        if (page.ends && first > from + INTERVAL_MS[size]) {
          const coarser = coarserThan(size);
          if (!coarser || coarser === "1w") {
            ends = true;
            break;
          }
          size = coarser;
          continue;
        }
        bars = page.bars;
        break;
      }
      if (ends) {
        if (giveUp(symbol, from, to, `${source.name}'s history does not reach back to it`)) changed = true;
        continue;
      }
      const k = bars ? (pricer.knownOf(symbol, ref) ?? (await quote(symbol))) : undefined;
      if (gen !== generation) return false;
      if (!bars || !k) {
        if (owe(symbol, from, to, bars ? `no listing of ${ref.name} came back to judge it with` : `${source.name}'s bars did not come back`)) changed = true;
        continue;
      }
      unowe(symbol);
      // the funding of the hours slept through is settled at each hour's own rate, read once for the whole gap from its source's history
      const held = b.positions[symbol];
      if (held) await readRates(symbol, k.source, held.fundedAt ?? from, to);
      if (gen !== generation) return false;
      const step = INTERVAL_MS[size];
      const inGap = bars.filter((x) => x && x.t >= from && x.t + step <= to).sort((x, y) => x.t - y.t);
      for (const bar of inGap) {
        const end = bar.t + step;
        const note = req.bars ? `the ${size} bar from ${iso(bar.t).slice(0, 16).replace("T", " ")} UTC (${fig(bar.l)}–${fig(bar.h)}) reached it` : `while the account slept: ${source.name}'s ${size} bar from ${iso(bar.t).slice(11, 16)} UTC (${fig(bar.l)}–${fig(bar.h)}) reached it`;
        // the bar's own price — never today's mark or oracle — for what the bar judges, its hours' funding among it
        const q: Quoted = { source: k.source, m: { ...k.m, price: bar.c, bid: undefined, ask: undefined, markPrice: undefined, oraclePrice: undefined, quoteAt: iso(end), quoteFrom: `${source.name} · ${size} bar` }, at: end };
        // a position is judged against the bars from when it was opened only: a bar that began before it existed (a perpetual opened after
        // the last look, the owner's order on waking) never funds or liquidates it — a book from before openedAt, from its last funding
        const p = b.positions[symbol];
        if (p && bar.t >= (p.openedAt ?? p.fundedAt ?? Number.NEGATIVE_INFINITY)) {
          payFunding(symbol, p, q, end);
          const maxLeverage = Math.max(1, ref.maxLeverage ?? 1);
          const long = p.side === "long";
          /** the liquidation price of the position as it stands, where this bar reached it */
          const crossed = (x: PaperPosition): number | undefined => {
            const liq = liquidationPriceOf(x, maxLeverage);
            return liq !== undefined && (long ? bar.l <= liq : bar.h >= liq) ? liq : undefined;
          };
          let liq = crossed(p);
          if (liq !== undefined && (long ? bar.o > liq : bar.o < liq)) {
            // THE BAR OPENED ON THE POSITION'S SIDE OF ITS LIQUIDATION PRICE: from the open to the liquidation price the price passed every
            // stop exit between them first, nearest the open first (byBar's own rule fills each at its stop) — and the liquidation is of
            // what they left, at its own price then
            const at = liq;
            const exits = openIn(symbol)
              .filter((o) => o.status === "open" && (o.type === "stop" || o.type === "trailing_stop") && !o.triggeredAt && o.side === (long ? "sell" : "buy") && o.stopPrice !== undefined && Date.parse(o.amendedAt ?? o.at) <= bar.t && (long ? o.stopPrice > at && o.stopPrice <= bar.o + 1e-12 : o.stopPrice < at && o.stopPrice >= bar.o - 1e-12))
              .sort((x, y) => (long ? y.stopPrice! - x.stopPrice! : x.stopPrice! - y.stopPrice!));
            for (const o of exits) if (o.status === "open" && b.positions[symbol] && byBar(o, bar, end, note, q)) changed = true;
            const left = b.positions[symbol];
            liq = left ? crossed(left) : undefined;
          }
          const still = b.positions[symbol];
          if (still && liq !== undefined) {
            liquidate(symbol, still, liq, still.marginUsd + (long ? liq - still.entryPrice : still.entryPrice - liq) * still.qty, (liq * still.qty) / (2 * maxLeverage), end, note);
            changed = true;
          }
        }
        const stopFirst = (o: PaperOrder): number => (o.type === "limit" || (o.type === "stop_limit" && o.triggeredAt) ? 1 : 0);
        // an order judged against the bars from when it was placed — or last changed: a price traded before an amend never fills the order as
        // amended
        const opens = openIn(symbol).filter((o) => o.status === "open" && Date.parse(o.amendedAt ?? o.at) <= bar.t).sort((x, y) => stopFirst(x) - stopFirst(y) || Number(x.ref.slice(1)) - Number(y.ref.slice(1)));
        for (const o of opens) if (o.status === "open" && byBar(o, bar, end, note, q)) changed = true;
      }
    }
    return changed;
  };
  /** THE TIME ASLEEP STILL OWED, by market (catchUp): from when, and since when it has been owed — kept in the book as it changes, so a
   * restart owes it still */
  const owed = new Map<string, { from: number; since: number }>();
  for (const [symbol, w] of Object.entries(b.owed ?? {})) {
    const from = Date.parse(w?.from ?? "");
    const since = Date.parse(w?.since ?? "");
    if (Number.isFinite(from) && Number.isFinite(since)) owed.set(symbol, { from, since });
  }
  /** the owed time changed since the book was last written: the next look writes it */
  let owedDirty = false;
  const syncOwed = (): void => {
    b.owed = owed.size ? Object.fromEntries([...owed].map(([s, w]) => [s, { from: iso(w.from), since: iso(w.since) }])) : undefined;
    owedDirty = true;
  };
  const unowe = (symbol: string): void => {
    if (owed.delete(symbol)) syncOwed();
  };
  /** a market's time asleep from `from` owed, its bars to be asked again at the next look — or, owed past OWED_MOST_MS, given up. True when
   * the book's orders changed (given up) */
  const owe = (symbol: string, from: number, now: number, why: string): boolean => {
    const was = owed.get(symbol);
    const since = was?.since ?? now;
    if (now - since > OWED_MOST_MS) return giveUp(symbol, from, now, why);
    if (!was || was.from !== from) {
      owed.set(symbol, { from, since });
      syncOwed();
    }
    return false;
  };
  /** a market's time asleep given up: its orders judged at the quote from now, each saying so. True when that changed an order */
  const giveUp = (symbol: string, from: number, to: number, why: string): boolean => {
    unowe(symbol);
    const words = `the time from ${iso(from).slice(11, 16)} to ${iso(to).slice(11, 16)} UTC (the account not looking) was not judged against bars: ${why} — judged at the quote from then on`;
    let changed = false;
    for (const o of openIn(symbol)) {
      if (o.status !== "open" || (o.note ?? "").includes(words)) continue;
      o.note = [o.note, words].filter(Boolean).join(" · ");
      o.updatedAt = iso(to);
      changed = true;
    }
    return changed;
  };
  /** one order judged against one real bar of the time asleep (catchUp). True when the book changed */
  const byBar = (o: PaperOrder, bar: Candle, at: number, note: string, q: Quoted): boolean => {
    const said = (): void => {
      if (o.status !== "filled") return;
      o.note = [o.note, note].filter(Boolean).join(" · ");
      const f = b.fills[b.fills.length - 1];
      if (f?.ref === o.ref) f.note = [f.note, note].filter(Boolean).join(" · ");
    };
    if ((o.type === "stop" || o.type === "stop_limit" || o.type === "trailing_stop") && !o.triggeredAt) {
      if (o.stopPrice === undefined) return false;
      const hit = o.side === "sell" ? bar.l <= o.stopPrice + 1e-12 : bar.h >= o.stopPrice - 1e-12;
      if (!hit) {
        if (o.type !== "trailing_stop") return false;
        // the trail follows the bar's best, and the next bar is judged against it
        const best = o.hwm === undefined ? (o.side === "sell" ? bar.h : bar.l) : o.side === "sell" ? Math.max(o.hwm, bar.h) : Math.min(o.hwm, bar.l);
        const stop = trailStop(o.side, best, o);
        if (best === o.hwm && stop === o.stopPrice) return false;
        o.hwm = best;
        o.stopPrice = stop;
        return true;
      }
      o.triggeredAt = iso(at);
      o.updatedAt = iso(at);
      if (o.type === "stop_limit") {
        o.note = [o.note, note].filter(Boolean).join(" · ");
        return true;
      }
      const px = o.side === "sell" ? Math.min(o.stopPrice, bar.o) : Math.max(o.stopPrice, bar.o);
      if (pastWorst(o, px)) {
        o.note = `waiting: the price (${fig(px)}) is past the worst price the order allows (${fig(o.worstPrice!)})`;
        return true;
      }
      fillOrReject(o, px, at, q);
      said();
      return true;
    }
    if ((o.type === "limit" && o.rested) || (o.type === "stop_limit" && o.triggeredAt)) {
      if (o.limitPrice === undefined) return false;
      const hit = o.side === "buy" ? bar.l <= o.limitPrice + 1e-12 : bar.h >= o.limitPrice - 1e-12;
      if (!hit) return false;
      fillOrReject(o, o.limitPrice, at, q);
      said();
      return true;
    }
    return false;
  };

  /** WHEN THE BOOK WAS LAST LOOKED AT (settle): a look past CATCH_UP_MS after it judges the time between (catchUp) — in this run, or the run
   * before it, as the book kept it (PaperBook.lookedAt: the service not running is time asleep too). A look with no hub to judge it by yet
   * (the account's streams start after its books open) leaves it where it is: the time is owed, never taken as judged */
  let lookedAt: number | undefined = Number.isFinite(lookedBefore) && lookedBefore <= now ? lookedBefore : undefined;
  /** the look's moment taken, and kept in the book (written with its next write) */
  const lookAt = (t: number): void => {
    lookedAt = t;
    b.lookedAt = iso(t);
  };
  let settling: Promise<boolean> | undefined;
  /** the time asleep being judged against bars (catchUp) just now: no tick judges any market at the price of this moment meanwhile */
  let catching = false;
  /** every position marked, every open order judged and every held contract's settlement asked, once at a time: a second look while one is
   * under way waits for it — and, where the account streams the markets, the time it slept judged first, and a market whose time asleep is
   * still owed judged at no quote (catchUp). What changed is told, and written before the look ends; the look's own moment is written at
   * least every LOOK_SAVE_MS while something is open. True when the book changed */
  const settle = (): Promise<boolean> => {
    if (settling) return settling;
    const run = (async () => {
      let changed = false;
      const gen = generation;
      const now0 = req.clock();
      const slept = lookedAt !== undefined && now0 - lookedAt > CATCH_UP_MS ? lookedAt : undefined;
      // the time asleep, judged where the account streams the markets — its hub up — and until then owed whole: the look's moment stays;
      // an account stepped over recorded bars judges it at every look, against them (PaperRequest.bars)
      const streams = !!hubNow() || req.bars === true;
      if (streams && (slept !== undefined || owed.size)) {
        catching = slept !== undefined;
        try {
          changed = (await catchUp(slept, now0)) || changed;
        } finally {
          catching = false;
        }
        if (gen !== generation) return false;
      }
      if (streams || slept === undefined) lookAt(now0);
      // the perpetuals first: the funding of the hours each stood is paid before an order in this look closes it, and a gap past a
      // position's liquidation price is the liquidation the rule says (its exits canceled with it), not a stop-loss filled below it
      changed = (await markPerps()) || changed;
      // in the order they were placed, so an entry's exits are judged after it (an exit placed by this look waits for the next) — a market
      // whose time asleep is still owed none of them (its bars are asked again at the next look)
      const open = openAll().filter((o) => o.status === "open" && !owed.has(o.symbol));
      for (const o of open) changed = (await judge(o, req.clock())) || changed;
      changed = (await settleEvents(req.clock())) || changed;
      // the book was started again while this look waited on its quotes: nothing it found is the new book's (reset tells and writes it)
      if (gen !== generation) return false;
      if (changed) {
        tell();
        await flush();
      } else if (owedDirty || (b.lookedAt !== lookWritten && req.clock() - writtenAt >= LOOK_SAVE_MS)) {
        // what is owed, or the look's moment, written in the background: nothing else moved
        owedDirty = false;
        void flush().catch(() => undefined);
      }
      return changed;
    })();
    settling = run.finally(() => {
      settling = undefined;
    });
    return settling;
  };
  /** THE LOOK FIRST, before an owner's instruction that changes the book (place, close, amend, cancel, a leverage set), where the account
   * streams the markets and the last look is older than CATCH_UP_MS — or a look judging the time asleep is under way: the time since — the
   * Mac asleep, the service stood still — is judged against the book as it stood then (catchUp), so a position opened, or an order changed,
   * on waking is never judged against bars from before it, and what the time asleep filled comes before the instruction on the book, as it
   * happened */
  const lookFirst = async (): Promise<void> => {
    if (!hubNow() && req.bars !== true) return;
    if (catching && settling) {
      await settling.catch(() => false);
      return;
    }
    if (lookedAt === undefined || req.clock() - lookedAt <= CATCH_UP_MS) return;
    await settle();
  };

  // ---- THE STREAM'S TICKS JUDGE THEIR MARKET (onTick) ---------------------------------------------------------------------------------
  /** each open order's place in its market's trades as it was last judged on a tick (or placed, or changed): the market's seq then, the
   * moment, and its stop as that judgement left it (the stop the trades after it print against) */
  const judgedAt = new Map<string, { seq: number; at: number; stop?: number | undefined }>();
  /** the markets whose tick waits for the end of this turn: a burst of ticks is one judgement */
  const ticking = new Set<string>();
  /** the book being started again (controls.reset): no tick judges it meanwhile */
  let resetting = false;
  /** the book's generation: one more each time it is started again (controls.reset). A judgement, a tick or a look that waited on a quote
   * or a book across a reset finds it changed, and does nothing more — the order it held is the old book's */
  let generation = 0;
  /** A WORD FROM A MARKET'S STREAM (a quote or a trade) about a market the book trades, from the source the book trades it at: its orders
   * and its perpetual judged at the end of this turn, once, however many ticks came. A market with nothing open and no perpetual position
   * is not looked at: no scan, nothing read */
  const onTick = (t: HubTick): void => {
    if (stopped || (t.what !== "quote" && t.what !== "trades")) return;
    const ref = b.markets[t.symbol];
    if (!ref || ref.source !== t.source || ticking.has(t.symbol)) return;
    if (!openBy.has(t.symbol) && !(ref.kind === "perp" && b.positions[t.symbol])) return;
    ticking.add(t.symbol);
    queueMicrotask(() => {
      ticking.delete(t.symbol);
      void tick(t.symbol).catch(() => false);
    });
  };
  /** ONE MARKET JUDGED ON ITS STREAM'S TICK — only that market's: its perpetual marked at its venue's mark (funding, liquidation), and each
   * of its open orders judged at the stream's quote of this moment and the trades' highest and lowest since that order was last judged here
   * (judge). Only while the stream is live and its word FILL_FRESH_MS old at most, and the market's listing has been read in this run (what
   * the market is: the sweep reads it first). NEVER WHILE THE TIME ASLEEP IS UNJUDGED: while a look judges it against bars (catching), while
   * this market's is still owed, or before the look that judges it has come (the last look older than CATCH_UP_MS: the Mac just woke, and
   * its streams spoke first — that look is asked for now), no tick fills at the price of this moment what the bars of the time asleep may
   * have filled first; each order's place in its trades is kept (judgedAt), so the first tick after the catch-up judges every trade since. A
   * fill is told at once and written within FILL_SAVE_MS; a trailing stop's move alone is one word and one write a second (saveSoon). True
   * when the book changed */
  const tick = async (symbol: string): Promise<boolean> => {
    const hub = hubNow();
    const ref = b.markets[symbol];
    if (resetting || !hub || !ref) return false;
    if (catching || owed.has(symbol)) return false;
    if (lookedAt !== undefined && req.clock() - lookedAt > CATCH_UP_MS) {
      void settle().catch(() => false);
      return false;
    }
    const gen = generation;
    const opens = openIn(symbol).filter((o) => o.status === "open");
    const p = ref.kind === "perp" ? b.positions[symbol] : undefined;
    if (!opens.length && !p) return false;
    const k = pricer.knownOf(symbol, ref);
    const st = k ? hub.quote(ref.source, symbol) : undefined;
    // a US share's word is its source's REST read, as old as its own stamp: judged while it is STOCK_JUDGE_MS old at most
    if (!k || !st?.live || req.clock() - st.seenAt > (ref.kind === "stock" ? STOCK_JUDGE_MS : FILL_FRESH_MS)) return false;
    const hb = hub.book(ref.source, symbol, WALK_DEPTH);
    const q = keepLast(symbol, { ...streamed(k, st), ...(hb?.live ? { book: { bids: hb.bids, asks: hb.asks } } : {}) });
    const now = req.clock();
    // what a fill, a trigger or a liquidation moves, against which a trailing stop's move alone is told: the fills, the orders' states,
    // the cash, the order numbers
    const sig = (): string => `${b.fills.length}|${b.fills[b.fills.length - 1]?.ref ?? ""}|${b.seq}|${b.cashUsd}|${Object.keys(b.positions).length}|${opens.map((o) => `${o.status}${o.triggeredAt ?? ""}`).join(",")}`;
    const before = sig();
    let changed = p ? markOne(symbol, p, q, now) : false;
    for (const o of opens) {
      // the trades since this order was last judged here: every one that came live after it, by its seq alone (a venue's trades come up to
      // half a second after its stamp, after the quote that moved the last judge), and of a snapshot's only those stamped after that judge
      // (SinceCut) — or, never judged here yet (a bracket's exit just placed, an order from before a restart), every trade the venue stamped
      // after it was placed, or last changed
      const from = judgedAt.get(o.ref);
      const range = from ? hub.since(ref.source, symbol, from.seq, { snapshotAfter: from.at }) : hub.since(ref.source, symbol, 0, { after: Date.parse(o.amendedAt ?? o.at) });
      const mine: { seq: number; at: number; stop?: number | undefined } = { seq: st.seq, at: now };
      judgedAt.set(o.ref, mine);
      const judged = judge(o, now, { q, ...(range?.trades ? { range } : {}), ...(from?.stop !== undefined ? { stood: from.stop } : {}) });
      // the stop as this judgement leaves it — judge moves a trailing stop's trail before it waits on anything — is the one the trades after
      // it print against
      mine.stop = o.stopPrice;
      if (await judged) changed = true;
      if (gen !== generation) return false;
    }
    if (judgedAt.size > 2_000) for (const r of [...judgedAt.keys()]) if (b.orders[r]?.status !== "open") judgedAt.delete(r);
    if (changed) saveSoon(sig() === before ? "trail" : "fill");
    return changed;
  };

  // ---- WHAT THE OPEN ORDERS HOLD (P1) ------------------------------------------------------------------------------------------------
  /** the price an open order is held at: its limit, its stop, its worst price, else the market's last ask (a buy) or bid (a sell) — a
   * trailing stop not trailing yet at the stop its trail would put behind that */
  const heldPrice = (o: PaperOrder, ref: PaperMarketRef): number | undefined => {
    const own = pos(o.limitPrice) ?? pos(o.stopPrice) ?? pos(o.worstPrice);
    if (own !== undefined) return own;
    const last = pos(o.side === "buy" ? ref.last?.ask : ref.last?.bid) ?? pos(ref.last?.price);
    // a trailing stop whose trail has not started yet (a share's, placed out of its session): where it would stop, trailed from that price
    return last !== undefined && o.type === "trailing_stop" ? trailStop(o.side, last, o) : last;
  };
  /** what one order needs when it fills: a buy's cash at its held price with its fee; a perpetual order that would open or add, its margin at
   * the market's leverage and its fee (one that closes the position the other way needs none); a plain sell, its units of the holding. A
   * bracket's exits need nothing: they close what their entry bought, and go with it */
  const needOf = (o: PaperOrder): { cash: number; units: number } => {
    const ref = b.markets[o.symbol];
    if (!ref || o.parent) return { cash: 0, units: 0 };
    if (ref.kind === "perp") {
      const p = b.positions[o.symbol];
      const closes = !!p && ((p.side === "long" && o.side === "sell") || (p.side === "short" && o.side === "buy"));
      const px = heldPrice(o, ref);
      if (o.reduceOnly || closes || px === undefined) return { cash: 0, units: 0 };
      const notional = o.qty * px;
      return { cash: round(notional / (p?.leverage ?? levOf(o.symbol, ref.maxLeverage ?? 1)) + chargesOf(ref, notional), 6), units: 0 };
    }
    if (o.side === "sell") return { cash: 0, units: o.qty };
    const px = heldPrice(o, ref);
    return { cash: px === undefined ? 0 : round(o.qty * px + chargesOf(ref, o.qty * px), 6), units: 0 };
  };
  /** what the open orders hold now — cash, and units by market — and how many hold anything, `but` that order (and its other exit) */
  const holds = (but?: PaperOrder): { cashUsd: number; units: Map<string, number>; orders: number } => {
    let cash = 0;
    let n = 0;
    const units = new Map<string, number>();
    for (const o of openAll()) {
      if (but && (o === but || o.ref === but.ref || (but.oco && o.ref === but.oco))) continue;
      const need = needOf(o);
      if (!(need.cash > 0) && !(need.units > 0)) continue;
      n++;
      cash += need.cash;
      if (need.units > 0) units.set(o.symbol, round((units.get(o.symbol) ?? 0) + need.units, 12));
    }
    return { cashUsd: round(cash, 6), units, orders: n };
  };
  /** what the open orders hold, in words, for a refusal: "" when they hold nothing */
  const heldWords = (h: { cashUsd: number; orders: number }): string => (h.cashUsd > 0 ? ` (${usd(h.cashUsd)} of the ${usd(b.cashUsd)} paper cash is held for ${h.orders} open order${h.orders === 1 ? "" : "s"})` : "");
  /** AN ORDER THAT WILL WAIT ON THE BOOK, refused when what it needs is not free: its cash beyond what the open orders hold, its units of the
   * holding beyond what plain sells sell already */
  const roomFor = (o: PaperOrder): Refusal | undefined => {
    const need = needOf(o);
    const h = holds(o);
    if (need.cash > 0) {
      const free = round(b.cashUsd - h.cashUsd, 6);
      if (free + 1e-9 < need.cash) return no("E_VENUE_INSUFFICIENT", { venue, message: `${b.name}: not enough paper buying power — ${usd(need.cash)} held for this order, ${usd(Math.max(0, free))} free${heldWords(h)}` });
    }
    // a close of the whole holding sells what is held, the plain sells on it canceled with it: nothing of it is anyone else's
    if (need.units > 0 && !o.closesAll) {
      const held = b.holdings[o.symbol]?.qty ?? 0;
      const selling = h.units.get(o.symbol) ?? 0;
      if (held - selling + 1e-12 < need.units) return no("E_VENUE_INSUFFICIENT", { venue, message: `${b.name}: a sell sells only what the paper account holds and no open order sells already — ${qtyText(held)} ${b.markets[o.symbol]?.base ?? o.symbol} held${selling > 0 ? `, ${qtyText(selling)} of it in open sell orders` : ""}, ${qtyText(o.qty)} asked` });
    }
    return undefined;
  };

  /** the client ids of the closes of a whole holding being placed now (close → place): their orders are placed closesAll */
  const closingAll = new Set<string>();
  /** WHETHER THE BOOK'S RULE WOULD REFUSE AN ORDER NOW, in its words (estimate), so the page says it before anything is signed: the cash
   * or the units it needs beyond what the open orders hold (P1 — fill's and roomFor's own sums and words), and a market order's size beyond
   * what the book holds within its worst price (P2: the stream's levels, else the source's book read for it — a book that does not answer
   * in time says nothing). A close of the whole holding counts the plain sells on it as canceled with it, and says so */
  const wouldRefuse = async (o: Parameters<NonNullable<LiveTrader["estimate"]>>[0], q: Quoted, feeBps: number): Promise<Pick<OrderEstimate, "refuses" | "note">> => {
    if (!(o.qty > 0) || !(o.price > 0)) return {};
    const type = o.type ?? "market";
    const perp = q.m.kind === "perp";
    const base = q.m.kind === "event" ? "contracts" : q.m.base;
    const h = holds();
    const free = round(b.cashUsd - h.cashUsd, 6);
    // the price it needs cash at, as its hold is taken (heldPrice): its limit, its stop, else the price it is valued at
    const at = pos(o.limitPrice) ?? pos(o.stopPrice) ?? o.price;
    const charges = (n: number): number => round((n * feeBps) / 10_000, 6);
    let note: string | undefined;
    if (perp) {
      const p = b.positions[o.symbol];
      const closes = !!p && (p.side === "long") === (o.side === "sell");
      if (!o.reduceOnly && !closes) {
        const lev = p?.leverage ?? levOf(o.symbol, Math.max(1, Math.floor(pos(q.m.maxLeverage) ?? b.markets[o.symbol]?.maxLeverage ?? 1)));
        const need = round((o.qty * at) / lev + charges(o.qty * at), 6);
        if (free + 1e-9 < need) return { refuses: `${b.name}: not enough paper buying power — ${usd(need)} needed as margin and fee at ${lev}x, ${usd(Math.max(0, free))} free${heldWords(h)}` };
      }
    } else if (o.side === "buy") {
      const need = round(o.qty * at + charges(o.qty * at), 6);
      if (free + 1e-9 < need) return { refuses: `${b.name}: not enough paper buying power — ${usd(need)} needed, ${usd(Math.max(0, free))} free${heldWords(h)}` };
    } else {
      const held = b.holdings[o.symbol]?.qty ?? 0;
      const selling = h.units.get(o.symbol) ?? 0;
      const whole = o.close === true && o.qty >= held - 1e-12;
      if (o.qty > held + 1e-12) return { refuses: `${b.name}: a sell sells only what the paper account holds — ${qtyText(held)} ${base} held, ${qtyText(o.qty)} asked` };
      if (!whole && o.qty > held - selling + 1e-12) return { refuses: `${b.name}: a sell sells only what the paper account holds and no open order sells already — ${qtyText(held)} ${base} held, ${qtyText(selling)} of it in open sell orders: at most ${qtyText(Math.max(0, round(held - selling, 12)))} now${o.close ? ", or close all of it (its open sell orders are canceled with the close)" : " — or cancel those orders first"}` };
      const sells = whole ? openIn(o.symbol).filter((x) => x.status === "open" && x.side === "sell" && !x.parent).length : 0;
      if (sells) note = `its ${sells === 1 ? "open sell order is" : `${sells} open sell orders are`} canceled with the close`;
    }
    // a market order: the book walked, as its fill will walk it, to the most it holds within the worst price
    if (type === "market") {
      const sideOf = (bk: { bids: ReadonlyArray<readonly [number, number | null]>; asks: ReadonlyArray<readonly [number, number | null]> }) => (o.side === "buy" ? bk.asks : bk.bids);
      const sized = (lv: ReadonlyArray<readonly [number, number | null]> | undefined): boolean => !!lv?.length && !lv.every(([, sz]) => sz === null);
      const top = o.side === "buy" ? q.askSz : q.bidSz;
      if (top === undefined || o.qty > top + 1e-12) {
        let levels = q.book ? sideOf(q.book) : undefined;
        let w = sized(levels) ? walk(o.side, o.qty, levels!, o.worstPrice) : undefined;
        if ((!w || ("short" in w && !w.worst && levels!.length < WALK_DEPTH)) && q.source.book) {
          const read = await inTime(q.source.book(o.symbol, WALK_DEPTH), BOOK_PREVIEW_MS);
          const more = read && !isRefusal(read) && Array.isArray(read.bids) && Array.isArray(read.asks) ? sideOf(read) : undefined;
          if (sized(more)) {
            levels = more;
            w = walk(o.side, o.qty, more!, o.worstPrice);
          }
        }
        if (w && "short" in w) {
          const most = floorTo(w.short, marketOf(q.source, q.m).qtyStep ?? DEFAULT_QTY_STEP);
          return { refuses: `${b.name}: the order book holds ${qtyText(w.short)} ${base} (≈ ${usd(w.short * o.price)}) on the ${o.side === "buy" ? "ask" : "bid"} side ${o.worstPrice !== undefined ? `within the worst price the order allows (${fig(o.worstPrice)})` : `in the ${w.levels} levels read`}, less than the ${qtyText(o.qty)} asked: a market order here fills whole or not at all — at most ${qtyText(most)} now, or a limit order that rests until it can`, ...(note ? { note } : {}) };
        }
      }
    }
    return note ? { note } : {};
  };

  const read = async (look = true): Promise<LiveBalance[]> => {
    if (look) await settle();
    // what the open orders hold is not free to spend: the cash line says how much of it is (P1), a holding how many of its units
    const h0 = holds();
    const out: LiveBalance[] = [{ asset: "USD", amount: round(b.cashUsd, 2), usd: round(b.cashUsd, 2), where: "paper money", class: "cash", ...(h0.cashUsd > 0 ? { freeUsd: round(Math.max(0, b.cashUsd - h0.cashUsd), 2) } : {}) }];
    for (const [symbol, h] of Object.entries(b.holdings)) {
      const ref = b.markets[symbol];
      if (!ref || !(h.qty > 0)) continue;
      const q = await quote(symbol);
      const price = pos(q?.m.price) ?? pos(q?.m.bid) ?? ref.last?.price ?? ref.last?.bid;
      const asset = ref.kind === "event" ? symbol : ref.base;
      const from = q ? (q.m.quoteFrom ?? q.m.venueName ?? q.source.name) : ref.source;
      const state = ref.kind === "event" && ref.closed ? " · closed, waiting for its settlement" : "";
      const selling = h0.units.get(symbol) ?? 0;
      out.push({ asset, amount: h.qty, ...(price !== undefined ? { usd: round(h.qty * price, 2) } : {}), where: `paper · ${ref.kind === "event" ? ref.name : `${symbol} from ${from}`}${state}`, class: classOf(ref.kind, ref.base), ...(selling > 0 ? { freeAmount: round(Math.max(0, h.qty - selling), 12) } : {}) });
    }
    for (const [symbol, p] of Object.entries(b.positions)) {
      const ref = b.markets[symbol];
      const q = await quote(symbol);
      const mark = q?.mark ?? pos(q?.m.price) ?? ref?.last?.price;
      const pnl = mark !== undefined ? round((p.side === "long" ? mark - p.entryPrice : p.entryPrice - mark) * p.qty, 2) : 0;
      const worth = round(p.marginUsd + pnl, 2);
      const funding = p.fundingUsd ? ` · ${signed(-p.fundingUsd)} funding` : "";
      // an open perpetual's margin and its unrealised result: counted in what the account is worth, and none of it free to spend — it is
      // the position's until the position is closed
      out.push({ asset: "USD", amount: worth, usd: worth, freeUsd: 0, where: `paper margin · ${p.side} ${qtyText(p.qty)} ${symbol} · ${p.leverage ?? 1}x${mark !== undefined ? ` · ${signed(pnl)} unrealised` : " · unmarked"}${funding}`, class: "cash" });
    }
    return out;
  };

  /** an order as the request says it, checked against the market as the paper account takes it: a refusal, or nothing. `whole`: a
   * reduce-only order of the whole position's size — a close, taken at the position's own size whatever the market's step now (one opened
   * under another step is never stranded) */
  const checkOrder = (o: OrderRequest, m: Market, whole = false): Refusal | undefined => {
    if (!m.types.includes(o.type)) return badOrder(venue, b.name, `${m.name} takes ${m.types.join(", ").replace(/_/g, "-")} orders here, not ${String(o.type).replace(/_/g, "-")} orders`);
    if (o.postOnly) return badOrder(venue, b.name, "post-only is not offered: a paper account has no book to rest on");
    if (o.tif !== undefined) {
      const tifs = m.tifsByType?.[o.type] ?? m.tifs ?? [];
      if (!tifs.includes(o.tif)) return badOrder(venue, b.name, `a ${o.type.replace(/_/g, "-")} order in ${m.name} takes ${tifs.join(", ")}, not ${o.tif}`);
    }
    if (!(Number.isFinite(o.qty) && o.qty > 0)) return badOrder(venue, b.name, "a size is more than zero");
    const limited = o.type === "limit" || o.type === "stop_limit";
    const stopped = o.type === "stop" || o.type === "stop_limit";
    if (limited ? !(o.limitPrice !== undefined && o.limitPrice > 0) : o.limitPrice !== undefined) return badOrder(venue, b.name, limited ? `a ${o.type.replace(/_/g, "-")} order has a limit price` : `a ${o.type.replace(/_/g, "-")} order has no limit price`);
    if (stopped ? !(o.stopPrice !== undefined && o.stopPrice > 0) : o.stopPrice !== undefined) return badOrder(venue, b.name, stopped ? `a ${o.type.replace(/_/g, "-")} order has a stop price` : `a stop price belongs to a stop order, not a ${o.type.replace(/_/g, "-")} order`);
    const trail = o.trailPercent !== undefined || o.trailPrice !== undefined;
    if (o.type === "trailing_stop") {
      if ((o.trailPercent === undefined) === (o.trailPrice === undefined)) return badOrder(venue, b.name, "a trailing stop trails by a percent or by a price: one of the two");
      if (o.trailPercent !== undefined && !(o.trailPercent > 0 && o.trailPercent < 100)) return badOrder(venue, b.name, "a trailing stop's percent is more than 0 and less than 100");
      if (o.trailPrice !== undefined && !(o.trailPrice > 0)) return badOrder(venue, b.name, "a trailing stop's price is more than zero");
    } else if (trail) return badOrder(venue, b.name, "a trail belongs to a trailing stop");
    if (o.extendedHours && !(o.type === "limit" && m.kind === "stock" && m.session?.extendedHours)) return badOrder(venue, b.name, o.type !== "limit" ? "extended hours take a limit order only" : `${m.name} takes no extended-hours order now`);
    if (o.extendedHours && o.tif !== undefined && o.tif !== "day" && o.tif !== "gtc") return badOrder(venue, b.name, "an extended-hours order is good for the day or till canceled");
    if (!whole && !onStep(o.qty, m.qtyStep)) return badOrder(venue, b.name, `a size in ${m.name} moves in steps of ${fig(m.qtyStep ?? 1)}`, { qty: o.qty, qtyStep: m.qtyStep });
    for (const [what, p] of [["limit", o.limitPrice], ["stop", o.stopPrice], ["take-profit", o.takeProfit], ["stop-loss", o.stopLoss]] as const) {
      if (p !== undefined && !onStep(p, m.priceStep)) return badOrder(venue, b.name, `${m.name} moves in steps of ${fig(m.priceStep!)}: a ${what} price of ${fig(p)} is between steps`, { price: p, priceStep: m.priceStep });
    }
    if (o.reduceOnly && m.kind !== "perp") return badOrder(venue, b.name, `reduce-only is for a perpetual: ${m.name} sells only what is held`);
    if (o.takeProfit !== undefined || o.stopLoss !== undefined) {
      if (!m.brackets) return badOrder(venue, b.name, `${m.name} takes no exits on an entry here`);
      if (o.type !== "market" && o.type !== "limit") return badOrder(venue, b.name, "a bracket's entry is a market or a limit order");
      if (o.reduceOnly) return badOrder(venue, b.name, "a reduce-only order is an exit already: it carries no exits of its own");
      if (o.tif === "ioc" || o.tif === "fok") return badOrder(venue, b.name, "a bracket's entry is good for the day or till canceled");
      if (o.extendedHours) return badOrder(venue, b.name, "a bracket is for the regular session");
      // each exit is judged against the entry's fill that is worst for it, as the account's door judges them: the take-profit against the
      // limit itself (a market order's: the book), the stop-loss against where the entry fills — a limit that crosses the book fills at
      // the book, better than its limit (a buy limited at 70,000 with the ask at 60,010 fills at 60,010: a stop-loss at 65,000 would sell
      // at once)
      const up = o.side === "buy";
      const atBook = up ? (pos(m.ask) ?? pos(m.price)) : (pos(m.bid) ?? pos(m.price));
      const ref = o.type === "limit" ? o.limitPrice! : atBook;
      const slRef = o.type === "limit" && atBook !== undefined ? (up ? Math.min(o.limitPrice!, atBook) : Math.max(o.limitPrice!, atBook)) : ref;
      if (ref !== undefined && o.takeProfit !== undefined && (up ? o.takeProfit <= ref : o.takeProfit >= ref)) return badOrder(venue, b.name, `the take-profit (${fig(o.takeProfit)}) must be ${up ? "above" : "below"} the entry (${fig(ref)}) for a ${o.side}`);
      if (slRef !== undefined && o.stopLoss !== undefined && (up ? o.stopLoss >= slRef : o.stopLoss <= slRef)) return badOrder(venue, b.name, `the stop-loss (${fig(o.stopLoss)}) must be ${up ? "below" : "above"} the entry (${fig(slRef)}) for a ${o.side}${slRef !== ref ? `: a ${o.side} limited at ${fig(ref!)} crosses the book and fills there, at ${fig(slRef)}` : ""}`);
    }
    return undefined;
  };

  const trader: LiveTrader = {
    can: true,
    what: "paper trading in the public markets: US stocks, coins, perpetuals with leverage, tokenised shares, event contracts",
    kinds: ["spot", "perp", "event", "token", "stock"],

    /** the markets to start from: what every source lists before anything is typed (each source's own few, as Markets reads them), the
     * sources in turn — a coin, a perpetual, a stock, a token, a contract … — so every market Markets shows carries this account's line;
     * a query: every match */
    async markets(q) {
      const Q = q.trim();
      const got = await pricer.listAll(Q, LIST_LIMIT);
      // a query: every match, the market whose symbol or base IS the words first (AAPL the share before "aapl-close-above-350…:Yes")
      if (Q) {
        // the exact ones go first BEFORE the few are picked, not after: a ticker that names a stock and twenty event contracts (NVDA: "Will
        // NVIDIA (NVDA) close above…", Yes and No each) would otherwise fill the few with the contracts and drop the share itself — and a
        // search for NVDA on Markets then listed the share with no line of this account to trade it on
        const exact = (m: Market): number => (m.symbol.toUpperCase() === Q.toUpperCase() || m.base.toUpperCase() === Q.toUpperCase() ? 0 : 1);
        return pick(got.map(({ source, m }) => marketOf(source, m)).sort((a, b) => exact(a) - exact(b)), Q);
      }
      const bySource = new Map<string, Array<{ source: PublicSource; m: Listing }>>();
      for (const x of got) bySource.set(x.source.id, [...(bySource.get(x.source.id) ?? []), x]);
      const lists = [...bySource.values()];
      const out: Market[] = [];
      for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(marketOf(l[i]!.source, l[i]!.m));
      return out;
    },

    async market(symbol) {
      // a ticket's market (the owner, or an agent, about to trade it): its stream wanted, so the order it prepares finds this moment's price
      const q = await quote(symbol, { want: true });
      if (!q) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${symbol.slice(0, 60)} just now, so it has no price here` });
      return marketOf(q.source, q.m);
    },

    async place(o: OrderRequest) {
      const was = ofClient(o.clientId);
      if (was) return stateOf(was);
      // the time asleep judged first, against the book as it stood (lookFirst)
      await lookFirst();
      const before = ofClient(o.clientId);
      if (before) return stateOf(before);
      const q0 = await quote(o.symbol, { want: true });
      if (!q0) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source prices ${o.symbol.slice(0, 60)} just now, so nothing is filled` });
      const m = marketOf(q0.source, q0.m);
      if (!m.open) return no("E_VENUE_MARKET_CLOSED", { venue, message: `${b.name}: ${m.name} takes no orders now${q0.m.note ? ` (${q0.m.note})` : ""}` });
      const held = b.positions[o.symbol];
      const bad = checkOrder(o, m, o.reduceOnly === true && held !== undefined && Math.abs(o.qty - held.qty) <= 1e-12);
      if (bad) return bad;
      // A COIN'S OR A PERPETUAL'S order judged at once is judged at a price FILL_FRESH_MS old at most (freshFor): a market order with none
      // is refused saying why; a limit order with none goes on the book unjudged, and the next fresh price judges it (it has not rested).
      // A US SHARE'S, while its session takes the order now, only at a real-time quote (stockFor: one the US line takes as real time) —
      // never Cboe's, fifteen minutes behind: a market order with none is refused saying so (use a limit), a limit goes on unjudged. Out of
      // its session it is queued or rests as before, and judged at a real-time quote when the session comes (judge)
      // A trailing stop on a share starts its trail from a real-time quote too, where its session takes one now. Whether the session takes
      // it now is the market's own clock's word (marketTakes), never the delayed quote's view of the market: a share Cboe alone prices at
      // 16:05 is in after-hours — a market order queued for the open, as any share's — and at 09:35 it is open — refused for want of a
      // real-time quote, never queued "for the open" that has come
      const stock0 = q0.m.kind === "stock";
      const as0: Pick<PaperOrder, "type" | "extendedHours"> = o.type === "limit" ? { type: "limit", extendedHours: o.extendedHours === true } : { type: "market" };
      const f = stock0 ? ((o.type === "market" || o.type === "limit" || o.type === "trailing_stop") && marketTakes(as0, q0, req.clock()) ? stockFor(q0, o.symbol, US_FRESH_MS) : q0) : o.type === "market" || o.type === "limit" ? await freshFor(q0, o.symbol) : q0;
      if (typeof f === "string" && o.type === "market") return no("E_VENUE_REJECTED", { venue, message: `${b.name}: ${f}` });
      if (typeof f === "string" && o.type === "trailing_stop") return no("E_VENUE_REJECTED", { venue, message: `${b.name}: ${stockStale(q0, US_FRESH_MS, "trail")}` });
      const unjudged = typeof f === "string";
      const q = typeof f === "string" ? q0 : f;
      // the same instruction may have been placed while the price was read
      const dup = ofClient(o.clientId);
      if (dup) return stateOf(dup);
      const at = req.clock();
      b.markets[o.symbol] = { ...refOf(q.source, q.m), last: { ...(pos(q.m.price) !== undefined ? { price: q.m.price } : {}), ...(pos(q.m.bid) !== undefined ? { bid: q.m.bid } : {}), ...(pos(q.m.ask) !== undefined ? { ask: q.m.ask } : {}), at: stampOf(q) ?? q.at } };
      const stock = m.kind === "stock";
      // how long it stands: a day order (a stock's default for anything that rests) to the end of its session — the regular one's, or the
      // extended one's for an order sent for extended hours — as the market's own clock says
      const tif = o.tif ?? (stock && o.type !== "limit" ? "day" : undefined);
      const clock = q.source.sessions ?? (q.source.id === US_STOCKS_ID ? usClock : undefined);
      const dayEnd = tif === "day" && clock ? clock.dayEndAt(at, o.extendedHours === true) : undefined;
      const order: PaperOrder = {
        ref: `p${++b.seq}`,
        clientId: o.clientId,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        qty: o.qty,
        ...(o.limitPrice !== undefined ? { limitPrice: o.limitPrice } : {}),
        ...(o.worstPrice !== undefined ? { worstPrice: o.worstPrice } : {}),
        ...(o.stopPrice !== undefined ? { stopPrice: o.stopPrice } : {}),
        ...(o.trailPercent !== undefined ? { trailPercent: o.trailPercent } : {}),
        ...(o.trailPrice !== undefined ? { trailPrice: o.trailPrice } : {}),
        ...(tif ? { tif } : {}),
        ...(dayEnd !== undefined ? { expiresAt: iso(dayEnd) } : {}),
        ...(o.reduceOnly ? { reduceOnly: true } : {}),
        ...(o.extendedHours ? { extendedHours: true } : {}),
        ...(o.takeProfit !== undefined ? { takeProfit: o.takeProfit } : {}),
        ...(o.stopLoss !== undefined ? { stopLoss: o.stopLoss } : {}),
        ...(closingAll.has(o.clientId) && o.side === "sell" && m.kind !== "perp" ? { closesAll: true as const } : {}),
        status: "open",
        filledQty: 0,
        at: iso(at),
        updatedAt: iso(at),
      };
      // a trailing stop starts from the price now: its stop is the trail behind it. A US SHARE'S trail starts only from a real-time quote —
      // never from Cboe's, fifteen minutes behind the market: placed out of its session with none at hand, it goes on the book with no trail
      // yet, and its trail starts at its session's first real-time quote (judge: a stop on a share is watched in the regular session, at
      // one); in its session with none, it was refused above
      if (o.type === "trailing_stop") {
        if (stock && !realTime(q, US_FRESH_MS)) order.note = TRAIL_WAIT_NOTE;
        else {
          const watch = o.side === "sell" ? (pos(q.m.bid) ?? pos(q.m.price)) : (pos(q.m.ask) ?? pos(q.m.price));
          if (watch === undefined) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: ${m.name} shows no price just now to trail from` });
          order.hwm = watch;
          order.stopPrice = trailStop(o.side, watch, order);
        }
      }
      const px = sideQuote(o.side, q.m);
      if (px === undefined) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: ${m.name} shows no ${o.side === "buy" ? "ask" : "bid"} just now` });
      // the market takes it now by its own clock, and the quote at hand could fill it (its own phases): a quote fifteen minutes behind that
      // still sees the regular session after the close fills nothing, and the order waits for its session
      const fillable = marketTakes(as0, q, at) && canFillNow(as0, q, at);
      const atOnce = o.tif === "ioc" || o.tif === "fok";
      /** the order on the book, its place in its market's trades taken (the stream's ticks judge it against the trades from now, a stop's
       * against the stop it was placed with) */
      const onBook = (): void => {
        b.orders[order.ref] = order;
        track(order);
        const st = hubNow()?.quote(q.source.id, o.symbol);
        if (st && order.status === "open") judgedAt.set(order.ref, { seq: st.seq, at, ...(order.stopPrice !== undefined ? { stop: order.stopPrice } : {}) });
      };
      if (o.type === "market") {
        if (fillable) {
          // the account's worst price holds here as a marketable limit does: a quote past it fills nothing
          if (pastWorst(order, px)) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: the quote (${fig(px)}) is past the worst price the order allows (${fig(o.worstPrice!)}): nothing was filled`, detail: { quoted: px, worstPrice: o.worstPrice } });
          // the ask or the bid where the best level holds the size, else the book walked
          const taken = await takeAt(order, q);
          if (typeof taken === "string") return no("E_VENUE_REJECTED", { venue, message: `${b.name}: ${taken}: nothing was filled` });
          const again = ofClient(o.clientId);
          if (again) return stateOf(again);
          const r = fill(order, taken, req.clock(), q);
          if (r) return r;
          onBook();
          save();
          return stateOf(order);
        }
        // out of the session: queued for it, as a broker holds a market order for the open — unless it was to fill at once
        if (atOnce) {
          order.status = "canceled";
          order.note = `${o.tif}: ${m.name} is not in session now, nothing filled`;
        } else {
          order.note = `queued for the open: ${m.name} fills when its session is on, at its first real-time quote then — never past the worst price signed${o.worstPrice !== undefined ? ` (${fig(o.worstPrice)})` : ""}: an open past it cancels it, nothing filled`;
          // the band its door gave it from the price it was valued at: its worst price is taken afresh by it at the open, inside the signed
          // one (judge, P4)
          if (o.worstPrice !== undefined && px > 0) order.queuedBand = Math.min(0.1, round(Math.abs(o.worstPrice / px - 1), 6));
          const room = roomFor(order);
          if (room) return room;
        }
        onBook();
        save();
        return stateOf(order);
      }
      if (o.type === "limit") {
        const crossed = !unjudged && fillable && (o.side === "buy" ? px <= o.limitPrice! + 1e-12 : px >= o.limitPrice! - 1e-12);
        if (crossed) {
          // at the quote where it is better than the limit
          const r = fill(order, o.side === "buy" ? Math.min(px, o.limitPrice!) : Math.max(px, o.limitPrice!), at, q);
          if (r) return r;
        } else if (atOnce) {
          order.status = "canceled";
          order.note = unjudged ? `${o.tif}: ${f}` : fillable ? `${o.tif}: the quote did not cross the limit, nothing filled` : `${o.tif}: ${m.name} is not in session now, nothing filled`;
        } else {
          // it waits on the book: what it needs is held for it, or it is refused now rather than when it fills (P1)
          const room = roomFor(order);
          if (room) return room;
          if (unjudged) order.note = FRESH_WAIT_NOTE;
          else if (!fillable) order.note = `resting until ${m.name}'s session is on`;
          // placed at a quote that could fill it and does not reach it: it rests from now, filled at its own price when the quote comes to it
          else rest(order, q, at);
        }
        onBook();
        save();
        return stateOf(order);
      }
      // a stop or a trailing stop: on the book, watched from now, what it needs held for it; one sent to fill at once is judged at once
      if (!atOnce) {
        const room = roomFor(order);
        if (room) return room;
      }
      onBook();
      if (atOnce) {
        await judge(order, at);
        if (order.status === "open") {
          order.status = "canceled";
          order.note = `${o.tif}: it did not trigger at once, nothing filled`;
        }
      }
      save();
      return stateOf(order);
    },

    async cancel(ref) {
      if (!b.orders[ref]) return no("E_ACCOUNT_ORDER_UNKNOWN", { venue, message: `${b.name} has no order ${ref}`, detail: { order: ref } });
      // what the time asleep filled stands before the cancel, as it happened (lookFirst)
      await lookFirst();
      const o = b.orders[ref];
      if (!o) return no("E_ACCOUNT_ORDER_UNKNOWN", { venue, message: `${b.name} has no order ${ref}`, detail: { order: ref } });
      const at = iso(req.clock());
      if (o.status === "open") {
        o.status = "canceled";
        o.updatedAt = at;
        // one exit of a bracket canceled takes the other with it (one cancels the other)
        if (o.oco) {
          const sib = b.orders[o.oco];
          if (sib && sib.status === "open") Object.assign(sib, { status: "canceled", note: `canceled with ${o.ref}`, updatedAt: at });
        }
        save();
      } else if (o.status === "filled" && o.children?.length) {
        // an entry that filled: canceling it cancels what is left of its exits
        let any = false;
        for (const r of o.children) {
          const c = b.orders[r];
          if (c && c.status === "open") {
            Object.assign(c, { status: "canceled", note: `canceled with its entry ${o.ref}`, updatedAt: at });
            any = true;
          }
        }
        if (any) save();
      }
      return stateOf(o);
    },

    async status(ref) {
      const o = b.orders[ref];
      if (!o) return no("E_ACCOUNT_ORDER_UNKNOWN", { venue, message: `${b.name} has no order ${ref}`, detail: { order: ref } });
      await settle();
      return stateOf(o);
    },

    /** an open order changed in place: its size, its limit, its stop (a trailing stop's trail is set when it is placed). It is looked at
     * again once its quote is back — a look may have filled it, or the owner canceled it, meanwhile — and changed only if it is still open.
     * A bracketed entry keeps its exits, checked again against the entry as changed. A new limit is a new price on the book: it rests again
     * only once a quote that could fill it does not reach it */
    async amend(ref, _symbol, change) {
      if (b.orders[ref]?.status === "open") await lookFirst();
      const o = b.orders[ref];
      if (!o) return no("E_ACCOUNT_ORDER_UNKNOWN", { venue, message: `${b.name} has no order ${ref}`, detail: { order: ref } });
      if (o.status !== "open") return badOrder(venue, b.name, `order ${ref} is ${o.status}: only an open order is changed`);
      const q = await quote(o.symbol);
      if (!q) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${o.symbol.slice(0, 60)} just now` });
      if (o.status !== "open") return badOrder(venue, b.name, `order ${ref} is ${o.status}: only an open order is changed`);
      const m = marketOf(q.source, q.m);
      if (change.limitPrice !== undefined && o.type !== "limit" && o.type !== "stop_limit") return badOrder(venue, b.name, `a ${o.type.replace(/_/g, "-")} order has no limit price to change`);
      if (change.stopPrice !== undefined && o.type !== "stop" && o.type !== "stop_limit") return badOrder(venue, b.name, o.type === "trailing_stop" ? "a trailing stop's stop follows the price: it is not set by hand" : `a ${o.type} order has no stop price to change`);
      if (change.stopPrice !== undefined && o.triggeredAt) return badOrder(venue, b.name, `order ${ref} has triggered already: its stop is behind it`);
      const next = { qty: change.qty ?? o.qty, limitPrice: change.limitPrice ?? o.limitPrice, stopPrice: change.stopPrice ?? o.stopPrice };
      const bad = checkOrder({ symbol: o.symbol, side: o.side, type: o.type, qty: next.qty, clientId: o.clientId, ...(next.limitPrice !== undefined && (o.type === "limit" || o.type === "stop_limit") ? { limitPrice: next.limitPrice } : {}), ...(next.stopPrice !== undefined && o.type !== "trailing_stop" && o.type !== "limit" && o.type !== "market" ? { stopPrice: next.stopPrice } : {}), ...(o.type === "trailing_stop" ? (o.trailPercent !== undefined ? { trailPercent: o.trailPercent } : { trailPrice: o.trailPrice }) : {}), ...(o.reduceOnly ? { reduceOnly: true } : {}), ...(o.takeProfit !== undefined ? { takeProfit: o.takeProfit } : {}), ...(o.stopLoss !== undefined ? { stopLoss: o.stopLoss } : {}) }, m);
      if (bad) return bad;
      // what it holds is weighed again as it would stand changed (P1)
      const room = roomFor({ ...o, qty: next.qty, ...(next.limitPrice !== undefined ? { limitPrice: next.limitPrice } : {}), ...(next.stopPrice !== undefined ? { stopPrice: next.stopPrice } : {}) });
      if (room) return room;
      o.qty = next.qty;
      if (change.limitPrice !== undefined) {
        o.limitPrice = change.limitPrice;
        unrest(o);
      }
      if (change.stopPrice !== undefined) o.stopPrice = change.stopPrice;
      const now = req.clock();
      o.updatedAt = iso(now);
      // A NEW PRICE ON THE BOOK FROM NOW: a trade from before the change never fills or triggers the order as changed — its place in its
      // market's trades taken now (the stream's ticks judge it from here, against the stop as changed), and the moment of the change kept
      // on the order (amendedAt: an order never judged on a tick after a restart, and the time asleep, count from it)
      o.amendedAt = iso(now);
      const st = hubNow()?.quote(b.markets[o.symbol]?.source ?? q.source.id, o.symbol);
      const mine: { seq: number; at: number; stop?: number | undefined } | undefined = st ? { seq: st.seq, at: now } : undefined;
      if (mine) judgedAt.set(o.ref, mine);
      else judgedAt.delete(o.ref);
      const judged = judge(o, now);
      if (mine) mine.stop = o.stopPrice;
      await judged;
      save();
      return stateOf(o);
    },

    /** the funding its perpetuals paid and received, hour by hour as the book settled it (payFunding), newest first — the hours due now
     * settled first — `limit` lines at most, none from before `since` */
    async funding(o) {
      await settle();
      const since = o.since ?? Number.NEGATIVE_INFINITY;
      return (b.funding ?? [])
        .filter((f) => Date.parse(f.at) >= since)
        .slice(-Math.max(1, Math.floor(o.limit)))
        .reverse()
        .map((f) => ({ at: f.at, symbol: f.symbol, usd: f.usd, ...(f.side ? { side: f.side } : {}), ...(f.qty !== undefined ? { qty: f.qty } : {}), ...(f.price !== undefined ? { price: f.price } : {}), ...(f.rate !== undefined ? { rate: f.rate } : {}), ...(f.quoted ? { quoted: true as const } : {}) }));
    },

    async positions() {
      await settle();
      const out: Position[] = [];
      // the perpetuals, each marked at its quote now (or the last quote kept); the moment the mark is from goes with it (its quote's, or the
      // last quote kept's): the page says how old a mark is once it is not fresh
      for (const symbol of Object.keys(b.positions)) {
        const ref = b.markets[symbol];
        const q = await quote(symbol);
        const row = positionRow(symbol, q?.mark ?? pos(q?.m.price) ?? ref?.last?.price, q ? stampOf(q) : ref?.last?.at, pos(q?.m.maxLeverage));
        if (row) out.push(row);
      }
      // what is held — coins, shares, tokens, contracts — with what the book paid for it: the book's own cost, so a paper holding's result
      // is the book's, fills the account did not place (a bracket's exit, a settlement) and all
      for (const [symbol, h] of Object.entries(b.holdings)) {
        const ref = b.markets[symbol];
        if (!ref || !(h.qty > 0)) continue;
        const q = await quote(symbol);
        const row = positionRow(symbol, pos(q?.m.price) ?? pos(q?.m.bid) ?? ref.last?.price, q ? stampOf(q) : ref.last?.at);
        if (row) out.push(row);
      }
      return out;
    },

    /** a position closed at the market: a perpetual reduced, a holding sold — queued for the session where a stock is out of it. A close
     * of the WHOLE holding sells what is held whatever plain sells hold of it, and cancels those sells once it has filled (closesAll): a
     * stop-loss resting on a holding never keeps its owner from closing it */
    async close(symbol, qty, clientId) {
      const p = b.positions[symbol];
      const h = b.holdings[symbol];
      if (!p && !h) return no("E_VENUE_REJECTED", { venue, message: `${b.name} holds nothing in ${symbol.slice(0, 60)}` });
      const side: Side = p ? (p.side === "long" ? "sell" : "buy") : "sell";
      const held = p ? p.qty : h!.qty;
      const whole = !p && qty >= held - 1e-12;
      if (whole) closingAll.add(clientId);
      try {
        return await trader.place({ symbol, side, type: "market", qty: Math.min(qty, held), clientId, ...(p ? { reduceOnly: true } : {}) });
      } finally {
        closingAll.delete(clientId);
      }
    },

    /** WHAT AN ORDER WOULD LEAVE, by this book's own rule, before it is placed (the ticket's fee row and its estimated liquidation price):
     * the fee at `price` (a US share none, everything else the book's fee) and, for a perpetual, the position as the order would leave it —
     * added to at the leverage it stands at (a new one at the leverage set for the market, as a fill opens it), or reduced, its margin
     * scaled with it — and that position's liquidation price under the rule the looks liquidate by (liquidationPriceOf), at the most leverage
     * the market's source shows. AND WHETHER THE RULE WOULD REFUSE IT NOW (refuses), so the account says it before the owner signs: what it
     * needs of the cash or the holding beyond what the open orders hold (P1, roomFor's words) — a close of the whole holding counts the
     * plain sells on it as canceled with it (note) — and, for a market order, the book walked (P2: its stream's levels, else its source's
     * read for it) to the most it holds within the order's worst price. Nothing is placed, held or saved */
    async estimate(o) {
      const q = await quote(o.symbol);
      if (!q) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${o.symbol.slice(0, 60)} just now` });
      const kind = q.m.kind;
      const notional = o.qty * o.price;
      const feeBps = kind === "stock" ? 0 : b.feeBps;
      const said = await wouldRefuse(o, q, feeBps);
      const out: OrderEstimate = { feeUsd: round((notional * feeBps) / 10_000, 6), feeBps, ...said };
      if (kind !== "perp" || !(o.qty > 0) || !(o.price > 0)) return out;
      const most = Math.max(1, Math.floor(pos(q.m.maxLeverage) ?? b.markets[o.symbol]?.maxLeverage ?? 1));
      const p = b.positions[o.symbol];
      const opposite = !!p && (p.side === "long") === (o.side === "sell");
      if (o.reduceOnly && !opposite) return out;
      if (opposite && p) {
        if (o.qty >= p.qty - 1e-12) return out;
        const left = { side: p.side, qty: p.qty - o.qty, entryPrice: p.entryPrice, marginUsd: p.marginUsd * (1 - o.qty / p.qty) };
        const liq = liquidationPriceOf(left, most);
        return { ...out, leverage: p.leverage ?? 1, ...(liq !== undefined ? { liquidationPrice: liq } : {}) };
      }
      const lev = p?.leverage ?? levOf(o.symbol, most);
      const after = p ? { side: p.side, qty: p.qty + o.qty, entryPrice: (p.entryPrice * p.qty + o.price * o.qty) / (p.qty + o.qty), marginUsd: p.marginUsd + notional / lev } : { side: (o.side === "buy" ? "long" : "short") as PaperPosition["side"], qty: o.qty, entryPrice: o.price, marginUsd: notional / lev };
      const liq = liquidationPriceOf(after, most);
      return { ...out, leverage: lev, ...(liq !== undefined ? { liquidationPrice: liq } : {}) };
    },

    /** a perpetual's leverage, isolated: set for the market, and — where a position is open — its margin moved to the new leverage's
     * initial margin (more margin taken from cash, or given back to it) */
    async setLeverage(symbol, leverage, marginMode) {
      if (marginMode === "cross") return badOrder(venue, b.name, "a paper account keeps isolated margin: each position's own margin, and nothing more, is at risk");
      if (!(Number.isInteger(leverage) && leverage >= 1)) return badOrder(venue, b.name, "leverage is a whole number, 1 or more");
      // the time asleep judged first: a position the bars liquidated is not given more margin (lookFirst)
      await lookFirst();
      const q = await quote(symbol);
      if (!q) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${symbol.slice(0, 60)} just now` });
      const m = marketOf(q.source, q.m);
      if (m.kind !== "perp") return badOrder(venue, b.name, `leverage is set on a perpetual: ${m.name} is ${m.kind}`);
      const max = m.maxLeverage ?? 1;
      if (leverage > max) return no("E_VENUE_ORDER_INVALID", { venue, message: `${b.name}: ${m.name} takes at most ${max}x (what its source shows)`, detail: { maxLeverage: max } });
      const p = b.positions[symbol];
      if (p) {
        const was = p.leverage ?? 1;
        const delta = round((p.entryPrice * p.qty) / leverage - (p.entryPrice * p.qty) / was, 6);
        // the margin it takes comes out of the FREE cash (P1): what the open orders hold is theirs — weighed with the position at the new
        // leverage, since an order that adds to it holds its margin at it
        p.leverage = leverage;
        const h = holds();
        p.leverage = was;
        const free = round(b.cashUsd - h.cashUsd, 6);
        if (delta > 0 && free + 1e-9 < delta) return no("E_VENUE_INSUFFICIENT", { venue, message: `${b.name}: ${leverage}x on the open position needs ${usd(delta)} more margin, ${usd(Math.max(0, free))} ${h.cashUsd > 0 ? "free" : "there"}${heldWords(h)}` });
        b.cashUsd = round(b.cashUsd - delta, 6);
        p.marginUsd = round(p.marginUsd + delta, 6);
        p.leverage = leverage;
      }
      b.markets[symbol] = refOf(q.source, q.m);
      b.leverage = { ...(b.leverage ?? {}), [symbol]: leverage };
      save();
      return { leverage, marginMode: "isolated", native: { paper: true, book: b.id, symbol, leverage, maxLeverage: max, ...(p ? { marginUsd: p.marginUsd } : {}) } };
    },

    async stats(symbols) {
      const out = new Map<string, MarketStats>();
      for (const s of symbols ?? Object.keys(b.markets)) {
        const q = await quote(s);
        if (q) out.set(s, { price: q.m.price, changePct24h: q.m.changePct24h, change24h: q.m.change24h, volumeUsd24h: q.m.volumeUsd24h });
      }
      return out;
    },

    async events(o) {
      return (await pricer.events(o)).map(({ source, m }) => marketOf(source, m));
    },

    /** the market's price history, its public source's, passed through as the source gives it — the window asked, its pages and its words
     * (where the history ends, where the bars are from): a paper account's chart is its source's chart */
    async candles(symbol, interval, w) {
      if (!CANDLE_INTERVALS.includes(interval)) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: price history comes in bars of ${CANDLE_INTERVALS.join(", ")}` });
      const q = await quote(symbol);
      if (!q) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${symbol.slice(0, 60)} just now` });
      if (!q.source.candles) return no("E_VENUE_RAIL_CLOSED", { venue, message: `${b.name}: ${q.source.name} keeps no price history the account can read` });
      return q.source.candles(symbol, interval, w);
    },

    /** the public source a market's bars and book are read from, by its name */
    async pricesFrom(symbol) {
      const q = await quote(symbol);
      return q ? (q.m.venueName ?? q.source.name) : b.markets[symbol]?.source;
    },

    /** the market's order book, as its public source gives it — the book a paper order is judged against is that source's price, and this
     * is the same source's depth. A source the account reads no book from says so with `detail.book: "none"`, so the account shows the best
     * bid and ask the market carries, as that (service.ts marketBook) — and `detail.topOnly` says whether that is all the source has (US
     * stocks' public quotes: "none") or the source has a book the account does not read ("unread": an exchange's pre-IPO contract) */
    async book(symbol, depth) {
      // the market's own stream, where it keeps the book (a page holds it): this moment's levels, and nothing asked of the source — where it
      // holds the depth asked. A stream that sends only its venue's top levels (Hyperliquid's and OKX's five, Kraken's ten) stands for a
      // deeper ask only when the source's own book cannot answer it: then said as a book that may go on past its last level (`more`)
      const hub = hubNow();
      const k = pricer.knownOf(symbol, b.markets[symbol]);
      const d = Math.max(1, Math.min(50, Math.floor(depth) || 20));
      let streamed: OrderBook | undefined;
      if (hub && k && hub.covers(k.source.id, symbol)) {
        hub.want(k.source.id, symbol);
        const hb = hub.book(k.source.id, symbol, d);
        if (hb?.live && (hb.bids.length || hb.asks.length)) {
          streamed = { bids: hb.bids, asks: hb.asks, at: iso(hb.seenAt), from: `${hb.src} · live`, depth: "full", more: { bids: !hb.whole || hb.bids.length >= d, asks: !hb.whole || hb.asks.length >= d } };
          if (hb.whole || (hb.bids.length >= d && hb.asks.length >= d)) return streamed;
        }
      }
      const q = await quote(symbol);
      if (!q) return streamed ?? no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${symbol.slice(0, 60)} just now` });
      if (!q.source.book) return streamed ?? no("E_VENUE_RAIL_CLOSED", { venue, message: `${b.name}: ${q.source.kind === "stocks" ? `${q.source.name} publishes no order book` : `the account reads no order book from ${q.source.name}`}`, detail: { book: "none", topOnly: q.source.kind === "stocks" ? "none" : "unread" } });
      const read = await q.source.book(symbol, depth);
      return isRefusal(read) && streamed ? streamed : read;
    },

    /** the market's latest trades, as its public source gives them */
    async trades(symbol, limit) {
      // the market's own stream, while it is live and has heard as many trades as are asked (or twenty): nothing asked of the source
      const hub = hubNow();
      const k = pricer.knownOf(symbol, b.markets[symbol]);
      if (hub && k && hub.covers(k.source.id, symbol) && hub.quote(k.source.id, symbol)?.live) {
        hub.want(k.source.id, symbol);
        const tape = hub.trades(k.source.id, symbol, limit);
        if (tape.length >= Math.min(Math.max(1, Math.floor(limit) || 30), 20)) return tape;
      }
      const q = await quote(symbol);
      if (!q) return no("E_VENUE_REJECTED", { venue, message: `${b.name}: no public source lists ${symbol.slice(0, 60)} just now` });
      if (!q.source.trades) return no("E_VENUE_RAIL_CLOSED", { venue, message: `${b.name}: ${q.source.name} publishes no trades` });
      return q.source.trades(symbol, limit);
    },
  };

  /** THE OWNER'S OWN CONTROLS over the book, each signed (account/exchange.ts resetPaper, topUpPaper). A reset waits for a look under way
   * to end — a look judges the book's orders against quotes it is still waiting for, and must never fill one into the book that replaced
   * them — then archives the book as it stands beside it and starts the same object again, so every part of this account (its trader, its
   * look) reads the new book from the next moment */
  const controls: PaperControls = {
    async reset(cashUsd) {
      while (settling) await settling.catch(() => false);
      // no tick judges the book from here, and no write of the book being replaced lands after the new one
      resetting = true;
      try {
        await chain;
      } finally {
        resetting = false;
      }
      // a judgement still under way — a tick waiting on a book read, a look on a quote — holds an order of the book being replaced: from
      // here it finds the generation moved on, and fills nothing into the new book
      generation++;
      const at = req.clock();
      let archived: string;
      try {
        archived = archiveBook(path, b, at);
      } catch (err) {
        return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${b.name}: its book could not be archived, so it was not started again: ${String((err as Error)?.message ?? err).slice(0, 160)}` });
      }
      const started = freshBook(b, cashUsd, at, archived);
      for (const k of Object.keys(b)) delete (b as unknown as Record<string, unknown>)[k];
      Object.assign(b, started);
      settleAsked.clear();
      judgedAt.clear();
      // the index of the new book's orders (none), the old one's told as gone, nothing owed of a book that is no more
      reindex();
      ordersGone = true;
      owed.clear();
      if (lookedAt !== undefined) b.lookedAt = iso(lookedAt);
      save();
      return { archived, book: summaryNow() };
    },
    topUp(amount) {
      const after = round(b.cashUsd + amount, 6);
      if (after > PAPER_MAX_CASH) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${b.name}: a paper account holds at most ${usd(PAPER_MAX_CASH)} of paper cash; ${usd(amount)} more would make it ${usd(after)}` });
      const at = req.clock();
      b.cashUsd = after;
      (b.deposits ??= []).push({ at: iso(at), usd: amount });
      save();
      return { book: summaryNow() };
    },
    summary: () => summaryNow(),
    flush: () => flush(),
  };

  let first: LiveBalance[];
  try {
    // a book opened again after time it was not looked at, by an account that streams the markets but has no hub up yet (the real
    // server starts it after its accounts open): read as it stands, judged at nothing — the first look with the hub up judges that time
    // against bars first, and only then the orders at the quote
    const owing = !!req.hub && !hubNow() && lookedAt !== undefined && req.clock() - lookedAt > CATCH_UP_MS;
    first = await read(!owing);
  } catch (err) {
    return no("E_VENUE_UNREACHABLE", { venue, message: `${b.name}: its holdings could not be priced just now: ${String((err as Error)?.message ?? err).slice(0, 160)}` });
  }
  const source: LiveSource = {
    name: b.name,
    kind: "cex",
    reference: `paper/${venue}/book.json`,
    via: "Paper account · the account's own book, priced at the public quotes Markets reads without a key",
    probe: { can: ["read", "trade"], note: `${rule} · started with ${usd(b.startCashUsd)} of paper money on ${b.createdAt.slice(0, 10)}`, native: { paper: true, book: path, startCashUsd: b.startCashUsd, feeBps: b.feeBps, createdAt: b.createdAt } },
    read: () => read(),
    readOnlyBecause: "paper money: nothing real moves in or out of a paper account (its owner adds paper money, or starts it again, from its own row)",
    trader,
    paper: true,
    paperBook: controls,
    // what the book tells as it changes (PaperChange): the account's push channel listens to it (service.ts paperSaid → account/stream.ts)
    paperEvents: events,
    // the account's own look at the book, between the page's reads: resting orders judged, stops watched, exits placed, days ended, funding
    // paid, positions liquidated (service.ts watches every paper account this way)
    // A book with nothing open is not looked at — and the look is taken as this moment's all the same: nothing stood for the time between
    // to be judged against, so a position opened next is never judged against the bars from before it (catchUp)
    settle: async () => {
      if (openAll().some((o) => o.status === "open") || Object.keys(b.positions).length || owed.size || Object.values(b.markets).some((r) => r.kind === "event")) return settle();
      if (!settling) lookAt(req.clock());
      return false;
    },
    // the source each market is priced by here, as the streams are asked for it (service.ts followMarkets, the desk's marks)
    priceSource: (symbol) => pricer.knownOf(symbol, b.markets[symbol])?.source.id ?? b.markets[symbol]?.source,
    // let go (unplugged, or connected again): its markets' ticks judge this book no more, and what waits to be written is written
    stop: () => {
      stopped = true;
      offTicks?.();
      offTicks = undefined;
      if (soonTimer) {
        tell();
        void flush().catch(() => undefined);
      }
    },
  };
  return { source, first };
}

/** a trailing stop's stop, `best` being the best price since it was placed (the highest for a sell, the lowest for a buy) */
function trailStop(side: Side, best: number, o: Pick<PaperOrder, "trailPercent" | "trailPrice">): number {
  const by = o.trailPercent !== undefined ? (best * o.trailPercent) / 100 : (o.trailPrice ?? 0);
  return round(side === "sell" ? best - by : best + by, 10);
}
