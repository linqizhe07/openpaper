/** A PLAN for a trade of the owner's own, and the limits the owner holds their own paper trading to — the owner's half of learning from
 * losses (the desk's is account/lessons.ts).
 *
 * THE PLAN (setPlan, signed on the Trade ticket before the order): why, in the owner's words; the setup's name, the owner's own tag; how
 * sure, 0 to 1; where it is wrong (the stop) and where it is right (the target), prices; what it puts at risk to its stop, in dollars (1R).
 * The account holds it for the order it was signed for — the owner's next entry at that venue, in that market, on that side, within
 * PLAN_WAIT_MS — and keeps it on that order, so the journal's trade carries it (account/journal.ts) and the Debrief reads whether it was
 * kept: the planned trades beside the unplanned, the result in R, the stops not kept, the winners closed before their target.
 *
 * YOUR OWN LIMITS (setPolicy change "self", signed while calm — the door holds them when it is not). They stop NEW entries at a paper
 * account only, never a close, so no limit ever keeps a position open:
 *
 *   dayLossUsd   the day's loss (New York) at which new entries stop until the next day: the owner's paper trades closed that day
 *   streak       after `losses` losing trades in a row, no new entry until `coolMin` minutes after the last of them closed
 *   maxEntries   the most entries a day (New York)
 *   planFirst    no entry without a plan signed for it first
 *   liftHours    how long a loosening waits before it holds: 0 to 168 hours, 24 where not said
 *
 * A tightening holds at once. A LOOSENING — a number raised, a limit taken away, every limit taken away, liftHours lowered — waits the
 * liftHours of the limits in force when it was signed, and holds from then, so what the owner signs wanting to trade more is what they
 * decided when they were calm. A later signature replaces a loosening still waiting. The account says what holds now and what will hold
 * from when.
 *
 * Nothing here reads a file or a clock: the service keeps the state, rebuilt at a restart from the ledger's signed rows in their order. */
import { et, fromEt } from "./calendar.ts";

export interface TradePlan {
  why: string;
  setup?: string | undefined;
  confidence?: number | undefined;
  stop?: number | undefined;
  target?: number | undefined;
  riskUsd?: number | undefined;
  /** when it was signed, ISO */
  at: string;
}

/** how long a signed plan waits for its order */
export const PLAN_WAIT_MS = 10 * 60_000;
const PLAN_FIELDS = ["why", "setup", "confidence", "stop", "target", "riskUsd"] as const;
const WHY_MOST = 300;
const SETUP_MOST = 40;
/** a field's name said back only where it is a plain identifier */
const named = (k: string): string => (/^[A-Za-z_]\w{0,30}$/.test(k) ? `"${k}"` : "a field it was sent");
const plain = (v: unknown, most: number): string =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, most);

/** A PLAN, read strictly: JSON of its own fields and no other, the why a sentence, the setup a short tag, the numbers in their bounds. The
 * plan, or why not */
