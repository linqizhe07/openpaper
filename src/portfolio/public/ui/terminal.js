/* THE TRADE TERMINAL — the Trade pane laid out as Hyperliquid lays its own trading screen (app.hyperliquid.xyz/trade, measured in the
   scratchpad's hl-reference.md): dark panels three pixels apart on a lighter ground — the market bar over the chart on the left (the
   market, its price, its 24 hours, its funding or its session), the order book and the latest trades beside them (ui/book.js), the order
   panel on the right (the ticket, ui/trade.js), and under them what is held, what is open, what filled and every order placed; at the very
   foot a thin status strip (whether the account's stream is live — HL's own "Online" in the same corner, ui/stream.js stDot — which
   accounts trade from here, and a read of the bar's market that failed). The market is picked from the bar: it opens the kinds and their
   lists (the picker, ui/trade.js) in a popover laid over the panels, never pushing them down. What the account pushes — an order's state, a
   fill, a position — is drawn into the tabs under the panels as it comes (ttPushed), whatever is being typed in the ticket.

   Whether the owner trades here or watches the account's desk trade a paper account by itself is the topbar's switch (account.html
   #trade-mode, Regular · Superagent, shell.js): one switch for both panes, so this frame draws none of its own.

   The layout follows the terminal's own width, not the window's (container queries in terminal.css): three columns — the chart taking the
   rest, the book and the order panel the same width as each other — once the terminal is 1080 pixels wide; the chart over the order panel
   and the book side by side below that; and under 560 one column, the chart and the book sharing one panel behind three tabs (Chart ·
   Order book · Trades, as HL's phone layout has them) so the order panel follows directly. Both stay mounted; the tabs only hide one. At
   three columns the terminal fits the window as HL's does (ttFit): the grid sized from what sits outside it, the tables under it the rest,
   scrolling inside under their heads, the status strip at the window's foot — the page itself does not scroll at 1500 × 900. The bar's
   figures are shown whole or not at all (ttFitStats), and the tables' prices are written as their market writes them (ttFig).

   It draws nothing of its own about a market that its sources did not say: the bar's figures are the market's as its venue lists it
   (GET /api/account/market, read again every five seconds while the pane is showing — its beat goes on while another pane shows, asking
   nothing, so the figures are fresh again within a beat of coming back) and its row's — until an account is chosen for it, the row read
   again on the same beat; a figure no source gave is not shown, and a read that failed says so, with when the figures showing were read.
   Every button does what it says through the ticket, the book or the account's own door.

   PUSHED (feat/paper-live p2b). The tab follows on the account's stream exactly the markets it shows (ttFollow, ui/stream.js stFollow):
   the market the bar, the chart and the book show — whole: its quote, book and trades — and the markets of the positions listed under the
   panels while that tab shows — their price alone, each row's mark — and nothing while another pane shows (a hidden tab's stream is
   closed, so the account lets go of them all; ui/stream.js). Where the stream carries the market showing, its price, its bid and ask, its
   funding and its change (from the venue's own reference: the price read less its change) follow each pushed quote in the next frame, the
   price tinted by the way its last tick went, and the read of the market slows to a fallback once every TT_PUSHED_MS (its 24 hours' volume,
   its session and its steps are the read's); a position's mark, its value, its PNL and its ROE follow the pushed price of its market the
   same way, from the positions last read (nothing is asked for it). At the bar's right end the feed (ttFeed) says how the price showing
   comes — Live (pushed as its venue's stream moves), Quiet (the stream carries it and its venue is silent), Polling (read every few seconds:
   the stream is down, or does not carry this market) — and how old it is, every second; on hover, how long a pushed price takes to reach
   the screen (ui/stream.js stLag). A pushed price is never shown over a newer read, never as the price of a market picked after it (the
   bar is drawn the moment another market or venue is picked: ttLiveQuote), and one the stream no longer carries is never live. A word that
   the market is not live there brings the read forward to its own beat, and the next such word never puts it back (ttPollSooner). */

/* the terminal's state: the market showing (its Markets row and that row as last read again, where it is traded, the market as the venue
   lists it, when that was last read, why the last read failed and how many reads in a row have — the beat waits longer after each: ttWaitMs),
   how many positions the last read listed (said on their tab), the tab under the panels, the market the chart and the book were mounted
   on, whether a market has shown on this frame or a ticket was opened on purpose (from then on nothing picks one by itself: ui/trade.js
   tkTicket says so as a ticket opens, tkReopenDraft while a kept ticket's market is read), and the bar's read timer with when it is due
   (pollAt; 0 while none is set, or while its read is on its way) — and what the stream pushes: the market showing as it is followed
   (followKey, `<venue>:<symbol>`), the positions' markets followed for their price (posKeys), the way the bar's pushed price last moved
   (tick), and what waits to be drawn in the next frame (due) */
const TT = { item: null, row: null, kind: "", at: null, mk: null, readAt: 0, said: "", fails: 0, posN: 0, tab: "positions", m: "chart", mounted: "", started: false, timer: 0, pollAt: 0, seq: 0, followKey: "", posKeys: [], tick: null, due: { bar: false, pos: false, lag: null, frame: false }, ind: "" };
/* THE CHART'S INDICATORS (ui/chart.js, ui/indicators.js) the owner has on: kept in this browser between visits, and written in the address
   with the range and the bar size (ttUrl) so a link or a reload shows the same picture; an address that names them wins over the browser's
   memory (onRoute). Nothing is kept where the browser refuses its storage (a private window): then they last the page's life */
const TT_IND_KEY = "account.chart.indicators";
function ttIndStored() {
  try {
    return typeof localStorage !== "undefined" && typeof inParse === "function" ? inString(inParse(localStorage.getItem(TT_IND_KEY) || "")) : "";
  } catch {
    return "";
  }
}
function ttIndKeep(v) {
  try {
    if (v) localStorage.setItem(TT_IND_KEY, v);
    else localStorage.removeItem(TT_IND_KEY);
  } catch {
    /* a browser that refuses its storage: the indicators last the page's life */
  }
}
TT.ind = ttIndStored();
/* the tabs under the panels, as HL names its own: what is held, what rests on a book, what filled, and every order with what became of it */
const TT_TABS = [["positions", "Positions"], ["open", "Open orders"], ["history", "Trade history"], ["funding", "Funding history"], ["orders", "Order history"]];
/* the three tabs a narrow terminal shows the chart and the book behind (one panel), so the order panel follows the chart directly */
const TT_MTABS = [["chart", "Chart"], ["book", "Order book"], ["trades", "Trades"]];
const TT_READ_MS = 5_000;
/* while the stream pushes the bar's market (a live quote within TT_PUSH_FRESH_MS), the market is read only every TT_PUSHED_MS: its volume,
   its session and its steps, which no quote carries */
const TT_PUSH_FRESH_MS = 10_000;
const TT_PUSHED_MS = 30_000;
/* a read of the bar's market that did not come back is asked again later each time it fails — ten seconds, then twenty, forty, at most a
   minute apart — and on the five-second beat again once one is answered: a stopped account is not asked every five seconds for as long as
   the page is open */
const TT_READ_MAX_MS = 60_000;

/** the pane's frame: the grid (the bar, the picker's popover — hidden, laid over the panels, next to its button in the order the keys
 * reach it — the narrow terminal's three tabs, the chart, the book, the order panel), the tabs under it, the status strip at its foot */
function ttFrame() {
  return `<div class="tt" data-tp data-tt-m="${esc(TT.m)}">
    <section class="tt-onboard" data-tt-onboard aria-label="Open a paper account" hidden></section>
    <div class="tt-grid">
      <div class="tt-bar">
        <button type="button" class="tt-mkt" data-tt-pick aria-expanded="false" aria-controls="tt-pop"><span class="tt-av" data-tt-av></span><span class="tt-name" data-tt-name>Pick a market</span>${icon("chevron", "sm")}</button>
        <span class="tt-tags" data-tt-tags></span>
        <div class="tt-stats tab-nums" data-tt-stats></div>
        <span class="tt-feed" data-tt-feed role="status" aria-live="off"></span>
      </div>
      <div class="tt-pop" id="tt-pop" data-tt-pop role="dialog" aria-label="Pick a market" hidden>
        <div data-tp-note></div>
        <div class="seg tk-seg" role="group" aria-label="Market kind" data-tp-kinds></div>
        <section class="tk-pick" data-tp-pick aria-labelledby="tp-pick-h"></section>
      </div>
      <div class="tt-mtabs" role="tablist" aria-label="Chart, order book or trades" data-tt-mtabs>${TT_MTABS.map(([v, t]) => `<button type="button" role="tab" data-tt-m="${v}" aria-selected="${String(TT.m === v)}">${esc(t)}</button>`).join("")}</div>
      <section class="tt-chart" data-tt-chart aria-label="Chart"></section>
      <section class="tt-book" data-tt-book aria-label="Order book and trades"></section>
      <aside class="tt-order tk-panel" id="tk-panel" aria-label="Order"></aside>
    </div>
    <section class="tt-low" aria-label="Positions, open orders, trade history, funding history and order history">
      <div class="tt-tabs" role="tablist" data-tt-tabs></div>
      <div class="tt-tab" data-tt-tab="positions"></div>
      <section class="tt-tab" data-tt-tab="open" data-tp-open aria-labelledby="tp-open-h" hidden></section>
      <div class="tt-tab" data-tt-tab="history" hidden></div>
      <div class="tt-tab" data-tt-tab="funding" hidden></div>
      <div class="tt-tab" data-tt-tab="orders" hidden></div>
    </section>
    <div class="tt-foot"><span class="tt-live" data-st-dot></span><span class="tt-clock" data-tt-clock title="Every time on this screen — the chart's axis, the trades beside the book, the tables under the panels — is on this one clock, yours"></span><span class="tp-state" data-tp-state></span><p class="tt-said" data-tt-said role="status"></p></div>
  </div>`;
}

/* the picker's panel and the market button of the frame on the page now: a frame drawn again (the pane redrawn after an error put its
   words there) is a new one, so they are looked up each time, never kept */
function ttPopParts() {
  const pane = $("pane-trade");
  const tp = pane && pane.querySelector("[data-tp]");
  const pop = tp && tp.querySelector("[data-tt-pop]");
  const btn = tp && tp.querySelector("[data-tt-pick]");
  return pop && btn ? { pop, btn } : null;
}
/* the picker's panel opened (its search takes the cursor) or closed */
function ttSetPop(open) {
  const x = ttPopParts();
  if (!x) return;
  x.pop.hidden = !open;
  x.btn.setAttribute("aria-expanded", String(open));
  if (open) {
    const input = x.pop.querySelector("input[type='search']");
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 0);
  }
}
TT.closePicker = () => ttSetPop(false);

/** the frame's buttons, heard once per frame — the market button opens and closes the picker's panel, a market picked in it closes it, the
 * tabs — so a frame drawn again is heard as the first was; Escape and a click outside the panel close it, heard once on the page. And the
 * sizes the frame is laid out from, watched: the bar's room for its figures (ttFitStats), the tab bars' (their sliding lines), and once for
 * the page the main column's (the fit to the window, ttFit) */
function ttWire(el) {
  const tp = el.querySelector("[data-tp]");
  if (!tp || tp.ttWired) return;
  tp.ttWired = true;
  const pop = tp.querySelector("[data-tt-pop]");
  const btn = tp.querySelector("[data-tt-pick]");
  btn.addEventListener("click", () => ttSetPop(pop.hidden));
  // a market picked in the panel closes it (the ticket opens on it: ttSetItem below)
  pop.addEventListener("click", (e) => {
    const row = e.target.closest && e.target.closest(".tk-list button[data-i]");
    if (row) setTimeout(() => ttSetPop(false), 0);
  });
  const tabs = tp.querySelector("[data-tt-tabs]");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button[data-tt-to]");
    if (!b || TT.tab === b.dataset.ttTo) return;
    TT.tab = b.dataset.ttTo;
    ttLow(el, owns());
    // the positions' markets are followed only while their tab shows
    ttFollow();
  });
  // a narrow terminal's Chart · Order book · Trades (shown only under 560 pixels: terminal.css)
  const mtabs = tp.querySelector("[data-tt-mtabs]");
  if (mtabs) mtabs.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button[data-tt-m]");
    if (b) ttShowM(tp, b.dataset.ttM);
  });
  // the bar's figures fitted again whenever the room for them changes (the window, the rail, the market's name): its own box watched
  const stats = tp.querySelector("[data-tt-stats]");
  if (stats && typeof ResizeObserver === "function") new ResizeObserver(() => ttFitStats(stats)).observe(stats);
  // the line under the tables' tab showing and the narrow terminal's (book.js bkSlideUnder) follows its tab when a bar's size changes (the
  // narrow tabs share the width; a phone turned) and once the page's own font has come (every tab's width changes with it)
  const under = () => {
    if (typeof bkSlideUnder !== "function") return;
    bkSlideUnder(tabs);
    if (mtabs) bkSlideUnder(mtabs);
    ttTypesUnder();
  };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(under);
    ro.observe(tabs);
    if (mtabs) ro.observe(mtabs);
  }
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") document.fonts.ready.then(under);
  if (TT.docHeard) return;
  TT.docHeard = true;
  // the terminal fitted to the window again whenever the page's main column changes size — a banner coming or going over it, the window
  // resized — once for the page, on whichever frame is drawn then
  const main = typeof tp.closest === "function" ? tp.closest(".main") : null;
  // and the order panel's type tabs share its width, which follows the window's: the line under the type showing follows its tab
  if (main && typeof ResizeObserver === "function") new ResizeObserver(() => {
    ttFit($("pane-trade"));
    ttTypesUnder();
  }).observe(main);
  document.addEventListener("keydown", (e) => {
    const x = ttPopParts();
    if (e.key === "Escape" && x && !x.pop.hidden) {
      ttSetPop(false);
      x.btn.focus();
    }
  });
  document.addEventListener("click", (e) => {
    const x = ttPopParts();
    if (!x || x.pop.hidden) return;
    const t = e.target;
    if (t && (x.pop.contains(t) || x.btn.contains(t))) return;
    ttSetPop(false);
  });
}

