/** NEWS, KEYLESS: the headlines the publishers themselves put out as feeds — a title, a link to the publisher's own page, a time, the
 * publisher's name — read the way a terminal's TOP reads a wire: nothing more than the headline is kept, no article is fetched, no site
 * is scraped, and the account keeps an answer five minutes. Every feed is one the publisher offers for exactly this (an RSS or Atom
 * feed), on a fixed list (NEWS_FEEDS); its words are text and nothing else (live/rss.ts), and a link is shown only where it points at the
 * publisher's own hosts. Each GET goes through the fixed-host guard (public-markets.ts fixedHosts, made with NEWS_MAX_BYTES so a feed's
 * whole body is read: types.ts Http maxBytes), with the account's own user agent — Nasdaq's feed answers a desktop browser's alone
 * (us-quotes.ts NASDAQ_UA, the same it asks for quotes with), and the SEC's asks every reader to say who they are (edgar.ts: the
 * SEC_CONTACT the owner set; without it the SEC's feed is not asked, and the answer says so).
 *
 * The feeds, each read from this machine on 2026-11-09 with the account's own user agent (200, within 0.5 s unless said):
 *   federalreserve.gov/feeds/press_all.xml                                  RSS 2.0, 20 items, a byte-order mark first — the Board's press releases
 *   www.ecb.europa.eu/rss/press.html                                        RSS 2.0, 15 items — the ECB's press releases, speeches and interviews
 *   www.sec.gov/news/pressreleases.rss                                      RSS 2.0, 25 items — with the SEC's declared user agent only
 *   search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114   RSS 2.0, 30 items, titles in CDATA — CNBC's top news
 *   feeds.content.dowjones.io/public/rss/mw_topstories                      RSS 2.0, 10 items — MarketWatch's top stories
 *   feeds.content.dowjones.io/public/rss/RSSMarketsMain                     RSS 2.0, 40 items — the Wall Street Journal's Markets
 *   feeds.bbci.co.uk/news/business/rss.xml                                  RSS 2.0, 40 items — the BBC's Business
 *   www.nasdaq.com/feed/rssoutbound?category=Markets                        RSS 2.0, 15 items, 1–2.3 s, a desktop user agent only — Nasdaq's Markets
 *   www.nasdaq.com/feed/rssoutbound?symbol=AAPL                             the same, for one US share (CN): read when a symbol is asked
 *   www.coindesk.com/arc/outboundfeeds/rss                                  RSS 2.0, 25 items (the address with a slash after rss answers 308:
 *                                                                           a redirect is never followed, so the final one is asked)
 *   cointelegraph.com/rss · www.theblock.co/rss.xml · decrypt.co/feed      RSS 2.0, 20–39 items each
 *   www.prnewswire.com/rss/news-releases-list.rss                           RSS 2.0, 20 items — companies' own press releases, every language
 * Not read: Yahoo's feeds (429 to every reader), GlobeNewswire (403), the BLS feed (403 to anything but a browser; its release days come
 * with the calendar). These are the publishers' public feeds, not a licensed wire: any may change or refuse, and the answer says which did. */
import { createHash } from "node:crypto";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { holdBackMs, publicNo } from "./public-markets.ts";
import { FEED_BYTES_MOST, isFeedRefusal, parseFeed, type FeedItem } from "./rss.ts";
import { unreachable, type Http } from "./types.ts";
import { NASDAQ_UA } from "./us-quotes.ts";

