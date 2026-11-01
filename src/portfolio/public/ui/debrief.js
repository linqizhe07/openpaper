/* DEBRIEF (#/debrief): what the paper accounts' closed trades say about why they made or lost money — the account's journal (the black
   box, account/journal.ts: every round trip a paper account closed, never cut) read through its debrief (account/debrief.ts). Every
   figure is the account's and every sentence is its words over the trades: nothing is worked out or made up here.

   What it reads, only while the pane shows:
     GET /api/account/debrief?venue=&who=&days=   the debrief of those trades, the venues that have trades, the latest 50 trades

   THE PAGE: a header (what this is in a line; whose trades — everyone's, yours, the desk's, the agents' —, which paper account, the
   window) · the findings (the debrief's notes, the inversion test first: whether a losing run could be turned round, or its loss is its
   costs) · the figures (trades and win rate, net a trade with its 95% range, before costs with its t, the costs a trade, payoff and
   profit factor, the win rate the sizes of the wins and losses need beside the one won, and the plan's) · where the money went (gross,
   fees, funding, net, each a bar on one scale) · how trades ended · the excursions (each trade's MAE against its MFE, won or lost) · R ·
   the slices (market, side, the New York hours entered, how long held, who traded, Search's confidence) · the desk's calibration · the
   result trade after trade · THE DESK'S LESSONS · the latest trades. A figure that stands on fewer than 30 trades says so.
   debriefHtml(d) is the body without the header: the Backtest page draws a kept run's debrief with it.

   THE DESK'S LESSONS (account/lessons.ts), from the same read: what the desk's trades here put forward (a slice that lost beyond chance
   against the rest, with the rule that would say it and how many slices were looked at), and every lesson the desk keeps — the Head's
   proposals from its evening report and weekly review, the Debrief's, the owner's — each rule with what it would have done to these
   trades, and ITS TEST: the trades entered after it was proposed while it was not in force — the ones it would have stopped judged against
   nothing at all (helps, hurts, not told apart, too few yet). A lesson changes nothing until the owner adopts it, signed (setDesk change
   "lesson" {op: propose · adopt · reject · retire}): adopted, its rule is one of Risk's hard checks and its words are in its seats' prompts.
   "Test in the lab…" puts a lesson's rule in the Backtest page's desk form (ui/backtest.js BT.deskRules), for the owner to run the desk over
   the same bars with it. Only the owner sees the buttons; a viewer reads. And THE DESK'S VERSIONS: each configuration it ran under, what
   changed, and what its trades made (the Debrief's version slice).

   YOUR PLANS AND YOUR OWN LIMITS (account/plans.ts). The owner's trades with a plan signed on the Trade ticket beside those without — the
   planned ones in R, the stops not kept, the winners closed before their target, the setups, how sure the owner said they were against how
   often they won (the debrief's `plans`). And the limits the owner holds their own paper trading to (setPolicy change "self"): what holds
   now, a loosening waiting and from when, what holds a new entry back now — set and taken away by the owner's signature, a loosening
   waiting the hours the limits in force say. */

const DB = { read: null, err: "", venue: "", who: "", days: "" };
const DB_HOURS = ["00–04", "04–08", "08–12", "12–16", "16–20", "20–24"];
const DB_LS_STATE = { proposed: "Waiting for you", adopted: "Adopted", rejected: "Rejected", retired: "Retired" };
const DB_LS_FROM = { evening: "the evening report", weekly: "the weekly review", debrief: "the Debrief", you: "you" };
const DB_LS_CUT = { market: "market", side: "side", hours: "hours", held: "holding-time", confidence: "confidence" };
const DB_LS_SEAT = { search: "Search", risk: "Risk", exit: "Exit", head: "the Head" };
const DB_TEST = { helps: ["up", "Helps"], hurts: ["warn", "Hurts"], unproven: ["", "Not told apart yet"], few: ["", "Too few yet"], lab: ["", "For the lab"] };
const DB_RULES = [["", "Words only — no rule"], ["chase", "Don't chase a move"], ["funding", "Don't pay heavy funding"], ["volume", "Leave thin markets alone"], ["hours", "Skip some hours"], ["side", "One side only"], ["markets", "Leave some markets alone"], ["confidence", "Search sure enough"], ["plan", "Hold the plan"]];
const DB_WHO = [["", "Everyone"], ["you", "You"], ["desk", "The desk"], ["agents", "Agents"]];
const DB_DAYS = [["", "All"], ["90", "90 days"], ["30", "30 days"], ["7", "7 days"]];
const DB_ENDS = { "take-profit": "Take-profit", "stop-loss": "Stop-loss", closed: "Closed by an order", liquidated: "Liquidated", settled: "Settled" };
const DB_SLICES = [["market", "Market"], ["side", "Side"], ["hours", "Entered (New York)"], ["held", "Held"], ["by", "Who"], ["confidence", "Search's confidence"], ["version", "Desk version"]];

function renderDebrief({ el }) {
  if (!el.firstElementChild || el.firstElementChild.dataset.db !== "1") {
    el.innerHTML = '<div class="db" data-db="1"><div class="db-head" data-db-part="head"></div><div class="db-body" data-db-part="body" aria-live="polite"><div class="skel-rows" aria-hidden="true"><span class="skel big"></span><span class="skel"></span><span class="skel"></span></div></div></div>';
    dbWire(el);
  }
  dbDraw(el);
  dbRead();
}

/* the read behind the pane, kept a few seconds; the scope's choices are its query */
function dbRead() {
  const q = new URLSearchParams();
  if (DB.venue) q.set("venue", DB.venue);
  if (DB.who) q.set("who", DB.who);
  if (DB.days) q.set("days", DB.days);
  const path = `/api/account/debrief${q.toString() ? `?${q}` : ""}`;
  return api(path, { ttl: 5_000 }).then((b) => {
    if (b && b.ok) [DB.read, DB.err] = [b, ""];
    else DB.err = refusalOf(b) || "The account did not answer.";
    dbAgain();
  });
}
function dbAgain() {
  const el = document.getElementById("pane-debrief");
  if (el && ROUTE.tab === "debrief") dbDraw(el);
}

function dbWire(el) {
  el.addEventListener("click", (e) => {
    const ls = e.target.closest("[data-db-ls]");
    if (ls && !ls.disabled) return void dbLessonAct(ls.dataset.dbLs, ls.dataset);
    const b = e.target.closest("[data-db-who],[data-db-days]");
    if (!b) return;
    if (b.dataset.dbWho !== undefined) DB.who = b.dataset.dbWho;
    if (b.dataset.dbDays !== undefined) DB.days = b.dataset.dbDays;
    dbAgain();
    dbRead();
  });
  el.addEventListener("change", (e) => {
    if (e.target.name !== "db-venue") return;
    DB.venue = e.target.value;
    dbAgain();
    dbRead();
  });
}

