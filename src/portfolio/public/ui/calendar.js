/* THE CALENDAR (the Markets group's third page, #/calendar; ECO · ERN · DVD · SPLT · IPO on the command line): what Nasdaq's own pages
   schedule, as GET /api/account/calendar gives it (live/calendars.ts) — one day at a time: the economic releases with their New York time,
   country, consensus, what came out (above or below the consensus, where both are figures) and what came before; the companies reporting
   earnings, before the open or after the close, with the EPS the analysts expect; the shares going ex-dividend; the splits; the month's
   IPOs by stage. A row of days to move along (the picked day's week, Today marked), the kinds as a seg, the day read when it is picked and
   kept by the account a quarter hour; a share's rows alone where the route names one (AAPL ERN). Nothing here is the account's own figure:
   the consensus is Nasdaq's as written, said as such under the list. */
const CAL = { ctx: null, el: null, read: null, pending: "", timer: 0 };
const CAL_KINDS = [["economic", "Economic"], ["earnings", "Earnings"], ["dividends", "Dividends"], ["splits", "Splits"], ["ipos", "IPOs"]];
const CAL_TTL = 60_000;
/* today's rows are read again every five minutes while the page shows (a release lands, a figure comes out) */
const CAL_AGAIN_MS = 300_000;
const CAL_LIMIT = 500;

