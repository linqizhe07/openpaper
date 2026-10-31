import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script, type Context } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPortfolioServer, type PortfolioServerHandle } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** The account page is plain scripts that share one global scope: owner.js, then ui/*.js in the order account.html names them. Each file
 * the page names is served with its type, nothing else under /ui/ is, every name is declared once across them all, they run in that order
 * as a browser would run them, the shell's contract (ui/core.js) is there for the panes to draw with, and none of them asks with the
 * browser's own prompt, confirm or alert boxes */
const PUBLIC = fileURLToPath(new URL("../../src/portfolio/public/", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "page-scripts-"));
let srv: PortfolioServerHandle;
let html = "";

beforeAll(async () => {
  const svc = await PortfolioService.create({ home, venues: "frontline", real: true, liveDeps: { http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined } });
  srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
  html = await fetch(`${srv.url}/`).then((r) => r.text());
});
afterAll(async () => {
  await srv?.close();
  rmSync(home, { recursive: true, force: true });
});

/** what the page names, in its order: its scripts and its stylesheets, as files (the server names each with its content's hash, ?v=…, so a
 * browser keeps it a year); the face it preloads is its own too (public/fonts), named apart */
const unversioned = (u: string) => u.replace(/\?v=[0-9a-f]{16}$/, "");
const scripts = () => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => unversioned(m[1] ?? ""));
const styles = () => [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => unversioned(m[1] ?? "")).filter((h) => h.startsWith("/"));
const source = (src: string) => readFileSync(join(PUBLIC, src.replace(/^\//, "")), "utf8");
/** the files this shell's builder owns: the page, the contract, the shell, the statement, the agents' mount point */
const SHELL = ["account.html", "ui/core.js", "ui/shell.js", "ui/statement.js", "ui/agents-mount.js"];

/** a GET sent exactly as written: fetch would make "/ui/../server.ts" into "/server.ts" before it left */
const raw = (path: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const u = new URL(srv.url);
    const req = request({ host: u.hostname, port: u.port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });

/** a stand-in for the browser, enough for the scripts to load: every element is one that takes listeners and reports nothing; the device
 * key is asked for and never answers (indexedDB.open returns no request that fires), so nothing is fetched or drawn after the start */
function browser(opts: { fetch?: (path: string) => Promise<unknown> } = {}) {
  const opened: string[] = [];
  const stored: string[] = [];
  // what the scripts listen for on the document, kept so a test can hand them an event as a browser would (the shell's one click handler)
  const heard: Record<string, Array<(e: unknown) => void>> = {};
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, value: "", textContent: "", innerHTML: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener: (type: string, fn: (e: unknown) => void) => void (heard[type] ||= []).push(fn), body: element(), documentElement: { dataset: { theme: "cream" }, setAttribute() {} }, hidden: false, activeElement: null },
    location: { hash: "", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: {
      getItem: () => null,
      setItem: (k: string) => {
        stored.push(k);
        throw new Error("storage is off in this window");
      },
    },
    MutationObserver: class {
      observe() {}
    },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    scrollTo() {},
    indexedDB: { open: (name: string) => (opened.push(name), {}) },
    fetch: opts.fetch ? (path: string) => opts.fetch!(path) : () => new Promise(() => {}),
    console,
    URLSearchParams,
    Intl,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  const files = scripts().map((src) => ({ src, text: source(src) }));
  for (const f of files) new Script(f.text, { filename: f.src }).runInContext(ctx);
  return { ctx, opened, stored, heard, run: (code: string) => runInContext(code, ctx) as unknown };
}

describe("the account page's scripts", () => {
  it("serves every script and stylesheet the page names, as the file it is and with its type; every script in ui/ is named once, core first and shell last", async () => {
    const named = scripts();
    expect(named[0]).toBe("/owner.js");
    expect(named[1]).toBe("/ui/core.js");
    expect(named[named.length - 1]).toBe("/ui/shell.js");
    expect(new Set(named).size).toBe(named.length);
    const onDisk = readdirSync(join(PUBLIC, "ui")).filter((f) => f.endsWith(".js")).map((f) => `/ui/${f}`);
    expect(named.filter((s) => s.startsWith("/ui/")).sort()).toEqual(onDisk.sort());
    // the order the contract names: the ocean right after the contract (the page's ground, drawn before any pane), then the account's push
    // channel (every pane after it listens to it), what moves money and what connects before the panes that use it, the statement and the
    // agents' mount point after them, the shell last
    expect(named).toEqual(["/owner.js", "/ui/core.js", "/ui/ocean.js", "/ui/stream.js", "/ui/connect.js", "/ui/money.js", "/ui/asset.js", "/ui/intent.js", "/ui/live.js", "/ui/portfolio.js", "/ui/memory.js", "/ui/earn.js", "/ui/markets.js", "/ui/trade.js", "/ui/indicators.js", "/ui/chart.js", "/ui/book.js", "/ui/terminal.js", "/ui/brains.js", "/ui/desk.js", "/ui/superagent.js", "/ui/backtest.js", "/ui/debrief.js", "/ui/statement.js", "/ui/agents-mount.js", "/ui/rail.js", "/ui/shell.js"]);
    // each ui script waits for the page to be parsed and runs in the order named
    for (const m of html.matchAll(/<script\b([^>]*)\bsrc="(\/ui\/[^"]+)"/g)) expect(m[1], m[2] ?? "").toMatch(/\bdefer\b/);
    // the tokens first (both backgrounds), then the shell, then what the earlier renderers still draw; the classic page's sheet is not needed
    expect(styles()).toEqual(["/ui/tokens.css", "/ui/shell.css", "/account.css", "/ui/portfolio.css", "/ui/markets.css", "/ui/trade.css", "/ui/terminal.css", "/ui/chart.css", "/ui/book.css", "/ui/live.css", "/ui/brains.css", "/ui/desk.css", "/ui/superagent.css", "/ui/backtest.css", "/ui/debrief.css"]);
    for (const path of [...named, ...styles()]) {
      const r = await fetch(`${srv.url}${path}`);
      expect(r.status, path).toBe(200);
      expect(r.headers.get("content-type"), path).toMatch(path.endsWith(".css") ? /^text\/css\b/ : /^application\/javascript\b/);
      expect(await r.text(), path).toBe(source(path));
      // the page names it with its content's hash: asked for so, it is kept a year as it is; the browser that asks gets it compressed
      const hash = createHash("sha256").update(readFileSync(join(PUBLIC, path.slice(1)))).digest("hex").slice(0, 16);
      expect(html, path).toContain(`"${path}?v=${hash}"`);
      const kept = await fetch(`${srv.url}${path}?v=${hash}`, { headers: { "accept-encoding": "br, gzip" } });
      expect(kept.headers.get("cache-control"), path).toBe("public, max-age=31536000, immutable");
      expect(kept.headers.get("content-encoding"), path).toBe(statSync(join(PUBLIC, path.slice(1))).size >= 1024 ? "br" : null);
      expect(await kept.text(), path).toBe(source(path));
    }
    // the page's face is its own: preloaded before the first paint, served from here and kept a year (no font is asked of another host)
    const preload = [...html.matchAll(/<link\b[^>]*\brel="preload"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(preload).toEqual(["/fonts/inter-v5-latin.woff2"]);
    const font = await fetch(`${srv.url}${preload[0]}`);
    expect([font.status, font.headers.get("content-type"), font.headers.get("cache-control")]).toEqual([200, "font/woff2", "public, max-age=31536000, immutable"]);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    // the mono face (Geist Mono: the ocean's glyphs, what is signed) is this account's too, declared in the tokens and not preloaded: no
    // stylesheet asks another host, and every face the tokens name is served from here
    for (const css of styles()) expect(source(css), css).not.toMatch(/fonts\.(googleapis|gstatic)\.com|@import/);
    expect(source("ui/tokens.css")).toMatch(/@font-face \{ font-family: "Geist Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url\(\/fonts\/geist-mono-v5-latin-400\.woff2\) format\("woff2"\)/);
    for (const m of source("ui/tokens.css").matchAll(/url\((\/fonts\/[a-z0-9-]+\.woff2)\)/g)) {
      const r = await fetch(`${srv.url}${m[1]}`);
      expect([m[1], r.status, r.headers.get("content-type")]).toEqual([m[1], 200, "font/woff2"]);
    }
    for (const path of ["/fonts/../server.ts", "/fonts/OFL.txt", "/fonts/nope.woff2"]) expect((await raw(path)).status, path).toBe(404);
  });

  it("answers nothing else under /ui/: no folder, no second dot, nothing encoded, no other kind of file, nothing that is not there", async () => {
    for (const path of ["/ui/..%2Fserver.ts", "/ui/a.ts", "/ui/x/y.js", "/ui/../server.ts", "/ui/%2e%2e%2fserver.ts", "/ui/..%2f..%2fserver.ts", "/ui/%2E%2E/server.ts", "/ui/core%2ejs", "/ui/core.js%00.ts", "/ui/Core.js", "/ui/core.min.js", "/ui/core.js/", "/ui/core.ts", "/ui/nothing-here.js", "/ui/nothing-here.css", "/ui/tokens.css.map", "/ui/", "/ui", "/account.js"]) {
      const r = await raw(path);
      expect(r.status, path).toBe(404);
      expect(r.body, path).not.toMatch(/startPortfolioServer|function render\(/);
    }
  });

  it("is the desktop shell in round 7's look: a rail with Markets · Trade and the Account at its foot (Portfolio · Venues · Memory under its own header), a top bar, five panes, one sheet, a drawer, an asking dialog, toasts that speak, and the background set before the first paint", () => {
    // the background is read before any stylesheet, in a guarded read: a window with storage off still paints Cream
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head.indexOf('localStorage.getItem("account.theme")')).toBeGreaterThan(0);
    expect(head.indexOf('localStorage.getItem("account.theme")')).toBeLessThan(head.indexOf("/ui/tokens.css"));
    expect(head).toMatch(/try\s*\{[^}]*localStorage/);
    for (const tab of ["portfolio", "venues", "memory", "markets", "trade"]) expect(html, tab).toMatch(new RegExp(`<section class="pane" data-pane="${tab}"[^>]*>[\\s\\S]*?<div id="pane-${tab}">`));
    // the rail's own two, and the Account at its foot opening its three, each a link to its route
    for (const tab of ["markets", "trade"]) expect(html, tab).toMatch(new RegExp(`<a href="#/${tab}" data-tab="${tab}">`));
    expect(html).toMatch(/<a class="rail-wallet" href="#\/portfolio" id="rail-wallet">/);
    for (const tab of ["portfolio", "venues", "memory"]) expect(html, tab).toMatch(new RegExp(`<a href="#/${tab}" data-acct="${tab}">`));
    for (const id of ["lens", "lens-menu", "search", "open-statement", "open-agents", "open-settings", "mode", "mode-note", "mode-more", "banner", "restored", "modal", "sheet", "modal-form", "drawer", "ask"]) expect(html, id).toContain(`id="${id}"`);
    // the IA round took the "+ Trade" pill (the nav item and the t key are the way), the ⧉ and the ≡ Menu off the chrome
    for (const gone of ["rail-trade", "copy-setup", "open-menu"]) expect(html, gone).not.toContain(`id="${gone}"`);
    expect(html).toMatch(/<dialog id="modal"><div id="sheet"><\/div><form method="dialog" id="modal-form"><\/form><\/dialog>/);
    expect(html).toMatch(/<div id="toasts" role="status" aria-live="polite"><\/div><div id="alerts" role="alert"/);
    // the search lives in the page, so a refresh neither freezes nor wipes it
    expect(html).toMatch(/<form class="search" id="search-form" role="search" data-live( data-only="trading")?>/);
    // the mode at the rail's foot (Guard | Beast; the wire values stay guard | open); the background is a Settings matter, drawn there
    expect(html).not.toContain("data-set-theme");
    expect(html).toContain('data-set-mode="guard"');
    expect(html).toContain('data-set-mode="open"');
  });

  it("draws every icon it names from its own sprite: no outside logo, no icon missing", () => {
    const sprite = new Set([...html.matchAll(/<symbol id="i-([a-z-]+)"/g)].map((m) => m[1]));
    const used = new Set([...[...html.matchAll(/href="#i-([a-z-]+)"/g)].map((m) => m[1]), ...readdirSync(join(PUBLIC, "ui")).filter((f) => f.endsWith(".js")).flatMap((f) => [...source(`ui/${f}`).matchAll(/\bicon\("([a-z-]+)"/g)].map((m) => m[1]))]);
    expect([...used].filter((n) => !sprite.has(n))).toEqual([]);
    expect(html).not.toMatch(/<img\b[^>]*src="https?:/);
  });

  it("declares every name once: joined in the page's order they compile as one script, and each runs in turn in one global scope as a browser runs them", () => {
    const files = scripts().map((src) => ({ src, text: source(src) }));
    // two `const`s of one name, or a `const` and a function, in one script is a SyntaxError
    expect(() => new Script(files.map((f) => f.text).join("\n;\n"), { filename: "account-page.js" })).not.toThrow();
    // two top-level functions of one name are not: the later would replace the earlier without a word
    const names = files.flatMap((f) => [...f.text.matchAll(/^(?:async\s+)?function\s*\*?\s*([\w$]+)|^(?:const|let|var|class)\s+([\w$]+)/gm)].map((m) => m[1] ?? m[2]));
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);

    // what a script touches as it loads: the elements it hangs listeners on, the wallets' announcement, the route, the background (whose
    // storage may be off) and — from shell.js, last — the device key, which is asked for and never answers here, so nothing is fetched or drawn
    const b = browser();
    expect(b.opened).toEqual(["buyer-agent-owner"]);
    expect(b.stored).toEqual(["account.theme"]);
    // the shell and the contract it gives the panes
    const contract = ["render", "load", "own", "cancelOrder", "api", "forget", "refusalOf", "toast", "openSheet", "closeSheet", "openDrawer", "closeDrawer", "confirmSheet", "pickSheet", "whatYouSign", "quoteDialog", "paint", "go", "onRoute", "routed", "lensNow", "inLens", "chg", "avatar", "icon", "table", "seg", "field", "select", "formFields", "setOptions", "debounce", "thenLoad", "download", "copyText", "esc", "money", "fine", "px", "usd", "cents", "short", "qtyOf", "typeText", "isLive", "byOf", "readOnlyWords", "owns", "writesOn", "canTrade", "canMove", "isAgentWallet", "modeOf", "dollarsOf", "isDollar", "networksOf", "bridgeChainsOf", "walletFor", "mined"];
    const mine = ["openStatement", "renderStatement", "openAgents", "openSettings", "openMode", "renderAgents", "renderDevices", "renderDial", "setMode", "setTheme", "drawThemeToggle", "toggleTheme", "copySetup", "shSearchesOf", "shSearchRemember", "shSearchesClear", "shPaletteRows", "shPaletteNext", "shPaletteDraw", "shPaletteRead", "shPaletteClose", "shPaletteChoose", "downloadBalances", "lensMenu", "drawPane", "tradeModeLast", "setTradeMode", "openShortcuts"];
    // what the other parts already define, and the shell calls
    const there = ["openPicker", "openConnect", "connectVia", "keyHowFor", "openLiveMove", "openAmend", "renderWallets", "openClose", "declineAsk", "rlDraw", "rlStart"];
    const all = [...contract, ...mine, ...there];
    expect(b.run(`[${all.join(", ")}].map((f) => typeof f)`), all.join(" ")).toEqual(Array(all.length).fill("function"));
    // what the panes are to define: a function when it is there, and nothing else under that name
    const panes = ["renderPortfolio", "renderVenues", "renderMemory", "renderMarkets", "renderTrade", "openTicket", "openHandToAgent", "openReceive", "openAsset", "openMarket"];
    for (const p of panes) expect(["function", "undefined"], p).toContain(b.run(`typeof ${p}`));
    expect(b.run("[A, busy, flash, said, S.length, ROUTE.tab, view.lens]")).toEqual([null, false, "", "", 0, "portfolio", ""]);
  });

  it("flips the background from the top bar's toggle, which is pressed on Black and says which background a press switches to; Settings keeps the same choice", () => {
    const b = browser();
    b.run(`
      var TOGGLE = { attrs: { "aria-pressed": "false" }, title: "", listeners: [], setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(_t, fn) { this.listeners.push(fn); }, querySelector: (s) => (s === "use" ? USE : null) };
      var USE = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
      var real = document.getElementById;
      document.getElementById = (id) => (id === "theme-toggle" ? TOGGLE : real(id));
    `);
    expect(b.run("setTheme('cream'); [document.documentElement.dataset.theme, TOGGLE.attrs['aria-pressed'], TOGGLE.attrs['aria-label'], TOGGLE.title, USE.attrs.href]")).toEqual(["cream", "false", "Switch to the Black background", "Black background", "#i-moon"]);
    expect(b.run("toggleTheme(); [document.documentElement.dataset.theme, TOGGLE.attrs['aria-pressed'], TOGGLE.attrs['aria-label'], TOGGLE.title, USE.attrs.href]")).toEqual(["black", "true", "Switch to the Light background", "Light background", "#i-sun"]);
    expect(b.run("toggleTheme(); document.documentElement.dataset.theme")).toBe("cream");
    // storage is off in this window: the choice held for the visit, and nothing threw
    expect(b.stored.filter((k) => k === "account.theme").length).toBeGreaterThan(1);
    expect(html).toMatch(/<button type="button" class="icon-btn" id="theme-toggle" aria-pressed="false" aria-label="Switch to the Black background"/);
  });

  it("the search palette: the matches as rows under the box, the recent searches while it is empty, and the keys that walk them", () => {
    const b = browser();
    // the matches, as Markets names a market, escaped; an event in cents; eight at most
    const item = (i: number, extra: Record<string, unknown> = {}) => ({ key: `coin:X${i}`, kind: "coin", name: `Coin <${i}>`, base: `X${i}`, price: 10 + i, changePct24h: 1.5, at: [{ venue: "ex", venueName: "Exchange X", symbol: `X${i}/USDT`, connected: true, public: false, canTrade: true }], ...extra });
    b.run(`var BODY = ${JSON.stringify({ ok: true, items: [...Array(10).keys()].map((i) => item(i)) })}`);
    const rows = String(b.run('shPaletteRows(BODY, "x")'));
    expect(rows.match(/<button type="button" role="option" data-pal-i="\d+">/g)).toHaveLength(8);
    expect(rows).toContain("<b>Coin &lt;0&gt;</b>");
    expect(rows).toContain("Exchange X");
    expect(rows).toContain("$10.00");
    expect(rows).not.toContain("<1>");
    const ev = String(b.run(`shPaletteRows({ ok: true, items: [${JSON.stringify(item(0, { kind: "event", name: "Fed cuts?", outcomes: [{ label: "YES", price: 0.62, at: [] }] }))}] }, "fed")`));
    expect(ev).toContain("62¢");
    // nothing, and a read on its way
    expect(b.run('shPaletteRows({ ok: true, items: [] }, "zzz")')).toContain("Nothing matches “zzz”");
    expect(b.run('shPaletteRows(null, "zzz")')).toContain("Looking…");
    // the box empty: a hint while nothing is remembered (storage is off in this window, and remembering throws nothing)
    expect(b.run("shSearchRemember('btc'); shPaletteRows(null, '')")).toContain("Type to search markets");
    // with storage: newest first, once whatever the case, eight at most, sixty characters at most; Clear forgets them
    b.run("var STORE = {}; localStorage = { getItem: (k) => (k in STORE ? STORE[k] : null), setItem: (k, v) => { STORE[k] = v; }, removeItem: (k) => { delete STORE[k]; } }");
    b.run("for (const q of ['BTC', 'eth', 'btc', 'sol', 'a', 'b', 'c', 'd', 'e', 'f']) shSearchRemember(q); shSearchRemember(' ' + 'x'.repeat(80) + ' ')");
    expect(b.run("shSearchesOf()")).toEqual(["x".repeat(60), "f", "e", "d", "c", "b", "a", "sol"]);
    expect(b.run("shSearchRemember('SOL'); shSearchesOf()[0]")).toBe("SOL");
    expect(b.run("shSearchesOf().filter((s) => s.toLowerCase() === 'sol').length")).toBe(1);
    const recent = String(b.run("shPaletteRows(null, '')"));
    expect(recent).toContain('<div class="menu-h" role="presentation">Recent</div>');
    expect(recent).toContain('data-pal-q="SOL"');
    expect(recent).toContain("data-pal-clear");
    expect(b.run("shSearchesClear(); shSearchesOf()")).toEqual([]);
    // the keys: ↓ from the box to the first row; along the rows; ↑ from the first back to the box; Home and End; nothing else is the palette's
    expect(b.run("[shPaletteNext('ArrowDown', 3, -1, true), shPaletteNext('ArrowUp', 3, -1, true), shPaletteNext('ArrowDown', 0, -1, true)]")).toEqual([0, null, null]);
    expect(b.run("[shPaletteNext('ArrowDown', 3, 0, false), shPaletteNext('ArrowDown', 3, 2, false), shPaletteNext('ArrowUp', 3, 1, false), shPaletteNext('ArrowUp', 3, 0, false), shPaletteNext('Home', 3, 2, false), shPaletteNext('End', 3, 0, false), shPaletteNext('Enter', 3, 1, false)]")).toEqual([1, 2, 0, "input", 0, 2, null]);
    // the page: the box is a combobox over the listbox the rows go in
    expect(html).toMatch(/<input type="search" id="search" role="combobox" aria-expanded="false" aria-controls="search-menu" aria-autocomplete="list"/);
    expect(html).toContain('<div class="menu search-menu" id="search-menu" role="listbox" aria-label="Search results" hidden></div>');
  });

  it("shows the keys behind ? — every group with its keys and words, the chord's modifier the platform's — not while typing in a field, and from Settings' button", () => {
    const b = browser();
    b.run("var SHEETS = []; openSheet = (html, o) => { SHEETS.push([o.title, html]); return null; }");
    const press = (key: string, target: unknown) => {
      for (const fn of b.heard.keydown ?? []) fn({ key, target, preventDefault() {}, altKey: false, metaKey: false, ctrlKey: false, shiftKey: true, defaultPrevented: false });
    };
    press("?", { closest: () => null });
    const sheets = b.run("SHEETS") as Array<[string, string]>;
    expect(sheets).toHaveLength(1);
    expect(sheets[0]![0]).toBe("Keyboard");
    const html = sheets[0]![1];
    const groups = b.run("SHORTCUTS.map((g) => [g.where, g.keys.length])") as Array<[string, number]>;
    expect(groups.map((g) => g[0])).toEqual(["Anywhere", "Search", "Trade · the picker", "Trade · the order book", "The chart, with the plot focused", "Superagent"]);
    for (const [where, n] of groups) {
      expect(n).toBeGreaterThan(1);
      expect(html).toContain(`<h3 class="label">${where}</h3>`);
    }
    // every row has keys and words; the keys as <kbd>; no key is named twice in one group
    const rows = b.run("SHORTCUTS.flatMap((g) => g.keys.map(([ks, what]) => [ks, what]))") as Array<[string[], string]>;
    for (const [ks, what] of rows) {
      expect(ks.length).toBeGreaterThan(0);
      expect(what.length).toBeGreaterThan(3);
      for (const k of ks) expect(html).toContain(`<kbd>${k}</kbd>`);
    }
    expect(html).toContain("<kbd>Ctrl K</kbd>");
    expect(html).toContain('<dt><kbd>?</kbd></dt><dd>These keys</dd>');
    expect(html).toContain("nothing here signs anything");
    // typing in a field: the key is the field's
    press("?", { closest: (sel: string) => (sel.includes("input") ? {} : null) });
    expect((b.run("SHEETS") as unknown[]).length).toBe(1);
    // Settings' button
    for (const fn of b.heard.click ?? []) fn({ target: { closest: (sel: string) => (sel === "[data-open-shortcuts]" ? {} : null) }, preventDefault() {} });
    expect((b.run("SHEETS") as unknown[]).length).toBe(2);
  });

  it("makes Trade one place in two modes: html[data-area] set in the area and taken away outside it, the switch pressed for the mode showing, the rail's Trade current in both, the mode kept only by the switch", () => {
    const b = browser();
    b.run(`
      var mk = (data) => ({ dataset: data, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } });
      var LINKS = [mk({ tab: "markets" }), mk({ tab: "trade" })];
      var MODES = [mk({ tradeMode: "regular" }), mk({ tradeMode: "superagent" })];
      document.querySelectorAll = (sel) => (sel === ".rail-nav a[data-tab]" ? LINKS : sel === "#trade-mode button[data-trade-mode]" ? MODES : []);
      document.querySelector = (sel) => (sel === '.rail-nav a[data-tab="trade"]' ? LINKS[1] : null);
      // the browser writes the canonical hash in place, as history.replaceState does (no hashchange of its own)
      history.replaceState = (_s, _t, h) => { location.hash = h; };
      var state = () => JSON.stringify({ area: document.documentElement.dataset.area || null, pressed: MODES.map((m) => m.attrs["aria-pressed"]), current: LINKS.map((a) => a.attrs["aria-current"] || null), href: LINKS[1].attrs.href, tab: ROUTE.tab, hash: location.hash });
    `);
    const at = (hash: string) => JSON.parse(String(b.run(`location.hash = ${JSON.stringify(hash)}; routed(); state()`)));
    // Superagent: the area, its half of the switch pressed, the rail's Trade current; the older link written as the canonical one, in place.
    // Inside the area the rail's Trade points at the place showing: the item the viewer is on goes nowhere else
    expect(at("#/superagent?venue=paper-1")).toEqual({ area: "trade", pressed: ["false", "true"], current: [null, "page"], href: "#/trade?mode=superagent&venue=paper-1", tab: "superagent", hash: "#/trade?mode=superagent&venue=paper-1" });
    expect(at("#/trade?mode=superagent")).toMatchObject({ area: "trade", pressed: ["false", "true"], current: [null, "page"], href: "#/trade?mode=superagent", tab: "superagent" });
    expect(at("#/trade")).toMatchObject({ area: "trade", pressed: ["true", "false"], current: [null, "page"], href: "#/trade", tab: "trade" });
    // outside the area: no area, the rail marks Markets, and its Trade opens the mode kept (none kept here: Regular)
    expect(at("#/markets")).toMatchObject({ area: null, current: ["page", null], href: "#/trade", tab: "markets" });
    expect(at("#/portfolio")).toMatchObject({ area: null, current: [null, null], tab: "portfolio" });
    // the switch keeps the mode (storage off here: it says so by throwing, and the page goes on) and goes there
    b.run('setTradeMode("superagent", { venue: "paper-1" })');
    expect(b.stored).toEqual(["account.theme", "account.tradeMode"]);
    expect(b.run("location.hash")).toBe("#/trade?mode=superagent&venue=paper-1");
    // storage on: the rail's Trade opens the mode used last — from outside the area
    b.run('var KEPT = { "account.tradeMode": "superagent" }; localStorage.getItem = (k) => (k in KEPT ? KEPT[k] : null); localStorage.setItem = (k, v) => { KEPT[k] = String(v); }; location.hash = "#/markets"; routed()');
    expect(b.run("LINKS[1].attrs.href")).toBe("#/trade?mode=superagent");
    expect(b.run("tradeModeLast()")).toBe("superagent");
    // Superagent kept, Regular showing (the browser's Back, or a link to #/trade?kind=…): the rail's Trade is current and stays on Regular,
    // so pressing the item the viewer is on never throws them into the other mode
    expect(at("#/trade?kind=perps")).toMatchObject({ area: "trade", pressed: ["true", "false"], current: [null, "page"], href: "#/trade?kind=perps", tab: "trade" });
    expect(at("#/trade")).toMatchObject({ href: "#/trade", tab: "trade" });
    // the switch itself, pressed as a browser presses it: through the shell's one click handler on the document. The half not pressed goes
    // to its mode and keeps it; the half pressed does nothing
    const click = (mode: string) =>
      b.run(`(() => { const btn = MODES.find((m) => m.dataset.tradeMode === ${JSON.stringify(mode)}); const target = { closest: (sel) => (sel === "button[data-trade-mode]" ? btn : null) }; for (const fn of HEARD) fn({ target }); routed(); return state(); })()`);
    (b.ctx as Record<string, unknown>).HEARD = b.heard.click ?? [];
    expect(b.heard.click?.length).toBeGreaterThan(0);
    b.run('KEPT["account.tradeMode"] = "regular"');
    expect(JSON.parse(String(click("regular")))).toMatchObject({ tab: "trade", hash: "#/trade" });
    expect(b.run('KEPT["account.tradeMode"]')).toBe("regular");
    expect(JSON.parse(String(click("superagent")))).toMatchObject({ tab: "superagent", pressed: ["false", "true"], hash: "#/trade?mode=superagent", href: "#/trade?mode=superagent" });
    expect(b.run('KEPT["account.tradeMode"]')).toBe("superagent");
    expect(JSON.parse(String(click("regular")))).toMatchObject({ tab: "trade", pressed: ["true", "false"], hash: "#/trade", href: "#/trade" });
    expect(b.run('KEPT["account.tradeMode"]')).toBe("regular");
  });

  it("gives the rail the trading area's colours while the area shows — the page behind it too, so no light strip shows under it — over a short fade (none under reduced motion), its shape, face and weights the Account's", () => {
    const tokens = source("ui/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const shell = source("ui/shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
    // the colours on html itself (so the rail and the page's background take them), the shape and face on the area's containers only
    const colours = /:root\[data-area="trade"\],\s*:root\[data-area="trade"\] :is\(\.main, #modal, #drawer, #ask, \.toast-stack\) \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
    for (const d of ["--bg: var(--hl-ground);", "--surface: var(--hl-glass);", "--text: var(--hl-text);", "--dim: var(--hl-dim);", "--rail-bg: var(--hl-glass);", "--hl-glass: rgba(255, 255, 255, 0.95);", "--hl-panel: #fdfdfc;", "--hl-buy: #00843d;", "--hl-sell: #da291c;", "--hl-mark: #00843d;", "--warn: var(--hl-warn);", "color-scheme: light;"]) expect(colours, d).toContain(d);
    // the area wears the background the Account wears: Black's values for the same names, chosen or the system's dark; the ocean behind it
    // is the background's own (the area sets none of the ocean's colours)
    const black = /:root\[data-theme="black"\]\[data-area="trade"\],\s*:root\[data-theme="black"\]\[data-area="trade"\] :is\(\.main, #modal, #drawer, #ask, \.toast-stack\) \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
    for (const d of ["--hl-glass: rgba(9, 10, 12, 0.82);", "--hl-panel: #0a0b0d;", "--hl-buy: #00843d;", "--hl-sell: #da291c;", "--hl-mark: #00843d;", "--hl-up: #3bb360;", "--hl-down: #ff7360;", "color-scheme: dark;"]) expect(black, d).toContain(d);
    expect(tokens).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\)\[data-area="trade"\],/);
    expect(colours + black).not.toContain("--oc-");
    for (const d of ["--font-sans", "--radius-pill", "font-weight", "font-family"]) expect(colours, d).not.toContain(d);
    const shape = [...tokens.matchAll(/(?:^|\})\s*:root\[data-area="trade"\] :is\(\.main, #modal, #drawer, #ask, \.toast-stack\) \{([^}]*)\}/g)].map((m) => m[1] ?? "").join("");
    for (const d of ['--font-sans: "Inter"', "--radius-pill: 3px;", "font-weight: 400;"]) expect(shape, d).toContain(d);
    // the rail: no edge beside the main column, its current item in HL's bright accent, its colours fading over 0.2 s — and cut under
    // reduced motion
    expect(shell).toContain(':root[data-area="trade"] .rail { border-right-color: transparent; }');
    expect(shell).toContain(':root[data-area="trade"] .rail-nav a[aria-current="page"] { color: var(--hl-accent); }');
    // the page fades its background only — never its text colour, which every word in a pane inherits: a fade from the area's near-white
    // back to the Account's ink would leave Markets' words near-white on white cards for its length — and .main takes its ink at once
    expect(shell).toMatch(/\nhtml, body \{ transition: background-color 0\.2s ease-in-out; \}/);
    expect(shell).not.toMatch(/\nhtml, body[^{]*\{ transition:[^}]*[\s,]color 0\.2s/);
    expect(shell).toMatch(/\n\.main \{ color: var\(--text\); \}/);
    expect(shell).toMatch(/\n\.rail, \.rail-wallet, \.rail-pill, [^{]*\{ transition: background-color 0\.2s ease-in-out, color 0\.2s ease-in-out, border-color 0\.2s ease-in-out; \}/);
    const reduced = shell.slice(shell.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/html, body, \.rail, \.rail-wallet, \.rail-pill, \.rail-nav\.moves \.rail-pill, [^{]*\{ transition: none; \}/);
    // nothing of the area's grammar reaches the rail: every shared-class rule of the area is scoped to its containers
    expect(shell).not.toMatch(/:where\(:root\[data-area="trade"\]\) (?!:is\(#modal, #drawer, #ask\))/);
    // a hover's colour only where there is a pointer: outside (hover: hover) a hover rule of the area only sets the rest look back
    const top: string[] = [];
    let depth = 0;
    let media = "";
    let start = 0;
    for (let i = 0; i < shell.length; i++) {
      const ch = shell[i];
      if (ch === "{") {
        const head = shell.slice(start, i).trim();
        if (depth === 0 && head.startsWith("@media")) media = head;
        else if (!(media === "@media (hover: hover)" && depth === 1)) top.push(head + " {" + shell.slice(i + 1, shell.indexOf("}", i)) + "}");
        depth++;
        start = i + 1;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) media = "";
        start = i + 1;
      }
    }
    const lit = top.filter((r) => /data-area="trade"/.test(r) && /:hover/.test(r.split("{")[0] ?? "") && /var\(--hl-(accent|title|inset-hover)\)/.test(r.split("{")[1] ?? ""));
    expect(lit).toEqual([]);
  });


  it("marks the Account in its green — the mark beside its name, the rail's current item, a chosen tab, in both backgrounds and the trading area — and keeps the red for down, a sell and a loss alone, never in the ocean's glints or bursts", () => {
    const tokens = source("ui/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const shell = source("ui/shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
    // each background (Light, Black, the system's dark) points the mark at the green, and the trading area's line under a chosen tab is it
    expect(tokens.match(/--mark: var\(--green\);/g)).toHaveLength(3);
    expect(tokens).not.toContain("--mark: var(--red)");
    expect(tokens.match(/--hl-mark: #00843d;/g)).toHaveLength(3);
    // what wears the mark: the square beside the Account's name (white on the green, 4.8:1), the rail's current item, a chosen tab
    expect(shell).toMatch(/\.brand-mark \{[^}]*background: var\(--mark\); color: #ffffff;/);
    expect(shell).toContain('.rail-nav a[aria-current="page"] { background: var(--surface-2); color: var(--text); font-weight: 600; box-shadow: inset 2px 0 0 var(--mark); }');
    expect(shell).toContain('.tabs button[aria-pressed="true"]::after { background: var(--mark); }');
    // the red names a fall alone: the pair's own name, down, a sell, a candle that fell
    const reds = new Set([...tokens.matchAll(/(--[\w-]+): #da291c;/g)].map((m) => m[1]));
    expect(reds).toEqual(new Set(["--red", "--down", "--hl-sell", "--hl-down", "--hl-candle-down"]));
    // the ocean: no red in its glints, its bursts in the green, its sharks half see-through, in each background
    const glints = [...tokens.matchAll(/--oc-glints: ([^;]*);/g)].map((m) => m[1]);
    expect(glints).toHaveLength(3);
    for (const g of glints) expect(g).not.toMatch(/#da291c|#ff7360/i);
    expect([...tokens.matchAll(/--oc-spark: ([^;]*);/g)].map((m) => m[1])).toEqual(["#00843d", "#3bb360", "#3bb360"]);
    expect(tokens.match(/--oc-shark-opacity: 0\.5;/g)).toHaveLength(3);
  });
  it("gives the panes helpers that say up and down without colour alone, tables, toggles and the route, each as written in the contract", () => {
    const b = browser();
    const r = (code: string) => b.run(code);
    // a change: ▲ up / ▼ down, a word for a screen reader, the amount; nothing known is a dash
    expect(r('chg(2.14)')).toBe('<span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 2.1%</span>');
    expect(r('chg(-0.6)')).toBe('<span class="down"><span aria-hidden="true">▼</span><span class="sr">down</span> 0.60%</span>');
    expect(r('chg(-38.2, "$")')).toContain("▼</span><span class=\"sr\">down</span> $38.20");
    expect(r('chg(3, "¢")')).toContain("▲</span><span class=\"sr\">up</span> 3¢");
    expect(r("chg(undefined)")).toBe('<span class="flat">—</span>');
    expect(r("chg(0)")).toBe('<span class="flat">0.00%</span>');
    // a letter tile, escaped; a table with its header and an empty table's words
    expect(r('avatar("usdc")')).toBe('<span class="av" aria-hidden="true">USDC</span>');
    expect(r('avatar("<b>")')).toBe('<span class="av" aria-hidden="true">B</span>');
    const t = String(r('table([{ label: "Asset", cell: (x) => esc(x.a) }, { label: "Value", r: true, cell: (x) => money(x.v) }, { cell: () => "" }], [{ a: "BTC<", v: 5 }], { rowAttr: () => \'class="click"\' })'));
    expect(t).toContain('<th scope="col">Asset</th><th scope="col" class="r">Value</th><th scope="col"><span class="sr">Actions</span></th>');
    expect(t).toContain('<tr class="click"><td>BTC&lt;</td><td class="r">$5.00</td><td></td></tr>');
    expect(r('table([{ label: "A", cell: () => "" }], [], { empty: "Nothing held." })')).toBe('<p class="empty">Nothing held.</p>');
    // a toggle: the pressed one says so; what pressing another does is kept by its id
    const s = String(r('seg([["1d", "1D"], ["1w", "1W"]], "1w", () => {}, { label: "Range" })'));
    expect(s).toMatch(/^<div class="seg" role="group" aria-label="Range" data-seg="seg-\d+"><button type="button" data-v="1d" aria-pressed="false">1D<\/button><button type="button" data-v="1w" aria-pressed="true">1W<\/button><\/div>$/);
    expect(r(`SEGS.has(${JSON.stringify(/data-seg="([^"]+)"/.exec(s)?.[1])})`)).toBe(true);
    // what the owner signs, as the device key signs it
    expect(r('whatYouSign({ shown: [{ name: "venue", value: "okx" }, { name: "symbol", value: "BTC/USDT" }] })')).toBe('<details class="signs"><summary>What you sign</summary><pre>venue: okx\nsymbol: BTC/USDT</pre></details>');
    expect(r("whatYouSign(null)")).toBe("");
    // the route: the hash names the tab and what it shows; anything else is the Portfolio
    expect(r('JSON.stringify(routeOf("#/markets?tab=crypto&q=btc"))')).toBe('{"tab":"markets","params":{"tab":"crypto","q":"btc"}}');
    expect(r('routeOf("#/nowhere").tab')).toBe("portfolio");
    expect(r('routeOf("").tab')).toBe("portfolio");
    expect(r('hashOf("trade", { tile: "swap", q: "" })')).toBe("#/trade?tile=swap");
    // Trade's two modes: the mode in the query, never a pane's param
    expect(r('JSON.stringify(routeOf("#/trade?mode=superagent&venue=p"))')).toBe('{"tab":"superagent","params":{"venue":"p"}}');
    expect(r('hashOf("superagent", { venue: "p" })')).toBe("#/trade?mode=superagent&venue=p");
    // before the account is read, the lens is every account and every row is in it
    expect(r('JSON.stringify(lensNow())')).toBe('{"kind":"all","id":"","name":"All accounts"}');
    expect(r('inLens("okx", "0xabc")')).toBe(true);
    expect(r('esc(`<a href="x" title=\'y\'>&`)')).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;");
  });

  it("asks the account once for a read that is already on its way, keeps it as long as asked, and keeps nothing that never arrived", async () => {
    const asked: string[] = [];
    let fail = false;
    const b = browser({
      fetch: async (path) => {
        asked.push(path);
        if (fail) throw new Error("connection refused");
        return { status: 200, statusText: "OK", json: async () => ({ ok: true, path, n: asked.length }) };
      },
    });
    const ctx: Context = b.ctx;
    const api = (path: string, ttl?: number) => runInContext(`api(${JSON.stringify(path)}${ttl ? `, { ttl: ${ttl} }` : ""})`, ctx) as Promise<{ ok: boolean; n?: number; error?: string }>;
    const [one, two] = await Promise.all([api("/api/account/holdings"), api("/api/account/holdings")]);
    expect(asked).toEqual(["/api/account/holdings"]);
    expect(one).toEqual(two);
    // kept: asked again within its ttl, it is not fetched again; without a ttl it is
    expect((await api("/api/account/holdings", 60_000)).n).toBe(1);
    expect((await api("/api/account/holdings")).n).toBe(2);
    // a request that never reached the account is an answer of its own, not kept
    fail = true;
    expect(await api("/api/account/explore", 60_000)).toEqual({ ok: false, error: "connection refused" });
    fail = false;
    expect((await api("/api/account/explore", 60_000)).ok).toBe(true);
    expect(runInContext('refusalOf({ ok: false, refusal: { message: "OKX: this key cannot trade" } })', ctx)).toBe("OKX: this key cannot trade");
  });

  it("keeps nothing of the page as it was before its panes: no bridge to the earlier sections, none of their renderers, and no rule in account.css that nothing draws any more", () => {
    // all three panes draw themselves: the shell's bridge to the earlier sections, and what only it called, are gone
    expect(source("ui/shell.js")).not.toMatch(/\bEARLIER\b/);
    const b = browser();
    const gone = ["EARLIER", "renderLiquidity", "renderAlloc", "renderWaiting", "renderAccounts", "renderPositions", "openTrade", "tkClose", "tkConnectArgs"];
    expect(b.run(`[${gone.map((n) => `typeof ${n}`).join(", ")}]`), gone.join(" ")).toEqual(Array(gone.length).fill("undefined"));
    // every class and id account.css styles is one a script (or the page) still draws
    const css = source("account.css").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^}]*\}/g, " ");
    const drawn = [html, ...readdirSync(join(PUBLIC, "ui")).filter((f) => f.endsWith(".js")).map((f) => source(`ui/${f}`))].join("\n");
    const classes = new Set([...drawn.matchAll(/class="([^"]*)"/g)].flatMap((m) => (m[1] ?? "").split(/[^\w-]+/)).filter(Boolean));
    const ids = new Set([...drawn.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    expect([...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1] ?? ""))].filter((c) => !classes.has(c))).toEqual([]);
    expect([...new Set([...css.matchAll(/#([a-zA-Z][\w-]*)/g)].map((m) => m[1] ?? ""))].filter((i) => !ids.has(i))).toEqual([]);
  });

  it("copies the agent setup command the account gives — from the Agents sheet and the first steps alike — and the command run from its folder when it gives none", async () => {
    const b = browser();
    const copied: string[] = [];
    b.run("var COPIED = []; copyText = async (t) => { COPIED.push(t); }; var TOASTS = []; toast = (t) => TOASTS.push(t.html || t)");
    await b.run("copySetup()");
    b.run('A = { agentSetup: { command: "claude mcp add portfolio -e PORTFOLIO_URL=http://127.0.0.1:4820 -- npx tsx /Users/x/demo/src/portfolio/mcp.ts", url: "http://127.0.0.1:4820" } }');
    await b.run("copySetup()");
    copied.push(...(b.run("COPIED") as string[]));
    expect(copied).toEqual(["claude mcp add portfolio -e PORTFOLIO_URL=http://127.0.0.1:4820 -- npx tsx src/portfolio/mcp.ts", "claude mcp add portfolio -e PORTFOLIO_URL=http://127.0.0.1:4820 -- npx tsx /Users/x/demo/src/portfolio/mcp.ts"]);
    const said = b.run("TOASTS") as string[];
    expect(said[0]).toContain("Run it in this account's folder");
    expect(said[1]).toContain("Run it where your agent runs, then let the agent in under Agents.");
    // one copy, two places: the Agents sheet's button and the first steps' button both call it (the top bar's ⧉ and the menu are gone)
    expect(source("ui/agents-mount.js")).toContain('$("agents-setup").addEventListener("click", copySetup);');
    expect(source("ui/portfolio.js")).toContain("copySetup()");
    expect(source("ui/shell.js")).not.toContain("copy-setup");
  });

  it("asks nothing with the browser's own prompt, confirm or alert boxes: none in the shell's files, and the page as a whole adds none", () => {
    for (const f of SHELL) for (const fn of ["prompt", "confirm", "alert"]) expect((source(f).match(new RegExp(`\\b${fn}\\s*\\(`, "g")) ?? []).length, `${fn} in ${f}`).toBe(0);
    /* the last two — which account tops up an agent wallet (money.js) and closing a position (portfolio.js) — ask with pickSheet and
       confirmSheet now: none is left anywhere on the page */
    const ASKS_NOW: Record<string, number> = { prompt: 0, confirm: 0, alert: 0 };
    const page = [html, ...scripts().map(source)].join("\n");
    for (const [fn, most] of Object.entries(ASKS_NOW)) expect((page.match(new RegExp(`\\b${fn}\\s*\\(`, "g")) ?? []).length, fn).toBeLessThanOrEqual(most);
  });
});