/* the line under the order panel's type showing (ui/trade.js drawTypes, book.js bkSlideUnder), measured again: the panel's width changed */
function ttTypesUnder() {
  const pane = $("pane-trade");
  const types = pane && typeof pane.querySelector === "function" ? pane.querySelector(".tt-order [data-otabs]") : null;
  if (types && typeof bkSlideUnder === "function") bkSlideUnder(types, typeof TK_OTAB_ON === "string" ? TK_OTAB_ON : undefined);
}

/** THE FIT. At 1080 pixels wide and more the terminal fills the window as HL's does (terminal.css: the grid as tall as the window leaves it
 * once what sits outside it has its room, the tables what is left, the status strip at the window's foot). What sits above it — the topbar,
 * a banner the page shows over it, the gutters — is measured here into --tt-top, and the page's gutter under it into --tt-below: each time
 * the pane is drawn, and whenever the page's main column changes size (ttWire). A value is written only when it changed, so nothing is laid
 * out again for nothing; a pane put aside (no box) is not measured, and a page that cannot measure keeps the stylesheet's own (the topbar's
 * 56 and the gutters) */
function ttFit(el) {
  const tt = el && typeof el.querySelector === "function" ? el.querySelector(".tt") : null;
  if (!tt || typeof tt.getBoundingClientRect !== "function" || !tt.style || typeof tt.style.setProperty !== "function") return;
  if (typeof tt.getClientRects === "function" && !tt.getClientRects().length) return;
  // measured where the grid starts: under the paper onboarding card while one shows (tkOnboard), so the card takes its room from the grid's
  // and the tables', never the page's — the window still ends at the status strip
  const grid = typeof tt.querySelector === "function" ? tt.querySelector(".tt-grid") : null;
  const from = grid && typeof grid.getBoundingClientRect === "function" ? grid : tt;
  const top = Math.max(0, Math.round(from.getBoundingClientRect().top + (Number(window.scrollY) || 0)));
  const main = typeof tt.closest === "function" ? tt.closest(".main") : null;
  let below = 0;
  try {
    below = main && typeof getComputedStyle === "function" ? Math.round(parseFloat(getComputedStyle(main).paddingBottom) || 0) : 0;
  } catch {
    below = 0;
  }
  const want = `${top}|${below}`;
  if (tt.ttFitted === want) return;
  tt.ttFitted = want;
  tt.style.setProperty("--tt-top", `${top}px`);
  tt.style.setProperty("--tt-below", `${below}px`);
}

/** The bar's figures, as many as fit WHOLE: every figure is shown, then — while the strip is wider than its room — the least needed is set
 * aside (`hidden`), one at a time, until the rest fit: bid · ask first (the book beside it says them), then the volume, an event's close, the
 * funding, the session, where the price is from, the change. The price is never set aside. Each figure's place in that order is its
 * data-tt-drop (the higher, the sooner it goes; none: it stays). Run after every paint of the figures and whenever the strip's room changes
 * (ttWire), so a wider window brings them back. A strip with no box (a pane put aside, a page that cannot measure) is left as drawn */
function ttFitStats(box, shape) {
  // asked whether it can measure without measuring (reading scrollWidth lays the page out)
  if (!box || !box.children || !("scrollWidth" in box)) return;
  const all = [...box.children].filter((x) => x && x.dataset && x.dataset.ttDrop !== undefined);
  // the same shape as the last fit (`shape`, ttShape: a pushed price moved): the figures set aside then are set aside again, and nothing is
  // measured — no layout forced on every tick
  if (shape !== undefined && shape === box.ttShape && Array.isArray(box.ttAside)) {
    for (const x of all) {
      const aside = box.ttAside.includes(x.dataset.k);
      if (x.hidden !== aside) x.hidden = aside;
    }
    return;
  }
  box.ttShape = shape;
  box.ttAside = null;
  for (const x of all) if (x.hidden) x.hidden = false;
  if (!(box.clientWidth > 0)) return;
  all.sort((a, b) => Number(b.dataset.ttDrop) - Number(a.dataset.ttDrop));
  for (const x of all) {
    if (box.scrollWidth <= box.clientWidth + 1) break;
    x.hidden = true;
  }
  box.ttAside = all.filter((x) => x.hidden).map((x) => x.dataset.k);
}
/* what the bar's figures look like, for ttFitStats: each figure's name and how many characters its words take */
const ttShape = (parts) => parts.map((h) => `${(/data-k="([^"]*)"/.exec(h) || [])[1] || ""}:${h.replace(/<[^>]*>/g, "").length}`).join("|");

/** a narrow terminal's panel shows the chart, the book or the trades: the frame says which (data-tt-m, read by terminal.css), and the book's
 * own tab follows — pressed through the book's own button (ui/book.js hears it), so its reads go on the tab showing and no other. The
 * chart and the book both stay mounted: the one hidden has no box, so it waits and asks nothing (chart.js chLaidOut, book.js bkLaidOut) */
function ttShowM(tp, v) {
  if (!TT_MTABS.some(([x]) => x === v)) return;
  TT.m = v;
  tp.dataset.ttM = v;
  for (const b of tp.querySelectorAll("[data-tt-mtabs] button[data-tt-m]")) b.setAttribute("aria-selected", String(b.dataset.ttM === v));
  if (typeof bkSlideUnder === "function") bkSlideUnder(tp.querySelector("[data-tt-mtabs]"));
  ttBookTab(tp);
}
/* the book's tab as the narrow terminal's tabs want it: Trades for Trades, the ladder otherwise — only once the narrow tabs are the ones
   showing (in a wide terminal the book keeps the tab the owner pressed on it) */
function ttBookTab(tp) {
  if (TT.m === "chart" || !tp) return;
  const want = TT.m === "trades" ? "trades" : "book";
  const mt = tp.querySelector("[data-tt-mtabs]");
  if (!mt || !mt.getClientRects || !mt.getClientRects().length) return;
  const b = tp.querySelector(`[data-tt-book] [data-bk-tab="${want}"]`);
  if (b && b.getAttribute("aria-selected") !== "true" && typeof b.click === "function") b.click();
}

/* a market's name and logo as the bar says it */
const ttLabel = (x) => (!x ? "Pick a market" : x.kind === "event" ? tkName(x) : x.kind === "perp" && !tkPre(x) ? `${x.base || x.name}-PERP` : x.base || x.name);

/** the ticket picked a market (or put it back: null): the bar's name and logo. Once a market has shown on this frame, nothing picks one by
 * itself again (ttDraw): a ticket the owner opened afterwards, on no market, stays as it was opened */
function ttSetItem(item, kind) {
  const el = $("pane-trade");
  // another market: where the last one was traded, its figures and when they were read are not this one's (ttSetMarket says where this one
  // is, once chosen)
  if (!item || !TT.item || item.key !== TT.item.key) {
    TT.at = null;
    TT.mk = null;
    TT.said = "";
    TT.readAt = 0;
    TT.fails = 0;
  }
  // the row the ticket gives is the one it has just read: a row read again before it is not kept over it
  TT.row = null;
  TT.item = item || null;
  TT.kind = kind || TT.kind;
  if (item) TT.started = true;
  // no market now (a market the address named that could not be opened, the "t" key, Change): the address says so too — never the market
  // that is gone, which a reload would try again (ttMount writes it only when what is mounted changed)
  else ttUrl();
  if (!el) return;
  const name = el.querySelector("[data-tt-name]");
  if (name) setText(name, ttLabel(item));
  // a name too long for the bar (an event's question) is cut with an ellipsis there: the whole of it on hover
  if (name && "title" in name) name.title = item && item.name && item.name !== ttLabel(item) ? String(item.name) : ttLabel(item);
  const av = el.querySelector("[data-tt-av]");
  if (av) paint(av, item ? avatar(item.kind === "event" ? String(item.category || "Event").slice(0, 4) : item.base || item.name, "sm", ttIconOf(item)) : "");
  ttStats(el);
  // until an account is chosen for it, the chart and the book are its public listing's (or say why there are none), and the bar's figures
  // its row's, read again on the bar's beat (ttPoll); no market, no beat
  if (!TT.at) {
    ttMount(el);
    ttPoll();
  }
}

/* the logo the bar shows for a market: its row's own, else the logo of a row read on this page for the same coin (a perpetual's row comes
   without one; BTC-PERP is BTC's), found the way the picker's rows find theirs (ui/trade.js tkLoaded, tkLogoUrl) — else none, and the
   letters stand */
function ttIconOf(item) {
  if (!item) return "";
  if (typeof tkLogoUrl === "function" && tkLogoUrl(item.icon)) return item.icon;
  if (item.kind === "event" || !item.base || typeof tkLoaded !== "function") return "";
  const base = String(item.base).toUpperCase();
  return (tkLoaded().find((x) => x.kind !== "event" && String(x.base || "").toUpperCase() === base && tkLogoUrl(x.icon)) || {}).icon || "";
}

/* the public listing a market's chart and book are read from while no account of yours is chosen for it: the first public line that names
   its source and its symbol there (Markets' row; read without a key, as Markets reads it) */
const ttPublicAt = (x) => (x && Array.isArray(x.at) ? x.at.find((a) => a.public && a.venue && a.symbol) || null : null);

/** the ticket chose where the order goes and read the market there: the chart and the book follow it (mounted again only when the market
 * or the venue changed), and the bar's figures are its own */
function ttSetMarket(at, mk) {
  const el = $("pane-trade");
  TT.at = at ? { venue: at.venue, symbol: at.symbol, venueName: at.venueName || nameOf(at.venue) } : null;
  TT.mk = mk || null;
  // the ticket has just read it there
  TT.readAt = Date.now();
  TT.said = "";
  TT.fails = 0;
  if (!el) return;
  ttStats(el);
  ttMount(el);
  ttPoll();
}

/* THE MARKET SHOWING NOW, as the chart and the book are mounted on it: where the order goes, once chosen (its market as the ticket read it
   there); before that, the market's public listing — its source's figures, no account's. { at, mk }, either null where there is none */
function ttShowing() {
  const pub = !TT.at && TT.item ? ttPublicAt(TT.item) : null;
  const at = TT.at || pub;
  const mk = TT.at ? TT.mk : pub ? { kind: TT.item.kind, quote: pub.quote, base: TT.item.base } : null;
  return { at, mk };
}
/* the key the market showing now is followed by on the push channel (`<venue>:<symbol>`; "" where none is shown whole) */
function ttShownKey() {
  const { at, mk } = ttShowing();
  return at && mk ? `${at.venue}:${at.symbol}` : "";
}

/* the chart and the book on the market showing: mounted once per market, released when there is none */
function ttMount(el) {
  const chart = el.querySelector("[data-tt-chart]");
  const book = el.querySelector("[data-tt-book]");
  const { at, mk } = ttShowing();
  const key = at && mk ? `${at.venue}|${at.symbol}` : TT.item ? `none|${TT.item.key}` : "";
  if (key === TT.mounted) return;
  TT.mounted = key;
  // the market showing, followed on the push channel in place of the one before: its quote, book and trades come as its venue's own stream
  // moves (ui/stream.js); the last market's pushed price is no longer this bar's
  TT.followKey = at && mk ? `${at.venue}:${at.symbol}` : "";
  TT.tick = null;
  ttFollow();
  if (!at || !mk) {
    // no market's price comes to the feed now: it says how a market is read, or — no market at all — nothing
    ttFeed(el);
    if (typeof chRelease === "function") chRelease(chart);
    if (typeof bkRelease === "function") bkRelease(book);
    paint(chart, `<p class="empty tt-wait">${TT.item ? "No chart is read for it here: choose where to trade it." : "Pick a market: its chart shows here."}</p>`);
    paint(book, `<p class="empty tt-wait">${TT.item ? "No order book is read for it here." : "Its order book and latest trades show here."}</p>`);
    ttUrl();
    return;
  }
  const base = { venue: at.venue, symbol: at.symbol, kind: mk.kind, quote: mk.quote };
  // the range, the bar size and the price scale the owner picked stay when the market changes (a range pressed takes its own bar size:
  // ui/chart.js says both back)
  if (typeof chMount === "function") chMount(chart, { ...base, fullscreen: true, priceStep: mk.priceStep, range: TT.range || "1M", interval: TT.interval || undefined, log: TT.log === true, indicators: TT.ind, onRange: (r) => ((TT.range = r), ttUrl()), onInterval: (iv) => ((TT.interval = iv), ttUrl()), onLog: (on) => (TT.log = on), onIndicators: (v) => ((TT.ind = v), ttIndKeep(v), ttUrl()) });
  else paint(chart, '<p class="empty tt-wait">The chart is not on this page.</p>');
  // the account's own lines over it (orders, the position's entry, its exits, its liquidation), and the address saying what shows
  ttLinesDraw();
  ttUrl();
  // a price pressed in the book is the limit price in the ticket. The book's and the tape's sizes are named in what the venue counts them
  // in (ui/trade.js tkSizeUnit): a contract market's contracts where one is not one coin (OKX's BTC swap, 0.01 BTC each), an event's contracts
  if (typeof bkMount === "function") bkMount(book, { ...base, base: tkSizeUnit(mk), priceStep: mk.priceStep, onPrice: (p) => typeof TK.setLimit === "function" && TK.setLimit(p) });
  else paint(book, '<p class="empty tt-wait">The order book is not on this page.</p>');
  // a book mounted afresh opens on its ladder: a narrow terminal showing Trades turns it to its trades
  ttBookTab(el.querySelector("[data-tp]"));
}

