/** The STATEMENT: every transaction at the user's real venues, one line each, the way a bank statement lists them.
 *
 * A line is written to the ledger each time a transaction changes (placed, part filled, filled, canceled; sent, landed, failed), as a row of
 * kind "statement" that carries the line itself. The ledger files outlive the process, so the statement does too: it is read back from every
 * ledger in the account's home, and the last line written for a transaction is the one shown. Nothing here moves anything.
 */
import { notionalOf } from "../live/trade.ts";
import type { LiveOrder } from "./live-orders.ts";
import type { Payment } from "./payments.ts";

/** how a worked order is worked, from the way as signed (live/trade.ts algoText): "a twap over 30 min in 6 slices", "an iceberg, 0.25 shown at a time" */
export function workedWords(algo: string): string {
  const m = /^(twap|vwap)\s+(\d+)m\s+(\d+)$/.exec(algo.trim());
  if (m) return `a ${m[1]} over ${m[2]} min in ${m[3]} slices`;
  const i = /^iceberg\s+(\S+)$/.exec(algo.trim());
  return i ? `an iceberg, ${i[1]} shown at a time` : algo.trim();
}

export interface StatementLine {
  /** one transaction, whichever run of the account wrote it: an order's client id, or a payment's run and id */
  key: string;
  /** the account's own id for it in the run that made it (ord-0001, pay-0001) */
  id: string;
  at: string;
  /** when it was last seen to change */
  updatedAt: string;
  /** an order · a movement of money · money put into a venue's earn product or taken back out (account/live-earn.ts) */
  type: "trade" | "transfer" | "earn";
  /** buy · sell · withdraw · deposit · send · transfer · swap · bridge */
  kind: string;
  account: string;
  accountName: string;
  /** where the money went, for a transfer */
  to?: string | undefined;
  toName?: string | undefined;
  description: string;
  /** the dollars of it: what a trade has filled for (nothing, while nothing has filled); what a transfer moved. A buy is money out
   * (negative), a sell money in; a transfer between the user's own places is neither, and is shown as it is */
  amountUsd: number;
  /** a trade: what the whole order is worth, at its limit or the price it was valued at */
  worthUsd?: number | undefined;
  feeUsd?: number | undefined;
  /** a close: what it realised, where its venue says it (a paper account's: a perpetual reduced at its price, a holding sold less its fee
   * and what that part cost) — the trade's closed P&L */
  realizedUsd?: number | undefined;
  status: string;
  /** who did it: you, or an agent — on your yes, or inside its limit */
  by: string;
  /** where an agent did it: its key's address, and its name on the account */
  agent?: string | undefined;
  agentName?: string | undefined;
  /** the venue's id for it, or the transaction's hash */
  ref?: string | undefined;
  /** at a PAPER account (the venue's own test environment): a rehearsal, no real money in it */
  paper?: true | undefined;
}

const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

/** A price (or a trail, a take-profit, a stop) as a person reads it in a sentence the server writes: grouped the en-US way, at the figure's
 * own places (at most ten), trailing zeros dropped — 63226.6 is "63,226.6", 0.00001234 is "0.00001234", 66000 is "66,000". Only for words:
 * a value that is signed, hashed, sent to a venue or read back by code keeps plain() (live/trade.ts), which never groups. The statement's
 * lines, the account's order notes and refusals (live-orders.ts) write their prices with it */
export function figure(x: number): string {
  if (!Number.isFinite(x)) return "0";
  // -0 and a negative that rounds to nothing read as 0, as plain() writes them
  const s = x.toLocaleString("en-US", { maximumFractionDigits: 10, useGrouping: true });
  return s === "-0" ? "0" : s;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** what a close realised, as its venue's answer says it (a paper account's state: native.realizedUsd), to the cent */
