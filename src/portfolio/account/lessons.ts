/** LESSONS: what the desk learned from its trades, in words — and, where it can be one, as a rule in numbers the account holds the desk to
 * (account/desk.ts keeps them in the desk's file and judges them; this file reads, words and judges them).
 *
 * A lesson starts as a PROPOSAL, from one of four places:
 *
 *   the evening report   the Head's "one change for tomorrow", with the rule it names where the change is one (desk.ts reporting)
 *   the weekly review    the Head's "one thing to stop doing"
 *   the Debrief          a slice of the desk's own trades that lost beyond chance against the rest (candidatesOf, below): a market, a side,
 *                        the New York hours entered, how long held, Search's confidence
 *   you                  the owner's own words, with a rule or without
 *
 * A proposal changes nothing. Only the owner's signature does (setDesk change "lesson", through the door like every instruction). ADOPTED,
 * a lesson's words go into the prompts of the seats it names — Search, Risk, Exit, the Head — and its rule, where it has one, becomes one
 * of Risk's hard checks: judged in numbers before the brain is asked, as the spread and the day's loss room are, on every lead cleared
 * from then on (the leads already open keep their plans). Words steer a brain; only a rule binds the desk, and only the owner's signature
 * makes a rule bind. REJECTED and RETIRED lessons stay on file with the moment the owner said so: what was tried and given up is part of
 * the record, and the Head is not asked to propose it again.
 *
 * THE RULES — numbers only, never code:
 *
 *   chase       no lead on a market that moved more than maxPct over the day, its way (a long after a rise, a short after a fall)
 *   funding     no lead that would pay more than maxPctDay of funding a day (a long while it is positive, a short while negative)
 *   volume      no lead on a market that traded less than minUsd over the day
 *   hours       no lead in these New York hours (the Debrief's four-hour bands)
 *   side        longs only, or shorts only
 *   markets     never these markets
 *   confidence  no lead Search is less sure of than min
 *   plan        the plan Risk gives held inside these: a take-profit of at least minTpPct, a stop of at least minSlPct, a time limit of
 *               at most maxHours — the plan is held, the lead is not rejected
 *
 * A rule a lead's numbers cannot judge (a market that gives no day's change, a lead with no confidence) does not reject it: the check is
 * said not judged, in the clearance line — never passed in silence.
 *
 * WHAT A RULE WOULD HAVE DONE (effectOf): the desk's past trades it would have stopped, and what they made, against those it would have let
 * through. Read off the very trades a lesson was most likely found in, that DESCRIBES; it does not test. The Debrief's candidates say how
 * many slices were looked at to find them: the worst of many looks bad by chance alone, which is why a slice is a candidate only where it
 * lost beyond chance against the rest (t ≤ −2) on FEW trades or more. A test is a run that did not choose the lesson: the lab's, or the
 * trades the desk closes after the lesson was proposed.
 *
 * Nothing here reads a file, a clock or the network. */
import { CONFIDENCE, confidenceOf, FEW, HELD, heldOf, HOURS, hoursBandOf, type DebriefTrade } from "./debrief.ts";
import type { RoleId } from "./desk.ts";

export type LessonState = "proposed" | "adopted" | "rejected" | "retired";
/** where it came from: the Head's evening report or weekly review, the Debrief's candidates, the owner */
export type LessonFrom = "evening" | "weekly" | "debrief" | "you";

export type LessonRule =
  | { kind: "chase"; maxPct: number }
  | { kind: "funding"; maxPctDay: number }
  | { kind: "volume"; minUsd: number }
  | { kind: "hours"; skip: string[] }
  | { kind: "side"; only: "buy" | "sell" }
  | { kind: "markets"; skip: string[] }
  | { kind: "confidence"; min: number }
  | { kind: "plan"; minTpPct?: number | undefined; minSlPct?: number | undefined; maxHours?: number | undefined };
export type PlanRule = Extract<LessonRule, { kind: "plan" }>;

