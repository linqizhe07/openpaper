/* THE CHART — one market's price history as candles, the way a trading screen draws it: the bars its source keeps (GET /api/account/candles:
   a connected venue's own, or a public source's without a key), a volume pane under them where the bars carry volume, a price axis on the
   right and a time axis at the foot, a dashed line at the last price with its value in a tag on the axis, and a crosshair that reads any
   bar. SVG drawn as strings, no library.

   RANGES AND BAR SIZES (feat/paper-live phase H). The head has the ranges a trading screen offers — 1D 5D 1M 3M 6M YTD 1Y 5Y MAX — each
   asked of the account in the bar size it starts in (1D 1m · 5D 5m · 1M 1h · 3M and 6M 4h · YTD and 1Y 1D · 5Y and MAX 1W: live/history.ts
   RANGE_BAR, which the account keeps too), and a menu of the bar sizes (1m 5m 15m 1h 4h 1D 1W) that overrides the range's own: the range
   is still the stretch asked, in the bars the owner picked. A range pressed takes its own bar size again. The answer says the bars' size
   (a source that keeps only so many bars at a size draws a range in a coarser one: Hyperliquid's latest 5,000; the menu then says the size
   drawn, and why is said over the plot), whether older bars exist (`more`) and, where the history ends, why (`ends`), whose bars they are
   (`source`), what the prices are adjusted for, which hours the bars cover, what they were folded from — all said in the foot. The head's
   last button (or F on the plot) fills the window with the chart where the page offers it (chSetFull): the frame laid over the page, the
   bars drawn again at the window's size; Esc, F or the button again bring the page back.

   INDICATORS (ui/indicators.js does the arithmetic). The head's Indicators button opens a menu: moving averages, Bollinger bands and VWAP
   over the price, RSI, MACD, the stochastic and ATR each in a pane of its own under it (at most three; the price pane keeps its height
   first), each with its lengths. They are computed again as the bars change — a live price moves the newest value — and drawn in a layer of
   their own each frame (chIndSvg), their values at the bar under the pointer after the bar's own in the readout. The list on is the page's
   to keep (s.onIndicators: terminal.js writes it in the address and this browser's storage).

   MOVING THROUGH TIME. The first view fits the range: every bar it brought, side by side, as wide as fits (at most CH_MAX_SLOT pixels a
   bar, so a short history sits at the right). A drag moves it (the mouse, or a finger left and right: up and down still scrolls the page),
   the wheel zooms around the pointer (sideways it moves), a pinch zooms around its middle, and + and − zoom from the keyboard; a double
   click fits the range again. The crosshair and the readout stay with the pointer through all of it. Once the owner has moved the view and
   its left edge comes near the oldest bar, the account is asked for the page before it (`before`): a quiet "Loading older bars…" over the
   plot while it comes, the bars added on the left without the view jumping (nor the keys' crosshair leaving its bar), and — where the
   source's history ends — its own words there, and nothing more is asked. A page refused is said in its words and asked again only after a
   wait, and so is one that came back empty while older bars still exist (its source answered none, or only part: never taken for the end).
   Older bars of another source than the bars beside them (a share's Robinhood year, Nasdaq's daily bars before it) are never joined
   unmarked: a dashed seam where they meet, both sources in the foot ("before Mon 18 Oct 2021: Nasdaq · AAPL"), the far side's in the
   readout.

   NOTHING MADE UP. Every bar is the source's own: none is drawn between two it gave, and a price read never makes one. Where the source has
   no bar between two — a minute nobody traded, an exchange's quiet hours, the stretches its own words say it has none (`gaps`) — the slots
   stay EMPTY, never bridged (the crosshair over one says why); a hole longer than CH_GAP_SLOTS is that many empty slots and a dashed break
   line. A share's intraday bars step over the hours they do not cover (a night with no overnight data, a weekend) with a break line and no
   empty slots, and its daily bars over the days its market is closed (a closed day is not a missing bar). The live price (GET
   /api/account/quotes, every five seconds while the chart is mounted, its pane is
   showing and the page is) moves the LAST bar only — its close, and its high or its low where the price passes them — and only while the
   price's own time (the quote's stamp where its source stamps one, else the moment it was read) is inside that bar's interval. A PUSHED
   QUOTE — the account's stream (ui/stream.js quote events, for the market this tab shows: its venue's own stream, each message with the
   venue's own moment) — moves the last bar the same way as it comes, drawn in the next frame, at the market's LAST TRADE (a candle is its
   trades', so never at a best bid and ask's middle, a perpetual's too), and never starts one: a quote comes on every move of the best bid
   or ask, a mark or the market's state, and the last trade it carries may be from before the boundary — so the first quote past a bar's end
   says nothing traded after it. A PUSHED TRADE (ui/stream.js trades events: the market's latest, each at its venue's own moment) is the one
   live price that may START a bar: the first trade at or past the last bar's end opens the bar its moment falls in, at its own interval's
   boundary (chBarStart: Universal days, four-hour buckets from midnight and Monday weeks for a market that trades round the clock; New
   York's four-hour buckets from 04:00 for a share, and only inside the hours its bars keep, 04:00–20:00 or the regular session, on a
   weekday — never a share's daily or weekly bar, which is its regular session's own), at the venue's own one-minute open where the stream
   sent that minute's bar, else at the trade — and never one between (nothing this page heard traded there).
   Such a bar is the page's until the source has it: each read of the bars reconciles — the source's bar stands wherever the source has one,
   a bar started here is kept only while the source has none at its moment yet (it will: something traded there), and the bars are read
   again thirty seconds after one is started here. While pushed prices come, the read of the live price is only a slow fallback (once every
   thirty seconds), back on its five seconds when they stop. The
   account's own paper book's price (connector live:paper) is its source's listing as its venue last answered: placed by that moment
   (quoteAt), never by the moment the page read it, and one that says no moment moves no bar (a venue's own paper account, Alpaca paper or
   Hyperliquid testnet, answers fresh like any connected venue) — and the foot says how old the live price is once it is not the last few
   seconds'. A share's daily bar is its regular session's, so only a price from the regular session moves it (never an after-hours,
   overnight or pre-market one). A live price is laid over the bars only while it is fresh: one the venue then refused, or one read before a newer read of the bars,
   never stands in for the source's own close. Once the clock passes the last bar's end the bars are read again, and the source's next bar
   comes with them. A source that keeps no history says so in its own words in the panel, and nothing else is drawn there: no axes, no grid.

   Mounting (ui/terminal.js mounts it in the Trade pane's left panel; ui/superagent.js in its analysis)
     chMount(el, { venue, symbol, kind, quote, range, interval, log, priceStep, onRange, onInterval, onLog })
                    the chart drawn into el (its own frame inside: el keeps its classes): the ranges, the bar sizes' menu and the log
                    switch over the plot, the plot with the OHLC readout laid over its top-left corner (as a trading screen lays it: the
                    readout's words never change the plot's size), a quiet line under it saying whose bars they are and what they are.
                    `venue` a venue id on the account or a public source's id (Markets names both; a paper account's id passes through to
                    its market's public source), `symbol` the market as that venue names it, `kind` the Market's kind ("event": prices in
                    cents), `quote` what it is priced in ("USDT"; a Market may be passed instead: its quote and priceStep are read),
                    `range` one of the ranges (where none is named: the one a bar size alone is drawn over, live/history.ts INTERVAL_RANGE —
                    1h a month, 5m a day — else 1M), `interval` a bar size overriding the range's own, `log` a logarithmic price scale,
                    `priceStep` the market's own price step (its figures carry at least that many decimals, and more where the bars are
                    finer: a half cent stays a half cent), `onRange(r)`, `onInterval(iv)` and `onLog(on)` called when the owner picks
                    another, so the page can keep the choice. Mounting again on the same el — another market, another range — releases
                    the first: an answer meant for it is never drawn
     chLines(el, lines, { onDrag })
                    THE ACCOUNT'S OWN LINES over the plot (feat/paper-live phase 4): each { id, price, label, short (its kind and size
                    alone, what a narrow plot says), kind (buy · sell · tp · sl · entry · liq · trail), drag (a field the line's price may
                    be dragged to change: "limitPrice" or "stopPrice") } — an
                    order resting, a position's entry, its take-profit and stop-loss, its liquidation price — a line across the price pane
                    with its words at the left and its price in a tag on the axis, drawn where it is in view and nowhere else (the scale is
                    the bars', never stretched to a line). A line with `drag` may be pulled up or down: while it moves it says the price
                    it would go to, and let go it is handed to onDrag(line, price) — the page opens the order's change at that price, to be
                    SIGNED (an amend, as the Change button opens it): nothing is moved by the drag itself, and the line goes back to its own
                    price until the order is changed. Lines are drawn again with every frame the chart draws; nothing is asked for them
     chMarks(el, marks)
                    THE DESK'S TRADES on the chart (ui/superagent.js): each { id, t (the moment, ms), price, side (buy · sell), kind (in ·
                    out), label, short (what a narrow plot says), tone (up · down · ink), lead (an entry and an exit of one lead are
                    joined), fresh (it just happened: a ring pulses round its dot), float (an exit's result, floating up beside it once
                    while it is fresh), quiet (a dot alone: its words only on hover) } — a dot at the bar its moment falls in and at its
                    price, its words in a tag beside it (an entry's under it, an exit's over it, kept inside the pane and off one another),
                    the entry and the exit of one lead joined by a dashed line. A moment no bar holds (before the first, after the last
                    bar's end) and a price outside the pane are not drawn. Drawn with the lines, every frame; nothing is asked for them
     chRelease(el)  the polling, the listeners and the size observer stopped; what is drawn stays until the page draws over it
     chInterval(el) the bar size the chart on el shows ("" when none is mounted there) · chRange(el) its range
   Pure, and what the tests read
     chNiceTicks(lo, hi, n) · chLogTicks(lo, hi, px) · chScale(bars, w, h, volH, top, { pos, view, log }) · chSlots(bars, ms, opts)
     · chTimeLabels(bars, interval, zone) · chThin(labels, cx, w) · chReadout(bar, prevClose, fmt) · chReadoutLines(wide, width, small)
     · chFmt(dec, ev) · chDecimals(bars, ev, step) · chApplyQuote(bars, quote, intervalMs) · chApplyTick(bars, tick, intervalMs, opens,
     startOf) · chBarStart(t, interval, clock) · chRegular(session, at) · chWhen(t, interval, zone) · chOrd(label, kind, unit)
     · chLinesSvg(s, L) · chLineAt(s, y) · chSnap(price, step) · chBarOf(bars, t, ms) · chMarksSvg(s, L)

   Drawing. The plot is five layers in one box: the picture (.ch-draw: the grid, the candles but the newest, the volume, the time axis, the
   break lines and seams), the live layer over it (.ch-live: the newest candle, the price axis's figures, the last price's line and tag — what a live
   price moves), the readout over the top-left corner (.ch-ohlc, laid over the plot: its box is out of the flow, so however long its words
   are, nothing around it moves; the price pane keeps room for it under the top edge), a quiet hint at the bottom left (.ch-hint: older bars
   loading, where the history ends) and the crosshair over all of them (.ch-cross: two lines and two tags, drawn once per size). ONLY WHAT
   IS SEEN IS DRAWN: the bars in view, and where more than one falls on a pixel's column, one candle for that column (its first open, its
   highest high, its lowest low, its last close: the bars' own extremes, never a price between). A live price that keeps the scale as it was
   redraws the live layer only — never the picture under it — and every redraw waits for the next frame, so a burst of ticks, a drag or the
   wheel is one drawing a frame. A pointer moving over the plot only moves the crosshair — a transform, its tags' places and words — and
   writes the readout; it never draws the candles again, and nothing it writes changes a box's size. The arrow keys move it bar by bar when
   the plot has the focus (Home · End · Escape), the view following it past either edge. The picture is drawn again when its box changes
   size (ResizeObserver; the window's resize where there is none), when the bars are read again, and when the view moves. The head and the
   foot are boxes of fixed height, so the plot's height is set once by the panel. Colours only from ui/tokens.css (chart.css), so Cream and
   Black alike. */

/* THE RANGES the account draws (live/trade.ts CANDLE_RANGES), as the buttons say them, each with the bar size it starts in (live/history.ts
   RANGE_BAR) */
const CH_RANGES = [["1D", "1m"], ["5D", "5m"], ["1M", "1h"], ["3M", "4h"], ["6M", "4h"], ["YTD", "1d"], ["1Y", "1d"], ["5Y", "1w"], ["MAX", "1w"]];
const CH_RANGE_BAR = Object.fromEntries(CH_RANGES);
/* the lines' tags (an order's, a position's entry and liquidation): the least distance between two of them, and the plot narrower than which
   a line says its kind and size alone (chLinesSvg) */
const CH_TAG_GAP = 17;
const CH_LINES_NARROW_W = 420;
/* how far back each range reaches on the calendar, in days (YTD and MAX are counted from a date: live/history.ts rangeSince) — only to tell
   whether a first view reached its range's start */
const CH_RANGE_DAYS = { "1D": 1, "5D": 5, "1M": 30, "3M": 92, "6M": 183, "1Y": 365, "5Y": 1826 };
/* the bar sizes the account keeps (CANDLE_INTERVALS), as the menu says them, and each one's length */
const CH_INTERVALS = [["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["1h", "1h"], ["4h", "4h"], ["1d", "1D"], ["1w", "1W"]];
const CH_MS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 };
/* the range a chart mounted with a bar size alone is drawn over (live/history.ts INTERVAL_RANGE: the few hundred bars the chart drew
   before ranges existed) */
const CH_IV_RANGE = { "1m": "1D", "5m": "1D", "15m": "5D", "1h": "1M", "4h": "3M", "1d": "1Y", "1w": "5Y" };
/* the bar sizes in words, for the sentences over the plot */
const CH_IV_WORDS = { "1m": "1-minute", "5m": "5-minute", "15m": "15-minute", "1h": "hourly", "4h": "4-hour", "1d": "daily", "1w": "weekly" };
/* the live price asked every five seconds; the bars read again once a minute (the account keeps them a minute), and once more thirty
   seconds after the last bar's interval ended (the page keeps a read thirty seconds) where the bars in hand were read before then, so the
   source's next bar comes — once per bar's end: a market whose last bar ended long ago (a market closed since yesterday, a source whose
   bars are late) is read once a minute, never every thirty seconds. A live price the account refused is asked again a minute later. A
   price is asked for only while the last bar can still take it: until twenty minutes after its end (a delayed source's stamp may be that
   late) — a market closed since yesterday is not asked every five seconds for nothing. A live price is laid over a later read of the bars
   only while it is fresh: read within the last two asks, or after that read was asked */
const CH_POLL_MS = 5_000;
const CH_READ_MS = 60_000;
/* a read of the bars the account refused, with no bars standing (a venue not connected, a source that keeps no history): asked again two
   seconds later, then twice as long each refusal more, at most a minute apart (the minute the bars are read on anyway) — each a read of
   its own, never the refusal the page kept — so a source that comes back is drawn soon, and one that does not is not asked every few
   seconds for ever. Bars read reset it */
const CH_BACKOFF_MS = 2_000;
const CH_BACKOFF_MAX_MS = 60_000;
const CH_ENDED_MS = 30_000;
const CH_QUOTE_WAIT_MS = 60_000;
const CH_LATE_MS = 20 * 60_000;
const CH_FRESH_MS = 2 * CH_POLL_MS;
/* a pushed price within the last CH_PUSH_FRESH_MS (and the stream connected): the live price is read only once in CH_PUSHED_MS */
const CH_PUSH_FRESH_MS = 10_000;
const CH_PUSHED_MS = 30_000;
/* the trades the stream sends are its market's latest, newest first: at most this many are laid on the bars from one message */
const CH_TRADES_MAX = 200;
/* SCROLLED LEFT: the page before the oldest bar is asked once the view's left edge is within a quarter of a view of it (CH_PRELOAD), at
   most CH_PAGE bars (the source's own page is often smaller: one request to the venue), kept a minute by the page. A page refused waits
   CH_PAGE_WAIT_MS before the next ask, twice as long each refusal more, at most a minute. At most CH_MOST bars are held: past them a larger
   bar size is the way further back */
const CH_PAGE = 1_000;
const CH_PRELOAD = 0.25;
const CH_PAGE_WAIT_MS = 5_000;
const CH_PAGE_WAIT_MAX_MS = 60_000;
const CH_MOST = 20_000;
/* the picture's measures, in CSS pixels: a bar's slot at most CH_MAX_SLOT wide in a fitted view (a short history sits at the right, as a
   trading screen puts it) and at most CH_ZOOM_MAX zoomed in; zoomed out, as narrow as the whole history in hand needs, and while older bars
   exist at least CH_ZOOM_MIN (more of them come by scrolling left); a little room right of the newest bar, the time axis's height, the gap
   over the volume pane, the least room between two time labels' edges */
const CH_MAX_SLOT = 16;
const CH_ZOOM_MAX = 40;
const CH_ZOOM_MIN = 0.5;
const CH_PAD_R = 8;
const CH_TIME_H = 22;
const CH_VOL_GAP = 6;
const CH_LABEL_PAD = 12;
/* the least room between two figures on a logarithmic price axis */
const CH_LOG_GAP = 30;
/* moving the view: a press that moves less than CH_DRAG_PX is a tap (it shows the crosshair); dragged past the oldest bar where older ones
   may come, at least CH_KEEP slots of bars stay in view; one press of + or − zooms by CH_KEY_ZOOM */
const CH_DRAG_PX = 4;
const CH_KEEP = 8;
const CH_KEY_ZOOM = 1.25;
/* a hole in the bars — slots of the bars' own length the source has no bar for — is drawn as that many empty slots, at most CH_GAP_SLOTS:
   a longer one is CH_GAP_SLOTS empty slots and a dashed break line */
const CH_GAP_SLOTS = 12;
/* the readout laid over the plot: its line's height, a character's width and the gap between two units at its size — 12px, and 11px in a
   chart at most 480 pixels wide (chart.css's container query) — each a little wider than measured (6.4 and 5.85 pixels a character), so a
   little more room is kept than the words take; and its inset from the plot's corner */
const CH_LINE_H = 15;
const CH_CHAR_W = 6.6;
const CH_CHAR_W_SMALL = 6;
const CH_GAP = 8;
const CH_GAP_SMALL = 6;
const CH_SMALL_W = 480;
const CH_RO_TOP = 4;
const CH_RO_LEFT = 6;
/* the viewer's own clock: the time axis and the crosshair say times as the viewer reads them (a daily bar says the day it stands for) */
const CH_ZONE = (typeof YOUR_ZONE === "string" && YOUR_ZONE) || "UTC";
const CH_NY = "America/New_York";
const CH_DAY = 86_400_000;
/* 1970-01-05 00:00 UTC was a Monday: weeks are counted from it (live/history.ts barStart; the epoch itself was a Thursday) */
const CH_MONDAY = 4 * CH_DAY;
/* the charts mounted, by their element */
const CH = new Map();

// ---- pure: numbers ----------------------------------------------------------------------------------------------------------------

/** how many decimals a number is written with (0.25 → 2, 83134 → 0, 1e-7 → 7), read from its shortest form; at most 12 figures */
function chDecimalsOf(v) {
  if (!Number.isFinite(v)) return 0;
  const s = String(Number(Math.abs(v).toPrecision(12)));
  const e = /e-(\d+)$/.exec(s);
  if (e) return Number(e[1]) + (s.split("e")[0].split(".")[1] || "").length;
  return (s.split(".")[1] || "").length;
}

/* what a series' figures are written with: the largest price and the most decimals any price is written with — read only until the most
   the rule below keeps (a long series is not read value by value once a bar has as many as can be shown) */
function chDecStat(bars, ev = false) {
  const list = bars || [];
  let top = 0;
  // the largest price is a high (or, below zero, a low): the two read, not all four
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const h = Math.abs(b.h);
    const l = Math.abs(b.l);
    if (h > top) top = h;
    if (l > top) top = l;
  }
  const cap = chDecCap(top, ev);
  let d = 0;
  for (let i = 0; i < list.length && d < cap; i++) {
    const b = list[i];
    d = Math.max(d, chDecUpTo(b.o, cap), chDecUpTo(b.h, cap), chDecUpTo(b.l, cap), chDecUpTo(b.c, cap));
  }
  return { d, top };
}
/* how many decimals a number is written with, counted only up to `cap` (a long series is read this way: arithmetic, never its digits as
   words) — the fewest k for which it is a whole number of 10^-k, within a few units of the last place a double holds; `cap` where more */
function chDecUpTo(v, cap) {
  if (!Number.isFinite(v)) return 0;
  for (let k = 0; k < cap; k++) {
    const x = v * 10 ** k;
    if (Math.abs(x - Math.round(x)) <= Math.max(1, Math.abs(x)) * Number.EPSILON * 8) return k;
  }
  return cap;
}
/* the most decimals a series' own figures keep: five significant figures of the largest (never fewer than two), at most eight; an event
   contract's to a tenth of a cent */
const chDecCap = (top, ev) => (ev ? 1 : Math.min(Math.max(top > 0 ? Math.max(0, 4 - Math.floor(Math.log10(top))) : 2, 2), 8));
/* the decimals from a series' stat and the market's own price step */
function chDecFrom(stat, ev, step) {
  const own = Math.min(stat.d, chDecCap(stat.top, ev));
  const st = Number(step);
  const bySt = Number.isFinite(st) && st > 0 ? Math.min(8, chDecimalsOf(ev ? st * 100 : st)) : 0;
  return Math.max(bySt, own);
}

