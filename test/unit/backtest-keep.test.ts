import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { simKey } from "../../src/portfolio/account/sign.ts";
import { LATEST_BARS, loadHistory, topUpBars, type HistorySources, type MarketRef } from "../../src/portfolio/backtest/data.ts";
import { KEEP_MOST, keepHistory, keptWords, marketsToKeep } from "../../src/portfolio/backtest/keep.ts";
import { appendTrial, holdoutFile, readTrials, trialsFile, type TrialEntry } from "../../src/portfolio/backtest/lab.ts";
import { DEFAULT_COSTS } from "../../src/portfolio/backtest/source.ts";
import type { LiveDeps } from "../../src/portfolio/live/index.ts";
import type { PublicSource } from "../../src/portfolio/live/public-markets.ts";
import { INTERVAL_MS, type Candle } from "../../src/portfolio/live/trade.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** THE BACKTESTS' HISTORY, KEPT GROWING (backtest/keep.ts, data.ts topUpBars, service.ts lookAtHistory): every perpetual a backtest may
 * read gets its newest bars added to the home's cache, so its history outgrows the latest 5,000 bars Hyperliquid answers — the newest end
 * only, nothing kept let go, no row in the trials ledger, never the holdout. History from a stand-in that keeps only its latest 5,000. */
const H = 3_600_000;
const T0 = Date.parse("2026-10-29T12:34:00Z");
/** the hour T0 is in: the bar under way at T0 starts here */
const T0H = Math.floor(T0 / H) * H;
const iso = (ms: number): string => new Date(ms).toISOString();
const hour = (ms: number): string => iso(ms).slice(0, 13);

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const h = mkdtempSync(join(tmpdir(), "backtest-keep-"));
  homes.push(h);
  return h;
};

/** a stand-in Hyperliquid: at each size only its latest 5,000 bars and the one under way, every ask written down; it answers after
 * `delayMs`, and not at all while `down` says so */
function hyperliquid(o: { now: () => number; down?: () => boolean; delayMs?: number }): PublicSource & { asked: string[] } {
  const asked: string[] = [];
  return {
    id: "hl",
    name: "Stand-in Hyperliquid",
    kind: "exchange",
    connectTo: "hl",
    connector: "live:hl",
    asked,
    listings: async () => [],
    candles: async (s, interval, w) => {
      asked.push(`${s} ${interval} ${hour(w.since!)}`);
      if (o.delayMs) await new Promise((go) => setTimeout(go, o.delayMs));
      if (o.down?.()) return { ok: false, code: "E_VENUE_UNREACHABLE", layer: "VENUE", message: "the stand-in does not answer" } as unknown as Refusal;
      const step = INTERVAL_MS[interval];
      const underWay = Math.floor(o.now() / step) * step;
      const bars: Candle[] = [];
      for (let t = Math.max(Math.ceil(w.since! / step) * step, underWay - LATEST_BARS * step); t < w.until! && t <= underWay; t += step) {
        const px = 100_000 + (t - T0H) / H;
        bars.push({ t, o: px, h: px + 1, l: px - 1, c: px + 0.5, v: 10 });
      }
      return { bars, more: false, source: `Stand-in Hyperliquid · ${s}` };
    },
  };
}
/** a stand-in that must never be asked: Coinbase's coins and the US shares keep their history at the source */
function untouched(id: string): PublicSource & { asked: string[] } {
  const asked: string[] = [];
  return {
    id,
    name: `Stand-in ${id}`,
    kind: "exchange",
    connectTo: id,
    connector: `live:${id}`,
    asked,
    listings: async () => {
      asked.push("listings");
      return [];
    },
    candles: async (s) => {
      asked.push(`candles ${s}`);
      return { bars: [], more: false };
    },
  };
}
function setUp(o: { now: () => number; down?: () => boolean; delayMs?: number }) {
  const home = tmp();
  const perp = hyperliquid(o);
  const spot = untouched("cb");
  const stock = untouched("us");
  const sources: HistorySources = { perp, spot, stock };
  const cache = join(home, "history");
  return { home, cache, perp, spot, stock, sources, keep: () => keepHistory({ home, cache, sources, clock: o.now }) };
}
/** a row of the trials ledger, as a backtest on these markets would write it */
function tried(home: string, markets: string[], at: number): void {
  const t: TrialEntry = { kind: "trial", by: "request", seat: "page", run: "20261029T120000-0123456789", window: "train", key: "0123456789abcdef", strategy: "hold", params: {}, markets, interval: "1h", from: iso(at - 100 * H), to: iso(at), cashUsd: 10_000, feeBps: 10, costs: DEFAULT_COSTS, steps: 100, perYear: 8_760, sharpe: 0, sr: 0, skew: 0, kurt: 3, returnPct: 0, maxDrawdownPct: 0, fills: 1, kept: false };
  appendTrial(home, t, at);
}
const barsIn = (cache: string, market: string, interval: string): Candle[] => (JSON.parse(readFileSync(join(cache, "hl", market, `${interval}.json`), "utf8")) as { bars: Candle[] }).bars;
const BTC: MarketRef = { cls: "perp", base: "BTC" };

