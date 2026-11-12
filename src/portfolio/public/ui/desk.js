/* THE DESK pane (#/desk; the rail's Agents): the account's own agents — hired here, watched here. Drawn from GET /api/account/desk (the
   objective, the seats and their standing at the door, the session, the equity and its curve, the leads, the tape of closes, the biggest
   ones, the room) every five seconds while the pane is shown, and from GET /api/account/desk/catalog (the roles and their charters, the
   house seats' keys, the brain's standing) for hiring. Every change is the owner's signature: letting a seat in (approveAgent), its limit
   (approveSpend), the desk itself (setDesk hire · objective · charter · seat · pause · resume · end · cycle · report). The open leads are
   drawn with the live cards of ui/live.js, the same the Portfolio uses, so a lead moves on the page the way anything bought does.
   Not hired yet: the hiring form, and the way in for an agent of the owner's own (the setup command, the keys knocking). */

const DK = { view: null, catalog: null, read: 0, lastEq: null, stopSecond: null, timer: 0, hiring: null, err: "" };
const DK_EVERY_MS = 5_000;
const DK_ROLE_CLASS = { head: "head", search: "search", risk: "risk", sniper: "sniper", exit: "exit", watch: "watch", flow: "flow", sentiment: "sentiment", you: "you", account: "account" };
const dkTag = (role) => (role === "you" ? "YOU" : role === "account" ? "ACCOUNT" : ((DK.catalog && DK.catalog.roles.find((r) => r.id === role)) || {}).tag || String(role).toUpperCase());
const dkName = (role) => ((DK.catalog && DK.catalog.roles.find((r) => r.id === role)) || {}).name || role;
const dkSigned = (n) => `${num(n) >= 0 ? "+" : "-"}${money(Math.abs(num(n))).replace(/^-/, "")}`;
const dkPct = (n) => `${num(n) >= 0 ? "+" : ""}${num(n).toFixed(2)}%`;
/* a span of time as a clock reads it: 03:14:09 */
const dkClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const dkLeft = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/* lead and card ids in a line, set in mono */
const dkIds = (text) => esc(text).replace(/\b(L-\d{4,}|card-\d{4}|ord-\d{4})\b/g, '<span class="mono">$1</span>');

/** the pane: the shell calls it on every read, on the route and on the lens */
function renderDesk({ el, owner }) {
  if (!el.firstElementChild || !el.firstElementChild.dataset.dk) el.innerHTML = '<div class="dk" data-dk="1"><div data-dk-part="body"><div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel" style="width:60%"></span></div></div></div>';
  dkWire(el);
  if (DK.view !== null || DK.catalog) dkDraw(el, owner);
  dkRead();
  if (!DK.timer) DK.timer = setInterval(() => {
    if (ROUTE.tab !== "desk" || document.hidden || !A) return;
    dkRead();
  }, DK_EVERY_MS);
}

/* the two reads: the desk (every five seconds), and what hiring offers (kept half a minute) */
function dkRead() {
  const my = ++DK.read;
  Promise.all([api("/api/account/desk", { ttl: 2_500 }), api("/api/account/desk/catalog", { ttl: 30_000 })]).then(([d, c]) => {
    if (my !== DK.read) return;
    DK.err = d && d.ok === false ? refusalOf(d) || "The account did not answer." : "";
    if (d && d.ok) DK.view = d.desk || null;
    if (c && c.ok) DK.catalog = c;
    dkAgain();
  });
}
function dkAgain() {
  const el = $("pane-desk");
  if (!A || ROUTE.tab !== "desk" || !el || !el.querySelector("[data-dk]")) return;
  nextFrame(() => paneLater("desk", () => {
    try {
      dkDraw(el, owns());
    } catch (err) {
      console.error(err);
    }
  }));
}

function dkDraw(el, owner) {
  const body = el.querySelector('[data-dk-part="body"]');
  if (!body) return;
  if (DK.err && !DK.view) return void paint(body, `<p class="pane-error" role="alert">${esc(DK.err)}</p>`);
  if (!DK.view) {
    if (!DK.catalog) return;
    const was = DK.hiring;
    // the form keeps what is typed: drawn once, and again only when what it offers changed
    if (body.dataset.hire === JSON.stringify([owner, DK.catalog.hired, (DK.catalog.brains || []).map((b) => b.ok), A.requests.length, connected().map((v) => v.id)])) return;
    body.dataset.hire = JSON.stringify([owner, DK.catalog.hired, (DK.catalog.brains || []).map((b) => b.ok), A.requests.length, connected().map((v) => v.id)]);
    // what was typed survives the form being drawn again (a key saved in the Brains sheet meanwhile flips a brain to ready); the Brain select
    // put back is told so (core formKeep's change event), so the block on show and the efforts offered are its own, the ones Hire signs
    const restore = formKeep(body.querySelector("form.dk-hire-f"));
    body.innerHTML = dkHireHtml(owner);
    restore(body.querySelector("form.dk-hire-f"));
    DK.hiring = was;
    dkHireWire(body, owner);
    return;
  }
  delete body.dataset.hire;
  const v = DK.view;
  const room = body.querySelector(".dk-msgs");
  const atBottom = !room || room.scrollHeight - room.scrollTop - room.clientHeight < 40;
  const drew = paint(body, dkViewHtml(v, owner));
  const open = body.querySelector("[data-dk-open]");
  if (open) lvWatch(open);
  const msgs = body.querySelector(".dk-msgs");
  if (msgs && (drew || atBottom) && atBottom) msgs.scrollTop = msgs.scrollHeight;
  // the realised part of the session, kept apart: the live figure adds the cards' fresh results to it between the account's own reads
  DK.realised = v.equity.nowUsd - v.equity.startUsd - v.open.reduce((s, l) => s + num(l.unrealizedUsd), 0);
  dkLiveEquity();
  dkSecond();
}

/* the hero's equity, its change and the rail to the target, from the cards' fresh prices (ui/live.js tells this after every write): the
   same sum the account makes at each cycle, a few seconds fresher; tinted when it moved */
function dkLiveEquity() {
  const el = $("pane-desk");
  const v = DK.view;
  if (!el || !v || !v.session || typeof lvResult !== "function") return;
  let unrealised = 0;
  let fresh = 0;
  for (const card of el.querySelectorAll("[data-dk-open] .lv-card")) {
    const r = lvResult(card);
    if (r) {
      unrealised += r.pnl;
      fresh++;
    } else unrealised += num(((v.open || []).find((l) => l.id === card.dataset.k) || {}).unrealizedUsd);
  }
  const start = v.equity.startUsd;
  const now = Number((start + DK.realised + unrealised).toFixed(2));
  const change = Number((now - start).toFixed(2));
  const eq = el.querySelector("[data-dk-eq]");
  if (eq) {
    const t = money(now);
    if (eq.textContent !== t) {
      setText(eq, t);
      if (DK.lastEq !== null && typeof lvFlash === "function") lvFlash(eq, now > DK.lastEq);
    }
  }
  DK.lastEq = now;
  const c = el.querySelector(".dk-eq-c");
  if (c) {
    const cls = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const html = `${chg(change, "$")} <span class="dim">(${esc(dkPct(start ? (change / start) * 100 : 0))}) · ${esc((start ? now / start : 1).toFixed(2))}x from ${esc(money(start))}${fresh ? "" : ""}</span>`;
    if (c.innerHTML !== html) c.innerHTML = html;
    c.className = `dk-eq-c ${cls}`;
  }
  const targetUsd = v.target.targetUsd;
  const progress = targetUsd > 0 ? Math.max(-100, Math.min(100, (change / targetUsd) * 100)) : 0;
  const fill = el.querySelector(".dk-rail-fill");
  if (fill) {
    const p = Math.abs(progress).toFixed(1);
    if (fill.style.getPropertyValue("--p") !== p) fill.style.setProperty("--p", p);
    fill.classList.toggle("down", progress < 0);
  }
  for (const tick of el.querySelectorAll(".dk-tick")) tick.classList.toggle("on", progress >= Number(tick.style.left.replace("%", "")));
  const reached = el.querySelector(".dk-target-h .dim");
  if (reached) setText(reached, `${dkSigned(change)} of ${money(targetUsd)}`);
}
if (typeof lvOnWrite === "function") lvOnWrite(() => ROUTE.tab === "desk" && dkLiveEquity());

