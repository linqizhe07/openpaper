import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { deskPath, FEED_LEADS, FEED_ROOM_MAX, FIRST_CYCLE_MS, MAX_LEADS, outsideSeatFile, readDesk, readRoom, readRoomTail, recentAndOpen, roomPath, ROLE_SPECS, ROLES, scriptedBrain, seatFile, seatName, type Brain, type DeskFeed, type Lead, type RoleId, type RoomMessage } from "../../src/portfolio/account/desk.ts";
import { seatKey as keystoreSeatKey, seatKeyPath, slugOf } from "../../src/portfolio/account/keystore.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { MODE_RULES } from "../../src/portfolio/account/mode-rules.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { register, type LiveDeps } from "../../src/portfolio/live/index.ts";
import type { Listing, PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { LiveTrader, Market, OrderRequest, OrderState, Position } from "../../src/portfolio/live/trade.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";
import type { MarketHub } from "../../src/portfolio/live/stream-hub.ts";

/** THE SUPERAGENT (account/desk.ts): the desk at a paper account, trading on its own. Guard is the whole account's, so on paper every
 * order of the desk's would be a card; the owner signs one narrower thing — the desk's autonomy on paper — and only the desk's OWN house
 * seats that trade, at the desk's own venue, while it is a paper account, have their orders placed at once, inside each seat's limit, the
 * ledger saying the superagent placed them. Everything else at the door is answered exactly as before: an agent with no seat, an outside
 * agent in a seat, a seat that does not trade, another account's desk seat, another venue, a real-money venue, an ended session, an order
 * over the seat's limit. And what the floor draws: which seat is working on what (in memory), the brain calls in flight and each role's
 * last, the very table Search's brain saw and what it picked, Search's confidence and Risk's numbers on each lead, and the room's tail since
 * the page's last look (the feed, its route and its cursor). */
type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-12T15:00:00Z");
const REAL = 5_000_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");

const SPOT = (symbol: string, price: number, extra: Partial<Market> = {}): Market => ({ symbol, name: symbol, kind: "spot", base: symbol.split("/")[0]!, quote: "USDT", price, bid: price * 0.9995, ask: price * 1.0005, minQty: 0.0001, qtyStep: 0.0001, priceStep: 0.01, open: true, types: ["market", "limit"], volumeUsd24h: 2_000_000_000, changePct24h: 2.5, ...extra });
const PERP = (price: number): Market => ({ symbol: "ETH/USDT:USDT", name: "ETH perpetual", kind: "perp", base: "ETH", quote: "USDT", price, bid: price * 0.9995, ask: price * 1.0005, minQty: 0.0001, qtyStep: 0.0001, priceStep: 0.01, open: true, types: ["market", "limit"], reduceOnly: true, volumeUsd24h: 1_000_000_000, changePct24h: -1.2 });
const majors = (): Record<string, Market> => ({ "BTC/USDT": SPOT("BTC/USDT", 60_000), "ETH/USDT": SPOT("ETH/USDT", 3_000) });

/** a stand-in venue: market orders fill at once at the book, what is filled is held (a perpetual long or short), `markets` is the test's
 * to move between cycles */
function traderOf(markets: Record<string, Market>): LiveTrader & { placed: OrderRequest[] } {
  const states = new Map<string, OrderState>();
  const held = new Map<string, number>();
  const placed: OrderRequest[] = [];
  let n = 0;
  return {
    placed,
    can: true,
    what: "spot and perpetuals",
    async markets(q) {
      const Q = q.trim().toUpperCase();
      return Object.values(markets).filter((m) => !Q || m.symbol.toUpperCase().includes(Q) || m.base.toUpperCase().includes(Q)).map((m) => ({ ...m }));
    },
    async market(symbol) {
      return markets[symbol] ? { ...markets[symbol]! } : no("E_VENUE_REJECTED", { venue: "standin", message: `no market ${symbol}` });
    },
    async place(o) {
      placed.push(o);
      const ref = `o-${++n}`;
      const m = markets[o.symbol]!;
      const s: OrderState = o.type === "market" ? { ref, status: "filled", filledQty: o.qty, avgPrice: o.side === "buy" ? m.ask! : m.bid!, feeUsd: 0.01, native: {} } : { ref, status: "open", filledQty: 0, native: {} };
      if (s.status === "filled") held.set(o.symbol, (held.get(o.symbol) ?? 0) + (o.side === "buy" ? o.qty : -o.qty));
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
      return [...held].filter(([, q]) => Math.abs(q) > 1e-12).map(([symbol, q]): Position => ({ symbol, name: markets[symbol]!.name, kind: markets[symbol]!.kind, side: q > 0 ? "long" : "short", qty: Math.abs(q), markPrice: markets[symbol]!.price, native: {} }));
    },
  };
}

/** the venues of the boot in progress: a real exchange (ex), the desk's paper account (pap), a second paper account (pap2) */
const TR: { real: LiveTrader; paper: LiveTrader; paper2: LiveTrader } = { real: traderOf({}), paper: traderOf({}), paper2: traderOf({}) };
const standIn = (kind: string, name: string, which: keyof typeof TR, paper: boolean) =>
  register({ kind, label: name, needs: "key-file", example: "", venues: [], async open(req) {
    return { source: { name: req.label || name, kind: "cex", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDT", amount: 5000, usd: 5000 }], trader: TR[which], readOnlyBecause: "a stand-in moves no money", ...(paper ? { paper: true } : {}) } as never, first: [{ asset: "USDT", amount: 5000, usd: 5000 }], summary: "connected" };
  } });
standIn("standin-sa-real", "Ex", "real", false);
standIn("standin-sa-paper", "Paper Ex", "paper", true);
standIn("standin-sa-paper2", "Paper Two", "paper2", true);

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

const code = (o: Outcome | Refusal): string => (isRefusal(o) ? o.code : o.kind);
const summary = (o: Outcome | Refusal): string => (isRefusal(o) ? `${o.code}: ${o.message}` : o.kind === "account" ? o.summary : o.kind);

interface Script {
  search?: (input: string) => unknown;
  risk?: (input: string) => unknown;
  exit?: (input: string) => unknown;
}
/** Search names BTC (or what the test says), Risk clears $40 with a 2% take-profit and a 1% stop, Exit holds */
const scriptOf = (s: Script = {}) => ({ role, input }: { role: RoleId; input: string }) => {
  if (role === "search") return s.search ? s.search(input) : { leads: [{ symbol: "BTC/USDT", side: "buy", thesis: "BTC is up 2.5% on $2B of volume", confidence: 0.7 }], note: "majors only" };
  if (role === "risk") return s.risk ? s.risk(input) : { verdict: "clear", why: "tight spread, room in the day", sizeUsd: 40, tpPct: 2, slPct: 1, maxHours: 12 };
  if (role === "exit") return s.exit ? s.exit(input) : { decisions: [] };
  if (role === "head") return { worked: "L-0001 was placed.", change: "Nothing yet." };
  return null;
};

/** a brain the test can hold in the middle of a call: `holdNext(role)` makes that role's next call wait until released (several roles at
 * once, each its own) */
function heldBrain(s: Script = {}) {
  const inner = scriptedBrain(scriptOf(s));
  const gates = new Map<RoleId, { asked: () => void; go: Promise<void> }>();
  const brain: Brain = {
    id: "scripted",
    label: "a script",
    models: [],
    ready: () => ({ ok: true, model: "scripted", how: "a script" }),
    async decide(r) {
      const gate = gates.get(r.role);
      if (gate) {
        gates.delete(r.role);
        gate.asked();
        await gate.go;
      }
      return inner.decide(r);
    },
  };
  const holdNext = (role: RoleId) => {
    let release!: () => void;
    let asked!: () => void;
    const go = new Promise<void>((r) => (release = r));
    const seen = new Promise<void>((r) => (asked = r));
    gates.set(role, { asked, go });
    return { asked: seen, release };
  };
  return { brain, holdNext };
}

async function boot(o: { home?: string; brain?: Brain; paper?: Record<string, Market>; real?: Record<string, Market>; at?: number; publicMarkets?: PublicSource[]; streams?: MarketHub } = {}) {
  const home = o.home ?? mkdtempSync(join(tmpdir(), "account-superagent-"));
  if (!o.home) homes.push(home);
  const paper = o.paper ?? majors();
  const real = o.real ?? majors();
  TR.paper = traderOf(paper);
  TR.paper2 = traderOf(majors());
  TR.real = traderOf(real);
  let n = 0;
  let skew = o.at ?? 0;
  const liveDeps: Partial<LiveDeps> = { clock: () => REAL + skew, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({ home, now: () => new Date(START + skew).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: o.publicMarkets ?? [], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] }, desk: { brain: o.brain ?? scriptedBrain(scriptOf()), tickMs: 0 }, ...(o.streams ? { streams: o.streams } : {}) });
  await svc.restoring;
  const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + skew + ++n } as OwnerAction));
  const as = async (key: ReturnType<typeof simKey>, a: NoNonce<AgentAction>) => svc.exchange(await signAgent(key, { ...a, nonce: START + skew + ++n } as AgentAction));
  /** a key that is not an owner signing an owner's instruction */
  const forged = async (key: ReturnType<typeof simKey>, a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(key, { ...a, nonce: START + skew + ++n } as OwnerAction));
  const desk = svc.desk!;
  if (!o.home)
    for (const [venue, connector, label] of [["ex", "live:standin-sa-real", "Ex"], ["pap", "live:standin-sa-paper", "Paper Ex"], ["pap2", "live:standin-sa-paper2", "Paper Two"]] as const) {
      const r = await own({ type: "connectVenue", venue, connector, label, credentialRef: "" });
      if (isRefusal(r)) throw new Error(r.message);
    }
  const advance = (ms: number) => void (skew += ms);
  const keyOf = (role: RoleId) => {
    const k = desk.seatKeyOf(role);
    if (isRefusal(k)) throw new Error(k.message);
    return k;
  };
  const letIn = async (address: string, name: string) => {
    const r = await own({ type: "approveAgent", agentAddress: address as `0x${string}`, agentName: name, validUntil: START + skew + 30 * DAY });
    if (isRefusal(r)) throw new Error(`${name}: ${r.message}`);
  };
  const limitFor = async (address: string, allow = "pap", per = "100", budget = "500") => {
    const r = await own({ type: "approveSpend", agent: address as `0x${string}`, scope: "trade", allow, perPayment: per, budget, windowHours: 0, validUntil: START + skew + 7 * DAY });
    if (isRefusal(r)) throw new Error(`limit: ${r.message}`);
  };
  const limit = (role: RoleId, allow = "pap", per = "100", budget = "500") => limitFor(keyOf(role).address, allow, per, budget);
  const hire = async (objective: Record<string, unknown> = {}, roles: RoleId[] = ["head", "search", "risk", "sniper", "exit"]) => {
    for (const r of roles) await letIn(keyOf(r).address, `Desk ${ROLE_SPECS[r].name.replace(" of desk", "")}`);
    for (const r of roles) if (ROLE_SPECS[r].trades) await limit(r, String(objective.venue ?? "pap"));
    return own({ type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: "Superagent", objective: { text: "Small entries on the majors, on paper", venue: "pap", universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 5, reportAt: "21:00", maxOpen: 3, ...objective }, brain: { model: "claude-opus-5-5", effort: "medium" }, roles: roles.map((role) => ({ role, kind: "house" })) }) });
  };
  const autonomy = (paper: unknown) => own({ type: "setDesk", desk: "desk", change: "autonomy", value: JSON.stringify({ paper }) });
  const ledger = () => readFileSync(svc.ledgerPath(), "utf8").split("\n").filter(Boolean).map((x) => JSON.parse(x) as { kind?: string; tool?: string; outcome?: string; reason?: string; venue?: string });
  const order = (venue: string, usd = "20", symbol = "BTC/USDT") => ({ type: "agentLiveOrder" as const, venue, symbol, side: "buy", orderType: "market", qty: "", usd, limitPrice: "" });
  return { svc, desk, home, own, as, forged, advance, keyOf, letIn, limitFor, limit, hire, autonomy, ledger, order, paper, real };
}

