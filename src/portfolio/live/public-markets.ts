/** MARKETS THE OWNER HAS NOT CONNECTED: what a venue's own public market data says, read without a key, so the Markets screen shows real
 * prices from venues that are not connected yet — each marked "Connect to trade" — beside the ones that are.
 *
 * Every source here only reads: no key, no sign-in, nothing signed, no order. What each one asks, and which of the venue's own fields it
 * keeps (docs.kraken.com, docs.cdp.coinbase.com, the exchange library's own parsers, docs.kalshi.com and docs.polymarket.com, read
 * 2026-10-05 and 2026-10-06, and their live public answers those days):
 *
 *   Kraken, Coinbase,   the unified exchange library's keyless client (prices.ts) and fetchTickers, for well-known coins priced in dollars
 *   OKX, Binance,       (USD, USDT, USDC) or the coins a query names. The 24-hour figures are read from each exchange's own answer (the
 *   Bybit               ticker's `info`), never from what the library works out from it:
 *                         Kraken    c (the last trade), and v and p for the last 24 hours: the volume times its average price is the
 *                                   dollars traded. Its o is TODAY's open ("Today's opening price"), not the price a day ago, so no 24-hour
 *                                   change is shown for Kraken
 *                         Coinbase  price, price_percentage_change_24h, and approximate_quote_24h_volume — Coinbase's own figure, its
 *                                   24-hour volume at the current price
 *                         OKX       last, bidPx, askPx, open24h (the price 24 hours ago: the change is last − open24h), volCcy24h (a spot
 *                                   pair's volume in its quote currency)
 *                         Binance   lastPrice, bidPrice, askPrice, priceChange, priceChangePercent, quoteVolume
 *                         Bybit     lastPrice, bid1Price, ask1Price, prevPrice24h (the change is last − prevPrice24h), turnover24h
 *                       All five are read wherever this machine is: none is left out for where the developer sits. One that does not
 *                       serve this location answers with its own rule, which is shown as that, in its own words, and holds the whole
 *                       source back (holdBackMs: ten minutes; every query, its 24 hours and its bars, not only the read that met it). From
 *                       the developer's machine on 2026-10-08: Binance's HTTP 451, "Service unavailable from a restricted location
 *                       according to 'b. Eligibility' in https://www.binance.com/en/terms…", and Bybit's 403 from its CloudFront edge,
 *                       "{ error:The Amazon CloudFront distribution is configured to block access from your country }" (96 bytes), which the
 *                       library labels RateLimitExceeded: the words decide, not the label (exchange.ts, and exchangeNo here, which reads
 *                       the whole message). Either answers in one round trip, well inside the Markets read's four seconds. Nothing here
 *                       looks for another way in. Only their spot markets are loaded (keylessSpot): Binance's, Bybit's and OKX's
 *                       derivatives hosts are not asked, so a rule for derivatives alone is not taken for the spot tickers' answer.
 *   Kalshi              a few of its busiest SERIES, not its whole list (the owner asked for a few hot markets, not every bet): for each
 *                       series in KALSHI_SERIES (categories.ts) one GET /trade-api/v2/events?series_ticker=&status=open&
 *                       with_nested_markets=true&limit=6 — the series' nearest open events, each with its markets, 15 KB to 600 KB a
 *                       series (the bitcoin ladder is the big one) — and from each series the busiest market of the event with the most
 *                       24-hour contracts. GET /markets?status=open&limit=1000 lists the NEWEST thousand markets, which is why the Fed
 *                       decision (151,859 contracts a day on 2026-10-06) never appeared in it: it is not read any more. A market is listed
 *                       as its YES and its NO leg. volume_24h_fp counts CONTRACTS (each pays $1 at settlement), not dollars: it is carried
 *                       as `contracts24h` and never as dollars. The change is last_price_dollars − previous_price_dollars (the last trade a
 *                       day ago), in dollars per contract, the NO leg's the other way. A search reaches every market of every event read.
 *                       The two IPO series (Anthropic, OpenAI) are read the same way; their legs carry Kalshi's own series tags ("IPOs",
 *                       "Companies") beside the event's category, and read "IPOs" (categories.ts)
 *   Polymarket          GET gamma /events, its twenty busiest open events by volume24hr with Gamma asked to leave sports out
 *                       (exclude_tag_id=1, the Sports tag every sports and esports event carries), 2.9 MB; then every event filed under an
 *                       excluded word (categories.ts: weather, entertainment, celebrities, awards, "will X say or post" …) and every hourly
 *                       or shorter "Up or Down" market is left out, and the ten busiest that remain are shown, each as its busiest
 *                       market — outcomes and outcomePrices, bestBid and bestAsk and oneDayPriceChange (all three the first outcome's),
 *                       volume24hr (dollars), endDate — with the event's tags for its category, in the order of the EVENT's volume24hr
 *                       (how hot the question is, which is what Polymarket orders by; the Fed decision is one hot event spread over five
 *                       markets), carried as `eventVolumeUsd24h` only to order. A second GET of the same shape with tag_slug=ipo reads
 *                       its five busiest IPO questions (290 KB; "Anthropic IPO by __?" $40,704 a day on 2026-10-06), of which the three
 *                       busiest are shown beside the ten, each reading "IPO". A search reaches every market of every event read. What
 *                       closes within a day is read off the same list: no second request
 *   Polymarket US       Polymarket US's own exchange (QCX LLC, a CFTC-designated contract market), not polymarket.com's: its public gateway,
 *                       gateway.polymarket.us ("No API key needed"; polymarket-us.ts, its shapes checked live and keyless 2026-10-08). For
 *                       each of six of its categories — politics, finance, crypto, macro, geopolitics, technology (its sports and culture
 *                       are excluded words) — GET /v1/markets?active=true&closed=false&categories=<c>&orderBy=volume&orderDirection=desc&
 *                       limit=6, 13–32 KB each, the categories in turn, each market as its YES and NO leg (`<market slug>:YES`). Its lists
 *                       carry no volume figure at all (`orderBy=volume` orders by one it does not return; volume24hr and volumeNum order
 *                       nothing), so no volume and no 24-hour change are said. The prices are its bestBidQuote and bestAskQuote, the YES
 *                       contract's (NO's are 1 − them, the other way round); its outcomes and outcomePrices strings do not follow one
 *                       order (["No","Yes"] beside ["0.6030","0.398"]) and are not read. A search is its own GET /v1/search?query=, events
 *                       with their markets, which reaches every market it lists. Its rows trade through live:polymarket-us
 *   Pre-IPO perpetuals  contracts on a venue's estimate of a PRIVATE company's valuation (live/preipo.ts: what they are, the unit each
 *                       venue prices them in, the flag each venue's own record carries), at eight exchanges our exchange connector reaches,
 *                       one source each, and at Hyperliquid's HIP-3 deployers (below): the venue's instrument list, kept ten minutes
 *                       (LIST_MS, like the Stock Token list; a venue's list changes rarely), then one or two small price requests a
 *                       contract, kept KEEP_MS. The first six read 2026-10-06, keyless, from this machine (bodies, and on the wire — Node's
 *                       fetch asks for gzip and undoes it):
 *                         OKX             /api/v5/public/instruments?instType=SWAP (537 KB, 38 KB) → ruleType pre_market; a contract's
 *                                         /api/v5/market/ticker?instId= (last, bidPx, askPx, open24h; 332 B) and /api/v5/public/funding-rate
 *                                         ?instId= (fundingRate, fundingTime; 505 B). Its volCcy24h for a swap counts the base currency,
 *                                         not dollars, so no dollar volume is said
 *                         Gate            its full list is 1.3 MB and its server does not compress, so each company's contract is asked by
 *                                         name — /api/v4/futures/usdt/contracts/<NAME>_USDT (1.3 KB; is_pre_market AND contract_type
 *                                         "stocks", leverage_max, quanto_multiplier, funding_rate, funding_next_apply; a name it does not
 *                                         list answers HTTP 400 CONTRACT_NOT_FOUND) — and its /api/v4/futures/usdt/tickers?contract= (last,
 *                                         highest_bid, lowest_ask, change_percentage, volume_24h_quote; 472 B)
 *                         Kraken Futures  /derivatives/api/v3/instruments (848 KB, 21 KB) → category "Pre-IPO"; a contract's
 *                                         /derivatives/api/v3/tickers/<symbol> (last, markPrice, bid, ask, change24h in percent,
 *                                         volumeQuote in dollars, relativeFundingRate — the rate as Kraken gives it, no next time; 678 B)
 *                         Deribit         /api/v2/public/get_instruments?currency=any&kind=future (188 KB, 12 KB) → underlying_type
 *                                         preipo, perpetual, linear; /api/v2/public/ticker?instrument_name= (last_price, mark_price,
 *                                         best_bid_price, best_ask_price, stats.price_change in percent, stats.volume_usd, funding_8h —
 *                                         Deribit's funding accrues continuously, so no next time; 697 B). deribit.com redirects: www
 *                         KuCoin Futures  /api/v1/contracts/active (1.4 MB, 140 KB) → marketStage PRE_MARKET AND assetClass STOCK; a
 *                                         contract's /api/v1/contracts/<symbol> (lastTradePrice, markPrice, priceChgPct, turnoverOf24h in
 *                                         USDT, fundingFeeRate, nextFundingRateDateTime; 2.1 KB; no book, so no bid or ask)
 *                         MEXC            /api/v1/contract/detail (2.3 MB, 170 KB) → conceptPlate mc-trade-zone-preipo; a contract's
 *                                         /api/v1/contract/ticker?symbol= (lastPrice, bid1, ask1, riseFallRate, amount24 in USDT,
 *                                         fundingRate; 544 B)
 *                       and two this machine cannot read (Binance 451, Bybit 403), built from their own docs and the library's parsers,
 *                       read 2026-10-08; neither documents a pre-IPO flag, so a perpetual named for a company, matched whole, is one:
 *                         Binance         USDⓈ-M futures (developers.binance.com): fapi.binance.com/fapi/v1/exchangeInfo → a perpetual
 *                                         (contractType PERPETUAL or TRADIFI_PERPETUAL, or the 2100-12-25 delivery date Binance gives every
 *                                         perpetual) settled in its quote; a contract's /fapi/v1/ticker/24hr?symbol= (lastPrice, priceChange,
 *                                         priceChangePercent, quoteVolume in USDT; no book, so no bid or ask) and /fapi/v1/premiumIndex
 *                                         ?symbol= (markPrice, lastFundingRate, nextFundingTime)
 *                         Bybit           v5 (bybit-exchange.github.io/docs/v5): api.bybit.com/v5/market/instruments-info?category=linear
 *                                         &limit=1000, page by page while it gives a nextPageCursor (three at most) → contractType
 *                                         LinearPerpetual settled in its quote, leverageFilter.maxLeverage; a contract's /v5/market/tickers
 *                                         ?category=linear&symbol= (lastPrice, bid1Price, ask1Price, prevPrice24h, turnover24h in USDT,
 *                                         fundingRate, nextFundingTime). A retCode other than 0 is a no in its retMsg, even under HTTP 200
 *                       Each contract is a perpetual (`kind: "perp"`) under the category "Pre-IPO", with its company (`group`:
 *                       preipo:<slug>, the company's name — so one company is one row across venues), the valuation its price implies
 *                       (`implied`: price × the venue's unit, and that unit in words), and for Anthropic and OpenAI the issuer's own words
 *                       on transfers of its stock. Named as the unified library names it (ANTHROPIC/USDT:USDT, ANTH/USDC:USDC), so a key
 *                       connected at the venue trades the same row. A venue's refusal of this location is its own rule, shown as that.
 *                       No price history yet from these sources (a connected key's comes through the library)
 *   Hyperliquid         POST api.hyperliquid.xyz/info {"type":"metaAndAssetCtxs"} — through its own guard (hyperliquidInfo), like every POST
 *                       here: every perpetual of its first dex with its day (midPx or markPx, prevDayPx for the change, dayNtlVlm in
 *                       dollars, funding, maxLeverage), 72 KB, each as `<COIN>-PERP`. They are placed through Hyperliquid's connection to
 *                       trade, live:hyperliquid-trade (an API wallet that places orders and cannot withdraw), so the Perps tab is real
 *                       prices marked "Connect to trade"
 *   Hyperliquid HIP-3   the pre-IPO perpetuals its deployers list (hyperliquidPreIpoPublic; hyperliquid.gitbook.io …/info-endpoint/perpetuals,
 *                       read 2026-10-08): POST {"type":"perpDexs"} (21.5 KB; ten dexes that day) and {"type":"perpCategories"} (5 KB:
 *                       Hyperliquid's category for each market, "preipo" among them), then {"type":"metaAndAssetCtxs","dex":<name>} for
 *                       every dex (5 to 59 KB each, 131 KB in all: Hyperliquid does not compress), all kept ten minutes; between those,
 *                       every ninety seconds, only the dexes that hold one (io and xyz, 64 KB). A market is listed when its name is a
 *                       company's (live/preipo.ts) and Hyperliquid files it under no other category, it is not delisted, and someone holds
 *                       or trades it (openInterest or dayNtlVlm above 0): anyone may deploy one. Each is `<dex>:<COIN>-PERP` (io:ANTH-PERP),
 *                       its line named for Hyperliquid and the deployer's dex ("Hyperliquid · io", `venueName`), with the deployer's mid
 *                       (its mark when there is none), the change from prevDayPx, dayNtlVlm in the dex's collateral (USDC for io and xyz),
 *                       the hourly funding and maxLeverage; traded through the same connection. Live that day: io:ANTH ($11.8M a day),
 *                       io:OAI ($5.9M), xyz:OURA ($17.7K); vntl:ANTHROPIC, vntl:OPENAI, para:ANTH and xyz:YMTC delisted
 *   Stock Tokens        GET api.robinhood.com/rhj/assets and /rhj/prices/{symbol}, the reads robinhood.ts makes: each token, and its own bid
 *                       and ask in dollars per token (tokenBid, tokenAsk). The listing itself is only read: the tokens trade from a
 *                       connected wallet on Robinhood Chain, against USDG through LI.FI (dex.ts), where the wallet's own rows offer them
 *   US stocks           Cboe's own delayed quotes (public-stocks.ts): GET cdn-api.cboe.com/api/global/delayed_quotes/quotes/{symbol}.json,
 *                       fifteen minutes behind the market, its symbol book for a search, its intraday minutes and daily closes for a
 *                       history. Read-only: a US stock trades at a connected broker (Alpaca, Robinhood) or in a paper account
 *   xStocks, Ondo       tokenised shares priced where they trade without a key (public-rwa.ts): an xStock at Gate's spot ticker
 *                       (api.gateio.ws /api/v4/spot/tickers), with xStocks' own trading state (api.xstocks.fi); an Ondo Stock as LI.FI
 *                       prices it (li.quest /v1/token). Each carries its issuer's own words, as the wallet's rows do (dex.ts)
 *   SETTLEMENT          an event contract's venue, asked keyless whether a market has settled and what a contract paid (`settlement`): Kalshi's
 *                       GET /markets/{ticker} (result yes | no), Gamma's GET /markets/slug/{slug} (closed, umaResolutionStatus "resolved",
 *                       outcomePrices 1 | 0), Polymarket US's GET /v1/markets/{slug}/settlement (1 | 0, HTTP 404 until it settles). A paper
 *                       account pays its contracts out by it (paper.ts). A SEARCH at Polymarket reaches its whole list through Gamma's
 *                       GET /public-search?q= (events_status=active), beside the twenty busiest events kept
 *
 * PRICE HISTORY (`candles`), keyless too, in bars of 1m, 5m, 15m, 1h, 4h, 1d and 1w, for a window (live/trade.ts CandleWindow: a chart's
 * first view, at most HISTORY_MOST bars, or one page before the first bar it has), live-checked 2026-10-06 and 2026-10-17 without a key:
 *   the exchanges       ONE VENUE FOR A WHOLE SERIES, with deep history (live/history-crypto.ts): Coinbase's pairs from Coinbase Exchange's
 *                       own candles (BTC-USD back to 2015-07-20; a pair Coinbase trades on another product's book — its product's `alias`,
 *                       ETH-USDC's ETH-USD — from that book, said so), OKX's from its history-candles (1Dutc, never the UTC+8 1D); a pair Kraken
 *                       lists from the venue with deep history that trades it too — a dollar pair from Coinbase Exchange where its
 *                       GET /products/{id} says "online" (a delisted product answers its candles 200 []), a USDT or USDC pair from OKX, each
 *                       named on the page and in the chart's name for the bars — since Kraken's own OHLC keeps only its latest 720 bars
 *                       and pages no further back (where that venue does not trade it, answers no recent bar of it, refuses or is held
 *                       back, a first view is those 720, said why; a paper account judging the time it slept asks Kraken's own alone);
 *                       any other exchange through the library's fetchOHLCV, page by page, for a pair it lists. A size a venue does not
 *                       publish is folded from its finer bars, and a week from days wherever the venue's own weeks are not Monday's.
 *                       Coinbase's and Kraken's histories are read apart from their listings (`historyApart`): a refusal of Coinbase
 *                       Exchange or of OKX for a Kraken pair holds back that host's histories alone (hostHolds), never a listing, a book,
 *                       the trades or a stream
 *   Kalshi              GET /trade-api/v2/markets/candlesticks?market_tickers=&start_ts=&end_ts=&period_interval= (1, 60 or 1440 minutes;
 *                       5m and 15m bars are one-minute candles folded, 4h hourly ones, 1w daily ones from Monday); the trades' prices, a
 *                       candle with no trade left out, NO as 1 − YES. It answers at most 10,000 candles a request, counted over the span
 *                       asked, and no start of 0: a window one request does not hold is asked from the market's open (GET /markets/
 *                       {ticker}) in spans of 9,999 periods, six at most (live/kalshi.ts kalshiSpans)
 *   Polymarket          GET gamma /markets/slug/{slug} for the outcome's token id (clobTokenIds, in the order of `outcomes`), then the
 *                       CLOB's GET clob.polymarket.com/prices-history?market=&startTs=&fidelity= — Polymarket's price at moments, folded
 *                       into bars, no volume; never a startTs of 0, which it refuses (MAX asks from the first second)
 *   Polymarket US       GET gateway.polymarket.us/v1/price-history?symbol=<market slug>&fixedInterval=&fidelity= (its fixed profiles: five-
 *                       minute points for a day, three-hour points for a week or a month): its "book-derived Yes and No display prices",
 *                       longPrice from the best ask and shortPrice from one minus the best bid — not trades — folded into bars, no volume
 *   Hyperliquid         POST /info {"type":"candleSnapshot","req":{coin,interval,startTime,endTime}} (live/history-crypto.ts): everything in
 *                       the window from its latest 5,000 bars at that size, the bars with no trade (its daily backfill before 2023-02-26)
 *                       left out, a range its 5,000 do not reach drawn in a coarser size, and where its history ends said; a HIP-3
 *                       market by its dex-prefixed coin ("io:ANTH" answers its bars; the bare "ANTH" HTTP 500, live 2026-10-08)
 *   Stock Tokens        none: Robinhood publishes no history for them
 *
 * ORDER BOOKS (`book`) AND THE LATEST TRADES (`trades`), keyless, each read checked live without a key on 2026-10-14. A book is the source's
 * own levels, best first — the highest bid, the lowest ask — whatever order the source sent them in, at most fifty a side; the trades
 * newest first, at most a hundred; a trade's side only where the source says which side took. A side that came back as long as it was asked
 * for, or as long as its source ever sends, or longer than the depth asked, is marked as one that may go on (OrderBook.more), so a page
 * that groups prices knows its last group may be only part of its range. Each kept 1.5 seconds (a book) or three (the trades) by market, so
 * a page asking every two seconds asks the venue about once:
 *   the exchanges       the library's fetchOrderBook and fetchTrades, for a pair the exchange lists (asked for 20 or 100 levels, which every
 *                       one of the five takes, and cut to the depth asked). A trade's side is the TAKER's at Kraken, OKX ("Trade side of
 *                       taker"), Binance (its isBuyerMaker, which the library turns into the taker's side) and Bybit ("Side of taker"); a
 *                       Coinbase trade's side is left unsaid: its docs do not say whose side it is
 *   Kalshi              GET /trade-api/v2/markets/{ticker}/orderbook?depth= — {orderbook_fp: {yes_dollars: [[price, contracts]], no_dollars}}:
 *                       "yes bids and no bids only (no asks are returned)", and "a YES bid at 7¢ is equivalent to a NO ask at 93¢" (its
 *                       docs): a YES leg's bids are the YES bids, its asks the NO bids at 1 − their price; the NO leg the other way. Its docs
 *                       say "best to worst"; live it sends them worst first, so they are put in order here. GET /markets/trades?ticker=
 *                       &limit= — count_fp contracts at yes_price_dollars (no_price_dollars for the NO leg), taker_outcome_side the outcome
 *                       the taker bought (a YES leg's buy when it is yes)
 *   Polymarket          the CLOB's GET clob.polymarket.com/book?token_id= for the outcome's own token ({bids, asks: [{price, size}],
 *                       timestamp}, each side sent worst first). Its trades are not on the CLOB without a key (GET /trades: "Unauthorized");
 *                       Polymarket's Data API has them keyless — GET data-api.polymarket.com/trades?market=<condition id>&takerOnly=true,
 *                       both outcomes', each the taker's fill with its side. The CLOB's book is one book for both (a NO token's /book is
 *                       its YES token's mirrored, live), so the other outcome's fills are this one's at 1 − their price and the other
 *                       side; kept as price, size, side and time: the wallet, the name and the picture each carries are never kept
 *   Polymarket US       GET gateway.polymarket.us/v1/markets/{slug}/book — {marketData: {bids, offers: [{px: {value}, qty}], transactTime}},
 *                       best first, the YES contract's: the NO leg's bids are its offers at 1 − their price, its asks its bids so. No trades:
 *                       the gateway publishes none
 *   Hyperliquid         POST /info {"type":"l2Book","coin"} — {levels: [bids, asks], time}, twenty a side, each {px, sz, n} — and
 *                       {"type":"recentTrades","coin"}: its last ten trades, newest first, side B or A (live, B prints at the best ask and A at
 *                       the best bid: B is a buyer taking, A a seller). A HIP-3 market by its dex-prefixed coin, as its bars are asked
 *   no book             US stocks (a public quote's best bid and ask only: the service says so as that), Stock Tokens, xStocks, Ondo and the
 *                       eight exchanges' pre-IPO contracts (Hyperliquid's HIP-3 ones have its book and trades, as above)
 *
 * A request goes only to those fixed hosts, as a GET over https (Hyperliquid's info endpoint: a POST of one of seven bodies, each built
 * here from its fields, through its own guard), with a time limit (the exchange library's clients go only to their own exchange's hosts).
 * An answer is kept ninety seconds (the Stock Token list ten minutes, a token's price one), so a page that asks every few
 * seconds does not ask the venue every time, and the price of a public market is as old as that. A refusal is kept only when it says the
 * venue cannot be asked just now — ten minutes when the venue does not serve this location, twenty seconds when it is rate-limiting or not
 * answering (`holdBackMs`, the one rule for this file and the service's own cache) — so a venue that has said no is not asked again on every
 * poll. A public listing's markets carry no order types: nothing is ordered through one. Each source says in a sentence or two what its
 * list is made of (`notes`), shown under the list. Keep one set of sources for the life of the service, so what they keep is kept.
 */
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { categoryOf, isExcludedCategory, isIpoCategory, KALSHI_SERIES, normalWords } from "./categories.ts";
import { exchangeSaidNo, openExchange, type ExchangeClient, type OpenExchange } from "./exchange.ts";
import { PMUS_CATEGORIES, PMUS_GATEWAY, PMUS_PER_CATEGORY, pmusBusiest, pmusCandles, pmusLegs, pmusSearch, type PmusGet } from "./polymarket-us.ts";
import { kalshiPage, kalshiSpans, PERIOD_MIN } from "./kalshi.ts";
import { impliedUsd, PRE_IPO_NAMES, preIpoOf, type PreIpoMark } from "./preipo.ts";
import { keylessExchange, PUBLIC_EXCHANGES } from "./prices.ts";
import { ondoStocksPublic, xstocksPublic } from "./public-rwa.ts";
import { usStocksPublic } from "./public-stocks.ts";
import { STOCK_TOKEN_ISSUER, STOCK_TOKEN_TERMS, stockTokens } from "./robinhood.ts";
import type { MarketHub } from "./stream-hub.ts";
import { COINBASE_EXCHANGE_NAME, coinbaseHistory, coinbaseOnline, coinbaseProduct, hyperliquidHistory, libraryHistory, libraryNative, MONDAY_WEEKS, okxHistory, okxInstrument, PAGE_MS, type HistoryHttp } from "./history-crypto.ts";
import { hlPerpSteps } from "./hl-rules.ts";
import { badWindow, barStart, foldBars, historyKeep, hostLane, INTERVAL_WORDS, keepMsOf, limitOf, pageWeight, windowKey, type HistoryHost, type Pace } from "./history.ts";
import { INTERVAL_MS, inDollars, type Candle, type CandleInterval, type CandlePage, type CandleWindow, type Market, type MarketStats, type OrderBook, type PublicTrade, type SessionClock } from "./trade.ts";
import { bannedNo, bannedUntil, edgeRefused, edgeWords, isStable, notTheApi, notTheApiWords, rateLimitedNo, realHttp, redirectedNo, REGION, unreachable, type Http, type HttpReply } from "./types.ts";