/** the decimals a market's figures carry: the more of two — its own price step's where it is known (an event contract's step is in
 * dollars, its figures in cents), and as many as its bars are written with, held to five significant figures of the largest (BTC at
 * 83,134.51 → 2 at the most, never fewer than two below that rule: a share's cents stay) and to a tenth of a cent for an event contract
 * (the page's own cents()). So a step of a cent never rounds a source's half cents away: Polymarket's 66.5¢ stays 66.5¢, not 67¢ */
function chDecimals(bars, ev, step) {
  return chDecFrom(chDecStat(bars, ev), ev, step);
}

/* one number formatter for each count of decimals, kept (making one costs more than using it, and the axis writes every bar's figures) */
const CH_NF = new Map();
function chNf(d) {
  let f = CH_NF.get(d);
  if (!f) CH_NF.set(d, (f = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })));
  return f;
}

/** a price as the chart writes it: `dec` decimals with the thousands grouped, an event contract's in cents (62.5¢); a change (`delta`) is
 * written as its size, with at least one decimal (the readout puts its sign before it) */
function chFmt(dec, ev) {
  const d0 = Math.max(0, Math.min(12, Number(dec) || 0));
  return (n, delta = false) => {
    if (n === undefined || n === null || !Number.isFinite(Number(n))) return "—";
    const v = Number(n);
    const d = delta ? Math.max(d0, 1) : d0;
    const s = chNf(d).format(Math.abs(v));
    return `${!delta && v < 0 && Number(s.replace(/,/g, "")) !== 0 ? "−" : ""}${s}${ev ? "¢" : ""}`;
  };
}

/** a volume, short: 950 · 12.3K · 4.56M · 1.2B */
function chCompact(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  const at = (n, unit) => `${Number(n.toPrecision(3))}${unit}`;
  return a >= 1e9 ? at(v / 1e9, "B") : a >= 1e6 ? at(v / 1e6, "M") : a >= 1e3 ? at(v / 1e3, "K") : a >= 1 ? String(Number(v.toFixed(2))) : String(Number(v.toPrecision(3)));
}

/** FIVE TO SEVEN ROUND TICKS for the range lo–hi: a step of 1, 2, 2.5 or 5 times a power of ten, the one that puts five to seven ticks
 * inside the range (the count nearest `n` among those; the larger step when two come as near). Some ranges have no such step — 4 ticks at
 * one step, 8 at the next (100 and 50 over 82,941–83,359) — and then the larger step is taken and the nearest round prices just outside the
 * range are added, one at a time on the nearer side, until there are five: the caller's scale opens to hold them (chScale). Each tick as the
 * step writes it (no float tails). An empty range is opened by a hundredth of its value either side; a range that is not one gives none */
function chNiceTicks(lo, hi, n = 6) {
  let a = Number(lo);
  let b = Number(hi);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (a > b) [a, b] = [b, a];
  if (a === b) {
    const d = Math.abs(a) * 0.01 || 1;
    a -= d;
    b += d;
  }
  const want = Math.max(2, Math.round(Number(n) || 6));
  const p = Math.floor(Math.log10((b - a) / (want - 1)));
  let best = null;
  for (const e of [p - 1, p, p + 1]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * 10 ** e;
      const count = Math.floor(b / step + 1e-9) - Math.ceil(a / step - 1e-9) + 1;
      // five to seven inside first; else fewer (made five below) before more
      const score = count >= 5 && count <= 7 ? Math.abs(count - want) : count < 5 ? 100 + (5 - count) : 200 + (count - 7);
      if (!best || score < best.score || (score === best.score && step > best.step)) best = { score, step, m, e };
    }
  }
  if (!best) return [];
  const { step } = best;
  const dec = Math.min(20, Math.max(0, -best.e + (best.m === 2.5 ? 1 : 0)));
  let first = Math.ceil(a / step - 1e-9);
  let last = Math.floor(b / step + 1e-9);
  while (last - first + 1 < 5) {
    if (a - (first - 1) * step <= (last + 1) * step - b) first--;
    else last++;
  }
  return Array.from({ length: last - first + 1 }, (_, k) => Number(((first + k) * step).toFixed(dec)));
}

/** ROUND TICKS ON A LOGARITHMIC SCALE from lo to hi (both above zero) over a pane `px` high: within a factor of three the scale is nearly
 * straight, so the round ticks of a straight one inside the range (chNiceTicks); wider, the powers of ten first, then their fives, twos and
 * threes, then the rest of the round figures, each kept only where it stands at least CH_LOG_GAP pixels from every one kept — ascending */
function chLogTicks(lo, hi, px = 300) {
  const a = Number(lo);
  const b = Number(hi);
  if (!(a > 0) || !(b > a) || !Number.isFinite(b)) return [];
  if (b / a < 3) return chNiceTicks(a, b, 6).filter((t) => t > 0 && t >= a && t <= b);
  const ta = Math.log(a);
  const span = Math.log(b) - ta;
  const at = (v) => (1 - (Math.log(v) - ta) / span) * px;
  const cands = [];
  for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) {
    for (const [m, rank] of [[1, 5], [5, 4], [2, 3], [3, 2], [1.5, 1], [2.5, 1], [4, 1], [6, 0], [8, 0]]) {
      const v = Number((m * 10 ** e).toPrecision(6));
      if (v >= a && v <= b) cands.push({ v, rank, y: at(v) });
    }
  }
  cands.sort((x, y) => y.rank - x.rank || x.v - y.v);
  const kept = [];
  for (const c of cands) if (kept.every((k) => Math.abs(k.y - c.y) >= CH_LOG_GAP)) kept.push(c);
  return kept.map((k) => k.v).sort((x, y) => x - y);
}

/* the first index in 0…len whose slot is at least `v` (`pos`: each bar's slot, ascending; none: the bars' own indices) */
function chFirst(pos, len, v) {
  if (!pos) return Math.max(0, Math.min(len, Math.ceil(v)));
  let a = 0;
  let b = len;
  while (a < b) {
    const m = (a + b) >> 1;
    if (pos[m] < v) a = m + 1;
    else b = m;
  }
  return a;
}

/** THE SCALES of the picture, for `bars` (oldest first) in a plot `w` wide and `h` high whose lowest `volH` pixels are the volume pane
 * (0: no volume pane). Each bar stands in its own slot (`pos`: its slot as chSlots counts them, holes left empty; none given, its index),
 * `slot` pixels wide, and the view is the stretch of slots that ends at `view.end` (the right edge of the usable width; `total`, the slot
 * after the newest, puts the newest bar at the right with a little room after it) — with no view, the whole history FITTED: every slot as
 * wide as fits, at most CH_MAX_SLOT (a short history sits at the right). The bars whose middles are in view are shown — `from` to `to`
 * (exclusive) — each body `bw` wide (odd, so the 1px wick is its middle). The price range is the shown bars' lowest low to highest high,
 * opened 8% either side — and further where five round ticks needed one just outside it (chNiceTicks), to a quarter step past it; `ticks`
 * are those; `bottom` is the price pane's foot (above the volume pane and its gap). `top` pixels under the pane's top edge are kept clear of
 * the bars (the readout is laid over them): where the highest high would sit higher, the range opens upward until it sits there (at most two
 * fifths of the pane). `log`: the prices on a logarithmic scale (equal steps are equal percentages), where every price shown is above zero;
 * its range opened and kept in the same proportions, its ticks chLogTicks'. Returns the functions the drawing and the crosshair share: cx(i)
 * a bar's middle column, at(x) the bar under a column (the nearest at or before it where the column is in a hole), slotAt(x) the slot
 * under it, xOf(p) a slot's left edge, y(p) a price's row, price(y) the price at a row, vh(v) a volume's height in its own pane (the highest
 * shown is the pane's height less two) */
function chScale(bars, w, h, volH = 0, top = 0, o = {}) {
  const list = bars || [];
  const len = list.length;
  const pos = o && Array.isArray(o.pos) && o.pos.length === len ? o.pos : null;
  const P = (i) => (pos ? pos[i] : i);
  const total = len ? P(len - 1) + 1 : 0;
  const usable = Math.max(1, w - CH_PAD_R);
  const view = o && o.view && o.view.slot > 0 && Number.isFinite(o.view.end) ? o.view : null;
  const slot = view ? view.slot : total ? Math.min(CH_MAX_SLOT, usable / total) : CH_MAX_SLOT;
  const end = view ? view.end : total;
  const left = end - usable / slot;
  // the bars whose middles are inside the view
  const from = Math.min(len, chFirst(pos, len, left - 0.5));
  const to = Math.max(from, chFirst(pos, len, end - 0.5 + 1e-9));
  const n = to - from;
  const xOf = (p) => usable - (end - p) * slot;
  const x0 = n ? xOf(P(from)) : usable;
  const bw0 = Math.max(1, Math.floor(slot * 0.7));
  const bw = bw0 % 2 === 0 ? bw0 - 1 : bw0;
  const cx = (i) => Math.floor(xOf(P(i) + 0.5));
  const slotAt = (x) => Math.floor(end - (usable - x) / slot);
  const at = (x) => {
    if (!n) return Math.max(0, len - 1);
    const i = chFirst(pos, len, slotAt(x) + 1) - 1;
    return Math.min(to - 1, Math.max(from, i));
  };
  let lo = Infinity;
  let hi = -Infinity;
  let vmax = 0;
  for (let i = from; i < to; i++) {
    const b = list[i];
    if (b.l < lo) lo = b.l;
    if (b.h > hi) hi = b.h;
    if (Number.isFinite(b.v) && b.v > vmax) vmax = b.v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const low = lo;
  const high = hi;
  const vH = Math.max(0, volH || 0);
  const bottom = Math.max(1, h - (vH > 0 ? vH + CH_VOL_GAP : 0));
  // the scale's own units: the prices themselves, or their logarithms
  const log = !!(o && o.log) && lo > 0;
  const T = log ? Math.log : (v) => v;
  const U = log ? Math.exp : (v) => v;
  let a = T(lo);
  let b = T(hi);
  if (b === a) {
    const d = log ? 0.01 : Math.abs(hi) * 0.01 || 1;
    a -= d;
    b += d;
  }
  const pad = (b - a) * 0.08;
  a -= pad;
  b += pad;
  // where five round ticks needed one just outside the range, the range opens to it and a quarter step more (its label is not on the edge)
  let ticks;
  if (log) ticks = chLogTicks(U(a), U(b), bottom);
  else {
    ticks = chNiceTicks(a, b, 6);
    const st = ticks.length > 1 ? ticks[1] - ticks[0] : 0;
    if (ticks.length && ticks[0] < a) a = ticks[0] - st / 4;
    if (ticks.length && ticks[ticks.length - 1] > b) b = ticks[ticks.length - 1] + st / 4;
  }
  // the room kept for the readout: the highest high no higher than `top` pixels under the edge (the range opened upward to it)
  const r = Math.min(0.4, Math.max(0, Number(top) || 0) / bottom);
  const th = T(high);
  if (r > 0 && ((b - th) / (b - a)) * bottom < r * bottom) b = (th - a * r) / (1 - r);
  const y = (p) => ((b - T(p)) / (b - a)) * bottom;
  const price = (yy) => U(b - (yy / bottom) * (b - a));
  const vh = (v) => (vmax > 0 && vH > 0 && Number.isFinite(v) && v > 0 ? Math.max(1, (v / vmax) * (vH - 2)) : 0);
  return { from, to, n, slot, end, total, usable, bw, x0, cx, at, slotAt, xOf, lo: U(a), hi: U(b), low, high, log, bottom, y, price, volTop: h - vH, volH: vH, vmax, vh, ticks };
}

// ---- pure: where each bar stands, and the holes between them ------------------------------------------------------------------------

/** WHERE EACH BAR STANDS ON THE TIME AXIS, in slots of the bars' own length `ms`, oldest first. Each bar takes the slot after the one before
 * — or, where the source has none between two bars (a minute nobody traded, an exchange's quiet hours, a stretch its own words say it has
 * none of: `gaps`), as many slots on as bars are missing, left EMPTY: never filled, never bridged. A hole of more than CH_GAP_SLOTS bars is
 * drawn as CH_GAP_SLOTS empty slots and a break line. A market that keeps SESSIONS (`sessions`: a share) steps over what it does not cover
 * — its intraday bars over each night and weekend (bars on two different days in New York: the next bar at the next slot, with a break line
 * and no empty slots), its daily and weekly bars over every closed day (a weekend or a holiday is not a missing bar). Returns
 * { pos, total, holes, ext }: pos[i] bar i's slot, total the slots from the first bar's to the last's and one, holes the stretches between
 * two bars — { i (the bar after it), a, b (its empty slots [a, b): none for a break between sessions), from, to (the time between the two
 * bars' starts), why (in words: the source's own where its gaps say one, else "No bars between sessions" or `o.none`), brk (drawn with a
 * line) } — and, for a share's intraday bars, `ext`: whether they hold the pre-market and after-hours (any bar outside 09:30–16:00 New
 * York), so a pushed trade opens a bar only inside the hours they keep */
function chSlots(bars, ms, o = {}) {
  const list = bars || [];
  const len = list.length;
  const pos = new Array(len);
  const holes = [];
  const gaps = Array.isArray(o.gaps) ? [...o.gaps].filter((g) => g && Number.isFinite(g.from) && Number.isFinite(g.to)).sort((x, y) => x.from - y.from) : [];
  const sessions = !!o.sessions;
  const daily = ms >= CH_MS["1d"];
  const none = typeof o.none === "string" && o.none ? o.none : "No bars from the source here";
  const nyDay = (t) => Math.floor((t + chOffset(t, CH_NY) * 60_000) / CH_DAY);
  let ext = false;
  let g = 0;
  let p = 0;
  for (let i = 0; i < len; i++) {
    const t = list[i].t;
    if (sessions && !daily && !ext) {
      const m = chParts(t, CH_NY).min;
      if (m < 570 || m >= 960) ext = true;
    }
    if (i === 0) {
      pos[0] = 0;
      continue;
    }
    const a = list[i - 1].t;
    const steps = Math.max(1, Math.round((t - a) / ms));
    // the source's own words for a stretch between the two, where it says one
    while (g < gaps.length && gaps[g].to <= a) g++;
    const said = g < gaps.length && gaps[g].from < t && gaps[g].to > a + ms ? gaps[g].why : "";
    if (sessions && (daily || nyDay(a) !== nyDay(t))) {
      p += 1;
      if (!daily) holes.push({ i, a: p, b: p, from: a, to: t, why: said || "No bars between sessions", brk: true });
    } else if (steps > 1) {
      const empty = Math.min(steps - 1, CH_GAP_SLOTS);
      holes.push({ i, a: p + 1, b: p + 1 + empty, from: a, to: t, why: said || none, brk: steps - 1 > CH_GAP_SLOTS });
      p += 1 + empty;
    } else p += 1;
    pos[i] = p;
  }
  return { pos, total: len ? pos[len - 1] + 1 : 0, holes, ext };
}

// ---- pure: times ------------------------------------------------------------------------------------------------------------------

/* the short month and weekday names as the chart has always written them (en-GB: "Sept", "Mon"), read once from the browser's own */
const CH_MON = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, m, 15))));
const CH_WDAY = Array.from({ length: 7 }, (_, d) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + d))));
/* A CLOCK'S OFFSET FROM UNIVERSAL TIME at an instant, in minutes: asked of the browser once for each hour of each zone (a long history's
   every bar is not asked one by one), and for an hour the clock changes inside (summer time starting or ending) at the instant itself. A
   zone the browser does not know reads as Universal Time */
const CH_OFFS = new Map();
const CH_ZFMT = new Map();
function chOffsetAt(t, zone) {
  let f = CH_ZFMT.get(zone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    } catch {
      f = null;
    }
    CH_ZFMT.set(zone, f);
  }
  if (!f) return 0;
  const p = {};
  for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  return Math.round((wall - Math.floor(t / 60_000) * 60_000) / 60_000);
}
function chOffset(t, zone) {
  if (zone === "UTC" || zone === "Etc/UTC") return 0;
  const h = Math.floor(t / 3_600_000);
  let byHour = CH_OFFS.get(zone);
  if (!byHour) CH_OFFS.set(zone, (byHour = new Map()));
  let off = byHour.get(h);
  if (off === undefined) {
    const a = chOffsetAt(h * 3_600_000, zone);
    off = a === chOffsetAt(h * 3_600_000 + 3_599_999, zone) ? a : null;
    if (byHour.size > 50_000) byHour.clear();
    byHour.set(h, off);
  }
  return off === null ? chOffsetAt(t, zone) : off;
}
/* an instant's parts on a clock: year, month (its index and its short name), day, weekday (its name and its index, Sunday 0), hour and
   minute (00–23), the minutes into its day, and its day as a key */
function chParts(t, zone) {
  const d = new Date(t + chOffset(t, zone) * 60_000);
  const y = String(d.getUTCFullYear());
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const H = d.getUTCHours();
  const M = d.getUTCMinutes();
  const dow = d.getUTCDay();
  return { y, m, mo: CH_MON[m], d: String(day), wd: CH_WDAY[dow], dow, hh: String(H).padStart(2, "0"), mm: String(M).padStart(2, "0"), min: H * 60 + M, day: `${y}-${m}-${day}` };
}
/* THE DAY A DAILY BAR STANDS FOR: the date where its start is in the morning in Universal Time (the exchanges' and Hyperliquid's bars start
   at its midnight; a share's at New York's, which is still that date there); else the date of the city whose own anchor the start is —
   New York's open, 09:30 (a share's bar stamped at the open, Cboe's) or its midnight, then Hong Kong's midnight, then Tokyo's (and
   Seoul's) — each matched exactly, so a bar from Hong Kong's midnight is never taken for New York's morning in winter; else the date in
   Universal Time */
const CH_DAY_ANCHORS = [[CH_NY, ["09:30", "00:00"]], ["Asia/Hong_Kong", ["00:00"]], ["Asia/Tokyo", ["00:00"]]];
function chDayOf(t) {
  const u = chParts(t, "UTC");
  if (Number(u.hh) < 12) return u;
  for (const [z, at] of CH_DAY_ANCHORS) {
    const p = chParts(t, z);
    if (at.includes(`${p.hh}:${p.mm}`)) return p;
  }
  return u;
}
/** a bar's time as the crosshair says it: "Tue 14 Oct 13:05" on the viewer's clock, a daily or weekly bar's day "Tue 14 Oct 2026" */
function chWhen(t, interval, zone = CH_ZONE) {
  if (!Number.isFinite(t)) return "—";
  if (interval === "1d" || interval === "1w") {
    const p = chDayOf(t);
    return `${p.wd} ${p.d} ${p.mo} ${p.y}`;
  }
  const p = chParts(t, zone);
  return `${p.wd} ${p.d} ${p.mo} ${p.hh}:${p.mm}`;
}

/** THE START OF THE BAR of `interval` that `t` falls in, on its market's clock (live/history.ts barStart, which folds the account's bars on
 * the same one): "utc" — a market that trades round the clock, its bars counted in Universal Time (four hours from midnight, days from
 * midnight, weeks from Monday's midnight); "new-york" — a share's, its four-hour buckets from 04:00 New York (04, 08, 12, 16), its day
 * stamped at its regular session's open, 09:30, and its week at its Monday's. A minute, a quarter hour and an hour start at the same
 * instants on both (New York is a whole number of hours from Universal Time) */
function chBarStart(t, interval, clock = "utc") {
  const ms = CH_MS[interval];
  if (!ms || !Number.isFinite(t)) return NaN;
  if (interval === "1w" && clock !== "new-york") return Math.floor((t - CH_MONDAY) / ms) * ms + CH_MONDAY;
  if (clock !== "new-york" || ms <= CH_MS["1h"]) return Math.floor(t / ms) * ms;
  const wall = t + chOffset(t, CH_NY) * 60_000;
  const day = Math.floor(wall / CH_DAY) * CH_DAY;
  let at;
  if (interval === "4h") at = day + Math.floor((wall - day) / CH_MS["4h"]) * CH_MS["4h"];
  else if (interval === "1d") at = day + 570 * 60_000;
  else at = day - ((new Date(day).getUTCDay() + 6) % 7) * CH_DAY + 570 * 60_000;
  // New York's wall clock back to an instant, at the offset it has then (a bucket on the far side of a summer-time change)
  const back = at - chOffset(at - chOffset(t, CH_NY) * 60_000, CH_NY) * 60_000;
  return back;
}

