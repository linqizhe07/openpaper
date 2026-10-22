/* The shell, loaded last: the rail, the top bar and the panes, drawn from what /api/account said, and the page started — the route from
   the hash, pairing, the first load, the account's push channel (ui/stream.js: what changes applied in place as it happens, below), and a
   fresh read every 20 seconds (every 80 while the stream is connected: it is the fallback then) while nothing is being signed, no sheet is
   open, nothing outside the search is being typed, and the page is in view.
   The look is round 7's (the Demo v2 canvas, F1 and F5): a white rail with Markets · Trade and the agents, and the Account at its foot —
   a wallet button with the net worth and the mode — which opens Portfolio · Venues · Memory under the Account's own header (the mode,
   trading on or off, Settings). Markets and Trade keep the search in their top bar.
   THE TRADING AREA (core TRADE_AREA): Trade in its two modes, Regular (the terminal) and Superagent (the desk trading by itself), is one item on the
   rail, current in both. While it shows, html[data-area="trade"] gives the area Hyperliquid's dark green (ui/tokens.css) — the rail
   beside it too, in colour only, like HL's own nav (shell.css) — and the top bar carries the Regular · Superagent switch (account.html
   #trade-mode): drawn once, never redrawn, so it stands in the same place in both modes and keeps the focus; one click swaps the pane with
   the shell's cross-fade (a cut under reduced motion) and keeps the mode for the rail's next visit (core setTradeMode). The rail's Trade
   opens that mode from outside the area; inside it, it points at the mode showing, so pressing the item the viewer is on changes nothing. */

/** the whole page from A: the chrome, the visible pane, whatever sheet or drawer is open, then what was done or refused as a toast */
function render() {
  if (!A) return;
  // the orders' states the account pushed, laid again over a read that came back behind them (shAhead)
  shAhead();
  SH.late = false;
  const L = connected();
  const owner = owns();
  $("main").removeAttribute("aria-busy");
  renderChrome(L, owner);
  drawPane(L, owner);
  for (const open of [SHEET, DRAWER]) {
    if (!open || !open.redraw) continue;
    try {
      open.redraw();
    } catch (err) {
      console.error(err);
    }
  }
  speak();
}

/* the rail and the top bar: the tab's title with what waits, the clock, trading on or off, the mode, the counts, the lens, pairing, a restart */
function renderChrome(L, owner) {
  // what waits for the owner: the cards to approve, and what the agents asked for (both answered under Portfolio's Waiting for you)
  const waiting = A.cards.length + (A.asks || []).length + (A.memoryAsks || []).length;
  document.title = `${waiting ? `(${waiting}) ` : ""}Account`;
  drawStamp();
  // trading on or off, and the most one order or move may be worth (round 7's "Trading on · $100 a move"; the sentence is in Settings)
  const cap = A.connectLive && A.connectLive.writes ? Number(A.connectLive.writes.capUsd) : NaN;
  // the pill opens Settings, where the cap is the owner's to change
  paint($("writes"), writesOn() ? `<button type="button" class="pill up pill-btn" data-open-settings title="Orders and moves go through only when you sign them, or inside a limit you gave an agent. The cap is yours to change in Settings">Trading on${Number.isFinite(cap) ? ` · $${cap.toLocaleString("en-US")} a move` : ""}</button>` : '<span class="pill" title="Started with --read-only">Read-only</span>');
  // the Account at the rail's foot: what it is worth, and the mode
  setText($("rail-worth"), `${money(A.liveUsd)} · ${A.mode === "open" ? "Beast" : "Guard"}`);
  for (const b of document.querySelectorAll("button[data-set-mode]")) {
    b.setAttribute("aria-pressed", String(b.dataset.setMode === A.mode));
    b.disabled = !owner;
  }
  $("mode-note").textContent = modeNote();
  count("count-portfolio", waiting, `${plural(waiting, "thing")} waiting for you`);
  // agents knocking to be let in, which the Agents sheet answers
  count("count-agents", A.requests.length, `${plural(A.requests.length, "agent")} asking to be let in`);
  // a lens on a venue disconnected, or an agent revoked, is let go; so is Paper once no paper account is open
  const l = lensNow();
  if ((l.kind === "venue" && !L.some((v) => v.id === l.id)) || (l.kind === "agent" && !A.keys.some((k) => k.address.toLowerCase() === l.id.toLowerCase())) || (l.kind === "paper" && !L.some((v) => v.paper))) view.lens = "";
  // signing out: offered while this browser signs (agents-mount.js signOutAsk)
  $("sign-out").hidden = !owner;
  $("lens-name").textContent = lensNow().name;
  $("lens").setAttribute("aria-label", `Showing ${lensNow().name}: choose what the page shows`);
  drawBanner(owner);
  drawRestoreNotice();
  shSharks();
}

/* THE PAPER ACCOUNTS' SHARKS: the ocean under the page (ui/ocean.js OCEAN.bonus) swims one more shark for each whole 1% the paper accounts
   made since they started, and one fewer for each whole 1% lost — what they hold now against the paper money they started with and the
   paper money added since (topUpPaper: put in, never made). Only the paper accounts the account keeps itself say what they started with
   (paperStartUsd): one that does not is left out, and with none the ocean keeps the window's own sharks. A shark joining or leaving for it
   is said once, as a word in passing; the page's first reading says nothing */
const SH_SHARK_PCT = 1;
function shPaperGain() {
  if (!A || !Array.isArray(A.venues)) return null;
  const L = connected().filter((v) => v.paper && num(v.paperStartUsd) > 0);
  const put = L.reduce((s, v) => s + num(v.paperStartUsd) + num(v.paperAddedUsd), 0);
  if (!(put > 0)) return null;
  const made = L.reduce((s, v) => s + num(v.usd), 0) - put;
  return { usd: made, pct: (made / put) * 100, accounts: L.length };
}
/* the sharks the paper accounts earned: whole steps toward zero (+1.9% one, −0.4% none, −1.2% one fewer) */
const shSharkBonus = (g) => (g ? Math.trunc(g.pct / SH_SHARK_PCT) || 0 : 0);
function shSharks(ocean = typeof OCEAN !== "undefined" ? OCEAN : null) {
  if (!ocean || typeof ocean.bonus !== "function") return;
  const g = shPaperGain();
  const n = shSharkBonus(g);
  const was = SH.sharks;
  const before = SH.sharkCount;
  SH.sharks = n;
  SH.sharkCount = ocean.bonus(n);
  // said when the water really changed for it (not at the most or the fewest already, and not on the page's first reading)
  const d = SH.sharkCount - before;
  if (was === null || was === n || !g || !d || Math.sign(d) !== Math.sign(n - was)) return;
  const pct = `${g.pct < 0 ? "−" : "+"}${Math.abs(g.pct).toFixed(Math.abs(g.pct) < 1 ? 2 : 1)}%`;
  toast(`${Math.abs(d) === 1 ? "A shark" : `${Math.abs(d)} sharks`} ${d > 0 ? "joined" : "left"} the water: your paper accounts stand at ${pct} since they started — a shark for each whole 1%.`, "info");
}
/* the sharks in a sentence, for the paper book (ui/portfolio.js): how many swim, and why — or "" where no paper account says its start */
function shSharkWords() {
  const g = shPaperGain();
  if (!g || !(SH.sharkCount > 0)) return "";
  const n = shSharkBonus(g);
  return `${plural(SH.sharkCount, "shark")} in the water — one more for each 1% your paper accounts make since they started (twelve at most), one fewer for each 1% lost${n ? `; they are ${n > 0 ? "up" : "down"} ${Math.abs(g.pct).toFixed(1)}%: ${n > 0 ? "+" : "−"}${Math.abs(n)}` : ""}.`;
}
/* the top bar's New York time: the account's own clock as last read, moved on by the time since that read — while the stream is connected
   the read comes minutes apart, and the stamp is never that far behind */