// ---- the view ----------------------------------------------------------------------------------------------------------

function dkViewHtml(v, owner) {
  const s = v.session;
  const state = s ? s.state : "ended";
  const pill = { live: '<span class="pill up dk-live"><span class="lv-live">LIVE</span> <span data-dk-clock></span> / <span>' + esc(String(s ? s.hours : 0)) + 'H</span></span>', paused: '<span class="pill warm">PAUSED</span>', halted: '<span class="pill warm">HALTED</span>', ended: '<span class="pill">ENDED</span>' }[state];
  const o = v.objective;
  const tools = owner ? [state === "live" ? dkBtn("pause", "Pause") : "", state === "paused" ? dkBtn("resume", "Resume", { cls: "btn btn-primary btn-sm" }) : "", state === "ended" ? dkBtn("resume", "Start a new session", { cls: "btn btn-primary btn-sm" }) : "", state === "live" || state === "halted" ? dkBtn("cycle", "Cycle now", { title: v.brain.ok ? "Run one cycle now: the brain is asked, which costs its tokens" : "The house seats have no brain to think with" }) : "", dkBtn("objective", "Objective…"), dkBtn("brain", "Brain…"), state !== "ended" ? dkBtn("end", "End", { cls: "btn btn-sm btn-ghost" }) : ""].filter(Boolean).join("") : "";
  const eq = v.equity;
  const t = v.target;
  const curve = pfCurve((eq.points || []).map(([at, usd]) => ({ at: new Date(at).toISOString(), usd })), 600, 110);
  const cls = eq.changeUsd > 0 ? "up" : eq.changeUsd < 0 ? "down" : "flat";
  const progress = Math.max(-100, Math.min(100, t.progressPct));
  const hero = `<section class="sec dk-hero" aria-labelledby="dk-h"><div class="dk-hero-h"><div class="dk-title"><h2 class="h2" id="dk-h">${esc(v.name)}</h2>${pill}<span class="dim small">${esc(v.venue.name)}${v.venue.paper ? ' <span class="tag paper">Paper</span>' : ""}</span>${v.venue.paper ? `<span class="tag${v.autonomy && v.autonomy.paper ? " up" : ""}" title="${v.autonomy && v.autonomy.paper ? "The desk's own paper orders go without a card for you, each inside its seat's limit" : "Each order the desk's seats want to place waits for you as a card"}">${v.autonomy && v.autonomy.paper ? "Auto on paper" : "Cards"}</span><a class="link" href="${esc(hashOf("superagent"))}">See it trade ›</a>` : ""}</div><div class="dk-tools">${tools}</div></div>
    <p class="dk-objective">“${esc(o.text)}” <span class="dim small">· target ${esc(dkPct(o.targetPct))} this week · at most ${esc(String(o.maxRiskPct))}% a lead · halt at -${esc(String(o.maxDailyLossPct))}% in a day · a cycle every ${esc(String(o.everyMin))} min${s && s.halted ? ` · <span class="warn-t">halted: ${esc(s.halted.why)}</span>` : ""}</span></p>
    <div class="dk-eq"><div class="dk-eq-n"><div class="label">Equity</div><div class="num" data-dk-eq>${esc(money(eq.nowUsd))}</div><div class="dk-eq-c ${cls}">${chg(eq.changeUsd, "$")} <span class="dim">(${esc(dkPct(eq.changePct))}) · ${esc(eq.mult.toFixed(2))}x from ${esc(money(eq.startUsd))}</span></div></div>
    <div class="dk-curve-box">${curve ? `<svg class="spark dk-curve" viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${curve.area}"></path><path class="line" d="${curve.line}"></path></svg>` : `<p class="dim small dk-nocurve">The curve draws as the session runs: a point a minute.</p>`}</div></div>
    <div class="dk-target"><div class="dk-target-h"><span class="label">To target ${esc(dkPct(t.pct))}</span><span class="dim small">${esc(dkSigned(t.reachedUsd))} of ${esc(money(t.targetUsd))}</span></div><div class="dk-rail"><div class="dk-rail-fill ${progress < 0 ? "down" : ""}" style="--p:${Math.abs(progress).toFixed(1)}"></div>${[25, 50, 75, 100].map((m) => `<span class="dk-tick${progress >= m ? " on" : ""}" style="left:${m}%"><i>${m}%</i></span>`).join("")}</div></div></section>`;
  // the open leads: live cards; the ones waiting on a card, with the owner's keys
  const waiting = v.open.filter((l) => l.state === "confirmed" || (l.state === "closing" && !l.exitOrder));
  const cards = v.open.filter((l) => l.entry && l.markPrice !== undefined || (l.entry && l.state === "executed"));
  const closeFor = (l) => (owner && writesOn() ? (l.kind === "perp" ? { kind: "close", position: { venue: l.venue, venueName: v.venue.name, symbol: l.symbol, name: l.name, kind: "perp", side: l.side === "buy" ? "long" : "short", qty: l.entry.qty, markPrice: l.markPrice } } : { kind: "sell", venue: l.venue, symbol: l.symbol, qty: l.entry.qty }) : undefined);
  const openHtml = `<section class="sec dk-open" aria-labelledby="dk-open-h"><div class="sec-head"><div class="label" id="dk-open-h">Open leads <span class="lv-live">live</span></div><span class="dim small">${esc(plural(v.open.length, "lead"))} open · at most ${esc(String(o.maxOpen))}</span></div>${waiting.length ? `<div class="dk-waiting">${waiting.map((l) => { const c = v.cards.find((x) => x.lead === l.id) || (A.cards || []).find((x) => x.id === l.card); return `<div class="dk-wait" data-k="${esc(l.id)}"><div><b><span class="mono">${esc(l.id)}</span> ${esc(l.side === "buy" ? "buy" : "sell")} ${esc(money(l.sizeUsd || 0))} of ${esc(l.symbol)}</b><span class="dim small">waits for you on <span class="mono">${esc(l.card || "")}</span>${c ? ` · ${esc(c.reason)}` : ""}</span></div>${c && owner ? `<div class="pf-btns pf-keys">${dkBtn("reject", `${icon("x")}<span class="sr">Reject</span>`, { cls: "rkey", data: { card: c.id }, title: "Reject" })}${dkBtn("approve", `${icon("check")}<span class="sr">Approve</span>`, { cls: "rkey yes-k", data: { card: c.id }, title: "Approve: one signature" })}</div>` : ""}</div>`; }).join("")}</div>` : ""}<div class="lv-grid" data-dk-open>${cards.map((l) => lvCard({ key: l.id, symbol: l.symbol, name: l.name, venue: l.venue, venueName: v.venue.name, kind: l.kind, side: l.side === "buy" ? "long" : "short", qty: l.entry.qty, entry: l.entry.price, mark: l.markPrice, costUsd: l.sizeUsd, unrealizedUsd: l.unrealizedUsd, roiPct: l.sizeUsd ? ((l.unrealizedUsd || 0) / l.sizeUsd) * 100 : 0, paper: v.venue.paper, fee: l.entry.feeUsd, cs: l.entry.contractSize, tpPct: l.tpPct, slPct: l.slPct, since: l.entry.at, lead: l.id, fmt: l.kind === "event" ? "c" : "usd", close: closeFor(l) })).join("")}</div>${!v.open.length ? `<p class="empty">${state === "live" ? "Nothing open. Search looks every cycle; a lead that Risk clears is placed by the Sniper." : "Nothing open."}</p>` : ""}</section>`;
  // the tape: wins and losses, a bar a close, the biggest marked
  const tp = v.tape;
  const closes = tp.closes || [];
  const maxAbs = Math.max(1e-9, ...closes.map((c) => Math.abs(c.pnlUsd)));
  const bw = closes.length ? Math.min(14, Math.max(3, Math.floor(600 / closes.length) - 2)) : 0;
  const bars = closes.map((c, i) => { const h = Math.max(2, (Math.abs(c.pnlUsd) / maxAbs) * 46); const x = i * (bw + 2); return `<rect class="${c.pnlUsd >= 0 ? "up" : "down"}" x="${x}" y="${c.pnlUsd >= 0 ? 50 - h : 52}" width="${bw}" height="${h}" rx="1.5" data-k="${esc(c.id)}"><title>${esc(`${c.id} ${c.symbol} ${dkSigned(c.pnlUsd)} (${dkPct(c.roiPct)})`)}</title></rect>`; }).join("");
  const tape = `<section class="sec dk-tape" aria-labelledby="dk-tape-h"><div class="sec-head"><div class="label" id="dk-tape-h">Trade tape</div><div class="dk-wl"><span class="tag up">${esc(String(tp.wins))}W</span><span class="tag warn">${esc(String(tp.losses))}L</span><span class="tag">${esc(String(tp.winRatePct))}%</span></div></div>${closes.length ? `<svg class="dk-bars" viewBox="0 0 ${Math.max(600, closes.length * (bw + 2))} 104" preserveAspectRatio="none" role="img" aria-label="${esc(`${closes.length} closes: ${tp.wins} won, ${tp.losses} lost`)}"><line x1="0" y1="51" x2="100%" y2="51" class="base"></line>${bars}</svg>` : '<p class="empty">No close yet: the first lead the Exit closes draws the first bar.</p>'}<div class="dk-tape-f dim small"><span>Last ${esc(String(closes.length))} close${closes.length === 1 ? "" : "s"}</span><span>avg win ${esc(dkPct(tp.avgWinPct))} · avg loss ${esc(dkPct(tp.avgLossPct))}</span></div></section>`;
  const big = `<section class="sec dk-big" aria-labelledby="dk-big-h"><div class="sec-head"><div class="label" id="dk-big-h">Big closes <span class="dim">${esc(String(v.big.length))}/5</span></div><span class="num-m ${v.big.reduce((a, b) => a + b.pnlUsd, 0) >= 0 ? "up" : "down"} dk-big-sum">${esc(dkSigned(v.big.reduce((a, b) => a + b.pnlUsd, 0)))}</span></div><div class="dk-slots">${[0, 1, 2, 3, 4].map((i) => { const b = v.big[i]; return b ? `<div class="dk-slot filled" data-k="${esc(b.id)}"><span class="dim small">#${i + 1}</span>${avatar(b.symbol.split(/[/:@-]/)[0] || b.symbol, "sm")}<b>${esc(b.symbol.split(/[/:@-]/)[0] || b.symbol)}</b><span class="tag ${b.side === "buy" ? "up" : "warn"}">${b.side === "buy" ? "L" : "S"}</span><span class="dk-slot-p ${b.pnlUsd >= 0 ? "up" : "down"}">${esc(dkSigned(b.pnlUsd))}</span><span class="dim small">${esc(dkPct(b.roiPct))} · <span class="mono">${esc(b.id)}</span></span></div>` : `<div class="dk-slot" data-k="empty-${i}"><span class="dim small">#${i + 1}</span><span class="dim dk-q">?</span><span class="dim small">not yet</span></div>`; }).join("")}</div></section>`;
  // the room, its funnel, its routines
  const f = v.funnel;
  const funnel = `<div class="dk-funnel" aria-label="The funnel">${[["scanned", f.scanned], ["cleared", f.cleared], ["confirmed", f.confirmed], ["executed", f.executed], ["closed", f.closed]].map(([k, n], i) => `${i ? '<span class="dk-arrow" aria-hidden="true">→</span>' : ""}<span class="dk-fn"><b>${esc(String(n))}</b> ${k}</span>`).join("")}${f.rejected ? `<span class="dim small">· ${esc(String(f.rejected))} rejected</span>` : ""}</div>`;
  const msgs = (v.room || []).map((m) => `<div class="dk-msg dk-${esc(DK_ROLE_CLASS[m.from] || "note")} dk-k-${esc(m.kind)}" data-k="${m.seq}"><span class="dk-role">${esc(dkTag(m.from))}</span><span class="dk-text">${dkIds(m.text).replace(/\n/g, "<br>")}${m.brain ? ' <span class="dim small">· brain</span>' : ""}</span><span class="dk-at dim">${esc(nyTime(m.at))}</span></div>`).join("");
  const r = v.routines;
  const room = `<section class="sec dk-room" aria-labelledby="dk-room-h"><div class="sec-head"><div class="label" id="dk-room-h">The room</div><span class="dim small">${esc(plural((v.room || []).length, "line"))}</span></div>${funnel}<div class="dk-msgs" role="log" aria-live="polite">${msgs || '<p class="empty">Nothing said yet.</p>'}</div><div class="dk-routines dim small">${state === "live" && r.nextCycleAt ? `<span>Next cycle in <span data-dk-next="${esc(r.nextCycleAt)}">—</span></span>` : `<span>Cycles ${state === "paused" ? "paused" : state === "halted" ? "halted" : "ended"}</span>`}<span>Evening report ${esc(r.reportAt)} NY (<span data-dk-left="${esc(r.nextReportAt)}">—</span>)</span><span>Weekly review ${esc(nyDay(r.weeklyAt))}</span>${owner && state !== "ended" ? dkBtn("report", "Report now", { cls: "link dim" }) : ""}</div></section>`;
  // the roster: each seat, its standing at the door, its limit, its charter
  const roster = `<section class="sec dk-roster" aria-labelledby="dk-roster-h"><div class="sec-head"><div class="label" id="dk-roster-h">Roster</div><div class="tools">${dkBtn("agents", "Every agent ›", { cls: "link dim" })}</div></div><div class="dk-seats">${v.seats.map((s) => { const ok = s.status === "ok"; const needsLimit = ((DK.catalog && DK.catalog.roles.find((x) => x.id === s.role)) || {}).trades && !s.limit; return `<details class="dk-seat" data-k="${esc(s.role)}"><summary><span class="dk-role dk-${esc(s.role)}">${esc(dkTag(s.role))}</span><span class="dk-seat-n"><b>${esc(s.name)}</b><span class="dim small">${esc(s.kind === "house" ? "the house" : "outside")} · ${ok ? (s.limit ? `up to ${money(s.limit.perOrderUsd)} an order · ${money(s.limit.leftUsd)} left of ${money(s.limit.budgetUsd)}${s.limit.renewsAt ? ` · renews ${nyTime(s.limit.renewsAt)} New York` : ""}` : needsLimit ? "no trading limit" : "reads and speaks") : s.status}${s.cards ? ` · ${plural(s.cards, "card")} waiting` : ""}</span></span>${!ok ? '<span class="tag warn">not let in</span>' : needsLimit ? '<span class="tag warn">no limit</span>' : ""}</summary><div class="dk-charter"><div><b>Owns</b><p>${esc(s.charter.owns)}</p></div><div><b>Good output</b><p>${esc(s.charter.good)}</p></div><div><b>Never</b><p>${esc(s.charter.never)}</p></div><div class="acts">${owner ? `${dkBtn("charter", "Edit charter", { cls: "btn btn-sm", data: { role: s.role } })}${!ok ? dkBtn("letin", "Let it in", { cls: "btn btn-sm btn-primary", data: { role: s.role } }) : ""}${ok && needsLimit ? dkBtn("limit", "Give a limit", { cls: "btn btn-sm btn-primary", data: { role: s.role } }) : ""}` : ""}<button type="button" class="link dim" data-dk-act="memory" data-role="${esc(s.role)}">Memory</button></div></div></details>`; }).join("")}</div>${DK.catalog ? `<p class="dim small">${esc(DK.catalog.roles.filter((r) => !v.seats.some((s) => s.role === r.id)).map((r) => r.name).join(", ") || "Every seat is filled")}${DK.catalog.roles.some((r) => !v.seats.some((s) => s.role === r.id)) ? " — not on the desk" : ""}. ${owner ? dkBtn("fill", "Fill a seat…", { cls: "link" }) : ""}</p>` : ""}</section>`;
  const b = v.brain;
  const brain = `<section class="sec dk-brain" aria-labelledby="dk-brain-h"><div class="sec-head"><div class="label" id="dk-brain-h">Brain</div></div><p class="small">${esc(b.label || "")} · <b>${esc(b.model)}</b> · ${esc(b.effort)} effort${b.ok ? ` · reached through ${esc(b.how || "the API")}` : ""}.</p>${b.ok ? "" : `<p class="small warn-t">The house seats cannot think: ${esc(b.why || "no key")}.</p><p class="dim small">The plan's exits still run; no lead is made up. Type its key, test it or pick another brain under Brain….</p>`}<p class="dim small">${esc(String(b.spend.calls))} calls this desk · about ${esc(money(b.spend.usd))} ${b.price ? `at your price ($${esc(String(b.price.inUsd))}/$${esc(String(b.price.outUsd))} per M tokens)` : "at the model's listed price"} (${esc(String(b.spend.inputTokens))} in, ${esc(String(b.spend.outputTokens))} out)${b.spend.unpricedTokens ? ` · ${esc(String(b.spend.unpricedTokens))} tokens unpriced: give the model's price under Brain…` : ""}.</p></section>`;
  return `<div class="dk-grid"><div class="col-main">${hero}${openHtml}${tape}${big}</div><div class="col-side">${room}${roster}${brain}</div></div>`;
}

/* the pane's own clocks: the LIVE counter, the next cycle, the report — one write a second, in the clock's frame */
function dkSecond() {
  if (DK.stopSecond) return;
  DK.stopSecond = everySecond(() => {
    const el = $("pane-desk");
    if (!el || ROUTE.tab !== "desk" || !DK.view) {
      DK.stopSecond = null;
      return false;
    }
    const v = DK.view;
    const writes = [];
    const clock = el.querySelector("[data-dk-clock]");
    if (clock && v.session) {
      const t = dkClock(Date.now() - Date.parse(v.session.startedAt));
      if (clock.textContent !== t) writes.push(() => setText(clock, t));
    }
    const next = el.querySelector("[data-dk-next]");
    if (next) {
      const t = dkLeft(Date.parse(next.dataset.dkNext) - Date.now());
      if (next.textContent !== t) writes.push(() => setText(next, t));
    }
    for (const left of el.querySelectorAll("[data-dk-left]")) {
      const t = `in ${dkLeft(Date.parse(left.dataset.dkLeft) - Date.now())}`;
      if (left.textContent !== t) writes.push(() => setText(left, t));
    }
    return writes.length ? () => writes.forEach((w) => w()) : undefined;
  });
}

const dkBtn = (act, label, { cls = "btn btn-sm", data = {}, title = "" } = {}) => `<button type="button" class="${cls}" data-dk-act="${act}"${Object.entries(data).map(([k, val]) => ` data-${k}="${esc(val)}"`).join("")} data-fk="${esc([act, ...Object.values(data)].join(":"))}"${title ? ` title="${esc(title)}"` : ""}>${label}</button>`;

function dkWire(el) {
  if (el.dataset.dkWired) return;
  el.dataset.dkWired = "1";
  el.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-dk-act]");
    if (!t || !el.contains(t) || t.disabled) return;
    dkAct(t.dataset.dkAct, t.dataset);
  });
}

async function dkAct(act, d) {
  const set = (change, value = "") => own({ type: "setDesk", desk: "desk", change, value }, () => forget("/api/account/desk"));
  switch (act) {
    case "pause": return void set("pause");
    case "resume": return void set("resume");
    case "cycle": return void set("cycle");
    case "report": return void set("report");
    case "end": if (await confirmSheet("End the session? The desk stops; its leads stay as they are (close them from their cards, or start a new session later).", { title: "End the session", yes: "End it", danger: true })) set("end"); return;
    case "objective": return void dkObjectiveForm();
    case "brain": return void dkBrains();
    case "brains": return void dkBrains($("pane-desk"));
    case "charter": return void dkCharterForm(d.role);
    case "fill": return void dkFillForm();
    case "agents": return void (typeof openAgents === "function" && openAgents());
    case "memory": { const s = DK.view && DK.view.seats.find((x) => x.role === d.role); if (s) go("memory", { agent: s.address }); return; }
    case "letin": { const s = DK.view && DK.view.seats.find((x) => x.role === d.role); if (s) await own({ type: "approveAgent", agentAddress: s.address, agentName: s.name, validUntil: nowMs() + 30 * DAY }, () => forget("/api/account/desk")); return; }
    case "limit": { const s = DK.view && DK.view.seats.find((x) => x.role === d.role); if (s && typeof pfLimitForm === "function") pfLimitForm({ agent: s.address, venue: DK.view.objective.venue }); return; }
    case "approve":
    case "reject": { const c = A.cards.find((x) => x.id === d.card); if (c) await own({ type: "approveCard", card: c.id, action: c.hash, decision: act }, () => forget("/api/account/desk")); return; }
    case "setup": return void (typeof copySetup === "function" && copySetup());
    case "knock": return void (typeof pfLetIn === "function" && pfLetIn(A.requests.find((r) => r.address === d.agent) || { address: d.agent }));
    default:
  }
}

/* the brain's fields: which one thinks, the model (listed, or named as the endpoint names it — with the model ids the provider's own docs
   suggest in a datalist, ui/brains.js brOf, never offered as the whole list), the owner's price, the effort. opts.fix(b): where a brain
   that is not ready gets its key, drawn in that brain's own block in place of its reason (the superagent's setup says it there, once);
   opts.idp: the datalists' id prefix, so the hiring form and the superagent's setup, both on the page, never share an id.
   THE EFFORT offers only what the picked provider takes of the desk's three (its catalog entry's efforts, ui/brains.js brOf: DeepSeek takes
   low and high, a provider that takes none has its own default) — each block says its provider's in data-efforts, and the change of the
   Brain select (the owner's pick, core formKeep putting a choice back, the Brains sheet's "Pick it for the desk") offers that provider's
   anew (dkBrainShow). A provider that takes none: no effort field, and none signed — so what is signed and said is what is sent */
function dkBrainFields(brains, cur, opts = {}) {
  const pick = (cur && cur.provider) || brains[0].id;
  // a server on this machine whose only want is a model's name (ui/brains.js brOnlyModel): "needs a model" — the field above it is the way,
  // and it is ready with the model the form signs — never "not ready" beside the model typed for it. In the hiring form (no opts.fix) its
  // own words say so, not the account's sentence, which names the Brains sheet's button
  const onlyModel = (b) => typeof brOnlyModel === "function" && typeof brOf === "function" && brOnlyModel(brOf(b));
  const standing = (b) =>
    b.ok
      ? `<span class="tag up">ready</span> <span class="dim small">through ${esc(b.how || "the API")}</span>`
      : onlyModel(b)
        ? `<span class="tag">needs a model</span>${typeof opts.fix === "function" ? opts.fix(b) : ' <span class="dim small">Runs on this machine and needs no key: name a model it serves above. It is ready with that model once you sign.</span>'}`
        : typeof opts.fix === "function"
          ? `<span class="tag warn">not ready</span>${opts.fix(b)}`
          : `<span class="tag warn">not ready</span> <span class="dim small">${esc(b.why || "")}</span>`;
  const blocks = brains.map((b) => {
    const mine = !!cur && cur.provider === b.id;
    const model = mine ? cur.model : b.model || (b.models[0] ? b.models[0].id : "");
    const price = mine && cur.price ? cur.price : null;
    const fields = b.models.length
      ? `<div class="row2">${field("Model", select(`model-${b.id}`, b.models.map((m) => [m.id, `${m.name} · $${m.inUsd}/$${m.outUsd} per M tokens`]), model))}<div></div></div>`
      : `<div class="row2">${field("Model, as the endpoint names it", `<input name="model-${esc(b.id)}" value="${esc(model)}" list="${esc(`${opts.idp || "dk"}-ml-${b.id}`)}" autocomplete="off" spellcheck="false" placeholder="${esc(dkSuggest(b)[0] ? `e.g. ${dkSuggest(b)[0][0]}` : "its model id")}" /><datalist id="${esc(`${opts.idp || "dk"}-ml-${b.id}`)}">${dkSuggest(b).map(([m, w]) => `<option value="${esc(m)}"${w ? ` label="${esc(w)}"` : ""}></option>`).join("")}</datalist>`)}${field("Its price per M tokens ($ in · $ out, optional)", `<div class="dk-price"><input name="in-${esc(b.id)}" inputmode="decimal" placeholder="in" value="${price ? esc(String(price.inUsd)) : ""}" /><input name="out-${esc(b.id)}" inputmode="decimal" placeholder="out" value="${price ? esc(String(price.outUsd)) : ""}" /></div>`)}</div>`;
    return `<div class="dk-brain-of" data-brain="${esc(b.id)}" data-efforts="${esc(dkEfforts(b).join(" "))}"${b.id === pick ? "" : " hidden"}>${fields}<${!b.ok && typeof opts.fix === "function" ? "div" : "p"} class="small dk-standing">${standing(b)}</${!b.ok && typeof opts.fix === "function" ? "div" : "p"}></div>`;
  }).join("");
  // each provider's standing as the Brains sheet words it (Ready · key …ab12, No key, Key refused, Local · ready …)
  const word = (b) => (typeof brOf === "function" ? brStanding(brOf(b))[0] : b.ok ? "ready" : "no key");
  const picked = brains.find((b) => b.id === pick) || brains[0];
  const efforts = dkEfforts(picked);
  const effort = `<label data-dk-effort${efforts.length ? "" : " hidden"}>Effort${select("effort", efforts.map((e) => [e, e]), dkEffortOf(efforts, (cur && cur.effort) || ""))}</label>`;
  return `<div class="row2">${field("Brain", select("provider", brains.map((b) => [b.id, `${b.label} · ${word(b)}`]), pick))}${efforts.length ? effort : effort.replace("<select ", "<select disabled ")}</div>${blocks}`;
}
/* the efforts a provider takes of the desk's three: its catalog entry's (ui/brains.js brOf reads it, or the page's own fact for an older
   account's entry); all three where the Brains sheet is not loaded */
const dkEfforts = (b) => (typeof brOf === "function" ? brOf(b).efforts : ["low", "medium", "high"]);
/* the effort to show of those offered: the one asked for where it is offered, else medium, else the highest offered ("" for none) */
const dkEffortOf = (efforts, want) => (efforts.includes(want) ? want : efforts.includes("medium") ? "medium" : efforts[efforts.length - 1] || "");
/** the chosen provider's own block shown, the others' hidden, and the effort offering that provider's own choices — the one chosen kept
 * where it is still offered (a provider that takes none: the field hidden and off, so nothing is signed for it) */
function dkBrainShow(form, id) {
  if (!form || !form.querySelectorAll) return;
  let efforts = null;
  form.querySelectorAll(".dk-brain-of").forEach((x) => {
    x.hidden = x.dataset.brain !== id;
    if (!x.hidden) efforts = String(x.dataset.efforts || "").split(" ").filter(Boolean);
  });
  const sel = form.querySelector('select[name="effort"]');
  if (!sel || !efforts) return;
  const now = sel.value;
  if ([...(sel.options || [])].map((o) => o.value).join(" ") !== efforts.join(" ")) sel.innerHTML = efforts.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
  if (efforts.length) sel.value = dkEffortOf(efforts, now);
  sel.disabled = !efforts.length;
  const wrap = sel.closest ? sel.closest("[data-dk-effort]") : null;
  if (wrap) wrap.hidden = !efforts.length;
}

/* the model ids a provider's own docs suggest, as the Brains sheet has them ([id, a few words]); none where the sheet is not loaded */
const dkSuggest = (b) => (typeof brOf === "function" ? brOf(b).suggest : []);

/* the brain as the form says it — or why not yet: a model that looks like an API key is refused in words that never repeat it (ui/brains.js
   brKeyShaped: a key signed as a model's name would be kept in the ledger and sent to the provider); the effort only where the provider takes
   it (the field is off, and so not in the form's fields, where it takes none) */
function dkBrainDraft(f, brains) {
  const b = brains.find((x) => x.id === f.provider) || brains[0];
  const model = String(f[`model-${b.id}`] || "").trim();
  if (!model) return "Name the model, as the endpoint names it.";
  if (typeof brKeyShaped === "function" && brKeyShaped(model)) return BR_KEY_WORDS.model;
  const effort = f.effort && dkEfforts(b).includes(f.effort) ? f.effort : "";
  const out = { provider: b.id, model, ...(effort ? { effort } : {}) };
  if (!b.models.length) {
    const i = String(f[`in-${b.id}`] || "").trim();
    const o = String(f[`out-${b.id}`] || "").trim();
    if (i || o) {
      if (!i || !o || !(Number(i) >= 0) || !(Number(o) >= 0)) return "A price is dollars per million tokens, in and out.";
      out.price = { inUsd: Number(i), outUsd: Number(o) };
    } else out.price = null;
  }
  return out;
}

/** the brains (ui/brains.js): from the hired desk's "Brain…", the sheet on the brain it thinks with, "Use this brain" signing setDesk change
 * "brain"; from the hiring form's "Brains ›" (`pane` given), the same sheet, "Pick it for the desk" putting the provider and the model into
 * that form. A key saved there flips the brain to ready here at the next read of the catalog, which is dropped at once */
function dkBrains(pane) {
  if (typeof openBrains !== "function") return;
  const form = () => (pane && pane.querySelector ? pane.querySelector("form.dk-hire-f") : null);
  const hiring = !!pane && !DK.view;
  openBrains({
    where: hiring ? "hire" : "agents",
    catalog: DK.catalog,
    cur: () => (hiring ? (form() && typeof dkBrainDraft === "function" ? dkBrainDraft(formFields(form()), (DK.catalog && (DK.catalog.brains || [DK.catalog.brain])) || []) : null) : DK.view && DK.view.brain),
    desk: () => !hiring && !!DK.view,
    ...(hiring ? { form } : {}),
    after: () => {
      forget("/api/account/desk");
      dkRead();
    },
  });
}

/* the chosen brain's own fields shown, the others' hidden, its own efforts offered — on the hire form and the superagent's setup alike, at
   the owner's pick, a choice core formKeep puts back, and the Brains sheet's pick */
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t || t.name !== "provider" || !t.closest) return;
  const form = t.closest("form");
  if (form) dkBrainShow(form, t.value);
});

/* a session's hours as the desk takes them — [the least, the most]: the catalog's bounds, the desk's own clamp before it is read */
const dkHoursBounds = () => (DK.catalog && DK.catalog.bounds && Array.isArray(DK.catalog.bounds.hours) ? DK.catalog.bounds.hours : [1, 336]);

/* the objective, changed by signature */
function dkObjectiveForm() {
  const o = DK.view.objective;
  const venues = connected().filter((v) => canTrade(v));
  quoteDialog({
    title: "The objective",
    sub: "One room, one objective: what the desk is for this week. Words and numbers the house seats read; the authority stays the limits you signed.",
    fields: `${field("Your words", `<textarea name="text" rows="2" maxlength="200">${esc(o.text)}</textarea>`)}<div class="row2">${field("Venue", select("venue", venues.map((v) => [v.id, v.name]), o.venue))}${field("Universe", select("universe", (DK.catalog ? DK.catalog.universes : []).map((u) => [u.id, u.label]), o.universe))}</div><div class="row2">${field("Target this week (%)", `<input name="targetPct" inputmode="decimal" value="${esc(String(o.targetPct))}" />`)}${field("At most, a lead (% of equity)", `<input name="maxRiskPct" inputmode="decimal" value="${esc(String(o.maxRiskPct))}" />`)}</div><div class="row2">${field("Halt at a day's loss of (%)", `<input name="maxDailyLossPct" inputmode="decimal" value="${esc(String(o.maxDailyLossPct))}" />`)}${field("Leads open at once", `<input name="maxOpen" inputmode="numeric" value="${esc(String(o.maxOpen))}" />`)}</div><div class="row2">${field("A cycle every (min)", `<input name="everyMin" inputmode="numeric" value="${esc(String(o.everyMin))}" />`)}${field("Evening report (New York)", `<input name="reportAt" value="${esc(o.reportAt)}" placeholder="21:00" />`)}</div><div class="row2">${field("Session (hours)", `<input name="hours" inputmode="numeric" value="${esc(String(o.hours))}" />`)}<p class="dim small">How long a session runs before it ends, up to two weeks (${dkHoursBounds()[1]} h) — from the next one you start: the one running keeps its end.</p></div>`,
    go: "Sign the objective",
    draft(form) {
      const f = formFields(form);
      if (!String(f.text || "").trim()) return "Say what the desk is for, in a sentence.";
      for (const k of ["targetPct", "maxRiskPct", "maxDailyLossPct", "everyMin", "maxOpen", "hours"]) if (!(Number(f[k]) > 0)) return "Every number is more than zero.";
      if (!/^\d{1,2}:\d{2}$/.test(String(f.reportAt))) return "The report's hour is hh:mm, New York.";
      // a session's hours inside what the desk takes, said here: the desk would hold one outside to the nearest end without a word
      const [lo, hi] = dkHoursBounds();
      if (Number(f.hours) < lo || Number(f.hours) > hi) return `A session is ${lo} to ${hi} hours, not ${String(f.hours).trim()}.`;
      return { type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ text: String(f.text).trim(), venue: f.venue, universe: f.universe, targetPct: Number(f.targetPct), maxRiskPct: Number(f.maxRiskPct), maxDailyLossPct: Number(f.maxDailyLossPct), hours: Number(f.hours), everyMin: Number(f.everyMin), maxOpen: Number(f.maxOpen), reportAt: f.reportAt }) };
    },
    show(p) { const x = JSON.parse(p.action.value); return `<div class="big"><span>“${esc(x.text)}”</span></div><div class="path">At ${esc(nameOf(x.venue))} · target ${esc(dkPct(x.targetPct))} · at most ${esc(String(x.maxRiskPct))}% a lead · halt at -${esc(String(x.maxDailyLossPct))}% · ${esc(String(x.maxOpen))} open at once · every ${esc(String(x.everyMin))} min · sessions of ${esc(String(x.hours))} h · report ${esc(x.reportAt)} New York.</div>`; },
    done: () => { forget("/api/account/desk"); return "The objective is signed."; },
  });
}

/* a seat's charter, changed by signature */
function dkCharterForm(role) {
  const s = DK.view && DK.view.seats.find((x) => x.role === role);
  if (!s) return;
  quoteDialog({
    title: `${dkName(role)}: the charter`,
    sub: "What it owns, what good output looks like, what it never does without asking. Words for the brain: the door enforces the limits, not the words.",
    fields: `${field("Owns", `<textarea name="owns" rows="2" maxlength="400">${esc(s.charter.owns)}</textarea>`)}${field("Good output", `<textarea name="good" rows="2" maxlength="400">${esc(s.charter.good)}</textarea>`)}${field("Never", `<textarea name="never" rows="2" maxlength="400">${esc(s.charter.never)}</textarea>`)}`,
    go: "Sign the charter",
    draft(form) { const f = formFields(form); if (!String(f.owns).trim() || !String(f.good).trim() || !String(f.never).trim()) return "Each of the three has a sentence."; return { type: "setDesk", desk: "desk", change: "charter", value: JSON.stringify({ role, owns: String(f.owns).trim(), good: String(f.good).trim(), never: String(f.never).trim() }) }; },
    show: () => `<div class="big"><span>${esc(dkTag(role))}'s charter</span></div><div class="path">Read by the house brain at every step it takes; an outside seat reads it over MCP.</div>`,
    done: () => { forget("/api/account/desk"); return `${dkName(role)}'s charter is signed.`; },
  });
}

