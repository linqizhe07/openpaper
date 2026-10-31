/** THE DESK OVER RECORDED BARS (npm run account:backtest -- --strategy desk): the account's own desk — its seats, Risk's sizing, the plan's
 * exits, the limits, the door — hired as the superagent at a paper account and played over recorded bars, as a replay of a tardis.dev day
 * (account-replay.ts) plays it over one recorded day. The brain is the momentum script (account/brain-script.ts: no model and no key):
 * Search names the markets listed in turn, Risk clears two leads in three at a size, a take-profit, a stop and a time limit, Exit holds
 * while the plan's exits close. So what a desk run says is how the desk's MACHINERY fares on those prices — the paper account's fills, the
 * plan's exits judged inside the bar that reached them, the limits, the sessions — and nothing about any model's judgement: a model asked
 * about a past it was trained on would be judged with hindsight, so none is offered.
 *
 * The account is a fresh one in a directory of the run's own: real accounts only, as `npm run account` runs, with no network; its public
 * markets are the recorded bars (backtest/source.ts historySource) and its paper account (live:paper) judges every look against them
 * (LiveDeps.paperBars). A seed key pairs as its owner and signs what the page would — the paper account connected with the run's money, the
 * desk's seats let in with the Superagent's limits, the hire with the autonomy on paper — and the clock walks from one bar's start to the
 * next: the paper account looks at its book (the bar that just closed judged: exits, funding, liquidations), then the desk's clock ticks (a
 * cycle each bar, the leads' orders read back, the plan's exits, the reports). A desk's session runs fourteen days at most: one that ends
 * before the window does is started again at once, its autonomy carried; a seat's key and its limit live 180 days at most (account/state.ts
 * MAX_AGENT_DAYS): a longer window lets the seats in again, the day before theirs run out. The equity is the paper account's own, at each
 * step; the fills and the funding are its book's. Every fill pays the paper account's own fee. No restart reads this account back and no page
 * watches it, so the desk keeps its record in memory and writes it once, at the end (DeskOptions.deferSaves), and a step reads only what
 * the run needs of it (Desk.glance): written at every line of the room and read whole at every step, the record was most of a run's time. */
import { mkdirSync, readFileSync } from "node:fs";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { momentumScriptBrain } from "../account/brain-script.ts";
import { readJournal, tripOfRow } from "../account/journal.ts";
import { ROLE_SPECS, type RoleId } from "../account/desk.ts";
import { ruleWords, type LessonRule } from "../account/lessons.ts";
import type { Outcome } from "../account/exchange.ts";
import { signDevice, simKey } from "../account/sign.ts";
import { MAX_AGENT_DAYS } from "../account/state.ts";
import type { LiveDeps } from "../live/index.ts";
import { PAPER_FEE_BPS, paperBookPath, type PaperBook } from "../live/paper.ts";
import { INTERVAL_MS } from "../live/trade.ts";
import { no } from "../refuse.ts";
import { loadOpenness, PortfolioService } from "../service.ts";
import { stepsOf, type BacktestFill, type BacktestRun } from "./engine.ts";
import { metricsOf, type EquityPoint } from "./metrics.ts";
import { historySource, type BacktestCosts, type BacktestMarket } from "./source.ts";
import { DESK_NAME, DESK_WORDS, deskParamWords, type DeskParams } from "./desk-params.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DESK_VENUE = "paper-desk";
const ROLES: RoleId[] = ["head", "search", "risk", "sniper", "exit"];
/** a paper seat's limit, as the page signs it (ui/superagent.js sgSeatLimit): the whole balance an order, fifty balances a day */
const PAPER_BUDGET_TIMES = 50;
/** the most a desk's session runs (account/desk.ts OBJECTIVE_BOUNDS.hours) */
const SESSION_MOST_H = 24 * 14;

const iso = (ms: number): string => new Date(ms).toISOString();

export interface DeskRunAsk {
  markets: BacktestMarket[];
  from: number;
  to: number;
  cashUsd: number;
  costs: BacktestCosts;
  params: DeskParams;
  /** the lessons' rules the desk is held to (account/lessons.ts): adopted in its account after the hire, by the seed key's signature, as the
   * owner adopts them — Risk judges them on every lead, the same code as on the account */
  rules?: LessonRule[] | undefined;
  /** the run's own directory: the fresh account's home */
  work: string;
  /** the most steps the run may take */
  maxSteps?: number | undefined;
  say?: ((line: string) => void) | undefined;
}

