import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";

/** THE HOME DASHBOARD (ui/portfolio.js): the pulse under the net worth — today's change, what waits for the owner, the cash that is ready,
 * the desk's day — and the Markets card of what the account specialises in (US stocks, crypto, perpetuals), run as the page runs them:
 * plain scripts in one global scope after ui/core.js, ui/connect.js and ui/money.js, here in a vm with a stand-in document. What is checked
 * is what the owner reads and presses: each tile's figure and line, the classes' rows in their order, the perpetuals' table with its
 * funding and the owner's own position, the prices polled while the card has rows, the class kept in this browser, and where a press goes */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "connect.js", "money.js", "portfolio.js"];

type Asked = { path: string; method: string; body?: unknown };
function page(opts: { fetch?: (path: string) => Promise<unknown> } = {}) {
  const asked: Asked[] = [];
  const kept = new Map<string, string>();
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" } }, hidden: false },
    location: { hash: "", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
    Owner: { role: "owner", kid: "k1", why: (r: { body?: { refusal?: { message?: string }; error?: string } }) => r.body?.refusal?.message ?? r.body?.error ?? "" },
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
    fetch: async (path: string, init?: { method?: string; body?: string }) => {
      asked.push({ path, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(init.body) } : {}) });
      if (!opts.fetch) return new Promise(() => {});
      const body = await opts.fetch(path);
      return { status: (body as { ok?: boolean })?.ok === false ? 409 : 200, statusText: "", json: async () => body };
    },
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, kept, set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

