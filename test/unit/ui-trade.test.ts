/** The Trade pane's own logic (ui/trade.js) and the Hand-to-agent composer's (ui/intent.js), run as the page runs them — every page script in
 * account.html's order, in one global scope — over a stand-in for the browser: the six kinds (Crypto · Stocks · RWAs · Perps · Pre-IPO ·
 * Predictions) and which face a preset, a Markets row or a venue opens; which kinds the seg shows; an order's draft from the ticket's fields
 * (an event contract's prices typed in cents); where a market is listed, kept to the face's kind (yours ranked, yours that cannot with how
 * to fix it, public ones "Connect to trade"); each face's block; Advanced's one line; paying with a coin held (two steps); Under way's rows
 * (an agent's card → Review); what left the pane (tiles, the mode switch, Positions, Recent fills, Swap, Earn, Sell many). Then the same
 * drafts go through the real account's door on the stand-in account (test/standin): each is prepared, the owner's browser signs them, and
 * the account does what they say — a coin for a coin in two signatures, the second sized by what the first sale brought. Nothing leaves the
 * process. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createContext, runInContext, Script } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { malformed, signAgent, signDevice, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { startStandin, type Standin } from "../standin/ui-standin.ts";

const PUBLIC = fileURLToPath(new URL("../../src/portfolio/public/", import.meta.url));
const html = readFileSync(join(PUBLIC, "account.html"), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] ?? "");
const source = (f: string) => readFileSync(join(PUBLIC, f), "utf8");

/** a browser's EventSource as ui/stream.js opens one (the account's stream: feat/paper-live p2b): the test opens it and speaks through it */
class FakeES {
  static all: FakeES[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly heard = new Map<string, Array<(e: { data: string; lastEventId: string }) => void>>();
  constructor(readonly url: string) {
    FakeES.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data: string; lastEventId: string }) => void) {
    this.heard.set(type, [...(this.heard.get(type) ?? []), fn]);
  }
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(type: string, data: unknown) {
    for (const fn of this.heard.get(type) ?? []) fn({ data: JSON.stringify(data), lastEventId: "" });
  }
  fail() {
    this.readyState = 0;
    this.onerror?.();
  }
}

/** the page's scripts in a stand-in browser: elements take listeners and report nothing; the device key never answers, so nothing is drawn.
 * `es`: the browser has EventSource (a stand-in the test speaks through), so the account's stream opens once started */
function page({ es = false }: { es?: boolean } = {}) {
  FakeES.all = [];
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {}, style: {}, hidden: false, value: "", textContent: "", innerHTML: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" }, setAttribute() {} }, hidden: false, activeElement: null },
    location: { hash: "", origin: "http://127.0.0.1:4821" },
    history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    MutationObserver: class {
      observe() {}
    },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    scrollTo() {},
    indexedDB: { open: () => ({}) },
    fetch: () => new Promise(() => {}),
    /* a form's fields, as the drafts read them: { values } stands in for the form */
    FormData: class {
      constructor(private readonly f: { values?: Record<string, string> }) {}
      get(k: string) {
        return this.f.values?.[k] ?? null;
      }
      entries() {
        return Object.entries(this.f.values ?? {})[Symbol.iterator]();
      }
    },
    console,
    URLSearchParams,
    Intl,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    ...(es ? { EventSource: FakeES } : {}),
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const src of scripts) new Script(readFileSync(join(PUBLIC, src.replace(/^\//, "")), "utf8"), { filename: src }).runInContext(ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  /** a value out of the page, as plain data */
  const out = <T = any>(code: string): T => JSON.parse(run<string>(`JSON.stringify(${code})`)) as T;
  return { run, out, set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`), sandbox };
}
const settle = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

/* ---- a stand-in DOM for one ticket (ui/trade.js tkTicket), so what the owner sees in its panel can be read back ---- */
type Stub = Record<string, any>;
const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** an element as the ticket uses one: each part it looks for is an element of its own, kept by its selector; its HTML is kept as written —
 * a select's options are read from it (and its value is only ever one of them, as a browser's is), and the buttons a list carries
 * (data-at, data-money…) are found in it, the same ones until it is written again, so a test presses what the ticket listens to; its
 * events bubble to its parent */
function stub(name = "", parent: Stub | null = null): Stub {
  const kids = new Map<string, Stub>();
  const on: Record<string, Array<(e: unknown) => void>> = {};
  const attrs: Record<string, string> = {};
  let html = "";
  let value = "";
  let found = new Map<string, Stub[]>();
  const el: Stub = {
    name,
    parent,
    kids,
    on,
    hidden: false,
    checked: false,
    disabled: false,
    textContent: "",
    placeholder: "",
    title: "",
    className: "",
    isConnected: true,
    dataset: {},
    style: {},
    options: [] as Stub[],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(t: string, f: (e: unknown) => void) {
      (on[t] ??= []).push(f);
    },
    removeEventListener() {},
    dispatchEvent(e: { type: string }) {
      const ev = { type: e.type, target: el, stopPropagation() {}, preventDefault() {} };
      for (let n: Stub | null = el; n; n = n.parent) for (const f of n.on[e.type] ?? []) f(ev);
      return true;
    },
    click() {
      el.dispatchEvent({ type: "click" });
    },
    setAttribute(k: string, v: unknown) {
      attrs[k] = String(v);
    },
    getAttribute: (k: string) => attrs[k] ?? null,
    removeAttribute(k: string) {
      delete attrs[k];
    },
    hasAttribute: (k: string) => k in attrs,
    querySelector(sel: string) {
      if (!kids.has(sel)) kids.set(sel, stub(sel, el));
      return kids.get(sel);
    },
    querySelectorAll(sel: string) {
      const m = /\[data-([a-z-]+)\]/.exec(sel);
      if (!m) return [];
      if (!found.has(sel)) found.set(sel, [...html.matchAll(new RegExp(`data-${m[1]}="([^"]*)"`, "g"))].map((x) => Object.assign(stub(sel, el), { dataset: { [camel(m[1]!)]: unesc(x[1]!) } })));
      return found.get(sel);
    },
    contains: () => false,
    focus() {},
    closest: () => null,
  };
  Object.defineProperty(el, "innerHTML", {
    get: () => html,
    set: (v: unknown) => {
      html = String(v);
      found = new Map();
      const opts = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)];
      if (!opts.length) return;
      el.options = opts.map(([, v2, t]) => ({ value: unesc(v2!), textContent: unesc(t!), disabled: false }));
      if (!el.options.some((o: Stub) => o.value === value)) value = el.options[0].value;
    },
  });
  Object.defineProperty(el, "value", {
    get: () => value,
    set: (v: unknown) => {
      const s = String(v);
      value = el.options.length && !el.options.some((o: Stub) => o.value === s) ? "" : s;
    },
  });
  return el;
}
const CHECKS = new Set(["reduceOnly", "tpsl", "postOnly", "extendedHours"]);
/** the page with a panel for the ticket: its form's fields by name (a checkbox in FormData only when ticked, as a browser sends it), the
 * account's reads answered from ANSWERS by path, nothing prepared at the account, no route moved, no terminal pane on the page */
function ticketPage() {
  const p = page();
  const form = stub("form");
  const named = new Map<string, Stub>();
  form.elements = new Proxy({}, { get: (_t, k) => (typeof k !== "string" ? undefined : named.get(k) ?? (named.set(k, Object.assign(stub(k, form), { name: k })), named.get(k))) });
  Object.defineProperty(form, "values", { get: () => Object.fromEntries([...named].filter(([k, e]) => !e.disabled && (!CHECKS.has(k) || e.checked)).map(([k, e]) => [k, CHECKS.has(k) ? "on" : e.value])) });
  form.elements.unit.innerHTML = '<option value="usd">Dollars</option><option value="qty">Units</option>';
  form.elements.orderType.innerHTML = '<option value="market">Market</option><option value="limit">Limit</option>';
  form.elements.trailBy.innerHTML = '<option value="percent">Percent</option><option value="price">Price</option>';
  form.elements.pct.value = "0";
  const panel = stub("panel");
  panel.kids.set("form", form);
  p.sandbox.PANEL = panel;
  p.sandbox.FORM = form;
  p.run(`document.getElementById = () => null; go = () => {}; var ASKED = []; var ANSWERS = {};
    api = async (path) => { ASKED.push(path); const k = Object.keys(ANSWERS).filter((x) => path.startsWith(x)).sort((a, b) => b.length - a.length)[0]; return k ? ANSWERS[k] : { ok: false, refusal: { message: "not answered in this test" } }; };
    Owner.prepare = async () => ({ status: 409, body: { refusal: { message: "nothing is prepared in this test" } } });`);
  return { ...p, panel, form, part: (sel: string): Stub => form.querySelector(sel), field: (name: string): Stub => form.elements[name] };
}

/* venues as /api/account gives them, cut to what the pane reads */
const venue = (id: string, name: string, more: Record<string, unknown> = {}) => ({ id, name, live: true, watchOnly: "live", usd: 100, holdings: [], ...more });
const EX = venue("ex", "Exchange", { trade: { can: true, what: "spot and perpetuals", kinds: ["spot", "perp"], positions: true, amend: true, leverage: true }, liveCan: { withdraw: true, ledgers: ["spot", "futures"], transfer: true, swap: true, receive: false, send: false } });
const PRED = venue("predict", "Predictions", { trade: { can: true, what: "event contracts", kinds: ["event"], positions: true } });
const WALLET = venue("wallet", "Wallet", { trade: { can: true, what: "tokens", kinds: ["token"] }, address: "0x1111111111111111111111111111111111111111", proven: "MetaMask" });
const READONLY = venue("okx", "OKX", { trade: { can: false, what: "spot", kinds: ["spot"] }, noTradeBecause: "this API key has no Trade permission" });
const HL = venue("hl", "Hyperliquid", { trade: { can: true, what: "perpetuals", kinds: ["perp"] } });
const pageOf = (venues: unknown[], writes = true) => ({ now: "2026-10-06T12:00:00.000Z", venues, keys: [], spend: [], cards: [], orders: [], payments: [], intents: [], asks: [], connectLive: { writes: { on: writes, capUsd: 250 }, options: [] } });
/* rows as /api/account/explore gives them, cut to what the pane reads */
const ROW = (kind: string, base: string, more: Record<string, unknown> = {}) => ({ key: `${kind}:${base}`, kind, name: base, base, price: 10, tabs: [], at: [{ venue: "ex", venueName: "Exchange", symbol: `${base}/USDT`, connected: true, canTrade: true, public: false, price: 10 }], ...more });
const ANTH = { key: "preipo:anthropic", kind: "perp", name: "Anthropic", base: "ANTHROPIC", category: "Pre-IPO", price: 2080, implied: { perPoint: 1e9, unit: "1 contract = 1/1,000,000,000 of the implied company valuation", usd: 2.08e12 }, group: { id: "preipo:anthropic", title: "Anthropic" }, issuer: "Anthropic", eligibility: "Anthropic, 29 June 2026: transfers of its shares it has not approved are void", tabs: ["all", "preipo"], at: [{ venue: "okx-preipo", venueName: "OKX", symbol: "ANTHROPIC/USDT:USDT", connected: false, canTrade: false, public: true, price: 214.5, implied: { perPoint: 1e10, unit: "OKX: 1/10,000,000,000 since its 30 June 2026 rebase", usd: 2.145e12 }, connectTo: "okx", connector: "live:exchange:okx" }, { venue: "ex", venueName: "Exchange", symbol: "ANTHROPIC/USDT:USDT", connected: true, canTrade: true, public: false, price: 2080, implied: { perPoint: 1e9, unit: "1 contract = 1/1,000,000,000 of the implied company valuation", usd: 2.08e12 } }] };

describe("the trade terminal (ui/terminal.js): the market bar's figures, its session words, its tabs", () => {
  const p = page();
  /* a stand-in for the bar: two parts that take HTML */
  const bar = () => p.run('var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) }; EL');

  it("says a share's pushed price as what it is (feat/paper-live phase 3): its source writes it every few seconds and the account reads each as it is written — its age the time it has stood, never a venue's stream", () => {
    const w = (state: string, ms: number, o: Record<string, unknown>) => p.out<{ st: string; word: string; age: string; title: string }>(`ttFeedWords(${JSON.stringify(state)}, ${ms}, ${JSON.stringify(o)})`);
    expect(w("live", 7_400, { from: "Robinhood · real time", every: 15_000 })).toEqual({ st: "connected", word: "Live", age: "7 s", title: "Live: Robinhood writes its real-time quotes about every 15 s; the account reads each as it is written and pushes it here as it moves. This price has stood 7 s." });
    expect(w("quiet", 95_000, { from: "Robinhood · real time", every: 15_000 })).toMatchObject({ st: "stale", word: "Quiet", age: "1 min", title: "Quiet: no real-time quote from Robinhood has moved for this market just now; the price is its last, 1 min old, and the account reads the market's line instead until one does." });
    // Nasdaq writes nothing on a cadence of its own: the account ASKS it every five seconds, and its stamp is its last trade's, to the minute
    // — never "Nasdaq writes its real-time quotes about every 5 s"
    const nasdaq = w("live", 42_000, { from: "Nasdaq · real time", asks: 5_000 });
    expect(nasdaq).toEqual({ st: "connected", word: "Live", age: "42 s", title: "Live: the account asks Nasdaq for its real-time quote about every 5 s and pushes it here as it moves; Nasdaq stamps it with its last trade, to the minute — this one 42 s ago." });
    expect(nasdaq.title).not.toContain("writes");
    expect(w("quiet", 150_000, { from: "Nasdaq · real time", asks: 5_000 })).toMatchObject({ st: "stale", word: "Quiet", age: "2 min", title: "Quiet: Nasdaq has no fresh real-time quote for this market just now; the price is its last trade, 2 min ago, and the account reads the market's line instead until it has one." });
    // a venue's stream is said as before
    expect(w("live", 400, { from: "Kraken · live" }).title).toBe("Live: Kraken's own stream pushes this price as it moves; 0.4 s since it last confirmed it.");
  });

  it("names the market as a trader reads it: a perpetual as BASE-PERP, a share or a coin by its base, an event by its short name", () => {
    expect(p.out('[ttLabel(null), ttLabel({ kind: "perp", base: "BTC", name: "BTC perpetual" }), ttLabel({ kind: "coin", base: "ETH", name: "ETH" }), ttLabel({ kind: "stock", base: "AAPL", name: "Apple Inc" })]')).toEqual(["Pick a market", "BTC-PERP", "ETH", "AAPL"]);
  });

  it("says only what the venue's market and the row said: price, the day's change, volume, bid and ask, funding with its next payment, where the order goes", () => {
    p.set("A", pageOf([{ ...HL, paper: true, name: "Paper account" }]));
    bar();
    p.run('TT.item = { kind: "perp", base: "BTC", name: "BTC perpetual", changePct24h: -1.73, change24h: -1443, volumeUsd24h: 2794956106.72 }; TT.at = { venue: "hl", symbol: "BTC-PERP" }; TT.mk = { kind: "perp", base: "BTC", quote: "USDC", price: 81900, bid: 81899, ask: 81901, fundingRate: 0.0000125, nextFundingAt: "2026-10-06T13:00:00.000Z", maxLeverage: 40 }');
    p.run("ttStats(EL)");
    const html = p.out<string>("BOX.innerHTML");
    expect(html).toContain("81,900");
    expect(html).toContain("−1,443 / −1.73%");
    expect(html).toContain("Funding");
    expect(html).toContain("0.0013%");
    expect(html).toContain("81,899 · 81,901");
    expect(html).not.toContain("Session");
    expect(p.out<string>("TAGS.innerHTML")).toContain("40x");
    expect(p.out<string>("TAGS.innerHTML")).toContain('<span class="tag paper">Paper</span>');
    // nothing a source did not give: no volume, no change, no funding line
    p.run('TT.item = { kind: "stock", base: "AAPL", name: "Apple Inc" }; TT.mk = { kind: "stock", base: "AAPL", quote: "USD", price: 342.55, session: { open: false, phase: "after", phaseEndsAt: "2026-10-07T00:00:00.000Z", extendedHours: true }, quoteFrom: "Robinhood · real time" }');
    p.run("ttStats(EL)");
    const stock = p.out<string>("BOX.innerHTML");
    expect(stock).toContain("After-hours until 20:00");
    expect(stock).toContain("Robinhood · real time");
    expect(stock).not.toContain("24h volume");
    expect(stock).not.toContain("24h change");
    expect(stock).not.toContain("Funding");
  });

  it("says a stock's session in a few words: the phase and until when, open until the close, closed with when it opens", () => {
    expect(p.out('ttSessionWord({ open: true, closesAt: "2026-10-06T20:00:00.000Z" })')).toBe("Open until 16:00");
    expect(p.out('ttSessionWord({ open: false, phase: "overnight", phaseEndsAt: "2026-10-07T08:00:00.000Z" })')).toBe("Overnight until 04:00");
    expect(p.out('ttSessionWord({ open: false, phase: "closed", opensAt: "2026-10-09T13:30:00.000Z" })')).toBe("Closed · opens Fri 9 Oct 09:30");
  });

  it("shows the chart and the book of the market showing and no other: a new market drops the last one's place and figures; until an account is chosen for it, its public listing's; with neither, says so", () => {
    p.set("A", pageOf([EX]));
    p.run(`var MOUNTS = [];
      var TT_CH = { innerHTML: "" }; var TT_BKP = { innerHTML: "" };
      var PANE = { querySelector: (s) => (s === "[data-tt-chart]" ? TT_CH : s === "[data-tt-book]" ? TT_BKP : null) };
      document.getElementById = (id) => (id === "pane-trade" ? PANE : null);
      var FULL = null;
      chMount = (el, o) => { MOUNTS.push(["chart", o.venue, o.symbol]); FULL = o.fullscreen; };
      bkMount = (el, o) => MOUNTS.push(["book", o.venue, o.symbol]);
      chRelease = () => MOUNTS.push(["release"]);
      bkRelease = () => {};
      ttPoll = () => {};
      TT.item = null; TT.at = null; TT.mk = null; TT.mounted = "";`);
    // a coin traded at the exchange connected: once the ticket chooses it, the chart and the book are that venue's
    p.run(`ttSetItem(${JSON.stringify(ROW("coin", "BTC"))}, "crypto"); ttSetMarket({ venue: "ex", symbol: "BTC/USDT" }, { kind: "coin", base: "BTC", quote: "USDT", priceStep: 0.1, price: 81900 })`);
    expect(p.out("MOUNTS.filter((m) => m[1] === 'ex')")).toEqual([["chart", "ex", "BTC/USDT"], ["book", "ex", "BTC/USDT"]]);
    // the terminal's chart offers the window-filling view (ui/chart.js)
    expect(p.out("FULL")).toBe(true);
    // a share no account of yours trades, listed publicly: the last market's place and price are dropped at once, its public listing shows
    const nvda = { key: "stock:NVDA", kind: "stock", base: "NVDA", name: "NVIDIA", at: [{ venue: "cboe", venueName: "US stocks", symbol: "NVDA", public: true, connected: false, price: 221.09 }] };
    p.run(`MOUNTS.length = 0; ttSetItem(${JSON.stringify(nvda)}, "stocks")`);
    expect(p.out("[TT.at, TT.mk]")).toEqual([null, null]);
    expect(p.out("MOUNTS")).toEqual([["chart", "cboe", "NVDA"], ["book", "cboe", "NVDA"]]);
    // the same market again (the ticket read it anew): nothing is mounted twice
    p.run(`MOUNTS.length = 0; ttSetItem(${JSON.stringify(nvda)}, "stocks")`);
    expect(p.out("MOUNTS")).toEqual([]);
    // a market with no public listing and no account: the panels say so, nothing is read
    p.run(`MOUNTS.length = 0; ttSetItem({ key: "coin:ZZZ", kind: "coin", base: "ZZZ", name: "ZZZ", at: [] }, "crypto")`);
    expect(p.out("MOUNTS")).toEqual([["release"]]);
    expect(p.out<string>("TT_CH.innerHTML")).toContain("No chart is read for it here");
    expect(p.out<string>("TT_BKP.innerHTML")).toContain("No order book is read for it here");
    // nothing picked: the panels wait for a market
    p.run("ttSetItem(null)");
    expect(p.out<string>("TT_CH.innerHTML")).toContain("Pick a market");
  });

  it("offers HL's tabs under the panels — Positions, Open orders (with how many are open in the lens), Trade history, Funding history, Order history", () => {
    expect(p.out("TT_TABS.map((t) => t[1])")).toEqual(["Positions", "Open orders", "Trade history", "Funding history", "Order history"]);
    p.set("A", { ...pageOf([EX]), orders: [{ id: "ord-1", venue: "ex", status: "open" }, { id: "ord-2", venue: "ex", status: "filled" }] });
    expect(p.out("ttOpenCount()")).toBe(1);
  });

  it("calls a US stock's change what it is — the change since the last regular close, the day's — and a perpetual's or a coin's its 24 hours", () => {
    const q = page();
    q.set("A", pageOf([EX]));
    q.run('var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) }; TK.got = {};');
    // Monday 10:00 New York, the change since Friday's close: not a 24-hour figure
    q.run('TT.at = null; TT.mk = null; TT.item = { key: "stock:AAPL", kind: "stock", base: "AAPL", name: "Apple", price: 250, change24h: 2.5, changePct24h: 1.01 }; ttStats(EL)');
    const stock = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(stock).toContain("Day change");
    expect(stock).toContain("+2.5 / +1.01%");
    expect(stock).not.toContain("24h change");
    // the venue's market says it is a stock even where the row is another kind's
    q.run('TT.item = { key: "coin:AAPLX", kind: "coin", base: "AAPL", name: "Apple" }; TT.at = { venue: "alpaca", symbol: "AAPL" }; TT.mk = { kind: "stock", base: "AAPL", quote: "USD", price: 250, changePct24h: 1.01 }; ttStats(EL)');
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("Day change");
    q.run('TT.at = null; TT.mk = null; TT.item = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC", price: 81900, changePct24h: -1.73 }; ttStats(EL)');
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("24h change");
    q.run('TT.item = { key: "coin:ETH", kind: "coin", base: "ETH", name: "ETH", price: 2500, changePct24h: 0.5 }; ttStats(EL)');
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("24h change");
  });

  it("keeps reading the bar's market while the owner is on another pane — so it is fresh on the way back — and says when a read failed instead of passing old figures off as live", async () => {
    const q = page();
    q.set("A", pageOf([EX]));
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      var TIMERS = []; setTimeout = (f) => { TIMERS.push(f); return TIMERS.length; }; clearTimeout = () => {};
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      var ANSWER = { ok: true, market: { kind: "perp", base: "BTC", quote: "USDT", price: 82000 } }; var ASKED = []; api = async (path) => { ASKED.push(path); return ANSWER; };
      TK.got = {}; TT.item = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC" }; TT.at = { venue: "ex", symbol: "BTC/USDT:USDT" }; TT.mk = { kind: "perp", base: "BTC", quote: "USDT", price: 81000 };
      ROUTE.tab = "markets"; ttPoll();`);
    // on Markets: the beat goes on, nothing is asked
    await q.run("TIMERS.shift()()");
    expect(q.out("ASKED")).toEqual([]);
    expect(q.out("TIMERS.length")).toBe(1);
    // back on Trade: the next beat reads it, and the bar says the venue's figure now
    q.run('ROUTE.tab = "trade"');
    await q.run("TIMERS.shift()()");
    expect(q.out("ASKED")).toEqual(["/api/account/market?venue=ex&symbol=BTC%2FUSDT%3AUSDT"]);
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("82,000");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // a read refused: the last figures stay, said with when they were read and the venue's own words
    q.run('ANSWER = { ok: false, refusal: { message: "Exchange did not answer in time" } }');
    await q.run("TIMERS.shift()()");
    const said = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(said).toContain("82,000");
    expect(said).toMatch(/Not read again since \d\d:\d\d New York: Exchange did not answer in time/);
    // said in the status strip at the terminal's foot (HL's footer), never squeezed into the bar's figures
    expect(q.out<string>("SAID.innerHTML")).toMatch(/^Not read again since/);
    expect(q.out<string>("BOX.innerHTML")).not.toContain("Not read again");
    // read again: the words go
    q.run('ANSWER = { ok: true, market: { kind: "perp", base: "BTC", quote: "USDT", price: 82100 } }');
    await q.run("TIMERS.shift()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // no account chosen for it: the bar's figures are the freshest markets read's, not the row as it was when it was picked
    q.run('TT.at = null; TT.mk = null; TT.item = { key: "coin:SOL", kind: "coin", base: "SOL", name: "SOL", price: 100, changePct24h: 1 }; TK.got = { crypto: { at: Date.now(), items: [{ key: "coin:SOL", kind: "coin", base: "SOL", name: "SOL", price: 120, changePct24h: 3 }] } }; ttStats(EL)');
    const fresh = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(fresh).toContain(">120<");
    expect(fresh).toContain("+3.00%");
    expect(fresh).not.toContain(">100<");
  });

  it("with no account chosen, reads the row of a market outside the busiest of its kind again on the bar's beat — a search, never the kind's own list — and says when that read failed", async () => {
    const q = page();
    q.set("A", pageOf([EX]));
    const busiest = [ROW("coin", "BTC")];
    const zro = (price: number, pct: number) => ({ key: "coin:ZRO", kind: "coin", name: "LayerZero", base: "ZRO", price, changePct24h: pct, at: [] });
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      var TIMERS = []; setTimeout = (f) => { TIMERS.push(f); return TIMERS.length; }; clearTimeout = () => {};
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      chMount = () => {}; bkMount = () => {}; chRelease = () => {}; bkRelease = () => {};
      var ANSWER = { ok: true, items: [${JSON.stringify(zro(2.75, 4))}] }; var ASKED = []; api = async (path) => { ASKED.push(path); return ANSWER; };
      TK.got = { crypto: { at: Date.now(), items: ${JSON.stringify(busiest)} } }; TT.at = null; TT.mk = null; ROUTE.tab = "trade";`);
    // found by the picker's search: not one of the twelve busiest the page read for its kind
    q.run(`ttSetItem(${JSON.stringify(zro(2.4, 1))}, "crypto")`);
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain(">2.4<");
    expect(q.out("TIMERS.length")).toBe(1);
    await q.run("TIMERS.shift()()");
    expect(q.out("ASKED")).toEqual(["/api/account/explore?tab=crypto&q=ZRO&key=coin%3AZRO&limit=12"]);
    const fresh = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(fresh).toContain(">2.75<");
    expect(fresh).toContain("+4.00%");
    expect(fresh).not.toContain(">2.4<");
    // a search: the kind's own list is left as it was
    expect(q.out("TK.got.crypto.items.map((x) => x.key)")).toEqual(["coin:BTC"]);
    // a read refused: the last figures stay, said with when they were read and the source's own words
    q.run('ANSWER = { ok: false, refusal: { message: "the markets could not be read: Binance did not answer in time" } }');
    await q.run("TIMERS.shift()()");
    const said = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(said).toContain(">2.75<");
    expect(said).toMatch(/Not read again since \d\d:\d\d New York: the markets could not be read: Binance did not answer in time/);
    // read again and listed: the words go
    q.run(`ANSWER = { ok: true, items: [${JSON.stringify(zro(2.8, 5))}] }`);
    await q.run("TIMERS.shift()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain(">2.8<");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // while another pane shows the beat goes on and asks nothing
    q.run('ROUTE.tab = "markets"; ASKED.length = 0');
    await q.run("TIMERS.shift()()");
    expect([q.out("ASKED"), q.out("TIMERS.length")]).toEqual([[], 1]);
    // another market, never read since it was picked, whose read does not list it: said so, never with the last market's time
    q.run(`ROUTE.tab = "trade"; ANSWER = { ok: true, items: [] }; ttSetItem({ key: "coin:ABC", kind: "coin", name: "ABC", base: "ABC", price: 3, at: [] }, "crypto")`);
    await q.run("TIMERS.pop()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("Not read again since it was picked: the markets read did not list it");
    // no market: no beat
    q.run("TIMERS.length = 0; ttSetItem(null)");
    expect(q.out("TIMERS.length")).toBe(0);
  });

  it("searches an event's row again by the first words of its question a search may hold, and says no read failed of a row its kind's own read lists, fresh", async () => {
    const q = page();
    q.set("A", pageOf([PRED]));
    // 63 characters: longer than the account takes a search to be
    const title = "Will the Democrats win the House in the 2026 midterm elections?";
    expect(title.length).toBe(63);
    const ev = (price: number) => ({ key: "event:dem-house-2026", kind: "event", name: title, category: "Politics", price, tabs: [], at: [{ venue: "polymarket", venueName: "Polymarket", symbol: "DEM-HOUSE-2026:YES", public: true, connected: false, price }] });
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      var TIMERS = []; setTimeout = (f) => { TIMERS.push(f); return TIMERS.length; }; clearTimeout = () => {};
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      chMount = () => {}; bkMount = () => {}; chRelease = () => {}; bkRelease = () => {};
      var ANSWER = { ok: true, items: [${JSON.stringify(ev(0.64))}] }; var ASKED = [];
      api = async (path) => { ASKED.push(path); const s = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("q") || ""; return s.length > 60 ? { ok: false, refusal: { message: "a search is at most 60 characters" } } : ANSWER; };
      TK.got = { predictions: { at: Date.now(), items: [${JSON.stringify(ev(0.62))}] } }; TT.at = null; TT.mk = null; ROUTE.tab = "trade";`);
    q.run(`ttSetItem(${JSON.stringify(ev(0.55))}, "predictions")`);
    await q.run("TIMERS.shift()()");
    // the beat asked the first whole words of the question, which still find its row (a row is found by a part of its name)
    const asked = new URLSearchParams(q.out<string[]>("ASKED")[0]!.split("?")[1]).get("q") ?? "";
    expect(asked.length).toBeLessThanOrEqual(60);
    expect(asked).toBe("Will the Democrats win the House in the 2026 midterm");
    expect(title.startsWith(asked)).toBe(true);
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("64¢");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // its read refused while the kind's own read, read since the beat's last, lists the row: its figures are that read's, fresh, and nothing
    // failed is said of them
    q.run(`TK.got = { predictions: { at: TT.readAt + 1, items: [${JSON.stringify(ev(0.62))}] } }; ANSWER = { ok: false, refusal: { message: "Polymarket did not answer in time" } }`);
    await q.run("TIMERS.shift()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("62¢");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // no read of its kind lists it: the figures are the beat's last, said with when they were read and the source's words
    q.run("TK.got = {}");
    await q.run("TIMERS.shift()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("64¢");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toMatch(/Not read again since \d\d:\d\d New York: Polymarket did not answer in time/);
  });

  it("keeps the beat's last figures, said as not read again, when its read fails and the kind's read that lists the row is older — as it stands while the account does not answer and the pane is not drawn again", async () => {
    const q = page();
    q.set("A", pageOf([EX]));
    const coin = (base: string, price: number) => ({ key: `coin:${base}`, kind: "coin", name: base, base, price, at: [] });
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      var TIMERS = []; setTimeout = (f) => { TIMERS.push(f); return TIMERS.length; }; clearTimeout = () => {};
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      chMount = () => {}; bkMount = () => {}; chRelease = () => {}; bkRelease = () => {};
      var ANSWER = { ok: true, items: [${JSON.stringify(coin("ZRO", 2.75))}] }; api = async () => ANSWER;
      TK.got = { crypto: { at: Date.now() - 10 * 60_000, items: [${JSON.stringify(coin("ZRO", 2.4))}] } }; TT.at = null; TT.mk = null; ROUTE.tab = "trade";`);
    // the kind's read lists the row, read ten minutes ago; the beat reads it now
    q.run(`ttSetItem(${JSON.stringify(coin("ZRO", 2.5))}, "crypto")`);
    await q.run("TIMERS.shift()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain(">2.75<");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // the account stops answering: the beat's read fails, and the kind's read still lists the row, as it was ten minutes ago — the bar keeps
    // the beat's last figures and says since when, never the older ones as if fresh
    q.run('ANSWER = { ok: false, error: "Failed to fetch" }');
    await q.run("TIMERS.shift()()");
    const said = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(said).toContain(">2.75<");
    expect(said).not.toContain(">2.4<");
    // in the page's own words (the account not answering), never the browser's error as it was thrown, with how long the bar now waits
    expect(said).toMatch(/Not read again since \d\d:\d\d New York: the account is not answering\. Asking again every 10 s\./);
    expect(said).not.toContain("Failed to fetch");
    // another market, never read since it was picked, that only that old read lists: said so as well
    q.run(`TK.got = { crypto: { at: Date.now() - 10 * 60_000, items: [${JSON.stringify(coin("ABC", 3.5))}] } }; ttSetItem(${JSON.stringify(coin("ABC", 3))}, "crypto")`);
    await q.run("TIMERS.pop()()");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("Not read again since it was picked: the account is not answering. Asking again every 10 s.");
    // and the figures under those words are the row as it was picked (3), never that older read's (3.5)
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain(">3<");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain(">3.5<");
  });

  it("asks for the row by its key with the words, so an event's row is found though twelve busier questions share the first words a search may hold", async () => {
    const q = page();
    q.set("A", pageOf([PRED]));
    // the first words of the question a search may hold (the question is 63 characters), which twelve busier questions begin with too
    const head = "Will the Democrats win the House in the 2026 midterm";
    const ev = (key: string, name: string, price: number) => ({ key, kind: "event", name, category: "Politics", price, tabs: [], at: [{ venue: "polymarket", venueName: "Polymarket", symbol: `${key.slice(6).toUpperCase()}:YES`, public: true, connected: false, price }] });
    const mine = ev("event:dem-house-2026", `${head} elections?`, 0.64);
    const busier = Array.from({ length: 12 }, (_, i) => ev(`event:dem-house-2026-by-${i + 2}`, `${head} elections by ${i + 2} seats or more?`, 0.3));
    // the account's explore, as service.ts answers it: a search over 60 characters refused; the rows the words find, busiest first, cut to
    // the limit — with a key, only the row with that key, before the cut
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      var TIMERS = []; setTimeout = (f) => { TIMERS.push(f); return TIMERS.length; }; clearTimeout = () => {};
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      chMount = () => {}; bkMount = () => {}; chRelease = () => {}; bkRelease = () => {};
      var ROWS = [...${JSON.stringify(busier)}, ${JSON.stringify(mine)}]; var ASKED = [];
      api = async (path) => { ASKED.push(path); const s = new URLSearchParams(path.slice(path.indexOf("?") + 1)); const words = s.get("q") || ""; if (words.length > 60) return { ok: false, refusal: { message: "a search is at most 60 characters" } }; const found = ROWS.filter((x) => x.name.includes(words)); return { ok: true, items: (s.get("key") ? found.filter((x) => x.key === s.get("key")) : found).slice(0, Number(s.get("limit"))) }; };
      TK.got = {}; TT.at = null; TT.mk = null; ROUTE.tab = "trade";`);
    q.run(`ttSetItem(${JSON.stringify(mine)}, "predictions")`);
    await q.run("TIMERS.shift()()");
    const asked = new URLSearchParams(q.out<string[]>("ASKED")[0]!.split("?")[1]);
    expect([asked.get("q"), asked.get("key")]).toEqual([head, "event:dem-house-2026"]);
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toContain("64¢");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("Not read again");
    // a row asked for is its own read: never taken for the kind's own list
    expect(q.out("TK.got")).toEqual({});
  });

  it("says when the venue's price is from beside its source once it is not the last minute or two's: a real-time source's last trade can be yesterday's", () => {
    const q = page();
    q.set("A", pageOf([EX]));
    q.run('var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) }; TK.got = {};');
    // pre-market: Nasdaq's real-time last trade is the day before's close
    q.run('TT.item = { key: "stock:AAPL", kind: "stock", base: "AAPL", name: "Apple" }; TT.at = { venue: "alpaca", symbol: "AAPL" }; TT.mk = { kind: "stock", base: "AAPL", quote: "USD", price: 250, quoteFrom: "Nasdaq · real time", quoteAt: new Date(Date.now() - 16 * 3_600_000).toISOString() }; ttStats(EL)');
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).toMatch(/Nasdaq · real time · last at \d\d:\d\d New York, \w{3} \d{1,2} \w{3}/);
    // a trade of the last minute or two: its source alone
    q.run("TT.mk.quoteAt = new Date(Date.now() - 30_000).toISOString(); ttStats(EL)");
    const recent = q.out<string>("BOX.innerHTML + SAID.innerHTML");
    expect(recent).toContain("Nasdaq · real time");
    expect(recent).not.toContain("last at");
    // no time given: its source alone
    q.run("delete TT.mk.quoteAt; ttStats(EL)");
    expect(q.out<string>("BOX.innerHTML + SAID.innerHTML")).not.toContain("last at");
  });

  it("names a contract market's book and trades in contracts where one contract is not one coin, as the venue counts them (and an event's in contracts)", () => {
    const q = page();
    q.set("A", pageOf([EX]));
    q.run(`var BASES = []; var PANE = { querySelector: () => ({ innerHTML: "" }) }; document.getElementById = (id) => (id === "pane-trade" ? PANE : null);
      chMount = () => {}; chRelease = () => {}; bkRelease = () => {}; bkMount = (el, o) => BASES.push(o.base); ttPoll = () => {}; TT.item = null; TT.at = null; TT.mk = null; TT.mounted = "";`);
    const okx = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC", at: [] };
    q.run(`ttSetItem(${JSON.stringify(okx)}, "perps"); ttSetMarket({ venue: "okx", symbol: "BTC/USDT:USDT" }, { kind: "perp", base: "BTC", quote: "USDT", contractSize: 0.01 })`);
    q.run(`ttSetMarket({ venue: "hl", symbol: "BTC-PERP" }, { kind: "perp", base: "BTC", quote: "USDC", contractSize: 1 })`);
    q.run(`ttSetMarket({ venue: "ex", symbol: "BTC/USDT" }, { kind: "spot", base: "BTC", quote: "USDT" })`);
    q.run(`ttSetItem({ key: "ev:FED", kind: "event", name: "Fed", at: [] }, "predictions"); ttSetMarket({ venue: "predict", symbol: "FED:YES" }, { kind: "event", base: "FED", quote: "USD" })`);
    expect(q.out("BASES")).toEqual(["contracts", "BTC", "BTC", "contracts"]);
    expect(q.out('[tkSizeUnit({ kind: "perp", base: "BTC", contractSize: 0.01 }), tkSizeUnit({ kind: "future", base: "ETH", contractSize: 10 }), tkSizeUnit({ kind: "perp", base: "BTC" }), tkSizeUnit({ kind: "stock", base: "AAPL" }), tkSizeUnit({ kind: "event", base: "FED" })]')).toEqual(["contracts", "contracts", "BTC", "AAPL", "contracts"]);
  });

  it("says when a venue's positions could not be read — in its own words — and never that nothing is held while one is missing", async () => {
    const q = page();
    q.set("A", pageOf([EX, HL]));
    q.run(`var POSBOX = { innerHTML: "", isConnected: true, addEventListener() {} }; TT.tab = "positions";
      var ANSWER = { ok: true, positions: [], missing: [{ venue: "hl", venueName: "Hyperliquid", why: "Hyperliquid did not answer in time", code: "E_VENUE_UNREACHABLE", part: "positions" }] }; api = async () => ANSWER;`);
    q.run("ttPositions(POSBOX, true)");
    await settle();
    const html = q.out<string>("POSBOX.innerHTML");
    expect(html).toContain("<b>Hyperliquid</b> could not be read: Hyperliquid did not answer in time");
    expect(html).not.toContain("Nothing held in positions.");
    expect(html).toContain("Nothing held in positions at the venues that answered.");
    // what the others hold is listed, the one missing named under it
    q.run('ANSWER = { ...ANSWER, positions: [{ venue: "ex", venueName: "Exchange", symbol: "ETH/USDT:USDT", name: "ETH perpetual", kind: "perp", side: "long", qty: 1, usd: 2500 }] }; POSBOX.innerHTML = ""; ttPositions(POSBOX, true)');
    await settle();
    expect(q.out<string>("POSBOX.innerHTML")).toMatch(/ETH perpetual[\s\S]*could not be read: Hyperliquid did not answer in time/);
    // every venue read, nothing held: said so
    q.run('ANSWER = { ok: true, positions: [], missing: [] }; ttPositions(POSBOX, true)');
    await settle();
    expect(q.out<string>("POSBOX.innerHTML")).toContain("Nothing held in positions.");
  });

  it("keeps an agent's lens on Trade history and on the Open orders count, as Under way lists them; a paper line stays Paper after its account is gone", async () => {
    const q = page();
    q.set("A", { ...pageOf([EX, { ...HL, paper: true }]), keys: [{ address: "0xagent", name: "Bot" }], orders: [{ id: "o1", venue: "ex", status: "open" }, { id: "o2", venue: "ex", status: "open", agent: "0xAgent" }, { id: "o3", venue: "hl", status: "partial" }, { id: "o4", venue: "ex", status: "filled", agent: "0xagent" }] });
    q.run('view.lens = "agent:0xagent"');
    expect(q.out("ttOpenCount()")).toBe(1);
    q.run('view.lens = ""');
    expect(q.out("ttOpenCount()")).toBe(3);
    q.run('view.lens = "paper"');
    expect(q.out("ttOpenCount()")).toBe(1);
    const line = (id: string, account: string, more: Record<string, unknown> = {}) => ({ key: id, id, type: "trade", kind: "buy", account, accountName: account, description: `Buy 1 ${id}`, amountUsd: -10, status: "filled", by: "You", at: "2026-10-06T12:00:00.000Z", ...more });
    const lines = [line("MINE", "ex"), line("BOTS", "ex", { by: "Bot, inside its limit", agent: "0xagent", agentName: "Bot" }), line("GONE", "paper-gone", { paper: true })];
    q.run(`var HBOX = { innerHTML: "", isConnected: true }; TT.tab = "history"; api = async () => ({ ok: true, lines: ${JSON.stringify(lines)} })`);
    const shown = async (lens: string) => {
      q.run(`view.lens = ${JSON.stringify(lens)}; HBOX.innerHTML = ""; ttHistory(HBOX)`);
      await settle();
      const html = q.out<string>("HBOX.innerHTML");
      return ["MINE", "BOTS", "GONE"].filter((x) => html.includes(`<b>${x}</b>`));
    };
    expect(await shown("agent:0xagent")).toEqual(["BOTS"]);
    expect(await shown("real")).toEqual(["MINE", "BOTS"]);
    expect(await shown("paper")).toEqual(["GONE"]);
    expect(await shown("")).toEqual(["MINE", "BOTS", "GONE"]);
  });

  it("hears the market button, its panel and the tabs of a frame drawn again (after an error replaced the pane), and the page's Escape and outside click once", () => {
    const q = page();
    q.run(`var DOC = []; document.addEventListener = (t) => DOC.push(t);
      var part = () => { const p = { ls: [], hidden: true, addEventListener(t) { p.ls.push(t); }, setAttribute() {}, querySelector: () => null, contains: () => false }; return p; };
      var frame = () => { const f = { pop: part(), btn: part(), tabs: part() }; f.querySelector = (s) => (s === "[data-tt-pop]" ? f.pop : s === "[data-tt-pick]" ? f.btn : s === "[data-tt-tabs]" ? f.tabs : null); return f; };
      var F1 = frame(); var F2 = frame();
      var PANE = { cur: F1, querySelector(s) { return s === "[data-tp]" ? this.cur : this.cur.querySelector(s); } };
      ttWire(PANE); ttWire(PANE); PANE.cur = F2; ttWire(PANE);`);
    expect(q.out("[F1.btn.ls, F1.pop.ls, F1.tabs.ls]")).toEqual([["click"], ["click"], ["click"]]);
    expect(q.out("[F2.btn.ls, F2.pop.ls, F2.tabs.ls]")).toEqual([["click"], ["click"], ["click"]]);
    expect(q.out("DOC")).toEqual(["keydown", "click"]);
  });
});

describe("the terminal fitted to the window, its bar's figures whole, its prices to the market's step, its beat backing off", () => {
  it("measures what sits above the terminal into --tt-top and the page's gutter under it into --tt-below, once per change, and nothing for a pane put aside", () => {
    const q = page();
    q.run(`var SET = []; var TOP = 59; var SHOWN = true;
      var MAIN = { tagName: "MAIN" };
      var TT_EL = { getBoundingClientRect: () => ({ top: TOP }), getClientRects: () => (SHOWN ? [{}] : []), closest: (s) => (s === ".main" ? MAIN : null), style: { setProperty: (k, v) => SET.push([k, v]) } };
      var PANE = { querySelector: (s) => (s === ".tt" ? TT_EL : null) };
      getComputedStyle = (el) => (el === MAIN ? { paddingBottom: "3px" } : {});
      window.scrollY = 3;`);
    q.run("ttFit(PANE)");
    // where the terminal starts in the page (its top in the window and the page's scroll), and the gutter under it
    expect(q.out("SET")).toEqual([["--tt-top", "62px"], ["--tt-below", "3px"]]);
    // the same again: nothing written, so nothing is laid out again
    q.run("ttFit(PANE)");
    expect(q.out("SET.length")).toBe(2);
    // a banner over it: the terminal starts lower, and the room it fits in is that much less
    q.run("TOP = 99; ttFit(PANE)");
    expect(q.out("SET.slice(2)")).toEqual([["--tt-top", "102px"], ["--tt-below", "3px"]]);
    // a pane put aside has no box: it is not measured (its top would read 0)
    q.run("SHOWN = false; TOP = 0; ttFit(PANE)");
    expect(q.out("SET.length")).toBe(4);
    // the stylesheet sizes the grid from that room: the window less what sits above it, under it, the status strip and the gutters, less
    // the tables' least height — never a fixed allowance for the window's chrome
    const css = source("ui/terminal.css");
    expect(css).toContain("--tt-room: calc(100dvh - var(--tt-top) - var(--tt-below) - var(--hl-h-footer) - 2 * var(--hl-gap))");
    expect(css).toContain("--tt-grid-h: clamp(520px, calc(var(--tt-room) - var(--tt-low-min)), 760px)");
    expect(css).toMatch(/\.tt-low \{ display: flex; flex-direction: column; height: max\(var\(--tt-low-min\), calc\(var\(--tt-room\) - var\(--tt-grid-h\)\)\);/);
    expect(css).not.toContain("100dvh - 226px");
  });

  it("shows the bar's figures whole: the least needed set aside, one at a time, until the rest fit — bid · ask first, the price never — and all of them back when there is room", () => {
    const q = page();
    q.set("A", pageOf([EX]));
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      TK.got = {}; TT.item = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC perpetual", volumeUsd24h: 1.9e9, changePct24h: 2.3, change24h: 1405.1 }; TT.at = { venue: "ex", symbol: "BTC/USDT:USDT" }; TT.mk = { kind: "perp", base: "BTC", quote: "USDT", price: 62489.4, bid: 62486.2, ask: 62492.6, fundingRate: 0.0001 };
      ttStats(EL);`);
    // each figure carries its place in the order they are set aside; the price none (it always stays)
    const html = q.out<string>("BOX.innerHTML");
    const drop = (name: string) => (new RegExp(`data-k="st:${name}"(?: data-tt-drop="(\\d+)")?`).exec(html) ?? [])[1] ?? "";
    expect(drop("Price")).toBe("");
    expect(Number(drop("Bid · Ask"))).toBeGreaterThan(Number(drop("24h volume")));
    expect(Number(drop("24h volume"))).toBeGreaterThan(Number(drop("Funding")));
    expect(Number(drop("Funding"))).toBeGreaterThan(Number(drop("24h change")));
    // a strip as the browser lays it out: each figure its width, 32 between them, the room the bar leaves it
    q.run(`var mk = (name, w, drop) => ({ name, w, hidden: false, dataset: drop ? { ttDrop: String(drop) } : {} });
      var KIDS = [mk("Price", 60), mk("24h change", 110, 2), mk("24h volume", 70, 7), mk("Bid · Ask", 120, 8), mk("Funding", 90, 5)];
      var STRIP = { children: KIDS, clientWidth: 403, get scrollWidth() { const on = KIDS.filter((k) => !k.hidden); return on.reduce((t, k) => t + k.w, 0) + 32 * (on.length - 1); } };`);
    // 450 + 4 gaps of 32 = 578: bid · ask goes first (426 fits in 430)
    q.run("STRIP.clientWidth = 430; ttFitStats(STRIP)");
    expect(q.out("KIDS.filter((k) => k.hidden).map((k) => k.name)")).toEqual(["Bid · Ask"]);
    // in 403, the volume next (324)
    q.run("STRIP.clientWidth = 403; ttFitStats(STRIP)");
    expect(q.out("KIDS.filter((k) => k.hidden).map((k) => k.name)")).toEqual(["24h volume", "Bid · Ask"]);
    // a narrower bar: the funding too, then the change; the price stays even where it alone is all that fits
    q.run("STRIP.clientWidth = 100; ttFitStats(STRIP)");
    expect(q.out("KIDS.filter((k) => !k.hidden).map((k) => k.name)")).toEqual(["Price"]);
    // room again (the window widened): every figure comes back
    q.run("STRIP.clientWidth = 700; ttFitStats(STRIP)");
    expect(q.out("KIDS.filter((k) => k.hidden).length")).toBe(0);
    // a strip with no box (a pane put aside) is left as drawn: nothing set aside
    q.run("STRIP.clientWidth = 0; KIDS[3].hidden = false; ttFitStats(STRIP)");
    expect(q.out("KIDS.filter((k) => k.hidden).length")).toBe(0);
  });

  it("a perpetual's bar as Hyperliquid's says it: the price, then its mark and oracle, its open interest in dollars at the mark, and its funding with the time left until it is next paid — counting down each second and rolling on to the next hour — the stream's figures over the read's while it pushes", () => {
    const q = page();
    q.set("A", pageOf([EX]));
    const NEXT = Date.now() + (35 * 60 + 12) * 1000 + 400;
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      TK.got = {}; TT.item = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC perpetual" }; TT.at = { venue: "ex", symbol: "BTC-PERP" };
      TT.mk = { kind: "perp", base: "BTC", quote: "USDC", price: 82383.5, changePct24h: 0.43, change24h: 350.5, volumeUsd24h: 2.6e9, markPrice: 82384, oraclePrice: 82414.9, premium: -0.000375, openInterest: 40687.01858, openInterestUsd: 3351962439.01, fundingRate: 0.0000125, nextFundingAt: new Date(${NEXT}).toISOString(), fundingEveryH: 1 };
      ttStats(EL);`);
    const html = q.out<string>("BOX.innerHTML");
    const stat = (name: string) => new RegExp(`data-k="st:${name.replace(/[/]/g, "\\/")}"[^>]*>(?:<span[^>]*>[^<]*</span>)<span class="tt-st-v[^"]*">(.*?)</span></div>`).exec(html)?.[1] ?? "";
    expect(stat("Mark")).toBe("82,384");
    expect(stat("Oracle")).toBe("82,414.9");
    // open interest in dollars at the mark, the coins on hover
    expect(html).toContain('<span title="40,687.02 BTC">$3.4B</span>');
    // funding: its rate, then the time left — the countdown says when it ends and the funding's period, for the clock to roll it on
    expect(html).toContain('data-k="st:Funding / Countdown"');
    expect(html).toMatch(new RegExp(`<span class="acc">0\\.0013%</span> <span class="tt-count" data-tt-count="${NEXT}" data-tt-every="3600000">35:12</span>`));
    // when it is paid and what the rate comes to over a year, on the label
    expect(html).toMatch(/title="The venue&#39;s funding rate for each period: when it is above zero, longs pay shorts; below zero, shorts pay longs\. Next paid at \d\d:\d\d New York, then every hour\. At this rate a year comes to 10\.95%\."/);
    // the order the figures go in when the bar is narrow: bid · ask, the oracle, the volume, the open interest, the mark, the funding, the change
    const drop = (name: string) => Number((new RegExp(`data-k="st:${name}" data-tt-drop="(\\d+)"`).exec(html) ?? [])[1]);
    expect([drop("Oracle"), drop("24h volume"), drop("Open interest"), drop("Mark"), drop("Funding / Countdown"), drop("24h change")]).toEqual([9, 8, 7, 6, 5, 2]);
    // the countdown follows the clock: a second on, one second less; once it has run out, the next hour's
    q.run(`var CNT = { dataset: { ttCount: "${NEXT}", ttEvery: "3600000" }, textContent: "" }; var PANE = { querySelectorAll: (s) => (s === "[data-tt-count]" ? [CNT] : []) }; ttCountdowns(PANE);`);
    expect(q.out("CNT.textContent")).toMatch(/^35:1[12]$/);
    q.run(`CNT.dataset.ttCount = String(Date.now() - 1000); ttCountdowns(PANE);`);
    expect(q.out<string>("CNT.textContent")).toMatch(/^59:5[89]$/);
    expect(Number(q.out<string>("CNT.dataset.ttCount")) - Date.now()).toBeGreaterThan(3_590_000);
    expect([q.out("ttCountdown(7 * 3600e3 + 35 * 60e3 + 12e3)"), q.out("ttCountdown(-5)")]).toEqual(["7:35:12", "00:00"]);
    // a funding time the venue said has passed: the next one a period on (and none for a venue that names no period)
    const past = Date.parse("2026-10-20T16:00:00.000Z");
    expect(q.out(`ttNextFunding({ nextFundingAt: "2026-10-20T16:00:00.000Z", fundingEveryH: 1 }, ${past + 25 * 60_000})`)).toBe(past + 3_600_000);
    expect(q.run(`ttNextFunding({ nextFundingAt: "2026-10-20T16:00:00.000Z" }, ${past + 1}) === undefined`)).toBe(true);
    // the stream pushing the market: its mark, oracle, open interest and day's volume over the read's
    q.run(`ttLiveQuote = () => ({ live: true, bid: 82390, ask: 82391, mark: 82391.5, oracle: 82420.1, openInterest: 40700, volumeUsd24h: 2.7e9, funding: 0.000015, seenAt: new Date().toISOString(), from: "Hyperliquid · live", gotAt: Date.now() }); ttStats(EL);`);
    const pushed = q.out<string>("BOX.innerHTML");
    expect(pushed).toContain('data-k="st:Mark"');
    expect(pushed).toContain(">82,391.5<");
    expect(pushed).toContain(">82,420.1<");
    expect(pushed).toContain('<span title="40,700 BTC">$3.4B</span>');
    expect(pushed).toContain(">$2.7B<");
    expect(pushed).toContain('<span class="acc">0.0015%</span>');
    // where a perpetual's price is from goes right after bid · ask when the bar is narrow (its venue is the chart's caption, its age the
    // feed's): before the mark, the oracle, the open interest and the funding, which nothing else says
    const dropIn = (h: string, name: string) => Number((new RegExp(`data-k="st:${name}" data-tt-drop="(\\d+)"`).exec(h) ?? [])[1]);
    expect([dropIn(pushed, "Bid · Ask"), dropIn(pushed, "Price from")]).toEqual([11, 10]);
    expect(dropIn(pushed, "Price from")).toBeGreaterThan(dropIn(pushed, "Oracle"));
    // the most leverage as HL says it, beside the market's name: 40x
    q.run(`TT.mk.maxLeverage = 40; ttStats(EL);`);
    expect(q.out<string>("TAGS.innerHTML")).toMatch(/<span class="tag tt-lev" title="The most leverage [^"]+ takes in this market">40x<\/span>/);
    // a coin's bar has none of a perpetual's figures — and its price's source stays among the last to go
    q.run(`ttLiveQuote = () => null; TT.item = { key: "coin:BTC", kind: "crypto", base: "BTC", name: "BTC" }; TT.mk = { kind: "spot", base: "BTC", quote: "USD", price: 82380, quoteFrom: "Coinbase", quoteAt: new Date().toISOString() }; ttStats(EL);`);
    expect(q.out<string>("BOX.innerHTML")).not.toMatch(/st:Mark|st:Oracle|st:Open interest|st:Funding/);
    expect(dropIn(q.out<string>("BOX.innerHTML"), "Price from")).toBe(3);
  });

  it("writes a price to its market's step where the page read the market, else to the decimals its venue quotes the market's other prices in, else six figures — never an average's tail — with the figure as it came on hover", () => {
    const q = page();
    const fig = (n: number, o: Record<string, unknown> = {}) => q.out<{ text: string; exact: string }>(`ttFig(${n}, ${JSON.stringify(o)})`);
    // a paper position's average entry, its mark quoted to a tenth: 62,548.9, the whole figure on hover
    expect(fig(62548.88617, { like: [62481.7, 40649.3] })).toEqual({ text: "62,548.9", exact: "62,548.88617" });
    // its market's step known (0.1): written to it, padded as the book pads a level
    expect(fig(62548.88617, { step: 0.1 })).toEqual({ text: "62,548.9", exact: "62,548.88617" });
    expect(fig(60520, { step: 0.1 })).toEqual({ text: "60,520.0", exact: "" });
    expect(fig(2456.735, { step: 0.01 })).toEqual({ text: "2,456.74", exact: "2,456.735" });
    // nothing to go by: six significant figures, never more decimals than the figure has
    expect(fig(62548.88617)).toEqual({ text: "62,548.9", exact: "62,548.88617" });
    expect(fig(0.000123456)).toEqual({ text: "0.000123456", exact: "" });
    expect(fig(13.786)).toEqual({ text: "13.786", exact: "" });
    // never fewer decimals than its siblings', never more than its own
    expect(fig(1977.67, { like: [2456.47] })).toEqual({ text: "1,977.67", exact: "" });
    expect(fig(1977.6, { like: [2456.473] })).toEqual({ text: "1,977.6", exact: "" });
    // a sibling on a round figure is a hint, not a cap: a mark that lands on 2,457 (or 0.1) does not take the entry's decimals with it
    expect(fig(2456.74, { like: [2457] })).toEqual({ text: "2,456.74", exact: "" });
    expect(fig(0.10234, { like: [0.1] })).toEqual({ text: "0.10234", exact: "" });
    expect(fig(Number.NaN)).toEqual({ text: "—", exact: "" });
  });

  it("writes the positions' entry, mark and liquidation prices as their market writes them: the step of a market read on the page, else the decimals of its mark", async () => {
    const q = page();
    q.set("A", pageOf([EX, { ...HL, id: "paper-momentum", name: "Momentum · paper", paper: true }]));
    const pos = [
      { venue: "paper-momentum", venueName: "Momentum · paper", paper: true, symbol: "BTC/USD", name: "BTC / USD", kind: "spot", side: "long", qty: 0.00094, usd: 58.73, entryPrice: 62548.88617, markPrice: 62481.7 },
      { venue: "ex", venueName: "Exchange", symbol: "ETH/USDT:USDT", name: "ETH perpetual", kind: "perp", side: "long", qty: 0.05, usd: 122.82, entryPrice: 2456.731234, markPrice: 2456.47, liquidationPrice: 1977.6712 },
    ];
    q.run(`var POSBOX = { innerHTML: "", isConnected: true, addEventListener() {} }; TT.tab = "positions"; var POS_ANSWER = { ok: true, positions: ${JSON.stringify(pos)}, missing: [] }; api = async () => POS_ANSWER;
      var TABBAR = { innerHTML: "" }; var FRAME = { querySelector: (s) => (s === "[data-tt-tabs]" ? TABBAR : null) }; document.getElementById = (id) => (id === "pane-trade" ? FRAME : null);`);
    q.run("ttPositions(POSBOX, true)");
    await settle();
    // how many are held, on the tab: a table that scrolls inside a short window still says how many rows it has
    expect(q.out<string>("TABBAR.innerHTML")).toContain('>Positions <span class="tt-n">2</span></button>');
    let html = q.out<string>("POSBOX.innerHTML");
    expect(html).toContain('<td class="r tt-c-entry" title="62,548.88617">62,548.9</td>');
    expect(html).not.toContain(">62,548.88617<");
    expect(html).toContain('<td class="r tt-c-mark"><span class="tt-k">Mark </span>62,481.7</td>');
    expect(html).toContain('<td class="r tt-c-entry" title="2,456.731234">2,456.73</td>');
    expect(html).toContain('<td class="r tt-c-liq" title="1,977.6712">1,977.67</td>');
    // the ETH perpetual's market read on this page (its step 0.1): its prices written to that step
    q.run(`API.set("/api/account/market?venue=ex&symbol=ETH%2FUSDT%3AUSDT", { at: Date.now(), body: { ok: true, market: { symbol: "ETH/USDT:USDT", priceStep: 0.1 } } }); POSBOX.innerHTML = ""; ttPositions(POSBOX, true)`);
    await settle();
    html = q.out<string>("POSBOX.innerHTML");
    expect(html).toContain('<td class="r tt-c-entry" title="2,456.731234">2,456.7</td>');
    expect(html).toContain('<td class="r tt-c-mark" title="2,456.47"><span class="tt-k">Mark </span>2,456.5</td>');
    // the account not answering: said in the page's words, never the browser's error
    q.run('POS_ANSWER = { ok: false, error: "Failed to fetch" }; ttPositions(POSBOX, true)');
    await settle();
    expect(q.out<string>("POSBOX.innerHTML")).toBe('<p class="msg no">The account is not answering.</p>');
  });

  it("writes the history tabs' prices as their market writes them, and reads a line's own figures written with thousands separators", () => {
    const q = page();
    q.set("A", { ...pageOf([EX]), orders: [{ id: "o1", clientId: "c1", venue: "ex", symbol: "BTC/USDT", name: "BTC / USDT", kind: "spot", side: "buy", type: "market", qty: 0.001, filledQty: 0.001, avgPrice: 62548.88617, price: 62540.5 }] });
    expect(q.out('ttPx(ttOrderRec({ key: "order:c1" }), 62548.88617)')).toBe('<span title="62,548.88617">62,548.9</span>');
    // a line read from its words alone, its figures grouped as the account may write them
    const r = q.out<Record<string, unknown>>('ttOrderRec({ key: "order:zz", kind: "buy", description: "Buy 0.5 BTC · BTC / USDT · limit 63,226.6 · at 63,226.6" })');
    expect(r.limit).toBe(63226.6);
    expect(r.avg).toBe(63226.6);
    expect(r.filled).toBe(0.5);
  });

  it("asks a bar's market that the account does not answer again later and later — ten seconds, doubling, at most a minute — says so in its own words, and goes back to five seconds once answered", async () => {
    const q = page();
    q.set("A", pageOf([EX]));
    q.run(`var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : null) };
      var TIMERS = []; setTimeout = (f, ms) => { TIMERS.push([f, ms]); return TIMERS.length; }; clearTimeout = () => {};
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      var ANSWER = { ok: false, error: "Failed to fetch" }; api = async () => ANSWER;
      TK.got = {}; TT.item = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC" }; TT.at = { venue: "ex", symbol: "BTC/USDT:USDT" }; TT.mk = { kind: "perp", base: "BTC", quote: "USDT", price: 81000 }; TT.readAt = Date.now(); TT.fails = 0;
      ROUTE.tab = "trade"; ttPoll();`);
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const [f, ms] = q.run<[() => Promise<void>, number]>("TIMERS.shift()");
      waits.push(ms);
      await f();
    }
    // the first beat on five seconds; then, the account not answering, ten, twenty, forty, then a minute apart
    expect(waits).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
    const said = q.out<string>("SAID.innerHTML");
    expect(said).toMatch(/^Not read again since \d\d:\d\d New York: the account is not answering\. Asking again every 60 s\.$/);
    expect(said).not.toContain("Failed to fetch");
    // the figures standing are the last read's
    expect(q.out<string>("BOX.innerHTML")).toContain("81,000");
    // answered: the words go, and the beat is five seconds again
    q.run('ANSWER = { ok: true, market: { kind: "perp", base: "BTC", quote: "USDT", price: 82000 } }');
    const [f] = q.run<[() => Promise<void>, number]>("TIMERS.shift()");
    await f();
    expect(q.out<string>("SAID.innerHTML")).toBe("");
    expect(q.out("TIMERS[0][1]")).toBe(5000);
    // a refusal is the account's own sentence, with how long until it is asked again
    q.run('ANSWER = { ok: false, refusal: { code: "E_VENUE_UNREACHABLE", message: "Exchange did not answer in time." } }');
    const [g] = q.run<[() => Promise<void>, number]>("TIMERS.shift()");
    await g();
    expect(q.out<string>("SAID.innerHTML")).toMatch(/: Exchange did not answer in time\. Asking again every 10 s\.$/);
  });
});

describe("the six kinds, as the page runs them", () => {
  const p = page();

  it("names the six faces in Markets' order, each with its icon, and tells which face a preset, a Markets row, a market or a venue opens", () => {
    expect(p.out("TK_KINDS.map((k) => k.id)")).toEqual(["crypto", "stocks", "rwas", "perps", "preipo", "predictions"]);
    expect(p.out("TK_KINDS.map((k) => k.icon)")).toEqual(["trade", "stock", "rwa", "perps", "preipo", "prediction"]);
    // a Markets row's kind, a market's kind, the old tile and variant names, the six words themselves
    expect(p.out('[{ kind: "coin" }, { kind: "stock" }, { kind: "rwa" }, { kind: "perp" }, { kind: "event" }, { kind: "token" }, { kind: "spot" }, { kind: "future" }].map(tkKindOf)')).toEqual(["crypto", "stocks", "rwas", "perps", "predictions", "crypto", "crypto", "perps"]);
    expect(p.out('[{ variant: "trade" }, { variant: "perps" }, { variant: "predictions" }, { tile: "swap" }, { kind: "stocks" }, { kind: "preipo" }, {}].map(tkKindOf)')).toEqual(["crypto", "perps", "predictions", "crypto", "stocks", "preipo", "crypto"]);
    // a perpetual on a company's implied valuation is Pre-IPO, whatever it is called
    expect(p.out(`[tkKindOf({ kind: "perp", category: "Pre-IPO" }), tkKindOf({ item: ${JSON.stringify(ANTH)} }), tkKindOf({ kind: "perps", implied: { usd: 1 } }), tkKindOf({ item: { kind: "perp", group: { id: "preipo:openai" } } })]`)).toEqual(["preipo", "preipo", "preipo", "preipo"]);
    // a venue named without a kind: what that venue trades; one that trades several kinds opens Crypto
    p.set("A", pageOf([EX, PRED, HL]));
    expect(p.out('[tkKindOf({ venue: "predict" }), tkKindOf({ venue: "hl" }), tkKindOf({ venue: "ex" })]')).toEqual(["predictions", "perps", "crypto"]);
    // the variant words the page before this one used map to kinds (no alias function remains)
    expect(p.out('[tkKindOf({ venue: "predict", kind: "event" }), tkKindOf({ variant: "swap", venue: "predict" }), tkKindOf({ variant: "perps" }), tkKindOf({ tile: "predictions" }), tkKindOf({})]')).toEqual(["predictions", "crypto", "perps", "predictions", "crypto"]);
    expect(p.out("typeof tkVariantOf")).toBe("undefined");
  });

  it("shows a kind when a connected venue trades it or a read of it has rows — and hides one with nothing; a venue's lens hides public-only kinds", () => {
    p.set("A", pageOf([EX, PRED, WALLET]));
    expect(p.out("tkKindsFor(connected(), {}, lensNow())")).toEqual(["crypto", "perps", "predictions"]);
    const got = { rwas: { items: [ROW("rwa", "NVDA", { at: [{ venue: "wallet", venueName: "Wallet", symbol: "NVDA/USDG@Robinhood Chain", connected: true, canTrade: true, public: false }] })] }, stocks: { items: [ROW("stock", "AAPL", { at: [{ venue: "alpaca-public", venueName: "Alpaca", symbol: "AAPL", connected: false, canTrade: false, public: true }] })] }, preipo: { items: [ANTH] } };
    expect(p.out(`tkKindsFor(connected(), ${JSON.stringify(got)}, lensNow())`)).toEqual(["crypto", "stocks", "rwas", "perps", "preipo", "predictions"]);
    // under a venue's lens: that venue's kinds and the rows it lists; Stocks (public only) and Pre-IPO (the exchange's row) part ways
    expect(p.out(`tkKindsFor([${JSON.stringify(EX)}], ${JSON.stringify(got)}, { kind: "venue", id: "ex", name: "Exchange" })`)).toEqual(["crypto", "perps", "preipo"]);
    // a read-only server still shows the kinds: prices show, the sign button says why nothing is placed
    p.set("A", pageOf([EX, PRED], false));
    expect(p.out("tkKindsFor(connected(), {}, lensNow())")).toEqual(["crypto", "perps", "predictions"]);
    // the pane is one seg + a picker + Under way: no tiles, no mode switch, no Positions, no Recent fills, no Swap/Earn/Sell many panels
    for (const gone of ["TK_TILES", "tkTilesFor", "tkTile", "tkRefusal", "tkSetMode", "TK_VARIANTS", "tkDrawPositions", "tkDrawFills", "tkSwap", "tkSwapHow2", "tkStableSwap", "tkSellMany", "tkSellDraft", "tkLegName", "tkEarn", "tkEarnList", "tkEarnDraft", "tkRate", "tkInVenue", "renderOpen"]) expect(p.run(`typeof ${gone}`), gone).toBe("undefined");
    expect(p.out("Object.keys(TK).sort()")).not.toEqual(expect.arrayContaining(["mode", "pos", "tileDone", "legs"]));
    const src = source("ui/trade.js");
    for (const words of ["Do it myself", "account.tradeMode", "Recent fills", "Your words to agents", "Earning now", "data-tp-pos", "data-tp-fills", "data-tp-intents", "Up to ${money(cap)}"]) expect(src, words).not.toContain(words);
    // the seg is drawn by hand (icons on its buttons) and never collides with core seg()'s click delegation
    expect(src).toContain('data-kind="${esc(id)}" aria-pressed=');
    expect(src).not.toMatch(/class="seg tk-seg"[^>]*data-seg/);
    // `later` lives inside the functions that debounce, never at the top level (ui-fixes forbids it)
    expect(src).not.toMatch(/^(const|function) later\b/m);
  });

  it("drafts an order from the ticket: in dollars or in the market's units, an event contract's limit typed in cents, only the flags the type takes", () => {
    expect(p.out('tkOrderDraft({ amount: " 50 ", unit: "usd", orderType: "market" }, { venue: "ex", symbol: "BTC/USDT", side: "buy", event: false })')).toEqual({ type: "liveOrder", venue: "ex", symbol: "BTC/USDT", side: "buy", orderType: "market", usd: "50", limitPrice: "", stopPrice: "", tif: "", postOnly: "", reduceOnly: "", extendedHours: "", trailPercent: "", trailPrice: "", takeProfit: "", stopLoss: "" });
    // a trailing stop trails by a percent or a price; a market or limit entry carries its exits where typed
    expect(p.out('tkOrderDraft({ amount: "1", unit: "qty", orderType: "trailing_stop", trail: "3", trailBy: "percent", takeProfit: "99" }, { venue: "paper-1", symbol: "AAPL", side: "sell", event: false })')).toMatchObject({ orderType: "trailing_stop", trailPercent: "3", trailPrice: "", takeProfit: "" });
    expect(p.out('tkOrderDraft({ amount: "1", unit: "qty", orderType: "trailing_stop", trail: "2.5", trailBy: "price" }, { venue: "paper-1", symbol: "AAPL", side: "sell", event: false })')).toMatchObject({ trailPercent: "", trailPrice: "2.5" });
    expect(p.out('tkOrderDraft({ amount: "10", unit: "qty", orderType: "limit", limitPrice: "420", tpsl: "on", takeProfit: " 460 ", stopLoss: "400" }, { venue: "paper-1", symbol: "MSFT", side: "buy", event: false })')).toMatchObject({ takeProfit: "460", stopLoss: "400" });
    // the exits go only with Take profit / Stop loss ticked
    expect(p.out('tkOrderDraft({ amount: "10", unit: "qty", orderType: "limit", limitPrice: "420", takeProfit: "460", stopLoss: "400" }, { venue: "paper-1", symbol: "MSFT", side: "buy", event: false })')).toMatchObject({ takeProfit: "", stopLoss: "" });
    expect(p.out('tkOrderDraft({ amount: "26", unit: "qty", orderType: "limit", limitPrice: "38", postOnly: "on", tif: "gtc" }, { venue: "predict", symbol: "SI-FEDCUT-DEC:NO", side: "buy", event: true })')).toMatchObject({ qty: "26", limitPrice: "0.38", postOnly: "true", tif: "gtc" });
    // a stop has no limit and is never post-only; reduce-only rides along where ticked
    expect(p.out('tkOrderDraft({ amount: "0.01", unit: "qty", orderType: "stop", limitPrice: "9", stopPrice: "60000", postOnly: "on", reduceOnly: "on" }, { venue: "ex", symbol: "BTC/USDT:USDT", side: "sell", event: false })')).toMatchObject({ limitPrice: "", stopPrice: "60000", postOnly: "", reduceOnly: "true" });
    expect(p.out('[tkPriceIn("62", true), tkPriceIn("62", false), tkPriceIn("", true), tkCents(0.625), tkCents(undefined)]')).toEqual(["0.62", "62", "", "62.5¢", "—"]);
  });

  it("reads the ticket's Plan as it is signed (setPlan): why, the setup, how sure, the stop and target — its own, else the bracket's where ticked — and 1R; says the stop's distance, the size 1R makes and the win rate the plan needs after the fee; sizes by risk", () => {
    expect(p.out('tkPlanOf({ planWhy: "  Broke 100 on volume ", planSetup: " breakout ", planSure: "0.7", planStop: "", planTarget: "", planRisk: "25", tpsl: "on", stopLoss: "99", takeProfit: "105" })')).toEqual({ why: "Broke 100 on volume", setup: "breakout", confidence: 0.7, stop: 99, target: 105, riskUsd: 25 });
    // its own stop before the bracket's; the bracket's only where Take profit / Stop loss is ticked; no why, no plan
    expect(p.out('tkPlanOf({ planWhy: "x", planStop: "98", tpsl: "on", stopLoss: "99" })')).toEqual({ why: "x", stop: 98 });
    expect(p.out('tkPlanOf({ planWhy: "x", stopLoss: "99", takeProfit: "105", planSure: "", planRisk: "0" })')).toEqual({ why: "x" });
    expect(p.out('tkPlanOf({ planWhy: " ", planStop: "98" })')).toBeNull();
    expect(p.out('tkPlanWords({ planStop: "98", planTarget: "105", planRisk: "50" }, 100, "buy")')).toBe("The stop is 2.00% from the entry: 1R is $50.00, a size of $2,500.00; at this target and stop it must win 31% of the time to break even, after the fee both ways.");
    expect(p.out('tkPlanWords({ planStop: "102" }, 100, "sell")')).toBe("The stop is 2.00% from the entry.");
    expect(p.out('tkPlanWords({ planStop: "102" }, 100, "buy")')).toBe("The stop is on the wrong side of the entry: it would never be the loss.");
    expect(p.out('tkPlanWords({}, 100, "buy")')).toMatch(/^Why you take it, in a sentence/);
    expect(p.out('[tkSizeByRisk({ planStop: "98", planRisk: "50" }, 100, "buy"), tkSizeByRisk({ planRisk: "50", tpsl: "on", stopLoss: "99.5" }, 100, "buy"), tkSizeByRisk({ planStop: "98" }, 100, "buy"), tkSizeByRisk({ planStop: "103", planRisk: "30" }, 100, "sell")]')).toEqual([2500, 10000, 0, 1000]);
  });

  it("lists where a market is, kept to the face's kind: yours that trade it (best first), yours that cannot with what to change, public venues to connect — not one already connected, none on a read-only server", () => {
    p.set("A", pageOf([EX, WALLET, READONLY]));
    const item = { kind: "coin", base: "BTC", at: [{ venue: "okx", venueName: "OKX", symbol: "BTC/USDT", connected: true, canTrade: false }, { venue: "kraken-public", venueName: "Kraken", symbol: "BTC/USD", connected: false, canTrade: false, public: true, price: 62000, connectTo: "kraken", connector: "live:exchange:kraken" }, { venue: "wallet", venueName: "Wallet", symbol: "cbBTC/USDC@Base", connected: true, canTrade: true, price: 62100 }] };
    const ranked = [{ venue: "ex", venueName: "Exchange", symbol: "BTC/USDT", kind: "spot", price: 61990, best: true, open: true, canTrade: true, ready: true }, { venue: "wallet", venueName: "Wallet", symbol: "cbBTC/USDC@Base", kind: "token", price: 62100, worse: 0.18, open: true, canTrade: true, ready: true }];
    const rows = p.out<Array<Record<string, unknown>>>(`tkWhereRows(${JSON.stringify(item)}, ${JSON.stringify(ranked)})`);
    expect(rows.map((r) => [r.state, r.venue])).toEqual([["able", "ex"], ["able", "wallet"], ["off", "okx"], ["public", "kraken-public"]]);
    expect(rows[0]).toMatchObject({ best: true, price: 61990 });
    expect(rows[2]).toMatchObject({ why: "this API key has no Trade permission", how: expect.stringMatching(/Trade.*Then connect it again\./) });
    // a perpetual standing in for the coin, or an RWA token of the same name, is not one of a coin's places (compare rows carry their kind)
    const mixed = [...ranked, { venue: "ex", venueName: "Exchange", symbol: "BTC/USDT:USDT", kind: "perp", price: 61995, open: true, canTrade: true, ready: true }, { venue: "wallet", venueName: "Wallet", symbol: "BTCx/USDC@Base", kind: "token", category: "RWA", price: 62050, open: true, canTrade: true, ready: true }];
    expect(p.out<Array<{ symbol?: string }>>(`tkWhereRows(${JSON.stringify(item)}, ${JSON.stringify(mixed)}, "crypto")`).map((r) => r.symbol)).toEqual(["BTC/USDT", "cbBTC/USDC@Base", undefined, "BTC/USD"]);
    // a stock's places are brokers: an RWA token of the same name is a line to RWAs, not a place to buy shares
    const nvda = { kind: "stock", base: "NVDA", at: [{ venue: "alpaca", venueName: "Alpaca", symbol: "NVDA", connected: true, canTrade: true, price: 180 }] };
    const stockRanked = [{ venue: "alpaca", venueName: "Alpaca", symbol: "NVDA", kind: "stock", price: 180, best: true, open: true, canTrade: true, ready: true }, { venue: "wallet", venueName: "Wallet", symbol: "NVDA/USDG@Robinhood Chain", kind: "token", category: "RWA", price: 181, open: true, canTrade: true, ready: true }];
    p.set("A", pageOf([EX, WALLET, venue("alpaca", "Alpaca", { trade: { can: true, what: "US stocks", kinds: ["stock"] } })]));
    expect(p.out<Array<{ venue: string }>>(`tkWhereRows(${JSON.stringify(nvda)}, ${JSON.stringify(stockRanked)}, "stocks")`).map((r) => r.venue)).toEqual(["alpaca"]);
    expect(p.out("[tkOfFace({ kind: 'token', category: 'RWA' }, 'rwas'), tkOfFace({ kind: 'token' }, 'rwas'), tkOfFace({ kind: 'token', category: 'RWA' }, 'crypto'), tkOfFace({ kind: 'perp' }, 'preipo'), tkOfFace({}, 'stocks')]")).toEqual([true, true, false, true, true]);
    // a pre-IPO venue carries its implied valuation and its unit (they differ by venue); the public one is a price while a connected venue
    // trades the row, and a connection to make when none does
    p.set("A", pageOf([EX]));
    const pre = p.out<Array<Record<string, any>>>(`tkWhereRows(${JSON.stringify(ANTH)}, null, "preipo")`);
    expect(pre.map((r) => [r.state, r.venue])).toEqual([["able", "ex"], ["public", "okx-preipo"]]);
    expect(pre[0]!.implied).toMatchObject({ usd: 2.08e12 });
    expect(pre[1]!.implied.unit).toMatch(/OKX: 1\/10,000,000,000/);
    expect(pre[1]!.connector).toBe("");
    p.set("A", pageOf([PRED]));
    expect(p.out<Array<Record<string, any>>>(`tkWhereRows(${JSON.stringify({ ...ANTH, at: [ANTH.at[0]] })}, null, "preipo")`)).toEqual([expect.objectContaining({ state: "public", venue: "okx-preipo", connector: "live:exchange:okx" })]);
    // OKX's own terms exclude where the user is: said beside the connection, which stays (shown, never enforced — its sign-up decides)
    p.run(`VENUES.set("live:exchange:okx", { connector: "live:exchange:okx", name: "OKX", verdict: "terms-exclude", said: "its terms exclude where you are (https://www.okx.com/help/terms-of-service, read 2026-10-08)" })`);
    const told = p.out<Array<Record<string, any>>>(`tkWhereRows(${JSON.stringify({ ...ANTH, at: [ANTH.at[0]] })}, null, "preipo")`);
    expect(told).toEqual([expect.objectContaining({ state: "public", venue: "okx-preipo", connector: "live:exchange:okx", terms: expect.objectContaining({ word: "Its terms exclude where you are" }) })]);
    // where OKX does not serve this network at all, it is not listed: the list is what serves the user, and it counts what it left out
    p.run(`VENUES.set("live:exchange:okx", { connector: "live:exchange:okx", name: "OKX", verdict: "not-served", said: "OKX does not serve this location" })`);
    const shut = p.run<{ rows: unknown[]; away: number }>(`(() => { const r = tkWhereRows(${JSON.stringify({ ...ANTH, at: [ANTH.at[0]] })}, null, "preipo"); return { rows: [...r], away: r.away }; })()`);
    expect(shut).toEqual({ rows: [], away: 1 });
    // close-only (a venue that takes the user only to close) stays, in a word, with no connection offered
    p.run(`VENUES.set("live:exchange:okx", { connector: "live:exchange:okx", name: "OKX", verdict: "close-only", said: "OKX lets this location close positions, not open new ones" })`);
    const closing = p.out<Array<Record<string, any>>>(`tkWhereRows(${JSON.stringify({ ...ANTH, at: [ANTH.at[0]] })}, null, "preipo")`);
    expect(closing).toEqual([expect.objectContaining({ state: "public", venue: "okx-preipo", connector: "", refuses: expect.objectContaining({ word: "Close only here" }) })]);
    // a connected venue that does not serve this network now is not listed either
    p.set("A", pageOf([{ ...EX, notServed: { said: "Exchange does not serve this location" } }, WALLET, READONLY]));
    const away = p.run<{ venues: string[]; away: number }>(`(() => { const r = tkWhereRows(${JSON.stringify(item)}, ${JSON.stringify(ranked)}); return { venues: r.map((x) => x.venue), away: r.away }; })()`);
    expect(away).toEqual({ venues: ["wallet", "okx", "kraken-public"], away: 1 });
    // a connected close-only venue stays listed for what it takes (a sell), marked so the ticket says its state for a buy
    p.set("A", pageOf([{ ...EX, closeOnly: { said: "Exchange lets this location close positions, not open new ones" } }, WALLET, READONLY]));
    expect(p.out<Array<{ venue: string; closeOnly?: boolean }>>(`tkWhereRows(${JSON.stringify(item)}, ${JSON.stringify(ranked)})`).find((r) => r.venue === "ex")).toMatchObject({ state: "able", closeOnly: true });
    p.run(`VENUES.clear()`);
    // the public listing of a venue the owner has since connected is not offered again
    p.set("A", pageOf([EX, venue("kraken", "Kraken", { trade: { can: true, kinds: ["spot"] } })]));
    expect(p.out<Array<{ state: string }>>(`tkWhereRows(${JSON.stringify(item)}, [])`).map((r) => r.state)).not.toContain("public");
    // a read-only server: the public line is a price, there is nothing to connect for
    p.set("A", pageOf([EX], false));
    expect(p.out<Array<{ state: string; connector?: string }>>(`tkWhereRows(${JSON.stringify(item)}, [])`).find((r) => r.state === "public")?.connector).toBe("");
    // Connect to trade opens the connection the row names, through connect.js's own door (connectVia); one this server does not offer says so
    p.set("A", { ...pageOf([EX]), connectLive: { writes: { on: true, capUsd: 250 }, options: [{ kind: "exchange", connector: "live:exchange", needs: "key-file", venues: ["kraken"] }, { kind: "kalshi", connector: "live:kalshi", needs: "key-file" }] } });
    p.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true }); var CONNECTED = []; openConnect = (o, opts) => CONNECTED.push([o.kind, opts.exchange, opts.name]); var TOASTS = []; toast = (t) => TOASTS.push(t)');
    p.run('tkConnectTo({ connector: "live:exchange:kraken", venueName: "Kraken" }); tkConnectTo({ connector: "live:kalshi", venueName: "Kalshi" }); tkConnectTo({ venueName: "Nowhere" })');
    expect(p.out("CONNECTED")).toEqual([["exchange", "kraken", "Kraken"], ["kalshi", "", "Kalshi"]]);
    expect(p.out("TOASTS")).toEqual(["Nowhere can't be connected from this server."]);
  });

  it("says each face's own block from the market, the place and the row: hours and whole shares, the issuer once, a perpetual's facts and margin, a pre-IPO valuation and notice, an event's payout", () => {
    p.set("A", pageOf([EX, WALLET]));
    p.run("TK.cross = null");
    const kb = (kind: string, m: unknown, at: unknown, item: unknown, c: unknown = {}) => p.run<string>(`tkKindBlock(${JSON.stringify(kind)}, ${JSON.stringify(m)}, ${JSON.stringify(at)}, ${JSON.stringify(item)}, ${JSON.stringify(c)})`);
    // Stocks: the session from the venue's own clock (or the market calendar), never from `open` — at night a real broker's stock is still
    // open (Alpaca holds an order for the open) — then the venue's note verbatim; whole shares where the step is one
    const held = "the US stock market is closed: Alpaca holds an order and sends it when the market opens (2026-10-07 09:30 New York time). Until then no market order is placed here: it would fill at the opening price, which can be well away from this one. A limit, stop or stop-limit order waits for the open with its limit";
    const night = { symbol: "AAPL", kind: "stock", base: "AAPL", quote: "USD", open: true, session: { open: false, opensAt: "2026-10-07T13:30:00.000Z", closesAt: "2026-10-07T20:00:00.000Z" }, note: held, qtyStep: 1, types: ["limit", "stop", "stop_limit"] };
    const aapl = kb("stocks", night, null, null);
    // the viewer's own time after New York's where the viewer's clock is not New York's (core.js yourTime): the same words in any zone
    const yt = (iso: string) => p.out<string>(`yourTime(${JSON.stringify(iso)})`);
    expect(aapl).toContain(`<div><b>Closed</b> · opens Wed 7 Oct, 09:30 New York${yt("2026-10-07T13:30:00.000Z")} · ${held}</div>`);
    expect(aapl).not.toContain("Open now");
    expect(aapl).toContain("Whole shares only here.");
    // in session: open now, and when it closes, in New York time (an early close as the venue's clock says it)
    const day = kb("stocks", { ...night, session: { open: true, opensAt: "2026-10-07T13:30:00.000Z", closesAt: "2026-10-06T20:00:00.000Z" }, note: undefined, qtyStep: 0.001, types: ["market", "limit"] }, null, null);
    expect(day).toContain(`<div><b>Open now</b> · closes 16:00 New York${yt("2026-10-06T20:00:00.000Z")}</div>`);
    expect(day).not.toContain("Whole shares only here.");
    expect(kb("stocks", { ...night, session: { open: true, closesAt: "2026-11-27T18:00:00.000Z" }, note: undefined }, null, null)).toContain(`<b>Open now</b> · closes 13:00 New York${yt("2026-11-27T18:00:00.000Z")}`);
    // no session said (Alpaca's clock did not answer): no Open or Closed word at all, only the venue's own words
    const words = "Alpaca's market clock did not answer, so no market order is placed here: outside market hours Alpaca holds an order until the market opens, and a market order would fill at the opening price";
    const unknown = kb("stocks", { ...night, session: undefined, note: words }, null, null);
    expect(unknown).toContain(`<div>${words.replace(/'/g, "&#39;")}</div>`);
    expect(unknown).not.toMatch(/Open now|<b>Closed/);
    expect(kb("stocks", { ...night, session: undefined, note: undefined, qtyStep: 1 }, null, null)).toBe("<div>Whole shares only here.</div>");
    // a stock the venue takes no order in now (halted) says so with the venue's words, whatever the session
    const halted = kb("stocks", { ...night, open: false, session: { open: true, closesAt: "2026-10-06T20:00:00.000Z" }, note: "AAPL is halted at Robinhood: news pending" }, null, null);
    expect(halted).toContain("<div><b>Closed now.</b> AAPL is halted at Robinhood: news pending</div>");
    expect(halted).not.toContain("Open now");
    expect(halted.match(/halted at Robinhood/g)).toHaveLength(1);
    // RWAs: the issuer's words once, the pay token and the chain, the route's own line
    const ousg = kb("rwas", { symbol: "OUSG/USDC@Ethereum", kind: "token", base: "OUSG", quote: "USDC", open: true, note: "LI.FI: 0.25% fee, 0.5% slippage, gas paid by the wallet", types: ["market"] }, null, { kind: "rwa", base: "OUSG", issuer: "Ondo Finance", eligibility: "OUSG moves only between wallets Ondo has approved", at: [] });
    expect(ousg).toContain("Issued by <b>Ondo Finance</b>.");
    expect(ousg).toContain("OUSG moves only between wallets Ondo has approved");
    expect(ousg).toContain("Paid in <b>USDC</b> on Ethereum.");
    expect(ousg).toContain("LI.FI: 0.25% fee, 0.5% slippage, gas paid by the wallet");
    expect((ousg.match(/Ondo Finance/g) ?? []).length).toBe(1);
    // with chains to choose from, a Chain field
    expect(kb("rwas", { symbol: "OUSG/USDC@Ethereum", kind: "token", base: "OUSG", quote: "USDC", open: true, types: ["market"] }, null, null, { chains: [{ symbol: "OUSG/USDC@Ethereum", chain: "Ethereum", quote: "USDC" }, { symbol: "OUSG/USDG@Robinhood Chain", chain: "Robinhood Chain", quote: "USDG" }] })).toContain('<select name="chain">');
    // Perps: the price — a venue that says no mark has its price called a price, never a mark — funding and its next payment, the leverage
    // the venue takes, the margin the amount needs, what is held
    const perp = { symbol: "ETH/USDT:USDT", kind: "perp", base: "ETH", quote: "USDT", price: 2500, open: true, fundingRate: 0.0001, nextFundingAt: "2026-10-06T16:00:00.000Z", maxLeverage: 20, types: ["market", "limit"] };
    const facts = kb("perps", perp, { venue: "ex", venueName: "Exchange" }, null, { amount: "100", unit: "usd", leverage: "5", held: { side: "long", qty: 0.05, leverage: 5, liquidationPrice: 2100, entryPrice: 2480 }, positions: [] });
    expect(facts).toContain("Price 2,500 USDT");
    expect(facts).not.toContain("Mark");
    expect(facts).toContain("Funding 0.0100% a period, next paid 12:00 New York · up to 20x here.");
    // a venue that says its mark and its oracle (Hyperliquid's markPx and oraclePx), and pays funding every hour: the mark is its own — not
    // the middle the price is — with the oracle beside it, and the rate an hour's
    const hl = kb("perps", { ...perp, price: 2500.5, markPrice: 2500, oraclePrice: 2501.3, fundingEveryH: 1 }, { venue: "ex", venueName: "Exchange" }, null, { positions: [] });
    expect(hl).toContain("Mark 2,500 USDT · oracle 2,501.3");
    expect(hl).toContain("Funding 0.0100% an hour, next paid 12:00 New York · up to 20x here.");
    // the margin is the quote's, from the order prepared (tkOrderWords), never from the amount typed: a step may round the order down
    expect(facts).not.toContain("Margin");
    expect(facts).toContain("You hold long 0.05 at 5x · liquidation at 2,100 · entry 2,480.");
    expect(kb("perps", perp, { venue: "ex", venueName: "Exchange" }, null, { positions: [] })).toContain("Nothing held here yet");
    // Pre-IPO: from the row alone when no market is picked — the valuation, the unit, the conversion, the company's notice, what it is not
    const pre = kb("preipo", null, null, ANTH, {});
    // Markets' own figure for a valuation (mkValuation), the same one its rows show
    expect(pre).toContain("Implied valuation ≈ $2.08T");
    expect(pre).toContain("a contract 2,080");
    expect(pre).toContain("1 contract = 1/1,000,000,000 of the implied company valuation");
    expect(pre).toContain("Becomes a stock perpetual at the IPO; the venue rebases when the share count is public.");
    expect(pre).toContain("Anthropic, 29 June 2026: transfers of its shares it has not approved are void");
    // the company's own words, labelled as such — the venue writes the contract, so nothing here says the company issues it
    expect(pre).toContain("<b>What the company says</b>");
    expect(pre).not.toContain("Issued by");
    expect(pre).toContain("This is a contract on a valuation, not a share.");
    // …and with the venue's market, the venue's own implied figure and the perpetual's facts too
    const preAt = kb("preipo", { symbol: "ANTHROPIC/USDT:USDT", kind: "perp", base: "ANTHROPIC", quote: "USDT", price: 2080, open: true, maxLeverage: 20, types: ["market"] }, ANTH.at[1], ANTH, { positions: [] });
    expect(preAt).toContain("a contract 2,080 USDT");
    expect(preAt).toContain("Up to 20x here.");
    // Predictions: the payout line from the amount, the close counted down, sells only what you hold
    const fed = { symbol: "SI-FEDCUT-DEC:YES", kind: "event", base: "SI-FEDCUT-DEC", quote: "USD", price: 0.62, ask: 0.62, bid: 0.6, outcome: "Yes", open: true, closeTime: "2026-12-10T19:00:00.000Z", sellsReduce: true, types: ["market", "limit"] };
    const pay = kb("predictions", fed, null, null, { side: "buy", outcome: "Yes", amount: "10", unit: "usd", held: { qty: 50 }, positions: [] });
    expect(pay).toContain("<b>16 contracts pay $16.00</b> if Yes · cost ≈ $9.92 · the market gives it 62%");
    expect(pay).toContain('data-tk-close="2026-12-10T19:00:00.000Z"');
    expect(pay).toContain("Sells only what you hold · 50 held.");
    expect(kb("predictions", fed, null, null, { side: "buy", outcome: "Yes", positions: [] })).toContain("<b>Yes</b> at 62¢ — the market gives it 62%. Each contract pays $1.00 if it happens, nothing if not.");
    // Crypto at a wallet: the venue's own line (route, slippage, gas); paid with a coin held: the two steps said
    expect(kb("crypto", { symbol: "WETH/USDC@Base", kind: "token", base: "WETH", quote: "USDC", open: true, bid: 2499, ask: 2501, note: "Route by LI.FI · 0.3% slippage · gas ≈ $0.02", types: ["market"] }, null, null, { pay: { asset: "cbBTC" } })).toMatch(/Route by LI\.FI[\s\S]*Paid with <b>cbBTC<\/b>: sold first, then WETH bought/);
  });

  it("a session outside the regular one — pre-market, after-hours, overnight — is said with when it ends, on New York's clock and the viewer's own, and whether a limit with extended hours trades now; the ticket drafts the flag only for a limit", () => {
    const line = (s: unknown) => p.run<string>(`tkSessionLine(${JSON.stringify(s)})`);
    const words = (s: unknown) => p.run<string>(`mkSessionWhen(${JSON.stringify(s)})`);
    const night = { open: false, opensAt: "2026-10-14T13:30:00.000Z", closesAt: "2026-10-14T20:00:00.000Z", phase: "overnight", phaseEndsAt: "2026-10-14T08:00:00.000Z", extendedHours: true };
    // the page's own zone is New York's here (the stand-in browser), so no "your time" follows
    expect(p.run<string>("YOUR_ZONE")).toBeDefined();
    expect(line(night).replace(/ \([^)]* your time\)/g, "")).toBe("<b>Overnight session</b> · until 04:00 New York · a limit order with extended hours trades now · regular session opens Wed 14 Oct, 09:30 New York");
    expect(line({ ...night, phase: "pre", phaseEndsAt: "2026-10-14T13:30:00.000Z" }).replace(/ \([^)]* your time\)/g, "")).toBe("<b>Pre-market</b> · until 09:30 New York · a limit order with extended hours trades now · regular session opens Wed 14 Oct, 09:30 New York");
    expect(line({ ...night, phase: "after", phaseEndsAt: "2026-10-15T00:00:00.000Z", extendedHours: false }).replace(/ \([^)]* your time\)/g, "")).toBe("<b>After-hours</b> · until 20:00 New York · orders wait for the regular session · regular session opens Wed 14 Oct, 09:30 New York");
    expect(line({ open: false, opensAt: "2026-10-19T13:30:00.000Z", phase: "closed" }).replace(/ \([^)]* your time\)/g, "")).toBe("<b>Closed</b> · opens Mon 19 Oct, 09:30 New York");
    expect(line({ open: true, closesAt: "2026-10-14T20:00:00.000Z", phase: "regular", extendedHours: false }).replace(/ \([^)]* your time\)/g, "")).toBe("<b>Open now</b> · closes 16:00 New York");
    expect(words(night).replace(/ \([^)]* your time\)/g, "")).toBe("overnight session until 04:00 New York · a limit order with extended hours trades now");
    expect(words({ open: false, opensAt: "2026-10-19T13:30:00.000Z" })).toMatch(/^opens Mon 19 Oct, 09:30 New York/);
    // the viewer's own clock, by zone: Hong Kong's afternoon for New York's 04:00, Singapore's evening for 09:30, the next day's morning for 20:00
    const your = (iso: string, zone: string) => p.run<string>(`yourTime(${JSON.stringify(iso)}, ${JSON.stringify(zone)})`);
    expect(your("2026-10-14T08:00:00.000Z", "Asia/Hong_Kong")).toBe(" (16:00 your time)");
    expect(your("2026-10-14T13:30:00.000Z", "Asia/Singapore")).toBe(" (21:30 your time)");
    expect(your("2026-10-15T00:00:00.000Z", "Asia/Hong_Kong")).toBe(" (Thu 08:00 your time)");
    expect(your("2026-10-14T08:00:00.000Z", "America/New_York")).toBe("");
    expect(your("2026-10-14T08:00:00.000Z", "America/Los_Angeles")).toBe(" (01:00 your time)");
    // EXTENDED HOURS IS IN VIEW, not under Advanced (feat/paper-live phase 3, P3): Advanced's line no longer carries it — its switch's own
    // words say the session on, until when, and what the switch does to this order
    const adv = (m: unknown, f: unknown) => p.run<string>(`tkAdvSummary(${JSON.stringify(m)}, ${JSON.stringify(f)})`);
    expect(adv({ tifs: ["day", "gtc"], session: { extendedHours: true } }, { orderType: "limit", extendedHours: "on" })).toBe("The venue's default · today only · until canceled");
    expect(adv({ tifs: ["day", "gtc"], session: { extendedHours: true } }, { orderType: "limit", tif: "day", extendedHours: "on" })).toBe("Today only");
    expect(adv({ session: { extendedHours: true } }, { orderType: "stop" })).toBe("The venue's defaults: no time in force, post-only or reduce-only is set from here");
    expect(p.run<string>(`tkAdvShort(${JSON.stringify({ tifs: ["day", "gtc"], session: { extendedHours: true } })}, ${JSON.stringify({ orderType: "limit", extendedHours: "on" })})`)).toBe("Default");
    const eh = (session: unknown, t: string, on: boolean) => p.run<string>(`tkEhWords(${JSON.stringify({ session })}, ${JSON.stringify(t)}, ${on})`);
    const pre = { open: false, phase: "pre", phaseEndsAt: "2026-10-14T13:30:00.000Z", extendedHours: true };
    expect(eh(pre, "limit", true)).toBe("Pre-market is on until 09:30 New York: this limit order trades now.");
    expect(eh(pre, "limit", false)).toBe("Pre-market is on until 09:30 New York: this limit order waits for the regular session. Tick Extended hours to trade now.");
    expect(eh({ ...night }, "market", false)).toBe("The overnight session is on until 04:00 New York: a market order waits for the regular session. Tick Extended hours to trade now, as a limit.");
    expect(eh({ ...pre, extendedHours: false }, "limit", true)).toBe("");
    expect(eh({ open: true, phase: "regular" }, "market", false)).toBe("");
    // the draft carries the flag for a limit only
    const draft = (f: unknown) => p.out(`tkOrderDraft(${JSON.stringify(f)}, { venue: "alpaca-paper", symbol: "AAPL", side: "buy", event: false })`);
    expect(draft({ amount: "20", unit: "usd", orderType: "limit", limitPrice: "201", tif: "day", extendedHours: "on" })).toMatchObject({ orderType: "limit", limitPrice: "201", tif: "day", extendedHours: "true" });
    expect(draft({ amount: "20", unit: "usd", orderType: "stop_limit", limitPrice: "201", stopPrice: "199", extendedHours: "on" })).toMatchObject({ orderType: "stop_limit", extendedHours: "" });
  });

  it("speaks the venue's rule on Advanced's one line — what is set, else what the market takes — never invented", () => {
    const adv = (m: unknown, f: unknown) => p.run<string>(`tkAdvSummary(${JSON.stringify(m)}, ${JSON.stringify(f)})`);
    // Kalshi: a market order fills now or is cancelled
    expect(adv({ tifs: ["ioc", "fok", "gtc"], tifsByType: { market: ["ioc", "fok"] } }, { orderType: "market" })).toBe("A market order here fills now or is cancelled (ioc/fok)");
    // Polymarket: never rests until cancelled
    expect(adv({ tifs: ["fok", "day"] }, { orderType: "limit" })).toBe("Never rests until cancelled here: all now or nothing or today only");
    // mm Hyperliquid: nothing to set from here
    expect(adv({}, { orderType: "limit" })).toBe("The venue's defaults: no time in force, post-only or reduce-only is set from here");
    // an exchange: the default and what it takes; once something is set, that
    expect(adv({ tifs: ["gtc", "day"], postOnly: true, reduceOnly: true }, { orderType: "limit" })).toBe("The venue's default · until canceled · today only · post-only possible · reduce-only possible");
    expect(adv({ tifs: ["gtc", "day"], postOnly: true }, { orderType: "limit", tif: "gtc", postOnly: "on" })).toBe("Until canceled · post-only");
    // the disclosure is folded and holds exactly the time in force and the flags; the leverage of a perpetual stays in view above it
    const src = source("ui/trade.js");
    const details = src.indexOf('<details class="tk-adv" data-adv hidden>');
    expect(details).toBeGreaterThan(0);
    const inside = src.slice(details, src.indexOf("</details>", details));
    for (const f of ["data-more", "data-tif", 'name="postOnly"', "data-adv-sum"]) expect(inside, f).toContain(f);
    expect(inside).not.toContain("data-lev");
    // extended hours is a switch in view beside them, its words under it (P3), never folded under Advanced
    expect(inside).not.toContain('name="extendedHours"');
    expect(src.indexOf('name="extendedHours"')).toBeLessThan(details);
    expect(src.indexOf("data-eh-s")).toBeLessThan(details);
    // reduce only and take profit / stop loss sit in view, under the size, as a trading screen holds them
    expect(inside).not.toContain('name="reduceOnly"');
    expect(src.indexOf('name="reduceOnly"')).toBeLessThan(details);
    expect(src.indexOf('name="tpsl"')).toBeLessThan(details);
    expect(src.indexOf('<div class="tk-lev" data-lev hidden>')).toBeLessThan(details);
    expect(src).toContain('q("[data-adv]").hidden = more.hidden;');
    // the quote and what is signed are written through paint: a refresh never takes the focus from What you sign
    expect(src).toContain("const show = (html) => paint(box, html);");
    expect(src).toContain("const signed = (html) => paint(sign, html);");
  });

  it("plans paying with a coin held: a dollar for a coin or back in one order, a coin for a coin in two through the dollar both share; one dollar for another is a Move", () => {
    const markets = [{ symbol: "WETH/USDC@Base", kind: "token", base: "WETH", quote: "USDC", open: true }, { symbol: "cbBTC/USDC@Base", kind: "token", base: "cbBTC", quote: "USDC", open: true }, { symbol: "USDY/USDC@Ethereum", kind: "token", base: "USDY", quote: "USDC", open: true }, { symbol: "BTC/USDT", kind: "spot", base: "BTC", quote: "USDT", open: true }, { symbol: "SOL/USDT", kind: "spot", base: "SOL", quote: "USDT", open: true }];
    const plan = (o: Record<string, unknown>) => p.out<any>(`tkSwapPlan(${JSON.stringify({ markets, ...o })})`);
    expect(plan({ venue: "ex", from: "USDC", to: "USDT", amount: "50" })).toMatchObject({ mode: "", why: expect.stringMatching(/Move › Swap stablecoins/) });
    expect(plan({ venue: "wallet", from: "USDC", to: "WETH", amount: "25", chain: "Base" }).legs).toEqual([{ type: "liveOrder", venue: "wallet", symbol: "WETH/USDC@Base", side: "buy", orderType: "market", usd: "25", limitPrice: "", stopPrice: "", tif: "", postOnly: "", reduceOnly: "" }]);
    expect(plan({ venue: "wallet", from: "WETH", to: "USDC", amount: "0.1", chain: "Base" }).legs[0]).toMatchObject({ symbol: "WETH/USDC@Base", side: "sell", qty: "0.1" });
    // a coin held on one chain is sold there, and only a coin listed against the same dollar on that chain can be bought with it
    const two = plan({ venue: "wallet", from: "WETH", to: "cbBTC", amount: "0.1", chain: "Base" });
    expect(two).toMatchObject({ mode: "two", from: "WETH", to: "CBBTC", via: "USDC", legs: [{ symbol: "WETH/USDC@Base", side: "sell", qty: "0.1" }, { symbol: "cbBTC/USDC@Base", side: "buy", usd: "" }] });
    expect(p.run(`tkSwapHow(${JSON.stringify(two)})`)).toBe("Two orders: sells WETH for USDC (WETH/USDC@Base), then buys CBBTC with what that brings (cbBTC/USDC@Base) — two signatures.");
    expect(plan({ venue: "wallet", from: "WETH", to: "USDY", amount: "0.1", chain: "Base" })).toMatchObject({ mode: "", why: expect.stringMatching(/USDY isn't listed against USDC/) });
    expect(plan({ venue: "ex", from: "BTC", to: "SOL", amount: "0.001" })).toMatchObject({ mode: "two", via: "USDT" });
    expect(plan({ venue: "ex", from: "USDC", to: "BTC", amount: "10" })).toMatchObject({ mode: "", why: "BTC isn't listed against USDC here (it trades against USDT)." });
    expect(plan({ venue: "ex", from: "BTC", to: "BTC" }).why).toBe("Pick two different assets.");
    // what the sale brought, less its fee, down to the cent: what the second leg spends
    expect(p.out("tkProceeds({ filledQty: 0.001, avgPrice: 62523.2, feeUsd: 0.04 })")).toBe(62.48);
    expect(p.out("tkProceeds({ filledQty: 0, price: 10 })")).toBe(0);
    // the ticket's own words for the two steps and its buttons
    const src = source("ui/trade.js");
    for (const words of ["Two steps, two signatures.", "Sign the sale (1 of 2)", "Sign the buy (2 of 2)", "tkFilled(o, live)", "tkProceeds(o)"]) expect(src, words).toContain(words);
  });

  it("Under way: an agent's card is a status row whose one action is Review (answered under Portfolio); an order has Change, Cancel, Send from wallet…", () => {
    p.set("A", pageOf([EX, WALLET]));
    const card = { id: "card-7", kind: "order", reason: "Buy about $120 of ETH", agentName: "Claude Code", expiresAt: "2026-10-06T12:29:00.000Z", shown: [{ name: "venue", value: "ex" }] };
    const acts = p.run<string>(`tkOpenActs({ c: ${JSON.stringify(card)} })`);
    expect(acts).toContain('data-review="card-7"');
    expect(acts).not.toMatch(/Approve|Reject|data-card/);
    expect(p.run<string>(`tkOpenStatus({ c: ${JSON.stringify(card)} })`)).toContain("Waiting for you");
    expect(p.run<string>(`tkOpenWhat({ c: ${JSON.stringify(card)} })`)).toContain("Buy about $120 of ETH");
    const order = { id: "ord-9", venue: "ex", venueName: "Exchange", side: "buy", qty: 0.5, base: "SOL", type: "limit", limitPrice: 140, status: "open", clientId: "c9" };
    const oacts = p.run<string>(`tkOpenActs({ o: ${JSON.stringify(order)} })`);
    expect(oacts).toContain('data-amend="ord-9"');
    expect(oacts).toContain('data-cancel="ord-9"');
    expect(p.run<string>(`tkOpenActs({ o: ${JSON.stringify({ ...order, venue: "wallet", venueName: "Wallet", walletTxs: [{}], ref: "" })} })`)).toContain("Send from wallet…");
    // an order the account stopped following (the owner's cancel asked while its venue refused this network): Not followed, its note on
    // hover, never Open; no Change, and Cancel stays (it sends the owner's cancel again)
    const gone = { ...order, unfollowed: true, note: "Exchange refuses this network, so the account can neither cancel it nor see it fill: it stopped following it. Cancel it at Exchange" };
    expect(p.run<string>(`tkOpenStatus({ o: ${JSON.stringify(gone)} })`)).toBe(`<span class="tp-st dim" title="${gone.note}">Not followed</span>`);
    const goneActs = p.run<string>(`tkOpenActs({ o: ${JSON.stringify(gone)} })`);
    expect(goneActs).not.toContain("data-amend");
    expect(goneActs).toContain('data-cancel="ord-9"');
    expect(p.run<string>(`tkOpenStatus({ o: ${JSON.stringify(order)} })`)).toBe('<span class="tp-st">Open</span>');
    const src = source("ui/trade.js");
    expect(src).toContain('if (d.review) return void go("portfolio", { card: d.review });');
    expect(src).not.toContain('type: "approveCard"');
    // drawn through paint (in place: the focused button keeps its focus), its buttons heard once, on the section itself; the empty words
    // say where a card is answered
    const body = src.slice(src.indexOf("function tkDrawOpen"), src.indexOf("function tkOpenWhat"));
    expect(body).toContain("paint(sec, html);");
    expect(body).toMatch(/if \(sec\.tkHeard\) return;\s*sec\.tkHeard = true;\s*sec\.addEventListener\("click"/);
    expect(body).toContain("data-cancel-all");
  });

  it("drafts the owner's words to an agent and, when asked, its trading limit for them — exactly the fields the door signs; the composer suggests by the six kinds", () => {
    const now = Date.parse("2026-10-06T12:00:00.000Z");
    const d = p.out<any>(`htaDrafts({ agent: "0xABCDEF0000000000000000000000000000000001", venue: "ex", symbol: " ETH/USDT ", side: "sell", usd: "100", text: "  Sell about $100 of ETH under $2,300  ", days: "7", withLimit: true, perOrder: "", budget: "200" }, ${now})`);
    expect(d.intent).toEqual({ type: "setIntent", id: "", agent: "0xabcdef0000000000000000000000000000000001", venue: "ex", symbol: "ETH/USDT", side: "sell", usd: "100", text: "Sell about $100 of ETH under $2,300", validUntil: now + 7 * 86_400_000 });
    // per order left empty: the whole budget is one order's most
    expect(d.limit).toEqual({ type: "approveSpend", agent: "0xabcdef0000000000000000000000000000000001", scope: "trade", allow: "ex", perPayment: "200", budget: "200", windowHours: 0, validUntil: now + 7 * 86_400_000 });
    // every agent: no limit (a limit is one agent's); no venue: every venue; words cut at 200; a side that is neither is left to the agent
    const all = p.out<any>(`htaDrafts({ agent: "*", side: "hold", text: ${JSON.stringify("x".repeat(260))}, withLimit: true, budget: "50" }, ${now})`);
    expect([all.limit, all.intent.agent, all.intent.side, all.intent.text.length]).toEqual([null, "*", "", 200]);
    expect(p.out<any>(`htaDrafts({ agent: "0xabcdef0000000000000000000000000000000001", text: "go", withLimit: true, budget: "50" }, ${now})`).limit.allow).toBe("*");
    // handing over earning gives an earn limit, not a trading one — at the venue named, or the venues that earn; never every account
    expect(p.out<any>(`htaDrafts({ agent: "0xabcdef0000000000000000000000000000000001", venue: "okx", text: "keep USDC earning", withLimit: true, budget: "50", scope: "earn" }, ${now})`).limit).toMatchObject({ scope: "earn", allow: "okx" });
    expect(p.out<any>(`htaDrafts({ agent: "0xabcdef0000000000000000000000000000000001", text: "keep USDC earning", withLimit: true, budget: "50", scope: "earn", earnAt: "okx,mm" }, ${now})`).limit).toMatchObject({ scope: "earn", allow: "okx,mm" });
    expect(p.out<any>(`htaDrafts({ agent: "0xabcdef0000000000000000000000000000000001", text: "keep USDC earning", withLimit: true, budget: "50", scope: "earn" }, ${now})`).limit).toBeNull();
    // words being changed keep the end of the limit given with them: both end at that moment
    const kept = p.out<any>(`htaDrafts({ id: "intent-0002", agent: "0xabcdef0000000000000000000000000000000001", text: "slower", days: "1", until: ${now + 5 * 86_400_000}, withLimit: true, budget: "50" }, ${now})`);
    expect([kept.intent.validUntil, kept.limit.validUntil]).toEqual([now + 5 * 86_400_000, now + 5 * 86_400_000]);
    // what the door signs, field for field, once the account adds its nonce
    for (const a of [d.intent, d.limit, { type: "setIntent", id: "intent-0001", agent: "*", venue: "", symbol: "", side: "", usd: "", text: "", validUntil: 0 }]) expect(malformed({ ...a, nonce: now } as OwnerAction), a.type).toBeNull();
    // the composer: a hint for each of the six kinds and for earning; a kind tag; the sheet variant lists no intents (Portfolio does)
    expect(p.out("Object.keys(HTA_HINT)")).toEqual(["crypto", "stocks", "rwas", "perps", "preipo", "predictions", "earn"]);
    expect(p.out('[htaKindWord("perps"), htaKindWord("earn"), htaKindWord("")]')).toEqual(["Perps", "Earn", ""]);
    const intent = source("ui/intent.js");
    expect(intent).not.toContain("Your words to agents");
    expect(intent).not.toMatch(/Conservative|Aggressive/);
    expect(intent).toContain("openSheet('<div data-hta></div>'");
    expect(intent).toContain("openTicket({ ...(kind !== \"earn\" ? { kind } : {}),");
    expect(p.run("typeof htaIntents")).toBe("function");
  });
});

describe("what the ticket says is available to trade, and the slider that sizes from it", () => {
  const p = page();
  p.set("A", pageOf([EX]));
  const av = (v: unknown, m: unknown, o: unknown = {}) => p.out<any>(`tkAvail(${JSON.stringify(v)}, ${JSON.stringify(m)}, ${JSON.stringify(o)})`);

  it("counts only the dollars free to spend: not a paper perpetual's margin and result, not Hyperliquid's margin in use", () => {
    // $10,000 of paper, $5,000 of it the margin of an open BTC perpetual: $5,000 is there to trade with
    const paper = venue("paper-1", "Paper", { paper: true, cashUsd: 10000, holdings: [{ asset: "USD", amount: 5000, usd: 5000, class: "cash", note: "paper money" }, { asset: "USD", amount: 5000, usd: 5000, class: "cash", note: "paper margin · long 0.1 BTC-PERP · 5x", freeUsd: 0 }] });
    expect(av(paper, { kind: "coin", symbol: "ETH/USD", base: "ETH" }).cash).toBe(5000);
    expect(av(paper, { kind: "perp", symbol: "ETH-PERP", base: "ETH" }, { positions: [] }).cash).toBe(5000);
    // Hyperliquid's perps account: worth $1,000, $400 of it withdrawable; and $50 on its spot side, another ledger than a perpetual's
    const hl = venue("hl", "Hyperliquid", { connector: "live:hyperliquid-trade", cashUsd: 1050, holdings: [{ asset: "USDC", amount: 1000, usd: 1000, class: "stable", note: "perps · 400.00 withdrawable", freeUsd: 400 }, { asset: "USDC", amount: 50, usd: 50, class: "stable", note: "spot" }] });
    expect(av(hl, { kind: "perp", symbol: "BTC/USDC:USDC", name: "BTC/USDC perpetual", base: "BTC" }, { positions: [] }).cash).toBe(400);
    // money on its way is not there yet, nor is an exchange's funding account's (an order is paid from its trading account)
    expect(av(venue("ex", "Exchange", { holdings: [{ asset: "USDT", amount: 300, usd: 300, class: "stable", note: "spot" }, { asset: "USDT", amount: 200, usd: 200, class: "stable", inTransit: true }, { asset: "USDT", amount: 700, usd: 700, class: "stable", note: "funding" }] }), { kind: "spot", symbol: "BTC/USDT", base: "BTC" }).cash).toBe(300);
    // a wallet's market on one chain is paid from that chain's dollars
    const wallet = venue("wallet", "Wallet", { holdings: [{ asset: "USDC", amount: 100, usd: 100, class: "stable", note: "Base" }, { asset: "USDC", amount: 500, usd: 500, class: "stable", note: "Arbitrum" }] });
    expect(av(wallet, { kind: "token", symbol: "WETH/USDC@Base", base: "WETH" }).cash).toBe(100);
  });

  it("counts at Hyperliquid only the ledger the market is margined or paid from — an ordinary account's perps, each HIP-3 DEX's and spot are apart — and a unified account's for every market", () => {
    // an ordinary account: the perps account worth $1,000, $400 of it withdrawable; $500 of USDC and 10 HYPE on spot; $300 in a HIP-3 DEX's
    // own perps account, $120 of it withdrawable (live/hyperliquid-trade.ts balances, through the account's holdings)
    const lines = [
      { asset: "USDC", amount: 1000, usd: 1000, class: "stable", note: "perps · 400.00 withdrawable", freeUsd: 400 },
      { asset: "USDC", amount: 500, usd: 500, class: "stable", note: "spot" },
      { asset: "USDC", amount: 300, usd: 300, class: "stable", note: "perps · XYZ (HIP-3) · 120.00 withdrawable", freeUsd: 120 },
      { asset: "HYPE", amount: 10, usd: 400, class: "crypto", note: "spot" },
    ];
    const hl = venue("hl", "Hyperliquid", { connector: "live:hyperliquid-trade", cashUsd: 1800, holdings: lines });
    const btcPerp = { kind: "perp", symbol: "BTC/USDC:USDC", name: "BTC/USDC perpetual", base: "BTC" };
    const nvdaPerp = { kind: "perp", symbol: "XYZ-NVDA/USDC:USDC", name: "NVDA perpetual on XYZ (HIP-3, xyz:NVDA)", base: "NVDA" };
    const hypeSpot = { kind: "spot", symbol: "HYPE/USDC", name: "HYPE/USDC spot", base: "HYPE" };
    // a BTC perpetual is margined from the perps account alone: $400 withdrawable, not $900 with the spot dollars Hyperliquid would refuse
    expect(av(hl, btcPerp, { positions: [] }).cash).toBe(400);
    // a HIP-3 perpetual from its own DEX's account
    expect(av(hl, nvdaPerp, { positions: [] }).cash).toBe(120);
    // spot is paid from spot, and what a sell sells is held there
    const spot = av(hl, hypeSpot);
    expect([spot.cash, spot.qty]).toEqual([500, 10]);
    // its testnet's paper account keeps the same ledgers
    expect(av({ ...hl, connector: "live:hyperliquid-paper" }, btcPerp, { positions: [] }).cash).toBe(400);
    // a unified account: the spot balances are the whole account, a perpetual's margin and spot's dollars alike ($600 of $800 free)
    const uni = venue("hl", "Hyperliquid", { connector: "live:hyperliquid-trade", holdings: [{ asset: "USDC", amount: 800, usd: 800, class: "stable", note: "spot and perps · unified account", freeUsd: 600 }, { asset: "HYPE", amount: 10, usd: 400, class: "crypto", note: "spot and perps · unified account" }] });
    expect(av(uni, btcPerp, { positions: [] }).cash).toBe(600);
    expect(av(uni, nvdaPerp, { positions: [] }).cash).toBe(600);
    expect([av(uni, hypeSpot).cash, av(uni, hypeSpot).qty]).toEqual([600, 10]);
    // another venue's lines are counted as before, whatever their notes say
    expect(av({ ...hl, connector: "live:exchange:okx" }, btcPerp, { positions: [] }).cash).toBe(1020);
    // where Hyperliquid gave no withdrawable figure the note is the ledger's name alone, and the line (all of it free) is still that ledger
    const bare = venue("hl", "Hyperliquid", { connector: "live:hyperliquid-trade", holdings: [{ asset: "USDC", amount: 1000, usd: 1000, class: "stable", note: "perps" }, { asset: "USDC", amount: 500, usd: 500, class: "stable", note: "spot" }, { asset: "USDC", amount: 300, usd: 300, class: "stable", note: "perps · XYZ (HIP-3)" }] });
    expect(av(bare, btcPerp, { positions: [] }).cash).toBe(1000);
    expect(av(bare, nvdaPerp, { positions: [] }).cash).toBe(300);
    expect(av(bare, hypeSpot).cash).toBe(500);
  });

  it("counts no wallet line for a perpetual at MetaMask — Hyperliquid's, margined in the Hyperliquid account — says where its margin is, and gives nothing to slide; its token markets are still paid from their chain's dollars", () => {
    // a MetaMask wallet with $1,000 of USDC on Base and nothing read of its Hyperliquid account (adapters/metamask.ts: chain balances only)
    const mm = venue("mm", "MetaMask", { connector: "live:metamask", cashUsd: 1000, holdings: [{ asset: "USDC", amount: 1000, usd: 1000, class: "stable", note: "Base" }] });
    const perp = { kind: "perp", symbol: "BTC-PERP", name: "BTC perpetual on Hyperliquid", base: "BTC", quote: "USDC" };
    const a = av(mm, perp, { positions: [] });
    expect([a.cash, a.marginAt]).toEqual([null, "Hyperliquid"]);
    for (const side of ["buy", "sell"]) {
      const words = p.out<{ html: string; slider: boolean }>(`tkAvailWords(${JSON.stringify(a)}, ${JSON.stringify(perp)}, ${JSON.stringify(side)}, "MetaMask")`);
      expect(words.slider).toBe(false);
      expect(words.html).not.toContain("$1,000");
      expect(words.html).toContain('<span class="dim">Available to trade</span><span class="tab-nums">—</span>');
      expect(words.html).toContain("Margined in your Hyperliquid account, not this wallet&#39;s balances");
      // the position is the venue's positions read, as anywhere
      expect(words.html).toContain('<span class="dim">Current position</span><span class="tab-nums">0 BTC</span>');
    }
    expect(p.out(`tkPctFill(${JSON.stringify(a)}, 0.5)`)).toEqual({ unit: "usd", amount: "" });
    // the same wallet's token market on Base is paid from Base's dollars
    const token = av(mm, { kind: "token", symbol: "WETH/USDC@Base", base: "WETH" });
    expect([token.cash, token.marginAt]).toEqual([1000, undefined]);
    expect(p.out<{ html: string }>(`tkAvailWords(${JSON.stringify(token)}, { kind: "token", base: "WETH" }, "buy", "MetaMask")`).html).not.toContain("Margined in");
    // an event there is Polymarket's, paid in pUSD from the Predict deposit wallet (live/metamask.ts): no wallet line pays for it either
    const event = { kind: "event", symbol: "dem-house-2026:Yes", name: "Democrats win the House?", quote: "USD" };
    const e = av(mm, event, { positions: [] });
    expect([e.cash, e.marginAt]).toEqual([null, "Predict deposit"]);
    const ew = p.out<{ html: string; slider: boolean }>(`tkAvailWords(${JSON.stringify(e)}, ${JSON.stringify(event)}, "buy", "MetaMask")`);
    expect(ew.slider).toBe(false);
    expect(ew.html).not.toContain("$1,000");
    expect(ew.html).toContain("Paid in pUSD from your Predict deposit wallet, not this wallet&#39;s balances");
  });

  it("counts as held to sell only what can be sold there now: not what is lent out to earn, not a funding account's, not another chain's", () => {
    const ex = venue("ex", "Exchange", { holdings: [{ asset: "BTC", amount: 0.5, usd: 41000, class: "crypto", note: "spot" }, { asset: "BTC", amount: 1, usd: 82000, class: "earn", note: "Simple Earn" }, { asset: "BTC", amount: 0.2, usd: 16400, class: "crypto", note: "funding" }, { asset: "BTC", amount: 0.1, usd: 8200, class: "crypto", note: "spot", inTransit: true }] });
    expect(av(ex, { kind: "spot", symbol: "BTC/USDT", base: "BTC" }).qty).toBe(0.5);
    const wallet = venue("wallet", "Wallet", { holdings: [{ asset: "ETH", amount: 1, usd: 2500, class: "crypto", note: "Base" }, { asset: "ETH", amount: 2, usd: 5000, class: "crypto", note: "Arbitrum" }, { asset: "ETH", amount: 3, usd: 7500, class: "crypto", note: "Ethereum · no price" }] });
    expect(av(wallet, { kind: "token", symbol: "ETH/USDC@Base", base: "ETH" }).qty).toBe(1);
    expect(av(wallet, { kind: "token", symbol: "ETH/USDC@Ethereum", base: "ETH" }).qty).toBe(3);
    // a note that names no chain (a paper account's names its market) keeps its line: a paper token is sold where it is held
    const paper = venue("paper-1", "Paper", { paper: true, holdings: [{ asset: "OUSG", amount: 4, usd: 440, class: "rwa", note: "paper · OUSG/USDC@Ethereum from Ondo" }] });
    expect(av(paper, { kind: "token", symbol: "OUSG/USDC@Ethereum", base: "OUSG" }).qty).toBe(4);
  });

  it("sells only the units free now — a holding's part locked in an order resting at the venue is held, not available — and spends only the dollars free", () => {
    // 1 BTC held, 0.4 of it in a sell limit resting there; $300 of USDT all held for a buy limit resting there; $100 that says nothing: all free
    const ex = venue("ex", "Exchange", { holdings: [{ asset: "BTC", amount: 1, usd: 82000, class: "crypto", note: "spot", freeAmount: 0.6 }, { asset: "USDT", amount: 300, usd: 300, class: "stable", note: "spot", freeUsd: 0 }, { asset: "USDT", amount: 100, usd: 100, class: "stable", note: "spot" }, { asset: "ETH", amount: 2, usd: 5000, class: "crypto", note: "spot", freeAmount: 0.5 }] });
    const btc = { kind: "spot", symbol: "BTC/USDT", base: "BTC" };
    const a = av(ex, btc);
    expect([a.qty, a.held, a.cash]).toEqual([0.6, 1, 100]);
    const sell = p.out<{ html: string; slider: boolean }>(`tkAvailWords(${JSON.stringify(a)}, ${JSON.stringify(btc)}, "sell", "Exchange")`);
    expect(sell.html).toContain('<span class="dim">Available to trade</span><span class="tab-nums">0.6 BTC</span>');
    expect(sell.html).toContain('<span class="dim">Current position</span><span class="tab-nums">1 BTC</span>');
    expect(p.out(`tkPctFill(${JSON.stringify(a)}, 1, { sell: true, qtyStep: 0.00001 })`)).toEqual({ unit: "qty", amount: "0.6" });
    // a coin paid with is sold from its free units too
    expect(av(ex, btc, { pay: { asset: "ETH", chain: "spot" } }).coin).toEqual({ asset: "ETH", qty: 0.5 });
    // all of it locked: held, nothing to sell, nothing to slide
    const locked = av(venue("ex", "Exchange", { holdings: [{ asset: "BTC", amount: 1, usd: 82000, class: "crypto", freeAmount: 0 }] }), btc);
    expect([locked.qty, locked.held]).toEqual([0, 1]);
    expect(p.out<{ slider: boolean }>(`tkAvailWords(${JSON.stringify(locked)}, ${JSON.stringify(btc)}, "sell", "Exchange")`).slider).toBe(false);
  });

  it("gives no position where the venue's positions were not read — a dash and the venue's words, never a zero — and nothing to slide for a sell", () => {
    const ex = venue("ex", "Exchange", { holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }] });
    const unread = av(ex, { kind: "event", symbol: "FED:YES", base: "FED" }, { positions: null, unread: "Exchange did not answer in time" });
    expect([unread.qty, unread.unread]).toEqual([null, "Exchange did not answer in time"]);
    const words = p.out<{ html: string; slider: boolean }>(`tkAvailWords(${JSON.stringify(unread)}, { kind: "event", base: "FED" }, "sell", "Exchange")`);
    expect(words.slider).toBe(false);
    expect(words.html).toContain("<span class=\"tab-nums\">—</span>");
    expect(words.html).not.toContain("0 contracts");
    expect(words.html).toContain("Positions at Exchange could not be read: Exchange did not answer in time");
    // read, and nothing held: a zero is what the venue said
    const read = av(ex, { kind: "perp", symbol: "BTC/USDT:USDT", base: "BTC" }, { positions: [] });
    expect(p.out<{ html: string }>(`tkAvailWords(${JSON.stringify(read)}, { kind: "perp", base: "BTC" }, "buy", "Exchange")`).html).toContain("0 BTC");
    // a contract market counted in contracts where one is not one coin (OKX's BTC swap, 0.01 BTC a contract)
    const okx = av(ex, { kind: "perp", symbol: "BTC/USDT:USDT", base: "BTC", contractSize: 0.01 }, { positions: [{ venue: "ex", symbol: "BTC/USDT:USDT", qty: 5, side: "long" }] });
    expect(p.out<{ html: string }>(`tkAvailWords(${JSON.stringify(okx)}, { kind: "perp", base: "BTC", contractSize: 0.01 }, "buy", "OKX")`).html).toContain("Long 5 contracts");
  });

  it("sizes from what is there: dollars for a buy, the holding for a sell, and — paying with a coin held — that coin, in its own units", () => {
    const ex = venue("ex", "Exchange", { holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }, { asset: "ETH", amount: 2, usd: 5000, class: "crypto" }, { asset: "BTC", amount: 0.5, usd: 41000, class: "crypto" }] });
    const coin = av(ex, { kind: "spot", symbol: "BTC/USDT", base: "BTC" }, { pay: { asset: "ETH", chain: "" } });
    expect(coin.coin).toEqual({ asset: "ETH", qty: 2 });
    expect(p.out<{ html: string; slider: boolean }>(`tkAvailWords(${JSON.stringify(coin)}, { kind: "spot", base: "BTC" }, "buy", "Exchange")`)).toMatchObject({ slider: true, html: expect.stringContaining("2 ETH") });
    expect(p.out(`tkPctFill(${JSON.stringify(coin)}, 0.5, { coinStep: 0.0001 })`)).toEqual({ unit: "qty", amount: "1" });
    expect(p.out(`tkPctFill(${JSON.stringify(coin)}, 0.333, { coinStep: 0.0001 })`)).toEqual({ unit: "qty", amount: "0.666" });
    const plain = av(ex, { kind: "spot", symbol: "BTC/USDT", base: "BTC" });
    expect(p.out(`tkPctFill(${JSON.stringify(plain)}, 0.5)`)).toEqual({ unit: "usd", amount: "500" });
    expect(p.out(`tkPctFill(${JSON.stringify(plain)}, 0.5, { sell: true, qtyStep: 0.001 })`)).toEqual({ unit: "qty", amount: "0.25" });
    expect(p.out(`tkPctFill(${JSON.stringify(plain)}, 0)`)).toEqual({ unit: "usd", amount: "" });
  });
});

describe("the ticket in its panel, as the owner uses it", () => {
  const BTCP = { key: "perp:BTC", kind: "perp", name: "BTC perpetual", base: "BTC", price: 82000, tabs: [], at: [{ venue: "ex", venueName: "Exchange", symbol: "BTC/USDT:USDT", connected: true, canTrade: true, public: false, price: 82000 }, { venue: "hl", venueName: "Hyperliquid", symbol: "BTC-PERP", connected: true, canTrade: true, public: false, price: 82010 }] };
  const PERP_EX = { symbol: "BTC/USDT:USDT", name: "BTC perpetual", kind: "perp", base: "BTC", quote: "USDT", price: 82000, open: true, types: ["market", "limit"], reduceOnly: true, postOnly: true, tifs: ["gtc"], contractSize: 1 };
  const PERP_HL = { symbol: "BTC-PERP", name: "BTC perpetual", kind: "perp", base: "BTC", quote: "USDC", price: 82010, open: true, types: ["market", "limit"], contractSize: 1 };
  const open = async (t: ReturnType<typeof ticketPage>, kind: string, preset: Record<string, unknown>) => {
    t.set("ITEM", preset.item);
    t.run(`TK.kind = ${JSON.stringify(kind)}; tkTicket(PANEL, ${JSON.stringify(kind)}, { ...${JSON.stringify({ ...preset, item: undefined })}, item: ITEM })`);
    await settle();
  };
  const avail = (t: ReturnType<typeof ticketPage>) => String(t.part("[data-avail]").innerHTML);

  it("EXTENDED HOURS IS A SWITCH IN VIEW (feat/paper-live phase 3, P3): a share in pre-market opens with it ticked and the order a limit; Market picked, it is unticked and its words say the order waits; ticked on a market order the order is a limit again — the draft carrying the flag", async () => {
    const t = ticketPage();
    const PAPER = venue("paper-1", "Paper", { paper: true, trade: { can: true, what: "paper trading", kinds: ["stock"] } });
    t.set("A", pageOf([PAPER]));
    const pre = { open: false, opensAt: "2026-10-14T13:30:00.000Z", phase: "pre", phaseEndsAt: "2026-10-14T13:30:00.000Z", extendedHours: true };
    const AAPL = { symbol: "AAPL", name: "Apple Inc", kind: "stock", base: "AAPL", quote: "USD", price: 342.5, bid: 342.4, ask: 342.6, open: true, types: ["market", "limit", "stop"], tifs: ["day", "gtc"], session: pre, quoteFrom: "Robinhood · real time" };
    t.run(`ANSWERS["/api/account/market?venue=paper-1"] = { ok: true, market: ${JSON.stringify(AAPL)} };`);
    const item = { key: "stock:AAPL", kind: "stock", name: "Apple Inc", base: "AAPL", price: 342.5, tabs: [], at: [{ venue: "paper-1", venueName: "Paper", symbol: "AAPL", connected: true, canTrade: true, public: false, paper: true, price: 342.5 }] };
    await open(t, "stocks", { item, venue: "paper-1", symbol: "AAPL", side: "buy" });
    expect(t.part("[data-eh]").hidden).toBe(false);
    expect(t.field("extendedHours").checked).toBe(true);
    expect(t.field("orderType").value).toBe("limit");
    expect(t.part("[data-eh-s]").textContent).toBe("Pre-market is on until 09:30 New York: this limit order trades now.");
    // Market picked: unticked, and its words say a market order waits for the regular session
    t.field("orderType").value = "market";
    t.field("orderType").dispatchEvent({ type: "change" });
    await settle();
    expect(t.field("extendedHours").checked).toBe(false);
    expect(t.part("[data-eh]").hidden).toBe(false);
    expect(t.part("[data-eh-s]").textContent).toBe("Pre-market is on until 09:30 New York: a market order waits for the regular session. Tick Extended hours to trade now, as a limit.");
    expect(t.out("tkOrderDraft(formFields(FORM), { venue: 'paper-1', symbol: 'AAPL', side: 'buy', event: false })")).toMatchObject({ orderType: "market", extendedHours: "" });
    // ticked: the order is a limit again, and the draft carries the flag
    t.field("extendedHours").checked = true;
    t.field("extendedHours").dispatchEvent({ type: "change" });
    await settle();
    expect(t.field("orderType").value).toBe("limit");
    expect(t.out("tkOrderDraft(formFields(FORM), { venue: 'paper-1', symbol: 'AAPL', side: 'buy', event: false })")).toMatchObject({ orderType: "limit", extendedHours: "true" });
    // in the regular session there is no switch at all
    t.run(`ANSWERS["/api/account/market?venue=paper-1"] = { ok: true, market: ${JSON.stringify({ ...AAPL, session: { open: true, phase: "regular", extendedHours: false } })} };`);
    const t2 = ticketPage();
    t2.set("A", pageOf([PAPER]));
    t2.run(`ANSWERS["/api/account/market?venue=paper-1"] = { ok: true, market: ${JSON.stringify({ ...AAPL, session: { open: true, phase: "regular", extendedHours: false } })} };`);
    await open(t2, "stocks", { item, venue: "paper-1", symbol: "AAPL", side: "buy" });
    expect([t2.part("[data-eh]").hidden, t2.field("extendedHours").checked, t2.field("orderType").value, t2.part("[data-eh-s]").hidden]).toEqual([true, false, "market", true]);
  });

  it("a ticket opened WITH A TYPE (a draft restored, an entry that names Market) in pre-market keeps it: Extended hours is not ticked beside a market order and its words agree with the box — and a Real/Paper flip keeps the market order, never turning it into a limit unsaid; a limit picked then is ticked", async () => {
    const t = ticketPage();
    const PAPER = venue("paper-1", "Paper", { paper: true, trade: { can: true, what: "paper trading", kinds: ["stock"] } });
    const BROKER = venue("broker", "Broker", { trade: { can: true, what: "US stocks", kinds: ["stock"] } });
    t.set("A", pageOf([BROKER, PAPER]));
    const pre = { open: false, opensAt: "2026-10-14T13:30:00.000Z", phase: "pre", phaseEndsAt: "2026-10-14T13:30:00.000Z", extendedHours: true };
    const AAPL = { symbol: "AAPL", name: "Apple Inc", kind: "stock", base: "AAPL", quote: "USD", price: 342.5, bid: 342.4, ask: 342.6, open: true, types: ["market", "limit", "stop"], tifs: ["day", "gtc"], session: pre, quoteFrom: "Robinhood · real time" };
    t.run(`ANSWERS["/api/account/market?venue=paper-1"] = { ok: true, market: ${JSON.stringify(AAPL)} }; ANSWERS["/api/account/market?venue=broker"] = { ok: true, market: ${JSON.stringify(AAPL)} }; ANSWERS["/api/account/compare"] = { ok: false };`);
    const at = (v: string, more: Record<string, unknown> = {}) => ({ venue: v, venueName: v === "broker" ? "Broker" : "Paper", symbol: "AAPL", connected: true, canTrade: true, public: false, price: 342.5, ...more });
    const item = { key: "stock:AAPL", kind: "stock", name: "Apple Inc", base: "AAPL", price: 342.5, tabs: [], at: [at("broker"), at("paper-1", { paper: true })] };
    await open(t, "stocks", { item, venue: "paper-1", symbol: "AAPL", side: "buy", orderType: "market" });
    const says = "Pre-market is on until 09:30 New York: a market order waits for the regular session. Tick Extended hours to trade now, as a limit.";
    const state = () => [t.field("orderType").value, t.field("extendedHours").checked, t.part("[data-eh-s]").textContent];
    expect(state()).toEqual(["market", false, says]);
    // Real money, then Paper again: each a market chosen anew (fit), the market order kept and the box unticked, the words as they were
    const money = (k: string) => t.part("[data-where]").querySelectorAll("button[data-money]").find((b: Stub) => b.dataset.money === k).click();
    money("real");
    await settle();
    expect(state()).toEqual(["market", false, says]);
    money("paper");
    await settle();
    expect(state()).toEqual(["market", false, says]);
    expect(t.out("tkOrderDraft(formFields(FORM), { venue: 'paper-1', symbol: 'AAPL', side: 'buy', event: false })")).toMatchObject({ orderType: "market", extendedHours: "" });
    // the owner picks Limit: a limit in pre-market goes with extended hours until the box is touched
    t.field("orderType").value = "limit";
    t.field("orderType").dispatchEvent({ type: "change" });
    await settle();
    expect(state()).toEqual(["limit", true, "Pre-market is on until 09:30 New York: this limit order trades now."]);
  });

  it("unticks Reduce only (and Post-only) when the order moves to a venue whose market takes none, so neither is sent from a hidden box", async () => {
    const t = ticketPage();
    t.set("A", pageOf([EX, HL]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(PERP_EX)} }; ANSWERS["/api/account/market?venue=hl"] = { ok: true, market: ${JSON.stringify(PERP_HL)} }; ANSWERS["/api/account/positions"] = { ok: true, positions: [], missing: [] };`);
    await open(t, "perps", { item: BTCP, venue: "ex", symbol: "BTC/USDT:USDT", side: "buy" });
    expect(t.part("[data-reduce]").hidden).toBe(false);
    t.field("reduceOnly").checked = true;
    t.field("postOnly").checked = true;
    t.field("orderType").value = "limit";
    expect(t.out("tkOrderDraft(formFields(FORM), { venue: 'ex', symbol: 'BTC/USDT:USDT', side: 'buy', event: false })")).toMatchObject({ reduceOnly: "true", postOnly: "true" });
    // Hyperliquid's line in Where: its market takes neither
    const i = t.out<number>("tkWhereRows(ITEM, null, 'perps').findIndex((r) => r.venue === 'hl')");
    t.part("[data-where]").querySelectorAll("button[data-at]").find((b: Stub) => b.dataset.at === String(i)).click();
    await settle();
    expect(t.part("[data-reduce]").hidden).toBe(true);
    expect([t.field("reduceOnly").checked, t.field("postOnly").checked]).toEqual([false, false]);
    expect(t.out("tkOrderDraft(formFields(FORM), { venue: 'hl', symbol: 'BTC-PERP', side: 'buy', event: false })")).toMatchObject({ orderType: "limit", reduceOnly: "", postOnly: "" });
  });

  it("draws what is available and the position held again when the account is read again (a fill), not only when the market is picked", async () => {
    const t = ticketPage();
    const ex = (usd: number) => ({ ...EX, cashUsd: usd, holdings: [{ asset: "USDT", amount: usd, usd, class: "stable" }] });
    t.set("A", pageOf([ex(1000), HL]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(PERP_EX)} }; ANSWERS["/api/account/positions"] = { ok: true, positions: [], missing: [] };`);
    await open(t, "perps", { item: BTCP, venue: "ex", symbol: "BTC/USDT:USDT", side: "buy" });
    expect(avail(t)).toContain("$1,000.00");
    expect(avail(t)).toContain("0 BTC");
    // the order filled: the account's next read has less cash, the venue's positions the new one
    t.set("A", pageOf([ex(900), HL]));
    t.run('ANSWERS["/api/account/positions"] = { ok: true, positions: [{ venue: "ex", symbol: "BTC/USDT:USDT", kind: "perp", qty: 0.5, side: "long" }], missing: [] }; TK.refreshAvail()');
    await settle();
    expect(avail(t)).toContain("$900.00");
    expect(avail(t)).toContain("Long 0.5 BTC");
    // every read of the account reaches it: the pane asks the ticket on each render
    const q = page();
    q.set("A", pageOf([EX]));
    q.run("tkDrawPane = () => {}; ttDraw = () => {}; var N = 0; TK.refreshAvail = () => N++; renderTrade({ el: { querySelector: () => ({}) }, owner: true, lens: lensNow(), params: {} })");
    expect(q.out("N")).toBe(1);
    // a placed order drops the positions and the statement kept (core afterAction), so the reads after it are the venue's new ones
    const submit = source("ui/trade.js").slice(source("ui/trade.js").indexOf('form.addEventListener("submit"'));
    expect(submit.slice(0, submit.indexOf("await load()"))).toContain("afterAction()");
    q.run('API.set("/api/account/positions", { at: Date.now(), body: {} }); API.set("/api/account/statement", { at: Date.now(), body: {} }); afterAction()');
    expect(q.out('[API.has("/api/account/positions"), API.has("/api/account/statement")]')).toEqual([false, false]);
  });

  it("shows no position where the venue's positions could not be read — its words instead — and says nothing of what is held there", async () => {
    const t = ticketPage();
    t.set("A", pageOf([{ ...EX, cashUsd: 1000, holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }] }, HL]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(PERP_EX)} }; ANSWERS["/api/account/positions"] = { ok: true, positions: [], missing: [{ venue: "ex", venueName: "Exchange", why: "Exchange did not answer in time", code: "E_VENUE_UNREACHABLE", part: "positions" }] };`);
    await open(t, "perps", { item: BTCP, venue: "ex", symbol: "BTC/USDT:USDT", side: "buy" });
    expect(avail(t)).not.toContain("0 BTC");
    expect(avail(t)).toContain("Positions at Exchange could not be read: Exchange did not answer in time");
    expect(String(t.part("[data-kb]").innerHTML)).not.toContain("Nothing held here yet");
  });

  it("sizes a buy paid with a coin held in that coin: the slider writes how much of it is sold, never dollars into the coin's amount", async () => {
    const t = ticketPage();
    t.set("A", pageOf([{ ...EX, cashUsd: 1000, holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }, { asset: "ETH", amount: 2, usd: 5000, class: "crypto" }] }]));
    const markets = [{ symbol: "BTC/USDT", kind: "spot", base: "BTC", quote: "USDT", open: true, qtyStep: 0.00001 }, { symbol: "ETH/USDT", kind: "spot", base: "ETH", quote: "USDT", open: true, qtyStep: 0.0001 }];
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: { symbol: "BTC/USDT", name: "BTC", kind: "spot", base: "BTC", quote: "USDT", price: 82000, open: true, types: ["market"], qtyStep: 0.00001 } }; ANSWERS["/api/account/markets"] = { ok: true, markets: ${JSON.stringify(markets)} };`);
    await open(t, "crypto", { item: ROW("coin", "BTC"), venue: "ex", symbol: "BTC/USDT", side: "buy" });
    expect(avail(t)).toContain("$1,000.00");
    t.field("pay").value = "ETH|";
    t.field("pay").dispatchEvent({ type: "change" });
    await settle();
    expect(t.field("unit").options.map((o: Stub) => o.value)).toEqual(["qty"]);
    expect(avail(t)).toContain("2 ETH");
    t.field("pct").value = "50";
    t.field("pct").dispatchEvent({ type: "input" });
    expect([t.field("unit").value, t.field("amount").value]).toEqual(["qty", "1"]);
  });

  it("looks the market up again once an account that trades it is there (after Connect to trade) by the words a search may hold and its key — an event's long question cut to them — and picks that account", async () => {
    const t = ticketPage();
    t.set("A", pageOf([PRED]));
    // 63 characters: longer than the account takes a search to be
    const title = "Will the Democrats win the House in the 2026 midterm elections?";
    expect(title.length).toBe(63);
    const before = { key: "event:dem-house-2026", kind: "event", name: title, category: "Politics", price: 0.62, tabs: [], at: [{ venue: "polymarket", venueName: "Polymarket", symbol: "DEM-HOUSE-2026:YES", public: true, connected: false, price: 0.62, connector: "live:polymarket" }] };
    // read again: an account of yours lists it now
    const again = { ...before, at: [{ venue: "predict", venueName: "Predictions", symbol: "DEM-HOUSE-2026:YES", connected: true, canTrade: true, public: false, price: 0.62 }] };
    t.run(`var AGAIN = ${JSON.stringify(again)};
      api = async (path) => { ASKED.push(path); if (!path.startsWith("/api/account/explore?")) return { ok: false, refusal: { message: "not answered in this test" } }; const words = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("q") || ""; return words.length > 60 ? { ok: false, refusal: { message: "a search is at most 60 characters" } } : { ok: true, items: [AGAIN] }; };`);
    await open(t, "predictions", { item: before, side: "buy" });
    // only a public venue lists it: nowhere to place it yet
    expect(t.part("[data-body]").hidden).toBe(true);
    t.run("ASKED.length = 0; TK.refindIdle()");
    await settle();
    const asked = new URLSearchParams(t.out<string[]>("ASKED").find((x) => x.startsWith("/api/account/explore?"))!.split("?")[1]);
    expect((asked.get("q") ?? "").length).toBeLessThanOrEqual(60);
    expect(asked.get("q")).toBe("Will the Democrats win the House in the 2026 midterm");
    expect(asked.get("key")).toBe("event:dem-house-2026");
    // found again: the account that trades it now is offered — real money, so the owner picks it (feat/paper-live p0: B7) — and once picked
    // its market is read there
    expect(t.part("[data-body]").hidden).toBe(true);
    expect(String(t.part("[data-where]").innerHTML)).toContain('<span class="tk-money pick">Pick where it trades — real money</span>');
    t.part("[data-where]").querySelectorAll("button[data-at]")[0].click();
    await settle();
    expect(t.part("[data-body]").hidden).toBe(false);
    expect(t.out<string[]>("ASKED")).toContain("/api/account/market?venue=predict&symbol=DEM-HOUSE-2026%3AYES");
    // connected from the ticket's own "Connect to trade": the owner named that account, and it is picked at once
    const t2 = ticketPage();
    t2.set("A", pageOf([PRED]));
    t2.run(`var AGAIN = ${JSON.stringify(again)}; tkConnectTo = () => {};
      api = async (path) => { ASKED.push(path); return path.startsWith("/api/account/explore?") ? { ok: true, items: [AGAIN] } : { ok: false, refusal: { message: "not answered in this test" } }; };`);
    await open(t2, "predictions", { item: before, side: "buy" });
    t2.part("[data-where]").querySelectorAll("button[data-connect]")[0].click();
    t2.run('ASKED.length = 0; TK.connecting.redo("predict")');
    await settle();
    expect(t2.part("[data-body]").hidden).toBe(false);
    expect(t2.out<string[]>("ASKED")).toContain("/api/account/market?venue=predict&symbol=DEM-HOUSE-2026%3AYES");
  });

  it("opened with no market (the 't' key, a venue's Trade) shows its search, and the bar, chart and book let go of the last market", () => {
    const t = ticketPage();
    t.set("A", pageOf([EX]));
    t.run('var SET = []; ttSetItem = (x) => SET.push(x); TK.kind = "crypto"; tkTicket(PANEL, "crypto", {}); tkTicket(PANEL, "crypto", { venue: "ex" })');
    expect(t.out("SET")).toEqual([null, null]);
    expect(t.part("[data-find]").hidden).toBe(false);
    // the terminal sets aside the ticket's own head and its picked row (the bar names the market) — never its search, nor the composer's close
    const css = source("ui/terminal.css");
    expect(css).not.toMatch(/\.tt-order \.tk-find[^{]*\{[^}]*display: none/);
    expect(css).toContain(".tt-order .tk-h:has([data-tk-close])");
  });

  it("starts on the busiest market by itself only while none has shown on the frame and the owner opened nothing: a ticket opened on no market afterwards stays as it was opened", () => {
    const t = ticketPage();
    t.set("A", pageOf([EX]));
    t.run(`var OPENED = []; tkOpen = (x) => OPENED.push(x); chRelease = () => {}; bkRelease = () => {};
      var PANE = { querySelector: (s) => (s === "[data-tp]" ? null : { innerHTML: "" }), querySelectorAll: () => [] };
      TK.kind = "crypto"; TK.pending = null;
      var FRAME = () => { TT.started = false; TT.item = null; TT.at = null; OPENED.length = 0; TK.got = { crypto: { at: Date.now(), items: [${JSON.stringify(ROW("coin", "BTC"))}] } }; };`);
    // a new frame, the panel at rest on no market: the pane starts on the busiest of the kind, at rest
    t.run('FRAME(); tkTicket(PANEL, "crypto", { kind: "crypto", rest: true }); ttDraw(PANE, true)');
    expect(t.out("OPENED.map((x) => [x.item.key, x.rest])")).toEqual([["coin:BTC", true]]);
    // the frame's first market came from a Markets row; then the owner pressed "t": the ticket on no market is not replaced
    t.run(`FRAME(); ttSetItem(${JSON.stringify(ROW("coin", "ETH"))}, "crypto"); tkTicket(PANEL, "crypto", {}); ttDraw(PANE, true)`);
    expect(t.out("[OPENED, TT.item]")).toEqual([[], null]);
    // a market has shown, then the ticket is closed back to rest: nothing is picked by itself either
    t.run(`FRAME(); ttSetItem(${JSON.stringify(ROW("coin", "ETH"))}, "crypto"); tkTicket(PANEL, "crypto", { kind: "crypto", rest: true }); ttDraw(PANE, true)`);
    expect(t.out("OPENED")).toEqual([]);
    // nothing shown yet, the owner pressed "t" (or a venue's Trade) first: their ticket stays
    t.run('FRAME(); tkTicket(PANEL, "crypto", {}); ttDraw(PANE, true)');
    expect(t.out("OPENED")).toEqual([]);
    t.run('FRAME(); tkTicket(PANEL, "crypto", { venue: "ex" }); ttDraw(PANE, true)');
    expect(t.out("OPENED")).toEqual([]);
  });

  it("leaves a ticket the owner opened on a market still being looked up as it was opened: a kind's read landing meanwhile starts nothing over it", () => {
    const t = ticketPage();
    t.set("A", pageOf([EX]));
    t.run(`var OPENED = []; tkOpen = (x) => OPENED.push(x); chRelease = () => {}; bkRelease = () => {};
      var PANE = { querySelector: (s) => (s === "[data-tp]" ? null : { innerHTML: "" }), querySelectorAll: () => [] };
      TK.kind = "crypto"; TK.pending = null;
      // the venue's market is still being read: its answer does not come in this test
      var ANSWERED = api; api = (path) => (path.startsWith("/api/account/market?") ? new Promise(() => {}) : ANSWERED(path));
      var FRAME = () => { TT.started = false; TT.item = null; TT.at = null; OPENED.length = 0; TK.got = {}; };
      var LANDS = () => { TK.got = { crypto: { at: Date.now(), items: [${JSON.stringify(ROW("coin", "BTC"))}] } }; };`);
    // a new frame at rest, then Markets' Buy (a venue and its symbol, no row), looked up; the kind's read lands and the pane is drawn
    t.run('FRAME(); tkTicket(PANEL, "crypto", { kind: "crypto", rest: true }); tkTicket(PANEL, "crypto", { kind: "crypto", venue: "ex", symbol: "ETH/USDT", side: "buy" }); LANDS(); ttDraw(PANE, true)');
    expect(t.out("OPENED")).toEqual([]);
    // a ticket kept in this browser, opened again at rest on its market: the same
    t.run('FRAME(); tkTicket(PANEL, "crypto", { kind: "crypto", rest: true }); tkTicket(PANEL, "crypto", { kind: "crypto", venue: "ex", symbol: "ETH/USDT", side: "buy", amount: "25", rest: true }); LANDS(); ttDraw(PANE, true)');
    expect(t.out("OPENED")).toEqual([]);
    // the panel at rest on no market, on a new frame: the pane still starts on the busiest of the kind
    t.run('FRAME(); tkTicket(PANEL, "crypto", { kind: "crypto", rest: true }); LANDS(); ttDraw(PANE, true)');
    expect(t.out("OPENED.map((x) => [x.item.key, x.rest])")).toEqual([["coin:BTC", true]]);
  });
});

describe("the trading area in Hyperliquid's grammar: what the terminal and the ticket say", () => {
  /* a statement line as /api/account/statement gives one, cut to what the history tabs read */
  const line = (id: string, more: Record<string, unknown> = {}) => ({ key: `order:${id}`, id, type: "trade", kind: "buy", account: "ex", accountName: "Exchange", description: `Buy 1 ${id}`, amountUsd: 0, status: "open", by: "You", at: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z", ...more });

  it("draws no Manual · Superagent switch of its own: the topbar's Regular · Superagent is the one way between the two", () => {
    const src = source("ui/terminal.js");
    expect(src).not.toContain("ttWhoTrades");
    expect(src).not.toContain("sg-switch");
    expect(src).not.toMatch(/hashOf\("superagent"/);
    const q = page();
    expect(q.run<string>("ttFrame()")).not.toContain("Superagent");
  });

  it("frames the panels as HL does: the bar inside the grid over the chart, the picker a popover beside its button, three tabs for a narrow terminal, a status strip at the foot", () => {
    const q = page();
    const f = q.run<string>("ttFrame()");
    // the grid's first part is the bar; the popover comes next (the keys reach it right after its button), not in the flow above the grid
    expect(f.indexOf('class="tt-grid"')).toBeLessThan(f.indexOf('class="tt-bar"'));
    expect(f.indexOf('class="tt-bar"')).toBeLessThan(f.indexOf('data-tt-pop'));
    expect(f.indexOf("data-tt-pop")).toBeLessThan(f.indexOf("data-tt-chart"));
    expect(f).not.toMatch(/class="tt-pop panel"/);
    expect(f).toMatch(/data-tt-mtabs>(<button[^>]*role="tab"[^>]*>(Chart|Order book|Trades)<\/button>){3}/);
    // the line of state and the said line live in the strip at the foot, not in the bar
    const bar = f.slice(f.indexOf('class="tt-bar"'), f.indexOf("data-tt-pop"));
    expect(bar).not.toContain("data-tp-state");
    expect(f.slice(f.indexOf('class="tt-foot"'))).toMatch(/data-tp-state[\s\S]*data-tt-said/);
    expect(f).toContain('data-tt-tab="orders"');
  });

  it("colours a perpetual's funding as HL does — positive in the accent, negative down — and marks the label that explains itself", () => {
    const q = page();
    q.set("A", pageOf([HL]));
    q.run('var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : null) }; TK.got = {};');
    q.run('TT.item = { kind: "perp", base: "BTC", name: "BTC perpetual" }; TT.at = { venue: "hl", symbol: "BTC-PERP" }; TT.mk = { kind: "perp", base: "BTC", quote: "USDC", price: 81900, fundingRate: 0.0000125 }; ttStats(EL)');
    const up = q.out<string>("BOX.innerHTML");
    expect(up).toContain('<span class="acc">0.0013%</span>');
    expect(up).toMatch(/<span class="tt-st-n" title="[^"]+">Funding<\/span>/);
    expect(up).not.toMatch(/<span class="tt-st-n" title[^>]*>Price</);
    q.run('TT.mk = { ...TT.mk, fundingRate: -0.0001 }; ttStats(EL)');
    expect(q.out<string>("BOX.innerHTML")).toContain('<span class="down">-0.0100%</span>');
    // a paper account's name in the bar without the word its tag says
    q.set("A", pageOf([{ ...HL, id: "paper-momentum", name: "Momentum · paper", paper: true }]));
    q.run('TT.at = { venue: "paper-momentum", symbol: "BTC-PERP" }; ttStats(EL)');
    expect(q.out<string>("TAGS.innerHTML")).toContain('<span class="tt-where">Momentum <span class="tag paper">Paper</span></span>');
  });

  it("Trade history lists what filled only, in HL's columns, by the market's name — never an open, waiting or canceled order, a raw symbol, or a buy's cost painted as a loss", async () => {
    const q = page();
    q.set("A", { ...pageOf([EX]), orders: [{ id: "ord-0006", clientId: "c6", venue: "predict", venueName: "Predictions", name: "Will the Fed cut rates? · Yes", base: "SI-FEDCUT-DEC:YES", kind: "event", side: "buy", type: "market", qty: 50, filledQty: 50, avgPrice: 0.63, status: "filled", at: "2026-10-06T12:00:00.000Z" }] });
    const lines = [
      line("c6", { id: "ord-0006", account: "predict", accountName: "Predictions", description: "Buy 50 SI-FEDCUT-DEC:YES · Will the Fed cut rates? · Yes · market · at 0.63", amountUsd: -31.5, worthUsd: 31.5, feeUsd: 0.2205, status: "filled" }),
      line("c5", { id: "ord-0005", description: "Buy 0.05 ETH · ETH perpetual · market · at 2456.74", amountUsd: -122.84, worthUsd: 122.84, feeUsd: 0.0737, status: "filled" }),
      line("c3", { id: "ord-0003", kind: "sell", description: "Sell 0.002 BTC · BTC / USDT · limit 63226.6", worthUsd: 126.45 }),
      line("c8", { id: "ord-0008", description: "Buy 0.001 BTC · BTC / USDT · limit 59352.9", worthUsd: 59.35, status: "canceled" }),
      line("c9", { id: "ord-0009", account: "broker", accountName: "Broker", description: "Buy 0.25 SPY · SPDR S&P 500 ETF Trust · limit 660.07", worthUsd: 165.02, status: "pending" }),
    ];
    q.run(`var HBOX = { innerHTML: "", isConnected: true }; api = async () => ({ ok: true, lines: ${JSON.stringify(lines)} })`);
    q.run('TT.tab = "history"; ttHistory(HBOX)');
    await settle();
    const fills = q.out<string>("HBOX.innerHTML");
    // HL's Closed PNL beside the fee (a close's, where its venue says it)
    expect(fills).toMatch(/<th title="On your clock: [^"]+">Time<\/th><th>Market<\/th><th>Direction<\/th><th class="r">Price<\/th><th class="r">Size<\/th><th class="r">Trade value<\/th><th class="r">Fee<\/th><th class="r">Closed PNL<\/th><th>By<\/th>/);
    expect(fills).toContain("<b>Will the Fed cut rates? · Yes</b>");
    expect(fills).toContain("<b>ETH perpetual</b>");
    expect(fills).not.toContain("SI-FEDCUT-DEC:YES</b>");
    // the account's own order where the page has it: an event's price in cents; from the line's words otherwise
    expect(fills).toContain(">63¢<");
    expect(fills).toContain(">2,456.74<");
    expect(fills).toContain(">$122.84<");
    expect(fills).not.toContain("BTC / USDT");
    expect(fills).not.toContain("SPDR");
    expect(fills).not.toMatch(/class="[^"]*down[^"]*">[^<]*\$122/);
    // every order, with what became of it in words
    q.run('TT.tab = "orders"; HBOX.innerHTML = ""; ttOrders(HBOX)');
    await settle();
    const all = q.out<string>("HBOX.innerHTML");
    for (const w of ["Filled", "Open", "Canceled", "Waiting at Broker", "SPDR S&amp;P 500 ETF Trust", "BTC / USDT", ">Limit<", ">63,226.6<", ">Market<"]) expect(all, w).toContain(w);
    expect(q.out("ttOrderRec({ key: 'order:x', kind: 'sell', description: 'Sell 0.5 SOL · SOL / USDT · stop at 137.83, limit 136 · 0.2 of 0.5 filled' })")).toMatchObject({ name: "SOL / USDT", side: "sell", type: "stop_limit", qty: 0.5, filled: 0.2, stop: 137.83, limit: 136 });
  });

  it("Funding history lists what the perpetuals paid and received, hour by hour, newest first, in HL's columns — the payment the owner's way (paid below zero, received above), the price it was settled at, a rate the quote carried marked so — in the lens, with the venues that could not be read said under it", async () => {
    const q = page();
    q.set("A", pageOf([EX, { ...HL, id: "paper-1", name: "Paper account", paper: true }]));
    const lines = [
      { at: "2026-10-20T17:00:00.000Z", symbol: "BTC-PERP", side: "long", qty: 0.1, price: 82414.9, rate: 0.0000125, usd: 0.103019, venue: "paper-1", venueName: "Paper account", paper: true },
      { at: "2026-10-20T16:00:00.000Z", symbol: "ETH-PERP", side: "short", qty: 2, price: 2698, rate: 0.00002, usd: -0.10792, quoted: true, venue: "paper-1", venueName: "Paper account", paper: true },
      { at: "2026-10-20T15:00:00.000Z", symbol: "BTC/USDC:USDC", side: "long", qty: 0.5, rate: 0.0000125, usd: 0.51, venue: "ex", venueName: "Exchange" },
    ];
    q.run(`var HBOX = { innerHTML: "", isConnected: true }; var ASKED = []; api = async (path) => (ASKED.push(path), { ok: true, lines: ${JSON.stringify(lines)}, missing: [{ venue: "hl", venueName: "Hyperliquid", why: "Hyperliquid did not answer." }] })`);
    q.run('TT.tab = "funding"; ttFunding(HBOX)');
    await settle();
    const html = q.out<string>("HBOX.innerHTML");
    expect(q.out("ASKED")).toEqual(["/api/account/funding"]);
    expect(html).toMatch(/<th title="On your clock: [^"]+">Time<\/th><th>Market<\/th><th>Direction<\/th><th class="r">Size<\/th><th class="r" title="[^"]+">Price<\/th><th class="r" title="[^"]+">Payment<\/th><th class="r" title="[^"]+">Rate<\/th>/);
    const rows = html.split("<tr>").slice(2);
    // a long paid: below zero, the oracle it was settled at, the hour's rate
    expect(rows[0]).toContain("<b>BTC-PERP</b> <span class=\"tag paper\">Paper</span>");
    expect(rows[0]).toContain('<td class="up">Long</td><td class="r">0.1</td><td class="r">82,414.9</td>');
    expect(rows[0]).toContain('<td class="r"><span class="down"><span aria-hidden="true">▼</span><span class="sr">down</span> $0.10</span></td><td class="r">0.0013%</td>');
    // a short received: above zero; its rate the quote's, marked so on hover
    expect(rows[1]).toContain('<td class="down">Short</td>');
    expect(rows[1]).toContain('<span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> $0.11</span>');
    expect(rows[1]).toContain(`<td class="r tt-quoted" title="The rate the quote carried: the venue's own history had not said this hour's when it was settled">0.0020%</td>`);
    // a venue that says no price: none made up
    expect(rows[2]).toContain('<td class="r">0.5</td><td class="r">—</td>');
    expect(html).toContain('<p class="dim small tt-missed">Not read: Hyperliquid: Hyperliquid did not answer.</p>');
    // the paper lens: the paper account's alone
    q.run('view.lens = "paper"; HBOX.innerHTML = ""; ttFunding(HBOX)');
    await settle();
    expect(q.out<string>("HBOX.innerHTML")).not.toContain("BTC/USDC:USDC");
    // nothing paid yet: said so
    q.run('view.lens = ""; api = async () => ({ ok: true, lines: [], missing: [] }); HBOX.innerHTML = ""; ttFunding(HBOX)');
    await settle();
    expect(q.out<string>("HBOX.innerHTML")).toBe('<p class="empty">No funding paid or received yet: an open perpetual pays or receives it every hour.</p>');
  });

  it("Open orders: HL's columns, the market by its name, the account's id on hover, Cancel all heading the buttons", () => {
    const q = page();
    q.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    const o = (id: string, more: Record<string, unknown> = {}) => ({ id, clientId: id, venue: "ex", venueName: "Exchange", name: "SOL / USDT", base: "SOL", symbol: "SOL/USDT", kind: "spot", side: "buy", type: "limit", qty: 0.707, filledQty: 0, limitPrice: 141.44, usd: 100, status: "open", at: "2026-10-06T12:00:00.000Z", ...more });
    q.set("A", { ...pageOf([EX]), cards: [], payments: [], orders: [o("ord-0010"), o("ord-0004", { side: "sell", type: "stop", qty: 0.6, limitPrice: undefined, stopPrice: 137.83, usd: 82.7 })] });
    q.run('var SEC = { innerHTML: "", isConnected: true, addEventListener() {}, contains: () => false }; tkDrawOpen(SEC, true)');
    const html = q.out<string>("SEC.innerHTML");
    expect(html).toMatch(/<th title="On your clock: [^"]+">Time<\/th><th>Type<\/th><th>Market<\/th><th>Direction<\/th><th class="r">Size<\/th><th class="r">Original size<\/th><th class="r">Order value<\/th><th class="r">Price<\/th><th>Reduce only<\/th><th>Trigger<\/th>/);
    // the market's whole name on hover (the cell keeps it to a line), then where and which order
    expect(html).toContain('title="SOL / USDT · Exchange · ord-0010"');
    expect(html).toContain("Falls to 137.83");
    expect(html).toContain(">141.44<");
    expect(html).toMatch(/<th class="r"><button type="button" class="link" data-cancel-all[^>]*>Cancel all 2<\/button><\/th>/);
    q.set("A", { ...pageOf([EX]), cards: [], payments: [], orders: [] });
    q.run("tkDrawOpen(SEC, true)");
    expect(q.out<string>("SEC.innerHTML")).toContain('<p class="empty">No open orders yet.</p>');
  });

  it("Cancel all says how many of the orders it takes off are real money and how many paper, before any is canceled", async () => {
    const q = page();
    q.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    const o = (id: string, more: Record<string, unknown> = {}) => ({ id, clientId: id, venue: "ex", venueName: "Exchange", name: "SOL / USDT", base: "SOL", symbol: "SOL/USDT", kind: "spot", side: "buy", type: "limit", qty: 0.707, filledQty: 0, limitPrice: 141.44, usd: 100, status: "open", at: "2026-10-06T12:00:00.000Z", ...more });
    q.set("A", { ...pageOf([EX]), cards: [], payments: [], orders: [o("ord-1"), o("ord-2"), o("ord-3", { venue: "paper-1", venueName: "Paper account", paper: true })] });
    q.run('var HEARD = null; var SAID = []; confirmSheet = async (t) => (SAID.push(t), false); var SEC = { innerHTML: "", isConnected: true, addEventListener(t, f) { if (t === "click") HEARD = f; }, contains: () => true }; tkDrawOpen(SEC, true)');
    await q.run<Promise<unknown>>('HEARD({ target: { closest: () => ({ dataset: {}, disabled: false, hasAttribute: (a) => a === "data-cancel-all" }) } })');
    expect(q.out<string[]>("SAID")).toEqual(["Cancel all 3 open orders — 2 real-money, 1 paper? Each comes off its venue's book, one signature each, all at once."]);
  });

  it("says the smallest order the venue takes before asking the account, in its words, and asks nothing for it", () => {
    const q = page();
    const m = { kind: "perp", base: "BTC", name: "BTC perpetual", price: 62000, ask: 62010, bid: 61990, qtyStep: 0.001, minQty: 0.001, contractSize: 1 };
    const small = (d: Record<string, unknown>, mk: Record<string, unknown> = m) => q.run<string>(`tkTooSmall(${JSON.stringify(mk)}, ${JSON.stringify({ orderType: "market", side: "buy", ...d })}, "Exchange")`);
    expect(small({ usd: "25" })).toBe("The smallest order Exchange takes here is 0.001 BTC (about $62.01).");
    expect(small({ usd: "100" })).toBe("");
    expect(small({ qty: "0.0005" })).toBe("The smallest order Exchange takes here is 0.001 BTC (about $62.01).");
    expect(small({ usd: "100", orderType: "limit", limitPrice: "200000" })).toBe("The smallest order Exchange takes here is 0.001 BTC (about $200.00).");
    expect(small({ usd: "20" }, { ...m, minQty: undefined, qtyStep: 0.0001, minNotional: 50 })).toBe("The smallest order Exchange takes here is worth $50.00.");
    // a stop, no price, nothing typed: the account judges it
    expect(small({ usd: "1", orderType: "stop" })).toBe("");
    expect(small({ usd: "1" }, { ...m, price: undefined, ask: undefined, bid: undefined })).toBe("");
    expect(small({ usd: "" })).toBe("");
  });

  it("sums the order prepared under the button in label · value rows from the prepared order itself — Long or Short on a perpetual, its margin at the leverage held", () => {
    const q = page();
    const prep = { action: { side: "buy", qty: "0.001", orderType: "market" }, quote: { order: { kind: "perp", base: "BTC", quote: "USDT", name: "BTC perpetual", price: 62650, notionalUsd: 62.65, maxUsd: 63.9, worstPrice: 63903 } } };
    const words = q.run<string>(`tkOrderWords(${JSON.stringify(prep)}, null, { lev: 3 })`);
    expect(words).toContain("<span>Long 0.001 contracts · BTC</span><span>≈ $62.65</span>");
    expect(words).toContain("<dt>Order value</dt><dd>$62.65</dd>");
    expect(words).toContain("<dt>Margin required</dt><dd>$20.88 at 3x</dd>");
    expect(words).toContain("<dt>Most it may cost</dt><dd>$63.90</dd>");
    expect(q.run<string>(`tkOrderWords(${JSON.stringify({ ...prep, action: { ...prep.action, side: "sell" } })}, null, {})`)).toContain("<span>Short 0.001 contracts · BTC</span>");
    // no leverage the venue said: no margin row, never one worked out from a guess
    expect(q.run<string>(`tkOrderWords(${JSON.stringify(prep)}, null, {})`)).not.toContain("Margin required");
    const src = source("ui/trade.js");
    expect(src).toContain("Ready to sign for ");
    expect(src).not.toContain("Your signature is good for");
    // the size field shows no figure that reads as typed, and the button sits above the summary in the page's own order (no CSS order)
    expect(src).toContain('<input name="amount" inputmode="decimal" placeholder="" autocomplete="off" />');
    expect(src.indexOf("data-go disabled")).toBeLessThan(src.indexOf('<div class="quote real" data-q>'));
    // the leverage sits first, before the order types, in the page's own order: the keys meet it where the eye does
    expect(src.indexOf('<div class="tk-lev" data-lev hidden>')).toBeLessThan(src.indexOf('<div class="tk-otabs" data-otabs'));
    expect(source("ui/terminal.css")).not.toMatch(/\.tk-lev\s*\{\s*order:/);
  });

  it("writes Advanced's line in a few letters, the whole rule on hover — never a sentence cut mid-word", () => {
    const q = page();
    const short = (m: unknown, f: unknown) => q.run<string>(`tkAdvShort(${JSON.stringify(m)}, ${JSON.stringify(f)})`);
    expect(short({ tifs: ["gtc", "day"], postOnly: true }, { orderType: "limit" })).toBe("Default");
    expect(short({ tifs: ["gtc", "day"], postOnly: true }, { orderType: "limit", tif: "gtc", postOnly: "on" })).toBe("GTC · Post-only");
    expect(short({ tifs: ["ioc", "fok", "gtc"], tifsByType: { market: ["ioc", "fok"] } }, { orderType: "market" })).toBe("IOC/FOK");
    expect(source("ui/trade.js")).toContain('<abbr class="tk-tif" title="Time in force">TIF</abbr>');
  });
});

describe("the ticket's leverage and its places, in HL's grammar", () => {
  const PERP_EX = { symbol: "BTC/USDT:USDT", name: "BTC perpetual", kind: "perp", base: "BTC", quote: "USDT", price: 82000, open: true, types: ["market", "limit"], contractSize: 1, maxLeverage: 50 };
  const BTCP = { key: "perp:BTC", kind: "perp", name: "BTC perpetual", base: "BTC", price: 82000, tabs: [], at: [{ venue: "ex", venueName: "Exchange", symbol: "BTC/USDT:USDT", connected: true, canTrade: true, public: false, price: 82000 }] };
  const open = async (t: ReturnType<typeof ticketPage>, kind: string, preset: Record<string, unknown>) => {
    t.set("ITEM", preset.item);
    t.run(`TK.kind = ${JSON.stringify(kind)}; tkTicket(PANEL, ${JSON.stringify(kind)}, { ...${JSON.stringify({ ...preset, item: undefined })}, item: ITEM })`);
    await settle();
  };

  it("shows the leverage held as HL's button (3x, Cross where the venue says it), the field holding it, and Set leverage… only for another whole number up to the market's most", async () => {
    const t = ticketPage();
    t.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    t.set("A", pageOf([{ ...EX, cashUsd: 1000 }]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(PERP_EX)} }; ANSWERS["/api/account/positions"] = { ok: true, positions: [{ venue: "ex", symbol: "BTC/USDT:USDT", kind: "perp", qty: 0.01, side: "long", leverage: 3, marginMode: "cross" }], missing: [] };`);
    await open(t, "perps", { item: BTCP, venue: "ex", symbol: "BTC/USDT:USDT", side: "buy" });
    const pills = String(t.part("[data-lev-pills]").innerHTML);
    expect(pills).toContain(">Cross</button>");
    expect(pills).toContain(">3x</button>");
    expect(t.field("leverage").value).toBe("3");
    const ready = (v: string) => {
      t.field("leverage").value = v;
      t.field("leverage").dispatchEvent({ type: "input" });
      return !t.part("[data-lev-prep]").disabled;
    };
    expect(ready("3")).toBe(false);
    expect(ready("5")).toBe(true);
    expect(ready("51")).toBe(false);
    expect(ready("0")).toBe(false);
    expect(ready("2.5")).toBe(false);
    // nothing held and nothing set from here: no figure the venue did not give
    t.run('ANSWERS["/api/account/positions"] = { ok: true, positions: [], missing: [] }');
    await open(t, "perps", { item: BTCP, venue: "ex", symbol: "BTC/USDT:USDT", side: "buy" });
    expect(String(t.part("[data-lev-pills]").innerHTML)).toMatch(/>Leverage<\/button>$/);
  });

  it("never signs a leverage the fields no longer say: prepared at 5x, 10x typed — the Sign for 5x is taken away, and an answer landing after a change offers nothing (feat/paper-live p0: B6)", async () => {
    const t = ticketPage();
    t.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    t.set("A", pageOf([{ ...EX, cashUsd: 1000 }]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(PERP_EX)} }; ANSWERS["/api/account/positions"] = { ok: true, positions: [], missing: [] };
      var LEV_PREPARED = []; var LEV_SIGNED = [];
      Owner.prepare = async (d) => { if (d.type === "liveLeverage") LEV_PREPARED.push(d.leverage); return { status: 200, body: { action: { ...d, deadline: Date.now() + 600000, nonce: 1 }, shown: [] } }; };
      Owner.submit = async (p) => { LEV_SIGNED.push(p.action.leverage); return { status: 200, body: { result: { leverage: p.action.leverage } } }; };`);
    await open(t, "perps", { item: BTCP, venue: "ex", symbol: "BTC/USDT:USDT", side: "buy" });
    const lev = t.part("[data-lev]");
    const field = lev.querySelector('input[name="leverage"]');
    const out = lev.querySelector("[data-lev-sign]");
    const typeLev = (v: string) => {
      field.value = v;
      field.dispatchEvent({ type: "input" });
    };
    typeLev("5");
    lev.querySelector("[data-lev-prep]").click();
    await settle();
    expect(t.out("LEV_PREPARED")).toEqual(["5"]);
    expect(String(out.innerHTML)).toContain("data-lev-go");
    const go5 = out.querySelector("[data-lev-go]");
    // 10 typed after the 5x was prepared: its Sign is gone at once, and the old button (pressed anyway) signs nothing
    typeLev("10");
    expect(String(out.innerHTML)).not.toContain("data-lev-go");
    expect(String(out.innerHTML)).toContain("The leverage changed");
    go5.click();
    await settle();
    expect(t.out("LEV_SIGNED")).toEqual([]);
    // an answer that lands after the fields changed is for the leverage before the change: nothing of it is offered
    t.run("var HELD = null; var ANSWER = Owner.prepare; Owner.prepare = (d) => new Promise((go) => { HELD = () => go(ANSWER(d)); });");
    lev.querySelector("[data-lev-prep]").click();
    typeLev("20");
    t.run("HELD()");
    await settle();
    expect(String(out.innerHTML)).not.toContain("data-lev-go");
    expect(String(out.innerHTML)).toContain("The leverage changed");
    // prepared for what is typed, it is what is signed
    t.run("Owner.prepare = ANSWER");
    lev.querySelector("[data-lev-prep]").click();
    await settle();
    expect(String(out.innerHTML)).toContain("data-lev-go");
    out.querySelector("[data-lev-go]").click();
    await settle();
    expect(t.out("LEV_SIGNED")).toEqual(["20"]);
  });

  it("lists only the accounts of the kind the Real money | Paper switch is on, names a paper account without the word its tag says, and folds one public venue under '1 other venue lists it'", async () => {
    const t = ticketPage();
    const PAPER = venue("paper-momentum", "Momentum · paper", { paper: true, trade: { can: true, what: "paper", kinds: ["spot"] } });
    t.set("A", pageOf([EX, PAPER]));
    const item = { key: "coin:BTC", kind: "coin", name: "BTC", base: "BTC", price: 62000, tabs: [], at: [{ venue: "ex", venueName: "Exchange", symbol: "BTC/USDT", connected: true, canTrade: true, public: false, price: 62000 }, { venue: "paper-momentum", venueName: "Momentum · paper", symbol: "BTC/USD", connected: true, canTrade: true, public: false, paper: true, price: 62010 }, { venue: "kraken-public", venueName: "Kraken", symbol: "BTC/USD", connected: false, canTrade: false, public: true, price: 62005, connectTo: "kraken", connector: "live:exchange:kraken" }] };
    t.run(`ANSWERS["/api/account/market"] = { ok: true, market: { symbol: "BTC/USDT", name: "BTC", kind: "spot", base: "BTC", quote: "USDT", price: 62000, open: true, types: ["market"] } }; ANSWERS["/api/account/compare"] = { ok: false };`);
    await open(t, "crypto", { item, venue: "ex", symbol: "BTC/USDT", side: "buy" });
    const real = String(t.part("[data-where]").innerHTML);
    expect(real).toContain("<b>Exchange</b>");
    expect(real).not.toContain("Momentum");
    expect(real).toContain("1 other venue lists it");
    expect(real).not.toContain("venue list it");
    // the switch to Paper: the paper account, by its own name beside its tag, and no public venue to connect
    t.part("[data-where]").querySelectorAll("button[data-money]").find((b: Stub) => b.dataset.money === "paper").click();
    await settle();
    const paper = String(t.part("[data-where]").innerHTML);
    expect(paper).toContain('<b>Momentum</b> <span class="tag paper"');
    expect(paper).not.toContain("<b>Exchange</b>");
    expect(paper).not.toContain("other venue");
  });
});

describe("the ticket at rest leaves the page refreshing", () => {
  it("opens the resting ticket on the kind showing without taking the focus, and its search counts as the page's own (data-live), so a cursor in it does not stop the refresh", () => {
    const p = page();
    p.set("A", pageOf([EX]));
    // what the panel is asked to open, captured: at rest, after its close, and on purpose (the shell's own route and render are stubbed:
    // this stand-in browser has no panes to draw)
    p.run("ROUTE.tab = 'trade'; TK.kind = 'crypto'; render = () => {}; routed = () => {}; OPENED = []; tkTicket = (panel, kind, preset) => OPENED.push([kind, preset]);");
    p.run("tkRest()");
    p.run("openTicket({})");
    p.run("openTicket({ kind: 'perp', venue: 'ex', symbol: 'ETH/USDT:USDT' })");
    expect(p.out("OPENED")).toEqual([["crypto", { kind: "crypto", rest: true }], ["crypto", {}], ["perps", { kind: "perp", venue: "ex", symbol: "ETH/USDT:USDT" }]]);
    // a ticket of another kind moves the seg to it
    expect(p.run("TK.kind")).toBe("perps");
    // off the Trade pane, the ticket waits and the page goes to Trade on the market's kind
    p.run("ROUTE.tab = 'portfolio'; var WENT = []; go = (tab, params) => WENT.push([tab, params]); openTicket({ kind: 'event', venue: 'predict', symbol: 'X' })");
    expect(p.out("[WENT, TK.pending]")).toEqual([[["trade", { kind: "predictions" }]], { kind: "event", venue: "predict", symbol: "X" }]);
    // the shell keeps refreshing while focus is inside [data-live]: the ticket's search and the picker's are marked so
    const src = source("ui/trade.js");
    expect(src).toContain('<div class="tk-find" data-find data-live>');
    expect(src).toContain('<form class="tk-pfind" role="search" data-live>');
    expect(src).toContain("if (!preset.symbol && !preset.venue && !preset.rest) setTimeout(() => live() && form.elements.q.focus(");
    // its close puts the panel back at rest on the kind showing, and drops the ticket kept in this browser
    expect(src).toContain('b.addEventListener("click", () => {\n    tkDraftKeep(null);\n    tkOpen({ kind: TK.kind, rest: true });');
    // earn and selling many are Portfolio's sheets now: an old preset goes there when they are on the page
    p.run("ROUTE.tab = 'trade'; var SHEETS = []; openEarn = (x) => SHEETS.push(['earn', x]); openSellMany = (x) => SHEETS.push(['sellmany', x]); OPENED = []; tkOpen({ variant: 'earn', venue: 'ex' }); tkOpen({ tile: 'sellmany' })");
    expect(p.out("[SHEETS, OPENED]")).toEqual([[["earn", { variant: "earn", venue: "ex" }], ["sellmany", { tile: "sellmany" }]], []]);
  });
});

describe("closing a position, from whichever pane", () => {
  const POS = { venue: "ex", venueName: "Exchange", symbol: "BTC/USDT:USDT", name: "BTC perpetual", kind: "perp", side: "long", qty: 0.5, usd: 31000, markPrice: 62000, unrealizedUsd: 120 };
  const prep = (close?: Record<string, unknown>) => ({ action: { type: "liveClose", venue: "ex", symbol: "BTC/USDT:USDT", qty: "" }, quote: { words: "close", ...(close ? { close } : {}) } });

  it("says what the prepared close is worth at the worst price it may fill at, and refuses one over the cap before the sign button — with a part that fits one click away; inside the cap, no standing cap sentence", () => {
    const p = page();
    p.set("A", pageOf([EX]));
    p.run("var QD = null; quoteDialog = (o) => { QD = o; return { form: { addEventListener() {}, elements: {} }, requote() {} }; }");
    p.run(`openClose(${JSON.stringify(POS)})`);
    expect(p.run("QD.title")).toBe("Close BTC perpetual");
    expect(p.run("QD.go")).toBe("Sign and close");
    // over the cap: the worth, the worst price, and the refusal before the sign button (block), with the part that fits
    const over = prep({ worthUsd: 30900, capUsd: 250, overCap: true, side: "sell", qty: 0.5, worstPrice: 61800 });
    const words = p.run<string>(`QD.show(${JSON.stringify(over)})`);
    expect(words).toContain("Sell 0.5");
    expect(words).toContain("≈ $30,900.00");
    expect(words).toContain("filled no worse than 61,800");
    expect(words).toContain("One order may be worth up to $250.00 on this server.");
    // 0.5 × $250 × 0.98 / $30,900, to the millionth
    expect(words).toContain('data-close-part="0.003964"');
    expect(p.run(`QD.block(${JSON.stringify(over)})`)).toBe("Worth about $30,900.00: more than the $250.00 one order may be on this server, so the account would refuse it. Close part of it.");
    // in the account's own words, where it gave them
    expect(p.run(`QD.block(${JSON.stringify(prep({ worthUsd: 30900, capUsd: 250, overCap: true, side: "sell", qty: 0.5, why: "$30,900.00 is more than the most one order may be on this server ($250.00): close part of it, or start the server with a higher --live-cap" }))})`)).toBe("$30,900.00 is more than the most one order may be on this server ($250.00): close part of it, or start the server with a higher --live-cap.");
    // inside the cap: nothing refused, and the cap not said (it belongs to the block message and Settings)
    const inside = prep({ worthUsd: 198.2, capUsd: 250, overCap: false, side: "sell", qty: 0.0032, worstPrice: 61500 });
    expect(p.run(`QD.block(${JSON.stringify(inside)})`)).toBe("");
    expect(p.run<string>(`QD.show(${JSON.stringify(inside)})`)).not.toContain("$250.00");
    // a short is bought back
    expect(p.run<string>(`QD.show(${JSON.stringify(prep({ worthUsd: 100, capUsd: 250, overCap: false, side: "buy", qty: 1, worstPrice: 101 }))})`)).toContain("Buy back 1");
    // an account that does not say what a close is worth: shown as before, and nothing refused here (the door still holds it to the cap)
    expect(p.run(`QD.block(${JSON.stringify(prep())})`)).toBe("");
    expect(p.run<string>(`QD.show(${JSON.stringify(prep())})`)).toContain("≈ $31,000.00");
    // the draft: all of it, or the part typed
    expect(p.out('QD.draft({ values: { qty: "" } })')).toEqual({ type: "liveClose", venue: "ex", symbol: "BTC/USDT:USDT", qty: "" });
    expect(p.out('QD.draft({ values: { qty: "0.003964" } })')).toMatchObject({ qty: "0.003964" });
    // the part offered is in the market's own steps of a size, and none when even the smallest order it takes is over the cap
    expect(p.run("tkClosePart(0.01, 624.89, 250, false, { step: 0.001 })")).toBe(0.003);
    expect(p.run("tkClosePart(0.01, 624.89, 250, false, { step: 0.001, min: 0.005 })")).toBe(0);
    expect(p.run("tkClosePart(3, 300, 250, false, { step: 0.5 })")).toBe(2);
    // an event contract is sold, in whole contracts
    p.run(`openClose(${JSON.stringify({ ...POS, kind: "event", name: "Fed cut · Yes", symbol: "FED:YES", qty: 900 })})`);
    expect(p.run("QD.go")).toBe("Sign and sell");
    expect(p.run<string>(`QD.show(${JSON.stringify(prep({ worthUsd: 540, capUsd: 250, overCap: true, side: "sell", qty: 900, worstPrice: 0.6 }))})`)).toContain('data-close-part="408"');
  });

  it("is the one close every pane opens: Portfolio's and the market drawer's go through it, and the sheet holds the sign button off while a refusal stands", () => {
    expect(source("ui/portfolio.js")).toContain("if (p && typeof openClose === \"function\") openClose(p);");
    // the one drawer (markets.js; asset.js opens it by key) closes through the same door
    expect(source("ui/markets.js") + source("ui/asset.js")).toMatch(/typeof openClose === "function"/);
    const core = source("ui/core.js");
    // and while what is typed is not the draft it prepared (a change, before the account was asked again): nothing stale is signed
    expect(core).toContain("btn.disabled = !owns() || !!no || draftNow() !== asked;");
    expect(core).toContain("if (!prepared || busy || !stop.hidden) return;");
  });
});

describe("a ticket kept in this browser", () => {
  const DRAFT = { kind: "crypto", venue: "ex", venueName: "Exchange", symbol: "BTC/USDT", side: "buy", key: "coin:BTC", base: "BTC", name: "Bitcoin", amount: "25", unit: "usd", orderType: "limit", limitPrice: "60000" };
  const kept = () => {
    const p = page();
    p.set("A", pageOf([EX, PRED]));
    p.run("var STORE = {}; localStorage.getItem = (k) => (k in STORE ? STORE[k] : null); localStorage.setItem = (k, v) => { STORE[k] = String(v); }; localStorage.removeItem = (k) => { delete STORE[k]; }");
    p.run('var OPENED = []; tkOpen = (preset) => OPENED.push(preset); var ASKED = []; var MARKET = { ok: true, market: { symbol: "BTC/USDT", open: true } }; api = async (path) => { ASKED.push(path); return MARKET; }');
    return p;
  };
  const again = async (p: ReturnType<typeof page>) => {
    p.run("TK.draftLooked = false");
    await p.run("tkReopenDraft()");
  };

  it("opens again, at rest and on its kind, while its venue is connected and still lists its market", async () => {
    const p = kept();
    p.run(`tkDraftKeep(${JSON.stringify(DRAFT)})`);
    expect(p.out("Object.keys(JSON.parse(STORE['account.ticket'])).sort()")).toEqual([...Object.keys(DRAFT), "at"].sort());
    await again(p);
    expect(p.out("ASKED")).toEqual(["/api/account/market?venue=ex&symbol=BTC%2FUSDT"]);
    expect(p.out("OPENED")).toEqual([{ ...DRAFT, rest: true }]);
    expect(p.run("TK.kind")).toBe("crypto");
    // looked at once a visit
    await p.run("tkReopenDraft()");
    expect(p.out("OPENED.length")).toBe(1);
    // a draft of the page before this one named a ticket variant: it opens on the kind that variant was
    p.run(`OPENED = []; STORE['account.ticket'] = JSON.stringify({ ...${JSON.stringify({ ...DRAFT, kind: undefined, variant: "perps", symbol: "ETH/USDT:USDT" })}, at: Date.now() })`);
    await again(p);
    expect(p.out("OPENED[0].kind")).toBe("perps");
  });

  it("is dropped without a word when its venue is gone, its market is gone, it is a day old, or it was never a ticket", async () => {
    const p = kept();
    const dropped = async (setup: string) => {
      p.run(`tkDraftKeep(${JSON.stringify(DRAFT)}); OPENED = []; ${setup}`);
      await again(p);
      return [p.out("OPENED.length"), p.out("'account.ticket' in STORE")];
    };
    // the venue disconnected
    expect(await dropped(`A = ${JSON.stringify(pageOf([PRED]))}`)).toEqual([0, false]);
    // connected, but its key can no longer trade
    expect(await dropped(`A = ${JSON.stringify(pageOf([{ ...EX, trade: { can: false, what: "spot and perpetuals", kinds: ["spot", "perp"] } }]))}`)).toEqual([0, false]);
    p.set("A", pageOf([EX, PRED]));
    // the venue no longer lists it
    expect(await dropped('MARKET = { ok: false, refusal: { code: "E_VENUE_NO_MARKET", message: "Exchange lists no BTC/USDT" } }')).toEqual([0, false]);
    p.run('MARKET = { ok: true, market: { symbol: "BTC/USDT" } }');
    // a day old
    expect(await dropped("STORE['account.ticket'] = JSON.stringify({ ...JSON.parse(STORE['account.ticket']), at: Date.now() - 25 * 3600000 })")).toEqual([0, false]);
    // not a ticket the page keeps: an earn draft of the page before this one, no kind at all, not JSON
    expect(await dropped(`STORE['account.ticket'] = JSON.stringify({ ...${JSON.stringify({ ...DRAFT, kind: undefined })}, variant: "earn", at: Date.now() })`)).toEqual([0, false]);
    expect(await dropped(`STORE['account.ticket'] = JSON.stringify({ ...${JSON.stringify({ ...DRAFT, kind: "nothing" })}, at: Date.now() })`)).toEqual([0, false]);
    expect(await dropped("STORE['account.ticket'] = '{not json'")).toEqual([0, false]);
  });

  it("holds the pane's own start while its market is read — the pane drawn meanwhile with the kinds' reads already in starts nothing over it — and, dropped, gives the pane back to start on the busiest", async () => {
    const p = kept();
    // a new frame as renderTrade opens one: the panel at rest, the draft looked at, the pane drawn — the busiest crypto row read already
    // (shell.js reads the kinds ahead); the venue's market answers a tick later
    p.run(`tkOpen = (preset) => { TK.gen++; OPENED.push(preset); }; chRelease = () => {}; bkRelease = () => {}; tkDrawPane = () => {};
      var PANE = { querySelector: (s) => (s === "[data-tp]" ? { ttWired: true } : { innerHTML: "" }), querySelectorAll: () => [] };
      document.getElementById = (id) => (id === "pane-trade" ? PANE : { id });
      ROUTE.tab = "trade"; TK.kind = "crypto"; TK.pending = null;
      var LOOK = null;
      var FRAME = () => { TT.started = false; TT.item = null; TT.at = null; OPENED = []; TK.draftLooked = false; TK.got = { crypto: { at: Date.now(), items: [${JSON.stringify(ROW("coin", "ETH"))}] } }; };
      var NEW_FRAME = () => { FRAME(); tkDraftKeep(${JSON.stringify(DRAFT)}); tkRest(); LOOK = tkReopenDraft(); ttDraw(PANE, true); };`);
    p.run("NEW_FRAME()");
    expect(p.out("OPENED")).toEqual([{ kind: "crypto", rest: true }]);
    await p.run("LOOK");
    // only the draft opens, at rest
    expect(p.out("OPENED")).toEqual([{ kind: "crypto", rest: true }, { ...DRAFT, rest: true }]);
    // its market gone instead: the draft is dropped, and the pane starts on the busiest of its kind after all
    p.run('MARKET = { ok: false, refusal: { code: "E_VENUE_NO_MARKET", message: "Exchange lists no BTC/USDT" } }; NEW_FRAME()');
    await p.run("LOOK");
    expect(p.out("OPENED.map((x) => [x.item ? x.item.key : '', !!x.rest])")).toEqual([["", true], ["coin:ETH", true]]);
    expect(p.out("'account.ticket' in STORE")).toBe(false);
  });

  it("gives way to a ticket opened meanwhile, and is kept for later; storage that is off opens nothing and breaks nothing; the markets picked are remembered per kind", async () => {
    const p = kept();
    p.run(`tkDraftKeep(${JSON.stringify(DRAFT)}); api = async (path) => { TK.gen++; return MARKET; }`);
    await again(p);
    expect([p.out("OPENED.length"), p.out("'account.ticket' in STORE")]).toEqual([0, true]);
    // Recent: the last markets picked, per kind, newest first, one entry a market
    p.run('tkRecentAdd({ kind: "crypto", key: "coin:BTC", name: "Bitcoin", base: "BTC", venue: "ex", venueName: "Exchange", symbol: "BTC/USDT" }); tkRecentAdd({ kind: "perps", key: "perp:ETH", name: "ETH perpetual", base: "ETH", venue: "ex", venueName: "Exchange", symbol: "ETH/USDT:USDT" }); tkRecentAdd({ kind: "crypto", key: "coin:SOL", name: "Solana", base: "SOL", venue: "ex", venueName: "Exchange", symbol: "SOL/USDT" }); tkRecentAdd({ kind: "crypto", key: "coin:BTC", name: "Bitcoin", base: "BTC", venue: "ex", venueName: "Exchange", symbol: "BTC/USDT" })');
    expect(p.out('tkRecent("crypto").map((r) => r.symbol)')).toEqual(["BTC/USDT", "SOL/USDT"]);
    expect(p.out('tkRecent("perps").map((r) => r.symbol)')).toEqual(["ETH/USDT:USDT"]);
    p.run("localStorage.getItem = () => { throw new Error('storage is off'); }; localStorage.removeItem = () => { throw new Error('storage is off'); }");
    await again(p);
    expect(p.out("OPENED.length")).toBe(0);
    expect(p.out('tkRecent("crypto")')).toEqual([]);
  });
});

describe("each tile's real logo, as Markets shows it (live/icons.ts), with Elbstream's credit wherever one of its logos is shown", () => {
  const ELB = "https://api.elbstream.com/logos";
  const KALSHI_FED = "https://assets.kalshi.com/series-images-webp/KXFEDDECISION.webp";
  const PM_PIC = "https://polymarket-upload.s3.us-east-2.amazonaws.com/fed-decision.jpg";
  const BTC = ROW("coin", "BTC", { icon: `${ELB}/crypto/BTC` });
  const SOL = ROW("perp", "SOL", { icon: `${ELB}/crypto/SOL`, at: [{ venue: "hl", venueName: "Hyperliquid", symbol: "SOL-PERP", connected: true, canTrade: true, public: false }] });
  const FED = { key: "pm:0xfed", kind: "event", name: "Fed decision in October? · 25 bps cut", category: "Economics", price: 0.4, tabs: [], icon: PM_PIC, at: [{ venue: "polymarket", venueName: "Polymarket", symbol: "fed-decision-in-october:Yes", connected: false, canTrade: false, public: true }], outcomes: [{ label: "Yes", at: [{ venue: "polymarket", symbol: "fed-decision-in-october:Yes" }] }, { label: "No", at: [{ venue: "polymarket", symbol: "fed-decision-in-october:No" }] }] };

  it("a market row's tile carries its logo over its letters; one with none keeps its letters", () => {
    const p = page();
    p.set("A", pageOf([EX, PRED, HL]));
    const tile = p.out<string>(`tkItemRow(${JSON.stringify(BTC)}, "crypto").av`);
    expect(tile).toContain('<img class="av-im" src="https://api.elbstream.com/logos/crypto/BTC"');
    expect(tile).toContain('referrerpolicy="no-referrer"');
    expect(tile).toContain(">BTC<");
    const bare = p.out<string>(`tkItemRow(${JSON.stringify(ROW("coin", "ZZZ"))}, "crypto").av`);
    expect(bare).not.toContain("<img");
    // the ticket's search row and the market picked use the row's own logo too (the same avatar, the row's icon)
    expect(source("ui/trade.js")).toContain('x.base || x.name, "sm", x.icon || "")}<span class="tk-rn"><b>');
    expect(source("ui/trade.js")).toContain('x.base || x.name, "", x.icon || "")}<span class="tk-rn"');
  });

  it("a market picked before keeps the logo it had; an older one finds its row's by its key; nothing but an https address is kept or shown", () => {
    const p = page();
    p.set("A", pageOf([EX, PRED, HL]));
    p.run("var STORE = {}; localStorage.getItem = (k) => (k in STORE ? STORE[k] : null); localStorage.setItem = (k, v) => { STORE[k] = String(v); };");
    p.run(`tkRecentAdd({ kind: "crypto", key: "coin:ETH", name: "ETH", base: "ETH", venue: "ex", venueName: "Exchange", symbol: "ETH/USDT", icon: "${ELB}/crypto/ETH" })`);
    p.run(`tkRecentAdd({ kind: "crypto", key: "coin:XRP", name: "XRP", base: "XRP", venue: "ex", venueName: "Exchange", symbol: "XRP/USDT", icon: "javascript:alert(1)" })`);
    const kept = p.out<Array<{ key: string; icon?: string }>>("tkRecent('crypto')");
    expect(kept.find((r) => r.key === "coin:ETH")?.icon).toBe(`${ELB}/crypto/ETH`);
    expect(kept.find((r) => r.key === "coin:XRP")).not.toHaveProperty("icon");
    expect(p.out<string>("tkRecentRow(tkRecent('crypto').find((r) => r.key === 'coin:ETH'), 'crypto').av")).toContain(`src="${ELB}/crypto/ETH"`);
    // one kept before logos were (or with an address not kept): its row's logo once that row is read, else its letters
    const old = { kind: "crypto", key: "coin:BTC", name: "BTC", base: "BTC", venue: "ex", symbol: "BTC/USDT", at: 1 };
    expect(p.out<string>(`tkRecentRow(${JSON.stringify(old)}, "crypto").av`)).not.toContain("<img");
    p.set("TK.got", { crypto: { at: Date.now(), items: [BTC] } });
    expect(p.out<string>(`tkRecentRow(${JSON.stringify(old)}, "crypto").av`)).toContain(`src="${ELB}/crypto/BTC"`);
    expect(p.out<string>(`tkRecentRow(${JSON.stringify({ ...old, icon: "http://tracker.example/p.png" })}, "crypto").av`)).toContain(`src="${ELB}/crypto/BTC"`);
  });

  it("a holding or a position that is not a market row finds its logo in the rows read: an event by its outcome's symbol, a position by its venue's line", () => {
    const p = page();
    p.set("A", pageOf([EX, PRED, HL]));
    p.set("TK.got", { perps: { at: Date.now(), items: [SOL] }, predictions: { at: Date.now(), items: [FED] } });
    // the NO side of the question held at a paper account is the same symbol the public line lists
    expect(p.out("tkEventIcon('fed-decision-in-october:No')")).toBe(PM_PIC);
    expect(p.out("tkEventIcon('some-other-market:Yes')")).toBe("");
    expect(p.out("tkPairIcon('hl|SOL-PERP')")).toBe(`${ELB}/crypto/SOL`);
    expect(p.out("tkPairIcon('hl|ETH-PERP')")).toBe("");
    // the holding's own logo, as the account gives it (exchange.ts → live/icons.ts holdingIcon), comes first: the hold rows read h.icon
    expect(source("ui/trade.js")).toContain('e.icon || (cls === "event" ? tkEventIcon(e.asset) : "")');
    expect(source("ui/trade.js")).toContain("p.icon || tkPairIcon(`${p.venue}|${p.symbol}`)");
  });

  it("credits Elbstream wherever one of its logos stands, and only then: a venue's own picture asks for none", () => {
    const p = page();
    const credit = '<p class="logo-credit tk-credit"><a href="https://elbstream.com" target="_blank" rel="noopener noreferrer">Logos by Elbstream</a></p>';
    expect(p.out(`logoCredit(["${ELB}/crypto/BTC", "${PM_PIC}"], "tk-credit")`)).toBe(credit);
    expect(p.out(`logoCredit(["${PM_PIC}", "${KALSHI_FED}", "", null], "tk-credit")`)).toBe("");
    // a logo that did not load is not one shown
    p.run(`ICON_MISS.add("${ELB}/crypto/BTC")`);
    expect(p.out(`logoCredit(["${ELB}/crypto/BTC"], "tk-credit")`)).toBe("");
    // the picker's foot and the ticket each carry it (painted from what their tiles show)
    expect(source("ui/trade.js")).toContain('creditFor(sec, g("foot"), "tk-credit")');
    expect(source("ui/trade.js")).toContain('<div class="tk-credit-w" data-credit></div>');
    expect(source("ui/trade.css")).toContain(".tk-credit");
    expect(source("ui/shell.css")).toMatch(/\.logo-credit \{[^}]*font-size: 12pt/);
  });
});

describe("a tokenised asset in the ticket", () => {
  it("shows the issuer's words where its issuer closed it or keeps it from being swapped, instead of a button that would only be refused", () => {
    const p = page();
    p.set("A", pageOf([WALLET]));
    const ousg = { kind: "rwa", base: "OUSG", at: [{ venue: "wallet", venueName: "Wallet", symbol: "OUSG/USDC@Ethereum", connected: true, canTrade: false, issuer: "Ondo Finance", eligibility: "OUSG moves only between wallets Ondo has approved" }] };
    expect(p.run(`tkShut(${JSON.stringify(ousg)}, { open: false, types: [], issuer: "Ondo Finance", note: "OUSG on Ethereum: transfers only between wallets the issuer approved." })`)).toBe("No order for it here · Ondo Finance: OUSG on Ethereum: transfers only between wallets the issuer approved.");
    // paused by its issuer, with no words of the venue's: the issuer's own
    expect(p.run(`tkShut(${JSON.stringify(ousg)}, { open: false, types: ["market"], issuer: "Ondo Finance" })`)).toBe("Closed now · Ondo Finance: OUSG moves only between wallets Ondo has approved.");
    // open, or not a tokenised asset: nothing is held back here
    expect(p.run(`tkShut(${JSON.stringify(ousg)}, { open: true, types: ["market"], issuer: "Ondo Finance" })`)).toBe("");
    expect(p.run('tkShut({ kind: "stock", at: [] }, { open: false, types: ["limit"] })')).toBe("");
  });
});

describe("the same drafts through the real account's door, on the stand-in account", () => {
  let s: Standin;
  const p = page();
  const browser = simKey("device:ui-trade-test-browser");
  const get = async (path: string): Promise<{ status: number; body: any }> => {
    const r = await fetch(`${s.url}${path}`);
    return { status: r.status, body: await r.json() };
  };
  const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
    const r = await fetch(`${s.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  /** as the page does: the account prepares the draft, the browser signs exactly what was prepared, the door takes it */
  const act = async (draft: Record<string, unknown>) => {
    const prep = await post("/api/account/prepare", { draft });
    expect(prep.status, JSON.stringify(prep.body)).toBe(200);
    const action = prep.body.action as OwnerAction;
    return post("/api/exchange", { action, nonce: action.nonce, signature: signDevice(browser, action) });
  };

  beforeAll(async () => {
    s = await startStandin({ port: 0, tickMs: 0, agentMs: 0 });
    const paired = await post("/api/account/pair", { jwk: browser.jwk, label: "this browser", code: s.code });
    expect(paired.body).toMatchObject({ ok: true, role: "owner" });
  }, 60_000);
  afterAll(async () => {
    await s?.close();
  });

  it("shows the kinds the stand-in's venues and public listings really have, each kind's rows read as the picker reads them", async () => {
    const { body } = await get("/api/account");
    p.set("A", body);
    const got: Record<string, unknown> = {};
    for (const kind of ["crypto", "stocks", "rwas", "perps", "preipo", "predictions"]) {
      const r = await get(`/api/account/explore?tab=${kind}&limit=12`);
      // a kind this server does not know yet answers with a refusal: the picker reads it as an empty list, without a toast
      got[kind] = { at: Date.now(), items: r.status === 200 ? r.body.items : [], missing: [] };
    }
    const kinds = p.out<string[]>(`tkKindsFor(connected(), ${JSON.stringify(got)}, lensNow())`);
    for (const k of ["crypto", "perps", "predictions"]) expect(kinds).toContain(k);
    // the Pre-IPO face lists the company's row — its implied valuation, the stand-in venue's Trade and the public venue's Connect to trade
    const pre = (got.preipo as { items: Array<Record<string, any>> }).items.filter((x) => p.run(`tkPre(${JSON.stringify(x)})`));
    if (pre.length) {
      expect(kinds).toContain("preipo");
      const rows = p.out<Array<{ state: string; implied?: { usd: number } }>>(`tkWhereRows(${JSON.stringify(pre[0])}, null, "preipo")`);
      expect(rows.some((r) => r.state === "able")).toBe(true);
      expect(p.run<string>(`tkKindBlock("preipo", null, null, ${JSON.stringify(pre[0])}, {})`)).toContain("Implied valuation ≈");
      // a pre-IPO row never shows under Perps
      expect((got.perps as { items: Array<{ key: string }> }).items.some((x) => x.key === pre[0]!.key)).toBe(false);
    }
  });

  it("places the ticket's order — an event contract's limit typed in cents rests at the venue at that price", async () => {
    const draft = p.out<Record<string, unknown>>('tkOrderDraft({ amount: "10", unit: "usd", orderType: "limit", limitPrice: "30" }, { venue: "predict", symbol: "SI-FEDCUT-DEC:NO", side: "buy", event: true })');
    const r = await act(draft);
    expect(r.status).toBe(200);
    expect(r.body.order).toMatchObject({ venue: "predict", symbol: "SI-FEDCUT-DEC:NO", type: "limit", limitPrice: 0.3, status: "open" });
  });

  it("pays with a coin held in two signatures: the sale, then the buy sized by what the sale brought", async () => {
    const markets = (await get("/api/account/markets?venue=ex&q=")).body.markets;
    const plan = p.out<any>(`tkSwapPlan(${JSON.stringify({ venue: "ex", from: "BTC", to: "SOL", amount: "0.001", markets })})`);
    expect(plan.mode).toBe("two");
    const sold = await act(plan.legs[0]);
    expect(sold.body.order).toMatchObject({ side: "sell", status: "filled" });
    const usd = p.out<number>(`tkProceeds(${JSON.stringify(sold.body.order)})`);
    expect(usd).toBeGreaterThan(50);
    const bought = await act({ ...plan.legs[1], usd: String(usd) });
    expect(bought.body.order).toMatchObject({ symbol: "SOL/USDT", side: "buy", status: "filled" });
    expect(bought.body.order.qty * bought.body.order.avgPrice).toBeLessThanOrEqual(usd + 0.01);
  });

  it("prepares a position's close at the door and reads it as the close sheet does: its worth against this server's cap, or as before on an account that does not say", async () => {
    const { body } = await get("/api/account/positions");
    const pos = body.positions.find((x: { venue: string; kind: string; qty: number }) => x.venue === "ex" && x.kind === "perp" && x.qty > 0);
    expect(pos).toBeTruthy();
    const prep = await post("/api/account/prepare", { draft: { type: "liveClose", venue: pos.venue, symbol: pos.symbol, qty: "" } });
    const c = p.out<{ worthUsd: number; capUsd: number; overCap: boolean } | null>(`tkCloseQuote(${JSON.stringify(prep.body)})`);
    if (prep.status === 200 && c) {
      expect(c.worthUsd).toBeGreaterThan(0);
      expect(c.overCap).toBe(c.worthUsd > c.capUsd);
      expect(p.out<string>(`tkCloseBlock(${JSON.stringify(prep.body)})`) !== "").toBe(c.overCap);
    } else expect(p.out(`tkCloseBlock(${JSON.stringify(prep.body)})`)).toBe("");
  });

  it("hands words to the agent with a limit for them: the intent stands, the limit replaces the agent's, and withdrawing ends the intent", async () => {
    const page0 = (await get("/api/account")).body;
    const d = p.out<any>(`htaDrafts({ agent: ${JSON.stringify(s.agent.address)}, venue: "ex", symbol: "ETH/USDT", side: "sell", usd: "100", text: "Sell about $100 of ETH under $2,300", days: "3", withLimit: true, perOrder: "50", budget: "200" }, ${Date.parse(page0.now)})`);
    expect((await act(d.intent)).status).toBe(200);
    expect((await act(d.limit)).status).toBe(200);
    const after = (await get("/api/account")).body;
    const it = after.intents.find((x: { text: string }) => x.text === "Sell about $100 of ETH under $2,300");
    expect(it).toMatchObject({ agentName: "Claude Code", venue: "ex", side: "sell", usd: "100" });
    expect(after.spend.filter((x: { scope: string; agent: string }) => x.scope === "trade" && x.agent === s.agent.address)).toEqual([expect.objectContaining({ allow: ["ex"], perPaymentUsd: 50, budgetUsd: 200 })]);
    expect((await act({ type: "setIntent", id: it.id, agent: it.agent, venue: "", symbol: "", side: "", usd: "", text: "", validUntil: 0 })).status).toBe(200);
    expect((await get("/api/account")).body.intents.some((x: { id: string }) => x.id === it.id)).toBe(false);
  });

  it("withdrawing words a limit was given with ends the limit too, so the agent can place nothing after; words being changed keep the limit's end", async () => {
    const AG = JSON.stringify(s.agent.address);
    const now0 = Date.parse((await get("/api/account")).body.now);
    const d = p.out<any>(`htaDrafts({ agent: ${AG}, venue: "ex", symbol: "SOL/USDT", side: "buy", usd: "100", text: "Buy a little SOL", days: "7", withLimit: true, perOrder: "60", budget: "120" }, ${now0})`);
    expect((await act(d.intent)).status).toBe(200);
    expect((await act(d.limit)).status).toBe(200);
    const read = async () => {
      const a = (await get("/api/account")).body;
      p.set("A", a);
      return a;
    };
    let a = await read();
    const it0 = a.intents.find((x: { text: string }) => x.text === "Buy a little SOL");
    expect(p.out(`htaLimitOf(${JSON.stringify(it0)})`)).toMatchObject({ scope: "trade", allow: ["ex"], perPaymentUsd: 60, budgetUsd: 120 });
    // the words changed: their end stays the limit's, so the two still end together
    const changed = p.out<any>(`htaDrafts({ id: ${JSON.stringify(it0.id)}, agent: ${AG}, venue: "ex", text: "Buy a little SOL, slowly", days: "1", until: ${Date.parse(it0.validUntil)} }, ${now0})`);
    expect((await act(changed.intent)).status).toBe(200);
    a = await read();
    const it1 = a.intents.find((x: { id: string }) => x.id === it0.id);
    expect([it1.text, it1.validUntil]).toEqual(["Buy a little SOL, slowly", it0.validUntil]);
    // Withdraw signs the words away, then the limit given with them
    const drafts = p.out<Array<Record<string, unknown>>>(`htaWithdrawDrafts(${JSON.stringify(it1)}, ${now0})`);
    expect(drafts.map((x) => x.type)).toEqual(["setIntent", "approveSpend"]);
    expect(drafts[1]).toMatchObject({ agent: s.agent.address, scope: "trade", allow: "ex", perPayment: "0", budget: "0" });
    for (const x of drafts) expect((await act(x)).status).toBe(200);
    a = await read();
    expect(a.intents.some((x: { id: string }) => x.id === it0.id)).toBe(false);
    expect(a.spend.filter((x: { scope: string; agent: string }) => x.scope === "trade" && x.agent === s.agent.address)).toEqual([]);
    // even in Beast the agent now places nothing: its authority ended with the words
    expect((await act({ type: "setPolicy", change: "mode", value: "open" })).status).toBe(200);
    const order = await s.svc.exchange(await signAgent(s.agent, { type: "agentLiveOrder", venue: "ex", symbol: "SOL/USDT", side: "buy", orderType: "market", qty: "", usd: "50", limitPrice: "", nonce: Date.now() } as AgentAction));
    expect((order as { code?: string }).code).toBe("E_MANDATE_NONE");
    // words that came with no limit withdraw alone
    expect(p.out(`htaWithdrawDrafts({ id: "intent-9", agent: "*", validUntil: "2026-10-09T00:00:00.000Z" }, ${now0}).length`)).toBe(1);
  });
});

describe("the ticket never signs an order it did not show, and says a refusal where it is seen (feat/paper-live p0: B6, P10)", () => {
  const MK = { symbol: "BTC/USDT", name: "BTC", kind: "spot", base: "BTC", quote: "USDT", price: 60000, bid: 59990, ask: 60010, open: true, types: ["market", "limit"], qtyStep: 0.00001, minNotional: 1 };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ticket = async () => {
    const t = ticketPage();
    t.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    t.set("A", pageOf([{ ...EX, cashUsd: 1000, holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }] }]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(MK)} }; ANSWERS["/api/account/compare"] = { ok: false };
      var PREPARED = []; var SIGNED = []; var TOASTS = [];
      toast = (text, kind) => TOASTS.push([text, kind]);
      load = async () => {};
      var SUBMIT_ANSWER = { status: 200, body: { kind: "order", order: { id: "ord-0001", status: "filled", side: "buy", qty: 0.001, filledQty: 0.001, avgPrice: 60010, symbol: "BTC/USDT" } } };
      Owner.prepare = async (d) => { PREPARED.push(d.usd); return { status: 200, body: { action: { ...d, qty: "0.001", maxNotional: d.usd, deadline: Date.now() + 600000, nonce: 1 }, shown: [], quote: { order: { words: "buy", name: "BTC", kind: "spot", base: "BTC", quote: "USDT", price: 60010, notionalUsd: Number(d.usd), maxUsd: Number(d.usd), capUsd: 250 } } } }; };
      Owner.submit = async (p) => { SIGNED.push(p.action.usd); return SUBMIT_ANSWER; };`);
    t.set("ITEM", ROW("coin", "BTC"));
    t.run('TK.kind = "crypto"; tkTicket(PANEL, "crypto", { venue: "ex", symbol: "BTC/USDT", side: "buy", item: ITEM })');
    await settle();
    return t;
  };
  const type = (t: Awaited<ReturnType<typeof ticket>>, v: string) => {
    t.field("amount").value = v;
    t.field("amount").dispatchEvent({ type: "input" });
  };

  it("a change turns Sign off at once; a quick Enter after it prepares what is typed now and signs nothing until that is shown", async () => {
    const t = await ticket();
    type(t, "10");
    await wait(420);
    await settle();
    expect(t.out("PREPARED")).toEqual(["10"]);
    expect(t.part("[data-go]").disabled).toBe(false);
    // 10 → 100, and Enter before the account was asked again: nothing is signed, the order is prepared again for 100
    type(t, "100");
    expect(t.part("[data-go]").disabled).toBe(true);
    t.form.dispatchEvent({ type: "submit" });
    await settle();
    expect(t.out("SIGNED")).toEqual([]);
    expect(t.out("PREPARED").at(-1)).toBe("100");
    expect(String(t.part("[data-msg]").textContent)).toMatch(/^The order changed/);
    expect(t.part("[data-go]").disabled).toBe(false);
    // the one shown is the one signed
    t.form.dispatchEvent({ type: "submit" });
    await settle();
    expect(t.out("SIGNED")).toEqual(["100"]);
  });

  it("a change taken back before the account was asked again (10 → 100 → 10) leaves the order prepared signable, not off for good", async () => {
    const t = await ticket();
    type(t, "10");
    await wait(420);
    await settle();
    expect(t.out("PREPARED")).toEqual(["10"]);
    expect(t.part("[data-go]").disabled).toBe(false);
    // 100 typed: off at once; 10 again within the wait: the fields say exactly the order prepared, and the button is on for it again
    type(t, "100");
    expect(t.part("[data-go]").disabled).toBe(true);
    expect(t.part("[data-go]").title).toBe("The order changed: it is being prepared again");
    type(t, "10");
    expect(t.part("[data-go]").disabled).toBe(false);
    expect(t.part("[data-go]").title).toBe("");
    // the debounced ask that follows has nothing to ask, and leaves it on
    await wait(420);
    await settle();
    expect(t.out("PREPARED")).toEqual(["10"]);
    expect(t.part("[data-go]").disabled).toBe(false);
    expect(t.part("[data-go]").title).toBe("");
    t.form.dispatchEvent({ type: "submit" });
    await settle();
    expect(t.out("SIGNED")).toEqual(["10"]);
  });

  it("a prepared order that lands after another change is shown but cannot be signed; a refusal of the signed order is toasted, not only written under the sticky button", async () => {
    const t = await ticket();
    // the account answers the ask for 10 only after the owner typed 20: what lands is 10's, and Sign stays off
    t.run(`var HELD = null; var ANSWER = Owner.prepare; Owner.prepare = (d) => new Promise((go) => { HELD = () => go(ANSWER(d)); });`);
    type(t, "10");
    await wait(420);
    type(t, "20");
    t.run("HELD()");
    await settle();
    expect(t.part("[data-go]").disabled).toBe(true);
    t.run("Owner.prepare = ANSWER");
    await wait(420);
    await settle();
    expect(t.part("[data-go]").disabled).toBe(false);
    t.run('SUBMIT_ANSWER = { status: 409, body: { ok: false, refusal: { message: "Momentum: not enough paper money — $20.02 needed, $5.00 there" } } }');
    t.form.dispatchEvent({ type: "submit" });
    await settle();
    expect(t.out("TOASTS")).toEqual([["Momentum: not enough paper money — $20.02 needed, $5.00 there", "no"]]);
    // a sheet (the close, a change, a paper account's reset) holds the same rule: a change makes another draft, prepared before anything is signed
    const core = source("ui/core.js");
    expect(core).toContain('if (draftNow() !== asked) {\n      say("It changed: here it is again as the account would take it. Check it, then sign.", "wait");');
  });

  it("a fill of the ticket's own order is one toast, whichever comes first: pushed during the call, before its answer, the push says it and the ticket only writes it under its button; pushed after the answer, the answer says it and the push says nothing more", async () => {
    const t = await ticket();
    const answer = (id: string, clientId: string) => ({ status: 200, body: { kind: "order", order: { id, clientId, status: "filled", side: "buy", qty: 0.001, filledQty: 0.001, avgPrice: 60010, symbol: "BTC/USDT", name: "BTC / USDT", kind: "spot", venue: "ex", venueName: "Exchange" } } });
    const fill = (clientId: string) => ({ venue: "ex", venueName: "Exchange", ref: "x", clientId, filledQty: 0.001, symbol: "BTC/USDT", name: "BTC / USDT", kind: "spot", side: "buy", qty: 0.001, price: 60010 });
    // the account pushes the fill while it places the order (its book wrote it, or its door heard it), before it answers
    t.run(`SUBMIT_ANSWER = ${JSON.stringify(answer("ord-0007", "c7"))}; var SUBMIT = Owner.submit; Owner.submit = async (p) => { stTell("fill", ${JSON.stringify(fill("c7"))}); return SUBMIT(p); };`);
    type(t, "60");
    await wait(420);
    await settle();
    t.form.dispatchEvent({ type: "submit" });
    await settle();
    expect(t.out("SIGNED")).toEqual(["60"]);
    expect(t.out("TOASTS.map(([x]) => x)")).toEqual(["Bought 0.001 BTC / USDT @ 60,010 · Exchange"]);
    // nothing for the next draw to toast; the words under the button stay
    expect(t.run("said")).toBe("");
    expect(String(t.part("[data-msg]").textContent)).toMatch(/^Bought 0\.001 BTC\/USDT at 60,010 on Exchange/);
    // the next order's fill is pushed only after the answer: the answer is the toast (said), the push after it says nothing
    t.run(`SUBMIT_ANSWER = ${JSON.stringify(answer("ord-0008", "c8"))}; Owner.submit = SUBMIT;`);
    type(t, "70");
    await wait(420);
    await settle();
    t.form.dispatchEvent({ type: "submit" });
    await settle();
    expect(t.run("said")).toMatch(/^Bought 0\.001 BTC\/USDT at 60,010 on Exchange/);
    t.run(`stTell("fill", ${JSON.stringify(fill("c8"))})`);
    expect(t.out("TOASTS")).toHaveLength(1);
  });

  it("own(): an order an action placed whose fill was pushed first is not said again — a close, a card approved — but a cancel's or a change's answer says itself, whatever was said of the order's fill", async () => {
    const p = page();
    p.set("A", pageOf([EX]));
    p.run(`load = async () => {}; render = () => {};
      var ANSWER = (d) => ({ status: 200, body: { kind: "order", order: { id: "ord-0003", clientId: "c3", status: d.type === "liveCancel" ? "canceled" : "partial", side: "buy", type: "limit", qty: 0.5, filledQty: 0.2, avgPrice: 2450.5, limitPrice: 2451, symbol: "ETH/USD", name: "ETH / USD", kind: "spot", venue: "ex", venueName: "Exchange" } } });
      Owner.act = async (d) => ANSWER(d);
      fillSaid("c3|0.2");`);
    for (const draft of [{ type: "liveClose", venue: "ex", symbol: "ETH/USD", qty: "" }, { type: "approveCard", card: "card-1", action: "0x1", decision: "approve" }, { type: "liveOrder", venue: "ex", symbol: "ETH/USD" }]) {
      await p.run(`own(${JSON.stringify(draft)})`);
      expect(p.run("said"), draft.type).toBe("");
    }
    await p.run('own({ type: "liveCancel", venue: "ex", order: "ord-0003" })');
    expect(p.run("said")).toMatch(/^Canceled 0\.2 ETH\/USD at 2,450\.5 on Exchange/);
    await p.run('own({ type: "liveAmend", venue: "ex", order: "ord-0003", qty: "0.6", limitPrice: "", stopPrice: "" })');
    expect(p.run("said")).toMatch(/^Part filled 0\.2 ETH\/USD/);
    // an order no push said: said, and marked, so the push after it says nothing
    p.run("FILLS_SAID.clear()");
    await p.run('own({ type: "liveOrder", venue: "ex", symbol: "ETH/USD" })');
    expect(p.run("said")).toMatch(/^Part filled/);
    expect(p.run('FILLS_SAID.has("c3|0.2")')).toBe(true);
    // the Close… sheet (quoteDialog) takes its words from the same place, for the action it signed
    expect(source("ui/core.js")).toContain("said = (done ? await done(r, p) : \"\") || orderWordsOnce(r.body, ORDER_PLACING.has(p.action && p.action.type));");
  });
});

describe("a paper account is the trading area's default (feat/paper-live p0: B7)", () => {
  const PAPER = venue("paper-momentum", "Momentum · paper", { paper: true, trade: { can: true, what: "paper", kinds: ["spot"] } });
  const BTC = { key: "coin:BTC", kind: "coin", name: "BTC", base: "BTC", price: 62000, tabs: [], at: [{ venue: "ex", venueName: "Exchange", symbol: "BTC/USDT", connected: true, canTrade: true, public: false, price: 62000 }, { venue: "paper-momentum", venueName: "Momentum · paper", symbol: "BTC/USD", connected: true, canTrade: true, public: false, paper: true, price: 62010 }] };

  it("a market picked with no account named opens at the paper account; the Real money lens, a venue's lens and an account the owner named keep theirs", () => {
    const p = page();
    p.set("A", pageOf([EX, PAPER]));
    p.set("ITEM", BTC);
    expect(p.run("tkFirstLeg(ITEM, { kind: 'all' }).venue")).toBe("paper-momentum");
    expect(p.run("tkFirstLeg(ITEM, { kind: 'agent', id: '0x1' }).venue")).toBe("paper-momentum");
    expect(p.run("tkFirstLeg(ITEM, { kind: 'real' }).venue")).toBe("ex");
    expect(p.run("tkFirstLeg(ITEM, { kind: 'venue', id: 'ex' }).venue")).toBe("ex");
    // no paper account trades it: no real account is picked for the owner — under every account, Paper, an agent's lens, or a venue's lens
    // whose venue does not trade it; under Real money and that venue's own lens, the owner's pick stands
    p.set("ONLY", { ...BTC, at: [BTC.at[0]] });
    expect(p.run("tkFirstLeg(ONLY, { kind: 'all' })")).toBe(null);
    expect(p.run("tkFirstLeg(ONLY, { kind: 'paper' })")).toBe(null);
    expect(p.run("tkFirstLeg(ONLY, { kind: 'agent', id: '0x1' })")).toBe(null);
    expect(p.run("tkFirstLeg(ONLY, { kind: 'venue', id: 'paper-momentum' })")).toBe(null);
    expect(p.run("tkFirstLeg(ONLY, { kind: 'real' }).venue")).toBe("ex");
    expect(p.run("tkFirstLeg(ONLY, { kind: 'venue', id: 'ex' }).venue")).toBe("ex");
    // the picker and the terminal's own start go through it
    p.run("var OPENED = []; tkOpen = (x) => OPENED.push(x); tkShowPanel = () => {}; tkPickOpen(ITEM, 'crypto')");
    expect(p.out("OPENED.map((x) => [x.venue, x.symbol])")).toEqual([["paper-momentum", "BTC/USD"]]);
    expect(source("ui/terminal.js")).toContain("const at = tkFirstLeg(first);");
  });

  it("the ticket's Where picks the paper account when none was named, and keeps a real one the owner named; Markets' Buy routes to the paper account first", async () => {
    const t = ticketPage();
    t.set("A", pageOf([EX, PAPER]));
    t.run(`ANSWERS["/api/account/market"] = { ok: true, market: { symbol: "BTC/USD", name: "BTC", kind: "spot", base: "BTC", quote: "USD", price: 62010, open: true, types: ["market"] } }; ANSWERS["/api/account/compare"] = { ok: false };`);
    t.set("ITEM", BTC);
    t.run('TK.kind = "crypto"; tkTicket(PANEL, "crypto", { side: "buy", item: ITEM })');
    await settle();
    expect(t.out<string[]>("ASKED").filter((x) => x.startsWith("/api/account/market?"))).toEqual(["/api/account/market?venue=paper-momentum&symbol=BTC%2FUSD"]);
    expect(String(t.part("[data-money-band]").innerHTML)).toContain("PAPER · no real money · Momentum");
    // named by the owner (a venue's Trade, a route): kept
    t.run('ASKED.length = 0; tkTicket(PANEL, "crypto", { side: "buy", item: ITEM, venue: "ex", symbol: "BTC/USDT" })');
    await settle();
    expect(t.out<string[]>("ASKED").filter((x) => x.startsWith("/api/account/market?"))).toEqual(["/api/account/market?venue=ex&symbol=BTC%2FUSDT"]);
    // no paper account trades it and none was named: nothing is picked, no market is read, and the band asks the owner where — real money
    t.set("ONLY", { ...BTC, at: [BTC.at[0]] });
    t.run('ASKED.length = 0; tkTicket(PANEL, "crypto", { side: "buy", item: ONLY })');
    await settle();
    expect(t.out<string[]>("ASKED").filter((x) => x.startsWith("/api/account/market?"))).toEqual([]);
    expect(t.part("[data-body]").hidden).toBe(true);
    expect(String(t.part("[data-where]").innerHTML)).toContain('<span data-money-band><span class="tk-money pick">Pick where it trades — real money</span></span>');
    expect(String(t.part("[data-where]").innerHTML)).toContain('<button type="button" class="tk-at" data-at="0" aria-pressed="false">');
    // the same under the Real money lens: the owner picked real money, and the account that trades it is picked
    t.run('view.lens = "real"; ASKED.length = 0; tkTicket(PANEL, "crypto", { side: "buy", item: ONLY })');
    await settle();
    expect(t.out<string[]>("ASKED").filter((x) => x.startsWith("/api/account/market?"))).toEqual(["/api/account/market?venue=ex&symbol=BTC%2FUSDT"]);
    t.run('view.lens = ""');
    // Markets' Buy: the paper account first
    const m = page();
    m.set("A", pageOf([EX, PAPER]));
    m.set("ROW", { ...BTC, at: BTC.at.map((a) => ({ ...a })) });
    expect(m.out("mkRoute(ROW)")).toMatchObject({ act: "trade", venue: "paper-momentum", paper: true });
    // on Real money a paper account is not offered at all
    m.run("view.lens = 'real'");
    expect(m.out("mkRoute(ROW)")).toMatchObject({ act: "trade", venue: "ex" });
  });
});

describe("a price shown as now says how old it is (feat/paper-live p0)", () => {
  it("ageWords: nothing while fresh, then seconds, minutes, and past an hour the moment it is from", () => {
    const p = page();
    const now = Date.parse("2026-10-16T15:00:00Z");
    expect(p.run(`ageWords(${now - 2_000}, ${now})`)).toBe("");
    expect(p.run(`ageWords("${new Date(now - 47_000).toISOString()}", ${now})`)).toBe("47 s old");
    expect(p.run(`ageWords(${now - 125_000}, ${now})`)).toBe("2 min old");
    expect(p.run(`ageWords(${now - 2 * 3_600_000}, ${now})`)).toBe("from 09:00 New York");
    expect(p.run(`ageWords(undefined, ${now})`)).toBe("");
  });

  it("the bar's price says its age once it is not fresh, with where it is from on hover; a position's mark too; the ticket's summary the price it was valued at", () => {
    const p = page();
    p.set("A", pageOf([EX]));
    const box = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null, children: [], clientWidth: 9999, scrollWidth: 0 };
    p.set("BOX", box);
    p.run(`var PARTS = {}; var EL = { querySelector: (s) => (PARTS[s] = PARTS[s] || { innerHTML: "", querySelectorAll: () => [], children: [] }) };
      ttFitStats = () => {}; TT.item = ${JSON.stringify(ROW("coin", "BTC"))}; TT.at = { venue: "ex", symbol: "BTC/USDT" }; TT.mk = { kind: "spot", price: 60000, quoteFrom: "Kraken", quoteAt: new Date(Date.now() - 47000).toISOString() }; ttStats(EL)`);
    const stats = p.run<string>('PARTS["[data-tt-stats]"].innerHTML');
    expect(stats).toMatch(/60,000 <span class="tt-age" title="Kraken&#39;s price, 4\d s old">4\d s old<\/span>/);
    p.run("TT.mk = { ...TT.mk, quoteAt: new Date().toISOString() }; ttStats(EL)");
    expect(p.run<string>('PARTS["[data-tt-stats]"].innerHTML')).not.toContain("tt-age");
    expect(p.run<string>(`ttMarkAge({ native: { markAt: Date.now() - 90000 } })`)).toBe(' <span class="tt-age">1 min old</span>');
    expect(p.run<string>(`ttMarkAge({ native: {} })`)).toBe("");
    const prepared = { action: { side: "buy", qty: "0.001", orderType: "market" }, quote: { order: { kind: "spot", base: "BTC", quote: "USD", name: "BTC", price: 60010, notionalUsd: 60, maxUsd: 61, worstPrice: 61210, quoteFrom: "Kraken", quoteAt: new Date(Date.now() - 30_000).toISOString() } } };
    expect(p.run<string>(`tkOrderWords(${JSON.stringify(prepared)}, null)`)).toMatch(/<dt>Price<\/dt><dd>60,010 USD <span class="tk-age">Kraken, 3\d s old<\/span><\/dd>/);
  });
});

describe("what the page keeps is forgotten after an action, and a hung read is let go (feat/paper-live p0: P20)", () => {
  it("api() gives a read its time and answers as not reached after it — kept for nothing, asked again next time", async () => {
    const p = page();
    p.run("var CALLS = 0; fetch = () => (CALLS++, new Promise(() => {}))");
    const body = await p.run<Promise<{ ok: boolean; error: string }>>('api("/api/account/market?venue=x&symbol=y", { timeout: 30 })');
    expect(body).toEqual({ ok: false, error: "The account did not answer in 0 seconds." });
    expect(p.run('API.has("/api/account/market?venue=x&symbol=y")')).toBe(false);
    // the book and the bar take it as the account not answering, in the page's own words
    expect(p.run(`bkUnanswered(${JSON.stringify(body)})`)).toBe(true);
    await p.run<Promise<unknown>>('api("/api/account/market?venue=x&symbol=y", { timeout: 30 })');
    expect(p.run("CALLS")).toBe(2);
    // by default fifteen seconds
    expect(p.run("API_TIMEOUT_MS")).toBe(15_000);
  });

  it("a read on its way when an action went through answers its asker but is not kept: the next look asks the account again", async () => {
    const p = page();
    // the positions asked just before the order, answered just after it
    p.run("var CALLS = 0; var ANSWER = []; fetch = () => (CALLS++, new Promise((go) => ANSWER.push(go)))");
    p.run('var BEFORE = api("/api/account/positions", { ttl: 10000 })');
    p.run("afterAction()");
    p.run('ANSWER[0]({ json: async () => ({ ok: true, positions: [{ symbol: "BTC/USD", qty: 1 }] }) })');
    expect(await p.run<Promise<unknown>>("BEFORE")).toEqual({ ok: true, positions: [{ symbol: "BTC/USD", qty: 1 }] });
    expect(p.run('API.has("/api/account/positions")')).toBe(false);
    // the next look is the account's answer after the order, not the one from before it
    p.run('var AFTER = api("/api/account/positions", { ttl: 10000 })');
    expect(p.run("CALLS")).toBe(2);
    p.run('ANSWER[1]({ json: async () => ({ ok: true, positions: [] }) })');
    expect(await p.run<Promise<unknown>>("AFTER")).toEqual({ ok: true, positions: [] });
    expect(p.out('API.get("/api/account/positions").body')).toEqual({ ok: true, positions: [] });
    // one asked after the action is kept, as ever
    expect(await p.run<Promise<unknown>>('api("/api/account/positions", { ttl: 10000 })')).toEqual({ ok: true, positions: [] });
    expect(p.run("CALLS")).toBe(2);
  });

  it("an owner action that went through drops the statement and the positions kept; the account's read puts its own statement in their place", async () => {
    const p = page();
    p.run('API.set("/api/account/statement", { at: Date.now(), body: { lines: ["old"] } }); API.set("/api/account/positions", { at: Date.now(), body: {} })');
    p.run('Owner.act = async () => ({ status: 200, body: { kind: "account", summary: "done" } }); load = async () => {}; render = () => {}');
    await p.run<Promise<unknown>>('own({ type: "setWatch", venue: "ex", symbol: "BTC", on: "true" })');
    expect(p.out('[API.has("/api/account/statement"), API.has("/api/account/positions")]')).toEqual([false, false]);
    // a refusal changed nothing: nothing is dropped
    p.run('API.set("/api/account/statement", { at: Date.now(), body: { lines: ["old"] } }); Owner.act = async () => ({ status: 409, body: { ok: false, refusal: { message: "no" } } })');
    await p.run<Promise<unknown>>('own({ type: "setWatch", venue: "ex", symbol: "BTC", on: "true" })');
    expect(p.run('API.has("/api/account/statement")')).toBe(true);
    // load(): the statement it read is the one the history tabs read
    const core = source("ui/core.js");
    expect(core).toContain('if (st && st.ok) API.set("/api/account/statement", { at: Date.now(), body: stBody });');
  });
});

describe("a paper account the owner runs, from the page (feat/paper-live p0: B10)", () => {
  const BOOK = { venue: "paper-momentum", name: "Momentum · paper", cashUsd: 9542.1, startCashUsd: 10000, addedUsd: 0, createdAt: "2026-10-01T14:00:00.000Z", updatedAt: "2026-10-12T14:00:00.000Z", holdings: 1, positions: 0, open: 0 };

  it("the connect form says plainly that connecting continues a book kept on this machine, and offers to start it again instead", () => {
    const p = page();
    const words = p.run<string>(`cnBookWords(${JSON.stringify(BOOK)})`);
    expect(words).toContain("<b>Connecting continues the paper account kept on this machine as “Momentum · paper”</b> — $9,542.10 paper cash, 1 holding, started with $10,000.00 on Thu 1 Oct. The starting money above is not used.");
    expect(words).toContain('<input type="checkbox" name="fresh" /> Start it again instead, with the starting money above. Its book is archived beside it, not deleted.');
    // the choice signs the reset before the connection, which then opens the new book
    const connect = source("ui/connect.js");
    expect(connect.indexOf('Owner.act({ type: "resetPaper", venue: book.venue, usd: ref })')).toBeGreaterThan(0);
    expect(connect.indexOf('Owner.act({ type: "resetPaper"')).toBeLessThan(connect.indexOf('Owner.act({ type: "connectVenue"'));
    expect(connect).toContain('const got = await api("/api/account/paper/books");');
  });

  it("the paper account's own drawer adds paper money and starts it again, each prepared by the account and signed", () => {
    const p = page();
    p.set("A", pageOf([venue("paper-1", "Paper account", { paper: true, connector: "live:paper", plugged: true })]));
    p.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true }); var QD = []; quoteDialog = (o) => QD.push(o)');
    p.run('pfPaperDialog("paper-1", "topup"); pfPaperDialog("paper-1", "reset")');
    expect(p.out("QD.map((o) => [o.title, o.go])")).toEqual([["Add paper money to Paper account", "Sign and add"], ["Start Paper account again", "Sign and start again"]]);
    expect(p.run('QD[0].draft({ values: { usd: "" } })')).toBe("Type how much paper money to add.");
    expect(p.out('QD[0].draft({ values: { usd: "2,500" } })')).toEqual({ type: "topUpPaper", venue: "paper-1", usd: "2,500" });
    expect(p.out('QD[1].draft({ values: { usd: "" } })')).toEqual({ type: "resetPaper", venue: "paper-1", usd: "" });
    expect(p.run('QD[1].draft({ values: { usd: "lots" } })')).toBe("A number of dollars, like 25000.");
    expect(source("ui/portfolio.js")).toContain('${v.paper && v.connector === "live:paper" ? `${btn("topup", "Add paper money…")}${btn("reset", "Start again…")}` : ""}');
  });
});

describe("what the account pushes is drawn where it belongs, whatever is being typed in the ticket (feat/paper-live p1)", () => {
  const at = "2026-10-06T12:00:00.000Z";
  const PAPER = venue("paper-1", "Paper account", { paper: true, connector: "live:paper", usd: 10000, cashUsd: 10000, trade: { can: true, what: "spot", kinds: ["spot"], positions: true }, holdings: [{ asset: "USD", amount: 10000, usd: 10000, class: "cash", note: "paper money" }] });
  const ORDER = { id: "ord-0001", clientId: "c1", at, updatedAt: at, venue: "paper-1", venueName: "Paper account", symbol: "BTC/USD", name: "BTC / USD", kind: "spot", base: "BTC", side: "buy", type: "limit", qty: 0.01, filledQty: 0, limitPrice: 60010, price: 60010, usd: 600.1, status: "open", ref: "p1", authority: "owner", signer: "device:x", note: "", paper: true };

  it("a fill pushed while a ticket field has the focus: the order's row, the positions and the cash take it at once, the fill is said once, the tabs and Available are drawn in place — never the pane, the ticket or its field; the read after it lands behind the push and does not step the row back; the pane is drawn whole once the field lets go", async () => {
    const p = page();
    p.set("A", { ...pageOf([PAPER]), orders: [ORDER], signers: { owners: [], pendingDevices: [] } });
    const lagging = { ...pageOf([PAPER]), orders: [ORDER], signers: { owners: [], pendingDevices: [] } };
    p.run(`ROUTE.tab = "trade"; var DRAWN = []; var TOASTS = [];
      render = () => DRAWN.push("render"); renderChrome = () => DRAWN.push("chrome"); ttPushed = () => DRAWN.push("pushed");
      toast = (t, k) => TOASTS.push([typeof t === "object" ? t.html : t, k]);
      document.activeElement = { matches: (s) => s.startsWith("input:not"), closest: () => null };
      API.set("/api/account/positions", { at: Date.now(), body: { ok: true, positions: [{ venue: "ex", symbol: "ETH/USDT:USDT", qty: 1 }], missing: [] } });
      var LAGGING = ${JSON.stringify(lagging)}; var READS = [];
      fetch = async (path) => (READS.push(path), { status: 200, ok: true, json: async () => (path === "/api/account" ? JSON.parse(JSON.stringify(LAGGING)) : { ok: true, lines: [] }) });`);
    // a field of the ticket is being typed in: the 20-second read is held back
    expect(p.run("quiet()")).toBe(false);
    p.run(`stTell("order", ${JSON.stringify({ ...ORDER, status: "filled", filledQty: 0.01, avgPrice: 60010, feeUsd: 0.6 })})`);
    p.run(`stTell("fill", { venue: "paper-1", venueName: "Paper account", paper: true, ref: "p1", symbol: "BTC/USD", name: "BTC / USD", kind: "spot", side: "buy", qty: 0.01, price: 60010, feeUsd: 0.6, at: "${at}", clientId: "c1", filledQty: 0.01 })`);
    p.run(`stTell("position", { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "BTC/USD", position: { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "BTC/USD", name: "BTC / USD", kind: "spot", side: "long", qty: 0.01, markPrice: 60000, native: { markAt: 1 } } })`);
    p.run(`stTell("balance", { venue: "paper-1", venueName: "Paper account", paper: true, cashUsd: 9399.3 })`);
    expect(p.out("A.orders[0]")).toMatchObject({ id: "ord-0001", status: "filled", filledQty: 0.01, avgPrice: 60010 });
    // said once, as HL says a fill: side, size, market, price, where (the order's own state is no second toast)
    expect(p.out("TOASTS")).toEqual([["Bought 0.01 BTC / USD @ 60,010 · Paper account", "ok"]]);
    // and the order's own answer, had it come after, says it no more (core own: FILLS_SAID)
    expect(p.run('FILLS_SAID.has("c1|0.01")')).toBe(true);
    expect(p.out('API.get("/api/account/positions").body.positions.map((x) => [x.venue, x.symbol])')).toEqual([["ex", "ETH/USDT:USDT"], ["paper-1", "BTC/USD"]]);
    expect(p.out("[A.venues[0].holdings[0].usd, A.venues[0].usd, A.venues[0].cashUsd]")).toEqual([9399.3, 9399.3, 9399.3]);
    // drawn in place, in the frame after: the chrome and the trading area's tabs and Available — never the pane (the ticket and its field)
    expect(p.out("DRAWN")).toContain("pushed");
    expect(p.out("DRAWN")).toContain("chrome");
    expect(p.out("DRAWN")).not.toContain("render");
    // once for the burst, a little later, the account read again: it still has the order open (its door polls the book next) — the row
    // keeps what was pushed, and with the field still being typed in, only what moved is drawn
    await new Promise((r) => setTimeout(r, 150));
    expect(p.out("READS")).toEqual(["/api/account", "/api/account/statement"]);
    expect(p.out("A.orders[0]")).toMatchObject({ status: "filled", filledQty: 0.01 });
    expect(p.out("DRAWN")).not.toContain("render");
    expect(p.run("SH.late")).toBe(true);
    // the field let go: the next read is drawn whole
    p.run("document.activeElement = null; shPushedDraw()");
    expect(p.out("DRAWN.at(-1)")).toBe("render");
    // the push is kept while reads lag behind it; a read that caught up with it lets it go
    expect(p.run("SH.ahead.size")).toBe(1);
    p.run(`A = { ...A, orders: [{ ...A.orders[0], status: "filled", filledQty: 0.01 }] }; shAhead()`);
    expect(p.run("SH.ahead.size")).toBe(0);
  });

  it("an order's pushed state is laid into its row and never toasted; every fill comes as a fill of its own — a real venue's, a venue's own paper account's, an agent's that filled as it was placed — said once, at its own price ('avg' where only the order's average was known); a book started again lets go of what the page kept of it", () => {
    const p = page();
    const real = { ...ORDER, id: "ord-0002", clientId: "c2", venue: "ex", venueName: "Exchange", paper: undefined, qty: 0.5, type: "market", status: "open" };
    p.set("A", { ...pageOf([EX, PAPER]), orders: [real, ORDER] });
    p.run(`ROUTE.tab = "trade"; var TOASTS = []; render = () => {}; renderChrome = () => {}; ttPushed = () => {}; load = async () => {};
      toast = (t, k) => TOASTS.push(typeof t === "object" ? t.html : t);
      API.set("/api/account/statement", { at: Date.now(), body: { ok: true, lines: [] } }); API.set("/api/account/positions", { at: Date.now(), body: { ok: true, positions: [] } });`);
    // the account follows the real venue's order: its states, each with the fill it added (service.ts toldFill: 0.2 at 2,450.5, then the
    // 0.3 more at their own 2,451.3333 — not the order's running average of 2,451)
    const fill = (more: Record<string, unknown>) => ({ venue: "ex", venueName: "Exchange", ref: "p1", clientId: "c2", symbol: "BTC/USD", name: "BTC / USD", kind: "spot", side: "buy", order: "ord-0002", by: "owner", ...more });
    p.run(`stTell("order", ${JSON.stringify({ ...real, status: "partial", filledQty: 0.2, avgPrice: 2450.5 })})`);
    p.run(`stTell("fill", ${JSON.stringify(fill({ qty: 0.2, price: 2450.5, filledQty: 0.2 }))})`);
    p.run(`stTell("order", ${JSON.stringify({ ...real, status: "filled", filledQty: 0.5, avgPrice: 2451 })})`);
    p.run(`stTell("fill", ${JSON.stringify(fill({ qty: 0.3, price: 2451.3333, filledQty: 0.5 }))})`);
    p.run(`stTell("order", ${JSON.stringify({ ...ORDER, status: "filled", filledQty: 0.01 })})`);
    expect(p.out("A.orders.find((o) => o.id === 'ord-0002')")).toMatchObject({ status: "filled", filledQty: 0.5 });
    expect(p.out("TOASTS")).toEqual(["Bought 0.2 BTC / USD @ 2,450.5 · Exchange", "Bought 0.3 BTC / USD @ 2,451.3333 · Exchange"]);
    // a resting limit that fills at a venue's own paper account (Alpaca's paper account, Hyperliquid's testnet): paper, but not a book the
    // account keeps, so its fill comes from the account's door like a real venue's — and is said
    p.run(`stTell("fill", ${JSON.stringify(fill({ venue: "alpaca-paper", venueName: "Alpaca paper", paper: true, clientId: "c5", order: "ord-0005", symbol: "AAPL", name: "AAPL", kind: "stock", qty: 2, price: 231.5, filledQty: 2 }))})`);
    // an agent's order at a real venue that filled as it was placed — the page never held it — and one whose fill price only the order's
    // average gives
    p.run(`stTell("order", ${JSON.stringify({ ...real, id: "ord-0006", clientId: "c6", status: "filled", filledQty: 1, avgPrice: 2452, authority: "agent" })})`);
    p.run(`stTell("fill", ${JSON.stringify(fill({ clientId: "c6", order: "ord-0006", by: "agent", qty: 1, price: 2452, filledQty: 1 }))})`);
    p.run(`stTell("fill", ${JSON.stringify(fill({ clientId: "c7", order: "ord-0007", qty: 0.4, price: 2453, avg: true, filledQty: 0.9 }))})`);
    expect(p.out("TOASTS.slice(2)")).toEqual(["Bought 2 AAPL @ 231.5 · Alpaca paper", "Bought 1 BTC / USD @ 2,452 · Exchange", "Bought 0.4 BTC / USD @ 2,453 avg · Exchange"]);
    // the same fill told again (a resume, the order's own answer having said it) is said no more
    p.run(`stTell("fill", ${JSON.stringify(fill({ qty: 0.3, price: 2451.3333, filledQty: 0.5 }))})`);
    expect(p.run("TOASTS.length")).toBe(5);
    // an order the account has no record of yet (the book told it first) is left for the read that follows (the agent's above is the third)
    p.run(`stTell("order", { clientId: "zz", venue: "paper-1", status: "open", filledQty: 0 })`);
    expect(p.run("A.orders.length")).toBe(3);
    // the book started again: the statement, the positions and the holdings kept are let go; so is the statement on its own word
    p.run(`stTell("paper", { venue: "paper-1", reset: { archived: "book-x.json", at: "${at}" } })`);
    expect(p.out('[API.has("/api/account/statement"), API.has("/api/account/positions")]')).toEqual([false, false]);
  });

  it("a pushed position keeps the positions read's own age; an order or a book's word that moved nothing a read would bring (a trailing stop's stop, a queued order's note) is drawn in place and not read for", async () => {
    const p = page();
    const stop = { ...ORDER, id: "ord-0009", clientId: "c9", type: "trailing_stop", side: "sell", status: "open", stopPrice: 59000 };
    p.set("A", { ...pageOf([EX, PAPER]), orders: [stop], signers: { owners: [], pendingDevices: [] } });
    p.run(`ROUTE.tab = "trade"; var DRAWN = []; var READS = []; render = () => DRAWN.push("render"); renderChrome = () => DRAWN.push("chrome"); ttPushed = () => DRAWN.push("pushed");
      load = async () => { READS.push("load"); };
      var AT = Date.now() - 8_000;
      API.set("/api/account/positions", { at: AT, body: { ok: true, positions: [{ venue: "ex", symbol: "ETH/USDT:USDT", qty: 1, markPrice: 2400 }], missing: [] } });`);
    // a paper position pushed: laid in, the read's time kept — the real venue's mark is read again when that read is due, not ten seconds on
    p.run(`stTell("position", { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "BTC/USD", position: { venue: "paper-1", symbol: "BTC/USD", side: "long", qty: 0.01 } })`);
    expect(p.run('API.get("/api/account/positions").at === AT')).toBe(true);
    expect(p.out('API.get("/api/account/positions").body.positions.map((x) => x.symbol)')).toEqual(["ETH/USDT:USDT", "BTC/USD"]);
    await new Promise((r) => setTimeout(r, 120));
    expect(p.out("READS")).toEqual(["load"]);
    // the trailing stop's stop moved, then a queued order's note — nothing a read would bring: drawn in place, nothing read
    p.run(`stTell("order", ${JSON.stringify({ ...stop, stopPrice: 59200 })})`);
    p.run(`stTell("order", ${JSON.stringify({ ...stop, stopPrice: 59200, note: "waiting: the quote (60,100) is past the worst price" })})`);
    // the book said itself with what it held and its open orders as before (its first word since the page read is read for, once)
    p.run(`stTell("paper", { venue: "paper-1", holdings: 1, positions: 0, open: 1, cashUsd: 9400 })`);
    await new Promise((r) => setTimeout(r, 120));
    expect(p.out("READS")).toEqual(["load", "load"]);
    p.run(`stTell("paper", { venue: "paper-1", holdings: 1, positions: 0, open: 1, cashUsd: 9400 })`);
    await new Promise((r) => setTimeout(r, 120));
    expect(p.out("READS")).toEqual(["load", "load"]);
    expect(p.out("A.orders[0]")).toMatchObject({ stopPrice: 59200, note: "waiting: the quote (60,100) is past the worst price" });
    expect(p.out("DRAWN")).toContain("pushed");
    // the stop triggered and filled: its status moved, so the account is read again; so it is when the book's open orders change, or on a reset
    p.run(`stTell("order", ${JSON.stringify({ ...stop, stopPrice: 59200, status: "filled", filledQty: 0.01, avgPrice: 59190 })})`);
    await new Promise((r) => setTimeout(r, 120));
    expect(p.out("READS")).toEqual(["load", "load", "load"]);
    p.run(`stTell("paper", { venue: "paper-1", holdings: 0, positions: 0, open: 0, cashUsd: 9991.9 })`);
    await new Promise((r) => setTimeout(r, 120));
    expect(p.out("READS")).toHaveLength(4);
  });

  it("the top bar's New York clock moves on with the page between the account's reads (minutes apart while the stream is connected)", () => {
    const p = page();
    p.set("A", pageOf([EX]));
    p.run('var STAMP = { textContent: "" }; document.getElementById = (id) => (id === "stamp" ? STAMP : null); loadedAt = Date.now() - 90_000; drawStamp()');
    expect(p.run("STAMP.textContent")).toBe("Tue 6 Oct · 08:01 New York");
    // never read yet: the account's own time, as it said it
    p.run("loadedAt = 0; drawStamp()");
    expect(p.run("STAMP.textContent")).toBe("Tue 6 Oct · 08:00 New York");
  });

  it("a swap's sale that the shell already holds as filled (its push came while the wallet was still sending it) is taken at once: no wait, no read", async () => {
    const p = page();
    const sale = { ...ORDER, id: "ord-0011", clientId: "c11", side: "sell", type: "market", status: "open" };
    p.set("A", { ...pageOf([EX, PAPER]), orders: [{ ...sale, status: "filled", filledQty: 0.01, avgPrice: 60000 }] });
    p.run('var FETCHED = 0; fetch = () => (FETCHED++, new Promise(() => {}))');
    const t0 = Date.now();
    const got = await p.run<Promise<{ status: string; filledQty: number }>>(`tkFilled(${JSON.stringify(sale)}, () => true)`);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(JSON.parse(JSON.stringify(got))).toMatchObject({ id: "ord-0011", status: "filled", filledQty: 0.01 });
    expect(p.run("FETCHED")).toBe(0);
  });

  it("draws a pushed change into the tabs and the ticket's Available only, keys each row so it is drawn over its own, and puts the stream's dot in the terminal's foot", () => {
    const p = page();
    p.set("A", pageOf([EX, PAPER]));
    p.run(`ROUTE.tab = "trade"; var LOW = []; ttLow = () => LOW.push("tabs"); TK.refreshAvail = () => LOW.push("available"); tkTicket = () => LOW.push("ticket");
      var FRAME = { querySelector: (s) => (s === "[data-tp]" ? {} : null) }; document.getElementById = (id) => (id === "pane-trade" ? FRAME : null);`);
    p.run("ttPushed()");
    expect(p.out("LOW")).toEqual(["tabs", "available"]);
    // off the Trade pane, nothing
    p.run('ROUTE.tab = "portfolio"; LOW.length = 0; ttPushed()');
    expect(p.out("LOW")).toEqual([]);
    p.set("A", { ...pageOf([EX, PAPER]), orders: [ORDER] });
    expect(p.run(`tkOpenRow(${JSON.stringify(ORDER)}, true)`)).toMatch(/^<tr data-k="ord-0001">/);
    expect(source("ui/terminal.js")).toContain('<tr data-k="${esc(`${p.venue}|${p.symbol}`)}">');
    expect(p.run("ttFrame()")).toMatch(/<div class="tt-foot"><span class="tt-live" data-st-dot><\/span>/);
    // no event streams in this stand-in browser: the page reads the account by its polls, as before
    expect(p.run("stHealth()")).toBe("down");
  });
});

describe("the trading area names exactly the markets it shows, and draws what the account's stream pushes of them (feat/paper-live p2b)", () => {
  const PAPER = venue("paper-1", "Paper account", { paper: true, connector: "live:paper", usd: 10000, cashUsd: 10000, trade: { can: true, what: "spot and perpetuals", kinds: ["spot", "perp"], positions: true }, holdings: [] });
  /** a page whose stream is open: each list of markets it tells the account it follows kept (FOLLOWED), the bar's parts and the positions'
   * tab stand-ins that keep what is drawn into them */
  const live = () => {
    const q = page({ es: true });
    q.set("A", pageOf([EX, PAPER]));
    q.run(`var FOLLOWED = []; var APIS = 0; fetch = (url, init) => { if (url === "/api/account/stream/markets") FOLLOWED.push(JSON.parse(init.body).markets); return new Promise(() => {}); };
      var BOX = { innerHTML: "" }; var TAGS = { innerHTML: "" }; var SAID = { innerHTML: "" }; var FEED = { innerHTML: "", dataset: {}, setAttribute(k, v) { this[k] = v; } };
      var POSBOX = { innerHTML: "", isConnected: true, addEventListener() {} };
      var EL = { querySelector: (s) => (s === "[data-tt-stats]" ? BOX : s === "[data-tt-tags]" ? TAGS : s === "[data-tt-said]" ? SAID : s === "[data-tt-feed]" ? FEED : s === '[data-tt-tab="positions"]' ? POSBOX : null), querySelectorAll: () => [] };
      document.getElementById = (id) => (id === "pane-trade" ? EL : null);
      chMount = () => {}; chRelease = () => {}; bkMount = () => {}; bkRelease = () => {}; ttTabs = () => true; TK.got = {};
      TT.item = null; TT.at = null; TT.mk = null; TT.mounted = ""; TT.tab = "positions"; ROUTE.tab = "trade";`);
    q.run("stStart()");
    const es = FakeES.all.at(-1)!;
    es.open();
    return { q, es };
  };
  const BTC_PERP = { key: "perp:BTC", kind: "perp", base: "BTC", name: "BTC", tabs: [], at: [{ venue: "paper-1", venueName: "Paper account", symbol: "BTC-PERP", connected: true, canTrade: true, paper: true }] };
  const market = (more: Record<string, unknown> = {}) => ({ kind: "perp", base: "BTC", quote: "USDC", price: 81000, bid: 80999, ask: 81001, change24h: 1000, changePct24h: 1.25, fundingRate: 0.00001, volumeUsd24h: 2e9, quoteAt: new Date(Date.now() - 30_000).toISOString(), quoteFrom: "Hyperliquid", ...more });
  let seq = 0;
  // each quote's best bid and ask at a venue moment of its own, later than the last's (priceAt)
  const quote = (more: Record<string, unknown> = {}) => ({ key: "paper-1:BTC-PERP", venue: "paper-1", symbol: "BTC-PERP", source: "hyperliquid", bid: 82000, ask: 82002, mark: 82001.5, funding: 0.00002, at: new Date(Date.now() - 120).toISOString(), priceAt: new Date(Date.now() - 150 + ++seq).toISOString(), seenAt: new Date(Date.now() - 60).toISOString(), from: "Hyperliquid · live", live: true, seq, ...more });

  it("names the market showing, whole; while Positions shows, its positions' markets for their price alone; another market drops the last; another pane names none; back on Trade, them again", async () => {
    const { q } = live();
    q.run("ttPoll = () => {}");
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["paper-1:BTC-PERP"]);
    // the positions read lists three: the one showing is not named twice, the others for their price alone
    const pos = [
      { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "BTC-PERP", name: "BTC-PERP", kind: "perp", side: "long", qty: 0.1, entryPrice: 80000, markPrice: 81000, usd: 8100, unrealizedUsd: 100, leverage: 5, native: { paper: true, marginUsd: 1600 } },
      { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "ETH/USD", name: "ETH / USD", kind: "spot", side: "long", qty: 2, entryPrice: 2400, markPrice: 2500, usd: 5000, unrealizedUsd: 200, costUsd: 4800, native: { paper: true } },
      { venue: "ex", venueName: "Exchange", symbol: "SOL/USDT", name: "SOL / USDT", kind: "spot", side: "long", qty: 1, entryPrice: 150, markPrice: 151, usd: 151, unrealizedUsd: 1, native: {} },
    ];
    q.run(`api = async () => ({ ok: true, positions: ${JSON.stringify(pos)}, missing: [] }); ttPositions(POSBOX, true)`);
    await settle();
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["paper-1:BTC-PERP", "~paper-1:ETH/USD", "~ex:SOL/USDT"]);
    // another tab under the panels: the positions' marks are no longer shown, so no longer named
    q.run('TT.tab = "history"; ttFollow()');
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["paper-1:BTC-PERP"]);
    q.run('TT.tab = "positions"; ttFollow()');
    // another market: the last one dropped at once
    q.run(`ttSetMarket({ venue: "paper-1", symbol: "ETH/USD" }, { kind: "spot", base: "ETH", quote: "USD", price: 2500 })`);
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["paper-1:ETH/USD", "~paper-1:BTC-PERP", "~ex:SOL/USDT"]);
    // another pane: none; Trade again: the same (the page's route heard, as the shell tells every listener)
    const onRouteOf = "ROUTED.find((f) => String(f).includes('ttFollow'))";
    q.run(`ROUTE.tab = "markets"; ${onRouteOf}("markets", {}, true)`);
    expect(q.out("FOLLOWED.at(-1)")).toEqual([]);
    q.run(`ROUTE.tab = "trade"; ${onRouteOf}("trade", {}, true)`);
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["paper-1:ETH/USD", "~paper-1:BTC-PERP", "~ex:SOL/USDT"]);
    // a hidden tab closes its stream (the account lets go of all of them) and names them again on the stream it opens when shown
    q.run("document.hidden = true; stClose()");
    expect(q.run("stHealth()")).toBe("down");
    q.run("document.hidden = false; stOpen()");
    FakeES.all.at(-1)!.open();
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["paper-1:ETH/USD", "~paper-1:BTC-PERP", "~ex:SOL/USDT"]);
  });

  it("moves the bar with each pushed quote in the next frame — the price, bid and ask, funding, the change from the venue's own reference, tinted by its tick — reads the market only every thirty seconds while it comes, and says how the price comes and how old it is in the feed", () => {
    const { q, es } = live();
    q.run("var POLLS = 0; ttPoll = () => { POLLS++; }");
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    // before anything is pushed: the read's figures, and the feed says it is read (the stream does not carry it yet)
    expect(q.out<string>("BOX.innerHTML")).toContain("81,000");
    expect(q.out<string>("FEED.innerHTML")).toBe('<span class="tt-feed-w">Polling</span><span class="tt-feed-a">30 s</span>');
    expect(q.run("ttWaitMs()")).toBe(5_000);
    es.say("quote", quote());
    const bar = q.out<string>("BOX.innerHTML");
    // a perpetual's price is the middle of its pushed bid and ask; the change at it from the read's own reference (81,000 less 1,000)
    expect(bar).toContain(">82,001<");
    expect(bar).toContain("+2,001 / +2.50%");
    expect(bar).toContain("82,000 · 82,002");
    expect(bar).toContain("0.0020%");
    expect(bar).toContain("Hyperliquid · live");
    expect(bar).not.toContain("tt-age");
    // the feed: live, the price's age; on hover where it comes from
    expect(q.out<string>("FEED.innerHTML")).toMatch(/^<span class="tt-feed-w">Live<\/span><span class="tt-feed-a">0\.\d s<\/span>$/);
    expect(q.out("FEED.dataset.st")).toBe("connected");
    expect(q.out<string>("FEED.title")).toMatch(/^Live: Hyperliquid's own stream pushes this price as it moves; 0\.\d s since it last confirmed it\.$/);
    // the frame that drew it — the market's first quote on this stream, its word on it as it stands — counted nothing (ui/stream.js stDrawn)
    expect(q.run("stLag()")).toBeNull();
    // the market read only every thirty seconds while the pushes come
    expect(q.run("ttWaitMs()")).toBe(30_000);
    // a tick up, then down: the price tinted by the way it went — the tick up counted as it was drawn, and the feed then says, on hover,
    // how long pushed prices take
    es.say("quote", quote({ bid: 82010, ask: 82012 }));
    expect(q.out<string>("BOX.innerHTML")).toMatch(/<span class="tt-st-v tt-px up">82,011/);
    expect(q.out<{ n: number }>("stLag()").n).toBe(1);
    es.say("quote", quote({ bid: 81990, ask: 81992 }));
    expect(q.out<string>("BOX.innerHTML")).toMatch(/<span class="tt-st-v tt-px down">81,991/);
    expect(q.out<string>("FEED.title")).toMatch(/ Prices pushed reach this screen about \d+ ms after their venue's own moment \(the middle of the last 1; 95 in 100 within \d+ ms\)\.$/);
    // a read of the market newer than the pushed price stands over it
    q.run(`TT.mk = ${JSON.stringify(market({ price: 81500, quoteAt: new Date(Date.now() + 5_000).toISOString() }))}; ttStats(EL)`);
    expect(q.out<string>("BOX.innerHTML")).toContain(">81,500<");
    q.run(`TT.mk = ${JSON.stringify(market())}; ttStats(EL)`);
    // the stream says the market is not live there now: Quiet, its figures the read's again (with their age), and the read — set for
    // thirty seconds while the pushes came — brought forward to its own beat
    const polls = q.run<number>("POLLS");
    q.run("TT.pollAt = Date.now() + 30_000");
    es.say("quote", quote({ live: false }));
    expect(q.run<number>("POLLS")).toBe(polls + 1);
    expect(q.out<string>("FEED.innerHTML")).toMatch(/^<span class="tt-feed-w">Quiet<\/span>/);
    expect(q.out("FEED.dataset.st")).toBe("stale");
    expect(q.out<string>("BOX.innerHTML")).toContain('tt-px">81,000 <span class="tt-age"');
    expect(q.run("ttWaitMs()")).toBe(5_000);
    // the stream drops: Polling, in the page's own words why
    es.fail();
    expect(q.out<string>("FEED.innerHTML")).toMatch(/^<span class="tt-feed-w">Polling<\/span>/);
    expect(q.out<string>("FEED.title")).toMatch(/^Polling: the account's stream is not connected, so this market's price is read every few seconds; the price showing is \d+ s old\.$/);
    // the feed's words, as they are said
    expect(q.out("[ttAgeShort(420), ttAgeShort(999), ttAgeShort(12_400), ttAgeShort(185_000), ttAgeShort(7_300_000)]")).toEqual(["0.4 s", "0.9 s", "12 s", "3 min", "2 h"]);
    expect(q.out("ttChangeAt(110, 105, 5, 5)")).toEqual({ abs: 10, pct: 10 });
    expect(q.out("ttChangeAt(110, 105, undefined, 5)")).toEqual({ abs: 10, pct: 10 });
    expect(q.out("ttChangeAt(110, 105)")).toBeNull();
    // the change at the market's own places: by its price step where it says one, else by the places of the prices beside it — never the
    // tail of a difference or of the venue's own change figure
    expect(q.out('[ttChangeFig(2027.934895, 0.01, [84453.28]), ttChangeFig(10, 0.01), ttChangeFig(2027.934895, undefined, [84453.28, 84453.3]), ttChangeFig(0.002031455, undefined, [0.08321, 0.0832]), ttChangeFig(1.5, undefined, [221]), ttChangeFig(0.004567, undefined, [250]), ttChangeFig(0.00204, undefined, [0.08295]), ttChangeFig(0.002016, undefined, [0.082928]), ttChangeFig(1.5), ttChangeFig(NaN)]')).toEqual(["2,027.93", "10.00", "2,027.93", "0.002031", "1.5", "0.004567", "0.00204", "0.002016", "1.5", "—"]);
    q.run(`TT.mk = ${JSON.stringify(market({ price: 84453.28, bid: 84453.2, ask: 84453.36, change24h: 2027.934895, changePct24h: 2.4612, priceStep: 0.01 }))}; ttStats(EL)`);
    expect(q.out<string>("BOX.innerHTML")).toContain("+2,027.93 / +2.46%");
    q.run(`TT.mk = ${JSON.stringify(market({ price: 84453.28, bid: 84453.2, ask: 84453.36, change24h: -2027.934895, changePct24h: -2.3466 }))}; ttStats(EL)`);
    expect(q.out<string>("BOX.innerHTML")).toContain("−2,027.93 / −2.35%");
    q.run(`TT.mk = ${JSON.stringify(market())}; ttStats(EL)`);
    // the feed's box in the bar, at its right end; under 560 pixels its word goes to the hover and its dot and age stay
    expect(q.run<string>("ttFrame()")).toMatch(/data-tt-stats><\/div>\s*<span class="tt-feed" data-tt-feed role="status" aria-live="off"><\/span>\s*<\/div>/);
    const css = source("ui/terminal.css");
    expect(css).toMatch(/\.tt-feed-a \{ display: inline-block; min-width: 6ch;[^}]*font-variant-numeric: tabular-nums; \}/);
    expect(css).toMatch(/@container tt \(max-width: 559px\) \{[\s\S]*\.tt-feed-w \{ display: none; \}/);
  });

  it("a pushed word with no price and no moment in it (the account's { live: false }: the stream carries the market and has no quote of it now — a US share at the weekend, or one only Cboe prices) is no quote: the feed says Polling with the price's own age, never Quiet with none", () => {
    const { q, es } = live();
    q.run("ttPoll = () => {}");
    const AAPL = { key: "stock:AAPL", kind: "stock", base: "AAPL", name: "Apple Inc", tabs: [], at: [{ venue: "paper-1", venueName: "Paper account", symbol: "AAPL", connected: true, canTrade: true, paper: true }] };
    const line = { kind: "stock", base: "AAPL", quote: "USD", price: 341.81, quoteAt: new Date(Date.now() - 15 * 60_000 - 5_000).toISOString(), delayMs: 900_000, quoteFrom: "Cboe · 15 min delayed" };
    q.run(`ttSetItem(${JSON.stringify(AAPL)}, "stocks"); ttSetMarket({ venue: "paper-1", symbol: "AAPL" }, ${JSON.stringify(line)})`);
    es.say("quote", { key: "paper-1:AAPL", venue: "paper-1", symbol: "AAPL", source: "cboe", live: false });
    expect(q.out("stQuoteOf('paper-1', 'AAPL')")).toMatchObject({ live: false });
    expect(q.out<string>("FEED.innerHTML")).toBe('<span class="tt-feed-w">Polling</span><span class="tt-feed-a">15 min</span>');
    expect(q.out("FEED.dataset.st")).toBe("down");
    expect(q.out<string>("FEED.title")).toBe("Polling: the account's stream has no quote of this market just now, so its price is read every few seconds; the price showing is 15 min old.");
    // the background reader's quote, once it has one, is said as it comes: Nasdaq's asked for, its stamp its last trade's
    es.say("quote", { key: "paper-1:AAPL", venue: "paper-1", symbol: "AAPL", source: "cboe", bid: 342.4, ask: 342.6, last: 342.5, at: new Date(Date.now() - 20_000).toISOString(), seenAt: new Date(Date.now() - 20_000).toISOString(), from: "Nasdaq · real time", delayMs: 0, askedEveryMs: 5_000, live: true, seq: 7 });
    expect(q.out<string>("FEED.innerHTML")).toBe('<span class="tt-feed-w">Live</span><span class="tt-feed-a">20 s</span>');
    expect(q.out<string>("FEED.title")).toBe("Live: the account asks Nasdaq for its real-time quote about every 5 s and pushes it here as it moves; Nasdaq stamps it with its last trade, to the minute — this one 20 s ago.");
  });

  it("never shows the last market's pushed price as the one picked now: another market, or the same one at another venue, is drawn from its own figures at once — the bar and the feed — before the chart and the book are mounted on it", () => {
    const { q, es } = live();
    q.run("ttPoll = () => {}");
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    es.say("quote", quote());
    expect(q.out<string>("BOX.innerHTML")).toContain(">82,001<");
    expect(q.out<string>("FEED.innerHTML")).toMatch(/^<span class="tt-feed-w">Live<\/span>/);
    // every word the bar and the feed are given from now on, kept
    q.run(`var DRAWN = []; var FED = []; for (const [box, list] of [[BOX, DRAWN], [FEED, FED]]) { let h = box.innerHTML; Object.defineProperty(box, "innerHTML", { get: () => h, set: (v) => { h = v; list.push(v); } }); }`);
    // another market, no account chosen for it yet: its row's figures, never the last market's pushed price
    const ETH = { key: "perp:ETH", kind: "perp", base: "ETH", name: "ETH", price: 2500, changePct24h: 1, tabs: [], at: [{ venue: "paper-1", venueName: "Paper account", symbol: "ETH-PERP", connected: true, canTrade: true, paper: true }] };
    q.run(`ttSetItem(${JSON.stringify(ETH)}, "perps")`);
    expect(q.out<string[]>("DRAWN").length).toBeGreaterThan(0);
    expect(q.out<string[]>("DRAWN").some((h) => /82,00[0-2]|Hyperliquid · live/.test(h))).toBe(false);
    expect(q.out<string>("BOX.innerHTML")).toContain(">2,500<");
    expect(q.out<string[]>("FED").some((h) => h.includes(">Live<"))).toBe(false);
    expect(q.out<string>("FEED.innerHTML")).not.toContain(">Live<");
    // back on BTC at the paper account and pushed again; then the same market at another venue (the ticket's pick): the bar is drawn with
    // that venue's market as read, never the paper account's pushed price, its funding or its source
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    es.say("quote", quote());
    expect(q.out<string>("BOX.innerHTML")).toContain(">82,001<");
    q.run("DRAWN.length = 0; FED.length = 0");
    q.run(`ttSetMarket({ venue: "ex", symbol: "BTC/USDT" }, ${JSON.stringify({ kind: "spot", base: "BTC", quote: "USDT", price: 80500, bid: 80499, ask: 80501, changePct24h: 0.5, quoteFrom: "Exchange", quoteAt: new Date().toISOString() })})`);
    expect(q.out<string[]>("DRAWN").length).toBeGreaterThan(0);
    expect(q.out<string[]>("DRAWN").some((h) => /82,00[0-2]|Hyperliquid · live|0\.0020%/.test(h))).toBe(false);
    expect(q.out<string>("BOX.innerHTML")).toContain(">80,500<");
    expect(q.out<string[]>("FED").some((h) => h.includes(">Live<"))).toBe(false);
    // and it follows that market now, in place of the last
    expect(q.out("FOLLOWED.at(-1)")).toEqual(["ex:BTC/USDT"]);
  });

  it("reads the bar's market on its own beat once the stream says it is not live there, however many such words keep coming — never put back by the next", async () => {
    const { q, es } = live();
    // the page's clock and its timers, run by the test
    q.run(`var NOW = Date.now(); Date.now = () => NOW; var T = [];
      setTimeout = (fn, ms) => (T.push({ fn, at: NOW + (Number(ms) || 0), gone: false }), T.length);
      clearTimeout = (id) => { if (T[id - 1]) T[id - 1].gone = true; };
      var READS = []; api = async (path) => { if (String(path).startsWith("/api/account/market?")) READS.push(NOW); return { ok: true, market: ${JSON.stringify(market())} }; };`);
    const tick = async (ms: number) => {
      q.run(`NOW += ${ms}`);
      for (;;) {
        const due = q.run<number>("T.findIndex((t) => !t.gone && t.at <= NOW)");
        if (due < 0) break;
        await q.run<Promise<void>>(`(T[${due}].gone = true, Promise.resolve(T[${due}].fn()))`);
        await settle();
      }
    };
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    const pushed = (more: Record<string, unknown> = {}) => es.say("quote", quote({ at: new Date(q.run<number>("NOW")).toISOString(), seenAt: new Date(q.run<number>("NOW")).toISOString(), ...more }));
    // the pushes come: after the beat's next read the market is read only every thirty seconds
    pushed();
    await tick(5_000);
    pushed();
    expect(q.run<number[]>("READS")).toHaveLength(1);
    expect(q.run<number>("TT.pollAt - NOW")).toBe(30_000);
    // then a word a second that the market is not live there (Hyperliquid's mark and trades before its first bbo after a reconnect)
    const first = q.run<number>("NOW") + 1_000;
    for (let i = 0; i < 8; i++) {
      await tick(1_000);
      pushed({ live: false });
    }
    const reads = q.run<number[]>("READS");
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads[1]! - first).toBeLessThanOrEqual(5_000);
    q.run("stClose()");
  });

  it("says nothing in the feed once no market is showing (Change in the ticket): never the last market's Live beside Pick a market", () => {
    const { q, es } = live();
    q.run("ttPoll = () => {}");
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    es.say("quote", quote());
    expect(q.out<string>("FEED.innerHTML")).toMatch(/^<span class="tt-feed-w">Live<\/span>/);
    q.run("ttSetItem(null)");
    expect(q.out<string>("BOX.innerHTML")).toBe("");
    expect(q.out<string>("FEED.innerHTML")).toBe("");
    expect(q.out("FOLLOWED.at(-1)")).toEqual([]);
  });

  it("sets aside the bar's figures that do not fit only when what it shows changed shape: a pushed price that moved by a tick is drawn with the same set aside, measuring nothing", () => {
    const { q, es } = live();
    q.run("ttPoll = () => {}");
    // a strip whose figures fit (its scrollWidth, counted each time it is read: each read lays the page out)
    q.run(`var FIT = 0; var KIDS = [{ dataset: { ttDrop: "8", k: "st:Bid · Ask" }, hidden: false }, { dataset: { ttDrop: "7", k: "st:24h volume" }, hidden: false }]; Object.assign(BOX, { clientWidth: 500 }); Object.defineProperty(BOX, "children", { get: () => KIDS }); Object.defineProperty(BOX, "scrollWidth", { get: () => (FIT++, 0) });`);
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    es.say("quote", quote());
    const measured = q.run<number>("FIT");
    // the next two ticks: the same figures, as long — nothing measured
    es.say("quote", quote({ bid: 82004, ask: 82006 }));
    es.say("quote", quote({ bid: 82008, ask: 82010 }));
    expect(q.run("FIT")).toBe(measured);
    // a figure longer by a character: measured again
    es.say("quote", quote({ bid: 100000, ask: 100002 }));
    expect(q.run<number>("FIT")).toBeGreaterThan(measured);
  });

  it("moves each position's mark, value, PNL and ROE with its market's pushed price, from the positions last read — nothing asked for it — never with an older price than the row's own", async () => {
    const { q, es } = live();
    q.run("ttPoll = () => {}");
    q.run(`ttSetItem(${JSON.stringify(BTC_PERP)}, "perps"); ttSetMarket({ venue: "paper-1", symbol: "BTC-PERP" }, ${JSON.stringify(market())})`);
    const pos = [
      { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "BTC-PERP", name: "BTC-PERP", kind: "perp", side: "long", qty: 0.1, entryPrice: 80000, markPrice: 81000, usd: 8100, unrealizedUsd: 100, leverage: 5, liquidationPrice: 64400, native: { paper: true, marginUsd: 1600, markAt: Date.now() - 20_000 } },
      { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "ETH/USD", name: "ETH / USD", kind: "spot", side: "long", qty: 2, entryPrice: 2400, markPrice: 2500, usd: 5000, unrealizedUsd: 200, costUsd: 4800, native: { paper: true, markAt: Date.now() - 20_000 } },
    ];
    q.run(`var ASKED = 0; api = async (path) => (ASKED++, { ok: true, positions: ${JSON.stringify(pos)}, missing: [] }); ttPositions(POSBOX, true)`);
    await settle();
    let html = q.out<string>("POSBOX.innerHTML");
    // as read: their marks twenty seconds old (said), their ROE beside their PNL — the perpetual's on its margin, the coin's on its cost
    expect(html).toContain('<th class="r">PNL (ROE %)</th>');
    expect(html).toMatch(/data-k="paper-1\|BTC-PERP"[\s\S]*?Mark <\/span>81,000 <span class="tt-age">20 s old<\/span>/);
    expect(html).toContain('<span class="tt-roe up">(+6.25%)</span>');
    expect(html).toContain('<span class="tt-roe up">(+4.17%)</span>');
    const asked = q.run<number>("ASKED");
    // the coin's market pushed: its mark, its worth and its result at that price (its worth less its cost), the age gone
    es.say("quote", { key: "~paper-1:ETH/USD", venue: "paper-1", symbol: "ETH/USD", source: "coinbase", bid: 2599, ask: 2601, last: 2600, at: new Date(Date.now() - 100).toISOString(), seenAt: new Date(Date.now() - 50).toISOString(), from: "Coinbase · live", live: true, seq: 900 });
    html = q.out<string>("POSBOX.innerHTML");
    const eth = html.slice(html.indexOf('data-k="paper-1|ETH/USD"'));
    expect(eth).toContain("Mark </span>2,600</td>");
    expect(eth).toContain("$5,200");
    expect(eth).toContain("400");
    expect(eth).toContain('<span class="tt-roe up">(+8.33%)</span>');
    // the perpetual's: marked at the venue's mark, its result its move from the entry times its size, its ROE on its margin
    es.say("quote", quote({ mark: 82000 }));
    html = q.out<string>("POSBOX.innerHTML");
    const btc = html.slice(html.indexOf('data-k="paper-1|BTC-PERP"'), html.indexOf('data-k="paper-1|ETH/USD"'));
    expect(btc).toContain("Mark </span>82,000</td>");
    expect(btc).toContain('<span class="tt-roe up">(+12.50%)</span>');
    expect(btc).toContain("64,400");
    // nothing was asked for any of it
    expect(q.run("ASKED")).toBe(asked);
    // a pushed price older than the row's own mark is not laid over it
    expect(q.out(`ttLiveRow(${JSON.stringify({ ...pos[1], native: { markAt: Date.now() + 60_000 } })}).markPrice`)).toBe(2500);
    // no ROE where the margin is not known (a real venue's perpetual), a holding's on its entry where no cost is kept
    expect(q.run(`ttRoe(${JSON.stringify({ kind: "perp", unrealizedUsd: 5, native: {} })})`)).toBeUndefined();
    expect(q.run(`ttRoe(${JSON.stringify({ kind: "spot", qty: 1, entryPrice: 100, unrealizedUsd: 5, native: {} })})`)).toBe(5);
  });

  it("A PERPETUAL'S ROE IS THE VENUE'S OWN: Hyperliquid's returnOnEquity where it gives one, else over the margin the position was opened with — never over the margin held now, which on an isolated position carries its PNL (the three positions of live-hyperliquid-trade.test.ts's fixture)", () => {
    const { q } = live();
    const roe = (p: Record<string, unknown>) => q.run<number | undefined>(`ttRoe(${JSON.stringify(p)})`);
    // the fixture's clearinghouseState positions as live/hyperliquid-trade.ts maps them: BTC cross 3x, SOL isolated 3x, xyz:NVDA short isolated 5x
    const hl = [
      { symbol: "BTC", kind: "perp", side: "long", qty: 0.03973, entryPrice: 82980.4, markPrice: 3215.30917 / 0.03973, usd: 3215.30917, unrealizedUsd: -81.5029, leverage: 3, marginMode: "cross", marginUsd: 1071.769723, native: { unrealizedPnl: "-81.5029", returnOnEquity: "-0.074165192", marginUsed: "1071.769723" }, said: -7.4165192 },
      { symbol: "SOL", kind: "perp", side: "long", qty: 13.05, entryPrice: 114.8627, markPrice: 1393.218 / 13.05, usd: 1393.218, unrealizedUsd: -105.7408, leverage: 3, marginMode: "isolated", marginUsd: 392.601726, native: { unrealizedPnl: "-105.7408", returnOnEquity: "-0.2116284984", marginUsed: "392.601726" }, said: -21.16284984 },
      { symbol: "xyz:NVDA", kind: "perp", side: "short", qty: 1, entryPrice: 235, markPrice: 231.11, usd: 231.11, unrealizedUsd: 3.89, leverage: 5, marginMode: "isolated", marginUsd: 50, native: { unrealizedPnl: "3.89", returnOnEquity: "0.0827659574", marginUsed: "50.0" }, said: 8.27659574 },
    ];
    for (const { said, ...p } of hl) {
      // the venue's own figure, for the PNL it came with
      expect(roe(p)).toBeCloseTo(said, 6);
      // without it (a read that carried none): over the initial margin, the entry notional over the leverage — the same figure to 0.01%
      expect(roe({ ...p, native: {} })).toBeCloseTo(said, 2);
      // and never over the margin held now: SOL's would say −26.93%, NVDA's 7.78%
      expect(Math.abs(roe({ ...p, native: {} })! - (p.unrealizedUsd / p.marginUsd) * 100)).toBeGreaterThan(p.marginMode === "isolated" ? 0.4 : 0);
    }
    // a pushed price moved the PNL (ttLiveRow): the venue's figure is the read's, not this PNL's — reckoned over the initial margin at it
    const sol = { ...hl[1]!, unrealizedUsd: -50 };
    expect(roe(sol)).toBeCloseTo((-50 / ((13.05 * 114.8627) / 3)) * 100, 6);
    // a paper perpetual that paid 10 of funding out of its margin: its ROE over the margin it was opened with (1,600), not the 1,590 left
    expect(roe({ kind: "perp", side: "long", qty: 0.1, entryPrice: 80000, markPrice: 81000, usd: 8100, unrealizedUsd: 100, leverage: 5, marginUsd: 1590, fundingUsd: 10, native: { paper: true, marginUsd: 1590, fundingUsd: 10 } })).toBeCloseTo(6.25, 6);
  });
});

describe("feat/paper-live phase 4: the ticket follows the market, its summary says the fee, the liquidation and a queued open", () => {
  const MK = { symbol: "BTC/USDT", name: "BTC", kind: "spot", base: "BTC", quote: "USDT", price: 60000, bid: 59990, ask: 60010, priceStep: 0.1, open: true, types: ["market", "limit"], brackets: true, qtyStep: 0.00001, minNotional: 1 };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /* the ticket on BTC/USDT at the exchange, in the owner's browser: the account prepares an order at the price the test sets (PX), and the
     stream's quote of the market is the test's (QUOTE: none until set) */
  const ticket = async () => {
    const t = ticketPage();
    t.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    t.set("A", pageOf([{ ...EX, cashUsd: 1000, holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }] }]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(MK)} }; ANSWERS["/api/account/compare"] = { ok: false };
      var PREPARED = []; var PX = 60010; var QUOTE = null; var HOLD = null;
      stQuoteOf = () => QUOTE;
      load = async () => {};
      var prepareNow = (d) => ({ status: 200, body: { action: { ...d, qty: "0.001", maxNotional: d.usd, deadline: Date.now() + 600000, nonce: 1 }, shown: [], quote: { order: { words: "buy", name: "BTC", kind: "spot", base: "BTC", quote: "USDT", price: PX, notionalUsd: Number(d.usd), maxUsd: Number(d.usd), capUsd: 250, feeUsd: Number(d.usd) / 1000, feeBps: 10 } } } });
      Owner.prepare = (d) => { PREPARED.push([d.usd, PX, d.limitPrice, d.takeProfit]); return HOLD ? new Promise((go) => { HOLD = () => go(prepareNow(d)); }) : Promise.resolve(prepareNow(d)); };`);
    t.set("ITEM", ROW("coin", "BTC"));
    t.run('TK.kind = "crypto"; tkTicket(PANEL, "crypto", { venue: "ex", symbol: "BTC/USDT", side: "buy", item: ITEM })');
    await settle();
    return t;
  };
  const type = (t: Awaited<ReturnType<typeof ticket>>, name: string, v: string) => {
    t.field(name).value = v;
    t.field(name).dispatchEvent({ type: "input" });
  };

  it("a perpetual's block says the mark, the oracle and the funding the stream pushes now — never the read's from when the ticket opened beside the bar's live ones — and the read's again once the stream is not live", async () => {
    const PERP = { symbol: "BTC-PERP", name: "BTC perpetual on Hyperliquid", kind: "perp", base: "BTC", quote: "USDC", price: 82383.5, bid: 82383, ask: 82384, markPrice: 82384, oraclePrice: 82414.9, fundingRate: 0.0000125, fundingEveryH: 1, maxLeverage: 40, priceStep: 1, qtyStep: 0.00001, minNotional: 10, open: true, types: ["market", "limit"], quoteAt: new Date().toISOString() };
    const t = ticketPage();
    t.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    t.set("A", pageOf([{ ...EX, cashUsd: 1000, holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }] }]));
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(PERP)} }; ANSWERS["/api/account/compare"] = { ok: false };
      var QUOTE = null; stQuoteOf = () => QUOTE; load = async () => {}; Owner.prepare = () => new Promise(() => {});`);
    t.set("ITEM", ROW("perp", "BTC", { at: [{ venue: "ex", venueName: "Exchange", symbol: "BTC-PERP", connected: true, canTrade: true, public: false, price: 82383.5 }] }));
    t.run('TK.kind = "perps"; tkTicket(PANEL, "perps", { venue: "ex", symbol: "BTC-PERP", side: "buy", item: ITEM })');
    await settle();
    const block = () => String(t.part("[data-kb]").innerHTML);
    expect(block()).toContain("Mark 82,384 USDC · oracle 82,414.9");
    expect(block()).toContain("Funding 0.0013% an hour");
    // the stream pushes the market: the block's mark, oracle and rate are the push's
    t.run(`QUOTE = { venue: "ex", symbol: "BTC-PERP", bid: 82390, ask: 82391, mark: 82391.5, oracle: 82420.1, funding: 0.000015, live: true, seenAt: new Date().toISOString() }; stTell("quote", QUOTE)`);
    await settle();
    expect(block()).toContain("Mark 82,391.5 USDC · oracle 82,420.1");
    expect(block()).toContain("Funding 0.0015% an hour");
    // the stream not live there now (its venue's socket down): the read's figures again, never the last push's standing as now
    t.run(`QUOTE = { ...QUOTE, live: false }; stTell("quote", QUOTE)`);
    await settle();
    expect(block()).toContain("Mark 82,384 USDC · oracle 82,414.9");
    // a push older than the market's own read is not laid over it
    t.run(`QUOTE = { ...QUOTE, live: true, seenAt: new Date(Date.now() - 60000).toISOString() }; stTell("quote", QUOTE)`);
    await settle();
    expect(block()).toContain("Mark 82,384 USDC");
  });

  it("works out an exit's price from a percent and back, and Mid and BBO from the book's top — on the market's step, the side's own way", () => {
    const p = page();
    // a buy's take-profit above the entry, its stop-loss under; a sell's the other way round
    expect(p.out('[tkExitPrice(60000, "5", { buy: true, tp: true, step: 0.1 }), tkExitPrice(60000, "2", { buy: true, tp: false, step: 0.1 }), tkExitPrice(60000, "5", { buy: false, tp: true, step: 0.1 }), tkExitPrice(60000, "2", { buy: false, tp: false, step: 0.1 })]')).toEqual(["63000", "58800", "57000", "61200"]);
    expect(p.out('[tkExitPrice(60010, "3.3", { buy: true, tp: true, step: 0.5 }), tkExitPrice(0, "5", { buy: true, tp: true }), tkExitPrice(60000, "", { buy: true, tp: true }), tkExitPrice(60000, "150", { buy: true, tp: false })]')).toEqual(["61990.5", "", "", ""]);
    expect(p.out('[tkExitPct(60000, "63000", { buy: true, tp: true }), tkExitPct(60000, "58800", { buy: true, tp: false }), tkExitPct(60000, "57000", { buy: false, tp: true }), tkExitPct(60000, "", { buy: true, tp: true })]')).toEqual(["5", "2", "5", ""]);
    // Mid: the middle, a buy's down to the step and a sell's up, so it never crosses the book; BBO: the best price on the order's own side
    const top = { bid: 59990.1, ask: 60010.4 };
    expect(p.out(`[tkTopPrice("mid", ${JSON.stringify(top)}, { side: "buy", step: 0.5 }), tkTopPrice("mid", ${JSON.stringify(top)}, { side: "sell", step: 0.5 }), tkTopPrice("bbo", ${JSON.stringify(top)}, { side: "buy", step: 0.5 }), tkTopPrice("bbo", ${JSON.stringify(top)}, { side: "sell", step: 0.5 })]`)).toEqual([60000, 60000.5, 59990.1, 60010.4]);
    // no book's top known, or a crossed one: nothing to write
    expect(p.out('[tkTopPrice("mid", { bid: 0, ask: 60010 }, { side: "buy" }), tkTopPrice("bbo", { bid: 60020, ask: 60010 }, { side: "buy" })]')).toEqual([null, null]);
  });

  it("says the fee (the venue's own figure and rate where it gave one, else that it charges it), a perpetual's estimated liquidation price, and a share queued for the open — never the worst price as if it filled now", () => {
    const p = page();
    const prep = (order: Record<string, unknown>, action: Record<string, unknown> = {}) => ({ action: { venue: "paper-1", side: "buy", orderType: "market", qty: "0.1", ...action }, quote: { order: { name: "BTC perpetual", kind: "perp", base: "BTC", quote: "USDC", price: 60000, notionalUsd: 6000, maxUsd: 6120, worstPrice: 61200, ...order } } });
    const words = (order: Record<string, unknown>, o: Record<string, unknown> = {}, action: Record<string, unknown> = {}) => p.run<string>(`tkOrderWords(${JSON.stringify(prep(order, action))}, null, ${JSON.stringify(o)})`);
    const perp = words({ feeUsd: 6, feeBps: 10, liquidationPrice: 50526.315789, leverage: 5 }, { lev: 3, venueName: "Momentum" });
    expect(perp).toContain('<div><dt>Fee</dt><dd>$6.00 <span class="tk-qsub">0.10%</span></dd></div>');
    expect(perp).toContain("<div><dt>Est. liquidation price</dt><dd>50,526.31579 USDC</dd></div>");
    // the margin at the leverage the venue's own estimate stands at (5x), not the one held before it
    expect(perp).toContain("<dt>Margin required</dt><dd>$1,200.00 at 5x</dd>");
    // a venue that says nothing of its fee before the order: that it charges it, in its name — and no liquidation price it did not give
    const real = words({}, { lev: 3, venueName: "Hyperliquid" });
    expect(real).toContain('<div><dt>Fee</dt><dd><span class="tk-qsub">as Hyperliquid charges it</span></dd></div>');
    expect(real).not.toContain("liquidation");
    expect(real).toContain("<dt>Margin required</dt><dd>$2,000.00 at 3x</dd>");
    // a share's market order out of its session: queued for the open, filled at the open's price — and still bounded by what is signed, so
    // "Most it may cost" and the worst price stay: an open past them cancels it (live/paper.ts judge)
    const queued = words({ kind: "stock", base: "AAPL", quote: "USD", queued: true, feeUsd: 0, feeBps: 0 });
    expect(queued).toContain("<dt>Queued for the open</dt><dd><span class=\"tk-qsub\">fills at the open's price, never past what you sign: an open past it cancels it</span></dd>");
    expect(queued).toContain("<dt>Most it may cost</dt><dd>$6,120.00</dd>");
    expect(queued).toContain("<dt>Fills no worse than</dt><dd>61,200 USD</dd>");
    expect(queued).toContain('<dt>Fee</dt><dd>$0.00 <span class="tk-qsub">0.00%</span></dd>');
    // a coin, now: the most it may cost and its worst price as before
    const now = words({ kind: "spot", feeUsd: 6, feeBps: 10 });
    expect(now).toContain("<dt>Most it may cost</dt>");
    expect(now).toContain("<dt>Fills no worse than</dt>");
  });

  it("FOLLOWS THE MARKET (P8): a pushed quote moves the placeholder, the book's top in its block and Mid/BBO at once, and once the market moved and the estimate is three seconds old it is prepared again QUIETLY — Sign kept on the order shown until the new one replaces it", async () => {
    const t = await ticket();
    expect(t.field("limitPrice").placeholder).toBe("60010");
    expect(t.part("[data-px-btns]").hidden).toBe(false);
    type(t, "amount", "100");
    await wait(420);
    await settle();
    expect(t.out("PREPARED").length).toBe(1);
    expect(t.part("[data-go]").disabled).toBe(false);
    // the stream pushes the market: the placeholder, the block's bid and ask follow — nothing is prepared again while the estimate is fresh
    t.run(`QUOTE = { venue: "ex", symbol: "BTC/USDT", bid: 61000, ask: 61020, last: 61010, live: true, seenAt: new Date().toISOString() }; stTell("quote", QUOTE)`);
    await settle();
    expect(t.field("limitPrice").placeholder).toBe("61020");
    expect(String(t.part("[data-kb]").innerHTML)).toContain("Bid 61,000 · ask 61,020 USDT");
    expect(t.out("PREPARED").length).toBe(1);
    // the ticket's two headline prices follow it too — the market picked and the account picked under Where — never the Markets row's
    // price from when it was picked (10, in this row)
    expect(t.part("[data-picked] .tk-rp .tab-nums").textContent).toBe("$61,010");
    expect(t.part('[data-where] button.tk-at[aria-pressed="true"] [data-at-px]').textContent).toBe("$61,010");
    // three seconds on (the page's clock moved): the next push prepares it again, quietly — the button never off while it is asked
    t.run("var REAL_NOW = Date.now; Date.now = () => REAL_NOW() + 3500; PX = 61020; HOLD = () => {}");
    t.run("stTell('quote', QUOTE)");
    await settle();
    expect(t.out("PREPARED").length).toBe(2);
    expect(t.part("[data-go]").disabled).toBe(false);
    expect(String(t.part("[data-q]").innerHTML)).not.toContain("Asking");
    t.run("HOLD()");
    await settle();
    expect(String(t.part("[data-q]").innerHTML)).toContain("Fee");
    expect(t.part("[data-go]").disabled).toBe(false);
    // the market did not move since: a push asks nothing more
    t.run("Date.now = () => REAL_NOW() + 8000; HOLD = null; stTell('quote', QUOTE)");
    await settle();
    expect(t.out("PREPARED").length).toBe(2);
    // the bar's read of the market (no push now): laid into the ticket's market, the placeholder follows it
    t.run(`QUOTE = null; TK.marketRead({ venue: "ex", symbol: "BTC/USDT" }, ${JSON.stringify({ ...MK, bid: 61500, ask: 61520, price: 61510 })})`);
    await settle();
    expect(t.field("limitPrice").placeholder).toBe("61520");
    expect(t.part("[data-picked] .tk-rp .tab-nums").textContent).toBe("$61,510");
    // another market's read changes nothing
    t.run(`TK.marketRead({ venue: "ex", symbol: "ETH/USDT" }, ${JSON.stringify({ ...MK, symbol: "ETH/USDT", ask: 2000 })})`);
    expect(t.field("limitPrice").placeholder).toBe("61520");
    // a read no longer now (its own moment forty seconds back, nothing pushed): the headline prices say how old they are, and the limit
    // has no placeholder from it
    t.run(`TK.marketRead({ venue: "ex", symbol: "BTC/USDT" }, { ...${JSON.stringify({ ...MK, price: 61510 })}, quoteAt: new Date(Date.now() - 40_000).toISOString() })`);
    await settle();
    expect(t.part("[data-picked] .tk-rp .tab-nums").textContent).toBe("$61,510 · 40 s old");
    expect(t.part('[data-where] button.tk-at[aria-pressed="true"] [data-at-px]').textContent).toBe("$61,510 · 40 s old");
    expect(t.field("limitPrice").placeholder).toBe("");
  });

  it("THE HEADLINE WITH NOTHING TYPED follows the market too: a pushed quote moves its price, and a market read no longer now says its age — a share whose only quote is Cboe's says how far behind it is", async () => {
    const t = await ticket();
    // drawn with the line, then set in place as the market moves
    const head = () => t.part("[data-q-px]").textContent;
    // with no stream the market as read (its moment unsaid: as now as it was read)
    expect(String(t.part("[data-q]").innerHTML)).toContain('<div class="big"><span>BTC</span><span data-q-px>60,000 USDT</span></div><div class="path">Type an amount.</div>');
    t.run(`QUOTE = { venue: "ex", symbol: "BTC/USDT", bid: 61000, ask: 61020, last: 61010, live: true, seenAt: new Date().toISOString() }; stTell("quote", QUOTE)`);
    await settle();
    expect(head()).toBe("61,010 USDT");
    // the stream gone, the market as read forty seconds ago: its age said
    t.run(`QUOTE = null; TK.marketRead({ venue: "ex", symbol: "BTC/USDT" }, { ...${JSON.stringify({ ...MK, price: 61510 })}, quoteAt: new Date(Date.now() - 40_000).toISOString() })`);
    await settle();
    expect(head()).toBe("61,510 USDT · 40 s old");
    // Cboe's quote, fifteen minutes behind the market: its age and its delay
    t.run(`TK.marketRead({ venue: "ex", symbol: "BTC/USDT" }, { ...${JSON.stringify({ ...MK, price: 61510 })}, quoteAt: new Date(Date.now() - 16 * 60_000).toISOString(), delayMs: 900000 })`);
    await settle();
    expect(head()).toBe("61,510 USDT · 16 min old, 15 min delayed");
  });

  it("MID AND BBO ONLY AT A TOP THAT IS NOW: a share priced by Cboe alone (15 minutes behind) offers neither, nor a placeholder or a percent's entry from it; a market read before the stream went down gives them up as it ages — a live push brings them back", async () => {
    const t = ticketPage();
    t.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true })');
    t.set("A", pageOf([{ ...EX, cashUsd: 1000, holdings: [{ asset: "USDT", amount: 1000, usd: 1000, class: "stable" }] }]));
    // NVDA as the public stocks line gives it when Cboe alone prices it: its bid and ask Cboe's, its moment sixteen minutes ago, its delay said
    const cboe = { symbol: "NVDA", name: "NVIDIA", kind: "stock", base: "NVDA", quote: "USD", price: 181.2, bid: 181.18, ask: 181.22, priceStep: 0.01, open: true, types: ["market", "limit"], qtyStep: 0.000001, quoteAt: new Date(Date.now() - 16 * 60_000).toISOString(), quoteFrom: "Cboe · 15 min delayed", delayMs: 900_000 };
    t.run(`ANSWERS["/api/account/market?venue=ex"] = { ok: true, market: ${JSON.stringify(cboe)} }; ANSWERS["/api/account/compare"] = { ok: false }; var QUOTE = null; stQuoteOf = () => QUOTE; load = async () => {}; Owner.prepare = () => new Promise(() => {});`);
    t.set("ITEM", ROW("stock", "NVDA", { at: [{ venue: "ex", venueName: "Exchange", symbol: "NVDA", connected: true, canTrade: true, public: false, price: 181.2 }] }));
    t.run('TK.kind = "stocks"; tkTicket(PANEL, "stocks", { venue: "ex", symbol: "NVDA", side: "buy", item: ITEM })');
    await settle();
    expect(t.part("[data-px-btns]").hidden).toBe(true);
    expect(t.field("limitPrice").placeholder).toBe("");
    // the same delayed figures read again, now with their stamp a second old: still Cboe's, fifteen minutes behind — never now
    t.run(`TK.marketRead({ venue: "ex", symbol: "NVDA" }, ${JSON.stringify({ ...cboe, quoteAt: new Date().toISOString() })})`);
    await settle();
    expect(t.part("[data-px-btns]").hidden).toBe(true);
    // a real-time quote pushed live: Mid and BBO from it, the placeholder its ask
    t.run(`QUOTE = { venue: "ex", symbol: "NVDA", bid: 181.5, ask: 181.52, last: 181.51, live: true, delayMs: 0, seenAt: new Date().toISOString() }; stTell("quote", QUOTE)`);
    await settle();
    expect(t.part("[data-px-btns]").hidden).toBe(false);
    expect(t.field("limitPrice").placeholder).toBe("181.52");
    // the stream says it is not live there now, and the market as read is Cboe's: nothing is now again
    t.run(`QUOTE = { ...QUOTE, live: false }; stTell("quote", QUOTE)`);
    await settle();
    expect(t.part("[data-px-btns]").hidden).toBe(true);
    expect(t.field("limitPrice").placeholder).toBe("");
    // a real-time read (no delay) is now while it is a few seconds old — and goes out of date by itself: once older than TK_TOP_LIVE_MS,
    // with no read or push since, Mid and BBO are taken away
    expect(t.run("TK_TOP_LIVE_MS")).toBe(8_000);
    t.run(`TK.marketRead({ venue: "ex", symbol: "NVDA" }, ${JSON.stringify({ ...cboe, bid: 181.4, ask: 181.44, quoteAt: new Date(Date.now() - 7_850).toISOString(), quoteFrom: "Robinhood", delayMs: 0 })})`);
    await settle();
    expect(t.part("[data-px-btns]").hidden).toBe(false);
    expect(t.field("limitPrice").placeholder).toBe("181.44");
    await wait(400);
    await settle();
    expect(t.part("[data-px-btns]").hidden).toBe(true);
    expect(t.field("limitPrice").placeholder).toBe("");
  });

  it("Mid and BBO write the limit (the order becomes a limit, Sign off until it is prepared for it); a percent typed writes its exit's price and a price its percent; Sell signs in red", async () => {
    const t = await ticket();
    type(t, "amount", "100");
    await wait(420);
    await settle();
    expect(t.part("[data-go]").dataset.side).toBe("buy");
    // Mid pressed: a press on its own button, heard by the buttons' row
    const press = (which: string) => {
      const row = t.part("[data-px-btns]");
      const b = Object.assign(stub("button", row), { dataset: { px: which } });
      b.closest = () => b;
      b.dispatchEvent({ type: "click" });
    };
    press("mid");
    expect([t.field("orderType").value, t.field("limitPrice").value]).toEqual(["limit", "60000"]);
    expect(t.part("[data-go]").disabled).toBe(true);
    press("bbo");
    expect(t.field("limitPrice").value).toBe("59990");
    await wait(420);
    await settle();
    expect(t.out("PREPARED").at(-1)[2]).toBe("59990");
    // the exits, counted from the limit: 5% gain writes the take-profit, a price typed writes its percent
    t.field("tpsl").checked = true;
    t.field("tpsl").dispatchEvent({ type: "change" });
    type(t, "tpPct", "5");
    expect(t.field("takeProfit").value).toBe("62989.5");
    type(t, "stopLoss", "56990.5");
    expect(t.field("slPct").value).toBe("5");
    await wait(420);
    await settle();
    expect(t.out("PREPARED").at(-1)[3]).toBe("62989.5");
    // Sell: the button in the sell colour (trade.css), and the BBO is the best ask
    t.run("[...SEGS.values()].at(-1)('sell')");
    expect(t.part("[data-go]").dataset.side).toBe("sell");
    press("bbo");
    expect(t.field("limitPrice").value).toBe("60010");
    const css = source("ui/trade.css");
    expect(css).toContain('.tt-order [data-go][data-side="sell"] { background: var(--hl-sell); color: var(--hl-on-trade); }');
    expect(css).toContain('.tt-order [data-go][data-side="buy"] { background: var(--hl-buy); color: var(--hl-on-trade); }');
    expect(css).toContain('.tt-order [data-go][data-side="sell"]:disabled { background: var(--hl-down-disabled);');
    expect(source("ui/tokens.css")).toContain("--hl-down-disabled:");
  });

  it("folds a venue's long rule in the face's block under one line, and says a short one as it is", () => {
    const p = page();
    const long = "a paper account: ".padEnd(450, "x");
    expect(p.run(`tkNoteHtml(${JSON.stringify(long)})`)).toBe(`<details class="tk-kbnote"><summary>How it fills here</summary><p>${long}</p></details>`);
    expect(p.run('tkNoteHtml("Kraken: maker 0.25%")')).toBe("Kraken: maker 0.25%");
  });
});

describe("feat/paper-live phase 4: the tables, the chart's lines, the address, the picker, Cancel all and paper onboarding", () => {
  const PERP_POS = { venue: "paper-1", venueName: "Paper account", paper: true, symbol: "BTC-PERP", name: "BTC-PERP", kind: "perp", side: "long", qty: 0.1, entryPrice: 80000, markPrice: 81000, usd: 8100, unrealizedUsd: 100, leverage: 5, marginMode: "isolated", liquidationPrice: 64400, marginUsd: 1600, fundingUsd: 1.25, native: { paper: true } };
  const order = (id: string, more: Record<string, unknown>) => ({ id, clientId: `c-${id}`, venue: "paper-1", venueName: "Paper account", symbol: "BTC-PERP", name: "BTC-PERP", kind: "perp", base: "BTC", side: "sell", type: "limit", qty: 0.1, filledQty: 0, status: "open", at: "2026-10-16T14:05:09.000Z", price: 0, usd: 0, ...more });
  const TRADE1 = { can: true, what: "everything", kinds: ["spot", "perp"], positions: true, amend: true };
  const PAPER1 = venue("paper-1", "Paper account", { paper: true, trade: TRADE1 });

  it("Positions: a perpetual's margin with its mode, its funding since it opened (paid: a cost), its TP/SL from the exits resting on the closing side — and grey rows while the first read is on its way, never 'nothing held'", async () => {
    const p = page();
    p.set("A", { ...pageOf([PAPER1]), orders: [order("ord-1", { exitOf: { order: "ord-0", kind: "take-profit" }, reduceOnly: true, limitPrice: 90000 }), order("ord-2", { type: "stop", exitOf: { order: "ord-0", kind: "stop-loss" }, reduceOnly: true, stopPrice: 76000 }), order("ord-3", { side: "buy", limitPrice: 70000 })] });
    p.run('var POSBOX = { innerHTML: "", isConnected: true, heard: [], addEventListener(t, f) { if (t === "click") this.heard.push(f); }, contains: () => true }');
    p.run(`var HELD = null; api = (path) => new Promise((go) => { HELD = () => go({ ok: true, positions: [${JSON.stringify(PERP_POS)}], missing: [] }); }); TT.tab = "positions"; ttPositions(POSBOX, true)`);
    const loading = p.out<string>("POSBOX.innerHTML");
    expect(loading).toContain('<div class="tt-load" role="status" aria-busy="true"><span class="sr">Reading the positions…</span>');
    expect(loading).not.toContain("Nothing held");
    p.run("HELD()");
    await settle();
    const html = p.out<string>("POSBOX.innerHTML");
    expect(html).toContain('<th class="r">Liq. price</th><th class="r">Margin</th><th class="r" title="Funding since the position opened, where the venue keeps it: a cost when the position paid it, a gain when it received it">Funding</th><th class="r">TP/SL</th>');
    expect(html).toContain('<td class="r tt-c-margin">$1,600.00<span class="why">Isolated</span></td>');
    expect(html).toMatch(/<td class="r tt-c-fund" title="\$1\.25 paid in funding since it opened">.*1\.25.*<\/td>/);
    // the take-profit and the stop-loss resting on the closing side; the buy limit is not an exit of a long
    expect(html).toContain('<td class="r tt-c-tpsl"><span class="tt-k">TP/SL </span>90,000 / 76,000</td>');
    // the chart's lines read the same positions
    expect(p.out("TT.posRead.positions.length")).toBe(1);
    // a short's exits are buys that only close: the plain buy limit resting there is no exit of it (none: dashes); a real venue's position with
    // no margin or funding said, and a funding figure not from a book that keeps its sign: dashes too
    expect(p.out(`ttExitsOf(${JSON.stringify({ ...PERP_POS, side: "short" })})`)).toEqual({});
    expect(p.out(`[ttMarginOf(${JSON.stringify({ native: {} })}), ttFundingOf(${JSON.stringify({ native: { fundingUsd: 3 } })}), ttFundingOf(${JSON.stringify({ native: { paper: true, fundingUsd: -2 } })})]`)).toEqual([null, null, -2]);
  });

  it("the histories: each row's day and minute on the screen's one clock, its whole date to the second on hover, fifty rows, then Load more fifty at a time — and grey rows before their first read", async () => {
    const p = page();
    p.set("A", pageOf([PAPER1]));
    const lines = Array.from({ length: 120 }, (_, i) => ({ type: "trade", key: `order:c${i}`, id: `ord-${i}`, account: "paper-1", accountName: "Paper account", paper: true, kind: "buy", status: "filled", amountUsd: -10, worthUsd: 10, description: `Buy 0.001 BTC · BTC-PERP · market · at 60,000`, at: new Date(Date.UTC(2026, 9, 16, 14, 5, 9) - i * 60_000).toISOString() }));
    p.run('var HBOX = { innerHTML: "", isConnected: true, heard: [], addEventListener(t, f) { if (t === "click") this.heard.push(f); }, contains: () => true }');
    p.run(`var HELD = null; api = (path) => new Promise((go) => { HELD = () => go({ ok: true, lines: ${JSON.stringify(lines)} }); }); TT.tab = "history"; ttHistory(HBOX)`);
    expect(p.out<string>("HBOX.innerHTML")).toContain("Reading the trades…");
    p.run("HELD()");
    await settle();
    let html = p.out<string>("HBOX.innerHTML");
    const rowsOf = (h: string) => (h.split("<tbody>")[1]?.match(/<tr>/g) || []).length;
    expect(rowsOf(html)).toBe(50);
    // a row's few characters (the table stays inside its panel at 1440), its whole moment on hover
    expect(html).toContain(`<td class="tab-nums nw" title="${p.run<string>('yourClock("2026-10-16T14:05:09.000Z")')}">${p.run<string>('yourClock("2026-10-16T14:05:09.000Z", { year: false, seconds: false })')}</td>`);
    expect(p.run('yourClock(Date.UTC(2026, 9, 16, 14, 5, 9), { year: false, seconds: false })')).toMatch(/^\d{1,2} [A-Z][a-z]{2,3} \d\d:\d\d$/);
    expect(html).toContain('<button type="button" class="link tt-more" data-tt-more data-fk="tt-more">Load 50 more</button><span class="dim small">50 of 120</span>');
    // Load more: fifty more, from the statement kept (asked of the page's cache, not drawn twice)
    p.run("api = async () => ({ ok: true, lines: " + JSON.stringify(lines) + " }); HBOX.heard[0]({ target: { closest: () => ({}) } })");
    await settle();
    html = p.out<string>("HBOX.innerHTML");
    expect(rowsOf(html)).toBe(100);
    expect(html).toContain("Load 20 more</button><span class=\"dim small\">100 of 120</span>");
    // the one clock: a whole date to the second, on the viewer's own clock; the head says whose
    // HL's form, no weekday: the Time column stays narrow ("16 Oct 2026 14:05:09")
    expect(p.run('yourClock(Date.UTC(2026, 9, 16, 14, 5, 9), { date: true })')).toMatch(/^\d{1,2} [A-Z][a-z]{2,3} 2026 \d\d:\d\d:09$/);
    expect(p.run('yourClock("not a time")')).toBe("—");
    expect(p.run("ttTimeTh()")).toMatch(/^<th title="On your clock: .+">Time<\/th>$/);
    expect(p.run('yourZoneWords("Asia/Hong_Kong")')).toBe("Hong Kong time");
    expect(p.run('yourZoneWords("UTC")')).toBe("UTC");
    // the book's trades say their times on the same clock
    expect(p.run('bkClock("2026-10-16T14:05:09.000Z")')).toBe(p.run('yourClock("2026-10-16T14:05:09.000Z", { date: false })'));
  });

  it("draws the account's own lines for the market showing — a limit, a stop and a stop-limit's two, a trailing stop's stop now, a bracket's TP and SL, the position's entry and liquidation — draggable only where the order changes in place, and a line let go opens its change to be signed", () => {
    const p = page();
    const orders = [
      order("ord-1", { limitPrice: 85000 }),
      order("ord-2", { type: "stop", stopPrice: 76000, exitOf: { order: "ord-0", kind: "stop-loss" }, reduceOnly: true }),
      order("ord-3", { type: "limit", limitPrice: 90000, exitOf: { order: "ord-0", kind: "take-profit" }, reduceOnly: true }),
      order("ord-4", { type: "stop_limit", side: "buy", stopPrice: 82000, limitPrice: 82100, qty: 0.2, filledQty: 0.05 }),
      order("ord-5", { type: "trailing_stop", stopPrice: 78500 }),
      order("ord-6", { limitPrice: 99000, status: "filled" }),
      order("ord-7", { limitPrice: 99000, symbol: "ETH-PERP" }),
      order("ord-8", { limitPrice: 98000, canceling: true }),
    ];
    p.set("A", { ...pageOf([PAPER1]), orders });
    const lines = p.out<Array<Record<string, unknown>>>(`ttLinesFor({ venue: "paper-1", symbol: "BTC-PERP" }, A.orders, [${JSON.stringify(PERP_POS)}], true)`);
    expect(lines).toEqual([
      { id: "ord-1:limit", ref: "ord-1", price: 85000, kind: "sell", label: "Limit Sell 0.1", short: "Sell 0.1", drag: "limitPrice" },
      { id: "ord-2:stop", ref: "ord-2", price: 76000, kind: "sl", label: "SL 0.1", short: "SL 0.1", drag: "stopPrice" },
      { id: "ord-3:limit", ref: "ord-3", price: 90000, kind: "tp", label: "TP 0.1", short: "TP 0.1", drag: "limitPrice" },
      { id: "ord-4:stop", ref: "ord-4", price: 82000, kind: "buy", label: "Stop Buy 0.15", short: "Stop 0.15", drag: "stopPrice" },
      { id: "ord-4:limit", ref: "ord-4", price: 82100, kind: "buy", label: "Stop-limit Buy 0.15", short: "Stop 0.15", drag: "limitPrice" },
      { id: "ord-5:trail", ref: "ord-5", price: 78500, kind: "trail", label: "Trailing Sell 0.1", short: "Trail 0.1" },
      { id: "pos:entry", price: 80000, kind: "entry", label: "Long 0.1 · entry", short: "Entry" },
      { id: "pos:liq", price: 64400, kind: "liq", label: "Liq. price", short: "Liq." },
    ]);
    // a browser that only looks, or a venue that changes nothing in place: drawn, never draggable
    expect(p.out<Array<Record<string, unknown>>>(`ttLinesFor({ venue: "paper-1", symbol: "BTC-PERP" }, A.orders, [], false)`).some((l) => "drag" in l)).toBe(false);
    p.set("A", { ...pageOf([{ ...PAPER1, trade: { ...TRADE1, amend: false } }]), orders });
    expect(p.out<Array<Record<string, unknown>>>(`ttLinesFor({ venue: "paper-1", symbol: "BTC-PERP" }, A.orders, [], true)`).some((l) => "drag" in l)).toBe(false);
    // let go at 86,000: the order's change opens there, to be prepared and signed — nothing is changed by the drag
    p.set("A", { ...pageOf([PAPER1]), orders });
    p.run('Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true }); var OPENED = []; openAmend = (o, init) => OPENED.push([o.id, init]); var ACTED = []; Owner.act = async (d) => (ACTED.push(d), {})');
    p.run('ttLineDragged({ id: "ord-1:limit", ref: "ord-1", drag: "limitPrice", price: 85000 }, 86000)');
    expect(p.out("OPENED")).toEqual([["ord-1", { limitPrice: 86000 }]]);
    expect(p.out("ACTED")).toEqual([]);
    // an order gone meanwhile, or a browser that only looks: nothing opens
    p.run('ttLineDragged({ id: "ord-9:limit", ref: "ord-9", drag: "limitPrice", price: 1 }, 2); Object.defineProperty(Owner, "role", { get: () => "viewer", configurable: true }); ttLineDragged({ id: "ord-1:limit", ref: "ord-1", drag: "limitPrice", price: 85000 }, 86000)');
    expect(p.out("OPENED").length).toBe(1);
  });

  it("the change a dragged line opens is the signed amend with the new price already in its field — saying nothing changes until it is signed", () => {
    const p = page();
    p.set("A", { ...pageOf([PAPER1]), orders: [] });
    p.run("var SHEET_ARGS = null; quoteDialog = (o) => (SHEET_ARGS = o, { form: {}, requote() {} })");
    p.run(`openAmend(${JSON.stringify(order("ord-1", { limitPrice: 85000 }))}, { limitPrice: 86000 })`);
    expect(p.out<string>("SHEET_ARGS.fields")).toContain('<input name="limitPrice" inputmode="decimal" placeholder="85000" value="86000" autocomplete="off" />');
    expect(p.out<string>("SHEET_ARGS.sub")).toContain("Moved on the chart: nothing changes until you sign.");
    expect(p.out<string>("SHEET_ARGS.go")).toBe("Sign and change");
    // the Change button's own sheet: nothing typed for the owner
    p.run(`openAmend(${JSON.stringify(order("ord-1", { limitPrice: 85000 }))})`);
    expect(p.out<string>("SHEET_ARGS.fields")).not.toContain("value=");
  });

  it("writes the market, its kind and the chart's range and bar size into the address in place — a reload or a link comes back to them — and mounts the chart on the range and bar size an address names", () => {
    const p = page();
    p.set("A", pageOf([PAPER1]));
    p.run('var REPLACED = []; history.replaceState = (s, t, h) => { REPLACED.push(h); location.hash = h; }; ROUTE.tab = "trade"; TK.kind = "perps"; TT.at = { venue: "paper-1", symbol: "BTC-PERP" }; TT.range = "3M"; TT.interval = "4h"; ttUrl()');
    expect(p.out("REPLACED")).toEqual(["#/trade?kind=perps&venue=paper-1&symbol=BTC-PERP&range=3M&iv=4h"]);
    // the route naming it opens nothing again: the ticket is on it
    expect(p.out("TK.routed")).toBe(JSON.stringify(["perps", "paper-1", "BTC-PERP", "", ""]));
    // the same again writes nothing; no account chosen: the kind alone; another pane: nothing
    p.run("ttUrl(); TT.at = null; ttUrl()");
    expect(p.out("REPLACED")).toEqual(["#/trade?kind=perps&venue=paper-1&symbol=BTC-PERP&range=3M&iv=4h", "#/trade?kind=perps&range=3M&iv=4h"]);
    p.run('ROUTE.tab = "markets"; TT.range = "1Y"; ttUrl()');
    expect(p.out("REPLACED").length).toBe(2);
    // A VENUE GONE FROM THE ACCOUNT (paper-1 disconnected while its market showed): the address no longer names it — a reload would ask the
    // account for an account it does not have
    p.run('ROUTE.tab = "trade"; TT.range = "3M"; TT.at = { venue: "paper-9", symbol: "BTC-PERP" }; ttUrl()');
    expect(p.out<string[]>("REPLACED").at(-1)).toBe("#/trade?kind=perps&range=3M&iv=4h");
    // and an address that names one (a link from before the disconnect): the same symbol at a paper account of yours that trades it, said
    // quietly where it does not list it; no paper account: the kind alone, at rest — never the venue that is gone
    expect(p.out('tkRouteVenue({ kind: "perps", venue: "paper-9", symbol: "BTC-PERP", side: "" })')).toEqual({ kind: "perps", venue: "paper-1", symbol: "BTC-PERP", side: "", quiet: true });
    expect(p.out('tkRouteVenue({ kind: "perps", venue: "paper-1", symbol: "BTC-PERP" })')).toEqual({ kind: "perps", venue: "paper-1", symbol: "BTC-PERP" });
    expect(p.out('tkRouteVenue({ kind: "crypto", symbol: "BTC/USD" })')).toEqual({ kind: "crypto", symbol: "BTC/USD" });
    p.set("A", pageOf([EX]));
    expect(p.out('tkRouteVenue({ kind: "perps", venue: "paper-9", symbol: "BTC-PERP" })')).toEqual({ kind: "perps", rest: true });
    // the market showing cleared (nothing could be opened, or Change): the address drops it at once
    p.set("A", pageOf([PAPER1]));
    p.run('TT.at = { venue: "paper-1", symbol: "BTC-PERP" }; ttUrl(); ttSetItem(null)');
    expect(p.out<string[]>("REPLACED").slice(-2)).toEqual(["#/trade?kind=perps&venue=paper-1&symbol=BTC-PERP&range=3M&iv=4h", "#/trade?kind=perps&range=3M&iv=4h"]);
    // A SHARE WHOSE MARKET THE TICKET HAS NOT READ THERE (its market shut, the ticket's read refused): the address that named it at a paper
    // account keeps naming it, so a reload comes back to it and not to the kind's first market; a market showing that does not list the
    // named venue and symbol, or a venue not on the account, is never kept
    p.run('ROUTE.tab = "trade"; TK.kind = "stocks"; TT.range = "5Y"; TT.interval = "1w"; TT.at = null; ROUTE.params = { kind: "stocks", venue: "paper-1", symbol: "AAPL" }; TT.item = { key: "stocks:AAPL", base: "AAPL", at: [{ venue: "cboe", symbol: "AAPL", public: true }, { venue: "paper-1", symbol: "AAPL" }] }; ttUrl()');
    expect(p.out<string[]>("REPLACED").at(-1)).toBe("#/trade?kind=stocks&venue=paper-1&symbol=AAPL&range=5Y&iv=1w");
    p.run('ROUTE.params = { kind: "stocks", venue: "paper-1", symbol: "NVDA" }; ttUrl()');
    expect(p.out<string[]>("REPLACED").at(-1)).toBe("#/trade?kind=stocks&range=5Y&iv=1w");
    p.run('ROUTE.params = { kind: "stocks", venue: "paper-9", symbol: "AAPL" }; TT.item.at.push({ venue: "paper-9", symbol: "AAPL" }); ttUrl()');
    expect(p.out<string[]>("REPLACED").at(-1)).toBe("#/trade?kind=stocks&range=5Y&iv=1w");
    // A MARKET NAMED AT AN ACCOUNT A RESTART HAS NOT BROUGHT BACK YET: waited for while the account restores (never routed to another
    // account, never dropped from the address); once restoring is over, an account still missing is routed as before
    p.run('TT.item = null; ROUTE.params = {}; A.restore = { state: "restoring", venues: [], skipped: [], orders: 0, payments: 0 }; TK.pending = { kind: "stocks", venue: "paper-7", symbol: "AAPL", side: "", outcome: "" }; ttUrl()');
    expect(p.out("tkWaitsForRestore(TK.pending)")).toBe(true);
    expect(p.out<string[]>("REPLACED").at(-1)).toBe("#/trade?kind=stocks&venue=paper-7&symbol=AAPL&range=5Y&iv=1w");
    expect(p.out('tkWaitsForRestore({ kind: "stocks", venue: "paper-1", symbol: "AAPL" })')).toBe(false);
    p.run('A.restore = { state: "done", venues: [], skipped: [], orders: 0, payments: 0 }');
    expect(p.out("tkWaitsForRestore(TK.pending)")).toBe(false);
    p.run("TK.pending = null; A.restore = null");
    p.run('TT.item = null; TK.kind = "perps"; TT.range = "3M"; TT.interval = "4h"');
    p.run('ROUTE.tab = "markets"; TT.range = "1Y"');
    // an address that names a range and a bar size: the chart mounts on them
    p.run('drawPane = () => {}; TT.range = ""; TT.interval = ""; location.hash = "#/trade?kind=crypto&range=5Y&iv=1w"; routed()');
    expect(p.out("[TT.range, TT.interval]")).toEqual(["5Y", "1w"]);
    p.run('location.hash = "#/trade?range=10Y&iv=2m"; routed()');
    expect(p.out("[TT.range, TT.interval]")).toEqual(["5Y", "1w"]);
  });

  it("writes the chart's indicators into the address and this browser's storage, reads them back from an address (which wins over the storage), and shrugs off a browser that refuses its storage", () => {
    const p = page();
    p.set("A", pageOf([PAPER1]));
    p.run('var REPLACED = []; history.replaceState = (s, t, h) => { REPLACED.push(h); location.hash = h; }; var STORE = {}; localStorage = { getItem: (k) => STORE[k] ?? null, setItem: (k, v) => { STORE[k] = String(v); }, removeItem: (k) => { delete STORE[k]; } }');
    p.run('ROUTE.tab = "trade"; TK.kind = "perps"; TT.at = { venue: "paper-1", symbol: "BTC-PERP" }; TT.range = "3M"; TT.interval = "4h"; TT.ind = "sma:20,rsi:14"; ttUrl()');
    expect(p.out<string[]>("REPLACED").at(-1)).toBe("#/trade?kind=perps&venue=paper-1&symbol=BTC-PERP&range=3M&iv=4h&ind=sma%3A20%2Crsi%3A14");
    // the chart's keeper (ui/chart.js onIndicators, as ttMount wires it): the list kept here and in the address; none kept once cleared
    p.run('ttIndKeep("sma:20,rsi:14")');
    expect(p.out('[STORE["account.chart.indicators"], ttIndStored()]')).toEqual(["sma:20,rsi:14", "sma:20,rsi:14"]);
    p.run('ttIndKeep("")');
    expect(p.out('["account.chart.indicators" in STORE, ttIndStored()]')).toEqual([false, ""]);
    // an address that names them (junk in it dropped) wins over the storage, and the storage keeps them from then on
    p.run('drawPane = () => {}; STORE["account.chart.indicators"] = "ema:50"; TT.ind = ""; location.hash = "#/trade?kind=crypto&range=5Y&iv=1w&ind=sma%3A20%2Cfoo%2Crsi%3A14"; routed()');
    expect(p.out('[TT.ind, STORE["account.chart.indicators"]]')).toEqual(["sma:20,rsi:14", "sma:20,rsi:14"]);
    // an address that names none leaves them
    p.run('location.hash = "#/trade?kind=crypto&range=1Y"; routed()');
    expect(p.out("TT.ind")).toBe("sma:20,rsi:14");
    // a browser that refuses its storage
    p.run('localStorage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } }');
    expect(p.out('(ttIndKeep("sma:20"), ttIndStored())')).toBe("");
  });

  it("stars a market in this browser's picker (kept per kind, nothing signed), lists the starred first, and moves through the picker by the keys — ↓ from the search, ↑ ↓ Home End between markets, S to star", async () => {
    const p = page();
    p.set("A", pageOf([EX]));
    p.run("var STORE = {}; localStorage = { getItem: (k) => STORE[k] ?? null, setItem: (k, v) => { STORE[k] = String(v); }, removeItem: (k) => { delete STORE[k]; } }; toast = () => {}");
    const btc = ROW("coin", "BTC");
    expect(p.out(`tkStarToggle(tkStarOf(${JSON.stringify(btc)}, "crypto"))`)).toBe(true);
    expect(p.out('tkStars("crypto")')).toMatchObject([{ kind: "crypto", key: "coin:BTC", name: "BTC", base: "BTC" }]);
    expect(p.out('[tkStarred("crypto", "coin:BTC"), tkStarred("perps", "coin:BTC")]')).toEqual([true, false]);
    // a row starred carries its star pressed; the Starred list's row opens it
    p.run(`TK.got = { crypto: { at: Date.now(), items: [${JSON.stringify(btc)}] } }`);
    const row = p.out<{ fk: string; star: { key: string } }>('tkStarRow(tkStars("crypto")[0], "crypto")');
    expect(row.fk).toBe("star:coin:BTC");
    // off again; storage that is off keeps nothing and breaks nothing
    expect(p.out(`tkStarToggle(tkStarOf(${JSON.stringify(btc)}, "crypto"))`)).toBe(false);
    expect(p.out('tkStars("crypto")')).toEqual([]);
    p.run('localStorage = { getItem() { throw new Error("off"); }, setItem() { throw new Error("off"); } }');
    expect(p.out(`[tkStarToggle(tkStarOf(${JSON.stringify(btc)}, "crypto")), tkStars("crypto")]`)).toEqual([true, []]);
    // the keys: a section with a search and two markets
    p.run(`var FOCUSED = null; var mk = (fk, i) => ({ dataset: { fk, i: String(i) }, focus() { FOCUSED = fk; }, matches: () => false, closest: () => null });
      var SEARCH = { focus() { FOCUSED = "search"; }, matches: (s) => s.includes("search") };
      var ROWS = [mk("pick:a", 0), mk("pick:b", 1), mk("pick:c", 2)];
      var KEYS = null; var SEC = { addEventListener: (t, f) => { if (t === "keydown") KEYS = f; }, querySelectorAll: () => ROWS, querySelector: () => SEARCH };
      tkPickKeys(SEC); var key = (target, k) => KEYS({ key: k, target, preventDefault() {} });`);
    p.run('key(SEARCH, "ArrowDown")');
    expect(p.out("FOCUSED")).toBe("pick:a");
    p.run('key(ROWS[0], "ArrowDown"); key(ROWS[1], "ArrowDown")');
    expect(p.out("FOCUSED")).toBe("pick:c");
    p.run('key(ROWS[2], "ArrowDown")');
    expect(p.out("FOCUSED")).toBe("pick:c");
    p.run('key(ROWS[2], "Home")');
    expect(p.out("FOCUSED")).toBe("pick:a");
    p.run('key(ROWS[0], "End")');
    expect(p.out("FOCUSED")).toBe("pick:c");
    p.run('key(ROWS[0], "ArrowUp")');
    expect(p.out("FOCUSED")).toBe("search");
    // S ON A STARRED ROW unstars it: that row is gone from Starred once the lists are drawn again — the key goes to the same market's row in
    // another list (Most traded), never nowhere; a market listed nowhere else: the row now at the same place; no row left: the search
    p.run(`var LIST = { tkRows: [{ star: { kind: "crypto", key: "coin:ETH", name: "ETH" } }, { star: { kind: "crypto", key: "coin:SOL", name: "SOL" } }] };
      var mk2 = (fk, i, key) => ({ dataset: { fk, i: String(i) }, focus() { FOCUSED = fk; }, matches: () => false, closest: (q) => (q === ".tk-pg" ? (key ? { tkRows: Object.assign([], { [i]: { star: { key } } }) } : LIST) : null) });
      var STARRED = [mk2("star:coin:ETH", 0), mk2("star:coin:SOL", 1)];
      tkStarPress = () => { ROWS = [mk2("star:coin:SOL", 0, "coin:SOL"), mk2("pick:coin:BTC", 1, "coin:BTC"), mk2("pick:coin:ETH", 2, "coin:ETH")]; };
      ROWS = STARRED;`);
    p.run('key(STARRED[0], "s")');
    expect(p.out("FOCUSED")).toBe("pick:coin:ETH");
    p.run(`ROWS = STARRED; tkStarPress = () => { ROWS = [mk2("star:coin:ETH", 0, "coin:ETH"), mk2("pick:coin:BTC", 1, "coin:BTC")]; }`);
    p.run('key(STARRED[1], "S")');
    expect(p.out("FOCUSED")).toBe("pick:coin:BTC");
    p.run(`ROWS = STARRED; tkStarPress = () => { ROWS = []; }`);
    p.run('key(STARRED[0], "s")');
    expect(p.out("FOCUSED")).toBe("search");
    // the stylesheet keeps the star beside the row, never inside its button
    expect(source("ui/trade.js")).toContain('</button>${starBtn(r, i)}</li>');
  });

  it("CANCEL ALL runs the cancels at once — each its own signature, none waiting on the one before, none dropped — says what each venue refused, and reads the account once", async () => {
    const p = page();
    p.set("A", { ...pageOf([PAPER1]), orders: [] });
    p.run(`Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true });
      var ASKED = []; var GO = []; var LOADS = 0; load = async () => { LOADS++; };
      Owner.act = (d) => new Promise((go) => { ASKED.push(d.order); GO.push([d.order, go]); });`);
    const done = p.run<Promise<unknown>>('tkCancelAll([{ id: "ord-1", venue: "paper-1" }, { id: "ord-2", venue: "paper-1" }, { id: "ord-3", venue: "ex" }])');
    await settle();
    // all three asked before any answered
    expect(p.out("ASKED")).toEqual(["ord-1", "ord-2", "ord-3"]);
    expect(p.out("busy")).toBe(true);
    p.run('for (const [id, go] of GO) go(id === "ord-2" ? { status: 409, body: { ok: false, refusal: { message: "Paper account: ord-2 has filled" } } } : { status: 200, body: { kind: "order", order: { id } } })');
    await done;
    expect(p.out("[busy, LOADS]")).toEqual([false, 1]);
    expect(p.out("flash")).toBe("2 of 3 canceled. ord-2: Paper account: ord-2 has filled");
    // every one taken off: said once
    p.run('Owner.act = async (d) => ({ status: 200, body: { kind: "order", order: { id: d.order } } })');
    await p.run('tkCancelAll([{ id: "ord-4", venue: "paper-1" }, { id: "ord-5", venue: "paper-1" }])');
    expect(p.out("[flash, said]")).toEqual(["", "Canceled 2 orders."]);
    expect(source("ui/trade.js")).not.toContain("for (const o of all) await own(");
  });

  it("PAPER ONBOARDING: with no paper account, one card over the terminal offers to open one — signed, the paper money typed — or to continue a book kept on this machine; with one, or once put away, none", async () => {
    const p = page();
    const options = [{ kind: "paper", connector: "live:paper", needs: "none", label: "Paper account" }];
    p.set("A", { ...pageOf([EX]), connectLive: { writes: { on: true, capUsd: 250 }, options } });
    p.run(`Object.defineProperty(Owner, "role", { get: () => "owner", configurable: true });
      var STORE = {}; localStorage = { getItem: (k) => STORE[k] ?? null, setItem: (k, v) => { STORE[k] = String(v); } };
      var BOOKS = { ok: true, books: [] }; var BOOK_READS = []; api = async (path, o) => (path.startsWith("/api/account/paper/books") ? (BOOK_READS.push((o && o.ttl) || 0), BOOKS) : { ok: false });
      var ACTS = []; Owner.act = async (d) => (ACTS.push(d), { status: 200, body: { kind: "account", summary: "Paper account connected" } }); var LOADS = 0; load = async () => { LOADS++; };
      var HEARD = {}; var CARD = { hidden: true, innerHTML: "", isConnected: true, addEventListener: (t, f) => { HEARD[t] = f; }, querySelector: () => ({ className: "", textContent: "" }), contains: () => true };`);
    p.run("tkOnboard(CARD, true)");
    expect(p.out("CARD.hidden")).toBe(false);
    const html = p.out<string>("CARD.innerHTML");
    expect(html).toContain("<b>Practise on paper first</b>");
    expect(html).toContain('<button type="submit" class="btn btn-primary" data-ob-go data-fk="ob-go">Open a paper account</button>');
    // signed: the account's own paper account, the money typed, the next free id
    p.run(`HEARD.submit({ preventDefault() {}, target: { closest: () => ({ elements: { usd: { value: "25,000" } } }) } })`);
    await settle();
    expect(p.out("ACTS")).toEqual([{ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "25000" }]);
    expect(p.out("LOADS")).toBe(1);
    // the books kept here were read afresh as Open was pressed (no keep), after the card's own read (a minute's keep); and what is said is
    // the card's own short words, never the account's whole summary with the fill rule in it
    expect(p.out("BOOK_READS")).toEqual([60_000, 0]);
    expect(p.out("said")).toBe("Paper account opened: $25,000.00 of paper money");
    // a book kept here is offered to continue, by its own name, its id and the day it was opened — two of the same name told apart
    p.run(`BOOKS = { ok: true, books: [{ venue: "paper-1", name: "Momentum · paper", cashUsd: 9876.5, startCashUsd: 10000, createdAt: "2026-10-01T14:00:00Z" }, { venue: "paper-2", name: "Paper account", cashUsd: 10000, startCashUsd: 10000, createdAt: "2026-10-17T14:00:00Z" }] }; TK.paperBooksAt = 0; TK.paperBooks = []; tkOnboard(CARD, true)`);
    await settle();
    const kept = p.out<string>("CARD.innerHTML");
    expect(kept).toContain('data-ob-keep="paper-1" data-fk="ob-keep:paper-1" aria-label="Continue “Momentum · paper” (paper-1, opened 1 Oct) · $9,876.50 of paper cash">Continue “Momentum · paper” (paper-1, opened 1 Oct) · $9,876.50</button>');
    expect(kept).toContain(">Continue “Paper account” (paper-2, opened 17 Oct) · $10,000.00</button>");
    expect(p.out("tkPaperId(TK.paperBooks)")).toBe("paper-3");
    p.run(`ACTS = []; HEARD.click({ target: { closest: () => ({ dataset: { obKeep: "paper-1" }, disabled: false, hasAttribute: () => false }) } })`);
    await settle();
    expect(p.out("ACTS")).toEqual([{ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "Momentum", credentialRef: "" }]);
    expect(p.out("said")).toBe("Momentum continued: $9,876.50 of paper cash");
    // B10 THROUGH THE CARD: the list the card holds is old (no book kept, as it was read), and paper-1 was disconnected since — its book
    // kept. Open reads the books afresh and picks the next free id from that answer: the amount typed opens a new book, never continues one
    p.run(`TK.paperBooks = []; TK.paperBooksAt = Date.now(); BOOKS = { ok: true, books: [{ venue: "paper-1", name: "Paper account", cashUsd: 10000, startCashUsd: 10000, createdAt: "2026-10-17T14:00:00Z" }] }; ACTS = []; BOOK_READS = []`);
    p.run(`HEARD.submit({ preventDefault() {}, target: { closest: () => ({ elements: { usd: { value: "$25000" } } }) } })`);
    await settle();
    expect(p.out("BOOK_READS")).toEqual([0]);
    expect(p.out("ACTS")).toEqual([{ type: "connectVenue", venue: "paper-2", connector: "live:paper", label: "", credentialRef: "25000" }]);
    expect(p.out("TK.paperBooks.map((b) => b.venue)")).toEqual(["paper-1"]);
    // the books cannot be read just then: nothing is guessed, nothing signed — said
    p.run(`BOOKS = { ok: false, error: "The account did not answer in 15 seconds." }; ACTS = []; var SAID = []; CARD.querySelector = () => ({ set textContent(t) { SAID.push(t); }, className: "" })`);
    p.run(`HEARD.submit({ preventDefault() {}, target: { closest: () => ({ elements: { usd: { value: "25000" } } }) } })`);
    await settle();
    expect(p.out("ACTS")).toEqual([]);
    expect(p.out<string[]>("SAID").at(-1)).toBe("The paper accounts kept on this machine could not be read (The account did not answer in 15 seconds.), so none was opened: try again.");
    p.run(`BOOKS = { ok: true, books: [] }; CARD.querySelector = () => ({ className: "", textContent: "" })`);
    // the card wanted again (a paper account was on the account, then disconnected): the books are read afresh, never the minute's keep
    p.set("A", { ...pageOf([EX, PAPER1]), connectLive: { writes: { on: true, capUsd: 250 }, options } });
    p.run("tkOnboard(CARD, true)");
    p.set("A", { ...pageOf([EX]), connectLive: { writes: { on: true, capUsd: 250 }, options } });
    p.run("BOOK_READS = []; TK.paperBooksAt = Date.now(); tkOnboard(CARD, true)");
    expect(p.out("BOOK_READS")).toEqual([60_000]);
    // an amount that is no number of dollars: said, nothing signed
    p.run(`ACTS = []; HEARD.submit({ preventDefault() {}, target: { closest: () => ({ elements: { usd: { value: "lots" } } }) } })`);
    expect(p.out("ACTS")).toEqual([]);
    // a browser that only looks: the button off, saying why
    p.run("tkOnboard(CARD, false)");
    expect(p.out<string>("CARD.innerHTML")).toContain('data-ob-go data-fk="ob-go" disabled title="This browser only looks: pair it to sign">');
    // a paper account on the account, a read-only server, a server that offers none: no card
    p.set("A", { ...pageOf([EX, PAPER1]), connectLive: { writes: { on: true, capUsd: 250 }, options } });
    p.run("tkOnboard(CARD, true)");
    expect(p.out("CARD.hidden")).toBe(true);
    p.set("A", { ...pageOf([EX], false), connectLive: { writes: { on: false, capUsd: 250 }, options } });
    p.run("tkOnboard(CARD, true)");
    expect(p.out("CARD.hidden")).toBe(true);
    p.set("A", { ...pageOf([EX]), connectLive: { writes: { on: true, capUsd: 250 }, options: [] } });
    p.run("tkOnboard(CARD, true)");
    expect(p.out("CARD.hidden")).toBe(true);
    // Not now: put away in this browser
    p.set("A", { ...pageOf([EX]), connectLive: { writes: { on: true, capUsd: 250 }, options } });
    p.run(`tkOnboard(CARD, true); HEARD.click({ target: { closest: () => ({ dataset: {}, disabled: false, hasAttribute: (a) => a === "data-ob-off" }) } }); tkOnboard(CARD, true)`);
    expect(p.out("[CARD.hidden, STORE['account.paperCardOff']]")).toEqual([true, "1"]);
    // the frame holds its place over the grid
    expect(p.run<string>("ttFrame()")).toContain('<section class="tt-onboard" data-tt-onboard aria-label="Open a paper account" hidden></section>\n    <div class="tt-grid">');
  });
});
