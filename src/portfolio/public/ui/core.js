/* The account page: the user's real accounts on one page, each read through the venue's own interface. It renders /api/account and
   signs what the owner asks for; it decides nothing the account did not. */
/* THE CONTRACT. The page is plain scripts sharing one global scope, run in this order after owner.js (the device key: Owner.prepare ·
   Owner.submit · Owner.act · Owner.why · Owner.role):
     core (this file) · stream · connect · money · asset · intent · live · portfolio · memory · earn · markets · trade · chart · book ·
     terminal · brains · desk · superagent · backtest · statement · agents-mount · shell (draws and starts it).
   Each top-level name is declared once across them all (test/unit/page-scripts.test.ts). Declare what the shell calls as top-level
   `function` declarations.

   What the page holds
     A            what GET /api/account said last (null until the first load)        S     the statement's lines (GET /api/account/statement)
     busy         an owner action is being signed and sent                            view  { month, account, type, agent } the statement's
     flash, said  a refusal / what was done: set them, then load() or render(), and          filters · lens: the top bar's lens, see lensNow()
                  the shell shows each once as a toast
     ROUTE        { tab: "portfolio" | "venues" | "memory" | "markets" | "trade" | "desk" | "superagent" | "backtest", params } from the hash
                  (#/markets?tab=crypto&q=btc · #/trade?kind=perps · #/trade?mode=superagent&venue=paper-1); the first three and the
                  desk are the Account (ACCOUNT_TABS), the first three opened from the rail's foot. Trade and the superagent are the
                  TRADING AREA (TRADE_AREA), one place in two modes the owner switches in one click from the top bar's Regular ·
                  Superagent: Regular is the terminal where you place your own orders (#/trade), Superagent the desk on a paper account
                  trading by itself (ui/superagent.js), #/trade?mode=superagent — "mode" never reaches the pane's params. #/superagent
                  (?venue=…) is kept as an alias: routed() rewrites it to the canonical hash in place. Inside the page the two keep their
                  own pane ids, "trade" and "superagent", so ROUTE.tab says which is showing
     tradeModeLast()              the mode the viewer used last ("regular" | "superagent", kept under TRADE_MODE_KEY in this browser):
                                  the rail's Trade opens it. Read in a guarded read; nothing writes it at load
     setTradeMode(mode, params)   the switch's click, and only it: the mode kept, then go() there
   Doing
     load({ draw })               read the account and the statement again, then render() (shell.js): the chrome, the visible pane, and
                                  the redraw of whatever sheet or drawer is open; the latest read wins over a slower earlier one. `draw`
                                  in place of render(): the shell's read after a pushed change draws only what moved where the owner is
                                  typing (shell.js shPushedDraw)
     forget(prefix)               the reads kept by api() whose path starts so, dropped: after an action changed what they said
     own(draft, then)             one owner action: prepare, sign with this browser's key, send at POST /api/exchange; then(r) after it
                                  went through; a refusal lands in flash in the venue's or the account's own words, what it did in said
                                  (saidOf(body): the summary, or the order or payment as it stands). Then load(). An account that does
                                  not answer is a refusal too (NO_ANSWER), never an exception out of a sheet
     cancelOrder(o, then)         a signed liveCancel of one order: an agent's after a yes, the owner's own with one click
     api(path, { ttl, timeout })  a JSON GET: one request at a time per path, kept ttl ms when asked. Resolves to the body, refusals
                                  included ({ ok:false, refusal }); refusalOf(body) is its sentence. Nothing that never came from the
                                  account (no answer, a gateway's page) is kept; a read not answered in `timeout` ms (15 s) is let go and
                                  answers as not reached ({ ok:false, error }), never a promise that hangs
     postJson(path, body)         a JSON POST → { status, body }; no answer → NO_ANSWER ({ status: 0, body: { ok: false, error } })
     FILLS_SAID                   the fills already said as a toast, by `${clientId}|${filledQty}` (when): the answer to the owner's own order
                                  and the account's pushed fill (shell.js shFillToast) say one fill once, whichever comes first
     orderWordsOnce(body, placed) what an answer says as a toast (saidOf), or "" where it is an order that placed and filled whose fill was
                                  said already (pushed first); otherwise its fill is marked said, so a push after it says nothing. Every
                                  path that places an order and toasts its answer takes its words from here: own(), quoteDialog's
                                  submit (the Close… sheet), the Trade ticket
   The account's push channel (ui/stream.js): stOn(type, fn) → off · stHealth() "connected" | "stale" | "down" · stStart() · stDot(). What
     the account pushes is applied in place by the shell (shell.js: an order's state, a position, the paper cash, a toast for each fill) and
     read again once for a burst; a pane that draws something the account changes listens for its own (superagent.js: desk)
     debounce(fn, ms)             later(ms): fn once, a little later, however often it is asked      thenLoad(fn)  a button's work, then load()
   Drawing (strings of HTML; escape what came from outside with esc)
     ageWords(at) (how old a price shown as now is: "" while fresh, "12 s old", "3 min old", "from 14:02 New York")
     esc · money (-$1,234.50) · fine (a cent or less as it was) · px (a price) · usd (a price in dollars, four figures under $1) · cents
     (an event contract's price, 62.5¢, held to 0–100) · short (an address) · qtyOf (an amount) · plural · nyDay · nyTime (a dash for a
     time that is not one) · typeText (an order's type) · isLive (an order on a book) · byOf (who did it) · readOnlyWords (a venue's words)
     chg(n, unit)                 a change, ▲ up / ▼ down with a word for screen readers, never colour alone; unit "%" · "$" · "¢" · ""
     avatar(sym, size, img)       a letter tile, and over it the logo at `img` where there is one ("sm" · "lg"; live/icons.ts)
     logoCredit(urls, cls) · creditFor(scope, el, cls)   the link Elbstream's free logos ask for, wherever one is shown
     icon(name, cls)              one of the sprite's stroke icons
     table(cols, rows, opts)      cols [{ label, r, cls, cell(row, i) }] (cls on the column's head and cells) · opts { empty, rowAttr(row, i), cls }
     seg(items, on, onChange, { label })   a toggle; items [[value, label], …]; onChange(value) when another is pressed
     paint(el, html)              el's HTML written only where it changed: the new HTML is laid over what is there (morphKids) — an element
                                  kept where it stands (or by its key among its siblings: data-k, else data-key), only the attributes and
                                  text that differ written, a row that did not change left alone; the focused control stays focused (and
                                  is found again by data-fk · data-key · its place only when it went). What every part drawn again on each
                                  read draws with. Listen on the part (one listener, by data attributes), never on what it drew: a control
                                  drawn again may be the same element. setText(el, t) an element's words set in place (its one text node)
     everySecond(fn)              fn() once a second, as the second turns over (every countdown and clock on the page, together; held while
                                  the page scrolls) → a function that stops it. fn reads and decides; it returns its writes as a function,
                                  and every write of that second is made in one frame (none at all in a second where nothing changed); false
                                  stops it. nextFrame(fn) the next frame (at once where there are none) · still() the owner asked for no
                                  motion · afterMotion(el, ms, fn) once el's own transition or animation ended (ms at the most; at once
                                  under still()) · whenStill(fn) once the page is not scrolling · paneLater(tab, fn) once a pane coming in
                                  has come in
     field · select · formFields(form) · setOptions(select, opts, value)   the form helpers;  download(name, rows) a CSV;  copyText(text, button)
     formKeep(form) → restore(formDrawnAgain)   what was typed in a form, put back after it is drawn again (never a password field; a
                                  select put back to another choice is told so with a change event, so what that choice shows agrees)
     whatYouSign(prepared, { open, notes })   the fields the owner signs, exactly as Owner.submit signs them (prepared.shown); notes a word
                                  beside a field, by name
   Sheets, the drawer, asking
     openSheet(html, { title, wide, redraw }) → the sheet's body element; closeSheet(). One sheet at a time (dialog#modal); redraw() runs
                                  after each load while it is open. An earlier dialog may still write #modal-form directly: it replaces the sheet
     openDrawer(html, { title, redraw }) → the drawer's body; closeDrawer(). A side sheet on the right; the page stays usable behind it
     confirmSheet(text, { danger, title, yes, no }) → Promise<boolean>      pickSheet(title, options, { current, note }) → Promise<value|null>
                                  (options [[value, label, hint], …] or { value, label, hint, disabled }); both stack over an open sheet
     quoteDialog({ title, sub, fields, draft, show, block, done, go, wide }) prepare → show → sign and send, in one sheet: draft(form)
                                  returns the draft, or a sentence saying what is missing; show(prepared, form) the quote in words (HTML);
                                  block(prepared, form) a sentence when the account would refuse what was prepared (shown before the sign
                                  button, which stays off and says why); done(r, prepared) after it went through (may return words for the
                                  toast); signNotes(prepared, form) words beside the signed fields, by name. The quote is asked again as the
                                  form changes (the latest ask wins) and when its ten minutes run out; a refusal shows in the venue's words
     toast(text | { html }, kind, { ms })   kind "ok" · "no" (read out at once, stays longer) · "info"
   Where the page is
     go(tab, params, { replace }) · onRoute(fn(tab, params, moved)) — moved: another tab than before (Regular ↔ Superagent is a move: the
     panes cross-fade) · hashOf(tab, params) the hash for a place (hashOf("superagent", { venue }) → #/trade?mode=superagent&venue=…) ·
     lensNow() → { kind: "all" | "venue" | "agent", id, name } · inLens(venue, agent)
   What an account can do
     connected() · nameOf(id) · keyName(address) · owns() · writesOn() · canTrade(v) · canMove(v) · keyOnlyReads(v) · watched(v) ·
     servedHere(v) · awayMiss(m) / awayLine(list, { fold }) (a venue a read left out because it does not serve this network: one quiet line) ·
     isAgentWallet(v) (never disconnected: emptied with Take back…) · modeOf(m) ("guard" | "open", whichever word a read uses) ·
     dollarsOf() · isDollar(asset) · networksOf() · bridgeChainsOf() (the lists the account publishes, the page's own as the fallback)
   A browser wallet sending what the account built: PROVIDERS (proven address → wallet) · SENT · INFLIGHT · walletFor(address) · mined(w, hash)
   What the panes define (the shell calls each if it is there): renderPortfolio(ctx) · renderVenues(ctx) [portfolio.js] · renderMemory(ctx)
     [memory.js] · renderMarkets(ctx) [markets.js] · renderTrade(ctx) [trade.js] · renderDesk(ctx) [desk.js] · renderSuperagent(ctx)
     [superagent.js] · renderBacktest(ctx) [backtest.js: the lab], ctx = { el (#pane-…), owner, lens, params }; render() redraws only the visible pane, so keep what the owner is
     typing in an element you do not redraw. And the openers other parts call: openTicket(preset) · openClose(position) [trade.js] ·
     openHandToAgent(preset) [intent.js] · openReceive(venue) [money.js] · openLiveMove(venueId, preset) [money.js] · openAsset(key)
     [asset.js] · declineAsk(ask) [portfolio.js] · openMarket(item) [markets.js] · openPicker() / openConnect(option, opts) / connectVia(connector,
     opts) [connect.js] · openStatement() [statement.js] · openAgents() / openSettings() / openMode() [agents-mount.js; only the rail's
     "What changes ›" opens the Mode sheet] · openEarn(preset) / openSellMany(preset) [earn.js] · openBrains(ctx) [brains.js: the desk's
     brains, their keys typed once and never kept on the page]. Ask before calling one: typeof
     openTicket === "function". A pane that throws says so in its place.
   The classes the panes draw with (ui/shell.css; colours, radii, shadows and fonts only from ui/tokens.css, Light and Black alike). The
   look is the ocean with Swiss type: Inter everywhere, labels small and bold in sentence case, numbers bold and tight with tabular figures
   (.num .num-m), Geist Mono (.mono) only for a hash, an address or a line that is signed; content in glass cards over the ocean, a heavy
   rule across each card's top, nearly square buttons and toggles (a pressed one in ink), the Account's green for what is chosen (the red
   only for down, a sell or a loss).
     a card         .card — glass, a hairline of its own (--card-border) and a 2 px rule across its top (--rule), radius 4
                    (--radius-m), padding 18–20, no shadow (--shadow-card), its parts 14 apart; cards sit 20 apart in a column (.col-main .col-side). A .sec drawn
                    in a pane IS a card (the same look), so `class="sec"` and `class="card"` are one; inside a card, a sheet or the drawer a
                    .sec is a plain part under a hairline. A card whose last child is a table() runs the table nearly to its foot by itself
                    · .callout: waiting on the owner (warn fill, soft orange edge; its first .label in warn-text) · .box: a card with the
                    larger radius (a market card) · .panel: the sticky ticket (a lifted card, --shadow-lift)
     a card header  .card-head (or .sec-head) — one row: .h2 (20px 700) or .label on the left, .tools (links, a seg, a small button) on
                    the right; the first child of the card
     quick actions  .quick holding .quick-card buttons (or .btn): four equal cards, 52 high, an icon (icon()) and a word
     a pill         .btn (on the second surface, no outline) · .btn-primary (filled in the text colour) · .btn-ghost (the same pill, its
                    word dimmed) · .btn-danger (down on its fill) · .btn-sm (36 high; the rest 44) · .btn-block · a status word: .pill
                    (.warm) · a chip: .chip (a white pill with the card's shadow; .warm .bad) · a small word beside a name: .tag (.up .warn)
     a seg          seg() → .seg: a pill track on the second surface, the pressed button a white pill with the card's shadow. A toggle
                    drawn by hand is <div class="seg" role="group"> of buttons with aria-pressed
     and the rest   .cols .col-main .col-side (two columns, the side one 340–380) · .label .h2 · .icon-btn (44 round) .link · .tabs
                    (category tabs: buttons with aria-pressed, underlined) · .t (table(), at home in a card: light row rules) .acts ·
                    .cards-grid .tile-grid .choice (a tile that is a card) · .yes .no-btn (tinted up and down) · .av (avatar(), round)
                    .who · .bar with .legend-l .sw-k · .feed · .spark (.area .line) · .skel .skel-rows · .fld .row2 · .quote .path ·
                    .empty .msg (ok · no · wait) · .up .down .flat (▲/▼ always with the colour) .warn-t */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* a figure from outside, as a number: nothing given counts as 0; anything that is not a number (a venue's "n/a") is NaN, which every
   formatter below shows as a dash, never as "NaN" */
const num = (n) => (n === undefined || n === null || n === "" ? 0 : Number(n));
/* dollars to the cent, the sign before the dollar: -$1,234.50 */
const money = (n) => {
  const v = num(n);
  return Number.isFinite(v) ? `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
};
/* only an address is shortened */
const short = (a) => (/^0x[0-9a-fA-F]{16,}$/.test(String(a)) ? `${String(a).slice(0, 8)}…${String(a).slice(-4)}` : String(a));
/* an amount can be a cent or less: show what it was, not $0.00 — to six decimals, and to two figures below a millionth */
const fine = (n) => {
  const v = num(n);
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (!a || a >= 0.01) return money(v);
  const digits = a < 1e-6 ? Number(a.toPrecision(2)).toLocaleString("en-US", { maximumFractionDigits: 12 }) : a.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `${v < 0 ? "-" : ""}$${digits}`;
};
/* a price as a person reads it: no float tails, up to eight decimals; a dash for what is not a number */
const px = (n) => (n === undefined || n === null || n === "" || !Number.isFinite(Number(n)) ? "—" : Number(Number(n).toPrecision(10)).toLocaleString("en-US", { maximumFractionDigits: 8 }));
/* a price in dollars: to the cent from a dollar up, the first four figures below that ($0.1212), the sign before the dollar */
const usd = (n) => {
  if (n === undefined || n === null || n === "" || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return Math.abs(v) >= 1 ? money(v) : `${v < 0 ? "-" : ""}$${px(Number(Math.abs(v).toPrecision(4)))}`;
};
/* an event contract's price — the market's chance for it — in cents, to a tenth of a cent (62.5¢, 99.6¢, 0.4¢), held to 0–100 */
const cents = (p) => {
  if (p === undefined || p === null || p === "" || !Number.isFinite(Number(p))) return "—";
  const c = Math.min(100, Math.max(0, Number(p) * 100));
  return `${Number(c.toFixed(1))}¢`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
/* a time in New York; a time that is missing or not one is a dash, never an exception out of a whole sheet. Each way of saying it is made
   once and kept (making a date formatter costs more than using one: a table of times would otherwise make one a cell) */
const NY_FORMATS = new Map();
const ny = (iso, opts) => {
  const ms = typeof iso === "number" ? iso : Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  const k = JSON.stringify(opts || {});
  let f = NY_FORMATS.get(k);
  if (!f) NY_FORMATS.set(k, (f = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", ...opts })));
  return f.format(new Date(ms));
};
const nyDay = (iso) => ny(iso, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const nyTime = (iso) => ny(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
/* the same instant on the viewer's own clock, when that is not New York's: " (21:30 your time)" — with the weekday when it falls on another
   day there (a session that opens Wednesday morning in New York is Wednesday night in Hong Kong, or Thursday). "" in New York's zone */
const YOUR_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
})();
const yourTime = (iso, zone = YOUR_ZONE) => {
  const ms = typeof iso === "number" ? iso : Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms) || !zone || zone === "America/New_York") return "";
  const k = `your:${zone}`;
  let f = NY_FORMATS.get(k);
  if (!f) NY_FORMATS.set(k, (f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })));
  const [wd, hm] = f.format(new Date(ms)).replace(",", "").split(" ");
  return ` (${wd === ny(ms, { weekday: "short" }) ? hm : `${wd} ${hm}`} your time)`;
};
/* THE TRADING SCREEN'S ONE CLOCK: a moment on the viewer's own clock (YOUR_ZONE, the clock the chart's axis and the book's trades always
   kept) — the tables under the panels say it too, so one screen never shows two clocks. `date`: with its day, month and year, as HL's
   tables write a moment ("17 Oct 2026 06:24:11": no weekday, so a history's Time column stays narrow), else the time of day alone
   ("06:24:11"); `seconds` off: to the minute; `year` off: the day and month alone ("17 Oct 06:24", the tables' own few characters, the
   whole moment on hover). A dash for what is not a moment */
const yourClock = (iso, { date = true, seconds = true, year = true } = {}) => {
  const ms = typeof iso === "number" ? iso : Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "—";
  const k = `clock:${YOUR_ZONE}`;
  let f = NY_FORMATS.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", { ...(YOUR_ZONE ? { timeZone: YOUR_ZONE } : {}), day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    }
    NY_FORMATS.set(k, f);
  }
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const time = `${p.hour}:${p.minute}${seconds ? `:${p.second}` : ""}`;
  return date ? `${p.day} ${p.month}${year ? ` ${p.year}` : ""} ${time}` : time;
};
/* that clock in words, as the trading screen names it once: "Hong Kong time", "New York time", "UTC" */
const yourZoneWords = (zone = YOUR_ZONE) => (!zone || zone === "UTC" || zone === "Etc/UTC" ? "UTC" : `${String(zone).split("/").pop().replace(/_/g, " ")} time`);
const ZERO = "0x0000000000000000000000000000000000000000";
const DAY = 86_400_000;
/* what the money is in, by class: its name, and its colour on the allocation bar (tokens.css) */
const CLASS = { cash: ["Cash", "var(--alloc-cash)"], stable: ["Stablecoins", "var(--alloc-stable)"], crypto: ["Crypto", "var(--alloc-crypto)"], equity: ["Stocks", "var(--alloc-equity)"], event: ["Predictions", "var(--alloc-event)"], rwa: ["RWA", "var(--alloc-rwa)"], earn: ["Earning", "var(--alloc-earn)"] };
let A = null;
let busy = false;
let flash = "";
let said = "";
let allStatement = false;
/* the statement's lines (every transaction, from every run's ledger) */
let S = [];
/* the statement's filters (month, account, type, agent) and the lens the top bar narrows the panes to */
const view = { month: "", account: "", type: "", agent: "", lens: "" };
/* when the account was last read, for the shell's refresh */
let loadedAt = 0;
/* what was done, as a toast or a sheet says it: a connection's summary short — its name and balance, a paper account's said as paper money
   (service.ts connect: "… connected live · …" or "… connected · PAPER, no real money · …"); how it fills and the rest behind "details" — and
   an order's id (orderSaid) out of the words, one pointer away */
const sayHtml = (s) => {
  const m = /^(.+?) connected (?:live|· (PAPER), no real money) · (\$[\d,.]+) there now · (.+)$/.exec(s || "");
  if (m) return `<b>${esc(m[1])}</b> connected · ${esc(m[3])}${m[2] ? " of paper money" : ""}<details class="inl"><summary>details</summary>${esc(m[4])}</details>`;
  // the account's ids for the orders it speaks of (orderSaid: "… · ord-0011"), taken out of the words and kept one pointer away
  const ids = [];
  const words = String(s || "").replace(/ · (ord-\d+)(?= · |$)/g, (all, id) => (ids.push(id), ""));
  return ids.length ? `<span title="${esc(`${ids.length > 1 ? "Orders" : "Order"} ${ids.join(", ")}`)}">${esc(words)}</span>` : esc(s);
};

const connected = () => A.venues.filter((v) => v.live);
const nameOf = (id) => (A.venues.find((v) => v.id === id) || {}).name || id;
const keyName = (address) => (A.keys.find((k) => k.address === address) || {}).name || short(address);
const nowMs = () => Date.parse(A.now);
/* this browser signs for the owner (the others only look) */
const owns = () => Owner.role === "owner";
/* the mode as the account says it, whichever word a read uses for it: "guard" (Guard) or "open" (Beast; the restore report says the word) */
const modeOf = (m) => (m === "open" || m === "Beast" ? "open" : "guard");
/* an agent wallet: a venue whose key this account holds for an agent. It is emptied with Take back…, never disconnected */
const isAgentWallet = (v) => !!v && (v.connector === "live:agent-wallet" || String(v.id || "").startsWith("agent-"));
/* the lists the account publishes — the dollar stablecoins, the chains money moves on, the chains a bridge joins — with the page's own
   lists only where an account does not publish them yet (the dollars as the account's door counts them: live/types.ts STABLES) */
const DOLLARS_KNOWN = ["USD", "USDC", "USDC.E", "USDT", "USDT0", "USD₮0", "USD₮", "FDUSD", "PYUSD", "DAI", "TUSD", "USDP", "PUSD", "USDG"];
const NETWORKS_KNOWN = ["Arbitrum", "Base", "Ethereum", "Optimism", "Polygon", "BNB Chain"];
const dollarsOf = () => (A && Array.isArray(A.dollars) && A.dollars.length ? A.dollars.map((x) => String(x).toUpperCase()) : DOLLARS_KNOWN);
const isDollar = (asset) => dollarsOf().includes(String(asset || "").toUpperCase());
const networksOf = () => (A && Array.isArray(A.networks) && A.networks.length ? A.networks.map(String) : NETWORKS_KNOWN);
const bridgeChainsOf = () => (A && Array.isArray(A.bridgeChains) && A.bridgeChains.length ? A.bridgeChains.map(String) : networksOf());

/* each read of the account is numbered: a slower one that lands after a later one changes nothing (the latest wins) */
let loadSeq = 0;
async function load({ draw } = {}) {
  const my = ++loadSeq;
  const [r, st] = await Promise.all([fetch("/api/account"), fetch("/api/account/statement").catch(() => null)]);
  const stBody = st && st.ok ? await st.json().catch(() => null) : null;
  const lines = stBody ? stBody.lines : null;
  if (r.status === 404) return void ($("main").innerHTML = '<p class="dim">This server runs the simulated statement (<span class="mono">--classic</span>). <a href="/">Open it</a>.</p>');
  let page = await r.json();
  // the service was restarted under this page: it no longer knows this browser's key, so offer it again
  if (Owner.kid && !page.signers.owners.some((o) => o.id === `device:${Owner.kid}`) && !page.signers.pendingDevices.some((d) => d.kid === Owner.kid)) {
    await Owner.ready();
    page = await (await fetch("/api/account")).json();
  }
  // this browser was waiting, and another device of the owner's let it sign: it signs from now on, without a reload
  if (Owner.role === "pending" && page.signers.owners.some((o) => o.id === `device:${Owner.kid}`)) await Owner.ready();
  if (my !== loadSeq) return;
  if (Array.isArray(lines)) {
    S = lines;
    // the statement just read is the one every part reads (the terminal's history tabs ask api() for it): never an older one it kept
    if (st && st.ok) API.set("/api/account/statement", { at: Date.now(), body: stBody });
  }
  A = page;
  loadedAt = Date.now();
  if (typeof draw === "function") draw();
  else render();
}

/** one owner action: prepare, sign with this browser's device key, send, show what came back. A refusal — the account's or the venue's,
 * or no answer at all — lands in `flash` in its own words; nothing is announced as done that was not */
async function own(draft, then) {
  if (busy) return null;
  busy = true;
  document.body.classList.add("busy");
  let r = null;
  try {
    r = await Owner.act(draft);
    const refused = refusedAt(r);
    flash = refused ? Owner.why(r) || "Refused" : "";
    // an order that filled is said once: the account's pushed fill may have said it already (shell.js shFillToast), or says it after this.
    // Only an action that places one (ORDER_PLACING): a cancel's or an amend's answer carries the order's fill too, but says the cancel
    said = refused ? "" : orderWordsOnce(r.body, ORDER_PLACING.has(draft && draft.type));
    // what the action changed is read afresh: the statement's lines and the positions kept from before it (load() reads the statement)
    if (!refused) afterAction();
    if (then && !refused) {
      busy = false;
      await then(r);
    }
  } catch (err) {
    flash = String((err && err.message) || err).slice(0, 240) || "The account did not answer. Try again.";
    said = "";
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
  try {
    await load();
  } catch {
    // the account is not answering: the shell's next refresh says so
    render();
  }
  return r;
}

/* the fills said as a toast, by `${clientId}|${filledQty}`, with when: one fill is said once, by whichever of the order's answer and the
   account's push comes first. Kept a minute, at most a hundred */
const FILLS_SAID = new Map();
function fillSaid(key) {
  const now = Date.now();
  FILLS_SAID.set(key, now);
  if (FILLS_SAID.size > 100) for (const [k, at] of FILLS_SAID) if (now - at > 60_000 || FILLS_SAID.size > 100) FILLS_SAID.delete(k);
}
/* the owner's actions whose answer is an order they placed: a liveOrder, a liveClose, and a card approved (when it placed one, its answer
   is that order). A cancel or an amend answers with an order too, but what it says is the cancel or the change */
const ORDER_PLACING = new Set(["liveOrder", "liveClose", "approveCard"]);
/** AN ANSWER'S WORDS, SAID ONCE: what saidOf says of it — or "" where it is an order an action placed (`placed`) that filled, and that fill
 * was said already (the account pushed it before the answer came: shell.js shFillToast, by `${clientId}|${filledQty}`). Otherwise the fill
 * is marked said here, so the push that comes after says nothing. Every path that places an order and says its answer as a toast takes its
 * words from here — own(), quoteDialog's submit, the Trade ticket — so a fill is one toast whichever comes first */
function orderWordsOnce(body, placed = true) {
  const words = saidOf(body);
  const o = placed && body && body.kind === "order" ? body.order : null;
  if (!o || !o.clientId || !(num(o.filledQty) > 0)) return words;
  const key = `${o.clientId}|${num(o.filledQty)}`;
  if (FILLS_SAID.has(key)) return "";
  fillSaid(key);
  return words;
}

/* after an action went through: the reads it changed are dropped from what the page keeps — the statement (every history tab), the
   positions (the terminal's table, the ticket's position line) and the holdings — so the next look asks the account again and never shows
   what stood before the action. load() reads the statement again too */
function afterAction() {
  for (const path of ["/api/account/statement", "/api/account/positions", "/api/account/holdings"]) forget(path);
}

/* what an action did, in a few words: the account's own summary, or the order or payment as it now stands */
function saidOf(body) {
  if (!body) return "";
  if (body.summary) return body.summary;
  const o = body.kind === "order" && body.order;
  if (o) return orderSaid(o);
  const p = body.kind === "payment" && body.payment;
  return p ? p.note || `${p.id}: ${p.status}` : "";
}
/** An order as it now stands, said from its own fields: what was done (Bought, Sold, Part filled, Placed, Canceled, Not filled), how much
 * of which market, at what price — the average fill, grouped as the page writes prices, or the order's own type where nothing filled —
 * where, and the fee. The account's note is said only where nothing filled (why it was refused, expired or canceled, or how it rests): a
 * fill's note repeats the price, unformatted. The account's id for the order goes last, after " · ", where sayHtml takes it out of the words and keeps it one
 * pointer away (title=): the person reads what happened, and the id is there for the Statement and for support */
function orderSaid(o) {
  const filled = num(o.filledQty) > 0;
  // the verb from the order's own state: "Placed" only for an order the venue holds (open); one the venue did not confirm, or one still
  // waiting on the owner's wallet, is said as exactly that — never as placed (its note says the rest)
  const verb = o.status === "filled" ? (o.side === "buy" ? "Bought" : "Sold") : o.status === "partial" ? "Part filled" : o.status === "canceled" ? "Canceled" : ["rejected", "expired"].includes(o.status) ? "Not filled" : o.unconfirmed && !o.ref ? "Sent, not confirmed" : o.walletTxs && !o.ref ? "Waiting for your wallet" : o.status === "open" ? "Placed" : "Sent";
  const market = o.kind === "event" && o.name ? o.name : o.symbol || o.name || "";
  const qty = filled ? o.filledQty : o.qty;
  const what = qty !== undefined && qty !== null && Number.isFinite(Number(qty)) && market ? ` ${qtyOf(qty)} ${market}` : market ? ` ${market}` : "";
  const at = filled && Number.isFinite(Number(o.avgPrice)) ? ` at ${o.kind === "event" ? cents(o.avgPrice) : px(o.avgPrice)}` : !filled && o.type && o.type !== "market" ? ` · ${typeText(o)}` : "";
  const where = o.venueName ? ` on ${o.venueName}` : "";
  const fee = filled && num(o.feeUsd) > 0 ? ` · fee ${money(o.feeUsd)}` : "";
  const why = o.status !== "filled" && o.status !== "partial" && o.note ? ` · ${o.note}` : "";
  return `${verb}${what}${at}${where}${fee}${why}${o.id ? ` · ${o.id}` : ""}`;
}

/* a JSON read as the page asks it: one request at a time per path (a second ask while the first is out gets the same answer), and the
   answer kept `ttl` milliseconds when asked. What comes back is the body, a refusal included; a request that never reached the account is
   { ok: false, error } and is not kept. A read is given `timeout` milliseconds (API_TIMEOUT_MS unless said): one the account has not
   answered by then is let go — the request itself stopped where the browser can stop one — and answers as not reached, in the page's own
   words, so a hung read never freezes what waits on it (the bar, the book, a tab) and the next ask asks again */
const API = new Map();
const API_TIMEOUT_MS = 15_000;
/* A PRICE HISTORY'S FIRST VIEW is waited for longer: the account gives its sources twenty seconds for one (service.ts HISTORY_WAIT_MS — a
   share's whole history from Nasdaq is about ten seconds, and a source's own pace may hold a read a while before it), so a page waits
   past that and never says the account did not answer while it is still reading the view (a page scrolled left keeps API_TIMEOUT_MS: the
   account gives one twelve, PAGE_WAIT_MS). test/unit/ui-chart.test.ts holds the two apart */
const HISTORY_TIMEOUT_MS = 25_000;
/* each path's generation: forget() moves it on, for a read still on its way too. A read answers its own askers whatever happens, and is
   kept only if its path's generation is the one it was asked in — so a read sent before an action and answered after it (the positions
   as they stood before the order) never stands, kept, for the reads after it */
const API_GEN = new Map();
function api(path, { ttl = 0, timeout = API_TIMEOUT_MS } = {}) {
  const hit = API.get(path);
  if (hit && hit.pending) return hit.pending;
  if (hit && ttl > 0 && Date.now() - hit.at < ttl) return Promise.resolve(hit.body);
  if (API.size > 200) for (const [k, v] of API) if (!v.pending && Date.now() - v.at > 600_000) API.delete(k);
  const gen = API_GEN.get(path) || 0;
  let reached = true;
  const stop = typeof AbortController === "function" ? new AbortController() : null;
  let timer = 0;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => {
      reached = false;
      if (stop) stop.abort();
      resolve({ ok: false, error: `The account did not answer in ${Math.round(timeout / 1000)} seconds.` });
    }, timeout);
  });
  // an answer that is not JSON never came from the account (a gateway in between): it is not kept either
  const asked = fetch(path, stop ? { signal: stop.signal } : undefined)
    .then((r) => r.json().catch(() => ((reached = false), { ok: false, error: `${r.status} ${r.statusText}`.trim() })))
    .catch((err) => ((reached = false), { ok: false, error: String((err && err.message) || err) }));
  const pending = Promise.race([asked, late]).then((body) => {
    clearTimeout(timer);
    // a later ask may have taken the path's place meanwhile (forget, then asked again): only this ask's own entry is written or dropped —
    // and one forgotten while it was on its way is not kept (its generation passed): what it says is from before what changed it
    const mine = API.get(path);
    if (mine && mine.pending !== pending) return body;
    if (reached && (API_GEN.get(path) || 0) === gen) API.set(path, { at: Date.now(), body });
    else API.delete(path);
    return body;
  });
  API.set(path, { ...(hit || {}), pending });
  return pending;
}
/* a refusal as one sentence, from a read's body */
const refusalOf = (body) => (body && body.refusal && body.refusal.message) || (body && body.error) || "";
/* HOW OLD A PRICE IS, said wherever it is shown as now: nothing while it is a few seconds old (QUOTE_FRESH_MS); then "12 s old", "3 min
   old", and past an hour the moment it is from, New York time. `at` is the price's own moment (a market's quoteAt: its source's stamp, or
   when its venue answered); a price that does not say when gives "" — the place showing it says where it is from instead */
const QUOTE_FRESH_MS = 5_000;
function ageWords(at, now = Date.now()) {
  const t = typeof at === "number" ? at : Date.parse(String(at || ""));
  if (!Number.isFinite(t)) return "";
  const ms = now - t;
  if (ms < QUOTE_FRESH_MS) return "";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s old`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min old`;
  return `from ${nyTime(t)} New York${ms >= DAY ? `, ${nyDay(t)}` : ""}`;
}

/* the reads kept whose path starts so, dropped, after an action changed what they said — one still on its way too: it answers whoever
   asked it, but is not kept (its path's generation moves on, API_GEN), and the next ask asks the account again rather than wait for it */
function forget(prefix) {
  for (const k of [...API.keys()]) {
    if (!k.startsWith(prefix)) continue;
    API_GEN.set(k, (API_GEN.get(k) || 0) + 1);
    API.delete(k);
  }
}

// ---- drawing ------------------------------------------------------------------------------

const qtyOf = (n) => (n === undefined || n === null || n === "" || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: Math.abs(Number(n)) >= 1000 ? 2 : 8 }));
/* an order's type in words: market, a limit, a stop and where it triggers */
const typeText = (o) => (o.type === "limit" ? `limit ${px(o.limitPrice)}` : o.type === "stop" ? `stop at ${px(o.stopPrice)}` : o.type === "stop_limit" ? `stop ${px(o.stopPrice)}, limit ${px(o.limitPrice)}` : "market") + (o.tif ? ` · ${o.tif.toUpperCase()}` : "") + (o.postOnly ? " · post-only" : "") + (o.reduceOnly ? " · reduce-only" : "");
/* an order still on a book, or on its way to one */
const isLive = (o) => ["open", "partial", "pending"].includes(o.status);
/* who did it: you, or an agent — on your yes (Guard), or inside its limit (Beast); the account's own words for a line's `by`. A bracket's
   exit was placed by the venue when its entry filled, through no limit and no card of its own: it is named as the exit of that entry, as
   its statement line says */
const byOf = (p) => (p.authority !== "agent" ? "You" : `${keyName(p.agent)}, ${p.exitOf ? `${p.exitOf.kind} of ${p.exitOf.order}` : p.card ? "approved by you" : "inside its limit"}`);
/* one icon from the sprite in account.html: stroke drawings, nobody's logo */
const icon = (name, cls = "") => `<svg class="ico${cls ? ` ${cls}` : ""}" aria-hidden="true" focusable="false"><use href="#i-${esc(name)}"></use></svg>`;
/* the logos that did not load on this page: not asked for again, their letter tiles stand (avatar) */
const ICON_MISS = new Set();
/* a letter tile where a logo would be — and over it the logo itself where there is one (`img`: the address of an image the page loads from
   where its owner publishes it, live/icons.ts; no referrer goes with it). One that does not load is taken away and not asked for again, and
   the letters are the tile */
const avatar = (sym, size = "", img = "") => `<span class="av${size ? ` ${size}` : ""}" aria-hidden="true">${esc(String(sym || "?").replace(/[^A-Za-z0-9$]/g, "").slice(0, 4).toUpperCase() || "?")}${img && !ICON_MISS.has(img) ? `<img class="av-im" src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
/* a logo's error does not bubble: heard once, in capture, for every tile on the page */
document.addEventListener(
  "error",
  (e) => {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains("av-im")) return;
    ICON_MISS.add(t.getAttribute("src"));
    t.remove();
    // a credit painted while this logo stood is asked again (creditFor, below: called only once the page is drawn)
    if (typeof creditsAgain === "function") creditsAgain();
  },
  true,
);
/* Elbstream's logos are free with a link to elbstream.com, clearly visible and at 12 points or more, on any page where one is shown
   (elbstream.com/logos, read again 2026-10-13; live/icons.ts): the link, where any of `urls` is one of its logos not known to have failed */
const ELBSTREAM_API = "https://api.elbstream.com/";
const logoCredit = (urls, cls = "") => (urls.some((u) => typeof u === "string" && u.startsWith(ELBSTREAM_API) && !ICON_MISS.has(u)) ? `<p class="logo-credit${cls ? ` ${cls}` : ""}"><a href="https://elbstream.com" target="_blank" rel="noopener noreferrer">Logos by Elbstream</a></p>` : "");
/* the same link painted into `el` while `scope` shows one of Elbstream's logos: for a part drawn a piece at a time (Trade's picker, its ticket).
   Each is kept by its element, so a logo that fails afterwards takes its credit with it (the error listener above asks again) */
const CREDITED = new Map();
function creditFor(scope, el, cls = "") {
  if (!el) return;
  CREDITED.set(el, { scope, cls });
  paint(el, logoCredit(scope ? [...scope.querySelectorAll("img.av-im")].map((i) => i.getAttribute("src")) : [], cls));
}
function creditsAgain() {
  for (const [el, c] of CREDITED) {
    if (!el.isConnected) CREDITED.delete(el);
    else creditFor(c.scope, el, c.cls);
  }
}
/** a change, up or down: the glyph, a word for a screen reader, the amount — never the colour alone */
function chg(n, unit = "%") {
  if (n === undefined || n === null || n === "" || !Number.isFinite(Number(n))) return '<span class="flat">—</span>';
  const v = Number(n);
  const a = Math.abs(v);
  const amount = unit === "$" ? fine(a) : unit === "¢" ? `${Number(a.toFixed(1))}¢` : unit === "%" ? `${a >= 1 ? a.toFixed(1) : a.toFixed(2)}%` : px(a);
  // a move too small for its figures (−0.004% reads 0.00%) is flat: never an arrow on a zero
  if (v === 0 || !/[1-9]/.test(amount)) return `<span class="flat">${amount}</span>`;
  return `<span class="${v > 0 ? "up" : "down"}"><span aria-hidden="true">${v > 0 ? "▲" : "▼"}</span><span class="sr">${v > 0 ? "up" : "down"}</span> ${amount}</span>`;
}
/** a table: `cols` [{ label, r (right-aligned), cls, cell(row, i) → HTML }], `rows` any list; opts.empty the words when there are none,
 * opts.rowAttr(row, i) the attributes of a row (e.g. `class="click" data-key="…"`), opts.cls a class for the table */
function table(cols, rows, { empty = "Nothing here.", rowAttr, cls = "" } = {}) {
  if (!rows || !rows.length) return `<p class="empty">${esc(empty)}</p>`;
  const td = (c) => [c.r ? "r" : "", c.cls || ""].filter(Boolean).join(" ");
  return `<div class="t-wrap"><table class="t${cls ? ` ${cls}` : ""}"><thead><tr>${cols.map((c) => `<th scope="col"${td(c) ? ` class="${td(c)}"` : ""}>${c.label ? esc(c.label) : `<span class="sr">${esc(c.sr || "Actions")}</span>`}</th>`).join("")}</tr></thead><tbody>${rows.map((row, i) => `<tr${rowAttr ? ` ${rowAttr(row, i)}` : ""}>${cols.map((c) => `<td${td(c) ? ` class="${td(c)}"` : ""}>${c.cell(row, i)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
/* a toggle: one pressed at a time; what pressing another does is kept here by the toggle's id (the page draws with innerHTML, so a click on
   any toggle is heard once, on the document: shell.js) */
const SEGS = new Map();
let segN = 0;
function seg(items, on, onChange, { label = "" } = {}) {
  const id = `seg-${++segN}`;
  if (SEGS.size > 100) for (const k of SEGS.keys()) if (!document.querySelector(`[data-seg="${k}"]`)) SEGS.delete(k);
  if (onChange) SEGS.set(id, onChange);
  const pairs = items.map((x) => (Array.isArray(x) ? x : [x, x]));
  return `<div class="seg" role="group"${label ? ` aria-label="${esc(label)}"` : ""} data-seg="${id}">${pairs.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(String(v) === String(on))}">${esc(l)}</button>`).join("")}</div>`;
}

// ---- forms, files, the clipboard --------------------------------------------------------

const field = (label, html) => `<label>${label}${html}</label>`;
const select = (name, opts, sel) => `<select name="${name}">${opts.map(([v, l, dis]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}${dis ? " disabled" : ""}>${esc(l)}</option>`).join("")}</select>`;
/* a form's fields by name, as typed */
const formFields = (form) => Object.fromEntries(new FormData(form).entries());
/** a select's options set to `opts` ([[value, label, disabled], …]) and its value to `value`: the options are written only when they differ
 * from what it has, so a select that is open, or has the focus, is left as it is and only its value moves */
function setOptions(sel, opts, value) {
  if (!sel) return;
  const want = opts.map(([v, l, dis]) => `${v}\u0000${l}\u0000${dis ? 1 : 0}`).join("\u0001");
  const have = [...(sel.options || [])].map((o) => `${o.value}\u0000${o.textContent}\u0000${o.disabled ? 1 : 0}`).join("\u0001");
  if (want !== have) sel.innerHTML = opts.map(([v, l, dis]) => `<option value="${esc(v)}"${dis ? " disabled" : ""}>${esc(l)}</option>`).join("");
  const v = value === undefined || value === null ? "" : String(value);
  if (opts.some(([x]) => String(x) === v)) sel.value = v;
  else if (opts.length) sel.value = String(opts[0][0]);
}
/** What the owner typed into a form, kept across the form being drawn again: formKeep(form) reads each named field as it stands (a box's
 * text, a select's choice, a checkbox's tick, by name and place) → a function that, given the form drawn again, puts each back where a
 * field of that name still is. A form drawn again because what it offers changed (a brain's key saved in the Brains sheet meanwhile, a paper
 * account opened) then loses nothing that was typed. A password field is never kept: what is secret is typed again, never carried.
 * A select whose choice it changes is told so at once — a change event that bubbles, as if the owner had picked it — before the fields after
 * it are put back: whatever a choice shows or offers (the Brain select shows that provider's own block and offers that provider's own
 * efforts, ui/desk.js) then agrees with the choice put back, never with the one the form was drawn with, and a field after it is put back
 * into what that choice offers */
function formKeep(form) {
  const kept = [];
  for (const el of (form && form.querySelectorAll ? form.querySelectorAll("[name]") : [])) {
    if (el.type === "password" || el.type === "file") continue;
    kept.push([el.name, el.type === "checkbox" || el.type === "radio" ? { checked: el.checked, value: el.value } : { value: el.value }]);
  }
  return (next) => {
    if (!next || !next.querySelectorAll) return;
    const seen = new Map();
    const fields = [...next.querySelectorAll("[name]")];
    for (const [name, v] of kept) {
      const n = seen.get(name) || 0;
      seen.set(name, n + 1);
      const el = fields.filter((f) => f.name === name)[n];
      if (!el) continue;
      if ("checked" in v && (el.type === "checkbox" || el.type === "radio")) {
        if (el.value === v.value) el.checked = v.checked;
      } else if (el.type !== "password" && el.type !== "file") {
        // a choice the form no longer offers is left as the form drew it, never set to nothing
        if (el.tagName === "SELECT" && ![...(el.options || [])].some((o) => o.value === v.value)) continue;
        const was = el.value;
        el.value = v.value;
        if (el.tagName === "SELECT" && el.value !== was && typeof el.dispatchEvent === "function" && typeof Event === "function") el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };
}
/* a function that runs `fn` a little later, once, however often it is asked: later(ms) asks (350 ms unless said) */
const debounce = (fn, ms = 350) => {
  let t = 0;
  return (wait = ms) => {
    clearTimeout(t);
    t = setTimeout(fn, wait);
  };
};
/* a button's work that ends in a fresh read: the button rests meanwhile; what went wrong lands in flash */
const thenLoad = (fn) => async (b) => {
  if (b) b.disabled = true;
  try {
    await fn(b);
  } catch (err) {
    flash = String((err && err.message) || err).slice(0, 200);
  }
  await load();
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
/* what the page says when a request never reached the account (the service restarting, the network gone) */
const NO_ANSWER = { status: 0, body: { ok: false, error: "The account did not answer. Try again." } };
/* a JSON POST → { status, body }; a request that never reached the account answers as a refusal, so every caller shows it the same way */
const postJson = async (path, body) => {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch {
    return { status: NO_ANSWER.status, body: { ...NO_ANSWER.body } };
  }
};

/* a table as a CSV file the browser saves. A cell that a spreadsheet would run as a formula (one starting with = + - @ or a tab or return)
   is put behind an apostrophe and quoted, as spreadsheet exporters do; a number is left a number */
const csvCell = (c) => {
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  let v = String(c ?? "");
  const formula = /^[=+\-@\t\r]/.test(v);
  if (formula) v = `'${v}`;
  return formula || /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
function download(name, rows) {
  const url = URL.createObjectURL(new Blob([`${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  if (button) {
    const was = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = was), 1400);
  }
}

// ---- toasts -------------------------------------------------------------------------------

/** what was done ("ok"), what was refused ("no": read out at once and kept longer), or a word in passing ("info") */
function toast(content, kind = "ok", { ms } = {}) {
  const region = kind === "no" ? $("alerts") : $("toasts");
  if (!region || !content) return null;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="mk" aria-hidden="true">${kind === "no" ? "✗" : kind === "ok" ? "✓" : "·"}</span><div class="tx">${typeof content === "object" ? content.html : esc(content)}</div><button type="button" class="icon-btn" aria-label="Dismiss">${icon("x", "sm")}</button>`;
  el.querySelector("button").addEventListener("click", () => toastOut(el));
  region.appendChild(el);
  // over an open sheet too: the stack is a popover, kept open, and raised to the top again only when a sheet opened over it since it last
  // spoke (raising re-inserts it in the top layer)
  const stack = region.parentElement;
  if (stack && stack.showPopover) {
    try {
      if (!stack.matches(":popover-open")) stack.showPopover();
      else if (toastUnder) {
        stack.hidePopover();
        stack.showPopover();
      }
      toastUnder = false;
    } catch {
      // a browser without popovers shows the stack where it is
    }
  }
  toastIn(el);
  const all = document.querySelectorAll(".toast:not([data-out])");
  if (all.length > 4) toastOut(all[0]);
  const life = ms ?? (kind === "no" ? 14000 : 6000);
  let timer = 0;
  const start = () => { if (life > 0) timer = setTimeout(() => toastOut(el), life); };
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", start);
  el.addEventListener("focusin", () => clearTimeout(timer));
  start();
  return el;
}
/* a sheet opened over the toast stack since it last spoke (the dialogs' `open`, watched): the next toast raises the stack above it */
let toastUnder = false;
if (typeof MutationObserver === "function") {
  const under = new MutationObserver(() => void (toastUnder = toastUnder || $("modal").open || $("ask").open));
  for (const id of ["modal", "ask"]) if ($(id) && $(id).nodeType === 1) under.observe($(id), { attributes: true, attributeFilter: ["open"] });
}
/* the toasts standing above one in the stack (it is anchored at the bottom: they are the ones its coming and going moves) */
const toastsAbove = (el) => {
  const all = [...document.querySelectorAll(".toast")];
  return all.slice(0, all.indexOf(el)).filter((t) => !t.dataset.out);
};
const TOAST_EASE = "cubic-bezier(.2, .8, .2, 1)";
/* a toast comes in: it rises 16 px as it fades in (160 ms); the toasts above it, pushed up by its height, slide there from where they were
   (their distance read after layout, by a ResizeObserver, never forced) */
function toastIn(el) {
  if (still() || typeof el.animate !== "function") return;
  el.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: TOAST_EASE });
  const above = toastsAbove(el);
  if (!above.length || typeof ResizeObserver !== "function") return;
  const ro = new ResizeObserver((entries) => {
    ro.disconnect();
    const e = entries[0];
    const h = (e.borderBoxSize && e.borderBoxSize[0] ? e.borderBoxSize[0].blockSize : e.contentRect.height) + 8;
    for (const t of above) t.animate([{ transform: `translateY(${h}px)` }, { transform: "none" }], { duration: 160, easing: TOAST_EASE });
  });
  ro.observe(el, { box: "border-box" });
}
/* a toast goes: it fades and lifts 8 px (120 ms), then the toasts above it slide down into its place (FLIP: its height read as it starts
   to go, from a layout that is already there) */
function toastOut(el) {
  if (!el || !el.isConnected || el.dataset.out) return;
  el.dataset.out = "1";
  const h = toastsAbove(el).length ? el.offsetHeight + 8 : 0;
  const gone = () => {
    if (!el.isConnected) return;
    const above = toastsAbove(el);
    el.remove();
    if (h && !still()) for (const t of above) if (typeof t.animate === "function") t.animate([{ transform: `translateY(${-h}px)` }, { transform: "none" }], { duration: 160, easing: TOAST_EASE });
  };
  if (still() || typeof el.animate !== "function") return void gone();
  el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }], { duration: 120, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }).finished.then(gone, gone);
}

// ---- the sheet, the drawer, asking ----------------------------------------------------------

/* what the sheet (dialog#modal) and the drawer (dialog#drawer) are showing: a redraw to run after each load while open */
let SHEET = null;
let DRAWER = null;
const head = (title, close) => `<header class="sheet-h">${title ? `<h2 id="${close}-title">${esc(title)}</h2>` : "<span></span>"}<button type="button" class="icon-btn" data-${close}-close aria-label="Close">${icon("x")}</button></header>`;

/** the one sheet: a title, a body of the caller's, a close button; `wide` for a table (the Statement). Returns the body */
function openSheet(html, { title = "", wide = false, redraw } = {}) {
  const d = $("modal");
  $("modal-form").replaceChildren();
  d.classList.toggle("wide", !!wide);
  d.setAttribute("aria-labelledby", "sheet-title");
  // what an action from the sheet did, said in the sheet as well: under a modal sheet the toasts can be seen but not reached
  $("sheet").innerHTML = `${head(title, "sheet")}<div class="msg sheet-msg" data-sheet-msg role="status"></div><div class="sheet-b">${html}</div>`;
  SHEET = { redraw: redraw || null };
  if (!d.open) d.showModal();
  return $("sheet").querySelector(".sheet-b");
}
function closeSheet() {
  if ($("modal").open) $("modal").close();
}

/** the drawer: a side sheet on the right for one thing (an asset, a market, the menu); the page behind stays usable. It slides in with what
 * it holds now (its parts' skeletons); what its reads bring while it slides is drawn once it rests (drawerLater), and its first control
 * takes the focus then. Returns the body */
function openDrawer(html, { title = "", redraw } = {}) {
  const d = $("drawer");
  const back = DRAWER ? DRAWER.back : document.activeElement;
  const sliding = !d.open && !still();
  d.innerHTML = `${head(title, "drawer")}<div class="sheet-b">${html}</div>`;
  d.setAttribute("aria-labelledby", "drawer-title");
  const me = { redraw: redraw || null, back, sliding, later: [] };
  DRAWER = me;
  paintGen++;
  if (!d.open) d.show();
  const first = d.querySelector(".sheet-b button, .sheet-b a, .sheet-b input, .sheet-b select") || d.querySelector("[data-drawer-close]");
  // it rests: what its reads brought is drawn (in the next frame), and its first control takes the focus once that frame is drawn, so the
  // focus finds the page laid out and lays out nothing of its own
  const rest = () => {
    if (DRAWER !== me) return;
    me.sliding = false;
    for (const fn of me.later.splice(0)) fn();
    nextFrame(() => setTimeout(() => {
      if (DRAWER === me && d.open && first && first.isConnected && first.focus) first.focus({ preventScroll: true });
    }, 0));
  };
  if (sliding) afterMotion(d, 320, rest);
  else rest();
  return d.querySelector(".sheet-b");
}
/** fn now — or, while the drawer is still sliding in, once it rests (asked twice meanwhile, it runs once) */
function drawerLater(fn) {
  if (!DRAWER || !DRAWER.sliding) return void fn();
  if (!DRAWER.later.includes(fn)) DRAWER.later.push(fn);
}
function closeDrawer() {
  if ($("drawer").open) $("drawer").close();
}

/* the small asking dialog (dialog#ask): over an open sheet, without replacing it. A second ask answers the first "no" */
let ASKING = null;
function asking(html, read) {
  const d = $("ask");
  if (ASKING) ASKING(null);
  return new Promise((resolve) => {
    let done = false;
    const answer = (v) => {
      if (done) return;
      done = true;
      ASKING = null;
      resolve(v);
    };
    ASKING = answer;
    d.innerHTML = html;
    d.returnValue = "";
    d.addEventListener("close", () => answer(read(d.returnValue)), { once: true });
    if (!d.open) d.showModal();
  });
}
/** a yes or no, over whatever is open: true only for the yes. The dialog is named by its title, or by the question itself (#ask-title) */
function confirmSheet(text, { danger = false, title = "", yes = "Yes", no = "Cancel" } = {}) {
  return asking(`<form method="dialog" class="ask-f">${title ? `<h2 id="ask-title">${esc(title)}</h2><p>${esc(text)}</p>` : `<p id="ask-title">${esc(text)}</p>`}<div class="end"><button type="submit" value="" class="btn">${esc(no)}</button><button type="submit" value="yes" class="btn ${danger ? "btn-danger" : "btn-primary"}">${esc(yes)}</button></div></form>`, (v) => v === "yes");
}
/** one of a few, over whatever is open: the value picked, or null */
function pickSheet(title, options, { current, note = "" } = {}) {
  const opts = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1], hint: o[2] } : o));
  return asking(`<form method="dialog" class="ask-f"><h2 id="ask-title">${esc(title)}</h2>${note ? `<p class="dim small">${esc(note)}</p>` : ""}<div class="picks">${opts.map((o, i) => `<button type="submit" value="${i}"${o.disabled ? " disabled" : ""}${current !== undefined && String(o.value) === String(current) ? ' aria-current="true"' : ""}><span>${esc(o.label)}</span>${o.hint ? `<span class="dim small">${esc(o.hint)}</span>` : ""}</button>`).join("")}</div><div class="end"><button type="submit" value="" class="btn">Cancel</button></div></form>`, (v) => (v === "" || !opts[Number(v)] ? null : opts[Number(v)].value));
}

/** a signed cancel of one order (liveCancel). An agent's order is taken off the book only after a yes — the agent placed it inside a limit
 * the owner gave, or on a card the owner approved; the owner's own order goes with one click. Resolves to what own() returned, or null */
async function cancelOrder(o, then) {
  if (!o || !owns()) return null;
  if (o.authority === "agent" || o.agent) {
    const who = o.agent ? keyName(o.agent) : "an agent";
    const ok = await confirmSheet(`Cancel ${who}'s order ${o.id}? It comes off ${o.venueName || nameOf(o.venue)}'s book; the agent is told through the account.`, { title: "Cancel an agent's order", yes: "Cancel the order", no: "Keep it", danger: true });
    if (!ok) return null;
  }
  return own({ type: "liveCancel", venue: o.venue, order: o.id }, then);
}

/* the fields the owner signs, as the device key signs them (owner.js builds the signing input from these, not from the server); `notes` a
   word beside a field, by the field's name (a prediction's limit, typed in cents, read back in cents) */
const whatYouSign = (p, { open = false, notes = null } = {}) => (p && p.shown ? `<details class="signs"${open ? " open" : ""}><summary>What you sign</summary><pre>${p.shown.map((f) => `${esc(f.name)}: ${esc(f.value)}${notes && notes[f.name] ? `   <i>${esc(notes[f.name])}</i>` : ""}`).join("\n")}</pre></details>` : "");
/* a refusal at the door, the way own() reads one */
const refusedAt = (r) => !r || r.status >= 400 || !r.body || r.body.ok === false || (r.body.kind === "result" && r.body.result && r.body.result.ok === false);

/** the element's HTML written only where it changed (morphKids: the rows and words that moved, nothing else), so a redraw every twenty
 * seconds rebuilds nothing, keeps a running animation running and never drops the owner's focus to the page; the control that had the focus
 * and went is found again — by its data-fk or data-key, else by its place among the focusable controls. True when it drew */
const PAINTED = new WeakMap();
/* how many times a part was drawn: what keeps a list of elements (the countdowns) knows when to look again */
let paintGen = 0;
function paint(el, html) {
  if (!el) return false;
  if (PAINTED.get(el) === html) return false;
  const f = document.activeElement;
  const inside = !!(f && el.contains && el.contains(f));
  const key = inside && f.dataset ? f.dataset.fk || f.dataset.key || "" : "";
  const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]";
  const index = inside && !key && el.querySelectorAll ? [...el.querySelectorAll(FOCUSABLE)].indexOf(f) : -1;
  const inPlace = typeof el.isEqualNode === "function" && !!el.ownerDocument && typeof el.ownerDocument.createElement === "function";
  if (inPlace) {
    const t = el.ownerDocument.createElement("template");
    t.innerHTML = html;
    morphKids(el, t.content);
  } else el.innerHTML = html;
  PAINTED.set(el, html);
  paintGen++;
  if (!inside || !el.querySelectorAll) return true;
  // drawn in place, the control kept its place (it is the same element): nothing to give back, and nothing laid out to give it
  if (inPlace && f.isConnected && el.contains(f)) return true;
  const again = key ? [...el.querySelectorAll("[data-fk], [data-key]")].find((x) => (x.dataset.fk || x.dataset.key) === key) : index >= 0 ? el.querySelectorAll(FOCUSABLE)[index] : null;
  if (again && again.focus) again.focus({ preventScroll: true });
  return true;
}
/* a child's key among its siblings: a row or a card by what it is (data-k), else by the key the page already names it with (data-key) */
const morphKey = (n) => (n.nodeType === 1 ? n.getAttribute("data-k") || n.getAttribute("data-key") || "" : "");
const morphSame = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.localName === b.localName && a.namespaceURI === b.namespaceURI));
/* a node moved among its siblings keeps its state (the focus, a running animation) where the browser can move it so */
function morphMove(el, node, before) {
  if (typeof el.moveBefore === "function") {
    try {
      return void el.moveBefore(node, before);
    } catch {
      // a browser that cannot move it here: inserted (the focus, if it was in it, is found again by paint)
    }
  }
  el.insertBefore(node, before);
}
/* el's children made to be `to`'s (a template's content, whose nodes are taken as they are needed): kept by key or by place, the rest
   inserted, what is left over removed */
function morphKids(el, to) {
  const keyed = new Map();
  for (let c = el.firstChild; c; c = c.nextSibling) {
    const k = morphKey(c);
    if (k && !keyed.has(k)) keyed.set(k, c);
  }
  let at = el.firstChild;
  for (let n = to.firstChild; n; ) {
    const next = n.nextSibling;
    const k = morphKey(n);
    let m = null;
    if (k) {
      m = keyed.get(k) || null;
      if (m) keyed.delete(k);
      if (m && !morphSame(m, n)) m = null;
    } else if (at && !morphKey(at) && morphSame(at, n)) m = at;
    if (m) {
      if (m === at) at = at.nextSibling;
      else morphMove(el, m, at);
      morphNode(m, n);
    } else el.insertBefore(n, at);
    n = next;
  }
  while (at) {
    const x = at.nextSibling;
    el.removeChild(at);
    at = x;
  }
}
/* one node made to be another of its kind: a text by its words; an element by its attributes, then its children — unless the two are equal
   already (the browser compares them whole). A field the owner may have changed is drawn afresh when it was drawn differently (as a
   rebuild would), unless the owner is in it */
function morphNode(old, neu) {
  if (old.nodeType !== 1) {
    if (old.nodeValue !== neu.nodeValue) old.nodeValue = neu.nodeValue;
    return;
  }
  if (old.isEqualNode(neu)) return;
  if ((old.localName === "input" || old.localName === "select" || old.localName === "textarea") && old !== document.activeElement) return void old.replaceWith(neu);
  // what was painted into it on its own is no longer what it shows
  PAINTED.delete(old);
  const na = neu.attributes;
  for (let i = 0; i < na.length; i++) if (old.getAttribute(na[i].name) !== na[i].value) old.setAttribute(na[i].name, na[i].value);
  const oa = old.attributes;
  for (let i = oa.length - 1; i >= 0; i--) if (!neu.hasAttribute(oa[i].name)) old.removeAttribute(oa[i].name);
  morphKids(old, neu);
}

/* an element's words set in place: its one text node changed (the browser re-lays the words only), else its text replaced */
function setText(el, t) {
  const n = el.firstChild;
  if (n && n.nodeType === 3 && !n.nextSibling) {
    if (n.nodeValue !== t) n.nodeValue = t;
  } else if (el.textContent !== t) el.textContent = t;
}

// ---- time and motion ------------------------------------------------------------------------

/* the next frame, or at once where there are no frames (a page without a window) */
const nextFrame = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : fn());
/* the owner asked for no motion: every transition is a cut */
const STILL = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const still = () => !!(STILL && STILL.matches);
/** fn once `el`'s own transition or animation has ended — `ms` later at the most, at once when nothing moves */
function afterMotion(el, ms, fn) {
  let done = false;
  let t = 0;
  const end = (e) => {
    if (done || (e && e.target !== el)) return;
    done = true;
    clearTimeout(t);
    el.removeEventListener("transitionend", end);
    el.removeEventListener("animationend", end);
    fn();
  };
  if (still() || !el || !el.addEventListener) return void fn();
  el.addEventListener("transitionend", end);
  el.addEventListener("animationend", end);
  t = setTimeout(end, ms);
}
/* the one clock: what counts down or ages on the page is looked at once a second as the second turns over, and what changed is written
   together in one frame — one layout at most, and no frame at all in a second where nothing changed; while the page scrolls it waits for
   the scroll to rest (a scroll's frames are the compositor's, and stay so) */
const SECOND = { fns: new Set(), timer: 0, scrolledAt: 0, scrolling: false };
/* the page is scrolling: from a scroll event to its scrollend (a glide of the compositor's sends few scroll events and one scrollend), and
   for 150 ms after the last scroll event where a browser has no scrollend */
const scrollingNow = () => SECOND.scrolling || Date.now() - SECOND.scrolledAt < 150;
function everySecond(fn) {
  SECOND.fns.add(fn);
  secondArm();
  return () => void SECOND.fns.delete(fn);
}
function secondArm() {
  if (SECOND.timer || !SECOND.fns.size) return;
  // a page without frames ticks on a plain interval (none at all where there is no clock)
  if (typeof requestAnimationFrame !== "function") return void (SECOND.timer = setInterval(secondRun, 1000) || -1);
  SECOND.timer = setTimeout(secondRun, 1004 - (Date.now() % 1000));
}
function secondRun() {
  if (typeof requestAnimationFrame === "function") {
    SECOND.timer = 0;
    // a scroll under way: asked again once it rests
    if (scrollingNow()) return void (SECOND.timer = setTimeout(secondRun, 160));
  }
  const writes = [];
  for (const fn of [...SECOND.fns]) {
    try {
      const w = fn();
      if (w === false) SECOND.fns.delete(fn);
      else if (typeof w === "function") writes.push(w);
    } catch (err) {
      SECOND.fns.delete(fn);
      console.error(err);
    }
  }
  if (writes.length) nextFrame(() => {
    for (const w of writes) {
      try {
        w();
      } catch (err) {
        console.error(err);
      }
    }
  });
  secondArm();
}
/** fn once the page is not scrolling (now, when it is not): a timer's writes wait for the scroll to rest */
function whenStill(fn) {
  if (!scrollingNow()) return void fn();
  setTimeout(() => whenStill(fn), 160);
}
/* a pane coming in (shell.js paneIn, 180 ms) draws what a read brought meanwhile once it has come in: its surface is never redrawn in the
   middle of its own entrance. paneLater(tab, fn): fn now, or then (asked twice meanwhile, once) */
const PANE_IN = new Map();
function paneLater(tab, fn) {
  const coming = PANE_IN.get(tab);
  if (!coming) return void fn();
  if (!coming.later.includes(fn)) coming.later.push(fn);
}
/* while the page scrolls, what passes under a resting pointer changes at once: the hover fades (shell.css) are for a pointer that moves,
   and a fade per row under it would be main-thread frames in the middle of the compositor's scroll. html.scrolling, from the scroll's first
   event until 150 ms after its last scroll or scrollend (so a wheel's glides one after another keep it on, and it is set and taken off once) */
let scrollRest = 0;
let scrollEndLate = 0;
const scrollSeen = () => {
  SECOND.scrolledAt = Date.now();
  if (!scrollRest) document.documentElement.classList.add("scrolling");
  clearTimeout(scrollRest);
  scrollRest = setTimeout(() => {
    scrollRest = 0;
    document.documentElement.classList.remove("scrolling");
  }, 150);
};
if (typeof addEventListener === "function") {
  const ends = typeof window !== "undefined" && "onscrollend" in window;
  addEventListener("scroll", () => {
    // from a scroll to its scrollend the clock waits (a glide sends few scroll events); one whose end never came, two seconds at the most
    if (ends) {
      SECOND.scrolling = true;
      clearTimeout(scrollEndLate);
      scrollEndLate = setTimeout(() => void (SECOND.scrolling = false), 2000);
    }
    scrollSeen();
  }, { passive: true, capture: true });
  if (ends) addEventListener("scrollend", () => {
    SECOND.scrolling = false;
    clearTimeout(scrollEndLate);
    scrollSeen();
  }, { passive: true, capture: true });
}

/** prepare → show → sign and send, in one sheet. The account prepares the exact action from what is typed (asked again as it changes; the
 * latest ask wins), shows it in words with what is signed, and the signature is good for ten minutes — asked again when they run out */
function quoteDialog({ title, sub = "", fields = "", draft, show, block, done, signNotes, go = "Sign and send", wide = false }) {
  const body = openSheet(`${sub ? `<p class="dim small">${sub}</p>` : ""}<form class="qd" novalidate>${fields}<div class="quote real" data-q><span class="dim">Fill it in to see what it would be.</span></div><div data-sign></div><div class="msg no" data-block role="alert" hidden></div><div class="msg" data-msg role="status"></div><div class="end"><button type="button" class="btn" data-sheet-close>Cancel</button><button type="submit" class="btn btn-primary" data-go disabled>${esc(go)}</button></div></form>`, { title, wide });
  const form = body.querySelector("form.qd");
  const box = form.querySelector("[data-q]");
  const sign = form.querySelector("[data-sign]");
  const stop = form.querySelector("[data-block]");
  const msg = form.querySelector("[data-msg]");
  const btn = form.querySelector("[data-go]");
  /* what the account would refuse, said before the sign button, which stays off with the same words */
  const refuse = (why) => {
    stop.hidden = !why;
    stop.textContent = why || "";
    btn.title = why || "";
  };
  let prepared = null;
  let seq = 0;
  let stopLeft = () => {};
  /* the draft the shown preparation was asked for, as text: a field changed since makes it another draft — the sign button goes off at once
     and the sheet signs nothing until the account has prepared that one (a quick Enter after a change never signs what was shown before) */
  let asked = "";
  const draftNow = () => JSON.stringify(draft(form) ?? null);
  const say = (text, state = "") => { msg.className = `msg${text && state ? ` ${state}` : ""}`; msg.textContent = text || ""; };
  // the signature's minutes, on the page's one clock: false stops it; a change is written in the clock's frame
  const left = () => {
    const el = box.querySelector("[data-left]");
    if (!form.isConnected || !prepared || !el) return false;
    const ms = prepared.action.deadline - Date.now();
    if (ms <= 0) return void requote();
    const t = `Your signature is good for ${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")} more.`;
    if (el.textContent !== t) return () => setText(el, t);
  };
  const requote = async () => {
    if (!form.isConnected) return;
    const my = ++seq;
    prepared = null;
    btn.disabled = true;
    sign.innerHTML = "";
    refuse("");
    stopLeft();
    const d = draft(form);
    asked = JSON.stringify(d ?? null);
    if (!d || typeof d === "string") return void (box.innerHTML = `<span class="dim">${esc(d || "Fill it in to see what it would be.")}</span>`);
    box.innerHTML = '<span class="dim">Asking…</span>';
    const r = await Owner.prepare(d);
    if (!form.isConnected || my !== seq) return;
    if (r.status !== 200) return void (box.innerHTML = `<div class="msg no">${esc(Owner.why(r) || "Refused")}</div>`);
    prepared = r.body;
    box.innerHTML = `${show ? show(prepared, form) : `<div class="big"><span>${esc((prepared.quote && prepared.quote.words) || prepared.action.type)}</span></div>`}${prepared.action.deadline ? '<div class="left-t" data-left></div>' : ""}`;
    sign.innerHTML = whatYouSign(prepared, { notes: signNotes ? signNotes(prepared, form) : null });
    const no = block ? block(prepared, form) : "";
    refuse(no);
    btn.disabled = !owns() || !!no || draftNow() !== asked;
    if (prepared.action.deadline) {
      const now = left();
      if (typeof now === "function") now();
      stopLeft = everySecond(left);
    }
  };
  const later = debounce(requote);
  // a change makes another draft: off at once, until the account has prepared that one
  const changed = () => {
    if (draftNow() !== asked) btn.disabled = true;
  };
  form.addEventListener("input", () => {
    changed();
    later();
  });
  form.addEventListener("change", () => {
    changed();
    later(0);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!prepared || busy || !stop.hidden) return;
    // what is typed now is not what was prepared (a field changed and the quick key came first): prepared again, and nothing signed
    if (draftNow() !== asked) {
      say("It changed: here it is again as the account would take it. Check it, then sign.", "wait");
      return void requote();
    }
    const p = prepared;
    btn.disabled = true;
    say("Sending it…", "wait");
    const r = await Owner.submit(p);
    if (refusedAt(r)) {
      say(Owner.why(r) || "Refused", "no");
      return void requote();
    }
    afterAction();
    try {
      // an order this placed and filled is said once (orderWordsOnce): the account may have pushed its fill already
      said = (done ? await done(r, p) : "") || orderWordsOnce(r.body, ORDER_PLACING.has(p.action && p.action.type));
    } catch (err) {
      flash = String((err && err.message) || err).slice(0, 240);
    }
    closeSheet();
    await load();
  });
  later(0);
  return { form, requote: () => later(0), get prepared() { return prepared; } };
}