export interface Lesson {
  /** LS-0004 */
  id: string;
  /** when it was proposed (or adopted at once), ISO */
  at: string;
  from: LessonFrom;
  /** the words, a sentence */
  text: string;
  /** the seats whose prompts carry it once adopted */
  roles: RoleId[];
  rule?: LessonRule | undefined;
  state: LessonState;
  /** what it was found in, in words: the report's New York day, the Debrief's slice */
  source?: string | undefined;
  /** when the owner adopted, rejected or retired it, ISO; and why, in the owner's words */
  decidedAt?: string | undefined;
  why?: string | undefined;
}

export const RULE_KINDS = ["chase", "funding", "volume", "hours", "side", "markets", "confidence", "plan"] as const;
/** each kind's numbers: a rule names these and no other */
const RULE_FIELDS: Record<LessonRule["kind"], readonly string[]> = { chase: ["maxPct"], funding: ["maxPctDay"], volume: ["minUsd"], hours: ["skip"], side: ["only"], markets: ["skip"], confidence: ["min"], plan: ["minTpPct", "minSlPct", "maxHours"] };
/** the bounds of each number — a plan's inside the bounds the desk holds a plan to (desk.ts PLAN_BOUNDS) */
export const RULE_BOUNDS = { maxPct: [0.5, 100], maxPctDay: [0.001, 10], minUsd: [1_000, 1e12], min: [0.05, 0.99], minTpPct: [0.2, 25], minSlPct: [0.2, 15], maxHours: [1, 168] } as const;
/** the most markets one rule names */
export const RULE_MARKETS_MOST = 20;
/** the seats a lesson's words may go to: the ones that think */
export const LESSON_ROLES = ["search", "risk", "exit", "head"] as const satisfies readonly RoleId[];
/** the longest lesson, in characters */
export const LESSON_TEXT = 240;
/** the most lessons adopted at once: each one's words are in its seats' every prompt */
export const LESSONS_ADOPTED_MOST = 12;
/** the most lessons kept: past it the oldest proposal the Head made and no one answered goes first — never one the owner wrote, adopted,
 * rejected or retired */
export const LESSONS_KEPT = 300;

/** the vocabulary as the Head is told it, to name its change as a rule where it is one */
export const RULE_GUIDE = `{"kind":"chase","maxPct":n} no lead on a market that moved more than n% over the day its way · {"kind":"funding","maxPctDay":n} no lead that would pay more than n% of funding a day · {"kind":"volume","minUsd":n} no market that traded less than n dollars over the day · {"kind":"hours","skip":["00–04"]} no lead in these New York hours (${HOURS.join(", ")}) · {"kind":"side","only":"buy"} longs only ("sell": shorts only) · {"kind":"markets","skip":["SYMBOL"]} never these markets · {"kind":"confidence","min":n} no lead Search is less sure of than n (0 to 1) · {"kind":"plan","minTpPct":n,"minSlPct":n,"maxHours":n} the plan held to a take-profit of at least n%, a stop of at least n%, at most n hours (any of the three)`;

const fig = (x: number): string => String(Number(x.toFixed(4)));
const signed = (x: number, places = 2): string => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(places)}%`;
/** dollars in the large — $10M, $2.5B, $750K — written out here, not by Intl: its compact currency keeps a ".0" on some runtimes' ICU
 * ($10.0M on Node 22) and not on others, and a rule's words are the same wherever they are said */
export const usdShort = (x: number): string => {
  const a = Math.abs(x);
  const [v, u] = a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${x < 0 ? "−" : ""}$${Number((a / v).toFixed(1))}${u}`;
};
/** a field's name said back only where it is a plain identifier: anything else is "a field it was sent" */
const named = (k: string): string => (/^[A-Za-z_]\w{0,30}$/.test(k) ? `"${k}"` : "a field it was sent");