/** THE DESK PLAYED OVER THE BARS (see the top of this file): what came of it, in a backtest's own shape */
export async function runDeskBacktest(o: DeskRunAsk): Promise<BacktestRun | Refusal> {
  const started = Date.now();
  if (!o.markets.length) return no("E_ACCOUNT_BAD_ACTION", { message: "a desk backtest needs at least one market" });
  if (o.markets.some((m) => m.kind !== "perp")) return no("E_ACCOUNT_BAD_ACTION", { message: "the desk trades perpetuals here: perp:COIN markets only" });
  if (!(o.to > o.from)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest's window ends after it starts" });
  const steps = stepsOf(o.markets, o.from, o.to);
  if (steps.length < 2) return no("E_ACCOUNT_BAD_ACTION", { message: `no bar of ${o.markets.map((m) => m.symbol).join(", ")} starts in the window` });
  if (o.maxSteps !== undefined && steps.length > o.maxSteps) return no("E_ACCOUNT_BAD_ACTION", { message: `a desk backtest here steps ${o.maxSteps.toLocaleString("en-US")} times at most; this one would step ${steps.length.toLocaleString("en-US")} — a coarser bar or a shorter window` });
  const barMs = Math.min(...o.markets.map((m) => INTERVAL_MS[m.interval]));
  const end = steps[steps.length - 1]!;

  // ---- the clock, and the account on it ----
  let clock = steps[0]!;
  mkdirSync(o.work, { recursive: true, mode: 0o700 });
  const code = "DESK-BARS";
  const noNetwork: LiveDeps["http"] = async () => ({ status: 599, body: undefined, text: "a desk backtest reaches no network" });
  const svc = await PortfolioService.create({
    home: o.work,
    venues: "frontline",
    real: true,
    fresh: true,
    liveWrites: { capUsd: 1_000_000_000, pairingCode: code },
    openness: { ...(loadOpenness() as object), sessionExpiresAt: iso(end + 30 * DAY_MS) },
    publicMarkets: [historySource({ markets: o.markets, clock: () => clock, costs: o.costs })],
    desk: { brain: momentumScriptBrain("claude-opus-5-5", { sizeUsd: o.params.sizeUsd, tpPct: o.params.tpPct, slPct: o.params.slPct, maxHours: o.params.maxHours }), tickMs: 0, deferSaves: true },
    now: () => iso(clock),
    payHttp: async () => ({ status: 0, headers: {}, body: undefined, error: "a desk backtest pays no one" }),
    liveDeps: { http: noNetwork, clock: () => clock, price: async () => undefined, openExchange: async () => undefined, paperBars: true },
  });
  await svc.restoring;
  const engine = svc.account;
  const desk = svc.desk;
  if (!engine || !desk) return no("E_ACCOUNT_BAD_ACTION", { message: "the desk backtest's account came up without its desk" });
  const seed = simKey("device:desk-backtest-seed");
  const paired = engine.pairDevice(seed.jwk, "Desk backtest seed key", code);
  if (isRefusal(paired) || paired.role !== "owner") return no("E_ACCOUNT_BAD_ACTION", { message: "the desk backtest's seed key could not pair as the first owner" });
  const own = async (what: string, draft: Record<string, unknown>): Promise<Outcome> => {
    const p = await engine.prepare(draft);
    const r = isRefusal(p) ? p : await svc.exchange({ action: p.action, nonce: p.action.nonce, signature: signDevice(seed, p.action) });
    if (isRefusal(r)) throw new Error(`${what}: ${r.code} · ${r.message}`);
    return r;
  };
  const windowH = Math.ceil((end - clock) / HOUR_MS);
  const sessionH = Math.max(1, Math.min(SESSION_MOST_H, windowH));
  const everyMin = Math.max(1, Math.min(240, Math.round(barMs / 60_000)));
  const resume = (): Promise<Outcome> => own("a new session", { type: "setDesk", desk: "desk", change: "resume", value: JSON.stringify({ autonomy: { paper: true } }) });
  const balance = Math.ceil(o.cashUsd);
  /** the seats let in, the traders with their limits: until the window's end and a month, or as long as a key lives from now if that is
   * sooner — the same keys let in again replace their entries */
  const letIn = async (): Promise<number> => {
    const until = Math.min(end + 30 * DAY_MS, clock + (MAX_AGENT_DAYS - 1) * DAY_MS);
    for (const role of ROLES) {
      const k = desk.seatKeyOf(role);
      if (isRefusal(k)) throw new Error(`the ${role} seat's key: ${k.message}`);
      await own(`let in ${role}`, { type: "approveAgent", agentAddress: k.address, agentName: `Desk ${ROLE_SPECS[role].name.replace(" of desk", "")}`, validUntil: until });
      if (ROLE_SPECS[role].trades) await own(`${role}'s limit`, { type: "approveSpend", agent: k.address, scope: "trade", allow: DESK_VENUE, perPayment: String(balance), budget: String(balance * PAPER_BUDGET_TIMES), windowHours: 0, validUntil: until, renewHours: 24 });
    }
    return until;
  };
  let keysUntil = 0;
  /** the times the seats were let in again on the way */
  let letAgain = 0;
  try {
    await own("the paper account", { type: "connectVenue", venue: DESK_VENUE, connector: "live:paper", label: "Desk backtest", credentialRef: String(Math.round(o.cashUsd)) });
    keysUntil = await letIn();
    await own("the hire", {
      type: "setDesk",
      desk: "desk",
      change: "hire",
      value: JSON.stringify({
        name: "Desk backtest",
        objective: { text: `Trade ${o.markets.map((m) => m.base).join(", ")} on paper with the momentum script, over recorded bars`, venue: DESK_VENUE, universe: "perps", targetPct: 3, maxRiskPct: o.params.riskPct, maxDailyLossPct: o.params.dayLossPct, hours: sessionH, everyMin, reportAt: "19:00", maxOpen: o.params.maxOpen },
        brain: { model: "claude-opus-5-5", effort: "medium" },
        roles: ROLES.map((role) => ({ role, kind: "house" })),
        autonomy: { paper: true },
      }),
    });
    // the lessons the run is held to, adopted as the owner adopts one: in force from the first lead
    for (const rule of o.rules ?? []) await own("a lesson", { type: "setDesk", desk: "desk", change: "lesson", value: JSON.stringify({ op: "adopt", text: ruleWords(rule), rule }) });
  } catch (err) {
    return no("E_ACCOUNT_BAD_ACTION", { message: `the desk backtest's account could not be set up — ${String((err as Error)?.message ?? err).slice(0, 300)}` });
  }

  // ---- the clock walked: a bar a step ----
  const equity: EquityPoint[] = [];
  /** every fill the paper book wrote, by its own key: the book keeps its latest 500, so it is read once a day of the run (a desk fills a few
   * dozen times a day at most), and at the end */
  const seen = new Map<string, BacktestFill>();
  const gather = (): void => {
    let book: PaperBook;
    try {
      book = JSON.parse(readFileSync(paperBookPath(o.work, DESK_VENUE), "utf8")) as PaperBook;
    } catch {
      return;
    }
    for (const f of book.fills ?? []) {
      const key = `${f.ref}|${f.at}|${f.side}|${f.qty}|${f.price}`;
      if (!seen.has(key)) seen.set(key, { at: f.at, symbol: f.symbol, side: f.side as "buy" | "sell", qty: f.qty, price: f.price, feeUsd: f.feeUsd, ...(f.realizedUsd !== undefined ? { realizedUsd: f.realizedUsd } : {}), ...(f.note ? { note: f.note } : {}) });
    }
  };
  let sessions = 1;
  let cycles = 0;
  /** the halts the day's loss line called, each once (a halt lifts by itself the next day: the session runs on) */
  const halts = new Set<string>();
  const funnel = { scanned: 0, cleared: 0, placed: 0, closed: 0, rejected: 0 };
  /** a session's figures added in once it ends (a new one starts from nothing) */
  const fold = (v: Awaited<ReturnType<typeof desk.glance>>): void => {
    if (!v) return;
    cycles += v.session?.cycles ?? 0;
    for (const k of Object.keys(funnel) as Array<keyof typeof funnel>) funnel[k] += v.funnel[k] ?? 0;
  };
  let saidDay = -1;
  try {
    for (let k = 0; k < steps.length; k++) {
      clock = steps[k]!;
      if (clock >= keysUntil - DAY_MS && keysUntil < end) {
        keysUntil = await letIn();
        letAgain++;
      }
      await svc.lookAtPaper();
      await desk.tick();
      let v = await desk.glance();
      if (!v) return no("E_ACCOUNT_BAD_ACTION", { message: "the desk's record could not be read" });
      if (v.session?.halted) halts.add(v.session.halted.at);
      // a session that ended (its fourteen days) before the window did: started again, its autonomy carried. A halted one is not ended —
      // its new leads wait until the next day, its open leads keep their plan — and is left to lift by itself
      if (k < steps.length - 1 && v.session?.state === "ended") {
        fold(v);
        await resume();
        sessions++;
        v = (await desk.glance()) ?? v;
      }
      // the desk's open leads, at the dollars each was opened with: what it holds of the equity
      equity.push({ t: clock, usd: Number(v.venueUsd.toFixed(6)), grossUsd: Number(v.openUsd.toFixed(2)) });
      if (k % Math.max(1, Math.round(DAY_MS / barMs)) === 0) gather();
      const day = Math.floor((clock - steps[0]!) / DAY_MS);
      if (o.say && day !== saidDay && day % 7 === 0) {
        saidDay = day;
        o.say(`${iso(clock).slice(0, 16)} · equity $${v.venueUsd.toFixed(2)} · session ${sessions} · cycles ${cycles + (v.session?.cycles ?? 0)} · placed ${funnel.placed + v.funnel.placed}`);
      }
    }
    fold(await desk.glance());
    desk.flush();
  } catch (err) {
    return no("E_ACCOUNT_BAD_ACTION", { message: `the desk backtest stopped at ${iso(clock)}: ${String((err as Error)?.message ?? err).slice(0, 300)}` });
  }

  // ---- what came of it, from the paper account's own book ----
  let book: PaperBook | undefined;
  try {
    book = JSON.parse(readFileSync(paperBookPath(o.work, DESK_VENUE), "utf8")) as PaperBook;
  } catch {
    return no("E_ACCOUNT_BAD_ACTION", { message: "the desk backtest's paper book could not be read" });
  }
  gather();
  const fills = [...seen.values()].sort((a, b) => a.at.localeCompare(b.at));
  const rows = book.funding ?? [];
  const paid = rows.filter((f) => f.usd > 0).reduce((s, f) => s + f.usd, 0);
  const received = -rows.filter((f) => f.usd < 0).reduce((s, f) => s + f.usd, 0);
  const metrics = metricsOf(equity, { fills: fills.length, tradedUsd: fills.reduce((s, f) => s + f.qty * f.price, 0), feesUsd: fills.reduce((s, f) => s + f.feeUsd, 0), fundingUsd: paid - received, slippageUsd: 0 });
  const notes = [
    `the desk ran ${sessions} session${sessions === 1 ? "" : "s"} of ${sessionH} h at most, a cycle every ${everyMin} min: ${cycles.toLocaleString("en-US")} cycles, ${funnel.scanned} leads scanned, ${funnel.cleared} cleared and ${funnel.rejected} turned down by Risk, ${funnel.placed} placed, ${funnel.closed} closed${halts.size ? `; the day's loss line (${o.params.dayLossPct}%) halted new leads ${halts.size} time${halts.size === 1 ? "" : "s"}, each until the next day` : ""}${letAgain ? `; its seats were let in again ${letAgain} time${letAgain === 1 ? "" : "s"}, a key living ${MAX_AGENT_DAYS} days at most` : ""}`,
    `every exit is judged inside the bar that reached it, its stop before its take-profit where one bar reached both (the paper account's rule): with exits narrower than a bar's range, that is a loss the bar cannot rule out`,
    `the brain is the momentum script, not a model: the result is the desk's machinery on these prices, not anyone's judgement`,
    ...(o.rules?.length ? [`held to ${o.rules.length === 1 ? "a lesson" : `${o.rules.length} lessons`} — ${o.rules.map(ruleWords).join("; ")} — adopted in its account before the first lead, so Risk judged every lead by ${o.rules.length === 1 ? "it" : "them"} before its brain was asked`] : []),
  ];
  const params: Record<string, number> = { ...o.params };
  return {
    strategy: { id: "desk", name: DESK_NAME, words: DESK_WORDS, params, paramWords: `${deskParamWords(o.params)}${o.rules?.length ? ` · held to ${o.rules.map(ruleWords).join("; ")}` : ""}`, ...(o.rules?.length ? { rules: o.rules } : {}) },
    markets: o.markets.map((m) => ({ symbol: m.symbol, kind: m.kind, name: m.name, from: m.from, interval: m.interval, bars: m.bars.length, first: iso(m.bars[0]?.t ?? 0), last: iso((m.bars[m.bars.length - 1]?.t ?? 0) + INTERVAL_MS[m.interval]), fundingHours: m.funding?.length ?? 0 })),
    from: iso(steps[0]!),
    to: iso(end),
    cashUsd: o.cashUsd,
    feeBps: PAPER_FEE_BPS,
    leverage: 1,
    costs: { halfSpreadBps: o.costs.halfSpreadBps, participation: o.costs.participation, levelBps: o.costs.levelBps, levels: o.costs.levels },
    equity,
    fills,
    funding: { paidUsd: Number(paid.toFixed(2)), receivedUsd: Number(received.toFixed(2)), hours: rows.length },
    // the round trips it closed, as its account's journal kept them, each with the lead that placed it
    trips: readJournal(o.work).rows.map(tripOfRow),
    refused: [],
    metrics,
    notes,
    wallMs: Date.now() - started,
  };
}
