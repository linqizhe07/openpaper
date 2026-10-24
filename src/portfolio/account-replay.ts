/** A RECORDED DAY REPLAYED THROUGH THE DESK (npm run account:replay).
 *
 * One of tardis.dev's recorded days of Hyperliquid (live/tardis.ts: the first day of each month is free and needs no key) is played back
 * at the account's own clock, which this command moves in steps: a fresh account in a home of its own, a paper account (live:paper) that
 * lists the recording's perpetuals and fills the desk's orders against the recorded book by its own rule (live/paper.ts: a market order
 * takes the ask or the bid of that moment, walks the book past the best level, pays the paper fee), and the desk hired as the superagent
 * at it — its seats let in, their trading limits signed, its autonomy on paper — thinking with the momentum script (account/brain-script.ts:
 * the stand-in's brain, no model and no key). Every step the paper account looks at its book (resting exits judged at that moment's quote,
 * funding paid) and the desk's clock ticks (its leads' orders read back, the plan's exits, a cycle when one is due, the reports at their
 * hour, the session's end): the whole machinery of account/desk.ts, over a real day of prices, in a minute or two of wall time. At the
 * end it says what the desk did — the funnel, the result, the equity's path, the closes — and leaves the home for a look: the room, the
 * desk's record and the paper book are the real files (desk/room.jsonl, desk/desk.json, paper/<venue>/book.json).
 *
 * WHAT A REPLAY IS NOT. It is not a backtest of a model: the brain is a script, so the result says how the desk's mechanics fare on that
 * day's prices — the paper account's fills, Risk's sizing, the plan's exits, the limits — and nothing about any model's judgement. A model
 * replayed over a past day would be judged with knowledge of what came after it (its training), so no model is offered here. Exits are
 * judged at each step at that step's quote: a take-profit or a stop touched and left between two steps is not seen (--step, 10 s by
 * default; the live account judges them on every tick of its venue's stream). The recording holds the day alone: the 24-hour figures
 * the desk is shown count from the day's first trade. The clock starts at 00:00 UTC of the day — 20:00 the evening before in New York,
 * where the desk's days and its evening report are kept.
 *
 *   npm run account:replay -- --day 2026-10-01 --symbols BTC,ETH,SOL --cash 25000 --every 5 --step 10 --risk 1 --hours 24
 *   --day      the day, YYYY-MM-DD (default: the latest first-of-a-month, which is free)   --symbols  Hyperliquid coins (default BTC,ETH,SOL)
 *   --cash     the paper account's dollars (25000)      --every  minutes between the desk's cycles (5)      --step  seconds the clock moves a step (10)
 *   --risk     the objective's risk per lead, % (1)      --max-open  leads open at once (3)       --report  the evening report's hour, New York (19:00)
 *   --hours    how much of the day to replay, from its start (24)    --cache  where the files are kept (~/.openpaper/tardis)    --home  the account's home (a fresh temporary directory)
 *   --quiet    no progress lines                        TARDIS_API_KEY  a tardis.dev Data API key, for a day that is not the first of a month */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { isRefusal, type Refusal } from "../core/errors.ts";
import { momentumScriptBrain } from "./account/brain-script.ts";
import { ROLE_SPECS, type DeskFunnel, type DeskReport, type DeskView, type RoleId } from "./account/desk.ts";
import type { Outcome } from "./account/exchange.ts";
import { signDevice, simKey } from "./account/sign.ts";
import type { LiveDeps } from "./live/index.ts";
import { DAY_MS, fetchTardis, hyperliquidReplaySource, latestFreeDay, parseBooks, parseTickers, parseTrades, replayMarket, replaySpan, tardisDay, tardisDayStart, type ReplayMarket, type TardisDataType } from "./live/tardis.ts";
import { no } from "./refuse.ts";
import { loadOpenness, PortfolioService } from "./service.ts";

