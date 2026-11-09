/** THE STAND-IN'S CALENDARS: made-up releases, earnings, dividends, splits and IPOs on the stand-in's own days, so the Calendar page and
 * portfolio_calendar can be looked at with no network. Every row says it is the stand-in's; the shares are the stand-in broker's (AAPL,
 * NVDA, SPY) and the stock tokens' (TSLA). The day asked decides what is there: a weekday has rows, a weekend has none, as the real
 * calendars do; the figures follow the stand-in's clock so "Today" always has something. The reading, the days' order and the limits
 * are the real reader's (live/calendars.ts) */
import type { Refusal } from "../../src/core/errors.ts";
import { CALENDAR_KINDS, nyDayOf, releaseAt, type CalendarAsk, type CalendarEvent, type CalendarKind, type CalendarReader, type CalendarView } from "../../src/portfolio/live/calendars.ts";
import { no } from "../../src/portfolio/refuse.ts";

const DAY = 86_400_000;
const dow = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`)).getUTCDay();
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** a figure that varies by the day, so two days never read alike */
const seed = (day: string, k: number) => ((Number(day.slice(8)) * 7 + Number(day.slice(5, 7)) * 3 + k) % 11) - 5;

function economic(day: string, today: string): CalendarEvent[] {
  if (dow(day) === 0 || dow(day) === 6) return [];
  const past = day < today;
  const rows: Array<[string, string, string, string | undefined, string | undefined, string | undefined]> = [
    ["08:30", "United States", "Stand-in CPI (MoM)", past ? `${(0.2 + seed(day, 1) / 20).toFixed(1)}%` : undefined, "0.2%", "0.3%"],
    ["08:30", "United States", "Stand-in Initial Jobless Claims", past ? `${(220 + seed(day, 2) * 3).toLocaleString("en-US")}K` : undefined, "225K", "221K"],
    ["10:00", "United States", "Stand-in Consumer Sentiment", past ? `${(68 + seed(day, 3)).toFixed(1)}` : undefined, "68.0", "67.1"],
    ["14:00", "United States", "Stand-in Central Bank rate decision", past ? "4.25%" : undefined, "4.25%", "4.25%"],
    ["02:00", "Germany", "Stand-in Factory Orders (MoM)", past ? `${(0.5 + seed(day, 4) / 10).toFixed(1)}%` : undefined, "0.4%", "-0.8%"],
    ["21:30", "China", "Stand-in Trade Balance", past ? `${(95 + seed(day, 5) * 2).toFixed(1)}B` : undefined, "92.0B", "90.5B"],
    ["", "Japan", "Stand-in Bank holiday", undefined, undefined, undefined],
  ];
  return rows.sort((a, b) => (a[0] || "~").localeCompare(b[0] || "~")).map(([time, country, event, actual, consensus, previous]) => {
    const at = time ? releaseAt(day, time) : undefined;
    const a = actual !== undefined ? Number.parseFloat(actual.replace(/[^\d.-]/g, "")) : undefined;
    const c = consensus !== undefined ? Number.parseFloat(consensus.replace(/[^\d.-]/g, "")) : undefined;
    return { kind: "economic", day, ...(at ? { at, time } : {}), country, event, ...(actual !== undefined ? { actual } : {}), ...(consensus !== undefined ? { consensus } : {}), ...(previous !== undefined ? { previous } : {}), ...(a !== undefined && c !== undefined ? { against: a > c ? "above" : a < c ? "below" : "same" } : {}), description: "A made-up release of the stand-in's, timed in New York like the real calendar's." };
  });
}
function earnings(day: string): CalendarEvent[] {
  if (dow(day) === 0 || dow(day) === 6) return [];
  const rows: Array<[string, string, "pre" | "post" | "unknown", number, number, number, number]> = [
    ["AAPL", "Apple Inc. (stand-in)", "post", 3.4e12, 1.62 + seed(day, 1) / 100, 28, 1.46],
    ["NVDA", "NVIDIA Corporation (stand-in)", "post", 4.4e12, 1.21 + seed(day, 2) / 100, 35, 0.81],
    ["SPY", "SPDR S&P 500 ETF Trust (stand-in)", "unknown", 6.6e11, 0, 0, 0],
    ["TSLA", "Tesla, Inc. (stand-in)", "pre", 1.2e12, 0.58 + seed(day, 3) / 100, 22, 0.72],
  ];
  return rows.filter(([, , , , eps]) => eps !== 0 || dow(day) === 3).map(([symbol, name, when, cap, eps, ests, last]) => ({ kind: "earnings", day, symbol, name, when, marketCapUsd: cap, quarterEnding: "Sep/2026", ...(eps ? { epsForecast: Number(eps.toFixed(2)), estimates: ests, lastYearDay: shift(day, -364), lastYearEps: last } : {}) }));
}
function dividends(day: string): CalendarEvent[] {
  if (dow(day) === 0 || dow(day) === 6) return [];
  return [
    { kind: "dividend", day, symbol: "AAPL", name: "Apple Inc. (stand-in)", exDay: day, paymentDay: shift(day, 14), recordDay: day, announcedDay: shift(day, -10), amount: 0.26, annual: 1.04 },
    { kind: "dividend", day, symbol: "SPY", name: "SPDR S&P 500 ETF Trust (stand-in)", exDay: day, paymentDay: shift(day, 30), recordDay: day, amount: 1.75 + seed(day, 1) / 100, annual: 7.1 },
  ];
}
function splits(day: string): CalendarEvent[] {
  if (dow(day) === 0 || dow(day) === 6) return [];
  return [{ kind: "split", day, symbol: "NVDA", name: "NVIDIA Corporation (stand-in)", ratio: "10:1", executionDay: shift(day, 7) }, { kind: "split", day, symbol: "TSLA", name: "Tesla, Inc. (stand-in)", ratio: "3:1", executionDay: shift(day, 12) }];
}
function ipos(month: string): CalendarEvent[] {
  return [
    { kind: "ipo", stage: "priced", day: `${month}-03`, symbol: "SIPO", name: "Stand-in Robotics Holdings", exchange: "Stand-in Exchange", priceUsd: 18, shares: 12_000_000, raisedUsd: 216_000_000 },
    { kind: "ipo", stage: "upcoming", day: `${month}-21`, symbol: "SIPA", name: "Stand-in Payments Corp.", exchange: "Stand-in Exchange", priceUsd: 24, shares: 8_000_000, raisedUsd: 192_000_000 },
    { kind: "ipo", stage: "filed", day: `${month}-11`, name: "Stand-in Energy Partners", raisedUsd: 100_000_000 },
    { kind: "ipo", stage: "withdrawn", day: `${month}-06`, name: "Stand-in Retail Group", shares: 5_000_000, raisedUsd: 60_000_000 },
  ];
}

export function standinCalendars(clock: () => number): CalendarReader {
  return {
    async events(ask: CalendarAsk = {}): Promise<CalendarView | Refusal> {
      const kind: CalendarKind | undefined = CALENDAR_KINDS.find((k) => k.id === ask.kind)?.id ?? (ask.kind ? undefined : "economic");
      if (!kind) return no("E_ACCOUNT_BAD_ACTION", { message: `the calendar has these kinds: ${CALENDAR_KINDS.map((k) => k.id).join(" · ")}` });
      const today = nyDayOf(clock());
      const from = ask.from ? String(ask.from) : today;
      const to = ask.to ? String(ask.to) : from;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return no("E_ACCOUNT_BAD_ACTION", { message: "a calendar is read for days written YYYY-MM-DD" });
      const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
      if (span < 0 || span >= 7) return no("E_ACCOUNT_BAD_ACTION", { message: "a calendar is read for 7 days at most, from the first day on" });
      const symbol = String(ask.symbol ?? "").trim().toUpperCase();
      const limit = Math.min(500, Math.max(1, Math.trunc(Number(ask.limit) || 200)));
      const days = kind === "ipos" ? [from] : Array.from({ length: span + 1 }, (_, i) => shift(from, i));
      let items: CalendarEvent[] = [];
      for (const d of days) items = items.concat(kind === "economic" ? economic(d, today) : kind === "earnings" ? earnings(d) : kind === "dividends" ? dividends(d) : kind === "splits" ? splits(d) : ipos(d.slice(0, 7)));
      if (symbol) items = items.filter((e) => "symbol" in e && e.symbol === symbol);
      const readAt = new Date(clock() - 15_000).toISOString();
      return {
        asOf: new Date(clock()).toISOString(),
        kind,
        from,
        to,
        items: items.slice(0, limit),
        total: items.length,
        days: days.map((d) => ({ day: d, count: items.filter((e) => e.day === d || kind === "ipos").length, readAt })),
        missing: [],
        notes: ["Every row here is made up by the stand-in on the stand-in's own days. A real account reads Nasdaq's calendars."],
        ...(symbol ? { symbol } : {}),
      };
    },
    clear() {},
  };
}
