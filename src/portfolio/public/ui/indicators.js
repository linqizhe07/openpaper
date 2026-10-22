/* INDICATORS — the arithmetic a trading screen lays over its candles, as plain functions over the chart's bars (ui/chart.js draws them;
   nothing here touches the page). Eight of them, the ones every charting screen offers: over the price pane, a simple and an exponential
   moving average, Bollinger bands and VWAP; under it, in panes of their own, RSI, MACD, the stochastic oscillator and ATR. Each is computed
   as its textbook says it (Wilder's smoothing for RSI and ATR; an EMA seeded with the simple average of its first length; the bands' standard
   deviation the population's, as TradingView takes it; VWAP from each day's first bar, in the market's own day) and returns one value a bar,
   null until it has enough bars behind it: never a figure made up from fewer bars than its length.

   WHAT IS ON: a list [{ id, params }] written as one compact string the page keeps and the address carries ("sma:20,ema:50,bb:20:2,vwap,
   rsi:14,macd:12:26:9,stoch:14:3:3,atr:14"): inString writes it, inParse reads it back, dropping what it does not know and any length out
   of its range, keeping the first of a kind, and at most IN_MOST_UNDER of the ones that take a pane of their own. inCompute runs the list
   over the bars and says, for each, what to draw: its label, which pane, its series (name, values, colour class, how to write a value),
   the pane's fixed range and guide lines where it has them, which two series close a band. */

/* how many indicators may take a pane of their own under the price (a chart has only so much height) */
const IN_MOST_UNDER = 3;
/* each indicator: its id (the key in the string), its name and words, its pane, its parameters (key, words, default, range; `int` unless
   said otherwise), and what it needs of the bars */
const IN_SPECS = [
  { id: "sma", name: "SMA", words: "simple moving average of the close", pane: "over", params: [{ key: "n", label: "length", def: 20, min: 2, max: 500 }] },
  { id: "ema", name: "EMA", words: "exponential moving average", pane: "over", params: [{ key: "n", label: "length", def: 50, min: 2, max: 500 }] },
  { id: "bb", name: "Bollinger", words: "an average, k deviations either side", pane: "over", params: [{ key: "n", label: "length", def: 20, min: 2, max: 500 }, { key: "k", label: "width", def: 2, min: 0.5, max: 5, int: false }] },
  { id: "vwap", name: "VWAP", words: "volume-weighted price from the day's first bar", pane: "over", params: [], needsVolume: true, intradayOnly: true },
  { id: "rsi", name: "RSI", words: "relative strength index", pane: "under", params: [{ key: "n", label: "length", def: 14, min: 2, max: 200 }], range: [0, 100], guides: [30, 70] },
  { id: "macd", name: "MACD", words: "two averages' difference, and its signal", pane: "under", params: [{ key: "fast", label: "fast", def: 12, min: 2, max: 200 }, { key: "slow", label: "slow", def: 26, min: 3, max: 400 }, { key: "signal", label: "signal", def: 9, min: 1, max: 100 }], guides: [0] },
  { id: "stoch", name: "Stochastic", words: "%K smoothed, and %D its average", pane: "under", params: [{ key: "n", label: "length", def: 14, min: 2, max: 200 }, { key: "k", label: "%K smoothing", def: 3, min: 1, max: 50 }, { key: "d", label: "%D", def: 3, min: 1, max: 50 }], range: [0, 100], guides: [20, 80] },
  { id: "atr", name: "ATR", words: "average true range", pane: "under", params: [{ key: "n", label: "length", def: 14, min: 1, max: 200 }] },
];
const IN_BY_ID = Object.fromEntries(IN_SPECS.map((s) => [s.id, s]));

/** the list from its string: what is known, in range, once each, at most IN_MOST_UNDER under the price; a parameter left out is its default;
 * MACD's fast length must be shorter than its slow one. Never throws: junk is simply not on */
function inParse(text) {
  const list = [];
  const seen = new Set();
  let under = 0;
  for (const part of String(text || "").split(",")) {
    const bits = part.trim().split(":");
    const id = String(bits[0] || "").trim().toLowerCase();
    const spec = IN_BY_ID[id];
    if (!spec || seen.has(id)) continue;
    const params = [];
    let ok = true;
    spec.params.forEach((p, k) => {
      const raw = bits[k + 1];
      if (raw === undefined || raw.trim() === "") return void params.push(p.def);
      const v = Number(raw);
      if (!Number.isFinite(v) || v < p.min || v > p.max) ok = false;
      else params.push(p.int === false ? Math.round(v * 100) / 100 : Math.round(v));
    });
    if (!ok) continue;
    if (id === "macd" && params[0] >= params[1]) continue;
    if (spec.pane === "under") {
      if (under >= IN_MOST_UNDER) continue;
      under++;
    }
    seen.add(id);
    list.push({ id, params });
  }
  return list;
}
/** the list as its string (inParse reads it back) */
function inString(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && IN_BY_ID[x.id]).map((x) => [x.id, ...(Array.isArray(x.params) ? x.params : [])].join(":")).join(",");
}
/** an indicator's label: "SMA 20", "BB 20, 2", "MACD 12 26 9", "VWAP" */
function inLabel(x) {
  const spec = x && IN_BY_ID[x.id];
  if (!spec) return "";
  const ps = Array.isArray(x.params) ? x.params : [];
  if (spec.id === "bb") return `BB ${ps.join(", ")}`;
  if (spec.id === "stoch") return `Stoch ${ps.join(" ")}`;
  return ps.length ? `${spec.name} ${ps.join(" ")}` : spec.name;
}
/** the list with one indicator on (its params where given, else the ones it has, else the defaults — in its place where it was on, at
 * the end where it was not) or off; read back through inParse, so a figure out of range leaves it off and the pane cap holds */
