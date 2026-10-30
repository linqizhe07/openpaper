/** THE BACKTEST ENGINE: a strategy (backtest/strategies.ts) played over recorded bars (backtest/source.ts) through THE PAPER ACCOUNT ITSELF
 * (live/paper.ts) — the same book, the same orders, the same rule for a fill, the same funding and liquidation the desk's paper trading
 * meets. Nothing here fills an order: the engine moves a clock and asks the paper account, so what a backtest says of a strategy is what the
 * paper account would have done with it, bar by bar.
 *
 * THE CLOCK steps from the start of one bar to the start of the next (every market's bar starts, in time order, inside the run's window),
 * and at each step, in this order:
 *   1. the paper account LOOKS at its book (its settle): the bar that just closed is judged the way the account judges time it did not watch
 *      (its catchUp) — the hours' funding at their recorded rates, a stop the bar reached triggered, a resting limit it reached filled, a
 *      perpetual whose bar crossed its liquidation price liquidated, stops before limits within a bar, a gap filled at the open
 *   2. the equity is read as the paper account values it (cash, holdings at the open, a perpetual's margin and its result at the mark)
 *   3. the strategy decides from what had closed — never the bar under way — and its weights become market orders: what must be reduced or
 *      closed first, then what is opened or added, each at the bar's open by the paper account's rule (the ask or the bid of the cost model,
 *      the book walked; a size the book does not hold fills nothing, and is said). A perpetual never flips side in one order: it is closed,
 *      then opened the other way
 * The last step, at the window's end, only looks and reads. A run is deterministic: the same bars, spec and costs give the same fills, the
 * same equity and the same figures, to the cent — the orders' client ids come from the run's seed.
 *
 * What a run does not do, said in its notes: borrow (a coin or a share is never shorted); a perpetual's margin is isolated, one position a
 * market; a share pays no dividend (its bars are split-adjusted only, where its source says so); the cost model is a model (source.ts). */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import { DEFAULT_QTY_STEP, paperSource, type PaperChange, type PaperFunding } from "../live/paper.ts";
import type { TradeLead } from "../account/journal.ts";
import type { ClosedTrip } from "../live/trips.ts";
import { floorTo, INTERVAL_MS, type OrderRequest } from "../live/trade.ts";
import { barIndexAt, barsClosed, barUnderWay, DEFAULT_COSTS, historySource, type BacktestCosts, type BacktestMarket } from "./source.ts";
import { metricsOf, type EquityPoint, type Metrics } from "./metrics.ts";
import { makeStrategy, paramWords, type StrategySpec, type StrategyView } from "./strategies.ts";

export const BACKTEST_VENUE = "paper-backtest";
/** the most a run steps: a year of minute bars, or eight years of hourly bars on one market */
export const BACKTEST_MAX_STEPS = 600_000;

export interface BacktestRequest {
  markets: BacktestMarket[];
  strategy: StrategySpec;
  /** the window, ms: the first step is the first bar to start at or after `from`; the last look is at `to` */
  from: number;
  to: number;
  cashUsd: number;
  /** the paper account's fee, in basis points of a fill's notional */
  feeBps: number;
  /** a perpetual's leverage, at most each market's own; none: what the strategy's weights can need (Strategy.leverage) */
  leverage?: number | undefined;
  costs?: Partial<BacktestCosts> | undefined;
  /** a change smaller than this, in dollars, is not traded (default: $10) */
  minTradeUsd?: number | undefined;
  /** how far past the bar's open a market order may fill at worst, in basis points (default 100) */
  maxSlippageBps?: number | undefined;
  /** a directory of the run's own, where a paper account keeps its book: a backtest's is kept in memory, so nothing is written there */
  home: string;
  /** what the orders' client ids are made from: the same seed, the same ids (default: the spec and the window) */
  seed?: string | undefined;
  /** the most steps this run may take, at most BACKTEST_MAX_STEPS (a run the service is asked for takes fewer) */
  maxSteps?: number | undefined;
  say?: ((line: string) => void) | undefined;
}

