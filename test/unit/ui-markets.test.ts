import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** The Markets pane (ui/markets.js), the one drawer it draws, the holding that opens it by key (ui/asset.js) and the connections it opens
 * (ui/connect.js), run as the page runs them — after ui/core.js, in one global scope — in a stand-in browser: what it draws from an explore
 * read, what each button signs or asks, and that a venue that refuses is shown in its own words. No server: the reads are answered here */
const PUBLIC = fileURLToPath(new URL("../../src/portfolio/public/", import.meta.url));
const NOW = Date.parse("2026-10-06T05:00:00.000Z");

const venue = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, live: true, usd: 100, cashUsd: 0, holdings: [], asOf: "2026-10-06T04:59:00.000Z", plugged: true, ...extra });
const account = (over: Record<string, unknown> = {}) => ({
  now: new Date(NOW).toISOString(),
  venues: [venue("ex", "Exchange X", { trade: { can: true, what: "spot and perpetuals", kinds: ["spot", "perp"], positions: true } }), venue("kalshi", "Kalshi", { trade: { can: false, what: "event contracts", kinds: ["event"] } })],
  connectLive: {
    home: "/home/x",
    writes: { on: true, capUsd: 250, turnOn: "npm run account" },
    options: [
      { kind: "exchange", connector: "live:exchange", needs: "key-file", label: "Exchange account · API key", venues: ["okx", "kraken"] },
      { kind: "kalshi", connector: "live:kalshi", needs: "key-file", label: "Kalshi · prediction-market account, API key" },
      { kind: "polymarket-trade", connector: "live:polymarket-trade", needs: "key-file", label: "Polymarket · trading" },
      { kind: "standin-pubex", connector: "live:standin-pubex", needs: "cli", label: "Stand-in Public Exchange · a stand-in" },
    ],
  },
  watch: [],
  cards: [],
  orders: [],
  intents: [],
  asks: [],
  keys: [],
  requests: [],
  dial: { revoked: [] },
  health: {},
  mode: "guard",
  ...over,
});
/* Kalshi's key may trade */
const kalshiTrades = () => account({ venues: [account().venues[0], venue("kalshi", "Kalshi", { trade: { can: true, what: "event contracts", kinds: ["event"], positions: true } })] });

