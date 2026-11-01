/** ORDERS at venues connected live: the account's door for trading with the user's own money, at the user's own venues.
 *
 * This is what lets an agent take off. An order is ONE venue call — an exchange's order, a broker's, a prediction market's, a DEX swap the
 * user's wallet sends — and it is placed only when all of this holds:
 *
 *   1. the server moves real money (it does unless it was started `--read-only`);
 *   2. the market is priced in dollars, is open, and the venue takes the order as written (its smallest size, its steps, its order types);
 *   3. it is worth no more than the most one order may be on this server (`--live-cap`), valued at the price the venue shows now: a buy at
 *      the ask (or its limit, if higher), a sell at the bid (or its limit, if higher — a sell priced under the bid fills at the bid). At a
 *      PAPER account (LiveVenue.paper: the venue's own test environment, no real money there) the cap does not apply; everything else
 *      here does, so a rehearsal there goes through the same door as the real thing;
 *   4. a MARKET order carries a worst price to the venue: a buy pays at most 2% over the ask, a sell takes at least 2% under the bid. What
 *      the account counts is what that worst price allows, and if a venue fills worse anyway, the real cost is counted, not the plan;
 *   5. the OWNER signed it — the exact size, the limit price, what it is worth and ten minutes — or an AGENT asked inside the trading limit
 *      the owner signed for it (which venues, how much an order, how much in all, until when), with the dial open to it (the session, the
 *      venue switched on). Guard mode: the agent's order is a card the owner signs, and the owner's yes places exactly the card;
 *      Beast: inside its limit it is placed at once;
 *   6. the venue itself agrees: its own key permissions, balances, risk checks and region rules still apply, and its refusal is the answer.
 *
 * Trading moves money between what the user holds AT ONE VENUE (dollars into BTC, shares into cash); nothing leaves the venue by an order.
 * Withdrawals stay where they were: the owner's signature, to the user's own places only (live-moves.ts). An agent can cancel the orders it
 * placed, in either mode — taking an order off the book never needs a card. The owner can cancel any. An order the venue has only agreed to
 * cancel is followed until the venue says it is gone: it may still fill on the way.
 */
import { createHash, randomBytes } from "node:crypto";
import { keccak256, stringToHex, type Hex } from "viem";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { canonical } from "../../core/hash.ts";
import { no, unaddressed } from "../refuse.ts";
import type { Intent } from "../accounts.ts";
import { isExpired } from "../openness.ts";
import { holdBackMs } from "../live/public-markets.ts";
import { ceilTo, DONE, floorTo, inDollars, notionalOf, onStep, ORDER_TYPES, plain, TIFS, type LiveTrader, type Market, type MarketKind, type OrderChange, type OrderRequest, type OrderState, type OrderStatus, type OrderType, type Position, type Side, type TimeInForce } from "../live/trade.ts";
import type { CardLike, Outcome } from "./exchange.ts";
import type { LiveEngine, LiveMoney, LiveVenue } from "./live-moves.ts";
import { figure, orderLine } from "./statement.ts";
import { CARD_TTL_MS } from "./mode-rules.ts";
import type { TradePlan } from "./plans.ts";
import { micro, type AgentAction, type Envelope, type OwnerAction } from "./sign.ts";
import { covers, renewSpend, spendFor, type AgentKey, type SpendApproval } from "./state.ts";

export type LiveOrderAction = Extract<OwnerAction, { type: "liveOrder" }>;
export type LiveCancelAction = Extract<OwnerAction, { type: "liveCancel" }>;
export type AgentLiveOrderAction = Extract<AgentAction, { type: "agentLiveOrder" }>;
export type AgentLiveCancelAction = Extract<AgentAction, { type: "agentLiveCancel" }>;
export type LiveAmendAction = Extract<OwnerAction, { type: "liveAmend" }>;
export type AgentLiveAmendAction = Extract<AgentAction, { type: "agentLiveAmend" }>;
export type AgentLiveCloseAction = Extract<AgentAction, { type: "agentLiveClose" }>;
type CloseFields = { venue: string; symbol: string; qty: string };
type LeverageFields = { venue: string; symbol: string; leverage: string; marginMode: string };

/** one order the account placed, as the page, the ledger and an agent see it */
export interface LiveOrder {
  /** the account's id: `ord-0001` */
  id: string;
  /** what the venue was given as its idempotency key: new in every run of the account, so two runs never send the same one */
  clientId: string;
  at: string;
  venue: string;
  venueName: string;
  symbol: string;
  name: string;
  kind: MarketKind;
  base: string;
  side: Side;
  type: OrderType;
  /** in base units */
  qty: number;
  limitPrice?: number | undefined;
  /** a market or stop order: the worst price the venue was told it may fill at */
  worstPrice?: number | undefined;
  /** a stop or stop-limit order: the price that triggers it */
  stopPrice?: number | undefined;
  tif?: TimeInForce | undefined;
  postOnly?: boolean | undefined;
  reduceOnly?: boolean | undefined;
  /** sent for the extended session that was on (pre-market, after-hours, overnight) */
  extendedHours?: boolean | undefined;
  /** a trailing stop's trail: in percent, or in the market's quote */
  trailPercent?: number | undefined;
  trailPrice?: number | undefined;
  /** a bracket's exits, placed by the venue once it fills: a take-profit limit and a stop-loss stop */
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  /** one of those exits, as the venue placed it: the account's id of the order it closes, and which exit it is. Placed by no door — its
   * entry's signature or limit placed it — it counts on no limit, and is followed, shown and canceled as any order is */
  exitOf?: { order: string; kind: "take-profit" | "stop-loss" } | undefined;
  /** a contract is this much base */
  contractSize?: number | undefined;
  /** the price it was valued at when it was placed, and what it was worth then in dollars (the most it may cost, for a market buy) */
  price: number;
  usd: number;
  status: OrderStatus;
  filledQty: number;
  avgPrice?: number | undefined;
  feeUsd?: number | undefined;
  /** the venue's own id */
  ref: string;
  signer: string;
  authority: "owner" | "agent";
  agent?: string | undefined;
  card?: string | undefined;
  /** the trading limit this order counts against, until it is done */
  approval?: string | undefined;
  /** a wallet order taken back before the wallet sent it: the limit it counted against, in case the wallet sends it after all */
  heldBy?: string | undefined;
  /** the venue agreed to cancel it and has not yet said it is gone */
  canceling?: boolean | undefined;
  /** the account stopped following it: a cancel was asked while its venue was not connected (it did not come back after a restart), or
   * while its venue refused this network, so what it held of a limit was given back and nothing is asked of the venue about it. What became
   * of it is the venue's to show */
  unfollowed?: true | undefined;
  /** the owner's plan signed for it on the ticket (account/plans.ts), carried to the journal's trade it opens */
  plan?: TradePlan | undefined;
  /** an owner's order at a paper account that opened or added to a position: what the owner's own entries a day are counted in */
  entry?: true | undefined;
  /** the owner asked to cancel it while its venue refused this network: the account sends that cancel again by itself once a check of the
   * network finds the venue answering, and follows the order again from the venue's answer */
  cancelWanted?: true | undefined;
  /** while the cancel waits to be sent again: the limit the order was counted on and what had filled then, so that what fills before the
   * venue takes the cancel is counted on that limit too */
  wantedFrom?: { approval: string; filled: number } | undefined;
  /** the order call's answer was lost (the network turned, a timeout, a gateway's 5xx): the venue may hold it. It has no ref yet, it keeps
   * what it counts on a limit, and it is looked up by the account's id (`clientId`) until the venue shows it or shows none */
  unconfirmed?: true | undefined;
  /** a change the venue did not confirm (the amend's answer was lost): the order as the change would leave it, and what it would then count.
   * What the change grew by stays counted; the venue's next answer that says the order's size settles which of the two stands */
  changing?: { qty: number; price: number; usd: number; limitPrice?: number | undefined; stopPrice?: number | undefined; worstPrice?: number | undefined } | undefined;
  /** a wallet order: the hash the wallet reported for it — once there is one, that is the transaction, and the page reports it again rather
   * than sending another */
  reported?: string | undefined;
  action?: Hex | undefined;
  note: string;
  updatedAt: string;
  native: unknown;
  /** from a wallet: the transactions the wallet is asked to send, in order */
  walletTxs?: OrderState["walletTxs"];
  /** at a PAPER account (the venue's own test environment): a rehearsal, no real money in it */
  paper?: true | undefined;
}

/** THE DESK'S AUTONOMY ON PAPER (account/desk.ts, the superagent): the one question this door asks beyond the dial. In Guard every order an
 * agent asks for waits for the owner on a card; the owner may sign one narrower thing for the account's own desk — that its own seats'
 * orders at its paper account go at once. The host answers (service.ts: the desk's autonomyFor, only for a venue that is a paper account)
 * with the words the ledger's row starts with, or nothing. This door asks only for an agent's order or close at a venue that is paper by
 * its own connection (LiveVenue.paper), only when the dial is Guard; everything else about the order is judged as for any agent — its
 * trading limit and its signature, the dial's session and reach, the venue's place rule, the per-order line, the budget, the window */
export interface AutonomyHook {
  autonomy?(signer: string, venue: string): string | undefined;
}

/** THE OWNER'S PLAN AND OWN LIMITS (account/plans.ts): the plan the owner signed for their next entry, read (`keep`) or taken for the order
 * it goes on, and what holds a new entry of theirs back at a paper account — asked only of the owner's order at a paper account that opens
 * or adds to a position (opens), never of a close. Their words go back to the owner as the refusal's (E_ACCOUNT_LIMIT) */
export interface PlanHook {
  takePlan?(venue: string, symbol: string, side: string, keep?: boolean): TradePlan | undefined;
  selfBlock?(o: { planned?: boolean | undefined }): { why: string; until?: string | undefined } | undefined;
}

/** what this door uses of the engine, besides what the money door uses */
export interface OrderEngine extends LiveEngine {
  orders: LiveOrder[];
  nextOrderId(): string;
  host: LiveEngine["host"] & AutonomyHook & PlanHook;
}

interface Fields {
  venue: string;
  symbol: string;
  side: string;
  orderType: string;
  qty: string;
  usd: string;
  limitPrice: string;
  stopPrice: string;
  tif: string;
  postOnly: string;
  reduceOnly: string;
  /** "true": a limit order for the extended session that is on, where the market's session takes one */
  extendedHours: string;
  /** a trailing stop's trail, one of the two: a percent, or a price in the market's quote */
  trailPercent: string;
  trailPrice: string;
  /** a bracket's exits, where the market takes them: a take-profit limit and a stop-loss stop, placed once the order fills */
  takeProfit: string;
  stopLoss: string;
}

interface Plan {
  f: Fields;
  v: LiveVenue & { trader: LiveTrader };
  m: Market;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number | undefined;
  /** the price it is valued at */
  price: number;
  notional: number;
  /** a market or stop order: the worst price it may fill at */
  worstPrice?: number | undefined;
  stopPrice?: number | undefined;
  tif?: TimeInForce | undefined;
  postOnly?: boolean | undefined;
  reduceOnly?: boolean | undefined;
  extendedHours?: boolean | undefined;
  trailPercent?: number | undefined;
  trailPrice?: number | undefined;
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  /** what it is counted at: what it may cost at worst (a buy), what it is worth now (a sell) */
  maxUsd: number;
}

/** what a card showed the owner: the owner's yes places this, and nothing else */
interface Shown {
  symbol: string;
  qty: number;
  price: number;
  notional: number;
  maxUsd: number;
}

/** What a trader may carry beyond trade.ts's shapes, each read only where it is there (live/exchange-trade.ts has them; trade.ts names
 * them once its owner adds them):
 *   · an order's state with what the venue holds it at — its whole size in the units it was placed in, its limit, its stop;
 *   · `byClient`: an order the account could not hear placed, looked up by the account's id — its state, `null` when the venue shows none
 *     under that id, `undefined` when it cannot be asked that way;
 *   · `held`: whether the venue's place rule (or the account's reading of its terms) refuses this order from here, signing and sending
 *     nothing — asked before the owner is quoted or an agent's card is raised */
type Held = OrderState & { qty?: number | undefined; limitPrice?: number | undefined; stopPrice?: number | undefined };
type Extras = LiveTrader & {
  byClient?(clientId: string, symbol: string, type: OrderType): Promise<OrderState | null | undefined | Refusal>;
  held?(o: { side: Side; reduceOnly?: boolean | undefined; symbol?: string | undefined }): Promise<Refusal | undefined>;
  /** what is held at the one venue a market is at, where the trader reaches several (mm): a close reads only that part */
  positionsOf?(symbol: string): Promise<Position[] | Refusal>;
};
/** the hold a venue's answer asks for, from the one rule (live/public-markets.ts holdBackMs), when the venue said it: its place rule or the
 * server in front of it refusing this network, a ban of this machine's address or a wait it named. A venue that only did not answer is
 * asked again by each poll's own backoff, never held here */
const heldFor = (r: Refusal, now: number): number => (r.code === "E_VENUE_GEOBLOCKED" || typeof (r.native as { until?: unknown } | undefined)?.until === "number" ? holdBackMs(r, now) : 0);
/** a refusal of this network rather than of the order: the venue's place rule or its edge, the key's IP list, a ban of this address */
const refusesNetwork = (r: Refusal): boolean => {
  const d = (r.detail ?? {}) as { scope?: unknown; ipList?: unknown; bannedUntil?: unknown; edge?: unknown };
  const n = (r.native ?? {}) as { edge?: unknown; ban?: unknown };
  return (r.code === "E_VENUE_GEOBLOCKED" && d.scope === undefined) || d.ipList === true || d.edge === true || n.edge === true || n.ban === true || d.bannedUntil !== undefined;
};
/** an order call whose outcome the venue did not say: it may have been placed (the trader's own words: `placed: "unknown"`, or no answer
 * with the account's id given to look it up by). "Looked, and none was placed" (`placed: false`) is not one */
const outcomeUnknown = (r: Refusal): boolean => {
  const d = (r.detail ?? {}) as { placed?: unknown; clientOrderId?: unknown; unsure?: unknown };
  if (d.placed === false) return false;
  return d.placed === "unknown" || d.unsure === true || (r.code === "E_VENUE_UNREACHABLE" && d.clientOrderId !== undefined);
};

const TTL_MS = 10 * 60_000;
/** the longest a quote waits for its venue's estimate (fee, liquidation price): one that is late is left out, the quote is not held for it */
const ESTIMATE_MS = 1_500;
const POLL_MS = 10_000;
/** how long an order whose answer was lost may go unseen under the account's id before the venue's "none" is believed: an order on its way
 * through the venue's gateway shows up late */
const UNSEEN_MS = 2 * 60_000;
/** the longest the account waits for a venue to say how an order stands */
const STATUS_MS = 15_000;
/** how far a market order may fill from the price the account saw: a buy pays at most this much more, a sell takes at most this much less */
export const SLIPPAGE = 0.02;
const DEC = /^\d+(\.\d{1,12})?$/;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });
const cents = (n: number) => Math.ceil(n * 100 - 1e-6) / 100;
const text = (v: unknown) => (typeof v === "string" ? v : "");

export class LiveOrders {
  private readonly polled = new Map<string, number>();
  /** what each waiting card showed, by card id */
  private readonly shown = new Map<string, Shown>();
  /** what each waiting card for an AMEND showed: the order as it would be */
  private readonly shownAmend = new Map<string, { order: string; qty: number; limitPrice?: number | undefined; stopPrice?: number | undefined; maxUsd: number }>();
  /** what each close card showed the owner: the market and the size, which an approval releases exactly */
  private readonly shownClose = new Map<string, { symbol: string; qty: number }>();
  /** what each leverage card showed the owner: the market, the leverage and the margin mode, which an approval sets exactly */
  private readonly shownLeverage = new Map<string, { symbol: string; leverage: number; marginMode: string }>();
  /** this run of the account: part of every client id it sends, so a restart never sends a venue an id it has seen */
  private readonly run = randomBytes(8).toString("hex");
  /** the venues this door holds back, and why: a ban of this machine's address until the venue's time, or its place rule or edge for ten
   * minutes (heldFor) — no poll, no read and no cancel is sent to them before then */
  private readonly holds = new Map<string, { until: number; r: Refusal }>();
  constructor(private readonly e: OrderEngine) {}

  private money() {
    return this.e.host.liveMoney?.();
  }

  /** the refusal that holds a venue back now: the account's own hold for it where the host shares one (the venue's reads keep it, and a
   * forced re-check or a reconnect lets go of it there), or else this door's. Only what the venue asked for holds a door — its place rule or
   * edge, a ban, a wait it named (heldFor): a read that only did not answer never stops an order. Holds run on the real clock (Date.now), the
   * one a ban's `until` is told in */
  private heldAt(venue: string): Refusal | undefined {
    const host = this.money() as { held?(venue: string): Refusal | undefined } | undefined;
    if (host?.held) {
      const shared = host.held(venue);
      return shared && heldFor(shared, Date.now()) > 0 ? shared : undefined;
    }
    const own = this.holds.get(venue);
    if (own && Date.now() < own.until) return own.r;
    if (own) this.holds.delete(venue);
    return undefined;
  }

  /** a venue's own answer that asks to be left alone holds it back — with the host where it shares its hold, here where it does not. Only
   * what the venue answered: a refusal this door took from a hold is never held again, so asking during a hold does not lengthen it */
  private holdOn(venue: string, r: Refusal): void {
    const now = Date.now();
    const ms = heldFor(r, now);
    if (!(ms > 0)) return;
    const host = this.money() as { hold?(venue: string, r: Refusal): void } | undefined;
    if (host?.hold) return host.hold(venue, r);
    const was = this.holds.get(venue);
    if (!was || was.until < now + ms) this.holds.set(venue, { until: now + ms, r });
  }

  /** a READ of a venue (a market, what is held, how an order stands), through the hold: a venue held back is not asked, and its answer that
   * asks to be left alone holds it back */
  private async asked<T>(venue: string, name: string, call: () => Promise<T | Refusal>, ms?: number): Promise<T | Refusal> {
    const held = this.heldAt(venue);
    if (held) return held;
    const r = await safely(call, venue, name, ms);
    if (isRefusal(r)) this.holdOn(venue, r);
    return r;
  }