// ---- where the page is ----------------------------------------------------------------------

const TABS = ["portfolio", "venues", "memory", "markets", "trade", "desk", "superagent", "backtest"];
/* the Account's own three, opened from the rail's foot (round 7), and the desk (the rail's Agents), under the Account's header too: the
   mode matters to the desk */
const ACCOUNT_TABS = ["portfolio", "venues", "memory", "desk"];
/* the trading area: Trade's two modes, Regular (the terminal, pane "trade") and Superagent (the desk trading by itself, pane "superagent"). One
   place on the rail, one URL path (#/trade, the mode in its query), two panes the shell cross-fades between */
const TRADE_AREA = ["trade", "superagent"];
/* the mode the viewer used last, kept in this browser so the rail's Trade opens it: "regular" | "superagent" */
const TRADE_MODE_KEY = "account.tradeMode";
/** the mode the viewer used last — Regular when none was kept, or storage is off (a private window) */
function tradeModeLast() {
  try {
    return localStorage.getItem(TRADE_MODE_KEY) === "superagent" ? "superagent" : "regular";
  } catch {
    return "regular";
  }
}
/** the switch's click: the mode kept for the next visit (the only write of that key; never at load, never from a link), then the page
 * goes there. params: what the mode should show (a paper account's id for the superagent) */