/** A RULE, read strictly: one object, a kind this file knows, that kind's numbers and nothing beside them, each inside its bounds. The
 * hours are the Debrief's bands, a hyphen taken for the dash; the markets as the venue lists them, each once. The rule, or why not */
export function parseRule(raw: unknown): LessonRule | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "a rule is one object: its kind and its numbers";
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind ?? "") as LessonRule["kind"];
  const takes = RULE_FIELDS[kind];
  if (!takes) return `a rule's kind is one of ${RULE_KINDS.join(", ")}`;
  const extra = Object.keys(r).find((k) => k !== "kind" && !takes.includes(k));
  if (extra !== undefined) return `a ${kind} rule takes ${takes.join(", ")}: ${named(extra)} is not one of them`;
  const num = (k: keyof typeof RULE_BOUNDS): number | string => {
    const v = r[k];
    const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    const [lo, hi] = RULE_BOUNDS[k];
    if (!Number.isFinite(x)) return `a ${kind} rule's ${k} is a number`;
    return x < lo || x > hi ? `a ${kind} rule's ${k} is ${fig(lo)} to ${fig(hi)}, not ${fig(x)}` : x;
  };
  switch (kind) {
    case "chase":
    case "funding":
    case "volume":
    case "confidence": {
      const k = takes[0] as keyof typeof RULE_BOUNDS;
      const x = num(k);
      return typeof x === "string" ? x : ({ kind, [k]: x } as LessonRule);
    }
    case "hours": {
      if (!Array.isArray(r.skip) || !r.skip.length) return `an hours rule names the New York hours to skip: ${HOURS.join(", ")}`;
      const skip = [...new Set(r.skip.map((h) => String(h).trim().replace(/-/g, "–")))];
      const bad = skip.find((h) => !HOURS.includes(h));
      if (bad !== undefined) return `an hours rule's hours are ${HOURS.join(", ")} (New York)`;
      if (skip.length === HOURS.length) return "an hours rule that skips every hour stops the desk: pause it instead";
      return { kind, skip: HOURS.filter((h) => skip.includes(h)) };
    }
    case "side":
      return r.only === "buy" || r.only === "sell" ? { kind, only: r.only } : 'a side rule is {"only": "buy"} (longs only) or {"only": "sell"} (shorts only)';
    case "markets": {
      if (!Array.isArray(r.skip) || !r.skip.length) return "a markets rule names the markets to leave alone, as the venue lists them";
      const skip = [...new Set(r.skip.map((s) => String(s).trim()))];
      if (skip.length > RULE_MARKETS_MOST) return `a markets rule names ${RULE_MARKETS_MOST} markets at most`;
      if (skip.some((s) => !/^[\w.\-/:@ ]{1,40}$/.test(s))) return "a market is named as the venue lists it: letters, digits and . - / : @, 40 at most";
      return { kind, skip };
    }
    case "plan": {
      const out: PlanRule = { kind };
      for (const k of ["minTpPct", "minSlPct", "maxHours"] as const) {
        if (r[k] === undefined || r[k] === null) continue;
        const x = num(k);
        if (typeof x === "string") return x;
        out[k] = x;
      }
      return out.minTpPct === undefined && out.minSlPct === undefined && out.maxHours === undefined ? "a plan rule names at least one of minTpPct, minSlPct, maxHours" : out;
    }
  }
}

/** the seats a lesson goes to unless the owner names them: a rule on which leads to take, to Search (which names them) and Risk (which
 * clears them); a plan rule, to Risk and Exit; words alone, to every seat that thinks */
export function rolesFor(rule?: LessonRule | undefined): RoleId[] {
  if (!rule) return [...LESSON_ROLES];
  return rule.kind === "plan" ? ["risk", "exit"] : ["search", "risk"];
}