const btc = {
  key: "coin:BTC",
  kind: "coin",
  name: "Bitcoin",
  base: "BTC",
  price: 62140,
  changePct24h: 2.1,
  volumeUsd24h: 1.9e9,
  tabs: ["now", "crypto"],
  at: [
    { venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT", connected: true, canTrade: true, public: false, price: 62140, open: true },
    { venue: "okx-public", venueName: "OKX", symbol: "BTC/USDT", connected: false, canTrade: false, public: true, price: 62150, connectTo: "okx", connector: "live:exchange:okx" },
  ],
};
const btcPerp = { key: "perp:BTC", kind: "perp", name: "BTC perpetual", base: "BTC", price: 62180, changePct24h: 1.2, volumeUsd24h: 4.2e9, fundingRate: 0.0001, tabs: ["now", "perps"], at: [{ venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT:USDT", connected: true, canTrade: true, public: false, price: 62180, open: true }] };
const doge = {
  key: "coin:DOGE",
  kind: "coin",
  name: "DOGE",
  base: "DOGE",
  price: 0.12121,
  changePct24h: -3.1,
  volumeUsd24h: 880_000,
  changeFrom: { venue: "okx-public", venueName: "OKX" },
  tabs: ["now", "crypto"],
  at: [{ venue: "okx-public", venueName: "OKX", symbol: "DOGE/USDT", connected: false, canTrade: false, public: true, price: 0.12121, connectTo: "okx", connector: "live:exchange:okx" }],
};
const fed = {
  key: "kalshi:KXFED-DEC",
  kind: "event",
  name: 'Fed cuts in December? <img src=x onerror="alert(1)">',
  price: 0.62,
  volumeUsd24h: 4_100_000,
  category: "Economics",
  closeTime: new Date(NOW + 2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 30_000).toISOString(),
  tabs: ["now", "predictions"],
  outcomes: [
    { label: "YES", price: 0.62, bid: 0.61, ask: 0.63, at: [{ venue: "kalshi", symbol: "KXFED-DEC:YES" }, { venue: "pm-public", symbol: "fed-dec:Yes" }] },
    { label: "NO", price: 0.38, bid: 0.37, ask: 0.39, at: [{ venue: "kalshi", symbol: "KXFED-DEC:NO" }, { venue: "pm-public", symbol: "fed-dec:No" }] },
  ],
  at: [
    { venue: "kalshi", venueName: "Kalshi", symbol: "KXFED-DEC:YES", connected: true, canTrade: false, public: false, price: 0.62, open: true, note: "this key may not trade: it was made read-only" },
    { venue: "pm-public", venueName: "Polymarket", symbol: "fed-dec:Yes", connected: false, canTrade: false, public: true, price: 0.61, connectTo: "polymarket", connector: "live:polymarket-trade" },
  ],
};
/* a pre-IPO company's perpetual, as the account lists it (F5): the valuation its price implies, per venue in the venue's own unit; the
   company it is on; the issuer's words. Only under All and Pre-IPO, never under Perps */
const anth = {
  key: "perp:ANTHROPIC",
  kind: "perp",
  name: "Anthropic pre-IPO",
  base: "ANTHROPIC",
  category: "Pre-IPO",
  price: 208,
  changePct24h: 4.2,
  volumeUsd24h: 31_000_000,
  fundingRate: 0.0001,
  implied: { perPoint: 1e9, unit: "$1 of contract price stands for $1B of valuation", usd: 2.08e12 },
  group: { id: "anthropic", title: "Anthropic" },
  issuer: "Anthropic",
  eligibility: "Anthropic, 29 June 2026: transfers of its shares without its approval are void",
  tabs: ["all", "preipo"],
  at: [
    { venue: "okx-public", venueName: "OKX", symbol: "ANTHROPIC-USDT-SWAP", connected: false, canTrade: false, public: true, price: 208, open: true, connectTo: "okx", connector: "live:exchange:okx", implied: { perPoint: 1e10, unit: "OKX: $1 of contract price stands for $10B of valuation (since 30 June 2026)", usd: 2.08e12 } },
    { venue: "ex", venueName: "Exchange X", symbol: "ANTHROPIC/USDT:USDT", connected: true, canTrade: true, public: false, price: 2080, open: true, implied: { perPoint: 1e9, unit: "Exchange X: $1 of contract price stands for $1B of valuation", usd: 2.08e12 } },
  ],
};
/* the prediction market about that company's IPO: an ordinary event under Predictions */
const ipoEvent = {
  key: "kalshi:KXIPOANTHROPIC-26",
  kind: "event",
  name: "Anthropic IPO before 2027?",
  price: 0.31,
  contracts24h: 12_400,
  category: "IPOs",
  closeTime: new Date(NOW + 40 * 86_400_000).toISOString(),
  tabs: ["all", "predictions"],
  outcomes: [
    { label: "YES", price: 0.31, bid: 0.3, ask: 0.32, at: [{ venue: "kalshi", symbol: "KXIPOANTHROPIC-26:YES" }] },
    { label: "NO", price: 0.69, bid: 0.68, ask: 0.7, at: [{ venue: "kalshi", symbol: "KXIPOANTHROPIC-26:NO" }] },
  ],
  at: [{ venue: "kalshi", venueName: "Kalshi", symbol: "KXIPOANTHROPIC-26:YES", connected: true, canTrade: true, public: false, price: 0.31, open: true }],
};
/* the account's explore read today (its first tab is still `now`) */
const explore = {
  ok: true,
  asOf: new Date(NOW).toISOString(),
  tabs: [{ id: "now", label: "Now", count: 3 }, { id: "crypto", label: "Crypto", count: 2 }, { id: "predictions", label: "Predictions", count: 1 }],
  items: [fed, btc, doge],
  movers: [doge],
  closing: [fed],
  mostTraded: [btc, doge],
  missing: [{ venue: "binance-public", venueName: "Binance", why: "Binance does not serve this location: that is its own rule, and the account does not look for a way around it", said: "Service unavailable from a restricted location.", code: "E_VENUE_GEOBLOCKED", connected: false }],
  notes: ["Predictions: at most 12 rows, each venue's busiest in turn, without sports, weather and entertainment; a search reaches everything the venues' listings loaded."],
};
/* the read once the account's tabs are all · crypto · stocks · rwas · perps · preipo · predictions (F5) */
const exploreF5 = {
  ...explore,
  tabs: [{ id: "all", label: "All", count: 6 }, { id: "crypto", label: "Crypto", count: 2 }, { id: "perps", label: "Perps", count: 1 }, { id: "preipo", label: "Pre-IPO", count: 1 }, { id: "predictions", label: "Predictions", count: 2 }],
  items: [btcPerp, anth, btc, fed, ipoEvent, doge],
  movers: [],
  closing: [],
  mostTraded: [],
};

/** the page's scripts in a stand-in browser: elements that take listeners, a clock fixed at NOW, reads answered by `answer` */
function page(answer: (path: string, init?: { method?: string; body?: string }) => unknown) {
  const asked: Array<{ path: string; method: string; body?: unknown }> = [];
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, value: "", textContent: "", innerHTML: "", contains: () => false, open: false });
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
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: {} }, hidden: false, activeElement: null },
    location: { hash: "#/markets", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    Owner: { role: "owner", why: (r: { body?: { refusal?: { message?: string } } }) => r.body?.refusal?.message ?? "" },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    fetch: async (path: string, init?: { method?: string; body?: string }) => {
      asked.push({ path, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(init.body) } : {}) });
      const body = await answer(path, init);
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
  // the page's order: the contract, the connections, the holding's opener, then the pane that draws the drawer they both open
  for (const f of ["ui/core.js", "ui/connect.js", "ui/asset.js", "ui/markets.js"]) new Script(readFileSync(join(PUBLIC, f), "utf8"), { filename: f }).runInContext(ctx);
  const run = <T = unknown>(code: string) => runInContext(code, ctx) as T;
  return { run, asked, set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
/* a pane element, as the shell hands one over */
const PANE = 'var EL = { innerHTML: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], contains: () => false }';
/* a button pressed, as the handlers read it */
const press = (dataset: Record<string, string>) => `({ target: { closest: (s) => (s === "[data-act]" ? { dataset: ${JSON.stringify(dataset)}, disabled: false } : null) } })`;

describe("the Markets pane", () => {
  it("says prices, volumes, valuations and countdowns as a person reads them", () => {
    const p = page(() => ({}));
    expect(p.run('[mkCents(0.62), mkCents(0.004), mkCents(0), mkCents(undefined)]')).toEqual(["62¢", "0.4¢", "0¢", "—"]);
    expect(p.run('[mkVol(1.9e9), mkVol(120e6), mkVol(880000), mkVol(412), mkVol(undefined)]')).toEqual(["$1.9B", "$120M", "$880k", "$412", "—"]);
    expect(p.run('[mkUsd(62140), mkUsd(0.12121), mkUsd(null)]')).toEqual(["$62,140.00", "$0.1212", "—"]);
    // a valuation to three figures, as the Trade pane's picker says it too (mkValuation is top-level for it)
    expect(p.run('[mkValuation(2.08e12), mkValuation(965e9), mkValuation(12.5e9), mkValuation(4.2e6), mkValuation(undefined)]')).toEqual(["$2.08T", "$965B", "$12.5B", "$4.2M", "—"]);
    expect(p.run(`mkLeft(${2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 30_000})`)).toBe("Closes in 2d 04:12");
    expect(p.run(`mkLeft(${6 * 3_600_000 + 48 * 60_000 + 10_000})`)).toBe("Closes in 06:48:10");
    expect(p.run("mkLeft(-5)")).toBe("Closed");
    expect(p.run('[mkLabel("YES"), mkLabel("UP"), mkLabel("Falcons")]')).toEqual(["Yes", "Up", "Falcons"]);
    expect(p.run('mkFmt({ price: 0.6, bid: 0.59, ask: 0.61 }, "c")')).toBe("61¢");
    expect(p.run('mkFmt({ price: 0.6, ask: 0.61 }, "c-last")')).toBe("60¢");
    expect(p.run('mkFmt({ price: 101.5, bid: 101.4 }, "bid")')).toBe("$101.40");
  });

  it("says, in one line over the list, when the prices were read, how they reach the page, and whose they are, group by group", () => {
    const p = page(() => ({}));
    const leg = (venue: string, venueName: string, more: Record<string, unknown> = {}) => ({ venue, venueName, symbol: "X", connected: false, public: true, canTrade: false, ...more });
    const body = {
      asOf: new Date(NOW - 12_000).toISOString(),
      items: [
        { key: "btc", kind: "coin", name: "BTC", at: [leg("ex", "Stand-in Exchange", { connected: true, public: false, canTrade: true }), leg("kraken", "Kraken"), leg("okx", "OKX")] },
        { key: "paper", kind: "coin", name: "ETH", at: [leg("paper-1", "Momentum · paper", { connected: true, public: false, paper: true })] },
        { key: "nvda", kind: "stock", name: "NVIDIA", quoteFrom: "Robinhood · real time", at: [leg("us", "US stocks", { quoteFrom: "Robinhood · real time" })] },
        { key: "aapl", kind: "stock", name: "Apple", quoteFrom: "Cboe · 15 min delayed", at: [leg("us", "US stocks")] },
        { key: "fed", kind: "event", name: "Fed?", at: [leg("kalshi", "Kalshi"), leg("poly", "Polymarket")] },
      ],
    };
    p.set("BODY", body);
    const when = p.run<string>(`nyTime(${NOW - 12_000})`);
    const html = p.run<string>("mkAsOfHtml(BODY)");
    expect(html).toContain(`Prices read ${when} New York · polled every 5 s while on screen · your venues: Stand-in Exchange · paper: Momentum · public lists: Kraken, OKX · US stocks: Robinhood · real time, Cboe · 15 min delayed where marked · predictions: Kalshi, Polymarket`);
    expect(html).toMatch(/^<p class="mk-asof" title="/);
    // on the push channel the line says so; with one stock source nothing is "where marked"; more than four names are counted
    p.run("stHealth = () => 'connected'");
    expect(p.run<string>("mkAsOfHtml({ asOf: BODY.asOf, items: [BODY.items[2]] })")).toContain("pushed live · US stocks: Robinhood · real time</p>");
    expect(p.run<string>("mkAsOfHtml({ asOf: BODY.asOf, items: [{ key: 'x', kind: 'coin', name: 'X', at: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ venue: n, venueName: n, symbol: 'X', connected: false, public: true, canTrade: false })) }] })")).toContain("public lists: A, B, C, D +2");
    // nothing without a read
    expect(p.run<string>("mkAsOfHtml(null)")).toBe("");
    expect(p.run<string>("mkAsOfHtml({ items: [] })")).toBe("");
  });

  it("sends a Buy to the venue that takes the order, to the connection where only public prices list it, else says why in the venue's words", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    expect(p.run("JSON.stringify(mkRoute(ITEMS.btc))")).toBe(JSON.stringify({ act: "trade", venue: "ex", symbol: "BTC/USDT", venueName: "Exchange X" }));
    // only OKX's public prices list DOGE: its connection's own form
    expect(p.run("JSON.stringify(mkRoute(ITEMS.doge))")).toBe(JSON.stringify({ act: "connect", connector: "live:exchange:okx", venue: "okx", venueName: "OKX", note: "" }));
    // the connected Kalshi key refuses; Polymarket lists it publicly: connect Polymarket
    expect(p.run("mkRoute(ITEMS.fed, 1).act")).toBe("connect");
    expect(p.run("mkRoute(ITEMS.fed, 1).connector")).toBe("live:polymarket-trade");
    // with no public listing to connect, Kalshi's own words, and how to fix the key
    p.run("ITEMS.fedK = { ...ITEMS.fed, at: [ITEMS.fed.at[0]], outcomes: ITEMS.fed.outcomes.map((o) => ({ ...o, at: [o.at[0]] })) }");
    const why = p.run<{ act: string; venue: string; text: string }>("mkRoute(ITEMS.fedK, 0)");
    expect(why.act).toBe("why");
    expect(why.venue).toBe("kalshi");
    expect(why.text).toContain("Kalshi: this key may not trade: it was made read-only.");
    expect(why.text).toContain("Create New API Key");
    // an outcome is traded by its own market
    p.set("A", account({ venues: [venue("kalshi", "Kalshi", { trade: { can: true, what: "event contracts", kinds: ["event"] } })] }));
    p.run("ITEMS.fedOk = { ...ITEMS.fedK, at: [{ ...ITEMS.fedK.at[0], canTrade: true }] }");
    expect(p.run("mkRoute(ITEMS.fedOk, 1).symbol")).toBe("KXFED-DEC:NO");
    // a server started read-only places nothing, and says how to start it to trade
    p.set("A", account({ connectLive: { ...account().connectLive, writes: { on: false, capUsd: 0, turnOn: "npm run account" } } }));
    expect(p.run("JSON.stringify(mkRoute(ITEMS.btc))")).toBe(JSON.stringify({ act: "why", text: "Trading is off on this server: start it with npm run account." }));
    expect(p.run("mkRoute(ITEMS.doge).act")).toBe("why");
  });

  it("sends a Buy to a paper account before a real one — except under a venue's lens, where that venue is the owner's own pick and comes first, as the ticket opens there", () => {
    const p = page(() => ({}));
    const trades = { can: true, what: "spot", kinds: ["spot"] };
    p.set("A", account({ venues: [venue("ex", "Exchange X", { trade: trades }), venue("kraken", "Kraken", { trade: trades }), venue("pap", "Paper account", { paper: true, trade: trades })] }));
    const leg = (id: string, name: string) => ({ venue: id, venueName: name, symbol: "BTC/USD", connected: true, canTrade: true, public: false, price: 62140, open: true });
    p.set("ITEMS", { btc: { ...btc, at: [leg("ex", "Exchange X"), leg("kraken", "Kraken"), leg("pap", "Paper account")] } });
    // every account, and the Paper lens: the paper account
    expect(p.run<Record<string, unknown>>("mkRoute(ITEMS.btc)")).toMatchObject({ act: "trade", venue: "pap", paper: true });
    p.run('view.lens = "paper"');
    expect(p.run<Record<string, unknown>>("mkRoute(ITEMS.btc)")).toMatchObject({ act: "trade", venue: "pap" });
    // Real money: no paper account at all, the first real one
    p.run('view.lens = "real"');
    expect(p.run<Record<string, unknown>>("mkRoute(ITEMS.btc)")).toMatchObject({ act: "trade", venue: "ex" });
    // a venue's lens: that venue, though a paper account trades it too — what the ticket's own rule opens (tkFirstLeg)
    p.run('view.lens = "venue:kraken"');
    expect(p.run<Record<string, unknown>>("mkRoute(ITEMS.btc)")).toEqual({ act: "trade", venue: "kraken", symbol: "BTC/USD", venueName: "Kraken" });
    // a venue's lens whose venue does not trade it: a paper account before a real one, as under every account
    p.run('view.lens = "venue:nowhere"');
    expect(p.run<Record<string, unknown>>("mkRoute(ITEMS.btc)")).toMatchObject({ act: "trade", venue: "pap" });
    p.run('view.lens = ""');
  });

  it("opens the ticket on the row's kind — crypto · stocks · rwas · perps · preipo · predictions — which the Trade seg follows; no variant", () => {
    const p = page(() => ({}));
    p.set("A", kalshiTrades());
    p.set("ITEMS", { btc, btcPerp, doge, fed, anth, ipoEvent });
    expect(p.run("[mkKindOf(ITEMS.btc), mkKindOf(ITEMS.btcPerp), mkKindOf(ITEMS.anth), mkKindOf(ITEMS.fed), mkKindOf({ kind: 'stock' }), mkKindOf({ kind: 'rwa' }), mkKindOf({ kind: 'perp', category: 'Pre-IPO' }), mkKindOf({ kind: 'stable' })]")).toEqual(["crypto", "perps", "preipo", "predictions", "stocks", "rwas", "preipo", "crypto"]);
    p.run("var TICKETS = []; globalThis.openTicket = (x) => TICKETS.push(x)");
    p.run('mkTrade(ITEMS.btc, "buy")');
    expect(p.run<unknown[]>("TICKETS")[0]).toEqual({ venue: "ex", symbol: "BTC/USDT", side: "buy", kind: "crypto", key: "coin:BTC", base: "BTC", name: "Bitcoin" });
    // an outcome: the ticket on the predictions face, the outcome named
    p.run("ITEMS.fedOk = { ...ITEMS.fed, at: [{ ...ITEMS.fed.at[0], canTrade: true }] }");
    p.run('mkTrade(ITEMS.fedOk, "buy", 1)');
    expect(p.run<unknown[]>("TICKETS")[1]).toEqual({ venue: "kalshi", symbol: "KXFED-DEC:NO", side: "buy", outcome: "NO", kind: "predictions", key: "kalshi:KXFED-DEC", name: fed.name });
    // the drawer's Across venues → Trade on a pre-IPO company row: the preipo face, at that venue
    p.run('MKT.open = { item: ITEMS.anth, interval: "1h", ipo: [] }');
    p.run(`mkDrawerClick(${press({ act: "trade-at", venue: "ex", symbol: "ANTHROPIC/USDT:USDT" })})`);
    expect(p.run<unknown[]>("TICKETS")[2]).toEqual({ venue: "ex", symbol: "ANTHROPIC/USDT:USDT", side: "buy", kind: "preipo", key: "perp:ANTHROPIC", base: "ANTHROPIC", name: "Anthropic pre-IPO" });
    // the drawer's Sell: the sell side, the same kind
    p.run('MKT.open = { item: ITEMS.btcPerp, interval: "1h", ipo: [] }');
    p.run(`mkDrawerClick(${press({ act: "sell", venue: "ex", symbol: "BTC/USDT:USDT" })})`);
    expect(p.run<unknown[]>("TICKETS")[3]).toMatchObject({ venue: "ex", symbol: "BTC/USDT:USDT", side: "sell", kind: "perps" });
    expect(JSON.stringify(p.run("TICKETS"))).not.toContain("variant");
  });

  it("watches with a signed setWatch: a public listing under the venue it would be once connected, and off for what is watched", async () => {
    const drafts: unknown[] = [];
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge });
    p.run("own = async (d) => { DRAFTS.push(d); return { status: 200, body: {} }; }; var DRAFTS = []");
    expect(p.run("JSON.stringify(mkWatchDraft(ITEMS.doge))")).toBe(JSON.stringify({ type: "setWatch", venue: "okx", symbol: "DOGE/USDT", on: "true" }));
    expect(p.run("JSON.stringify(mkWatchDraft(ITEMS.btc))")).toBe(JSON.stringify({ type: "setWatch", venue: "ex", symbol: "BTC/USDT", on: "true" }));
    p.set("A", account({ watch: [{ venue: "okx", symbol: "DOGE/USDT", at: "2026-10-06T04:00:00.000Z" }] }));
    expect(p.run("JSON.stringify(mkWatchDraft(ITEMS.doge))")).toBe(JSON.stringify({ type: "setWatch", venue: "okx", symbol: "DOGE/USDT", on: "" }));
    expect(p.run("mkStar(ITEMS.doge, 0)")).toContain('aria-pressed="true" aria-label="Stop watching DOGE"');
    // on the Watching tab the star says since when
    expect(p.run('mkStar(ITEMS.doge, 0, "2026-10-06T04:00:00.000Z")')).toContain('title="Watching since Tue 6 Oct"');
    // the ★ in the pane signs exactly that
    p.run("MKT.reg = [ITEMS.doge]");
    p.run(`mkPaneClick(${press({ act: "watch", i: "0" })})`);
    await settle();
    drafts.push(...p.run<unknown[]>("DRAFTS"));
    expect(JSON.stringify(drafts)).toBe(JSON.stringify([{ type: "setWatch", venue: "okx", symbol: "DOGE/USDT", on: "" }]));
  });

  it("draws a card with Yes and No in cents, a countdown, the question escaped, and fresh prices asked only at connected venues; lean under Predictions", () => {
    const p = page(() => ({}));
    p.set("A", account({ venues: [venue("kalshi", "Kalshi", { trade: { can: true, what: "event contracts", kinds: ["event"] } })] }));
    p.set("ITEM", { ...fed, at: [{ ...fed.at[0], canTrade: true }, fed.at[1]] });
    const html = p.run<string>("MKT.reg = []; mkCard(ITEM)");
    expect(html).not.toContain("<img");
    expect(html).toContain("Fed cuts in December? &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('data-close="2026-10-08T09:12:30.000Z">Closes in 2d 04:12</span>');
    expect(html).toContain('Yes · <span data-q="kalshi|KXFED-DEC:YES" data-fmt="c">63¢</span>');
    expect(html).toContain('No · <span data-q="kalshi|KXFED-DEC:NO" data-fmt="c">39¢</span>');
    // the public listing is never asked for a quote (it has no key to read one with)
    expect(html).toContain('data-pairs="kalshi|KXFED-DEC:YES,kalshi|KXFED-DEC:NO"');
    expect(html).not.toContain("pm-public|");
    // the facts line, where the tab does not already say what the card is (a search, All results)
    expect(html).toContain("Kalshi · Polymarket · $4.1M vol");
    // under Predictions the tab says it: the card is lean — countdown, question, Yes and No
    const lean = p.run<string>("mkCard(ITEM, { lean: true })");
    expect(lean).not.toContain("Kalshi · Polymarket");
    expect(lean).not.toContain("Economics");
    expect(lean).toContain("Closes in 2d 04:12");
    expect(lean).toContain('data-act="yn"');
    // a fresh quote, once read, is what the card shows
    p.run(`MKT.quotes.set("kalshi|KXFED-DEC:YES", { at: ${NOW}, market: { price: 0.7, bid: 0.69, ask: 0.71 } })`);
    expect(p.run<string>("mkCard(ITEM)")).toContain('data-fmt="c">71¢</span>');
  });

  it("names an event's market short — its event's title and the market's own words, as the venue gives them — on one line, in a row and on a card; its whole question in its hover card", () => {
    const p = page(() => ({}));
    p.set("A", account());
    // as Kalshi lists its Fed decision (live/public-markets.ts kalshiLegs): the market's question, its event's title, the market's own words
    const kfed = { ...fed, key: "kalshi:KXFEDDECISION-26OCT-H0", name: "Will the Federal Reserve Hike rates by 0bps at their October 2026 meeting? (Fed maintains rate)", event: { id: "KXFEDDECISION-26OCT", title: "Fed decision in Oct 2026?", market: "Fed maintains rate" } };
    p.set("ITEMS", { kfed, btc, plain: fed, same: { ...fed, event: { id: "e", title: "Fed cuts in December? All of December", market: "December" } } });
    expect(p.run("JSON.stringify(mkShort(ITEMS.kfed))")).toBe(JSON.stringify({ name: "Fed decision in Oct 2026?", opt: "Fed maintains rate" }));
    // not an event, or an event the venue gives no title for: its name, whole
    expect(p.run("mkShort(ITEMS.btc).name")).toBe("Bitcoin");
    expect(p.run("mkShort(ITEMS.plain).name")).toBe(fed.name);
    // the market's words already in its event's title are not said twice
    expect(p.run("mkShort(ITEMS.same).opt")).toBe("");
    const row = p.run<string>("MKT.reg = []; mkTable([ITEMS.kfed], '')");
    expect(row).toContain('<b>Fed decision in Oct 2026?<span class="mk-opt"> · Fed maintains rate</span></b>');
    // the whole question is not on the row's face — only in words for a screen reader (and the ★'s label)
    expect(row.replace(/<span class="sr">[^<]*<\/span>/g, "").replace(/<[^>]*>/g, "")).not.toContain("Hike rates by 0bps");
    expect(row).toContain('<span class="sr">. Will the Federal Reserve Hike rates by 0bps at their October 2026 meeting? (Fed maintains rate) · Economics · closes Thu 8 Oct, 05:12 New York</span>');
    // its hover card: the whole question, what it is with its countdown, where it is listed — connected first, public prices quieter
    const peek = p.run<string>("mkPeekHtml(ITEMS.kfed)");
    expect(peek).toContain('<b class="mk-peek-n">Will the Federal Reserve Hike rates by 0bps at their October 2026 meeting? (Fed maintains rate)</b>');
    expect(peek).toContain('<span class="mk-peek-k">Economics · <span class="mk-close" data-ended="Closed" data-close="2026-10-08T09:12:30.000Z">Closes in 2d 04:12</span></span>');
    expect(peek).toContain('<span class="mk-peek-w">Kalshi · <span class="dim">Polymarket</span></span>');
    // a card says it short too, the question for a screen reader and in its hover card
    const card = p.run<string>("mkCard(ITEMS.kfed)");
    expect(card).toMatch(/class="mk-card-q" data-act="open" data-i="\d+" data-fk="open:kalshi:KXFEDDECISION-26OCT-H0" data-peek="\d+"><span>Fed decision in Oct 2026\?<span class="mk-opt"> · Fed maintains rate<\/span><span class="sr">\. Will the Federal Reserve Hike rates/);
    // a name the page did not write stays words
    expect(p.run<string>("mkPeekHtml(ITEMS.plain)")).toContain("Fed cuts in December? &lt;img src=x");
    expect(p.run<string>("mkPeekHtml(ITEMS.plain)")).not.toContain("<img");
    // nothing shown, nothing to keep after a draw
    expect(() => p.run("mkPeekKeep(); mkPeekHide()")).not.toThrow();
  });

  it("draws each market's logo over its letters — the letters stay where a logo does not load — and credits Elbstream wherever one of its logos is shown", async () => {
    const BTC_LOGO = "https://api.elbstream.com/logos/crypto/BTC";
    const KALSHI_PIC = "https://assets.kalshi.com/series-images-webp/KXFEDDECISION.webp";
    const withLogos = { ...explore, items: [{ ...fed, icon: KALSHI_PIC }, { ...btc, icon: BTC_LOGO }, doge] };
    const p = page((path) => (path.startsWith("/api/account/explore") ? withLogos : {}));
    p.set("A", account());
    // the tile: the letters, and the logo over them, with no referrer; none named, the letters alone, as before
    expect(p.run<string>(`avatar("BTC", "", ${JSON.stringify(BTC_LOGO)})`)).toBe(`<span class="av" aria-hidden="true">BTC<img class="av-im" src="${BTC_LOGO}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`);
    expect(p.run<string>('avatar("DOGE", "lg")')).toBe('<span class="av lg" aria-hidden="true">DOGE</span>');
    p.run(`ROUTE.tab = "markets"; ${PANE}`);
    p.run("renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })");
    await settle();
    await settle();
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain(`<span class="av" aria-hidden="true">BTC<img class="av-im" src="${BTC_LOGO}"`);
    expect(html).toContain(`<span class="av" aria-hidden="true">ECON<img class="av-im" src="${KALSHI_PIC}"`);
    expect(html).toContain('<span class="av" aria-hidden="true">DOGE</span>');
    // Elbstream's logos are shown with a link to it, under the list
    expect(html).toContain('<p class="logo-credit mk-credit"><a href="https://elbstream.com" target="_blank" rel="noopener noreferrer">Logos by Elbstream</a></p>');
    // a logo that did not load is not asked for again: its letters are the tile, and with no Elbstream logo shown, no credit
    p.run(`ICON_MISS.add(${JSON.stringify(BTC_LOGO)})`);
    p.run("for (const g of MKT.got.values()) g.at = Date.now(); renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })");
    const again = p.run<string>("EL.innerHTML");
    expect(again).toContain('<span class="av" aria-hidden="true">BTC</span>');
    expect(again).toContain(`src="${KALSHI_PIC}"`);
    expect(again).not.toContain("Logos by Elbstream");
    // the drawer credits it where its head shows one
    p.run("ICON_MISS.clear()");
    p.set("ITEMS", { btc: { ...btc, icon: BTC_LOGO }, fed: { ...fed, icon: KALSHI_PIC } });
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.btc, interval: "1h", ipo: [] })')).toContain("Logos by Elbstream");
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.fed, interval: "1h", ipo: [] })')).not.toContain("Logos by Elbstream");
  });

  it("names each venue that did not answer in its own words, a location rule as the venue's rule and nothing more", () => {
    const p = page(() => ({}));
    const line = p.run<string>(`mkMissingLine(${JSON.stringify([...explore.missing, { venue: "kraken", venueName: "Kraken <b>", why: "no answer in 4 s", connected: true }, { venue: "ex", venueName: "X", why: "far from the others", symbol: "BTC/USD", connected: true }])})`);
    expect(line).toBe('<p class="mk-missing">Not shown: <b>Binance</b>: “Service unavailable from a restricted location” — its own rule for this location · <b>Kraken &lt;b&gt;</b>: no answer in 4 s.</p>');
    expect(line).not.toMatch(/vpn|proxy|another region|elsewhere/i);
    expect(p.run("mkMissingLine([])")).toBe("");
    // an exchange read through two public sources (its spot tickers and its pre-IPO perpetuals), both refused with the same words: named once
    const twice = p.run<string>(`mkMissingLine(${JSON.stringify([...explore.missing, { ...explore.missing[0], venue: "binance-preipo-public" }, { venue: "bybit-public", venueName: "Bybit", why: "Bybit does not serve this location", said: "The Amazon CloudFront distribution is configured to block access from your country", code: "E_VENUE_GEOBLOCKED", connected: false }])})`);
    expect(twice.match(/<b>Binance<\/b>/g)).toHaveLength(1);
    expect(twice).toContain("<b>Bybit</b>");
  });

  it("draws All as one table of everything the read returned, with the tabs it lists (a legacy Now is All), a skeleton while it loads, and keeps what it drew when a later read fails", async () => {
    let fail = false;
    const p = page((path) => (path.startsWith("/api/account/explore") ? (fail ? { ok: false, refusal: { message: "the account is restarting" } } : explore) : {}));
    p.set("A", account({ watch: [{ venue: "ex", symbol: "BTC/USDT", at: "2026-10-06T04:00:00.000Z" }] }));
    p.run(`ROUTE.tab = "markets"; ${PANE}`);
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })');
    expect(p.run<string>("EL.innerHTML")).toContain('aria-busy="true"');
    // All is every row: the read is asked with no tab (the account's own list, busiest first) and never with a sort
    expect(p.asked.map((a) => a.path)).toEqual(["/api/account/explore"]);
    await settle();
    await settle();
    const html = p.run<string>("EL.innerHTML");
    const tabs = [...html.matchAll(/data-act="tab" data-tab="([a-z]*)"[^>]*aria-pressed="(true|false)">([^<]+)</g)].map((m) => `${m[3]}${m[2] === "true" ? "*" : ""}`);
    expect(tabs).toEqual(["All*", "Crypto", "Predictions", "Watching"]);
    // one table; over it the account's three lists as cards (mkListsHtml), not the old Now sections; no Venues board
    expect(html.match(/<table class="t mk-t">/g)).toHaveLength(1);
    expect([...html.matchAll(/<section class="mk-list" aria-label="([^"]+)">/g)].map((m) => m[1])).toEqual(["Biggest moves", "Most traded", "Closing soonest"]);
    expect(html).not.toMatch(/<h2[^>]*>(Closing soon|Movers)<\/h2>/);
    expect(html).not.toContain("mk-chip");
    expect(html).not.toContain("Your venues");
    expect(html).not.toContain("Connect a venue");
    // the event is a row too, one line high: its lead outcome in cents; what kind of thing it is and when it closes are in its hover card
    // (a screen reader hears them, as a time), not under its name — the countdown is in the Closing soonest list over the table, not the table
    expect(html).toContain('<span data-q="kalshi|KXFED-DEC:YES" data-fmt="c-last">62¢</span><span class="dim small"> Yes</span>');
    expect(html.slice(html.indexOf("<table"), html.indexOf("</table>"))).not.toContain("mk-close");
    expect(html).toContain('data-fk="open:kalshi:KXFED-DEC" data-peek="0"');
    // its row carries its close, so the list is read again the moment it closes (a rolling market's next one takes its place)
    expect(html).toContain('<tr data-k="kalshi:KXFED-DEC" data-pairs="kalshi|KXFED-DEC:YES,kalshi|KXFED-DEC:NO" data-ends="2026-10-08T09:12:30.000Z">');
    expect(html).not.toContain('<tr data-k="coin:BTC" data-pairs="ex|BTC/USDT" data-ends');
    expect(html).toContain('<span class="sr">. Economics · closes Thu 8 Oct, 05:12 New York</span>');
    p.set("FED", fed);
    expect(p.run<string>("mkPeekHtml(FED)")).toContain('Economics · <span class="mk-close" data-ended="Closed" data-close="2026-10-08T09:12:30.000Z">Closes in 2d 04:12</span>');
    // DOGE is only at OKX's public prices: its row connects; BTC trades at Exchange X
    expect(html).toContain('data-connector="live:exchange:okx" data-name="OKX"');
    expect(html).toMatch(/data-act="trade" data-i="\d+" data-fk="trade:coin:BTC"/);
    // the sort seg, Most traded pressed
    expect(html).toContain('data-act="sort" data-v="volume" data-fk="sort:volume" aria-pressed="true">Most traded</button>');
    // a later read fails: what was read stays, said to be from earlier
    fail = true;
    p.run("for (const g of MKT.got.values()) g.at = 0");
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })');
    await settle();
    await settle();
    const after = p.run<string>("EL.innerHTML");
    expect(after.match(/<table class="t mk-t">/g)).toHaveLength(1);
    expect(after).toContain("Couldn't read the markets again just now: the account is restarting.");
  });

  it("folds everything under the list into one line — why these, and what's not shown — and keeps it as the owner left it", async () => {
    const p = page((path) => (path.startsWith("/api/account/explore") ? explore : {}));
    p.set("A", account());
    p.run(`ROUTE.tab = "markets"; ${PANE}`);
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })');
    await settle();
    await settle();
    const html = p.run<string>("EL.innerHTML");
    expect(html.match(/<details class="mk-foot"/g)).toHaveLength(1);
    expect(html).toContain("<summary>Why these, and what's not shown ");
    // the notes and the venues that did not answer are inside it, not standing under the list
    expect(html).toContain("<b>Binance</b>: “Service unavailable from a restricted location”");
    expect(html).toContain('<p class="mk-note">Predictions: at most 12 rows');
    expect(html.indexOf('<p class="mk-note">')).toBeGreaterThan(html.indexOf('<details class="mk-foot"'));
    expect(html.indexOf("<b>Binance</b>")).toBeGreaterThan(html.indexOf('<details class="mk-foot"'));
    expect(html).not.toContain('<details class="mk-foot" open>');
    // opened by the owner, it stays open across the next redraw
    p.run('mkPaneToggle({ target: { classList: { contains: (c) => c === "mk-foot" }, open: true } })');
    expect(p.run("MKT.footOpen")).toBe(true);
    expect(p.run<string>("mkFootHtml(" + JSON.stringify(explore) + ")")).toContain('<details class="mk-foot" open>');
    // nothing to say: no line at all; a read-only server says so inside it
    expect(p.run("mkFootHtml({ notes: [], missing: [] })")).toBe("");
    p.set("A", account({ connectLive: { ...account().connectLive, writes: { on: false, capUsd: 0, turnOn: "npm run account" } } }));
    expect(p.run<string>("mkFootHtml({ notes: [], missing: [] })")).toContain("Read-only server: prices are read here, and nothing is traded or connected from it.");
    expect(p.run("mkNotes(['A few of the busiest markets · search for more.', '', 7])")).toBe('<p class="mk-note">A few of the busiest markets · search for more.</p>');
  });

  it("sorts here, never by asking the account again: most traded, biggest moves, closing soonest; the seg moves the route only", async () => {
    const p = page((path) => (path.startsWith("/api/account/explore") ? explore : {}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    expect(p.run("mkSortRows([ITEMS.fed, ITEMS.btc, ITEMS.doge], '').map((x) => x.key)")).toEqual(["kalshi:KXFED-DEC", "coin:BTC", "coin:DOGE"]);
    expect(p.run("mkSortRows([ITEMS.fed, ITEMS.btc, ITEMS.doge], 'volume').map((x) => x.key)")).toEqual(["coin:BTC", "kalshi:KXFED-DEC", "coin:DOGE"]);
    expect(p.run("mkSortRows([ITEMS.fed, ITEMS.btc, ITEMS.doge], 'movers').map((x) => x.key)")).toEqual(["coin:DOGE", "coin:BTC", "kalshi:KXFED-DEC"]);
    expect(p.run("mkSortRows([ITEMS.btc, ITEMS.doge, ITEMS.fed], 'closing').map((x) => x.key)")).toEqual(["kalshi:KXFED-DEC", "coin:BTC", "coin:DOGE"]);
    // the pane, sorted by the route: the rows in that order, the seg pressed there
    p.run(`ROUTE.tab = "markets"; ROUTE.params = { sort: "movers" }; ${PANE}`);
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { sort: "movers" } })');
    await settle();
    await settle();
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('data-v="movers" data-fk="sort:movers" aria-pressed="true"');
    expect(html.indexOf('data-fk="open:coin:DOGE"')).toBeLessThan(html.indexOf('data-fk="open:coin:BTC"'));
    expect(html.indexOf('data-fk="open:coin:BTC"')).toBeLessThan(html.indexOf('data-fk="open:kalshi:KXFED-DEC"'));
    // the pulse over All reads the Stocks tab once for its index tiles (kept like any read): not a sort's doing
    p.asked.splice(0, p.asked.length, ...p.asked.filter((a) => !a.path.includes("tab=stocks")));
    // the path of the read carries no sort; pressing a sort moves the route in place and reads nothing
    expect(p.asked.map((a) => a.path)).toEqual(["/api/account/explore"]);
    p.run("var GONE = []; go = (tab, params, opts) => GONE.push([tab, params, opts])");
    p.run(`mkPaneClick(${press({ act: "sort", v: "closing" })})`);
    expect(p.run("GONE")).toEqual([["markets", { sort: "closing" }, { replace: true }]]);
    p.run(`mkPaneClick(${press({ act: "sort", v: "volume" })})`);
    expect(p.run("GONE[1]")).toEqual(["markets", { sort: "" }, { replace: true }]);
    expect(p.asked.map((a) => a.path)).toEqual(["/api/account/explore"]);
  });

  it("draws the account's three lists over All — five rows each, the market's name and the list's figures, See all → to the whole list — and nothing while searching, elsewhere, or with nothing in them", async () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    const coins = [0, 1, 2, 3, 4, 5].map((i) => ({ ...btc, key: `coin:B${i}`, name: `Coin ${i}`, base: `B${i}`, changePct24h: 9 - i }));
    p.set("B", { asOf: new Date(NOW).toISOString(), items: [fed, btc, doge], movers: coins, mostTraded: [btc, doge], closing: [fed] });
    p.run("MKT.reg = []");
    const html = p.run<string>("mkListsHtml(B, lensNow())");
    expect([...html.matchAll(/<section class="mk-list" aria-label="([^"]+)">/g)].map((m) => m[1])).toEqual(["Biggest moves", "Most traded", "Closing soonest"]);
    // five rows at most, in the list's order; each the name button (registered, with its hover card) and the figures on the right
    const moves = html.slice(html.indexOf('aria-label="Biggest moves"'), html.indexOf('aria-label="Most traded"'));
    expect([...moves.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1])).toEqual(["Coin 0", "Coin 1", "Coin 2", "Coin 3", "Coin 4"]);
    expect(moves).toMatch(/<span class="up"><span aria-hidden="true">▲<\/span><span class="sr">up<\/span> 9(\.0)?%<\/span><span class="mk-li-px">/);
    expect(p.run<number>("MKT.reg.length")).toBe(5 + 2 + 1);
    expect(html).toContain('data-k="li:coin:BTC" data-pairs="ex|BTC/USDT"');
    const traded = html.slice(html.indexOf('aria-label="Most traded"'), html.indexOf('aria-label="Closing soonest"'));
    expect(traded).toContain('<span class="mk-li-vol">$1.9B</span>');
    const closing = html.slice(html.indexOf('aria-label="Closing soonest"'));
    expect(closing).toMatch(/<span class="mk-close" data-ended="Closed" data-close="[^"]+">Closes in 2d 04:12<\/span><span class="mk-li-px"><span data-q="kalshi\|KXFED-DEC:YES" data-fmt="c-last">62¢<\/span>/);
    // See all →: the same order over the whole list — All for moves and volume, Predictions for what closes soonest
    p.run("var SEEN = []; go = (tab, params, opts) => SEEN.push([tab, params, opts])");
    p.run(`mkPaneClick(${press({ act: "seeall", tab: "", sort: "movers" })})`);
    p.run(`mkPaneClick(${press({ act: "seeall", tab: "predictions", sort: "closing" })})`);
    expect(p.run("SEEN.map(([t, q]) => [t, q.tab, q.sort])")).toEqual([["markets", "all", "movers"], ["markets", "predictions", "closing"]]);
    // the lens narrows each list; a list with nothing is left out; with nothing in any, nothing is drawn
    expect(p.run<string>("mkListsHtml(B, { kind: 'venue', id: 'kalshi' })")).not.toContain('aria-label="Biggest moves"');
    expect(p.run<string>("mkListsHtml(B, { kind: 'venue', id: 'kalshi' })")).toContain('aria-label="Closing soonest"');
    expect(p.run<string>("mkListsHtml({ items: [ITEMS.fed] }, lensNow())")).toBe("");
    expect(p.run<string>("mkListsHtml(null, lensNow())")).toBe("");
    // the pane draws them over All only, and not over a search
    for (const [hash, there] of [["#/markets", true], ["#/markets?tab=crypto", false], ["#/markets?q=btc", false]] as const) {
      const q = page(() => ({ ok: true, tabs: [{ id: "all", label: "All", count: 3 }, { id: "crypto", label: "Crypto", count: 2 }], asOf: new Date(NOW).toISOString(), items: [fed, btc, doge], movers: [btc], mostTraded: [btc], closing: [fed] }));
      q.set("A", account());
      // the route as the shell keeps it: the redraw after the read draws from ROUTE.params, as the shell's would
      q.run(`ROUTE.tab = "markets"; ROUTE.params = Object.fromEntries(new URLSearchParams(${JSON.stringify(hash.split("?")[1] ?? "")})); ${PANE}`);
      q.run(`location.hash = ${JSON.stringify(hash)}; renderMarkets({ el: EL, owner: true, params: ROUTE.params, lens: lensNow() })`);
      await settle();
      await settle();
      expect(q.run<string>("EL.innerHTML").includes('class="mk-lists"'), hash).toBe(there);
    }
  });

  it("shows the tabs the account lists, in its order — All · Crypto · Perps · Pre-IPO · Predictions — and sends a legacy or unknown tab to All", async () => {
    const p = page((path) => (path.startsWith("/api/account/explore") ? exploreF5 : {}));
    p.set("A", account());
    expect(p.run("mkParams({ tab: 'now' })")).toEqual({ tab: "all", q: "", sort: "", bogus: true });
    expect(p.run("mkParams({ tab: 'venues', q: 'x' })")).toEqual({ tab: "all", q: "x", sort: "", bogus: true });
    expect(p.run("mkParams({ tab: 'sports' })")).toEqual({ tab: "all", q: "", sort: "", bogus: true });
    expect(p.run("mkParams({})")).toEqual({ tab: "all", q: "", sort: "", bogus: false });
    expect(p.run("mkParams({ q: ' fed ' })")).toEqual({ tab: "", q: "fed", sort: "", bogus: false });
    expect(p.run("mkParams({ tab: 'preipo', sort: 'closing' })")).toEqual({ tab: "preipo", q: "", sort: "closing", bogus: false });
    // a search typed on Watching searches every market
    expect(p.run("mkParams({ tab: 'watching', q: 'btc' })")).toEqual({ tab: "", q: "btc", sort: "", bogus: true });
    expect(p.run("mkParams({ tab: 'watching' })")).toEqual({ tab: "watching", q: "", sort: "", bogus: false });
    expect(p.run("MKT_TAB_IDS")).toEqual(["all", "crypto", "stocks", "rwas", "perps", "preipo", "predictions"]);
    // the hash named Now: the pane puts All in its place
    p.run(`ROUTE.tab = "markets"; ${PANE}; var GONE = []; go = (tab, params, opts) => GONE.push([tab, params, opts])`);
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "now" } })');
    expect(p.run("GONE")).toEqual([["markets", { tab: "all" }, { replace: true }]]);
    // Pre-IPO asked for: the read for that tab, the tabs in the account's order
    p.run('ROUTE.params = { tab: "preipo" }; renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "preipo" } })');
    expect(p.asked.map((a) => a.path)).toEqual(["/api/account/explore?tab=preipo"]);
    await settle();
    await settle();
    const html = p.run<string>("EL.innerHTML");
    const tabs = [...html.matchAll(/data-act="tab" data-tab="([a-z]*)"[^>]*aria-pressed="(true|false)">([^<]+)</g)].map((m) => `${m[3]}${m[2] === "true" ? "*" : ""}`);
    expect(tabs).toEqual(["All", "Crypto", "Perps", "Pre-IPO*", "Predictions"]);
    expect(html).not.toContain('data-tab="venues"');
  });

  it("says a failed first read in the account's words, with a way to try again — never a blank pane", async () => {
    const p = page(() => ({ ok: false, refusal: { message: "the account layer is not mounted" } }));
    p.set("A", account());
    p.run(`ROUTE.tab = "markets"; ${PANE}`);
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "crypto" } })');
    await settle();
    await settle();
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain("Couldn't read the markets: the account layer is not mounted.");
    expect(html).toContain('data-act="retry"');
    expect(html).toContain('data-tab="all"');
  });

  it("puts ONE action on a row — Trade, Connect to trade, or why not — and no Hand to agent (the drawer has it)", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge });
    const connect = p.run<string>("MKT.reg = []; mkActs(ITEMS.doge, 0)");
    expect(connect).toContain("Connect to trade");
    expect(connect).not.toContain('data-act="hand"');
    expect(connect.match(/<button/g)).toHaveLength(1);
    const trade = p.run<string>("mkActs(ITEMS.btc, 1)");
    expect(trade).toContain('data-act="trade" data-i="1" data-fk="trade:coin:BTC"');
    expect(trade.match(/<button/g)).toHaveLength(1);
    // the drawer keeps Hand to agent, with the row's kind
    p.run("var HANDED = []; globalThis.openHandToAgent = (x) => HANDED.push(x)");
    const drawer = p.run<string>('mkDrawerHtml({ item: ITEMS.btc, interval: "1h", ipo: [] })');
    expect(drawer).toContain('data-act="hand"');
    p.run('MKT.open = { item: ITEMS.btc, interval: "1h", ipo: [] }');
    p.run(`mkDrawerClick(${press({ act: "hand" })})`);
    expect(p.run("HANDED")).toEqual([{ venue: "ex", symbol: "BTC/USDT", venueName: "Exchange X", side: "buy", kind: "crypto" }]);
  });

  it("opens a connection's own form for Connect to trade, and lists every way of connecting the server offers", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.run("var OPENED = []; openConnect = (o, opts) => OPENED.push([o.kind, opts.exchange, opts.name])");
    expect(p.run("connectVia('live:exchange:okx', { name: 'OKX' })")).toBe(true);
    expect(p.run("connectVia('live:polymarket-trade', { name: 'Polymarket' })")).toBe(true);
    expect(p.run("connectVia('live:standin-pubex', { name: 'Stand-in Public Exchange' })")).toBe(true);
    expect(p.run("connectVia('live:nowhere', { name: 'Nowhere' })")).toBe(false);
    expect(p.run("OPENED")).toEqual([["exchange", "okx", "OKX"], ["polymarket-trade", "", "Polymarket"], ["standin-pubex", "", "Stand-in Public Exchange"]]);
    expect(p.run("[connectorOfVenue(A.venues[1]), connectorOfVenue(A.venues[0])]")).toEqual(["live:kalshi", ""]);
    // a second OKX account is still OKX: the connection the account names for it, and what to tick there
    const second = venue("okx-trading", "OKX Trading", { connector: "live:exchange:okx", trade: { can: false, what: "spot", kinds: ["spot"] } });
    p.set("A", account({ venues: [...account().venues, second, venue("mystery", "Mystery", { connector: "live:gone" })] }));
    expect(p.run("[connectorOfVenue(A.venues[2]), connectorOfVenue(A.venues[3])]")).toEqual(["live:exchange:okx", ""]);
    expect(p.run("keyHowFor(A.venues[2])")).toContain("Tick Read and Trade");
    // the pane's Connect to trade goes through connectVia
    p.run(`mkPaneClick(${press({ act: "connect", connector: "live:exchange:okx", name: "OKX" })})`);
    expect(p.run("OPENED.length")).toBe(4);
    const cat = p.run<string>("catalog(true, 'wide')");
    expect(cat).toContain('<div class="pick-h">More</div>');
    expect(cat).toContain('data-kind="standin-pubex" data-extra=""><b>Stand-in Public Exchange</b><span>On this machine</span>');
    // a venue that answered no before any key was made (GET /api/account/connect/reach): its tile says so, its words in the title; the ones
    // read by address ask their host one keyless question too; an answer of ok changes nothing
    const said = "Binance does not serve this location: that is its own rule, and the account does not look for a way around it. It answered: “Service unavailable from a restricted location”";
    p.run(`REACH.set("live:exchange:binance", { connector: "live:exchange:binance", state: "location", said: ${JSON.stringify(said)}, at: "2026-10-06T05:00:00.000Z" }); REACH.set("live:exchange:okx", { connector: "live:exchange:okx", state: "ok", at: "2026-10-06T05:00:00.000Z" }); REACH.set("live:metamask", { connector: "live:metamask", state: "setup", said: "mm is not signed in on this machine: run mm login in a terminal, then check again", at: "2026-10-06T05:00:00.000Z" })`);
    const marked = p.run<string>("catalog(true)");
    expect(marked).toContain(`<button type="button" class="tile tile-off" data-kind="exchange" data-extra="binance" title="${said.replace(/'/g, "&#39;")}"><b>Binance</b><span><em class="off">Not served here</em></span></button>`);
    expect(marked).toContain('<button type="button" class="tile" data-kind="exchange" data-extra="okx"><b>OKX</b><span>API key</span></button>');
    expect(p.run("[tileConnector('exchange', 'okx'), tileConnector('exchange', ''), tileConnector('hyperliquid', ''), tileConnector('wallet', 'watch'), tileConnector('kalshi', '')]")).toEqual(["live:exchange:okx", "", "live:hyperliquid", "live:wallet", "live:kalshi"]);
    // the form's note: the venue's words, when it was asked, Check again; Polymarket's offers to watch a wallet there by its address
    const note = p.run<string>(`reachNoteHtml(REACH.get("live:exchange:binance"), "exchange")`);
    expect(note).toContain("It answered: “Service unavailable from a restricted location”");
    expect(note).toContain('<span class="dim">(asked 01:00)</span>');
    expect(note).toContain('<button type="button" class="link" data-reach="again">Check again</button>');
    expect(note).not.toContain("data-reach=\"watch\"");
    p.set("A", { ...account(), connectLive: { ...account().connectLive, options: [...account().connectLive.options, { kind: "polymarket", connector: "live:polymarket", needs: "address", label: "Polymarket · by the account wallet's address" }] } });
    expect(p.run<string>(`reachNoteHtml({ state: "location", said: "Polymarket does not serve this location", at: "2026-10-06T05:00:00.000Z" }, "polymarket-trade")`)).toContain('data-reach="watch">Watch a Polymarket wallet by its address instead</button>');
    expect(p.run(`reachNoteHtml({ state: "ok" }, "kalshi")`)).toBe("");
  });

  it("offers Hyperliquid as Polymarket is offered: its tile is the API-wallet connection (a key file that never withdraws), and the account read by its address is Hyperliquid · by address", () => {
    const p = page(() => ({}));
    const options = [...account().connectLive.options, { kind: "hyperliquid-trade", connector: "live:hyperliquid-trade", needs: "key-file", label: "Hyperliquid · trading, with an API wallet that cannot withdraw", venues: ["hyperliquid"] }, { kind: "hyperliquid", connector: "live:hyperliquid", needs: "address", label: "Hyperliquid · by the account's address", venues: ["hyperliquid"] }];
    p.set("A", account({ connectLive: { ...account().connectLive, options } }));
    const cat = p.run<string>("catalog(true)");
    expect(cat).toContain('<button type="button" class="tile" data-kind="hyperliquid-trade" data-extra=""><b>Hyperliquid</b><span>API key</span></button>');
    expect(cat).toContain('<button type="button" class="tile" data-kind="hyperliquid" data-extra=""><b>Hyperliquid · by address</b><span>Address</span></button>');
    // neither is offered again under More
    expect([cat.match(/data-kind="hyperliquid-trade"/g), cat.match(/data-kind="hyperliquid"/g)].map((m) => m?.length)).toEqual([1, 1]);
    // the API-wallet connection asks its venue's rule first (live/reach.ts); the one by address asks nothing
    expect(p.run("[tileConnector('hyperliquid-trade', ''), tileConnector('hyperliquid', '')]")).toEqual(["live:hyperliquid-trade", "live:hyperliquid"]);
    p.run(`REACH.set("live:hyperliquid-trade", { connector: "live:hyperliquid-trade", state: "location", said: "Hyperliquid does not serve this location: its Terms of Use (§1.6) …", at: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run<string>("catalog(true)")).toContain('data-kind="hyperliquid-trade" data-extra="" title="Hyperliquid does not serve this location: its Terms of Use (§1.6) …"><b>Hyperliquid</b><span><em class="off">Not served here</em></span>');
    // its form's note offers to watch the account by its address instead
    expect(p.run<string>(`reachNoteHtml(REACH.get("live:hyperliquid-trade"), "hyperliquid-trade")`)).toContain('data-reach="watch">Watch a Hyperliquid account by its address instead</button>');
    // the key file: where an API wallet is made, what to do there in Hyperliquid's words, and its two fields
    expect(p.run("API_PAGES['hyperliquid-trade']")).toBe("https://app.hyperliquid.xyz/API");
    const how = p.run<string>("keyHow('hyperliquid-trade')");
    for (const w of ["More → API", "Generate", "Authorize API Wallet", "180 days", "can never withdraw", '"walletAddress"', '"privateKey"', "§1.6"]) expect(how).toContain(w);
    expect(p.run("FIELDS['hyperliquid-trade']")).toEqual(["walletAddress", "privateKey"]);
    expect(p.run("keyHowFor({ id: 'hyperliquid-trade', connector: 'live:hyperliquid-trade' })")).toBe(how);
  });

  it("offers Polymarket US as an account of its own under Markets and tokens — a key file of its Key ID and Secret Key, made at polymarket.us/developer — asked its own first question, and never under More", () => {
    const p = page(() => ({}));
    const options = [...account().connectLive.options, { kind: "polymarket-us", connector: "live:polymarket-us", needs: "key-file", label: "Polymarket US · prediction-market account, API key", venues: [] }];
    p.set("A", account({ connectLive: { ...account().connectLive, options } }));
    const cat = p.run<string>("catalog(true)");
    expect(cat).toContain('<button type="button" class="tile" data-kind="polymarket-us" data-extra=""><b>Polymarket US</b><span>API key</span></button>');
    expect(cat.match(/data-kind="polymarket-us"/g)?.length).toBe(1);
    // its group: the tile sits between Kalshi's and Polymarket's
    expect(cat.indexOf('data-kind="kalshi"') < cat.indexOf('data-kind="polymarket-us"') && cat.indexOf('data-kind="polymarket-us"') < cat.indexOf('data-kind="polymarket-trade"')).toBe(true);
    expect(p.run("tileConnector('polymarket-us', '')")).toBe("live:polymarket-us");
    p.run(`REACH.set("live:polymarket-us", { connector: "live:polymarket-us", state: "location", said: "Polymarket US does not serve this location: that is its own rule, and the account does not look for a way around it", at: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run<string>("catalog(true)")).toContain('data-kind="polymarket-us" data-extra="" title="Polymarket US does not serve this location: that is its own rule, and the account does not look for a way around it"><b>Polymarket US</b><span><em class="off">Not served here</em></span>');
    expect(p.run("API_PAGES['polymarket-us']")).toBe("https://polymarket.us/developer");
    const how = p.run<string>("keyHow('polymarket-us')");
    for (const w of ["Verify your identity", "same method", "Apple, Google or email", '"keyId"', '"secretKey"', "shown only once", "moves no money"]) expect(how).toContain(w);
    expect(p.run("FIELDS['polymarket-us']")).toEqual(["keyId", "secretKey"]);
    expect(p.run("keyHowFor({ id: 'polymarket-us', connector: 'live:polymarket-us' })")).toBe(how);
  });

  it("shows in the drawer what the agents are doing in a market: their cards (Review → Portfolio), open orders and the owner's intents", () => {
    const p = page(() => ({}));
    p.set(
      "A",
      account({
        cards: [{ id: "card-1", agent: "0xa", agentName: "Claude Code", reason: "Claude Code asks to buy 0.01 BTC", shown: [{ name: "symbol", value: "BTC/USDT" }] }, { id: "card-2", agent: "0xa", agentName: "Claude Code", reason: "ETH", shown: [{ name: "symbol", value: "ETH/USDT" }] }],
        orders: [{ id: "ord-1", agent: "0xa", status: "open", symbol: "BTC/USDT", base: "BTC", side: "buy", qty: 0.01, type: "limit", limitPrice: 60000, venueName: "Exchange X" }, { id: "ord-2", status: "open", symbol: "BTC/USDT", base: "BTC", side: "buy", qty: 1, type: "market", venueName: "Exchange X" }],
        intents: [{ id: "intent-1", agent: "*", agentName: "every agent", symbol: "BTC/USDT", text: "Tell me if BTC moves <5%>", validUntil: "2026-10-13T00:00:00.000Z" }],
        keys: [{ address: "0xa", name: "Claude Code" }],
      }),
    );
    p.set("ITEM", btc);
    const on = p.run<{ orders: Array<{ id: string }>; cards: Array<{ id: string }>; intents: Array<{ id: string }> }>("mkAgentsOn(ITEM)");
    expect([on.cards.map((c) => c.id), on.orders.map((o) => o.id), on.intents.map((x) => x.id)]).toEqual([["card-1"], ["ord-1"], ["intent-1"]]);
    const html = p.run<string>("mkAgentsHtml(ITEM)");
    expect(html).toContain("Claude Code asks: Claude Code asks to buy 0.01 BTC");
    expect(html).toContain('Waiting for you · <button type="button" class="link" data-act="review" data-card="card-1" data-fk="review:card-1">Review</button>');
    expect(html).toContain("Claude Code: buy 0.01 BTC · limit 60,000");
    expect(html).toContain("You to every agent: “Tell me if BTC moves &lt;5%&gt;”");
    expect(p.run("[mkAssetKey(ITEM), mkAssetKey({ kind: 'perp', base: 'eth', at: [] }), mkAssetKey({ kind: 'event', at: [{ connected: false, symbol: 'x' }] })]")).toEqual(["crypto:BTC", "crypto:ETH", ""]);
    // Review closes the drawer and lands on that card under Portfolio
    p.run('var GONE = []; var CLOSED = 0; go = (tab, params) => GONE.push([tab, params]); closeDrawer = () => { CLOSED++; }; MKT.open = { item: ITEM, interval: "1h", ipo: [] }');
    p.run(`mkDrawerClick(${press({ act: "review", card: "card-1" })})`);
    expect(p.run("[GONE, CLOSED]")).toEqual([[["portfolio", { card: "card-1" }]], 1]);
  });

  it("counts down only its own countdowns: another pane's Close button that carries data-close keeps its word", () => {
    const p = page(() => ({}));
    p.set("A", account());
    // a document of two elements, matched by class and attribute as a browser would
    type El = { className: string; attrs: Record<string, string>; dataset: Record<string, string>; textContent: string; hasAttribute(n: string): boolean; setAttribute(n: string, v: string): void };
    const el = (className: string, attrs: Record<string, string>, textContent: string): El => ({ className, attrs, dataset: { close: attrs["data-close"] ?? "" }, textContent, hasAttribute: (n) => n in attrs, setAttribute: (n, v) => void (attrs[n] = v) });
    const btn = el("btn btn-sm", { "data-close": "BTC/USDT:USDT", "data-venue": "ex" }, "Close");
    const cd = el("mk-close", { "data-close": new Date(NOW + 90_000).toISOString() }, "");
    const g = p.run<{ document: { querySelectorAll: (sel: string) => El[] } }>("globalThis");
    g.document.querySelectorAll = (sel) => [btn, cd].filter((e) => [...sel.matchAll(/\.([\w-]+)|\[([\w-]+)\]/g)].every((m) => (m[1] ? e.className.split(" ").includes(m[1]) : m[2]! in e.attrs)));
    p.run("mkTick()");
    expect(btn.textContent).toBe("Close");
    expect(cd.textContent).toBe(p.run("mkLeft(90_000)"));
    expect(cd.textContent).not.toBe("Closed");
    // a table row whose countdown is in its hover card carries only its close (data-ends): its words are never written, and the moment it
    // closes the list is read again, as its countdown would have sent it
    const row = { className: "mk-t", attrs: { "data-ends": new Date(NOW - 1000).toISOString() } as Record<string, string>, dataset: { ends: new Date(NOW - 1000).toISOString() }, textContent: "Bitcoin up or down", hasAttribute(n: string) { return n in this.attrs; }, setAttribute(n: string, v: string) { this.attrs[n] = v; } };
    g.document.querySelectorAll = (sel) => [btn, cd, row as unknown as El].filter((e) => [...sel.matchAll(/\.([\w-]+)|\[([\w-]+)\]/g)].every((m) => (m[1] ? e.className.split(" ").includes(m[1]) : m[2]! in e.attrs)));
    p.run(`MKT.got.set("/api/account/explore", { at: ${NOW} }); MKT.closes = null; mkTick()`);
    expect(row.textContent).toBe("Bitcoin up or down");
    expect("data-closed" in row.attrs).toBe(true);
    expect(p.run('MKT.got.get("/api/account/explore").at')).toBe(0);
  });

  it("prices another pane's rows too: the Trade picker's data-pairs are polled while Trade is shown, and the poll stops only when no pane and no drawer needs it", async () => {
    const p = page(() => ({}));
    p.set("A", account());
    expect(p.run("typeof mkWatchPane")).toBe("function");
    const g = p.run<{ document: { getElementById: (id: string) => unknown } }>("globalThis");
    const was = g.document.getElementById;
    g.document.getElementById = (id) => (id === "pane-trade" ? { querySelectorAll: () => [{ dataset: { pairs: "ex|BTC/USDT" }, isConnected: true }] } : was(id));
    p.run('ROUTE.tab = "trade"; var ASKED = []; api = (path) => { ASKED.push(path); return Promise.resolve({ ok: true, quotes: [] }); }');
    await p.run("mkPoll()");
    expect(p.run("ASKED")).toEqual(["/api/account/quotes?pairs=ex%7CBTC%2FUSDT"]);
    // off Trade, that pane's rows are not asked for
    p.run('ROUTE.tab = "portfolio"; ASKED.length = 0');
    await p.run("mkPoll()");
    expect(p.run("ASKED")).toEqual([]);
    // the route: Markets and Trade keep the clocks; anywhere else with no drawer open stops them
    p.run("MKT.tick = 7; MKT.poll = 8; for (const fn of ROUTED) fn('trade', {}, true)");
    expect(p.run("[MKT.tick, MKT.poll]")).toEqual([7, 8]);
    p.run("for (const fn of ROUTED) fn('portfolio', {}, true)");
    expect(p.run("[MKT.tick, MKT.poll]")).toEqual([0, 0]);
  });

  it("sells from the drawer what the row is: a coin from what is held (never a short at a perpetual in the same coin), a perpetual only from its position", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const perp = { key: "perp:BTC", kind: "perp", name: "BTC perpetual", base: "BTC", at: [{ venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT:USDT", connected: true, canTrade: true, public: false, open: true }] };
    const asset = { ok: true, key: "crypto:BTC", row: { key: "crypto:BTC", venues: [{ venue: "ex", venueName: "Exchange X", amount: 0.5, usd: 31000 }] }, positions: [{ venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT:USDT", kind: "perp", side: "long", qty: 0.01 }] };
    p.set("O", { item: btc, asset });
    expect(p.run("mkSellAt(O)")).toEqual({ venue: "ex", symbol: "BTC/USDT", venueName: "Exchange X" });
    p.set("O", { item: perp, asset });
    expect(p.run("mkSellAt(O)")).toEqual({ venue: "ex", symbol: "BTC/USDT:USDT", venueName: "Exchange X" });
    // a perpetual with no position: nothing to sell — the coin held at the same venue is not sold short there
    p.set("O", { item: perp, asset: { ...asset, positions: [] } });
    expect(p.run("mkSellAt(O)")).toBeNull();
    // a coin with only a perpetual position open: nothing held to sell
    p.set("O", { item: btc, asset: { ...asset, row: undefined } });
    expect(p.run("mkSellAt(O)")).toBeNull();
  });

  it("leaves nothing of the Venues board, the Now sections or the old Asset drawer behind", () => {
    const p = page(() => ({}));
    expect(p.run("['mkVenuesHtml', 'mkHealth', 'mkTrades', 'mkAgentsSwitch', 'mkUnplug', 'mkRekey', 'mkNowHtml', 'mkChip', 'mkOnePerBase', 'assetCandles', 'assetTargets', 'assetPx', 'assetDraw', 'assetRead', 'ASSET'].map((n) => typeof globalThis[n])")).toEqual(Array(15).fill("undefined"));
    for (const name of ["openAsset", "openMarket", "mkFindByKey", "mkLookup", "mkValuation", "mkIssuer", "mkWatchPane", "assetTitle", "assetItemOf"]) expect(p.run(`typeof ${name}`), name).toBe("function");
  });
});

describe("the one drawer", () => {
  const nvda = {
    key: "rwa:NVDA",
    kind: "rwa",
    name: "NVIDIA · Ondo Stock on Ethereum",
    base: "NVDA",
    price: 181.2,
    tabs: ["rwas"],
    issuer: "Ondo Global Markets",
    eligibility: "Ondo Global Markets: “not available to US persons, or to anyone in a sanctioned or prohibited jurisdiction” — the issuer's own words, which run long",
    at: [{ venue: "wallet", venueName: "Wallet", symbol: "NVDAon/USDC@Ethereum", connected: true, canTrade: true, public: false, price: 181.2, open: true }],
  };
  const ousg = {
    key: "rwa:OUSG",
    kind: "rwa",
    name: "OUSG",
    base: "OUSG",
    tabs: ["rwas"],
    at: [{ venue: "wallet", venueName: "Wallet", symbol: "OUSG/USDC@Ethereum", connected: true, canTrade: false, public: false, open: false, issuer: "Ondo Finance", eligibility: "OUSG moves only between wallets Ondo has approved", note: "OUSG moves only between wallets Ondo has approved" }],
  };
  const withWallet = () => account({ venues: [...account().venues, venue("wallet", "Wallet", { trade: { can: true, what: "tokens", kinds: ["token"] }, address: "0x1111111111111111111111111111111111111111", proven: "MetaMask" })] });
  /* what the account holds of BTC: the row, a perpetual position, an agent's resting order, a statement line, the cost of the row and of
     the position (said once) */
  const assetBtc = {
    ok: true,
    key: "crypto:BTC",
    row: { key: "crypto:BTC", asset: "BTC", class: "crypto", amount: 0.5, usd: 31000, price: 62000, changePct24h: 2.1, venues: [{ venue: "ex", venueName: "Exchange X", amount: 0.5, usd: 31000 }] },
    positions: [{ venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT:USDT", name: "BTC perpetual", kind: "perp", side: "long", qty: 0.01, usd: 620, unrealizedUsd: 12, entryPrice: 60000, markPrice: 62000, leverage: 5 }],
    orders: [{ id: "ord-1", venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT", base: "BTC", side: "buy", qty: 0.01, filledQty: 0, type: "limit", limitPrice: 60000, status: "open", agent: "0xa", authority: "agent" }],
    lines: [{ key: "l1", description: "Bought 0.01 BTC", accountName: "Exchange X", status: "filled", at: "2026-10-05T12:00:00.000Z" }],
    cost: [
      { key: "crypto:BTC", asset: "BTC", class: "crypto", coveredQty: 0.4, ofQty: 0.5, avgCostUsd: 58000, unrealizedUsd: 1600, realizedUsd: 0, source: "account orders", words: "cost known for 0.4 of 0.5 BTC" },
      { key: "position:ex:BTC/USDT:USDT", asset: "BTC", class: "position", coveredQty: 0.01, ofQty: 0.01, realizedUsd: 0, source: "venue", words: "cost known for 0.01 of 0.01 BTC" },
    ],
    missing: [],
  };
  const assetUsdc = { ok: true, key: "stable:USDC", row: { key: "stable:USDC", asset: "USDC", class: "stable", amount: 120, usd: 120, price: 1, venues: [{ venue: "ex", venueName: "Exchange X", amount: 120, usd: 120 }] }, positions: [], orders: [], lines: [], cost: [], missing: [] };

  it("hands a market to an agent with its venue's name (not its id, when only public prices list it) and the row's kind", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    p.run("var HANDED = []; globalThis.openHandToAgent = (x) => HANDED.push(x)");
    p.run("mkHand(ITEMS.doge); mkHand(ITEMS.btc); mkHand(ITEMS.fed)");
    const handed = p.run<Array<Record<string, string>>>("HANDED");
    // what the composer reads: where, which market, which way, the kind for its tag (the row's own key and base are not its business).
    // The kind is new here: the Trade pane is organised by kind now, so every hand-off names one
    expect(handed[0]).toEqual({ venue: "okx", symbol: "DOGE/USDT", venueName: "OKX", side: "buy", kind: "crypto" });
    expect(handed[1]).toMatchObject({ venue: "ex", symbol: "BTC/USDT", venueName: "Exchange X", kind: "crypto" });
    expect(handed[2]).toMatchObject({ venue: "kalshi", symbol: "KXFED-DEC:YES", kind: "predictions" });
  });

  it("draws any market's price history from the candles read — connected or public — with where it comes from as the picture's title, and says quietly in the venue's words when it keeps none", () => {
    const p = page(() => new Promise(() => {}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    // where the history is asked: the connected venue first, else the public listing; an event's first outcome
    expect(p.run("JSON.stringify([mkCandleLeg(ITEMS.btc), mkCandleLeg(ITEMS.doge), mkCandleLeg(ITEMS.fed)])")).toBe(JSON.stringify([{ venue: "ex", symbol: "BTC/USDT", venueName: "Exchange X" }, { venue: "okx-public", symbol: "DOGE/USDT", venueName: "OKX" }, { venue: "kalshi", symbol: "KXFED-DEC:YES", venueName: "Kalshi" }]));
    p.run('var ASKED = []; api = (path) => { ASKED.push(path); return new Promise(() => {}); }; MKT.open = { item: ITEMS.doge, interval: "5m", asset: undefined, assetFor: "", compare: undefined, candles: undefined, ipo: [] }; mkDrawerLoad(MKT.open)');
    // a drawer on a bar size alone asks the range that size is drawn over (5m: a day)
    expect(p.run<string[]>("ASKED")[0]).toBe("/api/account/candles?venue=okx-public&symbol=DOGE%2FUSDT&interval=5m&range=1D");
    const bars = Array.from({ length: 12 }, (_, i) => ({ t: NOW - (12 - i) * 300_000, o: 0.12, h: 0.125, l: 0.118, c: 0.12 + i / 1000 }));
    const chart = (candles: unknown, asset?: unknown) => p.run<string>(`mkChartHtml({ interval: "5m", candles: ${JSON.stringify(candles)}, asset: ${asset === undefined ? "undefined" : JSON.stringify(asset)} }, ITEMS.doge, mkCandleLeg(ITEMS.doge), "crypto:DOGE")`);
    // asked and not back yet: a skeleton; back: the line, where it came from in its title (no caption under it)
    expect(chart(null)).toContain("skel");
    const drawn = chart({ ok: true, venue: "okx-public", venueName: "OKX", symbol: "DOGE/USDT", interval: "5m", candles: bars, public: true });
    expect(drawn).toContain('class="spark mk-chart"');
    expect(drawn).toContain("<title>At OKX · DOGE/USDT</title>");
    expect(drawn).not.toContain('<p class="dim small">At OKX');
    expect(drawn).toContain("Price at OKX, 5m bars");
    // a series given whole, or its bars at the top of the answer, read the same
    expect(chart({ ok: true, candles: { venue: "okx-public", venueName: "OKX", symbol: "DOGE/USDT", interval: "5m", bars } })).toContain('class="spark mk-chart"');
    expect(chart({ ok: true, venue: "okx-public", venueName: "OKX", symbol: "DOGE/USDT", interval: "5m", bars })).toContain('class="spark mk-chart"');
    // the venue refuses: one quiet line in its words
    expect(chart({ ok: false, refusal: { code: "E_VENUE_RAIL_CLOSED", message: "OKX publishes no price history" } })).toBe('<p class="mk-quiet">OKX publishes no price history.</p>');
    expect(chart({ ok: false, refusal: { code: "E_VENUE_TIMEOUT", message: "no answer in 4 s" } })).toBe('<p class="mk-quiet">No price history from OKX: no answer in 4 s.</p>');
    expect(chart({ ok: true, venue: "okx-public", venueName: "OKX", symbol: "DOGE/USDT", interval: "5m", candles: [] })).toBe('<p class="mk-quiet">OKX has no 5m bars for it yet.</p>');
    // an account without the candles read: the Asset read's history, as before
    const assetBars = { ok: true, candles: { venue: "ex", venueName: "Exchange X", symbol: "DOGE/USDT", interval: "5m", bars }, missing: [] };
    expect(chart({ ok: false, error: "404 Not Found" }, assetBars)).toContain("<title>At Exchange X · DOGE/USDT</title>");
    expect(chart({ ok: false, error: "404 Not Found" })).toContain("skel");
  });

  it("offers the price history by range (feat/paper-live phase H) — each asked in its own bar size, the asset read too — breaks the line where the venue has no bars, never bridging them (a share's closed days are no gap), and says under it whose bars they are and what they are", () => {
    const p = page(() => new Promise(() => {}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    p.run('var ASKED = []; api = (path) => { ASKED.push(path); return new Promise(() => {}); }; MKT.open = { item: ITEMS.doge, range: "1M", interval: "1h", asset: undefined, assetFor: "", compare: undefined, candles: undefined, ipo: [] }');
    // the nine ranges over the price, 1M pressed
    const html = p.run<string>("mkDrawerHtml(MKT.open)");
    for (const r of ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"]) expect(html).toContain(`data-act="range" data-v="${r}"`);
    expect(html).toContain('data-v="1M" data-fk="range:1M" aria-pressed="true"');
    expect(html).toContain('class="seg mk-rseg"');
    // 5Y pressed: its own bar size, a week — the candles read and the asset read asked in it
    p.run("mkDrawerLoad = (o) => ASKED.push(`load:${o.range}:${o.interval}`); mkDrawerRedraw = () => {}");
    p.run('mkDrawerClick({ target: { closest: () => ({ dataset: { act: "range", v: "5Y" } }) } })');
    expect(p.run("MKT.open.range")).toBe("5Y");
    expect(p.run("MKT.open.interval")).toBe("1w");
    expect(p.run<string[]>("ASKED")).toContain("load:5Y:1w");
    // a round-the-clock market's 5-minute line breaks where an hour has no bars, and nowhere else: two runs, each its own area
    const T0 = Date.UTC(2026, 9, 14, 12);
    const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ t: from + i * 300_000, o: 1, h: 1, l: 1, c: 1 + i / 100 }));
    const two = [...run(T0, 6), ...run(T0 + 2 * 3_600_000, 6)];
    const svg = p.run<string>(`mkChart(${JSON.stringify({ venueName: "OKX", symbol: "DOGE/USDT", interval: "5m", bars: two, source: "OKX · DOGE-USDT" })}, false, false)`);
    const line = /<path class="line" d="([^"]+)"/.exec(svg)![1]!;
    expect(line.match(/M/g)!.length).toBe(2);
    expect(/<path class="area" d="([^"]+)"/.exec(svg)![1]!.match(/Z/g)!.length).toBe(2);
    expect(svg).toContain('<p class="mk-src">OKX · DOGE-USDT</p>');
    // a share's daily line runs on over a weekend (closed days are not missing bars); a coin's daily line breaks over two missing days
    const days = [Date.UTC(2026, 9, 9, 13, 30), Date.UTC(2026, 9, 12, 13, 30), Date.UTC(2026, 9, 13, 13, 30)].map((t, i) => ({ t, o: 1, h: 1, l: 1, c: 1 + i }));
    // the source's own words for a stretch with none break even a share's daily line
    const said = p.run<string>(`mkChart(${JSON.stringify({ venueName: "Nasdaq", symbol: "AAPL", interval: "1d", bars: days, gaps: [{ from: Date.UTC(2026, 9, 10), to: Date.UTC(2026, 9, 12, 13, 30), why: "No data from source" }] })}, false, true)`);
    expect(/<path class="line" d="([^"]+)"/.exec(said)![1]!.match(/M/g)!.length).toBe(2);
    const daily = (sessions: boolean) => /<path class="line" d="([^"]+)"/.exec(p.run<string>(`mkChart(${JSON.stringify({ venueName: "X", symbol: "S", interval: "1d", bars: days, adjustment: "split-adjusted, not dividend-adjusted", session: "regular-session daily bars" })}, false, ${sessions})`))![1]!.match(/M/g)!.length;
    expect(daily(true)).toBe(1);
    expect(daily(false)).toBe(2);
    // daily bars: the line's first and last dates with their year, no time of day
    expect(p.run<string>(`mkChart(${JSON.stringify({ venueName: "X", symbol: "S", interval: "1d", bars: days })}, false, true)`)).toContain("<span>9 Oct 2026</span>");
    expect(p.run<string>(`mkChart(${JSON.stringify({ venueName: "X", symbol: "S", interval: "1d", bars: days, source: "Cboe · AAPL", adjustment: "split-adjusted, not dividend-adjusted", session: "regular-session daily bars" })}, false, true)`)).toContain('<p class="mk-src">Cboe · AAPL · split-adjusted, not dividend-adjusted · regular-session daily bars</p>');
  });

  it("asks the asset read over the range pressed, as the candles read (its line is drawn where the venue gives no candles), waits for the price history as the chart does, and never draws a slower range's answer under the next range's button", async () => {
    const p = page(() => new Promise(() => {}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge, fed });
    // every read the drawer asks, answered when the test says
    p.run("var ASKED = []; var LATER = {}; api = (path, o) => { ASKED.push([path, o && o.timeout]); return new Promise((r) => (LATER[path] = r)); }; mkDrawerRedraw = () => {}");
    p.run('MKT.open = { item: ITEMS.doge, range: "MAX", interval: "1w", asset: undefined, assetFor: "", compare: undefined, candles: undefined, ipo: [] }; mkDrawerLoad(MKT.open)');
    const asked = () => p.run<Array<[string, number | undefined]>>("ASKED");
    const maxCandles = "/api/account/candles?venue=okx-public&symbol=DOGE%2FUSDT&interval=1w&range=MAX";
    const maxAsset = "/api/account/asset?key=crypto%3ADOGE&interval=1w&range=MAX";
    expect(asked().map(([x]) => x)).toEqual(expect.arrayContaining([maxCandles, maxAsset]));
    // the price history waited for as long as the chart waits for its first view
    expect(asked().find(([x]) => x === maxCandles)![1]).toBe(p.run<number>("HISTORY_TIMEOUT_MS"));
    // 5Y pressed (a week's bars too): both reads asked again, over 5Y
    p.run('mkDrawerClick({ target: { closest: () => ({ dataset: { act: "range", v: "5Y" } }) } })');
    const fiveCandles = "/api/account/candles?venue=okx-public&symbol=DOGE%2FUSDT&interval=1w&range=5Y";
    const fiveAsset = "/api/account/asset?key=crypto%3ADOGE&interval=1w&range=5Y";
    expect(asked().map(([x]) => x)).toEqual(expect.arrayContaining([fiveCandles, fiveAsset]));
    // 5Y's answers land first, then MAX's (Nasdaq's whole history is slow): the drawer keeps 5Y's
    const answer = (path: string, range: string) => p.run(`LATER[${JSON.stringify(path)}](${JSON.stringify({ ok: true, range, candles: [] })})`);
    answer(fiveCandles, "5Y");
    answer(fiveAsset, "5Y");
    await settle();
    answer(maxCandles, "MAX");
    answer(maxAsset, "MAX");
    await settle();
    expect(p.run("MKT.open.candles.range")).toBe("5Y");
    expect(p.run("MKT.open.asset.range")).toBe("5Y");
  });

  it("dates a day's bars and longer by the day each stands for: a coin's Universal day (its bars start at 00:00 UTC, the evening before in New York), a share's New York day", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const line = (bars: unknown, interval: string, sessions: boolean) => p.run<string>(`mkChart(${JSON.stringify({ venueName: "X", symbol: "S", interval, bars })}, false, ${sessions})`);
    // a coin's daily bars of 16 and 17 Oct 2025, and its weeks from Monday 6 and Monday 13 Oct 2025
    const days = [Date.UTC(2025, 9, 16), Date.UTC(2025, 9, 17)].map((t, i) => ({ t, o: 1, h: 1, l: 1, c: 1 + i }));
    const weeks = [Date.UTC(2025, 9, 6), Date.UTC(2025, 9, 13)].map((t, i) => ({ t, o: 1, h: 1, l: 1, c: 1 + i }));
    expect(line(days, "1d", false)).toContain("<span>16 Oct 2025</span>");
    expect(line(days, "1d", false)).toContain("<span>17 Oct 2025</span>");
    expect(line(weeks, "1w", false)).toContain("<span>13 Oct 2025</span>");
    expect(line(weeks, "1w", false)).not.toContain("12 Oct 2025");
    // a share's daily bars at New York's open (13:30 Universal) and at New York's midnight (04:00 Universal in summer): New York's day
    const share = [Date.UTC(2025, 9, 16, 13, 30), Date.UTC(2025, 9, 17, 4)].map((t, i) => ({ t, o: 1, h: 1, l: 1, c: 1 + i }));
    expect(line(share, "1d", true)).toContain("<span>16 Oct 2025</span>");
    expect(line(share, "1d", true)).toContain("<span>17 Oct 2025</span>");
  });

  it("says a market's 24 hours once, its facts without it, and no second key offered (connections live under Portfolio)", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, fed });
    const html = p.run<string>('mkDrawerHtml({ item: ITEMS.btc, interval: "1h", ipo: [] })');
    expect(html.match(/<span class="sr">up<\/span> 2.1%/g)).toHaveLength(1);
    expect(html).not.toContain("<dt>24h</dt>");
    expect(html).toContain("<dt>Bid</dt>");
    expect(html).toContain("<dt>Volume 24h</dt><dd>$1.9B</dd>");
    expect(html).not.toContain('data-act="rekey"');
    // the parts, each in its own element, in the brief's order
    expect([...html.matchAll(/data-sec="([a-z]+)"/g)].map((m) => m[1])).toEqual(["head", "chart", "alerts", "across", "company", "financials", "ipo", "held", "agents", "lines"]);
    // the Price head opens the Trade page's own chart of it, at the account its history is read from (yours), the drawer closing on the way
    expect(html).toContain('<span class="mk-sec-t"><h2 class="h2">Price</h2><a class="link mk-open-trade" href="#/trade?kind=crypto&amp;venue=ex&amp;symbol=BTC%2FUSDT" data-drawer-close>Open in Trade →</a></span>');
    expect(html.indexOf('aria-label="Across venues"')).toBeLessThan(html.indexOf('aria-label="You hold"'));
    expect(html.indexOf('aria-label="You hold"')).toBeLessThan(html.indexOf('aria-label="Agents on it"'));
    expect(html.indexOf('aria-label="Agents on it"')).toBeLessThan(html.indexOf('aria-label="On the statement"'));
    // an event: cents, its outcome's name, the change in cents, once
    const ev = p.run<string>('mkDrawerHtml({ item: ITEMS.fed, interval: "1h", ipo: [] })');
    expect(ev).toMatch(/<a class="link mk-open-trade" href="#\/trade\?kind=predictions&amp;venue=[a-z-]+&amp;symbol=[^"]+" data-drawer-close>Open in Trade →<\/a>/);
    expect(ev).toContain('<span class="num-m" data-q="kalshi|KXFED-DEC:YES" data-fmt="c-last">62¢</span><span class="dim">Yes</span>');
    expect(ev).toContain("<dt>Closes</dt>");
  });

  it("says a tokenised asset's issuer and whom it is for: all of it in its hover card and in the drawer, none on its row; a restricted one in the issuer's words, never a dead button", () => {
    const p = page(() => ({}));
    p.set("A", withWallet());
    p.set("ITEMS", { nvda, ousg });
    const rows = p.run<string>("MKT.reg = []; mkTable([ITEMS.nvda, ITEMS.ousg], '')");
    // the row is its name, one line: the issuer's words are its hover card's, whole (a screen reader hears them from the row)
    expect(rows).not.toContain("mk-iss");
    expect(rows).toContain('<b>NVIDIA · Ondo Stock on Ethereum</b><span class="sr">. NVDA · Issued by Ondo Global Markets · Ondo Global Markets: “not available to US persons');
    expect(p.run<string>("mkPeekHtml(ITEMS.nvda)")).toContain("<span class=\"mk-peek-i\">Issued by Ondo Global Markets · Ondo Global Markets: “not available to US persons, or to anyone in a sanctioned or prohibited jurisdiction” — the issuer&#39;s own words, which run long</span>");
    // the issuer and its words carried on a listing read the same
    expect(p.run<string>("mkPeekHtml(ITEMS.ousg)")).toContain('<span class="mk-peek-i">Issued by Ondo Finance · OUSG moves only between wallets Ondo has approved</span>');
    // NVDA trades at the wallet; OUSG does not: its button opens the drawer, whose callout gives the issuer's rule
    expect(rows).toContain('data-act="trade" data-i="0"');
    expect(rows).toContain('data-act="open" data-i="1" data-fk="why:rwa:OUSG" title="Wallet: OUSG moves only between wallets Ondo has approved."');
    const drawer = p.run<string>('mkDrawerHtml({ item: ITEMS.ousg, interval: "1h", asset: undefined, compare: undefined, candles: undefined, ipo: [] })');
    expect(drawer).toContain('<div class="box mk-iss-box"><div class="label">Issuer</div><b>Ondo Finance</b><p class="small">OUSG moves only between wallets Ondo has approved</p></div>');
    expect(drawer).toContain("<div class=\"label\">Can't trade it here</div><p>Wallet: OUSG moves only between wallets Ondo has approved.</p>");
    expect(drawer).not.toContain('data-act="trade"');
    // anything else has no issuer line
    p.set("ITEMS", { btc });
    expect(p.run("mkIssuer(ITEMS.btc)")).toBeNull();
  });

  it("draws a pre-IPO contract by the valuation its price implies — in the row, in the drawer once, and venue by venue in each venue's own unit — only under All and Pre-IPO, with the IPO markets about the company", () => {
    const p = page(() => ({}));
    p.set("A", kalshiTrades());
    p.set("ITEMS", { anth, ipoEvent, btcPerp });
    expect(p.run("[mkIsPreipo(ITEMS.anth), mkIsPreipo(ITEMS.btcPerp), mkIsPreipo({ kind: 'perp', category: 'Pre-IPO' })]")).toEqual([true, false, true]);
    expect(p.run("mkImplied(ITEMS.anth)")).toEqual({ usd: 2.08e12, unit: "$1 of contract price stands for $1B of valuation", perPoint: 1e9 });
    // the valuation from the price and the venue's dollars a point, when the venue did not say it outright
    expect(p.run("mkImplied({ price: 208, implied: { perPoint: 1e10, unit: 'u' } }).usd")).toBe(2.08e12);
    // the row: the valuation is the figure, tagged implied; the contract price under it, ticking from the connected venue
    const rows = p.run<string>("MKT.reg = []; mkTable([ITEMS.anth], '')");
    expect(rows).toContain('<span class="mk-implied"><b>$2.08T</b> <span class="tag">implied</span></span><span class="dim small mk-contract" data-q="ex|ANTHROPIC/USDT:USDT" data-fmt="usd">$208.00</span>');
    expect(rows).toContain("Pre-IPO · Perpetual");
    expect(rows).toContain('data-act="trade" data-i="0" data-fk="trade:perp:ANTHROPIC"');
    // without the valuation it is an ordinary perpetual row
    const plain = p.run<string>("MKT.reg = []; mkTable([{ ...ITEMS.anth, implied: undefined, category: undefined }], '')");
    expect(plain).not.toContain("implied");
    expect(plain).toContain("$208.00");
    // Perps leaves pre-IPO contracts to the Pre-IPO tab
    expect(p.run<string>("MKT.reg = []; mkListHtml({ tab: 'perps', q: '', sort: '' }, { items: [ITEMS.btcPerp, ITEMS.anth] }, lensNow())")).not.toContain("Anthropic");
    expect(p.run<string>("MKT.reg = []; mkListHtml({ tab: 'preipo', q: '', sort: '' }, { items: [ITEMS.anth] }, lensNow())")).toContain("Anthropic pre-IPO");
    // the drawer: the valuation once in the head with the contract price and the unit sentence under it; the issuer's words; Across venues
    // with each venue's own contract price and unit; Trade at the connected venue, no connection offered for OKX (the row trades here)
    const drawer = p.run<string>('mkDrawerHtml({ item: ITEMS.anth, interval: "1h", ipo: [], ipoRead: { items: [ITEMS.ipoEvent] } })');
    expect(drawer.match(/\$2\.08T/g)).toHaveLength(3);
    expect(drawer).toContain('<span class="num-m">$2.08T</span><span class="tag">implied</span>');
    expect(drawer).toContain('<span class="mk-contract"><span data-q="ex|ANTHROPIC/USDT:USDT" data-fmt="usd">$208.00</span> a contract · $1 of contract price stands for $1B of valuation</span>');
    expect(drawer).toContain("Pre-IPO · Anthropic · ANTHROPIC");
    // the company's own words — never as an issuer's: the venue writes the contract, the company says such transfers are void
    expect(drawer).toContain('<div class="box mk-iss-box"><div class="label">What the company says</div><p class="small">Anthropic, 29 June 2026: transfers of its shares without its approval are void</p></div>');
    expect(drawer).not.toContain("Issued by Anthropic");
    expect(drawer).not.toContain('<div class="label">Issuer</div>');
    expect(rows).not.toContain("Issued by");
    // a perpetual's side buttons are the ticket's words: Long and Short
    expect(drawer).toContain('data-fk="d-buy"');
    expect(drawer).toMatch(/data-act="trade" data-fk="d-buy"[^>]*>Long</);
    expect(drawer).toMatch(/data-act="short" data-fk="d-short"[^>]*>Short</);
    expect(drawer).toContain('<span class="why mk-unit">$2.08T implied · OKX: $1 of contract price stands for $10B of valuation (since 30 June 2026)</span>');
    expect(drawer).toContain('<span class="why mk-unit">$2.08T implied · Exchange X: $1 of contract price stands for $1B of valuation</span>');
    expect(drawer).toContain('<th scope="col" class="r">Contract</th>');
    expect(drawer).toContain("$2,080.00");
    expect(drawer).toContain('data-act="trade-at" data-venue="ex" data-symbol="ANTHROPIC/USDT:USDT"');
    expect(drawer).not.toContain("Connect to trade");
    // the IPO markets about the company, as lean cards whose Yes and No open the predictions ticket
    expect(drawer).toContain('<section class="sec" aria-label="IPO markets"><h2 class="h2">IPO markets</h2><div class="cards-grid mk-cards">');
    expect(drawer).toContain("Anthropic IPO before 2027?");
    expect(drawer).toContain('Yes · <span data-q="kalshi|KXIPOANTHROPIC-26:YES" data-fmt="c">32¢</span>');
    expect(drawer).not.toContain("IPOs · Kalshi");
    p.run('var TICKETS = []; globalThis.openTicket = (x) => TICKETS.push(x); MKT.open = { item: ITEMS.anth, interval: "1h", ipo: [], ipoRead: { items: [ITEMS.ipoEvent] } }; mkDrawerHtml(MKT.open)');
    expect(p.run("MKT.open.ipo[0].key")).toBe("kalshi:KXIPOANTHROPIC-26");
    p.run(`mkDrawerClick(${press({ act: "yn", i: "0", o: "0" })})`);
    expect(p.run("TICKETS[0]")).toEqual({ venue: "kalshi", symbol: "KXIPOANTHROPIC-26:YES", side: "buy", outcome: "YES", kind: "predictions", key: "kalshi:KXIPOANTHROPIC-26", name: "Anthropic IPO before 2027?" });
    // nothing about the company yet: said so; the read for it still on its way: a skeleton
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.anth, interval: "1h", ipo: [], ipoRead: { items: [] } })')).toContain("No prediction market about Anthropic's IPO is listed");
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.anth, interval: "1h", ipo: [], ipoRead: null })')).toContain('aria-label="IPO markets"><h2 class="h2">IPO markets</h2><div class="skel-rows"');
    // what the drawer reads for it: its candles, its asset, the IPO markets — never the comparison (each venue's unit is its own)
    p.run('var ASKED = []; api = (path) => { ASKED.push(path); return new Promise(() => {}); }; MKT.open = { item: ITEMS.anth, interval: "1h", asset: undefined, assetFor: "", compare: undefined, candles: undefined, ipoRead: undefined, ipo: [] }; mkDrawerLoad(MKT.open)');
    const asked = p.run<string[]>("ASKED");
    expect(asked).toContain("/api/account/candles?venue=ex&symbol=ANTHROPIC%2FUSDT%3AUSDT&interval=1h&range=1M");
    expect(asked).toContain("/api/account/explore?tab=predictions&q=Anthropic&limit=12");
    expect(asked.some((x) => x.startsWith("/api/account/compare"))).toBe(false);
  });

  it("opens by a holding's key (openAsset): the coin's own row from what Markets read — never its perpetual's — else, for a holding no listing carries, from the asset read alone", async () => {
    const asked: string[] = [];
    const p = page((path) => {
      asked.push(path);
      if (path.startsWith("/api/account/explore")) return { ...explore, items: path.includes("q=USDC") ? [] : [fed, btcPerp, btc, doge] };
      if (path.startsWith("/api/account/asset")) return path.includes("stable%3AUSDC") ? assetUsdc : path.includes("crypto%3ABTC") ? assetBtc : { ok: false, refusal: { message: "the venue said no" } };
      return {};
    });
    p.set("A", account());
    // the drawer stands open once drawn, so the reads that land afterwards redraw it in place (as in a browser)
    const g = p.run<{ document: { getElementById: (id: string) => unknown } }>("globalThis");
    const was = g.document.getElementById;
    const body = { innerHTML: "", querySelectorAll: () => [], contains: () => false, addEventListener() {} };
    const drawer = { open: true, addEventListener() {}, querySelector: () => body, querySelectorAll: () => [], innerHTML: "", dataset: {}, setAttribute() {} };
    g.document.getElementById = (id) => (id === "drawer" ? drawer : was(id));
    p.run("var DRAWN = []; var TOASTS = []; openDrawer = (html, opts) => { DRAWN.push([opts.title, html]); return { addEventListener() {} }; }; toast = (t, k) => TOASTS.push([t, k])");
    // a coin held: its row from Markets, the coin before the perpetual
    await p.run("openAsset('crypto:BTC')");
    expect(asked[0]).toBe("/api/account/explore?q=BTC&limit=200");
    expect(p.run("DRAWN.length")).toBe(1);
    expect(p.run("DRAWN[0][0]")).toBe("Bitcoin");
    expect(p.run("MKT.open.item.key")).toBe("coin:BTC");
    expect(p.run("mkResolve({ key: 'crypto:BTC' }).key")).toBe("coin:BTC");
    expect(p.run("mkResolve({ key: 'perp:BTC' }).key")).toBe("perp:BTC");
    // the drawer's own asset read is on the same key, over the range its chart shows (1M, in hourly bars)
    expect(asked.some((x) => x === "/api/account/asset?key=crypto%3ABTC&interval=1h&range=1M")).toBe(true);
    // a stablecoin held: no listing carries it, so the asset read opens it, at the price the venue last read
    await p.run("openAsset('stable:USDC')");
    expect(p.run("DRAWN.length")).toBe(2);
    expect(p.run("DRAWN[1][0]")).toBe("USDC");
    const html = p.run<string>("DRAWN[1][1]");
    expect(html).toContain("as your venue last read it");
    expect(html).toContain('aria-label="You hold"');
    expect(html).not.toContain('aria-label="Across venues"');
    expect(html).not.toContain("Can't trade it here");
    expect(p.run("[MKT.open.item.heldKey, MKT.open.item.kind, mkAssetKey(MKT.open.item)]")).toEqual(["stable:USDC", "stable", "stable:USDC"]);
    // drawn with the asset read in hand: what is held, where
    const held = p.run<string>(`mkDrawerHtml({ item: assetItemOf("stable:USDC", ${JSON.stringify(assetUsdc)}), interval: "1h", asset: ${JSON.stringify(assetUsdc)}, ipo: [] })`);
    expect(held).toContain("120 USDC · $120.00");
    expect(held).toContain("Exchange X");
    expect(held).toContain("Stablecoin");
    // no dash for a 24 hours its venue did not give, no box of facts it has none of
    expect(held).not.toContain('<span class="flat">—</span>');
    expect(held).not.toContain("<dt>Bid</dt>");
    expect(held).not.toContain('<dl class="mk-facts">');
    // the account refuses the read: its words, no drawer
    await p.run("openAsset('equity:ZZZZ')");
    expect(p.run("DRAWN.length")).toBe(2);
    expect(p.run("TOASTS")).toEqual([["the venue said no", "no"]]);
    expect(p.run("[assetTitle('event:FED:YES', { positions: [{ kind: 'event', name: 'Fed · Yes' }] }), assetTitle('cash:USD', {}), assetTitle('crypto:BTC', { row: { asset: 'BTC' } })]")).toEqual(["Fed · Yes", "Cash · USD", "BTC"]);
  });

  it("shows what is held once each — holdings, positions with Close…, open orders with Cancel, what was paid — and its statement lines; every button goes through the one door", () => {
    const p = page(() => ({}));
    p.set("A", account({ keys: [{ address: "0xa", name: "Claude Code" }] }));
    p.set("ITEM", btc);
    p.set("ASSET", assetBtc);
    p.run("globalThis.openStatement = () => OPENED.push('statement'); var OPENED = []");
    const html = p.run<string>('mkDrawerHtml({ item: ITEM, interval: "1h", asset: ASSET, ipo: [] })');
    expect(html).toContain("0.5 BTC · $31,000.00");
    expect(html).toContain("Long 0.01 · BTC perpetual");
    expect(html).toContain('data-act="close" data-venue="ex" data-symbol="BTC/USDT:USDT" data-fk="close:ex:BTC/USDT:USDT">Close…</button>');
    expect(html).toContain("Buy 0.01 BTC · limit 60,000");
    expect(html).toContain('data-act="cancel" data-order="ord-1" data-venue="ex" data-fk="cancel:ord-1">Cancel</button>');
    expect(html).toContain("Exchange X · Claude Code · 0 of 0.01 filled");
    // what was paid, said once (the position's own cost line is not repeated under it)
    expect(html).toContain('<p class="mk-cost">Paid $58,000.00 on average · <span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> $1,600.00</span> since bought <span class="dim">(cost known for 0.4 of 0.5 BTC, from account orders)</span></p>');
    expect(html.match(/cost known for/g)).toHaveLength(1);
    // the statement lines, and the way to the whole statement
    expect(html).toContain("Bought 0.01 BTC");
    expect(html).toContain('data-act="statement" data-fk="d-statement">Open the Statement →</button>');
    // Sell goes where the coin is held
    expect(html).toContain('data-act="sell" data-venue="ex" data-symbol="BTC/USDT" data-fk="d-sell"');
    // a browser that only looks: no Close…, no Cancel
    p.run('Owner.role = "pending"');
    const looks = p.run<string>('mkDrawerHtml({ item: ITEM, interval: "1h", asset: ASSET, ipo: [] })');
    expect(looks).not.toContain('data-act="close"');
    expect(looks).not.toContain('data-act="cancel"');
    p.run('Owner.role = "owner"');
    // the doors: Close… is the Trade pane's close, Cancel the one signed cancel, the Statement the statement's opener
    p.run('var CLOSED = []; var CANCELED = []; globalThis.openClose = (x) => CLOSED.push(x.symbol); cancelOrder = (o, then) => { CANCELED.push([o.id, typeof then]); return null; }; closeDrawer = () => {}; MKT.open = { item: ITEM, interval: "1h", asset: ASSET, ipo: [] }');
    p.run(`mkDrawerClick(${press({ act: "close", venue: "ex", symbol: "BTC/USDT:USDT" })})`);
    p.run(`mkDrawerClick(${press({ act: "cancel", venue: "ex", order: "ord-1" })})`);
    p.run(`mkDrawerClick(${press({ act: "statement" })})`);
    expect(p.run("[CLOSED, CANCELED, OPENED]")).toEqual([["BTC/USDT:USDT"], [["ord-1", "function"]], ["statement"]]);
    // nothing held of a coin only public prices list: said plainly; nothing on the statement either
    const none = p.run<string>(`mkDrawerHtml({ item: ${JSON.stringify(doge)}, interval: "1h", asset: { ok: true, key: "crypto:DOGE", positions: [], orders: [], lines: [], cost: [], missing: [] }, ipo: [] })`);
    expect(none).toContain("You don’t hold any.");
    expect(none).toContain("Nothing on the statement about it yet.");
  });

  it("asks for the All list once, ahead of the first visit, so Markets comes in drawn instead of a skeleton swapped after its entrance", async () => {
    const explore = { ok: true, items: [], tabs: [{ id: "all", label: "All", count: 0 }], notes: [], missing: [] };
    const p = page(() => explore);
    p.set("A", account());
    p.run("mkPrefetch(); mkPrefetch();");
    await settle();
    p.run("mkPrefetch();");
    // one read of the All list (the very path the All tab draws from), none again while it is kept
    expect(p.asked.map((a) => a.path)).toEqual(["/api/account/explore"]);
    expect(p.run('MKT.got.get("/api/account/explore").good.tabs[0].id')).toBe("all");
    // the shell asks for it (and for the Trade picker's lists) once the first account read is drawn, when the browser is idle
    const shell = readFileSync(join(PUBLIC, "ui/shell.js"), "utf8");
    expect(shell).toMatch(/requestIdleCallback\(ahead/);
    expect(shell).toMatch(/typeof mkPrefetch === "function"\) mkPrefetch\(\)/);
    expect(shell).toMatch(/typeof tkReadKinds === "function"\) tkReadKinds\(\)/);
  });

  it("names two venues in Where, the rest as +N with their names in its title, so a row stays short", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const at = (venueName: string, connected: boolean) => ({ venue: venueName.toLowerCase(), venueName, symbol: "BTC/USDT", connected, canTrade: connected, public: !connected });
    const html = p.run<string>(`mkWhere(${JSON.stringify({ key: "coin:BTC", kind: "coin", name: "Bitcoin", at: [at("Kraken", false), at("Exchange X", true), at("OKX", false), at("Coinbase", false)] })})`);
    // yours first, then the public ones; two by name
    expect(html).toContain('<span class="mk-v">Exchange X</span> · ');
    expect(html).toContain('<span class="mk-v pub" title="Public prices, read without a key">Kraken</span>');
    expect(html).toContain('<span class="dim mk-more" title="OKX, Coinbase">+2</span>');
    expect(p.run<string>(`mkWhere(${JSON.stringify({ key: "coin:ETH", kind: "coin", name: "Ether", at: [at("Exchange X", true)] })})`)).not.toContain("mk-more");
  });

  it("offers Connect to trade only at a venue that would take the user from where they are; one that would not is said in a word, not in its sentence, and a row none of whose venues serves this network says so", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const at = (venue: string, venueName: string, connector: string) => ({ venue, venueName, symbol: "BTC-PERP", connected: false, canTrade: false, public: true, connectTo: venue, connector, price: 62_000 });
    const item = { key: "perp:BTC", kind: "perp", name: "BTC perpetual", base: "BTC", price: 62_000, tabs: ["perps"], at: [at("hyperliquid-trade", "Hyperliquid", "live:exchange:okx")] };
    // not judged yet: offered as before
    expect(p.run<Record<string, unknown>>(`mkRoute(${JSON.stringify(item)})`)).toMatchObject({ act: "connect", venueName: "Hyperliquid" });
    // the venue refuses this network: no connection offered, its words instead — the row's button says it
    p.run(`VENUES.set("live:exchange:okx", { connector: "live:exchange:okx", name: "Hyperliquid", verdict: "not-served", said: "Hyperliquid's Terms of Use §1.6 do not serve this location." })`);
    const r = p.run<Record<string, string>>(`mkRoute(${JSON.stringify(item)})`);
    expect(r).toMatchObject({ act: "why", word: "Not served here" });
    expect(r.text).toBe("Hyperliquid: not served here.");
    expect(p.run<string>(`mkActs(${JSON.stringify(item)}, 0)`)).toContain(">Not served here</button>");
    // two venues list it, one would take the user: that one is offered
    const two = { ...item, at: [item.at[0], at("kraken", "Kraken", "live:exchange:kraken")] };
    expect(p.run<Record<string, unknown>>(`mkRoute(${JSON.stringify(two)})`)).toMatchObject({ act: "connect", venueName: "Kraken" });
    // Kraken's own terms exclude where the user is: still offered (shown, never enforced), its words on the button
    p.run(`VENUES.set("live:exchange:kraken", { connector: "live:exchange:kraken", name: "Kraken", verdict: "terms-exclude", said: "its terms exclude where you are" })`);
    const told = p.run<Record<string, string>>(`mkRoute(${JSON.stringify(two)})`);
    expect(told).toMatchObject({ act: "connect", venueName: "Kraken", terms: "Kraken: its terms exclude where you are — its terms exclude where you are." });
    expect(p.run<string>(`mkActs(${JSON.stringify(two)}, 0)`)).toContain('title="Kraken: its terms exclude where you are');
    // both refuse this network: none of them is offered, and the row says how many list it
    p.run(`VENUES.set("live:exchange:kraken", { connector: "live:exchange:kraken", name: "Kraken", verdict: "not-served", said: "Kraken does not serve this location" })`);
    expect(p.run<Record<string, string>>(`mkRoute(${JSON.stringify(two)})`).text).toBe("None of the 2 venues that list it serves this network.");
    // setup and no answer are not a no: a venue that did not answer just now is still offered
    p.run(`VENUES.set("live:exchange:kraken", { connector: "live:exchange:kraken", name: "Kraken", verdict: "no-answer" })`);
    expect(p.run<Record<string, unknown>>(`mkRoute(${JSON.stringify(two)})`)).toMatchObject({ act: "connect", venueName: "Kraken" });
    p.run(`VENUES.clear()`);
  });

  it("the list of accounts reads the account's detection too: a venue whose own terms exclude where the user is is marked and said, never closed; one that refuses this network is marked Not served here, in its words, and not closed either (the connection is kept waiting)", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const terms = "its terms exclude where you are (https://www.okx.com/help/terms-of-service, read 2026-10-08): “…Restricted Persons…” — the venue checks residency when an account is opened; the account does not";
    p.run(`VENUES.set("live:exchange:okx", { connector: "live:exchange:okx", name: "OKX", verdict: "terms-exclude", said: ${JSON.stringify(terms)}, asked: "2026-10-06T05:00:00.000Z" })`);
    p.run(`VENUES.set("live:exchange:bybit", { connector: "live:exchange:bybit", name: "Bybit", verdict: "not-served", said: "Bybit does not serve this location", asked: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run("tileSays('live:exchange:okx')")).toMatchObject({ word: "Its terms exclude where you are", shut: false, state: "terms" });
    expect(p.run("tileSays('live:exchange:bybit')")).toMatchObject({ word: "Not served here", state: "location", shut: false });
    const cat = p.run<string>("catalog(true)");
    expect(cat).toContain('data-extra="okx"');
    expect(cat).toMatch(/data-extra="okx" title="its terms exclude where you are[^"]*"><b>OKX<\/b><span><em class="off">Its terms exclude where you are<\/em>/);
    expect(cat).toMatch(/data-extra="bybit" title="Bybit does not serve this location"><b>Bybit<\/b><span><em class="off">Not served here<\/em>/);
    // the form's note for the terms: the venue's words and when they were judged — no Check again, no watch-instead, and the form stays open
    const note = p.run<string>("reachNoteHtml(tileSays('live:exchange:okx'), 'exchange')");
    expect(note).toContain("the venue checks residency when an account is opened; the account does not");
    expect(note).not.toContain("data-reach=");
    // this form's own fresh check wins over the detection for a no; a venue the form found answering keeps its terms note
    p.run(`REACH.set("live:exchange:bybit", { connector: "live:exchange:bybit", state: "ok", at: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run("tileSays('live:exchange:bybit')")).toBeNull();
    p.run(`REACH.set("live:exchange:okx", { connector: "live:exchange:okx", state: "ok", at: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run("tileSays('live:exchange:okx')")).toMatchObject({ shut: false, state: "terms" });
    p.run("VENUES.clear(); REACH.clear()");
  });

  it("close-only (Polymarket's rule for the United States among other places): the tile is said and stays open; Markets offers no connection to buy there, and says why", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const said = "Polymarket lets this location close positions, not open new ones (its own rule: docs.polymarket.com/api-reference/geoblock), and the account does not look for a way around it. Connected, the account sells what the wallet holds there and cancels its orders; it opens nothing";
    p.run(`VENUES.set("live:polymarket-trade", { connector: "live:polymarket-trade", name: "Polymarket", verdict: "close-only", said: ${JSON.stringify(said)}, asked: "2026-10-08T15:00:00.000Z" })`);
    expect(p.run("tileSays('live:polymarket-trade')")).toMatchObject({ word: "Close only here", state: "close-only", shut: false });
    expect(p.run<string>("catalog(true)")).toMatch(/data-kind="polymarket-trade" data-extra="" title="Polymarket lets this location close positions[^"]*"><b>Polymarket<\/b><span><em class="off">Close only here<\/em>/);
    const note = p.run<string>("reachNoteHtml(tileSays('live:polymarket-trade'), 'polymarket-trade')");
    expect(note).toContain("Connected, the account sells what the wallet holds there");
    expect(note).toContain('data-reach="again"');
    expect(note).not.toContain('data-reach="watch"');
    // a buy is opening: Markets offers no connection there, and says so in Polymarket's words
    const item = { key: "event:x", kind: "event", name: "Will it rain?", price: 0.4, tabs: ["events"], at: [{ venue: "polymarket", venueName: "Polymarket", symbol: "rain:Yes", connected: false, canTrade: false, public: true, connectTo: "polymarket-trade", connector: "live:polymarket-trade", price: 0.4 }] };
    expect(p.run<Record<string, string>>(`mkRoute(${JSON.stringify(item)})`)).toMatchObject({ act: "why", word: "Close only here" });
    p.run("VENUES.clear()");
  });

  it("a venue that cannot be used from here names its edition for where the user is: a tile of its own beside it, and the form's way to it", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const edition = { connector: "live:exchange:binanceus", name: "Binance.US", said: "Binance.US serves where you are under its own terms (https://www.binance.us/terms-of-use, read 2026-10-08): a separate company, with its own account and API keys" };
    p.run(`VENUES.set("live:exchange:binance", { connector: "live:exchange:binance", name: "Binance", verdict: "not-served", said: "Binance does not serve this location", asked: "2026-10-08T15:00:00.000Z", edition: ${JSON.stringify(edition)} })`);
    expect(p.run("tileSays('live:exchange:binance')")).toMatchObject({ word: "Not served here", shut: false, edition: { name: "Binance.US" } });
    const cat = p.run<string>("catalog(true)");
    expect(cat).toMatch(/<b>Binance<\/b><span><em class="off">Not served here<\/em><\/span><\/button><button type="button" class="tile" data-kind="exchange" data-extra="binanceus"><b>Binance.US<\/b><span>API key · serves where you are<\/span><\/button>/);
    // only beside the venue that cannot be used: no other tile says it
    expect(cat.match(/serves where you are/g)).toHaveLength(1);
    const note = p.run<string>("reachNoteHtml(tileSays('live:exchange:binance'), 'exchange')");
    expect(note).toContain('data-reach="edition"');
    expect(note).toContain(">Connect Binance.US instead</button>");
    p.run("VENUES.clear()");
  });

  it("a venue that refuses this network no longer shuts the form: the tile keeps Not served here and the venue's words, the note keeps them with Check again and adds that the connection can still be saved; a venue that wants something on this machine first, or offers no way in, still shuts it", () => {
    const p = page(() => ({}));
    p.set("A", account());
    const said = "Binance does not serve this location: that is its own rule, and the account does not look for a way around it. It answered: “Service unavailable from a restricted location”";
    p.run(`REACH.set("live:exchange:binance", { connector: "live:exchange:binance", state: "location", said: ${JSON.stringify(said)}, at: "2026-10-06T05:00:00.000Z" })`);
    p.run(`REACH.set("live:metamask", { connector: "live:metamask", state: "setup", said: "mm is not signed in on this machine: run mm login in a terminal, then check again", at: "2026-10-06T05:00:00.000Z" })`);
    p.run(`REACH.set("live:kalshi", { connector: "live:kalshi", state: "closed", said: "Kalshi offers no way in for this account", at: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run("tileSays('live:exchange:binance')")).toMatchObject({ word: "Not served here", state: "location", shut: false });
    expect(p.run("tileSays('live:metamask')")).toMatchObject({ word: "Set up first", state: "setup", shut: true });
    expect(p.run("tileSays('live:kalshi')")).toMatchObject({ word: "Not available", state: "closed", shut: true });
    // the account's detection says the same of a venue the form has not asked yet
    p.run(`VENUES.set("live:exchange:bybit", { connector: "live:exchange:bybit", name: "Bybit", verdict: "not-served", said: "Bybit does not serve this location", asked: "2026-10-06T05:00:00.000Z" })`);
    p.run(`VENUES.set("live:exchange:kraken", { connector: "live:exchange:kraken", name: "Kraken", verdict: "closed", said: "no way in", asked: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run("tileSays('live:exchange:bybit')")).toMatchObject({ word: "Not served here", state: "location", shut: false });
    expect(p.run("tileSays('live:exchange:kraken')")).toMatchObject({ word: "No way in here", state: "closed", shut: true });
    // the form's note: the venue's words, when it was asked, Check again, and that the connection can still be saved (the venue named as the form has it)
    const note = p.run<string>(`reachNoteHtml(tileSays("live:exchange:binance"), "exchange", "Binance")`);
    expect(note).toContain("It answered: “Service unavailable from a restricted location”");
    expect(note).toContain('<span class="dim">(asked 01:00)</span>');
    expect(note).toContain('<button type="button" class="link" data-reach="again">Check again</button>');
    expect(note).toContain('<div class="dim small reach-still">You can still connect it: the account keeps the connection and asks Binance again when a check of this network finds it answering (Check again, or the half-hourly check). Nothing is sent to it until then.</div>');
    expect(p.run<string>(`reachNoteHtml(tileSays("live:exchange:binance"), "exchange")`)).toContain("asks the venue again when a check of this network");
    // nothing here names a way around the venue's rule
    expect(note).not.toMatch(/proxy|vpn|another host/i);
    // a no that shuts the form, and a close-only venue, add no such line
    expect(p.run<string>(`reachNoteHtml(tileSays("live:metamask"), "metamask", "MetaMask Agent Wallet")`)).not.toContain("You can still connect it");
    expect(p.run<string>(`reachNoteHtml({ state: "close-only", said: "Polymarket lets this location close positions, not open new ones", at: "2026-10-06T05:00:00.000Z" }, "polymarket-trade", "Polymarket")`)).not.toContain("You can still connect it");
    // the tile keeps the venue's word and its look: that is the venue's answer, and true
    expect(p.run<string>("catalog(true)")).toContain(`<button type="button" class="tile tile-off" data-kind="exchange" data-extra="binance" title="${said.replace(/'/g, "&#39;")}"><b>Binance</b><span><em class="off">Not served here</em></span></button>`);
    p.run("VENUES.clear(); REACH.clear()");
  });

  it("a connection the owner signed while its venue refused this network, or did not answer, waits on the account: its tile says Connected · waiting, the venue's words on hover, not Not served here and not greyed; one read by address counts for its kind", () => {
    const p = page(() => ({}));
    const binance = { venue: "binance", name: "Binance", connector: "live:exchange:binance", needs: "key-file", keyFile: "credentials/binance/api-key.json", said: "Binance does not serve this location: that is its own rule, and the account does not look for a way around it. Asked again when a check of this network finds it answering", code: "E_VENUE_GEOBLOCKED", since: "2026-10-06T04:00:00.000Z", how: "connect" };
    const poly = { venue: "polymarket-a1b2c3", name: "Polymarket · 0xa1b2", connector: "live:polymarket", needs: "address", address: "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", said: "Polymarket's data API did not answer: asked again in 60 s", code: "E_VENUE_UNREACHABLE", since: "2026-10-06T04:30:00.000Z", how: "restart" };
    const options = [...account().connectLive.options, { kind: "polymarket", connector: "live:polymarket", needs: "address", label: "Polymarket · by the account wallet's address" }];
    p.set("A", account({ connectLive: { ...account().connectLive, options, waiting: [binance, poly] } }));
    // the venue still refuses this network: the tile says the connection waits, not the venue's no
    p.run(`REACH.set("live:exchange:binance", { connector: "live:exchange:binance", state: "location", said: "Binance does not serve this location", at: "2026-10-06T05:00:00.000Z" })`);
    expect(p.run("waitingOf('exchange', 'binance').venue")).toBe("binance");
    expect(p.run("waitingOf('polymarket', '').venue")).toBe("polymarket-a1b2c3");
    expect(p.run("[waitingOf('exchange', 'okx'), waitingOf('exchange', ''), waitingOf('kalshi', ''), waitingOf('polymarket-trade', '')]")).toEqual([null, null, null, null]);
    const cat = p.run<string>("catalog(true)");
    expect(cat).toContain(`<button type="button" class="tile" data-kind="exchange" data-extra="binance" title="${binance.said}"><b>Binance</b><span><em class="on">Connected</em> · waiting for it to answer this network</span></button>`);
    expect(cat).toContain(`<button type="button" class="tile" data-kind="polymarket" data-extra="" title="${poly.said.replace(/'/g, "&#39;")}"><b>Polymarket · by address</b><span><em class="on">Connected</em> · waiting for it to answer this network</span></button>`);
    expect(cat).not.toMatch(/data-extra="binance"[^>]*Not served here/);
    // a venue connected and read is still Connected · add another; one with nothing waiting and no answer is as before
    expect(cat).toContain('data-kind="kalshi" data-extra=""><b>Kalshi</b><span><em class="on">Connected</em> · add another</span>');
    expect(cat).toContain('<button type="button" class="tile" data-kind="exchange" data-extra="okx"><b>OKX</b><span>API key</span></button>');
    // without the waiting entry the same answer greys the tile again
    p.run("A.connectLive.waiting = []");
    expect(p.run<string>("catalog(true)")).toContain('class="tile tile-off" data-kind="exchange" data-extra="binance" title="Binance does not serve this location"><b>Binance</b><span><em class="off">Not served here</em></span>');
    p.run("REACH.clear()");
  });

  it("a connection its venue answered and refused (stopped: the key, the account) is not waiting: its tile says Not connected · connect it again, the venue's words on hover; the picker's marking from the venues' answers leaves a tile alone while its connection is on the account", () => {
    const p = page(() => ({}));
    const stopped = { venue: "binance", name: "Binance", connector: "live:exchange:binance", needs: "key-file", keyFile: "credentials/binance/api-key.json", said: "Binance refused the key: it has no permission for this action. Not asked again: connect it again, or disconnect it", code: "E_VENUE_UNAUTHORIZED", by: "venue", since: "2026-10-06T04:00:00.000Z", how: "restart", stopped: true };
    p.set("A", account({ connectLive: { ...account().connectLive, waiting: [stopped] } }));
    expect(p.run<string>("catalog(true)")).toContain(`<button type="button" class="tile" data-kind="exchange" data-extra="binance" title="${stopped.said}"><b>Binance</b><span><em class="off">Not connected</em> · connect it again</span></button>`);
    expect(p.run<string>("catalog(true)")).not.toContain("waiting for it to answer");
    // the venue's answer to this network, read as the list opens, marks no tile whose connection is on the account; the same tile with
    // nothing on the account is marked
    p.run(`REACH.set("live:exchange:binance", { connector: "live:exchange:binance", state: "location", said: "Binance does not serve this location", at: "2026-10-06T05:00:00.000Z" })`);
    p.run('var SPAN = { innerHTML: "" }; var TILE = { dataset: { kind: "exchange", extra: "binance" }, classList: { added: [], add(c) { this.added.push(c); } }, title: "", querySelector: (s) => (s === "span" ? SPAN : null) }; document.querySelectorAll = () => [TILE]; markTiles()');
    expect(p.run("[TILE.classList.added, TILE.title, SPAN.innerHTML]")).toEqual([[], "", ""]);
    p.run("A.connectLive.waiting = []; markTiles()");
    expect(p.run("[TILE.classList.added, TILE.title, SPAN.innerHTML]")).toEqual([["tile-off"], "Binance does not serve this location", '<em class="off">Not served here</em>']);
    p.run("REACH.clear()");
  });

  it("lists the watchlist without a lead sentence or a date column: the date is the star's title", () => {
    const p = page((path) => (path.startsWith("/api/account/explore") ? explore : {}));
    p.set("A", account({ watch: [{ venue: "ex", symbol: "BTC/USDT", at: "2026-10-06T04:00:00.000Z" }, { venue: "kraken", symbol: "ETH/USD", at: "2026-10-01T04:00:00.000Z" }] }));
    p.run(`MKT.got.set(${JSON.stringify("/api/account/explore?limit=200")}, { at: ${NOW}, body: ${JSON.stringify(explore)}, good: ${JSON.stringify(explore)}, goodAt: ${NOW} })`);
    const html = p.run<string>("MKT.reg = []; mkWatchingHtml(lensNow())");
    expect(html).not.toContain("Your agents read this list");
    expect(html).not.toContain(">Watched<");
    expect(html).toContain('title="Watching since Tue 6 Oct"');
    expect(html).toContain('title="Watching since Thu 1 Oct"');
    // the watched BTC is the row Markets lists; the Kraken market no read carries is a row of its own that still prices, opens and connects
    expect(html).toContain('data-fk="open:coin:BTC"');
    expect(html).toContain("ETH/USD");
    expect([...html.matchAll(/<th scope="col"[^>]*>(?:<span class="sr">)?([^<]*)/g)].map((m) => m[1])).toEqual(["Watch, price alert", "Market", "Where", "Price", "24h", "Actions"]);
    // a watched outcome is said beside its price (not under the name: a row is one line, its name's card says the rest)
    p.set("A", account({ watch: [{ venue: "kalshi", symbol: "KXFED-DEC:NO", at: "2026-10-06T04:00:00.000Z" }] }));
    const ev = p.run<string>("MKT.reg = []; mkWatchingHtml(lensNow())");
    expect(ev).toContain('data-fmt="c-last">38¢</span><span class="dim small"> No</span>');
    expect(ev).toContain('data-peek="0"');
    expect(ev).not.toContain('<span class="dim">No</span>');
  });
});

describe("a stock out of its session", () => {
  /* a broker connected live, and a stock it lists at night: still open for orders (the broker holds them for the open), out of its session */
  const withBroker = () => account({ venues: [...account().venues, venue("broker", "Broker", { trade: { can: true, what: "US stocks and ETFs", kinds: ["stock"] } })] });
  const NIGHT = { open: false, opensAt: "2026-10-06T13:30:00.000Z", closesAt: "2026-10-06T20:00:00.000Z" };
  const DAY = { open: true, opensAt: "2026-10-07T13:30:00.000Z", closesAt: "2026-10-06T20:00:00.000Z" };
  const HELD = "the US stock market is closed: Broker holds an order and sends it when the market opens (2026-10-06 09:30 New York time)";
  /* the viewer's own time after New York's, as the page adds it where the viewer's clock is not New York's (core.js yourTime): nothing on
     a New York machine, " (13:30 your time)" on a UTC runner — so these read the same wherever the tests run */
  const yt = (p: { run: <T>(code: string) => T }, iso: string) => p.run<string>(`yourTime(${JSON.stringify(iso)})`);
  const aapl = (session?: unknown) => ({
    key: "stock:AAPL",
    kind: "stock",
    name: "Apple Inc.",
    base: "AAPL",
    price: 255.12,
    changePct24h: 0.4,
    volumeUsd24h: 5.1e9,
    ...(session ? { session } : {}),
    tabs: ["all", "stocks"],
    at: [{ venue: "broker", venueName: "Broker", symbol: "AAPL", connected: true, canTrade: true, public: false, price: 255.12, open: true, ...(session ? { session } : {}), ...(session && !(session as { open: boolean }).open ? { note: HELD } : {}) }],
  });

  it("says Closed beside its price, with when it opens as the tag's title — from the venue's own stamp, and only while it is out of session", () => {
    const p = page(() => ({}));
    p.set("A", withBroker());
    p.set("ITEMS", { night: aapl(NIGHT), day: aapl(DAY), unknown: aapl() });
    const night = p.run<string>("MKT.reg = []; mkTable([ITEMS.night], '')");
    expect(night).toContain(`<span class="tag" title="Opens Tue 6 Oct, 09:30 New York${yt(p, NIGHT.opensAt)}">Closed</span> <span data-q="broker|AAPL" data-fmt="usd">$255.12</span>`);
    // still traded: a broker holds the order for the open, and the drawer says so in its words
    expect(night).toContain('data-act="trade"');
    // in session, and where no venue says a session: no tag (never read from `open`)
    expect(p.run<string>("mkTable([ITEMS.day], '')")).not.toContain(">Closed<");
    expect(p.run<string>("mkTable([ITEMS.unknown], '')")).not.toContain(">Closed<");
    // a fresh price read with the venue's clock says the session now: in session, the tag goes; out of it, it comes
    p.run(`MKT.quotes.set("broker|AAPL", { at: ${NOW}, market: { price: 256, session: ${JSON.stringify(DAY)} } })`);
    expect(p.run<string>("mkTable([ITEMS.night], '')")).not.toContain(">Closed<");
    p.run(`MKT.quotes.set("broker|AAPL", { at: ${NOW}, market: { price: 256, session: ${JSON.stringify(NIGHT)} } })`);
    expect(p.run<string>("mkTable([ITEMS.unknown], '')")).toContain(`title="Opens Tue 6 Oct, 09:30 New York${yt(p, NIGHT.opensAt)}">Closed</span>`);
    // a coin has no session, whatever a line carries
    expect(p.run<string>(`mkTable([{ ...${JSON.stringify(btc)}, session: ${JSON.stringify(NIGHT)} }], '')`)).not.toContain(">Closed<");
  });

  it("says it in the drawer's facts — Closed · opens …, or Open · closes … — and nothing where no venue says a session", () => {
    const p = page(() => ({}));
    p.set("A", withBroker());
    p.set("ITEMS", { night: aapl(NIGHT), day: aapl(DAY), unknown: aapl() });
    const night = p.run<string>('mkDrawerHtml({ item: ITEMS.night, interval: "1h", ipo: [] })');
    expect(night).toContain(`<dt>Session</dt><dd>Closed · opens Tue 6 Oct, 09:30 New York${yt(p, NIGHT.opensAt)}</dd>`);
    // Buy stays: the broker takes the order and holds it for the open
    expect(night).toContain('data-act="trade" data-fk="d-buy"');
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.day, interval: "1h", ipo: [] })')).toContain(`<dt>Session</dt><dd>Open · closes 16:00 New York${yt(p, DAY.closesAt)}</dd>`);
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.unknown, interval: "1h", ipo: [] })')).not.toContain("<dt>Session</dt>");
    // the Watching tab's row says it too
    p.set("A", { ...withBroker(), watch: [{ venue: "broker", symbol: "AAPL", at: "2026-10-06T04:00:00.000Z" }] });
    const read = { ...explore, items: [aapl(NIGHT)] };
    p.run(`MKT.got.set(${JSON.stringify("/api/account/explore?limit=200")}, { at: ${NOW}, body: ${JSON.stringify(read)}, good: ${JSON.stringify(read)}, goodAt: ${NOW} })`);
    expect(p.run<string>("MKT.reg = []; mkWatchingHtml(lensNow())")).toContain(`title="Opens Tue 6 Oct, 09:30 New York${yt(p, NIGHT.opensAt)}">Closed</span>`);
  });
});