function inWith(list, id, on, params) {
  const spec = IN_BY_ID[id];
  const L = (Array.isArray(list) ? list : []).filter((x) => x && IN_BY_ID[x.id]);
  if (!spec) return L;
  const at = L.findIndex((x) => x.id === id);
  if (!on) return at < 0 ? L : [...L.slice(0, at), ...L.slice(at + 1)];
  const ps = spec.params.map((p, k) => (Array.isArray(params) && Number.isFinite(Number(params[k])) ? Number(params[k]) : at >= 0 && Number.isFinite(Number(L[at].params[k])) ? Number(L[at].params[k]) : p.def));
  const item = { id, params: ps };
  return inParse(inString(at < 0 ? [...L, item] : L.map((x, i) => (i === at ? item : x))));
}

// ---- the arithmetic: one value a bar, null until enough bars stand behind it ----------------------------------------------------------

/** the simple moving average of `v` over `n` (a null in v restarts the window) */
function inSma(v, n) {
  const out = new Array(v.length).fill(null);
  if (n <= 1) return v.map((x) => (x === null || x === undefined || !Number.isFinite(x) ? null : x));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (x === null || x === undefined || !Number.isFinite(x)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += x;
    count++;
    if (count > n) sum -= v[i - n];
    if (count >= n) out[i] = sum / n;
  }
  return out;
}
/** the exponential moving average of `v` over `n`: seeded with the simple average of the first n values, then α = 2 / (n + 1) */
function inEma(v, n) {
  const out = new Array(v.length).fill(null);
  const a = 2 / (n + 1);
  let sum = 0;
  let count = 0;
  let prev = null;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (x === null || x === undefined || !Number.isFinite(x)) {
      sum = 0;
      count = 0;
      prev = null;
      continue;
    }
    if (prev === null) {
      sum += x;
      count++;
      if (count === n) prev = sum / n;
    } else prev = a * x + (1 - a) * prev;
    out[i] = prev;
  }
  return out;
}
/** Bollinger bands over `n` closes, `k` population standard deviations either side of their simple average: { mid, upper, lower } */
function inBollinger(v, n, k) {
  const mid = inSma(v, n);
  const upper = new Array(v.length).fill(null);
  const lower = new Array(v.length).fill(null);
  for (let i = n - 1; i < v.length; i++) {
    if (mid[i] === null) continue;
    let ss = 0;
    for (let j = i - n + 1; j <= i; j++) ss += (v[j] - mid[i]) * (v[j] - mid[i]);
    const sd = Math.sqrt(ss / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}
/** VWAP: the volume-weighted average of each bar's typical price (high + low + close over three), from the first bar of each day
 * (`dayOf(t)`: the market's own day) — null for a chart whose bars carry no volume at all */
function inVwap(bars, dayOf) {
  const out = new Array(bars.length).fill(null);
  if (!bars.some((b) => Number.isFinite(b.v) && b.v > 0)) return out;
  let day;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = typeof dayOf === "function" ? dayOf(b.t) : 0;
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const v = Number.isFinite(b.v) && b.v > 0 ? b.v : 0;
    pv += ((b.h + b.l + b.c) / 3) * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}
/** Wilder's RSI over `n` changes of the close: the first average gain and loss simple over the first n changes, then smoothed
 * ((n − 1) parts the average before, one part the new change); 100 where nothing was lost, 0 where nothing was gained */
function inRsi(v, n) {
  const out = new Array(v.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    const up = d > 0 ? d : 0;
    const down = d < 0 ? -d : 0;
    if (i <= n) {
      gain += up;
      loss += down;
      if (i < n) continue;
      gain /= n;
      loss /= n;
    } else {
      gain = (gain * (n - 1) + up) / n;
      loss = (loss * (n - 1) + down) / n;
    }
    out[i] = loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
/** MACD: the fast EMA less the slow one, its signal (an EMA of that over `signal`, seeded where the line begins) and the histogram
 * (the line less its signal): { macd, signal, hist } */
function inMacd(v, fast, slow, signal) {
  const f = inEma(v, fast);
  const s = inEma(v, slow);
  const macd = v.map((_, i) => (f[i] !== null && s[i] !== null ? f[i] - s[i] : null));
  const sig = inEma(macd, signal);
  const hist = macd.map((m, i) => (m !== null && sig[i] !== null ? m - sig[i] : null));
  return { macd, signal: sig, hist };
}
/** the stochastic oscillator: %K raw is where the close sits between the lowest low and the highest high of the last `n` bars (0 to 100;
 * 50 where they are one price), smoothed over `k` bars; %D its simple average over `d`: { k, d } */
function inStoch(bars, n, k, d) {
  const raw = new Array(bars.length).fill(null);
  for (let i = n - 1; i < bars.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      if (bars[j].h > hh) hh = bars[j].h;
      if (bars[j].l < ll) ll = bars[j].l;
    }
    raw[i] = hh > ll ? (100 * (bars[i].c - ll)) / (hh - ll) : 50;
  }
  const K = inSma(raw, k);
  return { k: K, d: inSma(K, d) };
}
/** Wilder's average true range over `n`: a bar's true range is the widest of its own range and its reach from the close before it; the
 * first average simple over the first n bars, then smoothed as RSI is */
function inAtr(bars, n) {
  const out = new Array(bars.length).fill(null);
  let acc = 0;
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
    if (prev === null) {
      acc += tr;
      if (i < n - 1) continue;
      prev = acc / n;
    } else prev = (prev * (n - 1) + tr) / n;
    out[i] = prev;
  }
  return out;
}

// ---- what to draw --------------------------------------------------------------------------------------------------------------------

/** the list run over `bars` ([{ t, o, h, l, c, v }], oldest first): one entry an indicator — { id, params, label, pane ("over" the price
 * or "under" it), series: [{ name, values, cls (its colour class), fmt ("price": in the market's own figures; "plain": one decimal),
 * kind? ("bars": a histogram) }], range? (the pane's fixed range), guides? (its guide lines), band? ([i, j]: the two series a band is
 * filled between), note? (why it draws nothing: no volume, or bars too coarse) }. `opts.dayOf(t)` says a bar's day for VWAP;
 * `opts.intraday` whether the bars are intraday (VWAP is read on those alone) */
function inCompute(bars, list, opts = {}) {
  const B = Array.isArray(bars) ? bars : [];
  const closes = B.map((b) => b.c);
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const spec = x && IN_BY_ID[x.id];
    if (!spec) continue;
    const p = Array.isArray(x.params) ? x.params : [];
    const label = inLabel(x);
    const base = { id: spec.id, params: p, label, pane: spec.pane, ...(spec.range ? { range: spec.range } : {}), ...(spec.guides ? { guides: spec.guides } : {}) };
    if (spec.id === "sma") out.push({ ...base, series: [{ name: label, values: inSma(closes, p[0]), cls: "in-a", fmt: "price" }] });
    else if (spec.id === "ema") out.push({ ...base, series: [{ name: label, values: inEma(closes, p[0]), cls: "in-b", fmt: "price" }] });
    else if (spec.id === "bb") {
      const b = inBollinger(closes, p[0], p[1]);
      out.push({ ...base, series: [{ name: "BB mid", values: b.mid, cls: "in-c", fmt: "price" }, { name: "BB upper", values: b.upper, cls: "in-c", fmt: "price" }, { name: "BB lower", values: b.lower, cls: "in-c", fmt: "price" }], band: [1, 2] });
    } else if (spec.id === "vwap") {
      const intraday = opts.intraday !== false;
      const hasVol = B.some((b) => Number.isFinite(b.v) && b.v > 0);
      const values = intraday && hasVol ? inVwap(B, opts.dayOf) : new Array(B.length).fill(null);
      out.push({ ...base, series: [{ name: "VWAP", values, cls: "in-d", fmt: "price" }], ...(!intraday ? { note: "VWAP is read on intraday bars" } : !hasVol ? { note: "VWAP needs volume, which these bars do not carry" } : {}) });
    } else if (spec.id === "rsi") out.push({ ...base, series: [{ name: label, values: inRsi(closes, p[0]), cls: "in-a", fmt: "plain" }] });
    else if (spec.id === "macd") {
      const m = inMacd(closes, p[0], p[1], p[2]);
      out.push({ ...base, series: [{ name: "MACD", values: m.macd, cls: "in-a", fmt: "price" }, { name: "Signal", values: m.signal, cls: "in-b", fmt: "price" }, { name: "Hist", values: m.hist, cls: "in-hist", fmt: "price", kind: "bars" }] });
    } else if (spec.id === "stoch") {
      const st = inStoch(B, p[0], p[1], p[2]);
      out.push({ ...base, series: [{ name: "%K", values: st.k, cls: "in-a", fmt: "plain" }, { name: "%D", values: st.d, cls: "in-b", fmt: "plain" }] });
    } else if (spec.id === "atr") out.push({ ...base, series: [{ name: label, values: inAtr(B, p[0]), cls: "in-a", fmt: "price" }] });
  }
  return out;
}
