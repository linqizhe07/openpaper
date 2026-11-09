/* THE RISK PAGE (the Account's fourth tab, #/risk; RISK on the command line): the account's own lines weighed and measured, as GET
   /api/account/risk gives them (live/risk.ts) — the exposure (net, gross, long, short, by class, by venue, the concentration), each line's
   volatility and share of the whole, the portfolio's volatility and one-day value at risk read off its own days, the betas to SPY and
   BTC, the net worth's drawdown, what a flat move would be. Arithmetic over the account's balances and the bars the account already reads;
   nothing is a forecast, and nothing here is a venue's figure. Read when the page shows, kept a minute here; drawn in place */
const RK = { ctx: null, el: null, read: null, pending: false };
const RK_TTL = 60_000;
const rkNum = (n, digits = 2) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const rkUsd = (n) => (!Number.isFinite(Number(n)) ? "—" : `${n < 0 ? "−" : ""}$${rkNum(Math.abs(n), Math.abs(n) >= 100 ? 0 : 2)}`);
const rkPct = (n, digits = 1) => (!Number.isFinite(Number(n)) ? '<span class="dim">—</span>' : `${rkNum(n, digits)}%`);
const rkSigned = (n, digits = 1) => (!Number.isFinite(Number(n)) ? '<span class="dim">—</span>' : `<span class="${n > 0 ? "up" : n < 0 ? "down" : "flat"}">${n > 0 ? "+" : n < 0 ? "−" : ""}${rkNum(Math.abs(n), digits)}%</span>`);
const rkTile = (label, html, title) => `<div class="rk-stat"${title ? ` title="${esc(title)}"` : ""}><span class="label">${esc(label)}</span><b>${html}</b></div>`;
const rkCard = (id, title, sub, body) => `<section class="sec rk-card" id="rk-${id}" data-k="${id}" aria-label="${esc(title)}"><div class="sec-head"><h2 class="h2">${esc(title)}</h2>${sub ? `<span class="small dim">${sub}</span>` : ""}</div>${body}</section>`;