describe("a US stock's price says where it is from", () => {
  const DELAYED = "Cboe · 15 min delayed";
  const READ_ONLY = "Real-time quotes from Robinhood or Nasdaq, else Cboe's own delayed ones, 15 minutes behind the market — each line says which: a US stock trades at a connected broker (Alpaca, Robinhood), or in a paper account";
  /* the US stocks line (live/public-stocks.ts): its name says no source, its price does (quoteFrom), on the line and on the row it prices */
  const usLine = (price: number, from: string) => ({ venue: "cboe", venueName: "US stocks", symbol: "ZION", connected: false, canTrade: false, public: true, price, bid: price - 0.01, ask: price + 0.02, quoteFrom: from, connectTo: "alpaca", connector: "live:alpaca", note: READ_ONLY });
  const zion = { key: "stock:ZION", kind: "stock", name: "Zions Bancorporation", base: "ZION", price: 51.2, quoteFrom: DELAYED, tabs: ["all", "stocks"], at: [usLine(51.2, DELAYED)] };

  it("names the source and how far behind it is — in the row's hover card and its Where title, for a screen reader, in the drawer's facts and in Across venues — escaped, and nothing where no line says", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { zion, odd: { ...zion, quoteFrom: '<img src=x onerror="alert(1)">' }, btc });
    expect(p.run<string>("mkPeekHtml(ITEMS.zion)")).toContain('<span class="mk-peek-f">Price from Cboe · 15 min delayed</span>');
    const row = p.run<string>("MKT.reg = []; mkTable([ITEMS.zion], '')");
    expect(row).toContain('<span class="mk-v pub" title="Public prices, read without a key. Price from Cboe · 15 min delayed">US stocks</span>');
    expect(row).toContain('<span class="sr">. ZION · Price from Cboe · 15 min delayed</span>');
    const drawer = p.run<string>('mkDrawerHtml({ item: ITEMS.zion, interval: "1h", ipo: [] })');
    expect(drawer).toContain("<dt>Price from</dt><dd>Cboe · 15 min delayed</dd>");
    expect(p.run<string>("mkAcrossHtml({ item: ITEMS.zion })")).toContain('US stocks <span class="tag">Public</span><span class="why">Price from Cboe · 15 min delayed</span>');
    // the source's words are escaped wherever they are drawn
    const odd = p.run<string>("mkPeekHtml(ITEMS.odd)");
    expect(odd).toContain("Price from &lt;img src=x");
    expect(odd).not.toContain("<img");
    // a coin's venues name themselves: no line says a source, and nothing is said
    expect(p.run<string>("mkPeekHtml(ITEMS.btc)")).not.toContain("Price from");
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.btc, interval: "1h", ipo: [] })')).not.toContain("Price from");
  });

  it("says the source of the price it shows: a connected venue's fresh price says its own (or none), never the public line's", () => {
    const p = page(() => ({}));
    p.set("A", account({ venues: [...account().venues, venue("broker", "Broker", { trade: { can: true, what: "US stocks and ETFs", kinds: ["stock"] } })] }));
    // the broker priced the row (its line names no source); the US stocks line beside it is Cboe's delayed quote
    const held = { ...zion, price: 51.3, quoteFrom: undefined, at: [{ venue: "broker", venueName: "Broker", symbol: "ZION", connected: true, canTrade: true, public: false, price: 51.3, open: true }, usLine(51.2, DELAYED)] };
    p.set("ITEMS", { held });
    expect(p.run<string>("mkPeekHtml(ITEMS.held)")).not.toContain("Price from");
    expect(p.run<string>("mkAcrossHtml({ item: ITEMS.held })")).toContain('<span class="why">Price from Cboe · 15 min delayed</span>');
    // a fresh price from the broker that says its source: that one
    p.run(`MKT.quotes.set("broker|ZION", { at: ${NOW}, market: { price: 51.31, quoteFrom: "Nasdaq · real time" } })`);
    expect(p.run<string>("mkPeekHtml(ITEMS.held)")).toContain('<span class="mk-peek-f">Price from Nasdaq · real time</span>');
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.held, interval: "1h", ipo: [] })')).toContain("<dt>Price from</dt><dd>Nasdaq · real time</dd>");
    // and one that says none: nothing, rather than the public line's source beside the broker's price
    p.run(`MKT.quotes.set("broker|ZION", { at: ${NOW}, market: { price: 51.32 } })`);
    expect(p.run<string>("mkPeekHtml({ ...ITEMS.held, quoteFrom: " + JSON.stringify(DELAYED) + " })")).not.toContain("Price from");
  });

  it("says when the price is from once it is more than a couple of minutes old — a real-time source's last trade from the day before is not called real time alone — and not when it is recent", () => {
    const RT = "Nasdaq · real time";
    // the page's clock is 01:00 New York on Tue 6 Oct: Nasdaq's real-time answer for a share not traded since is its last trade, Monday 10:29
    const STALE = "2026-10-05T14:29:00.000Z";
    const SAID = "Nasdaq · real time · last at 10:29 New York, Mon 5 Oct";
    const line = (quoteAt?: string) => ({ ...usLine(51.2, RT), ...(quoteAt ? { quoteAt } : {}) });
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", {
      stale: { ...zion, quoteFrom: RT, quoteAt: STALE, at: [line(STALE)] },
      recent: { ...zion, quoteFrom: RT, quoteAt: new Date(NOW - 60_000).toISOString(), at: [line(new Date(NOW - 60_000).toISOString())] },
      unstamped: { ...zion, quoteFrom: RT, quoteAt: "not a time", at: [line("not a time")] },
    });
    // the stale one, wherever its source is said: the hover card, the Where title, for a screen reader, the drawer's facts, Across venues
    expect(p.run<string>("mkPeekHtml(ITEMS.stale)")).toContain(`<span class="mk-peek-f">Price from ${SAID}</span>`);
    const row = p.run<string>("MKT.reg = []; mkTable([ITEMS.stale], '')");
    expect(row).toContain(`<span class="mk-v pub" title="Public prices, read without a key. Price from ${SAID}">US stocks</span>`);
    expect(row).toContain(`<span class="sr">. ZION · Price from ${SAID}</span>`);
    expect(p.run<string>('mkDrawerHtml({ item: ITEMS.stale, interval: "1h", ipo: [] })')).toContain(`<dt>Price from</dt><dd>${SAID}</dd>`);
    expect(p.run<string>("mkAcrossHtml({ item: ITEMS.stale })")).toContain(`<span class="why">Price from ${SAID}</span>`);
    // a minute old, or no time to go by: the source alone
    for (const k of ["recent", "unstamped"]) {
      expect(p.run<string>(`mkPeekHtml(ITEMS.${k})`)).toContain(`<span class="mk-peek-f">Price from ${RT}</span>`);
      expect(p.run<string>(`mkDrawerHtml({ item: ITEMS.${k}, interval: "1h", ipo: [] })`)).toContain(`<dt>Price from</dt><dd>${RT}</dd>`);
      expect(p.run<string>(`mkAcrossHtml({ item: ITEMS.${k} })`)).not.toContain("last at");
    }
    // a fresh price says its own time, not the explore read's: a connected broker's fresh quote from a minute ago, beside the stale line
    p.set("A", account({ venues: [...account().venues, venue("broker", "Broker", { trade: { can: true, what: "US stocks and ETFs", kinds: ["stock"] } })] }));
    p.set("HELD", { ...zion, quoteFrom: RT, quoteAt: STALE, at: [{ venue: "broker", venueName: "Broker", symbol: "ZION", connected: true, canTrade: true, public: false, price: 51.3, open: true }, line(STALE)] });
    p.run(`MKT.quotes.set("broker|ZION", { at: ${NOW}, market: { price: 51.31, quoteFrom: ${JSON.stringify(RT)}, quoteAt: ${JSON.stringify(new Date(NOW - 60_000).toISOString())} } })`);
    expect(p.run<string>("mkPeekHtml(HELD)")).toContain(`<span class="mk-peek-f">Price from ${RT}</span>`);
    expect(p.run<string>('mkDrawerHtml({ item: HELD, interval: "1h", ipo: [] })')).toContain(`<dt>Price from</dt><dd>${RT}</dd>`);
    // and a fresh read of a share still untraded says its time
    p.run(`MKT.quotes.set("broker|ZION", { at: ${NOW}, market: { price: 51.31, quoteFrom: ${JSON.stringify(RT)}, quoteAt: ${JSON.stringify(STALE)} } })`);
    expect(p.run<string>("mkPeekHtml(HELD)")).toContain(`<span class="mk-peek-f">Price from ${SAID}</span>`);
  });
});

