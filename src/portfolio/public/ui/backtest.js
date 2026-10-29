/* BACKTEST (#/backtest): a strategy played over recorded bars through the paper account's own rules — its fills, fees, funding and
   liquidations — beside buying and holding the same markets. The account's lab (backtest/lab.ts), as the owner and the agents run it.

   EVERY RUN IS COUNTED, AND THE LATEST DATA IS HELD OUT. The data from the holdout's start on (by default the 90 days before the first run,
   written down once) is held back: a run here ends at the holdout's start at the latest. Each run is a row of the account's trials ledger,
   hash-chained; a run's Sharpe is deflated by every distinct strategy tried before the holdout (the more tried, the higher the bar), and
   runs on the same markets and bars are judged together for the probability of overfitting. Only the owner runs a strategy on the
   held-out data, by signature: "Look at the holdout…" on a training run tries it again exactly over the held-out data — counted, since a
   holdout looked at often is a holdout no more. What came of a look is the owner's: the account answers it to their signature and never
   to an unsigned read, so the page keeps the answer in THIS browser (BT_LOOKS_KEY) and says so where it shows it; the terminal's
   `npm run account:backtest -- --trials` lists every look.

   What it reads, only while the pane shows:
     GET  /api/account/backtests?limit=50   the holdout, the ledger (its rows, its chain intact or where it broke, the runs, the distinct
                                            strategies, the looks), the latest runs, and the catalog the form is drawn from (the
                                            strategies with each number's default, bounds and words; the bar sizes; the markets)
     POST /api/account/backtest             a run: the form's fields as the account reads them (a refusal said in its words), the page
                                            named as who asked
     GET  /api/account/backtest?id=         a kept training run in full: its curve, the buy-and-hold's, its fills
   What the owner signs (quoteDialog: the words first, then the fields signed): setBacktest evaluate <run id> · setBacktest holdout <day>.

   THE PAGE: a header (what this is in a line; the holdout and its looks, Move… for the owner; the ledger's state) · the form (strategy, its
   numbers, markets, bars, the window — its end at the holdout's start at the latest —, money, fee, leverage, the cost model, the
   buy-and-hold beside it), drawn once from the catalog and never again while it is typed in · the result (what ran; the equity of the
   strategy and of the buy-and-hold on one chart, the strategy's drawdown under it; the figures side by side; how it is judged; the notes;
   the fills) · the trials (the ledger's latest runs, newest first: Open, and the owner's Look at the holdout…). Nothing is made up: every
   figure is the account's. */

const BT = { list: null, listErr: "", view: null, running: false, soon: false };
/* the owner's looks at the held-out data, as their signature was answered, kept in this browser by run id (the latest BT_LOOKS_MOST) */
const BT_LOOKS_KEY = "openpaper-backtest-looks";
const BT_LOOKS_MOST = 12;
/* the most points a curve is drawn with, and the most fills listed */
const BT_POINTS = 600;
const BT_FILLS = 100;

function renderBacktest({ el, owner }) {
  if (!el.firstElementChild || el.firstElementChild.dataset.bt !== "1") {
    el.innerHTML = `<div class="bt" data-bt="1"><div class="bt-head" data-bt-part="head"></div><div class="cols"><div class="col-main"><section class="sec bt-result" data-bt-part="result" aria-live="polite" aria-label="The result"></section></div><div class="col-side"><section class="sec bt-form-card" aria-labelledby="bt-form-h"><div class="card-head"><h2 class="h2" id="bt-form-h">Run a backtest</h2></div><form class="bt-form" data-bt-form novalidate><div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div></form></section></div></div><section class="sec bt-trials" data-bt-part="trials" aria-labelledby="bt-trials-h"></section></div>`;
    btWire(el);
  }
  btDraw(el, owner);
  btRead();
}

