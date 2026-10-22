/* Markets: what there is to trade — at the venues the owner connected, and (read without a key, "Connect to trade") at the venues not
   connected — from GET /api/account/explore, in the tabs it returns: All (one table, sorted here), Crypto, Stocks, RWAs, Perps, Pre-IPO,
   Predictions (Yes/No cards whose prices are asked again only while a card is in view and the page is in view: GET /api/account/quotes),
   and Watching — the owner's watchlist, and under it the owner's PRICE ALERTS. Over the All tab THE PULSE (after OpenStock's dashboard):
   the US stock market's session with a countdown, and the day in six figures — the S&P 500, Nasdaq 100, Dow and Russell 2000 by the ETFs
   that track them, Bitcoin and Ethereum — each a tile that opens the market. One market in THE ONE DRAWER (openMarket; a holding opens it
   by its key through openAsset, asset.js): its price, its history, every venue's price for it, what is held — positions to close, orders to
   cancel, what was paid — its price alerts, what the agents are doing in it, and its lines on the statement. Markets manages no accounts:
   connections live under Portfolio › Accounts and the Connect picker.
   Every button does what it says through the account's own door: an order opens the ticket and is signed there; ★ is a signed setWatch; 🔔
   opens the alert sheet, whose Set is a signed setAlert (the account itself prices the market every half minute and says the alert when it
   fires: service.ts watchAlerts, shell.js shAlertToast) and whose Remove is a signed setAlert too; "Connect to trade" opens that connection's
   own form; Cancel is a signed liveCancel (core cancelOrder); Close… is the Trade pane's signed close. Where a venue refuses, its own words
   are shown, and what fixes it. Nothing here is a sample. */

/* what the pane holds between draws: the shell's last ctx; each explore read by its path ({ at, body, good, pending }); the rows drawn, by
   their data-i; fresh prices by "venue|symbol"; the cards in view; the market in the drawer; whether the footer is unfolded */
const MKT = { ctx: null, got: new Map(), good: null, reg: [], quotes: new Map(), seen: new Set(), io: null, watched: new Set(), poll: 0, tick: 0, el: null, open: null, drawerWired: false, footOpen: false, closes: null, closeGen: -1, pricesDue: false, drawSoon: false };
/* an explore read is asked again after this long, when the pane is drawn (the account keeps the same answer thirty seconds) */
const MKT_TTL = 20_000;
/* how often the cards in view, and the market in the drawer, ask for a fresh price; how long one is shown as fresh */
const MKT_POLL_MS = 5_000;
const MKT_FRESH_MS = 30_000;
/* a price whose own time (quoteAt) is further behind the clock than this says when it is from, beside its source (mkQuoteWords): a
   real-time source's last trade can be yesterday's in pre-market, Cboe's is fifteen minutes behind at the least. Nasdaq stamps a trade to
   its minute, so a trade a minute old may read as two */
const MKT_QUOTE_OLD_MS = 120_000;
/* the explore tabs, in the order the page shows them (the account returns only those with something in them; its legacy `now` is All). They
   are the Trade pane's kind ids too: a row's kind id (mkKindOf) is what the ticket is opened with */
const MKT_TAB_IDS = ["all", "crypto", "stocks", "rwas", "perps", "preipo", "predictions"];
const MKT_LEGACY_TABS = { now: "all", venues: "all" };
const MKT_SORTS = ["volume", "movers", "closing"];
const MKT_KIND = { coin: "Crypto", stock: "Stock", perp: "Perpetual", rwa: "Tokenized asset", event: "Prediction", stable: "Stablecoin", cash: "Cash" };
/* a row's kind id by what it is; a perpetual on a pre-IPO valuation is Pre-IPO (mkKindOf) */
const MKT_KIND_OF = { coin: "crypto", stock: "stocks", rwa: "rwas", perp: "perps", event: "predictions" };
/* every market at once, for the Watching tab and for a market asked for by name */
const MKT_ALL = "/api/account/explore?limit=200";
/* THE DRAWER'S PRICE HISTORY by range, as the Trade pane's chart offers them (ui/chart.js; the account's CANDLE_RANGES), each asked in the
   bar size it starts in (live/history.ts RANGE_BAR) — the size the asset read is asked in too — and the range a drawer opened on a bar size
   alone is drawn over (live/history.ts INTERVAL_RANGE); each bar size's length, where the line breaks at a hole */
const MKT_RANGES = [["1D", "1m"], ["5D", "5m"], ["1M", "1h"], ["3M", "4h"], ["6M", "4h"], ["YTD", "1d"], ["1Y", "1d"], ["5Y", "1w"], ["MAX", "1w"]];
const MKT_RANGE_BAR = Object.fromEntries(MKT_RANGES);
const MKT_IV_RANGE = { "1m": "1D", "5m": "1D", "15m": "5D", "1h": "1M", "4h": "3M", "1d": "1Y", "1w": "5Y" };
const MKT_IV_MS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 };
/* the range the drawer shows: the one picked, else the one its bar size is drawn over */
const mkRangeOf = (o) => (MKT_RANGE_BAR[o.range] ? o.range : MKT_IV_RANGE[o.interval] || "1M");

// ---- words and numbers -------------------------------------------------------------------------------

/* a price in dollars: cents for a dollar or more, the first four figures below that (core usd) */
const mkUsd = usd;
/* dollars traded, short: $1.9B · $120M · $880k */
function mkVol(n) {
  if (n === undefined || n === null || n === "" || !Number.isFinite(Number(n))) return "—";
  const a = Math.abs(Number(n));
  const [d, s] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "k"] : [1, ""];
  const v = Number(n) / d;
  return `$${s ? (Math.abs(v) >= 100 ? v.toFixed(0) : String(Number(v.toFixed(1)))) : String(Math.round(v))}${s}`;
}
/* a count, short: 12.3k contracts */
const mkCount = (n) => mkVol(n).slice(1);
/** a valuation, short, to three figures: $2.08T · $965B · $12.5B — what a pre-IPO contract's price says a company is worth (the Trade pane's
 * picker says it the same way) */
function mkValuation(n) {
  if (n === undefined || n === null || n === "" || !Number.isFinite(Number(n))) return "—";
  const a = Math.abs(Number(n));
  const [d, s] = a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "k"] : [1, ""];
  const v = a / d;
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${Number(n) < 0 ? "-" : ""}$${String(Number(v.toFixed(digits)))}${s}`;
}
/* an event contract's price, which is its probability, in cents (core cents: the figure clicked here is the figure the ticket signs) */
const mkCents = cents;
/* how long until it closes: 2d 04:12 · 06:48:10; "Closed" once the time has passed */
function mkLeft(ms) {
  if (!(ms > 0)) return "Closed";
  const s = Math.floor(ms / 1000);
  const p2 = (x) => String(x).padStart(2, "0");
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `Closes in ${d}d ${p2(h)}:${p2(m)}` : `Closes in ${p2(h)}:${p2(m)}:${p2(s % 60)}`;
}
/** a market past its close time: `ended` once the clock has passed it; `trading` when the venue still takes orders in it — a leg that says
 * open, or one past its estimated end date that still trades (pastEnd) — the venue's word, not the clock's. For an outcome (`oi`) its legs */
function mkEnded(item, oi) {
  const close = item && item.closeTime ? Date.parse(item.closeTime) : NaN;
  if (!Number.isFinite(close) || close > Date.now()) return { ended: false, trading: true };
  const legs = mkLegs(item, oi).map((l) => mkAtOf(item, l.venue));
  return { ended: true, trading: legs.some((a) => a.pastEnd === true || a.open === true) };
}
/** a stock's session in a few words, from the venue's own stamps (Market.session), never the page's clock: "closes 16:00 New York" while it
 * is in session, "opens Wed 7 Oct, 09:30 New York" while it is not; "" where the venue gave no time */
function mkSessionWhen(s) {
  const ph = mkPhase(s);
  if (ph) {
    const ends = s.phaseEndsAt && Number.isFinite(Date.parse(s.phaseEndsAt)) ? s.phaseEndsAt : "";
    return `${MK_PHASES[ph] || ph}${ends ? ` until ${nyTime(ends)} New York${yourTime(ends)}` : ""}${s.extendedHours ? " · a limit order with extended hours trades now" : " · orders wait for the regular session"}`;
  }
  const at = s ? (s.open ? s.closesAt : s.opensAt) : "";
  if (!at || !Number.isFinite(Date.parse(at))) return "";
  return s.open ? `closes ${nyTime(at)} New York${yourTime(at)}` : `opens ${nyDay(at)}, ${nyTime(at)} New York${yourTime(at)}`;
}
/* the session the venue says is on outside the regular one (pre-market, after-hours, overnight), or "" */
const mkPhase = (s) => (s && s.phase && s.phase !== "regular" && s.phase !== "closed" ? s.phase : "");
const MK_PHASES = { pre: "pre-market", after: "after-hours", overnight: "overnight session" };
const MK_PHASE_TAGS = { pre: "Pre-market", after: "After-hours", overnight: "Overnight" };
/* the countdown's words once the time has run out: still trading past its end date, or closed (what a countdown still running will say
   the moment it ends, until the next read says what the venue did) */
const mkEndedWords = (state) => (state.ended && state.trading ? "Past its end date · still trading" : "Closed");
/* an outcome as a person says it: YES → Yes, UP → Up; a named outcome (FURIA, USA) as the venue writes it */
const mkLabel = (l) => { const s = String(l || ""); return ["YES", "NO", "UP", "DOWN"].includes(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s; };
/* a sentence from a venue, without its last full stop (it is put inside one of ours) */
const mkSaid = (t) => String(t || "").trim().replace(/[.\s]+$/, "");
/* one price from a fresh market, by what the element shows: "c" a contract's price in cents (the ask where there is one: what a buy pays),
   "usd" a price, "bid" / "ask" in dollars, "bid-c" / "ask-c" in cents */
function mkFmt(m, fmt = "c") {
  const pick = { c: m.ask ?? m.price, "c-last": m.price ?? m.ask, usd: m.price ?? m.ask, bid: m.bid, ask: m.ask, "bid-c": m.bid, "ask-c": m.ask }[fmt];
  return ["c", "c-last", "bid-c", "ask-c"].includes(fmt) ? mkCents(pick) : mkUsd(pick);
}
/* a countdown as an element the tick updates in place (.mk-close[data-close]), with the words it will say once the time has run out */
function mkCloseHtml(item, state, cls = "mk-close") {
  if (!item.closeTime) return "";
  const left = Date.parse(item.closeTime) - Date.now();
  return `<span class="${cls}" data-ended="${esc(mkEndedWords(state))}" data-close="${esc(item.closeTime)}"${left > 0 ? "" : " data-closed"}>${esc(left > 0 ? mkLeft(left) : mkEndedWords(state))}</span>`;
}

// ---- what a row is, and what can be done with it --------------------------------------------------------

const mkVenue = (id) => (A ? A.venues.find((v) => v.id === id && v.live) : undefined);
/* a fresh price for a market at a connected venue, while it is fresh */
const mkFresh = (pair) => { const q = MKT.quotes.get(pair); return q && Date.now() - q.at < MKT_FRESH_MS ? q.market : null; };
/* the markets one row is, venue by venue: an outcome's, when one is named, or the row's own */
const mkLegs = (item, oi) => (oi !== undefined && item.outcomes && item.outcomes[oi] ? item.outcomes[oi].at : item.at.map((a) => ({ venue: a.venue, symbol: a.symbol })));
const mkAtOf = (item, venue) => item.at.find((a) => a.venue === venue) || { venue, venueName: venue, symbol: "", connected: false, canTrade: false, public: false };
/* a market's legs at the venues connected live, as "venue|symbol": what the quotes read asks for */
const mkPairsOf = (item, oi) => mkLegs(item, oi).filter((l) => l.symbol && mkVenue(l.venue)).map((l) => `${l.venue}|${l.symbol}`);
const mkAllPairs = (item) => [...new Set(item.kind === "event" && item.outcomes ? item.outcomes.flatMap((o, oi) => mkPairsOf(item, oi)) : mkPairsOf(item))];
/* the first leg at a connected venue: whose fresh price the drawer shows */
const mkLeadLeg = (item, oi) => mkLegs(item, oi).find((l) => l.symbol && mkVenue(l.venue)) || null;
/** a stock's trading session (Market.session) at its connected venues: the lead venue's fresh market's while it is fresh (read with the
 * price, from the venue's own clock), else what the explore read carried — the row's (its first connected venue that says one), else a
 * connected line's, else a public line's (Cboe's delayed quotes carry the market calendar's session). Null for anything else, and where no
 * venue says one: then nothing is said of a session */
function mkSessionOf(item) {
  if (!item || item.kind !== "stock") return null;
  const lead = mkLeadLeg(item);
  const m = lead && mkFresh(`${lead.venue}|${lead.symbol}`);
  const line = (item.at || []).find((a) => a.connected && a.session) || (item.at || []).find((a) => a.session);
  const s = (m && m.session) || item.session || (line && line.session);
  return s && typeof s.open === "boolean" ? s : null;
}
/* a perpetual on a pre-IPO valuation: its listing says so, or carries the valuation its price implies */
const mkIsPreipo = (x) => !!x && (!!x.implied || x.category === "Pre-IPO");
/** a row's kind id — the Trade pane's seg word, which every ticket opened from here carries: coin → crypto, stock → stocks, rwa → rwas,
 * perp → perps (or preipo on a pre-IPO valuation), event → predictions; a stablecoin or cash held trades as crypto */
const mkKindOf = (item) => (item && item.kind === "perp" && mkIsPreipo(item) ? "preipo" : (item && MKT_KIND_OF[item.kind]) || "crypto");
/** what a pre-IPO contract's price says, from a row or one of its listings: the venue's implied valuation and its own unit sentence; the
 * valuation from the price and the venue's dollars a point when the venue did not say it outright. Null for anything else */
function mkImplied(x) {
  const i = x && x.implied;
  if (!i) return null;
  const said = i.usd !== undefined && i.usd !== null && Number.isFinite(Number(i.usd)) ? Number(i.usd) : undefined;
  const perPoint = Number.isFinite(Number(i.perPoint)) && i.perPoint !== undefined && i.perPoint !== null ? Number(i.perPoint) : undefined;
  const usd = said !== undefined ? said : perPoint !== undefined && Number.isFinite(Number(x.price)) ? Number(x.price) * perPoint : undefined;
  return { usd, unit: String(i.unit || ""), perPoint };
}
/* every row a read carries, each once: for finding a market by name or key (the lists beside `items` stay in the read for agents) */
function mkRows(body) {
  if (!body) return [];
  const seen = new Set();
  return [...(body.items || []), ...(body.closing || []), ...(body.movers || []), ...(body.mostTraded || [])].filter((x) => x && !seen.has(x.key) && seen.add(x.key));
}

/** why a connected venue takes no order for it — the venue's words where it gave some — and what fixes it */
function mkWhyNot(v, a) {
  const w = A.connectLive && A.connectLive.writes;
  if (!writesOn()) return `Trading is off on this server${w && w.turnOn ? `: start it with ${w.turnOn}` : ""}.`;
  if (watched(v)) return `${v.name} is a watched address: nothing is traded from it. Connect it as a browser wallet, which signs to show it is yours, to trade from it.`;
  if (a.open === false) return `${v.name}: ${mkSaid(a.note) || "the market is closed now"}.`;
  if (v.trade && v.trade.can === false) return `${v.name}: ${mkSaid(a.note) || "this key can't trade"}. ${keyHowFor(v)} Then connect it again.`;
  if (v.noTradeBecause) return `${v.name}: ${mkSaid(v.noTradeBecause)}.`;
  return `${v.name}: ${mkSaid(a.note) || "no order is placed here from the account"}.`;
}

/** what a Buy (or one outcome's button) does for a row: an order at the first connected venue that takes one; else "Connect to trade" at
 * a venue whose public prices list it; else why not, in the venue's words */
function mkRoute(item, oi) {
  if (!A) return { act: "why", text: "" };
  // a server started read-only places nothing anywhere: connecting another venue would not change that
  if (!writesOn()) return { act: "why", text: mkWhyNot({}, {}) };
  // a market the venue has closed takes no order: its own words where it gave some
  const state = mkEnded(item, oi);
  if (state.ended && !state.trading) {
    const a = mkLegs(item, oi).map((l) => mkAtOf(item, l.venue)).find((x) => x.note) || mkAtOf(item, (mkLegs(item, oi)[0] || item.at[0] || {}).venue);
    return { act: "why", venue: mkVenue(a.venue) ? a.venue : "", text: `${a.venueName || "The venue"}: ${mkSaid(a.note) || "this market has closed"}.` };
  }
  let refused = null;
  // A PAPER ACCOUNT BEFORE A REAL ONE: the ticket this opens is the trading area's, and there a paper account is the default whenever one
  // trades the thing — real money is the owner's own pick, in the ticket's Where list or its Real money | Paper switch (ui/trade.js
  // tkFirstLeg). On Real money a paper account is not offered at all. A venue's lens is the owner's own pick too: under it that venue comes
  // first, as the ticket opens there (tkFirstLeg), and only then a paper account before a real one
  const lens = lensNow();
  const isPaper = (l) => !!mkAtOf(item, l.venue).paper || paperVenue(l.venue);
  const picked = (l) => (lens.kind === "venue" ? Number(l.venue === lens.id) : 0);
  const legs = [...mkLegs(item, oi)].filter((l) => lens.kind !== "real" || !isPaper(l)).sort((a, b) => picked(b) - picked(a) || Number(isPaper(b)) - Number(isPaper(a)));
  for (const l of legs) {
    const v = mkVenue(l.venue);
    // a connected venue that does not serve this network now is not offered, nor said: the list is what serves the user
    if (!v || !l.symbol || !servedHere(v)) continue;
    const a = mkAtOf(item, l.venue);
    // a venue that lets this network only close what is held takes no buy from here: that state, in a word (the venue's own words kept for
    // whoever asks); what is held there is still sold, from the drawer's Sell
    if (mkCloseOnly(item, l.venue)) {
      refused = refused || { venue: v.id, word: "Close only here", said: (v.closeOnly && v.closeOnly.said) || "", text: `${v.name}: close only here. What you hold there can be sold.` };
      continue;
    }
    if (canTrade(v) && a.canTrade !== false && a.open !== false) return { act: "trade", venue: v.id, symbol: l.symbol, venueName: v.name, ...(v.paper || a.paper ? { paper: true } : {}) };
    refused = refused || { venue: v.id, text: mkWhyNot(v, a) };
  }
  // connecting another venue is offered only where none of the owner's connected venues trades the thing at all — and only a venue that
  // would take the user from where they are (core VENUES: its answer to this network, its terms); one that would not says so, in its words
  const pubs = mkTradedHere(item) ? [] : item.at.filter((a) => a.public && a.connector && connectionOf(a.connector) && !(a.connectTo && mkVenue(a.connectTo)));
  // a venue that takes the user first; one whose own terms exclude where the user is is still offered, with its words (shown, not enforced)
  const pub = pubs.find((a) => !venueRefuses(a.connector) && !venueTermsSay(a.connector)) || pubs.find((a) => !venueRefuses(a.connector));
  if (pub) {
    const terms = venueTermsSay(pub.connector);
    return { act: "connect", connector: pub.connector, venue: pub.connectTo || "", venueName: pub.venueName, note: pub.note || "", ...(terms ? { terms: `${pub.venueName}: ${terms.word.toLowerCase()}${terms.said ? ` — ${mkSaid(terms.said)}` : ""}.` } : {}) };
  }
  if (refused) return { act: "why", venue: refused.venue, text: refused.text, ...(refused.word ? { word: refused.word, said: refused.said } : {}) };
  // every venue that lists it would not take the user from this network: said in a word (the venue's own sentence is in the list of where
  // the user can connect, and under Why these), not as an error
  const shut = pubs.map((a) => ({ a, no: venueRefuses(a.connector) })).find((x) => x.no);
  if (shut) return { act: "why", word: shut.no.word, said: pubs.length > 1 ? "" : shut.no.said, text: pubs.length > 1 ? `None of the ${pubs.length} venues that list it serves this network.` : `${shut.a.venueName}: ${shut.no.word.toLowerCase()}.` };
  const p0 = item.at.find((a) => a.public);
  return { act: "why", text: p0 ? (p0.note ? `${p0.venueName}: ${mkSaid(p0.note)}.` : `This server can't connect ${p0.venueName}.`) : "No venue on the account trades it." };
}