function rkFetch() {
  if (RK.pending) return;
  RK.pending = true;
  api("/api/account/risk", { ttl: RK_TTL, timeout: 60_000 }).then((body) => {
    RK.pending = false;
    const ok = !!body && body.ok !== false && Array.isArray(body.lines);
    RK.read = { at: Date.now(), body, good: ok ? body : RK.read ? RK.read.good : null };
    if (ROUTE.tab === "risk" && RK.ctx) paneLater("risk", rkRedraw);
  });
}
const rkRedraw = () => {
  if (ROUTE.tab === "risk" && RK.ctx) renderRisk({ ...RK.ctx, params: ROUTE.params });
};
/** the portfolio's figures as tiles */
function rkHeadHtml(v) {
  const p = v.portfolio || {};
  const d = v.drawdown || {};
  const tiles = [
    rkTile("Net exposure", rkUsd(v.netUsd), "every line's dollars added up, a short's negative"),
    rkTile("Gross", `${rkUsd(v.grossUsd)} <span class="dim small">${rkUsd(v.longUsd)} long · ${rkUsd(v.shortUsd)} short</span>`, "every line's absolute dollars"),
    rkTile("Priced", `${rkPct(p.pricedPct)} <span class="dim small">of the gross · ${p.days || 0} days</span>`, "the share of the gross with a year of daily bars behind it, and the days every priced line has in common"),
    rkTile("Volatility", Number.isFinite(Number(p.volatilityPct)) ? `${rkPct(p.volatilityPct)} <span class="dim small">annualised</span>` : '<span class="dim">—</span>', "the annualised standard deviation of the portfolio's own daily returns"),
    rkTile("VaR 95 %, one day", Number.isFinite(Number(p.var95Usd)) ? `${rkUsd(p.var95Usd)} <span class="dim small">${rkPct(p.var95Pct)} · normal ${rkUsd(p.normalVar95Usd)}</span>` : '<span class="dim">—</span>', "the 5th percentile of the portfolio's own daily returns, as a loss; the normal distribution's figure beside it"),
    rkTile("VaR 99 %, one day", Number.isFinite(Number(p.var99Usd)) ? `${rkUsd(p.var99Usd)} <span class="dim small">${rkPct(p.var99Pct)} · normal ${rkUsd(p.normalVar99Usd)}</span>` : '<span class="dim">—</span>', "the 1st percentile"),
    rkTile("Expected shortfall 95 %", rkUsd(p.es95Usd), "the average loss on the days beyond the 95 % line"),
    rkTile("Worst · best day", Number.isFinite(Number(p.worstDayPct)) ? `${rkSigned(p.worstDayPct, 2)} <span class="dim small">${esc(p.worstDay || "")}</span> · ${rkSigned(p.bestDayPct, 2)}` : '<span class="dim">—</span>', "of the portfolio's own daily returns over the common days"),
    rkTile("Drawdown", d.points ? `${rkSigned(d.maxPct)} <span class="dim small">deepest · now ${rkNum(d.currentPct, 1)}%</span>` : '<span class="dim">—</span>', d.points ? `the net worth curve from each peak: the deepest ${d.maxFrom ? `from ${d.maxFrom.slice(0, 10)} to ${d.maxTo.slice(0, 10)}` : ""}; the peak ${rkUsd(d.peakUsd)} on ${(d.peakAt || "").slice(0, 10)}` : ""),
  ];
  return `<div class="rk-stats">${tiles.join("")}</div>`;
}
/** the latest days of the portfolio's returns as a strip of bars */
function rkStripHtml(recent) {
  if (!Array.isArray(recent) || recent.length < 2) return "";
  const W = 720;
  const H = 90;
  const top = Math.max(...recent.map((r) => Math.abs(r.pct)), 0.01);
  const w = W / recent.length;
  const y0 = H / 2;
  const bars = recent.map((r, i) => {
    const h = (Math.abs(r.pct) / top) * (H / 2 - 4);
    return `<rect class="${r.pct >= 0 ? "up" : "down"}" x="${(i * w + 0.5).toFixed(1)}" y="${(r.pct >= 0 ? y0 - h : y0).toFixed(1)}" width="${Math.max(0.5, w - 1).toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(`${new Date(r.t).toISOString().slice(0, 10)}: ${r.pct > 0 ? "+" : ""}${rkNum(r.pct, 2)}%`)}</title></rect>`;
  });
  return `<svg class="rk-strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="The portfolio's daily returns, the latest ${recent.length} days"><line x1="0" x2="${W}" y1="${y0}" y2="${y0}" class="rk-zero" />${bars.join("")}</svg><p class="small dim">The portfolio's own daily return over the latest ${recent.length} common days; the tallest bar ${rkNum(top, 2)}%.</p>`;
}
/** the lines, the largest first */
function rkLinesHtml(v) {
  if (!v.lines.length) return '<p class="empty">Nothing held.</p>';
  return table([
    { label: "Line", cell: (l) => `<span class="rk-name">${esc(l.name)}</span> <span class="dim small">${esc(l.class)}${l.venueName ? ` · ${esc(l.venueName)}` : ""}${l.leverage ? ` · ${esc(String(l.leverage))}×` : ""}</span>` },
    { label: "Dollars", r: true, cell: (l) => `<span class="${l.usd < 0 ? "down" : ""}">${rkUsd(l.usd)}</span>` },
    { label: "Weight", r: true, cell: (l) => `<span class="rk-num">${rkNum(l.weightPct, 1)}%</span>` },
    { label: "Volatility", r: true, cell: (l) => rkPct(l.volatilityPct) },
    { label: "Share of risk", r: true, cell: (l) => rkPct(l.riskContributionPct) },
    { label: "Own VaR 95 %", r: true, cell: (l) => rkUsd(l.var95Usd) },
    { label: "Bars", r: true, cell: (l) => `<span class="dim small">${l.bars}</span>` },
  ], v.lines, { cls: "rk-table", rowAttr: (l) => `data-k="${esc(l.key)}"` });
}
/** by class and by venue, side by side, with the concentration */
function rkGroupsHtml(v) {
  const c = v.concentration || {};
  const grp = (title, rows, label, cell) => `<div class="rk-group"><h3 class="label rk-h3">${title}</h3>${rows.length ? table([
    { label, cell: (r) => esc(cell(r)) },
    { label: "Dollars", r: true, cell: (r) => rkUsd(r.usd) },
    { label: "Weight", r: true, cell: (r) => `${rkNum(r.weightPct, 1)}%` },
    { label: "Lines", r: true, cell: (r) => `<span class="dim small">${r.lines}</span>` },
  ], rows, { cls: "rk-table rk-small", rowAttr: (r) => `data-k="${esc(r.name || r.venue)}"` }) : '<p class="small dim">—</p>'}</div>`;
  const conc = `<div class="rk-group"><h3 class="label rk-h3">Concentration</h3><div class="rk-stats rk-stats-2">${rkTile("Largest line", rkPct(c.top1Pct), "its share of the gross")}${rkTile("Top three", rkPct(c.top3Pct))}${rkTile("Herfindahl", Number.isFinite(Number(c.hhi)) ? rkNum(c.hhi, 3) : '<span class="dim">—</span>', "the sum of the squared weights: 1 is one line, 0 many equal ones")}${rkTile("Effective lines", Number.isFinite(Number(c.effective)) ? rkNum(c.effective, 1) : '<span class="dim">—</span>', "one over the Herfindahl index")}</div></div>`;
  return `<div class="rk-groups">${grp("By class", v.byClass || [], "Class", (r) => r.name)}${grp("By venue", v.byVenue || [], "Venue", (r) => r.venueName)}${conc}</div>`;
}
/** the betas and the stresses */
function rkBetaStressHtml(v) {
  const b = v.benchmarks || [];
  const betas = b.length ? table([
    { label: "Benchmark", cell: (r) => `<span class="rk-name">${esc(r.name)}</span>` },
    { label: "Beta", r: true, cell: (r) => (Number.isFinite(Number(r.beta)) ? `<b>${rkNum(r.beta, 2)}</b>` : '<span class="dim">—</span>') },
    { label: "Correlation", r: true, cell: (r) => (Number.isFinite(Number(r.correlation)) ? rkNum(r.correlation, 2) : '<span class="dim">—</span>') },
    { label: "Common days", r: true, cell: (r) => `<span class="dim small">${r.days}</span>` },
  ], b, { cls: "rk-table rk-small", rowAttr: (r) => `data-k="${esc(r.key)}"` }) : '<p class="small dim">No benchmark the account lists has bars.</p>';
  const stress = table([
    { label: "Move", cell: (s) => esc(s.name) },
    { label: "Dollars", r: true, cell: (s) => `<span class="${s.usd < 0 ? "down" : s.usd > 0 ? "up" : "flat"}">${rkUsd(s.usd)}</span>` },
    { label: "Of the gross", r: true, cell: (s) => rkSigned(s.pct) },
  ], v.stress || [], { cls: "rk-table rk-small", rowAttr: (s) => `data-k="${esc(s.name)}"` });
  return `<div class="rk-groups"><div class="rk-group"><h3 class="label rk-h3">Beta of the portfolio</h3>${betas}</div><div class="rk-group"><h3 class="label rk-h3">What a flat move would be</h3>${stress}</div></div>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderRisk(ctx) {
  RK.ctx = ctx;
  RK.el = ctx.el;
  const r = RK.read;
  if (!r || Date.now() - r.at > RK_TTL) rkFetch();
  const good = r ? r.good : null;
  const failed = r && r.body && !(r.body.ok !== false && Array.isArray(r.body.lines)) ? refusalOf(r.body) || "the account did not answer" : "";
  let body = "";
  if (good) {
    const unpriced = Array.isArray(good.unpriced) && good.unpriced.length ? `<p class="small dim rk-unpriced">Weighing in the exposure, with no volatility of their own here: ${esc(good.unpriced.map((u) => `${u.name} (${u.why})`).join("; "))}.</p>` : "";
    body = `${rkCard("head", "Risk", esc(`the account's own lines · ${nyTime(good.asOf)} New York`), `${rkHeadHtml(good)}${rkStripHtml(good.portfolio && good.portfolio.recent)}`)}${rkCard("lines", "Lines", `${good.lines.length} · the largest first`, `${rkLinesHtml(good)}${unpriced}`)}${rkCard("groups", "Exposure", "by class, by venue, how concentrated", rkGroupsHtml(good))}${rkCard("beta", "Beta and stress", "", rkBetaStressHtml(good))}${failed ? `<p class="mk-missing">Couldn't read the risk again just now: ${esc(failed)}. This is what was read at ${esc(nyTime(good.asOf))}.</p>` : ""}<p class="small dim rk-asof">Read ${esc(nyTime(good.asOf))} New York${Array.isArray(good.notes) && good.notes.length ? `<details class="rk-foot"><summary>How this is counted</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}</p>`;
  } else if (failed) body = `<div class="msg no">Couldn't read the risk: ${esc(failed)}.</div>`;
  else body = '<div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span></div>';
  paint(ctx.el, `<div class="rk">${body}</div>`);
}