/* the read behind the pane, kept a few seconds; `fresh`: what it kept is dropped first (after a run, a look, the holdout moved) */
function btRead(fresh = false) {
  if (fresh) forget("/api/account/backtests");
  return api("/api/account/backtests?limit=50", { ttl: 5_000 }).then((b) => {
    if (b && b.ok) [BT.list, BT.listErr] = [b, ""];
    else BT.listErr = refusalOf(b) || "The account did not answer.";
    btAgain();
  });
}
function btAgain() {
  if (BT.soon) return;
  BT.soon = true;
  nextFrame(() =>
    paneLater("backtest", () => {
      BT.soon = false;
      const el = $("pane-backtest");
      if (ROUTE.tab !== "backtest" || !el || !el.querySelector("[data-bt]")) return;
      try {
        btDraw(el, owns());
      } catch (err) {
        console.error(err);
      }
    }),
  );
}
/* one part, drawn again only where what it shows changed (core paint) */
function btPut(el, part, html) {
  const node = el.querySelector(`[data-bt-part="${part}"]`);
  if (!node) return;
  node.hidden = !html;
  paint(node, html);
}
function btDraw(el, owner) {
  const L = BT.list;
  btPut(el, "head", btHeadHtml(L, owner, BT.listErr));
  // the form is drawn once, from the catalog: what is typed in it is never drawn over
  const form = el.querySelector("[data-bt-form]");
  if (form && L && L.catalog && form.dataset.drawn !== "1") {
    form.innerHTML = btFormHtml(L.catalog, L.holdout);
    form.dataset.drawn = "1";
  }
  const go = form && form.querySelector("[data-bt-go]");
  if (go) {
    go.disabled = BT.running;
    setText(go, BT.running ? "Running…" : "Run backtest");
  }
  btPut(el, "result", btResultHtml(BT.view));
  btPut(el, "trials", btTrialsHtml(L, owner, btLooks()));
}

function btWire(el) {
  el.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-bt-act]");
    if (!t || !el.contains(t) || t.disabled) return;
    const id = t.dataset.id || "";
    if (t.dataset.btAct === "open") return void btOpen(id);
    if (t.dataset.btAct === "seen") return void btSeen(id);
    if (t.dataset.btAct === "look") return void btLook(id);
    if (t.dataset.btAct === "holdout") return void btMoveHoldout();
  });
  el.addEventListener("change", (e) => {
    const sel = e.target.closest && e.target.closest('select[name="strategy"]');
    if (sel && el.contains(sel) && BT.list && BT.list.catalog) btStrategy(sel.form, BT.list.catalog, sel.value);
  });
  el.addEventListener("submit", (e) => {
    const f = e.target.closest && e.target.closest("form[data-bt-form]");
    if (!f) return;
    e.preventDefault();
    btSend(btAskOf(formFields(f), !!(f.querySelector('[name="benchmark"]') || {}).checked), f);
  });
}

// ---- the form ----

/* a number's name as a person reads it: lookbackDays → Lookback days, enterApr → Enter APR */
const btParamLabel = (k) => {
  const w = String(k).replace(/([A-Z])/g, " $1").toLowerCase().replace(/\bapr\b/g, "APR");
  return w.charAt(0).toUpperCase() + w.slice(1);
};
/* a day (YYYY-MM-DD) `days` before another */
const btDayBefore = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** a strategy's numbers as fields, each with its default, its bounds and its words; none for a strategy that takes none */
function btParamsHtml(def) {
  const P = (def && def.params) || {};
  const keys = Object.keys(P);
  if (!keys.length) return '<p class="dim small">It takes no numbers.</p>';
  return `<div class="bt-grid">${keys
    .map((k) => {
      const p = P[k];
      return `<label class="fld">${esc(btParamLabel(k))}<input name="p.${esc(k)}" type="number" min="${p.min}" max="${p.max}" step="${p.integer ? 1 : "any"}" value="${p.default}" inputmode="decimal" required><span class="bt-hint">${esc(p.words)} · ${p.min} to ${p.max}</span></label>`;
    })
    .join("")}</div>`;
}

/** the form, from the catalog: the strategy and its numbers, the markets, the bars, the window ending at the holdout's start at the latest,
 * the money, the fee, the leverage, the cost model, the buy-and-hold beside it */
