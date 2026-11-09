/* ANALYTICS (the Markets group's page, #/analytics; COMP · CORR · HVG · BETA · SEAG on the command line): a few markets' price histories
   compared, correlated, their volatility, their betas to the first, their seasonality, as GET /api/account/analytics gives them
   (live/analytics.ts) — arithmetic over the bars the account's own candles read gives, nothing read anew, no forecast. The markets are in
   the address (markets=venue|symbol,…), added from a search of the listed markets or the command line (NVDA COMP), each a chip with its
   ×; the range as a seg; the five views as a seg. Nothing here is the account's own figure */
const AN = { ctx: null, el: null, read: null, pending: false, search: { q: "", items: null, pending: "" } };
const AN_TTL = 60_000;
const AN_MOST = 8;
const AN_VIEWS = [["comp", "Compare"], ["corr", "Correlation"], ["hvg", "Volatility"], ["beta", "Beta"], ["seag", "Seasonality"]];
const AN_RANGES = [["1M", "1h"], ["3M", "4h"], ["6M", "4h"], ["YTD", "1d"], ["1Y", "1d"], ["5Y", "1w"]];
const AN_KEY = /^[a-z0-9][a-z0-9-]{0,59}\|.{1,160}$/;
const AN_PRESETS = [["US indices", ["SPY", "QQQ", "IWM", "DIA"]], ["Megacaps", ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"]], ["Crypto", ["BTC", "ETH", "SOL"]]];

/* the route's words, checked: the markets (eight at most, no repeats), the range, the view */
function anParams(params) {
  const p = params || {};
  const markets = [];
  for (const m of String(p.markets || "").split(",")) {
    const k = m.trim();
    if (AN_KEY.test(k) && !markets.includes(k) && markets.length < AN_MOST) markets.push(k);
  }
  const range = AN_RANGES.some(([r]) => r === p.range) ? p.range : "1Y";
  return { markets, range, interval: AN_RANGES.find(([r]) => r === range)[1], view: AN_VIEWS.some(([v]) => v === p.view) ? p.view : "comp" };
}
const anPath = (p) => `/api/account/analytics?${new URLSearchParams({ markets: p.markets.join(","), interval: p.interval, range: p.range })}`;
const anNum = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const anPct = (n, digits = 1) => (!Number.isFinite(Number(n)) ? '<span class="dim">—</span>' : `<span class="${n > 0 ? "up" : n < 0 ? "down" : "flat"}">${n > 0 ? "+" : n < 0 ? "−" : ""}${anNum(Math.abs(n), digits)}%</span>`);
/* a market's short name: the symbol, with the venue where two markets share a symbol */
function anName(key, markets) {
  const symbol = key.slice(key.indexOf("|") + 1);
  const twice = markets.filter((k) => k.slice(k.indexOf("|") + 1) === symbol).length > 1;
  return twice ? `${symbol} @ ${key.slice(0, key.indexOf("|"))}` : symbol;
}
const anColor = (i) => `an-c${i % 8}`;

function anFetch(path) {
  if (AN.pending === path) return;
  AN.pending = path;
  api(path, { ttl: AN_TTL, timeout: 60_000 }).then((body) => {
    if (AN.pending === path) AN.pending = false;
    const ok = !!body && body.ok !== false && Array.isArray(body.markets);
    const same = AN.read && AN.read.path === path;
    AN.read = { path, at: Date.now(), body, good: ok ? body : same ? AN.read.good : null };
    if (ROUTE.tab === "analytics" && AN.ctx) paneLater("analytics", anRedraw);
  });
}
const anRedraw = () => {
  if (ROUTE.tab === "analytics" && AN.ctx) renderAnalytics({ ...AN.ctx, params: ROUTE.params });
};
/* the search of the listed markets, for a market to add: the matches as buttons, each a candle leg */
function anSearch(q) {
  const asked = q.trim();
  AN.search.q = asked;
  if (!asked) {
    AN.search.items = null;
    return;
  }
  if (AN.search.pending === asked) return;
  AN.search.pending = asked;
  api(`/api/account/explore?q=${encodeURIComponent(asked)}&limit=8`, { ttl: 20_000 }).then((body) => {
    if (AN.search.pending === asked) AN.search.pending = "";
    if (AN.search.q !== asked) return;
    AN.search.items = body && Array.isArray(body.items) ? body.items : [];
    anRedraw();
  });
}
/* a line chart of several series over shared times: series [{ key, cls, points: [[t, v] | null] }] */
function anLines(series, ys, { W = 720, H = 220, L = 44, B = 18, labels = [], yFmt = (v) => anNum(v, 0), base } = {}) {
  let [y0, y1] = ys;
  if (!(y1 > y0)) {
    y0 -= 1;
    y1 += 1;
  }
  const pad = (y1 - y0) * 0.08;
  y0 -= pad;
  y1 += pad;
  const ts = series.flatMap((s) => s.points.filter(Boolean).map((p) => p[0]));
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const x = (t) => (L + ((t - t0) / (t1 - t0 || 1)) * (W - L - 8)).toFixed(1);
  const y = (v) => (H - B - ((v - y0) / (y1 - y0)) * (H - B - 8)).toFixed(1);
  const path = (pts) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p[0])} ${y(p[1])}`;
      pen = true;
    }
    return d;
  };
  const yl = [y0 + pad, (y0 + y1) / 2, y1 - pad].map((v) => `<text x="${L - 4}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${esc(yFmt(v))}</text>`).join("");
  const xl = labels.map(([t, text]) => `<text x="${x(t)}" y="${H - 4}" text-anchor="middle">${esc(text)}</text>`).join("");
  const baseLine = base !== undefined && base >= y0 && base <= y1 ? `<line class="an-base" x1="${L}" x2="${W - 8}" y1="${y(base)}" y2="${y(base)}" />` : "";
  return `<svg class="an-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.key).join(", "))}">${yl}${xl}${baseLine}${series.map((s) => `<path class="an-line ${s.cls}" d="${path(s.points)}" />`).join("")}</svg>`;
}
const anDates = (times, n = 6) => {
  if (!times.length) return [];
  const step = Math.max(1, Math.floor(times.length / n));
  return times.filter((_, i) => i % step === 0).map((t) => [t, nyDay(t)]);
};
/** COMP: the markets rebased to 100, and each one's figures */
function anCompHtml(v, p) {
  const c = v.comp;
  const keys = v.markets.map((m) => m.key);
  const series = keys.map((k, i) => ({ key: anName(k, keys), cls: anColor(i), points: c.t.map((t, j) => (c.rebased[k] && c.rebased[k][j] !== null ? [t, c.rebased[k][j]] : null)) }));
  const vals = series.flatMap((s) => s.points.filter(Boolean).map((pt) => pt[1]));
  const chart = c.t.length > 1 && vals.length ? anLines(series, [Math.min(...vals), Math.max(...vals)], { labels: anDates(c.t), base: 100 }) : '<p class="empty">Too few common bars to compare.</p>';
  const legend = `<p class="small an-legend">${keys.map((k, i) => `<span class="an-key ${anColor(i)}"></span> ${esc(anName(k, keys))}`).join(" · ")}</p>`;
  const rows = table([
    { label: "Market", cell: (s) => `<span class="an-name"><span class="an-key ${anColor(keys.indexOf(s.key))}"></span> ${esc(anName(s.key, keys))}</span> <span class="dim small">${esc(s.venueName)}</span>` },
    { label: "Return", r: true, cell: (s) => anPct(s.totalReturnPct) },
    { label: "Annualised", r: true, cell: (s) => anPct(s.annualisedReturnPct) },
    { label: "Volatility", r: true, cell: (s) => (Number.isFinite(Number(s.volatilityPct)) ? `${anNum(s.volatilityPct, 1)}%` : '<span class="dim">—</span>') },
    { label: "Drawdown", r: true, cell: (s) => anPct(s.maxDrawdownPct) },
    { label: "Best bar", r: true, cell: (s) => anPct(s.bestBarPct, 2) },
    { label: "Worst bar", r: true, cell: (s) => anPct(s.worstBarPct, 2) },
    { label: "Sharpe", r: true, cell: (s) => (Number.isFinite(Number(s.sharpe)) ? anNum(s.sharpe, 2) : '<span class="dim">—</span>') },
    { label: "Bars", r: true, cell: (s) => `<span class="dim small">${s.bars} · ${s.barsPerYear}/yr</span>` },
  ], c.stats, { cls: "an-table", rowAttr: (s) => `data-k="${esc(s.key)}"` });
  return `${legend}${chart}${rows}<p class="small dim">Rebased to 100 at the first bar every market has, over ${esc(p.range)} of ${esc(p.interval)} bars; the volatility and the Sharpe annualised by the bars a year each market showed.</p>`;
}
/** CORR: the matrix, each cell toned by its value */
function anCorrHtml(v) {
  const c = v.corr;
  if (c.keys.length < 2) return '<p class="empty">Two markets at least for a correlation.</p>';
  const keys = c.keys;
  const tone = (x) => (x === null ? "" : x >= 0.7 ? "an-hi" : x >= 0.3 ? "an-mid" : x <= -0.7 ? "an-lo" : x <= -0.3 ? "an-midlo" : "");
  return `<div class="t-wrap"><table class="t an-table an-matrix"><thead><tr><th scope="col"></th>${keys.map((k) => `<th scope="col" class="r">${esc(anName(k, keys))}</th>`).join("")}</tr></thead><tbody>${keys.map((k, i) => `<tr data-k="${esc(k)}"><th scope="row">${esc(anName(k, keys))}</th>${keys.map((_, j) => `<td class="r ${tone(c.matrix[i][j])}" title="${c.bars[i][j]} common bars">${c.matrix[i][j] === null ? '<span class="dim">—</span>' : anNum(c.matrix[i][j], 2)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small dim">The correlation of bar returns, each pair over the bars both have (the count on hover); none under ten.</p>`;
}
/** HVG: the rolling volatility lines, and where each stands */
function anHvgHtml(v) {
  const h = v.hvg;
  const keys = v.markets.map((m) => m.key);
  const w = String(h.windows[0]);
  const series = keys.map((k, i) => {
    const s = h.series[k];
    return { key: anName(k, keys), cls: anColor(i), points: s ? s.t.map((t, j) => (s.hv[w][j] === null ? null : [t, s.hv[w][j]])) : [] };
  }).filter((s) => s.points.some(Boolean));
  const vals = series.flatMap((s) => s.points.filter(Boolean).map((pt) => pt[1]));
  const chart = vals.length ? anLines(series, [0, Math.max(...vals)], { labels: anDates(series[0].points.filter(Boolean).map((pt) => pt[0])), yFmt: (x) => `${anNum(x, 0)}%` }) : '<p class="empty">Too few bars for a rolling window.</p>';
  const rows = keys.map((k) => ({ key: k, s: h.series[k] })).filter((r) => r.s);
  const tbl = table([
    { label: "Market", cell: (r) => `<span class="an-name"><span class="an-key ${anColor(keys.indexOf(r.key))}"></span> ${esc(anName(r.key, keys))}</span>` },
    ...h.windows.flatMap((win) => [
      { label: `${win}-bar now`, r: true, cell: (r) => (r.s.now && Number.isFinite(Number(r.s.now[String(win)])) ? `<b>${anNum(r.s.now[String(win)], 1)}%</b>` : '<span class="dim">—</span>') },
      { label: `low – high`, r: true, cell: (r) => (r.s.low && Number.isFinite(Number(r.s.low[String(win)])) ? `<span class="dim small">${anNum(r.s.low[String(win)], 1)}% – ${anNum(r.s.high[String(win)], 1)}%</span>` : "") },
    ]),
  ], rows, { cls: "an-table", rowAttr: (r) => `data-k="${esc(r.key)}"` });
  return `<p class="small an-legend">${series.map((s) => `<span class="an-key ${s.cls}"></span> ${esc(s.key)}`).join(" · ")} · the ${w}-bar window</p>${chart}${tbl}<p class="small dim">The annualised standard deviation of bar returns over a rolling window, by the bars a year each market showed.</p>`;
}
/** BETA: each market against the first */
function anBetaHtml(v) {
  const keys = v.markets.map((m) => m.key);
  if (keys.length < 2) return '<p class="empty">Two markets at least: the first is what the rest are measured against.</p>';
  const against = anName(keys[0], keys);
  return `${table([
    { label: "Market", cell: (r) => `<span class="an-name"><span class="an-key ${anColor(keys.indexOf(r.key))}"></span> ${esc(anName(r.key, keys))}</span>` },
    { label: `Beta to ${against}`, r: true, cell: (r) => (Number.isFinite(Number(r.beta)) ? `<b>${anNum(r.beta, 2)}</b>` : '<span class="dim">—</span>') },
    { label: "Correlation", r: true, cell: (r) => (Number.isFinite(Number(r.correlation)) ? anNum(r.correlation, 2) : '<span class="dim">—</span>') },
    { label: "R²", r: true, cell: (r) => (Number.isFinite(Number(r.r2)) ? anNum(r.r2, 2) : '<span class="dim">—</span>') },
    { label: "Alpha, annualised", r: true, cell: (r) => anPct(r.alphaPct) },
    { label: "Common bars", r: true, cell: (r) => `<span class="dim small">${r.bars}</span>` },
  ], v.beta, { cls: "an-table", rowAttr: (r) => `data-k="${esc(r.key)}"` })}<p class="small dim">The slope of each market's bar returns on ${esc(against)}'s over the bars both have, with the fit and the intercept annualised. The first market named is the one measured against: put the index first.</p>`;
}
/** SEAG: the months, and the weekdays */
function anSeagHtml(v) {
  const keys = v.markets.map((m) => m.key);
  const s = v.seag;
  const cell = (b) => (b && Number.isFinite(Number(b.avgPct)) ? `${anPct(b.avgPct)} <span class="dim small">${b.upYears}/${b.years}</span>` : '<span class="dim">—</span>');
  const months = `<div class="t-wrap"><table class="t an-table an-seag"><thead><tr><th scope="col">Month</th>${keys.map((k) => `<th scope="col" class="r">${esc(anName(k, keys))}</th>`).join("")}</tr></thead><tbody>${s.months.map((m) => `<tr data-k="${esc(m.month)}"><th scope="row">${esc(m.month)}</th>${keys.map((k) => `<td class="r">${cell(m.by[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const wk = (b) => (b && Number.isFinite(Number(b.avgPct)) ? `${anPct(b.avgPct, 3)} <span class="dim small">${Math.round((b.upShare || 0) * 100)}% up · ${b.n}</span>` : '<span class="dim">—</span>');
  const weekdays = s.weekdays.length ? `<h3 class="label an-h3">By weekday</h3><div class="t-wrap"><table class="t an-table an-seag"><thead><tr><th scope="col">Day</th>${keys.map((k) => `<th scope="col" class="r">${esc(anName(k, keys))}</th>`).join("")}</tr></thead><tbody>${s.weekdays.map((w) => `<tr data-k="${esc(w.day)}"><th scope="row">${esc(w.day)}</th>${keys.map((k) => `<td class="r">${wk(w.by[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  return `<h3 class="label an-h3">By calendar month</h3>${months}${weekdays}<p class="small dim">Each month's bars compounded and averaged over the years seen (how many were up beside); each weekday's average bar. Over ${esc(v.range)}: a longer range tells more.</p>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderAnalytics(ctx) {
  AN.ctx = ctx;
  if (AN.el !== ctx.el) {
    ctx.el.addEventListener("click", anClick);
    ctx.el.addEventListener("submit", anSubmit);
    ctx.el.addEventListener("input", anInput);
    AN.el = ctx.el;
  }
  const p = anParams(ctx.params);
  const chips = p.markets.map((k) => `<span class="chip an-chip ${anColor(p.markets.indexOf(k))}" data-k="${esc(k)}"><span class="an-key ${anColor(p.markets.indexOf(k))}"></span>${esc(anName(k, p.markets))}<button type="button" class="an-x" data-an="remove" data-key="${esc(k)}" aria-label="Remove ${esc(anName(k, p.markets))}">×</button></span>`).join("");
  const found = AN.search.items;
  const matches = AN.search.q ? (found === null ? '<p class="small dim an-found">Looking…</p>' : found.length ? `<div class="an-found">${found.map((it) => {
    const leg = typeof mkCandleLeg === "function" ? mkCandleLeg(it) : null;
    return leg ? `<button type="button" class="chip" data-an="add" data-key="${esc(`${leg.venue}|${leg.symbol}`)}">${esc(it.name || leg.symbol)} <span class="dim">· ${esc(leg.venueName || leg.venue)}</span></button>` : "";
  }).join("")}</div>` : '<p class="small dim an-found">No listed market by that name.</p>') : "";
  const presets = `<p class="small an-presets">Start from ${AN_PRESETS.map(([name, syms]) => `<button type="button" class="link" data-an="preset" data-syms="${esc(syms.join(","))}">${esc(name)}</button>`).join(" · ")}; add a market from the command line (<kbd>NVDA COMP</kbd>)</p>`;
  const form = `<form class="an-form" data-an="form"><input class="an-in" name="q" value="${esc(AN.search.q)}" placeholder="Add a market: AAPL, BTC, SPY…" aria-label="A market to add" autocomplete="off" maxlength="40" /><button type="submit" class="btn btn-sm">Find</button></form>${matches}`;
  const ranges = `<div class="seg an-ranges" role="group" aria-label="Range">${AN_RANGES.map(([r, iv]) => `<button type="button" data-an="range" data-range="${r}" aria-pressed="${String(r === p.range)}" title="${iv} bars">${r}</button>`).join("")}</div>`;
  const views = `<div class="seg an-views" role="group" aria-label="View">${AN_VIEWS.map(([v, l]) => `<button type="button" data-an="view" data-view="${v}" aria-pressed="${String(v === p.view)}">${l}</button>`).join("")}</div>`;
  const head = `<section class="sec an-card" id="an-head" data-k="head" aria-label="The markets"><div class="sec-head"><h2 class="h2">Analytics</h2>${ranges}</div><div class="an-chips">${chips || '<span class="small dim">No market yet.</span>'}</div>${form}${presets}</section>`;
  let body = "";
  if (!p.markets.length) body = `${head}<p class="empty">Name a market or two to compare them, see how they move together, their volatility, their betas and their seasons — all from the bars the account already reads.</p>`;
  else {
    const path = anPath(p);
    const r = AN.read;
    if (!r || r.path !== path || Date.now() - r.at > AN_TTL) anFetch(path);
    const good = r && r.path === path ? r.good : null;
    const failed = r && r.path === path && r.body && !(r.body.ok !== false && Array.isArray(r.body.markets)) ? refusalOf(r.body) || "the account did not answer" : "";
    const title = AN_VIEWS.find(([v]) => v === p.view)[1];
    let inner = "";
    if (good) {
      inner = p.view === "comp" ? anCompHtml(good, p) : p.view === "corr" ? anCorrHtml(good) : p.view === "hvg" ? anHvgHtml(good) : p.view === "beta" ? anBetaHtml(good) : anSeagHtml(good);
      if (Array.isArray(good.missing) && good.missing.length) inner += `<p class="mk-missing">${esc(good.missing.map((m) => `${anName(m.key, p.markets)}: ${m.why}`).join(" · "))}.</p>`;
      if (failed) inner += `<p class="mk-missing">Couldn't read the bars again just now: ${esc(failed)}. This is what was read at ${esc(nyTime(good.asOf))}.</p>`;
      inner += `<p class="small dim an-asof">Read ${esc(nyTime(good.asOf))} New York · ${esc(good.markets.map((m) => `${anName(m.key, p.markets)} at ${m.venueName}, ${m.bars} bars`).join("; "))}${Array.isArray(good.notes) && good.notes.length ? `<details class="an-foot"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}</p>`;
    } else if (failed) inner = `<div class="msg no">Couldn't read the bars: ${esc(failed)}.</div>`;
    else inner = '<div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel" style="width:70%"></span></div>';
    body = `${head}<section class="sec an-card" id="an-${p.view}" data-k="${p.view}" aria-label="${esc(title)}"><div class="sec-head"><h2 class="h2">${esc(title)}</h2>${views}</div>${inner}</section>`;
  }
  paint(ctx.el, `<div class="an">${body}</div>`);
}
/* the route moved in place */
function anGo(markets, range, view) {
  go("analytics", { ...(markets.length ? { markets: markets.join(",") } : {}), ...(range && range !== "1Y" ? { range } : {}), ...(view && view !== "comp" ? { view } : {}) }, { replace: ROUTE.tab === "analytics" });
}
function anClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-an]");
  if (!b) return;
  const p = anParams(ROUTE.params);
  if (b.dataset.an === "view") return void anGo(p.markets, p.range, b.dataset.view);
  if (b.dataset.an === "range") return void anGo(p.markets, b.dataset.range, p.view);
  if (b.dataset.an === "remove") return void anGo(p.markets.filter((k) => k !== b.dataset.key), p.range, p.view);
  if (b.dataset.an === "add") {
    AN.search = { q: "", items: null, pending: "" };
    return void anAdd(b.dataset.key, p.view);
  }
  if (b.dataset.an === "preset") return void anPreset(String(b.dataset.syms || "").split(","));
}
function anInput(e) {
  const f = e.target && e.target.closest && e.target.closest("[data-an=form]");
  if (!f || !e.target || e.target.name !== "q") return;
  anSearch(String(e.target.value || ""));
}
function anSubmit(e) {
  const f = e.target && e.target.closest && e.target.closest("[data-an=form]");
  if (!f) return;
  e.preventDefault();
  anSearch(String((f.querySelector("[name=q]") || {}).value || ""));
}
/** a market joins the set (from the page's search, a preset, or the command line's NVDA COMP), the page opened on a view */
function anAdd(key, view) {
  const p = anParams(ROUTE.tab === "analytics" ? ROUTE.params : {});
  if (!AN_KEY.test(key) || p.markets.includes(key) || p.markets.length >= AN_MOST) return void anGo(p.markets, p.range, view || p.view);
  anGo([...p.markets, key], p.range, view || p.view);
}
/* a preset: each symbol looked up among the listed markets, the first match's candle leg taken */
async function anPreset(symbols) {
  const legs = [];
  for (const sym of symbols) {
    const body = await api(`/api/account/explore?q=${encodeURIComponent(sym)}&limit=6`, { ttl: 60_000 });
    const items = body && Array.isArray(body.items) ? body.items : [];
    const it = items.find((x) => String(x.base || "").toUpperCase() === sym.toUpperCase()) || items[0];
    const leg = it && typeof mkCandleLeg === "function" ? mkCandleLeg(it) : null;
    if (leg) legs.push(`${leg.venue}|${leg.symbol}`);
  }
  const p = anParams(ROUTE.params);
  anGo([...new Set(legs)].slice(0, AN_MOST), p.range, p.view);
}
/** a function's way: with a market its leg joins, alone the view shows */
function anShow(item, view) {
  const leg = item && typeof mkCandleLeg === "function" ? mkCandleLeg(item) : null;
  if (leg) return void anAdd(`${leg.venue}|${leg.symbol}`, view);
  const p = anParams(ROUTE.tab === "analytics" ? ROUTE.params : {});
  anGo(p.markets, p.range, view);
}
