/** THE LICENSE — what the owner's own record in the simulator (account/practice.ts) lets one real order of their own be worth: the last step
 * of learning from losses, where the record decides how much real money the owner's own hand may put on one order, and the owner's own
 * signature decides whether it binds at all.
 *
 * THE RECORD: the owner's trades at the practice account, as the journal keeps them (account/journal.ts), of the sessions that have ended —
 * a session still on counts from its bell — read apart by the session's window, as its start row in the practice record says:
 *   practice     the days of the two years before the lab's holdout, the days the owner trains on
 *   exam         the holdout's own days, each seen once: the days the owner did not train on
 * The paper accounts' trades are not read: no minutes of their markets are kept, so chance could not be judged on them (the Debrief reads
 * them).
 *
 * THE CHECKS, on each of the two apart:
 *   trades       how many: each level says how many it needs
 *   edge         the mean net a trade after costs, in percent of what its entry came to: the low end of its 95% range above zero (the
 *                Debrief's own figure)
 *   chance       the trades beside 1,000 random records, each holding the same trades entered at a random minute of their own sessions, on
 *                the same sides, held as long (backtest/screen.ts — the tries each session's bell kept): the record beats 90% of them
 *   plans        90% of the trades at least kept their plan: it named what it put at risk (a stop, or a 1R), and the trade lost no more than
 *                that before costs — a stop not kept, a gap through it or a size past the plan's 1R each count against it
 *   calibration  30 trades at least said how sure they were, and how often they won is within 10 points of it — band by band, trade-weighted
 *
 * THE LADDER: each level, what one real order of the owner's own may be worth there, and what the record needs to show it:
 *   0  Student    none — paper and practice only
 *   1  Learner    $25                practice: 100 trades, every check passed
 *   2  Licensed   $100               practice as for Learner, and the exam: 50 trades, every check passed
 *   3  Senior     the server's cap   practice: 300 trades, and the exam: 100 — every check passed in both
 * Always under the server's own cap (--live-cap, or the figure the owner signed in Settings), which holds every real order and movement.
 *
 * IT BINDS ONLY WHERE THE OWNER SIGNED IT: their own limits name it (account/plans.ts `license`: hold my own real entries to my license, up
 * to this level). It holds at the lower of the level signed and the level the record shows now — a record that falls holds the owner lower
 * at once; one that rises holds them no higher than they signed. A level above the one in force is signed only once the record shows it, and
 * waits the hours the limits say, as every loosening does. It holds new entries only, never a close; an agent's order is held by the agent's
 * own trading limit, not by the owner's license.
 *
 * Nothing here reads a file or a clock: the service reads the journal, the practice record and the kept tries (service.ts licenseView). */
import { CONFIDENCE, confidenceOf } from "./debrief.ts";
import type { JournalRow } from "./journal.ts";
import { riskOf, type PracticeWindow } from "./practice.ts";

export interface LicenseLevel {
  level: number;
  name: string;
  /** what one real order of the owner's own may be worth at this level, in dollars — null: the server's own cap */
  capUsd: number | null;
  /** the trades each window's record needs, every check passed */
  needs: Partial<Record<PracticeWindow, number>>;
}
export const LICENSE_LEVELS: readonly LicenseLevel[] = [
  { level: 0, name: "Student", capUsd: 0, needs: {} },
  { level: 1, name: "Learner", capUsd: 25, needs: { train: 100 } },
  { level: 2, name: "Licensed", capUsd: 100, needs: { train: 100, exam: 50 } },
  { level: 3, name: "Senior", capUsd: null, needs: { train: 300, exam: 100 } },
];
export const LICENSE_TOP = LICENSE_LEVELS.length - 1;
/** the share of random records the trades must beat */
export const CHANCE_LEAST = 0.9;
/** the share of the trades that must keep their plan */
export const KEPT_LEAST = 0.9;
/** the trades that must say how sure they were, and the most points how often they won may be off it */
export const SURE_LEAST = 30;
export const GAP_MOST = 10;
/** a loss before costs past this many times the plan's 1R is a plan not kept: every stop-out's own fill sits a little past its stop */
const PAST_STOP = 1.05;
const WINDOWS: readonly PracticeWindow[] = ["train", "exam"];
const WINDOW_NAME: Record<PracticeWindow, string> = { train: "practice", exam: "the exam" };