function setTradeMode(mode, params = {}) {
  const m = mode === "superagent" ? "superagent" : "regular";
  try {
    localStorage.setItem(TRADE_MODE_KEY, m);
  } catch {
    // a private window: the mode holds for this visit only
  }
  go(m === "superagent" ? "superagent" : "trade", params);
}
const ROUTE = { tab: "portfolio", params: {} };
const ROUTED = [];
/* the hash's place: #/trade?mode=superagent is the superagent's pane (and #/superagent, the older link, too); any other mode is
   Regular's. The mode is the route's, never a pane's param */
const routeOf = (hash) => {
  const m = /^#\/([a-z]+)(?:\?(.*))?$/.exec(hash || "");
  const params = Object.fromEntries(new URLSearchParams((m && m[2]) || ""));
  let tab = m && TABS.includes(m[1]) ? m[1] : "portfolio";
  if (TRADE_AREA.includes(tab)) tab = m[1] === "superagent" || params.mode === "superagent" ? "superagent" : "trade";
  delete params.mode;
  return { tab, params };
};
/* the hash for a place: the superagent's is Trade's path with mode=superagent first; Regular's carries no mode */
const hashOf = (tab, params = {}) => {
  const kept = Object.entries(params).filter(([k, v]) => k !== "mode" && v !== undefined && v !== null && v !== "");
  const sup = tab === "superagent";
  const q = new URLSearchParams(sup ? [["mode", "superagent"], ...kept] : kept).toString();
  return `#/${sup ? "trade" : TABS.includes(tab) ? tab : "portfolio"}${q ? `?${q}` : ""}`;
};
/** go to a tab, with what it should show (#/markets?tab=crypto&q=btc); `replace` keeps the browser's history as it was */
function go(tab, params = {}, { replace = false } = {}) {
  const h = hashOf(tab, params);
  if (h === location.hash) return void routed();
  if (replace) {
    history.replaceState(null, "", h);
    routed();
  } else location.hash = h;
}
const onRoute = (fn) => void ROUTED.push(fn);
/* the hash says where the page is: everyone listening is told (the shell first: it shows the pane) */
function routed() {
  const r = routeOf(location.hash);
  // the trading area's older or roundabout links (#/superagent?venue=…, #/trade?mode=regular) written as the one canonical hash, in place:
  // no new history entry and no second hashchange
  if (TRADE_AREA.includes(r.tab) && location.hash !== hashOf(r.tab, r.params)) history.replaceState(null, "", hashOf(r.tab, r.params));
  const moved = r.tab !== ROUTE.tab;
  ROUTE.tab = r.tab;
  ROUTE.params = r.params;
  for (const fn of ROUTED) fn(ROUTE.tab, ROUTE.params, moved);
}