const realizedOf = (native: unknown): number | undefined => {
  const r = (native as { realizedUsd?: unknown } | null | undefined)?.realizedUsd;
  return typeof r === "number" && Number.isFinite(r) ? Number(r.toFixed(2)) : undefined;
};
/** an order, as one line */
export function orderLine(o: LiveOrder, agentName: (address: string) => string): StatementLine {
  const filled = o.filledQty > 0 ? notionalOf(o, o.filledQty, o.avgPrice ?? o.price) : 0;
  const sign = o.side === "buy" ? -1 : 1;
  const done = o.filledQty > 0 && o.filledQty < o.qty ? ` · ${qty(o.filledQty)} of ${qty(o.qty)} filled` : "";
  // one fixed shape, its prices grouped (figure): "Buy 0.5 SOL · SOL / USDT · limit 142.44 · at 141.9 · 0.2 of 0.5 filled",
  // "Sell 0.002 BTC · BTC / USDT · limit 63,226.6". The Trade terminal's history reads an order it does not have back from these words
  // (ui/terminal.js ttOrderRec), so a figure there may carry commas
  return {
    key: `order:${o.clientId}`,
    id: o.id,
    at: o.at,
    updatedAt: o.updatedAt,
    type: "trade",
    kind: o.side,
    account: o.venue,
    accountName: o.venueName,
    description: `${cap(o.side)} ${qty(o.qty)} ${o.base}${o.name && o.name !== o.base ? ` · ${o.name}` : ""} · ${o.type === "limit" ? `limit ${figure(o.limitPrice ?? 0)}` : o.type === "stop" ? `stop at ${figure(o.stopPrice ?? 0)}` : o.type === "stop_limit" ? `stop at ${figure(o.stopPrice ?? 0)}, limit ${figure(o.limitPrice ?? 0)}` : o.type === "trailing_stop" ? `trailing stop ${o.trailPercent !== undefined ? `${figure(o.trailPercent)}%` : figure(o.trailPrice ?? 0)}` : "market"}${o.exitOf ? ` · ${o.exitOf.kind} of ${o.exitOf.order}` : ""}${o.takeProfit !== undefined || o.stopLoss !== undefined ? ` · exits ${[o.takeProfit !== undefined ? `take-profit ${figure(o.takeProfit)}` : "", o.stopLoss !== undefined ? `stop-loss ${figure(o.stopLoss)}` : ""].filter(Boolean).join(", ")}` : ""}${o.algo ? ` · worked as ${workedWords(o.algo)}` : ""}${o.avgPrice ? ` · at ${figure(Number(o.avgPrice.toPrecision(10)))}` : ""}${done}`,
    amountUsd: Number((sign * filled).toFixed(2)) || 0,
    worthUsd: Number(notionalOf(o, o.qty, o.limitPrice ?? o.price).toFixed(2)),
    ...(o.feeUsd !== undefined ? { feeUsd: o.feeUsd } : {}),
    ...(realizedOf(o.native) !== undefined ? { realizedUsd: realizedOf(o.native) } : {}),
    // an order the account stopped following says so: its venue did not come back after a restart and the owner asked to cancel it — or the
    // owner let it go when the venue refused this network's cancel, or never confirmed the order (its note says which)
    status: o.unfollowed ? (!o.note || o.note.startsWith("not followed since a restart") ? "not followed since a restart" : "not followed") : o.walletTxs && !o.ref && o.status === "pending" ? "waiting for wallet" : o.status,
    // a bracket's exit was placed by the venue when its entry filled: it went through no limit and no card of its own, so it is named as the
    // exit of the entry it closes (that entry's line says how the agent placed it)
    by: o.authority === "agent" ? `${agentName(o.agent ?? "")}, ${o.exitOf ? `${o.exitOf.kind} of ${o.exitOf.order}` : o.card ? "approved by you" : "inside its limit"}` : "You",
    ...(o.authority === "agent" && o.agent ? { agent: o.agent, agentName: agentName(o.agent) } : {}),
    ...(o.ref ? { ref: o.ref } : {}),
    ...(o.paper ? { paper: true as const } : {}),
  };
}

