/** THE RULE STRUCTURE OF THE EVENT CONTRACTS: where two markets' rules bind their prices to each other, and whether the books honour it.
 *
 * Markets on one exchange, and the same question on two, are not independent bets. Their rules — plain words, a few thousand of them
 * across the venues — make some of them imply others (an IPO confirmed before December 1 is one confirmed before January 1; the S&P
 * closing above 7,400 is it closing above 7,375), some exclude each other (the index closes in one price range only; the Fed cuts by 25
 * bps or holds, never both), and some the same question twice (Kalshi's "Anthropic confirms an IPO before Dec 1, 2026" and Polymarket US's
 * "Anthropic IPO Officially Confirmed By November 30, 2026"), settled by different rules and sources. Each relation is a constraint on
 * prices: P(A) ≤ P(B) where A implies B; P(A) + P(B) ≤ 1 where they exclude each other, and = 1 over a set that covers every outcome;
 * P(A) = P(B) for one question twice. A book that breaks one — a bid on A above the ask on B where A implies B — is the deviation this
 * file measures, net of each venue's taker fee at those prices, and flags when it is worth at least a tick.
 *
 * Nothing here is estimated or judged. Every relation is read from the venues' own structure, in two layers:
 *   · DETERMINISTIC, always on (catalogueOf): the markets of one event that exclude each other (Kalshi's `mutually_exclusive` events, a
 *     Polymarket US market whose rules say "Only one outcome in this market will resolve to Yes"); a ladder of thresholds in one event
 *     (Kalshi's `strike_type` greater or less with `floor_strike` / `cap_strike`; Polymarket US's "Above $89,999.99" … "Above
 *     $149,999.99"); a chain of dates in one event ("Before Dec 1, 2026", "By November 30, 2026"); and THE SAME SHAPE read from two
 *     markets' rule sentences — the same comparison, the same threshold, the same last day, and rule sentences that share most of their
 *     words (shapeOf, topicOf) — across venues, or across the events of one venue;
 *   · A BRAIN, optional and off unless a caller brings one (pairByBrain): a model shown the contracts' words may pair what the shapes
 *     missed. Its pairs are CANDIDATES — listed as such, never priced, never scored, never a lead. The lab's rule that no model judgement
 *     enters a score holds here: a candidate carries no deviation, and nothing downstream may compute one for it.
 *
 * The deviation is arithmetic on the venues' own best bid and ask (the YES leg's), their published fee formulas (FeeModel: Kalshi's
 * general fee of 7% × p × (1 − p) a contract, the series' fee_multiplier on it, rounded up to the cent on each order — docs.kalshi.com
 * get-series fee_type, kalshi.com's fee schedule; Polymarket US's 0.0695 × p × (1 − p), each market's own feeCoefficient, rounded to
 * the nearest cent — docs.polymarket.us/fees, effective 2026-10-19) and their ticks: a deviation under one tick is not one anyone can take.
 * Taker fees both ways: the number is what hitting both books now would leave. Paper first: the desk may take a flagged relation as a lead
 * only at a paper account, and nothing here places an order. Polymarket.com is not a venue here (its terms exclude where this account
 * runs): Kalshi and Polymarket US only, read keyless (public-markets.ts, PublicSource.contracts).
 */
import { createHash } from "node:crypto";

type Rec = Record<string, unknown>;

/** the questions Kalshi's short list of series (categories.ts KALSHI_SERIES) is about, in the words Polymarket US's search answers to:
 * what the scan asks Polymarket US for, so that the two venues' contracts on one question are read side by side */
export const PMUS_STRUCTURE_SEARCHES: readonly string[] = ["fed rate", "cpi", "gdp", "jobs report", "unemployment", "bitcoin", "ethereum", "s&p 500", "nasdaq", "anthropic", "openai", "trump approval"];

/** a venue's trading fee on an event contract, as it publishes it: quadratic in the price */
export interface FeeModel {
  /** `quadratic`: fee = rate × C × p × (1 − p); `unread`: a series whose fee Kalshi keeps in a table this account has not read (its "flat"
   * fee type) — the general quadratic rate stands in, and `words` say so */
  kind: "quadratic" | "unread";
  /** the taker's rate: 0.07 × the series' multiplier at Kalshi, the market's feeCoefficient (0.0695) at Polymarket US */
  rate: number;
  /** what a maker pays, as a fraction of the taker's fee: 0, 0.25 or 0.5 at Kalshi by the series' fee type, 0 at Polymarket US */
  maker: number;
  /** how the venue rounds an order's fee: Kalshi up to the cent, Polymarket US to the nearest cent */
  rounding: "up-cent" | "nearest-cent";
  words: string;
}

/** who settles a contract and when */
export interface Settles {
  sources: string[];
  /** when the venue expects to settle it (Kalshi's expected_expiration_time; Polymarket US's end date) */
  at?: string | undefined;
}

/** how a market's strike is written, where the venue writes it as numbers (Kalshi's fields; Polymarket US's words read into the same) */
export interface Strike {
  type: "greater" | "greater_or_equal" | "less" | "less_or_equal" | "between" | "custom";
  floor?: number | undefined;
  cap?: number | undefined;
  custom?: Record<string, string> | undefined;
}

/** one event contract as the scan reads it: the YES leg, its rules, its event, its book, its fee */
export interface EventContract {
  /** the venue the account orders it at: the owner's id for it once connected (`kalshi`, `polymarket-us`), the public source's otherwise */
  venue: string;
  venueName: string;
  /** the connection that trades it (`live:kalshi`), for a page to offer connecting */
  connector?: string | undefined;
  /** the owner has connected this venue */
  connected?: boolean | undefined;
  /** the YES leg, exactly as the venue's trader names it (`KXINX-26NOV06H1600-T7350:YES`, `<slug>:YES`) */
  symbol: string;
  /** the venue's own id for the market: Kalshi's ticker, Polymarket US's slug */
  id: string;
  event: { id: string; title: string; exclusive?: boolean | undefined; series?: string | undefined };
  /** the whole question */
  question: string;
  /** the market's own short words inside its event ("Before Dec 1, 2026", "7,350 to 7,374.9999") */
  words: string;
  /** the rule that decides it, in the venue's words (Kalshi's rules_primary; Polymarket US's description) */
  rules: string;
  rulesMore?: string | undefined;
  strike?: Strike | undefined;
  /** when the venue opened it, where it says (a touch market counts only what happens after it was made) */
  since?: string | undefined;
  closeTime?: string | undefined;
  settles: Settles;
  /** the YES leg's best bid and ask now, dollars */
  bid?: number | undefined;
  ask?: number | undefined;
  /** the smallest price step */
  tick: number;
  fee: FeeModel;
  open: boolean;
  category?: string | undefined;
}

