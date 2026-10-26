/** US STOCKS WITHOUT A KEY: real-time quotes where a keyless source gives them — Robinhood's, else Nasdaq's (us-quotes.ts) — and Cboe's own
 * delayed quotes where neither answers in time, so the Markets screen's Stocks tab — and a paper account — have real US stock prices before
 * any broker is connected. Read-only: nothing is traded through this listing; a US stock trades at a connected broker (Alpaca, Robinhood:
 * "Connect to trade") or in a paper account, which fills at these quotes by its own declared rule (paper.ts). The source keeps the id
 * "cboe" (US_STOCKS_ID): paper books already name it as the source of what they hold.
 *
 * Every line says which source priced it and how far behind that source is (quoteFrom: "Robinhood · real time",
 * "Nasdaq · real time", "Cboe · 15 min delayed"), with the price's own time as its source stamps it (quoteAt) and the delay (delayMs: 0, or
 * Cboe's fifteen minutes): a paper account judges a fill by them, never by the clock alone. The price, bid and ask on a line are all one
 * source's. A listing asks the real-time chain and Cboe AT THE SAME TIME: the chain is waited for RT_WAIT_MS at most (us-quotes.ts), Nasdaq
 * only for the first NASDAQ_AT_ONCE lines Robinhood did not price — the ticker typed whole first — and every other line is Cboe's.
 *
 * The DAY'S CHANGE on a line (change24h, changePct24h) is the change of the line's price from the last regular-session close before the
 * price's own time — yesterday's close in pre-market and the regular session, today's in after-hours — so the price less the change is that
 * close: Nasdaq's own figure (primaryData); for a Robinhood line, its price less Cboe's previous close (prev_day_close), and only while
 * Cboe's file is from the regular session the quote is in (DAY_CHANGE_FROM_CBOE: from Cboe's first trade of the day, about 09:45 New York,
 * to the close; in pre-market, after-hours and overnight the close it would be measured from is one Cboe's file does not say for certain,
 * and none is said); for a Cboe line, Cboe's own (price_change, from prev_day_close), only where Cboe gives a previous close.
 *
 * What is read from Cboe, and what it is (cboe.com's own quote pages read the same files; checked keyless from this machine 2026-10-13, 14:00
 * UTC, and 2026-10-14 17:49 UTC):
 *   GET cdn-api.cboe.com/api/global/delayed_quotes/quotes/{symbol}.json      one stock or ETF: {timestamp, data: {symbol, security_type
 *                       (stock | index), current_price, price_change, price_change_percent (both the DAY's, from prev_day_close), bid, ask,
 *                       bid_size, ask_size, open, high, low, close, prev_day_close, volume (shares), last_trade_time}}, about 520 bytes.
 *                       `timestamp` is when Cboe wrote the file, in UTC; `last_trade_time` is New York time with no zone written, FIFTEEN
 *                       MINUTES behind the market (14:00:46 UTC beside a last trade at 09:45:44 New York, which is 13:45 UTC): the delay is
 *                       Cboe's, said on every line it prices. A symbol Cboe does not list answers HTTP 403 from the store behind the CDN
 *                       (an XML AccessDenied, not a refusal of this network): read as "not listed". But the store also keeps files of
 *                       tickers that no longer trade: SATS.json (2026-10-14) is dated "2026-09-26 14:14:54", last_trade_time
 *                       "2026-06-23T15:59:59", current_price 103.3, prev_day_close 0.0 and bid and ask 0.0 — EchoStar's share trades as
 *                       ECHO — so a ticker the loaded symbol book does not list is not asked of Cboe (Nasdaq, which knows the tickers that
 *                       trade, is), and a change is taken only beside a previous close. A dotted class share is written with its dot (BRK.B).
 *                       cdn.cboe.com redirects here (HTTP 307) and is not asked: the account follows no redirect
 *   GET …/symbol_book/symbol-book.json                                        every symbol Cboe quotes, {name, company_name} (35,769 on
 *                       2026-10-14, 2.3 MB), kept ten minutes (LIST_MS) and read for a search, the companies' names, which tickers the
 *                       market lists (a Robinhood quote is taken only for a ticker in it: us-quotes.ts UsAsk.listed) and which are likely
 *                       ETFs (a company name with ETF, ETN, Fund or Trust, not Inc or Corp: Nasdaq is asked for those as an ETF first). A
 *                       plain ticker (one to five letters, a class letter after a dot) is a stock or an ETF; an index (^SPX) or a futures
 *                       root is not offered
 *   GET …/charts/intraday/{symbol}.json                                       the last market day's regular-session minutes, each with its
 *                       real open, high, low, close and volume, {datetime (New York), price: {open, high, low, close}, volume:
 *                       {stock_volume}}, fifteen minutes behind; …/charts/historical/{symbol}.json every day since 2004 (600 KB, kept ten
 *                       minutes), its rows on days the market was closed (2025-05-26 copies 05-23) and its repeated dates (SPY 2024-12-31)
 *                       left out
 * PRICE HISTORY (feat/paper-live phase H, live/history-stocks.ts): Robinhood's real bars in bars of 1m to 1h for the windows it keeps — the
 * latest session in minutes, five sessions in five minutes, a month of hours with pre-market and after-hours, three of the regular session —
 * folded into 15m and 4h; Robinhood's daily bars for a year or five, Nasdaq's by dates for all of it and for every page scrolled left, today's
 * bar built from the session's minutes ("Today so far"), weeks folded from days; Cboe's days where both refuse. Every page says its source, that
 * its prices are split-adjusted and not dividend-adjusted, which hours it covers, and each night it has no bars of ("No overnight data").
 * Where Robinhood does not answer the minutes, the latest session's minutes of both Cboe and Nasdaq, asked at once and merged by time: Cboe's
 * real minute bars wherever Cboe has the minute (the regular session, to fifteen minutes ago), and Nasdaq's one-price-a-minute SAMPLES
 * (us-quotes.ts Nasdaq.chart: open, high, low and close the same, no volume) for the minutes Cboe has none of — pre-market, the last fifteen
 * minutes of a session under way, after-hours. A bar with any sampled minute in it understates its range, and carries no volume (a bar's
 * volume is said only where every minute in it has one); the page names both sources. Only what each source says is carried. Cboe's volume
 * is in shares, so no dollar volume is said (nothing here is estimated). The trading session is the account's own US market calendar
 * (account/calendar.ts usSessionFull): the regular session 09:30–16:00 New York on market days (13:00 on an early close), and which phase is on
 * — pre-market, after-hours, overnight — with whether a limit order may be sent for it (extendedHours): in pre-market and after-hours where a
 * real-time source priced the line (a paper account fills only at a quote stamped in the phase that is on, and Cboe's never is); overnight
 * only where Robinhood priced it, its 24-hour market, while ROBINHOOD_OVERNIGHT says so. The source carries the calendar's clock
 * (`sessions`) for a paper account to judge a quote's own time by. Out of the regular session the line says so, and says when a real-time
 * price is not from the phase that is on.
 *
 * A LINE THE CHAIN PRICED NEVER WAITS FOR CBOE (feat/paper-live phase 3): Cboe is asked beside the chain, and waited for only for the lines
 * the chain did not price; the previous close beside a Robinhood price is taken where Cboe has already answered, and the day's change is
 * left out where it has not (the next read has it). ONE SHARE'S LINE (line: a paper account pricing a share it knows) asks the chain and
 * Cboe for that share alone — one GET of Cboe at most, where a search of a short ticker reads forty — and THE BACKGROUND READER (feed:
 * live/us-quotes.ts UsQuoteFeed) reads the shares someone is looking at as Robinhood and Nasdaq write them, sharing this line's one answer of
 * each; usLineAt says a line again at the reader's newer quote.
 *
 * Every GET goes through the fixed-host guard (public-markets.ts PUBLIC_HOSTS); a 451, a 429, an edge's 403 page or no answer from Cboe is
 * its answer for the whole listing when no real-time source priced anything either, held back as any public source's is (holdBackMs). */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { et, etDate, fromEt, isMarketDay, nextRegularSession, regularSession, usClock, usPhaseAt, usSessionFull } from "../account/calendar.ts";