/** a market as a public source lists it: the shared shape, and what only a listing carries */
export type Listing = Market & {
  /** the venue's event the market belongs to, where an event holds several (Polymarket's "Brazil Presidential Election"), and `market`
   * this market's own short name inside it, in the venue's words (Kalshi's yes_sub_title "Fed maintains rate", Polymarket's groupItemTitle
   * "October 12"): what a row says in place of the market's whole question */
  event?: { id: string; title: string; market?: string | undefined } | undefined;
  /** the whole event's dollars traded in 24 hours, all its markets together, where the venue reports it (Gamma's volume24hr on the event):
   * how hot the question is, which is what Polymarket itself orders by. Only to ORDER; `volumeUsd24h` stays the market's own */
  eventVolumeUsd24h?: number | undefined;
  /** every category word and tag the venue gives it, for the category shown and the words that leave an event out (categories.ts) */
  tags?: string[] | undefined;
  /** the venue's own picture for an event market, as its API gives one (Polymarket's `icon` for the market, else for its event; Polymarket
   * US's `image`): the row's icon (live/icons.ts), shown only from the venue's own host */
  image?: string | undefined;
  /** the name of the place it trades, where one source speaks for several (Hyperliquid's HIP-3 deployers: "Hyperliquid · io"): explore.ts
   * names the market's venue line with it; absent, the line is the source's name */
  venueName?: string | undefined;
};

export interface ListingsQuery {
  /** a few letters of a symbol or a name; absent: the source's well-known or busiest markets */
  q?: string | undefined;
  /** at most this many markets (an event market counts once, however many outcomes it has) */
  limit: number;
}

export interface EventsQuery {
  /** in the venue's own words ("Economics", "Sports") */
  category?: string | undefined;
  /** closing within this many milliseconds from now */
  closingWithinMs?: number | undefined;
  limit: number;
}

/** whether an event market has settled, as its venue says: `payout` is what one contract of THIS outcome paid (1 to the side that won, 0 to
 * the other; a market called off may pay a price between), `closed` that it trades no more and has not settled yet */
export type Settlement = { settled: false; closed?: boolean | undefined } | { settled: true; payout: number; at?: string | undefined };

export interface PublicSource {
  id: string;
  name: string;
  /** an exchange's coins, event contracts, tokens that stand for shares, or US stocks (public-stocks.ts) */
  kind: "exchange" | "events" | "tokens" | "stocks";
  /** the venue on the account this is the public side of, as the owner would connect it to trade (`okx`), and the connection that does
   * (`live:exchange:okx`) */
  connectTo: string;
  connector: string;
  /** the other connections that trade the same markets, in the order they are offered after `connector` — US stocks at Robinhood beside
   * Alpaca. Markets offers the first of them that serves the network where `connector`'s venue does not (service.ts explore), so one
   * broker refusing the network never hides a line another serves */
  alsoVia?: ReadonlyArray<{ connectTo: string; connector: string }> | undefined;
  /** why nothing is traded through this listing itself, when nothing is (Stock Tokens: they trade from a connected wallet's own rows) */
  readOnly?: string | undefined;
  listings(o: ListingsQuery): Promise<Listing[] | Refusal>;
  /** ONE MARKET'S LINE asked alone, by its own symbol, where the source can answer one market without a search — the US stocks line: one GET
   * of Cboe at most, where a search of a short ticker reads forty (public-stocks.ts) — or null where it lists no such market now. A paper
   * account prices a market it knows by it (live/paper.ts Pricer.find) */
  line?(symbol: string): Promise<Listing | null | Refusal>;
  /** the source's own reader of the markets someone is looking at now, in the venues' streams' shape (the US stocks line's background
   * reader: live/us-quotes.ts UsQuoteFeed) — a hub the service joins with the venues' streams (stream-hub.ts joinHubs) */
  feed?: MarketHub | undefined;
  /** the last 24 hours of the markets named (absent: the well-known ones), by symbol */
  stats?(symbols?: string[]): Promise<Map<string, MarketStats> | Refusal>;
  /** event contracts, each with its question (`group`), close time and category, busiest first */
  events?(o: EventsQuery): Promise<Listing[] | Refusal>;
  /** one market's price history in a window (live/trade.ts CandleWindow), oldest first: `symbol` as its listing names it. A page that says
   * whether older bars exist and where the history ends (CandlePage), or a plain list where the source says nothing of it */
  candles?(symbol: string, interval: CandleInterval, window: CandleWindow): Promise<Candle[] | CandlePage | Refusal>;
  /** one market's order book, `depth` levels a side at most (1 to 50), best first: `symbol` as its listing names it (see the top of this
   * file). A source that publishes no book has none */
  book?(symbol: string, depth: number): Promise<OrderBook | Refusal>;
  /** one market's latest trades, newest first, `limit` at most (1 to 100) */
  trades?(symbol: string, limit: number): Promise<PublicTrade[] | Refusal>;
  /** its price history comes from another host than its listings (Polymarket's CLOB, beside Gamma): a refusal of the history holds back
   * the history alone, and the listings are still asked. A source without it answers both from one host, and one refusal holds back both.
   * Its book and trades are read apart from its listings too (the CLOB, and Polymarket's Data API) */
  historyApart?: true | undefined;
  /** an event market's settlement, asked of the venue keyless (see the top of this file): `symbol` as its listing names it */
  settlement?(symbol: string): Promise<Settlement | Refusal>;
  /** A PERPETUAL'S PAST FUNDING, hour by hour, where the source publishes it (Hyperliquid's fundingHistory, keyless): each hour paid (the
   * top of the hour, ms) and its rate, for the hours from `from` to `to` (ms), oldest first — an hour not paid yet is not in it. A paper
   * account settles a position's hours at these rates (live/paper.ts); a source without it, at the rate its quote carries */
  fundingHistory?(symbol: string, from: number, to: number): Promise<Array<{ at: number; rate: number }> | Refusal>;
  /** let go of the refusals it holds (its place rule, its edge's page, a wait), so the next ask asks the venue: called when a forced re-check
   * found the venue answering this network (service.ts) */
  reset?(): void;
  /** a stock market's clock (trade.ts SessionClock), where the source keeps one: a paper account judges a quote's own time by it and ends a
   * DAY order at its close */
  sessions?: SessionClock | undefined;
  /** what the owner should know about the listing asked with `q`, each a plain sentence under 160 characters, read after `listings` has
   * answered: what the list is made of, how much of the venue it shows when nothing is searched for ("40 of 194 shown · search for the
   * rest"). The service may answer a listing from what it kept without asking the source again, so the sentences never depend on which
   * call came last */
  notes?(o: { q?: string | undefined }): string[];
}

export interface PublicDeps {
  /** the network (a stand-in in tests); every request still goes through the fixed-host guard below */
  http?: Http | undefined;
  /** the exchange library (a stand-in in tests) */
  open?: OpenExchange | undefined;
  clock?: (() => number) | undefined;
  /** how long one request may take, in milliseconds (8000) */
  timeoutMs?: number | undefined;
  /** the line a price history's pages wait in, by host (live/history.ts: absent, the process's own line for each host, at its rate limit) */
  pace?: Pace | undefined;
}

/** the only hosts a public source's own GETs go to (Hyperliquid's info endpoint, a POST, has its own guard: hyperliquidInfo): the event
 * venues, Robinhood's, Cboe's delayed-quote CDN, xStocks' and LI.FI's (public-stocks.ts, public-rwa.ts), Coinbase Exchange's, for a pair's
 * long price history only (live/history-crypto.ts), then the eight pre-IPO perpetuals'
 * venues (Binance's USDⓈ-M futures host and Bybit's v5 host the last two; Gate's host serves the xStocks tickers too), then the US stocks'
 * real-time quotes and charts (Nasdaq's, us-quotes.ts). Polymarket's Data API (beside its CLOB) is asked for its latest trades only, keyless.
 * Polymarket US's public gateway is its keyless market data only: its signed API (api.polymarket.us) is never asked from here */
export const PUBLIC_HOSTS: readonly string[] = ["external-api.kalshi.com", "gamma-api.polymarket.com", "clob.polymarket.com", "data-api.polymarket.com", "gateway.polymarket.us", "api.robinhood.com", "api.nasdaq.com", "cdn-api.cboe.com", "api.xstocks.fi", "li.quest", "api.exchange.coinbase.com", "www.okx.com", "api.gateio.ws", "futures.kraken.com", "www.deribit.com", "api-futures.kucoin.com", "contract.mexc.com", "fapi.binance.com", "api.bybit.com"];
const KALSHI = "https://external-api.kalshi.com/trade-api/v2";
const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";
/** Polymarket's Data API: its latest trades, keyless (the CLOB's own need a key) */
const DATA_API = "https://data-api.polymarket.com";
/** how long a list is kept: a public market's price is as old as this */
export const KEEP_MS = 90_000;
const PRICE_MS = 60_000;
/** a venue's list of what it trades changes rarely: a pre-IPO venue's instrument list is kept ten minutes, like the Stock Token list */
export const LIST_MS = 600_000;
/** price history is kept a minute (an event market's: the exchanges' and Hyperliquid's are kept by their window, live/history.ts keepMsOf) */
const HISTORY_MS = 60_000;
const TIMEOUT_MS = 8_000;
/** the longest a sentence under the list may be */
export const NOTE_MAX = 160;

type Rec = Record<string, unknown>;
export const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
export const rec = (v: unknown): Rec => (isRec(v) ? v : {});
/** a list, or a list written as a JSON string (Gamma's outcomes and prices) */
export function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const x: unknown = JSON.parse(v);
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }
  return [];
}
export const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
/** a finite number, from a number or a numeric string; never 0 for a field that is not there */
export const fin = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
export const pos = (v: unknown): number | undefined => {
  const n = fin(v);
  return n !== undefined && n > 0 ? n : undefined;
};
export const nonNeg = (v: unknown): number | undefined => {
  const n = fin(v);
  return n !== undefined && n >= 0 ? n : undefined;
};
/** an event contract's price: more than 0 and less than 1 (an empty side of Kalshi's book shows as 0 or 1, and neither is a price) */
export const px = (v: unknown): number | undefined => {
  const n = fin(v);
  return n !== undefined && n > 0 && n < 1 ? n : undefined;
};
export const round = (x: number, places = 6): number => Number(x.toFixed(places));
export const mid = (bid: number | undefined, ask: number | undefined): number | undefined => (bid !== undefined && ask !== undefined && ask >= bid ? round((bid + ask) / 2, 10) : undefined);
export const has = (q: string, ...fields: unknown[]): boolean => fields.some((f) => typeof f === "string" && f.toUpperCase().includes(q));
/** a time the venue wrote, in milliseconds; a time it did not write sorts last */
export const whenMs = (v: unknown): number => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};
/** a moment the venue wrote in milliseconds since the epoch (or seconds, `inSeconds`), as ISO 8601; nothing when it wrote none */
const isoAt = (v: unknown, inSeconds = false): string | undefined => {
  const n = pos(v);
  return n === undefined ? undefined : new Date(inSeconds ? n * 1000 : n).toISOString();
};
/** a fraction the venue wrote (0.015) as a percent (1.5) */
const pct = (v: unknown): number | undefined => {
  const n = fin(v);
  return n === undefined ? undefined : round(n * 100, 4);
};

/** The network as a public source uses it: a GET over https to one of `hosts`, on the default port, with no user in the URL, within
 * `timeoutMs`. Anything else is not asked. A guard made for a reader of TEXT bodies (a feed, a CSV) is made with `maxBytes`: its GETs ask
 * for the whole body within that many bytes (types.ts Http) — the guard's own, set once, never a caller's option */
export function fixedHosts(http: Http, hosts: readonly string[], timeoutMs: number, o: { maxBytes?: number | undefined } = {}): Http {
  return async (url, init = {}) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error("not a URL: not asked");
    }
    if (u.protocol !== "https:" || u.username || u.password || u.port || !hosts.includes(u.hostname) || (init.method ?? "GET") !== "GET" || init.body !== undefined) throw new Error(`${u.protocol}//${u.host} is not asked: a public market is read with a GET from ${hosts.join(", ")} only`);
    return http(url, { method: "GET", headers: { accept: "application/json", ...(init.headers ?? {}) }, timeoutMs: Math.min(init.timeoutMs ?? timeoutMs, timeoutMs), ...(o.maxBytes !== undefined ? { maxBytes: o.maxBytes } : {}) });
  };
}

/** THE HOSTS A PRICE HISTORY IS READ AT APART FROM A SOURCE'S LISTINGS — Coinbase Exchange beside Coinbase's api.coinbase.com, and Coinbase
 * Exchange and OKX for a Kraken pair (exchangeTickers): a refusal there that says the host cannot be asked just now (holdBackMs: its place
 * rule ten minutes, a 429 a minute, no answer twenty seconds) holds back the histories asked of that host alone, for as long, in every source
 * that asks it over the same network (the service's: one for the process) — never a source's listings, book, trades or stream, and never
 * the venue that borrowed the bars. Lengthened only, as every hold here */
interface HostHolds {
  heldOf(host: HistoryHost): Refusal | undefined;
  /** `got` passed on, its refusal held where it holds back */
  hold<T>(host: HistoryHost, got: T | Refusal): T | Refusal;
  clear(host: HistoryHost): void;
}
const HOST_HOLDS = new WeakMap<Http, Map<HistoryHost, { until: number; r: Refusal }>>();
function hostHolds(deps: PublicDeps): HostHolds {
  const net = deps.http ?? realHttp;
  let held = HOST_HOLDS.get(net);
  if (!held) HOST_HOLDS.set(net, (held = new Map()));
  const map = held;
  const clock = deps.clock ?? Date.now;
  return {
    heldOf: (host) => {
      const x = map.get(host);
      return x && clock() < x.until ? x.r : undefined;
    },
    hold: (host, got) => {
      const ms = isRefusal(got) ? holdBackMs(got) : 0;
      const was = map.get(host);
      if (isRefusal(got) && ms > 0 && (!was || clock() >= was.until || clock() + ms > was.until)) map.set(host, { until: clock() + ms, r: got });
      return got;
    },
    clear: (host) => void map.delete(host),
  };
}

/** what a venue answered, on one line and cut at 220 characters — never inside the sentence it gave in its JSON, which runs to its end (up
 * to 600): Binance's 451 sentence ends past 220, "…if you believe you received this message in error.", and stays whole */
function saidOf(text: string): string {
  const folded = text.replace(/\s+/g, " ").trim();
  const sentence = /"(?:msg|message|retMsg|error_description)"\s*:\s*"(?:[^"\\]|\\.)*"/.exec(folded);
  return folded.slice(0, Math.min(600, Math.max(220, sentence ? sentence.index + sentence[0].length : 0)));
}

/** the words around a place rule in a page that is not JSON (an edge's HTML, a plain-text answer): the markup taken out, and the 240
 * characters around the sentence that names the place — a page's first characters are its doctype and title, not the venue's words */
function regionSaid(text: string): string {
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const at = Math.max(0, plain.search(REGION));
  return plain.slice(Math.max(0, at - 120), at + 120).trim();
}

/** a venue that has banned this machine's address for too many requests without giving a time: Bybit's "IP has been banned" (retCode
 * 10009), and its 403 "access too frequent", which asks for at least ten minutes with nothing sent (exchange.ts reads the same for a key) */
const BANNED = /\bip ha(?:s|d) been banned\b|\bretCode"?\s*:\s*"?10009\b|\baccess too frequent\b/i;

/** A public answer that is not a yes, as a refusal with the venue's own words. There is no key, so nothing here blames one: a 401 or a 403
 * is the venue refusing the request, never "the key may not". Read as types.ts reads every answer: the wait the venue asked for (its
 * Retry-After) is the hold, a redirect is answered and not followed, and a page where the API answers JSON is no answer at all */
export function publicNo(venue: string, name: string, r: HttpReply): Refusal {
  const native = { status: r.status, said: saidOf(r.text) };
  const yes = r.status >= 200 && r.status < 300;
  // a page that is not JSON keeps the sentence that names the place, not its markup
  if (r.status === 451 || (!yes && REGION.test(r.text))) return no("E_VENUE_GEOBLOCKED", { venue, message: `${name} does not serve this location: that is its own rule, and the account does not look for a way around it`, native: { status: r.status, said: r.body === undefined && !/^\s*[{[]/.test(r.text) ? regionSaid(r.text) : native.said } });
  const until = bannedUntil(r.text);
  if (r.status === 418 || until !== undefined || BANNED.test(r.text)) return bannedNo(venue, name, until ?? (r.retryAfterMs ? Date.now() + r.retryAfterMs : undefined), native);
  // the server in front of the venue refusing this network with a page of its own: held back as long as a place rule, not asked every 20 s
  if (edgeRefused(r.status, r.text)) return no("E_VENUE_GEOBLOCKED", { venue, message: edgeWords(name, r.status, r.text), native: { status: r.status, edge: true } });
  if (r.status === 429) return rateLimitedNo(venue, name, r.retryAfterMs, native);
  if (r.status >= 500 || r.status === 0) return no("E_VENUE_UNREACHABLE", { venue, message: `${name} did not answer`, native: { ...native, ...(r.retryAfterMs ? { until: Date.now() + r.retryAfterMs } : {}) } });
  if (r.status >= 300 && r.status < 400) return redirectedNo(venue, name, r.status, r.location);
  if (notTheApi(r)) return no("E_VENUE_UNREACHABLE", { venue, message: notTheApiWords(name), native: { status: r.status, page: true } });
  if (yes) return no("E_VENUE_REJECTED", { venue, message: `${name} answered in a way this could not read`, native: { status: r.status } });
  return no("E_VENUE_REJECTED", { venue, message: `${name} refused the request (HTTP ${r.status})`, native });
}

/** How long a refusal is kept before the venue is asked again, when it says the venue cannot be asked just now: ten minutes for a venue
 * that does not serve this location (its rule will not change within the hour), as long as the venue asked for one that is rate-limiting
 * or has banned this address (a minute when a 429 gave no time), twenty seconds for one not answering, so a page polling every few seconds
 * does not hammer it. Zero for every other refusal, and for a place rule about one pair or product: the next ask asks the venue again.
 * The one rule, for this file's keeper and for the service's read cache */
export function holdBackMs(r: Refusal, now: number = Date.now()): number {
  // a place rule for one pair, product or feature (detail.scope) holds back nothing else of the venue: its other markets still answer
  if ((r.detail as { scope?: unknown } | undefined)?.scope !== undefined) return 0;
  if (r.code === "E_VENUE_GEOBLOCKED") return 600_000;
  // a ban for too many requests, or a wait the venue asked for, until when it said: nothing is asked of it before then (an hour at most is
  // kept, then asked again)
  const until = (r.native as { until?: unknown } | undefined)?.until;
  if (typeof until === "number" && until > now) return Math.min(until - now, 3_600_000);
  const status = (r.native as { status?: unknown } | undefined)?.status;
  if (status === 418) return 600_000;
  // rate-limited with no wait given: the minute the refusal's own sentence says
  if (status === 429) return 60_000;
  if (r.code === "E_VENUE_UNREACHABLE") return 20_000;
  return 0;
}

/** WHEN A SOURCE'S ANSWER WAS READ FROM ITS VENUE. A listing that carries no time of its own (an exchange's ticker, Hyperliquid's mid, an
 * event contract's price) is as old as the moment its venue answered, and every keeper here hands the same answer out for a while after
 * that: whoever prices with it (the paper account, live/paper.ts) needs that moment, never the moment it was handed the kept answer. So
 * each answer a keeper takes is stamped with the moment it came back — the answer itself and what is in it, objects and lists, as far down
 * as READ_STAMP_DEPTH and READ_STAMP_MOST things — in a weak map beside it: nothing is added to the answer, and nothing is kept once the
 * answer is let go. A listing built afresh from a kept answer (a Kalshi leg from its event's market) takes the stamp of what it was built
 * from (readLike). Read with readAtOf */
const READ_AT = new WeakMap<object, number>();
const READ_STAMP_DEPTH = 6;
const READ_STAMP_MOST = 50_000;
/** the moment `x` was read from its venue (ms), where it was stamped: a kept answer, something in one, or a listing built from one */
export const readAtOf = (x: unknown): number | undefined => (x !== null && typeof x === "object" ? READ_AT.get(x) : undefined);
/** `answer` and what is in it stamped as read at `at`; something stamped already keeps its own (an older answer's part, handed on) */
function stampRead(answer: unknown, at: number): void {
  let left = READ_STAMP_MOST;
  const walk = (x: unknown, depth: number): void => {
    if (x === null || typeof x !== "object" || left <= 0 || READ_AT.has(x)) return;
    left--;
    READ_AT.set(x, at);
    if (depth >= READ_STAMP_DEPTH) return;
    for (const v of Array.isArray(x) ? x : Object.values(x as Record<string, unknown>)) if (v !== null && typeof v === "object") walk(v, depth + 1);
  };
  walk(answer, 0);
}
/** `x` (a listing, or each one of a list) stamped as read when the oldest of `from` was — each a moment (ms) or something stamped: a listing
 * built from several answers is as old as the oldest of them. Nothing stamped where none of `from` says when. Returns `x` */
export function readLike<T>(x: T, ...from: unknown[]): T {
  const times = from.map((f) => (typeof f === "number" ? f : readAtOf(f))).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (!times.length) return x;
  const at = Math.min(...times);
  for (const one of Array.isArray(x) ? x : [x]) if (one !== null && typeof one === "object") READ_AT.set(one, at);
  return x;
}

/** an answer kept for `ms` from when it was asked (or for what `ms` says of the answer: until it has come, it is waited for up to KEEP_MS),
 * and one asked only once while it is on its way; a refusal is kept for holdBackMs (which is nothing for most), a throw is not kept. What it
 * takes is stamped with the moment it came back (stampRead) */
/** a keeper's answers, and `clear()`: the refusals it holds let go of, so the next ask asks the venue (a forced re-check that found the
 * venue answering this network: the place rule or edge it held was the network the user left) */
export type Kept<T> = ((key: string, run: () => Promise<T | Refusal>) => Promise<T | Refusal>) & { clear(): void };
export function keeper<T>(clock: () => number, ms: number | ((answer: T) => number)): Kept<T> {
  const kept = new Map<string, { until: number; p: Promise<T | Refusal>; held?: boolean }>();
  const keep = ((key: string, run: () => Promise<T | Refusal>) => {
    const now = clock();
    const hit = kept.get(key);
    if (hit && now < hit.until) return hit.p;
    const entry: { until: number; p: Promise<T | Refusal>; held?: boolean } = { until: now + (typeof ms === "number" ? ms : KEEP_MS), p: Promise.resolve() as unknown as Promise<T | Refusal> };
    entry.p = run().then(
      (r) => {
        if (!isRefusal(r)) stampRead(r, clock());
        if (kept.get(key) !== entry) return r;
        if (isRefusal(r)) {
          const hold = holdBackMs(r);
          if (hold > 0) {
            entry.until = clock() + hold;
            entry.held = true;
          } else kept.delete(key);
        } else if (typeof ms !== "number") entry.until = now + ms(r);
        return r;
      },
      (err: unknown) => {
        if (kept.get(key) === entry) kept.delete(key);
        throw err;
      },
    );
    kept.set(key, entry);
    if (kept.size > 200) kept.delete(kept.keys().next().value!);
    return entry.p;
  }) as Kept<T>;
  keep.clear = () => {
    for (const [k, e] of kept) if (e.held) kept.delete(k);
  };
  return keep;
}

/** one JSON answer from a fixed host, kept for a while: the body, or the venue's refusal */
export function getter(get: Http, venue: string, name: string, clock: () => number, ms = KEEP_MS): ((url: string) => Promise<unknown>) & { clear(): void } {
  const keep = keeper<unknown>(clock, ms);
  const got = (url: string) =>
    keep(url, async () => {
      let r: HttpReply;
      try {
        r = await get(url);
      } catch (err) {
        return unreachable(venue, name, err);
      }
      return r.status === 200 && r.body !== undefined ? r.body : publicNo(venue, name, r);
    });
  return Object.assign(got, { clear: keep.clear });
}

/** a history's interval and window, held to what a public source takes (live/history.ts badWindow): one of the bar sizes, a start before now */
export function badHistory(venue: string, interval: string, w: CandleWindow, now: number): Refusal | undefined {
  const why = badWindow(interval, w, now);
  return why ? no("E_ACCOUNT_BAD_ACTION", { venue, message: why }) : undefined;
}

/** where an event market's history starts, for a window that names no start (one page before a chart's first bar): that many bars before
 * its end — and never before the first second: Polymarket answers a startTs of 0 HTTP 400 "the time component is mandatory" (live
 * 2026-10-17), which is what MAX would ask */
export const startOf = (interval: CandleInterval, w: CandleWindow, now: number): number => Math.max(1_000, w.since ?? (w.until ?? now) - Math.min(w.limit ?? 300, 1_000) * INTERVAL_MS[interval]);

/** prices at moments (`t` in seconds) folded into bars of `interval` (live/history.ts barStart: a week from Monday): open and close the
 * first and last, high and low the extremes */
export function foldPoints(points: Array<{ t: number; p: number }>, interval: CandleInterval): Candle[] {
  const bars = new Map<number, Candle>();
  for (const { t, p } of [...points].sort((a, b) => a.t - b.t)) {
    const at = barStart(t * 1000, interval);
    const b = bars.get(at);
    if (!b) bars.set(at, { t: at, o: p, h: p, l: p, c: p });
    else {
      b.h = Math.max(b.h, p);
      b.l = Math.min(b.l, p);
      b.c = p;
    }
  }
  return [...bars.values()];
}

// ---- order books and the latest trades: what every source's `book` and `trades` share ------------------------------------------------

/** how long a book is kept (a page asks every two seconds: the venue is asked about once in that time), and the latest trades */
export const BOOK_MS = 1_500;
export const TRADES_MS = 3_000;
/** the most levels a side of a book is read to, and the most trades one read gives */
export const BOOK_DEPTH_MAX = 50;
export const TRADES_MAX = 100;
/** a depth or a count as asked, held to 1…max: a whole number, else `fallback` */
export const countOf = (n: unknown, max: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : NaN;
  return v >= 1 ? Math.min(max, v) : Math.min(max, fallback);
};
/** a level as a source writes it: [price, size] in a list, or the two named */
type Level = readonly [unknown, unknown];
const pairOf = (row: unknown): Level => {
  const a = list(row);
  return [a[0], a[1]];
};

/** One side of a book from a source's levels: each level's price (read by `price`: an event contract's must lie strictly between 0 and 1,
 * or be turned to the other outcome's) and the size resting there, as the source wrote them — a level with no price or nothing resting is
 * not a level — best first, the highest bid and the lowest ask, whatever order the source sent them in; at most `depth` */
export function sideOf(rows: readonly Level[], side: "bids" | "asks", depth: number, price: (v: unknown) => number | undefined = pos): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [p, s] of rows) {
    const at = price(p);
    const size = pos(s);
    if (at !== undefined && size !== undefined) out.push([at, size]);
  }
  out.sort((a, b) => (side === "bids" ? b[0] - a[0] : a[0] - b[0]));
  return out.slice(0, depth);
}
/** Whether a side of a book may go on past its last level shown (OrderBook.more): more levels came than the depth asked, and the rest were
 * cut off here; or the source sent as many rows as it was asked for or ever sends (`sentMost`: Kalshi's depth asked, the library's 20 or
 * 100, Hyperliquid's twenty), so it may hold more than it sent. Otherwise the source sent every level it holds */