/* the bar's market read again every five seconds while the pane is the one showing: its price, its 24 hours, its funding, its session.
   Until an account is chosen for it, its row is read again instead — the markets read of its kind searched by its name as a search may hold
   it and asked for by its key (ui/trade.js tkQueryOf, tkReadKind: kept 15 s, its own read, so never taken for the kind's own list; the key
   finds the row though twelve busier ones share the first words of its question), the row with its key kept as TT.row — so a market outside
   the busiest of its kind (one found by the picker's search, one opened from Markets) is as fresh as one in that list. While another pane
   shows, or the page is hidden, the beat goes on and asks nothing, so the first beat back on Trade reads it again (the pane is only put
   aside, and nothing else would start the beat again for the market still showing). A read refused, or a markets read that did not list
   the row, keeps the figures showing, said with when they were read and the source's words (ttStats) — the account not answering at all
   (a stopped service, a dropped connection) in the page's own words, never the browser's error as it was thrown. A read refused or not
   answered is asked again later each time (TT_READ_MAX_MS: ten seconds, doubling, at most a minute), the beat back to five seconds once
   one is answered */
function ttPoll() {
  clearTimeout(TT.timer);
  TT.pollAt = 0;
  const at = TT.at;
  const item = at ? null : TT.item;
  if ((!at && !item) || !A) return;
  // still the market this beat was set for: the same place chosen, or still none chosen for the same row
  const same = () => (at ? TT.at === at : !TT.at && TT.item === item);
  const wait = ttWaitMs();
  TT.pollAt = Date.now() + wait;
  TT.timer = setTimeout(async () => {
    TT.pollAt = 0;
    const el = $("pane-trade");
    if (!el || ROUTE.tab !== "trade" || document.hidden || !same()) return void (same() && ttPoll());
    const my = ++TT.seq;
    if (at) {
      const b = await api(`/api/account/market?${new URLSearchParams({ venue: at.venue, symbol: at.symbol })}`, { ttl: 3_000 });
      if (my !== TT.seq || !same()) return;
      if (b && b.ok !== false && b.market) {
        TT.mk = b.market;
        TT.readAt = Date.now();
        TT.said = "";
        TT.fails = 0;
        // the ticket on the same market follows the read: its bid and ask, its placeholder, its estimate (ui/trade.js TK.marketRead, P8)
        if (typeof TK.marketRead === "function") TK.marketRead(at, b.market);
      } else {
        TT.fails++;
        TT.said = ttWhyNot(b, "the market could not be read");
      }
    } else {
      const got = await tkReadKind(tkKindOf({ item }), tkQueryOf(item), item.key || "");
      if (my !== TT.seq || !same()) return;
      const row = got.refused ? null : (got.items || []).find((y) => y.key === item.key) || null;
      if (row) {
        TT.row = row;
        TT.readAt = Date.now();
        TT.said = "";
        TT.fails = 0;
      } else if (got.refused) {
        TT.fails++;
        TT.said = ttWhyNot(got.refused, "the markets read was refused");
      } else {
        // the account answered, and its read of the kind did not list the row: said, and asked again on the beat as before
        TT.fails = 0;
        TT.said = "the markets read did not list it";
      }
    }
    ttStats(el);
    ttPoll();
  }, wait);
}
/* THE BEAT BROUGHT FORWARD, never put back: the bar's market read on its own wait from now (ttWaitMs: five seconds once the stream no
   longer pushes it live) where the beat is set for later than that — slowed while the pushes came — and otherwise left as it is set. So the
   words that keep coming (each quote that says the market is not live there now, a stream whose health flaps) never hold the read off */