export const licenseName = (level: number): string => LICENSE_LEVELS[level]?.name ?? `level ${level}`;

/** a trade as the license reads it: the journal's line */
export type LicenseTrade = Pick<JournalRow, "netUsd" | "grossUsd" | "returnPct" | "plan" | "entryPrice" | "qty">;

/** one session's random entries as its bell kept them (account/practice.ts KeptTries): how many of its trades they were drawn beside, what
 * those trades made screened as the tries were (% a trade), and each try's net a trade (%), in the order drawn */
export interface SessionTries {
  trades: number;
  ownPct: number;
  means: readonly number[];
}

export interface LicenseCheck {
  ok: boolean;
  words: string;
}
/** one window's record and its checks */
export interface LicenseBook {
  window: PracticeWindow;
  sessions: number;
  trades: number;
  edge: LicenseCheck & { meanPct?: number | undefined; lowPct?: number | undefined; highPct?: number | undefined };
  /** `judged`: the sessions whose tries were pooled; `left`: sessions with trades from before a bell kept its tries; `broken`: sessions
   * whose kept tries are missing or not what their row says. `barPct`: the random records' 90th percentile, % a trade */
  chance: LicenseCheck & { rank?: number | undefined; tries?: number | undefined; ownPct?: number | undefined; medianPct?: number | undefined; barPct?: number | undefined; judged: number; left: number; broken: number };
  /** `unsaid`: trades whose plan named no stop and no 1R; `pastStop`: trades that lost more than it before costs */
  plans: LicenseCheck & { kept: number; unsaid: number; pastStop: number };
  calibration: LicenseCheck & { sure: number; gapPts?: number | undefined; bands: Array<{ label: string; n: number; saidPct: number; wonPct: number }> };
}
export type LicenseBooks = Record<PracticeWindow, LicenseBook>;

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const mean = (xs: readonly number[]): number => (xs.length ? sum(xs) / xs.length : 0);
function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
const pctOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const r2 = (x: number): number => Math.round(x * 100) / 100;
const r4 = (x: number): number => Math.round(x * 10_000) / 10_000;
/** a figure with its sign, none where it rounds to zero */
const signed = (x: number, places = 3): string => {
  const r = Number(x.toFixed(places));
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(places)}%`;
};
/** a share as a whole percent, never rounded up past a bar it did not reach */
const share = (x: number): string => `${Math.floor(x * 100 + 1e-9)}%`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const money = (x: number): string => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** THE EDGE: the mean net a trade and its 95% range, the low end of it above zero */
function edgeOf(ts: readonly LicenseTrade[]): LicenseBook["edge"] {
  const n = ts.length;
  if (n < 2) return { ok: false, words: n ? "one trade: no range to judge yet" : "no trades yet" };
  const xs = ts.map((t) => t.returnPct);
  const m = mean(xs);
  const se = sd(xs) / Math.sqrt(n);
  const low = m - 1.96 * se;
  const high = m + 1.96 * se;
  const ok = low > 0;
  return { ok, meanPct: r4(m), lowPct: r4(low), highPct: r4(high), words: `${signed(m)} a trade after costs; its 95% range ${signed(low)} to ${signed(high)}${ok ? ", all of it above zero" : " — its low end has to be above zero"}` };
}

/** THE RANDOM RECORDS, pooled from the sessions' kept tries: the k-th record holds each session's k-th try (each session's tries are drawn
 * apart, so any one of each makes a record), weighted by the trades it was drawn beside — beside the sessions' own trades, weighted the same.
 * Where the record ranks among them (a tie counted half), the middle one and the 90th percentile; nothing where no session has tries */
export function pooledChance(tries: readonly SessionTries[]): { rank: number; tries: number; trades: number; ownPct: number; medianPct: number; barPct: number } | undefined {
  const xs = tries.filter((t) => t.trades > 0 && t.means.length > 0);
  if (!xs.length) return undefined;
  const k = Math.min(...xs.map((t) => t.means.length));
  const n = sum(xs.map((t) => t.trades));
  const own = sum(xs.map((t) => t.trades * t.ownPct)) / n;
  const pooled = new Float64Array(k);
  for (const t of xs) for (let m = 0; m < k; m++) pooled[m] = pooled[m]! + (t.trades * t.means[m]!) / n;
  const sorted = Array.from(pooled).sort((a, b) => a - b);
  const below = sorted.filter((x) => x < own).length;
  const above = sorted.filter((x) => x > own).length;
  const at = (q: number): number => sorted[Math.min(k - 1, Math.max(0, Math.round(q * (k - 1))))]!;
  return { rank: (below + (k - below - above) / 2) / k, tries: k, trades: n, ownPct: own, medianPct: at(0.5), barPct: at(CHANCE_LEAST) };
}

/** CHANCE: the record beside the random ones — not judged where a session's kept tries are missing or changed */
function chanceOf(o: { tries: readonly SessionTries[]; left: number; broken: number }): LicenseBook["chance"] {
  const base = { judged: o.tries.length, left: o.left, broken: o.broken };
  const left = o.left ? ` — ${plural(o.left, "session")} from before the bell kept its random entries ${o.left === 1 ? "is" : "are"} left out` : "";
  if (o.broken) return { ok: false, ...base, words: `the random entries of ${plural(o.broken, "session")} are missing, or are not what ${o.broken === 1 ? "its" : "their"} bell kept: chance is not judged` };
  const p = pooledChance(o.tries);
  if (!p) return { ok: false, ...base, words: `no random entries to judge by yet${left}` };
  const ok = p.rank >= CHANCE_LEAST;
  return { ok, ...base, rank: r4(p.rank), tries: p.tries, ownPct: r4(p.ownPct), medianPct: r4(p.medianPct), barPct: r4(p.barPct), words: `${plural(p.trades, "trade")} beat ${share(p.rank)} of ${p.tries.toLocaleString("en-US")} random records with the same sides and holding times (${share(CHANCE_LEAST)} at least): ${signed(p.ownPct)} a trade, theirs ${signed(p.medianPct)} in the middle and ${signed(p.barPct)} at the ${Math.round(CHANCE_LEAST * 100)}th percentile${left}` };
}

/** PLANS KEPT: what each trade's plan put at risk (its 1R, else its stop's distance on what it held — account/practice.ts riskOf), and
 * whether it lost more than that before costs */
function plansOf(ts: readonly LicenseTrade[]): LicenseBook["plans"] {
  let kept = 0;
  let unsaid = 0;
  let pastStop = 0;
  for (const t of ts) {
    const risk = riskOf(t);
    if (risk === undefined) unsaid++;
    else if (t.grossUsd < -PAST_STOP * risk) pastStop++;
    else kept++;
  }
  const n = ts.length;
  if (!n) return { ok: false, kept, unsaid, pastStop, words: "no trades yet" };
  const ok = kept / n >= KEPT_LEAST;
  const off = [unsaid ? `${plural(unsaid, "trade")} named no stop and no 1R` : "", pastStop ? `${plural(pastStop, "trade")} lost more than the plan's 1R before costs` : ""].filter(Boolean);
  return { ok, kept, unsaid, pastStop, words: `${kept.toLocaleString("en-US")} of ${plural(n, "trade")} kept their plan — ${share(kept / n)}, ${share(KEPT_LEAST)} at least${off.length ? `; ${off.join(", ")}` : ""}` };
}

