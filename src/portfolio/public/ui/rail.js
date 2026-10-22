/* THE RAIL'S WATCH (the left rail, under Markets · Trade · Agents): what the owner keeps an eye on, from any tab — the markets starred in
   Markets, each priced fresh where its venue is connected (the same quotes read Markets makes for the rows on screen: at most twelve
   markets every five seconds, only while the page is in view and the rail is laid out — the narrow strip hides the watch and asks nothing),
   the books in a line each (open orders; positions, and what they are up or down; the paper accounts' result since they started), and under
   Agents how many there are. Nothing here is a read of its own kind: the explore read Markets' Watching tab makes (MKT_ALL) names the
   markets, the quotes read prices them, the positions read is the Portfolio's, each through the page's own cache (core api). The shell
   draws it with the rest of the chrome (shell.js renderChrome → rlDraw) and starts its clock at the page's start (rlStart). markets.js is
   loaded before this; where it is not (a test of the shell alone) the rail draws what it can without it */
const RL_POLL_MS = 5_000;
const RL_MOST = 12;
const RL_ITEMS_TTL = 60_000;
const RL_POS_TTL = 20_000;
const RL_ALL = "/api/account/explore?limit=200";
const RL = { timer: 0, items: null, positions: null, rows: [], started: false };

/* the rail's watch is laid out: a wide window (the narrow strip hides it: shell.css) */
function rlShown() {
  const el = typeof $ === "function" ? $("rail-watch") : null;
  if (!el) return false;
  return typeof el.getClientRects !== "function" || el.getClientRects().length > 0;
}
/* the watchlist, the newest star first */
const rlWatch = (watch) => (Array.isArray(watch) ? watch : []).filter((w) => w && w.venue && w.symbol).slice().sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
/** the markets to price: the watched ones at venues connected live (a public listing's price is the list's own), at most twelve */
function rlPairs(watch) {
  const live = (w) => (typeof mkVenue === "function" ? !!mkVenue(w.venue) : true);
  return rlWatch(watch).filter(live).slice(0, RL_MOST).map((w) => `${w.venue}|${w.symbol}`);
}
/* a watched market as a row: its item where the list carries it, else a stand-in named by its symbol (as Markets' Watching tab does) */
function rlItemOf(w, items, body) {
  const hit = typeof mkIsWatch === "function" ? items.find((x) => mkIsWatch(x, w)) : null;
  if (hit) return hit;
  if (typeof mkPseudo === "function" && A) return mkPseudo(w, body);
  const ev = /:/.test(w.symbol) && !/\//.test(w.symbol);
  return { key: `watch:${w.venue}|${w.symbol}`, kind: ev ? "event" : "coin", name: w.symbol, base: w.symbol.split(/[/@:]/)[0], at: [{ venue: w.venue, venueName: w.venue, symbol: w.symbol, connected: false, canTrade: false, public: true }] };
}
/** the watched markets as rows: the avatar, the name, where it is priced, the price (fresh where its venue is connected — then the
 * figure carries data-q, and Markets' own ticks move it — else the list's), the 24h move, and a bell with the alerts on it (amber once one
 * fired). None starred: how to star one */
function rlRows(watch, items, body) {
  const list = rlWatch(watch);
  RL.rows = [];
  if (!list.length) return '<p class="rl-empty">Star a market in <a class="link" href="#/markets">Markets</a> to watch it here.</p>';
  const rows = list.map((w) => {
    const item = rlItemOf(w, items, body);
    const i = RL.rows.push(item) - 1;
    const ev = item.kind === "event";
    const oi = ev && Array.isArray(item.outcomes) ? item.outcomes.findIndex((o) => (o.at || []).some((l) => l.symbol === w.symbol)) : -1;
    const o = oi >= 0 ? item.outcomes[oi] : null;
    const v = typeof mkVenue === "function" ? mkVenue(w.venue) : null;
    const key = `${w.venue}|${w.symbol}`;
    const m = v && typeof mkFresh === "function" ? mkFresh(key) : null;
    const price = m ? (typeof mkFmt === "function" ? mkFmt(m, ev ? "c-last" : "usd") : usd(m.price ?? m.ask)) : ev ? cents(o ? o.price : item.price) : usd(item.price);
    const move = ev ? chg(o && o.change24h !== undefined ? o.change24h * 100 : undefined, "¢") : chg(item.changePct24h);
    const where = v ? v.name : typeof mkAtOf === "function" ? mkAtOf(item, w.venue).venueName : w.venue;
    const alerts = typeof mkAlertsOf === "function" ? mkAlertsOf(item).length : 0;
    const fired = typeof mkFiredOf === "function" ? mkFiredOf(item).length : 0;
    const bell = alerts || fired ? `<span class="rl-bell${fired ? " warm" : ""}" title="${esc(fired ? `${plural(fired, "alert")} fired` : plural(alerts, "price alert"))}">${icon("bell", "sm")}${fired || alerts}</span>` : "";
    const name = typeof mkShortHtml === "function" ? mkShortHtml(item) : esc(item.name);
    const av = typeof mkAv === "function" ? mkAv(item, "sm") : avatar(item.base || item.name, "sm");
    return `<button type="button" class="rl-row" data-rl-i="${i}" data-k="${esc(key)}" title="${esc(item.name)}">${av}<span class="rl-name">${name}${bell}</span><span class="rl-px"${v ? ` data-q="${esc(key)}" data-fmt="${ev ? "c-last" : "usd"}"` : ""}>${price}</span><span class="rl-where">${esc(where)}</span><span class="rl-chg">${move}</span></button>`;
  });
  return `<div class="rl-h"><span>Watching</span><a class="link dim" href="#/markets?tab=watching">All →</a></div>${rows.join("")}`;
}
/** the books in a line each — the open orders, the positions with what they are up or down (where the venues say it), the paper accounts'
 * result since they started (shell.js shPaperGain) — each a way to the Portfolio; "" where nothing is on them */