function drawStamp() {
  if (!A) return;
  const ms = Date.parse(A.now) + (loadedAt > 0 ? Math.max(0, Date.now() - loadedAt) : 0);
  setText($("stamp"), `${ny(ms, { weekday: "short", day: "numeric", month: "short" }).replace(",", "")} · ${nyTime(ms)} New York`);
}
const count = (id, n, label) => {
  const el = $(id);
  el.hidden = !n;
  el.textContent = n ? String(n) : "";
  el.title = n ? label : "";
};

/* pairing: on a server that moves real money the first browser pairs with the code the terminal printed; a code half typed is not wiped
   by a refresh (the banner is drawn again only when this browser's role changes). A browser signed out says so, and signs in again only
   when asked to (Owner.signIn): a new key, then the code — or a wait for another device of the owner's */
function drawBanner(owner) {
  const b = $("banner");
  if (b.dataset.role === Owner.role) return;
  b.dataset.role = Owner.role;
  b.hidden = owner;
  if (Owner.role === "signed-out") {
    b.innerHTML = '<div class="codeform"><span>You signed out of this browser: it no longer signs for the account, and its key is deleted.</span><button type="button" class="btn btn-primary" id="sign-in">Sign in</button></div>';
    $("sign-in").addEventListener("click", async () => {
      await Owner.signIn();
      await load();
    });
  } else if (Owner.role === "needs-code") {
    b.innerHTML = '<form id="code-form" class="codeform"><label for="code-in">Enter the pairing code shown in the terminal the account runs in — running in the background, <span class="mono">npm run account:service -- code</span> shows it.</label><input id="code-in" name="code" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" spellcheck="false" required /><button type="submit" class="btn btn-primary">Pair</button><span class="msg" id="code-msg" role="status"></span></form>';
    $("code-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await Owner.ready($("code-form").elements.code.value);
      if (r.refusal) return void (($("code-msg").className = "msg no"), ($("code-msg").textContent = r.refusal));
      await load();
    });
  } else b.textContent = Owner.role === "pending" ? "This browser can look but not sign. Add it under Devices from your other browser." : owner ? "" : "This browser can't make a signing key, so it can only look.";
}

/* a restart: what the account brought back from its ledgers, and what it could not */
function drawRestoreNotice() {
  const r = A.restore;
  const el = $("restored");
  if (!r) return void (el.hidden = true);
  const back = r.venues.filter((v) => v.ok);
  // a venue the restart found refusing this network, or not answering, waits on the account and has its row under Venues: counted here,
  // not listed as a miss
  const waiting = r.venues.filter((v) => v.waiting);
  const missed = r.venues.filter((v) => !v.ok && !v.waiting && v.why !== "connecting again");
  el.hidden = false;
  paint(el, `${r.state === "restoring" ? "Restoring after a restart…" : `Continued after a restart: ${back.length} of ${plural(r.venues.length, "account")} connected again`}${waiting.length ? ` · ${waiting.length} waiting for ${waiting.length === 1 ? "its venue" : "their venues"} (see Venues)` : ""}${r.orders + r.payments ? ` · ${plural(r.orders + r.payments, "transaction")} followed again` : ""}${missed.length || r.skipped.length ? `<details class="inl"><summary>details</summary>${[...missed.map((v) => `${nameOf(v.venue) || v.venue}: ${v.why}`), ...r.skipped].map((x) => `<div>${esc(x)}</div>`).join("")}</details>` : ""}`);
}

/* what was done, or refused, said once: as a toast, and in the open sheet when it came from there */
function speak() {
  if (flash || said) {
    const m = SHEET && $("sheet").querySelector("[data-sheet-msg]");
    if (m) {
      m.className = `msg sheet-msg ${flash ? "no" : "ok"}`;
      m.innerHTML = flash ? esc(flash) : sayHtml(said);
    }
    if (flash) toast(flash, "no");
    else toast({ html: sayHtml(said) }, "ok");
  }
  flash = "";
  said = "";
}

// ---- the panes -------------------------------------------------------------------------------

/** the visible pane, by its own renderer (renderPortfolio in portfolio.js, renderMarkets in markets.js, renderTrade in trade.js); a pane that
 * fails to draw, or whose script did not load, says so where it would have been */
function drawPane(L, owner) {
  const tab = ROUTE.tab;
  const el = $(`pane-${tab}`);
  const draw = { portfolio: typeof renderPortfolio === "function" ? renderPortfolio : null, venues: typeof renderVenues === "function" ? renderVenues : null, memory: typeof renderMemory === "function" ? renderMemory : null, markets: typeof renderMarkets === "function" ? renderMarkets : null, trade: typeof renderTrade === "function" ? renderTrade : null, desk: typeof renderDesk === "function" ? renderDesk : null, superagent: typeof renderSuperagent === "function" ? renderSuperagent : null }[tab];
  try {
    if (!draw) throw new Error(`its script did not load. Reload the page`);
    draw({ el, owner, lens: lensNow(), params: ROUTE.params });
  } catch (err) {
    console.error(err);
    // the superagent's chart reads and listens while it is mounted: a pane that failed to draw lets it go before it is written over
    if (tab === "superagent" && typeof sgUnmount === "function") {
      try {
        sgUnmount();
      } catch (e) {
        console.error(e);
      }
    }
    el.innerHTML = `<p class="pane-error" role="alert">This part of the page could not be drawn: ${esc((err && err.message) || err)}</p>`;
  }
}

/* the route: the pane it names is shown, the rail marks it, the search shows what Markets is searching for. Moving between panes, the one
   named comes in drawn — it rises 8 px as it fades in (180 ms) — over the one going out, which fades (120 ms); both stand in one grid cell
   meanwhile (shell.css .panes), so nothing under them moves. The rail's pill slides to the tab. Under reduced motion it is a cut */