/* a connected venue of the owner's trades the thing (its key may, and it is not close-only on this network): a public line of the same row
   is then a price, never a connection to offer */
const mkTradedHere = (item) => (item.at || []).some((a) => a.connected && !a.paper && !(mkVenue(a.venue) || {}).paper && a.canTrade !== false && !mkCloseOnly(item, a.venue));
/* a connected venue that lets this network only close what is held, for this market (its explore line) or as the account marks the venue:
   sells and closes go there, buys do not */
const mkCloseOnly = (item, venue) => !!(mkAtOf(item, venue).closeOnly || (mkVenue(venue) || {}).closeOnly);
/* a public listing's market is watched under the venue it would be once connected */
const mkVenueOfLeg = (item, venue) => { const a = mkAtOf(item, venue); return a.public && a.connectTo ? a.connectTo : venue; };
/* a watchlist entry is one of this row's markets (any venue, any outcome) */
const mkIsWatch = (item, w) => [...item.at.map((a) => ({ venue: a.venue, symbol: a.symbol })), ...(item.outcomes || []).flatMap((o) => o.at)].some((l) => l.symbol && l.symbol === w.symbol && (l.venue === w.venue || mkVenueOfLeg(item, l.venue) === w.venue));
/** the watchlist entry this row is, if the owner watches it */
const mkWatchEntry = (item) => (A && A.watch ? A.watch.find((w) => mkIsWatch(item, w)) || null : null);
/** what ★ watches for a row: its market at the first connected venue, else at the venue its public prices come from */
function mkWatchTarget(item) {
  const c = item.at.find((a) => a.connected && a.symbol);
  if (c) return { venue: c.venue, symbol: c.symbol };
  const p = item.at.find((a) => a.public && a.connectTo && a.symbol);
  return p ? { venue: p.connectTo, symbol: p.symbol } : null;
}
/** the watchlist change one ★ signs: off for the entry that is watched, on for the row's first venue; null when there is nothing to name */
function mkWatchDraft(item) {
  const w = mkWatchEntry(item);
  if (w) return { type: "setWatch", venue: w.venue, symbol: w.symbol, on: "" };
  const t = mkWatchTarget(item);
  return t ? { type: "setWatch", venue: t.venue, symbol: t.symbol, on: "true" } : null;
}
/** the asset the Asset read knows it as (its price history, what is held, its orders): a coin or a perpetual's coin, a share, a token, an
 * event contract at a connected venue — or, for a holding opened by its own key (asset.js), that key */
function mkAssetKey(item) {
  if (item.heldKey) return item.heldKey;
  const base = String(item.base || "").toUpperCase();
  if (item.kind === "coin" || item.kind === "perp") return base ? `crypto:${base}` : "";
  if (item.kind === "stock") return base ? `equity:${base}` : "";
  if (item.kind === "rwa") return base ? `rwa:${base}` : "";
  if (item.kind === "event") {
    const c = item.at.find((a) => a.connected && a.symbol);
    return c ? `event:${c.symbol}` : "";
  }
  return "";
}
/** what the agents are doing in it: their open orders, their cards waiting on the owner, the owner's intents about it */
function mkAgentsOn(item) {
  if (!A) return { orders: [], cards: [], intents: [] };
  const syms = new Set([...item.at.map((a) => a.symbol), ...(item.outcomes || []).flatMap((o) => o.at.map((x) => x.symbol))].filter(Boolean));
  const base = item.kind === "event" ? "" : String(item.base || "").toUpperCase();
  const hit = (sym) => syms.has(sym) || (!!base && String(sym || "").split("/")[0].toUpperCase() === base);
  const shown = (c, n) => ((c.shown || []).find((x) => x.name === n) || {}).value || "";
  return {
    orders: A.orders.filter((o) => o.agent && isLive(o) && (hit(o.symbol) || (!!base && String(o.base || "").toUpperCase() === base))),
    cards: A.cards.filter((c) => c.agent && hit(shown(c, "symbol"))),
    intents: (A.intents || []).filter((x) => hit(x.symbol)),
  };
}
/* a venue line of a market that serves the network the account runs on: a connected venue that does not now, or a public one whose venue does
   not serve this network or offers no way in, is not listed (the list is what serves the user) */
const mkServes = (a) => {
  const v = a.connected ? mkVenue(a.venue) : null;
  if (v) return servedHere(v);
  const no = a.connector ? venueRefuses(a.connector) : null;
  return !(no && (no.verdict === "not-served" || no.verdict === "closed"));
};
/* the lens narrows Markets to one venue's markets; under Real money to the rows a real account or a public venue lists, under Paper to the
   rows a paper account lists; under an agent's lens every market stays (agents hold no markets of their own) */
const mkInLens = (item, lens) => {
  if (!lens || lens.kind === "all" || lens.kind === "agent") return true;
  if (lens.kind === "venue") return item.at.some((a) => a.venue === lens.id || a.connectTo === lens.id);
  if (lens.kind === "paper") return item.at.some((a) => a.paper || (a.connected && paperVenue(a.venue)));
  return item.at.some((a) => a.public || (a.connected && !a.paper && !paperVenue(a.venue)));
};

/* the venues that did not answer this read, each in its own words (a venue's rule for this location is said as its rule, nothing more).
   One line per venue and answer: an exchange read through two public sources (its spot tickers, its pre-IPO perpetuals) that refused both
   with the same words is named once */
function mkMissingLine(missing) {
  const seen = new Set();
  const list = (missing || []).filter((m) => !m.symbol && !seen.has(`${m.venueName}|${m.said || m.why}`) && seen.add(`${m.venueName}|${m.said || m.why}`));
  if (!list.length) return "";
  const one = (m) => `<b>${esc(m.venueName)}</b>: ${m.said ? `“${esc(mkSaid(m.said))}”${m.code === "E_VENUE_GEOBLOCKED" ? " — its own rule for this location" : ""}` : esc(mkSaid(m.why))}`;
  return `<p class="mk-missing">Not shown: ${list.map(one).join(" · ")}.</p>`;
}

// ---- drawing -----------------------------------------------------------------------------------------

/** who stands behind a tokenised asset (or a pre-IPO contract) and whom it is for, in the issuer's own words: the row's, else the first
 * listing that carries them; null for anything else. The ticket reads the same shape (trade.js) */
function mkIssuer(item) {
  const a = ((item && item.at) || []).find((x) => x.issuer || x.eligibility) || {};
  const issuer = (item && item.issuer) || a.issuer || "";
  const eligibility = (item && item.eligibility) || a.eligibility || "";
  return issuer || eligibility ? { issuer, eligibility } : null;
}
/* who issues it and whom it is for, in one line of the issuer's words: a hover card's, and a screen reader's. A pre-IPO perpetual is written
   by its venue, not by the company: the company's own notice is said in the drawer and the ticket */
function mkIssuerWords(item) {
  const i = mkIsPreipo(item) ? null : mkIssuer(item);
  return i ? [i.issuer ? `Issued by ${i.issuer}` : "", i.eligibility].filter(Boolean).join(" · ") : "";
}

/* a row's tile: its logo (live/icons.ts) over its letters — its symbol; an event's, the venue's word for what it is about */
const mkAv = (item, size = "") => avatar(item.kind === "event" ? String(item.category || "Event").slice(0, 4) : item.base || item.name, size, item.icon || "");
/* Elbstream's logos ask for a link to elbstream.com wherever one is shown (core logoCredit): under a list, and in the drawer, that shows one */
const mkCredit = (items) => logoCredit(items.map((x) => x && x.icon), "mk-credit");
/* what kind of thing a market is, in a few words: its symbol, what it is; a pre-IPO contract says so (the hover card's second line) */
const mkSub = (item) => (mkIsPreipo(item) ? "Pre-IPO · Perpetual" : item.kind === "perp" ? (/perp/i.test(item.name) ? item.base || "" : `${item.base || ""} · Perpetual`) : item.base && item.base !== item.name ? item.base : MKT_KIND[item.kind] || "");
/** a market's name, short: an event's market as its venue names it inside its event — the event's title and the market's own words beside
 * it ("Fed decision in Oct 2026?" · "Fed maintains rate"), where the venue gives them (live/public-markets.ts `event`); anything else, and an
 * event the venue gives no title for, by its name. The market's whole question is in its hover card and in the drawer */
function mkShort(item) {
  const e = item && item.kind === "event" && item.event && item.event.title ? item.event : null;
  if (!e) return { name: String((item && item.name) || ""), opt: "" };
  const title = String(e.title);
  const opt = e.market && !title.toLowerCase().includes(String(e.market).toLowerCase()) ? String(e.market) : "";
  return { name: title, opt };
}
/* the short name as a line draws it: the market's own words quieter than the event's */
const mkShortHtml = (item) => { const s = mkShort(item); return `${esc(s.name)}${s.opt ? `<span class="mk-opt"> · ${esc(s.opt)}</span>` : ""}`; };
/* what the hover card says, as words for a screen reader (the card is a pointer's): the whole question where the line says it short, what
   kind of thing it is, when it closes — a time, not a countdown — who issues it, and where its price is from */
function mkAbout(item) {
  const s = mkShort(item);
  const ev = item.kind === "event";
  const close = ev && item.closeTime && Number.isFinite(Date.parse(item.closeTime)) ? `closes ${nyDay(item.closeTime)}, ${nyTime(item.closeTime)} New York` : "";
  const from = mkPriceFrom(item);
  return [s.name !== item.name ? item.name : "", ev ? item.category || "Prediction" : mkSub(item), close, mkIssuerWords(item), from ? `Price from ${from}` : ""].filter(Boolean).join(" · ");
}
/** a market as a row names it: its tile and its short name, on one line, as one button that opens the drawer. What is said of it beyond
 * that — the whole question, what kind of thing it is, its countdown, who issues it, where it is listed — is in the card a pointer resting
 * on it shows (data-peek: mkPeek), in words for a screen reader, and in the drawer */
function mkNameBtn(item, i) {
  const about = mkAbout(item);
  return `<button type="button" class="mk-name" data-act="open" data-i="${i}" data-fk="open:${esc(item.key)}" data-peek="${i}">${mkAv(item)}<span class="mk-nm"><b>${mkShortHtml(item)}</b>${item.paper ? ' <span class="tag paper" title="Only a paper account lists it: its price is that test environment\'s, not a market\'s">Paper</span>' : ""}${about ? `<span class="sr">. ${esc(about)}</span>` : ""}</span></button>`;
}
/** what a market's hover card says: its whole name (an event's question, with the market's own words), what kind of thing it is — an
 * event's category and its countdown, which ticks with the others — who issues it and whom it is for in the issuer's words, where it is
 * listed: the venues connected, then the ones whose public prices list it, quieter — and where its price is from, where its line says (a US
 * stock's: a real-time quote, or Cboe's 15 minutes delayed), with when once it is not the last minute or two's (mkQuoteWords) */