export function goesOn(rows: readonly Level[], depth: number, price: (v: unknown) => number | undefined = pos, sentMost?: number): boolean {
  if (sentMost !== undefined && rows.length >= sentMost) return true;
  let n = 0;
  for (const [p, s] of rows) if (price(p) !== undefined && pos(s) !== undefined) n++;
  return n > depth;
}
/** an event contract's price read as the OTHER outcome's (a YES bid at 0.07 is a NO ask at 0.93): 1 − it, to six places */
const otherSide = (v: unknown): number | undefined => {
  const p = px(v);
  return p === undefined ? undefined : round(1 - p, 6);
};
/** a moment as ISO 8601: the source's own stamp (ms, or seconds `inSeconds`, or a time written), else `fallback` */
const stampOf = (v: unknown, fallback: number, inSeconds = false): string => {
  if (typeof v === "string" && !/^\d+$/.test(v.trim())) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return isoAt(v, inSeconds) ?? new Date(fallback).toISOString();
};
/** trades newest first: by their time, and among trades of one moment in the reverse of the order the source listed them (oldest first) */
const newestFirst = (rows: Array<PublicTrade & { i: number }>, limit: number): PublicTrade[] =>
  rows
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.i - a.i)
    .slice(0, limit)
    .map(({ i: _i, ...t }) => t);

// ---- exchanges, through the unified library's keyless client ---------------------------------------------------

/** what the exchange's own ticker says, field by field (see the top of this file) */
interface Said {
  last?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  changePct?: number | undefined;
  change?: number | undefined;
  quoteVolume?: number | undefined;
  open?: boolean | undefined;
}
/** a change measured from the venue's own price of 24 hours ago */
const since = (last: number | undefined, then: number | undefined): Pick<Said, "change" | "changePct"> => (last !== undefined && then !== undefined ? { change: round(last - then, 10), changePct: round(((last - then) / then) * 100, 4) } : {});

const EXCHANGES: Readonly<Record<string, { name: string; read: (info: Rec) => Said }>> = {
  kraken: {
    name: "Kraken",
    read: (i) => {
      const vol = pos(list(i.v)[1]);
      const vwap = pos(list(i.p)[1]);
      return { last: pos(list(i.c)[0]), bid: pos(list(i.b)[0]), ask: pos(list(i.a)[0]), ...(vol !== undefined && vwap !== undefined ? { quoteVolume: round(vol * vwap, 2) } : {}) };
    },
  },
  coinbase: {
    name: "Coinbase",
    read: (i) => ({ last: pos(i.price), changePct: fin(i.price_percentage_change_24h), quoteVolume: nonNeg(i.approximate_quote_24h_volume), open: i.trading_disabled !== true && i.is_disabled !== true }),
  },
  okx: {
    name: "OKX",
    read: (i) => ({ last: pos(i.last), bid: pos(i.bidPx), ask: pos(i.askPx), ...since(pos(i.last), pos(i.open24h)), quoteVolume: nonNeg(i.volCcy24h) }),
  },
  binance: {
    name: "Binance",
    read: (i) => ({ last: pos(i.lastPrice), bid: pos(i.bidPrice), ask: pos(i.askPrice), change: fin(i.priceChange), changePct: fin(i.priceChangePercent), quoteVolume: nonNeg(i.quoteVolume) }),
  },
  bybit: {
    name: "Bybit",
    read: (i) => ({ last: pos(i.lastPrice), bid: pos(i.bid1Price), ask: pos(i.ask1Price), ...since(pos(i.lastPrice), pos(i.prevPrice24h)), quoteVolume: nonNeg(i.turnover24h) }),
  },
};

/** coins well enough known to be shown before anything is typed, most valued first */
const COINS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "TRX", "TON", "LINK", "AVAX", "SUI", "XLM", "HBAR", "DOT", "LTC", "BCH", "SHIB", "UNI", "AAVE", "NEAR", "APT", "ARB", "OP", "PEPE", "ATOM", "FIL", "ETC", "INJ", "ONDO", "HYPE", "ENA", "WLD", "SEI", "TIA", "POL"];
const DOLLARS = ["USD", "USDT", "USDC"];

interface CcxtMarket {
  symbol?: string;
  base?: string;
  quote?: string;
  spot?: boolean;
  active?: boolean;
}
type Tickers = Record<string, { info?: unknown; last?: number; bid?: number; ask?: number } | undefined>;

/** the pairs to ask for: the well-known coins in dollars, or the coins in dollars whose name starts with the query — the query's part before
 * any slash ("BTC/USD" asks for the BTC pairs), a pair written whole first of all, then the coin named exactly, then the shortest names */
function pairsFor(markets: Record<string, unknown> | undefined, q: string | undefined): string[] {
  const all = markets ?? {};
  const live = (s: string): CcxtMarket | undefined => {
    const m = all[s] as CcxtMarket | undefined;
    return m && m.spot !== false && m.active !== false ? m : undefined;
  };
  const Q = (q ?? "").trim().toUpperCase();
  if (!Q) return COINS.flatMap((c) => DOLLARS.map((d) => `${c}/${d}`)).filter((s) => live(s) !== undefined);
  const base = Q.split("/")[0]!.trim();
  if (!base) return [];
  return Object.keys(all)
    .map((s) => ({ s, m: live(s) }))
    .filter((x): x is { s: string; m: CcxtMarket } => x.m !== undefined && typeof x.m.base === "string" && typeof x.m.quote === "string" && inDollars(x.m.quote) && !isStable(x.m.base) && x.m.base.toUpperCase().startsWith(base) && !x.s.includes(":"))
    .sort((a, b) => Number(b.s.toUpperCase() === Q) - Number(a.s.toUpperCase() === Q) || Number(b.m.base!.toUpperCase() === base) - Number(a.m.base!.toUpperCase() === base) || a.m.base!.length - b.m.base!.length || a.s.localeCompare(b.s))
    .slice(0, 45)
    .map((x) => x.s);
}

/** the library's own line before what an exchange answered ("bybit GET https://api.bybit.com/… 403 Forbidden "): the request it made, not
 * the exchange's words */
const LIBRARY_LINE = /^\S+ (?:GET|POST|PUT|DELETE) https?:\/\/\S+ \d{3}\b[^{[<]*(?=[{[<])/;

/** What the exchange library threw, as the exchange's refusal (exchange.ts exchangeSaidNo), carrying the exchange's words without the
 * library's request line. The words decide, read whole: a refusal of this location further in than exchangeSaidNo's first 240 characters
 * (an edge's HTML page, say) is still that, whatever class the library gave it — Bybit's 403 arrives labelled RateLimitExceeded. A keyless
 * read has no key to blame: what exchange.ts would tell a key ("does not accept this key", "the key lacks the permission", the key's IP
 * list) is the exchange refusing the request, in its own words */
export function exchangeNo(id: string, name: string, err: unknown): Refusal {
  const r = exchangeSaidNo(id, name, err, {});
  const n = (r.native ?? {}) as { error?: unknown; said?: unknown };
  const whole = String((err as { message?: unknown } | undefined)?.message ?? err ?? "").replace(/\s+/g, " ").trim();
  if (r.code !== "E_VENUE_GEOBLOCKED" && REGION.test(whole)) return no("E_VENUE_GEOBLOCKED", { venue: id, message: `${name} does not serve this location: that is its own rule, and the account does not look for a way around it`, native: { error: n.error, said: regionSaid(whole.replace(LIBRARY_LINE, "")) } });
  const own = typeof n.said === "string" ? n.said.replace(LIBRARY_LINE, "").trim() : "";
  if (r.code === "E_VENUE_UNAUTHORIZED" || r.code === "E_VENUE_PERMISSION") return no("E_VENUE_REJECTED", { venue: id, message: `${name} refused the request`, native: { error: n.error, said: own || n.said } });
  return own && own !== n.said ? { ...r, native: { ...n, said: own } } : r;
}

/** the exchanges whose keyless market load also reads their derivatives by default (the library's options.fetchMarkets.types: Binance
 * spot, linear and inverse; Bybit spot, linear, inverse and options; OKX spot, future, swap and option), each from its own host */
const SPOT_ONLY = new Set(["binance", "bybit", "okx"]);
/** A keyless client that loads spot markets only. This file reads nothing else from it (its pairs are spot, its bars a spot market's), and
 * a derivatives host refusing this network — a place rule for derivatives alone, an edge, a futures outage — would otherwise be the answer
 * for the spot tickers too, held ten minutes. A connected key's client and the pre-IPO sources ask the derivatives hosts on purpose, and a
 * rule for derivatives is still met there. An exchange whose option is not a list of types (Coinbase's is a method's name) is left as is */
async function keylessSpot(id: string, open: OpenExchange): Promise<ExchangeClient | undefined> {
  const x = await keylessExchange(id, open);
  const fm = x?.options?.fetchMarkets;
  if (x?.options && SPOT_ONLY.has(id) && fm !== null && typeof fm === "object" && !Array.isArray(fm)) x.options.fetchMarkets = { ...fm, types: ["spot"] };
  return x;
}

/** One exchange's public tickers, keyless, through the unified library. An exchange that does not serve this location answers with its own
 * refusal, which is passed on as it is, in its own words (exchangeNo), and holds back every read of the exchange for as long as holdBackMs
 * says — ten minutes for that refusal — not only the read that met it: another search, the 24 hours, the bars */
export function exchangeTickers(id: string, deps: PublicDeps = {}): PublicSource {
  const reader = EXCHANGES[id];
  const name = reader?.name ?? id;
  const open = deps.open ?? openExchange;
  const clock = deps.clock ?? Date.now;
  const keep = keeper<Listing[]>(clock, KEEP_MS);
  // a price history's answers, kept by their window, a few dozen at most and bounded by their bars (live/history.ts)
  const history = historyKeep<Candle[] | CandlePage>({ entries: 32, most: 60_000, weigh: pageWeight, clock });
  const hist: HistoryHttp = { http: fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, PAGE_MS), pace: deps.pace ?? hostLane, clock };
  // the history hosts apart from the listings, held back apart from them (hostHolds); and whether Coinbase Exchange trades a product a
  // Kraken pair would be charted from, kept ten minutes
  const hosts = hostHolds(deps);
  const online = keeper<"online" | "offline" | "unlisted">(clock, LIST_MS);
  const books = keeper<OrderBook>(clock, BOOK_MS);
  const tape = keeper<PublicTrade[]>(clock, TRADES_MS);
  // the library keeps a failed load of the markets and answers it again: after a failure they are loaded afresh
  let reload = false;
  // a book or trades read that failed may have met a market list gone stale (a pair delisted since): the list is loaded afresh then — but
  // at most once in KEEP_MS, since the page asks for a book every two seconds and a whole list is large (Binance's, Kraken's: megabytes)
  let forcedAt = Number.NEGATIVE_INFINITY;
  const staleMaybe = (): void => {
    if (clock() - forcedAt < KEEP_MS) return;
    forcedAt = clock();
    reload = true;
  };
  // the refusal that holds the exchange back, and until when (the service's read cache does the same by venue). A hold is only ever
  // lengthened: two reads in flight at once answer in any order, and a late timeout must not cut a ban's or a place rule's hold to 20 s
  let held: { until: number; r: Refusal } | undefined;
  const heldBack = (): Refusal | undefined => (held && clock() < held.until ? held.r : undefined);
  const hold = <T>(got: T | Refusal): T | Refusal => {
    const ms = isRefusal(got) ? holdBackMs(got) : 0;
    if (isRefusal(got) && ms > 0 && (!held || clock() >= held.until || clock() + ms > held.until)) held = { until: clock() + ms, r: got };
    return got;
  };
  /** the tickers asked for (or the query's), from the exchange itself */
  const fresh = async (symbols: string[] | undefined, q: string | undefined): Promise<Listing[] | Refusal> => {
    let x: ExchangeClient | undefined;
    try {
      x = await keylessSpot(id, open);
      if (!x) return no("E_WALLET_UNKNOWN_VENUE", { venue: id, message: `the exchange library knows no exchange called "${id}"` });
      if (!x.fetchTickers) return no("E_VENUE_REJECTED", { venue: id, message: `the exchange library reads no tickers from ${name}` });
      await x.loadMarkets?.(reload);
      reload = false;
      const want = (symbols ?? pairsFor(x.markets, q)).filter((s) => x!.markets === undefined || x!.markets[s] !== undefined);
      if (!want.length) return [];
      const tickers = (await x.fetchTickers(want)) as Tickers;
      const out: Listing[] = [];
      for (const s of want) {
        const t = tickers[s];
        if (!t) continue;
        const m = (x.markets?.[s] ?? {}) as CcxtMarket;
        const base = str(m.base) ?? s.split("/")[0]!;
        const quote = str(m.quote) ?? (s.split("/")[1] ?? "").split(":")[0]!;
        if (!inDollars(quote)) continue;
        // an exchange whose answer this file has not read the docs of shows its price and nothing it would have to trust the library for
        const said: Said = reader ? reader.read(rec(t.info)) : { last: pos(t.last), bid: pos(t.bid), ask: pos(t.ask) };
        const price = said.last ?? mid(said.bid, said.ask);
        if (price === undefined) continue;
        out.push({
          symbol: s,
          name: `${base} / ${quote}`,
          kind: "spot",
          base,
          quote,
          price,
          bid: said.bid,
          ask: said.ask,
          open: m.active !== false && said.open !== false,
          types: [],
          ...(said.changePct !== undefined ? { changePct24h: said.changePct } : {}),
          ...(said.change !== undefined ? { change24h: said.change } : {}),
          ...(said.quoteVolume !== undefined ? { volumeUsd24h: said.quoteVolume } : {}),
        });
      }
      return out;
    } catch (err) {
      reload = true;
      return exchangeNo(id, name, err);
    }
  };
  /** the same, kept KEEP_MS by what was asked, and not asked at all while a refusal holds the exchange back */
  const read = (symbols: string[] | undefined, q: string | undefined): Promise<Listing[] | Refusal> => {
    const back = heldBack();
    return back ? Promise.resolve(back) : keep(`${symbols ? symbols.join(",") : ""}|${q ?? ""}`, async () => hold(await fresh(symbols, q)));
  };
  return {
    id,
    name,
    reset: () => {
      keep.clear();
      history.clear();
      books.clear();
      tape.clear();
      online.clear();
      held = undefined;
      if (id === "coinbase" || id === "okx") hosts.clear(id);
    },
    kind: "exchange",
    connectTo: id,
    connector: `live:exchange:${id}`,
    // Coinbase's history is Coinbase Exchange's (api.exchange.coinbase.com), its listings api.coinbase.com's; a Kraken pair's is charted from
    // Coinbase Exchange or OKX: a refusal of the history holds back the history alone (the service's read cache, and hostHolds here)
    ...(id === "coinbase" || id === "kraken" ? { historyApart: true as const } : {}),
    async listings(o) {
      const got = await read(undefined, o.q);
      if (isRefusal(got)) return got;
      return [...got].sort((a, b) => (b.volumeUsd24h ?? -1) - (a.volumeUsd24h ?? -1)).slice(0, Math.max(1, o.limit));
    },
    async stats(symbols) {
      const got = await read(symbols?.length ? [...symbols].sort() : undefined, undefined);
      if (isRefusal(got)) return got;
      return new Map(got.map((m) => [m.symbol, { price: m.price, changePct24h: m.changePct24h, change24h: m.change24h, volumeUsd24h: m.volumeUsd24h }]));
    },
    /** a pair's price history, keyless (see the top of this file): only for a pair the exchange lists priced in dollars (the library is
     * asked for nothing it has not listed). Coinbase's from Coinbase Exchange, OKX's from OKX's history-candles, Kraken's from the venue with
     * deep history that trades the pair (krakenHistory: its own latest 720 where none does, and always where its own bars alone are asked),
     * any other exchange's through the library, page by page; the volume in the coin (a spot market's) */
    candles: (symbol, interval, w) => {
      const back = heldBack();
      return back ? Promise.resolve(back) : history.get(`${symbol}|${windowKey(interval, w)}`, keepMsOf(interval, w), async () => {
        const bad = badHistory(id, interval, w, clock());
        if (bad) return bad;
        try {
          const x = await keylessSpot(id, open);
          if (!x) return no("E_WALLET_UNKNOWN_VENUE", { venue: id, message: `the exchange library knows no exchange called "${id}"` });
          await x.loadMarkets?.(reload);
          reload = false;
          const m = x.markets?.[symbol] as (CcxtMarket & { id?: unknown }) | undefined;
          if (!m || m.spot === false || !inDollars(str(m.quote) ?? "")) return no("E_VENUE_REJECTED", { venue: id, message: `${name} lists no market ${symbol.slice(0, 40)} priced in dollars` });
          const base = (str(m.base) ?? symbol.split("/")[0]!).toUpperCase();
          const quote = (str(m.quote) ?? "").toUpperCase();
          // the venue's own name for the market where the library carries it (Coinbase's BTC-USD, OKX's BTC-USDT), else built from the pair
          const own = typeof m.id === "string" && /^[A-Z0-9]{1,20}-[A-Z0-9]{1,10}$/.test(m.id) ? m.id : undefined;
          if (id === "coinbase") {
            // a pair Coinbase trades on another product's book says so (its Advanced Trade product's `alias`: ETH-USDC is ETH-USD's,
            // live 2026-10-17; Coinbase Exchange lists ETH-USDC as delisted, its bars ending in 2023): that book's history is the pair's
            const alias = str(rec(rec(m).info).alias)?.toUpperCase();
            const product = alias && /^[A-Z0-9]{1,20}-[A-Z0-9]{1,10}$/.test(alias) ? alias : (own ?? coinbaseProduct(`${base}/${quote}`)!);
            // Coinbase Exchange's refusal holds back the history from it alone: the listings, the book and the trades are api.coinbase.com's
            const got = hosts.heldOf("coinbase") ?? hosts.hold("coinbase", await coinbaseHistory(hist, id, product, interval, w));
            return !isRefusal(got) && product !== own && alias ? { ...got, note: `Coinbase trades ${symbol} on its ${alias} book: the history is that book's` } : got;
          }
          if (id === "okx") return hold(hosts.hold("okx", await okxHistory(hist, id, own ?? okxInstrument(`${base}/${quote}`)!, interval, w)));
          if (id === "kraken") return krakenHistory(x, symbol, base, quote, interval, w);
          if (!x.fetchOHLCV) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${name} has no price history the library can read` });
          const native = libraryNative(x as ExchangeClient & { fetchOHLCV: NonNullable<ExchangeClient["fetchOHLCV"]> }, interval, MONDAY_WEEKS.has(id));
          if (!native) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${name} keeps no ${interval} bars` });
          const lib = { fetchOHLCV: (sym: string, tf: string, since: number, limit: number) => x.fetchOHLCV!(sym, tf, since, limit), timeframes: x.timeframes };
          return hold(await libraryHistory(lib, { name, symbol, inCoin: true, pageBars: id === "binance" ? 1_000 : 300, clock, no: (err) => exchangeNo(id, name, err) }, interval, native, w));
        } catch (err) {
          reload = true;
          return hold(exchangeNo(id, name, err));
        }
      });
    },
    /** fetchOrderBook, keyless: only for a pair the exchange lists, asked for 20 or 100 levels (every one of the five takes either; Binance
     * takes no 50, KuCoin only 20 or 100) and cut to the depth asked, best first; the sizes in the coin */
    book: (symbol, depth) => {
      const d = countOf(depth, BOOK_DEPTH_MAX, 20);
      const back = heldBack();
      return back ? Promise.resolve(back) : books(`${symbol}|${d}`, async () => {
        try {
          const x = await pairAt(symbol);
          if (isRefusal(x)) return x;
          if (!can(x, "fetchOrderBook")) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${name} has no order book the library can read` });
          const asked = d <= 20 ? 20 : 100;
          const raw = rec(await x.fetchOrderBook!(symbol, asked));
          const bids = list(raw.bids).map(pairOf);
          const asks = list(raw.asks).map(pairOf);
          return { bids: sideOf(bids, "bids", d), asks: sideOf(asks, "asks", d), at: stampOf(raw.timestamp, clock()), from: name, depth: "full", more: { bids: goesOn(bids, d, pos, asked), asks: goesOn(asks, d, pos, asked) } };
        } catch (err) {
          staleMaybe();
          return hold(exchangeNo(id, name, err));
        }
      });
    },
    /** fetchTrades, keyless: the latest trades of a pair the exchange lists, newest first, the size in the coin; the side only where the
     * exchange says it is the taker's (TAKER_SIDE) */
    trades: (symbol, limit) => {
      const n = countOf(limit, TRADES_MAX, 30);
      const back = heldBack();
      return back ? Promise.resolve(back) : tape(`${symbol}|${n}`, async () => {
        try {
          const x = await pairAt(symbol);
          if (isRefusal(x)) return x;
          if (!can(x, "fetchTrades")) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${name} has no trades the library can read` });
          // Bybit's spot trades come sixty at a time at most (v5 Get Public Recent Trading History: limit 1–60 for spot)
          const rows = await x.fetchTrades!(symbol, undefined, id === "bybit" ? Math.min(n, 60) : n);
          return newestFirst(tradesOf(rows, TAKER_SIDE.has(id), clock()), n);
        } catch (err) {
          staleMaybe();
          return hold(exchangeNo(id, name, err));
        }
      });
    },
  };
  /** A KRAKEN PAIR'S HISTORY (see the top of this file). Kraken's own OHLC keeps only its latest 720 bars, so a chart is drawn from the venue
   * with deep history that trades the pair — a dollar pair from Coinbase Exchange where it trades that product now (GET /products/{id}: a
   * delisted product answers its candles empty, 200 [], ENJ-USD, GALA-USD and JUP-USD on 2026-10-17), a USDT or USDC pair from OKX — named
   * on the page. A first view falls back to Kraken's own latest bars, said why, where that venue does not trade the pair, answers no bar of
   * it near the window's end, refuses, or is held back; a page scrolled left stays with the venue of the series (one venue for a whole
   * series: Kraken's own first view says where its 720 end, and is never paged). The other venue's refusal is its own: it holds back that
   * host's histories (hostHolds), and is passed on scoped to it (`detail.scope`), so it holds back nothing of Kraken's. Where the venue's own
   * bars alone are asked (CandleWindow.own: the paper account's time asleep), Kraken's own, always */
  async function krakenHistory(x: ExchangeClient, symbol: string, base: string, quote: string, interval: CandleInterval, w: CandleWindow): Promise<CandlePage | Refusal> {
    if (w.own) return krakenLatest(x, name, symbol, interval, w, clock());
    const dollars = quote === "USD";
    const host: HistoryHost = dollars ? "coinbase" : "okx";
    const deepName = dollars ? COINBASE_EXCHANGE_NAME : "OKX";
    const market = dollars ? `${base}-USD` : `${base}-${quote}`;
    const page = w.since === undefined;
    const scoped = (r: Refusal): Refusal => ({ ...r, detail: { ...(r.detail as Record<string, unknown> | undefined), scope: `${deepName}'s history` } });
    const fallBack = (why: string): Promise<CandlePage | Refusal> => krakenLatest(x, name, symbol, interval, w, clock(), why);
    const held = hosts.heldOf(host);
    if (held) return page ? scoped(held) : fallBack(`${deepName} is not asked just now: ${held.message}`);
    if (dollars) {
      const trades = hosts.hold(host, await online(market, () => coinbaseOnline(hist, id, market)));
      if (isRefusal(trades)) return page ? scoped(trades) : fallBack(`${deepName} did not say whether it trades ${market}: ${trades.message}`);
      if (trades === "unlisted") return fallBack(`no venue with a longer history lists ${symbol}`);
      if (trades === "offline") return fallBack(`${deepName} no longer trades ${market}`);
    }
    const deep = hosts.hold(host, dollars ? await coinbaseHistory(hist, id, market, interval, w) : await okxHistory(hist, id, market, interval, w));
    if (isRefusal(deep)) {
      if (deep.code === "E_VENUE_REJECTED" && !hosts.heldOf(host)) return fallBack(`no venue with a longer history lists ${symbol}`);
      return page ? scoped(deep) : fallBack(`${deepName} did not answer: ${deep.message}`);
    }
    if (page) return deep;
    // a first view whose deep venue has no bar of the pair near the window's end (a quiet product, a market gone quiet): Kraken's own
    const end = Math.min(clock(), w.until ?? Number.POSITIVE_INFINITY);
    const newest = deep.bars[deep.bars.length - 1]?.t;
    if (newest === undefined || newest < end - 300 * INTERVAL_MS[interval]) return fallBack(`${deepName} has no recent ${market} bars`);
    return deep;
  }

  /** the keyless client, with its markets loaded, for a pair it lists priced in dollars; or why not. A load of the markets that fails is
   * loaded afresh next time (the library would answer the failure again) */
  async function pairAt(symbol: string): Promise<BookClient | Refusal> {
    const x = (await keylessSpot(id, open)) as BookClient | undefined;
    if (!x) return no("E_WALLET_UNKNOWN_VENUE", { venue: id, message: `the exchange library knows no exchange called "${id}"` });
    try {
      await x.loadMarkets?.(reload);
    } catch (err) {
      reload = true;
      throw err;
    }
    reload = false;
    const m = x.markets?.[symbol] as CcxtMarket | undefined;
    if (!m || m.spot === false || !inDollars(str(m.quote) ?? "")) return no("E_VENUE_REJECTED", { venue: id, message: `${name} lists no market ${symbol.slice(0, 40)} priced in dollars` });
    return x;
  }
}

