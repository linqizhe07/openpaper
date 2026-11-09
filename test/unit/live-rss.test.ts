import { describe, expect, it } from "vitest";
import { decodeEntities, FEED_ITEMS_MOST, FEED_TITLE_MAX, feedText, feedTime, isFeedRefusal, parseFeed, type Feed, type FeedRefusal } from "../../src/portfolio/live/rss.ts";

/** THE FEED READER (live/rss.ts): RSS 2.0, RSS 1.0 and Atom read into plain items with no XML library — titles as text, links as the feed
 * wrote them, times as ISO, the shapes the publishers' feeds carry (read 2026-11-09: a byte-order mark, CDATA, a self-closing atom:link
 * beside the item's link, namespaced dates) — and what is refused: a body that declares entities, one that is no feed, one too large.
 * Nothing leaves the process */
const ok = (x: Feed | FeedRefusal): Feed => {
  if (isFeedRefusal(x)) throw new Error(`refused: ${x.refused}`);
  return x;
};

/** the Fed's shape: a byte-order mark, a channel title, items with pubDate and category, an atom:link beside the channel's link */
const RSS = `﻿<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>FRB: Press Release - All Releases</title>
    <link>https://www.federalreserve.gov/feeds/press_all.xml</link>
    <atom:link href="https://www.federalreserve.gov/feeds/press_all.xml" rel="self" type="application/rss+xml"/>
    <item>
      <title>Federal Reserve Board announces &amp; publishes <b>two</b> things</title>
      <link>https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261105a.htm</link>
      <pubDate>Thu, 05 Nov 2026 16:00:00 GMT</pubDate>
      <guid isPermaLink="false">enforcement20261105a</guid>
      <category>Enforcement Actions</category>
      <category>Banking</category>
      <description><![CDATA[The Board <em>announced</em> the termination of an enforcement action &mdash; more at the link.]]></description>
    </item>
    <item>
      <title><![CDATA[Dow rallies 1,100 points as stocks climb: Live]]></title>
      <link>https://www.cnbc.com/2026/11/08/stock-market-today-live-updates.html</link>
      <pubDate>Mon, 09 Nov 2026 18:45:51 GMT</pubDate>
      <dc:creator>CNBC</dc:creator>
    </item>
    <item>
      <title>  </title>
      <link>https://example.com/untitled</link>
    </item>
    <item>
      <title>An item with no link and no time</title>
    </item>
  </channel>
</rss>`;
const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>An Atom feed</title>
  <link rel="self" href="https://example.org/feed.atom"/>
  <entry>
    <title type="html">First &lt;i&gt;entry&lt;/i&gt;</title>
    <link rel="alternate" href="https://example.org/first"/>
    <link rel="enclosure" href="https://example.org/first.mp3"/>
    <id>urn:uuid:1</id>
    <published>2026-11-09T14:02:00Z</published>
    <updated>2026-11-09T15:02:00Z</updated>
    <summary>A few words &#8212; and a number &#x263A;</summary>
  </entry>
  <entry>
    <title>Second entry</title>
    <link href="https://example.org/second"/>
    <updated>2026-11-08T10:00:00+02:00</updated>
  </entry>
</feed>`;
const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.net/"><title>An RDF feed</title></channel>
  <item rdf:about="https://example.net/one">
    <title>The one item</title>
    <dc:date>2026-11-09T09:04:21Z</dc:date>
  </item>
</rdf:RDF>`;

