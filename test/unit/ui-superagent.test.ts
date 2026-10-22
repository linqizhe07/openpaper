/** The superagent's page (ui/superagent.js), run as the page runs it: a plain script in one global scope after ui/core.js and ui/desk.js, in
 * a vm with a stand-in for the browser that has none of a window's frame machinery (no matchMedia, no requestAnimationFrame, no
 * ResizeObserver, no IntersectionObserver, no devicePixelRatio, no document.createElement), so loading it proves it asks for none at load.
 * What is checked is what the owner sees and signs: what happened, found by reading one feed against the one before (in the order it
 * happened, each lead's step after the room line that speaks of it, nothing replayed after a gap) and played — a banner a step, the lead's
 * chip along the seats' line, its trades landing on the chart and in What it did; Now; the eight cards' numbers and words from a feed; the setup's signatures in their order with their exact fields; the controls' drafts; and honesty — an empty seat says
 * so, a brain that cannot think says why, and nothing is drawn from no data. Then the page as a whole: the scripts and styles named in
 * their places, the pane, the rail's link and its icon, the route, the switch on Trade's market bar at a paper account only, and the link
 * on the Portfolio's paper book. Nothing leaves the process. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const PUBLIC = fileURLToPath(new URL("../../src/portfolio/public/", import.meta.url));
const source = (f: string) => readFileSync(join(PUBLIC, f), "utf8");
const html = source("account.html");

/** an element as the page uses one, defined in the page's own scope (fakeEl): each part it looks for is an element of its own, kept by its
 * selector; what is painted into it is kept as written (paint() writes innerHTML where there is no document to morph in) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fake = Record<string, any>;
const FAKE = `function fakeEl(sel) {
  const kids = new Map();
  const classes = new Set();
  return { sel, innerHTML: "", textContent: "", dataset: {}, style: {}, hidden: false, isConnected: true, classes,
    classList: { add: (c) => void classes.add(c), remove: (c) => void classes.delete(c), toggle: (c, f) => { const on = f === undefined ? !classes.has(c) : !!f; if (on) classes.add(c); else classes.delete(c); return on; }, contains: (c) => classes.has(c) },
    querySelector(s) { let k = kids.get(s); if (!k) kids.set(s, (k = fakeEl(s))); return k; },
    querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, contains: () => true };
}`;

/** A SMALL DOM, enough for a form to be drawn from the page's own HTML and used the way a browser uses it: HTML parsed into elements (tags,
 * attributes, text; void elements; entities), a selector of one compound part (tag, #id, .class, [attr], [attr=value]) for querySelector,
 * querySelectorAll, closest and matches, inputs, textareas and selects with a browser's value rules (a select's value is its selected
 * option's; set to one it does not offer, it holds none), hidden and disabled as attributes, dataset over data-* attributes, events that
 * bubble from the element up its parents to the document's listeners, and FormData over a form's named, enabled fields in document order.
 * Built here, outside the page's scope, so the page's scripts meet it only as they meet a browser: through document and the elements */
type Listener = (e: Fake) => void;
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "wbr", "col", "area"]);
const unesc = (t: string) => t.replace(/&(amp|lt|gt|quot|#39);/g, (_, x: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[x] ?? "");
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
class MiniText {
  parentNode: MiniEl | null = null;
  readonly nodeType = 3;
  constructor(public text: string) {}
}
class MiniEl {
  readonly nodeType = 1;
  readonly tagName: string;
  kids: Array<MiniEl | MiniText> = [];
  parentNode: MiniEl | null = null;
  listeners: Record<string, Listener[]> = {};
  style: Record<string, string> = {};
  private val: string | undefined;
  private picked = -2;
  private tick: boolean | undefined;
  readonly dataset: Record<string, string>;
  constructor(tag: string, public attrs: Record<string, string>, readonly doc: MiniDoc) {
    this.tagName = tag.toUpperCase();
    const attrsOf = this.attrs;
    this.dataset = new Proxy({} as Record<string, string>, {
      get: (_, k) => (typeof k === "string" ? attrsOf[`data-${kebab(k)}`] : undefined),
      set: (_, k, v) => ((attrsOf[`data-${kebab(String(k))}`] = String(v)), true),
      deleteProperty: (_, k) => (delete attrsOf[`data-${kebab(String(k))}`], true),
      has: (_, k) => `data-${kebab(String(k))}` in attrsOf,
    });
  }
  get isConnected() { return true; }
  get children(): MiniEl[] { return this.kids.filter((k): k is MiniEl => k instanceof MiniEl); }
  get id() { return this.attrs.id ?? ""; }
  get name() { return this.attrs.name ?? ""; }
  get type() { return (this.attrs.type ?? (this.tagName === "SELECT" ? "select-one" : this.tagName === "TEXTAREA" ? "textarea" : this.tagName === "BUTTON" ? "submit" : "text")).toLowerCase(); }
  set type(v: string) { this.attrs.type = v; }
  get className() { return this.attrs.class ?? ""; }
  set className(v: string) { this.attrs.class = v; }
  get hidden() { return "hidden" in this.attrs; }
  set hidden(v: boolean) { if (v) this.attrs.hidden = ""; else delete this.attrs.hidden; }
  get disabled() { return "disabled" in this.attrs; }
  set disabled(v: boolean) { if (v) this.attrs.disabled = ""; else delete this.attrs.disabled; }
  get readOnly() { return "readonly" in this.attrs; }
  get checked() { return this.tick ?? "checked" in this.attrs; }
  set checked(v: boolean) { this.tick = !!v; }
  get options(): MiniEl[] { return this.all((e) => e.tagName === "OPTION"); }
  private index() {
    if (this.picked !== -2) return this.picked;
    const o = this.options;
    const sel = o.map((x, i) => ("selected" in x.attrs ? i : -1)).filter((i) => i >= 0);
    return sel.length ? sel[sel.length - 1]! : o.length ? 0 : -1;
  }
  get value(): string {
    if (this.tagName === "SELECT") return this.options[this.index()]?.value ?? "";
    if (this.tagName === "OPTION") return this.attrs.value ?? this.textContent;
    if (this.val !== undefined) return this.val;
    return this.tagName === "TEXTAREA" ? this.textContent : (this.attrs.value ?? "");
  }
  set value(v: string) {
    if (this.tagName === "SELECT") this.picked = this.options.findIndex((o) => o.value === String(v));
    else this.val = String(v);
  }
  get textContent(): string { return this.kids.map((k) => (k instanceof MiniText ? k.text : k.textContent)).join(""); }
  set textContent(t: string) { this.kids = [Object.assign(new MiniText(String(t)), { parentNode: this })]; }
  get innerHTML(): string { return this.kids.map((k) => (k instanceof MiniText ? k.text : k.outerHTML)).join(""); }
  set innerHTML(html: string) {
    this.kids = [];
    this.picked = -2;
    parseInto(this, String(html), this.doc);
  }
  get outerHTML(): string { return `<${this.tagName.toLowerCase()}${Object.entries(this.attrs).map(([k, v]) => ` ${k}="${v}"`).join("")}>${VOID.has(this.tagName.toLowerCase()) ? "" : `${this.innerHTML}</${this.tagName.toLowerCase()}>`}`; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  removeAttribute(k: string) { delete this.attrs[k]; }
  hasAttribute(k: string) { return k in this.attrs; }
  get classList() { const cls = () => this.className.split(/\s+/).filter(Boolean); return { contains: (c: string) => cls().includes(c), add: (c: string) => void (this.className = [...new Set([...cls(), c])].join(" ")), remove: (c: string) => void (this.className = cls().filter((x) => x !== c).join(" ")), toggle: (c: string, on?: boolean) => { const has = cls().includes(c); const want = on === undefined ? !has : on; if (want) this.classList.add(c); else this.classList.remove(c); return want; } }; }
  all(test: (e: MiniEl) => boolean): MiniEl[] {
    const out: MiniEl[] = [];
    const walk = (e: MiniEl) => { for (const k of e.children) { if (test(k)) out.push(k); walk(k); } };
    walk(this);
    return out;
  }
  matches(sel: string) { return sel.split(",").some((one) => matchOne(this, one.trim())); }
  querySelectorAll(sel: string) { return this.all((e) => e.matches(sel)); }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel: string) { for (let e: MiniEl | null = this; e; e = e.parentNode) if (e.matches(sel)) return e; return null; }
  contains(x: unknown) { for (let e = x as MiniEl | null; e; e = e.parentNode) if (e === this) return true; return false; }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  focus() { this.doc.focused = this; }
  dispatchEvent(ev: Fake) {
    ev.target = this;
    for (let e: MiniEl | null = this; e; e = e.parentNode) {
      for (const fn of e.listeners[ev.type] ?? []) fn(ev);
      if (ev.bubbles === false) return true;
    }
    for (const fn of this.doc.listeners[ev.type] ?? []) fn(ev);
    return true;
  }
}
class MiniDoc {
  listeners: Record<string, Listener[]> = {};
  focused: MiniEl | null = null;
  root(html = "") { const r = new MiniEl("div", {}, this); r.innerHTML = html; return r; }
}
/** one compound selector: tag, #id, .class, [attr], [attr=value] (quoted or not); no combinators (a page script here asks none) */
function matchOne(e: MiniEl, sel: string): boolean {
  if (/\s/.test(sel.replace(/\[[^\]]*\]/g, ""))) throw new Error(`the small DOM takes no combinator: ${sel}`);
  const tag = /^[a-zA-Z][\w-]*/.exec(sel);
  if (tag && e.tagName !== tag[0].toUpperCase()) return false;
  for (const m of sel.matchAll(/#([\w-]+)/g)) if (e.id !== m[1]) return false;
  for (const m of sel.replace(/\[[^\]]*\]/g, "").matchAll(/\.([\w-]+)/g)) if (!e.classList.contains(m[1]!)) return false;
  for (const m of sel.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g)) {
    if (!(m[1]! in e.attrs)) return false;
    const want = m[2] ?? m[3] ?? m[4];
    if (want !== undefined && e.attrs[m[1]!] !== want) return false;
  }
  return true;
}
function parseInto(into: MiniEl, html: string, doc: MiniDoc) {
  const stack: MiniEl[] = [into];
  const add = (n: MiniEl | MiniText) => { const top = stack[stack.length - 1]!; n.parentNode = top; top.kids.push(n); };
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+/g)) {
    const [whole, close, tag, rest] = m;
    if (whole.startsWith("<!--")) continue;
    if (!tag) { add(new MiniText(unesc(whole))); continue; }
    const t = tag.toLowerCase();
    if (close) { for (let i = stack.length - 1; i > 0; i--) if (stack[i]!.tagName === t.toUpperCase()) { stack.length = i; break; } continue; }
    const attrs: Record<string, string> = {};
    for (const a of (rest ?? "").matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) attrs[a[1]!.toLowerCase()] = unesc(a[2] ?? a[3] ?? a[4] ?? "");
    const el = new MiniEl(t, attrs, doc);
    add(el);
    if (!VOID.has(t) && !/\/\s*$/.test(rest ?? "")) stack.push(el);
  }
}
/** a form's named, enabled fields as a browser's FormData gives them: a box's text, a select's choice, a ticked box's value */
class MiniFormData {
  private readonly rows: Array<[string, string]> = [];
  constructor(form: MiniEl) {
    for (const el of form.all((e) => !!e.name && ["INPUT", "SELECT", "TEXTAREA"].includes(e.tagName))) {
      if (el.disabled) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      if (el.tagName === "SELECT" && !el.options.length) continue;
      this.rows.push([el.name, el.type === "checkbox" || el.type === "radio" ? (el.attrs.value ?? "on") : el.value]);
    }
  }
  get(k: string) { return this.rows.find(([n]) => n === k)?.[1] ?? null; }
  getAll(k: string) { return this.rows.filter(([n]) => n === k).map(([, v]) => v); }
  entries() { return this.rows[Symbol.iterator](); }
}

/** The page's scripts in a stand-in for the browser. By default core.js, brains.js, desk.js and superagent.js alone, with a stand-in device key
 * (Owner) the test may replace; `full`: every script account.html names, owner.js first, over the stand-in the other page tests use (the
 * device key asked for and never answering, so nothing is fetched or drawn after the start). Either way fetch is the test's */