/** KRAKEN'S OWN LATEST BARS, where no venue with deep history charts the pair (krakenHistory, `why` says why) and where Kraken's own alone
 * are asked: one fetchOHLCV with no start — Kraken answers its latest 720 bars whatever start is asked, and nothing older
 * (history-sources.md) — a size it lacks folded from a finer one, and its week always from its days (its own 10080 starts on Thursday:
 * libraryNative), Monday weeks. The bars in the window asked; the page says that Kraken's history ends at its first bar only where the window
 * starts before it, and why the longer history was not drawn */
async function krakenLatest(x: ExchangeClient, name: string, symbol: string, interval: CandleInterval, w: CandleWindow, now: number, why?: string): Promise<CandlePage | Refusal> {
  if (!x.fetchOHLCV) return no("E_VENUE_RAIL_CLOSED", { venue: "kraken", message: `${name} has no price history the library can read` });
  const native = libraryNative(x as ExchangeClient & { fetchOHLCV: NonNullable<ExchangeClient["fetchOHLCV"]> }, interval, MONDAY_WEEKS.has("kraken"));
  if (!native) return no("E_VENUE_RAIL_CLOSED", { venue: "kraken", message: `${name} keeps no ${interval} bars` });
  const rows = await x.fetchOHLCV(symbol, native, undefined, 720);
  const all: Candle[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r)) continue;
    const [t, o, h, l, c, v] = [fin(r[0]), pos(r[1]), pos(r[2]), pos(r[3]), pos(r[4]), nonNeg(r[5])];
    if (t === undefined || o === undefined || h === undefined || l === undefined || c === undefined) continue;
    all.push({ t, o, h, l, c, ...(v !== undefined ? { v } : {}) });
  }
  all.sort((a, b) => a.t - b.t);
  const folded = native !== interval;
  const G = INTERVAL_MS[interval];
  const whole = (t: number): number => (barStart(t, interval) === t ? t : barStart(t, interval) + G);
  const out = folded ? foldBars(all, interval, "utc", all[0] ? whole(all[0].t) : 0) : all;
  // the window asked: from its start (a page scrolled left, its `limit` bars before its end) to its end
  const until = w.until ?? Number.POSITIVE_INFINITY;
  const start = w.since ?? Math.min(until, now) - limitOf(w) * G;
  const bars = out.filter((b) => b.t >= (w.since ?? Number.NEGATIVE_INFINITY) && b.t < until);
  // Kraken's latest 720 do not reach back to the window's start: its history at this size ends at its first bar
  const short = !all.length || all[0]!.t > start;
  const ends = short ? `Kraken keeps only the latest 720 bars at this size${why ? `, and ${why}` : ""}` : undefined;
  return { bars, more: false, ...(ends ? { ends } : {}), ...(why && !ends ? { note: `Kraken's own latest bars: ${why}` } : {}), source: `${name} · ${symbol}`, ...(folded ? { folded: `${INTERVAL_WORDS[interval]} bars folded from Kraken's ${INTERVAL_WORDS[native]} bars${interval === "1w" ? " (weeks from Monday, UTC; its own weeks start on Thursday)" : ""}` } : {}) };
}

/** what reads a book and trades through the library, beyond what exchange.ts names: the book as {bids, asks: [[price, amount, …]],
 * timestamp}, the trades as [{timestamp, price, amount, side}], oldest first */
type BookClient = ExchangeClient & {
  fetchOrderBook?(symbol: string, limit?: number, params?: Record<string, unknown>): Promise<unknown>;
  fetchTrades?(symbol: string, since?: number, limit?: number, params?: Record<string, unknown>): Promise<unknown[]>;
};
/** the client has the call, and the library says the exchange has it */
const can = (x: BookClient, m: "fetchOrderBook" | "fetchTrades"): boolean => typeof x[m] === "function" && (x.has === undefined || Boolean(x.has[m]));
/** the exchanges whose trade side is the TAKER's, by their own docs (see the top of this file): Coinbase's is not said */
const TAKER_SIDE = new Set(["kraken", "okx", "binance", "bybit"]);
/** the library's trades as the account's: a price and a size above nothing and a time, the side where `sided` */
export function tradesOf(rows: unknown, sided: boolean, now: number): Array<PublicTrade & { i: number }> {
  const out: Array<PublicTrade & { i: number }> = [];
  list(rows).forEach((r, i) => {
    const t = rec(r);
    const price = pos(t.price);
    const size = pos(t.amount);
    const ms = pos(t.timestamp);
    if (price === undefined || size === undefined || ms === undefined) return;
    const side = sided && (t.side === "buy" || t.side === "sell") ? t.side : undefined;
    out.push({ price, size, ...(side ? { side } : {}), at: stampOf(ms, now), i });
  });
  return out;
}

// ---- Kalshi ---------------------------------------------------------------------------------------------------

/** a market Kalshi trades now: active, priced in dollars, not a combo (multivariate event) */
const kalshiLive = (m: Rec): boolean => m.status === "active" && typeof m.ticker === "string" && !m.ticker.startsWith("KXMVE") && ["yes_bid_dollars", "yes_ask_dollars", "last_price_dollars"].some((k) => typeof m[k] === "string");
/** the busier market first: by its 24-hour contracts, then all its contracts, then the nearer close */
const kalshiBusier = (a: Rec, b: Rec): number => (nonNeg(b.volume_24h_fp) ?? 0) - (nonNeg(a.volume_24h_fp) ?? 0) || (nonNeg(b.volume_fp) ?? 0) - (nonNeg(a.volume_fp) ?? 0) || whenMs(a.close_time) - whenMs(b.close_time);
/** Kalshi writes emphasis into some titles ("Will **real GDP** increase by more than 3.5%…"): the stars are markdown, not words */
const unstarred = (s: string | undefined): string | undefined => s?.replace(/\*\*/g, "");
/** how many of a series' open events are read: the nearest few (Kalshi lists them soonest first; the Fed has eleven meetings open, the
 * bitcoin ladder three) */
const SERIES_EVENTS = 6;

/** one of a series' open events, with its markets, as GET /events?with_nested_markets=true answers it */
interface KalshiOpenEvent {
  series: string;
  /** how Kalshi files the series itself, where KALSHI_SERIES carries it (the IPO series: "IPOs", "Companies") */
  tags?: readonly string[] | undefined;
  ticker: string;
  title?: string | undefined;
  category?: string | undefined;
  markets: Rec[];
  /** its markets' 24-hour contracts, summed */
  contracts: number;
  /** when its first market closes */
  closeMs: number;
}

/** one Kalshi market as its two legs, in the names the account's Kalshi trader gives them (`<ticker>:YES`, `<ticker>:NO`). The legs carry
 * the event's category and, where KALSHI_SERIES carries them, Kalshi's own tags for the series, and read the word the table prefers among
 * those (the IPO series: "IPOs" before Companies); a series without tags reads the event's category as it is */
function kalshiLegs(m: Rec, ev: Pick<KalshiOpenEvent, "ticker" | "title" | "category" | "tags">): Listing[] {
  const ticker = String(m.ticker).toUpperCase();
  const title = unstarred(str(m.title)) ?? "";
  const sub = unstarred(str(m.yes_sub_title)) ?? "";
  const words = title ? (sub && !title.includes(sub) ? `${title} (${sub})` : title) : sub || ticker;
  const lastYes = px(m.last_price_dollars);
  const before = px(m.previous_price_dollars);
  const moved = lastYes !== undefined && before !== undefined ? round(lastYes - before, 4) : undefined;
  const tags = [...new Set([...(ev.category ? [ev.category] : []), ...(ev.tags ?? [])])];
  const category = ev.tags?.length ? (categoryOf(tags) ?? ev.category) : ev.category;
  return (["YES", "NO"] as const).map((outcome): Listing => {
    const yes = outcome === "YES";
    const bid = px(yes ? m.yes_bid_dollars : m.no_bid_dollars);
    const ask = px(yes ? m.yes_ask_dollars : m.no_ask_dollars);
    // every trade is a YES and a NO at prices that make a dollar: the NO leg's last price is the other side of the YES leg's
    const last = lastYes === undefined ? undefined : yes ? lastYes : round(1 - lastYes, 4);
    return {
      symbol: `${ticker}:${outcome}`,
      name: `${words} · ${yes ? "Yes" : "No"}`,
      kind: "event",
      base: `${ticker}:${outcome}`,
      quote: "USD",
      price: last ?? mid(bid, ask),
      bid,
      ask,
      open: m.status === "active",
      types: [],
      group: { id: ticker, title: words },
      outcome,
      ...(str(m.close_time) ? { closeTime: str(m.close_time) } : {}),
      ...(category ? { category } : {}),
      ...(tags.length ? { tags } : {}),
      ...(moved !== undefined ? { change24h: yes ? moved : -moved } : {}),
      ...(nonNeg(m.volume_24h_fp) !== undefined ? { contracts24h: nonNeg(m.volume_24h_fp) } : {}),
      ...(ev.title ? { event: { id: ev.ticker, title: ev.title, ...(sub ? { market: sub } : {}) } } : {}),
    };
  });
}

/** Kalshi's busiest markets, keyless, one for each series in KALSHI_SERIES (see the top of this file): the busiest market of the series'
 * busiest open event, with the event's title and category. A search reaches every market of every event read */
export function kalshiPublic(deps: PublicDeps = {}): PublicSource {
  const id = "kalshi";
  const name = "Kalshi";
  const clock = deps.clock ?? Date.now;
  const get = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock);
  const bookGet = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, BOOK_MS);
  const tapeGet = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, TRADES_MS);
  /** every series' open events with their markets, from the kept bodies: one small request a series, kept KEEP_MS. A series that refuses
   * is left out while the others answer; only when every one refuses is the refusal the answer */
  const load = async (): Promise<{ events: KalshiOpenEvent[]; refused?: Refusal | undefined }> => {
    const bodies = await Promise.all(KALSHI_SERIES.map((s) => get(`${KALSHI}/events?series_ticker=${encodeURIComponent(s.ticker)}&status=open&with_nested_markets=true&limit=${SERIES_EVENTS}`)));
    const events: KalshiOpenEvent[] = [];
    let refused: Refusal | undefined;
    bodies.forEach((body, i) => {
      if (isRefusal(body)) {
        refused ??= body;
        return;
      }
      for (const e of list(rec(body).events).filter(isRec)) {
        const ticker = str(e.event_ticker);
        const markets = list(e.markets).filter(isRec).filter(kalshiLive);
        if (!ticker || !markets.length) continue;
        events.push({ series: KALSHI_SERIES[i]!.ticker, tags: KALSHI_SERIES[i]!.tags, ticker: ticker.toUpperCase(), title: unstarred(str(e.title)), category: str(e.category), markets, contracts: markets.reduce((s, m) => s + (nonNeg(m.volume_24h_fp) ?? 0), 0), closeMs: Math.min(...markets.map((m) => whenMs(m.close_time))) });
      }
    });
    return { events, refused };
  };
  /** the one market shown for a series: the busiest market of its busiest event — the event whose markets traded the most contracts in 24
   * hours, the nearest to close among events that did not trade (Kalshi lists a series' far meetings too, with nothing traded in them) */
  const picks = (events: KalshiOpenEvent[]): Array<{ m: Rec; ev: KalshiOpenEvent }> =>
    KALSHI_SERIES.flatMap((s) => {
      const ev = events.filter((e) => e.series === s.ticker).sort((a, b) => b.contracts - a.contracts || a.closeMs - b.closeMs)[0];
      return ev ? [{ m: [...ev.markets].sort(kalshiBusier)[0]!, ev }] : [];
    });
  const read = async (o: { q?: string | undefined; category?: string | undefined; closingWithinMs?: number | undefined; limit: number }): Promise<Listing[] | Refusal> => {
    const { events, refused } = await load();
    if (!events.length && refused) return refused;
    const Q = (o.q ?? "").trim().toUpperCase();
    const want = o.category?.trim().toLowerCase();
    const window = pos(o.closingWithinMs);
    const now = clock();
    const pool = Q ? events.flatMap((ev) => ev.markets.filter((m) => has(Q, m.ticker, unstarred(str(m.title)), unstarred(str(m.yes_sub_title)), ev.ticker, ev.title)).map((m) => ({ m, ev }))) : picks(events);
    return pool
      .filter(({ ev }) => !want || ev.category?.toLowerCase() === want)
      .filter(({ m }) => !window || (whenMs(m.close_time) > now && whenMs(m.close_time) <= now + window))
      .sort((a, b) => kalshiBusier(a.m, b.m))
      .slice(0, Math.max(1, o.limit))
      .flatMap(({ m, ev }) => readLike(kalshiLegs(m, ev), m));
  };
  return {
    id,
    name,
    reset: () => {
      get.clear();
      bookGet.clear();
      tapeGet.clear();
    },
    kind: "events",
    connectTo: "kalshi",
    connector: "live:kalshi",
    listings: (o) => read(o),
    events: (o) => read(o),
    /** a leg's book, keyless (see the top of this file): Kalshi's book holds bids only — the YES bids and the NO bids — and a bid on one
     * outcome is an offer of the other at 1 − its price. So a YES leg's bids are the YES bids and its asks the NO bids at 1 − their price;
     * a NO leg's bids are the NO bids and its asks the YES bids so. The sizes are contracts */
    async book(symbol, depth) {
      const k = /^([A-Za-z0-9][A-Za-z0-9._-]{0,80}):(YES|NO)$/i.exec(symbol.trim());
      if (!k) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Kalshi market here is <ticker>:YES or <ticker>:NO, not "${symbol.slice(0, 40)}"` });
      const ticker = k[1]!.toUpperCase();
      const yes = k[2]!.toUpperCase() === "YES";
      const d = countOf(depth, BOOK_DEPTH_MAX, 20);
      const body = await bookGet(`${KALSHI}/markets/${encodeURIComponent(ticker)}/orderbook?depth=${d}`);
      if (isRefusal(body)) return body;
      const ob = rec(body).orderbook_fp;
      if (!isRec(ob)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without a book for ${ticker}` });
      const yesBids = list(ob.yes_dollars).map(pairOf);
      const noBids = list(ob.no_dollars).map(pairOf);
      const [own, other] = yes ? [yesBids, noBids] : [noBids, yesBids];
      // `depth` levels a side were asked for: a side that came back that long may go on
      return { bids: sideOf(own, "bids", d, px), asks: sideOf(other, "asks", d, otherSide), at: new Date(clock()).toISOString(), from: name, depth: "full", more: { bids: goesOn(own, d, px, d), asks: goesOn(other, d, otherSide, d) } };
    },
    /** a leg's latest trades, keyless: each trade is a YES and a NO at prices that make a dollar — the YES leg's at yes_price_dollars, the NO
     * leg's at no_price_dollars — in contracts (count_fp); a buy of this leg when the taker bought this outcome (taker_outcome_side, which
     * Kalshi names in place of taker_side) */
    async trades(symbol, limit) {
      const k = /^([A-Za-z0-9][A-Za-z0-9._-]{0,80}):(YES|NO)$/i.exec(symbol.trim());
      if (!k) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Kalshi market here is <ticker>:YES or <ticker>:NO, not "${symbol.slice(0, 40)}"` });
      const ticker = k[1]!.toUpperCase();
      const yes = k[2]!.toUpperCase() === "YES";
      const n = countOf(limit, TRADES_MAX, 30);
      const body = await tapeGet(`${KALSHI}/markets/trades?ticker=${encodeURIComponent(ticker)}&limit=${n}`);
      if (isRefusal(body)) return body;
      const out: Array<PublicTrade & { i: number }> = [];
      list(rec(body).trades).forEach((r, i) => {
        const t = rec(r);
        if (str(t.ticker) !== undefined && str(t.ticker)!.toUpperCase() !== ticker) return;
        const price = yes ? px(t.yes_price_dollars) : (px(t.no_price_dollars) ?? otherSide(t.yes_price_dollars));
        const size = pos(t.count_fp);
        const when = Date.parse(str(t.created_time) ?? "");
        if (price === undefined || size === undefined || !Number.isFinite(when)) return;
        const took = (str(t.taker_outcome_side) ?? str(t.taker_side))?.toLowerCase();
        const side = took === "yes" ? (yes ? "buy" : "sell") : took === "no" ? (yes ? "sell" : "buy") : undefined;
        out.push({ price, size, ...(side ? { side } : {}), at: new Date(when).toISOString(), i: -i });
      });
      // Kalshi lists the newest first: among trades of one moment, its own order stands
      return newestFirst(out, n);
    },
    /** whether a market has settled, keyless (see the top of this file): GET /markets/{ticker} — a market with a result (yes | no) pays
     * $1 a contract to that side and nothing to the other, whatever its status word; one closed without a result is closed */
    async settlement(symbol) {
      const k = /^([A-Za-z0-9][A-Za-z0-9._-]{0,80}):(YES|NO)$/i.exec(symbol.trim());
      if (!k) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Kalshi market here is <ticker>:YES or <ticker>:NO, not "${symbol.slice(0, 40)}"` });
      const ticker = k[1]!.toUpperCase();
      const body = await get(`${KALSHI}/markets/${encodeURIComponent(ticker)}`);
      if (isRefusal(body)) return body;
      const m = rec(rec(body).market);
      if (!str(m.ticker)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} has no market ${ticker}` });
      const result = str(m.result)?.toLowerCase();
      if (result === "yes" || result === "no") return { settled: true, payout: result === k[2]!.toLowerCase() ? 1 : 0, ...(str(m.settlement_ts) ? { at: str(m.settlement_ts) } : {}) };
      const status = str(m.status)?.toLowerCase();
      return { settled: false, ...(status && status !== "active" && status !== "open" && status !== "initialized" ? { closed: true } : {}) };
    },
    // the finance series in one sentence (as before), the series Kalshi files under its own tags — the IPO ones — in a second, each under 160
    notes: () => {
      const plain = KALSHI_SERIES.filter((s) => !s.tags?.length);
      const tagged = KALSHI_SERIES.filter((s) => s.tags?.length);
      return [`Kalshi: the busiest market in each of ${plain.length} series — ${plain.map((s) => s.word).join(", ")}.`, ...(tagged.length ? [`Kalshi: and ${tagged.map((s) => s.word).join(", ")} — the busiest market of each.`] : [])];
    },
    /** a market's price history, keyless (see the top of this file): `<ticker>:YES` or `<ticker>:NO`. A window one request does not hold
     * (Kalshi answers 9,999 periods at most, and no start of 0: live/kalshi.ts kalshiSpans) is asked from the market's open (its GET
     * /markets/{ticker}, kept as every answer here), in spans */
    async candles(symbol, interval, w) {
      const now = clock();
      const bad = badHistory(id, interval, w, now);
      if (bad) return bad;
      const k = /^([A-Za-z0-9][A-Za-z0-9._-]{0,80}):(YES|NO)$/i.exec(symbol.trim());
      if (!k) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Kalshi market here is <ticker>:YES or <ticker>:NO, not "${symbol.slice(0, 40)}"` });
      const ticker = k[1]!.toUpperCase();
      const yes = k[2]!.toUpperCase() === "YES";
      const period = KALSHI_PERIOD[interval];
      const end = Math.min(now, w.until ?? now);
      const endTs = Math.floor(end / 60_000) * 60;
      let asked = kalshiSpans(interval, w, endTs);
      if (asked.wide) {
        const m = await get(`${KALSHI}/markets/${encodeURIComponent(ticker)}`);
        const open = isRefusal(m) ? NaN : Date.parse(str(rec(rec(m).market).open_time) ?? "");
        if (Number.isFinite(open)) asked = kalshiSpans(interval, w, endTs, open);
      }
      const sticks: Rec[] = [];
      let partial = false;
      for (const [i, sp] of asked.spans.entries()) {
        const body = await get(`${KALSHI}/markets/candlesticks?market_tickers=${encodeURIComponent(ticker)}&start_ts=${sp.start}&end_ts=${sp.end}&period_interval=${period}`);
        if (isRefusal(body)) {
          if (i === 0) return body;
          partial = true;
          break;
        }
        const row = list(rec(body).markets).filter(isRec).find((x) => String(x.market_ticker ?? "").toUpperCase() === ticker);
        if (!row) {
          if (i === 0) return no("E_VENUE_REJECTED", { venue: id, message: `${name} has no market ${ticker}` });
          break;
        }
        sticks.push(...list(row.candlesticks).filter(isRec));
      }
      // a size Kalshi does not keep is folded from the one it does: 5m and 15m from minutes, 4h from hours, a week (from Monday) from days
      const fold = period * 60_000 !== INTERVAL_MS[interval];
      const bars = new Map<number, Candle>();
      for (const c of sticks.sort((a, b) => (fin(a.end_period_ts) ?? 0) - (fin(b.end_period_ts) ?? 0))) {
        const p = rec(c.price);
        const [yo, yh, yl, yc] = [fin(p.open_dollars), fin(p.high_dollars), fin(p.low_dollars), fin(p.close_dollars)];
        const stop = fin(c.end_period_ts);
        if (yo === undefined || yh === undefined || yl === undefined || yc === undefined || stop === undefined || !(stop > 0)) continue;
        const [o, h, l, cl] = yes ? [yo, yh, yl, yc] : [round(1 - yo, 4), round(1 - yl, 4), round(1 - yh, 4), round(1 - yc, 4)];
        const v = nonNeg(c.volume_fp);
        const start = (stop - period * 60) * 1000;
        const t = fold ? barStart(start, interval) : start;
        const b = bars.get(t);
        if (!b) bars.set(t, { t, o, h, l, c: cl, ...(v !== undefined ? { v } : {}) });
        else {
          b.h = Math.max(b.h, h);
          b.l = Math.min(b.l, l);
          b.c = cl;
          if (v !== undefined) b.v = round((b.v ?? 0) + v, 2);
        }
      }
      return kalshiPage([...bars.values()], asked, w, partial, `${name}'s ${ticker}`);
    },
  };
}

