import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { headlineId, linkOf, NASDAQ_SYMBOL_FEED, namesSymbol, NEWS_FAIL_MS, NEWS_FEEDS, NEWS_HOSTS, NEWS_KEEP_MS, NEWS_MAX_BYTES, NEWS_SEC_WORDS, NEWS_TIMEOUT_MS, NEWS_UA, NewsWire, orderHeadlines, type Headline, type NewsView } from "../../src/portfolio/live/news.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import { realHttp, type Http, type HttpReply } from "../../src/portfolio/live/types.ts";
import { NASDAQ_UA } from "../../src/portfolio/live/us-quotes.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";
import { no } from "../../src/portfolio/refuse.ts";

/** THE NEWS WIRE (live/news.ts): the publishers' feeds read keyless through the fixed-host guard, each kept five minutes and held a minute
 * when it refuses, the last answer standing in for a late one, the SEC's feed read with a declared user agent only and Nasdaq's with a
 * browser's, the headlines ordered and told apart, a share's own feed and the headlines that name it, the words asked for; the whole text
 * body a feed needs (types.ts maxBytes); and the route. The bodies are made up in the publishers' shapes; nothing leaves the process */
const START = Date.parse("2026-11-09T19:00:00Z");
const rss = (items: Array<{ title: string; link?: string; at?: string; id?: string }>, title = "A feed") => `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>${items.map((i) => `<item><title>${i.title}</title>${i.link ? `<link>${i.link}</link>` : ""}${i.at ? `<pubDate>${i.at}</pubDate>` : ""}${i.id ? `<guid>${i.id}</guid>` : ""}</item>`).join("")}</channel></rss>`;
const reply = (text: string, status = 200): HttpReply => ({ status, body: undefined, text });
const at = (minutesAgo: number) => new Date(START - minutesAgo * 60_000).toUTCString();

/** a network answering each feed by its URL, recording what was sent; a feed not set up answers 404 */
function network(routes: Record<string, HttpReply | (() => HttpReply | Promise<HttpReply>)>) {
  const sent: Array<{ url: string; headers: Record<string, string> | undefined }> = [];
  const http: Http = async (url, init) => {
    sent.push({ url, headers: init?.headers });
    const key = Object.keys(routes).find((k) => url === k || url.startsWith(k));
    if (!key) return reply("not here", 404);
    const r = routes[key]!;
    return typeof r === "function" ? r() : r;
  };
  return { http, sent };
}
const feedUrl = (id: string) => NEWS_FEEDS.find((f) => f.id === id)!.url;
/** every feed answering two items, the Fed's and CNBC's sharing a headline */
const ALL: Record<string, HttpReply> = Object.fromEntries(NEWS_FEEDS.map((f, i) => [f.url, reply(rss([{ title: `${f.name} says one thing`, link: `https://www.${f.hosts[0]}/one-${i}`, at: at(i * 3 + 1), id: `${f.id}-1` }, { title: `${f.name} says another`, link: `https://www.${f.hosts[0]}/two-${i}`, at: at(i * 3 + 2) }]))]));
function wire(routes: Record<string, HttpReply | (() => HttpReply | Promise<HttpReply>)>, o: { sec?: string; clock?: () => number; waitMs?: number } = {}) {
  const net = network(routes);
  let t = START;
  const clock = o.clock ?? (() => t);
  const w = new NewsWire({ http: fixedHosts(net.http, NEWS_HOSTS, NEWS_TIMEOUT_MS, { maxBytes: NEWS_MAX_BYTES }), clock, ...(o.sec ? { secUserAgent: o.sec } : {}), waitMs: o.waitMs ?? 200 });
  return { w, net, tick: (ms: number) => void (t += ms) };
}
const view = (v: NewsView | Refusal): NewsView => {
  if (isRefusal(v)) throw new Error(`${v.code}: ${v.message}`);
  return v;
};

