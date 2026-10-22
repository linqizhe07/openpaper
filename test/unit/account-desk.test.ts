import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { ANTHROPIC_KEY_SHAPE, brainReach, claudeBrain } from "../../src/portfolio/account/brain-claude.ts";
import { shq } from "../../src/portfolio/account/brain-key.ts";
import { keyRejected, rejectedFix } from "../../src/portfolio/account/brain-key.ts";
import { BRAIN_MODELS, BRAIN_NOT_OBJECT, DECISIONS, deskPath, FIRST_CYCLE_MS, KEY_IN_MODEL, KEY_IN_PROVIDER, readRoom, ROLE_SPECS, ROLES, roomPath, scriptedBrain, type Brain, type BrainAbout, type RoleId } from "../../src/portfolio/account/desk.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { register, type LiveDeps } from "../../src/portfolio/live/index.ts";
import { ceilTo, floorTo, type LiveTrader, type Market, type OrderRequest, type OrderState, type OrderType } from "../../src/portfolio/live/trade.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** THE DESK (account/desk.ts): the account's own agents. Every seat is an agent key the owner let in; a seat that trades does so inside
 * a limit the owner signed, through the same door as any agent — so a charter's "never trades" is enforced by the door, not by words. A
 * cycle finds leads, clears them, places them (a card in Guard, at once in Beast), the plan exits them; the room says every step with
 * the lead's id; the floor halts at the day's loss line; the report is written at its hour; a restart continues it; an outside agent
 * holds a seat with its own key; without a brain nothing is made up. */
type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-12T15:00:00Z");
const REAL = 5_000_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const codex = simKey("agent:codex");

const SPOT = (symbol: string, price: number): Market => ({ symbol, name: symbol, kind: "spot", base: symbol.split("/")[0]!, quote: "USDT", price, bid: price * 0.9995, ask: price * 1.0005, minQty: 0.0001, qtyStep: 0.0001, priceStep: 0.1, open: true, types: ["market", "limit"], volumeUsd24h: 2_000_000_000, changePct24h: 2.5 });

/** a stand-in exchange: market orders fill at once at the market's price; `markets` is mutable, so a test moves prices between cycles */
function traderOf(markets: Record<string, Market>): LiveTrader & { states: Map<string, OrderState>; placed: OrderRequest[] } {
  const states = new Map<string, OrderState>();
  const placed: OrderRequest[] = [];
  let n = 0;
  return {
    states,
    placed,
    can: true,
    what: "spot",
    async markets(q) {
      const Q = q.trim().toUpperCase();
      return Object.values(markets).filter((m) => !Q || m.symbol.toUpperCase().includes(Q)).map((m) => ({ ...m }));
    },
    async market(symbol) {
      return markets[symbol] ? { ...markets[symbol]! } : no("E_VENUE_REJECTED", { venue: "ex", message: `no market ${symbol}` });
    },
    async place(o) {
      placed.push(o);
      const ref = `o-${++n}`;
      const m = markets[o.symbol]!;
      // a market order fills at the book; so does a limit with extended hours (a marketable limit in the session that is on)
      const s: OrderState = o.type === "market" || o.extendedHours ? { ref, status: "filled", filledQty: o.qty, avgPrice: o.side === "buy" ? m.ask! : m.bid!, feeUsd: 0.01, native: {} } : { ref, status: "open", filledQty: 0, native: {} };
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
      return [];
    },
  };
}

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

const code = (o: Outcome | Refusal): string => (isRefusal(o) ? o.code : o.kind);

interface Script {
  search?: (input: string) => unknown;
  risk?: (input: string) => unknown;
  exit?: (input: string) => unknown;
  head?: (input: string) => unknown;
}
/** a brain that finds BTC, clears it at $40 with a 2% take-profit and a 1% stop, holds, and writes two sentences */
const brainOf = (s: Script = {}): Brain =>
  scriptedBrain(({ role, input }) => {
    if (role === "search") return s.search ? s.search(input) : { leads: [{ symbol: "BTC/USDT", side: "buy", thesis: "BTC is up 2.5% on $2B of volume", confidence: 0.7 }], note: "" };
    if (role === "risk") return s.risk ? s.risk(input) : { verdict: "clear", why: "the spread is tight and the day has room", sizeUsd: 40, tpPct: 2, slPct: 1, maxHours: 12 };
    if (role === "exit") return s.exit ? s.exit(input) : { decisions: [] };
    if (role === "head") return s.head ? s.head(input) : { worked: "L-0001 was cleared and placed.", change: "Nothing yet." };
    return null;
  });
const noBrain: Brain = { id: "none", label: "no brain", models: [], ready: () => ({ ok: false, model: "none", why: "no key" }), decide: async () => ({ out: null, why: "no key", usage: { inputTokens: 0, outputTokens: 0 } }) };

let registered = false;
async function boot(o: { home?: string; brain?: Brain | Brain[]; prices?: Record<string, Market>; at?: number; cap?: number; tickMs?: number; firstCycleMs?: number } = {}) {
  const home = o.home ?? mkdtempSync(join(tmpdir(), "account-desk-"));
  if (!o.home) homes.push(home);
  const markets = o.prices ?? { "BTC/USDT": SPOT("BTC/USDT", 60_000), "ETH/USDT": SPOT("ETH/USDT", 3_000) };
  const trader = traderOf(markets);
  if (!registered) {
    registered = true;
    register({ kind: "standin-desk", label: "a desk stand-in", needs: "key-file", example: "", venues: [], async open(req) {
      return { source: { name: req.label || "Ex", kind: "cex", reference: "standin", via: "a stand-in", probe: { can: ["read", "trade"], note: "" }, read: async () => [{ asset: "USDT", amount: 5000, usd: 5000 }], trader: TRADER.t, readOnlyBecause: "a stand-in moves no money" } as never, first: [{ asset: "USDT", amount: 5000, usd: 5000 }], summary: "connected" };
    } });
  }
  TRADER.t = trader;
  let n = 0;
  // the real clock and the account's clock move together: `advance` pushes both, so kept reads (markets, prices) expire as they would
  let skew = o.at ?? 0;
  const liveDeps: Partial<LiveDeps> = { clock: () => REAL + skew, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({ home, now: () => new Date(START + skew).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: [], liveWrites: { capUsd: o.cap ?? 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] }, desk: { brain: o.brain ?? brainOf(), tickMs: o.tickMs ?? 0, firstCycleMs: o.firstCycleMs } });
  await svc.restoring;
  const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + skew + ++n } as OwnerAction));
  const as = async (key: ReturnType<typeof simKey>, a: NoNonce<AgentAction>) => svc.exchange(await signAgent(key, { ...a, nonce: START + skew + ++n } as AgentAction));
  const desk = svc.desk!;
  if (!o.home) {
    const r = await own({ type: "connectVenue", venue: "ex", connector: "live:standin-desk", label: "Ex", credentialRef: "" });
    if (isRefusal(r)) throw new Error(r.message);
  }
  const advance = (ms: number) => void (skew += ms);
  /** the owner lets a house seat in, as the page does at hiring */
  const letIn = async (role: RoleId) => {
    const k = desk.seatKeyOf(role);
    if (isRefusal(k)) throw new Error(k.message);
    const r = await own({ type: "approveAgent", agentAddress: k.address as `0x${string}`, agentName: `Desk ${ROLE_SPECS[role].name.replace(" of desk", "")}`, validUntil: START + skew + 30 * DAY });
    if (isRefusal(r)) throw new Error(`${role}: ${r.message}`);
    return k;
  };
  const limit = async (role: RoleId, per = "100", budget = "500") => {
    const k = desk.seatKeyOf(role);
    if (isRefusal(k)) throw new Error(k.message);
    const r = await own({ type: "approveSpend", agent: k.address as `0x${string}`, scope: "trade", allow: "ex", perPayment: per, budget, windowHours: 0, validUntil: START + skew + 7 * DAY });
    if (isRefusal(r)) throw new Error(`${role} limit: ${r.message}`);
  };
  const hire = async (objective: Record<string, unknown> = {}, roles: RoleId[] = ["head", "search", "risk", "sniper", "exit"], brain: Record<string, unknown> = { model: "claude-opus-5-5", effort: "medium" }) => {
    for (const r of roles) await letIn(r);
    for (const r of roles) if (ROLE_SPECS[r].trades) await limit(r);
    const r = await own({ type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: "Test desk", objective: { text: "Small, careful entries on majors", venue: "ex", universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 15, reportAt: "21:00", ...objective }, brain, roles: roles.map((role) => ({ role, kind: "house" })) }) });
    if (isRefusal(r)) console.log(`hire refused: ${r.code} · ${r.message}`);
    return r;
  };
  return { svc, desk, home, own, as, advance, letIn, limit, hire, markets, trader };
}
const TRADER: { t: LiveTrader } = { t: traderOf({}) };