describe("the superagent: the desk's autonomy on paper", () => {
  it("is the owner's to sign, taken only while the desk's venue is a paper account (off anywhere), and the room, the ledger, the view, the catalog, the mode rules and a restart keep it", async () => {
    // a desk at the real exchange: autonomy is refused there, turning it off is taken
    const onReal = await boot();
    expect(code(await onReal.hire({ venue: "ex" }))).toBe("account");
    const refused = await onReal.autonomy(true);
    expect(isRefusal(refused) && refused.message).toMatch(/^Ex is real money: the desk places orders without cards only at a paper account/);
    expect((await onReal.desk.view())!.autonomy).toBeUndefined();
    expect(summary(await onReal.autonomy(false))).toBe("the desk's orders wait for the owner on cards (autonomy off)");

    const { desk, hire, autonomy, forged, keyOf, ledger, home, svc } = await boot();
    expect(desk.catalog().autonomy).toBeNull();
    expect(code(await hire())).toBe("account");
    // the value is a yes or a no, nothing else
    for (const bad of ["yes", 1, null]) expect(code(await autonomy(bad))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await svc.exchange(await signOwner(owner, { type: "setDesk", desk: "desk", change: "autonomy", value: "", nonce: START + 900 })))).toBe("E_ACCOUNT_BAD_ACTION");
    // a seat's key cannot sign it: it is the owner's instruction
    expect(code(await forged(keyOf("sniper"), { type: "setDesk", desk: "desk", change: "autonomy", value: JSON.stringify({ paper: true }) }))).toBe("E_ACCOUNT_OWNER_ONLY");
    expect((await desk.view())!.autonomy).toBeUndefined();
    const on = await autonomy(true);
    expect(summary(on)).toBe("the desk trades on its own at Paper Ex (paper money), inside each seat's trading limit");
    const v = (await desk.view())!;
    expect(v.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    expect(desk.catalog().autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    expect(readDesk(home)?.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    expect(readRoom(home).at(-1)).toMatchObject({ from: "you", kind: "you", text: expect.stringMatching(/^You let the desk trade on its own at Paper Ex, paper money: .* each inside its seat's trading limit\. Every other agent and every other venue is answered as before\.$/) });
    expect(ledger().find((r) => r.tool === "setDesk" && r.reason?.startsWith("the desk trades on its own"))?.outcome).toBe("ok");
    // the Mode sheet and the agents' account read say Guard's one exception
    const row = MODE_RULES.find((r) => r.door === "The desk's own seats at its paper account");
    expect(row?.guard).toMatch(/^At once inside each seat's trading limit once you sign the desk's autonomy on paper; until then, waits on a card$/);
    expect((await svc.accountView())!.modeRules.rows.some((r) => r.door === row?.door)).toBe(true);
    // a restart reads it back from the desk's file
    const again = await boot({ home, at: 60_000 });
    expect((await again.desk.view())!.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
  });

  it("in Guard, the desk's own seats' orders at its paper account go at once inside their limits — the entry and the close — and the ledger says the superagent placed them", async () => {
    const { desk, hire, autonomy, svc, ledger, home, paper, advance, keyOf } = await boot();
    await hire();
    await autonomy(true);
    // the account stays in Guard: nobody signed the dial open
    expect(ledger().some((r) => r.tool === "setPolicy")).toBe(false);
    await desk.cycle("test");
    let v = (await desk.view())!;
    expect(v.open.map((l) => [l.id, l.state, l.order !== undefined, l.card])).toEqual([["L-0001", "executed", true, undefined]]);
    expect(v.cards).toEqual([]);
    expect((await svc.accountView())!.cards).toEqual([]);
    expect(readRoom(home).find((m) => m.from === "sniper" && m.kind === "order")?.text).toMatch(/^L-0001: filled, bought .* BTC at .* at Paper Ex \(on its own on paper, inside the limit\)\.$/);
    const entryRow = ledger().find((r) => r.tool === "agentLiveOrder" && r.outcome === "accepted");
    expect(entryRow?.reason).toMatch(/^Superagent on paper \(Desk Sniper, the desk's autonomy you signed\): PAPER · buy .*BTC.*, inside the trading limit$/);
    expect(entryRow?.venue).toBe("pap");
    // counted against the Sniper's limit, as Beast counts it
    const spent = (await svc.accountView())!.spend.find((s) => s.agent === keyOf("sniper").address && s.scope === "trade");
    // (the $40 the Risk seat cleared, in whole steps of 0.0001 BTC: what was bought is what was counted)
    expect(spent!.spentUsd).toBeGreaterThan(30);
    expect(spent!.spentUsd).toBeLessThanOrEqual(40);
    // the mark passes the take-profit: the Exit's close goes at once too
    paper["BTC/USDT"] = SPOT("BTC/USDT", 61_800);
    advance(10 * 60_000);
    await desk.cycle("test");
    v = (await desk.view())!;
    const closed = v.recent.find((l) => l.id === "L-0001")!;
    expect(closed.state).toBe("closed");
    expect(closed.exitWhy).toMatch(/^TP HIT at 61,800 /);
    expect((await svc.accountView())!.cards).toEqual([]);
    expect(ledger().find((r) => r.tool === "agentLiveOrder" && r.outcome === "accepted" && r.reason?.startsWith("Superagent on paper (Desk Exit"))?.reason).toMatch(/: PAPER · sell .*BTC.*, inside the trading limit$/);
  });

  it("a perpetual's close (agentLiveClose) goes at once inside the Exit's per-order line, and waits on a card above it — as in Beast", async () => {
    const brain = scriptedBrain(scriptOf({ search: () => ({ leads: [{ symbol: "ETH/USDT:USDT", side: "sell", thesis: "funding turned, ETH perp down 1.2%", confidence: 0.6 }], note: "" }) }));
    const first = await boot({ brain, paper: { "ETH/USDT:USDT": PERP(3_000) } });
    await first.hire();
    await first.autonomy(true);
    await first.desk.cycle("test");
    expect((await first.desk.view())!.open.map((l) => [l.symbol, l.side, l.state])).toEqual([["ETH/USDT:USDT", "sell", "executed"]]);
    first.paper["ETH/USDT:USDT"] = PERP(2_910);
    first.advance(10 * 60_000);
    await first.desk.cycle("test");
    const closed = (await first.desk.view())!.recent.find((l) => l.id === "L-0001")!;
    expect([closed.state, closed.exitWhy?.slice(0, 6)]).toEqual(["closed", "TP HIT"]);
    expect(first.ledger().find((r) => r.tool === "agentLiveClose" && r.outcome === "accepted")?.reason).toMatch(/^Superagent on paper \(Desk Exit, the desk's autonomy you signed\): close .* ETH of ETH perpetual, inside the trading limit$/);

    // the Exit's per-order line under what the close is worth: a card, as Beast raises one
    const second = await boot({ brain, paper: { "ETH/USDT:USDT": PERP(3_000) } });
    await second.hire();
    await second.autonomy(true);
    await second.desk.cycle("test");
    await second.limit("exit", "pap", "10", "500");
    second.paper["ETH/USDT:USDT"] = PERP(2_910);
    second.advance(10 * 60_000);
    await second.desk.cycle("test");
    const v = (await second.desk.view())!;
    expect(v.open.map((l) => [l.id, l.state, l.card?.startsWith("card-")])).toEqual([["L-0001", "closing", true]]);
    expect(readRoom(second.home).find((m) => m.from === "exit" && m.kind === "card")?.text).toMatch(/the close waits for you on card-\d+ \(Guard\)/);
  });

  it("everything else is answered exactly as before: no seat, an outside agent in a seat, a seat that does not trade, another account's desk seat, another venue, a real-money venue, autonomy off, an ended session — cards; over the seat's limit — refused; Beast — Beast", async () => {
    const { desk, hire, autonomy, as, own, letIn, limitFor, limit, keyOf, ledger, order, svc, advance } = await boot();
    await hire();
    await autonomy(true);
    const sniper = keyOf("sniper");
    await limit("sniper", "pap,pap2,ex");
    // the seat's own order at its paper account, inside the limit: at once
    expect(code(await as(sniper, order("pap")))).toBe("order");
    // an agent with no seat, let in, with a limit at the same paper account
    await letIn(cc.address, "Claude Code");
    await limitFor(cc.address, "pap");
    expect(code(await as(cc, order("pap")))).toBe("card");
    // the same agent holding a trading seat as an outside agent
    expect(code(await own({ type: "setDesk", desk: "desk", change: "seat", value: JSON.stringify({ role: "watch", kind: "outside", address: cc.address }) }))).toBe("account");
    expect(desk.autonomyFor(cc.address, "pap")).toBeUndefined();
    expect(code(await as(cc, order("pap")))).toBe("card");
    // a house seat that does not trade, which the owner gave a limit anyway: the door takes its order, never without a card
    await limit("search", "pap");
    expect(code(await as(keyOf("search"), order("pap")))).toBe("card");
    // another account's desk Sniper (its own home, its own key), let in here with a limit at the paper account
    const other = await boot();
    const theirs = other.keyOf("sniper");
    expect(theirs.address).not.toBe(sniper.address);
    await letIn(theirs.address, "Their Sniper");
    await limitFor(theirs.address, "pap");
    expect(code(await as(theirs, order("pap")))).toBe("card");
    // the desk's own Sniper at another paper account, and at the real exchange
    expect(code(await as(sniper, order("pap2")))).toBe("card");
    expect(code(await as(sniper, order("ex")))).toBe("card");
    // over the seat's limit: refused before any card, nothing placed — as in Guard and Beast
    const cardsBefore = (await svc.accountView())!.cards.length;
    const over = await as(sniper, order("pap", "150"));
    expect(code(over)).toBe("E_MANDATE_PER_ORDER_CAP");
    await limit("sniper", "pap", "100", "150");
    expect(code(await as(sniper, order("pap", "100")))).toBe("order");
    expect(code(await as(sniper, order("pap", "100")))).toBe("E_MANDATE_BUDGET");
    expect((await svc.accountView())!.cards.length).toBe(cardsBefore);
    // autonomy off: the Sniper's order is a card again
    await limit("sniper", "pap", "100", "500");
    await autonomy(false);
    expect(code(await as(sniper, order("pap")))).toBe("card");
    // on again; then the session past its hours (before the clock has ended it): a card; ended: a card
    await autonomy(true);
    expect(code(await as(sniper, order("pap")))).toBe("order");
    advance(22 * HOUR);
    expect(code(await as(sniper, order("pap")))).toBe("card");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "end", value: "" }))).toBe("account");
    expect(code(await as(sniper, order("pap")))).toBe("card");
    // Beast is Beast: at once, in its own words, for anyone inside a limit
    await own({ type: "setPolicy", change: "mode", value: "open" });
    expect(code(await as(cc, order("pap")))).toBe("order");
    const rows = ledger().filter((r) => r.tool === "agentLiveOrder" && r.outcome === "accepted");
    expect(rows.at(-1)?.reason).toMatch(/^Beast: /);
    expect(rows.filter((r) => r.reason?.startsWith("Superagent on paper (Desk Sniper"))).toHaveLength(3);
  });

  it("a venue move whose brain is refused moves nothing: the desk stays at its venue with its objective, its autonomy follows the same venue, and desk.json is untouched", async () => {
    const { desk, hire, autonomy, own, home, keyOf } = await boot();
    await hire();
    await autonomy(true);
    const was = (await desk.view())!.objective;
    const saved = readFileSync(deskPath(home), "utf8");
    const r = await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ venue: "pap2", text: "Elsewhere", brain: { provider: "grok", model: "grok-4.3" } }) });
    expect(isRefusal(r) && r.message).toBe('"grok" is not a brain this account holds: scripted');
    expect((await desk.view())!.objective).toEqual(was);
    expect(was.venue).toBe("pap");
    expect(readFileSync(deskPath(home), "utf8")).toBe(saved);
    // the door's question still follows the venue the desk is at
    expect(desk.autonomyFor(keyOf("sniper").address, "pap")).toBe("Superagent on paper (Desk Sniper, the desk's autonomy you signed)");
    expect(desk.autonomyFor(keyOf("sniper").address, "pap2")).toBeUndefined();
  });

  it("the venue: with autonomy on the desk moves only to another paper account; off, anywhere; a re-hire starts with it off; a venue that is no longer paper turns it off", async () => {
    const { desk, hire, autonomy, own, home, real, keyOf } = await boot();
    await hire();
    await autonomy(true);
    const objective = (venue: string) => own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ venue }) });
    const toReal = await objective("ex");
    expect(isRefusal(toReal) && toReal.message).toBe('the desk trades on its own on paper (autonomy): Ex is real money, so it does not move there with autonomy on. Turn it off first (autonomy {"paper": false}), and its orders there wait on cards');
    expect(code(await objective("pap2"))).toBe("account");
    let v = (await desk.view())!;
    expect([v.objective.venue, v.autonomy?.paper]).toEqual(["pap2", true]);
    // the door's question follows the desk: its Sniper at the new paper account, not at the old one
    expect(desk.autonomyFor(keyOf("sniper").address, "pap2")).toBe("Superagent on paper (Desk Sniper, the desk's autonomy you signed)");
    expect(desk.autonomyFor(keyOf("sniper").address, "pap")).toBeUndefined();
    expect(desk.autonomyFor(keyOf("search").address, "pap2")).toBeUndefined();
    await autonomy(false);
    expect(code(await objective("ex"))).toBe("account");
    expect((await desk.view())!.autonomy?.paper).toBe(false);
    // a new hire is a new desk: its autonomy is said again
    expect(code(await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ venue: "pap" }) }))).toBe("account");
    await autonomy(true);
    expect(code(await own({ type: "setDesk", desk: "desk", change: "end", value: "" }))).toBe("account");
    expect(code(await hire())).toBe("account");
    expect((await desk.view())!.autonomy).toBeUndefined();
    // the paper account's id connected again to a real exchange: the next cycle turns autonomy off and says why
    await autonomy(true);
    expect(code(await own({ type: "disconnectVenue", venue: "pap" }))).toBe("account");
    real["BTC/USDT"] = SPOT("BTC/USDT", 60_000);
    expect(code(await own({ type: "connectVenue", venue: "pap", connector: "live:standin-sa-real", label: "Not paper", credentialRef: "" }))).toBe("account");
    await desk.cycle("test");
    v = (await desk.view())!;
    expect(v.autonomy?.paper).toBe(false);
    expect(readRoom(home).some((m) => m.from === "account" && m.text === "Not paper is not a paper account now: the desk's autonomy is off, and its orders wait on cards (Guard) unless the account is in Beast.")).toBe(true);
  });
});