import { no } from "../refuse.ts";
import { hostLane } from "./history.ts";
import { stockHistory } from "./history-stocks.ts";
import { badHistory, fin, fixedHosts, has, keeper, LIST_MS, list, nonNeg, pos, PUBLIC_HOSTS, publicNo, rec, round, str, type Listing, type PublicDeps, type PublicSource } from "./public-markets.ts";
import type { Candle, MarketSession } from "./trade.ts";
import { realHttp, unreachable, type HttpReply } from "./types.ts";
import { FRESH_MS, NASDAQ_FROM, nasdaqSource, ROBINHOOD_FROM, ROBINHOOD_OVERNIGHT, usQuote, UsQuoteFeed, type UsQuote } from "./us-quotes.ts";

/** whether Robinhood's quotes are taken in the overnight session (us-quotes.ts, where it is set): a share Robinhood priced is then offered
 * for an extended-hours limit order overnight */
export { ROBINHOOD_OVERNIGHT };

export const CBOE = "https://cdn-api.cboe.com/api/global/delayed_quotes";
/** how far behind the market Cboe's delayed quote is */
export const CBOE_DELAY_MS = 15 * 60_000;
/** the stocks and ETFs shown before anything is typed */
export const US_SHARES: readonly string[] = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "SPY", "QQQ", "DIA", "IWM", "AMD", "NFLX", "COIN", "HOOD", "MSTR", "PLTR", "BRK.B", "JPM", "V", "LLY", "UNH", "XOM", "WMT", "COST"];
/** the source's id, as it has always been: paper books name it as the source of what they hold */
export const US_STOCKS_ID = "cboe";
export const US_STOCKS_NAME = "US stocks";
/** Cboe's own name, for what Cboe itself answers or refuses */
const CBOE_NAME = "Cboe";
/** the words a price from Cboe's delayed file carries (Market.quoteFrom, and the line's name) */
export const CBOE_FROM = "Cboe · 15 min delayed";
/** the source's line in words: real time, with the delayed fallback */
export const US_STOCKS_LINE = "US stocks · real time, else Cboe 15 min delayed";
export const US_STOCKS_READ_ONLY = "Real-time quotes from Robinhood or Nasdaq, else Cboe's own delayed ones, 15 minutes behind the market — each line says which: a US stock trades at a connected broker (Alpaca, Robinhood), or in a paper account";
/** a share priced by a source that gives no day's change (Robinhood) carries its change from Cboe's previous close, read from Cboe's file
 * beside it while that file is from the regular session the quote is in (see the top of this file). False: such a line carries no change */