export type RelationKind = "same" | "implies" | "exclusive";
/** which reading found it: the markets of one event, a ladder of thresholds in one, a chain of dates in one, the same shape read from the
 * rules of two markets, or a brain's pairing (a candidate) */
export type RelationHow = "event" | "ladder" | "dates" | "shape" | "brain";

export interface RelationLeg {
  venue: string;
  venueName: string;
  connector?: string | undefined;
  connected?: boolean | undefined;
  symbol: string;
  id: string;
  question: string;
  words: string;
  bid?: number | undefined;
  ask?: number | undefined;
  tick: number;
  closeTime?: string | undefined;
  settles: Settles;
  fee: string;
}

/** what taking both sides of a relation now would leave, a contract: the constraint's overshoot before fees (`gross`, negative while the
 * books honour it), the taker fees at those prices, and what is left */
export interface Deviation {
  gross: number;
  fees: number;
  net: number;
  /** net is at least the threshold (one tick, unless a caller sets a dollar figure) */
  flagged: boolean;
  /** the orders that take it, in words */
  trade: string;
  legs: Array<{ symbol: string; side: "buy" | "sell"; price: number; fee: number }>;
}

export interface Relation {
  /** stable across reads: a hash of the kind and the legs' venues and ids */
  id: string;
  kind: RelationKind;
  how: RelationHow;
  /** `implies`: legs[0] implies legs[1] (P(0) ≤ P(1)); `same`: two legs, one question; `exclusive`: the whole set, at most one resolves YES */
  legs: RelationLeg[];
  /** an exclusive set that covers every outcome (price ranges that tile the line): exactly one resolves YES, so the asks are bound too */
  exhaustive?: boolean | undefined;
  /** where the two rules differ, in their own words (one sentence a side at most) */
  rulesDiff: string;
  /** who settles each leg and when */
  settles: string;
  /** a brain's pairing: a candidate, never priced — no deviation is computed for it, and `why` is the model's own sentence */
  candidate?: true | undefined;
  why?: string | undefined;
  deviation?: Deviation | undefined;
}

export interface StructureScan {
  asOf: string;
  contracts: number;
  venues: Array<{ venue: string; venueName: string; contracts: number; connected?: boolean | undefined }>;
  counts: { same: number; implies: number; exclusive: number; candidates: number };
  /** the net a deviation must reach to be flagged: a dollar figure, or one tick of its legs */
  minNet: number | "tick";
  flagged: number;
  /** the flagged relations first, by what they leave; then the rest, where `all` was asked; cut to `limit` */
  relations: Relation[];
  notes: string[];
}

export interface ScanOptions {
  now?: number | undefined;
  /** every relation, not only the flagged ones (default false) */
  all?: boolean | undefined;
  /** at most this many relations (60) */
  limit?: number | undefined;
  /** the net a deviation must reach to be flagged, dollars a contract; absent: one tick of its legs */
  minNet?: number | undefined;
  /** a brain's candidates, already made (pairByBrain): listed after everything else, never priced */
  candidates?: Relation[] | undefined;
}

// ---- fees ----------------------------------------------------------------------------------------------------------------------------

/** Kalshi's fee for a series: fee_type and fee_multiplier (an event may override both). The general trading fee is 7% × C × p × (1 − p),
 * rounded up to the cent on each order; a series "with maker fees" charges makers a quarter of it, "with combo maker fees" half; a "flat"
 * series keeps its fee in Kalshi's specific table, which this account has not read — said so, the general rate standing in */
export function kalshiFee(series: Rec | undefined, event: Rec | undefined): FeeModel {
  const type = String(event?.fee_type_override ?? series?.fee_type ?? "quadratic");
  const m = Number(event?.fee_multiplier_override ?? series?.fee_multiplier ?? 1);
  const mult = Number.isFinite(m) && m > 0 ? m : 1;
  const rate = round(0.07 * mult, 6);
  const maker = type === "quadratic_with_maker_fees" ? 0.25 : type === "quadratic_with_combo_maker_fees" ? 0.5 : 0;
  if (type === "flat") return { kind: "unread", rate, maker: 0, rounding: "up-cent", words: `Kalshi: a flat-fee series whose fee table this account has not read — its general ${pct(rate)} × p × (1 − p) a contract stands in here` };
  return { kind: "quadratic", rate, maker, rounding: "up-cent", words: `Kalshi: ${pct(rate)} × p × (1 − p) a contract, rounded up to the cent on each order${maker ? `; a maker pays ${maker * 100}% of it` : "; makers pay none"}` };
}

/** Polymarket US's fee: its standard taker coefficient 0.0695 (each market says its own, feeCoefficient), fee = Θ × C × p × (1 − p),
 * rounded to the nearest cent; a maker pays none (and in its higher tiers is paid a rebate) */
export function pmusFee(m: Rec | undefined): FeeModel {
  const c = Number(m?.feeCoefficient);
  const rate = Number.isFinite(c) && c > 0 ? c : 0.0695;
  return { kind: "quadratic", rate, maker: 0, rounding: "nearest-cent", words: `Polymarket US: ${pct(rate)} × p × (1 − p) a contract, rounded to the nearest cent on each order; makers pay none` };
}

/** the taker's fee on one contract at price p, before the venue's rounding of the whole order */
export const feeAt = (fee: FeeModel, p: number): number => round(fee.rate * p * (1 - p), 6);

const pct = (r: number): string => `${Number((r * 100).toFixed(3))}%`;
const round = (x: number, places = 6): number => Number(x.toFixed(places));
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const fin = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** an event contract's price: more than 0 and less than 1 (an empty side of Kalshi's book shows as 0 or 1) */
const px = (v: unknown): number | undefined => {
  const n = fin(v);
  return n !== undefined && n > 0 && n < 1 ? n : undefined;
};
/** Kalshi writes emphasis into some titles ("Will **real GDP** increase…"): the stars are markdown, not words */
const unstarred = (s: string | undefined): string | undefined => s?.replace(/\*\*/g, "");
const whenMs = (v: unknown): number => (typeof v === "string" ? Date.parse(v) : NaN);

// ---- the venues' answers as contracts ----------------------------------------------------------------------------------------------

export interface VenueWords {
  venue: string;
  venueName: string;
  connector?: string | undefined;
  now: number;
}

/** Kalshi's open events with their nested markets (GET /events?series_ticker=&status=open&with_nested_markets=true) and their series
 * (GET /series/{ticker}), as contracts: each active, dollar-priced market still open, with its event's exclusivity, its strike, its
 * rules, its event's settlement sources (the series' where the event names none), its book and its series' fee */