function ttPollSooner() {
  if (TT.pollAt > Date.now() + ttWaitMs()) ttPoll();
}
/* a read that failed under a table, as one sentence: ttWhyNot's words, capital first, a full stop at the end */
const ttSentence = (b, fallback) => {
  const w = ttWhyNot(b, fallback).replace(/[.\s]+$/, "");
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}.`;
};
/* the beat's next wait: five seconds while the bar's reads are answered; after reads refused or not answered in a row, ten, twenty, forty,
   then a minute */
const ttWaitMs = () => (TT.fails > 0 ? Math.min(TT_READ_MAX_MS, TT_READ_MS * 2 ** TT.fails) : ttPushedNow() ? TT_PUSHED_MS : TT_READ_MS);
/* why a read came back with no figures, as one phrase: the account not answering it at all (book.js bkUnanswered: no body, or the
   browser's own error for a request that never reached the account) in the page's words, else the refusal's own (a body, or the words a
   read already took from one), else `fallback` */
function ttWhyNot(b, fallback) {
  const unanswered = typeof bkUnanswered === "function" ? bkUnanswered(b) : !b;
  if (unanswered) return "the account is not answering";
  return (typeof b === "string" ? b.trim() : refusalOf(b)) || fallback;
}

/* a figure in the bar: its name over its value; only what a source said. A name that explains itself on hover (`title`) is underlined
   dashed, as HL marks every label that has a tooltip; the others are plain. `drop`: its place among the figures set aside when they do not
   all fit (TT_DROP, ttFitStats); none, it always stays */
const ttStat = (name, value, cls = "", title = "", drop = 0) => (value === undefined || value === null || value === "" ? "" : `<div class="tt-st" data-k="st:${esc(name)}"${drop ? ` data-tt-drop="${drop}"` : ""}><span class="tt-st-n"${title ? ` title="${esc(title)}"` : ""}>${esc(name)}</span><span class="tt-st-v${cls ? ` ${cls}` : ""}">${value}</span></div>`);
/* which of the bar's figures go first when they do not all fit (the higher, the sooner): bid · ask (the book beside the chart says them),
   then the volume, an event's close, the funding, the session, where the price is from, the change. The price never goes. A perpetual's
   "Price from" goes right after bid · ask (fromPerp): its venue is the chart's caption and its age the feed's, while its mark, oracle,
   open interest and funding are said nowhere else */
const TT_DROP = { bidask: 11, fromPerp: 10, oracle: 9, volume: 8, oi: 7, mark: 6, closes: 6, funding: 5, session: 4, from: 3, change: 2 };
/* what a perpetual's funding is, on its label: the venue's rate for each funding period, and who pays whom by its sign */
const TT_FUNDING_SAYS = "The venue's funding rate for each period: when it is above zero, longs pay shorts; below zero, shorts pay longs.";
/* what a perpetual's mark, oracle and open interest are, on their labels */
const TT_MARK_SAYS = "The venue's mark: the price your position is valued, and liquidated, at — not the middle of the book.";
const TT_ORACLE_SAYS = "The venue's oracle: the index price its funding measures the mark against.";
const TT_OI_SAYS = "Open interest: the contracts open now, worth this at the mark.";
/* WHEN A PERPETUAL'S FUNDING IS NEXT PAID, ms: the venue's own time for it — or, once that has passed, the next one after it a period on
   (Hyperliquid pays every hour) — undefined where the venue says neither */
function ttNextFunding(m, now = Date.now()) {
  const at = m && m.nextFundingAt ? Date.parse(m.nextFundingAt) : NaN;
  if (!Number.isFinite(at)) return undefined;
  if (at > now) return at;
  const every = m && Number(m.fundingEveryH) > 0 ? Number(m.fundingEveryH) * 3_600_000 : 0;
  return every ? at + (Math.floor((now - at) / every) + 1) * every : undefined;
}
/* the time left until then, as a countdown: 35:12 — 7:35:12 past an hour */
function ttCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}
/* the bar's funding countdowns follow the clock (ttFeedTicks): each [data-tt-count] says when it ends (ms) and the funding's period (ms), and
   rolls on to the next payment once it is reached */
function ttCountdowns(el) {
  if (!el || typeof el.querySelectorAll !== "function") return;
  const now = Date.now();
  for (const x of el.querySelectorAll("[data-tt-count]")) {
    let at = Number(x.dataset.ttCount);
    const every = Number(x.dataset.ttEvery) || 0;
    if (at <= now && every > 0) {
      at += (Math.floor((now - at) / every) + 1) * every;
      x.dataset.ttCount = String(at);
    }
    setText(x, ttCountdown(at - now));
  }
}
/* dollars traded, short: $1.9B · $120M · $880k (Markets' own formatter where it is) */
const ttVol = (n) => (typeof mkVol === "function" ? mkVol(n) : money(n));

/** the bar's figures: the price (the venue's, live), the change (the venue's own, else the markets read's) — a US stock's is the day's,
 * from its last regular close (public-stocks.ts), so it is called the day's change, never a 24-hour one — the volume, and what the kind
 * adds: a perpetual's funding and its most leverage, a stock's session, an event's close; and where the venue's price is from, with when
 * once it is not the last minute or two's. With no account chosen for it, the row's figures are its row as the bar's beat last read it
 * again (TT.row, ttPoll: every five seconds while Trade shows, the read kept fifteen), else the freshest read of its kind's busiest that
 * lists it, never the row as it was when it was picked once either has it — and when the beat's last read failed, the kind's read where
 * it lists the row and is fresh (read after the beat last read it, and no older than a page that answers keeps it). A read that failed —
 * the venue's market, or the row with no fresh read of its kind listing it — is said under the figures, with when they were read */
function ttStats(el) {
  const box = el.querySelector("[data-tt-stats]");
  const tags = el.querySelector("[data-tt-tags]");
  if (!box) return;
  const x0 = TT.item;
  const row = x0 && TT.row && TT.row.key === x0.key ? TT.row : null;
  // the kind's own read that lists it (TK.got), and whether that read is fresh: newer than the beat's last read of the row, and no older
  // than a page that answers keeps one (each kind read again once fifteen seconds old, as the pane is drawn; the page drawn again every
  // twenty, shell.js REFRESH_MS). While the account does not answer, or a sheet is open, the pane is not drawn and the kinds' reads stand
  // still: their rows are older than the beat's last figures then, however they list the row
  const kindRead = x0 && x0.key ? Object.values(TK.got || {}).find((g) => g && Array.isArray(g.items) && g.items.some((y) => y.key === x0.key)) || null : null;
  const loaded = kindRead ? kindRead.items.find((y) => y.key === x0.key) : null;
  const fresh = !!kindRead && kindRead.at > TT.readAt && Date.now() - kindRead.at <= TK_READ_MS + REFRESH_MS;
  // the row read again for it while no account is chosen — unless that beat's last read failed and the kind's own read lists it, fresh;
  // a beat that failed with no fresh kind read shows its own last row, else the row as picked, never an older kind read under words that
  // say "since it was picked"; once an account is chosen, that beat has stopped and the kind's own read may be the fresher
  const x = !TT.at && (row || TT.said) && !(TT.said && fresh) ? row || x0 : loaded || row || x0;
  const m = TT.mk;
  if (!x) {
    paint(tags, "");
    paint(el.querySelector("[data-tt-said]"), "");
    paint(box, "");
    // no market: the feed says nothing either (never the last market's "Live" beside "Pick a market")
    return void ttFeed(el);
  }
  const ev = x.kind === "event";
  const stock = x.kind === "stock" || (!!m && m.kind === "stock");
  const perp = x.kind === "perp" || (!!m && m.kind === "perp");
  // the figures the change pairs with: the venue's market where it says the change, else the row's
  const base = m && m.changePct24h !== undefined ? m : x;
  const read = m ? (m.price ?? (m.bid !== undefined && m.ask !== undefined ? (m.bid + m.ask) / 2 : undefined)) : x.price;
  // the price the account's stream pushed for this market, where it is live and no older than the read (ttLiveFor): the price, the bid and
  // ask, a perpetual's funding, where it is from and its moment are the stream's, and the change is worked out at that price from the
  // venue's own reference (the read's price less its change: ttChangeAt)
  const live = ttLiveFor(m, perp);
  const price = live ? live.price : read;
  const moved = live ? ttChangeAt(live.price, base === m ? read : base.price, base.change24h, base.changePct24h) : null;
  const pct = moved ? moved.pct : m && m.changePct24h !== undefined ? m.changePct24h : x.changePct24h;
  const abs = moved ? moved.abs : m && m.change24h !== undefined ? m.change24h : x.change24h;
  const vol = live && live.volumeUsd24h !== undefined ? live.volumeUsd24h : m && m.volumeUsd24h !== undefined ? m.volumeUsd24h : x.volumeUsd24h;
  const bid = live && live.bid !== undefined ? live.bid : m ? m.bid : undefined;
  const ask = live && live.ask !== undefined ? live.ask : m ? m.ask : undefined;
  const funding = live && live.funding !== undefined ? live.funding : m ? m.fundingRate : undefined;
  // a perpetual's own figures (the stream's where it is live, else the market read's): its mark, its oracle, its open interest in dollars
  // at the mark, and the day's dollars traded
  const mark = perp ? (live && live.mark !== undefined ? live.mark : m ? m.markPrice : undefined) : undefined;
  const oracle = perp ? (live && live.oracle !== undefined ? live.oracle : m ? m.oraclePrice : undefined) : undefined;
  const oiCoins = perp ? (live && live.openInterest !== undefined ? live.openInterest : m ? m.openInterest : undefined) : undefined;
  const oiUsd = oiCoins !== undefined && mark !== undefined ? oiCoins * mark : m ? m.openInterestUsd : undefined;
  const quoteAt = live ? live.seenAt : m ? m.quoteAt : undefined;
  const quoteFrom = live ? live.from : m ? m.quoteFrom : undefined;
  const fmt = (n) => (ev ? tkCents(n) : px(n));
  const dir = pct === undefined ? "" : pct > 0 ? "up" : pct < 0 ? "down" : "";
  // the change at the market's own places (ttChangeFig): never the tail of a difference or of the venue's own change figure
  const step = m && Number(m.priceStep) > 0 ? Number(m.priceStep) : undefined;
  const change = pct !== undefined ? `${abs !== undefined ? `${abs > 0 ? "+" : abs < 0 ? "−" : ""}${esc(ev ? tkCents(Math.abs(abs)) : ttChangeFig(Math.abs(abs), step, [price, read, bid, ask]))} / ` : ""}${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%` : "";
  // how old the price is, beside it, once it is not the last few seconds' (a paper quote is the public source's as its venue last
  // answered: core ageWords) — and on hover where it is from and when
  const age = quoteAt ? ageWords(quoteAt) : "";
  // a pushed price tinted by the way its last tick went (up, down; none until it has moved, and none for a price read)
  const tick = live ? ttTick(price) : "";
  const parts = [
    ttStat("Price", price !== undefined ? `${esc(fmt(price))}${age ? ` <span class="tt-age"${quoteFrom ? ` title="${esc(`${quoteFrom}'s price, ${age}`)}"` : ""}>${esc(age)}</span>` : ""}` : "", `tt-px${tick ? ` ${tick}` : ""}`),
    ttStat(stock ? "Day change" : "24h change", change, dir, "", TT_DROP.change),
    ttStat("24h volume", vol !== undefined ? esc(ttVol(vol)) : x.contracts24h !== undefined ? `${esc(String(x.contracts24h))} contracts` : "", "", "", TT_DROP.volume),
  ];
  // a perpetual as Hyperliquid's bar says it: its mark, its oracle, its open interest
  if (mark !== undefined) parts.push(ttStat("Mark", esc(fmt(mark)), "", TT_MARK_SAYS, TT_DROP.mark));
  if (oracle !== undefined) parts.push(ttStat("Oracle", esc(fmt(oracle)), "", TT_ORACLE_SAYS, TT_DROP.oracle));
  if (oiUsd !== undefined) parts.push(ttStat("Open interest", `<span${oiCoins !== undefined ? ` title="${esc(`${qtyOf(oiCoins)} ${x.base || ""}`.trim())}"` : ""}>${esc(ttVol(oiUsd))}</span>`, "", TT_OI_SAYS, TT_DROP.oi));
  if (bid !== undefined && ask !== undefined && !ev) parts.push(ttStat("Bid · Ask", `${esc(px(bid))} · ${esc(px(ask))}`, "", "", TT_DROP.bidask));
  // funding as HL colours it — a positive rate in the accent, a negative one in the down colour — and, beside it, the time left until it is
  // next paid, counting down each second (ttCountdowns); when that is, and what the rate comes to over a year, on hover
  if (perp && (m || live) && funding !== undefined) {
    const next = ttNextFunding(m);
    const everyH = m && Number(m.fundingEveryH) > 0 ? Number(m.fundingEveryH) : 0;
    const year = everyH ? ` At this rate a year comes to ${(funding * (8760 / everyH) * 100).toFixed(2)}%.` : "";
    const when = next !== undefined ? ` Next paid at ${nyTime(new Date(next).toISOString())} New York${everyH ? `, then every ${everyH === 1 ? "hour" : `${everyH} hours`}` : ""}.` : "";
    parts.push(ttStat(next !== undefined ? "Funding / Countdown" : "Funding", `<span class="${funding > 0 ? "acc" : funding < 0 ? "down" : ""}">${(funding * 100).toFixed(4)}%</span>${next !== undefined ? ` <span class="tt-count" data-tt-count="${next}" data-tt-every="${everyH * 3_600_000}">${esc(ttCountdown(next - Date.now()))}</span>` : ""}`, "", `${TT_FUNDING_SAYS}${when}${year}`, TT_DROP.funding));
  }
  if (m && m.session) parts.push(ttStat("Session", esc(ttSessionWord(m.session)), "", "", TT_DROP.session));
  if (ev && x.closeTime) parts.push(ttStat("Closes", esc(`${nyDay(x.closeTime)} ${nyTime(x.closeTime)} New York`), "", "", TT_DROP.closes));
  // where the price is from, and — once it is not the last minute or two's — when it is from, as Markets says it (ui/markets.js
  // mkQuoteWords): "real time" is the source, not the price's age, and a real-time source's last trade in pre-market can be yesterday's
  if (quoteFrom) parts.push(ttStat("Price from", esc(typeof mkQuoteWords === "function" ? mkQuoteWords(quoteFrom, quoteAt) : quoteFrom), "", "", perp ? TT_DROP.fromPerp : TT_DROP.from));
  paint(box, parts.join(""));
  // set aside as many figures as do not fit — measured again only when what is shown changed shape (a figure more or less, a word longer
  // or shorter): a pushed price that moved by a tick is the same shape, and its figures are set aside as they were, with nothing measured
  ttFitStats(box, ttShape(parts));
  ttFeed(el);
  // the venue's market (or, no account chosen, the row) not read on the last beat: the figures above are the last read's, and the status
  // strip at the terminal's foot says since when — or since the market was picked, before any beat read it — with the source's words. A row
  // its kind's own fresh read lists is shown from that read: nothing to say of it
  // A read refused or not answered says, too, how long the bar now waits between asks (ttWaitMs)
  const again = TT.fails > 0 ? `. Asking again every ${Math.round(ttWaitMs() / 1000)} s.` : "";
  paint(el.querySelector("[data-tt-said]"), TT.said && (TT.at ? !!m : !fresh) ? esc(`Not read again since ${TT.readAt ? `${nyTime(new Date(TT.readAt).toISOString())} New York` : "it was picked"}: ${TT.said.replace(/[.\s]+$/, "")}${again}`) : "");
  // where the order goes, and how far a perpetual may be levered there. Who trades — the owner here, or the account's desk on a paper
  // account — is the topbar's Regular · Superagent switch (account.html #trade-mode), never a control of this bar
  const v = TT.at ? A.venues.find((y) => y.id === TT.at.venue) : null;
  paint(tags, `${m && m.maxLeverage && m.maxLeverage > 1 ? `<span class="tag tt-lev" title="The most leverage ${esc(v ? (v.paper ? tkPaperless(v.name) : v.name) : "the venue")} takes in this market">${esc(String(m.maxLeverage))}x</span>` : ""}${v ? `<span class="tt-where">${esc(v.paper ? tkPaperless(v.name) : v.name)}${v.paper ? ' <span class="tag paper">Paper</span>' : ""}</span>` : ""}`);
}
/* how old a position's mark is, beside it, once it is not the last few seconds' (core ageWords): a paper account's mark is its market's
   public quote as its venue last answered (Position.native.markAt) — never an old mark passed off as now. "" where none says */
function ttMarkAge(p) {
  const at = p && p.native && typeof p.native === "object" ? p.native.markAt : undefined;
  const age = typeof at === "number" ? ageWords(at) : "";
  return age ? ` <span class="tt-age">${esc(age)}</span>` : "";
}
/* a stock's session in a word or two: what is on now and until when, New York time */
function ttSessionWord(s) {
  const ph = s.phase && s.phase !== "regular" && s.phase !== "closed" ? s.phase : "";
  const until = s.phaseEndsAt ? ` until ${nyTime(s.phaseEndsAt)}` : "";
  if (ph) return `${{ pre: "Pre-market", after: "After-hours", overnight: "Overnight" }[ph] || ph}${until}`;
  if (s.open) return `Open${s.closesAt ? ` until ${nyTime(s.closesAt)}` : ""}`;
  return `Closed${s.opensAt ? ` · opens ${nyDay(s.opensAt)} ${nyTime(s.opensAt)}` : ""}`;
}

/* ---- the markets this tab shows, and what the stream pushes of them (feat/paper-live p2b) ------------------------------------------ */

/** THE MARKETS THIS TAB SHOWS, said on the account's stream (ui/stream.js stFollow) in place of what it said before: while the Trade pane is
 * the one showing, the market the bar, the chart and the book show (TT.followKey, set as they are mounted: whole — its quote, book and
 * trades) and, while Positions is the tab under the panels, the markets of the positions listed there (TT.posKeys: their price alone, each
 * row's mark); on any other pane, none. A tab that is hidden closes its stream, and the account lets go of them all until it shows again
 * (ui/stream.js). Called as the market showing changes, as the positions read lists others, as the tab under the panels changes and as the
 * page moves between panes */
function ttFollow() {
  if (typeof stFollow !== "function") return;
  // the Superagent's floor follows its own markets (ui/superagent.js sgFollow)
  if (ROUTE.tab === "superagent") return;
  const on = ROUTE.tab === "trade";
  const main = on && TT.followKey ? TT.followKey : "";
  const marks = on && TT.tab === "positions" ? (TT.posKeys || []).filter((k) => k !== main) : [];
  stFollow(main ? [main] : [], marks);
}
if (typeof onRoute === "function") onRoute((tab, params) => {
  // the chart filling the window comes back to the page as the page leaves Trade: its frame would lie over the next pane
  if (tab !== "trade" && typeof chFull === "function") {
    const pane = $("pane-trade");
    const chart = pane && typeof pane.querySelector === "function" ? pane.querySelector("[data-tt-chart]") : null;
    if (chart) chFull(chart, false);
  }
  // the chart's range and bar size the address names (#/trade?…&range=3M&iv=4h: a link shared, a reload) are the ones it mounts with
  if (tab === "trade" && params) {
    if (typeof CH_RANGE_BAR === "object" && CH_RANGE_BAR[params.range]) TT.range = params.range;
    if (typeof CH_MS === "object" && CH_MS[params.iv]) TT.interval = params.iv;
    // the indicators the address names (ind=sma:20,rsi:14) are the ones the chart mounts with, and this browser keeps them from here on
    if (typeof params.ind === "string" && typeof inParse === "function") {
      TT.ind = inString(inParse(params.ind));
      ttIndKeep(TT.ind);
    }
  }
  ttFollow();
});

/** THE ADDRESS SAYS WHAT SHOWS: the kind, the market where an account is chosen for it (its venue and symbol — the link opens the ticket on
 * it, as a Markets row's does: ui/trade.js), the chart's range and bar size (range, iv) — written in place (replaceState: no new entry in the
 * browser's history, no route moved, nothing drawn again), so a reload, or the link shared, comes back to the same market and chart. A
 * market with no account chosen for it is named by its kind alone. Only while Trade is the pane showing */
function ttUrl() {
  if (!A || ROUTE.tab !== "trade" || typeof history === "undefined" || typeof history.replaceState !== "function" || typeof hashOf !== "function") return;
  // a venue no longer on the account (disconnected while its market showed) is not written: a reload or a link would name an account that
  // is not there (ui/trade.js tkRouteVenue reads such an address anyway)
  const at = TT.at && (A.venues || []).some((v) => v.id === TT.at.venue) ? TT.at : null;
  // the address already names this very market at an account of yours, and the ticket has not read it there (yet, or at all: a share's
  // market read while its market is shut): the address keeps naming it, so a reload comes back to the share it showed and not to the
  // kind's first market. Only where the market showing lists that venue and symbol, and the venue is on the account
  const rp = ROUTE.params || {};
  const named = !at && TT.item && rp.venue && rp.symbol && (A.venues || []).some((v) => v.id === rp.venue) && Array.isArray(TT.item.at) && TT.item.at.some((a) => a && a.venue === rp.venue && a.symbol === rp.symbol) ? { venue: rp.venue, symbol: rp.symbol } : null;
  // a market the address named at an account the restart has not brought back yet (ui/trade.js tkWaitsForRestore): still named, so the
  // reload or link that asked for it keeps asking for it
  const waiting = !at && !named && typeof tkWaitsForRestore === "function" && TK.pending && TK.pending.symbol && tkWaitsForRestore(TK.pending) ? { venue: TK.pending.venue, symbol: TK.pending.symbol } : null;
  const where = at || named || waiting;
  const params = { ...(TK.kind ? { kind: TK.kind } : {}), ...(where ? { venue: where.venue, symbol: where.symbol } : {}), ...(TT.range ? { range: TT.range } : {}), ...(TT.interval ? { iv: TT.interval } : {}), ...(TT.ind ? { ind: TT.ind } : {}) };
  const h = hashOf("trade", params);
  if (location.hash === h) return;
  // the ticket is on this market already: the route naming it opens nothing again (ui/trade.js onRoute, TK.routed)
  if (at) TK.routed = JSON.stringify([params.kind || "", params.venue || "", params.symbol || "", "", ""]);
  history.replaceState(null, "", h);
  ROUTE.params = { ...params };
}

/** THE ACCOUNT'S OWN LINES ON THE CHART (chart.js chLines) for the market showing, once an account is chosen for it: each of the account's
 * orders resting there — a limit at its limit, a stop at its trigger (a stop-limit's limit too), a trailing stop where its stop stands now, a
 * bracket's exits as TP and SL — and the position held there: its entry and its liquidation price (ttLinesFor). An order that changes in
 * place from here (ui/trade.js tkAmendable, in the owner's browser on a server that places orders) may be pulled on the chart; let go, its
 * change opens at that price to be SIGNED (ttLineDragged → openAmend): nothing moves until it is. Drawn again as the orders and positions
 * change (ttPushed, ttDraw) and as the market showing does (ttMount) */
function ttLinesDraw() {
  const el = $("pane-trade");
  const chart = el && typeof el.querySelector === "function" ? el.querySelector("[data-tt-chart]") : null;
  if (!chart || typeof chLines !== "function") return;
  if (!TT.at || !A) return void chLines(chart, []);
  chLines(chart, ttLinesFor(TT.at, A.orders || [], ttPosNow(), owns() && writesOn()), { onDrag: ttLineDragged });
}
/** the lines for one market (`at`: venue and symbol) from the account's orders and the positions read — pure, so the tests read it */
function ttLinesFor(at, orders, positions, canAmend = false) {
  const out = [];
  if (!at) return out;
  const left = (o) => qtyOf(Math.max(0, Number(o.qty) - Number(o.filledQty || 0)));
  for (const o of orders || []) {
    if (!o || o.venue !== at.venue || o.symbol !== at.symbol || !isLive(o) || o.canceling) continue;
    const exit = o.exitOf ? o.exitOf.kind : "";
    const side = o.side === "sell" ? "Sell" : "Buy";
    const way = o.side === "sell" ? "sell" : "buy";
    const amend = canAmend && typeof tkAmendable === "function" && tkAmendable(o);
    if (o.type === "limit" && Number(o.limitPrice) > 0) out.push({ id: `${o.id}:limit`, ref: o.id, price: Number(o.limitPrice), kind: exit === "take-profit" ? "tp" : way, label: exit === "take-profit" ? `TP ${left(o)}` : `Limit ${side} ${left(o)}`, short: exit === "take-profit" ? `TP ${left(o)}` : `${side} ${left(o)}`, ...(amend ? { drag: "limitPrice" } : {}) });
    else if ((o.type === "stop" || o.type === "stop_limit") && Number(o.stopPrice) > 0) {
      out.push({ id: `${o.id}:stop`, ref: o.id, price: Number(o.stopPrice), kind: exit === "stop-loss" ? "sl" : way, label: exit === "stop-loss" ? `SL ${left(o)}` : `Stop ${side} ${left(o)}`, short: exit === "stop-loss" ? `SL ${left(o)}` : `Stop ${left(o)}`, ...(amend ? { drag: "stopPrice" } : {}) });
      if (o.type === "stop_limit" && Number(o.limitPrice) > 0) out.push({ id: `${o.id}:limit`, ref: o.id, price: Number(o.limitPrice), kind: way, label: `Stop-limit ${side} ${left(o)}`, short: `Stop ${left(o)}`, ...(amend ? { drag: "limitPrice" } : {}) });
    } else if (o.type === "trailing_stop" && Number(o.stopPrice) > 0) out.push({ id: `${o.id}:trail`, ref: o.id, price: Number(o.stopPrice), kind: "trail", label: `Trailing ${side} ${left(o)}`, short: `Trail ${left(o)}` });
  }
  const p = (positions || []).find((x) => x && x.venue === at.venue && x.symbol === at.symbol && x.qty > 0);
  if (p && Number(p.entryPrice) > 0) out.push({ id: "pos:entry", price: Number(p.entryPrice), kind: "entry", label: `${p.side === "short" ? "Short" : "Long"} ${qtyOf(p.qty)} · entry`, short: "Entry" });
  if (p && Number(p.liquidationPrice) > 0) out.push({ id: "pos:liq", price: Number(p.liquidationPrice), kind: "liq", label: "Liq. price", short: "Liq." });
  return out;
}
/* a line let go where it was pulled to: its order's change, opened at that price — prepared by the account and signed by the owner, as Change
   opens it (ui/trade.js openAmend); an order that cannot be changed from here now is left as it is */
function ttLineDragged(line, price) {
  const o = A && line ? (A.orders || []).find((x) => x.id === line.ref) : null;
  if (!o || !owns() || typeof openAmend !== "function" || (typeof tkAmendable === "function" && !tkAmendable(o)) || !(price > 0)) return;
  openAmend(o, { [line.drag]: price });
}
/* the positions as last read (any tab's read of them: TT.posRead), asked for — kept ten seconds — where none is, or it is older: the chart's
   lines are drawn again when it lands */
function ttPosNow() {
  const b = TT.posRead;
  if ((!b || Date.now() - (TT.posReadAt || 0) > 10_000) && !TT.posAsking && A && typeof api === "function") {
    TT.posAsking = true;
    api("/api/account/positions", { ttl: 10_000 }).then((r) => {
      TT.posAsking = false;
      TT.posRead = r;
      TT.posReadAt = Date.now();
      ttLinesDraw();
    }, () => (TT.posAsking = false));
  }
  return b && b.ok !== false ? b.positions || [] : [];
}

/* the latest quote the stream pushed for the bar's market (live or not; null where it pushed none, or the stream is not connected) — only
   ever the market showing NOW: the bar is drawn as soon as another market or another venue is picked, before the chart and the book are
   mounted on it (ttMount, which follows it in place of the last), so a quote kept under the key followed until then is another market's
   price and never this one's */
function ttLiveQuote() {
  if (!TT.followKey || typeof stQuoteOf !== "function" || ttShownKey() !== TT.followKey) return null;
  const i = TT.followKey.indexOf(":");
  return stQuoteOf(TT.followKey.slice(0, i), TT.followKey.slice(i + 1));
}
/* the stream pushes the bar's market now: a live quote came within TT_PUSH_FRESH_MS */
function ttPushedNow() {
  const q = ttLiveQuote();
  return !!q && q.live === true && Date.now() - Number(q.gotAt || 0) < TT_PUSH_FRESH_MS;
}
/** THE BAR'S PUSHED PRICE: the stream's latest quote for the market showing while it is live there — the price it stands for (ui/stream.js
 * stPrice: a perpetual's middle, a coin's last trade), its bid and ask, its funding, the moment the stream last confirmed it and where it is
 * from — or null: none pushed, not live, or older than the market as last read (`m`, by its own moment), which then stands */
function ttLiveFor(m, perp) {
  const q = ttLiveQuote();
  if (!q || q.live !== true || typeof stPrice !== "function") return null;
  const price = stPrice(q, perp);
  if (!(price > 0)) return null;
  const seen = Date.parse(String(q.seenAt || q.at || ""));
  const own = m ? Date.parse(String(m.quoteAt || "")) : NaN;
  if (Number.isFinite(own) && Number.isFinite(seen) && seen < own) return null;
  const pos = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
  const nonNeg = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const figures = { mark: pos(q.mark), oracle: pos(q.oracle), openInterest: nonNeg(q.openInterest), volumeUsd24h: nonNeg(q.volumeUsd24h) };
  return { q, price, bid: pos(q.bid), ask: pos(q.ask), ...(typeof q.funding === "number" && Number.isFinite(q.funding) ? { funding: q.funding } : {}), ...Object.fromEntries(Object.entries(figures).filter(([, v]) => v !== undefined)), seenAt: Number.isFinite(seen) ? new Date(seen).toISOString() : undefined, from: typeof q.from === "string" ? q.from : "" };
}
/** THE CHANGE AT A PRICE THE STREAM SAYS NOW, from the venue's own reference — its price 24 hours ago, a share's last regular close — as the
 * figures read last give it: their price less their change (or, with no change in their currency, their price over one and their percent).
 * Nothing is assumed but that the reference has not moved since that read. Null where they give no reference */
function ttChangeAt(price, p0, abs0, pct0) {
  const p = Number(price);
  const b = Number(p0);
  if (!(p > 0) || !(b > 0)) return null;
  let ref = NaN;
  if (abs0 !== undefined && abs0 !== null && Number.isFinite(Number(abs0))) ref = b - Number(abs0);
  else if (pct0 !== undefined && pct0 !== null && Number.isFinite(Number(pct0))) ref = b / (1 + Number(pct0) / 100);
  if (!(ref > 0)) return null;
  const abs = Number((p - ref).toPrecision(12));
  return { abs, pct: (abs / ref) * 100 };
}
/* the way the bar's pushed price last moved — "up" or "down", kept until it moves the other way; "" until it has moved on this market */
function ttTick(price) {
  const t = TT.tick && TT.tick.key === TT.followKey ? TT.tick : null;
  if (!t) {
    TT.tick = { key: TT.followKey, px: price, dir: "" };
    return "";
  }
  if (price !== t.px) t.dir = price > t.px ? "up" : "down";
  t.px = price;
  return t.dir;
}

/* a short age, as the feed says it: 0.4 s under a second, 12 s, 3 min, 2 h */
function ttAgeShort(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < 1000) return `${(Math.floor(n / 100) / 10).toFixed(1)} s`;
  if (n < 60_000) return `${Math.floor(n / 1000)} s`;
  if (n < 3_600_000) return `${Math.floor(n / 60_000)} min`;
  return `${Math.floor(n / 3_600_000)} h`;
}
/** THE FEED'S WORDS for the bar's market: how its price comes now, in a word — `state` "live" (pushed: its venue's stream moves it),
 * "quiet" (the stream carries it and is not live there now), "polling" (read every few seconds) — how old the price showing is (`ageMs`, ""
 * where nothing says), and on hover what that means, where the price is from (`from`), why it is read rather than pushed (`why`), how a
 * US share's real-time quote comes where no venue streams it — `every`, how often its source writes it, where it is read as it is written
 * (Robinhood's), or `asks`, how often the account asks a source that writes nothing on a cadence of its own and stamps its last trade to the
 * minute (Nasdaq's) — and how long pushed prices take to reach this screen (`lag`: ui/stream.js stLag). Returns { st (the dot's state),
 * word, age, title } */
function ttFeedWords(state, ageMs, { from = "", why = "", lag = null, every = 0, asks = 0 } = {}) {
  const src = String(from || "").replace(/\s*·\s*(live|real time)$/, "") || "its venue";
  const age = Number.isFinite(ageMs) ? ttAgeShort(ageMs) : "";
  const said = lag && lag.n ? ` Prices pushed reach this screen about ${ttMsWords(lag.p50)} after their venue's own moment (the middle of the last ${lag.n}; 95 in 100 within ${ttMsWords(lag.p95)}).` : "";
  // a price no venue streams — a US share's real-time quote, which its source writes anew every `every` ms and the account reads as it is
  // written (live/us-quotes.ts) — said as what it is: its age is its own stamp's, since it last moved
  if (every > 0 && state === "live") return { st: "connected", word: "Live", age, title: `Live: ${src} writes its real-time quotes about every ${Math.round(every / 1000)} s; the account reads each as it is written and pushes it here as it moves${age ? `. This price has stood ${age}` : ""}.${said}` };
  if (every > 0 && state === "quiet") return { st: "stale", word: "Quiet", age, title: `Quiet: no real-time quote from ${src} has moved for this market just now; the price is its last${age ? `, ${age} old` : ""}, and the account reads the market's line instead until one does.${said}` };
  // one the account ASKS for every `asks` ms (Nasdaq's quote page): its source writes nothing on a cadence, and its stamp is its last
  // trade's, to the minute — so its age is that trade's, never how often it is asked
  if (asks > 0 && state === "live") return { st: "connected", word: "Live", age, title: `Live: the account asks ${src} for its real-time quote about every ${Math.round(asks / 1000)} s and pushes it here as it moves; ${src} stamps it with its last trade, to the minute${age ? ` — this one ${age} ago` : ""}.${said}` };
  if (asks > 0 && state === "quiet") return { st: "stale", word: "Quiet", age, title: `Quiet: ${src} has no fresh real-time quote for this market just now; the price is its last trade${age ? `, ${age} ago` : ""}, and the account reads the market's line instead until it has one.${said}` };
  if (state === "live") return { st: "connected", word: "Live", age, title: `Live: ${src}'s own stream pushes this price as it moves${age ? `; ${age} since it last confirmed it` : ""}.${said}` };
  if (state === "quiet") return { st: "stale", word: "Quiet", age, title: `Quiet: ${src}'s stream has not spoken for this market just now; the price is its last word${age ? `, ${age} old` : ""}, and the account reads it instead until the stream is live again.${said}` };
  return { st: "down", word: "Polling", age, title: `Polling: ${why || "this market's price is read every few seconds"}${age ? `; the price showing is ${age} old` : ""}.` };
}
const ttMsWords = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
/** the feed at the bar's right end drawn (ttFeedWords): from the bar's pushed quote where there is one, else from the market's read — its
 * own moment where it says one, else when it was read. A pushed word with no moment in it (the account's `{ live: false }`: the stream
 * carries the market and has no quote of it now — a US share at the weekend, or one only Cboe's delayed quote prices) is no quote: the
 * market's read says the price's age then, as it does with no stream. Nothing for no market. Its words are set in place (a fixed box:
 * nothing beside it moves) */