/** the seats named, read strictly: thinking seats, each once, in the desk's order; none named, the rule's (rolesFor) */
export function parseRoles(raw: unknown, rule?: LessonRule | undefined): RoleId[] | string {
  if (raw === undefined || raw === null) return rolesFor(rule);
  if (!Array.isArray(raw) || !raw.length) return `a lesson's seats are a list of ${LESSON_ROLES.join(", ")}`;
  const asked = raw.map((x) => String(x));
  if (asked.some((x) => !(LESSON_ROLES as readonly string[]).includes(x))) return `a lesson goes to the seats that think: ${LESSON_ROLES.join(", ")}`;
  return LESSON_ROLES.filter((x) => asked.includes(x));
}

/** the rule in a person's words */
export function ruleWords(rule: LessonRule): string {
  switch (rule.kind) {
    case "chase":
      return `no lead on a market that moved more than ${fig(rule.maxPct)}% over the day its way`;
    case "funding":
      return `no lead that would pay more than ${fig(rule.maxPctDay)}% of funding a day`;
    case "volume":
      return `no lead on a market that traded less than ${usdShort(rule.minUsd)} over the day`;
    case "hours":
      return `no lead entered ${rule.skip.join(", ")} New York`;
    case "side":
      return rule.only === "buy" ? "longs only" : "shorts only";
    case "markets":
      return `never ${rule.skip.join(", ")}`;
    case "confidence":
      return `no lead Search is less than ${fig(rule.min)} sure of`;
    case "plan":
      return `the plan held to ${[rule.minTpPct !== undefined ? `a take-profit of at least ${fig(rule.minTpPct)}%` : "", rule.minSlPct !== undefined ? `a stop of at least ${fig(rule.minSlPct)}%` : "", rule.maxHours !== undefined ? `${fig(rule.maxHours)} h at most` : ""].filter(Boolean).join(", ")}`;
  }
}

/** one rule as one string, its fields in a fixed order: two rules that say the same are the same string */
export function ruleKey(rule: LessonRule): string {
  const f = RULE_FIELDS[rule.kind];
  const r = rule as unknown as Record<string, unknown>;
  return JSON.stringify([rule.kind, ...f.map((k) => (Array.isArray(r[k]) ? [...(r[k] as string[])].sort() : (r[k] ?? null)))]);
}

const sameWords = (a: string, b: string): boolean => {
  const w = (s: string) => s.toLowerCase().replace(/[\s.!]+$/g, "").replace(/\s+/g, " ").trim();
  return w(a) === w(b);
};
/** a lesson already kept that says this — the same words, or the same rule: one in force or waiting first, so a lesson proposed again after
 * one like it was rejected is the one found, not the rejected one */
export function sameLesson(lessons: readonly Lesson[], text: string, rule?: LessonRule | undefined): Lesson | undefined {
  const key = rule ? ruleKey(rule) : undefined;
  const same = (l: Lesson) => sameWords(l.text, text) || (key !== undefined && l.rule !== undefined && ruleKey(l.rule) === key);
  return lessons.find((l) => same(l) && (l.state === "adopted" || l.state === "proposed")) ?? lessons.find(same);
}

/** a change that is none: the Head's "none", "nothing yet", "no change" propose nothing */
export const noChange = (text: string): boolean => /^\s*(none|nothing|no change|n\/a)\b/i.test(text) || !/[a-z]/i.test(text);

/** Room for one more lesson: past LESSONS_KEPT, the oldest proposal the Head made that no one answered is let go. False when none can be
 * (every one kept is the owner's, or answered) */
export function makeRoom(lessons: Lesson[]): boolean {
  while (lessons.length >= LESSONS_KEPT) {
    const i = lessons.findIndex((l) => l.state === "proposed" && (l.from === "evening" || l.from === "weekly"));
    if (i < 0) return false;
    lessons.splice(i, 1);
  }
  return true;
}

/** a perpetual's funding a day, in percent, from its rate an interval and the hours between payments (the venue's; one where it says none,
 * as Hyperliquid pays) */
export const fundingPctDay = (rate: number, everyH?: number | undefined): number => Number((rate * (24 / (everyH && everyH > 0 ? everyH : 1)) * 100).toFixed(6));

