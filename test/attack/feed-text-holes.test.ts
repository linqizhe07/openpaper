import { describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { NEWS_FEEDS, NEWS_HOSTS, NEWS_MAX_BYTES, NEWS_TIMEOUT_MS, NewsWire, type NewsView } from "../../src/portfolio/live/news.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";

/** ATTACKS THAT MUST FAIL, against the news (live/news.ts, live/rss.ts): a publisher's feed is text from outside the account, and a feed
 * that has been taken over — or a network answering in a feed's place — hands the account whatever it likes. None of it may become
 * markup on the page, a link away from the publisher, a request to another host, a body that swallows the process, or a publisher's name
 * it did not earn. Every case here is answered with plain text, no link, a refusal in words, or nothing at all. Nothing leaves the process */
const cnbc = NEWS_FEEDS.find((f) => f.id === "cnbc")!;
const reply = (text: string, status = 200): HttpReply => ({ status, body: undefined, text });
function wireOver(routes: Record<string, HttpReply | (() => HttpReply)>) {
  const sent: string[] = [];
  const http: Http = async (url) => {
    sent.push(url);
    const r = routes[url];
    if (!r) return reply("not here", 404);
    return typeof r === "function" ? r() : r;
  };
  let t = Date.parse("2026-11-09T19:00:00Z");
  const w = new NewsWire({ http: fixedHosts(http, NEWS_HOSTS, NEWS_TIMEOUT_MS, { maxBytes: NEWS_MAX_BYTES }), clock: () => t, waitMs: 100 });
  return { w, sent, tick: (ms: number) => void (t += ms) };
}
const items = (v: NewsView | Refusal) => {
  if (isRefusal(v)) throw new Error(v.message);
  return v.items;
};
const item = (title: string, link?: string) => `<item><title>${title}</title>${link ? `<link>${link}</link>` : ""}<pubDate>Mon, 09 Nov 2026 18:00:00 GMT</pubDate></item>`;
const feed = (body: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Federal Reserve</title>${body}</channel></rss>`;

describe("ATTACKS THAT MUST FAIL: what a feed hands the account", () => {
  it("markup in a title is text and nothing else — no tag survives, escaped or not; invisible and reordering code points are gone; a title is cut to its length", async () => {
    const { w } = wireOver({ [cnbc.url]: reply(feed(item("<script>alert(1)</script>Fed <img src=x onerror=alert(1)> holds") + item("&lt;iframe src=&quot;https://evil.example&quot;&gt;&lt;/iframe&gt;Rates") + item("Stocks ‮esir‬ as the ​day ends") + item("x".repeat(10_000)))) });
    const got = items(await w.headlines({ topic: "markets" }));
    expect(got.map((h) => h.title)).toEqual(["alert(1) Fed holds", "Rates", "Stocks esir as the day ends", `${"x".repeat(199)}…`]);
    for (const h of got) {
      expect(h.title).not.toMatch(/[<>]/);
      expect(h.title).not.toMatch(/[​-‏‪-‮⁦-⁩]/);
      expect(h.title.length).toBeLessThanOrEqual(200);
    }
    // a headline carries no description, no author, no image: the title, the link, the time, the source — nothing else of the feed's
    expect(Object.keys(got[0]!).sort()).toEqual(["at", "id", "source", "sourceName", "title", "topics"]);
  });

  it("a link away from the publisher is no link: another scheme, another host, a lookalike host, a user in it, a port, a relative path", async () => {
    const bad = ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://www.cnbc.com/plain", "https://evil.example/x", "https://www.cnbc.com.evil.example/x", "https://evil.example/www.cnbc.com", "https://user:pw@www.cnbc.com/x", "https://www.cnbc.com:8443/x", "/relative/path", "https://www.cnbc.com@evil.example/"];
    const { w } = wireOver({ [cnbc.url]: reply(feed(bad.map((l, i) => item(`Headline ${i}`, l)).join("") + item("A real one", "https://www.cnbc.com/2026/11/09/real.html"))) });
    const got = items(await w.headlines({ topic: "markets" }));
    expect(got).toHaveLength(bad.length + 1);
    for (const h of got.slice(0, bad.length)) expect(h.url, h.title).toBeUndefined();
    expect(got[bad.length]!.url).toBe("https://www.cnbc.com/2026/11/09/real.html");
  });

  it("a feed that declares entities — the way an XML reader is made to expand a body a thousandfold — is refused whole, in words; the publisher's last good answer stands in", async () => {
    let evil = false;
    const { w, tick } = wireOver({ [cnbc.url]: () => (evil ? reply('<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><rss><channel><item><title>&b;&b;&b;</title></item></channel></rss>') : reply(feed(item("A plain headline")))) });
    expect(items(await w.headlines({ topic: "markets" })).map((h) => h.title)).toEqual(["A plain headline"]);
    evil = true;
    tick(400_000);
    const v = (await w.headlines({ topic: "markets" })) as NewsView;
    expect(v.items.map((h) => h.title)).toEqual(["A plain headline"]);
    expect(v.sources.find((s) => s.id === "cnbc")).toMatchObject({ late: true });
    expect(v.missing.find((m) => m.venue === "cnbc")!.why).toBe("CNBC's feed declares entities of its own, which no headline feed needs: it was not read");
  });

  it("a body longer than the cap is cut off unread; a page, a JSON answer or nothing at all is no feed: refused in words, never shown as headlines", async () => {
    const { w } = wireOver({
      [cnbc.url]: { status: 200, body: undefined, text: "", tooLong: true },
      [NEWS_FEEDS.find((f) => f.id === "marketwatch")!.url]: reply("<!DOCTYPE html><html><head><title>Just a moment…</title></head><body>Checking your browser</body></html>"),
      [NEWS_FEEDS.find((f) => f.id === "wsj")!.url]: { status: 200, body: { items: [{ title: "JSON pretending" }] }, text: '{"items":[{"title":"JSON pretending"}]}' },
      [NEWS_FEEDS.find((f) => f.id === "bbc")!.url]: reply(""),
    });
    const v = (await w.headlines({ topic: "markets" })) as NewsView;
    expect(v.items).toEqual([]);
    expect(v.missing.map((m) => [m.venue, m.why])).toEqual(expect.arrayContaining([["cnbc", "CNBC's feed is longer than 2 MB, so it was not read"], ["marketwatch", "MarketWatch answered something that is not a feed"], ["wsj", "Wall Street Journal answered something that is not a feed"], ["bbc", "BBC answered something that is not a feed"]]));
  });

  it("a feed cannot name itself: its channel title is never the source shown, and the hosts a link may point at are the account's list for that feed, not the feed's own", async () => {
    const { w } = wireOver({ [cnbc.url]: reply(`<?xml version="1.0"?><rss version="2.0"><channel><title>Federal Reserve Board</title><link>https://www.federalreserve.gov/</link>${item("Rates to zero, says the Fed", "https://www.federalreserve.gov/fake.htm")}</channel></rss>`) });
    const got = items(await w.headlines({ topic: "markets" }));
    expect(got[0]).toMatchObject({ source: "cnbc", sourceName: "CNBC", title: "Rates to zero, says the Fed" });
    expect(got[0]!.url).toBeUndefined();
  });

  it("nothing in a feed makes the account ask another host: no link, enclosure, image or next page is followed, and only the feeds' own URLs are ever sent", async () => {
    const { w, sent } = wireOver({ [cnbc.url]: reply(`<?xml version="1.0"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><atom:link rel="next" href="https://evil.example/page2"/><image><url>https://evil.example/pixel.gif</url></image>${item("One", "https://www.cnbc.com/one")}<item><title>Two</title><enclosure url="https://evil.example/x.mp3" type="audio/mpeg"/></item></channel></rss>`) });
    await w.headlines({ topic: "markets" });
    await w.headlines({ symbol: "AAPL" });
    const feedUrls = new Set([...NEWS_FEEDS.map((f) => f.url), "https://www.nasdaq.com/feed/rssoutbound?symbol=AAPL"]);
    expect(sent.every((u) => feedUrls.has(u))).toBe(true);
    expect(sent.some((u) => u.includes("evil"))).toBe(false);
  });

  it("the words and the share asked for reach no request: they narrow what was read, and only a ticker's letters go into Nasdaq's address", async () => {
    const { w, sent } = wireOver({});
    await w.headlines({ q: "fed cuts OR 1=1; DROP", topic: "macro" });
    expect(sent.every((u) => NEWS_FEEDS.some((f) => f.url === u))).toBe(true);
    expect(sent.some((u) => u.includes("DROP") || u.includes("cuts"))).toBe(false);
    const bad = (await w.headlines({ symbol: "../../etc/passwd" })) as Refusal;
    expect(bad.code).toBe("E_ACCOUNT_BAD_ACTION");
    const bad2 = (await w.headlines({ symbol: "AAPL&x=1" })) as Refusal;
    expect(bad2.code).toBe("E_ACCOUNT_BAD_ACTION");
    expect(sent.some((u) => u.includes("passwd") || u.includes("x=1"))).toBe(false);
  });
});
