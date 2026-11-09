import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { fixedHosts } from "../../src/portfolio/live/public-markets.ts";
import { checkAsk, countriesOf, fold, nasdaqScreener, pickRows, SCREEN_LIMIT, SCREEN_SORTS, SCREENER_FAIL_MS, SCREENER_HOSTS, SCREENER_KEEP_MS, SCREENER_URL, screen, type ScreenRow, type ScreenView } from "../../src/portfolio/live/screener.ts";
import type { Http, HttpReply } from "../../src/portfolio/live/types.ts";
import { NASDAQ_UA } from "../../src/portfolio/live/us-quotes.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** THE SCREENER (live/screener.ts): Nasdaq's list read into rows — the shape as read from this machine on 2026-11-09 — what is asked
 * checked, the screen and its sorts, the map by sector and industry weighed by market cap, the list read once and kept, the hosts, the
 * route. Nothing leaves the process */
const START = Date.parse("2026-11-09T22:40:00Z");
const row = (symbol: string, name: string, lastsale: string, netchange: string, pctchange: string, marketCap: string, country: string, ipoyear: string, volume: string, sector: string, industry: string) => ({ symbol, name, lastsale, netchange, pctchange, marketCap, country, ipoyear, volume, sector, industry, url: `/market-activity/stocks/${symbol.toLowerCase()}` });
const LIST = {
  data: {
    asOf: null,
    headers: { symbol: "Symbol", name: "Name" },
    rows: [
      row("A", "Agilent Technologies Inc. Common Stock", "$174.72", "2.94", "1.711%", "49258609371.00", "United States", "1999", "2048545", "Industrials", "Biotechnology: Laboratory Analytical Instruments"),
      row("AAPL", "Apple Inc. Common Stock", "$342.37", "-1.80", "-0.523%", "4975383151340.00", "United States", "1980", "44703810", "Technology", "Computer Manufacturing"),
      row("NVDA", "NVIDIA Corporation Common Stock", "$186.64", "5.04", "2.775%", "4498024000000.00", "United States", "1999", "180000000", "Technology", "Semiconductors"),
      row("TSM", "Taiwan Semiconductor Manufacturing Company Ltd.", "$375.22", "22.12", "6.265%", "1946080370079.00", "Taiwan", "1997", "9000000", "Technology", "Semiconductors"),
      row("ADAM", "Adamas Trust Inc. Common Stock", "$5.69", "-0.23", "-3.885%", "513834005.00", "United States", "", "1938487", "Real Estate", "Real Estate Investment Trusts"),
      row("ABR^D", "Arbor Realty Trust 6.375% Series D Cumulative Redeemable Preferred Stock", "$22.10", "0.05", "0.227%", "", "United States", "", "20000", "Real Estate", "Real Estate Investment Trusts"),
      row("ZZZZ", "A fund with nothing", "", "", "", "", "", "", "", "", ""),
      row("BRK/B", "Berkshire Hathaway Inc.", "$570.89", "+1.20", "+0.21%", "1268893795690.00", "United States", "", "5000000", "", ""),
    ],
  },
  message: null,
  status: { rCode: 200, bCodeMessage: null, developerMessage: null },
};
const view = (v: ScreenView | Refusal): ScreenView => {
  if (isRefusal(v)) throw new Error(`${v.code}: ${v.message}`);
  return v;
};

