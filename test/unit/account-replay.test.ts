import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal } from "../../src/core/errors.ts";
import { parseReplayArgs, replayWords, runReplay, type ReplayOptions, type ReplaySummary } from "../../src/portfolio/account-replay.ts";
import { BOOK_LEVELS, parseBooks, parseTrades, replayMarket } from "../../src/portfolio/live/tardis.ts";

/** A RECORDED DAY REPLAYED THROUGH THE DESK (account-replay.ts): the command's options read strictly, and a short replay run whole — a
 * fresh account on the day's clock, the paper account over the recording, the desk hired with the momentum script — whose fills, exits
 * and summary are the recording's. The recording here is made up: a price that rises past the plan's take-profit, then falls past a stop. */
const T0 = Date.parse("2026-10-01T00:00:00Z");
const S = 1_000;
const MIN = 60_000;
const us = (ms: number): string => `${ms}000`;

/** one trade and one book every ten seconds for `minutes`, the price from `priceAt(minute)`, the book half a dollar either side */
function recording(minutes: number, priceAt: (minute: number) => number) {
  const tr = ["exchange,symbol,timestamp,local_timestamp,id,side,price,amount"];
  const head = ["exchange", "symbol", "timestamp", "local_timestamp"];
  for (let l = 0; l < BOOK_LEVELS; l++) head.push(`asks[${l}].price`, `asks[${l}].amount`, `bids[${l}].price`, `bids[${l}].amount`);
  const bk = [head.join(",")];
  for (let ms = 0; ms <= minutes * MIN; ms += 10 * S) {
    const p = Math.round(priceAt(ms / MIN) * 10) / 10;
    tr.push(`hyperliquid,BTC,${us(T0 + ms)},${us(T0 + ms + 1_500)},${ms},${ms % 20_000 ? "sell" : "buy"},${p},0.00123`);
    const levels: string[] = [];
    for (let l = 0; l < BOOK_LEVELS; l++) levels.push(String(p + 0.5 + l), "10", String(p - 0.5 - l), "10");
    bk.push(`hyperliquid,BTC,${us(T0 + ms - 500)},${us(T0 + ms)},${levels.join(",")}`);
  }
  return replayMarket("BTC", parseTrades(`${tr.join("\n")}\n`), parseBooks(`${bk.join("\n")}\n`));
}

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "replay-"));
  homes.push(d);
  return d;
};

describe("the command's options", () => {
  const NOW = Date.parse("2026-10-24T12:00:00Z");
  const parse = (argv: string[], env: NodeJS.ProcessEnv = {}) => parseReplayArgs(argv, env, NOW);

  it("defaults to the latest free day, the majors, $25,000, a cycle every five minutes, ten-second steps; reads each option, = or not", () => {
    const d = parse([]) as ReplayOptions;
    expect(d).toMatchObject({ day: "2026-10-01", symbols: ["BTC", "ETH", "SOL"], cash: 25_000, everyMin: 5, stepS: 10, riskPct: 1, maxOpen: 3, hours: 24, reportAt: "19:00" });
    expect(d.cache.endsWith(join(".openpaper", "tardis"))).toBe(true);
    expect(existsSync(d.home)).toBe(true);
    homes.push(d.home);
    expect(typeof d.say).toBe("function");
    expect(d.apiKey).toBeUndefined();
    const o = parse(["--day", "2026-09-01", "--symbols", "btc, hype", "--cash=1000", "--every", "1", "--step=5", "--risk", "2.5", "--max-open", "1", "--hours", "3", "--report", "21:30", "--cache", "/c", "--home", "/h", "--quiet"], { TARDIS_API_KEY: " TD.k " }) as ReplayOptions;
    expect(o).toEqual({ day: "2026-09-01", symbols: ["BTC", "HYPE"], cash: 1000, everyMin: 1, stepS: 5, riskPct: 2.5, maxOpen: 1, hours: 3, reportAt: "21:30", cache: "/c", home: "/h", apiKey: "TD.k" });
  });

  it("refuses what it cannot read, naming it, and prints the usage for --help or a stray option", () => {
    const err = (argv: string[]) => (parse(argv) as { error: string }).error;
    expect(err(["--days", "1"])).toMatch(/^unknown option --days\nusage: npm run account:replay/);
    expect(err(["--day"])).toMatch(/^--day needs a value/);
    expect(err(["--day", "--quiet"])).toMatch(/^--day needs a value/);
    expect(err(["--day", "2026-13-01"])).toBe('--day is YYYY-MM-DD, not "2026-13-01"');
    expect(err(["--symbols", "BTC/USDT"])).toBe("--symbols is a comma-separated list of Hyperliquid coins, like BTC,ETH,SOL");
    expect(err(["--cash", "lots"])).toBe('--cash is a number, not "lots"');
    expect(err(["--report", "7pm"])).toBe('--report is HH:MM in New York, not "7pm"');
    expect(parse(["--help"])).toEqual({ help: true });
    expect(parse(["-h"])).toEqual({ help: true });
  });
});