  /** Everything that does not depend on who signed: the switch, the venue, the market, the size, the price, the cap. `uncapped`: the cap is
   * not judged here — only a close's quote asks so, to say what the close is worth and whether that is over the cap before it is signed.
   * `whole`: a close of the WHOLE position — at a paper account, taken whatever its size's step and worth (a position opened under another
   * step, or worth less than the smallest order now, is never stranded); a real venue judges its own */
  private async plan(raw: Fields, uncapped = false, whole = false): Promise<Plan | Refusal> {
    const f: Fields = { venue: text(raw.venue), symbol: text(raw.symbol), side: text(raw.side), orderType: text(raw.orderType), qty: text(raw.qty), usd: text(raw.usd), limitPrice: text(raw.limitPrice), stopPrice: text(raw.stopPrice), tif: text(raw.tif), postOnly: text(raw.postOnly), reduceOnly: text(raw.reduceOnly), extendedHours: text(raw.extendedHours), trailPercent: text(raw.trailPercent), trailPrice: text(raw.trailPrice), takeProfit: text(raw.takeProfit), stopLoss: text(raw.stopLoss) };
    const m = this.money();
    if (!m) return no("E_ACCOUNT_BAD_ACTION", { message: "this account has no venues connected live" });
    const w = m.writes();
    if (!w.on) return no("E_WALLET_LIVE_WRITES_OFF", { message: `this server places no orders: it was started read-only. To trade, stop it and start it again with: ${w.turnOn}`, detail: { turnOn: w.turnOn } });
    const v = m.venue(f.venue);
    if (!v) return this.notYet(f.venue) ?? no("E_WALLET_ACCOUNT_UNKNOWN", { venue: f.venue, message: `"${f.venue}" is not a venue connected live: orders are placed only at venues connected live` });
    if (!v.trader) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name}: ${v.noTradeBecause ?? "no orders are placed here from the account"}` });
    if (v.address !== undefined && !v.proven) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name} is watched, not proven yours: nothing is traded from it here. Connect it again from the wallet itself` });
    const trader = v.trader;
    if (trader.can === false) return no("E_VENUE_PERMISSION", { venue: v.id, message: `${v.name}: ${trader.whyNot ?? "this key may not trade. That is set on the key at the venue"}` });
    if (f.side !== "buy" && f.side !== "sell") return no("E_ACCOUNT_BAD_ACTION", { message: "an order's side is buy or sell" });
    if (!(ORDER_TYPES as readonly string[]).includes(f.orderType)) return no("E_ACCOUNT_BAD_ACTION", { message: "an order is a market, limit, stop, stop_limit or trailing_stop order" });
    const side = f.side as Side;
    const type = f.orderType as OrderType;
    const byQty = f.qty.trim() !== "";
    const byUsd = f.usd.trim() !== "";
    if (byQty === byUsd) return no("E_ACCOUNT_BAD_ACTION", { message: "an order's size is given once: in the market's own units (qty) or in dollars (usd)" });
    const size = byQty ? f.qty.trim() : f.usd.trim();
    if (!DEC.test(size) || !(Number(size) > 0)) return no("E_ACCOUNT_BAD_ACTION", { message: "a size is a plain decimal, more than zero" });
    const limited = type === "limit" || type === "stop_limit";
    const stopped = type === "stop" || type === "stop_limit";
    if (limited ? !DEC.test(f.limitPrice.trim()) || !(Number(f.limitPrice) > 0) : f.limitPrice.trim() !== "") return no("E_ACCOUNT_BAD_ACTION", { message: limited ? `a ${type === "limit" ? "limit" : "stop-limit"} order has a limit price: a plain decimal, more than zero` : `a ${type} order has no limit price` });
    if (stopped ? !DEC.test(f.stopPrice.trim()) || !(Number(f.stopPrice) > 0) : f.stopPrice.trim() !== "") return no("E_ACCOUNT_BAD_ACTION", { message: stopped ? `a ${type === "stop" ? "stop" : "stop-limit"} order has a stop price that triggers it: a plain decimal, more than zero` : `a ${type} order has no stop price` });
    if (f.tif.trim() !== "" && !(TIFS as readonly string[]).includes(f.tif.trim())) return no("E_ACCOUNT_BAD_ACTION", { message: `a time in force is ${TIFS.join(", ")}, or left to the venue` });
    if (![f.postOnly, f.reduceOnly].every((x) => x === "" || x === "true")) return no("E_ACCOUNT_BAD_ACTION", { message: 'post-only and reduce-only are "true", or left out' });
    if (f.postOnly === "true" && type !== "limit") return no("E_ACCOUNT_BAD_ACTION", { message: "post-only is for a limit order: it rests on the book as a maker, or is refused" });
    if (f.extendedHours !== "" && f.extendedHours !== "true") return no("E_ACCOUNT_BAD_ACTION", { message: 'extended hours is "true", or left out' });
    if (f.extendedHours === "true" && type !== "limit") return no("E_ACCOUNT_BAD_ACTION", { message: "extended hours are for a limit order: a venue that trades outside its regular session takes a limit there and nothing else" });
    // a trailing stop trails by a percent or by a price — one of the two; nothing else carries a trail
    const trailing = type === "trailing_stop";
    const tp = f.trailPercent.trim();
    const tq = f.trailPrice.trim();
    if (trailing ? (tp === "") === (tq === "") : tp !== "" || tq !== "") return no("E_ACCOUNT_BAD_ACTION", { message: trailing ? "a trailing stop trails by a percent (trailPercent) or by a price (trailPrice): one of the two" : `a ${type.replace("_", "-")} order has no trail` });
    if (tp !== "" && (!DEC.test(tp) || !(Number(tp) > 0 && Number(tp) < 100))) return no("E_ACCOUNT_BAD_ACTION", { message: "a trailing stop's percent is a plain decimal, more than 0 and less than 100" });
    if (tq !== "" && (!DEC.test(tq) || !(Number(tq) > 0))) return no("E_ACCOUNT_BAD_ACTION", { message: "a trailing stop's price is a plain decimal, more than zero" });
    // a bracket's exits: on a market or limit entry, each a plain decimal
    for (const [what, x] of [["take-profit", f.takeProfit.trim()], ["stop-loss", f.stopLoss.trim()]] as const) if (x !== "" && (!DEC.test(x) || !(Number(x) > 0))) return no("E_ACCOUNT_BAD_ACTION", { message: `a ${what} is a plain decimal, more than zero` });
    const bracket = f.takeProfit.trim() !== "" || f.stopLoss.trim() !== "";
    if (bracket && type !== "market" && type !== "limit") return no("E_ACCOUNT_BAD_ACTION", { message: "a bracket's entry is a market or a limit order: its exits are the take-profit and the stop-loss" });
    if (bracket && f.reduceOnly === "true") return no("E_ACCOUNT_BAD_ACTION", { message: "a reduce-only order is an exit already: it carries no take-profit or stop-loss" });
    if (!f.symbol.trim()) return no("E_ACCOUNT_BAD_ACTION", { message: "an order names its market" });

    const mk = await this.asked(v.id, v.name, () => trader.market(f.symbol.trim()));
    if (isRefusal(mk)) return mk;
    if (!inDollars(mk.quote)) return no("E_ACCOUNT_UNPRICED", { venue: v.id, message: `${mk.symbol} is priced in ${mk.quote}: the account trades markets priced in dollars, so that every limit means dollars` });
    if (!mk.open) return no("E_VENUE_MARKET_CLOSED", { venue: v.id, message: `${v.name}: ${mk.name} takes no orders now${mk.note ? ` (${mk.note})` : ""}` });
    if (!mk.types.includes(type)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes ${mk.types.join(", ")} orders in ${mk.name}, not ${type} orders` });
    // a type the market lists but cannot take now, in its own words (a paper account's US share whose only quote is Cboe's, fifteen minutes
    // behind: no market order) — refused before the owner is shown it to sign, or an agent's card is raised
    const notNow = mk.refusesNow?.[type];
    if (notNow) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: ${notNow}`, detail: { refusesNow: type } });
    // what the market takes besides the type: a time in force it lists, post-only and reduce-only where it says so
    const tif = f.tif.trim() === "" ? undefined : (f.tif.trim() as TimeInForce);
    if (tif !== undefined && !(mk.tifs ?? []).includes(tif)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: mk.tifs?.length ? `${v.name} takes ${mk.tifs.join(", ")} in ${mk.name}, not ${tif}` : `${v.name} takes no time-in-force choice in ${mk.name}: its own default applies` });
    const forType = mk.tifsByType?.[type];
    if (tif !== undefined && forType && !forType.includes(tif)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: forType.length ? `${v.name} takes ${forType.join(", ")} for a ${type.replace("_", "-")} order in ${mk.name}, not ${tif}` : `${v.name} takes no time-in-force choice for a ${type.replace("_", "-")} order in ${mk.name}` });
    if (f.postOnly === "true" && !mk.postOnly) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes no post-only orders in ${mk.name}` });
    if (f.reduceOnly === "true" && !mk.reduceOnly) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes no reduce-only orders in ${mk.name}` });
    if (bracket && !mk.brackets) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes no take-profit or stop-loss on an order in ${mk.name}: place the exits as orders of their own once it fills` });
    // extended hours: the market's session says whether a limit order may go for the session that is on (a stock at Alpaca in pre-market,
    // after-hours or, where Alpaca trades it overnight, the overnight session); in the regular session, or where the venue keeps no such
    // session, there is none to ask for
    if (f.extendedHours === "true" && !mk.session?.extendedHours) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes no extended-hours order in ${mk.name} now${mk.session?.phase ? ` (${mk.session.phase === "regular" ? "the regular session is on" : mk.session.phase === "closed" ? "no session is on" : `${mk.session.phase} session`})` : ""}${mk.note ? `: ${mk.note}` : ""}` });
    const limitPrice = limited ? Number(f.limitPrice) : undefined;
    const stopPrice = stopped ? Number(f.stopPrice) : undefined;
    const takeProfit = f.takeProfit.trim() !== "" ? Number(f.takeProfit) : undefined;
    const stopLoss = f.stopLoss.trim() !== "" ? Number(f.stopLoss) : undefined;
    const trailPercent = tp !== "" ? Number(tp) : undefined;
    const trailPrice = tq !== "" ? Number(tq) : undefined;
    for (const x of [limitPrice, stopPrice, takeProfit, stopLoss, trailPrice]) if (x !== undefined && !onStep(x, mk.priceStep)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: a price in ${mk.name} moves in steps of ${figure(mk.priceStep!)}`, detail: { priceStep: mk.priceStep } });
    // the side of the book the order takes; a limit that crosses it fills at the book, so a sell is never valued under the bid. A stop is
    // valued where it triggers: what the book does before then is not the order's price. A buy stop-limit at its limit (the most it pays); a
    // sell stop-limit at its stop, or its limit if that is higher — a limit under the stop takes the book where the stop fires, so a sell
    // limited at $1 is worth what it sells, not $1
    const book = side === "buy" ? (mk.ask ?? mk.price) : (mk.bid ?? mk.price);
    // a trailing stop is valued where it would trigger now: its trail past the book (a buy's stop only falls from there, a sell's only rises)
    const trailFrom = trailing && book !== undefined ? (trailPercent !== undefined ? (book * trailPercent) / 100 : trailPrice!) : undefined;
    const trailStop = trailFrom !== undefined ? (side === "buy" ? book! + trailFrom : book! - trailFrom) : undefined;
    if (trailing && !(trailStop !== undefined && trailStop > 0)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: a trail of ${trailPercent !== undefined ? `${figure(trailPercent)}%` : figure(trailPrice!)} from ${book !== undefined ? figure(book) : "no price"} leaves no stop for ${mk.name}` });
    const price = type === "stop" ? stopPrice : trailing ? (side === "buy" ? trailStop : book) : limitPrice === undefined ? book : side === "buy" ? limitPrice : type === "stop_limit" ? Math.max(limitPrice, stopPrice ?? 0) : Math.max(limitPrice, book ?? 0);
    if (!(price !== undefined && price > 0)) return no("E_ACCOUNT_UNPRICED", { venue: v.id, message: `${v.name} shows no price for ${mk.name} right now, so no limit can be judged: try a limit order` });
    // a bracket's exits stand on the right sides of its entry: a buy's take-profit above it and its stop-loss below; a sell's the other way.
    // A limit fills at its limit or better, and one that crosses the book fills at the book: each exit is judged against the fill that is
    // worst for it. The take-profit against the limit itself; the stop-loss against the book where the limit crosses it — a buy limited at
    // 70,000 with the ask at 60,010 fills at 60,010, and a stop-loss at 65,000 above that fill would sell at once
    const entry = limitPrice ?? book;
    const fill = limitPrice === undefined || book === undefined ? entry : side === "buy" ? Math.min(limitPrice, book) : Math.max(limitPrice, book);
    if (entry !== undefined && fill !== undefined) {
      const up = side === "buy";
      if (takeProfit !== undefined && (up ? takeProfit <= entry : takeProfit >= entry)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: the take-profit (${figure(takeProfit)}) must be ${up ? "above" : "below"} the entry (${figure(entry)}) for a ${side}` });
      if (stopLoss !== undefined && (up ? stopLoss >= fill : stopLoss <= fill)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: the stop-loss (${figure(stopLoss)}) must be ${up ? "below" : "above"} the entry (${figure(fill)}) for a ${side}${fill !== entry ? `: a ${side} limited at ${figure(entry)} crosses the book and fills there, at ${figure(fill)}` : ""}` });
    }
    // a market order — and a stop or a trailing stop, once it triggers — carries a worst price: 2% past where it is valued
    const worstPrice = type === "market" || type === "stop" || trailing ? (side === "buy" ? floorTo(price * (1 + SLIPPAGE), mk.priceStep) : ceilTo((trailing ? trailStop! : price) * (1 - SLIPPAGE), mk.priceStep)) : undefined;
    const each = notionalOf(mk, 1, side === "buy" && worstPrice !== undefined ? worstPrice : price);
    let qty: number;
    // a paper account's close of a whole position is taken at the position's own size and worth (see `whole`)
    const exempt = whole && v.paper === true;
    if (byQty) {
      qty = Number(size);
      if (!exempt && !onStep(qty, mk.qtyStep)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: a size in ${mk.name} moves in steps of ${figure(mk.qtyStep!)} ${mk.base}`, detail: { qtyStep: mk.qtyStep } });
    } else qty = floorTo(Number(size) / each, mk.qtyStep);
    if (!(qty > 0) || (!exempt && mk.minQty !== undefined && qty < mk.minQty - 1e-12)) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: the smallest order in ${mk.name} is ${figure(mk.minQty ?? mk.qtyStep ?? 0)} ${mk.base}${byUsd ? ` (${usd((mk.minQty ?? mk.qtyStep ?? 0) * each)} at ${figure(price)})` : ""}`, detail: { minQty: mk.minQty, qtyStep: mk.qtyStep } });
    const notional = notionalOf(mk, qty, price);
    if (!exempt && mk.minNotional !== undefined && notional < mk.minNotional - 1e-9) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name}: the smallest order in ${mk.name} is worth ${usd(mk.minNotional)}`, detail: { minNotional: mk.minNotional } });
    const maxUsd = side === "buy" && worstPrice !== undefined ? notionalOf(mk, qty, worstPrice) : notional;
    // the server's cap bounds real money: a paper account holds none, so an order there is bounded by the owner's limits alone
    if (!uncapped && !v.paper && maxUsd > w.capUsd + 1e-9) return no("E_ACCOUNT_LIMIT", { venue: v.id, message: `${usd(maxUsd)} is more than the most one order may be on this server (${usd(w.capUsd)}). It is set when the server starts: --live-cap`, detail: { capUsd: w.capUsd, orderUsd: maxUsd } });
    return { f, v: v as Plan["v"], m: mk, side, type, qty, limitPrice, price, notional, ...(worstPrice !== undefined ? { worstPrice } : {}), ...(stopPrice !== undefined ? { stopPrice } : {}), ...(tif ? { tif } : {}), ...(f.extendedHours === "true" ? { extendedHours: true } : {}), ...(f.postOnly === "true" ? { postOnly: true } : {}), ...(f.reduceOnly === "true" ? { reduceOnly: true } : {}), ...(trailPercent !== undefined ? { trailPercent } : {}), ...(trailPrice !== undefined ? { trailPrice } : {}), ...(takeProfit !== undefined ? { takeProfit } : {}), ...(stopLoss !== undefined ? { stopLoss } : {}), maxUsd };
  }

  /** Held to what was agreed — the owner's signature or the card: the same market, and a price that has not moved past what was agreed. A
   * buy may cost at most `worth` (its worst price is pulled in to fit); a market sell may take at most 2% less than `worth` (its worst
   * price is pushed up to fit). Answers the plan with the worst price that holds it there, or why it cannot be held */
  private hold(p: Plan, symbol: string, worth: number, what: string): Plan | Refusal {
    if (p.m.symbol !== symbol) return no("E_ACCOUNT_REQUOTE", { venue: p.v.id, message: `${p.v.name} now calls this market ${p.m.symbol}, not ${symbol}: prepare it again` });
    const per = notionalOf(p.m, p.qty, 1);
    if (p.side === "buy") {
      if (p.notional > worth + 1e-9) return no("E_ACCOUNT_REQUOTE", { venue: p.v.id, message: `the price moved: at ${figure(p.price)} the order is worth ${usd(p.notional)} now, more than the ${usd(worth)} ${what}. Nothing was placed`, detail: { price: p.price, notionalUsd: p.notional, maxUsd: worth } });
      if (p.worstPrice === undefined) return { ...p, maxUsd: p.notional };
      const worstPrice = Math.max(p.price, floorTo(Math.min(p.worstPrice, worth / per), p.m.priceStep));
      return { ...p, worstPrice, maxUsd: notionalOf(p.m, p.qty, worstPrice) };
    }
    if (p.worstPrice === undefined) return p;
    const least = worth * (1 - SLIPPAGE);
    if (p.notional < least - 1e-9) return no("E_ACCOUNT_REQUOTE", { venue: p.v.id, message: `the price fell: at ${figure(p.price)} the order fetches ${usd(p.notional)} now, more than 2% under the ${usd(worth)} ${what}. Nothing was placed`, detail: { price: p.price, notionalUsd: p.notional, worthUsd: worth } });
    // a trailing sell is valued at the book but sells where its stop triggers, under the book by its trail: its worst price stays the plan's,
    // 2% under that stop. Pushed up toward the book, it would sit above the stop, and a stop that triggered could never fill
    if (p.type === "trailing_stop") return p;
    return { ...p, worstPrice: Math.min(p.price, ceilTo(Math.max(p.worstPrice, least / per), p.m.priceStep)) };
  }

  /** the dial, as it stands: the agent's session, the venue switched off for agents, what the owner opened to agents there */
  private dial(venue: string): Refusal | null {
    const o = this.e.host.policy();
    if (isExpired(this.e.host.now(), o.sessionExpiresAt)) return no("E_WALLET_SESSION_EXPIRED", { venue, message: "the agent's session has expired: every write stops, reads continue", detail: { sessionExpiresAt: o.sessionExpiresAt } });
    if (o.revoked.includes(venue)) return no("E_WALLET_ACCOUNT_REVOKED", { venue, message: `${venue} is switched off for agents: reads only`, detail: { revoked: o.revoked } });
    const reach = o.reach[venue];
    if (reach && !reach.includes("trade")) return no("E_WALLET_REACH", { venue, message: `the owner did not open trading at ${this.money()?.venue(venue)?.name ?? venue} to agents`, detail: { reach } });
    return null;
  }

  /** The venue's place rule, asked before the owner is quoted or an agent's card is raised (Extras.held) — signing nothing, sending nothing —
   * so neither is offered an order the account would refuse when it is placed, and no card holds an agent's budget for one. Only a definite
   * verdict refuses here: a check that does not answer leaves it to the order itself, which asks again. Nothing about the place goes into a
   * quote or a card */
  private async placeRule(v: LiveVenue & { trader: LiveTrader }, side: Side, reduceOnly?: boolean, symbol?: string): Promise<Refusal | undefined> {
    // the venue answered an order from here that it does not serve this network (its reads may still answer): no order is offered, carded or
    // sent there until that answer's time runs out, or a check of the network lets it go (letGo)
    // a close too: what is remembered here is the venue's rule for the whole network (close-only answers never are), so nothing is sent there
    const was = this.refusedNow(v.id);
    if (was) return was;
    const t = v.trader as Extras;
    if (!t.held) return undefined;
    const r = await safely(() => t.held!({ side, ...(reduceOnly ? { reduceOnly } : {}), ...(symbol ? { symbol } : {}) }), v.id, v.name, STATUS_MS);
    return r !== undefined && isRefusal(r) && r.code === "E_VENUE_GEOBLOCKED" ? r : undefined;
  }

  /** the venues whose order call answered that they do not serve this network, until when: a door's own memory, not the shared hold — the
   * venue's reads (its balance, its markets, how open orders stand) may still answer, and are not held back for it */
  private readonly refusedHere = new Map<string, { until: number; r: Refusal }>();
  private refusedNow(venue: string): Refusal | undefined {
    const was = this.refusedHere.get(venue);
    if (was && Date.now() < was.until) return was.r;
    if (was) this.refusedHere.delete(venue);
    return undefined;
  }
  /** an order call's refusal of this network as a whole (not one product's rule, not close-only, not the account's own reading of terms,
   * where nothing was sent): remembered for as long as the one hold rule says. Not at a trader that asks the venue's place rule before every
   * order itself (held: Hyperliquid, Polymarket, the mm connection, whose one refusal is one of the several venues it reaches) */
  private refusedOrder(v: LiveVenue, r: Refusal): void {
    if ((v.trader as Extras | undefined)?.held) return;
    const venue = v.id;
    const n = (r.native ?? {}) as { closeOnly?: unknown; rule?: unknown; terms?: unknown };
    if (r.code !== "E_VENUE_GEOBLOCKED" || (r.detail as { scope?: unknown } | undefined)?.scope !== undefined || n.closeOnly === true || n.rule !== undefined || n.terms !== undefined) return;
    const ms = holdBackMs(r);
    if (ms > 0) this.refusedHere.set(venue, { until: Date.now() + ms, r });
  }
  /** a check of this network found the venue answering (service.ts reached): what this door remembered of its refusals goes, and an owner's
   * cancel it could not send there is sent at the next poll */
  letGo(venue: string): void {
    this.refusedHere.delete(venue);
    if (this.e.orders.some((o) => o.venue === venue && o.cancelWanted)) this.cancelAgain.add(venue);
  }
  private readonly cancelAgain = new Set<string>();

  /** a venue on the account that is not read yet: connected and waiting for it to answer this network (service.ts waiting) */
  private notYet(venue: string): Refusal | undefined {
    const w = this.money()?.waiting?.(venue);
    return w ? no("E_VENUE_UNREACHABLE", { venue, message: `${w}: no order is placed there until it answers`, detail: { waiting: true } }) : undefined;
  }

  /** a card closed without an answer (it expired): what it showed is not kept for a yes that cannot come */
  forget(card: string): void {
    this.shown.delete(card);
    this.shownAmend.delete(card);
    this.shownClose.delete(card);
    this.shownLeverage.delete(card);
  }

  /** the agent's trading limit as it stands now, its owner signature still good, the dial open at the venue */
  private async limit(signer: string, venue: string): Promise<SpendApproval | Refusal> {
    const now = Date.parse(this.e.host.now());
    const found = spendFor(this.e.state, signer, "trade", now);
    if (isRefusal(found)) return found;
    if (!(await this.e.stillSigned(found))) return no("E_ACCOUNT_BAD_SIGNATURE", { message: "the trading limit's own signature no longer checks out against the account's owners", detail: { approval: found.id } });
    // a budget that renews (renewHours, signed with the limit): once its window has passed it is counted afresh, from what its orders still
    // open hold — and written down, so a restart picks up from there (patchSpend's spend row)
    const renewed = renewSpend(found, now, this.heldOn(found.id));
    if (renewed !== found) this.e.patchSpend(found.id, () => renewed);
    const spend = this.e.state.spends.find((x) => x.id === found.id) ?? renewed;
    if (!spend.allow.includes(venue)) return covers(spend, venue, 0, now)!;
    return this.dial(venue) ?? spend;
  }

  /** what the orders placed under a limit and still open hold of it (micro-dollars): each counts from when it is placed until it is done */
  heldOn(approval: string): number {
    return this.e.orders.reduce((x, o) => (o.approval === approval && !DONE.has(o.status) ? x + micro(Number(o.usd).toFixed(6)) : x), 0);
  }

  /** A CLOSE ON A RENEWING ENTRY BUDGET: an order that only closes what is held — a reduce-only order, or a sell of what is held where the
   * market sells only that (sellsReduce) — under a trading limit whose budget renews (renewHours, which the owner signed). It counts against
   * none of the budget, and holds none of it while it waits on a card: the budget is for entries, and a stop or a take-profit must never be
   * kept waiting because the day's entries used it up. Its per-order cap, its venues and its window still hold. On a limit that does not
   * renew, a close counts as it always has */
  private freeClose(spend: SpendApproval, p: Plan): boolean {
    return (spend.renewHours ?? 0) > 0 && (p.reduceOnly === true || (p.side === "sell" && p.m.sellsReduce === true));
  }

  /** what the owner is shown and signs: the exact size, the price, what it is worth, ten minutes */
  async prepare(draft: Record<string, unknown>): Promise<{ action: Omit<LiveOrderAction, "nonce">; quote: OrderQuote } | Refusal> {
    const f: Fields = { venue: String(draft.venue ?? ""), symbol: String(draft.symbol ?? ""), side: String(draft.side ?? ""), orderType: String(draft.orderType ?? "market"), qty: String(draft.qty ?? ""), usd: String(draft.usd ?? ""), limitPrice: String(draft.limitPrice ?? ""), stopPrice: String(draft.stopPrice ?? ""), tif: String(draft.tif ?? ""), postOnly: draft.postOnly === true || draft.postOnly === "true" ? "true" : "", reduceOnly: draft.reduceOnly === true || draft.reduceOnly === "true" ? "true" : "", extendedHours: draft.extendedHours === true || draft.extendedHours === "true" ? "true" : "", trailPercent: String(draft.trailPercent ?? ""), trailPrice: String(draft.trailPrice ?? ""), takeProfit: String(draft.takeProfit ?? ""), stopLoss: String(draft.stopLoss ?? "") };
    const p = await this.plan(f);
    if (isRefusal(p)) return p;
    const line = await this.placeRule(p.v, p.side, p.reduceOnly, p.m.symbol);
    if (line) return line;
    // the owner's own limits that pass with time (a day's loss, a streak's pause, the entries a day), said before anything is signed: a plan
    // is signed with the order, after this
    if (await this.opens(p)) {
      const held = this.e.host.selfBlock?.({});
      if (held) return no("E_ACCOUNT_LIMIT", { venue: p.v.id, message: held.why, detail: { self: true, ...(held.until ? { until: held.until } : {}) } });
    }
    // a buy signs the most it may cost; a sell signs what it is worth now, and a market sell may then fetch at most 2% less
    const worth = (p.side === "buy" ? cents(p.maxUsd) : Math.floor(p.notional * 100 + 1e-6) / 100).toFixed(2);
    const { refuses, note: _also, ...est } = await this.estimateOf(p);
    // the venue's own rule would refuse it now (what open orders hold of the cash or the holding, a book too thin for a market order's
    // size): said now, and nothing to sign — never a signature the venue then refuses
    if (refuses) return no("E_VENUE_REJECTED", { venue: p.v.id, message: refuses, detail: { beforeSigning: true } });
    // a share's market order out of its regular session waits for the open, and fills at the open's price, not at this one (a broker holds
    // it for the open; the paper account takes the open's first real-time quote): said, so the figures below are read as today's. What is
    // signed still bounds it — maxNotional, and the worst price held to it: an open past that cancels the order, nothing filled (paper judge)
    const queued = p.m.kind === "stock" && p.type === "market" && p.m.session?.open === false;
    return {
      action: { type: "liveOrder", venue: p.v.id, symbol: p.m.symbol, side: p.side, orderType: p.type, qty: plain(p.qty), limitPrice: p.limitPrice !== undefined ? plain(p.limitPrice) : "", stopPrice: p.stopPrice !== undefined ? plain(p.stopPrice) : "", tif: p.tif ?? "", postOnly: p.postOnly ? "true" : "", reduceOnly: p.reduceOnly ? "true" : "", extendedHours: p.extendedHours ? "true" : "", trailPercent: p.trailPercent !== undefined ? plain(p.trailPercent) : "", trailPrice: p.trailPrice !== undefined ? plain(p.trailPrice) : "", takeProfit: p.takeProfit !== undefined ? plain(p.takeProfit) : "", stopLoss: p.stopLoss !== undefined ? plain(p.stopLoss) : "", maxNotional: worth, deadline: this.money()!.realNow() + TTL_MS },
      quote: { words: this.words(p), name: p.m.name, kind: p.m.kind, base: p.m.base, quote: p.m.quote, price: p.price, notionalUsd: Number(p.notional.toFixed(2)), maxUsd: Number(worth), ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}), ...(p.m.note || p.m.rule ? { note: [p.m.note, p.m.rule].filter(Boolean).join(" · ") } : {}), capUsd: this.money()!.writes().capUsd, ...(p.v.paper ? { paper: true as const } : {}), ...(p.m.quoteAt ? { quoteAt: p.m.quoteAt } : {}), ...(p.m.quoteFrom ? { quoteFrom: p.m.quoteFrom } : {}), ...est, ...(queued ? { queued: true as const } : {}) },
    };
  }

  /** WHAT THE ORDER WOULD LEAVE, as its venue's own rule says before it is placed (LiveTrader.estimate: a paper account's fee and a
   * perpetual's liquidation price), for the quote the owner is shown: the fee at the price it is valued at, the liquidation price of the
   * position it would leave. A venue that says nothing before an order — no estimate, or one it refused or could not give in time — gives
   * nothing here, and the ticket says nothing of it: never a figure from outside the venue's rule */
  private async estimateOf(p: Plan, o: { close?: boolean | undefined } = {}): Promise<Pick<OrderQuote, "feeUsd" | "feeBps" | "liquidationPrice" | "leverage"> & { refuses?: string | undefined; note?: string | undefined }> {
    const t = p.v.trader;
    if (typeof t.estimate !== "function") return {};
    try {
      const e = await Promise.race([t.estimate({ symbol: p.m.symbol, side: p.side, qty: p.qty, price: p.price, type: p.type, ...(p.reduceOnly ? { reduceOnly: true } : {}), ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}), ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}), ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}), ...(o.close ? { close: true } : {}) }), new Promise<undefined>((r) => setTimeout(() => r(undefined), ESTIMATE_MS).unref?.())]);
      if (!e || isRefusal(e)) return {};
      const fin = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : undefined);
      const feeUsd = fin(e.feeUsd);
      const feeBps = fin(e.feeBps);
      const liq = fin(e.liquidationPrice);
      const lev = fin(e.leverage);
      // the venue's own words for why it would refuse the order now (what open orders hold, a book too thin for the size), and what else the
      // order would do: said before anything is signed
      const words = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 600) : undefined);
      const refuses = words(e.refuses);
      const note = words(e.note);
      return { ...(feeUsd !== undefined ? { feeUsd: Number(feeUsd.toFixed(6)) } : {}), ...(feeBps !== undefined ? { feeBps } : {}), ...(liq !== undefined && liq > 0 ? { liquidationPrice: liq } : {}), ...(lev !== undefined && lev > 0 ? { leverage: lev } : {}), ...(refuses ? { refuses } : {}), ...(note ? { note } : {}) };
    } catch {
      return {};
    }
  }

  /** The owner's signed order: planned again, held to what was signed, placed */
  async owner(a: LiveOrderAction, who: { signer: string; envelope: Envelope; hash: Hex }): Promise<Outcome> {
    const planned = await this.plan({ ...fieldsOf(a), usd: "" });
    if (isRefusal(planned)) return planned;
    if (this.money()!.realNow() > a.deadline) return no("E_ACCOUNT_EXPIRED", { message: "this order was good for ten minutes after it was prepared: prepare it again" });
    const p = this.hold(planned, a.symbol, Number(a.maxNotional), "signed for");
    if (isRefusal(p)) return p;
    // THE OWNER'S OWN LIMITS (account/plans.ts): a new entry at a paper account — never a close — is held to them, a plan kept for it read
    // first and taken only once the entry goes, so a refused entry leaves its plan for the next try
    const entry = await this.opens(p);
    const plan = entry ? this.e.host.takePlan?.(p.v.id, p.m.symbol, p.side, true) : undefined;
    if (entry) {
      const held = this.e.host.selfBlock?.({ planned: plan !== undefined });
      if (held) return no("E_ACCOUNT_LIMIT", { venue: p.v.id, message: held.why, detail: { self: true, ...(held.until ? { until: held.until } : {}) } });
      this.e.host.takePlan?.(p.v.id, p.m.symbol, p.side);
    }
    return this.place(p, { signer: who.signer, authority: "owner", action: who.hash, envelope: who.envelope, ...(plan ? { plan } : {}), ...(entry ? { entry: true } : {}) });
  }

  /** An order of the owner's at a PAPER account that opens a position or adds to one — where the owner's own limits hold (account/plans.ts).
   * Not one that only closes or cuts: reduce-only; a sell where selling only sells what is held (a coin, a share, a contract of an event);
   * a perpetual's order against the position it holds, no bigger than it. A position the venue does not answer for is taken as none */
  private async opens(p: Plan): Promise<boolean> {
    if (p.v.paper !== true || p.reduceOnly) return false;
    if (p.side === "sell" && (p.m.sellsReduce === true || (p.m.kind !== "perp" && p.m.kind !== "future"))) return false;
    if (p.m.kind !== "perp" && p.m.kind !== "future") return true;
    const read = p.v.trader.positions;
    if (!read) return true;
    const held = await safely(() => read.call(p.v.trader), p.v.id, p.v.name, 5_000);
    const pos = isRefusal(held) ? undefined : held.find((x) => x.symbol === p.m.symbol && x.qty > 0);
    if (!pos) return true;
    const against = (pos.side === "long" && p.side === "sell") || (pos.side === "short" && p.side === "buy");
    return !(against && p.qty <= pos.qty * (1 + 1e-9));
  }

  /** the superagent's words for this order (AutonomyHook), or undefined: asked only in Guard, only at a venue that is paper by its own
   * connection, and only an answer that is words counts */
  private superagent(signer: string, v: LiveVenue): string | undefined {
    if (v.paper !== true || this.e.host.policy().mode === "open") return undefined;
    const words = this.e.host.autonomy?.(signer, v.id);
    return typeof words === "string" && words.trim() !== "" ? words : undefined;
  }

  /** An agent's order. Its trading limit and the dial first; then Guard: a card the owner signs; Beast: placed at once — and, in Guard, the
   * desk's own seat at its paper account under the autonomy the owner signed (AutonomyHook): placed at once as Beast places it, inside the
   * same limit, the ledger's row saying so */
  async agent(a: AgentLiveOrderAction, who: { signer: string; envelope: Envelope; hash: Hex; agent: AgentKey }): Promise<Outcome> {
    const now = Date.parse(this.e.host.now());
    const spend = await this.limit(who.signer, text(a.venue));
    if (isRefusal(spend)) return spend;
    const p = await this.plan(fieldsOf(a));
    if (isRefusal(p)) return p;
    // an order the venue's place rule refuses from here raises no card and holds nothing of the limit
    const line = await this.placeRule(p.v, p.side, p.reduceOnly, p.m.symbol);
    if (line) return line;
    const flight = this.e.host.openFlight({ id: slug(who.agent.name), name: who.agent.name, code: who.agent.code }, `${this.words(p)} · ${p.v.paper ? "paper" : "real money"}`);
    const superagent = this.superagent(who.signer, p.v);
    const free = this.freeClose(spend, p);
    if (this.e.host.policy().mode === "open" || superagent !== undefined) {
      const c = covers(spend, p.v.id, micro(p.maxUsd.toFixed(6)), now, { close: free });
      if (c) return c;
      const out = await this.charged(spend.id, p, { signer: who.signer, authority: "agent", agent: who.agent.address, action: who.hash, approval: spend.id }, { count: !free });
      if (isRefusal(out)) return out;
      this.e.host.log({ kind: "action", venue: p.v.id, tool: a.type, signer: who.signer, envelope: who.envelope, outcome: "accepted", notionalUsd: p.maxUsd, reason: `${superagent ?? "Beast"}: ${this.words(p)}, inside the trading limit`, flight: flight.no });
      this.e.host.say(flight.no, superagent ? `${who.agent.name} ${this.words(p)}: the desk's own seat at its paper account, with the autonomy the owner signed, inside its limit, so it went without a card` : `${who.agent.name} ${this.words(p)}: inside its limit, so it went without a card (Beast)`, "ok");
      return { ...out, flight: flight.no } as Outcome;
    }
    // the card holds what it shows, to the cent: answering it frees exactly that — a close on a renewing entry budget holds none of it
    const worth = cents(p.maxUsd);
    const c = covers(spend, p.v.id, micro(worth.toFixed(2)), now, { close: free });
    if (c) return c;
    const offer = { payee: p.v.name, payTo: p.m.symbol, amount: `${p.side} ${qtyText(p.qty)} ${p.m.base}`, protocol: `${p.v.paper ? "paper order (no real money)" : "real order"} · ${p.type}${p.limitPrice !== undefined ? ` at ${plain(p.limitPrice)}` : ` near ${plain(p.price)}`}`, network: `${p.side === "buy" ? "costs at most" : "worth about"} ${usd(worth)}` };
    // the owner's answer signs the card's hash: it covers the agent's request AND the market, size, price and worth the owner is shown
    const actionHash = keccak256(stringToHex(canonical({ action: who.hash, offer, symbol: p.m.symbol, qty: plain(p.qty), price: plain(p.price), worth: worth.toFixed(2) })));
    const intent: Intent = { kind: "trade", symbol: p.m.symbol, side: p.side, qty: p.qty };
    const card = this.e.host.raiseCard(flight.no, { account: p.v.id, intent, usd: worth, reason: `${who.agent.name} asks to ${this.words(p)}`, why: "live", action: a, actionHash, signer: who.signer, expiresAt: new Date(now + CARD_TTL_MS).toISOString(), offer, ...(free ? {} : { approval: spend.id }) });
    this.shown.set(card.id, { symbol: p.m.symbol, qty: p.qty, price: p.price, notional: p.notional, maxUsd: worth });
    if (!free) this.e.patchSpend(spend.id, (x) => ({ ...x, reservedMicro: x.reservedMicro + micro(String(worth)) }));
    this.e.host.log({ kind: "action", venue: p.v.id, tool: a.type, signer: who.signer, envelope: who.envelope, outcome: "card", notionalUsd: worth, reason: `${card.id} · ${this.words(p)}`, flight: flight.no, intentId: card.id });
    return { ok: true, kind: "card", pending: true, card, flight: flight.no };
  }

  /** The owner approved an agent's order: exactly what the card showed — its market, its size, its worth — judged again against the agent's
   * trading limit as it stands now (answering the card has already freed what the card held), the limit's signature and the dial */
  async release(card: CardLike, who: { signer: string; agent: AgentKey }): Promise<Outcome> {
    const a = card.action as AgentLiveOrderAction;
    const shown = this.shown.get(card.id);
    this.shown.delete(card.id);
    if (!shown) return no("E_ACCOUNT_REQUOTE", { message: "this card's order is not known to this run of the account: the agent asks again" });
    const spend = await this.limit(who.signer, text(a.venue));
    if (isRefusal(spend)) return spend;
    const planned = await this.plan({ ...fieldsOf(a), qty: plain(shown.qty), usd: "" });
    if (isRefusal(planned)) return planned;
    // a buy may cost at most what the card showed; a sell is held to what it was worth when the card was shown
    const p = this.hold(planned, shown.symbol, planned.side === "buy" ? card.usd : shown.notional, "on the card");
    if (isRefusal(p)) return p;
    const free = this.freeClose(spend, p);
    const c = covers(spend, p.v.id, micro(p.maxUsd.toFixed(6)), Date.parse(this.e.host.now()), { close: free });
    if (c) return c;
    return this.charged(spend.id, p, { signer: who.signer, authority: "agent", agent: who.agent.address, card: card.id, action: card.actionHash, approval: spend.id }, { count: !free });
  }

  /** Counted against the limit first, so an order that fills at once settles its count when it is placed — and the venue's turn in the
   * limit's window taken (`last`, read by state.ts covers: one order per window at each venue). Both undone if the venue says no — but not
   * for an order the venue did not say it took (place keeps it, unconfirmed): both stay until the venue shows it or shows none. `count`
   * false (a close on a renewing entry budget: freeClose): only the window's turn is taken, and the order counts on no budget */
  private async charged(approval: string, p: Plan, who: Who, o: { count?: boolean | undefined } = {}): Promise<Outcome> {
    const count = o.count !== false;
    const amount = count ? micro(p.maxUsd.toFixed(6)) : 0;
    const now = Date.parse(this.e.host.now());
    const was = this.e.state.spends.find((x) => x.id === approval)?.last[p.v.id];
    this.e.patchSpend(approval, (x) => ({ ...x, spentMicro: x.spentMicro + amount, last: { ...x.last, [p.v.id]: now } }));
    const out = await this.place(p, count ? who : { ...who, approval: undefined });
    const kept = isRefusal(out) && (out.detail as { unsure?: unknown; order?: unknown } | undefined)?.unsure === true && (out.detail as { order?: unknown }).order !== undefined;
    if (isRefusal(out) && !kept) this.e.patchSpend(approval, (x) => ({ ...x, spentMicro: Math.max(0, x.spentMicro - amount), last: was === undefined ? Object.fromEntries(Object.entries(x.last).filter(([k]) => k !== p.v.id)) : { ...x.last, [p.v.id]: was } }));
    return out;
  }

  /** cancel: the owner any open order, an agent only one it placed itself. Never a card: taking an order off the book moves nothing */
  async cancel(a: { venue: string; order: string }, who: { signer: string; authority: "owner" | "agent"; agent?: AgentKey | undefined; envelope: Envelope }): Promise<Outcome> {
    const o = this.e.orders.find((x) => x.id === a.order && x.venue === a.venue);
    const mine = o && (who.authority === "owner" || (o.authority === "agent" && o.agent === who.agent?.address));
    if (!o || !mine) return no("E_ACCOUNT_ORDER_UNKNOWN", { venue: a.venue, message: who.authority === "agent" && o ? `${a.order} was not placed by this agent: an agent cancels only its own orders` : `there is no order ${a.order} at ${a.venue} on the account`, detail: { order: a.order } });
    if (DONE.has(o.status)) return no("E_ACCOUNT_BAD_ACTION", { venue: o.venue, message: `${o.id} is already ${o.status}`, detail: { order: o.id, status: o.status } });
    const by = who.authority === "owner" ? "the owner" : (who.agent?.name ?? "an agent");
    if (o.walletTxs && !o.ref) {
      // a wallet order the wallet has not sent: nothing at a venue to take back. Its limit is kept in mind: if the wallet sends it after all,
      // the account takes it back on and counts it again
      o.heldBy = o.approval;
      this.apply(o, { ref: "", status: "canceled", filledQty: 0, native: { canceled: "before the wallet sent it" } }, "taken back before your wallet sent it");
      this.giveBack(o);
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live cancel", outcome: o.status, reason: `${o.id} · taken back by ${by} before the wallet sent it`, signer: who.signer, envelope: who.envelope });
      this.line(o);
      return { ok: true, kind: "order", order: o };
    }
    const v = this.money()?.venue(o.venue);
    if (!v?.trader) {
      // the venue is not connected now (it did not come back after a restart, or was unplugged): there is nothing to send the cancel to, and
      // nothing to ask how the order stands. The account stops following the order and gives back what it held of a limit — what the
      // venue did with it since is the venue's to show, and the order is canceled there
      if (o.unfollowed) return no("E_ACCOUNT_BAD_ACTION", { venue: o.venue, message: `${o.id} is not followed since a restart: ${o.venueName} is not connected, so it is canceled at the venue`, detail: { order: o.id } });
      // being connected again (it did not answer at start-up: no network yet, a captive portal): an agent's cancel waits for the venue to be
      // back, and what the order holds of its limit stays held; the owner's lets it go, as for a venue that is gone
      const waiting = who.authority === "agent" ? this.money()?.waiting?.(o.venue) : undefined;
      if (waiting) return no("E_VENUE_UNREACHABLE", { venue: o.venue, message: `${waiting}: the cancel is not sent yet. Ask again once ${o.venueName} is back, or cancel it at ${o.venueName}`, detail: { order: o.id } });
      this.unfollow(o, by, who);
      return { ok: true, kind: "order", order: o };
    }
    if (o.unconfirmed && !o.ref) {
      // an order the venue has not confirmed: it is looked for under the account's id first, and canceled by its own id once it is found.
      // Not found, there is nothing at the venue the account can name: the owner's cancel stops following it (what it counts goes back);
      // an agent's is told to wait for it, or to ask the owner
      const seen = await this.lookFor(o, v.trader);
      if (seen === "none") return { ok: true, kind: "order", order: o };
      if (seen === "unknown") {
        if (who.authority !== "owner") return no("E_VENUE_UNREACHABLE", { venue: o.venue, message: `${o.venueName} has not shown ${o.id} under the account's id yet, so there is nothing the account can name to cancel: it keeps looking, and the owner can stop following it`, detail: { order: o.id, unsure: true } });
        this.unfollow(o, by, who, `${o.venueName} did not confirm it and has not shown it under the account's id: the account stopped following it, and what it held of a limit is free. If it is there after all, cancel it at the venue`);
        return { ok: true, kind: "order", order: o };
      }
      if (DONE.has(o.status)) return { ok: true, kind: "order", order: o };
    }
    // a cancel is always sent, whatever holds the venue's reads back: it only takes risk away, and only the venue's own answer to it says
    // whether it reached the venue
    const r = await safely(() => v.trader!.cancel(o.ref, o.symbol), o.venue, o.venueName);
    if (isRefusal(r)) {
      this.holdOn(o.venue, r);
      this.e.host.log({ kind: "account-refusal", venue: o.venue, tool: "live cancel", code: r.code, reason: r.message, native: r.native, signer: who.signer });
      // the venue refuses this network (its place rule or its edge, the key's IP list, a ban of this address): the owner's cancel cannot reach
      // it, and neither can a look at how the order stands. The account stops following it, so the owner can disconnect or reconnect the
      // venue, and says to cancel it there. An agent's cancel stays the venue's answer
      if (who.authority === "owner" && refusesNetwork(r)) {
        // remembered before the order's line is written: a restart sends the cancel again too
        o.cancelWanted = true;
        if (o.approval) o.wantedFrom = { approval: o.approval, filled: o.filledQty };
        this.unfollow(o, by, who, `${o.venueName} refuses this network, so the account can neither cancel it nor see it fill: it stopped following it, and what it held of a limit beyond what had filled is free. It sends your cancel again when a check of this network finds ${o.venueName} answering; meanwhile you can cancel it at ${o.venueName}`);
        return { ok: true, kind: "order", order: o };
      }
      return r;
    }
    // the venue answered about it: an order the account had stopped following is followed again from here
    o.unfollowed = undefined;
    o.cancelWanted = undefined;
    if (DONE.has(r.status)) this.apply(o, r, "");
    else {
      // the venue took the cancel but has not said the order is gone: it may still fill on the way, so it is followed until it says
      o.canceling = true;
      this.apply(o, r, `cancel asked of ${o.venueName}: waiting for it to say the order is gone`);
      this.polled.set(o.id, 0);
    }
    this.line(o);
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live cancel", outcome: o.status, venueOrderId: o.ref, reason: `${o.id} · cancel by ${by} · ${o.canceling && !DONE.has(o.status) ? "the venue took the cancel" : o.filledQty ? `${qtyText(o.filledQty)} of ${qtyText(o.qty)} had filled` : "nothing had filled"}`, signer: who.signer, envelope: who.envelope });
    this.giveBack(o);
    return { ok: true, kind: "order", order: o };
  }

  /** the owner's cancel of an order the account stopped following because its venue refused this network, sent again now that a check
   * found the venue answering: the venue's answer follows the order again; a refusal leaves it as it was */
  private async cancelWanted(o: LiveOrder, v: LiveVenue & { trader: LiveTrader }): Promise<void> {
    const r = await safely(() => v.trader.cancel(o.ref, o.symbol), o.venue, o.venueName);
    if (isRefusal(r)) {
      this.holdOn(o.venue, r);
      return;
    }
    o.unfollowed = undefined;
    o.cancelWanted = undefined;
    if (DONE.has(r.status)) this.apply(o, r, "");
    else {
      o.canceling = true;
      this.apply(o, r, `cancel asked of ${o.venueName} again, now that it answers: waiting for it to say the order is gone`);
      this.polled.set(o.id, 0);
    }
    // what filled while the account was not following it is counted on the limit it was placed under, as a fill always is
    const from = o.wantedFrom;
    o.wantedFrom = undefined;
    if (from && o.filledQty > from.filled + 1e-12) {
      const more = notionalOf(o, o.filledQty - from.filled, o.avgPrice !== undefined && o.avgPrice > 0 ? o.avgPrice : o.price);
      this.e.patchSpend(from.approval, (x) => ({ ...x, spentMicro: x.spentMicro + micro(more.toFixed(6)) }));
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: "filled while not followed", reason: `${o.id} · ${usd(more)} filled at ${o.venueName} while the account was not following it: counted on its limit`, notionalUsd: more });
    }
    this.line(o);
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live cancel", outcome: o.status, venueOrderId: o.ref, reason: `${o.id} · the owner's cancel, sent again now that ${o.venueName} answers this network` });
  }

  /** An order whose venue the account cannot reach, which `by` asked to cancel: not followed from here on. What it held of a limit beyond
   * what had filled goes back (what filled stays counted), its line says so, and a restart does not follow it again. `why`: the note, when
   * it is not the venue being unconnected (it never names a place or an address) */
  private unfollow(o: LiveOrder, by: string, who: { signer: string; envelope: Envelope }, why?: string): void {
    o.unfollowed = true;
    o.unconfirmed = undefined;
    o.changing = undefined;
    o.note = why ?? `not followed since a restart: ${o.venueName} is not connected, so the account can neither cancel it nor see it fill. Cancel it at the venue`;
    o.updatedAt = new Date(this.money()?.realNow() ?? Date.now()).toISOString();
    this.giveBack(o, true);
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live cancel", outcome: "not followed", venueOrderId: o.ref, reason: `${o.id} · ${by} asked to cancel it: ${why ?? `${o.venueName} is not connected, so the account stopped following it, and what it held of a limit is free`}`, signer: who.signer, envelope: who.envelope });
    this.line(o);
  }

  /** the order's line on the statement, as it stands now — and the order itself, so that a restarted account follows it again */
  private line(o: LiveOrder): void {
    const l = orderLine(o, (address) => this.e.state.agents.find((k) => k.address === address)?.name ?? address);
    this.e.host.log({ kind: "statement", venue: o.venue, reason: `${l.id} · ${l.description} · ${l.status}`, detail: l, native: { order: o } });
  }

  /** An order an earlier run of the account placed and did not see finished (account/restore.ts): followed again, as it was — its id, its
   * client id, the limit it counts against. Nothing is sent: it is only asked about */
  adopt(o: LiveOrder): void {
    if (this.e.orders.some((x) => x.clientId === o.clientId)) return;
    const back: LiveOrder = { ...o, note: o.walletTxs && !o.ref ? o.note : `${o.note ? `${o.note} · ` : ""}followed again after a restart` };
    this.e.orders.push(back);
    this.polled.set(o.id, 0);
    // an owner's cancel that could not reach its venue before the restart: sent at the next poll if the venue answers now
    if (back.cancelWanted) this.cancelAgain.add(back.venue);
    // its line is written in this run too: the statement shows it as followed, not as left behind
    this.line(back);
  }

  /** An order in words: "buy 0.0009 BTC at Momentum · paper · limit 62,410.5 · then take-profit 63,000 (GTC) · about $56.17" — for the
   * card's reason, the quote the owner reads before signing, the flight, the ledger's reason and a note. Its prices are grouped the en-US
   * way (figure); `fig` is plain() only where the words are part of what the owner signs (the offer of an amend's card, hashed into the card
   * when it is raised), so that those words stay exactly as they were signed before grouping */
  private words(p: Plan, fig: (x: number) => string = figure): string {
    const trail = p.trailPercent !== undefined ? `${fig(p.trailPercent)}%` : p.trailPrice !== undefined ? fig(p.trailPrice) : "";
    const exits = [p.takeProfit !== undefined ? `take-profit ${fig(p.takeProfit)}` : "", p.stopLoss !== undefined ? `stop-loss ${fig(p.stopLoss)}` : ""].filter(Boolean).join(", ");
    const how = `${p.type === "limit" ? `limit ${fig(p.limitPrice!)}` : p.type === "stop" ? `stop at ${fig(p.stopPrice!)}` : p.type === "stop_limit" ? `stop at ${fig(p.stopPrice!)}, limit ${fig(p.limitPrice!)}` : p.type === "trailing_stop" ? `trailing stop ${trail} behind` : "market"}${exits ? ` · then ${exits}` : ""}`;
    const flags = [p.tif ? p.tif.toUpperCase() : "", p.postOnly ? "post-only" : "", p.reduceOnly ? "reduce-only" : "", p.extendedHours ? `extended hours${p.m.session?.phase && p.m.session.phase !== "regular" && p.m.session.phase !== "closed" ? ` · ${p.m.session.phase === "pre" ? "pre-market" : p.m.session.phase === "after" ? "after-hours" : "overnight"}` : ""}` : ""].filter(Boolean).join(", ");
    return `${p.v.paper ? "PAPER · " : ""}${p.side} ${qtyText(p.qty)} ${p.m.base} at ${p.v.name} · ${how}${flags ? ` (${flags})` : ""} · about ${usd(p.notional)}`;
  }

  /** The one venue call, and the order it becomes. `send`: another call than place — a venue's own close of a position. An order call whose
   * outcome the venue did not say (its answer lost: the network turned, a timeout, a gateway's 5xx) may have been placed: it is kept as an
   * order the venue has not confirmed — no ref yet, its line on the statement, what it counts on a limit still counted — and looked for under
   * the account's id until the venue shows it or shows none. The refusal goes back with that order's id, so that nobody places it again
   * under a new id before looking */
  private async place(p: Plan, who: Who, send?: (clientId: string) => Promise<OrderState | Refusal>): Promise<Outcome> {
    // quoted (or carded) before the venue answered an order that it does not serve this network: nothing is sent now either
    const refused = this.refusedNow(p.v.id);
    if (refused) return refused;
    const id = this.e.nextOrderId();
    const clientId = createHash("sha256").update(`${this.run}:${id}`).digest("hex").slice(0, 32);
    const at = new Date(this.money()!.realNow()).toISOString();
    const answer = await safely(() => (send ? send(clientId) : p.v.trader.place(requestOf(p, clientId))), p.v.id, p.v.name);
    const lost = isRefusal(answer) && outcomeUnknown(answer);
    if (isRefusal(answer)) {
      this.e.host.log({ kind: "account-refusal", venue: p.v.id, tool: "live order", code: answer.code, reason: answer.message, native: answer.native, signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}) });
      if (!lost) {
        this.refusedOrder(p.v, answer);
        return answer;
      }
    }
    const r: OrderState = isRefusal(answer) ? { ref: "", status: "pending", filledQty: 0, native: answer.native } : answer;
    const order: LiveOrder = {
      id,
      clientId,
      at,
      venue: p.v.id,
      venueName: p.v.name,
      symbol: p.m.symbol,
      name: p.m.name,
      kind: p.m.kind,
      base: p.m.base,
      side: p.side,
      type: p.type,
      qty: p.qty,
      ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}),
      ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}),
      ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}),
      ...(p.tif ? { tif: p.tif } : {}),
      ...(p.postOnly ? { postOnly: true } : {}),
      ...(p.reduceOnly ? { reduceOnly: true } : {}), ...(p.extendedHours ? { extendedHours: true } : {}),
      ...(p.trailPercent !== undefined ? { trailPercent: p.trailPercent } : {}),
      ...(p.trailPrice !== undefined ? { trailPrice: p.trailPrice } : {}),
      ...(p.takeProfit !== undefined ? { takeProfit: p.takeProfit } : {}),
      ...(p.stopLoss !== undefined ? { stopLoss: p.stopLoss } : {}),
      ...(p.m.contractSize !== undefined ? { contractSize: p.m.contractSize } : {}),
      ...(p.v.paper ? { paper: true as const } : {}),
      price: p.price,
      usd: Number(p.maxUsd.toFixed(6)),
      status: r.status,
      filledQty: r.filledQty,
      ...(r.avgPrice !== undefined ? { avgPrice: r.avgPrice } : {}),
      ...(r.feeUsd !== undefined ? { feeUsd: r.feeUsd } : {}),
      ref: r.ref,
      signer: who.signer,
      authority: who.authority,
      ...(who.agent ? { agent: who.agent } : {}),
      ...(who.card ? { card: who.card } : {}),
      ...(who.approval ? { approval: who.approval } : {}),
      ...(who.action ? { action: who.action } : {}),
      ...(who.plan ? { plan: who.plan } : {}),
      ...(who.entry ? { entry: true as const } : {}),
      note: "",
      updatedAt: at,
      native: r.native,
      ...(r.walletTxs?.length ? { walletTxs: r.walletTxs } : {}),
      ...(lost ? { unconfirmed: true as const } : {}),
    };
    order.note = this.noteOf(order);
    this.e.orders.unshift(order);
    this.polled.set(id, this.money()!.realNow());
    // the owner's envelope goes on the ledger with the order: a later run of the account then knows this instruction was taken
    this.e.host.log({ kind: "order", venue: p.v.id, tool: "live order", outcome: lost ? "unconfirmed" : order.status, venueOrderId: r.ref, notionalUsd: p.notional, reason: `${id} · ${p.v.paper ? "paper" : "real money"} · ${this.words(p)}${lost ? ` · ${order.note}` : ""}`, native: r.native, signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}) });
    if (DONE.has(order.status)) this.giveBack(order);
    this.line(order);
    this.adoptExits(order, r.native);
    if (isRefusal(answer)) return no(answer.code, { venue: p.v.id, message: `${answer.message} — the account keeps it as ${id}, looked for under its id until ${p.v.name} shows it or shows none`, detail: { ...(answer.detail ?? {}), order: id, unsure: true }, native: answer.native });
    return { ok: true, kind: "order", order };
  }

  /** the order's note: how it stands, in the words the page's toast, its orders table and the statement show ("filled at 62,548.3 · fee
   * $0.06", "on Kraken's book at 63,226.6"). Its prices are grouped (figure); the order's own fields keep the numbers */
  private noteOf(o: LiveOrder): string {
    if (o.unconfirmed && !o.ref) return `${o.venueName} did not confirm it: it may or may not have been placed. Looked for under the account's id until ${o.venueName} shows it or shows none — look at its orders before placing it again`;
    if (o.walletTxs && !o.ref) return `waiting for your wallet to send it${o.walletTxs.length > 1 ? ` (${o.walletTxs.length} transactions: an approval first)` : ""}`;
    switch (o.status) {
      case "filled":
        return `filled${o.avgPrice ? ` at ${figure(o.avgPrice)}` : ""}${o.feeUsd ? ` · fee ${usd(o.feeUsd)}` : ""}`;
      case "partial":
        return `${qtyText(o.filledQty)} of ${qtyText(o.qty)} filled${o.avgPrice ? ` at ${figure(o.avgPrice)}` : ""}`;
      case "open":
        return o.type === "limit" ? `on ${o.venueName}'s book at ${figure(o.limitPrice!)}` : o.type === "trailing_stop" ? `following the price at ${o.venueName}, ${o.trailPercent !== undefined ? `${figure(o.trailPercent)}%` : figure(o.trailPrice ?? 0)} behind its best` : o.type === "stop" || o.type === "stop_limit" ? `waiting at ${o.venueName} for the price to reach ${figure(o.stopPrice ?? 0)}${o.type === "stop_limit" ? `, then a limit at ${figure(o.limitPrice ?? 0)}` : ""}` : o.worstPrice !== undefined ? `on ${o.venueName}'s book at its worst price, ${figure(o.worstPrice)}: it fills there or better, or waits` : `taken by ${o.venueName}`;
      case "pending":
        return `${o.venueName} took it`;
      case "canceled":
        return o.filledQty ? `canceled · ${qtyText(o.filledQty)} of ${qtyText(o.qty)} had filled` : "canceled · nothing filled";
      case "rejected":
        return `${o.venueName} rejected it`;
      case "expired":
        return o.filledQty ? `expired · ${qtyText(o.filledQty)} of ${qtyText(o.qty)} had filled` : "expired · nothing filled";
    }
  }

  private apply(o: LiveOrder, r: OrderState, note: string): void {
    this.settleChange(o, r);
    // what the venue says filled, as it says it: a fill beyond the order (a buy sized in dollars that met a better book) is money spent, and
    // it is counted as such when the order is done. A ref is taken only when it looks like one (no space, no markup): a page answered in the
    // venue's place is never stored as the order's id. A later answer about the same order never wipes a fill the account knew; and an answer
    // the trader could not read back after a cancel or a change (`native.unread`: the most it knew filled) moves the status only to a final one
    const said = Math.max(0, Number.isFinite(r.filledQty) ? r.filledQty : 0);
    const filledQty = !r.ref || r.ref === o.ref ? Math.max(o.filledQty, said) : said;
    const unread = (r.native as { unread?: unknown } | undefined)?.unread === true;
    const status = unread && !DONE.has(r.status) ? o.status : r.status;
    const ref = r.ref && /^[^\s<>]{1,200}$/.test(r.ref) ? unaddressed(r.ref) : undefined;
    Object.assign(o, { status, filledQty, ...(ref ? { ref } : {}), ...(r.avgPrice !== undefined && r.avgPrice > 0 ? { avgPrice: r.avgPrice } : {}), ...(r.feeUsd !== undefined ? { feeUsd: r.feeUsd } : {}), native: r.native, updatedAt: new Date(this.money()?.realNow() ?? Date.now()).toISOString() });
    if (o.ref) o.unconfirmed = undefined;
    // a bracket's exit closes what is left of its position and never more: one the venue trimmed to that (part of the holding sold, or the
    // position reduced, since the exit was placed) fills smaller than it was placed. What filled is its size from then on — on its
    // statement line, in its note and in what it was worth — never the size it was placed at. It counts on no limit, so nothing goes back
    if (o.exitOf && o.status === "filled" && o.filledQty > 0 && o.filledQty < o.qty - 1e-12) {
      o.qty = o.filledQty;
      o.usd = Number(notionalOf(o, o.filledQty, o.price).toFixed(6));
    }
    if (DONE.has(o.status)) {
      o.canceling = undefined;
      // a change still unconfirmed when the order is done: what filled settles the count (giveBack), whichever of the two stood
      o.changing = undefined;
    }
    o.note = note && !DONE.has(o.status) ? note : this.noteOf(o);
  }

  /** A change the venue did not confirm (applyAmend), settled by the venue's first answer that says the order's size (and its limit and
   * stop, where it says them): it holds what was asked — the change was made, and the order is as the change left it — or it does not, and
   * the order stands as it was, at the size the venue holds. What the order counts on its limit follows either way */
  private settleChange(o: LiveOrder, r: Held): void {
    const c = o.changing;
    if (!c || !(typeof r.qty === "number" && r.qty > 0)) return;
    const near = (a: number | undefined, b: number | undefined) => a === undefined || b === undefined || Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-9);
    o.changing = undefined;
    if (near(r.qty, c.qty) && near(r.limitPrice, c.limitPrice) && near(r.stopPrice, c.stopPrice)) {
      Object.assign(o, { qty: c.qty, price: c.price, ...(c.limitPrice !== undefined ? { limitPrice: c.limitPrice } : {}), ...(c.stopPrice !== undefined ? { stopPrice: c.stopPrice } : {}), ...(c.worstPrice !== undefined ? { worstPrice: c.worstPrice } : {}) });
      this.recount(o, c.usd);
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live amend", outcome: "changed", venueOrderId: o.ref, reason: `${o.id} · ${o.venueName} holds the change it had not confirmed: ${qtyText(c.qty)} ${o.base}` });
      return;
    }
    o.qty = r.qty;
    this.recount(o, notionalOf(o, r.qty, o.side === "buy" && o.worstPrice !== undefined ? o.worstPrice : o.price));
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live amend", outcome: "not changed", venueOrderId: o.ref, reason: `${o.id} · ${o.venueName} holds the order as it was (${qtyText(r.qty)} ${o.base}): the change it had not confirmed was not made, and what it would have grown by is free` });
  }

  /** what an order counts on its limit, set to `usd`: the difference charged to the limit, or given back to it */
  private recount(o: LiveOrder, usd: number): void {
    const diff = micro(Math.abs(usd - o.usd).toFixed(6));
    if (o.approval && diff > 0) this.e.patchSpend(o.approval, (x) => ({ ...x, spentMicro: usd > o.usd ? x.spentMicro + diff : Math.max(0, x.spentMicro - diff) }));
    o.usd = Number(usd.toFixed(6));
  }

  /** An agent's order that is done settles its count: what it did not use goes back to the limit; if the venue filled it worse than the
   * worst price allowed, the real cost is counted, and the ledger says so. `unfollowed`: the account stopped following the order, so it
   * settles now, on what had filled when the venue last answered */
  private giveBack(o: LiveOrder, unfollowed = false): void {
    if (!o.approval || !(unfollowed || DONE.has(o.status))) return;
    const used = o.filledQty > 0 ? notionalOf(o, o.filledQty, o.avgPrice !== undefined && o.avgPrice > 0 ? o.avgPrice : o.price) : 0;
    const diff = micro(Math.abs(o.usd - used).toFixed(6));
    if (used <= o.usd) {
      if (diff > 0) this.e.patchSpend(o.approval, (x) => ({ ...x, spentMicro: Math.max(0, x.spentMicro - diff) }));
    } else {
      this.e.patchSpend(o.approval, (x) => ({ ...x, spentMicro: x.spentMicro + diff }));
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: "overrun", reason: `${o.id} · ${o.venueName} filled it for ${usd(used)}, more than the ${usd(o.usd)} it was counted at: the real cost is counted`, notionalUsd: used });
    }
    o.approval = undefined;
  }

  /** The page tells which transaction the wallet sent for a DEX order: once, for an order waiting for its wallet. An order taken back
   * before the wallet sent it is taken on again — the wallet sent it after all — and counted against its limit again. The trader checks on
   * chain that the hash is the transaction the account built. Called one at a time with every other instruction */
  async sent(orderId: string, hash: string): Promise<Outcome> {
    const o = this.e.orders.find((x) => x.id === orderId);
    const waiting = !!o?.walletTxs && !o.ref && (o.status === "pending" || (o.status === "canceled" && o.filledQty === 0));
    if (!o || !waiting) return no("E_ACCOUNT_ORDER_UNKNOWN", { message: `no order ${orderId} is waiting for a wallet` });
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return no("E_ACCOUNT_BAD_ACTION", { message: "a transaction hash is 0x and sixty-four hex digits" });
    const v = this.money()?.venue(o.venue);
    if (!v?.trader?.sent) return no("E_VENUE_RAIL_CLOSED", { venue: o.venue, message: `${o.venueName} is no longer connected live` });
    if (o.reported && o.reported.toLowerCase() !== hash.toLowerCase()) return no("E_ACCOUNT_BAD_ACTION", { message: `your wallet already sent ${o.reported.slice(0, 10)}… for ${o.id}: report that one`, detail: { reported: o.reported } });
    o.reported = hash;
    const expected = o.walletTxs!.at(-1);
    const r = await safely(() => v.trader!.sent!(o.id, hash as Hex, expected), o.venue, o.venueName);
    if (isRefusal(r)) {
      // a hash that is NOT this order's swap is forgotten; one the chain does not show yet is kept, to be reported again
      if (r.code === "E_VENUE_REJECTED" || r.code === "E_ACCOUNT_ORDER_UNKNOWN") o.reported = undefined;
      return r;
    }
    if (o.status === "canceled") {
      o.approval = o.heldBy;
      if (o.approval) this.e.patchSpend(o.approval, (x) => ({ ...x, spentMicro: x.spentMicro + micro(o.usd.toFixed(6)) }));
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: "taken on again", reason: `${o.id} · it had been taken back, but the wallet sent it (${hash}): it counts again` });
    }
    o.heldBy = undefined;
    this.apply(o, { ...r, ref: r.ref || hash }, "");
    this.polled.set(o.id, 0);
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: o.status, venueOrderId: hash, reason: `${o.id} · the wallet sent ${hash}` });
    this.giveBack(o);
    this.line(o);
    return { ok: true, kind: "order", order: o };
  }

  /** A wallet order whose approval the wallet has sent and the chain has taken: its swap, built again from a fresh quote and held to the same
   * order. Only for an order still waiting for its wallet, one at a time with every other instruction */
  async requote(orderId: string): Promise<Outcome> {
    const o = this.e.orders.find((x) => x.id === orderId);
    if (!o?.walletTxs || o.ref || o.status !== "pending") return no("E_ACCOUNT_ORDER_UNKNOWN", { message: `no order ${orderId} is waiting for a wallet` });
    const v = this.money()?.venue(o.venue);
    if (!v?.trader?.requote) return no("E_VENUE_RAIL_CLOSED", { venue: o.venue, message: `${o.venueName} cannot build the swap again: send it as it is, or take it back` });
    const r = await safely(() => v.trader!.requote!(requestOfOrder(o)), o.venue, o.venueName);
    if (isRefusal(r)) return r;
    if (!r.walletTxs?.length) return no("E_VENUE_REJECTED", { venue: o.venue, message: `${o.venueName} built no swap` });
    o.walletTxs = r.walletTxs;
    o.native = r.native;
    o.note = this.noteOf(o);
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: "requoted", reason: `${o.id} · the approval is on chain: the swap was built again from a fresh quote` });
    return { ok: true, kind: "order", order: o };
  }

  // ---- what is held, an order changed in place, a position closed, leverage --------------------------------

  /** what is held at a venue, as the venue lists it */
  async positions(venue: string): Promise<Position[] | Refusal> {
    const v = this.money()?.venue(venue);
    if (!v) return this.notYet(venue) ?? no("E_WALLET_ACCOUNT_UNKNOWN", { venue, message: `"${venue}" is not a venue connected live` });
    if (!v.trader?.positions) return no("E_VENUE_RAIL_CLOSED", { venue, message: `${v.name} lists no positions to the account` });
    return this.asked(venue, v.name, () => v.trader!.positions!(), STATUS_MS);
  }

  /** the order as an amend would leave it: its new size, limit or stop, valued afresh against the market as it is now */
  private async amendPlan(o: LiveOrder, a: { qty: string; limitPrice: string; stopPrice: string }): Promise<{ p: Plan; change: OrderChange } | Refusal> {
    const given = (x: string) => text(x).trim() !== "";
    if (![a.qty, a.limitPrice, a.stopPrice].some(given)) return no("E_ACCOUNT_BAD_ACTION", { message: "an amend changes the size, the limit or the stop" });
    if (given(a.limitPrice) && o.type !== "limit" && o.type !== "stop_limit") return no("E_ACCOUNT_BAD_ACTION", { message: `${o.id} is a ${o.type} order: it has no limit price to change` });
    if (given(a.stopPrice) && o.type !== "stop" && o.type !== "stop_limit") return no("E_ACCOUNT_BAD_ACTION", { message: `${o.id} is a ${o.type} order: it has no stop price to change` });
    const qty = given(a.qty) ? a.qty.trim() : plain(o.qty);
    if (DEC.test(qty) && Number(qty) < o.filledQty - 1e-12) return no("E_ACCOUNT_BAD_ACTION", { message: `${o.id} has ${qtyText(o.filledQty)} filled already: it cannot be made smaller than that` });
    const f: Fields = { venue: o.venue, symbol: o.symbol, side: o.side, orderType: o.type, qty, usd: "", limitPrice: given(a.limitPrice) ? a.limitPrice.trim() : o.limitPrice !== undefined ? plain(o.limitPrice) : "", stopPrice: given(a.stopPrice) ? a.stopPrice.trim() : o.stopPrice !== undefined ? plain(o.stopPrice) : "", tif: o.tif ?? "", postOnly: o.postOnly ? "true" : "", reduceOnly: o.reduceOnly ? "true" : "", extendedHours: o.extendedHours ? "true" : "", trailPercent: o.trailPercent !== undefined ? plain(o.trailPercent) : "", trailPrice: o.trailPrice !== undefined ? plain(o.trailPrice) : "", takeProfit: o.takeProfit !== undefined ? plain(o.takeProfit) : "", stopLoss: o.stopLoss !== undefined ? plain(o.stopLoss) : "" };
    // a bracketed entry keeps its exits: the new limit is judged against them as a new order's would be, and the quote shows them
    const planned = await this.plan(f);
    if (isRefusal(planned)) return planned;
    // a stop's worst price is never pulled in by a change: a venue that holds a stop as a stop-limit at its worst price (Alpaca) keeps the
    // one the stop was placed with, so what the order is worth at most stays a bound whichever of the two the venue holds
    const old = o.type === "stop" ? o.worstPrice : undefined;
    const p = old === undefined || planned.worstPrice === undefined ? planned : (() => {
      const worstPrice = planned.side === "buy" ? Math.max(planned.worstPrice, old) : Math.min(planned.worstPrice, old);
      return { ...planned, worstPrice, maxUsd: planned.side === "buy" ? notionalOf(planned.m, planned.qty, worstPrice) : planned.maxUsd };
    })();
    const capUsd = this.money()!.writes().capUsd;
    if (!p.v.paper && p.maxUsd > capUsd + 1e-9) return no("E_ACCOUNT_LIMIT", { venue: o.venue, message: `${usd(p.maxUsd)} is more than the most one order may be on this server (${usd(capUsd)}): the stop keeps the worst price it was placed with, ${figure(old!)}`, detail: { capUsd, orderUsd: p.maxUsd } });
    return { p, change: { ...(given(a.qty) ? { qty: p.qty } : {}), ...(given(a.limitPrice) ? { limitPrice: p.limitPrice } : {}), ...(given(a.stopPrice) ? { stopPrice: p.stopPrice } : {}) } };
  }

  private changeable(a: { venue: string; order: string }, who: { authority: "owner" | "agent"; agent?: AgentKey | undefined }): LiveOrder | Refusal {
    const o = this.e.orders.find((x) => x.id === a.order && x.venue === a.venue);
    const mine = o && (who.authority === "owner" || (o.authority === "agent" && o.agent === who.agent?.address));
    if (!o || !mine) return no("E_ACCOUNT_ORDER_UNKNOWN", { venue: a.venue, message: who.authority === "agent" && o ? `${a.order} was not placed by this agent: an agent changes only its own orders` : `there is no order ${a.order} at ${a.venue} on the account`, detail: { order: a.order } });
    if (DONE.has(o.status) || (o.walletTxs && !o.ref)) return no("E_ACCOUNT_BAD_ACTION", { venue: o.venue, message: `${o.id} is ${o.walletTxs && !o.ref ? "waiting for a wallet" : o.status}: there is nothing to change at the venue`, detail: { order: o.id } });
    if (o.unfollowed) return no("E_ACCOUNT_BAD_ACTION", { venue: o.venue, message: `${o.id} is not followed: it is canceled, here once ${o.venueName} answers for it again or at the venue, not changed`, detail: { order: o.id } });
    if (o.unconfirmed && !o.ref) return no("E_ACCOUNT_BAD_ACTION", { venue: o.venue, message: `${o.venueName} has not confirmed ${o.id}: it is looked for under the account's id, and nothing is changed until it is found`, detail: { order: o.id } });
    if (o.changing) return no("E_ACCOUNT_BAD_ACTION", { venue: o.venue, message: `${o.venueName} has not confirmed the last change to ${o.id}: it is asked how the order stands now. Change it again once it says`, detail: { order: o.id } });
    const v = this.money()?.venue(o.venue);
    if (!v?.trader) return no("E_VENUE_RAIL_CLOSED", { venue: o.venue, message: `${o.venueName} is no longer connected live` });
    if (!v.trader.amend) return no("E_VENUE_RAIL_CLOSED", { venue: o.venue, message: `${o.venueName} changes no order in place: cancel it and place another` });
    return o;
  }

  /** an agent's close placed uncounted on a renewing entry budget (charged with count off: freeClose — no limit on the order) that the
   * change keeps a close: it stays uncounted */
  private uncountedClose(o: LiveOrder, spend: SpendApproval, p: Plan): boolean {
    return o.approval === undefined && this.freeClose(spend, p);
  }

  /** what an agent's change adds to the limit that stands: what the order grows by, or — counted on a limit the owner has since replaced — all of
   * it, since it moves onto the one that stands */
  private growth(o: LiveOrder, maxUsd: number, limit: string): number {
    return o.approval === limit ? maxUsd - o.usd : maxUsd;
  }

  /** what the owner is shown and signs for an amend: the order as it would be, what it would then be worth at most, ten minutes */
  async prepareAmend(draft: Record<string, unknown>): Promise<{ action: Omit<LiveAmendAction, "nonce">; quote: OrderQuote } | Refusal> {
    const a = { venue: String(draft.venue ?? ""), order: String(draft.order ?? ""), qty: String(draft.qty ?? ""), limitPrice: String(draft.limitPrice ?? ""), stopPrice: String(draft.stopPrice ?? "") };
    const o = this.changeable(a, { authority: "owner" });
    if (isRefusal(o)) return o;
    const r = await this.amendPlan(o, a);
    if (isRefusal(r)) return r;
    const p = r.p;
    const worth = (p.side === "buy" ? cents(p.maxUsd) : Math.floor(p.notional * 100 + 1e-6) / 100).toFixed(2);
    return { action: { type: "liveAmend", ...a, maxNotional: worth, deadline: this.money()!.realNow() + TTL_MS }, quote: { words: `${o.id}: ${this.words(p)}`, name: p.m.name, kind: p.m.kind, base: p.m.base, quote: p.m.quote, price: p.price, notionalUsd: Number(p.notional.toFixed(2)), maxUsd: Number(worth), ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}), capUsd: this.money()!.writes().capUsd, ...(p.v.paper ? { paper: true as const } : {}) } };
  }

  /** Change an open order in place. The owner: held to what was signed. An agent: only its own order; what the order becomes worth MORE is
   * judged like a new order of the difference — Beast inside its limit at once, Guard on a card; worth less, it simply goes */
  async amend(a: LiveAmendAction | AgentLiveAmendAction, who: { signer: string; authority: "owner" | "agent"; agent?: AgentKey | undefined; envelope: Envelope; hash: Hex }): Promise<Outcome> {
    const o = this.changeable(a, who);
    if (isRefusal(o)) return o;
    const r = await this.amendPlan(o, a);
    if (isRefusal(r)) return r;
    if (who.authority === "owner") {
      const signed = a as LiveAmendAction;
      if (this.money()!.realNow() > signed.deadline) return no("E_ACCOUNT_EXPIRED", { message: "this change was good for ten minutes after it was prepared: prepare it again" });
      const held = this.hold(r.p, o.symbol, Number(signed.maxNotional), "signed for");
      if (isRefusal(held)) return held;
      // an agent's order the owner grows still counts on the agent's limit: the growth has to fit that limit, as the agent's own change
      // would have to — the owner's signature changes the order, not the limit (a bigger limit is its own signature, under Agents)
      const onto = o.approval ? this.e.state.spends.find((s) => s.id === o.approval) : undefined;
      const more = onto ? held.maxUsd - o.usd : 0;
      const c = onto && more > 1e-9 ? covers(onto, o.venue, micro(more.toFixed(6)), Date.parse(this.e.host.now()), { window: false }) : null;
      if (c) return { ...c, message: `${c.message}. ${o.id} counts against ${this.agentName(o.agent)}'s trading limit: give it a bigger limit under Agents, or grow the order by less` };
      return this.applyAmend(o, held, r.change, who);
    }
    const spend = await this.limit(who.signer, o.venue);
    if (isRefusal(spend)) return spend;
    const p = r.p;
    const line = perOrder(spend, p.maxUsd);
    if (line) return line;
    const now = Date.parse(this.e.host.now());
    // A CLOSE ON A RENEWING ENTRY BUDGET, placed uncounted (freeClose), stays uncounted as it is changed: the change is judged as the close
    // was — its per-order cap, its venues — and none of it is charged to the entry budget, so it grows the budget's count by nothing and
    // goes at once, as a change worth less does (B8)
    if (this.uncountedClose(o, spend, p)) {
      const c = covers(spend, o.venue, micro(p.maxUsd.toFixed(6)), now, { close: true, window: false });
      if (c) return c;
      return this.applyAmend(o, p, r.change, who, undefined);
    }
    const more = this.growth(o, p.maxUsd, spend.id);
    if (more <= 1e-9) return this.applyAmend(o, p, r.change, who, spend.id);
    // a change to an order already placed is not a second order: the limit's window is not judged here
    if (this.e.host.policy().mode === "open") {
      const c = covers(spend, o.venue, micro(more.toFixed(6)), now, { window: false });
      if (c) return c;
      return this.applyAmend(o, p, r.change, who, spend.id);
    }
    const worth = cents(p.maxUsd);
    const extra = cents(more);
    const c = covers(spend, o.venue, micro(extra.toFixed(2)), now, { window: false });
    if (c) return c;
    const flight = this.e.host.openFlight({ id: slug(who.agent!.name), name: who.agent!.name, code: who.agent!.code }, `change ${o.id}: ${this.words(p)} · ${o.paper ? "paper" : "real money"}`);
    const offer = { payee: o.venueName, payTo: o.symbol, amount: `${o.id} → ${p.side} ${qtyText(p.qty)} ${p.m.base}`, protocol: `change an order · ${this.words(p, plain)}`, network: `${p.side === "buy" ? "costs at most" : "worth about"} ${usd(worth)} · ${usd(extra)} more than now` };
    const actionHash = keccak256(stringToHex(canonical({ action: who.hash, offer, qty: plain(p.qty), limit: p.limitPrice !== undefined ? plain(p.limitPrice) : "", stop: p.stopPrice !== undefined ? plain(p.stopPrice) : "", worth: worth.toFixed(2) })));
    const card = this.e.host.raiseCard(flight.no, { account: o.venue, intent: { kind: "trade", symbol: p.m.symbol, side: p.side, qty: p.qty }, usd: extra, reason: `${who.agent!.name} asks to change ${o.id}: ${this.words(p)}`, why: "live", action: a as AgentLiveAmendAction, actionHash, signer: who.signer, expiresAt: new Date(now + CARD_TTL_MS).toISOString(), offer, approval: spend.id });
    this.shownAmend.set(card.id, { order: o.id, qty: p.qty, ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}), ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}), maxUsd: worth });
    this.e.patchSpend(spend.id, (x) => ({ ...x, reservedMicro: x.reservedMicro + micro(String(extra)) }));
    this.e.host.log({ kind: "action", venue: o.venue, tool: a.type, signer: who.signer, envelope: who.envelope, outcome: "card", notionalUsd: extra, reason: `${card.id} · change ${o.id}: ${this.words(p)}`, flight: flight.no, intentId: card.id });
    return { ok: true, kind: "card", pending: true, card, flight: flight.no };
  }

  /** the owner approved an agent's change: exactly what the card showed, judged again against the agent's limit as it stands */
  async releaseAmend(card: CardLike, who: { signer: string; agent: AgentKey }): Promise<Outcome> {
    const a = card.action as AgentLiveAmendAction;
    const shown = this.shownAmend.get(card.id);
    this.shownAmend.delete(card.id);
    if (!shown) return no("E_ACCOUNT_REQUOTE", { message: "this card's change is not known to this run of the account: the agent asks again" });
    const o = this.changeable(a, { authority: "agent", agent: who.agent });
    if (isRefusal(o)) return o;
    const spend = await this.limit(who.signer, o.venue);
    if (isRefusal(spend)) return spend;
    const r = await this.amendPlan(o, { qty: plain(shown.qty), limitPrice: shown.limitPrice !== undefined && o.limitPrice !== shown.limitPrice ? plain(shown.limitPrice) : "", stopPrice: shown.stopPrice !== undefined && o.stopPrice !== shown.stopPrice ? plain(shown.stopPrice) : "" });
    if (isRefusal(r)) return r;
    const held = this.hold(r.p, o.symbol, r.p.side === "buy" ? shown.maxUsd : r.p.notional, "on the card");
    if (isRefusal(held)) return held;
    const line = perOrder(spend, held.maxUsd);
    if (line) return line;
    // a close on a renewing entry budget, placed uncounted, stays uncounted (amend)
    if (this.uncountedClose(o, spend, held)) {
      const c = covers(spend, o.venue, micro(held.maxUsd.toFixed(6)), Date.parse(this.e.host.now()), { close: true, window: false });
      if (c) return c;
      return this.applyAmend(o, held, r.change, { signer: who.signer, authority: "agent", agent: who.agent }, undefined);
    }
    const more = this.growth(o, held.maxUsd, spend.id);
    const c = more > 0 ? covers(spend, o.venue, micro(more.toFixed(6)), Date.parse(this.e.host.now()), { window: false }) : null;
    if (c) return c;
    return this.applyAmend(o, held, r.change, { signer: who.signer, authority: "agent", agent: who.agent }, spend.id);
  }

  /** an agent key's name on the account, for a sentence about its order */
  private agentName(address: string | undefined): string {
    return this.e.state.agents.find((k) => k.address === address)?.name ?? "the agent";
  }

  /** the venue's amend, and the order as it stands after it. What it is worth more is counted first (and uncounted if the venue says no);
   * what it is worth less goes back to its limit. A change the venue did not confirm (its answer lost) may have been made: what it grows by
   * stays counted, nothing it shrinks by goes back, and the order is asked about at once — its next answer that says its size settles which
   * stands (settleChange) */
  private async applyAmend(o: LiveOrder, p: Plan, change: OrderChange, who: { signer: string; authority: "owner" | "agent"; agent?: AgentKey | undefined; envelope?: Envelope | undefined }, onto = o.approval): Promise<Outcome> {
    const v = this.money()!.venue(o.venue)!;
    // moving onto the limit that stands: all of the order is counted there, and what the old limit counted for it goes back to that one
    const moving = onto !== undefined && onto !== o.approval;
    const charge = moving ? micro(p.maxUsd.toFixed(6)) : p.maxUsd > o.usd ? micro((p.maxUsd - o.usd).toFixed(6)) : 0;
    const back = moving ? micro(o.usd.toFixed(6)) : p.maxUsd < o.usd ? micro((o.usd - p.maxUsd).toFixed(6)) : 0;
    if (onto && charge > 0) this.e.patchSpend(onto, (x) => ({ ...x, spentMicro: x.spentMicro + charge }));
    const held = this.heldAt(o.venue);
    const r = held ?? (await safely(() => v.trader!.amend!(o.ref, o.symbol, change, requestOfOrder(o)), o.venue, o.venueName));
    if (isRefusal(r)) {
      const unsure = (r.detail as { unsure?: unknown } | undefined)?.unsure === true;
      // the order stays on the limit it was counted on when it was moving: the change, if it was made, is counted there (settleChange)
      if (onto && charge > 0 && (!unsure || moving)) this.e.patchSpend(onto, (x) => ({ ...x, spentMicro: Math.max(0, x.spentMicro - charge) }));
      if (!held) this.holdOn(o.venue, r);
      this.e.host.log({ kind: "account-refusal", venue: o.venue, tool: "live amend", code: r.code, reason: r.message, native: r.native, signer: who.signer });
      if (unsure) {
        o.changing = { qty: p.qty, price: p.price, usd: Number(p.maxUsd.toFixed(6)), ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}), ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}), ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}) };
        if (!moving) o.usd = Number(Math.max(o.usd, p.maxUsd).toFixed(6));
        o.note = `${o.venueName} did not confirm a change to ${this.words(p)}: it may or may not have been made. What it would grow by stays counted until ${o.venueName} says which stands`;
        o.updatedAt = new Date(this.money()!.realNow()).toISOString();
        this.polled.set(o.id, 0);
        this.misses.delete(o.id);
        this.line(o);
      }
      return r;
    }
    if (o.approval && back > 0) this.e.patchSpend(o.approval, (x) => ({ ...x, spentMicro: Math.max(0, x.spentMicro - back) }));
    if (moving) o.approval = onto;
    Object.assign(o, { qty: p.qty, price: p.price, usd: Number(p.maxUsd.toFixed(6)), ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}), ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}), ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}) });
    this.apply(o, r, "");
    this.polled.set(o.id, 0);
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live amend", outcome: o.status, venueOrderId: o.ref, notionalUsd: p.notional, reason: `${o.id} · changed by ${who.authority === "owner" ? "the owner" : "its agent"} · ${this.words(p)}`, signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}) });
    this.giveBack(o);
    this.line(o);
    return { ok: true, kind: "order", order: o };
  }

  /** Close a position — all of it, or some — at a venue. The owner's goes at once. An agent's is an order the owner sees like any other, and
   * only where its trading limit lets it trade (a position the agent closes may be the owner's own); what it counts depends on what the
   * close IS:
   *
   *   a derivative position closed reduce-only (or by the venue's own close) only shrinks what is held, so it counts nothing against the
   *   limit's budget — Guard a card, Beast at once inside the per-order line and a card above it;
   *   a plain sell of a holding (spot, shares, event contracts: markets where a sell can only sell what is held) IS a sell order, and counts
   *   against the trading limit exactly as one does — the per-order line, the budget, the window — settling its count as it fills.
   *   Guard a card that holds its share, Beast at once; over the limit it is refused, as a sell order is.
   *
   * The venue's own close where it has one; otherwise a reduce-only market order, and only where the market takes reduce-only, or the plain
   * sell: a close that could open a position the other way is not sent */
  async close(a: CloseFields | AgentLiveCloseAction, who: { signer: string; authority: "owner" | "agent"; agent?: AgentKey | undefined; envelope?: Envelope | undefined; hash: Hex; card?: string | undefined }): Promise<Outcome> {
    const v = this.money()?.venue(text(a.venue));
    if (!v) return this.notYet(text(a.venue)) ?? no("E_WALLET_ACCOUNT_UNKNOWN", { venue: a.venue, message: `"${a.venue}" is not a venue connected live` });
    if (!v.trader?.positions) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name} lists no positions to the account: sell what is held as an order` });
    let spend: SpendApproval | undefined;
    if (who.authority === "agent") {
      const s = await this.limit(who.signer, v.id);
      if (isRefusal(s)) return s;
      spend = s;
    }
    const c = await this.closing(v as LiveVenue & { trader: LiveTrader }, a);
    if (isRefusal(c)) return c;
    const { pos, qty, native, plainSell, p } = c;
    // a close only shrinks what is held: a close-only place lets it through, a venue's closed line does not
    if (spend && who.card === undefined) {
      const line = await this.placeRule(p.v, p.side, true, p.m.symbol);
      if (line) return line;
    }
    // the desk's own seat at its paper account, under the autonomy the owner signed, closes as Beast closes (AutonomyHook)
    const superagent = spend && who.card === undefined ? this.superagent(who.signer, v) : undefined;
    const open = this.e.host.policy().mode === "open" || superagent !== undefined;
    const asking = spend !== undefined && who.card === undefined && !open;
    if (spend && plainSell) {
      // a card holds what it shows, to the cent; a release or a Beast close is counted at what it is worth — on a renewing entry budget,
      // at nothing (freeClose: a close counts against none of it, and its card holds none of it)
      const free = (spend.renewHours ?? 0) > 0;
      const amount = micro((asking ? cents(p.maxUsd) : p.maxUsd).toFixed(6));
      const limit = covers(spend, v.id, amount, Date.parse(this.e.host.now()), { close: free });
      // what held it, said as it is: on a renewing entry budget only the per-order cap, the venues and the window judge a close
      if (limit) return { ...limit, message: `${limit.message}. ${free ? "On this renewing limit a close counts against none of the budget, but the limit's per-order cap, its venues and its window still hold it" : "A close that sells a holding is a sell order, and counts against the trading limit like one"}` };
      if (asking) return this.closeCard(a, p, qty, who, free ? undefined : spend, pos);
      const out = await this.charged(spend.id, p, { signer: who.signer, authority: "agent", agent: who.agent!.address, action: who.hash, approval: spend.id, ...(who.envelope ? { envelope: who.envelope } : {}), ...(who.card ? { card: who.card } : {}) }, { count: !free });
      this.autonomousClose(superagent, out, p, qty, who);
      return this.closed(out, v as LiveVenue & { trader: LiveTrader }, pos, qty, who);
    }
    if (spend && who.card === undefined && !(open && micro(p.maxUsd.toFixed(6)) <= spend.perPaymentMicro)) return this.closeCard(a, p, qty, who, undefined, pos);
    const out = await this.place(p, { signer: who.signer, authority: who.authority, ...(who.agent ? { agent: who.agent.address } : {}), action: who.hash, ...(who.envelope ? { envelope: who.envelope } : {}), ...(who.card ? { card: who.card } : {}) }, native ? (clientId) => native.call(v.trader, pos.symbol, qty, clientId) : undefined);
    this.autonomousClose(superagent, out, p, qty, who);
    return this.closed(out, v as LiveVenue & { trader: LiveTrader }, pos, qty, who);
  }

  /** a close the superagent's autonomy let through without a card: the ledger's row says so, as an order's does (agent()) */
  private autonomousClose(superagent: string | undefined, out: Outcome, p: Plan, qty: number, who: { signer: string; envelope?: Envelope | undefined }): void {
    if (superagent === undefined || isRefusal(out)) return;
    this.e.host.log({ kind: "action", venue: p.v.id, tool: "agentLiveClose", signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}), outcome: "accepted", notionalUsd: p.maxUsd, reason: `${superagent}: close ${qtyText(qty)} ${p.m.base} of ${p.m.name}, inside the trading limit` });
  }

  /** the exits the venue placed for a position's entries (a bracket's take-profit and stop-loss, followed as the account's own orders: exitOf)
   * still open at the venue — what a close of the whole position takes with it. Only those on the close's side: a long's sells, a short's
   * buys, as the paper account's own cancel takes a holding's sells once it is sold whole. An exit the other way is a sell's bracket buying
   * back what it sold (part of a holding sold with a take-profit under it and a stop-loss over it): it closes nothing of what is held, and
   * stays when what is held is closed */
  private exitsOf(venue: string, pos: Position): LiveOrder[] {
    const side: Side = pos.side === "long" ? "sell" : "buy";
    return this.e.orders.filter((o) => o.venue === venue && o.symbol === pos.symbol && o.side === side && o.exitOf !== undefined && !DONE.has(o.status) && !o.unfollowed && !!o.ref);
  }

  /** what a close of the whole position says of its exits, for the owner's quote and an agent's card: each canceled with it */
  private exitsWords(venue: string, pos: Position, qty: number): string {
    const exits = qty < pos.qty - 1e-12 ? [] : this.exitsOf(venue, pos);
    return exits.length ? ` · ${exits.map((o) => `its ${o.exitOf!.kind} ${o.id}`).join(" and ")} ${exits.length > 1 ? "are" : "is"} canceled with it` : "";
  }

  /** A close that took the whole position takes its exits off the venue's book, through the venue's cancel: the position they guarded is
   * gone, and an exit left armed trades the next position in that market (a stop-loss selling a holding bought later, or shrinking a later
   * perpetual the same way). Only once the close has FILLED: a close of part of the position leaves them to what is left of it; a close
   * the venue refused, or that ended without filling, leaves them as they were; and so does a close still waiting — a stock's market sell
   * queued for the open, a close resting at the venue — for until it fills the position is still there, and the exits still guard it (the
   * owner may yet cancel the close). A paper account cancels a position's exits itself when a close that waited takes the position whole
   * (paper.ts cancelExits), and the account's poll then sees them canceled; a venue that does not would leave them, to be canceled there.
   * Whoever closed, the exits go: they are the position's, not the closer's. A cancel the venue refuses is said on the exit's line, to be
   * canceled at the venue */
  private async closed(out: Outcome, v: LiveVenue & { trader: LiveTrader }, pos: Position, qty: number, who: { signer: string; authority: "owner" | "agent"; agent?: AgentKey | undefined; envelope?: Envelope | undefined }): Promise<Outcome> {
    if (isRefusal(out) || out.kind !== "order" || qty < pos.qty - 1e-12) return out;
    const close = out.order;
    if (close.status !== "filled") return out;
    const by = who.authority === "owner" ? "the owner" : (who.agent?.name ?? "an agent");
    for (const o of this.exitsOf(v.id, pos)) {
      const of = `${o.exitOf!.kind} of ${o.exitOf!.order}`;
      const r = await safely(() => v.trader.cancel(o.ref, o.symbol), o.venue, o.venueName);
      if (isRefusal(r)) {
        this.holdOn(o.venue, r);
        o.note = `${of} · the position was closed (${close.id}), and ${o.venueName} refused to cancel this exit: ${r.message}. Cancel it at ${o.venueName}`;
        o.updatedAt = new Date(this.money()?.realNow() ?? Date.now()).toISOString();
        this.e.host.log({ kind: "account-refusal", venue: o.venue, tool: "live cancel", code: r.code, reason: `${o.id} · ${of}, with the close ${close.id}: ${r.message}`, native: r.native, signer: who.signer });
        this.line(o);
        continue;
      }
      if (DONE.has(r.status)) this.apply(o, r, "");
      else {
        // the venue took the cancel but has not said the exit is gone: followed until it says, as any cancel is
        o.canceling = true;
        this.apply(o, r, `${of} · cancel asked of ${o.venueName} with the close ${close.id}: waiting for it to say the order is gone`);
        this.polled.set(o.id, 0);
      }
      if (o.status === "canceled") o.note = `${of} · canceled: the position was closed (${close.id})`;
      this.line(o);
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live cancel", outcome: o.status, venueOrderId: o.ref, reason: `${o.id} · ${of} · ${by} closed the position (${close.id}), so its exit was canceled`, signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}) });
    }
    return out;
  }

  /** What a close at `v` would be: the position, how much of it, the venue's own close or a reduce-only market order (a plain sell where a
   * sell can only sell what is held — `plainSell`; nothing where neither holds), and the order's plan. `uncapped`: the plan does not judge
   * the cap */
  private async closing(v: LiveVenue & { trader: LiveTrader }, a: CloseFields | AgentLiveCloseAction, uncapped = false): Promise<{ pos: Position; qty: number; native: LiveTrader["close"]; plainSell: boolean; p: Plan } | Refusal> {
    // a trader that reaches several venues reads only the part the close is at (one refusing this network does not keep the other's from
    // being closed)
    const t = v.trader as Extras;
    const list = await this.asked(v.id, v.name, () => (t.positionsOf ? t.positionsOf(text(a.symbol)) : v.trader.positions!()), STATUS_MS);
    if (isRefusal(list)) return list;
    const pos = list.find((x) => x.symbol === text(a.symbol));
    if (!pos || !(pos.qty > 0)) return no("E_ACCOUNT_BAD_ACTION", { venue: v.id, message: `${v.name} shows no position in ${a.symbol}` });
    const qty = text(a.qty).trim() === "" ? pos.qty : Number(a.qty);
    if ((text(a.qty).trim() !== "" && !DEC.test(text(a.qty).trim())) || !(qty > 0) || qty > pos.qty + 1e-12) return no("E_ACCOUNT_BAD_ACTION", { venue: v.id, message: `a close is more than zero and at most the ${qtyText(pos.qty)} held` });
    const native = v.trader.close;
    // without the venue's own close: reduce-only where the market takes it; a plain sell where a sell can only sell what is held; else nothing
    const mk = native ? undefined : await this.asked(v.id, v.name, () => v.trader.market(pos.symbol), STATUS_MS);
    if (mk && isRefusal(mk)) return mk;
    const plainSell = !!mk && !mk.reduceOnly && !!mk.sellsReduce && pos.side === "long";
    if (mk && !mk.reduceOnly && !plainSell) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes no reduce-only order in ${mk.name}, and has no close of its own: close it at the venue, so that nothing opens the other way` });
    const p = await this.plan({ venue: v.id, symbol: pos.symbol, side: pos.side === "long" ? "sell" : "buy", orderType: "market", qty: plain(qty), usd: "", limitPrice: "", stopPrice: "", tif: "", postOnly: "", reduceOnly: native || plainSell ? "" : "true", extendedHours: "", trailPercent: "", trailPrice: "", takeProfit: "", stopLoss: "" }, uncapped, qty >= pos.qty - 1e-12);
    if (isRefusal(p)) return p;
    return { pos, qty, native, plainSell, p };
  }

  /** What the owner is shown before signing a close: the side and size it closes, its worst price, what it is worth (a buy back: the most
   * it may cost), the server's cap and whether the close is over it — so the page can say so BEFORE anything is signed. The door judges
   * the close again, cap and all, when it runs */
  async prepareClose(draft: Record<string, unknown>): Promise<{ action: Omit<Extract<OwnerAction, { type: "liveClose" }>, "nonce">; quote: CloseQuote } | Refusal> {
    const f: CloseFields = { venue: String(draft.venue ?? ""), symbol: String(draft.symbol ?? ""), qty: String(draft.qty ?? "").trim() };
    const m = this.money();
    if (!m) return no("E_ACCOUNT_BAD_ACTION", { message: "this account has no venues connected live" });
    if (!m.writes().on) return no("E_WALLET_LIVE_WRITES_OFF", { message: `this server places no orders: it was started read-only. To trade, stop it and start it again with: ${m.writes().turnOn}`, detail: { turnOn: m.writes().turnOn } });
    const v = m.venue(f.venue);
    if (!v) return this.notYet(f.venue) ?? no("E_WALLET_ACCOUNT_UNKNOWN", { venue: f.venue, message: `"${f.venue}" is not a venue connected live` });
    if (!v.trader?.positions) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name} lists no positions to the account: sell what is held as an order` });
    if (!f.symbol.trim()) return no("E_ACCOUNT_BAD_ACTION", { message: "a close names the position's market" });
    const c = await this.closing(v as LiveVenue & { trader: LiveTrader }, f, true);
    if (isRefusal(c)) return c;
    const { p, qty, pos } = c;
    const line = await this.placeRule(p.v, p.side, true, p.m.symbol);
    if (line) return line;
    // the venue's own rule, asked before anything is signed: a close it would refuse now (part of a holding its open sells hold) is said
    // now, and what else a close does is said with it (a whole holding's open sells canceled with it)
    const est = await this.estimateOf(p, { close: qty >= pos.qty - 1e-12 });
    if (est.refuses) return no("E_VENUE_REJECTED", { venue: v.id, message: est.refuses, detail: { beforeSigning: true } });
    const capUsd = m.writes().capUsd;
    const worthUsd = cents(p.maxUsd);
    const overCap = !v.paper && p.maxUsd > capUsd + 1e-9;
    return {
      action: { type: "liveClose", venue: v.id, symbol: p.m.symbol, qty: f.qty === "" ? "" : plain(qty) },
      quote: { words: `close ${qtyText(qty)} ${p.m.base} of ${p.m.name} at ${v.name}: ${this.words(p)}${this.exitsWords(v.id, pos, qty)}${est.note ? ` · ${est.note}` : ""}`, venue: v.id, venueName: v.name, symbol: p.m.symbol, name: p.m.name, side: p.side, qty, ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}), price: p.price, worthUsd, capUsd, overCap, ...(v.paper ? { paper: true as const } : {}), ...(overCap ? { why: `${usd(worthUsd)} is more than the most one order may be on this server (${usd(capUsd)}): close part of it, or start the server with a higher --live-cap` } : {}) },
    };
  }

  /** an agent's close the owner answers: what it closes and what that is worth, shown on a card. A derivative's reduce-only close counts
   * against no limit, so its card holds none of one; a plain sell of a holding is an order, so its card holds its share of `spend` while it
   * waits, as an order's card does */
  private closeCard(a: CloseFields | AgentLiveCloseAction, p: Plan, qty: number, who: { signer: string; agent?: AgentKey | undefined; envelope?: Envelope | undefined; hash: Hex }, spend: SpendApproval | undefined, pos: Position): Outcome {
    const agent = who.agent!;
    const now = Date.parse(this.e.host.now());
    const flight = this.e.host.openFlight({ id: slug(agent.name), name: agent.name, code: agent.code }, `close ${qtyText(qty)} ${p.m.base} of ${p.m.name} · ${p.v.paper ? "paper" : "real money"}`);
    const worth = cents(p.maxUsd);
    const offer = { payee: p.v.name, payTo: p.m.symbol, amount: `close · ${p.side} ${qtyText(qty)} ${p.m.base}`, protocol: `${p.v.paper ? "paper order (no real money)" : "real order"} · a close at market`, network: `${p.side === "buy" ? "costs at most" : "worth about"} ${usd(worth)} · ${spend ? "it sells what is held, and counts against the trading limit like a sell order" : "it only shrinks what is held"}` };
    // the owner's answer signs the card's hash: the agent's request AND the market and size the owner is shown
    const actionHash = keccak256(stringToHex(canonical({ action: who.hash, offer, symbol: p.m.symbol, qty: plain(qty), worth: worth.toFixed(2) })));
    const card = this.e.host.raiseCard(flight.no, { account: p.v.id, intent: { kind: "trade", symbol: p.m.symbol, side: p.side, qty }, usd: worth, reason: `${agent.name} asks to close ${qtyText(qty)} ${p.m.base} of ${p.m.name}${this.exitsWords(p.v.id, pos, qty)}`, why: "live", action: a as AgentLiveCloseAction, actionHash, signer: who.signer, expiresAt: new Date(now + CARD_TTL_MS).toISOString(), offer, ...(spend ? { approval: spend.id } : {}) });
    this.shownClose.set(card.id, { symbol: p.m.symbol, qty });
    if (spend) this.e.patchSpend(spend.id, (x) => ({ ...x, reservedMicro: x.reservedMicro + micro(worth.toFixed(2)) }));
    this.e.host.log({ kind: "action", venue: p.v.id, tool: "agentLiveClose", signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}), outcome: "card", notionalUsd: worth, reason: `${card.id} · close ${qtyText(qty)} of ${p.m.name}`, flight: flight.no, intentId: card.id });
    return { ok: true, kind: "card", pending: true, card, flight: flight.no };
  }

  /** the owner approved an agent's close: exactly the size the card showed, against what is held then (never more than that) */
  async releaseClose(card: CardLike, who: { signer: string; agent: AgentKey }): Promise<Outcome> {
    const a = card.action as AgentLiveCloseAction;
    const shown = this.shownClose.get(card.id);
    this.shownClose.delete(card.id);
    if (!shown) return no("E_ACCOUNT_REQUOTE", { message: "this card's close is not known to this run of the account: the agent asks again" });
    return this.close({ venue: a.venue, symbol: shown.symbol, qty: plain(shown.qty) }, { signer: who.signer, authority: "agent", agent: who.agent, hash: card.actionHash!, card: card.id });
  }

  /** A perpetual's leverage (and margin mode). The owner: up to what the venue takes. An agent: where its trading limit lets it trade, up to
   * the most the owner signed for agents (1x unless the owner signed more) — and where a position is open in that market (anyone's: the
   * account cannot tell the owner's from the agent's), the change alters what that position risks, so it is answered like a close of it:
   * Guard a card, Beast at once when the position is inside the agent's per-order line and a card above it. With no position
   * there it is set at once in both modes: the next order's card shows the leverage */
  async leverage(a: LeverageFields, who: { signer: string; authority: "owner" | "agent"; envelope?: Envelope | undefined; agent?: AgentKey | undefined; hash?: Hex | undefined; card?: string | undefined }): Promise<Outcome> {
    const v = this.money()?.venue(text(a.venue));
    if (!v) return this.notYet(text(a.venue)) ?? no("E_WALLET_ACCOUNT_UNKNOWN", { venue: a.venue, message: `"${a.venue}" is not a venue connected live` });
    if (!v.trader?.setLeverage) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name} sets no leverage from the account` });
    const lev = Number(a.leverage);
    if (!/^\d{1,3}$/.test(text(a.leverage)) || !(lev >= 1)) return no("E_ACCOUNT_BAD_ACTION", { message: "leverage is a whole number, 1 or more" });
    if (text(a.marginMode) !== "" && a.marginMode !== "cross" && a.marginMode !== "isolated") return no("E_ACCOUNT_BAD_ACTION", { message: 'a margin mode is "cross" or "isolated"' });
    const m = this.money()!;
    if (!m.writes().on) return no("E_WALLET_LIVE_WRITES_OFF", { message: `this server changes nothing at a venue: it was started read-only. To trade, stop it and start it again with: ${m.writes().turnOn}`, detail: { turnOn: m.writes().turnOn } });
    const mk = await this.asked(v.id, v.name, () => v.trader!.market(text(a.symbol)), STATUS_MS);
    if (isRefusal(mk)) return mk;
    if (mk.kind !== "perp" && mk.kind !== "future") return no("E_ACCOUNT_BAD_ACTION", { venue: v.id, message: `leverage is set on a perpetual or a future; ${mk.name} is ${mk.kind}` });
    if (mk.maxLeverage !== undefined && lev > mk.maxLeverage) return no("E_VENUE_ORDER_INVALID", { venue: v.id, message: `${v.name} takes at most ${mk.maxLeverage}x in ${mk.name}` });
    // the venue's place rule (or what this door learned of it) before a card is raised: asked as an opening order, since a leverage change can
    // add exposure, so that no card is raised for a change the account would refuse (what this door learned stops every change below)
    if (who.authority === "agent" && who.card === undefined) {
      const line = await this.placeRule(v as LiveVenue & { trader: LiveTrader }, "buy", false, mk.symbol);
      if (line) return line;
    }
    if (who.authority === "agent") {
      const spend = await this.limit(who.signer, v.id);
      if (isRefusal(spend)) return spend;
      const cap = this.e.host.policy().maxLeverage ?? 1;
      if (lev > cap) return no("E_ACCOUNT_LIMIT", { venue: v.id, message: `the owner lets agents use at most ${cap}x leverage: ${lev}x is the owner's to set, or to allow`, detail: { maxLeverage: cap } });
      if (who.card === undefined && v.trader.positions) {
        const list = await this.asked(v.id, v.name, () => v.trader!.positions!(), STATUS_MS);
        if (isRefusal(list)) return list;
        const pos = list.find((x) => x.symbol === mk.symbol && x.qty > 0);
        if (pos) {
          const worth = pos.usd ?? notionalOf(mk, pos.qty, pos.markPrice ?? mk.price ?? 0);
          if (!(this.e.host.policy().mode === "open" && micro(worth.toFixed(6)) <= spend.perPaymentMicro)) return this.leverageCard(a, mk, v, lev, pos, worth, who);
        }
      }
    }
    const refused = this.refusedNow(v.id);
    if (refused) return refused;
    const r = await safely(() => v.trader!.setLeverage!(mk.symbol, lev, (text(a.marginMode) || undefined) as "cross" | "isolated" | undefined), v.id, v.name);
    if (isRefusal(r)) {
      this.e.host.log({ kind: "account-refusal", venue: v.id, tool: "live leverage", code: r.code, reason: r.message, native: r.native, signer: who.signer });
      this.refusedOrder(v, r);
      return r;
    }
    this.e.host.log({ kind: "action", venue: v.id, tool: "live leverage", signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}), ...(who.card ? { intentId: who.card } : {}), outcome: "ok", reason: `${mk.name} at ${v.name}: ${r.leverage}x${r.marginMode ? `, ${r.marginMode} margin` : ""}`, native: r.native });
    return { ok: true, kind: "result", result: { venue: v.id, symbol: mk.symbol, leverage: r.leverage, ...(r.marginMode ? { marginMode: r.marginMode } : {}) } };
  }

  /** an agent's leverage change the owner answers: the market, the leverage and the position open there, shown on a card. It moves no money
   * and counts against no limit, so the card holds none of one. The card's intent names the position the change bears on */
  private leverageCard(a: LeverageFields, mk: Market, v: LiveVenue, lev: number, pos: Position, worth: number, who: { signer: string; agent?: AgentKey | undefined; envelope?: Envelope | undefined; hash?: Hex | undefined }): Outcome {
    const agent = who.agent!;
    const now = Date.parse(this.e.host.now());
    const mode = text(a.marginMode);
    const flight = this.e.host.openFlight({ id: slug(agent.name), name: agent.name, code: agent.code }, `set leverage to ${lev}x on ${mk.name} · a position is open there`);
    const offer = { payee: v.name, payTo: mk.symbol, amount: `leverage ${lev}x${mode ? ` · ${mode} margin` : ""}`, protocol: "a perpetual's leverage", network: `a ${pos.side} position of ${qtyText(pos.qty)} ${mk.base} (about ${usd(worth)}) is open there: its risk changes with the leverage` };
    // the owner's answer signs the card's hash: the agent's request AND the market, the leverage and the margin mode the owner is shown
    const actionHash = keccak256(stringToHex(canonical({ action: who.hash ?? null, offer, symbol: mk.symbol, leverage: lev, marginMode: mode })));
    const card = this.e.host.raiseCard(flight.no, { account: v.id, intent: { kind: "trade", symbol: mk.symbol, side: pos.side === "long" ? "buy" : "sell", qty: pos.qty }, usd: worth, reason: `${agent.name} asks to set leverage to ${lev}x on ${mk.name} — a position of ${qtyText(pos.qty)} ${mk.base} is open there`, why: "live", action: a as Extract<AgentAction, { type: "agentLiveLeverage" }>, actionHash, signer: who.signer, expiresAt: new Date(now + CARD_TTL_MS).toISOString(), offer });
    this.shownLeverage.set(card.id, { symbol: mk.symbol, leverage: lev, marginMode: mode });
    this.e.host.log({ kind: "action", venue: v.id, tool: "agentLiveLeverage", signer: who.signer, ...(who.envelope ? { envelope: who.envelope } : {}), outcome: "card", notionalUsd: worth, reason: `${card.id} · leverage ${lev}x on ${mk.name}`, flight: flight.no, intentId: card.id });
    return { ok: true, kind: "card", pending: true, card, flight: flight.no };
  }

  /** the owner approved an agent's leverage change: exactly what the card showed, judged again (the limit, the agents' cap, the venue) */
  async releaseLeverage(card: CardLike, who: { signer: string; agent: AgentKey }): Promise<Outcome> {
    const a = card.action as Extract<AgentAction, { type: "agentLiveLeverage" }>;
    const shown = this.shownLeverage.get(card.id);
    this.shownLeverage.delete(card.id);
    if (!shown) return no("E_ACCOUNT_REQUOTE", { message: "this card's leverage change is not known to this run of the account: the agent asks again" });
    return this.leverage({ venue: a.venue, symbol: shown.symbol, leverage: String(shown.leverage), marginMode: shown.marginMode }, { signer: who.signer, authority: "agent", agent: who.agent, hash: card.actionHash, card: card.id });
  }

  /** an order still open at a venue: a venue with one is not disconnected until it is done. One the account stopped following is not open
   * here: it is the venue's */
  openAt(venue: string): LiveOrder | undefined {
    return this.e.orders.find((o) => o.venue === venue && !DONE.has(o.status) && !o.unfollowed && !(o.walletTxs && !o.ref));
  }

  /** What became of the open orders: every open order asked of its venue at once, at most every ten seconds per order, each for at most
   * fifteen seconds. A venue that throws or does not answer is asked again later — less often each time it fails, and after a few failures
   * the order says so (its share of a limit stays held: the account does not guess it is gone). An answer that arrives after the order
   * changed is dropped. One sweep at a time: a sweep already under way is the answer to a second ask.
   *
   * A venue held back (a ban of this machine's address until the venue's time, its place rule or its edge for ten minutes) is not asked at
   * all, and its orders count no miss for it. Each venue is asked about one of its orders first, and about the rest only if that answer did
   * not hold it back: a banned address is not sent a burst of requests that each lengthen the ban */
  poll(): Promise<void> {
    return (this.sweep ??= this.sweepOnce().finally(() => (this.sweep = undefined)));
  }
  private sweep: Promise<void> | undefined;
  private readonly misses = new Map<string, number>();

  private async sweepOnce(): Promise<void> {
    const m = this.money();
    if (!m) return;
    const now = m.realNow();
    // the owner's cancels that could not reach a venue that refused this network, sent again once a check found it answering
    for (const venue of [...this.cancelAgain]) {
      const v = m.venue(venue);
      // not connected yet (waiting to come back after a restart), or held back: kept for when it is
      if (!v?.trader || this.heldAt(venue)) continue;
      this.cancelAgain.delete(venue);
      for (const o of this.e.orders.filter((x) => x.venue === venue && x.cancelWanted && x.ref)) await this.cancelWanted(o, v as LiveVenue & { trader: LiveTrader });
    }
    const due = this.e.orders.filter((o) => {
      if (DONE.has(o.status) || o.unfollowed || (o.walletTxs && !o.ref)) return false;
      if (this.heldAt(o.venue)) return false;
      const wait = POLL_MS * Math.min(30, 2 ** (this.misses.get(o.id) ?? 0));
      return now - (this.polled.get(o.id) ?? 0) >= wait;
    });
    const byVenue = new Map<string, LiveOrder[]>();
    for (const o of due) byVenue.set(o.venue, [...(byVenue.get(o.venue) ?? []), o]);
    await Promise.all([...byVenue.values()].map(async ([first, ...rest]) => {
      await this.ask(m, first!, now);
      await Promise.all(rest.map((o) => this.ask(m, o, now)));
    }));
  }

  /** one order, asked of its venue: how it stands — or, one the venue has not confirmed, whether it is there under the account's id */
  private async ask(m: LiveMoney, o: LiveOrder, now: number): Promise<void> {
    if (this.heldAt(o.venue)) return;
    this.polled.set(o.id, now);
    const v = m.venue(o.venue);
    if (!v?.trader) return;
    if (o.unconfirmed && !o.ref) {
      await this.lookFor(o, v.trader);
      return;
    }
    const before = o.updatedAt;
    const r = await this.asked(o.venue, o.venueName, () => v.trader!.status(o.ref, o.symbol), STATUS_MS);
    if (isRefusal(r)) {
      // an answer that holds the venue back is the hold's to tell, not a miss
      if (this.heldAt(o.venue)) return;
      const n = (this.misses.get(o.id) ?? 0) + 1;
      this.misses.set(o.id, n);
      if (n === 3) {
        o.note = `${o.venueName} has not said how this order stands (${r.message}): check it there`;
        this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: "unknown", venueOrderId: o.ref, reason: `${o.id} · ${o.note}` });
      }
      return;
    }
    this.misses.delete(o.id);
    if (o.updatedAt !== before || DONE.has(o.status)) return;
    const was = `${o.status}:${o.filledQty}:${o.qty}:${o.changing ? 1 : 0}`;
    this.apply(o, r, o.canceling ? `cancel asked of ${o.venueName}: waiting for it to say the order is gone` : "");
    if (`${o.status}:${o.filledQty}:${o.qty}:${o.changing ? 1 : 0}` === was) return;
    this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: o.status, venueOrderId: o.ref, reason: `${o.id} · ${o.note}` });
    this.giveBack(o);
    this.line(o);
    this.adoptExits(o, r.native);
  }

  /** a venue whose orders changed by themselves (a paper account's own look filled, triggered or ended one): its open orders are asked at
   * the next poll, not after their wait */
  dueNow(venue: string): void {
    for (const o of this.e.orders) if (o.venue === venue && !DONE.has(o.status)) this.polled.set(o.id, 0);
  }

  /** A BRACKET'S EXITS, as the venue placed them when the entry filled (a paper account's: OrderState.native.legs): each followed from now on
   * as an order of the account's own — its id, its line on the statement, polled until it is done, canceled through the door — named as
   * the exit of the entry it closes, by whoever placed the entry. One already followed is not taken twice */
  private adoptExits(parent: LiveOrder, native: unknown): void {
    const legs = (native as { legs?: unknown } | undefined)?.legs;
    if (!Array.isArray(legs) || parent.exitOf) return;
    const at = new Date(this.money()?.realNow() ?? Date.now()).toISOString();
    for (const raw of legs) {
      const l = raw as { ref?: unknown; clientId?: unknown; at?: unknown; type?: unknown; side?: unknown; qty?: unknown; status?: unknown; filledQty?: unknown; limitPrice?: unknown; stopPrice?: unknown; avgPrice?: unknown; feeUsd?: unknown; note?: unknown };
      if (typeof l.ref !== "string" || !l.ref || this.e.orders.some((x) => x.venue === parent.venue && x.ref === l.ref)) continue;
      if ((l.type !== "limit" && l.type !== "stop") || (l.side !== "buy" && l.side !== "sell") || !(typeof l.qty === "number" && l.qty > 0)) continue;
      const price = typeof l.limitPrice === "number" ? l.limitPrice : typeof l.stopPrice === "number" ? l.stopPrice : parent.price;
      const status = typeof l.status === "string" && ["pending", "open", "partial", "filled", "canceled", "rejected", "expired"].includes(l.status) ? (l.status as OrderStatus) : "open";
      const filledQty = typeof l.filledQty === "number" && l.filledQty > 0 ? l.filledQty : 0;
      // one that filled before it was followed, trimmed to what was left of its position: what filled is its size, as apply has it
      const qty = status === "filled" && filledQty > 0 && filledQty < l.qty - 1e-12 ? filledQty : l.qty;
      const exit: LiveOrder = {
        id: this.e.nextOrderId(),
        clientId: typeof l.clientId === "string" && l.clientId ? l.clientId : `${parent.clientId}-${l.type === "limit" ? "tp" : "sl"}`,
        at: typeof l.at === "string" ? l.at : at,
        venue: parent.venue,
        venueName: parent.venueName,
        symbol: parent.symbol,
        name: parent.name,
        kind: parent.kind,
        base: parent.base,
        side: l.side,
        type: l.type,
        qty,
        ...(typeof l.limitPrice === "number" ? { limitPrice: l.limitPrice } : {}),
        ...(typeof l.stopPrice === "number" ? { stopPrice: l.stopPrice } : {}),
        tif: "gtc",
        ...(parent.kind === "perp" ? { reduceOnly: true } : {}),
        ...(parent.contractSize !== undefined ? { contractSize: parent.contractSize } : {}),
        ...(parent.paper ? { paper: true as const } : {}),
        exitOf: { order: parent.id, kind: l.type === "limit" ? "take-profit" : "stop-loss" },
        price,
        usd: Number(notionalOf(parent, qty, price).toFixed(6)),
        status,
        filledQty,
        ...(typeof l.avgPrice === "number" ? { avgPrice: l.avgPrice } : {}),
        ...(typeof l.feeUsd === "number" ? { feeUsd: l.feeUsd } : {}),
        ref: l.ref,
        signer: parent.signer,
        authority: parent.authority,
        ...(parent.agent ? { agent: parent.agent } : {}),
        note: "",
        updatedAt: at,
        native: raw,
      };
      exit.note = `${exit.exitOf!.kind} of ${parent.id} · ${this.noteOf(exit)}`;
      this.e.orders.unshift(exit);
      this.polled.set(exit.id, this.money()?.realNow() ?? 0);
      this.e.host.log({ kind: "order", venue: exit.venue, tool: "live order", outcome: exit.status, venueOrderId: exit.ref, reason: `${exit.id} · ${parent.paper ? "paper" : "real money"} · ${exit.exitOf!.kind} of ${parent.id}, placed by ${parent.venueName} when it filled` });
      this.line(exit);
    }
  }

  /** An order whose answer was lost, looked for under the account's id (Extras.byClient). Found, it is followed as any other from here.
   * Shown as none for longer than an order takes to come through (UNSEEN_MS), nothing was placed: it is canceled and what it counted goes
   * back. Otherwise — too soon to believe a "none", a venue that cannot be asked that way, no answer — it stays as it is, counted, and after
   * a few looks its note asks the owner to look at the venue (the owner's cancel stops following it) */
  private async lookFor(o: LiveOrder, trader: LiveTrader): Promise<"found" | "none" | "unknown"> {
    const t = trader as Extras;
    const r = t.byClient ? await this.asked(o.venue, o.venueName, () => t.byClient!(o.clientId, o.symbol, o.type), STATUS_MS) : undefined;
    if (r !== undefined && r !== null && !isRefusal(r)) {
      this.misses.delete(o.id);
      this.apply(o, r, "");
      if (!o.ref) return "unknown";
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: o.status, venueOrderId: o.ref, reason: `${o.id} · ${o.venueName} shows it under the account's id: it was placed` });
      this.giveBack(o);
      this.line(o);
      return "found";
    }
    if (r === null && (this.money()?.realNow() ?? Date.now()) - Date.parse(o.at) >= UNSEEN_MS) {
      o.unconfirmed = undefined;
      this.apply(o, { ref: "", status: "canceled", filledQty: 0, native: { none: "under the account's id" } }, "");
      o.note = `${o.venueName} shows no order under the account's id: nothing was placed`;
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: o.status, reason: `${o.id} · ${o.note}` });
      this.giveBack(o);
      this.line(o);
      return "none";
    }
    if (r === null || (r !== undefined && isRefusal(r) && this.heldAt(o.venue))) return "unknown";
    const n = (this.misses.get(o.id) ?? 0) + 1;
    this.misses.set(o.id, n);
    if (n === 3) {
      o.note = `${o.venueName} has not shown whether it took this order${t.byClient ? "" : ` (it cannot be asked by the account's id ${o.clientId} from here)`}: look at its orders. What it counts on a limit stays counted until it is known, or until the owner stops following it`;
      this.e.host.log({ kind: "order", venue: o.venue, tool: "live order", outcome: "unconfirmed", reason: `${o.id} · ${o.note}` });
      this.line(o);
    }
    return "unknown";
  }
}