describe("Nasdaq's list as rows", () => {
  it("reads each row's strings into figures (a dollar sign, a percent, a plus, an empty cap or year as none), the dollar volume from the last sale and the volume, and leaves out a preferred share's caret and a row with no price or name", () => {
    const { rows } = pickRows(LIST);
    expect(rows.map((r) => r.symbol)).toEqual(["A", "AAPL", "NVDA", "TSM", "ADAM", "ZZZZ", "BRK/B"]);
    expect(rows[1]).toEqual({ symbol: "AAPL", name: "Apple Inc. Common Stock", price: 342.37, change: -1.8, changePct: -0.523, marketCapUsd: 4975383151340, volume: 44703810, dollarVolume: Math.round(342.37 * 44703810), country: "United States", ipoYear: 1980, sector: "Technology", industry: "Computer Manufacturing" });
    expect(rows[4]).toMatchObject({ symbol: "ADAM", marketCapUsd: 513834005 });
    expect(rows[4]!.ipoYear).toBeUndefined();
    expect(rows[5]).toEqual({ symbol: "ZZZZ", name: "A fund with nothing" });
    expect(rows[6]).toMatchObject({ symbol: "BRK/B", change: 1.2, changePct: 0.21 });
    expect(rows[6]!.sector).toBeUndefined();
    expect(pickRows({ data: { rows: [] } }).rows).toEqual([]);
    expect(pickRows("<html>").rows).toEqual([]);
    expect(pickRows({ data: { asOf: "Nov 9, 2026", rows: [] } }).listAsOf).toBe("Nov 9, 2026");
  });

  it("checks what is asked: a name's letters, a figure in its range, the sorts and the direction, the limit; refuses the rest with the rule", () => {
    expect(checkAsk({})).toEqual({});
    expect(checkAsk({ sector: "Technology", industry: "Computer Software: Prepackaged Software", country: "United States", capMin: "1000", capMax: 5e12, priceMin: "1", priceMax: "1000", changeMin: "-5", changeMax: 50, volumeMin: "100000", ipoFrom: 2015, ipoTo: "2026", q: " apple ", sort: "changePct", dir: "asc", limit: "25" })).toEqual({ sector: "Technology", industry: "Computer Software: Prepackaged Software", country: "United States", capMin: 1000, capMax: 5e12, priceMin: 1, priceMax: 1000, changeMin: -5, changeMax: 50, volumeMin: 100000, ipoFrom: 2015, ipoTo: 2026, q: "apple", sort: "changePct", dir: "asc", limit: 25 });
    for (const bad of [{ sector: "<b>x</b>" }, { sector: "x".repeat(81) }, { capMin: "lots" }, { capMin: -1 }, { priceMax: 1e8 }, { changeMin: -200 }, { ipoFrom: 1800 }, { limit: 0 }, { limit: 501 }, { q: "x".repeat(61) }, { sort: "sideways" }, { dir: "up" }]) {
      const r = checkAsk(bad);
      expect(isRefusal(r), JSON.stringify(bad)).toBe(true);
      if (isRefusal(r)) expect(r.code).toBe("E_ACCOUNT_BAD_ACTION");
    }
    expect(SCREEN_SORTS).toEqual(["marketCap", "changePct", "volume", "price", "symbol", "name", "ipoYear", "dollarVolume"]);
  });

  it("screens: each rule a row must meet, the words of a name or symbol all present, the sort asked (the largest cap first unless said; names and symbols ascending; a row without the figure last)", () => {
    const { rows } = pickRows(LIST);
    const syms = (r: ScreenRow[]) => r.map((x) => x.symbol);
    expect(syms(screen(rows, {}))).toEqual(["AAPL", "NVDA", "TSM", "BRK/B", "A", "ADAM", "ZZZZ"]);
    expect(syms(screen(rows, { sector: "technology" }))).toEqual(["AAPL", "NVDA", "TSM"]);
    expect(syms(screen(rows, { industry: "Semiconductors", country: "United States" }))).toEqual(["NVDA"]);
    expect(syms(screen(rows, { capMin: 1e12, capMax: 2e12 }))).toEqual(["TSM", "BRK/B"]);
    expect(syms(screen(rows, { priceMin: 300, changeMin: 0 }))).toEqual(["TSM", "BRK/B"]);
    expect(syms(screen(rows, { changeMax: -0.5, sort: "changePct", dir: "asc" }))).toEqual(["ADAM", "AAPL"]);
    expect(syms(screen(rows, { volumeMin: 1e7, sort: "volume" }))).toEqual(["NVDA", "AAPL"]);
    expect(syms(screen(rows, { ipoFrom: 1999, ipoTo: 1999 }))).toEqual(["NVDA", "A"]);
    expect(syms(screen(rows, { q: "inc common" }))).toEqual(["AAPL", "A", "ADAM"]);
    expect(syms(screen(rows, { q: "tsm" }))).toEqual(["TSM"]);
    expect(syms(screen(rows, { sort: "symbol" }))).toEqual(["A", "AAPL", "ADAM", "BRK/B", "NVDA", "TSM", "ZZZZ"]);
    expect(syms(screen(rows, { sort: "name", dir: "desc" }))).toEqual(["TSM", "NVDA", "BRK/B", "AAPL", "ADAM", "A", "ZZZZ"].slice(0, 7).sort((a, b) => (rows.find((r) => r.symbol === a)!.name < rows.find((r) => r.symbol === b)!.name ? 1 : -1)));
    expect(syms(screen(rows, { sort: "dollarVolume" }))).toEqual(["NVDA", "AAPL", "TSM", "BRK/B", "A", "ADAM", "ZZZZ"]);
    expect(syms(screen(rows, { sort: "ipoYear", dir: "asc" }))).toEqual(["AAPL", "TSM", "A", "NVDA", "ADAM", "BRK/B", "ZZZZ"]);
    expect(screen(rows, { sector: "Nothing" })).toEqual([]);
  });

  it("folds the map: every sector with its industries, the largest cap first, the day weighed by cap over the rows that have one, the largest five named; the countries counted", () => {
    const { rows } = pickRows(LIST);
    const map = fold(rows);
    expect(map.map((s) => [s.name, s.n, s.rows, s.industries.length])).toEqual([["Technology", 3, 3, 2], ["No sector", 1, 2, 1], ["Industrials", 1, 1, 1], ["Real Estate", 1, 1, 1]]);
    const tech = map[0]!;
    expect(tech.capUsd).toBe(4975383151340 + 4498024000000 + 1946080370079);
    expect(tech.changePct).toBe(Math.round(((4975383151340 * -0.523 + 4498024000000 * 2.775 + 1946080370079 * 6.265) / tech.capUsd) * 100) / 100);
    expect(tech.top.map((t) => t.symbol)).toEqual(["AAPL", "NVDA", "TSM"]);
    expect(tech.industries.map((i) => [i.name, i.n])).toEqual([["Semiconductors", 2], ["Computer Manufacturing", 1]]);
    expect(map[1]!.industries[0]!.name).toBe("No industry");
    expect(map[1]!.top).toEqual([{ symbol: "BRK/B", capUsd: 1268893795690, changePct: 0.21 }]);
    expect(countriesOf(rows)).toEqual([{ name: "United States", n: 5 }, { name: "Taiwan", n: 1 }]);
  });
});