const HOUR_MS = 3_600_000;
export const REPLAY_VENUE = "paper-replay";
export const REPLAY_EXCHANGE = "hyperliquid";
const ROLES: RoleId[] = ["head", "search", "risk", "sniper", "exit"];
const SEAT_DAYS = 30;
/** a paper seat's limit, as the page signs it (ui/superagent.js sgSeatLimit): the whole balance an order, fifty balances a day */
const PAPER_BUDGET_TIMES = 50;

export interface ReplayOptions {
  day: string;
  /** Hyperliquid coins (BTC) */
  symbols: string[];
  cash: number;
  everyMin: number;
  stepS: number;
  riskPct: number;
  maxOpen: number;
  reportAt: string;
  /** how much of the day, from its start: the desk's session is this long */
  hours: number;
  cache: string;
  home: string;
  apiKey?: string | undefined;
  /** the recording given outright (a test): nothing is fetched or read from the cache */
  markets?: ReplayMarket[] | undefined;
  /** told each line of progress (a simulated hour passed, a file read); nothing when absent */
  say?: ((line: string) => void) | undefined;
}

export interface ReplaySummary {
  day: string;
  exchange: string;
  symbols: string[];
  cash: number;
  everyMin: number;
  stepS: number;
  riskPct: number;
  hours: number;
  /** the moments replayed, ms UTC */
  from: number;
  to: number;
  steps: number;
  cycles: number;
  funnel: DeskFunnel;
  equity: { startUsd: number; endUsd: number; changeUsd: number; changePct: number; lowUsd: number; lowAt: string; highUsd: number; highAt: string };
  /** the paper account's own equity at the end, as the venue says it (the desk's equity is its leads' alone) */
  paperUsd: number;
  tape: DeskView["tape"];
  open: Array<{ id: string; symbol: string; side: string; sizeUsd?: number | undefined; entryPrice?: number | undefined; markPrice?: number | undefined; unrealizedUsd?: number | undefined }>;
  halted: boolean;
  reports: DeskReport[];
  roomLines: number;
  home: string;
  wallMs: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const usd = (n: number): string => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number): string => `${n < 0 ? "−" : "+"}${usd(n)}`;
const pct = (n: number): string => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)}%`;
const hhmm = (ms: number): string => iso(ms).slice(11, 16);

/** the recording read for each coin: its trades and its book are needed, its ticker taken where Tardis has it */
export async function loadReplay(o: Pick<ReplayOptions, "day" | "symbols" | "cache" | "apiKey" | "say">): Promise<ReplayMarket[] | Refusal> {
  const out: ReplayMarket[] = [];
  for (const coin of o.symbols) {
    const files: Partial<Record<TardisDataType, string>> = {};
    for (const dataType of ["trades", "book_snapshot_5", "derivative_ticker"] as const) {
      const f = await fetchTardis({ cache: o.cache, exchange: REPLAY_EXCHANGE, dataType, day: o.day, symbol: coin, apiKey: o.apiKey });
      if (isRefusal(f)) {
        if (dataType === "derivative_ticker" && f.code === "E_VENUE_REJECTED") {
          o.say?.(`${coin}: no ${dataType} recorded (${f.message}); funding and mark left out`);
          continue;
        }
        return f;
      }
      o.say?.(`${coin} ${dataType}: ${f.from === "cache" ? "kept at" : "downloaded to"} ${f.path} (${(f.bytes / 1_048_576).toFixed(1)} MB)`);
      files[dataType] = f.path;
    }
    const text = (p: string): string => gunzipSync(readFileSync(p)).toString("utf8");
    try {
      const trades = parseTrades(text(files.trades!));
      const books = parseBooks(text(files.book_snapshot_5!));
      const tickers = files.derivative_ticker ? parseTickers(text(files.derivative_ticker)) : undefined;
      if (!trades.n || !books.n) return no("E_VENUE_REJECTED", { venue: `tardis:${REPLAY_EXCHANGE}`, message: `${coin}'s recording of ${o.day} is empty (${trades.n} trades, ${books.n} book snapshots): Tardis had nothing for it that day` });
      const m = replayMarket(coin, trades, books, tickers);
      const span = replaySpan(m);
      o.say?.(`${m.symbol}: ${trades.n.toLocaleString("en-US")} trades, ${books.n.toLocaleString("en-US")} book snapshots${tickers ? `, ${tickers.n.toLocaleString("en-US")} ticker rows` : ""} · from ${iso(span.from).slice(0, 19).replace("T", " ")} to ${iso(span.to).slice(0, 19).replace("T", " ")} UTC · lot 10^-${m.szDecimals}`);
      out.push(m);
    } catch (err) {
      return no("E_VENUE_REJECTED", { venue: `tardis:${REPLAY_EXCHANGE}`, message: `${coin}'s recording could not be read: ${String((err as Error)?.message ?? err).slice(0, 200)}` });
    }
  }
  return out;
}