function ttFeed(el) {
  const box = el && typeof el.querySelector === "function" ? el.querySelector("[data-tt-feed]") : null;
  if (!box) return;
  if (!TT.item) return void paint(box, "");
  const pushed = ttLiveQuote();
  const q = pushed && Number.isFinite(Date.parse(String(pushed.seenAt || pushed.at || ""))) ? pushed : null;
  const now = Date.now();
  const health = typeof stHealth === "function" ? stHealth() : "down";
  let w;
  const every = q && Number(q.everyMs) > 0 ? Number(q.everyMs) : 0;
  const asks = q && Number(q.askedEveryMs) > 0 ? Number(q.askedEveryMs) : 0;
  if (q && q.live === true) w = ttFeedWords("live", now - Date.parse(String(q.seenAt || q.at || "")), { from: q.from, lag: typeof stLag === "function" ? stLag() : null, every, asks });
  else if (q) w = ttFeedWords("quiet", now - Date.parse(String(q.seenAt || q.at || "")), { from: q.from, lag: typeof stLag === "function" ? stLag() : null, every, asks });
  else {
    const m = TT.mk;
    const own = m ? Date.parse(String(m.quoteAt || "")) : NaN;
    const at = Number.isFinite(own) ? own : TT.readAt || NaN;
    const why = health !== "connected" ? "the account's stream is not connected, so this market's price is read every few seconds" : pushed ? "the account's stream has no quote of this market just now, so its price is read every few seconds" : TT.at ? "the account's stream does not carry this market, so its price is read every few seconds" : "until an account is chosen for it, its listing is read every few seconds";
    w = ttFeedWords("polling", Number.isFinite(at) ? now - at : NaN, { why });
  }
  paint(box, `<span class="tt-feed-w">${esc(w.word)}</span><span class="tt-feed-a">${esc(w.age)}</span>`);
  if (box.dataset) box.dataset.st = w.st;
  if (box.setAttribute) box.setAttribute("title", w.title);
}
/* the feed's age follows the clock: once a second while Trade shows (core everySecond; its write in the second's frame) */
let ttFeedClock = null;
function ttFeedTicks() {
  if (ttFeedClock || typeof everySecond !== "function" || (typeof requestAnimationFrame !== "function" && typeof setInterval !== "function")) return;
  ttFeedClock = everySecond(() => (ROUTE.tab === "trade" && TT.item && !document.hidden ? () => (ttFeed($("pane-trade")), ttCountdowns($("pane-trade"))) : undefined));
}

/** A QUOTE THE STREAM PUSHED (ui/stream.js; kept there as the market's latest): the bar's market's moves the bar — its figures, the feed —
 * and a position's moves its row, both in the next frame however many came meanwhile. The bar's market no longer live there: the read of it
 * is back on its own beat — brought forward to five seconds from then where the pushes had slowed it, never put back by the next such
 * word (ttPollSooner) */