/* how much a time of day stands out, by bar size: the minutes of the day it is a multiple of, and its rank (a new day ranks above all) */
const CH_MARKS = {
  "1m": [[360, 3], [180, 2.5], [60, 2], [30, 1.5], [15, 1], [5, 0.5]],
  "5m": [[360, 3], [180, 2.5], [60, 2], [30, 1], [15, 0.5]],
  "15m": [[360, 3], [180, 2.5], [60, 2], [30, 1], [15, 0.5]],
  "1h": [[720, 3], [360, 2.5], [180, 2], [60, 1]],
  "4h": [[720, 3], [240, 1]],
};
/* a day on a calendar as a whole number (days since 1970-01-01 there): a day label's count, so every second or third day is a whole step */
const chDayNo = (p) => Math.round(Date.UTC(Number(p.y), p.m, Number(p.d)) / CH_DAY);
/** THE TIME AXIS'S CANDIDATES for `bars`: each bar that starts something worth a label, with its words and rank, so a view of minutes and a
 * view of years alike read well — a new year "2026" above all, then a new month "Oct" (January, April, July and October a little above
 * the rest, so a long view keeps its quarters), then a new day "15 Oct" (a Monday a little above the rest); within a day, on intraday bars,
 * the time HH:MM on the viewer's clock (`zone`) where the time of day is round (every five minutes on 1m bars, a quarter hour on 5m and
 * 15m, an hour on 1h, four hours on 4h; six hours rank above three, three above one). Daily and weekly bars are labelled by the day each
 * stands for (chDayOf). A clock half or three quarters of an hour off Universal Time (Kolkata, Kathmandu, Adelaide) never sees an hourly
 * bar start on its whole hour, so there the round times are counted from the bars' own minute (10:30, 11:30 … in Kolkata), still written
 * on that clock. The first bar has no label (nothing before it to mark a change from). Each says what it marks (`kind`: y a year, m a
 * month, d a day, t a round time — `unit`, its minutes) and where it stands on the calendar (`mi` the months since year 0, `dn` the days
 * since 1970, `at` the minutes into its day as its round times are counted: chOrd), so a level too dense for the width can be drawn every
 * second or fifth one of it, the same ones however the view moves; a day also has its short words, its number alone ("15"), as a trading
 * screen writes a day where the date does not fit. The drawing keeps the highest ranked that fit (chThin) */
function chTimeLabels(bars, interval, zone = CH_ZONE) {
  const out = [];
  const list = bars || [];
  const daily = interval === "1d" || interval === "1w";
  const marks = CH_MARKS[interval] || CH_MARKS["1h"];
  const unit = marks[marks.length - 1][0];
  const DAY_MIN = 1440;
  let prev = null;
  for (let i = 0; i < list.length; i++) {
    const t = list[i].t;
    if (!Number.isFinite(t)) continue;
    const p = daily ? chDayOf(t) : chParts(t, zone);
    if (prev) {
      // the minutes into the day as the round times are counted: the clock's offset from Universal Time in minutes, less the part of it
      // that is not a whole number of the bar size's round unit (none for a daily bar: it stands for its whole day)
      let at = 0;
      if (!daily) {
        const utc = Math.floor((((t % CH_DAY) + CH_DAY) % CH_DAY) / 60_000);
        const shift = (((p.min - utc) % DAY_MIN) + DAY_MIN) % DAY_MIN % unit;
        at = (p.min - shift + DAY_MIN) % DAY_MIN;
      }
      const when = { mi: Number(p.y) * 12 + p.m, dn: chDayNo(p), at };
      if (p.y !== prev.y) out.push({ i, t, text: p.y, rank: 8, kind: "y", ...when });
      else if (p.m !== prev.m) out.push({ i, t, text: p.mo, rank: p.m % 3 === 0 ? 6.5 : 6, kind: "m", ...when });
      else if (p.day !== prev.day) {
        const monday = p.dow === 1;
        out.push({ i, t, text: `${p.d} ${p.mo}`, short: p.d, rank: daily ? (monday && interval === "1d" ? 2 : 1) : monday ? 4.5 : 4, kind: "d", ...when });
      } else if (!daily) {
        const mark = marks.find(([k]) => at % k === 0);
        if (mark) out.push({ i, t, text: `${p.hh}:${p.mm}`, rank: mark[1], kind: "t", unit: mark[0], ...when });
      }
    }
    prev = p;
  }
  return out;
}
/* a time label's width at the axis's size (11px), a little wider than its words */
const chLabelW = (text) => Math.ceil(String(text).length * 6.2) + 4;
/* the steps a level too dense for the width is drawn in, by what it marks (chTimeLabels `kind`): every 2nd, 5th, 10th … year; every 2nd
   month (of the quarters' months: July, the half year) or 3rd; every 2nd, 3rd, 5th or 10th day; every 2nd, 3rd, 4th or 6th round time */
const CH_STEPS = { y: [2, 5, 10, 25, 50, 100], m: [2, 3, 6], d: [2, 3, 5, 10], t: [2, 3, 4, 6] };
/* where a label stands counted in another kind's own units (chTimeLabels): its year, its month, its day, its round time of `unit` minutes
   — so a step of that kind can be told to fall on it or not (a year is every second month's count, a midnight every second six hours') */
const chOrd = (l, kind, unit) => (kind === "y" ? Math.floor(l.mi / 12) : kind === "m" ? l.mi : kind === "d" ? l.dn : (l.dn * 1440 + l.at) / unit);
/** THE LABELS THAT FIT, rank by rank from the highest: each whole inside the plot `w` wide and at least CH_LABEL_PAD pixels clear of every
 * one kept, edge to edge (so a long label never runs into a short one). A label that would touch one of a higher rank gives way to it. A
 * rank whose own labels would touch one another is too dense for this width, and is the last drawn — no finer one squeezes in between (where
 * the days have no room, no time of day comes between two Mondays), so the labels keep an even step — but it is drawn EVENLY STEPPED rather
 * than let go where that keeps the step even, so the axis is never bare while it has candidates: a day by its number alone where the date
 * does not fit ("13 14 15", as a trading screen writes them, the days already kept written so too), else every k-th of it by its count on
 * the calendar (chOrd: years 1995, 2000, 2005 …; every second day; July, the half year), the smallest step of CH_STEPS whose labels clear
 * one another — the date's words before the number's at the same step. A step is taken only where every label kept already falls on it
 * (the years on every second month, the midnights on every second six hours): a step the months or the Mondays kept would break is not,
 * and they alone give the axis its step. Where even that leaves none (a candidate wider than the plot's room around it), the highest
 * ranked candidate nearest the middle stands alone. In their order along the axis */
function chThin(labels, cx, w) {
  let kept = [];
  const ranks = new Map();
  for (const l of labels) {
    const x = cx(l.i);
    // inside the plot in its shortest words at least (its own words are checked as it is drawn)
    const least = chLabelW(l.short || l.text) / 2;
    if (x - least < 0 || x + least > w) continue;
    if (!ranks.has(l.rank)) ranks.set(l.rank, []);
    ranks.get(l.rank).push({ ...l, x });
  }
  // a label in its date's words or its short ones: its words and half its width — none where those words do not fit inside the plot
  const as = (l, short) => {
    const text = short && l.short ? l.short : l.text;
    const half = chLabelW(text) / 2;
    return l.x - half < 0 || l.x + half > w ? null : { ...l, text, half };
  };
  const clear = (a, b) => Math.abs(a.x - b.x) >= a.half + b.half + CH_LABEL_PAD;
  const apart = (g) => g.every((l, k) => k === 0 || clear(l, g[k - 1]));
  const add = (g) => {
    for (const l of g) if (kept.every((k) => clear(k, l))) kept.push(l);
  };
  const order = [...ranks.keys()].sort((a, b) => b - a);
  for (const rank of order) {
    const all = ranks.get(rank).sort((a, b) => a.x - b.x);
    const whole = all.map((l) => as(l, false)).filter(Boolean);
    if (apart(whole)) {
      add(whole);
      continue;
    }
    // too dense: the first way of drawing it evenly that fits — every one in short words, then every k-th in either
    const { kind, unit } = all[0];
    const on = (l, k) => {
      const o = chOrd(l, kind, unit);
      return Number.isInteger(o) && ((o % k) + k) % k === 0;
    };
    const shortOk = all.some((l) => l.short);
    const ways = [...(shortOk ? [[1, true]] : []), ...(CH_STEPS[kind] || []).flatMap((k) => (shortOk ? [[k, false], [k, true]] : [[k, false]]))];
    for (const [k, short] of ways) {
      if (k > 1 && !kept.every((q) => on(q, k))) continue;
      const sub = all.filter((l) => k === 1 || on(l, k)).map((l) => as(l, short)).filter(Boolean);
      if (!sub.length || !apart(sub)) continue;
      // the days kept already written as this rank is: by their number alone
      if (short) kept = kept.map((l) => (l.kind === kind && l.short ? { ...l, text: l.short, half: chLabelW(l.short) / 2 } : l));
      add(sub);
      break;
    }
    break;
  }
  if (!kept.length && order.length) {
    const top = ranks.get(order[0]).map((l) => as(l, true)).filter(Boolean);
    const mid = top.sort((a, b) => Math.abs(a.x - w / 2) - Math.abs(b.x - w / 2))[0];
    if (mid) kept.push(mid);
  }
  return kept.sort((a, b) => a.x - b.x);
}

// ---- pure: the readout and the live price -------------------------------------------------------------------------------------------

/* a small number as its two significant figures, in plain decimals (0.004, never 4e-3) */
const chTwoSig = (v) => {
  const n = Number(Math.abs(v).toPrecision(2));
  return n.toFixed(Math.min(20, chDecimalsOf(n)));
};

/** THE READOUT for one bar: "O 83,134 H 84,103 L 81,556 C 81,901 −1,233.0 (−1.48%)" — its open, high, low and close in `fmt` (chFmt), then
 * its change from the close before it (`prevClose`; none for the first bar) in the same figures and in percent, signed (+ or −: never the
 * colour alone). A change too small for the market's figures (0.004 on two decimals) is said to two significant figures, as the percent
 * is — never a rounded zero with a sign on it ("+0.00"). Returns { text, html }: the html keeps each key with its figure (and the change
 * whole) in one unit that never breaks across lines, and tints the four figures by the bar's direction and the change by its own */
function chReadout(bar, prevClose, fmt) {
  if (!bar) return { text: "", html: "" };
  const f = typeof fmt === "function" ? fmt : chFmt(2, false);
  const dir = bar.c >= bar.o ? "up" : "down";
  const parts = [["O", bar.o], ["H", bar.h], ["L", bar.l], ["C", bar.c]];
  let text = parts.map(([k, v]) => `${k} ${f(v)}`).join(" ");
  let html = parts.map(([k, v]) => `<span class="ch-kv"><span class="ch-k">${k}</span> <span class="ch-v ${dir}">${esc(f(v))}</span></span>`).join(" ");
  const pc = prevClose === null || prevClose === undefined ? NaN : Number(prevClose);
  if (Number.isFinite(pc)) {
    const d = Number((bar.c - pc).toPrecision(12));
    const sign = d > 0 ? "+" : d < 0 ? "−" : "";
    // a change under a hundredth of a percent is said to two significant figures (+3.79 on 81,500 is +0.0047%, never "+0.00%")
    const pa = Math.abs((d / pc) * 100);
    const pct = pc !== 0 ? ` (${sign}${pa > 0 && pa < 0.01 ? chTwoSig(pa) : pa.toFixed(2)}%)` : "";
    let size = f(Math.abs(d), true);
    if (d !== 0 && !/[1-9]/.test(size)) size = size.replace(/[\d.,]+/, chTwoSig(d));
    const words = `${sign}${size}${pct}`;
    text += ` ${words}`;
    html += ` <span class="ch-d${d > 0 ? " up" : d < 0 ? " down" : ""}">${esc(words)}</span>`;
  }
  return { text, html };
}

/** how many lines the readout takes laid over a plot `width` pixels wide, at most: four keys with figures `wide` characters long and the
 * change after them (its figures, its sign and its percent: the widest it can be), each a unit that does not break, packed as the words
 * wrap with the gap between two. `small`: the narrow chart's smaller words. An estimate on the wide side, so the room kept under the plot's
 * top edge holds the readout of any bar shown — the room is set per layout, never by the bar the pointer is on */
function chReadoutLines(wide, width, small = false, extra = []) {
  const cw = small ? CH_CHAR_W_SMALL : CH_CHAR_W;
  const gap = small ? CH_GAP_SMALL : CH_GAP;
  const kv = (wide + 2) * cw;
  const units = [kv, kv, kv, kv, (wide + 13) * cw, ...(Array.isArray(extra) ? extra.map((n) => n * cw) : [])];
  const room = Math.max(40, width - CH_RO_LEFT - 4);
  let lines = 1;
  let x = 0;
  for (const u of units) {
    if (x > 0 && x + gap + u > room) {
      lines++;
      x = 0;
    }
    x += (x > 0 ? gap : 0) + u;
  }
  return lines;
}

/** A LIVE PRICE ON THE LAST BAR: `quote` { price, at } (at in ms) moves the last of `bars` — its close, and its high or low where the price
 * passes them — only when `at` is inside that bar's interval [t, t + intervalMs). Never a new bar. True when the bar changed */
function chApplyQuote(bars, quote, intervalMs) {
  const last = bars && bars.length ? bars[bars.length - 1] : null;
  if (!last || !quote || !Number.isFinite(quote.price) || !Number.isFinite(quote.at) || !Number.isFinite(intervalMs)) return false;
  if (quote.at < last.t || quote.at >= last.t + intervalMs) return false;
  const p = quote.price;
  if (last.c === p && last.h >= p && last.l <= p) return false;
  last.c = p;
  if (p > last.h) last.h = p;
  if (p < last.l) last.l = p;
  return true;
}

/** A PUSHED PRICE ON THE BARS: `tick` { price, at, bar? } — a real tick from the account's stream, `at` its venue's own moment (ms), `bar`
 * the venue's own live one-minute bar where its stream sends one ({ t, o, h, l }). Inside the last bar's interval it moves that bar as a
 * live price does (chApplyQuote), and a one-minute bar inside it widens its high and low to every trade of that minute. Past the last bar's
 * end — where `opens`: the tick is a TRADE (a quote's last trade may be from before the boundary, so a quote never opens a bar), at a moment
 * its market's bars cover — it STARTS the bar its moment falls in, at that interval's boundary: `startOf(at)` where the caller knows its
 * market's clock (chBarStart), else counted from the last bar's start (never a bar between the two: nothing heard traded there), opening at
 * the one-minute bar's open where that bar starts at the same boundary (the minute's first trade), else at the trade; it carries no volume
 * of its own (the source's comes with the next read). A tick from before the last bar's start moves nothing. True when the bars changed */
function chApplyTick(bars, tick, intervalMs, opens = false, startOf = null) {
  const last = bars && bars.length ? bars[bars.length - 1] : null;
  if (!last || !tick || !Number.isFinite(tick.price) || !(tick.price > 0) || !Number.isFinite(tick.at) || !(intervalMs > 0)) return false;
  if (tick.at < last.t) return false;
  const m = tick.bar && [tick.bar.t, tick.bar.o, tick.bar.h, tick.bar.l].every((v) => Number.isFinite(v)) ? tick.bar : null;
  const p = tick.price;
  if (tick.at < last.t + intervalMs) {
    let changed = chApplyQuote(bars, tick, intervalMs);
    if (m && m.t >= last.t && m.t < last.t + intervalMs) {
      if (m.h > last.h) {
        last.h = m.h;
        changed = true;
      }
      if (m.l < last.l) {
        last.l = m.l;
        changed = true;
      }
    }
    return changed;
  }
  if (!opens) return false;
  const t = typeof startOf === "function" ? startOf(tick.at) : last.t + Math.floor((tick.at - last.t) / intervalMs) * intervalMs;
  if (!Number.isFinite(t) || t <= last.t || t > tick.at) return false;
  const first = m && m.t === t ? m : null;
  const o = first ? first.o : p;
  bars.push({ t, o, h: Math.max(o, p, first ? first.h : -Infinity), l: Math.min(o, p, first ? first.l : Infinity), c: p });
  return true;
}

/** A SHARE'S DAILY BAR TAKES ONLY THE REGULAR SESSION'S PRICE. Its source's daily bar is the regular session's open, high, low and close
 * (Cboe's stamped at the 09:30 open, Alpaca's at New York's midnight), and its day [t, t + 24 h) also holds the after-hours, the overnight
 * and the next pre-market, whose prices are no part of it. So a live price moves it only while the market's session (`session`, as the
 * venue says it: Market.session) is the regular one — phase "regular", or open with no phase — and the price's own time (`at`, ms) is inside
 * 09:30–16:00 New York. Where the venue says no session, the source's bar is left as it drew it */
function chRegular(session, at) {
  if (!session || typeof session !== "object") return false;
  if (!(session.phase === "regular" || (session.open === true && !session.phase))) return false;
  if (!Number.isFinite(at)) return false;
  const m = chParts(at, CH_NY).min;
  return m >= 570 && m < 960;
}

// ---- mounting -----------------------------------------------------------------------------------------------------------------------

/* the page is hidden (another tab, a minimised window): nothing is asked */
const chHidden = () => typeof document !== "undefined" && (document.visibilityState === "hidden" || document.hidden === true);
/* the plot is laid out: false while its pane is not the one showing (shell.js hides a pane with `hidden`, so el stays in the document
   while the owner is on Portfolio or Markets) — then nothing is asked either */
const chLaidOut = (s) => {
  const plot = s.parts && s.parts.plot;
  return !plot || typeof plot.getClientRects !== "function" || plot.getClientRects().length > 0;
};
/* a chart's state is the one mounted on its element, still mounted */
const chLive = (s) => s.alive && CH.get(s.el) === s;
/* a bar size's words in the menu */
const chIvWord = (iv) => (CH_INTERVALS.find(([v]) => v === iv) || [iv, iv])[1];
/* the viewer's clock in words, for the foot: "Hong Kong time", "UTC" */
const chZoneWords = (zone = CH_ZONE) => (zone === "UTC" || zone === "Etc/UTC" ? "UTC" : `${String(zone).split("/").pop().replace(/_/g, " ")} time`);
/* a share's daily and weekly bars are its regular session's own: no live price outside it moves them, and none starts one */
const chSessionBars = (s) => s.kind === "stock" && CH_MS[s.biv] >= CH_MS["1d"];
/* the clock a market's bars are counted on (chBarStart) */
const chClock = (s) => (s.kind === "stock" ? "new-york" : "utc");

/** the chart drawn into el on one market (see the head of this file). Mounting again on el releases what was mounted there first */
function chMount(el, opts = {}) {
  if (!el) return;
  chRelease(el);
  const m = opts.quote && typeof opts.quote === "object" ? opts.quote : null;
  const kind = String(opts.kind || (m && m.kind) || "");
  const range = CH_RANGE_BAR[opts.range] ? opts.range : CH_MS[opts.interval] ? CH_IV_RANGE[opts.interval] : "1M";
  const interval = CH_MS[opts.interval] ? opts.interval : CH_RANGE_BAR[range];
  const s = {
    el,
    venue: String(opts.venue || "").trim(),
    symbol: String(opts.symbol || "").trim(),
    kind,
    ev: kind === "event",
    cur: m ? String(m.quote || "") : String(opts.quote || ""),
    step: opts.priceStep !== undefined ? Number(opts.priceStep) : m ? Number(m.priceStep) : NaN,
    onRange: typeof opts.onRange === "function" ? opts.onRange : null,
    onInterval: typeof opts.onInterval === "function" ? opts.onInterval : null,
    onLog: typeof opts.onLog === "function" ? opts.onLog : null,
    // whether the head offers the window-filling view (the pages that frame the chart ask for it), and whether it fills the window now
    fullscreen: opts.fullscreen === true,
    full: false,
    // the indicators (ui/indicators.js): the list on, what they computed last and for which bars (chLayout computes them again as the
    // bars change), whether their menu is open, and the page's keeper of the list
    ind: typeof inParse === "function" ? inParse(opts.indicators) : [],
    indOut: [],
    indKey: "",
    indOpen: false,
    onIndicators: typeof opts.onIndicators === "function" ? opts.onIndicators : null,
    // the range asked, the bar size asked (the range's own, or the owner's pick), the bar size the bars came in (a source may draw a range
    // in a coarser one), and the price scale
    range,
    interval,
    biv: interval,
    log: opts.log === true && kind !== "event",
    alive: true,
    // how long after a refused read with no bars the next one waits (0: bars stand, or nothing refused yet)
    wait: 0,
    // the reads: how many were asked (the latest answer is the one drawn), one on its way, when the last landed
    reads: 0,
    reading: false,
    readAt: 0,
    // what the source said: its bars (null until it answered with some), its refusal's words, its name, the figures' decimals (and what
    // they are read from), what else it said of the bars (source, adjustment, session, folded, note, gaps, today), whether older bars exist
    // and where its history ends
    bars: null,
    said: "",
    venueName: "",
    dec: 2,
    decStat: { d: 0, top: 0 },
    meta: {},
    edge: null,
    // whose bars the series holds, stretch by stretch, oldest first: { from (the first bar's start), source, adjustment, session } — one
    // stretch where every bar is one source's; another where a page scrolled left (or a read again) brought another source's bars, joined
    // with a seam the picture draws and the foot says (chSeams)
    segs: [],
    // what is worked out from the bars once each time they change, not every frame: their slots and holes, the time axis's candidates; the
    // count of such changes (the picture is drawn again only when it or the scale changed)
    slots: null,
    labels: null,
    sver: 0,
    // the view: null, the range fitted; else { slot, end } (chScale) — and the pages asked before the oldest bar: their count, the one on
    // its way, when one may be asked again after a refusal (and how long that wait now is), the refusal's words, how many came
    view: null,
    paging: { n: 0, busy: false, wait: 0, delay: 0, said: "" },
    paged: 0,
    // the latest live price { price, at, readAt } (readAt: when the page had it; a pushed one also `seen`, the moment its stream last
    // confirmed it, and `pushed`), and when one may be asked again after a refusal
    quote: null,
    quoteWait: 0,
    // the read of the live price last asked; what the stream pushed (the seq of its last message taken, when, whether its market is live
    // there now), the start of a bar started here from a pushed tick (0: none) and when the bars are read again to reconcile it, and the
    // pushed quote waiting to be counted as drawn (stDrawn); the venue moment of the newest pushed trade laid on the bars (one no newer is
    // not laid again), and the venue's own live one-minute bar as its stream last sent it (where a trade starting a bar opens it)
    quoteAskedAt: 0,
    pushSeq: -Infinity,
    pushAt: 0,
    pushLive: false,
    local: 0,
    reconcileAt: 0,
    lagQ: null,
    tradeAt: 0,
    vbar: null,
    timer: 0,
    ro: null,
    off: [],
    // the plot laid out when last looked (its pane showing): the size observer asks at once when it comes back
    shown: true,
    // the layout the picture was drawn with (and what the picture under the live layer was drawn for), the crosshair's parts, where the
    // pointer or the keys put it, the pointers pressed on the plot (a drag, a pinch)
    L: null,
    staticKey: "",
    x: null,
    hover: null,
    ptrs: new Map(),
    drag: null,
    pinch: null,
    queued: false,
    drawQueued: false,
    // the account's own lines over the plot (chLines), what a drag hands them to, the line being dragged ({ line, price, y0, moved, id }),
    // and whether the pointer is over one that drags (the plot's cursor says so)
    lines: [],
    onLine: null,
    lineDrag: null,
    lineHover: false,
    // the desk's trades over the plot (chMarks)
    marks: [],
  };
  CH.set(el, s);
  paint(el, chShell(s));
  const q = (sel) => el.querySelector(sel);
  s.parts = { head: q(".ch-head"), pop: q(".ch-ind-pop"), ohlc: q(".ch-ohlc"), plot: q(".ch-plot"), draw: q(".ch-draw"), live: q(".ch-live"), ind: q(".ch-ind"), lines: q(".ch-lines"), hint: q(".ch-hint"), now: q(".ch-now"), cross: q(".ch-cross"), foot: q(".ch-foot") };
  if (!s.parts.plot || !s.parts.draw) return;
  if (!s.venue || !s.symbol) return void paint(s.parts.draw, '<p class="ch-msg">No market to chart.</p>');
  s.shown = chLaidOut(s);
  chWire(s);
  chRead(s, true);
  s.timer = setTimeout(() => chTick(s), CH_POLL_MS);
}