function mkPeekHtml(item) {
  const ev = item.kind === "event";
  const close = ev && item.closeTime ? mkCloseHtml(item, mkEnded(item)) : "";
  const kind = [ev ? esc(item.category || "Prediction") : esc(mkSub(item)), close].filter(Boolean).join(" · ");
  const iss = mkIssuerWords(item);
  const seen = new Set();
  const at = [...item.at.filter((a) => a.connected), ...item.at.filter((a) => !a.connected)].filter((a) => !seen.has(a.venueName) && seen.add(a.venueName));
  // a paper account's own name already ends in "paper" ("Momentum · paper"): said once
  const unpaper = (n) => String(n || "").replace(/\s*[·-]\s*paper\s*$/i, "") || String(n || "");
  const where = at.map((a) => (a.connected ? `${esc(a.paper ? unpaper(a.venueName) : a.venueName)}${a.paper ? " (paper)" : ""}` : `<span class="dim">${esc(a.venueName)}</span>`)).join(" · ");
  const from = mkPriceFrom(item);
  return `<b class="mk-peek-n">${esc(item.name)}</b>${kind ? `<span class="mk-peek-k">${kind}</span>` : ""}${iss ? `<span class="mk-peek-i">${esc(iss)}</span>` : ""}${where ? `<span class="mk-peek-w">${where}</span>` : ""}${from ? `<span class="mk-peek-f">Price from ${esc(from)}</span>` : ""}`;
}
/* a row, by its place in what was drawn (data-i) */
const mkReg = (item) => MKT.reg.push(item) - 1;
const mkPublicOnly = (item) => !item.at.some((a) => a.connected);
/* a toggle drawn the same way every time (seg() numbers itself, which would redraw the pane on every read) */
const mkSeg = (items, on, act, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${items.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" data-fk="${act}:${esc(v)}" aria-pressed="${String(v === on)}">${esc(l)}</button>`).join("")}</div>`;
const mkDis = () => (owns() ? "" : ' disabled title="Only a browser that signs for the owner can do this"');

/* ★: a signed setWatch; `since` (the Watching tab) says in its title when the owner started watching it */
function mkStar(item, i, since) {
  const on = !!mkWatchEntry(item);
  const can = on || !!mkWatchTarget(item);
  return can ? `<button type="button" class="icon-btn mk-star" data-act="watch" data-i="${i}" data-fk="watch:${esc(item.key)}" aria-pressed="${String(on)}" aria-label="${on ? "Stop watching" : "Watch"} ${esc(item.name)}"${since ? ` title="Watching since ${esc(nyDay(since))}"` : ""}${mkDis()}>${icon("star")}</button>` : "";
}
/* 🔔: the row's price alerts — pressed while one stands on it, how many in its title — opens the alert sheet (openAlertSheet); drawn
   wherever ★ is, for the same markets */
function mkBell(item, i) {
  const n = mkAlertsOf(item).length;
  if (!n && !mkWatchTarget(item)) return "";
  return `<button type="button" class="icon-btn mk-bell" data-act="alert" data-i="${i}" data-fk="alert:${esc(item.key)}" aria-pressed="${String(n > 0)}" aria-label="${n ? `${plural(n, "price alert")} on` : "Set a price alert for"} ${esc(item.name)}" title="${n ? `${plural(n, "price alert")} standing: set another, or remove one` : "Price alert: be told when it rises above, or falls below, a price"}"${mkDis()}>${icon("bell")}</button>`;
}
/* ★ and 🔔 together, a row's first cell */
const mkKeys = (item, i, since) => `<span class="mk-keys">${mkStar(item, i, since)}${mkBell(item, i)}</span>`;
/* where a row is listed: the connected venues, then the public ones (read without a key) */
function mkWhere(item) {
  const seen = new Set();
  const at = [...item.at.filter((a) => a.connected), ...item.at.filter((a) => !a.connected)].filter((a) => !seen.has(a.venueName) && seen.add(a.venueName));
  // two venues by name (yours first), the rest as "+N" with their names in its title (and all of them in the row's hover card)
  // a line that reads more than one source (US stocks) says on hover which priced it, how far behind the market that is, and when the
  // price is from once it is not the last minute or two's
  const from = (a) => { const w = mkQuoteWords(a.quoteFrom, a.quoteAt); return w ? `Price from ${w}` : ""; };
  const title = (...words) => { const t = words.filter(Boolean).join(". "); return t ? ` title="${esc(t)}"` : ""; };
  const name = (a) => (a.connected ? (a.paper ? `<span class="mk-v paper"${title("A paper account: no real money", from(a))}>${esc(String(a.venueName || "").replace(/\s*[·-]\s*paper\s*$/i, "") || a.venueName)} · paper</span>` : `<span class="mk-v"${title(from(a))}>${esc(a.venueName)}</span>`) : `<span class="mk-v pub"${title("Public prices, read without a key", from(a))}>${esc(a.venueName)}</span>`);
  const more = at.length > 2 ? ` <span class="dim mk-more" title="${esc(at.slice(2).map((a) => a.venueName).join(", "))}">+${at.length - 2}</span>` : "";
  return `<span class="mk-where">${at.slice(0, 2).map(name).join(" · ")}${more}</span>`;
}
/* the ONE button on a row: Trade where an order can go, Connect to trade where only public prices list it, else why not (the drawer says it
   in full; the drawer is also where Hand to agent is) */
function mkActs(item, i) {
  const r = mkRoute(item);
  const k = esc(item.key);
  if (r.act === "trade") return `<div class="acts"><button type="button" class="btn btn-sm" data-act="trade" data-i="${i}" data-fk="trade:${k}"${r.paper ? ' title="At a paper account: no real money"' : ""}${mkDis()}>${r.paper ? "Paper trade" : "Trade"}</button></div>`;
  if (r.act === "connect") return `<div class="acts"><button type="button" class="btn btn-sm" data-act="connect" data-connector="${esc(r.connector)}" data-name="${esc(r.venueName)}" data-fk="connect:${k}"${r.terms ? ` title="${esc(r.terms)}"` : ""}${mkDis()}>${icon("plug", "sm")}Connect to trade</button></div>`;
  // a state in a word (Not served here, Close only here) is said as that; anything else opens the drawer, which says why
  return `<div class="acts"><button type="button" class="link dim mk-why" data-act="open" data-i="${i}" data-fk="why:${k}" title="${esc(r.text)}">${esc(r.word || "Can't trade here · why")}</button></div>`;
}
/* the fresh market at a row's lead venue while it is fresh and says a price: the row's price now is its */
const mkLeadFresh = (item) => { const lead = mkLeadLeg(item); const m = lead && mkFresh(`${lead.venue}|${lead.symbol}`); return m && (m.price ?? m.ask) !== undefined ? m : null; };
/* a row's price now: the fresh one from its venue when there is one, else what the explore read said */
function mkPriceOf(item) {
  const m = mkLeadFresh(item);
  return m ? m.price ?? m.ask : item.price;
}
/* a price's source as the page says it: the source's words — which source, and how far behind the market ("Cboe · 15 min delayed") —
   and, once the price's own time (quoteAt) is more than MKT_QUOTE_OLD_MS old, when it is from ("Nasdaq · real time · last at 10:29 New
   York, Tue 13 Oct"): "real time" names the source, not the price's age — a share not yet traded in pre-market carries yesterday's last
   trade, and nothing on its way here ages it. "" where no source is said; a time alone is not said */
function mkQuoteWords(from, at) {
  const words = typeof from === "string" ? from.trim() : "";
  const t = words && typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isFinite(t) && Date.now() - t > MKT_QUOTE_OLD_MS ? `${words} · last at ${nyTime(t)} New York, ${nyDay(t)}` : words;
}
/* where that price is from (mkQuoteWords), where its line says (a US stock's: the US stocks line's name says none) — the fresh market's
   own source and time when the price is the fresh one; "" where none says */
function mkPriceFrom(item) {
  const m = mkLeadFresh(item);
  return m ? mkQuoteWords(m.quoteFrom, m.quoteAt) : mkQuoteWords(item.quoteFrom, item.quoteAt);
}
/* an event's 24 hours, in cents: its lead outcome's, else the row's */
const mkEventChg = (item) => { const o0 = item.outcomes && item.outcomes[0]; return chg(o0 && o0.change24h !== undefined ? o0.change24h * 100 : item.change24h !== undefined ? item.change24h * 100 : undefined, "¢"); };
/* the Price cell: an event's lead outcome in cents and its name; a pre-IPO contract's implied valuation with the contract price under it;
   else dollars. The live span carries data-q, so the poll moves it in place */
function mkPriceCell(item) {
  const ev = item.kind === "event";
  const lead = mkLeadLeg(item, ev && item.outcomes && item.outcomes.length ? 0 : undefined);
  const q = lead ? ` data-q="${esc(`${lead.venue}|${lead.symbol}`)}" data-fmt="${ev ? "c-last" : "usd"}"` : "";
  if (ev) {
    const o0 = item.outcomes && item.outcomes[0];
    const m = lead && mkFresh(`${lead.venue}|${lead.symbol}`);
    return `<span${q}>${mkCents(m ? m.price ?? m.ask : o0 ? o0.price : item.price)}</span>${o0 ? `<span class="dim small"> ${esc(mkLabel(o0.label))}</span>` : ""}`;
  }
  const imp = mkIsPreipo(item) ? mkImplied(item) : null;
  if (imp) return `<span class="mk-implied"><b>${esc(mkValuation(imp.usd))}</b> <span class="tag">implied</span></span><span class="dim small mk-contract"${q}>${mkUsd(mkPriceOf(item))}</span>`;
  return `${mkClosedTag(item)}<span${q}>${mkUsd(mkPriceOf(item))}</span>`;
}
/* a small "Closed" beside a stock's price while its connected venue is out of its session, its title when it opens: nothing in session, or
   where no venue says a session. Before the figure, so the prices of a column stay aligned */
function mkClosedTag(item) {
  const s = mkSessionOf(item);
  if (!s || s.open) return "";
  const when = mkSessionWhen(s);
  const ph = mkPhase(s);
  return `<span class="tag${ph && s.extendedHours ? " up" : ""}"${when ? ` title="${esc(when.charAt(0).toUpperCase() + when.slice(1))}"` : ""}>${esc(ph ? MK_PHASE_TAGS[ph] || ph : "Closed")}</span> `;
}
/* the volume cell: dollars, or contracts where the venue counts those */
const mkVolCell = (item) => (item.volumeUsd24h !== undefined ? mkVol(item.volumeUsd24h) : item.contracts24h !== undefined ? `${mkCount(item.contracts24h)} contracts` : "—");
/** the table: ★ 🔔 · Market · Where · Price · 24h · Volume · one action, a row one line high. An event is a row too (All, a search): its
 * short name, its lead outcome in cents; its question and its countdown are in its hover card */
function mkTable(items, empty) {
  const cols = [
    { label: "", sr: "Watch, price alert", cls: "mk-c-keys", cell: (x) => mkKeys(x.item, x.i) },
    { label: "Market", cls: "mk-c-name", cell: (x) => mkNameBtn(x.item, x.i) },
    { label: "Where", cls: "mk-c-where", cell: (x) => mkWhere(x.item) },
    { label: "Price", r: true, cell: (x) => mkPriceCell(x.item) },
    { label: "24h", r: true, cell: (x) => (x.item.kind === "event" ? mkEventChg(x.item) : chg(x.item.changePct24h)) },
    { label: "Volume", r: true, cell: (x) => mkVolCell(x.item) },
    { label: "", sr: "Actions", r: true, cell: (x) => mkActs(x.item, x.i) },
  ];
  // a row's markets at connected venues: priced again while the row is in view (the first two legs); the row is kept by its market's key.
  // An event that has not closed carries its close (data-ends): its countdown is in its hover card, and the row still sends the list to be
  // read again the moment it closes (mkTickPlan), as a countdown would
  const ends = (it) => (it.kind === "event" && it.closeTime && Date.parse(it.closeTime) > Date.now() ? ` data-ends="${esc(it.closeTime)}"` : "");
  const rowAttr = (x) => { const pairs = mkAllPairs(x.item).slice(0, 2); return `data-k="${esc(x.item.key)}"${pairs.length ? ` data-pairs="${esc(pairs.join(","))}"` : ""}${ends(x.item)}`; };
  return table(cols, items.map((item) => ({ item, i: mkReg(item) })), { empty, cls: "mk-t", rowAttr });
}

/* one outcome's button on a card: what a buy pays now, in cents; it trades, or connects, or says why not */
function mkYn(item, i, o, oi) {
  const leg = mkLeadLeg(item, oi);
  const m = leg && mkFresh(`${leg.venue}|${leg.symbol}`);
  const r = mkRoute(item, oi);
  const label = mkLabel(o.label);
  const after = r.act === "connect" ? `: connect ${r.venueName} to trade` : r.act === "why" ? (r.word ? `: ${r.word.toLowerCase()}` : ": can't be traded here") : "";
  return `<button type="button" class="${oi === 0 ? "yes" : "no-btn"}" data-act="yn" data-i="${i}" data-o="${oi}" data-fk="yn:${esc(item.key)}:${oi}"${r.act !== "why" ? mkDis() : ""}>${esc(label)} · <span${leg ? ` data-q="${esc(`${leg.venue}|${leg.symbol}`)}" data-fmt="c"` : ""}>${mkCents(m ? m.ask ?? m.price : o.ask ?? o.price)}</span>${after ? `<span class="sr">${esc(after)}</span>` : ""}</button>`;
}
/** an event as a card: a live countdown, its short name (the whole question in its hover card), and its first two outcomes to buy — with
 * one line of facts (what it is about · where · how much traded) unless `lean` (under Predictions the tab says what they are). A market
 * the venue has closed shows the venue's words in place of the buttons; one past its estimated end date that the venue still trades keeps
 * them, and says so. `reg` registers the card's row for its buttons (the pane's list, or a drawer's own) */
function mkCard(item, { lean = false, reg = mkReg } = {}) {
  const i = reg(item);
  const outs = (item.outcomes || []).slice(0, 2);
  const pairs = mkAllPairs(item);
  const names = [...new Set(item.at.map((a) => a.venueName))].slice(0, 2).join(" · ");
  const vol = item.volumeUsd24h !== undefined ? `${mkVol(item.volumeUsd24h)} vol` : item.contracts24h !== undefined ? `${mkCount(item.contracts24h)} contracts` : "";
  const state = mkEnded(item);
  const shut = state.ended && !state.trading;
  const foot = shut ? `<p class="dim small mk-shut">${esc(mkRoute(item).text)}</p>` : outs.length ? `<div class="mk-yn">${outs.map((o, oi) => mkYn(item, i, o, oi)).join("")}</div>` : "";
  const facts = lean ? "<span></span>" : `<span class="dim">${esc([item.category || "", names, vol].filter(Boolean).join(" · "))}</span>`;
  return `<div class="box mk-card" data-k="${esc(item.key)}"${pairs.length && !shut ? ` data-pairs="${esc(pairs.slice(0, 4).join(","))}"` : ""}><div class="mk-card-top">${facts}${mkCloseHtml(item, state)}</div><button type="button" class="mk-card-q" data-act="open" data-i="${i}" data-fk="open:${esc(item.key)}" data-peek="${i}"><span>${mkShortHtml(item)}${mkShort(item).name !== item.name ? `<span class="sr">. ${esc(item.name)}</span>` : ""}</span></button><div class="mk-card-foot">${foot}</div></div>`;
}
const mkCards = (items, opts) => `<div class="cards-grid mk-cards">${items.map((x) => mkCard(x, opts)).join("")}</div>`;
const mkSkelCards = (n) => `<div class="cards-grid" aria-hidden="true">${Array.from({ length: n }, () => '<div class="box mk-card"><span class="skel" style="width:50%"></span><span class="skel" style="height:36px"></span><span class="skel" style="height:44px"></span></div>').join("")}</div>`;
const mkSkel = () => `<div class="mk-block" aria-busy="true"><span class="sr" role="status">Reading the markets…</span>${mkSkelCards(3)}<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel"></span><span class="skel" style="width:60%"></span></div></div>`;

/* the tabs the explore read returned, in its order (a legacy `now` is All; All first either way), "All results" while searching, then
   Watching (when anything is watched, or a price alert stands or fired) */
function mkTabIds(body) {
  const from = ((body && body.tabs) || []).map((t) => (t.id === "now" ? ["all", "All"] : [t.id, t.label]));
  return from.some(([id]) => id === "all") ? from : [["all", "All"], ...from];
}
const mkHasWatching = () => !!A && ((A.watch || []).length > 0 || (A.alerts || []).length > 0 || (A.alertsFired || []).length > 0);
function mkTabs(p, body) {
  const items = [...(p.q ? [["", "All results"]] : []), ...mkTabIds(body), ...(mkHasWatching() ? [["watching", "Watching"]] : [])];
  return `<div class="tabs mk-tabs" role="group" aria-label="Markets">${items.map(([id, l]) => `<button type="button" data-act="tab" data-tab="${esc(id)}" data-fk="tab:${esc(id)}" aria-pressed="${String(id === p.tab)}">${esc(l)}</button>`).join("")}</div>`;
}

/** the rows in the order asked for, here (a sort changes no read): the read's own order (""), most traded first (dollars, or contracts at
 * about their price), the biggest 24-hour move first (a coin's in percent, an event's in cents — both points of a hundred), or closing
 * soonest (what never closes last). Rows alike keep the read's order */
function mkSortRows(items, sort) {
  if (!sort) return items;
  const vol = (x) => (x.volumeUsd24h !== undefined ? x.volumeUsd24h : x.contracts24h !== undefined ? x.contracts24h * (x.price || 1) : -1);
  const move = (x) => (x.changePct24h !== undefined ? Math.abs(x.changePct24h) : x.change24h !== undefined ? Math.abs(x.change24h) * 100 : -1);
  const close = (x) => { const t = x.closeTime ? Date.parse(x.closeTime) : NaN; return Number.isFinite(t) ? t : Infinity; };
  const by = sort === "movers" ? (a, b) => move(b) - move(a) : sort === "closing" ? (a, b) => close(a) - close(b) : (a, b) => vol(b) - vol(a);
  return items.map((x, i) => [x, i]).sort((a, b) => by(a[0], b[0]) || a[1] - b[1]).map(([x]) => x);
}
/* a tab, or a search: a sort, then — All — one table of everything; elsewhere the events as cards (lean under Predictions, where the tab says
   what they are) and the rest in a table. Perps never shows a pre-IPO contract: those are under Pre-IPO */
function mkListHtml(p, body, lens) {
  let items = body.items.filter((x) => mkInLens(x, lens));
  if (p.tab === "perps") items = items.filter((x) => !mkIsPreipo(x));
  const sorted = mkSortRows(items, p.sort);
  const sorts = [["volume", "Most traded"], ["movers", "Biggest moves"], ...(items.some((x) => x.closeTime) || p.tab === "predictions" ? [["closing", "Closing soonest"]] : [])];
  const head = `<div class="mk-bar">${p.q ? `<p class="mk-q">${plural(items.length, "market")} for “${esc(p.q)}” <button type="button" class="link dim" data-act="clear-q" data-fk="clear-q">Clear</button></p>` : "<span></span>"}${items.length > 1 ? mkSeg(sorts, p.sort || "volume", "sort", "Sort by") : ""}</div>`;
  if (!items.length) return `${head}<p class="empty">${p.q ? `Nothing matches “${esc(p.q)}” at your venues or in the public listings.` : "Nothing here right now."}</p>`;
  if (p.tab === "all") return `${head}<section class="sec" aria-label="Markets">${mkTable(sorted, "")}</section>`;
  const events = sorted.filter((x) => x.kind === "event");
  const rest = sorted.filter((x) => x.kind !== "event");
  return `${head}${events.length ? `<section class="mk-block" aria-label="Predictions">${mkCards(events, { lean: p.tab === "predictions" })}</section>` : ""}${rest.length ? `<section class="sec" aria-label="Markets">${mkTable(rest, "")}</section>` : ""}`;
}
/* the one line under a list, folded: what the account says of the list itself (how it was chosen, where the rest is), the venues that did
   not answer in their own words, a read-only server. Nothing stands open; nothing is lost. Left as the owner last left it (MKT.footOpen) */
function mkFootHtml(body) {
  const notes = mkNotes(body && body.notes);
  const missing = mkMissingLine(body && body.missing);
  const ro = !writesOn() ? '<p class="mk-note">Read-only server: prices are read here, and nothing is traded or connected from it.</p>' : "";
  if (!notes && !missing && !ro) return "";
  return `<details class="mk-foot"${MKT.footOpen ? " open" : ""}><summary>Why these, and what's not shown <span class="mk-i" aria-hidden="true">ⓘ</span></summary><div class="mk-foot-b">${ro}${missing}${notes}</div></details>`;
}

/* a watched market not in the explore read (a quiet one, or a venue no longer listing it): enough of a row to price it, open it, trade or
   connect it, and stop watching it */
function mkPseudo(w, body) {
  const v = mkVenue(w.venue);
  const pub = mkRows(body).flatMap((x) => x.at).find((a) => a.public && a.connectTo === w.venue && a.connector);
  const opt = A.connectLive && (A.connectLive.options || []).find((o) => o.kind === w.venue);
  const ev = /:/.test(w.symbol) && !/\//.test(w.symbol);
  const at = v
    ? { venue: v.id, venueName: v.name, symbol: w.symbol, connected: true, canTrade: v.trade ? v.trade.can : false, public: false }
    : { venue: w.venue, venueName: pub ? pub.venueName : w.venue, symbol: w.symbol, connected: false, canTrade: false, public: true, connectTo: w.venue, connector: pub ? pub.connector : opt ? opt.connector : "" };
  return { key: `watch:${w.venue}|${w.symbol}`, kind: ev ? "event" : "coin", name: w.symbol, ...(ev ? {} : { base: w.symbol.split(/[/@:]/)[0] }), tabs: [], at: [at] };
}
/* Watching: the owner's watchlist (which agents read over MCP), each priced fresh where its venue is connected; ★ says since when */
function mkWatchingHtml(lens) {
  const g = MKT.got.get(MKT_ALL);
  if (!g || (!g.pending && Date.now() - (g.at || 0) > MKT_TTL)) mkFetch(MKT_ALL);
  const body = g && g.good;
  const all = mkRows(body);
  const rows = (A.watch || []).map((w) => {
    const item = all.find((x) => mkIsWatch(x, w)) || mkPseudo(w, body);
    const oi = item.outcomes ? item.outcomes.findIndex((o) => o.at.some((l) => l.symbol === w.symbol)) : -1;
    return { w, item, oi: oi >= 0 ? oi : undefined };
  }).filter((x) => mkInLens(x.item, lens));
  if (!rows.length) return '<div class="card"><p class="empty">Nothing watched. Press ★ on a market to watch it: your agents read the watchlist.</p></div>';
  const cols = [
    { label: "", sr: "Watch, price alert", cls: "mk-c-keys", cell: (x) => mkKeys(x.item, x.i, x.w.at) },
    { label: "Market", cls: "mk-c-name", cell: (x) => mkNameBtn(x.item, x.i) },
    { label: "Where", cls: "mk-c-where", cell: (x) => mkWhere(x.item) },
    { label: "Price", r: true, cell: (x) => {
      const ev = x.item.kind === "event";
      const m = mkVenue(x.w.venue) ? mkFresh(`${x.w.venue}|${x.w.symbol}`) : null;
      const o = x.oi !== undefined ? x.item.outcomes[x.oi] : null;
      const shown = m ? (ev ? mkCents(m.price ?? m.ask) : mkUsd(m.price ?? m.ask)) : ev ? mkCents(o ? o.price : x.item.price) : mkUsd(x.item.price);
      // the outcome watched is said beside its price, as a row of All says its lead outcome
      return `${ev ? "" : mkClosedTag(x.item)}<span${mkVenue(x.w.venue) ? ` data-q="${esc(`${x.w.venue}|${x.w.symbol}`)}" data-fmt="${ev ? "c-last" : "usd"}"` : ""}>${shown}</span>${o ? `<span class="dim small"> ${esc(mkLabel(o.label))}</span>` : ""}`;
    } },
    { label: "24h", r: true, cell: (x) => (x.item.kind === "event" ? chg(x.oi !== undefined && x.item.outcomes[x.oi].change24h !== undefined ? x.item.outcomes[x.oi].change24h * 100 : undefined, "¢") : chg(x.item.changePct24h)) },
    { label: "", sr: "Actions", r: true, cell: (x) => mkActs(x.item, x.i) },
  ];
  return `<div class="card">${table(cols, rows.map((x) => ({ ...x, i: mkReg(x.item) })), { cls: "mk-t", rowAttr: (x) => `data-k="${esc(`${x.w.venue}|${x.w.symbol}`)}"${mkVenue(x.w.venue) ? ` data-pairs="${esc(`${x.w.venue}|${x.w.symbol}`)}"` : ""}` })}</div>`;
}

// ---- price alerts (account/state.ts Alert): the owner's, signed as setAlert; agents read them too -------------------------------------

/* an alert is on one of this row's markets (any venue, any outcome), as a watch is: the standing ones, and the ones that fired */
const mkAlertsOf = (item) => (A && Array.isArray(A.alerts) && item && item.at ? A.alerts.filter((x) => mkIsWatch(item, x)) : []);
const mkFiredOf = (item) => (A && Array.isArray(A.alertsFired) && item && item.at ? A.alertsFired.filter((x) => mkIsWatch(item, x)) : []);
/* an alert's figure as the market says its prices: cents for an event contract, dollars for the rest */
const mkAlertFig = (item, n) => (item && item.kind === "event" ? mkCents(n) : mkUsd(n));
/* a figure as the account signs it: a plain decimal, at most ten places, no exponent and no trailing zeros */
const mkPlain = (n) => Number(n).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
/** which way, in words: on a standing alert, what it will say; on a fired one, what happened */
const mkAlertWay = (x, past = false) => (x.condition === "above" ? (past ? "rose above" : "Rises above") : past ? "fell below" : "Falls below");
/** this market's alerts, as lines: the standing ones (each with Remove, a signed setAlert with on "" — only for a browser that signs) and
 * the fired ones, newest first, each with the price that fired it and whose price that was. "" where it has none */
function mkAlertLinesHtml(item) {
  const standing = mkAlertsOf(item);
  const fired = mkFiredOf(item).slice(0, 5);
  if (!standing.length && !fired.length) return "";
  const owner = owns();
  const lines = [
    ...standing.map((x) => `<div><span class="mk" aria-hidden="true">·</span><div><div class="t1">${esc(mkAlertWay(x))} ${esc(mkAlertFig(item, x.price))}</div><div class="t2">${esc(x.venueName || nameOf(x.venue))} · since ${esc(nyDay(x.at))} · until ${esc(nyDay(x.expiresAt))} · ${esc(x.id)}</div></div>${owner ? `<button type="button" class="btn btn-sm btn-ghost" data-act="alert-off" data-id="${esc(x.id)}" data-fk="alert-off:${esc(x.id)}">Remove</button>` : ""}</div>`),
    ...fired.map((f) => `<div><span class="mk ok" aria-hidden="true">✓</span><div><div class="t1">${esc(mkAlertWay(f, true))} ${esc(mkAlertFig(item, f.price))}: ${esc(mkAlertFig(item, f.seen))}</div><div class="t2">${esc(f.venueName || nameOf(f.venue))} · ${esc(nyDay(f.firedAt))} ${esc(nyTime(f.firedAt))} New York${f.from ? ` · ${esc(f.from)}` : ""}</div></div></div>`),
  ];
  return `<div class="feed mk-al-feed">${lines.join("")}</div>`;
}
/* the price now of an alert's market, for the Alerts list: fresh from its venue where that is connected (the poll moves it in place: data-q),
   else as the Markets list read the row; and how far the figure is from it */
function mkAlertNowCell(r) {
  const ev = r.item.kind === "event";
  const m = mkVenue(r.x.venue) ? mkFresh(`${r.x.venue}|${r.x.symbol}`) : null;
  const now = m ? (m.price ?? m.ask) : mkPriceOf(r.item);
  const n = Number(now);
  const dist = Number.isFinite(n) && n > 0 ? ((r.x.price - n) / n) * 100 : null;
  const live = mkVenue(r.x.venue) ? ` data-q="${esc(`${r.x.venue}|${r.x.symbol}`)}" data-fmt="${ev ? "c-last" : "usd"}"` : "";
  return `<span${live}>${ev ? mkCents(now) : mkUsd(now)}</span>${dist !== null ? `<span class="dim small"> · ${dist > 0 ? "+" : ""}${dist.toFixed(1)}% to go</span>` : ""}`;
}
/** THE ALERTS, under the watchlist on the Watching tab: each standing alert — its market (the row Markets lists, else a row of its own, as
 * a watched market no read carries), which way and the figure, the price now, since and until when — and Remove; then the ones that fired,
 * newest first. What the account says of them: checked about every 30 seconds while it runs, each standing 90 days. "" with none at all */
function mkAlertsHtml(lens) {
  const alerts = A.alerts || [];
  const fired = A.alertsFired || [];
  if (!alerts.length && !fired.length) return "";
  const body = (MKT.got.get(MKT_ALL) || {}).good;
  const all = mkRows(body);
  const rowOf = (x) => all.find((r) => mkIsWatch(r, x)) || mkPseudo(x, body);
  const rows = alerts.map((x) => ({ x, item: rowOf(x) })).filter((r) => mkInLens(r.item, lens));
  const owner = owns();
  const cols = [
    { label: "Market", cls: "mk-c-name", cell: (r) => mkNameBtn(r.item, r.i) },
    { label: "Tells you when", cell: (r) => `<span class="mk-al-cond">${esc(mkAlertWay(r.x))} <b>${esc(mkAlertFig(r.item, r.x.price))}</b></span>` },
    { label: "Now", r: true, cell: (r) => mkAlertNowCell(r) },
    { label: "Since", cell: (r) => `<span class="dim small">${esc(nyDay(r.x.at))} · until ${esc(nyDay(r.x.expiresAt))}</span>` },
    { label: "", sr: "Actions", r: true, cell: (r) => (owner ? `<div class="acts"><button type="button" class="btn btn-sm btn-ghost" data-act="alert-off" data-id="${esc(r.x.id)}" data-fk="alert-off:${esc(r.x.id)}">Remove</button></div>` : "") },
  ];
  const standing = rows.length
    ? table(cols, rows.map((r) => ({ ...r, i: mkReg(r.item) })), { cls: "mk-t mk-al-t", rowAttr: (r) => `data-k="${esc(r.x.id)}"${mkVenue(r.x.venue) ? ` data-pairs="${esc(`${r.x.venue}|${r.x.symbol}`)}"` : ""}` })
    : `<p class="empty">${alerts.length ? "No price alert in this lens." : "No price alert standing. Press 🔔 on a market to be told when it crosses a price."}</p>`;
  const firedHtml = fired.length
    ? `<div class="feed mk-al-feed">${fired.slice(0, 8).map((f) => { const it = rowOf(f); return `<div><span class="mk ok" aria-hidden="true">✓</span><div><div class="t1">${esc(f.symbol)} at ${esc(f.venueName || nameOf(f.venue))} ${esc(mkAlertWay(f, true))} ${esc(mkAlertFig(it, f.price))}: ${esc(mkAlertFig(it, f.seen))}</div><div class="t2">${esc(nyDay(f.firedAt))} ${esc(nyTime(f.firedAt))} New York${f.from ? ` · ${esc(f.from)}` : ""}</div></div></div>`; }).join("")}</div>`
    : "";
  return `<section class="sec" aria-label="Price alerts"><div class="sec-head"><h2 class="h2">Price alerts</h2><span class="dim small">${esc(plural(alerts.length, "alert"))} standing · checked about every 30 seconds while the account runs · each stands 90 days</span></div>${standing}${firedHtml ? `<h3 class="label">Fired</h3>${firedHtml}` : ""}</section>`;
}

// ---- the pulse (after OpenStock's dashboard): the session and the day in six figures, over the All tab -------------------------------

/* the six: the index ETFs the US stocks line prices without a key, and the two coins every exchange lists — by what a row is (its base and
   kind), never by a venue's name */
const MK_PULSE = [["SPY", "stock", "S&P 500"], ["QQQ", "stock", "Nasdaq 100"], ["DIA", "stock", "Dow 30"], ["IWM", "stock", "Russell 2000"], ["BTC", "coin", "Bitcoin"], ["ETH", "coin", "Ethereum"]];
/* the rows the pulse draws from: the tab's own read (the two coins are among All's busiest), and the Stocks tab's (the index ETFs are stock
   lines, which say no dollar volume and so stand far down All's list), read once and kept like any read */
const MKT_STOCKS = "/api/account/explore?tab=stocks";
function mkPulseRows(body) {
  const g = MKT.got.get(MKT_STOCKS);
  if (!g || (!g.pending && Date.now() - (g.at || 0) > MKT_TTL)) mkFetch(MKT_STOCKS);
  const seen = new Set();
  return [...mkRows(body), ...mkRows(g && g.good)].filter((x) => x && !seen.has(x.key) && seen.add(x.key));
}
/* how long until a moment, after its word: "opens in 1h 07m" · "closes in 12m 30s" · "opens in 2d 15h"; "opens now" once it has come */
function mkIn(word, ms) {
  if (!(ms > 0)) return `${word} now`;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${word} in ${d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`}`;
}
/** THE SESSION LINE: the US stock market as the stocks' own session words say it (mkSessionOf: the venue's clock, or the market calendar
 * behind the US stocks line — never the page's own clock) — a dot (green open, amber an extended session, grey closed), the state, a
 * countdown on the page's clock (.mk-sess, ticked with the countdowns: mkTickPlan) to the close, the open or the end of the extended
 * session, and that moment in New York and in the viewer's time. "" where no stock row says a session */
function mkSessionLine(rows) {
  const it = rows.find((x) => x.kind === "stock" && mkSessionOf(x));
  const s = it ? mkSessionOf(it) : null;
  if (!s) return "";
  const ph = mkPhase(s);
  const state = s.open ? "Open" : ph ? MK_PHASE_TAGS[ph] || ph : "Closed";
  const at = s.open ? s.closesAt : ph && s.phaseEndsAt ? s.phaseEndsAt : s.opensAt;
  const word = s.open ? "closes" : ph === "pre" ? "opens" : ph ? "ends" : "opens";
  const ok = !!at && Number.isFinite(Date.parse(at));
  const dot = s.open ? "up" : ph ? "ext" : "off";
  return `<span class="mk-dot ${dot}" aria-hidden="true"></span><b>US stocks</b> · ${esc(state)}${ok ? ` · <span class="mk-sess" data-at="${esc(at)}" data-word="${esc(word)}"${Date.parse(at) - Date.now() > 0 ? "" : " data-closed"}>${esc(mkIn(word, Date.parse(at) - Date.now()))}</span><span class="dim"> · ${esc(word)} ${esc(nyDay(at))} ${esc(nyTime(at))} New York${esc(yourTime(at))}</span>` : ""}${ph && s.extendedHours ? '<span class="dim"> · a limit order with extended hours trades now</span>' : ""}`;
}
/** THE PULSE: the session line and the six tiles, each a button that opens its market — its name, its symbol, its price now (ticking in
 * place where its venue is connected: data-q, with the rows), its 24 hours and whose price it is (a US stock's: which source, how far
 * behind). Only figures the read has: a tile with no row is left out, and with no row and no session nothing is drawn */
function mkPulseHtml(body) {
  const rows = mkPulseRows(body);
  const tiles = MK_PULSE.map(([base, kind, label]) => ({ label, item: rows.find((x) => x.kind === kind && String(x.base || "").toUpperCase() === base && !mkIsPreipo(x)) })).filter((t) => t.item);
  const session = mkSessionLine(rows);
  if (!tiles.length && !session) return "";
  const tile = (t) => {
    const it = t.item;
    const i = mkReg(it);
    const lead = mkLeadLeg(it);
    const q = lead ? ` data-q="${esc(`${lead.venue}|${lead.symbol}`)}" data-fmt="usd"` : "";
    const pairs = mkAllPairs(it).slice(0, 2);
    const from = mkPriceFrom(it) || (it.at[0] ? it.at[0].venueName : "");
    return `<button type="button" class="mk-tile" data-act="open" data-i="${i}" data-fk="pulse:${esc(it.key)}" data-k="${esc(it.key)}"${pairs.length ? ` data-pairs="${esc(pairs.join(","))}"` : ""} aria-label="${esc(t.label)}: open ${esc(it.name)}"><span class="mk-tile-h"><span>${esc(t.label)}</span><span class="dim">${esc(it.base || "")}</span></span><span class="mk-tile-px"${q}>${mkUsd(mkPriceOf(it))}</span><span class="mk-tile-f">${chg(it.changePct24h)}${from ? `<span class="dim">${esc(from)}</span>` : ""}</span></button>`;
  };
  return `<section class="mk-pulse" aria-label="Pulse">${session ? `<p class="mk-sess-line">${session}</p>` : ""}${tiles.length ? `<div class="mk-tiles">${tiles.map(tile).join("")}</div>` : ""}</section>`;
}

// ---- as of: one line over the list — when it was read, how it reaches the page, and whose prices these are -----------------------------

/** THE AS-OF LINE: the read's time (the account's asOf; not its age, since the line stands until the next draw), whether prices reach
 * the page pushed on the account's channel or
 * polled every few seconds while on screen, then the venues behind the rows in groups — the owner's connected venues, the paper accounts,
 * the public lists (venues read without a key), the US stocks' sources in their own words ("where marked" once there is more than one, since
 * each price says its own) and the event venues. Only the groups the rows have, at most four names each. "" without a read */
function mkAsOfHtml(body) {
  if (!body || !body.asOf) return "";
  const legs = mkRows(body).flatMap((x) => (x.at || []).map((a) => ({ ...a, kind: x.kind, quoteFrom: a.quoteFrom || x.quoteFrom })));
  const few = (list) => {
    const seen = [];
    for (const n of list) if (n && !seen.includes(n)) seen.push(n);
    return seen.length > 4 ? `${seen.slice(0, 4).join(", ")} +${seen.length - 4}` : seen.join(", ");
  };
  const stock = (a) => a.kind === "stock";
  const event = (a) => a.kind === "event";
  const sources = new Set(legs.filter((a) => stock(a) && a.quoteFrom).map((a) => a.quoteFrom));
  const groups = [
    ["your venues", few(legs.filter((a) => a.connected && !a.paper).map((a) => a.venueName))],
    ["paper", few(legs.filter((a) => a.paper).map((a) => String(a.venueName || "").replace(/ · paper$/i, "")))],
    ["public lists", few(legs.filter((a) => a.public && !a.connected && !stock(a) && !event(a)).map((a) => a.venueName))],
    ["US stocks", `${few([...sources])}${sources.size > 1 ? " where marked" : ""}`],
    ["predictions", few(legs.filter((a) => event(a) && !a.connected).map((a) => a.venueName))],
  ].filter(([, v]) => v && v !== " where marked");
  const at = Date.parse(body.asOf);
  const when = Number.isFinite(at) ? `Prices read ${nyTime(at)} New York` : "Prices read";
  const how = typeof stHealth === "function" && stHealth() === "connected" ? "pushed live" : `polled every ${Math.round(MKT_POLL_MS / 1000)} s while on screen`;
  const line = [when, how, ...groups.map(([k, v]) => `${k}: ${v}`)].join(" · ");
  return `<p class="mk-asof" title="${esc(line)}">${esc(line)}</p>`;
}

// ---- the three lists over All: the account's own biggest moves, most traded and closing soonest, drawn as rows ---------------------------

/** THE LISTS under the Pulse, over All when nothing is searched: the account's `movers` (the biggest 24-hour moves among markets with real
 * volume), `mostTraded`, and `closing` (the busiest events that close within a day), five rows each — the market's name, opening its drawer
 * with its hover card, and the figures the list is about: the move and the price; the volume and the move; the countdown (ticking with the
 * others) and the lead outcome. "See all →" opens the whole list in that order. A list with nothing is left out; with nothing in any, nothing */
function mkListsHtml(body, lens) {
  if (!body) return "";
  const pick = (list) => (list || []).filter((x) => x && Array.isArray(x.at) && mkInLens(x, lens)).slice(0, 5);
  const move = (it) => (it.kind === "event" ? mkEventChg(it) : chg(it.changePct24h));
  const lists = [
    ["Biggest moves", pick(body.movers), (it) => `${move(it)}<span class="mk-li-px">${mkPriceCell(it)}</span>`, { tab: "", sort: "movers" }],
    ["Most traded", pick(body.mostTraded), (it) => `<span class="mk-li-vol">${esc(mkVolCell(it))}</span>${move(it)}`, { tab: "", sort: "" }],
    ["Closing soonest", pick(body.closing), (it) => `${mkCloseHtml(it, mkEnded(it))}<span class="mk-li-px">${mkPriceCell(it)}</span>`, { tab: "predictions", sort: "closing" }],
  ].filter(([, items]) => items.length);
  if (!lists.length) return "";
  const row = (it, cell) => {
    const i = mkReg(it);
    const pairs = mkAllPairs(it).slice(0, 2);
    return `<li class="mk-li" data-k="li:${esc(it.key)}"${pairs.length ? ` data-pairs="${esc(pairs.join(","))}"` : ""}>${mkNameBtn(it, i)}<span class="mk-li-r">${cell(it)}</span></li>`;
  };
  const section = ([title, items, cell, to]) => `<section class="mk-list" aria-label="${esc(title)}"><div class="mk-list-h"><h2 class="h2">${esc(title)}</h2><button type="button" class="link dim small" data-act="seeall" data-fk="seeall:${esc(title)}" data-tab="${esc(to.tab)}" data-sort="${esc(to.sort)}">See all →</button></div><ol class="mk-li-list">${items.map((it) => row(it, cell)).join("")}</ol></section>`;
  return `<div class="mk-lists">${lists.map(section).join("")}</div>`;
}

// ---- the pane ----------------------------------------------------------------------------------------

/* the route's tab, search and sort, as the pane reads them: an unknown tab is All (All results while searching), a legacy one (now, venues)
   is All too, and `bogus` says the hash named one the pane does not have under that name, so the pane puts the right one in its place */
function mkParams(params) {
  const q = String((params && params.q) || "").trim().slice(0, 60);
  let tab = String((params && params.tab) || "");
  const legacy = Object.prototype.hasOwnProperty.call(MKT_LEGACY_TABS, tab);
  if (legacy) tab = MKT_LEGACY_TABS[tab];
  const known = ["watching", ...MKT_TAB_IDS].includes(tab);
  if (!known) tab = q ? "" : "all";
  // a search typed while watching is a search of every market (the watchlist is not searched)
  const searchedWatching = tab === "watching" && !!q;
  if (searchedWatching) tab = "";
  const sort = MKT_SORTS.includes(params && params.sort) ? params.sort : "";
  return { tab, q, sort, bogus: !!(params && params.tab) && (!known || legacy || searchedWatching) };
}
/* the quiet lines under a list: what the account says of the list itself (how it was chosen, where the rest is), one line a sentence */
const mkNotes = (notes) => (Array.isArray(notes) ? notes.filter((n) => typeof n === "string" && n.trim()).map((n) => `<p class="mk-note">${esc(n.trim())}</p>`).join("") : "");
/* the explore read for a tab: All is every row (no tab named: the account's own list, busiest first); a sort is never asked of the account */
function mkPath(p, limit) {
  const qs = new URLSearchParams(Object.entries({ tab: p.tab === "all" ? "" : p.tab, q: p.q, limit: limit ? String(limit) : "" }).filter(([, v]) => v)).toString();
  return `/api/account/explore${qs ? `?${qs}` : ""}`;
}

/* one explore read: the last answer is kept with the last one that was not a refusal, so a failure never blanks what was drawn */
function mkFetch(path) {
  const was = MKT.got.get(path);
  if (was && was.pending) return;
  MKT.got.set(path, { ...(was || {}), pending: true });
  api(path).then((body) => {
    const ok = !!body && body.ok !== false && Array.isArray(body.items);
    MKT.got.set(path, { at: Date.now(), body, good: ok ? body : was && was.good, goodAt: ok ? Date.now() : was && was.goodAt });
    if (ok && path !== MKT_ALL) MKT.good = { body, at: Date.now() };
    if (ok && path === MKT_ALL && !MKT.good) MKT.good = { body, at: Date.now() };
    if (A && ROUTE.tab === "markets" && MKT.ctx) paneLater("markets", mkRedrawShown);
    if (MKT.open) mkDrawerRedraw();
  });
}
const mkRedraw = () => renderMarkets({ ...MKT.ctx, owner: owns(), lens: lensNow(), params: ROUTE.params });
/* the All list, asked for once while the owner is elsewhere (shell.js, after the first account read, when the browser is idle): the first
   visit to Markets then comes in drawn (shell.js paneIn) instead of a skeleton swapped for the list after the entrance. Kept like any read
   (MKT_TTL): a later visit asks again only when it is stale */
function mkPrefetch() {
  const path = mkPath({ tab: "all", q: "" });
  if (A && !MKT.got.has(path)) mkFetch(path);
}
/* drawn again only if Markets is still what is shown */
function mkRedrawShown() {
  if (A && ROUTE.tab === "markets" && MKT.ctx) mkRedraw();
}

/** MARKETS: the shell calls this with { el, owner, lens, params } each time the account is read and whenever the route moves here */
function renderMarkets(ctx) {
  MKT.ctx = ctx;
  if (MKT.el !== ctx.el) {
    ctx.el.addEventListener("click", mkPaneClick);
    // the footer's fold does not bubble: heard in capture, so a redraw keeps it as the owner left it
    ctx.el.addEventListener("toggle", mkPaneToggle, true);
    // a market's hover card
    mkPeekWire(ctx.el);
    MKT.el = ctx.el;
  }
  MKT.reg = [];
  const p = mkParams(ctx.params);
  // a tab the hash names that the pane does not have under that name: the right one takes its place, so the page and the address agree
  if (p.bogus) return void go("markets", { ...ctx.params, tab: p.tab || undefined }, { replace: true });
  let body = "";
  let foot = "";
  let tabsFrom = null;
  if (p.tab === "watching") {
    body = `${mkWatchingHtml(ctx.lens)}${mkAlertsHtml(ctx.lens)}`;
    foot = mkFootHtml(null);
  } else {
    const path = mkPath(p);
    const g = MKT.got.get(path);
    if (!g || (!g.pending && Date.now() - (g.at || 0) > MKT_TTL)) mkFetch(path);
    const got = g && g.good;
    tabsFrom = got;
    const failed = g && g.body && !(g.body.ok !== false && Array.isArray(g.body.items)) ? refusalOf(g.body) || "the account did not answer" : "";
    // a tab this read does not have (nothing is in it now): every result while searching, else All
    if (got && got.tabs.length && p.tab && p.tab !== "all" && !mkTabIds(got).some(([id]) => id === p.tab)) return void go("markets", { ...ctx.params, tab: p.q ? "" : "all", sort: "" }, { replace: true });
    if (got) {
      // the pulse over All (not over a search, whose rows are the answer): the session and the six figures. The list is drawn first, so its
      // rows keep the places (data-i) they have always had; the tiles take the places after them
      const list = mkListHtml(p, got, ctx.lens);
      const pulse = p.tab === "all" && !p.q ? mkPulseHtml(got) : "";
      // one line first: when these prices were read and whose they are (mkAsOfHtml); then, over All, the account's three lists (mkListsHtml)
      const asOf = mkAsOfHtml(got);
      const lists = p.tab === "all" && !p.q ? mkListsHtml(got, ctx.lens) : "";
      body = `${asOf}${pulse}${lists}${list}${failed ? `<p class="mk-missing">Couldn't read the markets again just now: ${esc(mkSaid(failed))}. This is what was read at ${esc(nyTime(g.goodAt))}.</p>` : ""}`;
      foot = mkFootHtml(got);
    } else if (failed) body = `<div class="mk-fail"><div class="msg no">Couldn't read the markets: ${esc(mkSaid(failed))}.</div><button type="button" class="btn btn-sm" data-act="retry" data-fk="retry">Try again</button></div>`;
    else body = mkSkel();
  }
  paint(ctx.el, `<div class="mk">${mkTabs(p, tabsFrom || (MKT.good && MKT.good.body))}${body}${foot}${mkCredit(MKT.reg)}</div>`);
  mkObserve(ctx.el);
  mkPeekKeep();
  mkStart();
}

/* one click handler for the pane, which is drawn again and again */
function mkPaneClick(e) {
  mkPeekHide();
  const t = e.target;
  const b = t && t.closest && t.closest("[data-act]");
  if (!b || b.disabled) return;
  const item = MKT.reg[Number(b.dataset.i)];
  switch (b.dataset.act) {
    case "tab": return void go("markets", { q: ROUTE.params.q, tab: b.dataset.tab });
    case "sort": return void go("markets", { ...ROUTE.params, sort: b.dataset.v === "volume" ? "" : b.dataset.v }, { replace: true });
    // a list's "See all →": the whole list in that order — All for moves and volume, Predictions for what closes soonest
    case "seeall": return void go("markets", { ...ROUTE.params, tab: b.dataset.tab || "all", sort: b.dataset.sort || "" });
    case "clear-q": return void go("markets", { ...ROUTE.params, q: "", tab: ROUTE.params.tab || "" }, { replace: true });
    case "retry": for (const g of MKT.got.values()) g.at = 0; return void mkRedraw();
    case "connect": return void connectVia(b.dataset.connector, { name: b.dataset.name });
    case "alert-off": return void mkAlertOff(b.dataset.id);
    default: return void (item && mkAct(b, item));
  }
}
/* the footer's fold, remembered across redraws */
function mkPaneToggle(e) {
  const d = e.target;
  if (d && d.classList && d.classList.contains("mk-foot")) MKT.footOpen = !!d.open;
}
/* what a row's button does, from the pane or the drawer */
function mkAct(b, item) {
  const act = b.dataset.act;
  if (act === "open") return void openMarket(item);
  if (act === "watch") return void mkToggleWatch(item);
  if (act === "alert") return void openAlertSheet(item);
  if (act === "trade") return void mkTrade(item, "buy");
  if (act === "yn") return void mkTrade(item, "buy", Number(b.dataset.o));
  if (act === "hand") return void mkHand(item);
}

// ---- doing: the ticket, the agent, the watchlist -----------------------------------------------------------

/** the ticket, preset: the Trade pane's own (openTicket), opened on the row's kind — crypto · stocks · rwas · perps · preipo · predictions —
 * which the Trade seg follows */
function mkTicket(preset, item) {
  const p = { ...preset, ...(item ? { kind: mkKindOf(item), key: item.key, base: item.base, name: item.name } : {}) };
  // the ticket is the Trade pane's panel on the right, where this drawer would cover it
  if (mkDrawerBody()) closeDrawer();
  if (typeof openTicket === "function") openTicket(p);
}
/** Buy (or one outcome's button): the ticket at the venue that takes the order, the connection where only public prices list it, else the
 * venue's own words for why not */
function mkTrade(item, side, oi) {
  const r = mkRoute(item, oi);
  if (r.act === "trade") return void mkTicket({ venue: r.venue, symbol: r.symbol, side, ...(oi !== undefined && item.outcomes ? { outcome: item.outcomes[oi].label } : {}) }, item);
  if (r.act === "connect") return void connectVia(r.connector, { name: r.venueName });
  // a state in a word (Not served here, Close only here) is no error: the market's drawer says where it stands
  if (r.word) return void (MKT.open && MKT.open.item && MKT.open.item.key === item.key ? undefined : openMarket(item));
  toast(r.text || "No venue on the account trades it.", "no");
}
/** Hand to agent: the owner's intent for it, which agents read (signed in the intent sheet; it grants nothing — the limits do), with the
 * row's kind for the composer. A market only public prices list points the agent at that venue by name */
function mkHand(item, side = "buy") {
  if (typeof openHandToAgent !== "function") return;
  const r = mkRoute(item);
  const t = r.act === "trade" ? { venue: r.venue, symbol: r.symbol, venueName: r.venueName } : mkHandTarget(item);
  openHandToAgent({ ...t, side, kind: mkKindOf(item) });
}
/** where an agent is pointed for a row no connected venue trades: its first connected venue, else the venue its public prices come from —
 * by that venue's name, since the account does not know it yet */
function mkHandTarget(item) {
  const c = item.at.find((a) => a.connected && a.symbol);
  if (c) return { venue: c.venue, symbol: c.symbol, venueName: c.venueName };
  const p = item.at.find((a) => a.public && a.connectTo);
  return p ? { venue: p.connectTo, symbol: p.symbol, venueName: p.venueName } : {};
}
/** ★: a signed setWatch (agents read the watchlist over MCP) */
async function mkToggleWatch(item) {
  const d = mkWatchDraft(item);
  if (d && owns()) await own(d);
}
/** Remove, on an alert: a signed setAlert with on "", naming the alert as it stands (What you sign shows it) */
async function mkAlertOff(id) {
  const x = (A && A.alerts ? A.alerts : []).find((a) => a.id === id);
  if (!x || !owns()) return;
  await own({ type: "setAlert", id: x.id, venue: x.venue, symbol: x.symbol, condition: x.condition, price: mkPlain(x.price), on: "" });
}
/** THE ALERT SHEET for one market (🔔 on a row, Alert in the drawer): Rises above | Falls below, the figure — the price now to start with;
 * an event contract's in cents — how far from the price now, and a warning where the price is there already (it fires at the next look,
 * within half a minute). Prepared by the account as it is typed and shown field by field before the signature (core quoteDialog): Set is a
 * signed setAlert through the account's door. Under the form, this market's alerts standing (each with Remove) and the ones that fired. A
 * switch asks this browser to show alerts as its own notifications too (the browser's permission asked once; kept in this browser alone:
 * shell.js SH_NOTIFY_KEY). The market the alert names is the one ★ would watch: at the first connected venue, else at the venue its public
 * prices would be once connected (mkWatchTarget) */
function openAlertSheet(item) {
  if (!A || !item) return;
  const t = mkWatchTarget(item);
  const had = mkAlertsOf(item);
  if (!t && !had.length) return void toast("No venue lists this market right now, so no price alert can name it.", "info");
  const ev = item.kind === "event";
  const venue = t ? t.venue : had[0].venue;
  const symbol = t ? t.symbol : had[0].symbol;
  const venueName = (item.at.find((a) => a.venue === venue || mkVenueOfLeg(item, a.venue) === venue) || {}).venueName || (had[0] && had[0].venueName) || nameOf(venue);
  const now = Number(mkPriceOf(item));
  const hasNow = Number.isFinite(now) && now > 0;
  // what the field starts with: the price now, as the owner types one (cents for an event contract: 62 for 62¢)
  const start = hasNow ? (ev ? mkPlain(Math.round(now * 10000) / 100) : mkPlain(Number(now.toPrecision(8)))) : "";
  const fmt = (n) => mkAlertFig(item, n);
  const cond = (form) => (form.elements.condition && form.elements.condition.value === "below" ? "below" : "above");
  const d = quoteDialog({
    title: "Price alert",
    sub: `You are told when ${esc(item.name)} crosses the price — on this page as it happens, and as this browser's notification if you ask. It places nothing.`,
    fields: `<div class="who mk-al-who">${mkAv(item)}<div><b>${esc(item.name)}</b><span class="dim">${esc(venueName)} · ${esc(symbol)} · now ${esc(hasNow ? fmt(now) : "no price read")}</span></div></div>
      <input type="hidden" name="condition" value="above" />
      <div><div class="label">Tell me when it</div><div data-al-cond></div></div>
      <label class="fld">${ev ? "Price, in cents (62 is 62¢)" : "Price, in dollars"}<input name="price" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(start || (ev ? "62" : "63500"))}" value="${esc(start)}" /></label>
      <label class="chk1"><input type="checkbox" name="notify"${typeof shNotifyWanted === "function" && shNotifyWanted() ? " checked" : ""} /> Also show it as this browser's own notification</label>`,
    draft: (form) => {
      const typed = String(formFields(form).price || "").trim();
      if (!typed) return `Type the price you want to be told at${hasNow ? ` (now ${fmt(now)})` : ""}.`;
      if (!/^\d{1,12}(\.\d{1,10})?$/.test(typed) || !(Number(typed) > 0)) return ev ? "A price in cents is a plain positive number: 62 for 62¢, 0.5 for half a cent." : "A price is a plain positive number: 63500, or 0.1212.";
      const price = ev ? mkPlain(Number(typed) / 100) : typed;
      return { type: "setAlert", id: "", venue, symbol, condition: cond(form), price, on: "true" };
    },
    show: (p) => {
      const a = p.action;
      const target = Number(a.price);
      const dist = hasNow ? ((target - now) / now) * 100 : null;
      const met = hasNow && (a.condition === "above" ? target <= now : target >= now);
      const where = !hasNow ? "No price was read for it just now: the alert stands, and fires once a read reaches the price." : met ? `The price is ${a.condition === "above" ? "at or above" : "at or below"} this already: it fires at the account's next look, within half a minute.` : `Now ${fmt(now)} · ${dist > 0 ? "+" : ""}${dist.toFixed(2)}% away.`;
      return `<div class="big"><span>${esc(item.name)} ${a.condition === "above" ? "rises above" : "falls below"}</span><span>${esc(fmt(target))}</span></div><div class="path${met ? " warn-t" : ""}">${esc(where)}</div><div class="path">The account prices it about every 30 seconds while it runs, whether or not this page is open, and says the alert once; it stands 90 days, then lapses. It places nothing: your agents read it as what you watch for, never as an instruction.</div>`;
    },
    done: (r) => saidOf(r.body) || "Price alert set",
    go: "Sign and set the alert",
  });
  const form = d.form;
  form.querySelector("[data-al-cond]").innerHTML = seg([["above", "Rises above"], ["below", "Falls below"]], "above", (v) => {
    form.elements.condition.value = v;
    d.requote();
  }, { label: "Tell me when it" });
  // the notification switch: the browser's permission is asked as it is turned on, and a browser that gives none leaves it off and says so
  form.elements.notify.addEventListener("change", async (e) => {
    const on = !!e.target.checked;
    if (on && typeof Notification === "function" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission().catch(() => "denied");
      if (p !== "granted") {
        e.target.checked = false;
        if (typeof shNotifySet === "function") shNotifySet(false);
        return void toast("This browser gave no permission for notifications: an alert is still said on this page.", "info");
      }
    }
    if (typeof shNotifySet === "function") shNotifySet(on);
  });
  // this market's alerts, under the form, drawn again after each read while the sheet is open (a Remove signed here, an alert that fires)
  form.insertAdjacentHTML("afterend", '<div class="mk-al-list" data-al-list></div>');
  const list = form.parentElement ? form.parentElement.querySelector("[data-al-list]") : null;
  const drawList = () => {
    if (!list || !list.isConnected) return;
    const again = mkResolve({ key: item.key }) || item;
    const html = mkAlertLinesHtml(again);
    paint(list, html ? `<h3 class="label">On this market</h3>${html}` : "");
  };
  if (list) {
    list.addEventListener("click", (e) => {
      const b = e.target && e.target.closest && e.target.closest("[data-act='alert-off']");
      if (b && !b.disabled) mkAlertOff(b.dataset.id);
    });
    drawList();
    if (SHEET) SHEET.redraw = drawList;
  }
}

// ---- fresh prices and countdowns ---------------------------------------------------------------------------

/* the cards and rows in view: only theirs are priced again, and only the countdowns in view are written each second (one that comes into
   view is written at once). A row paint kept in place stays watched; only rows new to the page are added, and the ones that went are let go */
function mkObserve(root) {
  if (typeof IntersectionObserver !== "function") return;
  if (!MKT.io) {
    MKT.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) {
          MKT.seen.delete(e.target);
          continue;
        }
        MKT.seen.add(e.target);
        // a countdown that comes into view is written at once — unless the page is scrolling, when the next second writes it
        if (e.target.matches && e.target.matches(".mk-close[data-close]") && !scrollingNow()) mkTickOne(e.target, Date.now());
      }
    }, { rootMargin: "80px" });
  }
  for (const x of [...MKT.watched]) {
    if (x.isConnected) continue;
    if (MKT.io.unobserve) MKT.io.unobserve(x);
    MKT.watched.delete(x);
    MKT.seen.delete(x);
  }
  for (const x of root.querySelectorAll("[data-pairs], .mk-close[data-close]")) {
    if (MKT.watched.has(x)) continue;
    MKT.io.observe(x);
    MKT.watched.add(x);
  }
}
/** another pane's rows that carry data-pairs and data-q spans (the Trade pane's picker): priced in place by this pane's poll while they are
 * on screen. The pane calls it after it draws (behind `typeof mkWatchPane === "function"`) */