/* the lens: what the top bar narrows the panes to — every account (""), real money only ("real": every account but the paper ones),
   paper only ("paper": the paper accounts), one venue ("venue:<id>") or one agent ("agent:<0x…>"). Real and Paper are the switch between
   rehearsing and trading for real: the same markets, the same ticket, the other accounts */
function lensNow() {
  if (!A) return { kind: "all", id: "", name: "All accounts" };
  if (view.lens === "real") return { kind: "real", id: "", name: "Real money" };
  if (view.lens === "paper") return { kind: "paper", id: "", name: "Paper" };
  const m = /^(venue|agent):(.+)$/.exec(view.lens || "");
  if (!m) return { kind: "all", id: "", name: "All accounts" };
  return { kind: m[1], id: m[2], name: m[1] === "venue" ? nameOf(m[2]) : keyName(m[2]) };
}
/* a venue on the account is a paper account (its own book, or a venue's test environment): no real money in it */
const paperVenue = (id) => !!(A && (A.venues || []).some((v) => v.id === id && v.paper));
/* a row is in the lens: every row under "All accounts"; under Real money, a row at no paper account; under Paper, a row at a paper account;
   under a venue, that venue's; under an agent, what that agent did */
const inLens = (venue, agent) => {
  const l = lensNow();
  if (l.kind === "all") return true;
  if (l.kind === "real") return !paperVenue(venue);
  if (l.kind === "paper") return paperVenue(venue);
  return l.kind === "venue" ? venue === l.id : !!agent && String(agent).toLowerCase() === l.id.toLowerCase();
};