function page(files = ["ui/core.js", "ui/brains.js", "ui/desk.js", "ui/superagent.js"], { full = false, dom = false } = {}) {
  const stored: string[] = [];
  const element = (): Fake => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, style: {}, hidden: false, value: "", textContent: "", innerHTML: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" }, setAttribute() {} }, hidden: false, activeElement: null },
    location: { hash: "", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem: (k: string) => void stored.push(k), removeItem() {} },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    fetch: () => new Promise(() => {}),
    /* a form's fields, as the drafts read them: { values } stands in for the form */
    FormData: class {
      constructor(private readonly f: { values?: Record<string, string> }) {}
      get(k: string) {
        return this.f.values?.[k] ?? null;
      }
      getAll(k: string) {
        const v = this.f.values?.[k];
        return v === undefined ? [] : [v];
      }
      entries() {
        return Object.entries(this.f.values ?? {})[Symbol.iterator]();
      }
    },
    console,
    // the browser's own URL parser: the Brains sheet reads a base URL's host with it (ui/brains.js brWhere — "this machine" only for its loopback)
    URL,
    URLSearchParams,
    Intl,
    setTimeout,
    clearTimeout,
  };
  if (full) Object.assign(sandbox, { MutationObserver: class { observe() {} }, indexedDB: { open: () => ({}) }, scrollTo() {}, setInterval: () => 0, clearInterval() {} });
  else sandbox.Owner = { role: "owner", act: async () => ({ status: 200, body: { ok: true } }), why: () => "" };
  // the small DOM (`dom`): the document's listeners kept (desk.js listens there for the Brain select's change), forms read as a browser
  // reads them, and mini(html) to make a part of the page to draw into
  const doc = new MiniDoc();
  if (dom) {
    (sandbox.document as Fake).addEventListener = (type: string, fn: Listener) => void (doc.listeners[type] ??= []).push(fn);
    sandbox.FormData = class {
      constructor(f: Fake) {
        // eslint-disable-next-line no-constructor-return
        return f instanceof MiniEl ? new MiniFormData(f) : { get: (k: string) => f.values?.[k] ?? null, getAll: (k: string) => (f.values?.[k] === undefined ? [] : [f.values[k]]), entries: () => Object.entries(f.values ?? {})[Symbol.iterator]() };
      }
    };
    sandbox.mini = (html: string) => doc.root(html);
  }
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of files) new Script(source(f), { filename: f }).runInContext(ctx);
  runInContext(FAKE, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  /** a value out of the page, as plain data */
  const out = <T = any>(code: string): T => JSON.parse(run<string>(`JSON.stringify(${code})`)) as T; // eslint-disable-line @typescript-eslint/no-explicit-any
  const set = (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`);
  return { run, out, set, sandbox, stored, doc };
}
/* every script the page names, in its order (one another builder delivers and has not written yet is left out here: the page's own test,
   page-scripts.test.ts, holds the page to naming only what is there) */
const PAGE = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/^\//, "")).filter((f) => existsSync(join(PUBLIC, f)));
const settle = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---- the account and the desk, as the reads give them ------------------------------------------------------------------------------------

const NOW = Date.parse("2026-10-14T15:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const addr = (n: number) => `0x${String(n).repeat(40)}`;
const PAPER = { id: "paper-1", name: "Paper account", live: true, paper: true, usd: 10_000, trade: { can: true, kinds: ["spot", "perp"] } };
const REAL = { id: "okx", name: "OKX", live: true, usd: 2_500, trade: { can: true, kinds: ["spot"] } };
const ACCOUNT = { now: iso(NOW), venues: [PAPER, REAL], keys: [], spend: [], cards: [], orders: [], requests: [], asks: [], connectLive: { writes: { on: true, capUsd: 250 } } };
const OWNS = (role: string) => ({ head: "The weekly objective turned into each day's work.", search: "Leads: markets worth a look.", risk: "Clearance: whether a lead may be entered.", sniper: "Entries: each cleared lead placed as one order.", exit: "Open leads: the take-profit, the stop and the time limit.", watch: "Danger on open leads.", flow: "What large money is doing.", sentiment: "The attention a lead's market gets." })[role];
const FLOW_WHY = "needs a feed of large and smart-money flows, which the account does not have: an agent of yours with that data fills this seat";
const CATALOG = {
  ok: true,
  roles: [
    { id: "head", name: "Head of desk", tag: "HEAD", house: true, trades: false, charter: { owns: OWNS("head"), good: "", never: "" } },
    { id: "search", name: "Search", tag: "SEARCH", house: true, trades: false, charter: { owns: OWNS("search"), good: "", never: "" } },
    { id: "risk", name: "Risk", tag: "RISK", house: true, trades: false, charter: { owns: OWNS("risk"), good: "", never: "" } },
    { id: "sniper", name: "Sniper", tag: "SNIPER", house: true, trades: true, charter: { owns: OWNS("sniper"), good: "", never: "" } },
    { id: "exit", name: "Exit", tag: "EXIT", house: true, trades: true, charter: { owns: OWNS("exit"), good: "", never: "" } },
    { id: "watch", name: "Watch", tag: "WATCH", house: true, trades: true, charter: { owns: OWNS("watch"), good: "", never: "" } },
    { id: "flow", name: "Flow", tag: "FLOW", house: false, outsideOnly: FLOW_WHY, trades: false, charter: { owns: OWNS("flow"), good: "", never: "" } },
    { id: "sentiment", name: "Sentiment", tag: "SENTIMENT", house: false, outsideOnly: "needs a feed of social and news attention, which the account does not have: an agent of yours with that data fills this seat", trades: false, charter: { owns: OWNS("sentiment"), good: "", never: "" } },
  ],
  seats: { head: addr(1), search: addr(2), risk: addr(3), sniper: addr(4), exit: addr(5), watch: addr(6) },
  brain: { ok: true, provider: "claude", label: "Claude", model: "claude-opus-5-5", models: [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", inUsd: 4, outUsd: 20 }], effort: "medium", how: "the Anthropic API" },
  brains: [
    { ok: true, id: "claude", label: "Claude", model: "claude-opus-5-5", models: [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", inUsd: 4, outUsd: 20 }], how: "the Anthropic API" },
    { ok: false, id: "openai", label: "OpenAI format", models: [], why: "no key file at credentials/openai/api-key.json" },
  ],
  universes: [{ id: "all", label: "Anything the venue lists" }],
  defaults: { universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 15, reportAt: "21:00", maxOpen: 3 },
  hired: false,
};
const CATALOG_BOUNDS = { targetPct: [0.1, 100], maxRiskPct: [0.1, 50], maxDailyLossPct: [0.1, 50], hours: [1, 336], everyMin: [1, 240], maxOpen: [1, 10] };
const seat = (role: string, n: number, more: Record<string, unknown> = {}) => ({ role, kind: "house", address: addr(n), name: `Desk ${role[0]!.toUpperCase()}${role.slice(1)}`, status: "ok", cards: 0, ...more });
const VIEW = {
  id: "desk",
  name: "The desk",
  objective: { text: "Small, quick entries on the most traded coins", venue: "paper-1", universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 5, reportAt: "21:00", maxOpen: 3 },
  seats: [seat("head", 1), seat("search", 2), seat("risk", 3), seat("sniper", 4, { limit: { perOrderUsd: 100, leftUsd: 1_400, budgetUsd: 2_000, venues: ["paper-1"] } }), seat("exit", 5), seat("watch", 6, { status: "not let in" })],
  equity: { nowUsd: 10_012.5, startUsd: 10_000, changeUsd: 12.5, changePct: 0.125, mult: 1.00125, points: [[NOW - 60 * MIN, 10_000], [NOW - 30 * MIN, 10_005], [NOW - 5 * MIN, 10_012.5]] },
  tape: { wins: 2, losses: 1, winRatePct: 66.7, avgWinPct: 3.1, avgLossPct: -1.2, closes: [{ id: "L-0001", symbol: "BTC/USDT", pnlUsd: 5.2, roiPct: 5.2, at: iso(NOW - 50 * MIN) }, { id: "L-0002", symbol: "ETH/USDT", pnlUsd: -1.1, roiPct: -1.1, at: iso(NOW - 40 * MIN) }] },
  open: [{ id: "L-0003", venue: "paper-1", symbol: "SOL/USDT", kind: "spot", side: "buy", sizeUsd: 100, state: "executed", entry: { price: 150, qty: 0.6667, at: iso(NOW - 10 * MIN), feeUsd: 0.1 }, markPrice: 149.5, unrealizedUsd: -0.33 }],
};
const lead = (id: string, state: string, more: Record<string, unknown> = {}) => ({ id, at: iso(NOW - 20 * MIN), state, symbol: "SOL/USDT", name: "Solana", kind: "spot", side: "buy", updatedAt: iso(NOW - 20 * MIN), ...more });
const ROWS = Array.from({ length: 40 }, (_, i) => ({ symbol: `C${i}/USDT`, name: `Coin ${i}`, kind: "spot", price: 1 + i, changePct24h: i % 2 ? 1.5 : -0.8, volumeUsd24h: 1e6 * (40 - i) }));
const msg = (seq: number, from: string, kind: string, text: string, more: Record<string, unknown> = {}) => ({ seq, at: iso(NOW - (20 - seq) * 1000), from, kind, text, ...more });
function feed(more: Record<string, unknown> = {}) {
  return {
    ok: true,
    seq: 12,
    room: [msg(10, "search", "lead", "LEAD L-0003 | SOL/USDT | long | volume is up | confidence 0.71 → RISK", { lead: "L-0003", brain: true }), msg(11, "risk", "clearance", "RISK CLEARANCE L-0003 | spread 0.04% | size $100.00 · TP +1.5% · SL -0.8% · 12 h | Verdict: CLEAR → SNIPER", { lead: "L-0003", brain: true }), msg(12, "sniper", "order", "L-0003: filled 0.6667 SOL at 150 at Paper account (Beast, inside the limit).", { lead: "L-0003" })],
    working: { role: "search", what: "scan", since: iso(NOW - 3000) },
    inFlight: 1,
    lastThink: { search: { at: iso(NOW - 60_000), ms: 2400, ok: true } },
    lastScan: { cycle: 14, at: iso(NOW - 60_000), venue: "paper-1", rows: ROWS, picked: [{ lead: "L-0003", symbol: "SOL/USDT", side: "buy", confidence: 0.71 }, { lead: "L-0004", symbol: "C1/USDT", side: "buy", confidence: 0.55 }] },
    autonomy: { paper: true, at: iso(NOW - 3_600_000) },
    session: { state: "live", startedAt: iso(NOW - 2 * 3_600_000 - 61_000), endsAt: iso(NOW + 20 * 3_600_000), hours: 22, cycles: 14 },
    venue: { id: "paper-1", name: "Paper account", usd: 10_003.2, paper: true, connected: true },
    equity: { nowUsd: 10_012.5, startUsd: 10_000, changeUsd: 12.5, changePct: 0.125, tail: [[NOW - 30 * MIN, 10_005], [NOW - 5 * MIN, 10_012.5]] },
    target: { pct: 3, progressPct: 4.2, reachedUsd: 12.5, targetUsd: 300 },
    funnel: { scanned: 9, cleared: 4, confirmed: 0, executed: 3, closed: 2, rejected: 5 },
    today: { pnlUsd: 4.1, wins: 2, losses: 1, scanned: 9, cleared: 4, executed: 3, closed: 2, lossRoomUsd: 487.5 },
    leads: [lead("L-0001", "closed", { symbol: "BTC/USDT", name: "Bitcoin", pnlUsd: 5.2, exitWhy: "TP HIT at 64000 (+1.52%)", entry: { price: 63_000, qty: 0.0016, at: iso(NOW - 55 * MIN) } }), lead("L-0002", "closed", { symbol: "ETH/USDT", name: "Ethereum", pnlUsd: -1.1, exitWhy: "stop at 2480 (-0.81%)", entry: { price: 2_500, qty: 0.04, at: iso(NOW - 45 * MIN) } }), lead("L-0003", "executed", { sizeUsd: 100, tpPct: 1.5, slPct: 0.8, maxHours: 12, entry: { price: 150, qty: 0.6667, at: iso(NOW - 10 * MIN) }, markPrice: 149.5, unrealizedUsd: -0.33, checks: { spreadPct: 0.04, maxSizeUsd: 100, lossRoomUsd: 487.5, minNotionalUsd: 5 }, updatedAt: iso(NOW - 10 * MIN) })],
    routines: { everyMin: 5, nextCycleAt: iso(NOW + 192_000) },
    brain: { ok: true, label: "Claude", model: "claude-opus-5-5", spend: { calls: 37, inputTokens: 51_000, outputTokens: 9_000, usd: 0.84 } },
    hard: { maxSpreadPct: 0.6 },
    ...more,
  };
}

// ---- what happened, as events ---------------------------------------------------------------------------------------------------------------

describe("the feed read against the one before: what happened, as events", () => {
  const p = page();
  /** one read after another, the events of each */
  const reads = (...feeds: unknown[]) => {
    p.run("var PREV = null; var OUT = []");
    for (const f of feeds) p.run(`(() => { const r = sgDiff(PREV, ${JSON.stringify(f)}); PREV = r.next; OUT.push(r.events); })()`);
    return p.out<Array<Array<Record<string, unknown>>>>("OUT");
  };
  const base = (leads: unknown[], room: unknown[], more: Record<string, unknown> = {}) => feed({ leads, room, seq: Math.max(0, ...room.map((m) => (m as { seq: number }).seq)), working: null, inFlight: 0, ...more });

  it("replays nothing on the first read: what is there is drawn as state, and the cursor is the room's newest line", () => {
    const [first] = reads(feed());
    expect(first).toEqual([]);
    expect(p.out("PREV")).toMatchObject({ seq: 12, primed: true, thinking: "search", cycles: 14, leads: { "L-0003": { state: "executed", entry: true } } });
  });

  it("says each new line, and puts each lead's packet right after the line that speaks of it: Search → Risk, Risk → Sniper, the order, the fill", () => {
    const before = base([lead("L-0001", "closed", { pnlUsd: 5.2 })], [msg(9, "head", "cycle", "Cycle 13 (the clock): 2 lead scanned, 1 cleared, 1 placed, 0 open.")], { session: { ...feed().session, cycles: 13 } });
    const after = base(
      [lead("L-0001", "closed", { pnlUsd: 5.2 }), lead("L-0003", "executed", { sizeUsd: 100, entry: { price: 150, qty: 0.6667, at: iso(NOW) } })],
      [msg(9, "head", "cycle", "Cycle 13 …"), ...feed().room],
      { working: { role: "exit", what: "exit", since: iso(NOW) }, inFlight: 1 },
    );
    const [, events] = reads(before, after);
    expect(events).toEqual([
      { type: "cycle", n: 14 },
      // each line said for people (sgPlain), the room's own line beside it as raw
      { type: "say", role: "search", text: "L-0003 · long SOL/USDT — volume is up. Confidence 71%. Passed to Risk.", raw: "LEAD L-0003 | SOL/USDT | long | volume is up | confidence 0.71 → RISK", kind: "lead" },
      { type: "handoff", lead: "L-0003", symbol: "SOL/USDT", side: "buy", from: "search", to: "risk" },
      { type: "say", role: "risk", text: "L-0003 cleared. Spread 0.04%. Size $100.00 · take-profit +1.5% · stop −0.8% · 12 h. Passed to the Sniper.", raw: "RISK CLEARANCE L-0003 | spread 0.04% | size $100.00 · TP +1.5% · SL -0.8% · 12 h | Verdict: CLEAR → SNIPER", kind: "clearance" },
      { type: "handoff", lead: "L-0003", symbol: "SOL/USDT", side: "buy", from: "risk", to: "sniper" },
      { type: "say", role: "sniper", text: "L-0003 filled: bought 0.6667 SOL at 150 on Paper account, placed in Beast, inside the Sniper's limit.", raw: "L-0003: filled 0.6667 SOL at 150 at Paper account (Beast, inside the limit).", kind: "order" },
      { type: "order", lead: "L-0003", symbol: "SOL/USDT", side: "buy", usd: 100, role: "sniper" },
      { type: "fill", lead: "L-0003", symbol: "SOL/USDT", side: "buy", price: 150, qty: 0.6667 },
      // the brain call under way for the Exit, last: it is what is happening now
      { type: "think", role: "exit", on: true },
    ]);
  });

  it("turns down a lead Risk rejected, and a refusal at the door is said by the account where the room did not say it", () => {
    const one = base([lead("L-0005", "scanned")], [msg(20, "search", "lead", "LEAD L-0005 …", { lead: "L-0005" })]);
    const two = base([lead("L-0005", "rejected", { why: "the spread is 1.20%, over 0.6%" }), lead("L-0006", "refused", { why: "the door refused the entry — over the trading limit" })], [msg(20, "search", "lead", "LEAD L-0005 …"), msg(21, "risk", "clearance", "RISK CLEARANCE L-0005 | the spread is 1.20%, over 0.6% | Verdict: REJECT", { lead: "L-0005" })]);
    const [, events] = reads(one, two);
    expect(events).toEqual([
      // L-0005 was scanned at the read before (its LEAD line came then): it reaches Risk, Risk says no: it is turned down
      { type: "handoff", lead: "L-0005", symbol: "SOL/USDT", side: "buy", from: "search", to: "risk" },
      { type: "say", role: "risk", text: "L-0005 rejected: the spread is 1.20%, over 0.6%.", raw: "RISK CLEARANCE L-0005 | the spread is 1.20%, over 0.6% | Verdict: REJECT", kind: "clearance" },
      { type: "reject", lead: "L-0005", symbol: "SOL/USDT", from: "risk", why: "the spread is 1.20%, over 0.6%" },
      // L-0006 came and was refused between two reads: Search handed it on, Risk handed it on, the account said why — no line said it
      { type: "handoff", lead: "L-0006", symbol: "SOL/USDT", side: "buy", from: "search", to: "risk" },
      { type: "handoff", lead: "L-0006", symbol: "SOL/USDT", side: "buy", from: "risk", to: "sniper" },
      { type: "say", role: "account", text: "L-0006: the door refused the entry — over the trading limit", raw: "L-0006: the door refused the entry — over the trading limit", kind: "refusal" },
    ]);
    // a lead Search has just made, still waiting for Risk, is only said: nothing has moved yet
    expect(reads(base([], []), base([lead("L-0005", "scanned")], [msg(20, "search", "lead", "LEAD L-0005 …", { lead: "L-0005" })]))[1]).toEqual([{ type: "say", role: "search", text: "LEAD L-0005 …", raw: "LEAD L-0005 …", kind: "lead" }]);
  });

  it("closes a lead with the page's word for why — take-profit, stop, time, liquidation (from Watch), the Exit's own reason — and its result", () => {
    const held = (id: string) => lead(id, "executed", { entry: { price: 150, qty: 1, at: iso(NOW - MIN) } });
    const shut = (id: string, why: string, pnl: number) => lead(id, "closed", { exitWhy: why, pnlUsd: pnl, sizeUsd: 150, entry: { price: 150, qty: 1, at: iso(NOW - MIN) }, exit: { price: 151, at: iso(NOW) } });
    const ids = ["L-0011", "L-0012", "L-0013", "L-0014", "L-0015", "L-0016"];
    const whys = ["TP HIT at 152.25 (+1.50%)", "stop at 148.8 (-0.80%)", "time limit: 12 h open (+0.10%)", "liquidation 2.1% away at 146", "the thesis is gone: volume fell (Exit)", "closed"];
    const events = reads(base(ids.map(held), []), base(ids.map((id, i) => shut(id, whys[i]!, i === 0 ? 2.25 : -1)), [msg(30, "exit", "exit", "L-0011 closed: TP HIT at 152.25 (+1.50%) · 1 SOL/USDT at 152.25 · $2.25 (+1.50% on $150.00)", { lead: "L-0011" })]))[1]!;
    const exits = events.filter((e) => e.type === "exit");
    expect(exits.map((e) => e.why)).toEqual(["tp", "stop", "time", "liq", "brain", "other"]);
    expect(exits[0]).toEqual({ type: "exit", lead: "L-0011", symbol: "SOL/USDT", why: "tp", pnlUsd: 2.25 });
    // the close went out first: a sell from the Exit (the liquidation's from Watch), placed at once — this read said no card
    const orders = events.filter((e) => e.type === "order");
    expect(orders.map((e) => [e.lead, e.side, e.role])).toEqual(ids.map((id) => [id, "sell", id === "L-0014" ? "watch" : "exit"]));
    // and the take-profit's packets come right after the Exit's line about it
    expect(events.slice(0, 3).map((e) => e.type)).toEqual(["say", "order", "exit"]);
  });

  it("says an entry waiting for the owner, or a close waiting on a card, as waiting; an approval is the Sniper's order", () => {
    const [, wait, approved, closing] = reads(
      base([lead("L-0020", "cleared"), lead("L-0021", "executed", { entry: { price: 10, qty: 1, at: iso(NOW) } })], []),
      base([lead("L-0020", "confirmed", { sizeUsd: 50 }), lead("L-0021", "executed", { entry: { price: 10, qty: 1, at: iso(NOW) } })], [msg(40, "sniper", "card", "L-0020: buy $50.00 of SOL/USDT waits for you on card-0007 (Guard).", { lead: "L-0020" })]),
      base([lead("L-0020", "executed", { sizeUsd: 50, entry: { price: 150, qty: 0.33, at: iso(NOW) } }), lead("L-0021", "executed", { entry: { price: 10, qty: 1, at: iso(NOW) } })], [msg(41, "you", "order", "You approved card-0007: L-0020 filled at 150.", { lead: "L-0020" })]),
      base([lead("L-0020", "executed", { sizeUsd: 50, entry: { price: 150, qty: 0.33, at: iso(NOW) } }), lead("L-0021", "closing", { exitWhy: "stop at 9.9 (-1.00%)", entry: { price: 10, qty: 1, at: iso(NOW) } })], [msg(42, "exit", "card", "L-0021: stop at 9.9 (-1.00%) — the close waits for you on card-0008 (Guard).", { lead: "L-0021" })]),
    );
    expect(wait).toEqual([{ type: "handoff", lead: "L-0020", symbol: "SOL/USDT", side: "buy", from: "risk", to: "sniper" }, { type: "say", role: "sniper", text: "L-0020: buy $50.00 of SOL/USDT waits for you on card-0007 (Guard).", raw: "L-0020: buy $50.00 of SOL/USDT waits for you on card-0007 (Guard).", kind: "card" }, { type: "card", lead: "L-0020", symbol: "SOL/USDT", role: "sniper" }]);
    expect(approved).toEqual([{ type: "say", role: "you", text: "You approved card-0007: L-0020 filled at 150.", raw: "You approved card-0007: L-0020 filled at 150.", kind: "order" }, { type: "order", lead: "L-0020", symbol: "SOL/USDT", side: "buy", usd: 50, role: "sniper" }, { type: "fill", lead: "L-0020", symbol: "SOL/USDT", side: "buy", price: 150, qty: 0.33 }]);
    expect(closing).toEqual([{ type: "say", role: "exit", text: "L-0021: stop at 9.9 (−1.00%) — the close waits for you on card-0008 (Guard).", raw: "L-0021: stop at 9.9 (-1.00%) — the close waits for you on card-0008 (Guard).", kind: "card" }, { type: "card", lead: "L-0021", symbol: "SOL/USDT", role: "exit" }]);
  });

  it("halts once for a new halt, ends a role's thinking when its call ends, and never says a line twice", () => {
    const halted = { ...feed().session, state: "halted", halted: { at: iso(NOW), why: "the day's loss reached -5% ($500.00)", until: iso(NOW + 9 * 3_600_000) } };
    const [, one, two, three] = reads(
      base([], [msg(50, "head", "cycle", "Cycle 14 …")], { working: { role: "risk", what: "clear", since: iso(NOW) }, inFlight: 1 }),
      base([], [msg(50, "head", "cycle", "Cycle 14 …"), msg(51, "head", "halt", "HALT: the day's loss reached -5% ($500.00). No new lead until 00:00; open leads keep their plan.")], { session: halted, working: null, inFlight: 0 }),
      base([], [msg(51, "head", "halt", "HALT: …")], { session: halted }),
      base([], [msg(52, "risk", "note", "No decision: the answer ran past its token limit")], { session: halted, working: { role: "risk", what: "clear", since: iso(NOW) }, inFlight: 0 }),
    );
    expect(one).toEqual([{ type: "think", role: "risk", on: false }, { type: "say", role: "head", text: "HALT: the day's loss reached −5% ($500.00). No new lead until 00:00; open leads keep their plan.", raw: "HALT: the day's loss reached -5% ($500.00). No new lead until 00:00; open leads keep their plan.", kind: "halt" }, { type: "halt", why: "the day's loss reached -5% ($500.00)" }]);
    expect(two).toEqual([]);
    // working without a brain call under way is a mechanical step, not thinking: no think event
    expect(three).toEqual([{ type: "say", role: "risk", text: "No decision: the answer ran past its token limit", raw: "No decision: the answer ran past its token limit", kind: "note" }]);
  });

  it("after a gap replays nothing: the desk is drawn as it is now", () => {
    const p2 = page();
    p2.set("A", ACCOUNT);
    p2.run('ROUTE.tab = "superagent"');
    let answer: unknown = base([lead("L-0030", "scanned")], [msg(60, "search", "lead", "LEAD L-0030 …", { lead: "L-0030" })]);
    p2.sandbox.fetch = async () => ({ status: 200, json: async () => answer });
    p2.run("var PUSHED = []; sgAgain = (events) => PUSHED.push(...events)");
    return (async () => {
      await p2.run("sgRead()");
      expect(p2.out("PUSHED")).toEqual([]);
      // a minute later: the lead went all the way to closed, and nothing of it is replayed
      p2.run(`SG.feedAt = Date.now() - 60_000`);
      answer = base([lead("L-0030", "closed", { exitWhy: "TP HIT at 1", pnlUsd: 1 })], [msg(61, "exit", "exit", "L-0030 closed …", { lead: "L-0030" })]);
      await p2.run("sgRead()");
      expect(p2.out("PUSHED")).toEqual([]);
      // the room still has the line: the stream and the cards say it
      expect(p2.out("SG.room.map((m) => m.seq)")).toEqual([60, 61]);
      expect(p2.out("SG.seq")).toBe(61);
    })();
  });
});

// ---- the cards ------------------------------------------------------------------------------------------------------------------------------

describe("the eight cards, from a feed", () => {
  const p = page();
  p.set("A", ACCOUNT);
  const cards = () => p.out<Array<Record<string, any>>>(`sgCards(${JSON.stringify(feed())}, ${JSON.stringify(VIEW)}, ${JSON.stringify(CATALOG)}, ${JSON.stringify(feed().room)}, ${NOW})`); // eslint-disable-line @typescript-eslint/no-explicit-any

  it("gives each seat its real number and the words for it", () => {
    const by = Object.fromEntries(cards().map((c) => [c.role, c]));
    expect(cards().map((c) => c.role)).toEqual(["head", "search", "risk", "sniper", "exit", "watch", "flow", "sentiment"]);
    // the Head runs the day: what it made and the room left before the day's loss line (5% of $10,000), not the cycle the header says —
    // "loss room" said once, the figure with its words
    expect(by.head.metric).toMatchObject({ text: "today +$4.10", word: "$487.50 of the day's loss room left" });
    expect(by.head.metric.bar).toBeCloseTo(487.5 / 500, 6);
    // "scanned" said once, for what it is: the markets the last scan looked at
    expect(by.search.metric).toMatchObject({ text: "40 markets looked at · 2 picked", bar: 2 / 40, word: "the last scan" });
    expect(by.risk.metric).toMatchObject({ text: "4 cleared · 5 rejected", word: "44% cleared" });
    expect(by.sniper.metric).toMatchObject({ text: "last fill 0.6667 SOL at 150", bar: 0.7, word: "$1,400.00 left of $2,000.00" });
    expect(by.exit.metric).toMatchObject({ text: "1 open · 2 won · 1 lost", word: "67% won" });
    // the stop of L-0003: 150 × (1 − 0.8%) = 148.8; the mark 149.5 is 0.47% above it
    expect(by.watch.metric).toMatchObject({ text: "1 mark · nearest stop −0.47%", word: "room to the stop" });
    expect(by.watch.metric.bar).toBeCloseTo(((149.5 - 148.8) / 149.5) * 100 / 0.8, 6);
    // an empty seat has no number: its card says why, once (sgCardSaidHtml)
    expect(by.flow.metric).toEqual({ text: "", bar: null, word: "", none: true });
    expect(by.sentiment.metric.none).toBe(true);
    expect(p.run("sgMetricHtml({ text: '', bar: null, word: '', none: true })")).toBe("");
    // each seat's duty in one line; the full charter stays the catalog's own
    expect([by.risk.duty, by.flow.duty]).toEqual(["Clears a lead: size, take-profit, stop", "Large and informed money — needs a feed"]);
  });

  it("says each seat's standing: thinking while its brain call is under way, its key's standing, empty — and its latest line, from the brain or not", () => {
    const by = Object.fromEntries(cards().map((c) => [c.role, c]));
    expect([by.search.status, by.search.word, by.search.doing]).toEqual(["thinking", "thinking", "scanning the venue's markets"]);
    expect([by.head.status, by.watch.status, by.watch.word, by.flow.status, by.flow.word]).toEqual(["ready", "not let in", "not let in", "empty", "empty"]);
    // the line said for people, the room's own beside it
    expect(by.search.line).toMatchObject({ seq: 10, brain: true, kind: "lead", lead: "L-0003", text: "L-0003 · long SOL/USDT — volume is up. Confidence 71%. Passed to Risk.", raw: "LEAD L-0003 | SOL/USDT | long | volume is up | confidence 0.71 → RISK" });
    expect(by.sniper.line).toMatchObject({ seq: 12, brain: false });
    expect(by.head.line).toBeNull();
    expect(by.search.think).toEqual({ ms: 2400, ok: true });
    expect(by.risk.owns).toBe(OWNS("risk"));
    // what is drawn under each line
    expect(p.run(`sgCardSaidHtml(${JSON.stringify(by.search)})`)).toContain('<span class="sg-btag">brain</span>');
    expect(p.run(`sgCardSaidHtml(${JSON.stringify(by.search)})`)).toContain("scanning the venue&#39;s markets");
    expect(p.run(`sgCardSaidHtml(${JSON.stringify(by.head)})`)).toContain("Nothing said yet.");
    // an empty seat: its light says empty, one sentence says why — once
    expect(by.flow.empty).toBe(`Empty seat — an outside agent can take it: it ${FLOW_WHY}.`);
    expect(p.run(`sgCardSaidHtml(${JSON.stringify(by.flow)})`)).toBe(`<span class="sg-empty-w">An outside agent can take it: it ${FLOW_WHY}.</span>`);
    // a seat's line that is a card waiting for the owner offers the way to answer it; a brain call faster than 0.1 s is said so
    expect(p.run(`sgCardSaidHtml(${JSON.stringify(by.sniper)}, true)`)).toContain('<button type="button" class="sg-link" data-sg-act="answer" data-fk="sg:answer">Answer ›</button>');
    expect(p.run(`sgCardSaidHtml(${JSON.stringify({ ...by.head, think: { ms: 40, ok: true } })})`)).toContain("last brain call under 0.1 s");
    // every word escaped
    expect(p.run(`sgMetricHtml({ text: "<b>x</b>", bar: null, word: "<i>" })`)).toBe('<span class="sg-m-t tab-nums">&lt;b&gt;x&lt;/b&gt;</span><span class="sg-m-w">&lt;i&gt;</span>');
  });

  it("types a card's new line once, whole under no frames, and never again for the same line", () => {
    p.run('ROUTE.tab = "superagent"; var CARD = fakeEl("card"); var C = { role: "search", line: { seq: 10, text: "LEAD L-0003 | SOL/USDT", raw: "LEAD L-0003 | SOL/USDT", brain: true }, empty: "" }');
    p.run("sgTypeLine(CARD, C)");
    expect(p.out('CARD.querySelector("[data-sg-line]").hidden')).toBe(false);
    expect(p.out('CARD.querySelector("[data-sg-line]").querySelector("[data-sg-txt]").textContent')).toBe("LEAD L-0003 | SOL/USDT");
    p.run('CARD.querySelector("[data-sg-line]").querySelector("[data-sg-txt]").textContent = "kept"; sgTypeLine(CARD, C)');
    expect(p.out('CARD.querySelector("[data-sg-line]").querySelector("[data-sg-txt]").textContent')).toBe("kept");
    p.run("sgTypeLine(CARD, { role: 'search', line: null, empty: '' })");
    expect(p.out('CARD.querySelector("[data-sg-line]").hidden')).toBe(true);
  });
});

// ---- the setup ---------------------------------------------------------------------------------------------------------------------------

describe("the setup: what Start the superagent signs, in order", () => {
  const FIELDS = { venue: "paper-1", text: "Small, quick entries on the most traded coins", targetPct: "3", maxRiskPct: "1", maxDailyLossPct: "5", hours: "22", everyMin: "5", maxOpen: "3", provider: "claude", "model-claude": "claude-opus-5-5", effort: "medium" };
  const p = page();
  p.set("A", ACCOUNT);
  p.set("SG.catalog", CATALOG);
  const UNTIL = NOW + 30 * 86_400_000;

  it("lets in each house seat, gives each trading seat a limit at the paper account, hires the desk, turns autonomy on — exactly these fields", () => {
    const steps = p.out<Array<{ say: string; draft: Record<string, unknown> }>>(`sgSetupSteps(${JSON.stringify(FIELDS)}, SG.catalog, sgPaperVenues().find((v) => v.id === "paper-1"), sgBrainOf(${JSON.stringify(FIELDS)}, SG.catalog), ${NOW})`);
    expect(steps.map((s) => s.say)).toEqual(["Let in Desk Head", "Let in Desk Search", "Let in Desk Risk", "Let in Desk Sniper", "Let in Desk Exit", "Let in Desk Watch", "Sniper's trading limit", "Exit's trading limit", "Watch's trading limit", "Hire the desk, autonomy on paper"]);
    expect(steps.slice(0, 6).map((s) => s.draft)).toEqual(["Head", "Search", "Risk", "Sniper", "Exit", "Watch"].map((n, i) => ({ type: "approveAgent", agentAddress: addr(i + 1), agentName: `Desk ${n}`, validUntil: UNTIL })));
    // an entry: 1% of the paper account's $10,000; per order, that with room for a close of a lead that gained (SG_CLOSE_ROOM: $150 — the
    // per-order cap still holds a close on a renewing limit); twenty entries a day, the budget renewing every 24 hours (renewHours, signed:
    // the session no longer stops after its twentieth order, and a close counts against none of it); the window 0 — on a trade limit a
    // window allows one order per window at each venue (account/state.ts covers), so a day's window would let the Sniper enter once a day
    expect(steps.slice(6, 9).map((s) => s.draft)).toEqual([4, 5, 6].map((n) => ({ type: "approveSpend", agent: addr(n), scope: "trade", allow: "paper-1", perPayment: "150", budget: "2000", windowHours: 0, validUntil: UNTIL, renewHours: 24 })));
    const hire = steps[9]!.draft;
    expect({ ...hire, value: JSON.parse(String(hire.value)) }).toEqual({ type: "setDesk", desk: "desk", change: "hire", value: { name: "Paper desk", objective: { text: FIELDS.text, venue: "paper-1", universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 5, reportAt: "21:00", maxOpen: 3 }, brain: { provider: "claude", model: "claude-opus-5-5", effort: "medium" }, roles: ["head", "search", "risk", "sniper", "exit", "watch"].map((role) => ({ role, kind: "house" })), autonomy: { paper: true } } });
    // the autonomy rides in the hire: no eleventh signature, no moment when the desk is hired without it
    expect(steps).toHaveLength(10);
  });

  it("says beside the button exactly what will happen, with the numbers the form holds now", () => {
    const words = p.run<string>(`sgSetupWords(${JSON.stringify(FIELDS)}, SG.catalog, sgPaperVenues()[0], sgBrainOf(${JSON.stringify(FIELDS)}, SG.catalog))`);
    expect(words).toContain("Starting signs 10 things, one after another: 6 house seats let in (Head of desk, Search, Risk, Sniper, Exit, Watch)");
    // the words say what is signed: the per-order cap holds entries too (a later session of an account that grew sizes them up to it), so
    // the entry is said as the desk sizes it — the risk per lead of a session's start, today's figure beside it — never as a cap of its own
    expect(words).toContain("a trading limit for Sniper, Exit, Watch at Paper account — entries sized at 1% of what the paper account holds when a session starts ($100.00 now), any one order up to $150.00 so a lead that gained can still be closed, and $2,000.00 of entries a day (about 20 at today's size), counted afresh every 24 hours (a close counts against none of it), for 30 days");
    expect(words).not.toContain("entries of up to");
    expect(words).toContain("placed at once, without a card for you — paper money — each inside its seat's limit");
    expect(words).toContain("The brain's calls (Claude · Opus 5.5) are billed to your key.");
    expect(words).toContain("You can pause or end it at any time, or turn it back to cards: its orders then wait for you on this page, in the Waits for you strip, and under Portfolio.");
    // 2% of risk: $200 an entry, $4,000 in all, $300 an order
    expect(p.run(`sgSetupWords(${JSON.stringify({ ...FIELDS, maxRiskPct: "2" })}, SG.catalog, sgPaperVenues()[0], sgBrainOf(${JSON.stringify(FIELDS)}, SG.catalog))`)).toContain("entries sized at 2% of what the paper account holds when a session starts ($200.00 now), any one order up to $300.00 so a lead that gained can still be closed, and $4,000.00 of entries a day (about 20 at today's size), counted afresh every 24 hours");
  });

  it("refuses what it cannot sign, in a sentence: no paper account, a real one, no words, a number at zero", () => {
    const steps = (f: Record<string, string>, venue: string) => p.run(`sgSetupSteps(${JSON.stringify(f)}, SG.catalog, ${venue}, sgBrainOf(${JSON.stringify(f)}, SG.catalog), ${NOW})`);
    expect(steps(FIELDS, "undefined")).toBe("Pick a paper account, or open one: the superagent trades paper money only.");
    expect(steps(FIELDS, JSON.stringify(REAL))).toBe("OKX is not a paper account: the superagent trades paper money only.");
    expect(steps({ ...FIELDS, text: " " }, "sgPaperVenues()[0]")).toBe("Say what the superagent is for, in a sentence.");
    expect(steps({ ...FIELDS, everyMin: "0" }, "sgPaperVenues()[0]")).toBe("Every number is more than zero.");
    // a number the desk would clamp is refused in words, with its range: the catalog's bounds, the desk's own where the catalog gives none
    expect(steps({ ...FIELDS, hours: "1000" }, "sgPaperVenues()[0]")).toBe("A session is 1 to 336 hours, not 1000.");
    expect(steps({ ...FIELDS, everyMin: "0.5" }, "sgPaperVenues()[0]")).toBe("A cycle comes every 1 to 240 minutes, not 0.5.");
    expect(steps({ ...FIELDS, maxOpen: "12" }, "sgPaperVenues()[0]")).toBe("1 to 10 leads may be open at once, not 12.");
    expect(p.run(`sgSetupSteps(${JSON.stringify({ ...FIELDS, targetPct: "40" })}, ${JSON.stringify({ ...CATALOG, bounds: { ...CATALOG_BOUNDS, targetPct: [0.1, 25] } })}, sgPaperVenues()[0], sgBrainOf(${JSON.stringify(FIELDS)}, SG.catalog), ${NOW})`)).toBe("The week's target is 0.1% to 25%, not 40.");
    // only the account's paper accounts are offered: OKX is real money
    expect(p.out("sgPaperVenues().map((v) => v.id)")).toEqual(["paper-1"]);
  });

  it("signs them one after another through the owner's key, and stops at the first refusal with the account's words", async () => {
    p.run(`var ACTS = []; Owner = { role: "owner", act: async (d) => { ACTS.push(d); return ACTS.length === 3 ? { status: 409, body: { ok: false, refusal: { message: "this key is already let in" } } } : { status: 200, body: { ok: true } }; }, why: (r) => r.body.refusal && r.body.refusal.message }`);
    p.run(`var SAID = []; var STEPS = sgSetupSteps(${JSON.stringify(FIELDS)}, SG.catalog, sgPaperVenues()[0], sgBrainOf(${JSON.stringify(FIELDS)}, SG.catalog), ${NOW})`);
    const out = await p.run<Promise<unknown>>("sgRun(STEPS, (t, s) => SAID.push([t, s]))");
    expect(JSON.parse(JSON.stringify(out))).toEqual({ ok: false, at: 2, why: "Let in Desk Risk: this key is already let in", reason: "this key is already let in", noAnswer: false });
    expect(p.out("ACTS.map((d) => d.type)")).toEqual(["approveAgent", "approveAgent", "approveAgent"]);
    expect(p.out("SAID.map(([t]) => t)")).toEqual(["1 of 10 · Let in Desk Head…", "2 of 10 · Let in Desk Search…", "3 of 10 · Let in Desk Risk…"]);
  });

  it("starts from the form: the owner's button signs all ten, the last one hiring the desk with its autonomy, then reads the account again", async () => {
    p.run('var ACTS = []; Owner = { role: "owner", act: async (d) => (ACTS.push(d), { status: 200, body: { ok: true } }), why: () => "" }; var LOADS = 0; load = async () => { LOADS++; }');
    p.run(`var MSG = { className: "", textContent: "" }; var BTN = { disabled: false }; var FORM = { values: ${JSON.stringify(FIELDS)}, querySelector: (s) => (s === "[data-sg-msg]" ? MSG : s === "button[type=submit]" ? BTN : null) }`);
    await p.run("sgStart(FORM)");
    expect(p.out("ACTS.map((d) => d.change || d.type)")).toEqual(["approveAgent", "approveAgent", "approveAgent", "approveAgent", "approveAgent", "approveAgent", "approveSpend", "approveSpend", "approveSpend", "hire"]);
    expect(p.out("[MSG.textContent, BTN.disabled, busy, LOADS]")).toEqual(["Started.", false, false, 1]);
    // the line under the header for a minute: what was done, in words
    expect(p.out("SG.started")).toMatchObject({ text: "Started: 6 seats let in, their limits signed, autonomy on paper.", tone: "ok" });
    // the first cycle said from the feed: within seconds until the desk has run one, nothing about it after (the desk runs it seconds after
    // the hire: a countdown "to its first cycle" would be false most of the minute)
    const note = (cycles: number) => p.run<string>(`sgNoteHtml(${JSON.stringify(feed({ session: { ...feed().session, cycles } }))}, null, true, Date.now())`);
    expect(note(0)).toBe('<span class="sg-ok-t">Started: 6 seats let in, their limits signed, autonomy on paper. The first cycle starts within seconds.</span>');
    expect(note(1)).toBe('<span class="sg-ok-t">Started: 6 seats let in, their limits signed, autonomy on paper.</span>');
    // a browser that only looks signs nothing
    p.run('ACTS = []; Owner.role = "pending"');
    await p.run("sgStart(FORM)");
    expect(p.out("ACTS")).toEqual([]);
  });

  it("says a refusal midway as how far it got, the step, the account's words and what to do — and the account not answering as only that", async () => {
    p.run('var LOADS = 0; load = async () => { LOADS++; throw new Error("Failed to fetch"); }; Owner = { role: "owner", act: async (d) => (d.type === "approveSpend" ? { status: 0, body: { ok: false, error: "Failed to fetch" } } : { status: 200, body: { ok: true } }), why: () => "" }');
    p.run(`var MSG = { className: "", textContent: "" }; var BTN = { disabled: false }; var FORM = { values: ${JSON.stringify(FIELDS)}, querySelector: (s) => (s === "[data-sg-msg]" ? MSG : s === "button[type=submit]" ? BTN : null) }`);
    // a load that throws after a refusal is caught: no "Uncaught (in promise)"
    await p.run("sgStart(FORM)");
    expect(p.run<string>("MSG.textContent")).toBe("6 of 10 signed (Let in Desk Head, Let in Desk Search, Let in Desk Risk, Let in Desk Sniper, Let in Desk Exit, Let in Desk Watch). Sniper's trading limit: the account did not answer. Try again when the account answers: what is signed stands, and signing it again does no harm.");
    expect(p.run<string>("MSG.textContent")).not.toContain("Failed to fetch");
    // a refusal in the account's words: its full stop not doubled
    expect(p.run<string>(`sgRefusedWords({ at: 0, reason: "this key was revoked once." }, [{ say: "Let in Desk Head" }, { say: "Hire the desk" }], "Start again.")`)).toBe("0 of 2 signed. Let in Desk Head: this key was revoked once. Start again.");
  });

  it("moves a desk on a real venue to paper only with no lead open: a seat whose key is not let in let in again, each trading seat's limit there, the objective's venue, autonomy", () => {
    const real = { ...VIEW, objective: { ...VIEW.objective, venue: "okx" } };
    expect(p.run(`sgMoveSteps(${JSON.stringify(real)}, SG.catalog, sgPaperVenues()[0], ${NOW})`)).toBe("The desk has 1 lead open: it moves only with none open. Close them on the Agents pane first.");
    // Watch's key is not let in (VIEW): the account grants a trading limit only to a key authorised now, so it is let in again first
    const steps = p.out<Array<{ say: string; draft: Record<string, unknown> }>>(`sgMoveSteps(${JSON.stringify({ ...real, open: [] })}, SG.catalog, sgPaperVenues()[0], ${NOW})`);
    expect(steps.map((s) => s.say)).toEqual(["Let in Desk Watch", "Sniper's trading limit at Paper account", "Exit's trading limit at Paper account", "Watch's trading limit at Paper account", "Move the desk to Paper account", "Autonomy on paper"]);
    expect(steps[0]!.draft).toEqual({ type: "approveAgent", agentAddress: addr(6), agentName: "Desk Watch", validUntil: UNTIL });
    expect(steps[1]!.draft).toEqual({ type: "approveSpend", agent: addr(4), scope: "trade", allow: "paper-1", perPayment: "150", budget: "2000", windowHours: 0, validUntil: UNTIL, renewHours: 24 });
    expect(JSON.parse(String(steps[4]!.draft.value))).toEqual({ ...VIEW.objective, venue: "paper-1", hours: undefined });
    // an expired key is let in again too; every key ok: nothing to let in
    const lapsed = { ...real, open: [], seats: VIEW.seats.map((s) => (s.role === "sniper" ? { ...s, status: "expired" } : s.role === "watch" ? { ...s, status: "ok" } : s)) };
    expect(p.out<Array<{ say: string }>>(`sgMoveSteps(${JSON.stringify(lapsed)}, SG.catalog, sgPaperVenues()[0], ${NOW})`).map((s) => s.say)[0]).toBe("Let in Desk Sniper");
    const fine = { ...real, open: [], seats: VIEW.seats.map((s) => ({ ...s, status: "ok" })) };
    expect(p.out<Array<{ draft: { type: string } }>>(`sgMoveSteps(${JSON.stringify(fine)}, SG.catalog, sgPaperVenues()[0], ${NOW})`).map((s) => s.draft.type)).toEqual(["approveSpend", "approveSpend", "approveSpend", "setDesk", "setDesk"]);
    // a revoked key is never let in again (account/state.ts tombstones): said, nothing signed
    const revoked = { ...real, open: [], seats: VIEW.seats.map((s) => (s.role === "exit" ? { ...s, status: "revoked" } : s)) };
    expect(p.run(`sgMoveSteps(${JSON.stringify(revoked)}, SG.catalog, sgPaperVenues()[0], ${NOW})`)).toBe("Exit's key was revoked, and a revoked key is never let in again: hire the seat again from the Agents pane first.");
  });

  it("a desk whose seats' limits do not renew (hired before they did) is said so, and one step list renews them — the setup's own limit, signed; a renewing limit says when it renews", async () => {
    // VIEW is such a desk: the Sniper's limit signed without renewHours, the Exit with none, Watch's key not let in
    expect(p.out<Array<{ role: string }>>(`sgUnrenewed(${JSON.stringify(VIEW)}, SG.catalog)`).map((s) => s.role)).toEqual(["sniper", "exit", "watch"]);
    const steps = p.out<Array<{ say: string; draft: Record<string, unknown> }>>(`sgRenewSteps(${JSON.stringify(VIEW)}, SG.catalog, sgPaperVenues()[0], ${NOW})`);
    expect(steps.map((s) => s.say)).toEqual(["Let in Desk Watch", "Sniper's trading limit, renewing", "Exit's trading limit, renewing", "Watch's trading limit, renewing"]);
    expect(steps[0]!.draft).toEqual({ type: "approveAgent", agentAddress: addr(6), agentName: "Desk Watch", validUntil: UNTIL });
    // exactly what the setup signs (sgSetupSteps): $150 an order, $2,000 of entries a day, renewing every 24 hours
    expect(steps.slice(1).map((s) => s.draft)).toEqual([4, 5, 6].map((n) => ({ type: "approveSpend", agent: addr(n), scope: "trade", allow: "paper-1", perPayment: "150", budget: "2000", windowHours: 0, validUntil: UNTIL, renewHours: 24 })));
    const words = p.run<string>(`sgRenewWords(${JSON.stringify(VIEW)}, SG.catalog, sgPaperVenues()[0])`);
    expect(words).toContain("Renewing signs a trading limit for Sniper, Exit, Watch at Paper account that renews — entries sized at 1% of what the paper account holds when a session starts ($100.00 now), any one order up to $150.00");
    expect(words).toContain("a seat whose key is not let in now is let in again first.");
    // a desk whose trading seats all renew: nothing to renew, nothing said
    const renewing = { perOrderUsd: 150, leftUsd: 1_850, budgetUsd: 2_000, venues: ["paper-1"], renewHours: 24, renewsAt: iso(NOW + 6 * 3_600_000) };
    const fresh = { ...VIEW, seats: VIEW.seats.map((s) => (["sniper", "exit", "watch"].includes(s.role) ? { ...s, status: "ok", limit: renewing } : s)) };
    expect(p.out(`sgUnrenewed(${JSON.stringify(fresh)}, SG.catalog)`)).toEqual([]);
    expect(p.run(`sgRenewSteps(${JSON.stringify(fresh)}, SG.catalog, sgPaperVenues()[0], ${NOW})`)).toBe("Every trading seat's limit renews already.");
    // a revoked key, or a venue not read as paper: the sentence, nothing signed
    expect(p.run(`sgRenewSteps(${JSON.stringify({ ...VIEW, seats: VIEW.seats.map((s) => (s.role === "exit" ? { ...s, status: "revoked" } : s)) })}, SG.catalog, sgPaperVenues()[0], ${NOW})`)).toBe("Exit's key was revoked, and a revoked key is never let in again: hire the seat again from the Agents pane first.");
    expect(p.run(`sgRenewSteps(${JSON.stringify(VIEW)}, SG.catalog, ${JSON.stringify(REAL)}, ${NOW})`)).toBe("The desk's venue is not read as a paper account now: its seats' limits renew at a paper account only.");
    // the line under the header: said at a paper account, the button for the owner only; nothing said once every limit renews
    p.run("SG.started = null; SG.params = {}");
    const note = (v: unknown, owner: boolean) => p.run<string>(`sgNoteHtml(${JSON.stringify(feed())}, ${JSON.stringify(v)}, ${owner}, Date.now())`);
    // the Sniper's limit does not renew; Exit and Watch have none at all (feat/paper-live phase 4: a seat whose limit ran out is said as
    // having none, not as one that does not renew) — the one button renews every such seat
    expect(note(VIEW, true)).toBe(`<span class="sg-warn-t">The seats' trading limits do not renew: once a budget is spent, that seat's orders stop until a new limit is signed (Sniper). These seats have no trading limit now — none was signed, or the one signed ran out — so they place nothing (Exit, Watch). <button type="button" class="sg-link" data-sg-act="renew" data-fk="sg:renew">Renew the seats' limits…</button></span>`);
    const lapsed = { ...VIEW, seats: VIEW.seats.map((s) => (s.role === "sniper" ? { ...s, limit: undefined } : s.role === "exit" || s.role === "watch" ? { ...s, status: "ok", limit: { perOrderUsd: 150, leftUsd: 0, budgetUsd: 2_000, venues: ["paper-1"], renewHours: 24 } } : s)) };
    expect(note(lapsed, true)).toBe(`<span class="sg-warn-t">This seat has no trading limit now — none was signed, or the one signed ran out — so it places nothing (Sniper). <button type="button" class="sg-link" data-sg-act="renew" data-fk="sg:renew">Renew the seats' limits…</button></span>`);
    expect(p.out<Array<{ say: string }>>(`sgRenewSteps(${JSON.stringify(lapsed)}, SG.catalog, sgPaperVenues()[0], ${NOW})`).map((x) => x.say)).toEqual(["Sniper's trading limit, renewing"]);
    expect(note(VIEW, false)).not.toContain("data-sg-act");
    expect(note(fresh, true)).toBe("");
    // the Sniper's card says when its budget is counted afresh
    const sniper = p.out<{ word: string }>(`sgMetric("sniper", { feed: ${JSON.stringify(feed())}, view: null, seat: { kind: "house", limit: ${JSON.stringify(renewing)} }, now: ${NOW} })`);
    expect(sniper.word).toBe("$1,850.00 left of $2,000.00 · renews 17:00 New York");
    // the owner's button: a yes on the words, then each step signed through the owner's key, the account read again
    p.run('var ACTS = []; Owner = { role: "owner", act: async (d) => (ACTS.push(d), { status: 200, body: { ok: true } }), why: () => "" }; var LOADS = 0; load = async () => { LOADS++; }; var ASKED = []; confirmSheet = async (t, o) => (ASKED.push([t, o.title]), true)');
    p.run(`SG.view = ${JSON.stringify(VIEW)}`);
    expect(await p.run<Promise<boolean>>("sgRenew()")).toBe(true);
    expect(p.out("ACTS.map((d) => d.type)")).toEqual(["approveAgent", "approveSpend", "approveSpend", "approveSpend"]);
    expect(p.out("ACTS.slice(1).map((d) => d.renewHours)")).toEqual([24, 24, 24]);
    expect(p.out<Array<[string, string]>>("ASKED").map(([, t]) => t)).toEqual(["Renew the seats' limits"]);
    expect(p.out("[LOADS, busy]")).toEqual([1, false]);
    expect(p.out("SG.started")).toMatchObject({ text: "Renewed: 3 trading limits now counted afresh every 24 hours.", tone: "ok" });
    // a no signs nothing
    p.run("ACTS = []; confirmSheet = async () => false");
    expect(await p.run<Promise<boolean>>("sgRenew()")).toBe(false);
    expect(p.out("ACTS")).toEqual([]);
    p.run("SG.view = null; SG.started = null");
  });
});