/* a seat filled: from the house, or by an agent of the owner's own (its key let in first), or left empty */
function dkFillForm() {
  if (!DK.catalog || !DK.view) return;
  const roles = DK.catalog.roles;
  const keys = A.keys.filter((k) => k.status === "ok" && !DK.view.seats.some((s) => s.address === k.address));
  quoteDialog({
    title: "Fill a seat",
    sub: "A house seat is the account's own key; an outside seat is an agent of yours, let in under Agents, which reads its charter and the room over MCP (portfolio_desk) and speaks in it (portfolio_desk_say).",
    fields: `${field("Seat", select("role", roles.map((r) => [r.id, `${r.name}${DK.view.seats.some((s) => s.role === r.id) ? " (filled)" : ""}`])))}${field("Filled by", select("kind", [["house", "The house (the account runs it)"], ["outside", "An agent of mine"], ["none", "Nobody: leave it empty"]]))}${field("The agent", select("address", [["", "Pick one let in under Agents"], ...keys.map((k) => [k.address, k.name])]))}`,
    go: "Sign the seat",
    draft(form) {
      const f = formFields(form);
      const r = roles.find((x) => x.id === f.role);
      if (!r) return "Pick a seat.";
      if (f.kind === "house" && !r.house) return `The ${r.name} seat ${r.outsideOnly}.`;
      if (f.kind === "outside" && !/^0x[0-9a-fA-F]{40}$/.test(String(f.address || ""))) return "Pick the agent that fills it (let it in under Agents first).";
      return { type: "setDesk", desk: "desk", change: "seat", value: JSON.stringify(f.kind === "outside" ? { role: f.role, kind: "outside", address: f.address } : { role: f.role, kind: f.kind }) };
    },
    show(p) { const x = JSON.parse(p.action.value); return `<div class="big"><span>${esc(dkName(x.role))} · ${esc(x.kind === "house" ? "the house" : x.kind === "outside" ? keyName(x.address) : "empty")}</span></div><div class="path">${x.kind === "outside" ? "A trading seat needs a trading limit at the desk's venue, given under Agents." : x.kind === "house" ? "Let its key in under Roster if it is not yet." : "The seat's key stays let in; revoke it under Agents if you wish."}</div>`; },
    done: () => { forget("/api/account/desk"); return "The seat is signed."; },
  });
}

