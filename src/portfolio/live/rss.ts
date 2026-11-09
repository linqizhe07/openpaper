/** A FEED READ AS TEXT: RSS 2.0, RSS 1.0 (RDF) and Atom, the three shapes publishers' headline feeds come in, read into plain items — a
 * title, a link, a time, an id, a few words — with no XML library and nothing executed. What it keeps is text: markup inside a title is
 * taken out, entities are decoded once, control characters and the invisible code points that reorder or hide text are removed, and
 * every field is cut to a length. A feed that declares entities of its own, or an internal subset in its DOCTYPE, is refused whole: that
 * is how an XML reader is made to expand a body a thousandfold, and no headline feed needs one. A link is kept as text here; whether it
 * is one the account will show is the reader's rule (live/news.ts), by the host the feed is allowed to point at.
 *
 * The shapes, as read from the feeds themselves on 2026-11-09 (live/news.ts names them):
 *   RSS 2.0   <rss><channel><item><title>…</title><link>…</link><pubDate>Mon, 09 Nov 2026 14:02:00 GMT</pubDate><guid>…</guid>
 *             <description>…</description></item>: the Federal Reserve, the SEC, CNBC, MarketWatch, the WSJ, the BBC, CoinDesk,
 *             Cointelegraph, The Block, Decrypt, PR Newswire, Nasdaq. Dow Jones and CNBC write the title in CDATA; the Fed's file starts
 *             with a byte-order mark; Nasdaq's gives dc:creator and its tickers in a namespace of its own
 *   RSS 1.0   <rdf:RDF><item><title/><link/><dc:date>2026-11-09T14:02:00Z</dc:date></item>: the older shape some institutions keep
 *   Atom      <feed><entry><title/><link href="…" rel="alternate"/><updated>…</updated><published>…</published><id/><summary/></entry>
 * Nothing here is a sample: a shape a feed does not carry is a field left out. */

/** one item of a feed, as text */
export interface FeedItem {
  title: string;
  /** the link as the feed wrote it (https or http), not yet judged: live/news.ts keeps or drops it by host */
  link?: string | undefined;
  /** the item's time as ISO 8601, where the feed gave one this could read */
  at?: string | undefined;
  /** the feed's own id for the item (guid, id), where it gave one */
  id?: string | undefined;
  /** a few words of its description or summary, as text */
  words?: string | undefined;
  /** the categories the feed put it in, as text */
  tags: string[];
}
export interface Feed {
  kind: "rss" | "rdf" | "atom";
  /** the feed's own title, as text (never shown as the source's name: that is the account's own word for the feed) */
  title: string;
  items: FeedItem[];
}
/** why a body is not read as a feed: its words name no feed or publisher, and say nothing of the network */
export type FeedRefusal = { refused: "not-a-feed" | "declares-entities" | "too-large" };

export const FEED_ITEMS_MOST = 40;
export const FEED_TITLE_MAX = 200;
export const FEED_WORDS_MAX = 280;
export const FEED_TAG_MAX = 40;
export const FEED_TAGS_MOST = 8;
export const FEED_LINK_MAX = 500;
export const FEED_ID_MAX = 200;
/** a body longer than this is not read: a headline feed is tens of kilobytes */
export const FEED_BYTES_MOST = 2_000_000;

const ENTITY_DECL = /<!DOCTYPE[^>[]*\[|<!ENTITY/i;
const NAMED = new Map<string, string>([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"], ["nbsp", " "], ["ndash", "–"], ["mdash", "—"], ["lsquo", "‘"], ["rsquo", "’"], ["ldquo", "“"], ["rdquo", "”"], ["hellip", "…"], ["copy", "©"], ["reg", "®"], ["trade", "™"], ["euro", "€"], ["pound", "£"], ["yen", "¥"], ["cent", "¢"], ["deg", "°"], ["middot", "·"], ["bull", "•"], ["laquo", "«"], ["raquo", "»"], ["times", "×"], ["minus", "−"], ["plusmn", "±"], ["frac12", "½"], ["frac14", "¼"], ["frac34", "¾"], ["eacute", "é"], ["egrave", "è"], ["agrave", "à"], ["ccedil", "ç"], ["uuml", "ü"], ["ouml", "ö"], ["auml", "ä"], ["ntilde", "ñ"]]);
/** control characters but tab and newline, and the code points that reorder, join or hide text: never part of a headline */
const UNSEEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

/** one decoding of XML and HTML entities, numeric and named (an unknown name stays as written) */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,8});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "";
      return String.fromCodePoint(n);
    }
    return NAMED.get(e.toLowerCase()) ?? m;
  });
}
/** text as a feed carries it — CDATA opened, markup taken out, entities decoded once, the unseen removed, whitespace folded — cut to `max` */
export function feedText(raw: string | undefined, max: number): string {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // markup inside the text (a description's HTML; a title's <b>): a tag is a space, so two words it parted stay two words
  s = s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  // the entities an HTML description carried twice (&amp;amp;)
  s = decodeEntities(s).replace(/<[^>]*>/g, " ");
  s = s.replace(UNSEEN, "").normalize("NFC").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** an element's opening tag, any namespace prefix, with or without attributes — never a self-closing one (<atom:link href="…"/> beside an
 * item's <link>…</link> is not the link), its text, and its closing tag */
const element = (name: string, flags: string) => new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${name}(?:\\s+(?:[^>]*[^/>\\s])?\\s*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9_-]+:)?${name}\\s*>`, flags);
/** the text of the first element named `name` inside `block`, raw; undefined where there is none or it is empty */
function first(block: string, name: string): string | undefined {
  const m = element(name, "i").exec(block);
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}
/** every element named `name`, raw */
function all(block: string, name: string): string[] {
  const re = element(name, "gi");
  const out: string[] = [];
  for (const m of block.matchAll(re)) if (m[1]?.trim()) out.push(m[1]);
  return out;
}
/** every element named `name`: its opening tag's attributes (an RSS 1.0 item's rdf:about is there) and its inner text, in order */
function elements(body: string, name: string): Array<{ attrs: string; inner: string }> {
  const re = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${name}(\\s+(?:[^>]*[^/>\\s])?\\s*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9_-]+:)?${name}\\s*>`, "gi");
  const out: Array<{ attrs: string; inner: string }> = [];
  for (const m of body.matchAll(re)) out.push({ attrs: m[1] ?? "", inner: m[2] ?? "" });
  return out;
}
/** an attribute's value inside a tag's text */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  const v = m ? (m[1] ?? m[2]) : undefined;
  return v !== undefined && v.trim() ? v.trim() : undefined;
}
/** a time the feed wrote, as ISO 8601, where it is one this reads (RFC 822 as RSS has it, ISO as Atom and dc:date have it) */
export function feedTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = feedText(raw, 80);
  if (!s) return undefined;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return undefined;
  // a time before the web or past this century is a feed's mistake, not news
  if (t < Date.UTC(1995, 0, 1) || t > Date.UTC(2100, 0, 1)) return undefined;
  return new Date(t).toISOString();
}
/** a link as the feed wrote it: text (RSS), or an Atom <link href> — the alternate, or the first with no rel — cut to its length. The
 * account judges it later (live/news.ts linkOf); here only its text is kept */