/** CALIBRATION: how sure the trades said they were against how often they won, band by band (the Debrief's bands), trade-weighted */
function calibrationOf(ts: readonly LicenseTrade[]): LicenseBook["calibration"] {
  const sure = ts.filter((t) => t.plan?.confidence !== undefined);
  const bands = CONFIDENCE.map((label) => {
    const xs = sure.filter((t) => confidenceOf(t.plan!.confidence!) === label);
    return { label, n: xs.length, saidPct: r2(mean(xs.map((t) => t.plan!.confidence! * 100))), wonPct: r2(pctOf(xs.filter((t) => t.netUsd > 0).length, xs.length)) };
  }).filter((b) => b.n > 0);
  if (sure.length < SURE_LEAST) return { ok: false, sure: sure.length, bands, words: `${plural(sure.length, "trade")} said how sure ${sure.length === 1 ? "it was" : "they were"}: ${SURE_LEAST} at least are needed to judge it — say it under the plan's How sure` };
  const gap = sum(bands.map((b) => b.n * Math.abs(b.saidPct - b.wonPct))) / sure.length;
  const said = mean(sure.map((t) => t.plan!.confidence! * 100));
  const won = pctOf(sure.filter((t) => t.netUsd > 0).length, sure.length);
  const ok = gap <= GAP_MOST;
  return { ok, sure: sure.length, gapPts: r2(gap), bands, words: `${plural(sure.length, "trade")} said how sure: ${said.toFixed(0)}% on average, and ${won.toFixed(0)}% won — ${gap.toFixed(1)} points off, band by band (${GAP_MOST} at most)` };
}

