import { describe, expect, it } from "vitest";
import { isRefusal } from "../../src/core/errors.ts";
import { HL_WORLD_CATEGORIES, hyperliquidWorldPublic, type Listing } from "../../src/portfolio/live/public-markets.ts";
import { hip3Net, NOW } from "./live-public-markets-fixtures.ts";

/** HYPERLIQUID'S HIP-3 PERPETUALS ON THE WORLD'S MARKETS (public-markets.ts hyperliquidWorldPublic): the markets Hyperliquid files under
 * stocks, commodities, indices, fx and rates, listed from the same answers the pre-IPO source reads — a share's by its ticker, its dex
 * carried in the symbol and the venue's name, Hyperliquid's category as its own — a delisted or unheld one left out, a pre-IPO one left
 * to the pre-IPO source; the search; its bars by the dex-prefixed coin; the categories' words. Nothing leaves the process */
const clock = () => NOW;
const rows = (l: Listing[] | { code: string }) => (Array.isArray(l) ? l.map((x) => [x.symbol, x.base, x.category, x.venueName, x.price, x.volumeUsd24h, x.maxLeverage]) : l);

describe("the world's markets at Hyperliquid's HIP-3 dexes", () => {
  it("lists the markets Hyperliquid files under the world's categories, the busiest first — each its dex's own contract on the share's ticker, with the category, the dex in the venue's name, the mark, the day and the funding — and leaves out the pre-IPO ones, a delisted one and one nobody holds or trades; asks each dex once", async () => {
    const net = hip3Net();
    const src = hyperliquidWorldPublic({ http: net.http, clock });
    expect(src).toMatchObject({ id: "hyperliquid-world", name: "Hyperliquid", kind: "exchange" });
    const all = await src.listings({ limit: 20 });
    expect(rows(all)).toEqual([
      ["xyz:SPCX-PERP", "SPCX", "Stocks", "Hyperliquid · xyz", 162.155, 130765387.0174000561, 20],
      ["io:SNDK-PERP", "SNDK", "Stocks", "Hyperliquid · io", 1607.35, 34317738.9263400212, 10],
      ["xyz:TSLA-PERP", "TSLA", "Stocks", "Hyperliquid · xyz", 370.91, 16042154.0029200036, 20],
      ["para:AVGO-PERP", "AVGO", "Stocks", "Hyperliquid · para", 360.22, 73392.2648, 10],
      ["mkts:KALSHI-PERP", "KALSHI", "Stocks", "Hyperliquid · mkts", 11.2, 50000, 3],
    ]);
    const spcx = (all as Listing[])[0]!;
    expect(spcx).toMatchObject({ kind: "perp", quote: "USDC", open: true, name: "SPCX perpetual on Hyperliquid · xyz", fundingRate: 0.00000625, change24h: -4.815 });
    expect(spcx.changePct24h).toBe(-2.8838);
    expect(spcx.nextFundingAt).toBeDefined();
    // every dex with a world market asked once, the pre-IPO-only one (vntl) not at all
    expect(net.asked("metaAndAssetCtxs").sort()).toEqual(["flx", "io", "mkts", "para", "xyz"]);
    expect(net.asked("perpDexs")).toEqual(["perpDexs"]);
    expect(net.asked("perpCategories")).toEqual(["perpCategories"]);
    // a search by the share, the coin or the category
    expect(rows(await src.listings({ q: "tsla", limit: 20 }))).toEqual([["xyz:TSLA-PERP", "TSLA", "Stocks", "Hyperliquid · xyz", 370.91, 16042154.0029200036, 20]]);
    expect((await src.listings({ q: "stocks", limit: 2 }) as Listing[]).map((l) => l.symbol)).toEqual(["xyz:SPCX-PERP", "io:SNDK-PERP"]);
    expect(await src.listings({ q: "anth", limit: 20 })).toEqual([]);
    // the sentence under the list names the categories shown
    expect(src.notes?.({})).toEqual(["Hyperliquid's HIP-3 perpetuals on the world's markets — stocks — which anyone may deploy; shown while someone holds or trades one; each contract is its dex's own, on its oracle's price, not the share or the commodity itself."]);
    // kept: a second listing asks nothing
    const before = net.sent.length;
    await src.listings({ limit: 20 });
    expect(net.sent.length).toBe(before);
  });

  it("its bars by the dex-prefixed coin, a plain coin's refused; Hyperliquid refusing its categories or every dex is its refusal, one dex failing leaves the rest", async () => {
    const net = hip3Net();
    const src = hyperliquidWorldPublic({ http: net.http, clock });
    const bars = await src.candles!("xyz:TSLA-PERP", "1h", { limit: 2 });
    expect(isRefusal(bars)).toBe(false);
    expect(net.sent.filter((s) => s.body.type === "candleSnapshot").map((s) => (s.body.req as { coin: string }).coin)).toEqual(["xyz:TSLA"]);
    const plain = await src.candles!("BTC-PERP", "1h", { limit: 2 });
    expect(isRefusal(plain) && plain.code).toBe("E_ACCOUNT_BAD_ACTION");
    const noCats = hyperliquidWorldPublic({ http: hip3Net({ perpCategories: { status: 500, body: undefined, text: "" } }).http, clock });
    expect(isRefusal(await noCats.listings({ limit: 5 }))).toBe(true);
    const oneDown = hyperliquidWorldPublic({ http: hip3Net({ "dex:xyz": { status: 500, body: undefined, text: "" } }).http, clock });
    const rest = await oneDown.listings({ limit: 20 });
    expect((rest as Listing[]).map((l) => l.symbol)).toEqual(["io:SNDK-PERP", "para:AVGO-PERP", "mkts:KALSHI-PERP"]);
    expect(HL_WORLD_CATEGORIES).toEqual({ stocks: "Stocks", stock: "Stocks", commodities: "Commodities", indices: "Indices", fx: "Currencies", FX: "Currencies", rates: "Rates" });
  });
});