describe("the desk is hired", () => {
  it("what hiring offers: eight roles with charters, a key for each house seat, the brain's standing", async () => {
    const { desk } = await boot();
    const c = desk.catalog();
    expect(c.roles.map((r) => r.id)).toEqual([...ROLES]);
    expect(c.roles.filter((r) => !r.house).map((r) => r.id)).toEqual(["flow", "sentiment"]);
    expect(Object.keys(c.seats).sort()).toEqual(["exit", "head", "risk", "search", "sniper", "watch"]);
    expect(c.brain.ok).toBe(true);
    expect(c.hired).toBe(false);
    for (const r of c.roles) expect(r.charter.never.length).toBeGreaterThan(10);
  });

  it("hired: seats let in by signature, the desk file the user's alone, a session live from the venue's equity, the room's first lines", async () => {
    const { desk, hire, home, svc } = await boot();
    const r = await hire();
    expect(code(r)).toBe("account");
    expect((statSync(deskPath(home)).mode & 0o777).toString(8)).toBe("600");
    const v = (await desk.view())!;
    expect(v.session?.state).toBe("live");
    expect(v.equity.startUsd).toBe(5000);
    expect(v.seats.map((s) => [s.role, s.kind, s.status])).toEqual([["head", "house", "ok"], ["search", "house", "ok"], ["risk", "house", "ok"], ["sniper", "house", "ok"], ["exit", "house", "ok"]]);
    expect(v.seats.find((s) => s.role === "sniper")?.limit).toMatchObject({ perOrderUsd: 100, budgetUsd: 500, venues: ["ex"] });
    expect(v.seats.find((s) => s.role === "search")?.limit).toBeUndefined();
    const room = readRoom(home);
    expect(room[0]?.from).toBe("you");
    expect(room[0]?.text).toContain("You hired Test desk");
    expect(room[1]).toMatchObject({ from: "head", kind: "report" });
    // the start of the session, named so whatever the hour, its seats by name
    expect(room[1]?.text).toMatch(/^SESSION START — /);
    expect(room[1]?.text).toContain("Seats: Head, Search, Risk, Sniper and Exit.");
    expect(room[0]?.text).toContain("You hired Test desk: Head, Search, Risk, Sniper and Exit.");
    // the ledger has the signed hire, in the owner's name
    const rows = readFileSync(svc.ledgerPath(), "utf8").split("\n").filter(Boolean).map((x) => JSON.parse(x) as { tool?: string; outcome?: string; reason?: string });
    expect(rows.find((x) => x.tool === "setDesk" && x.outcome === "ok")?.reason).toContain("desk hired: 5 seats at Ex");
  });

  it("refuses a desk without a Head, at a venue not connected, with a role that is not one", async () => {
    const { own, letIn } = await boot();
    await letIn("search");
    const base = { type: "setDesk" as const, desk: "desk", change: "hire" };
    const value = (o: Record<string, unknown>) => JSON.stringify({ objective: { text: "x", venue: "ex" }, roles: [{ role: "search", kind: "house" }], ...o });
    expect(code(await own({ ...base, value: value({}) }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ ...base, value: value({ objective: { text: "x", venue: "nowhere" }, roles: [{ role: "head", kind: "house" }] }) }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ ...base, value: value({ roles: [{ role: "head", kind: "house" }, { role: "janitor", kind: "house" }] }) }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ ...base, value: value({ roles: [{ role: "head", kind: "house" }, { role: "flow", kind: "house" }] }) }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ ...base, value: "not json" }))).toBe("E_ACCOUNT_BAD_ACTION");
  });
});

describe("a cycle", () => {
  it("tells the account's push channel each time the floor moves — the room's newest line, the step under way, the brain calls in flight — as a desk event the page reads the floor again on (feat/paper-live p1)", async () => {
    const { desk, hire, svc, home } = await boot();
    const emit = vi.spyOn(svc.stream, "emit");
    await hire();
    await desk.cycle("test");
    const told = emit.mock.calls.filter(([type]) => type === "desk").map(([, data]) => data as { seq: number; working: { role: string; what: string } | null; inFlight: number; at: string });
    expect(told.length).toBeGreaterThan(5);
    // the room's newest line is told as it is written: the last word is the room's last line
    expect(told.at(-1)!.seq).toBe(readRoom(home).at(-1)!.seq);
    // the steps the floor draws as live, each told as it begins (and its end told with the step it was inside, or none)
    expect(told.some((d) => d.working?.role === "search" && d.working.what === "scan")).toBe(true);
    expect(told.some((d) => d.working?.role === "risk" && d.working.what === "clear")).toBe(true);
    expect(told.at(-1)!.working).toBeNull();
    // a brain call is told as it goes out
    expect(told.some((d) => d.inFlight === 1)).toBe(true);
    expect(told.at(-1)!.inFlight).toBe(0);
    expect(told.every((d) => typeof d.at === "string")).toBe(true);
    emit.mockRestore();
  });

  it("Guard: a lead found, cleared, placed as a card the owner answers; approved, it fills and the lead is executed", async () => {
    const { desk, hire, svc, own, home, advance } = await boot();
    await hire();
    await desk.cycle("test");
    const room = readRoom(home).map((m) => `${m.from}:${m.kind}:${m.text}`);
    expect(room.find((x) => x.startsWith("search:lead:"))).toContain("LEAD L-0001 | BTC/USDT | long |");
    expect(room.find((x) => x.startsWith("risk:clearance:"))).toContain("Verdict: CLEAR → SNIPER");
    expect(room.find((x) => x.startsWith("sniper:card:"))).toMatch(/L-0001: buy \$40\.00 of BTC\/USDT waits for you on card-\d+ \(Guard\)/);
    // a lead whose order waits on a card is counted apart from one placed: a card is not an order
    expect(room.find((x) => x.startsWith("head:cycle:"))).toContain("1 lead scanned, 1 cleared, 0 placed, 1 waiting for you, 1 open");
    let v = (await desk.view())!;
    expect(v.open.map((l) => [l.id, l.state, l.sizeUsd, l.tpPct, l.slPct])).toEqual([["L-0001", "confirmed", 40, 2, 1]]);
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0]?.lead).toBe("L-0001");
    expect(v.funnel).toMatchObject({ scanned: 1, cleared: 1, confirmed: 1, executed: 0 });
    // the owner's yes: the card's hash signed, the order placed in the Sniper's name
    const page = (await svc.accountView())!;
    const card = page.cards[0]!;
    const sniper = desk.seatKeyOf("sniper");
    if (isRefusal(sniper)) throw new Error(sniper.message);
    expect(card.agent).toBe(sniper.address);
    const yes = await own({ type: "approveCard", card: card.id, action: card.hash, decision: "approve" });
    expect(code(yes)).toBe("order");
    advance(60_000);
    await desk.tick();
    v = (await desk.view())!;
    expect(v.open.map((l) => [l.id, l.state, l.entry?.qty !== undefined, l.order])).toEqual([["L-0001", "executed", true, "ord-0001"]]);
    expect(readRoom(home).some((m) => m.from === "you" && m.kind === "order" && m.text.includes("You approved"))).toBe(true);
    expect(v.funnel.executed).toBe(1);
    // the statement line says who: the Sniper, approved by you
    expect(svc.statement().find((l) => l.id === "ord-0001")?.by).toBe("Desk Sniper, approved by you");
  });

  it("charters become limits: a seat that must not trade holds no trading limit, so the door refuses it an order whatever it decides", async () => {
    const { desk, hire, as } = await boot();
    await hire();
    const search = desk.seatKeyOf("search");
    const head = desk.seatKeyOf("head");
    if (isRefusal(search) || isRefusal(head)) throw new Error("no key");
    const order = { type: "agentLiveOrder" as const, venue: "ex", symbol: "BTC/USDT", side: "buy", orderType: "market", qty: "", usd: "20", limitPrice: "" };
    expect(code(await as(search, order))).toBe("E_MANDATE_NONE");
    expect(code(await as(head, order))).toBe("E_MANDATE_NONE");
    expect(code(await as(head, { type: "agentLiveClose", venue: "ex", symbol: "BTC/USDT", qty: "" }))).toBe("E_MANDATE_NONE");
  });

  it("Beast: placed at once inside the limit; the plan takes the profit when the mark reaches it, and the tape and the equity say so", async () => {
    const { desk, hire, own, markets, advance, home } = await boot();
    await hire();
    await own({ type: "setPolicy", change: "mode", value: "open" });
    await desk.cycle("test");
    let v = (await desk.view())!;
    expect(v.open.map((l) => [l.id, l.state, l.order])).toEqual([["L-0001", "executed", "ord-0001"]]);
    expect(readRoom(home).find((m) => m.from === "sniper" && m.kind === "order")?.text).toMatch(/L-0001: filled, bought .* at .* \(Beast, inside the limit\)/);
    const entry = v.open[0]!.entry!;
    expect(entry.qty).toBeGreaterThan(0);
    // the market moves 3%: past the 2% take-profit
    markets["BTC/USDT"] = SPOT("BTC/USDT", 61_800);
    advance(2 * 60_000);
    await desk.cycle("test");
    v = (await desk.view())!;
    // the cycle goes on after the exits: the next lead is L-0002, the ids never repeat
    expect(v.open.map((l) => l.id)).toEqual(["L-0002"]);
    const closed = v.recent.find((l) => l.id === "L-0001")!;
    expect(closed.state).toBe("closed");
    // the mark said as a person reads it: grouped the en-US way
    expect(closed.exitWhy).toMatch(/^TP HIT at 61,800 /);
    expect(closed.pnlUsd!).toBeGreaterThan(0.5);
    expect(closed.roiPct!).toBeGreaterThan(1);
    expect(v.tape).toMatchObject({ wins: 1, losses: 0, winRatePct: 100 });
    expect(v.big[0]).toMatchObject({ id: "L-0001", symbol: "BTC/USDT" });
    expect(v.equity.nowUsd).toBeCloseTo(5000 + closed.pnlUsd!, 2);
    expect(v.equity.changeUsd).toBeCloseTo(closed.pnlUsd!, 2);
    expect(v.target.progressPct).toBeGreaterThan(0);
    expect(readRoom(home).find((m) => m.from === "exit" && m.kind === "exit")?.text).toContain("L-0001 closed: TP HIT");
    expect(closed.exit?.at).toBe("2026-10-12T15:02:00.000Z");
  });

  it("Risk's hard checks reject before the brain is asked: a closed market, a wide spread, a short on spot", async () => {
    const wide = SPOT("ETH/USDT", 3_000);
    wide.bid = 2_950;
    wide.ask = 3_050;
    const shut = SPOT("SOL/USDT", 150);
    shut.open = false;
    let asked = 0;
    const brain = brainOf({ search: () => ({ leads: [{ symbol: "ETH/USDT", side: "buy", thesis: "wide", confidence: 0.5 }, { symbol: "SOL/USDT", side: "buy", thesis: "shut", confidence: 0.5 }, { symbol: "BTC/USDT", side: "sell", thesis: "short", confidence: 0.5 }], note: "" }), risk: () => (asked++, { verdict: "clear", why: "x", sizeUsd: 40, tpPct: 2, slPct: 1, maxHours: 12 }) });
    const { desk, hire, home } = await boot({ brain, prices: { "BTC/USDT": SPOT("BTC/USDT", 60_000), "ETH/USDT": wide, "SOL/USDT": shut } });
    await hire();
    await desk.cycle("test");
    const v = (await desk.view())!;
    expect(asked).toBe(0);
    // a market that takes no orders is not in the table Search reads, so a lead named on it is dropped before Risk sees it
    expect(v.recent.map((l) => [l.symbol, l.state])).toEqual([["BTC/USDT", "rejected"], ["ETH/USDT", "rejected"]]);
    const room = readRoom(home);
    expect(room.find((m) => m.from === "search" && m.kind === "note")?.text).toBe("Named SOL/USDT, which the table does not list: dropped.");
    const why = room.filter((m) => m.kind === "clearance").map((m) => m.text);
    expect(why.find((x) => x.includes("L-0001"))).toContain("spread");
    expect(why.find((x) => x.includes("L-0002"))).toContain("short only on a perpetual");
  });

  it("a size is the least of the objective's risk per lead, the Sniper's limit per order and what is left of its budget", async () => {
    let seen = "";
    const brain = brainOf({ risk: (input) => ((seen = input), { verdict: "clear", why: "x", sizeUsd: 9999, tpPct: 2, slPct: 1, maxHours: 12 }) });
    const { desk, hire, own } = await boot({ brain });
    await hire({ maxRiskPct: 4 });
    await own({ type: "setPolicy", change: "mode", value: "open" });
    await desk.cycle("test");
    const v = (await desk.view())!;
    // 4% of $5,000 is $200; the Sniper's limit is $100 an order: the brain's $9,999 is held to $100
    expect(seen).toContain("size up to $100.00");
    expect(v.open[0]?.sizeUsd).toBe(100);
  });
});