export const DAY_CHANGE_FROM_CBOE = true;
/** a plain ticker: one to five letters, a class letter after a dot (BRK.B) — the same as us-quotes.ts US_TICKER, written out here: this file
 * and that one import each other (through public-markets.ts), so neither reads the other's values while it is being loaded */
const TICKER = /^[A-Z]{1,5}(\.[A-Z])?$/;
/** a company in Cboe's book whose name says it is likely a fund (an ETF or the like), not a company that is a REIT trust (…Trust Inc) */
const FUND = /\b(ETF|ETN|Fund|Trust)\b/i;
const COMPANY = /\b(Inc|Corp|Corporation)\b/i;
/** Cboe writes a new quote file about once a minute: a quote is kept that long */
const PRICE_MS = 60_000;
/** how long a search for a plain ticker waits for the symbol book before answering from the quote alone */
const BOOK_WAIT_MS = 1_500;
/** how long a listing waits for Cboe's quotes, from when it asked them (with the real-time chain), once the chain has priced something: a
 * Cboe that is slow or hangs does not hold back the lines the chain priced past the callers' four seconds. Where the chain priced nothing,
 * Cboe is waited for in full: its answer, or its refusal, is then the listing's */
const CBOE_WAIT_MS = 2_500;
/** with no real-time price at all, Cboe is waited for this long from the start at most — inside the four seconds a source is allowed
 * (explore.ts, paper.ts SOURCE_MS); the quotes it has not answered by then keep loading for the next ask */
const CBOE_ALL_WAIT_MS = 3_500;
/** a real-time quote said to be the phase's own live quote: in the phase that is on, and no older than FRESH_MS and the minute to which
 * Nasdaq stamps a trade */
const SAID_LIVE_MS = FRESH_MS + 60_000;
const HISTORY_MS = 60_000;
const TIMEOUT_MS = 8_000;
/** the store behind Cboe's CDN answering for a symbol it has no file for */
const NOT_LISTED = /<Code>\s*AccessDenied\s*<\/Code>/;

interface Quote {
  symbol: string;
  price?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  change?: number | undefined;
  changePct?: number | undefined;
  /** the close before the session of the file (prev_day_close), where Cboe gives one (a dead file says 0.0) */
  prevClose?: number | undefined;
  /** the last trade, as Cboe stamps it (New York time), in ms */
  lastTradeMs?: number | undefined;
}
interface BookEntry {
  symbol: string;
  company: string;
}

/** "2026-10-13T09:45:44" (New York, as Cboe writes it) in ms; nothing for anything else */
export function cboeTimeMs(v: unknown): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v ?? ""));
  if (!m) return undefined;
  return fromEt(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])) + Number(m[6] ?? 0) * 1000;
}

/** THE OLD RULE, from when every US stock was priced by Cboe alone: whether a quote fifteen minutes behind the market is from inside the
 * regular session now, true from 09:45 to 16:15 New York on a market day (13:15 on an early close). A line now says its own source, stamp
 * and delay (quoteAt, delayMs) and the source carries the market's clock (`sessions`: account/calendar.ts usClock), by which a fill is
 * judged instead; this stays only until paper.ts no longer asks it */
export const cboeQuoteInSession = (nowMs: number): boolean => nextRegularSession(nowMs - CBOE_DELAY_MS).open;

/** the US stock market's REGULAR session now, from the account's own calendar: open or closed and when, with no phase (the old shape — a
 * line now carries account/calendar.ts usSessionFull, which says the phase too) */
export const usSession = (nowMs: number): MarketSession => regularSession(nowMs);

/** the words a line carries while the market is out of its session and the price is Cboe's (the close) */
export function usClosedWords(session: MarketSession): string {
  const opens = session.opensAt ? Date.parse(session.opensAt) : NaN;
  return `the US stock market is closed${Number.isFinite(opens) ? `: it opens ${etDate(opens)}, 09:30 New York` : ""}; Cboe's quote is from the close`;
}

const PHASE_WORDS: Partial<Record<string, string>> = { pre: "pre-market trading", after: "after-hours trading", overnight: "the overnight session" };
/** a phase's name, for the phase a quote's own time is in */
const PHASE_NAMES: Partial<Record<string, string>> = { pre: "pre-market", regular: "regular session", after: "after-hours", overnight: "overnight session", closed: "market closed" };
/** a New York time of day, "09:30" */
function etClock(ms: number): string {
  const t = et(ms);
  return `${String(Math.floor(t.minutes / 60)).padStart(2, "0")}:${String(t.minutes % 60).padStart(2, "0")}`;
}

/** The words a line carries outside the regular session (none inside it): which phase is on and until when, and whose price it is — a
 * real-time source's quote from that phase; or, where the real-time price is not from the phase that is on or is older than SAID_LIVE_MS
 * (Nasdaq's last trade is taken however old: a share that has not traded since the close), that source's last trade or quote and when, in
 * which phase; or Cboe's close where no real-time source answered. Closed — or overnight for a share not traded then — usClosedWords.
 * `quoteAt` is the price's own time, `now` the listing's */