function network(answer: () => HttpReply) {
  const sent: Array<{ url: string; ua: string | undefined }> = [];
  const http: Http = async (url, init) => {
    sent.push({ url, ua: init?.headers?.["user-agent"] });
    return answer();
  };
  return { http, sent };
}

describe("the reader", () => {
  it("reads the list once with the desktop browser's user agent, keeps it five minutes and screens it as often as asked; checks the ask before reading; says Nasdaq's refusal and holds it a minute; the hosts", async () => {
    let mode: "ok" | "403" | "empty" = "ok";
    const net = network(() => (mode === "ok" ? { status: 200, body: LIST, text: "" } : mode === "403" ? { status: 403, body: undefined, text: "" } : { status: 200, body: { data: { rows: [] } }, text: "" }));
    let t = START;
    const d = nasdaqScreener({ http: net.http, clock: () => t });
    const v = view(await d.screen({}));
    expect([v.universe, v.matched, v.rows.length, v.sectors.length, v.countries.length]).toEqual([7, 7, 7, 4, 2]);
    expect(v.rows[0]!.symbol).toBe("AAPL");
    expect(v.readAt).toBe(new Date(START).toISOString());
    expect(v.from).toBe("Nasdaq's screener · as written");
    expect(net.sent).toEqual([{ url: SCREENER_URL, ua: NASDAQ_UA }]);
    const tech = view(await d.screen({ sector: "Technology", limit: 2 }));
    expect([tech.matched, tech.rows.length, tech.ask]).toEqual([3, 2, { sector: "Technology", limit: 2 }]);
    expect(net.sent).toHaveLength(1);
    t += SCREENER_KEEP_MS - 1;
    await d.screen({});
    expect(net.sent).toHaveLength(1);
    t += 2;
    await d.screen({});
    expect(net.sent).toHaveLength(2);
    expect(SCREEN_LIMIT).toBe(100);
    // checked before the list is read
    const bad = await d.screen({ sort: "sideways" });
    expect(isRefusal(bad) && bad.code).toBe("E_ACCOUNT_BAD_ACTION");
    expect(net.sent).toHaveLength(2);
    // refused: held a minute at least
    mode = "403";
    t += SCREENER_KEEP_MS + 1;
    const r = await d.screen({});
    expect(isRefusal(r)).toBe(true);
    expect(net.sent).toHaveLength(3);
    t += SCREENER_FAIL_MS - 1;
    await d.screen({});
    expect(net.sent).toHaveLength(3);
    t += 2;
    mode = "empty";
    const e = await d.screen({});
    expect(isRefusal(e) && e.message).toBe("Nasdaq's screener answered in a way this could not read");
    d.clear();
    mode = "ok";
    expect(isRefusal(await d.screen({}))).toBe(false);
    expect(SCREENER_HOSTS).toEqual(["api.nasdaq.com"]);
    const spy: Http = async () => ({ status: 200, body: LIST, text: "" });
    await expect(fixedHosts(spy, SCREENER_HOSTS, 1_000)("https://www.nasdaq.com/x")).rejects.toThrow("is not asked");
  });
});