function mkWatchPane(root) {
  if (!root) return;
  mkObserve(root);
  mkStart();
}
/* the countdowns and the price poll run while the Markets or the Trade pane is shown, or a market is open in the drawer; they stop when
   none of them is. The countdowns are on the page's one clock (core everySecond), and the prices a poll brought are written in that same
   frame: one layout a second, at most */
function mkStart() {
  if (!MKT.tick) MKT.tick = everySecond(mkSecond);
  if (!MKT.poll) MKT.poll = setInterval(mkPoll, MKT_POLL_MS);
}
function mkStop() {
  if (typeof MKT.tick === "function") MKT.tick();
  else clearInterval(MKT.tick);
  clearInterval(MKT.poll);
  MKT.tick = 0;
  MKT.poll = 0;
}
/* each second: the countdowns that changed, and the prices a poll brought since — decided now, written in the clock's one frame (none in
   a second where nothing changed) */
function mkSecond() {
  const plan = mkTickPlan();
  const prices = MKT.pricesDue;
  MKT.pricesDue = false;
  if (!plan && !prices) return;
  return () => {
    mkTickApply(plan);
    if (prices) mkPrices();
  };
}
const mkPaneNeeds = (tab) => tab === "markets" || tab === "trade";
onRoute((tab) => {
  mkPeekHide();
  if (!mkPaneNeeds(tab) && !MKT.open) mkStop();
});
const mkDrawerBody = () => { const d = $("drawer"); return d && d.open ? d.querySelector("[data-mk-drawer]") : null; };
/** fresh prices for what is in view — the cards and rows on screen (this pane's, or the Trade pane's picker), the market in the drawer — at
 * most twelve markets a read, and only while the page is in view */