describe("the floor, the clock, the words", () => {
  it("halts at the day's loss line: the stop closes the lead, the Head halts the floor until the next New York day, and no lead is scanned meanwhile", async () => {
    const brain = brainOf({ risk: () => ({ verdict: "clear", why: "x", sizeUsd: 250, tpPct: 2, slPct: 1, maxHours: 12 }) });
    const { desk, hire, own, markets, advance, home, limit } = await boot({ brain, cap: 1000 });
    await hire({ maxRiskPct: 5, maxDailyLossPct: 0.5, hours: 72 });
    // a lead of $250 needs the server's cap, the Sniper's limit and the Exit's limit to allow it
    await limit("sniper", "300", "1000");
    await limit("exit", "300", "1000");
    await own({ type: "setPolicy", change: "mode", value: "open" });
    await desk.cycle("test");
    expect((await desk.view())!.open).toHaveLength(1);
    markets["BTC/USDT"] = SPOT("BTC/USDT", 52_800);
    advance(2 * 60_000);
    await desk.cycle("test");
    let v = (await desk.view())!;
    expect(v.session?.state).toBe("halted");
    expect(v.session?.halted?.why).toMatch(/the day's loss reached -\$\d+\.\d\d \(the line is -\$25\.00\)/);
    expect(v.open).toEqual([]);
    expect(v.tape.losses).toBe(1);
    expect(readRoom(home).find((m) => m.kind === "halt")?.text).toMatch(/^HALT: the day's loss reached/);
    advance(60_000);
    await desk.cycle("test");
    v = (await desk.view())!;
    expect(v.funnel.scanned).toBe(1);
    expect(readRoom(home).at(-1)?.text).toMatch(/the floor is halted until/);
    // the next New York day: open again
    advance(DAY);
    await desk.tick();
    expect((await desk.view())!.session?.state).toBe("live");
    expect(readRoom(home).some((m) => m.text.includes("the floor is open again"))).toBe(true);
  });

  it("the evening report at its hour, once a day, from the day's numbers; the weekly review on Sunday; the session's end", async () => {
    const { desk, hire, advance, home, own } = await boot();
    await hire({ hours: 24 * 8 });
    await own({ type: "setPolicy", change: "mode", value: "open" });
    await desk.cycle("test");
    // 11:00 New York at the start: 21:05 is ten hours and five minutes on
    advance(10 * HOUR + 5 * 60_000);
    await desk.tick();
    let v = (await desk.view())!;
    expect(v.reports.map((r) => r.kind)).toEqual(["start", "evening"]);
    expect(v.reports[1]?.text).toMatch(/^EVENING REPORT — Scanned: 1 · Cleared: 1 · Executed: 1 · Closed today: 0 · Open now: 1/);
    expect(v.reports[1]?.text).toContain("One thing that worked: L-0001 was cleared and placed.");
    advance(60_000);
    await desk.tick();
    expect((await desk.view())!.reports.filter((r) => r.kind === "evening")).toHaveLength(1);
    // Sunday 18 October 2026, 21:10 New York
    advance(Date.parse("2026-10-19T01:10:00Z") - (START + 10 * HOUR + 6 * 60_000));
    await desk.tick();
    v = (await desk.view())!;
    expect(v.reports.map((r) => r.kind)).toContain("weekly");
    expect(v.reports.find((r) => r.kind === "weekly")?.text).toMatch(/^WEEKLY REVIEW — /);
    expect(v.session?.state).toBe("live");
    // the session ran its hours: ended, with its report
    advance(2 * DAY);
    await desk.tick();
    v = (await desk.view())!;
    expect(v.session?.state).toBe("ended");
    expect(v.reports.at(-1)?.kind).toBe("end");
    expect(readRoom(home).at(-1)?.text).toMatch(/^SESSION REPORT/);
  });

  it("pause, resume, end: a paused desk runs no cycle; after the end a resume starts a new session from the venue's equity now", async () => {
    const { desk, hire, own } = await boot();
    await hire();
    const set = (change: string) => own({ type: "setDesk", desk: "desk", change, value: "" });
    expect(code(await set("pause"))).toBe("account");
    await desk.cycle("test");
    expect((await desk.view())!.funnel.scanned).toBe(0);
    expect(code(await set("pause"))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await set("resume"))).toBe("account");
    await desk.cycle("test");
    expect((await desk.view())!.funnel.scanned).toBe(1);
    expect(code(await set("end"))).toBe("account");
    expect((await desk.view())!.session?.state).toBe("ended");
    expect(code(await set("resume"))).toBe("account");
    const v = (await desk.view())!;
    expect(v.session?.state).toBe("live");
    expect(v.session?.cycles).toBe(0);
  });

  it("the objective and a charter change by signature; the venue cannot move with a lead open", async () => {
    const { desk, hire, own } = await boot();
    await hire();
    await own({ type: "setPolicy", change: "mode", value: "open" });
    await desk.cycle("test");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ text: "Majors only, smaller", maxRiskPct: 0.5, venue: "elsewhere" }) }))).toBe("E_ACCOUNT_BAD_ACTION");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ text: "Majors only, smaller", maxRiskPct: 0.5 }) }))).toBe("account");
    expect(code(await own({ type: "setDesk", desk: "desk", change: "charter", value: JSON.stringify({ role: "risk", never: "Clear anything on a Friday." }) }))).toBe("account");
    const v = (await desk.view())!;
    expect(v.objective).toMatchObject({ text: "Majors only, smaller", maxRiskPct: 0.5, venue: "ex" });
    expect(v.seats.find((s) => s.role === "risk")?.charter.never).toBe("Clear anything on a Friday.");
    expect(v.seats.find((s) => s.role === "risk")?.charter.owns).toBe(ROLE_SPECS.risk.charter.owns);
  });

  it("outside the regular session, where the venue trades the session that is on, the Sniper's entry and the Exit's close go as day limits with extended hours", async () => {
    const night = (price: number): Market => ({ ...SPOT("AAPL", price), kind: "stock", types: ["limit", "stop", "stop_limit"] as OrderType[], tifs: ["day", "gtc"], session: { open: false, opensAt: "2026-10-13T13:30:00.000Z", phase: "overnight", phaseEndsAt: "2026-10-13T08:00:00.000Z", extendedHours: true } });
    const brain = brainOf({ search: () => ({ leads: [{ symbol: "AAPL", side: "buy", thesis: "overnight momentum", confidence: 0.7 }], note: "" }) });
    const { desk, hire, own, markets, advance, home, trader } = await boot({ brain, prices: { AAPL: night(200) } });
    await hire();
    await own({ type: "setPolicy", change: "mode", value: "open" });
    await desk.cycle("test");
    let v = (await desk.view())!;
    expect(v.open.map((l) => [l.id, l.state])).toEqual([["L-0001", "executed"]]);
    const entryLimit = ceilTo(markets.AAPL!.ask! * 1.005, 0.1);
    expect(trader.placed[0]).toMatchObject({ symbol: "AAPL", side: "buy", type: "limit", tif: "day", extendedHours: true, limitPrice: entryLimit });
    expect(readRoom(home).some((m) => m.from === "sniper" && m.text.includes(`the regular session is closed (overnight session): the entry goes as a day limit at ${entryLimit} with extended hours`))).toBe(true);
    expect(readRoom(home).find((m) => m.from === "risk" && m.kind === "clearance")?.text).toContain("market open (overnight session, extended hours)");
    // the mark reaches the take-profit: the close goes the same way, a sell a little under the bid
    markets.AAPL = night(206);
    advance(2 * 60_000);
    await desk.cycle("test");
    const exitLimit = floorTo(markets.AAPL.bid! * 0.995, 0.1);
    expect(trader.placed[1]).toMatchObject({ symbol: "AAPL", side: "sell", type: "limit", tif: "day", extendedHours: true, limitPrice: exitLimit });
    expect(readRoom(home).some((m) => m.text.includes(`the close goes as a day limit at ${exitLimit} with extended hours`))).toBe(true);
    // in the regular session the entry is a market order, as before
    markets.AAPL = { ...night(200), types: ["market", "limit"], session: { open: true, phase: "regular", extendedHours: false } };
    advance(60 * 60_000);
    await desk.cycle("test");
    expect(trader.placed.at(-1)).toMatchObject({ symbol: "AAPL", side: "buy", type: "market" });
    expect(trader.placed.at(-1)).not.toHaveProperty("extendedHours");
    v = (await desk.view())!;
    expect(v.open.map((l) => l.state)).toEqual(["executed"]);
  });

  it("without a brain nothing is made up: the room says so, the plan's exits still run, no lead appears", async () => {
    const { desk, hire, home } = await boot({ brain: noBrain });
    await hire();
    await desk.cycle("test");
    const v = (await desk.view())!;
    expect(v.brain.ok).toBe(false);
    expect(v.funnel.scanned).toBe(0);
    expect(readRoom(home).at(-1)?.text).toMatch(/no brain to think with \(no key\)/);
  });

  it("the brain is a choice: brains told apart by id, the hired one answers, the owner's price or the listed one is counted, none is said so, a change is a signature", async () => {
    const usage = { inputTokens: 100_000, outputTokens: 10_000 };
    const claude = scriptedBrain(() => ({ leads: [], note: "claude here" }), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: BRAIN_MODELS, usage });
    const open = scriptedBrain(() => ({ leads: [], note: "deepseek here" }), "", { id: "openai", label: "OpenAI-format endpoint", usage });
    const { desk, hire, own, home } = await boot({ brain: [claude, open], prices: { "BTC/USDT": SPOT("BTC/USDT", 60_000) } });
    const c = desk.catalog();
    expect(c.brains.map((b) => [b.id, b.label, b.ok, b.models.length])).toEqual([["claude", "Claude · Anthropic API", true, 3], ["openai", "OpenAI-format endpoint", true, 0]]);
    expect(c.brain.provider).toBe("claude");
    // the OpenAI-format brain lists no models: the hire names one, or is refused
    const refused = await hire({}, ["head", "search", "risk", "sniper"], { provider: "openai", effort: "low" });
    expect(isRefusal(refused) && refused.message).toMatch(/name the model, as the endpoint names it/);
    const r = await hire({}, ["head", "search", "risk", "sniper"], { provider: "openai", model: "deepseek-chat", effort: "low", price: { inUsd: 0.27, outUsd: 1.1 } });
    expect(isRefusal(r)).toBe(false);
    await desk.cycle("test");
    let v = (await desk.view())!;
    expect(v.brain).toMatchObject({ ok: true, provider: "openai", label: "OpenAI-format endpoint", model: "deepseek-chat", effort: "low", price: { inUsd: 0.27, outUsd: 1.1 } });
    expect(readRoom(home).some((m) => m.text.includes("deepseek here"))).toBe(true);
    expect(v.brain.spend.calls).toBe(1);
    expect(v.brain.spend.usd).toBeCloseTo(0.04, 6); // (100k × 0.27 + 10k × 1.1) / 1M = 0.038, shown to the cent
    expect(desk.catalog().brain.provider).toBe("openai");
    // changed by signature to the other brain and a model it lists: priced at the listed price
    const ch = await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "claude", model: "claude-haiku-5-5", effort: "high" }) });
    expect(isRefusal(ch)).toBe(false);
    expect(readRoom(home).at(-1)?.text).toMatch(/^You changed the brain: Claude · Anthropic API · claude-haiku-5-5 · high effort\.$/);
    await desk.cycle("test");
    v = (await desk.view())!;
    expect(v.brain).toMatchObject({ provider: "claude", model: "claude-haiku-5-5", effort: "high" });
    expect(v.brain.price).toBeUndefined();
    expect(readRoom(home).some((m) => m.text.includes("claude here"))).toBe(true);
    expect(v.brain.spend.usd).toBeCloseTo(0.05, 6); // + (100k × 0.1 + 10k × 0.5) / 1M = 0.015 → 0.053
    // a model nobody prices: the tokens are counted, unpriced, and the view says so
    const un = await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "openai", model: "kimi-k2", effort: "medium" }) });
    expect(isRefusal(un)).toBe(false);
    await desk.cycle("test");
    v = (await desk.view())!;
    expect(v.brain.spend.unpricedTokens).toBe(110_000);
    expect(v.brain.spend.usd).toBeCloseTo(0.05, 6);
    // a brain that lists its models refuses one it does not list; a price is two numbers
    const no = await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "claude", model: "gpt-5" }) });
    expect(isRefusal(no) && no.message).toMatch(/Claude · Anthropic API lists claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5: "gpt-5" is not one of them/);
    const bad = await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "openai", model: "kimi-k2", price: { inUsd: -1, outUsd: "x" } }) });
    expect(isRefusal(bad) && bad.message).toMatch(/a price is dollars per million tokens/);
    // a desk file from before brains were a choice is read as Claude's
    const file = JSON.parse(readFileSync(deskPath(home), "utf8"));
    delete file.brain.provider;
    writeFileSync(deskPath(home), JSON.stringify(file));
    const { desk: again } = await boot({ home, brain: [claude, open], prices: { "BTC/USDT": SPOT("BTC/USDT", 60_000) } });
    expect((await again.view())!.brain.provider).toBe("claude");
  });

  it("no silent fallback: a brain the account does not hold is refused by name, never swapped; a desk hired with one the account no longer holds is not ready and asks — and bills — no other in its place; a model's name that is not one is refused, not replaced", async () => {
    const usage = { inputTokens: 100_000, outputTokens: 10_000 };
    let askedClaude = 0;
    let askedDeepseek = 0;
    const claude = scriptedBrain(() => (askedClaude++, { leads: [], note: "claude here" }), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: BRAIN_MODELS, usage });
    const deepseek = scriptedBrain(() => (askedDeepseek++, { leads: [], note: "deepseek here" }), "deepseek-flash", { id: "deepseek", label: "DeepSeek", usage });
    const { desk, hire, own, home } = await boot({ brain: [claude, deepseek], prices: { "BTC/USDT": SPOT("BTC/USDT", 60_000) } });
    // a provider the account does not hold: refused in words, nothing hired — never hired with the first brain instead
    const unknown = await hire({}, ["head", "search", "risk", "sniper"], { provider: "grok", model: "grok-4.3", effort: "low" });
    expect(isRefusal(unknown) && unknown.message).toBe('"grok" is not a brain this account holds: claude, deepseek');
    expect(desk.hired()).toBe(false);
    // a model's name that is not one: refused, never quietly replaced by the file's or the last one
    const badModel = await hire({}, ["head", "search", "risk", "sniper"], { provider: "deepseek", model: "deep seek <flash>", effort: "low" });
    expect(isRefusal(badModel) && badModel.message).toMatch(/^"deep seek <flash>" is not a model's name as an endpoint names it/);
    expect(desk.hired()).toBe(false);
    expect(code(await hire({}, ["head", "search", "risk", "sniper"], { provider: "deepseek", model: "deepseek-flash", effort: "low" }))).toBe("account");
    // a change to a provider not held: refused, the desk keeps its brain
    const ch = await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "openai", model: "gpt-6-luna" }) });
    expect(isRefusal(ch) && ch.message).toBe('"openai" is not a brain this account holds: claude, deepseek');
    expect((await desk.view())!.brain.provider).toBe("deepseek");
    // the same desk file read by an account that holds only Claude: its brain is said absent, and Claude is never asked in its place
    const second = await boot({ home, brain: [claude], prices: { "BTC/USDT": SPOT("BTC/USDT", 60_000) }, at: 60_000 });
    const other = second.desk;
    await other.cycle("test");
    const v = (await other.view())!;
    expect(v.brain).toMatchObject({ ok: false, provider: "deepseek", label: "deepseek (not on this account)", why: expect.stringMatching(/^the desk was hired with the brain "deepseek", which this account does not hold now: choose one it holds \(Brain…\) — no other brain is asked in its place$/) });
    expect(v.brain.spend.calls).toBe(0);
    expect(askedClaude).toBe(0);
    expect(askedDeepseek).toBe(0);
    expect(readRoom(home).at(-1)?.text).toMatch(/^Cycle \d+: the house seats have no brain to think with \(the desk was hired with the brain "deepseek", which this account does not hold now/);
    expect((await other.feed(0))!.brain).toMatchObject({ ok: false, provider: "deepseek" });
    expect(other.catalog().brains.map((b) => b.id)).toEqual(["claude"]);
    expect(other.catalog().brain).toMatchObject({ provider: "deepseek", ok: false });
    // the owner signs a change naming no provider: with one brain held, that one — said in the room — and it thinks from the next cycle
    expect(code(await second.own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ model: "claude-haiku-5-5" }) }))).toBe("account");
    expect(readRoom(home).at(-1)?.text).toBe("You changed the brain: Claude · Anthropic API · claude-haiku-5-5 · low effort.");
    await other.cycle("test");
    expect(askedClaude).toBe(1);
    expect(askedDeepseek).toBe(0);
    // with several held and the desk's own not among them, a change must name one
    const third = await boot({ home, brain: [scriptedBrain(() => null, "m", { id: "xai" }), scriptedBrain(() => null, "m", { id: "meta" })], at: 120_000 });
    const unnamed = await third.own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ model: "grok-4.3" }) });
    expect(isRefusal(unnamed) && unnamed.message).toBe('name the brain: the desk\'s "claude" is not one this account holds — xai, meta');
  });

  it("a key pasted where the model goes — hire, brain, objective, resume — is refused by the desk itself in words that never repeat it (whoever reaches it, the door's own check aside); desk.json, the room, the view, the feed and the catalog never hold it", async () => {
    // made up, in the shapes that fit a model's name (80 characters or fewer): none of them is anyone's key
    const KEYS = [`gsk_TESTnotArealKey${"0123456789abcdefABCDEF".repeat(2)}`, `sk-${"0123456789abcdef".repeat(2)}`, "AIzaTESTnotArealKey0123456789abcdefgh"];
    const claude = scriptedBrain(() => ({ leads: [], note: "" }), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: BRAIN_MODELS });
    const deepseek = scriptedBrain(() => ({ leads: [], note: "" }), "deepseek-flash", { id: "deepseek", label: "DeepSeek" });
    const { desk, hire, own, home } = await boot({ brain: [claude, deepseek] });
    // the desk's own handler, as the door hands it an instruction (Desk.apply): its refusal, not the door's
    let n = 0;
    const apply = (change: string, value: unknown) => desk.apply({ type: "setDesk", desk: "desk", change, value: JSON.stringify(value), nonce: ++n }, { signer: owner.address });
    const message = (r: Outcome | Refusal) => (isRefusal(r) ? r.message : `taken: ${r.kind}`);
    const leaks = (k: string): string[] => {
      const read = (f: string) => {
        try {
          return readFileSync(f, "utf8");
        } catch {
          return "";
        }
      };
      return ([["desk.json", read(deskPath(home))], ["room", read(roomPath(home))]] as const).filter(([, text]) => text.includes(k) || text.includes(k.slice(4, 20))).map(([name]) => name);
    };
    const objective = { text: "Small, careful entries on majors", venue: "ex", universe: "all" };
    for (const k of KEYS) {
      expect(message(await apply("hire", { objective, brain: { provider: "deepseek", model: k }, roles: [{ role: "head", kind: "house" }] })), k).toBe(KEY_IN_MODEL);
      expect(message(await apply("hire", { objective, brain: { provider: k, model: "deepseek-flash" }, roles: [{ role: "head", kind: "house" }] })), k).toBe(KEY_IN_PROVIDER);
      expect(desk.hired(), k).toBe(false);
      // through the door as the page sends it: refused too (the door's own words), and never said back
      const h = await hire({}, ["head", "search", "risk", "sniper"], { provider: "deepseek", model: k, effort: "low" });
      expect(isRefusal(h), k).toBe(true);
      expect(message(h), k).not.toContain(k.slice(4, 20));
      expect(desk.hired(), k).toBe(false);
      expect(leaks(k), k).toEqual([]);
    }
    expect(KEY_IN_MODEL).not.toMatch(/gsk_|sk-[0-9a-f]|AIza/);
    expect(code(await hire({}, ["head", "search", "risk", "sniper"], { provider: "deepseek", model: "deepseek-flash", effort: "low" }))).toBe("account");
    for (const k of KEYS) {
      expect(message(await apply("brain", { provider: "deepseek", model: k })), k).toBe(KEY_IN_MODEL);
      expect(message(await apply("brain", { provider: "claude", model: k })), k).toBe(KEY_IN_MODEL);
      expect(message(await apply("objective", { text: "Bigger entries", brain: { provider: "claude", model: k } })), k).toBe(KEY_IN_MODEL);
      const v = (await desk.view())!;
      expect(v.brain, k).toMatchObject({ provider: "deepseek", model: "deepseek-flash" });
      expect(v.objective.text, k).toBe("Small, careful entries on majors");
      expect(JSON.stringify(v), k).not.toContain(k.slice(4, 20));
      expect(JSON.stringify(await desk.feed(0)), k).not.toContain(k.slice(4, 20));
      expect(JSON.stringify(desk.catalog()), k).not.toContain(k.slice(4, 20));
      expect(leaks(k), k).toEqual([]);
    }
    // a resume of an ended session that carries one: the whole resume refused, the session still ended
    expect(code(await own({ type: "setDesk", desk: "desk", change: "end", value: "" }))).toBe("account");
    for (const k of KEYS) expect(message(await apply("resume", { brain: { provider: "deepseek", model: k } })), k).toBe(KEY_IN_MODEL);
    expect((await desk.view())!.session?.state).toBe("ended");
    for (const k of KEYS) expect(leaks(k), k).toEqual([]);
  });

  it("the brain is one object of four fields: a list, a string, a number or null in its place, or a field beside the four, is refused by the desk itself — named only when the name is plain — and nothing changes", async () => {
    const claude = scriptedBrain(() => ({ leads: [], note: "" }), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: BRAIN_MODELS });
    const deepseek = scriptedBrain(() => ({ leads: [], note: "" }), "deepseek-flash", { id: "deepseek", label: "DeepSeek" });
    const { desk, hire, home } = await boot({ brain: [claude, deepseek] });
    expect(code(await hire({}, ["head", "search", "risk", "sniper"], { provider: "deepseek", model: "deepseek-flash", effort: "low" }))).toBe("account");
    let n = 0;
    // the desk's own handler, as the door hands it an instruction (Desk.apply): its refusal, not the door's
    const applyRaw = (change: string, value: string) => desk.apply({ type: "setDesk", desk: "desk", change, value, nonce: ++n }, { signer: owner.address });
    const message = (r: Outcome | Refusal) => (isRefusal(r) ? r.message : `taken: ${r.kind}`);
    const GSK = `gsk_TESTnotArealKey${"0123456789abcdefABCDEF".repeat(2)}`;
    const saved = readFileSync(deskPath(home), "utf8");
    for (const value of [JSON.stringify([GSK]), JSON.stringify(GSK), "null", "42", "true"]) expect(message(await applyRaw("brain", value)), value).toBe(BRAIN_NOT_OBJECT);
    expect(message(await applyRaw("objective", JSON.stringify({ text: "Bigger entries", brain: [GSK] })))).toBe(BRAIN_NOT_OBJECT);
    expect(message(await applyRaw("brain", JSON.stringify({ provider: "deepseek", model: "deepseek-flash", extra: 1 })))).toBe('a brain is named with provider, model, effort, price: "extra" is not one of them, and nothing was kept');
    expect(message(await applyRaw("brain", JSON.stringify({ provider: "deepseek", model: "deepseek-flash", [GSK]: 1 })))).toBe("a brain is named with provider, model, effort, price: a field it was sent is not one of them, and nothing was kept");
    expect(message(await applyRaw("brain", JSON.stringify({ provider: "deepseek", model: "deepseek-flash", extra: { k: GSK } })))).toBe('a brain is named with provider, model, effort, price: "extra" is not one of them, and nothing was kept');
    // nothing changed, and nothing of the key anywhere the desk keeps or says
    expect((await desk.view())!.brain).toMatchObject({ provider: "deepseek", model: "deepseek-flash", effort: "low" });
    expect(JSON.parse(readFileSync(deskPath(home), "utf8")).brain).toEqual(JSON.parse(saved).brain);
    expect(JSON.parse(readFileSync(deskPath(home), "utf8")).objective).toEqual(JSON.parse(saved).objective);
    expect(readFileSync(roomPath(home), "utf8")).not.toContain(GSK.slice(4, 20));
    // a paused desk resumed with a brain that is not one object: the whole resume refused, the desk still paused
    expect(message(await applyRaw("pause", ""))).toBe("taken: account");
    expect(message(await applyRaw("resume", JSON.stringify({ brain: GSK })))).toBe(BRAIN_NOT_OBJECT);
    expect((await desk.view())!.session?.state).toBe("paused");
    // the four fields, as the page sends them (price null clears the owner's price), and "" for no change: taken
    expect(message(await applyRaw("brain", JSON.stringify({ provider: "deepseek", model: "deepseek-flash", effort: "high", price: null })))).toBe("taken: account");
    expect(message(await applyRaw("brain", ""))).toBe("taken: account");
    // a hire that names no brain thinks with the default, as before
    expect(BRAIN_NOT_OBJECT).not.toMatch(/gsk_/);
  });

  it("keyChanged says a local server's address and model saved with no key as that — not as a key taken away", async () => {
    const { desk, hire, home } = await boot();
    await hire();
    desk.keyChanged("scripted", "", { keyless: true });
    expect(readRoom(home).at(-1)?.text).toBe("You saved a script's address and model, with no key; it is ready.");
    desk.keyChanged("scripted", "");
    expect(readRoom(home).at(-1)?.text).toBe("You took away the key saved for a script; it is ready.");
  });

  it("an objective change carrying a brain that is refused changes NOTHING: the objective, its venue and its numbers stay — in memory, in the next cycle and in desk.json", async () => {
    const claude = scriptedBrain(() => ({ leads: [], note: "" }), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: BRAIN_MODELS });
    const { desk, hire, own, home } = await boot({ brain: [claude] });
    expect(code(await hire())).toBe("account");
    const was = (await desk.view())!.objective;
    const saved = readFileSync(deskPath(home), "utf8");
    for (const brain of [{ provider: "nope", model: "x" }, { provider: "claude", model: "gpt-5" }, { provider: "claude", model: "deep seek <flash>" }]) {
      const r = await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ text: "Go big on everything", maxRiskPct: 40, maxDailyLossPct: 45, targetPct: 90, brain }) });
      expect(isRefusal(r), JSON.stringify(brain)).toBe(true);
      expect((await desk.view())!.objective, JSON.stringify(brain)).toEqual(was);
      expect(readFileSync(deskPath(home), "utf8"), JSON.stringify(brain)).toBe(saved);
    }
    // a cycle and a save afterwards still carry the old objective
    await desk.cycle("test");
    expect(JSON.parse(readFileSync(deskPath(home), "utf8")).objective).toEqual(was);
    // a brain that IS taken changes both, and the room says each
    expect(code(await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ text: "Majors only, smaller", brain: { provider: "claude", model: "claude-haiku-5-5", effort: "low" } }) }))).toBe("account");
    const v = (await desk.view())!;
    expect(v.objective.text).toBe("Majors only, smaller");
    expect(v.brain).toMatchObject({ provider: "claude", model: "claude-haiku-5-5", effort: "low" });
    expect(readRoom(home).filter((m) => m.from === "you").slice(-2).map((m) => m.text)).toEqual([expect.stringMatching(/^You changed the objective: “Majors only, smaller”/), "You changed the brain: Claude · Anthropic API · claude-haiku-5-5 · low effort."]);
  });

  it("the room says the effort as it is SENT: a provider whose docs name no effort gets its own default, one that does not take the desk's gets its own — said so, not as the desk's word", async () => {
    const about = (efforts: BrainAbout["efforts"]): (() => BrainAbout) => () => ({ kind: "model-api", format: "openai", baseUrl: "https://x.example/v1", efforts, keyFile: "credentials/brains/x.json", keyFrom: "file" });
    const xai = scriptedBrain(() => ({ leads: [], note: "" }), "grok-4.3", { id: "xai", label: "Grok · xAI API", about: about([]) });
    const deepseek = scriptedBrain(() => ({ leads: [], note: "" }), "deepseek-flash", { id: "deepseek", label: "DeepSeek", about: about(["low", "high"]) });
    const claude = scriptedBrain(() => ({ leads: [], note: "" }), "claude-opus-5-5", { id: "claude", label: "Claude · Anthropic API", models: BRAIN_MODELS, about: about(["low", "medium", "high"]) });
    const { hire, own, home } = await boot({ brain: [claude, xai, deepseek] });
    expect(code(await hire())).toBe("account");
    const said = () => readRoom(home).filter((m) => m.from === "you").at(-1)?.text;
    await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "xai", model: "grok-4.3", effort: "high" }) });
    expect(said()).toBe("You changed the brain: Grok · xAI API · grok-4.3 · the provider's own effort (its docs name no effort setting).");
    await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "deepseek", model: "deepseek-flash", effort: "medium" }) });
    expect(said()).toBe("You changed the brain: DeepSeek · deepseek-flash · the provider's own effort (it takes low or high, not medium).");
    await own({ type: "setDesk", desk: "desk", change: "brain", value: JSON.stringify({ provider: "deepseek", model: "deepseek-flash", effort: "high" }) });
    expect(said()).toBe("You changed the brain: DeepSeek · deepseek-flash · high effort.");
  });

  it("the house brain's standing is honest: no file, the example left in the file, a file it cannot use, a key — and never a value", () => {
    const home = mkdtempSync(join(tmpdir(), "account-brain-"));
    const dir = join(home, "credentials", "anthropic");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, "api-key.json");
    const env = {} as NodeJS.ProcessEnv;
    const KEY = "sk-ant-api03-TEST-not-a-real-key-0123456789";
    // no file, old or new: why in a sentence (the environment only for an account started by hand, no "chmod 600" to puzzle over), and the
    // fix — the NEW file's absolute path (credentials/brains/claude.json), a command that makes it with the EMPTY template, readable by the
    // user alone, and opens it, no restart
    const brainsDir = join(home, "credentials", "brains");
    const newFile = join(brainsDir, "claude.json");
    const none = brainReach({ home, env, platform: "darwin" });
    expect(none).toMatchObject({ ok: false, why: expect.stringMatching(/^no key: the brain reads an Anthropic API key from .*credentials\/brains\/claude\.json, which is not there yet; .* \(if you start the account by hand, ANTHROPIC_API_KEY in its environment works too\)$/) });
    expect(!none.ok && none.why).not.toMatch(/chmod/);
    expect(!none.ok && none.fix).toEqual({ code: "no-key", file: newFile, restart: false, command: `mkdir -p '${brainsDir}' && (umask 077 && printf '{"apiKey": ""}\\n' > '${newFile}') && open -e '${newFile}'`, words: expect.stringMatching(/^Run the command below: .*Paste your Anthropic API key \(it starts sk-ant-, from console\.anthropic\.com › API keys\) between the quotes .* no restart\.$/) });
    // the older file, credentials/anthropic/api-key.json, is still read while the new one is not there: what follows is about it
    expect(ANTHROPIC_KEY_SHAPE.example).toBe('{"apiKey": ""}');
    expect(claudeBrain({ home, env, platform: "darwin" }).ready()).toMatchObject({ ok: false, fix: { code: "no-key" } });
    // the template as the command makes it, left empty: the example, and the fix opens it again
    writeFileSync(file, '{"apiKey": ""}\n', { mode: 0o600 });
    expect(brainReach({ home, env, platform: "darwin" })).toMatchObject({ ok: false, why: expect.stringMatching(/api-key\.json holds the example, not a key: .* no restart needed/), fix: { code: "example", file, command: `open -e '${file}'`, restart: false } });
    // the how-to's old example, copied as it is: not a key, and the standing says so instead of "ready"
    writeFileSync(file, '{"apiKey": "sk-ant-..."}', { mode: 0o600 });
    expect(brainReach({ home, env })).toMatchObject({ ok: false, why: expect.stringMatching(/api-key\.json holds the example, not a key: put your key between the quotes .* no restart needed/), fix: { code: "example" } });
    writeFileSync(file, '{"apiKey": "sk-ant-…"}');
    expect(brainReach({ home, env })).toMatchObject({ ok: false, why: expect.stringMatching(/holds the example, not a key/) });
    writeFileSync(file, '{"secret": "x"}');
    expect(brainReach({ home, env, platform: "linux" })).toMatchObject({ ok: false, why: expect.stringMatching(/^the key file cannot be used: .*missing "apiKey"/), fix: { code: "unusable", command: `\${EDITOR:-nano} '${file}'` } });
    writeFileSync(file, `{"apiKey": "${KEY}"}`);
    expect(brainReach({ home, env })).toMatchObject({ ok: true, how: "the key file credentials/anthropic/api-key.json" });
    expect(claudeBrain({ home, env }).ready()).toMatchObject({ ok: true, model: "claude-opus-5-5" });
    chmodSync(file, 0o644);
    const open = brainReach({ home, env });
    expect(open).toMatchObject({ ok: false, why: expect.stringMatching(/^the key file cannot be used: .*chmod 600/), fix: { code: "unusable", command: `chmod 600 '${file}'`, restart: false } });
    expect(JSON.stringify(open)).not.toContain(KEY);
    // a home whose path has a quote in it: quoted for the shell, so the command still runs as written
    expect(shq("/Users/o'brien/home")).toBe("'/Users/o'\\''brien/home'");
    // the environment: the example is refused there too — no command from here, a restart; a key is taken
    expect(brainReach({ home, env: { ANTHROPIC_API_KEY: "sk-ant-..." } as NodeJS.ProcessEnv })).toMatchObject({ ok: false, why: expect.stringMatching(/^ANTHROPIC_API_KEY .* not a key/), fix: { code: "env", file: newFile, restart: true } });
    const fromEnv = claudeBrain({ home, env: { ANTHROPIC_API_KEY: KEY } as NodeJS.ProcessEnv }).ready();
    expect(fromEnv).toMatchObject({ ok: true, how: "ANTHROPIC_API_KEY in the service's environment" });
    expect(JSON.stringify(fromEnv)).not.toContain(KEY);
    rmSync(home, { recursive: true, force: true });
  });

  it("an outside agent holds a seat with its own key and speaks in the room; a key without a seat is refused", async () => {
    const { desk, hire, own, as, home } = await boot();
    await hire();
    await own({ type: "approveAgent", agentAddress: cc.address as `0x${string}`, agentName: "Claude Code", validUntil: START + 30 * DAY });
    await own({ type: "approveAgent", agentAddress: codex.address as `0x${string}`, agentName: "Codex", validUntil: START + 30 * DAY });
    expect(code(await own({ type: "setDesk", desk: "desk", change: "seat", value: JSON.stringify({ role: "flow", kind: "outside", address: cc.address }) }))).toBe("account");
    expect(code(await as(cc, { type: "agentDeskSay", lead: "", kind: "note", text: "FLOW online: watching the top wallets." }))).toBe("account");
    expect(code(await as(codex, { type: "agentDeskSay", lead: "", kind: "note", text: "hello" }))).toBe("E_ACCOUNT_OWNER_ONLY");
    expect(code(await as(cc, { type: "agentDeskSay", lead: "L-9999", kind: "note", text: "about nothing" }))).toBe("E_ACCOUNT_BAD_ACTION");
    const last = readRoom(home).at(-1)!;
    expect(last).toMatchObject({ from: "flow", kind: "note", text: "FLOW online: watching the top wallets." });
    const v = (await desk.view())!;
    expect(v.seats.find((s) => s.role === "flow")).toMatchObject({ kind: "outside", address: cc.address, name: "Claude Code", status: "ok" });
    // what the seat reads of the desk: its charter, the objective, the room
    const mine = await desk.forSeat(cc.address);
    if (isRefusal(mine)) throw new Error(mine.message);
    expect((mine.yourSeat as { role: string }).role).toBe("flow");
    expect((mine.room as unknown[]).length).toBeGreaterThan(2);
    const none = await desk.forSeat(codex.address);
    if (isRefusal(none)) throw new Error(none.message);
    expect(none.yourSeat).toBeNull();
  });

  it("a restart continues the desk: the file, the seats (let in again from the ledger), the leads, the room", async () => {
    const first = await boot();
    await first.hire();
    await first.own({ type: "setPolicy", change: "mode", value: "open" });
    await first.desk.cycle("test");
    const before = (await first.desk.view())!;
    expect(before.open).toHaveLength(1);
    const again = await boot({ home: first.home, at: 10 * 60_000 });
    expect(again.desk.hired()).toBe(true);
    const v = (await again.desk.view())!;
    expect(v.name).toBe("Test desk");
    expect(v.seats.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(v.seats.find((s) => s.role === "sniper")?.limit?.budgetUsd).toBe(500);
    expect(v.open.map((l) => l.id)).toEqual(["L-0001"]);
    expect(v.room.length).toBe(before.room.length);
    expect(v.session?.state).toBe("live");
  });
});