// ---- the controls ----------------------------------------------------------------------------------------------------------------------------

describe("the owner's controls", () => {
  const p = page();
  p.set("A", ACCOUNT);

  it("drafts each as the desk takes it: pause, resume, cycle, end, autonomy on and off — and a new session with its autonomy, in one", () => {
    expect(p.out('["pause", "resume", "cycle", "end"].map((a) => sgControlDraft(a))')).toEqual(["pause", "resume", "cycle", "end"].map((change) => ({ type: "setDesk", desk: "desk", change, value: "" })));
    expect(p.out("[sgControlDraft('autonomy', true), sgControlDraft('autonomy', false), sgControlDraft('nothing')]")).toEqual([{ type: "setDesk", desk: "desk", change: "autonomy", value: '{"paper":true}' }, { type: "setDesk", desk: "desk", change: "autonomy", value: '{"paper":false}' }, null]);
    // after the end: ONE setDesk resume whose value carries the autonomy (the desk validates it as at the hire: paper only)
    expect(p.out("sgControlDraft('resume', { autonomy: true })")).toEqual({ type: "setDesk", desk: "desk", change: "resume", value: '{"autonomy":{"paper":true}}' });
    expect(JSON.parse(p.out<{ value: string }>("sgControlDraft('resume', { autonomy: true })").value)).toEqual({ autonomy: { paper: true } });
  });

  it("offers what the session allows, and to a browser that only looks, nothing it can press", () => {
    const tools = (more: Record<string, unknown>, owner = true) => p.run<string>(`sgToolsHtml(${JSON.stringify(feed(more))}, ${owner})`);
    const live = tools({});
    expect(live).toContain('data-sg-act="pause"');
    expect(live).toContain('data-sg-act="cycle"');
    expect(live).toContain('data-sg-act="end"');
    expect(live).toContain('data-v="on" data-fk="sg:auto:on" aria-pressed="true"');
    expect(live).toContain('data-v="off" data-fk="sg:auto:off" aria-pressed="false"');
    const paused = tools({ session: { ...feed().session, state: "paused" } });
    expect(paused).toContain('data-sg-act="resume"');
    expect(paused).not.toContain('data-sg-act="cycle"');
    // ended at a paper account: started again with its autonomy, one button, one signature; at a venue not read as paper, a plain new session
    const ended = tools({ session: { ...feed().session, state: "ended" } });
    expect(ended).toContain('data-sg-act="resume" data-v="auto" data-fk="sg:run" title="A new session, its autonomy on paper: one signature">Start again · auto on paper</button>');
    expect(ended).not.toContain('data-sg-act="end"');
    const endedReal = tools({ session: { ...feed().session, state: "ended" }, venue: { id: "okx", name: "OKX", usd: 1, paper: false, connected: true }, autonomy: null });
    expect(endedReal).toContain('data-sg-act="resume" data-fk="sg:run">Start a new session</button>');
    expect(endedReal).not.toContain("auto on paper</button>");
    // the brain cannot think: Cycle now says what it would do
    expect(tools({ brain: { ok: false, why: "no key", label: "Claude", model: "claude-opus-5-5", spend: { calls: 0, usd: 0 } } })).toContain("a cycle now runs the plan&#39;s exits only");
    // a real venue: no autonomy to turn on
    expect(tools({ venue: { id: "okx", name: "OKX", usd: 1, paper: false, connected: true }, autonomy: null })).toContain('data-v="on" data-fk="sg:auto:on" aria-pressed="false" disabled title="Autonomy is for a paper account only"');
    const looking = tools({}, false);
    expect(looking.match(/<button /g)!.length).toBe(looking.match(/disabled title="This browser can look but not sign"/g)!.length);
  });

  it("signs each through own(): End and Auto on paper after a yes; an autonomy already as asked signs nothing", async () => {
    p.run(`Owner = { role: "owner" }; var DRAFTS = []; own = async (d) => { DRAFTS.push(d); }; var ASKED = []; confirmSheet = async (t, o) => (ASKED.push(o.title), true); SG.desk = ${JSON.stringify(feed({ autonomy: { paper: false, at: iso(NOW) } }))}`);
    for (const a of ["pause", "cycle", "resume", "end"]) await p.run(`sgAct("${a}", {})`);
    await p.run('sgAct("autonomy", { v: "on" })');
    await p.run('sgAct("autonomy", { v: "off" })');
    expect(p.out("DRAFTS.map((d) => [d.change, d.value])")).toEqual([["pause", ""], ["cycle", ""], ["resume", ""], ["end", ""], ["autonomy", '{"paper":true}']]);
    expect(p.out("ASKED")).toEqual(["End the session", "Auto on paper"]);
    // a no keeps it as it is
    p.run("DRAFTS = []; confirmSheet = async () => false");
    await p.run('sgAct("end", {})');
    expect(p.out("DRAFTS")).toEqual([]);
  });

  it("starts an ended session again with its autonomy in ONE signature: a yes first where the autonomy is off, none where it is on", async () => {
    const ended = (paper: boolean) => feed({ session: { ...feed().session, state: "ended" }, autonomy: { paper, at: iso(NOW) } });
    p.run(`Owner = { role: "owner" }; var DRAFTS = []; own = async (d) => { DRAFTS.push(d); }; var ASKED = []; confirmSheet = async (t, o) => (ASKED.push(o.title), true); SG.desk = ${JSON.stringify(ended(false))}`);
    await p.run('sgAct("resume", { v: "auto" })');
    expect(p.out("DRAFTS")).toEqual([{ type: "setDesk", desk: "desk", change: "resume", value: '{"autonomy":{"paper":true}}' }]);
    expect(p.out("ASKED")).toEqual(["Start again · auto on paper"]);
    // the autonomy already on: no question, the same one signature
    p.run(`DRAFTS = []; ASKED = []; SG.desk = ${JSON.stringify(ended(true))}`);
    await p.run('sgAct("resume", { v: "auto" })');
    expect(p.out("[DRAFTS.length, DRAFTS[0].value, ASKED.length]")).toEqual([1, '{"autonomy":{"paper":true}}', 0]);
    // a no signs nothing; a paused session's Resume is as it was, its value empty
    p.run(`DRAFTS = []; confirmSheet = async () => false; SG.desk = ${JSON.stringify(ended(false))}`);
    await p.run('sgAct("resume", { v: "auto" })');
    expect(p.out("DRAFTS")).toEqual([]);
    await p.run('sgAct("resume", {})');
    expect(p.out("DRAFTS")).toEqual([{ type: "setDesk", desk: "desk", change: "resume", value: "" }]);
  });
});

// ---- honesty --------------------------------------------------------------------------------------------------------------------------------