/** ONE WINDOW'S RECORD (see the top of this file): its trades, the sessions they were played in, and the sessions' kept tries */
export function bookOf(window: PracticeWindow, o: { trades: readonly LicenseTrade[]; sessions: number; tries: readonly SessionTries[]; left?: number | undefined; broken?: number | undefined }): LicenseBook {
  return { window, sessions: o.sessions, trades: o.trades.length, edge: edgeOf(o.trades), chance: chanceOf({ tries: o.tries, left: o.left ?? 0, broken: o.broken ?? 0 }), plans: plansOf(o.trades), calibration: calibrationOf(o.trades) };
}

const CHECKS = [
  ["edge", "the edge"],
  ["chance", "chance"],
  ["plans", "plans kept"],
  ["calibration", "calibration"],
] as const;

/** what the record misses of a level, in words that read alone or in a sentence: none where it shows that level. A window with no trades
 * yet misses its trades, and nothing more is said of it */
export function missingFor(l: LicenseLevel, books: LicenseBooks): string[] {
  const out: string[] = [];
  for (const w of WINDOWS) {
    const need = l.needs[w];
    if (need === undefined) continue;
    const b = books[w];
    if (b.trades < need) out.push(`${plural(need, "trade")} in ${WINDOW_NAME[w]} (${b.trades.toLocaleString("en-US")} so far)`);
    if (b.trades) for (const [k, label] of CHECKS) if (!b[k].ok) out.push(`${label} in ${WINDOW_NAME[w]}: ${b[k].words}`);
  }
  return out;
}

/** the highest level the record shows: each level's needs are its own and the ones under it */
export function recordLevel(books: LicenseBooks): number {
  let level = 0;
  for (const l of LICENSE_LEVELS.slice(1)) {
    if (missingFor(l, books).length) break;
    level = l.level;
  }
  return level;
}

/** what one real entry of the owner's own may be worth at a level, under the server's own cap */
export function licenseCap(level: number, serverCapUsd: number): number {
  const c = LICENSE_LEVELS[Math.max(0, Math.min(LICENSE_TOP, level))]!.capUsd;
  return c === null ? serverCapUsd : Math.min(c, serverCapUsd);
}

