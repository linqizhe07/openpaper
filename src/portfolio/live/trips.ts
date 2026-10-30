/** ROUND TRIPS: a market held from the fill that opened it from nothing to the fill that brought it back to nothing — as a paper book keeps
 * it while it is open (PaperBook.trips) and tells it once it is closed (PaperChange.trips), and as the account's journal keeps every one of
 * them (account/journal.ts). Nothing here reads a clock, a file or the network: the paper account (live/paper.ts) hands it each fill as it
 * is recorded, each price it sees a held market at, the bars it judges a backtest's time against, and the funding it settles; this keeps
 * the sums and the extremes, and says what came of the trip once it is closed.
 *
 *   the side     long where the first fill bought, short where it sold (a perpetual; a coin, a share or a contract is only ever long)
 *   entry, exit  the fills that added to it and those that took from it, each at their average price
 *   gross        what was sold less what was bought, at the fills' prices: with nothing left held, the price's result alone
 *   net          gross less the fees and the funding paid (funding received counts for it)
 *   MAE, MFE     the furthest the price went against it and for it while it was open, in percent from its entry's average: its fills,
 *                every price the book saw it at, and in a backtest the bars it was judged against while it stayed open — never a bar's
 *                range past the fill that closed it (the bar a stop filled in counts at the stop's price). Where it was added to, the
 *                extremes before the add are measured from the average it came to
 *   how it ended a bracket's take-profit or stop-loss, a liquidation, a settlement, or an order that closed it (the owner's, an agent's)
 *
 * A market the book held before it kept its trips (a book from before them) is left out until it is held from nothing again: what it was
 * bought at and when is not known. */
import type { MarketKind, Side } from "./trade.ts";

export type TripEnd = "take-profit" | "stop-loss" | "liquidated" | "settled" | "closed";

/** a trip still open, as the book keeps it */
export interface OpenTrip {
  symbol: string;
  kind: MarketKind;
  side: "long" | "short";
  openedAt: string;
  /** the order that opened it: its ref in the book and the client id the account gave it */
  openRef: string;
  openClientId?: string | undefined;
  /** its bracket, as the order that opened it asked: the take-profit and the stop-loss, as prices */
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  boughtQty: number;
  boughtUsd: number;
  soldQty: number;
  soldUsd: number;
  feesUsd: number;
  fundingUsd: number;
  /** the most it held at once, in units */
  peakQty: number;
  hi: number;
  lo: number;
  fills: number;
}

/** a trip closed: what the journal keeps of it */
export interface ClosedTrip {
  symbol: string;
  kind: MarketKind;
  side: "long" | "short";
  openedAt: string;
  closedAt: string;
  hours: number;
  openRef: string;
  openClientId?: string | undefined;
  closeRef: string;
  closeClientId?: string | undefined;
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  /** the most it held at once, in units */
  qty: number;
  entryPrice: number;
  exitPrice: number;
  /** what the entry fills came to, in dollars */
  entryUsd: number;
  grossUsd: number;
  feesUsd: number;
  fundingUsd: number;
  netUsd: number;
  /** the net over what the entry came to, in percent */
  returnPct: number;
  /** the furthest against it (zero or below) and for it (zero or above), in percent from the entry's average */
  maePct: number;
  mfePct: number;
  hi: number;
  lo: number;
  fills: number;
  end: TripEnd;
}

/** a fill as a trip takes it: what the book recorded, the client id of its order, its bracket where it opens a trip, how it ended one */
export interface TripFill {
  symbol: string;
  kind: MarketKind;
  side: Side;
  qty: number;
  price: number;
  feeUsd: number;
  at: string;
  ref: string;
  clientId?: string | undefined;
  takeProfit?: number | undefined;
  stopLoss?: number | undefined;
  end?: TripEnd | undefined;
}

/** less than this many units held is nothing held (the book rounds sizes to 12 places) */
const NOTHING = 1e-12;
const r = (x: number, places: number): number => (Number.isFinite(x) ? Number(x.toFixed(places)) : 0);

/** The trip a fill makes, given what the market held before it and after it (signed: a short below zero): opened from nothing, added to or
 * taken from, or closed — the closed trip when this fill closed it. A fill in a market held before any trip of it was kept opens nothing */