export function usSessionWords(session: MarketSession, quoteFrom: string, quoteAt?: number, now?: number): string | undefined {
  if (session.open) return undefined;
  const phase = PHASE_WORDS[session.phase ?? ""];
  const ends = session.phaseEndsAt ? Date.parse(session.phaseEndsAt) : NaN;
  const opens = session.opensAt ? Date.parse(session.opensAt) : NaN;
  // overnight, a share is traded only where Robinhood's 24-hour market priced it (extendedHours): for any other, the market is closed
  if (!phase || !Number.isFinite(ends) || (session.phase === "overnight" && !session.extendedHours)) return usClosedWords(session);
  const until = `${phase} is on until ${etClock(ends)} New York`;
  const opening = Number.isFinite(opens) ? `; the regular session opens ${etDate(opens)}, 09:30 New York` : "";
  const who = quoteFrom === ROBINHOOD_FROM ? "Robinhood" : quoteFrom === NASDAQ_FROM ? "Nasdaq" : undefined;
  if (!who) return `${until}, but no real-time quote answered: Cboe's quote is from the close${opening}`;
  if (quoteAt === undefined || (usPhaseAt(quoteAt) === session.phase && (now ?? quoteAt) - quoteAt <= SAID_LIVE_MS)) return `${until}: the price is ${who}'s real-time quote${opening}`;
  const day = now !== undefined && etDate(now) === etDate(quoteAt) ? "" : ` on ${etDate(quoteAt)}`;
  return `${until}: the price is ${who}'s ${who === "Nasdaq" ? "last trade" : "quote"} at ${etClock(quoteAt)} New York${day} (${PHASE_NAMES[usPhaseAt(quoteAt)] ?? usPhaseAt(quoteAt)})${opening}`;
}

/** A Robinhood line's day change (see the top of this file): its price less Cboe's previous close, where Cboe's file is from the regular
 * session the quote is in — Cboe's last trade at or after that session's open — so the close it is measured from is the one before that
 * session, the same Nasdaq measures from. Nothing otherwise: in pre-market, after-hours and overnight, from the open until Cboe's file has
 * the day's first trade, or where Cboe gives no previous close */
function robinhoodDay(rt: UsQuote, cb: Quote | undefined): { change: number; changePct: number } | undefined {
  if (!DAY_CHANGE_FROM_CBOE || !cb || rt.price === undefined || cb.prevClose === undefined || cb.lastTradeMs === undefined) return undefined;
  if (usPhaseAt(rt.at) !== "regular") return undefined;
  const s = nextRegularSession(rt.at);
  if (!s.open || cb.lastTradeMs < s.opensAt || cb.lastTradeMs > s.closesAt) return undefined;
  const change = rt.price - cb.prevClose;
  return { change: round(change, 6), changePct: round((change / cb.prevClose) * 100, 4) };
}

/** A US LINE SAID AGAIN AT A NEWER REAL-TIME QUOTE — the background reader's (live/us-quotes.ts UsQuoteFeed), which a paper account prices a
 * share it knows from (live/paper.ts): the listing's own figures, what the market is, under that quote's price, bid, ask, stamp, delay and
 * source (never one source's price beside another's bid: a side the quote does not give is none); the session at `now` as the line says it
 * with that quote (an extended-hours order offered where a real-time source priced it — overnight only Robinhood) and its words; the day's
 * change the quote's own (Nasdaq's), else at this price from the close the listing's change was measured from (its price less its change),
 * while the listing's price and this quote are of one regular session — none otherwise, as robinhoodDay says none */
export function usLineAt(m: Listing, rt: UsQuote, now: number): Listing {
  const session = usSessionFull(now, ROBINHOOD_OVERNIGHT && rt.from === ROBINHOOD_FROM);
  const note = usSessionWords(session, rt.from, rt.at, now);
  const { price: p0, bid: _b, ask: _a, quoteAt: q0, delayMs: _d, quoteFrom: _f, session: _s, note: _n, change24h: c0, changePct24h: _c, ...rest } = m;
  let change = rt.change;
  let changePct = rt.changePct;
  if (change === undefined && changePct === undefined && rt.price !== undefined && p0 !== undefined && c0 !== undefined) {
    const was = q0 ? Date.parse(q0) : NaN;
    const ref = p0 - c0;
    if (ref > 0 && Number.isFinite(was) && usPhaseAt(rt.at) === "regular" && usPhaseAt(was) === "regular" && etDate(rt.at) === etDate(was)) {
      change = round(rt.price - ref, 6);
      changePct = round(((rt.price - ref) / ref) * 100, 4);
    }
  }
  return {
    ...rest,
    ...(rt.price !== undefined ? { price: rt.price } : {}),
    ...(rt.bid !== undefined ? { bid: rt.bid } : {}),
    ...(rt.ask !== undefined ? { ask: rt.ask } : {}),
    quoteAt: new Date(rt.at).toISOString(),
    delayMs: rt.delayMs,
    quoteFrom: rt.from,
    session,
    ...(note ? { note } : {}),
    ...(change !== undefined ? { change24h: change } : {}),
    ...(changePct !== undefined ? { changePct24h: changePct } : {}),
  };
}

/** the minutes of both sources, merged by time (see the top of this file): every one of Cboe's minute bars, and Nasdaq's samples for the
 * minutes outside Cboe's — after Cboe's last minute, and before its first where that is not the regular session (Cboe's first bar of a
 * session is stamped 09:31) */
function mergeMinutes(cboe: Candle[], nasdaq: Candle[]): Candle[] {
  if (!cboe.length) return nasdaq;
  let first = Infinity;
  let last = -Infinity;
  for (const b of cboe) {
    first = Math.min(first, b.t);
    last = Math.max(last, b.t);
  }
  return [...cboe, ...nasdaq.filter((b) => b.t > last || (b.t < first && usPhaseAt(b.t) !== "regular"))];
}