export type NewsTopic = "markets" | "macro" | "crypto" | "companies";
export const NEWS_TOPICS: ReadonlyArray<{ id: NewsTopic; label: string; words: string }> = [
  { id: "markets", label: "Markets", words: "the day's markets: CNBC, MarketWatch, the Wall Street Journal, the BBC, Nasdaq" },
  { id: "macro", label: "Macro & policy", words: "the central banks and the regulator, in their own releases: the Federal Reserve, the ECB, the SEC" },
  { id: "crypto", label: "Crypto", words: "CoinDesk, Cointelegraph, The Block, Decrypt" },
  { id: "companies", label: "Companies", words: "companies' own press releases (PR Newswire), and a share's own feed from Nasdaq" },
];
export interface NewsFeed {
  id: string;
  /** the publisher's name as the account says it — never the feed's own <title> */
  name: string;
  url: string;
  topics: NewsTopic[];
  /** the hosts a link of this feed may point at (a subdomain of one counts); a link elsewhere is not shown */
  hosts: string[];
  /** read with a desktop browser's user agent, as its venue answers nothing else (Nasdaq) */
  browser?: true | undefined;
  /** read with the SEC's declared user agent only (SEC_CONTACT) */
  sec?: true | undefined;
  /** read only when its topic, or a share, is asked — never into the day's list: companies' press releases come by the hundred */
  apart?: true | undefined;
}
export const NEWS_FEEDS: readonly NewsFeed[] = [
  { id: "fed", name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", topics: ["macro"], hosts: ["federalreserve.gov"] },
  { id: "ecb", name: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html", topics: ["macro"], hosts: ["ecb.europa.eu"] },
  { id: "sec", name: "SEC", url: "https://www.sec.gov/news/pressreleases.rss", topics: ["macro"], hosts: ["sec.gov"], sec: true },
  { id: "cnbc", name: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", topics: ["markets"], hosts: ["cnbc.com"] },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", topics: ["markets"], hosts: ["marketwatch.com"] },
  { id: "wsj", name: "Wall Street Journal", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", topics: ["markets"], hosts: ["wsj.com"] },
  { id: "bbc", name: "BBC", url: "https://feeds.bbci.co.uk/news/business/rss.xml", topics: ["markets"], hosts: ["bbc.co.uk", "bbc.com"] },
  { id: "nasdaq", name: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", topics: ["markets"], hosts: ["nasdaq.com"], browser: true },
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss", topics: ["crypto"], hosts: ["coindesk.com"] },
  { id: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss", topics: ["crypto"], hosts: ["cointelegraph.com"] },
  { id: "theblock", name: "The Block", url: "https://www.theblock.co/rss.xml", topics: ["crypto"], hosts: ["theblock.co"] },
  { id: "decrypt", name: "Decrypt", url: "https://decrypt.co/feed", topics: ["crypto"], hosts: ["decrypt.co"] },
  { id: "prnewswire", name: "PR Newswire", url: "https://www.prnewswire.com/rss/news-releases-list.rss", topics: ["companies"], hosts: ["prnewswire.com"], apart: true },
];
/** the one feed read for a share: Nasdaq's, for that symbol */
export const NASDAQ_SYMBOL_FEED = "https://www.nasdaq.com/feed/rssoutbound?symbol=";
export const symbolFeed = (symbol: string): NewsFeed => ({ id: `nasdaq:${symbol}`, name: "Nasdaq", url: `${NASDAQ_SYMBOL_FEED}${encodeURIComponent(symbol)}`, topics: ["companies"], hosts: ["nasdaq.com"], browser: true });
/** the only hosts the news is read from */
export const NEWS_HOSTS: readonly string[] = [...new Set(NEWS_FEEDS.map((f) => new URL(f.url).hostname))];
export const NEWS_VENUE = "news";
export const NEWS_NAME = "the news feeds";
/** a feed's answer is kept this long */
export const NEWS_KEEP_MS = 300_000;
/** a feed that refused, or gave nothing readable, is not asked again before this long (a longer hold where its refusal asks for one) */
export const NEWS_FAIL_MS = 60_000;
/** a feed's last good answer stands in for it this long after it went quiet */
export const NEWS_LAST_MS = 3_600_000;
export const NEWS_TIMEOUT_MS = 8_000;
/** a read waits this long for the feeds it asked, then answers with what came (a late feed's last answer standing in) */
export const NEWS_WAIT_MS = 5_000;
export const NEWS_MAX_BYTES = FEED_BYTES_MOST;
export const NEWS_LIMIT = 60;
export const NEWS_LIMIT_MOST = 200;
export const NEWS_Q_MAX = 60;
/** the account's own user agent at the publishers */
export const NEWS_UA = "openpaper (+https://github.com/linqizhe07/openpaper)";
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";
/** a US share's ticker, as the SEC's reader takes one */
const TICKER = /^[A-Z]{1,6}([.-][A-Z]{1,2})?$/;
/** what the SEC asks of a reader, where no contact is set (edgar.ts says the same under Financials) */
export const NEWS_SEC_WORDS = "The SEC asks every reader to say who they are and how to reach them: start the account with SEC_CONTACT set to your email address, and its press releases are read here too";

/** one headline */
export interface Headline {
  /** the account's own id for it: the feed and the publisher's id, link or title, hashed */
  id: string;
  title: string;
  /** the publisher's own page, where the feed's link points at one of the publisher's hosts over https */
  url?: string | undefined;
  /** when the publisher put it out (ISO 8601), where the feed said */
  at?: string | undefined;
  /** the feed it came from (NewsFeed.id) and the publisher's name */
  source: string;
  sourceName: string;
  topics: NewsTopic[];
  /** the feed's own categories for it */
  tags?: string[] | undefined;
  /** the share it is about, where it was read from a share's own feed */
  symbol?: string | undefined;
}
export interface NewsAsk {
  topic?: NewsTopic | string | undefined;
  /** words every headline shown must carry (any case) */
  q?: string | undefined;
  /** a US share: its own feed from Nasdaq, and the headlines that name it */
  symbol?: string | undefined;
  limit?: number | undefined;
}
export interface NewsSource {
  id: string;
  name: string;
  /** when its answer was read from the publisher */
  readAt?: string | undefined;
  /** how many headlines it gave */
  count: number;
  /** its last answer stands in: it was late or refused this time (its words are in `missing`) */
  late?: true | undefined;
}
export interface NewsView {
  asOf: string;
  items: Headline[];
  /** how many headlines matched before the cut to `limit` */
  total: number;
  sources: NewsSource[];
  /** the feeds that gave nothing this time, each with its own words (the shape Markets' explore uses, so the page says them the same way) */
  missing: Array<{ venue: string; venueName: string; why: string; code?: string | undefined }>;
  topics: Array<{ id: NewsTopic; label: string; count: number }>;
  notes: string[];
  topic?: NewsTopic | undefined;
  q?: string | undefined;
  symbol?: string | undefined;
}
/** what the account asks of the news: the one reader (NewsWire), or a stand-in (test/standin) */
export interface NewsReader {
  headlines(ask?: NewsAsk): Promise<NewsView | Refusal>;
  /** the holds let go: the next read asks every feed again */
  clear(): void;
}
export interface NewsDeps {
  /** the network, already behind fixedHosts(NEWS_HOSTS, …, { maxBytes: NEWS_MAX_BYTES }) */
  http: Http;
  clock?: (() => number) | undefined;
  /** the SEC's declared user agent (edgar.ts secUserAgent), or none: the SEC's feed is then not asked */
  secUserAgent?: string | undefined;
  feeds?: readonly NewsFeed[] | undefined;
  /** how long a read waits for the feeds (tests shorten it) */
  waitMs?: number | undefined;
}

/** the link a headline may carry: https, a plain host that is one of the feed's own or under one, no user in it; else none */
export function linkOf(raw: string | undefined, hosts: readonly string[]): string | undefined {
  if (!raw) return undefined;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return undefined;
  const h = u.hostname.toLowerCase();
  return hosts.some((x) => h === x || h.endsWith(`.${x}`)) ? u.toString().slice(0, 500) : undefined;
}
/** a headline's id: the feed and what the publisher called the item (its guid, else its link, else its title), hashed short */
export const headlineId = (feed: string, item: Pick<FeedItem, "id" | "link" | "title">): string => createHash("sha256").update(`${feed}|${item.id ?? item.link ?? item.title}`).digest("hex").slice(0, 16);
/** a headline from a feed's item, with the feed's own words for where it came from */
export function headlineOf(feed: NewsFeed, item: FeedItem, symbol?: string): Headline {
  const url = linkOf(item.link, feed.hosts);
  return { id: headlineId(feed.id, item), title: item.title, ...(url ? { url } : {}), ...(item.at ? { at: item.at } : {}), source: feed.id, sourceName: feed.name, topics: feed.topics, ...(item.tags.length ? { tags: item.tags } : {}), ...(symbol ? { symbol } : {}) };
}
/** the words of `q`, each of which a headline must carry (case apart), at most six */
export const wordsOf = (q: string | undefined): string[] => String(q ?? "").toLowerCase().split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, 6);
export const mentions = (title: string, words: string[]): boolean => {
  const t = title.toLowerCase();
  return words.every((w) => t.includes(w));
};
/** a headline names a share: its symbol as a word (three letters or more, as written: NVDA, BRK.B), or as a cashtag ($AAPL) */
export function namesSymbol(title: string, symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (new RegExp(`\\$${s.replace(/[.-]/g, "\\$&")}\\b`).test(title)) return true;
  return s.length >= 3 && new RegExp(`(?<![A-Za-z0-9.$])${s.replace(/[.-]/g, "\\$&")}(?![A-Za-z0-9])`).test(title);
}
/** the headlines, newest first (undated last, in their feeds' order), one of each — the same link, or the same title, once */
export function orderHeadlines(all: Headline[]): Headline[] {
  const seen = new Set<string>();
  const out: Headline[] = [];
  const dated = all.filter((h) => h.at).sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!));
  for (const h of [...dated, ...all.filter((h) => !h.at)]) {
    const keys = [h.url ? `u:${h.url.toLowerCase()}` : "", `t:${h.title.toLowerCase()}`].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(h);
  }
  return out;
}

interface Kept {
  until: number;
  value: Headline[] | Refusal;
}
/** THE WIRE: every feed read in parallel and kept five minutes, a refusal held a minute at least (longer where it asked), the last good
 * answer standing in for a feed that is late or refusing now, and one read in flight per feed however many pages ask */
export class NewsWire implements NewsReader {
  private readonly http: Http;
  private readonly clock: () => number;
  private readonly feeds: readonly NewsFeed[];
  private readonly secUserAgent: string | undefined;
  private readonly waitMs: number;
  private readonly kept = new Map<string, Kept>();
  private readonly inflight = new Map<string, Promise<Headline[] | Refusal>>();
  /** each feed's last good answer, and when it was read */
  private readonly last = new Map<string, { items: Headline[]; at: number }>();
  constructor(deps: NewsDeps) {
    this.http = deps.http;
    this.clock = deps.clock ?? Date.now;
    this.feeds = deps.feeds ?? NEWS_FEEDS;
    this.secUserAgent = deps.secUserAgent;
    this.waitMs = deps.waitMs ?? NEWS_WAIT_MS;
  }
  clear(): void {
    for (const [k, v] of this.kept) if (isRefusal(v.value)) this.kept.delete(k);
  }

  /** one feed's headlines: kept, or read now (one read at a time) */
  private feed(f: NewsFeed, symbol?: string): Promise<Headline[] | Refusal> {
    const now = this.clock();
    const hit = this.kept.get(f.id);
    if (hit && now < hit.until) return Promise.resolve(hit.value);
    const going = this.inflight.get(f.id);
    if (going) return going;
    const p = this.read(f, symbol).then((v) => {
      const hold = isRefusal(v) ? Math.max(holdBackMs(v), NEWS_FAIL_MS) : NEWS_KEEP_MS;
      this.kept.set(f.id, { until: this.clock() + hold, value: v });
      if (!isRefusal(v)) this.last.set(f.id, { items: v, at: this.clock() });
      this.inflight.delete(f.id);
      // the map is bounded: a share's feed asked once is let go once it is stale
      if (this.kept.size > 200) for (const [k, e] of this.kept) if (this.clock() >= e.until) this.kept.delete(k);
      return v;
    });
    this.inflight.set(f.id, p);
    return p;
  }
  /** the GET and its reading: the body as a feed, its items as headlines; a refusal in the publisher's words, or the account's where the
   * body is not a feed */
  private async read(f: NewsFeed, symbol?: string): Promise<Headline[] | Refusal> {
    if (f.sec && !this.secUserAgent) return no("E_ACCOUNT_CREDENTIAL", { venue: f.id, message: NEWS_SEC_WORDS });
    const ua = f.sec ? this.secUserAgent! : f.browser ? NASDAQ_UA : NEWS_UA;
    let r;
    try {
      r = await this.http(f.url, { headers: { accept: ACCEPT, "user-agent": ua }, timeoutMs: NEWS_TIMEOUT_MS });
    } catch (err) {
      return unreachable(f.id, f.name, err);
    }
    if (r.tooLong) return no("E_VENUE_REJECTED", { venue: f.id, message: `${f.name}'s feed is longer than ${Math.round(NEWS_MAX_BYTES / 1_000_000)} MB, so it was not read` });
    if (r.status < 200 || r.status >= 300) return publicNo(f.id, f.name, r);
    const feed = parseFeed(r.text);
    if (isFeedRefusal(feed)) return no("E_VENUE_REJECTED", { venue: f.id, message: feed.refused === "declares-entities" ? `${f.name}'s feed declares entities of its own, which no headline feed needs: it was not read` : feed.refused === "too-large" ? `${f.name}'s feed is longer than ${Math.round(NEWS_MAX_BYTES / 1_000_000)} MB, so it was not read` : `${f.name} answered something that is not a feed` });
    return feed.items.map((i) => headlineOf(f, i, symbol));
  }

  async headlines(ask: NewsAsk = {}): Promise<NewsView | Refusal> {
    const topic = ask.topic ? NEWS_TOPICS.find((t) => t.id === ask.topic)?.id : undefined;
    if (ask.topic && !topic) return no("E_ACCOUNT_BAD_ACTION", { message: `the news has these topics: ${NEWS_TOPICS.map((t) => t.id).join(" · ")}` });
    const q = String(ask.q ?? "").trim().slice(0, NEWS_Q_MAX);
    const words = wordsOf(q);
    const symbol = String(ask.symbol ?? "").trim().toUpperCase();
    if (symbol && !TICKER.test(symbol)) return no("E_ACCOUNT_BAD_ACTION", { message: "a share's news is read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
    const limit = Math.min(NEWS_LIMIT_MOST, Math.max(1, Math.trunc(Number(ask.limit) || NEWS_LIMIT)));
    // the day's list is every feed but the ones read apart; a topic asked is its feeds; a share asked is its own feed and every feed, for
    // the headlines that name it
    const feeds = [...(symbol ? [symbolFeed(symbol)] : []), ...this.feeds.filter((f) => (symbol ? true : topic ? f.topics.includes(topic) : !f.apart))];
    // every feed asked at once, the read answering when all are in or the wait is up: a feed still out then has its last answer stand in
    const started = this.clock();
    const late = (): Promise<"late"> =>
      new Promise((go) => {
        const t = setTimeout(() => go("late"), this.waitMs);
        if (typeof t === "object" && t && "unref" in t) t.unref();
      });
    const answers = await Promise.all(feeds.map((f) => Promise.race([this.feed(f, f.id.startsWith("nasdaq:") ? symbol : undefined), late()])));
    const sources: NewsSource[] = [];
    const missing: NewsView["missing"] = [];
    let all: Headline[] = [];
    feeds.forEach((f, i) => {
      const a = answers[i]!;
      const was = this.last.get(f.id);
      const standIn = was && started - was.at <= NEWS_LAST_MS ? was : undefined;
      if (a === "late" || isRefusal(a)) {
        const why = a === "late" ? `${f.name} did not answer in ${Math.round(this.waitMs / 1000)} s` : a.message;
        missing.push({ venue: f.id, venueName: f.name, why, ...(a !== "late" ? { code: a.code } : {}) });
        if (standIn) {
          sources.push({ id: f.id, name: f.name, readAt: new Date(standIn.at).toISOString(), count: standIn.items.length, late: true });
          all = all.concat(standIn.items);
        } else sources.push({ id: f.id, name: f.name, count: 0 });
        return;
      }
      const at = this.last.get(f.id)?.at;
      sources.push({ id: f.id, name: f.name, ...(at ? { readAt: new Date(at).toISOString() } : {}), count: a.length });
      all = all.concat(a);
    });
    let items = orderHeadlines(all);
    // the symbol's own feed, and every other headline that names the share
    if (symbol) items = items.filter((h) => h.symbol === symbol || namesSymbol(h.title, symbol));
    const counts = new Map<NewsTopic, number>();
    for (const h of items) for (const t of h.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
    if (topic) items = items.filter((h) => h.topics.includes(topic));
    if (words.length) items = items.filter((h) => mentions(h.title, words));
    const total = items.length;
    const notes = [
      "Headlines as the publishers put them out in their own feeds — a title, a link to their page and a time; no article is read, and nothing here is a view of the account's.",
      `Each feed is kept ${Math.round(NEWS_KEEP_MS / 60_000)} minutes; one late or refusing now has its last answer stand in for up to an hour, and says so.`,
      ...(!topic && !symbol && this.feeds.some((f) => f.apart) ? [`Companies' own press releases (${this.feeds.filter((f) => f.apart).map((f) => f.name).join(", ")}) are under Companies and a share's own news, not in the day's list.`] : []),
      ...(symbol ? [`${symbol}: Nasdaq's feed for the share, and every other headline that names it.`] : []),
    ];
    return {
      asOf: new Date(this.clock()).toISOString(),
      items: items.slice(0, limit),
      total,
      sources,
      missing,
      topics: NEWS_TOPICS.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 })),
      notes,
      ...(topic ? { topic } : {}),
      ...(q ? { q } : {}),
      ...(symbol ? { symbol } : {}),
    };
  }
}
