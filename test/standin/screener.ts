/** THE STAND-IN'S SCREENER: a made-up list of shares on the stand-in's clock, screened and folded by the real reader's own arithmetic
 * (live/screener.ts screen · fold · countriesOf · checkAsk), so the Screener page and portfolio_screener can be looked at with no
 * network. Every name says it is the stand-in's; the day's changes drift with the clock */
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { checkAsk, countriesOf, fold, SCREEN_LIMIT, screen, type ScreenAsk, type ScreenerReader, type ScreenRow, type ScreenView } from "../../src/portfolio/live/screener.ts";

const DAY = 86_400_000;
const wave = (now: number, k: number) => Math.sin((now / DAY) * Math.PI * 2 + k);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const SECTORS: Array<[string, string[]]> = [
  ["Technology", ["Semiconductors", "Computer Software: Prepackaged Software", "Computer Manufacturing", "EDP Services"]],
  ["Finance", ["Major Banks", "Investment Managers", "Property-Casualty Insurers"]],
  ["Health Care", ["Biotechnology: Pharmaceutical Preparations", "Medical/Dental Instruments"]],
  ["Consumer Discretionary", ["Catalog/Specialty Distribution", "Restaurants", "Auto Manufacturing"]],
  ["Energy", ["Oil & Gas Production", "Oilfield Services/Equipment"]],
  ["Industrials", ["Aerospace", "Railroads"]],
  ["Utilities", ["Electric Utilities: Central"]],
  ["Real Estate", ["Real Estate Investment Trusts"]],
];
const COUNTRIES = ["United States", "United States", "United States", "United States", "Canada", "China", "Israel", "United Kingdom"];
const NAMED: Array<[string, string, string, number]> = [["AAPL", "Technology", "Computer Manufacturing", 3.4e12], ["NVDA", "Technology", "Semiconductors", 3.1e12], ["MSFT", "Technology", "Computer Software: Prepackaged Software", 3.0e12], ["JPM", "Finance", "Major Banks", 6.5e11], ["LLY", "Health Care", "Biotechnology: Pharmaceutical Preparations", 7.2e11], ["AMZN", "Consumer Discretionary", "Catalog/Specialty Distribution", 2.2e12], ["TSLA", "Consumer Discretionary", "Auto Manufacturing", 8.4e11], ["XOM", "Energy", "Oil & Gas Production", 5.0e11]];
/** a hundred and twenty made-up shares, the named eight among them */
export function standinUniverse(now: number): ScreenRow[] {
  const rows: ScreenRow[] = NAMED.map(([symbol, sector, industry, cap], i) => {
    const price = round(40 + ((cap / 1e10) % 400) + wave(now, i) * 3, 2);
    const changePct = round(wave(now, i * 1.7) * 2.5, 3);
    const volume = Math.round(cap / price / 400);
    return { symbol, name: `${symbol} Stand-in Common Stock`, price, change: round((price * changePct) / 100, 2), changePct, marketCapUsd: Math.round(cap * (1 + changePct / 100)), volume, dollarVolume: Math.round(price * volume), country: "United States", ipoYear: 1980 + (i * 5) % 40, sector, industry };
  });
  for (let i = 0; i < 112; i++) {
    const [sector, industries] = SECTORS[i % SECTORS.length]!;
    const industry = industries[(i * 7) % industries.length]!;
    const symbol = `S${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))}${i % 10}`;
    const cap = Math.round(2e8 * 1.08 ** (i % 60) * (1 + (i % 7)));
    const price = round(5 + (i % 90) * 2.5 + wave(now, i) * 1.5, 2);
    const changePct = round(wave(now, i * 0.37) * 4 + (i % 5 === 0 ? 3 : 0), 3);
    const volume = Math.round((cap / price) * 0.004);
    rows.push({ symbol, name: `Stand-in ${sector} Company ${i + 1}`, price, change: round((price * changePct) / 100, 2), changePct, ...(i % 13 === 12 ? {} : { marketCapUsd: cap }), volume, dollarVolume: Math.round(price * volume), country: COUNTRIES[i % COUNTRIES.length]!, ...(i % 4 === 3 ? {} : { ipoYear: 1985 + (i % 40) }), sector, industry });
  }
  return rows;
}
export function standinScreener(clock: () => number): ScreenerReader {
  return {
    async screen(raw: ScreenAsk | Record<string, unknown> = {}): Promise<ScreenView | Refusal> {
      const ask = checkAsk(raw as Record<string, unknown>);
      if (isRefusal(ask)) return ask;
      const now = clock();
      const rows = standinUniverse(now);
      const matched = screen(rows, ask);
      return {
        asOf: new Date(now).toISOString(),
        readAt: new Date(now - 90_000).toISOString(),
        listAsOf: `${new Date(now).toISOString().slice(0, 10)} (stand-in)`,
        universe: rows.length,
        matched: matched.length,
        rows: matched.slice(0, ask.limit ?? SCREEN_LIMIT),
        sectors: fold(rows),
        countries: countriesOf(rows),
        ask,
        from: "Stand-in Exchange's list · as written",
        notes: ["Every share here is made up by the stand-in and its day drifts with the clock. A real account reads Nasdaq's screener: every US-listed common share, the day's figures as Nasdaq wrote them when the list was read."],
      };
    },
    clear() {},
  };
}