function dbDraw(el) {
  const head = el.querySelector('[data-db-part="head"]');
  const body = el.querySelector('[data-db-part="body"]');
  if (head) paint(head, dbHeadHtml(DB.read));
  if (!body) return;
  if (DB.err && !DB.read) return paint(body, `<div class="msg no">${esc(DB.err)}</div>`);
  if (!DB.read) return;
  const d = DB.read.debrief;
  paint(body, `${DB.err ? `<div class="msg no">${esc(DB.err)}</div>` : ""}${d && d.trades ? `${debriefHtml(d)}${dbSelfHtml(DB.read.self)}${dbLessonsHtml(DB.read)}${dbLatestHtml(DB.read.latest || [])}` : `${dbEmptyHtml()}${dbSelfHtml(DB.read.self)}${dbLessonsHtml(DB.read)}`}`);
}

/* the header: what this is, and the scope — whose trades, which paper account, the window */
function dbHeadHtml(r) {
  const venues = (r && r.venues) || [];
  const pick = (items, on, attr, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${items.map(([v, t]) => `<button type="button" data-${attr}="${esc(v)}" aria-pressed="${String(v === on)}">${esc(t)}</button>`).join("")}</div>`;
  const venue = venues.length > 1 ? `<label class="db-venue"><span class="sr">Paper account</span><select name="db-venue"><option value="">Every paper account</option>${venues.map((v) => `<option value="${esc(v.id)}"${v.id === DB.venue ? " selected" : ""}>${esc(v.name)} · ${esc(plural(v.trades, "trade"))}</option>`).join("")}</select></label>` : "";
  const chain = r && r.intact === false ? '<span class="chip bad" title="A line of the journal was changed or cut: what follows it is not read">Journal broken</span>' : "";
  return `<div class="db-top"><div><h1 class="h2">Debrief</h1><p class="dim small">Why the paper trades made or lost money: every round trip the paper accounts closed, from the account's journal — what the costs took, whether the losing trades had an edge to turn round, how far each went for and against you, and where it went wrong.</p></div><div class="db-scope">${pick(DB_WHO, DB.who, "db-who", "Whose trades")}${pick(DB_DAYS, DB.days, "db-days", "The window")}${venue}${chain}</div></div>`;
}

function dbEmptyHtml() {
  return `<section class="sec"><p class="empty">No closed trade here yet. Every round trip a paper account closes — yours from Trade, the desk's from the Superagent, an agent's over MCP — is written to the journal and debriefed here: open and close a trade on a paper account, or start the desk on one.</p></section>`;
}

/* a figure in percent with its sign, places as asked; a dash for none */
const dbPct = (n, places = 2) => (Number.isFinite(Number(n)) ? `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${Math.abs(Number(n)).toFixed(places)}%` : "—");
const dbNum = (n, places = 2) => (Number.isFinite(Number(n)) ? `${Number(n) < 0 ? "−" : ""}${Math.abs(Number(n)).toFixed(places)}` : "—");
const dbFew = (n) => (n < 30 ? ' <span class="tag" title="Fewer than 30 trades: a sketch, not a finding">few</span>' : "");

/** THE DEBRIEF'S BODY (see the top of this file), for the journal's trades or a backtest's run */
function debriefHtml(d) {
  if (!d || !d.trades) return '<p class="empty">No closed trade: nothing to debrief.</p>';
  return `<div class="db-grid">${dbFindingsHtml(d)}${dbFiguresHtml(d)}</div><div class="db-grid">${dbMoneyHtml(d)}${dbEndsHtml(d)}</div><div class="db-grid">${dbScatterHtml(d)}${dbRHtml(d)}</div>${dbPlansHtml(d)}${dbSlicesHtml(d)}${dbCalibrationHtml(d)}${dbCurveHtml(d)}`;
}

function dbFindingsHtml(d) {
  const kind = { costs: "warn", invertible: "warn", "not-enough": "warn", edge: "up", unproven: "", few: "" }[d.inversion.verdict] || "";
  const title = { costs: "The loss is the costs", invertible: "A loss worth testing the other way", "not-enough": "A loss too small to turn round", edge: "An edge after costs", unproven: "Not yet told apart from luck", few: "Too few trades to say" }[d.inversion.verdict] || "What it says";
  const rest = (d.notes || []).filter((n) => n !== d.inversion.words);
  return `<section class="sec db-findings" aria-labelledby="db-find-h"><div class="card-head"><h2 class="h2" id="db-find-h">What the trades say</h2>${d.from ? `<span class="dim small">${esc(nyDay(d.from))} → ${esc(nyDay(d.to))}</span>` : ""}</div><div class="db-verdict ${kind}"><div class="label">${esc(title)}</div><p>${esc(d.inversion.words)}</p></div>${rest.length ? `<ul class="db-notes">${rest.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</section>`;
}

function dbFiguresHtml(d) {
  const p = d.perTrade;
  const plan = d.breakEven.plan;
  const rows = [
    ["Trades", `${esc(d.trades)} <span class="dim">· ${esc(d.wins)} won, ${esc(d.losses)} lost</span>${dbFew(d.trades)}`],
    ["Win rate", `${esc(dbNum(d.winRatePct, 0))}%`],
    ["Net a trade", `${chg(p.netPct)} <span class="dim">· 95% range ${esc(dbPct(p.low, 3))} to ${esc(dbPct(p.high, 3))}</span>`],
    ["Before costs", `${esc(dbPct(p.grossPct, 3))} <span class="dim">· t ${esc(dbNum(p.grossT, 1))}</span>`],
    ["Costs a trade", esc(dbPct(-p.costPct, 3))],
    ["Average win · loss", `${esc(dbPct(d.avgWinPct))} · ${esc(dbPct(d.avgLossPct))}`],
    ["Payoff", d.payoff === null ? '<span class="dim">—</span>' : esc(dbNum(d.payoff))],
    ["Profit factor", d.profitFactor === null ? '<span class="dim">—</span>' : esc(dbNum(d.profitFactor))],
    ["Break-even win rate", d.breakEven.winRatePct === null ? '<span class="dim">—</span>' : `${esc(dbNum(d.breakEven.winRatePct, 0))}% <span class="dim">· ${esc(dbNum(d.winRatePct, 0))}% won</span>`],
    ...(plan ? [["The plan's break-even", `${esc(dbNum(plan.winRatePct, 0))}% <span class="dim">· take-profit ${esc(dbNum(plan.takeProfitPct))}%, stop ${esc(dbNum(plan.stopPct))}%</span>`]] : []),
    ["Longest losing run", `${esc(d.streaks.longestLosing)}${d.streaks.now ? ` <span class="dim">· now ${esc(plural(d.streaks.now.n, d.streaks.now.won ? "win" : "loss", d.streaks.now.won ? "wins" : "losses"))} in a row</span>` : ""}`],
  ];
  return `<section class="sec db-figures" aria-labelledby="db-fig-h"><div class="card-head"><h2 class="h2" id="db-fig-h">The figures</h2></div><div class="t-wrap"><table class="t db-figs"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="r">${v}</td></tr>`).join("")}</tbody></table></div></section>`;
}

/* where the money went: gross, the fees, the funding and net, each a bar on one scale (a cost drawn as what it took) */
function dbMoneyHtml(d) {
  const parts = [["Before costs", d.grossUsd], ["Fees", -d.feesUsd], ["Funding", -d.fundingUsd], ["Net", d.netUsd]];
  const most = Math.max(1, ...parts.map(([, v]) => Math.abs(v)));
  const bar = ([k, v]) => `<div class="db-bar"><span class="k">${esc(k)}</span><span class="track"><span class="fill ${v < 0 ? "down" : "up"}" style="width:${((Math.abs(v) / most) * 100).toFixed(1)}%"></span></span><span class="v">${chg(v, "$")}</span></div>`;
  return `<section class="sec db-money" aria-labelledby="db-money-h"><div class="card-head"><h2 class="h2" id="db-money-h">Where the money went</h2></div><div class="db-bars" role="img" aria-label="${esc(`Before costs ${money(d.grossUsd)}; fees ${money(d.feesUsd)}; funding ${money(d.fundingUsd)}; net ${money(d.netUsd)}`)}">${parts.map(bar).join("")}</div></section>`;
}

function dbEndsHtml(d) {
  const cols = [
    { label: "How it ended", cell: (e) => esc(DB_ENDS[e.end] || e.end) },
    { label: "Trades", r: true, cell: (e) => esc(e.n) },
    { label: "Won", r: true, cell: (e) => `${esc(dbNum(e.winRatePct, 0))}%` },
    { label: "Net", r: true, cell: (e) => chg(e.netUsd, "$") },
  ];
  return `<section class="sec db-ends" aria-labelledby="db-ends-h"><div class="card-head"><h2 class="h2" id="db-ends-h">How trades ended</h2></div>${table(cols, d.ends || [], { empty: "No closed trade." })}</section>`;
}

/* the excursions: each trade a dot at how far it went against you (MAE, across) and for you (MFE, up), won or lost */
function dbScatterHtml(d) {
  const x = d.excursions;
  const pts = x.points || [];
  const w = 320;
  const h = 200;
  const maxA = Math.max(0.01, ...pts.map((p) => -p[0]));
  const maxF = Math.max(0.01, ...pts.map((p) => p[1]));
  // inset by a dot's size, so one at an edge shows whole
  const pad = 4;
  const dots = pts.map((p) => `<circle class="${p[2] ? "up" : "down"}" cx="${(w - pad - (-p[0] / maxA) * (w - 2 * pad)).toFixed(1)}" cy="${(h - pad - (p[1] / maxF) * (h - 2 * pad)).toFixed(1)}" r="2.5"/>`).join("");
  const words = `Average against you ${dbPct(x.maePct)}, average for you ${dbPct(x.mfePct)}; ${x.gaveBack} losing trade${x.gaveBack === 1 ? " was" : "s were"} up at least as much as ${x.gaveBack === 1 ? "it" : "they"} lost`;
  return `<section class="sec db-scatter" aria-labelledby="db-sc-h"><div class="card-head"><h2 class="h2" id="db-sc-h">How far each went</h2><div class="db-legend" aria-hidden="true"><span><span class="dot up"></span>Won</span><span><span class="dot down"></span>Lost</span></div></div><svg class="db-sc" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(words)}"><line class="axis" x1="${w}" y1="0" x2="${w}" y2="${h}"/><line class="axis" x1="0" y1="${h}" x2="${w}" y2="${h}"/>${dots}</svg><div class="db-axis" aria-hidden="true"><span>${esc(dbPct(-maxA))} against</span><span>0</span></div><p class="dim small">Up: the furthest a trade went for you (MFE, to ${esc(dbPct(maxF))}). Left: the furthest against you (MAE). Winners took ${esc(x.winnersMaePct === null ? "—" : dbPct(x.winnersMaePct))} of heat on average; losers had been up ${esc(x.losersMfePct === null ? "—" : dbPct(x.losersMfePct))}.</p></section>`;
}

function dbRHtml(d) {
  if (!d.r) return '<section class="sec db-r"><div class="card-head"><h2 class="h2">Result in R</h2></div><p class="empty">No trade carried a stop, so no trade\'s result can be counted in what it risked.</p></section>';
  const most = Math.max(1, ...d.r.bins.map((b) => b.n));
  return `<section class="sec db-r" aria-labelledby="db-r-h"><div class="card-head"><h2 class="h2" id="db-r-h">Result in R</h2><span class="dim small">${esc(plural(d.r.trades, "trade"))} with a stop · mean ${esc(dbNum(d.r.meanR))}R</span></div><div class="db-bars">${d.r.bins.map((b) => `<div class="db-bar"><span class="k">${esc(b.label)}</span><span class="track"><span class="fill ${/^−|^-/.test(b.label) ? "down" : "up"}" style="width:${((b.n / most) * 100).toFixed(1)}%"></span></span><span class="v">${esc(b.n)}</span></div>`).join("")}</div>${d.r.pastStop ? `<p class="msg wait">${esc(plural(d.r.pastStop, "trade"))} lost more than the stop allowed before costs: a gap through it, or a stop filled late.</p>` : ""}</section>`;
}

function dbSlicesHtml(d) {
  const cols = [
    { label: "Slice", cell: (s) => `${esc(s.label)}${dbFew(s.n)}` },
    { label: "Trades", r: true, cell: (s) => esc(s.n) },
    { label: "Won", r: true, cell: (s) => `${esc(dbNum(s.winRatePct, 0))}%` },
    { label: "Net a trade", r: true, cell: (s) => chg(s.meanPct) },
    { label: "Net", r: true, cell: (s) => chg(s.netUsd, "$") },
  ];
  // a cut with one part says nothing (one market, one side): left out — the first one shown open
  const parts = DB_SLICES.filter(([k]) => (d.slices[k] || []).length > (k === "confidence" ? 0 : 1)).map(([k, label], i) => `<details class="db-slice"${i === 0 ? " open" : ""}><summary>${esc(label)}</summary>${table(cols, d.slices[k], { cls: "db-slice-t" })}</details>`);
  return parts.length ? `<section class="sec db-slices" aria-labelledby="db-sl-h"><div class="card-head"><h2 class="h2" id="db-sl-h">Where it worked and where it didn't</h2></div>${parts.join("")}</section>` : "";
}

/* the desk's calibration: what Search said, against how often its leads won */
function dbCalibrationHtml(d) {
  if (!(d.calibration || []).length) return "";
  const cols = [
    { label: "Search's confidence", cell: (c) => `${esc(c.label)}${dbFew(c.n)}` },
    { label: "Trades", r: true, cell: (c) => esc(c.n) },
    { label: "It said", r: true, cell: (c) => `${esc(dbNum(c.saidPct, 0))}%` },
    { label: "They won", r: true, cell: (c) => `${esc(dbNum(c.wonPct, 0))}%` },
  ];
  return `<section class="sec db-cal" aria-labelledby="db-cal-h"><div class="card-head"><h2 class="h2" id="db-cal-h">The desk's calibration</h2></div><p class="dim small">A confidence worth reading wins more often as it rises. Flat, it says nothing about which leads will work.</p>${table(cols, d.calibration)}</section>`;
}

/* the result trade after trade */
function dbCurveHtml(d) {
  const pts = (d.curve || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) return "";
  const w = 640;
  const h = 140;
  const t0 = pts[0][0];
  const t1 = pts[pts.length - 1][0];
  const lo = Math.min(0, ...pts.map((p) => p[1]));
  const hi = Math.max(0, ...pts.map((p) => p[1]));
  const span = hi - lo || 1;
  const x = (t) => (((t - t0) / (t1 - t0 || 1)) * w).toFixed(1);
  const y = (u) => (((hi - u) / span) * h).toFixed(1);
  const line = `M${pts.map(([t, u]) => `${x(t)},${y(u)}`).join("L")}`;
  const end = pts[pts.length - 1][1];
  return `<section class="sec db-curve" aria-labelledby="db-cv-h"><div class="card-head"><h2 class="h2" id="db-cv-h">Trade after trade</h2><span class="small">${chg(end, "$")}</span></div><svg class="db-cv" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(`The net result trade after trade, from ${money(0)} to ${money(end)}; lowest ${money(lo)}, highest ${money(hi)}`)}"><line class="zero" x1="0" y1="${y(0)}" x2="${w}" y2="${y(0)}"/><path class="line ${end < 0 ? "down" : "up"}" d="${line}"/></svg></section>`;
}

/* YOUR PLANS (see the top of this file): the owner's trades with a plan beside those without, the planned ones in R, the stops not kept,
   the winners closed before their target, the setups and how sure the owner said they were — nothing where none of the trades is theirs */
function dbPlansHtml(d) {
  const p = d.plans;
  if (!p) return "";
  if (!p.planned.n) return `<section class="sec db-plans" aria-labelledby="db-pl-h"><div class="card-head"><h2 class="h2" id="db-pl-h">Your plans</h2></div><p class="empty">None of your ${esc(plural(p.unplanned.n, "trade"))} here had a plan. On the Trade ticket, at a paper account, write why under Plan before you sign: the journal keeps it with the trade, and this says whether it was kept.</p></section>`;
  const row = (label, x) => `<tr><th scope="row">${esc(label)}</th><td class="r">${esc(x.n)}${dbFew(x.n)}</td><td class="r">${x.n ? `${esc(dbNum(x.winRatePct, 0))}%` : '<span class="dim">—</span>'}</td><td class="r">${x.n ? chg(x.meanPct) : '<span class="dim">—</span>'}</td><td class="r">${x.n ? chg(x.netUsd, "$") : '<span class="dim">—</span>'}</td></tr>`;
  const kept = [p.r ? `In R: ${dbNum(p.r.meanR)} a trade over ${plural(p.r.trades, "trade")} with a stop.` : "", p.r && p.r.pastStop ? `${plural(p.r.pastStop, "trade")} lost more than the stop allowed: the stop was not kept, the price gapped through it, or the size was more than the plan's 1R.` : "", p.early ? `${plural(p.early, "winner")} closed before the target.` : ""].filter(Boolean);
  const setups = (p.setups || []).length ? `<h3>By setup</h3>${table([{ label: "Setup", cell: (x) => `${esc(x.label)}${dbFew(x.n)}` }, { label: "Trades", r: true, cell: (x) => esc(x.n) }, { label: "Won", r: true, cell: (x) => `${esc(dbNum(x.winRatePct, 0))}%` }, { label: "Net a trade", r: true, cell: (x) => chg(x.meanPct) }], p.setups, { cls: "db-slice-t" })}` : "";
  const sure = (p.calibration || []).length ? `<h3>How sure you said you were</h3>${table([{ label: "You said", cell: (c) => `${esc(c.label)}${dbFew(c.n)}` }, { label: "Trades", r: true, cell: (c) => esc(c.n) }, { label: "On average", r: true, cell: (c) => `${esc(dbNum(c.saidPct, 0))}%` }, { label: "They won", r: true, cell: (c) => `${esc(dbNum(c.wonPct, 0))}%` }], p.calibration)}` : "";
  return `<section class="sec db-plans" aria-labelledby="db-pl-h"><div class="card-head"><h2 class="h2" id="db-pl-h">Your plans</h2></div><div class="t-wrap"><table class="t"><thead><tr><th scope="col">Your trades</th><th scope="col" class="r">Trades</th><th scope="col" class="r">Won</th><th scope="col" class="r">Net a trade</th><th scope="col" class="r">Net</th></tr></thead><tbody>${row("With a plan", p.planned)}${row("Without one", p.unplanned)}</tbody></table></div>${kept.length ? `<ul class="db-notes">${kept.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}${setups}${sure}</section>`;
}

/* YOUR OWN LIMITS (see the top of this file): what holds now, a loosening waiting and from when, what holds a new entry back now; the
   owner's Set… and Take them away… — each signed (setPolicy self), a loosening waiting the hours the limits in force say */
function dbSelfHtml(x) {
  if (!x) return "";
  const me = owns();
  const now = x.now ? `<p class="db-self-now">${esc(x.now.words)}.</p>` : '<p class="dim small">None set. Signed while calm, they hold your paper trading when it is not: a day\'s loss line, a pause after a losing streak, the most entries a day, a plan before every entry. They stop new entries only, never a close; a loosening waits the hours you set.</p>';
  const waiting = x.pending ? `<p class="small db-self-wait"><span class="tag warn">Waiting</span> ${x.pending.to ? esc(x.pending.to.words) : "All of them taken away"} — from ${esc(nyDay(x.pending.from))} ${esc(nyTime(x.pending.from))} New York; signed ${esc(nyDay(x.pending.signedAt))} ${esc(nyTime(x.pending.signedAt))}.</p>` : "";
  const held = x.held ? `<div class="msg no" role="status">${esc(x.held.why)}</div>` : "";
  const acts = me ? `<div class="acts">${x.now ? '<button type="button" class="btn btn-sm" data-db-ls="self">Change them…</button><button type="button" class="btn btn-sm" data-db-ls="self-off">Take them away…</button>' : '<button type="button" class="btn btn-sm btn-primary" data-db-ls="self">Set your own limits…</button>'}</div>` : "";
  return `<section class="sec db-self" aria-labelledby="db-self-h"><div class="card-head"><h2 class="h2" id="db-self-h">Your own limits</h2><span class="dim small">${esc(plural(x.entriesToday || 0, "entry", "entries"))} today</span></div>${held}${now}${waiting}${acts}</section>`;
}

/* the limits in words, as the account says them (account/plans.ts selfWords) */
function dbSelfWords(l) {
  const parts = [l.dayLossUsd !== undefined ? `no new entry after a day's loss of ${money(l.dayLossUsd)}` : "", l.streak ? `${l.streak.coolMin} minutes' pause after ${l.streak.losses} losses in a row` : "", l.maxEntries !== undefined ? `${plural(l.maxEntries, "entry", "entries")} a day at most` : "", l.planFirst ? "a plan before every entry" : ""].filter(Boolean);
  return `${parts.join(" · ")} — ${l.liftHours === 0 ? "loosened as soon as it is signed" : `loosened only ${l.liftHours} h after it is signed`}`;
}

/* the sheet that sets them: each limit or none, the hours a loosening waits — prepared, shown and signed in one sheet */
function dbSelfForm() {
  const x = (DB.read && DB.read.self) || {};
  const n = x.now || {};
  const num = (name, label, attrs, v) => field(label, `<input name="${name}" type="number" inputmode="decimal" ${attrs}${v !== undefined ? ` value="${esc(v)}"` : ""}>`);
  quoteDialog({
    title: "Your own limits",
    sub: "What holds your paper trading when you are not calm, signed now while you are. They stop new entries only — a close always goes. Tightening holds at once; loosening, or taking them away, waits the hours you set here.",
    fields: `${num("dayLossUsd", "No new entry after a day's loss of ($)", 'min="1" step="any" placeholder="none"', n.dayLossUsd)}<div class="row2">${num("losses", "After this many losses in a row", 'min="2" max="20" step="1" placeholder="none"', n.streak && n.streak.losses)}${num("coolMin", "pause (minutes)", 'min="5" max="1440" step="5" placeholder="30"', n.streak && n.streak.coolMin)}</div>${num("maxEntries", "Entries a day, at most", 'min="1" max="200" step="1" placeholder="none"', n.maxEntries)}<label class="chk1"><input type="checkbox" name="planFirst"${n.planFirst ? " checked" : ""}> A plan before every entry</label>${num("liftHours", "A loosening waits (hours)", 'min="0" max="168" step="1"', n.liftHours !== undefined ? n.liftHours : 24)}`,
    go: "Sign your limits",
    draft(form) {
      const f = formFields(form);
      const v = (k) => (String(f[k] ?? "").trim() === "" ? undefined : Number(f[k]));
      const limits = { ...(v("dayLossUsd") !== undefined ? { dayLossUsd: v("dayLossUsd") } : {}), ...(v("losses") !== undefined ? { streak: { losses: v("losses"), coolMin: v("coolMin") !== undefined ? v("coolMin") : 30 } } : {}), ...(v("maxEntries") !== undefined ? { maxEntries: v("maxEntries") } : {}), ...(f.planFirst ? { planFirst: true } : {}), liftHours: v("liftHours") !== undefined ? v("liftHours") : 24 };
      if (Object.keys(limits).length < 2) return x.now ? "Set one limit at least — to take them all away, use Take them away… instead." : "Set one limit at least.";
      return { type: "setPolicy", change: "self", value: JSON.stringify(limits) };
    },
    show(p) {
      let l;
      try {
        l = JSON.parse(p.action.value);
      } catch {
        l = null;
      }
      const lift = x.now ? x.now.liftHours : 0;
      return `<div class="big"><span>Your own limits</span></div><div class="path">${l ? esc(dbSelfWords(l)) : esc(p.action.value)}</div>${lift ? `<p class="dim small">As tight as the ones in force in every limit, or tighter, they hold at once; looser in any, they hold ${esc(lift)} h after you sign, and until then the ones in force hold.</p>` : ""}`;
    },
    done: (r) => {
      forget("/api/account/debrief");
      dbRead();
      return (r && r.body && r.body.summary) || "Your limits are signed.";
    },
  });
}

/* THE DESK'S LESSONS (see the top of this file): what its trades here put forward, the ones waiting for the owner, the ones in force, the
   ones given up — and, for the owner, a lesson in their own words. Nothing where there is no desk and nothing to show */
function dbLessonsHtml(r) {
  const cands = (r && r.candidates) || [];
  const lessons = (r && r.lessons) || [];
  if (!r || (!r.desk && !lessons.length)) return "";
  const me = owns() && r.desk;
  const waiting = lessons.filter((l) => l.state === "proposed");
  const adopted = lessons.filter((l) => l.state === "adopted");
  const done = lessons.filter((l) => l.state === "rejected" || l.state === "retired");
  const n = r.deskTrades || 0;
  const found = cands.length
    ? `<ul class="db-ls-list">${cands.map((c, i) => dbCandHtml(c, i, me)).join("")}</ul>`
    : `<p class="empty">${n < 30 ? `${esc(plural(n, "trade"))} of the desk's here: a slice is put forward from 30 trades in it.` : "No slice of the desk's trades here lost beyond chance against the rest: nothing to put forward."}</p>`;
  const list = (ls) => `<ul class="db-ls-list">${ls.map((l) => dbLessonHtml(l, me)).join("")}</ul>`;
  const counts = [adopted.length ? `${adopted.length} adopted` : "", waiting.length ? `${waiting.length} waiting for you` : ""].filter(Boolean).join(" · ");
  return `<section class="sec db-lessons" aria-labelledby="db-ls-h"><div class="card-head"><h2 class="h2" id="db-ls-h">Lessons for the desk</h2>${counts ? `<span class="dim small">${esc(counts)}</span>` : ""}</div><p class="dim small">A lesson changes nothing until you adopt it. Adopted, its words go to the seats it names, and its rule — where it has one — is one of Risk's hard checks from the next lead, judged before the brain is asked. What a rule would have done to these trades describes the trades it was likely found in: it does not test it.</p><h3>What the desk's trades here suggest</h3>${found}${waiting.length ? `<h3>Waiting for you</h3>${list(waiting)}` : ""}${adopted.length ? `<h3>In force</h3>${list(adopted)}` : ""}${done.length ? `<details class="db-slice"><summary>Rejected and retired · ${esc(done.length)}</summary>${list(done)}</details>` : ""}${me ? `<div class="acts db-ls-write"><button type="button" class="btn btn-sm" data-db-ls="write">Write a lesson…</button></div>` : ""}${dbVersionsHtml(r)}</section>`;
}

/* THE DESK'S VERSIONS, the newest first: when each began, what changed, and what its trades here made — the Debrief's version slice */
function dbVersionsHtml(r) {
  const vs = (r && r.versions) || [];
  if (!vs.length) return "";
  const by = new Map((((r.debrief && r.debrief.slices) || {}).version || []).map((x) => [x.label, x]));
  const cols = [
    { label: "Version", cell: (v) => `<b>v${esc(v.v)}</b>` },
    { label: "Since", cls: "nw", cell: (v) => esc(nyDay(v.at)) },
    { label: "What changed", cell: (v) => `<span class="small">${esc(v.words)}</span>` },
    { label: "Trades", r: true, cell: (v) => { const x = by.get(`v${v.v}`); return x ? `${esc(x.n)}${dbFew(x.n)}` : '<span class="dim">0</span>'; } },
    { label: "Net a trade", r: true, cell: (v) => { const x = by.get(`v${v.v}`); return x ? chg(x.meanPct) : '<span class="dim">—</span>'; } },
  ];
  return `<h3>The desk's versions</h3><p class="dim small">A new version each time a signed change altered what the seats decide by — the objective, the brain, a charter, a seat, the autonomy, a lesson adopted or retired — and each trade counted under the one its lead was found in.</p>${table(cols, vs.slice(0, 8), { cls: "db-versions" })}`;
}

/* one candidate: its words, its rule, its slice against the rest, how many slices were looked at; Adopt… and Keep as a proposal */
function dbCandHtml(c, i, me) {
  const cut = DB_LS_CUT[c.from] || c.from;
  const looked = c.looked > 1 ? `the worst of ${c.looked} ${cut} slices with 30 trades or more` : `the one ${cut} slice with 30 trades or more`;
  const kept = c.kept ? ` <span class="tag${c.kept.state === "adopted" ? " up" : ""}">${esc(c.kept.id)} · ${esc(DB_LS_STATE[c.kept.state] || c.kept.state)}</span>` : "";
  const acts = me && !c.kept ? `<div class="acts"><button type="button" class="btn btn-sm btn-primary" data-db-ls="cand-adopt" data-i="${i}">Adopt…</button><button type="button" class="btn btn-sm" data-db-ls="cand-propose" data-i="${i}">Keep as a proposal</button></div>` : "";
  return `<li class="db-ls"><p class="db-ls-text">${esc(c.text)}${kept}</p><p class="dim small">Rule: ${esc(c.words)} · ${esc(dbNum(c.winRatePct, 0))}% of the ${esc(plural(c.n, "trade"))} won · t ${esc(dbNum(c.t, 1))}, ${esc(looked)}</p>${acts}</li>`;
}

/* one lesson kept: its id and state, where it came from, its words, its rule, what that would have done here, its seats; the owner's buttons */
function dbLessonHtml(l, me) {
  const when = l.decidedAt ? ` ${nyDay(l.decidedAt)}` : "";
  const tag = l.state === "adopted" ? " up" : l.state === "proposed" ? " warn" : "";
  const rule = l.rule ? `<p class="small">Rule: ${esc(l.words || "")}</p>` : '<p class="small dim">Words only: no rule binds the desk to it.</p>';
  const eff = l.effect ? dbEffectHtml(l.effect) : l.rule && l.rule.kind === "plan" ? '<p class="dim small">A plan rule changes exits: what it would have made is a run\'s to say — sweep a desk run\'s exits on the Backtest page.</p>' : "";
  const seats = (l.roles || []).map((x) => DB_LS_SEAT[x] || x).join(", ");
  const btn = (act, label, cls = "btn btn-sm") => `<button type="button" class="${cls}" data-db-ls="${act}" data-id="${esc(l.id)}">${esc(label)}</button>`;
  const lab = me && l.rule ? btn("lab", "Test in the lab…") : "";
  const acts = !me ? "" : l.state === "proposed" ? `<div class="acts">${btn("adopt", "Adopt…", "btn btn-sm btn-primary")}${btn("reject", "Reject…")}${lab}</div>` : l.state === "adopted" ? `<div class="acts">${btn("retire", "Retire…")}${lab}</div>` : lab ? `<div class="acts">${lab}</div>` : "";
  return `<li class="db-ls ${esc(l.state)}"><div class="db-ls-head"><b>${esc(l.id)}</b> <span class="tag${tag}">${esc(DB_LS_STATE[l.state] || l.state)}${esc(when)}</span> <span class="dim small">from ${esc(l.source || DB_LS_FROM[l.from] || l.from)} · to ${esc(seats)}</span></div><p class="db-ls-text">“${esc(l.text)}”</p>${rule}${dbTestHtml(l.test)}${eff}${l.why ? `<p class="dim small">Why: ${esc(l.why)}</p>` : ""}${acts}</li>`;
}

/* A LESSON'S TEST (account/lessons.ts testOf): its verdict and its words — the trades entered after it was proposed, while it was not in force */
function dbTestHtml(t) {
  if (!t) return "";
  const [cls, label] = DB_TEST[t.verdict] || ["", t.verdict];
  return `<p class="small db-ls-test"><span class="tag${cls ? ` ${cls}` : ""}">${esc(label)}</span> ${esc(t.words)}${t.unjudged ? ` <span class="dim">${esc(plural(t.unjudged, "trade"))} it could not judge.</span>` : ""}</p>`;
}

/* what a rule would have done to the desk's trades here: the ones it stops and what they made, against the ones it lets through */
function dbEffectHtml(e) {
  if (!e.trades) return '<p class="dim small">No trade of the desk\'s here to read it on.</p>';
  const s = e.stopped;
  const k = e.kept;
  const stopped = s.n ? `${plural(s.n, "trade")} of the desk's ${e.trades}: ${money(s.netUsd)}, ${dbPct(s.meanPct, 3)} a trade, ${dbNum(s.winRatePct, 0)}% won` : `none of the desk's ${e.trades} trades`;
  const unjudged = e.unjudged ? ` ${plural(e.unjudged, "trade")} it could not judge: the number it needs was not kept with ${e.unjudged === 1 ? "it" : "them"}.` : "";
  return `<p class="small dim">On every trade here, the ones it was likely found in among them: it would have stopped ${esc(stopped)}; the ${esc(k.n)} it let through made ${esc(money(k.netUsd))}, ${esc(dbPct(k.meanPct, 3))} a trade.${esc(unjudged)}${s.n ? dbFew(s.n) : ""}</p>`;
}

/* dollars in the large, as the desk writes them (account/lessons.ts usdShort): $10M, $2.5B, $750K */
function dbUsdShort(x) {
  const a = Math.abs(Number(x));
  const [v, u] = a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${Number(x) < 0 ? "−" : ""}$${Number((a / v).toFixed(1))}${u}`;
}

/* a rule in a person's words, as the desk says it (account/lessons.ts ruleWords) — for the sheet's preview of one being written */
function dbRuleWords(r) {
  const n = (x) => String(Number(Number(x).toFixed(4)));
  switch (r && r.kind) {
    case "chase": return `no lead on a market that moved more than ${n(r.maxPct)}% over the day its way`;
    case "funding": return `no lead that would pay more than ${n(r.maxPctDay)}% of funding a day`;
    case "volume": return `no lead on a market that traded less than ${dbUsdShort(r.minUsd)} over the day`;
    case "hours": return `no lead entered ${r.skip.join(", ")} New York`;
    case "side": return r.only === "buy" ? "longs only" : "shorts only";
    case "markets": return `never ${r.skip.join(", ")}`;
    case "confidence": return `no lead Search is less than ${n(r.min)} sure of`;
    case "plan": return `the plan held to ${[r.minTpPct !== undefined ? `a take-profit of at least ${n(r.minTpPct)}%` : "", r.minSlPct !== undefined ? `a stop of at least ${n(r.minSlPct)}%` : "", r.maxHours !== undefined ? `${n(r.maxHours)} h at most` : ""].filter(Boolean).join(", ")}`;
    default: return "";
  }
}

/* the rule a lesson being written names, from its sheet's fields: undefined for words only, a string for what is missing */
function dbRuleOf(f, form) {
  const num = (k) => (String(f[k] ?? "").trim() === "" ? undefined : Number(f[k]));
  switch (f.kind) {
    case "": return undefined;
    case "chase": return num("maxPct") > 0 ? { kind: "chase", maxPct: num("maxPct") } : "Say how far a move goes before the desk leaves it.";
    case "funding": return num("maxPctDay") > 0 ? { kind: "funding", maxPctDay: num("maxPctDay") } : "Say how much funding a day is too much.";
    case "volume": return num("minUsd") > 0 ? { kind: "volume", minUsd: num("minUsd") } : "Say the least a market trades over the day.";
    case "hours": {
      const skip = [...form.querySelectorAll('input[name="skipHours"]:checked')].map((x) => x.value);
      return skip.length ? { kind: "hours", skip } : "Tick the hours to skip.";
    }
    case "side": return { kind: "side", only: f.only === "sell" ? "sell" : "buy" };
    case "markets": {
      const skip = String(f.skipMarkets || "").split(",").map((s) => s.trim()).filter(Boolean);
      return skip.length ? { kind: "markets", skip } : "Name the markets, as the venue lists them.";
    }
    case "confidence": return num("min") > 0 ? { kind: "confidence", min: num("min") } : "Say how sure Search must be, 0 to 1.";
    case "plan": {
      const p = { kind: "plan", ...(num("minTpPct") !== undefined ? { minTpPct: num("minTpPct") } : {}), ...(num("minSlPct") !== undefined ? { minSlPct: num("minSlPct") } : {}), ...(num("maxHours") !== undefined ? { maxHours: num("maxHours") } : {}) };
      return Object.keys(p).length > 1 ? p : "Give the plan at least one bound.";
    }
    default: return "Pick a rule, or words only.";
  }
}

/* the owner's own lesson: their words, a rule or none, kept as a proposal or adopted at once — prepared, shown and signed in one sheet */
function dbLessonForm() {
  const num = (name, label, attrs) => field(label, `<input name="${name}" type="number" inputmode="decimal" ${attrs}>`);
  quoteDialog({
    title: "Write a lesson",
    sub: "What the desk does differently from now on, in a sentence — and, where it can be one, as a rule in numbers. A rule binds the desk only once you adopt it: Risk judges it on every lead from then on, before its brain is asked. Words alone go to the seats' prompts.",
    fields: `${field("The lesson", '<input name="text" maxlength="240" placeholder="Don\'t buy what already ran on the day">')}${field("As a rule", select("kind", DB_RULES, ""))}<div class="db-ls-rule" data-k="chase">${num("maxPct", "A move over the day, its way, of more than (%)", 'min="0.5" max="100" step="0.5" value="8"')}</div><div class="db-ls-rule" data-k="funding">${num("maxPctDay", "Funding a day of more than (%)", 'min="0.001" max="10" step="0.01" value="0.1"')}</div><div class="db-ls-rule" data-k="volume">${num("minUsd", "A day's volume under ($)", 'min="1000" step="1000" value="10000000"')}</div><div class="db-ls-rule" data-k="hours"><fieldset class="db-ls-hours"><legend>No lead in these New York hours</legend>${DB_HOURS.map((h) => `<label><input type="checkbox" name="skipHours" value="${h}"> ${h}</label>`).join("")}</fieldset></div><div class="db-ls-rule" data-k="side">${field("Only", select("only", [["buy", "Longs"], ["sell", "Shorts"]], "buy"))}</div><div class="db-ls-rule" data-k="markets">${field("Never these markets (as the venue lists them, a comma between)", '<input name="skipMarkets" placeholder="DOGE/USDT, PEPE/USDT">')}</div><div class="db-ls-rule" data-k="confidence">${num("min", "Search at least this sure (0 to 1)", 'min="0.05" max="0.99" step="0.05" value="0.6"')}</div><div class="db-ls-rule" data-k="plan"><div class="row2">${num("minTpPct", "A take-profit of at least (%)", 'min="0.2" max="25" step="0.1"')}${num("minSlPct", "A stop of at least (%)", 'min="0.2" max="15" step="0.1"')}</div>${num("maxHours", "Open for at most (hours)", 'min="1" max="168" step="1"')}</div>${field("Now", select("op", [["propose", "Keep it as a proposal"], ["adopt", "Adopt it now"]], "propose"))}`,
    go: "Sign the lesson",
    draft(form) {
      const f = formFields(form);
      const text = String(f.text || "").trim();
      if (!text) return "Say the lesson in a sentence.";
      const rule = dbRuleOf(f, form);
      if (typeof rule === "string") return rule;
      return { type: "setDesk", desk: "desk", change: "lesson", value: JSON.stringify({ op: f.op === "adopt" ? "adopt" : "propose", text, ...(rule ? { rule } : {}) }) };
    },
    show(p) {
      const x = JSON.parse(p.action.value);
      return `<div class="big"><span>“${esc(x.text)}”</span></div><div class="path">${x.rule ? `As a rule: ${esc(dbRuleWords(x.rule))}` : "Words only: no rule binds the desk to it"} · ${x.op === "adopt" ? "adopted now: in force from the next lead" : "kept as a proposal: it changes nothing until you adopt it"}</div>`;
    },
    done: () => {
      forget("/api/account/debrief");
      forget("/api/account/desk");
      dbRead();
      return "The lesson is signed.";
    },
  });
}

/* the owner's word on a lesson or a candidate: each signed as setDesk change "lesson", after a yes that says what it does */
async function dbLessonAct(act, d) {
  const r = DB.read;
  if (!r || !owns()) return;
  if (act === "write") return void dbLessonForm();
  if (act === "self") return void dbSelfForm();
  if (act === "self-off") {
    const lift = r.self && r.self.now ? r.self.now.liftHours : 0;
    if (!(await confirmSheet(lift ? `Your own limits stop holding ${lift} h from now, as you set them to: until then they hold as they are.` : "Your own limits stop holding at once.", { title: "Take your own limits away", yes: "Sign", danger: true }))) return;
    return void own({ type: "setPolicy", change: "self", value: "" }, () => {
      forget("/api/account/debrief");
      return dbRead();
    });
  }
  if (act === "lab") {
    const l = (r.lessons || []).find((x) => x.id === d.id);
    if (!l || !l.rule || typeof BT === "undefined") return;
    // the desk's form on the Backtest page, held to this lesson alone: the owner picks the bars and signs the run (ui/backtest.js)
    BT.mode = "desk";
    BT.deskRules = [{ id: l.id, rule: l.rule, words: l.words || dbRuleWords(l.rule) }];
    toast(`The desk's form on Backtest holds ${l.id}: pick the markets and the window, then Run the desk…`, "ok");
    return void go("backtest");
  }
  const send = (value) => own({ type: "setDesk", desk: "desk", change: "lesson", value: JSON.stringify(value) }, () => {
    forget("/api/account/debrief");
    forget("/api/account/desk");
    return dbRead();
  });
  const binds = (rule, words) => (rule ? (rule.kind === "plan" ? `From the next lead Risk holds every plan it gives to it: ${words}.` : `From the next lead Risk holds the desk to it, before its brain is asked: ${words}.`) : "Its words go to the desk's seats; no rule binds the desk to it.");
  if (act === "cand-adopt" || act === "cand-propose") {
    const c = (r.candidates || [])[Number(d.i)];
    if (!c) return;
    if (act === "cand-adopt" && !(await confirmSheet(`${c.text} ${binds(c.rule, c.words)} You can retire it at any time; it stays on file.`, { title: "Adopt this lesson", yes: "Sign and adopt" }))) return;
    return void send({ op: act === "cand-adopt" ? "adopt" : "propose", text: c.text, rule: c.rule, from: "debrief", source: `the Debrief: the ${DB_LS_CUT[c.from] || c.from} slice ${c.slice}` });
  }
  const l = (r.lessons || []).find((x) => x.id === d.id);
  if (!l) return;
  if (act === "adopt") {
    if (!(await confirmSheet(`“${l.text}” ${binds(l.rule, l.words)} You can retire it at any time; it stays on file.`, { title: `Adopt lesson ${l.id}`, yes: "Sign and adopt" }))) return;
    return void send({ op: "adopt", id: l.id });
  }
  if (act === "reject") {
    if (!(await confirmSheet(`“${l.text}” stays on file as rejected, and the Head does not propose it again.`, { title: `Reject lesson ${l.id}`, yes: "Sign and reject", danger: true }))) return;
    return void send({ op: "reject", id: l.id });
  }
  if (act === "retire") {
    if (!(await confirmSheet(`“${l.text}” stops binding the desk from the next lead${l.rule ? ": Risk no longer judges its rule" : ""}, and its words leave the seats' prompts. It stays on file.`, { title: `Retire lesson ${l.id}`, yes: "Sign and retire", danger: true }))) return;
    return void send({ op: "retire", id: l.id });
  }
}

/* the latest trades, newest first: when, the market and side, entry → exit, net, MAE · MFE, how it ended, who, and the desk's thesis */
function dbLatestHtml(list) {
  if (!list.length) return "";
  const who = (b) => (!b ? "" : b.who === "owner" ? "You" : b.who === "desk" ? b.name || `Desk ${b.role || ""}`.trim() : b.who === "agent" ? b.name || "An agent" : "The venue");
  // an average of several fills, to seven figures: what the eye compares, not the float's tail
  const avg = (n) => px(Number.isFinite(Number(n)) ? Number(Number(n).toPrecision(7)) : n);
  const cols = [
    { label: "Closed (New York)", cls: "nw", cell: (t) => `${esc(nyDay(t.closedAt))} <span class="dim">${esc(nyTime(t.closedAt))}</span>` },
    { label: "Market", cell: (t) => `${esc(t.symbol)} <span class="${t.side === "long" ? "up" : "down"} small">${esc(t.side)}</span>` },
    { label: "Entry → exit", r: true, cell: (t) => `${esc(avg(t.entryPrice))} → ${esc(avg(t.exitPrice))}` },
    { label: "Net", r: true, cell: (t) => `${chg(t.netUsd, "$")} <span class="dim small">${esc(dbPct(t.returnPct))}</span>` },
    { label: "MAE · MFE", r: true, cell: (t) => `<span class="small">${esc(dbPct(t.maePct))} · ${esc(dbPct(t.mfePct))}</span>` },
    { label: "Ended", cell: (t) => esc(DB_ENDS[t.end] || t.end) },
    { label: "Who", cell: (t) => esc(who(t.by)) },
    { label: "Why", cell: (t) => (t.lead ? `<span class="small dim" title="${esc(t.lead.thesis)}">${esc(t.lead.id)} · ${esc(String(t.lead.thesis).slice(0, 48))}${String(t.lead.thesis).length > 48 ? "…" : ""}</span>` : "") },
  ];
  return `<section class="sec db-latest" aria-labelledby="db-lt-h"><div class="card-head"><h2 class="h2" id="db-lt-h">The latest trades</h2></div>${table(cols, list, { cls: "db-trades" })}</section>`;
}