export function kalshiContracts(events: Rec[], seriesOf: (ticker: string) => Rec | undefined, v: VenueWords): EventContract[] {
  const out: EventContract[] = [];
  for (const ev of events) {
    const eventId = str(ev.event_ticker)?.toUpperCase();
    if (!eventId) continue;
    const series = seriesOf(String(ev.series_ticker ?? eventId.split("-")[0] ?? ""));
    const fee = kalshiFee(series, ev);
    const sources = namesOf(list(ev.settlement_sources).length ? ev.settlement_sources : series?.settlement_sources);
    const exclusive = ev.mutually_exclusive === true || ev.collateral_return_type === "MECNET";
    for (const m of list(ev.markets).filter(isRec)) {
      const ticker = str(m.ticker)?.toUpperCase();
      if (!ticker || m.status !== "active" || ticker.startsWith("KXMVE")) continue;
      if (!["yes_bid_dollars", "yes_ask_dollars", "last_price_dollars"].some((k) => typeof m[k] === "string")) continue;
      const close = whenMs(m.close_time);
      if (!(close > v.now)) continue;
      const type = String(m.strike_type ?? "");
      const strike: Strike | undefined = type === "greater" || type === "greater_or_equal" || type === "less" || type === "less_or_equal" || type === "between" ? { type, ...(fin(m.floor_strike) !== undefined ? { floor: fin(m.floor_strike) } : {}), ...(fin(m.cap_strike) !== undefined ? { cap: fin(m.cap_strike) } : {}) } : type === "custom" && isRec(m.custom_strike) ? { type: "custom", custom: Object.fromEntries(Object.entries(m.custom_strike).map(([k, x]) => [k, String(x)])) } : undefined;
      const tick = Math.min(...list(m.price_ranges).filter(isRec).map((r) => fin(r.step) ?? NaN).filter((s) => s > 0), 0.01);
      out.push({
        venue: v.venue,
        venueName: v.venueName,
        ...(v.connector ? { connector: v.connector } : {}),
        symbol: `${ticker}:YES`,
        id: ticker,
        event: { id: eventId, title: unstarred(str(ev.title)) ?? eventId, exclusive, ...(str(ev.series_ticker) ? { series: str(ev.series_ticker) } : {}) },
        question: unstarred(str(m.title)) ?? ticker,
        words: unstarred(str(m.yes_sub_title)) ?? "",
        rules: unstarred(str(m.rules_primary)) ?? "",
        ...(str(m.rules_secondary) ? { rulesMore: unstarred(str(m.rules_secondary)) } : {}),
        ...(strike ? { strike } : {}),
        ...(str(m.open_time) ? { since: str(m.open_time) } : {}),
        ...(str(m.close_time) ? { closeTime: str(m.close_time) } : {}),
        settles: { sources, ...(str(m.expected_expiration_time) ? { at: str(m.expected_expiration_time) } : str(ev.strike_date) ? { at: str(ev.strike_date) } : {}) },
        ...(px(m.yes_bid_dollars) !== undefined ? { bid: px(m.yes_bid_dollars) } : {}),
        ...(px(m.yes_ask_dollars) !== undefined ? { ask: px(m.yes_ask_dollars) } : {}),
        tick: Number.isFinite(tick) ? tick : 0.01,
        fee,
        open: true,
        ...(str(ev.category) ?? str(series?.category) ? { category: str(ev.category) ?? str(series?.category) } : {}),
      });
    }
  }
  return out;
}

/** Polymarket US's events with their markets (its search: {events: [{slug, title, category, markets}]}; a plain list of markets is one
 * event each, named by the market's question), as contracts: each open market with its event, its rules (`description`), the sources
 * its rules name ("Outcome sourced from …"), its book and its fee. A market whose rules say "Only one outcome in this market will resolve
 * to Yes" marks its event exclusive */
export function pmusContracts(events: Rec[], v: VenueWords): EventContract[] {
  const out: EventContract[] = [];
  for (const ev of events) {
    const markets = list(ev.markets).filter(isRec);
    const eventId = str(ev.slug) ?? str(markets[0]?.slug) ?? "";
    if (!eventId) continue;
    const exclusive = markets.some((m) => /only one outcome in this market will (?:resolve|settle) to yes/i.test(String(m.description ?? "")));
    for (const m of markets) {
      const slug = str(m.slug)?.toLowerCase();
      if (!slug || m.status !== "MARKET_STATUS_OPEN" || m.active === false || m.closed === true) continue;
      if (list(m.marketSides).some((s) => isRec(s) && s.long === true && s.tradable === false)) continue;
      const end = whenMs(m.endDate);
      if (Number.isFinite(end) && end <= v.now) continue;
      const rules = str(m.description) ?? "";
      const tick = fin(m.orderPriceMinTickSize);
      const bid = px(isRec(m.bestBidQuote) ? m.bestBidQuote.value : m.bestBid);
      const ask = px(isRec(m.bestAskQuote) ? m.bestAskQuote.value : m.bestAsk);
      const question = str(m.question) ?? str(ev.title) ?? slug;
      const words = str(m.title) ?? "";
      out.push({
        venue: v.venue,
        venueName: v.venueName,
        ...(v.connector ? { connector: v.connector } : {}),
        symbol: `${slug}:YES`,
        id: slug,
        event: { id: eventId, title: str(ev.title) ?? question, exclusive },
        question,
        words,
        rules,
        ...(str(m.startDate) ?? str(m.createdAt) ? { since: str(m.startDate) ?? str(m.createdAt) } : {}),
        ...(str(m.endDate) ? { closeTime: str(m.endDate) } : {}),
        settles: { sources: pmusSources(rules), ...(str(m.endDate) ? { at: str(m.endDate) } : {}) },
        ...(bid !== undefined ? { bid } : {}),
        ...(ask !== undefined ? { ask } : {}),
        tick: tick !== undefined && tick > 0 ? tick : 0.01,
        fee: pmusFee(m),
        open: true,
        ...(str(m.category) ?? str(ev.category) ? { category: str(m.category) ?? str(ev.category) } : {}),
      });
    }
  }
  return out;
}

const namesOf = (v: unknown): string[] => [...new Set(list(v).map((s) => (isRec(s) ? str(s.name) : str(s))).filter((s): s is string => s !== undefined))];
/** the sources a Polymarket US rule names: "Outcome sourced from CF Benchmarks' Bitcoin Real-Time Index." · "Outcome verified by Anthropic, the
 * relevant IPO regulatory authority, and the IPO's primary listing exchange." */