/** what a rule is judged on: the lead as Risk sees it, or the trade the journal kept of one */
export interface LeadFacts {
  symbol: string;
  side: "buy" | "sell";
  /** when it is judged — Risk: now; a trade: when it was entered — ms */
  at: number;
  perp: boolean;
  confidence?: number | undefined;
  /** null or absent: not known */
  changePct24h?: number | null | undefined;
  fundingPctDay?: number | null | undefined;
  volumeUsd24h?: number | null | undefined;
}

/** a rule's word on one lead: stopped, and why in numbers; or let through — where its number was not known, said so */
export type Judged = { stop: true; why: string } | { stop: false; unjudged?: string | undefined };

const known = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

/** ONE RULE ON ONE LEAD (see the top of this file). A plan rule never stops a lead: holdPlan holds its plan */
export function judge(rule: LessonRule, x: LeadFacts): Judged {
  const way = x.side === "buy" ? 1 : -1;
  switch (rule.kind) {
    case "chase":
      if (!known(x.changePct24h)) return { stop: false, unjudged: "no day's change" };
      return way * x.changePct24h > rule.maxPct ? { stop: true, why: `${x.symbol} moved ${signed(x.changePct24h)} over the day` } : { stop: false };
    case "funding":
      if (!x.perp) return { stop: false };
      if (!known(x.fundingPctDay)) return { stop: false, unjudged: "no funding rate" };
      return way * x.fundingPctDay > rule.maxPctDay ? { stop: true, why: `a ${x.side === "buy" ? "long" : "short"} on ${x.symbol} pays ${Math.abs(x.fundingPctDay).toFixed(4)}% of funding a day` } : { stop: false };
    case "volume":
      if (!known(x.volumeUsd24h)) return { stop: false, unjudged: "no day's volume" };
      return x.volumeUsd24h < rule.minUsd ? { stop: true, why: `${x.symbol} traded ${usdShort(x.volumeUsd24h)} over the day` } : { stop: false };
    case "hours": {
      const band = hoursBandOf(x.at);
      return rule.skip.includes(band) ? { stop: true, why: `it is ${band} New York` } : { stop: false };
    }
    case "side":
      return x.side !== rule.only ? { stop: true, why: `a ${x.side === "buy" ? "long" : "short"}` } : { stop: false };
    case "markets":
      return rule.skip.some((s) => s.toUpperCase() === x.symbol.toUpperCase()) ? { stop: true, why: `${x.symbol} is one of them` } : { stop: false };
    case "confidence":
      if (!known(x.confidence)) return { stop: false, unjudged: "no confidence from Search" };
      return x.confidence < rule.min ? { stop: true, why: `Search was ${fig(x.confidence)} sure` } : { stop: false };
    case "plan":
      return { stop: false };
  }
}

/** A PLAN HELD by the adopted plan rules: the take-profit and the stop no tighter, the time limit no longer than each says. The plan, and
 * the rules that moved it */
export function holdPlan(plan: { tpPct: number; slPct: number; maxHours: number }, rules: ReadonlyArray<{ id: string; rule: PlanRule }>): { tpPct: number; slPct: number; maxHours: number; held: string[] } {
  let { tpPct, slPct, maxHours } = plan;
  const held: string[] = [];
  for (const { id, rule } of rules) {
    const was = [tpPct, slPct, maxHours].join();
    if (rule.minTpPct !== undefined) tpPct = Math.max(tpPct, rule.minTpPct);
    if (rule.minSlPct !== undefined) slPct = Math.max(slPct, rule.minSlPct);
    if (rule.maxHours !== undefined) maxHours = Math.min(maxHours, rule.maxHours);
    if ([tpPct, slPct, maxHours].join() !== was) held.push(id);
  }
  return { tpPct, slPct, maxHours, held };
}