// ---- what an account can do -------------------------------------------------------------

const writesOn = () => !!(A.connectLive && A.connectLive.writes && A.connectLive.writes.on);
const watched = (v) => !!v.address && !v.proven;
/* a connected venue serves the network the account runs on now: one whose place rule (or the server in front of it) refuses it is on the
   account all the same (`notServed`: its numbers are the last good read's), and is offered for nothing from here until a check of this
   network finds it answering */
const servedHere = (v) => !(v && v.notServed);
/* a venue a read left out because it does not serve this network now (its place rule, or a connected venue marked notServed): a state to name
   once, never a read that failed */
const awayMiss = (m) => !!m && (m.code === "E_VENUE_GEOBLOCKED" || !servedHere(((A && A.venues) || []).find((v) => v.id === m.venue)));
/** those venues named once, in one quiet line: "Not served on this network now: Binance, Bybit." Their own words only on request, on hover
 * (`title`), or folded in a closed details (`fold`); never as an error. `named: false` keeps only the folded words (where the venue is
 * already named) */
function awayLine(list, { cls = "dim small", fold = false, named = true } = {}) {
  const seen = new Set();
  const once = (list || []).filter((m) => m && !seen.has(m.venue) && seen.add(m.venue));
  if (!once.length) return "";
  const name = (m) => m.venueName || nameOf(m.venue);
  const said = once.map((m) => [name(m), String(m.said || m.why || "").trim().replace(/[.\s]+$/, "")]).filter(([, w]) => w);
  const lead = named ? `Not served on this network now: ${esc(once.map(name).join(", "))}.` : "";
  if (fold) return lead || said.length ? `<div class="${cls}">${lead}${said.length ? `<details class="inl"><summary>Their words</summary>${said.map(([n, w]) => `<div><b>${esc(n)}</b>: ${esc(w)}.</div>`).join("")}</details>` : ""}</div>` : "";
  return lead ? `<p class="${cls}"${said.length ? ` title="${esc(said.map(([n, w]) => `${n}: ${w}.`).join(" "))}"` : ""}>${lead}</p>` : "";
}
/* an order can be placed here: trading is on, the venue trades, the key may (or has not said), and a wallet is proven yours */
const canTrade = (v) => writesOn() && !!v.trade && v.trade.can !== false && !watched(v) && servedHere(v);
const canMove = (v) => writesOn() && !!v.liveCan && !v.readOnlyBecause && !watched(v) && servedHere(v) && (v.liveCan.withdraw !== false || ((v.liveCan.ledgers || []).length > 1 && v.liveCan.transfer !== false) || v.liveCan.swap !== false || !!v.liveCan.send);
/* WHERE THIS USER CAN CONNECT, as the account judged it from the network it runs on (GET /api/account/venues, live/availability.ts): each
   venue's own answer to that network, and its own terms matched to where the user is (never named). Read when the page is idle and again
   when older than ten minutes; Markets, Trade and the list of accounts read it before offering "Connect to trade", so a venue that would
   refuse is never offered — its words are said instead. connector → { name, verdict, said, terms, needs, group, connected } */
