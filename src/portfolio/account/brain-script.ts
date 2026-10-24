/** THE MOMENTUM SCRIPT: a desk brain that is a script, not a model. The stand-in's superagent thinks with it (test/standin/ui-standin.ts
 * `--superagent`) and so does a replay of a recorded day (account-replay.ts), so that the desk's real steps — a scan, a clearance, an
 * order, the plan's exits — happen on made-up or recorded prices with no key, no network and no model's judgement anywhere in them.
 *
 * What it does, in turn: Search picks from the very table it is shown (the symbols in its input, the first six), one a cycle, with a
 * thesis in words and a confidence that cycles through 0.55 to 0.85; Risk clears most leads at $60 with a quick 0.4% take-profit, a 0.4%
 * stop and an hour at most, and rejects every third with its reason; Exit holds (the plan's exits close); the Head writes two fixed
 * sentences. It answers under Claude's model id so a hire that names that model finds it (scriptedBrain). */
import { scriptedBrain, type Brain } from "./desk.ts";

export const MOMENTUM_SIZE_USD = 60;
export const MOMENTUM_TP_PCT = 0.4;
export const MOMENTUM_SL_PCT = 0.4;
export const MOMENTUM_MAX_HOURS = 1;

export function momentumScriptBrain(model = "claude-opus-5-5"): Brain {
  let n = 0;
  let r = 0;
  return scriptedBrain(({ role, input }) => {
    if (role === "search") {
      const symbols = [...new Set([...input.matchAll(/"symbol":\s*"([^"]+)"/g)].map((m) => m[1]!))];
      if (!symbols.length) return { leads: [], note: "nothing listed to pick from" };
      const symbol = symbols[n++ % Math.min(symbols.length, 6)]!;
      return { leads: [{ symbol, side: "buy", thesis: `${symbol.split(/[/:@-]/)[0]} keeps its momentum on volume`, confidence: 0.55 + (n % 4) * 0.1 }], note: "" };
    }
    if (role === "risk") {
      return ++r % 3 === 0
        ? { verdict: "reject", why: "the move is already spent on the day", sizeUsd: 0, tpPct: MOMENTUM_TP_PCT, slPct: MOMENTUM_SL_PCT, maxHours: MOMENTUM_MAX_HOURS }
        : { verdict: "clear", why: "a tight spread, the day's loss room untouched", sizeUsd: MOMENTUM_SIZE_USD, tpPct: MOMENTUM_TP_PCT, slPct: MOMENTUM_SL_PCT, maxHours: MOMENTUM_MAX_HOURS };
    }
    if (role === "exit") return { decisions: [] };
    if (role === "head") return { worked: "Quick entries, each with its numbers said first.", change: "Keep the size small while the tape is thin." };
    return null;
  }, model);
}