function pmusSources(rules: string): string[] {
  const m = /outcome (?:sourced from|verified by|determined by|resolved by) ([^.]{2,200})\./i.exec(rules);
  return m ? [m[1]!.trim()] : [];
}

// ---- the shape of a market: what it compares, with what, by when --------------------------------------------------------------------

/** a market's question as numbers and a day: read from Kalshi's strike fields and its event's strike date, or from Polymarket US's words.
 * `point`: a value at a moment (the S&P at the close, CPI for a month); `touch`: a value reached at any point before a deadline; `by`: a
 * thing done by a deadline; `custom`: a named outcome (a Fed cut of 25 bps) */
export interface Shape {
  kind: "point" | "touch" | "by" | "custom";
  /** the comparison as one of two edges: at least `lo`, at most `hi` (a `between` has both; "above X" is at least X + a cent) */
  lo?: number | undefined;
  hi?: number | undefined;
  /** the last day the question is about, in New York (YYYY-MM-DD): a point's day, a deadline's last day */
  day?: string | undefined;
  /** the content words of the rule that decides it, for telling one question from another */
  topic: string[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthOf = (word: string): number => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().replace(/\.$/, "").slice(0, 3)));
const pad = (n: number): string => String(n).padStart(2, "0");
const dayOf = (y: number, mo: number, d: number): string => {
  const t = new Date(Date.UTC(y, mo, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
/** an instant's date in New York, where the venues' days are */
export const nyDay = (ms: number): string => NY_DAY.format(new Date(ms));

/** THE LAST DAY a sentence is about: "before Dec 1, 2026" and "until 12:00 AM ET on January 1, 2027" end the day before; "by November 30,
 * 2026, 11:59 PM ET", "through", "on" and "at … on" are that day; a month alone ("before December 2026", "by December 2026") is its first
 * day for before and its last for by. Nothing where no such date is written */
export function lastDayOf(text: string): string | undefined {
  return deadlineOf(text)?.day;
}
/** the day a sentence is about and whether it is a deadline ("before", "by", "until", "through", "prior to") or a moment ("on", "at") */
function deadlineOf(text: string): { day: string; deadline: boolean } | undefined {
  const t = text.replace(/\s+/g, " ");
  const full = /\b(before|by|until|through|on|at|prior to)\b(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:et|est|edt)?)?\s*(?:on\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(t);
  if (full) {
    const mo = monthOf(full[2]!);
    if (mo >= 0) {
      const prep = full[1]!.toLowerCase();
      const before = prep === "before" || prep === "until" || prep === "prior to";
      return { day: dayOf(Number(full[4]), mo, Number(full[3]) - (before ? 1 : 0)), deadline: prep !== "on" && prep !== "at" };
    }
  }
  const month = /\b(before|by|until|through)\b\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/i.exec(t);
  if (month) {
    const mo = monthOf(month[2]!);
    if (mo >= 0) {
      const prep = month[1]!.toLowerCase();
      return { day: prep === "before" || prep === "until" ? dayOf(Number(month[3]), mo, 0) : dayOf(Number(month[3]), mo + 1, 0), deadline: true };
    }
  }
  return undefined;
}

/** a number as a market writes it: $89,999.99 · 7,349.9999 · 3.25% · 25bps · -0.1 */
const NUM = /-?\$?\d[\d,]*(?:\.\d+)?/g;
const numOf = (s: string): number | undefined => fin(s.replace(/[$,]/g, ""));
/** a penny above or below an edge written as "above X" / "below X": X + 0.01 is at least, X − 0.01 at most (prices in cents; an index to
 * four decimals ("7,349.9999 or below") is the same edge within the tolerance edgesMeet allows) */
const CENT = 0.01;

/** the comparison a market's words make, as the two edges: the number right after "above" or "below", the one right before "or above"
 * or "or below", a range "X to Y" or "between X and Y" — a number elsewhere in the sentence (a year, a count) is none of them */
const N = String.raw`(-?\$?\d[\d,]*(?:\.\d+)?)`;
function edgesOf(words: string): { lo?: number; hi?: number } | undefined {
  const w = words.replace(/\s+/g, " ");
  const two = (m: RegExpExecArray | null): { lo: number; hi: number } | undefined => {
    const [a, b] = m ? [numOf(m[1]!), numOf(m[2]!)] : [undefined, undefined];
    return a !== undefined && b !== undefined && b > a ? { lo: a, hi: b } : undefined;
  };
  const one = (m: RegExpExecArray | null): number | undefined => (m ? numOf(m[1]!) : undefined);
  const range = /\b(?:before|by|until)\b/i.test(w) ? undefined : two(new RegExp(`${N}%?\\s*(?:to|-|–)\\s*${N}`).exec(w));
  if (range) return range;
  const between = two(new RegExp(`\\bbetween\\s+${N}%?\\s+and\\s+${N}`, "i").exec(w));
  if (between) return between;
  const atLeast = one(new RegExp(`${N}%?\\s*(?:or above|or more|or higher)\\b`, "i").exec(w)) ?? one(new RegExp(`\\b(?:at least|greater than or equal to|no less than)\\s+${N}`, "i").exec(w));
  if (atLeast !== undefined) return { lo: atLeast };
  const atMost = one(new RegExp(`${N}%?\\s*(?:or below|or less|or lower)\\b`, "i").exec(w)) ?? one(new RegExp(`\\b(?:at most|less than or equal to|no more than)\\s+${N}`, "i").exec(w));
  if (atMost !== undefined) return { hi: atMost };
  const above = one(new RegExp(`\\b(?:above|more than|greater than|over|higher than|exceeds?)\\s+${N}`, "i").exec(w));
  if (above !== undefined) return { lo: round(above + CENT) };
  const below = one(new RegExp(`\\b(?:below|less than|under|lower than|fewer than)\\s+${N}`, "i").exec(w));
  if (below !== undefined) return { hi: round(below - CENT) };
  return undefined;
}

/** a Kalshi strike as the two edges */
function strikeEdges(s: Strike): { lo?: number; hi?: number } | undefined {
  switch (s.type) {
    case "greater":
      return s.floor !== undefined ? { lo: round(s.floor + CENT) } : undefined;
    case "greater_or_equal":
      return s.floor !== undefined ? { lo: s.floor } : undefined;
    case "less":
      return s.cap !== undefined ? { hi: round(s.cap - CENT) } : undefined;
    case "less_or_equal":
      return s.cap !== undefined ? { hi: s.cap } : undefined;
    case "between":
      return s.floor !== undefined && s.cap !== undefined ? { lo: s.floor, hi: s.cap } : undefined;
    default:
      return undefined;
  }
}

const DAY_MS = 86_400_000;
/** two edges are one within a cent and a hundred-thousandth: "above 99,999.99", "100,000 or above" and "at least 100,000.00" */
const edgesMeet = (a: number | undefined, b: number | undefined): boolean => (a === undefined && b === undefined) || (a !== undefined && b !== undefined && Math.abs(a - b) <= Math.max(0.011, Math.abs(a) * 1e-5));

/** words that say what a market is about, less the ones every rule has: a market's rule sentence as the set of content words, each venue's
 * name for a thing read as one (bitcoin and BTC, the Fed and the Federal Reserve) */
const STOP = new Set(
  "if then the this that these those market markets will settle settles settled settlement resolve resolves resolved resolution yes no otherwise a an of is are be been being at on in by before after until from to and or any point between more less than above below over under greater lesser equal contract contracts issuance creation created am pm et est edt time times specified title price prices value values end day days month months year years first last release data single decimal reported one place plain does do did takes take taken action actions with as for its it their them there than when where which who whom whose what while during within into onto upon via per each either neither both all some such same other another only also not ever never may might must shall should would could can cannot was were has have had having against about across along around because but so very just january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun".split(
    /\s+/,
  ),
);
const SAME_THING: Array<[RegExp, string]> = [
  [/\bs\s*&\s*p\s*500\b|\bs&p\b|\bspx\b/gi, " sp500 "],
  [/\bnasdaq[- ]?100\b|\bndx\b/gi, " ndx100 "],
  [/\bbitcoin\b|\bbtc\b/gi, " bitcoin "],
  [/\bethereum\b|\beth\b|\bether\b/gi, " ethereum "],
  [/\bfederal reserve\b|\bfed\b|\bfomc\b/gi, " fed "],
  [/\bfederal funds\b|\bfed funds\b/gi, " fedfunds "],
  [/\bconsumer price index\b|\bcpi\b/gi, " cpi "],
  [/\binitial public offering\b|\bipo\b/gi, " ipo "],
  [/\bconfirm(?:s|ed|ation)?\b|\bannounce(?:s|d|ment)?\b/gi, " confirms "],
];
export function topicOf(rules: string): string[] {
  let s = rules.toLowerCase();
  for (const [re, word] of SAME_THING) s = s.replace(re, word);
  const words = s.replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].sort();
}
/** how alike two topics are: Jaccard on their words */
const alike = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const both = a.filter((w) => B.has(w)).length;
  return both / (a.length + b.length - both);
};
/** rule sentences that share most of their words are about one thing */
export const SAME_TOPIC = 0.5;

/** the first sentence of a rule: the one that decides it */
const firstSentence = (s: string): string => (s.split(/(?<=\.)\s+(?=[A-Z"“])/)[0] ?? s).trim();

export function shapeOf(c: EventContract): Shape {
  const rule = firstSentence(c.rules || c.question);
  const topic = topicOf(rule);
  // a question with a blank ("Will Bitcoin be above ___ in 2026?") is filled by the market's own words ("$200,000")
  const words = c.question.includes("___") ? `${c.question.replace(/_{2,}/, c.words)} ${c.words}` : `${c.question} ${c.words}`;
  const rules = `${c.rules} ${c.rulesMore ?? ""}`;
  if (c.strike && c.strike.type !== "custom") {
    const e = strikeEdges(c.strike);
    const day = c.settles.at && Number.isFinite(whenMs(c.settles.at)) ? nyDay(whenMs(c.settles.at)) : lastDayOf(rules);
    return { kind: "point", ...e, ...(day ? { day } : {}), topic };
  }
  const touch = /at any point|at any time|any time|hit|cross|reach|how (?:high|low)/i.test(`${words} ${c.rules}`);
  const e = edgesOf(c.words) ?? edgesOf(words) ?? (touch ? edgesOf(c.rules) : undefined);
  const dated = deadlineOf(words) ?? deadlineOf(c.rules);
  if (e && touch) return { kind: "touch", ...e, ...(dated ? { day: dated.day } : {}), topic };
  if (e) {
    const day = dated?.day ?? (c.settles.at && Number.isFinite(whenMs(c.settles.at)) ? nyDay(whenMs(c.settles.at)) : undefined);
    return { kind: "point", ...e, ...(day ? { day } : {}), topic };
  }
  // a thing done by a deadline; a named outcome on a day (the Fed's decision on December 9) is custom
  if (dated?.deadline) return { kind: "by", day: dated.day, topic };
  return { kind: "custom", topic };
}

// ---- the catalogue -------------------------------------------------------------------------------------------------------------------

const legOf = (c: EventContract): RelationLeg => ({ venue: c.venue, venueName: c.venueName, ...(c.connector ? { connector: c.connector } : {}), ...(c.connected !== undefined ? { connected: c.connected } : {}), symbol: c.symbol, id: c.id, question: c.question, words: c.words, ...(c.bid !== undefined ? { bid: c.bid } : {}), ...(c.ask !== undefined ? { ask: c.ask } : {}), tick: c.tick, ...(c.closeTime ? { closeTime: c.closeTime } : {}), settles: c.settles, fee: c.fee.words });
const idOf = (kind: RelationKind, legs: EventContract[]): string => `R-${createHash("sha256").update(`${kind}|${legs.map((l) => `${l.venue}|${l.id}`).join("+")}`).digest("hex").slice(0, 12)}`;
const settlesOf = (legs: EventContract[]): string => legs.map((l) => `${l.venueName}: ${l.settles.sources.join(", ") || "source not named"}${l.settles.at ? ` · ${l.settles.at.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, " UTC")}` : ""}`).join(" · ");

/** where two rules differ, in their own words: the sentences of each that the other has no near-twin of (at most two a side, cut short);
 * rules that are one sentence apart only in their numbers and dates say the words that differ */
export function rulesDiff(a: EventContract, b: EventContract): string {
  const sentences = (c: EventContract): string[] => `${c.rules} ${c.rulesMore ?? ""}`.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"“(])/).map((s) => s.trim()).filter((s) => s.length > 3);
  const A = sentences(a);
  const B = sentences(b);
  const own = (xs: string[], ys: string[]): string[] => xs.filter((x) => !ys.some((y) => alike(topicOf(x), topicOf(y)) >= 0.8));
  const onlyA = own(A, B);
  const onlyB = own(B, A);
  const cut = (s: string): string => (s.length > 200 ? `${s.slice(0, 199)}…` : s);
  if (!onlyA.length && !onlyB.length) {
    // the same words save for the numbers and dates: say those
    const tokens = (s: string): string[] => [...new Set(s.toLowerCase().replace(/[^a-z0-9$%.,:-]+/g, " ").split(/\s+/).map((t) => t.replace(/[.,;:]+$/, "")).filter(Boolean))];
    const ta = tokens(A.join(" "));
    const tb = tokens(B.join(" "));
    const da = ta.filter((t) => !tb.includes(t));
    const db = tb.filter((t) => !ta.includes(t));
    if (!da.length && !db.length) return "the same rule, word for word";
    return `the same rule but for ${a.venueName === b.venueName ? "" : `${a.venueName} `}“${da.join(" ") || "—"}” against ${a.venueName === b.venueName ? "" : `${b.venueName} `}“${db.join(" ") || "—"}”`;
  }
  const side = (c: EventContract, only: string[]): string => (only.length ? `${c.venueName} says: ${only.slice(0, 2).map(cut).join(" ")}` : `${c.venueName} says nothing the other does not`);
  return `${side(a, onlyA)} · ${side(b, onlyB)}`;
}

/** the relations every contract's rules make with the others' (see the top of this file): the markets of one event, a ladder of
 * thresholds in one, a chain of dates in one, and the same shape read from two markets' rules across venues or events. Each relation once,
 * with its legs in constraint order */
export function catalogueOf(contracts: EventContract[]): Relation[] {
  const out: Relation[] = [];
  const seen = new Set<string>();
  const add = (kind: RelationKind, how: RelationHow, legs: EventContract[], extra: Partial<Relation> = {}): void => {
    const id = idOf(kind, legs);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, kind, how, legs: legs.map(legOf), rulesDiff: legs.length === 2 ? rulesDiff(legs[0]!, legs[1]!) : `${legs.length} markets of one event: ${legs[0]!.event.title}`, settles: settlesOf(legs.length === 2 ? legs : [legs[0]!]), ...extra });
  };
  const shapes = new Map<EventContract, Shape>(contracts.map((c) => [c, shapeOf(c)]));
  // one event's markets: an exclusive set, a ladder of thresholds, a chain of dates
  const byEvent = new Map<string, EventContract[]>();
  for (const c of contracts) byEvent.set(`${c.venue}|${c.event.id}`, [...(byEvent.get(`${c.venue}|${c.event.id}`) ?? []), c]);
  for (const legs of byEvent.values()) {
    if (legs.length < 2) continue;
    const ss = legs.map((c) => shapes.get(c)!);
    if (legs[0]!.event.exclusive) {
      // ranges in the order of the line; named outcomes (a cut, a hold, a hike) in the venue's own order
      const pairs = legs.map((c, i) => ({ c, s: ss[i]! }));
      const ordered = pairs.every((x) => x.s.lo !== undefined || x.s.hi !== undefined) ? [...pairs].sort((a, b) => (a.s.lo ?? a.s.hi!) - (b.s.lo ?? b.s.hi!) || a.c.id.localeCompare(b.c.id)) : pairs;
      add("exclusive", "event", ordered.map((x) => x.c), { exhaustive: tiles(ordered.map((x) => x.s)) });
      continue;
    }
    // a ladder: the same kind and day, thresholds in one direction ("above X" for several X; "below X" alike); the higher floor implies the
    // lower, the lower cap the higher
    const points = legs.map((c, i) => ({ c, s: ss[i]! })).filter((x) => (x.s.kind === "point" || x.s.kind === "touch") && (x.s.lo !== undefined) !== (x.s.hi !== undefined));
    for (const dir of ["lo", "hi"] as const) {
      const rung = points.filter((x) => x.s[dir] !== undefined && (dir === "lo" ? x.s.hi === undefined : x.s.lo === undefined));
      const byDay = new Map<string, typeof rung>();
      for (const x of rung) byDay.set(`${x.s.kind}|${x.s.day ?? ""}`, [...(byDay.get(`${x.s.kind}|${x.s.day ?? ""}`) ?? []), x]);
      for (const steps of byDay.values()) {
        if (steps.length < 2) continue;
        // floors ascending: each implies the one below it; caps ascending: each is implied by the one below it
        steps.sort((a, b) => a.s[dir]! - b.s[dir]!);
        for (let i = 1; i < steps.length; i++) {
          const [low, high] = [steps[i - 1]!, steps[i]!];
          if (dir === "lo") add("implies", "ladder", [high.c, low.c]);
          else add("implies", "ladder", [low.c, high.c]);
        }
      }
    }
    // a chain of dates: the same thing by several deadlines — done by the earlier is done by the later
    const dated = legs.map((c, i) => ({ c, s: ss[i]! })).filter((x) => (x.s.kind === "by" || x.s.kind === "touch") && x.s.day !== undefined);
    const byEdge = new Map<string, typeof dated>();
    for (const x of dated) byEdge.set(`${x.s.kind}|${x.s.lo ?? ""}|${x.s.hi ?? ""}`, [...(byEdge.get(`${x.s.kind}|${x.s.lo ?? ""}|${x.s.hi ?? ""}`) ?? []), x]);
    for (const chain of byEdge.values()) {
      if (chain.length < 2) continue;
      chain.sort((a, b) => a.s.day!.localeCompare(b.s.day!) || a.c.id.localeCompare(b.c.id));
      for (let i = 1; i < chain.length; i++) if (chain[i - 1]!.s.day !== chain[i]!.s.day) add("implies", "dates", [chain[i - 1]!.c, chain[i]!.c]);
    }
  }
  // the same shape at two venues, or in two events of one: the same question twice, or one threshold inside another's, or the same thing by
  // an earlier deadline. An implication is kept only between neighbours — no third market of the same shape between them (a later deadline
  // between the two, a threshold between the two): the rest follow from those
  const shaped = contracts.map((c) => ({ c, s: shapes.get(c)! })).filter((x) => x.s.kind !== "custom" && x.s.day !== undefined && x.s.topic.length > 0);
  const byKind = new Map<string, typeof shaped>();
  for (const x of shaped) byKind.set(x.s.kind, [...(byKind.get(x.s.kind) ?? []), x]);
  type Shaped = (typeof shaped)[number];
  const implied: Array<{ first: Shaped; later: Shaped; between: (c: Shaped) => boolean }> = [];
  for (const group of byKind.values()) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!];
        if (a.c.venue === b.c.venue && a.c.event.id === b.c.event.id) continue;
        if (alike(a.s.topic, b.s.topic) < SAME_TOPIC) continue;
        const sameEdges = edgesMeet(a.s.lo, b.s.lo) && edgesMeet(a.s.hi, b.s.hi);
        if (sameEdges && a.s.day === b.s.day) {
          // two touches to one level by one day are one question when their windows began together; made more than a day apart, the
          // younger (a touch counts only what happens after its market was made) implies the older
          const [ta, tb] = [whenMs(a.c.since ?? ""), whenMs(b.c.since ?? "")];
          if (a.s.kind === "touch" && Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > DAY_MS) {
            const [younger, older] = ta > tb ? [a, b] : [b, a];
            implied.push({ first: younger, later: older, between: () => false });
          } else add("same", "shape", [a, b].sort((x, y) => x.c.venue.localeCompare(y.c.venue) || x.c.id.localeCompare(y.c.id)).map((x) => x.c));
          continue;
        }
        if (a.s.kind === "point" && a.s.day === b.s.day) {
          // one floor above another on one day: the higher implies the lower; one cap below another: the lower implies the higher
          if (a.s.lo !== undefined && b.s.lo !== undefined && a.s.hi === undefined && b.s.hi === undefined && !edgesMeet(a.s.lo, b.s.lo)) {
            const [first, later] = a.s.lo > b.s.lo ? [a, b] : [b, a];
            implied.push({ first, later, between: (c) => c.s.day === a.s.day && c.s.lo !== undefined && c.s.hi === undefined && c.s.lo < first.s.lo! && c.s.lo > later.s.lo! });
          } else if (a.s.hi !== undefined && b.s.hi !== undefined && a.s.lo === undefined && b.s.lo === undefined && !edgesMeet(a.s.hi, b.s.hi)) {
            const [first, later] = a.s.hi < b.s.hi ? [a, b] : [b, a];
            implied.push({ first, later, between: (c) => c.s.day === a.s.day && c.s.hi !== undefined && c.s.lo === undefined && c.s.hi > first.s.hi! && c.s.hi < later.s.hi! });
          }
        } else if (a.s.kind !== "point" && sameEdges && a.s.day !== b.s.day) {
          // the same thing by an earlier deadline implies it by the later one — where the earlier market was not made before the later
          // (a touch counts only what happens after its market was made)
          const [first, later] = a.s.day! < b.s.day! ? [a, b] : [b, a];
          if (a.s.kind === "by" || !(later.c.since && first.c.since && whenMs(first.c.since) < whenMs(later.c.since) - DAY_MS)) implied.push({ first, later, between: (c) => edgesMeet(c.s.lo, a.s.lo) && edgesMeet(c.s.hi, a.s.hi) && c.s.day! > first.s.day! && c.s.day! < later.s.day! });
        }
      }
    for (const p of implied) if (!group.some((c) => c !== p.first && c !== p.later && alike(c.s.topic, p.first.s.topic) >= SAME_TOPIC && p.between(c))) add("implies", "shape", [p.first.c, p.later.c]);
    implied.length = 0;
  }
  return out;
}