describe("after connect, a venue that refuses this network is a state Markets says, not an error", () => {
  const CLOSE_SAID = "Polymarket lets this location close positions, not open new ones (its own rule)";
  /* Polymarket connected and trading, close-only on this network */
  const withPm = (over: Record<string, unknown> = {}) => account({ venues: [...account().venues, venue("pm", "Polymarket", { trade: { can: true, what: "event contracts", kinds: ["event"], positions: true }, closeOnly: { said: CLOSE_SAID }, ...over })] });
  const rainLine = { venue: "pm", venueName: "Polymarket", symbol: "rain:Yes", connected: true, canTrade: true, public: false, price: 0.4, open: true, closeOnly: true };
  const rain = { key: "pm:rain", kind: "event", name: "Will it rain?", price: 0.4, category: "Weather", tabs: ["all", "predictions"], outcomes: [{ label: "YES", price: 0.4, at: [{ venue: "pm", symbol: "rain:Yes" }] }, { label: "NO", price: 0.6, at: [{ venue: "pm", symbol: "rain:No" }] }], at: [rainLine] };
  const held = { ok: true, row: null, positions: [{ venue: "pm", venueName: "Polymarket", symbol: "rain:Yes", name: "Will it rain? · Yes", kind: "event", side: "long", qty: 10 }], orders: [], cost: [], lines: [] };

  it("a connected venue that lets this network only close takes no buy: the row says Close only here, the drawer says it in a chip with the venue's words folded away, Sell stays, and Buy opens the drawer instead of a red toast", () => {
    const p = page(() => ({}));
    p.set("A", withPm());
    p.set("ITEMS", { rain, held });
    expect(p.run<Record<string, string>>("mkRoute(ITEMS.rain, 0)")).toEqual({ act: "why", venue: "pm", text: "Polymarket: close only here. What you hold there can be sold.", word: "Close only here", said: CLOSE_SAID });
    expect(p.run<string>("MKT.reg = []; mkActs(ITEMS.rain, 0)")).toContain('title="Polymarket: close only here. What you hold there can be sold.">Close only here</button>');
    // the explore line alone says it too (before the account's mark on the venue is read)
    p.set("A", withPm({ closeOnly: undefined }));
    expect(p.run<Record<string, string>>("mkRoute(ITEMS.rain)")).toMatchObject({ act: "why", word: "Close only here", said: "" });
    p.set("A", withPm());
    // the drawer: no Buy and no warning callout; the state in a chip, the venue's words in a closed details; selling what is held stays
    const html = p.run<string>('mkDrawerHtml({ item: ITEMS.rain, interval: "1h", asset: ITEMS.held, ipo: [] })');
    expect(html).toContain(`<div class="mk-state"><span class="chip" title="Polymarket: close only here. What you hold there can be sold.">Close only here</span><details class="inl"><summary>The venue's words</summary>${CLOSE_SAID}.</details></div>`);
    expect(html).not.toContain("Can't trade it here");
    expect(html).not.toContain('data-act="yn"');
    expect(html).toContain('data-act="sell" data-venue="pm" data-symbol="rain:Yes"');
    // Across venues: no Trade there; the state in a word, the venue's words on hover
    const across = p.run<string>("mkAcrossHtml({ item: ITEMS.rain, asset: ITEMS.held })");
    expect(across).toContain(`<span class="why" title="${CLOSE_SAID}"><b>Close only here</b></span>`);
    expect(across).not.toContain('data-act="trade-at"');
    // Buy (a row's outcome button) opens the market's drawer, once; nothing is said as an error
    p.run("var OPENED = []; var TOASTS = []; openMarket = (x) => OPENED.push(x.key); toast = (t, k) => TOASTS.push([t, k])");
    p.run('MKT.open = null; mkTrade(ITEMS.rain, "buy", 0)');
    expect(p.run("[OPENED, TOASTS]")).toEqual([["pm:rain"], []]);
    p.run('MKT.open = { item: ITEMS.rain }; mkTrade(ITEMS.rain, "buy", 0); MKT.open = null');
    expect(p.run("OPENED.length")).toBe(1);
    // a refusal that is no state (Kalshi's key can't trade) is still said as one
    p.set("ITEMS.fedK", { ...fed, at: [fed.at[0]], outcomes: fed.outcomes.map((o) => ({ ...o, at: [o.at[0]] })) });
    p.run('mkTrade(ITEMS.fedK, "buy", 0)');
    expect(p.run<Array<[string, string]>>("TOASTS").map(([, k]) => k)).toEqual(["no"]);
  });

  it("where its connected venue is close-only, a public listing at a venue that serves this network is offered instead; never one whose venue is already connected", () => {
    const p = page(() => ({}));
    p.set("A", withPm());
    const pub = { venue: "standin-pubex-public", venueName: "Stand-in", symbol: "RAIN-YES", connected: false, canTrade: false, public: true, price: 0.41, connectTo: "standin-pubex", connector: "live:standin-pubex" };
    p.set("ITEMS", { both: { ...rain, at: [rainLine, pub] }, again: { ...rain, at: [rainLine, { ...pub, connectTo: "kalshi", connector: "live:kalshi" }] } });
    expect(p.run<Record<string, string>>("mkRoute(ITEMS.both, 0)")).toMatchObject({ act: "connect", connector: "live:standin-pubex", venueName: "Stand-in" });
    // Kalshi is connected already: its public line is a price, not a connection to offer again
    expect(p.run<Record<string, string>>("mkRoute(ITEMS.again, 0)")).toMatchObject({ act: "why", word: "Close only here" });
  });

  it("the drawer's comparison names a venue that does not serve this network once, in a quiet line with its words on hover; a read that failed keeps its words", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc });
    const geo = { venue: "binance", venueName: "Binance", why: "Binance does not serve this location: that is its own rule", code: "E_VENUE_GEOBLOCKED" };
    const compare = { ok: true, rows: [{ venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT", price: 62140, spreadPct: 0.01, best: true, ready: true }], missing: [geo, geo, { venue: "kraken", venueName: "Kraken", why: "Kraken did not answer just now", code: "E_VENUE_UNREACHABLE" }] };
    const html = p.run<string>(`mkAcrossHtml({ item: ITEMS.btc, compare: ${JSON.stringify(compare)} })`);
    expect(html).toContain('<p class="mk-quiet" title="Binance: Binance does not serve this location: that is its own rule.">Not served on this network now: Binance.</p>');
    expect(html).toContain('<p class="mk-missing">Not compared: <b>Kraken</b>: Kraken did not answer just now.</p>');
    expect(html).not.toContain("<b>Binance</b>");
    // what is held, read without that venue: the same quiet line
    const asset = { ok: true, row: null, positions: [], orders: [], cost: [], lines: [], missing: [geo] };
    expect(p.run<string>(`mkHeldHtml({ item: ITEMS.btc, asset: ${JSON.stringify(asset)} })`)).toContain('<p class="mk-quiet" title="Binance: Binance does not serve this location: that is its own rule.">Not served on this network now: Binance.</p>');
  });

  it("an order the account stopped following reads Not followed, its note on hover, under You hold (Cancel stays: it sends the owner's cancel again) and under Agents on it", () => {
    const p = page(() => ({}));
    const note = "Exchange X refuses this network, so the account can neither cancel it nor see it fill: it stopped following it. Cancel it at Exchange X";
    const agent = "0x3a087530887bd175ccc38828ee3776e5b6ea1ac6";
    const order = { id: "ord-1", venue: "ex", venueName: "Exchange X", side: "buy", qty: 0.01, base: "BTC", symbol: "BTC/USDT", type: "limit", limitPrice: 60000, status: "open", filledQty: 0, unfollowed: true, note, agent };
    p.set("A", account({ orders: [order], keys: [{ address: agent, name: "Claude Code", status: "ok" }] }));
    p.set("ITEMS", { btc });
    const asset = { ok: true, row: null, positions: [], orders: [order], cost: [], lines: [] };
    expect(p.run<string>(`mkHeldHtml({ item: ITEMS.btc, asset: ${JSON.stringify(asset)} })`)).toContain(`<span class="st dim" title="${note}">Not followed</span><button type="button" class="btn btn-sm btn-ghost" data-act="cancel" data-order="ord-1"`);
    const agents = p.run<string>("mkAgentsHtml(ITEMS.btc)");
    expect(agents).toContain(`ord-1 · Exchange X · <span title="${note}">Not followed</span>`);
    expect(agents).not.toContain("· open");
  });

  it("the connect form's note is quiet (wait) for a connection already waiting on the account, and red for one that is not", () => {
    const p = page(() => ({}));
    const waiting = { venue: "kalshi-2", name: "Kalshi", connector: "live:kalshi", needs: "key-file", keyFile: "credentials/kalshi/api-key.json", said: "Kalshi does not serve this location", code: "E_VENUE_GEOBLOCKED", since: "2026-10-06T04:00:00.000Z", how: "connect" };
    p.set("A", account({ connectLive: { ...account().connectLive, waiting: [waiting] } }));
    // the dialog's parts, kept by id
    p.run('var ELS = {}; var mkEl = (id) => ({ id, innerHTML: "", textContent: "", className: "", hidden: false, open: false, value: "", dataset: {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, showModal() { this.open = true; }, close() {}, elements: { label: { value: "", addEventListener() {} }, ref: { value: "", addEventListener() {} } } }); document.getElementById = (id) => (ELS[id] = ELS[id] || mkEl(id))');
    p.run('REACH.set("live:kalshi", { connector: "live:kalshi", state: "location", said: "Kalshi does not serve this location", at: "2026-10-06T05:00:00.000Z" })');
    p.run('openConnect(optionOf("kalshi"), {})');
    expect(p.run("ELS['reach-note'].className")).toBe("reach-note msg wait");
    expect(p.run<string>("ELS['reach-note'].innerHTML")).toContain("Kalshi does not serve this location");
    p.run('A.connectLive.waiting = []; ELS = {}; openConnect(optionOf("kalshi"), {})');
    expect(p.run("ELS['reach-note'].className")).toBe("reach-note msg no");
    p.run("REACH.clear()");
  });
});