const VENUES = new Map();
let venuesRead = 0;
async function readVenues(force = false) {
  if (!force && venuesRead && Date.now() - venuesRead < 600_000) return VENUES;
  const got = await api(`/api/account/venues${force ? "?force=1" : ""}`);
  if (got && Array.isArray(got.venues)) {
    VENUES.clear();
    for (const v of got.venues) VENUES.set(v.connector, v);
    venuesRead = Date.now();
  }
  return VENUES;
}
/* a venue that would refuse the user's order to open something if connected — it does not serve this network, lets it only close what is
   held (close-only: Polymarket's rule for the United States among other places), needs something on this machine first, or offers no way
   in: its word and its own words; null when it would take the user or was not judged. A close-only venue still connects (the list of
   accounts keeps its form open): what is held there is read, and can be sold */
const VENUE_NO = { "not-served": "Not served here", "close-only": "Close only here", closed: "No way in here", setup: "Set up first" };
function venueRefuses(connector) {
  const v = connector && VENUES.get(connector);
  return v && VENUE_NO[v.verdict] ? { word: VENUE_NO[v.verdict], name: v.name, said: v.said || "", verdict: v.verdict } : null;
}
/* a venue whose own published terms exclude where the user is: said, never enforced — connecting is still offered, because the venue's
   own sign-up checks residency; null otherwise */