describe("the news wire", () => {
  it("reads every feed of the day's list at once — the press releases apart — orders the headlines newest first and tells them apart, counts each feed and each topic, and asks the SEC's feed only with a declared user agent", async () => {
    const { w, net } = wire(ALL, { sec: "openpaper test@example.com" });
    const v = view(await w.headlines());
    // the releases feed is not in the day's list; the twelve others are
    expect(net.sent.map((s) => s.url)).not.toContain(feedUrl("prnewswire"));
    expect(net.sent).toHaveLength(NEWS_FEEDS.length - 1);
    expect(v.sources.map((s) => [s.id, s.count])).toEqual(NEWS_FEEDS.filter((f) => !f.apart).map((f) => [f.id, 2]));
    expect(v.total).toBe(24);
    expect(v.items).toHaveLength(24);
    expect(v.items[0]!.title).toBe("Federal Reserve says one thing");
    expect(v.items[0]).toMatchObject({ source: "fed", sourceName: "Federal Reserve", topics: ["macro"], url: "https://www.federalreserve.gov/one-0", at: new Date(START - 60_000).toISOString() });
    expect(Date.parse(v.items[0]!.at!)).toBeGreaterThan(Date.parse(v.items[23]!.at!));
    expect(v.topics).toEqual([{ id: "markets", label: "Markets", count: 10 }, { id: "macro", label: "Macro & policy", count: 6 }, { id: "crypto", label: "Crypto", count: 8 }, { id: "companies", label: "Companies", count: 0 }]);
    expect(v.missing).toEqual([]);
    expect(v.notes.some((n) => n.includes("PR Newswire"))).toBe(true);
    // the user agents: the SEC's the declared one, Nasdaq's a desktop browser's, every other the account's own; the accept header a feed's
    const by = (id: string) => net.sent.find((s) => s.url === feedUrl(id))!.headers!;
    expect(by("sec")["user-agent"]).toBe("openpaper test@example.com");
    expect(by("nasdaq")["user-agent"]).toBe(NASDAQ_UA);
    expect(by("cnbc")["user-agent"]).toBe(NEWS_UA);
    expect(by("cnbc").accept).toMatch(/^application\/rss\+xml/);
  });

  it("without SEC_CONTACT the SEC's feed is not asked and the answer says what to set; a topic asked is its feeds alone, and press releases come under Companies", async () => {
    const { w, net } = wire(ALL);
    const v = view(await w.headlines());
    expect(net.sent.map((s) => s.url)).not.toContain(feedUrl("sec"));
    expect(v.missing).toEqual([{ venue: "sec", venueName: "SEC", why: NEWS_SEC_WORDS, code: "E_ACCOUNT_CREDENTIAL" }]);
    expect(v.sources.find((s) => s.id === "sec")).toEqual({ id: "sec", name: "SEC", count: 0 });
    const c = view(await w.headlines({ topic: "companies" }));
    expect(c.sources.map((s) => s.id)).toEqual(["prnewswire"]);
    expect(c.items.map((h) => h.source)).toEqual(["prnewswire", "prnewswire"]);
    expect(c.topic).toBe("companies");
    const k = view(await w.headlines({ topic: "crypto", limit: 3 }));
    expect(k.items).toHaveLength(3);
    expect(k.total).toBe(8);
    expect(k.items.every((h) => h.topics.includes("crypto"))).toBe(true);
    expect(isRefusal(await w.headlines({ topic: "sports" }))).toBe(true);
    expect((await w.headlines({ topic: "sports" }) as Refusal).code).toBe("E_ACCOUNT_BAD_ACTION");
  });

  it("keeps each feed five minutes and asks it again after; a refusal is held a minute at least, longer where the publisher asked; a page that is not a feed, a body too long and a network failure are refusals in words, and the feed's last answer stands in", async () => {
    let calls = 0;
    let mode: "ok" | "429" | "page" | "long" | "throw" = "ok";
    const routes: Record<string, () => HttpReply | Promise<HttpReply>> = {
      [feedUrl("cnbc")]: () => {
        calls++;
        if (mode === "429") return { status: 429, body: undefined, text: "slow down", retryAfterMs: 120_000 };
        if (mode === "page") return reply("<!DOCTYPE html><html><body>Just a moment</body></html>");
        if (mode === "long") return { status: 200, body: undefined, text: "", tooLong: true };
        if (mode === "throw") throw new TypeError("fetch failed");
        return reply(rss([{ title: "CNBC says one thing", link: "https://www.cnbc.com/one", at: at(1) }]));
      },
    };
    const { w, tick } = wire(routes);
    const only = (v: NewsView | Refusal) => view(v).sources.find((s) => s.id === "cnbc")!;
    expect(only(await w.headlines({ topic: "markets" }))).toMatchObject({ count: 1 });
    expect(calls).toBe(1);
    tick(NEWS_KEEP_MS - 1);
    await w.headlines({ topic: "markets" });
    expect(calls).toBe(1);
    tick(2);
    await w.headlines({ topic: "markets" });
    expect(calls).toBe(2);
    // a 429 asking for two minutes: held that long, the last answer standing in and the refusal said
    mode = "429";
    tick(NEWS_KEEP_MS + 1);
    const held = view(await w.headlines({ topic: "markets" }));
    expect(calls).toBe(3);
    expect(held.sources.find((s) => s.id === "cnbc")).toMatchObject({ count: 1, late: true });
    expect(held.items.some((h) => h.source === "cnbc")).toBe(true);
    expect(held.missing.find((m) => m.venue === "cnbc")).toMatchObject({ venueName: "CNBC", why: "CNBC is rate-limiting this machine: try again in 2 minutes", code: "E_VENUE_UNREACHABLE" });
    tick(NEWS_FAIL_MS + 1);
    await w.headlines({ topic: "markets" });
    expect(calls).toBe(3);
    tick(120_000);
    mode = "page";
    const page = view(await w.headlines({ topic: "markets" }));
    expect(calls).toBe(4);
    expect(page.missing.find((m) => m.venue === "cnbc")).toMatchObject({ why: "CNBC answered something that is not a feed", code: "E_VENUE_REJECTED" });
    tick(NEWS_FAIL_MS - 1);
    await w.headlines({ topic: "markets" });
    expect(calls).toBe(4);
    tick(2);
    mode = "long";
    const long = view(await w.headlines({ topic: "markets" }));
    expect(long.missing.find((m) => m.venue === "cnbc")!.why).toBe("CNBC's feed is longer than 2 MB, so it was not read");
    tick(NEWS_FAIL_MS + 1);
    mode = "throw";
    const down = view(await w.headlines({ topic: "markets" }));
    expect(down.missing.find((m) => m.venue === "cnbc")).toMatchObject({ code: "E_VENUE_UNREACHABLE" });
    // clear() lets the holds go: the next read asks again
    w.clear();
    mode = "ok";
    await w.headlines({ topic: "markets" });
    expect(calls).toBe(7);
  });

  it("waits for the feeds only so long: a feed still out when the wait is up has its last answer stand in and is said as late — or gives nothing the first time", async () => {
    let hang = false;
    const routes: Record<string, () => Promise<HttpReply>> = {
      [feedUrl("coindesk")]: () => (hang ? new Promise(() => {}) : Promise.resolve(reply(rss([{ title: "CoinDesk says one thing", at: at(1) }])))),
      [feedUrl("cointelegraph")]: () => new Promise(() => {}),
    };
    const { w, tick } = wire(routes, { waitMs: 50 });
    const first = view(await w.headlines({ topic: "crypto" }));
    expect(first.sources.find((s) => s.id === "coindesk")).toMatchObject({ count: 1 });
    expect(first.sources.find((s) => s.id === "cointelegraph")).toEqual({ id: "cointelegraph", name: "Cointelegraph", count: 0 });
    expect(first.missing.find((m) => m.venue === "cointelegraph")).toEqual({ venue: "cointelegraph", venueName: "Cointelegraph", why: "Cointelegraph did not answer in 0 s" });
    hang = true;
    tick(NEWS_KEEP_MS + 1);
    const second = view(await w.headlines({ topic: "crypto" }));
    expect(second.sources.find((s) => s.id === "coindesk")).toMatchObject({ count: 1, late: true });
    expect(second.items.some((h) => h.title === "CoinDesk says one thing")).toBe(true);
  });

  it("a share: its own feed from Nasdaq (the symbol on each headline) and every headline that names it; words asked for narrow the list; a ticker that is none is refused before anything is asked", async () => {
    const routes = {
      ...ALL,
      [`${NASDAQ_SYMBOL_FEED}NVDA`]: reply(rss([{ title: "Nvidia reports", link: "https://www.nasdaq.com/articles/nvidia-reports", at: at(5) }, { title: "Chips rally", link: "https://www.nasdaq.com/articles/chips", at: at(7) }])),
      [feedUrl("cnbc")]: reply(rss([{ title: "NVDA slides after a probe", link: "https://www.cnbc.com/nvda", at: at(2) }, { title: "The $NVDA trade", link: "https://www.cnbc.com/trade", at: at(3) }, { title: "Nothing about it: ENVDAX", link: "https://www.cnbc.com/x", at: at(4) }])),
    };
    const { w, net } = wire(routes);
    const v = view(await w.headlines({ symbol: "nvda" }));
    expect(net.sent.some((s) => s.url === `${NASDAQ_SYMBOL_FEED}NVDA`)).toBe(true);
    expect(v.symbol).toBe("NVDA");
    expect(v.items.map((h) => [h.title, h.symbol ?? null])).toEqual([["NVDA slides after a probe", null], ["The $NVDA trade", null], ["Nvidia reports", "NVDA"], ["Chips rally", "NVDA"]]);
    expect(v.sources[0]).toMatchObject({ id: "nasdaq:NVDA", name: "Nasdaq", count: 2 });
    expect(v.notes.some((n) => n.startsWith("NVDA:"))).toBe(true);
    const q = view(await w.headlines({ q: "says ONE" }));
    expect(q.items.every((h) => /says one/i.test(h.title))).toBe(true);
    expect(q.q).toBe("says ONE");
    const bad = (await w.headlines({ symbol: "not a ticker" })) as Refusal;
    expect(bad.code).toBe("E_ACCOUNT_BAD_ACTION");
  });

  it("a link is kept only where it is https, plain, and on one of the feed's own hosts or under one; the id is the feed and the publisher's own id, link or title", () => {
    const hosts = ["cnbc.com", "bbc.co.uk"];
    expect(linkOf("https://www.cnbc.com/2026/11/09/x.html", hosts)).toBe("https://www.cnbc.com/2026/11/09/x.html");
    expect(linkOf("https://cnbc.com/x", hosts)).toBe("https://cnbc.com/x");
    expect(linkOf("https://news.bbc.co.uk/x", hosts)).toBe("https://news.bbc.co.uk/x");
    for (const bad of ["http://www.cnbc.com/x", "javascript:alert(1)", "https://evil.example/x", "https://www.cnbc.com.evil.example/x", "https://user:pw@www.cnbc.com/x", "https://www.cnbc.com:8443/x", "not a url", ""]) expect(linkOf(bad, hosts), bad).toBeUndefined();
    expect(linkOf(undefined, hosts)).toBeUndefined();
    expect(headlineId("fed", { id: "a", link: "b", title: "c" })).toBe(headlineId("fed", { id: "a", link: "x", title: "y" }));
    expect(headlineId("fed", { title: "c" })).not.toBe(headlineId("cnbc", { title: "c" }));
    expect(headlineId("fed", { title: "c" })).toMatch(/^[0-9a-f]{16}$/);
    // naming a share: as a word of three letters or more, or as a cashtag; never inside another word
    expect(namesSymbol("NVDA slides", "NVDA")).toBe(true);
    expect(namesSymbol("the $T trade", "T")).toBe(true);
    expect(namesSymbol("AT&T reports", "T")).toBe(false);
    expect(namesSymbol("ENVDAX", "NVDA")).toBe(false);
    expect(namesSymbol("BRK.B climbs", "BRK.B")).toBe(true);
    expect(namesSymbol("nvda in lower case", "NVDA")).toBe(false);
    // ordered newest first, undated last, one of a link or a title
    const h = (title: string, at?: string, url?: string): Headline => ({ id: title, title, ...(at ? { at } : {}), ...(url ? { url } : {}), source: "x", sourceName: "X", topics: ["markets"] });
    expect(orderHeadlines([h("old", "2026-11-09T10:00:00Z"), h("undated"), h("new", "2026-11-09T12:00:00Z"), h("NEW", "2026-11-09T11:00:00Z"), h("same link", "2026-11-09T09:00:00Z", "https://x/a"), h("same link again", "2026-11-09T08:00:00Z", "https://x/a")]).map((x) => x.title)).toEqual(["new", "old", "same link", "undated"]);
  });

  it("the network keeps a whole text body for a reader that asks (maxBytes) — a JSON body still cut to its words — and refuses one longer than asked, declared or streamed", async () => {
    const xml = `<rss><channel>${"<item><title>x</title></item>".repeat(300)}</channel></rss>`;
    vi.stubGlobal("fetch", async () => new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml; charset=utf-8" } }));
    try {
      const whole = await realHttp("https://www.cnbc.com/feed", { maxBytes: 1_000_000 });
      expect([whole.status, whole.text.length, whole.body, whole.tooLong]).toEqual([200, xml.length, undefined, undefined]);
      const cut = await realHttp("https://www.cnbc.com/feed");
      expect(cut.text.length).toBe(2000);
      const long = await realHttp("https://www.cnbc.com/feed", { maxBytes: 1_000 });
      expect([long.status, long.text, long.tooLong]).toEqual([200, "", true]);
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ rows: "y".repeat(5_000) }), { status: 200, headers: { "content-type": "application/json" } }));
    try {
      const j = await realHttp("https://www.cnbc.com/j", { maxBytes: 1_000_000 });
      expect((j.body as { rows: string }).rows.length).toBe(5_000);
      expect(j.text.length).toBe(2000);
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("fetch", async () => new Response("z".repeat(10), { status: 200, headers: { "content-length": "5000000" } }));
    try {
      expect((await realHttp("https://www.cnbc.com/big", { maxBytes: 1_000 })).tooLong).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    // the guard made for the wire passes the cap on; one made without passes nothing more than it did
    const seen: unknown[] = [];
    const spy: Http = async (_u, init) => (seen.push(init), reply(""));
    await fixedHosts(spy, NEWS_HOSTS, 1_000, { maxBytes: 7 })("https://search.cnbc.com/x");
    await fixedHosts(spy, NEWS_HOSTS, 1_000)("https://search.cnbc.com/x");
    expect(seen).toEqual([{ method: "GET", headers: { accept: "application/json" }, timeoutMs: 1_000, maxBytes: 7 }, { method: "GET", headers: { accept: "application/json" }, timeoutMs: 1_000 }]);
    // the hosts: each feed's, exactly, and nothing is asked elsewhere
    expect(NEWS_HOSTS).toEqual(["www.federalreserve.gov", "www.ecb.europa.eu", "www.sec.gov", "search.cnbc.com", "feeds.content.dowjones.io", "feeds.bbci.co.uk", "www.nasdaq.com", "www.coindesk.com", "cointelegraph.com", "www.theblock.co", "decrypt.co", "www.prnewswire.com"]);
    await expect(fixedHosts(spy, NEWS_HOSTS, 1_000)("https://evil.example/feed")).rejects.toThrow("is not asked");
  });
});