/** Kalshi keeps candles of 1, 60 and 1440 minutes: every other size is folded from the finer one it keeps (live/kalshi.ts PERIOD_MIN) */
const KALSHI_PERIOD = PERIOD_MIN;

// ---- Polymarket -----------------------------------------------------------------------------------------------

/** Gamma's tag id for Sports, read 2026-10-06 from the tags its events carry (every sports and esports event carries it): Gamma is asked
 * to leave those events out of its answer, so that the twenty events read are twenty that may be shown. The table in categories.ts is
 * still what decides what is left out */
const GAMMA_SPORTS_TAG = 1;
/** how many events Gamma's own search answers for a few words (limit_per_type; 126 matched "anthropic" on 2026-10-13, ten answered in
 * 306 KB with every market of each) */
const GAMMA_SEARCH = 10;
/** how many of Gamma's busiest events are read, and how many of them are shown */
const GAMMA_EVENTS = 20;
const POLYMARKET_SHOWN = 10;
/** Gamma's tag slug for its IPO questions ("Anthropic IPO by __?", "Anthropic IPO Closing Market Cap", "What will OpenAI's IPO valuation
 * be?" on 2026-10-06, $40,704, $20,837 and $4,249 a day — too quiet for the twenty busiest, so they are asked for by tag): how many are read,
 * and how many shown beside the ten */
const GAMMA_IPO_TAG = "ipo";
const GAMMA_IPO_EVENTS = 5;
const POLYMARKET_IPO_SHOWN = 3;
/** an hourly or shorter "Up or Down" market — "Bitcoin Up or Down - October 6, 1PM ET", tagged 1H, 4H or 15M (2026-10-06) — is noise beside
 * the day's ("Bitcoin Up or Down on October 5?"), which stays */
const hourlyUpDown = (title: string, tags: readonly string[]): boolean => /up or down/i.test(title) && (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(title) || tags.some((t) => /^\d+ ?[mh]$/.test(normalWords(t))));
const polymarketBusier = (a: Rec, b: Rec): number => (nonNeg(b.volume24hr) ?? 0) - (nonNeg(a.volume24hr) ?? 0);

/** one of Gamma's events that may be shown, with its open markets and its own 24-hour dollars (what Gamma orders events by) */
interface GammaEvent {
  e: Rec;
  tags: string[];
  markets: Rec[];
  volume: number;
  /** an IPO question, by its tags (whichever read listed it): shown among the few IPO rows, not the ten busiest */
  ipo: boolean;
}
/** the hotter question first: the event's dollars, then the market's */
const hotterFirst = (a: { m: Rec; ev: GammaEvent }, b: { m: Rec; ev: GammaEvent }): number => b.ev.volume - a.ev.volume || polymarketBusier(a.m, b.m);

/** one Gamma market as its outcomes, in the names the account's Polymarket trader gives them (`<slug>:<outcome>`) */
function polymarketLegs(m: Rec, e: Rec, tags: string[]): Listing[] {
  const slug = str(m.slug);
  const conditionId = str(m.conditionId);
  const names = list(m.outcomes).map((x) => String(x));
  if (!slug || !conditionId || names.length < 2) return [];
  const prices = list(m.outcomePrices).map(fin);
  const question = str(m.question) ?? slug;
  const why = m.closed === true ? "the market is closed" : m.archived === true ? "the market is archived" : m.active !== true ? "the market is not active" : m.enableOrderBook !== true ? "the market has no order book" : m.acceptingOrders !== true ? "Polymarket is not taking orders in it now" : undefined;
  const closeTime = str(m.endDate) ?? str(e.endDate);
  const category = categoryOf([str(e.category), ...tags]);
  const volume = nonNeg(m.volume24hr);
  const eventVolume = nonNeg(e.volume24hr);
  const eventId = str(e.id) ?? (typeof e.id === "number" ? String(e.id) : undefined);
  // the market's own name inside its event ("October 12" in "US-Iran ceasefire continues through...?"), where the event holds several
  const short = str(m.groupItemTitle);
  // its picture: the market's own (a candidate's), else its event's
  const image = str(m.icon) ?? str(e.icon);
  return names.map((outcome, i): Listing => {
    const p = prices[i];
    const first = i === 0;
    return {
      symbol: `${slug}:${outcome}`,
      name: `${question} · ${outcome}`,
      kind: "event",
      base: outcome,
      quote: "pUSD",
      price: p !== undefined && p >= 0 && p <= 1 ? p : undefined,
      // Gamma's best bid and ask, and its day's change, are the first outcome's
      bid: first ? px(m.bestBid) : undefined,
      ask: first ? px(m.bestAsk) : undefined,
      open: why === undefined,
      ...(why ? { note: why } : {}),
      types: [],
      group: { id: conditionId, title: question },
      outcome,
      ...(closeTime ? { closeTime } : {}),
      ...(category ? { category } : {}),
      ...(tags.length ? { tags } : {}),
      ...(first && fin(m.oneDayPriceChange) !== undefined ? { change24h: fin(m.oneDayPriceChange) } : {}),
      ...(volume !== undefined ? { volumeUsd24h: volume } : {}),
      ...(eventVolume !== undefined ? { eventVolumeUsd24h: eventVolume } : {}),
      ...(eventId && str(e.title) ? { event: { id: eventId, title: str(e.title)!, ...(short ? { market: short } : {}) } } : {}),
      ...(image ? { image } : {}),
    };
  });
}

/** Polymarket's busiest events, keyless, through Gamma (see the top of this file): the ten busiest by 24-hour volume that are not sports,
 * weather, entertainment or the like, each as its busiest market. A search reaches every market of every event read */
export function polymarketPublic(deps: PublicDeps = {}): PublicSource {
  const id = "polymarket";
  const name = "Polymarket";
  const clock = deps.clock ?? Date.now;
  const get = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock);
  const clob = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, HISTORY_MS);
  const clobBook = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, BOOK_MS);
  const tape = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, TRADES_MS);
  /** an outcome's own token on the CLOB, the other outcome's (a market of two), and its market's condition id, from Gamma's market by slug
   * (kept KEEP_MS): `<slug>:<outcome>` as the listing names it, or why not */
  const tokenOf = async (symbol: string): Promise<{ token: string; other?: string | undefined; conditionId: string } | Refusal> => {
    const i = symbol.indexOf(":");
    const slug = i > 0 ? symbol.slice(0, i).trim() : "";
    const outcome = i > 0 ? symbol.slice(i + 1).trim() : "";
    if (!/^[a-z0-9][a-z0-9-]{0,200}$/.test(slug) || !outcome || outcome.length > 80) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Polymarket market here is <slug>:<outcome>, not "${symbol.slice(0, 40)}"` });
    const m = await get(`${GAMMA}/markets/slug/${encodeURIComponent(slug)}`);
    if (isRefusal(m)) return m;
    const names = list(rec(m).outcomes).map((x) => String(x));
    const tokens = list(rec(m).clobTokenIds).map((x) => String(x));
    const at = names.findIndex((n) => n.toLowerCase() === outcome.toLowerCase());
    const token = at >= 0 ? tokens[at] : undefined;
    const conditionId = str(rec(m).conditionId) ?? "";
    if (!token || !/^\d{1,90}$/.test(token)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} has no outcome "${outcome.slice(0, 40)}" in ${slug.slice(0, 60)}` });
    const other = tokens.length === 2 && names.length === 2 ? tokens[1 - at] : undefined;
    return { token, ...(other && /^\d{1,90}$/.test(other) ? { other } : {}), conditionId };
  };
  /** the events of one Gamma answer that may be shown: not filed under an excluded word, not an hourly up-or-down, with an open market */
  const parse = (body: unknown): GammaEvent[] | Refusal => {
    if (isRefusal(body)) return body;
    if (!Array.isArray(body)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without its events` });
    const out: GammaEvent[] = [];
    for (const e of body.filter(isRec)) {
      const tagList = list(e.tags).filter(isRec);
      const tags = [...new Set([...tagList.map((t) => str(t.label)), ...tagList.map((t) => str(t.slug))].filter((t): t is string => t !== undefined))];
      if (isExcludedCategory([str(e.category), ...tags]) || hourlyUpDown(str(e.title) ?? "", tags)) continue;
      const markets = list(e.markets).filter(isRec).filter((m) => m.closed !== true && m.active === true);
      if (!markets.length) continue;
      out.push({ e, tags, markets, volume: nonNeg(e.volume24hr) ?? 0, ipo: isIpoCategory([str(e.category), ...tags]) });
    }
    return out;
  };
  /** the busiest events and the IPO questions, from the two kept bodies, an event once (by Gamma's id). One read refusing while the other
   * answers leaves the other's events standing; both refusing is the refusal */
  const load = async (): Promise<GammaEvent[] | Refusal> => {
    const [busiest, ipo] = await Promise.all([
      get(`${GAMMA}/events?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=${GAMMA_EVENTS}&exclude_tag_id=${GAMMA_SPORTS_TAG}`).then(parse),
      get(`${GAMMA}/events?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=${GAMMA_IPO_EVENTS}&tag_slug=${GAMMA_IPO_TAG}`).then(parse),
    ]);
    if (isRefusal(busiest) && isRefusal(ipo)) return busiest;
    const seen = new Set<string>();
    return [...(isRefusal(busiest) ? [] : busiest), ...(isRefusal(ipo) ? [] : ipo)].filter((ev) => {
      const key = str(ev.e.id) ?? (typeof ev.e.id === "number" ? String(ev.e.id) : str(ev.e.slug) ?? "");
      return !seen.has(key) && seen.add(key) !== undefined;
    });
  };
  /** Gamma's own search, keyless (see the top of this file): the events it finds for the words, with their markets — every market Polymarket
   * lists is within reach of it, not only the twenty busiest events kept. Read as the busiest are (parse); kept KEEP_MS by the words */
  const search = async (q: string): Promise<GammaEvent[] | Refusal> => {
    const body = await get(`${GAMMA}/public-search?q=${encodeURIComponent(q.slice(0, 80))}&events_status=active&limit_per_type=${GAMMA_SEARCH}`);
    if (isRefusal(body)) return body;
    return parse(list(rec(body).events));
  };
  const read = async (o: { q?: string | undefined; category?: string | undefined; closingWithinMs?: number | undefined; limit: number }): Promise<Listing[] | Refusal> => {
    const events = await load();
    const Q = (o.q ?? "").trim().toUpperCase();
    // a search: Gamma's own, beside the events kept — the kept ones answer alone when the search refuses, and the search alone when the
    // busiest refuse; both refusing is the refusal
    const found = Q ? await search(o.q!.trim()) : [];
    if (isRefusal(events) && (!Q || isRefusal(found))) return events;
    const kept = isRefusal(events) ? [] : events;
    const seen = new Set(kept.map((ev) => str(ev.e.id) ?? (typeof ev.e.id === "number" ? String(ev.e.id) : str(ev.e.slug) ?? "")));
    const all = [...kept, ...(isRefusal(found) ? [] : found).filter((ev) => !seen.has(str(ev.e.id) ?? (typeof ev.e.id === "number" ? String(ev.e.id) : str(ev.e.slug) ?? "")))];
    const want = o.category?.trim().toLowerCase();
    const window = pos(o.closingWithinMs);
    const now = clock();
    const busiest = (evs: GammaEvent[], n: number) => [...evs].sort((a, b) => b.volume - a.volume).slice(0, n);
    const pool: Array<{ m: Rec; ev: GammaEvent }> = Q
      ? all.flatMap((ev) => ev.markets.filter((m) => has(Q, m.question, m.slug, ev.e.title, ev.e.slug) || !kept.includes(ev)).map((m) => ({ m, ev })))
      : [...busiest(all.filter((ev) => !ev.ipo), POLYMARKET_SHOWN), ...busiest(all.filter((ev) => ev.ipo), POLYMARKET_IPO_SHOWN)].map((ev) => ({ m: [...ev.markets].sort(polymarketBusier)[0]!, ev }));
    return pool
      .filter(({ ev }) => !want || ev.tags.some((t) => t.toLowerCase() === want) || str(ev.e.category)?.toLowerCase() === want)
      .filter(({ m, ev }) => {
        if (!window) return true;
        const end = whenMs(m.endDate ?? ev.e.endDate);
        return end > now && end <= now + window;
      })
      .sort(hotterFirst)
      .slice(0, Math.max(1, o.limit))
      .flatMap(({ m, ev }) => readLike(polymarketLegs(m, ev.e, ev.tags), m));
  };
  return {
    id,
    name,
    reset: () => {
      get.clear();
      clob.clear();
      clobBook.clear();
      tape.clear();
    },
    kind: "events",
    connectTo: "polymarket",
    connector: "live:polymarket-trade",
    /** an outcome's own book on the CLOB, keyless (see the top of this file): its token's bids and asks, which the CLOB sends worst first,
     * put best first; the sizes in shares */
    async book(symbol, depth) {
      const d = countOf(depth, BOOK_DEPTH_MAX, 20);
      const t = await tokenOf(symbol);
      if (isRefusal(t)) return t;
      const body = await clobBook(`${CLOB}/book?token_id=${t.token}`);
      if (isRefusal(body)) return body;
      const b = rec(body);
      const level = (l: unknown): Level => [rec(l).price, rec(l).size];
      if (!Array.isArray(b.bids) && !Array.isArray(b.asks)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without a book for ${symbol.slice(0, 60)}` });
      const bids = list(b.bids).map(level);
      const asks = list(b.asks).map(level);
      // the CLOB sends the whole book: a side goes on only where it was cut to the depth here
      return { bids: sideOf(bids, "bids", d, px), asks: sideOf(asks, "asks", d, px), at: stampOf(b.timestamp, clock()), from: name, depth: "full", more: { bids: goesOn(bids, d, px), asks: goesOn(asks, d, px) } };
    },
    /** an outcome's latest trades, keyless, from Polymarket's Data API (see the top of this file): its market's latest taker fills — price,
     * size in shares, the taker's side, the time — and nothing of who made them. The CLOB's book is one book for both outcomes (live
     * 2026-10-14: a NO token's /book is its YES token's, mirrored, level for level), so a fill on the other outcome's token is a trade on this
     * one's too: at 1 − its price, the other side (a taker buying YES at 0.68 sells NO at 0.32), as a NO leg reads Kalshi's. Each taker's
     * fill is listed once, under the token it named: none is counted twice */
    async trades(symbol, limit) {
      const n = countOf(limit, TRADES_MAX, 30);
      const t = await tokenOf(symbol);
      if (isRefusal(t)) return t;
      if (!/^0x[0-9a-fA-F]{64}$/.test(t.conditionId)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} gave no market id for ${symbol.slice(0, 60)}` });
      const body = await tape(`${DATA_API}/trades?market=${t.conditionId}&limit=${n}&takerOnly=true`);
      if (isRefusal(body)) return body;
      if (!Array.isArray(body)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without its trades` });
      const out: Array<PublicTrade & { i: number }> = [];
      body.forEach((r, i) => {
        const x = rec(r);
        const asset = String(x.asset ?? "");
        const mine = asset === t.token;
        if (!mine && (t.other === undefined || asset !== t.other)) return;
        const p = px(x.price);
        const size = pos(x.size);
        const at = pos(x.timestamp);
        if (p === undefined || size === undefined || at === undefined) return;
        // the other outcome's price to ten places: its fills' prices run to ten (0.3004458835), and none is rounded past what it says
        const price = mine ? p : round(1 - p, 10);
        const took = x.side === "BUY" ? "buy" : x.side === "SELL" ? "sell" : undefined;
        const side = took && !mine ? (took === "buy" ? "sell" : "buy") : took;
        out.push({ price, size, ...(side ? { side } : {}), at: new Date(at * 1000).toISOString(), i: -i });
      });
      return newestFirst(out, n);
    },
    // the history is the CLOB's (clob.polymarket.com), the listings Gamma's: an edge refusing the one says nothing of the other
    historyApart: true,
    listings: (o) => read(o),
    events: (o) => read(o),
    notes: (o) => (o.q?.trim() ? ["Polymarket: its own search, which reaches every market it lists."] : [`Polymarket: its ${POLYMARKET_SHOWN} busiest events by 24-hour volume, without sports, esports, weather, entertainment, awards and mentions.`, `Polymarket: and its ${POLYMARKET_IPO_SHOWN} busiest IPO questions (its tag IPO).`]),
    /** whether a market has settled, keyless (see the top of this file): Gamma's market by slug — closed, and resolved by its oracle
     * (umaResolutionStatus "resolved"), pays each outcome its outcomePrices figure (1 to the side that won, 0 to the other) */
    async settlement(symbol) {
      const i = symbol.indexOf(":");
      const slug = i > 0 ? symbol.slice(0, i).trim() : "";
      const outcome = i > 0 ? symbol.slice(i + 1).trim() : "";
      if (!/^[a-z0-9][a-z0-9-]{0,200}$/.test(slug) || !outcome || outcome.length > 80) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Polymarket market here is <slug>:<outcome>, not "${symbol.slice(0, 40)}"` });
      const m = await get(`${GAMMA}/markets/slug/${encodeURIComponent(slug)}`);
      if (isRefusal(m)) return m;
      const names = list(rec(m).outcomes).map((x) => String(x));
      const at = names.findIndex((n) => n.toLowerCase() === outcome.toLowerCase());
      if (at < 0) return no("E_VENUE_REJECTED", { venue: id, message: `${name} has no outcome "${outcome.slice(0, 40)}" in ${slug.slice(0, 60)}` });
      const closed = rec(m).closed === true;
      const resolved = closed && str(rec(m).umaResolutionStatus)?.toLowerCase() === "resolved";
      const paid = fin(list(rec(m).outcomePrices)[at]);
      if (!resolved || paid === undefined || paid < 0 || paid > 1) return { settled: false, ...(closed ? { closed: true } : {}) };
      const when = str(rec(m).closedTime);
      const whenMs = when ? Date.parse(when.replace(" ", "T").replace(/\+00$/, "Z")) : NaN;
      return { settled: true, payout: round(paid, 6), ...(Number.isFinite(whenMs) ? { at: new Date(whenMs).toISOString() } : {}) };
    },
    /** an outcome's price history, keyless (see the top of this file): `<slug>:<outcome>`, as the listing names it */
    async candles(symbol, interval, w) {
      const now = clock();
      const bad = badHistory(id, interval, w, now);
      if (bad) return bad;
      const sinceMs = startOf(interval, w, now);
      const i = symbol.indexOf(":");
      const slug = i > 0 ? symbol.slice(0, i).trim() : "";
      const outcome = i > 0 ? symbol.slice(i + 1).trim() : "";
      if (!/^[a-z0-9][a-z0-9-]{0,200}$/.test(slug) || !outcome || outcome.length > 80) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Polymarket market here is <slug>:<outcome>, not "${symbol.slice(0, 40)}"` });
      const m = await get(`${GAMMA}/markets/slug/${encodeURIComponent(slug)}`);
      if (isRefusal(m)) return m;
      const names = list(rec(m).outcomes).map((x) => String(x));
      const tokens = list(rec(m).clobTokenIds).map((x) => String(x));
      const at = names.findIndex((n) => n.toLowerCase() === outcome.toLowerCase());
      const token = at >= 0 ? tokens[at] : undefined;
      if (!token || !/^\d{1,90}$/.test(token)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} has no outcome "${outcome.slice(0, 40)}" in ${slug.slice(0, 60)}` });
      // Polymarket refuses a start-to-end range longer than about fifteen days; a longer history is asked from its start alone (and a page
      // that ends before now is cut at its end here)
      const end = Math.min(now, w.until ?? now);
      const range = end - sinceMs > 14 * 86_400_000 ? "" : `&endTs=${Math.floor(end / 60_000) * 60}`;
      const body = await clob(`${CLOB}/prices-history?market=${token}&startTs=${Math.floor(sinceMs / 1000)}${range}&fidelity=${POLY_FIDELITY[interval]}`);
      if (isRefusal(body)) return body;
      const points = list(rec(body).history).filter(isRec).map((x) => ({ t: fin(x.t), p: fin(x.p) })).filter((x): x is { t: number; p: number } => x.t !== undefined && x.t > 0 && x.t * 1000 < end + 60_000 && x.p !== undefined && x.p >= 0 && x.p <= 1);
      return foldPoints(points, interval);
    },
  };
}

/** the minutes between the prices a Polymarket bar is folded from */
const POLY_FIDELITY: Record<CandleInterval, number> = { "1m": 1, "5m": 1, "15m": 5, "1h": 5, "4h": 60, "1d": 60, "1w": 60 };

// ---- Polymarket US --------------------------------------------------------------------------------------------

/** Polymarket US's most traded open markets, keyless (see the top of this file): for each of its categories the account shows
 * (PMUS_CATEGORIES), its own most traded, the categories in turn — so one busy category does not fill the list — each market as its YES and
 * its NO leg, named as the account's Polymarket US trader names them (`<market slug>:YES`). Its lists publish no volume, so none is said, and
 * their order is the one Polymarket US gives. A search is its own GET /v1/search, which reaches every market it lists. What closes within a
 * window is read off the same list: no second request */
export function polymarketUsPublic(deps: PublicDeps = {}): PublicSource {
  const id = "polymarket-us";
  const name = "Polymarket US";
  const clock = deps.clock ?? Date.now;
  const get = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock);
  const history = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, HISTORY_MS);
  const books = getter(fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS), id, name, clock, BOOK_MS);
  const gw: PmusGet = (path) => get(`${PMUS_GATEWAY}${path}`);
  /** a market's two legs as a listing: the shared shape with no order types (nothing is ordered through a listing), its category word kept */
  const legs = (m: Rec): Listing[] => {
    const word = str(m.category);
    const image = str(m.image);
    return pmusLegs(m).map((l) => ({ symbol: l.symbol, name: l.name, kind: l.kind, base: l.base, quote: l.quote, price: l.price, bid: l.bid, ask: l.ask, open: l.open, types: [], ...(l.group ? { group: l.group } : {}), ...(l.outcome ? { outcome: l.outcome } : {}), ...(l.closeTime ? { closeTime: l.closeTime } : {}), ...(l.category ? { category: l.category } : {}), ...(word ? { tags: [word] } : {}), ...(image ? { image } : {}) }));
  };
  const read = async (o: { q?: string | undefined; category?: string | undefined; closingWithinMs?: number | undefined; limit: number }): Promise<Listing[] | Refusal> => {
    const q = (o.q ?? "").trim();
    const found = q ? await pmusSearch(gw, q) : await pmusBusiest(gw, { perCategory: PMUS_PER_CATEGORY });
    if (isRefusal(found)) return found;
    const want = o.category?.trim().toLowerCase();
    const window = pos(o.closingWithinMs);
    const now = clock();
    return found
      .filter((m) => !want || str(m.category)?.toLowerCase() === want)
      .filter((m) => {
        if (!window) return true;
        const end = whenMs(m.endDate);
        return end > now && end <= now + window;
      })
      .slice(0, Math.max(1, o.limit))
      .flatMap((m) => readLike(legs(m), m));
  };
  return {
    id,
    name,
    reset: () => {
      get.clear();
      history.clear();
      books.clear();
    },
    kind: "events",
    connectTo: "polymarket-us",
    connector: "live:polymarket-us",
    listings: (o) => read(o),
    events: (o) => read(o),
    /** a leg's book, keyless (see the top of this file): the gateway's book is the YES contract's, best first. Only YES trades there; NO is
     * the other side of it, so a NO leg's bids are the YES offers at 1 − their price and its asks the YES bids so. The sizes are contracts */
    async book(symbol, depth) {
      const k = /^([a-z0-9][a-z0-9-]{0,200}):(YES|NO)$/i.exec(symbol.trim());
      if (!k) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Polymarket US market here is <slug>:YES or <slug>:NO, not "${symbol.slice(0, 40)}"` });
      const yes = k[2]!.toUpperCase() === "YES";
      const d = countOf(depth, BOOK_DEPTH_MAX, 20);
      const body = await books(`${PMUS_GATEWAY}/v1/markets/${encodeURIComponent(k[1]!)}/book`);
      if (isRefusal(body)) return body;
      const md = rec(body).marketData;
      if (!isRec(md)) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without a book for ${k[1]!.slice(0, 60)}` });
      const level = (l: unknown): Level => [rec(rec(l).px).value, rec(l).qty];
      const bids = list(md.bids).map(level);
      const offers = list(md.offers).map(level);
      // the gateway sends the whole book (live 2026-10-14: 22 levels on a side, no cap at twenty): a side goes on only where cut here
      const more = yes ? { bids: goesOn(bids, d, px), asks: goesOn(offers, d, px) } : { bids: goesOn(offers, d, otherSide), asks: goesOn(bids, d, otherSide) };
      return { bids: yes ? sideOf(bids, "bids", d, px) : sideOf(offers, "bids", d, otherSide), asks: yes ? sideOf(offers, "asks", d, px) : sideOf(bids, "asks", d, otherSide), at: stampOf(md.transactTime, clock()), from: name, depth: "full", more };
    },
    /** whether a market has settled, keyless (polymarket-us.ts: GET /v1/markets/{slug}/settlement answers 1 when YES won and 0 when NO did,
     * and HTTP 404 "Settlement not found" until the market settles) */
    async settlement(symbol) {
      const k = /^([a-z0-9][a-z0-9-]{0,200}):(YES|NO)$/i.exec(symbol.trim());
      if (!k) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a Polymarket US market here is <slug>:YES or <slug>:NO, not "${symbol.slice(0, 40)}"` });
      const body = await gw(`/v1/markets/${encodeURIComponent(k[1]!)}/settlement`);
      if (isRefusal(body)) return (body.native as { status?: unknown } | undefined)?.status === 404 ? { settled: false } : body;
      const s = fin(rec(body).settlement);
      if (s === undefined || s < 0 || s > 1) return { settled: false };
      return { settled: true, payout: round(k[2]!.toUpperCase() === "YES" ? s : 1 - s, 6) };
    },
    notes: (o) => [o.q?.trim() ? "Polymarket US: its own search, which reaches every market it lists." : `Polymarket US: the most traded open markets of ${PMUS_CATEGORIES.slice(0, -1).join(", ")} and ${PMUS_CATEGORIES.at(-1)}, in turn (its lists give no volume figure).`],
    /** a market's price history, keyless (see the top of this file): `<market slug>:YES` or `<market slug>:NO`, as the listing names it */
    candles: (symbol, interval, w) => pmusCandles((path) => history(`${PMUS_GATEWAY}${path}`), id, symbol, interval, w, clock()),
  };
}