async function mkPoll() {
  if (!A || document.hidden) return;
  const drawer = mkDrawerBody();
  const seen = mkPaneNeeds(ROUTE.tab) ? [...MKT.seen].filter((x) => x.isConnected) : [];
  const trade = ROUTE.tab === "trade" && $("pane-trade") ? [...$("pane-trade").querySelectorAll("[data-pairs]")] : [];
  const els = [...(drawer ? drawer.querySelectorAll("[data-pairs]") : []), ...seen, ...trade];
  const pairs = [...new Set(els.flatMap((x) => String(x.dataset.pairs || "").split(",").filter(Boolean)))].slice(0, 12);
  if (!pairs.length) return;
  const body = await api(`/api/account/quotes?pairs=${encodeURIComponent(pairs.join(","))}`);
  if (!body || body.ok === false || !Array.isArray(body.quotes)) return;
  const now = Date.now();
  for (const q of body.quotes) if (q.market) MKT.quotes.set(`${q.venue}|${q.symbol}`, { at: now, market: q.market });
  // written with the countdowns, in the frame the next second turns over in (a page without frames: now)
  if (typeof requestAnimationFrame === "function" && MKT.tick) MKT.pricesDue = true;
  else mkPrices();
}
/* the fresh prices, in place: only this pane's own (each carries its format: other panes' quote boxes use data-q for something else), and
   only those that changed — each with a tint up or down that comes and goes (shell.css .tick-up · .tick-down) */
function mkPrices() {
  for (const el of document.querySelectorAll("[data-q][data-fmt]")) {
    const m = mkFresh(el.dataset.q);
    if (!m) continue;
    const t = mkFmt(m, el.dataset.fmt);
    if (el.textContent === t) continue;
    // a figure that moved is tinted up or down; a dash that became a figure is a first price, not a move
    const before = String(el.textContent);
    const was = Number(before.replace(/[^0-9.-]/g, ""));
    const now = Number(String(t).replace(/[^0-9.-]/g, ""));
    setText(el, t);
    if (/\d/.test(before) && /\d/.test(t) && Number.isFinite(was) && Number.isFinite(now) && was !== now) mkFlash(el, now > was);
  }
}
/* the tint (shell.css .tick-up · .tick-down) is on for 160 ms, then off: two style changes, no frame-by-frame animation (none at all under
   reduced motion) */
function mkFlash(el, up) {
  if (still() || !el.classList) return;
  el.classList.remove("tick-up", "tick-down");
  el.classList.add(up ? "tick-up" : "tick-down");
  clearTimeout(el.mkFlashing);
  el.mkFlashing = setTimeout(() => el.classList.remove("tick-up", "tick-down"), 160);
}
/* one countdown's words now: past the close, the words the card was drawn with (closed, or still trading past its end date) until the next
   read says; a day's countdown changes once a minute */
const mkCloseText = (el, now) => {
  const left = Date.parse(el.dataset.close) - now;
  return left > 0 ? mkLeft(left) : el.dataset.ended || mkLeft(left);
};
/* one countdown written now, if its words changed (one that comes into view) */
function mkTickOne(el, now) {
  setText(el, mkCloseText(el, now));
}
/** what the countdowns need this second, read and decided without writing (the clock writes it in its frame): the words that changed —
 * only of countdowns in view (one watched and out of view waits until it comes into view: mkObserve writes it then) — and the ones that
 * ended, which are marked all the same. Null when nothing changes */
function mkTickPlan() {
  if (document.hidden) return null;
  // the countdowns on the page, and the table rows whose countdown is in their hover card (data-ends: only their end is watched), looked
  // for again only after something was drawn
  if (!MKT.closes || MKT.closeGen !== paintGen) {
    MKT.closes = [...document.querySelectorAll(".mk-close[data-close]"), ...document.querySelectorAll(".mk-sess[data-at]"), ...document.querySelectorAll(".mk-t tr[data-ends]")];
    MKT.closeGen = paintGen;
  }
  const now = Date.now();
  const texts = [];
  const ended = [];
  for (const el of MKT.closes) {
    if (el.isConnected === false) continue;
    // the pulse's session countdown: its words each second; the moment come, the next read says the session as it then is
    if (el.dataset.at) {
      const left = Date.parse(el.dataset.at) - now;
      const t = mkIn(el.dataset.word || "opens", left);
      if (el.textContent !== t) texts.push([el, t]);
      if (left <= 0 && !el.hasAttribute("data-closed")) ended.push(el);
      continue;
    }
    const words = !!el.dataset.close;
    if (words && (!MKT.watched.has(el) || MKT.seen.has(el))) {
      const t = mkCloseText(el, now);
      if (el.textContent !== t) texts.push([el, t]);
    }
    if (Date.parse(words ? el.dataset.close : el.dataset.ends) - now <= 0 && !el.hasAttribute("data-closed")) ended.push(el);
  }
  return texts.length || ended.length ? { texts, ended } : null;
}
/* a plan written: the words, the countdowns that ended marked; a market that closed sends the next draw to read the markets again (a
   rolling market's next one takes its place) */
function mkTickApply(plan) {
  if (!plan) return;
  for (const [el, t] of plan.texts) setText(el, t);
  for (const el of plan.ended) el.setAttribute("data-closed", "");
  if (!plan.ended.length) return;
  for (const g of MKT.got.values()) g.at = 0;
  setTimeout(() => paneLater("markets", mkRedrawShown), 1500);
}
/** every market countdown on the page (this pane's and its drawer's), at once (the clock asks mkSecond each second); a market that closes
 * sends the next draw to read the markets again (a rolling market's next one takes its place). Only `.mk-close` is a countdown: other panes
 * use data-close for buttons */
function mkTick() {
  mkTickApply(mkTickPlan());
}

// ---- a market's hover card -----------------------------------------------------------------------------------

/* ONE card for the pane (#mk-peek, on the page's body, so no table's scroll cuts it): what a row or a card names short, said in full
   (mkPeekHtml), beside the market a mouse rests on — or a key reached — under its row, above it near the window's foot. It takes no click (a
   click goes to what is under it) and goes when the pointer leaves, the page scrolls, Escape is pressed or anything is clicked. A touch has
   no hover: a tap opens the drawer, which says it all. A screen reader hears the same words from the name itself (mkAbout), so the card is
   for the eye only */
const MK_PEEK = { el: null, at: null, html: "", show: 0, hide: 0, wired: false };
/* how long a resting pointer waits for it; while one is shown, the next market's comes at once */
const MK_PEEK_MS = 300;
function mkPeekEl() {
  if (MK_PEEK.el && MK_PEEK.el.isConnected) return MK_PEEK.el;
  const el = document.createElement("div");
  el.id = "mk-peek";
  el.className = "mk-peek";
  el.setAttribute("aria-hidden", "true");
  el.hidden = true;
  document.body.appendChild(el);
  return (MK_PEEK.el = el);
}
const mkPeekShown = () => !!(MK_PEEK.el && !MK_PEEK.el.hidden && MK_PEEK.at);
/* the pane's listeners, once: a pointer over a market, out of it, a key's focus; the page's scroll and Escape put the card away */
function mkPeekWire(el) {
  el.addEventListener("pointerover", mkPeekOver);
  el.addEventListener("pointerout", mkPeekOut);
  el.addEventListener("focusin", mkPeekFocus);
  el.addEventListener("focusout", mkPeekOut);
  if (MK_PEEK.wired) return;
  MK_PEEK.wired = true;
  addEventListener("scroll", mkPeekHide, { capture: true, passive: true });
  addEventListener("keydown", (e) => e.key === "Escape" && mkPeekHide());
}
const mkPeekOf = (t) => (t && t.closest ? t.closest("[data-peek]") : null);
function mkPeekOver(e) {
  // a finger's touch is no hover: its tap opens the drawer
  if (e.pointerType === "touch") return;
  const a = mkPeekOf(e.target);
  if (a) mkPeekAim(a, false);
}
/* a key that reaches a market's name shows its card at once (a click's focus does not: that click opens the drawer) */
function mkPeekFocus(e) {
  const a = mkPeekOf(e.target);
  if (a && a === e.target && a.matches && a.matches(":focus-visible")) mkPeekAim(a, true);
}
function mkPeekAim(a, now) {
  clearTimeout(MK_PEEK.hide);
  if (MK_PEEK.at === a && mkPeekShown()) return;
  clearTimeout(MK_PEEK.show);
  MK_PEEK.show = setTimeout(() => mkPeekShow(a), now || mkPeekShown() ? 0 : MK_PEEK_MS);
}
function mkPeekOut(e) {
  const a = mkPeekOf(e.target);
  // still on the same market (from its tile to its words)
  if (!a || (e.relatedTarget && a.contains(e.relatedTarget))) return;
  clearTimeout(MK_PEEK.show);
  clearTimeout(MK_PEEK.hide);
  MK_PEEK.hide = setTimeout(mkPeekHide, 80);
}
/* the card for a market's name, written where its words changed, and placed */
function mkPeekShow(a) {
  const item = a && a.isConnected ? MKT.reg[Number(a.dataset.peek)] : null;
  if (!item) return void mkPeekHide();
  const el = mkPeekEl();
  const html = mkPeekHtml(item);
  if (html !== MK_PEEK.html) {
    el.innerHTML = html;
    MK_PEEK.html = html;
    // its countdown is one of the page's: looked for again on the next second
    MKT.closes = null;
  }
  MK_PEEK.at = a;
  el.hidden = false;
  mkPeekPlace(a, el);
}
/* under the market's row (a card's question: under the question), its words' left edge; above it where the window ends first; inside the
   window either way */
