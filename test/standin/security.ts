/** THE STAND-IN'S SECURITY PAGES: a made-up page for any US ticker asked, on the stand-in's clock, so the Security page and
 * portfolio_security can be looked at with no network. The shapes are the real reader's (live/security.ts); every name says it is the
 * stand-in's; the figures drift a little with the clock */
import type { Refusal } from "../../src/core/errors.ts";
import { no } from "../../src/portfolio/refuse.ts";
import type { SecurityReader, SecurityView } from "../../src/portfolio/live/security.ts";

const DAY = 86_400_000;
const wave = (now: number, k: number) => Math.sin((now / DAY) * Math.PI * 2 + k);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const TICKER = /^[A-Z]{1,5}([.-][A-Z])?$/;
const LEVELS: Record<string, number> = { AAPL: 228, NVDA: 141, TSLA: 262, MSFT: 418, SPY: 582, QQQ: 495, BRK: 468 };
const levelOf = (symbol: string): number => LEVELS[symbol.split(/[.-]/)[0]!] ?? 40 + ([...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % 300);
const day = (now: number, back: number) => new Date(now - back * DAY).toISOString().slice(0, 10);
const QUARTERS = ["Dec", "Mar", "Jun", "Sep"];

export function standinSecurity(clock: () => number): SecurityReader {
  return {
    async security(raw: string): Promise<SecurityView | Refusal> {
      const symbol = String(raw ?? "").trim().toUpperCase();
      if (!TICKER.test(symbol)) return no("E_ACCOUNT_BAD_ACTION", { message: `"${String(raw ?? "").slice(0, 20)}" is not a US share's ticker (AAPL, BRK.B)` });
      if (symbol === "ZZZZ") return no("E_VENUE_REJECTED", { venue: "nasdaq", message: `Stand-in Exchange lists no share or ETF named ${symbol}` });
      const now = clock();
      const etf = ["SPY", "QQQ", "IWM"].includes(symbol);
      const base = levelOf(symbol);
      const last = round(base * (1 + wave(now, symbol.length) * 0.012), 2);
      const prev = round(base, 2);
      const shares = Math.round(1_000 + (base * 37) % 14_000) * 1e6;
      const eps = round(base / 35, 2);
      const div = etf ? 0 : round(base * 0.0032, 2);
      const q = (i: number) => `${QUARTERS[(3 - i + 4) % 4]} ${2026 - (i >= 3 ? 1 : 0)}`;
      const view: SecurityView = {
        asOf: new Date(now).toISOString(),
        readAt: new Date(now).toISOString(),
        symbol,
        kind: etf ? "etf" : "stock",
        name: `${symbol} (stand-in ${etf ? "fund" : "company"})`,
        stockType: etf ? "ETF" : "Common Stock",
        exchange: "Stand-in Exchange",
        ...(etf ? {} : { sector: "Stand-in Sector", industry: "Stand-in Industry", region: "North America", description: `${symbol} is a company the stand-in made up for this page: every figure here drifts with the stand-in's clock and none of it is a real company's. A real account reads Nasdaq's pages for the share.` }),
        nasdaq100: !etf && base > 200,
        quote: { last, change: round(last - prev, 2), changePct: round(((last - prev) / prev) * 100, 2), at: `${new Date(now).toUTCString().slice(5, 16)} (stand-in)`, bid: round(last - 0.03, 2), ask: round(last + 0.03, 2), volume: Math.round(shares * 0.004), marketStatus: "Stand-in session", realTime: true },
        stats: {
          previousClose: prev,
          dayLow: round(Math.min(last, prev) * 0.99, 2),
          dayHigh: round(Math.max(last, prev) * 1.01, 2),
          week52Low: round(base * 0.72, 2),
          week52High: round(base * 1.18, 2),
          volume: Math.round(shares * 0.004),
          averageVolume: Math.round(shares * 0.0035),
          marketCapUsd: Math.round(last * shares),
          sharesOutstanding: shares,
          ...(div ? { annualDividend: round(div * 4, 2), dividendYieldPct: round(((div * 4) / last) * 100, 2), exDividend: day(now, -20), payDate: day(now, -26), payoutRatioPct: round(((div * 4) / (eps * 4)) * 100, 1) } : {}),
          ...(etf ? {} : { oneYearTarget: round(base * 1.12, 2), peRatio: round(last / (eps * 4), 1), forwardPeg: round(1.6 + wave(now, 2) * 0.2, 2), institutionalPct: round(61 + wave(now, 3) * 4, 2) }),
        },
        dividends: div ? Array.from({ length: 12 }, (_, i) => ({ exDate: day(now, 20 + i * 91), type: "Cash", amount: round(div * (i < 4 ? 1 : i < 8 ? 0.96 : 0.92), 2), declared: day(now, 30 + i * 91), record: day(now, 20 + i * 91), payment: day(now, 14 + i * 91) })) : [],
        shortInterest: Array.from({ length: 12 }, (_, i) => {
          const sh = Math.round(shares * (0.009 + wave(now, i) * 0.002));
          const vol = Math.round(shares * 0.0036);
          return { settlement: day(now, 25 + i * 15), shares: sh, avgDailyVolume: vol, daysToCover: round(sh / vol, 2) };
        }),
        ...(etf ? {} : {
          analysts: { rating: "Buy", summary: `Based on 24 stand-in analysts offering recommendations for '${symbol}'.`, count: 24, targetLow: round(base * 0.85, 2), targetMean: round(base * 1.12, 2), targetHigh: round(base * 1.4, 2), buy: 16, hold: 6, sell: 2, history: Array.from({ length: 12 }, (_, i) => ({ month: day(now, (11 - i) * 30).slice(0, 7), buy: 14 + ((i * 7) % 4), hold: 6 + (i % 3), sell: 1 + (i % 2), consensus: "Buy", target: round(base * (1.0 + i * 0.01), 2) })) },
          earnings: {
            surprises: Array.from({ length: 4 }, (_, i) => ({ quarter: q(i), reported: day(now, 7 + i * 91), eps: round(eps * (1 + wave(now, i) * 0.05), 2), consensus: round(eps * 0.98, 2), surprisePct: round(2 + wave(now, i) * 3, 2) })),
            quarters: Array.from({ length: 4 }, (_, i) => ({ period: q(-1 - i), consensus: round(eps * (1.04 + i * 0.03), 2), high: round(eps * (1.12 + i * 0.03), 2), low: round(eps * (0.95 + i * 0.03), 2), estimates: 9 + i, revisionsUp: 3, revisionsDown: 1 })),
            years: [{ period: `Dec 2027`, consensus: round(eps * 4.3, 2), high: round(eps * 4.8, 2), low: round(eps * 3.9, 2), estimates: 12, revisionsUp: 4, revisionsDown: 2 }, { period: `Dec 2028`, consensus: round(eps * 4.8, 2), high: round(eps * 5.4, 2), low: round(eps * 4.2, 2), estimates: 8, revisionsUp: 2, revisionsDown: 1 }],
            pe: [{ period: "2026 Actual", value: round(last / (eps * 4), 2) }, { period: "2027 Estimates", value: round(last / (eps * 4.3), 2) }],
            growth: [{ period: "2027", value: round(7.5 + wave(now, 5), 2) }],
          },
          insiders: { buys3m: 1, sells3m: 9, buys12m: 4, sells12m: 31, bought3m: 12_000, sold3m: 410_000, bought12m: 48_000, sold12m: 1_520_000, net3m: -398_000, net12m: -1_472_000, trades: Array.from({ length: 6 }, (_, i) => ({ insider: `STAND-IN OFFICER ${i + 1}`, relation: i % 3 ? "Officer" : "Director", date: day(now, 3 + i * 9), type: i === 4 ? "Buy" : "Automatic Sell", ownType: "Direct", shares: 2_000 + i * 350, price: round(last * (1 - i * 0.01), 2), held: 30_000 - i * 1_200 })) },
          institutions: { pct: round(61 + wave(now, 3) * 4, 2), sharesOutstandingM: shares / 1e6, valueM: Math.round((last * shares * 0.61) / 1e6), increased: { holders: 1_240, shares: Math.round(shares * 0.03) }, decreased: { holders: 980, shares: Math.round(shares * 0.02) }, held: { holders: 310, shares: Math.round(shares * 0.5) }, total: { holders: 2_530, shares: Math.round(shares * 0.61) }, opened: { holders: 120, shares: Math.round(shares * 0.004) }, soldOut: { holders: 60, shares: Math.round(shares * 0.002) }, holders: Array.from({ length: 8 }, (_, i) => ({ name: `Stand-in Asset Manager ${i + 1}`, date: day(now, 40), shares: Math.round(shares * (0.09 - i * 0.009)), change: Math.round(shares * 0.001 * (i % 2 ? -1 : 1)), changePct: round((i % 2 ? -1 : 1) * (1.2 + i * 0.1), 3), valueUsd: Math.round(last * shares * (0.09 - i * 0.009)) })) },
        }),
        parts: etf ? ["info", "summary", "dividends", "short"] : ["info", "summary", "profile", "dividends", "short", "ratings", "target", "surprise", "forecast", "peg", "insider", "institutions"],
        missing: etf ? [] : [{ part: "peg", why: `Stand-in Exchange has no PEG and P/E for ${symbol}` }],
        from: "Stand-in Exchange · as written",
        notes: ["Every figure here is made up by the stand-in and drifts with its clock. A real account reads Nasdaq's pages for the share, each figure as Nasdaq writes it."],
      };
      return view;
    },
    clear() {},
  };
}