onRoute((tab, params, moved) => {
  // the page's first route (a link straight to a pane) is drawn as it is: motion is for moving between panes
  const motion = moved && !still() && RAIL.routed;
  RAIL.routed = true;
  for (const s of document.querySelectorAll("section[data-pane]")) {
    if (s.dataset.pane === tab) paneIn(s, motion);
    else if (motion && !s.hidden && !s.paneGoing) paneOut(s);
    else if (!s.paneGoing) s.hidden = true;
  }
  // the trading area: its look (html[data-area], ui/tokens.css), the switch saying which mode shows (never disabled: Superagent with no
  // paper account or no desk shows its own setup), the rail's Trade current in both modes. Its link: from outside the area, the mode used
  // last (a read only); inside it, the place showing — the item the viewer is on is current, and pressing it never swaps the mode (the
  // browser's Back, or a link to #/trade?kind=…, can show Regular while the mode kept is Superagent, and the other way round)
  const area = TRADE_AREA.includes(tab);
  if (area) document.documentElement.dataset.area = "trade";
  else delete document.documentElement.dataset.area;
  for (const b of document.querySelectorAll("#trade-mode button[data-trade-mode]")) b.setAttribute("aria-pressed", String((b.dataset.tradeMode === "superagent") === (tab === "superagent")));
  const railTab = area ? "trade" : tab;
  for (const a of document.querySelectorAll(".rail-nav a[data-tab]")) {
    if (a.dataset.tab === railTab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const railTrade = document.querySelector('.rail-nav a[data-tab="trade"]');
  if (railTrade) railTrade.setAttribute("href", area ? hashOf(tab, params) : tradeModeLast() === "superagent" ? hashOf("superagent") : "#/trade");
  // the Account's three under its own header, the wallet at the rail's foot marked while one of them is shown; Markets and Trade keep the search
  const account = ACCOUNT_TABS.includes(tab);
  $("main").dataset.at = account ? "account" : "trading";
  for (const a of document.querySelectorAll(".acct-tabs a[data-acct]")) {
    if (a.dataset.acct === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  // the desk is the rail's Agents: that button is marked, not the wallet
  if (account && tab !== "desk") $("rail-wallet").setAttribute("aria-current", "page");
  else $("rail-wallet").removeAttribute("aria-current");
  if (tab === "desk") $("open-agents").setAttribute("aria-current", "page");
  else $("open-agents").removeAttribute("aria-current");
  railPill(motion);
  if (document.activeElement !== $("search")) $("search").value = tab === "markets" ? params.q || "" : "";
  if (moved) window.scrollTo(0, 0);
  if (A) drawPane(connected(), owns());
});
window.addEventListener("hashchange", routed);
const PANE_EASE = "cubic-bezier(.2, .8, .2, 1)";
/* a pane coming in: shown at once, and — moving — rising 8 px as it fades in, from the frame its content is drawn in */
function paneIn(s, motion) {
  if (s.paneGoing) {
    s.paneGoing.cancel();
    s.paneGoing = null;
  }
  s.classList.remove("pane-out");
  s.inert = false;
  s.hidden = false;
  if (!motion || typeof s.animate !== "function") return;
  const a = s.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: PANE_EASE });
  // what its reads bring meanwhile is drawn once it has come in (core paneLater)
  const coming = { later: [] };
  PANE_IN.set(s.dataset.pane, coming);
  const done = () => {
    if (PANE_IN.get(s.dataset.pane) === coming) PANE_IN.delete(s.dataset.pane);
    for (const fn of coming.later.splice(0)) fn();
  };
  a.finished.then(done, done);
}
/* a pane going out: it fades (120 ms) under the one coming in, deaf to the pointer and out of the reading order, then it is hidden */
function paneOut(s) {
  if (typeof s.animate !== "function") return void (s.hidden = true);
  s.classList.add("pane-out");
  s.inert = true;
  const a = s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out", fill: "forwards" });
  s.paneGoing = a;
  a.finished.then(() => {
    if (s.paneGoing !== a) return;
    s.paneGoing = null;
    s.hidden = true;
    s.classList.remove("pane-out");
    s.inert = false;
    a.cancel();
  }, () => {});
}
/* the rail's pill under the tab that is shown: where each tab stands is read after layout (a ResizeObserver), never forced; it slides
   (transform) when the pane moves */
const RAIL = { at: null, routed: false };
function railPill(motion) {
  const nav = document.querySelector(".rail-nav");
  const pill = nav && nav.querySelector(".rail-pill");
  if (!pill || !RAIL.at || !pill.style) return;
  // the trading area's two modes are one item on the rail: Trade's
  const tab = TRADE_AREA.includes(ROUTE.tab) ? "trade" : ROUTE.tab;
  const i = [...nav.querySelectorAll("a[data-tab]")].findIndex((a) => a.dataset.tab === tab);
  const at = RAIL.at[i];
  // the Account's tabs are marked at the rail's foot: no pill in the nav
  if (!at) return void (pill.hidden = true);
  nav.classList.toggle("moves", !!motion);
  const t = `translateY(${at.top}px)`;
  if (pill.style.transform !== t) pill.style.transform = t;
  const h = `${at.height}px`;
  if (pill.style.height !== h) pill.style.height = h;
  pill.hidden = false;
}
if (typeof ResizeObserver === "function" && document.querySelector(".rail-nav")) {
  new ResizeObserver(() => {
    const links = [...document.querySelectorAll(".rail-nav a[data-tab]")];
    RAIL.at = links.map((a) => ({ top: a.offsetTop, height: a.offsetHeight }));
    railPill(false);
  }).observe(document.querySelector(".rail-nav"));
}

// ---- the top bar ------------------------------------------------------------------------------

/* the lens: All accounts, one connected venue, or one agent — what the panes are narrowed to */
function lensMenu(open) {
  const m = $("lens-menu");
  $("lens").setAttribute("aria-expanded", String(!!open && !!A));
  if (!open || !A) return void (m.hidden = true);
  const keys = A.keys.filter((k) => k.status === "ok" || k.status === "expired");
  const item = (v, label, hint) => `<button type="button" role="menuitemradio" aria-checked="${String(view.lens === v)}" data-lens="${esc(v)}"><span>${esc(label)}</span>${hint ? `<span class="dim">${esc(hint)}</span>` : ""}</button>`;
  const L = connected();
  // the switch between real money and paper: Real money is every account but the paper ones; Paper the paper accounts (offered once one
  // is open; before that, the Portfolio offers to start one)
  const papers = L.filter((v) => v.paper);
  const money2 = papers.length ? `${item("real", "Real money", money(L.filter((v) => !v.paper).reduce((s, v) => s + num(v.usd), 0)))}${item("paper", "Paper", `${money(papers.reduce((s, v) => s + num(v.usd), 0))} · ${plural(papers.length, "paper account")}, no real money`)}` : "";
  m.innerHTML = `${item("", "All accounts", money(A.liveUsd))}${money2}${L.length ? `<div class="menu-h" role="presentation">Accounts</div>${L.map((v) => item(`venue:${v.id}`, v.paper ? String(v.name || "").replace(/\s*[·-]\s*paper\s*$/i, "") || v.name : v.name, v.paper ? `${money(v.usd)} paper` : money(v.usd))).join("")}` : ""}${keys.length ? `<div class="menu-h" role="presentation">Agents</div>${keys.map((k) => item(`agent:${k.address}`, k.name, k.status === "expired" ? "expired" : short(k.address))).join("")}` : ""}`;
  // under its button wherever the top bar put it (the trading area's switch stands before it; a narrow window wraps the bar): placed from
  // the button's own box, read once as the menu opens
  const lens = $("lens");
  if (lens && m.style && Number.isFinite(lens.offsetLeft)) {
    m.style.left = `${lens.offsetLeft}px`;
    m.style.top = `${lens.offsetTop + lens.offsetHeight + 4}px`;
  }
  m.hidden = false;
  (m.querySelector('[aria-checked="true"]') || m.querySelector("button")).focus();
}
$("lens").addEventListener("click", () => lensMenu($("lens-menu").hidden));
$("lens-menu").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-lens]");
  if (!b) return;
  view.lens = b.dataset.lens;
  lensMenu(false);
  $("lens").focus();
  render();
});
$("lens-menu").addEventListener("keydown", (e) => {
  const items = [...$("lens-menu").querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to !== undefined) {
    e.preventDefault();
    items[(to + items.length) % items.length].focus();
  } else if (e.key === "Escape" || e.key === "Tab") {
    if (e.key === "Escape") e.preventDefault();
    lensMenu(false);
    if (e.key === "Escape") $("lens").focus();
  }
});