describe("the feed reader", () => {
  it("reads RSS 2.0 as the Fed and CNBC write it: the byte-order mark and the prolog passed over, the channel's title, each item's title as text, its link, its time as ISO, its id, its words and its categories; an untitled item is no item", () => {
    const f = ok(parseFeed(RSS));
    expect(f.kind).toBe("rss");
    expect(f.title).toBe("FRB: Press Release - All Releases");
    expect(f.items).toHaveLength(3);
    expect(f.items[0]).toEqual({
      title: "Federal Reserve Board announces & publishes two things",
      link: "https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261105a.htm",
      at: "2026-11-05T16:00:00.000Z",
      id: "enforcement20261105a",
      words: "The Board announced the termination of an enforcement action — more at the link.",
      tags: ["Enforcement Actions", "Banking"],
    });
    expect(f.items[1]).toMatchObject({ title: "Dow rallies 1,100 points as stocks climb: Live", link: "https://www.cnbc.com/2026/11/08/stock-market-today-live-updates.html", at: "2026-11-09T18:45:51.000Z", tags: [] });
    expect(f.items[1]!.id).toBeUndefined();
    expect(f.items[2]).toEqual({ title: "An item with no link and no time", tags: [] });
    // the channel's own atom:link is self-closing and is not an item's link
    expect(f.items.some((i) => i.link?.includes("press_all.xml"))).toBe(false);
  });

  it("reads Atom: the alternate link (never an enclosure), published over updated, the id, the summary with its entities decoded once", () => {
    const f = ok(parseFeed(ATOM));
    expect(f.kind).toBe("atom");
    expect(f.title).toBe("An Atom feed");
    expect(f.items[0]).toEqual({ title: "First entry", link: "https://example.org/first", at: "2026-11-09T14:02:00.000Z", id: "urn:uuid:1", words: "A few words — and a number ☺", tags: [] });
    expect(f.items[1]).toEqual({ title: "Second entry", link: "https://example.org/second", at: "2026-11-08T08:00:00.000Z", tags: [] });
  });

  it("reads RSS 1.0: the item's rdf:about as its link, dc:date as its time", () => {
    const f = ok(parseFeed(RDF));
    expect(f.kind).toBe("rdf");
    expect(f.items).toEqual([{ title: "The one item", link: "https://example.net/one", at: "2026-11-09T09:04:21.000Z", tags: [] }]);
  });

  it("refuses what is no headline feed: a body that declares entities or an internal subset (how an XML reader is made to expand a body), a page, a body too large", () => {
    expect(parseFeed('<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x "xxxxxxxx">]><rss><channel><item><title>&x;&x;</title></item></channel></rss>')).toEqual({ refused: "declares-entities" });
    expect(parseFeed('<rss><channel><item><title>a</title></item></channel></rss><!ENTITY y "y">')).toEqual({ refused: "declares-entities" });
    expect(parseFeed("<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied</body></html>")).toEqual({ refused: "not-a-feed" });
    expect(parseFeed("Too Many Requests")).toEqual({ refused: "not-a-feed" });
    expect(parseFeed('{"ok":true}')).toEqual({ refused: "not-a-feed" });
    expect(parseFeed("")).toEqual({ refused: "not-a-feed" });
    expect(parseFeed(`<rss><channel>${"<item><title>x</title></item>".repeat(100_000)}</channel></rss>`)).toEqual({ refused: "too-large" });
    expect(isFeedRefusal({ refused: "not-a-feed" })).toBe(true);
    expect(isFeedRefusal({ kind: "rss", title: "", items: [] })).toBe(false);
  });

  it("keeps text and nothing else: markup out, entities decoded once (twice for the HTML a description carries escaped), control and invisible code points removed, whitespace folded, the length kept to a cap with an ellipsis", () => {
    expect(feedText("<b>Bold</b> &amp; <i>italic</i>", 100)).toBe("Bold & italic");
    // markup a feed escaped is markup once decoded: taken out as well, its words left as the text they are
    expect(feedText("&lt;script&gt;alert(1)&lt;/script&gt;Hello", 100)).toBe("alert(1) Hello");
    expect(feedText("&lt;img src=x onerror=alert(1)&gt;", 100)).toBe("");
    expect(feedText("a​b‮c\u0007d﻿e⁦f", 100)).toBe("abcdef");
    expect(feedText("  two\n\n  lines \t here ", 100)).toBe("two lines here");
    expect(feedText("x".repeat(50), 20)).toBe(`${"x".repeat(19)}…`);
    expect(feedText(undefined, 10)).toBe("");
    expect(feedText("<![CDATA[Stocks <em>rally</em> &mdash; live]]>", 100)).toBe("Stocks rally — live");
    // a title over the cap is cut at the cap
    const long = ok(parseFeed(`<rss><channel><item><title>${"y".repeat(500)}</title></item></channel></rss>`));
    expect(long.items[0]!.title).toHaveLength(FEED_TITLE_MAX);
    expect(decodeEntities("&#65;&#x42;&amp;&nbsp;&unknown;&#xD800;&#0;")).toBe("AB& &unknown;");
  });

  it("reads a time the feed wrote in RFC 822 or ISO 8601, and nothing from words that are not one or a year outside the web's", () => {
    expect(feedTime("Mon, 09 Nov 2026 18:45:51 GMT")).toBe("2026-11-09T18:45:51.000Z");
    expect(feedTime("Mon, 09 Nov 2026 13:45:51 -0500")).toBe("2026-11-09T18:45:51.000Z");
    expect(feedTime("2026-11-09T14:02:00Z")).toBe("2026-11-09T14:02:00.000Z");
    expect(feedTime("yesterday")).toBeUndefined();
    expect(feedTime("1901-01-01T00:00:00Z")).toBeUndefined();
    expect(feedTime("")).toBeUndefined();
    expect(feedTime(undefined)).toBeUndefined();
  });

  it("keeps at most forty items, in the feed's order, and eight categories each", () => {
    const body = `<rss><channel>${Array.from({ length: 60 }, (_, i) => `<item><title>Item ${i}</title>${"<category>c</category>".repeat(12)}</item>`).join("")}</channel></rss>`;
    const f = ok(parseFeed(body));
    expect(f.items).toHaveLength(FEED_ITEMS_MOST);
    expect(f.items[0]!.title).toBe("Item 0");
    expect(f.items[39]!.title).toBe("Item 39");
    expect(f.items[0]!.tags).toHaveLength(8);
  });

  it("keeps a link as the feed wrote it — whatever it points at: the account judges it later (live/news.ts linkOf), never here", () => {
    const f = ok(parseFeed('<rss><channel><item><title>t</title><link>javascript:alert(1)</link></item><item><title>u</title><link> https://example.com/with spaces </link></item></channel></rss>'));
    expect(f.items[0]!.link).toBe("javascript:alert(1)");
    expect(f.items[1]!.link).toBe("https://example.com/withspaces");
  });
});