export interface BacktestFill {
  at: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  feeUsd: number;
  realizedUsd?: number | undefined;
  /** the bar's open when the engine placed the order (its own market orders only): the slippage is measured from it */
  refPrice?: number | undefined;
  note?: string | undefined;
}
export interface BacktestRefusal {
  at: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  why: string;
}
export interface BacktestRun {
  strategy: { id: string; name: string; words: string; params: Record<string, number>; paramWords: string };
  markets: Array<{ symbol: string; kind: string; name: string; from: string; interval: string; bars: number; first: string; last: string; fundingHours: number }>;
  from: string;
  to: string;
  cashUsd: number;
  feeBps: number;
  leverage: number;
  costs: BacktestCosts;
  equity: EquityPoint[];
  fills: BacktestFill[];
  funding: { paidUsd: number; receivedUsd: number; hours: number };
  /** every round trip the run closed (live/trips.ts): a market held from nothing back to nothing, its entry and exit, its result, its
   * extremes — and for the desk's run, the lead that placed it (account/journal.ts). A run kept before trips were told has none */
  trips?: Array<ClosedTrip & { lead?: TradeLead | undefined }> | undefined;
  refused: BacktestRefusal[];
  metrics: Metrics;
  notes: string[];
  wallMs: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const round = (x: number, places: number): number => Number(x.toFixed(places));

/** the moments the clock stops at: every bar start inside [from, to), and `to` */
export function stepsOf(markets: readonly BacktestMarket[], from: number, to: number): number[] {
  const at = new Set<number>();
  for (const m of markets) for (let i = Math.max(0, barIndexAt(m.bars, from - 1) + 1); i < m.bars.length && m.bars[i]!.t < to; i++) if (m.bars[i]!.t >= from) at.add(m.bars[i]!.t);
  at.add(to);
  return [...at].sort((a, b) => a - b);
}

/** a strategy played over recorded bars through the paper account (see the top of this file) */
export async function runBacktest(req: BacktestRequest): Promise<BacktestRun | Refusal> {
  const started = Date.now();
  if (!req.markets.length) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest needs at least one market" });
  if (!(req.to > req.from)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest's window ends after it starts" });
  if (!(req.cashUsd >= 100 && req.cashUsd <= 100_000_000)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest starts with $100 to $100,000,000 of paper money" });
  if (!(req.feeBps >= 0 && req.feeBps <= 500)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest's fee is 0 to 500 basis points" });
  if (req.leverage !== undefined && !(req.leverage >= 1 && req.leverage <= 50)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest's leverage is 1 to 50" });
  const steps = stepsOf(req.markets, req.from, req.to);
  if (steps.length < 2) return no("E_ACCOUNT_BAD_ACTION", { message: `no bar of ${req.markets.map((m) => m.symbol).join(", ")} starts between ${iso(req.from)} and ${iso(req.to)}` });
  const most = Math.min(BACKTEST_MAX_STEPS, req.maxSteps ?? BACKTEST_MAX_STEPS);
  if (steps.length > most) return no("E_ACCOUNT_BAD_ACTION", { message: `a backtest here steps ${most.toLocaleString("en-US")} times at most; this one would step ${steps.length.toLocaleString("en-US")} — a coarser bar, a shorter window or fewer markets` });
  const costs: BacktestCosts = { ...DEFAULT_COSTS, ...(req.costs ?? {}) };
  const minTrade = req.minTradeUsd ?? 10;
  const slip = (req.maxSlippageBps ?? 100) / 10_000;
  const strategy = makeStrategy(req.strategy);
  const leverage = req.leverage ?? strategy.leverage(req.markets);
  const seed = req.seed ?? `${req.strategy.id}|${paramWords(req.strategy)}|${req.from}|${req.to}|${req.markets.map((m) => m.symbol).join(",")}`;
  const bySymbol = new Map(req.markets.map((m) => [m.symbol, m] as const));

  // ---- the clock, the bars on it, and the paper account on them ----
  let clock = steps[0]!;
  const source = historySource({ markets: req.markets, clock: () => clock, costs });
  mkdirSync(req.home, { recursive: true, mode: 0o700 });
  const funding: PaperFunding[] = [];
  const made = await paperSource({ home: req.home, venue: BACKTEST_VENUE, label: "Backtest", cashUsd: req.cashUsd, sources: () => [source], clock: () => clock, feeBps: req.feeBps, onFunding: (row) => void funding.push(row), memory: true, bars: true });
  if (isRefusal(made)) return made;
  const paper = made.source;
  const trader = paper.trader;
  if (!trader || !paper.settle) return no("E_ACCOUNT_BAD_ACTION", { message: "the backtest's paper account has no trader" });

  // what is held, signed, as the book tells it; every fill as it happens, with the open the engine placed it at
  const held = new Map<string, number>();
  const fills: BacktestFill[] = [];
  const trips: ClosedTrip[] = [];
  const refOf = new Map<string, number>();
  const off = paper.paperEvents?.listen((c: PaperChange) => {
    if (c.trips) trips.push(...c.trips);
    for (const p of c.positions) held.set(p.symbol, p.position ? (p.position.side === "short" ? -p.position.qty : p.position.qty) : 0);
    for (const f of c.fills) {
      const ref = f.clientId ? refOf.get(f.clientId) : undefined;
      fills.push({ at: f.at, symbol: f.symbol, side: f.side, qty: f.qty, price: f.price, feeUsd: f.feeUsd, ...(f.realizedUsd !== undefined ? { realizedUsd: f.realizedUsd } : {}), ...(ref !== undefined ? { refPrice: ref } : {}), ...(f.note ? { note: f.note } : {}) });
    }
  });
  const refused: BacktestRefusal[] = [];
  let seq = 0;
  const clientId = (): string => createHash("sha256").update(`${seed}|${++seq}`).digest("hex").slice(0, 32);

  /** one market order at the bar's open, told back: filled, or refused and said */
  const order = async (m: BacktestMarket, side: "buy" | "sell", qty: number, reduceOnly: boolean, open: number): Promise<void> => {
    // on the market's own step, else the paper account's (DEFAULT_QTY_STEP), floored by its decimals: never a float's tail off the step
    const q = floorTo(qty, m.qtyStep ?? DEFAULT_QTY_STEP);
    if (!(q > 0) || (m.minQty !== undefined && q < m.minQty - 1e-12) || q * open < Math.max(minTrade, m.minNotional ?? 0)) return;
    const id = clientId();
    refOf.set(id, open);
    const o: OrderRequest = { symbol: m.symbol, side, type: "market", qty: q, worstPrice: round(side === "buy" ? open * (1 + slip) : open * (1 - slip), 10), clientId: id, ...(reduceOnly && m.kind === "perp" ? { reduceOnly: true } : {}) };
    const r = await trader.place(o);
    if (isRefusal(r)) refused.push({ at: iso(clock), symbol: m.symbol, side, qty: o.qty, why: r.message ?? r.code });
    else if (r.status === "rejected" || r.status === "canceled" || r.status === "expired") refused.push({ at: iso(clock), symbol: m.symbol, side, qty: o.qty, why: String((r.native as { note?: string } | undefined)?.note ?? r.status) });
  };

  /** each perpetual's leverage as set at the start (a coin or a share is paid in full) */
  const levOf = new Map<string, number>();
  /** how many decisions asked for more than the equity holds, and were scaled down to it */
  let scaledDown = 0;
  /** what a dollar traded costs at most, as a share of it: the fee, the half spread, and the walk to the book's last level */
  const costRate = (req.feeBps + costs.halfSpreadBps + Math.max(0, costs.levels - 1) * costs.levelBps) / 10_000;
  /** THE WEIGHTS MADE ORDERS: what is reduced or closed first, then what is opened or added. Before that, what they would need of the
   * equity once traded — a coin or a share paid in full, a perpetual its margin (its notional over its leverage), a market the weights leave
   * out at what it holds now, and every dollar traded its costs (costRate) — and where that is more than ROOM of the equity, the weights
   * asked are scaled down together to fit beside what the others hold, rather than an order refused and asked again at every bar. A market
   * the weights leave out is never traded for it */
  const ROOM = 0.995;
  const needOf = (m: BacktestMarket, w: number): number => (m.kind === "perp" ? Math.abs(w) / (levOf.get(m.symbol) ?? 1) : Math.max(0, w));
  const rebalance = async (asked: Record<string, number>, equity: number): Promise<void> => {
    /** the markets left out, as they stand */
    let fixed = 0;
    /** the markets asked: what they need at their weights, their weights' sizes, what they hold now, and what trading to them moves */
    let wanted = 0;
    let size = 0;
    let holds = 0;
    let moved = 0;
    for (const m of req.markets) {
      const i = barUnderWay(m, clock);
      if (i < 0) continue;
      const now = ((held.get(m.symbol) ?? 0) * m.bars[i]!.o) / equity;
      const raw = asked[m.symbol];
      if (raw === undefined || !Number.isFinite(raw)) {
        fixed += needOf(m, now);
        continue;
      }
      const w = m.kind === "perp" ? raw : Math.max(0, raw);
      wanted += needOf(m, w);
      size += Math.abs(w);
      holds += Math.abs(now);
      moved += Math.abs(w - now);
    }
    // past the room: the weights asked scaled down together by k, so what they need with the trades' costs — at most
    // fixed + k·wanted + (k·size + holds)·costRate, however the trades fall — fits it
    const k = fixed + wanted + moved * costRate > ROOM && wanted > 0 ? Math.max(0, Math.min(1, (ROOM - fixed - holds * costRate) / (wanted + size * costRate))) : 1;
    if (k < 1) scaledDown++;
    const weights = k < 1 ? Object.fromEntries(Object.entries(asked).map(([s, w]) => [s, w * k])) : asked;
    const cuts: Array<() => Promise<void>> = [];
    const adds: Array<() => Promise<void>> = [];
    for (const [symbol, raw] of Object.entries(weights)) {
      const m = bySymbol.get(symbol);
      if (!m || !Number.isFinite(raw)) continue;
      const i = barUnderWay(m, clock);
      if (i < 0) continue;
      const open = m.bars[i]!.o;
      const w = m.kind === "perp" ? raw : Math.max(0, raw);
      const target = (w * equity) / open;
      const now = held.get(symbol) ?? 0;
      if (Math.abs(target - now) * open < minTrade) continue;
      if (m.kind === "perp" && now !== 0 && Math.sign(target) !== Math.sign(now)) {
        cuts.push(() => order(m, now > 0 ? "sell" : "buy", Math.abs(now), true, open));
        if (target !== 0) adds.push(() => order(m, target > 0 ? "buy" : "sell", Math.abs(target), false, open));
      } else if (Math.abs(target) < Math.abs(now)) cuts.push(() => order(m, now > 0 ? "sell" : "buy", Math.abs(now) - Math.abs(target), true, open));
      else adds.push(() => order(m, target > 0 ? "buy" : "sell", Math.abs(target) - Math.abs(now), false, open));
    }
    for (const f of cuts) await f();
    for (const f of adds) await f();
  };

  const view: StrategyView = {
    get now() {
      return clock;
    },
    markets: req.markets,
    count: (symbol) => {
      const m = bySymbol.get(symbol);
      return m ? barsClosed(m, clock) : 0;
    },
    last: (symbol, k) => {
      const m = bySymbol.get(symbol);
      if (!m) return [];
      const n = barsClosed(m, clock);
      return m.bars.slice(Math.max(0, n - Math.max(0, Math.floor(k))), n);
    },
    funding: (symbol, since) => (bySymbol.get(symbol)?.funding ?? []).filter((f) => f.at > since && f.at <= clock),
    held: (symbol) => held.get(symbol) ?? 0,
    equityUsd: 0,
  };

  const equity: EquityPoint[] = [];
  const notes: string[] = [];
  try {
    // a perpetual's leverage, set once at the start: the run's, at most the market's own
    for (const m of req.markets.filter((x) => x.kind === "perp")) {
      const lev = Math.max(1, Math.min(leverage, m.maxLeverage ?? leverage));
      levOf.set(m.symbol, lev);
      if (lev !== leverage) notes.push(`${m.symbol} trades at ${lev}x, its most, not ${leverage}x`);
      if (trader.setLeverage && lev > 1) {
        const set = await trader.setLeverage(m.symbol, lev);
        if (isRefusal(set)) notes.push(`${m.symbol}'s leverage could not be set to ${lev}x: ${set.message ?? set.code}`);
      }
    }
    let said = -1;
    for (let k = 0; k < steps.length; k++) {
      clock = steps[k]!;
      await paper.settle();
      const lines = await paper.read();
      const usd = round(lines.reduce((s, l) => s + (l.usd ?? 0), 0), 6);
      let gross = 0;
      for (const [symbol, qty] of held) {
        const m = bySymbol.get(symbol);
        if (!m || !qty) continue;
        const i = barUnderWay(m, clock);
        const px = i >= 0 ? m.bars[i]!.o : m.bars[Math.max(0, barsClosed(m, clock) - 1)]?.c;
        if (px !== undefined) gross += Math.abs(qty) * px;
      }
      equity.push({ t: clock, usd, grossUsd: round(gross, 2) });
      if (k === steps.length - 1) break;
      (view as { equityUsd: number }).equityUsd = usd;
      const weights = strategy.decide(view);
      if (weights && usd > 0) await rebalance(weights, usd);
      const pct = Math.floor((k / steps.length) * 10);
      if (req.say && pct !== said) {
        said = pct;
        req.say(`${iso(clock).slice(0, 16)} · equity $${usd.toFixed(2)} · ${fills.length} fills`);
      }
    }
    await paper.paperBook?.flush();
  } finally {
    off?.();
    paper.stop?.();
  }

  const paid = funding.filter((f) => f.usd > 0).reduce((s, f) => s + f.usd, 0);
  const received = -funding.filter((f) => f.usd < 0).reduce((s, f) => s + f.usd, 0);
  const slippage = fills.reduce((s, f) => (f.refPrice === undefined ? s : s + (f.side === "buy" ? f.price - f.refPrice : f.refPrice - f.price) * f.qty), 0);
  const metrics = metricsOf(equity, { fills: fills.length, tradedUsd: fills.reduce((s, f) => s + f.qty * f.price, 0), feesUsd: fills.reduce((s, f) => s + f.feeUsd, 0), fundingUsd: paid - received, slippageUsd: slippage });
  if (scaledDown) notes.push(`${scaledDown} decision${scaledDown === 1 ? "" : "s"} asked for more than the equity holds (a coin or a share paid in full, a perpetual its margin, the trades' fee and spread out of it too) and ${scaledDown === 1 ? "was" : "were"} scaled down to fit it`);
  if (refused.length) notes.push(`${refused.length} order${refused.length === 1 ? " was" : "s were"} not filled (the first: ${refused[0]!.why})`);
  if (req.markets.some((m) => m.kind === "spot")) notes.push("a coin or a share is bought and sold, never shorted or borrowed");
  if (req.markets.some((m) => m.kind === "perp")) notes.push("a perpetual's margin is isolated, one position a market, liquidated at half its initial margin at the market's most leverage (the paper account's rule)");
  return {
    strategy: { id: req.strategy.id, name: strategy.name, words: strategy.words, params: req.strategy.params, paramWords: paramWords(req.strategy) },
    markets: req.markets.map((m) => ({ symbol: m.symbol, kind: m.kind, name: m.name, from: m.from, interval: m.interval, bars: m.bars.length, first: iso(m.bars[0]?.t ?? 0), last: iso((m.bars[m.bars.length - 1]?.t ?? 0) + INTERVAL_MS[m.interval]), fundingHours: m.funding?.length ?? 0 })),
    from: iso(steps[0]!),
    to: iso(req.to),
    cashUsd: req.cashUsd,
    feeBps: req.feeBps,
    leverage,
    costs,
    equity,
    fills,
    funding: { paidUsd: round(paid, 2), receivedUsd: round(received, 2), hours: funding.length },
    trips,
    refused,
    metrics,
    notes,
    wallMs: Date.now() - started,
  };
}