describe("the cap is the owner's to change", () => {
  it("setPolicy cap: signed up or down, in force at once for every order, and brought back by a restart from the signature alone", async () => {
    const first = await boot();
    const { svc, own, home } = first;
    let page = (await svc.accountView())!;
    expect(page.connectLive?.writes?.capUsd).toBe(100);
    // an owner's order of $300 is over a $100 cap; signed up to $500, it is placed
    const big = { type: "liveOrder" as const, venue: "ex", symbol: "BTC/USDT", side: "buy", orderType: "market", qty: "0.005" };
    const p1 = await svc.account!.prepare(big);
    expect(isRefusal(p1) && p1.code).toBe("E_ACCOUNT_LIMIT");
    expect(code(await own({ type: "setPolicy", change: "cap", value: "500" }))).toBe("account");
    page = (await svc.accountView())!;
    expect(page.connectLive?.writes?.capUsd).toBe(500);
    const p2 = await svc.account!.prepare(big);
    if (isRefusal(p2)) throw new Error(p2.message);
    expect(p2.quote?.order?.capUsd).toBe(500);
    // not a number, nothing, below zero: refused
    for (const value of ["", "abc", "-5", "0", "1.234"]) expect(code(await own({ type: "setPolicy", change: "cap", value }))).toBe("E_ACCOUNT_BAD_ACTION");
    // lowered again by signature
    expect(code(await own({ type: "setPolicy", change: "cap", value: "40" }))).toBe("account");
    expect((await svc.accountView())!.connectLive?.writes?.capUsd).toBe(40);
    // a restart with the server's own --live-cap of 100 brings back the last signed figure
    const again = await boot({ home, at: 10 * 60_000 });
    expect((await again.svc.accountView())!.connectLive?.writes?.capUsd).toBe(40);
    expect(again.svc.restored?.skipped ?? []).toEqual([]);
  });
});