/** the day replayed: the account made, the desk hired, the clock walked, the result read (see the top of this file) */
export async function runReplay(o: ReplayOptions): Promise<ReplaySummary | Refusal> {
  const began = Date.now();
  const day = tardisDay(o.day);
  if (!day) return no("E_ACCOUNT_BAD_ACTION", { message: `a day is YYYY-MM-DD, not "${o.day.slice(0, 20)}"` });
  if (!(o.cash >= 100) || !(o.everyMin >= 1) || !(o.stepS >= 1) || !(o.riskPct > 0) || !(o.maxOpen >= 1) || !(o.hours > 0) || o.hours > 24) return no("E_ACCOUNT_BAD_ACTION", { message: "the cash is $100 at least, a cycle comes every minute at least, a step is a second at least, the risk is more than zero, a lead may be open at least, and the hours are 1 to 24" });
  const markets = o.markets ?? (await loadReplay(o));
  if (isRefusal(markets)) return markets;
  if (!markets.length) return no("E_ACCOUNT_BAD_ACTION", { message: "no market to replay: name a coin with --symbols" });
  mkdirSync(o.home, { recursive: true, mode: 0o700 });

  // ---- the clock, and the account on it ----
  const start = tardisDayStart(day);
  const end = start + Math.round(o.hours * HOUR_MS);
  let clock = start;
  const code = "RPLY-TRDS";
  const noNetwork: LiveDeps["http"] = async () => ({ status: 599, body: undefined, text: "a replay reaches no network" });
  const svc = await PortfolioService.create({
    home: o.home,
    venues: "frontline",
    real: true,
    fresh: true,
    liveWrites: { capUsd: 1_000_000, pairingCode: code },
    openness: { ...(loadOpenness() as object), sessionExpiresAt: iso(end + 30 * DAY_MS) },
    publicMarkets: [hyperliquidReplaySource({ day, markets, clock: () => clock })],
    desk: { brain: momentumScriptBrain(), tickMs: 0 },
    now: () => iso(clock),
    payHttp: async () => ({ status: 0, headers: {}, body: undefined, error: "a replay pays no one" }),
    liveDeps: { http: noNetwork, clock: () => clock, price: async () => undefined, openExchange: async () => undefined },
  });
  await svc.restoring;
  const engine = svc.account;
  const desk = svc.desk;
  if (!engine || !desk) return no("E_ACCOUNT_BAD_ACTION", { message: "the replay's account came up without its desk" });
  const seed = simKey("device:replay-seed");
  const paired = engine.pairDevice(seed.jwk, "Replay seed key", code);
  if (isRefusal(paired) || paired.role !== "owner") return no("E_ACCOUNT_BAD_ACTION", { message: "the replay's seed key could not pair as the first owner" });
  const own = async (what: string, draft: Record<string, unknown>): Promise<Outcome> => {
    const p = await engine.prepare(draft);
    const r = isRefusal(p) ? p : await svc.exchange({ action: p.action, nonce: p.action.nonce, signature: signDevice(seed, p.action) });
    if (isRefusal(r)) throw new Error(`${what}: ${r.code} · ${r.message}`);
    return r;
  };
  const summaryOr = async (): Promise<ReplaySummary | Refusal> => {
    try {
      await own("the paper account", { type: "connectVenue", venue: REPLAY_VENUE, connector: "live:paper", label: "Replay", credentialRef: String(Math.round(o.cash)) });
      const balance = Math.ceil(o.cash);
      for (const role of ROLES) {
        const k = desk.seatKeyOf(role);
        if (isRefusal(k)) throw new Error(`the ${role} seat's key: ${k.message}`);
        await own(`let in ${role}`, { type: "approveAgent", agentAddress: k.address, agentName: `Desk ${ROLE_SPECS[role].name.replace(" of desk", "")}`, validUntil: end + SEAT_DAYS * DAY_MS });
        if (ROLE_SPECS[role].trades) await own(`${role}'s limit`, { type: "approveSpend", agent: k.address, scope: "trade", allow: REPLAY_VENUE, perPayment: String(balance), budget: String(balance * PAPER_BUDGET_TIMES), windowHours: 0, validUntil: end + SEAT_DAYS * DAY_MS, renewHours: 24 });
      }
      await own("the hire", {
        type: "setDesk",
        desk: "desk",
        change: "hire",
        value: JSON.stringify({
          name: `Replay of ${day}`,
          objective: { text: `Ride the majors' momentum on paper, small and quick — ${REPLAY_VENUE_LABEL} ${day} replayed`, venue: REPLAY_VENUE, universe: "perps", targetPct: 3, maxRiskPct: o.riskPct, maxDailyLossPct: 5, hours: o.hours, everyMin: o.everyMin, reportAt: o.reportAt, maxOpen: o.maxOpen },
          brain: { model: "claude-opus-5-5", effort: "medium" },
          roles: ROLES.map((role) => ({ role, kind: "house" })),
          autonomy: { paper: true },
        }),
      });
    } catch (err) {
      return no("E_ACCOUNT_BAD_ACTION", { message: `the replay's account could not be set up — ${String((err as Error)?.message ?? err).slice(0, 300)}` });
    }

    // ---- the clock walked ----
    const stepMs = Math.round(o.stepS * 1000);
    let steps = 0;
    let saidHour = -1;
    for (clock = start; clock <= end; clock += stepMs) {
      steps++;
      await svc.lookAtPaper();
      await desk.tick();
      const hour = Math.floor((clock - start) / HOUR_MS);
      if (o.say && hour !== saidHour && clock < end) {
        saidHour = hour;
        const v = await desk.view();
        if (v) o.say(`${hhmm(clock)} UTC · equity ${usd(v.equity.nowUsd)} (${signed(v.equity.changeUsd)}) · cycles ${v.session?.cycles ?? 0} · placed ${v.funnel.placed} · closed ${v.funnel.closed} · open ${v.open.length}${v.session?.halted ? " · halted" : ""}`);
      }
    }
    // the last moment, whatever the step: the session ends there and writes its end report
    if (clock !== end) {
      clock = end;
      await svc.lookAtPaper();
      await desk.tick();
    }
    const v = await desk.view();
    if (!v) return no("E_ACCOUNT_BAD_ACTION", { message: "the desk's record could not be read at the end" });
    const points = v.equity.points.length ? v.equity.points : [[start, v.equity.startUsd] as [number, number]];
    const low = points.reduce((a, p) => (p[1] < a[1] ? p : a));
    const high = points.reduce((a, p) => (p[1] > a[1] ? p : a));
    const room = readLines(join(o.home, "desk", "room.jsonl"));
    const out: ReplaySummary = {
      day,
      exchange: REPLAY_EXCHANGE,
      symbols: markets.map((m) => m.symbol),
      cash: o.cash,
      everyMin: o.everyMin,
      stepS: o.stepS,
      riskPct: o.riskPct,
      hours: o.hours,
      from: start,
      to: end,
      steps,
      cycles: v.session?.cycles ?? 0,
      funnel: v.funnel,
      equity: { startUsd: v.equity.startUsd, endUsd: v.equity.nowUsd, changeUsd: v.equity.changeUsd, changePct: v.equity.changePct, lowUsd: low[1], lowAt: iso(low[0]), highUsd: high[1], highAt: iso(high[0]) },
      paperUsd: v.venue.usd,
      tape: v.tape,
      open: v.open.map((l) => ({ id: l.id, symbol: l.symbol, side: l.side, sizeUsd: l.sizeUsd, entryPrice: l.entry?.price, markPrice: l.markPrice, unrealizedUsd: l.unrealizedUsd })),
      halted: !!v.session?.halted,
      reports: v.reports,
      roomLines: room,
      home: o.home,
      wallMs: Date.now() - began,
    };
    writeFileSync(join(o.home, "replay.json"), `${JSON.stringify(out, null, 1)}\n`, { mode: 0o600 });
    return out;
  };
  return summaryOr();
}
const REPLAY_VENUE_LABEL = "Hyperliquid's";

