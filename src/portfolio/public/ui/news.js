/* THE NEWS (the Markets group's second page, #/news; TOP and N on the command line): the headlines the publishers put out in their own
   feeds, as GET /api/account/news gives them (live/news.ts) — the day's list, one topic's (Markets · Macro & policy · Crypto · Companies),
   or the ones that carry a few words (N fed). Each row is a time (New York), the publisher, and the title as a link to the publisher's own
   page — nothing of the article, nothing summarised, nothing of the account's: a headline is a publisher's claim, said as such. The rows
   are grouped by day; under them, the feeds that answered and the ones that did not, in their words; the notes folded at the foot.
   Read when the page shows and every two minutes while it does (the account keeps each feed five minutes); drawn in place (paint), so a
   title the owner is reading does not jump. A share's drawer draws its headlines with the same rows (nwRowsHtml, markets.js mkNewsHtml). */
const NW = { ctx: null, el: null, read: null, pending: "", timer: 0 };
const NW_LIMIT = 120;
/* how often the list is read again while it shows (the account keeps a feed five minutes: a read between is the kept answer) */
const NW_AGAIN_MS = 120_000;
const NW_TTL = 60_000;
const NW_TOPICS = [["", "All"], ["markets", "Markets"], ["macro", "Macro & policy"], ["crypto", "Crypto"], ["companies", "Companies"]];

/* the route's topic and words, as the pane reads them */
function nwParams(params) {
  const topic = NW_TOPICS.some(([id]) => id && id === (params && params.topic)) ? params.topic : "";
  const q = String((params && params.q) || "").trim().slice(0, 60);
  return { topic, q };
}
const nwPath = (p) => `/api/account/news?${new URLSearchParams({ ...(p.topic ? { topic: p.topic } : {}), ...(p.q ? { q: p.q } : {}), limit: String(NW_LIMIT) })}`;
/* one read: the last good answer stands while a new one is on its way or refused */
function nwFetch(path) {
  if (NW.pending === path) return;
  NW.pending = path;
  api(path, { ttl: NW_TTL }).then((body) => {
    if (NW.pending === path) NW.pending = "";
    const ok = !!body && body.ok !== false && Array.isArray(body.items);
    NW.read = { path, at: Date.now(), body, good: ok ? body : NW.read && NW.read.path === path ? NW.read.good : null };
    if (ROUTE.tab === "news" && NW.ctx) paneLater("news", nwRedraw);
  });
}
const nwRedraw = () => {
  if (ROUTE.tab === "news" && NW.ctx) renderNews({ ...NW.ctx, params: ROUTE.params });
};
/* the day a headline belongs to, New York's, as a heading: Today · Yesterday · the day */
function nwDayOf(iso, now) {
  const day = nyDay(iso);
  if (day === nyDay(now)) return `Today · ${day}`;
  if (day === nyDay(new Date(Date.parse(now) - DAY).toISOString())) return `Yesterday · ${day}`;
  return day;
}
/** THE ROWS: each a time, the publisher and the title — a link where the feed's link points at the publisher's own host, plain words else.
 * `compact`: no day headings (a drawer's few rows) */
