/* A SECURITY'S PAGE (#/security?symbol=AAPL&part=…; DES · ANR · EE · DVD · SI · HDS on the command line): what Nasdaq's own pages say of
   one US share, as GET /api/account/security gives it (live/security.ts) — the company (name, exchange, sector, industry, the description),
   Nasdaq's last sale beside the account's own quote, the key figures, the analysts (the consensus, the targets against the price, a year of
   history), the earnings (the surprises, the quarters and years ahead, the P/E and growth), the dividends paid, the short interest by
   settlement, the holders (the institutions and the insiders). Every figure is Nasdaq's as written; nothing here is estimated or rated by
   the account, and nothing is the account's own figure. Read when the page shows, kept five minutes by the account; a function names a
   part (ANR the analysts): the page scrolls to it once drawn */
const SC = { ctx: null, el: null, read: null, pending: false, scrolled: "" };
const SC_TTL = 60_000;
const SC_PARTS = ["des", "anr", "ee", "dvd", "si", "hds"];
const SC_SYMBOL = /^[A-Z]{1,5}([.-][A-Z])?$/;
const SC_LAST_KEY = "sc.symbol";

/* the route's words, checked: a ticker (the last one read, else nothing), a part to scroll to */
function scParams(params) {
  const p = params || {};
  const raw = String(p.symbol || "").trim().toUpperCase();
  let last = "";
  try {
    last = String(localStorage.getItem(SC_LAST_KEY) || "");
  } catch {
    last = "";
  }
  return { symbol: SC_SYMBOL.test(raw) ? raw : SC_SYMBOL.test(last) ? last : "", part: SC_PARTS.includes(p.part) ? p.part : "" };
}
const scPath = (symbol) => `/api/account/security?symbol=${encodeURIComponent(symbol)}`;
const scNum = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const scInt = (n) => (!Number.isFinite(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("en-US"));
/* a count of shares or dollars said short: 14.5B, 47.5M, 694.9K */
const scShort = (n, prefix = "") => {
  if (!Number.isFinite(Number(n))) return "—";
  const v = Math.abs(Number(n));
  const sign = Number(n) < 0 ? "−" : "";
  const [k, suffix] = v >= 1e12 ? [1e12, "T"] : v >= 1e9 ? [1e9, "B"] : v >= 1e6 ? [1e6, "M"] : v >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${sign}${prefix}${scNum(v / k, v / k >= 100 || k === 1 ? 0 : 1)}${suffix}`;
};
const scPct = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : `${scNum(n, digits)}%`);
const scDay = (iso) => (typeof mkDate === "function" && iso ? mkDate(iso) : iso || "—");
const scSigned = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${scNum(Math.abs(n), digits)}`);
const scUpDown = (n, html) => `<span class="${n > 0 ? "up" : n < 0 ? "down" : "flat"}">${html}</span>`;
const scDash = '<span class="dim">—</span>';

function scFetch(path) {
  if (SC.pending === path) return;
  SC.pending = path;
  api(path, { ttl: SC_TTL, timeout: 30_000 }).then((body) => {
    if (SC.pending === path) SC.pending = false;
    const ok = !!body && body.ok !== false && Array.isArray(body.parts);
    const same = SC.read && SC.read.path === path;
    SC.read = { path, at: Date.now(), body, good: ok ? body : same ? SC.read.good : null };
    if (ok) {
      try {
        localStorage.setItem(SC_LAST_KEY, body.symbol);
      } catch {
        /* a browser that keeps nothing: the route still says */
      }
    }
    if (ROUTE.tab === "security" && SC.ctx) paneLater("security", scRedraw);
  });
}
const scRedraw = () => {
  if (ROUTE.tab === "security" && SC.ctx) renderSecurity({ ...SC.ctx, params: ROUTE.params });
};
const scCard = (id, title, sub, body) => `<section class="sec sc-card" id="sc-${id}" data-k="${id}" aria-label="${esc(title)}"><div class="sec-head"><h2 class="h2">${esc(title)}</h2>${sub ? `<span class="small dim">${sub}</span>` : ""}</div>${body}</section>`;
const scTile = (label, html, title) => `<div class="sc-stat"${title ? ` title="${esc(title)}"` : ""}><span class="label">${esc(label)}</span><b>${html}</b></div>`;

/** THE HEAD: who it is, Nasdaq's last sale, the ways to its other pages, the key figures, the description */
function scHeadHtml(v) {
  const q = v.quote || {};
  const s = v.stats || {};
  const who = [v.exchange, v.sector, v.industry].filter(Boolean).map(esc).join(" · ");
  const quote = `<p class="sc-quote"><span class="sc-num">${Number.isFinite(Number(q.last)) ? scNum(q.last, q.last >= 100 ? 2 : 4) : "—"}</span>${Number.isFinite(Number(q.change)) ? ` ${scUpDown(q.change, scSigned(q.change))} ${chg(q.changePct)}` : ""}${q.marketStatus ? ` <span class="tag">${esc(q.marketStatus)}</span>` : ""}${Number.isFinite(Number(q.close)) && q.close !== q.last ? ` <span class="dim small">closed at ${scNum(q.close, 2)}${Number.isFinite(Number(q.closeChangePct)) ? ` (${scSigned(q.closeChangePct)}%)` : ""}</span>` : ""}<span class="dim small"> · Nasdaq's last sale${q.at ? `, ${esc(q.at)}` : ""}${q.realTime ? ", real time" : ""}</span></p>`;
  const ways = `<p class="sc-ways"><button type="button" class="btn btn-sm" data-sc="market">Market</button><button type="button" class="btn btn-sm" data-sc="options">Options</button><button type="button" class="btn btn-sm" data-sc="news">News</button><button type="button" class="btn btn-sm" data-sc="earnings">Earnings calendar</button><button type="button" class="btn btn-sm" data-sc="filings">Filings</button></p>`;
  const tiles = [
    scTile("Previous close", scNum(s.previousClose, 2)),
    scTile("Day's range", Number.isFinite(Number(s.dayLow)) && Number.isFinite(Number(s.dayHigh)) ? `${scNum(s.dayLow, 2)} – ${scNum(s.dayHigh, 2)}` : "—"),
    scTile("52-week range", Number.isFinite(Number(s.week52Low)) && Number.isFinite(Number(s.week52High)) ? `${scNum(s.week52Low, 2)} – ${scNum(s.week52High, 2)}` : "—"),
    scTile("Volume · average", `${scShort(s.volume)} <span class="dim small">· ${scShort(s.averageVolume)}</span>`),
    scTile("Market cap", scShort(s.marketCapUsd, "$")),
    scTile("Shares outstanding", scShort(s.sharesOutstanding)),
    scTile("Dividend · yield", Number.isFinite(Number(s.annualDividend)) ? `$${scNum(s.annualDividend, 2)} <span class="dim small">· ${scPct(s.dividendYieldPct)}</span>` : "—"),
    scTile("Ex-dividend · pay", s.exDividend ? `${esc(scDay(s.exDividend))}${s.payDate ? ` <span class="dim small">· ${esc(scDay(s.payDate))}</span>` : ""}` : "—"),
    scTile("P/E", Number.isFinite(Number(s.peRatio)) ? scNum(s.peRatio, 1) : "—", "Nasdaq's trailing price to earnings"),
    scTile("Forward PEG", Number.isFinite(Number(s.forwardPeg)) ? scNum(s.forwardPeg, 2) : "—", "Nasdaq's forecast twelve-month forward PEG"),
    scTile("1-year target", Number.isFinite(Number(s.oneYearTarget)) ? scNum(s.oneYearTarget, 2) : "—", "the analysts' one-year target as Nasdaq shows it"),
    scTile("Held by institutions", scPct(s.institutionalPct)),
  ];
  const missing = Array.isArray(v.missing) && v.missing.length ? `<p class="small dim sc-missing">${esc(v.missing.map((m) => m.why).join(" · "))}.</p>` : "";
  return scCard("des", `${v.name || v.symbol}`, `${esc(v.symbol)}${v.stockType ? ` · ${esc(v.stockType)}` : ""}${v.nasdaq100 ? ' · <span class="tag">Nasdaq-100</span>' : ""}`, `${who ? `<p class="sc-who">${who}</p>` : ""}${quote}${ways}<div class="sc-stats">${tiles.join("")}</div>${v.description ? `<p class="sc-desc">${esc(v.description)}</p>` : ""}${missing}`);
}
/** THE ANALYSTS: the consensus and how many stand behind it, buy / hold / sell as a bar, the targets against the price, a year of history */
function scAnalystsHtml(v) {
  const a = v.analysts;
  if (!a) return scCard("anr", "Analysts", "", `<p class="empty">Nasdaq has no analyst consensus for ${esc(v.symbol)}.</p>`);
  const n = (a.buy || 0) + (a.hold || 0) + (a.sell || 0);
  const bar = n ? `<div class="sc-bar" role="img" aria-label="${esc(`${a.buy || 0} buy, ${a.hold || 0} hold, ${a.sell || 0} sell`)}"><span class="buy" style="width:${((a.buy || 0) / n) * 100}%"></span><span class="hold" style="width:${((a.hold || 0) / n) * 100}%"></span><span class="sell" style="width:${((a.sell || 0) / n) * 100}%"></span></div><p class="small sc-bar-words"><span class="up">${a.buy || 0} buy</span> · ${a.hold || 0} hold · <span class="down">${a.sell || 0} sell</span></p>` : "";
  const last = v.quote && v.quote.last;
  const vs = (t) => (Number.isFinite(Number(t)) && Number.isFinite(Number(last)) && last > 0 ? ` <span class="${t > last ? "up" : t < last ? "down" : "flat"} small">${scSigned(((t - last) / last) * 100, 1)}%</span>` : "");
  const targets = Number.isFinite(Number(a.targetMean)) ? `<div class="sc-stats"><div class="sc-stat"><span class="label">Low target</span><b>${scNum(a.targetLow, 2)}${vs(a.targetLow)}</b></div><div class="sc-stat"><span class="label">Mean target</span><b>${scNum(a.targetMean, 2)}${vs(a.targetMean)}</b></div><div class="sc-stat"><span class="label">High target</span><b>${scNum(a.targetHigh, 2)}${vs(a.targetHigh)}</b></div></div>` : "";
  const history = a.history && a.history.length ? table([
    { label: "Month", cell: (h) => esc(h.month || "—") },
    { label: "Consensus", cell: (h) => esc(h.consensus || "—") },
    { label: "Buy", r: true, cell: (h) => scInt(h.buy) },
    { label: "Hold", r: true, cell: (h) => scInt(h.hold) },
    { label: "Sell", r: true, cell: (h) => scInt(h.sell) },
    { label: "Target", r: true, cell: (h) => scNum(h.target, 2) },
  ], [...a.history].reverse(), { cls: "sc-table", rowAttr: (h) => `data-k="${esc(h.month || "")}"` }) : "";
  return scCard("anr", "Analysts", a.rating ? `<b>${esc(a.rating)}</b>${a.count ? ` · ${a.count} analysts` : ""}` : esc(a.summary || ""), `${bar}${targets}${history}<p class="small dim">${esc(a.summary || "")}${a.summary ? " " : ""}Nasdaq's count of the analysts it follows; the targets are theirs.</p>`);
}
/** THE EARNINGS: the surprises, the quarters and years ahead, the P/E and growth Nasdaq shows */
function scEarningsHtml(v) {
  const e = v.earnings;
  if (!e) return scCard("ee", "Earnings", "", `<p class="empty">Nasdaq has no earnings figures for ${esc(v.symbol)}.</p>`);
  const surprises = e.surprises.length ? table([
    { label: "Quarter", cell: (r) => esc(r.quarter || "—") },
    { label: "Reported", cell: (r) => esc(scDay(r.reported)) },
    { label: "EPS", r: true, cell: (r) => `<span class="sc-num">${scNum(r.eps, 2)}</span>` },
    { label: "Consensus", r: true, cell: (r) => scNum(r.consensus, 2) },
    { label: "Surprise", r: true, cell: (r) => (Number.isFinite(Number(r.surprisePct)) ? scUpDown(r.surprisePct, `${scSigned(r.surprisePct, 2)}%`) : scDash) },
  ], e.surprises, { cls: "sc-table", rowAttr: (r) => `data-k="${esc(r.quarter || "")}"` }) : '<p class="empty">No quarter reported yet.</p>';
  const ahead = (rows) => table([
    { label: "Period", cell: (r) => esc(r.period || "—") },
    { label: "Consensus EPS", r: true, cell: (r) => `<span class="sc-num">${scNum(r.consensus, 2)}</span>` },
    { label: "Low – high", r: true, cell: (r) => (Number.isFinite(Number(r.low)) && Number.isFinite(Number(r.high)) ? `<span class="dim">${scNum(r.low, 2)} – ${scNum(r.high, 2)}</span>` : scDash) },
    { label: "Estimates", r: true, cell: (r) => scInt(r.estimates) },
    { label: "Revisions ↑ / ↓", r: true, cell: (r) => `<span class="up">${scInt(r.revisionsUp)}</span> / <span class="down">${scInt(r.revisionsDown)}</span>` },
  ], rows, { cls: "sc-table", rowAttr: (r) => `data-k="${esc(r.period || "")}"` });
  const pe = e.pe.length ? `<p class="small sc-pe"><span class="label">P/E</span> ${e.pe.map((p) => `${esc(p.period)} <b>${scNum(p.value, 1)}</b>`).join(" · ")}${e.growth.length ? ` <span class="dim">·</span> <span class="label">Growth</span> ${e.growth.map((p) => `${esc(p.period)} <b>${scPct(p.value, 1)}</b>`).join(" · ")}` : ""}</p>` : "";
  return scCard("ee", "Earnings", "the last quarters against consensus · the quarters and years ahead", `<h3 class="label sc-h3">Reported</h3>${surprises}${e.quarters.length ? `<h3 class="label sc-h3">Quarters ahead</h3>${ahead(e.quarters)}` : ""}${e.years.length ? `<h3 class="label sc-h3">Years ahead</h3>${ahead(e.years)}` : ""}${pe}<p class="small dim">The consensus, the estimates and their revisions over the last four weeks are the analysts' as Nasdaq counts them.</p>`);
}
/** THE DIVIDENDS paid */
function scDividendsHtml(v) {
  const s = v.stats || {};
  const head = Number.isFinite(Number(s.annualDividend)) || Number.isFinite(Number(s.dividendYieldPct)) ? `<div class="sc-stats">${scTile("Annual dividend", Number.isFinite(Number(s.annualDividend)) ? `$${scNum(s.annualDividend, 2)}` : "—")}${scTile("Yield", scPct(s.dividendYieldPct))}${scTile("Payout ratio", scPct(s.payoutRatioPct, 1))}${scTile("Next ex-dividend", esc(scDay(s.exDividend)))}</div>` : "";
  const rows = v.dividends || [];
  const tbl = rows.length ? table([
    { label: "Ex-date", cell: (r) => esc(scDay(r.exDate)) },
    { label: "Amount", r: true, cell: (r) => `<span class="sc-num">${Number.isFinite(Number(r.amount)) ? `$${scNum(r.amount, r.amount < 0.1 ? 4 : 2)}` : "—"}</span>` },
    { label: "Type", cell: (r) => esc(r.type || "—") },
    { label: "Declared", cell: (r) => esc(scDay(r.declared)) },
    { label: "Record", cell: (r) => esc(scDay(r.record)) },
    { label: "Payment", cell: (r) => esc(scDay(r.payment)) },
  ], rows, { cls: "sc-table", rowAttr: (r, i) => `data-k="${esc(`${r.exDate || i}`)}"` }) : `<p class="empty">Nasdaq lists no dividend paid by ${esc(v.symbol)}.</p>`;
  return scCard("dvd", "Dividends", rows.length ? `${rows.length} paid, the newest first` : "", `${head}${tbl}`);
}
/** THE SHORT INTEREST by settlement */
function scShortHtml(v) {
  const rows = v.shortInterest || [];
  const s = v.stats || {};
  const latest = rows[0];
  const pctOut = latest && Number.isFinite(Number(latest.shares)) && Number.isFinite(Number(s.sharesOutstanding)) && s.sharesOutstanding > 0 ? (latest.shares / s.sharesOutstanding) * 100 : undefined;
  const head = latest ? `<div class="sc-stats">${scTile("Short interest", scShort(latest.shares), `as of the ${scDay(latest.settlement)} settlement`)}${scTile("Of shares outstanding", scPct(pctOut, 2), "the latest short interest over the shares outstanding Nasdaq counts")}${scTile("Days to cover", scNum(latest.daysToCover, 2), "the short interest over the average daily volume, as Nasdaq computes it")}${rows[1] && Number.isFinite(Number(rows[1].shares)) && rows[1].shares > 0 ? scTile("Change on the settlement before", scUpDown(latest.shares - rows[1].shares, `${scSigned(((latest.shares - rows[1].shares) / rows[1].shares) * 100, 1)}%`)) : ""}</div>` : "";
  const tbl = rows.length ? table([
    { label: "Settlement", cell: (r) => esc(scDay(r.settlement)) },
    { label: "Shares short", r: true, cell: (r) => `<span class="sc-num">${scInt(r.shares)}</span>` },
    { label: "Avg daily volume", r: true, cell: (r) => scInt(r.avgDailyVolume) },
    { label: "Days to cover", r: true, cell: (r) => scNum(r.daysToCover, 2) },
  ], rows, { cls: "sc-table", rowAttr: (r, i) => `data-k="${esc(`${r.settlement || i}`)}"` }) : `<p class="empty">Nasdaq has no short interest for ${esc(v.symbol)}.</p>`;
  return scCard("si", "Short interest", rows.length ? "twice a month, as FINRA's members report it to Nasdaq" : "", `${head}${tbl}`);
}
/** THE HOLDERS: the institutions, then the insiders */
function scHoldersHtml(v) {
  const i = v.institutions;
  const n = v.insiders;
  if (!i && !n) return scCard("hds", "Holders", "", `<p class="empty">Nasdaq has no holders for ${esc(v.symbol)}.</p>`);
  const pos = (p) => (p ? `${scInt(p.holders)} <span class="dim small">· ${scShort(p.shares)} sh</span>` : "—");
  const inst = i ? `<h3 class="label sc-h3">Institutions</h3><div class="sc-stats">${scTile("Held by institutions", scPct(i.pct, 2))}${scTile("Holders", pos(i.total))}${scTile("Increased", pos(i.increased))}${scTile("Decreased", pos(i.decreased))}${scTile("New", pos(i.opened))}${scTile("Sold out", pos(i.soldOut))}</div>${i.holders && i.holders.length ? table([
    { label: "Holder", cell: (h) => `<span class="sc-name">${esc(h.name || "—")}</span>` },
    { label: "As of", cell: (h) => esc(scDay(h.date)) },
    { label: "Shares", r: true, cell: (h) => scInt(h.shares) },
    { label: "Change", r: true, cell: (h) => (Number.isFinite(Number(h.change)) ? scUpDown(h.change, `${scSigned(h.change, 0)}${Number.isFinite(Number(h.changePct)) ? ` <span class="small">(${scSigned(h.changePct, 1)}%)</span>` : ""}`) : scDash) },
    { label: "Value", r: true, cell: (h) => scShort(h.valueUsd, "$") },
  ], i.holders, { cls: "sc-table", rowAttr: (h, k) => `data-k="${esc(`${h.name || k}`)}"` }) : ""}` : "";
  const ins = n ? `<h3 class="label sc-h3">Insiders</h3><div class="sc-stats">${scTile("Buys · sells, 3 months", `<span class="up">${scInt(n.buys3m)}</span> · <span class="down">${scInt(n.sells3m)}</span>`)}${scTile("Buys · sells, 12 months", `<span class="up">${scInt(n.buys12m)}</span> · <span class="down">${scInt(n.sells12m)}</span>`)}${scTile("Net shares, 3 months", Number.isFinite(Number(n.net3m)) ? scUpDown(n.net3m, scSigned(n.net3m, 0)) : "—")}${scTile("Net shares, 12 months", Number.isFinite(Number(n.net12m)) ? scUpDown(n.net12m, scSigned(n.net12m, 0)) : "—")}</div>${n.trades && n.trades.length ? table([
    { label: "Insider", cell: (t) => `<span class="sc-name">${esc(t.insider || "—")}</span>${t.relation ? ` <span class="dim small">${esc(t.relation)}</span>` : ""}` },
    { label: "Date", cell: (t) => esc(scDay(t.date)) },
    { label: "Transaction", cell: (t) => `${esc(t.type || "—")}${t.ownType ? ` <span class="dim small">${esc(t.ownType)}</span>` : ""}` },
    { label: "Shares", r: true, cell: (t) => scInt(t.shares) },
    { label: "Price", r: true, cell: (t) => (Number.isFinite(Number(t.price)) ? scNum(t.price, 2) : scDash) },
    { label: "Held after", r: true, cell: (t) => scInt(t.held) },
  ], n.trades, { cls: "sc-table", rowAttr: (t, k) => `data-k="${esc(`${t.insider || ""}|${t.date || ""}|${k}`)}"` }) : '<p class="small dim">No insider trade listed.</p>'}` : "";
  return scCard("hds", "Holders", "from the filings Nasdaq collects", `${inst}${ins}`);
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderSecurity(ctx) {
  SC.ctx = ctx;
  if (SC.el !== ctx.el) {
    ctx.el.addEventListener("click", scClick);
    ctx.el.addEventListener("submit", scSubmit);
    SC.el = ctx.el;
  }
  const p = scParams(ctx.params);
  const form = `<form class="sc-form" data-sc="form"><input class="sc-in mono" name="symbol" data-sc="symbol" value="${esc(p.symbol)}" placeholder="AAPL · BRK.B · SPY" aria-label="Ticker" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="10" /><button type="submit" class="btn btn-sm">Read</button><span class="small dim">A US share or ETF by its ticker; from the command line, <kbd>AAPL DES</kbd></span></form>`;
  if (!p.symbol) {
    paint(ctx.el, `<div class="sc">${scCard("des", "Security", "", `${form}<p class="empty">Name a US share to read its page: the company, the figures, the analysts, the earnings, the dividends, the short interest, the holders — what Nasdaq's pages say of it, as written.</p>`)}</div>`);
    return;
  }
  const path = scPath(p.symbol);
  const r = SC.read;
  if (!r || r.path !== path || Date.now() - r.at > SC_TTL) scFetch(path);
  const good = r && r.path === path ? r.good : null;
  const failed = r && r.path === path && r.body && !(r.body.ok !== false && Array.isArray(r.body.parts)) ? refusalOf(r.body) || "the account did not answer" : "";
  let body = "";
  if (good) {
    body = `${form}${scHeadHtml(good)}${good.kind === "etf" ? "" : `${scAnalystsHtml(good)}${scEarningsHtml(good)}`}${scDividendsHtml(good)}${scShortHtml(good)}${good.kind === "etf" ? "" : scHoldersHtml(good)}${failed ? `<p class="mk-missing">Couldn't read the page again just now: ${esc(failed)}. This is what was read at ${esc(nyTime(good.readAt))}.</p>` : ""}<p class="small dim sc-asof">Read ${esc(nyTime(good.readAt))} New York · ${esc(good.from)}${Array.isArray(good.notes) && good.notes.length ? `<details class="sc-foot"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}</p>`;
  } else if (failed) body = `${form}<div class="msg no">Couldn't read ${esc(p.symbol)}: ${esc(failed)}.</div>`;
  else body = `${form}<div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span></div>`;
  paint(ctx.el, `<div class="sc">${body}</div>`);
  const want = p.part ? `${p.part}:${p.symbol}` : "";
  if (good && want && SC.scrolled !== want) {
    SC.scrolled = want;
    nextFrame(() => {
      const el = ctx.el.querySelector && ctx.el.querySelector(`#sc-${p.part}`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    });
  }
}
function scClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-sc]");
  if (!b) return;
  const p = scParams(ROUTE.params);
  if (!p.symbol) return;
  const key = `stock:${p.symbol}`;
  if (b.dataset.sc === "market") return void (typeof openMarket === "function" && openMarket({ key }));
  if (b.dataset.sc === "options") return void (typeof opGo === "function" ? opGo(p.symbol, "chain") : go("options", { symbol: p.symbol }));
  if (b.dataset.sc === "news") return void go("news", { symbol: p.symbol });
  if (b.dataset.sc === "earnings") return void go("calendar", { kind: "earnings", symbol: p.symbol });
  if (b.dataset.sc === "filings" && typeof openMarket === "function") {
    openMarket({ key });
    if (typeof drawerLater === "function") drawerLater(() => nextFrame(() => {
      const el = $("drawer").querySelector('[data-sec="company"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    }));
  }
}
function scSubmit(e) {
  const f = e.target && e.target.closest && e.target.closest("[data-sc=form]");
  if (!f) return;
  e.preventDefault();
  const v = String((f.querySelector("[data-sc=symbol]") || {}).value || "").trim().toUpperCase();
  if (SC_SYMBOL.test(v)) go("security", { symbol: v }, { replace: true });
}
/** a function's way to the page (DES · ANR · EE · DVD · SI · HDS): the share, and the part brought into view — in place where the page already shows */
function scGo(symbol, part) {
  SC.scrolled = "";
  go("security", { symbol, ...(part && part !== "des" ? { part } : {}) }, { replace: ROUTE.tab === "security" });
}
onRoute((tab) => {
  if (tab !== "security") SC.scrolled = "";
});