describe("what the floor draws", () => {
  it("which seat is working on what, the brain calls in flight, each role's last call — held mid-call; a cycle asked meanwhile says one is under way; a restart clears it", async () => {
    // Search names BTC, then ETH: each cycle has a lead for Risk to clear
    let named = 0;
    const { brain, holdNext } = heldBrain({ search: () => ({ leads: [{ symbol: named++ === 0 ? "BTC/USDT" : "ETH/USDT", side: "buy", thesis: "up on volume", confidence: 0.6 }], note: "" }) });
    const { desk, hire, autonomy, own, home, ledger, advance } = await boot({ brain });
    await hire();
    await autonomy(true);
    let f = (await desk.feed(0))!;
    expect([f.working, f.inFlight, f.lastThink]).toEqual([null, 0, {}]);
    const search = holdNext("search");
    const run = desk.cycle("test");
    await search.asked;
    f = (await desk.feed(0))!;
    expect(f.working).toEqual({ role: "search", what: "scan", since: new Date(START).toISOString() });
    expect(f.inFlight).toBe(1);
    // the owner asks for a cycle now: one is under way, and the answer says so instead of "a cycle ran"
    const asked = await own({ type: "setDesk", desk: "desk", change: "cycle", value: "" });
    expect(summary(asked)).toBe("a cycle is under way: none was started on top of it");
    expect(readRoom(home).at(-1)).toMatchObject({ from: "account", kind: "note", text: "A cycle is under way: the desk runs one step at a time, so none was started on top of it." });
    expect(ledger().some((r) => r.tool === "setDesk" && r.reason === "a cycle is under way: none was started on top of it")).toBe(true);
    search.release();
    expect(await run).toBe(true);
    f = (await desk.feed(0))!;
    expect([f.working, f.inFlight]).toEqual([null, 0]);
    expect(f.lastThink.search).toMatchObject({ at: new Date(START).toISOString(), ok: true });
    expect(f.lastThink.search!.ms).toBeGreaterThanOrEqual(0);
    expect(f.lastThink.risk).toMatchObject({ ok: true });
    // Risk held on the next lead: the step names the lead
    advance(10 * 60_000);
    const risk = holdNext("risk");
    const next = desk.cycle("test");
    await risk.asked;
    expect((await desk.feed(0))!.working).toEqual({ role: "risk", what: "clear", lead: "L-0002", since: new Date(START + 10 * 60_000).toISOString() });
    risk.release();
    await next;
    // a restart: nothing is drawn as working, no last call is remembered
    const again = await boot({ home, brain, at: 20 * 60_000 });
    f = (await again.desk.feed(0))!;
    expect([f.working, f.inFlight, f.lastThink]).toEqual([null, 0, {}]);
  });

  it("steps that overlap — the clock's cycle and the owner's report beside it — each take off only themselves: nothing stale is left working", async () => {
    // Search names nothing: the cycle is the scan alone, and needs nothing of the door the held report is in
    const { brain, holdNext } = heldBrain({ search: () => ({ leads: [], note: "" }) });
    const { desk, hire, own } = await boot({ brain });
    await hire();
    const search = holdNext("search");
    const run = desk.cycle("test");
    await search.asked;
    const head = holdNext("head");
    const report = own({ type: "setDesk", desk: "desk", change: "report", value: "" });
    await head.asked;
    expect((await desk.feed(0))!.working).toMatchObject({ role: "head", what: "report" });
    expect((await desk.feed(0))!.inFlight).toBe(2);
    // the scan began first and ends first: the report still under way is what shows
    search.release();
    await run;
    expect((await desk.feed(0))!.working).toMatchObject({ role: "head", what: "report" });
    expect((await desk.feed(0))!.inFlight).toBe(1);
    head.release();
    expect(summary(await report)).toBe("the report was written");
    expect((await desk.feed(0))!.working).toBeNull();
    expect((await desk.feed(0))!.inFlight).toBe(0);
  });

  it("the owner's cycle is started and answered at once — its orders go through the same door after the answer, so the door is never held", async () => {
    const { desk, hire, autonomy, own, home } = await boot();
    await hire();
    await autonomy(true);
    const answer = await Promise.race([own({ type: "setDesk", desk: "desk", change: "cycle", value: "" }), new Promise<"held">((r) => setTimeout(() => r("held"), 3_000))]);
    expect(answer !== "held" && summary(answer)).toBe("a cycle started: its steps are in the room as they happen");
    await desk.idle();
    expect((await desk.view())!.open.map((l) => [l.id, l.state])).toEqual([["L-0001", "executed"]]);
    expect(readRoom(home).some((m) => m.from === "head" && m.kind === "cycle" && m.text.includes("(you asked): 1 lead scanned, 1 cleared, 1 placed"))).toBe(true);
  });

  it("Search's scan is kept: the very table its brain saw (at most 40 rows), what it picked and how sure; Risk's numbers on each lead; a cycle that does not reach Search leaves it; a seat reads its counts", async () => {
    const many: Record<string, Market> = {};
    for (let i = 0; i < 45; i++) many[`C${String(i).padStart(2, "0")}/USDT`] = SPOT(`C${String(i).padStart(2, "0")}/USDT`, 10 + i, { volumeUsd24h: 1_000_000 * (i + 1) });
    many["BTC/USDT"] = SPOT("BTC/USDT", 60_000);
    many["WIDE/USDT"] = SPOT("WIDE/USDT", 100, { bid: 99, ask: 101, volumeUsd24h: 9e12 });
    let shown = "";
    let pick = "BTC/USDT";
    const brain = scriptedBrain(scriptOf({ search: (input) => ((shown = input), { leads: [{ symbol: pick, side: "buy", thesis: "a number in the table", confidence: 0.734 }], note: "the majors lead" }) }));
    // the real exchange lists BTC and WIDE too: Markets ranks rows by the real venues' volume (a paper line never sets it)
    const { desk, hire, autonomy, own, home, advance } = await boot({ brain, paper: many, real: { "BTC/USDT": SPOT("BTC/USDT", 60_000), "WIDE/USDT": SPOT("WIDE/USDT", 100, { volumeUsd24h: 9e12 }) } });
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    const table = JSON.parse(/Markets now \(the account's own listing\): (\[.*\])\. Name at most three leads/.exec(shown)![1]!) as Array<{ symbol: string; name: string; kind: string; price: number; changePct24h?: number; volumeUsd24h?: number }>;
    let v = (await desk.view())!;
    const scan = v.lastScan!;
    expect(scan).toMatchObject({ cycle: 1, at: new Date(START).toISOString(), venue: "pap", note: "the majors lead" });
    expect(table).toHaveLength(40);
    expect(scan.rows).toEqual(table.map((t) => ({ symbol: t.symbol, name: t.name, kind: t.kind, price: t.price, ...(t.changePct24h !== undefined ? { changePct24h: t.changePct24h } : {}), ...(t.volumeUsd24h !== undefined ? { volumeUsd24h: t.volumeUsd24h } : {}) })));
    expect(scan.picked).toEqual([{ lead: "L-0001", symbol: "BTC/USDT", side: "buy", confidence: 0.73 }]);
    expect(readDesk(home)?.lastScan).toEqual(scan);
    // the lead carries Search's confidence and Risk's hard-check numbers: 1% of $5,000; 5% of it as the day's loss room
    const lead = v.open.find((l) => l.id === "L-0001")!;
    expect(lead.confidence).toBe(0.73);
    expect(lead.checks).toEqual({ spreadPct: 0.1, maxSizeUsd: 50, lossRoomUsd: 250, minNotionalUsd: null });
    expect(readRoom(home).find((m) => m.kind === "lead")?.text).toContain("| confidence 0.73 → RISK");
    // a lead Risk rejects keeps the numbers that rejected it
    pick = "WIDE/USDT";
    advance(10 * 60_000);
    await desk.cycle("test");
    v = (await desk.view())!;
    const wide = v.recent.find((l) => l.symbol === "WIDE/USDT")!;
    expect(wide.state).toBe("rejected");
    expect(wide.checks?.spreadPct).toBeCloseTo(2, 4);
    expect(v.lastScan?.cycle).toBe(2);
    // paused: the cycle never reaches Search, and the scan stays the last one that did
    expect(code(await own({ type: "setDesk", desk: "desk", change: "pause", value: "" }))).toBe("account");
    advance(10 * 60_000);
    await desk.cycle("test");
    v = (await desk.view())!;
    expect(v.session?.cycles).toBe(3);
    expect(v.lastScan?.cycle).toBe(2);
    // a universe the venue lists nothing in: Search is reached, no table is shown, and the scan says why
    expect(code(await own({ type: "setDesk", desk: "desk", change: "resume", value: "" }))).toBe("account");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ universe: "predictions" }) }))).toBe("account");
    advance(10 * 60_000);
    await desk.cycle("test");
    v = (await desk.view())!;
    expect(v.lastScan).toMatchObject({ cycle: 4, rows: [], picked: [], note: "Paper Ex lists nothing in the Prediction markets universe right now." });
    // an outside seat's read (portfolio_desk) carries the autonomy and the last scan's counts
    await own({ type: "approveAgent", agentAddress: cc.address as `0x${string}`, agentName: "Claude Code", validUntil: START + 30 * DAY });
    await own({ type: "setDesk", desk: "desk", change: "seat", value: JSON.stringify({ role: "flow", kind: "outside", address: cc.address }) });
    const mine = await desk.forSeat(cc.address);
    if (isRefusal(mine)) throw new Error(mine.message);
    expect(mine.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    expect(mine.lastScan).toEqual({ cycle: 4, at: new Date(START + 30 * 60_000).toISOString(), venue: "pap", scanned: 0, picked: 0, note: "Paper Ex lists nothing in the Prediction markets universe right now." });
    const mcp = readFileSync(join(process.cwd(), "src/portfolio/mcp.ts"), "utf8");
    const described = /"portfolio_desk",\s*\{\s*description:\s*"([^"]+)"/.exec(mcp)?.[1] ?? "";
    expect(described).toContain("`autonomy` (`paper: true` when the owner signed that the desk's OWN house seats place their orders at its paper account without cards");
    expect(described).toContain("`lastScan` (what Search scanned last");
  });
});