function btFormHtml(cat, holdout) {
  const S = (cat && cat.strategies) || {};
  const d = (cat && cat.defaults) || {};
  const ids = Object.keys(S);
  const first = S[d.strategy] ? d.strategy : ids[0];
  const end = holdout && typeof holdout.start === "string" ? holdout.start : "";
  const costs = d.costs || {};
  const kinds = (cat && cat.markets && cat.markets.kinds) || [];
  const most = (cat && cat.markets && cat.markets.most) || 12;
  return `<label class="fld">Strategy${select("strategy", ids.map((id) => [id, S[id].name]), first)}</label>
<p class="dim small bt-words" data-bt-words>${esc((S[first] || {}).words || "")}</p>
<div data-bt-params>${btParamsHtml(S[first])}</div>
<label class="fld">Markets<input name="markets" value="${esc(d.markets || "perp:BTC")}" autocomplete="off" spellcheck="false" placeholder="perp:BTC, spot:ETH, stock:SPY" aria-describedby="bt-markets-h"></label>
<p class="dim small" id="bt-markets-h">${kinds.map((k) => `<span class="mono">${esc(k.example)}</span> ${esc(k.words)}`).join(" · ")}. ${most} at most, comma-separated.</p>
<div class="row2"><label class="fld">Bars${select("interval", ((cat && cat.intervals) || ["1h", "4h", "1d"]).map((i) => [i, i]), d.interval || "1h")}</label><label class="fld">Paper money ($)<input name="cash" type="number" min="100" max="100000000" step="any" value="${d.cash || 10000}" inputmode="decimal"></label></div>
<div class="row2"><label class="fld">From<input name="from" type="date" value="${end ? btDayBefore(end, d.windowDays || 180) : ""}"${end ? ` max="${end}"` : ""}></label><label class="fld">To<input name="to" type="date" value="${end}"${end ? ` max="${end}"` : ""}></label></div>
<p class="dim small">${end ? `The window ends at the holdout's start, ${esc(end)}, at the latest: the data from then on is the owner's to run on, by signature.` : "The window ends at the holdout's start at the latest."}</p>
<div class="row2"><label class="fld">Fee a fill (bps)<input name="feeBps" type="number" min="0" max="500" step="any" value="${d.feeBps ?? 10}" inputmode="decimal"></label><label class="fld">Leverage<input name="leverage" type="number" min="1" max="50" step="any" placeholder="the strategy's" inputmode="decimal"></label></div>
<details class="bt-costs"><summary>The cost model</summary><div class="bt-grid"><label class="fld">Half spread (bps)<input name="halfSpreadBps" type="number" min="0" max="500" step="any" value="${costs.halfSpreadBps ?? 1}"><span class="bt-hint">either side of each bar's open</span></label><label class="fld">Participation<input name="participation" type="number" min="0.0001" max="1" step="any" value="${costs.participation ?? 0.05}"><span class="bt-hint">the share of the bar before's dollars the book holds</span></label><label class="fld">Level gap (bps)<input name="levelBps" type="number" min="0" max="500" step="any" value="${costs.levelBps ?? 2}"><span class="bt-hint">between the book's five levels</span></label></div></details>
<label class="chk1"><input type="checkbox" name="benchmark"${d.benchmark === false ? "" : " checked"}> Buy and hold beside it</label>
<div class="msg" data-bt-msg role="status"></div>
<button type="submit" class="btn btn-primary btn-block" data-bt-go>Run backtest</button>`;
}

/* another strategy picked: its words and its numbers, in place of the last one's */
function btStrategy(form, cat, id) {
  const def = (cat.strategies || {})[id];
  const words = form.querySelector("[data-bt-words]");
  if (words) setText(words, (def && def.words) || "");
  const params = form.querySelector("[data-bt-params]");
  if (params) params.innerHTML = btParamsHtml(def);
}

/** what the form asks the account for, from its fields as typed: a field left empty is the account's default, a number is a number; the
 * page names itself as who asks */
function btAskOf(f, benchmark) {
  const params = {};
  for (const [k, v] of Object.entries(f)) if (k.startsWith("p.") && String(v).trim() !== "") params[k.slice(2)] = Number(v);
  const num = (k) => (String(f[k] ?? "").trim() === "" ? undefined : Number(f[k]));
  const body = { strategy: f.strategy, params, markets: String(f.markets || "").trim(), interval: f.interval, from: f.from || undefined, to: f.to || undefined, cash: num("cash"), feeBps: num("feeBps"), leverage: num("leverage"), halfSpreadBps: num("halfSpreadBps"), participation: num("participation"), levelBps: num("levelBps"), benchmark, seat: "page" };
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== ""));
}

/* the form's line under it: what is under way, or the account's refusal in its words */
function btSay(form, text, state = "") {
  const m = form && form.querySelector("[data-bt-msg]");
  if (!m) return;
  m.className = `msg${text && state ? ` ${state}` : ""}`;
  setText(m, text || "");
}