/* a New York day (YYYY-MM-DD) for a moment */
function calDayOf(iso) {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/* the route's kind, day and share, as the pane reads them: today where no day is named, economic where no kind is */
function calParams(params) {
  const kind = CAL_KINDS.some(([id]) => id === (params && params.kind)) ? params.kind : "economic";
  const today = calDayOf(A ? A.now : Date.now());
  const day = params && /^\d{4}-\d{2}-\d{2}$/.test(String(params.day || "")) && Number.isFinite(Date.parse(`${params.day}T00:00:00Z`)) ? params.day : today;
  const symbol = String((params && params.symbol) || "").trim().toUpperCase().slice(0, 12);
  return { kind, day, today, symbol };
}
/* a day moved by n days (YYYY-MM-DD arithmetic in UTC, which keeps the calendar day) */
const calShift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/* the Monday of a day's week */
function calMonday(day) {
  const dow = new Date(Date.parse(`${day}T00:00:00Z`)).getUTCDay();
  return calShift(day, -((dow + 6) % 7));
}
/* a day as the strip and the headings say it: "Mon 9 Nov" */
function calDayWords(day) {
  const d = new Date(Date.parse(`${day}T12:00:00Z`));
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}
const calPath = (p) => `/api/account/calendar?${new URLSearchParams({ kind: p.kind, from: p.day, to: p.day, ...(p.symbol ? { symbol: p.symbol } : {}), limit: String(CAL_LIMIT) })}`;
function calFetch(path) {
  if (CAL.pending === path) return;
  CAL.pending = path;
  api(path, { ttl: CAL_TTL, timeout: 25_000 }).then((body) => {
    if (CAL.pending === path) CAL.pending = "";
    const ok = !!body && body.ok !== false && Array.isArray(body.items);
    CAL.read = { path, at: Date.now(), body, good: ok ? body : CAL.read && CAL.read.path === path ? CAL.read.good : null };
    if (ROUTE.tab === "calendar" && CAL.ctx) paneLater("calendar", calRedraw);
  });
}
const calRedraw = () => {
  if (ROUTE.tab === "calendar" && CAL.ctx) renderCalendar({ ...CAL.ctx, params: ROUTE.params });
};
/* a figure in dollars, short: $88.6B · $1.2M · $0.20 */
const calUsd = (n) => (!Number.isFinite(Number(n)) ? "—" : Math.abs(n) >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${Number(n).toFixed(2)}`);
const calEps = (n) => (!Number.isFinite(Number(n)) ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);
const calCount = (n) => (!Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("en-US"));
/* a share's symbol as a button that opens its market */
const calSym = (s) => `<button type="button" class="link cal-sym mono" data-cal="open" data-symbol="${esc(s)}">${esc(s)}</button>`;

/** THE ROWS of one kind, as a table (core table()): each kind its own columns */
function calRowsHtml(kind, items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return "";
  if (kind === "economic") {
    const act = (r) => (r.actual ? `<span class="${r.against === "above" ? "up" : r.against === "below" ? "down" : ""}">${esc(r.actual)}</span>` : '<span class="dim">—</span>');
    return table([
      { label: "Time", cls: "cal-t", cell: (r) => (r.at ? `<time class="mono" datetime="${esc(r.at)}">${esc(nyTime(r.at))}</time>` : r.time ? `<span class="mono">${esc(r.time)}</span>` : '<span class="dim">—</span>') },
      { label: "Country", cell: (r) => esc(r.country || "") },
      { label: "Release", cell: (r) => `<span class="cal-ev"${r.description ? ` title="${esc(r.description)}"` : ""}>${esc(r.event)}</span>` },
      { label: "Actual", r: true, cell: act },
      { label: "Consensus", r: true, cell: (r) => (r.consensus ? esc(r.consensus) : '<span class="dim">—</span>') },
      { label: "Previous", r: true, cell: (r) => (r.previous ? esc(r.previous) : '<span class="dim">—</span>') },
    ], rows, { cls: "cal-table", rowAttr: (r, i) => `data-k="${esc(`${r.at || r.time || ""}|${r.country}|${r.event}|${i}`)}"` });
  }
  if (kind === "earnings") {
    const when = { pre: "Before the open", post: "After the close", unknown: "—" };
    return table([
      { label: "When", cell: (r) => `<span class="${r.when === "unknown" ? "dim" : ""}">${when[r.when] || "—"}</span>` },
      { label: "Symbol", cell: (r) => calSym(r.symbol) },
      { label: "Company", cell: (r) => `<span class="cal-name">${esc(r.name)}</span>` },
      { label: "Market cap", r: true, cell: (r) => calUsd(r.marketCapUsd) },
      { label: "EPS expected", r: true, cell: (r) => `${calEps(r.epsForecast)}${Number.isFinite(Number(r.estimates)) ? ` <span class="dim small">(${calCount(r.estimates)})</span>` : ""}` },
      { label: "A year ago", r: true, cell: (r) => calEps(r.lastYearEps) },
      { label: "Quarter", cell: (r) => esc(r.quarterEnding || "") },
    ], rows, { cls: "cal-table", rowAttr: (r) => `data-k="${esc(r.symbol)}"` });
  }
  if (kind === "dividends") {
    return table([
      { label: "Symbol", cell: (r) => calSym(r.symbol) },
      { label: "Company", cell: (r) => `<span class="cal-name">${esc(r.name)}</span>` },
      { label: "Dividend", r: true, cell: (r) => calEps(r.amount) },
      { label: "A year", r: true, cell: (r) => calEps(r.annual) },
      { label: "Ex-dividend", cell: (r) => esc(r.exDay) },
      { label: "Paid", cell: (r) => esc(r.paymentDay || "—") },
    ], rows, { cls: "cal-table", rowAttr: (r) => `data-k="${esc(r.symbol)}"` });
  }
  if (kind === "splits") {
    return table([
      { label: "Symbol", cell: (r) => calSym(r.symbol) },
      { label: "Company", cell: (r) => `<span class="cal-name">${esc(r.name)}</span>` },
      { label: "Ratio", r: true, cell: (r) => `<span class="mono">${esc(r.ratio)}</span>` },
      { label: "Executed", cell: (r) => esc(r.executionDay || "—") },
    ], rows, { cls: "cal-table", rowAttr: (r) => `data-k="${esc(r.symbol)}"` });
  }
  const stage = { priced: "Priced", upcoming: "Expected", filed: "Filed", withdrawn: "Withdrawn" };
  return table([
    { label: "Stage", cell: (r) => `<span class="tag${r.stage === "priced" ? " up" : r.stage === "withdrawn" ? " warn" : ""}">${stage[r.stage] || esc(r.stage)}</span>` },
    { label: "Day", cell: (r) => esc(r.day) },
    { label: "Symbol", cell: (r) => (r.symbol ? calSym(r.symbol) : '<span class="dim">—</span>') },
    { label: "Company", cell: (r) => `<span class="cal-name">${esc(r.name)}</span>` },
    { label: "Exchange", cell: (r) => esc(r.exchange || "—") },
    { label: "Price", r: true, cell: (r) => (Number.isFinite(Number(r.priceUsd)) ? `$${Number(r.priceUsd).toFixed(2)}` : "—") },
    { label: "Raised", r: true, cell: (r) => calUsd(r.raisedUsd) },
  ], rows, { cls: "cal-table", rowAttr: (r, i) => `data-k="${esc(`${r.stage}|${r.name}|${i}`)}"` });
}
/* the row of days: the picked day's week, Monday to Sunday, Today marked; a week back and on at the ends (IPOs: the month) */
function calStripHtml(p) {
  if (p.kind === "ipos") {
    const month = p.day.slice(0, 7);
    const d = new Date(Date.parse(`${month}-01T12:00:00Z`));
    const words = `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    return `<div class="cal-strip" role="group" aria-label="Month"><button type="button" class="icon-btn" data-cal="day" data-day="${prev}" aria-label="The month before">‹</button><span class="cal-month">${esc(words)}</span><button type="button" class="icon-btn" data-cal="day" data-day="${next}" aria-label="The month after">›</button></div>`;
  }
  const monday = calMonday(p.day);
  const days = Array.from({ length: 7 }, (_, i) => calShift(monday, i));
  return `<div class="cal-strip" role="group" aria-label="Day"><button type="button" class="icon-btn" data-cal="day" data-day="${calShift(monday, -7)}" aria-label="The week before">‹</button>${days.map((d) => `<button type="button" class="cal-day${d === p.today ? " today" : ""}" data-cal="day" data-day="${d}" aria-pressed="${String(d === p.day)}"><span class="cal-dow">${esc(calDayWords(d).slice(0, 3))}</span><span class="cal-dom">${esc(String(Number(d.slice(8))))}</span></button>`).join("")}<button type="button" class="icon-btn" data-cal="day" data-day="${calShift(monday, 7)}" aria-label="The week after">›</button>${p.day !== p.today ? `<button type="button" class="btn btn-sm" data-cal="day" data-day="${esc(p.today)}">Today</button>` : ""}</div>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderCalendar(ctx) {
  CAL.ctx = ctx;
  if (CAL.el !== ctx.el) {
    ctx.el.addEventListener("click", calClick);
    CAL.el = ctx.el;
  }
  const p = calParams(ctx.params);
  const path = calPath(p);
  const r = CAL.read;
  if (!r || r.path !== path || Date.now() - r.at > CAL_TTL) calFetch(path);
  const good = r && r.path === path ? r.good : null;
  const failed = r && r.path === path && r.body && !(r.body.ok !== false && Array.isArray(r.body.items)) ? refusalOf(r.body) || "the account did not answer" : "";
  const kinds = `<div class="seg cal-kinds" role="group" aria-label="Calendar">${CAL_KINDS.map(([id, label]) => `<button type="button" data-cal="kind" data-kind="${id}" aria-pressed="${String(id === p.kind)}">${label}</button>`).join("")}</div>`;
  const label = CAL_KINDS.find(([id]) => id === p.kind)[1];
  const heading = p.kind === "ipos" ? `${label} · ${p.day.slice(0, 7)}` : `${label} · ${p.day === p.today ? "Today · " : ""}${calDayWords(p.day)}`;
  const share = p.symbol ? `<p class="cal-q">${esc(p.symbol)} alone <button type="button" class="link" data-cal="clear">Every share</button></p>` : "";
  let body = "";
  if (good) {
    const rows = calRowsHtml(p.kind, good.items);
    body = rows || `<p class="empty">${p.symbol ? `Nothing for ${esc(p.symbol)} ${p.kind === "ipos" ? "this month" : "on this day"} in Nasdaq's ${esc(label.toLowerCase())} calendar.` : `Nothing ${p.kind === "ipos" ? "this month" : "on this day"} in Nasdaq's ${esc(label.toLowerCase())} calendar.`}</p>`;
    if (good.total > good.items.length) body += `<p class="small dim">${good.items.length} of ${good.total} rows shown.</p>`;
    const dayNo = (good.days || []).filter((d) => d.why);
    if (dayNo.length) body += `<p class="mk-missing">${dayNo.map((d) => `${esc(d.day)}: ${esc(d.why)}`).join(" · ")}.</p>`;
    if (failed) body += `<p class="mk-missing">Couldn't read the calendar again just now: ${esc(failed)}. This is what was read at ${esc(nyTime(good.asOf))}.</p>`;
    body += `<p class="small dim cal-asof">Read ${esc(nyTime(good.asOf))} New York · Nasdaq's calendar, as written${Array.isArray(good.notes) && good.notes.length ? `<details class="cal-foot"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>` : ""}</p>`;
  } else if (failed) body = `<div class="msg no">Couldn't read the calendar: ${esc(failed)}.</div>`;
  else body = '<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span></div>';
  paint(ctx.el, `<div class="cal"><section class="sec cal-card"><div class="sec-head"><h2 class="h2">${esc(heading)}</h2></div>${kinds}${calStripHtml(p)}${share}${body}</section></div>`);
  calArm(p);
}
function calClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-cal]");
  if (!b) return;
  const p = calParams(ROUTE.params);
  if (b.dataset.cal === "kind") return void go("calendar", { ...ROUTE.params, kind: b.dataset.kind }, { replace: true });
  if (b.dataset.cal === "day") return void go("calendar", { ...ROUTE.params, day: b.dataset.day === p.today ? undefined : b.dataset.day }, { replace: true });
  if (b.dataset.cal === "clear") return void go("calendar", { ...ROUTE.params, symbol: undefined }, { replace: true });
  if (b.dataset.cal === "open" && typeof openMarket === "function") return void openMarket({ key: `stock:${b.dataset.symbol}` });
}
/* today's rows read again every five minutes while the page shows and is in view */
function calArm(p) {
  clearTimeout(CAL.timer);
  if (p.day !== p.today) return;
  CAL.timer = setTimeout(() => {
    if (ROUTE.tab !== "calendar" || document.hidden || !CAL.ctx) return;
    forget("/api/account/calendar?");
    calFetch(calPath(calParams(ROUTE.params)));
    calArm(p);
  }, CAL_AGAIN_MS);
}
onRoute((tab) => {
  if (tab !== "calendar") clearTimeout(CAL.timer);
});