/* the search lives in the page itself (data-live), so a refresh neither freezes nor wipes it: what is typed goes to Markets */
let searchTimer = 0;
const searchFor = (q, now) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => go("markets", { ...(ROUTE.tab === "markets" ? ROUTE.params : {}), q: q.trim() }, { replace: ROUTE.tab === "markets" }), now ? 0 : 250);
};
$("search").addEventListener("input", () => {
  searchFor($("search").value);
  shPaletteRead($("search").value);
});
$("search").addEventListener("blur", (e) => {
  // the focus going into the palette (↓ to a row) is not a leaving: the menu stays; anywhere else, it closes
  const m = $("search-menu");
  if (!(e.relatedTarget && m && m.contains && m.contains(e.relatedTarget))) shPaletteClose();
  if (ROUTE.tab !== "markets") $("search").value = "";
});
$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  shSearchRemember($("search").value);
  shPaletteClose();
  searchFor($("search").value, true);
});

/* THE SEARCH PALETTE (⌘K): the top matches under the box as it is typed — eight rows at most, each a market as Markets names it (its
   avatar, its short name, what it is, the first venue listing it) with its price and 24 hours, read through the same explore read Markets
   uses (the account keeps an answer thirty seconds) — ↓ from the box into them, ↑ ↓ Home End along them, Enter or a click opens the
   market's drawer, Escape closes; with the box empty, the recent searches kept in this browser (account.searches). Enter in the box keeps
   its meaning: the Markets list filtered by what was typed */
const SH_PAL_MAX = 8;
const SH_RECENT = "account.searches";
let palTimer = 0;
let palBody = null;
let palQ = "";
const shSearchesOf = () => {
  try {
    const v = JSON.parse(localStorage.getItem(SH_RECENT) || "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()).slice(0, SH_PAL_MAX) : [];
  } catch {
    return [];
  }
};
/* a search kept: newest first, once (case apart), eight at most, sixty characters at most; a window with storage off keeps none */
function shSearchRemember(q) {
  const s = String(q || "").trim().slice(0, 60);
  if (!s) return;
  const list = [s, ...shSearchesOf().filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, SH_PAL_MAX);
  try {
    localStorage.setItem(SH_RECENT, JSON.stringify(list));
  } catch {
    // a private window: nothing kept
  }
}
function shSearchesClear() {
  try {
    localStorage.removeItem(SH_RECENT);
  } catch {
    // ditto
  }
}
/* the rows: the matches, or the recent searches while the box is empty, or a word on where the read stands */
function shPaletteRows(body, q) {
  if (!q) {
    const recent = shSearchesOf();
    if (!recent.length) return '<div class="menu-h" role="presentation">Type to search markets · ↓ to the matches · Enter filters the Markets list</div>';
    return `<div class="menu-h" role="presentation">Recent</div>${recent.map((s) => `<button type="button" role="option" data-pal-q="${esc(s)}">${icon("clock")}<span>${esc(s)}</span></button>`).join("")}<button type="button" class="pal-clear" data-pal-clear>Clear</button>`;
  }
  const items = body && Array.isArray(body.items) ? body.items.filter((x) => x && Array.isArray(x.at)).slice(0, SH_PAL_MAX) : [];
  if (!items.length) return `<div class="menu-h" role="presentation">${body ? `Nothing matches “${esc(q)}”` : "Looking…"}</div>`;
  const av = typeof mkAv === "function" ? mkAv : () => "";
  const name = typeof mkShortHtml === "function" ? mkShortHtml : (x) => esc(String(x.name || ""));
  const sub = typeof mkSub === "function" ? mkSub : () => "";
  const price = (x) => (x.kind === "event" ? (typeof mkCents === "function" ? mkCents(x.outcomes && x.outcomes[0] ? x.outcomes[0].price : x.price) : "") : typeof mkUsd === "function" ? mkUsd(x.price) : "");
  const move = (x) => (x.kind === "event" ? "" : typeof chg === "function" ? chg(x.changePct24h) : "");
  return items.map((x, i) => `<button type="button" role="option" data-pal-i="${i}">${av(x)}<span class="pal-name"><b>${name(x)}</b><span class="dim">${esc([sub(x), x.at[0] && x.at[0].venueName].filter(Boolean).join(" · "))}</span></span><span class="pal-px">${price(x)}${move(x)}</span></button>`).join("");
}
/* where a key goes: ↓ from the box to the first row; ↑ ↓ along the rows, ↑ from the first back to the box; Home and End to the ends. A row
   index, "input", or null for a key that is not the palette's */
function shPaletteNext(key, rows, at, fromInput) {
  if (fromInput) return key === "ArrowDown" && rows > 0 ? 0 : null;
  if (at < 0) return null;
  if (key === "ArrowDown") return Math.min(rows - 1, at + 1);
  if (key === "ArrowUp") return at === 0 ? "input" : at - 1;
  if (key === "Home") return 0;
  if (key === "End") return rows - 1;
  return null;
}
function shPaletteDraw() {
  const m = $("search-menu");
  if (!m) return;
  m.innerHTML = shPaletteRows(palBody, palQ);
  m.hidden = false;
  $("search").setAttribute("aria-expanded", "true");
  // under the box, wherever the top bar put it: placed from the box's own box, as the lens's menu is
  const f = $("search-form");
  if (f && m.style && Number.isFinite(f.offsetLeft)) {
    m.style.left = `${f.offsetLeft}px`;
    m.style.top = `${f.offsetTop + f.offsetHeight + 4}px`;
    m.style.width = `${Math.max(320, f.offsetWidth || 0)}px`;
  }
}
/* what was typed: the recent searches at once while it is empty, else the matches after a quarter second, the latest typing winning */
function shPaletteRead(q) {
  palQ = String(q || "").trim();
  clearTimeout(palTimer);
  if (!palQ) {
    palBody = null;
    return void shPaletteDraw();
  }
  shPaletteDraw();
  palTimer = setTimeout(async () => {
    const asked = palQ;
    const body = await api(`/api/account/explore?q=${encodeURIComponent(asked)}&limit=${SH_PAL_MAX}`, { ttl: 20_000 });
    if (asked !== palQ) return;
    palBody = body && body.ok !== false && Array.isArray(body.items) ? body : { items: [] };
    shPaletteDraw();
  }, 250);
}
function shPaletteClose() {
  const m = $("search-menu");
  if (!m || m.hidden) return;
  m.hidden = true;
  $("search").setAttribute("aria-expanded", "false");
}
/* a row chosen: the market's drawer, and the search remembered; a recent search typed back into the box; Clear */
function shPaletteChoose(b) {
  if (!b || !b.dataset) return;
  if (b.dataset.palClear !== undefined) {
    shSearchesClear();
    return void shPaletteDraw();
  }
  if (b.dataset.palQ !== undefined) {
    $("search").value = b.dataset.palQ;
    searchFor(b.dataset.palQ, true);
    shPaletteRead(b.dataset.palQ);
    return void $("search").focus();
  }
  const item = palBody && Array.isArray(palBody.items) ? palBody.items[Number(b.dataset.palI)] : null;
  if (!item) return;
  shSearchRemember(palQ);
  shPaletteClose();
  if (typeof openMarket === "function") openMarket(item);
}
$("search").addEventListener("focus", () => shPaletteRead($("search").value));
$("search").addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const m = $("search-menu");
  if (e.key === "Escape") {
    if (m && !m.hidden) {
      e.preventDefault();
      shPaletteClose();
    }
    return;
  }
  const rows = m && !m.hidden ? [...m.querySelectorAll("button[role='option']")] : [];
  const to = shPaletteNext(e.key, rows.length, -1, true);
  if (to === null) return;
  e.preventDefault();
  rows[to].focus();
});
/* the menu keeps the box's focus on a press (so a click on a row is not a blur first), closes when the focus leaves it for anywhere but
   the box, and takes its own keys */
