/* THE MONITOR (the rail's Monitor, #/monitor; MON on the command line): one screen of tiles the owner composes, as a terminal's launchpad —
   a market with its price, its day's change and its day's line (the Markets page's own chart, GET /api/account/explore?key= and
   /api/account/candles), a board of the World page (GET /api/account/world, drawn by ui/world.js), the headlines of a topic (GET
   /api/account/news, drawn by ui/news.js), today's calendar of a kind (GET /api/account/calendar, drawn by ui/calendar.js), or an option
   chain's nearest expiry in figures (GET /api/account/options, drawn by ui/options.js). Nothing here is read twice: every tile asks the
   same reads its page does, kept the same while. The layout is the address (#/monitor?tiles=w=indices,m=coin:BTC,…), remembered in this
   browser; three presets to start from; a market joins from the command line (AAPL MON). Read again every fifteen seconds while the page
   shows; drawn in place. Nothing here is the account's own figure */
const MON = { ctx: null, el: null, timer: 0, data: new Map(), pending: new Set() };
const MON_AGAIN_MS = 15_000;
const MON_MOST = 12;
const MON_KEY = "mon.tiles";
const MON_WORLD = ["indices", "rates", "fx", "commodities"];
const MON_NEWS = ["markets", "macro", "crypto", "companies"];
const MON_CAL = ["economic", "earnings", "dividends", "splits", "ipos"];
const MON_MARKET = /^[a-z]+:[A-Za-z0-9._:/|@-]{1,60}$/;
const MON_SYMBOL = /^[A-Z][A-Z.]{0,5}$/;
const MON_PRESETS = {
  desk: ["w=indices", "w=rates", "m=coin:BTC", "n=markets", "c=economic", "o=SPX"],
  macro: ["w=indices", "w=rates", "w=fx", "w=commodities", "n=macro", "c=economic"],
  crypto: ["m=coin:BTC", "m=coin:ETH", "w=commodities", "n=crypto", "o=BTC", "o=ETH"],
};
const MON_TTL = { m: 10_000, candles: 30_000, w: 10_000, n: 120_000, c: 300_000, o: 15_000 };

/* a layout's words, checked: at most twelve tiles, each a kind and what it shows, no tile twice; the kinds m (a market by its key), w (a
   board), n (a topic), c (a calendar), o (a symbol) */
function monParse(text) {
  const out = [];
  for (const raw of String(text || "").split(",")) {
    const m = /^([mwnco])=(.+)$/.exec(raw.trim());
    if (!m) continue;
    const kind = m[1];
    let arg = m[2].trim();
    if (kind === "m" && !MON_MARKET.test(arg)) continue;
    if (kind === "w" && !MON_WORLD.includes(arg)) continue;
    if (kind === "n" && !MON_NEWS.includes(arg)) continue;
    if (kind === "c" && !MON_CAL.includes(arg)) continue;
    if (kind === "o") {
      arg = arg.toUpperCase().replace(/^\^/, "");
      if (!MON_SYMBOL.test(arg)) continue;
    }
    if (out.some((t) => t.kind === kind && t.arg === arg)) continue;
    out.push({ kind, arg });
    if (out.length >= MON_MOST) break;
  }
  return out;
}
const monWords = (tiles) => tiles.map((t) => `${t.kind}=${t.arg}`).join(",");
/* the tiles to show: the address's, else this browser's last, else the desk preset */
function monTiles(params) {
  const fromRoute = params && params.tiles !== undefined ? monParse(params.tiles) : null;
  if (fromRoute && fromRoute.length) return fromRoute;
  let kept = "";
  try {
    kept = String(localStorage.getItem(MON_KEY) || "");
  } catch {
    kept = "";
  }
  const stored = kept ? monParse(kept) : [];
  return stored.length ? stored : monParse(MON_PRESETS.desk.join(","));
}
function monKeep(tiles) {
  try {
    localStorage.setItem(MON_KEY, monWords(tiles));
  } catch {
    /* a browser that keeps nothing: the address still says */
  }
}
/* what a tile reads */
function monPath(t) {
  if (t.kind === "m") return `/api/account/explore?key=${encodeURIComponent(t.arg)}`;
  if (t.kind === "w") return "/api/account/world";
  if (t.kind === "n") return `/api/account/news?topic=${t.arg}&limit=8`;
  if (t.kind === "c") return `/api/account/calendar?kind=${t.arg}&limit=12`;
  return `/api/account/options?symbol=${encodeURIComponent(t.arg)}`;
}
function monFetch(path, ttl) {
  const hit = MON.data.get(path);
  if (MON.pending.has(path) || (hit && Date.now() - hit.at < ttl)) return;
  MON.pending.add(path);
  api(path, { ttl, timeout: 30_000 }).then((body) => {
    MON.pending.delete(path);
    const was = MON.data.get(path);
    const ok = !!body && body.ok !== false;
    MON.data.set(path, { at: Date.now(), body, good: ok ? body : was ? was.good : null });
    if (ROUTE.tab === "monitor" && MON.ctx) paneLater("monitor", monRedraw);
  });
}
const monRedraw = () => {
  if (ROUTE.tab === "monitor" && MON.ctx) renderMonitor({ ...MON.ctx, params: ROUTE.params });
};
const monGood = (path) => (MON.data.get(path) || {}).good || null;
const monFailed = (path) => {
  const d = MON.data.get(path);
  return d && d.body && d.body.ok === false ? refusalOf(d.body) || "the account did not answer" : "";
};
const monSkel = '<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel" style="width:70%"></span></div>';
const monLater = (why) => `<p class="small dim mon-why">${esc(why)}</p>`;

