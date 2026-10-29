/** THE BACKTESTS' HISTORY, KEPT GROWING (service.ts watchHistory: a minute after the real server starts, then once a day).
 *
 * Hyperliquid answers only its latest 5,000 bars at each size (live/history-crypto.ts): about 208 days of hourly bars, 833 of 4-hour ones.
 * A bar that rolls out of them is gone from its API for good — and the 180-day training window before the 90 held-out days (lab.ts) needs
 * 270 days of hourly bars, so on hourly bars a training run reaches back only about 118 days. The backtests' cache (backtest/data.ts)
 * keeps every bar it was told and asks only for what it is missing at its two ends: so each pass here asks Hyperliquid for every kept
 * perpetual's newest bars, and the history in the home grows past what Hyperliquid keeps. Coinbase's coins and the US shares keep their
 * history at the source (Coinbase's hourly bars back to 2015, Nasdaq's days to 1990), so nothing of theirs is asked.
 *
 *   which perpetuals   Bitcoin's and Ether's (KEEP_DEFAULT), then every perpetual a backtest has tried (the trials ledger's markets, the
 *                      newest first), then every one already kept in the home — KEEP_MOST in all
 *   which sizes        1h and 4h (KEEP_INTERVALS): Hyperliquid's daily bars reach back to 2020, and 5,000 days are thirteen years
 *   what is asked      a perpetual kept before: only what came after its last bar; one kept for the first time: its latest 5,000 bars
 *                      (data.ts topUpBars). One ask after another, through the lab's own sources and their pace
 *
 * Keeping is not trying: a pass writes no row to the trials ledger, never reads the holdout (whose first read writes it down), and takes
 * no part in the lab's one-at-a-time lock — it writes only the cache's files, each in line with a backtest reading the same one (data.ts
 * inLine). What a source does not answer is asked again on the next pass; bars that rolled out of Hyperliquid's latest 5,000 before a pass
 * came for them are said (a gap), never made up. */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isRefusal } from "../../core/errors.ts";
import type { CandleInterval } from "../live/trade.ts";
import { marketText, parseMarkets, topUpBars, type HistorySources, type MarketRef, type ToppedUp } from "./data.ts";
import { readTrials } from "./lab.ts";

/** the perpetuals kept growing whatever has been tried */
export const KEEP_DEFAULT: readonly MarketRef[] = [{ cls: "perp", base: "BTC" }, { cls: "perp", base: "ETH" }];
/** the sizes kept growing: the backtests' own whose latest 5,000 bars roll out within a few years */
export const KEEP_INTERVALS: readonly CandleInterval[] = ["1h", "4h"];
/** the most perpetuals one pass keeps: a ledger filled with markets does not turn a day's pass into hundreds of asks */
export const KEEP_MOST = 24;

/** the perpetuals a pass keeps, in order (see the top of this file) */
export function marketsToKeep(home: string, cache: string, perpSource: string): MarketRef[] {
  const out: MarketRef[] = [];
  const add = (text: string): void => {
    const read = parseMarkets(text);
    const r = typeof read === "string" ? undefined : read[0];
    if (r && r.cls === "perp" && !out.some((x) => x.base === r.base)) out.push(r);
  };
  for (const r of KEEP_DEFAULT) add(marketText(r));
  const rows = readTrials(home).rows;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.kind === "trial") for (const m of row.markets) add(m);
  }
  const dir = join(cache, perpSource);
  const kept = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith("-PERP")) : [];
  for (const e of kept.sort((a, b) => a.name.localeCompare(b.name))) add(`perp:${e.name.slice(0, -"-PERP".length)}`);
  return out.slice(0, KEEP_MOST);
}

/** what one pass did: the perpetuals and sizes it kept, the bars it added, what a source did not answer */
export interface KeptPass {
  at: string;
  markets: string[];
  intervals: CandleInterval[];
  added: number;
  kept: ToppedUp[];
  /** asked again on the next pass */
  failed: Array<{ market: string; interval: CandleInterval; why: string }>;
}

/** ONE PASS (service.ts watchHistory's, or a test's): every perpetual to keep, at every size kept, brought up to now, one ask after another */
export async function keepHistory(o: { home: string; cache: string; sources: HistorySources; clock: () => number }): Promise<KeptPass> {
  const markets = marketsToKeep(o.home, o.cache, o.sources.perp.id);
  const pass: KeptPass = { at: new Date(o.clock()).toISOString(), markets: markets.map(marketText), intervals: [...KEEP_INTERVALS], added: 0, kept: [], failed: [] };
  for (const r of markets) {
    for (const interval of KEEP_INTERVALS) {
      const got = await topUpBars(r, interval, { cache: o.cache, sources: o.sources, clock: o.clock });
      if (isRefusal(got)) {
        pass.failed.push({ market: marketText(r), interval, why: got.message ?? got.code });
        continue;
      }
      // what came before the source stopped answering is kept; the rest is asked again on the next pass
      if (got.stopped) pass.failed.push({ market: marketText(r), interval, why: got.stopped });
      pass.kept.push(got);
      pass.added += got.added;
    }
  }
  return pass;
}

/** a pass in one line, for the server's console */
export function keptWords(p: KeptPass): string {
  return [
    `history kept: ${p.markets.length} perpetual${p.markets.length === 1 ? "" : "s"} (${p.markets.join(", ")}) in ${p.intervals.join(" and ")} bars · ${p.added.toLocaleString("en-US")} bar${p.added === 1 ? "" : "s"} added`,
    ...p.failed.map((f) => `${f.market} ${f.interval} not answered (${f.why}): asked again on the next pass`),
    ...p.kept.filter((k) => k.gap).map((k) => `${k.market} ${k.interval}: the bars from ${k.gap!.from.slice(0, 16)} to ${k.gap!.to.slice(0, 16)} UTC rolled out of Hyperliquid's latest 5,000 before they were kept`),
  ].join(" · ");
}
