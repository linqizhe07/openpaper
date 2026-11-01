/* PRACTICE (#/practice): THE SIMULATOR (account/practice.ts) — a past day played back blind, ten to fifty times faster than it happened,
   traded with the same Trade ticket and the same door as the paper accounts (every entry there with its plan), kept in the same journal,
   and scored at its bell beside chance, holding the market and the desk. Every figure is the account's; the page only draws them.

   What it reads, only while the pane shows:
     GET  /api/account/practice?since=     the session on — its practice clock, its minute bars closed by it (after the last one the page
                                           has), the quote now, the practice account's cash, position and orders and the session's trades —
                                           its score with the day, the coin and the factor once it has ended; the sessions ended; the days
                                           left to practise on and to sit as exams
     GET  /api/account/license             THE LICENSE (account/license.ts): what the record here lets one real order of the owner's own be
                                           worth — read when the page opens and again after each bell
   What it sends:
     POST /api/account/practice/clock      the clock started, stopped or set to 10, 20, 30 or 50 times (unsigned: no money, no day spent)
     connectVenue live:practice            the practice account opened, once (signed)
     setPractice start · end               a session started, or ended before its bell (signed, its words said before)
     setPolicy self                        the owner's own limits with the license in them, or out of them (signed, after a yes)
   Buy…, Sell… and Close… open the Trade ticket and the close sheet on the practice market: the same door, and the plan the ticket asks for.

   THE PAGE: the header · the practice account to open · the session on — its clock and controls, the chart (its minutes, folded as asked;
   no date anywhere: its days are D−2, D−1 and the Day), the quote, the position and orders, the trades so far · its score at the bell, the
   day told · a session to start · your license · the sessions ended. While a session's clock runs the page reads again about once a
   practice minute. */

const PR = { read: null, err: "", bars: [], session: "", size: 5, timer: 0, license: null, licSessions: -1 };
const PR_SIZES = [[1, "1m"], [5, "5m"], [15, "15m"], [60, "1h"]];
/* the candles drawn, and the minutes kept: the two days before a session and its day */
const PR_SHOWN = 96;
const PR_KEPT = 6_000;
const PR_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PR_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function renderPractice({ el }) {
  if (!el.firstElementChild || el.firstElementChild.dataset.pr !== "1") {
    el.innerHTML = '<div class="pr" data-pr="1"><div class="pr-head" data-pr-part="head"></div><div class="pr-body" data-pr-part="body" aria-live="polite"><div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel"></span></div></div></div>';
    prWire(el);
  }
  prDraw(el);
  prRead();
}

/* the read: the minutes after the last one kept; a new session's from its start */
function prRead() {
  const last = PR.bars.length ? PR.bars[PR.bars.length - 1].t : undefined;
  const path = `/api/account/practice${last !== undefined ? `?since=${last}` : ""}`;
  return api(path).then((b) => {
    if (b && b.ok) {
      const id = b.session ? b.session.id : "";
      if (id !== PR.session) [PR.session, PR.bars] = [id, []];
      PR.bars = PR.bars.concat(b.bars || []).slice(-PR_KEPT);
      [PR.read, PR.err] = [b, ""];
      // the license, read when the page opens and again once a bell has added a session to the record
      const played = (b.sessions || []).length;
      if (played !== PR.licSessions) {
        PR.licSessions = played;
        prLicense();
      }
    } else PR.err = refusalOf(b) || "The account did not answer.";
    prAgain();
    prNext();
  });
}
function prLicense() {
  return api("/api/account/license").then((b) => {
    if (b && b.ok) PR.license = b;
    prAgain();
  });
}
function prAgain() {
  const el = document.getElementById("pane-practice");
  if (el && ROUTE.tab === "practice") prDraw(el);
}
/* the next read: about one practice minute on while the clock runs (between 0.6 and 3 seconds), every two seconds while the desk is run
   over an ended session's day, none while the clock is stopped or the pane is not shown */
function prNext() {
  clearTimeout(PR.timer);
  const s = PR.read && PR.read.session;
  if (!s || ROUTE.tab !== "practice" || document.hidden) return;
  const scoring = !!s.endedAt && !(s.score && s.score.desk);
  if (!s.running && !scoring) return;
  const ms = scoring ? 2_000 : Math.max(600, Math.min(3_000, Math.round(60_000 / (Number(s.speed) || 20))));
  PR.timer = setTimeout(() => void (ROUTE.tab === "practice" && prRead()), ms);
}

