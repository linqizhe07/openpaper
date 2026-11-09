/** THE STAND-IN'S WORLD: made-up indices, a made-up yield curve, currencies and commodities on the stand-in's clock, so the World page and
 * portfolio_world can be looked at with no network. Every figure says it is the stand-in's; the shapes are the real desk's (live/world.ts),
 * so the page draws them as it would a real account's. The figures drift a little with the clock, as the stand-in's prices do; one source
 * stands in from an earlier answer, so the line that says so can be seen */
import type { Refusal } from "../../src/core/errors.ts";
import { FX_PAIRS, INDICES, TENORS, type Curve, type WorldQuote, type WorldReader, type WorldView } from "../../src/portfolio/live/world.ts";

const DAY = 86_400_000;
/** a slow wave on the clock: ±1 over a day, so the figures move between looks and read the same within a second */
const wave = (now: number, k: number) => Math.sin((now / DAY) * Math.PI * 2 + k);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const LEVELS: Record<string, number> = { "^SPX": 6_612, "^NDX": 23_480, "^DJX": 44_900, "^RUT": 2_288, "^OEX": 3_180, "^MXEA": 2_690, "^MXEF": 1_290, "^VIX": 16.4, "^VXN": 20.1, "^VVIX": 92, "^TNX": 4.21 };
const FX: Record<string, number> = { "EUR/USD": 1.0842, "GBP/USD": 1.2715, "USD/JPY": 149.62, "USD/CHF": 0.8812, "USD/CAD": 1.3905, "AUD/USD": 0.6523, "EUR/GBP": 0.8527, "EUR/JPY": 162.22, "EUR/CHF": 0.9554 };
const ECB: Array<[string, number]> = [["USD/CNY", 7.2415], ["USD/HKD", 7.8061], ["USD/SGD", 1.3312], ["USD/KRW", 1_404.3], ["USD/INR", 84.62], ["USD/BRL", 5.92], ["USD/MXN", 20.41]];
const COMMODITIES: Array<[string, string, number, string]> = [["GOLD", "Gold", 2_712, "$/oz"], ["SILVER", "Silver", 31.4, "$/oz"], ["PLATINUM", "Platinum", 978, "$/oz"], ["COPPER", "Copper", 4.18, "$/lb"], ["CL", "WTI crude", 68.9, "$/bbl"], ["BRENTOIL", "Brent crude", 72.6, "$/bbl"], ["NATGAS", "Natural gas", 3.12, "$/MMBtu"]];
const CURVE_BASE = [4.3, 4.28, 4.26, 4.24, 4.2, 4.12, 3.98, 3.96, 3.99, 4.07, 4.18, 4.28, 4.58, 4.48];

function curve(now: number, daysBack: number, k: number): Curve {
  const day = new Date(now - daysBack * DAY).toISOString().slice(0, 10);
  return { day, points: TENORS.map(([tenor, months], i) => ({ tenor, months, yield: round(CURVE_BASE[i]! + wave(now - daysBack * DAY, k + i / 7) * 0.08 - daysBack / 400, 2) })) };
}

export function standinWorld(clock: () => number): WorldReader {
  return {
    async world(): Promise<WorldView | Refusal> {
      const now = clock();
      const at = new Date(now).toISOString();
      const indices: WorldQuote[] = INDICES.map((spec, i) => {
        const base = LEVELS[spec.symbol]!;
        const pct = round(wave(now, i) * 1.2, 2);
        const price = round(base * (1 + pct / 100), spec.unit === "yield" ? 3 : 2);
        const prev = round(base, 2);
        return { id: `standin:${spec.symbol}`, name: `${spec.name} (stand-in)`, symbol: spec.symbol, price, change: round(price - prev, spec.unit === "yield" ? 3 : 2), changePct: pct, open: prev, high: round(Math.max(price, prev) * 1.002, 2), low: round(Math.min(price, prev) * 0.998, 2), prevClose: prev, at: new Date(now - 15 * 60_000).toISOString(), from: "Stand-in Exchange · 15 min delayed", delayMs: 15 * 60_000, ...(spec.unit === "yield" ? { unit: "%" } : {}) };
      });
      const latest = curve(now, 0, 0);
      const weekAgo = curve(now, 7, 0.3);
      const monthAgo = curve(now, 30, 0.6);
      const yearAgo = curve(now, 365, 0.9);
      const y = (c: Curve, m: number) => c.points.find((p) => p.months === m)!.yield;
      const fx: WorldQuote[] = [
        ...FX_PAIRS.map((pair, i) => {
          const base = FX[pair]!;
          const pct = round(wave(now, i + 3) * 0.4, 2);
          const price = round(base * (1 + pct / 100), 5);
          return { id: `standin:${pair}`, name: pair, symbol: pair, price, bid: round(price * 0.99995, 5), ask: round(price * 1.00005, 5), open: base, change: round(price - base, 5), changePct: pct, at, from: "Stand-in Exchange · live", delayMs: 0 };
        }),
        ...ECB.map(([pair, rate]) => ({ id: `standin-fix:${pair}`, name: pair, symbol: pair, price: rate, at: `${at.slice(0, 10)}T15:15:00.000Z`, from: `Stand-in fixing · ${at.slice(0, 10)}`, note: "the stand-in's daily fixing, not a live price" })),
      ];
      const commodities: WorldQuote[] = COMMODITIES.map(([coin, name, base, unit], i) => {
        const pct = round(wave(now, i + 7) * 1.5, 2);
        const price = round(base * (1 + pct / 100), base > 100 ? 1 : 3);
        return { id: `standin:xyz:${coin}`, name, symbol: `xyz:${coin}`, price, mark: round(price * 1.0003, base > 100 ? 1 : 3), prevClose: base, change: round(price - base, 3), changePct: pct, volumeUsd24h: round(5e7 * (1 + i), 0), at, from: "Stand-in perp · oracle", delayMs: 0, unit, note: "a stand-in perpetual's oracle price" };
      });
      return {
        asOf: at,
        indices,
        rates: { latest, weekAgo, monthAgo, yearAgo, spreads: { "2s10s": round(y(latest, 120) - y(latest, 24), 3), "3m10y": round(y(latest, 120) - y(latest, 3), 3), "5s30s": round(y(latest, 360) - y(latest, 60), 3) }, from: `Stand-in par yield curve · ${latest.day}` },
        fx,
        commodities,
        sources: [{ id: "indices", name: "Stand-in indices", readAt: at }, { id: "rates", name: "Stand-in Treasury", readAt: new Date(now - 40 * 60_000).toISOString(), late: true }, { id: "kraken", name: "Stand-in Exchange", readAt: at }, { id: "ecb", name: "Stand-in fixing", readAt: at }, { id: "commodities", name: "Stand-in perps", readAt: at }],
        missing: [{ venue: "rates", venueName: "Stand-in Treasury", why: "Stand-in Treasury did not answer in 5 s" }],
        notes: ["Every figure here is made up by the stand-in and drifts with its clock. A real account reads Cboe, the US Treasury, Kraken, the ECB and Hyperliquid."],
      };
    },
    clear() {},
  };
}