$("search-menu").addEventListener("pointerdown", (e) => e.preventDefault());
$("search-menu").addEventListener("focusout", (e) => {
  const m = $("search-menu");
  if (e.relatedTarget && (e.relatedTarget === $("search") || (m.contains && m.contains(e.relatedTarget)))) return;
  shPaletteClose();
});
$("search-menu").addEventListener("click", (e) => shPaletteChoose(e.target && e.target.closest && e.target.closest("button")));
$("search-menu").addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const rows = [...$("search-menu").querySelectorAll("button[role='option']")];
  if (e.key === "Escape" || e.key === "Tab") {
    if (e.key === "Escape") e.preventDefault();
    shPaletteClose();
    if (e.key === "Escape") $("search").focus();
    return;
  }
  const to = shPaletteNext(e.key, rows.length, rows.indexOf(document.activeElement), false);
  if (to === null) return;
  e.preventDefault();
  if (to === "input") $("search").focus();
  else rows[to].focus();
});

/* the command that connects an agent's MCP seat to this account, as the account gives it (A.agentSetup { command, url }: the path to its MCP
   server written out, so it runs anywhere); on an account that does not give it, the command run from this account's folder */
const agentSetup = () => (A && A.agentSetup && A.agentSetup.command) || `claude mcp add portfolio -e PORTFOLIO_URL=${location.origin} -- npx tsx src/portfolio/mcp.ts`;
async function copySetup() {
  const cmd = agentSetup();
  const given = !!(A && A.agentSetup && A.agentSetup.command);
  await copyText(cmd);
  toast({ html: `Copied: <span class="mono">${esc(cmd)}</span>. Run it ${given ? "where your agent runs" : "in this account's folder"}, then let the agent in under Agents.` }, "info", { ms: 9000 });
}
/* what every account holds, as a CSV file */
function downloadBalances() {
  download(`balances-${A.now.slice(0, 10)}.csv`, [["account", "asset", "amount", "usd", "where", "as_of"], ...connected().flatMap((v) => (v.holdings || []).map((h) => [v.name, h.asset, h.amount, h.usd, h.note || "", v.asOf || A.now]))]);
}
$("open-statement").addEventListener("click", () => A && openStatement());

// ---- the rail ---------------------------------------------------------------------------------

/* the background, kept in this browser (account.html reads it before the first paint) */
function setTheme(t) {
  const v = t === "black" ? "black" : "cream";
  document.documentElement.dataset.theme = v;
  try {
    localStorage.setItem("account.theme", v);
  } catch {
    // a private window: the choice holds for this visit only
  }
}
setTheme(document.documentElement.dataset.theme);
/* the Mode sheet: what each mode does, door by door — opened from here and nowhere else */
$("mode-more").addEventListener("click", () => A && openMode());
/* Agents: the desk pane (ui/desk.js), where every agent is reached from — the sheet (openAgents, agents-mount.js) opens from there */
$("open-agents").addEventListener("click", () => go("desk"));
$("open-settings").addEventListener("click", () => A && openSettings());
$("sign-out").addEventListener("click", () => A && signOutAsk());

/* one click handler for what is drawn over and over: the trading area's Regular · Superagent, a toggle (seg), the mode (the rail's seg
   and the Mode sheet's), a sheet's or the drawer's close button, and a click outside the lens's menu */
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  if (!$("lens-menu").hidden && !t.closest("#lens-menu") && !t.closest("#lens")) lensMenu(false);
  // Regular · Superagent: the mode not showing, pressed, goes there (the paper account Trade is on goes with it to the superagent); the
  // switch itself is never drawn again, so the focus stays on the button pressed
  const tm = t.closest("button[data-trade-mode]");
  if (tm) {
    if (tm.getAttribute("aria-pressed") === "true") return;
    const sup = tm.dataset.tradeMode === "superagent";
    const at = sup && typeof TT !== "undefined" && TT && TT.at && paperVenue(TT.at.venue) ? { venue: TT.at.venue } : {};
    return void setTradeMode(tm.dataset.tradeMode, at);
  }
  const sb = t.closest("[data-seg] button");
  if (sb) {
    if (sb.disabled || sb.getAttribute("aria-pressed") === "true") return;
    const g = sb.closest("[data-seg]");
    for (const x of g.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === sb));
    const fn = SEGS.get(g.dataset.seg);
    if (fn) fn(sb.dataset.v);
    return;
  }
  const md = t.closest("button[data-set-mode]");
  if (md && !md.disabled) return void setMode(md.dataset.setMode);
  if (t.closest("[data-open-settings]")) return void (A && openSettings());
  if (t.closest("[data-sheet-close]")) return void closeSheet();
  if (t.closest("[data-drawer-close]")) closeDrawer();
});