// ---- hiring --------------------------------------------------------------------------------------------------------------

function dkHireHtml(owner) {
  const c = DK.catalog;
  const venues = connected().filter((v) => canTrade(v));
  const paper = venues.find((v) => v.paper);
  const v0 = paper || venues[0];
  const d = c.defaults;
  const house = c.roles.filter((r) => r.house);
  const outside = c.roles.filter((r) => !r.house);
  const keys = A.keys.filter((k) => k.status === "ok");
  const equity = v0 ? v0.usd : 0;
  const per = Math.max(1, Math.round((equity * d.maxRiskPct) / 100));
  const knocks = (A.requests || []).map((r) => `<div class="dk-knock"><span><b>${esc(r.name || "An agent")}</b> asks to be let in <span class="mono dim">${esc(short(r.address))}</span></span>${owner ? dkBtn("knock", "Let it in…", { cls: "btn btn-sm btn-primary", data: { agent: r.address } }) : ""}</div>`).join("");
  const own = `<section class="sec dk-own" aria-labelledby="dk-own-h"><div class="sec-head"><div class="label" id="dk-own-h">Bring your own agent</div></div><p class="small">Any agent with a key is a seat at the same door: run the setup command where it runs (Claude Code over MCP, or any program that signs with its key), it knocks here, and you let it in and give it a limit.</p><div class="acts">${dkBtn("setup", `${icon("copy", "sm")}Copy setup command`, { cls: "btn btn-sm" })}${dkBtn("agents", "Every agent ›", { cls: "link dim" })}</div>${knocks}</section>`;
  if (!venues.length) return `<div class="dk-grid"><div class="col-main"><section class="sec dk-hire"><div class="label">Hire the desk</div><p>The desk trades one venue. Connect an account that trades first — or ${typeof optionOf === "function" ? `<button type="button" class="link" data-dk-act="paperstart">start a paper account</button>` : "start a paper account"}: paper money in the public markets, nothing to connect, and the recommended first venue for a desk.</p></section></div><div class="col-side">${own}</div></div>`;
  const brains = c.brains || [c.brain];
  const form = `<form class="dk-hire-f" novalidate autocomplete="off">
    <div class="dk-step"><div class="label">1 · One room, one objective</div>
      ${field("Your words", '<textarea name="text" rows="2" maxlength="200" placeholder="e.g. Small, careful entries on majors this week; nothing I would not explain to my mother"></textarea>')}
      <div class="row2">${field("Venue", select("venue", venues.map((v) => [v.id, `${v.name}${v.paper ? " · paper" : ""} · ${money(v.usd)}`]), v0 ? v0.id : ""))}${field("Universe", select("universe", c.universes.map((u) => [u.id, u.label]), d.universe))}</div>
      <div class="row2">${field("Target this week (%)", `<input name="targetPct" inputmode="decimal" value="${esc(String(d.targetPct))}" />`)}${field("At most, a lead (% of equity)", `<input name="maxRiskPct" inputmode="decimal" value="${esc(String(d.maxRiskPct))}" />`)}</div>
      <div class="row2">${field("Halt at a day's loss of (%)", `<input name="maxDailyLossPct" inputmode="decimal" value="${esc(String(d.maxDailyLossPct))}" />`)}${field("Session (hours)", `<input name="hours" inputmode="numeric" value="${esc(String(d.hours))}" />`)}</div>
      <div class="row2">${field("A cycle every (min)", `<input name="everyMin" inputmode="numeric" value="${esc(String(d.everyMin))}" />`)}${field("Evening report (New York)", `<input name="reportAt" value="${esc(d.reportAt)}" />`)}</div>
      <p class="dim small">${paper ? "A paper account is a wallet you are willing to lose: nothing in it is money." : "Every order is held to the limits you sign below and to the server's cap."}</p>
    </div>
    <div class="dk-step"><div class="label">2 · The roster: charters, not prompts</div>
      <div class="dk-roles">${house.map((r) => `<label class="dk-role-pick"><input type="checkbox" name="role" value="${esc(r.id)}" ${r.id === "watch" ? "" : "checked"} ${r.id === "head" ? "disabled checked" : ""} /><span class="dk-role dk-${esc(r.id)}">${esc(r.tag)}</span><span class="dk-role-t"><b>${esc(r.name)}</b><span class="dim small">${esc(r.charter.owns)}</span><details class="dk-ch"><summary>Charter</summary><div><b>Good output</b> ${esc(r.charter.good)}</div><div><b>Never</b> ${esc(r.charter.never)}${r.trades ? " <span class='tag warn'>trades: needs a limit</span>" : " <span class='tag'>no trading key</span>"}</div></details></span></label>`).join("")}</div>
      <div class="dk-outside">${outside.map((r) => `<div class="dk-role-pick"><span class="dk-role dk-${esc(r.id)}">${esc(r.tag)}</span><span class="dk-role-t"><b>${esc(r.name)}</b> <span class="tag">from outside</span><span class="dim small">${esc(r.outsideOnly)}.</span>${field("An agent of mine", select(`outside-${r.id}`, [["", "Leave the seat empty"], ...keys.map((k) => [k.address, k.name])]))}</span></div>`).join("")}</div>
    </div>
    <div class="dk-step"><div class="label">3 · The limits the trading seats get</div>
      <div class="row2">${field("A lead, up to ($)", `<input name="per" inputmode="decimal" value="${esc(String(per))}" />`)}${field("In all, per seat ($)", `<input name="budget" inputmode="decimal" value="${esc(String(per * 10))}" />`)}</div>
      <div class="row2">${field("The seats stay for", select("days", [["7", "7 days"], ["30", "30 days"], ["90", "90 days"]], "30"))}<div></div></div>
      <p class="dim small">Sniper, Exit and Watch get a trading limit at the venue (your signature each); Head, Search and Risk get none — the door refuses them an order whatever they decide. In Guard every order still waits for you on a card.</p>
    </div>
    <div class="dk-step"><div class="label">4 · The brain ${dkBtn("brains", "Brains: add a key, pick a model ›", { cls: "link" })}</div>
      ${dkBrainFields(brains, c.brain, { idp: "dk" })}
      <p class="dim small">Claude through the Anthropic API, or a model API in OpenAI's chat format — OpenAI, DeepSeek, Grok, Muse, Kimi, Qwen and more — or a model on this machine. Its key is typed once under Brains, kept by the account on this machine and sent only to its provider. The desk asks one structured question at a time; the limits you signed stay the authority.</p>
    </div>
    <div class="dk-hire-go"><div class="msg" data-dk-msg role="status"></div><button type="submit" class="btn btn-primary"${owner ? "" : ' disabled title="This browser can look but not sign"'}>Hire the desk</button><span class="dim small" data-dk-count></span></div>
  </form>`;
  return `<div class="dk-grid"><div class="col-main"><section class="sec dk-hire" aria-labelledby="dk-hire-h"><div class="sec-head"><div class="label" id="dk-hire-h">Hire the desk</div></div><p class="small">Eight seats, a charter each, one room, one objective. Every seat is a key you let in; the ones that trade do so inside a limit you sign, through the same door as any agent. The house runs them with a brain; any seat can be an agent of your own instead.</p>${form}</section></div><div class="col-side">${own}</div></div>`;
}