/** what was mounted on el stopped: its timer, its listeners, its size observer. The drawing stays until the page draws over it */
function chRelease(el) {
  const s = el ? CH.get(el) : null;
  if (!s) return;
  CH.delete(el);
  s.alive = false;
  clearTimeout(s.timer);
  s.timer = 0;
  for (const off of s.off) off();
  s.off = [];
  // the window-filling view let go with the chart: the page is its own layout again
  if (s.full) chFullMark(s, false);
  s.full = false;
  if (s.ro) s.ro.disconnect();
  s.ro = null;
  s.ptrs.clear();
  s.drag = null;
  s.pinch = null;
  s.lineDrag = null;
}

/** the bar size the chart on el shows (the bars' own, where the source drew the range in a coarser one); "" where none is mounted */
function chInterval(el) {
  const s = el ? CH.get(el) : null;
  return s ? s.biv || s.interval : "";
}
/** the range the chart on el shows; "" where none is mounted */
function chRange(el) {
  const s = el ? CH.get(el) : null;
  return s ? s.range : "";
}
/** THE ACCOUNT'S OWN LINES on the chart mounted on el (see the head of this file): kept, and drawn in the next frame. A line with no price is
 * no line; a drag the page offers no handler for is no drag */
function chLines(el, lines, { onDrag } = {}) {
  const s = el ? CH.get(el) : null;
  if (!s) return;
  const kinds = new Set(CH_LINE_KINDS);
  s.lines = (Array.isArray(lines) ? lines : []).filter((l) => l && Number(l.price) > 0).slice(0, CH_LINES_MOST).map((l) => ({ id: String(l.id || ""), price: Number(l.price), label: String(l.label || ""), ...(l.short ? { short: String(l.short) } : {}), kind: kinds.has(l.kind) ? l.kind : "entry", ...(typeof onDrag === "function" && (l.drag === "limitPrice" || l.drag === "stopPrice") ? { drag: l.drag } : {}), ...(l.ref !== undefined ? { ref: l.ref } : {}), ...(l.fresh === true ? { fresh: true } : {}) }));
  s.onLine = typeof onDrag === "function" ? onDrag : null;
  // a line being pulled that is gone (its order filled or canceled meanwhile) is let go
  if (s.lineDrag && !s.lines.some((l) => l.id === s.lineDrag.line.id)) s.lineDrag = null;
  chSoon(s);
}
/* the kinds of line, each its own colour (chart.css): an order to buy or to sell, a take-profit, a stop-loss, a trailing stop's stop, a
   position's entry, its liquidation price */
const CH_LINE_KINDS = ["buy", "sell", "tp", "sl", "trail", "entry", "liq"];
const CH_LINES_MOST = 40;
/* how near the pointer must be to a line to pull it, in pixels either side */
const CH_LINE_GRAB = 5;
/** a price moved to the market's own step (the nearest); no step known, as it is */
function chSnap(price, step) {
  const p = Number(price);
  const st = Number(step);
  if (!Number.isFinite(p)) return NaN;
  if (!(st > 0)) return Number(p.toPrecision(10));
  return Number((Math.round(p / st) * st).toFixed(Math.min(12, chDecimalsOf(st))));
}
/** the line that drags under a pointer at row `y` of the plot (within CH_LINE_GRAB pixels; the nearest), or null */
function chLineAt(s, y) {
  const L = s && s.L;
  if (!L || !Array.isArray(s.lines)) return null;
  let best = null;
  let d = CH_LINE_GRAB + 0.5;
  for (const l of s.lines) {
    if (!l.drag) continue;
    const ly = L.sc.y(l.price);
    if (!Number.isFinite(ly) || ly < 0 || ly > L.sc.bottom) continue;
    const dd = Math.abs(ly - y);
    if (dd < d) {
      d = dd;
      best = l;
    }
  }
  return best;
}
/** THE LINES' LAYER, as one small SVG string over the live layer: each line in view across the price pane — dashed, in its kind's colour —
 * its words in a tag at the left and its price in a tag on the axis; a line being pulled at the price it would go to, its words saying so
 * ("→ 61,250"). A line out of the pane's range is not drawn (the scale is the bars') */
function chLinesSvg(s, L) {
  if (!L || !Array.isArray(s.lines) || !s.lines.length) return "";
  const { sc, plotW, axisW, W, H, fmt } = L;
  // the last price's own tag on the axis is never covered: a line's price tag that would sit on it is left out (its words at the left say it)
  const B = s.bars || [];
  const lastY = B.length ? Math.min(L.priceH - 9, Math.max(9, Math.round(sc.y(B[B.length - 1].c)))) : NaN;
  // a narrow plot says each line by its kind and size alone (its `short`), the whole of it on the row it stands for
  const narrow = plotW < CH_LINES_NARROW_W;
  const items = [];
  for (const l of s.lines) {
    const pulled = s.lineDrag && s.lineDrag.moved && s.lineDrag.line.id === l.id ? s.lineDrag.price : null;
    const price = pulled !== null ? pulled : l.price;
    const y = Math.round(sc.y(price));
    if (!Number.isFinite(y) || y < 0 || y > sc.bottom) continue;
    items.push({ l, pulled, price, y, ty: Math.min(sc.bottom - 8, Math.max(8, y)) });
  }
  // THE TAGS STACKED, never one over another: by where each would sit, each at least CH_TAG_GAP under the one above it, a stack that runs
  // past the plot's foot lifted back as a whole — the words at the left one stack, the prices on the axis another (beside the last price's
  // own tag, which none covers: a line whose axis tag would, says its price in its words instead)
  const stack = (list) => {
    list.sort((a, b) => a.ty - b.ty);
    let prev = -Infinity;
    for (const it of list) prev = it.at = Math.max(it.ty, prev + CH_TAG_GAP);
    let lim = sc.bottom - 8;
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].at = Math.min(list[i].at, lim);
      lim = list[i].at - CH_TAG_GAP;
    }
  };
  const left = items.map((it) => ({ it, ty: it.ty }));
  stack(left);
  for (const x of left) x.it.ly = x.at;
  let axis = items.map((it) => ({ it, ty: it.ty }));
  stack(axis);
  if (Number.isFinite(lastY) && axis.some((x) => Math.abs(x.at - lastY) < CH_TAG_GAP)) {
    axis = axis.filter((x) => Math.abs(x.at - lastY) >= CH_TAG_GAP).map((x) => ({ it: x.it, ty: x.it.ty }));
    stack(axis);
    axis = axis.filter((x) => Math.abs(x.at - lastY) >= CH_TAG_GAP);
  }
  for (const x of axis) x.it.ay = x.at;
  let out = "";
  for (const it of items) {
    const { l, pulled, price, y } = it;
    const axisOn = it.ay !== undefined;
    const name = narrow && l.short ? l.short : l.label;
    const words = `${name}${pulled !== null ? ` → ${fmt(pulled)}` : axisOn ? "" : ` · ${fmt(price)}`}`;
    const tw = Math.ceil(words.length * 6.2) + 10;
    const axisTag = axisOn ? `<rect class="ch-lnr" x="${plotW + 1}" y="${it.ay - 8}" width="${axisW - 1}" height="16" rx="3"/><text class="ch-lnt" x="${plotW + 6}" y="${it.ay + 4}">${esc(fmt(price))}</text>` : "";
    out += `<g class="ch-ln ${esc(l.kind)}${l.drag ? " drag" : ""}${pulled !== null ? " pulled" : ""}${l.fresh ? " fresh" : ""}" data-ln="${esc(l.id)}"><title>${esc(`${l.label} · ${fmt(price)}`)}</title><path class="ch-lnl" d="M0 ${y + 0.5}H${plotW}"/><rect class="ch-lnr" x="2" y="${it.ly - 8}" width="${tw}" height="16" rx="3"/><text class="ch-lnt" x="7" y="${it.ly + 4}">${esc(words)}</text>${axisTag}</g>`;
  }
  return out ? `<svg class="ch-svg ch-lnsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${out}</svg>` : "";
}

/** THE DESK'S TRADES on the chart mounted on el (see the head of this file): kept, and drawn in the next frame. A trade with no price or no
 * moment is none */
function chMarks(el, marks) {
  const s = el ? CH.get(el) : null;
  if (!s) return;
  const tones = new Set(["up", "down", "ink"]);
  s.marks = (Array.isArray(marks) ? marks : []).filter((m) => m && Number(m.price) > 0 && Number.isFinite(Number(m.t))).slice(0, CH_MARKS_MOST).map((m) => ({ id: String(m.id || ""), t: Number(m.t), price: Number(m.price), side: m.side === "sell" ? "sell" : "buy", kind: m.kind === "out" ? "out" : "in", label: String(m.label || ""), ...(m.short ? { short: String(m.short) } : {}), tone: tones.has(m.tone) ? m.tone : m.side === "sell" ? "down" : "up", lead: String(m.lead || ""), fresh: m.fresh === true, quiet: m.quiet === true, ...(m.float ? { float: String(m.float), floatTone: m.floatTone === "down" ? "down" : "up" } : {}) }));
  chSoon(s);
}
const CH_MARKS_MOST = 60;
/* a trade's tag: its height, how far from its dot, and the room kept between two tags that would meet */
const CH_MARK_TAG_H = 20;
const CH_MARK_GAP = 12;
/** the bar a moment falls in: the last bar that starts at or before it — the last bar only while the moment is before its end (a later
 * moment is a bar not read yet). -1 where no bar holds it */
function chBarOf(bars, t, ms) {
  const n = Array.isArray(bars) ? bars.length : 0;
  if (!n || !Number.isFinite(t)) return -1;
  let lo = 0;
  let hi = n - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t <= t) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (at < 0) return -1;
  return at === n - 1 && t >= bars[at].t + (Number(ms) > 0 ? Number(ms) : 0) ? -1 : at;
}
/** THE TRADES' LAYER, as one small SVG string over the lines: each trade whose bar is in view and whose price is in the pane — its dot, its
 * tag (an entry's under the dot, an exit's over it, flipped where the pane's edge is near, moved off a tag it would cover), a lead's entry
 * and exit joined; a narrow plot says each by its `short` */
function chMarksSvg(s, L) {
  if (!L || !Array.isArray(s.marks) || !s.marks.length || !Array.isArray(s.bars) || !s.bars.length) return "";
  const { sc, plotW, W, H } = L;
  const ms = CH_MS[s.biv] || CH_MS[s.interval] || 0;
  const narrow = plotW < CH_LINES_NARROW_W;
  const placed = [];
  const at = new Map();
  for (const m of s.marks) {
    const i = chBarOf(s.bars, m.t, ms);
    if (i < sc.from || i >= sc.to) continue;
    const x = sc.cx(i) + 0.5;
    const y = Math.round(sc.y(m.price)) + 0.5;
    if (!Number.isFinite(y) || y < 0 || y > sc.bottom) continue;
    placed.push({ m, x, y });
    if (m.lead) at.set(`${m.lead}|${m.kind}`, { x, y });
  }
  if (!placed.length) return "";
  let out = "";
  for (const p of placed) {
    const a = p.m.kind === "out" && p.m.lead ? at.get(`${p.m.lead}|in`) : null;
    if (a) out += `<path class="ch-mkj" d="M${a.x} ${a.y}L${p.x} ${p.y}"/>`;
  }
  const h = CH_MARK_TAG_H;
  const boxes = [];
  for (const p of placed.sort((a, b) => a.x - b.x)) {
    const words = p.m.quiet ? "" : narrow && p.m.short ? p.m.short : p.m.label;
    let tag = "";
    if (words) {
      const w = Math.ceil(words.length * 6.6) + 14;
      let below = p.m.kind === "in";
      const x = Math.round(Math.min(plotW - w - 2, Math.max(2, p.x - w / 2)));
      let y = below ? p.y + CH_MARK_GAP : p.y - CH_MARK_GAP - h;
      if (below && y + h > sc.bottom) below = false;
      else if (!below && y < 2) below = true;
      y = below ? p.y + CH_MARK_GAP : p.y - CH_MARK_GAP - h;
      for (let k = 0; k < 4 && boxes.some((b) => x < b.x + b.w && b.x < x + w && y < b.y + b.h + 2 && b.y < y + h + 2); k++) y += below ? h + 4 : -(h + 4);
      y = Math.round(Math.min(sc.bottom - h, Math.max(2, y)));
      boxes.push({ x, y, w, h });
      tag = `<path class="ch-mks" d="M${p.x} ${below ? p.y + 5 : p.y - 5}V${below ? y : y + h}"/><rect class="ch-mkr" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/><text class="ch-mkt" x="${x + 7}" y="${y + 14}">${esc(words)}</text>`;
    }
    // one that just happened: a ring pulsing round its dot, and an exit's result floating up beside it once
    const fresh = p.m.fresh ? `<circle class="ch-mkp" cx="${p.x}" cy="${p.y}" r="6"/>${p.m.float ? `<text class="ch-mkf ${p.m.floatTone}" x="${Math.round(p.x + 12)}" y="${Math.round(p.y + 5)}">${esc(p.m.float)}</text>` : ""}` : "";
    out += `<g class="ch-mk ${p.m.tone} ${p.m.kind}${p.m.fresh ? " fresh" : ""}" data-k="mk:${esc(p.m.id)}" data-mk="${esc(p.m.id)}"><title>${esc(p.m.label)}</title>${fresh}${tag}<circle class="ch-mkd" cx="${p.x}" cy="${p.y}" r="5"/></g>`;
  }
  return `<svg class="ch-svg ch-mksvg" data-k="marks" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${out}</svg>`;
}

/* the frame: the head (a box of fixed height), the plot (the picture, the live layer over it, the readout laid over its corner, the hint at
   its foot, the crosshair over all), the foot (a box of fixed height). The readout and the hint are inside the plot and out of the flow:
   their words never change a box's size */
function chShell(s) {
  const how = `Price chart of ${s.symbol}: point at a bar, or use the arrow keys, to read it; drag or scroll sideways to move through time, and the wheel, a pinch, or the plus and minus keys to zoom; double-click to fit the range again`;
  return `<div class="ch" data-k="ch:${esc(s.venue)}|${esc(s.symbol)}"><div class="ch-head">${chHeadHtml(s)}</div><div class="ch-ind-pop" data-ch-pop role="dialog" aria-label="Indicators" hidden></div><div class="ch-plot" tabindex="0" role="group" aria-label="${esc(how)}"><div class="ch-draw"></div><div class="ch-live"></div><div class="ch-ind"></div><div class="ch-lines"></div><div class="ch-ohlc"></div><p class="ch-hint" aria-live="polite"></p><button type="button" class="ch-now" data-ch-now hidden aria-label="Back to the newest bar">Now →</button><div class="ch-cross" aria-hidden="true"></div></div><p class="ch-foot"></p></div>`;
}
/* the head: the ranges, the bar sizes' menu (the size the bars are drawn in), the log switch (not for an event contract's cents, which are
   0 to 100) */
function chHeadHtml(s) {
  // a range is pressed only while its bars are its own size: another size picked over it (1Y in minutes) is the owner's own view, and no
  // range's label stands over a few days of bars
  const ranges = CH_RANGES.map(([r]) => `<button type="button" class="ch-iv" data-ch-r="${r}" aria-pressed="${r === s.range && s.interval === CH_RANGE_BAR[r]}" data-fk="ch-r:${r}">${r}</button>`).join("");
  const shown = s.biv || s.interval;
  const sizes = CH_INTERVALS.map(([v, w]) => `<option value="${v}"${v === shown ? " selected" : ""}>${w}</option>`).join("");
  const log = s.ev ? "" : `<button type="button" class="ch-iv ch-log" data-ch-log aria-pressed="${s.log}" data-fk="ch-log" title="Logarithmic price scale: equal steps are equal percentages">Log</button>`;
  // the indicators' menu, with how many are on
  const nInd = Array.isArray(s.ind) ? s.ind.length : 0;
  const ind = typeof inCompute === "function" ? `<button type="button" class="ch-iv ch-indb" data-ch-ind aria-expanded="${!!s.indOpen}" aria-haspopup="dialog" data-fk="ch-ind" title="Indicators: moving averages, Bollinger bands, VWAP, RSI, MACD, the stochastic, ATR">Indicators${nInd ? ` · ${nInd}` : ""}</button>` : "";
  // the window-filling view, where the page asked for it: the corners point out, or back in while the chart fills the window
  const full = s.fullscreen ? `<button type="button" class="ch-iv ch-fullb" data-ch-full aria-pressed="${s.full}" data-fk="ch-full" aria-label="${s.full ? "Back to the page" : "Fill the window"}" title="${s.full ? "Back to the page (Esc, or F)" : "Fill the window with the chart (F)"}"><svg class="ch-fulli" viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${s.full ? "M5 1.5V5H1.5M9 1.5V5h3.5M12.5 9H9v3.5M5 12.5V9H1.5" : "M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9"}"/></svg></button>` : "";
  return `<div class="ch-rs" role="group" aria-label="Range">${ranges}</div><span class="ch-hsep" aria-hidden="true"></span><span class="ch-ivw"><select class="ch-ivsel" data-ch-ivsel aria-label="Bar size" data-fk="ch-ivsel">${sizes}</select></span>${ind}${log}${full}`;
}
/* the head drawn again (a range, a bar size or the scale picked; a source that drew a range coarser), its menu set to the size shown */
function chHeadAgain(s) {
  if (!s.parts.head) return;
  paint(s.parts.head, chHeadHtml(s));
  const sel = typeof s.parts.head.querySelector === "function" ? s.parts.head.querySelector(".ch-ivsel") : null;
  if (sel && "value" in sel && sel.value !== (s.biv || s.interval)) sel.value = s.biv || s.interval;
}

/* THE CHART FILLING THE WINDOW (the head's last button, or F on the plot; Esc, F or the button again bring the page back): the frame is laid
   over the page (chart.css .ch-full: fixed, under a sheet and the toasts) and the page behind it does not scroll (html[data-chart-full]);
   the plot's size observer draws the bars again at the new size. Nothing is kept: a reload, or the page leaving the chart's tab
   (terminal.js, superagent.js), is the page's own layout again. Not the browser's own fullscreen: a phone's Safari has none for an element,
   and one in the top layer would fight the page's sheets. Esc is the page's first: a sheet or the drawer open takes it (shell.js), and the
   chart leaves the window only when none is open */
function chFullMark(s, on) {
  if (s.el && s.el.classList) s.el.classList.toggle("ch-full", on);
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (root && root.dataset) {
    if (on) root.dataset.chartFull = "";
    else delete root.dataset.chartFull;
  }
}
function chSetFull(s, on) {
  if (!s.fullscreen || !chLive(s) || s.full === !!on) return;
  s.full = !!on;
  chFullMark(s, s.full);
  chHeadAgain(s);
  // the keys (Esc, the arrows, F) are the plot's at once
  if (s.full && s.parts.plot && typeof s.parts.plot.focus === "function") s.parts.plot.focus();
  chSoon(s);
}
/** the chart on el filling the window, or back to the page */
function chFull(el, on) {
  const s = el ? CH.get(el) : null;
  if (s) chSetFull(s, on);
}

