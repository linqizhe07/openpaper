/* THE SCREENER (the Markets group's page, #/screener; EQS · IMAP on the command line): every US-listed share as Nasdaq's screener lists it,
   screened by the rule in the address, as GET /api/account/screener gives it (live/screener.ts) — a form of the rule (sector, industry,
   country, market cap, price, the day's change, volume, IPO year, words), the sort, the rows that match with how many of how many, each
   opening its market; and the map (IMAP): every sector as a tile sized by market cap and coloured by the day, a sector opened into its
   industries, an industry into the table. The figures are Nasdaq's as written when the list was read, not live quotes; nothing here is
   the account's own figure. Read when the rule changes, kept half a minute here and five minutes by the account */
const EQ = { ctx: null, el: null, read: null, pending: false };
const EQ_TTL = 30_000;
const EQ_FIELDS = ["sector", "industry", "country", "capMin", "capMax", "priceMin", "priceMax", "changeMin", "changeMax", "volumeMin", "ipoFrom", "ipoTo", "q", "sort", "dir", "limit"];
const EQ_SORTS = [["marketCap", "Market cap"], ["changePct", "Day's change"], ["volume", "Volume"], ["dollarVolume", "Dollar volume"], ["price", "Price"], ["ipoYear", "IPO year"], ["symbol", "Symbol"], ["name", "Name"]];
/* the market-cap bands a terminal names, in dollars */
const EQ_CAPS = [["", "Any size"], ["200000000000-", "Mega · $200B and up"], ["10000000000-200000000000", "Large · $10B – $200B"], ["2000000000-10000000000", "Mid · $2B – $10B"], ["300000000-2000000000", "Small · $300M – $2B"], ["-300000000", "Micro · under $300M"]];
const EQ_WORD = /^[A-Za-z0-9 &'.,:/()-]{1,80}$/;
const EQ_NUM = /^-?\d{1,15}(\.\d{1,6})?$/;

/* the route's words, checked as the account checks them, so a bad word is dropped here rather than refused there */
function eqParams(params) {
  const p = params || {};
  const out = {};
  for (const k of ["sector", "industry", "country"]) if (typeof p[k] === "string" && EQ_WORD.test(p[k])) out[k] = p[k];
  for (const k of ["capMin", "capMax", "priceMin", "priceMax", "changeMin", "changeMax", "volumeMin", "ipoFrom", "ipoTo", "limit"]) if (typeof p[k] === "string" && EQ_NUM.test(p[k])) out[k] = p[k];
  if (typeof p.q === "string" && p.q.trim() && p.q.length <= 60) out.q = p.q.trim();
  if (EQ_SORTS.some(([v]) => v === p.sort)) out.sort = p.sort;
  if (p.dir === "asc" || p.dir === "desc") out.dir = p.dir;
  return { ask: out, view: p.view === "map" ? "map" : "table" };
}
const eqPath = (ask) => {
  const qs = new URLSearchParams(Object.entries(ask).filter(([k, v]) => EQ_FIELDS.includes(k) && v !== undefined && v !== ""));
  return `/api/account/screener${qs.toString() ? `?${qs}` : ""}`;
};
const eqNum = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
/* a count of shares or dollars said short: $5.1T, 47.5M */
const eqShort = (n, prefix = "") => {
  if (!Number.isFinite(Number(n))) return "—";
  const v = Math.abs(Number(n));
  const [k, suffix] = v >= 1e12 ? [1e12, "T"] : v >= 1e9 ? [1e9, "B"] : v >= 1e6 ? [1e6, "M"] : v >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${Number(n) < 0 ? "−" : ""}${prefix}${eqNum(v / k, v / k >= 100 || k === 1 ? 0 : 1)}${suffix}`;
};
/* the day's change as a tone: six steps either way, flat within a tenth */
const eqTone = (pct) => (!Number.isFinite(Number(pct)) || Math.abs(pct) < 0.1 ? "flat" : `${pct > 0 ? "up" : "dn"}${Math.min(3, Math.ceil(Math.abs(pct) / 1))}`);

function eqFetch(path) {
  if (EQ.pending === path) return;
  EQ.pending = path;
  api(path, { ttl: EQ_TTL, timeout: 30_000 }).then((body) => {
    if (EQ.pending === path) EQ.pending = false;
    const ok = !!body && body.ok !== false && Array.isArray(body.rows);
    const same = EQ.read && EQ.read.path === path;
    EQ.read = { path, at: Date.now(), body, good: ok ? body : same ? EQ.read.good : null, facets: ok ? body : EQ.read ? EQ.read.facets : null };
    if (ROUTE.tab === "screener" && EQ.ctx) paneLater("screener", eqRedraw);
  });
}
const eqRedraw = () => {
  if (ROUTE.tab === "screener" && EQ.ctx) renderScreener({ ...EQ.ctx, params: ROUTE.params });
};
const eqOpt = (value, label, on) => `<option value="${esc(value)}"${on ? " selected" : ""}>${esc(label)}</option>`;
/** THE FORM of the rule: the sectors and industries as the list has them, the countries, the bands, the figures, the words, the sort */
function eqFormHtml(ask, facets) {
  const sectors = facets && Array.isArray(facets.sectors) ? facets.sectors : [];
  const chosen = sectors.find((s) => s.name === ask.sector);
  const industries = chosen ? chosen.industries : sectors.flatMap((s) => s.industries).sort((a, b) => (a.name < b.name ? -1 : 1));
  const countries = facets && Array.isArray(facets.countries) ? facets.countries.slice(0, 30) : [];
  const band = EQ_CAPS.find(([v]) => v === `${ask.capMin || ""}-${ask.capMax || ""}`) ? `${ask.capMin || ""}-${ask.capMax || ""}` : "";
  const num = (name, label, value, step = "any", placeholder = "") => `<label class="eq-f"><span class="label">${label}</span><input type="number" name="${name}" value="${esc(value || "")}" step="${step}" placeholder="${esc(placeholder)}" inputmode="decimal" /></label>`;
  return `<form class="eq-form" data-eq="form"><div class="eq-row"><label class="eq-f"><span class="label">Sector</span><select name="sector">${eqOpt("", "Any sector", !ask.sector)}${sectors.map((s) => eqOpt(s.name, `${s.name} (${s.rows})`, s.name === ask.sector)).join("")}</select></label><label class="eq-f"><span class="label">Industry</span><select name="industry">${eqOpt("", "Any industry", !ask.industry)}${industries.map((i) => eqOpt(i.name, `${i.name} (${i.rows})`, i.name === ask.industry)).join("")}</select></label><label class="eq-f"><span class="label">Country</span><select name="country">${eqOpt("", "Any country", !ask.country)}${countries.map((c) => eqOpt(c.name, `${c.name} (${c.n})`, c.name === ask.country)).join("")}</select></label><label class="eq-f"><span class="label">Market cap</span><select name="cap">${EQ_CAPS.map(([v, l]) => eqOpt(v, l, v === band)).join("")}</select></label></div><div class="eq-row">${num("priceMin", "Price from", ask.priceMin, "0.01", "$")}${num("priceMax", "to", ask.priceMax, "0.01", "$")}${num("changeMin", "Day's change from", ask.changeMin, "0.1", "%")}${num("changeMax", "to", ask.changeMax, "0.1", "%")}${num("volumeMin", "Volume at least", ask.volumeMin, "1", "shares")}${num("ipoFrom", "IPO from", ask.ipoFrom, "1", "year")}${num("ipoTo", "to", ask.ipoTo, "1", "year")}</div><div class="eq-row"><label class="eq-f eq-q"><span class="label">Words of the name or symbol</span><input type="text" name="q" value="${esc(ask.q || "")}" maxlength="60" autocomplete="off" /></label><label class="eq-f"><span class="label">Sort by</span><select name="sort">${EQ_SORTS.map(([v, l]) => eqOpt(v, l, v === (ask.sort || "marketCap"))).join("")}</select></label><label class="eq-f"><span class="label">Order</span><select name="dir">${eqOpt("", "As usual", !ask.dir)}${eqOpt("desc", "Largest first", ask.dir === "desc")}${eqOpt("asc", "Smallest first", ask.dir === "asc")}</select></label><span class="eq-acts"><button type="submit" class="btn btn-sm">Screen</button><button type="button" class="link" data-eq="clear">Clear</button></span></div></form>`;
}
/** THE ROWS that match */
function eqRowsHtml(v) {
  if (!v.rows.length) return '<p class="empty">No share meets the rule.</p>';
  return table([
    { label: "Symbol", cell: (r) => `<button type="button" class="link eq-sym mono" data-eq="open" data-symbol="${esc(r.symbol)}">${esc(r.symbol)}</button>` },
    { label: "Name", cell: (r) => `<span class="eq-name">${esc(r.name)}</span>` },
    { label: "Last", r: true, cell: (r) => `<span class="eq-num">${eqNum(r.price, r.price >= 1 ? 2 : 4)}</span>` },
    { label: "Day", r: true, cell: (r) => chg(r.changePct) },
    { label: "Market cap", r: true, cell: (r) => eqShort(r.marketCapUsd, "$") },
    { label: "Volume", r: true, cell: (r) => `<span class="dim">${eqShort(r.volume)}</span>` },
    { label: "Sector · industry", cell: (r) => `<span class="dim small">${esc([r.sector, r.industry].filter(Boolean).join(" · ") || "—")}</span>` },
    { label: "IPO", r: true, cell: (r) => `<span class="dim small">${r.ipoYear || "—"}</span>` },
  ], v.rows, { cls: "eq-table", rowAttr: (r) => `data-k="${esc(r.symbol)}"` });
}
/* a squarified treemap: the cells' weights laid into a box, the rows kept near square (Bruls, Huizing and van Wijk) */
function eqSquarify(weights, x, y, w, h) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total || !weights.length) return [];
  const out = [];
  let items = weights.map((v, i) => ({ i, a: (v / total) * w * h })).filter((it) => it.a > 0);
  let [X, Y, W, H] = [x, y, w, h];
  const worst = (row, side) => {
    const s = row.reduce((a, it) => a + it.a, 0);
    let m = 0;
    for (const it of row) m = Math.max(m, (side * side * it.a) / (s * s), (s * s) / (side * side * it.a));
    return m;
  };
  const lay = (row) => {
    const s = row.reduce((a, it) => a + it.a, 0);
    const vertical = W >= H;
    const side = vertical ? H : W;
    const thick = s / side;
    let off = 0;
    for (const it of row) {
      const len = it.a / thick;
      out.push(vertical ? { i: it.i, x: X, y: Y + off, w: thick, h: len } : { i: it.i, x: X + off, y: Y, w: len, h: thick });
      off += len;
    }
    if (vertical) {
      X += thick;
      W -= thick;
    } else {
      Y += thick;
      H -= thick;
    }
  };
  let row = [];
  while (items.length) {
    const side = Math.min(W, H);
    const next = items[0];
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      items = items.slice(1);
    } else {
      lay(row);
      row = [];
    }
  }
  if (row.length) lay(row);
  return out;
}
/** THE MAP: the sectors, or one sector's industries, as tiles by market cap, coloured by the day */
function eqMapHtml(v, ask) {
  const sectors = Array.isArray(v.sectors) ? v.sectors : [];
  const chosen = ask.sector ? sectors.find((s) => s.name === ask.sector) : null;
  const cells = (chosen ? chosen.industries : sectors).filter((c) => c.capUsd > 0);
  if (!cells.length) return '<p class="empty">Nothing to map.</p>';
  const W = 1000;
  const H = 560;
  const boxes = eqSquarify(cells.map((c) => c.capUsd), 0, 0, W, H);
  const tiles = boxes.map((b) => {
    const c = cells[b.i];
    const big = b.w > 110 && b.h > 40;
    const tiny = b.w < 46 || b.h < 22;
    const words = `${c.name}: ${eqShort(c.capUsd, "$")}, ${Number.isFinite(Number(c.changePct)) ? `${c.changePct > 0 ? "+" : ""}${eqNum(c.changePct, 2)}%` : "no change known"}, ${c.rows} shares${c.top && c.top.length ? ` — ${c.top.slice(0, 3).map((t) => t.symbol).join(", ")}` : ""}`;
    return `<g class="eq-cell ${eqTone(c.changePct)}" data-eq="${chosen ? "industry" : "sector"}" data-name="${esc(c.name)}" tabindex="0" role="button" aria-label="${esc(words)}"><title>${esc(words)}</title><rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${Math.max(0, b.w - 2).toFixed(1)}" height="${Math.max(0, b.h - 2).toFixed(1)}" rx="3" />${tiny ? "" : `<text x="${(b.x + 6).toFixed(1)}" y="${(b.y + 16).toFixed(1)}" class="eq-cell-name">${esc(big ? c.name : c.name.slice(0, Math.max(3, Math.floor(b.w / 8))))}</text>${big ? `<text x="${(b.x + 6).toFixed(1)}" y="${(b.y + 32).toFixed(1)}" class="eq-cell-chg">${Number.isFinite(Number(c.changePct)) ? `${c.changePct > 0 ? "+" : ""}${eqNum(c.changePct, 2)}%` : "—"} · ${esc(eqShort(c.capUsd, "$"))}</text>` : ""}${big && b.h > 56 && c.top && c.top.length ? `<text x="${(b.x + 6).toFixed(1)}" y="${(b.y + 48).toFixed(1)}" class="eq-cell-top">${esc(c.top.slice(0, 3).map((t) => t.symbol).join(" · "))}</text>` : ""}`}</g>`;
  });
  return `<p class="small dim eq-map-words">${chosen ? `${esc(chosen.name)}'s industries · <button type="button" class="link" data-eq="sector" data-name="">every sector</button>` : "Every sector; a sector opens into its industries, an industry into the table"} · a tile's size is its market cap, its colour the day weighed by cap</p><svg class="eq-map" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(chosen ? `${chosen.name}'s industries by market cap` : "The sectors by market cap")}">${tiles.join("")}</svg>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderScreener(ctx) {
  EQ.ctx = ctx;
  if (EQ.el !== ctx.el) {
    ctx.el.addEventListener("click", eqClick);
    ctx.el.addEventListener("submit", eqSubmit);
    ctx.el.addEventListener("keydown", eqKey);
    EQ.el = ctx.el;
  }
  const { ask, view } = eqParams(ctx.params);
  const path = eqPath(ask);
  const r = EQ.read;
  if (!r || r.path !== path || Date.now() - r.at > EQ_TTL) eqFetch(path);
  const good = r && r.path === path ? r.good : null;
  const facets = r ? r.facets : null;
  const failed = r && r.path === path && r.body && !(r.body.ok !== false && Array.isArray(r.body.rows)) ? refusalOf(r.body) || "the account did not answer" : "";
  const views = `<div class="seg eq-views" role="group" aria-label="View"><button type="button" data-eq="view" data-view="table" aria-pressed="${String(view === "table")}">Table</button><button type="button" data-eq="view" data-view="map" aria-pressed="${String(view === "map")}">Map</button></div>`;
  const head = `<section class="sec eq-card" id="eq-rule" data-k="rule" aria-label="The rule"><div class="sec-head"><h2 class="h2">Screener</h2>${views}</div>${eqFormHtml(ask, facets)}</section>`;
  let body = "";
  if (good) {
    const count = `<span class="small dim">${good.matched.toLocaleString("en-US")} of ${good.universe.toLocaleString("en-US")} shares${good.rows.length < good.matched ? ` · the first ${good.rows.length}` : ""}</span>`;
    body = view === "map" ? `<section class="sec eq-card" id="eq-map" data-k="map" aria-label="The map"><div class="sec-head"><h2 class="h2">Sector map</h2>${count}</div>${eqMapHtml(good, ask)}</section>` : `<section class="sec eq-card" id="eq-rows" data-k="rows" aria-label="The shares"><div class="sec-head"><h2 class="h2">Shares</h2>${count}</div>${eqRowsHtml(good)}</section>`;
    body += `${failed ? `<p class="mk-missing">Couldn't read the list again just now: ${esc(failed)}. This is what was read at ${esc(nyTime(good.readAt))}.</p>` : ""}<p class="small dim eq-asof">Read ${esc(nyTime(good.readAt))} New York · ${esc(good.from)}${good.listAsOf ? esc(` · Nasdaq's list as of ${good.listAsOf}`) : ""}${Array.isArray(good.notes) && good.notes.length ? `<details class="eq-foot"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}</p>`;
  } else if (failed) body = `<div class="msg no">Couldn't read the list: ${esc(failed)}.</div>`;
  else body = '<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span></div>';
  paint(ctx.el, `<div class="eq">${head}${body}</div>`);
}
/* the route moved in place: the rule from the form, a view, a tile */
function eqGo(ask, view) {
  const clean = Object.fromEntries(Object.entries(ask).filter(([, v]) => v !== undefined && v !== "" && v !== null));
  go("screener", { ...clean, ...(view === "map" ? { view: "map" } : {}) }, { replace: ROUTE.tab === "screener" });
}
function eqClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-eq]");
  if (!b) return;
  const { ask, view } = eqParams(ROUTE.params);
  if (b.dataset.eq === "view") return void eqGo(ask, b.dataset.view);
  if (b.dataset.eq === "clear") return void eqGo({}, view);
  if (b.dataset.eq === "open" && typeof openMarket === "function") return void openMarket({ key: `stock:${b.dataset.symbol}` });
  if (b.dataset.eq === "sector") return void eqGo({ ...ask, sector: b.dataset.name || undefined, industry: undefined }, "map");
  if (b.dataset.eq === "industry") return void eqGo({ ...ask, industry: b.dataset.name || undefined }, "table");
}
function eqKey(e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const b = e.target && e.target.closest && e.target.closest("g[data-eq]");
  if (!b) return;
  e.preventDefault();
  eqClick({ target: b });
}
function eqSubmit(e) {
  const f = e.target && e.target.closest && e.target.closest("[data-eq=form]");
  if (!f) return;
  e.preventDefault();
  const val = (name) => String((f.querySelector(`[name="${name}"]`) || {}).value || "").trim();
  const [capMin, capMax] = val("cap").split("-");
  const ask = { sector: val("sector"), industry: val("industry"), country: val("country"), capMin: capMin || "", capMax: capMax || "", priceMin: val("priceMin"), priceMax: val("priceMax"), changeMin: val("changeMin"), changeMax: val("changeMax"), volumeMin: val("volumeMin"), ipoFrom: val("ipoFrom"), ipoTo: val("ipoTo"), q: val("q").slice(0, 60), sort: val("sort") === "marketCap" ? "" : val("sort"), dir: val("dir") };
  eqGo(ask, eqParams(ROUTE.params).view);
}
/** a function's way to the page (EQS · IMAP): the rule as it stands, the view asked */
function eqShow(view) {
  eqGo(ROUTE.tab === "screener" ? eqParams(ROUTE.params).ask : {}, view);
}