/** a desk's trade as a rule reads it: what the lead that placed it was, as the journal kept it. Undefined for a trade no lead placed */
export function factsOfTrade(t: DebriefTrade): LeadFacts | undefined {
  if (!t.lead) return undefined;
  const c = t.lead.checks;
  return { symbol: t.symbol, side: t.side === "long" ? "buy" : "sell", at: Date.parse(t.openedAt), perp: t.kind === "perp", ...(t.lead.confidence !== undefined ? { confidence: t.lead.confidence } : {}), changePct24h: c?.changePct24h, fundingPctDay: c?.fundingPctDay, volumeUsd24h: c?.volumeUsd24h };
}

export interface EffectPart {
  n: number;
  netUsd: number;
  /** the mean net a trade, in percent of its entry */
  meanPct: number;
  winRatePct: number;
}
/** WHAT A RULE WOULD HAVE DONE to the desk's trades (see the top of this file) */
export interface LessonEffect {
  /** the desk's trades it was read on, and of those the ones whose number it needs was not kept (let through, as Risk would have) */
  trades: number;
  unjudged: number;
  stopped: EffectPart;
  kept: EffectPart;
  /** fewer than FEW stopped: a sketch */
  few: boolean;
}

const r2 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0);
const r4 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 10_000) / 10_000 : 0);
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const variance = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
};
const partOf = (ts: readonly DebriefTrade[]): EffectPart => ({ n: ts.length, netUsd: r2(ts.reduce((s, t) => s + t.netUsd, 0)), meanPct: r4(mean(ts.map((t) => t.returnPct))), winRatePct: r2(ts.length ? (ts.filter((t) => t.netUsd > 0).length / ts.length) * 100 : 0) });

/** WHAT A RULE WOULD HAVE DONE to these trades — the desk's among them (a trade a lead placed). A plan rule changes exits, which only a run
 * says: none */
export function effectOf(rule: LessonRule, trades: readonly DebriefTrade[]): LessonEffect | undefined {
  if (rule.kind === "plan") return undefined;
  const stopped: DebriefTrade[] = [];
  const kept: DebriefTrade[] = [];
  let unjudged = 0;
  for (const t of trades) {
    const x = factsOfTrade(t);
    if (!x) continue;
    const j = judge(rule, x);
    if (j.stop) stopped.push(t);
    else {
      kept.push(t);
      if (j.unjudged) unjudged++;
    }
  }
  return { trades: stopped.length + kept.length, unjudged, stopped: partOf(stopped), kept: partOf(kept), few: stopped.length < FEW };
}

/** a lesson the Debrief puts forward from the desk's own trades: a slice that lost, beyond chance, against the rest */
export interface LessonCandidate {
  /** which cut it is: the market, the side, the New York hours entered, how long held, Search's confidence */
  from: "market" | "side" | "hours" | "held" | "confidence";
  /** the slice, as the Debrief names it */
  slice: string;
  text: string;
  rule: LessonRule;
  n: number;
  meanPct: number;
  winRatePct: number;
  netUsd: number;
  /** the desk's other trades */
  rest: { n: number; meanPct: number };
  /** how far apart, in standard errors (Welch's t): −2 or lower to be put forward */
  t: number;
  /** how many slices of this cut had FEW trades or more and were looked at: the worst of many looks bad by chance */
  looked: number;
}

/** how far below the rest a slice must be, in standard errors, to be put forward */
const CANDIDATE_T = -2;

/** THE DEBRIEF'S CANDIDATES from these trades — the desk's (a trade a lead placed), FEW of them at least: in each cut, the slice of FEW
 * trades or more that lost a trade, did worse than the rest, and did so beyond chance (t ≤ −2) — the worst such slice of the cut, where its
 * lesson is one a rule can say. How long a trade was held is said as a time limit (over a day: 24 h; 4 to 24 hours: 4 h); Search's
 * confidence as the least it must be, only where every band below the slice lost too */