/** price ranges that tile the line: the first open below, the last open above, each next starting where the last ended */
function tiles(ss: Shape[]): boolean | undefined {
  if (ss.length < 2 || ss.some((s) => s.lo === undefined && s.hi === undefined)) return undefined;
  if (ss[0]!.lo !== undefined || ss[ss.length - 1]!.hi !== undefined) return false;
  for (let i = 1; i < ss.length; i++) {
    const [prev, next] = [ss[i - 1]!, ss[i]!];
    if (prev.hi === undefined || next.lo === undefined || !edgesMeet(prev.hi, next.lo) && !(next.lo > prev.hi && next.lo - prev.hi <= Math.max(0.011, Math.abs(prev.hi) * 1e-5))) return false;
  }
  return true;
}

// ---- the deviation -------------------------------------------------------------------------------------------------------------------

/** what hitting both books now leaves of a relation, a contract (see the top of this file); nothing for a candidate, or where a book is
 * missing a side the trade needs. `minNet`: the net that flags it — a dollar figure, else one tick of its legs (the largest) */
export function deviationOf(r: Relation, minNet?: number | undefined): Deviation | undefined {
  if (r.candidate) return undefined;
  const threshold = minNet ?? Math.max(...r.legs.map((l) => l.tick));
  const fee = (l: RelationLeg, p: number): number => round(rateOf(l) * p * (1 - p), 6);
  const done = (gross: number, legs: Deviation["legs"], trade: string): Deviation => {
    const fees = round(legs.reduce((s, l) => s + l.fee, 0), 6);
    const net = round(gross - fees, 6);
    return { gross: round(gross, 6), fees, net, flagged: net >= threshold - 1e-12, trade, legs };
  };
  const sell = (l: RelationLeg): Deviation["legs"][number] => ({ symbol: l.symbol, side: "sell", price: l.bid!, fee: fee(l, l.bid!) });
  const buy = (l: RelationLeg): Deviation["legs"][number] => ({ symbol: l.symbol, side: "buy", price: l.ask!, fee: fee(l, l.ask!) });
  const words = (legs: Deviation["legs"]): string => legs.map((l) => `${l.side} ${l.symbol} at ${l.price}`).join(" · ");
  if (r.kind === "implies") {
    const [a, b] = [r.legs[0], r.legs[1]];
    if (!a || !b || a.bid === undefined || b.ask === undefined) return undefined;
    const legs = [sell(a), buy(b)];
    return done(a.bid - b.ask, legs, words(legs));
  }
  if (r.kind === "same") {
    const [a, b] = [r.legs[0], r.legs[1]];
    if (!a || !b) return undefined;
    const ways: Array<Deviation["legs"]> = [];
    if (a.bid !== undefined && b.ask !== undefined) ways.push([sell(a), buy(b)]);
    if (b.bid !== undefined && a.ask !== undefined) ways.push([sell(b), buy(a)]);
    if (!ways.length) return undefined;
    const best = ways.map((legs) => ({ legs, gross: legs[0]!.price - legs[1]!.price })).sort((x, y) => y.gross - x.gross)[0]!;
    return done(best.gross, best.legs, words(best.legs));
  }
  // exclusive: sold all at their bids, the set pays out at most $1; bought all at their asks, a set that covers every outcome pays exactly $1
  const bids = r.legs.filter((l) => l.bid !== undefined);
  const ways: Array<{ gross: number; legs: Deviation["legs"] }> = [];
  if (bids.length >= 2) {
    const legs = bids.map(sell);
    ways.push({ gross: legs.reduce((s, l) => s + l.price, 0) - 1, legs });
  }
  if (r.exhaustive && r.legs.every((l) => l.ask !== undefined)) {
    const legs = r.legs.map(buy);
    ways.push({ gross: 1 - legs.reduce((s, l) => s + l.price, 0), legs });
  }
  if (!ways.length) return undefined;
  const best = ways.sort((x, y) => y.gross - x.gross)[0]!;
  return done(best.gross, best.legs, `${best.legs[0]!.side} all ${best.legs.length} at ${best.legs[0]!.side === "sell" ? "their bids" : "their asks"} (${best.legs.map((l) => l.price).join(" + ")})`);
}
/** a leg's taker rate, read back from its fee words ("7% × p × (1 − p)") */
function rateOf(l: RelationLeg): number {
  const m = /(\d+(?:\.\d+)?)% × p × \(1 − p\)/.exec(l.fee);
  return m ? Number(m[1]) / 100 : 0.07;
}