// ---- the sheet, the drawer, the keys --------------------------------------------------------------

/* a sheet (120 ms) and the drawer (160 ms) fade out (shell.css): what they showed stays until the fade is over, then goes — unless the
   same dialog opened again meanwhile, in which case it drew its own content already */
const FADE_MS = 200;
$("modal").addEventListener("close", () => {
  SHEET = null;
  // the close event comes a moment after close(): a dialog that opened again meanwhile keeps its own name
  if (!$("modal").open) $("modal").removeAttribute("aria-labelledby");
  setTimeout(() => {
    if ($("modal").open) return;
    $("sheet").replaceChildren();
    $("modal").classList.remove("wide");
  }, FADE_MS);
});
/* an earlier dialog (connect, move, trade, change an order) draws straight into #modal-form: it replaces whatever sheet was open — or was
   still fading out — and the dialog is then named by that form's own heading (connect.js gives it #modal-form-title) */
new MutationObserver(() => {
  if (!$("modal-form").childElementCount) return;
  $("modal").setAttribute("aria-labelledby", "modal-form-title");
  SHEET = null;
  $("sheet").replaceChildren();
  $("modal").classList.remove("wide");
}).observe($("modal-form"), { childList: true });
$("drawer").addEventListener("close", () => {
  const back = DRAWER && DRAWER.back;
  DRAWER = null;
  setTimeout(() => {
    if (!$("drawer").open) $("drawer").replaceChildren();
  }, FADE_MS);
  if (back && back.isConnected && back.focus) back.focus();
});

/* the search takes the focus: it is Markets' and Trade's, so from the Account's pages it comes with Markets */
function shSearchFocus() {
  if (ACCOUNT_TABS.includes(ROUTE.tab)) go("markets", {});
  $("search").focus();
  $("search").select();
}
/* "/" searches — and ⌘K (Ctrl+K elsewhere) from anywhere on the page, a field included, as every market screen has it — "t" opens the
   ticket, Escape closes the lens's menu or the drawer (a sheet closes on Escape by itself) */
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.altKey) return;
  const modal = $("modal").open || $("ask").open;
  if (e.metaKey || e.ctrlKey) {
    // any other chord is the browser's own
    if (!modal && !e.shiftKey && String(e.key).toLowerCase() === "k") {
      e.preventDefault();
      shSearchFocus();
    }
    return;
  }
  if (e.key === "Escape") {
    if (!$("lens-menu").hidden) return void lensMenu(false);
    if ($("drawer").open && !modal) closeDrawer();
    return;
  }
  const typing = e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
  if (typing || modal) return;
  if (e.key === "/") {
    e.preventDefault();
    shSearchFocus();
  } else if (e.key === "t" && A) {
    e.preventDefault();
    if (typeof openTicket === "function") openTicket({});
    else go("trade");
  }
});

// ---- reading again, and the start ---------------------------------------------------------------

const REFRESH_MS = 20_000;
/* while the account's stream is connected, the fresh read comes this many times further apart: what changes is pushed, and the read is the
   fallback (a figure the account does not push — a price — is read by its own pane's poll) */
const REFRESH_SLOW = 4;
/* a fresh read may come now: nothing is being signed, no sheet or question is open, the page is in view, and nothing is being typed but
   the search. A button or a toggle with the focus (Buy | Sell, a Where row) holds nothing half-typed, so it does not hold the read back */
const TYPING = "input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]";
function quiet() {
  if (busy || document.hidden || $("modal").open || $("ask").open) return false;
  const f = document.activeElement;
  return !(f && f.matches && f.matches(TYPING) && !(f.closest && f.closest("[data-live]")));
}
/* the account went away (a restart): said once as a toast, and shown in the rail — since when — until it answers again */
let unreachable = false;
let unreachableSince = 0;
function drawReach() {
  const el = $("reach");
  if (!el) return;
  el.hidden = !unreachable;
  paint(el, unreachable ? `<span class="chip bad" role="status">Not answering since ${esc(nyTime(unreachableSince))}</span>` : "");
}
async function refresh() {
  try {
    await load();
    // where the user can connect: asked again when older than ten minutes (core readVenues keeps it otherwise)
    readVenues().catch(() => {});
    if (unreachable) toast("The account answers again.", "ok");
    unreachable = false;
  } catch {
    if (!unreachable) {
      unreachableSince = Date.now();
      toast(`The account did not answer. Trying again every ${REFRESH_MS / 1000} seconds.`, "no");
    }
    unreachable = true;
  }
  drawReach();
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && A && Date.now() - loadedAt > REFRESH_MS && quiet()) refresh();
});

// ---- what the account pushes (ui/stream.js) -----------------------------------------------------

/* THE ACCOUNT TELLS THE PAGE AS IT HAPPENS (ui/stream.js; the account's end, account/stream.ts). Each event is applied at once, in place, to
   what the page holds — an order's new state over its row in A.orders, a position over its row in the positions read kept (core api), the
   paper cash over its venue's — and each fill is said as a toast, as Hyperliquid says its own ("Bought 0.5 BTC @ 62,481.7"). What moved is
   drawn in the next frame: the chrome and, in the trading area, the tabs under the panels (positions, open orders, the history tabs) and
   the ticket's Available (ui/terminal.js ttPushed) — never a sheet, the ticket's fields or a field being typed in, so quiet() does not hold
   it back. Then the account is read again, once for a burst (SH_PUSH_MS after its last event): drawn whole when quiet() holds, else only
   what moved, and whole at the next quiet moment (SH.late). The order states pushed are kept a little while (SH_AHEAD_MS) and laid again
   over a read that comes back behind them (the account's door hears of a paper fill at its next poll), so a row never steps back */
const SH_PUSH_MS = 60;
const SH_AHEAD_MS = 30_000;
// …and the paper accounts' sharks asked of the ocean last (null before the first), with the count it gave for them (shSharks)
const SH = { timer: 0, frame: false, loading: false, again: false, late: false, ahead: new Map(), sharks: null, sharkCount: 0 };
const SH_DONE = ["filled", "canceled", "rejected", "expired"];

/* an order's new state: its row in A.orders takes it (the account's own record of it, by its id — or by the client id the account gave it,
   where the book told it before the account recorded it). Its fill is never said from here: every fill comes as a fill of its own — a
   paper account's book tells its own, and the account tells one for every other order that filled more since it last told of it
   (service.ts toldFill: a real venue's, a venue's own paper account's, an agent's that filled as it was placed), whatever the page's copy
   of the order says. Answers whether the account should be read again for it: an order the page did not hold, or one whose status or fill
   moved (what the read brings with it: the cash, the statement, Available). A change the row alone carries — a trailing stop that moved,
   a queued order's note — is drawn in place, and nothing is read */