/** PRICE ALERTS AND THE PULSE (after OpenStock; markets.js): the bell beside ★, the alert sheet's Remove, the Alerts list under Watching, and
 * the pulse over All — the session line from the stocks' own session words and the six tiles, only for rows the read has */
describe("price alerts and the pulse", () => {
  const alertOn = (over: Record<string, unknown> = {}) => ({ id: "alert-0001", venue: "okx", venueName: "OKX", symbol: "DOGE/USDT", condition: "above", price: 0.2, at: "2026-10-05T04:00:00.000Z", expiresAt: "2027-01-03T04:00:00.000Z", ...over });
  /* an index ETF as the US stocks line lists it, out of its session before the open */
  const spy = (session: unknown = { open: false, opensAt: "2026-10-06T13:30:00.000Z", closesAt: "2026-10-06T20:00:00.000Z" }) => ({
    key: "stock:SPY",
    kind: "stock",
    name: "SPDR S&P 500 ETF",
    base: "SPY",
    price: 571.2,
    changePct24h: -0.3,
    quoteFrom: "Cboe · 15 min delayed",
    tabs: ["all", "stocks"],
    at: [{ venue: "cboe", venueName: "US stocks", symbol: "SPY", connected: false, canTrade: false, public: true, price: 571.2, connectTo: "alpaca", connector: "live:alpaca", quoteFrom: "Cboe · 15 min delayed", session }],
  });

  it("the bell is drawn beside ★ for the same markets, pressed while an alert stands on the row (a public listing's under the venue it would be); Remove signs a setAlert with on \"\", the alert's figure as a plain decimal", async () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { btc, doge });
    expect(p.run("mkBell(ITEMS.doge, 0)")).toContain('class="icon-btn mk-bell" data-act="alert" data-i="0" data-fk="alert:coin:DOGE" aria-pressed="false" aria-label="Set a price alert for DOGE"');
    expect(p.run("mkKeys(ITEMS.btc, 1)")).toContain('data-fk="watch:coin:BTC"');
    expect(p.run("mkKeys(ITEMS.btc, 1)")).toContain('data-fk="alert:coin:BTC"');
    // the table's first cell holds both
    expect(p.run("mkTable([ITEMS.btc], '')")).toContain('<span class="mk-keys"><button type="button" class="icon-btn mk-star"');
    // an alert on DOGE at OKX, where only OKX's public prices list DOGE: the bell is pressed on that row, not on BTC's
    p.set("A", account({ alerts: [alertOn()] }));
    expect(p.run("mkBell(ITEMS.doge, 0)")).toContain('aria-pressed="true" aria-label="1 price alert on DOGE"');
    expect(p.run("mkBell(ITEMS.btc, 1)")).toContain('aria-pressed="false"');
    expect(p.run("mkAlertsOf(ITEMS.doge).map((x) => x.id)")).toEqual(["alert-0001"]);
    expect(p.run("mkAlertsOf(ITEMS.btc)")).toEqual([]);
    // Remove: the alert as it stands, its price a plain decimal
    p.run("own = async (d) => { DRAFTS.push(d); return { status: 200, body: {} }; }; var DRAFTS = []");
    p.run(`mkPaneClick(${press({ act: "alert-off", id: "alert-0001" })})`);
    await settle();
    expect(p.run("JSON.stringify(DRAFTS)")).toBe(JSON.stringify([{ type: "setAlert", id: "alert-0001", venue: "okx", symbol: "DOGE/USDT", condition: "above", price: "0.2", on: "" }]));
    expect(p.run("[mkPlain(63500), mkPlain(0.62), mkPlain(1e-7), mkPlain(0.1 + 0.2)]")).toEqual(["63500", "0.62", "0.0000001", "0.3"]);
    // the drawer's Alert button counts them, and its Price alerts part lists them with Remove
    p.run("MKT.open = { item: ITEMS.doge, range: '1M', interval: '1h', ipo: [] }");
    const parts = p.run<Record<string, string>>("mkDrawerParts(MKT.open)");
    expect(parts.head).toContain('data-act="alert" data-fk="d-alert" aria-pressed="true"');
    expect(parts.head).toContain("1 Alert</button>");
    expect(parts.alerts).toContain('aria-label="Price alerts"');
    expect(parts.alerts).toContain("Rises above $0.2</div><div class=\"t2\">OKX · since Mon 5 Oct · until Sat 2 Jan · alert-0001</div>");
    expect(parts.alerts).toContain('data-fk="alert-off:alert-0001"');
    // a row with no alert has an empty part, and the button says Alert
    p.run("MKT.open = { item: ITEMS.btc, range: '1M', interval: '1h', ipo: [] }");
    expect(p.run<Record<string, string>>("mkDrawerParts(MKT.open)").alerts).toBe("");
    expect(p.run<Record<string, string>>("mkDrawerParts(MKT.open)").head).toContain(">Alert</button>");
  });

  it("the Watching tab lists the alerts under the watchlist — the market, which way and the figure (cents for an event contract), the price now, since and until, Remove — then the fired ones; the tab shows for alerts alone", async () => {
    const p = page((path) => (path.startsWith("/api/account/explore") ? exploreF5 : {}));
    p.set("A", account({
      alerts: [alertOn(), alertOn({ id: "alert-0002", venue: "kalshi", venueName: "Kalshi", symbol: "KXFED-DEC:YES", condition: "below", price: 0.5 })],
      alertsFired: [{ ...alertOn({ id: "alert-0003", venue: "ex", venueName: "Exchange X", symbol: "BTC/USDT", condition: "above", price: 62000 }), seen: 62140, from: "Exchange X", firedAt: "2026-10-06T04:30:00.000Z" }],
    }));
    p.run(`ROUTE.tab = "markets"; ${PANE}`);
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "watching" } })');
    await settle();
    await settle();
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "watching" } })');
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('data-tab="watching"');
    expect(html).toContain("Nothing watched.");
    expect(html).toContain('aria-label="Price alerts"');
    expect(html).toContain("2 alerts standing · checked about every 30 seconds while the account runs · each stands 90 days");
    expect(html).toContain('<span class="mk-al-cond">Rises above <b>$0.2</b></span>');
    expect(html).toContain('<span class="mk-al-cond">Falls below <b>50¢</b></span>');
    expect(html).toContain("Mon 5 Oct · until Sat 2 Jan");
    expect(html).toContain('data-fk="alert-off:alert-0001"');
    expect(html).toContain('data-fk="alert-off:alert-0002"');
    // the Fed alert's row is the event Markets lists, its price now its lead outcome's
    expect(html).toContain('data-fk="open:kalshi:KXFED-DEC"');
    expect(html).toContain("62¢");
    // the fired one, in words, with the price that fired it and whose it was
    expect(html).toContain("BTC/USDT at Exchange X rose above $62,000.00: $62,140.00");
    expect(html).toContain("Tue 6 Oct 00:30 New York · Exchange X");
    // a browser that only looks (its device is not the owner's) gets no Remove
    p.run('Owner.role = "pending"; renderMarkets({ el: EL, owner: false, lens: lensNow(), params: { tab: "watching" } })');
    expect(p.run<string>("EL.innerHTML")).not.toContain("alert-off:");
    expect(p.run<string>("EL.innerHTML")).not.toContain(">Remove</button>");
    p.run('Owner.role = "owner"');
  });

  it("the pulse over All: the US session from the stocks' own session words with a countdown on the page's clock, a tile for each of the six the reads have, none for one they have not, and nothing while searching", async () => {
    const p = page((path) => (path.includes("tab=stocks") ? { ...exploreF5, items: [spy()] } : path.startsWith("/api/account/explore") ? exploreF5 : {}));
    p.set("A", account());
    p.run(`ROUTE.tab = "markets"; ${PANE}`);
    p.run("renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })");
    await settle();
    await settle();
    p.run("renderMarkets({ el: EL, owner: true, lens: lensNow(), params: {} })");
    const html = p.run<string>("EL.innerHTML");
    expect(html).toContain('<section class="mk-pulse" aria-label="Pulse">');
    // the session: closed before the open at 09:30 New York (NOW is 05:00 UTC, 01:00 New York): opens in 8h 30m, said once a second
    expect(html).toContain('<span class="mk-dot off" aria-hidden="true"></span><b>US stocks</b> · Closed · <span class="mk-sess" data-at="2026-10-06T13:30:00.000Z" data-word="opens">opens in 8h 30m</span>');
    expect(html).toContain("opens Tue 6 Oct 09:30 New York");
    // the tiles the reads have: the S&P 500 from the Stocks read, Bitcoin from All; none for the four the reads do not carry
    const tiles = [...html.matchAll(/class="mk-tile"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(tiles).toEqual(["S&amp;P 500: open SPDR S&amp;P 500 ETF", "Bitcoin: open Bitcoin"]);
    expect(html).toContain('<span class="mk-tile-px">$571.20</span>');
    expect(html).toContain("Cboe · 15 min delayed");
    expect(html).toContain('<span class="mk-tile-px" data-q="ex|BTC/USDT" data-fmt="usd">$62,140.00</span>');
    // the tiles come after the table's rows in the pane's list (data-i), so a row's place is what it always was
    expect(html).toContain('data-fk="open:kalshi:KXFED-DEC" data-peek="3"');
    // the countdown ticks with the others: its words each second, and the moment come it sends the list to be read again
    expect(p.run('mkIn("opens", 3600000 + 7 * 60000)')).toBe("opens in 1h 07m");
    expect(p.run('mkIn("closes", 125000)')).toBe("closes in 2m 05s");
    expect(p.run('mkIn("opens", 2 * 86400000 + 15 * 3600000)')).toBe("opens in 2d 15h");
    expect(p.run('mkIn("opens", -1)')).toBe("opens now");
    // an open market: the dot up, closes in; an extended session: the amber dot, the phase's own end
    expect(p.run(`mkSessionLine([${JSON.stringify(spy({ open: true, opensAt: "2026-10-07T13:30:00.000Z", closesAt: "2026-10-06T20:00:00.000Z" }))}])`)).toContain('<span class="mk-dot up" aria-hidden="true"></span><b>US stocks</b> · Open · <span class="mk-sess" data-at="2026-10-06T20:00:00.000Z" data-word="closes">closes in 15h 00m</span>');
    expect(p.run(`mkSessionLine([${JSON.stringify(spy({ open: false, phase: "pre", phaseEndsAt: "2026-10-06T13:30:00.000Z", opensAt: "2026-10-06T13:30:00.000Z", closesAt: "2026-10-06T20:00:00.000Z", extendedHours: true }))}])`)).toContain('<span class="mk-dot ext" aria-hidden="true"></span><b>US stocks</b> · Pre-market · <span class="mk-sess" data-at="2026-10-06T13:30:00.000Z" data-word="opens">opens in 8h 30m</span>');
    expect(p.run("mkSessionLine([])")).toBe("");
    // searching: the rows are the answer, no pulse over them
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { q: "btc" } })');
    await settle();
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { q: "btc" } })');
    expect(p.run<string>("EL.innerHTML")).not.toContain("mk-pulse");
    // another tab: no pulse either
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "crypto" } })');
    await settle();
    p.run('renderMarkets({ el: EL, owner: true, lens: lensNow(), params: { tab: "crypto" } })');
    expect(p.run<string>("EL.innerHTML")).not.toContain("mk-pulse");
  });
});