describe("honesty: empty seats say so, a brain that cannot think says why, nothing is drawn from no data", () => {
  const p = page();
  p.set("A", ACCOUNT);

  it("draws an empty seat empty and says why: outside-only seats for an agent of the owner's, a house seat not hired from the Agents pane", () => {
    const seats = p.out<Array<Record<string, unknown>>>(`sgSeats(${JSON.stringify({ ...VIEW, seats: VIEW.seats.filter((s) => s.role !== "watch") })}, ${JSON.stringify(CATALOG)})`);
    expect(seats.find((s) => s.role === "flow")).toMatchObject({ kind: "empty", status: "empty", why: `Empty seat — an outside agent can take it: it ${FLOW_WHY}.` });
    expect(seats.find((s) => s.role === "watch")).toMatchObject({ kind: "empty", why: "Empty seat — not on this desk: fill it from the Agents pane." });
    expect(p.out(`sgMetric("watch", { feed: ${JSON.stringify(feed())}, view: null, seat: ${JSON.stringify(seats.find((s) => s.role === "watch"))}, now: ${NOW} }).none`)).toBe(true);
    expect(seats.find((s) => s.role === "watch")).toMatchObject({ reason: "Not on this desk: fill it from the Agents pane." });
    // an outside agent in the seat: said as the owner's agent, by name
    const filled = p.out<Array<Record<string, unknown>>>(`sgSeats(${JSON.stringify({ ...VIEW, seats: [...VIEW.seats, { role: "flow", kind: "outside", address: addr(9), name: "Whale reader", status: "ok", cards: 0 }] })}, ${JSON.stringify(CATALOG)})`);
    expect(p.out(`sgMetric("flow", { feed: ${JSON.stringify(feed())}, view: null, seat: ${JSON.stringify(filled.find((s) => s.role === "flow"))}, now: ${NOW} }).text`)).toBe("an agent of yours · Whale reader");
    // the seats' cards say the same: the empty seats, each with its words
    const cards = p.out<Array<Record<string, string>>>(`sgCards(${JSON.stringify(feed())}, ${JSON.stringify(VIEW)}, ${JSON.stringify(CATALOG)}, [], ${NOW})`);
    expect(cards.filter((c) => c.status === "empty").map((c) => [c.role, c.word])).toEqual([["flow", "empty"], ["sentiment", "empty"]]);
  });

  it("says why the brain cannot think, wherever it is shown, and where its key goes — and starting without one makes nothing up", () => {
    const no = { ok: false, why: "the API did not accept the key", label: "Claude", model: "claude-opus-5-5", spend: { calls: 0, usd: 0 } };
    // the header: always a button, drawn as one, opening the Brains sheet — its way in written on it ("Connect a key ›" while it cannot
    // think), here a word in amber, the reason one pointer away
    const stat = p.run<string>(`sgBrainStat(${JSON.stringify(no)}, null)`);
    expect(stat).toContain('<span class="sg-warn-t" title="the API did not accept the key">Not ready</span>');
    expect(stat).toMatch(/^<button type="button" class="sg-stat sg-brain sg-no" data-sg-act="brain" data-fk="sg:brain" [^>]*><span class="sg-stat-l">Brain<\/span><span class="sg-brain-go">Connect a key ›<\/span>/);
    expect(stat).toContain('title="The AI model the desk thinks with: switch it, or paste an API key from any provider"');
    expect(stat).not.toContain('data-sg-act="fix"');
    // a brain that thinks is a button too: "Change ›", the model, the calls, the cost
    expect(p.run<string>(`sgBrainStat(${JSON.stringify(feed().brain)}, ${JSON.stringify(CATALOG)})`)).toMatch(/^<button type="button" class="sg-stat sg-brain" data-sg-act="brain"[^>]*><span class="sg-stat-l">Brain<\/span><span class="sg-brain-go">Change ›<\/span><span class="sg-stat-v tab-nums">Opus 5\.5 · 37 calls · ~\$0\.84<\/span><\/button>$/);
    // a key the API refused is never drawn as a healthy brain
    const FIX = { code: "rejected", file: "/Users/x/.account/credentials/anthropic/api-key.json", restart: false, words: "The Anthropic API refused the key in the key file: put a key it accepts there." };
    expect(p.run<string>(`sgBrainStat(${JSON.stringify({ ...no, fix: FIX })}, null)`)).toContain(">Key refused</span>");
    expect(p.run<string>(`sgBrainStat(${JSON.stringify(feed().brain)}, ${JSON.stringify(CATALOG)})`)).toContain("Opus 5.5 · 37 calls · ~$0.84");
    // a scripted brain is a script, never a model's name; an unpriced one has no cost recorded; the calls that got no answer counted as
    // what the account knows them to be — not answered (a key refused, a rate limit, an endpoint out of reach: spend.failed is all three),
    // never "refused"
    const failed = p.run<string>(`sgBrainStat({ ok: true, provider: "scripted", label: "a script", model: "claude-opus-5-5", spend: { calls: 8, usd: 0, inputTokens: 0, outputTokens: 0, failed: 2 } }, null)`);
    expect(failed).toContain("a script · 8 calls · 2 not answered · no cost recorded");
    expect(failed).not.toContain("refused");
    expect(p.out('[sgModelName("claude-opus-5-5"), sgModelName("claude-sonnet-4-5-20250929"), sgModelName("deepseek-chat")]')).toEqual(["Opus 5.5", "Sonnet 4.5", "deepseek-chat"]);
    // the fix as the account gives it: its sentence, the path with Copy, the command with Copy — never a command composed here, never a sample key
    const fix = p.run<string>(`sgFixHtml(${JSON.stringify({ ...no, fix: { ...FIX, command: "chmod 600 /Users/x/.account/credentials/anthropic/api-key.json" } })})`);
    expect(fix).toContain('<code class="sg-path">/Users/x/.account/credentials/anthropic/api-key.json</code><button type="button" class="sg-btn sg-btn-s" data-sg-copy="/Users/x/.account/credentials/anthropic/api-key.json">Copy the path</button>');
    expect(fix).toContain('data-sg-copy="chmod 600 /Users/x/.account/credentials/anthropic/api-key.json">Copy the command</button>');
    expect(fix).not.toMatch(/sk-ant|apiKey/);
    expect(p.run<string>(`sgFixHtml(${JSON.stringify({ ...no, fix: FIX })})`)).not.toContain("Copy the command");
    // Now says it — in the account's words — with the way to a brain
    const now = p.run<string>(`sgNowHtml(${JSON.stringify(feed({ brain: no }))}, null, ${JSON.stringify(CATALOG)}, ${NOW})`);
    expect(now).toContain('<p class="sg-now-big" data-tone="warn">No AI brain: it can&#39;t look for trades</p><p class="sg-now-sub">The API did not accept the key. Head, Search and Risk think with it.');
    expect(now).toContain('data-sg-act="brain" data-fk="sg:now-brain">Connect a brain</button>');
    expect(p.run<string>(`sgNowHtml(${JSON.stringify(feed({ brain: { ...no, fix: FIX } }))}, null, ${JSON.stringify(CATALOG)}, ${NOW})`)).toContain('<p class="sg-now-sub">The Anthropic API refused the key in the key file: put a key it accepts there. Head, Search');
    const none ={ ...CATALOG, brain: { ...CATALOG.brain, ok: false, why: "no key" }, brains: CATALOG.brains.map((b) => ({ ...b, ok: false, why: b.why || "no key", fix: { ...FIX, code: "no-key", words: `No key for ${b.label} yet.` } })) };
    const setup = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(none)}, sgPaperVenues(), "")`);
    // where each brain's key goes, said once, in its own block of 3 · The brain; the checklist takes a key from any provider right there
    // (ui/brains.js brPasteHtml: the account tells whose it is) — outside the setup's form, so no draft ever sweeps it up — and points to
    // the brain's own block too
    expect(setup.match(/No key for Claude yet\./g)).toHaveLength(1);
    expect(setup).toContain("Not yet for Claude. Paste a key from any provider: the account tells whose it is.");
    expect(setup).toContain('<section class="br-connect" data-br-connect="setup" aria-label="Paste an API key">');
    expect(setup).toContain('<button type="button" class="sg-btn sg-btn-p sg-btn-s" data-br-act="connect">Connect</button>');
    expect(setup).toContain("then you sign to pick its best model for the desk.");
    expect(setup).toContain('<span class="sg-dim">Or type its key under 3 · The brain, below.</span>');
    expect(setup.indexOf('data-br-connect="setup"')).toBeLessThan(setup.indexOf('<form class="sg-setup-f"'));
    // a browser that cannot sign is shown no field to paste into
    expect(p.run<string>(`sgCheckHtml(false, ${JSON.stringify(none)}, sgPaperVenues(), null, true)`)).toContain("Not yet for Claude: type its key under 3 · The brain, below.");
    expect(p.run<string>(`sgCheckHtml(false, ${JSON.stringify(none)}, sgPaperVenues(), null, true)`)).not.toContain("data-br-paste");
    // once a key is in: the key's masked tail, and the way to replace or remove it (the Brains sheet, on that brain) — no paste field then
    const keyed = { ...CATALOG, brains: CATALOG.brains.map((b) => ({ ...b, ok: true, how: "the key file credentials/brains/claude.json", tail: "…7890" })) };
    const done = p.run<string>(`sgCheckHtml(true, ${JSON.stringify(keyed)}, sgPaperVenues(), { provider: "claude" }, true)`);
    expect(done).toContain("Claude is ready, through the key file credentials/brains/claude.json · key …7890. Its calls are billed to your key.");
    expect(done).toContain('<button type="button" class="sg-link" data-sg-act="brains" data-v="claude" data-fk="sg:brains:claude">Replace or remove the key ›</button>');
    expect(done).not.toContain("data-br-paste");
    expect(p.run<string>(`sgCheckHtml(false, ${JSON.stringify(keyed)}, sgPaperVenues(), { provider: "claude" }, true)`)).not.toContain("Replace or remove the key");
    // the brain step opens the Brains sheet; each brain that is not ready has its own way there, at its own card
    expect(setup).toContain('<button type="button" class="sg-link" data-sg-act="brains" data-fk="sg:brains">Brains: add a key, pick a model ›</button>');
    expect(setup).toContain('data-sg-act="brains" data-v="openai" data-fk="sg:brains:openai">Type its key ›</button><details class="sg-fix-d"><summary>Not ready — or put the key in its key file</summary>');
    expect(setup).toContain("It can start before the brain can think: the plan's exits run, and no lead is made up until it can.");
    expect(p.run(`sgSetupWords({ maxRiskPct: "1", provider: "claude" }, ${JSON.stringify(none)}, sgPaperVenues()[0], { provider: "claude", model: "claude-opus-5-5", effort: "medium" })`)).toContain("The brain cannot think yet: see 3 · The brain. Until it can, no lead is made up, and the plan's exits still run.");
    // what each mode is, first; with no paper account, the way to open one, and the brain's fix in the checklist itself
    const bare = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(none)}, [], "")`);
    expect(bare).toContain("<b>Superagent:</b> the account's desk of six AI seats finds, sizes and places trades on a paper account by itself while you watch. <b>Regular:</b> you place your own orders.");
    expect(bare).toContain('data-sg-act="paper" data-fk="sg:paper">Open a paper account</button>');
    expect(bare.match(/No key for Claude yet\./g)).toHaveLength(1);
    // between cycles: the Exit watching what it holds, the next cycle's countdown, the lead held in a line
    const between = p.run<string>(`sgNowHtml(${JSON.stringify(feed({ working: null, inFlight: 0 }))}, null, ${JSON.stringify(CATALOG)}, ${NOW})`);
    expect(between).toContain('<p class="sg-now-big">Exit is watching 1 lead</p>');
    expect(between).toContain(">03:12</span>");
    expect(between).toContain(`<p class="sg-now-sub">−$0.33 on 0.6667 SOL long · take-profit ${p.run("sgAtDecimals(152.25, 150)")} · stop ${p.run("sgAtDecimals(148.8, 150)")}</p>`);
  });

  it("draws nothing from no data: no seat before the seats are read, no trade on the chart, no row of what it did, no position, no curve, no close", () => {
    const bare = feed({ lastScan: null, leads: [], room: [], working: null, inFlight: 0, equity: { nowUsd: 10_000, startUsd: 10_000, changeUsd: 0, changePct: 0, tail: [[NOW, 10_000]] } });
    // no lead: nothing on the chart; a lead with no fill yet (waiting for the owner, resting at the venue) has no price to stand at either
    expect(p.out(`sgChartOverlay(${JSON.stringify(bare)}, "SOL/USDT", ${NOW})`)).toEqual({ lines: [], marks: [] });
    expect(p.out(`sgChartOverlay(${JSON.stringify(feed({ leads: [lead("L-0050", "confirmed", { sizeUsd: 50 }), lead("L-0051", "executed", { sizeUsd: 60 })] }))}, "SOL/USDT", ${NOW})`)).toEqual({ lines: [], marks: [] });
    // no row made up: What it did says what will show there — or, with no brain, why nothing will
    expect(p.out(`sgDid(${JSON.stringify(bare)}, [], ${NOW})`)).toEqual([]);
    expect(p.run<string>(`sgDidHtml([], ${JSON.stringify(bare)})`)).toBe('<li class="sg-di-none">Nothing yet: each lead it buys, sells, closes or turns down shows here, with why.</li>');
    expect(p.run<string>(`sgDidHtml([], ${JSON.stringify(feed({ brain: { ok: false, why: "no key" } }))})`)).toBe('<li class="sg-di-none">Nothing yet: without a brain it finds no lead to trade.</li>');
    expect(p.run<string>(`sgPositionsHtml(${JSON.stringify(bare)})`)).toContain('<p class="sg-dim sg-pos-none">No open position.</p>');
    // no seat lit while nothing works and nothing is played, no chip, no bubble; Search's count before any scan is what the funnel found
    const relay = p.run<string>(`sgRelayHtml(${JSON.stringify(bare)}, null, ${JSON.stringify(CATALOG)}, ${NOW})`);
    expect(relay).not.toContain("data-on");
    expect(relay).not.toContain("sg-chipl");
    expect(relay).not.toContain("sg-rs-b");
    expect(relay).toContain('<span class="sg-rs-c tab-nums">9 found</span>');
    // before the desk's view is read, no card says a seat is empty or ready
    expect(p.out(`sgCards(${JSON.stringify(bare)}, null, ${JSON.stringify(CATALOG)}, [], ${NOW}).map((c) => c.status)`)).toEqual(Array(8).fill("reading"));
    expect(p.out(`sgMetric("search", { feed: ${JSON.stringify(bare)}, view: null, seat: null, now: ${NOW} })`)).toEqual({ text: "no scan yet", bar: null, word: "" });
    expect(p.out(`sgMetric("sniper", { feed: ${JSON.stringify(bare)}, view: null, seat: null, now: ${NOW} })`)).toEqual({ text: "no fill yet", bar: null, word: "" });
    const bal = p.run<string>(`sgBalanceHtml(${JSON.stringify(bare)}, null, null, ${NOW})`);
    expect(bal).toContain("The curve draws as the session runs");
    expect(bal).toContain("No close yet: the first lead the Exit closes draws the first bar.");
    expect(bal).not.toContain("<svg");
    expect(bal).not.toContain("live");
    // nothing to chart: no market picked for the page (this venue is not the account's own paper account, so no first market either)
    expect(p.out(`sgFocus(${JSON.stringify(bare)})`)).toBeNull();
    expect(p.out(`sgChartMarket(${JSON.stringify(bare)})`)).toBeNull();
    expect(p.out(`sgFocus(${JSON.stringify({ ...bare, lastScan: feed().lastScan })})`)).toEqual({ symbol: "SOL/USDT", name: "SOL/USDT", kind: "", why: "the last scan's top pick", confidence: 0.71 });
  });

  it("follows the desk's markets on the push channel while it shows — the chart's market whole, the open leads' prices alone — and works the live balance out from their pushed quotes; the prices read over REST only while the stream does not carry them all", () => {
    const q = page(["ui/core.js", "ui/stream.js", "ui/brains.js", "ui/desk.js", "ui/superagent.js"]);
    q.run(`ROUTE.tab = "superagent"; SG.desk = ${JSON.stringify(feed())}; SG.view = ${JSON.stringify(VIEW)}; sgFollow()`);
    const focus = q.out<{ symbol: string }>("sgChartMarket(SG.desk)").symbol;
    const venue = q.out<{ id: string }>("SG.desk.venue").id;
    const leads = [...new Set(VIEW.open.filter((l) => l.entry).map((l) => `${l.venue}:${l.symbol}`))].filter((k) => k !== `${venue}:${focus}`);
    expect(q.out("STREAM.follows")).toEqual([`${venue}:${focus}`, ...leads.map((k) => `~${k}`)]);
    // nothing pushed yet (the stream down): no live balance from it — the REST read of the leads' prices stands in
    expect(q.run("sgPushedEquity()")).toBeNull();
    q.run(`STREAM.health = "connected"; STREAM.quotes.set("paper-1:SOL/USDT", { venue: "paper-1", symbol: "SOL/USDT", bid: 150.9, ask: 151.1, last: 151, live: true })`);
    expect(q.run("sgPushedEquity()")).toBe(q.run(`sgLiveEquity(${JSON.stringify(VIEW)}, new Map([["paper-1|SOL/USDT", 151]]))`));
    // the desk not showing: it follows nothing of its own, and the trading area's own follows are its
    q.run('ROUTE.tab = "trade"; STREAM.follows = []; sgFollow()');
    expect(q.out("STREAM.follows")).toEqual([]);
  });

  it("draws the balance from the desk's own points and the open leads' fresh prices, said as the desk's equity, not the account's", () => {
    // fresh prices: SOL at 151 → the desk's 10,012.50 less its last mark (−0.33) plus (151 − 150) × 0.6667
    expect(p.run(`sgLiveEquity(${JSON.stringify(VIEW)}, new Map([["paper-1|SOL/USDT", 151]]))`)).toBe(Number((10_012.5 + 0.33 + 0.6667).toFixed(2)));
    expect(p.run(`sgLiveEquity(${JSON.stringify(VIEW)}, new Map())`)).toBeNull();
    const bal = p.run<string>(`sgBalanceHtml(${JSON.stringify(feed())}, ${JSON.stringify(VIEW)}, { at: ${NOW - 1000}, usd: 10013.5 }, ${NOW})`);
    expect(bal).toContain('<span class="sr">$10,013.50</span>');
    expect(bal).toContain('class="sg-livept"');
    expect(bal).toContain("Desk equity = $10,000.00 start + what its leads made. Paper account itself holds $10,003.20.");
    expect(bal).toContain("Target $10,300.00 (+3%) · $286.50 to go");
    expect(bal.match(/<rect class="(up|down)"/g)).toHaveLength(2);
    // a live point older than two beats is not drawn as live
    expect(p.run<string>(`sgBalanceHtml(${JSON.stringify(feed())}, ${JSON.stringify(VIEW)}, { at: ${NOW - 60_000}, usd: 10013.5 }, ${NOW})`)).toContain('<span class="sr">$10,012.50</span>');
    // the odometer: each digit a column standing at its value, keyed from the right
    expect(p.run<string>('sgOdo("$9.5")')).toBe('<span class="sg-od-c" data-k="c4">$</span><span class="sg-od-d" data-k="d3"><span class="sg-od-s" style="--d:9"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></span></span><span class="sg-od-c" data-k="c2">.</span><span class="sg-od-d" data-k="d1"><span class="sg-od-s" style="--d:5"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></span></span>');
  });

  it("groups a figure as a person reads it, but never a port after a host or a figure inside a word", () => {
    expect(p.run<string>(`sgTidy("BTC at 64000.5")`)).toBe("BTC at 64,000.5");
    expect(p.run<string>(`sgTidy("Ollama at localhost:11434 answered")`)).toBe("Ollama at localhost:11434 answered");
    expect(p.run<string>(`sgTidy("vLLM at http://[::1]:8000 · 12000 tokens")`)).toBe("vLLM at http://[::1]:8000 · 12,000 tokens");
    expect(p.run<string>(`sgTidy("lead L-00031 · id abc12345")`)).toBe("lead L-00031 · id abc12345");
    expect(p.run<string>(`sgTidy("spread: 25000")`)).toBe("spread: 25,000");
  });

  it("lists the rules with the real numbers and lights the stage at work", () => {
    const rules = p.run<string>(`sgRulesHtml(${JSON.stringify(feed())}, ${JSON.stringify(VIEW)})`);
    for (const s of ["≤ 0.60%", "L-0003: 0.04%", "1% ($100.00)", "room $487.50 left", "≤ $100.00", "the Sniper&#39;s limit · $1,400.00 left", "TP +1.5% · SL −0.8% · 12 h"]) expect(rules, s).toContain(s);
    // the objective not read yet: said as being read, no number made up
    expect(p.run<string>(`sgRulesHtml(${JSON.stringify(feed({ leads: [] }))}, null)`)).toContain("Risk sets each lead's plan: none cleared yet");
    const pipe = (w: unknown, inFlight: number) => p.run<string>(`sgPipeHtml(${JSON.stringify(feed({ working: w, inFlight }))})`);
    expect(pipe({ role: "search", what: "scan" }, 1)).toMatch(/data-k="scan" data-on="1"/);
    expect(pipe({ role: "risk", what: "clear" }, 0)).toMatch(/data-k="risk" data-on="1"/);
    expect(pipe({ role: "risk", what: "clear" }, 1)).toMatch(/data-k="risk" data-on="1"/);
    // no stage without a figure; a placed lead counted once (executed), the rejections in words
    expect(pipe(null, 0)).not.toContain('data-k="hard"');
    expect(pipe(null, 0)).toContain('<b data-k="sniper:3">3</b> placed');
    // what waits for the owner is what really waits: the cards the strip lists — never the funnel's confirmed less its fills, which counts
    // an entry the door placed and the venue has not filled yet (a day limit in extended hours, a paper venue that fills later)
    const RESTING = lead("L-0009", "executed", { sizeUsd: 60, updatedAt: iso(NOW - MIN) });
    const placedNotFilled = feed({ working: null, funnel: { scanned: 9, cleared: 4, confirmed: 4, executed: 3, closed: 2, rejected: 2 }, leads: [...feed().leads, RESTING] });
    p.run("SG.view = null");
    const rested = p.run<string>(`sgPipeHtml(${JSON.stringify(placedNotFilled)})`);
    expect(rested).not.toContain("waiting for you");
    expect(rested).toContain('<b data-k="sniper:4">4</b> placed · 3 filled');
    expect(rested).toContain('<p class="sg-dim">1 entry resting at Paper account: placed, not filled yet.</p><p class="sg-dim">2 leads rejected by the hard checks or Risk this session.</p>');
    // the funnel's own count of what was placed, where the desk gives it
    expect(p.run<string>(`sgPipeHtml(${JSON.stringify({ ...placedNotFilled, funnel: { ...placedNotFilled.funnel, placed: 4 } })})`)).toContain('<b data-k="sniper:4">4</b> placed · 3 filled');
    // a card waiting on the owner (the account still holds it): counted as the strip counts it
    const CARD = { id: "card-0009", hash: "0x9", agent: addr(4), reason: "Desk Sniper asks to PAPER · buy 0.4 SOL at Paper account · market · about $59.80", usd: 60, expiresAt: iso(NOW + 30 * MIN) };
    p.run(`A = ${JSON.stringify({ ...ACCOUNT, cards: [CARD] })}`);
    const waitingView = { ...VIEW, open: [{ ...VIEW.open[0], id: "L-0010", state: "confirmed", entry: undefined, card: "card-0009" }], cards: [{ id: "card-0009", lead: "L-0010", reason: CARD.reason, usd: 60 }] };
    expect(p.run<string>(`sgPipeHtml(${JSON.stringify(feed({ working: null }))}, ${JSON.stringify(waitingView)})`)).toContain('<p class="sg-dim">1 card waiting for you.</p>');
    p.run(`A = ${JSON.stringify(ACCOUNT)}`);
    expect(pipe({ role: "watch", what: "close" }, 0)).toMatch(/data-k="exit" data-on="1"/);
    expect(pipe(null, 0)).not.toContain("data-on");
    expect(pipe(null, 0)).toContain('<b data-k="scan:9">9</b> scanned');
  });
});

// ---- the desk: the chart with the desk's trades, Now, the seats' line, what it did -----------------------------------------------------------