export function parsePlan(value: string, at: string): TradePlan | string {
  let b: unknown;
  try {
    b = JSON.parse(value);
  } catch {
    return `a plan is JSON: {${PLAN_FIELDS.join(", ")}}`;
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return `a plan is {${PLAN_FIELDS.join(", ")}}`;
  const r = b as Record<string, unknown>;
  const extra = Object.keys(r).find((k) => !(PLAN_FIELDS as readonly string[]).includes(k));
  if (extra !== undefined) return `a plan takes ${PLAN_FIELDS.join(", ")}: ${named(extra)} is not one of them`;
  const why = plain(r.why, WHY_MOST);
  if (!why) return "a plan says why, in a sentence";
  const setup = plain(r.setup, SETUP_MOST);
  const num = (k: "confidence" | "stop" | "target" | "riskUsd", lo: number, hi: number): number | undefined | string => {
    if (r[k] === undefined || r[k] === null || r[k] === "") return undefined;
    const x = typeof r[k] === "number" ? (r[k] as number) : Number(r[k]);
    if (!Number.isFinite(x)) return `a plan's ${k} is a number`;
    return x < lo || x > hi ? `a plan's ${k} is ${lo} to ${hi}, not ${x}` : x;
  };
  const confidence = num("confidence", 0, 1);
  const stop = num("stop", 1e-12, 1e12);
  const target = num("target", 1e-12, 1e12);
  const riskUsd = num("riskUsd", 0.01, 1e9);
  for (const x of [confidence, stop, target, riskUsd]) if (typeof x === "string") return x;
  return { why, ...(setup ? { setup } : {}), ...(confidence !== undefined ? { confidence: confidence as number } : {}), ...(stop !== undefined ? { stop: stop as number } : {}), ...(target !== undefined ? { target: target as number } : {}), ...(riskUsd !== undefined ? { riskUsd: riskUsd as number } : {}), at };
}

// ---- your own limits ----

export interface SelfLimits {
  dayLossUsd?: number | undefined;
  streak?: { losses: number; coolMin: number } | undefined;
  maxEntries?: number | undefined;
  planFirst?: boolean | undefined;
  liftHours: number;
}
/** the limits in force, and a loosening signed and waiting: what holds from `from` (null: none of them) */
export interface SelfState {
  now?: SelfLimits | undefined;
  pending?: { to: SelfLimits | null; signedAt: string; from: string } | undefined;
}

export const LIFT_HOURS_DEFAULT = 24;
const SELF_FIELDS = ["dayLossUsd", "streak", "maxEntries", "planFirst", "liftHours"] as const;
const BOUNDS = { dayLossUsd: [1, 10_000_000], losses: [2, 20], coolMin: [5, 1_440], maxEntries: [1, 200], liftHours: [0, 168] } as const;
const HOUR = 3_600_000;

/** YOUR OWN LIMITS, read strictly: JSON of their fields and no other, each in its bounds, one limit at least — or "" for none at all (taking
 * them all away, a loosening like any). The limits, null for none, or why not */
export function parseSelfLimits(value: string): SelfLimits | null | string {
  if (value.trim() === "") return null;
  let b: unknown;
  try {
    b = JSON.parse(value);
  } catch {
    return `your own limits are JSON: {${SELF_FIELDS.join(", ")}}, or nothing to take them all away`;
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return `your own limits are {${SELF_FIELDS.join(", ")}}`;
  const r = b as Record<string, unknown>;
  const extra = Object.keys(r).find((k) => !(SELF_FIELDS as readonly string[]).includes(k));
  if (extra !== undefined) return `your own limits are ${SELF_FIELDS.join(", ")}: ${named(extra)} is not one of them`;
  const num = (v: unknown, k: keyof typeof BOUNDS, whole = false): number | undefined | string => {
    if (v === undefined || v === null || v === "") return undefined;
    const x = typeof v === "number" ? v : Number(v);
    const [lo, hi] = BOUNDS[k];
    if (!Number.isFinite(x)) return `${k} is a number`;
    if (whole && !Number.isInteger(x)) return `${k} is a whole number`;
    return x < lo || x > hi ? `${k} is ${lo} to ${hi}, not ${x}` : x;
  };
  const dayLossUsd = num(r.dayLossUsd, "dayLossUsd");
  const maxEntries = num(r.maxEntries, "maxEntries", true);
  const liftHours = num(r.liftHours, "liftHours");
  let streak: SelfLimits["streak"];
  if (r.streak !== undefined && r.streak !== null) {
    if (typeof r.streak !== "object" || Array.isArray(r.streak)) return "streak is {losses, coolMin}";
    const s = r.streak as Record<string, unknown>;
    const odd = Object.keys(s).find((k) => k !== "losses" && k !== "coolMin");
    if (odd !== undefined) return `streak is {losses, coolMin}: ${named(odd)} is not one of them`;
    const losses = num(s.losses, "losses", true);
    const coolMin = num(s.coolMin, "coolMin", true);
    if (typeof losses === "string") return losses;
    if (typeof coolMin === "string") return coolMin;
    if (losses === undefined || coolMin === undefined) return "streak names both: how many losses in a row, and the minutes to cool";
    streak = { losses, coolMin };
  }
  for (const x of [dayLossUsd, maxEntries, liftHours]) if (typeof x === "string") return x;
  if (r.planFirst !== undefined && typeof r.planFirst !== "boolean") return "planFirst is true or false";
  const out: SelfLimits = { ...(dayLossUsd !== undefined ? { dayLossUsd: dayLossUsd as number } : {}), ...(streak ? { streak } : {}), ...(maxEntries !== undefined ? { maxEntries: maxEntries as number } : {}), ...(r.planFirst === true ? { planFirst: true } : {}), liftHours: (liftHours as number | undefined) ?? LIFT_HOURS_DEFAULT };
  if (out.dayLossUsd === undefined && !out.streak && out.maxEntries === undefined && !out.planFirst) return "your own limits name one at least: a day's loss, a losing streak's cooling, the most entries a day, a plan first — or nothing, to take them all away";
  return out;
}

/** `next` holds the owner at least as tightly as `cur`, in every limit: nothing raised, nothing taken away, the wait no shorter */
export function tighter(cur: SelfLimits, next: SelfLimits | null): boolean {
  if (!next) return false;
  if (cur.dayLossUsd !== undefined && !(next.dayLossUsd !== undefined && next.dayLossUsd <= cur.dayLossUsd)) return false;
  if (cur.streak && !(next.streak && next.streak.losses <= cur.streak.losses && next.streak.coolMin >= cur.streak.coolMin)) return false;
  if (cur.maxEntries !== undefined && !(next.maxEntries !== undefined && next.maxEntries <= cur.maxEntries)) return false;
  if (cur.planFirst && !next.planFirst) return false;
  return next.liftHours >= cur.liftHours;
}

/** the state as it stands at `nowMs`: a loosening whose time came, holding */
export function selfAt(s: SelfState, nowMs: number): SelfState {
  if (s.pending && nowMs >= Date.parse(s.pending.from)) return s.pending.to ? { now: s.pending.to } : {};
  return s;
}

/** THE OWNER'S SIGNATURE ON THEIR LIMITS, signed at `at`: a tightening (or the first limits) holds at once; a loosening waits the liftHours of
 * the limits in force, replacing a loosening still waiting. The state, and from when what was signed holds */
export function signSelf(s: SelfState, next: SelfLimits | null, at: string): { state: SelfState; from: string } {
  const atMs = Date.parse(at);
  const cur = selfAt(s, atMs).now;
  if (!cur) return { state: next ? { now: next } : {}, from: at };
  if (tighter(cur, next) || cur.liftHours === 0) return { state: next ? { now: next } : {}, from: at };
  const from = new Date(atMs + cur.liftHours * HOUR).toISOString();
  return { state: { now: cur, pending: { to: next, signedAt: at, from } }, from };
}

const money = (x: number): string => `$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** the instant New York's next day starts, after `ms`: fromEt reads New York's offset at noon, an hour off on the nights the clocks change */
function nyMidnightAfter(ms: number): number {
  const t = et(ms);
  const x = fromEt(t.y, t.m, t.d + 1, 0, 0);
  const e = et(x);
  return e.d === t.d ? x + (1440 - e.minutes) * 60_000 : x - e.minutes * 60_000;
}
const nyClock = (ms: number): string => {
  const t = et(ms);
  return `${String(Math.floor(t.minutes / 60)).padStart(2, "0")}:${String(t.minutes % 60).padStart(2, "0")} New York`;
};

/** the limits in words, as the page and the door say them */
export function selfWords(l: SelfLimits): string {
  const parts = [
    l.dayLossUsd !== undefined ? `no new entry after a day's loss of ${money(l.dayLossUsd)}` : "",
    l.streak ? `${l.streak.coolMin} minutes' pause after ${l.streak.losses} losses in a row` : "",
    l.maxEntries !== undefined ? `${l.maxEntries} entr${l.maxEntries === 1 ? "y" : "ies"} a day at most` : "",
    l.planFirst ? "a plan before every entry" : "",
  ].filter(Boolean);
  return `${parts.join(" · ")} — ${l.liftHours === 0 ? "loosened as soon as it is signed" : `loosened only ${l.liftHours} h after it is signed`}`;
}