function readLines(path: string): number {
  try {
    return readFileSync(path, "utf8").split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** the summary in words, for the terminal */
export function replayWords(s: ReplaySummary): string {
  const wall = s.wallMs >= 60_000 ? `${Math.floor(s.wallMs / 60_000)} min ${Math.round((s.wallMs % 60_000) / 1000)} s` : `${(s.wallMs / 1000).toFixed(1)} s`;
  const lines = [
    `Replay of Hyperliquid ${s.day} (tardis.dev) · ${s.symbols.join(", ")} · paper ${usd(s.cash)} · a cycle every ${s.everyMin} min · the clock in steps of ${s.stepS} s · ${s.hours} h in ${wall}`,
    `The desk (the momentum script for a brain): ${s.cycles} cycles · scanned ${s.funnel.scanned} · cleared ${s.funnel.cleared} · placed ${s.funnel.placed} · executed ${s.funnel.executed} · closed ${s.funnel.closed} · rejected ${s.funnel.rejected} · ${s.open.length} open at the end${s.halted ? " · HALTED at the day's loss line" : ""}`,
    `The result: ${signed(s.equity.changeUsd)} (${pct(s.equity.changePct)}) on the leads · ${s.tape.wins} wins, ${s.tape.losses} losses (${s.tape.winRatePct.toFixed(0)}%) · an average win ${pct(s.tape.avgWinPct)}, an average loss ${pct(s.tape.avgLossPct)} · the paper account ends at ${usd(s.paperUsd)}`,
    `The equity: ${usd(s.equity.startUsd)} → ${usd(s.equity.endUsd)} · low ${usd(s.equity.lowUsd)} at ${hhmm(Date.parse(s.equity.lowAt))} UTC · high ${usd(s.equity.highUsd)} at ${hhmm(Date.parse(s.equity.highAt))} UTC`,
  ];
  const closes = [...s.tape.closes].sort((a, b) => b.pnlUsd - a.pnlUsd);
  if (closes.length) {
    const say = (c: ReplaySummary["tape"]["closes"][number]) => `${c.id} ${c.symbol} ${signed(c.pnlUsd)} (${pct(c.roiPct)}) at ${hhmm(Date.parse(c.at))}`;
    lines.push(`The best closes: ${closes.slice(0, 3).map(say).join(" · ")}`);
    if (closes.length > 3) lines.push(`The worst: ${closes.slice(-3).reverse().map(say).join(" · ")}`);
  }
  for (const l of s.open) lines.push(`Open at the end: ${l.id} ${l.symbol} ${l.side === "buy" ? "long" : "short"}${l.sizeUsd !== undefined ? ` ${usd(l.sizeUsd)}` : ""}${l.entryPrice !== undefined ? ` from ${l.entryPrice}` : ""}${l.unrealizedUsd !== undefined ? ` · ${signed(l.unrealizedUsd)} unrealised` : ""}`);
  const endReport = s.reports.find((r) => r.kind === "end") ?? s.reports[s.reports.length - 1];
  if (endReport) lines.push(`${endReport.kind === "end" ? "The end report" : `The ${endReport.kind} report`}: ${endReport.text}`);
  lines.push(`The home: ${s.home} — the room (desk/room.jsonl, ${s.roomLines} lines), the desk's record (desk/desk.json), the paper book (paper/${REPLAY_VENUE}/book.json) and replay.json. Browse it: OPENPAPER_HOME=${s.home} npm run account`);
  return lines.join("\n");
}

// ---- the command ----

const USAGE = `usage: npm run account:replay -- [--day YYYY-MM-DD] [--symbols BTC,ETH,SOL] [--cash 25000] [--every 5] [--step 10] [--risk 1] [--max-open 3] [--report 19:00] [--hours 24] [--cache DIR] [--home DIR] [--quiet]
A recorded day of Hyperliquid (tardis.dev; the first day of each month is free) replayed through the desk on a paper account, with the momentum script for a brain.
TARDIS_API_KEY: a tardis.dev Data API key, for a day that is not the first of a month.`;

export function parseReplayArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, now = Date.now()): ReplayOptions | { error: string } | { help: true } {
  const flags = new Map<string, string | true>();
  const known = new Set(["--day", "--symbols", "--cash", "--every", "--step", "--risk", "--max-open", "--report", "--hours", "--cache", "--home", "--quiet", "--help", "-h"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const eq = a.indexOf("=");
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (!known.has(name)) return { error: `unknown option ${a.slice(0, 40)}\n${USAGE}` };
    if (name === "--quiet" || name === "--help" || name === "-h") {
      flags.set(name, true);
      continue;
    }
    const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (value === undefined || value.startsWith("--")) return { error: `${name} needs a value\n${USAGE}` };
    flags.set(name, value);
  }
  if (flags.has("--help") || flags.has("-h")) return { help: true };
  const str = (name: string, fallback: string): string => {
    const v = flags.get(name);
    return typeof v === "string" ? v : fallback;
  };
  const num = (name: string, fallback: number): number | string => {
    const v = flags.get(name);
    if (typeof v !== "string") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : `${name} is a number, not "${v.slice(0, 20)}"`;
  };
  const day = str("--day", latestFreeDay(now));
  if (!tardisDay(day)) return { error: `--day is YYYY-MM-DD, not "${day.slice(0, 20)}"` };
  const symbols = str("--symbols", "BTC,ETH,SOL").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length || symbols.some((s) => !/^[A-Z0-9]{1,12}$/.test(s))) return { error: "--symbols is a comma-separated list of Hyperliquid coins, like BTC,ETH,SOL" };
  const nums = { cash: num("--cash", 25_000), everyMin: num("--every", 5), stepS: num("--step", 10), riskPct: num("--risk", 1), maxOpen: num("--max-open", 3), hours: num("--hours", 24) };
  for (const v of Object.values(nums)) if (typeof v === "string") return { error: v };
  const reportAt = str("--report", "19:00");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reportAt)) return { error: `--report is HH:MM in New York, not "${reportAt.slice(0, 10)}"` };
  const apiKey = env.TARDIS_API_KEY?.trim();
  return {
    day,
    symbols,
    cash: nums.cash as number,
    everyMin: nums.everyMin as number,
    stepS: nums.stepS as number,
    riskPct: nums.riskPct as number,
    maxOpen: nums.maxOpen as number,
    hours: nums.hours as number,
    reportAt,
    cache: str("--cache", join(homedir(), ".openpaper", "tardis")),
    home: str("--home", mkdtempSync(join(tmpdir(), `openpaper-replay-${day}-`))),
    ...(apiKey ? { apiKey } : {}),
    ...(flags.has("--quiet") ? {} : { say: (line: string) => console.error(line) }),
  };
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const parsed = parseReplayArgs(process.argv.slice(2));
  if ("help" in parsed) {
    console.log(USAGE);
    process.exit(0);
  }
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(2);
  }
  const out = await runReplay(parsed);
  if (isRefusal(out)) {
    console.error(`${out.code}: ${out.message}`);
    process.exit(1);
  }
  console.log(replayWords(out));
  // the account's own timers are unreferenced; whatever else is still held (a paper book's write), the day is done
  process.exit(0);
}