describe("the floor's feed", () => {
  // the spec's shape, and beside it what the floor needs without a second read: the name, the objective, the seats, Risk's spread line
  const SHAPE = ["autonomy", "brain", "equity", "funnel", "inFlight", "lastScan", "lastThink", "leads", "room", "routines", "seq", "session", "target", "today", "venue", "working", "name", "objective", "seats", "hard"].sort();

  it("the room after a seq, oldest first, at most 200 (the newest); the rest of the shape from the desk's own record; a since past the room reads as 0", async () => {
    const { desk, hire, autonomy, own, as, home } = await boot();
    expect(await desk.feed(0)).toBeUndefined();
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    const room = readRoom(home);
    const seq = room.at(-1)!.seq;
    const f = (await desk.feed(0))!;
    expect(Object.keys(f).sort()).toEqual(SHAPE);
    expect(f.seq).toBe(seq);
    expect(f.room).toEqual(room);
    expect((await desk.feed(seq))!.room).toEqual([]);
    expect((await desk.feed(seq - 2))!.room.map((m) => m.seq)).toEqual([seq - 1, seq]);
    expect((await desk.feed(seq + 50))!.room).toEqual(room);
    expect(f.session).toEqual({ state: "live", startedAt: new Date(START).toISOString(), endsAt: new Date(START + 22 * HOUR).toISOString(), hours: 22, cycles: 1 });
    expect(f.venue).toEqual({ id: "pap", name: "Paper Ex", usd: 5000, paper: true, connected: true });
    expect(f.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    expect(f.lastScan?.picked).toEqual([{ lead: "L-0001", symbol: "BTC/USDT", side: "buy", confidence: 0.7 }]);
    expect(f.equity).toMatchObject({ startUsd: 5000 });
    expect(f.equity.tail.length).toBeGreaterThan(0);
    expect(f.equity.tail.length).toBeLessThanOrEqual(120);
    expect(f.funnel).toMatchObject({ scanned: 1, cleared: 1, executed: 1 });
    expect(f.routines).toEqual({ everyMin: 5, nextCycleAt: new Date(START + 5 * 60_000).toISOString() });
    expect(f.brain).toMatchObject({ ok: true, label: "a script", model: "claude-opus-5-5", spend: { calls: 2 } });
    expect([f.name, f.objective.venue, f.objective.maxRiskPct, f.objective.maxOpen, f.hard]).toEqual(["Superagent", "pap", 1, 3, { maxSpreadPct: 0.6 }]);
    expect(f.seats.map((x) => [x.role, x.kind, x.status, x.limit?.perOrderUsd])).toEqual([["head", "house", "ok", undefined], ["search", "house", "ok", undefined], ["risk", "house", "ok", undefined], ["sniper", "house", "ok", 100], ["exit", "house", "ok", 100]]);
    expect(f.leads).toHaveLength(1);
    const lead = f.leads[0]!;
    expect(Object.keys(lead).filter((k) => (lead as unknown as Record<string, unknown>)[k] !== undefined).sort()).toEqual(["at", "checks", "cleared", "confidence", "entry", "id", "kind", "maxHours", "name", "side", "sizeUsd", "slPct", "state", "symbol", "thesis", "tpPct", "updatedAt"]);
    expect(lead.entry).toEqual({ price: expect.any(Number), qty: expect.any(Number), at: new Date(START).toISOString() });
    // more than 200 new lines: the newest 200, oldest first
    await own({ type: "approveAgent", agentAddress: cc.address as `0x${string}`, agentName: "Claude Code", validUntil: START + 30 * DAY });
    await own({ type: "setDesk", desk: "desk", change: "seat", value: JSON.stringify({ role: "flow", kind: "outside", address: cc.address }) });
    for (let i = 0; i < 230; i++) expect(code(await as(cc, { type: "agentDeskSay", lead: "", kind: "note", text: `flow line ${i} — café ünïcode` }))).toBe("account");
    const big = (await desk.feed(seq))!;
    expect(big.room).toHaveLength(FEED_ROOM_MAX);
    expect(big.room.at(-1)?.seq).toBe(big.seq);
    expect(big.room[0]?.seq).toBe(big.seq - FEED_ROOM_MAX + 1);
    expect(big.room.at(-1)?.text).toBe("flow line 229 — café ünïcode");
  });

  it("the room's tail is read from the end, a chunk at a time: lines and characters across chunks whole, a half-written last line skipped, no file no lines", () => {
    const home = mkdtempSync(join(tmpdir(), "account-roomtail-"));
    homes.push(home);
    expect(readRoomTail(home, 0)).toEqual([]);
    mkdirSync(join(home, "desk"), { recursive: true });
    const lines: RoomMessage[] = [];
    // lines of uneven length with characters of two, three and four bytes, so chunk edges fall inside them
    for (let seq = 1; seq <= 3000; seq++) lines.push({ seq, at: new Date(START + seq * 1000).toISOString(), from: "search", kind: "note", text: `${"é".repeat(seq % 37)}…${"𝄞".repeat(seq % 11)} line ${seq}` });
    writeFileSync(roomPath(home), `${lines.map((m) => JSON.stringify(m)).join("\n")}\n{"seq":3001,"at":"2026-`);
    expect(readFileSync(roomPath(home)).length).toBeGreaterThan(3 * 64 * 1024);
    expect(readRoomTail(home, 2990)).toEqual(lines.slice(2990));
    expect(readRoomTail(home, 0)).toEqual(lines.slice(-FEED_ROOM_MAX));
    expect(readRoomTail(home, 0, 5000)).toEqual(lines);
    expect(readRoomTail(home, 3000)).toEqual([]);
    expect(readRoom(home, 10)).toEqual(lines.slice(-9));
  });

  it("GET /api/account/desk/feed: since is a whole number in digits or nothing; no desk yet answers desk null; a desk answers the shape", async () => {
    const { svc, hire, autonomy, desk } = await boot();
    const server = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const get = async (q: string) => {
        const r = await fetch(`${server.url}/api/account/desk/feed${q}`);
        return { status: r.status, body: (await r.json()) as Record<string, unknown> };
      };
      expect(await get("?since=0")).toEqual({ status: 200, body: { ok: true, desk: null } });
      for (const q of ["?since=abc", "?since=-1", "?since=1.5", "?since=1e3", "?since=0x10", "?since=%201", "?since=1&since=2", "?since=1234567890123456"]) {
        const r = await get(q);
        expect(r.status, q).toBe(400);
        expect(r.body.ok, q).toBe(false);
      }
      expect(code(await hire())).toBe("account");
      await autonomy(true);
      await desk.cycle("test");
      const r = await get("?since=0");
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(["ok", ...SHAPE].sort());
      const seq = r.body.seq as number;
      expect((r.body.room as RoomMessage[]).at(-1)?.seq).toBe(seq);
      const tail = await get(`?since=${seq - 1}`);
      expect((tail.body.room as RoomMessage[]).map((m) => m.seq)).toEqual([seq]);
      expect((await get("")).body.seq).toBe(seq);
      expect(((await get("?since=0007")).body as unknown as DeskFeed).room[0]?.seq).toBe(8);
    } finally {
      await server.close();
    }
  });
});