export function tripFill(trips: Record<string, OpenTrip>, f: TripFill, before: number, after: number): ClosedTrip | undefined {
  let t = trips[f.symbol];
  if (!t) {
    if (Math.abs(before) > NOTHING || Math.abs(after) <= NOTHING) return undefined;
    t = { symbol: f.symbol, kind: f.kind, side: after > 0 ? "long" : "short", openedAt: f.at, openRef: f.ref, ...(f.clientId ? { openClientId: f.clientId } : {}), ...(f.takeProfit !== undefined ? { takeProfit: f.takeProfit } : {}), ...(f.stopLoss !== undefined ? { stopLoss: f.stopLoss } : {}), boughtQty: 0, boughtUsd: 0, soldQty: 0, soldUsd: 0, feesUsd: 0, fundingUsd: 0, peakQty: 0, hi: f.price, lo: f.price, fills: 0 };
    trips[f.symbol] = t;
  }
  // the dollars kept whole, not rounded: an average from rounded sums can land past the extremes its own fills set
  if (f.side === "buy") {
    t.boughtQty = r(t.boughtQty + f.qty, 12);
    t.boughtUsd += f.qty * f.price;
  } else {
    t.soldQty = r(t.soldQty + f.qty, 12);
    t.soldUsd += f.qty * f.price;
  }
  t.feesUsd += f.feeUsd;
  t.fills++;
  t.peakQty = Math.max(t.peakQty, Math.abs(after));
  tripPrice(trips, f.symbol, f.price);
  if (Math.abs(after) > NOTHING) return undefined;
  delete trips[f.symbol];
  return closeOf(t, f);
}

/** a price the book saw a held market at: the trip's extremes widened to it (zero is a price only an event contract's settlement pays) */
export function tripPrice(trips: Record<string, OpenTrip>, symbol: string, price: number): void {
  const t = trips[symbol];
  if (!t || !Number.isFinite(price) || price < 0 || (price === 0 && t.kind !== "event")) return;
  if (price > t.hi) t.hi = price;
  if (price < t.lo) t.lo = price;
}

/** a bar the book judged a held market against, and the trip still open after it: its whole range */
export function tripRange(trips: Record<string, OpenTrip>, symbol: string, low: number, high: number): void {
  tripPrice(trips, symbol, low);
  tripPrice(trips, symbol, high);
}

/** an hour's funding settled out of the trip's margin (paid above zero, received below) */
export function tripFunding(trips: Record<string, OpenTrip>, symbol: string, usd: number): void {
  const t = trips[symbol];
  if (t && Number.isFinite(usd)) t.fundingUsd += usd;
}

function closeOf(t: OpenTrip, f: TripFill): ClosedTrip {
  const long = t.side === "long";
  const entryQty = long ? t.boughtQty : t.soldQty;
  const entryUsd = long ? t.boughtUsd : t.soldUsd;
  const exitQty = long ? t.soldQty : t.boughtQty;
  const exitUsd = long ? t.soldUsd : t.boughtUsd;
  const entryPrice = entryQty > 0 ? entryUsd / entryQty : f.price;
  const exitPrice = exitQty > 0 ? exitUsd / exitQty : f.price;
  const grossUsd = t.soldUsd - t.boughtUsd;
  const netUsd = grossUsd - t.feesUsd - t.fundingUsd;
  const against = long ? t.lo / entryPrice - 1 : 1 - t.hi / entryPrice;
  const towards = long ? t.hi / entryPrice - 1 : 1 - t.lo / entryPrice;
  return {
    symbol: t.symbol,
    kind: t.kind,
    side: t.side,
    openedAt: t.openedAt,
    closedAt: f.at,
    hours: r((Date.parse(f.at) - Date.parse(t.openedAt)) / 3_600_000, 4),
    openRef: t.openRef,
    ...(t.openClientId ? { openClientId: t.openClientId } : {}),
    closeRef: f.ref,
    ...(f.clientId ? { closeClientId: f.clientId } : {}),
    ...(t.takeProfit !== undefined ? { takeProfit: t.takeProfit } : {}),
    ...(t.stopLoss !== undefined ? { stopLoss: t.stopLoss } : {}),
    qty: r(t.peakQty, 12),
    entryPrice: r(entryPrice, 10),
    exitPrice: r(exitPrice, 10),
    entryUsd: r(entryUsd, 6),
    grossUsd: r(grossUsd, 6),
    feesUsd: r(t.feesUsd, 6),
    fundingUsd: r(t.fundingUsd, 6),
    netUsd: r(netUsd, 6),
    returnPct: r(entryUsd > 0 ? (netUsd / entryUsd) * 100 : 0, 4),
    maePct: r(Math.min(0, against) * 100, 4),
    mfePct: r(Math.max(0, towards) * 100, 4),
    hi: t.hi,
    lo: t.lo,
    fills: t.fills,
    end: f.end ?? "closed",
  };
}