/** at most `ms` waiting for `p` (it goes on after) */
function within(p: Promise<unknown>, ms: number): Promise<void> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.then(() => undefined, () => undefined), new Promise<void>((go) => (t = setTimeout(go, Math.max(0, ms))))]).finally(() => clearTimeout(t));
}

/** US stocks and ETFs in real time where a keyless source gives it, else at Cboe's delayed quotes (see the top of this file) */
export function usStocksPublic(deps: PublicDeps = {}): PublicSource {
  const id = US_STOCKS_ID;
  const name = US_STOCKS_NAME;
  const clock = deps.clock ?? Date.now;
  const http = fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS);
  // one Nasdaq for the quotes and the chart: one memory of each symbol's class, one hold on the whole source after a refusal
  const nasdaq = nasdaqSource(deps);
  const live = usQuote(deps, nasdaq);
  const quotes = keeper<Quote | null>(clock, PRICE_MS);
  const book = keeper<BookEntry[]>(clock, LIST_MS);
  const minutes = keeper<Candle[]>(clock, HISTORY_MS);
  const days = keeper<Candle[]>(clock, LIST_MS);
  const months = keeper<Candle[]>(clock, HISTORY_MS);
  // the long history (live/history-stocks.ts), its pages through the same guard with a longer deadline for Nasdaq's whole history
  const history = stockHistory(
    {
      http: fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS),
      pace: deps.pace ?? hostLane,
      clock,
      nasdaq,
      cboeDaily: (sym) => cboeDays(sym),
      month: (sym) => cboeMonth(sym),
      minutes: async (sym) => {
        // both at once; either refusing leaves the other's minutes, and both refusing is Cboe's refusal
        const [nq, cb] = await Promise.all([nasdaq.chart(sym), cboeMinutes(sym)]);
        const sampled = nq && !isRefusal(nq) ? nq : undefined;
        if (isRefusal(cb) && !sampled) return cb;
        return mergeMinutes(isRefusal(cb) ? [] : cb, sampled ?? []);
      },
    },
    id,
  );
  const ask = async (url: string): Promise<HttpReply | Refusal> => {
    try {
      return await http(url);
    } catch (err) {
      return unreachable(id, CBOE_NAME, err);
    }
  };
  /** one symbol's quote: Cboe's figures, nothing worked out from them; the day's change only beside a previous close; null where Cboe has
   * no file for the symbol */
  const quote = (symbol: string): Promise<Quote | null | Refusal> =>
    quotes(symbol, async () => {
      const r = await ask(`${CBOE}/quotes/${encodeURIComponent(symbol)}.json`);
      if (isRefusal(r)) return r;
      if (r.status === 403 && NOT_LISTED.test(r.text)) return null;
      if (r.status !== 200 || r.body === undefined) return publicNo(id, CBOE_NAME, r);
      const d = rec(rec(r.body).data);
      if (str(d.security_type)?.toLowerCase() !== "stock") return null;
      const prevClose = pos(d.prev_day_close);
      return { symbol, price: pos(d.current_price), bid: pos(d.bid), ask: pos(d.ask), ...(prevClose !== undefined ? { change: fin(d.price_change), changePct: fin(d.price_change_percent), prevClose } : {}), lastTradeMs: cboeTimeMs(d.last_trade_time) };
    });
  /** the last market day's regular-session minutes from Cboe (see the top of this file) */
  const cboeMinutes = (sym: string): Promise<Candle[] | Refusal> =>
    minutes(sym, async () => {
      const r = await ask(`${CBOE}/charts/intraday/${encodeURIComponent(sym)}.json`);
      if (isRefusal(r)) return r;
      if (r.status === 403 && NOT_LISTED.test(r.text)) return no("E_VENUE_REJECTED", { venue: id, message: `${CBOE_NAME} keeps no history of ${sym}` });
      if (r.status !== 200 || r.body === undefined) return publicNo(id, CBOE_NAME, r);
      const out: Candle[] = [];
      for (const x of list(rec(r.body).data).map(rec)) {
        const t = cboeTimeMs(x.datetime);
        const p = rec(x.price);
        const [o, h, l, c, v] = [pos(p.open), pos(p.high), pos(p.low), pos(p.close), nonNeg(rec(x.volume).stock_volume)];
        if (t === undefined || o === undefined || h === undefined || l === undefined || c === undefined) continue;
        out.push({ t, o, h, l, c, ...(v !== undefined ? { v } : {}) });
      }
      return out;
    });
  /** Cboe's last month of ten-minute regular-session bars (…/charts/one_month/{symbol}.json, the intraday file's shape, 874 bars from
   * 2026-09-16 09:40 to 10-16 15:50 read live 2026-10-17), kept a minute. Each bar is stamped at its START, ten minutes before its label: a
   * day's first label is 09:40 and its last 15:50, as the intraday file's first minute is labelled 09:31 and carries the opening cross — a
   * label is where the bar ends (inferred from both files; Cboe does not say) */
  const cboeMonth = (sym: string): Promise<Candle[] | Refusal> =>
    months(sym, async () => {
      const r = await ask(`${CBOE}/charts/one_month/${encodeURIComponent(sym)}.json`);
      if (isRefusal(r)) return r;
      if (r.status === 403 && NOT_LISTED.test(r.text)) return no("E_VENUE_REJECTED", { venue: id, message: `${CBOE_NAME} keeps no history of ${sym}` });
      if (r.status !== 200 || r.body === undefined) return publicNo(id, CBOE_NAME, r);
      const out: Candle[] = [];
      for (const x of list(rec(r.body).data).map(rec)) {
        const end = cboeTimeMs(x.datetime);
        const p = rec(x.price);
        const [o, h, l, c, v] = [pos(p.open), pos(p.high), pos(p.low), pos(p.close), nonNeg(rec(x.volume).stock_volume)];
        if (end === undefined || o === undefined || h === undefined || l === undefined || c === undefined) continue;
        out.push({ t: end - 10 * 60_000, o, h, l, c, ...(v !== undefined ? { v } : {}) });
      }
      return out.sort((a, b) => a.t - b.t);
    });
  /** every day Cboe keeps since 2004, oldest first, each at its session's open: its rows on days the market was closed (a holiday's row
   * copies the day before) and a date it repeats left out (see the top of this file) */
  const cboeDays = (sym: string): Promise<Candle[] | Refusal> =>
    days(sym, async () => {
      const r = await ask(`${CBOE}/charts/historical/${encodeURIComponent(sym)}.json`);
      if (isRefusal(r)) return r;
      if (r.status === 403 && NOT_LISTED.test(r.text)) return no("E_VENUE_REJECTED", { venue: id, message: `${CBOE_NAME} keeps no history of ${sym}` });
      if (r.status !== 200 || r.body === undefined) return publicNo(id, CBOE_NAME, r);
      const out = new Map<number, Candle>();
      for (const x of list(rec(r.body).data).map(rec)) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x.date ?? ""));
        const [o, h, l, c, v] = [pos(x.open), pos(x.high), pos(x.low), pos(x.close), nonNeg(x.volume)];
        if (!m || o === undefined || h === undefined || l === undefined || c === undefined) continue;
        // a day's bar at its session's open, New York
        const t = fromEt(Number(m[1]), Number(m[2]), Number(m[3]), 9, 30);
        if (!isMarketDay(t) || out.has(t)) continue;
        out.set(t, { t, o, h, l, c, ...(v !== undefined ? { v } : {}) });
      }
      return [...out.values()].sort((a, b) => a.t - b.t);
    });
  // the symbol book as last read, its tickers by their companies — kept beside the keeper, so a share's line and the background reader know
  // the tickers the market lists at once while the book is read again
  let bookNames: Map<string, string> | undefined;
  /** every plain ticker Cboe quotes, with its company, kept ten minutes */
  const symbols = (): Promise<BookEntry[] | Refusal> =>
    book("book", async () => {
      const r = await ask(`${CBOE}/symbol_book/symbol-book.json`);
      if (isRefusal(r)) return r;
      if (r.status !== 200 || r.body === undefined) return publicNo(id, CBOE_NAME, r);
      const out: BookEntry[] = [];
      for (const x of list(rec(r.body).data)) {
        const sym = str(rec(x).name)?.toUpperCase();
        if (!sym || !TICKER.test(sym)) continue;
        out.push({ symbol: sym, company: str(rec(x).company_name) ?? sym });
      }
      bookNames = new Map(out.map((e) => [e.symbol, e.company]));
      return out;
    });
  /** the tickers the market lists as the book last said them: a book read before answers at once (read again in the background once it is
   * ten minutes old); none read yet, the book waited for BOOK_WAIT_MS at most (it finishes loading for the next ask) */
  const namesNow = async (): Promise<Map<string, string> | undefined> => {
    if (bookNames) {
      void symbols().catch(() => undefined);
      return bookNames;
    }
    await within(symbols(), BOOK_WAIT_MS);
    return bookNames;
  };
  /** THE BACKGROUND READER (live/us-quotes.ts UsQuoteFeed) of the shares someone is looking at, on this line's own chain: Robinhood's quote
   * taken for a ticker the book lists — before the book has answered, for the well-known few this file names itself (as a listing takes it) */
  const feed = new UsQuoteFeed({
    source: id,
    quotes: live,
    listed: (s) => {
      if (!bookNames) void symbols().catch(() => undefined);
      return bookNames ? bookNames.has(s) : US_SHARES.includes(s);
    },
    clock,
  });
  // how much of the list a listing with nothing searched for shows, for the sentence under it
  let shown: { of: number; total: number } | undefined;
  /** one line: the real-time source's price, bid, ask, stamp and delay where one priced it, else Cboe's — never one source's price beside
   * another's bid; the day's change by the rule at the top of this file; the session in full, an extended-hours order offered only where a
   * real-time source priced the line (overnight, only Robinhood) */
  const listing = (symbol: string, rt: UsQuote | undefined, cb: Quote | undefined, company: string | undefined, now: number): Listing => {
    const full = usSessionFull(now, ROBINHOOD_OVERNIGHT && rt?.from === ROBINHOOD_FROM);
    // Cboe's quote is the regular session's: a paper account never fills an extended-hours order at it, so none is offered beside it
    const session = rt || !full.extendedHours ? full : { ...full, extendedHours: false };
    const px = rt ?? cb;
    const at = rt ? rt.at : cb?.lastTradeMs;
    const from = rt ? rt.from : CBOE_FROM;
    const day = rt ? (rt.from === ROBINHOOD_FROM ? robinhoodDay(rt, cb) : rt) : cb;
    const note = usSessionWords(session, from, at, now);
    return {
      symbol,
      name: company ?? symbol,
      kind: "stock",
      base: symbol,
      quote: "USD",
      ...(px?.price !== undefined ? { price: px.price } : {}),
      ...(px?.bid !== undefined ? { bid: px.bid } : {}),
      ...(px?.ask !== undefined ? { ask: px.ask } : {}),
      ...(at !== undefined ? { quoteAt: new Date(at).toISOString() } : {}),
      delayMs: rt ? rt.delayMs : CBOE_DELAY_MS,
      quoteFrom: from,
      // a broker takes a stock order at any hour and holds it for the open: the session, not `open`, says whether the market is in session
      open: true,
      types: [],
      session,
      ...(note ? { note } : {}),
      ...(day?.change !== undefined ? { change24h: day.change } : {}),
      ...(day?.changePct !== undefined ? { changePct24h: day.changePct } : {}),
      // the line is the US stocks line, whichever source priced it (quoteFrom says which): named after a source, its "Connect to trade"
      // would read as connecting that source
      venueName: US_STOCKS_NAME,
    };
  };
  return {
    id,
    name,
    kind: "stocks",
    connectTo: "alpaca",
    connector: "live:alpaca",
    // a US stock trades at Robinhood too: where Alpaca does not serve the network, the line is offered there (its prices are neither's)
    alsoVia: [{ connectTo: "robinhood", connector: "live:robinhood" }],
    readOnly: US_STOCKS_READ_ONLY,
    sessions: usClock,
    feed,
    /** ONE SHARE'S LINE, asked alone (live/paper.ts Pricer.find: a paper account pricing a share it knows): the real-time chain for it and
     * Cboe's quote for it AT THE SAME TIME — one GET of Cboe at most (P16: a search of a short ticker reads forty) — and a line the chain
     * priced never waits for Cboe: the previous close beside a Robinhood price is Cboe's answer where it has come, and the day's change is
     * left out where it has not. Cboe's delayed quote is the line only where the chain priced nothing. A ticker the loaded book does not list
     * is asked of Nasdaq alone (Cboe's store keeps files of tickers that no longer trade). Null: not a plain ticker, or no source prices it;
     * Cboe's refusal where nothing priced it and Cboe refused */
    async line(symbol) {
      live.warm();
      const sym = symbol.trim().toUpperCase();
      if (!TICKER.test(sym)) return null;
      const names = await namesNow();
      const company = names?.get(sym);
      const unlisted = !!names && !names.has(sym);
      if (FUND.test(company ?? "") && !COMPANY.test(company ?? "")) nasdaq.hint(sym, "etf");
      const cbP = unlisted ? undefined : quote(sym);
      const rt = (await live.many([sym], { listed: names ? (s) => names.has(s) : (s) => US_SHARES.includes(s) })).get(sym);
      const now = clock();
      if (rt) {
        // Cboe's quote where it has already answered, and nothing waited for where it has not
        const cb = cbP ? await Promise.race([cbP, Promise.resolve(undefined)]) : undefined;
        return listing(sym, rt, cb && !isRefusal(cb) ? cb : undefined, company, now);
      }
      const cb = cbP ? await cbP : null;
      if (isRefusal(cb)) return cb;
      return cb ? listing(sym, undefined, cb, company, clock()) : null;
    },
    reset: () => {
      live.clear();
      quotes.clear();
      book.clear();
      minutes.clear();
      days.clear();
      months.clear();
    },
    async listings(o) {
      // Robinhood's one answer for every share it quotes is on its way while the symbol book is read (it is kept, and asked once)
      live.warm();
      const Q = (o.q ?? "").trim().toUpperCase();
      const limit = Math.max(1, o.limit);
      let pool: BookEntry[];
      let all: BookEntry[] | undefined;
      // a ticker typed whole that the loaded book does not list: asked of Nasdaq alone (Cboe keeps files of tickers that no longer trade)
      let unlisted: string | undefined;
      if (Q) {
        // a search: the symbol book, by the ticker first (whole, then its start), then the company's name. A plain ticker typed whole is
        // asked for directly as well, and does not wait for the book past BOOK_WAIT_MS: the book is 2.3 MB and its first read takes
        // longer than the Markets read allows a source, so the first search of "AAPL" answers from the quote alone while the book
        // finishes loading for the next one (the keeper keeps it on its way)
        const ticker = TICKER.test(Q);
        const got = ticker ? await Promise.race([symbols(), new Promise<undefined>((go) => setTimeout(() => go(undefined), BOOK_WAIT_MS))]) : await symbols();
        if (isRefusal(got) && !ticker) return got;
        if (got && !isRefusal(got)) all = got;
        const score = (e: BookEntry): number => (e.symbol === Q ? 3 : e.symbol.startsWith(Q) ? 2 : has(Q, e.company) ? 1 : 0);
        pool = (all ?? [])
          .map((e) => ({ e, s: score(e) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || a.e.symbol.length - b.e.symbol.length || a.e.symbol.localeCompare(b.e.symbol))
          .slice(0, limit)
          .map((x) => x.e);
        // a ticker typed whole that the book does not carry (or that the book has not yet answered for) is still asked for: of Nasdaq alone
        // where the book has answered without it, of Nasdaq and Cboe where it has not answered yet
        if (ticker && !pool.some((e) => e.symbol === Q)) {
          pool = [{ symbol: Q, company: Q }, ...pool].slice(0, limit);
          if (all) unlisted = Q;
        }
      } else {
        pool = US_SHARES.slice(0, limit).map((s) => ({ symbol: s, company: s }));
        // the well-known few carry their company's name from the book too (kept ten minutes); the book refusing leaves them their tickers
        const got = await symbols();
        if (!isRefusal(got)) all = got;
      }
      const names = new Map((all ?? []).map((e) => [e.symbol, e.company]));
      // a likely fund is asked of Nasdaq as an ETF first
      for (const e of pool) {
        const company = names.get(e.symbol) ?? "";
        if (FUND.test(company) && !COMPANY.test(company)) nasdaq.hint(e.symbol, "etf");
      }
      // Cboe for every line (but a ticker the loaded book does not list), AT THE SAME TIME as the real-time chain: the fallback for what the
      // chain does not price in time, and the previous close beside a Robinhood price; eight at a time, as before
      const started = Date.now();
      const got = new Map<string, Quote>();
      let refused: Refusal | undefined;
      const cboeFor = pool.filter((e) => e.symbol !== unlisted);
      let cboeDone = false;
      const cboe = (async () => {
        for (let i = 0; i < cboeFor.length; i += 8)
          await Promise.all(
            cboeFor.slice(i, i + 8).map(async (e) => {
              const q = await quote(e.symbol);
              if (isRefusal(q)) refused ??= q;
              else if (q) got.set(e.symbol, q);
            }),
          );
        cboeDone = true;
      })();
      // real time within its one deadline: Robinhood's one answer for the tickers the book lists, then Nasdaq for the first lines it did not
      // price (us-quotes.ts). With no book to check against, Robinhood's quote is taken only for the well-known few, tickers this file
      // names itself (US_SHARES; each one Robinhood quotes matched the book by company on 2026-10-14) — never for a ticker typed before the
      // book has answered, since a token's symbol may not be the share's ticker (SATS)
      const listed = all ? (s: string) => names.has(s) : Q ? undefined : (s: string) => US_SHARES.includes(s);
      const rt = await live.many(
        pool.map((e) => e.symbol),
        { listed },
      );
      // A LINE THE CHAIN PRICED NEVER WAITS FOR CBOE: Cboe is waited for only where a line has no real-time price — in full where the chain
      // priced nothing, else to CBOE_WAIT_MS from the start at most. What Cboe has answered by then is the previous close beside a Robinhood
      // price; where it has not, that line carries no day's change this time
      if (cboeFor.some((e) => !rt.has(e.symbol))) {
        if (rt.size) await within(cboe, started + CBOE_WAIT_MS - Date.now());
        // nothing real-time: Cboe is waited for in full, but never past the time a source is allowed — what it has answered by then is the
        // list, and the rest keeps loading into the keeper for the next ask (a slow network: 2026-10-26, Cboe at 1.6 s a quote)
        else await within(cboe, started + CBOE_ALL_WAIT_MS - Date.now());
      }
      const cb = new Map(got);
      // nothing priced and Cboe refused (a place rule, an edge, a ban, no answer): that is the answer, not a list with no prices
      if (!rt.size && !cb.size && refused) return refused;
      // nothing priced yet and Cboe still on its way: said so — never an empty list, which would read as no US stocks at all (Cboe having
      // answered with nothing listable, an index say, is an empty list as before)
      if (!rt.size && !cb.size && !cboeDone && cboeFor.length) return no("E_VENUE_UNREACHABLE", { venue: id, message: `no US stock price answered in ${CBOE_ALL_WAIT_MS / 1000} s: Cboe's quotes are still on their way` });
      const now = clock();
      const out = pool.filter((e) => rt.has(e.symbol) || cb.has(e.symbol)).map((e) => listing(e.symbol, rt.get(e.symbol), cb.get(e.symbol), names.get(e.symbol) ?? (e.company !== e.symbol ? e.company : undefined), now));
      if (!Q) shown = { of: out.length, total: US_SHARES.length };
      return out;
    },
    notes: (o) =>
      o.q?.trim()
        ? [`${name}: real-time quotes from Robinhood or Nasdaq, else Cboe's delayed ones (15 minutes), for any US stock or ETF in Cboe's symbol book.`]
        : [`${name}: real-time quotes (Robinhood, else Nasdaq) for ${shown?.of ?? US_SHARES.length} well-known names, else Cboe's 15 min delayed ones · search any stock or ETF.`],
    /** price history, keyless (see the top of this file and live/history-stocks.ts): a plain ticker (AAPL, BRK.B), in bars of 1m to 1w,
     * for a chart's first view or one page before the first bar it has */
    async candles(symbol, interval, w) {
      const now = clock();
      const bad = badHistory(id, interval, w, now);
      if (bad) return bad;
      const sym = symbol.trim().toUpperCase();
      if (!TICKER.test(sym)) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a US stock here is its ticker (AAPL, BRK.B), not "${symbol.slice(0, 40)}"` });
      // a likely fund is asked of Nasdaq as an ETF first (its company's name in the book, where the book has been read)
      const company = bookNames?.get(sym) ?? "";
      if (FUND.test(company) && !COMPANY.test(company)) nasdaq.hint(sym, "etf");
      return history(sym, interval, w);
    },
  };
}