/** A RUN: asked of the account, then its kept run read for the curves and the fills; the trials read again */
async function btSend(body, form) {
  if (BT.running) return;
  BT.running = true;
  btSay(form, "Running it: the history is read once and kept, then the paper account steps through it.", "wait");
  btAgain();
  try {
    const r = await postJson("/api/account/backtest", body);
    if (r.status !== 200 || !r.body || r.body.ok === false) return void btSay(form, refusalOf(r.body) || "The account did not answer. Try again.", "no");
    const kept = await api(`/api/account/backtest?id=${encodeURIComponent(r.body.id)}`);
    BT.view = kept && kept.ok ? btViewOfKept(kept) : { ...r.body };
    btSay(form, "", "");
    btShowResult();
    toast(`${(r.body.strategy && r.body.strategy.name) || "The backtest"}: ${btPctText(r.body.metrics && r.body.metrics.returnPct)} over the window`, "ok");
  } finally {
    BT.running = false;
    btRead(true);
    btAgain();
  }
}

// ---- the runs kept ----

/** a kept run as the result shows it: what ran, its figures and its benchmark's, how it is judged now, its curves and its fills */
function btViewOfKept(k) {
  const r = k.run || {};
  const b = k.benchmark;
  return {
    id: k.id,
    window: k.window || "train",
    holdout: k.holdout,
    strategy: r.strategy,
    markets: r.markets,
    from: r.from,
    to: r.to,
    cashUsd: r.cashUsd,
    feeBps: r.feeBps,
    leverage: r.leverage,
    costs: r.costs,
    metrics: r.metrics,
    ...(b ? { benchmark: { strategy: b.strategy && b.strategy.id, metrics: b.metrics }, benchmarkCurve: (b.equity || []).map((p) => [p.t, p.usd]) } : {}),
    curve: (r.equity || []).map((p) => [p.t, p.usd]),
    fills: (r.fills || []).length,
    fillsList: r.fills || [],
    refused: (r.refused || []).length,
    funding: r.funding,
    deflated: k.deflated,
    overfit: k.overfit,
    psr: k.psr,
    looks: k.looks,
    trial: k.trial && k.trial.seq,
    notes: [...(k.notes || []), ...(r.notes || [])],
  };
}
async function btOpen(id) {
  const k = await api(`/api/account/backtest?id=${encodeURIComponent(id)}`);
  if (!k || !k.ok) return void toast(refusalOf(k) || "The account did not answer.", "no");
  BT.view = btViewOfKept(k);
  btAgain();
  btShowResult();
}
/* the result brought into view once it is drawn, where it is out of sight (the columns stacked on a narrow page, or a trial opened from
   far down the list) */
function btShowResult() {
  nextFrame(() =>
    paneLater("backtest", () => {
      const r = document.querySelector('[data-bt-part="result"]');
      if (!r || typeof r.getBoundingClientRect !== "function") return;
      const top = r.getBoundingClientRect().top;
      if (top < 0 || top > (window.innerHeight || 800) * 0.6) r.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    }),
  );
}
/* a look this browser signed for, as its answer was kept here */
function btSeen(id) {
  const v = btLooks()[id];
  if (!v) return void toast("This browser keeps no answer for that look: the terminal's --trials lists every look.", "info");
  BT.view = { ...v, here: true };
  btAgain();
  btShowResult();
}