describe("a day replayed", () => {
  it("runs the desk over the recording: the paper account fills at the recorded book, the plan's take-profit and stop close the leads, the summary and replay.json say so", async () => {
    // flat for two minutes, up 0.6% by minute 15, down 1.2% from there by minute 40, flat after: the first lead's take-profit (+0.4%)
    // fills on the way up, a later lead's stop (−0.4%) on the way down
    const market = recording(60, (m) => (m <= 2 ? 100_000 : m <= 15 ? 100_000 * (1 + (0.006 * (m - 2)) / 13) : m <= 40 ? 100_600 * (1 - (0.012 * (m - 15)) / 25) : 99_392.8));
    const home = tmp();
    const said: string[] = [];
    const o: ReplayOptions = { day: "2026-10-01", symbols: ["BTC"], cash: 10_000, everyMin: 5, stepS: 10, riskPct: 1, maxOpen: 3, reportAt: "19:00", hours: 1, cache: tmp(), home, markets: [market], say: (l) => void said.push(l) };
    const s = await runReplay(o);
    if (isRefusal(s)) throw new Error(s.message);
    expect(s).toMatchObject({ day: "2026-10-01", exchange: "hyperliquid", symbols: ["BTC-PERP"], cash: 10_000, everyMin: 5, stepS: 10, hours: 1, from: T0, to: T0 + 60 * MIN, steps: 361, cycles: 12, home });
    // the first lead: scanned at the first cycle, cleared at $60 (0.0005x BTC at Hyperliquid's lot of 0.00001), filled at the recorded ask,
    // closed at its take-profit on the way up
    expect(s.funnel.placed).toBeGreaterThanOrEqual(2);
    expect(s.funnel.closed).toBeGreaterThanOrEqual(2);
    expect(s.tape.wins).toBeGreaterThanOrEqual(1);
    expect(s.tape.losses).toBeGreaterThanOrEqual(1);
    const closes = [...s.tape.closes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    expect(closes[0]?.pnlUsd).toBeGreaterThan(0);
    expect(Date.parse(closes[0]!.at)).toBeLessThan(T0 + 16 * MIN);
    expect(s.equity.startUsd).toBe(10_000);
    expect(s.equity.highUsd).toBeGreaterThan(10_000);
    expect(s.equity.highAt > s.equity.lowAt || s.equity.lowAt > s.equity.highAt).toBe(true);
    expect(s.reports.map((r) => r.kind)).toEqual(["start", "end"]);
    expect(s.halted).toBe(false);
    expect(s.wallMs).toBeGreaterThanOrEqual(0);
    // the room: the hire, the fill in the paper account's words, the plan's close
    const room = readFileSync(join(home, "desk", "room.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { from: string; kind: string; text: string });
    expect(s.roomLines).toBe(room.length);
    expect(room.find((m) => m.from === "sniper" && m.kind === "order")?.text).toMatch(/^L-0001: filled, bought 0\.0005\d BTC at 100,000\.5 at Replay · paper \(on its own on paper, inside the limit\), its take-profit at 100,[34]\d\d(\.\d+)? and its stop at 99,[56]\d\d(\.\d+)? held by the venue\.$/);
    expect(room.some((m) => /L-0001/.test(m.text) && /take-profit|TP HIT/i.test(m.text) && m.from === "exit")).toBe(true);
    // the paper book is the real one, under the venue's own directory; replay.json is the summary
    expect(existsSync(join(home, "paper", "paper-replay", "book.json"))).toBe(true);
    const json = JSON.parse(readFileSync(join(home, "replay.json"), "utf8")) as ReplaySummary;
    expect(json.funnel).toEqual(s.funnel);
    // the progress, an hour at a time, and the words
    expect(said).toEqual([expect.stringMatching(/^00:00 UTC · equity \$10,000\.00 \(\+\$0\.00\) · cycles 0 · placed 0 · closed 0 · open 0$/)]);
    const words = replayWords(s);
    expect(words).toContain("Replay of Hyperliquid 2026-10-01 (tardis.dev) · BTC-PERP · paper $10,000.00 · a cycle every 5 min · the clock in steps of 10 s · 1 h in ");
    expect(words).toContain(`The desk (the momentum script for a brain): 12 cycles · scanned ${s.funnel.scanned} · cleared ${s.funnel.cleared} · placed ${s.funnel.placed}`);
    expect(words).toContain("The best closes: L-0001 BTC-PERP +$");
    expect(words).toContain("The end report: SESSION REPORT");
    expect(words).toContain(`The home: ${home} — the room (desk/room.jsonl, ${s.roomLines} lines)`);
  }, 60_000);

  it("refuses a day that is not one, numbers out of range, and nothing to replay — before any account is made", async () => {
    const base: ReplayOptions = { day: "2026-10-01", symbols: ["BTC"], cash: 10_000, everyMin: 5, stepS: 10, riskPct: 1, maxOpen: 3, reportAt: "19:00", hours: 1, cache: tmp(), home: tmp(), markets: [] };
    expect((await runReplay({ ...base, day: "yesterday" }) as { message: string }).message).toBe('a day is YYYY-MM-DD, not "yesterday"');
    expect((await runReplay({ ...base, hours: 25 }) as { message: string }).message).toContain("the hours are 1 to 24");
    expect((await runReplay({ ...base, cash: 5 }) as { message: string }).message).toContain("the cash is $100 at least");
    expect((await runReplay(base) as { message: string }).message).toBe("no market to replay: name a coin with --symbols");
    expect(existsSync(join(base.home, "desk"))).toBe(false);
  });
});
