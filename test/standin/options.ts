/** THE STAND-IN'S OPTIONS: a made-up chain for any symbol asked, on the stand-in's clock, so the Options page and portfolio_options can be
 * looked at with no network. The chain is built from a made-up smile (a base volatility, a put skew and a curve in log-moneyness) and
 * priced with Black–Scholes, its open interest and volume thickest at the money; then it goes through the real desk's arithmetic
 * (live/options.ts viewOf), so the figures the page shows are read off the chain the way a real account's are. Every name says it is the
 * stand-in's; the figures drift a little with the clock */
import type { Refusal } from "../../src/core/errors.ts";
import { isRefusal } from "../../src/core/errors.ts";
import { bsDelta, expiryMs, normCdf, viewOf, whichChain, type Chain, type Contract, type OptionsAsk, type OptionsReader, type OptionsView } from "../../src/portfolio/live/options.ts";

const DAY = 86_400_000;
const wave = (now: number, k: number) => Math.sin((now / DAY) * Math.PI * 2 + k);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
/** where the stand-in's underlyings stand (a symbol not named here is priced from its letters) */
const LEVELS: Record<string, number> = { SPY: 582, QQQ: 495, AAPL: 228, NVDA: 141, TSLA: 262, SPX: 5_830, XSP: 583, NDX: 20_410, RUT: 2_240, VIX: 16.4, BTC: 68_200, ETH: 2_540 };
const levelOf = (symbol: string): number => LEVELS[symbol] ?? 40 + ([...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % 300);
/** the strike step a venue would list at this level (Deribit's: a thousand dollars on BTC, fifty on ETH) */
const stepOf = (S: number, kind: "stock" | "index" | "crypto"): number => (kind === "crypto" ? (S >= 10_000 ? 1_000 : 50) : S >= 10_000 ? 100 : S >= 2_000 ? 25 : S >= 500 ? 5 : S >= 100 ? 2.5 : S >= 20 ? 1 : 0.5);
/** Black–Scholes, no rate: a call's or a put's value */
function bsPrice(type: "C" | "P", S: number, K: number, ivPct: number, years: number): number {
  const sigma = ivPct / 100;
  if (!(years > 0)) return Math.max(0, type === "C" ? S - K : K - S);
  const d1 = (Math.log(S / K) + (sigma * sigma * years) / 2) / (sigma * Math.sqrt(years));
  const d2 = d1 - sigma * Math.sqrt(years);
  return type === "C" ? S * normCdf(d1) - K * normCdf(d2) : K * normCdf(-d2) - S * normCdf(-d1);
}
/** the expiries the stand-in lists from a day: four weekly Fridays, then the third Friday of the next four months (Deribit: its Fridays too) */
function expiriesFrom(now: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  const friday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  while (friday.getUTCDay() !== 5) friday.setUTCDate(friday.getUTCDate() + 1);
  for (let i = 0; i < 4; i++) out.push(new Date(friday.getTime() + i * 7 * DAY).toISOString().slice(0, 10));
  for (let m = 1; m <= 4; m++) {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
    const third = 1 + ((5 - first.getUTCDay() + 7) % 7) + 14;
    out.push(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), third)).toISOString().slice(0, 10));
  }
  return [...new Set(out)].sort();
}
/** the stand-in's chain for a symbol at a moment */
export function standinChain(symbol: string, kind: "stock" | "index" | "crypto", now: number): Chain {
  const base = levelOf(symbol);
  const S = round(base * (1 + wave(now, symbol.length) * 0.012), kind === "crypto" ? 0 : 2);
  const step = stepOf(S, kind);
  const baseIv = kind === "crypto" ? 52 : kind === "index" ? 15 : 27;
  const contracts: Contract[] = [];
  for (const [n, expiry] of expiriesFrom(now).entries()) {
    const years = Math.max(1 / 365 / 24, (expiryMs(expiry, kind) - now) / (365 * DAY));
    const term = baseIv * (1 + 0.06 * Math.exp(-years * 12) - 0.03 * Math.min(1, years)) + wave(now, n) * 0.6;
    const under = kind === "crypto" ? round(S * (1 + years * 0.07), 0) : S;
    const each = kind === "index" ? 30 : 18;
    const centre = Math.round(S / step) * step;
    for (let i = -each; i <= each; i++) {
      const K = round(centre + i * step, 2);
      if (!(K > 0)) continue;
      const m = Math.log(K / S);
      const iv = round(Math.max(5, term - 22 * m + 48 * m * m + (kind === "crypto" ? 10 * m * m : 0)), 2);
      for (const type of ["C", "P"] as const) {
        const value = bsPrice(type, under, K, iv, years);
        const spread = Math.max(kind === "index" ? 0.1 : 0.01, value * 0.02);
        const nearness = Math.exp(-(i * i) / (each * each / 4));
        const oi = Math.round(nearness * (kind === "crypto" ? 900 : 6_000) * (1 + (n % 2)) * (type === "P" ? 1.15 : 1) + Math.abs(wave(now, i + n)) * 40);
        const volume = Math.round(oi * (0.12 + 0.3 * Math.exp(-n)));
        contracts.push({
          expiry,
          type,
          strike: K,
          ...(kind === "crypto" ? { underlying: under } : {}),
          leg: {
            bid: round(Math.max(0, value - spread / 2), 2),
            ask: round(value + spread / 2, 2),
            last: round(value + spread * (wave(now, i) / 4), 2),
            mark: round(value, 4),
            iv,
            delta: bsDelta(type, under, K, iv, years),
            ...(kind !== "crypto" ? { gamma: round(0.03 * nearness, 4), theta: round(-value * 0.02, 4), vega: round(under * 0.004 * Math.sqrt(years) * nearness, 4) } : {}),
            oi: kind === "crypto" ? round(oi / 10, 1) : oi,
            volume: kind === "crypto" ? round(volume / 10, 1) : volume,
            at: new Date(now - 15 * 60_000).toISOString(),
          },
        });
      }
    }
  }
  const at = new Date(now - (kind === "crypto" ? 0 : 15 * 60_000)).toISOString();
  return {
    kind,
    symbol,
    underlying: {
      symbol: kind === "crypto" ? `${symbol}/USD (stand-in)` : kind === "index" ? `^${symbol} (stand-in)` : `${symbol} (stand-in)`,
      price: S,
      change: round(S - base, 2),
      changePct: round(((S - base) / base) * 100, 4),
      at,
      ...(kind !== "crypto" ? { iv30: round(baseIv + wave(now, 2) * 1.5, 2), iv30Change: round(wave(now, 3) * 1.2, 2) } : {}),
      from: kind === "crypto" ? "Stand-in Derivatives · live" : "Stand-in Exchange · 15 min delayed",
      delayMs: kind === "crypto" ? 0 : 15 * 60_000,
    },
    contracts,
    from: kind === "crypto" ? "Stand-in Derivatives · live" : "Stand-in Exchange · 15 min delayed",
    unit: "USD",
  };
}
export function standinOptions(clock: () => number): OptionsReader {
  return {
    async options(ask: OptionsAsk): Promise<OptionsView | Refusal> {
      const which = whichChain(String(ask.symbol ?? ""));
      if (isRefusal(which)) return which;
      const now = clock();
      const view = viewOf(standinChain(which.symbol, which.kind, now), { symbol: which.symbol, ...(ask.expiry ? { expiry: ask.expiry } : {}) }, now, now, false);
      return { ...view, notes: ["Every figure here is made up by the stand-in and drifts with its clock: a chain built from a made-up smile and priced with Black–Scholes. A real account reads Cboe's quotes for US shares and indices and Deribit's for BTC and ETH.", ...view.notes.slice(1)] };
    },
    clear() {},
  };
}