/** THE SCAN: the catalogue of what the contracts' rules bind together, each relation's deviation at the books given, the flagged ones first.
 * A brain's candidates (ScanOptions.candidates) come last, unpriced */
export function scanStructure(contracts: EventContract[], o: ScanOptions = {}): StructureScan {
  const now = o.now ?? Date.now();
  const limit = Math.max(1, Math.floor(o.limit ?? 60));
  const minNet = o.minNet !== undefined && Number.isFinite(o.minNet) && o.minNet >= 0 ? o.minNet : undefined;
  const open = contracts.filter((c) => c.open);
  const relations = catalogueOf(open).map((r) => {
    const deviation = deviationOf(r, minNet);
    return deviation ? { ...r, deviation } : r;
  });
  const counts = { same: 0, implies: 0, exclusive: 0, candidates: 0 };
  for (const r of relations) counts[r.kind]++;
  const candidates = (o.candidates ?? []).map((r) => ({ ...r, candidate: true as const, deviation: undefined })).map(({ deviation: _d, ...r }) => r);
  counts.candidates = candidates.length;
  const flagged = relations.filter((r) => r.deviation?.flagged).sort((a, b) => b.deviation!.net - a.deviation!.net);
  const rest = o.all ? relations.filter((r) => !r.deviation?.flagged).sort((a, b) => (b.deviation?.net ?? -Infinity) - (a.deviation?.net ?? -Infinity)) : [];
  const venues = new Map<string, StructureScan["venues"][number]>();
  for (const c of open) {
    const v = venues.get(c.venue) ?? { venue: c.venue, venueName: c.venueName, contracts: 0, ...(c.connected !== undefined ? { connected: c.connected } : {}) };
    v.contracts++;
    venues.set(c.venue, v);
  }
  const notes = [
    `Relations are read from the venues' own structure: one event's markets (exclusive sets, ladders of thresholds, chains of dates) and the same shape in two markets' rules; nothing is estimated.`,
    `A deviation is what hitting both books now would leave a contract, after each venue's own taker fee at those prices; flagged at ${minNet !== undefined ? `$${minNet}` : "one tick"} or more.`,
    ...(candidates.length ? ["A brain's pairings are candidates: listed, never priced, never a lead."] : []),
  ];
  return { asOf: new Date(now).toISOString(), contracts: open.length, venues: [...venues.values()], counts, minNet: minNet ?? "tick", flagged: flagged.length, relations: [...flagged, ...rest, ...candidates].slice(0, limit), notes };
}