describe("the desk's own names in the seats folder", () => {
  it("an outside seat whose name would open a house seat's key file is given a file of its own: a client calling itself Desk Sniper signs with its own key, and under autonomy its order at the paper account still waits on a card", async () => {
    // every house seat's file and display name, however a client spells it, maps out of the desk's namespace
    for (const role of ROLES)
      for (const name of [seatFile(role), seatName(role), seatName(role).toUpperCase(), `  ${seatName(role)}!`, seatFile(role).replace("-", " ")]) expect(outsideSeatFile(name), name).toBe(`mcp-${seatFile(role)}`);
    expect(outsideSeatFile("Desk")).toBe("mcp-desk");
    expect(outsideSeatFile("desk-anything-new")).toBe("mcp-desk-anything-new");
    // every other name keeps the file it always had: no seat already let in loses its key
    for (const [name, file] of [["Claude Code", "claude-code"], ["Codex", "codex"], ["deskhand", "deskhand"], ["My Desk Sniper", "my-desk-sniper"]] as const) expect(outsideSeatFile(name)).toBe(file);

    const { home, hire, autonomy, keyOf, letIn, limitFor, as, order, desk } = await boot();
    await hire();
    await autonomy(true);
    // the collision is real: the name as the keystore spells it is the house Sniper's own key file
    const house = keystoreSeatKey(home, slugOf("Desk Sniper"));
    if (isRefusal(house)) throw new Error(house.message);
    expect(house.address).toBe(keyOf("sniper").address);
    // the file an MCP seat of that name opens instead: a key of its own, which no autonomy covers
    expect(seatKeyPath(home, outsideSeatFile("Desk Sniper"))).toBe(join(home, "seats", "mcp-desk-sniper.json"));
    const theirs = keystoreSeatKey(home, outsideSeatFile("Desk Sniper"));
    if (isRefusal(theirs)) throw new Error(theirs.message);
    expect(theirs.address).not.toBe(keyOf("sniper").address);
    await letIn(theirs.address, "Desk Sniper");
    await limitFor(theirs.address, "pap");
    expect(desk.autonomyFor(theirs.address, "pap")).toBeUndefined();
    expect(code(await as(theirs, order("pap")))).toBe("card");
    // and mcp.ts opens every stored seat key through that map
    const mcp = readFileSync(join(process.cwd(), "src/portfolio/mcp.ts"), "utf8");
    const calls = mcp.match(/storedSeatKey\(/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(mcp.match(/storedSeatKey\(defaultHome\(\), outsideSeatFile\(id\)\)/g) ?? []).toHaveLength(calls.length);
  });
});

describe("open leads are never cut from a window over the record", () => {
  it("recentAndOpen: the newest n and every open lead however old, in the record's order, each once", () => {
    const L = (id: string, state: Lead["state"]) => ({ id, state });
    const leads = [L("a", "executed"), L("b", "rejected"), L("c", "closing"), L("d", "rejected"), L("e", "confirmed"), L("f", "rejected"), L("g", "closed")];
    expect(recentAndOpen(leads, 2).map((l) => l.id)).toEqual(["a", "c", "e", "f", "g"]);
    expect(recentAndOpen(leads, 3).map((l) => l.id)).toEqual(["a", "c", "e", "f", "g"]);
    expect(recentAndOpen(leads, 0).map((l) => l.id)).toEqual(["a", "c", "e"]);
    expect(recentAndOpen(leads, 100)).toEqual(leads);
  });

  it("the feed carries an executed lead older than the newest 60; the desk's file keeps it past 400, and the Exit still closes it", async () => {
    const { desk, hire, autonomy, home } = await boot();
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    const kept = readDesk(home)!;
    const first = kept.leads[0]!;
    expect([kept.leads.length, first.id, first.state]).toEqual([1, "L-0001", "executed"]);
    /** later leads Risk rejected, as Search names them every cycle */
    const rejected = (n: number): Lead[] => Array.from({ length: n }, (_, i) => ({ id: `L-${String(2 + i).padStart(4, "0")}`, at: first.at, updatedAt: first.updatedAt, venue: first.venue, symbol: "ETH/USDT", name: "ETH/USDT", kind: "spot", side: "buy", thesis: "a later lead", state: "rejected", why: "the spread is wide" }));
    const write = (later: Lead[]) => writeFileSync(deskPath(home), JSON.stringify({ ...kept, leads: [first, ...later], counters: { ...kept.counters, lead: 1 + later.length } }), { mode: 0o600 });

    // 70 later rejected leads: the feed is the newest 60 and, before them, the executed one — oldest first, each once
    write(rejected(70));
    const second = await boot({ home, at: 60_000 });
    const f = (await second.desk.feed(0))!;
    expect(f.leads).toHaveLength(FEED_LEADS + 1);
    expect(f.leads[0]).toMatchObject({ id: "L-0001", state: "executed", entry: { price: first.entry!.price } });
    expect(f.leads.slice(1).map((l) => l.id)).toEqual(rejected(70).slice(-FEED_LEADS).map((l) => l.id));
    expect(new Set(f.leads.map((l) => l.id)).size).toBe(f.leads.length);

    // more than MAX_LEADS after it: a save keeps the newest 400 and the open lead, and the Exit closes it at its take-profit
    write(rejected(MAX_LEADS + 20));
    const third = await boot({ home, at: 120_000 });
    expect(code(await third.own({ type: "setDesk", desk: "desk", change: "pause", value: "" }))).toBe("account");
    const saved = readDesk(home)!;
    expect(saved.leads).toHaveLength(MAX_LEADS + 1);
    expect([saved.leads[0]!.id, saved.leads[1]!.id]).toEqual(["L-0001", `L-${String(2 + 20).padStart(4, "0")}`]);
    expect(code(await third.own({ type: "setDesk", desk: "desk", change: "resume", value: "" }))).toBe("account");
    third.paper["BTC/USDT"] = SPOT("BTC/USDT", 61_800);
    third.advance(10 * 60_000);
    await third.desk.cycle("test");
    // (closed, it is no longer open: the next save lets it go with the older rejected ones — the room keeps its close)
    expect(readRoom(home).filter((m) => m.from === "exit" && m.text.startsWith("L-0001")).map((m) => m.text)).toEqual([expect.stringContaining("TP HIT at 61,800")]);
  });
});

describe("the feed's read of the account's page", () => {
  it("is shared by the requests that come while it is under way, kept for five seconds, and a read that fails answers the venue as not connected", async () => {
    const { svc, desk, hire, advance } = await boot();
    await hire();
    await desk.feed(0);
    advance(10_000);
    const spy = vi.spyOn(svc, "accountView");
    try {
      const all = await Promise.all([0, 0, 0, 0, 0].map(() => desk.feed(0)));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(all.map((f) => f!.venue)).toEqual(Array(5).fill({ id: "pap", name: "Paper Ex", usd: 5000, paper: true, connected: true }));
      await desk.feed(0);
      expect(spy).toHaveBeenCalledTimes(1);
      // past five seconds: read again — and a read that fails is not an error of the feed's
      advance(6_000);
      spy.mockRejectedValueOnce(new Error("the venue did not answer"));
      expect((await desk.feed(0))!.venue).toMatchObject({ id: "pap", connected: false });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the owner's \"cycle now\" says what the desk is really doing", () => {
  it("refused with no session running; while the clock is mid-step on something else, the answer names that step, not a cycle", async () => {
    const { brain, holdNext } = heldBrain();
    const { desk, hire, own, home } = await boot({ brain });
    // the report made due from midnight, New York, after the hire (a hire past the report's hour counts the day as reported, so the time is
    // moved by an objective change): the clock's next tick writes it, the Head's brain asked (a lead was scanned today)
    expect(code(await hire())).toBe("account");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ reportAt: "0:00" }) }))).toBe("account");
    await desk.cycle("test");
    const head = holdNext("head");
    const tick = desk.tick();
    await head.asked;
    const asked = await own({ type: "setDesk", desk: "desk", change: "cycle", value: "" });
    expect(summary(asked)).toBe("the desk's clock is mid-step (writing the report): no cycle was started on top of it");
    expect(readRoom(home).at(-1)).toMatchObject({ from: "account", kind: "note", text: "The desk's clock is mid-step (writing the report): the desk runs one step at a time, so no cycle was started on top of it. Ask again when it is done." });
    head.release();
    await tick;
    // the session ended: refused in those words, and nothing is said in the room
    expect(code(await own({ type: "setDesk", desk: "desk", change: "end", value: "" }))).toBe("account");
    const seq = readRoom(home).at(-1)!.seq;
    const ended = await own({ type: "setDesk", desk: "desk", change: "cycle", value: "" });
    expect(isRefusal(ended) && [ended.code, ended.message]).toEqual(["E_ACCOUNT_BAD_ACTION", "no session runs: start one first"]);
    expect(readRoom(home).at(-1)!.seq).toBe(seq);
    await desk.idle();
    expect((await desk.view())!.session?.cycles).toBe(1);
  });
});