describe("GET /api/account/news", () => {
  const home = mkdtempSync(join(tmpdir(), "news-route-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it("answers the reader's view, refuses a topic that is none, and turns another site's page away", async () => {
    const asked: unknown[] = [];
    const svc = await PortfolioService.create({
      home,
      venues: "frontline",
      real: true,
      liveDeps: { http: async () => reply("", 599), price: async () => undefined },
      readers: {
        news: {
          async headlines(ask) {
            asked.push(ask);
            if (ask?.topic === "sports") return no("E_ACCOUNT_BAD_ACTION", { message: "no such topic" });
            return { asOf: "2026-11-09T19:00:00.000Z", items: [{ id: "a", title: "A headline", source: "x", sourceName: "X", topics: ["markets"] }], total: 1, sources: [], missing: [], topics: [], notes: [] };
          },
          clear() {},
        },
      },
    });
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const r = await fetch(`${srv.url}/api/account/news?topic=markets&q=fed%20cut&symbol=aapl&limit=5`);
      expect(r.status).toBe(200);
      const b = (await r.json()) as { ok: boolean; items: Array<{ title: string }> };
      expect(b.ok).toBe(true);
      expect(b.items[0]!.title).toBe("A headline");
      expect(asked[0]).toEqual({ topic: "markets", q: "fed cut", symbol: "aapl", limit: 5 });
      const no = await fetch(`${srv.url}/api/account/news?topic=sports`);
      expect(no.status).toBe(409);
      const bare = await fetch(`${srv.url}/api/account/news`);
      expect(bare.status).toBe(200);
      expect(asked[2]).toEqual({});
      const other = await fetch(`${srv.url}/api/account/news`, { headers: { origin: "https://evil.example" } });
      expect(other.status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});
