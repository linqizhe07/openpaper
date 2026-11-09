/* OPTIONS (the Markets group's page, #/options; OMON · SKEW on the command line): a listed option chain as its venue publishes it and the
   figures a terminal reads off it, as GET /api/account/options gives them (live/options.ts) — a US share's or a Cboe index's chain from
   Cboe's delayed quotes (fifteen minutes behind, said so), BTC's and ETH's from Deribit (live). The underlying and Cboe's 30-day IV; every
   expiry on a strip with its days and at-the-money IV; the chosen expiry's figures (ATM IV, put/call by open interest and volume, max pain,
   the at-the-money straddle and the move it prices in, the 25-delta skew); the term structure of ATM IV with a table of every expiry; the
   smile of the chosen expiry; and its chain, calls and puts either side of the strike, around the money. Nothing here is the account's
   own figure; every IV and greek is the venue's own and the rest is arithmetic over them (the notes say which). Read when the page shows
   and every thirty seconds while it does; drawn in place. A function names a view (OMON the chain, SKEW the skew): the page scrolls to it */
const OP = { ctx: null, el: null, read: null, pending: false, timer: 0, scrolled: "" };
const OP_AGAIN_MS = 30_000;
const OP_TTL = 10_000;
const OP_DEFAULT = "SPY";
const OP_CHIPS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "SPX", "VIX", "BTC", "ETH"];
const OP_VIEWS = ["chain", "skew"];
const OP_SYMBOL = /^[A-Z][A-Z.]{0,5}$/;
const OP_LAST_KEY = "op.symbol";