interface Who {
  signer: string;
  authority: "owner" | "agent";
  agent?: string | undefined;
  card?: string | undefined;
  action?: Hex | undefined;
  approval?: string | undefined;
  envelope?: Envelope | undefined;
  /** the owner's plan signed for this order (account/plans.ts), and that it opens or adds to a position at a paper account: kept on it */
  plan?: TradePlan | undefined;
  entry?: boolean | undefined;
}

/** A venue call that throws answers as a refusal, never as an exception through the door. A READ may also be given a time limit; a call that
 * places or cancels is not raced — a venue that is slow to answer may still have taken it, and an order the account stopped waiting for
 * would be an order it does not know about (the trader's own network timeout and its look-up by client id answer that) */
async function safely<T>(call: () => Promise<T | Refusal>, venue: string, name: string, ms?: number): Promise<T | Refusal> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (ms === undefined) return await call();
    return await Promise.race([call(), new Promise<Refusal>((resolve) => (timer = setTimeout(() => resolve(no("E_VENUE_UNREACHABLE", { venue, message: `${name} did not answer in time` })), ms)))]);
  } catch (err) {
    return isRefusal(err) ? err : no("E_VENUE_REJECTED", { venue, message: `${name} answered in a way the account could not read`, native: { error: String((err as Error)?.message ?? err).slice(0, 200) } });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** what the owner is shown before signing a close: the order it is (a sell of a long, a buy back of a short) and whether the server's cap
 * lets it go */
export interface CloseQuote {
  words: string;
  venue: string;
  venueName: string;
  symbol: string;
  name: string;
  side: Side;
  qty: number;
  /** the worst price the market order may fill at */
  worstPrice?: number;
  price: number;
  /** a sell: what it is worth now · a buy back: the most it may cost */
  worthUsd: number;
  capUsd: number;
  /** worth more than the most one order may be on this server: the door refuses it as it stands */
  overCap: boolean;
  why?: string;
  /** at a PAPER account: a rehearsal, no real money */
  paper?: true;
}

/** what the owner is shown before signing an order */
export interface OrderQuote {
  words: string;
  name: string;
  kind: MarketKind;
  base: string;
  quote: string;
  price: number;
  notionalUsd: number;
  /** a buy: the most it may cost · a sell: what it is worth now */
  maxUsd: number;
  worstPrice?: number;
  note?: string;
  capUsd: number;
  /** at a PAPER account: a rehearsal, no real money, and the cap does not apply */
  paper?: true;
  /** the price's own moment and where it is from, where the market says (Market.quoteAt, quoteFrom — every paper quote says both): the
   * ticket shows how old the price it was valued at is */
  quoteAt?: string;
  quoteFrom?: string;
  /** what the order would leave by the venue's own rule, where it says one before the order (LiveTrader.estimate): the fee at the price it is
   * valued at and its rate, and a perpetual's liquidation price as the order would leave the position, with the leverage it would stand at */
  feeUsd?: number;
  feeBps?: number;
  liquidationPrice?: number;
  leverage?: number;
  /** a share's market order out of its regular session: it waits for the open, and fills at the open's price, not at `price` — inside
   * `maxUsd` and `worstPrice` still, which are signed: an open past them cancels it */
  queued?: true;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** an agent's order is held to its limit's per-order line as it stands after any change: a change cannot grow one order past what one order may be */
function perOrder(spend: SpendApproval, maxUsd: number): Refusal | null {
  return micro(maxUsd.toFixed(6)) > spend.perPaymentMicro ? no("E_MANDATE_PER_ORDER_CAP", { message: `the order would be worth ${usd(maxUsd)}, more than the ${usd(spend.perPaymentMicro / 1e6)} an order the trading limit allows: a change cannot grow one order past it`, detail: { approval: spend.id, perPayment: spend.perPaymentMicro / 1e6, amount: Number(maxUsd.toFixed(6)) } }) : null;
}

/** an order's fields as the door reads them, from an owner's or an agent's instruction (the agent's optional ones absent = "") */
function fieldsOf(a: { venue: string; symbol: string; side: string; orderType: string; qty: string; usd?: string | undefined; limitPrice: string; stopPrice?: string | undefined; tif?: string | undefined; postOnly?: string | undefined; reduceOnly?: string | undefined; extendedHours?: string | undefined; trailPercent?: string | undefined; trailPrice?: string | undefined; takeProfit?: string | undefined; stopLoss?: string | undefined }): Fields {
  return { venue: text(a.venue), symbol: text(a.symbol), side: text(a.side), orderType: text(a.orderType), qty: text(a.qty), usd: text(a.usd), limitPrice: text(a.limitPrice), stopPrice: text(a.stopPrice), tif: text(a.tif), postOnly: text(a.postOnly), reduceOnly: text(a.reduceOnly), extendedHours: text(a.extendedHours), trailPercent: text(a.trailPercent), trailPrice: text(a.trailPrice), takeProfit: text(a.takeProfit), stopLoss: text(a.stopLoss) };
}

/** what the venue is sent for a plan */
function requestOf(p: Plan, clientId: string): OrderRequest {
  return { symbol: p.m.symbol, side: p.side, type: p.type, qty: p.qty, ...(p.limitPrice !== undefined ? { limitPrice: p.limitPrice } : {}), ...(p.worstPrice !== undefined ? { worstPrice: p.worstPrice } : {}), ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}), ...(p.tif ? { tif: p.tif } : {}), ...(p.postOnly ? { postOnly: true } : {}), ...(p.reduceOnly ? { reduceOnly: true } : {}), ...(p.extendedHours ? { extendedHours: true } : {}), ...(p.trailPercent !== undefined ? { trailPercent: p.trailPercent } : {}), ...(p.trailPrice !== undefined ? { trailPrice: p.trailPrice } : {}), ...(p.takeProfit !== undefined ? { takeProfit: p.takeProfit } : {}), ...(p.stopLoss !== undefined ? { stopLoss: p.stopLoss } : {}), clientId };
}

/** an order as it was placed, for a venue asked to change or rebuild it */
function requestOfOrder(o: LiveOrder): OrderRequest {
  return { symbol: o.symbol, side: o.side, type: o.type, qty: o.qty, ...(o.limitPrice !== undefined ? { limitPrice: o.limitPrice } : {}), ...(o.worstPrice !== undefined ? { worstPrice: o.worstPrice } : {}), ...(o.stopPrice !== undefined ? { stopPrice: o.stopPrice } : {}), ...(o.tif ? { tif: o.tif } : {}), ...(o.postOnly ? { postOnly: true } : {}), ...(o.reduceOnly ? { reduceOnly: true } : {}), ...(o.extendedHours ? { extendedHours: true } : {}), ...(o.trailPercent !== undefined ? { trailPercent: o.trailPercent } : {}), ...(o.trailPrice !== undefined ? { trailPrice: o.trailPrice } : {}), ...(o.takeProfit !== undefined ? { takeProfit: o.takeProfit } : {}), ...(o.stopLoss !== undefined ? { stopLoss: o.stopLoss } : {}), clientId: o.clientId };
}