describe("the desk: the chart with its trades, Now, the seats' line and What it did — and what happened, played as it happens", () => {
  /** the chart's own calls, recorded (ui/chart.js is not on this page's stand-in): what the desk mounts and hands over */
  const CHART = 'var CALLS = []; chMount = (el, o) => void CALLS.push(["mount", o.venue, o.symbol, o.range, o.interval, o.fullscreen]); chLines = (el, l) => void CALLS.push(["lines", l.map((x) => x.kind)]); chMarks = (el, m) => void CALLS.push(["marks", m.map((x) => x.id)]); chRelease = () => void CALLS.push(["release"])';

  it("paints the desk from one read — the chart on the market it holds, its trades and plan handed over only when they change; Now; the seats' line; What it did; the positions — and lets the chart go", () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.run('ROUTE.tab = "superagent"; Owner = { role: "owner" }');
    p.run(CHART);
    p.run(`var ROOT = fakeEl("root"); SG.desk = ${JSON.stringify(feed())}; SG.view = ${JSON.stringify(VIEW)}; SG.catalog = ${JSON.stringify(CATALOG)}; SG.room = SG.desk.room; sgPaintDesk(ROOT, true); sgPaintDesk(ROOT, true)`);
    // mounted once, on the market of the lead it holds, a day of five-minute bars; its entry's dot and its plan's lines handed over once
    expect(p.out("CALLS")).toEqual([["mount", "paper-1", "SOL/USDT", "1D", "5m", true], ["lines", ["entry", "tp", "sl"]], ["marks", ["L-0003:in"]]]);
    const part = (sel: string) => p.run<string>(`ROOT.querySelector('${sel}').innerHTML`);
    expect(part('[data-sg-p="chart-h"]')).toContain('<b>Solana</b><span class="sg-dim">SOL/USDT · open lead L-0003</span>');
    // one market held: no markets to press
    expect(part('[data-sg-p="chart-h"]')).not.toContain("sg-mkts");
    // the header as before: its name, its venue, its stats
    expect(part('[data-sg-p="brand"]')).toContain('<h2 class="sg-desk-n" id="sg-desk-h" tabindex="-1">The desk</h2><span class="sg-chip">Paper</span><span class="sg-venue">Paper account</span>');
    expect(part('[data-sg-p="brand"]')).toMatch(/<span class="sg-pill sg-pill-on"><i aria-hidden="true"><\/i>Live <span class="tab-nums" data-sg-clock>\d+:\d\d:\d\d<\/span> of 22 h<\/span>/);
    expect(part('[data-sg-p="meta"]')).toContain('<div class="sg-stat"><span class="sg-stat-l">Equity</span><span class="sg-stat-v tab-nums">$10,012.50 <span class="up" title="+$12.50 since the session started">+0.13%</span></span></div>');
    // Now: who is at work and on what, the cycle and the next one's clock, the lead held in a line
    const now = part('[data-sg-p="now"]');
    expect(now).toContain('<p class="sg-now-big">Search is scanning the venue&#39;s markets</p>');
    expect(now).toMatch(/<span class="sg-now-c tab-nums">Cycle 14 · next <span data-sg-next="[^"]+">[^<]+<\/span><\/span>/);
    expect(now).toContain(`<p class="sg-now-sub">−$0.33 on 0.6667 SOL long · take-profit ${p.run("sgAtDecimals(152.25, 150)")} · stop ${p.run("sgAtDecimals(148.8, 150)")}</p>`);
    // the seats' line: Search lit, thinking (its brain call under way); each seat's count this session
    const relay = part('[data-sg-p="relay"]');
    expect(relay).toMatch(/<li class="sg-rs sg-r-search" data-k="rs:search" data-s="thinking" data-on="1"[ >]/);
    for (const c of ["40 markets looked at", "4 cleared · 5 out", "3 placed", "2 closed"]) expect(relay, c).toContain(c);
    expect(relay.match(/data-on="1"/g)).toHaveLength(1);
    // nothing played yet: no chip on the line, no bubble over a seat, no banner over the chart
    expect(relay).not.toContain("sg-chipl");
    expect(relay).not.toContain("sg-rs-b");
    expect(part('[data-sg-p="banner"]')).toBe("");
    // What it did: each entry, newest first, with its plan where Risk gave one
    const did = part('[data-sg-p="did"]');
    expect([...did.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1])).toEqual([`Bought 0.6667 SOL at ${p.run("px(150)")}`, `Bought 0.04 ETH at ${p.run("px(2500)")}`, `Bought 0.0016 BTC at ${p.run("px(63000)")}`]);
    expect(did).toContain("$100.00 · take-profit +1.5% · stop −0.8% · 12 h");
    expect(part('[data-sg-p="did-n"]')).toBe("newest first");
    // the positions: the lead held, and the day's closes over it
    const pos = part('[data-sg-p="pos"]');
    expect(pos).toContain("Open positions · 1");
    expect(pos).toContain("closed today 2 · +$4.10");
    expect(pos).toContain('<tr data-k="L-0003">');
    // let go of with the frame
    p.run("CALLS.length = 0; sgLetChartGo(ROOT)");
    expect(p.out("[CALLS, SG.mounted]")).toEqual([[["release"]], ""]);
  });

  it("builds the frame once — the chart with the banner over it beside Now, the seats' line and What it did, the positions, the tabs — and reads only while its pane shows and the page is in view", async () => {
    const p = page();
    p.set("A", ACCOUNT);
    const frame = p.run<string>('sgFrame("desk")');
    expect(frame.match(/data-sg-card="/g)).toHaveLength(8);
    // no canvas, no frame rate, no corner brackets: the floor is gone
    for (const gone of ["canvas", "data-sg-hud", "sg-floor", "sg-c1"]) expect(frame, gone).not.toContain(gone);
    const at = (s: string) => frame.indexOf(s);
    const order = ["sg-head", "sg-next", "sg-waits", "sg-main", "sg-chartp", "data-sg-chart", 'data-sg-p="banner"', "sg-side", 'data-sg-p="now"', 'data-sg-p="relay"', 'data-sg-p="did"', "sg-pos", "sg-low", "sg-tabs", 'data-sg-tp="equity"', 'data-sg-tp="seats"', 'data-sg-tp="room"', 'data-sg-tp="rules"'].map(at);
    expect(order.every((x) => x >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(frame).toContain('<div class="sg-banner" data-sg-p="banner" role="status" aria-live="polite"></div>');
    expect(frame).toContain('<ol class="sg-did" data-sg-p="did" aria-labelledby="sg-did-h"></ol>');
    expect(frame).toContain('<section class="sg-next sg-panel" data-sg-p="next" aria-label="Next step" hidden></section>');
    // one tab shows — the equity, where none was picked in this browser — each tab naming its panel and each panel named by its tab
    expect(frame).toContain('<div class="tt-tabs sg-tabs" role="tablist" aria-label="The desk in detail"><button type="button" role="tab" id="sg-t-equity" aria-controls="sg-tp-equity" aria-selected="true" tabindex="0" data-sg-tab="equity">Equity</button><button type="button" role="tab" id="sg-t-seats" aria-controls="sg-tp-seats" aria-selected="false" tabindex="-1" data-sg-tab="seats">Seats</button>');
    expect(frame).toContain('<div class="sg-bal" role="tabpanel" id="sg-tp-equity" aria-labelledby="sg-t-equity" data-sg-tp="equity">');
    for (const v of ["seats", "room", "rules"]) expect(frame, v).toMatch(new RegExp(`role="tabpanel" id="sg-tp-${v}" aria-labelledby="sg-t-${v}" data-sg-tp="${v}" hidden>`));
    expect(frame).toContain('<section class="sg-waits sg-panel" data-sg-p="waits" aria-labelledby="sg-waits-h" tabindex="-1" hidden></section>');
    const asked: string[] = [];
    p.sandbox.fetch = async (path: string) => (asked.push(path), { status: 200, json: async () => ({ ok: true, desk: null }) });
    // another pane showing: no beat
    p.run('ROUTE.tab = "trade"; sgBeat(0)');
    await settle();
    expect(asked).toEqual([]);
    // the page hidden: no beat either
    p.run('ROUTE.tab = "superagent"; document.hidden = true; sgBeat(0)');
    await settle();
    expect(asked).toEqual([]);
    p.run("document.hidden = false; sgBeat(0)");
    await settle(12);
    expect(asked[0]).toBe("/api/account/desk/feed?since=0");
    expect(p.out("SG.desk")).toBeNull();
    // no desk: the setup is what the pane shows; the catalog is read for it — and no bars, no movers: the chart reads its own
    expect(p.run("sgMode()")).toBe("setup");
    expect(asked).toContain("/api/account/desk/catalog");
    expect(asked.filter((x) => x.startsWith("/api/account/candles") || x.startsWith("/api/account/explore"))).toEqual([]);
    p.run('ROUTE.tab = "markets"');
  });

  it("plays what happened: a banner a step in the order they came — with its seat lit, the lead's chip moved to its step and the seat's words bubbled over it — and what just happened landing on the chart and in What it did", async () => {
    const p = page();
    p.set("A", ACCOUNT);
    // the lead as the desk keeps it: Search's confidence on it
    const desk = feed({ leads: feed().leads.map((l) => (l.id === "L-0003" ? { ...l, confidence: 0.71 } : l)) });
    p.run(`SG.desk = ${JSON.stringify(desk)}; SG.catalog = ${JSON.stringify(CATALOG)}; var AGAIN = 0; sgAgain = () => void AGAIN++`);
    p.run(`sgPlay([{ type: "say", role: "search", text: "Search: SOL looks strong on volume", raw: "LEAD L-0003 | …", kind: "lead" }, { type: "handoff", lead: "L-0003", symbol: "SOL/USDT", side: "buy", from: "search", to: "risk" }, { type: "handoff", lead: "L-0003", symbol: "SOL/USDT", side: "buy", from: "risk", to: "sniper" }, { type: "order", lead: "L-0003", symbol: "SOL/USDT", side: "buy", usd: 100, role: "sniper" }, { type: "fill", lead: "L-0003", symbol: "SOL/USDT", side: "buy", price: 150, qty: 0.6667 }, { type: "think", role: "search", on: false }])`);
    // the first step shows at once, its seat's words over it and the lead's chip on its way there; the rest wait their turn, each with its
    // chip's step and tone
    expect(p.out("[SG.banner.now.text, SG.banner.now.sub, SG.banner.now.tone]")).toEqual(["Search picked SOL long", "confidence 71%", "go"]);
    expect(p.out("[SG.bubble.role, SG.bubble.text]")).toEqual(["search", "Search: SOL looks strong on volume"]);
    expect(p.out("[SG.chip.lead, SG.chip.base, SG.chip.step, SG.chip.to, SG.chip.tone]")).toEqual(["L-0003", "SOL", 0, 1, "go"]);
    expect(p.out("SG.banner.queue.map((b) => [b.text, b.tone, b.chip && b.chip.step])")).toEqual([["Risk cleared SOL long", "go", 2], ["Sniper buys SOL · $100.00", "up", 2], [`Bought 0.6667 SOL at ${p.run("px(150)")}`, "up", 3]]);
    expect(p.out("SG.banner.queue[0].sub")).toBe("$100.00 · take-profit +1.5% · stop −0.8% · 12 h");
    expect(p.out("SG.banner.queue.at(-1).sub")).toBe(`take-profit ${p.run("sgAtDecimals(152.25, 150)")} · stop ${p.run("sgAtDecimals(148.8, 150)")}`);
    expect(p.out("AGAIN")).toBeGreaterThan(0);
    // while nothing is at work, the seat whose step is told is lit on the line, its words in a bubble over it, the chip under the line
    const relay = p.run<string>(`sgRelayHtml(${JSON.stringify({ ...desk, working: null, inFlight: 0 })}, ${JSON.stringify(VIEW)}, ${JSON.stringify(CATALOG)}, Date.now())`);
    expect(relay).toMatch(/<li class="sg-rs sg-r-search" data-k="rs:search" data-s="ready" data-on="1"[ >]/);
    expect(relay).toContain('<span class="sg-rs-b" data-k="b:1">Search: SOL looks strong on volume</span>');
    expect(relay).toContain('<li class="sg-chipl" data-k="chip:L-0003" data-tone="go" style="--at:0" aria-hidden="true">SOL ▲</li>');
    // the chip moves to its step a moment later: the line draws the move
    await new Promise((r) => setTimeout(r, 120));
    expect(p.out("SG.chip.step")).toBe(1);
    // the fill is fresh at once: its dot rings on the chart, its plan draws in, its row lights
    expect(p.out("[...SG.fresh.keys()]")).toEqual(["L-0003|in", "L-0003|plan"]);
    const over = p.out<{ lines: Array<{ fresh: boolean }>; marks: Array<{ id: string; fresh: boolean; quiet?: boolean }> }>(`sgChartOverlay(SG.desk, "SOL/USDT", Date.now())`);
    expect(over.marks.map((m) => [m.id, m.fresh])).toEqual([["L-0003:in", true]]);
    expect(over.lines.map((l) => l.fresh)).toEqual([true, true, true]);
    expect(p.out("sgDid(SG.desk, [], Date.now())[0]")).toMatchObject({ k: "L-0003:in", fresh: true });
    expect(p.run<string>("sgDidHtml(sgDid(SG.desk, [], Date.now()), SG.desk)")).toContain('<li class="sg-di" data-k="L-0003:in" data-i="ok" data-tone="up" data-new="1">');
    // a turn-down: in ink, its chip struck at Risk; its row the turned-down mark, fresh
    p.run(`SG.desk.leads.push(${JSON.stringify(lead("L-0009", "rejected", { symbol: "AVAX/USD", name: "Avalanche", side: "sell", why: "spread 0.14% over the 0.10% line", updatedAt: iso(NOW - MIN) }))}); sgPlay([{ type: "reject", lead: "L-0009", symbol: "AVAX/USD", from: "risk", why: "spread 0.14% over the 0.10% line" }])`);
    expect(p.out("SG.banner.queue.at(-1)")).toMatchObject({ role: "risk", tone: "no", text: "Risk turned down AVAX short", sub: "spread 0.14% over the 0.10% line", chip: { lead: "L-0009", base: "AVAX", side: "sell", step: 1, tone: "no" } });
    expect(p.run<string>("sgDidHtml(sgDid(SG.desk, [], Date.now()), SG.desk)")).toContain('<li class="sg-di" data-k="L-0009:no" data-i="no" data-new="1"><span class="sg-di-i" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect width="16" height="16" rx="3"/><path d="M5 5l6 6M11 5l-6 6"/></svg></span><span class="sg-di-w"><b>Turned down AVAX short</b><span>spread 0.14% over the 0.10% line</span></span>');
    // a close: its result, the exit's dot fresh with the result to float up beside it
    const closed = feed({ leads: [lead("L-0003", "closed", { sizeUsd: 100, pnlUsd: 1.5, exitWhy: "TP HIT at 152.25 (+1.50%)", entry: { price: 150, qty: 0.6667, at: iso(NOW - 10 * MIN) }, exit: { price: 152.25, at: iso(NOW - MIN) } })] });
    p.run(`SG.desk = ${JSON.stringify(closed)}; sgPlay([{ type: "exit", lead: "L-0003", symbol: "SOL/USDT", why: "tp", pnlUsd: 1.5 }])`);
    expect(p.out("SG.banner.queue.at(-1)")).toMatchObject({ role: "exit", tone: "up", text: "Closed SOL · take-profit · +$1.50", chip: { step: 3, tone: "done" } });
    const out = p.out<{ marks: Array<Record<string, unknown>> }>(`sgChartOverlay(SG.desk, "SOL/USDT", Date.now())`).marks.find((m) => m.id === "L-0003:out");
    expect(out).toMatchObject({ kind: "out", tone: "ink", fresh: true, float: "+$1.50", floatTone: "up", label: "SOLD · take-profit · +$1.50" });
    // a halt; and nothing is played from no event
    p.run(`sgPlay([{ type: "halt", why: "the day's loss line" }])`);
    expect(p.out("SG.banner.queue.at(-1)")).toMatchObject({ role: "head", tone: "down", text: "Halted for the day" });
    const waiting = p.out<number>("SG.banner.queue.length");
    p.run("sgPlay([]); sgPlay(null)");
    expect(p.out("SG.banner.queue.length")).toBe(waiting);
    // the banner shows its seat's face and its words
    p.run('var BN = fakeEl("root"); sgPaintBanner(BN)');
    expect(p.run<string>("BN.querySelector('[data-sg-p=\"banner\"]').innerHTML")).toMatch(/^<div class="sg-bn" data-k="bn:1" data-tone="go"><span class="sg-bn-a sg-r-search" aria-hidden="true"><svg class="sg-blob sg-r-search"[^]*<\/svg><\/span><span class="sg-bn-w"><b>Search picked SOL long<\/b><span>confidence 71%<\/span><\/span><\/div>$/);
    // the next banner after its time; the frame let go of: nothing waits to be played
    p.run("clearTimeout(SG.banner.timer); SG.banner.timer = 0; sgBannerNext()");
    expect(p.out("SG.banner.now.text")).toBe("Risk cleared SOL long");
    p.run("sgUnmount()");
    expect(p.out("[SG.banner.queue.length, SG.banner.now, SG.banner.timer]")).toEqual([0, null, 0]);
  });

  it("charts the market the desk holds — the others one press away, back with Follow the desk — and, before any lead, the market a desk of its kind trades first, at the account's own paper account only", () => {
    const p = page();
    p.set("A", { ...ACCOUNT, venues: [{ ...PAPER, connector: "live:paper" }, REAL] });
    p.run('ROUTE.tab = "superagent"; sgAgain = () => {}');
    const two = feed({ leads: [lead("L-0003", "executed", { entry: { price: 150, qty: 0.6667, at: iso(NOW - 10 * MIN) }, updatedAt: iso(NOW - 10 * MIN) }), lead("L-0004", "executed", { symbol: "BTC/USDT", name: "Bitcoin", entry: { price: 63_000, qty: 0.0016, at: iso(NOW - 5 * MIN) }, updatedAt: iso(NOW - 5 * MIN) })] });
    p.set("SG.desk", two);
    // the newest lead held first; both one press away
    expect(p.out("sgMarkets(SG.desk).map((m) => m.symbol)")).toEqual(["BTC/USDT", "SOL/USDT"]);
    expect(p.out("sgChartMarket(SG.desk).symbol")).toBe("BTC/USDT");
    const head = p.run<string>("sgChartHeadHtml(SG.desk, sgChartMarket(SG.desk))");
    expect(head).toContain('<button type="button" class="sg-mkt" data-sg-act="market" data-v="BTC/USDT" data-fk="sg:mkt:BTC/USDT" aria-pressed="true">BTC</button><button type="button" class="sg-mkt" data-sg-act="market" data-v="SOL/USDT" data-fk="sg:mkt:SOL/USDT" aria-pressed="false">SOL</button>');
    expect(head).not.toContain("Follow the desk");
    // the owner's pick, said so; pressed again, or Follow the desk, back to the desk's
    p.run('sgAct("market", { v: "SOL/USDT" })');
    expect(p.out("[SG.pick, sgChartMarket(SG.desk).symbol, sgChartMarket(SG.desk).picked]")).toEqual(["SOL/USDT", "SOL/USDT", true]);
    expect(p.run<string>("sgChartHeadHtml(SG.desk, sgChartMarket(SG.desk))")).toContain("SOL/USDT · picked by you</span>");
    expect(p.run<string>("sgChartHeadHtml(SG.desk, sgChartMarket(SG.desk))")).toContain('<button type="button" class="sg-link" data-sg-act="follow" data-fk="sg:follow">Follow the desk</button>');
    p.run('sgAct("market", { v: "SOL/USDT" })');
    expect(p.out("SG.pick")).toBe("");
    p.run('sgAct("market", { v: "SOL/USDT" }); sgAct("follow", {})');
    expect(p.out("SG.pick")).toBe("");
    // a pick the desk no longer holds is not followed, and offers no way back from it
    p.run('SG.pick = "ETH/USDT"');
    expect(p.out("sgChartMarket(SG.desk).symbol")).toBe("BTC/USDT");
    expect(p.run<string>("sgChartHeadHtml(SG.desk, sgChartMarket(SG.desk))")).not.toContain("Follow the desk");
    // no lead yet: Bitcoin at the account's own paper account, the S&P 500's fund for a stocks desk — said as shown until there is one
    const bare = feed({ leads: [], lastScan: null });
    expect(p.out(`sgChartMarket(${JSON.stringify(bare)})`)).toEqual({ symbol: "BTC/USD", name: "Bitcoin", kind: "crypto", why: "no lead yet", first: true });
    expect(p.out(`sgChartMarket(${JSON.stringify({ ...bare, objective: { universe: "stocks" } })}).symbol`)).toBe("SPY");
    expect(p.run<string>(`sgChartHeadHtml(${JSON.stringify(bare)}, sgChartMarket(${JSON.stringify(bare)}))`)).toContain("BTC/USD · no lead yet: shown until the desk has one");
    // the last scan's top pick before any lead: with Search's confidence
    const scanned = { ...bare, lastScan: feed().lastScan };
    expect(p.run<string>(`sgChartHeadHtml(${JSON.stringify(scanned)}, sgChartMarket(${JSON.stringify(scanned)}))`)).toContain("SOL/USDT · the last scan&#39;s top pick · Search's confidence 71%");
    // at any other venue (a testnet, a broker's own paper account by another name): nothing is guessed — and that is said where the chart goes
    p.set("A", ACCOUNT);
    expect(p.out(`sgChartMarket(${JSON.stringify(bare)})`)).toBeNull();
    p.run(`var ROOT = fakeEl("root"); SG.mounted = ""; sgPaintChart(ROOT, ${JSON.stringify(bare)}, Date.now())`);
    expect(p.run<string>('ROOT.querySelector("[data-sg-chart]").innerHTML')).toBe('<p class="sg-dim sg-wait-w">Nothing to chart yet: the market of the desk\'s first lead shows here.</p>');
    expect(p.out("SG.mounted")).toBe("none");
  });

  it("says in Now what the desk is doing, or why it is doing nothing — with the way out where there is one", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const big = (f: unknown, stale = "null") => p.run<string>(`sgNowHtml(${JSON.stringify(f)}, null, ${JSON.stringify(CATALOG)}, ${NOW}, ${stale})`);
    // at work: who, on what; the cycle and the next one's countdown
    expect(big(feed())).toMatch(/<span class="sg-now-c tab-nums">Cycle 14 · next <span data-sg-next="[^"]+">03:12<\/span><\/span>/);
    const no = big(feed({ brain: { ok: false, why: "no key", spend: {} } }));
    expect(no).toContain('<p class="sg-now-big" data-tone="warn">No AI brain: it can&#39;t look for trades</p><p class="sg-now-sub">No key. Head, Search and Risk think with it. The leads it holds still keep their take-profits, stops and time limits.</p>');
    expect(no).toContain('<button type="button" class="sg-btn sg-btn-p" data-sg-act="brain" data-fk="sg:now-brain">Connect a brain</button>');
    expect(big(feed({ session: null }))).toContain('<p class="sg-now-big">No session</p><p class="sg-now-sub">Start one from the controls above.</p>');
    expect(big(feed({ session: { ...feed().session, state: "paused" } }))).toContain('<p class="sg-now-big">Paused</p>');
    expect(big(feed({ session: { ...feed().session, state: "ended" } }))).toContain("The desk is not running: the leads it holds are not managed until a new session starts. 1 lead held · 5 leads turned down this session.");
    expect(big(feed({ session: { ...feed().session, state: "halted", halted: { why: "the day's loss line crossed" } } }))).toContain('<p class="sg-now-big" data-tone="down">Halted until the next New York day</p>');
    expect(big(feed({ working: { role: "risk", what: "clear", lead: "L-0003" }, inFlight: 0 }))).toContain('<p class="sg-now-big">Risk is clearing a lead · SOL long</p>');
    expect(big(feed({ working: null, inFlight: 0 }))).toContain('<p class="sg-now-big">Exit is watching 1 lead</p>');
    expect(big(feed({ working: null, inFlight: 0, leads: [] }))).toContain('<p class="sg-now-big">Waiting for the next cycle</p><p class="sg-now-sub">0 leads held · 5 leads turned down this session</p>');
    // the reads stale: since when, and no countdown that would run on a state no longer known
    const stale = big(feed(), '{ since: "2026-10-14T14:58:00.000Z" }');
    expect(stale).toMatch(/<p class="sg-now-big" data-tone="dim">Not read since \d\d:\d\d<\/p>/);
    expect(stale).not.toContain("data-sg-next");
    expect(stale).not.toContain("SOL long");
  });
});

// ---- the page as a whole ----------------------------------------------------------------------------------------------------------------------

describe("the page: the pane, the switch, the route, the scripts and styles, the Portfolio's link", () => {
  it("names superagent.js right after desk.js and before the shell — the chart's script before it, no floor's — superagent.css after desk.css, the pane, Trade's Regular · Superagent switch and the icon", () => {
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    const at = (s: string) => scripts.indexOf(s);
    expect(at("/ui/superagent.js")).toBe(at("/ui/desk.js") + 1);
    expect(at("/ui/superagent.js")).toBeLessThan(at("/ui/shell.js"));
    // the chart it draws on is Regular's own (ui/chart.js), named before it; the floor's drawing is gone, file and all
    expect(at("/ui/chart.js")).toBeGreaterThanOrEqual(0);
    expect(at("/ui/chart.js")).toBeLessThan(at("/ui/superagent.js"));
    expect(at("/ui/floor.js")).toBe(-1);
    expect(existsSync(join(PUBLIC, "ui/floor.js"))).toBe(false);
    const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
    expect(styles.indexOf("/ui/superagent.css")).toBe(styles.indexOf("/ui/desk.css") + 1);
    expect(html).toMatch(/<section class="pane" data-pane="superagent" aria-labelledby="h-superagent" hidden><h1 class="sr" id="h-superagent">Superagent<\/h1><div id="pane-superagent">/);
    // a mode of Trade, not a place of its own: no rail link — the switch, drawn once as the top bar's first child for both panes
    expect(html).not.toContain('data-tab="superagent"');
    expect(html).toContain('<header class="topbar">\n      <!--');
    expect(html).toMatch(/<header class="topbar">\s*<!--[\s\S]*?-->\s*<div class="ta-mode" id="trade-mode" role="group" aria-label="How you trade" data-only="trade-area"><button type="button" data-trade-mode="regular" aria-pressed="true" aria-describedby="tm-regular">Regular<\/button><button type="button" data-trade-mode="superagent" aria-pressed="false" aria-describedby="tm-superagent">Superagent<\/button><span class="sr" id="tm-regular">You place your own orders.<\/span><span class="sr" id="tm-superagent">The account's desk of AI seats trades a paper account by itself while you watch. Paper money only.<\/span><\/div>/);
    // its icon stays in the sprite: the Agents pane and the Portfolio draw it
    expect(html).toMatch(/<symbol id="i-superagent" viewBox="0 0 24 24">/);
  });

  it("routes Trade's Superagent mode to its own pane (a trading one, not under the Account's header) by #/trade?mode=superagent, the older #/superagent landing there too", () => {
    const p = page();
    expect(p.out('routeOf("#/superagent?venue=paper-1")')).toEqual({ tab: "superagent", params: { venue: "paper-1" } });
    expect(p.out('routeOf("#/trade?mode=superagent&venue=paper-1")')).toEqual({ tab: "superagent", params: { venue: "paper-1" } });
    expect(p.out('routeOf("#/trade?mode=regular")')).toEqual({ tab: "trade", params: {} });
    expect(p.out('routeOf("#/trade?kind=perps")')).toEqual({ tab: "trade", params: { kind: "perps" } });
    expect(p.out('[TABS.includes("superagent"), ACCOUNT_TABS.includes("superagent"), hashOf("superagent", { venue: "paper-1" }), hashOf("superagent"), hashOf("trade", { kind: "perps", mode: "superagent" })]')).toEqual([true, false, "#/trade?mode=superagent&venue=paper-1", "#/trade?mode=superagent", "#/trade?kind=perps"]);
    expect(p.out("TRADE_AREA")).toEqual(["trade", "superagent"]);
    // the older link written as the canonical one, in place
    const replaced: string[] = [];
    p.sandbox.history = { replaceState: (_s: unknown, _t: string, h: string) => void replaced.push(h) };
    p.run('location.hash = "#/superagent?venue=paper-1"; routed()');
    expect(replaced).toEqual(["#/trade?mode=superagent&venue=paper-1"]);
    expect(p.out("[ROUTE.tab, ROUTE.params]")).toEqual(["superagent", { venue: "paper-1" }]);
    p.run('location.hash = "#/trade?kind=perps"; routed()');
    expect(replaced).toHaveLength(1);
    p.run('location.hash = ""; ROUTE.tab = "portfolio"');
    // the mode used last: Regular with nothing kept (or storage off); only the switch writes it
    expect(p.run("tradeModeLast()")).toBe("regular");
    expect(source("ui/shell.js")).toContain('superagent: typeof renderSuperagent === "function" ? renderSuperagent : null');
    expect(p.run("typeof renderSuperagent")).toBe("function");
    // loaded with no frame machinery, it wrote nothing to storage and asked for nothing
    expect(p.stored).toEqual([]);
  });

  it("keeps its styles to the trading area's tokens: no Account name redefined on .sg, every colour a declaration, no field of its own", () => {
    const css = source("ui/superagent.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const colours = css.split("\n").filter((l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l));
    for (const l of colours) expect(l.trim(), l).toMatch(/^--[\w-]+:/);
    // the chrome inherits the area's names (ui/tokens.css): .sg redefines none of them
    const sg = (css.match(/(?:^|\n)\.sg \{([^}]*)\}/) || [])[1] || "";
    for (const t of ["--bg", "--surface", "--surface-2", "--text", "--dim", "--border", "--up", "--down", "--accent", "--primary", "--up-fill", "--down-fill", "--warn", "--shadow-card"]) expect(sg, t).not.toMatch(new RegExp(`(^|\\s)${t}:`));
    // no names of its own but the seats' tints (a grey ramp; Light's here): the floor's deep field and the aliases it read are gone with it
    expect([...sg.matchAll(/(--[\w-]+):/g)].map((m) => m[1])).toEqual(["--sg-r-head", "--sg-r-search", "--sg-r-risk", "--sg-r-sniper", "--sg-r-exit", "--sg-r-watch", "--sg-r-flow", "--sg-r-sentiment"]);
    for (const gone of [".sg-floor", "--sg-deep", "--sg-scan", "--sg-mint", ".sg-canvas", ".sg-hud", ".sg-lite"]) expect(css, gone).not.toContain(gone);
    // the area's tokens are there to inherit: scoped, never under a background's theme
    const tokens = source("ui/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(tokens).toContain(':root[data-area="trade"] :is(.main, #modal, #drawer, #ask, .toast-stack) {');
    // the area wears the background the Account wears: its Black values under the chosen Black (and the system's dark where none was chosen)
    expect(tokens).toContain(':root[data-theme="black"][data-area="trade"],');
    expect(tokens).toContain(':root:not([data-theme])[data-area="trade"],');
    // no full bleed, no scanlines, no corner brackets, no glow, no uppercase mono labels
    for (const gone of ["sg-power", "sg-unfold", ".sg-c1", "--sg-glow", "text-transform: uppercase", "margin: -24px"]) expect(css, gone).not.toContain(gone);
    // under reduced motion nothing moves
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.sg \*, \.sg \*::before, \.sg \*::after, \.sg-panel, \.sg-card \{ animation: none !important; transition: none !important; \}/);
  });

  it("links the Portfolio's paper book to the superagent, one paper account's own when the lens is on it", () => {
    const p = page(PAGE, { full: true });
    p.set("A", { ...ACCOUNT, liveUsd: 2_500 });
    p.run("PF.histPaper = new Map(); PF.holdPaper = null; PF.holdReal = null");
    expect(p.run<string>('pfPaperWorthHtml({ kind: "all", id: "", name: "All accounts" })')).toContain('<a class="link" href="#/trade?mode=superagent"><svg class="ico sm" aria-hidden="true" focusable="false"><use href="#i-superagent"></use></svg>Let the superagent trade it ›</a>');
    expect(p.run<string>('pfPaperWorthHtml({ kind: "venue", id: "paper-1", name: "Paper account" })')).toContain('href="#/trade?mode=superagent&amp;venue=paper-1"');
    // a link writes nothing: the mode the rail's Trade opens is the switch's alone
    expect(p.stored).not.toContain("account.tradeMode");
  });
});

// ---- the review's fixes ---------------------------------------------------------------------------------------------------------------------

describe("the review's fixes: honest words, the order of a lead's steps, the real numbers, the beat that never freezes", () => {
  const base = (leads: unknown[], room: unknown[], more: Record<string, unknown> = {}) => feed({ leads, room, seq: Math.max(0, ...room.map((m) => (m as { seq: number }).seq)), working: null, inFlight: 0, ...more });

  it("builds its events without writing an event kind as a `type:` literal (review2-contracts reads those as signed drafts)", () => {
    const src = source("ui/superagent.js");
    const literals = [...src.matchAll(/type:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(literals.filter((t) => !["approveAgent", "approveSpend", "setDesk", "approveCard"].includes(t!))).toEqual([]);
    // and sgPlay still gets { type, … }: what it plays
    const p = page();
    expect(p.out('sgEv("fill", { lead: "L-1", price: 2 })')).toEqual({ type: "fill", lead: "L-1", price: 2 });
  });

  it("plays an entry's fill right after its order line, before a Head line that came after it; a close's exit right after the exit line", () => {
    const p = page();
    p.run("var PREV = null");
    const step = (f: unknown) => p.out<Array<Record<string, unknown>>>(`(() => { const r = sgDiff(PREV, ${JSON.stringify(f)}); PREV = r.next; return r.events; })()`);
    step(base([], [msg(9, "head", "cycle", "Cycle 13 …")]));
    const events = step(base([lead("L-0003", "executed", { sizeUsd: 100, entry: { price: 150, qty: 0.6667, at: iso(NOW) } })], [msg(9, "head", "cycle", "Cycle 13 …"), ...feed().room, msg(13, "head", "cycle", "Cycle 14 (the clock): 1 lead scanned, 1 cleared, 1 placed, 1 open.")]));
    expect(events.map((e) => (e.type === "say" ? `say:${e.role}` : String(e.type)))).toEqual(["say:search", "handoff", "say:risk", "handoff", "say:sniper", "order", "fill", "say:head"]);
    // a take-profit: the Exit's line, its close order and the exit bloom, then the Head's next line
    step(base([lead("L-0040", "executed", { entry: { price: 150, qty: 1, at: iso(NOW) } })], [msg(20, "head", "note", "…")]));
    const closed = step(base([lead("L-0040", "closed", { exitWhy: "TP HIT at 152 (+1.33%)", pnlUsd: 2, entry: { price: 150, qty: 1, at: iso(NOW) } })], [msg(21, "exit", "exit", "L-0040 closed: TP HIT …", { lead: "L-0040" }), msg(22, "head", "cycle", "Cycle 15 …")]));
    expect(closed.map((e) => (e.type === "say" ? `say:${e.role}` : String(e.type)))).toEqual(["say:exit", "order", "exit", "say:head"]);
  });

  it("keeps the desk for a desk whose venue is not read as connected — real only when known real — says the venue was not read, and asks it for no bars", () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.set("SG.desk", feed({ venue: { id: "paper-1", name: "Paper account", usd: 0, paper: false, connected: false } }));
    expect(p.run("sgMode()")).toBe("desk");
    expect(p.run(`sgBrandHtml(SG.desk, null, ${NOW})`)).toContain(" · not connected");
    expect(p.run(`sgToolsHtml(SG.desk, true)`)).toContain("autonomy waits until it is read as a paper account");
    // a venue the account cannot read has no bars to ask for: none are, and that is said where the chart goes
    p.run('var CALLS = []; chMount = () => void CALLS.push("mount"); var ROOT = fakeEl("root"); sgPaintChart(ROOT, SG.desk, Date.now())');
    expect(p.out("[CALLS, SG.mounted]")).toEqual([[], "off"]);
    expect(p.run<string>('ROOT.querySelector("[data-sg-chart]").innerHTML')).toBe('<p class="sg-dim sg-wait-w">Paper account is not connected: no chart until it is.</p>');
    p.set("SG.desk", feed({ venue: { id: "okx", name: "OKX", usd: 1, paper: false, connected: true } }));
    expect(p.run("sgMode()")).toBe("real");
    p.set("SG.desk", feed());
    expect(p.run("sgMode()")).toBe("desk");
  });

  it("never names a reason the brain cannot think when the account gave none", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const bare = { ok: false, label: "Claude", model: "claude-opus-5-5", spend: { calls: 0, usd: 0 } };
    expect(p.run(`sgBrainStat(${JSON.stringify(bare)}, null)`)).toContain('title="the account gave no reason">Not ready</span>');
    expect(p.run(`sgBrainStat(${JSON.stringify(bare)}, null)`)).not.toContain("no key");
    expect(p.run(`sgFixHtml(${JSON.stringify(bare)})`)).toBe('<p class="sg-fix-w">The account gave no reason.</p>');
    expect(p.run<string>(`sgNowHtml(${JSON.stringify(feed({ brain: bare }))}, null, null, ${NOW})`)).toContain('<p class="sg-now-sub">The account gave no reason. Head, Search and Risk think with it.');
    // a fix with no words of its own is no reason either: Now says none was given
    expect(p.run<string>(`sgNowHtml(${JSON.stringify(feed({ brain: { ...bare, fix: { code: "something-new", file: "/x", restart: false, words: "" } } }))}, null, null, ${NOW})`)).toContain('<p class="sg-now-sub">The account gave no reason.');
    const none = { ...CATALOG, brain: { ...CATALOG.brain, ok: false }, brains: CATALOG.brains.map((b) => ({ ...b, ok: false, why: undefined })) };
    const setup = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(none)}, sgPaperVenues(), "")`);
    expect(setup).toContain("The account gave no reason.");
    expect(p.run(`sgSetupWords({ maxRiskPct: "1", provider: "claude" }, ${JSON.stringify(none)}, sgPaperVenues()[0], { provider: "claude", model: "claude-opus-5-5", effort: "medium" })`)).toContain("The brain cannot think yet: see 3 · The brain.");
  });

  it("takes the spread line from the feed's hard line, and says it is being read where the feed has none", () => {
    const p = page();
    expect(p.run<string>(`sgRulesHtml(${JSON.stringify(feed({ hard: { maxSpreadPct: 0.45 } }))}, ${JSON.stringify(VIEW)})`)).toContain("≤ 0.45%");
    const unread = p.run<string>(`sgRulesHtml(${JSON.stringify(feed({ hard: undefined }))}, ${JSON.stringify(VIEW)})`);
    expect(unread).toMatch(/<span class="sg-rk">Spread<\/span><span class="sg-rv"><span class="sg-dim">reading…<\/span><\/span>/);
  });

  it("types only a line that arrives after the first paint: one already there is shown whole", async () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.sandbox.requestAnimationFrame = () => 1;
    p.run('ROUTE.tab = "superagent"; var CARD = fakeEl("card")');
    const txt = () => p.out<string>('CARD.querySelector("[data-sg-line]").querySelector("[data-sg-txt]").textContent');
    p.run("SG.typeFloor = 12");
    p.run('sgTypeLine(CARD, { role: "search", line: { seq: 10, text: "LEAD L-0003 | SOL/USDT" }, empty: "" })');
    expect(txt()).toBe("LEAD L-0003 | SOL/USDT");
    expect(p.out('CARD.querySelector("[data-sg-line]").classList.contains("typing")')).toBe(false);
    p.run('sgTypeLine(CARD, { role: "search", line: { seq: 13, text: "LEAD L-0004 | BTC/USDT" }, empty: "" })');
    expect(txt()).toBe("");
    expect(p.out('CARD.querySelector("[data-sg-line]").classList.contains("typing")')).toBe(true);
    // the first read sets that line: everything it brought was already there
    const q = page();
    q.set("A", ACCOUNT);
    q.run('ROUTE.tab = "superagent"; sgAgain = () => {}');
    q.sandbox.fetch = async (path: string) => ({ status: 200, json: async () => (path.startsWith("/api/account/desk/feed") ? feed() : { ok: false }) });
    await q.run("sgRead()");
    expect(q.out("SG.typeFloor")).toBe(12);
  });

  it("says the target as what is left to it, draws a move of cents as cents, and writes no −0.00%", () => {
    const p = page();
    // $25,000 start, $24,998.86 now: $751.14 to go, the desk $1.14 down — said, not hidden in a percentage of the way
    const down = feed({ equity: { nowUsd: 24_998.86, startUsd: 25_000, changeUsd: -1.14, changePct: -0.0046, tail: [[NOW - 30 * MIN, 25_000], [NOW - 5 * MIN, 24_998.86]] }, target: { pct: 3, progressPct: -0.2, reachedUsd: -1.14, targetUsd: 750 } });
    const bal = p.run<string>(`sgBalanceHtml(${JSON.stringify(down)}, null, null, ${NOW})`);
    expect(bal).toContain("Target $25,750.00 (+3%) · $751.14 to go (the desk is $1.14 down)");
    expect(bal).not.toContain("curve's range");
    expect(bal).toContain("(−&lt;0.01%)");
    // the curve's range is never narrower than 0.2% of the start: a $1.14 move is a sliver of the box, never a cliff from top to foot
    const c = p.out<{ lo: number; hi: number }>(`(() => { const c = sgCurve([[0, 25000], [1, 24998.86]], 600, 150, [], 25000); return { lo: c.lo, hi: c.hi, a: c.y(25000), b: c.y(24998.86) }; })()`);
    expect(c.hi - c.lo).toBeGreaterThanOrEqual(50);
    const ys = p.out<{ a: number; b: number }>(`(() => { const c = sgCurve([[0, 25000], [1, 24998.86]], 600, 150, [], 25000); return { a: c.y(25000), b: c.y(24998.86) }; })()`);
    expect(ys.b - ys.a).toBeLessThan(10);
    expect(bal).toContain("of the start shown");
    expect(p.out('[sgPct(-0.0046), sgPct(0.004, 1), sgPct(0), sgPct(-1.5)]')).toEqual(["−<0.01%", "+<0.1%", "0.00%", "−1.50%"]);
    // the take-profit and the stop at the entry's own decimals
    expect(p.out('sgAtDecimals(14.09110001, 14.035)')).toBe("14.091");
  });

  it("lets go of a feed read that never comes back, says so, asks again, and does not use the late answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const p = page();
      p.set("A", ACCOUNT);
      p.run('ROUTE.tab = "superagent"');
      const asked: Array<(v: unknown) => void> = [];
      p.sandbox.fetch = (path: string) => (path.startsWith("/api/account/desk/feed") ? new Promise((r) => asked.push(r)) : new Promise(() => {}));
      p.run("sgBeat(0)");
      await vi.advanceTimersByTimeAsync(5);
      expect(asked).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(10_000);
      // said in the page's own words, since when, and how often it asks: never the browser's error
      expect(p.run<string>("SG.err")).toMatch(/^The account is not answering since \d\d:\d\d New York \(the service may be stopped or restarting\): nothing is read yet\. Asking again every 1 s\.$/);
      expect(p.run("sgMode()")).toBe("error");
      // the beat armed again (within its second: the vm keeps its own clock)
      await vi.advanceTimersByTimeAsync(1_100);
      expect(asked).toHaveLength(2);
      // the first answer, late: not used
      asked[0]!({ status: 200, json: async () => feed() });
      await vi.advanceTimersByTimeAsync(5);
      expect(p.run("SG.desk")).toBeUndefined();
      // the second: read, and the words go
      asked[1]!({ status: 200, json: async () => ({ ok: true, desk: null }) });
      await vi.advanceTimersByTimeAsync(5);
      expect(p.out("SG.desk")).toBeNull();
      expect(p.run("SG.err")).toBe("");
      p.run('ROUTE.tab = "markets"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists every lead the desk holds in the positions, newest first — a P&L only where the desk marked one — and says so where none is open", () => {
    const p = page();
    const leads = [
      lead("L-0050", "confirmed", { sizeUsd: 50, updatedAt: iso(NOW - 4 * MIN) }),
      lead("L-0051", "executed", { sizeUsd: 60, entry: { price: 150, qty: 0.4, at: iso(NOW) }, unrealizedUsd: 1.25, updatedAt: iso(NOW - 3 * MIN) }),
      lead("L-0052", "closing", { sizeUsd: 70, entry: { price: 150, qty: 0.4, at: iso(NOW) }, updatedAt: iso(NOW - 2 * MIN) }),
      lead("L-0053", "executed", { sizeUsd: 80, entry: { price: 150, qty: 0.4, at: iso(NOW) }, unrealizedUsd: 0, updatedAt: iso(NOW - MIN) }),
      lead("L-0054", "closed", { sizeUsd: 90, pnlUsd: 3 }),
      lead("L-0055", "rejected"),
    ];
    const pos = p.run<string>(`sgPositionsHtml(${JSON.stringify(feed({ leads }))})`);
    // the closed and the turned down are not held
    expect([...pos.matchAll(/<tr data-k="([^"]+)">/g)].map((m) => m[1])).toEqual(["L-0053", "L-0052", "L-0051", "L-0050"]);
    expect(pos).toContain("Open positions · 4");
    // a P&L where the desk marked one (a zero is a zero), a dash where it did not; one waiting for the owner by its size, and said so
    const row = (id: string) => (new RegExp(`<tr data-k="${id}">(.*?)</tr>`).exec(pos) || [])[1] || "";
    const none = '<td class="r"><span class="sg-dim">—</span></td>';
    expect([row("L-0051"), row("L-0053")].map((r) => r.includes(none))).toEqual([false, false]);
    expect(row("L-0052")).toContain(none);
    expect(row("L-0050")).toContain('<td class="r">$50.00</td>');
    expect(row("L-0050")).toContain("<td>waits for you</td>");
    expect(p.run<string>(`sgPositionsHtml(${JSON.stringify(feed({ leads: [lead("L-0054", "closed", { pnlUsd: 3 })] }))})`)).toContain("No open position.");
  });

  it("marks the frame when two reads in a row went unanswered: the clocks stop, the pill and Now say since when", () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.run(`ROUTE.tab = "superagent"; var ROOT = fakeEl("root"); SG.desk = ${JSON.stringify(feed())}; SG.view = ${JSON.stringify(VIEW)}; SG.catalog = ${JSON.stringify(CATALOG)}; SG.room = SG.desk.room; sgPaintDesk(ROOT, true)`);
    expect(p.out('ROOT.classList.contains("sg-stale")')).toBe(false);
    // one miss is a blip; two are stale: the pill says since when, no clock is drawn to tick, Now says it in the page's own words
    p.run("sgMiss(true); sgPaintDesk(ROOT, true)");
    expect(p.out('ROOT.classList.contains("sg-stale")')).toBe(false);
    p.run("sgMiss(true); sgPaintDesk(ROOT, true)");
    expect(p.out('ROOT.classList.contains("sg-stale")')).toBe(true);
    const brand = p.run<string>('ROOT.querySelector(\'[data-sg-p="brand"]\').innerHTML');
    expect(brand).toMatch(/<span class="sg-pill sg-pill-off">Not read since \d\d:\d\d<\/span>/);
    expect(brand).not.toContain("data-sg-clock");
    expect(p.run<string>('ROOT.querySelector(\'[data-sg-p="meta"]\').innerHTML')).not.toContain("data-sg-next");
    const now = p.run<string>('ROOT.querySelector(\'[data-sg-p="now"]\').innerHTML');
    expect(now).toMatch(/<p class="sg-now-big" data-tone="dim">Not read since \d\d:\d\d<\/p><p class="sg-now-sub">The account is not answering since \d\d:\d\d New York/);
    expect(now).not.toContain("data-sg-next");
    expect(p.run<string>("SG.err")).toMatch(/^The account is not answering since \d\d:\d\d New York \(the service may be stopped or restarting\): the figures are its last read\. Asking again every 2 s\.$/);
    // asked less often as it stays down: 1, 2, 5, then every 10 s; a second again once it answers
    p.run("sgMiss(true)");
    expect(p.run("sgWaitMs()")).toBe(5_000);
    p.run("sgMiss(true); sgMiss(true)");
    expect(p.run("sgWaitMs()")).toBe(10_000);
    p.run("SG.fails = 0; SG.downSince = 0");
    expect(p.run("sgWaitMs()")).toBe(1_000);
  });

  it("keeps amber for waiting and caution only, a seat's name whole with its standing in words, and no switch of its own", () => {
    const css = source("ui/superagent.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`)) || [])[1] || "";
    expect(rule(".sg-tline")).not.toContain("warn");
    expect(rule(".sg-sline")).not.toBe(rule(".sg-tline"));
    // what uses the area's amber: what waits for the owner (the strip, a banner and a chip waiting on a card, a row of What it did waiting, a
    // card's line, a key not let in, a paused session), a caution (a warning's mark), and a brain that cannot think (the Brain button's edge
    // and its way in, under the pointer too, and Now's sentence)
    const amber = css.split("\n").filter((l) => /var\(--hl-warn/.test(l) && !/^\s*--/.test(l)).map((l) => l.trim().split(" {")[0]);
    expect(amber).toEqual([".sg-warn-t", ".sg-brain.sg-no:hover", ".sg-brain.sg-no:hover .sg-brain-go", ".sg-pill-warn", ".sg-brain.sg-no", ".sg-brain.sg-no .sg-brain-go", ".sg-waits", '.sg-bn[data-tone="wait"]', '.sg-now-big[data-tone="warn"]', '.sg-chipl[data-tone="wait"]', '.sg-di[data-i="wait"] .sg-di-i circle', '.sg-di[data-i="wait"] .sg-di-i path', '.sg-di[data-i="warn"] .sg-di-i path:first-child', '.sg-light[data-l="warn"]', '.sg-light[data-l="warn"] i', ".sg-k-card .sg-msg-t", ".sg-warn-w"]);
    // a seat's name is never cut, and its standing keeps its word under it
    expect(rule(".sg-card-n b")).toContain("white-space: normal");
    expect(rule(".sg-card-n b")).not.toContain("ellipsis");
    expect(rule(".sg-card-n")).toContain("flex-direction: column");
    expect(css).not.toMatch(/\.sg-lw\s*\{[^}]*(clip|display: none)/);
    // the mode switch is the top bar's (shell.css .ta-mode): no pane draws one
    expect(css).not.toContain(".sg-switch");
    expect(source("ui/terminal.js")).not.toContain("sg-switch");
  });

  it("puts the cards waiting for the owner on this page: a strip with each card's lead, what it asks, why, its answer-by, Reject and Approve — signed as the Agents pane signs them", async () => {
    const p = page();
    const CARD = { id: "card-0002", hash: "0xabc", agent: addr(4), reason: "Desk Sniper asks to PAPER · buy 0.411 SOL at Paper account · market · about $59.20", usd: 60, expiresAt: iso(NOW + 30 * MIN) };
    p.set("A", { ...ACCOUNT, cards: [CARD] });
    const view = { ...VIEW, open: [{ ...VIEW.open[0], id: "L-0007", state: "confirmed", entry: undefined, sizeUsd: 60, card: "card-0002" }], cards: [{ id: "card-0002", lead: "L-0007", reason: "buy $60.00 of SOL/USDT", usd: 60 }] };
    p.set("SG.view", view);
    expect(p.out("sgWaiting(SG.view).map((w) => [w.lead.id, w.card.id])")).toEqual([["L-0007", "card-0002"]]);
    p.run('var STRIP = fakeEl("waits"); STRIP.hidden = true; sgPaintWaits(STRIP, true)');
    const strip = p.run<string>("STRIP.innerHTML");
    expect(p.out("STRIP.hidden")).toBe(false);
    expect(strip).toContain('<h3 class="sg-lab" id="sg-waits-h">Waits for you</h3>');
    // what it asks, with one amount — the card's own (what the owner's yes frees: at most, for a buy); who asks and "PAPER" are the row's
    // already, and the card's sentence is whole one pointer away
    expect(strip).toContain('<li class="sg-wr" data-k="card-0002" title="Desk Sniper asks to PAPER · buy 0.411 SOL at Paper account · market · about $59.20"><span class="mono">L-0007</span><b>Buy 0.411 SOL at Paper account</b><span class="sg-dim sg-wr-why">market · costs at most $60.00</span>');
    expect(strip.replace(/title="[^"]*"/g, "")).not.toMatch(/asks to|PAPER ·|\$59\.20/);
    // an older account's shorter wording: still one amount, its quantity read
    p.run(`A.cards[0].reason = "Desk Sniper asks to PAPER · buy 0.411 SOL"; sgPaintWaits(STRIP, true)`);
    expect(p.run<string>("STRIP.innerHTML")).toContain('<b>Buy 0.411 SOL at Paper account</b><span class="sg-dim sg-wr-why">costs at most $60.00</span>');
    p.run(`A.cards[0].reason = ${JSON.stringify(CARD.reason)}`);
    expect(strip).toMatch(/answer by \d\d:\d\d New York/);
    expect(strip).toContain('data-sg-act="card" data-card="card-0002" data-v="approve"');
    // answered: the strip goes
    p.run("A.cards = []; sgPaintWaits(STRIP, true)");
    expect(p.out("STRIP.hidden")).toBe(true);
    // Approve and Reject: the one signature the Agents pane asks (approveCard, the card's hash)
    p.run(`A.cards = [${JSON.stringify(CARD)}]; Owner = { role: "owner" }; var DRAFTS = []; own = async (d) => { DRAFTS.push(d); }`);
    await p.run('sgAct("card", { card: "card-0002", v: "approve" })');
    await p.run('sgAct("card", { card: "card-0002", v: "reject" })');
    expect(p.out("DRAFTS")).toEqual([{ type: "approveCard", card: "card-0002", action: "0xabc", decision: "approve" }, { type: "approveCard", card: "card-0002", action: "0xabc", decision: "reject" }]);
  });

  it("says the room's protocol in plain English, from the lead's own record, the brain's words kept, nothing dropped", () => {
    const p = page();
    const leads = [{ id: "L-0001", side: "buy" }];
    const plain = (text: string) => p.run<string>(`sgPlain(${JSON.stringify({ text, lead: (/L-\d+/.exec(text) || [])[0] })}, ${JSON.stringify(leads)})`);
    expect(plain("LEAD L-0006 | AVAX/USD | long | AVAX keeps its momentum on volume | confidence 0.75 → RISK")).toBe("L-0006 · long AVAX/USD — AVAX keeps its momentum on volume. Confidence 75%. Passed to Risk.");
    expect(plain("RISK CLEARANCE L-0001 | market open · price 62420.7 · spread 0.02% · volume $603,890,041.00 · day's loss room $1,250.00 · size up to $60.00 | the move has room | size $60.00 · TP +0.4% · SL -0.4% · 1 h | Verdict: CLEAR → SNIPER")).toBe("L-0001 cleared at 62,420.7: spread 0.02%, 24h volume $603,890,041.00, $1,250.00 of the day's loss room left. The move has room. Size $60.00 · take-profit +0.4% · stop −0.4% · 1 h. Passed to the Sniper.");
    expect(plain("RISK CLEARANCE L-0003 | the move is already spent on the day | Verdict: REJECT")).toBe("L-0003 rejected: the move is already spent on the day.");
    expect(plain("L-0001: filled 0.00094 BTC at 62425.4 at Momentum · paper (on its own on paper, inside the limit).")).toBe("L-0001 filled: bought 0.00094 BTC at 62,425.4 on Momentum · paper, placed on its own (paper), inside the Sniper's limit.");
    expect(plain("L-0002 closed: stop at 2446.02 (-0.53%) · 0.0245 ETH/USD at 2446.02 · -$0.44 (-0.73% on $60.00)")).toBe("L-0002 closed at the stop (2,446.02, −0.53%): −$0.44 (−0.73% of $60.00).");
    expect(plain("Cycle 3 (the clock): 1 lead scanned, 0 cleared, 0 placed, 2 open.")).toBe("Cycle 3 (on schedule): 1 lead found, none cleared, 2 open.");
    expect(plain("Cycle 4 (you asked): 2 leads scanned, 1 cleared, 1 placed, 3 open.")).toBe("Cycle 4 (you asked): 2 leads found, 1 cleared, 1 placed, 3 open.");
    expect(plain("Cycle 1 (on schedule): 1 lead scanned, 1 cleared, 0 placed, 1 waiting for you, 1 open.")).toBe("Cycle 1 (on schedule): 1 lead found, 1 cleared, 1 waiting for you, 1 open.");
    // any other line: the bars as dots, a role's arrow in words, a true minus — never in a lead's id — a long figure grouped
    expect(plain("LEAD L-10001 | x | y → RISK")).toBe("LEAD L-10001 · x · y — to Risk");
    expect(plain("HALT: the day's loss reached -5% at 125000.5")).toBe("HALT: the day's loss reached −5% at 125,000.5");
  });
});