// ---- Hyperliquid perpetuals -----------------------------------------------------------------------------------

/** Hyperliquid's info endpoint takes a POST with a JSON `type` (hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint,
 * "No API key or authentication is required", read 2026-10-06; its perpetuals page read 2026-10-08; the account's own Hyperliquid connector
 * reads the same host). Seven questions are asked here and nothing else — the five below, and one coin's book (`l2Book`) and last trades
 * (`recentTrades`), live 2026-10-14 keyless: `metaAndAssetCtxs`, every perpetual of a dex with its day — of the
 * first dex when no `dex` is named, live 2026-10-06 234 of them in 72 KB, 400 ms: [{universe: [{name, szDecimals, maxLeverage,
 * isDelisted?}], collateralToken?}, [{markPx, midPx, prevDayPx, dayNtlVlm, funding, openInterest, impactPxs}]], the two lists in step;
 * `perpDexs`, the HIP-3 dexes ([null, {name, fullName, deployer, …}, …], the first dex as null); `perpCategories`, Hyperliquid's category
 * for each market ([["io:ANTH","preipo"], ["xyz:TSLA","stocks"], …]); and `candleSnapshot` for one coin, [{t, T, s, i, o, c, h, l, v, n}]
 * with the prices as strings */
const HL_INFO = "https://api.hyperliquid.xyz/info";
type HyperliquidAsk =
  | { type: "metaAndAssetCtxs"; dex?: string | undefined }
  | { type: "perpDexs" }
  | { type: "perpCategories" }
  | { type: "candleSnapshot"; req: { coin: string; interval: CandleInterval; startTime: number; endTime: number } }
  /** one coin's book, {coin, time, levels: [bids, asks]}, twenty a side of {px, sz, n}, best first; and its last trades, [{side, px, sz,
   * time, …}] newest first (see the top of this file) */
  | { type: "l2Book"; coin: string }
  | { type: "recentTrades"; coin: string }
  /** one coin's funding, hour by hour, [{coin, fundingRate, premium, time}] oldest first, 500 an answer at most (live 2026-10-20: BTC's
   * paid at 16:00:00.127 UTC, the top of each hour) */
  | { type: "fundingHistory"; coin: string; startTime: number; endTime: number };

/** a HIP-3 dex's name as Hyperliquid writes it (xyz, io, vntl, para, mkts): letters and digits */
const HL_DEX = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

/** The network as the Hyperliquid sources use it: a POST of exactly one of the bodies above, built here from its fields, to the one URL,
 * within `timeoutMs`. A dex not named in HIP-3's form is not asked; nothing else is asked */
export function hyperliquidInfo(http: Http, timeoutMs: number): (ask: HyperliquidAsk) => Promise<HttpReply> {
  return async (ask) => {
    let body: Record<string, unknown>;
    if (ask.type === "candleSnapshot") body = { type: "candleSnapshot", req: { coin: ask.req.coin, interval: ask.req.interval, startTime: Math.floor(ask.req.startTime), endTime: Math.floor(ask.req.endTime) } };
    else if (ask.type === "metaAndAssetCtxs") {
      if (ask.dex !== undefined && !HL_DEX.test(ask.dex)) throw new Error(`the dex "${String(ask.dex).slice(0, 20)}" is not asked: a HIP-3 dex is named in letters and digits`);
      body = ask.dex === undefined ? { type: "metaAndAssetCtxs" } : { type: "metaAndAssetCtxs", dex: ask.dex };
    } else if (ask.type === "fundingHistory") {
      if (!HL_COIN.test(ask.coin)) throw new Error(`the coin "${String(ask.coin).slice(0, 20)}" is not asked: a coin is named in letters, digits and a dex's prefix`);
      body = { type: "fundingHistory", coin: ask.coin, startTime: Math.floor(ask.startTime), endTime: Math.floor(ask.endTime) };
    } else if (ask.type === "l2Book" || ask.type === "recentTrades") {
      if (!HL_COIN.test(ask.coin)) throw new Error(`the coin "${String(ask.coin).slice(0, 20)}" is not asked: a coin is named in letters, digits and a dex's prefix`);
      body = { type: ask.type === "l2Book" ? "l2Book" : "recentTrades", coin: ask.coin };
    } else body = { type: ask.type === "perpDexs" ? "perpDexs" : "perpCategories" };
    return http(HL_INFO, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs });
  };
}

/** a coin as Hyperliquid names it (BTC, kPEPE, HYPE; a HIP-3 market's with its dex: io:ANTH) */
const HL_COIN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,30}$/;
/** Hyperliquid pays funding every hour, on the hour */
const hlNextFunding = (now: number): string => new Date((Math.floor(now / 3_600_000) + 1) * 3_600_000).toISOString();
/** dollars to the cent */
const cents = (x: number): number => Math.round(x * 100) / 100;
/** A HYPERLIQUID PERPETUAL'S OWN FIGURES beside its price, from its meta (`u`: szDecimals) and its context (`c`, metaAndAssetCtxs): its mark,
 * its oracle, its premium, its open interest in coins and in dollars at the mark, the hourly funding's period, and its order rules at the
 * price (live/hl-rules.ts hlPerpSteps: its lot, its tick, $10 at least) — each only where Hyperliquid said it */
function hlPerpFigures(u: Record<string, unknown>, c: Record<string, unknown>, price: number | undefined): Partial<Listing> {
  const mark = pos(c.markPx);
  const oracle = pos(c.oraclePx);
  const premium = fin(c.premium);
  const oi = nonNeg(c.openInterest);
  const sz = nonNeg(u.szDecimals);
  return {
    ...(mark !== undefined ? { markPrice: mark } : {}),
    ...(oracle !== undefined ? { oraclePrice: oracle } : {}),
    ...(premium !== undefined ? { premium } : {}),
    ...(oi !== undefined ? { openInterest: oi, ...(mark !== undefined ? { openInterestUsd: cents(oi * mark) } : {}) } : {}),
    ...(fin(c.funding) !== undefined ? { fundingEveryH: 1 } : {}),
    ...(sz !== undefined && Number.isInteger(sz) && sz <= 8 && price !== undefined ? hlPerpSteps(sz, price) : {}),
  };
}
/** Hyperliquid's connection to trade: an API wallet that places orders and cannot withdraw (the connector live:hyperliquid-trade). Both
 * Hyperliquid listings name it: its perpetuals and its HIP-3 deployers' pre-IPO ones trade there */
const HL_TRADE = { connectTo: "hyperliquid-trade", connector: "live:hyperliquid-trade" } as const;

/** one POST's JSON answer, or Hyperliquid's refusal in its own words */
async function hlAsk(info: ReturnType<typeof hyperliquidInfo>, id: string, name: string, ask: HyperliquidAsk): Promise<unknown> {
  let r: HttpReply;
  try {
    r = await info(ask);
  } catch (err) {
    return unreachable(id, name, err);
  }
  return r.status === 200 && r.body !== undefined && r.body !== null ? r.body : publicNo(id, name, r);
}

/** one Hyperliquid perpetual's bars, keyless: its listing's `<COIN>-PERP` (a HIP-3 market's coin carries its dex: io:ANTH-PERP), as
 * live/history-crypto.ts hyperliquidHistory reads them — everything in the window from Hyperliquid's latest 5,000 bars at the size, the
 * bars with no trade left out, a range those do not reach drawn coarser — the volume in the coin; kept by its window (live/history.ts).
 * `form`: the coins this source lists */