/** A SHARE'S FINANCIALS from SEC EDGAR (markets.js mkFinHtml, the drawer's Financials part; the account's read is live/edgar.ts): drawn for
 * a US share's row and no other, a skeleton while the SEC answers, its refusal in its own words, and the filed figures as two small tables
 * with the shares, whose figures they are and the filings one click away */
describe("the drawer's Financials from SEC EDGAR", () => {
  const share = (over: Record<string, unknown> = {}) => ({
    key: "stock:AAPL",
    kind: "stock",
    name: "Apple Inc.",
    base: "AAPL",
    price: 228.2,
    tabs: ["all", "stocks"],
    at: [{ venue: "cboe", venueName: "US stocks", symbol: "AAPL", connected: false, canTrade: false, public: true, price: 228.2, connectTo: "alpaca", connector: "live:alpaca" }],
    ...over,
  });
  const FIN = {
    ok: true,
    symbol: "AAPL",
    cik: "0000320193",
    company: "Apple Inc.",
    annual: [{ start: "2024-09-29", end: "2025-09-27", days: 363, form: "10-K", filed: "2025-10-31", fy: 2025, fp: "FY", revenue: 416_161_000_000, netIncome: 112_010_000_000, eps: 7.46 }],
    quarterly: [
      { start: "2026-03-29", end: "2026-06-27", days: 90, form: "10-Q", filed: "2026-07-31", fy: 2026, fp: "Q3", revenue: 109_417_000_000, netIncome: -29_789_000_000, eps: 2.02 },
      { start: "2025-12-28", end: "2026-03-28", days: 90, form: "10-Q", filed: "2026-05-01", fy: 2026, fp: "Q2", netIncome: 29_578_000_000 },
    ],
    shares: { value: 14_594_180_000, asOf: "2026-07-17", form: "10-Q", filed: "2026-07-31" },
    concepts: { revenue: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", netIncome: "us-gaap:NetIncomeLoss", eps: "us-gaap:EarningsPerShareDiluted", shares: "dei:EntityCommonStockSharesOutstanding" },
    currency: "USD",
    source: "SEC EDGAR · XBRL company facts",
    filingsUrl: "https://www.sec.gov/edgar/browse/?CIK=320193&owner=exclude",
    latest: { form: "10-Q", filed: "2026-07-31" },
    readAt: "2026-10-22T14:00:00.000Z",
  };

  it("is a part of a US share's drawer and no other's, read once as the drawer opens: a skeleton, then the SEC's words or its figures", async () => {
    const p = page((path) => (path.startsWith("/api/account/financials") ? FIN : {}));
    p.set("A", account());
    p.set("ITEMS", { btc, anth, share: share() });
    expect(p.run('[mkTicker(ITEMS.share), mkTicker({ kind: "stock", base: "brk.b" }), mkTicker(ITEMS.btc), mkTicker(ITEMS.anth), mkTicker({ kind: "stock", base: "0700.HK" })]')).toEqual(["AAPL", "BRK.B", "", "", ""]);
    expect(p.run('[mkDate("2025-09-27"), mkDate("2026-01-05"), mkDate(""), mkDate("soon")]')).toEqual(["27 Sep 2025", "5 Jan 2026", "—", "soon"]);
    // the drawer opens on the share: the part is there, a skeleton, and the account is asked once
    p.run("MKT.open = { item: ITEMS.share, range: '1M', interval: '1h', ipo: [], fin: undefined }");
    let parts = p.run<Record<string, string>>("mkDrawerParts(MKT.open)");
    expect(parts.financials).toContain('<section class="sec" aria-label="Financials"><div class="sec-head"><h2 class="h2">Financials</h2></div>');
    expect(parts.financials).toContain("skel-rows");
    p.run("mkDrawerLoad(MKT.open)");
    expect(p.asked.filter((a) => a.path.startsWith("/api/account/financials")).map((a) => a.path)).toEqual(["/api/account/financials?symbol=AAPL"]);
    p.run("mkDrawerLoad(MKT.open)");
    expect(p.asked.filter((a) => a.path.startsWith("/api/account/financials")).length).toBe(1);
    await settle();
    await settle();
    // a coin, a pre-IPO contract: no part at all, nothing asked
    p.run("MKT.open = { item: ITEMS.btc, range: '1M', interval: '1h', ipo: [], fin: undefined }; mkDrawerLoad(MKT.open)");
    expect(p.run<Record<string, string>>("mkDrawerParts(MKT.open)").financials).toBe("");
    p.run("MKT.open = { item: ITEMS.anth, range: '1M', interval: '1h', ipo: [], fin: undefined }; mkDrawerLoad(MKT.open)");
    expect(p.run<Record<string, string>>("mkDrawerParts(MKT.open)").financials).toBe("");
    expect(p.asked.filter((a) => a.path.startsWith("/api/account/financials")).length).toBe(1);
    // the SEC's refusal, in its words — no contact set: what to set — and no link to filings it did not give
    p.run("MKT.open = { item: ITEMS.share, range: '1M', interval: '1h', ipo: [], fin: { ok: false, refusal: { code: 'E_ACCOUNT_CREDENTIAL', message: 'The SEC asks every reader of EDGAR to say who they are and how to reach them: start the account with SEC_CONTACT set to your email address, and this reads the company\\'s own filings' } } }");
    parts = p.run<Record<string, string>>("mkDrawerParts(MKT.open)");
    expect(parts.financials).toContain('<p class="mk-quiet">The SEC asks every reader of EDGAR to say who they are and how to reach them: start the account with SEC_CONTACT set to your email address, and this reads the company&#39;s own filings.</p>');
    expect(parts.financials).not.toContain("Filings at the SEC");
  });

  it("the Company part: a US share's drawer reads the company's record once, shows the record's facts, its latest reports and its newest filings as links, and says it reads no news site", async () => {
    const CO = {
      ok: true, symbol: "AAPL", cik: "0000320193", name: "Apple Inc.", tickers: ["AAPL"], exchanges: ["Nasdaq"], sic: "3571", sicDescription: "Electronic Computers",
      fiscalYearEnd: { month: 9, day: 27, words: "September 27" }, stateOfIncorporation: "CA", stateOfIncorporationWords: "CA", website: "https://www.apple.com/", investorWebsite: "https://investor.apple.com", category: "Large accelerated filer",
      latest: { annual: { form: "10-K", filed: "2025-10-31", reportDate: "2025-09-27", description: "10-K", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000123/aapl-20250927.htm", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000123/" }, quarterly: { form: "10-Q", filed: "2026-07-31", description: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000081/aapl-20260627.htm", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000081/" } },
      filings: [{ form: "8-K", filed: "2026-07-30", description: "results of operations, exhibits", items: ["2.02", "9.01"], url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000063/aapl-20260730.htm", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000063/" }, { form: "4", filed: "2026-07-01", description: "FORM 4 <b>x</b>", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000050/x.xml", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000050/" }, { form: "10-Q", filed: "2026-05-01", description: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000041/aapl-20260328.htm", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000041/" }, { form: "4", filed: "2026-04-02", description: "FORM 4", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000030/xslF345X05/wk-form4_1.xml", indexUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000030/" }],
      filingsUrl: "https://www.sec.gov/edgar/browse/?CIK=320193&owner=exclude", source: "SEC EDGAR · submissions", readAt: "2026-10-22T14:00:00.000Z",
    };
    const p = page((path) => (path.startsWith("/api/account/company") ? CO : {}));
    p.set("A", account());
    p.set("ITEMS", { btc, share: share() });
    p.run("MKT.open = { item: ITEMS.share, range: '1M', interval: '1h', ipo: [], fin: undefined, co: undefined }");
    let parts = p.run<Record<string, string>>("mkDrawerParts(MKT.open)");
    expect(parts.company).toContain('<section class="sec" aria-label="Company"><div class="sec-head"><h2 class="h2">Company</h2></div>');
    expect(parts.company).toContain("skel-rows");
    p.run("mkDrawerLoad(MKT.open); mkDrawerLoad(MKT.open)");
    expect(p.asked.filter((a) => a.path.startsWith("/api/account/company")).map((a) => a.path)).toEqual(["/api/account/company?symbol=AAPL"]);
    await settle();
    await settle();
    // the figures, drawn from the record as the page keeps it (the other reads' redraws let the open drawer go in this stand-in browser)
    p.run(`MKT.open = { item: ITEMS.share, range: '1M', interval: '1h', ipo: [], fin: undefined, co: ${JSON.stringify(CO)} }`);
    parts = p.run<Record<string, string>>("mkDrawerParts(MKT.open)");
    const html = parts.company!;
    expect(html).toContain('<a class="link mk-fin-link" href="https://www.sec.gov/edgar/browse/?CIK=320193&amp;owner=exclude" target="_blank" rel="noopener noreferrer">All filings ');
    expect(html).toContain("<dt>Listed</dt><dd>Nasdaq · AAPL</dd>");
    expect(html).toContain('<dt>Industry</dt><dd>Electronic Computers <span class="dim">SIC 3571</span></dd>');
    expect(html).toContain("<dt>Fiscal year ends</dt><dd>September 27</dd>");
    expect(html).toContain("<dt>Incorporated in</dt><dd>CA</dd>");
    expect(html).toContain("<dt>Filer</dt><dd>Large accelerated filer</dd>");
    expect(html).toContain('<dt>Site</dt><dd><a class="link" href="https://www.apple.com/" target="_blank" rel="noopener noreferrer">apple.com</a> · <a class="link" href="https://investor.apple.com" target="_blank" rel="noopener noreferrer">investors</a></dd>');
    expect(html).toContain('Annual report 10-K</a> filed 31 Oct 2025 · <a class="link" href="https://www.sec.gov/Archives/edgar/data/320193/000032019326000081/aapl-20260627.htm" target="_blank" rel="noopener noreferrer">Quarterly report 10-Q</a> filed 31 Jul 2026');
    expect(html).toContain('<h3 class="label mk-fin-h">Latest filings</h3><ul class="mk-filings"><li><a class="link" href="https://www.sec.gov/Archives/edgar/data/320193/000032019326000063/aapl-20260730.htm" target="_blank" rel="noopener noreferrer"><b>8-K</b> results of operations, exhibits</a><span class="dim"> · filed 30 Jul 2026</span></li>');
    expect(html).toContain("<b>4</b> FORM 4 &lt;b&gt;x&lt;/b&gt;</a>");
    // a description that only repeats the form is left out
    expect(html).toContain('<b>10-Q</b></a><span class="dim"> · filed 1 May 2026</span>');
    expect(html).toContain('<b>4</b></a><span class="dim"> · filed 2 Apr 2026</span>');
    expect(html).toContain("SEC EDGAR · submissions · what the company itself filed; the account reads no news site");
    // a coin has no Company part and asks nothing; the SEC's refusal is said in its words, without a link to filings it did not give
    p.run("MKT.open = { item: ITEMS.btc, range: '1M', interval: '1h', ipo: [], fin: undefined, co: undefined }; mkDrawerLoad(MKT.open)");
    expect(p.run<Record<string, string>>("mkDrawerParts(MKT.open)").company).toBe("");
    expect(p.asked.filter((a) => a.path.startsWith("/api/account/company")).length).toBe(1);
    p.run("MKT.open = { item: ITEMS.share, range: '1M', interval: '1h', ipo: [], fin: undefined, co: { ok: false, refusal: { code: 'E_VENUE_REJECTED', message: 'SEC EDGAR lists no company under AAPL' } } }");
    parts = p.run<Record<string, string>>("mkDrawerParts(MKT.open)");
    expect(parts.company).toContain('<p class="mk-quiet">SEC EDGAR lists no company under AAPL.</p>');
    expect(parts.company).not.toContain("All filings");
  });

  it("the figures: the fiscal years and the quarters as filed, each row its period and its filing, money short and signed, a dash where the filing tagged nothing, the shares, whose figures they are", () => {
    const p = page(() => ({}));
    p.set("A", account());
    p.set("ITEMS", { share: share() });
    p.run(`MKT.open = { item: ITEMS.share, range: '1M', interval: '1h', ipo: [], fin: ${JSON.stringify(FIN)} }`);
    const html = p.run<Record<string, string>>("mkDrawerParts(MKT.open)").financials;
    expect(html).toContain('<a class="link mk-fin-link" href="https://www.sec.gov/edgar/browse/?CIK=320193&amp;owner=exclude" target="_blank" rel="noopener noreferrer">Filings at the SEC ');
    expect(html).toContain('<h3 class="label mk-fin-h">Fiscal years</h3>');
    expect(html).toContain('<td><b>FY2025</b><span class="why">ended 27 Sep 2025 · 10-K filed 31 Oct 2025</span></td><td class="r">$416B</td><td class="r">$112B</td><td class="r">7.46</td>');
    expect(html).toContain('<h3 class="label mk-fin-h">Quarters</h3>');
    expect(html).toContain('<td><b>Q3 FY2026</b><span class="why">ended 27 Jun 2026 · 10-Q filed 31 Jul 2026</span></td><td class="r">$109B</td><td class="r">−$29.8B</td><td class="r">2.02</td>');
    // a quarter the filing tagged no revenue or earnings for: a dash, never a figure worked out
    expect(html).toContain('<td><b>Q2 FY2026</b><span class="why">ended 28 Mar 2026 · 10-Q filed 1 May 2026</span></td><td class="r"><span class="flat">—</span></td><td class="r">$29.6B</td><td class="r"><span class="flat">—</span></td>');
    expect(html).toContain('<p class="mk-fin-sh"><b>14.6B</b> shares outstanding as of 17 Jul 2026 <span class="dim">(10-Q filed 31 Jul 2026)</span></p>');
    expect(html).toContain('<p class="mk-src">SEC EDGAR · XBRL company facts · in USD · revenue is us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax, net income us-gaap:NetIncomeLoss, earnings a share us-gaap:EarningsPerShareDiluted · latest filing 10-Q filed 31 Jul 2026 · as filed, nothing estimated; a fourth quarter is in the year\'s 10-K</p>');
    // a company with years and no quarters, or shares alone: only what it has
    p.run(`MKT.open.fin = ${JSON.stringify({ ...FIN, quarterly: [], shares: undefined, latest: undefined, concepts: { revenue: "us-gaap:Revenues" } })}`);
    const years = p.run<Record<string, string>>("mkDrawerParts(MKT.open)").financials;
    expect(years).toContain("Fiscal years");
    expect(years).not.toContain("Quarters");
    expect(years).not.toContain("shares outstanding");
    expect(years).toContain('<p class="mk-src">SEC EDGAR · XBRL company facts · in USD · revenue is us-gaap:Revenues · as filed');
    // a link only to the SEC's own site
    p.run(`MKT.open.fin = ${JSON.stringify({ ...FIN, filingsUrl: "https://evil.example/" })}`);
    expect(p.run<Record<string, string>>("mkDrawerParts(MKT.open)").financials).not.toContain("evil.example");
  });
});