// ---- the third round: what the owner sees while signing, the header's words, the setup's layout -------------------------------------------

describe("the third round: the frame held while the owner signs, the header's words from the feed, the cards and the seats as they are", () => {
  const FIELDS = { venue: "paper-1", text: "Small, quick entries on the most traded coins", targetPct: "3", maxRiskPct: "1", maxDailyLossPct: "5", hours: "22", everyMin: "5", maxOpen: "3", provider: "claude", "model-claude": "claude-opus-5-5", effort: "medium" };

  it("holds the frame on screen while the owner signs: the feed's beat finding the desk hired does not swap the setup for the desk until the last step is answered", () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.run('ROUTE.tab = "superagent"');
    p.run(`var ROOT = fakeEl("root"); ROOT.dataset.sg = "setup"; var PANE = fakeEl("pane"); PANE.firstElementChild = ROOT; SG.catalog = ${JSON.stringify(CATALOG)}; SG.view = ${JSON.stringify(VIEW)}; SG.desk = ${JSON.stringify(feed())}`);
    // the desk is there (the hire went through) and the owner is still signing its autonomy: the setup stays, its form untouched
    expect(p.run("sgMode()")).toBe("desk");
    p.run("SG.signing = true; sgPaint(PANE, true)");
    expect(p.out("[PANE.innerHTML, SG.shown]")).toEqual(["", "setup"]);
    // answered: the desk comes in
    p.run("SG.signing = false; sgPaint(PANE, true)");
    expect(p.run<string>("PANE.innerHTML")).toContain('<div class="sg" data-sg="desk">');
  });

  it("signs the hire last, with its autonomy in it: a refusal of it leaves no desk hired, so the setup stays and says it there — and a refusal before it the same", async () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.set("SG.catalog", CATALOG);
    p.run('ROUTE.tab = "superagent"; var SIGNING = []; load = async () => {}; Owner = { role: "owner", act: async (d) => (SIGNING.push(SG.signing), d.change === "hire" ? { status: 409, body: { ok: false, refusal: { message: "Momentum is real money: the desk places orders without cards only at a paper account" } } } : { status: 200, body: { ok: true } }), why: (r) => r.body.refusal.message }');
    p.run(`var MSG = { className: "", textContent: "" }; var BTN = { disabled: false }; var FORM = { values: ${JSON.stringify(FIELDS)}, querySelector: (s) => (s === "[data-sg-msg]" ? MSG : s === "button[type=submit]" ? BTN : null) }`);
    await p.run("sgStart(FORM)");
    // every step signed with the frame held, let go after
    expect(p.out("[SIGNING.length, SIGNING.every(Boolean), SG.signing]")).toEqual([10, true, false]);
    // the hire refused: nothing is hired, so the setup's own message says it and nothing is said under a floor that does not exist
    expect(p.run<string>("MSG.textContent")).toMatch(/^9 of 10 signed .*Hire the desk, autonomy on paper: Momentum is real money: .*\. Start the superagent again when you are ready/);
    expect(p.out("[flash, SG.started]")).toEqual(["", null]);
    // refused before the hire: the same
    p.run('Owner.act = async (d) => (d.type === "approveSpend" ? { status: 409, body: { ok: false, refusal: { message: "no" } } } : { status: 200, body: { ok: true } })');
    await p.run("sgStart(FORM)");
    expect(p.out("[flash, SG.started]")).toEqual(["", null]);
    expect(p.run<string>("MSG.textContent")).toMatch(/^6 of 10 signed .*Sniper's trading limit: no\. Start the superagent again when you are ready/);
  });

  it("says the next cycle as due now, or running, at its time — never a frozen 00:00", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const at = iso(NOW);
    const meta = (more: Record<string, unknown>) => p.run<string>(`sgMetaHtml(${JSON.stringify(feed({ routines: { everyMin: 5, nextCycleAt: at }, ...more }))}, null, ${NOW})`);
    expect(meta({ working: null, inFlight: 0 })).toContain(`<span data-sg-next="${at}">due now</span>`);
    expect(meta({ working: { role: "search", what: "scan" }, inFlight: 1 })).toContain(`<span data-sg-next="${at}">running</span>`);
    expect(meta({ working: null, routines: { everyMin: 5, nextCycleAt: iso(NOW + 192_000) } })).toContain(">03:12</span>");
    expect(p.run<string>(`sgNowHtml(${JSON.stringify(feed({ working: null, inFlight: 0, routines: { everyMin: 5, nextCycleAt: at } }))}, null, null, ${NOW})`)).toContain(`<span class="sg-now-c tab-nums">Cycle 14 · next <span data-sg-next="${at}">due now</span></span>`);
    expect(p.out(`[sgNextWords("${at}", null, ${NOW + 400}), sgNextWords("${iso(NOW + 65_000)}", null, ${NOW})]`)).toEqual(["due now", "01:05"]);
  });

  it("names the brain by the provider the desk's view gives where the feed carries none: a scripted brain is a script, never Opus", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const scripted = { ok: true, label: "a script", model: "claude-opus-5-5", spend: { calls: 17, usd: 0, inputTokens: 0, outputTokens: 0 } };
    p.set("SG.view", { ...VIEW, brain: { provider: "scripted", label: "a script", model: "claude-opus-5-5" } });
    const meta = p.run<string>(`sgMetaHtml(${JSON.stringify(feed({ brain: scripted }))}, ${JSON.stringify(CATALOG)}, ${NOW})`);
    expect(meta).toContain("a script · 17 calls · no cost recorded");
    expect(meta).not.toContain("Opus");
    // a provider the feed carries wins; with neither, the model as people say it
    p.set("SG.view", VIEW);
    expect(p.run<string>(`sgMetaHtml(${JSON.stringify(feed({ brain: { ...scripted, provider: "scripted" } }))}, ${JSON.stringify(CATALOG)}, ${NOW})`)).toContain("a script · 17 calls");
    expect(p.run<string>(`sgMetaHtml(${JSON.stringify(feed())}, ${JSON.stringify(CATALOG)}, ${NOW})`)).toContain("Opus 5.5 · 37 calls · ~$0.84");
  });

  it("says paper once in the header, writes a take-profit at the entry's own places, and gives the seats that think no 'ready' while the brain cannot", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const brand = p.run<string>(`sgBrandHtml(${JSON.stringify(feed({ venue: { id: "paper-1", name: "Momentum · paper", usd: 1, paper: true, connected: true } }))}, null, ${NOW})`);
    expect(brand).toContain('<span class="sg-chip">Paper</span><span class="sg-venue">Momentum</span>');
    // a real venue keeps its name whole (no chip beside it)
    expect(p.run<string>(`sgBrandHtml(${JSON.stringify(feed({ venue: { id: "okx", name: "OKX", usd: 1, paper: false, connected: true } }))}, null, ${NOW})`)).toContain('<span class="sg-venue">OKX</span>');
    // 2,457.37 × 1.004 = 2,467.20, never 2,467.2; one place for an entry with one
    // to the entry's places — and more only where those would write the take-profit as the entry itself (14.0911 by 14.091; 5.02 by 5)
    expect(p.out("[sgAtDecimals(2467.2, 2457.37), sgAtDecimals(62736.344, 62486.4), sgAtDecimals(14.0911, 14.091), sgAtDecimals(NaN, 1), sgAtDecimals(5.02, 5), sgAtDecimals(4.98, 5)]")).toEqual(["2,467.20", "62,736.3", "14.0911", "—", "5.02", "4.98"]);
    // no brain: Head, Search and Risk say so in amber with the brain's own words one pointer away; the Exit's plan exits still run
    const no = { ok: false, why: "no key: the brain reads an Anthropic API key from its file", label: "Claude", model: "claude-opus-5-5", spend: { calls: 0, usd: 0 }, fix: { code: "no-key", file: "/x/api-key.json", restart: false, words: "No key for Claude yet." } };
    const cards = p.out<Array<Record<string, string>>>(`sgCards(${JSON.stringify(feed({ brain: no, working: null, inFlight: 0 }))}, ${JSON.stringify(VIEW)}, ${JSON.stringify(CATALOG)}, [], ${NOW})`);
    const by = Object.fromEntries(cards.map((c) => [c.role, c]));
    expect(["head", "search", "risk", "sniper", "exit", "watch"].map((r) => by[r]!.status)).toEqual(["no brain", "no brain", "no brain", "ready", "ready", "not let in"]);
    expect(by.search!.why).toBe("The brain cannot think: no key: the brain reads an Anthropic API key from its file. Until it can, this seat waits: see the Brain, above.");
    expect(p.run<string>(`sgCardHeadHtml(${JSON.stringify(by.search)})`)).toContain('<span class="sg-light" data-l="warn" title="The brain cannot think: no key: the brain reads an Anthropic API key from its file. Until it can, this seat waits: see the Brain, above."><i aria-hidden="true"></i><span class="sg-lw">no brain</span></span>');
    // Now: the account's fix in its own sentence, whole, never cut off
    expect(p.run<string>(`sgNowHtml(${JSON.stringify(feed({ brain: no }))}, null, null, ${NOW})`)).toContain('<p class="sg-now-sub">No key for Claude yet. Head, Search and Risk think with it.');
  });

  it("lays the setup out for its pane: a header across, the steps beside what stands before Start and what the superagent is — and wraps a command at its spaces", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const setup = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(CATALOG)}, sgPaperVenues(), "")`);
    const at = (x: string) => setup.indexOf(x);
    expect(setup.startsWith('<div class="sg-setup-g"><header class="sg-setup-hd">')).toBe(true);
    expect([at('class="sg-setup-hd"'), at('class="sg-setup-ck"'), at('class="sg-setup-f"'), at('class="sg-about"')].every((n, i, a) => n > 0 && (i === 0 || n > a[i - 1]!))).toBe(true);
    // what the superagent is: its eight seats by the catalog's names, each with its duty; the two outside seats an agent of the owner's
    expect(setup).toContain('<h3 class="sg-lab" id="sg-about-h">What the superagent is</h3>');
    expect(setup.match(/<li class="sg-r-[a-z]+"><svg class="sg-blob/g)).toHaveLength(8);
    expect(setup).toContain("<b>Flow</b><span class=\"sg-dim\">Large and informed money — needs a feed · an agent of yours</span>");
    expect(setup).toContain("<b>Risk</b><span class=\"sg-dim\">Clears a lead: size, take-profit, stop</span>");
    // no paper account yet: no form — the checklist beside the seats
    const bare = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(CATALOG)}, [], "")`);
    expect(bare.startsWith('<div class="sg-setup-g sg-setup-bare">')).toBe(true);
    expect(bare).not.toContain("<form");
    const css = source("ui/superagent.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`)) || [])[1] || "";
    // the panel is not held to one corner of a wide pane: two columns from 900 px of pane, one under it
    expect(rule(".sg-setup")).not.toContain("max-width");
    expect(rule(".sg-setup-g")).toContain('grid-template-areas: "hd hd" "form ck" "form about";');
    expect(css).toMatch(/@container \(max-width: 899px\) \{\s*\.sg-setup-g \{ grid-template-columns: minmax\(0, 1fr\); grid-template-rows: none; grid-template-areas: "hd" "ck" "form" "about"; \}/);
    // a command wraps at its spaces ("&&" never split), inside a long path only where it must
    expect(rule(".sg-path")).toContain("white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere;");
    expect(rule(".sg-path")).not.toContain("break-all");
    // the room's scroll area starts under its header's line
    expect(rule(".sg-room > .sg-sec-h")).toContain("border-bottom: 1px solid var(--hl-tabline);");
    // a seat's card is no size container of its own (Chromium lost its contents' height going from a phone's width to a wide one): its
    // width rule reads the pane's
    expect(rule(".sg-card")).not.toContain("container-type");
    expect(css).not.toContain("@container (max-width: 160px)");
  });

  it("says an order the owner placed or approved from its own fields: how much of what, at the price grouped, the fee — the order's id one pointer away", () => {
    const p = page();
    const o = { id: "ord-0011", status: "filled", side: "buy", kind: "crypto", symbol: "BTC/USD", name: "Bitcoin", venueName: "Momentum · paper", qty: 0.00094, filledQty: 0.00094, avgPrice: 62548.3, feeUsd: 0.06, type: "market", note: "filled at 62548.3 · fee $0.06" };
    const said = p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify(o)} })`);
    expect(said).toBe("Bought 0.00094 BTC/USD at 62,548.3 on Momentum · paper · fee $0.06 · ord-0011");
    expect(p.run<string>(`sayHtml(${JSON.stringify(said)})`)).toBe('<span title="Order ord-0011">Bought 0.00094 BTC/USD at 62,548.3 on Momentum · paper · fee $0.06</span>');
    // nothing filled: the order's own type, and the account's reason where it is one
    expect(p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify({ ...o, status: "open", filledQty: 0, type: "limit", limitPrice: 62000, note: "" })} })`)).toBe("Placed 0.00094 BTC/USD · limit 62,000 on Momentum · paper · ord-0011");
    expect(p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify({ ...o, status: "rejected", filledQty: 0, note: "the venue refused it: too small" })} })`)).toBe("Not filled 0.00094 BTC/USD on Momentum · paper · the venue refused it: too small · ord-0011");
    // never "Placed" for an order the venue does not hold: one it did not confirm, one waiting on the owner's wallet, one only sent
    const pend = { ...o, status: "pending", filledQty: 0, type: "market", note: "" };
    expect(p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify({ ...pend, unconfirmed: true, note: "Kraken did not confirm it" })} })`)).toBe("Sent, not confirmed 0.00094 BTC/USD on Momentum · paper · Kraken did not confirm it · ord-0011");
    expect(p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify({ ...pend, walletTxs: [{ to: "0x1" }] })} })`)).toBe("Waiting for your wallet 0.00094 BTC/USD on Momentum · paper · ord-0011");
    expect(p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify(pend)} })`)).toBe("Sent 0.00094 BTC/USD on Momentum · paper · ord-0011");
    // an event contract's fill in cents, as the terminal writes it
    expect(p.run<string>(`saidOf({ kind: "order", order: ${JSON.stringify({ ...o, kind: "event", name: "Fed cut in December? · Yes", qty: 50, filledQty: 50, avgPrice: 0.63, feeUsd: 0 })} })`)).toBe("Bought 50 Fed cut in December? · Yes at 63¢ on Momentum · paper · ord-0011");
    // the account's own summary first, as before; anything else is escaped as it is
    expect(p.run<string>('saidOf({ summary: "Moved $5.00", kind: "order", order: {} })')).toBe("Moved $5.00");
    expect(p.run<string>('sayHtml("a <b> · ord-12x")')).toBe("a &lt;b&gt; · ord-12x");
  });

  it("says a connection in a line — its name and balance, a paper account's as paper money — with how it fills and the rest behind details", () => {
    const p = page();
    // a real venue (service.ts connect: "… connected live · …")
    expect(p.run<string>('sayHtml("Kraken · main connected live · $2,200.50 there now · connected · read only")')).toBe('<b>Kraken · main</b> connected · $2,200.50<details class="inl"><summary>details</summary>connected · read only</details>');
    // a paper account: never its whole paragraph in the toast
    const paper = "Clean room · paper connected · PAPER, no real money · $10,000.00 there now · Clean room · paper: a paper account: fills at the public quote by the account's own rule — a market order at the ask or the bid · a paper account: its orders are rehearsals and its balance is not money, so nothing of it is counted in your net worth or moved from here";
    const said = p.run<string>(`sayHtml(${JSON.stringify(paper)})`);
    expect(said.split("<details")[0]).toBe("<b>Clean room · paper</b> connected · $10,000.00 of paper money");
    expect(said).toContain('<details class="inl"><summary>details</summary>Clean room · paper: a paper account: fills at the public quote');
    // anything else is said as it is
    expect(p.run<string>('sayHtml("Moved $5.00")')).toBe("Moved $5.00");
  });

  it("says a take-profit or a stop as the desk writes it for a price in the thousands — grouped (desk.ts fig) — never as its raw words", () => {
    const p = page();
    expect(p.run<string>('sgExitWords("TP HIT at 61,800 (+1.00%)")')).toMatch(/^at the take-profit \(61,800(\.0+)?, \+1\.00%\)$/);
    expect(p.run<string>('sgExitWords("stop at 62,240.2 (-0.40%)")')).toMatch(/^at the stop \(62,240\.2, [−-]0\.40%\)$/);
    expect(p.run<string>('sgExitWords("TP HIT at 152.25 (+1.50%)")')).toMatch(/^at the take-profit \(152\.25, \+1\.50%\)$/);
  });
});

