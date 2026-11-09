/* THE COMMAND LINE (GO): the top bar's box takes a function as well as a search, the way a market terminal's line does. What is typed is
     a market and a function    AAPL DES · BTC GP · NVDA FA — the market first, as a terminal has it; DES AAPL is read the same
     a function alone           MOST · PORT · HELP
     a function and words       HELP chart
   and Enter goes there. Anything else is the search it always was: the matches under the box, Enter filtering the Markets list.

   THE FUNCTIONS are one table (CMD_GROUPS): each a short code — a terminal's own mnemonic where it has one for the same thing (DES, GP,
   QM, FA, CF, MOST, PORT, ALRT) — a name, what it takes (`takes`: "market", "market?" where the market may be left out, "words", or
   nothing), one line of what it shows, an example, and what running it does. Nothing here signs or sends anything: a function opens a
   page, the drawer, a sheet or the ticket, and whatever is signed is signed there, as ever. A part that adds a page adds its row here.

   A MARKET is named by what the account's search finds for the words before the function: the matches come as rows under the box, each
   "market › FUNCTION", the first the one Enter takes — so a name two markets share (BTC the coin, BTC the perpetual) is settled by picking
   the row, or by a kind word before the function (BTC PERP GP · AAPL STOCK DES: CMD_KINDS). A code that is also a ticker (FA, GP, SIM) is
   the function when it is typed alone; the market of that name is the row under it.

   The shell hears the box (shell.js): cmdQuery(text) is what it asks the search for, cmdPalette(text, body) the function rows over the
   market rows, cmdEnter(text, body) Enter's answer (true: a function ran, or will once its market is read), cmdChoose(i, text) a row
   pressed, cmdFilter(text) what the Markets list is narrowed to while it is typed. HELP lists every function (cmdHelpHtml). */

/* a kind word before the function narrows the market to that kind */
const CMD_KINDS = { COIN: "coin", CRYPTO: "coin", SPOT: "coin", STOCK: "stock", SHARE: "stock", EQUITY: "stock", PERP: "perp", PERPETUAL: "perp", EVENT: "event", PREDICTION: "event", RWA: "rwa", TOKEN: "rwa" };
/* the rows a function is offered over, at most (the account's search is asked for as many: shell.js SH_PAL_MAX) */
const CMD_ROWS = 8;
/* the functions offered for a market whose function is still to be typed (AAPL and a space), at most */
const CMD_OFFERED = 6;

