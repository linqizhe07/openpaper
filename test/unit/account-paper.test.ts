import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { byAsset } from "../../src/portfolio/account/holdings.ts";
import { readJournal } from "../../src/portfolio/account/journal.ts";
import { networthPath, paperNetworthPath } from "../../src/portfolio/account/networth.ts";
import { fromEt, usClock } from "../../src/portfolio/account/calendar.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { register, type LiveDeps } from "../../src/portfolio/live/index.ts";
import { liquidationPriceOf, paperBookPath, paperDir, type PaperBook } from "../../src/portfolio/live/paper.ts";
import { readLike, type Listing, type PublicSource } from "../../src/portfolio/live/public-markets.ts";
import { hlPerpSteps } from "../../src/portfolio/live/hl-rules.ts";
import type { LiveTrader, Market, OrderState, Position } from "../../src/portfolio/live/trade.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";
import { cents } from "../../src/portfolio/words.ts";

/** A PAPER ACCOUNT on the account (LiveSource.paper): a venue's own test environment beside a real one, both stand-ins that speak the
 * trader's shape. What the account does with it: its row says paper and its balance is not money (not in the totals, the holdings, the
 * net worth curve); an order there goes through the same door — the owner's signature or an agent's limit, the mode — and not through the
 * server's real-money cap; its orders and statement lines say paper; Markets keeps its line after the real venue's and never takes a row's
 * price from it; the comparison leaves it out; its positions say paper. */
type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const DAY = 86_400_000;
const START = Date.parse("2026-10-12T15:00:00Z");
const REAL = 5_000_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");

const PERP = (price: number, extra: Partial<Market> = {}): Market => ({ symbol: "ETH/USDT:USDT", name: "ETH perpetual", kind: "perp", base: "ETH", quote: "USDT", price, bid: price - 1, ask: price + 1, minQty: 0.01, qtyStep: 0.01, priceStep: 0.1, open: true, types: ["market", "limit"], tifs: ["gtc", "ioc"], reduceOnly: true, volumeUsd24h: 1_000_000_000, changePct24h: 1.5, ...extra });
/** a perpetual only the paper venue lists */
const XYZ: Market = { ...PERP(42), symbol: "XYZ/USDT:USDT", name: "XYZ perpetual", base: "XYZ", volumeUsd24h: 7 };

function traderOf(markets: Record<string, Market>, positions: Position[]): LiveTrader {
  const states = new Map<string, OrderState>();
  let n = 0;
  return {
    can: true,
    what: "perpetuals",
    async markets(q) {
      const all = Object.values(markets);
      const Q = q.trim().toUpperCase();
      return (Q ? all.filter((m) => m.symbol.toUpperCase().includes(Q) || m.base.toUpperCase().includes(Q)) : all).map((m) => ({ ...m }));
    },
    async market(symbol) {
      return markets[symbol] ? { ...markets[symbol]! } : no("E_VENUE_REJECTED", { venue: "standin", message: `no market ${symbol}` });
    },
    async place(o) {
      const ref = `o-${++n}`;
      const s: OrderState = o.type === "market" ? { ref, status: "filled", filledQty: o.qty, avgPrice: markets[o.symbol]?.price ?? 0, native: {} } : { ref, status: "open", filledQty: 0, native: {} };
      states.set(ref, s);
      return s;
    },
    async cancel(ref) {
      return { ...states.get(ref)!, status: "canceled" };
    },
    async status(ref) {
      return states.get(ref)!;
    },
    async positions() {
      return positions.map((p) => ({ ...p }));
    },
  };
}
const REAL_T = traderOf({ [PERP(3000).symbol]: PERP(3000) }, [{ symbol: "ETH/USDT:USDT", name: "ETH perpetual", kind: "perp", side: "long", qty: 0.5, entryPrice: 2900, markPrice: 3000, usd: 1500, unrealizedUsd: 50, native: {} }]);
const PAPER_T = traderOf({ [PERP(3100).symbol]: PERP(3100), [XYZ.symbol]: XYZ }, [{ symbol: "ETH/USDT:USDT", name: "ETH perpetual", kind: "perp", side: "short", qty: 2, entryPrice: 3200, markPrice: 3100, usd: 6200, unrealizedUsd: 200, native: {} }]);

