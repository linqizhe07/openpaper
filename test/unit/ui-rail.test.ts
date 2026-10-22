import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script, createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

/* THE RAIL'S WATCH (ui/rail.js): the markets starred, priced fresh from any tab; the books in a line each; how many agents. Run on the page's
   own scripts in a stand-in browser whose elements keep what is painted into them, with the reads answered by path */
const PUBLIC = fileURLToPath(new URL("../../src/portfolio/public/", import.meta.url));
const NOW = Date.parse("2026-10-06T05:00:00.000Z");
type Answer = unknown | Promise<unknown>;
function page(answer: (path: string) => Answer = () => ({ ok: true })) {
  const asked: string[] = [];
  const els = new Map<string, Record<string, unknown>>();
  const element = (id = ""): Record<string, unknown> => {
    let el = els.get(id);
    if (!el) els.set(id, (el = { id, innerHTML: "", textContent: "", hidden: false, addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {} }));
    return el;
  };
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a: ConstructorParameters<typeof Date>) {
      super(...((a.length ? a : [NOW]) as ConstructorParameters<typeof Date>));
    }
    static override now() {
      return NOW;
    }
  }
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element("body"), documentElement: { dataset: {} }, hidden: false, activeElement: null },
    location: { hash: "#/portfolio", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    Owner: { role: "owner", why: () => "" },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    fetch: async (path: string) => {
      asked.push(path);
      const body = await answer(path);
      return { status: (body as { ok?: boolean })?.ok === false ? 409 : 200, statusText: "", json: async () => body };
    },
    console,
    URLSearchParams,
    Intl,
    Date: FixedDate,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of ["ui/core.js", "ui/connect.js", "ui/asset.js", "ui/markets.js", "ui/rail.js"]) new Script(readFileSync(join(PUBLIC, f), "utf8"), { filename: f }).runInContext(ctx);
  const run = <T = unknown>(code: string) => runInContext(code, ctx) as T;
  return { run, asked, el: element, sandbox, set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`) };
}
const settle = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
/* an account with one exchange connected live, two markets starred (the exchange's newest), an alert on one, an order open, two agents */
const account = () => ({
  venues: [{ id: "ex", name: "Exchange X", live: true, trade: { can: true, what: "spot", kinds: ["spot"] } }],
  watch: [{ venue: "okx-public", symbol: "DOGE/USDT", at: "2026-10-05T04:00:00.000Z" }, { venue: "ex", symbol: "BTC/USDT", at: "2026-10-06T04:00:00.000Z" }],
  alerts: [{ id: "alert-1", venue: "ex", symbol: "BTC/USDT", condition: "above", price: 90000 }],
  alertsFired: [],
  orders: [{ id: "o1", status: "open" }, { id: "o2", status: "filled" }, { id: "o3", status: "partial" }],
  keys: [{ address: "0x1" }, { address: "0x2" }],
  cards: [],
  requests: [],
  connectLive: { writes: { on: true, capUsd: 100 }, options: [] },
});
const btc = { key: "coin:BTC", kind: "coin", base: "BTC", name: "Bitcoin", price: 62000, changePct24h: 2.1, volumeUsd24h: 1.9e9, tabs: ["all", "crypto"], at: [{ venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT", connected: true, canTrade: true, public: false, price: 62000 }] };
const doge = { key: "coin:DOGE", kind: "coin", base: "DOGE", name: "Dogecoin", price: 0.12, changePct24h: -1.5, volumeUsd24h: 8e8, tabs: ["all", "crypto"], at: [{ venue: "okx-public", venueName: "OKX", symbol: "DOGE/USDT", connected: false, canTrade: false, public: true, connectTo: "okx-public", connector: "live:exchange:okx", price: 0.12 }] };
const LIST = { ok: true, items: [btc, doge] };

describe("the rail's watch", () => {
  it("prices the starred markets at venues connected live, the newest star first, twelve at most — a public listing keeps the list's price", () => {
    const p = page();
    p.set("A", account());
    expect(p.run("rlPairs(A.watch)")).toEqual(["ex|BTC/USDT"]);
    const many = Array.from({ length: 15 }, (_, i) => ({ venue: "ex", symbol: `C${i}/USDT`, at: `2026-10-${String(1 + i).padStart(2, "0")}T00:00:00.000Z` }));
    const pairs = p.run<string[]>(`rlPairs(${JSON.stringify(many)})`);
    expect(pairs).toHaveLength(12);
    expect(pairs[0]).toBe("ex|C14/USDT");
    expect(pairs[11]).toBe("ex|C3/USDT");
    expect(p.run("rlPairs(undefined)")).toEqual([]);
    expect(p.run('rlPairs([{ venue: "", symbol: "X" }, { venue: "ex" }])')).toEqual([]);
  });

  it("draws each starred market as a row — the avatar, the name, where it is priced, the price (the list's until a fresh one is kept, then that, carrying data-q), the 24h move, the bell with its alerts — the newest star first, and says how to star one when none is", () => {
    const p = page();
    p.set("A", account());
    const rows = (body: unknown = LIST) => p.run<string>(`rlRows(A.watch, mkRows(${JSON.stringify(body)}), ${JSON.stringify(body)})`);
    const html = rows();
    expect(html).toMatch(/^<div class="rl-h"><span>Watching<\/span><a class="link dim" href="#\/markets\?tab=watching">All →<\/a><\/div>/);
    const items = html.split("<button ").slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('class="rl-row" data-rl-i="0" data-k="ex|BTC/USDT" title="Bitcoin">');
    expect(items[0]).toContain('<span class="rl-name">Bitcoin<span class="rl-bell" title="1 price alert">');
    expect(items[0]).toContain('<span class="rl-px" data-q="ex|BTC/USDT" data-fmt="usd">$62,000.00</span><span class="rl-where">Exchange X</span>');
    expect(items[0]).toContain('<span class="rl-chg"><span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 2.1%</span></span>');
    expect(items[1]).toContain('data-rl-i="1" data-k="okx-public|DOGE/USDT" title="Dogecoin">');
    expect(items[1]).toContain('<span class="rl-px">$0.12</span><span class="rl-where">OKX</span>');
    expect(items[1]).not.toContain("rl-bell");
    expect(p.run("RL.rows.map((x) => x.key)")).toEqual(["coin:BTC", "coin:DOGE"]);
    // a fresh price kept (the quotes read, or Markets' own) is the figure; a fired alert turns the bell amber
    p.run(`MKT.quotes.set("ex|BTC/USDT", { at: Date.now(), market: { price: 62500 } }); A.alertsFired = [{ id: "f1", venue: "ex", symbol: "BTC/USDT", condition: "above", price: 61000 }]`);
    const fresh = rows();
    expect(fresh).toContain('data-fmt="usd">$62,500.00</span>');
    expect(fresh).toContain('<span class="rl-bell warm" title="1 alert fired">');
    // a market the list does not carry is a row named by its symbol, priced by nothing
    p.run('A.watch = [{ venue: "ex", symbol: "ZZZ/USDT", at: "2026-10-06T04:00:00.000Z" }]');
    const stand = rows();
    expect(stand).toContain('title="ZZZ/USDT">');
    expect(stand).toContain('<span class="rl-px" data-q="ex|ZZZ/USDT" data-fmt="usd">—</span><span class="rl-where">Exchange X</span>');
    // the words are escaped
    p.run('A.watch = [{ venue: "ex", symbol: "<b>", at: "2026-10-06T04:00:00.000Z" }]');
    expect(rows()).toContain('title="&lt;b&gt;">');
    // nothing starred
    expect(p.run("rlRows([], [], null)")).toBe('<p class="rl-empty">Star a market in <a class="link" href="#/markets">Markets</a> to watch it here.</p>');
    expect(p.run("RL.rows")).toEqual([]);
  });

  it("says the books in a line each — the open orders, the positions with what they are up or down where the venues say it, the paper result — and nothing where nothing is on them", () => {
    const p = page();
    p.set("A", account());
    expect(p.run("rlBooksHtml(A, null)")).toBe('<a class="rl-line" href="#/portfolio"><span>Open orders</span><span class="rl-v"><b>2</b></span></a>');
    const pos = [{ symbol: "BTC-PERP", unrealizedUsd: 12.5 }, { symbol: "ETH-PERP", unrealizedUsd: -2.5 }, { symbol: "AAPL" }];
    expect(p.run(`rlBooksHtml(A, ${JSON.stringify(pos)})`)).toContain('<span>Positions</span><span class="rl-v"><b>3</b> <span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> $10.00</span></span>');
    expect(p.run('rlBooksHtml(A, [{ symbol: "AAPL" }])')).toContain('<span>Positions</span><span class="rl-v"><b>1</b></span>');
    // the paper result comes from the shell (shPaperGain) where it is loaded
    p.run("shPaperGain = () => ({ usd: 31.2, pct: 1.9, accounts: 1 })");
    expect(p.run("rlBooksHtml(A, [])")).toContain('<span>Paper</span><span class="rl-v"><span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 1.9%</span></span>');
    p.run("shPaperGain = () => null; A.orders = []");
    expect(p.run("rlBooksHtml(A, [])")).toBe("");
    expect(p.run("rlBooksHtml(null, [])")).toBe("");
  });

  it("reads the names once a minute, the prices every tick and the positions every twenty seconds — only while the page is in view — keeps the prices where Markets keeps them, and draws the rail; nothing starred asks for no names or prices", async () => {
    const p = page((path) => (path.startsWith("/api/account/explore") ? LIST : path.startsWith("/api/account/quotes") ? { ok: true, quotes: [{ venue: "ex", symbol: "BTC/USDT", market: { price: 62750, bid: 62740, ask: 62760 } }] } : path.startsWith("/api/account/positions") ? { ok: true, positions: [{ symbol: "BTC-PERP", unrealizedUsd: 4 }], missing: [] } : { ok: true }));
    p.set("A", account());
    p.run("rlPoll()");
    await settle();
    expect(p.asked).toEqual(["/api/account/explore?limit=200", "/api/account/quotes?pairs=ex%7CBTC%2FUSDT", "/api/account/positions"]);
    expect(p.run('MKT.quotes.get("ex|BTC/USDT").market.price')).toBe(62750);
    expect(p.run("RL.positions.length")).toBe(1);
    const watch = p.el("rail-watch");
    expect(watch.innerHTML).toContain('data-fmt="usd">$62,750.00</span>');
    const books = p.el("rail-books");
    expect(books.hidden).toBe(false);
    expect(books.innerHTML).toContain("<span>Positions</span>");
    expect(p.el("rail-agents-sub").textContent).toBe("2 agents");
    // the next tick: the names and the positions are still fresh (the page's cache), the prices asked again
    p.run("rlPoll()");
    await settle();
    expect(p.asked.slice(3)).toEqual(["/api/account/quotes?pairs=ex%7CBTC%2FUSDT"]);
    // the page hidden: nothing asked; nothing starred: no names, no prices, the books still
    p.run("document.hidden = true; rlPoll()");
    await settle();
    expect(p.asked).toHaveLength(4);
    p.run("document.hidden = false; A.watch = []; API.clear(); rlPoll()");
    await settle();
    expect(p.asked.slice(4)).toEqual(["/api/account/positions"]);
    expect(p.el("rail-watch").innerHTML).toContain("rl-empty");
    // no agents: the line under Agents is empty; a rail without the watch (another page) asks nothing
    p.run("A.keys = []; rlDraw()");
    expect(p.el("rail-agents-sub").textContent).toBe("");
    p.run("document.getElementById = () => null; A.watch = [{ venue: 'ex', symbol: 'BTC/USDT', at: 't' }]; rlPoll()");
    await settle();
    expect(p.asked).toHaveLength(5);
  });

  it("opens a row's drawer through Markets, or goes to Markets' Watching tab where this page has no drawer", () => {
    const p = page();
    p.set("A", account());
    p.run(`var OPENED = []; var WENT = []; openMarket = (it) => OPENED.push(it.key); go = (tab, params) => WENT.push([tab, params]); rlRows(A.watch, mkRows(${JSON.stringify(LIST)}), ${JSON.stringify(LIST)})`);
    p.run("rlOpen(0); rlOpen('1'); rlOpen(9)");
    expect(p.run("OPENED")).toEqual(["coin:BTC", "coin:DOGE"]);
    p.run("openMarket = undefined; rlOpen(0)");
    expect(p.run("WENT")).toEqual([["markets", { tab: "watching" }]]);
  });
});