// ---- the Brains sheet from this pane --------------------------------------------------------------------------------------------------------

describe("the Brains sheet (ui/brains.js) from the floor's header and the setup", () => {
  it("opens from the header's Brain stat on the brain the desk thinks with, offering Use this brain; from the setup on the form's brain, offering the pick into the form", async () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.run(`var OPENED = []; openBrains = (ctx) => OPENED.push(ctx); SG.catalog = ${JSON.stringify(CATALOG)}; SG.view = ${JSON.stringify({ ...VIEW, brain: { provider: "claude", model: "claude-opus-5-5", effort: "medium" } })}; SG.desk = ${JSON.stringify(feed({ brain: { ...feed().brain, provider: "claude" } }))}`);
    // the header: always the same act, ready or not; a browser that only looks may open it too (its buttons are off there)
    p.run('Owner = { role: "looking" }');
    await p.run('sgAct("brain", {})');
    expect(p.out("[OPENED[0].where, OPENED[0].pick, OPENED[0].desk(), OPENED[0].cur(), typeof OPENED[0].form, OPENED[0].catalog.brains.length]")).toEqual(["superagent", "claude", true, { provider: "claude", model: "claude-opus-5-5", effort: "medium" }, "undefined", 2]);
    // the earlier act, from a page drawn before, lands in the same place
    await p.run('sgAct("fix", {})');
    expect(p.out("OPENED[1].where")).toBe("superagent");
    // the setup: on the provider asked for, no desk to switch, the pick going into the setup's form
    await p.run('sgAct("brains", { v: "openai" })');
    expect(p.out('[OPENED[2].where, OPENED[2].pick, OPENED[2].desk(), typeof OPENED[2].form]')).toEqual(["setup", "openai", false, "function"]);
    // after a change there: the desk and its catalog read again at once
    p.run("SG.viewAt = 12345; OPENED[0].after()");
    expect(p.out("SG.viewAt")).toBe(0);
  });

  it("keeps what was typed in the setup's form when a key saved meanwhile flips a brain to ready and the form is drawn again", () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.run(`var KEPT = []; var BACK = []; formKeep = (form) => (KEPT.push(form && form.sel), (next) => BACK.push(next && next.sel)); SG.catalog = ${JSON.stringify(CATALOG)}; SG.params = {}; var ROOT = fakeEl("root")`);
    p.run("sgPaintSetup(ROOT, true)");
    // the brain becomes ready: the form is drawn again, what was typed read before and put back after
    p.run(`SG.catalog = ${JSON.stringify({ ...CATALOG, brains: CATALOG.brains.map((b) => ({ ...b, ok: true })) })}; sgPaintSetup(ROOT, true)`);
    expect(p.out("[KEPT.length, BACK.length, KEPT[1], BACK[1]]")).toEqual([2, 2, "form.sg-setup-f", "form"]);
  });
});

// ---- the brain's fields drawn again: the choice put back, and what shows under it, agree ----------------------------------------------------