register({ kind: "standin-paper-real", label: "a real stand-in", needs: "key-file", example: "", venues: [], async open(req) {
  return { source: { name: req.label || "Real Ex", kind: "cex", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDT", amount: 5000, usd: 5000 }], trader: REAL_T, readOnlyBecause: "a stand-in moves no money" } as never, first: [{ asset: "USDT", amount: 5000, usd: 5000 }], summary: "connected" };
} });
register({ kind: "standin-paper-paper", label: "a paper stand-in", needs: "key-file", example: "", venues: [], async open(req) {
  return { source: { name: req.label || "Paper Ex", kind: "cex", reference: "standin", via: "a stand-in's test environment", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDC", amount: 5000, usd: 5000 }], trader: PAPER_T, readOnlyBecause: "a paper account: its balance is not money", paper: true } as never, first: [{ asset: "USDC", amount: 5000, usd: 5000 }], summary: "connected" };
} });

/* a broker's stand-in whose share is out of its regular session (the market's own session says so), to see a market order said as queued */
const AAPL_CLOSED: Market = { symbol: "AAPL", name: "Apple", kind: "stock", base: "AAPL", quote: "USD", price: 250, bid: 249.9, ask: 250.1, minQty: 0.01, qtyStep: 0.01, priceStep: 0.01, open: true, types: ["market", "limit"], session: { open: false, phase: "after", extendedHours: true } };
register({ kind: "standin-paper-broker", label: "a broker stand-in", needs: "key-file", example: "", venues: [], async open(req) {
  return { source: { name: req.label || "Broker", kind: "broker", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USD", amount: 5000, usd: 5000 }], trader: traderOf({ AAPL: AAPL_CLOSED }, []), readOnlyBecause: "a stand-in moves no money" } as never, first: [{ asset: "USD", amount: 5000, usd: 5000 }], summary: "connected" };
} });

/* two stand-ins for the funding a venue lists (LiveTrader.funding): one that says its perpetuals' hours, one whose venue does not answer */
const FUND_T: LiveTrader = { ...traderOf({}, []), async funding(o) {
  const all = [
    { at: "2026-10-20T15:00:00.000Z", symbol: "BTC/USDC:USDC", side: "long" as const, qty: 0.5, rate: 0.0000125, usd: 0.51 },
    { at: "2026-10-20T17:00:00.000Z", symbol: "BTC/USDC:USDC", side: "long" as const, qty: 0.5, rate: 0.0000125, usd: 0.52 },
  ];
  // newest first, as a venue answers it
  return all.reverse().slice(0, o.limit);
} };
const MUTE_T: LiveTrader = { ...traderOf({}, []), async funding() {
  return no("E_VENUE_UNREACHABLE", { venue: "mute", message: "Mute Ex did not answer" });
} };
register({ kind: "standin-funding", label: "a venue that lists funding", needs: "key-file", example: "", venues: [], async open(req) {
  return { source: { name: req.label || "Fund Ex", kind: "cex", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDC", amount: 100, usd: 100 }], trader: FUND_T, readOnlyBecause: "a stand-in" } as never, first: [{ asset: "USDC", amount: 100, usd: 100 }], summary: "connected" };
} });
register({ kind: "standin-funding-mute", label: "a venue whose funding does not answer", needs: "key-file", example: "", venues: [], async open(req) {
  return { source: { name: req.label || "Mute Ex", kind: "cex", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDC", amount: 100, usd: 100 }], trader: MUTE_T, readOnlyBecause: "a stand-in" } as never, first: [{ asset: "USDC", amount: 100, usd: 100 }], summary: "connected" };
} });

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

async function boot(o: { writes?: boolean; home?: string; sources?: PublicSource[]; connect?: boolean; nonceFrom?: number; at?: number; clock?: number } = {}) {
  const home = o.home ?? mkdtempSync(join(tmpdir(), "account-paper-"));
  if (!o.home) homes.push(home);
  let n = o.nonceFrom ?? 0;
  const liveDeps: Partial<LiveDeps> = { clock: () => o.clock ?? REAL, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  // a later run on the same home comes later by the clock, as a restart does
  const svc = await PortfolioService.create({ home, now: () => new Date(START + (o.at ?? 0)).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: o.sources ?? [], ...(o.writes === false ? {} : { liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" } }), account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
  const engine = svc.account!;
  const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + ++n } as OwnerAction));
  const ag = async (a: NoNonce<AgentAction>) => svc.exchange(await signAgent(cc, { ...a, nonce: START + ++n } as AgentAction));
  if (o.connect !== false)
    for (const [venue, connector, label] of [["real", "live:standin-paper-real", "Real Ex"], ["paper", "live:standin-paper-paper", "Paper Ex"]] as const) {
      const r = await own({ type: "connectVenue", venue, connector, label, credentialRef: "" });
      if (isRefusal(r)) throw new Error(r.message);
    }
  /** what the page does: prepare, then sign exactly what came back */
  const order = async (venue: string, draft: Record<string, unknown>) => {
    const p = await engine.prepare({ type: "liveOrder", venue, ...draft });
    if (isRefusal(p)) return p;
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveOrder" }>;
    return own(rest as NoNonce<OwnerAction>);
  };
  return { svc, engine, home, own, ag, order };
}
const code = (o: Outcome | Refusal): string => (isRefusal(o) ? o.code : o.kind);

describe("a Hyperliquid perpetual on paper: Hyperliquid's own order rules", () => {
  it("keeps Hyperliquid's rules as its listing says them — a size in its lot, a price on its tick, $10 at least, refused before anything is signed — and a close of the WHOLE position is always taken, whatever its size and worth: one opened under another step, or worth less than $10 now, is never stranded; a close of part of one keeps the rules", async () => {
    // Hyperliquid's BTC perpetual as its listing says it — first without its rules (a position opened before they were said), then with them
    const perp: Listing = { symbol: "BTC-PERP", name: "BTC perpetual on Hyperliquid", kind: "perp", base: "BTC", quote: "USDC", price: 60000, bid: 59999, ask: 60001, open: true, types: [], volumeUsd24h: 2e9, maxLeverage: 40 } as Listing;
    const hl: PublicSource = { id: "hyperliquid", name: "Hyperliquid", kind: "exchange", connectTo: "hyperliquid-trade", connector: "live:hyperliquid-trade", listings: async (q) => [perp].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, engine, own, order, home } = await boot({ sources: [hl], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const book = () => JSON.parse(readFileSync(paperBookPath(home, "paper-1"), "utf8")) as PaperBook;
    // 0.000123 BTC, worth $7.38: on the paper account's own step, and over its dollar, before Hyperliquid's rules were said
    expect(code(await order("paper-1", { symbol: "BTC-PERP", side: "buy", orderType: "market", qty: "0.000123" }))).toBe("order");
    expect(book().positions["BTC-PERP"]).toMatchObject({ side: "long", qty: 0.000123 });
    // Hyperliquid's rules said now (szDecimals 5 at 60,000): sizes of 0.00001 BTC, whole-dollar prices, $10 at least
    Object.assign(perp, hlPerpSteps(5, 60000));
    const why = async (draft: Record<string, unknown>) => {
      const p = await engine.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC-PERP", side: "buy", ...draft });
      return isRefusal(p) ? p.message : "prepared";
    };
    expect(await why({ orderType: "market", qty: "0.0001" })).toBe("Paper account: the smallest order in BTC perpetual on Hyperliquid is worth $10.00");
    expect(await why({ orderType: "market", qty: "0.000215" })).toBe("Paper account: a size in BTC perpetual on Hyperliquid moves in steps of 0.00001 BTC");
    expect(await why({ orderType: "limit", qty: "0.001", limitPrice: "59000.5" })).toBe("Paper account: a price in BTC perpetual on Hyperliquid moves in steps of 1");
    expect(await why({ orderType: "limit", qty: "0.001", limitPrice: "59000" })).toBe("prepared");
    // the whole position closed — off the lot, and worth less than $10 — is taken at its own size
    const close = await engine.prepare({ type: "liveClose", venue: "paper-1", symbol: "BTC-PERP" });
    if (isRefusal(close)) throw new Error(close.message);
    const { nonce: _n, ...rest } = close.action as Extract<OwnerAction, { type: "liveClose" }>;
    expect(code(await own(rest as NoNonce<OwnerAction>))).toBe("order");
    expect(book().positions["BTC-PERP"]).toBeUndefined();
    // a position worth $12 that falls to $8: closed whole, it is taken; a part of it under $10 is not
    expect(code(await order("paper-1", { symbol: "BTC-PERP", side: "buy", orderType: "market", qty: "0.0002" }))).toBe("order");
    Object.assign(perp, { price: 40000, bid: 39999, ask: 40001 });
    const part = await engine.prepare({ type: "liveClose", venue: "paper-1", symbol: "BTC-PERP", qty: "0.0001" });
    expect(isRefusal(part) && part.message).toBe("Paper account: the smallest order in BTC perpetual on Hyperliquid is worth $10.00");
    const whole = await engine.prepare({ type: "liveClose", venue: "paper-1", symbol: "BTC-PERP" });
    expect(isRefusal(whole) ? whole.message : "prepared").toBe("prepared");
    void svc;
  });
});

describe("the funding the perpetuals paid and received (GET /api/account/funding)", () => {
  it("reads every venue that lists it, newest first with each line's venue — a paper account's said so — and names the venues that could not be read in their words; one venue alone where asked; a venue that lists none says so; a limit is a count, 1 to 500", async () => {
    const { svc, own } = await boot({ sources: [] });
    for (const [venue, connector, label] of [["fund", "live:standin-funding", "Fund Ex"], ["mute", "live:standin-funding-mute", "Mute Ex"]] as const) {
      const r = await own({ type: "connectVenue", venue, connector, label, credentialRef: "" });
      if (isRefusal(r)) throw new Error(r.message);
    }
    const all = await svc.allFunding();
    if (isRefusal(all)) throw new Error(all.message);
    expect(all.lines.map((l) => [l.at.slice(11, 16), l.venue, l.venueName, l.usd])).toEqual([["17:00", "fund", "Fund Ex", 0.52], ["15:00", "fund", "Fund Ex", 0.51]]);
    expect(all.missing).toEqual([{ venue: "mute", venueName: "Mute Ex", why: "Mute Ex did not answer", code: "E_VENUE_UNREACHABLE", part: "funding" }]);
    expect(await svc.allFunding({ venue: "real" })).toMatchObject({ code: "E_VENUE_RAIL_CLOSED", message: "Real Ex lists no funding to the account" });
    expect(await svc.allFunding({ venue: "nowhere" })).toMatchObject({ code: "E_VENUE_RAIL_CLOSED", message: '"nowhere" is not a venue connected live' });
    // over the page's own route: the same read, a limit kept to, a limit that is no count refused
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const get = async (path: string) => {
        const r = await fetch(`${srv.url}${path}`);
        return { status: r.status, body: (await r.json()) as Record<string, unknown> };
      };
      const one = await get("/api/account/funding?venue=fund&limit=1");
      expect(one).toMatchObject({ status: 200, body: { ok: true, lines: [{ at: "2026-10-20T17:00:00.000Z", venue: "fund", symbol: "BTC/USDC:USDC", side: "long", qty: 0.5, rate: 0.0000125, usd: 0.52 }], missing: [] } });
      expect((one.body.lines as unknown[]).length).toBe(1);
      for (const bad of ["0", "501", "1e3", "x"]) expect(await get(`/api/account/funding?limit=${bad}`)).toEqual({ status: 400, body: { ok: false, error: "a limit is a count of lines, 1 to 500" } });
    } finally {
      await srv.close();
    }
  });
});

describe("a paper account beside a real one", () => {
  it("its row says paper; its balance is not in the totals, the holdings or the ready cash", async () => {
    const { svc } = await boot();
    const page = (await svc.accountView())!;
    const real = page.venues.find((v) => v.id === "real")!;
    const paper = page.venues.find((v) => v.id === "paper")!;
    expect([real.live, real.paper, paper.live, paper.paper]).toEqual([true, undefined, true, true]);
    expect(paper.name).toBe("Paper Ex");
    expect([real.usd, paper.usd]).toEqual([5000, 5000]);
    expect([page.totalUsd, page.liveUsd]).toEqual([5000, 5000]);
    const held = byAsset(page.venues, { writes: true });
    expect(held.rows.map((r) => [r.key, r.usd])).toEqual([["stable:USDT", 5000]]);
    expect(held.money.readyUsd).toBe(5000);
  });

  it("the owner's order: held to the owner's signature and the venue as any order is, and not to the server's cap; the order, its quote and its statement line say paper", async () => {
    const { svc, engine, order } = await boot();
    // $2,900 against a cap of $100: refused at the real venue, placed at the paper one
    const big = { symbol: "ETH/USDT:USDT", side: "buy", orderType: "limit", limitPrice: "2900", qty: "1" };
    expect(code(await order("real", big))).toBe("E_ACCOUNT_LIMIT");
    const p = await engine.prepare({ type: "liveOrder", venue: "paper", ...big });
    if (isRefusal(p)) throw new Error(p.message);
    expect(p.quote?.order).toMatchObject({ paper: true, notionalUsd: 2900, capUsd: 100 });
    expect(p.quote?.order?.words).toMatch(/^PAPER · buy 1 ETH at Paper Ex/);
    const placed = await order("paper", big);
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(`expected an order, got ${code(placed)}`);
    expect(placed.order).toMatchObject({ venue: "paper", paper: true, status: "open", usd: 2900 });
    expect(engine.orders[0]!.paper).toBe(true);
    const line = svc.statement().find((l) => l.id === placed.order.id)!;
    expect(line).toMatchObject({ type: "trade", kind: "buy", account: "paper", paper: true });
    // the ledger's row for it says paper, never real money
    const rows = readFileSync(svc.ledgerPath(), "utf8").split("\n").filter(Boolean).map((x) => JSON.parse(x) as { kind?: string; reason?: string });
    const logged = rows.find((r) => r.kind === "order" && (r.reason ?? "").includes(placed.order.id))!;
    expect(logged.reason).toContain(" · paper · PAPER · buy 1 ETH at Paper Ex");
    expect(logged.reason).not.toContain("real money");
    // a close at the paper venue is prepared without a cap on it
    const close = await engine.trade.prepareClose({ venue: "paper", symbol: "ETH/USDT:USDT" });
    if (isRefusal(close)) throw new Error(close.message);
    expect(close.quote).toMatchObject({ paper: true, overCap: false, capUsd: 100 });
    expect(close.quote.worthUsd).toBeGreaterThan(100);
  });

  it("an agent's order: its trading limit and the mode hold as anywhere — a limit too small refuses it, inside the limit Guard raises a card that says paper", async () => {
    const { engine, own, ag } = await boot();
    await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY });
    await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper", perPayment: "50", budget: "100", windowHours: 0, validUntil: START + 7 * DAY });
    const big = { type: "agentLiveOrder" as const, venue: "paper", symbol: "ETH/USDT:USDT", side: "buy", orderType: "limit", limitPrice: "2900", qty: "1", usd: "" };
    expect(code(await ag(big))).toBe("E_MANDATE_PER_ORDER_CAP");
    await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper", perPayment: "5000", budget: "5000", windowHours: 0, validUntil: START + 7 * DAY });
    const asked = await ag(big);
    if (isRefusal(asked) || asked.kind !== "card") throw new Error(`expected a card, got ${code(asked)}`);
    const card = engine.host.card(asked.card.id)!;
    expect(card.reason).toMatch(/^Claude Code asks to PAPER · buy 1 ETH at Paper Ex/);
    expect((card.offer as { protocol: string }).protocol).toMatch(/^paper order \(no real money\)/);
  });

  it("read-only server: a paper order is still an order this server does not place", async () => {
    const { engine } = await boot({ writes: false });
    const p = await engine.prepare({ type: "liveOrder", venue: "paper", symbol: "ETH/USDT:USDT", side: "buy", orderType: "limit", limitPrice: "2900", qty: "0.01" });
    expect(isRefusal(p) && p.code).toBe("E_WALLET_LIVE_WRITES_OFF");
  });

  it("Markets: the paper line comes after the real venue's and sets no price; a thing only the paper account lists is a row that says paper; the comparison leaves the paper account out", async () => {
    const { svc } = await boot();
    const eth = await svc.explore({ q: "ETH" });
    if (isRefusal(eth)) throw new Error(eth.message);
    const row = eth.items.find((i) => i.key === "perp:ETH")!;
    expect(row.paper).toBeUndefined();
    expect(row.price).toBe(3000);
    expect(row.changeFrom?.venue).toBe("real");
    expect(row.volumeUsd24h).toBe(1_000_000_000);
    expect(row.at.map((a) => [a.venue, a.connected, a.paper ?? false, a.price])).toEqual([["real", true, false, 3000], ["paper", true, true, 3100]]);
    const xyz = await svc.explore({ q: "XYZ" });
    if (isRefusal(xyz)) throw new Error(xyz.message);
    const only = xyz.items.find((i) => i.key === "perp:XYZ")!;
    expect(only).toMatchObject({ paper: true, price: 42 });
    expect(only.volumeUsd24h).toBeUndefined();
    expect(only.at.map((a) => [a.venue, a.paper])).toEqual([["paper", true]]);
    const cmp = await svc.liveCompare("ETH", "buy");
    if (isRefusal(cmp)) throw new Error(cmp.message);
    expect(cmp.rows.map((r) => r.venue)).toEqual(["real"]);
    expect(cmp.missing.map((m) => m.venue)).not.toContain("paper");
  });

  it("the account's own paper accounts (live:paper): nothing to connect, several at once, priced at the public sources, through the same door, back after a restart with their books", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const first = await boot({ sources: [kraken], connect: false });
    const { svc, own, order } = first;
    expect(code(await own({ type: "connectVenue", venue: "paper-alpha", connector: "live:paper", label: "Alpha", credentialRef: "25000" }))).toBe("account");
    expect(code(await own({ type: "connectVenue", venue: "paper-2", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect(code(await own({ type: "connectVenue", venue: "paper-3", connector: "live:paper", label: "", credentialRef: "a lot" }))).toBe("E_ACCOUNT_CREDENTIAL");
    const page = (await svc.accountView())!;
    const alpha = page.venues.find((v) => v.id === "paper-alpha")!;
    const second = page.venues.find((v) => v.id === "paper-2")!;
    expect([alpha.name, alpha.paper, alpha.usd, second.name, second.paper, second.usd]).toEqual(["Alpha · paper", true, 25000, "Paper account", true, 10000]);
    expect([page.totalUsd, page.liveUsd]).toEqual([0, 0]);
    // the connection the agents and the page are offered: nothing to connect, always connectable
    const here = await svc.venuesHere();
    expect(here.find((v) => v.connector === "live:paper")).toMatchObject({ verdict: "connectable", needs: "none", group: "Paper" });
    // an order worth $3,000 against a cap of $100: placed, at the public ask, with the book's fee; the statement says paper
    const placed = await order("paper-alpha", { symbol: "BTC/USD", side: "buy", orderType: "market", usd: "3000" });
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(`expected an order, got ${code(placed)}`);
    // $3,000 sized by the door at the worst price it allows (2% past the ask), to the paper account's step
    expect(placed.order).toMatchObject({ paper: true, status: "filled", avgPrice: 60010, qty: 0.049011 });
    expect(svc.statement().find((l) => l.id === placed.order.id)).toMatchObject({ paper: true, account: "paper-alpha" });
    const book = JSON.parse(readFileSync(paperBookPath(first.home, "paper-alpha"), "utf8")) as PaperBook;
    expect(book.cashUsd).toBeCloseTo(25000 - 0.049011 * 60010 * 1.001, 3);
    // Markets: the public line prices the row, each paper account is a line after it
    const x = await svc.explore({ q: "BTC" });
    if (isRefusal(x)) throw new Error(x.message);
    const row = x.items.find((i) => i.key === "coin:BTC")!;
    expect(row.price).toBe(60000);
    expect(row.at.map((a) => [a.venue, a.connected, a.paper ?? false])).toEqual([["kraken", false, false], ["paper-alpha", true, true], ["paper-2", true, true]]);
    // a restart: the books are continued, the sum in the connection's reference does not start them again
    const again = await boot({ home: first.home, sources: [kraken], connect: false, nonceFrom: 50, at: 3_600_000 });
    // the venues come back after the report is written: waited for, as a page would wait for the restore to say done
    await again.svc.restoring;
    expect(again.svc.restored).toMatchObject({ state: "done", venues: [{ venue: "paper-alpha", ok: true }, { venue: "paper-2", ok: true }] });
    const back = (await again.svc.accountView())!;
    expect(back.venues.find((v) => v.id === "paper-alpha")!.usd).toBeCloseTo(book.cashUsd + 0.049011 * 60000, 1);
    expect(back.venues.find((v) => v.id === "paper-2")).toMatchObject({ paper: true, usd: 10000 });
    expect(back.venues.find((v) => v.id === "paper-alpha")!.holdings.find((h) => h.asset === "BTC")).toMatchObject({ amount: 0.049011 });
  });

  it("the paper accounts' own curve: told again from the book's fills and the public bars since it started, its points and connections on a log of its own, never on the net worth's", async () => {
    // the clock: Wednesday 14 October 2026, 15:00 UTC; the paper account starts at 12:00 and buys at 13:00
    const T0 = Date.parse("2026-10-14T12:00:00Z");
    let at = T0;
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    // five-minute bars from 11:00: 60,000 until 13:30, 63,000 after
    const bars = Array.from({ length: 60 }, (_, i) => {
      const t = Date.parse("2026-10-14T11:00:00Z") + i * 300_000;
      const c = t < Date.parse("2026-10-14T13:30:00Z") ? 60000 : 63000;
      return { t, o: c, h: c, l: c, c };
    });
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())), candles: async (symbol, _i, w) => (symbol === "BTC/USD" ? bars.filter((b) => b.t >= (w.since ?? 0) && b.t + 300_000 <= at) : []) };
    const home = mkdtempSync(join(tmpdir(), "account-paper-"));
    homes.push(home);
    const liveDeps: Partial<LiveDeps> = { clock: () => at, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
    const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: [kraken], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    let n = 0;
    const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + ++n } as OwnerAction));
    expect(code(await own({ type: "connectVenue", venue: "real", connector: "live:standin-paper-real", label: "Real Ex", credentialRef: "" }))).toBe("account");
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    // its connection goes on the paper accounts' log, not the net worth's
    await svc.snapshot({ kind: "connect", venue: "paper-1", name: "Paper account", paper: true });
    at = Date.parse("2026-10-14T13:00:00Z");
    const p = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.1" });
    if (isRefusal(p)) throw new Error(p.message);
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveOrder" }>;
    const placed = await own(rest as NoNonce<OwnerAction>);
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(`expected an order, got ${code(placed)}`);
    btc.price = 63000;
    btc.bid = 62990;
    btc.ask = 63010;
    at = Date.parse("2026-10-14T15:00:00Z");
    await svc.snapshot();
    // the net worth's log holds the real venue alone, and no paper connection; the paper log holds the paper account
    const rows = (path: string) => readFileSync(path, "utf8").split("\n").filter(Boolean).map((x) => JSON.parse(x) as { usd?: number; byVenue?: Record<string, number>; event?: { venue: string } });
    const real = rows(networthPath(home));
    expect(real.some((r) => r.event?.venue === "paper-1")).toBe(false);
    expect(real.filter((r) => r.byVenue).every((r) => !("paper-1" in r.byVenue!))).toBe(true);
    const paper = rows(paperNetworthPath(home));
    expect(paper.some((r) => r.event?.venue === "paper-1")).toBe(true);
    const lastPaper = paper.filter((r) => r.byVenue).pop()!;
    // 10,000 − 6,001 − 6.001 fee + 0.1 × 63,000
    expect(lastPaper.byVenue!["paper-1"]).toBeCloseTo(10000 - 6001 - 6.001 + 6300, 1);
    // the curve: from what it started with at noon, flat to the buy, the bars after; the figure now is its last point
    const h = await svc.paperHistory("1d", "paper-1");
    if (isRefusal(h)) throw new Error(h.message);
    expect(h).toMatchObject({ paper: true, venue: "paper-1", startUsd: 10000, rebuilt: true, bucket: "5m" });
    expect(h.points[0]).toEqual({ at: "2026-10-14T12:00:00.000Z", usd: 10000 });
    const value = (iso: string) => h.points.find((x) => x.at === iso)?.usd;
    // 13:05: bought at the ask (60,010) with the fee, marked at the bar's close (60,000)
    expect(value("2026-10-14T13:05:00.000Z")).toBeCloseTo(10000 - 6001 - 6.001 + 6000, 1);
    expect(value("2026-10-14T14:00:00.000Z")).toBeCloseTo(10000 - 6001 - 6.001 + 6300, 1);
    expect(h.points[h.points.length - 1]!.at).toBe("2026-10-14T15:00:00.000Z");
    expect(h.sinceStartUsd).toBeCloseTo(6300 - 6001 - 6.001, 1);
    expect(h.changeUsd).toBeCloseTo(6300 - 6001 - 6.001, 1);
    expect(h.events.map((e) => [e.kind, e.venue])).toEqual([["connect", "paper-1"]]);
    // every paper account, and the route's refusal of one that is not one
    const all = await svc.paperHistory("1w");
    expect(!isRefusal(all) && all.paper).toBe(true);
    expect(code(await svc.paperHistory("1d", "real") as Refusal)).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await svc.paperHistory("3m") as Refusal)).toBe("E_ACCOUNT_BAD_ACTION");
    // the real holdings' cost knows nothing of the paper buy; the paper view's does
    const realHold = await svc.holdings({ cost: true });
    const paperHold = await svc.holdings({ cost: true, paper: true });
    if (isRefusal(realHold) || isRefusal(paperHold)) throw new Error("holdings");
    expect((realHold.cost ?? []).some((c) => c.key === "crypto:BTC")).toBe(false);
    expect((paperHold.cost ?? []).find((c) => c.key === "crypto:BTC")).toMatchObject({ coveredQty: 0.1 });
  });

  it("a bracket through the door: the entry signed with its exits, the exits placed by the paper account when it fills, the one that fills on the Statement as that order's, by whoever placed it", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    // the wrong way round is refused before anything is signed
    const wrong = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01", takeProfit: "50000" });
    expect(isRefusal(wrong) && wrong.message).toContain("take-profit");
    const placed = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01", takeProfit: "66000", stopLoss: "57000" });
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(`expected an order, got ${code(placed)}`);
    expect(placed.order).toMatchObject({ status: "filled", takeProfit: 66000, stopLoss: 57000, paper: true });
    // the price falls through the stop-loss: the paper account's own look sells, and the take-profit goes with it
    btc.price = 56000;
    btc.bid = 55990;
    btc.ask = 56010;
    expect(await svc.lookAtPaper()).toEqual(["paper-1"]);
    const line = svc.statement().find((l) => l.description.includes("stop-loss of"));
    expect(line).toMatchObject({ type: "trade", kind: "sell", account: "paper-1", status: "filled", paper: true, by: "You", amountUsd: 559.9 });
    expect(line!.description).toContain(`stop-loss of ${placed.order.id}`);
    // the take-profit was an order of the account's too: canceled when the stop-loss filled
    expect(svc.statement().find((l) => l.description.includes("take-profit of"))).toMatchObject({ status: "canceled", amountUsd: 0, paper: true });
    // both exits were followed as the account's own orders, named as the entry's
    const page = (await svc.accountView())!;
    expect(page.orders.filter((o) => o.exitOf?.order === placed.order.id).map((o) => [o.exitOf!.kind, o.type, o.status])).toEqual([["stop-loss", "stop", "filled"], ["take-profit", "limit", "canceled"]]);
  });

  it("THE BLACK BOX: the round trip the bracket made is one line of the journal — its entry and exit, net of fees, how far the price went for it and against it as the account looked, how it ended, who opened it and who closed it — chained, and read back as the service gives it", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order, home } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const placed = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01", takeProfit: "66000", stopLoss: "57000" });
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(`expected an order, got ${code(placed)}`);
    // nothing closed yet: nothing in the journal
    expect(readJournal(home).rows).toEqual([]);
    // the price rises — the account's look sees it — then falls through the stop-loss
    Object.assign(btc, { price: 62000, bid: 61990, ask: 62010 });
    await svc.lookAtPaper();
    Object.assign(btc, { price: 56000, bid: 55990, ask: 56010 });
    expect(await svc.lookAtPaper()).toEqual(["paper-1"]);
    const j = readJournal(home);
    expect(j.intact).toBe(true);
    expect(j.rows).toHaveLength(1);
    const t = j.rows[0]!;
    expect(t).toMatchObject({ seq: 1, venue: "paper-1", paper: true, symbol: "BTC/USD", kind: "spot", side: "long", qty: 0.01, entryPrice: 60010, exitPrice: 55990, takeProfit: 66000, stopLoss: 57000, fills: 2, end: "stop-loss", by: { who: "owner" }, closedBy: { who: "venue" }, hi: 62000, lo: 55990 });
    expect(t.grossUsd).toBeCloseTo(-40.2, 6);
    expect(t.feesUsd).toBeCloseTo(0.6001 + 0.5599, 6);
    expect(t.netUsd).toBeCloseTo(-40.2 - 1.16, 6);
    expect(t.mfePct).toBeCloseTo((62000 / 60010 - 1) * 100, 3);
    expect(t.maePct).toBeCloseTo((55990 / 60010 - 1) * 100, 3);
    expect(t.lead).toBeUndefined();
    // what the page and an agent read (GET /api/account/journal)
    expect(svc.journal({ limit: 10 })).toEqual({ trades: [t], total: 1, intact: true });
    expect(svc.journal({ limit: 10, venue: "elsewhere" })).toEqual({ trades: [], total: 0, intact: true });
    // and what the Debrief pane reads: one trade is too few to say anything, and says so; the owner's trades are the ones that are here
    const d = svc.debrief({});
    if (isRefusal(d)) throw new Error(d.message);
    expect(d).toMatchObject({ venues: [{ id: "paper-1", trades: 1 }], latest: [t], intact: true, debrief: { trades: 1, few: true, losses: 1, inversion: { verdict: "few" }, ends: [{ end: "stop-loss", n: 1 }], slices: { by: [{ label: "You", n: 1 }] } } });
    expect(d.debrief.breakEven.plan).toMatchObject({ trades: 1 });
    expect(svc.debrief({ who: "desk" })).toMatchObject({ debrief: { trades: 0 }, latest: [] });
  });

  it("the quote the owner is shown says what the order would leave by the paper account's own rule — its fee and rate, a perpetual's estimated liquidation price at the leverage set — and nothing a venue did not say (feat/paper-live phase 4)", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const perp: Listing = { symbol: "BTC-PERP", name: "BTC perpetual", kind: "perp", base: "BTC", quote: "USDC", price: 60000, bid: 59995, ask: 60005, open: true, types: [], volumeUsd24h: 2e9, maxLeverage: 10 } as Listing;
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc, perp].filter((m) => !q.q || m.base.includes(q.q.toUpperCase()) || m.symbol.includes(q.q.toUpperCase())) };
    const { svc, own } = await boot({ sources: [kraken], connect: true });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const coin = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.1" });
    if (isRefusal(coin)) throw new Error(coin.message);
    // 0.1 at the ask, 10 bps
    expect(coin.quote?.order).toMatchObject({ feeUsd: 6.001, feeBps: 10 });
    expect(coin.quote?.order?.liquidationPrice).toBeUndefined();
    expect(coin.quote?.order?.queued).toBeUndefined();
    const set = await own({ type: "liveLeverage", venue: "paper-1", symbol: "BTC-PERP", leverage: "5", marginMode: "" });
    if (isRefusal(set)) throw new Error(set.message);
    const long = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC-PERP", side: "buy", orderType: "market", qty: "0.1" });
    if (isRefusal(long)) throw new Error(long.message);
    expect(long.quote?.order).toMatchObject({ leverage: 5, feeBps: 10 });
    expect(long.quote?.order?.liquidationPrice).toBeCloseTo(liquidationPriceOf({ side: "long", qty: 0.1, entryPrice: 60005, marginUsd: 6000.5 / 5 }, 10)!, 4);
    // a share's market order out of its regular session: said as queued for the open (it fills at the open's price, not this one); a limit
    // there is no such order
    expect(code(await own({ type: "connectVenue", venue: "broker", connector: "live:standin-paper-broker", label: "Broker", credentialRef: "" }))).toBe("account");
    const queued = await svc.account!.prepare({ type: "liveOrder", venue: "broker", symbol: "AAPL", side: "buy", orderType: "market", qty: "0.2" });
    if (isRefusal(queued)) throw new Error(queued.message);
    expect(queued.quote?.order?.queued).toBe(true);
    const limit = await svc.account!.prepare({ type: "liveOrder", venue: "broker", symbol: "AAPL", side: "buy", orderType: "limit", qty: "0.2", limitPrice: "249" });
    if (isRefusal(limit)) throw new Error(limit.message);
    expect(limit.quote?.order?.queued).toBeUndefined();
    // a real venue that says nothing before an order (no estimate): no fee figure and no liquidation price in its quote
    const real = await svc.account!.prepare({ type: "liveOrder", venue: "real", symbol: "ETH/USDT:USDT", side: "buy", orderType: "market", qty: "0.01" });
    if (isRefusal(real)) throw new Error(real.message);
    expect(real.quote?.order?.feeUsd).toBeUndefined();
    expect(real.quote?.order?.liquidationPrice).toBeUndefined();
  });

  it("a trailing stop through the door: signed with its trail, valued where it would trigger now", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const bought = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.02" });
    expect(code(bought)).toBe("order");
    const p = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "trailing_stop", qty: "0.02", trailPercent: "3" });
    if (isRefusal(p)) throw new Error(p.message);
    expect(p.action).toMatchObject({ orderType: "trailing_stop", trailPercent: "3", trailPrice: "" });
    // a sell worth what it holds now, at the bid
    expect(p.quote?.order?.notionalUsd).toBeCloseTo(0.02 * 59990, 1);
    const trail = await order("paper-1", { symbol: "BTC/USD", side: "sell", orderType: "trailing_stop", qty: "0.02", trailPercent: "3" });
    if (isRefusal(trail) || trail.kind !== "order") throw new Error(`expected an order, got ${code(trail)}`);
    expect(trail.order).toMatchObject({ status: "open", type: "trailing_stop", trailPercent: 3 });
    expect(code((await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "trailing_stop", qty: "0.02" })) as Refusal)).toBe("E_ACCOUNT_BAD_ACTION");
  });

  it("a trailing sell the owner signs, or a card releases, keeps its worst price under its stop: once the price falls through the stop, it sells", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, ag, order } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect(code(await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.03" }))).toBe("order");
    // valued at the bid (59,990), its stop 5% under it (56,990.5): its worst price is 2% under the stop, not 2% under the bid — a worst
    // price above the stop would keep a triggered stop from ever filling
    const trail = await order("paper-1", { symbol: "BTC/USD", side: "sell", orderType: "trailing_stop", qty: "0.02", trailPercent: "5" });
    if (isRefusal(trail) || trail.kind !== "order") throw new Error(`expected an order, got ${code(trail)}`);
    expect(trail.order.worstPrice).toBeCloseTo(56990.5 * 0.98, 1);
    // an agent's, on a card the owner approves (Guard): held the same way
    await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY });
    await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper-1", perPayment: "5000", budget: "5000", windowHours: 0, validUntil: START + 7 * DAY });
    const asked = await ag({ type: "agentLiveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "trailing_stop", qty: "0.01", usd: "", limitPrice: "", trailPercent: "5" });
    if (isRefusal(asked) || asked.kind !== "card") throw new Error(`expected a card, got ${code(asked)}`);
    const released = await own({ type: "approveCard", card: asked.card.id, action: cardHash(asked.card), decision: "approve" });
    if (isRefusal(released) || released.kind !== "order") throw new Error(`expected an order, got ${code(released)}`);
    expect(released.order.worstPrice).toBeCloseTo(56990.5 * 0.98, 1);
    btc.price = 56000;
    btc.bid = 55990;
    btc.ask = 56010;
    expect(await svc.lookAtPaper()).toEqual(["paper-1"]);
    const orders = (await svc.accountView())!.orders;
    expect([trail.order.id, released.order.id].map((id) => orders.find((o) => o.id === id)).map((o) => [o?.status, o?.avgPrice])).toEqual([["filled", 55990], ["filled", 55990]]);
  });

  it("a bracket's exits are judged against where its entry may fill, and a refusal says what they must be", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const why = async (draft: Record<string, unknown>) => {
      const p = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", qty: "0.01", ...draft });
      return isRefusal(p) ? p.message : "prepared";
    };
    // a market buy fills at the ask (60,010): its take-profit must be above it
    expect(await why({ side: "buy", orderType: "market", takeProfit: "50000" })).toBe("Paper account: the take-profit (50,000) must be above the entry (60,010) for a buy");
    // a buy limited at 70,000 crosses the ask and fills at 60,010: a stop-loss at 65,000 would sell at once
    expect(await why({ side: "buy", orderType: "limit", limitPrice: "70000", stopLoss: "65000" })).toBe("Paper account: the stop-loss (65,000) must be below the entry (60,010) for a buy: a buy limited at 70,000 crosses the book and fills there, at 60,010");
    // a sell limited at 50,000 fills at the bid (59,990): a stop-loss at 55,000 is under that fill
    expect(await why({ side: "sell", orderType: "limit", limitPrice: "50000", stopLoss: "55000" })).toBe("Paper account: the stop-loss (55,000) must be above the entry (59,990) for a sell: a sell limited at 50,000 crosses the book and fills there, at 59,990");
    // a sell's take-profit is under its limit, the worst fill for it
    expect(await why({ side: "sell", orderType: "limit", limitPrice: "60500", takeProfit: "61000" })).toBe("Paper account: the take-profit (61,000) must be below the entry (60,500) for a sell");
    // a limit that rests is judged at its own price; a crossing one's take-profit at its limit
    expect(await why({ side: "buy", orderType: "limit", limitPrice: "59000", takeProfit: "62000", stopLoss: "58000" })).toBe("prepared");
    expect(await why({ side: "buy", orderType: "limit", limitPrice: "70000", takeProfit: "72000", stopLoss: "59000" })).toBe("prepared");
  });

  it("a bracketed entry changed in place keeps its exits: a new limit on the wrong side of them is refused, and the quote signed shows them", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const entry = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "limit", limitPrice: "59000", qty: "0.01", takeProfit: "62000", stopLoss: "58000" });
    if (isRefusal(entry) || entry.kind !== "order") throw new Error(`expected an order, got ${code(entry)}`);
    expect(entry.order.status).toBe("open");
    // under the stop-loss, the entry would fill and its stop-loss sell at once
    const under = await svc.account!.prepare({ type: "liveAmend", venue: "paper-1", order: entry.order.id, limitPrice: "57000" });
    expect(isRefusal(under) && under.message).toBe("Paper account: the stop-loss (58,000) must be below the entry (57,000) for a buy");
    const p = await svc.account!.prepare({ type: "liveAmend", venue: "paper-1", order: entry.order.id, limitPrice: "59500" });
    if (isRefusal(p)) throw new Error(p.message);
    expect(p.quote?.order?.words).toContain("limit 59,500 · then take-profit 62,000, stop-loss 58,000");
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveAmend" }>;
    const changed = await own(rest as NoNonce<OwnerAction>);
    if (isRefusal(changed) || changed.kind !== "order") throw new Error(`expected an order, got ${code(changed)}`);
    expect(changed.order).toMatchObject({ limitPrice: 59500, takeProfit: 62000, stopLoss: 58000, status: "open" });
  });

  it("a close of the whole position takes its exits with it, through the venue: a stop-loss left armed would sell a holding bought later", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order, home } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const entry = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01", takeProfit: "66000", stopLoss: "57000" });
    if (isRefusal(entry) || entry.kind !== "order") throw new Error(`expected an order, got ${code(entry)}`);
    const exits = () => svc.account!.orders.filter((o) => o.exitOf?.order === entry.order.id);
    expect(exits().map((o) => [o.id, o.exitOf!.kind, o.status])).toEqual([["ord-0003", "stop-loss", "open"], ["ord-0002", "take-profit", "open"]]);
    // the owner is told before signing that the exits go with the position
    const p = await svc.account!.prepare({ type: "liveClose", venue: "paper-1", symbol: "BTC/USD" });
    if (isRefusal(p)) throw new Error(p.message);
    expect(p.quote?.close?.words).toMatch(/ · its stop-loss ord-0003 and its take-profit ord-0002 are canceled with it$/);
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveClose" }>;
    const closed = await own(rest as NoNonce<OwnerAction>);
    if (isRefusal(closed) || closed.kind !== "order") throw new Error(`expected an order, got ${code(closed)}`);
    // at once, not at the next look: both exits canceled at the venue, their lines saying why
    expect(exits().map((o) => [o.status, o.note])).toEqual([["canceled", `stop-loss of ${entry.order.id} · canceled: the position was closed (${closed.order.id})`], ["canceled", `take-profit of ${entry.order.id} · canceled: the position was closed (${closed.order.id})`]]);
    const book = () => JSON.parse(readFileSync(paperBookPath(home, "paper-1"), "utf8")) as PaperBook;
    expect(Object.values(book().orders).filter((o) => o.parent === entry.order.ref).map((o) => o.status)).toEqual(["canceled", "canceled"]);
    // bought again with no exits; the price falls through the old stop-loss, and nothing sells the new holding
    expect(code(await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01" }))).toBe("order");
    btc.price = 56900;
    btc.bid = 56890;
    btc.ask = 56910;
    await svc.lookAtPaper();
    expect(book().holdings["BTC/USD"]).toMatchObject({ qty: 0.01 });
  });

  it("a close of what is held leaves a sell's buy-back exits alone: they close nothing of the holding, and the quote does not name them", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order, home } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect(code(await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.02" }))).toBe("order");
    // half of it sold, to be bought back: a take-profit under the sale, a stop-loss over it — both buys
    const sold = await order("paper-1", { symbol: "BTC/USD", side: "sell", orderType: "market", qty: "0.01", takeProfit: "58000", stopLoss: "62000" });
    if (isRefusal(sold) || sold.kind !== "order") throw new Error(`expected an order, got ${code(sold)}`);
    const exits = () => svc.account!.orders.filter((o) => o.exitOf?.order === sold.order.id);
    expect(exits().map((o) => [o.exitOf!.kind, o.side, o.status])).toEqual([["stop-loss", "buy", "open"], ["take-profit", "buy", "open"]]);
    // the owner closes what is held (the other 0.01): a sell, which the buy-backs are no part of
    const p = await svc.account!.prepare({ type: "liveClose", venue: "paper-1", symbol: "BTC/USD" });
    if (isRefusal(p)) throw new Error(p.message);
    expect(p.quote?.close?.words).not.toContain("canceled with it");
    for (const o of exits()) expect(p.quote?.close?.words).not.toContain(o.id);
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveClose" }>;
    const closed = await own(rest as NoNonce<OwnerAction>);
    if (isRefusal(closed) || closed.kind !== "order") throw new Error(`expected an order, got ${code(closed)}`);
    expect(closed.order).toMatchObject({ side: "sell", qty: 0.01, status: "filled" });
    // still open, at the account and at the paper account
    expect(exits().map((o) => o.status)).toEqual(["open", "open"]);
    const book = JSON.parse(readFileSync(paperBookPath(home, "paper-1"), "utf8")) as PaperBook;
    expect(Object.values(book.orders).filter((o) => o.parent === sold.order.ref).map((o) => [o.side, o.status])).toEqual([["buy", "open"], ["buy", "open"]]);
  });

  it("a close that waits leaves the exits guarding what is still held: a stock's market sell queued for the open cancels nothing, and the open that fills it takes them", async () => {
    // Wednesday 7 October 2026, 11:00 New York: the regular session; the clock is read each time it is asked, so it can move — and the US
    // line's real-time quote is stamped at it (realTimeLine)
    const setup = { sources: [] as PublicSource[], connect: false, clock: fromEt(2026, 10, 7, 11, 0) };
    const { cboe } = realTimeLine(() => setup.clock);
    setup.sources = [cboe];
    const { svc, own, order, home } = await boot(setup);
    expect(code(await own({ type: "connectVenue", venue: "paper-stocks", connector: "live:paper", label: "Stocks", credentialRef: "" }))).toBe("account");
    const entry = await order("paper-stocks", { symbol: "AAPL", side: "buy", orderType: "market", qty: "3", takeProfit: "360", stopLoss: "320" });
    if (isRefusal(entry) || entry.kind !== "order") throw new Error(`expected an order, got ${code(entry)}`);
    expect(entry.order).toMatchObject({ status: "filled", qty: 3 });
    const exits = () => svc.account!.orders.filter((o) => o.exitOf?.order === entry.order.id);
    const book = () => JSON.parse(readFileSync(paperBookPath(home, "paper-stocks"), "utf8")) as PaperBook;
    const legs = () => Object.values(book().orders).filter((o) => o.parent === entry.order.ref).map((o) => o.status);
    const legNotes = () => Object.values(book().orders).filter((o) => o.parent === entry.order.ref).map((o) => o.note);
    expect(exits().map((o) => [o.exitOf!.kind, o.status])).toEqual([["stop-loss", "open"], ["take-profit", "open"]]);
    // 17:00 New York: the regular session is over, and the owner closes the holding — a market sell, queued for the open
    setup.clock = fromEt(2026, 10, 7, 17, 0);
    const p = await svc.account!.prepare({ type: "liveClose", venue: "paper-stocks", symbol: "AAPL" });
    if (isRefusal(p)) throw new Error(p.message);
    const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveClose" }>;
    const closed = await own(rest as NoNonce<OwnerAction>);
    if (isRefusal(closed) || closed.kind !== "order") throw new Error(`expected an order, got ${code(closed)}`);
    expect(closed.order).toMatchObject({ side: "sell", qty: 3, status: "open" });
    expect(book().orders[closed.order.ref!]?.note).toContain("queued for the open");
    // the holding is still there until the close fills, and so are its exits: at the account and at the paper account
    expect(book().holdings["AAPL"]).toMatchObject({ qty: 3 });
    expect(exits().map((o) => o.status)).toEqual(["open", "open"]);
    expect(legs()).toEqual(["open", "open"]);
    // Thursday 10:00 New York: the open fills the close, the holding is sold whole, and the paper account cancels its exits; the account's
    // look sees them canceled
    setup.clock = fromEt(2026, 10, 8, 10, 0);
    expect(await svc.lookAtPaper()).toEqual(["paper-stocks"]);
    expect(svc.account!.orders.find((o) => o.id === closed.order.id)).toMatchObject({ status: "filled", filledQty: 3 });
    expect(book().holdings["AAPL"]).toBeUndefined();
    expect(legs()).toEqual(["canceled", "canceled"]);
    expect(legNotes()).toEqual([`canceled: what it was to sell is sold (${closed.order.ref})`, `canceled: what it was to sell is sold (${closed.order.ref})`]);
    expect(exits().map((o) => o.status)).toEqual(["canceled", "canceled"]);
  });

  it("an exit the venue trimmed to what was left of its holding fills at that size: its order, its worth and its statement line say what filled, not what was placed", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const { svc, own, order } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const entry = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.02", takeProfit: "66000", stopLoss: "57000" });
    if (isRefusal(entry) || entry.kind !== "order") throw new Error(`expected an order, got ${code(entry)}`);
    const tp = () => svc.account!.orders.find((o) => o.exitOf?.order === entry.order.id && o.exitOf.kind === "take-profit")!;
    expect([tp().qty, tp().usd]).toEqual([0.02, 1320]);
    // half the holding sold by hand: the take-profit, placed for 0.02, has 0.01 left to sell
    expect(code(await order("paper-1", { symbol: "BTC/USD", side: "sell", orderType: "market", qty: "0.01" }))).toBe("order");
    btc.price = 66100;
    btc.bid = 66090;
    btc.ask = 66110;
    expect(await svc.lookAtPaper()).toEqual(["paper-1"]);
    expect(tp()).toMatchObject({ status: "filled", qty: 0.01, filledQty: 0.01, usd: 660, note: expect.stringMatching(/^filled at /) });
    const line = svc.statement().find((l) => l.id === tp().id)!;
    expect(line).toMatchObject({ status: "filled", worthUsd: 660 });
    expect(line.description).toMatch(/^Sell 0\.01 BTC · BTC market · limit 66,000 · take-profit of /);
    expect(line.description).not.toContain("of 0.02 filled");
  });

  it("a US stock in a paper account: priced at the public stocks line, filled at its real-time quote through the same door; the Stocks tab's row carries the public line's session and the paper leg", async () => {
    const session = { open: true, closesAt: "2026-10-07T20:00:00.000Z" };
    // Wednesday 7 October 2026, 11:00 New York: the regular session, a real-time quote stamped then
    const { cboe } = realTimeLine(() => fromEt(2026, 10, 7, 11, 0), { session, change24h: 0.84, changePct24h: 0.25 });
    const { svc, own, order, home } = await boot({ sources: [cboe], connect: false, clock: fromEt(2026, 10, 7, 11, 0) });
    expect(code(await own({ type: "connectVenue", venue: "paper-stocks", connector: "live:paper", label: "Stocks", credentialRef: "" }))).toBe("account");
    const placed = await order("paper-stocks", { symbol: "AAPL", side: "buy", orderType: "market", usd: "1000" });
    if (isRefusal(placed) || placed.kind !== "order") throw new Error(`expected an order, got ${code(placed)}`);
    expect(placed.order).toMatchObject({ paper: true, status: "filled", avgPrice: 340.06 });
    expect(placed.order.qty).toBeGreaterThan(2.8);
    expect((JSON.parse(readFileSync(paperBookPath(home, "paper-stocks"), "utf8")) as PaperBook).holdings["AAPL"]).toMatchObject({ qty: placed.order.qty });
    const x = await svc.explore({ tab: "stocks" });
    if (isRefusal(x)) throw new Error(x.message);
    const row = x.items.find((i) => i.key === "stock:AAPL")!;
    expect(row).toMatchObject({ kind: "stock", name: "Apple Inc", price: 340 });
    expect(row.at.map((a) => [a.venue, a.connected, a.paper ?? false, a.connectTo])).toEqual([["cboe", false, false, "alpaca"], ["paper-stocks", true, true, undefined]]);
    expect(row.at[0]).toMatchObject({ session, note: expect.stringContaining("15 minutes behind") });
    expect(x.tabs.find((t) => t.id === "stocks")!.count).toBe(1);
  });

  it("A US STOCK WHOSE ONLY QUOTE IS CBOE'S, fifteen minutes behind: the door refuses a market order when it prepares it — the only quote is 15 minutes old, use a limit — and a limit is prepared, placed and waits for a real-time quote (phase 3)", async () => {
    const { cboe } = realTimeLine(() => fromEt(2026, 10, 7, 11, 0), {}, { delayMs: 15 * 60_000 });
    const { svc, own, order } = await boot({ sources: [cboe], connect: false, clock: fromEt(2026, 10, 7, 11, 0) });
    expect(code(await own({ type: "connectVenue", venue: "paper-stocks", connector: "live:paper", label: "Stocks", credentialRef: "" }))).toBe("account");
    const p = await svc.account!.prepare({ type: "liveOrder", venue: "paper-stocks", symbol: "AAPL", side: "buy", orderType: "market", usd: "1000" });
    expect(isRefusal(p)).toBe(true);
    expect((p as Refusal).code).toBe("E_VENUE_ORDER_INVALID");
    expect((p as Refusal).message).toBe("Stocks · paper: the only quote of Apple Inc just now is Cboe's, 15 minutes behind the market: a paper account never fills a stock at a delayed quote, so it takes no market order now — use a limit order, which rests until a real-time quote reaches it");
    const limit = await order("paper-stocks", { symbol: "AAPL", side: "buy", orderType: "limit", limitPrice: "345", qty: "1" });
    if (isRefusal(limit) || limit.kind !== "order") throw new Error(`expected an order, got ${code(limit)}`);
    expect(limit.order).toMatchObject({ paper: true, status: "open" });
  });

  it("positions say paper; the net worth curve counts the real venue alone", async () => {
    const { svc, home } = await boot();
    const all = await svc.allPositions();
    if (isRefusal(all)) throw new Error(all.message);
    expect(all.positions.map((p) => [p.venue, p.side, p.paper ?? false])).toEqual([["real", "long", false], ["paper", "short", true]]);
    const taken = await svc.snapshot();
    expect(taken && !isRefusal(taken) && taken.written).toBe(true);
    const points = readFileSync(networthPath(home), "utf8").split("\n").filter(Boolean).map((x) => JSON.parse(x) as { usd: number; byVenue: Record<string, number> });
    const last = points[points.length - 1]!;
    expect([last.usd, last.byVenue]).toEqual([5000, { real: 5000 }]);
  });
});