// ---- a brain's candidates (optional) -------------------------------------------------------------------------------------------------

/** the shape a brain's answer must take: pairs of the ids it was shown, each a kind and a sentence */
export interface BrainPairs {
  pairs: Array<{ a: string; b: string; kind: "same" | "implies"; why: string }>;
}
/** a model asked to pair the contracts' words: `system` the rule of the task, `input` the table; it answers in JSON, or nothing */
export type BrainPairer = (prompt: { system: string; input: string }) => Promise<unknown>;

/** the most contracts a brain is shown at once */
export const BRAIN_ROWS = 120;

/** A BRAIN READS THE WORDS: shown the open contracts of two venues (their ids, questions, words and the first sentence of their rules), it
 * may name pairs the shapes missed — the same question twice, or one market implying another. What comes back is checked (ids it was
 * shown, two venues or two events, a kind it may name) and kept as CANDIDATES: no deviation, no score, no lead. The deterministic
 * catalogue's own pairs are left out of what it is shown as pairs it need not find */
export async function pairByBrain(contracts: EventContract[], decide: BrainPairer, known: Relation[] = []): Promise<Relation[]> {
  const open = contracts.filter((c) => c.open).slice(0, BRAIN_ROWS);
  if (open.length < 2) return [];
  const byId = new Map(open.map((c) => [`${c.venue}|${c.id}`, c]));
  const paired = new Set(known.filter((r) => r.legs.length === 2).map((r) => r.legs.map((l) => `${l.venue}|${l.id}`).sort().join("+")));
  const rows = open.map((c) => `${c.venue}|${c.id}\t${c.venueName}\t${c.question}\t${c.words}\t${firstSentence(c.rules).slice(0, 200)}`).join("\n");
  const system = 'You read prediction-market rules. From the table (id, venue, question, market words, rule), name pairs of markets at DIFFERENT venues or in different events that ask the SAME question (kind "same") or where the first market resolving YES makes the second resolve YES (kind "implies": a before b). Only pairs you are sure of from the rules\' words; a different settlement source alone does not make two questions different. Answer JSON only: {"pairs": [{"a": id, "b": id, "kind": "same" | "implies", "why": one sentence}]}. No pairs: {"pairs": []}.';
  let answer: unknown;
  try {
    answer = await decide({ system, input: rows });
  } catch {
    return [];
  }
  const body = typeof answer === "string" ? parseJson(answer) : answer;
  if (!isRec(body)) return [];
  const out: Relation[] = [];
  const seen = new Set<string>();
  for (const p of list(body.pairs).filter(isRec)) {
    const a = byId.get(String(p.a ?? ""));
    const b = byId.get(String(p.b ?? ""));
    const kind = p.kind === "same" || p.kind === "implies" ? p.kind : undefined;
    if (!a || !b || !kind || a === b || (a.venue === b.venue && a.event.id === b.event.id)) continue;
    const key = [a, b].map((c) => `${c.venue}|${c.id}`).sort().join("+");
    if (paired.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: idOf(kind, [a, b]), kind, how: "brain", legs: [legOf(a), legOf(b)], rulesDiff: rulesDiff(a, b), settles: settlesOf([a, b]), candidate: true, why: String(p.why ?? "").slice(0, 240) });
  }
  return out;
}
function parseJson(s: string): unknown {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]) as unknown;
  } catch {
    return undefined;
  }
}