describe("the feed names its brain, and counts an entry placed apart from one filled", () => {
  it("feed.brain carries the provider the view and the catalog name it by: a desk that thinks with a script is never read as the Claude model its form named", async () => {
    const { desk, hire, autonomy } = await boot();
    await hire();
    await autonomy(true);
    const f = (await desk.feed(0))!;
    const v = (await desk.view())!;
    // the hire named claude-opus-5-5 as its model (the page's default), but the brain that thinks is the script
    expect(f.brain).toMatchObject({ ok: true, provider: "scripted", label: "a script", model: "claude-opus-5-5" });
    expect(f.brain.provider).toBe(v.brain.provider);
    expect(desk.catalog().brain.provider).toBe("scripted");
    // a brain held under another id is named by that id
    const claude = await boot({ brain: scriptedBrain(scriptOf(), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API" }) });
    await claude.hire();
    expect((await claude.desk.feed(0))!.brain).toMatchObject({ provider: "claude", label: "Claude · Anthropic API" });
  });

  it("an entry the venue took and has not filled is placed, not waiting for the owner: the funnel's placed beside executed, the cycle's line, the report's", async () => {
    const { desk, hire, autonomy, home, own } = await boot();
    await hire();
    await autonomy(true);
    // the paper venue rests the desk's market order instead of filling it (an extended-hours day limit, Alpaca paper's "accepted")
    const resting = { ref: "rest-1", status: "open" as const, filledQty: 0, native: {} };
    TR.paper.place = async (o) => {
      (TR.paper as ReturnType<typeof traderOf>).placed.push(o);
      return { ...resting };
    };
    TR.paper.status = async () => ({ ...resting });
    await desk.cycle("test");
    const f = (await desk.feed(0))!;
    expect(f.leads.map((l) => [l.id, l.state, l.entry])).toEqual([["L-0001", "executed", undefined]]);
    expect(f.funnel).toEqual({ scanned: 1, cleared: 1, confirmed: 1, placed: 1, executed: 0, closed: 0, rejected: 0 });
    expect((await desk.view())!.funnel).toEqual(f.funnel);
    expect((await desk.view())!.cards).toEqual([]);
    expect(readRoom(home).find((m) => m.kind === "cycle")?.text).toBe("Cycle 1 (test): 1 lead scanned, 1 cleared, 1 placed, 0 waiting for you, 1 open.");
    // the report's funnel names the entry placed and not filled
    expect(code(await own({ type: "setDesk", desk: "desk", change: "report", value: "" }))).toBe("account");
    expect(readRoom(home).filter((m) => m.kind === "report").at(-1)?.text).toContain("1 confirmed → 1 placed → 0 executed → 0 closed");
  });
});

describe("the first cycle comes after the owner's autonomy, never before it", () => {
  it("the clock's tick runs no cycle before the first cycle's moment: a Start that signs the hire, then the autonomy two seconds later, has its first entry placed at once, not carded", async () => {
    const { desk, hire, autonomy, advance, home } = await boot();
    expect(code(await hire())).toBe("account");
    // a tick of the clock one second after the hire, while the owner is still signing: no cycle yet
    advance(1_000);
    await desk.tick();
    expect((await desk.view())!.session?.cycles).toBe(0);
    expect(readRoom(home).some((m) => m.kind === "cycle")).toBe(false);
    advance(1_000);
    expect(code(await autonomy(true))).toBe("account");
    // the first cycle's moment: it runs, under the autonomy
    advance(FIRST_CYCLE_MS);
    await desk.tick();
    const v = (await desk.view())!;
    expect(v.session?.cycles).toBe(1);
    expect(v.cards).toEqual([]);
    expect(readRoom(home).find((m) => m.kind === "cycle")?.text).toMatch(/^Cycle 1 \(the clock\): 1 lead scanned, 1 cleared, 1 placed, 0 waiting for you, 1 open\.$/);
  });

  it("a hire may carry the autonomy in the same signature: taken only at a paper account (else the whole hire is refused, nothing hired), said in the room, its first entry placed without a card", async () => {
    const { desk, own, keyOf, letIn, limit, home } = await boot();
    const roles: RoleId[] = ["head", "search", "risk", "sniper", "exit"];
    for (const r of roles) await letIn(keyOf(r).address, `Desk ${ROLE_SPECS[r].name.replace(" of desk", "")}`);
    for (const r of roles) if (ROLE_SPECS[r].trades) await limit(r, "pap");
    const hireAt = (venue: string, autonomy: unknown) => own({ type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: "Superagent", objective: { text: "Small entries on the majors, on paper", venue, universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 5, reportAt: "21:00", maxOpen: 3 }, brain: { model: "claude-opus-5-5", effort: "medium" }, roles: roles.map((role) => ({ role, kind: "house" })), autonomy }) });
    // at the real exchange: refused in the autonomy's own words, and no desk is hired
    const real = await hireAt("ex", { paper: true });
    expect(isRefusal(real) && real.message).toBe("Ex is real money: the desk places orders without cards only at a paper account. Hire it at one, or hire it without the autonomy");
    expect(desk.hired()).toBe(false);
    // a shape that is not {paper: true|false}
    for (const bad of [true, "on", { paper: "true" }, [true]]) {
      const r = await hireAt("pap", bad);
      expect(isRefusal(r) && r.code, JSON.stringify(bad)).toBe("E_ACCOUNT_BAD_ACTION");
    }
    expect(desk.hired()).toBe(false);
    // at the paper account: one signature, the autonomy on from the hire's own moment
    const ok = await hireAt("pap", { paper: true });
    expect(summary(ok)).toBe("desk hired: 5 seats at Paper Ex, a session of 22 h from $5,000.00, trading on its own there (paper money)");
    const v = (await desk.view())!;
    expect(v.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    expect(readRoom(home).filter((m) => m.from === "you").map((m) => m.text)).toEqual([expect.stringMatching(/^You hired Superagent: /), "You let the desk trade on its own at Paper Ex, paper money: the orders of its own seats there go at once, without cards, each inside its seat's trading limit. Every other agent and every other venue is answered as before."]);
    await desk.cycle("test");
    expect((await desk.view())!.cards).toEqual([]);
    expect(readRoom(home).find((m) => m.kind === "cycle")?.text).toBe("Cycle 1 (test): 1 lead scanned, 1 cleared, 1 placed, 0 waiting for you, 1 open.");
  });
});

describe("start again in one step: a resume carries the autonomy and the brain", () => {
  const resume = (own: (a: NoNonce<OwnerAction>) => Promise<Outcome | Refusal>, value: unknown) => own({ type: "setDesk", desk: "desk", change: "resume", value: value === "" ? "" : JSON.stringify(value) });

  it("an ended session starts again with its autonomy on paper in ONE signature: on before the first cycle, said in the room, the first entry placed without a card", async () => {
    const { desk, hire, own, home } = await boot();
    expect(code(await hire())).toBe("account");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "end", value: "" }))).toBe("account");
    expect((await desk.view())!.autonomy).toBeUndefined();
    const r = await resume(own, { autonomy: { paper: true } });
    expect(summary(r)).toBe("a new session of 22 h, trading on its own at Paper Ex (paper money)");
    const v = (await desk.view())!;
    expect(v.session?.state).toBe("live");
    expect(v.autonomy).toEqual({ paper: true, at: new Date(START).toISOString() });
    const said = readRoom(home).filter((m) => m.from === "you").map((m) => m.text);
    expect(said.slice(-2)).toEqual([expect.stringMatching(/^You started a new session of 22 h from /), "You let the desk trade on its own at Paper Ex, paper money: the orders of its own seats there go at once, without cards, each inside its seat's trading limit. Every other agent and every other venue is answered as before."]);
    await desk.cycle("test");
    expect((await desk.view())!.cards).toEqual([]);
    expect(readRoom(home).find((m) => m.kind === "cycle")?.text).toBe("Cycle 1 (test): 1 lead scanned, 1 cleared, 1 placed, 0 waiting for you, 1 open.");
  });

  it("validated exactly like the hire: autonomy on only at a paper account, a shape that is not {paper: true|false} refused — the WHOLE resume refused, the session still ended, nothing changed", async () => {
    const onReal = await boot();
    expect(code(await onReal.hire({ venue: "ex" }))).toBe("account");
    expect(code(await onReal.own({ type: "setDesk", desk: "desk", change: "end", value: "" }))).toBe("account");
    const real = await resume(onReal.own, { autonomy: { paper: true } });
    expect(isRefusal(real) && real.message).toBe("Ex is real money: the desk places orders without cards only at a paper account. Resume it without the autonomy, or move it to one first (objective)");
    expect((await onReal.desk.view())!.session?.state).toBe("ended");
    expect((await onReal.desk.view())!.autonomy).toBeUndefined();
    // without it, the real-money desk starts again as before; and {paper: false} is taken anywhere
    expect(code(await resume(onReal.own, { autonomy: { paper: false } }))).toBe("account");
    expect((await onReal.desk.view())!.autonomy?.paper).toBe(false);

    const { desk, hire, own } = await boot();
    await hire();
    await own({ type: "setDesk", desk: "desk", change: "end", value: "" });
    for (const bad of [true, "on", { paper: "true" }, [true], null]) {
      const r = await resume(own, { autonomy: bad });
      expect(isRefusal(r) && r.code, JSON.stringify(bad)).toBe("E_ACCOUNT_BAD_ACTION");
    }
    // a brain the account does not hold: the whole resume refused too
    const brain = await resume(own, { autonomy: { paper: true }, brain: { provider: "grok", model: "grok-4.3" } });
    expect(isRefusal(brain) && brain.message).toBe('"grok" is not a brain this account holds: scripted');
    const v = (await desk.view())!;
    expect(v.session?.state).toBe("ended");
    expect(v.autonomy).toBeUndefined();
    // the value "" resumes as before: a new session, the autonomy as it was
    expect(code(await resume(own, ""))).toBe("account");
    expect((await desk.view())!.session?.state).toBe("live");
    expect((await desk.view())!.autonomy).toBeUndefined();
  });

  it("a paused session resumes with what the value carries — its autonomy (paper only), its brain — and a resume of a running session is refused as before", async () => {
    const claude = scriptedBrain(scriptOf(), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: [{ id: "claude-opus-5-5", name: "Opus", inUsd: 4, outUsd: 20 }, { id: "claude-haiku-5-5", name: "Haiku", inUsd: 0.1, outUsd: 0.5 }] });
    const { desk, hire, own, home } = await boot({ brain: claude });
    await hire();
    expect(code(await resume(own, { autonomy: { paper: true } }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "pause", value: "" }))).toBe("account");
    const r = await resume(own, { autonomy: { paper: true }, brain: { provider: "claude", model: "claude-haiku-5-5", effort: "low" } });
    expect(summary(r)).toBe("the desk runs again, thinking with claude-haiku-5-5 (Claude · Anthropic API), trading on its own at Paper Ex (paper money)");
    const v = (await desk.view())!;
    expect(v.session?.state).toBe("live");
    expect(v.autonomy?.paper).toBe(true);
    expect(v.brain).toMatchObject({ provider: "claude", model: "claude-haiku-5-5", effort: "low" });
    expect(readRoom(home).filter((m) => m.from === "you").slice(-3).map((m) => m.text)).toEqual(["You resumed the desk.", "You changed the brain: Claude · Anthropic API · claude-haiku-5-5 · low effort.", expect.stringMatching(/^You let the desk trade on its own at Paper Ex, paper money/)]);
  });
});