function shOrder(o) {
  if (!o || !A || !Array.isArray(A.orders)) return false;
  const i = A.orders.findIndex((x) => (o.id && x.id === o.id) || (!!o.clientId && x.clientId === o.clientId && x.venue === o.venue));
  const was = i >= 0 ? A.orders[i] : null;
  // one the account has no record of yet (the book told it first): left for the read that follows
  if (!o.id && !was) return true;
  const next = { ...(was || {}), ...o, ...(was && !o.id ? { id: was.id } : {}) };
  if (i >= 0) A.orders[i] = next;
  else A.orders.unshift(next);
  SH.ahead.set(next.id, { o: next, at: Date.now(), on: A });
  return !was || was.status !== next.status || num(was.filledQty) !== num(next.filledQty);
}
/* the pushed states laid over A.orders as a read brought them: only one further on — more filled, or ended where the read still has it on a
   book. One a read caught up with (the same state, in an A that is a read's and not the page's own copy it was laid on), or older than a
   read can lag, is let go */
function shAhead() {
  if (!A || !Array.isArray(A.orders) || !SH.ahead.size) return;
  const now = Date.now();
  for (const [id, { o, at, on }] of SH.ahead) {
    if (now - at > SH_AHEAD_MS) {
      SH.ahead.delete(id);
      continue;
    }
    if (on === A) continue;
    const i = A.orders.findIndex((x) => x.id === id);
    const x = i >= 0 ? A.orders[i] : null;
    if (x && x.status === o.status && num(x.filledQty) === num(o.filledQty)) {
      SH.ahead.delete(id);
      continue;
    }
    if (x && (num(o.filledQty) > num(x.filledQty) || (SH_DONE.includes(o.status) && !SH_DONE.includes(x.status)))) A.orders[i] = { ...x, status: o.status, filledQty: o.filledQty, ...(o.avgPrice !== undefined ? { avgPrice: o.avgPrice } : {}), ...(o.feeUsd !== undefined ? { feeUsd: o.feeUsd } : {}), ...(o.note ? { note: o.note } : {}) };
  }
}
/* A FILL, SAID: "Bought 0.5 BTC @ 62,481.7 · Paper account" — the side, the size, the market, the price (an event contract's in cents),
   where; a liquidation's or a settlement's own words after it. The price is the fill's own — "avg" after it where the account could give
   only the order's average (service.ts toldFill). Once a fill (core FILLS_SAID: the order's own answer may have said it) */
function shFillToast(f) {
  if (!f || !(num(f.qty) > 0)) return;
  const key = f.clientId ? `${f.clientId}|${num(f.filledQty)}` : `${f.venue || ""}|${f.ref || ""}|${f.at || ""}|${num(f.qty)}`;
  if (FILLS_SAID.has(key)) return;
  fillSaid(key);
  const price = f.price === undefined || f.price === null ? "" : ` @ ${f.kind === "event" ? cents(f.price) : px(f.price)}${f.avg ? " avg" : ""}`;
  // a close says what it made or lost, as HL's trade history's Closed PNL does
  const r = Number(f.realizedUsd);
  const closed = f.realizedUsd !== undefined && f.realizedUsd !== null && Number.isFinite(r) ? ` · closed PNL ${r < 0 ? "−" : "+"}${money(Math.abs(r))}` : "";
  toast(`${f.side === "sell" ? "Sold" : "Bought"} ${qtyOf(f.qty)} ${f.name || f.symbol || ""}${price}${closed}${f.venueName ? ` · ${f.venueName}` : ""}${f.note ? ` · ${f.note}` : ""}`, "ok");
}
/* a position or a holding as it now stands, over its row in the positions read the page keeps (null: gone) — a read on its way is let go
   instead (it is from before), and the next look asks again. The read keeps its own age: a pushed row never lengthens the life of the rows
   it did not change (another venue's marks and PNL are read again when that read is due, however often a paper account fills) */
function shPosition(e) {
  if (!e || !e.venue || !e.symbol) return;
  const path = "/api/account/positions";
  const hit = API.get(path);
  if (hit && !hit.pending && hit.body && hit.body.ok !== false && Array.isArray(hit.body.positions)) {
    const same = (p) => p.venue === e.venue && p.symbol === e.symbol;
    const list = hit.body.positions.slice();
    const i = list.findIndex(same);
    if (e.position && i >= 0) list[i] = e.position;
    else if (e.position) list.push(e.position);
    else if (i >= 0) list.splice(i, 1);
    API.set(path, { ...hit, body: { ...hit.body, positions: list } });
  } else forget(path);
  forget("/api/account/holdings");
}
/* the paper cash, over its venue's row: what the ticket's Available reads */
function shBalance(e) {
  if (!e || !A || !Array.isArray(A.venues) || !Number.isFinite(Number(e.cashUsd))) return;
  const v = A.venues.find((x) => x.id === e.venue);
  const h = v && Array.isArray(v.holdings) ? v.holdings.find((x) => x.asset === "USD" && x.note === "paper money") : null;
  if (!h) return;
  const d = Number(e.cashUsd) - num(h.usd);
  Object.assign(h, { amount: Number(e.cashUsd), usd: Number(e.cashUsd) });
  v.usd = num(v.usd) + d;
  if (v.cashUsd !== undefined) v.cashUsd = num(v.cashUsd) + d;
}
/* each paper book as it last said itself (the paper event: live/paper.ts PaperBookSummary), by venue: what it holds, its positions and its
   open orders, counted — the read after a book's word is asked only when one of them moved, or on a reset (shBookMoved) */
const SH_BOOKS = new Map();
function shBookMoved(e) {
  if (!e || !e.venue) return true;
  const now = `${num(e.holdings)}|${num(e.positions)}|${num(e.open)}`;
  const was = SH_BOOKS.get(e.venue);
  SH_BOOKS.set(e.venue, now);
  if (SH_BOOKS.size > 50) SH_BOOKS.delete(SH_BOOKS.keys().next().value);
  return !!e.reset || was !== now;
}
/* what moved, drawn in the next frame (once for a burst), and — unless `read` is false: a change the patch alone carries — the account
   read again a little later (once for a burst) */
