/** THE STAND-IN'S NEWS: made-up headlines under made-up publishers — the Stand-in Wire, the Stand-in Central Bank, the Stand-in Chain
 * Letter, Stand-in Releases — timed from the stand-in's clock, so the News page, a share's drawer and portfolio_news can be looked at with
 * no network. No real publisher is named and nothing here is anyone's word; the rows carry no link, since there is no page to point at.
 * The ordering, the topics, the words and the share rules are the real wire's own pure functions (live/news.ts), so what the page shows
 * here behaves as it does on a real account. One feed never answers, so the line under the list that says so can be seen */
import type { Refusal } from "../../src/core/errors.ts";
import { mentions, namesSymbol, NEWS_LIMIT, NEWS_LIMIT_MOST, NEWS_TOPICS, orderHeadlines, wordsOf, type Headline, type NewsAsk, type NewsReader, type NewsTopic, type NewsView } from "../../src/portfolio/live/news.ts";
import { no } from "../../src/portfolio/refuse.ts";

const SOURCES: ReadonlyArray<{ id: string; name: string; topics: NewsTopic[] }> = [
  { id: "standin-wire", name: "Stand-in Wire", topics: ["markets"] },
  { id: "standin-bank", name: "Stand-in Central Bank", topics: ["macro"] },
  { id: "standin-chain", name: "Stand-in Chain Letter", topics: ["crypto"] },
  { id: "standin-releases", name: "Stand-in Releases", topics: ["companies"] },
];
const MIN = 60_000;
/** [minutes before now, source, title, the share it is about where it is a share's own] */
const LINES: ReadonlyArray<[number, string, string, string?]> = [
  [4, "standin-wire", "Stocks climb into the afternoon as the stand-in's six figures turn green"],
  [9, "standin-chain", "Bitcoin holds above $62,000 on the stand-in exchange as funding turns positive"],
  [14, "standin-wire", "NVDA leads the most-traded list for a third session on the stand-in broker", "NVDA"],
  [22, "standin-releases", "Apple Inc. (stand-in) sets its earnings call for Thursday after the close", "AAPL"],
  [31, "standin-bank", "Stand-in Central Bank holds its rate at 4.25% and says the next move depends on the data"],
  [38, "standin-chain", "DOGE jumps 12% in a day: the stand-in's public exchange sees its busiest book of the month"],
  [47, "standin-wire", "SPY nears a record as the stand-in session heads into its last hour"],
  [55, "standin-releases", "NVIDIA (stand-in) names a new head of its data-centre line", "NVDA"],
  [68, "standin-chain", "Ethereum's stand-in perpetual pays 0.01% an hour; the long side keeps paying"],
  [84, "standin-wire", "What the stand-in predictions market says about the next Fed meeting: 62¢ on a cut"],
  [96, "standin-bank", "Stand-in Central Bank: a speech on balance-sheet policy, in the governor's own words"],
  [110, "standin-releases", "Apple Inc. (stand-in) opens a repair programme for its latest model", "AAPL"],
  [125, "standin-chain", "SOL and AVAX trade in a tight range on the stand-in exchange; LINK lags"],
  [150, "standin-wire", "Tesla stock token (stand-in) slips 2.7% while the share is closed for the weekend"],
  [190, "standin-wire", "The stand-in broker's pre-market: AAPL and NVDA quoted, SPY flat"],
  [260, "standin-bank", "Stand-in Central Bank publishes its minutes: three members wanted a cut"],
  [330, "standin-chain", "Bitcoin's stand-in perpetual: open interest at a month's high, the basis at 8% a year"],
  [410, "standin-releases", "A stand-in company's release that names no share at all, in two languages"],
  [540, "standin-wire", "The stand-in's closing bell: what moved, what closed soonest, what traded most"],
  [700, "standin-chain", "DOGE's weekend: the stand-in's perp exchange records its largest single trade"],
  [1500, "standin-bank", "Stand-in Central Bank: the statement from a week ago, kept for the record"],
  [2900, "standin-wire", "Two days ago on the stand-in: a session that opened green and closed red"],
];

export function standinNews(clock: () => number): NewsReader {
  return {
    async headlines(ask: NewsAsk = {}): Promise<NewsView | Refusal> {
      const topic = ask.topic ? NEWS_TOPICS.find((t) => t.id === ask.topic)?.id : undefined;
      if (ask.topic && !topic) return no("E_ACCOUNT_BAD_ACTION", { message: `the news has these topics: ${NEWS_TOPICS.map((t) => t.id).join(" · ")}` });
      const symbol = String(ask.symbol ?? "").trim().toUpperCase();
      if (symbol && !/^[A-Z]{1,6}([.-][A-Z]{1,2})?$/.test(symbol)) return no("E_ACCOUNT_BAD_ACTION", { message: "a share's news is read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
      const words = wordsOf(ask.q);
      const limit = Math.min(NEWS_LIMIT_MOST, Math.max(1, Math.trunc(Number(ask.limit) || NEWS_LIMIT)));
      const now = clock();
      const all: Headline[] = LINES.map(([ago, source, title, sym], i) => {
        const s = SOURCES.find((x) => x.id === source)!;
        return { id: `standin-${i}`, title, at: new Date(now - ago * MIN).toISOString(), source: s.id, sourceName: s.name, topics: s.topics, ...(sym ? { symbol: sym } : {}) };
      });
      // the day's list leaves the releases apart, as the real wire does; a topic or a share asks every feed
      let items = orderHeadlines(all).filter((h) => symbol || topic || h.source !== "standin-releases");
      if (symbol) items = items.filter((h) => h.symbol === symbol || namesSymbol(h.title, symbol));
      const counts = new Map<NewsTopic, number>();
      for (const h of items) for (const t of h.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
      if (topic) items = items.filter((h) => h.topics.includes(topic));
      if (words.length) items = items.filter((h) => mentions(h.title, words));
      const asked = SOURCES.filter((s) => (symbol || topic ? (topic ? s.topics.includes(topic) : true) : s.id !== "standin-releases"));
      return {
        asOf: new Date(now).toISOString(),
        items: items.slice(0, limit),
        total: items.length,
        sources: [...asked.map((s) => ({ id: s.id, name: s.name, readAt: new Date(now - 20_000).toISOString(), count: all.filter((h) => h.source === s.id).length })), { id: "standin-late", name: "Stand-in Late Edition", count: 0 }],
        missing: [{ venue: "standin-late", venueName: "Stand-in Late Edition", why: "Stand-in Late Edition did not answer in 5 s" }],
        topics: NEWS_TOPICS.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 })),
        notes: ["Every headline here is made up by the stand-in, under made-up publishers' names, timed from the stand-in's clock. A real account reads the publishers' own feeds."],
        ...(topic ? { topic } : {}),
        ...(words.length ? { q: words.join(" ") } : {}),
        ...(symbol ? { symbol } : {}),
      };
    },
    clear() {},
  };
}