/* THE INDICATORS' MENU (see the head of this file): each indicator with its switch, its words and its lengths (the lengths' fields live
   only while it is on); one the bars cannot carry says why and cannot be switched on (VWAP on daily bars, or on bars without volume);
   Clear takes them all off. Drawn when the menu opens and again as the list changes */
function chIndPopHtml(s) {
  const on = new Map((s.ind || []).map((x) => [x.id, x]));
  const intraday = (CH_MS[s.biv] || 0) < CH_MS["1d"];
  const hasVol = !!(s.bars && s.bars.some((b) => Number.isFinite(b.v) && b.v > 0));
  const rows = IN_SPECS.map((sp) => {
    const x = on.get(sp.id);
    const off = sp.intradayOnly && !intraday ? "intraday bars only" : sp.needsVolume && s.bars && !hasVol ? "these bars carry no volume" : "";
    const params = sp.params.map((p, k) => `<label class="ch-ind-p"><span>${esc(p.label)}</span><input type="number" class="ch-ind-n" data-ind-p="${sp.id}:${k}" value="${esc(String(x ? x.params[k] : p.def))}" min="${p.min}" max="${p.max}" step="${p.int === false ? 0.5 : 1}" aria-label="${esc(`${sp.name} ${p.label}`)}"${x ? "" : " disabled"}></label>`).join("");
    return `<div class="ch-ind-row${x ? " on" : ""}${off ? " off" : ""}"><label class="ch-ind-sw"><input type="checkbox" data-ind-on="${sp.id}"${x ? " checked" : ""}${off && !x ? " disabled" : ""}> <b>${esc(sp.name)}</b> <span class="ch-ind-w">${esc(off || sp.words)}</span></label>${params ? `<span class="ch-ind-ps">${params}</span>` : ""}</div>`;
  }).join("");
  return `<div class="ch-ind-h"><span>Indicators</span><button type="button" class="ch-iv ch-ind-clear" data-ind-clear${(s.ind || []).length ? "" : " disabled"}>Clear</button></div>${rows}<p class="ch-ind-note">At most ${IN_MOST_UNDER} under the price. Kept in the address and in this browser.</p>`;
}
function chIndPop(s, on) {
  const pop = s.parts && s.parts.pop;
  if (!pop || typeof inCompute !== "function") return;
  s.indOpen = !!on;
  if (s.indOpen) paint(pop, chIndPopHtml(s));
  pop.hidden = !s.indOpen;
  chHeadAgain(s);
}
/* the list set: computed again at the next frame (chLayout), the head and the menu saying it, the page told */
function chSetIndicators(s, list) {
  if (!chLive(s) || typeof inString !== "function") return;
  const next = inParse(inString(list));
  if (inString(next) === inString(s.ind)) return;
  s.ind = next;
  s.indKey = "";
  chHeadAgain(s);
  if (s.indOpen && s.parts.pop) paint(s.parts.pop, chIndPopHtml(s));
  if (s.onIndicators) s.onIndicators(inString(next));
  chSoon(s);
}
/** the indicators on the chart mounted on el: `text` (the list's string, ui/indicators.js inParse) sets them where given; the list's
 * string as it stands comes back */
function chIndicators(el, text) {
  const s = el ? CH.get(el) : null;
  if (!s) return "";
  if (text !== undefined && typeof inParse === "function") chSetIndicators(s, inParse(text));
  return typeof inString === "function" ? inString(s.ind) : "";
}

/* a listener kept with the chart, so release takes it away */
function chOn(s, target, type, fn, opts) {
  if (!target || typeof target.addEventListener !== "function") return;
  target.addEventListener(type, fn, opts);
  s.off.push(() => typeof target.removeEventListener === "function" && target.removeEventListener(type, fn, opts));
}

/* the chart's listeners, each heard once on its own part: a range or the log switch pressed and a bar size picked (on the frame), the
   pointer, the wheel and the keys on the plot, the plot's size (and its pane shown again: the size observer sees the plot laid out once
   more and asks at once), the page shown again */
function chWire(s) {
  const P = s.parts;
  chOn(s, s.el, "click", (e) => {
    const b = e.target && typeof e.target.closest === "function" ? e.target.closest("[data-ch-r], [data-ch-log], [data-ch-full], [data-ch-ind], [data-ind-clear]") : null;
    if (!b || (typeof s.el.contains === "function" && !s.el.contains(b))) return;
    if (b.dataset.chR !== undefined) chSetRange(s, b.dataset.chR);
    else if (b.dataset.chLog !== undefined) chSetLog(s, !s.log);
    else if (b.dataset.chFull !== undefined) chSetFull(s, !s.full);
    else if (b.dataset.chInd !== undefined) chIndPop(s, !s.indOpen);
    else if (b.dataset.indClear !== undefined) chSetIndicators(s, []);
  });
  chOn(s, s.el, "change", (e) => {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.chIvsel !== undefined) chSetInterval(s, String(t.value));
    else if (t.dataset.indOn !== undefined && typeof inWith === "function") chSetIndicators(s, inWith(s.ind, String(t.dataset.indOn), !!t.checked));
    else if (t.dataset.indP !== undefined && typeof inWith === "function") {
      // one length changed: the indicator keeps its place; a figure out of its range is not taken, and the field shows the one kept
      const [id, k] = String(t.dataset.indP).split(":");
      const cur = (s.ind || []).find((x) => x.id === id);
      if (!cur) return;
      const params = [...cur.params];
      params[Number(k)] = Number(t.value);
      const next = inWith(s.ind, id, true, params);
      if (!next.some((x) => x.id === id)) return void (s.indOpen && s.parts.pop && paint(s.parts.pop, chIndPopHtml(s)));
      chSetIndicators(s, next);
    }
  });
  const rel = (e) => {
    const r = P.plot.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  chOn(s, P.plot, "pointerdown", (e) => chDown(s, e, rel(e)));
  chOn(s, P.plot, "pointermove", (e) => chMove(s, e, rel(e)));
  chOn(s, P.plot, "pointerup", (e) => chUp(s, e));
  // taken by the browser (a touch it turned into the page's scroll, a pen lifted out of range): a drag or a pinch ends as at a let-go, but a
  // line being pulled is dropped, never handed on — the browser took the gesture, the owner let nothing go
  chOn(s, P.plot, "pointercancel", (e) => chUp(s, e, true));
  chOn(s, P.plot, "pointerleave", (e) => {
    if (s.drag || s.pinch) return;
    chLeave(s);
  });
  chOn(s, P.plot, "wheel", (e) => chWheel(s, e, rel(e)), { passive: false });
  chOn(s, P.plot, "dblclick", () => chFit(s));
  // the newest bar again, after a drag or a scroll back in time (its press is not the plot's: no drag starts under it)
  if (P.now) {
    chOn(s, P.now, "pointerdown", (e) => e.stopPropagation());
    chOn(s, P.now, "click", () => chToNow(s));
  }
  chOn(s, P.plot, "keydown", (e) => chKey(s, e));
  chOn(s, P.plot, "blur", () => s.hover && s.hover.key && chLeave(s));
  if (typeof ResizeObserver === "function") {
    s.ro = new ResizeObserver(() => {
      if (!chLive(s)) return;
      const was = s.shown;
      s.shown = chLaidOut(s);
      // the pane came back: the bars and the live price asked now, not at the next tick
      if (s.shown && !was && !chHidden()) {
        clearTimeout(s.timer);
        chTick(s);
      }
      chSoon(s);
    });
    s.ro.observe(P.plot);
  } else if (typeof addEventListener === "function") chOn(s, globalThis, "resize", () => chSoon(s));
  if (typeof document !== "undefined") chOn(s, document, "visibilitychange", () => !chHidden() && chLive(s) && !s.timer && chTick(s));
  // Esc anywhere on the page brings the page back from the window-filling chart — unless a sheet or the drawer is open: Esc is theirs (the
  // key's target sits inside the one open, and the shell closes it)
  if (typeof document !== "undefined")
    chOn(s, document, "keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // the indicators' menu first
      if (s.indOpen) return void chIndPop(s, false);
      if (!s.full) return;
      const inDialog = e.target && typeof e.target.closest === "function" && e.target.closest("dialog");
      if (inDialog || (typeof document.querySelector === "function" && document.querySelector("dialog[open]"))) return;
      chSetFull(s, false);
    });
  // a click outside the indicators' menu closes it
  if (typeof document !== "undefined")
    chOn(s, document, "click", (e) => {
      if (!s.indOpen) return;
      const t = e.target;
      const inside = t && typeof t.closest === "function" && (t.closest("[data-ch-pop]") || t.closest("[data-ch-ind]"));
      if (!inside) chIndPop(s, false);
    });
}

/* ANOTHER RANGE: its own bar size with it (the owner's pick of a size before is let go), the view fitted to it, the head saying it at once,
   the bars of the one before taken away (never drawn under the new one's button), its bars read. The range already shown pressed again
   fits it again */
function chSetRange(s, r) {
  if (!chLive(s) || !CH_RANGE_BAR[r]) return;
  if (r === s.range && s.interval === CH_RANGE_BAR[r]) return void chFit(s);
  s.range = r;
  s.interval = CH_RANGE_BAR[r];
  s.biv = s.interval;
  chHeadAgain(s);
  if (s.onRange) s.onRange(r);
  if (s.onInterval) s.onInterval(s.interval);
  chRead(s, true);
}
/* ANOTHER BAR SIZE over the same range: the menu says it at once, the bars of the one before are taken away, its bars are read */
function chSetInterval(s, iv) {
  if (!chLive(s) || !CH_MS[iv] || (iv === s.interval && iv === s.biv)) return;
  s.interval = iv;
  s.biv = iv;
  chHeadAgain(s);
  if (s.onInterval) s.onInterval(iv);
  chRead(s, true);
}
/* the price scale, logarithmic or straight: the picture drawn again on it, nothing read */
function chSetLog(s, on) {
  if (!chLive(s) || s.ev || s.log === !!on) return;
  s.log = !!on;
  chHeadAgain(s);
  if (s.onLog) s.onLog(s.log);
  chSoon(s);
}

/* the path of a first view: the range, in the bar size asked (the same path ui/superagent.js asks for its floor, so one read serves both) */
const chPath = (s) => `/api/account/candles?${new URLSearchParams({ venue: s.venue, symbol: s.symbol, interval: s.interval, range: s.range })}`;

/* THE BARS READ (kept thirty seconds by the page): `fresh` — a new mount, another range or bar size — takes away what was drawn first, the
   live price taken for the bars before included (the new bars wait for a price read for them), and fits the view to the range. Only the
   latest read's answer is drawn, and only while the chart is still mounted on its element at that range and bar size */
function chRead(s, fresh) {
  const n = ++s.reads;
  const iv = s.interval;
  const range = s.range;
  const asked = Date.now();
  s.reading = true;
  if (fresh) {
    s.bars = null;
    s.said = "";
    s.venueName = "";
    s.meta = {};
    s.edge = null;
    s.segs = [];
    s.view = null;
    s.slots = null;
    s.labels = null;
    s.sver++;
    s.staticKey = "";
    s.hover = null;
    s.quote = null;
    s.wait = 0;
    s.local = 0;
    s.reconcileAt = 0;
    s.pushSeq = -Infinity;
    s.tradeAt = 0;
    s.vbar = null;
    // a page on its way for the bars before is let go: its answer is not drawn
    s.paging = { n: s.paging.n + 1, busy: false, wait: 0, delay: 0, said: "" };
    s.paged = 0;
    chDraw(s);
  }
  // after a refusal with no bars, the read is asked of the account again, not answered from the refusal the page kept. A first view is
  // waited for longer than the account gives its sources (core HISTORY_TIMEOUT_MS: a share's whole history from Nasdaq is about ten
  // seconds), so a view the account is still reading is never said to be one it did not answer
  const path = chPath(s);
  if (!fresh && !s.bars && s.wait && typeof forget === "function") forget(path);
  return api(path, { ttl: 30_000, timeout: HISTORY_TIMEOUT_MS }).then((b) => {
    if (!chLive(s) || n !== s.reads || iv !== s.interval || range !== s.range) return;
    s.reading = false;
    s.readAt = Date.now();
    chTake(s, b, asked, fresh);
    chDraw(s);
    // the last bar brought to the live price at once, not five seconds later (only while the plot is showing): the price the stream pushed
    // last, where it carries this market, else a read of it
    if (fresh && !chHidden() && chLaidOut(s)) {
      const q = typeof stQuoteOf === "function" ? stQuoteOf(s.venue, s.symbol) : null;
      if (q) chPushed(s, q);
      chPoll(s);
    }
  });
}

/* a source's bars as the chart keeps them: only whole ones (a bar without its four prices is left out, never filled in), an event
   contract's in cents, oldest first */
function chBarsOf(list, ev) {
  const k = ev ? 100 : 1;
  const at = (v) => (k === 1 ? Number(v) : Number((Number(v) * k).toFixed(6)));
  const whole = (x) => x && [x.t, x.o, x.h, x.l, x.c].every((v) => v !== null && v !== "" && Number.isFinite(Number(v)));
  return (Array.isArray(list) ? list : [])
    .filter(whole)
    .map((x) => ({ t: Number(x.t), o: at(x.o), h: at(x.h), l: at(x.l), c: at(x.c), ...(x.v !== undefined && x.v !== null && Number.isFinite(Number(x.v)) ? { v: Number(x.v) } : {}) }))
    .sort((a, c) => a.t - c.t);
}
/* the source's own stretches with no bars, as it said them ([from, to) ms and why) */
const chGapsOf = (g) => (Array.isArray(g) ? g.filter((x) => x && Number.isFinite(Number(x.from)) && Number.isFinite(Number(x.to))).map((x) => ({ from: Number(x.from), to: Number(x.to), why: String(x.why || "") })) : []);
/* a sentence the account said, as the chart says it: plain text, trimmed, nothing when none */
const chWords = (w) => (typeof w === "string" ? w.trim() : "");
/* the bars changed in what they are, not only in the newest one's prices: their slots, their holes and the time axis's candidates are
   worked out again, and the picture is drawn again */
function chChanged(s) {
  s.slots = null;
  s.labels = null;
  s.sver++;
  s.decStat = chDecStat(s.bars, s.ev);
  s.dec = chDecFrom(s.decStat, s.ev, s.step);
}
/* the newest bar's prices moved: the figures' decimals widened to hold them, if they need more */
function chDecTick(s) {
  const last = s.bars && s.bars.length ? s.bars[s.bars.length - 1] : null;
  if (!last) return;
  const st = s.decStat;
  for (const v of [last.o, last.h, last.l, last.c]) {
    if (!Number.isFinite(v)) continue;
    st.d = Math.max(st.d, chDecimalsOf(v));
    st.top = Math.max(st.top, Math.abs(v));
  }
  s.dec = chDecFrom(st, s.ev, s.step);
}
/* the index of the bar that starts at `t` in `bars` (oldest first), else of the last one before it (0 where none is) */
function chIndexAt(bars, t) {
  let a = 0;
  let b = bars.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (bars[m].t <= t) a = m + 1;
    else b = m;
  }
  return Math.max(0, a - 1);
}
/* a stretch of the series' bars as its answer says whose they are */
const chSegOf = (from, b) => ({ from, source: chWords(b && b.source), adjustment: chWords(b && b.adjustment), session: chWords(b && b.session) });
/* two stretches are one source's bars: the same source said — or one of them says none (no seam is drawn where nothing says another) */
const chSameSource = (a, b) => !a.source || !b.source || a.source === b.source;
/* the stretch a bar at `t` is in (the last one starting at or before it) and its place among them */
function chSegAt(s, t) {
  const segs = s.segs || [];
  let k = segs.length - 1;
  while (k > 0 && segs[k].from > t) k--;
  return k;
}
/* the bars' slots and holes, worked out once each time the bars change (chSlots: a share's sessions stepped over) */
function chSlotsOf(s) {
  if (s.slots) return s.slots;
  const word = CH_IV_WORDS[s.biv] || s.biv;
  s.slots = chSlots(s.bars || [], CH_MS[s.biv] || CH_MS["1h"], { sessions: s.kind === "stock", gaps: s.meta.gaps, none: `No ${word} bar from ${s.venueName || "the source"} here` });
  return s.slots;
}

/* what a read said, taken: the source's bars (a copy: the read the page keeps is not changed by a live price), and whose they are — the
   source the account read (`from`, where the answer names it: a paper account's bars are its market's public source's), else the venue's
   name — with what the answer says of them: the bars' own size (a source that drew the range coarser), its sentences (source, adjustment,
   session, folded, note), the stretches it has no bars for and the daily bar it built from intraday ones, and whether older bars exist and
   where its history ends. A read again (not `fresh`) keeps the older bars scrolling left brought before its first bar, whose they are
   (s.segs), and where they were brought, their word on where the history ends; a view that followed the newest bar keeps following it,
   and the keys' crosshair stays on the bar it was on. The live price taken before is
   laid over them only while it is fresh — read within the last two asks, or after this read was asked (`asked`, ms): an older one never
   stands in for the source's own close. A refusal is kept in its words — unless bars of this size already stand: a later read that failed
   does not take the source's bars away. A read that never reached the account (a stopped service, a dropped connection: book.js
   bkUnanswered) is said in the page's own words, never the browser's error as it was thrown; and either says how long the chart now waits
   before asking again (s.wait) */
function chTake(s, b, asked = 0, fresh = false) {
  if (b && b.ok !== false && Array.isArray(b.candles)) {
    const iv = CH_MS[b.interval] ? b.interval : s.interval;
    // a bar started here from a pushed tick (chPushed), as it stands now
    const local = s.local && s.bars ? s.bars.find((x) => x.t === s.local) : null;
    const got = chBarsOf(b.candles, s.ev);
    const was = s.bars && s.biv === iv ? s.bars : null;
    const oldTotal = was ? chSlotsOf(s).total : 0;
    const follow = !s.view || s.view.end >= oldTotal - 0.01;
    // the bar the keys put the crosshair on, by its moment: it stays on that bar however the bars before it change
    const keyAt = s.hover && s.hover.key && s.bars && s.bars[s.hover.i] ? s.bars[s.hover.i].t : null;
    // the older bars a scroll left brought, kept before the first one this read gave — with whose they are; this read's own stretch after
    // them, joined to the last kept where it is the same source's
    const keep = !fresh && was && got.length ? was.filter((x) => x.t < got[0].t) : [];
    s.bars = keep.length ? keep.concat(got) : got;
    const kseg = keep.length ? (s.segs || []).filter((g) => g.from < got[0].t) : [];
    const own = got.length ? chSegOf(got[0].t, b) : null;
    s.segs = own ? (kseg.length && chSameSource(kseg[kseg.length - 1], own) ? kseg : kseg.concat([own])) : kseg;
    if (keyAt !== null && s.bars.length) s.hover.i = chIndexAt(s.bars, keyAt);
    if (s.biv !== iv) {
      s.biv = iv;
      s.view = null;
      chHeadAgain(s);
    }
    // RECONCILED: where the source has a bar at its moment, the source's stands; while it has none yet (its bars come a little behind), the
    // one started here is kept after them
    if (local) {
      const top = s.bars.length ? s.bars[s.bars.length - 1].t : -Infinity;
      if (local.t > top) s.bars.push({ ...local });
      else {
        // reconciled: no read more is owed for it
        s.local = 0;
        s.reconcileAt = 0;
      }
    }
    s.said = "";
    const from = typeof b.from === "string" && b.from.trim() ? b.from.trim() : "";
    s.venueName = String(from || b.venueName || s.venueName || s.venue);
    const kept = keep.length && s.meta.gaps ? s.meta.gaps.filter((g) => g.to <= got[0].t) : [];
    const today = b.today && Number.isFinite(Number(b.today.t)) ? { t: Number(b.today.t), words: chWords(b.today.words) } : null;
    s.meta = { source: chWords(b.source), adjustment: chWords(b.adjustment), session: chWords(b.session), folded: chWords(b.folded), note: chWords(b.note), gaps: kept.concat(chGapsOf(b.gaps)), today };
    // where older bars exist and where the history ends: this read's word, unless pages scrolled left already said it further back
    if (fresh || !s.paged || !keep.length) s.edge = { more: b.more === true, ends: chWords(b.ends) };
    const q = s.quote;
    if (q && (q.readAt >= asked || Date.now() - q.readAt <= CH_FRESH_MS)) chApplyQuote(s.bars, q, CH_MS[s.biv]);
    chChanged(s);
    if (s.view && follow) s.view.end = chSlotsOf(s).total;
    s.wait = 0;
    return;
  }
  if (s.bars) return;
  s.wait = Math.min(CH_BACKOFF_MAX_MS, Math.max(CH_BACKOFF_MS, s.wait * 2));
  const unanswered = typeof bkUnanswered === "function" ? bkUnanswered(b) : !b;
  const words = unanswered ? "" : String(refusalOf(b) || "").trim().replace(/[.\s]+$/, "");
  // a source's own fact (it keeps no history: E_VENUE_RAIL_CLOSED) is said alone; anything else with how long until it is asked again
  const quiet = !!(b && b.refusal && b.refusal.code === "E_VENUE_RAIL_CLOSED");
  const again = quiet ? "" : ` Asking again every ${Math.round(s.wait / 1000)} s.`;
  s.said = `${words ? `${words}.` : "No price history: the account is not answering."}${again}`;
}