/* the route's words, checked: a symbol (the last one read, else SPY), an expiry day, a view to scroll to */
function opParams(params) {
  const p = params || {};
  const raw = String(p.symbol || "").trim().toUpperCase().replace(/^\^/, "");
  let last = "";
  try {
    last = String(localStorage.getItem(OP_LAST_KEY) || "");
  } catch {
    last = "";
  }
  const symbol = OP_SYMBOL.test(raw) ? raw : OP_SYMBOL.test(last) ? last : OP_DEFAULT;
  return { symbol, expiry: /^\d{4}-\d{2}-\d{2}$/.test(String(p.expiry || "")) ? String(p.expiry) : "", view: OP_VIEWS.includes(p.view) ? p.view : "" };
}
const opPath = (p) => `/api/account/options?symbol=${encodeURIComponent(p.symbol)}${p.expiry ? `&expiry=${encodeURIComponent(p.expiry)}` : ""}`;
/* a figure with a fixed number of decimals and thousands apart; a dash where there is none */
const opNum = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
/* a count: whole where it is whole (Cboe's contracts), to a tenth where the venue counts in coins (Deribit) */
const opCount = (n) => (!Number.isFinite(Number(n)) ? "—" : opNum(n, Number.isInteger(Number(n)) ? 0 : 1));
const opIv = (n) => (!Number.isFinite(Number(n)) ? "—" : `${opNum(n, 1)}%`);
const opDelta = (n) => (!Number.isFinite(Number(n)) ? "—" : `${n < 0 ? "−" : ""}${opNum(Math.abs(n), 2)}`);
/* a signed difference in points of volatility or of price */
const opSigned = (n, digits = 1, unit = "") => (!Number.isFinite(Number(n)) ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${opNum(Math.abs(n), digits)}${unit}`);
const opDays = (d) => (!Number.isFinite(Number(d)) ? "—" : `${d < 1 ? opNum(d, 1) : opNum(d, 0)} d`);
/* an expiry day as a person reads it: 20 Nov, with the year when it is not this year's */
function opDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "—");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1] || m[2];
  return `${Number(m[3])} ${month}${Number(m[1]) !== new Date().getUTCFullYear() ? ` ${m[1].slice(2)}` : ""}`;
}
const opWhen = (iso) => (iso && Number.isFinite(Date.parse(iso)) ? nyTime(iso) : "—");

function opFetch(path) {
  if (OP.pending === path) return;
  OP.pending = path;
  api(path, { ttl: OP_TTL, timeout: 30_000 }).then((body) => {
    if (OP.pending === path) OP.pending = false;
    const ok = !!body && body.ok !== false && Array.isArray(body.expiries);
    const same = OP.read && OP.read.path === path;
    OP.read = { path, at: Date.now(), body, good: ok ? body : same ? OP.read.good : null };
    if (ok) {
      try {
        localStorage.setItem(OP_LAST_KEY, body.symbol);
      } catch {
        /* a browser that keeps nothing: the route still says */
      }
    }
    if (ROUTE.tab === "options" && OP.ctx) paneLater("options", opRedraw);
  });
}
const opRedraw = () => {
  if (ROUTE.tab === "options" && OP.ctx) renderOptions({ ...OP.ctx, params: ROUTE.params });
};

/* the underlying's line: its price and change, Cboe's 30-day IV where there is one, the stamp */
function opUnderHtml(u, kind) {
  if (!u) return "";
  const parts = [];
  parts.push(`<span class="op-sym mono">${esc(u.symbol || "")}</span> <span class="op-num">${Number.isFinite(Number(u.price)) ? opNum(u.price, u.price >= 100 ? 2 : 4) : "—"}</span>`);
  if (Number.isFinite(Number(u.change))) parts.push(`<span class="${u.change > 0 ? "up" : u.change < 0 ? "down" : "flat"}">${opSigned(u.change, 2)}</span> ${chg(u.changePct)}`);
  if (Number.isFinite(Number(u.iv30))) parts.push(`IV30 <b>${opIv(u.iv30)}</b>${Number.isFinite(Number(u.iv30Change)) ? ` <span class="${u.iv30Change > 0 ? "up" : u.iv30Change < 0 ? "down" : "flat"} small">${opSigned(u.iv30Change, 1)}</span>` : ""}`);
  parts.push(`<span class="dim small">${esc(u.from || "")}${u.at ? ` · ${esc(opWhen(u.at))} New York` : ""}${kind === "crypto" ? " · prices in dollars at each expiry's underlying" : ""}</span>`);
  return `<p class="op-under">${parts.join(' <span class="dim">·</span> ')}</p>`;
}
/* the expiries on a strip: the day, the days to it, the at-the-money IV; the chosen one pressed */
function opStripHtml(expiries, chosen) {
  if (!expiries.length) return "";
  return `<div class="op-strip" role="group" aria-label="Expiry">${expiries.map((e) => `<button type="button" class="op-exp" data-op="expiry" data-expiry="${esc(e.expiry)}" aria-pressed="${String(e.expiry === chosen)}"><span class="op-exp-day">${esc(opDay(e.expiry))}</span><span class="op-exp-sub">${esc(opDays(e.days))}${Number.isFinite(Number(e.atmIv)) ? ` · ${esc(opIv(e.atmIv))}` : ""}</span></button>`).join("")}</div>`;
}
/* the chosen expiry's figures as tiles */
function opSummaryHtml(e, kind) {
  if (!e) return "";
  const tile = (label, html, title) => `<div class="op-stat"${title ? ` title="${esc(title)}"` : ""}><span class="label">${label}</span><b>${html}</b></div>`;
  const tiles = [
    tile("ATM IV", opIv(e.atmIv), "the venue's implied volatility at the two strikes around the underlying, interpolated"),
    tile("Put / call · OI", Number.isFinite(Number(e.pcOi)) ? opNum(e.pcOi, 2) : "—", "put open interest over call open interest"),
    tile("Put / call · volume", Number.isFinite(Number(e.pcVolume)) ? opNum(e.pcVolume, 2) : "—", "put volume over call volume"),
    tile("Max pain", Number.isFinite(Number(e.maxPain)) ? opNum(e.maxPain, e.maxPain >= 1000 ? 0 : 2) : "—", "the strike at which the open interest, calls and puts together, would pay its holders least"),
    tile("Straddle", e.straddle ? `${opNum(e.straddle.price, 2)} <span class="dim small">±${opNum(e.straddle.pct, 1)}%</span>` : "—", e.straddle ? `the ${opNum(e.straddle.strike, 0)} call's and put's mid prices together: the move priced in to expiry, as a share of the underlying` : ""),
    tile("Skew 25Δ", Number.isFinite(Number(e.skew25)) ? `${opSigned(e.skew25, 1)} <span class="dim small">pts</span>` : "—", "the 25-delta put's IV less the 25-delta call's"),
    tile("Open interest", `<span class="small">${opCount(e.callOi)} C · ${opCount(e.putOi)} P</span>`, ""),
    tile("Volume", `<span class="small">${opCount(e.callVolume)} C · ${opCount(e.putVolume)} P</span>`, ""),
  ];
  if (kind === "crypto" && Number.isFinite(Number(e.underlying))) tiles.push(tile("Underlying future", opNum(e.underlying, 2), "Deribit's underlying for this expiry: its future, which the options are priced off"));
  return `<div class="op-stats">${tiles.join("")}</div>`;
}
/* a small line chart: series [{ cls, points: [[x, y]] }], x and y ranges, labels along the bottom [[x, text]] and the side [[y, text]] */
function opSvg(series, xs, ys, xLabels, yLabels, { W = 420, H = 150, L = 38, B = 18, marks = [], label = "" } = {}) {
  const [x0, x1] = xs;
  let [y0, y1] = ys;
  if (!(y1 > y0)) {
    y0 -= 1;
    y1 += 1;
  }
  const pad = (y1 - y0) * 0.1;
  y0 -= pad;
  y1 += pad;
  const x = (v) => (L + ((v - x0) / (x1 - x0 || 1)) * (W - L - 8)).toFixed(1);
  const y = (v) => (H - B - ((v - y0) / (y1 - y0)) * (H - B - 8)).toFixed(1);
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p[0])} ${y(p[1])}`).join(" ");
  return `<svg class="op-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${yLabels.map(([v, t]) => `<text x="${L - 4}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${esc(t)}</text>`).join("")}${xLabels.map(([v, t]) => `<text x="${x(v)}" y="${H - 4}" text-anchor="middle">${esc(t)}</text>`).join("")}${marks.map((v) => `<line class="op-mark" x1="${x(v)}" x2="${x(v)}" y1="4" y2="${H - B}" />`).join("")}${series.filter((s) => s.points.length > 1).map((s) => `<path class="op-line ${s.cls}" d="${path(s.points)}" />`).join("")}${series.flatMap((s) => s.points.map((p) => `<circle class="op-dot ${s.cls}" cx="${x(p[0])}" cy="${y(p[1])}" r="2" />`)).join("")}</svg>`;
}
/* the smile: implied volatility by strike, calls and puts, over the strikes the chain shows; the underlying marked */
function opSmileHtml(smile, rows, S) {
  const lo = rows.length ? rows[0].strike : -Infinity;
  const hi = rows.length ? rows[rows.length - 1].strike : Infinity;
  const pts = (Array.isArray(smile) ? smile : []).filter((p) => p.strike >= lo && p.strike <= hi);
  const calls = pts.filter((p) => Number.isFinite(Number(p.callIv))).map((p) => [p.strike, p.callIv]);
  const puts = pts.filter((p) => Number.isFinite(Number(p.putIv))).map((p) => [p.strike, p.putIv]);
  if (calls.length + puts.length < 3) return '<p class="empty">Too few implied volatilities to draw a smile.</p>';
  const ivs = [...calls, ...puts].map((p) => p[1]);
  const strikes = pts.map((p) => p.strike);
  const xs = [Math.min(...strikes), Math.max(...strikes)];
  const ys = [Math.min(...ivs), Math.max(...ivs)];
  const step = Math.max(1, Math.floor(strikes.length / 6));
  const xLabels = strikes.filter((_, i) => i % step === 0).map((k) => [k, opNum(k, k >= 1000 ? 0 : k >= 10 ? 0 : 2)]);
  const yLabels = [ys[0], (ys[0] + ys[1]) / 2, ys[1]].map((v) => [v, opIv(v)]);
  return `${opSvg([{ cls: "call", points: calls }, { cls: "put", points: puts }], xs, ys, xLabels, yLabels, { marks: Number.isFinite(Number(S)) ? [S] : [], label: "Implied volatility by strike: calls and puts" })}<p class="small dim op-legend"><span class="op-key call"></span> calls · <span class="op-key put"></span> puts${Number.isFinite(Number(S)) ? ` · <span class="op-key mark"></span> the underlying` : ""}</p>`;
}
/* the term structure: the at-the-money IV of every expiry, in order */
function opTermHtml(expiries) {
  const pts = expiries.map((e, i) => [i, e.atmIv]).filter((p) => Number.isFinite(Number(p[1])));
  if (pts.length < 2) return "";
  const ivs = pts.map((p) => p[1]);
  const ys = [Math.min(...ivs), Math.max(...ivs)];
  const step = Math.max(1, Math.floor(expiries.length / 6));
  const xLabels = expiries.map((e, i) => [i, opDay(e.expiry)]).filter((_, i) => i % step === 0);
  return opSvg([{ cls: "term", points: pts }], [0, Math.max(1, expiries.length - 1)], ys, xLabels, [ys[0], (ys[0] + ys[1]) / 2, ys[1]].map((v) => [v, opIv(v)]), { label: "At-the-money implied volatility by expiry" });
}
/* every expiry's figures in a table */
function opExpiriesTable(expiries, chosen) {
  return table([
    { label: "Expiry", cell: (e) => `<button type="button" class="link op-exp-link${e.expiry === chosen ? " on" : ""}" data-op="expiry" data-expiry="${esc(e.expiry)}">${esc(opDay(e.expiry))}</button>` },
    { label: "Days", r: true, cell: (e) => `<span class="dim">${esc(opDays(e.days))}</span>` },
    { label: "ATM IV", r: true, cell: (e) => `<span class="op-num">${esc(opIv(e.atmIv))}</span>` },
    { label: "Skew 25Δ", r: true, cell: (e) => (Number.isFinite(Number(e.skew25)) ? `<span class="${e.skew25 > 0 ? "" : "down"}">${esc(opSigned(e.skew25, 1))}</span>` : '<span class="dim">—</span>') },
    { label: "P/C OI", r: true, cell: (e) => (Number.isFinite(Number(e.pcOi)) ? opNum(e.pcOi, 2) : '<span class="dim">—</span>') },
    { label: "Max pain", r: true, cell: (e) => (Number.isFinite(Number(e.maxPain)) ? opNum(e.maxPain, e.maxPain >= 1000 ? 0 : 2) : '<span class="dim">—</span>') },
    { label: "Straddle", r: true, cell: (e) => (e.straddle ? `<span title="${esc(`${opNum(e.straddle.price, 2)} at the ${opNum(e.straddle.strike, 0)} strike`)}">±${opNum(e.straddle.pct, 1)}%</span>` : '<span class="dim">—</span>') },
  ], expiries, { cls: "op-table op-terms", rowAttr: (e) => `data-k="${esc(e.expiry)}"${e.expiry === chosen ? ' class="op-on"' : ""}` });
}
/* THE CHAIN: calls to the left of the strike, puts to the right; a leg in the money shaded; the strike nearest the underlying marked */
function opChainHtml(rows, S) {
  if (!rows.length) return '<p class="empty">No strikes in this expiry.</p>';
  const atm = Number.isFinite(Number(S)) ? rows.reduce((a, b) => (Math.abs(b.strike - S) < Math.abs(a.strike - S) ? b : a)).strike : undefined;
  const leg = (l, itm) => {
    const c = itm ? ' class="op-itm r"' : ' class="r"';
    if (!l) return `<td${c}></td>`.repeat(7);
    return `<td${c}>${Number.isFinite(Number(l.bid)) ? opNum(l.bid, 2) : '<span class="dim">—</span>'}</td><td${c}>${Number.isFinite(Number(l.ask)) ? opNum(l.ask, 2) : '<span class="dim">—</span>'}</td><td${c}>${Number.isFinite(Number(l.last)) ? opNum(l.last, 2) : '<span class="dim">—</span>'}</td><td${c}>${esc(opIv(l.iv))}</td><td${c}>${esc(opDelta(l.delta))}</td><td${c}>${esc(opCount(l.oi))}</td><td${c}>${esc(opCount(l.volume))}</td>`;
  };
  const head = ["Bid", "Ask", "Last", "IV", "Δ", "OI", "Vol"].map((h) => `<th scope="col" class="r">${h}</th>`).join("");
  return `<div class="t-wrap"><table class="t op-table op-chain"><thead><tr><th scope="colgroup" colspan="7" class="op-side">Calls</th><th scope="col" class="op-strike r">Strike</th><th scope="colgroup" colspan="7" class="op-side">Puts</th></tr><tr>${head}<th scope="col" class="op-strike r"><span class="sr">Strike</span></th>${head}</tr></thead><tbody>${rows.map((r) => `<tr data-k="${esc(String(r.strike))}"${r.strike === atm ? ' class="op-atm"' : ""}>${leg(r.call, Number.isFinite(Number(S)) && r.strike < S)}<td class="op-strike r"><b>${opNum(r.strike, r.strike >= 1000 || Number.isInteger(r.strike) ? 0 : 2)}</b></td>${leg(r.put, Number.isFinite(Number(S)) && r.strike > S)}</tr>`).join("")}</tbody></table></div>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderOptions(ctx) {
  OP.ctx = ctx;
  if (OP.el !== ctx.el) {
    ctx.el.addEventListener("click", opClick);
    ctx.el.addEventListener("submit", opSubmit);
    OP.el = ctx.el;
  }
  const p = opParams(ctx.params);
  const path = opPath(p);
  const r = OP.read;
  if (!r || r.path !== path || Date.now() - r.at > OP_TTL) opFetch(path);
  const good = r && r.path === path ? r.good : null;
  const failed = r && r.path === path && r.body && !(r.body.ok !== false && Array.isArray(r.body.expiries)) ? refusalOf(r.body) || "the account did not answer" : "";
  const card = (id, title, sub, body) => `<section class="sec op-card" id="op-${id}" data-k="${id}" aria-label="${esc(title)}"><div class="sec-head"><h2 class="h2">${esc(title)}</h2>${sub ? `<span class="small dim">${sub}</span>` : ""}</div>${body}</section>`;
  const form = `<form class="op-form" data-op="form"><input class="op-in mono" name="symbol" data-op="symbol" value="${esc(p.symbol)}" placeholder="AAPL · SPX · BTC" aria-label="Symbol" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="10" /><button type="submit" class="btn btn-sm">Read</button></form><div class="op-chips">${OP_CHIPS.map((s) => `<button type="button" class="chip${s === p.symbol ? " on" : ""}" data-op="chip" data-symbol="${s}" aria-pressed="${String(s === p.symbol)}">${s}</button>`).join("")}</div>`;
  let body = "";
  if (good) {
    const chosen = good.expiry || "";
    const e = good.expiries.find((x) => x.expiry === chosen);
    const S = e && Number.isFinite(Number(e.underlying)) ? e.underlying : good.underlying && good.underlying.price;
    const stamp = `Read ${esc(opWhen(good.readAt))} New York${good.late ? " · standing in from an earlier answer" : ""}`;
    body = `${card("head", `Options · ${good.symbol}`, `${esc(good.from)}${good.late ? ' · <span class="tag warn">standing in</span>' : ""}`, `${form}${opUnderHtml(good.underlying, good.kind)}${opStripHtml(good.expiries, chosen)}${opSummaryHtml(e, good.kind)}`)}
<div class="op-grid">${card("skew", "Volatility", "at-the-money IV by expiry · skew", `${opTermHtml(good.expiries)}${opExpiriesTable(good.expiries, chosen)}`)}${card("smile", `Smile · ${esc(opDay(chosen))}`, "implied volatility by strike", opSmileHtml(good.smile, good.chain, S))}</div>
${card("chain", `Chain · ${esc(opDay(chosen))}`, e ? `${esc(opDays(e.days))} · ${e.contracts} contracts${good.strikes ? ` · ${good.chain.length} of ${good.strikes} strikes, around the money` : ""}` : "", opChainHtml(good.chain, S))}
${failed ? `<p class="mk-missing">Couldn't read the chain again just now: ${esc(failed)}. This is what was read at ${esc(opWhen(good.readAt))}.</p>` : ""}<p class="small dim op-asof">${stamp} · ${esc(good.from)}${Array.isArray(good.notes) && good.notes.length ? `<details class="op-foot"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}</p>`;
  } else if (failed) body = `${card("head", `Options · ${p.symbol}`, "", form)}<div class="msg no">Couldn't read the chain: ${esc(failed)}.</div>`;
  else body = `${card("head", `Options · ${p.symbol}`, "", form)}<div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span></div>`;
  paint(ctx.el, `<div class="op">${body}</div>`);
  // a function named a view (opGo): brought into view once the chain is drawn
  const want = p.view ? `${p.view}:${p.symbol}` : "";
  if (good && want && OP.scrolled !== want) {
    OP.scrolled = want;
    nextFrame(() => {
      const el = ctx.el.querySelector && ctx.el.querySelector(`#op-${p.view}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    });
  }
  opArm();
}
function opClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-op]");
  if (!b) return;
  if (b.dataset.op === "expiry") return void go("options", { ...ROUTE.params, expiry: b.dataset.expiry, view: undefined }, { replace: true });
  if (b.dataset.op === "chip") return void go("options", { symbol: b.dataset.symbol }, { replace: true });
}
function opSubmit(e) {
  const f = e.target && e.target.closest && e.target.closest("[data-op=form]");
  if (!f) return;
  e.preventDefault();
  const v = String((f.querySelector("[data-op=symbol]") || {}).value || "").trim().toUpperCase().replace(/^\^/, "");
  if (OP_SYMBOL.test(v)) go("options", { symbol: v }, { replace: true });
}
/** the market a chain is read for, from a listed market: a US share's ticker, or BTC / ETH from a coin or a perpetual; "" where none */
function opSymbolOf(item) {
  if (!item) return "";
  const ticker = typeof mkTicker === "function" ? mkTicker(item) : "";
  if (ticker && !(typeof mkIsPreipo === "function" && mkIsPreipo(item))) return ticker;
  if (["coin", "perp"].includes(item.kind)) {
    const base = String(item.base || "").toUpperCase().replace(/^[A-Z]+:/, "");
    if (["BTC", "ETH", "XBT"].includes(base)) return base === "XBT" ? "BTC" : base;
  }
  return "";
}
/** a function's way to the page (OMON · SKEW): a symbol where one is given, the view brought into view — in place where the page already shows */
function opGo(symbol, view) {
  OP.scrolled = "";
  const sym = symbol || (ROUTE.tab === "options" ? opParams(ROUTE.params).symbol : "");
  go("options", { ...(sym ? { symbol: sym } : {}), ...(view ? { view } : {}) }, { replace: ROUTE.tab === "options" });
}
/* read again every thirty seconds while the page shows and is in view */
function opArm() {
  clearTimeout(OP.timer);
  OP.timer = setTimeout(() => {
    if (ROUTE.tab !== "options" || document.hidden || !OP.ctx) return;
    forget("/api/account/options?");
    opFetch(opPath(opParams(ROUTE.params)));
    opArm();
  }, OP_AGAIN_MS);
}
onRoute((tab) => {
  if (tab !== "options") {
    clearTimeout(OP.timer);
    OP.scrolled = "";
  }
});