describe("the brain's fields, drawn again with what was typed put back (core formKeep), in a small DOM", () => {
  const ALL3 = ["low", "medium", "high"];
  /** a catalog with three brains: Claude ready (the catalog's own pick, every effort), DeepSeek with no key (low and high only), Groq with no
   * key (none of the desk's efforts: its own default), and Ollama on this machine (no key needed) */
  const brains = [
    { ok: true, id: "claude", label: "Claude", model: "claude-opus-5-5", models: [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", inUsd: 4, outUsd: 20 }], how: "the Anthropic API", efforts: ALL3, kind: "model-api" },
    { ok: false, id: "deepseek", label: "DeepSeek", models: [], why: "no key", efforts: ["low", "high"], kind: "model-api", fix: { code: "no-key", file: "/x/credentials/brains/deepseek.json", restart: false, words: "No key for DeepSeek yet." } },
    { ok: false, id: "groq", label: "Groq", models: [], why: "no key", efforts: [], kind: "model-api", fix: { code: "no-key", file: "/x/credentials/brains/groq.json", restart: false, words: "No key for Groq yet." } },
    { ok: false, id: "ollama", label: "Ollama", models: [], why: "name the model your server serves", efforts: [], kind: "local", keyOptional: true, baseUrl: "http://localhost:11434/v1" },
  ];
  const CAT = { ...CATALOG, brains, bounds: CATALOG_BOUNDS };
  const flipped = (id: string) => ({ ...CAT, brains: brains.map((b) => (b.id === id ? { ...b, ok: true, why: undefined, fix: undefined } : b)) });
  /** what the form shows now: the select's choice, the blocks on show, the model typed for DeepSeek, the efforts offered and the one chosen */
  const shows = (form: string) => `(() => { const f = ${form}; const e = f.querySelector('select[name="effort"]'); return { provider: f.querySelector('select[name="provider"]').value, shown: f.querySelectorAll(".dk-brain-of").filter((b) => !b.hidden).map((b) => b.dataset.brain), model: f.querySelector('[name="model-deepseek"]').value, efforts: e.options.map((o) => o.value), effort: e.value, effortShown: !(e.closest("[data-dk-effort]") || e.parentNode).hidden }; })()`;
  const pick = (form: string, id: string) => `(() => { const s = ${form}.querySelector('select[name="provider"]'); s.value = "${id}"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`;

  it("the superagent's setup: a key saved meanwhile draws the form again, and the Brain select put back to DeepSeek shows DeepSeek's block — never the catalog's pick under it — and offers DeepSeek's efforts", () => {
    const p = page(undefined, { dom: true });
    p.set("A", ACCOUNT);
    p.run(`SG.catalog = ${JSON.stringify(CAT)}; SG.params = {}; var ROOT = mini('<div data-sg-p="setup"></div>'); sgPaintSetup(ROOT, true)`);
    const form = 'ROOT.querySelector("form.sg-setup-f")';
    // drawn on the catalog's pick: Claude's block, every effort
    expect(p.out(shows(form))).toMatchObject({ provider: "claude", shown: ["claude"], efforts: ALL3, effort: "medium" });
    // the owner picks DeepSeek: its block, its two efforts (no medium), then names its model and picks low
    p.run(pick(form, "deepseek"));
    p.run(`${form}.querySelector('[name="model-deepseek"]').value = "deepseek-v4-pro"; ${form}.querySelector('select[name="effort"]').value = "low"`);
    expect(p.out(shows(form))).toMatchObject({ provider: "deepseek", shown: ["deepseek"], model: "deepseek-v4-pro" });
    // a key saved for Groq in the Brains sheet: the setup is drawn again, what was typed put back — and what shows agrees with the choice
    p.run(`SG.catalog = ${JSON.stringify(flipped("groq"))}; sgPaintSetup(ROOT, true)`);
    expect(p.out(shows(form))).toMatchObject({ provider: "deepseek", shown: ["deepseek"], model: "deepseek-v4-pro" });
    // with DeepSeek's own efforts on offer, the one chosen kept
    expect(p.out(shows(form))).toEqual({ provider: "deepseek", shown: ["deepseek"], model: "deepseek-v4-pro", efforts: ["low", "high"], effort: "low", effortShown: true });
    // and Start signs exactly what shows: DeepSeek, the model typed, low
    expect(p.out(`sgBrainOf(formFields(${form}), SG.catalog)`)).toEqual({ provider: "deepseek", model: "deepseek-v4-pro", effort: "low", price: null });
  });

  it("the Agents pane's hiring form: the same — the choice put back after a redraw shows its own block and its own efforts, and Hire signs what shows", () => {
    const p = page(undefined, { dom: true });
    p.set("A", { ...ACCOUNT, keys: [] });
    p.run(`DK.catalog = ${JSON.stringify(CAT)}; DK.view = null; var PANE = mini('<div data-dk-part="body"></div>'); dkDraw(PANE, true)`);
    const form = 'PANE.querySelector("form.dk-hire-f")';
    expect(p.out(shows(form))).toMatchObject({ provider: "claude", shown: ["claude"] });
    p.run(pick(form, "deepseek"));
    p.run(`${form}.querySelector('[name="model-deepseek"]').value = "deepseek-flash"; ${form}.querySelector('select[name="effort"]').value = "high"`);
    p.run(`DK.catalog = ${JSON.stringify(flipped("groq"))}; dkDraw(PANE, true)`);
    expect(p.out(shows(form))).toMatchObject({ provider: "deepseek", shown: ["deepseek"], model: "deepseek-flash" });
    expect(p.out(shows(form))).toEqual({ provider: "deepseek", shown: ["deepseek"], model: "deepseek-flash", efforts: ["low", "high"], effort: "high", effortShown: true });
    expect(p.out(`dkBrainDraft(formFields(${form}), DK.catalog.brains)`)).toEqual({ provider: "deepseek", model: "deepseek-flash", effort: "high", price: null });
  });

  it("offers each provider's own efforts as the Brain select changes: never medium for DeepSeek, none at all (and none signed) for a provider that takes none, the one chosen kept where it is still offered", () => {
    const p = page(undefined, { dom: true });
    p.set("A", ACCOUNT);
    p.run(`SG.catalog = ${JSON.stringify(CAT)}; SG.params = {}; var ROOT = mini('<div data-sg-p="setup"></div>'); sgPaintSetup(ROOT, true)`);
    const form = 'ROOT.querySelector("form.sg-setup-f")';
    p.run(`${form}.querySelector('select[name="effort"]').value = "high"`);
    p.run(pick(form, "deepseek"));
    expect(p.out(shows(form))).toMatchObject({ efforts: ["low", "high"], effort: "high" });
    // Groq takes none of the three: the field hidden and off, and the brain signed without one (Groq's own default applies)
    p.run(pick(form, "groq"));
    p.run(`${form}.querySelector('[name="model-groq"]').value = "openai/gpt-oss-120b"`);
    expect(p.out(shows(form))).toMatchObject({ shown: ["groq"], efforts: [], effortShown: false });
    expect(p.out(`sgBrainOf(formFields(${form}), SG.catalog)`)).toEqual({ provider: "groq", model: "openai/gpt-oss-120b", price: null });
    // back to Claude: all three again, medium where nothing else is chosen
    p.run(pick(form, "claude"));
    expect(p.out(shows(form))).toMatchObject({ shown: ["claude"], efforts: ALL3, effort: "medium", effortShown: true });
    // the draft never carries an effort the provider does not take, whatever the form's fields say
    expect(p.out(`dkBrainDraft({ provider: "deepseek", "model-deepseek": "deepseek-flash", effort: "medium" }, SG.catalog.brains)`)).toEqual({ provider: "deepseek", model: "deepseek-flash", price: null });
  });

  it("refuses a model that looks like an API key in the setup and the hiring form, in words that never repeat it", () => {
    const p = page(undefined, { dom: true });
    p.set("A", ACCOUNT);
    const madeUp = `gsk_${"Ab3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY3zA5bC7dE9fG1hJ3kL5"}`;
    const d = p.out<string>(`dkBrainDraft({ provider: "groq", "model-groq": ${JSON.stringify(madeUp)} }, ${JSON.stringify(brains)})`);
    expect(d).toBe("That looks like an API key, not a model's name: a key goes in the key field, never in the model. Nothing is signed or sent while it is there.");
    expect(d).not.toContain(madeUp.slice(4, 14));
    // the setup's words beside Start say it too, and Start would sign nothing
    expect(p.out(`sgBrainOf({ provider: "groq", "model-groq": ${JSON.stringify(madeUp)} }, ${JSON.stringify(CAT)})`)).toBe(d);
  });

  it("asks no key of a server on this machine: its block opens the Brains sheet to set it up and says the account's own words; the checklist says it needs no key", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const local = { ...CAT, brain: { ...CAT.brain, provider: "ollama" } };
    const setup = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(local)}, sgPaperVenues(), "")`);
    expect(setup).toContain('data-sg-act="brains" data-v="ollama" data-fk="sg:brains:ollama">Set it up ›</button><p class="sg-dim">Runs on this machine and needs no key. name the model your server serves</p>');
    expect(setup).not.toContain('data-v="ollama" data-fk="sg:brains:ollama">Type its key ›');
    // a provider that does take a key keeps its own way to it
    expect(setup).toContain('data-v="deepseek" data-fk="sg:brains:deepseek">Type its key ›</button>');
    const check = p.run<string>(`sgCheckHtml(true, ${JSON.stringify(local)}, sgPaperVenues(), { provider: "ollama" }, true)`);
    expect(check).toContain("Not yet for Ollama: it runs on this machine and needs no key — what it needs is under 3 · The brain, below.");
    expect(check).not.toContain("type its key");
    // with no form on show, the account's own words in full — a path in them free to break at each "/" on a narrow pane
    const why = { ...local, brains: local.brains.map((b) => (b.id === "ollama" ? { ...b, why: "a file (/x/credentials/brains/ollama.json) only for another address" } : b)) };
    expect(p.run<string>(`sgCheckHtml(true, ${JSON.stringify(why)}, sgPaperVenues(), { provider: "ollama" }, false)`)).toContain("Not yet for Ollama: it runs on this machine and needs no key. a file (/<wbr>x/<wbr>credentials/<wbr>brains/<wbr>ollama.json) only for another address");
  });
});

// ---- a server on this machine in the setup: judged with the model the form names --------------------------------------------------------

describe("a server on this machine in the setup: ready once its model is named — the checklist, its block and the words beside Start judge with the form's model", () => {
  /** Ollama as the account says it with no file and no model named (brain-openai.ts openaiReach): not ready, fix "no-key", its usual
   * address, no key — the one want a model's name */
  const OLLAMA = { ok: false, id: "ollama", label: "Ollama", models: [], why: "Ollama needs a model's name: name one your server serves when you choose it as the desk's brain (Use this brain) — it is reached at http://localhost:11434/v1 with no key, and needs no file", fix: { code: "no-key", file: "/x/credentials/brains/ollama.json", restart: false, words: "Name the model when you choose Ollama as the desk's brain — nothing else is needed." }, efforts: [], kind: "local", keyOptional: true, baseUrl: "http://localhost:11434/v1", keyFrom: "none" };
  // the catalog's own pick, Ollama, as the account gives it unhired: no model of its own (desk.ts catalog)
  const CAT = { ...CATALOG, brains: [CATALOG.brains[0], OLLAMA], brain: { ok: false, provider: "ollama", label: "Ollama", model: "", models: [], effort: "medium" }, bounds: CATALOG_BOUNDS };

  it("the checklist: not yet with no model, and ✓ ready with the model once it is typed — never \"not yet\" with qwen3:8b in its field", () => {
    const p = page(undefined, { dom: true });
    p.set("A", ACCOUNT);
    p.run(`SG.catalog = ${JSON.stringify(CAT)}; SG.params = {}; var ROOT = mini('<div data-sg-p="setup"></div>'); sgPaintSetup(ROOT, true); var FORM = ROOT.querySelector("form.sg-setup-f")`);
    const check = () => p.run<string>(`ROOT.querySelector('[data-sg-p="check"]').innerHTML`);
    const words = () => p.run<string>("FORM.querySelector('[data-sg-words]').textContent");
    // no model yet: not yet, and what it wants said in the setup's own words — the model, typed under 3 · The brain
    expect(check()).toContain("Not yet for Ollama: it runs on this machine and needs no key, only the name of a model it serves — type it under 3 · The brain, below.");
    expect(words()).toContain("The brain cannot think yet: see 3 · The brain.");
    // the model typed (the setup's words are drawn again on every input): ready with it once Start signs it
    p.run(`FORM.querySelector('[name="model-ollama"]').value = "qwen3:8b"; sgSetupSay(FORM)`);
    expect(check()).toContain('<li class="sg-ck" data-ok="1"><span class="sg-ck-n" aria-hidden="true">✓</span><div class="sg-ck-b"><b>A brain key<span class="sr">: done</span></b><div>Ollama is ready with qwen3:8b once you sign: the account calls it at http://localhost:11434/v1 with no key. It runs on this machine: nothing is billed.</div></div></li>');
    expect(check()).not.toContain("Not yet for Ollama");
    expect(check()).not.toContain("It can start before the brain can think");
    expect(words()).toContain("The brain (Ollama · qwen3:8b) needs no key. It runs on this machine: nothing is billed. It is ready with qwen3:8b once you sign.");
    expect(words()).not.toContain("cannot think");
    // and Start signs exactly that model
    expect(p.out("sgBrainOf(formFields(FORM), SG.catalog)")).toEqual({ provider: "ollama", model: "qwen3:8b", price: null });
  });

  it("its block under the model field says what it wants in the setup's own words — never the account's sentence naming the Brains sheet's button", () => {
    const p = page();
    p.set("A", ACCOUNT);
    const setup = p.run<string>(`sgSetupHtml(true, ${JSON.stringify(CAT)}, sgPaperVenues(), "")`);
    expect(setup).toContain('<span class="tag">needs a model</span><button type="button" class="sg-btn sg-btn-p sg-btn-s" data-sg-act="brains" data-v="ollama" data-fk="sg:brains:ollama">Set it up ›</button><p class="sg-dim">Runs on this machine and needs no key. Name a model it serves, above: it is ready with that model once you sign Start.</p>');
    expect(setup).not.toContain("(Use this brain)");
    expect(setup).toContain('<option value="ollama" selected>Ollama · Local · needs a model</option>');
  });

  it("the words beside Start speak of the brain the form picked — never another brain's standing — while its draft is still a sentence", () => {
    const p = page();
    p.set("A", ACCOUNT);
    // Ollama picked, no model yet (the draft a sentence): Claude, first in the catalog and ready, is not the one spoken of
    const words = p.run<string>(`sgSetupWords({ maxRiskPct: "1", provider: "ollama" }, ${JSON.stringify(CAT)}, sgPaperVenues()[0], sgBrainOf({ provider: "ollama" }, ${JSON.stringify(CAT)}))`);
    expect(words).toContain("The brain cannot think yet: see 3 · The brain.");
    expect(words).not.toContain("Claude");
    // a server that needs no key at an address saved on another machine: its server there, never "this machine"
    const remote = { ...CAT, brains: [CATALOG.brains[0], { ...OLLAMA, ok: true, why: undefined, fix: undefined, keyFrom: "file", baseUrl: "https://ollama.example.com/v1", how: "the key file credentials/brains/ollama.json (no key: a local server) · ollama.example.com" }] };
    expect(p.run<string>(`sgSetupWords({ maxRiskPct: "1", provider: "ollama" }, ${JSON.stringify(remote)}, sgPaperVenues()[0], { provider: "ollama", model: "qwen3:8b" })`)).toContain("The brain (Ollama · qwen3:8b) needs no key. It is your server at ollama.example.com.");
    expect(p.run<string>(`sgCheckHtml(true, ${JSON.stringify(remote)}, sgPaperVenues(), { provider: "ollama", "model-ollama": "qwen3:8b" }, true)`)).toContain("Ollama is ready, through the key file credentials/brains/ollama.json (no key: a local server) · ollama.example.com. It is your server at ollama.example.com.");
  });
});

describe("the desk read again as it moves (feat/paper-live p1: the account's push channel)", () => {
  it("a desk event reads the desk now rather than at the beat — at most every 150 ms through a burst, and right after a read on its way — and the beat is the fallback, four seconds apart, while the stream is connected", () => {
    const p = page();
    p.run(`ROUTE.tab = "superagent"; A = {}; var BEATS = []; setTimeout = (fn, ms) => (BEATS.push(ms), 7); clearTimeout = () => {};`);
    // a beat waiting a second: the desk moved, so it is read now
    p.run("SG.timer = 3; SG.tickAt = Date.now() - 1000; sgNudge()");
    expect(p.out("[BEATS, SG.timer]")).toEqual([[0], 7]);
    // a read began 100 ms ago: the next waits out the rest of the 150
    p.run("BEATS.length = 0; SG.timer = 3; SG.tickAt = Date.now() - 100; sgNudge()");
    expect(p.out("BEATS")[0]).toBeGreaterThanOrEqual(45);
    expect(p.out("BEATS")[0]).toBeLessThanOrEqual(50);
    // a read on its way: marked, and the beat comes 150 ms after it ends instead of a second
    p.run("BEATS.length = 0; SG.timer = -1; sgNudge()");
    expect(p.out("[BEATS, SG.nudged]")).toEqual([[], true]);
    // another pane showing: nothing is read for it
    p.run('BEATS.length = 0; SG.timer = 0; SG.nudged = false; ROUTE.tab = "trade"; sgNudge()');
    expect(p.out("BEATS")).toEqual([]);
    // no stream (this stand-in has none): a second; the stream connected: four — but no later than the desk's view and the open leads'
    // prices fall due (each every five seconds, sgSlow): a second and a half to the first of them here, a second at the least
    expect(p.run("sgWaitMs()")).toBe(1_000);
    p.run('var stHealth = () => "connected"');
    p.run("SG.viewAt = Date.now(); SG.quotesAt = Date.now()");
    expect(p.run("sgWaitMs()")).toBe(4_000);
    p.run("SG.viewAt = Date.now() - 3_500");
    expect(p.run("sgWaitMs()")).toBeGreaterThanOrEqual(1_400);
    expect(p.run("sgWaitMs()")).toBeLessThanOrEqual(1_500);
    p.run("SG.quotesAt = Date.now() - 10_000");
    expect(p.run("sgWaitMs()")).toBe(1_000);
    p.run("SG.viewAt = Date.now(); SG.quotesAt = Date.now()");
    // a miss still backs off as before
    p.run("SG.fails = 2");
    expect(p.run("sgWaitMs()")).toBe(2_000);
    expect(source("ui/superagent.js")).toContain('if (typeof stOn === "function") stOn("desk", sgNudge);');
  });
});

// ---- the desk made plain: the next step, how it works, one tab at a time; the paper accounts' sharks ----------------------------------

describe("the desk made plain: the brain a button that says so, the next step, how it works, one tab under the positions at a time", () => {
  const NO = { ok: false, why: "no key", fix: { code: "no-key", words: "No key is in the key file." }, label: "Claude", model: "claude-opus-5-5", spend: { calls: 0, usd: 0 } };

  it("says the next step under the header — connect a brain while it cannot think, else how to use it until put away — and how it works in a sheet", () => {
    const p = page();
    p.set("A", ACCOUNT);
    // a brain that cannot think: the one thing missing, a button that opens the Brains sheet at its paste row
    const next = p.run<string>(`sgNextHtml(${JSON.stringify(feed({ brain: NO }))}, null)`);
    expect(next).toContain("<b>Next: connect a brain.</b>");
    expect(next).toContain("Paste an API key from any provider: the account tells whose it is and picks its best model.");
    expect(next).toContain('<button type="button" class="sg-btn sg-btn-p" data-sg-act="brain" data-fk="sg:next">Connect a brain</button>');
    expect(next).toContain('data-sg-act="how"');
    // a brain that thinks: how to use it, with the cycle's own minutes, until "Got it"
    const how = p.run<string>(`sgNextHtml(${JSON.stringify(feed())}, null)`);
    expect(how).toContain("The desk trades this paper account by itself, every 5 minutes.");
    expect(how).toContain('<button type="button" class="sg-btn sg-btn-g" data-sg-act="guide-off" data-fk="sg:guide-off">Got it</button>');
    expect(p.run(`[sgEvery(${JSON.stringify(feed({ routines: { everyMin: 1 } }))}), sgEvery({}), sgEvery(null)]`)).toEqual(["every minute", "", ""]);
    // put away: kept in this browser, and nothing said after — but a brain that cannot think is said all the same
    p.run('sgAct("guide-off", {})');
    expect(p.stored).toContain("account.deskGuideOff");
    expect(p.run(`sgNextHtml(${JSON.stringify(feed())}, null)`)).toBe("");
    expect(p.run<string>(`sgNextHtml(${JSON.stringify(feed({ brain: NO }))}, null)`)).toContain("Connect a brain");
    // How it works: a sheet, its points in order, the cycle's minutes the feed's
    p.run('var SHEETS = []; openSheet = (html, o) => void SHEETS.push([html, o.title])');
    p.run(`SG.desk = ${JSON.stringify(feed())}; sgAct("how", {})`);
    const [html, title] = p.out<[string, string]>("SHEETS[0]");
    expect(title).toBe("How the superagent works");
    expect([...html.matchAll(/<li><b>([^<]+)<\/b>/g)].map((m) => m[1])).toEqual(["It trades a paper account by itself.", "A brain thinks for three seats.", "Every 5 minutes, a cycle.", "Autonomy: Cards or Auto on paper.", "The controls.", "Reading it.", "Sharks for what it makes."]);
    // and the header's way to it, at the end of the desk's name line
    expect(p.run<string>(`sgBrandHtml(${JSON.stringify(feed())}, null, ${NOW})`)).toMatch(/<button type="button" class="sg-link sg-how-l" data-sg-act="how" data-fk="sg:how">How it works<\/button>$/);
  });

  it("opens the Brains sheet at its paste row from the header while the brain the header shows cannot think, and says what each control does where it is pointed at", () => {
    const p = page();
    p.set("A", ACCOUNT);
    p.run('var OPENED = []; openBrains = (ctx) => void OPENED.push(ctx.focus || "")');
    p.run(`SG.desk = ${JSON.stringify(feed({ brain: NO }))}; sgAct("brain", {})`);
    p.run(`SG.desk = ${JSON.stringify(feed())}; sgAct("brain", {})`);
    expect(p.out("OPENED")).toEqual(["paste", ""]);
    const tools = p.run<string>(`sgToolsHtml(${JSON.stringify(feed())}, true)`);
    expect(tools).toContain('title="No new cycle until you resume; the desk still follows its open orders">Pause</button>');
    expect(tools).toContain('title="Cards: each order the seats want waits for your yes">Cards</button>');
    expect(tools).toContain('title="Auto on paper: the seats place their orders themselves, each inside its trading limit">Auto on paper</button>');
    expect(tools).toContain('title="End the session: no cycle runs, and the open leads are not managed until a new one starts">End</button>');
    // a browser that only looks: every control says that instead
    expect(p.run<string>(`sgToolsHtml(${JSON.stringify(feed())}, false)`)).not.toContain("No new cycle until you resume");
  });

  it("shows one tab under the positions at a time — kept in this browser, the arrows moving between them — the chart over them, never in a tab", () => {
    const p = page(undefined, { dom: true });
    p.set("A", ACCOUNT);
    p.run(`var PANE = mini(sgFrame("desk")); SG.desk = ${JSON.stringify(feed())}; SG.view = ${JSON.stringify(VIEW)}; sgWire(PANE)`);
    const pane = p.run("PANE");
    (p.sandbox.document as Fake).getElementById = (id: string) => (id === "pane-superagent" ? pane : null);
    const shown = () => p.out<string[]>('PANE.querySelectorAll("[data-sg-tp]").filter((x) => !x.hidden).map((x) => x.dataset.sgTp)');
    const pressed = () => p.out<string[]>('PANE.querySelectorAll("[data-sg-tab]").filter((b) => b.getAttribute("aria-selected") === "true" && b.getAttribute("tabindex") === "0").map((b) => b.dataset.sgTab)');
    expect(shown()).toEqual(["equity"]);
    // the tabs: the equity, the seats, the room, the rules — the chart is the page's main row, in no tab
    expect(p.out('PANE.querySelectorAll("[data-sg-tab]").map((b) => b.dataset.sgTab)')).toEqual(["equity", "seats", "room", "rules"]);
    expect(p.out('PANE.querySelector("[data-sg-chart]").closest("[data-sg-tp]")')).toBeNull();
    p.run('sgTab("room")');
    expect([shown(), pressed()]).toEqual([["room"], ["room"]]);
    expect(p.stored).toContain("account.deskTab");
    // a tab there is not: nothing moves
    p.run('sgTab("chart")');
    expect(shown()).toEqual(["room"]);
    // the arrows move to the next tab and show it, round the ends; Home and End to the first and the last; the tab pressed takes the focus
    const key = (k: string) => p.run(`PANE.querySelector('[data-sg-tab="${p.run<string>("SG.tab")}"]').dispatchEvent({ type: "keydown", key: "${k}", preventDefault() {} })`);
    key("ArrowRight");
    expect(shown()).toEqual(["rules"]);
    key("ArrowRight");
    expect(shown()).toEqual(["equity"]);
    key("ArrowLeft");
    expect(shown()).toEqual(["rules"]);
    key("Home");
    expect(shown()).toEqual(["equity"]);
    key("End");
    expect([shown(), p.out("PANE.doc.focused.dataset.sgTab")]).toEqual([["rules"], "rules"]);
    // the tab picked last opens the next frame; a stored word that is no tab now (the chart's or the balance's, from before) opens the equity
    for (const [kept, want] of [["seats", "seats"], ["chart", "equity"], ["balance", "equity"], ["nonsense", "equity"]]) {
      p.sandbox.localStorage = { getItem: (k: string) => (k === "account.deskTab" ? kept : null), setItem() {}, removeItem() {} };
      p.run('SG.tab = ""');
      expect(p.run("sgTabNow()"), kept).toBe(want);
    }
  });
});

describe("the paper accounts' sharks: one more in the ocean for each whole 1% the paper accounts made since they started, one fewer for each 1% lost", () => {
  const MOMENTUM = { id: "paper-2", name: "Momentum · paper", live: true, paper: true, usd: 25_850, paperStartUsd: 25_000, trade: { can: true, kinds: ["spot"] } };

  it("counts only the paper accounts that say what they started with — the paper money added since is put in, never made — in whole steps toward zero", () => {
    const p = page(PAGE, { full: true });
    p.set("A", { ...ACCOUNT, venues: [PAPER, REAL, MOMENTUM] });
    // the paper account with no start of its own and the real one are left out: +$850 on $25,000
    expect(p.out("shPaperGain()")).toMatchObject({ usd: 850, accounts: 1 });
    expect(p.out<number>("shPaperGain().pct")).toBeCloseTo(3.4, 9);
    expect(p.run("shSharkBonus(shPaperGain())")).toBe(3);
    // a top-up is put in, not made; a paper account disconnected is left out
    p.set("A", { ...ACCOUNT, venues: [MOMENTUM, { ...MOMENTUM, id: "paper-3", usd: 10_300, paperStartUsd: 8_000, paperAddedUsd: 2_000 }, { ...MOMENTUM, id: "paper-4", live: false, usd: 1, paperStartUsd: 99_000 }] });
    expect(p.out("shPaperGain()")).toMatchObject({ usd: 1_150, accounts: 2 });
    expect(p.run("shSharkBonus(shPaperGain())")).toBe(3);
    // losses take sharks away; under a whole 1% either way changes nothing; none that says its start: none
    expect(p.run('[shSharkBonus({ pct: -2.4 }), shSharkBonus({ pct: -0.4 }), shSharkBonus({ pct: 0.99 }), shSharkBonus({ pct: 12.7 }), shSharkBonus(null)]')).toEqual([-2, 0, 0, 12, 0]);
    p.set("A", { ...ACCOUNT, venues: [PAPER, REAL] });
    expect(p.out("shPaperGain()")).toBeNull();
  });

  it("asks the ocean for them on each drawing, says a shark joining or leaving once — never on the page's first reading, never when the water did not change — and says how many swim on the paper book", () => {
    const p = page(PAGE, { full: true });
    p.run("var TOASTS = []; toast = (t, k) => void TOASTS.push([t, k]); var ASKED = []; var SEA = { bonus: (n) => (ASKED.push(n), Math.max(1, Math.min(12, 4 + n))) }");
    p.set("A", { ...ACCOUNT, venues: [{ ...MOMENTUM, usd: 25_000 }] });
    // the page's first reading: the ocean asked, nothing said
    p.run("shSharks(SEA)");
    expect(p.out("[ASKED, SH.sharks, SH.sharkCount, TOASTS]")).toEqual([[0], 0, 4, []]);
    // up 3.4%: three join, said once
    p.set("A", { ...ACCOUNT, venues: [MOMENTUM] });
    p.run("shSharks(SEA); shSharks(SEA)");
    expect(p.out("[SH.sharks, SH.sharkCount]")).toEqual([3, 7]);
    expect(p.out("TOASTS")).toEqual([["3 sharks joined the water: your paper accounts stand at +3.4% since they started — a shark for each whole 1%.", "info"]]);
    // the paper book says how many swim, and why
    expect(p.run("shSharkWords()")).toBe("7 sharks in the water — one more for each 1% your paper accounts make since they started (twelve at most), one fewer for each 1% lost; they are up 3.4%: +3.");
    p.run("PF.histPaper = new Map(); PF.holdPaper = null; PF.holdReal = null");
    expect(p.run<string>('pfPaperWorthHtml({ kind: "all", id: "", name: "All accounts" })')).toContain('<p class="dim small pf-note pf-sharks">7 sharks in the water — one more for each 1%');
    expect(p.run<string>('pfPaperWorthHtml({ kind: "venue", id: "paper-2", name: "Momentum · paper" })')).not.toContain("pf-sharks");
    // down 2.1%: five leave (from seven to two), said once
    p.set("A", { ...ACCOUNT, venues: [{ ...MOMENTUM, usd: 24_475 }] });
    p.run("shSharks(SEA)");
    expect(p.out("TOASTS.at(-1)")).toEqual(["5 sharks left the water: your paper accounts stand at −2.1% since they started — a shark for each whole 1%.", "info"]);
    // at the most already: asked, and nothing said, since the water did not change
    p.set("A", { ...ACCOUNT, venues: [{ ...MOMENTUM, usd: 30_000 }] });
    p.run("shSharks(SEA)");
    const said = p.out<unknown[]>("TOASTS").length;
    p.set("A", { ...ACCOUNT, venues: [{ ...MOMENTUM, usd: 31_000 }] });
    p.run("shSharks(SEA)");
    expect(p.out("[SH.sharks, SH.sharkCount]")).toEqual([24, 12]);
    expect(p.out<unknown[]>("TOASTS")).toHaveLength(said);
  });
});