/** THE US STOCKS LINE AS IT ANSWERS (public-stocks.ts): the market's clock, and AAPL at a real-time quote stamped at `at()` each time it is read
 * (a getter: the service keeps a listing a while, and its stamp is the moment it is read here), no delay — or, with `delayMs`, Cboe's file
 * fifteen minutes behind, stamped that much earlier */
function realTimeLine(at: () => number, extra: Partial<Listing> = {}, o: { delayMs?: number } = {}) {
  const delayMs = o.delayMs ?? 0;
  const aapl = { symbol: "AAPL", name: "Apple Inc", kind: "stock", base: "AAPL", quote: "USD", price: 340, bid: 339.95, ask: 340.06, open: true, types: [], venueName: "US stocks", delayMs, quoteFrom: delayMs ? "Cboe · 15 min delayed" : "Robinhood · real time", ...extra } as Listing;
  Object.defineProperty(aapl, "quoteAt", { enumerable: true, get: () => new Date(at() - delayMs).toISOString() });
  const cboe: PublicSource = { id: "cboe", name: "US stocks", kind: "stocks", connectTo: "alpaca", connector: "live:alpaca", sessions: usClock, readOnly: "Real-time quotes from Robinhood or Nasdaq, else Cboe's own delayed ones, 15 minutes behind the market — each line says which: a US stock trades at a connected broker (Alpaca, Robinhood), or in a paper account", listings: async (q) => [aapl].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
  return { cboe, aapl };
}

describe("a paper account the owner runs: started again, paper money added, its balance fresh after every write and every look (feat/paper-live p0)", () => {
  const btcOf = (): Listing => ({ symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 });
  const krakenOf = (btc: Listing): PublicSource => ({ id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) });
  const bookOf = (home: string, venue = "paper-1") => JSON.parse(readFileSync(paperBookPath(home, venue), "utf8")) as PaperBook;
  const cashOf = async (svc: PortfolioService, venue = "paper-1") => (await svc.accountView())!.venues.find((v) => v.id === venue)!;

  it("resetPaper: said in words before it is signed, refused while an order is open there, then the book archived beside it (0600, never deleted) and started again in place — its order numbers going on", async () => {
    const btc = btcOf();
    const { svc, home, own, order } = await boot({ sources: [krakenOf(btc)], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const bought = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01" });
    if (isRefusal(bought) || bought.kind !== "order") throw new Error(`expected an order, got ${code(bought)}`);
    const resting = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "limit", limitPrice: "50000", qty: "0.01" });
    if (isRefusal(resting) || resting.kind !== "order") throw new Error(`expected an order, got ${code(resting)}`);
    // the dialog's words, from the account itself: what it archives, and what it starts with
    const p = await svc.account!.prepare({ type: "resetPaper", venue: "paper-1", usd: "25,000" });
    expect(isRefusal(p) && p.message).toContain(`has an open order (${resting.order.id})`);
    expect(code(await own({ type: "resetPaper", venue: "paper-1", usd: "25000" }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ type: "liveCancel", venue: "paper-1", order: resting.order.id }))).toBe("order");
    const words = await svc.account!.prepare({ type: "resetPaper", venue: "paper-1", usd: "25,000" });
    if (isRefusal(words)) throw new Error(words.message);
    expect(words.shown).toEqual([{ name: "venue", value: "paper-1" }, { name: "usd", value: "25,000" }, { name: "nonce", value: String(words.action.nonce) }]);
    expect(words.quote?.words).toMatch(/^Start Paper account again with \$25,000\.00 of paper money\. Its book as it stands — \$9,\d{3}\.\d\d paper cash, 1 holding, started with \$10,000\.00 on \d{4}-\d\d-\d\d — is archived beside it, not deleted\. Nothing real moves\.$/);
    const before = bookOf(home);
    const r = await own({ type: "resetPaper", venue: "paper-1", usd: "25,000" });
    expect(isRefusal(r) ? r.message : r.kind).toBe("account");
    const after = bookOf(home);
    expect(after).toMatchObject({ id: "paper-1", name: "Paper account", cashUsd: 25000, startCashUsd: 25000, holdings: {}, positions: {}, orders: {}, fills: [], seq: before.seq });
    expect(after.resetFrom?.file).toMatch(/^book-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.json$/);
    const archive = join(paperDir(home, "paper-1"), after.resetFrom!.file);
    expect(statSync(archive).mode & 0o777).toBe(0o600);
    expect((JSON.parse(readFileSync(archive, "utf8")) as PaperBook).orders).toEqual(before.orders);
    expect(readdirSync(paperDir(home, "paper-1")).sort()).toEqual([after.resetFrom!.file, "book.json"].sort());
    // the page at once: the new sum, what it started with, nothing held
    const v = await cashOf(svc);
    expect([v.usd, v.paperStartUsd, v.holdings.map((h) => h.asset)]).toEqual([25000, 25000, ["USD"]]);
    // the next order on the new book takes the next number: an order the statement names stays one order
    const next = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01" });
    if (isRefusal(next) || next.kind !== "order") throw new Error(`expected an order, got ${code(next)}`);
    expect(next.order.ref).toBe(`p${before.seq + 1}`);
    // a venue that is not a paper account this account keeps, a sum that is none, an envelope signed eleven minutes ago
    expect(code(await own({ type: "resetPaper", venue: "nowhere", usd: "" }))).toBe("E_WALLET_ACCOUNT_UNKNOWN");
    expect(code(await own({ type: "resetPaper", venue: "paper-1", usd: "lots" }))).toBe("E_ACCOUNT_BAD_ACTION");
    const late = await svc.exchange(await signOwner(owner, { type: "resetPaper", venue: "paper-1", usd: "", nonce: START - 11 * 60_000 }));
    expect([code(late), isRefusal(late) && late.message]).toEqual(["E_ACCOUNT_EXPIRED", expect.stringContaining("good for 10 minutes")]);
  });

  it("topUpPaper: paper money added to the cash, written as put in — the balance shows it at once, and the curve counts it as no gain", async () => {
    const btc = btcOf();
    const { svc, home, own } = await boot({ sources: [krakenOf(btc)], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect((await cashOf(svc)).usd).toBe(10000);
    const words = await svc.account!.prepare({ type: "topUpPaper", venue: "paper-1", usd: "2500" });
    if (isRefusal(words)) throw new Error(words.message);
    expect(words.quote?.words).toBe("Add $2,500.00 of paper money to Paper account: $10,000.00 paper cash now, $12,500.00 after. Counted as paper money put in, not as a gain. Nothing real moves.");
    expect(code(await own({ type: "topUpPaper", venue: "paper-1", usd: "2500" }))).toBe("account");
    expect(bookOf(home)).toMatchObject({ cashUsd: 12500, startCashUsd: 10000, deposits: [{ usd: 2500 }] });
    const v = await cashOf(svc);
    expect([v.usd, v.paperStartUsd, v.paperAddedUsd]).toEqual([12500, 10000, 2500]);
    const h = await svc.paperHistory("1d", "paper-1");
    if (isRefusal(h)) throw new Error(h.message);
    expect([h.startUsd, h.addedUsd, h.sinceStartUsd]).toEqual([10000, 2500, 0]);
    // nothing to add, more than a paper account holds, a paper account not connected
    expect(code(await own({ type: "topUpPaper", venue: "paper-1", usd: "" }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect((await svc.account!.prepare({ type: "topUpPaper", venue: "paper-1", usd: "99999999" }) as Refusal).message).toBe("Paper account: a paper account holds at most $100,000,000.00 of paper cash; $99,999,999.00 more would make it $100,012,499.00");
    expect(code(await own({ type: "topUpPaper", venue: "paper-1", usd: "99999999" }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ type: "topUpPaper", venue: "paper-2", usd: "100" }))).toBe("E_ACCOUNT_BAD_ACTION");
  });

  it("a book in the home that no connection has open: listed with what connecting would continue, and started again on disk so the next connection opens the new book", async () => {
    const btc = btcOf();
    const { svc, home, own, order } = await boot({ sources: [krakenOf(btc)], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-momentum", connector: "live:paper", label: "Momentum", credentialRef: "" }))).toBe("account");
    const bought = await order("paper-momentum", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.01" });
    if (isRefusal(bought)) throw new Error(bought.message);
    expect(svc.paperBooksIdle()).toEqual([]);
    expect(code(await own({ type: "disconnectVenue", venue: "paper-momentum" }))).toBe("account");
    const idle = svc.paperBooksIdle();
    expect(idle).toEqual([{ venue: "paper-momentum", name: "Momentum · paper", cashUsd: expect.any(Number), startCashUsd: 10000, addedUsd: 0, createdAt: expect.any(String), updatedAt: expect.any(String), holdings: 1, positions: 0, open: 0 }]);
    expect(idle[0]!.cashUsd).toBeLessThan(10000);
    // B10 AT THE SERVER: a connection that names a starting sum for this id would only continue its book, the sum unused — refused with
    // words, whatever client sent it (a card's id picked from an old list); nothing is connected, the book untouched
    const kept = bookOf(home, "paper-momentum");
    const named = await own({ type: "connectVenue", venue: "paper-momentum", connector: "live:paper", label: "", credentialRef: "25000" });
    expect(code(named)).toBe("E_ACCOUNT_CREDENTIAL");
    expect(isRefusal(named) && named.message).toBe(`Momentum · paper is kept on this machine as paper-momentum, with ${cents(kept.cashUsd)} of paper cash: connecting paper-momentum continues that book, so the $25,000.00 named would not be used. Connect it with no starting money to continue it, start it again with $25,000.00, or open a paper account under another name`);
    expect((await svc.accountView())!.venues.some((v) => v.id === "paper-momentum")).toBe(false);
    expect(bookOf(home, "paper-momentum")).toEqual(kept);
    // reset while not connected: archived, and a fresh book in its place
    expect(code(await own({ type: "resetPaper", venue: "paper-momentum", usd: "5000" }))).toBe("account");
    expect(bookOf(home, "paper-momentum")).toMatchObject({ name: "Momentum · paper", cashUsd: 5000, startCashUsd: 5000, holdings: {} });
    // a sum other than the one it was just started again with is refused the same; that very sum, on the untouched new book, connects (the
    // connect form's Reset, then its connection)
    expect(code(await own({ type: "connectVenue", venue: "paper-momentum", connector: "live:paper", label: "Momentum", credentialRef: "6000" }))).toBe("E_ACCOUNT_CREDENTIAL");
    expect(code(await own({ type: "connectVenue", venue: "paper-momentum", connector: "live:paper", label: "Momentum", credentialRef: "5000" }))).toBe("account");
    expect((await cashOf(svc, "paper-momentum")).usd).toBe(5000);
    // connected again with no sum: the book continued, whatever the connection's own sum said before
    expect(code(await own({ type: "disconnectVenue", venue: "paper-momentum" }))).toBe("account");
    expect(code(await own({ type: "connectVenue", venue: "paper-momentum", connector: "live:paper", label: "Momentum", credentialRef: "" }))).toBe("account");
    expect((await cashOf(svc, "paper-momentum")).usd).toBe(5000);
  });

  it("the balance after a paper write or a look that filled is the book's at once — never the cash kept from before the fill", async () => {
    const btc = btcOf();
    const { svc, own, order } = await boot({ sources: [krakenOf(btc)], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect((await cashOf(svc)).usd).toBe(10000);
    const bought = await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.1" });
    if (isRefusal(bought) || bought.kind !== "order") throw new Error(`expected an order, got ${code(bought)}`);
    // the order's own write: the cash at once (60,010 × 0.1 and the 10 bps fee out of it), BTC held
    const v = await cashOf(svc);
    expect(v.holdings.find((h) => h.asset === "USD")!.amount).toBeCloseTo(10000 - 6001 - 6.001, 2);
    expect(v.holdings.find((h) => h.asset === "BTC")).toMatchObject({ amount: 0.1 });
    // a resting sell, filled by the account's own look when the price comes to it: the next read is the book's after it
    const resting = await order("paper-1", { symbol: "BTC/USD", side: "sell", orderType: "limit", limitPrice: "61000", qty: "0.1" });
    if (isRefusal(resting) || resting.kind !== "order") throw new Error(`expected an order, got ${code(resting)}`);
    expect(resting.order.status).toBe("open");
    await cashOf(svc);
    Object.assign(btc, { price: 61500, bid: 61490, ask: 61510 });
    expect(await svc.lookAtPaper()).toEqual(["paper-1"]);
    const w = await cashOf(svc);
    expect(w.holdings.find((h) => h.asset === "BTC")).toBeUndefined();
    expect(w.holdings.find((h) => h.asset === "USD")!.amount).toBeCloseTo(10000 - 6001 - 6.001 + 6100 - 6.1, 2);
  });

  it("an order the paper account's own rule would refuse now is refused when it is prepared — nothing to sign — and a close of the whole holding says the open sells on it go with it", async () => {
    const btc = btcOf();
    const { own, order, engine } = await boot({ sources: [krakenOf(btc)], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    // more than the paper cash: said before anything is signed
    const big = await engine.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "market", qty: "1" });
    expect(isRefusal(big) && [big.code, big.message, (big.detail as { beforeSigning?: boolean } | undefined)?.beforeSigning]).toEqual(["E_VENUE_REJECTED", "Paper account: not enough paper buying power — $60,070.01 needed, $10,000.00 free", true]);
    // bought, and a stop-loss resting on all of it: a part sold is refused before signing, saying what is free; all of it closes, and says
    // the stop goes with it
    expect(code(await order("paper-1", { symbol: "BTC/USD", side: "buy", orderType: "market", qty: "0.1" }))).toBe("order");
    expect(code(await order("paper-1", { symbol: "BTC/USD", side: "sell", orderType: "stop", qty: "0.1", stopPrice: "50000" }))).toBe("order");
    const part = await engine.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "market", qty: "0.05" });
    expect(isRefusal(part) && part.message).toContain("0.1 of it in open sell orders: at most 0 now");
    const close = await engine.prepare({ type: "liveClose", venue: "paper-1", symbol: "BTC/USD", qty: "" });
    if (isRefusal(close)) throw new Error(close.message);
    expect(close.quote?.words).toContain("its open sell order is canceled with the close");
  });

  it("every paper quote says where its price is from and when its venue answered — the moment the source read it, never the moment a cache handed it on", async () => {
    const btc = btcOf();
    // the source as a real one keeps it: the listing stamped with the moment its venue answered (public-markets.ts readLike)
    const kraken: PublicSource = { ...krakenOf(btc), listings: async (q) => readLike([btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())).map((m) => ({ ...m })), REAL - 47_000) };
    const { svc, own } = await boot({ sources: [kraken], connect: false });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    const m = await svc.liveMarket("paper-1", "BTC/USD");
    if (isRefusal(m)) throw new Error(m.message);
    expect([m.quoteAt, m.quoteFrom]).toEqual([new Date(REAL - 47_000).toISOString(), "Kraken"]);
    // its top of book is stamped with that moment too, never with now and an "up to" age
    const top = await svc.marketBook("paper-1", "BTC/USD", 5);
    if (isRefusal(top)) throw new Error(top.message);
    expect(top.book).toMatchObject({ at: new Date(REAL - 47_000).toISOString(), from: "Kraken" });
    expect("upToMs" in top.book).toBe(false);
  });
});

describe("the US stocks line kept apart from the source's searches and its history (P16: a search's refusal holds back no paper quote)", () => {
  it("a search answered 429 and a chart that did not answer leave the line answering — the share a paper account prices is asked for alone — while a 451 of this network holds every part of the source", async () => {
    const stock = (symbol: string): Listing => ({ symbol, name: symbol, kind: "stock", base: symbol, quote: "USD", price: 200, bid: 199.98, ask: 200.02, open: true, types: [], venueName: "US stocks" });
    let search: Refusal | undefined;
    let lines: string[] = [];
    const cboe: PublicSource = {
      id: "cboe",
      name: "US stocks",
      kind: "stocks",
      connectTo: "alpaca",
      connector: "live:alpaca",
      listings: async (q) => search ?? [stock(String(q.q ?? "AAPL").toUpperCase())],
      line: async (sym) => (lines.push(sym), stock(sym)),
      candles: async () => no("E_VENUE_UNREACHABLE", { venue: "cboe", message: "US stocks did not answer in time" }),
    };
    const paper = async () => {
      const b = await boot({ sources: [{ ...cboe }], connect: false });
      expect(code(await b.own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
      return b.svc;
    };
    const svc = await paper();
    // a wide search refused for its rate: the next search waits the minute out
    search = no("E_VENUE_UNREACHABLE", { venue: "cboe", message: "US stocks: too many requests", native: { status: 429 } });
    await svc.liveMarkets("paper-1", "MSFT");
    const m = await svc.liveMarket("paper-1", "AAPL");
    expect(isRefusal(m) ? m.message : m.symbol).toBe("AAPL");
    expect(lines).toEqual(["AAPL"]);
    // a chart that did not answer holds back the charts
    expect(isRefusal(await svc.candles("paper-1", "AAPL", "1d", { range: "1M" }))).toBe(true);
    const nvda = await svc.liveMarket("paper-1", "NVDA");
    expect(isRefusal(nvda) ? nvda.message : nvda.symbol).toBe("NVDA");
    expect(lines).toEqual(["AAPL", "NVDA"]);
    // a 451 — the source's provider refuses this network — holds the line too: it is not asked
    search = undefined;
    lines = [];
    const other = await paper();
    search = no("E_VENUE_GEOBLOCKED", { venue: "cboe", message: "US stocks does not serve this region" });
    await other.liveMarkets("paper-1", "AMZN");
    expect(isRefusal(await other.liveMarket("paper-1", "TSLA"))).toBe(true);
    expect(lines).toEqual([]);
  });
});

describe("a trading limit whose entry budget renews (feat/paper-live p0: the superagent no longer stops after twenty orders)", () => {
  it("signed with renewHours: entries spend the budget, a close spends none of it, and a day later the budget is counted afresh from what is still open", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const home = mkdtempSync(join(tmpdir(), "account-paper-"));
    homes.push(home);
    let at = START;
    const liveDeps: Partial<LiveDeps> = { clock: () => at, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
    const svc = await PortfolioService.create({ home, now: () => new Date(at).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: [kraken], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    let n = 0;
    const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: at + ++n } as OwnerAction));
    const ag = async (a: NoNonce<AgentAction>) => svc.exchange(await signAgent(cc, { ...a, nonce: at + ++n } as AgentAction));
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY });
    // what the owner signs: the renewal is a field of its own, after the others; a limit without it signs as it always has
    const p = await svc.account!.prepare({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper-1", perPayment: "700", budget: "1300", windowHours: 0, validUntil: START + 30 * DAY, renewHours: 24 });
    if (isRefusal(p)) throw new Error(p.message);
    expect(p.shown.map((f) => f.name)).toEqual(["agent", "scope", "allow", "perPayment", "budget", "windowHours", "validUntil", "renewHours", "nonce"]);
    const plain = await svc.account!.prepare({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper-1", perPayment: "700", budget: "1300", windowHours: 0, validUntil: START + 30 * DAY, renewHours: 0 });
    expect(!isRefusal(plain) && plain.shown.map((f) => f.name)).toEqual(["agent", "scope", "allow", "perPayment", "budget", "windowHours", "validUntil", "nonce"]);
    // only a trading limit renews, in whole hours
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "venues", allow: "paper-1", perPayment: "1", budget: "1", windowHours: 0, validUntil: START + DAY, renewHours: 24 }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper-1", perPayment: "1", budget: "1", windowHours: 0, validUntil: START + DAY, renewHours: 0.5 }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper-1", perPayment: "700", budget: "1300", windowHours: 0, validUntil: START + 30 * DAY, renewHours: 24 }))).toBe("account");
    expect(code(await own({ type: "setPolicy", change: "mode", value: "open" }))).toBe("account");
    const limitNow = async () => (await svc.accountView())!.spend.find((x) => x.agent === cc.address && x.scope === "trade")!;
    expect(await limitNow()).toMatchObject({ budgetUsd: 1300, spentUsd: 0, renewHours: 24, renewsAt: new Date(START + DAY).toISOString() });
    const buy = { type: "agentLiveOrder" as const, venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "market", qty: "", usd: "600", limitPrice: "" };
    for (let i = 0; i < 2; i++) {
      const r = await ag(buy);
      if (isRefusal(r) || r.kind !== "order") throw new Error(`expected an order, got ${code(r)}: ${isRefusal(r) ? r.message : ""}`);
    }
    // two entries spent the budget: a third is refused
    expect(code(await ag(buy))).toBe("E_MANDATE_BUDGET");
    const spent = (await limitNow()).spentUsd;
    expect(spent).toBeGreaterThan(1150);
    // a close is never kept waiting by the day's entries: a sell of what is held goes, and spends nothing
    const held = (await svc.accountView())!.venues.find((v) => v.id === "paper-1")!.holdings.find((h) => h.asset === "BTC")!.amount;
    // — but the per-order cap still holds it (it keeps a limit from selling a whole holding in one order): all of it at once, worth more
    // than the $700 an order, is refused (the superagent signs its per-order cap with room for this: ui/superagent.js SG_CLOSE_ROOM)
    const whole = await ag({ type: "agentLiveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "market", qty: String(held), usd: "", limitPrice: "" });
    expect(code(whole)).toBe("E_MANDATE_PER_ORDER_CAP");
    const sold = await ag({ type: "agentLiveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "market", qty: String(Number((held / 2).toFixed(6))), usd: "", limitPrice: "" });
    expect(isRefusal(sold) ? sold.message : sold.kind).toBe("order");
    const closed = await ag({ type: "agentLiveClose", venue: "paper-1", symbol: "BTC/USD", qty: "" });
    expect(isRefusal(closed) ? closed.message : closed.kind).toBe("order");
    expect((await limitNow()).spentUsd).toBe(spent);
    // a day later the budget is counted afresh: nothing is open, so nothing is spent, and entries go again
    at = START + DAY + 60_000;
    expect((await limitNow()).spentUsd).toBe(0);
    const again = await ag(buy);
    expect(isRefusal(again) ? again.message : again.kind).toBe("order");
    expect((await limitNow()).renewsAt).toBe(new Date(START + 2 * DAY).toISOString());
  });

  it("a close the agent changes stays a close: on a renewing entry budget its change counts against none of the budget, however little of it is left", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const home = mkdtempSync(join(tmpdir(), "account-paper-"));
    homes.push(home);
    const at = START;
    const liveDeps: Partial<LiveDeps> = { clock: () => at, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
    const svc = await PortfolioService.create({ home, now: () => new Date(at).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: [kraken], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    let n = 0;
    const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: at + ++n } as OwnerAction));
    const ag = async (a: NoNonce<AgentAction>) => svc.exchange(await signAgent(cc, { ...a, nonce: at + ++n } as AgentAction));
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY });
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "trade", allow: "paper-1", perPayment: "700", budget: "1300", windowHours: 0, validUntil: START + 30 * DAY, renewHours: 24 }))).toBe("account");
    expect(code(await own({ type: "setPolicy", change: "mode", value: "open" }))).toBe("account");
    const limitNow = async () => (await svc.accountView())!.spend.find((x) => x.agent === cc.address && x.scope === "trade")!;
    const buy = { type: "agentLiveOrder" as const, venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "market", qty: "", usd: "600", limitPrice: "" };
    for (let i = 0; i < 2; i++) expect(code(await ag(buy))).toBe("order");
    const spent = (await limitNow()).spentUsd;
    // a take-profit the agent rests on part of what it bought: a close, so it counts nothing
    const tp = await ag({ type: "agentLiveOrder", venue: "paper-1", symbol: "BTC/USD", side: "sell", orderType: "limit", qty: "0.005", usd: "", limitPrice: "70000" });
    if (isRefusal(tp) || tp.kind !== "order") throw new Error(`expected an order, got ${code(tp)}`);
    expect(tp.order.status).toBe("open");
    expect((await limitNow()).spentUsd).toBe(spent);
    // changed — its price, then its size: still a close, still counting none of the $${1300 - spent} or so left of the entry budget
    const moved = await ag({ type: "agentLiveAmend", venue: "paper-1", order: tp.order.id, qty: "", limitPrice: "69000", stopPrice: "" });
    expect(isRefusal(moved) ? moved.message : moved.kind).toBe("order");
    const grown = await ag({ type: "agentLiveAmend", venue: "paper-1", order: tp.order.id, qty: "0.008", limitPrice: "", stopPrice: "" });
    expect(isRefusal(grown) ? grown.message : grown.kind).toBe("order");
    expect((await limitNow()).spentUsd).toBe(spent);
  });
});