function hyperliquidBars(info: ReturnType<typeof hyperliquidInfo>, id: string, name: string, clock: () => number, form: { test: (coin: string) => boolean; example: string }, pace: Pace): NonNullable<PublicSource["candles"]> & { clear(): void } {
  const history = historyKeep<Candle[] | CandlePage>({ entries: 32, most: 60_000, weigh: pageWeight, clock });
  const ask = (symbol: string, interval: CandleInterval, w: CandleWindow) =>
    history.get(`${symbol}|${windowKey(interval, w)}`, keepMsOf(interval, w), async () => {
      const now = clock();
      const bad = badHistory(id, interval, w, now);
      if (bad) return bad;
      const k = /^(.+)-PERP$/i.exec(symbol.trim());
      const coin = k?.[1];
      if (!coin || !HL_COIN.test(coin) || !form.test(coin)) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a ${name} perpetual here is ${form.example}, not "${symbol.slice(0, 40)}"` });
      return hyperliquidHistory((req) => hlAsk(info, id, name, { type: "candleSnapshot", req }), pace, clock, name, coin, interval, w);
    });
  return Object.assign(ask, { clear: history.clear });
}

/** the most levels a side Hyperliquid's l2Book sends (live 2026-10-14: twenty, whatever depth is wanted) */
const HL_BOOK_MOST = 20;
/** one Hyperliquid perpetual's book and last trades, keyless (see the top of this file): its listing's `<COIN>-PERP` (a HIP-3 market's coin
 * carries its dex), the book twenty levels a side at most and kept BOOK_MS, the trades its last ten kept TRADES_MS, the sizes in the coin. A
 * trade's side is Hyperliquid's B (a buyer took an offer) or A (a seller took a bid). A coin Hyperliquid does not trade answers `null` —
 * the book under HTTP 200, the trades under HTTP 500 — which is "no such perpetual", not Hyperliquid failing. `form`: the coins this
 * source lists */
function hyperliquidDepth(info: ReturnType<typeof hyperliquidInfo>, id: string, name: string, clock: () => number, form: { test: (coin: string) => boolean; example: string }): { book: NonNullable<PublicSource["book"]>; trades: NonNullable<PublicSource["trades"]>; clear(): void } {
  const books = keeper<OrderBook>(clock, BOOK_MS);
  const tape = keeper<PublicTrade[]>(clock, TRADES_MS);
  const coinOf = (symbol: string): string | Refusal => {
    const coin = /^(.+)-PERP$/i.exec(symbol.trim())?.[1];
    return coin && HL_COIN.test(coin) && form.test(coin) ? coin : no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a ${name} perpetual here is ${form.example}, not "${symbol.slice(0, 40)}"` });
  };
  /** one POST's JSON answer; `null` (the coin is not traded there) as that, in words; anything else not a yes, Hyperliquid's refusal */
  const askOf = async (q: Extract<HyperliquidAsk, { coin: string }>): Promise<unknown> => {
    let r: HttpReply;
    try {
      r = await info(q);
    } catch (err) {
      return unreachable(id, name, err);
    }
    if ((r.status === 200 || r.status === 500) && r.text.trim() === "null") return no("E_VENUE_REJECTED", { venue: id, message: `${name} trades no perpetual ${q.coin}` });
    return r.status === 200 && r.body !== undefined && r.body !== null ? r.body : publicNo(id, name, r);
  };
  return {
    book: (symbol, depth) => {
      const coin = coinOf(symbol);
      if (isRefusal(coin)) return Promise.resolve(coin);
      const d = countOf(depth, BOOK_DEPTH_MAX, 20);
      return books(`${coin}|${d}`, async () => {
        const body = await askOf({ type: "l2Book", coin });
        if (isRefusal(body)) return body;
        const levels = list(rec(body).levels);
        if (levels.length !== 2) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without a book for ${coin}` });
        const side = (l: unknown): Level[] => list(l).map((x) => [rec(x).px, rec(x).sz]);
        const bids = side(levels[0]);
        const asks = side(levels[1]);
        // l2Book sends twenty levels a side at most, whatever is asked: a side of twenty may go on
        return { bids: sideOf(bids, "bids", d), asks: sideOf(asks, "asks", d), at: stampOf(rec(body).time, clock()), from: name, depth: "full", more: { bids: goesOn(bids, d, pos, HL_BOOK_MOST), asks: goesOn(asks, d, pos, HL_BOOK_MOST) } };
      });
    },
    trades: (symbol, limit) => {
      const coin = coinOf(symbol);
      if (isRefusal(coin)) return Promise.resolve(coin);
      const n = countOf(limit, TRADES_MAX, 30);
      return tape(`${coin}|${n}`, async () => {
        const body = await askOf({ type: "recentTrades", coin });
        if (isRefusal(body)) return body;
        const out: Array<PublicTrade & { i: number }> = [];
        list(body).forEach((r, i) => {
          const t = rec(r);
          const price = pos(t.px);
          const size = pos(t.sz);
          const at = pos(t.time);
          if (price === undefined || size === undefined || at === undefined) return;
          const side = t.side === "B" ? "buy" : t.side === "A" ? "sell" : undefined;
          out.push({ price, size, ...(side ? { side } : {}), at: new Date(at).toISOString(), i: -i });
        });
        return newestFirst(out, n);
      });
    },
    clear: () => {
      books.clear();
      tape.clear();
    },
  };
}

/** the hours of past funding kept for every Hyperliquid perpetual together (an hour paid never changes), and how many 500-hour answers one
 * window is asked in at most */
const FUNDING_HOURS_KEPT = 50_000;
const FUNDING_PAGES = 10;
/** one Hyperliquid perpetual's past funding, hour by hour (fundingHistory), as a paper account settles its hours by it: its listing's
 * `<COIN>-PERP` (a HIP-3 market's coin carries its dex). Each hour read is kept — in memory only, FUNDING_HOURS_KEPT of them at most, the
 * oldest let go first — so a window asked again asks only for the hours not kept; a long one is asked 500 hours an answer, FUNDING_PAGES of
 * them at most. Every ask waits its turn in Hyperliquid's one line (live/history.ts hostLane) */
function hyperliquidFunding(info: ReturnType<typeof hyperliquidInfo>, id: string, name: string, form: { test: (coin: string) => boolean; example: string }, pace: Pace): { history: NonNullable<PublicSource["fundingHistory"]>; clear(): void } {
  const kept = new Map<string, number>();
  const history = async (symbol: string, from: number, to: number): Promise<Array<{ at: number; rate: number }> | Refusal> => {
    const coin = /^(.+)-PERP$/i.exec(symbol.trim())?.[1];
    if (!coin || !HL_COIN.test(coin) || !form.test(coin)) return no("E_ACCOUNT_BAD_ACTION", { venue: id, message: `a ${name} perpetual here is ${form.example}, not "${symbol.slice(0, 40)}"` });
    const hours: number[] = [];
    for (let h = Math.ceil(from / HOUR_MS) * HOUR_MS; h <= to && hours.length <= FUNDING_PAGES * 500; h += HOUR_MS) hours.push(h);
    const missing = hours.filter((h) => !kept.has(`${coin}|${h}`));
    if (missing.length) {
      // each answer's times are the payments', a moment after the hour: asked to the end of the last hour wanted
      let start = missing[0]!;
      const end = missing[missing.length - 1]! + HOUR_MS - 1;
      for (let page = 0; page < FUNDING_PAGES && start <= end; page++) {
        await pace("hyperliquid", 20);
        const body = await hlAsk(info, id, name, { type: "fundingHistory", coin, startTime: start, endTime: end });
        if (isRefusal(body)) return body;
        const rows = list(body).filter(isRec);
        let last = -1;
        for (const r of rows) {
          const t = fin(r.time);
          const rate = fin(r.fundingRate);
          if (t === undefined || rate === undefined) continue;
          kept.delete(`${coin}|${Math.floor(t / HOUR_MS) * HOUR_MS}`);
          kept.set(`${coin}|${Math.floor(t / HOUR_MS) * HOUR_MS}`, rate);
          last = Math.max(last, t);
        }
        if (rows.length < 500 || last < 0) break;
        start = last + 1;
      }
      while (kept.size > FUNDING_HOURS_KEPT) kept.delete(kept.keys().next().value!);
    }
    return hours.filter((h) => kept.has(`${coin}|${h}`)).map((h) => ({ at: h, rate: kept.get(`${coin}|${h}`)! }));
  };
  return { history, clear: () => kept.clear() };
}
const HOUR_MS = 3_600_000;

/** Hyperliquid's perpetuals (its first dex), keyless, busiest first: each `<COIN>-PERP`, placed through Hyperliquid's connection to trade
 * (HL_TRADE) once it is connected — so the Perps tab shows real prices marked "Connect to trade". The price is Hyperliquid's mid (its mark
 * when there is none), the change is from its prevDayPx, the volume its dayNtlVlm, the funding its hourly rate. Hyperliquid's own rule for
 * this machine, if it has one, arrives as its refusal and is shown as that */
export function hyperliquidPublic(deps: PublicDeps = {}): PublicSource {
  const id = "hyperliquid";
  const name = "Hyperliquid";
  const clock = deps.clock ?? Date.now;
  const info = hyperliquidInfo(deps.http ?? realHttp, deps.timeoutMs ?? TIMEOUT_MS);
  const keep = keeper<Listing[]>(clock, KEEP_MS);
  // how much of the list a listing with nothing searched for shows, for the sentence under it
  let shown: { of: number; total: number } | undefined;
  /** every perpetual with its day, from the kept answer */
  const load = (): Promise<Listing[] | Refusal> =>
    keep("metaAndAssetCtxs", async () => {
      const body = await hlAsk(info, id, name, { type: "metaAndAssetCtxs" });
      if (isRefusal(body)) return body;
      const answer = list(body);
      const universe = list(rec(answer[0]).universe).filter(isRec);
      const ctxs = list(answer[1]).filter(isRec);
      if (!universe.length || universe.length !== ctxs.length) return no("E_VENUE_REJECTED", { venue: id, message: `${name} answered without its perpetuals` });
      const nextFundingAt = hlNextFunding(clock());
      const out: Listing[] = [];
      universe.forEach((u, i) => {
        const c = ctxs[i]!;
        const coin = str(u.name);
        if (!coin || !HL_COIN.test(coin) || u.isDelisted === true) return;
        const price = pos(c.midPx) ?? pos(c.markPx);
        if (price === undefined) return;
        const funding = fin(c.funding);
        const volume = nonNeg(c.dayNtlVlm);
        const maxLeverage = pos(u.maxLeverage);
        const day = since(price, pos(c.prevDayPx));
        out.push({
          symbol: `${coin}-PERP`,
          name: `${coin} perpetual on ${name}`,
          kind: "perp",
          base: coin,
          quote: "USDC",
          price,
          open: true,
          types: [],
          ...(day.change !== undefined ? { change24h: day.change, changePct24h: day.changePct } : {}),
          ...(volume !== undefined ? { volumeUsd24h: volume } : {}),
          ...(funding !== undefined ? { fundingRate: funding, nextFundingAt } : {}),
          ...(maxLeverage !== undefined ? { maxLeverage } : {}),
          ...hlPerpFigures(u, c, price),
        });
      });
      return out.sort((a, b) => (b.volumeUsd24h ?? -1) - (a.volumeUsd24h ?? -1));
    });
  const bars = hyperliquidBars(info, id, name, clock, { test: (coin) => !coin.includes(":"), example: "<COIN>-PERP (BTC-PERP)" }, deps.pace ?? hostLane);
  const depth = hyperliquidDepth(info, id, name, clock, { test: (coin) => !coin.includes(":"), example: "<COIN>-PERP (BTC-PERP)" });
  const funding = hyperliquidFunding(info, id, name, { test: (coin) => !coin.includes(":"), example: "<COIN>-PERP (BTC-PERP)" }, deps.pace ?? hostLane);
  return {
    id,
    name,
    reset: () => {
      keep.clear();
      bars.clear();
      depth.clear();
      funding.clear();
    },
    book: depth.book,
    trades: depth.trades,
    fundingHistory: funding.history,
    kind: "exchange",
    ...HL_TRADE,
    async listings(o) {
      const all = await load();
      if (isRefusal(all)) return all;
      const Q = (o.q ?? "").trim().toUpperCase();
      const base = Q.split("/")[0]!.trim();
      const pool = (Q ? all.filter((m) => m.base.toUpperCase().startsWith(base) || m.symbol.toUpperCase().startsWith(Q)) : all).slice(0, Math.max(1, o.limit));
      if (!Q) shown = { of: pool.length, total: all.length };
      return pool;
    },
    candles: bars,
    notes: (o) => (!o.q?.trim() && shown && shown.of < shown.total ? [`${name}: ${shown.of} of ${shown.total} perpetuals shown · search for the rest · traded once Hyperliquid is connected to trade`] : []),
  };
}

// ---- Robinhood Stock Tokens -----------------------------------------------------------------------------------

/** shares well enough known to be shown first, before anything is typed */
const SHARES = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "SPY", "QQQ", "AMD", "NFLX", "COIN", "HOOD", "MSTR", "PLTR"];

/** Robinhood's Stock Tokens, keyless: each token and its own bid and ask in dollars. Read-only. Robinhood refusing this network — on the
 * list, or on every price — is the listing's answer, in keyless words (publicNo), and held back as any other source's refusal is; prices
 * refused for a few tokens while the others answer say why on those tokens' lines */
export function stockTokensPublic(deps: PublicDeps = {}): PublicSource {
  const id = "robinhood-stock-tokens";
  const name = "Robinhood Stock Tokens";
  const clock = deps.clock ?? Date.now;
  // one guarded network for the life of the source: robinhood.ts keeps the token list per network
  const http = fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS);
  const quote = getter(http, id, name, clock, PRICE_MS);
  // robinhood.ts reads a refusal of the list as a keyed connection does ("the key lacks the permission"); this source has no key, so the
  // list's last answer is kept to read it again in keyless words. The same network for the life of the source, so its list is kept too
  let listReply: HttpReply | undefined;
  const listHttp: Http = async (url, init) => {
    const r = await http(url, init);
    if (url.endsWith("/rhj/assets")) listReply = r;
    return r;
  };
  // how much of the list a listing with nothing searched for shows, for the sentence under it (a search leaves it as it was)
  let shown: { of: number; total: number } | undefined;
  return {
    id,
    name,
    reset: () => {
      quote.clear();
    },
    kind: "tokens",
    connectTo: "robinhood-wallet",
    connector: "live:wallet",
    readOnly: "Robinhood's own prices: a Stock Token trades from a connected wallet on Robinhood Chain, against USDG",
    async listings(o) {
      let tokens: Array<{ symbol: string; name: string }>;
      try {
        tokens = await stockTokens(listHttp, clock());
      } catch (err) {
        if (!isRefusal(err)) return unreachable(id, name, err);
        const status = (err.native as { status?: unknown } | undefined)?.status;
        return publicNo(id, name, listReply && listReply.status === status ? listReply : { status: typeof status === "number" ? status : 0, body: undefined, text: String((err.native as { said?: unknown } | undefined)?.said ?? "") });
      }
      const seen = new Set<string>();
      const one = tokens.filter((t) => !seen.has(t.symbol) && seen.add(t.symbol));
      const Q = (o.q ?? "").trim().toUpperCase();
      const rank = (s: string) => (SHARES.includes(s) ? SHARES.indexOf(s) : SHARES.length);
      const pool = (Q ? one.filter((t) => has(Q, t.symbol, t.name)).sort((a, b) => Number(b.symbol === Q) - Number(a.symbol === Q) || Number(b.symbol.startsWith(Q)) - Number(a.symbol.startsWith(Q))) : one.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t.symbol) - rank(b.t.symbol) || a.i - b.i).map((x) => x.t)).slice(0, Math.max(1, o.limit));
      // eight at a time: Robinhood allows sixty requests a second
      const quotes = new Map<string, Rec>();
      const refusedFor = new Map<string, Refusal>();
      for (let i = 0; i < pool.length; i += 8)
        await Promise.all(
          pool.slice(i, i + 8).map(async (t) => {
            const body = await quote(`https://api.robinhood.com/rhj/prices/${encodeURIComponent(t.symbol)}`).catch((err: unknown) => unreachable(id, name, err));
            if (isRefusal(body)) {
              refusedFor.set(t.symbol, body);
              return;
            }
            const q = rec(list(rec(body).quotes)[0]);
            if (str(q.currency) === "USD") quotes.set(t.symbol, q);
          }),
        );
      // every price refused (a place rule, an edge, a ban): that is Robinhood's answer, not a list of tokens with no price
      const refused = pool.map((t) => refusedFor.get(t.symbol)).find((r) => r !== undefined);
      if (!quotes.size && refused) return refused;
      if (!Q) shown = { of: pool.length, total: one.length };
      return pool.map((t): Listing => {
        const q = quotes.get(t.symbol);
        const bid = pos(q?.tokenBid);
        const ask = pos(q?.tokenAsk);
        const halted = q?.isTradingHalt === true;
        const why = refusedFor.get(t.symbol)?.message.slice(0, NOTE_MAX) ?? "Robinhood gave no price for it just now";
        // the issuer and whom it says the tokens are not for, in its own words (robinhood.ts): Markets shows them beside the price
        return readLike({ symbol: t.symbol, name: t.name, kind: "token", base: t.symbol, quote: "USD", price: mid(bid, ask) ?? bid ?? ask, bid, ask, open: q !== undefined && !halted, ...(halted ? { note: "Robinhood has halted trading in it" } : q ? {} : { note: why }), types: [], issuer: STOCK_TOKEN_ISSUER, eligibility: STOCK_TOKEN_TERMS }, q);
      });
    },
    notes: (o) => (!o.q?.trim() && shown && shown.of < shown.total ? [`${name}: ${shown.of} of ${shown.total} shown · search for the rest`] : []),
  };
}

// ---- Pre-IPO perpetuals: contracts on a private company's implied valuation, at eight exchanges and Hyperliquid's HIP-3 deployers ---

/** one contract on a venue's pre-IPO list, as its reader maps the venue's record (see the top of this file for each venue's fields) */
interface PreIpoInstrument {
  /** the venue's own id for it (ANTHROPIC-USDT-SWAP, ANTHROPIC_USDT, PF_ANTHROPICXUSD, ANTH_USDC-PERPETUAL, ANTHROPICUSDTM) */
  id: string;
  /** the unified exchange library's name for it, which a key connected at the venue names in an order (ANTHROPIC/USDT:USDT) */
  symbol: string;
  base: string;
  quote: string;
  open: boolean;
  maxLeverage?: number | undefined;
  contractSize?: number | undefined;
  /** the venue's record, which carries its flag (live/preipo.ts preIpoFlag) */
  info: Rec;
  /** what the list itself says of the day, where it says (Gate's record: its funding and the next time) */
  day?: PreIpoQuote | undefined;
}
/** one contract's prices now, in the venue's own figures */
interface PreIpoQuote {
  price?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  changePct24h?: number | undefined;
  change24h?: number | undefined;
  volumeUsd24h?: number | undefined;
  fundingRate?: number | undefined;
  nextFundingAt?: string | undefined;
  open?: boolean | undefined;
}
/** one JSON body from a fixed host, or the venue's refusal; the keeping is the source's (its list ten minutes, its quotes KEEP_MS) */
type Fetch = (url: string) => Promise<unknown>;

/** a venue whose pre-IPO perpetuals are read keyless: the unified library's id for it (the venue to connect), and how its list and one
 * contract's quote are read from its own public endpoints */
export interface PreIpoVenue {
  id: string;
  name: string;
  list(fetch: Fetch): Promise<PreIpoInstrument[] | Refusal>;
  quote(fetch: Fetch, inst: PreIpoInstrument): Promise<PreIpoQuote | Refusal>;
  /** the venue's no inside its own JSON envelope, whatever the HTTP status — OKX's `code`, Bybit's `retCode`, Deribit's `error`, often
   * under HTTP 200 — as a refusal in its own words (`venue`: the source's id); nothing when the envelope says yes, or says a no this does not
   * know under another status (the status then decides, publicNo) */
  saidNo?(r: HttpReply, venue: string): Refusal | undefined;
}

/** `b`'s figures over `a`'s, where `b` has one */
const dayOf = (a: PreIpoQuote, b: PreIpoQuote): PreIpoQuote => Object.fromEntries([...Object.entries(a), ...Object.entries(b).filter(([, v]) => v !== undefined)]) as PreIpoQuote;
const bodyOf = (body: unknown): Rec[] | Refusal => (isRefusal(body) ? body : list(rec(body).data).filter(isRec));
/** a venue that answered its list without the rows this file reads */
const noList = (venue: string, name: string): Refusal => no("E_VENUE_REJECTED", { venue, message: `${name} answered without its contracts` });
/** the account's sentence for a venue's place rule */
const notServed = (name: string): string => `${name} does not serve this location: that is its own rule, and the account does not look for a way around it`;

/** OKX's codes for a no it answers inside its envelope, often under HTTP 200 (its docs-v5 error table, as exchange.ts reads them for a
 * key): 50121 "You can't access our services through the IP address" and 50051 "Due to compliance restrictions in your country or region"
 * are its place rule; 50011 "Request too frequent" its rate limit; 50001, 50013 and 50026 its matching engine upgrading or its system busy */
const OKX_PLACE = new Set(["50121", "50051"]);
const OKX_BUSY = new Set(["50001", "50013", "50026"]);
function okxSaidNo(r: HttpReply, venue: string): Refusal | undefined {
  const b = rec(r.body);
  const code = b.code === undefined || b.code === null ? "0" : String(b.code).slice(0, 12);
  if (code === "0") return undefined;
  const native = { status: r.status, said: saidOf(JSON.stringify({ code: b.code, msg: b.msg ?? null })) };
  if (OKX_PLACE.has(code)) return no("E_VENUE_GEOBLOCKED", { venue, message: notServed("OKX"), native });
  if (code === "50011") return rateLimitedNo(venue, "OKX", r.retryAfterMs, native);
  if (OKX_BUSY.has(code)) return no("E_VENUE_UNREACHABLE", { venue, message: "OKX could not be reached: its system is busy or upgrading", native });
  return r.status === 200 ? no("E_VENUE_REJECTED", { venue, message: `OKX refused the request (code ${code})`, native }) : undefined;
}

const okxPreIpo: PreIpoVenue = {
  id: "okx",
  name: "OKX",
  saidNo: okxSaidNo,
  async list(fetch) {
    const rows = bodyOf(await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP"));
    if (isRefusal(rows)) return rows;
    if (!rows.length) return noList("okx-preipo", "OKX");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.instId);
      const base = str(r.ctValCcy);
      const settle = str(r.settleCcy);
      if (!id || !base || !settle) return [];
      // a linear swap's quote is its settlement currency: the library names it base/settle:settle
      return [{ id, symbol: `${base}/${settle}:${settle}`, base, quote: settle, open: r.state === "live", maxLeverage: pos(r.lever), contractSize: pos(r.ctVal), info: r }];
    });
  },
  async quote(fetch, inst) {
    const [t, f] = await Promise.all([fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(inst.id)}`), fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(inst.id)}`)]);
    const ticks = bodyOf(t);
    if (isRefusal(ticks)) return ticks;
    const d = rec(ticks[0]);
    const last = pos(d.last);
    // the funding is a second small request: without it the price still stands
    const funding = bodyOf(f);
    const fr = isRefusal(funding) ? {} : rec(funding[0]);
    const day = since(last, pos(d.open24h));
    return { price: last, bid: pos(d.bidPx), ask: pos(d.askPx), changePct24h: day.changePct, change24h: day.change, fundingRate: fin(fr.fundingRate), nextFundingAt: isoAt(fr.fundingTime) };
  },
};

/** Gate answers a name it does not list with HTTP 400 and the label CONTRACT_NOT_FOUND (2026-10-06): that is "not listed", not a refusal */
const gateNotFound = (r: Refusal): boolean => (r.native as { status?: unknown; said?: unknown } | undefined)?.status === 400 && /CONTRACT_NOT_FOUND/.test(String((r.native as { said?: unknown }).said ?? ""));
const gatePreIpo: PreIpoVenue = {
  id: "gate",
  name: "Gate",
  async list(fetch) {
    const answers = await Promise.all(PRE_IPO_NAMES.map((n) => fetch(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${encodeURIComponent(`${n}_USDT`)}`)));
    const out: PreIpoInstrument[] = [];
    let refused: Refusal | undefined;
    for (const a of answers) {
      if (isRefusal(a)) {
        if (!gateNotFound(a)) refused ??= a;
        continue;
      }
      const r = rec(a);
      const id = str(r.name);
      if (!id) continue;
      const base = id.replace(/_USDT$/, "");
      out.push({ id, symbol: `${base}/USDT:USDT`, base, quote: "USDT", open: r.status === "trading" && r.in_delisting !== true, maxLeverage: pos(r.leverage_max), contractSize: pos(r.quanto_multiplier), info: r, day: { fundingRate: fin(r.funding_rate), nextFundingAt: isoAt(r.funding_next_apply, true) } });
    }
    // Gate refusing every name (a geoblock, a rate limit) is Gate's refusal; a name or two failing while the others answer is not
    return !out.length && refused ? refused : out;
  },
  async quote(fetch, inst) {
    const body = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${encodeURIComponent(inst.id)}`);
    if (isRefusal(body)) return body;
    const d = rec(list(body)[0]);
    return { price: pos(d.last), bid: pos(d.highest_bid), ask: pos(d.lowest_ask), changePct24h: fin(d.change_percentage), change24h: fin(d.change_price), volumeUsd24h: nonNeg(d.volume_24h_quote), fundingRate: fin(d.funding_rate) };
  },
};

const krakenFuturesPreIpo: PreIpoVenue = {
  id: "krakenfutures",
  name: "Kraken Futures",
  async list(fetch) {
    const body = await fetch("https://futures.kraken.com/derivatives/api/v3/instruments");
    if (isRefusal(body)) return body;
    const rows = list(rec(body).instruments).filter(isRec);
    if (!rows.length) return noList("krakenfutures-preipo", "Kraken Futures");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.symbol);
      // its perpetuals are its flexible futures (PF_…), priced and settled in dollars
      if (!id || r.type !== "flexible_futures") return [];
      // the library names the base from the symbol itself: PF_ANTHROPICXUSD → ANTHROPICX (Kraken's own `base` is ANTHROPICx)
      const tail = id.split("_")[1] ?? "";
      const libBase = tail.slice(0, Math.max(0, tail.length - 3)).toUpperCase();
      const base = str(r.base) ?? libBase;
      if (!libBase) return [];
      const margin = pos(rec(list(r.marginLevels)[0]).initialMargin);
      return [{ id, symbol: `${libBase}/USD:USD`, base, quote: "USD", open: r.tradeable === true, ...(margin !== undefined ? { maxLeverage: Math.round(1 / margin) } : {}), contractSize: pos(r.contractSize), info: r }];
    });
  },
  async quote(fetch, inst) {
    const body = await fetch(`https://futures.kraken.com/derivatives/api/v3/tickers/${encodeURIComponent(inst.id)}`);
    if (isRefusal(body)) return body;
    const t = rec(rec(body).ticker);
    return { price: pos(t.last) ?? pos(t.markPrice), bid: pos(t.bid), ask: pos(t.ask), changePct24h: fin(t.change24h), volumeUsd24h: nonNeg(t.volumeQuote), fundingRate: fin(t.relativeFundingRate), open: t.suspended !== true };
  },
};

/** Deribit's JSON-RPC answers a no as `error` {code, message}, under HTTP 400 or 200: 12005 "country_is_banned" is its own place rule ("The
 * country is banned (possibly via IP check)", the library's table), 10028 "too_many_requests" its rate limit */
function deribitSaidNo(r: HttpReply, venue: string): Refusal | undefined {
  const e = rec(r.body).error;
  if (e === undefined || e === null) return undefined;
  const err = rec(e);
  const code = String(err.code ?? "").slice(0, 12);
  const words = str(err.message)?.slice(0, 120);
  const native = { status: r.status, said: saidOf(JSON.stringify({ error: { code: err.code ?? null, message: err.message ?? null } })) };
  if (code === "12005" || words === "country_is_banned") return no("E_VENUE_GEOBLOCKED", { venue, message: notServed("Deribit"), native });
  if (code === "10028") return rateLimitedNo(venue, "Deribit", r.retryAfterMs, native);
  return r.status === 200 ? no("E_VENUE_REJECTED", { venue, message: `Deribit refused the request (${words ?? `code ${code || "none"}`})`, native }) : undefined;
}

const deribitPreIpo: PreIpoVenue = {
  id: "deribit",
  name: "Deribit",
  saidNo: deribitSaidNo,
  async list(fetch) {
    const body = await fetch("https://www.deribit.com/api/v2/public/get_instruments?currency=any&kind=future");
    if (isRefusal(body)) return body;
    const rows = list(rec(body).result).filter(isRec);
    if (!rows.length) return noList("deribit-preipo", "Deribit");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.instrument_name);
      const base = str(r.base_currency);
      const quote = str(r.quote_currency);
      const settle = str(r.settlement_currency);
      // a perpetual settled in what it is quoted in (linear); its inverse ones are priced in coin
      if (!id || !base || !quote || !settle || r.settlement_period !== "perpetual" || settle !== quote) return [];
      return [{ id, symbol: `${base}/${quote}:${settle}`, base, quote, open: r.is_active === true, maxLeverage: pos(r.max_leverage), contractSize: pos(r.contract_size), info: r }];
    });
  },
  async quote(fetch, inst) {
    const body = await fetch(`https://www.deribit.com/api/v2/public/ticker?instrument_name=${encodeURIComponent(inst.id)}`);
    if (isRefusal(body)) return body;
    const t = rec(rec(body).result);
    const stats = rec(t.stats);
    return { price: pos(t.last_price) ?? pos(t.mark_price), bid: pos(t.best_bid_price), ask: pos(t.best_ask_price), changePct24h: fin(stats.price_change), volumeUsd24h: nonNeg(stats.volume_usd), fundingRate: fin(t.funding_8h), open: t.state === "open" };
  },
};

const kucoinFuturesPreIpo: PreIpoVenue = {
  id: "kucoinfutures",
  name: "KuCoin Futures",
  async list(fetch) {
    const rows = bodyOf(await fetch("https://api-futures.kucoin.com/api/v1/contracts/active"));
    if (isRefusal(rows)) return rows;
    if (!rows.length) return noList("kucoinfutures-preipo", "KuCoin Futures");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.symbol);
      const base = str(r.baseCurrency);
      const quote = str(r.quoteCurrency);
      const settle = str(r.settleCurrency);
      if (!id || !base || !quote || !settle) return [];
      return [{ id, symbol: `${base}/${quote}:${settle}`, base, quote, open: r.status === "Open", maxLeverage: pos(r.maxLeverage), contractSize: pos(r.multiplier), info: r }];
    });
  },
  async quote(fetch, inst) {
    const body = await fetch(`https://api-futures.kucoin.com/api/v1/contracts/${encodeURIComponent(inst.id)}`);
    if (isRefusal(body)) return body;
    const d = rec(rec(body).data);
    return { price: pos(d.lastTradePrice) ?? pos(d.markPrice), changePct24h: pct(d.priceChgPct), change24h: fin(d.priceChg), volumeUsd24h: nonNeg(d.turnoverOf24h), fundingRate: fin(d.fundingFeeRate), nextFundingAt: isoAt(d.nextFundingRateDateTime), open: d.status === "Open" };
  },
};