/* a tile's title and where it opens */
function monTitle(t, good) {
  if (t.kind === "m") return (good && good.items && good.items[0] && good.items[0].name) || t.arg.slice(t.arg.indexOf(":") + 1);
  if (t.kind === "w") return { indices: "Indices", rates: "Yield curve", fx: "Currencies", commodities: "Commodities" }[t.arg];
  if (t.kind === "n") return `News · ${t.arg[0].toUpperCase()}${t.arg.slice(1)}`;
  if (t.kind === "c") return `Today · ${{ economic: "Economic", earnings: "Earnings", dividends: "Dividends", splits: "Splits", ipos: "IPOs" }[t.arg]}`;
  return `${t.arg} options`;
}
/* a market: its price and its day's change as the Markets page says them, the venue it is read at, its day's line */
function monMarketHtml(t) {
  const path = monPath(t);
  const good = monGood(path);
  const it = good && Array.isArray(good.items) ? good.items[0] : null;
  if (!it) return monFailed(path) ? monLater(`Couldn't read it: ${monFailed(path)}.`) : good ? monLater("No market by this key is listed just now.") : monSkel;
  const leg = typeof mkCandleLeg === "function" ? mkCandleLeg(it) : null;
  let line = "";
  if (leg) {
    const cpath = `/api/account/candles?${new URLSearchParams({ venue: leg.venue, symbol: leg.symbol, interval: "5m", range: "1D" })}`;
    monFetch(cpath, MON_TTL.candles);
    const series = typeof mkSeriesOf === "function" ? mkSeriesOf(monGood(cpath)) : null;
    line = series && typeof mkChart === "function" ? mkChart(series, it.kind === "event", it.kind === "stock") : monGood(cpath) ? "" : '<div class="skel mon-skel-line" aria-hidden="true"></div>';
  }
  const at = Array.isArray(it.at) && it.at[0] ? it.at[0] : null;
  const price = Number.isFinite(Number(it.price)) ? (typeof mkUsd === "function" ? mkUsd(it.price) : String(it.price)) : "—";
  return `<p class="mon-px"><span class="mon-num">${esc(price)}</span> ${chg(it.changePct24h)}${at ? `<span class="dim small"> · ${esc(at.venueName || at.venue || "")}${at.session && at.session.open === false ? " · closed" : ""}</span>` : ""}</p>${line}`;
}
/* a board of the World page, drawn by its own functions */
function monWorldHtml(t) {
  const path = monPath(t);
  const good = monGood(path);
  if (!good) return monFailed(path) ? monLater(`Couldn't read the boards: ${monFailed(path)}.`) : monSkel;
  if (t.arg === "indices") return typeof wdIndicesHtml === "function" ? wdIndicesHtml((good.indices || []).slice(0, 8)) : "";
  if (t.arg === "rates") {
    const r = good.rates || {};
    const sp = r.spreads || {};
    const spreads = ["2s10s", "3m10y", "5s30s"].filter((k) => Number.isFinite(Number(sp[k]))).map((k) => `<span class="wd-spread"><span class="label">${k}</span> <b class="${sp[k] < 0 ? "down" : ""}">${typeof wdBp === "function" ? wdBp(sp[k]) : sp[k]}</b></span>`).join("");
    return `${typeof wdCurveSvg === "function" ? wdCurveSvg(r) : ""}${spreads ? `<p class="wd-spreads">${spreads}</p>` : ""}<p class="small dim">${esc(r.from || "")}</p>`;
  }
  if (t.arg === "fx") return typeof wdFxHtml === "function" ? wdFxHtml((good.fx || []).filter((q) => q.delayMs === 0)) : "";
  return typeof wdCommoditiesHtml === "function" ? wdCommoditiesHtml(good.commodities || []) : "";
}
/* a topic's headlines, as the News page draws them */
function monNewsHtml(t) {
  const path = monPath(t);
  const good = monGood(path);
  if (!good) return monFailed(path) ? monLater(`Couldn't read the headlines: ${monFailed(path)}.`) : monSkel;
  const items = (good.items || []).slice(0, 8);
  if (!items.length) return monLater("No headline on this topic just now.");
  return typeof nwRowsHtml === "function" ? nwRowsHtml(items, { now: new Date().toISOString(), compact: true }) : "";
}
/* today's calendar of one kind, as the Calendar page draws it */
function monCalendarHtml(t) {
  const path = monPath(t);
  const good = monGood(path);
  if (!good) return monFailed(path) ? monLater(`Couldn't read the calendar: ${monFailed(path)}.`) : monSkel;
  const items = (good.items || []).slice(0, 12);
  if (!items.length) return monLater(`Nothing today in Nasdaq's ${t.arg === "ipos" ? "IPO" : t.arg} calendar.`);
  return `${typeof calRowsHtml === "function" ? calRowsHtml(t.arg, items) : ""}${good.total > items.length ? `<p class="small dim">${items.length} of ${good.total} rows.</p>` : ""}`;
}
/* an option chain's nearest expiry in figures, as the Options page draws them */
function monOptionsHtml(t) {
  const path = monPath(t);
  const good = monGood(path);
  if (!good) return monFailed(path) ? monLater(`Couldn't read the chain: ${monFailed(path)}.`) : monSkel;
  const e = (good.expiries || []).find((x) => x.expiry === good.expiry) || (good.expiries || [])[0];
  const u = good.underlying || {};
  const under = `<p class="mon-px"><span class="mon-num">${Number.isFinite(Number(u.price)) ? esc(typeof opNum === "function" ? opNum(u.price, u.price >= 100 ? 2 : 4) : String(u.price)) : "—"}</span> ${chg(u.changePct)}${Number.isFinite(Number(u.iv30)) ? ` <span class="dim small">· IV30 ${esc(typeof opIv === "function" ? opIv(u.iv30) : String(u.iv30))}</span>` : ""}</p>`;
  if (!e) return `${under}${monLater("No expiry listed.")}`;
  return `${under}<p class="small dim mon-exp">${esc(typeof opDay === "function" ? opDay(e.expiry) : e.expiry)} · ${esc(typeof opDays === "function" ? opDays(e.days) : `${e.days} d`)} · ${esc(good.from || "")}</p>${typeof opSummaryHtml === "function" ? opSummaryHtml(e, good.kind) : ""}`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderMonitor(ctx) {
  MON.ctx = ctx;
  if (MON.el !== ctx.el) {
    ctx.el.addEventListener("click", monClick);
    ctx.el.addEventListener("submit", monSubmit);
    MON.el = ctx.el;
  }
  const tiles = monTiles(ctx.params);
  for (const t of tiles) monFetch(monPath(t), MON_TTL[t.kind]);
  const preset = Object.keys(MON_PRESETS).find((k) => MON_PRESETS[k].join(",") === monWords(tiles)) || "";
  const presets = `<div class="seg mon-presets" role="group" aria-label="Preset">${Object.keys(MON_PRESETS).map((k) => `<button type="button" data-mon="preset" data-preset="${k}" aria-pressed="${String(k === preset)}">${k[0].toUpperCase()}${k.slice(1)}</button>`).join("")}</div>`;
  const add = `<form class="mon-add" data-mon="add"><select name="tile" class="mon-pick" aria-label="A tile to add"><optgroup label="A board">${MON_WORLD.map((w) => `<option value="w=${w}">${monTitle({ kind: "w", arg: w })}</option>`).join("")}</optgroup><optgroup label="News">${MON_NEWS.map((n) => `<option value="n=${n}">${monTitle({ kind: "n", arg: n })}</option>`).join("")}</optgroup><optgroup label="Today's calendar">${MON_CAL.map((c) => `<option value="c=${c}">${monTitle({ kind: "c", arg: c })}</option>`).join("")}</optgroup><optgroup label="Options">${["SPX", "SPY", "QQQ", "VIX", "BTC", "ETH"].map((s) => `<option value="o=${s}">${s} options</option>`).join("")}</optgroup></select><button type="submit" class="btn btn-sm">Add</button><span class="small dim">A market joins from the command line: <kbd>AAPL MON</kbd></span></form>`;
  const tile = (t, i) => {
    const good = monGood(monPath(t));
    const body = t.kind === "m" ? monMarketHtml(t) : t.kind === "w" ? monWorldHtml(t) : t.kind === "n" ? monNewsHtml(t) : t.kind === "c" ? monCalendarHtml(t) : monOptionsHtml(t);
    return `<section class="sec mon-tile mon-${t.kind}" data-k="${esc(`${t.kind}=${t.arg}`)}" aria-label="${esc(monTitle(t, good))}"><div class="sec-head"><h2 class="h2">${esc(monTitle(t, good))}</h2><span class="mon-tools"><button type="button" class="link" data-mon="open" data-i="${i}">Open</button><button type="button" class="icon-btn mon-x" data-mon="remove" data-i="${i}" aria-label="Remove ${esc(monTitle(t, good))}">×</button></span></div>${body}</section>`;
  };
  const grid = tiles.length ? `<div class="mon-grid">${tiles.map(tile).join("")}</div>` : '<p class="empty">No tiles: pick a preset, add one above, or type a market and MON on the command line.</p>';
  paint(ctx.el, `<div class="mon"><div class="mon-bar">${presets}${add}</div>${grid}<p class="small dim mon-foot">Each tile reads what its page reads and says whose figures they are there; nothing here is the account's own figure. The layout is this address, kept in this browser.</p></div>`);
  monArm();
}
/* the tiles changed from the page: the address moved in place, the layout kept */
function monSet(tiles) {
  monKeep(tiles);
  go("monitor", { tiles: monWords(tiles) }, { replace: ROUTE.tab === "monitor" });
}
function monClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-mon]");
  if (!b) return;
  const tiles = monTiles(ROUTE.params);
  if (b.dataset.mon === "preset") return void monSet(monParse(MON_PRESETS[b.dataset.preset].join(",")));
  if (b.dataset.mon === "remove") return void monSet(tiles.filter((_, i) => i !== Number(b.dataset.i)));
  if (b.dataset.mon === "open") {
    const t = tiles[Number(b.dataset.i)];
    if (!t) return;
    if (t.kind === "m") return void (typeof openMarket === "function" && openMarket({ key: t.arg }));
    if (t.kind === "w") return void (typeof wdGo === "function" ? wdGo(t.arg) : go("world"));
    if (t.kind === "n") return void go("news", { topic: t.arg });
    if (t.kind === "c") return void go("calendar", { kind: t.arg });
    return void (typeof opGo === "function" ? opGo(t.arg, "chain") : go("options", { symbol: t.arg }));
  }
}
function monSubmit(e) {
  const f = e.target && e.target.closest && e.target.closest("[data-mon=add]");
  if (!f) return;
  e.preventDefault();
  const pick = f.querySelector("[name=tile]");
  const added = monParse(pick ? pick.value : "");
  if (!added.length) return;
  monAdd(added[0].kind, added[0].arg);
}
/** a tile joins (from the page, or the command line's AAPL MON): added to the layout showing, or the one kept, and the page opened */
function monAdd(kind, arg) {
  const tiles = monTiles(ROUTE.tab === "monitor" ? ROUTE.params : {});
  const next = monParse(`${monWords(tiles)},${kind}=${arg}`);
  monSet(next);
}
/* read again every fifteen seconds while the page shows and is in view: each tile's own keep decides what is asked */
function monArm() {
  clearTimeout(MON.timer);
  MON.timer = setTimeout(() => {
    if (ROUTE.tab !== "monitor" || document.hidden || !MON.ctx) return;
    for (const t of monTiles(ROUTE.params)) {
      const path = monPath(t);
      const d = MON.data.get(path);
      if (!d || Date.now() - d.at >= MON_TTL[t.kind]) {
        forget(path);
        monFetch(path, MON_TTL[t.kind]);
      }
    }
    monArm();
  }, MON_AGAIN_MS);
}
onRoute((tab) => {
  if (tab !== "monitor") clearTimeout(MON.timer);
});