function nwRowsHtml(items, { now = A ? A.now : new Date().toISOString(), compact = false } = {}) {
  const rows = Array.isArray(items) ? items.filter((h) => h && typeof h.title === "string") : [];
  if (!rows.length) return "";
  const row = (h) => {
    const t = h.at && Number.isFinite(Date.parse(h.at)) ? `<time class="nw-time mono" datetime="${esc(h.at)}" title="${esc(`${nyDay(h.at)} ${nyTime(h.at)} New York`)}">${esc(nyTime(h.at))}</time>` : '<span class="nw-time mono dim">—</span>';
    const src = `<span class="nw-src tag" title="${esc(h.sourceName || h.source || "")}">${esc(h.sourceName || h.source || "")}</span>`;
    const title = typeof h.url === "string" && /^https:\/\//.test(h.url) ? `<a class="nw-title" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}</a>` : `<span class="nw-title">${esc(h.title)}</span>`;
    return `<li class="nw-row" data-k="${esc(h.id || h.title)}">${t}${src}${title}</li>`;
  };
  if (compact) return `<ol class="nw-list nw-compact">${rows.map(row).join("")}</ol>`;
  const days = new Map();
  for (const h of rows) {
    const key = h.at && Number.isFinite(Date.parse(h.at)) ? nwDayOf(h.at, now) : "Undated";
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(h);
  }
  return [...days.entries()].map(([day, list]) => `<section class="nw-day" data-k="${esc(day)}"><h2 class="label">${esc(day)}</h2><ol class="nw-list">${list.map(row).join("")}</ol></section>`).join("");
}
/* the feeds under the list: how many answered with how many headlines, and the ones that did not, each in its own words */
function nwSourcesHtml(b) {
  const srcs = Array.isArray(b.sources) ? b.sources : [];
  const gave = srcs.filter((s) => s.count > 0 && !s.late);
  const late = srcs.filter((s) => s.late);
  const missing = Array.isArray(b.missing) ? b.missing : [];
  const none = missing.filter((m) => !late.some((s) => s.id === m.venue));
  return `<p class="nw-sources small dim">${gave.length ? `${plural(gave.length, "feed")} answered: ${esc(gave.map((s) => s.name).join(", "))}` : "No feed answered"}${late.length ? ` · standing in from an earlier answer: ${esc(late.map((s) => s.name).join(", "))}` : ""}${none.length ? ` · nothing from ${esc(none.map((m) => `${m.venueName} (${m.why})`).join("; "))}` : ""}.</p>`;
}
/** THE PANE: the shell calls this with { el, owner, lens, params } on each account read and when the route moves here */
function renderNews(ctx) {
  NW.ctx = ctx;
  if (NW.el !== ctx.el) {
    ctx.el.addEventListener("click", nwClick);
    NW.el = ctx.el;
  }
  const p = nwParams(ctx.params);
  const path = nwPath(p);
  const r = NW.read;
  if (!r || r.path !== path || Date.now() - r.at > NW_TTL) nwFetch(path);
  const good = r && r.path === path ? r.good : null;
  const failed = r && r.path === path && r.body && !(r.body.ok !== false && Array.isArray(r.body.items)) ? refusalOf(r.body) || "the account did not answer" : "";
  const topics = `<div class="seg nw-topics" role="group" aria-label="Topic">${NW_TOPICS.map(([id, label]) => `<button type="button" data-nw="topic" data-topic="${esc(id)}" aria-pressed="${String(id === p.topic)}">${esc(label)}${good && id && Array.isArray(good.topics) ? (() => { const t = good.topics.find((x) => x.id === id); return t && t.count ? ` <span class="count">${t.count}</span>` : ""; })() : ""}</button>`).join("")}</div>`;
  const asOf = good ? `<span class="nw-asof small dim">Read ${esc(nyTime(good.asOf))} New York</span>` : "";
  const words = p.q ? `<p class="nw-q">Headlines that carry <b>“${esc(p.q)}”</b>${good ? ` · ${plural(good.total || 0, "headline")}` : ""} <button type="button" class="link" data-nw="clear">Clear</button></p>` : "";
  let body = "";
  if (good) {
    body = good.items.length ? nwRowsHtml(good.items, { now: A ? A.now : good.asOf }) : `<p class="empty">${p.q ? `No headline carries “${esc(p.q)}” among the ${plural(good.sources.reduce((n, s) => n + (s.count || 0), 0), "headline")} read.` : "No headline was read: the feeds did not answer."}</p>`;
    body += nwSourcesHtml(good);
    if (failed) body += `<p class="mk-missing">Couldn't read the news again just now: ${esc(failed)}. This is what was read at ${esc(nyTime(good.asOf))}.</p>`;
    if (Array.isArray(good.notes) && good.notes.length) body += `<details class="nw-foot small dim"><summary>Where this comes from</summary>${good.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</details>`;
  } else if (failed) body = `<div class="msg no">Couldn't read the news: ${esc(failed)}.</div>`;
  else body = '<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel" style="width:70%"></span><span class="skel"></span><span class="skel" style="width:60%"></span></div>';
  paint(ctx.el, `<div class="nw"><section class="sec nw-card"><div class="sec-head"><h2 class="h2">News</h2>${asOf}</div>${topics}${words}${body}</section></div>`);
  nwArm();
}
function nwClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-nw]");
  if (!b) return;
  if (b.dataset.nw === "topic") return void go("news", { ...ROUTE.params, topic: b.dataset.topic || undefined }, { replace: true });
  if (b.dataset.nw === "clear") return void go("news", { ...ROUTE.params, q: undefined }, { replace: true });
}
/* read again every two minutes while the page shows and is in view */
function nwArm() {
  clearTimeout(NW.timer);
  NW.timer = setTimeout(() => {
    if (ROUTE.tab !== "news" || document.hidden || !NW.ctx) return;
    forget("/api/account/news?");
    nwFetch(nwPath(nwParams(ROUTE.params)));
    nwArm();
  }, NW_AGAIN_MS);
}
onRoute((tab) => {
  if (tab !== "news") clearTimeout(NW.timer);
});