describe("the backtests' history, kept growing", () => {
  it("keeps Bitcoin's and Ether's perpetuals, every one the ledger tried (the newest first) and every one already kept — their latest 5,000 bars at 1h and 4h, never a coin or a share, never a row of the ledger, never the holdout", async () => {
    const now = T0;
    const { home, cache, perp, spot, stock, sources, keep } = setUp({ now: () => now });
    tried(home, ["perp:SOL", "spot:ETH"], now - 3 * H);
    tried(home, ["perp:HYPE", "perp:BTC"], now - 2 * H);
    // a perpetual a backtest once read (fifty hourly bars, ending fifty hours ago), with no row of its own
    const read = await loadHistory({ refs: [{ cls: "perp", base: "DOGE" }], interval: "1h", from: now - 100 * H, to: now - 50 * H, cache, sources, clock: () => now });
    if (isRefusal(read)) throw new Error(read.message);
    expect(read.markets[0]!.bars.length).toBe(50);
    const rows = readTrials(home).rows.length;
    perp.asked.length = 0;

    const pass = await keep();
    expect(pass.markets).toEqual(["perp:BTC", "perp:ETH", "perp:HYPE", "perp:SOL", "perp:DOGE"]);
    expect(pass.intervals).toEqual(["1h", "4h"]);
    expect(pass.failed).toEqual([]);
    // kept for the first time: all the source keeps, its latest 5,000 bars, asked in two pieces
    expect(pass.kept.find((k) => k.market === "perp:BTC" && k.interval === "1h")).toEqual({ market: "perp:BTC", interval: "1h", added: 5_000, kept: 5_000 });
    expect(pass.kept.find((k) => k.market === "perp:SOL" && k.interval === "4h")).toMatchObject({ added: 5_000, kept: 5_000 });
    expect(perp.asked.filter((a) => a.startsWith("BTC-PERP 1h"))).toEqual([`BTC-PERP 1h ${hour(T0H - 5_000 * H)}`, `BTC-PERP 1h ${hour(T0H - 1_000 * H)}`]);
    const btc = barsIn(cache, "BTC-PERP", "1h");
    expect(btc[0]!.t).toBe(T0H - 5_000 * H);
    expect(btc[btc.length - 1]!.t).toBe(T0H - H);
    // kept before: only what came after its last bar is asked, from that bar on
    expect(perp.asked.filter((a) => a.startsWith("DOGE-PERP 1h"))).toEqual([`DOGE-PERP 1h ${hour(now - 51 * H)}`]);
    expect(pass.kept.find((k) => k.market === "perp:DOGE" && k.interval === "1h")).toMatchObject({ added: 49, kept: 99 });
    expect(pass.added).toBe(4 * 2 * 5_000 + 49 + 5_000);
    // keeping is not trying, and the coins and shares were never asked
    expect(readTrials(home).rows.length).toBe(rows);
    expect(existsSync(holdoutFile(home))).toBe(false);
    expect(spot.asked).toEqual([]);
    expect(stock.asked).toEqual([]);
    expect(keptWords(pass)).toBe("history kept: 5 perpetuals (perp:BTC, perp:ETH, perp:HYPE, perp:SOL, perp:DOGE) in 1h and 4h bars · 45,049 bars added");
  });

  it("a day later asks only for the newest end and leaves the bars it kept as they were; the same hour again asks nothing; passes inside Hyperliquid's 5,000 bars keep every hour, long after the source has let them go", async () => {
    let now = T0;
    const { cache, perp, keep } = setUp({ now: () => now });
    await keep();
    const first = barsIn(cache, "BTC-PERP", "1h");
    now += 24 * H;
    perp.asked.length = 0;
    const day = await keep();
    expect(perp.asked.filter((a) => a.startsWith("BTC-PERP"))).toEqual([`BTC-PERP 1h ${hour(T0H - H)}`, `BTC-PERP 4h ${hour(Math.floor(T0 / (4 * H)) * 4 * H - 4 * H)}`]);
    expect(day.kept.find((k) => k.market === "perp:BTC" && k.interval === "1h")).toEqual({ market: "perp:BTC", interval: "1h", added: 24, kept: 5_024 });
    expect(day.kept.find((k) => k.market === "perp:BTC" && k.interval === "4h")).toMatchObject({ added: 6, kept: 5_006 });
    expect(barsIn(cache, "BTC-PERP", "1h").slice(0, first.length)).toEqual(first);
    // the same hour again: nothing is missing, nothing asked
    perp.asked.length = 0;
    const again = await keep();
    expect(perp.asked).toEqual([]);
    expect(again.added).toBe(0);
    // three passes 3,000 hours apart: 14,024 hours kept, one after another, where the source answers 5,000
    for (let i = 0; i < 3; i++) {
      now += 3_000 * H;
      const p = await keep();
      expect(p.kept.find((k) => k.market === "perp:BTC" && k.interval === "1h")).toMatchObject({ added: 3_000 });
    }
    const bars = barsIn(cache, "BTC-PERP", "1h");
    expect(bars.length).toBe(5_024 + 9_000);
    expect(bars.every((b, i) => i === 0 || b.t - bars[i - 1]!.t === H)).toBe(true);
  });

  it("a pass that comes after bars have rolled out of the source's 5,000 says the gap, and keeps what it had and all the source still answers", async () => {
    let now = T0;
    const { cache, keep } = setUp({ now: () => now });
    await keep();
    now += 6_000 * H;
    const late = await keep();
    const btc = late.kept.find((k) => k.market === "perp:BTC" && k.interval === "1h")!;
    expect(btc).toEqual({ market: "perp:BTC", interval: "1h", added: 5_000, kept: 10_000, gap: { from: iso(T0H), to: iso(T0H + 1_000 * H) } });
    // the 4-hour bars' 5,000 reach back 833 days: no gap there
    expect(late.kept.find((k) => k.market === "perp:BTC" && k.interval === "4h")!.gap).toBeUndefined();
    expect(keptWords(late)).toContain(`perp:BTC 1h: the bars from ${iso(T0H).slice(0, 16)} to ${iso(T0H + 1_000 * H).slice(0, 16)} UTC rolled out of Hyperliquid's latest 5,000 before they were kept`);
    const bars = barsIn(cache, "BTC-PERP", "1h");
    expect(bars.length).toBe(10_000);
    expect(bars.find((b) => b.t > T0H - H && b.t < T0H + 1_000 * H)).toBeUndefined();
  });

  it("a source that does not answer: what was kept stays, the pass says it, and the next pass asks again", async () => {
    let now = T0;
    let down = false;
    const { cache, keep } = setUp({ now: () => now, down: () => down });
    await keep();
    now += 24 * H;
    down = true;
    const failed = await keep();
    expect(failed.added).toBe(0);
    expect(failed.failed).toEqual(["perp:BTC", "perp:ETH"].flatMap((market) => ["1h", "4h"].map((interval) => ({ market, interval, why: "the stand-in does not answer" }))));
    expect(keptWords(failed)).toContain("perp:BTC 1h not answered (the stand-in does not answer): asked again on the next pass");
    expect(barsIn(cache, "BTC-PERP", "1h").length).toBe(5_000);
    down = false;
    const back = await keep();
    expect(back.failed).toEqual([]);
    expect(back.kept.find((k) => k.market === "perp:BTC" && k.interval === "1h")).toMatchObject({ added: 24, kept: 5_024 });
    // a market never kept that the source does not answer is a refusal: nothing is written for it
    down = true;
    const fresh = setUp({ now: () => now, down: () => down });
    const none = await fresh.keep();
    expect(none.kept).toEqual([]);
    expect(none.failed.length).toBe(4);
    expect(existsSync(join(fresh.cache, "hl", "BTC-PERP", "1h.json"))).toBe(false);
  });

  it("keeps perpetuals only, the ledger's newest first, KEEP_MOST at most, a name that does not read left out", () => {
    const { home, cache } = setUp({ now: () => T0 });
    tried(home, ["perp:BAD!", "stock:AAPL", ...Array.from({ length: 12 }, (_, i) => `perp:OLD${i}`)], T0 - 10 * H);
    tried(home, Array.from({ length: 12 }, (_, i) => `perp:NEW${i}`), T0 - H);
    const keep = marketsToKeep(home, cache, "hl");
    expect(keep.length).toBe(KEEP_MOST);
    expect(keep.slice(0, 4).map((r) => r.base)).toEqual(["BTC", "ETH", "NEW0", "NEW1"]);
    expect(keep.every((r) => r.cls === "perp")).toBe(true);
    expect(keep.map((r) => r.base)).not.toContain("BAD!");
    expect(keep[KEEP_MOST - 1]!.base).toBe("OLD9");
  });

  it("a backtest reading a file and a top-up of the same file at once take their turns: what each added is kept", async () => {
    const { cache, sources } = setUp({ now: () => T0 + 10 * H, delayMs: 30 });
    const clock = () => T0;
    const had = await loadHistory({ refs: [BTC], interval: "1h", from: T0 - 1_000 * H, to: T0, cache, sources, clock });
    if (isRefusal(had)) throw new Error(had.message);
    expect(had.markets[0]!.bars.length).toBe(999);
    // the older 2,000 hours for a backtest, and the newest ten for the keeper, both read the same file before either writes it
    const [wider, topped] = await Promise.all([loadHistory({ refs: [BTC], interval: "1h", from: T0 - 3_000 * H, to: T0 - 1_000 * H, cache, sources, clock }), topUpBars(BTC, "1h", { cache, sources, clock: () => T0 + 10 * H })]);
    if (isRefusal(wider) || isRefusal(topped)) throw new Error("refused");
    expect(wider.markets[0]!.bars.length).toBe(2_000);
    expect(topped).toMatchObject({ added: 10 });
    const bars = barsIn(cache, "BTC-PERP", "1h");
    expect(bars.length).toBe(3_009);
    expect(bars[0]!.t).toBe(T0H - 2_999 * H);
    expect(bars[bars.length - 1]!.t).toBe(T0H + 9 * H);
  });

  it("the real server's pass (lookAtHistory): the cache kept growing, no row in the ledger, no holdout, one pass at a time", async () => {
    const home = tmp();
    const perp = hyperliquid({ now: () => T0, delayMs: 5 });
    const liveDeps: Partial<LiveDeps> = { clock: () => T0, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
    const owner = simKey("owner");
    const svc = await PortfolioService.create({ home, now: () => iso(T0), venues: "frontline", real: true, liveDeps, publicMarkets: [], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: iso(T0) }] }, backtest: { sources: { perp, spot: untouched("cb"), stock: untouched("us") } } });
    const [pass, alongside] = await Promise.all([svc.lookAtHistory(), svc.lookAtHistory()]);
    expect(pass).toMatchObject({ markets: ["perp:BTC", "perp:ETH"], added: 4 * 5_000, failed: [] });
    expect(alongside).toBeUndefined();
    expect(existsSync(join(home, "history", "hl", "BTC-PERP", "1h.json"))).toBe(true);
    expect(existsSync(trialsFile(home))).toBe(false);
    expect(existsSync(holdoutFile(home))).toBe(false);
  });
});
