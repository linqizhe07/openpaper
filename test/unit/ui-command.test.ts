import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE COMMAND LINE (ui/command.js): the top bar's box read as a function — a market and a function (AAPL DES), a function alone (MOST),
 * a function and words (HELP chart) — the rows it puts over the search's own, Enter running the first match, HELP's list, and what each
 * function opens. Run as the page runs it: plain scripts in one global scope after ui/core.js, in a vm with a stand-in document; the
 * parts the functions open (the drawer, the ticket, the sheets) are stand-ins that record the call */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "command.js"];

function page() {
  const asked: string[] = [];
  const answers = new Map<string, unknown>();
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "", focus() {}, blur() {} });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" } }, hidden: false },
    location: { hash: "", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {} },
    Owner: { role: "owner", kid: "k1", why: () => "" },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    console,
    URLSearchParams,
    Intl,
    setTimeout,
    clearTimeout,
    fetch: async (path: string) => {
      asked.push(path);
      if (!answers.has(path)) return new Promise(() => {});
      return { status: 200, statusText: "OK", json: async () => answers.get(path) };
    },
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  // what the functions open, as stand-ins that record the call; the account read, so a market can be looked for
  runInContext(
    `
    var OPENED = [], TICKETS = [], TRADES = [], HANDS = [], ALERTS = [], SHEETS = [], TOASTS = [], KEPT = [], CLOSED = 0;
    A = { venues: [], keys: [], now: "2026-11-09T19:00:00.000Z" };
    function openMarket(x) { OPENED.push(x && x.key); }
    function mkRoute(item) { return item.kind === "coin" ? { act: "trade", venue: "ex", symbol: item.base + "/USDT", venueName: "Exchange" } : { act: "why", text: "nobody trades it" }; }
    function mkTicket(preset, item) { TICKETS.push([preset, item.key]); }
    function mkTrade(item, side) { TRADES.push([item.key, side]); }
    function mkHand(item) { HANDS.push(item.key); }
    function openAlertSheet(item) { ALERTS.push(item.key); }
    function openTicket(p) { TICKETS.push([p, ""]); }
    function openStatement() { SHEETS.push("statement"); }
    function openSettings() { SHEETS.push("settings"); }
    function openShortcuts() { SHEETS.push("keys"); }
    function mkTicker(item) { return item.kind === "stock" ? String(item.base).toUpperCase() : ""; }
    function mkIsPreipo() { return false; }
    function shSearchRemember(q) { KEPT.push(q); }
    function shPaletteClose() { CLOSED++; }
    toast = (t, k) => TOASTS.push([typeof t === "string" ? t : t.html, k]);
    openSheet = (html, o) => { SHEETS.push([o && o.title, html]); return null; };
    `,
    ctx,
  );
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, answer: (path: string, body: unknown) => answers.set(path, body), set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`) };
}

/** markets as the explore read lists them */
const coin = (base: string, extra: Record<string, unknown> = {}) => ({ key: `coin:${base}`, kind: "coin", name: base, base, price: 100, changePct24h: 1.2, at: [{ venue: "ex", venueName: "Exchange", symbol: `${base}/USDT`, connected: true, public: false, canTrade: true }], ...extra });
const perp = (base: string) => ({ key: `perp:${base}`, kind: "perp", name: `${base} perpetual`, base, price: 100.5, changePct24h: 1.3, at: [{ venue: "hl", venueName: "Hyperliquid", symbol: `${base}-PERP`, connected: false, public: true }] });
const stock = (base: string, name: string) => ({ key: `stock:${base}`, kind: "stock", name, base, price: 228.6, changePct24h: 0.85, at: [{ venue: "broker", venueName: "Stand-in Broker", symbol: base, connected: true, public: false, canTrade: true }] });
const body = (...items: unknown[]) => ({ ok: true, items });
const find = (q: string) => `/api/account/explore?q=${encodeURIComponent(q)}&limit=8`;

describe("the command line", () => {
  it("reads what is typed as a function: the market first (AAPL DES) or the function first (DES AAPL), a function alone, a function and its words, a kind word before the function — and anything else as a search", () => {
    const p = page();
    const parse = (t: string) => p.run<{ fn: { code: string }; market: string; kind: string; tail: string; ready: boolean } | null>(`(() => { const p = cmdParse(${JSON.stringify(t)}); return p && { fn: { code: p.fn.code }, market: p.market, kind: p.kind, tail: p.tail, ready: p.ready }; })()`);
    expect(parse("AAPL DES")).toEqual({ fn: { code: "DES" }, market: "AAPL", kind: "", tail: "", ready: true });
    expect(parse("  aapl   des ")).toEqual({ fn: { code: "DES" }, market: "aapl", kind: "", tail: "", ready: true });
    expect(parse("DES AAPL")).toEqual({ fn: { code: "DES" }, market: "AAPL", kind: "", tail: "", ready: true });
    expect(parse("BTC PERP GP")).toEqual({ fn: { code: "GP" }, market: "BTC", kind: "perp", tail: "", ready: true });
    expect(parse("tesla stock token des")).toEqual({ fn: { code: "DES" }, market: "tesla stock", kind: "rwa", tail: "", ready: true });
    expect(parse("Fed cuts in December? DES")?.market).toBe("Fed cuts in December?");
    // a code that is a market's name too is the market where a function follows it
    expect(parse("GP DES")).toEqual({ fn: { code: "DES" }, market: "GP", kind: "", tail: "", ready: true });
    expect(parse("most")).toEqual({ fn: { code: "MOST" }, market: "", kind: "", tail: "", ready: true });
    expect(parse("HELP chart and news")).toEqual({ fn: { code: "HELP" }, market: "", kind: "", tail: "chart and news", ready: true });
    expect(parse("ALRT")).toEqual({ fn: { code: "ALRT" }, market: "", kind: "", tail: "", ready: true });
    expect(parse("BTC ALRT")?.market).toBe("BTC");
    // a function that needs a market, with none yet
    expect(parse("DES")).toEqual({ fn: { code: "DES" }, market: "", kind: "", tail: "", ready: false });
    // searches: words that are no function, a function that takes nothing with words around it, nothing at all
    for (const t of ["fed cut", "AAPL PORT", "most traded stocks", "", "   "]) expect(parse(t), t).toBeNull();
  });

  it("every function: a code of one to five capitals (N is the terminal's own one letter for the news), once; a name, a line and an example that reads as itself", () => {
    const p = page();
    const fns = p.run<Array<{ code: string; name: string; what: string; eg: string; takes: string; ok: boolean }>>("CMD_FNS.map((f) => { const q = cmdParse(f.eg); return { code: f.code, name: f.name, what: f.what, eg: f.eg, takes: f.takes, ok: !!q && q.ready && q.fn === f }; })");
    expect(fns.length).toBeGreaterThan(20);
    expect(new Set(fns.map((f) => f.code)).size).toBe(fns.length);
    for (const f of fns) {
      expect(f.code, f.code).toMatch(/^[A-Z]{1,5}$/);
      expect(f.name.length, f.code).toBeGreaterThan(2);
      expect(f.what.length, f.code).toBeGreaterThan(10);
      expect(f.ok, `${f.code}: ${f.eg}`).toBe(true);
      expect(["market", "market?", "words", ""], f.code).toContain(f.takes);
    }
    // the terminal's own mnemonics for the same things
    for (const c of ["DES", "GP", "QM", "FA", "CF", "CN", "TOP", "N", "MOST", "PORT", "ALRT", "HELP"]) expect(fns.map((f) => f.code)).toContain(c);
  });

  it("asks the search for a function's market alone, for the whole of a function typed alone (a market of that name is offered too), for the words before a function half typed, and for nothing after a function that takes words; the Markets list is never narrowed to a code", () => {
    const p = page();
    const q = (t: string) => p.run<string>(`cmdQuery(${JSON.stringify(t)})`);
    const f = (t: string) => p.run<string>(`cmdFilter(${JSON.stringify(t)})`);
    expect(q("AAPL DES")).toBe("AAPL");
    expect(q("BTC PERP GP")).toBe("BTC");
    expect(q("MOST")).toBe("MOST");
    expect(f("MOST")).toBe("");
    expect(q("HELP chart")).toBe("");
    expect(q("AAPL D")).toBe("AAPL");
    expect(q("apple inc")).toBe("apple inc");
    expect(q("BTC")).toBe("BTC");
    expect(f("AAPL DES")).toBe("AAPL");
    expect(f("apple inc")).toBe("apple inc");
    expect(f("")).toBe("");
  });

  it("puts rows over the matches: each match with the function it is run on, a wait while the market is looked for, a word where none is of that name; a function alone; the functions a word starts; one market's functions after it and a space", () => {
    const p = page();
    const rows = (t: string, b: unknown) => p.run<Array<Record<string, unknown>>>(`cmdRows(${JSON.stringify(t)}, ${JSON.stringify(b)}).map((r) => ({ code: r.fn.code, item: r.item && r.item.key, no: r.no, wait: r.wait, none: r.none, fill: r.fill, lead: r.lead, tail: r.tail }))`);
    const both = body(coin("BTC"), perp("BTC"), coin("BTCX"));
    expect(rows("BTC GP", both).map((r) => [r.code, r.item])).toEqual([["GP", "coin:BTC"], ["GP", "perp:BTC"], ["GP", "coin:BTCX"]]);
    expect(rows("BTC PERP GP", both).map((r) => [r.code, r.item])).toEqual([["GP", "perp:BTC"]]);
    expect(rows("BTC GP", null)).toEqual([{ code: "GP", wait: true }]);
    expect(rows("ZZZ GP", body())).toEqual([{ code: "GP", none: "ZZZ" }]);
    // a function with nothing for the market says so on its row
    expect(rows("BTC FA", both)[0]).toMatchObject({ code: "FA", item: "coin:BTC", no: "FA reads a US company's own filings with the SEC: BTC is not a US share." });
    expect(rows("MOST", body())).toEqual([{ code: "MOST", tail: "" }]);
    expect(rows("HELP chart", null)).toEqual([{ code: "HELP", tail: "chart" }]);
    expect(rows("DES", null)).toEqual([{ code: "DES", fill: true }]);
    // the functions a word starts, by code then by name — a function that needs a market is a code to fill in
    expect(rows("mo", null).map((r) => [r.code, r.fill])).toEqual([["MOST", undefined], ["MOV", undefined]]);
    expect(rows("chart", null).map((r) => [r.code, r.fill])).toEqual([["GP", true]]);
    expect(rows("zzzz", null)).toEqual([]);
    // a market and a space: its functions, the market said once over them; a market and a function half typed: those it starts
    const aapl = body(stock("AAPL", "Apple Inc. common stock"));
    expect(rows("aapl ", aapl).map((r) => [r.code, r.item, r.lead, r.no])).toEqual([["DES", "stock:AAPL", true, ""], ["GP", "stock:AAPL", true, ""], ["QM", "stock:AAPL", true, ""], ["FA", "stock:AAPL", true, ""], ["CF", "stock:AAPL", true, ""], ["BUY", "stock:AAPL", true, ""]]);
    expect(rows("aapl d", aapl).map((r) => r.code)).toEqual(["DES"]);
    expect(rows("aapl ", null)).toEqual([]);
    expect(rows("apple inc", aapl)).toEqual([]);
    expect(rows("", aapl)).toEqual([]);
  });

  it("draws the rows escaped, a code as a key, a market said once over its functions, a function with nothing for the market dimmed — and says whether the search's own rows follow", () => {
    const p = page();
    const sly = body(coin("BTC", { name: "Bit <img src=x onerror=alert(1)> coin" }));
    const html = p.run<string>(`cmdRowsHtml(cmdRows("btc des", ${JSON.stringify(sly)}))`);
    expect(html).toContain('<button type="button" role="option" data-cmd-i="0">');
    expect(html).toContain('<kbd class="cmd-code">DES</kbd>');
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Description");
    const off = p.run<string>(`cmdRowsHtml(cmdRows("btc fa", ${JSON.stringify(sly)}))`);
    expect(off).toContain('aria-disabled="true"');
    expect(off).toContain("Not for this market");
    const lead = p.run<string>(`cmdRowsHtml(cmdRows("aapl ", ${JSON.stringify(body(stock("AAPL", "Apple Inc. common stock")))}))`);
    expect(lead).toContain('<div class="menu-h" role="presentation">Functions for AAPL</div>');
    expect(lead.match(/<button type="button" role="option" data-cmd-i="\d+">/g)).toHaveLength(6);
    expect(lead).toContain("<b>Price chart</b>");
    expect(p.run<string>('cmdRowsHtml(cmdRows("zzz gp", { items: [] }))')).toContain("Nothing matches “zzz”");
    expect(p.run<string>('cmdRowsHtml(cmdRows("zzz gp", null))')).toContain("Looking for the market…");
    // the search's own rows follow a function alone (a market of that name) and a half-typed function, never a function with its market
    // or one that takes words
    const pal = (t: string, b: unknown) => p.run<{ rows: number; markets: boolean; q: string }>(`(() => { const c = cmdPalette(${JSON.stringify(t)}, ${JSON.stringify(b)}); return { rows: c.rows, markets: c.markets, q: c.q }; })()`);
    expect(pal("AAPL DES", null)).toEqual({ rows: 1, markets: false, q: "AAPL" });
    expect(pal("HELP x", null)).toEqual({ rows: 1, markets: false, q: "" });
    expect(pal("MOST", null)).toEqual({ rows: 1, markets: true, q: "MOST" });
    expect(pal("AAPL D", null)).toEqual({ rows: 0, markets: true, q: "AAPL" });
    expect(pal("fed cut", null)).toEqual({ rows: 0, markets: true, q: "fed cut" });
  });

  it("Enter: a search or a function without its market is not its to answer; a function alone runs; a market's function runs on the first match it has something for — from the palette's answer, or read first — and what ran is kept with the recent searches", async () => {
    const p = page();
    const enter = (t: string, b: unknown) => p.run<boolean>(`cmdEnter(${JSON.stringify(t)}, ${JSON.stringify(b)})`);
    expect(enter("fed cut", null)).toBe(false);
    expect(enter("DES", null)).toBe(false);
    expect(enter("", null)).toBe(false);
    // a function alone: the page it names, the box done with
    expect(enter("port", null)).toBe(true);
    expect(p.run("location.hash")).toBe("#/portfolio");
    expect(p.run("[KEPT, CLOSED]")).toEqual([["port"], 1]);
    // with the palette's answer in hand: the first match the function has something for (a token named NVDA is not a US share; its stock is)
    const nvda = body({ ...coin("NVDA", { kind: "rwa", key: "rwa:NVDA", name: "NVIDIA stock token" }) }, stock("NVDA", "NVIDIA Corporation common stock"));
    expect(enter("NVDA FA", nvda)).toBe(true);
    expect(p.run("OPENED")).toEqual(["stock:NVDA"]);
    expect(p.run("KEPT")).toEqual(["port", "NVDA FA"]);
    // no answer in hand: the search is asked for the market, and the function runs when it answers
    p.answer(find("btc"), body(coin("BTC"), perp("BTC")));
    expect(enter("btc gp", null)).toBe(true);
    await new Promise((go) => setTimeout(go, 5));
    expect(p.asked).toEqual([find("btc")]);
    expect(p.run("TICKETS")).toEqual([[{ venue: "ex", symbol: "BTC/USDT", side: "buy" }, "coin:BTC"]]);
    // nothing of that name: said, nothing opened
    p.answer(find("ZZZ"), body());
    expect(enter("ZZZ DES", null)).toBe(true);
    await new Promise((go) => setTimeout(go, 5));
    expect(p.run("TOASTS.at(-1)")).toEqual(["No market matches “ZZZ”.", "info"]);
    expect(p.run("OPENED")).toEqual(["stock:NVDA"]);
    // a function with nothing for the only market of that name: its own words
    expect(enter("BTC FA", body(coin("BTC")))).toBe(true);
    expect(p.run("TOASTS.at(-1)")).toEqual(["FA reads a US company's own filings with the SEC: BTC is not a US share.", "info"]);
  });

  it("each function opens what it says: the pages by their route, the drawer, the ticket, the sheets", () => {
    const p = page();
    const run = (t: string, b: unknown = null) => p.run(`cmdEnter(${JSON.stringify(t)}, ${JSON.stringify(b)}); location.hash`);
    const hashes: Record<string, string> = { MOST: "#/markets?tab=all", MOV: "#/markets?tab=all&sort=movers", WATCH: "#/markets?tab=watching", CRYP: "#/markets?tab=crypto", STK: "#/markets?tab=stocks", PERP: "#/markets?tab=perps", PRED: "#/markets?tab=predictions", PIPO: "#/markets?tab=preipo", RWA: "#/markets?tab=rwas", SA: "#/trade?mode=superagent", BT: "#/backtest", SIM: "#/practice", DEB: "#/debrief", PORT: "#/portfolio", VEN: "#/venues", MEM: "#/memory", AGT: "#/desk", ALRT: "#/markets?tab=watching" };
    for (const [code, hash] of Object.entries(hashes)) expect(run(code), code).toBe(hash);
    run("TKT");
    run("STMT");
    run("SET");
    run("KEYS");
    expect(p.run("TICKETS")).toEqual([[{}, ""]]);
    expect(p.run("SHEETS.slice(0, 3)")).toEqual(["statement", "settings", "keys"]);
    const btc = body(coin("BTC"));
    const both = body(coin("BTC"), stock("AAPL", "Apple"));
    run("BTC DES", btc);
    run("BTC QM", btc);
    run("AAPL FA", both);
    run("AAPL CF", both);
    expect(p.run("OPENED")).toEqual(["coin:BTC", "coin:BTC", "stock:AAPL", "stock:AAPL"]);
    run("BTC BUY", btc);
    run("BTC SELL", btc);
    run("BTC HAND", btc);
    run("BTC ALRT", btc);
    expect(p.run("TRADES")).toEqual([["coin:BTC", "buy"], ["coin:BTC", "sell"]]);
    expect(p.run("HANDS")).toEqual(["coin:BTC"]);
    expect(p.run("ALERTS")).toEqual(["coin:BTC"]);
    // a chart: the Trade page where a venue trades it, else the drawer, whose chart is the venue's public history
    run("BTC GP", btc);
    expect(p.run("TICKETS.at(-1)")).toEqual([{ venue: "ex", symbol: "BTC/USDT", side: "buy" }, "coin:BTC"]);
    run("AAPL GP", both);
    expect(p.run("OPENED.at(-1)")).toBe("stock:AAPL");
    // HELP: the sheet, narrowed to a word
    run("HELP chart");
    const [title, html] = p.run<[string, string]>("SHEETS.at(-1)");
    expect(title).toBe("Functions");
    expect(html).toContain("Functions that mention “chart”.");
    expect(html).toContain('<kbd class="cmd-code">GP</kbd>');
    expect(html).not.toContain('<kbd class="cmd-code">PORT</kbd>');
  });

  it("HELP lists every function by its group with its code, name, line and example, escapes the word it was given, and shows the whole list under a word nothing matches", () => {
    const p = page();
    const all = p.run<string>('cmdHelpHtml("")');
    const codes = p.run<string[]>("CMD_FNS.map((f) => f.code)");
    for (const c of codes) expect(all).toContain(`<kbd class="cmd-code">${c}</kbd>`);
    for (const g of ["A market", "News", "Markets", "Trading and the lab", "Account"]) expect(all).toContain(`<h3 class="label">${g}</h3>`);
    expect(all).toContain('<span class="cmd-eg mono">AAPL DES</span>');
    expect(all).toContain("nothing is signed or sent from the box");
    const none = p.run<string>('cmdHelpHtml("<zzz>")');
    expect(none).toContain("No function mentions “&lt;zzz&gt;”: here is every one.");
    expect(none).not.toContain("<zzz>");
    for (const c of codes) expect(none).toContain(`<kbd class="cmd-code">${c}</kbd>`);
    const some = p.run<string>('cmdHelpHtml("sec")');
    expect(some).toContain('<kbd class="cmd-code">FA</kbd>');
    expect(some).toContain('<kbd class="cmd-code">CF</kbd>');
    expect(some).not.toContain('<kbd class="cmd-code">MOV</kbd>');
  });
});