/* THE PAGE BEFORE THE OLDEST BAR (GET /api/account/candles?before=: one page of the source's own, within its own deadline, kept a minute by
   the page): asked once the owner has moved the view near the oldest bar (chMaybePage). Its bars go on the left — the view keeps showing
   what it showed (its end moves by the slots they take), and the keys' crosshair the bar it was on — with what it says of where the history
   ends, and whose they are: another source's than the bars beside them (a share's Robinhood year, then Nasdaq's daily bars before it) is a
   stretch of its own, joined with a seam (s.segs). A page of another bar size, or one answered after the chart moved on (another range,
   another market, a read afresh), is never drawn. A refusal is said over the plot in its words, and the next page is asked only after a
   wait — and so is a page that came back with no bar while older bars still exist (`more`: its source answered none this time, or only part
   of the page, `partial`): that is not where the history ends. Only an answer that says nothing older exists ends it */
function chPage(s) {
  const first = s.bars && s.bars[0];
  if (!first) return;
  const iv = s.biv;
  const n = ++s.paging.n;
  s.paging.busy = true;
  s.paging.said = "";
  chHintAgain(s);
  const path = `/api/account/candles?${new URLSearchParams({ venue: s.venue, symbol: s.symbol, interval: iv, before: String(first.t), limit: String(CH_PAGE) })}`;
  return api(path, { ttl: 60_000 }).then((b) => {
    if (!chLive(s) || n !== s.paging.n || iv !== s.biv || !s.bars || !s.bars.length) return;
    s.paging.busy = false;
    const answered = !!(b && b.ok !== false && Array.isArray(b.candles) && (!b.interval || b.interval === iv));
    const oldest = s.bars[0].t;
    const older = answered ? chBarsOf(b.candles, s.ev).filter((x) => x.t < oldest) : [];
    if (!answered || (!older.length && b.more === true)) {
      s.paging.delay = Math.min(CH_PAGE_WAIT_MAX_MS, Math.max(CH_PAGE_WAIT_MS, s.paging.delay * 2));
      s.paging.wait = Date.now() + s.paging.delay;
      const unanswered = !answered && (typeof bkUnanswered === "function" ? bkUnanswered(b) : !b);
      const name = s.venueName || "the source";
      const words = answered ? `${name} answered ${b.partial === true ? "only part of the page" : "none"} this time` : unanswered ? "the account is not answering" : String(refusalOf(b) || "").trim().replace(/[.\s]+$/, "") || "no answer";
      s.paging.said = `Older bars did not come: ${words}.`;
      // the page kept is the refusal (or the empty answer): the next ask, after the wait, asks the account again
      if (typeof forget === "function") forget(path);
      return void chSoon(s);
    }
    s.paging.delay = 0;
    if (older.length) {
      s.bars = older.concat(s.bars);
      // the keys' crosshair stays on the bar it was on, now that many bars on
      if (s.hover && s.hover.key) s.hover.i += older.length;
      s.meta.gaps = chGapsOf(b.gaps).concat(s.meta.gaps || []);
      // whose they are: the oldest stretch goes back to them where they are its source's, else they are a stretch of their own
      const seg = chSegOf(older[0].t, b);
      const head = s.segs && s.segs[0];
      s.segs = !head ? [seg] : chSameSource(head, seg) ? [{ ...head, from: seg.from }, ...s.segs.slice(1)] : [seg, ...s.segs];
      chChanged(s);
      // the bar that was the oldest now stands this many slots on: the view keeps it where it was — and a drag or a pinch under way, which
      // moves the view from where it began, began that many slots on too
      const shift = chSlotsOf(s).pos[older.length];
      if (s.view) s.view.end += shift;
      if (s.drag) s.drag.end += shift;
      if (s.pinch) s.pinch.end += shift;
      s.paged++;
    }
    const ends = chWords(b.ends) || `No older ${CH_IV_WORDS[iv] || iv} bars from ${s.venueName || "the source"}`;
    s.edge = { more: b.more === true, ends: b.more === true ? "" : ends };
    chSoon(s);
  });
}
/* asked as the view is drawn: the page before the oldest bar, once the owner moved the view (a fitted range never asks for more by itself),
   older bars exist, its left edge is within CH_PRELOAD of a view of the oldest bar, no page is on its way or waiting after a refusal, and
   fewer than CH_MOST bars are held */
function chMaybePage(s, L) {
  if (!s.view || !s.edge || !s.edge.more || s.paging.busy || Date.now() < s.paging.wait || !s.bars || !s.bars.length || s.bars.length >= CH_MOST) return;
  const span = L.sc.usable / L.sc.slot;
  if (L.sc.end - span > span * CH_PRELOAD) return;
  chPage(s);
}

/* every five seconds while mounted, in the document, its pane showing and the page showing (the page shown again asks at once; the pane
   shown again too, through the size observer). While the pane is hidden the clock keeps time and asks nothing */
function chTick(s) {
  s.timer = 0;
  if (!chLive(s)) return;
  if (s.el.isConnected === false) return void chRelease(s.el);
  if (chHidden()) return;
  s.shown = chLaidOut(s);
  if (s.shown) {
    chPoll(s);
    // the foot's word for the live price follows the clock (a price pushed a while ago grows old where nothing new came)
    chFootAgain(s);
  }
  s.timer = setTimeout(() => chTick(s), CH_POLL_MS);
}
/* one round: the bars read again when they are a minute old, and once thirty seconds after the last bar's interval ended where the bars in
   hand were read before then (so once per bar's end: the read that follows was read after it); the live price asked while the last bar
   can still take it */
function chPoll(s) {
  if (!chLive(s)) return;
  const now = Date.now();
  const last = s.bars && s.bars.length ? s.bars[s.bars.length - 1] : null;
  const end = last ? last.t + CH_MS[s.biv] : 0;
  const ended = !!last && now >= end + CH_ENDED_MS && s.readAt < end + CH_ENDED_MS && now - s.readAt >= CH_ENDED_MS;
  // bars in hand: once a minute; a refusal and no bars: after the refusal's own wait (two seconds, doubling, at most a minute). A bar
  // started here from a pushed tick: read again thirty seconds after its start, so the source's own comes over it
  const every = !s.bars && s.wait ? s.wait : CH_READ_MS;
  const reconcile = !!s.reconcileAt && now >= s.reconcileAt && s.readAt < s.reconcileAt;
  if (!s.reading && s.readAt && (now - s.readAt >= every || ended || reconcile)) chRead(s, false);
  // the live price read — only once in CH_PUSHED_MS while the stream pushes it (chPushedNow)
  if (last && now >= s.quoteWait && now < end + CH_LATE_MS && !chPushedNow(s, now)) chQuote(s);
}
/* the stream pushes this chart's market now: a price came within CH_PUSH_FRESH_MS, live, on a stream that is connected — and the read of
   the live price, the fallback, was asked within CH_PUSHED_MS */
function chPushedNow(s, now = Date.now()) {
  return s.pushLive && now - s.pushAt < CH_PUSH_FRESH_MS && typeof stHealth === "function" && stHealth() === "connected" && now - s.quoteAskedAt < CH_PUSHED_MS;
}

/** A QUOTE THE STREAM PUSHED for this chart's market (ui/stream.js quote): its LAST TRADE, placed by the message's venue moment, moves the
 * last bar inside its interval (chApplyTick) — drawn in the next frame — and never starts one: a quote is sent on every move of the best
 * bid or ask, a mark or the market's state, so the first past a bar's end says nothing traded after it (a pushed trade starts the next:
 * chTraded). A perpetual's bars are its trades' as well: its last trade, never the middle of its book. Only a new message moves anything
 * (its seq above the last taken: the seq counts afresh once the stream says it started again — chFresh); one that says the market is not
 * live there now moves nothing, and the foot says the price's age from then on. A share's daily or weekly bar is never moved by it (the
 * stream says no session: chRegular) */
function chPushed(s, q) {
  if (!chLive(s) || !q) return;
  if (q.live !== true) {
    if (s.pushLive) {
      s.pushLive = false;
      chFootAgain(s);
    }
    return;
  }
  const seq = Number(q.seq);
  if (Number.isFinite(seq) && seq <= s.pushSeq) {
    // the same message, said again as the market came live: nothing moved
    if (!s.pushLive) {
      s.pushLive = true;
      s.pushAt = Date.now();
      chFootAgain(s);
    }
    return;
  }
  const at = Date.parse(String(q.at || ""));
  // a share's quote (the account's background reader of Robinhood's and Nasdaq's real-time quotes) moves its chart at the price its line
  // says — Nasdaq's last trade, else the middle of Robinhood's bid and ask, which carries no trade (ui/stream.js stPrice)
  const raw = typeof q.last === "number" && Number.isFinite(q.last) && q.last > 0 ? q.last : s.kind === "stock" && typeof stPrice === "function" ? Number(stPrice(q, false)) : NaN;
  if (!Number.isFinite(at)) return;
  if (Number.isFinite(seq)) s.pushSeq = seq;
  const k = s.ev ? 100 : 1;
  const c = (v) => (k === 1 ? Number(v) : Number((Number(v) * k).toFixed(6)));
  // the venue's own live one-minute bar, kept for the trade that starts a bar at its minute (chTraded)
  const b = q.bar && typeof q.bar === "object" && [q.bar.t, q.bar.o, q.bar.h, q.bar.l].every((v) => Number.isFinite(Number(v))) ? { t: Number(q.bar.t), o: c(q.bar.o), h: c(q.bar.h), l: c(q.bar.l) } : null;
  if (b) s.vbar = b;
  // no trade said yet on the stream: it does not push this chart's price (the read of it stays on its beat)
  if (!(raw > 0)) return;
  if (chSessionBars(s)) return;
  s.pushAt = Date.now();
  s.pushLive = true;
  const seen = Date.parse(String(q.seenAt || ""));
  const tick = { price: c(raw), at, seen: Number.isFinite(seen) ? seen : at, readAt: Date.now(), from: String(q.from || "").replace(/\s*·\s*live$/, ""), pushed: true, ...(b ? { bar: b } : {}) };
  if (s.quote && tick.at < s.quote.at) return void chFootAgain(s);
  s.quote = tick;
  if (!s.bars) return;
  if (!chApplyTick(s.bars, tick, CH_MS[s.biv], false)) return void chFootAgain(s);
  chDecTick(s);
  s.lagQ = q;
  chSoon(s);
}
/** TRADES THE STREAM PUSHED for this chart's market (ui/stream.js trades: the market's latest, newest first, each at its venue's own moment)
 * — what starts a bar here: laid on the bars oldest first, each one newer than the last laid (a message says the latest again with the
 * new), every trade inside the last bar moves it, and the first at or past its end opens the bar its moment falls in (chApplyTick, at the
 * boundary of its market's own clock: chBarStart — at the venue's own one-minute open where its one-minute bar starts at that boundary,
 * else at the trade), for a market whose bars cover that moment (chOpens); the next ones move that bar. A trade from before the last bar's
 * start moves nothing. A share's daily or weekly bar is never moved (its session is not the stream's to say). Drawn in the next frame */
function chTraded(s, d) {
  if (!chLive(s) || !s.bars || !s.bars.length || !d || !Array.isArray(d.trades)) return;
  if (chSessionBars(s)) return;
  const k = s.ev ? 100 : 1;
  const iv = CH_MS[s.biv];
  const from = s.bars[s.bars.length - 1].t;
  // oldest first (the message is newest first: reversed, trades of one moment keep their order, the newest laid last)
  const trades = d.trades
    .slice(0, CH_TRADES_MAX)
    .reverse()
    .map((x) => ({ price: x && Number(x.price), at: x ? Date.parse(String(x.at || "")) : NaN }))
    .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.at) && x.at >= from && x.at >= s.tradeAt)
    .sort((a, b) => a.at - b.at);
  if (!trades.length) return;
  const n = s.bars.length;
  const clock = chClock(s);
  const startOf = (t) => chBarStart(t, s.biv, clock);
  let moved = false;
  for (const x of trades) {
    const vb = s.vbar && Number.isFinite(s.vbar.t) ? s.vbar : null;
    const tick = { price: k === 1 ? x.price : Number((x.price * k).toFixed(6)), at: x.at, ...(vb ? { bar: vb } : {}) };
    if (chApplyTick(s.bars, tick, iv, chOpens(s, x.at), startOf)) moved = true;
    s.tradeAt = Math.max(s.tradeAt, x.at);
  }
  if (!moved) return;
  if (s.bars.length > n) {
    const t = s.bars[s.bars.length - 1].t;
    // a view that followed the newest bar follows the one started here
    const total = chSlotsOf(s).total;
    const follow = !s.view || s.view.end >= total - 0.01;
    s.local = t;
    s.reconcileAt = t + CH_ENDED_MS;
    chChanged(s);
    if (s.view && follow) s.view.end = chSlotsOf(s).total;
  } else chDecTick(s);
  chSoon(s);
}
/* A BAR MAY BE STARTED HERE from a trade pushed at `at`: a market that trades round the clock, or a share's intraday bars inside the hours
   they keep (04:00–20:00 New York where they hold the pre-market and after-hours, else the regular session 09:30–16:00) on a weekday —
   never an event contract's, a share's daily or weekly bar, or a share's bar in the hours its bars leave out (a night with no overnight
   data) */
function chOpens(s, at) {
  if (s.ev || s.kind === "event") return false;
  if (s.kind !== "stock") return true;
  if (!(CH_MS[s.biv] <= CH_MS["4h"]) || !Number.isFinite(at)) return false;
  const p = chParts(at, CH_NY);
  if (p.dow === 0 || p.dow === 6) return false;
  return chSlotsOf(s).ext ? p.min >= 240 && p.min < 1200 : p.min >= 570 && p.min < 960;
}
/* THE STREAM STARTED AFRESH (a snapshot: the account started again, its streams' seqs counting from the start; or its health left
   "connected": what comes next is a new stream's word): every mounted chart takes the next pushed quote whatever its seq, and is not
   pushed to until one comes — its live price read on its five seconds again meanwhile */
function chFresh() {
  for (const s of [...CH.values()]) {
    s.pushSeq = -Infinity;
    if (s.pushLive) {
      s.pushLive = false;
      chFootAgain(s);
    }
  }
}
/* the pushed quotes and trades, each to the charts mounted on its market */
if (typeof stOn === "function") {
  const each = (d, fn) => {
    if (!d || typeof d.venue !== "string") return;
    for (const s of [...CH.values()]) if (s.venue === d.venue && s.symbol === d.symbol) fn(s, d);
  };
  stOn("quote", (q) => each(q, chPushed));
  stOn("trades", (d) => each(d, chTraded));
  stOn("snapshot", chFresh);
  stOn("health", (h) => h !== "connected" && chFresh());
}
/* THE LIVE PRICE (GET /api/account/quotes, kept three seconds by the page, so the market bar and the book asking the same share it): its
   time is the quote's own stamp where the source stamps one, else the moment it was read. It moves the last bar only inside that bar's
   interval (chApplyQuote) — a share's daily or weekly bar only in its regular session (chRegular); a price older than one already taken
   is not taken; a refusal drops the price taken before (it is no longer the venue's word) and waits a minute before the next ask. A price
   with finer figures than the bars carries its decimals to the axis (chDecimals) */
function chQuote(s) {
  const iv = s.interval;
  s.quoteAskedAt = Date.now();
  return api(`/api/account/quotes?pairs=${encodeURIComponent(`${s.venue}|${s.symbol}`)}`, { ttl: 3_000 }).then((b) => {
    if (!chLive(s) || s.interval !== iv) return;
    const row = b && b.ok !== false && Array.isArray(b.quotes) ? b.quotes.find((x) => x && x.venue === s.venue && x.symbol === s.symbol) : null;
    const m = row && !row.refusal ? row.market : null;
    const price = !m || m.price === undefined || m.price === null || m.price === "" ? NaN : Number(m.price);
    if (!Number.isFinite(price)) {
      s.quote = null;
      s.quoteWait = Date.now() + CH_QUOTE_WAIT_MS;
      return;
    }
    const stamped = Date.parse(String(m.quoteAt || ""));
    // THE ACCOUNT'S OWN PAPER BOOK'S PRICE IS ITS SOURCE'S LISTING, kept a while: it is placed in time by its own stamp (quoteAt, the moment
    // its venue answered), and one that says no moment is never taken as now — it moves no bar. Only the account's own paper book (connector
    // live:paper) prices from a kept listing: a venue's own paper account (Alpaca paper, Hyperliquid testnet) answers its market fresh, as
    // a venue connected live does, so its unstamped price is the moment it was read like theirs
    if (!Number.isFinite(stamped) && chOwnPaper(s.venue)) return;
    const quote = { price: s.ev ? Number((price * 100).toFixed(6)) : price, at: Number.isFinite(stamped) ? stamped : Date.now(), readAt: Date.now(), from: typeof m.quoteFrom === "string" ? m.quoteFrom : "" };
    if (chSessionBars(s) && !chRegular(m.session, quote.at)) return;
    if (s.quote && quote.at < s.quote.at) return chFootAgain(s);
    s.quote = quote;
    if (s.bars && chApplyQuote(s.bars, quote, CH_MS[s.biv])) {
      chDecTick(s);
      chSoon(s);
    } else chFootAgain(s);
  });
}
/* the venue is the account's own paper book (connector live:paper), whose prices are a source's listing kept a while — not a venue's own
   paper account (Alpaca paper, Hyperliquid testnet), which answers its market fresh */
function chOwnPaper(venue) {
  const v = typeof A !== "undefined" && A && Array.isArray(A.venues) ? A.venues.find((x) => x && x.id === venue) : null;
  return !!v && v.connector === "live:paper";
}
/* the foot drawn again when its words changed (the live price grew older, or a new one came): the picture itself is not touched — only
   once it is drawn (before that, the drawing writes its foot) */
function chFootAgain(s) {
  if (!s.bars || !s.L) return;
  const html = chFootHtml(s);
  if (s.footSaid === html) return;
  s.footSaid = html;
  paint(s.parts.foot, html);
}

// ---- moving through time --------------------------------------------------------------------------------------------------------------

/* the view as it stands, as slots: the one the owner moved to, else the range fitted (chScale's) */
function chViewOf(s) {
  const L = s.L;
  if (s.view) return { ...s.view };
  return L ? { slot: L.sc.slot, end: L.sc.end } : null;
}
/** A VIEW KEPT INSIDE WHAT CAN BE SHOWN, for a plot `usable` pixels wide: a slot no wider than CH_ZOOM_MAX and no narrower than the whole
 * history in hand needs — or, while older bars exist, than CH_ZOOM_MIN (scrolling left brings more of them); its right edge never past the
 * newest bar's, and its left edge past the oldest only where older bars may come (the empty space shows where they will), at most until
 * CH_KEEP slots of bars stay in view */
function chClamp(s, v, usable) {
  const total = chSlotsOf(s).total;
  const more = !!(s.edge && s.edge.more) && s.bars.length < CH_MOST;
  const fit = total ? usable / total : CH_MAX_SLOT;
  const least = more ? Math.min(CH_ZOOM_MIN, fit) : Math.min(CH_MAX_SLOT, fit);
  const slot = Math.min(CH_ZOOM_MAX, Math.max(least, Number(v.slot) || least));
  const span = usable / slot;
  const lo = more ? Math.min(total, CH_KEEP) : Math.min(total, span);
  return { slot, end: Math.min(total, Math.max(lo, Number(v.end))) };
}
/* the view moved to `v` (kept inside what can be shown), drawn in the next frame */
function chSetView(s, v) {
  const L = s.L;
  if (!L || !v) return;
  s.view = chClamp(s, v, L.sc.usable);
  chSoon(s);
}
/** ZOOMED by `factor` (more than one: in) around the column `x` of the plot (none: the right edge where the newest bar is in view, else the
 * middle): the slot under it stays under it */
function chZoom(s, factor, x) {
  const L = s.L;
  const v = chViewOf(s);
  if (!L || !v || !(factor > 0)) return;
  const usable = L.sc.usable;
  const ax = Number.isFinite(x) ? Math.max(0, Math.min(usable, x)) : v.end >= L.sc.total - 0.01 ? usable : usable / 2;
  const at = v.end - (usable - ax) / v.slot;
  const c = chClamp(s, { slot: v.slot * factor, end: v.end }, usable);
  chSetView(s, { slot: c.slot, end: at + (usable - ax) / c.slot });
}
/* THE RANGE FITTED AGAIN (a double click, the range shown pressed again): its own window — the bars from its start on the calendar to the
   newest, across the plot (chRangeView) — never every bar held under its label after pages scrolled left brought older ones */
function chFit(s) {
  if (!chLive(s)) return;
  const v = chRangeView(s);
  if (!v && !s.view) return;
  if (v && s.view && v.slot === s.view.slot && v.end === s.view.end) return;
  s.view = v;
  chSoon(s);
}
/* where a range starts on the calendar, `now` being now: its days back (CH_RANGE_DAYS), YTD the year's first day (UTC), MAX nothing (every
   bar is its own) */
function chRangeFrom(r, now) {
  if (r === "YTD") return Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  const days = CH_RANGE_DAYS[r];
  return days ? now - days * 86_400_000 : undefined;
}
/* THE RANGE'S OWN WINDOW, as a view: its bars — those at or after its start — across the usable width, the newest at the right edge; null
   where that is every bar held (nothing older was brought by scrolling left: the history fitted, as it always was) or the plot is not laid
   out yet */