function ttHeard(q) {
  if (!q || typeof q.venue !== "string" || ROUTE.tab !== "trade") return;
  const k = `${q.venue}:${q.symbol}`;
  if (k === TT.followKey) {
    TT.due.bar = true;
    if (q.live !== true) ttPollSooner();
    else TT.due.lag = q;
  }
  if (TT.tab === "positions" && (TT.posKeys || []).includes(k)) TT.due.pos = true;
  if (TT.due.bar || TT.due.pos) ttSoon();
}
/* what the stream pushed drawn once, in the next frame: the bar (and the pushed quote it shows counted as drawn: stDrawn), the positions */
function ttSoon() {
  if (TT.due.frame) return;
  TT.due.frame = true;
  nextFrame(() => {
    TT.due.frame = false;
    const el = $("pane-trade");
    if (!el || ROUTE.tab !== "trade") return;
    if (TT.due.bar) {
      TT.due.bar = false;
      ttStats(el);
      if (TT.due.lag && typeof stDrawn === "function") stDrawn(TT.due.lag);
      TT.due.lag = null;
    }
    if (TT.due.pos) {
      TT.due.pos = false;
      const box = el.querySelector('[data-tt-tab="positions"]');
      if (box && box.ttRead && TT.tab === "positions") ttPosDraw(box);
    }
  });
}
if (typeof stOn === "function") {
  stOn("quote", ttHeard);
  // the stream no longer connected: the bar's read back on its beat (brought forward, never put back), and the feed says so at once
  stOn("health", (h) => {
    if (ROUTE.tab !== "trade" || !TT.item) return;
    if (h !== "connected") ttPollSooner();
    ttFeed($("pane-trade"));
  });
}

/** WHAT THE ACCOUNT PUSHED, drawn in place (shell.js shPatch, a frame after an order's state, a fill, a position or the cash came): the
 * tabs under the panels as the page now holds them — the positions read kept (the pushed row laid in it), the open orders (A.orders), the
 * history tabs (the statement read again) — each row by its key, and the ticket's Available and Current position. Nothing else: the
 * ticket's fields, the picker, the chart and the book are not drawn again, so a field being typed in keeps its words and its focus */
function ttPushed() {
  const el = $("pane-trade");
  if (!A || ROUTE.tab !== "trade" || !el || !el.querySelector("[data-tp]")) return;
  ttLow(el, owns());
  ttLinesDraw();
  if (typeof TK.refreshAvail === "function") TK.refreshAvail();
}

/** the tabs under the panels, drawn from what is known now: what is held (positions, at the venues in the lens), the orders open (the
 * pane's Under way, ui/trade.js), what filled and every order placed (the statement's trades) */
function ttLow(el, owner) {
  if (!ttTabs(el)) return;
  for (const t of el.querySelectorAll("[data-tt-tab]")) t.hidden = t.dataset.ttTab !== TT.tab;
  if (TT.tab === "positions") ttPositions(el.querySelector('[data-tt-tab="positions"]'), owner);
  else if (TT.tab === "open") tkDrawOpen(el.querySelector('[data-tt-tab="open"]'), owner);
  else if (TT.tab === "orders") ttOrders(el.querySelector('[data-tt-tab="orders"]'));
  else if (TT.tab === "funding") ttFunding(el.querySelector('[data-tt-tab="funding"]'));
  else ttHistory(el.querySelector('[data-tt-tab="history"]'));
}
/* the tab bar under the panels: each tab with how many it holds where that is known — the orders open in the lens, and the positions as
   last read (TT.posN, set as Positions draws them): a table that scrolls inside a short window still says how many rows it has. False when
   the frame has no tab bar */
function ttTabs(el) {
  const tabs = el && typeof el.querySelector === "function" ? el.querySelector("[data-tt-tabs]") : null;
  if (!tabs) return false;
  const n = (v) => (v === "open" ? ttOpenCount() : v === "positions" ? TT.posN || 0 : 0);
  paint(tabs, TT_TABS.map(([v, t]) => `<button type="button" role="tab" data-tt-to="${v}" aria-selected="${String(TT.tab === v)}">${esc(t)}${n(v) ? ` <span class="tt-n">${n(v)}</span>` : ""}</button>`).join(""));
  // the line under the tab showing slides to it (book.js bkSlideUnder: HL's tab bars)
  if (typeof bkSlideUnder === "function") bkSlideUnder(tabs);
  return true;
}
/* the orders still open in the lens — the ones Under way lists (ui/trade.js tkOpenOrders: an agent's lens keeps that agent's) */
const ttOpenCount = () => (A && Array.isArray(A.orders) ? tkOpenOrders().length : 0);

/* ---- a price written as its market writes it ------------------------------------------------------------------------------------- */
/** the decimal places a figure is written in, with no binary tail (62,481.70000001 counts 1, 0.1 + 0.2 counts 1); not a figure: undefined */
function ttDecimals(x) {
  const n = Number(x);
  if (x === undefined || x === null || x === "" || !Number.isFinite(n)) return undefined;
  if (n === 0) return 0;
  const [m, e] = Number(n.toPrecision(10)).toExponential().split("e");
  return Math.max(0, (m.split(".")[1] || "").length - Number(e));
}
/** a market's own price step where this page has read that market: the one showing (TT.mk, where the order goes), else its last read kept
 * by the page (core api: the ticket, the bar and the close sheet read a market at the one path, GET /api/account/market?venue=&symbol=).
 * Nothing is asked for it here: a market not read on this page has no step known (undefined) */
function ttStepOf(venue, symbol) {
  if (!venue || !symbol) return undefined;
  if (TT.at && TT.mk && TT.at.venue === venue && TT.at.symbol === symbol && Number(TT.mk.priceStep) > 0) return Number(TT.mk.priceStep);
  const hit = typeof API !== "undefined" && API && typeof API.get === "function" ? API.get(`/api/account/market?${new URLSearchParams({ venue, symbol })}`) : null;
  const m = hit && hit.body && hit.body.ok !== false ? hit.body.market : null;
  return m && Number(m.priceStep) > 0 ? Number(m.priceStep) : undefined;
}
/** A PRICE AS ITS MARKET WRITES IT, grouped en-US — the positions, the two history tabs: to the decimals of the market's own price step
 * where it is known (an average of fills, 62,548.88617 on a 0.1 step, reads 62,548.9; a price on its step is written to it, as the book
 * writes its levels: 60,520.0); with no step known, to the decimals the venue writes the same market's own prices in (`like`: the mark, the
 * liquidation price, a limit — never more than the figure has); with neither, six significant figures. No tail no venue quotes is printed.
 * Returns the words and, when they round the figure, the figure as it came (core px) for the hover, so nothing is hidden: { text, exact } */
function ttFig(n, { step, like = [] } = {}) {
  const v = Number(n);
  if (n === undefined || n === null || n === "" || !Number.isFinite(v)) return { text: "—", exact: "" };
  const own = ttDecimals(v) ?? 0;
  let dec;
  let pad = false;
  if (Number(step) > 0) {
    dec = Math.min(8, ttDecimals(step) ?? 0);
    pad = true;
  } else {
    const seen = like.map(ttDecimals).filter((d) => d !== undefined);
    // what the other figures of the market show is a hint, never a cap: a mark that lands on a round figure (62,498) drops its
    // trailing zeros, and the entry beside it must not lose its decimals with it (and flicker back on the next read) — so a figure keeps
    // at least six significant figures of its own, up to the decimals it has
    const sig = Math.max(0, 6 - (Math.floor(Math.log10(Math.abs(v) || 1)) + 1));
    dec = Math.min(own, seen.length ? Math.max(sig, ...seen) : sig);
  }
  return { text: v.toLocaleString("en-US", { minimumFractionDigits: pad ? dec : 0, maximumFractionDigits: dec }), exact: dec < own ? px(v) : "" };
}
/** A CHANGE AS ITS MARKET WRITES ITS PRICES — the bar's 24h or day change: to the decimals of the market's price step where it says one,
 * else to the most the prices shown beside it are written in (`like`: the price, the read, the bid and ask) — but never fewer than keep
 * four significant figures of the change (so a small coin's change does not lose a digit each time its price ends in a zero), never more
 * than eight and never more than the figure has. The tail a difference or a venue's own change figure carries is not printed:
 * 2,027.934895 on a 0.01 step reads 2,027.93; beside a price of 0.08321 a change of 0.002031455 reads 0.002031; beside a round 250 a
 * change of 2.5 stays 2.5 */
function ttChangeFig(n, step, like = []) {
  const v = Number(n);
  if (n === undefined || n === null || n === "" || !Number.isFinite(v)) return "—";
  if (Number(step) > 0) {
    const dec = Math.min(8, ttDecimals(step) ?? 0);
    return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  const own = ttDecimals(v) ?? 0;
  const seen = like.map(ttDecimals).filter((d) => d !== undefined);
  const four = Math.max(0, 4 - (Math.floor(Math.log10(Math.abs(v) || 1)) + 1));
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.min(8, own, Math.max(four, ...seen)) });
}
/* Positions: everything held at the venues in the lens that the venues list as positions — a perpetual, a share, a coin a paper account
   holds, an event contract — with its entry, its mark, what it is worth and its result, in HL's columns (Market · Size · Position value ·
   Entry price · Mark price · PNL (ROE %) · Liq. price); the venue it is held at beside its name, quieter. Close… is the close sheet (ui/trade.js
   openClose). Each cell carries its column's class, so a narrow terminal lays a position out on two lines (terminal.css): the market and its
   result, then its size and mark with the button. A venue whose positions could not be read is named under them with its own words (one
   that does not serve this network, in one quiet line); while one is missing, "nothing held" is said only of the venues that answered */
function ttPositions(box, owner) {
  if (!box) return;
  // the first read on its way: rows of grey in the table's place, never an empty table that says nothing is held
  if (!box.ttRead) paint(box, ttLoadingHtml("positions"));
  api("/api/account/positions", { ttl: 10_000 }).then((b) => {
    // the chart's lines read the same positions (ttPosNow)
    TT.posRead = b;
    TT.posReadAt = Date.now();
    if (!box.isConnected || TT.tab !== "positions") return;
    // the read kept with the table: a pushed price draws the rows again from it (ttPosDraw), asking nothing
    box.ttRead = b;
    box.ttOwner = owner;
    ttPosDraw(box);
  });
}
/* A TABLE BEING READ for the first time (Positions, the two histories): a few grey rows where its rows will be, said to a screen reader as
   being read — never a table that says nothing is there before it was asked */
const ttLoadingHtml = (what) => `<div class="tt-load" role="status" aria-busy="true"><span class="sr">Reading the ${esc(what)}…</span><span class="skel"></span><span class="skel" style="width:82%"></span><span class="skel" style="width:64%"></span></div>`;
/* A POSITION'S EXITS — its take-profit and its stop-loss — as the account's open orders say them: those resting at its venue in its market on
   the closing side that only close (a bracket's exit, a reduce-only order): a limit is the take-profit, a stop (or a trailing stop's stop
   now) the stop-loss; the first of each. { tp, sl }, each a price or undefined */
function ttExitsOf(p, orders = (A && A.orders) || []) {
  const closing = p && p.side === "short" ? "buy" : "sell";
  const mine = (orders || []).filter((o) => o && o.venue === p.venue && o.symbol === p.symbol && o.side === closing && isLive(o) && !o.canceling && (o.exitOf || o.reduceOnly));
  const tp = mine.find((o) => o.type === "limit" && Number(o.limitPrice) > 0);
  const sl = mine.find((o) => (o.type === "stop" || o.type === "stop_limit" || o.type === "trailing_stop") && Number(o.stopPrice) > 0);
  return { tp: tp ? Number(tp.limitPrice) : undefined, sl: sl ? Number(sl.stopPrice) : undefined };
}
/* a perpetual's margin and its funding since it opened, where the venue says them (live/trade.ts Position.marginUsd, fundingUsd; a book
   from before they were named carries them in native) */
const ttMarginOf = (p) => { const n = p.native && typeof p.native === "object" ? p.native : {}; const v = p.marginUsd !== undefined ? p.marginUsd : n.marginUsd; return Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : undefined; };
const ttFundingOf = (p) => { const n = p.native && typeof p.native === "object" ? p.native : {}; const v = p.fundingUsd !== undefined ? p.fundingUsd : p.native && n.paper ? n.fundingUsd : undefined; return Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : undefined; };
/** THE TICKET'S ACCOUNT FIRST in the tables under the panels (Positions, Open orders): its rows, then — while the ticket is on a paper
 * account — the other paper rows, then the rest, each kind in the order it was read. A position just opened from the ticket is the first
 * row, never a fourth one under the three a short window shows */
function ttTicketFirst(rows) {
  const at = TT.at ? TT.at.venue : "";
  if (!at || !Array.isArray(rows)) return rows;
  const v = (typeof connected === "function" ? connected() : []).find((x) => x.id === at);
  const paper = !!(v && v.paper);
  const rank = (r) => (r.venue === at ? 0 : paper && r.paper ? 1 : 2);
  return rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r);
}
/** Positions drawn from the read last kept (box.ttRead) — each row's mark, value, PNL and ROE at its market's pushed price where the stream
 * carries it live (ttLiveRow), else as read — and the markets of the rows listed, followed for their price alone (ttFollow) */