const NOW = "2026-10-06T12:00:00.000Z";
const AGENT = "0x3a087530887bd175ccc38828ee3776e5b6ea1ac6";
const venue = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, live: true, usd: 0, holdings: [], plugged: true, ...extra });
/** an account as /api/account says it: an exchange that trades, a broker, a wallet, and a paper account the desk trades */
const ACCOUNT = {
  now: NOW,
  liveUsd: 12000,
  inFlightUsd: 0,
  mode: "guard",
  connectLive: { writes: { on: true, capUsd: 250 }, home: "/home/x", options: [] },
  dial: { sessionExpiresAt: "2026-11-05T00:00:00.000Z", sessionEnded: false, maxLeverage: 5, revoked: [] },
  venues: [
    venue("ex", "Exchange", { usd: 9000, trade: { can: true, what: "spot and perpetuals", positions: true }, liveCan: { withdraw: true, transfer: true, swap: true, receive: true } }),
    venue("broker", "Broker", { usd: 2000, trade: { can: true, what: "US stocks" } }),
    venue("wallet", "Wallet", { usd: 1000, trade: { can: true, what: "tokens" } }),
    venue("paper-momentum", "Momentum · paper", { usd: 25000, paper: true, paperStartUsd: 25000, trade: { can: true, what: "spot and perpetuals", positions: true } }),
  ],
  keys: [{ address: AGENT, name: "Claude Code", code: "CC", status: "ok", validUntil: "2026-11-05T00:00:00.000Z", approvedAt: NOW }],
  spend: [],
  subAccounts: [],
  cards: [
    { id: "card-0001", usd: 119.99, reason: "Claude Code asks to buy ETH", hash: "0xabc", kind: "agentLiveOrder", agent: AGENT, agentName: "Claude Code", expiresAt: "2026-10-06T12:40:00.000Z", shown: [{ name: "venue", value: "ex" }] },
    { id: "card-0002", usd: 40, reason: "Claude Code asks to buy SOL", hash: "0xdef", kind: "agentLiveOrder", agent: AGENT, agentName: "Claude Code", expiresAt: "2026-10-06T12:24:00.000Z", shown: [{ name: "venue", value: "ex" }] },
  ],
  asks: [{ id: "ask-0001", agent: AGENT, agentName: "Claude Code", kind: "limit", venue: "ex", usd: "1000", text: "Raise my budget", at: NOW, expiresAt: "2026-10-07T12:00:00.000Z" }],
  memoryAsks: [],
  requests: [],
  intents: [],
  watch: [{ venue: "ex", symbol: "BTC/USDT", at: NOW }],
  health: {},
};
/** what GET /api/account/holdings?cost=1 says of it */
const HOLD = {
  ok: true,
  rows: [
    { key: "crypto:BTC", asset: "BTC", class: "crypto", amount: 0.1, usd: 6000, price: 60000, changePct24h: 2, venues: [{ venue: "ex", venueName: "Exchange", amount: 0.09, usd: 5400 }, { venue: "wallet", venueName: "Wallet", amount: 0.01, usd: 600 }] },
    { key: "stable:USDC", asset: "USDC", class: "stable", amount: 3000, usd: 3000, price: 1, venues: [{ venue: "ex", venueName: "Exchange", amount: 2900, usd: 2900 }, { venue: "wallet", venueName: "Wallet", amount: 100, usd: 100 }] },
    { key: "rwa:USDY", asset: "USDY", class: "rwa", amount: 1000, usd: 1100, price: 1.1, venues: [{ venue: "wallet", venueName: "Wallet", amount: 1000, usd: 1100 }] },
  ],
  money: { readyUsd: 3000, venues: [{ venue: "ex", venueName: "Exchange", usd: 2900, lines: [{ asset: "USDC", usd: 2900 }], tradesHere: true, movesOut: true }, { venue: "wallet", venueName: "Wallet", usd: 100, lines: [{ asset: "USDC", usd: 100 }], tradesHere: true, movesOut: false }] },
  change24h: { usd: 117.65, pct: 0.97, coveredUsd: 9000, ofUsd: 10100, missing: ["rwa:USDY"] },
  missing: [],
  positions: [],
  cost: [],
};
/* one row as GET /api/account/explore lists it */
const row = (key: string, kind: string, base: string, name: string, chg: number, vol: number, at: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({ key, kind, base, name, price: 100, changePct24h: chg, volumeUsd24h: vol, at, ...extra });
const stockAt = (sym: string) => [{ venue: "broker", venueName: "Broker", symbol: sym, connected: true, canTrade: true }, { venue: "standin-stocks-public", venueName: "Public stocks", symbol: sym, public: true, connected: false }];
const perpAt = (sym: string) => [{ venue: "ex", venueName: "Exchange", symbol: sym, connected: true, canTrade: true }];
/** the account's listing: six stocks, three coins, three perpetuals — and a token, a pre-IPO contract and an event the home leaves out */
const EXPLORE = {
  ok: true,
  asOf: "2026-10-06T11:59:00.000Z",
  items: [
    row("stock:NVDA", "stock", "NVDA", "NVIDIA Corporation common stock", 1.19, 29.4e9, stockAt("NVDA"), { price: 181.71 }),
    row("stock:SPY", "stock", "SPY", "SPDR S&P 500 ETF Trust", 0.49, 26e9, stockAt("SPY")),
    row("stock:AAPL", "stock", "AAPL", "Apple Inc. common stock", 1.05, 11e9, stockAt("AAPL")),
    row("stock:TSLA", "stock", "TSLA", "Tesla, Inc. common stock", -3.03, 9e9, stockAt("TSLA")),
    row("coin:BTC", "coin", "BTC", "BTC", 2.97, 5e9, [{ venue: "ex", venueName: "Exchange", symbol: "BTC/USDT", connected: true, canTrade: true }, { venue: "standin-pubex-public", venueName: "Public exchange", symbol: "BTC/USD", public: true, connected: false }], { price: 62466.9 }),
    row("perp:BTC", "perp", "BTC", "BTC perpetual", 2.39, 4.24e9, perpAt("BTC/USDT:USDT"), { price: 62556.8, fundingRate: 0.0001, nextFundingAt: "2026-10-06T16:00:00.000Z" }),
    row("perp:ETH", "perp", "ETH", "ETH perpetual", 3.81, 1.6e9, perpAt("ETH/USDT:USDT"), { price: 2457.41, fundingRate: 0.00008, nextFundingAt: "2026-10-06T16:00:00.000Z" }),
    row("coin:ETH", "coin", "ETH", "ETH", 3.32, 1.25e9, [{ venue: "ex", venueName: "Exchange", symbol: "ETH/USDT", connected: true, canTrade: true }]),
    row("stock:KO", "stock", "KO", "Coca-Cola Company ordinary shares", -0.46, 1e9, stockAt("KO")),
    row("coin:DOGE", "coin", "DOGE", "DOGE", 15.63, 0.85e9, [{ venue: "standin-pubex-public", venueName: "Public exchange", symbol: "DOGE/USD", public: true, connected: false }], { price: 0.12295 }),
    row("stock:NFLX", "stock", "NFLX", "Netflix, Inc. common stock", -0.88, 0.8e9, stockAt("NFLX")),
    row("perp:AVAX", "perp", "AVAX", "AVAX perpetual", -9.36, 0.11e9, [{ venue: "standin-pubperps-public", venueName: "Public perps", symbol: "AVAX/USDC:USDC", public: true, connected: false }, { venue: "paper-momentum", venueName: "Momentum · paper", symbol: "AVAX/USDC:USDC", connected: true, paper: true, canTrade: true }], { price: 24.066, fundingRate: -0.00002, nextFundingAt: "2026-10-06T16:00:00.000Z" }),
    row("rwa:NVDA", "rwa", "NVDA", "NVIDIA stock token", 1.19, 12.4e6, [{ venue: "standin-stock-tokens", venueName: "Stock tokens", symbol: "NVDAx", public: true, connected: false }]),
    row("perp:ANTHROPIC", "perp", "ANTHROPIC", "Anthropic pre-IPO perpetual", 4, 3e6, perpAt("ANTHROPIC/USDT:USDT"), { implied: 2e11, category: "Pre-IPO" }),
    { key: "event:predict:FED", kind: "event", name: "Will the Fed cut in December?", price: 0.62, volumeUsd24h: 85000, at: [{ venue: "predict", venueName: "Predictions", symbol: "FED:YES", connected: true }], outcomes: [] },
  ],
  movers: [],
  closing: [],
  mostTraded: [],
  missing: [],
  notes: [],
};
/** the owner's positions: a long BTC perpetual at the exchange, a short AVAX perpetual on paper, an event contract */
const POSITIONS = {
  ok: true,
  positions: [
    { venue: "ex", symbol: "BTC/USDT:USDT", kind: "perp", side: "long", qty: 0.01, leverage: 3, marginMode: "cross", entryPrice: 60520, markPrice: 62605.4, liquidationPrice: 40649.3, unrealizedUsd: 20.85, usd: 626.05, name: "BTC perpetual" },
    { venue: "paper-momentum", symbol: "AVAX/USDC:USDC", kind: "perp", side: "short", qty: 10, leverage: 2, markPrice: 24, liquidationPrice: 30, unrealizedUsd: -1.2, usd: 240, name: "AVAX perpetual", paper: true },
    { venue: "predict", symbol: "FED:YES", kind: "event", side: "long", qty: 50, markPrice: 0.62, unrealizedUsd: -0.5, usd: 31, name: "Fed cut · Yes" },
  ],
  missing: [],
};
/** the desk as GET /api/account/desk says it, in a live session on the paper account */
const DESK = {
  id: "desk",
  name: "The desk",
  objective: { text: "Ride the majors' momentum on paper", universe: "crypto", venue: "paper-momentum", venueName: "Momentum · paper", hours: 22 },
  session: { state: "live", startedAt: "2026-10-06T10:00:00.000Z", endsAt: "2026-10-07T08:00:00.000Z", hours: 22, cycles: 6, elapsedMs: 360302, remainingMs: 78839698, startEquityUsd: 25000 },
  equity: { nowUsd: 25000.14, startUsd: 25000, changeUsd: 0.14, changePct: 0, mult: 1, points: [] },
  today: { pnlUsd: 0.24, wins: 2, losses: 0, scanned: 12, cleared: 3, executed: 3, closed: 2, lossRoomUsd: 1249.76 },
  open: [{ id: "L-0005", symbol: "SOL/USD", state: "open" }],
  tape: { wins: 2, losses: 0, winRatePct: 100, avgWinPct: 0.2, avgLossPct: 0, closes: [] },
  venue: { id: "paper-momentum", name: "Momentum · paper" },
};

function home(over: Record<string, unknown> = {}, opts: Parameters<typeof page>[0] = {}) {
  const p = page(opts);
  p.set("A", { ...ACCOUNT, ...over });
  p.set("PF.hold", HOLD);
  p.set("PF.mktBody", EXPLORE);
  p.set("PF.desk", DESK);
  p.run('PF.mkt = "all"');
  return p;
}
const ALL = '{ kind: "all", id: "", name: "All accounts" }';
/* the rows of one list, by their keys, in order */
const keysOf = (html: string, list: string) => {
  const sec = html.split(`aria-label="${list}"`)[1]?.split("</section>")[0] ?? "";
  return [...sec.matchAll(/data-k="([^"]+)"/g)].map((m) => m[1]);
};
const tilesOf = (html: string) => [...html.matchAll(/data-pf-tile="([a-z]+)"/g)].map((m) => m[1]);
const tile = (html: string, id: string) => html.split(`data-pf-tile="${id}"`)[1]?.split("data-pf-tile=")[0] ?? "";

describe("the pulse under the net worth", () => {
  it("draws four tiles in their order — today's change from the holdings' own 24 hours, what waits with its soonest deadline and a Review, the cash that is ready with Earn… where a venue earns, the desk — each a card", () => {
    const p = home();
    const html = String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`));
    expect(tilesOf(html)).toEqual(["today", "waiting", "cash", "desk"]);
    expect(html.match(/class="pf-tile( warm)?"/g)).toHaveLength(4);
    // today: the figure in its colour, the percent, how much of what is held the 24 hours cover (a token no venue spoke for is left out)
    const today = tile(html, "today");
    expect(today).toContain('<span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> $117.65</span>');
    expect(today).toContain("<b>0.97%</b> · of $9,000.00 priced · last 24 hours");
    // what waits: two cards and an ask, the soonest card's deadline in New York time, said once; a warm tile with Review
    const waiting = tile(html, "waiting");
    expect(html).toContain('class="pf-tile warm" data-pf-tile="waiting"');
    expect(waiting).toContain('<div class="pf-tile-n">3</div>');
    expect(waiting).toContain(`2 cards · 1 ask · answer by ${p.run('nyTime("2026-10-06T12:24:00.000Z")')}`);
    expect(waiting).toContain('data-pf-act="waiting"');
    // the cash that is ready, in the words the Cash ready card used to say; Earn… only where a venue earns and the sheet is on the page
    const cash = tile(html, "cash");
    expect(cash).toContain("$3,000.00");
    expect(cash).toContain("$2,900.00 can move between your accounts.");
    expect(cash).not.toContain('data-pf-act="earn"');
    p.run('globalThis.openEarn = () => {}; A.venues[0].earn = { can: true, what: "Simple Earn" }');
    expect(tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`)), "cash")).toContain('data-pf-act="earn"');
    // a browser that only looks finds Earn… disabled
    expect(tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, false)`)), "cash")).toMatch(/data-pf-act="earn"[^>]*disabled/);
  });

  it("follows the lens and the book: today from each row's own 24 hours under a venue, nothing waiting said as nothing, the paper book said as paper", () => {
    const p = home();
    const ex = '{ kind: "venue", id: "ex", name: "Exchange" }';
    const rows = `pfRowsIn(PF.hold.rows, pfVenueIn(${ex}))`;
    const html = String(p.run(`pfPulseHtml(${ex}, pfVenueIn(${ex}), ${rows}, true)`));
    // BTC at the exchange: $5,400 now, 2% up on the day → $105.88 made; the dollars count one for one, so the 24 hours cover it all
    expect(tile(html, "today")).toContain("$105.88");
    expect(tile(html, "today")).toContain("on $8,300.00 · last 24 hours");
    // nothing waiting
    p.run("A.cards = []; A.asks = []");
    const quietAll = String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`));
    const quiet = tile(quietAll, "waiting");
    expect(quiet).toContain("Nothing waits for you.");
    expect(quiet).not.toContain('data-pf-act="waiting"');
    expect(quietAll).toContain('class="pf-tile" data-pf-tile="waiting"');
    // the paper book: both kinds are connected and the owner picked Paper on the Net worth card
    p.run('PF.book = "paper"; PF.hold = { ...PF.hold, change24h: { usd: -5, pct: -0.02, coveredUsd: 25000, ofUsd: 25000, missing: [] }, money: { readyUsd: 20000, venues: [{ venue: "paper-momentum", venueName: "Momentum · paper", usd: 20000, lines: [], tradesHere: true, movesOut: false }] } }');
    const paper = String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`));
    expect(tile(paper, "today")).toContain('<span class="tag paper">Paper</span>');
    expect(tile(paper, "today")).toContain("$5.00");
    expect(tile(paper, "cash")).toContain('<span class="tag paper">Paper</span>');
    expect(tile(paper, "cash")).toContain("$20,000.00");
    // before the holdings read: a skeleton; a read that was refused says so
    p.run('PF.book = ""; PF.hold = null; PF.holdErr = ""');
    expect(tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), null, true)`)), "today")).toContain('class="skel"');
    p.run('PF.holdErr = "The account did not answer."');
    expect(tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), null, true)`)), "cash")).toContain("The account did not answer.");
  });

  it("the desk's tile: a skeleton before the read, Hire the desk with none, then today's result, the session's standing, what is open, the time left and the way to the Superagent — Paper where its venue is", () => {
    const p = home();
    p.run("PF.desk = undefined");
    expect(tile(String(p.run("pfPulseHtml({ kind: 'all', id: '', name: 'All accounts' }, pfVenueIn({ kind: 'all', id: '', name: 'All accounts' }), PF.hold.rows, true)")), "desk")).toContain('class="skel"');
    p.run("PF.desk = null");
    const none = tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`)), "desk");
    expect(none).toContain("Not hired");
    expect(none).toContain('data-pf-act="desk"');
    expect(none).toContain("Hire the desk ›");
    p.set("PF.desk", DESK);
    const live = tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`)), "desk");
    expect(live).toContain("The desk · today");
    expect(live).toContain("$0.24");
    expect(live).toContain("2 wins · 0 losses · 1 open · 21h 54m left");
    expect(live).toContain('<span class="lv-live">live</span>');
    expect(live).toContain('<span class="tag paper">Paper</span>');
    expect(live).toContain('href="#/trade?mode=superagent&amp;venue=paper-momentum"');
    // the session over, or none yet
    p.run('PF.desk.session.state = "ended"');
    expect(tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`)), "desk")).toContain("session ended");
    p.run("PF.desk.session = null");
    const idle = tile(String(p.run(`pfPulseHtml(${ALL}, pfVenueIn(${ALL}), PF.hold.rows, true)`)), "desk");
    expect(idle).toContain("Hired, not running: start a session on the Superagent.");
    expect(idle).toContain('<span class="flat">—</span>');
    // a span of time, short
    expect(p.run("[pfLeft(90000), pfLeft(25 * 3600000), pfLeft(78839698), pfLeft(-5)]")).toEqual(["2m", "1d 1h", "21h 54m", "0m"]);
  });

  it("the desk's day is read with the pane, the explore list once a minute, and the positions only where the perpetuals' table shows", async () => {
    const asked: string[] = [];
    const p = home({}, { fetch: async (path) => (asked.push(path), path.startsWith("/api/account/desk") ? { ok: true, desk: DESK } : path.startsWith("/api/account/explore") ? EXPLORE : path.startsWith("/api/account/positions") ? POSITIONS : { ok: true }) });
    p.run("PF.desk = undefined; PF.mktBody = null; pfRead()");
    await settle();
    await settle();
    expect(asked).toContain("/api/account/desk");
    expect(asked).toContain("/api/account/explore?limit=200");
    expect(asked).not.toContain("/api/account/positions");
    expect(p.run("PF.desk.objective.venue")).toBe("paper-momentum");
    expect(p.run("PF.mktBody.items.length")).toBe(EXPLORE.items.length);
    p.run('PF.mkt = "perps"; pfRead()');
    await settle();
    expect(asked).toContain("/api/account/positions");
  });
});