function chRangeView(s) {
  const bars = s.bars || [];
  const L = s.L;
  if (!bars.length || !L || !L.sc) return null;
  const since = chRangeFrom(s.range, Date.now());
  if (since === undefined) return null;
  const first = bars.findIndex((b) => b.t >= since);
  if (first <= 0) return null;
  const sl = chSlotsOf(s);
  const at = sl.pos ? sl.pos[first] : first;
  const n = sl.total - at;
  if (!(n > 0)) return null;
  return chClamp(s, { slot: L.sc.usable / n, end: sl.total }, L.sc.usable);
}
/* back to the newest bar (the "now" button, shown while the view's right edge is behind it): the zoom kept, the view's right edge at now */
function chToNow(s) {
  const L = s.L;
  const v = chViewOf(s);
  if (!chLive(s) || !L || !v) return;
  chSetView(s, { slot: v.slot, end: chSlotsOf(s).total });
}
/* a press on the plot: the crosshair at it (a tap reads a bar), and the start of a drag — or, with a second finger, of a pinch */
function chDown(s, e, at) {
  s.hover = { x: at.x, y: at.y };
  chSoonShow(s);
  if (!s.L || (e.pointerType === "mouse" && e.button !== undefined && e.button !== 0)) return;
  // a press on a line that drags (an order of the owner's that changes in place): that line is pulled, the view does not move. A mouse's or
  // a pen's only: the plot leaves up and down to the page (touch-action: pan-y), so a finger on a line is the page's scroll — the browser
  // takes it (pointercancel) and a line would never follow it; on a phone an order is changed from its row (Change)
  const ln = e.pointerType !== "touch" && s.ptrs.size === 0 && at.x <= s.L.plotW ? chLineAt(s, at.y) : null;
  if (ln) {
    s.lineDrag = { id: e.pointerId, line: ln, y0: at.y, price: ln.price, moved: false };
    try {
      if (typeof s.parts.plot.setPointerCapture === "function" && e.pointerId !== undefined) s.parts.plot.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser already let go of
    }
    return;
  }
  s.ptrs.set(e.pointerId, at);
  const v = chViewOf(s);
  if (s.ptrs.size >= 2) {
    const [a, b] = [...s.ptrs.values()];
    s.drag = null;
    s.pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, slot: v.slot, end: v.end };
  } else s.drag = { id: e.pointerId, x: at.x, slot: v.slot, end: v.end, moved: false };
  try {
    if (typeof s.parts.plot.setPointerCapture === "function" && e.pointerId !== undefined) s.parts.plot.setPointerCapture(e.pointerId);
  } catch {
    // a pointer the browser already let go of: the drag ends with it
  }
}
/* the pointer moved over the plot: the crosshair with it, once a frame — and the view with it while it drags (left and right; up and down
   is the page's) or pinches (zoomed around the fingers' middle, and moved as the middle moves) */
function chMove(s, e, at) {
  s.hover = { x: at.x, y: at.y };
  const L = s.L;
  // a line being pulled: the price under the pointer, on the market's step, drawn in the next frame (the line and its tag say where it would
  // go); a move of less than CH_DRAG_PX is still a press
  const ld = s.lineDrag;
  if (ld && ld.id === e.pointerId) {
    if (!ld.moved && Math.abs(at.y - ld.y0) < CH_DRAG_PX) return;
    ld.moved = true;
    if (L) ld.price = chSnap(L.sc.price(Math.max(0, Math.min(L.sc.bottom, at.y))), s.step);
    return void chSoon(s);
  }
  // over a line that drags, the plot's cursor says it can be pulled
  const over = !!L && !s.drag && !s.pinch && at.x <= L.plotW && !!chLineAt(s, at.y);
  if (over !== s.lineHover) {
    s.lineHover = over;
    if (s.parts.plot.classList) s.parts.plot.classList.toggle("ln-hover", over);
  }
  if (s.ptrs.has(e.pointerId)) s.ptrs.set(e.pointerId, at);
  if (L && s.pinch && s.ptrs.size >= 2) {
    const [a, b] = [...s.ptrs.values()];
    const p = s.pinch;
    const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const mid = (a.x + b.x) / 2;
    const under = p.end - (L.sc.usable - p.x) / p.slot;
    const c = chClamp(s, { slot: (p.slot * d) / p.d, end: p.end }, L.sc.usable);
    chSetView(s, { slot: c.slot, end: under + (L.sc.usable - mid) / c.slot });
    return;
  }
  const g = s.drag;
  if (L && g && g.id === e.pointerId) {
    const dx = at.x - g.x;
    if (!g.moved && Math.abs(dx) < CH_DRAG_PX) return void chSoonShow(s);
    if (!g.moved && s.parts.plot.classList) s.parts.plot.classList.add("drag");
    g.moved = true;
    return void chSetView(s, { slot: g.slot, end: g.end - dx / g.slot });
  }
  chSoonShow(s);
}
/* a pointer let go (or taken by the browser: `cancel`): the drag or the pinch it made ends */
function chUp(s, e, cancel = false) {
  // a line let go after it was pulled: handed to the page at the price it was pulled to (to be signed there); it is drawn back at its own.
  // One the browser took (cancel) is only drawn back: nothing was let go there
  const ld = s.lineDrag;
  if (ld && ld.id === e.pointerId) {
    s.lineDrag = null;
    chSoon(s);
    if (!cancel && ld.moved && ld.price > 0 && ld.price !== ld.line.price && typeof s.onLine === "function") s.onLine(ld.line, ld.price);
    return;
  }
  s.ptrs.delete(e.pointerId);
  if (s.pinch && s.ptrs.size < 2) s.pinch = null;
  if (s.drag && s.drag.id === e.pointerId) {
    s.drag = null;
    if (s.parts.plot.classList) s.parts.plot.classList.remove("drag");
  }
}
/* THE WHEEL: up and down zooms around the pointer (a trackpad's pinch comes as a wheel with ctrl, finer), sideways moves through time; the
   page does not scroll under it */
function chWheel(s, e, at) {
  if (!s.L) return;
  const dx = Number(e.deltaX) || 0;
  const dy = Number(e.deltaY) || 0;
  if (!dx && !dy) return;
  if (typeof e.preventDefault === "function") e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  s.hover = { x: at.x, y: at.y };
  if (Math.abs(dx) > Math.abs(dy)) {
    const v = chViewOf(s);
    return void chSetView(s, { slot: v.slot, end: v.end + (dx * unit) / v.slot });
  }
  chZoom(s, Math.exp(-dy * unit * (e.ctrlKey ? 0.01 : 0.0015)), at.x);
}

// ---- drawing ------------------------------------------------------------------------------------------------------------------------

/* drawn again once, in the next frame, however often its size, its view or its newest bar changed */
function chSoon(s) {
  if (s.drawQueued) return;
  s.drawQueued = true;
  nextFrame(() => {
    s.drawQueued = false;
    if (!chLive(s)) return;
    chDraw(s);
    // a pushed price this frame shows: how long after its venue's moment it reached the screen (ui/stream.js stDrawn)
    if (s.lagQ && s.L && typeof stDrawn === "function") stDrawn(s.lagQ);
    s.lagQ = null;
  });
}

/** THE PANEL as it stands: reading · the source's refusal in its words · no bars yet · the picture. The picture needs its box laid out:
 * until it is (a pane still coming in), nothing is drawn and the size observer draws it. The picture under the live layer is drawn again
 * only when what it shows changed (the bars, the view, the scale, the size): a live price that keeps the scale redraws the live layer alone */
function chDraw(s) {
  const P = s.parts;
  const word = chIvWord(s.interval);
  const quiet = (html) => {
    s.L = null;
    s.x = null;
    s.staticKey = "";
    paint(P.ohlc, "");
    paint(P.cross, "");
    if (P.cross.classList) P.cross.classList.remove("on");
    paint(P.foot, "");
    paint(P.live, "");
    if (P.ind) paint(P.ind, "");
    if (P.lines) paint(P.lines, "");
    paint(P.hint, "");
    paint(P.draw, html);
  };
  if (!s.bars) return void quiet(s.said ? `<p class="ch-msg ch-no">${esc(s.said)}</p>` : `<p class="ch-msg ch-wait" aria-busy="true">Reading the ${esc(word)} bars…</p>`);
  if (!s.bars.length) return void quiet(`<p class="ch-msg">${esc(`No ${chIvWord(s.biv)} bars from ${s.venueName} for ${s.symbol} yet.`)}</p>`);
  const W = Math.floor(P.plot.clientWidth || 0);
  const H = Math.floor(P.plot.clientHeight || 0);
  if (W < 60 || H < 80) return;
  const L = chLayout(s, W, H);
  s.L = L;
  if (L.key !== s.staticKey) {
    s.staticKey = L.key;
    paint(P.draw, chSvg(s, L));
  }
  paint(P.live, chLiveSvg(s, L));
  // the indicators over the price and under it, then the account's own lines and the desk's trades over them
  if (P.ind) paint(P.ind, chIndSvg(s, L));
  if (P.lines) paint(P.lines, chLinesSvg(s, L) + chMarksSvg(s, L));
  // the readout's box: over the price pane's corner, as wide as the pane (its words wrap inside it; nothing outside it moves)
  if (P.ohlc.style) P.ohlc.style.width = `${Math.max(40, L.plotW - CH_RO_LEFT - 4)}px`;
  if (paint(P.cross, chCrossSvg(L)) || !s.x) {
    const c = (sel) => P.cross.querySelector(sel);
    s.x = { v: c(".ch-xv"), h: c(".ch-xh"), pt: c(".ch-xpt"), pr: c(".ch-xpr"), tt: c(".ch-xtt"), tr: c(".ch-xtr") };
  }
  s.footSaid = chFootHtml(s);
  paint(P.foot, s.footSaid);
  chHintAgain(s);
  if (s.hover) chShow(s);
  else chReadoutAt(s, s.bars.length - 1);
  chMaybePage(s, L);
}

/* the foot: whose bars (the source the account read them from: its own name for them, else the venue's), what size, what was folded from
   what, which hours they cover, what the prices are adjusted for and priced in, whose clock — and, at its right where it is never cut
   short, how old the live price on the last bar is once it is not the last few seconds' (core ageWords): the line at the last price is
   never an old price passed off as now. The whole of it on hover */
function chFootParts(s) {
  const m = s.meta || {};
  const left = [m.source || s.venueName, ...chSeamWords(s), `${chIvWord(s.biv)} bars`];
  if (m.folded) left.push(m.folded);
  if (m.session) left.push(m.session);
  if (m.adjustment) left.push(m.adjustment);
  if (s.cur && !s.ev) left.push(`prices in ${s.cur}`);
  if (s.ev) left.push("prices in cents");
  left.push(CH_MS[s.biv] >= CH_MS["1d"] ? "each bar's own day" : chZoneWords());
  // the scale the picture is drawn on, not only the one pressed: a price at or below zero in view keeps it straight (chScale)
  if (s.L && s.L.sc.log) left.push("log scale");
  else if (s.log && !s.ev) left.push("straight scale: a price at or below zero has no logarithm");
  // a pushed price is as old as its stream's last word on it (seen); while it is live and fresh, it is said to be live
  const q = s.quote;
  const age = q && typeof ageWords === "function" ? ageWords(q.pushed ? q.seen : q.at) : "";
  const from = q && q.from && q.from !== s.venueName ? q.from : "";
  const right = age ? `last price ${from ? `from ${from}, ` : ""}${age}` : q && q.pushed && s.pushLive ? `last price live${from ? ` from ${from}` : ""}` : "";
  return { left: left.join(" · "), right };
}
/* the moment a stretch of the series starts, as the foot says it: a daily or weekly bar's day ("Mon 18 Oct 2021"), an intraday bar's day
   and time on the viewer's clock ("Mon 18 Oct 2021 13:05") */
function chSeamWhen(t, interval) {
  if (CH_MS[interval] >= CH_MS["1d"]) return chWhen(t, "1d");
  const p = chParts(t, CH_ZONE);
  return `${p.wd} ${p.d} ${p.mo} ${p.y} ${p.hh}:${p.mm}`;
}
/* THE SEAMS in words, newest first: where older bars are another source's, "before Mon 18 Oct 2021: Nasdaq · AAPL" — the moment the newer
   stretch starts and whose the bars before it are, with what they are adjusted for and which hours they cover where that differs from the
   newest stretch's */
function chSeamWords(s) {
  const segs = s.segs || [];
  if (segs.length < 2) return [];
  const top = segs[segs.length - 1];
  const out = [];
  for (let k = segs.length - 2; k >= 0; k--) {
    const g = segs[k];
    const differs = [g.adjustment && g.adjustment !== top.adjustment ? g.adjustment : "", g.session && g.session !== top.session ? g.session : ""].filter(Boolean);
    out.push(`before ${chSeamWhen(segs[k + 1].from, s.biv)}: ${g.source || "another source"}${differs.length ? ` (${differs.join(", ")})` : ""}`);
  }
  return out;
}
function chFootHtml(s) {
  const f = chFootParts(s);
  return `<span class="ch-fl" title="${esc(f.right ? `${f.left} · ${f.right}` : f.left)}">${esc(f.left)}</span>${f.right ? `<span class="ch-fr">${esc(f.right)}</span>` : ""}`;
}

/* THE HINT at the plot's foot, quiet, where the view is near the oldest bar: older bars loading; a page that did not come, in its words;
   where the history ends, in the source's words; the most bars this chart holds reached; older bars to scroll to where a first view did not
   reach its range's start — and else what the source said of the size it drew the range in (a coarser one than asked, and why) */
function chHintWords(s) {
  const L = s.L;
  const oldest = !!L && L.sc.from === 0;
  if (s.paging.busy) return { words: `Loading older ${CH_IV_WORDS[s.biv] || s.biv} bars…`, busy: true };
  if (oldest && s.paging.said) return { words: s.paging.said };
  if (oldest && s.bars.length >= CH_MOST) return { words: `The latest ${CH_MOST.toLocaleString("en-US")} bars are held here: a larger bar size reaches further back.` };
  if (oldest && s.edge && !s.edge.more && s.edge.ends) return { words: s.edge.ends };
  const days = CH_RANGE_DAYS[s.range];
  const first = s.bars[0].t;
  const last = s.bars[s.bars.length - 1].t;
  if (oldest && s.edge && s.edge.more && !s.view && days && last - first < days * CH_DAY * 0.5) return { words: `Older ${CH_IV_WORDS[s.biv] || s.biv} bars: drag or scroll left to load them.` };
  if (s.meta.note) return { words: s.meta.note };
  return { words: "" };
}
function chHintAgain(s) {
  const P = s.parts;
  if (!P.hint || !s.bars || !s.bars.length) return;
  const h = chHintWords(s);
  paint(P.hint, esc(h.words));
  if (P.hint.classList) P.hint.classList.toggle("busy", !!h.busy);
}

/* the picture's layout at W × H: the figures' format, the volume pane where the bars carry volume (18% of the plot, 28–96 pixels), the price
   axis as wide as its longest figure, the room under the top edge the readout is laid over (as many lines as the longest readout of these
   bars takes at this width: set by the layout, never by the bar the pointer is on), the view kept inside what can be shown, the scales, the
   time labels that fit, where the newest candle's column starts (the live layer draws from there), and what the picture under the live
   layer was drawn for (`key`: its size, its view, its scale, the bars' changes — never the newest bar's prices alone) */