export function candidatesOf(trades: readonly DebriefTrade[]): LessonCandidate[] {
  const desk = trades.filter((t) => t.lead);
  if (desk.length < FEW) return [];
  const cuts: Array<{ from: LessonCandidate["from"]; keyOf: (t: DebriefTrade) => string | undefined }> = [
    { from: "market", keyOf: (t) => t.symbol },
    { from: "side", keyOf: (t) => t.side },
    { from: "hours", keyOf: (t) => hoursBandOf(Date.parse(t.openedAt)) },
    { from: "held", keyOf: (t) => heldOf(t.hours) },
    { from: "confidence", keyOf: (t) => (t.lead?.confidence !== undefined ? confidenceOf(t.lead.confidence) : undefined) },
  ];
  const out: LessonCandidate[] = [];
  for (const cut of cuts) {
    const parts = new Map<string, DebriefTrade[]>();
    for (const t of desk) {
      const k = cut.keyOf(t);
      if (k !== undefined) (parts.get(k) ?? parts.set(k, []).get(k)!).push(t);
    }
    if (parts.size < 2) continue;
    const big = [...parts].filter(([, xs]) => xs.length >= FEW);
    let worst: { slice: string; xs: DebriefTrade[]; rest: DebriefTrade[]; m: number; mr: number; t: number } | undefined;
    for (const [slice, xs] of big) {
      const rest = desk.filter((t) => cut.keyOf(t) !== slice);
      if (rest.length < 2) continue;
      const a = xs.map((t) => t.returnPct);
      const b = rest.map((t) => t.returnPct);
      const m = mean(a);
      const mr = mean(b);
      const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
      const t = se > 0 ? (m - mr) / se : 0;
      if (!(m < 0 && m < mr && t <= CANDIDATE_T)) continue;
      if (!worst || m < worst.m) worst = { slice, xs, rest, m, mr, t };
    }
    if (!worst) continue;
    const { slice, xs, rest, m, mr, t } = worst;
    const these = `the desk's ${xs.length} trades`;
    const against = `the other ${rest.length} ${signed(mr, 3)}`;
    let rule: LessonRule | undefined;
    let text = "";
    if (cut.from === "market") {
      rule = { kind: "markets", skip: [slice] };
      text = `Leave ${slice} alone: ${these} there made ${signed(m, 3)} a trade, ${against}.`;
    } else if (cut.from === "side") {
      const other = slice === "long" ? "sell" : "buy";
      rule = { kind: "side", only: other };
      text = `${other === "buy" ? "Longs" : "Shorts"} only: ${these} ${slice} made ${signed(m, 3)} a trade, ${against}.`;
    } else if (cut.from === "hours") {
      rule = { kind: "hours", skip: [slice] };
      text = `No new lead ${slice} New York: ${these} entered then made ${signed(m, 3)} a trade, ${against}.`;
    } else if (cut.from === "held") {
      const most = slice === HELD[3] ? 24 : slice === HELD[2] ? 4 : undefined;
      if (most !== undefined) {
        rule = { kind: "plan", maxHours: most };
        text = `Close a lead by ${most} hours: ${these} held ${slice} made ${signed(m, 3)} a trade, ${against}.`;
      }
    } else {
      const i = CONFIDENCE.indexOf(slice);
      const below = CONFIDENCE.slice(0, i).map((b) => parts.get(b) ?? []);
      const edge = [0.6, 0.7, 0.8][i];
      if (edge !== undefined && below.every((ys) => !ys.length || mean(ys.map((y) => y.returnPct)) < 0)) {
        rule = { kind: "confidence", min: edge };
        text = `Leave the leads Search is less than ${edge} sure of: ${these} at ${slice} made ${signed(m, 3)} a trade, ${against}.`;
      }
    }
    if (!rule) continue;
    const p = partOf(xs);
    out.push({ from: cut.from, slice, text, rule, n: p.n, meanPct: p.meanPct, winRatePct: p.winRatePct, netUsd: p.netUsd, rest: { n: rest.length, meanPct: r4(mr) }, t: r2(t), looked: big.length });
  }
  return out;
}