/** a trade of the owner's own as the limits read it: when it was entered and closed, what it made */
export interface OwnTrade {
  openedAt: string;
  closedAt: string;
  netUsd: number;
}

/** WHAT HOLDS A NEW ENTRY BACK NOW, if anything: the limits in force, the owner's closed paper trades, their entries today (New York), and
 * whether this one has a plan signed for it. The reason in words, and until when where it passes by itself */
export function selfBlock(l: SelfLimits, o: { trades: readonly OwnTrade[]; entriesToday: number; planned: boolean; nowMs: number }): { why: string; until?: string | undefined } | undefined {
  const t = et(o.nowMs);
  const midnight = nyMidnightAfter(o.nowMs);
  const today = (iso: string) => {
    const x = et(Date.parse(iso));
    return x.y === t.y && x.m === t.m && x.d === t.d;
  };
  if (l.dayLossUsd !== undefined) {
    const day = o.trades.filter((x) => today(x.closedAt)).reduce((s, x) => s + x.netUsd, 0);
    if (day <= -l.dayLossUsd) return { why: `your own day's loss line is ${money(l.dayLossUsd)}, and today's paper trades lost ${money(day)}: no new entry until midnight New York`, until: new Date(midnight).toISOString() };
  }
  if (l.streak) {
    const last = [...o.trades].sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt)).slice(-l.streak.losses);
    const end = last.length ? Date.parse(last[last.length - 1]!.closedAt) + l.streak.coolMin * 60_000 : 0;
    if (last.length === l.streak.losses && last.every((x) => x.netUsd <= 0) && o.nowMs < end) return { why: `your own pause: ${l.streak.losses} losing trades in a row, so no new entry for ${l.streak.coolMin} minutes after the last — until ${nyClock(end)}`, until: new Date(end).toISOString() };
  }
  if (l.maxEntries !== undefined && o.entriesToday >= l.maxEntries) return { why: `your own limit is ${l.maxEntries} entr${l.maxEntries === 1 ? "y" : "ies"} a day, and today has had ${o.entriesToday}: no new entry until midnight New York`, until: new Date(midnight).toISOString() };
  if (l.planFirst && !o.planned) return { why: "your own rule is a plan before every entry: write it on the ticket (why, the setup, the stop) and sign it with the order" };
  return undefined;
}