function ttPosDraw(box) {
  const b = box.ttRead;
  const owner = box.ttOwner;
  if (!b || b.ok === false) {
    TT.posKeys = [];
    ttFollow();
    return void paint(box, `<p class="msg no">${esc(ttSentence(b, "the positions could not be read"))}</p>`);
  }
  const lens = lensNow();
  const list = ttTicketFirst((b.positions || []).filter((p) => p.qty > 0 && tkVenueIn(p.venue, lens)).map(ttLiveRow));
  // how many, on the tab (ttTabs): drawn again only when it changed
  if ((TT.posN || 0) !== list.length) {
    TT.posN = list.length;
    ttTabs($("pane-trade"));
  }
  // their markets followed for their price alone, while this tab shows (as many as the stream takes beside the market showing)
  const keys = [...new Set(list.map((p) => `${p.venue}:${p.symbol}`))].slice(0, (typeof ST_FOLLOW_MAX === "number" ? ST_FOLLOW_MAX : 16) - 1);
  if (keys.join("\n") !== (TT.posKeys || []).join("\n")) {
    TT.posKeys = keys;
    ttFollow();
  }
  const miss = (b.missing || []).filter((m) => tkVenueIn(m.venue, lens));
  const failed = miss.filter((m) => !awayMiss(m));
  const missing = `${awayLine(miss.filter(awayMiss), { cls: "small dim tt-miss" })}${failed.length ? `<ul class="tt-miss">${failed.map((m) => `<li><b>${esc(m.venueName || nameOf(m.venue))}</b> could not be read: ${esc(m.why || "no answer")}</li>`).join("")}</ul>` : ""}`;
  if (!list.length) return void paint(box, `<p class="empty">${miss.length ? "Nothing held in positions at the venues that answered." : `Nothing held in positions${lens.kind === "all" ? "" : " here"}.`}</p>${missing}`);
  const closable = (p) => { const v = connected().find((x) => x.id === p.venue); return owner && writesOn() && !!v && canTrade(v) && !!v.trade && !!v.trade.positions; };
  // each price as its market writes it (ttFig): to its step where this page read the market, else to the decimals its mark is quoted in
  // (the venue's own price; a liquidation price is worked out, so it is no guide) — an average entry is never printed to five decimals no
  // venue quotes. An event's in cents
  const fig = (p, n, cls, pre = "", post = "") => {
    if (n === undefined || n === null || n === "") return `<td class="${cls}">${pre}—</td>`;
    if (p.kind === "event") return `<td class="${cls}">${pre}${esc(cents(n))}${post}</td>`;
    const f = ttFig(n, { step: ttStepOf(p.venue, p.symbol), like: [p.markPrice] });
    return `<td class="${cls}"${f.exact ? ` title="${esc(f.exact)}"` : ""}>${pre}${esc(f.text)}${post}</td>`;
  };
  // each row keyed by where it is held and what (data-k): a pushed position is drawn over its own row, the others left as they are. Its
  // PNL with its ROE beside it where the margin it was opened with is known (ttRoe), as HL writes them
  // a perpetual's margin (and its mode), its funding since it opened — paid said as a cost, received as a gain — and its exits, as HL lists
  // them: TP / SL, each a dash where none rests
  const marginCell = (p) => { const m = ttMarginOf(p); return `<td class="r tt-c-margin">${m !== undefined ? `${money(m)}${p.marginMode ? `<span class="why">${esc(p.marginMode.charAt(0).toUpperCase() + p.marginMode.slice(1))}</span>` : ""}` : "—"}</td>`; };
  const fundingCell = (p) => { const f = ttFundingOf(p); return `<td class="r tt-c-fund"${f !== undefined ? ` title="${esc(f > 0 ? `${fine(f)} paid in funding since it opened` : f < 0 ? `${fine(-f)} received in funding since it opened` : "no funding paid or received yet")}"` : ""}>${f !== undefined ? (f === 0 ? fine(0) : chg(-f, "$")) : "—"}</td>`; };
  const exitsCell = (p) => { const x = ttExitsOf(p); const one = (n) => (n === undefined ? "—" : p.kind === "event" ? esc(cents(n)) : esc(ttFig(n, { step: ttStepOf(p.venue, p.symbol), like: [p.markPrice] }).text)); return `<td class="r tt-c-tpsl"><span class="tt-k">TP/SL </span>${one(x.tp)} / ${one(x.sl)}</td>`; };
  const rows = list.map((p, i) => `<tr data-k="${esc(`${p.venue}|${p.symbol}`)}"><td class="tt-c-mkt" title="${esc(`${p.name} · ${p.venueName || nameOf(p.venue)}`)}"><b>${esc(p.name)}</b>${p.paper ? ' <span class="tag paper">Paper</span>' : ""}<span class="why">${esc(p.paper ? tkPaperless(p.venueName || nameOf(p.venue)) : p.venueName || nameOf(p.venue))}</span></td><td class="r tt-c-size ${p.side === "short" ? "down" : "up"}">${esc(p.side === "short" ? "Short" : "Long")} ${esc(qtyOf(p.qty))}${p.leverage && p.leverage > 1 ? ` · ${esc(String(p.leverage))}x` : ""}</td><td class="r tt-c-val">${p.usd !== undefined ? money(p.usd) : "—"}</td>${fig(p, p.entryPrice, "r tt-c-entry")}${fig(p, p.markPrice, "r tt-c-mark", '<span class="tt-k">Mark </span>', ttMarkAge(p))}<td class="r tt-c-pnl">${chg(p.unrealizedUsd, "$")}${ttRoeWords(ttRoe(p))}</td>${p.liquidationPrice ? fig(p, p.liquidationPrice, "r tt-c-liq") : '<td class="r tt-c-liq"><span class="flat">—</span></td>'}${marginCell(p)}${fundingCell(p)}${exitsCell(p)}<td class="r tt-c-act">${closable(p) ? `<button type="button" class="btn btn-sm" data-tt-close="${i}">${p.kind === "perp" || p.kind === "future" ? "Close…" : "Sell…"}</button>` : ""}</td></tr>`).join("");
  paint(box, `<div class="t-wrap"><table class="t tt-t tt-pos"><thead><tr><th>Market</th><th class="r">Size</th><th class="r">Position value</th><th class="r">Entry price</th><th class="r">Mark price</th><th class="r">PNL (ROE %)</th><th class="r">Liq. price</th><th class="r">Margin</th><th class="r" title="${esc(TT_FUNDING_PAID_SAYS)}">Funding</th><th class="r">TP/SL</th><th class="r"><span class="sr">Close</span></th></tr></thead><tbody>${rows}</tbody></table></div>${missing}`);
  box.ttList = list;
  if (box.ttHeard) return;
  box.ttHeard = true;
  box.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("button[data-tt-close]");
    const p = btn && box.ttList ? box.ttList[Number(btn.dataset.ttClose)] : null;
    if (p && typeof openClose === "function") openClose(p);
  });
}
/** A POSITION AT ITS MARKET'S PUSHED PRICE: where the stream carries the market live and its price is no older than the position's own mark,
 * the mark is the stream's (a perpetual's venue mark, else its middle; a coin's last trade, as the account marks them: live/paper.ts) and
 * what follows from it is worked out at it — what the position is worth (its size at the mark) and its result (a perpetual's move from its
 * entry times its size, signed by its side; a holding's worth less what it cost, where the venue keeps that) — its mark's moment the
 * stream's. Only for a market the stream carries (a coin pair, a Hyperliquid perpetual: sized in the coin itself). Otherwise the row as read */
function ttLiveRow(p) {
  if (!p || typeof stQuoteOf !== "function" || typeof stPrice !== "function") return p;
  const q = stQuoteOf(p.venue, p.symbol);
  if (!q || q.live !== true) return p;
  const perp = p.kind === "perp" || p.kind === "future";
  const mark = perp ? (typeof q.mark === "number" && q.mark > 0 ? q.mark : stPrice(q, true)) : stPrice(q, false);
  const at = Date.parse(String(q.seenAt || q.at || ""));
  const native = p.native && typeof p.native === "object" ? p.native : {};
  if (!(mark > 0) || !Number.isFinite(at) || (typeof native.markAt === "number" && at < native.markAt) || !(p.qty > 0)) return p;
  const usd = Number((p.qty * mark).toFixed(2));
  const pnl = perp ? (p.entryPrice > 0 ? (p.side === "short" ? p.entryPrice - mark : mark - p.entryPrice) * p.qty : undefined) : Number(p.costUsd) > 0 ? usd - Number(p.costUsd) : p.entryPrice > 0 ? (mark - p.entryPrice) * p.qty : undefined;
  return { ...p, markPrice: mark, usd, ...(pnl !== undefined ? { unrealizedUsd: Number(pnl.toFixed(perp ? 6 : 2)) } : {}), native: { ...native, markAt: at } };
}
/** A POSITION'S ROE, as the venue reckons it: a perpetual's result over the margin it was OPENED with — the venue's own figure where it
 * gives one for the result shown (Hyperliquid's returnOnEquity, while the row's PNL is still the one it came with: once a pushed price moved
 * it, ttLiveRow, the figure is that read's, not this one's), else the initial margin, its notional at the entry over the leverage it stands
 * at (Hyperliquid's own rule, and a paper account's margin as it was put up). Never the margin the venue holds NOW (Position.marginUsd):
 * Hyperliquid's marginUsed on an isolated position is that margin plus its unrealised PNL, and a paper account's is less the funding paid —
 * either would swell the ROE the more the position lost. The entry notional is read through what the position is worth at its mark (usd
 * over the mark, times the entry), so a perpetual sized in contracts is reckoned at their size. A holding's ROE is over its cost (what the
 * venue says it cost, else its entry times its size). In percent; undefined where none of it is known */
function ttRoe(p) {
  const pnl = Number(p && p.unrealizedUsd);
  if (!p || !Number.isFinite(pnl)) return undefined;
  const perp = p.kind === "perp" || p.kind === "future";
  if (!perp) {
    const cost = Number(p.costUsd) > 0 ? Number(p.costUsd) : p.entryPrice > 0 && p.qty > 0 ? p.entryPrice * p.qty : NaN;
    return cost > 0 ? (pnl / cost) * 100 : undefined;
  }
  const n = p.native && typeof p.native === "object" ? p.native : {};
  const own = n.returnOnEquity === null || n.returnOnEquity === undefined || n.returnOnEquity === "" ? NaN : Number(n.returnOnEquity);
  const asRead = n.unrealizedPnl !== null && n.unrealizedPnl !== undefined && Math.abs(Number(n.unrealizedPnl) - pnl) < 1e-6;
  if (Number.isFinite(own) && asRead) return own * 100;
  const lev = Number(p.leverage);
  const entry = Number(p.entryPrice);
  if (!(lev > 0) || !(entry > 0) || !(p.qty > 0)) return undefined;
  const notional = Number(p.usd) > 0 && Number(p.markPrice) > 0 ? (Number(p.usd) / Number(p.markPrice)) * entry : entry * p.qty;
  const initial = notional / lev;
  return initial > 0 ? (pnl / initial) * 100 : undefined;
}
/* what the Funding column's head says on hover: the sign is the position's, as a result is */
const TT_FUNDING_PAID_SAYS = "Funding since the position opened, where the venue keeps it: a cost when the position paid it, a gain when it received it";
/* an ROE beside its PNL, quieter, signed (never the colour alone): " (+5.60%)"; nothing where it is not known */
const ttRoeWords = (roe) => (roe === undefined || !Number.isFinite(roe) ? "" : ` <span class="tt-roe ${roe > 0 ? "up" : roe < 0 ? "down" : "flat"}">(${roe > 0 ? "+" : roe < 0 ? "−" : ""}${Math.abs(roe).toFixed(2)}%)</span>`);

/* an order of the statement as the two history tabs read it: from the account's own order where this page has it (A.orders, joined by
   the client id the line is keyed by — the market's name, its side, kind and type, its size, what filled and at what price, its limit and
   stop) — else from the line's own words, which the account writes in one fixed shape (account/statement.ts orderLine: "Buy 0.5 SOL ·
   SOL / USDT · limit 142.44 · at 141.9 · 0.2 of 0.5 filled"), read back part by part; a part that is not there is no figure (a dash),
   never a guess. An event contract read from the words alone is priced in dollars, as its line writes it */
const TT_TYPE_OF = [[/^market$/, "market"], [/^limit /, "limit"], [/^stop at .*, limit /, "stop_limit"], [/^stop at /, "stop"], [/^trailing stop /, "trailing_stop"]];
function ttOrderRec(l) {
  const o = A && Array.isArray(A.orders) ? A.orders.find((x) => x && x.clientId && l.key === `order:${x.clientId}`) : null;
  if (o) return { name: o.name || o.base, side: o.side, ev: o.kind === "event", type: o.type, qty: o.qty, filled: o.filledQty || 0, avg: o.avgPrice, limit: o.limitPrice, stop: o.stopPrice, reduceOnly: !!o.reduceOnly, venue: o.venue, symbol: o.symbol, like: [o.limitPrice, o.stopPrice, o.price] };
  const parts = String(l.description || "").split(" · ");
  const head = /^(Buy|Sell) (-?[\d.,]+) (.+)$/.exec(parts[0] || "");
  const ti = parts.findIndex((x, i) => i > 0 && TT_TYPE_OF.some(([re]) => re.test(x)));
  const typeWords = ti > 0 ? parts[ti] : "";
  const type = typeWords ? TT_TYPE_OF.find(([re]) => re.test(typeWords))[1] : "";
  const fig = (t) => (t === undefined ? undefined : Number(String(t).replace(/,/g, "")));
  const at = parts.map((x) => /^at (-?[\d.,]+)$/.exec(x)).find(Boolean);
  const part = parts.map((x) => /^([\d.,]+) of [\d.,]+ filled$/.exec(x)).find(Boolean);
  const qty = head ? fig(head[2]) : undefined;
  const filled = part ? fig(part[1]) : at ? qty : 0;
  const limit = fig((/limit (-?[\d.,]+)$/.exec(typeWords) || [])[1]);
  const stop = fig((/^stop at (-?[\d.,]+)/.exec(typeWords) || [])[1]);
  return { name: ti > 1 ? parts.slice(1, ti).join(" · ") : head ? head[3] : String(l.description || ""), side: l.kind === "sell" ? "sell" : "buy", ev: false, type, qty, filled, avg: at ? fig(at[1]) : undefined, limit, stop, reduceOnly: false, venue: "", symbol: "", like: [limit, stop] };
}
/* a statement line in the lens: Real money or Paper by the line's own word (a paper account closed since is still Paper), one venue by its
   account, an agent's lens that agent's */