/** A brain whose key the API refuses until `accept()`: it says it is ready (the key's shape is fine — only a call finds it refused), throws
 * E_BRAIN_KEY_REJECTED with the fix, as brain-claude.ts does on a 401; then answers as brainOf() does */
function refusingBrain(file: string): Brain & { accept(): void; calls: number } {
  const answers = brainOf();
  let accepted = false;
  const b = {
    id: "claude",
    label: "Claude · Anthropic API",
    models: BRAIN_MODELS,
    calls: 0,
    accept() {
      accepted = true;
    },
    ready: () => ({ ok: true, model: "claude-opus-5-5", how: "the key file credentials/anthropic/api-key.json" }),
    async decide<T>(r: Parameters<Brain["decide"]>[0]) {
      b.calls++;
      if (!accepted) throw keyRejected("the API did not accept the key", "Anthropic", rejectedFix(file, undefined, "Anthropic", "darwin"));
      return answers.decide(r) as Promise<Awaited<ReturnType<Brain["decide"]>>> as never as T;
    },
  };
  return b as unknown as Brain & { accept(): void; calls: number };
}

describe("what the desk says, as a person reads it", () => {
  it("a key the API refused is the brain's standing until a call is answered: not ready with the fix, said once in the room, the cycle says Search's brain did not answer — never a quiet market", async () => {
    const file = "/home/o/credentials/anthropic/api-key.json";
    const brain = refusingBrain(file);
    const { desk, hire, home } = await boot({ brain });
    await hire();
    await desk.cycle("test");
    let room = readRoom(home);
    // one line for the fault, from the account, saying where the key goes and that no restart is needed
    expect(room.filter((m) => m.from === "account" && m.text.includes("refused the brain's key"))).toEqual([expect.objectContaining({ kind: "note", text: `Anthropic refused the brain's key. Replace it in ${file}; the next cycle reads it, no restart.` })]);
    // Search says it in ONE line of the account's own (no brain mark), and the Head's cycle line says no lead was looked for
    const search = room.filter((m) => m.from === "search");
    expect(search).toHaveLength(1);
    expect(search[0]!.text).toMatch(/^Scanned \d+ markets?, but the brain did not answer \(the API did not accept the key\): no lead this cycle\.$/);
    expect(search[0]!.brain).toBeUndefined();
    expect(room.at(-1)).toMatchObject({ from: "head", kind: "cycle", text: "Cycle 1 (test): Search's brain did not answer, so no lead was looked for." });
    expect(room.some((m) => /nothing worth a lead|: no lead\.$/.test(m.text))).toBe(false);
    // the standing: not ready, why in a sentence, the fix — in the view, the floor's read and the catalog alike
    const v = (await desk.view())!;
    expect(v.brain).toMatchObject({ ok: false, why: `Anthropic refused the brain's key: replace it in ${file} — the next cycle reads it, no restart`, fix: { code: "rejected", file, command: `open -e '${file}'`, restart: false } });
    // the calls that got no answer are counted apart, at no cost
    expect(v.brain.spend).toMatchObject({ calls: 0, failed: 1, usd: 0 });
    const f = (await desk.feed(0))!;
    expect(f.brain).toMatchObject({ ok: false, fix: { code: "rejected", file } });
    expect(desk.catalog().brains[0]).toMatchObject({ id: "claude", ok: false, fix: { code: "rejected" } });
    // the next cycle still asks (that is how a replaced key is found to work), and the room does not say the fault again
    await desk.cycle("test");
    room = readRoom(home);
    expect(room.filter((m) => m.text.includes("refused the brain's key"))).toHaveLength(1);
    expect((await desk.view())!.brain.spend.failed).toBe(2);
    // the key replaced: the next call is answered, the fault is gone, and the room says so
    brain.accept();
    await desk.cycle("test");
    room = readRoom(home);
    expect(room.some((m) => m.from === "account" && m.text === "Anthropic answered the brain's call: its key works again.")).toBe(true);
    expect((await desk.view())!.brain).toMatchObject({ ok: true });
    expect((await desk.view())!.brain.fix).toBeUndefined();
    expect(room.some((m) => m.from === "search" && m.kind === "lead")).toBe(true);
  });

  it("a key changed on the page (Desk.keyChanged) clears the refusal of the OLD key at once — the view, the feed and the catalog agree with no cycle in between, even with the desk paused — and the room says it by the fingerprint only", async () => {
    const file = "/home/o/credentials/brains/claude.json";
    const brain = refusingBrain(file);
    const { desk, hire, own, home } = await boot({ brain });
    await hire();
    await desk.cycle("test");
    expect((await desk.view())!.brain).toMatchObject({ ok: false, fix: { code: "rejected" } });
    // paused: no cycle runs, so before keyChanged nothing could clear the fault
    expect(code(await own({ type: "setDesk", desk: "desk", change: "pause", value: "" }))).toBe("account");
    const calls = brain.calls;
    desk.keyChanged("claude", "1a2b3c4d");
    expect(brain.calls).toBe(calls);
    expect((await desk.view())!.brain).toMatchObject({ ok: true });
    expect((await desk.view())!.brain.fix).toBeUndefined();
    expect((await desk.feed(0))!.brain).toMatchObject({ ok: true });
    expect(desk.catalog().brains.find((b) => b.id === "claude")).toMatchObject({ ok: true });
    expect(readRoom(home).at(-1)).toMatchObject({ from: "you", kind: "you", text: "You saved a new key for Claude · Anthropic API (fingerprint 1a2b3c4d) — the refusal of the old key no longer stands; it is ready." });
    // what is not eight lower-case hex is never written as a fingerprint
    desk.keyChanged("claude", "sk-TESTnotArealKey0123456789abcdef");
    expect(readRoom(home).at(-1)?.text).toBe("You saved a new key for Claude · Anthropic API; it is ready.");
    expect(readFileSync(roomPath(home), "utf8")).not.toContain("TESTnotArealKey");
    // taken away; and a provider the desk does not hold: nothing
    desk.keyChanged("claude", "");
    expect(readRoom(home).at(-1)?.text).toBe("You took away the key saved for Claude · Anthropic API; it is ready.");
    const n = readRoom(home).length;
    desk.keyChanged("grok", "1a2b3c4d");
    expect(readRoom(home).length).toBe(n);
  });

  it("keyChanged leaves a refusal standing while a variable in the service's environment wins over the file — the brain still uses the refused key — and says so", async () => {
    const file = "/home/o/credentials/brains/claude.json";
    const brain = Object.assign(refusingBrain(file), { about: (): BrainAbout => ({ kind: "model-api", format: "anthropic", baseUrl: "https://api.anthropic.com", efforts: ["low", "medium", "high"], envWins: "ANTHROPIC_API_KEY", keyFile: "credentials/brains/claude.json", keyFrom: "env" }) });
    const { desk, hire, home } = await boot({ brain });
    await hire();
    await desk.cycle("test");
    desk.keyChanged("claude", "1a2b3c4d");
    expect((await desk.view())!.brain).toMatchObject({ ok: false, fix: { code: "rejected" } });
    expect(readRoom(home).at(-1)?.text).toMatch(/^You saved a new key for Claude · Anthropic API \(fingerprint 1a2b3c4d\) — but ANTHROPIC_API_KEY in the service's environment wins over the file, so the refused key is still the one in use; it is not ready: /);
  });

  it("Search's brain that gives no decision is said so too, in one line: not a quiet market", async () => {
    const { desk, hire, home } = await boot({ brain: brainOf({ search: () => ({ nonsense: true }) }) });
    await hire();
    await desk.cycle("test");
    const room = readRoom(home);
    expect(room.filter((m) => m.from === "search").map((m) => m.text)).toEqual([expect.stringMatching(/^Scanned \d+ markets?, but the brain gave no decision \(the script's answer did not fit\): no lead this cycle\.$/)]);
    expect(room.at(-1)?.text).toBe("Cycle 1 (test): Search's brain gave no decision, so no lead was looked for.");
    expect((await desk.view())!.brain.spend).toMatchObject({ calls: 1, failed: 0 });
    void DECISIONS;
  });

  it("figures grouped as a person reads them: the price at the market's places, the day's volume in the large, the plan's numbers short", async () => {
    const brain = brainOf({ risk: () => ({ verdict: "clear", why: "tight", sizeUsd: 40, tpPct: 1.23456, slPct: 0.4, maxHours: 12.5 }) });
    const { desk, hire, home } = await boot({ brain, prices: { "BTC/USDT": { ...SPOT("BTC/USDT", 62_420.7), volumeUsd24h: 603_890_041 } } });
    await hire();
    await desk.cycle("test");
    const clearance = readRoom(home).find((m) => m.kind === "clearance")!.text;
    // the room's protocol stays: " | " between the parts, "Verdict: …" last
    expect(clearance).toMatch(/^RISK CLEARANCE L-0001 \| market open · price 62,420\.7 · spread 0\.10% · volume \$603\.9M · day's loss room \$250\.00 · size up to \$50\.00 \| tight \| size \$40\.00 · TP \+1\.23% · SL -0\.4% · 12\.5 h \| Verdict: CLEAR → SNIPER$/);
  });

  it("a session started after the report's hour has no evening report minutes later; the start is SESSION START, never a morning status at night", async () => {
    // 22:00 New York: past the 21:00 report
    const { desk, hire, advance, home } = await boot({ at: 11 * HOUR });
    await hire({ hours: 48 });
    expect(readRoom(home).find((m) => m.kind === "report")?.text).toMatch(/^SESSION START — /);
    advance(2 * 60_000);
    await desk.tick();
    expect((await desk.view())!.reports.map((r) => r.kind)).toEqual(["start"]);
    // the next evening, at its hour: the day's report
    advance(23 * HOUR);
    await desk.tick();
    expect((await desk.view())!.reports.map((r) => r.kind)).toEqual(["start", "evening"]);
  });

  it("the bounds of the objective, for the form; a venue no longer connected is still called by its name, never its id", async () => {
    const { desk, hire, own, home } = await boot();
    expect(desk.catalog().bounds).toEqual({ targetPct: [0.1, 100], maxRiskPct: [0.1, 50], maxDailyLossPct: [0.1, 50], hours: [1, 336], everyMin: [1, 240], maxOpen: [1, 10] });
    // an MCP caller's number outside them is still held to the nearest end
    await hire({ hours: 1000 });
    let v = (await desk.view())!;
    expect([v.objective.hours, v.objective.venueName]).toEqual([336, "Ex"]);
    // a caller cannot name the venue: the account's row does
    await own({ type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ venueName: "Something else" }) });
    expect((await desk.view())!.objective.venueName).toBe("Ex");
    expect(code(await own({ type: "disconnectVenue", venue: "ex" }))).toBe("account");
    v = (await desk.view())!;
    expect(v.venue).toMatchObject({ id: "ex", name: "Ex", connected: false });
    expect((await desk.feed(0))!.venue).toMatchObject({ id: "ex", name: "Ex", connected: false });
    await desk.cycle("test");
    expect(readRoom(home).at(-1)?.text).toBe("Cycle 1 (test): Ex is not connected, so nothing is scanned.");
  });

  it("the first cycle comes soon after a hire and a resume — not at the clock's next tick — and the next one the objective's minutes after it", async () => {
    const { desk, hire, own, advance } = await boot();
    await hire();
    expect((await desk.view())!.routines.nextCycleAt).toBe(new Date(START + FIRST_CYCLE_MS).toISOString());
    advance(FIRST_CYCLE_MS);
    await desk.tick();
    expect((await desk.view())!.session?.cycles).toBe(1);
    expect((await desk.view())!.routines.nextCycleAt).toBe(new Date(START + FIRST_CYCLE_MS + 15 * 60_000).toISOString());
    await own({ type: "setDesk", desk: "desk", change: "pause", value: "" });
    advance(60_000);
    await own({ type: "setDesk", desk: "desk", change: "resume", value: "" });
    expect((await desk.view())!.routines.nextCycleAt).toBe(new Date(START + 2 * FIRST_CYCLE_MS + 60_000).toISOString());
  });

  it("where the clock runs, the first cycle after a hire is its own one-shot timer", async () => {
    const { desk, hire, home } = await boot({ tickMs: HOUR, firstCycleMs: 40 });
    const stop = desk.start();
    try {
      await hire();
      for (let i = 0; i < 100 && !readRoom(home).some((m) => m.kind === "cycle"); i++) await new Promise((r) => setTimeout(r, 20));
      expect(readRoom(home).find((m) => m.kind === "cycle")?.text).toMatch(/^Cycle 1 \(the clock\): /);
    } finally {
      stop();
    }
  });

  it("the floor's read is one moment: a room line written while the account's page was being read is in the same answer as the state it made", async () => {
    const { desk, hire, own, svc } = await boot();
    await hire();
    const real = svc.accountView.bind(svc);
    let release: (() => void) | undefined;
    let held = false;
    // the first page read the floor asks for is held until the owner's pause has landed
    svc.accountView = (async (...a: Parameters<typeof real>) => {
      const page = await real(...a);
      if (!held) {
        held = true;
        await new Promise<void>((r) => (release = r));
      }
      return page;
    }) as typeof svc.accountView;
    const pending = desk.feed(0);
    for (let i = 0; i < 100 && !release; i++) await new Promise((r) => setTimeout(r, 5));
    expect(code(await own({ type: "setDesk", desk: "desk", change: "pause", value: "" }))).toBe("account");
    release!();
    const f = (await pending)!;
    expect(f.session?.state).toBe("paused");
    expect(f.room.at(-1)?.text).toBe("You paused the desk: no cycle runs until you resume it. Open leads keep their plan when it does.");
    expect(f.seq).toBe(f.room.at(-1)?.seq);
  });
});