function prWire(el) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pr]");
    if (!b || b.disabled) return;
    const s = PR.read && PR.read.session;
    const act = b.dataset.pr;
    if (act === "open") return void own({ type: "connectVenue", venue: "practice", connector: "live:practice", label: "Practice", credentialRef: "10000" }, () => prRead());
    if (act === "start") return void prStartForm();
    if (act === "end" && s) return void prEndForm(s);
    if (act === "run" || act === "stop") return void prClock({ run: act === "run" });
    if (act === "speed") return void prClock({ speed: Number(b.dataset.speed) });
    if (act === "size") {
      PR.size = Number(b.dataset.size) || 5;
      return void prAgain();
    }
    if ((act === "buy" || act === "sell") && s && typeof openTicket === "function") return void openTicket({ kind: "perps", venue: "practice", symbol: s.symbol, side: act });
    const p = PR.read && PR.read.account && PR.read.account.position;
    if (act === "close" && s && p && typeof openClose === "function") return void openClose({ ...p, venue: "practice", venueName: "Practice", name: s.name });
    if (act === "debrief") {
      if (typeof DB === "object") DB.practice = "1";
      go("debrief", {});
    }
    if (act === "lic-hold" || act === "lic-up" || act === "lic-off") void prLicenseAct(act);
  });
}

/* the clock moved (unsigned): read again at once */
async function prClock(body) {
  const r = await postJson("/api/account/practice/clock", body);
  if (!r.body || r.body.ok === false) PR.err = refusalOf(r.body) || "The clock did not move.";
  return prRead();
}

function prDraw(el) {
  const head = el.querySelector('[data-pr-part="head"]');
  const body = el.querySelector('[data-pr-part="body"]');
  if (head) paint(head, prHeadHtml(PR.read));
  if (!body) return;
  if (PR.err && !PR.read) return paint(body, `<div class="msg no">${esc(PR.err)}</div>`);
  const r = PR.read;
  if (!r) return;
  const s = r.session;
  const on = s && !s.endedAt;
  paint(body, `${PR.err ? `<div class="msg no">${esc(PR.err)}</div>` : ""}${r.connected ? "" : prOpenHtml()}${on ? prSessionHtml(r) : ""}${s && s.endedAt ? prScoreHtml(s, r) : ""}${r.connected && !on ? prStartHtml(r) : ""}${prLicenseHtml(PR.license)}${prHistoryHtml(r.sessions || [])}`);
}

function prHeadHtml(r) {
  const chain = r && r.record && r.record.intact === false ? '<span class="chip bad" title="A line of the practice record was changed or cut: what follows it is not read">Record broken</span>' : "";
  return `<div class="pr-top"><div><h1 class="h2">Practice</h1><p class="dim small">A past day of a coin, played back blind ten to fifty times faster than it happened: the date, the coin and the price level hidden until the bell. You trade it with the same ticket and door as your paper accounts — every entry with its plan — and at the bell it is scored beside random entries, holding the market and the desk on the same minutes.</p></div>${chain}</div>`;
}

function prOpenHtml() {
  const me = owns();
  return `<section class="sec pr-open"><div class="card-head"><h2 class="h2">The practice account</h2></div><p class="small">A paper account of its own, on a clock of its own: each session starts its book again with the session's paper money. Its trades go to the journal marked as practice — the Debrief reads them apart, and your own limits never count them.</p>${me ? '<div class="acts"><button type="button" class="btn btn-primary" data-pr="open">Open the practice account</button></div>' : ""}</section>`;
}