function ttLinesHere(b) {
  const lens = lensNow();
  const here = (l) => (lens.kind === "real" ? !l.paper : lens.kind === "paper" ? !!l.paper : inLens(l.account, l.agent));
  return (b.lines || []).filter((l) => l.type === "trade" && here(l));
}
/* the cells the two history tabs share: when — its whole date and time to the second, on the screen's one clock (core yourClock: the
   viewer's own, as the chart and the book say theirs) — the market by its name — with Paper, the venue beside it quieter, and the account's
   id for the order on hover — and the side, coloured as HL colours a direction, in its word */
const ttWhen = (l) => `<td class="tab-nums nw" title="${esc(yourClock(l.updatedAt || l.at))}">${esc(yourClock(l.updatedAt || l.at, { year: false, seconds: false }))}</td>`;
/* the Time column's head, saying whose clock on hover */
const ttTimeTh = () => `<th title="${esc(`On your clock: ${yourZoneWords()}`)}">Time</th>`;
/* how many of a history's rows show at first, and how many more each "Load more" adds */
const TT_PAGE = 50;
/* "Load more" under a history's rows, where more were read than show: how many show, of how many */
const ttMoreHtml = (shown, total) => (total > shown ? `<p class="tt-more-w"><button type="button" class="link tt-more" data-tt-more data-fk="tt-more">Load ${Math.min(TT_PAGE, total - shown)} more</button><span class="dim small">${esc(`${shown} of ${total}`)}</span></p>` : "");
/* a history tab's "Load more", heard once on its box: TT_PAGE more of the rows read, the tab drawn again from the statement kept */
function ttMoreHeard(box, draw) {
  if (box.ttMoreHeard || typeof box.addEventListener !== "function") return;
  box.ttMoreHeard = true;
  box.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-tt-more]");
    if (!b || !box.contains(b)) return;
    box.ttShow = (box.ttShow || TT_PAGE) + TT_PAGE;
    draw(box);
  });
}
/* a history cell's words kept to one line, cut with an ellipsis where they run long (terminal.css .tt-cut), the whole of them on hover — and
   who placed it, so cut: the history tables stay as wide as their panel at 1440, as HL's do */
const ttCut = (words) => `<span class="tt-cut" title="${esc(words)}">${esc(words)}</span>`;
const ttByCell = (l) => `<td class="tt-c-by">${l.by ? ttCut(l.by) : ""}</td>`;
const ttMarketCell = (l, r) => `<td class="tt-c-mkt" title="${esc(`${r.name ? `${r.name} · ` : ""}${l.accountName} · ${l.id}`)}"><b>${esc(r.name)}</b>${l.paper ? ' <span class="tag paper">Paper</span>' : ""}<span class="why">${esc(l.paper ? tkPaperless(l.accountName) : l.accountName)}</span></td>`;
const ttSideCell = (r) => `<td class="${r.side === "sell" ? "down" : "up"}">${r.side === "sell" ? "Sell" : "Buy"}</td>`;
/* a price in the two history tabs, as its market writes it (ttFig: its step where this page read the market, else the decimals of the
   order's own limit, stop and the price it was valued at), an event's in cents; the figure as it came on hover where the words round it */
const ttPx = (r, n) => {
  if (n === undefined || n === null || n === "" || !Number.isFinite(Number(n))) return "—";
  if (r.ev) return esc(cents(n));
  const f = ttFig(n, { step: ttStepOf(r.venue, r.symbol), like: r.like || [] });
  return f.exact ? `<span title="${esc(f.exact)}">${esc(f.text)}</span>` : esc(f.text);
};

/* Trade history: what FILLED, newest first — fills only, never an order that is open, waiting or was canceled with nothing filled — in HL's
   columns: Time · Market · Direction · Price · Size · Trade value · Fee · Closed PNL (a close's, where its venue says it) · By. A fill's value is neither up nor down (money changed hands
   for a thing); colour is kept for the side's word */
function ttHistory(box) {
  if (!box) return;
  if (!box.ttDrawn) paint(box, ttLoadingHtml("trades"));
  ttMoreHeard(box, ttHistory);
  api("/api/account/statement", { ttl: 10_000 }).then((b) => {
    if (!box.isConnected || TT.tab !== "history") return;
    box.ttDrawn = true;
    if (!b || b.ok === false) return void paint(box, `<p class="msg no">${esc(ttSentence(b, "the statement could not be read"))}</p>`);
    const all = ttLinesHere(b).filter((l) => Math.abs(Number(l.amountUsd) || 0) > 0 || /^(filled|partial)$/.test(String(l.status)));
    const lines = all.slice(0, box.ttShow || TT_PAGE);
    if (!lines.length) return void paint(box, '<p class="empty">No trades yet.</p>');
    const rows = lines.map((l) => {
      const r = ttOrderRec(l);
      // a close's closed P&L where its venue says it (a paper account's); an opening trade has none
      const closed = l.realizedUsd !== undefined && l.realizedUsd !== null ? chg(l.realizedUsd, "$") : '<span class="flat">—</span>';
      return `<tr>${ttWhen(l)}${ttMarketCell(l, r)}${ttSideCell(r)}<td class="r">${ttPx(r, r.avg)}</td><td class="r">${r.filled ? esc(qtyOf(r.filled)) : "—"}</td><td class="r">${money(Math.abs(Number(l.amountUsd) || 0))}</td><td class="r">${l.feeUsd !== undefined ? fine(l.feeUsd) : "—"}</td><td class="r tt-c-pnl">${closed}</td>${ttByCell(l)}</tr>`;
    }).join("");
    paint(box, `<div class="t-wrap"><table class="t tt-t"><thead><tr>${ttTimeTh()}<th>Market</th><th>Direction</th><th class="r">Price</th><th class="r">Size</th><th class="r">Trade value</th><th class="r">Fee</th><th class="r">Closed PNL</th><th>By</th></tr></thead><tbody>${rows}</tbody></table></div>${ttMoreHtml(lines.length, all.length)}`);
  });
}

/* Funding history: what the perpetuals paid and received, hour by hour, newest first (GET /api/account/funding — a paper account's book,
   Hyperliquid's userFunding for the account's address), in HL's columns: Time · Market · Direction · Size · Price · Payment · Rate. The
   payment is the money's way for the owner — paid, below zero in the down colour; received, above zero in the up colour; the price is the
   one it was settled at (the oracle at Hyperliquid) where the venue says it; a rate the quote carried, the venue's own history not having
   said that hour's, is marked so on hover. The venues that could not be read are said under the rows, in their own words */
function ttFunding(box) {
  if (!box) return;
  if (!box.ttDrawn) paint(box, ttLoadingHtml("funding"));
  ttMoreHeard(box, ttFunding);
  api("/api/account/funding", { ttl: 30_000 }).then((b) => {
    if (!box.isConnected || TT.tab !== "funding") return;
    box.ttDrawn = true;
    if (!b || b.ok === false) return void paint(box, `<p class="msg no">${esc(ttSentence(b, "the funding could not be read"))}</p>`);
    const all = (b.lines || []).filter((l) => inLens(l.venue));
    const lines = all.slice(0, box.ttShow || TT_PAGE);
    const missed = (b.missing || []).filter((m) => inLens(m.venue)).map((m) => `${m.venueName}: ${String(m.why || "").replace(/[.\s]+$/, "")}`);
    const notRead = missed.length ? `<p class="dim small tt-missed">${esc(`Not read: ${missed.join(" · ")}.`)}</p>` : "";
    if (!lines.length) return void paint(box, `<p class="empty">No funding paid or received yet: an open perpetual pays or receives it every hour.</p>${notRead}`);
    const rows = lines.map((l) => {
      const [way, word] = l.side === "short" ? ["down", "Short"] : l.side === "long" ? ["up", "Long"] : ["", "—"];
      const rate = typeof l.rate === "number" && Number.isFinite(l.rate) ? `${(l.rate * 100).toFixed(4)}%` : "—";
      const quoted = l.quoted ? ' class="r tt-quoted" title="The rate the quote carried: the venue\'s own history had not said this hour\'s when it was settled"' : ' class="r"';
      return `<tr>${ttWhen(l)}<td class="tt-c-mkt" title="${esc(`${l.symbol} · ${l.venueName}`)}"><b>${esc(l.symbol)}</b>${l.paper ? ' <span class="tag paper">Paper</span>' : ""}<span class="why">${esc(l.paper ? tkPaperless(l.venueName) : l.venueName)}</span></td><td class="${way}">${word}</td><td class="r">${l.qty !== undefined ? esc(qtyOf(l.qty)) : "—"}</td><td class="r">${l.price !== undefined ? esc(px(l.price)) : "—"}</td><td class="r">${chg(-Number(l.usd), "$")}</td><td${quoted}>${esc(rate)}</td></tr>`;
    }).join("");
    paint(box, `<div class="t-wrap"><table class="t tt-t"><thead><tr>${ttTimeTh()}<th>Market</th><th>Direction</th><th class="r">Size</th><th class="r" title="The price the hour was settled at: the oracle at Hyperliquid">Price</th><th class="r" title="Paid out of the position below zero, received above">Payment</th><th class="r" title="The hour's funding rate">Rate</th></tr></thead><tbody>${rows}</tbody></table></div>${ttMoreHtml(lines.length, all.length)}${notRead}`);
  });
}

/* an order's state in words, as its line has it: what filled, what rests, what waits at its venue or for the owner's wallet, what was
   canceled, refused or ran out, what the account stopped following */
function ttStatusWords(l) {
  const s = String(l.status || "");
  const known = { filled: "Filled", partial: "Part filled", open: "Open", canceled: "Canceled", cancelled: "Canceled", rejected: "Rejected", expired: "Expired", "waiting for wallet": "Waiting for your wallet", "not followed": "Not followed", "not followed since a restart": "Not followed since a restart" };
  if (s === "pending") return `Waiting at ${l.accountName || nameOf(l.account)}`;
  return known[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
}

/* Order history: every order placed, newest first, whatever became of it, in HL's columns: Time · Type · Market · Direction · Size ·
   Filled · Order value · Price · Status · By. Price is the limit an order rests at (Market for one at market; a stop's trigger in Type) */
function ttOrders(box) {
  if (!box) return;
  if (!box.ttDrawn) paint(box, ttLoadingHtml("orders"));
  ttMoreHeard(box, ttOrders);
  api("/api/account/statement", { ttl: 10_000 }).then((b) => {
    if (!box.isConnected || TT.tab !== "orders") return;
    box.ttDrawn = true;
    if (!b || b.ok === false) return void paint(box, `<p class="msg no">${esc(ttSentence(b, "the statement could not be read"))}</p>`);
    const all = ttLinesHere(b);
    const lines = all.slice(0, box.ttShow || TT_PAGE);
    if (!lines.length) return void paint(box, '<p class="empty">No orders yet.</p>');
    const rows = lines.map((l) => {
      const r = ttOrderRec(l);
      const type = `${TK_TYPE_NAMES[r.type] || "—"}${r.stop !== undefined && (r.type === "stop" || r.type === "stop_limit") ? ` at ${ttPx(r, r.stop)}` : ""}`;
      const price = r.limit !== undefined ? ttPx(r, r.limit) : r.type === "market" || r.type === "stop" || r.type === "trailing_stop" ? "Market" : "—";
      const st = String(l.status || "");
      return `<tr>${ttWhen(l)}<td class="nw">${type}</td>${ttMarketCell(l, r)}${ttSideCell(r)}<td class="r">${r.qty !== undefined ? esc(qtyOf(r.qty)) : "—"}</td><td class="r">${r.filled ? esc(qtyOf(r.filled)) : "0"}</td><td class="r">${l.worthUsd !== undefined ? money(l.worthUsd) : "—"}</td><td class="r">${price}</td><td class="nw tt-c-st tt-st-${/^(filled|partial|open)$/.test(st) ? "on" : /^(pending|waiting for wallet)$/.test(st) ? "wait" : "off"}">${ttCut(ttStatusWords(l))}</td>${ttByCell(l)}</tr>`;
    }).join("");
    paint(box, `<div class="t-wrap"><table class="t tt-t"><thead><tr>${ttTimeTh()}<th>Type</th><th>Market</th><th>Direction</th><th class="r">Size</th><th class="r">Filled</th><th class="r">Order value</th><th class="r">Price</th><th>Status</th><th>By</th></tr></thead><tbody>${rows}</tbody></table></div>${ttMoreHtml(lines.length, all.length)}`);
  });
}

/** the pane drawn: the bar's figures and the tabs under the panels; a market to start from while nothing has shown on this frame yet and
 * no ticket was opened on purpose — the busiest of the kind showing, at a paper account that trades it where there is one, else the first
 * account that trades it (tkFirstLeg; nothing takes the focus). After
 * that nothing is picked by itself: a ticket the owner opened on no market (the "t" key, a venue's Trade, Change) is left as it is */
function ttDraw(el, owner) {
  ttWire(el);
  ttFit(el);
  ttStats(el);
  ttLow(el, owner);
  ttLinesDraw();
  // the screen's one clock, named once in its foot (core yourClock: the chart, the book and the tables all say times on it)
  const clock = el.querySelector("[data-tt-clock]");
  if (clock && typeof yourZoneWords === "function") setText(clock, yourZoneWords());
  // the stream's dot in the foot (a frame drawn again is a new one): how the account's stream stands; the feed at the bar's end, and its
  // clock
  if (typeof stDot === "function") stDot();
  ttFeedTicks();
  if (!TT.item && !TT.started && TK.kind && TK.got[TK.kind] && (TK.got[TK.kind].items || []).length && !TK.pending) {
    const first = TK.got[TK.kind].items.find((x) => tkInLens(x, lensNow()));
    if (first) {
      TT.started = true;
      // a paper account of yours that trades it first, whenever there is one (ui/trade.js tkFirstLeg): real money only by your own pick
      const at = tkFirstLeg(first);
      tkOpen({ kind: TK.kind, item: first, venue: at ? at.venue : "", symbol: at ? at.symbol : "", side: "buy", rest: true });
    }
  }
  if (!TT.item) ttMount(el);
}