/** a level's line on the ladder: what an order may be worth, and what it needs */
function rungWords(l: LicenseLevel): string {
  const worth = l.capUsd === null ? "up to the server's own cap" : l.capUsd === 0 ? "no real order of your own: paper and practice only" : `up to ${money(l.capUsd)} an order`;
  const needs = WINDOWS.flatMap((w) => (l.needs[w] !== undefined ? [`${w === "train" ? "practice" : "the exam"}: ${plural(l.needs[w]!, "trade")}`] : []));
  return `${worth}${needs.length ? ` — ${needs.join(", and ")}, every check passed` : ""}`;
}

export interface LicenseView {
  /** the level the record shows */
  level: number;
  name: string;
  books: LicenseBooks;
  /** the next level, and what the record misses of it */
  next?: { level: number; name: string; missing: string[] } | undefined;
  /** where the owner's own limits name the license: the level they signed, the level that holds (the lower of it and the record's), and
   * what one real entry of theirs may be worth there */
  signed?: number | undefined;
  held?: number | undefined;
  capUsd?: number | undefined;
  serverCapUsd: number;
  /** the server was started read-only: it places no real order, so the license has nothing to hold (the service says so) */
  readOnly?: boolean | undefined;
  ladder: Array<{ level: number; name: string; capUsd: number | null; needs: Partial<Record<PracticeWindow, number>>; words: string }>;
}

/** THE LICENSE AS IT STANDS: the record's level, the level held where the owner signed one, and the ladder */
export function licenseView(o: { books: LicenseBooks; signed?: number | undefined; serverCapUsd: number }): LicenseView {
  const level = recordLevel(o.books);
  const up = LICENSE_LEVELS[level + 1];
  const held = o.signed === undefined ? undefined : Math.min(o.signed, level);
  return {
    level,
    name: licenseName(level),
    books: o.books,
    ...(up ? { next: { level: up.level, name: up.name, missing: missingFor(up, o.books) } } : {}),
    ...(o.signed !== undefined && held !== undefined ? { signed: o.signed, held, capUsd: licenseCap(held, o.serverCapUsd) } : {}),
    serverCapUsd: o.serverCapUsd,
    ladder: LICENSE_LEVELS.map((l) => ({ level: l.level, name: l.name, capUsd: l.capUsd, needs: { ...l.needs }, words: rungWords(l) })),
  };
}

/** what the next level needs that the record misses, in a sentence: the first two, and how many more */
export function nextWords(v: LicenseView): string {
  if (!v.next || !v.next.missing.length) return "";
  const m = v.next.missing;
  return `Level ${v.next.level} (${v.next.name}) needs ${m.slice(0, 2).join("; ")}${m.length > 2 ? `; and ${plural(m.length - 2, "thing")} more` : ""}.`;
}

/** WHY A REAL ENTRY OF THE OWNER'S OWN, worth `usd`, is held back by their license — nothing where the license does not bind them, or where
 * it fits */
export function licenseHeld(v: LicenseView, usd: number): string | undefined {
  if (v.held === undefined || v.capUsd === undefined || usd <= v.capUsd + 1e-9) return undefined;
  const at = `level ${v.held} (${licenseName(v.held)})`;
  const lower = v.signed !== undefined && v.held < v.signed ? ` — you signed up to level ${v.signed}, and your record in the simulator shows level ${v.level} now` : "";
  const next = nextWords(v);
  if (v.capUsd <= 0) return `You hold your own real orders to your license, and it is at ${at}${lower}: no real entry of your own until your record in the simulator shows level 1.${next ? ` ${next}` : ""} A close always goes.`;
  return `${money(usd)} is more than your license lets one real order of your own be worth: ${money(v.capUsd)} at ${at}${lower}.${next ? ` ${next}` : ""} A close always goes.`;
}