const mexcPreIpo: PreIpoVenue = {
  id: "mexc",
  name: "MEXC",
  async list(fetch) {
    const rows = bodyOf(await fetch("https://contract.mexc.com/api/v1/contract/detail"));
    if (isRefusal(rows)) return rows;
    if (!rows.length) return noList("mexc-preipo", "MEXC");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.symbol);
      const base = str(r.baseCoin);
      const quote = str(r.quoteCoin);
      const settle = str(r.settleCoin);
      if (!id || !base || !quote || !settle) return [];
      // MEXC's state 0 is a contract that trades (its docs: 0 enabled, 1 delivery, 2 completed, 3 offline, 4 paused)
      return [{ id, symbol: `${base}/${quote}:${settle}`, base, quote, open: r.state === 0 && r.apiAllowed !== false, maxLeverage: pos(r.maxLeverage), contractSize: pos(r.contractSize), info: r }];
    });
  },
  async quote(fetch, inst) {
    const body = await fetch(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${encodeURIComponent(inst.id)}`);
    if (isRefusal(body)) return body;
    const d = rec(rec(body).data);
    return { price: pos(d.lastPrice), bid: pos(d.bid1), ask: pos(d.ask1), changePct24h: pct(d.riseFallRate), change24h: fin(d.riseFallValue), volumeUsd24h: nonNeg(d.amount24), fundingRate: fin(d.fundingRate) };
  },
};

/** Binance's USDⓈ-M futures host. Its documented records carry no pre-IPO flag, so a perpetual named for a company is one (live/preipo.ts) */
const BINANCE_FAPI = "https://fapi.binance.com/fapi/v1";
/** the delivery date Binance writes for every perpetual, 2100-12-25 (its exchangeInfo example; the library tells a perpetual by it too) */
const BINANCE_PERPETUAL = 4_133_404_800_000;
const binancePreIpo: PreIpoVenue = {
  id: "binance",
  name: "Binance",
  async list(fetch) {
    const body = await fetch(`${BINANCE_FAPI}/exchangeInfo`);
    if (isRefusal(body)) return body;
    const rows = list(rec(body).symbols).filter(isRec);
    if (!rows.length) return noList("binance-preipo", "Binance");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.symbol);
      const base = str(r.baseAsset);
      const quote = str(r.quoteAsset);
      const settle = str(r.marginAsset);
      const perpetual = r.contractType === "PERPETUAL" || r.contractType === "TRADIFI_PERPETUAL" || fin(r.deliveryDate) === BINANCE_PERPETUAL;
      // a perpetual settled in what it is quoted in, named as the library names it (ANTHROPIC/USDT:USDT); its dated futures are not
      if (!id || !base || !quote || !settle || !perpetual || settle !== quote) return [];
      return [{ id, symbol: `${base}/${quote}:${settle}`, base, quote, open: r.status === "TRADING", info: r }];
    });
  },
  async quote(fetch, inst) {
    const [t, m] = await Promise.all([fetch(`${BINANCE_FAPI}/ticker/24hr?symbol=${encodeURIComponent(inst.id)}`), fetch(`${BINANCE_FAPI}/premiumIndex?symbol=${encodeURIComponent(inst.id)}`)]);
    if (isRefusal(t)) return t;
    const d = rec(t);
    // the mark and the funding are a second small request: without it the price still stands
    const p = isRefusal(m) ? {} : rec(m);
    return { price: pos(d.lastPrice) ?? pos(p.markPrice), changePct24h: fin(d.priceChangePercent), change24h: fin(d.priceChange), volumeUsd24h: nonNeg(d.quoteVolume), fundingRate: fin(p.lastFundingRate), nextFundingAt: isoAt(p.nextFundingTime) };
  },
};

/** Bybit's v5 market host. Its documented records carry no pre-IPO flag either (symbolType has none; isPreListing is its pre-market for coins) */
const BYBIT_MARKET = "https://api.bybit.com/v5/market";
/** how many pages of Bybit's linear list are read at most, a thousand to a page (its own most) */
const BYBIT_PAGES = 3;
/** Bybit's no inside its envelope: a retCode other than 0, read by its retMsg and its code — a place rule in its words, an IP ban (10009
 * "IP has been banned", or a time it gives), its rate limits (10006 "too many requests", 10018 "exceed ip rate limit"); anything else a
 * refusal in its own retMsg */
function bybitSaidNo(r: HttpReply, venue: string): Refusal | undefined {
  const b = rec(r.body);
  if (b.retCode === undefined || b.retCode === 0 || b.retCode === "0") return undefined;
  const code = String(b.retCode).slice(0, 12);
  const words = String(b.retMsg ?? "");
  const native = { status: r.status, said: saidOf(JSON.stringify({ retCode: b.retCode ?? null, retMsg: b.retMsg ?? null })) };
  if (REGION.test(words)) return no("E_VENUE_GEOBLOCKED", { venue, message: notServed("Bybit"), native });
  const until = bannedUntil(words);
  if (until !== undefined || code === "10009" || BANNED.test(words)) return bannedNo(venue, "Bybit", until ?? (r.retryAfterMs ? Date.now() + r.retryAfterMs : undefined), native);
  if (code === "10006" || code === "10018") return rateLimitedNo(venue, "Bybit", r.retryAfterMs, native);
  return r.status === 200 ? no("E_VENUE_REJECTED", { venue, message: `Bybit refused the request (retCode ${code})`, native }) : undefined;
}
/** what Bybit answered inside its envelope, or its no: a retCode other than 0 is a refusal in its own retMsg, whatever the HTTP status */
function bybitResult(body: unknown): Rec | Refusal {
  if (isRefusal(body)) return body;
  const b = rec(body);
  if (b.retCode === 0 || b.retCode === "0") return rec(b.result);
  return bybitSaidNo({ status: 200, body: b, text: "" }, "bybit-preipo") ?? no("E_VENUE_REJECTED", { venue: "bybit-preipo", message: "Bybit refused the request (retCode none)", native: { status: 200, said: saidOf(JSON.stringify({ retCode: null, retMsg: b.retMsg ?? null })) } });
}
const bybitPreIpo: PreIpoVenue = {
  id: "bybit",
  name: "Bybit",
  saidNo: bybitSaidNo,
  async list(fetch) {
    const rows: Rec[] = [];
    let cursor = "";
    for (let page = 0; page < BYBIT_PAGES; page++) {
      const got = bybitResult(await fetch(`${BYBIT_MARKET}/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
      // the first page refusing is Bybit's refusal; a later one leaves the pages read standing
      if (isRefusal(got)) {
        if (!rows.length) return got;
        break;
      }
      rows.push(...list(got.list).filter(isRec));
      cursor = str(got.nextPageCursor) ?? "";
      if (!cursor) break;
    }
    if (!rows.length) return noList("bybit-preipo", "Bybit");
    return rows.flatMap((r): PreIpoInstrument[] => {
      const id = str(r.symbol);
      const base = str(r.baseCoin);
      const quote = str(r.quoteCoin);
      const settle = str(r.settleCoin);
      if (!id || !base || !quote || !settle || r.contractType !== "LinearPerpetual" || settle !== quote) return [];
      return [{ id, symbol: `${base}/${quote}:${settle}`, base, quote, open: r.status === "Trading", maxLeverage: pos(rec(r.leverageFilter).maxLeverage), info: r }];
    });
  },
  async quote(fetch, inst) {
    const got = bybitResult(await fetch(`${BYBIT_MARKET}/tickers?category=linear&symbol=${encodeURIComponent(inst.id)}`));
    if (isRefusal(got)) return got;
    const t = rec(list(got.list)[0]);
    const last = pos(t.lastPrice);
    const day = since(last, pos(t.prevPrice24h));
    return { price: last ?? pos(t.markPrice), bid: pos(t.bid1Price), ask: pos(t.ask1Price), changePct24h: day.changePct, change24h: day.change, volumeUsd24h: nonNeg(t.turnover24h), fundingRate: fin(t.fundingRate), nextFundingAt: isoAt(t.nextFundingTime) };
  },
};

/** the eight exchanges, in the order the Markets screen asks them (Hyperliquid's HIP-3 deployers are their own source: hyperliquidPreIpoPublic) */
export const PRE_IPO_VENUES: readonly PreIpoVenue[] = [okxPreIpo, gatePreIpo, krakenFuturesPreIpo, deribitPreIpo, kucoinFuturesPreIpo, mexcPreIpo, binancePreIpo, bybitPreIpo];

/** one pre-IPO contract as a listing: the venue's own figures for it (`on`: the place it trades, for its name), its company, and the valuation
 * its price implies in its venue's unit; none without a price */
function preIpoListing(i: { symbol: string; base: string; quote: string; open: boolean; maxLeverage?: number | undefined; contractSize?: number | undefined; mark: PreIpoMark }, day: PreIpoQuote, on: string): Listing | undefined {
  const price = day.price;
  if (price === undefined) return undefined;
  return {
    symbol: i.symbol,
    name: `${i.mark.name} pre-IPO perpetual on ${on}`,
    kind: "perp",
    base: i.base,
    quote: i.quote,
    price,
    bid: day.bid,
    ask: day.ask,
    open: i.open && day.open !== false,
    types: [],
    ...(day.changePct24h !== undefined ? { changePct24h: day.changePct24h } : {}),
    ...(day.change24h !== undefined ? { change24h: day.change24h } : {}),
    ...(day.volumeUsd24h !== undefined ? { volumeUsd24h: day.volumeUsd24h } : {}),
    ...(day.fundingRate !== undefined ? { fundingRate: day.fundingRate, ...(day.nextFundingAt ? { nextFundingAt: day.nextFundingAt } : {}) } : {}),
    ...(i.maxLeverage !== undefined ? { maxLeverage: i.maxLeverage } : {}),
    ...(i.contractSize !== undefined ? { contractSize: i.contractSize } : {}),
    category: i.mark.category,
    group: i.mark.group,
    implied: { ...i.mark.implied, usd: impliedUsd(price, i.mark.implied.perPoint) },
    ...(i.mark.issuer ? { issuer: i.mark.issuer, eligibility: i.mark.eligibility } : {}),
  };
}

const busierFirst = (a: Listing, b: Listing): number => (b.volumeUsd24h ?? -1) - (a.volumeUsd24h ?? -1);

/** One venue's pre-IPO perpetuals, keyless (see the top of this file): its list kept LIST_MS with the venue's own flag applied
 * (live/preipo.ts), one or two small price requests a contract kept KEEP_MS, each contract a perpetual under the category "Pre-IPO" with its
 * company, its implied valuation in the venue's unit, and the issuer's words where an issuer has given some. The source's id is
 * `<venue>-preipo`, apart from the venue's spot tickers' (the service caches by id); it is the public side of the same connection, so a
 * key connected at the venue replaces it. A venue that does not serve this location says so once, on its list, and is held back ten minutes */
export function preIpoPublic(v: PreIpoVenue, deps: PublicDeps = {}): PublicSource {
  const id = `${v.id}-preipo`;
  const name = v.name;
  const clock = deps.clock ?? Date.now;
  const get = fixedHosts(deps.http ?? realHttp, PUBLIC_HOSTS, deps.timeoutMs ?? TIMEOUT_MS);
  const fetch: Fetch = async (url) => {
    let r: HttpReply;
    try {
      r = await get(url);
    } catch (err) {
      return unreachable(id, name, err);
    }
    // the venue's own no inside its envelope decides first, under HTTP 200 as under 403: OKX's place rule comes with a 200
    const own = isRec(r.body) ? v.saidNo?.(r, id) : undefined;
    if (own) return own;
    return r.status === 200 && r.body !== undefined ? r.body : publicNo(id, name, r);
  };
  type Flagged = PreIpoInstrument & { mark: PreIpoMark };
  const lists = keeper<Flagged[]>(clock, LIST_MS);
  const quotes = keeper<PreIpoQuote>(clock, KEEP_MS);
  /** the venue's list with its flag applied: only the contracts the venue's own record says are pre-IPO, priced in dollars */
  const listed = (): Promise<Flagged[] | Refusal> =>
    lists("list", async () => {
      const got = await v.list(fetch);
      if (isRefusal(got)) return got;
      return got.flatMap((inst): Flagged[] => {
        if (!inDollars(inst.quote)) return [];
        const mark = preIpoOf(v.id, inst.info, inst.base, inst.id);
        return mark ? [{ ...inst, mark }] : [];
      });
    });
  return {
    id,
    name,
    reset: () => {
      lists.clear();
      quotes.clear();
    },
    kind: "exchange",
    connectTo: v.id,
    connector: `live:exchange:${v.id}`,
    async listings(o) {
      const insts = await listed();
      if (isRefusal(insts)) return insts;
      const Q = (o.q ?? "").trim().toUpperCase();
      const want = Q ? insts.filter((i) => has(Q, i.base, i.symbol, i.id, i.mark.name, i.mark.slug)) : insts;
      const rows = await Promise.all(want.map(async (i) => ({ i, q: await quotes(i.id, () => v.quote(fetch, i)) })));
      let refused: Refusal | undefined;
      const out: Listing[] = [];
      for (const { i, q } of rows) {
        if (isRefusal(q)) {
          refused ??= q;
          continue;
        }
        const listing = preIpoListing(i, dayOf(i.day ?? {}, q), name);
        if (listing) out.push(readLike(listing, q));
      }
      // every contract refusing is the venue's refusal; one failing while the others answer is left out this time
      if (!out.length && refused) return refused;
      return out.sort(busierFirst).slice(0, Math.max(1, o.limit));
    },
  };
}

// ---- Hyperliquid's HIP-3 pre-IPO perpetuals --------------------------------------------------------------------------------------------

/** a HIP-3 dex's collateral, by its spot token index (POST /info {"type":"spotMeta"}, read 2026-10-08 — 136 KB, so it is not read each time;
 * an index, once given, is that token's for good): 0 USDC (io, xyz, para, mkts, abcd), 235 USDE (hyna), 268 USDT0 (cash), 360 USDH (flx,
 * vntl, km). The docs' example of the first dex gives none, and that dex is USDC's: a dex that names none is read as USDC. A market is
 * listed only where its collateral counts as dollars (types.ts STABLES: USDC and USDT0 do, USDE and USDH do not yet); a dex on a token this
 * table does not name is not listed */
const HL_COLLATERAL: Readonly<Record<number, string>> = { 0: "USDC", 235: "USDE", 268: "USDT0", 360: "USDH" };

/** one HIP-3 market that is a pre-IPO contract: its dex, its coin as Hyperliquid names it (io:ANTH), the company's name in it (ANTH) */
interface Hip3Market {
  dex: string;
  coin: string;
  base: string;
  quote: string;
  mark: PreIpoMark;
}

/** Hyperliquid's HIP-3 pre-IPO perpetuals, keyless (see the top of this file): every dex's list, kept ten minutes, read for markets named
 * for a company that Hyperliquid files under no other category than "preipo", not delisted; then every ninety seconds the dexes that hold
 * one, and each such market someone holds or trades, as `<dex>:<COIN>-PERP` with its line named "Hyperliquid · <dex>", its day, its
 * hourly funding, its leverage and the valuation its price implies. One refusal of perpDexs is Hyperliquid's refusal; a dex that does not
 * answer is left out until it does */
export function hyperliquidPreIpoPublic(deps: PublicDeps = {}): PublicSource {
  const id = "hyperliquid-preipo";
  const name = "Hyperliquid";
  const clock = deps.clock ?? Date.now;
  const info = hyperliquidInfo(deps.http ?? realHttp, deps.timeoutMs ?? TIMEOUT_MS);
  const ask = (q: HyperliquidAsk): Promise<unknown> => hlAsk(info, id, name, q);
  /** one dex's universe and day, kept KEEP_MS: the search for markets (every LIST_MS) and their prices (every KEEP_MS) share it */
  const dexAnswers = keeper<unknown>(clock, KEEP_MS);
  const dexRead = (dex: string): Promise<unknown> => dexAnswers(dex, () => ask({ type: "metaAndAssetCtxs", dex }));
  /** the markets that are pre-IPO contracts, kept LIST_MS — KEEP_MS when a dex or the categories did not answer, so what that missed is
   * looked for again soon */
  const finds = keeper<{ markets: Hip3Market[]; whole: boolean }>(clock, (f) => (f.whole ? LIST_MS : KEEP_MS));
  const found = (): Promise<{ markets: Hip3Market[]; whole: boolean } | Refusal> =>
    finds("markets", async () => {
      const [named, filed] = await Promise.all([ask({ type: "perpDexs" }), ask({ type: "perpCategories" })]);
      if (isRefusal(named)) return named;
      // the first entry is the first dex, written null: its perpetuals are hyperliquidPublic's
      const dexes = [...new Set(list(named).filter(isRec).map((d) => str(d.name)).filter((n): n is string => n !== undefined && HL_DEX.test(n)))];
      // Hyperliquid's category for each market; without that answer, a company's name alone decides this time
      const category = new Map<string, string>();
      if (!isRefusal(filed))
        for (const pair of list(filed)) {
          const [coin, cat] = [str(list(pair)[0]), str(list(pair)[1])];
          if (coin && cat) category.set(coin, cat);
        }
      const answers = await Promise.all(dexes.map(async (dex) => ({ dex, body: await dexRead(dex) })));
      const markets: Hip3Market[] = [];
      let refused: Refusal | undefined;
      for (const { dex, body } of answers) {
        if (isRefusal(body)) {
          refused ??= body;
          continue;
        }
        const meta = rec(list(body)[0]);
        const quote = HL_COLLATERAL[fin(meta.collateralToken) ?? 0];
        if (!quote || !inDollars(quote)) continue;
        for (const u of list(meta.universe).filter(isRec)) {
          const coin = str(u.name);
          if (!coin || !HL_COIN.test(coin) || !coin.startsWith(`${dex}:`) || u.isDelisted === true) continue;
          const base = coin.slice(dex.length + 1);
          const cat = category.get(coin);
          const mark = preIpoOf("hyperliquid", cat !== undefined ? { category: cat } : {}, base, coin);
          if (mark) markets.push({ dex, coin, base, quote, mark });
        }
      }
      // every dex refusing is Hyperliquid's refusal; one failing while the others answer is looked for again soon
      if (dexes.length && answers.every((a) => isRefusal(a.body))) return refused!;
      return { markets, whole: refused === undefined && !isRefusal(filed) };
    });
  // the dexes the last listing with nothing searched for showed, for the sentence under it
  let shown: string[] | undefined;
  const bars = hyperliquidBars(info, id, name, clock, { test: (coin) => coin.includes(":"), example: "<dex>:<COIN>-PERP (io:ANTH-PERP)" }, deps.pace ?? hostLane);
  const depth = hyperliquidDepth(info, id, name, clock, { test: (coin) => coin.includes(":"), example: "<dex>:<COIN>-PERP (io:ANTH-PERP)" });
  const funding = hyperliquidFunding(info, id, name, { test: (coin) => coin.includes(":"), example: "<dex>:<COIN>-PERP (io:ANTH-PERP)" }, deps.pace ?? hostLane);
  return {
    id,
    name,
    reset: () => {
      dexAnswers.clear();
      finds.clear();
      bars.clear();
      depth.clear();
      funding.clear();
    },
    book: depth.book,
    trades: depth.trades,
    fundingHistory: funding.history,
    kind: "exchange",
    ...HL_TRADE,
    async listings(o) {
      const got = await found();
      if (isRefusal(got)) return got;
      const Q = (o.q ?? "").trim().toUpperCase();
      const want = Q ? got.markets.filter((m) => has(Q, m.base, m.coin, m.mark.name, m.mark.slug)) : got.markets;
      const bodies = new Map(await Promise.all([...new Set(want.map((m) => m.dex))].map(async (dex) => [dex, await dexRead(dex)] as const)));
      const nextFundingAt = hlNextFunding(clock());
      const out: Listing[] = [];
      let refused: Refusal | undefined;
      for (const m of want) {
        const body = bodies.get(m.dex);
        if (isRefusal(body)) {
          refused ??= body;
          continue;
        }
        const answer = list(body);
        const universe = list(rec(answer[0]).universe).filter(isRec);
        const ctxs = list(answer[1]).filter(isRec);
        const at = universe.length === ctxs.length ? universe.findIndex((u) => u.name === m.coin) : -1;
        if (at < 0 || universe[at]!.isDelisted === true) continue;
        const c = ctxs[at]!;
        const volume = nonNeg(c.dayNtlVlm);
        // anyone may deploy a HIP-3 market: one that nobody holds or trades is not shown
        if (!((nonNeg(c.openInterest) ?? 0) > 0 || (volume ?? 0) > 0)) continue;
        const price = pos(c.midPx) ?? pos(c.markPx);
        const day = since(price, pos(c.prevDayPx));
        const venueName = `${name} · ${m.dex}`;
        const listing = preIpoListing({ symbol: `${m.coin}-PERP`, base: m.base, quote: m.quote, open: true, maxLeverage: pos(universe[at]!.maxLeverage), mark: m.mark }, { price, changePct24h: day.changePct, change24h: day.change, volumeUsd24h: volume, fundingRate: fin(c.funding), nextFundingAt }, venueName);
        if (listing) out.push(readLike({ ...listing, venueName, ...hlPerpFigures(universe[at]!, c, price) }, c));
      }
      if (!out.length && refused) return refused;
      const pool = out.sort(busierFirst).slice(0, Math.max(1, o.limit));
      if (!Q) shown = [...new Set(pool.map((l) => l.venueName!.slice(name.length + 3)))];
      return pool;
    },
    candles: bars,
    notes: (o) => (!o.q?.trim() && shown?.length ? [`${name} · ${shown.join(", ")}: pre-IPO perpetuals on Hyperliquid's HIP-3 markets, which anyone may deploy; shown while someone holds or trades one.`] : []),
  };
}

/** every public source, in the order the Markets screen asks them: the exchanges (PUBLIC_EXCHANGES unless others are named), Kalshi,
 * Polymarket, Polymarket US, Hyperliquid's perpetuals, US stocks (real-time public quotes, Cboe's delayed ones behind them), Robinhood's Stock Tokens, xStocks at Gate, Ondo
 * Stocks as LI.FI prices them, the eight exchanges' pre-IPO perpetuals and Hyperliquid's HIP-3 ones. The stocks come before the Stock
 * Tokens: a paper account lists a symbol by the first source that names it (paper.ts), and "NVDA" there is the share, not Robinhood's
 * token of it. Made once and kept: what each keeps lives in it */
export function publicSources(deps: PublicDeps & { exchanges?: readonly string[] | undefined } = {}): PublicSource[] {
  return [...(deps.exchanges ?? PUBLIC_EXCHANGES).map((x) => exchangeTickers(x, deps)), kalshiPublic(deps), polymarketPublic(deps), polymarketUsPublic(deps), hyperliquidPublic(deps), usStocksPublic(deps), stockTokensPublic(deps), xstocksPublic(deps), ondoStocksPublic(deps), ...PRE_IPO_VENUES.map((v) => preIpoPublic(v, deps)), hyperliquidPreIpoPublic(deps)];
}
