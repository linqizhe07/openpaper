/** THE DESK'S NUMBERS (backtest/desk.ts), apart from the desk itself: the lab (backtest/lab.ts) and the command read them without loading the
 * account the desk runs in */
/** the desk's numbers, each with its default, its bounds and its words (the lab's catalog shows them as it shows a strategy's) */
export const DESK_PARAMS = {
  sizeUsd: { default: 1000, min: 10, max: 1_000_000, words: "the dollars Risk clears a lead at, at most riskPct of the equity" },
  tpPct: { default: 2, min: 0.1, max: 50, words: "the take-profit, % from the entry" },
  slPct: { default: 1, min: 0.1, max: 50, words: "the stop, % from the entry" },
  maxHours: { default: 24, min: 1, max: 720, words: "the most hours a lead stays open" },
  riskPct: { default: 10, min: 0.1, max: 50, words: "the most a lead may be, % of the session's starting equity (the desk's own cap; 10, as the Superagent on paper)" },
  maxOpen: { default: 3, min: 1, max: 10, integer: true, words: "leads open at once" },
} as const;
export type DeskParams = { [K in keyof typeof DESK_PARAMS]: number };
export const DESK_NAME = "The desk";
export const DESK_WORDS = "the account's own desk hired at a paper account, thinking with the momentum script: Search names the markets in turn, Risk clears two leads in three at a size with a take-profit, a stop and a time limit, the plan's exits close them";

/** the desk's numbers read strictly: a name it does not take, a number out of its bounds or not whole where it must be, each refused */
export function deskParams(raw: Record<string, number | string> = {}): DeskParams | string {
  const out: Record<string, number> = {};
  for (const k of Object.keys(raw)) if (!(k in DESK_PARAMS)) return `the desk takes ${Object.keys(DESK_PARAMS).join(", ")}, not "${k.slice(0, 30)}"`;
  for (const [k, p] of Object.entries(DESK_PARAMS)) {
    const v = raw[k] === undefined ? p.default : Number(raw[k]);
    if (!Number.isFinite(v)) return `the desk's ${k} is a number`;
    if (v < p.min || v > p.max) return `the desk's ${k} is ${p.min} to ${p.max} (${p.words}), not ${v}`;
    if ("integer" in p && p.integer && !Number.isInteger(v)) return `the desk's ${k} is a whole number`;
    out[k] = v;
  }
  return out as DeskParams;
}
export const deskParamWords = (p: DeskParams): string => Object.entries(p).map(([k, v]) => `${k} ${v}`).join(" · ");