describe("GET /api/account/screener", () => {
  const home = mkdtempSync(join(tmpdir(), "screener-route-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  it("answers the reader's view with what was asked read from the query, refuses what the reader refuses, and turns another site's page away", async () => {
    const asked: unknown[] = [];
    const svc = await PortfolioService.create({
      home,
      venues: "frontline",
      real: true,
      liveDeps: { http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined },
      readers: {
        screener: {
          async screen(ask) {
            asked.push(ask);
            const checked = checkAsk(ask as Record<string, unknown>);
            if (isRefusal(checked)) return checked;
            if (checked.sector === "Nowhere") return no("E_VENUE_UNREACHABLE", { message: "Nasdaq did not answer" });
            const rows = screen(pickRows(LIST).rows, checked);
            return { asOf: new Date(START).toISOString(), readAt: new Date(START).toISOString(), universe: 7, matched: rows.length, rows, sectors: fold(pickRows(LIST).rows), countries: countriesOf(pickRows(LIST).rows), ask: checked, from: "x", notes: [] };
          },
          clear() {},
        },
      },
    });
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const r = await fetch(`${srv.url}/api/account/screener?sector=Technology&capMin=1000000000000&sort=changePct&dir=asc&limit=2&q=common`);
      expect(r.status).toBe(200);
      const b = (await r.json()) as { ok: boolean; matched: number; rows: Array<{ symbol: string }>; ask: unknown };
      expect([b.ok, b.matched, b.rows.map((x) => x.symbol)]).toEqual([true, 2, ["AAPL", "NVDA"]]);
      expect(b.ask).toEqual({ sector: "Technology", capMin: 1e12, q: "common", sort: "changePct", dir: "asc", limit: 2 });
      expect((await fetch(`${srv.url}/api/account/screener?sort=sideways`)).status).toBe(409);
      expect((await fetch(`${srv.url}/api/account/screener?sector=Nowhere`)).status).toBe(409);
      expect((await fetch(`${srv.url}/api/account/screener`)).status).toBe(200);
      expect((await fetch(`${srv.url}/api/account/screener`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    } finally {
      await srv.close();
    }
  });
});