function mkPeekPlace(a, el) {
  const box = (a.closest("tr") || a).getBoundingClientRect();
  const words = (a.querySelector(".mk-nm") || a.querySelector("span") || a).getBoundingClientRect();
  const vw = document.documentElement.clientWidth || innerWidth;
  const vh = document.documentElement.clientHeight || innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const below = box.bottom + 6 + h <= vh - 8 || box.top - 6 - h < 8;
  el.style.left = `${Math.round(Math.max(8, Math.min(words.left, vw - w - 8)))}px`;
  el.style.top = `${Math.round(below ? box.bottom + 6 : box.top - 6 - h)}px`;
}
function mkPeekHide() {
  clearTimeout(MK_PEEK.show);
  clearTimeout(MK_PEEK.hide);
  MK_PEEK.at = null;
  const el = MK_PEEK.el;
  if (!el || el.hidden) return;
  el.hidden = true;
  el.innerHTML = "";
  MK_PEEK.html = "";
  MKT.closes = null;
}
/* after a draw: the card stays with its market while the market is drawn (its words read again: a fresh read may have changed them), else
   it goes */
function mkPeekKeep() {
  const a = MK_PEEK.at;
  if (!a) return;
  if (!a.isConnected || !mkPeekShown()) return void mkPeekHide();
  mkPeekShow(a);
}

// ---- one market, in the drawer ----------------------------------------------------------------------------

/* a holdings key, as the Portfolio names what is held */
const mkIsHeldKey = (key) => /^(crypto|equity|stable|cash|rwa|event):/.test(String(key || ""));
/** a market from what was read, by itself, by its key — a holdings key too (crypto:BTC is the coin's row, never its perpetual's, unless
 * only that is listed) — or by its venue and symbol */
function mkResolve(item) {
  if (item && typeof item === "object" && Array.isArray(item.at)) return item;
  const key = typeof item === "string" ? item : item && item.key;
  const venue = item && typeof item === "object" ? item.venue : "";
  const symbol = item && typeof item === "object" ? item.symbol : "";
  const rows = [];
  for (const g of MKT.got.values()) if (g.good) rows.push(...mkRows(g.good));
  if (key) {
    const exact = rows.find((x) => x.key === key);
    if (exact) return exact;
    if (mkIsHeldKey(key)) {
      const same = rows.filter((x) => mkAssetKey(x) === key);
      const hit = same.find((x) => x.kind !== "perp") || same[0];
      if (hit) return hit;
    }
  }
  if (symbol) {
    const hit = rows.find((x) => [...x.at, ...(x.outcomes || []).flatMap((o) => o.at)].some((a) => a.symbol === symbol && (!venue || a.venue === venue || mkVenueOfLeg(x, a.venue) === venue)));
    if (hit) return hit;
  }
  return null;
}
/** the market a key names — an explore key or a holdings key — from what was read, else read once by its name: the row, or null when no
 * venue lists it (a holding only the account knows: asset.js then opens it from the asset read) */
async function mkFindByKey(key) {
  const was = mkResolve({ key });
  if (was) return was;
  await mkReadByName(String(key || "").replace(/^[a-z]+:/, ""));
  return mkResolve({ key });
}
/* every market whose symbol or name starts like `q`, read once and kept with the pane's reads (so mkResolve finds it) */
async function mkReadByName(q) {
  const name = String(q || "").split(/[/@]/)[0].trim().slice(0, 60);
  if (!name) return;
  const path = mkPath({ tab: "", q: name, sort: "" }, 200);
  const body = await api(path);
  if (body && body.ok !== false && Array.isArray(body.items)) MKT.got.set(path, { at: Date.now(), body, good: body, goodAt: Date.now() });
}

/** OPEN ONE MARKET: its price, bid and ask, 24 hours, volume, countdown, price history, every venue's price for it, what is held (positions
 * to close, orders to cancel, what was paid), what the agents are doing in it, its lines on the statement — and Buy · Sell · Hand to agent ·
 * ★. `item` is a row from the explore read (or a holding's row, asset.js), or { key } / { venue, symbol } / a key, which is looked up (and
 * read once when it is not in what was drawn) */
function openMarket(item) {
  if (!A) return;
  const it = mkResolve(item);
  if (!it) return void mkLookup(item);
  MKT.open = { item: it, range: "1M", interval: "1h", asset: undefined, assetFor: "", compare: undefined, candles: undefined, ipoRead: undefined, ipo: [], fin: undefined, co: undefined };
  const body = openDrawer(`<div class="mk-d" data-mk-drawer>${mkDrawerHtml(MKT.open)}</div>`, { title: it.name, redraw: mkDrawerRedraw });
  if (!MKT.drawerWired) {
    $("drawer").addEventListener("close", () => {
      MKT.open = null;
      if (!mkPaneNeeds(ROUTE.tab)) mkStop();
    });
    MKT.drawerWired = true;
  }
  body.addEventListener("click", mkDrawerClick);
  mkStart();
  mkDrawerLoad(MKT.open);
  mkPoll();
}
/* a market asked for by key or by name that the pane has not drawn: every market is read once, then it opens — or, at a connected venue,
   enough of it to open anyway */
async function mkLookup(item) {
  const key = typeof item === "string" ? item : item && typeof item === "object" ? item.key : "";
  let it = null;
  if (key) it = await mkFindByKey(key);
  else if (item && typeof item === "object") {
    await mkReadByName(item.base || item.symbol);
    it = mkResolve(item);
  }
  if (it) return void openMarket(it);
  if (item && typeof item === "object" && item.venue && item.symbol) return void openMarket(mkPseudo({ venue: item.venue, symbol: item.symbol, at: A.now }, null));
  toast("That market isn't listed at your venues or in the public listings right now.", "info");
}
/** the market whose price history the drawer draws: at the first connected venue that lists it, else at a venue whose public prices do —
 * an event's first outcome. Null when no venue lists it */
function mkCandleLeg(item) {
  const legs = mkLegs(item, item.kind === "event" && item.outcomes && item.outcomes.length ? 0 : undefined).filter((x) => x.symbol);
  const l = legs.find((x) => mkVenue(x.venue)) || legs.find((x) => mkAtOf(item, x.venue).public) || legs[0];
  return l ? { venue: l.venue, symbol: l.symbol, venueName: (mkVenue(l.venue) || {}).name || mkAtOf(item, l.venue).venueName || l.venue } : null;
}
/* the bars a candles read gave (GET /api/account/candles: { venue, venueName, symbol, interval, candles: [bars], and what it says of them:
   the stretches with none, whose they are, what they are adjusted for, which hours they cover }) as one series; null when it gave none */
function mkSeriesOf(b) {
  if (!b || b.ok === false) return null;
  if (Array.isArray(b.candles)) return { venue: b.venue, venueName: b.venueName, symbol: b.symbol, interval: b.interval, bars: b.candles, ...(Array.isArray(b.gaps) ? { gaps: b.gaps } : {}), ...["source", "adjustment", "session"].reduce((o, k) => (typeof b[k] === "string" && b[k] ? { ...o, [k]: b[k] } : o), {}) };
  return b.candles && Array.isArray(b.candles.bars) ? b.candles : Array.isArray(b.bars) ? b : null;
}
/* the candles read is not on this account (an account from before it): the drawer draws from the Asset read as it did */
const mkNoCandles = (b) => !!b && b.ok === false && !b.refusal;

/* what the drawer reads for it: the market's price history (any market, connected or public), the asset (what is held, orders, cost, lines,
   and the history an account without the candles read gives, over the same range as the candles read: never another range's line under
   the pressed button) — again after each read of the account, so a cancel or a close shows — and, for a coin or a share, every connected
   venue's price (never for a pre-IPO contract: its venues' units differ, so each is shown in its own words); for a pre-IPO company, the
   prediction markets about its IPO. An answer is taken only while the drawer still shows the range and the bar size it was asked for:
   ranges share bar sizes (3M and 6M 4h, YTD and 1Y a day, 5Y and MAX a week), so a slow range's answer landing after the next one's is
   never drawn under the next one's button. The price history is waited for as the chart waits for its first view (core
   HISTORY_TIMEOUT_MS: longer than the account gives its sources) */
function mkDrawerLoad(o) {
  const leg = mkCandleLeg(o.item);
  const range = mkRangeOf(o);
  if (leg && o.candles === undefined) {
    const interval = o.interval;
    o.candles = null;
    api(`/api/account/candles?${new URLSearchParams({ venue: leg.venue, symbol: leg.symbol, interval, range })}`, { ttl: 30_000, timeout: HISTORY_TIMEOUT_MS }).then((b) => {
      if (MKT.open !== o || o.interval !== interval || mkRangeOf(o) !== range) return;
      o.candles = b;
      mkDrawerRedraw();
    });
  }
  const key = mkAssetKey(o.item);
  const stamp = `${o.interval}|${range}|${A.now}`;
  if (key && o.assetFor !== stamp) {
    const interval = o.interval;
    o.assetFor = stamp;
    api(`/api/account/asset?${new URLSearchParams({ key, interval, range })}`, { ttl: 10_000 }).then((b) => {
      if (MKT.open !== o || o.interval !== interval || mkRangeOf(o) !== range) return;
      o.asset = b;
      mkDrawerRedraw();
    });
  }
  const pre = mkIsPreipo(o.item);
  const base = ["coin", "perp", "stock"].includes(o.item.kind) && !pre && !o.item.held ? o.item.base : "";
  if (base && o.compare === undefined) {
    o.compare = null;
    api(`/api/account/compare?base=${encodeURIComponent(base)}&side=buy`, { ttl: 15_000 }).then((b) => {
      if (MKT.open !== o) return;
      o.compare = b;
      mkDrawerRedraw();
    });
  }
  // a US share's own filed figures (SEC EDGAR: GET /api/account/financials, live/edgar.ts), read once a drawer and kept ten minutes — the
  // filings change twice a quarter — never for a pre-IPO contract or anything that is not a share
  const ticker = !pre ? mkTicker(o.item) : "";
  if (ticker && o.fin === undefined) {
    o.fin = null;
    api(`/api/account/financials?symbol=${encodeURIComponent(ticker)}`, { ttl: 600_000, timeout: 20_000 }).then((b) => {
      if (MKT.open !== o) return;
      o.fin = b;
      mkDrawerRedraw();
    });
  }
  // the company's own record and its newest filings (SEC EDGAR submissions: GET /api/account/company), read once a drawer, kept ten minutes
  if (ticker && o.co === undefined) {
    o.co = null;
    api(`/api/account/company?symbol=${encodeURIComponent(ticker)}`, { ttl: 600_000, timeout: 20_000 }).then((b) => {
      if (MKT.open !== o) return;
      o.co = b;
      mkDrawerRedraw();
    });
  }
  const company = pre ? mkCompanyOf(o.item) : "";
  if (company && o.ipoRead === undefined) {
    o.ipoRead = null;
    const path = mkPath({ tab: "predictions", q: company, sort: "" }, 12);
    api(path, { ttl: 30_000 }).then((b) => {
      if (MKT.open !== o) return;
      const ok = !!b && b.ok !== false && Array.isArray(b.items);
      if (ok) MKT.got.set(path, { at: Date.now(), body: b, good: b, goodAt: Date.now() });
      o.ipoRead = ok ? b : { items: [] };
      mkDrawerRedraw();
    });
  }
}
/* after each read of the account (and each answer above): the drawer drawn again in place, part by part — once a frame however many answers
   land in it, and only once it has slid in (core drawerLater) — the row itself refreshed from the latest read, and what it reads asked again
   where a read is stale */
function mkDrawerRedraw() {
  if (MKT.drawSoon) return;
  MKT.drawSoon = true;
  drawerLater(mkDrawerSoon);
}
function mkDrawerSoon() {
  nextFrame(() => {
    MKT.drawSoon = false;
    mkDrawerDraw();
  });
}
function mkDrawerDraw() {
  const o = MKT.open;
  const el = mkDrawerBody();
  if (!o || !el) return void (MKT.open = el ? MKT.open : null);
  const again = mkResolve({ key: o.item.key });
  if (again && again !== o.item && !String(o.item.key).startsWith("watch:") && !o.item.held) o.item = again;
  const parts = mkDrawerParts(o);
  const secs = el.querySelectorAll ? [...el.querySelectorAll("[data-sec]")] : [];
  if (secs.length !== Object.keys(parts).length) paint(el, mkDrawerHtml(o));
  else for (const s of secs) if (parts[s.dataset.sec] !== undefined) paint(s, parts[s.dataset.sec]);
  mkDrawerLoad(o);
}
function mkDrawerClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-act]");
  const o = MKT.open;
  if (!b || b.disabled || !o) return;
  const v = b.dataset.venue;
  // a card of the IPO markets section stands for its own event, by its place in the drawer's own list
  const item = b.dataset.i !== undefined && o.ipo && o.ipo[Number(b.dataset.i)] ? o.ipo[Number(b.dataset.i)] : o.item;
  const a = o.asset && o.asset.ok !== false ? o.asset : null;
  switch (b.dataset.act) {
    case "trade-at": return void mkTicket({ venue: v, symbol: b.dataset.symbol, side: "buy", ...(b.dataset.outcome ? { outcome: b.dataset.outcome } : {}) }, o.item);
    case "sell": return void mkTicket({ venue: v, symbol: b.dataset.symbol, side: "sell" }, o.item);
    case "short": return void mkTrade(o.item, "sell");
    case "connect": return void connectVia(b.dataset.connector, { name: b.dataset.name });
    // another range: in its own bar size (the asset read too)
    case "range":
      if (!MKT_RANGE_BAR[b.dataset.v] || b.dataset.v === mkRangeOf(o)) return;
      o.range = b.dataset.v;
      o.interval = MKT_RANGE_BAR[o.range];
      o.candles = undefined;
      mkDrawerRedraw();
      return void mkDrawerLoad(o);
    case "close": {
      // the Trade pane's close: what it is worth as the account prepared it, refused before the sign button when over this server's cap
      const p = a && (a.positions || []).find((x) => x.symbol === b.dataset.symbol && x.venue === v);
      if (p && typeof openClose === "function") openClose(p);
      return;
    }
    // a signed cancel (an agent's after a yes); the asset is read again at once, not from what was kept, so the order leaves the list
    case "cancel": return void cancelOrder((a ? a.orders || [] : []).find((x) => x.id === b.dataset.order && x.venue === v), () => { forget("/api/account/asset"); o.assetFor = ""; mkDrawerLoad(o); });
    case "review":
      closeDrawer();
      return void go("portfolio", { card: b.dataset.card });
    case "statement":
      closeDrawer();
      return void (typeof openStatement === "function" && openStatement());
    default: return void mkAct(b, item);
  }
}

/* the price history as a line: the closes, low and high, first and last time; an event's in cents. Each bar sits at its own time between
   the first and the last, and the line BREAKS where the venue has no bars — more than a bar and a half's time between two intraday bars
   (a market closed overnight, a minute nobody traded), more than that between a round-the-clock market's daily bars, or a stretch its own
   words say it has none of (`gaps`) — so a gap is a gap, never bridged by a line (a share's closed days are not gaps: its daily line runs
   on over a weekend). `sessions`: a market that keeps them (a share). Where it comes from is the picture's title, and under the line its
   source, what its prices are adjusted for and which hours it covers, where the account says */
function mkChart(series, ev, sessions = false) {
  const bars = ((series && series.bars) || []).filter((b) => Number.isFinite(b.c));
  if (bars.length < 2) return "";
  const W = 400;
  const H = 140;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    if (b.c < lo) lo = b.c;
    if (b.c > hi) hi = b.c;
  }
  const span = hi - lo || 1;
  const timed = bars.every((b) => Number.isFinite(b.t)) && bars[bars.length - 1].t > bars[0].t;
  const t0 = bars[0].t;
  const tspan = timed ? bars[bars.length - 1].t - t0 : 1;
  const x = (i) => ((timed ? (bars[i].t - t0) / tspan : i / (bars.length - 1)) * W).toFixed(1);
  const y = (c) => (H - 6 - ((c - lo) / span) * (H - 12)).toFixed(1);
  const ms = MKT_IV_MS[series.interval] || 0;
  const gaps = Array.isArray(series.gaps) ? series.gaps.filter((g) => g && Number.isFinite(Number(g.from)) && Number.isFinite(Number(g.to))) : [];
  const broken = (a, b) => timed && ((ms > 0 && (ms < 86_400_000 || !sessions) && b - a > 1.5 * ms) || gaps.some((g) => Number(g.from) < b && Number(g.to) > a + ms));
  // one run of the line a stretch with no break, its area closed under it on its own
  const runs = [];
  let run = [];
  bars.forEach((b, i) => {
    if (i && broken(bars[i - 1].t, b.t)) {
      runs.push(run);
      run = [];
    }
    run.push(i);
  });
  runs.push(run);
  const line = runs.map((r) => r.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(bars[i].c)}`).join("")).join("");
  const area = runs.map((r) => `${r.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(bars[i].c)}`).join("")}L${x(r[r.length - 1])},${H}L${x(r[0])},${H}Z`).join("");
  const f = (n) => (ev ? mkCents(n) : mkUsd(n));
  // a day's bars and longer: the day each bar stands for, with its year and no time of day — a share's New York day (its bars start at its
  // open, or New York's midnight), a market's that trades round the clock its Universal day (its daily and weekly bars start at 00:00 UTC,
  // the evening before in New York); a line of shorter bars over more than a few months: the New York date of its first and last
  const long = ms >= 86_400_000 || (timed && tspan > 120 * 86_400_000);
  const dayOpts = { day: "numeric", month: "short", year: "numeric", ...(ms >= 86_400_000 && !sessions ? { timeZone: "UTC" } : {}) };
  const when = (t) => (long ? ny(t, dayOpts) : `${nyDay(t)} ${nyTime(t)}`);
  const first = bars[0];
  const last = bars[bars.length - 1];
  const said = [series.source, series.adjustment, series.session].filter((w) => typeof w === "string" && w).join(" · ");
  return `<svg class="spark mk-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(`Price at ${series.venueName}, ${series.interval} bars: from ${f(first.c)} to ${f(last.c)}, low ${f(lo)}, high ${f(hi)}`)}"><title>At ${esc(series.venueName)} · ${esc(series.symbol)}</title><path class="area" d="${area}"/><path class="line" d="${line}"/></svg><div class="mk-axis"><span>${esc(when(first.t))}</span><span>Low ${esc(f(lo))} · High ${esc(f(hi))}</span><span>${esc(when(last.t))}</span></div>${said ? `<p class="mk-src">${esc(said)}</p>` : ""}`;
}