function dkHireWire(body, owner) {
  const form = body.querySelector("form.dk-hire-f");
  if (!form) {
    const ps = body.querySelector('[data-dk-act="paperstart"]');
    if (ps) ps.addEventListener("click", () => typeof openConnect === "function" && typeof optionOf === "function" && openConnect(optionOf("paper"), { name: "Paper account", back: true }));
    return;
  }
  const count = () => {
    const f = formFields(form);
    const roles = new FormData(form).getAll("role").map(String);
    if (!roles.includes("head")) roles.unshift("head");
    const trading = roles.filter((r) => (DK.catalog.roles.find((x) => x.id === r) || {}).trades);
    const outside = DK.catalog.roles.filter((r) => !r.house && f[`outside-${r.id}`]).length;
    form.querySelector("[data-dk-count]").textContent = `${roles.length + trading.length + 1} signatures: ${roles.length} seats let in, ${trading.length} limits, the desk${outside ? ` · ${outside} outside seat${outside === 1 ? "" : "s"}` : ""}`;
  };
  form.addEventListener("change", count);
  count();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!owner || busy) return;
    const f = formFields(form);
    const msg = form.querySelector("[data-dk-msg]");
    const say = (t, cls = "") => { msg.className = `msg${cls ? ` ${cls}` : ""}`; msg.textContent = t; };
    if (!String(f.text || "").trim()) return void say("Say what the desk is for, in a sentence.", "no");
    for (const k of ["targetPct", "maxRiskPct", "maxDailyLossPct", "hours", "everyMin", "per", "budget"]) if (!(Number(f[k]) > 0)) return void say("Every number is more than zero.", "no");
    const brain = dkBrainDraft(f, DK.catalog.brains || [DK.catalog.brain]);
    if (typeof brain === "string") return void say(brain, "no");
    const roles = new FormData(form).getAll("role").map(String);
    if (!roles.includes("head")) roles.unshift("head");
    const until = nowMs() + Number(f.days || 30) * DAY;
    const seats = DK.catalog.seats;
    const steps = [];
    for (const r of roles) {
      const spec = DK.catalog.roles.find((x) => x.id === r);
      if (!spec || !seats[r]) continue;
      steps.push({ say: `Let in Desk ${spec.name.replace(" of desk", "")}`, draft: { type: "approveAgent", agentAddress: seats[r], agentName: `Desk ${spec.name.replace(" of desk", "")}`, validUntil: until } });
    }
    for (const r of roles) {
      const spec = DK.catalog.roles.find((x) => x.id === r);
      if (spec && spec.trades && seats[r]) steps.push({ say: `${spec.name}'s trading limit`, draft: { type: "approveSpend", agent: seats[r], scope: "trade", allow: f.venue, perPayment: String(f.per), budget: String(f.budget), windowHours: 0, validUntil: until } });
    }
    const outsideSeats = DK.catalog.roles.filter((r) => !r.house && f[`outside-${r.id}`]).map((r) => ({ role: r.id, kind: "outside", address: f[`outside-${r.id}`] }));
    steps.push({ say: "Hire the desk", draft: { type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: "The desk", objective: { text: String(f.text).trim(), venue: f.venue, universe: f.universe, targetPct: Number(f.targetPct), maxRiskPct: Number(f.maxRiskPct), maxDailyLossPct: Number(f.maxDailyLossPct), hours: Number(f.hours), everyMin: Number(f.everyMin), reportAt: f.reportAt }, brain, roles: [...roles.map((role) => ({ role, kind: "house" })), ...outsideSeats] }) } });
    busy = true;
    document.body.classList.add("busy");
    form.querySelector("button[type=submit]").disabled = true;
    try {
      for (const [i, s] of steps.entries()) {
        say(`${i + 1} of ${steps.length} · ${s.say}…`, "wait");
        const r = await Owner.act(s.draft);
        if (refusedAt(r)) {
          say(`${s.say}: ${Owner.why(r) || "refused"}. What was signed before it stands; fix it and hire again.`, "no");
          busy = false;
          document.body.classList.remove("busy");
          form.querySelector("button[type=submit]").disabled = false;
          await load();
          return;
        }
      }
      say("Hired. The desk is live.", "ok");
      said = "The desk is hired: its seats are let in, its limits signed, its session live.";
    } finally {
      busy = false;
      document.body.classList.remove("busy");
    }
    forget("/api/account/desk");
    DK.view = null;
    await load();
    dkRead();
  });
}