function linkOf(block: string, attrs: string, kind: Feed["kind"]): string | undefined {
  if (kind !== "atom") {
    const l = first(block, "link");
    if (l) return feedText(l, FEED_LINK_MAX).replace(/\s/g, "");
    // RSS 1.0 and some RSS 2.0 feeds write the link as an attribute of the item (rdf:about), or as an Atom link beside it
  }
  const tags = [...block.matchAll(/<(?:[a-zA-Z0-9_-]+:)?link\b([^>]*)\/?>/gi)].map((m) => m[1] ?? "");
  const alt = tags.find((t) => /\srel\s*=\s*["']alternate["']/i.test(t)) ?? tags.find((t) => !/\srel\s*=/i.test(t));
  const href = alt ? attr(alt, "href") : undefined;
  if (href) return decodeEntities(href).replace(/\s/g, "").slice(0, FEED_LINK_MAX);
  if (kind === "rdf") {
    const about = attr(attrs, "rdf:about");
    if (about) return decodeEntities(about).replace(/\s/g, "").slice(0, FEED_LINK_MAX);
  }
  return undefined;
}

/** THE FEED, read: its kind, its title and its items (FEED_ITEMS_MOST at most, in the feed's own order), or why it is not read as one.
 * `body` is the text as the network gave it; a byte-order mark, the XML prolog, comments and processing instructions are passed over */
export function parseFeed(body: string): Feed | FeedRefusal {
  if (body.length > FEED_BYTES_MOST) return { refused: "too-large" };
  const s = body.replace(/^\uFEFF/, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (ENTITY_DECL.test(s)) return { refused: "declares-entities" };
  const head = s.slice(0, 4000);
  const kind: Feed["kind"] | undefined = /<rss[\s>]/i.test(head) ? "rss" : /<rdf:RDF[\s>]/i.test(head) ? "rdf" : /<feed[\s>]/i.test(head) ? "atom" : undefined;
  if (!kind) return { refused: "not-a-feed" };
  const itemName = kind === "atom" ? "entry" : "item";
  const raw = elements(s, itemName);
  // the channel's own title: the first <title> before the first item (RSS), or the feed's first title (Atom)
  const before = s.slice(0, Math.max(0, s.search(new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${itemName}[\\s>]`, "i"))) || s.length);
  const title = feedText(first(before, "title"), FEED_TITLE_MAX);
  const items: FeedItem[] = [];
  for (const { attrs, inner: b } of raw.slice(0, FEED_ITEMS_MOST)) {
    const t = feedText(first(b, "title"), FEED_TITLE_MAX);
    if (!t) continue;
    const at = feedTime(first(b, "pubDate") ?? first(b, "published") ?? first(b, "updated") ?? first(b, "date"));
    const id = feedText(first(b, "guid") ?? first(b, "id"), FEED_ID_MAX);
    const words = feedText(first(b, "description") ?? first(b, "summary") ?? first(b, "encoded"), FEED_WORDS_MAX);
    const tags = all(b, "category").map((c) => feedText(c, FEED_TAG_MAX)).filter(Boolean).slice(0, FEED_TAGS_MOST);
    const link = linkOf(b, attrs, kind);
    items.push({ title: t, ...(link ? { link } : {}), ...(at ? { at } : {}), ...(id ? { id } : {}), ...(words && words !== t ? { words } : {}), tags });
  }
  return { kind, title, items };
}
export const isFeedRefusal = (x: Feed | FeedRefusal): x is FeedRefusal => "refused" in x;