/* a moment on the practice calendar: its weekday and time of day (UTC) are the real day's, its date is not */
function prTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${PR_DAYS[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}
/* the real day, told at the bell */
function prDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? `${PR_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${PR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : String(day);
}
const prPrice = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const prPct = (n, places = 2) => (Number.isFinite(Number(n)) ? `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${Math.abs(Number(n)).toFixed(places)}%` : "—");
const prUsd = (n) => (Number.isFinite(Number(n)) ? `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${money(Math.abs(Number(n)))}` : "—");

/* THE SESSION ON: its clock, the chart, the quote, the position, the orders, the trades so far */
function prSessionHtml(r) {
  const s = r.session;
  const me = owns();
  const done = s.minutes ? Math.min(100, Math.max(0, (s.minute / s.minutes) * 100)) : 0;
  const speeds = ((r.asks && r.asks.speeds) || [10, 20, 30, 50]).map((x) => `<button type="button" data-pr="speed" data-speed="${esc(x)}" aria-pressed="${String(x === s.speed)}"${me ? "" : " disabled"}>${esc(x)}×</button>`).join("");
  const run = me ? `<button type="button" class="btn ${s.running ? "" : "btn-primary"}" data-pr="${s.running ? "stop" : "run"}">${s.running ? "Pause" : s.minute ? "Go on" : "Start the clock"}</button>` : "";
  const clock = `<div class="pr-clock"><div class="pr-time"><span class="pr-num">${esc(prTime(s.now))}</span><span class="dim small">minute ${esc(s.minute)} of ${esc(s.minutes)} · ${s.running ? `${esc(s.speed)}× — a minute every ${esc((60 / s.speed).toFixed(1))} s` : "stopped"}</span></div><div class="pr-bar" role="progressbar" aria-label="How much of the session has been played" aria-valuemin="0" aria-valuemax="${esc(s.minutes)}" aria-valuenow="${esc(s.minute)}"><span style="width:${done.toFixed(2)}%"></span></div><div class="pr-ctl">${run}<div class="seg" role="group" aria-label="Speed">${speeds}</div>${me ? '<button type="button" class="btn" data-pr="end">End now…</button>' : ""}</div></div>`;
  const a = r.account || {};
  const q = r.quote;
  const first = PR.bars.length ? PR.bars.find((b) => b.t >= Date.parse(s.from)) : undefined;
  const open = first ? first.o : 100;
  const quote = q ? `<div class="pr-quote"><span class="pr-num">${esc(prPrice(q.price))}</span> ${chg(((q.price - open) / open) * 100)} <span class="dim small">since the session opened at ${esc(prPrice(open))} · bid ${esc(prPrice(q.bid))} · ask ${esc(prPrice(q.ask))}</span></div>` : '<div class="pr-quote dim">No price now.</div>';
  const p = a.position;
  const pos = p ? `<div class="pr-pos"><div class="label">Your position</div><p><b>${esc(p.side === "long" ? "Long" : "Short")} ${esc(p.qty)}</b> from ${esc(prPrice(p.entryPrice))}${p.unrealizedUsd !== undefined ? ` · ${prUsd(p.unrealizedUsd)} open` : ""}${p.leverage ? ` · ${esc(p.leverage)}×` : ""}</p>${me ? '<div class="acts"><button type="button" class="btn btn-sm" data-pr="close">Close…</button></div>' : ""}</div>` : '<div class="pr-pos"><div class="label">Your position</div><p class="dim small">None.</p></div>';
  const orders = (a.orders || []).length ? `<div class="pr-orders"><div class="label">Orders open</div><ul>${a.orders.map((o) => `<li>${esc(o.side)} ${esc(o.qty)} · ${esc(o.type)}${o.limitPrice !== undefined ? ` at ${esc(prPrice(o.limitPrice))}` : ""}${o.stopPrice !== undefined ? ` stop ${esc(prPrice(o.stopPrice))}` : ""}</li>`).join("")}</ul></div>` : "";
  const acts = me ? `<div class="acts pr-acts"><button type="button" class="btn btn-primary" data-pr="buy">Buy…</button><button type="button" class="btn" data-pr="sell">Sell…</button></div><p class="dim small">The Trade ticket, on this market: your plan first, then the order.</p>` : "";
  const cash = a.cashUsd !== undefined ? `<p class="dim small">Paper cash ${esc(money(a.cashUsd))} of ${esc(money(s.cashUsd))}</p>` : "";
  return `<section class="sec pr-session" aria-labelledby="pr-s-h"><div class="card-head"><h2 class="h2" id="pr-s-h">Session ${esc(s.n)}${s.window === "exam" ? ' <span class="tag warn">Exam</span>' : ""}</h2><span class="dim small">${esc(s.symbol)} · ${esc(money(s.cashUsd))} · ${esc(s.hours)} h from 00:00 UTC · blind until the bell</span></div>${clock}<div class="pr-main"><div class="pr-chart">${prChartHtml(s)}</div><div class="pr-side">${quote}${acts}${pos}${orders}${cash}</div></div>${prTradesHtml(a.trades || [])}</section>`;
}

/* the minutes folded into bars of `size` minutes from the hour (whole buckets and the one under way) */
function prFold(bars, size) {
  if (size <= 1) return bars.slice();
  const out = [];
  const step = size * 60_000;
  for (const b of bars) {
    const t = Math.floor(b.t / step) * step;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      if (b.v !== undefined) last.v = (last.v || 0) + b.v;
    } else out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, ...(b.v !== undefined ? { v: b.v } : {}) });
  }
  return out;
}

/* THE CHART: the latest PR_SHOWN bars, the session's start marked, the days named from the session's (D−2, D−1, Day) — no date */
function prChartHtml(s) {
  const sizes = `<div class="seg" role="group" aria-label="Bar size">${PR_SIZES.map(([m, t]) => `<button type="button" data-pr="size" data-size="${m}" aria-pressed="${String(m === PR.size)}">${t}</button>`).join("")}</div>`;
  const bars = prFold(PR.bars, PR.size).slice(-PR_SHOWN);
  if (!bars.length) return `${sizes}<p class="empty">No minute has closed yet.</p>`;
  const W = 640;
  const Hh = 260;
  const pad = 8;
  const hi = Math.max(...bars.map((b) => b.h));
  const lo = Math.min(...bars.map((b) => b.l));
  const span = hi - lo || 1;
  const y = (v) => pad + ((hi - v) / span) * (Hh - 2 * pad);
  const w = W / PR_SHOWN;
  const x0 = W - bars.length * w;
  const from = Date.parse(s.from);
  const day0 = Math.floor(from / 86_400_000);
  const candles = bars.map((b, i) => {
    const x = x0 + i * w + w / 2;
    const up = b.c >= b.o;
    const top = y(Math.max(b.o, b.c));
    const h = Math.max(1, y(Math.min(b.o, b.c)) - top);
    return `<g class="${up ? "up" : "down"}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(b.h).toFixed(1)}" y2="${y(b.l).toFixed(1)}"/><rect x="${(x - w * 0.35).toFixed(1)}" y="${top.toFixed(1)}" width="${(w * 0.7).toFixed(1)}" height="${h.toFixed(1)}"/></g>`;
  });
  // the days: a line where each starts, named from the session's
  const marks = [];
  for (let i = 1; i < bars.length; i++) {
    const d = Math.floor(bars[i].t / 86_400_000);
    if (d !== Math.floor(bars[i - 1].t / 86_400_000)) marks.push({ i, name: d === day0 ? "Day" : `D−${day0 - d}` });
  }
  const lines = marks.map((m) => `<line class="day" x1="${(x0 + m.i * w).toFixed(1)}" x2="${(x0 + m.i * w).toFixed(1)}" y1="0" y2="${Hh}"/><text x="${(x0 + m.i * w + 4).toFixed(1)}" y="14">${esc(m.name)}</text>`).join("");
  const last = bars[bars.length - 1];
  const words = `${bars.length} bars of ${PR.size} minute${PR.size === 1 ? "" : "s"}: from ${prPrice(bars[0].o)} to ${prPrice(last.c)}, between ${prPrice(lo)} and ${prPrice(hi)}`;
  const tick = (b) => prTime(new Date(b.t).toISOString()).replace(/^\w+ /, "").replace(" UTC", "");
  return `${sizes}<svg class="pr-svg" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="${esc(words)}">${lines}${candles.join("")}</svg><div class="pr-axis"><span>${esc(tick(bars[0]))}</span><span>${esc(prPrice(lo))} – ${esc(prPrice(hi))}</span><span>${esc(tick(last))} UTC</span></div>`;
}

function prTradesHtml(trades) {
  if (!trades.length) return "";
  const rows = trades.map((t) => `<tr><td>${esc(prTime(t.openedAt))}</td><td>${esc(t.side)}</td><td class="r">${esc(prPrice(t.entryPrice))} → ${esc(prPrice(t.exitPrice))}</td><td class="r">${prUsd(t.netUsd)} <span class="dim">${esc(prPct(t.returnPct))}</span></td><td class="r">${t.r !== undefined ? `${esc(t.r >= 0 ? "+" : "−")}${esc(Math.abs(t.r).toFixed(2))} R` : "—"}</td><td>${esc(t.why || "")}${t.setup ? ` <span class="tag">${esc(t.setup)}</span>` : ""}</td></tr>`).join("");
  return `<details class="pr-trades" open><summary>This session's trades · ${esc(trades.length)}</summary><div class="t-wrap"><table class="t"><thead><tr><th scope="col">Entered</th><th scope="col">Side</th><th scope="col" class="r">Price</th><th scope="col" class="r">Net</th><th scope="col" class="r">R</th><th scope="col">Plan</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

/* THE BELL: the score, the day told */
function prScoreHtml(s, r) {
  const sc = s.score;
  const head = `<div class="card-head"><h2 class="h2" id="pr-b-h">Session ${esc(s.n)}: ${s.end === "owner" ? "ended" : "the bell"}</h2><span class="dim small">${s.window === "exam" ? '<span class="tag warn">Exam</span> ' : ""}${esc(s.symbol)}</span></div>`;
  if (!sc) return `<section class="sec pr-score" aria-labelledby="pr-b-h">${head}<p class="dim">The score is being made.</p></section>`;
  const v = sc.reveal;
  const reveal = `<p class="pr-reveal">It was <b>${esc(v.coin)}</b> on <b>${esc(prDay(v.day))}</b>${v.window === "exam" ? ", a day of the held-out data" : ""} — rebased: its 100.00 here was ${esc(prPrice(100 / v.scale))}.</p>`;
  const y = sc.you;
  const desk = sc.desk ? ("error" in sc.desk ? `<span class="dim">${esc(sc.desk.error)}</span>` : `${prUsd(sc.desk.netUsd)} <span class="dim">${esc(prPct(sc.desk.netPct))} · ${esc(plural(sc.desk.trades, "closed trade"))}${sc.desk.open ? " and one open at the end" : ""}</span>`) : '<span class="dim">being run over the same bars…</span>';
  const rows = [
    ["You", `${prUsd(y.netUsd)} <span class="dim">${esc(prPct(y.netPct))} · ${esc(plural(y.trades, "trade"))}, ${esc(y.wins)} won${y.rMean !== undefined ? ` · ${esc(y.rMean >= 0 ? "+" : "−")}${esc(Math.abs(y.rMean).toFixed(2))} R a trade` : ""}</span>`],
    ["Chance", sc.chance ? `beat ${esc(Math.round(sc.chance.rank * 100))}% <span class="dim">of ${esc(Number(sc.chance.monkeys).toLocaleString("en-US"))} random entries with your sides and holding times${sc.chance.verdict === "few" ? " · too few trades to say" : ""}</span>` : '<span class="dim">no trade to draw random ones beside</span>'],
    ["Holding it", `${prUsd(sc.hold.netUsd)} <span class="dim">${esc(prPct(sc.hold.netPct))}</span>`],
    ["The desk", desk],
  ];
  const table = `<table class="t pr-figs"><tbody>${rows.map(([k, v2]) => `<tr><th scope="row">${esc(k)}</th><td class="r">${v2}</td></tr>`).join("")}</tbody></table>`;
  const words = (sc.words || []).length ? `<ul class="pr-words">${sc.words.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";
  const deb = (r.account && r.account.trades && r.account.trades.length) || y.trades ? '<div class="acts"><button type="button" class="btn btn-sm" data-pr="debrief">Your practice trades in the Debrief</button></div>' : "";
  return `<section class="sec pr-score" aria-labelledby="pr-b-h">${head}${reveal}${table}${words}${deb}</section>`;
}

function prStartHtml(r) {
  const me = owns();
  const left = r.left ? `${plural(r.left.train, "day")} to practise on · ${plural(r.left.exam, "exam day")} left` : "";
  return `<section class="sec pr-start" aria-labelledby="pr-n-h"><div class="card-head"><h2 class="h2" id="pr-n-h">A new session</h2>${left ? `<span class="dim small">${esc(left)}</span>` : ""}</div><p class="small">The account draws the day — from the two years before the lab's holdout${r.holdout ? ` (${esc(r.holdout)})` : ""}, or as an exam from the holdout itself, each exam day once — and the coin from the ones you pick. Its clock waits for you: read the two days before it first.</p>${me ? '<div class="acts"><button type="button" class="btn btn-primary" data-pr="start">Start a session…</button></div>' : ""}</section>`;
}

function prHistoryHtml(list) {
  if (!list.length) return "";
  const rows = list.map((x) => {
    const sc = x.score || {};
    const desk = sc.desk && !("error" in sc.desk) ? prPct(sc.desk.netPct) : "—";
    return `<tr><td>${esc(x.n)}${x.window === "exam" ? ' <span class="tag warn">Exam</span>' : ""}</td><td>${esc(x.coin)} · ${esc(prDay(x.day))}</td><td class="r">${sc.you ? `${esc(prPct(sc.you.netPct))} <span class="dim">· ${esc(plural(sc.you.trades, "trade"))}</span>` : "—"}</td><td class="r">${sc.chance ? `${esc(Math.round(sc.chance.rank * 100))}%` : "—"}</td><td class="r">${sc.hold ? esc(prPct(sc.hold.netPct)) : "—"}</td><td class="r">${esc(desk)}</td></tr>`;
  }).join("");
  return `<section class="sec pr-history" aria-labelledby="pr-h-h"><div class="card-head"><h2 class="h2" id="pr-h-h">Sessions played</h2><span class="dim small">${esc(plural(list.length, "session"))}</span></div><div class="t-wrap"><table class="t"><thead><tr><th scope="col">#</th><th scope="col">It was</th><th scope="col" class="r">You</th><th scope="col" class="r">Beat chance</th><th scope="col" class="r">Holding</th><th scope="col" class="r">The desk</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

/* YOUR LICENSE (account/license.ts): the ladder, the record's two books read apart — practice and the exam, each with its checks — what the
   next level needs, what holds your own real orders now, and your Hold… · Step up… · Stop… — each your own limits signed again with the
   license in them or out of them (setPolicy self), after a yes that says what it does */
const PR_CHECKS = [["edge", "Edge after costs"], ["chance", "Beside chance"], ["plans", "Plans kept"], ["calibration", "Calibration"]];
function prLicenseHtml(v) {
  if (!v) return "";
  const me = owns();
  const held = v.held !== undefined;
  const rung = (l) => `<li class="${l.level === v.level ? "at" : l.level < v.level ? "done" : ""}"><span class="pr-rung"><b>${esc(l.level)} · ${esc(l.name)}</b>${l.level === v.level ? ' <span class="tag up">Your record</span>' : ""}${held && l.level === v.held ? ' <span class="tag">Held</span>' : ""}</span><span class="small">${esc(l.words)}${l.capUsd === null && !v.readOnly ? ` (${esc(money(v.serverCapUsd))} now)` : ""}</span></li>`;
  const next = v.next ? `<div class="pr-next"><h3>Level ${esc(v.next.level)} · ${esc(v.next.name)} needs</h3><ul>${v.next.missing.map((m) => `<li>${esc(m.charAt(0).toUpperCase() + m.slice(1))}</li>`).join("")}</ul></div>` : '<p class="small">Your record shows the top of the ladder.</p>';
  const self = v.self || {};
  const pend = self.pending && (self.pending.to ? self.pending.to.license : undefined) !== (self.now ? self.now.license : undefined) ? `<p class="small"><span class="tag warn">Waiting</span> ${self.pending.to && self.pending.to.license !== undefined ? `level ${esc(self.pending.to.license)}` : "your real orders let go of the license"} from ${esc(nyDay(self.pending.from))} ${esc(nyTime(self.pending.from))} New York.</p>` : "";
  const now = v.readOnly
    ? '<p class="small">This server was started read-only: it places no real order, so the license has nothing to hold here.</p>'
    : !held
    ? `<p class="small">It does not bind now: your own real orders are held by the server's cap alone (${esc(money(v.serverCapUsd))} an order). Held to your license, an entry of your own past what it allows is refused; a close always goes, and an agent keeps to its own limits.</p>`
    : `<p class="small pr-held">${v.capUsd > 0 ? `Your own real entries: up to <b>${esc(money(v.capUsd))}</b> an order` : "<b>No real entry of your own</b>: paper and practice only"} — level ${esc(v.held)} (${esc(prLevelName(v, v.held))})${v.signed > v.held ? `: you signed up to level ${esc(v.signed)}, and your record shows level ${esc(v.level)} now` : ""}. A close always goes.</p>`;
  const acts = !me || v.readOnly ? "" : !held ? '<div class="acts"><button type="button" class="btn btn-sm btn-primary" data-pr="lic-hold">Hold my real orders to it…</button></div>' : `<div class="acts">${v.level > v.signed ? `<button type="button" class="btn btn-sm btn-primary" data-pr="lic-up">Step up to level ${esc(v.level)}…</button>` : ""}<button type="button" class="btn btn-sm" data-pr="lic-off">Stop holding them to it…</button></div>`;
  return `<section class="sec pr-lic" aria-labelledby="pr-l-h"><div class="card-head"><h2 class="h2" id="pr-l-h">Your license</h2><span class="chip">Level ${esc(v.level)} · ${esc(v.name)}</span></div><p class="small">What your record here lets one real order of your own be worth. Practice and the exam are read apart; a session counts from its bell.</p><ol class="pr-ladder">${(v.ladder || []).map(rung).join("")}</ol><div class="pr-books">${prBookHtml(v.books.train, v)}${prBookHtml(v.books.exam, v)}</div>${next}${now}${pend}${acts}</section>`;
}
function prLevelName(v, level) {
  const l = (v.ladder || [])[level];
  return l ? l.name : `level ${level}`;
}
/* one window's record: its trades against what the next level needs of it, and its four checks — each passed or not, in its words */
function prBookHtml(b, v) {
  if (!b) return "";
  const need = v.next && v.ladder[v.next.level] ? v.ladder[v.next.level].needs[b.window] : undefined;
  const count = `<li class="${need === undefined ? "" : b.trades >= need ? "ok" : "no"}"><span class="pr-mark" aria-hidden="true">${need === undefined ? "·" : b.trades >= need ? "✓" : "✗"}</span><span><b>Trades</b> ${esc(plural(b.trades, "trade"))} in ${esc(plural(b.sessions, "session"))}${need !== undefined ? ` — level ${esc(v.next.level)} needs ${esc(need)}` : ""}</span></li>`;
  const checks = PR_CHECKS.map(([k, label]) => {
    const c = b[k] || { ok: false, words: "" };
    return `<li class="${c.ok ? "ok" : "no"}"><span class="pr-mark" aria-hidden="true">${c.ok ? "✓" : "✗"}</span><span><b>${esc(label)}</b><span class="sr">${c.ok ? " passed" : " not yet"}:</span> ${esc(c.words)}</span></li>`;
  }).join("");
  return `<div class="pr-book"><h3>${b.window === "exam" ? "The exam" : "Practice"}</h3><ul class="pr-checks">${count}${checks}</ul></div>`;
}
/* what one real order of the owner's own may be worth at a level, under the server's cap */
function prCapAt(v, level) {
  const l = (v.ladder || [])[level];
  return !l ? 0 : l.capUsd === null ? v.serverCapUsd : Math.min(l.capUsd, v.serverCapUsd);
}
async function prLicenseAct(act) {
  const v = PR.license;
  if (!v || !owns()) return;
  const now = (v.self && v.self.now) || null;
  const limits = {};
  if (now) for (const k of ["dayLossUsd", "streak", "maxEntries", "planFirst", "license", "liftHours"]) if (now[k] !== undefined) limits[k] = now[k];
  const lift = now ? now.liftHours : 24;
  const replaced = v.self && v.self.pending ? " A loosening of your own limits still waiting is replaced by this signature." : "";
  const send = (value) => own({ type: "setPolicy", change: "self", value }, () => prLicense());
  const worth = (level) => (prCapAt(v, level) > 0 ? `up to ${money(prCapAt(v, level))}` : "nothing");
  if (act === "lic-hold") {
    if (!(await confirmSheet(`From now on a real order of your own that opens or adds to a position may be worth ${worth(v.level)} — level ${v.level} (${v.name}), what your record shows now — and less at once if your record falls. A close always goes; an agent keeps to its own limits. Letting go of it later waits ${lift} h, as your own limits say.${replaced}`, { title: "Hold your real orders to your license", yes: "Sign" }))) return;
    return void send(JSON.stringify({ ...limits, license: v.level, liftHours: limits.liftHours !== undefined ? limits.liftHours : 24 }));
  }
  if (act === "lic-up") {
    if (!(await confirmSheet(`Level ${v.level} (${v.name}): a real order of your own may be worth ${worth(v.level)}. A loosening, so it holds ${lift} h after you sign — and only as far as your record still shows then.${replaced}`, { title: `Step up to level ${v.level}`, yes: "Sign" }))) return;
    return void send(JSON.stringify({ ...limits, license: v.level }));
  }
  if (act === "lic-off") {
    const { license: _held, ...rest } = limits;
    const others = Object.keys(rest).filter((k) => k !== "liftHours").length;
    if (!(await confirmSheet(`${lift ? `${lift} h from now` : "At once"}, as your own limits say, your real orders are held by the server's cap alone (${money(v.serverCapUsd)} an order); until then your license holds.${others ? " Your other own limits stay as they are." : ""}${replaced}`, { title: "Stop holding your real orders to your license", yes: "Sign", danger: true }))) return;
    return void send(others ? JSON.stringify(rest) : "");
  }
}

/* A SESSION STARTED (setPractice start): what is asked, its words from the account before it is signed */
function prStartForm() {
  const asks = (PR.read && PR.read.asks) || { coins: ["BTC", "ETH", "SOL"], coinsDefault: ["BTC", "ETH", "SOL"], speeds: [10, 20, 30, 50], cashDefault: 10_000 };
  const coins = `<fieldset class="pr-coins"><legend>Coins it may be (one is drawn)</legend>${asks.coins.map((c) => `<label class="chk1"><input type="checkbox" name="coin" value="${esc(c)}"${asks.coinsDefault.includes(c) ? " checked" : ""}> ${esc(c)}</label>`).join("")}</fieldset>`;
  const speed = field("Speed", `<select name="speed">${asks.speeds.map((x) => `<option value="${esc(x)}"${x === 20 ? " selected" : ""}>${esc(x)}× — a day in ${esc(prDuration(1440 / x))}</option>`).join("")}</select>`);
  const hours = field("How much of the day, from 00:00 UTC", `<select name="hours">${[24, 12, 8, 6, 4, 2, 1].map((h) => `<option value="${h}">${h} h</option>`).join("")}</select>`);
  const cash = field("Paper money ($)", `<input name="cash" type="number" inputmode="decimal" min="100" step="any" value="${esc(asks.cashDefault)}">`);
  quoteDialog({
    title: "A practice session",
    sub: "A past day of one of these coins, drawn by the account and played back blind. Every entry there carries its plan; the day and the coin are told at the bell.",
    fields: `${coins}<div class="row2">${speed}${hours}</div>${cash}<label class="chk1"><input type="checkbox" name="exam"> An exam: a day of the held-out data, spent for good</label>`,
    go: "Sign and start",
    draft(form) {
      const fd = new FormData(form);
      const picked = fd.getAll("coin").map(String);
      if (!picked.length) return "Pick one coin at least.";
      return { type: "setPractice", change: "start", value: JSON.stringify({ coins: picked, cash: Number(fd.get("cash")), speed: Number(fd.get("speed")), hours: Number(fd.get("hours")), exam: fd.get("exam") === "on" }) };
    },
    show(p) {
      return `<div class="big"><span>Practice</span></div><p>${esc((p.quote && p.quote.words) || "")}</p>`;
    },
    done: () => {
      PR.bars = [];
      prRead();
      return "The session is ready: its clock waits for you.";
    },
  });
}
/* minutes in words: 72 → "1 h 12 min", 29 → "29 min" */
function prDuration(min) {
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}

/* A SESSION ENDED NOW (setPractice end): its words first */
function prEndForm(s) {
  quoteDialog({
    title: `End session ${s.n}`,
    sub: "Its open orders canceled, its positions closed at the price now, and its score made, the day told.",
    go: "Sign and end it",
    draft: () => ({ type: "setPractice", change: "end", value: s.id }),
    show: (p) => `<p>${esc((p.quote && p.quote.words) || "")}</p>`,
    done: () => {
      prRead();
      return "";
    },
  });
}