describe("the plan's exits act at once (feat/paper-live p0): the entry carries them to the venue, and the desk judges them before any brain", () => {
  it("an entry goes out with its take-profit and stop as its bracket where the market takes one; the venue's stop fills between cycles and the lead closes on it, at its own price", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9, changePct24h: 2.5 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const brain = scriptedBrain(scriptOf({ search: () => ({ leads: [{ symbol: "BTC/USD", side: "buy", thesis: "BTC is up 2.5% on $2B of volume", confidence: 0.7 }], note: "" }) }));
    const { svc, desk, own, hire, autonomy, home, advance } = await boot({ brain, publicMarkets: [kraken] });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect(code(await hire({ venue: "paper-1" }))).toBe("account");
    expect(code(await autonomy(true))).toBe("account");
    await desk.cycle("test");
    const lead = (await desk.view())!.open[0]!;
    expect(lead).toMatchObject({ id: "L-0001", state: "executed", exits: { takeProfit: Number((60010 * 1.02).toPrecision(10)), stopLoss: Number((60010 * 0.99).toPrecision(10)) } });
    // the venue holds them: the entry's two exits, one canceling the other
    const page = (await svc.accountView())!;
    expect(page.orders.filter((o) => o.exitOf?.order === lead.order).map((o) => [o.exitOf!.kind, o.status]).sort()).toEqual([["stop-loss", "open"], ["take-profit", "open"]]);
    expect(readRoom(home).find((m) => m.from === "sniper" && m.kind === "order")?.text).toMatch(/its take-profit at 61,210\.2 and its stop at 59,409\.9 held by the venue\.$/);
    // the price falls through the stop between cycles: the paper account's own look sells, and the next tick of the desk's clock closes the
    // lead on that fill — no cycle, no brain
    Object.assign(btc, { price: 59000, bid: 58990, ask: 59010 });
    expect(await svc.lookAtPaper()).toEqual(["paper-1"]);
    advance(30_000);
    await desk.tick();
    const closed = (await desk.view())!.recent.find((l) => l.id === "L-0001")!;
    expect(closed.state).toBe("closed");
    expect(closed.exitWhy).toBe("stop at 58,990 (its stop-loss, filled by the venue)");
    expect(closed.exit!.price).toBe(58990);
  });

  it("a lead's exits are found however many orders came after them: past the page's newest sixty, the venue's stop still closes the lead", async () => {
    const btc: Listing = { symbol: "BTC/USD", name: "BTC market", kind: "spot", base: "BTC", quote: "USD", price: 60000, bid: 59990, ask: 60010, open: true, types: [], volumeUsd24h: 2e9, changePct24h: 2.5 };
    const kraken: PublicSource = { id: "kraken", name: "Kraken", kind: "exchange", connectTo: "kraken", connector: "live:exchange:kraken", listings: async (q) => [btc].filter((m) => !q.q || m.base.includes(q.q.toUpperCase())) };
    const brain = scriptedBrain(scriptOf({ search: () => ({ leads: [{ symbol: "BTC/USD", side: "buy", thesis: "BTC is up 2.5% on $2B of volume", confidence: 0.7 }], note: "" }) }));
    const { svc, desk, own, hire, autonomy, advance } = await boot({ brain, publicMarkets: [kraken] });
    expect(code(await own({ type: "connectVenue", venue: "paper-1", connector: "live:paper", label: "", credentialRef: "" }))).toBe("account");
    expect(code(await hire({ venue: "paper-1" }))).toBe("account");
    expect(code(await autonomy(true))).toBe("account");
    await desk.cycle("test");
    const lead = (await desk.view())!.open[0]!;
    expect(lead.state).toBe("executed");
    // seventy of the owner's own orders after it, resting far under the market: the entry and its two exits are no longer among the
    // page's newest sixty
    for (let i = 0; i < 70; i++) {
      const p = await svc.account!.prepare({ type: "liveOrder", venue: "paper-1", symbol: "BTC/USD", side: "buy", orderType: "limit", qty: "0.0002", usd: "", limitPrice: "10000" });
      if (isRefusal(p)) throw new Error(p.message);
      const { nonce: _n, ...rest } = p.action as Extract<OwnerAction, { type: "liveOrder" }>;
      expect(code(await own(rest as NoNonce<OwnerAction>))).toBe("order");
    }
    expect((await svc.accountView())!.orders.some((o) => o.id === lead.order || o.exitOf?.order === lead.order)).toBe(false);
    // the price falls through the stop: the venue's stop sells, and the desk's next tick finds that fill and closes the lead on it
    Object.assign(btc, { price: 59000, bid: 58990, ask: 59010 });
    await svc.lookAtPaper();
    advance(30_000);
    await desk.tick();
    const closed = (await desk.view())!.recent.find((l) => l.id === "L-0001")!;
    expect(closed.state).toBe("closed");
    expect(closed.exitWhy).toBe("stop at 58,990 (its stop-loss, filled by the venue)");
  });

  it("a stop the mark has passed is closed before the Exit's brain is asked about the other leads — never kept waiting on a call", async () => {
    const { brain, holdNext } = heldBrain({ search: () => ({ leads: [{ symbol: "BTC/USDT", side: "buy", thesis: "BTC up", confidence: 0.7 }, { symbol: "ETH/USDT", side: "buy", thesis: "ETH up", confidence: 0.6 }], note: "" }) });
    const { desk, hire, autonomy, paper, advance } = await boot({ brain });
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    expect((await desk.view())!.open.map((l) => l.symbol).sort()).toEqual(["BTC/USDT", "ETH/USDT"]);
    // BTC falls through its 1% stop; ETH stands: the Exit's brain is asked about ETH alone, and is held mid-call
    paper["BTC/USDT"] = SPOT("BTC/USDT", 58_000);
    advance(10 * 60_000);
    const exit = holdNext("exit");
    const run = desk.cycle("test");
    await exit.asked;
    const sold = TR.paper as LiveTrader & { placed: OrderRequest[] };
    expect(sold.placed.filter((o) => o.side === "sell").map((o) => o.symbol)).toEqual(["BTC/USDT"]);
    expect((await desk.view())!.recent.find((l) => l.symbol === "BTC/USDT")?.state).toBe("closed");
    exit.release();
    await run;
  });

  it("between cycles the clock's tick judges the plan: a take-profit the mark has reached is closed at the next tick, not at the next cycle", async () => {
    const { desk, hire, autonomy, paper, advance } = await boot();
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    expect((await desk.view())!.open.map((l) => l.state)).toEqual(["executed"]);
    paper["BTC/USDT"] = SPOT("BTC/USDT", 61_800);
    // a minute later: no cycle is due (every five minutes), the tick's own look at the plan closes it
    advance(60_000);
    await desk.tick();
    const v = (await desk.view())!;
    expect(v.open).toEqual([]);
    expect(v.recent.find((l) => l.id === "L-0001")?.exitWhy).toMatch(/^TP HIT at 61,800 /);
    expect(v.session?.cycles).toBe(1);
  });

  it("marks an open lead from its market's live stream (feat/paper-live p2a): the floor shows this moment's mark and result, and the plan's take-profit closes at the next tick though the venue's own read still says the old price", async () => {
    const marks = new Map<string, number>();
    const hub: MarketHub = {
      covers: (source, symbol) => marks.has(`${source}|${symbol}`),
      want: () => true,
      hold: () => () => undefined,
      quote: (source, symbol) => {
        const p = marks.get(`${source}|${symbol}`);
        return p === undefined ? undefined : { bid: p - 1, ask: p + 1, last: p, at: Date.now(), recvAt: Date.now(), seenAt: Date.now(), src: "Stand-in", seq: 1, live: true };
      },
      book: () => undefined,
      trades: () => [],
      since: () => ({ trades: 0, seq: 0 }),
      confirmed: async () => undefined,
      onTick: () => () => undefined,
      close: () => undefined,
    };
    const { desk, hire, autonomy, advance } = await boot({ streams: hub });
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    const entry = (await desk.view())!.open[0]!.entry!;
    // the stream marks BTC at 61,200; the venue's own read (its positions) still says 60,000
    marks.set("pap|BTC/USDT", 61_200);
    const lead = (await desk.feed(0))!.leads.find((l) => l.id === "L-0001")!;
    expect(lead).toMatchObject({ markPrice: 61_200, markFrom: "Stand-in · live", unrealizedUsd: Number(((61_200 - entry.price) * entry.qty).toFixed(2)) });
    // past the take-profit on the stream: the next tick closes it, at the stream's mark
    marks.set("pap|BTC/USDT", 61_800);
    advance(60_000);
    await desk.tick();
    const v = (await desk.view())!;
    expect(v.open).toEqual([]);
    expect(v.recent.find((l) => l.id === "L-0001")?.exitWhy).toMatch(/^TP HIT at 61,800 /);
  });

  it("the floor's equity is its open leads at the marks its rows show (feat/paper-live p2a): the start, what closed since, and the sum of the unrealised results it shows — moving with the live mark between the desk's ticks", async () => {
    const marks = new Map<string, number>();
    const hub: MarketHub = {
      covers: (source, symbol) => marks.has(`${source}|${symbol}`),
      want: () => true,
      hold: () => () => undefined,
      quote: (source, symbol) => {
        const p = marks.get(`${source}|${symbol}`);
        return p === undefined ? undefined : { bid: p - 1, ask: p + 1, last: p, at: Date.now(), recvAt: Date.now(), seenAt: Date.now(), src: "Stand-in", seq: 1, live: true };
      },
      book: () => undefined,
      trades: () => [],
      since: () => ({ trades: 0, seq: 0 }),
      confirmed: async () => undefined,
      onTick: () => () => undefined,
      close: () => undefined,
    };
    const { desk, hire, autonomy } = await boot({ streams: hub });
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    const agrees = async () => {
      const feed = (await desk.feed(0))!;
      const shown = feed.leads.filter((l) => l.state === "executed").reduce((x, l) => x + (l.unrealizedUsd ?? 0), 0);
      const realised = feed.leads.filter((l) => l.state === "closed").reduce((x, l) => x + (l.pnlUsd ?? 0), 0);
      expect(feed.equity.nowUsd).toBeCloseTo(feed.equity.startUsd + realised + shown, 2);
      return feed;
    };
    const before = await agrees();
    // the stream moves between two of the desk's ticks: the rows' results move, and the equity with them
    marks.set("pap|BTC/USDT", 61_200);
    const after = await agrees();
    const entry = after.leads.find((l) => l.id === "L-0001")!.entry!;
    expect(after.equity.nowUsd - before.equity.nowUsd).toBeCloseTo((61_200 - entry.price) * entry.qty - (before.leads.find((l) => l.id === "L-0001")!.unrealizedUsd ?? 0), 2);
    marks.set("pap|BTC/USDT", 59_500);
    expect((await agrees()).equity.changeUsd).toBeCloseTo((59_500 - entry.price) * entry.qty, 2);
  });

  it("between cycles a plan close the door refused is not tried and said again at every tick — once a cycle, as before; a missing mark likewise", async () => {
    const { desk, hire, autonomy, paper, advance, home } = await boot();
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    expect((await desk.view())!.open.map((l) => l.state)).toEqual(["executed"]);
    const refusals = () => readRoom(home, 500).filter((m) => m.kind === "refusal" && m.lead === "L-0001").length;
    // BTC more than triples: the take-profit is hit, and the close (worth more than the Exit's $100 an order) is refused at the door
    paper["BTC/USDT"] = SPOT("BTC/USDT", 200_000);
    advance(60_000);
    await desk.tick();
    expect(refusals()).toBe(1);
    const lead = () => (readDesk(home)!.leads.find((l) => l.id === "L-0001") as Lead);
    expect(lead()).toMatchObject({ state: "executed", closeRefused: expect.stringMatching(/^an order of \$[\d.,]+ is more than the \$100\.00 an order the trading limit allows/) });
    // the next ticks, inside the cycle: not tried again, nothing more said
    for (let i = 0; i < 4; i++) {
      advance(30_000);
      await desk.tick();
    }
    expect(refusals()).toBe(1);
    // the cycle (five minutes after the last) tries it again, and says it again
    advance(2 * 60_000);
    await desk.tick();
    expect((await desk.view())!.session?.cycles).toBe(2);
    expect(refusals()).toBe(2);
    advance(30_000);
    await desk.tick();
    expect(refusals()).toBe(2);
    // the venue stops pricing a lead (another desk, fresh): the warning is said once, not at every tick — and again by the next cycle
    const quiet = await boot();
    await quiet.hire();
    await quiet.autonomy(true);
    await quiet.desk.cycle("test");
    const noMark = () => readRoom(quiet.home, 500).filter((m) => m.kind === "warning" && /^L-0001: no mark for BTC\/USDT/.test(m.text)).length;
    quiet.paper["BTC/USDT"] = SPOT("BTC/USDT", 60_000, { price: undefined, bid: undefined, ask: undefined });
    for (let i = 0; i < 5; i++) {
      quiet.advance(30_000);
      await quiet.desk.tick();
    }
    expect(noMark()).toBe(1);
    quiet.advance(2 * 60_000 + 30_000);
    await quiet.desk.tick();
    expect((await quiet.desk.view())!.session?.cycles).toBe(2);
    expect(noMark()).toBe(2);
  });

  it("on a tick where a cycle is due the plan is judged once, by the cycle: a stop hit and refused there is tried and said once, and a missing mark said once", async () => {
    const { desk, hire, autonomy, paper, advance, home } = await boot();
    await hire();
    await autonomy(true);
    await desk.cycle("test");
    expect((await desk.view())!.open.map((l) => l.state)).toEqual(["executed"]);
    const refusals = () => readRoom(home, 500).filter((m) => m.kind === "refusal" && m.lead === "L-0001").length;
    const doorRefused = () => readRoom(home, 500).filter((m) => m.kind === "refusal" && /the door refused the close/.test(m.text)).length;
    // the take-profit is hit first seen on the tick that is also the cycle's (five minutes after the last): the close is refused at the
    // door (worth more than the Exit's $100 an order), once — not by the tick's own look and then by the cycle again at once
    paper["BTC/USDT"] = SPOT("BTC/USDT", 200_000);
    advance(5 * 60_000);
    await desk.tick();
    expect((await desk.view())!.session?.cycles).toBe(2);
    expect(refusals()).toBe(1);
    expect(doorRefused()).toBe(1);
    // a mark the venue stops giving, first missed on a cycle's tick: said once
    const quiet = await boot();
    await quiet.hire();
    await quiet.autonomy(true);
    await quiet.desk.cycle("test");
    const noMark = () => readRoom(quiet.home, 500).filter((m) => m.kind === "warning" && /^L-0001: no mark for BTC\/USDT/.test(m.text)).length;
    quiet.paper["BTC/USDT"] = SPOT("BTC/USDT", 60_000, { price: undefined, bid: undefined, ask: undefined });
    quiet.advance(5 * 60_000);
    await quiet.desk.tick();
    expect((await quiet.desk.view())!.session?.cycles).toBe(2);
    expect(noMark()).toBe(1);
  });

  it("a seat's limit in the desk's view and feed says whether its budget renews and when — a limit signed without renewHours says neither", async () => {
    const { desk, hire, own, keyOf } = await boot();
    await hire();
    // the Sniper's limit as the setup signs it now (renewing every 24 hours); the Exit's as a desk hired before that has it
    const r = await own({ type: "approveSpend", agent: keyOf("sniper").address, scope: "trade", allow: "pap", perPayment: "150", budget: "2000", windowHours: 0, validUntil: START + 30 * DAY, renewHours: 24 });
    expect(code(r)).toBe("account");
    const v = (await desk.view())!;
    const sniper = v.seats.find((s) => s.role === "sniper")!.limit;
    expect(sniper).toEqual({ perOrderUsd: 150, leftUsd: 2000, budgetUsd: 2000, venues: ["pap"], renewHours: 24, renewsAt: new Date(START + DAY).toISOString() });
    expect(v.seats.find((s) => s.role === "exit")!.limit).toEqual({ perOrderUsd: 100, leftUsd: 500, budgetUsd: 500, venues: ["pap"] });
    const feedSeat = (await desk.feed(0))!.seats.find((s) => s.role === "sniper")!;
    expect(feedSeat.limit).toMatchObject({ renewHours: 24, renewsAt: new Date(START + DAY).toISOString() });
  });
});