/* a position can be closed from here: trading is on, the venue trades and lists positions */
const mkClosable = (venue) => { const v = mkVenue(venue); return !!v && canTrade(v) && !!v.trade.positions; };
/* what is held of it, from the Asset read: the row across venues, the positions (Close…), the open orders (Cancel), what was paid — once */
function mkHeldHtml(o) {
  const skel = '<div class="skel-rows" aria-hidden="true"><span class="skel"></span></div>';
  const key = mkAssetKey(o.item);
  if (!key) return '<p class="empty">Nothing held: no venue on the account lists it.</p>';
  if (o.asset === undefined || o.asset === null) return skel;
  const a = o.asset.ok !== false ? o.asset : null;
  if (!a) return `<p class="empty">${esc(refusalOf(o.asset) || "Couldn't read what is held.")}</p>`;
  const ev = o.item.kind === "event";
  const owner = owns();
  const lines = [];
  if (a.row) for (const h of a.row.venues || []) {
    const chips = [h.inTransit ? '<span class="chip warm">On its way</span>' : "", h.watched ? '<span class="chip">Watched</span>' : "", h.stale ? '<span class="chip bad">Last good read</span>' : ""].filter(Boolean).join(" ");
    lines.push(`<div><span class="mk" aria-hidden="true">·</span><div><div class="t1">${esc(qtyOf(h.amount))} ${esc(ev ? "contracts" : a.row.asset)} · ${h.noPrice ? '<span class="dim">no price</span>' : esc(money(h.usd))}${chips ? ` ${chips}` : ""}</div><div class="t2">${esc(h.venueName)}${h.note ? ` · ${esc(h.note)}` : ""}</div></div></div>`);
  }
  for (const p of a.positions || []) {
    const close = owner && mkClosable(p.venue) ? `<button type="button" class="btn btn-sm" data-act="close" data-venue="${esc(p.venue)}" data-symbol="${esc(p.symbol)}" data-fk="close:${esc(p.venue)}:${esc(p.symbol)}">${p.kind === "event" || p.kind === "stock" ? "Sell…" : "Close…"}</button>` : "";
    lines.push(`<div><span class="mk" aria-hidden="true">·</span><div><div class="t1">${esc(p.side === "short" ? "Short" : "Long")} ${esc(qtyOf(p.qty))} · ${esc(p.name || p.symbol)} ${p.unrealizedUsd !== undefined ? chg(p.unrealizedUsd, "$") : ""}</div><div class="t2">${esc(p.venueName || nameOf(p.venue))}${p.entryPrice !== undefined ? ` · in at ${esc(ev ? mkCents(p.entryPrice) : px(p.entryPrice))}` : ""}${p.markPrice !== undefined ? ` · now ${esc(ev ? mkCents(p.markPrice) : px(p.markPrice))}` : ""}${p.leverage ? ` · ${esc(String(p.leverage))}x` : ""}${p.liquidationPrice ? ` · liquidation ${esc(px(p.liquidationPrice))}` : ""}</div></div>${close}</div>`);
  }
  for (const x of a.orders || []) {
    // an order the account stopped following (its cancel asked while its venue refused this network): said so, its note on hover; Cancel
    // sends the owner's cancel again
    const unfollowed = x.unfollowed && !x.canceling ? `<span class="st dim"${x.note ? ` title="${esc(x.note)}"` : ""}>Not followed</span>` : "";
    const cancel = x.canceling ? '<span class="st pending">Canceling</span>' : owner ? `${unfollowed}<button type="button" class="btn btn-sm btn-ghost" data-act="cancel" data-order="${esc(x.id)}" data-venue="${esc(x.venue)}" data-fk="cancel:${esc(x.id)}">Cancel</button>` : unfollowed;
    lines.push(`<div><span class="mk" aria-hidden="true">${x.side === "buy" ? "+" : "−"}</span><div><div class="t1">${esc(x.side === "buy" ? "Buy" : "Sell")} ${esc(qtyOf(x.qty))} ${esc(x.base || "")} · ${esc(typeText(x))}</div><div class="t2">${esc(x.venueName || nameOf(x.venue))} · ${esc(x.agent ? keyName(x.agent) : "you")} · ${esc(qtyOf(x.filledQty || 0))} of ${esc(qtyOf(x.qty))} filled</div></div>${cancel}</div>`);
  }
  // what was paid, said once: the row's own cost entry (a position's is in its line already)
  const cost = (a.cost || []).find((c) => c.key === key) || (a.cost || []).find((c) => c.class !== "position") || null;
  const paid = !cost ? "" : cost.coveredQty > 0 || cost.realizedUsd
    ? `<p class="mk-cost">${cost.avgCostUsd !== undefined ? `Paid ${esc(ev ? mkCents(cost.avgCostUsd) : mkUsd(cost.avgCostUsd))} on average` : "Paid"}${cost.unrealizedUsd !== undefined ? ` · ${chg(cost.unrealizedUsd, "$")} since bought` : ""}${cost.realizedUsd ? ` · ${chg(cost.realizedUsd, "$")} realised` : ""} <span class="dim">(${esc(cost.words)}, from ${esc(cost.source)})</span></p>`
    : `<p class="mk-quiet">${esc(cost.words)}: the account never saw it bought (it came in from elsewhere, or before the account).</p>`;
  const failed = (a.missing || []).filter((m) => !awayMiss(m));
  const missing = `${awayLine((a.missing || []).filter(awayMiss), { cls: "mk-quiet" })}${failed.length ? `<p class="mk-quiet">Not read this time: ${failed.map((m) => `${esc(m.venueName)} (${esc(mkSaid(m.why))})`).join(" · ")}.</p>` : ""}`;
  return `${lines.length ? `<div class="feed mk-held">${lines.join("")}</div>${paid}` : "<p class=\"empty\">You don’t hold any.</p>"}${missing}`;
}
/* where a sell can go: a venue that holds it and takes the order — of the row's own kind. A coin, a share or a token is sold from what is
   held (a perpetual position in the same coin is not it: selling there would open a short); a perpetual only closes from its position; an
   event contract from its position, or the contracts held */
function mkSellAt(o) {
  const a = o.asset && o.asset.ok !== false ? o.asset : null;
  if (!a) return null;
  const kind = o.item.kind;
  const perpish = (k) => k === "perp" || k === "future";
  const positions = (a.positions || []).filter((p) => (kind === "perp" ? perpish(p.kind) : kind === "event" ? p.kind === "event" : !perpish(p.kind) && p.kind !== "event")).map((p) => ({ venue: p.venue, symbol: p.symbol }));
  const held = kind === "perp" ? [] : ((a.row && a.row.venues) || []).filter((h) => !h.inTransit && !h.watched).map((h) => ({ venue: h.venue, symbol: (o.item.at.find((x) => x.venue === h.venue) || {}).symbol }));
  const legs = kind === "event" || kind === "perp" ? [...positions, ...held] : [...held, ...positions];
  for (const l of legs) {
    const v = mkVenue(l.venue);
    if (v && l.symbol && canTrade(v)) return { venue: v.id, symbol: l.symbol, venueName: v.name };
  }
  return null;
}
/* a pre-IPO listing's own valuation and unit sentence, under its venue's name */
function mkImpliedLine(r) {
  const imp = mkImplied(r);
  return imp ? `<span class="why mk-unit">${esc(mkValuation(imp.usd))} implied${imp.unit ? ` · ${esc(imp.unit)}` : ""}</span>` : "";
}
/* every venue's price for it: the connected ones (for a coin or a share, as the comparison priced them for a buy; a holding's, as the asset
   read compared them) and the public listings. A pre-IPO contract: each venue's own contract price and the unit it stands for */
function mkAcrossHtml(o) {
  const it = o.item;
  const ev = it.kind === "event";
  const pre = mkIsPreipo(it);
  const cmp = o.compare && o.compare.ok !== false && Array.isArray(o.compare.rows) ? o.compare : o.asset && o.asset.ok !== false && o.asset.compare && Array.isArray(o.asset.compare.rows) ? o.asset.compare : null;
  const c = pre ? null : cmp;
  const rows = [];
  for (const r of c ? c.rows : []) rows.push({ venue: r.venue, venueName: r.venueName, symbol: r.symbol, price: r.price, spread: r.spreadPct, note: r.note, best: r.best, ready: r.ready, connected: true });
  for (const a of it.at) if (a.symbol && !rows.some((r) => r.venue === a.venue) && mkServes(a)) rows.push({ venue: a.venue, venueName: a.venueName, symbol: a.symbol, price: a.price, quoteFrom: a.quoteFrom, quoteAt: a.quoteAt, note: a.note, connected: a.connected, public: a.public, connector: a.connector, connectTo: a.connectTo, implied: a.implied });
  // an order goes here (its note is the venue's: fees, slippage); or only public prices list it (connect it); or the venue says why not
  const takes = (r) => { const v = mkVenue(r.venue); return !!v && canTrade(v) && mkAtOf(it, r.venue).canTrade !== false && !mkCloseOnly(it, r.venue); };
  // a public line is a price; it offers its connection only where none of the owner's venues trades the thing (and its venue is not on)
  const cell = (r) => {
    const v = mkVenue(r.venue);
    if (takes(r)) return `<button type="button" class="btn btn-sm" data-act="trade-at" data-venue="${esc(r.venue)}" data-symbol="${esc(r.symbol)}"${ev && it.outcomes ? ` data-outcome="${esc(it.outcomes[0].label)}"` : ""} data-fk="trade-at:${esc(r.venue)}"${mkDis()}>Trade</button>`;
    // a connected venue that lets this network only close: that state in a word, its own words on hover (what is held there is sold above)
    if (v && mkCloseOnly(it, r.venue)) return `<span class="why" title="${esc((v.closeOnly && v.closeOnly.said) || "")}"><b>Close only here</b></span>`;
    const no = !v && r.connector ? venueRefuses(r.connector) : null;
    // close-only, or something to set up here first: its word, the venue's sentence on hover
    if (no) return `<span class="why" title="${esc(no.said || "")}"><b>${esc(no.word)}</b></span>`;
    const terms = !v && r.connector ? venueTermsSay(r.connector) : null;
    if (terms && connectionOf(r.connector) && !mkTradedHere(it) && !(r.connectTo && mkVenue(r.connectTo))) return `<span class="why"><b>${esc(terms.word)}</b>${terms.said ? ` — ${esc(mkSaid(terms.said))}` : ""}</span> <button type="button" class="btn btn-sm" data-act="connect" data-connector="${esc(r.connector)}" data-name="${esc(r.venueName)}" data-fk="connect-at:${esc(r.venue)}"${mkDis()}>Connect to trade</button>`;
    if (!v && r.connector && connectionOf(r.connector) && !mkTradedHere(it) && !(r.connectTo && mkVenue(r.connectTo))) return `<button type="button" class="btn btn-sm" data-act="connect" data-connector="${esc(r.connector)}" data-name="${esc(r.venueName)}" data-fk="connect:${esc(r.venue)}"${mkDis()}>${icon("plug", "sm")}Connect to trade</button>`;
    return v ? `<span class="why">${esc(mkWhyNot(v, mkAtOf(it, r.venue)))}</span>` : r.note ? `<span class="why">${esc(r.note)}</span>` : "";
  };
  const t = table([
    // a line that reads more than one source (US stocks) says which priced it, how far behind the market that is, and when the price is
    // from once it is not the last minute or two's
    { label: "Venue", cell: (r) => `${esc(r.venueName)}${r.best ? ' <span class="tag up">Best</span>' : ""}${r.public ? ' <span class="tag">Public</span>' : ""}${mkQuoteWords(r.quoteFrom, r.quoteAt) ? `<span class="why">Price from ${esc(mkQuoteWords(r.quoteFrom, r.quoteAt))}</span>` : ""}${r.note && takes(r) ? `<span class="why">${esc(r.note)}</span>` : ""}${pre ? mkImpliedLine(r) : ""}` },
    { label: c ? "Buy at" : pre ? "Contract" : "Price", r: true, cell: (r) => (ev ? mkCents(r.price) : mkUsd(r.price)) },
    ...(c ? [{ label: "Spread", r: true, cell: (r) => (r.spread !== undefined ? `${Number(r.spread.toFixed(2))}%` : "—") }] : []),
    { label: "", sr: "Actions", r: true, cell },
  ], rows, { empty: "No venue lists it right now.", cls: "mk-t" });
  const miss = c ? (c.missing || []).filter((m) => !/no .*market|lists no/i.test(m.why)) : [];
  // a venue that does not serve this network now is a state, named once in a quiet line (its words on hover), never "Not compared: <its sentence>"
  const failed = miss.filter((m) => !awayMiss(m));
  return `${t}${awayLine(miss.filter(awayMiss), { cls: "mk-quiet" })}${failed.length ? `<p class="mk-missing">Not compared: ${failed.map((m) => `<b>${esc(m.venueName)}</b>: ${esc(mkSaid(m.why))}`).join(" · ")}.</p>` : ""}${!pre && o.compare && !c && o.compare !== null ? `<p class="mk-missing">${esc(refusalOf(o.compare))}</p>` : ""}`;
}
/* the company a pre-IPO contract is on: the venue's group, else the row's base */
const mkCompanyOf = (item) => String((item.group && item.group.title) || item.base || "").trim();
/* the prediction markets about a pre-IPO company's IPO: the event rows read that name the company, from the drawer's own read first */
function mkIpoEvents(o) {
  const name = mkCompanyOf(o.item).toLowerCase();
  if (!name) return [];
  const seen = new Set();
  const out = [];
  const bodies = [o.ipoRead, ...[...MKT.got.values()].map((g) => g.good)].filter(Boolean);
  for (const b of bodies) for (const x of mkRows(b)) if (x.kind === "event" && !seen.has(x.key) && String(x.name || "").toLowerCase().includes(name)) { seen.add(x.key); out.push(x); }
  return out.slice(0, 6);
}
/* the Pre-IPO company's IPO markets, as lean cards (Yes/No go to the ticket as predictions) */
function mkIpoHtml(o) {
  const events = mkIpoEvents(o);
  const inner = events.length ? mkCards(events, { lean: true, reg: (x) => o.ipo.push(x) - 1 }) : o.ipoRead === null || o.ipoRead === undefined ? '<div class="skel-rows" aria-hidden="true"><span class="skel"></span></div>' : `<p class="empty">No prediction market about ${esc(mkCompanyOf(o.item))}'s IPO is listed at your venues or in the public listings right now.</p>`;
  return `<section class="sec" aria-label="IPO markets"><h2 class="h2">IPO markets</h2>${inner}</section>`;
}
/* what the agents are doing in it, and the owner's intents about it; a card waiting on the owner is reviewed under Portfolio */
function mkAgentsHtml(it) {
  const on = mkAgentsOn(it);
  const lines = [
    ...on.cards.map((c) => `<div><span class="mk warn-t" aria-hidden="true">!</span><div><div class="t1">${esc(c.agentName || keyName(c.agent))} asks: ${esc(c.reason)}</div><div class="t2">Waiting for you · <button type="button" class="link" data-act="review" data-card="${esc(c.id)}" data-fk="review:${esc(c.id)}">Review</button></div></div></div>`),
    ...on.orders.map((x) => `<div><span class="mk" aria-hidden="true">${x.side === "buy" ? "+" : "−"}</span><div><div class="t1">${esc(keyName(x.agent))}: ${esc(x.side === "buy" ? "buy" : "sell")} ${esc(qtyOf(x.qty))} ${esc(x.base)} · ${esc(x.type)}${x.limitPrice ? ` ${esc(px(x.limitPrice))}` : ""}</div><div class="t2">${esc(x.id)} · ${esc(x.venueName)} · ${x.unfollowed ? `<span${x.note ? ` title="${esc(x.note)}"` : ""}>Not followed</span>` : esc(x.status)}${x.filledQty ? ` · ${esc(qtyOf(x.filledQty))} filled` : ""}</div></div></div>`),
    ...on.intents.map((x) => `<div><span class="mk" aria-hidden="true">→</span><div><div class="t1">You to ${esc(x.agent === "*" ? "every agent" : x.agentName)}: “${esc(x.text)}”</div><div class="t2">${x.report ? `${esc(x.report.byName)}: ${esc(x.report.status)}${x.report.note ? ` · ${esc(x.report.note)}` : ""}` : "No report yet"} · until ${esc(nyDay(x.validUntil))}</div></div></div>`),
  ];
  return lines.length ? `<div class="feed">${lines.join("")}</div>` : `<p class="empty">No agent is working on it.</p>`;
}
/* its lines on the statement, from the Asset read (the newest eight); the whole ledger is one click away */
function mkLinesHtml(o) {
  const a = o.asset && o.asset.ok !== false ? o.asset : null;
  const L = (a && a.lines) || [];
  if (!mkAssetKey(o.item)) return '<p class="empty">Nothing on the statement: no venue on the account lists it.</p>';
  if (!a) return o.asset === undefined || o.asset === null ? '<div class="skel-rows" aria-hidden="true"><span class="skel"></span></div>' : `<p class="empty">${esc(refusalOf(o.asset) || "Couldn't read the statement.")}</p>`;
  if (!L.length) return '<p class="empty">Nothing on the statement about it yet.</p>';
  const mark = (l) => (l.status === "filled" || l.status === "settled" ? ["ok", "✓"] : ["rejected", "failed"].includes(l.status) ? ["no", "✗"] : ["", "·"]);
  return `<div class="feed">${L.slice(0, 8).map((l) => { const [cls, g] = mark(l); return `<div><span class="mk${cls ? ` ${cls}` : ""}" aria-hidden="true">${g}</span><div><div class="t1">${esc(l.description)}</div><div class="t2">${esc([l.accountName, l.agentName || "you", l.status, `${nyDay(l.at)} ${nyTime(l.at)}`].filter(Boolean).join(" · "))}</div></div></div>`; }).join("")}</div>${L.length > 8 ? `<p class="dim small">${esc(plural(L.length, "line"))} in all.</p>` : ""}`;
}

/** the price history the drawer draws: the market's own bars from the candles read; where the venue refuses them, a quiet line in its words
 * (and the Asset read's bars, when it has some from another venue); on an account without the candles read, the Asset read's, as before */
function mkChartHtml(o, it, leg, key) {
  const ev = it.kind === "event";
  const skel = '<div class="skel-rows" aria-hidden="true"><span class="skel" style="height:120px"></span></div>';
  const a = o.asset && o.asset.ok !== false ? o.asset : null;
  const sessions = it.kind === "stock";
  const fromAsset = a && a.candles ? mkChart(a.candles, ev, sessions) : "";
  if (leg && !mkNoCandles(o.candles)) {
    if (!o.candles) return skel;
    const series = mkSeriesOf(o.candles);
    const drawn = series ? mkChart(series, ev, sessions) : "";
    if (drawn) return drawn;
    const words = mkSaid(refusalOf(o.candles)) || "it did not answer";
    const said = series ? `${leg.venueName} has no ${o.interval} bars for it yet` : words.startsWith(leg.venueName) ? words : `No price history from ${leg.venueName}: ${words}`;
    return `${fromAsset}<p class="mk-quiet">${esc(said)}.</p>`;
  }
  if (!key) return `<p class="empty">Price history comes from a connected venue that trades it${mkPublicOnly(it) ? ": connect one to see it" : ""}.</p>`;
  if (o.asset === undefined || o.asset === null) return skel;
  if (!a) return `<p class="empty">${esc(refusalOf(o.asset) || "Couldn't read its price history.")}</p>`;
  return fromAsset || `<p class="empty">${esc(((a.missing || []).find((m) => m.part === "candles") || {}).why || (mkPublicOnly(it) ? "Price history comes from a connected venue that trades it: connect one to see it." : ev ? "The venue keeps price history for a contract you hold." : "No venue on the account keeps price history for it."))}</p>`;
}

// ---- a share's company record and its latest filings (SEC EDGAR submissions, live/edgar.ts) ---------------------------------------------

/** the Company part: what the SEC's record says of the company — where it is listed, its industry (SIC), when its fiscal year ends, where it
 * is incorporated, its filer category, its sites — its latest annual and quarterly reports, and its newest filings, each a link to the
 * document on the SEC's site, an 8-K said by its items in plain words. Read once a drawer and kept ten minutes (GET /api/account/company).
 * None of it is news: it is what the company itself filed, and the foot says the account reads no news site */