/** a movement of real money, as one line */
export function paymentLine(p: Payment, run: string, name: (venue: string) => string, agentName: (address: string) => string): StatementLine {
  // what the venue was asked to do: withdraw, send, transfer, swap, bridge
  const kind = p.live?.kind ?? p.kind;
  const leg = p.legs[0];
  const where = p.from === p.to ? (leg?.fromLedger ? ` · ${leg.fromLedger} → ${leg.toLedger}` : "") : ` · ${name(p.from)} → ${name(p.to)}`;
  return {
    key: `payment:${run}:${p.id}`,
    id: p.id,
    at: p.at,
    updatedAt: p.settledAt ?? p.at,
    type: "transfer",
    kind,
    account: p.from,
    accountName: name(p.from),
    ...(p.to !== p.from ? { to: p.to, toName: name(p.to) } : {}),
    description: `${cap(kind)} ${p.amountUsd} ${p.sourceToken}${p.token !== p.sourceToken ? ` → ${p.token}` : ""}${where}${p.live?.network ? ` · ${p.live.network}${p.live.toNetwork ? ` → ${p.live.toNetwork}` : ""}` : ""}${p.live?.tool ? ` · via ${p.live.tool}` : ""}`,
    amountUsd: Number(p.amountUsd.toFixed(2)),
    // a fee only once the money has moved; a bridge's is what it really cost: what did not arrive, or its quoted fee if that was more
    ...(p.status === "settled" && p.feeUsd ? { feeUsd: p.live?.kind === "bridge" ? Number(Math.max(p.feeUsd, p.amountUsd - p.receiveUsd).toFixed(2)) : p.feeUsd } : {}),
    status: p.status === "authorized" ? "waiting for wallet" : p.status,
    by: p.authority === "agent" ? `${agentName(p.agent ?? "")}, ${p.card ? "approved by you" : "inside its limit"}` : "You",
    ...(p.authority === "agent" && p.agent ? { agent: p.agent, agentName: agentName(p.agent) } : {}),
    ...(p.live?.txHash ? { ref: p.live.txHash } : leg?.ref ? { ref: leg.ref } : {}),
  };
}

/** A fill a paper account the account keeps itself made with no order of the account's (live/paper.ts) — a liquidation, an event contract's
 * settlement — as one line: it went through no door, so it is read from the book */
export function paperFillLine(f: { venue: string; venueName: string; ref: string; clientId: string; symbol: string; name: string; base: string; side: "buy" | "sell"; type: string; qty: number; avgPrice: number; feeUsd: number; at: string; filledAt: string; note?: string | undefined; realizedUsd?: number | undefined }): StatementLine {
  const sign = f.side === "buy" ? -1 : 1;
  const amount = f.qty * f.avgPrice;
  const what = f.clientId.startsWith("liquidation-") ? "liquidated" : f.clientId.startsWith("settlement-") ? "settled" : f.type;
  return {
    key: `paper:${f.venue}:${f.ref}`,
    id: f.ref,
    at: f.filledAt,
    updatedAt: f.filledAt,
    type: "trade",
    kind: f.side,
    account: f.venue,
    accountName: f.venueName,
    description: `${cap(f.side)} ${qty(f.qty)} ${f.base}${f.name && f.name !== f.base ? ` · ${f.name}` : ""} · ${what} · at ${figure(Number(f.avgPrice.toPrecision(10)))}${f.note ? ` · ${f.note}` : ""}`,
    amountUsd: Number((sign * amount).toFixed(2)) || 0,
    worthUsd: Number(amount.toFixed(2)),
    feeUsd: f.feeUsd,
    ...(realizedOf(f) !== undefined ? { realizedUsd: realizedOf(f) } : {}),
    status: "filled",
    by: "The paper account",
    ref: f.ref,
    paper: true,
  };
}

/** the last line written for each transaction, newest first */
export function fold(lines: Iterable<StatementLine>): StatementLine[] {
  const last = new Map<string, { line: StatementLine; first: number }>();
  let n = 0;
  // a transaction keeps the place it first appeared in: two started in the same millisecond stay in the order they were started
  for (const l of lines) last.set(l.key, { line: l, first: last.get(l.key)?.first ?? n++ });
  return [...last.values()].sort((a, b) => (a.line.at < b.line.at ? 1 : a.line.at > b.line.at ? -1 : b.first - a.first)).map((x) => x.line);
}