/* a market's page (the drawer), and then one of its parts brought into view once it has slid in */
function cmdOpen(item, part) {
  if (typeof openMarket !== "function") return;
  openMarket(item);
  if (!part) return;
  drawerLater(() => nextFrame(() => {
    const el = $("drawer").querySelector(`[data-sec="${part}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
  }));
}
/* its candles: the Trade page's own chart at the venue that takes its orders; a market no connected venue trades has its price history in
   its drawer, from the venue that lists it */
function cmdChart(item) {
  // an event contract's chart is its first outcome's, as its drawer's is
  const first = item.kind === "event" && item.outcomes && item.outcomes.length ? 0 : undefined;
  const r = typeof mkRoute === "function" ? mkRoute(item, first) : null;
  if (r && r.act === "trade" && typeof mkTicket === "function") return void mkTicket({ venue: r.venue, symbol: r.symbol, side: "buy", ...(first === 0 ? { outcome: item.outcomes[0].label } : {}) }, item);
  cmdOpen(item, "chart");
}
/* a US share's ticker, or the sentence that says why a function that reads the SEC's filings has nothing for this market */
const cmdFiled = (code) => (item) => (typeof mkTicker === "function" && mkTicker(item) && !(typeof mkIsPreipo === "function" && mkIsPreipo(item)) ? "" : `${code} reads a US company's own filings with the SEC: ${item.name} is not a US share.`);
const cmdTab = (tab, sort) => () => go("markets", { tab, ...(sort ? { sort } : {}) });
/* a US share's ticker, or the sentence that says why a function that reads Nasdaq's calendar for a share has nothing for this market */
const cmdShare = (code) => (item) => (typeof mkTicker === "function" && mkTicker(item) && !(typeof mkIsPreipo === "function" && mkIsPreipo(item)) ? "" : `${code} reads Nasdaq's calendar for a US share: ${item.name} is not one.`);

/* a US share's ticker, or the sentence that says why a function that reads Nasdaq's page for a share has nothing for this market */
const cmdListed = (code) => (item) => (typeof mkTicker === "function" && mkTicker(item) && !(typeof mkIsPreipo === "function" && mkIsPreipo(item)) ? "" : `${code} reads Nasdaq's page for a US share: ${item.name} is not one.`);
/* a share's own page where the market is a US share, else its drawer */
const cmdSecurity = (part) => (c) => (typeof scGo === "function" && typeof mkTicker === "function" && mkTicker(c.item) && !(typeof mkIsPreipo === "function" && mkIsPreipo(c.item)) ? scGo(mkTicker(c.item), part) : cmdOpen(c.item));
/* a US share's ticker or BTC / ETH, or the sentence that says why a function that reads a listed option chain has nothing for this market */
const cmdOptions = (code) => (item) => (typeof opSymbolOf === "function" && opSymbolOf(item) ? "" : `${code} reads a listed option chain — Cboe's for a US share, Deribit's for BTC and ETH: ${item.name} has none here.`);

/* every function, in the groups HELP shows them in. `only(item)`: a sentence when the function has nothing for that market, else "" */
const CMD_GROUPS = [
  {
    group: "A market",
    note: "The market first, then the function: AAPL DES. A kind word narrows a name two markets share: BTC PERP GP.",
    fns: [
      { code: "DES", name: "Description", takes: "market", what: "A US share's own page — the company, the figures, the analysts, the earnings, the dividends, the short interest, the holders; any other market's drawer", eg: "AAPL DES", run: cmdSecurity("des") },
      { code: "ANR", name: "Analysts", takes: "market", what: "The analysts' consensus on a US share: the rating, buy / hold / sell, the targets against the price, a year of history", eg: "AAPL ANR", only: cmdListed("ANR"), run: cmdSecurity("anr") },
      { code: "EE", name: "Earnings estimates", takes: "market", what: "A US share's last quarters against consensus, and the quarters and years ahead with their estimates and revisions", eg: "NVDA EE", only: cmdListed("EE"), run: cmdSecurity("ee") },
      { code: "SI", name: "Short interest", takes: "market", what: "A US share's short interest by settlement, with days to cover", eg: "TSLA SI", only: cmdListed("SI"), run: cmdSecurity("si") },
      { code: "HDS", name: "Holders", takes: "market", what: "Who holds a US share: the institutions, who increased and decreased, the largest holders; the insiders' trades", eg: "AAPL HDS", only: cmdListed("HDS"), run: cmdSecurity("hds") },
      { code: "GP", name: "Price chart", takes: "market", what: "Its candles on the Trade page, at the venue that trades it", eg: "BTC GP", run: (c) => cmdChart(c.item) },
      { code: "QM", name: "Quote montage", takes: "market", what: "Its price at every venue that lists it, the best first", eg: "ETH QM", run: (c) => cmdOpen(c.item, "across") },
      { code: "FA", name: "Financials", takes: "market", what: "A US company's revenue, income and earnings a share, as it filed them with the SEC", eg: "NVDA FA", only: cmdFiled("FA"), run: (c) => cmdOpen(c.item, "financials") },
      { code: "CF", name: "Company filings", takes: "market", what: "A US company's record at the SEC and its newest filings", eg: "AAPL CF", only: cmdFiled("CF"), run: (c) => cmdOpen(c.item, "company") },
      { code: "BUY", name: "Buy", takes: "market", what: "The order ticket set to buy it: nothing goes until you sign", eg: "SOL BUY", run: (c) => typeof mkTrade === "function" && mkTrade(c.item, "buy") },
      { code: "SELL", name: "Sell", takes: "market", what: "The order ticket set to sell it: nothing goes until you sign", eg: "SOL SELL", run: (c) => typeof mkTrade === "function" && mkTrade(c.item, "sell") },
      { code: "HAND", name: "Hand to agent", takes: "market", what: "Write what you want done with it, for your agents to read: it grants nothing", eg: "BTC HAND", run: (c) => typeof mkHand === "function" && mkHand(c.item) },
      { code: "ALRT", name: "Price alerts", takes: "market?", what: "Be told when its price crosses a line; alone, every alert you set", eg: "BTC ALRT", run: (c) => (c.item ? typeof openAlertSheet === "function" && openAlertSheet(c.item) : go("markets", { tab: "watching" })) },
      { code: "OMON", name: "Option chain", takes: "market?", what: "Its listed options: every expiry's at-the-money IV, put/call, max pain, straddle and skew, and one expiry's strikes — Cboe's quotes for a US share, Deribit's for BTC and ETH; alone, the last chain read", eg: "AAPL OMON", only: cmdOptions("OMON"), run: (c) => (typeof opGo === "function" ? opGo(c.item ? opSymbolOf(c.item) : "", "chain") : go("options")) },
      { code: "SKEW", name: "Volatility skew", takes: "market?", what: "Its implied volatility by expiry and by strike: the term structure, the smile, the 25-delta skew", eg: "SPY SKEW", only: cmdOptions("SKEW"), run: (c) => (typeof opGo === "function" ? opGo(c.item ? opSymbolOf(c.item) : "", "skew") : go("options")) },
      { code: "CN", name: "Company news", takes: "market", what: "Its headlines from the publishers' feeds: a US share's own feed, a coin by its name", eg: "NVDA CN", only: (item) => (typeof mkNewsAsk === "function" && mkNewsAsk(item) ? "" : `CN reads the headlines that name a market: ${item.name} is not one a headline would name.`), run: (c) => cmdOpen(c.item, "news") },
    ],
  },
  {
    group: "The world",
    fns: [
      { code: "WEI", name: "World indices", takes: "", what: "The S&P 500, Nasdaq-100, Dow, Russell, MSCI EAFE and EM, the VIX — Cboe's quotes, fifteen minutes behind", eg: "WEI", run: () => (typeof wdGo === "function" ? wdGo("indices") : go("world")) },
      { code: "GC", name: "Yield curve", takes: "", what: "The US Treasury's par curve, beside a month and a year before, with its spreads", eg: "GC", run: () => (typeof wdGo === "function" ? wdGo("rates") : go("world")) },
      { code: "FXC", name: "Currencies", takes: "", what: "Kraken's live pairs, and the ECB's fixing for the rest", eg: "FXC", run: () => (typeof wdGo === "function" ? wdGo("fx") : go("world")) },
      { code: "GLCO", name: "Commodities", takes: "", what: "Gold, silver, copper, oil, gas as Hyperliquid's xyz oracles price them, around the clock", eg: "GLCO", run: () => (typeof wdGo === "function" ? wdGo("commodities") : go("world")) },
    ],
  },
  {
    group: "News and the calendar",
    fns: [
      { code: "TOP", name: "Top news", takes: "", what: "The day's headlines from the publishers' own feeds: the markets, the central banks, crypto", eg: "TOP", run: () => go("news") },
      { code: "N", name: "News search", takes: "words", what: "The headlines that carry these words", eg: "N fed rates", run: (c) => go("news", c.tail ? { q: c.tail } : {}) },
      { code: "ECO", name: "Economic calendar", takes: "", what: "Today's releases with their time, consensus and what came out, from Nasdaq's calendar", eg: "ECO", run: () => go("calendar", { kind: "economic" }) },
      { code: "ERN", name: "Earnings calendar", takes: "market?", what: "Who reports today, before the open or after the close, and the EPS expected; a share's own week", eg: "AAPL ERN", only: cmdShare("ERN"), run: (c) => go("calendar", { kind: "earnings", ...(c.item ? { symbol: mkTicker(c.item) } : {}) }) },
      { code: "DVD", name: "Dividends", takes: "market?", what: "A share's dividends paid, on its own page; alone, the shares going ex-dividend today with the amount and the payment day", eg: "DVD", only: cmdShare("DVD"), run: (c) => (c.item ? cmdSecurity("dvd")(c) : go("calendar", { kind: "dividends" })) },
      { code: "SPLT", name: "Splits", takes: "", what: "The splits Nasdaq lists around today", eg: "SPLT", run: () => go("calendar", { kind: "splits" }) },
      { code: "IPO", name: "IPOs", takes: "", what: "The month's IPOs by stage: priced, expected, filed, withdrawn", eg: "IPO", run: () => go("calendar", { kind: "ipos" }) },
    ],
  },
  {
    group: "Markets",
    fns: [
      { code: "COMP", name: "Compare", takes: "market?", what: "A few markets rebased together, with each one's return, volatility, drawdown and Sharpe; with a market, it joins the set", eg: "NVDA COMP", run: (c) => (typeof anShow === "function" ? anShow(c.item, "comp") : go("analytics")) },
      { code: "CORR", name: "Correlation", takes: "market?", what: "How the markets in the set move together: the correlation of their bar returns", eg: "CORR", run: (c) => (typeof anShow === "function" ? anShow(c.item, "corr") : go("analytics", { view: "corr" })) },
      { code: "HVG", name: "Historical volatility", takes: "market?", what: "The rolling 20- and 60-bar volatility of each market in the set, annualised", eg: "BTC HVG", run: (c) => (typeof anShow === "function" ? anShow(c.item, "hvg") : go("analytics", { view: "hvg" })) },
      { code: "BETA", name: "Beta", takes: "market?", what: "Each market's beta, correlation and alpha to the first in the set", eg: "AAPL BETA", run: (c) => (typeof anShow === "function" ? anShow(c.item, "beta") : go("analytics", { view: "beta" })) },
      { code: "SEAG", name: "Seasonality", takes: "market?", what: "The average return by calendar month and by weekday, over the years the bars cover", eg: "SPY SEAG", run: (c) => (typeof anShow === "function" ? anShow(c.item, "seag") : go("analytics", { view: "seag" })) },
      { code: "EQS", name: "Equity screener", takes: "", what: "Every US-listed share as Nasdaq lists it, screened by sector, industry, size, price, the day's change, volume, IPO year or words", eg: "EQS", run: () => (typeof eqShow === "function" ? eqShow("table") : go("screener")) },
      { code: "IMAP", name: "Sector map", takes: "", what: "The sectors as tiles sized by market cap and coloured by the day; a sector opens into its industries", eg: "IMAP", run: () => (typeof eqShow === "function" ? eqShow("map") : go("screener", { view: "map" })) },
      { code: "MON", name: "Monitor", takes: "market?", what: "One screen of tiles you compose — markets, the world's boards, headlines, today's calendar, an option chain; with a market, that market joins it", eg: "AAPL MON", run: (c) => (c.item && typeof monAdd === "function" ? monAdd("m", c.item.key) : go("monitor")) },
      { code: "MOST", name: "Most traded", takes: "", what: "Every market, the busiest first", eg: "MOST", run: cmdTab("all") },
      { code: "MOV", name: "Biggest moves", takes: "", what: "Every market by its last 24 hours", eg: "MOV", run: cmdTab("all", "movers") },
      { code: "WATCH", name: "Watchlist", takes: "", what: "The markets you starred, and your price alerts", eg: "WATCH", run: cmdTab("watching") },
      { code: "CRYP", name: "Crypto", takes: "", what: "Coins at your venues and in the public listings", eg: "CRYP", run: cmdTab("crypto") },
      { code: "STK", name: "Stocks", takes: "", what: "US shares and ETFs, with the session they are in", eg: "STK", run: cmdTab("stocks") },
      { code: "PERP", name: "Perpetuals", takes: "", what: "Perpetual contracts: mark, funding, volume", eg: "PERP", run: cmdTab("perps") },
      { code: "PRED", name: "Predictions", takes: "", what: "Event contracts, and what closes soonest", eg: "PRED", run: cmdTab("predictions") },
      { code: "PIPO", name: "Pre-IPO", takes: "", what: "Contracts on private companies' valuations", eg: "PIPO", run: cmdTab("preipo") },
      { code: "RWA", name: "Tokenized assets", takes: "", what: "Stock tokens and other real-world assets on chain", eg: "RWA", run: cmdTab("rwas") },
    ],
  },
  {
    group: "Trading and the lab",
    fns: [
      { code: "TKT", name: "Order ticket", takes: "", what: "The Trade page with its ticket open", eg: "TKT", run: () => (typeof openTicket === "function" ? openTicket({}) : go("trade")) },
      { code: "SA", name: "Superagent", takes: "", what: "The desk of AI seats trading a paper account by itself", eg: "SA", run: () => go("superagent") },
      { code: "BT", name: "Backtest", takes: "", what: "A strategy over recorded bars through the paper account, every run counted", eg: "BT", run: () => go("backtest") },
      { code: "SIM", name: "Simulator", takes: "", what: "A past day played back blind, scored at its bell", eg: "SIM", run: () => go("practice") },
      { code: "DEB", name: "Debrief", takes: "", what: "Why the paper trades made or lost money", eg: "DEB", run: () => go("debrief") },
    ],
  },
  {
    group: "Account",
    fns: [
      { code: "PORT", name: "Portfolio", takes: "", what: "What you hold, what waits for you, the net worth over time", eg: "PORT", run: () => go("portfolio") },
      { code: "RISK", name: "Risk", takes: "", what: "Your lines weighed and measured: exposure, volatility, one-day value at risk, betas to SPY and BTC, the net worth's drawdown, what a flat move would be", eg: "RISK", run: () => go("risk") },
      { code: "VEN", name: "Venues", takes: "", what: "The accounts connected, and where you can connect", eg: "VEN", run: () => go("venues") },
      { code: "MEM", name: "Memory", takes: "", what: "What each agent remembers about you", eg: "MEM", run: () => go("memory") },
      { code: "AGT", name: "Agents", takes: "", what: "The desk's seats and your own agents, with their limits", eg: "AGT", run: () => go("desk") },
      { code: "STMT", name: "Statement", takes: "", what: "Every transaction at your venues, to filter and export", eg: "STMT", run: () => typeof openStatement === "function" && openStatement() },
      { code: "SET", name: "Settings", takes: "", what: "The cap on an order, devices, the background, the version", eg: "SET", run: () => typeof openSettings === "function" && openSettings() },
      { code: "KEYS", name: "Keyboard", takes: "", what: "The page's keys", eg: "KEYS", run: () => typeof openShortcuts === "function" && openShortcuts() },
      { code: "HELP", name: "Functions", takes: "words", what: "Every function with an example; a word after it narrows the list", eg: "HELP chart", run: (c) => cmdHelp(c.tail) },
    ],
  },
];
const CMD_FNS = CMD_GROUPS.flatMap((g) => g.fns);
const CMD_BY = new Map(CMD_FNS.map((f) => [f.code, f]));
const cmdTakesMarket = (f) => !!f && (f.takes === "market" || f.takes === "market?");
/* the rows last drawn under the box, by their data-cmd-i: what a press, or Enter, runs */
const CMD = { rows: [] };

/** WHAT WAS TYPED, READ AS A FUNCTION: { fn, market, kind, tail, ready } — the function, the words that name its market (and the kind a
 * kind word asked for), the words after a function that takes words, and whether it can run as it stands (a function that needs a market
 * has one named). Null where it is not a function: a search. The function is the last word where that word is one that takes a market
 * (AAPL DES), else the first (HELP chart · DES AAPL); a function that takes nothing is one only when it stands alone */
function cmdParse(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (!words.length) return null;
  const at = (i) => CMD_BY.get(String(words[i]).toUpperCase());
  const first = at(0);
  const last = at(words.length - 1);
  if (words.length === 1) return last ? cmdParsed(last, [], "") : null;
  if (cmdTakesMarket(last)) return cmdParsed(last, words.slice(0, -1), "");
  if (first && first.takes === "words") return cmdParsed(first, [], words.slice(1).join(" "));
  if (cmdTakesMarket(first)) return cmdParsed(first, words.slice(1), "");
  return null;
}
function cmdParsed(fn, named, tail) {
  const w = [...named];
  const kind = w.length > 1 ? CMD_KINDS[String(w[w.length - 1]).toUpperCase()] || "" : "";
  if (kind) w.pop();
  const market = w.join(" ").slice(0, 60);
  return { fn, market, kind, tail: String(tail || "").slice(0, 80), ready: fn.takes !== "market" || !!market };
}
/* the functions a word starts: by its code first, then — three letters or more — by a word of its name (chart → GP) */
function cmdStarts(word) {
  const w = String(word || "").trim().toUpperCase();
  if (!w) return [];
  const by = CMD_FNS.filter((f) => f.code.startsWith(w));
  const named = w.length < 3 ? [] : CMD_FNS.filter((f) => !by.includes(f) && f.name.toUpperCase().split(/[^A-Z0-9]+/).some((n) => n.startsWith(w)));
  return [...by, ...named];
}
/** what the account's search is asked for while this is in the box: a function's market; the whole of it for a function alone (a market
 * of that name is offered under it) and for a search; the words before a function still being typed (AAPL D); nothing for a function
 * that takes words */
function cmdQuery(text) {
  const t = String(text || "").trim();
  const p = cmdParse(t);
  if (p) return p.fn.takes === "words" ? "" : p.market || t;
  const words = t.split(/\s+/);
  return words.length > 1 && cmdStarts(words[words.length - 1]).some(cmdTakesMarket) ? words.slice(0, -1).join(" ") : t;
}
/** what the Markets list is narrowed to as this is typed: the words that name a market, never a function's code */
function cmdFilter(text) {
  const p = cmdParse(text);
  return p ? p.market : cmdQuery(text);
}
/* the account's search for a market named so: the read the box's palette makes (shell.js), so one answer serves both */
const cmdFind = (q) => `/api/account/explore?q=${encodeURIComponent(q)}&limit=${CMD_ROWS}`;
/* a function's own word on a market it has nothing for, or "" */
const cmdNo = (fn, item) => (typeof fn.only === "function" ? fn.only(item) || "" : "");

/** THE ROWS OVER THE SEARCH'S OWN, for what is in the box (`raw`, as typed: a space after a market asks which functions it has) and the
 * search's answer for cmdQuery(raw) (`body`; null while it is on its way). Each row is { fn } and one of: item (a market to run it on;
 * `no` where the function has nothing for it; `lead` where the rows are one market's functions, so the function leads the row and the
 * market is said once over them), wait (the market is being looked for), none (no market of that name), fill (a function that needs a
 * market: pressing it writes its code, for the market to follow), or nothing more (it runs as it stands, with `tail`) */
function cmdRows(raw, body) {
  const t = String(raw || "").trim();
  if (!t) return [];
  const p = cmdParse(t);
  const items = body && Array.isArray(body.items) ? body.items.filter((x) => x && Array.isArray(x.at)) : null;
  const on = (fn, item) => ({ fn, item, no: cmdNo(fn, item) });
  if (p && p.market) {
    if (!items) return [{ fn: p.fn, wait: true }];
    const hits = items.filter((x) => !p.kind || x.kind === p.kind).slice(0, CMD_ROWS);
    return hits.length ? hits.map((item) => on(p.fn, item)) : [{ fn: p.fn, none: p.market }];
  }
  if (p) return [p.ready ? { fn: p.fn, tail: p.tail } : { fn: p.fn, fill: true }];
  const words = t.split(/\s+/);
  const open = /\s$/.test(String(raw));
  // one word, still being typed: the functions it starts
  if (words.length === 1 && !open) return cmdStarts(t).slice(0, 4).map((fn) => (fn.takes === "market" ? { fn, fill: true } : { fn, tail: "" }));
  // a market, and its function still to come (AAPL and a space) or half typed (AAPL D): what the first match has
  const offered = open ? CMD_FNS.filter(cmdTakesMarket).slice(0, CMD_OFFERED) : cmdStarts(words[words.length - 1]).filter(cmdTakesMarket).slice(0, CMD_OFFERED);
  return items && items.length && offered.length ? offered.map((fn) => ({ ...on(fn, items[0]), lead: true })) : [];
}
/* a market in a word: a coin's or a share's symbol, anything else by its short name */
const cmdName = (x) => String((x.kind !== "event" && x.base) || (typeof mkShort === "function" ? mkShort(x).name : x.name) || "");
/* a market as the search's own rows name it (ui/markets.js), plainly where that part is not there */
const cmdMarketHtml = (x) => `${typeof mkAv === "function" ? mkAv(x) : ""}<span class="pal-name"><b>${typeof mkShortHtml === "function" ? mkShortHtml(x) : esc(String(x.name || ""))}</b><span class="dim">${esc([typeof mkSub === "function" ? mkSub(x) : "", x.at[0] && x.at[0].venueName].filter(Boolean).join(" · "))}</span></span>`;
/* the rows as the palette's own: a function by its code, name and one line; one function over the markets its words match, each market
   with the function at its right; one market's functions under a line that names the market. A function with nothing for the market is
   dimmed and says so */
function cmdRowsHtml(rows) {
  const lead = rows.find((r) => r.lead);
  const over = lead ? `<div class="menu-h" role="presentation">Functions for ${esc(cmdName(lead.item))}</div>` : "";
  return over + rows.map((r, i) => {
    const f = r.fn;
    const code = `<kbd class="cmd-code">${esc(f.code)}</kbd>`;
    const off = r.no ? ' aria-disabled="true"' : "";
    if (r.wait) return `<div class="menu-h" role="presentation">${code} Looking for the market…</div>`;
    if (r.none) return `<div class="menu-h" role="presentation">${code} Nothing matches “${esc(r.none)}”</div>`;
    if (r.item && !r.lead) return `<button type="button" role="option" data-cmd-i="${i}"${off}>${cmdMarketHtml(r.item)}<span class="cmd-go">${code}<span class="dim">${esc(r.no ? "Not for this market" : f.name)}</span></span></button>`;
    return `<button type="button" role="option" data-cmd-i="${i}"${off}>${code}<span class="pal-name"><b>${esc(f.name)}</b><span class="dim">${esc(r.no ? "Not for this market" : r.fill ? `Takes a market: ${f.eg}` : f.what)}</span></span></button>`;
  }).join("");
}
/** what the shell draws under the box for `raw`: the function rows (kept in CMD.rows for a press), whether the search's own rows follow
 * them — not where every row is already a market with its function — and what those are a search for */
function cmdPalette(raw, body) {
  const rows = cmdRows(raw, body);
  CMD.rows = rows;
  const p = cmdParse(raw);
  return { html: cmdRowsHtml(rows), rows: rows.length, markets: !(p && (p.market || p.fn.takes === "words")), q: cmdQuery(raw) };
}

/* the box is done with: emptied, its rows closed, the focus let go so the page's keys are heard again */
function cmdDone() {
  const box = $("search");
  if (box) {
    box.value = "";
    if (box.blur) box.blur();
  }
  if (typeof shPaletteClose === "function") shPaletteClose();
}
/** ONE ROW RUN: a function on its market, or as it stands. A row that cannot run says why (no market of that name, a function with
 * nothing for this market); one that needs a market first writes its code in the box. What ran is kept with the recent searches */
function cmdRun(row, text) {
  if (!row || !row.fn || row.wait) return;
  if (row.none) return void toast(`No market matches “${row.none}”.`, "info");
  if (row.no) return void toast(row.no, "info");
  if (row.fill) {
    const box = $("search");
    box.value = `${row.fn.code} `;
    if (box.focus) box.focus();
    return void (typeof shPaletteRead === "function" && shPaletteRead(box.value));
  }
  // kept as it was typed where that is the function itself; a row offered while it was being typed is kept as it would be typed
  const typed = String(text || "").trim();
  const whole = cmdParse(typed);
  if (typeof shSearchRemember === "function") shSearchRemember(whole && whole.ready && whole.fn === row.fn ? typed : `${row.item ? `${cmdQuery(typed)} ` : ""}${row.fn.code}`);
  cmdDone();
  try {
    row.fn.run({ item: row.item || null, tail: row.tail || "" });
  } catch (err) {
    console.error(err);
    toast(`${row.fn.code} could not be opened: ${(err && err.message) || err}`, "no");
  }
}
/** a row pressed (its data-cmd-i) */
function cmdChoose(i, text) {
  cmdRun(CMD.rows[i], text);
}
/** ENTER IN THE BOX: true where what is typed is a function that can run — it runs now, or, where it names a market, on the first match
 * the function has something for (read first where the search's answer for it is not in hand: `body` is that answer, or null). False
 * where it is a search, or a function still waiting for its market: the shell then filters Markets as it always did */
function cmdEnter(text, body) {
  const t = String(text || "").trim();
  const p = cmdParse(t);
  if (!p || !p.ready) return false;
  const pick = (b) => {
    const rows = cmdRows(t, b);
    cmdRun(rows.find((r) => r.item && !r.no) || rows[0], t);
  };
  if (!p.market || body) return pick(body), true;
  if (!A) return true;
  api(cmdFind(p.market), { ttl: 20_000 }).then((b) => pick(b && b.ok !== false && Array.isArray(b.items) ? b : { items: [] }));
  return true;
}

/** HELP: every function by its group — its code, its name, what it shows and an example — narrowed to the ones a word names (their code,
 * name or line), with the whole list under a word nothing matches */
function cmdHelpHtml(words) {
  const q = String(words || "").trim().toLowerCase();
  const hit = (f) => !q || [f.code, f.name, f.what].some((s) => s.toLowerCase().includes(q));
  const any = !q || CMD_FNS.some(hit);
  const groups = CMD_GROUPS.map((g) => ({ ...g, fns: any ? g.fns.filter(hit) : g.fns })).filter((g) => g.fns.length);
  const said = q ? `<p class="small dim cmd-help-note">${any ? `Functions that mention “${esc(q)}”.` : `No function mentions “${esc(q)}”: here is every one.`}</p>` : "";
  return `<p class="small dim cmd-help-note">Type a function in the box at the top (${typeof SH_MOD === "string" ? esc(SH_MOD) : "Ctrl"} K or / from anywhere) and press Enter. A function opens a page, a market's drawer or the ticket: nothing is signed or sent from the box.</p>${said}${groups.map((g) => `<section class="sheet-sec"><h3 class="label">${esc(g.group)}</h3>${g.note ? `<p class="small dim cmd-help-note">${esc(g.note)}</p>` : ""}<dl class="cmd-fns">${g.fns.map((f) => `<div><dt><kbd class="cmd-code">${esc(f.code)}</kbd></dt><dd><b>${esc(f.name)}</b> <span class="dim">${esc(f.what)}</span><span class="cmd-eg mono">${esc(f.eg)}</span></dd></div>`).join("")}</dl></section>`).join("")}`;
}
function cmdHelp(words) {
  openSheet(cmdHelpHtml(words), { title: "Functions" });
}
