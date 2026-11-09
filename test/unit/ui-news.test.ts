import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE NEWS PANE (ui/news.js): the headlines as GET /api/account/news gives them — rows of a time, the publisher and the title (a link only
 * where the account gave one), by day; the topics with their counts; the words asked for; the feeds that answered and the ones that did
 * not, in their words; a skeleton while the first read is out and the refusal where it fails. Run as the page runs it: plain scripts in
 * one global scope after ui/core.js, in a vm with a stand-in document */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "news.js"];
const NOW = "2026-11-09T19:30:00.000Z";

function page(answer: (path: string) => unknown) {
  const asked: string[] = [];
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" } }, hidden: false },
    location: { hash: "#/news", origin: "http://127.0.0.1:4820" },
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
      const body = await answer(path);
      if (body === undefined) return new Promise(() => {});
      return { status: 200, statusText: "OK", json: async () => body };
    },
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  runInContext(`A = { venues: [], keys: [], now: ${JSON.stringify(NOW)} }; ROUTE.tab = "news"; var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false }`, ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const H = (id: string, title: string, at: string | undefined, source: string, sourceName: string, topics: string[], url?: string) => ({ id, title, ...(at ? { at } : {}), source, sourceName, topics, ...(url ? { url } : {}) });
const VIEW = {
  ok: true,
  asOf: NOW,
  items: [
    H("a", "Stocks climb as the day turns green", "2026-11-09T19:02:00.000Z", "cnbc", "CNBC", ["markets"], "https://www.cnbc.com/2026/11/09/x.html"),
    H("b", "Bitcoin holds above $62,000 <b>bold</b> & co", "2026-11-09T14:19:45.000Z", "coindesk", "CoinDesk", ["crypto"], "https://www.coindesk.com/y"),
    H("c", "A release from yesterday", "2026-11-08T22:00:00.000Z", "fed", "Federal Reserve", ["macro"]),
    H("d", "An older one", "2026-11-05T12:00:00.000Z", "ecb", "European Central Bank", ["macro"], "https://www.ecb.europa.eu/z"),
    H("e", "Undated words", undefined, "bbc", "BBC", ["markets"]),
  ],
  total: 5,
  sources: [{ id: "cnbc", name: "CNBC", readAt: NOW, count: 30 }, { id: "coindesk", name: "CoinDesk", readAt: NOW, count: 25 }, { id: "fed", name: "Federal Reserve", readAt: "2026-11-09T18:40:00.000Z", count: 20, late: true }, { id: "wsj", name: "Wall Street Journal", count: 0 }],
  missing: [{ venue: "fed", venueName: "Federal Reserve", why: "Federal Reserve did not answer in 5 s" }, { venue: "wsj", venueName: "Wall Street Journal", why: "Wall Street Journal is rate-limiting this machine: try again in a minute", code: "E_VENUE_UNREACHABLE" }],
  topics: [{ id: "markets", label: "Markets", count: 2 }, { id: "macro", label: "Macro & policy", count: 2 }, { id: "crypto", label: "Crypto", count: 1 }, { id: "companies", label: "Companies", count: 0 }],
  notes: ["Headlines as the publishers put them out in their own feeds.", "Each feed is kept 5 minutes."],
};

describe("the news pane", () => {
  it("draws the rows by day — Today, Yesterday, the day — each a New York time, the publisher and the title, a link only where the account gave one and escaped always; undated last", () => {
    const p = page(() => VIEW);
    const html = p.run<string>(`nwRowsHtml(${JSON.stringify(VIEW.items)}, { now: A.now })`);
    expect(html).toContain('<h2 class="label">Today · Mon 9 Nov</h2>');
    expect(html).toContain('<h2 class="label">Yesterday · Sun 8 Nov</h2>');
    expect(html).toContain('<h2 class="label">Thu 5 Nov</h2>');
    expect(html).toContain('<h2 class="label">Undated</h2>');
    expect(html.indexOf("Today")).toBeLessThan(html.indexOf("Yesterday"));
    expect(html.indexOf("Thu 5 Nov")).toBeLessThan(html.indexOf("Undated"));
    expect(html).toContain('<a class="nw-title" href="https://www.cnbc.com/2026/11/09/x.html" target="_blank" rel="noopener noreferrer">Stocks climb as the day turns green</a>');
    expect(html).toContain('<time class="nw-time mono" datetime="2026-11-09T19:02:00.000Z" title="Mon 9 Nov 14:02 New York">14:02</time>');
    expect(html).toContain('<span class="nw-src tag" title="CNBC">CNBC</span>');
    // escaped, never markup
    expect(html).toContain("Bitcoin holds above $62,000 &lt;b&gt;bold&lt;/b&gt; &amp; co");
    expect(html).not.toContain("<b>bold</b>");
    // no link given: words, not a link
    expect(html).toContain('<span class="nw-title">A release from yesterday</span>');
    expect(html).toContain('<span class="nw-time mono dim">—</span>');
    // compact: one list, no day headings
    const compact = p.run<string>(`nwRowsHtml(${JSON.stringify(VIEW.items.slice(0, 2))}, { compact: true })`);
    expect(compact).toContain('<ol class="nw-list nw-compact">');
    expect(compact).not.toContain("<h2");
    expect(p.run<string>("nwRowsHtml([])")).toBe("");
    expect(p.run<string>("nwRowsHtml(null)")).toBe("");
  });

  it("draws the pane: a skeleton while the first read is out, then the topics with their counts (the one asked pressed), the rows, the feeds that answered and the ones that did not in their words, the notes folded; the read is the route's topic and words", async () => {
    const p = page((path) => (path.includes("topic=crypto") ? { ...VIEW, items: VIEW.items.filter((h) => h.topics.includes("crypto")), topic: "crypto" } : VIEW));
    p.run("renderNews({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain('class="skel-rows"');
    expect(p.asked).toEqual(["/api/account/news?limit=120"]);
    await settle();
    await settle();
    p.run("renderNews({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<h2 class="h2">News</h2>');
    expect(html).toContain('<span class="nw-asof small dim">Read 14:30 New York</span>');
    expect(html).toContain('<button type="button" data-nw="topic" data-topic="" aria-pressed="true">All</button>');
    expect(html).toContain('<button type="button" data-nw="topic" data-topic="markets" aria-pressed="false">Markets <span class="count">2</span></button>');
    expect(html).toContain('<button type="button" data-nw="topic" data-topic="companies" aria-pressed="false">Companies</button>');
    expect(html).toContain("Stocks climb as the day turns green");
    expect(html).toContain("2 feeds answered: CNBC, CoinDesk · standing in from an earlier answer: Federal Reserve · nothing from Wall Street Journal (Wall Street Journal is rate-limiting this machine: try again in a minute).");
    expect(html).toContain("<summary>Where this comes from</summary><p>Headlines as the publishers put them out in their own feeds.</p>");
    expect(html).not.toContain("nw-q");
    // a topic and words: the read says them, the chip shows the words
    p.run("ROUTE.params = { topic: 'crypto', q: 'bitcoin <x>' }");
    p.run("renderNews({ el: EL, owner: true, lens: { kind: 'all' }, params: { topic: 'crypto', q: 'bitcoin <x>' } })");
    expect(p.asked.at(-1)).toBe("/api/account/news?topic=crypto&q=bitcoin+%3Cx%3E&limit=120");
    await settle();
    await settle();
    p.run("renderNews({ el: EL, owner: true, lens: { kind: 'all' }, params: { topic: 'crypto', q: 'bitcoin <x>' } })");
    const narrowed = p.run<string>("EL.innerHTML");
    expect(narrowed).toContain('data-topic="crypto" aria-pressed="true"');
    expect(narrowed).toContain('Headlines that carry <b>“bitcoin &lt;x&gt;”</b> · 5 headlines <button type="button" class="link" data-nw="clear">Clear</button>');
    expect(narrowed).toContain("Bitcoin holds above");
    expect(narrowed).not.toContain("Stocks climb");
  });

  it("a refusal is said in its words, and a later failure keeps what was read; the topic buttons and Clear move the route in place", async () => {
    let fail = false;
    const p = page(() => (fail ? { ok: false, refusal: { code: "E_VENUE_UNREACHABLE", message: "the feeds did not answer" } } : VIEW));
    fail = true;
    p.run("renderNews({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    await settle();
    await settle();
    p.run("renderNews({ el: EL, owner: true, lens: { kind: 'all' }, params: {} })");
    expect(p.run<string>("EL.innerHTML")).toContain('<div class="msg no">Couldn\'t read the news: the feeds did not answer.</div>');
    // the route moves in place: no history entry for a topic
    p.run("var MOVES = []; history.replaceState = (_s, _t, h) => MOVES.push(h)");
    p.run(`nwClick({ target: { closest: (s) => (s === "[data-nw]" ? { dataset: { nw: "topic", topic: "macro" } } : null) } })`);
    expect(p.run("MOVES")).toEqual(["#/news?topic=macro"]);
    p.run("ROUTE.params = { topic: 'macro', q: 'fed' }");
    p.run(`nwClick({ target: { closest: (s) => (s === "[data-nw]" ? { dataset: { nw: "clear" } } : null) } })`);
    expect(p.run("MOVES.at(-1)")).toBe("#/news?topic=macro");
  });
});