function venueTermsSay(connector) {
  const v = connector && VENUES.get(connector);
  return v && v.verdict === "terms-exclude" ? { word: "Its terms exclude where you are", name: v.name, said: v.said || "" } : null;
}
/* a venue's own words for why nothing is placed there from here: what it or its key said, else what its way in gives */
const readOnlyWords = (v) => (v.readOnlyBecause || v.noTradeBecause || (v.watchOnly ? "a watched address: nothing is traded or sent from it" : "") || `${v.via || "its connection"} gives no interface for orders here`);

// ---- a browser wallet sending what the account built ----------------------------------------

/** the wallet each proven address was proven with, while this page is open */
const PROVIDERS = new Map();
/** what a wallet has already sent, by a key no other run of the account reuses (an order's client id; a payment's id and time), while this
   page is open; the account itself keeps the hash once it has been reported */
const SENT = new Map();
/** payments and orders whose wallet flow is running in this page: never two at once for one */
const INFLIGHT = new Set();
/** the wallet that proved `address`, asked again if this page has forgotten it; it has to answer with that same address */
async function walletFor(address) {
  const known = PROVIDERS.get(address.toLowerCase());
  if (known) return known;
  for (const w of await findWallets()) {
    const accounts = await w.provider.request({ method: "eth_requestAccounts" }).catch(() => []);
    if ((accounts || []).some((a) => a.toLowerCase() === address.toLowerCase())) {
      PROVIDERS.set(address.toLowerCase(), w);
      return w;
    }
  }
  throw new Error(`no wallet in this browser answers for ${short(address)}: open this page where that wallet is installed`);
}
/** wait for a transaction a wallet sent to be on chain, asked of the wallet itself (a swap after an approval needs the approval first) */
async function mined(w, hash, ms = 120_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const r = await w.provider.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null);
    if (r && r.blockNumber) {
      if (r.status === "0x0") throw new Error(`transaction ${short(hash)} failed on chain`);
      return;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`transaction ${short(hash)} is not on chain yet: try again in a minute`);
}
/* writes are on, the venue is written, but this key lets nothing leave it: it can still receive */
const keyOnlyReads = (v) => writesOn() && !!v.liveCan && !v.readOnlyBecause && !watched(v) && !canMove(v);