function rlBooksHtml(a, positions) {
  if (!a) return "";
  const lines = [];
  const open = (Array.isArray(a.orders) ? a.orders : []).filter((o) => isLive(o)).length;
  if (open) lines.push(["Open orders", `<b>${open}</b>`]);
  const pos = Array.isArray(positions) ? positions : [];
  if (pos.length) {
    const said = pos.filter((p) => Number.isFinite(Number(p.unrealizedUsd)));
    const up = said.reduce((s, p) => s + Number(p.unrealizedUsd), 0);
    lines.push(["Positions", `<b>${pos.length}</b>${said.length ? ` ${chg(up, "$")}` : ""}`]);
  }
  const g = typeof shPaperGain === "function" ? shPaperGain() : null;
  if (g) lines.push(["Paper", chg(g.pct)]);
  return lines.map(([k, v]) => `<a class="rl-line" href="#/portfolio"><span>${k}</span><span class="rl-v">${v}</span></a>`).join("");
}
/** the rail drawn from what the page has: the watch, the books (hidden with nothing on them), how many agents (shell.js renderChrome) */
function rlDraw() {
  if (!A || typeof $ !== "function") return;
  const watch = $("rail-watch");
  if (!watch) return;
  const body = RL.items;
  const items = body && typeof mkRows === "function" ? mkRows(body) : body && Array.isArray(body.items) ? body.items : [];
  paint(watch, rlRows(A.watch, items, body));
  const books = $("rail-books");
  if (books) {
    const html = rlBooksHtml(A, RL.positions);
    books.hidden = !html;
    paint(books, html);
  }
  const sub = $("rail-agents-sub");
  if (sub) setText(sub, Array.isArray(A.keys) && A.keys.length ? plural(A.keys.length, "agent") : "");
}
/* the reads, only while the page is in view and the rail is laid out: the names once a minute, the prices every tick (written where
   Markets keeps them, so its rows and the rail's tick together), the positions every twenty seconds; then the rail drawn again */
async function rlPoll() {
  if (!A || (typeof document !== "undefined" && document.hidden) || !rlShown()) return;
  const reads = [];
  const watch = rlWatch(A.watch);
  if (watch.length) {
    reads.push(api(typeof MKT_ALL === "string" ? MKT_ALL : RL_ALL, { ttl: RL_ITEMS_TTL }).then((body) => {
      if (body && body.ok !== false && Array.isArray(body.items)) RL.items = body;
    }));
    const pairs = rlPairs(watch);
    if (pairs.length && typeof MKT === "object" && MKT && MKT.quotes) {
      reads.push(api(`/api/account/quotes?pairs=${encodeURIComponent(pairs.join(","))}`).then((body) => {
        if (!body || body.ok === false || !Array.isArray(body.quotes)) return;
        const now = Date.now();
        for (const q of body.quotes) if (q && q.market) MKT.quotes.set(`${q.venue}|${q.symbol}`, { at: now, market: q.market });
        if (typeof mkPrices === "function") mkPrices();
      }));
    }
  }
  reads.push(api("/api/account/positions", { ttl: RL_POS_TTL }).then((body) => {
    if (body && body.ok !== false && Array.isArray(body.positions)) RL.positions = body.positions;
  }));
  await Promise.all(reads);
  rlDraw();
}
/* a row pressed: the market's drawer (markets.js openMarket), or Markets' Watching tab where this page has no drawer */
function rlOpen(i) {
  const item = RL.rows[Number(i)];
  if (!item) return;
  if (typeof openMarket === "function" && Array.isArray(item.at) && item.at.length) openMarket(item);
  else go("markets", { tab: "watching" });
}
function rlTick() {
  clearTimeout(RL.timer);
  RL.timer = setTimeout(rlTick, RL_POLL_MS);
  rlPoll().catch((err) => console.error(err));
}
/** the rail's clock, started once with the page: a tick now and every five seconds, one at once when the page comes back into view; the
 * rows heard from here */
function rlStart() {
  if (RL.started) return;
  RL.started = true;
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => !document.hidden && rlTick());
    document.addEventListener("click", (e) => {
      const b = e.target && typeof e.target.closest === "function" ? e.target.closest("[data-rl-i]") : null;
      if (b) rlOpen(b.dataset.rlI);
    });
  }
  rlTick();
}
