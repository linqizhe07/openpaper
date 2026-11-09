/* THE WORLD (the Markets group's page, #/world; WEI · GC · FXC · GLCO on the command line): the four boards a terminal keeps on one screen, as
   GET /api/account/world gives them (live/world.ts) — the equity indices (Cboe's delayed quotes, fifteen minutes behind, said so), the US
   yield curve (the Treasury's own, drawn beside the curves a month and a year before, with its spreads), the currencies (Kraken's live pairs,
   the ECB's fixing for the rest) and the commodities (the oracle prices of Hyperliquid's xyz perpetuals, around the clock). Each figure
   carries whose it is; under each board, when it was read; under the page, the sources that answered and the ones that did not, in their
   words. Read when the page shows and every fifteen seconds while it does; drawn in place. A function names a board (WEI the indices): the
   page scrolls to it once drawn. */
const WD = { ctx: null, el: null, read: null, pending: false, timer: 0, scrolled: "" };
const WD_AGAIN_MS = 15_000;
const WD_TTL = 5_000;
const WD_BOARDS = ["indices", "rates", "fx", "commodities"];

/* a figure with a fixed number of decimals and thousands apart; a dash where there is none */
const wdNum = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
/* the decimals a price of this size is written with: an index to two, a currency to four or five */
const wdDecimals = (v) => (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 100 ? 3 : Math.abs(v) >= 1 ? 4 : 5);
/* a price with as many decimals as it needs */
const wdPx = (n) => (!Number.isFinite(Number(n)) ? "—" : wdNum(Number(n), wdDecimals(Number(n))));
/* a change in basis points from a difference in percentage points */
const wdBp = (d) => (!Number.isFinite(Number(d)) ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.round(Math.abs(d) * 100)} bp`);
/* a signed change, written with the price's own decimals (an index's +176.47, a currency's +0.00591) */
const wdDelta = (q) => (!Number.isFinite(Number(q.change)) ? '<span class="dim">—</span>' : `<span class="${q.change > 0 ? "up" : q.change < 0 ? "down" : "flat"}">${q.change > 0 ? "+" : q.change < 0 ? "−" : ""}${wdNum(Math.abs(q.change), wdDecimals(Number.isFinite(Number(q.price)) ? Number(q.price) : Number(q.change)))}</span>`);
const wdWhen = (iso) => (iso && Number.isFinite(Date.parse(iso)) ? nyTime(iso) : "—");
const wdPath = "/api/account/world";
function wdFetch() {
  if (WD.pending) return;
  WD.pending = true;
  api(wdPath, { ttl: WD_TTL, timeout: 20_000 }).then((body) => {
    WD.pending = false;
    const ok = !!body && body.ok !== false && Array.isArray(body.indices);
    WD.read = { at: Date.now(), body, good: ok ? body : WD.read ? WD.read.good : null };
    if (ROUTE.tab === "world" && WD.ctx) paneLater("world", wdRedraw);
  });
}
const wdRedraw = () => {
  if (ROUTE.tab === "world" && WD.ctx) renderWorld({ ...WD.ctx, params: ROUTE.params });
};

/** the indices: name, level, change, the day's range, the stamp */
function wdIndicesHtml(rows) {
  if (!rows.length) return '<p class="empty">No index answered.</p>';
  return table([
    { label: "Index", cell: (q) => `<span class="wd-name"${q.note ? ` title="${esc(q.note)}"` : ""}>${esc(q.name)}</span>` },
    { label: "Level", r: true, cell: (q) => `<span class="wd-num">${q.unit === "%" ? `${wdNum(q.price, 3)}%` : wdPx(q.price)}</span>` },
    { label: "Change", r: true, cell: (q) => (q.unit === "%" ? wdBp(q.change) : wdDelta(q)) },
    { label: "", sr: "Change in percent", r: true, cell: (q) => (q.unit === "%" ? "" : chg(q.changePct)) },
    { label: "Day", r: true, cls: "wd-day", cell: (q) => (Number.isFinite(Number(q.low)) && Number.isFinite(Number(q.high)) ? `<span class="dim small">${q.unit === "%" ? `${wdNum(q.low, 3)}–${wdNum(q.high, 3)}` : `${wdPx(q.low)}–${wdPx(q.high)}`}</span>` : "") },
    { label: "As of", r: true, cell: (q) => `<span class="dim small mono">${esc(wdWhen(q.at))}</span>` },
  ], rows, { cls: "wd-table", rowAttr: (q) => `data-k="${esc(q.id)}"` });
}
/** the curve: the newest in a line, a month and a year before it dashed and dotted; the tenors along the bottom, the yields up the side */
function wdCurveSvg(board) {
  const c = board.latest;
  if (!c || !Array.isArray(c.points) || c.points.length < 2) return "";
  const W = 420;
  const H = 150;
  const L = 36;
  const B = 18;
  const series = [["latest", c], ["monthAgo", board.monthAgo], ["yearAgo", board.yearAgo]].filter(([, s]) => s && Array.isArray(s.points) && s.points.length > 1);
  const ys = series.flatMap(([, s]) => s.points.map((p) => p.yield));
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (!(hi > lo)) {
    lo -= 0.25;
    hi += 0.25;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const tenors = c.points.map((p) => p.months);
  const x = (months) => (L + (Math.max(0, tenors.indexOf(months)) / (tenors.length - 1)) * (W - L - 8)).toFixed(1);
  const y = (v) => (H - B - ((v - lo) / (hi - lo)) * (H - B - 8)).toFixed(1);
  const path = (s) => s.points.filter((p) => tenors.includes(p.months)).map((p, i) => `${i ? "L" : "M"}${x(p.months)} ${y(p.yield)}`).join(" ");
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad].map((v) => `<text x="${L - 4}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${wdNum(v, 2)}</text>`).join("");
  const labels = c.points.filter((p) => [1, 3, 6, 12, 24, 60, 120, 240, 360].includes(p.months)).map((p) => `<text x="${x(p.months)}" y="${H - 4}" text-anchor="middle">${esc(p.tenor.replace(" Mo", "M").replace(" Yr", "Y").replace("1.5 Month", "6W"))}</text>`).join("");
  return `<svg class="wd-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="The yield curve: ${esc(c.day)}${board.monthAgo ? `, a month before dashed` : ""}${board.yearAgo ? `, a year before dotted` : ""}">${ticks}${labels}${series.map(([k, s]) => `<path class="wd-line ${k}" d="${path(s)}" />`).join("")}${c.points.map((p) => `<circle class="wd-dot" cx="${x(p.months)}" cy="${y(p.yield)}" r="2.5" />`).join("")}</svg>`;
}
/** the rates: the curve, the spreads, each tenor against a week and a year before */
function wdRatesHtml(board) {
  if (!board || !board.latest) return `<p class="empty">${esc((board && board.from) || "The US Treasury's curve")} could not be read.</p>`;
  const c = board.latest;
  const at = (s, months) => (s && Array.isArray(s.points) ? (s.points.find((p) => p.months === months) || {}).yield : undefined);
  const sp = board.spreads || {};
  const spreads = ["2s10s", "3m10y", "5s30s"].filter((k) => Number.isFinite(Number(sp[k]))).map((k) => `<span class="wd-spread"><span class="label">${k}</span> <b class="${sp[k] < 0 ? "down" : ""}">${wdBp(sp[k])}</b></span>`).join("");
  const legend = `<p class="small dim wd-legend"><span class="wd-key latest"></span> ${esc(c.day)}${board.monthAgo ? ` · <span class="wd-key monthAgo"></span> ${esc(board.monthAgo.day)}` : ""}${board.yearAgo ? ` · <span class="wd-key yearAgo"></span> ${esc(board.yearAgo.day)}` : ""}</p>`;
  const rows = c.points.map((p) => ({ tenor: p.tenor, y: p.yield, w: at(board.weekAgo, p.months), m: at(board.monthAgo, p.months), yr: at(board.yearAgo, p.months) }));
  const diff = (a, b) => (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? `<span class="${a - b > 0 ? "up" : a - b < 0 ? "down" : "flat"}">${wdBp(a - b)}</span>` : '<span class="dim">—</span>');
  return `${wdCurveSvg(board)}${legend}${spreads ? `<p class="wd-spreads">${spreads}</p>` : ""}${table([
    { label: "Tenor", cell: (r) => esc(r.tenor) },
    { label: "Yield", r: true, cell: (r) => `<span class="wd-num">${wdNum(r.y, 2)}%</span>` },
    { label: "vs a week", r: true, cell: (r) => diff(r.y, r.w) },
    { label: "vs a month", r: true, cell: (r) => diff(r.y, r.m) },
    { label: "vs a year", r: true, cell: (r) => diff(r.y, r.yr) },
  ], rows, { cls: "wd-table wd-rates", rowAttr: (r) => `data-k="${esc(r.tenor)}"` })}`;
}
/** the currencies: Kraken's pairs live, the ECB's fixings under them */
function wdFxHtml(rows) {
  if (!rows.length) return '<p class="empty">No currency answered.</p>';
  return table([
    { label: "Pair", cell: (q) => `<span class="wd-name mono">${esc(q.name)}</span>` },
    { label: "Last", r: true, cell: (q) => `<span class="wd-num">${wdPx(q.price)}</span>` },
    { label: "Bid / Ask", r: true, cell: (q) => (Number.isFinite(Number(q.bid)) && Number.isFinite(Number(q.ask)) ? `<span class="dim small mono">${wdPx(q.bid)} / ${wdPx(q.ask)}</span>` : "") },
    { label: "Day", r: true, cell: (q) => (Number.isFinite(Number(q.changePct)) ? chg(q.changePct) : "") },
    { label: "From", cell: (q) => `<span class="tag${q.delayMs === 0 ? " up" : ""}" title="${esc([q.from, q.note].filter(Boolean).join(" — "))}">${q.delayMs === 0 ? "live" : "fixing"}</span>` },
  ], rows, { cls: "wd-table", rowAttr: (q) => `data-k="${esc(q.id)}"` });
}
/** the commodities: the oracle, the mark beside it, the day, the volume */
function wdCommoditiesHtml(rows) {
  if (!rows.length) return '<p class="empty">No commodity answered.</p>';
  return table([
    { label: "Commodity", cell: (q) => `<span class="wd-name">${esc(q.name)}</span>${q.unit ? ` <span class="dim small">${esc(q.unit)}</span>` : ""}` },
    { label: "Oracle", r: true, cell: (q) => `<span class="wd-num">${wdPx(q.price)}</span>` },
    { label: "Mark", r: true, cell: (q) => `<span class="dim">${wdPx(q.mark)}</span>` },
    { label: "24h", r: true, cell: (q) => (Number.isFinite(Number(q.changePct)) ? chg(q.changePct) : "") },
    { label: "Volume", r: true, cell: (q) => (Number.isFinite(Number(q.volumeUsd24h)) ? `<span class="dim small">${typeof mkVol === "function" ? mkVol(q.volumeUsd24h) : wdNum(q.volumeUsd24h, 0)}</span>` : "") },
  ], rows, { cls: "wd-table", rowAttr: (q) => `data-k="${esc(q.id)}"` });
}
/* the sources under the page: which answered, which stand in, which did not */
function wdSourcesHtml(b) {
  const srcs = Array.isArray(b.sources) ? b.sources : [];
  const late = srcs.filter((s) => s.late);
  const missing = Array.isArray(b.missing) ? b.missing : [];
  const none = missing.filter((m) => !late.some((s) => s.id === m.venue));
  return `<p class="small dim wd-sources">Read ${esc(wdWhen(b.asOf))} New York${late.length ? ` · standing in from an earlier answer: ${esc(late.map((s) => s.name).join(", "))}` : ""}${none.length ? ` · ${esc(none.map((m) => `${m.venueName}: ${m.why}`).join("; "))}` : ""}.</p>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderWorld(ctx) {
  WD.ctx = ctx;
  if (WD.el !== ctx.el) WD.el = ctx.el;
  const r = WD.read;
  if (!r || Date.now() - r.at > WD_TTL) wdFetch();
  const good = r ? r.good : null;
  const failed = r && r.body && !(r.body.ok !== false && Array.isArray(r.body.indices)) ? refusalOf(r.body) || "the account did not answer" : "";
  const card = (id, title, sub, body) => `<section class="sec wd-card" id="wd-${id}" data-k="${id}" aria-label="${esc(title)}"><div class="sec-head"><h2 class="h2">${esc(title)}</h2>${sub ? `<span class="small dim">${esc(sub)}</span>` : ""}</div>${body}</section>`;
  let body = "";
  if (good) {
    const skew = (q) => q && q.from;
    const live = good.fx.find((q) => q.delayMs === 0);
    const fixing = good.fx.find((q) => q.delayMs !== 0);
    body = `<div class="wd-grid">${card("indices", "Indices", good.indices.length ? skew(good.indices[0]) : "", wdIndicesHtml(good.indices))}${card("rates", "Yield curve", good.rates && good.rates.from ? good.rates.from : "", wdRatesHtml(good.rates))}${card("fx", "Currencies", [live && live.from, fixing && fixing.from].filter(Boolean).join(" · "), wdFxHtml(good.fx))}${card("commodities", "Commodities", good.commodities.length ? skew(good.commodities[0]) : "", wdCommoditiesHtml(good.commodities))}</div>${wdSourcesHtml(good)}${failed ? `<p class="mk-missing">Couldn't read the boards again just now: ${esc(failed)}. This is what was read at ${esc(wdWhen(good.asOf))}.</p>` : ""}${Array.isArray(good.notes) && good.notes.length ? `<details class="wd-foot small dim"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}`;
  } else if (failed) body = `<div class="msg no">Couldn't read the boards: ${esc(failed)}.</div>`;
  else body = '<div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span></div>';
  paint(ctx.el, `<div class="wd">${body}</div>`);
  // a function named a board (wdGo): brought into view once it is drawn
  const board = ctx.params && WD_BOARDS.includes(ctx.params.board) ? ctx.params.board : "";
  if (good && board && WD.scrolled !== board) {
    WD.scrolled = board;
    nextFrame(() => {
      const el = ctx.el.querySelector && ctx.el.querySelector(`#wd-${board}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    });
  }
  wdArm();
}
/** a function's way to a board (WEI · GC · FXC · GLCO): the page, and the board brought into view — again, where the page already shows */
function wdGo(board) {
  WD.scrolled = "";
  go("world", { board }, { replace: ROUTE.tab === "world" });
}
/* read again every fifteen seconds while the page shows and is in view */
function wdArm() {
  clearTimeout(WD.timer);
  WD.timer = setTimeout(() => {
    if (ROUTE.tab !== "world" || document.hidden || !WD.ctx) return;
    forget(wdPath);
    wdFetch();
    wdArm();
  }, WD_AGAIN_MS);
}
onRoute((tab) => {
  if (tab !== "world") {
    clearTimeout(WD.timer);
    WD.scrolled = "";
  }
});
