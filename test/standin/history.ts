/** THE STAND-IN'S HISTORY for the lab (backtest/lab.ts): made-up bars and funding in the shapes the real sources give — Hyperliquid's
 * perpetuals, Coinbase's coins, the US stocks line — so the Backtest pane can be clicked through with no network. Each market's price is
 * a random walk from a fixed seed (src/core/prng.ts mulberry32): an hour's move of about half a percent, a drift that changes sign every
 * few weeks so there are trends to follow and ranges to lose in, the same path for the same market whenever it is asked; its bars are cut
 * from that hourly path (a bar's open, close, high and low are the path's own), from 2025-01-01 to the stand-in's clock. A perpetual pays
 * funding that drifts around a small positive mean. None of it is a market's: the pane's figures here mean nothing. */
import { mulberry32 } from "../../src/core/prng.ts";
import type { HistorySources } from "../../src/portfolio/backtest/data.ts";
import type { PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { Candle, CandleInterval } from "../../src/portfolio/live/trade.ts";

const H = 3_600_000;
const DAY = 24 * H;
const FIRST = Date.parse("2025-01-01T00:00:00Z");
const STEP: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": H, "4h": 4 * H, "1d": DAY };
const BASES: Record<string, number> = { BTC: 90_000, ETH: 3_200, SOL: 180, SPY: 600, QQQ: 520, AAPL: 230, NVDA: 180 };
const seedOf = (base: string): number => [...base].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);

/** a market's hourly path, from FIRST, made once and grown as the clock asks: the price at the start of each hour */
const PATHS = new Map<string, { next: () => number; px: number[]; drift: number }>();
function hourly(base: string, upTo: number): number[] {
  let p = PATHS.get(base);
  if (!p) {
    p = { next: mulberry32(seedOf(base)), px: [BASES[base] ?? 100], drift: 0 };
    PATHS.set(base, p);
  }
  const want = Math.floor((upTo - FIRST) / H) + 2;
  while (p.px.length < want) {
    const i = p.px.length;
    // every three weeks or so the drift is drawn again: up, down or flat, a few percent a week either way
    if (i % (21 * 24) === 1) p.drift = (p.next() - 0.5) * 0.0006;
    // a move of about half a percent an hour: the sum of three draws, near enough normal
    const z = (p.next() + p.next() + p.next() - 1.5) * 2;
    p.px.push(p.px[i - 1]! * Math.exp(p.drift + 0.005 * z));
  }
  return p.px;
}

function source(id: string, name: string, kind: "perp" | "spot" | "stock", clock: () => number): PublicSource {
  const baseOf = (symbol: string): string => symbol.replace(/-PERP$|\/USD$/, "");
  return {
    id,
    name,
    kind: "exchange",
    connectTo: id,
    connector: `live:${id}`,
    listings: async (q) => {
      const base = baseOf(String(q.q ?? "BTC").toUpperCase());
      const symbol = kind === "perp" ? `${base}-PERP` : kind === "spot" ? `${base}/USD` : base;
      return [{ symbol, name: `${base} (stand-in)`, kind: kind === "stock" ? "stock" : kind, base, quote: "USD", open: true, types: ["market"], ...(kind === "perp" ? { maxLeverage: 20, fundingEveryH: 1, qtyStep: 0.0001 } : {}) }];
    },
    candles: async (symbol, interval: CandleInterval, w) => {
      const step = STEP[interval] ?? H;
      const now = clock();
      const px = hourly(baseOf(symbol), now);
      const at = (t: number): number => px[Math.min(px.length - 1, Math.max(0, Math.floor((t - FIRST) / H)))]!;
      const bars: Candle[] = [];
      for (let t = Math.max(Math.ceil((w.since ?? FIRST) / step) * step, FIRST); t < (w.until ?? now) && t + step <= now && bars.length < 5000; t += step) {
        const hours = Array.from({ length: Math.max(1, Math.round(step / H)) + 1 }, (_, k) => at(t + k * H));
        bars.push({ t, o: hours[0]!, h: Math.max(...hours) * 1.0005, l: Math.min(...hours) * 0.9995, c: hours[hours.length - 1]!, v: 2_000 });
      }
      return { bars, more: false, source: `${name} · ${symbol}`, ...(kind === "stock" ? { adjustment: "split-adjusted, not dividend-adjusted (stand-in)" } : {}) };
    },
    fundingHistory: async (symbol, from, to) => {
      const seed = seedOf(baseOf(symbol)) % 7;
      const out: Array<{ at: number; rate: number }> = [];
      for (let t = Math.ceil(Math.max(from, FIRST) / H) * H; t <= Math.min(to, clock()); t += H) out.push({ at: t, rate: 0.00001 + 0.00002 * Math.sin(t / (90 * H) + seed) });
      return out;
    },
  };
}

/** the lab's three sources over made-up history, up to the stand-in's clock */
export function standinHistory(clock: () => number): HistorySources {
  return { perp: source("hyperliquid", "Hyperliquid (stand-in)", "perp", clock), spot: source("coinbase", "Coinbase (stand-in)", "spot", clock), stock: source("us-stocks", "US stocks (stand-in)", "stock", clock) };
}