function shSoon(read = true) {
  if (!A) return;
  if (!SH.frame) {
    SH.frame = true;
    nextFrame(() => {
      SH.frame = false;
      shPatch();
    });
  }
  if (!read) return;
  clearTimeout(SH.timer);
  SH.timer = setTimeout(shPushedRead, SH_PUSH_MS);
}
/* what a pushed change moves, drawn in place: the chrome, and the trading area's tabs and Available (ui/terminal.js ttPushed) */
function shPatch() {
  if (!A) return;
  shAhead();
  renderChrome(connected(), owns());
  if (ROUTE.tab === "trade" && typeof ttPushed === "function") ttPushed();
}
/* the account read again after a burst — while an owner action is being signed, its own read comes when it is done (core own) */
async function shPushedRead() {
  SH.timer = 0;
  if (SH.loading) return void (SH.again = true);
  if (busy) return;
  SH.loading = true;
  try {
    await load({ draw: shPushedDraw });
  } catch {
    // the account not answering is the refresh's to say
  } finally {
    SH.loading = false;
    if (SH.again) {
      SH.again = false;
      shSoon();
    }
  }
}
/* the read after a burst drawn: whole when nothing is being typed or signed and no sheet is open; else only what moved, and whole later */
function shPushedDraw() {
  if (quiet()) return void render();
  SH.late = true;
  shPatch();
}

/* A PRICE ALERT FIRED (the account's `alert` event: account/state.ts FiredAlert with its venue's name — markets.js openAlertSheet set it,
   service.ts lookAtAlerts found the price across it): said as a toast that stays a while — "Price alert · BTC/USD at Kraken rose above
   $63,500: $63,512 (Kraken · live)" — and, where the owner asked this browser to (the alert sheet's switch, kept in this browser under
   SH_NOTIFY_KEY, the browser's own permission asked once), as the browser's notification too, so the alert reaches the owner with the tab
   in the background; clicking it opens the Alerts list under Watching. An event contract's prices are said in cents. The account's own
   record of it — the Alerts list, the ledger's note — comes with the read that follows */
const SH_NOTIFY_KEY = "account.alerts.notify";
function shNotifyWanted() {
  try {
    return localStorage.getItem(SH_NOTIFY_KEY) === "1";
  } catch {
    return false;
  }
}
function shNotifySet(on) {
  try {
    if (on) localStorage.setItem(SH_NOTIFY_KEY, "1");
    else localStorage.removeItem(SH_NOTIFY_KEY);
  } catch {
    // a private window keeps nothing: the choice holds for this visit alone
  }
}
/* a fired alert in one sentence: the market, where, which way it went and the figure, the price that fired it, whose price that was */
function shAlertWords(f) {
  const sym = String(f.symbol || "");
  const ev = /:/.test(sym) && !/\//.test(sym);
  const fig = (n) => (ev ? cents(n) : usd(n));
  return `${sym} at ${f.venueName || nameOf(f.venue)} ${f.condition === "above" ? "rose above" : "fell below"} ${fig(f.price)}: ${fig(f.seen)}${f.from ? ` (${f.from})` : ""}`;
}
function shAlertToast(f) {
  if (!f || !f.symbol) return;
  const words = shAlertWords(f);
  toast({ html: `<b>Price alert</b> · ${esc(words)}` }, "info", { ms: 15000 });
  if (!shNotifyWanted() || typeof Notification !== "function" || Notification.permission !== "granted") return;
  try {
    const n = new Notification("Price alert", { body: words, tag: `alert-${f.id || sym}` });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // a window the browser will not raise from here
      }
      go("markets", { tab: "watching" });
    };
  } catch {
    // a browser that shows none: the toast said it
  }
}
/* a listener on the account's stream (ui/stream.js, loaded right after the contract; asked for, as any other script's names are) */
const shOn = (type, fn) => (typeof stOn === "function" ? stOn(type, fn) : () => {});
// an order whose status or fill did not move (a trailing stop's stop moved, a queued order's note) is drawn in place, and not read for
shOn("order", (o) => shSoon(shOrder(o)));
shOn("fill", (f) => {
  shFillToast(f);
  shSoon();
});
shOn("position", (e) => {
  shPosition(e);
  shSoon();
});
shOn("balance", (e) => {
  shBalance(e);
  shSoon();
});
// a paper book started again: nothing kept of it stands. A book that said itself with the same holdings, positions and open orders (its
// look moved a trailing stop, or noted a queued order's wait) is read for nothing: what moved came as its own events
shOn("paper", (e) => {
  if (e && e.reset) afterAction();
  shSoon(shBookMoved(e));
});
shOn("statement", () => {
  forget("/api/account/statement");
  shSoon();
});
shOn("card", () => shSoon());
// a price alert fired: said now (and as this browser's own notification, where the owner asked for that); its record comes with the read
shOn("alert", (f) => {
  shAlertToast(f);
  shSoon();
});
// the stream could not resume from where the page stopped (the account restarted, or more came than it keeps): everything read afresh —
// a share's financials too: the drawer keeps them ten minutes (markets.js), and a refusal read before a restart (the account started
// without SEC_CONTACT, then started again with it) would otherwise stand in the drawer until that time ran out
shOn("snapshot", () => {
  afterAction();
  forget("/api/account/financials");
  shSoon();
});
// focus left a field while a read was drawn only in part: the whole page now
document.addEventListener("focusout", () => {
  if (SH.late) setTimeout(() => SH.late && quiet() && render(), 0);
});

routed();
(async () => {
  await Owner.ready();
  await refresh();
  // the lists Markets and Trade open with, asked for once the page has drawn and the browser is idle: their first visit comes in drawn
  // (paneIn) rather than as a skeleton swapped for its content after the entrance (markets.js mkPrefetch · trade.js tkReadKinds)
  const ahead = () => {
    if (typeof mkPrefetch === "function") mkPrefetch();
    if (typeof tkReadKinds === "function") tkReadKinds();
    // where the user can connect (core VENUES): read before anything offers "Connect to trade"; the pane on screen draws again with it
    readVenues().then(() => drawPane(connected(), owns()));
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(ahead, { timeout: 2000 });
  else setTimeout(ahead, 500);
  // what changes on the account, pushed from here on (ui/stream.js; a browser without event streams goes on by the read below)
  if (typeof stStart === "function") stStart();
  // a refresh due in the middle of a scroll waits for it to rest (its drawing is main-thread work the scroll's frames would wait for); while
  // the stream is connected it is due REFRESH_SLOW times less often — what changes comes pushed (the account's door follows the real
  // venues by itself while a page listens: service.ts watchDoor) — and a page drawn only in part since a pushed read (SH.late) is drawn
  // whole at the first quiet moment. What the stream does not push is kept at its old pace: the trading area's tabs are drawn again from
  // their own reads every tick, in place (ui/terminal.js ttPushed: the positions as read — their marks and PNL follow their markets'
  // pushed prices between reads, ttLiveRow), and the top bar's clock moves on with the page's
  setInterval(() => {
    // polling: every tick, as always; connected: only once nothing was read for the last ticks (a pushed change's read counts)
    const pushed = typeof stHealth === "function" && stHealth() === "connected";
    if (A && (!pushed || Date.now() - loadedAt >= REFRESH_MS * (REFRESH_SLOW - 1)) && quiet()) whenStill(() => quiet() && refresh());
    else if (A && SH.late && quiet()) render();
    else if (A && pushed) {
      drawStamp();
      if (ROUTE.tab === "trade" && typeof ttPushed === "function") ttPushed();
    }
  }, REFRESH_MS);
})();