function mkCompanyHtml(o) {
  if (o.co === undefined || o.co === null) return '<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel" style="width:70%"></span></div>';
  const c = o.co.ok !== false ? o.co : null;
  if (!c) return `<p class="mk-quiet">${esc(mkSaid(refusalOf(o.co)) || "The SEC did not answer")}.</p>`;
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).join(", ") : "");
  const facts = [
    ["Listed", esc([list(c.exchanges), list(c.tickers)].filter(Boolean).join(" · "))],
    ["Industry", c.sicDescription ? `${esc(c.sicDescription)}${c.sic ? ` <span class="dim">SIC ${esc(c.sic)}</span>` : ""}` : ""],
    ["Fiscal year ends", c.fiscalYearEnd && c.fiscalYearEnd.words ? esc(c.fiscalYearEnd.words) : ""],
    ["Incorporated in", esc(c.stateOfIncorporationWords || c.stateOfIncorporation || "")],
    ["Filer", esc(c.category || "")],
  ].filter(([, v]) => v);
  const site = (url, words) => `<a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(words)}</a>`;
  const sites = [c.website ? site(c.website, String(c.website).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) : "", c.investorWebsite ? site(c.investorWebsite, "investors") : ""].filter(Boolean).join(" · ");
  const dl = facts.length || sites ? `<dl class="mk-facts mk-co">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}${sites ? `<div><dt>Site</dt><dd>${sites}</dd></div>` : ""}</dl>` : "";
  const report = (f, what) => (f ? `<a class="link" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(what)} ${esc(f.form)}</a> filed ${esc(mkDate(f.filed))}` : "");
  const latest = [report(c.latest && c.latest.annual, "Annual report"), report(c.latest && c.latest.quarterly, "Quarterly report")].filter(Boolean);
  // a filing's description where it says more than the form's name does (a 4 described as "FORM 4" is said by its form alone)
  const said = (f) => { const d = typeof f.description === "string" ? f.description.trim() : ""; return d && d.toUpperCase().replace(/^FORM\s+/, "") !== String(f.form).toUpperCase() ? d : ""; };
  const filings = Array.isArray(c.filings) && c.filings.length ? `<h3 class="label mk-fin-h">Latest filings</h3><ul class="mk-filings">${c.filings.slice(0, 8).map((f) => `<li><a class="link" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(f.form)}</b>${said(f) ? ` ${esc(said(f))}` : ""}</a><span class="dim"> · filed ${esc(mkDate(f.filed))}</span></li>`).join("")}</ul>` : "";
  return `${dl}${latest.length ? `<p class="mk-co-latest">${latest.join(" · ")}</p>` : ""}${filings}<p class="mk-src">${esc(c.source || "SEC EDGAR")} · what the company itself filed; the account reads no news site</p>`;
}

// ---- a share's financials (SEC EDGAR, live/edgar.ts) -----------------------------------------------------------------------------

/* a US share's ticker as the SEC's reader takes one: a stock row's base — letters, a class letter after a dot or a dash (BRK.B); "" for
   anything else (a pre-IPO contract's company, a coin, a token) */
const mkTicker = (item) => (item && item.kind === "stock" && /^[A-Z]{1,6}([.-][A-Z]{1,2})?$/.test(String(item.base || "").toUpperCase()) ? String(item.base).toUpperCase() : "");
/* a filing's date (YYYY-MM-DD) as a person reads it, the day the SEC wrote, never moved to another zone: "27 Sep 2025" */
function mkDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "—");
  return `${Number(m[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1] || m[2]} ${m[1]}`;
}
/* a filed figure in money, short, with its sign: $416B · −$2.5B · $94.0B; a dash where the filing tagged none */
const mkFinMoney = (n) => (n === undefined || n === null || !Number.isFinite(Number(n)) ? '<span class="flat">—</span>' : `${Number(n) < 0 ? "−" : ""}${mkVol(Math.abs(Number(n)))}`);
/** THE FINANCIALS PART, a US share's drawer: the fiscal years as filed, then the quarters as filed (a 10-Q's own quarter; a fourth quarter
 * is in the 10-K and is not a row) — each with its revenue, net income and earnings a share, the period's end and its filing — the shares
 * outstanding as the latest cover says, whose figures they are and which tagged concept each column is. A skeleton while the SEC answers;
 * where it does not, its refusal in its own words (no contact set: what to set). Nothing here is estimated */
function mkFinHtml(o) {
  if (o.fin === undefined || o.fin === null) return '<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel" style="width:60%"></span></div>';
  const f = o.fin.ok !== false ? o.fin : null;
  if (!f) return `<p class="mk-quiet">${esc(mkSaid(refusalOf(o.fin)) || "The SEC did not answer")}.</p>`;
  const annual = Array.isArray(f.annual) ? f.annual : [];
  const quarterly = Array.isArray(f.quarterly) ? f.quarterly : [];
  const rowsOf = (list, year) => list.map((p) => ({ p, label: year ? `FY${p.fy || String(p.end || "").slice(0, 4)}` : `${p.fp || "Q"} FY${p.fy || String(p.end || "").slice(0, 4)}` }));
  const cols = [
    { label: "Period", cell: (r) => `<b>${esc(r.label)}</b><span class="why">ended ${esc(mkDate(r.p.end))} · ${esc(r.p.form || "")} filed ${esc(mkDate(r.p.filed))}</span>` },
    { label: "Revenue", r: true, cell: (r) => mkFinMoney(r.p.revenue) },
    { label: "Net income", r: true, cell: (r) => mkFinMoney(r.p.netIncome) },
    { label: "EPS", r: true, cell: (r) => (r.p.eps === undefined || r.p.eps === null ? '<span class="flat">—</span>' : esc(px(r.p.eps))) },
  ];
  const tableOf = (title, list, year) => (list.length ? `<h3 class="label mk-fin-h">${esc(title)}</h3>${table(cols, rowsOf(list, year), { cls: "mk-fin-t" })}` : "");
  const shares = f.shares && Number.isFinite(Number(f.shares.value)) ? `<p class="mk-fin-sh"><b>${esc(mkCount(f.shares.value))}</b> shares outstanding as of ${esc(mkDate(f.shares.asOf))} <span class="dim">(${esc(f.shares.form || "")} filed ${esc(mkDate(f.shares.filed))})</span></p>` : "";
  const c = f.concepts || {};
  const named = [c.revenue ? `revenue is ${c.revenue}` : "", c.netIncome ? `net income ${c.netIncome}` : "", c.eps ? `earnings a share ${c.eps}` : ""].filter(Boolean).join(", ");
  const foot = `<p class="mk-src">${esc(f.source || "SEC EDGAR")}${f.currency ? ` · in ${esc(f.currency)}` : ""}${named ? ` · ${esc(named)}` : ""}${f.latest ? ` · latest filing ${esc(f.latest.form)} filed ${esc(mkDate(f.latest.filed))}` : ""} · as filed, nothing estimated; a fourth quarter is in the year's 10-K</p>`;
  return `${tableOf("Fiscal years", annual, true)}${tableOf("Quarters", quarterly, false)}${shares}${foot}`;
}

/** the drawer, part by part (each painted on its own, so a fresh read repaints only what changed): the head — name · countdown · price with
 * its 24 hours said once · facts · issuer · outcomes · Buy · Sell · Hand to agent · ★ · why not — then the chart, Across venues, (a pre-IPO
 * company's) IPO markets, You hold, Agents on it, On the statement */
function mkDrawerParts(o) {
  const it = o.item;
  o.ipo = [];
  const ev = it.kind === "event";
  const pre = mkIsPreipo(it);
  // a perpetual is Long / Short, the ticket's words (a pre-IPO one too); the company's words over a pre-IPO one are not an issuer's
  const perpNow = it.kind === "perp";
  const preipoNow = pre;
  const lead = mkLeadLeg(it);
  const fresh = lead && mkFresh(`${lead.venue}|${lead.symbol}`);
  const q = lead ? ` data-q="${esc(`${lead.venue}|${lead.symbol}`)}"` : "";
  const r = mkRoute(it);
  const watchedNow = !!mkWatchEntry(it);
  const o0 = ev && it.outcomes ? it.outcomes[0] : null;
  const sell = mkSellAt(o);
  const state = mkEnded(it);
  const sub = [pre ? "Pre-IPO" : ev ? it.category || "Prediction" : MKT_KIND[it.kind], pre && it.group && it.group.title && it.group.title !== it.name ? it.group.title : "", it.base && it.base !== it.name ? it.base : "", it.event && it.event.title !== it.name ? it.event.title : ""].filter(Boolean).join(" · ");
  const imp = pre ? mkImplied(it) : null;
  // a holding no listing carries says no 24 hours when its venue gave none, rather than a dash beside its price
  const change = ev ? mkEventChg(it) : it.held && it.changePct24h === undefined ? "" : chg(it.changePct24h);
  const from = !ev && it.changeFrom ? `<span class="dim small">24h at ${esc(it.changeFrom.venueName)}</span>` : "";
  const now = fresh ? fresh.price ?? fresh.ask : ev ? (o0 ? o0.price : it.price) : it.price;
  const price = ev
    ? `<span class="num-m"${q} data-fmt="c-last">${mkCents(now)}</span><span class="dim">${esc(o0 ? mkLabel(o0.label) : "")}</span>${change}`
    : imp
      ? `<span class="num-m">${esc(mkValuation(imp.usd))}</span><span class="tag">implied</span>${change}${from}<span class="mk-contract"><span${q} data-fmt="usd">${mkUsd(now)}</span> a contract${imp.unit ? ` · ${esc(imp.unit)}` : ""}</span>`
      : `<span class="num-m"${q} data-fmt="usd">${mkUsd(now)}</span>${change}${from}${it.held ? '<span class="dim small">as your venue last read it</span>' : ""}`;
  // the bid and the ask: fresh from the lead venue while they are, else as the explore read carried them from the lead venue (a public
  // one too: the first that gave them)
  const la = lead ? mkAtOf(it, lead.venue) : it.at.find((a) => a.bid !== undefined || a.ask !== undefined) || {};
  const bid = fresh ? fresh.bid : ev ? (o0 && o0.bid !== undefined ? o0.bid : la.bid) : la.bid;
  const ask = fresh ? fresh.ask : ev ? (o0 && o0.ask !== undefined ? o0.ask : la.ask) : la.ask;
  // a stock's session, from its venue's own stamps: open until when, or closed until when
  const session = mkSessionOf(it);
  const sessionWhen = session ? mkSessionWhen(session) : "";
  // where the price above is from, how far behind the market, and when once it is not the last minute or two's, where its line says (a US
  // stock's: a real-time quote, or Cboe's delayed) — the fresh market's own when the price is the fresh one
  const priceFrom = fresh ? mkQuoteWords(fresh.quoteFrom, fresh.quoteAt) : mkQuoteWords(it.quoteFrom, it.quoteAt);
  // a market's facts; a holding no listing carries shows only the facts its venue gave (no box of dashes)
  const facts = [
    ["Bid", `<span${q} data-fmt="${ev ? "bid-c" : "bid"}">${ev ? mkCents(bid) : mkUsd(bid)}</span>`, !it.held || bid !== undefined],
    ["Ask", `<span${q} data-fmt="${ev ? "ask-c" : "ask"}">${ev ? mkCents(ask) : mkUsd(ask)}</span>`, !it.held || ask !== undefined],
    ["Volume 24h", mkVolCell(it), !it.held || it.volumeUsd24h !== undefined || it.contracts24h !== undefined],
    ...(it.fundingRate !== undefined ? [["Funding", `${Number((it.fundingRate * 100).toFixed(4))}%${it.nextFundingAt ? ` · next ${esc(nyTime(it.nextFundingAt))}` : ""}`]] : []),
    ...(fresh && fresh.maxLeverage ? [["Leverage", `up to ${esc(String(fresh.maxLeverage))}x`]] : []),
    ...(it.closeTime ? [[state.ended ? (state.trading ? "End date" : "Closed") : "Closes", `${esc(nyDay(it.closeTime))} ${esc(nyTime(it.closeTime))} New York${state.ended && state.trading ? " · still trading" : ""}`]] : []),
    ...(session ? [["Session", `${session.open ? "Open" : mkPhase(session) ? "Extended" : "Closed"}${sessionWhen ? ` · ${esc(sessionWhen)}` : ""}`]] : []),
    ...(priceFrom ? [["Price from", esc(priceFrom)]] : []),
  ].filter((f) => f[2] !== false);
  const outcomes = ev && it.outcomes ? `<div class="mk-outs">${it.outcomes.map((x, oi) => {
    const rr = mkRoute(it, oi);
    const leg = mkLeadLeg(it, oi);
    const m = leg && mkFresh(`${leg.venue}|${leg.symbol}`);
    const btn = rr.act === "trade" ? `<button type="button" class="${oi === 0 ? "yes" : "no-btn"} mk-buy" data-act="yn" data-o="${oi}" data-fk="buy:${oi}"${mkDis()}>Buy ${esc(mkLabel(x.label))}</button>` : rr.act === "connect" && oi === 0 ? `<button type="button" class="btn btn-sm" data-act="connect" data-connector="${esc(rr.connector)}" data-name="${esc(rr.venueName)}" data-fk="connect-o"${mkDis()}>${icon("plug", "sm")}Connect to trade</button>` : "";
    return `<div class="mk-out"><span class="lbl">${esc(mkLabel(x.label))}</span><span class="mk-out-px"${leg ? ` data-q="${esc(`${leg.venue}|${leg.symbol}`)}" data-fmt="c"` : ""}>${mkCents(m ? m.ask ?? m.price : x.ask ?? x.price)}</span>${chg(x.change24h !== undefined ? x.change24h * 100 : undefined, "¢")}${btn}</div>`;
  }).join("")}</div>` : "";
  const acts = [
    !ev && r.act === "trade" ? `<button type="button" class="btn btn-primary" data-act="trade" data-fk="d-buy"${mkDis()}>${perpNow ? "Long" : "Buy"}</button>` : "",
    !ev && perpNow && r.act === "trade" ? `<button type="button" class="btn" data-act="short" data-fk="d-short"${mkDis()}>Short</button>` : "",
    !ev && r.act === "connect" ? `<button type="button" class="btn btn-primary" data-act="connect" data-connector="${esc(r.connector)}" data-name="${esc(r.venueName)}" data-fk="d-connect"${mkDis()}>${icon("plug", "sm")}Connect to trade</button>` : "",
    sell && !perpNow ? `<button type="button" class="btn" data-act="sell" data-venue="${esc(sell.venue)}" data-symbol="${esc(sell.symbol)}" data-fk="d-sell"${mkDis()}>Sell</button>` : "",
    (r.act === "trade" || r.act === "connect") && typeof openHandToAgent === "function" ? `<button type="button" class="btn" data-act="hand" data-fk="d-hand"${mkDis()}>${icon("agent", "sm")}Hand to agent</button>` : "",
    watchedNow || mkWatchTarget(it) ? `<button type="button" class="btn" data-act="watch" data-fk="d-watch" aria-pressed="${String(watchedNow)}"${mkDis()}>${icon("star", `sm${watchedNow ? " mk-on" : ""}`)}${watchedNow ? "Watching" : "Watch"}</button>` : "",
    mkWatchTarget(it) || mkAlertsOf(it).length ? `<button type="button" class="btn" data-act="alert" data-fk="d-alert" aria-pressed="${String(mkAlertsOf(it).length > 0)}"${mkDis()}>${icon("bell", "sm")}${mkAlertsOf(it).length ? plural(mkAlertsOf(it).length, "Alert") : "Alert"}</button>` : "",
  ].filter(Boolean);
  // a dollar held (a stablecoin, cash) is moved, not traded: nothing to explain
  // a state in a word (Not served here, Close only here) is said as that, the venue's own words folded away; an issuer's rule or another
  // reason keeps the callout
  const words = r.word ? mkSaid(r.said || r.text) : "";
  const why = r.act !== "why" || it.kind === "stable" || it.kind === "cash" ? "" : r.word ? `<div class="mk-state"><span class="chip" title="${esc(r.text)}">${esc(r.word)}</span>${words ? `<details class="inl"><summary>The venue's words</summary>${esc(words)}.</details>` : ""}</div>` : `<div class="callout"><div class="label">Can't trade it here</div><p>${esc(r.text)}</p></div>`;
  const key = mkAssetKey(it);
  const leg = mkCandleLeg(it);
  const iss = mkIssuer(it);
  const head = `<div class="who">${mkAv(it, "lg")}<div><b>${esc(it.name)}</b><span class="dim">${esc(sub)}</span></div></div>
    ${it.closeTime ? mkCloseHtml(it, state) : ""}
    <div class="mk-d-px"${lead ? ` data-pairs="${esc(mkAllPairs(it).slice(0, 4).join(","))}"` : ""}>${price}</div>
    ${facts.length ? `<dl class="mk-facts">${facts.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`).join("")}</dl>` : ""}
    ${iss ? `<div class="box mk-iss-box"><div class="label">${preipoNow ? "What the company says" : "Issuer"}</div>${iss.issuer && !preipoNow ? `<b>${esc(iss.issuer)}</b>` : ""}${iss.eligibility ? `<p class="small">${esc(iss.eligibility)}</p>` : ""}</div>` : ""}
    ${outcomes}
    ${acts.length ? `<div class="mk-d-acts">${acts.join("")}</div>` : ""}
    ${why}
    ${mkCredit([it])}`;
  const ranges = mkSeg(MKT_RANGES.map(([r]) => [r, r]), mkRangeOf(o), "range", "Price history over").replace('class="seg"', 'class="seg mk-rseg"');
  const chart = `<section class="sec" aria-label="Price history"><div class="sec-head"><h2 class="h2">Price</h2>${key || leg ? ranges : ""}</div>${mkChartHtml(o, it, leg, key)}</section>`;
  // a dollar held (a stablecoin, cash) is compared with nothing: a dollar is a dollar
  const across = it.kind === "stable" || it.kind === "cash" ? "" : `<section class="sec" aria-label="Across venues"><h2 class="h2">Across venues</h2>${mkAcrossHtml(o)}</section>`;
  const lines = `<section class="sec" aria-label="On the statement"><div class="sec-head"><h2 class="h2">On the statement</h2>${typeof openStatement === "function" ? '<button type="button" class="link" data-act="statement" data-fk="d-statement">Open the Statement →</button>' : ""}</div>${mkLinesHtml(o)}</section>`;
  // its price alerts (standing, with Remove; fired), where it has any — "Set another" opens the sheet
  const alertLines = mkAlertLinesHtml(it);
  const alerts = alertLines ? `<section class="sec" aria-label="Price alerts"><div class="sec-head"><h2 class="h2">Price alerts</h2>${mkWatchTarget(it) ? `<button type="button" class="link" data-act="alert" data-fk="d-alert2"${mkDis()}>Set another →</button>` : ""}</div>${alertLines}</section>` : "";
  // a US share's own filed figures from the SEC (mkFinHtml), with the company's filings there one click away
  const finOk = o.fin && o.fin.ok !== false && typeof o.fin.filingsUrl === "string" && /^https:\/\/www\.sec\.gov\//.test(o.fin.filingsUrl) ? o.fin : null;
  const coOk = o.co && o.co.ok !== false ? o.co : null;
  const coPart = !pre && mkTicker(it) ? `<section class="sec" aria-label="Company"><div class="sec-head"><h2 class="h2">Company</h2>${coOk ? `<a class="link mk-fin-link" href="${esc(coOk.filingsUrl)}" target="_blank" rel="noopener noreferrer">All filings ${icon("external", "sm")}</a>` : ""}</div>${mkCompanyHtml(o)}</section>` : "";
  const financials = !pre && mkTicker(it) ? `<section class="sec" aria-label="Financials"><div class="sec-head"><h2 class="h2">Financials</h2>${finOk ? `<a class="link mk-fin-link" href="${esc(finOk.filingsUrl)}" target="_blank" rel="noopener noreferrer">Filings at the SEC ${icon("external", "sm")}</a>` : ""}</div>${mkFinHtml(o)}</section>` : "";
  return {
    head,
    chart,
    alerts,
    across,
    company: coPart,
    financials,
    ipo: pre ? mkIpoHtml(o) : "",
    held: `<section class="sec" aria-label="You hold"><h2 class="h2">You hold</h2>${mkHeldHtml(o)}</section>`,
    agents: `<section class="sec" aria-label="Agents on it"><h2 class="h2">Agents on it</h2>${mkAgentsHtml(it)}</section>`,
    lines,
  };
}
/* the whole drawer, the parts in their order, each in the element mkDrawerRedraw paints on its own */
const mkDrawerHtml = (o) => Object.entries(mkDrawerParts(o)).map(([k, html]) => `<div class="mk-sec" data-sec="${k}">${html}</div>`).join("");