/* the looks kept in this browser, by run id */
function btLooks() {
  try {
    const v = JSON.parse(localStorage.getItem(BT_LOOKS_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function btKeepLook(res) {
  if (!res || typeof res.id !== "string") return;
  const all = { ...btLooks(), [res.id]: res };
  // a run's id starts with when it ran: the latest kept
  const ids = Object.keys(all).sort().slice(-BT_LOOKS_MOST);
  try {
    localStorage.setItem(BT_LOOKS_KEY, JSON.stringify(Object.fromEntries(ids.map((k) => [k, all[k]]))));
  } catch {
    // storage off (a private window): shown now, not kept
  }
}

// ---- what the owner signs ----

/** THE OWNER'S LOOK AT THE HELD-OUT DATA: the training run `id` tried again exactly on it, from the holdout's start to now — the words
 * first, then the fields signed; the answer shown and kept in this browser */
function btLook(id) {
  if (typeof quoteDialog !== "function") return;
  quoteDialog({
    title: "Look at the held-out data",
    sub: "The training run is tried again exactly — its strategy, numbers, markets, bars, money, fee and costs — on the data held out, from the holdout's start to now. Each look is counted: a holdout looked at often is a holdout no more.",
    draft: () => ({ type: "setBacktest", change: "evaluate", value: id }),
    go: "Sign and look",
    done: (r) => {
      const res = r && r.body && r.body.result;
      if (res && res.id) {
        btKeepLook(res);
        BT.view = { ...res, here: true };
      }
      btRead(true);
      return res && res.metrics ? `Look ${res.looks}: ${btPctText(res.metrics.returnPct)} on the held-out data` : "Looked at the held-out data";
    },
  });
}
/** THE HOLDOUT MOVED: the first held-out day, signed — never back over days a training run already used (the account refuses it, in words) */
function btMoveHoldout() {
  if (typeof quoteDialog !== "function") return;
  const h = BT.list && BT.list.holdout;
  const today = new Date().toISOString().slice(0, 10);
  quoteDialog({
    title: "Move the holdout",
    sub: "The data from the day you pick on is held out: strategies are tried only on what came before it, and only your signature runs one on it. It never moves back over days a strategy was already tried on.",
    fields: `<label>The first held-out day<input name="day" type="date" value="${esc((h && h.start) || today)}" max="${today}"></label>`,
    draft: (form) => {
      const day = formFields(form).day;
      return /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? { type: "setBacktest", change: "holdout", value: day } : "Pick a day.";
    },
    go: "Sign and move it",
    done: () => {
      btRead(true);
      return "The holdout moved";
    },
  });
}

// ---- the words and the figures ----

const btPctText = (n) => (Number.isFinite(Number(n)) ? `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${Math.abs(Number(n)).toFixed(2)}%` : "—");
const btFix = (n, places = 2) => (Number.isFinite(Number(n)) ? (Number(n) < 0 ? `−${Math.abs(Number(n)).toFixed(places)}` : Number(n).toFixed(places)) : "—");
const btDay = (iso) => (typeof iso === "string" ? iso.slice(0, 16).replace("T", " ") : "—");
const btParamWords = (params) => Object.entries(params || {}).map(([k, v]) => `${k} ${v}`).join(" · ");
/* a strategy's numbers in a table's cell: the first three, the rest in its title */
const btParamsShort = (params) => {
  const e = Object.entries(params || {});
  return `${e.slice(0, 3).map(([k, v]) => `${k} ${v}`).join(" · ")}${e.length > 3 ? " …" : ""}`;
};

/** the header: what the lab is in a line, the holdout and its looks (Move… for the owner), the ledger's state */
function btHeadHtml(L, owner, err) {
  const h = L && L.holdout;
  const g = L && L.ledger;
  const holdout = !h ? "" : h.ok === false || h.code ? `<span class="chip bad">${esc(h.message || "The holdout does not read")}</span>` : `<span class="chip" title="The data from this day on is held out: strategies are tried on what came before it, and only the owner's signature runs one on it">Held out from ${esc(h.start)} · ${plural((g && g.looks) || 0, "look")}</span>${owner ? '<button type="button" class="btn btn-sm" data-bt-act="holdout">Move…</button>' : ""}`;
  const ledger = !g ? "" : g.intact ? `<span class="chip" title="Every run is a row, each row's hash covering the one before it">Ledger · ${plural(g.rows, "row")}, intact</span>` : `<span class="chip bad" title="${esc(g.why || "")}">Ledger broken at row ${esc(g.brokenAt)}</span>`;
  return `<div class="bt-top"><div><h1 class="h2">Backtest</h1><p class="dim small">A strategy played over recorded bars through the paper account's own rules — its fills, fees, funding and liquidations — beside buying and holding the same markets. Every run is counted, and the latest data is held out for you.</p></div><div class="bt-chips">${holdout}${ledger}</div></div>${err ? `<div class="msg no">${esc(err)}</div>` : ""}`;
}

/* a curve thinned to `most` points, its first and last kept */
function btThin(pts, most = BT_POINTS) {
  if (pts.length <= most) return pts;
  const out = [];
  const every = (pts.length - 1) / (most - 1);
  for (let i = 0; i < most; i++) out.push(pts[Math.round(i * every)]);
  return out;
}

/** the strategy's equity and the buy-and-hold's on one scale in a w × h box, and the strategy's drawdown under it: paths, the range, the
 * dates; null with fewer than two points */
function btChart(curve, bench, w = 640, h = 220, dh = 56) {
  const ok = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const a = btThin((curve || []).filter(ok));
  if (a.length < 2) return null;
  const b = btThin((bench || []).filter(ok));
  const all = b.length > 1 ? [...a, ...b] : a;
  const t0 = Math.min(...all.map((p) => p[0]));
  const t1 = Math.max(...all.map((p) => p[0]));
  const lo = Math.min(...all.map((p) => p[1]));
  const hi = Math.max(...all.map((p) => p[1]));
  const pad = (hi - lo) * 0.08 || Math.max(1, Math.abs(hi) * 0.01);
  const top = hi + pad;
  const span = top - (lo - pad);
  const x = (t) => (((t - t0) / (t1 - t0 || 1)) * w).toFixed(1);
  const y = (u) => (((top - u) / span) * h).toFixed(1);
  const path = (pts) => `M${pts.map(([t, u]) => `${x(t)},${y(u)}`).join("L")}`;
  // the drawdown: how far under its own high the strategy stood, 0 at the top of its strip, its worst at the foot
  let peak = -Infinity;
  const dd = a.map(([t, u]) => {
    peak = Math.max(peak, u);
    return [t, peak > 0 ? u / peak - 1 : 0];
  });
  const worst = Math.min(0, ...dd.map((p) => p[1]));
  const dy = (v) => (worst < 0 ? ((v / worst) * dh).toFixed(1) : "0");
  const ddLine = `M${dd.map(([t, v]) => `${x(t)},${dy(v)}`).join("L")}`;
  return { w, h, dh, line: path(a), bench: b.length > 1 ? path(b) : "", dd: `${ddLine}L${w},0L0,0Z`, lo, hi, worst, from: t0, to: t1, start: a[0][1], end: a[a.length - 1][1], benchEnd: b.length > 1 ? b[b.length - 1][1] : undefined };
}

function btChartHtml(v) {
  const c = btChart(v.curve, v.benchmarkCurve);
  if (!c) return "";
  const words = `The strategy's equity from ${money(c.start)} to ${money(c.end)}, low ${money(c.lo)}, high ${money(c.hi)}${c.benchEnd !== undefined ? `; buying and holding ended at ${money(c.benchEnd)}` : ""}; its deepest drawdown ${btPctText(c.worst * 100)}`;
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  return `<div class="bt-plot"><div class="bt-legend" aria-hidden="true"><span><span class="sw"></span>Strategy</span>${c.bench ? '<span><span class="sw bench"></span>Buy and hold</span>' : ""}<span class="dim">${money(c.lo)} to ${money(c.hi)}</span></div><svg class="bt-chart" viewBox="0 0 ${c.w} ${c.h}" preserveAspectRatio="none" role="img" aria-label="${esc(words)}">${c.bench ? `<path class="bench" d="${c.bench}"/>` : ""}<path class="line" d="${c.line}"/></svg><svg class="bt-dd" viewBox="0 0 ${c.w} ${c.dh}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${c.dd}"/></svg><div class="bt-axis" aria-hidden="true"><span>${day(c.from)}</span><span>Drawdown, deepest ${btPctText(c.worst * 100)}</span><span>${day(c.to)}</span></div></div>`;
}

/* the figures, one row a figure: the strategy's and the buy-and-hold's */
const BT_ROWS = [
  ["Return", (m) => chg(m.returnPct)],
  ["CAGR", (m) => esc(btPctText(m.cagrPct))],
  ["Sharpe", (m) => `${esc(btFix(m.sharpe))} <span class="dim">±${esc(btFix(m.sharpeSe))}</span>`],
  ["Sortino", (m) => esc(btFix(m.sortino))],
  ["Volatility", (m) => `${esc(btFix(m.volPct, 1))}%`],
  ["Max drawdown", (m) => `${esc(btPctText(-m.maxDrawdownPct))} <span class="dim">· ${esc(btFix(m.maxDrawdownDays, 1))} d under</span>`],
  ["Calmar", (m) => esc(btFix(m.calmar))],
  ["Exposure", (m) => `${esc(btFix(m.exposurePct, 0))}%`],
  ["Fills · turnover", (m) => `${esc(m.fills)} <span class="dim">· ${esc(btFix(m.turnover, 1))}x a year</span>`],
  ["Fees", (m) => esc(money(m.feesUsd))],
  ["Funding", (m) => (m.fundingUsd > 0 ? `${esc(money(m.fundingUsd))} paid` : m.fundingUsd < 0 ? `${esc(money(-m.fundingUsd))} received` : "none")],
  ["Slippage", (m) => esc(money(m.slippageUsd))],
  ["End", (m) => `<b>${esc(money(m.endUsd))}</b>`],
];
function btFiguresHtml(v) {
  const m = v.metrics;
  if (!m) return "";
  const b = v.benchmark && v.benchmark.metrics;
  return `<div class="t-wrap"><table class="t bt-figs"><thead><tr><th scope="col"><span class="sr">Figure</span></th><th scope="col" class="r">Strategy</th>${b ? '<th scope="col" class="r">Buy and hold</th>' : ""}</tr></thead><tbody>${BT_ROWS.map(([k, f]) => `<tr><th scope="row">${esc(k)}</th><td class="r">${f(m)}</td>${b ? `<td class="r">${f(b)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

/** how the run is judged: a training run's Sharpe deflated by every distinct strategy tried, and its kin's odds of overfitting; a look at
 * the held-out data, the odds its Sharpe is above zero, which look it was, and where its answer is kept */
function btJudgedHtml(v) {
  if (v.window === "holdout") {
    return `<div class="bt-judged"><div class="label">On the held-out data</div><p>Look ${esc(v.looks ?? "—")} at it, from ${esc(v.holdout || "the holdout's start")}. The probability its Sharpe is above zero: <b>${esc(btFix(v.psr))}</b>.</p>${v.here ? '<p class="dim small">What came of a look is yours: the account answered it to your signature, and this browser keeps it. The terminal\'s <span class="mono">npm run account:backtest -- --trials</span> lists every look.</p>' : ""}</div>`;
  }
  const d = v.deflated;
  const o = v.overfit;
  const dsr = d ? `<p><b>Deflated Sharpe ${esc(btFix(d.dsr))}</b>: the probability the Sharpe is real, counting the ${esc(plural(d.trials, "distinct strategy", "distinct strategies"))} tried before the holdout${d.trials > 1 ? ` — the best of them would show ${esc(btFix(d.sr0))} a year by chance alone` : ""}.</p>` : "";
  const pbo = o ? `<p><b>PBO ${esc(btFix(o.pbo))}</b>: across ${esc(Number(o.combinations).toLocaleString("en-US"))} ways of halving the ${esc(Number(o.steps).toLocaleString("en-US"))} steps these ${esc(o.trials)} runs share, the run best on one half ranked in the bottom half of the other ${Math.round(o.pbo * 100)}% of the time.</p>` : '<p class="dim small">The probability of overfitting is judged once two runs on these markets and bars are kept.</p>';
  return `<div class="bt-judged"><div class="label">Judged against every run tried</div>${dsr}${pbo}</div>`;
}

function btFillsHtml(v) {
  const list = v.fillsList || [];
  if (!list.length) return v.fills === 0 ? '<p class="empty">No fill: the strategy never traded in this window.</p>' : "";
  const cols = [
    { label: "When (UTC)", cls: "nw", cell: (f) => esc(btDay(f.at)) },
    { label: "Market", cell: (f) => esc(f.symbol) },
    { label: "Side", cell: (f) => `<span class="${f.side === "buy" ? "up" : "down"}">${esc(f.side)}</span>` },
    { label: "Qty", r: true, cell: (f) => esc(px(f.qty)) },
    { label: "Price", r: true, cell: (f) => esc(px(f.price)) },
    { label: "Fee", r: true, cell: (f) => esc(fine(f.feeUsd)) },
    { label: "Result", r: true, cell: (f) => (f.realizedUsd === undefined ? '<span class="dim">—</span>' : chg(f.realizedUsd, "$")) },
    { label: "Note", cell: (f) => (f.note ? `<span class="small dim" title="${esc(f.note)}">${esc(String(f.note).slice(0, 60))}${String(f.note).length > 60 ? "…" : ""}</span>` : "") },
  ];
  return `<details class="bt-fills"><summary>${esc(plural(list.length, "fill"))}${list.length > BT_FILLS ? `, the first ${BT_FILLS} listed` : ""}</summary>${table(cols, list.slice(0, BT_FILLS), { cls: "bt-fill-t" })}</details>`;
}

/** THE RESULT: what ran, its equity beside the buy-and-hold's and its drawdown, the figures, how it is judged, the notes, the fills */
function btResultHtml(v) {
  if (!v) return '<div class="card-head"><h2 class="h2">The result</h2></div><p class="empty">Run a backtest, or open one of the trials below: its equity beside buying and holding, its figures, how it is judged against every run tried, and its fills.</p>';
  const s = v.strategy || {};
  const markets = (v.markets || []).map((m) => (typeof m === "string" ? m : `${m.symbol} · ${m.interval}`)).join(", ");
  const head = `<div class="card-head"><div><h2 class="h2">${esc(s.name || s.id || "A backtest")}${v.window === "holdout" ? ' <span class="tag warn">Held-out data</span>' : ""}</h2><p class="dim small">${esc(s.paramWords || btParamWords(s.params))}${markets ? ` · ${esc(markets)}` : ""} · ${esc(btDay(v.from))} → ${esc(btDay(v.to))} UTC${v.feeBps !== undefined ? ` · fee ${esc(v.feeBps)} bps` : ""}${v.leverage ? ` · perpetuals at ${esc(v.leverage)}x` : ""}</p></div>${v.id ? `<span class="mono small dim">${esc(v.id)}</span>` : ""}</div>`;
  const notes = (v.notes || []).length ? `<details class="bt-notes-box"><summary>${esc(plural(v.notes.length, "note"))}</summary><ul class="bt-notes small dim">${v.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>` : "";
  const refused = v.refused ? `<p class="msg wait">${esc(plural(v.refused, "order"))} not filled: the notes say why.</p>` : "";
  return `${head}${btChartHtml(v)}${btFiguresHtml(v)}${btJudgedHtml(v)}${refused}${notes}${btFillsHtml(v)}`;
}

/** THE TRIALS: the ledger's latest runs, newest first — what was tried, by whom, on which data, its figures; Open for a kept training run,
 * Look at the holdout… for the owner. A look at the held-out data shows its figures only where this browser signed for it */
function btTrialsHtml(L, owner, looks) {
  const head = `<div class="card-head"><h2 class="h2" id="bt-trials-h">Trials</h2>${L && L.ledger ? `<div class="tools dim small">${esc(plural(L.ledger.trials, "run"))} · ${esc(plural(L.ledger.distinct, "distinct strategy", "distinct strategies"))} tried before the holdout · ${esc(plural(L.ledger.looks, "look"))} at it</div>` : ""}</div>`;
  if (!L) return `${head}<div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel"></span></div>`;
  const seen = looks || {};
  const fig = (t) => (t.figures ? seen[t.run] && seen[t.run].metrics : t);
  const cols = [
    { label: "#", r: true, cell: (t) => esc(t.seq) },
    { label: "When", cls: "nw", cell: (t) => `${esc(nyDay(t.ts))} ${esc(nyTime(t.ts))}` },
    { label: "By", cell: (t) => `${esc(t.by)}${t.seat ? ` <span class="dim small">${esc(short(t.seat))}</span>` : ""}` },
    { label: "Data", cell: (t) => (t.window === "holdout" ? '<span class="tag warn">Held out</span>' : '<span class="tag">Training</span>') },
    { label: "Strategy", cell: (t) => `<b>${esc(t.strategy)}</b>${Object.keys(t.params || {}).length ? ` <span class="dim small" title="${esc(btParamWords(t.params))}">${esc(btParamsShort(t.params))}</span>` : ""}` },
    { label: "Markets", cell: (t) => `${esc((t.markets || []).join(", "))} <span class="dim small">${esc(t.interval)}</span>` },
    { label: "Window", cls: "nw", cell: (t) => `${esc(String(t.from).slice(0, 10))} → ${esc(String(t.to).slice(0, 10))}` },
    { label: "Return", r: true, cell: (t) => (fig(t) ? chg(fig(t).returnPct) : '<span class="dim" title="What came of a look is the owner\'s: shown to the browser that signed for it">yours</span>') },
    { label: "Sharpe", r: true, cell: (t) => (fig(t) ? esc(btFix(fig(t).sharpe)) : "") },
    { label: "Max DD", r: true, cell: (t) => (fig(t) ? esc(btPctText(-fig(t).maxDrawdownPct)) : "") },
    {
      label: "",
      sr: "Actions",
      cell: (t) => {
        const b = [];
        if (t.window === "train" && t.kept) b.push(`<button type="button" class="btn btn-sm" data-bt-act="open" data-id="${esc(t.run)}">Open</button>`);
        if (t.window === "holdout" && seen[t.run]) b.push(`<button type="button" class="btn btn-sm" data-bt-act="seen" data-id="${esc(t.run)}">Open</button>`);
        if (t.window === "train" && owner) b.push(`<button type="button" class="btn btn-sm btn-ghost" data-bt-act="look" data-id="${esc(t.run)}">Look at the holdout…</button>`);
        return `<div class="acts">${b.join("")}</div>`;
      },
    },
  ];
  return `${head}${table(cols, L.runs || [], { empty: "No backtest has run on this account yet: the form above runs the first.", cls: "bt-trials-t", rowAttr: (t) => `data-k="${esc(t.seq)}"` })}`;
}