function chLayout(s, W, H) {
  const bars = s.bars;
  const fmt = chFmt(s.dec, s.ev);
  const plotH = Math.max(40, H - CH_TIME_H);
  let hasVol = false;
  let maxH = 0;
  let minL = Infinity;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!hasVol && b.v > 0) hasVol = true;
    if (b.h > maxH) maxH = b.h;
    if (b.l < minL) minL = b.l;
  }
  // the indicators, computed again where the list, the bars or the newest bar changed (a live price moves the newest value)
  const last = bars[bars.length - 1];
  const indKey = s.ind && s.ind.length && typeof inCompute === "function" ? [inString(s.ind), s.sver, s.biv, bars.length, last.c, last.h, last.l, last.v].join("|") : "";
  if (indKey !== s.indKey) {
    s.indKey = indKey;
    s.indOut = indKey ? inCompute(bars, s.ind, { intraday: (CH_MS[s.biv] || 0) < CH_MS["1d"], dayOf: (t) => chBarStart(t, "1d", chClock(s)) }) : [];
  }
  // the panes under the price: each a fifth of the plot, 56 to 120 pixels, the price pane keeping 140 at least (a short chart draws
  // fewer panes, the first of the list first)
  const under = s.indOut.filter((o) => o.pane === "under");
  let nSub = under.length;
  let subH = nSub ? Math.max(56, Math.min(120, Math.round(plotH * 0.2))) : 0;
  if (nSub && plotH - subH * nSub < 140) {
    subH = Math.floor((plotH - 140) / nSub);
    if (subH < 40) {
      nSub = Math.max(0, Math.min(nSub, Math.floor((plotH - 140) / 40)));
      subH = nSub ? Math.floor((plotH - 140) / nSub) : 0;
    }
  }
  const priceH = plotH - subH * nSub;
  const volH = hasVol ? Math.max(28, Math.min(96, Math.round(priceH * 0.18))) : 0;
  const wide = Math.max(fmt(maxH).length, fmt(minL).length);
  const axisW = Math.max(44, Math.min(120, Math.ceil((wide + 1) * 6.6 + 12)));
  const plotW = Math.max(20, W - axisW);
  // the readout's room: the bar's own figures and, after them, each indicator's value
  const extra = s.indOut.flatMap((o) => o.series.map((se) => se.name.length + 1 + (se.fmt === "price" ? wide : 5)));
  const roomTop = CH_RO_TOP + chReadoutLines(wide, plotW, W <= CH_SMALL_W, extra) * CH_LINE_H + 3;
  const sl = chSlotsOf(s);
  const usable = Math.max(1, plotW - CH_PAD_R);
  if (s.view) s.view = chClamp(s, s.view, usable);
  const sc = chScale(bars, plotW, priceH, volH, roomTop, { pos: sl.pos, view: s.view, log: s.log && !s.ev });
  // each pane under the price: its top, its own scale over what is in view (a fixed one where the indicator has it: 0 to 100), its
  // guides inside it, a row at its top for its label
  const subs = [];
  for (let k = 0; k < nSub; k++) {
    const o = under[k];
    const top = priceH + k * subH;
    let lo = Infinity;
    let hi = -Infinity;
    if (o.range) [lo, hi] = o.range;
    else {
      for (const se of o.series)
        for (let i = sc.from; i < sc.to; i++) {
          const v = se.values[i];
          if (v === null || v === undefined || !Number.isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      for (const g of o.guides || []) {
        if (g < lo) lo = g;
        if (g > hi) hi = g;
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
      if (hi === lo) {
        const d = Math.abs(hi) * 0.01 || 1;
        lo -= d;
        hi += d;
      }
    }
    const padT = 14;
    const padB = 4;
    const h = Math.max(1, subH - padT - padB);
    subs.push({ o, top, h: subH, lo, hi, y: (v) => top + padT + ((hi - v) / (hi - lo)) * h });
  }
  // "Now →" while the view's right edge is behind the newest bar
  if (s.parts.now) s.parts.now.hidden = !(s.view && s.view.end < sc.total - 0.5);
  const tickFmt = chFmt(sc.ticks.reduce((d, t) => Math.max(d, chDecimalsOf(t)), 0), s.ev);
  if (!s.labels) s.labels = chTimeLabels(bars, s.biv);
  // the labels that fit, as the last layout found them where nothing they stand on moved (a live price moves none of them)
  const P0 = s.L;
  const same = !!P0 && P0.sver === s.sver && P0.plotW === plotW && P0.sc.from === sc.from && P0.sc.to === sc.to && P0.sc.slot === sc.slot && P0.sc.end === sc.end;
  let labels = same ? P0.labels : null;
  if (!labels) {
    // the candidates in view (they are in the bars' order: the window found by halving, not by reading them all)
    const lab = s.labels;
    let a = 0;
    let b = lab.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (lab[m].i < sc.from) a = m + 1;
      else b = m;
    }
    const inView = [];
    for (let k = a; k < lab.length && lab[k].i < sc.to; k++) inView.push(lab[k]);
    labels = chThin(inView, sc.cx, plotW);
  }
  // the newest candle's column: the newest bar's own slot, or where bars share a pixel's column, every bar in the newest one's
  const len = bars.length;
  let liveFrom = sc.to;
  if (sc.to === len && len) {
    liveFrom = len - 1;
    if (sc.slot < 1) {
      const col = sc.cx(len - 1);
      while (liveFrom > sc.from && sc.cx(liveFrom - 1) === col) liveFrom--;
    }
  }
  const key = [W, H, plotW, axisW, volH, roomTop, priceH, sc.from, sc.to, sc.slot, sc.end, sc.lo, sc.hi, sc.vmax, sc.log, s.sver, liveFrom, s.edge && s.edge.more].join("|");
  return { W, H, plotW, plotH, priceH, subs, axisW, volH, roomTop, sc, fmt, tickFmt, labels, liveFrom, key, sl, sver: s.sver };
}

/* the candles and their volume for bars [i0, i1) of the picture, as path data: one candle a bar where a bar has a pixel's column or more,
   else one a column (its first open, highest high, lowest low, last close; its volume the highest of them) — a 1px wick from high to low
   and a body from open to close at least 1px high (where the body would be no wider than the wick, the wick alone), up when the close is at
   or above the open */
function chCandles(s, L, i0, i1) {
  const { sc, priceH } = L;
  const B = s.bars;
  const half = (sc.bw - 1) / 2;
  const out = { cu: "", cd: "", vu: "", vd: "" };
  const put = (x, o, h, l, c, v) => {
    const up = c >= o;
    const yh = Math.round(sc.y(h));
    const yl = Math.round(sc.y(l));
    let shape = `M${x} ${yh}h1v${Math.max(1, yl - yh)}h-1Z`;
    if (sc.bw > 1) {
      const yo = Math.round(sc.y(o));
      const yc = Math.round(sc.y(c));
      shape += `M${x - half} ${Math.min(yo, yc)}h${sc.bw}v${Math.max(1, Math.abs(yo - yc))}h${-sc.bw}Z`;
    }
    if (up) out.cu += shape;
    else out.cd += shape;
    const vh = Math.round(sc.vh(v));
    if (vh > 0) {
      const bar = `M${x - half} ${priceH - vh}h${sc.bw}v${vh}h${-sc.bw}Z`;
      if (up) out.vu += bar;
      else out.vd += bar;
    }
  };
  if (sc.slot >= 1) {
    for (let i = i0; i < i1; i++) {
      const b = B[i];
      put(sc.cx(i), b.o, b.h, b.l, b.c, b.v);
    }
    return out;
  }
  let col = NaN;
  let o = 0;
  let h = 0;
  let l = 0;
  let c = 0;
  let v = 0;
  for (let i = i0; i < i1; i++) {
    const b = B[i];
    const x = sc.cx(i);
    if (x !== col) {
      if (Number.isFinite(col)) put(col, o, h, l, c, v);
      col = x;
      o = b.o;
      h = b.h;
      l = b.l;
      c = b.c;
      v = Number.isFinite(b.v) ? b.v : 0;
    } else {
      if (b.h > h) h = b.h;
      if (b.l < l) l = b.l;
      c = b.c;
      if (Number.isFinite(b.v) && b.v > v) v = b.v;
    }
  }
  if (Number.isFinite(col)) put(col, o, h, l, c, v);
  return out;
}

/** THE PICTURE under the live layer, as one SVG string: the grid at the round prices and the labelled times, the volume pane (its bars
 * tinted by direction, its own scale: the highest volume shown, on the axis), the candles in view but the newest one's column, the dashed
 * break lines where a hole is longer than its empty slots or a share's sessions meet, the seams where the bars before are another source's
 * (s.segs: never two sources joined unmarked), the line where the source's history starts (where it
 * is in view, nothing older exists and the source said where its history ends), the axes' edges and the time labels */
function chSvg(s, L) {
  const { sc, plotW, plotH, W, H, labels } = L;
  const c = chCandles(s, L, sc.from, L.liveFrom);
  let grid = "";
  let axis = "";
  for (const t of sc.ticks) {
    const y = Math.round(sc.y(t));
    if (y < 4 || y > sc.bottom - 2) continue;
    grid += `M0 ${y + 0.5}H${plotW}`;
  }
  for (const l of labels) {
    grid += `M${l.x + 0.5} 0V${plotH}`;
    axis += `<text class="ch-ax" x="${l.x + 0.5}" y="${plotH + 15}" text-anchor="middle">${esc(l.text)}</text>`;
  }
  // the breaks in view: a hole longer than its empty slots, a share's sessions meeting — a dashed line where the next bar's slot starts
  let brk = "";
  for (const h of L.sl.holes) {
    if (!h.brk || h.i <= sc.from || h.i >= sc.to) continue;
    const x = Math.round(sc.xOf(h.b));
    brk += `M${x + 0.5} 0V${plotH}`;
  }
  const breaks = brk ? `<path class="ch-gapl" d="${brk}"/>` : "";
  // the seams in view: where the bars before are another source's, a dashed line where the newer stretch's first bar's slot starts
  let sm = "";
  const segs = s.segs || [];
  for (let k = 1; k < segs.length; k++) {
    const i = chIndexAt(s.bars, segs[k].from);
    if (s.bars[i].t !== segs[k].from || i <= sc.from || i >= sc.to) continue;
    sm += `M${Math.round(sc.xOf(L.sl.pos[i])) + 0.5} 0V${plotH}`;
  }
  const seams = sm ? `<path class="ch-seam" d="${sm}"/>` : "";
  const start = sc.from === 0 && s.edge && !s.edge.more && s.edge.ends && sc.n ? `<path class="ch-start" d="M${Math.round(sc.xOf(0)) + 0.5} 0V${plotH}"/>` : "";
  // the volume pane's own scale: its top is the highest volume shown
  const vol = sc.volH > 0 && sc.vmax > 0 ? `<path class="ch-sep" d="M0 ${sc.volTop - CH_VOL_GAP / 2 + 0.5}H${plotW}"/><path class="ch-vu" d="${c.vu}"/><path class="ch-vd" d="${c.vd}"/><text class="ch-ax ch-vax" x="${plotW + 6}" y="${sc.volTop + 9}">${esc(chCompact(sc.vmax))}</text>` : "";
  return `<svg class="ch-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path class="ch-grid" d="${grid}"/>${vol}<g class="ch-cs"><path class="ch-cu" d="${c.cu}"/><path class="ch-cd" d="${c.cd}"/></g>${breaks}${seams}${start}<path class="ch-edge" d="M${plotW + 0.5} 0V${plotH}M0 ${plotH + 0.5}H${W}"/>${axis}</svg>`;
}

/** THE LIVE LAYER, as one small SVG string over the picture: the newest candle's column and its volume (where it is in view), the price
 * axis's figures (each round price's label unless the last price's tag stands there), and the dashed line at the last price with its value
 * in a tag on the axis tinted by the last bar's direction — what a live price moves. It carries the chart's words for a screen reader */
function chLiveSvg(s, L) {
  const { sc, plotW, plotH, axisW, W, H, fmt, tickFmt } = L;
  const B = s.bars;
  const c = chCandles(s, L, L.liveFrom, sc.to);
  const last = B[B.length - 1];
  const lastDir = last.c >= last.o ? "up" : "down";
  const ly = Math.min(L.priceH - 9, Math.max(9, Math.round(sc.y(last.c))));
  const lyIn = Math.round(sc.y(last.c));
  let axis = "";
  for (const t of sc.ticks) {
    const y = Math.round(sc.y(t));
    if (y < 4 || y > sc.bottom - 2) continue;
    if (Math.abs(y - ly) >= 14) axis += `<text class="ch-ax" x="${plotW + 6}" y="${y + 4}">${esc(tickFmt(t))}</text>`;
  }
  const vol = c.vu || c.vd ? `<path class="ch-vu" d="${c.vu}"/><path class="ch-vd" d="${c.vd}"/>` : "";
  const scale = sc.log ? " on a log scale" : s.log && !s.ev ? " on a straight scale (a price at or below zero has no logarithm)" : "";
  const label = `${s.symbol} at ${s.venueName}, ${chIvWord(s.biv)} bars${scale}: last ${fmt(last.c)}; low ${fmt(sc.low)} and high ${fmt(sc.high)} over the ${sc.n} bars shown`;
  const lastLine = lyIn >= 0 && lyIn <= sc.bottom ? `<path class="ch-last ${lastDir}" d="M0 ${lyIn + 0.5}H${plotW}"/>` : "";
  return `<svg class="ch-svg ch-lsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" focusable="false">${vol}<g class="ch-cs"><path class="ch-cu" d="${c.cu}"/><path class="ch-cd" d="${c.cd}"/></g>${axis}${lastLine}<rect class="ch-tagr ${lastDir}" x="${plotW + 1}" y="${ly - 9}" width="${axisW - 1}" height="18" rx="3"/><text class="ch-tagt" x="${plotW + 6}" y="${ly + 4}">${esc(fmt(last.c))}</text></svg>`;
}

/* the crosshair, drawn once per layout: a vertical line with the time's tag on the time axis, a horizontal one with the price's tag on the
   price axis. Moved by a transform; its tags' places and words set in place */
function chCrossSvg(L) {
  return `<svg class="ch-xs" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" focusable="false"><g class="ch-xv" transform="translate(0 0)"><line class="ch-xl" x1="0.5" y1="0" x2="0.5" y2="${L.plotH}"/><rect class="ch-xb ch-xtr" x="0" y="${L.plotH + 2}" width="0" height="18" rx="3"/><text class="ch-xw ch-xtt" x="0" y="${L.plotH + 15}" text-anchor="middle"></text></g><g class="ch-xh" transform="translate(0 0)"><line class="ch-xl" x1="0" y1="0.5" x2="${L.plotW}" y2="0.5"/><rect class="ch-xb ch-xpr" x="${L.plotW + 1}" y="-9" width="${L.axisW - 1}" height="18" rx="3"/><text class="ch-xw ch-xpt" x="${L.plotW + 6}" y="4"></text></g></svg>`;
}

/* the readout says one bar: the one under the pointer, else the last — with the words its source gave it where it is a daily bar built
   from intraday ones ("Today so far"), and whose it is where it stands on the far side of a seam (another source's than the newest bars:
   the foot names only theirs first); over a hole, why there is no bar there */
function chReadoutAt(s, i, hole) {
  const L = s.L;
  if (hole) return void paint(s.parts.ohlc, `<span class="ch-gapw">${esc(`No bar · ${hole.why}`)}</span>`);
  if (!L || !s.bars || !s.bars[i]) return void paint(s.parts.ohlc, "");
  const prev = i > 0 ? s.bars[i - 1].c : null;
  const today = s.meta.today && s.meta.today.t === s.bars[i].t && s.meta.today.words ? ` <span class="ch-today">${esc(s.meta.today.words)}</span>` : "";
  const segs = s.segs || [];
  const k = segs.length > 1 ? chSegAt(s, s.bars[i].t) : -1;
  const whose = k >= 0 && k < segs.length - 1 && segs[k].source ? ` <span class="ch-src">${esc(segs[k].source)}</span>` : "";
  paint(s.parts.ohlc, chReadout(s.bars[i], prev, L.fmt).html + today + whose + chIndReadout(s, i));
}
/* the indicators' values at bar i after the bar's own: each series its name and its figure in its colour (a dash before it has one) */
function chIndReadout(s, i) {
  const L = s.L;
  if (!L || !s.indOut || !s.indOut.length) return "";
  let html = "";
  for (const o of s.indOut)
    for (const se of o.series) {
      const v = se.values[i];
      const words = v === null || v === undefined || !Number.isFinite(v) ? "—" : se.fmt === "plain" ? String(Math.round(v * 10) / 10) : L.fmt(v);
      html += ` <span class="ch-kv ch-inv"><span class="ch-k">${esc(se.name)}</span> <span class="ch-v ${esc(se.cls)}">${esc(words)}</span></span>`;
    }
  return html;
}

/* THE INDICATORS' LAYER (see the head of this file): over the price pane, each series a line through its values in view — one point a
   column where bars share one, the pen lifted where a value is missing — and a band filled between its two; under it, each pane with its
   separator, its label, its guides with their figures on the axis, its series, a histogram as bars either side of zero. Each pane an inner
   svg, which clips what it holds to the pane */
function chIndSvg(s, L) {
  const outs = s.indOut || [];
  if (!L || !outs.length || !s.bars || !s.bars.length) return "";
  const { sc, plotW, W, H, fmt } = L;
  const cols = [];
  let lastX = NaN;
  for (let i = sc.from; i < sc.to; i++) {
    const x = sc.cx(i);
    if (x === lastX) cols[cols.length - 1] = i;
    else {
      cols.push(i);
      lastX = x;
    }
  }
  const has = (v) => v !== null && v !== undefined && Number.isFinite(v);
  const line = (values, y, cls) => {
    let d = "";
    let pen = false;
    for (const i of cols) {
      const v = values[i];
      if (!has(v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${sc.cx(i) + 0.5} ${Math.round(y(v)) + 0.5}`;
      pen = true;
    }
    return d ? `<path class="ch-inl ${esc(cls)}" d="${d}"/>` : "";
  };
  const band = (up, lo, y, cls) => {
    let d = "";
    let top = [];
    let bot = [];
    const flush = () => {
      if (top.length > 1) d += `M${top.join("L")}L${bot.reverse().join("L")}Z`;
      top = [];
      bot = [];
    };
    for (const i of cols) {
      const a = up[i];
      const b = lo[i];
      if (!has(a) || !has(b)) {
        flush();
        continue;
      }
      const x = sc.cx(i) + 0.5;
      top.push(`${x} ${Math.round(y(a)) + 0.5}`);
      bot.push(`${x} ${Math.round(y(b)) + 0.5}`);
    }
    flush();
    return d ? `<path class="ch-inb ${esc(cls)}" d="${d}"/>` : "";
  };
  let over = "";
  for (const o of outs) {
    if (o.pane !== "over") continue;
    if (o.band) over += band(o.series[o.band[0]].values, o.series[o.band[1]].values, sc.y, o.series[o.band[0]].cls);
    for (const se of o.series) over += line(se.values, sc.y, se.cls);
  }
  let under = "";
  for (const p of L.subs || []) {
    const o = p.o;
    const plain = o.series[0] && o.series[0].fmt === "plain";
    const vf = (v) => (plain ? String(Math.round(v * 10) / 10) : fmt(v));
    under += `<path class="ch-sep" d="M0 ${p.top + 0.5}H${plotW}"/><text class="ch-inlab" x="6" y="${p.top + 11}">${esc(o.label)}</text>`;
    for (const g of o.guides || []) {
      const yi = Math.round(p.y(g));
      if (yi <= p.top + 12 || yi >= p.top + p.h) continue;
      under += `<path class="ch-ing" d="M0 ${yi + 0.5}H${plotW}"/><text class="ch-ax" x="${plotW + 6}" y="${yi + 4}">${esc(vf(g))}</text>`;
    }
    // the pane's reach on the axis where it has no fixed range: its top and its foot
    if (!o.range) under += `<text class="ch-ax" x="${plotW + 6}" y="${p.top + 24}">${esc(vf(p.hi))}</text><text class="ch-ax" x="${plotW + 6}" y="${p.top + p.h - 2}">${esc(vf(p.lo))}</text>`;
    const py = (v) => p.y(v) - p.top;
    let inner = "";
    for (const se of o.series) {
      if (se.kind === "bars") {
        const w = Math.max(1, sc.bw);
        const y0 = Math.round(py(0));
        let up = "";
        let down = "";
        for (const i of cols) {
          const v = se.values[i];
          if (!has(v)) continue;
          const yv = Math.round(py(v));
          const x = sc.cx(i) - (w - 1) / 2;
          const bar = `M${x} ${Math.min(y0, yv)}h${w}v${Math.max(1, Math.abs(yv - y0))}h${-w}Z`;
          if (v >= 0) up += bar;
          else down += bar;
        }
        inner += `<path class="ch-inh up" d="${up}"/><path class="ch-inh down" d="${down}"/>`;
      } else inner += line(se.values, py, se.cls);
    }
    under += `<svg x="0" y="${p.top}" width="${plotW}" height="${p.h}" aria-hidden="true">${inner}</svg>`;
  }
  if (!over && !under) return "";
  return `<svg class="ch-svg ch-isvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${over ? `<svg x="0" y="0" width="${plotW}" height="${Math.max(1, Math.round(sc.bottom))}">${over}</svg>` : ""}${under}</svg>`;
}

/* a pointer move's crosshair, once a frame */
function chSoonShow(s) {
  if (s.queued) return;
  s.queued = true;
  nextFrame(() => {
    s.queued = false;
    if (chLive(s)) chShow(s);
  });
}

/* the hole a slot is in, where it is in one (chSlots: empty slots between two bars) */
function chHoleAt(s, slot) {
  const holes = chSlotsOf(s).holes;
  let a = 0;
  let b = holes.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (holes[m].b <= slot) a = m + 1;
    else b = m;
  }
  const h = holes[a];
  return h && h.a <= slot && slot < h.b ? h : null;
}

/** THE CROSSHAIR where the pointer is (or the keys put it): the vertical line on the middle of the bar under it with that bar's time in a
 * tag on the time axis (kept inside the plot) — over an empty slot, on that slot, with its time where the hole is drawn whole and the
 * readout saying why no bar is there — the horizontal line at the pointer with the price there in a tag on the price axis (the tag kept
 * whole inside the price pane near its edges) — hidden over the volume pane and the time axis — and the readout saying that bar. Only
 * transforms, attributes and words: the picture is not drawn again, and no box changes its size */
function chShow(s) {
  const L = s.L;
  const X = s.x;
  const h = s.hover;
  if (!L || !X || !h || !s.bars || !s.bars.length || !X.v || !X.h) return;
  const sc = L.sc;
  let i;
  let hole = null;
  let x;
  let when;
  if (h.key) {
    i = Math.max(sc.from, Math.min(sc.to - 1, h.i));
    if (i < 0) return;
    x = sc.cx(i);
    when = chWhen(s.bars[i].t, s.biv);
  } else {
    const px = Math.min(h.x, sc.usable);
    i = sc.at(px);
    const slot = sc.slotAt(px);
    hole = i >= sc.from && i < sc.to && L.sl.pos[i] !== slot ? chHoleAt(s, slot) : null;
    if (hole) {
      x = Math.floor(sc.xOf(slot + 0.5));
      when = hole.brk ? "No bars" : chWhen(s.bars[hole.i - 1].t + (slot - L.sl.pos[hole.i - 1]) * CH_MS[s.biv], s.biv);
    } else {
      x = sc.cx(i);
      when = chWhen(s.bars[i].t, s.biv);
    }
  }
  const bar = s.bars[i];
  X.v.setAttribute("transform", `translate(${x} 0)`);
  const tw = Math.ceil(when.length * 6.4 + 14);
  const left = Math.round(Math.max(-x, Math.min(L.plotW - x - tw, -tw / 2)));
  if (X.tr) {
    X.tr.setAttribute("x", String(left));
    X.tr.setAttribute("width", String(tw));
  }
  if (X.tt) {
    X.tt.setAttribute("x", String(left + tw / 2));
    setText(X.tt, when);
  }
  const y = h.key ? sc.y(bar.c) : h.y;
  if (Number.isFinite(y) && y >= 0 && y <= sc.bottom) {
    const yy = Math.round(y);
    X.h.setAttribute("transform", `translate(0 ${yy})`);
    X.h.setAttribute("visibility", "visible");
    // the line where the pointer is; its tag kept whole inside the price pane, as the last price's is
    const dy = Math.min(Math.max(9, sc.bottom - 9), Math.max(9, yy)) - yy;
    if (X.pr) X.pr.setAttribute("y", String(dy - 9));
    if (X.pt) {
      X.pt.setAttribute("y", String(dy + 4));
      setText(X.pt, L.fmt(sc.price(yy)));
    }
  } else X.h.setAttribute("visibility", "hidden");
  if (s.parts.cross.classList) s.parts.cross.classList.add("on");
  chReadoutAt(s, i, hole);
}

/* the pointer left (or the keys let go): no crosshair, the readout back on the last bar */
function chLeave(s) {
  s.hover = null;
  if (s.parts.cross.classList) s.parts.cross.classList.remove("on");
  if (s.bars && s.bars.length) chReadoutAt(s, s.bars.length - 1);
}

/* the keys on the plot: ← and → a bar at a time (the view following past either edge), Home the oldest shown, End the newest shown, + and
   − zoom (around the crosshair where the keys put it), Escape away */
function chKey(s, e) {
  // F fills the window with the chart, or brings the page back, where the page offers it
  if ((e.key === "f" || e.key === "F") && s.fullscreen && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    return void chSetFull(s, !s.full);
  }
  const L = s.L;
  if (!L || !s.bars || !s.bars.length) return;
  const sc = L.sc;
  if (e.key === "Escape") return void (s.hover && chLeave(s));
  if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_" || e.key === "−") {
    if (typeof e.preventDefault === "function") e.preventDefault();
    const at = s.hover && s.hover.key ? sc.cx(Math.max(sc.from, Math.min(sc.to - 1, s.hover.i))) : s.hover ? s.hover.x : undefined;
    return void chZoom(s, e.key === "+" || e.key === "=" ? CH_KEY_ZOOM : 1 / CH_KEY_ZOOM, at);
  }
  const cur = s.hover && s.hover.key ? s.hover.i : null;
  const last = s.bars.length - 1;
  const to = { ArrowLeft: cur === null ? sc.to - 1 : Math.max(0, cur - 1), ArrowRight: cur === null ? sc.to - 1 : Math.min(last, cur + 1), Home: sc.from, End: sc.to - 1 }[e.key];
  if (to === undefined || to < 0) return;
  if (typeof e.preventDefault === "function") e.preventDefault();
  s.hover = { key: true, i: to };
  // a bar the keys moved to outside the view: the view moves just far enough to show it
  if (to < sc.from || to >= sc.to) {
    const v = chViewOf(s);
    const p = L.sl.pos[to];
    const span = sc.usable / v.slot;
    s.view = chClamp(s, { slot: v.slot, end: to < sc.from ? p + span : p + 1 }, sc.usable);
    return void chSoon(s);
  }
  chShow(s);
}