describe("the Markets card", () => {
  it("keeps to US stocks, crypto and perpetuals — never a token, a pre-IPO contract or an event — All or one class: the biggest moves by the size of the move, the most traded by the day's dollars, five each, a star on a watched market, a perpetual's funding under its name", () => {
    const p = home();
    const html = String(p.run(`pfMarketsHtml(${ALL})`));
    expect(html).not.toContain("rwa:NVDA");
    expect(html).not.toContain("ANTHROPIC");
    expect(html).not.toContain("event:");
    expect(html).toContain('data-pf-mkt="all" data-fk="pf-mkt:all" aria-pressed="true"');
    for (const [v, t] of [["stocks", "US stocks"], ["crypto", "Crypto"], ["perps", "Perps"]]) expect(html).toContain(`data-pf-mkt="${v}" data-fk="pf-mkt:${v}" aria-pressed="false">${t}</button>`);
    expect(keysOf(html, "Biggest moves")).toEqual(["coin:DOGE", "perp:AVAX", "perp:ETH", "coin:ETH", "stock:TSLA"]);
    expect(keysOf(html, "Most traded")).toEqual(["stock:NVDA", "stock:SPY", "stock:AAPL", "stock:TSLA", "coin:BTC"]);
    // the watched BTC carries its star; its price is the exchange's fresh one (data-q, ticked by the poll); DOGE, listed only publicly, keeps the listing's price
    expect(html).toContain('<b>BTC<span class="pf-mk-star" title="Watched"><span aria-hidden="true">★</span><span class="sr"> watched</span></span></b>');
    expect(html).toContain('data-q="ex|BTC/USDT" data-fmt="usd">$62,466.90</span>');
    expect(html).toMatch(/data-k="coin:DOGE">(?:(?!data-q).)*<span class="pf-mk-px">\$0\.123<\/span>/);
    // a perpetual's funding under its name, a stock's company without its share-class words, a coin's venue
    expect(html).toContain('<span class="pf-mk-sub">Perpetual · funding +0.0080%</span>');
    expect(html).toContain('<span class="pf-mk-sub">NVIDIA Corporation</span>');
    expect(html).toContain('<span class="pf-mk-sub">Exchange</span>');
    // the move as a chip, the volume on the most traded, the way to Markets in that order and to all of them
    expect(html).toContain('<span class="pf-mk-r"><span class="pf-mk-vol">$29.4B</span><span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> 1.2%</span></span>');
    expect(p.run("[pfVol(4241830156), pfVol(29.4e9), pfVol(250684532), pfVol(12400), pfVol(950), pfVol(undefined)]")).toEqual(["$4.2B", "$29.4B", "$251M", "$12.4k", "$950", "—"]);
    expect(html).toContain('href="#/markets?sort=movers"');
    expect(html).toContain('href="#/markets">All markets →</a>');
    expect(html).toContain(`listed ${p.run('nyTime("2026-10-06T11:59:00.000Z")')}`);
    // every row is a press to the market
    expect(html.match(/data-pf-act="market"/g)).toHaveLength(10);
    expect(p.run("PF.mkRows.length")).toBe(10);
    // one class: six stocks, five a list, the lists sorted their own way; the links keep the class
    p.run('PF.mkt = "stocks"');
    const stocks = String(p.run(`pfMarketsHtml(${ALL})`));
    expect(keysOf(stocks, "Biggest moves")).toEqual(["stock:TSLA", "stock:NVDA", "stock:AAPL", "stock:NFLX", "stock:SPY"]);
    expect(keysOf(stocks, "Most traded")).toEqual(["stock:NVDA", "stock:SPY", "stock:AAPL", "stock:TSLA", "stock:KO"]);
    expect(stocks).toContain('<span class="pf-mk-sub">Coca-Cola Company</span>');
    expect(stocks).toContain('href="#/markets?tab=stocks&amp;sort=movers"');
    expect(stocks).toContain('href="#/markets?tab=stocks">All markets →</a>');
    p.run('PF.mkt = "crypto"');
    expect(keysOf(String(p.run(`pfMarketsHtml(${ALL})`)), "Biggest moves")).toEqual(["coin:DOGE", "coin:ETH", "coin:BTC"]);
    // a fresh quote this page has is what a row draws
    p.run('globalThis.mkFresh = (pair) => (pair === "ex|BTC/USDT" ? { price: 63000 } : null); globalThis.mkFmt = (m) => "$" + m.price');
    expect(String(p.run(`pfMarketsHtml(${ALL})`))).toContain('data-q="ex|BTC/USDT" data-fmt="usd">$63000</span>');
    // before the read a skeleton, a refusal in its words, and nothing listed said as nothing
    p.run("PF.mktBody = null");
    expect(String(p.run(`pfMarketsHtml(${ALL})`))).toContain('class="skel-rows"');
    p.run('PF.mktErr = "Markets are closed to this browser."');
    expect(String(p.run(`pfMarketsHtml(${ALL})`))).toContain('<div class="msg no">Markets are closed to this browser.</div>');
    p.run('PF.mktErr = ""; PF.mktBody = { ok: true, items: [] }; PF.mkt = "all"');
    expect(String(p.run(`pfMarketsHtml(${ALL})`))).toContain("No stock, coin or perpetual is listed here yet.");
    p.run('PF.mkt = "perps"');
    expect(String(p.run(`pfMarketsHtml(${ALL})`))).toContain("No perpetual is listed here yet.");
  });

  it("Perps is a table of its own, busiest first: the mark, the 24-hour move, the funding with its next payment, the day's volume, and Yours — side, size, leverage, how far the mark is from liquidation, what it is up or down, Paper where it is; a dash with no position", () => {
    const p = home();
    p.set("PF.pos", POSITIONS);
    p.run('PF.mkt = "perps"');
    const html = String(p.run(`pfMarketsHtml(${ALL})`));
    expect(html).toContain('<table class="t pf-perps-t">');
    for (const h of ["Market", "Mark", "24h", "Funding", "24h volume", "Yours"]) expect(html).toContain(`<th scope="col"${h === "Market" || h === "Yours" ? "" : ' class="r"'}>${h}</th>`);
    expect([...html.matchAll(/<tr class="click" data-pf-act="market" data-i="(\d+)" data-k="([^"]+)">/g)].map((m) => [m[1], m[2]])).toEqual([["0", "perp:BTC"], ["1", "perp:ETH"], ["2", "perp:AVAX"]]);
    expect(p.run("PF.mkRows.map((x) => x.key)")).toEqual(["perp:BTC", "perp:ETH", "perp:AVAX"]);
    // BTC: the exchange's fresh mark, funding +0.0100% paid next at 16:00 UTC said in New York time, $4.2B, the owner's long
    expect(html).toContain('data-q="ex|BTC/USDT:USDT" data-fmt="usd">$62,556.80</span>');
    expect(html).toContain(`<span class="pf-funding">+0.0100%</span><span class="why">next ${p.run('nyTime("2026-10-06T16:00:00.000Z")')}</span>`);
    expect(html).toContain("$4.2B");
    expect(html).toContain('<span class="pf-yours"><b>long</b> 0.01 · 3x</span><span class="why">liq 35.1% below · <span class="up"><span aria-hidden="true">▲</span><span class="sr">up</span> $20.85</span></span>');
    // AVAX: a short on paper, its liquidation above the mark, the funding negative
    expect(html).toContain('<span class="pf-yours"><b>short</b> 10 · 2x <span class="tag paper">Paper</span></span><span class="why">liq 25.0% above · <span class="down"><span aria-hidden="true">▼</span><span class="sr">down</span> $1.20</span></span>');
    expect(html).toContain('<span class="pf-funding">−0.0020%</span>');
    // ETH: no position of the owner's
    const eth = html.split('data-k="perp:ETH"')[1]?.split("</tr>")[0] ?? "";
    expect(eth).toContain('<span class="flat">—</span>');
    expect(eth).not.toContain("pf-yours");
    // the star, the venue under the name, the note on what funding and Yours are
    // the perpetual is not the watched market (that is the coin's BTC/USDT): no star; its venue under its name
    expect(html).toContain('<b>BTC</b><span class="dim">Perpetual · Exchange</span>');
    expect(html).not.toContain("pf-mk-star");
    expect(html).toContain('<span class="dim">Perpetual · Public perps</span>');
    expect(html).toContain("Funding passes between longs and shorts each interval as the venue reports it: positive, longs pay.");
    // before the positions read, every Yours is a dash; a funding the venue does not say is one too
    p.run("PF.pos = null; PF.mktBody.items[5].fundingRate = undefined");
    const bare = String(p.run(`pfMarketsHtml(${ALL})`));
    expect(bare).not.toContain("pf-yours");
    expect(bare.split('data-k="perp:BTC"')[1]?.split("</tr>")[0]).toContain('<td class="r"><span class="flat">—</span></td>');
    // the distance to liquidation: below the mark for a long, above for a short, none without both prices
    expect(p.run("[pfLiqDist({ markPrice: 100, liquidationPrice: 80 }), pfLiqDist({ markPrice: 100, liquidationPrice: 125 }), pfLiqDist({ markPrice: 100 }), pfLiqDist({ markPrice: 0, liquidationPrice: 5 })]")).toEqual([-20, 25, null, null]);
  });

  it("asks the rows' fresh prices every five seconds while the Portfolio shows — the markets at connected venues, at most twelve — writes them where Markets keeps quotes and ticks every price on the page; nothing from another pane or out of view", async () => {
    const p = home({}, { fetch: async (path) => (path.startsWith("/api/account/quotes") ? { ok: true, quotes: [{ venue: "ex", symbol: "BTC/USDT", market: { price: 63000 } }, { venue: "broker", symbol: "NVDA", market: { price: 182 } }] } : { ok: true }) });
    p.run(`pfMarketsHtml(${ALL})`);
    // the rows' markets in the rows' order, each once (TSLA is in both lists), none for DOGE (listed only publicly)
    const PAIRS = ["paper-momentum|AVAX/USDC:USDC", "ex|ETH/USDT:USDT", "ex|ETH/USDT", "broker|TSLA", "broker|NVDA", "broker|SPY", "broker|AAPL", "ex|BTC/USDT"];
    expect(p.run("pfMkPairs()")).toEqual(PAIRS);
    // a watch with rows arms the poll; none disarms it
    p.run("pfMkWatch()");
    expect(p.run("PF.mkTimer")).not.toBe(0);
    p.run("clearTimeout(PF.mkTimer); PF.mkRows = []; pfMkWatch()");
    expect(p.run("PF.mkTimer")).toBe(0);
    // a tick: the read, the quotes kept where Markets keeps them, every price ticked, the next tick armed
    p.run(`pfMarketsHtml(${ALL}); ROUTE.tab = "portfolio"; globalThis.MKT = { quotes: new Map() }; var TICKED = 0; globalThis.mkPrices = () => TICKED++`);
    await p.run("pfMkTick()");
    expect(p.asked.map((a) => a.path)).toEqual([`/api/account/quotes?pairs=${encodeURIComponent(PAIRS.join(","))}`]);
    expect(p.run('MKT.quotes.get("ex|BTC/USDT").market.price')).toBe(63000);
    expect(p.run("TICKED")).toBe(1);
    expect(p.run("PF.mkTimer")).not.toBe(0);
    p.run("clearTimeout(PF.mkTimer); PF.mkTimer = 0");
    // from another pane, or out of view: nothing asked
    p.run('ROUTE.tab = "markets"');
    await p.run("pfMkTick()");
    p.run('ROUTE.tab = "portfolio"; document.hidden = true');
    await p.run("pfMkTick()");
    expect(p.asked).toHaveLength(1);
    expect(p.run("PF.mkTimer")).toBe(0);
    // at most twelve markets a read
    p.run('document.hidden = false; PF.mkRows = Array.from({ length: 20 }, (_, i) => ({ key: "coin:X" + i, kind: "coin", at: [{ venue: "ex", symbol: "X" + i + "/USDT", connected: true }] }))');
    expect(p.run("pfMkPairs().length")).toBe(12);
  });

  it("keeps the class chosen in this browser and reads it back; Review goes to the callout; a row opens the market's drawer where the page has one, else Markets in that class", () => {
    const p = home();
    expect(p.run("pfMktKept()")).toBe("all");
    p.run('pfMktKeep("perps")');
    expect(p.kept.get("openpaper-home-markets")).toBe("perps");
    expect(p.run("pfMktKept()")).toBe("perps");
    p.kept.set("openpaper-home-markets", "bonds");
    expect(p.run("pfMktKept()")).toBe("all");
    // a row: the drawer
    p.run(`pfMarketsHtml(${ALL}); var OPENED = []; globalThis.openMarket = (it) => OPENED.push(it.key)`);
    p.run('pfAct("market", { i: "0" })');
    expect(p.run("OPENED")).toEqual(["coin:DOGE"]);
    // no drawer on this page: Markets, in the class
    p.run('globalThis.openMarket = undefined; PF.mkt = "perps"; pfAct("market", { i: "99" })');
    expect(p.run("location.hash")).toBe("#/markets?tab=perps");
    // Review scrolls to the callout
    p.run('var SCROLLED = []; document.getElementById = (id) => ({ querySelector: (sel) => (id === "pane-portfolio" && sel === ".pf-wait" ? { scrollIntoView: (o) => SCROLLED.push(o.block) } : null) }); pfAct("waiting", {})');
    expect(p.run("SCROLLED")).toEqual(["start"]);
  });

  it("the home's parts stand in their order on a connected account, and the seg's classes are the four", () => {
    const src = readFileSync(`${UI}portfolio.js`, "utf8");
    const full = src.slice(src.indexOf('data-pf="full"'), src.indexOf("</div></div>';", src.indexOf('data-pf="full"')));
    expect([...full.matchAll(/data-pf-part="([a-z]+)"/g)].map((m) => m[1])).toEqual(["steps", "worth", "pulse", "markets", "live", "quick", "table", "waiting", "agents", "alloc"]);
    const p = home();
    expect(p.run("PF_MKT.map((x) => x[0])")).toEqual(["all", "stocks", "crypto", "perps"]);
    expect(p.run("PF_MKT.map((x) => x[1])")).toEqual(["All", "US stocks", "Crypto", "Perps"]);
  });
});
