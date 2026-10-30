/** THE DESK: the account's own agents, hired on the page — for the owner who has no agent of their own to connect, as the paper account
 * is for the owner who has no venue to connect. Eight seats, a charter each, one room, one objective, the approval line, the routines; a
 * live view of the run (the equity, the open leads, the tape of closes, the biggest ones). Shaped after the "eight agents run my desk"
 * pattern (a coordinator that never trades, specialists that find, clear, enter, exit and watch, one message format with a lead id at
 * every stage, reversible work done alone and signing done on approval) and after a perps bot's live screen (LIVE hh:mm of the session, the
 * equity and its curve, the position with its entry and take-profit lines, the trade tape, the big closes).
 *
 * The rule that makes it the ACCOUNT's desk and not a bot beside it: every seat is an agent key let in by the owner (approveAgent), and a
 * seat that trades does so inside a trading limit the owner signed (approveSpend), through the same door as any outside agent — Guard: a
 * card the owner answers; Beast: inside the limit, at once. CHARTERS BECOME LIMITS: the roles that must never trade (Head, Search, Risk,
 * Flow, Sentiment) hold no trading limit, so the door refuses them an order whatever they decide; the roles that trade (Sniper, Exit,
 * Watch) are bounded by the limit's size per order, its budget and its venues, and by the objective's own rules this file keeps (the most at
 * risk per lead, the day's loss at which the floor halts). The words in a charter steer the brain; they are not authority.
 *
 * A seat is HOUSE — the account runs it, with a brain — or OUTSIDE. The brains are every provider the account knows at once (brains.ts:
 * Claude through the Anthropic API, brain-claude.ts; OpenAI, DeepSeek, Grok, Muse, Kimi, Qwen, OpenRouter, Gemini, Groq, Together, a
 * local Ollama or vLLM, an endpoint the owner names — each its own OpenAI-format brain, brain-openai.ts; a scripted one in tests), each
 * with its own key, and the hired one thinks: a desk hired with a provider the account does not hold is said not to have a brain, and
 * no other is ever asked — or billed — in its place. OUTSIDE: an agent of the owner's own (Claude Code over MCP, any program with a key)
 * holding the seat: it reads the desk and its charter (portfolio_desk) and says things in the room (portfolio_desk_say, a signed
 * agentDeskSay). The two kinds are the same seat at the door; the Flow and Sentiment seats are outside-only, since they need data the
 * account does not have (a wallet-flow feed, a sentiment feed) and the account never pretends to.
 *
 * What a cycle does (every `everyMin` minutes while the session runs, or when the owner asks for one): the leads' orders are read back
 * from the account (fills, cards answered); EXIT reviews the open leads — the plan closes a lead at its take-profit, its stop or its time
 * limit without asking anyone, before the brain is asked anything, and the brain may then close one early; SEARCH reads Markets (the account's own listing of what the desk's venue
 * trades, movers and the most traded) and names leads; RISK checks each one — the market open, a price and a book, the spread, the day's
 * loss room, the size (the least of the objective's risk per lead, the Sniper's limit per order and what is left of its budget) — and
 * clears or rejects it; SNIPER places each cleared lead as the account's agentLiveOrder — at a paper account with the plan's take-profit
 * and stop as its bracket, so the paper account acts on them the moment the price reaches them; HEAD writes the cycle line, halts the floor when
 * the day's loss reaches the objective's line, and writes the evening report at the hour the objective names (and the weekly review on
 * Sundays). Between cycles the clock's every tick (30 s) reads the orders back and judges the plan's exits again — numbers, no brain — so a
 * stop never waits for the next cycle. Every step is a message in the room with the lead's id. Nothing in the room is invented: the account's reads, the door's
 * answers, the brain's words (said to be the brain's).
 *
 * The brain's cost is counted from the API's own token counts at the model's listed price — or the price the owner gives for a model no
 * list carries; without one the tokens are counted, unpriced — and shown as an estimate; without a brain
 * (no key) the desk is hired, its seats stand, and the room says so each cycle — no lead is made up.
 *
 * THE SUPERAGENT is this same desk at a paper account, trading on its own. In Guard every order an agent asks for waits for the owner on a
 * card, and Guard is the whole account's: so on paper the desk's orders would all be cards. The owner may sign one narrower thing instead
 * (setDesk `autonomy` {paper: true}): the desk's own house seats that trade, at the desk's venue, while that venue is a paper account, have
 * their orders placed at once — inside each seat's trading limit, as Beast would place them, and nothing else changes: an outside agent,
 * a key that holds no seat, another venue, a real-money venue, an order over the seat's limit are answered exactly as before. The door asks
 * this file (autonomyFor) and checks the venue is paper itself (live-orders.ts agent() and close()); the ledger row says the superagent
 * placed it. The desk refuses to move to a real-money venue while it is on. The owner may also sign it in the hire itself (hire's value
 * `autonomy`), so a desk started from the floor's Start never runs a moment, nor its first cycle, without it.
 *
 * What the floor draws comes from here too, and only from what the desk did: which seat is working on what right now and how many brain
 * calls are under way (in memory, gone on a restart), how long each role's last call took, the very table Search's brain was shown and what
 * it picked (the last scan, kept in the file), Search's confidence and Risk's hard-check numbers on each lead, and the room's new lines
 * since the page's last look (feed: the room's tail only, cheap enough to ask every second).
 *
 * Files: <home>/desk/desk.json (the desk: objective, seats, session, leads, equity points, reports, spend, the last scan, the autonomy)
 * and <home>/desk/room.jsonl
 * (the room, one message a line), the user's alone (0600), the first written whole each time (a temporary file, then a rename). The
 * seats' keys are in <home>/seats/desk-<role>.json (keystore.ts). The home is the trust boundary, as for the ledger. That folder is
 * shared with the MCP seats, which name their key file after the client's own name — so the "desk" names in it are the desk's alone, and an
 * outside client whose name would land on one is given a key file of its own beside them (outsideSeatFile).
 */
import { chmodSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { LedgerRowInput } from "../../agent/ledger.ts";
import { isRefusal, type Refusal } from "../../core/errors.ts";
import { no } from "../refuse.ts";
import type { TabId } from "../live/categories.ts";
import type { Exploration, ExploreItem } from "../live/explore.ts";
import type { LiveOrder } from "./live-orders.ts";
import { ceilTo, floorTo, type Market, type Position, type Side } from "../live/trade.ts";
import type { AccountPage, Outcome } from "./exchange.ts";
import { isKeyRejected, keyShaped, plainFieldName, type BrainKeyRejected } from "./brain-key.ts";
import { seatKey, slugOf } from "./keystore.ts";
import { signAgent, type Action, type AgentAction, type Envelope, type Hex, type SimKey } from "./sign.ts";
import type { TradeLead } from "./journal.ts";
import type { AgentKey } from "./state.ts";

// ---- the roles -------------------------------------------------------------------------------------------------------------------

export const ROLES = ["head", "search", "risk", "sniper", "exit", "watch", "flow", "sentiment"] as const;
export type RoleId = (typeof ROLES)[number];

export interface Charter {
  /** what the role owns */
  owns: string;
  /** what good output looks like, as checkable criteria */
  good: string;
  /** what it must never do without asking */
  never: string;
}

export interface RoleSpec {
  id: RoleId;
  /** its name on the desk */
  name: string;
  /** its tag in the room */
  tag: string;
  /** the account can run it (a house seat); false: only an outside agent fills it, and why */
  house: boolean;
  outsideOnly?: string | undefined;
  /** it places orders: it needs a trading limit, and the owner is asked for one at hiring */
  trades: boolean;
  charter: Charter;
}

export const ROLE_SPECS: Record<RoleId, RoleSpec> = {
  head: { id: "head", name: "Head of desk", tag: "HEAD", house: true, trades: false, charter: { owns: "The weekly objective turned into each day's work, the funnel (scanned → cleared → confirmed → executed → closed), the session's start report and the evening report, the halt when the day's loss reaches the line.", good: "A report that names numbers the account can show. One thing that worked and one change for tomorrow, each a sentence.", never: "Trade, sign, size a position, or widen a limit. It holds no key that can." } },
  search: { id: "search", name: "Search", tag: "SEARCH", house: true, trades: false, charter: { owns: "Leads: markets in the desk's universe worth a look, from what the account's own Markets listing shows now (movers, volume, what closes soon).", good: "At most three leads a cycle, each a symbol the venue lists, a side and a thesis in one sentence tied to a number the listing gave.", never: "Recommend a size or an entry. It holds no trading limit." } },
  risk: { id: "risk", name: "Risk", tag: "RISK", house: true, trades: false, charter: { owns: "Clearance: whether a lead may be entered, at what size, with what take-profit, stop and time limit.", good: "A verdict with the checks that decided it: the market open, a price and a book, the spread, the day's loss room, the size inside the objective's risk per lead and the Sniper's limit.", never: "Clear a lead the hard checks failed, or size above what the owner's limit allows. It holds no trading limit." } },
  sniper: { id: "sniper", name: "Sniper", tag: "SNIPER", house: true, trades: true, charter: { owns: "Entries: each cleared lead placed as one order at the desk's venue, at the size Risk cleared.", good: "An order that is exactly the clearance — the symbol, the side, the size — and the door's answer written in the room.", never: "Place anything Risk did not clear, or more than it cleared. In Guard every order waits for the owner on a card." } },
  exit: { id: "exit", name: "Exit", tag: "EXIT", house: true, trades: true, charter: { owns: "Open leads: the take-profit, the stop and the time limit of the plan, taken when the mark reaches them; closing a lead early when the thesis is gone.", good: "Each close named with its reason and the realised result, in the room.", never: "Add to a lead or average down. A close is an order through the door like any other." } },
  watch: { id: "watch", name: "Watch", tag: "WATCH", house: true, trades: true, charter: { owns: "Danger on open leads: the distance to liquidation, funding draining the margin, an event market closing, the venue not answering.", good: "A warning with the number that raised it; a close under the pre-approved rule when the number crosses the line.", never: "Open anything. It closes only what the desk holds." } },
  flow: { id: "flow", name: "Flow", tag: "FLOW", house: false, outsideOnly: "needs a feed of large and smart-money flows, which the account does not have: an agent of yours with that data fills this seat", trades: false, charter: { owns: "What large and informed money is doing in a lead's market: confirms, or stays quiet.", good: "A confirmation that names its source and its number.", never: "Size a position or recommend an entry." } },
  sentiment: { id: "sentiment", name: "Sentiment", tag: "SENTIMENT", house: false, outsideOnly: "needs a feed of social and news attention, which the account does not have: an agent of yours with that data fills this seat", trades: false, charter: { owns: "The attention a lead's market gets: news and social, by the hour.", good: "A reading with its source and a count; hype alone is never a confirmation.", never: "Treat attention as a reason to enter." } },
};

/** the name a house seat is let in under: plain text the account takes as an agent key's name */
export const seatName = (role: RoleId): string => `Desk ${ROLE_SPECS[role].name.replace(" of desk", "")}`;
/** the key file's name in <home>/seats */
export const seatFile = (role: RoleId): string => `desk-${role}`;
/** The key file an OUTSIDE seat (mcp.ts) keeps in <home>/seats, from the name it goes by — the MCP client's own name, or PORTFOLIO_AGENT.
 *
 * The house seats keep their keys in the same folder, under "desk-<role>", and a client names itself: one that called itself "Desk Sniper"
 * or "desk-exit" would otherwise open the desk's own house key, sign as the desk's Sniper or Exit, and — with the desk's autonomy on paper
 * — have its orders placed at once where any other agent's wait on a card. So the desk's namespace is reserved: every name whose file
 * would be "desk" or begin with "desk-" (as the keystore spells it: lower case, runs of anything else made one dash, the ends trimmed) is
 * given "mcp-<that name>" instead — a key of its own, made on first use, which the owner lets in like any other agent's and which no
 * autonomy covers. Every other name keeps the file it always had, so no seat already let in loses its key. */
export function outsideSeatFile(name: string): string {
  const file = slugOf(name);
  return /^desk(-|$)/.test(file) ? `mcp-${file}` : file;
}

// ---- what the desk is made of ---------------------------------------------------------------------------------------------------

export const UNIVERSES: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "all", label: "Anything the venue lists" },
  { id: "crypto", label: "Crypto" },
  { id: "perps", label: "Perpetuals" },
  { id: "stocks", label: "Stocks" },
  { id: "rwas", label: "Tokenised assets" },
  { id: "predictions", label: "Prediction markets" },
];

export interface DeskObjective {
  /** the owner's words: what the desk is for this week */
  text: string;
  /** the one venue the desk trades (its id on the account); a paper account is the recommended first one */
  venue: string;
  /** that venue's name on the account, as its row said it when the desk was hired or moved there: what the room and the page call it
   * while the venue is not connected (its row gone), so neither ever shows a raw id. Never the caller's words: the account's own */
  venueName?: string | undefined;
  /** which of Markets' tabs the leads come from */
  universe: TabId;
  /** the week's target, in percent of the equity the session started with */
  targetPct: number;
  /** the most one lead puts at risk, in percent of that equity (its size) */
  maxRiskPct: number;
  /** the day's loss at which the floor halts until the next day (New York), in percent of that equity */
  maxDailyLossPct: number;
  /** how long one session runs, in hours */
  hours: number;
  /** a cycle every this many minutes */
  everyMin: number;
  /** the evening report, New York wall clock, "21:00" */
  reportAt: string;
  /** the most leads open at once */
  maxOpen: number;
}

export interface BrainConfig {
  /** which brain thinks: the id of one the desk holds — "claude" (the Anthropic API, brain-claude.ts), or one of the OpenAI-format presets
   * ("openai", "deepseek", "xai", "meta", "moonshot", "qwen", "openrouter", "gemini", "groq", "together", "ollama", "vllm", "custom";
   * brains.ts, brain-openai.ts); a stand-in's "scripted" */
  provider: string;
  model: string;
  effort: "low" | "medium" | "high";
  /** the model's price per million tokens (in, out), the owner's number for a model the brain does not list — for the estimate */
  price?: { inUsd: number; outUsd: number } | undefined;
}

export interface DeskSeat {
  role: RoleId;
  kind: "house" | "outside";
  /** the agent key that holds the seat (a house seat's is the account's own, from keystore.ts) */
  address: Hex;
  /** its name on the account */
  name: string;
  charter: Charter;
  hiredAt: string;
}

export interface DeskSession {
  startedAt: string;
  /** the venue's equity when the session started, in dollars: what the run is measured from */
  startEquityUsd: number;
  hours: number;
  endsAt: string;
  pausedAt?: string | undefined;
  endedAt?: string | undefined;
  /** the floor halted: the day's loss reached the line; new leads wait until `until` */
  halted?: { at: string; why: string; until: string } | undefined;
  /** cycles run in this session */
  cycles: number;
}

export type LeadState = "scanned" | "rejected" | "cleared" | "confirmed" | "executed" | "closing" | "closed" | "refused";

/** Risk's hard checks on a lead, as numbers — the same ones its clearance line says in words: the spread in percent of the price (null where
 * the venue gives no bid and ask), the most the lead may be (the least of the objective's risk per lead, the Sniper's limit per order and
 * what is left of its budget), the day's loss room, the venue's smallest order (null where it names none). Kept on a rejected lead too,
 * once the market was priced: the floor's Risk gauge shows what the check saw */
export interface LeadChecks {
  spreadPct: number | null;
  maxSizeUsd: number;
  lossRoomUsd: number;
  minNotionalUsd: number | null;
}

export interface Lead {
  /** L-0047 */
  id: string;
  at: string;
  updatedAt: string;
  venue: string;
  symbol: string;
  name: string;
  kind: string;
  side: "buy" | "sell";
  thesis: string;
  state: LeadState;
  /** Search's own confidence in it, 0 to 1, as its brain gave it (the number its LEAD line says) */
  confidence?: number | undefined;
  /** Risk's hard-check numbers (LeadChecks) */
  checks?: LeadChecks | undefined;
  /** why it was rejected or refused, in the words of whoever did */
  why?: string | undefined;
  /** why Risk cleared it, in its words (the plan's reason): what the page says beside the entry, with the thesis */
  cleared?: string | undefined;
  /** the clearance: the size in dollars, the plan */
  sizeUsd?: number | undefined;
  tpPct?: number | undefined;
  slPct?: number | undefined;
  maxHours?: number | undefined;
  /** the entry order on the account, and the card it waited on */
  order?: string | undefined;
  card?: string | undefined;
  entry?: { price: number; qty: number; at: string; feeUsd: number; contractSize: number } | undefined;
  /** the plan's take-profit and stop as prices, sent with the entry as its bracket (entering): the venue holds them as the entry's exits,
   * the one that fills canceling the other, so they act the moment the price reaches them — not at the desk's next look */
  exits?: { takeProfit: number; stopLoss: number } | undefined;
  /** the exit order and its fill */
  exitOrder?: string | undefined;
  exitWhy?: string | undefined;
  exit?: { price: number; qty: number; at: string; feeUsd: number } | undefined;
  /** the realised result once closed, net of fees, and the return on the lead's size */
  pnlUsd?: number | undefined;
  roiPct?: number | undefined;
  /** the last mark the open lead was valued at */
  markPrice?: number | undefined;
  unrealizedUsd?: number | undefined;
  markAt?: string | undefined;
  /** the last close of it that did not go — the door refused it, or no house seat or no price could send it — when (ISO) and why. Between
   * cycles the clock's tick does not try the plan's close again until a cycle has passed since: a refusal is tried and said once a cycle,
   * as before the plan was judged at every tick, not every thirty seconds. A close that goes clears it */
  closeRefusedAt?: string | undefined;
  closeRefused?: string | undefined;
  /** when the room was last told the venue gave no mark for it (ISO): between cycles said again only once a cycle has passed */
  noMarkAt?: string | undefined;
}

export type RoomKind = "cycle" | "lead" | "clearance" | "order" | "card" | "exit" | "warning" | "halt" | "report" | "review" | "note" | "refusal" | "you";

export interface RoomMessage {
  seq: number;
  at: string;
  /** who said it: a role, the owner (you), or the account itself */
  from: RoleId | "you" | "account";
  kind: RoomKind;
  lead?: string | undefined;
  text: string;
  refs?: { card?: string | undefined; order?: string | undefined; symbol?: string | undefined } | undefined;
  /** the brain said it (a house seat's words), as opposed to the account's own numbers */
  brain?: true | undefined;
}

export interface DeskReport {
  at: string;
  kind: "start" | "evening" | "weekly" | "end";
  text: string;
}

/** What a seat is doing now: the step of the desk under way — Search reading Markets and asking its brain (scan), Risk checking a lead
 * (clear), the Sniper placing one (enter), the Exit marking the open leads and asking its brain (exit), a seat closing one (close), the
 * Head writing a report or the weekly review (report, review), the desk reading its orders back from the account (follow). Set around the
 * step and cleared after it, in memory only: a restart clears it, and nothing is drawn as working that is not */
export type DeskWork = "scan" | "clear" | "enter" | "exit" | "close" | "report" | "review" | "follow";
export interface DeskWorking {
  role: RoleId;
  what: DeskWork;
  lead?: string | undefined;
  /** when the step began, on the account's clock */
  since: string;
}
/** a role's last brain call: when it answered (the account's clock), how long it took on the wall clock, and whether it gave a decision */
export interface DeskThink {
  at: string;
  ms: number;
  ok: boolean;
}

/** one row of the table Search's brain was shown: the account's own Markets line for the desk's venue */
export interface ScanRow {
  symbol: string;
  name: string;
  kind: string;
  price: number;
  changePct24h?: number | undefined;
  volumeUsd24h?: number | undefined;
}
/** What Search scanned in the last cycle that reached it: the very table its brain was shown (at most 40 rows), the leads it picked with
 * their confidence, and its note — or, where no table could be shown (Markets did not answer, the venue lists nothing in the universe),
 * no rows and the reason. Only the last one is kept (desk.json) */
export interface DeskScan {
  cycle: number;
  at: string;
  venue: string;
  rows: ScanRow[];
  picked: Array<{ lead: string; symbol: string; side: "buy" | "sell"; confidence: number }>;
  note?: string | undefined;
}
/** What Search's step gives the cycle: the leads it named, or — where its brain gave nothing (no answer, no decision) or it had no table to
 * show the brain — `unjudged`, the reason in a few words, so the cycle says that rather than "nothing worth a lead" */
/** what the Sniper's step made of a cleared lead */
type Entered = "placed" | "card" | "none";

interface Scanned {
  leads: Lead[];
  unjudged?: string | undefined;
}

/** the owner's signed word on the superagent: whether the desk's own seats place their orders at its paper account without cards, and when
 * the owner last said so */
export interface DeskAutonomy {
  paper: boolean;
  at: string;
}

/** a lead as the floor reads it every second: what it is, where it stands, its numbers, and why — Search's thesis, Risk's reason for
 * clearing it, the words of whoever turned it down or closed it — so the page says beside every trade why it was made; no orders' ids */
export interface FeedLead {
  id: string;
  at: string;
  state: LeadState;
  symbol: string;
  name: string;
  kind: string;
  side: "buy" | "sell";
  thesis: string;
  cleared?: string | undefined;
  sizeUsd?: number | undefined;
  confidence?: number | undefined;
  checks?: LeadChecks | undefined;
  why?: string | undefined;
  entry?: { price: number; qty: number; at: string } | undefined;
  exit?: { price: number; at: string } | undefined;
  exitWhy?: string | undefined;
  pnlUsd?: number | undefined;
  roiPct?: number | undefined;
  markPrice?: number | undefined;
  unrealizedUsd?: number | undefined;
  /** an open lead marked from its market's live stream as the floor is read: the moment the stream confirmed the mark, and the stream */
  markAt?: string | undefined;
  markFrom?: string | undefined;
  tpPct?: number | undefined;
  slPct?: number | undefined;
  maxHours?: number | undefined;
  updatedAt: string;
}

/** The session's funnel, counted over the leads found since the session started, each lead counted at every stage it got past:
 *   scanned    every lead Search made
 *   cleared    Risk cleared it (whatever came of it after: confirmed, placed, closed, or refused at the door)
 *   confirmed  its entry went to the door: placed at once, or waiting for the owner on a card (Guard) — a card counts here, not as placed
 *   placed     the venue took its entry order (the lead's state executed, closing or closed): filled or still resting on the book. An
 *              extended-hours day limit, or a market order a venue answers "accepted" and fills later (Alpaca paper), is placed and not
 *              yet filled — so "waiting for the owner" is confirmed − placed, never confirmed − executed
 *   executed   its entry FILLED (the lead holds an entry): what the floor draws as a fill
 *   closed     its exit filled
 *   rejected   Risk rejected it
 * `placed` came after the others: a page written before it reads `executed` as before */
export interface DeskFunnel {
  scanned: number;
  cleared: number;
  confirmed: number;
  placed: number;
  executed: number;
  closed: number;
  rejected: number;
}

/** a seat's trading limit as the door holds it now: up to so much an order, what is left of its budget, at which venues — and, where the
 * owner signed it renewing (approveSpend renewHours: the Superagent's), every how many hours its entries are counted afresh and when they
 * next are, so a page can say that an empty budget renews, and when */
export interface SeatLimit {
  perOrderUsd: number;
  leftUsd: number;
  budgetUsd: number;
  venues: string[];
  renewHours?: number | undefined;
  renewsAt?: string | undefined;
}

/** The floor's read (GET /api/account/desk/feed?since=<seq>), asked every second while the floor shows: the room's lines after `since`, who
 * is working, the brain calls under way, the last scan, the autonomy, the session, the venue, the equity's last points, the target, the
 * funnel, the day, the last leads, the next cycle, the brain's standing and spend. Everything in it is the desk's own record or the
 * account's read; nothing is filled in */
export interface DeskFeed {
  /** the room's newest line's seq: the page asks with it next */
  seq: number;
  /** the room's lines with a seq after `since`, oldest first — at most FEED_ROOM_MAX, the newest ones when more came */
  room: RoomMessage[];
  working: DeskWorking | null;
  inFlight: number;
  lastThink: Partial<Record<RoleId, DeskThink>>;
  lastScan: DeskScan | null;
  autonomy: DeskAutonomy | null;
  session: { state: "live" | "paused" | "halted" | "ended"; startedAt: string; endsAt: string; hours: number; cycles: number; halted?: DeskSession["halted"] } | null;
  venue: { id: string; name: string; usd: number; paper: boolean; connected: boolean };
  equity: { nowUsd: number; startUsd: number; changeUsd: number; changePct: number; tail: Array<[number, number]> };
  target: { pct: number; progressPct: number; reachedUsd: number; targetUsd: number };
  funnel: DeskFunnel;
  today: { pnlUsd: number; wins: number; losses: number; scanned: number; cleared: number; executed: number; closed: number; lossRoomUsd: number };
  /** the last FEED_LEADS leads and every lead still open however old, oldest first, each once (recentAndOpen) */
  leads: FeedLead[];
  routines: { everyMin: number; nextCycleAt?: string | undefined };
  /** The brain's standing and spend, and which brain it is: `provider` is the hired desk's BrainConfig.provider, the same id the desk's
   * view (DeskView.brain.provider) and the catalog name it by — "claude", "openai", a stand-in's "scripted". The floor's header names the
   * brain from it: a desk that thinks with a script is never shown as the Claude model its form defaulted to */
  brain: { ok: boolean; why?: string | undefined; fix?: BrainFix | undefined; provider: string; label: string; model: string; spend: DeskSpend };
  /** Beside the spec's shape, what the floor draws without a second read: the desk's name and objective (the rules panel's numbers), each
   * seat with its standing at the door and its trading limit (a card's status light, the Sniper's limit bar; a role with no seat is not
   * here, and the floor draws it empty), and the one hard line Risk holds that the objective does not name — the widest spread a lead may
   * have, in percent */
  name: string;
  objective: DeskObjective;
  seats: Array<{ role: RoleId; kind: "house" | "outside"; name: string; status: "ok" | "not let in" | "expired" | "revoked"; limit?: SeatLimit | undefined }>;
  hard: { maxSpreadPct: number };
}

/** What the brain cost: the calls answered (`calls`, with their tokens and the estimate in dollars — the tokens of a model nobody prices
 * counted apart), and `failed`, the calls that got no answer at all (the API refused the key, rate-limited it, could not be reached):
 * those cost nothing, and the floor shows them so "0 calls" is never read as "nothing was tried". A desk file from before `failed` was
 * kept reads it as 0 */
export interface DeskSpend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  unpricedTokens?: number | undefined;
  failed?: number | undefined;
}

export interface DeskFile {
  v: 1;
  id: string;
  name: string;
  createdAt: string;
  objective: DeskObjective;
  brain: BrainConfig;
  seats: DeskSeat[];
  session?: DeskSession | undefined;
  leads: Lead[];
  /** [ms, equity in dollars] */
  equity: Array<[number, number]>;
  reports: DeskReport[];
  spend: DeskSpend;
  counters: { lead: number; seq: number };
  /** the New York day the last evening report and weekly review were written for */
  reported?: string | undefined;
  reviewed?: string | undefined;
  /** the superagent: the owner's signed word on whether the desk trades its paper account without cards (absent: never said, so no) */
  autonomy?: DeskAutonomy | undefined;
  /** what Search scanned last (DeskScan) */
  lastScan?: DeskScan | undefined;
}

// ---- the brain ----------------------------------------------------------------------------------------------------------------

export interface BrainRequest<T> {
  role: RoleId;
  /** the model and effort the desk was hired with */
  brain: BrainConfig;
  system: string;
  input: string;
  schema: z.ZodType<T>;
  maxTokens?: number | undefined;
}
export interface BrainAnswer<T> {
  /** the decision, or null when the model gave none (refused, ran out, or did not parse) */
  out: T | null;
  why?: string | undefined;
  usage: { inputTokens: number; outputTokens: number };
}
export interface BrainStatus {
  ok: boolean;
  model: string;
  /** how it is reached ("ANTHROPIC_API_KEY", "a key file") */
  how?: string | undefined;
  /** why not, and what would make it ready: a sentence */
  why?: string | undefined;
  /** what a person does about it, when it is not ready (BrainFix) */
  fix?: BrainFix | undefined;
}
/** WHAT MAKES A BRAIN READY, said so a person can do it (brain-key.ts makes these): which way it is not ready (`code`), the key file's
 * absolute path (where the key goes, whatever the code — the one place a key needs no restart), the command that does the fix where one
 * does — whole and runnable as written, never with a value in it to replace first (the page copies it, never composes one) — whether the
 * service must be restarted for the fix to take (only a key in its environment), and one plain sentence.
 *
 *   no-key    no key anywhere: the command makes the file with an empty template, readable by the user alone, and opens it
 *   example   the file holds the empty template or an example: the command opens it
 *   unusable  the file is there but cannot be used: chmod 600 when others can read it, else it is opened again
 *   rejected  the API refused the key (desk.ts keeps that as the standing until a call is answered again): the file opened again, or —
 *             a key from the environment — a restart
 *   env       the service's environment holds an example: no command from here, a restart */
export interface BrainFix {
  code: "no-key" | "example" | "unusable" | "rejected" | "env";
  file: string;
  command?: string | undefined;
  restart: boolean;
  words: string;
}
export interface Brain {
  /** the provider's id, as a desk names it (BrainConfig.provider) */
  readonly id: string;
  /** for the hire form: "Claude · Anthropic API" */
  readonly label: string;
  /** the models it lists, with their prices; none listed means the owner names one and the endpoint decides */
  readonly models: ReadonlyArray<BrainModel>;
  /** its standing now, without reaching it. `model`: the model the hired desk names, for a brain that lists none and reads the model's name
   * from its key file too (the form's wins: with it, the file may name none) */
  ready(model?: string): BrainStatus;
  decide<T>(r: BrainRequest<T>): Promise<BrainAnswer<T>>;
  /** what the Brains place shows of it besides its standing (BrainAbout): where it is reached, what it suggests, the key's masked tail —
   * never the key. Read without reaching the provider. A brain without one (a test's script) is shown by its standing alone */
  about?(): BrainAbout;
  /** "Test the key": the one call that bills nothing (the provider's list of models), answered in words — never the key (BrainTest).
   * `model`: the model the owner means to use, said to be among what the provider lists or not */
  test?(model?: string): Promise<BrainTest>;
  /** "Connect a key" (brain-detect.ts): the same call that bills nothing, asked at the provider's own address with a key the owner pasted
   * and has not saved — nothing read from the key file or the environment, nothing written (BrainProbe). Only a model API has one: a server
   * on this machine, a custom endpoint and a per-workspace address have no address of their own to ask a pasted key at */
  probe?(key: string): Promise<BrainProbe>;
}

/** Model ids to offer as SUGGESTIONS: read from the provider's own page (`source`) on the day `checked` — never the whole list, never
 * promised current; the owner may type any id the endpoint serves. `prices`: the per-million-token prices (in, out) that page gave that
 * day for some of them, where it gave one — the owner's own number is the one the desk counts (BrainConfig.price) */
export interface BrainSuggestions {
  models: string[];
  source: string;
  checked?: string | undefined;
  prices?: Record<string, { inUsd: number; outUsd: number }> | undefined;
}

/** What the Brains place shows of a brain beside its standing, read from its preset and its key file without reaching the provider:
 *   kind          "model-api" (a provider's API), "local" (a server on this machine), "custom" (an endpoint the owner names)
 *   format        the request's format: "anthropic" (brain-claude.ts) or "openai" (chat completions, brain-openai.ts)
 *   baseUrl       where it would call now: the environment's or the key file's base URL, else the preset's own ("" where the owner must
 *                 name one: Qwen's per-workspace URL, a custom endpoint); baseRequired says so, baseHint shows the provider's pattern
 *   keyOptional   a local server that ignores the key: none is needed
 *   suggested     model ids to suggest, with where they were read and when (BrainSuggestions)
 *   efforts       the efforts the provider takes of the desk's three (one it does not take is not sent: its own default applies)
 *   tail          "…" and the last four characters of the key in use, where one is set (keyTail, brain-key.ts) — never the key
 *   envWins       the environment variable that holds the key instead of the file, when it is set: the file is not read while it is
 *   envBlocks     the environment variable that the brain does NOT use and that keeps it from reading the file too, when it is set:
 *                 Claude's ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN beside an ANTHROPIC_BASE_URL that points away from Anthropic (a
 *                 gateway's credential, brain-claude.ts). Never with envWins: a variable either wins or blocks
 *   keyFile       the key file a key typed on the page is written to, relative to the home (credentials/brains/<id>.json)
 *   keyFrom       where the key in use is read now: "env", "file" (keyFile), "older-file" (the older path still read), or "none"
 *   docs, keyPage the provider's own pages (from the research, dated with `suggested.checked`); note: one plain fact the owner should know */
export interface BrainAbout {
  kind: "model-api" | "local" | "custom";
  format: "anthropic" | "openai";
  baseUrl: string;
  baseRequired?: boolean | undefined;
  baseHint?: string | undefined;
  keyOptional?: boolean | undefined;
  suggested?: BrainSuggestions | undefined;
  efforts: ReadonlyArray<BrainConfig["effort"]>;
  tail?: string | undefined;
  envWins?: string | undefined;
  envBlocks?: string | undefined;
  keyFile: string;
  keyFrom: "env" | "file" | "older-file" | "none";
  docs?: string | undefined;
  keyPage?: string | undefined;
  note?: string | undefined;
}

/** "Test the key", answered: `ok` when the provider took the key (or, for a local server, answered); `words` the provider's answer in a
 * sentence — its own refusal words scrubbed of anything key-shaped, never the key; `status` the HTTP status when one came back; `models`
 * the ids the provider listed (each checked to look like a model's name, at most 200), for the owner's model field; `fix` when the brain
 * could not even be asked (no key, a file it cannot use) — then nothing was sent anywhere */
export interface BrainTest {
  ok: boolean;
  provider: string;
  words: string;
  status?: number | undefined;
  models?: string[] | undefined;
  fix?: BrainFix | undefined;
}
/** "Connect a key" (brain-detect.ts): what a provider answered when its list of models was asked with a key that is NOT saved — one the
 * owner pasted, before anything is signed — the one call every model API answers without billing a token. `outcome`: "taken" (the key was
 * taken and the list read: `models`, each checked to look like a model's name and to hold no piece of the key, at most 1000), "refused"
 * (401 or 403, or a 400 that names the key: not a key this provider takes — or, `kind` "manages", one of its keys that manages an account
 * and runs no model; `kind` "blocked", a key it took that is blocked or may call no model yet, `words` saying which), "unreachable"
 * (no answer, in time or at all, or a redirect, which is never followed), "error" (any other answer: its status). `words`: what happened,
 * in a phrase ("no answer from api.openai.com in time"); `said`: the provider's own words when it gave any ("Incorrect API key provided"),
 * at most 160 characters — both scrubbed of the key and every piece of it, never the key */
export interface BrainProbe {
  outcome: "taken" | "refused" | "unreachable" | "error";
  words: string;
  said?: string | undefined;
  status?: number | undefined;
  models?: string[] | undefined;
  kind?: "manages" | "blocked" | undefined;
}
export interface BrainModel {
  id: string;
  name: string;
  inUsd: number;
  outUsd: number;
}

/** a brain that answers from a script: tests and the stand-in (`id`, `label`, `models`, what it says of itself for the Brains place
 * (`about`) and the tokens it claims are the test's) */
export function scriptedBrain(script: (r: { role: RoleId; input: string }) => unknown, model = "scripted", o: { id?: string | undefined; label?: string | undefined; models?: ReadonlyArray<BrainModel> | undefined; usage?: BrainAnswer<unknown>["usage"] | undefined; about?: (() => BrainAbout) | undefined } = {}): Brain {
  const usage = () => ({ ...(o.usage ?? { inputTokens: 0, outputTokens: 0 }) });
  return {
    id: o.id ?? "scripted",
    label: o.label ?? "a script",
    models: o.models ?? [],
    ...(o.about ? { about: o.about } : {}),
    ready: () => ({ ok: true, model, how: "a script" }),
    async decide(r) {
      const raw = script({ role: r.role, input: r.input });
      const parsed = r.schema.safeParse(raw);
      return parsed.success ? { out: parsed.data, usage: usage() } : { out: null, why: "the script's answer did not fit", usage: usage() };
    },
  };
}

/** the Claude models a desk may think with, and their listed prices per million tokens (in, out), for the estimate the view shows */
export const BRAIN_MODELS: ReadonlyArray<BrainModel> = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", inUsd: 4, outUsd: 20 },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", inUsd: 2, outUsd: 10 },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", inUsd: 0.1, outUsd: 0.5 },
];
export const DEFAULT_BRAIN: BrainConfig = { provider: "claude", model: "claude-opus-5-5", effort: "medium" };
/** a model's name as an endpoint names it: a letter or digit first, then letters, digits and . _ - : / — 80 at most */
export const MODEL_ID = /^[A-Za-z0-9][\w.\-:/]{0,79}$/;

/** A KEY WHERE A BRAIN'S NAME OR MODEL GOES. Many real keys fit MODEL_ID (eighty characters or fewer: DeepSeek's and Kimi's sk-<hex>,
 * Groq's gsk_…, Gemini's AIza…, OpenRouter's sk-or-v1-…), so a key pasted into the model field — beside the key field on the page — would
 * otherwise be taken as a model's name: written in desk.json, said in the room ("You changed the brain: … · <the key> · …", which any
 * local process reads through the seat's view, and outside agents through MCP), and sent as the request's model to whichever provider the
 * desk thinks with. So a provider or a model that looks like an API key (keyShaped, brain-key.ts — the one check the page, the key route
 * and the door share) is refused in these words, which NEVER repeat the value: hire, brain, objective and resume alike (parseBrain). The
 * door refuses the same before it writes the instruction it took (brain-keys.ts, in its own words); this is the desk's own refusal, for
 * whatever reaches it */
export const KEY_IN_MODEL = "the model's name looks like an API key, so it is refused and not repeated here: a key goes only in the Brains place's key field, never in the model — name the model as the endpoint names it (gpt-6-luna, deepseek-flash, grok-4.3…)";
export const KEY_IN_PROVIDER = "the brain named looks like an API key, so it is refused and not repeated here: a key goes only in the Brains place's key field — name the brain by its id (claude, openai, deepseek, xai…)";
/** the fields a brain is named with — the provider, the model, the effort, the owner's price — and nothing else */
const BRAIN_FIELDS = ["provider", "model", "effort", "price"] as const;
/** the words for a brain that is not one object: fixed, so they never repeat what was sent in its place */
export const BRAIN_NOT_OBJECT = "the desk's brain is one object, {provider, model, effort, price}: what was sent in its place is not one, and it was not kept";
/** the words for a brain carrying a key-shaped provider or model, or undefined when it carries none */
function brainKeyProblem(b: Record<string, unknown>): string | undefined {
  if (b.provider !== undefined && b.provider !== null && keyShaped(String(b.provider))) return KEY_IN_PROVIDER;
  if (b.model !== undefined && b.model !== null && keyShaped(String(b.model))) return KEY_IN_MODEL;
  return undefined;
}

/** The brain a desk was hired with when the account does not hold it now (a desk file written beside other brains — a stand-in's script,
 * a provider since removed): never ready, and it says so in those words; asked, it answers no decision and bills nothing. It stands in so
 * the desk never quietly thinks — and spends — with another provider than the one the owner signed for: the owner chooses one it holds
 * (Brain…), with a signature */
export function absentBrain(id: string): Brain {
  const why = `the desk was hired with the brain "${id.slice(0, 40)}", which this account does not hold now: choose one it holds (Brain…) — no other brain is asked in its place`;
  return {
    id,
    label: `${id.slice(0, 40)} (not on this account)`,
    models: [],
    ready: () => ({ ok: false, model: "", why }),
    decide: async () => ({ out: null, why, usage: { inputTokens: 0, outputTokens: 0 } }),
  };
}
/** what a call cost: the owner's price for the model, else the brain's listed one; undefined when neither is known (the tokens are
 * still counted, as unpriced) */
export const costOf = (brain: BrainConfig, listed: ReadonlyArray<BrainModel>, inputTokens: number, outputTokens: number): number | undefined => {
  const p = brain.price ?? listed.find((x) => x.id === brain.model);
  return p ? (inputTokens * p.inUsd + outputTokens * p.outUsd) / 1e6 : undefined;
};

// ---- the decisions, as the brain gives them (structured outputs) ------------------------------------------------------------------

const SearchOut = z.object({ leads: z.array(z.object({ symbol: z.string(), side: z.enum(["buy", "sell"]), thesis: z.string(), confidence: z.number() })), note: z.string() });
const RiskOut = z.object({ verdict: z.enum(["clear", "reject"]), why: z.string(), sizeUsd: z.number(), tpPct: z.number(), slPct: z.number(), maxHours: z.number() });
const ExitOut = z.object({ decisions: z.array(z.object({ lead: z.string(), action: z.enum(["hold", "close"]), why: z.string() })) });
const ReportOut = z.object({ worked: z.string(), change: z.string() });
const ReviewOut = z.object({ roles: z.array(z.object({ role: z.string(), verdict: z.string() })), prune: z.string() });
export const DECISIONS = { SearchOut, RiskOut, ExitOut, ReportOut, ReviewOut };

// ---- what the desk needs from the account it lives in ----------------------------------------------------------------------------

export interface DeskWorld {
  home: string;
  now(): string;
  /** the real clock, ms */
  realNow(): number;
  mode(): "guard" | "open";
  page(): Promise<AccountPage | undefined>;
  explore(o: { tab?: string | undefined; sort?: string | undefined; limit?: number | undefined }): Promise<Exploration | Refusal>;
  market(venue: string, symbol: string): Promise<Market | Refusal>;
  /** a market's live mark from the venues' streams (service.ts liveMark: a perpetual's venue mark, a coin's last trade), with the moment the
   * stream confirmed it, while its stream is live — what an open lead is marked at first; nothing when it is not (the venue is read) */
  mark?(venue: string, symbol: string): { price: number; at: string; from: string } | undefined;
  positions(venue: string): Promise<Position[] | Refusal>;
  /** the account's orders tied to these ids, out of every order this run of the account keeps — not only the newest the page carries
   * (AccountPage.orders: sixty): each order whose id is one of them, or whose card is (an order placed when the owner answered one), and
   * each exit of one of them (LiveOrder.exitOf: a bracket's take-profit and stop). A lead held for days, while the desk places three
   * orders a lead, still finds its entry and the exits the venue holds for it */
  ordersOf(ids: readonly string[]): LiveOrder[];
  exchange(envelope: Envelope): Promise<Outcome>;
  nonce(): number;
  venueName(id: string): string;
  log(row: LedgerRowInput): void;
}

export interface DeskOptions {
  /** the brains the desk may think with: one, or several told apart by id (BrainConfig.provider) */
  brain: Brain | Brain[];
  /** the desk's own clock for its timers; tests call tick() and cycle() themselves */
  tickMs?: number | undefined;
  /** how soon the first cycle comes after a hire, a resume or the clock's start (FIRST_CYCLE_MS; a test's own, shorter) */
  firstCycleMs?: number | undefined;
  /** told each time what the floor draws moved (the account's push channel: service.ts sends it on as a `desk` event, account/stream.ts):
   * the desk's record written — a room line, a lead, the session, the equity — a step begun or ended, a brain call sent or answered. Only
   * that it moved, and the room's newest line: the page reads the floor (feed) for the rest. A listener that throws is its own fault */
  onChange?: ((what: DeskChange) => void) | undefined;
  /** The record (desk.json) and the room's lines kept in memory, written only when flush() is called — for a desk played over recorded bars
   * (backtest/desk.ts), whose account no restart ever reads back and no page watches. Written as they happen, as the real server writes
   * them, the whole record was rewritten at every line of the room: most of what such a run spent, and more of it the longer it ran */
  deferSaves?: boolean | undefined;
}

/** what the desk tells as its floor moves (DeskOptions.onChange): the room's newest line's seq (the floor's read asks after it), the step
 * under way now, and the brain calls in flight */
export interface DeskChange {
  seq: number;
  working: DeskWorking | null;
  inFlight: number;
}

// ---- limits of the file ------------------------------------------------------------------------------------------------------

export const DESK_ID = "desk";
export const MAX_LEADS = 400;
export const MAX_EQUITY_POINTS = 2000;
export const MAX_REPORTS = 60;
export const ROOM_KEPT = 3000;
export const ROOM_SHOWN = 160;
/** the floor's read: the most room lines one answer carries, the equity points, the leads */
export const FEED_ROOM_MAX = 200;
export const FEED_EQUITY_TAIL = 120;
export const FEED_LEADS = 60;
/** the rows of Markets Search's brain is shown, at most */
export const SCAN_ROWS = 40;
/** the floor asks every second; the account's page (the venue's row) is read for it at most this often */
const FEED_PAGE_MS = 5_000;
/** how far back the room's tail is read for one answer, at most (a line is a few hundred bytes; 200 of them fit many times over) */
const TAIL_BYTES_MAX = 4 * 1024 * 1024;
const TAIL_CHUNK = 64 * 1024;
const TEXT_MAX = 400;
const CHARTER_MAX = 400;
const OBJECTIVE_TEXT = 200;
const MIN_CYCLE_MIN = 1;
const MAX_CYCLE_MIN = 240;
/** The objective's numbers, [the least, the most]: the target in percent of the session's start, the most at risk per lead and the day's
 * loss line in percent, the session's hours (two weeks at most), the minutes between cycles, the leads open at once. The catalog hands them
 * to the page, whose setup form refuses anything outside them in words; the desk still holds a value outside them to the nearest end
 * (parseObjective), for a caller over MCP that sends one */
export const OBJECTIVE_BOUNDS = {
  targetPct: [0.1, 100],
  maxRiskPct: [0.1, 50],
  maxDailyLossPct: [0.1, 50],
  hours: [1, 24 * 14],
  everyMin: [MIN_CYCLE_MIN, MAX_CYCLE_MIN],
  maxOpen: [1, 10],
} as const satisfies Record<string, readonly [number, number]>;
/** the first cycle after a hire, a resume or a start of the clock, this long after: soon, not at the clock's next 30-second tick */
export const FIRST_CYCLE_MS = 5_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** an extended-hours limit's distance past the book, so that it fills now as a market order would (overnight books are thin) */
const EH_BAND = 0.005;
/** the spread a lead may have, in percent of the price: Risk's one hard line the objective does not name (the floor's rules panel shows it,
 * DeskFeed.hard) */
export const MAX_SPREAD_PCT = 0.6;
/** a lead's plan where the brain gives none, or one out of bounds */
const PLAN = { tpPct: 1.5, slPct: 0.8, maxHours: 12 };
const PLAN_BOUNDS = { tpPct: [0.2, 25], slPct: [0.2, 15], maxHours: [1, 168] } as const;

const r2 = (n: number) => Number(n.toFixed(2));
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** the places a figure carries as written (at most eight): 62420.7 → 1, 0.1 → 1, 60000 → 0 */
const placesOf = (n: number): number => {
  const t = Math.abs(n).toFixed(8).replace(/0+$/, "");
  const i = t.indexOf(".");
  return i < 0 ? 0 : t.length - i - 1;
};
/** A price or a quantity as a person reads it in the room: grouped the en-US way, at the market's own places where its price step is known
 * (a step of 0.1: one place), else at the figure's own — 62420.7 is "62,420.7", never "62420.7" */
const fig = (n: number, places?: number): string => {
  const d = places ?? placesOf(n);
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
/** the places a market's price step gives its prices, or undefined where it names none */
const stepPlaces = (step: number | undefined): number | undefined => (step !== undefined && step > 0 ? placesOf(step) : undefined);
/** the autonomy a hire or a resume carries: undefined when it carries none, the value of `paper` when it is an object (a boolean, or
 * something else the caller refuses), null when `autonomy` is not an object at all */
const autonomySaid = (v: Record<string, unknown>): unknown => (v.autonomy === undefined ? undefined : v.autonomy && typeof v.autonomy === "object" && !Array.isArray(v.autonomy) ? (v.autonomy as Record<string, unknown>).paper : null);
/** the room's line for the owner's autonomy on paper, one sentence wherever it is signed (autonomyChange, a hire or a resume that carries
 * it) */
const autonomyWords = (venue: string): string => `You let the desk trade on its own at ${venue}, paper money: the orders of its own seats there go at once, without cards, each inside its seat's trading limit. Every other agent and every other venue is answered as before.`;
/** dollars in the large, as a listing says a day's volume: $603.9M, $2B */
const USD_COMPACT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
/** a plan's percent or hours, at most two places: 1.5, 0.75, 12 — never a brain's 1.2345678 */
const short = (n: number): string => String(Number(n.toFixed(2)));
/** the seats by name, as a sentence lists them: "Head, Search, Risk, Sniper, Exit and Watch" */
const seatNames = (seats: ReadonlyArray<{ role: RoleId; kind: "house" | "outside"; name: string }>): string => {
  const names = seats.map((x) => {
    const role = ROLE_SPECS[x.role].name.replace(" of desk", "");
    return x.kind === "outside" ? `${role} (${x.name})` : role;
  });
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "none");
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const plainText = (s: unknown, max: number): string => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

/** New York wall clock, as the objective names its hours */
const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
/** New York's offset from UTC in each UTC hour read, in ms (four or five hours behind). Its clock changes at 02:00 local, the top of a UTC
 * hour, so one reading of the formatter holds for the whole hour. ny() is asked thousands of times a step by a desk played over recorded
 * bars (each lead's day, the routines' next times), and the formatter asked each time was most of what such a run spent. A year of hours
 * is 8,760 numbers; past NY_HOURS_KEPT the kept ones are dropped and read again as asked */
const NY_OFFSET = new Map<number, number>();
const NY_HOURS_KEPT = 100_000;
function nyOffsetMs(ms: number): number {
  const hour = Math.floor(ms / HOUR);
  let off = NY_OFFSET.get(hour);
  if (off === undefined) {
    const p = Object.fromEntries(NY.formatToParts(new Date(hour * HOUR)).map((x) => [x.type, x.value])) as Record<string, string>;
    off = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute)) - hour * HOUR;
    if (NY_OFFSET.size >= NY_HOURS_KEPT) NY_OFFSET.clear();
    NY_OFFSET.set(hour, off);
  }
  return off;
}
const two = (n: number): string => String(n).padStart(2, "0");
/** the New York day ("2026-10-30"), the minutes since its midnight and the weekday (0 is Sunday) at `ms` */
export function ny(ms: number): { day: string; minutes: number; dow: number } {
  const w = new Date(ms + nyOffsetMs(ms));
  return { day: `${w.getUTCFullYear()}-${two(w.getUTCMonth() + 1)}-${two(w.getUTCDate())}`, minutes: w.getUTCHours() * 60 + w.getUTCMinutes(), dow: w.getUTCDay() };
}
const minutesOf = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? clamp(Number(m[1]), 0, 23) * 60 + clamp(Number(m[2]), 0, 59) : 21 * 60;
};
/** the next New York midnight after `ms`. Its offsets are whole hours, so a midnight is the top of a UTC hour: looked for an hour at a time */
export function nextNyMidnight(ms: number): number {
  const day = ny(ms).day;
  let t = (Math.floor(ms / HOUR) + 1) * HOUR;
  while (ny(t).day === day) t += HOUR;
  return t;
}
/** The next minute, from `ms`'s own on, at which the New York clock reads `at` (minutes after its midnight): today's while it is still to
 * come, else the next day's — the first time that day it reads so (a day the clock goes back reads 01:xx twice; a day it goes forward has
 * no 02:xx, and that hour's report is the next day's). Within a UTC hour the clock moves a minute a minute, so it is looked for an hour at
 * a time, two days at most (`ms`'s minute and two days on when no minute in them reads `at`) */
export function nextNyAt(ms: number, at: number): number {
  const now = ny(ms);
  const from = ms - (ms % 60_000);
  for (let h = Math.floor(from / HOUR); h * HOUR < from + 2 * DAY; h++) {
    const first = ny(h * HOUR).minutes;
    if (at < first || at >= first + 60) continue;
    const t = h * HOUR + (at - first) * 60_000;
    if (t < from || t >= from + 2 * DAY) continue;
    if (ny(t).day !== now.day || now.minutes < at) return t;
  }
  return from + 2 * DAY;
}

const bad = (message: string, detail: Record<string, unknown> = {}): Refusal => no("E_ACCOUNT_BAD_ACTION", { message, detail });

// ---- the store ----------------------------------------------------------------------------------------------------------------

export const deskPath = (home: string): string => join(home, "desk", "desk.json");
export const roomPath = (home: string): string => join(home, "desk", "room.jsonl");

function writePrivate(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export function readDesk(home: string): DeskFile | undefined {
  const p = deskPath(home);
  if (!existsSync(p)) return undefined;
  try {
    const f = JSON.parse(readFileSync(p, "utf8")) as DeskFile;
    // a desk hired before brains were a choice thought with Claude
    if (f.brain && !f.brain.provider) f.brain = { ...f.brain, provider: "claude" };
    return f && f.v === 1 && f.id === DESK_ID && f.objective && Array.isArray(f.seats) ? f : undefined;
  } catch {
    return undefined;
  }
}

export function readRoom(home: string, last = ROOM_SHOWN): RoomMessage[] {
  const p = roomPath(home);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const out: RoomMessage[] = [];
  for (const l of lines.slice(-last)) {
    try {
      out.push(JSON.parse(l) as RoomMessage);
    } catch {
      // a half-written line at the end of a file the process died on: skipped
    }
  }
  return out;
}

/** a lead the desk still holds, or is about to: an order placed or being placed (confirmed), a position held (executed), a close under way
 * (closing). The Exit watches these, the floor draws them, and no window over the record may drop one */
export const isOpenLead = (l: { state: LeadState }): boolean => l.state === "confirmed" || l.state === "executed" || l.state === "closing";

/** The last `n` leads AND every lead still open, in the record's own order (oldest first), each once.
 *
 * A window of the newest leads alone is not enough: Search names up to three leads a cycle and most are rejected, so on a five-minute clock
 * a lead placed a few hours ago is soon older than the newest sixty — or, kept long enough, the newest four hundred. Cut there, an open lead
 * would leave the floor's read (the Exit card's count, the focus market's entry, take-profit and stop, its later close) and, worse, the
 * desk's own file (the Exit would no longer see a position the account holds). So the window is the newest `n` and, beside them, whatever
 * is still open, however old: a few more than `n` at most, since the objective caps how many are open at once. */
export function recentAndOpen<T extends { state: LeadState }>(leads: readonly T[], n: number): T[] {
  const from = Math.max(0, leads.length - Math.max(0, n));
  return leads.filter((l, i) => i >= from || isOpenLead(l));
}

/** The room's lines after `since`, oldest first, at most `max` of them (the newest, when more came) — read from the END of room.jsonl
 * backwards, a chunk at a time, stopping at the first line at or before `since`: the floor asks every second, and a room kept to 3,000
 * lines is never read whole for it. Bytes are joined before they are cut into lines, so a character split across two chunks stays whole;
 * a line that does not parse (a half-written one at the end) is skipped, as readRoom skips it */
export function readRoomTail(home: string, since: number, max = FEED_ROOM_MAX): RoomMessage[] {
  let fd: number;
  try {
    fd = openSync(roomPath(home), "r");
  } catch {
    return [];
  }
  const found: RoomMessage[] = [];
  try {
    let pos = fstatSync(fd).size;
    let head = Buffer.alloc(0);
    let read = 0;
    while (found.length < max) {
      if (pos > 0 && read < TAIL_BYTES_MAX) {
        const n = Math.min(TAIL_CHUNK, pos);
        pos -= n;
        read += n;
        const chunk = Buffer.alloc(n);
        readSync(fd, chunk, 0, n, pos);
        head = Buffer.concat([chunk, head]);
      } else pos = 0;
      // the bytes before the first newline may be the end of a line that began before this chunk: kept for the next one, unless the start
      // of the file (or of what is read) is reached
      const cut = pos > 0 ? head.indexOf(0x0a) : -1;
      if (pos > 0 && cut < 0) continue;
      const whole = head.subarray(cut + 1);
      head = pos > 0 ? head.subarray(0, cut + 1) : Buffer.alloc(0);
      const lines = whole.toString("utf8").split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        let m: RoomMessage;
        try {
          m = JSON.parse(lines[i]!) as RoomMessage;
        } catch {
          continue;
        }
        if (!(m.seq > since)) return found.reverse();
        found.push(m);
        if (found.length >= max) return found.reverse();
      }
      if (pos === 0) break;
    }
  } finally {
    closeSync(fd);
  }
  return found.reverse();
}

// ---- the desk ------------------------------------------------------------------------------------------------------------------

/** What a run over recorded bars reads of the desk at each step (Desk.glance): the session's state and cycles, the venue's equity as the
 * account's page gives it, the dollars the open leads were opened with, the session's funnel */
export interface DeskGlance {
  session: { state: "live" | "paused" | "halted" | "ended"; cycles: number; halted?: DeskSession["halted"] } | null;
  venueUsd: number;
  openUsd: number;
  funnel: DeskFunnel;
}

/** the view the page and a seat read */
export interface DeskView {
  id: string;
  name: string;
  createdAt: string;
  objective: DeskObjective;
  brain: BrainStatus & { provider: string; label: string; effort: string; price?: BrainConfig["price"]; spend: DeskFile["spend"] };
  /** the superagent: whether the owner signed the desk's orders at its paper account to go without cards (absent: never said) */
  autonomy?: DeskAutonomy | undefined;
  /** what Search scanned last */
  lastScan?: DeskScan | undefined;
  seats: Array<DeskSeat & { status: "ok" | "not let in" | "expired" | "revoked"; limit?: SeatLimit | undefined; cards: number }>;
  session?: (DeskSession & { state: "live" | "paused" | "halted" | "ended"; elapsedMs: number; remainingMs: number }) | undefined;
  equity: { nowUsd: number; startUsd: number; changeUsd: number; changePct: number; mult: number; points: Array<[number, number]> };
  target: { pct: number; progressPct: number; reachedUsd: number; targetUsd: number };
  funnel: DeskFunnel;
  today: { pnlUsd: number; wins: number; losses: number; scanned: number; cleared: number; executed: number; closed: number; lossRoomUsd: number };
  open: Lead[];
  recent: Lead[];
  tape: { wins: number; losses: number; winRatePct: number; avgWinPct: number; avgLossPct: number; closes: Array<{ id: string; symbol: string; pnlUsd: number; roiPct: number; at: string }> };
  big: Array<{ id: string; symbol: string; side: string; pnlUsd: number; roiPct: number; at: string }>;
  room: RoomMessage[];
  routines: { everyMin: number; nextCycleAt?: string | undefined; reportAt: string; nextReportAt: string; weeklyAt: string; lastReport?: DeskReport | undefined };
  reports: DeskReport[];
  cards: Array<{ id: string; lead?: string | undefined; reason: string; usd: number }>;
  /** the venue's row on the account now: its equity, whether it is a paper account */
  venue: { id: string; name: string; usd: number; paper: boolean; connected: boolean };
}

export interface DeskCatalog {
  roles: RoleSpec[];
  /** a house seat's key address, by role (made on first ask, in the home) */
  seats: Partial<Record<RoleId, Hex>>;
  /** the brain the form starts from: the hired one, else the first that is ready */
  brain: BrainStatus & { provider: string; label: string; models: ReadonlyArray<BrainModel>; effort: string };
  /** every brain the desk may think with, each with its standing, the models it lists and — where it says it (Brain.about) — where it is
   * reached, the models it suggests with where and when they were read, the efforts it takes, the key's masked tail, whether a variable in
   * the environment wins over its file (BrainAbout). Never a key */
  brains: Array<BrainStatus & { id: string; label: string; models: ReadonlyArray<BrainModel> } & Partial<BrainAbout>>;
  universes: typeof UNIVERSES;
  defaults: Omit<DeskObjective, "venue" | "text">;
  hired: boolean;
  /** the hired desk's autonomy on paper, as the owner last signed it (null: never said, or no desk) */
  autonomy: DeskAutonomy | null;
  /** each number of the objective, [the least, the most] the desk takes (OBJECTIVE_BOUNDS): the setup form refuses a value outside them in
   * words, so the owner never hires a session that silently runs other numbers than the ones typed */
  bounds: typeof OBJECTIVE_BOUNDS;
}

/** the steps the desk's clock takes, in the words an answer names them with ("the desk's clock is mid-step: …") */
type ClockStep = "a cycle" | "following orders" | "the plan's exits" | "marking the equity" | "writing the report" | "writing the weekly review" | "ending the session";

interface Who {
  signer: string;
  agent?: AgentKey | undefined;
}

export class Desk {
  private file: DeskFile | undefined;
  /** what the desk's clock is doing right now, or undefined when it is free. One step at a time: a tick, or a cycle begun on the owner's
   * ask, takes it before anything is awaited, and nothing else starts until it is given back. Named (not a yes or a no) so that an ask
   * that finds it taken says which step it found — a cycle, or the tick's following of orders, its equity mark, its report — and never
   * calls one of them a cycle */
  private running: ClockStep | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastEquityAt = 0;
  private lastCycleAt = 0;
  private lastNoBrainSaid = "";
  /** the steps under way, the newest last (the clock's cycle, and an owner's report beside it), and the brain calls in flight, and each
   * role's last call: what the floor shows as live (memory only) */
  private readonly steps: DeskWorking[] = [];
  private inFlight = 0;
  private readonly lastThink: Partial<Record<RoleId, DeskThink>> = {};
  /** the account's page as the floor's read last asked for it (the venue's row), with when: asked again after FEED_PAGE_MS. Kept as the
   * read itself, not its answer, so the floor's reads that arrive while it is under way (one a second, more with several tabs) wait on that
   * one read instead of each starting a whole account view of its own */
  private feedPage: { at: number; page: Promise<AccountPage | undefined> } | undefined;
  /** the house keys' addresses, by role, as the keystore has them (asked once each) */
  private readonly houseKeys = new Map<RoleId, string>();
  /** the cycle the owner's last "cycle" started, run beside the door's answer to it */
  private asked: Promise<void> | undefined;
  /** The brain's fault: the API refused its key at a call (E_BRAIN_KEY_REJECTED, brain-key.ts). A key's shape can look right and still be
   * refused — revoked, mistyped, out of credit — and only a call finds that out, so the brain's own ready() cannot say it. Kept here, in
   * memory, from that call until the next call that is answered: meanwhile the standing the page and a seat read (feed, view, catalog) is
   * "not ready", with the fix the brain gave (where the key goes, no restart). The cycles still ask — that is how a replaced key is found
   * to work, and a refused call costs nothing — and the room says the fault once, not every cycle */
  private brainFault: { provider: string; at: string; why: string; who: string; fix: BrainFix } | undefined;
  /** the first cycle after a hire, a resume or the clock's start: when (the account's clock, ms), and its one-shot timer (FIRST_CYCLE_MS) */
  private soonAt = 0;
  private soonTimer: ReturnType<typeof setTimeout> | undefined;

  /** with DeskOptions.deferSaves: the record changed since flush() last wrote it, and the room's lines it has not written yet */
  private unsaved = false;
  private readonly roomBehind: RoomMessage[] = [];

  constructor(private readonly world: DeskWorld, private readonly opts: DeskOptions) {
    this.file = readDesk(world.home);
  }

  /** the brains the desk may think with, told apart by id */
  get brains(): Brain[] {
    return Array.isArray(this.opts.brain) ? this.opts.brain : [this.opts.brain];
  }
  /** The one that thinks: the hired desk's — or, when the account does not hold the provider the desk was hired with, absentBrain, which is
   * never ready and never bills: no other provider is asked in its place. Before a desk is hired, the first held (what the form starts
   * from) */
  get brain(): Brain {
    const want = this.file?.brain.provider;
    if (want === undefined) return this.brains[0]!;
    return this.brains.find((b) => b.id === want) ?? absentBrain(want);
  }

  hired(): boolean {
    return this.file !== undefined;
  }

  /** whether the hired brain can be asked now, as it says of itself (its key's shape, the hired model): what the cycle goes by */
  private ready(): BrainStatus {
    return this.brain.ready(this.file?.brain.model);
  }

  /** A brain's standing as the page and a seat read it: what it says of itself — unless the API refused its key since its last answer
   * (brainFault), and nothing it says now is worse: then not ready, with why and the fix the brain gave */
  private standingOf(b: Brain = this.brain): BrainStatus {
    const st = b.ready(b === this.brain ? this.file?.brain.model : undefined);
    const fault = this.brainFault;
    if (!fault || fault.provider !== b.id || !st.ok) return st;
    return { ok: false, model: st.model, why: fault.why, fix: fault.fix };
  }

  /** the API refused the brain's key at a call: kept as the brain's standing, said in the room once for this fault */
  private keyRefused(err: BrainKeyRejected): void {
    const provider = this.brain.id;
    const had = this.brainFault?.provider === provider;
    const where = err.fix.restart ? "the service's environment" : err.fix.file;
    this.brainFault = { provider, at: this.world.now(), who: err.who, fix: err.fix, why: err.fix.restart ? `${err.who} refused the brain's key, which is in the service's environment: set a working key there and restart the service, or put one in ${err.fix.file}` : `${err.who} refused the brain's key: replace it in ${err.fix.file} — the next cycle reads it, no restart` };
    if (!had) this.room("account", "note", err.fix.restart ? `${err.who} refused the brain's key, which is in ${where}. Set a working key there and restart the service, or put one in ${err.fix.file}.` : `${err.who} refused the brain's key. Replace it in ${where}; the next cycle reads it, no restart.`);
  }

  /** a call was answered: a fault the brain had is gone, and the room says so */
  private keyAccepted(): void {
    const fault = this.brainFault;
    if (!fault || fault.provider !== this.brain.id) return;
    this.brainFault = undefined;
    this.room("account", "note", `${fault.who} answered the brain's call: its key works again.`);
  }

  /** a venue as a person names it: its row's name on the account, else the account's name for it, else the name the desk kept when it was
   * hired there (DeskObjective.venueName) — never a raw id where a name was ever known */
  private venueLabel(id: string, row?: { name: string } | undefined): string {
    if (row?.name) return row.name;
    const n = this.world.venueName(id);
    const f = this.file;
    return n === id && f?.objective.venue === id && f.objective.venueName ? f.objective.venueName : n;
  }

  /** the house seat's key for a role: made in the home on first use */
  seatKeyOf(role: RoleId): SimKey | Refusal {
    return seatKey(this.world.home, seatFile(role));
  }

  /** a house key's address, lower case, as the keystore has it — not only as the desk's file says it */
  private houseAddress(role: RoleId): string | undefined {
    const kept = this.houseKeys.get(role);
    if (kept) return kept;
    const k = this.seatKeyOf(role);
    if (isRefusal(k)) return undefined;
    const a = String(k.address).toLowerCase();
    this.houseKeys.set(role, a);
    return a;
  }

  /** THE DOOR'S QUESTION (live-orders.ts agent() and close(), asked through service.ts only for an order at a paper account): is this the
   * superagent's order — signed by one of THIS desk's own house seats that trades (Sniper, Exit, Watch), its key the keystore's own, at the
   * desk's one venue, with the owner's signed autonomy on and a session that has neither ended nor run past its hours? The words the
   * ledger's row starts with when it is; undefined when it is not, and then the door does what it always does: Guard a card, Beast at
   * once. An outside agent in a seat, a key that holds none, a seat that does not trade, another venue, an ended desk: undefined. It
   * widens nothing else — the seat's trading limit, the venue's rules, the dial are the door's, and judged there as for any order */
  autonomyFor(signer: string, venue: string): string | undefined {
    const f = this.file;
    if (!f || f.autonomy?.paper !== true || !f.session || f.session.endedAt || Date.parse(this.world.now()) >= Date.parse(f.session.endsAt)) return undefined;
    if (venue !== f.objective.venue) return undefined;
    const s = String(signer).toLowerCase();
    const seat = f.seats.find((x) => x.kind === "house" && x.address.toLowerCase() === s);
    if (!seat || !ROLE_SPECS[seat.role].trades || this.houseAddress(seat.role) !== s) return undefined;
    return `Superagent on paper (${seatName(seat.role)}, the desk's autonomy you signed)`;
  }

  /** The floor's live state, around a step: `what` the role does now (and on which lead), taken off when the step ends — the step it was
   * inside shows again (a brain call inside Search's scan keeps the scan's start). Each step takes off only itself: an owner's report
   * written while the clock's cycle runs ends without leaving the other's step behind, or taking it away */
  private async doing<T>(w: { role: RoleId; what: DeskWork; lead?: string | undefined }, fn: () => Promise<T>): Promise<T> {
    const top = this.steps[this.steps.length - 1];
    const same = top !== undefined && top.role === w.role && top.what === w.what && top.lead === w.lead;
    const step: DeskWorking = { role: w.role, what: w.what, ...(w.lead ? { lead: w.lead } : {}), since: same ? top.since : this.world.now() };
    this.steps.push(step);
    this.told();
    try {
      return await fn();
    } finally {
      const i = this.steps.lastIndexOf(step);
      if (i >= 0) this.steps.splice(i, 1);
      this.told();
    }
  }

  /** the floor moved: told to the account's push channel (DeskOptions.onChange), which tells the pages watching it to read it again */
  private told(): void {
    const fn = this.opts.onChange;
    if (!fn) return;
    try {
      fn({ seq: this.file?.counters.seq ?? 0, working: this.working(), inFlight: this.inFlight });
    } catch {
      // the listener's fault is its own: the desk goes on
    }
  }

  /** the step under way now, the newest one begun; null when the desk is idle */
  private working(): DeskWorking | null {
    const w = this.steps[this.steps.length - 1];
    return w ? { ...w } : null;
  }

  // ---- the owner's instructions and a seat's words (through the door: exchange.ts) ----

  async apply(action: Extract<Action, { type: "setDesk" | "agentDeskSay" }>, who: Who): Promise<Outcome> {
    if (action.type === "agentDeskSay") return this.say(action, who);
    if (action.desk !== DESK_ID) return bad(`this account keeps one desk, "${DESK_ID}"`);
    let value: unknown;
    try {
      value = action.value === "" ? {} : JSON.parse(action.value);
    } catch {
      return bad("the desk's value is JSON");
    }
    const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
    switch (action.change) {
      case "hire":
        return this.hire(v);
      case "objective":
        return this.objective(v);
      case "charter":
        return this.charter(v);
      case "seat":
        return this.seat(v);
      case "pause":
      case "resume":
      case "end":
        return this.session(action.change, v);
      case "cycle": {
        if (!this.file) return bad("no desk is hired");
        // a cycle runs inside a session: with none, or one that ended, it would stop at its first line and nothing would reach the room, so
        // the ask is refused in those words rather than answered "a cycle started"
        const s = this.file.session;
        if (!s || s.endedAt) return bad("no session runs: start one first");
        this.room("you", "note", "You asked for a cycle now.");
        // the desk runs one step at a time: while its clock's step is under way, the ask starts nothing on top of it, and says which step it
        // found — a cycle, or the clock following orders, marking the equity, writing the report — never calling the others a cycle
        const busy = this.running;
        const run = this.begin("you asked");
        if (!run) {
          if (busy === "a cycle" || busy === undefined) {
            this.room("account", "note", "A cycle is under way: the desk runs one step at a time, so none was started on top of it.");
            return { ok: true, kind: "account", summary: "a cycle is under way: none was started on top of it" };
          }
          this.room("account", "note", `The desk's clock is mid-step (${busy}): the desk runs one step at a time, so no cycle was started on top of it. Ask again when it is done.`);
          return { ok: true, kind: "account", summary: `the desk's clock is mid-step (${busy}): no cycle was started on top of it` };
        }
        // Started, and not waited for: this ask is itself an instruction at the door, which takes one at a time, and the cycle's orders go
        // through the same door — waiting here would hold the door for the orders that wait for it, and nothing would ever be placed. The
        // cycle's steps are in the room as they happen
        this.asked = run.catch((err: unknown) => console.error(`desk cycle: ${String((err as Error)?.message ?? err).slice(0, 300)}`));
        return { ok: true, kind: "account", summary: "a cycle started: its steps are in the room as they happen" };
      }
      case "brain":
        // the value itself, not the object made of it: a brain sent as an array, a string or null is refused, never read as "no change"
        return this.brainChange(value);
      case "autonomy":
        return this.autonomyChange(v);
      case "report": {
        if (!this.file) return bad("no desk is hired");
        await this.report("evening", true);
        return { ok: true, kind: "account", summary: "the report was written" };
      }
      default:
        return bad(`"${action.change}" is not a change the desk takes: hire · objective · brain · charter · seat · autonomy · pause · resume · end · cycle · report`);
    }
  }

  private parseObjective(v: Record<string, unknown>, base?: DeskObjective): DeskObjective | Refusal {
    const text = plainText(v.text ?? base?.text, OBJECTIVE_TEXT);
    const venue = plainText(v.venue ?? base?.venue, 40);
    if (!text) return bad("an objective is a sentence: what the desk is for this week");
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(venue)) return bad("the objective names the one venue the desk trades, by its id on the account");
    const universe = String(v.universe ?? base?.universe ?? "all") as TabId;
    if (!UNIVERSES.some((u) => u.id === universe)) return bad(`a universe is one of ${UNIVERSES.map((u) => u.id).join(", ")}`);
    const n = (k: keyof typeof OBJECTIVE_BOUNDS, lo: number, hi: number, d: number): number => {
      const x = v[k] === undefined ? (base?.[k] ?? d) : Number(v[k]);
      return Number.isFinite(x) ? clamp(x, lo, hi) : d;
    };
    const reportAt = /^\d{1,2}:\d{2}$/.test(String(v.reportAt ?? "")) ? String(v.reportAt) : (base?.reportAt ?? "21:00");
    const B = OBJECTIVE_BOUNDS;
    // the venue's name is the account's, kept from the row it had (hire and a move set it from the row): never taken from the caller
    return { text, venue, ...(base?.venueName && base.venue === venue ? { venueName: base.venueName } : {}), universe, targetPct: n("targetPct", ...B.targetPct, 3), maxRiskPct: n("maxRiskPct", ...B.maxRiskPct, 1), maxDailyLossPct: n("maxDailyLossPct", ...B.maxDailyLossPct, 5), hours: n("hours", ...B.hours, 22), everyMin: n("everyMin", ...B.everyMin, 15), reportAt, maxOpen: Math.round(n("maxOpen", ...B.maxOpen, 3)) };
  }

  private parseCharter(v: unknown, base: Charter): Charter {
    const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    return { owns: plainText(c.owns, CHARTER_MAX) || base.owns, good: plainText(c.good, CHARTER_MAX) || base.good, never: plainText(c.never, CHARTER_MAX) || base.never };
  }

  /** The brain, as the owner names it: a provider the desk holds — one it does not hold is refused in words, never swapped for another
   * (the owner pays for the brain they signed for, and only that one); named by none, the one the desk has now (the hire's: Claude, the
   * default) if the account holds it, else the only one it holds, else the owner is asked to name it. A model it lists, or — for one that
   * lists none — the model's name as the endpoint knows it (a name that is not one is refused, not replaced; none named: the one the desk
   * has, else the key file's); the effort; the owner's price (null clears it). FIRST of all, a provider or a model that looks like an API
   * key (keyShaped: a key pasted into the wrong field) is refused in fixed words that never repeat it (KEY_IN_MODEL, KEY_IN_PROVIDER) —
   * before any refusal below could say the value back, and before anything is kept: the same for a hire, a change of the brain, an
   * objective and a resume, which all name their brain through here. And the brain is ONE OBJECT of those four fields: anything else in
   * its place (an array, a string, a number, null — BRAIN_NOT_OBJECT) or a field beside them is refused, in words that name such a field
   * only when its name is a plain identifier that does not look like a key (plainFieldName) — never read as "no change", never kept.
   * Undefined is a brain not named (a hire that names none: the default) */
  private parseBrain(v: unknown, base: BrainConfig): BrainConfig | Refusal {
    if (v !== undefined && (!v || typeof v !== "object" || Array.isArray(v))) return bad(BRAIN_NOT_OBJECT);
    const b = (v ?? {}) as Record<string, unknown>;
    // a key where the provider or the model goes: refused before anything below can say it back (brainKeyProblem)
    const keyed = brainKeyProblem(b);
    if (keyed) return bad(keyed);
    const extra = Object.keys(b).find((k) => !(BRAIN_FIELDS as readonly string[]).includes(k));
    if (extra !== undefined) return bad(`a brain is named with ${BRAIN_FIELDS.join(", ")}: ${plainFieldName(extra) ? `"${extra}"` : "a field it was sent"} is not one of them, and nothing was kept`);
    const ids = this.brains.map((x) => x.id);
    const asked = b.provider === undefined || b.provider === null || b.provider === "" ? undefined : String(b.provider);
    if (asked !== undefined && !ids.includes(asked)) return bad(`"${plainText(asked, 40)}" is not a brain this account holds: ${ids.join(", ")}`);
    const provider = asked ?? (ids.includes(base.provider) ? base.provider : ids.length === 1 ? ids[0] : undefined);
    if (provider === undefined) return bad(`name the brain: the desk's "${plainText(base.provider, 40)}" is not one this account holds — ${ids.join(", ")}`);
    const brain = this.brains.find((x) => x.id === provider)!;
    const same = base.provider === provider;
    let model: string;
    if (brain.models.length) {
      const named = b.model === undefined || b.model === "" ? undefined : String(b.model);
      if (named !== undefined && !brain.models.some((m) => m.id === named)) return bad(`${brain.label} lists ${brain.models.map((m) => m.id).join(", ")}: "${named.slice(0, 40)}" is not one of them`);
      model = named ?? (same && brain.models.some((m) => m.id === base.model) ? base.model : brain.models[0]!.id);
    } else {
      const named = b.model === undefined || b.model === null ? "" : String(b.model).trim();
      if (named && !MODEL_ID.test(named)) return bad(`"${plainText(named, 40)}" is not a model's name as an endpoint names it (letters, digits and . _ - : / — 80 at most)`);
      model = named || (same && base.model ? base.model : brain.ready().model);
      if (!model) return bad(`${brain.label}: name the model, as the endpoint names it (or "model" in its key file)`);
    }
    const effort = b.effort === "low" || b.effort === "medium" || b.effort === "high" ? b.effort : base.effort;
    let price: BrainConfig["price"];
    if (b.price === null) price = undefined;
    else if (b.price && typeof b.price === "object") {
      const { inUsd, outUsd } = b.price as Record<string, unknown>;
      const i = Number(inUsd);
      const o = Number(outUsd);
      if (!(Number.isFinite(i) && i >= 0 && Number.isFinite(o) && o >= 0)) return bad("a price is dollars per million tokens, in and out, zero or more");
      price = { inUsd: i, outUsd: o };
    } else price = same && base.model === model ? base.price : undefined;
    return { provider, model, effort, ...(price ? { price } : {}) };
  }

  /** the brain, changed: which one thinks, the model, the effort, the owner's price — `v` the value as it was sent (parseBrain refuses one
   * that is not an object) */
  private brainChange(v: unknown): Outcome {
    if (!this.file) return bad("no desk is hired");
    const b = this.parseBrain(v, this.file.brain);
    if (isRefusal(b)) return b;
    this.file.brain = b;
    this.save();
    this.room("you", "you", this.brainLine(b));
    return { ok: true, kind: "account", summary: `the desk thinks with ${b.model} (${this.brain.label})` };
  }

  /** The room's line for a brain the owner chose (a change, an objective or a resume that carries one): who thinks, the model, the effort
   * as it is SENT — the desk's effort when the provider takes it; else the provider's own default, said so (a preset whose provider's docs
   * name no effort takes none, and DeepSeek takes low and high, not medium: brain-openai.ts leaves an effort it does not take out of the
   * request) — the owner's price, and the standing when it is not ready. A brain that says nothing of its efforts (a script) keeps the
   * desk's word for it */
  private brainLine(b: BrainConfig): string {
    const st = this.standingOf();
    const takes = this.brain.about?.().efforts;
    const effort = !takes || takes.includes(b.effort) ? `${b.effort} effort` : takes.length ? `the provider's own effort (it takes ${takes.join(" or ")}, not ${b.effort})` : "the provider's own effort (its docs name no effort setting)";
    return `You changed the brain: ${this.brain.label} · ${b.model} · ${effort}${b.price ? ` · $${b.price.inUsd}/$${b.price.outUsd} per M tokens` : ""}${st.ok ? "" : ` — not ready: ${st.why ?? "no key"}`}.`;
  }

  /** A BRAIN'S KEY CHANGED (the owner's setBrainKey, written or taken away — account/brain-keys.ts, called by the service once the file
   * changed). A refusal the provider gave the OLD key (brainFault) stops being that brain's standing at once: the page, the floor's feed,
   * the catalog and the key route's answer then read the brain's own word about its new key with no cycle in between — a paused or ended
   * desk runs none, and the owner who just fixed the key would otherwise read "Key refused" beside "Saved" until one did. The room says it
   * in one line from the owner, by the key's FINGERPRINT only (the first eight hex of the hash the owner signed; anything else given as a
   * fingerprint is left out, so nothing key-shaped can ride in): which brain, set or taken away, whether a refusal was cleared, and how the
   * brain stands now. Not when a variable in the service's environment wins over the file (the brain's about().envWins): the brain still
   * uses that key, so a refusal of it stands, and the line says so. A provider the desk does not hold: nothing. No desk hired: the fault
   * (there is none without a desk's call) has nothing to clear, and there is no room to write in. `keyless`: a local server's base URL and
   * model were saved with no key (brain-keys.ts applyBrainKey) — said as that, not as a key taken away */
  keyChanged(provider: string, fingerprint: string, o: { keyless?: boolean | undefined } = {}): void {
    const b = this.brains.find((x) => x.id === provider);
    if (!b || !this.file) return;
    const fp = /^[0-9a-f]{8}$/.test(fingerprint) ? fingerprint : "";
    const envWins = b.about?.().envWins;
    const had = this.brainFault?.provider === provider;
    if (had && !envWins) this.brainFault = undefined;
    const st = this.standingOf(b);
    const what = o.keyless ? `You saved ${b.label}'s address and model, with no key` : fingerprint === "" ? `You took away the key saved for ${b.label}` : `You saved a new key for ${b.label}${fp ? ` (fingerprint ${fp})` : ""}`;
    const cleared = !had ? "" : envWins ? ` — but ${envWins} in the service's environment wins over the file, so the refused key is still the one in use` : " — the refusal of the old key no longer stands";
    const now = st.ok ? "it is ready" : `it is not ready: ${st.why ?? "no key"}`;
    this.room("you", "you", `${what}${cleared}; ${now}.`);
  }

  /** THE SUPERAGENT, switched by the owner's signature: {paper: true} lets the desk's own trading seats place their orders at its venue
   * without cards — taken only while that venue is a paper account on the account (its row says paper); {paper: false} puts the cards back.
   * Turning it off is taken whatever the venue. A new hire starts with it off: the owner says it again for the new desk */
  private async autonomyChange(v: Record<string, unknown>): Promise<Outcome> {
    const f = this.file;
    if (!f) return bad("no desk is hired");
    if (typeof v.paper !== "boolean") return bad('the desk\'s autonomy is {"paper": true} or {"paper": false}: whether its own seats place their orders at its paper account without cards');
    const now = this.world.now();
    if (!v.paper) {
      const was = f.autonomy?.paper === true;
      f.autonomy = { paper: false, at: now };
      this.save();
      this.room("you", "you", was ? "You turned the desk's autonomy off: its orders wait for you on cards again (Guard), unless the account is in Beast." : "You kept the desk's autonomy off: its orders wait for you on cards (Guard), unless the account is in Beast.");
      return { ok: true, kind: "account", summary: "the desk's orders wait for the owner on cards (autonomy off)" };
    }
    const page = await this.world.page();
    const venue = page?.venues.find((x) => x.id === f.objective.venue);
    if (!venue || !venue.live) return bad(`${this.venueLabel(f.objective.venue)} is not connected: the desk trades on its own only at a paper account that is`);
    if (venue.paper !== true) return bad(`${venue.name} is real money: the desk places orders without cards only at a paper account. Move the desk to one first (objective)`);
    f.autonomy = { paper: true, at: now };
    this.save();
    this.room("you", "you", autonomyWords(venue.name));
    return { ok: true, kind: "account", summary: `the desk trades on its own at ${venue.name} (paper money), inside each seat's trading limit` };
  }

  /** hire: the objective, the brain, the seats. The seats' keys are the owner's to let in (approveAgent) and to give limits (approveSpend),
   * which the page signs beside this; the desk reads their standing from the account at every cycle.
   *
   * `autonomy` ({"paper": true} or {"paper": false}; optional): the desk's autonomy on paper, said in the same signature as the hire, so
   * the desk never runs a moment — and its first cycle never runs — without the owner's word on it. Taken on the same terms as the change
   * of its own (autonomyChange): {"paper": true} only where the desk's venue is a paper account, else the whole hire is refused in those
   * words and nothing is hired. Left out, the new desk starts with it off, unsaid, as before: the owner says it with `autonomy` */
  private async hire(v: Record<string, unknown>): Promise<Outcome> {
    if (this.file && this.file.session && !this.file.session.endedAt) return bad("a desk is hired and its session runs: end it first (end), or change its objective (objective)");
    const asked = this.parseObjective((v.objective && typeof v.objective === "object" && !Array.isArray(v.objective) ? v.objective : {}) as Record<string, unknown>);
    if (isRefusal(asked)) return asked;
    const said = autonomySaid(v);
    if (said !== undefined && typeof said !== "boolean") return bad('a hire\'s autonomy is {"paper": true} or {"paper": false}: whether the desk\'s own seats place their orders at its paper account without cards');
    const page = await this.world.page();
    const venue = page?.venues.find((x) => x.id === asked.venue);
    if (!venue || !venue.live) return bad(`"${asked.venue}" is not a venue connected on the account`);
    if (!venue.trade || venue.trade.can === false) return bad(`${venue.name} does not trade from here: the desk trades one venue that does (a paper account, or an exchange whose key may trade)`);
    if (said === true && venue.paper !== true) return bad(`${venue.name} is real money: the desk places orders without cards only at a paper account. Hire it at one, or hire it without the autonomy`);
    // the venue's name as its row says it now, kept for when the row is gone (venueLabel)
    const objective: DeskObjective = { ...asked, venueName: venue.name };
    const roles = Array.isArray(v.roles) ? (v.roles as unknown[]) : [];
    const seats: DeskSeat[] = [];
    const now = this.world.now();
    for (const r of roles) {
      const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const role = String(x.role ?? "") as RoleId;
      const spec = ROLE_SPECS[role];
      if (!spec) return bad(`"${String(x.role)}" is not a role: ${ROLES.join(", ")}`);
      if (seats.some((s) => s.role === role)) return bad(`the ${spec.name} seat is named twice`);
      const kind = x.kind === "outside" ? "outside" : "house";
      if (kind === "house" && !spec.house) return bad(`the ${spec.name} seat ${spec.outsideOnly}`);
      let address: Hex;
      let name: string;
      if (kind === "house") {
        const k = this.seatKeyOf(role);
        if (isRefusal(k)) return k;
        address = k.address as Hex;
        name = seatName(role);
      } else {
        const a = String(x.address ?? "").toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(a)) return bad(`an outside seat names the agent key that fills it (0x…): the ${spec.name} seat does not`);
        address = a as Hex;
        name = plainText(x.name, 32) || page?.keys.find((k) => k.address === a)?.name || spec.name;
      }
      seats.push({ role, kind, address, name, charter: this.parseCharter(x.charter, spec.charter), hiredAt: now });
    }
    if (!seats.length) return bad("a desk has at least one seat");
    if (!seats.some((s) => s.role === "head")) return bad("hire the Head of desk first: it never trades, and it runs the room");
    const brain = this.parseBrain(v.brain, DEFAULT_BRAIN);
    if (isRefusal(brain)) return brain;
    const name = plainText(v.name, 40) || "The desk";
    const was = this.file;
    this.file = { v: 1, id: DESK_ID, name, createdAt: now, objective, brain, seats, leads: was ? recentAndOpen(was.leads, MAX_LEADS) : [], equity: [], reports: was?.reports.slice(-MAX_REPORTS) ?? [], spend: was?.spend ?? { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, failed: 0 }, counters: was?.counters ?? { lead: 0, seq: 0 } };
    this.file.session = this.newSession(venue.usd, now, objective.hours);
    if (said !== undefined) this.file.autonomy = { paper: said, at: now };
    this.reportsDoneBefore(now);
    this.save();
    this.room("you", "you", `You hired ${name}: ${seatNames(seats)}. Objective: “${objective.text}” at ${venue.name} · target ${pct(objective.targetPct)} · at most ${objective.maxRiskPct}% a lead · halt at -${objective.maxDailyLossPct}% in a day · a cycle every ${objective.everyMin} min for ${objective.hours} h.`);
    if (said === true) this.room("you", "you", autonomyWords(venue.name));
    await this.report("start");
    this.soon();
    return { ok: true, kind: "account", summary: `desk hired: ${seats.length} seat${seats.length === 1 ? "" : "s"} at ${venue.name}, a session of ${objective.hours} h from ${usd(venue.usd)}${said === true ? ", trading on its own there (paper money)" : ""}` };
  }

  private newSession(startEquityUsd: number, now: string, hours: number): DeskSession {
    const start = Date.parse(now);
    return { startedAt: now, startEquityUsd: r2(startEquityUsd), hours, endsAt: new Date(start + hours * HOUR).toISOString(), cycles: 0 };
  }

  /** A session that starts after the day's report hour (New York) has had no day to report on: today counts as reported, so no evening
   * report of all zeros comes minutes after the start — the next one is tomorrow's, at its hour. On a Sunday the weekly review the same */
  private reportsDoneBefore(now: string): void {
    const f = this.file;
    if (!f) return;
    const t = ny(Date.parse(now));
    if (t.minutes < minutesOf(f.objective.reportAt)) return;
    f.reported = t.day;
    if (t.dow === 0) f.reviewed = t.day;
  }

  /** The first cycle, soon: at a hire, a resume or the clock's start, FIRST_CYCLE_MS from now rather than at the clock's next tick (every
   * 30 seconds), so the floor never reads "next in 00:00" for half a minute after the owner started it. The owner signed the hire or the
   * resume, which is what starts the desk; what a cycle costs is its brain's calls, the brain the owner chose. A one-shot timer, only where
   * the clock runs (the real server); the clock's own tick goes on as before, and runs no cycle before that moment (tick).
   *
   * Before that moment the owner may still be signing: a Start that signs the hire and then the autonomy, one after the other, has its
   * autonomy in place by the first cycle as long as the second signature takes less than FIRST_CYCLE_MS. A hire that carries the autonomy
   * itself (hire `autonomy`) leaves no such gap at all */
  private soon(): void {
    this.lastCycleAt = 0;
    const after = this.opts.firstCycleMs ?? FIRST_CYCLE_MS;
    this.soonAt = Date.parse(this.world.now()) + after;
    if (!this.timer) return;
    if (this.soonTimer) clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => {
      this.soonTimer = undefined;
      // the timer is the moment itself: a clock read a millisecond short of soonAt (timers and the wall clock are not the same clock) does
      // not put the first cycle off to the next tick
      this.soonAt = Math.min(this.soonAt, Date.parse(this.world.now()));
      void this.tick().catch((err: unknown) => console.error(`desk tick: ${String((err as Error)?.message ?? err).slice(0, 300)}`));
    }, after);
    this.soonTimer.unref?.();
  }


  private async objective(v: Record<string, unknown>): Promise<Outcome> {
    if (!this.file) return bad("no desk is hired");
    const o = this.parseObjective(v, this.file.objective);
    if (isRefusal(o)) return o;
    // the brain it carries, checked whole BEFORE anything is changed: a refused brain (one the account does not hold, a model's name that is
    // not one, a key where the model goes) refuses the whole change — the objective stays as it was, in memory and in desk.json
    let brain: BrainConfig | undefined;
    if (v.brain !== undefined) {
      const b = this.parseBrain(v.brain, this.file.brain);
      if (isRefusal(b)) return b;
      brain = b;
    }
    if (o.venue !== this.file.objective.venue) {
      const page = await this.world.page();
      const venue = page?.venues.find((x) => x.id === o.venue);
      if (!venue || !venue.live) return bad(`"${o.venue}" is not a venue connected on the account`);
      if (this.file.leads.some((l) => l.state === "executed" || l.state === "confirmed" || l.state === "closing")) return bad("the desk has open leads at its venue: close them, or end the session, before it moves venue");
      // the autonomy the owner signed is for paper money: with it on, the desk moves only to another paper account
      if (this.file.autonomy?.paper === true && venue.paper !== true) return bad(`the desk trades on its own on paper (autonomy): ${venue.name} is real money, so it does not move there with autonomy on. Turn it off first (autonomy {"paper": false}), and its orders there wait on cards`);
      // the new venue's name, as its row says it, kept for when the row is gone (venueLabel)
      o.venueName = venue.name;
    }
    this.file.objective = o;
    if (brain) this.file.brain = brain;
    this.save();
    this.room("you", "you", `You changed the objective: “${o.text}” · target ${pct(o.targetPct)} · at most ${o.maxRiskPct}% a lead · halt at -${o.maxDailyLossPct}% · every ${o.everyMin} min · report ${o.reportAt}.`);
    if (brain) this.room("you", "you", this.brainLine(brain));
    return { ok: true, kind: "account", summary: `the desk's objective changed${brain ? `, thinking with ${brain.model} (${this.brain.label})` : ""}` };
  }

  private charter(v: Record<string, unknown>): Outcome {
    if (!this.file) return bad("no desk is hired");
    const seat = this.file.seats.find((s) => s.role === v.role);
    if (!seat) return bad(`no seat on the desk is "${String(v.role)}"`);
    seat.charter = this.parseCharter(v, seat.charter);
    this.save();
    this.room("you", "you", `You changed the ${ROLE_SPECS[seat.role].tag} charter.`);
    return { ok: true, kind: "account", summary: `the ${ROLE_SPECS[seat.role].name} charter changed` };
  }

  /** a seat filled, or filled by another key: a house seat by the account's own key, an outside one by the key the owner names (which the
   * owner lets in and, for a trading role, gives a limit) — or left empty (`kind` "none") */
  private async seat(v: Record<string, unknown>): Promise<Outcome> {
    if (!this.file) return bad("no desk is hired");
    const role = String(v.role ?? "") as RoleId;
    const spec = ROLE_SPECS[role];
    if (!spec) return bad(`"${String(v.role)}" is not a role: ${ROLES.join(", ")}`);
    if (v.kind === "none") {
      if (role === "head") return bad("the Head of desk stays: end the desk instead");
      this.file.seats = this.file.seats.filter((s) => s.role !== role);
      this.save();
      this.room("you", "you", `You left the ${spec.tag} seat empty.`);
      return { ok: true, kind: "account", summary: `the ${spec.name} seat is empty` };
    }
    const kind = v.kind === "outside" ? "outside" : "house";
    if (kind === "house" && !spec.house) return bad(`the ${spec.name} seat ${spec.outsideOnly}`);
    let address: Hex;
    let name: string;
    if (kind === "house") {
      const k = this.seatKeyOf(role);
      if (isRefusal(k)) return k;
      address = k.address as Hex;
      name = seatName(role);
    } else {
      const a = String(v.address ?? "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(a)) return bad("an outside seat names the agent key that fills it (0x…)");
      address = a as Hex;
      // the key's name on the account, when the owner has let it in
      const page = await this.world.page();
      name = plainText(v.name, 32) || page?.keys.find((k) => k.address === a)?.name || spec.name;
    }
    const was = this.file.seats.find((s) => s.role === role);
    const seat: DeskSeat = { role, kind, address, name, charter: this.parseCharter(v.charter, was?.charter ?? spec.charter), hiredAt: this.world.now() };
    this.file.seats = was ? this.file.seats.map((s) => (s.role === role ? seat : s)) : [...this.file.seats, seat];
    this.save();
    this.room("you", "you", `You filled the ${spec.tag} seat ${kind === "house" ? "from the house" : `with ${name} (${address.slice(0, 8)}…)`}.`);
    return { ok: true, kind: "account", summary: `the ${spec.name} seat is filled ${kind === "house" ? "from the house" : `by ${name}`}` };
  }

  /** Pause, resume, end. A RESUME may carry, in the same signature, what the desk starts again with: `autonomy` ({"paper": true} or
   * {"paper": false}) and `brain` (a BrainConfig, as a hire names it) — so an ended session starts again with its autonomy on paper in one
   * step ("Start again · auto on paper"), and its first cycle never runs without it. Both are taken exactly as a hire takes them: the
   * autonomy on only where the desk's venue is a paper account, connected; the brain only one the account holds, with a model it serves —
   * anything else and the WHOLE resume is refused in those words, nothing changed, nothing started. Left out (the value "", as before),
   * the desk resumes with what it had. A pause and an end take no value: one given is not read */
  private async session(change: "pause" | "resume" | "end", v: Record<string, unknown> = {}): Promise<Outcome> {
    if (!this.file) return bad("no desk is hired");
    const s = this.file.session;
    const now = this.world.now();
    if (change === "pause") {
      if (!s || s.endedAt) return bad("no session runs");
      if (s.pausedAt) return bad("the session is paused already");
      s.pausedAt = now;
      this.save();
      this.room("you", "you", "You paused the desk: no cycle runs until you resume it. Open leads keep their plan when it does.");
      return { ok: true, kind: "account", summary: "the desk is paused" };
    }
    if (change === "end") {
      if (!s || s.endedAt) return bad("no session runs");
      s.endedAt = now;
      this.save();
      await this.report("end");
      return { ok: true, kind: "account", summary: "the session ended" };
    }
    const paused = !!s && !s.endedAt && !!s.pausedAt;
    if (s && !s.endedAt && !paused) return bad("the session runs already");
    // what the resume carries, checked whole before anything changes
    const said = autonomySaid(v);
    if (said !== undefined && typeof said !== "boolean") return bad('a resume\'s autonomy is {"paper": true} or {"paper": false}: whether the desk\'s own seats place their orders at its paper account without cards');
    let brain: BrainConfig | undefined;
    if (v.brain !== undefined) {
      const b = this.parseBrain(v.brain, this.file.brain);
      if (isRefusal(b)) return b;
      brain = b;
    }
    const needPage = !paused || said === true;
    const page = needPage ? await this.world.page() : undefined;
    const venue = page?.venues.find((x) => x.id === this.file!.objective.venue);
    if (!paused && (!venue || !venue.live)) return bad(`${this.venueLabel(this.file.objective.venue)} is not connected: connect it, then start a session`);
    if (said === true) {
      if (!venue || !venue.live) return bad(`${this.venueLabel(this.file.objective.venue)} is not connected: the desk trades on its own only at a paper account that is`);
      if (venue.paper !== true) return bad(`${venue.name} is real money: the desk places orders without cards only at a paper account. Resume it without the autonomy, or move it to one first (objective)`);
    }
    // taken: the brain and the autonomy first, so the first cycle (soon) already has them
    const f = this.file;
    if (brain) f.brain = brain;
    const was = f.autonomy?.paper === true;
    if (said !== undefined) f.autonomy = { paper: said, at: now };
    const venueName = venue?.name ?? this.venueLabel(f.objective.venue);
    const sayCarried = () => {
      if (brain) this.room("you", "you", this.brainLine(brain));
      if (said === true) this.room("you", "you", autonomyWords(venueName));
      else if (said === false) this.room("you", "you", was ? "You turned the desk's autonomy off: its orders wait for you on cards again (Guard), unless the account is in Beast." : "You kept the desk's autonomy off: its orders wait for you on cards (Guard), unless the account is in Beast.");
    };
    const carried = `${brain ? `, thinking with ${brain.model} (${this.brain.label})` : ""}${said === true ? `, trading on its own at ${venueName} (paper money)` : said === false ? ", its orders on cards" : ""}`;
    if (paused) {
      delete s!.pausedAt;
      this.save();
      this.room("you", "you", "You resumed the desk.");
      sayCarried();
      this.soon();
      return { ok: true, kind: "account", summary: `the desk runs again${carried}` };
    }
    f.session = this.newSession(venue!.usd, now, f.objective.hours);
    f.equity = [];
    this.reportsDoneBefore(now);
    this.save();
    this.room("you", "you", `You started a new session of ${f.objective.hours} h from ${usd(venue!.usd)}.`);
    sayCarried();
    await this.report("start");
    this.soon();
    return { ok: true, kind: "account", summary: `a new session of ${f.objective.hours} h${carried}` };
  }

  /** an outside seat's words in the room, under its key */
  private say(a: Extract<AgentAction, { type: "agentDeskSay" }>, who: Who): Outcome {
    if (!this.file) return bad("no desk is hired");
    const seat = this.file.seats.find((s) => s.address === who.signer.toLowerCase());
    if (!seat) return no("E_ACCOUNT_OWNER_ONLY", { message: "this key holds no seat on the desk: the owner fills a seat with it under Agents › Desk", detail: { signer: who.signer } });
    const kind: RoomKind = a.kind === "lead" || a.kind === "clearance" || a.kind === "report" || a.kind === "warning" ? a.kind : "note";
    const text = plainText(a.text, TEXT_MAX);
    if (!text) return bad("say something: the words are the message");
    const lead = /^L-\d{4,}$/.test(a.lead) ? a.lead : undefined;
    if (lead && !this.file.leads.some((l) => l.id === lead)) return bad(`no lead on the desk is ${lead}`);
    this.room(seat.role, kind, text, { lead });
    return { ok: true, kind: "account", summary: `${ROLE_SPECS[seat.role].tag} said it in the room` };
  }

  // ---- the room, the file ----

  private room(from: RoomMessage["from"], kind: RoomKind, text: string, extra: { lead?: string | undefined; refs?: RoomMessage["refs"]; brain?: true | undefined } = {}): RoomMessage {
    const f = this.file;
    const seq = f ? ++f.counters.seq : 0;
    const m: RoomMessage = { seq, at: this.world.now(), from, kind, text: text.slice(0, 600), ...(extra.lead ? { lead: extra.lead } : {}), ...(extra.refs ? { refs: extra.refs } : {}), ...(extra.brain ? { brain: true as const } : {}) };
    if (this.opts.deferSaves) this.roomBehind.push(m);
    else this.roomAppend([m]);
    if (f) this.save();
    return m;
  }

  /** lines added to room.jsonl; a room that grew past what is kept is cut to its last part, once in a while (each 500th line) */
  private roomAppend(lines: RoomMessage[]): void {
    if (!lines.length) return;
    const p = roomPath(this.world.home);
    mkdirSync(join(p, ".."), { recursive: true, mode: 0o700 });
    const exists = existsSync(p);
    writeFileSync(p, lines.map((m) => `${JSON.stringify(m)}\n`).join(""), { flag: "a", mode: 0o600 });
    if (!exists) chmodSync(p, 0o600);
    if (lines.some((m) => m.seq % 500 === 0)) {
      const all = readFileSync(p, "utf8").split("\n").filter(Boolean);
      if (all.length > ROOM_KEPT) writePrivate(p, `${all.slice(-ROOM_KEPT).join("\n")}\n`);
    }
  }

  private save(): void {
    if (!this.file) return;
    if (this.file.leads.length > MAX_LEADS) this.file.leads = recentAndOpen(this.file.leads, MAX_LEADS);
    if (this.file.reports.length > MAX_REPORTS) this.file.reports = this.file.reports.slice(-MAX_REPORTS);
    if (this.opts.deferSaves) this.unsaved = true;
    else writePrivate(deskPath(this.world.home), `${JSON.stringify(this.file, null, 1)}\n`);
    this.told();
  }

  /** The record and the room's new lines written now, where DeskOptions.deferSaves kept them in memory (a desk played over recorded bars
   * calls it at the end of its run); with every change written as it happens, there is nothing to write */
  flush(): void {
    const lines = this.roomBehind.splice(0);
    this.roomAppend(lines);
    if (this.unsaved && this.file) writePrivate(deskPath(this.world.home), `${JSON.stringify(this.file, null, 1)}\n`);
    this.unsaved = false;
  }

  // ---- the clock ----

  /** the desk's own timers (the real server): a tick every `tickMs` (30 s) */
  start(): () => void {
    const every = this.opts.tickMs ?? 30_000;
    if (every > 0 && !this.timer) {
      this.timer = setInterval(() => void this.tick().catch((err: unknown) => console.error(`desk tick: ${String((err as Error)?.message ?? err).slice(0, 300)}`)), every);
      this.timer.unref?.();
      // a session that runs (the service started again) has its first cycle soon, as after a resume
      const s = this.file?.session;
      if (s && !s.endedAt && !s.pausedAt) this.soon();
    }
    return () => {
      if (this.timer) clearInterval(this.timer);
      if (this.soonTimer) clearTimeout(this.soonTimer);
      this.timer = undefined;
      this.soonTimer = undefined;
    };
  }

  /** what the clock does: the leads' orders read back, an equity point, a cycle when one is due, the report at its hour, the session's end */
  async tick(): Promise<void> {
    const f = this.file;
    if (!f || !f.session || f.session.endedAt || this.running) return;
    // taken at once, before anything is awaited; each step names itself as it starts, so an ask that comes meanwhile is told which
    this.running = "following orders";
    try {
      const nowMs = Date.parse(this.world.now());
      const s = f.session;
      if (s.halted && nowMs >= Date.parse(s.halted.until)) {
        delete s.halted;
        this.save();
        this.room("head", "note", "A new day in New York: the floor is open again.");
      }
      if (nowMs >= Date.parse(s.endsAt)) {
        s.endedAt = this.world.now();
        this.save();
        this.running = "ending the session";
        await this.report("end");
        return;
      }
      this.running = "following orders";
      await this.followOrders();
      // the first cycle after a hire, a resume or the clock's start comes at its own moment (soonAt), never earlier: a tick of the clock that
      // lands in the seconds between the owner's hire and the autonomy signed after it would otherwise run the first cycle at once, and its
      // entry would wait on a card although the owner was still signing the autonomy that places it (soon, autonomyChange)
      const cycleDue = !s.pausedAt && nowMs - this.lastCycleAt >= f.objective.everyMin * 60_000 && nowMs >= this.soonAt;
      // the plan's exits (take-profit, stop, time) are numbers: judged at every tick of the clock, never only once a cycle — and never
      // waiting for a brain. A paused desk's leads keep their plan for when it resumes (the venue still holds a bracketed entry's exits).
      // On a tick where a cycle is due the cycle's own exits judge the plan first, so they are not judged here too: a close the door
      // refused a moment ago would be sent again at once, and its refusal (or a missing mark) said twice in the room and the ledger
      if (!s.pausedAt && !cycleDue) {
        this.running = "the plan's exits";
        await this.planExits();
      }
      this.running = "marking the equity";
      if (nowMs - this.lastEquityAt >= 60_000) await this.markEquity();
      const nyNow = ny(nowMs);
      const at = minutesOf(f.objective.reportAt);
      this.running = "writing the report";
      if (nyNow.minutes >= at && f.reported !== nyNow.day) await this.report("evening");
      this.running = "writing the weekly review";
      if (nyNow.dow === 0 && nyNow.minutes >= at && f.reviewed !== nyNow.day) await this.review();
      this.running = "a cycle";
      // paused while the steps above were awaited (the owner's ask): no cycle, as before
      if (cycleDue && !s.pausedAt) await this.cycleNow("the clock");
    } finally {
      this.running = undefined;
    }
  }

  /** one cycle, now (a test, the stand-in), waited for. False when one could not start: the desk's clock is mid-step, and nothing runs on
   * top of it */
  async cycle(why = "asked"): Promise<boolean> {
    const run = this.begin(why);
    if (!run) return false;
    await run;
    return true;
  }

  /** a cycle begun now — the desk taken for it at once, before anything is awaited, so no other step starts beside it — or undefined when
   * one is under way */
  private begin(why: string): Promise<void> | undefined {
    if (this.running) return undefined;
    this.running = "a cycle";
    return (async () => {
      try {
        await this.followOrders();
        await this.cycleNow(why);
      } finally {
        this.running = undefined;
      }
    })();
  }

  /** the cycle the owner's last ask started, until it is done (the door answers the ask without waiting for it): tests wait on it */
  async idle(): Promise<void> {
    await this.asked;
  }

  // ---- the cycle ----

  private async cycleNow(why: string): Promise<void> {
    const f = this.file;
    if (!f || !f.session || f.session.endedAt) return;
    this.lastCycleAt = Date.parse(this.world.now());
    // the first cycle came: the next is the objective's minutes after this one
    this.soonAt = 0;
    f.session.cycles++;
    const page = await this.world.page();
    if (!page) return;
    const venue = page.venues.find((v) => v.id === f.objective.venue);
    // the autonomy is for paper money: a venue that is not a paper account now (its id connected again to a real one) turns it off, and the
    // record says so — the door would not honour it there anyway (it checks the venue itself)
    if (f.autonomy?.paper === true && venue?.live && venue.paper !== true) {
      f.autonomy = { paper: false, at: this.world.now() };
      this.save();
      this.room("account", "note", `${venue.name} is not a paper account now: the desk's autonomy is off, and its orders wait on cards (Guard) unless the account is in Beast.`);
    }
    const standing = this.standing(page);
    const seatOk = (role: RoleId) => standing.get(role)?.status === "ok";
    const n = f.session.cycles;
    // the cycle goes by what the brain says of itself, not by a fault kept from an earlier call (brainFault): asking again is how a
    // replaced key is found to work
    const brain = this.ready();
    // the Exit's plan runs whether or not a brain thinks: a take-profit, a stop and a time limit are numbers
    const exits = await this.exits(page, venue, brain.ok && seatOk("exit"));
    await this.markEquity();
    const halted = this.checkHalt();
    const open = this.openLeads().length;
    if (!venue || !venue.live) {
      this.room("head", "cycle", `Cycle ${n} (${why}): ${this.venueLabel(f.objective.venue, venue)} is not connected, so nothing is scanned.`);
      return;
    }
    if (!brain.ok) {
      // said once an hour, not every cycle
      const key = `${ny(Date.parse(this.world.now())).day}-${Math.floor(Date.parse(this.world.now()) / HOUR)}`;
      if (this.lastNoBrainSaid !== key) {
        this.lastNoBrainSaid = key;
        this.room("account", "note", `Cycle ${n}: the house seats have no brain to think with (${brain.why ?? "no key"}). The plan's exits still run; no lead is made up.`);
      }
      return;
    }
    if (halted || f.session.halted) {
      this.room("head", "cycle", `Cycle ${n} (${why}): the floor is halted until ${this.when(f.session.halted?.until)} — ${exits} exit${exits === 1 ? "" : "s"} reviewed, no new lead.`);
      return;
    }
    if (f.session.pausedAt) return;
    if (open >= f.objective.maxOpen) {
      this.room("head", "cycle", `Cycle ${n} (${why}): ${open} lead${open === 1 ? "" : "s"} open, the most the objective allows — nothing new scanned.`);
      return;
    }
    const sniper = standing.get("sniper");
    if (!f.seats.some((s) => s.role === "search")) {
      this.room("head", "cycle", `Cycle ${n} (${why}): no Search seat, so no lead is scanned.`);
      return;
    }
    if (!sniper || sniper.status !== "ok") {
      this.room("head", "cycle", `Cycle ${n} (${why}): the Sniper seat is ${sniper ? sniper.status : "empty"}: nothing would be placed, so nothing is scanned. Let it in under Agents.`);
      return;
    }
    if (!sniper.limit || !sniper.limit.venues.includes(venue.id)) {
      this.room("head", "cycle", `Cycle ${n} (${why}): the Sniper has no trading limit at ${venue.name}: the door would refuse its orders, so nothing is scanned. Give it one under Agents.`);
      return;
    }
    const scan = await this.search(venue, page);
    // Search's brain gave nothing (it did not answer, or answered with no decision), or there was no table to show it: the cycle says that,
    // never "nothing worth a lead" — the market was not judged quiet, it was not judged at all
    if (scan.unjudged) {
      this.room("head", "cycle", `Cycle ${n} (${why}): ${scan.unjudged}, so no lead was looked for.`);
      return;
    }
    const leads = scan.leads;
    if (!leads.length) {
      this.room("head", "cycle", `Cycle ${n} (${why}): scanned, nothing worth a lead this time.`);
      return;
    }
    // a lead placed, and a lead whose order waits for the owner on a card, are counted apart: a card is not a placed order
    let placed = 0;
    let carded = 0;
    for (const lead of leads) {
      const cleared = await this.clear(lead, venue, sniper.limit, page);
      if (!cleared) continue;
      if (this.openLeads().length >= f.objective.maxOpen) {
        this.room("risk", "clearance", `${lead.id} cleared, but the desk is at its most open leads: it waits for the next cycle.`, { lead: lead.id });
        continue;
      }
      const went = await this.enter(lead, venue);
      if (went === "placed") placed++;
      else if (went === "card") carded++;
    }
    this.room("head", "cycle", `Cycle ${n} (${why}): ${leads.length} lead${leads.length === 1 ? "" : "s"} scanned, ${leads.filter((l) => l.state !== "rejected").length} cleared, ${placed} placed, ${carded} waiting for you, ${this.openLeads().length} open.`);
  }

  /** each seat's standing on the account: let in, its trading limit at the desk's venue, its cards waiting */
  private standing(page: AccountPage): Map<RoleId, { status: "ok" | "not let in" | "expired" | "revoked"; limit?: SeatLimit | undefined; cards: number }> {
    const out = new Map<RoleId, { status: "ok" | "not let in" | "expired" | "revoked"; limit?: SeatLimit | undefined; cards: number }>();
    for (const s of this.file?.seats ?? []) {
      const keys = page.keys.filter((k) => k.address === s.address).sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt));
      const key = keys[0];
      const status = !key ? "not let in" : key.status === "ok" ? "ok" : key.status === "expired" ? "expired" : "revoked";
      const spend = page.spend.find((x) => x.agent === s.address && x.scope === "trade" && !x.expired && x.budgetUsd > 0);
      const limit: SeatLimit | undefined = spend ? { perOrderUsd: spend.perPaymentUsd, leftUsd: r2(Math.max(0, spend.budgetUsd - spend.spentUsd - spend.reservedUsd)), budgetUsd: spend.budgetUsd, venues: spend.allow, ...(spend.renewHours ? { renewHours: spend.renewHours, ...(spend.renewsAt ? { renewsAt: spend.renewsAt } : {}) } : {}) } : undefined;
      out.set(s.role, { status, limit, cards: page.cards.filter((c) => c.agent === s.address).length });
    }
    return out;
  }

  private openLeads(): Lead[] {
    return (this.file?.leads ?? []).filter(isOpenLead);
  }

  /** how many of the desk's leads are open at `venue` now (waiting on the owner, placed, held or closing): a paper account the desk trades
   * is not started again under them (service.ts paperControl) */
  openLeadsAt(venue: string): number {
    return this.file && this.file.objective.venue === venue ? this.openLeads().length : 0;
  }

  // ---- Search ----

  private search(venue: AccountPage["venues"][number], page: AccountPage): Promise<Scanned> {
    return this.doing({ role: "search", what: "scan" }, () => this.scan(venue, page));
  }

  /** Search's step: Markets read, the table shown to the brain, the leads it names — and the scan kept as it was (DeskScan): the table's
   * rows exactly as the brain saw them, the leads it picked with their confidence, its note; where no table could be shown, no rows and
   * the reason, which the room says too */
  private async scan(venue: AccountPage["venues"][number], _page: AccountPage): Promise<Scanned> {
    const f = this.file!;
    const cycle = f.session?.cycles ?? 0;
    const scanned = (rows: ScanRow[], picked: DeskScan["picked"], note: string | undefined) => {
      f.lastScan = { cycle, at: this.world.now(), venue: venue.id, rows, picked, ...(note ? { note } : {}) };
      this.save();
    };
    const tab = f.objective.universe === "all" ? undefined : f.objective.universe;
    const x = await this.world.explore({ ...(tab ? { tab } : {}), limit: 60 });
    if (isRefusal(x)) {
      const why = `Markets did not answer: ${x.message}`;
      scanned([], [], plainText(why, TEXT_MAX));
      this.room("search", "note", why);
      return { leads: [], unjudged: "Markets did not answer Search" };
    }
    // what the desk's venue lists, as a row the listing gives a price for — in the desk's universe: Markets' movers and most traded are
    // the whole listing's whatever tab is asked, so a row outside the universe is left out here
    const atVenue = (i: ExploreItem) => i.at.find((a) => a.venue === venue.id && a.price !== undefined);
    const inUniverse = (i: ExploreItem) => f.objective.universe === "all" || i.tabs.includes(f.objective.universe);
    const rows = [...x.items, ...x.movers, ...x.mostTraded].filter((i, k, all) => inUniverse(i) && all.findIndex((j) => j.key === i.key) === k).map((i) => ({ i, a: atVenue(i) })).filter((r): r is { i: ExploreItem; a: NonNullable<ReturnType<typeof atVenue>> } => r.a !== undefined && r.a.open !== false).slice(0, SCAN_ROWS);
    const scannedCount = rows.length;
    if (!rows.length) {
      const why = `${venue.name} lists nothing in the ${UNIVERSES.find((u) => u.id === f.objective.universe)?.label ?? f.objective.universe} universe right now.`;
      scanned([], [], why);
      this.room("search", "note", why);
      return { leads: [], unjudged: `${venue.name} lists nothing in the desk's universe right now` };
    }
    const held = new Set(this.openLeads().map((l) => l.symbol));
    const table = rows.map(({ i, a }) => ({ symbol: a.symbol, name: i.name, kind: i.kind, price: a.price, bid: a.bid, ask: a.ask, changePct24h: i.changePct24h, volumeUsd24h: i.volumeUsd24h, ...(i.fundingRate !== undefined ? { fundingRate: i.fundingRate } : {}), ...(i.closeTime ? { closeTime: i.closeTime } : {}), ...(held.has(a.symbol) ? { heldByDesk: true } : {}) }));
    // the scan's rows are the table's own, each as the brain was shown it
    const seen: ScanRow[] = table.map((t) => ({ symbol: t.symbol, name: t.name, kind: t.kind, price: t.price!, ...(t.changePct24h !== undefined ? { changePct24h: t.changePct24h } : {}), ...(t.volumeUsd24h !== undefined ? { volumeUsd24h: t.volumeUsd24h } : {}) }));
    const seat = f.seats.find((s) => s.role === "search")!;
    const asked = await this.ask("search", "scan", seat.charter, `The desk's venue: ${venue.name}${venue.paper ? " (a paper account: paper money, real public prices)" : ""}. Objective: ${JSON.stringify(f.objective)}. Open leads: ${JSON.stringify(this.openLeads().map((l) => ({ id: l.id, symbol: l.symbol, side: l.side })))}. Markets now (the account's own listing): ${JSON.stringify(table)}. Name at most three leads, each a symbol from the table, a side (sell opens a short: only on a perpetual), a one-sentence thesis tied to a number in the table, and your confidence 0 to 1. An empty list is a fine answer.`, SearchOut, 1200, { quiet: true });
    const ans = asked.out;
    const markets = `${scannedCount} market${scannedCount === 1 ? "" : "s"}`;
    // the brain gave nothing: ONE line says so — the account's words, not the brain's, so without the brain's mark — and the cycle is told,
    // so it never says the market was judged quiet
    if (ans === null) {
      const said = asked.failed ? `the brain did not answer (${asked.why ?? "no reason given"})` : `the brain gave no decision (${asked.why ?? "no reason given"})`;
      const line = `Scanned ${markets}, but ${said}: no lead this cycle.`;
      scanned(seen, [], plainText(line, TEXT_MAX));
      this.room("search", "note", line);
      return { leads: [], unjudged: asked.failed ? "Search's brain did not answer" : "Search's brain gave no decision" };
    }
    const found: Lead[] = [];
    const picked: DeskScan["picked"] = [];
    const now = this.world.now();
    for (const c of ans.leads.slice(0, 3)) {
      const row = rows.find((r) => r.a.symbol === c.symbol);
      if (!row) {
        this.room("search", "note", `Named ${c.symbol}, which the table does not list: dropped.`, { brain: true });
        continue;
      }
      if (held.has(c.symbol)) continue;
      const id = `L-${String(++f.counters.lead).padStart(4, "0")}`;
      // the confidence as the LEAD line says it: 0 to 1, two places (the shape takes only a finite number)
      const confidence = Number(clamp(c.confidence, 0, 1).toFixed(2));
      const lead: Lead = { id, at: now, updatedAt: now, venue: venue.id, symbol: c.symbol, name: row.i.name, kind: row.i.kind, side: c.side, thesis: plainText(c.thesis, 240), state: "scanned", confidence };
      f.leads.push(lead);
      found.push(lead);
      picked.push({ lead: id, symbol: c.symbol, side: c.side, confidence });
      this.room("search", "lead", `LEAD ${id} | ${c.symbol} | ${c.side === "buy" ? "long" : "short"} | ${lead.thesis} | confidence ${confidence.toFixed(2)} → RISK`, { lead: id, refs: { symbol: c.symbol }, brain: true });
    }
    const note = plainText(ans.note, TEXT_MAX) || undefined;
    scanned(seen, picked, note);
    if (ans.note) this.room("search", "note", plainText(ans.note, TEXT_MAX), { brain: true });
    if (!found.length) this.room("search", "note", `Scanned ${markets} at ${venue.name}: no lead.`, { brain: true });
    this.save();
    return { leads: found };
  }

  // ---- Risk ----

  private clear(lead: Lead, venue: AccountPage["venues"][number], limit: SeatLimit, page: AccountPage): Promise<boolean> {
    return this.doing({ role: "risk", what: "clear", lead: lead.id }, () => this.clearing(lead, venue, limit, page));
  }

  /** Risk's step on one lead: the hard checks first (the numbers kept on the lead, LeadChecks), then the brain's verdict and plan */
  private async clearing(lead: Lead, venue: AccountPage["venues"][number], limit: SeatLimit, page: AccountPage): Promise<boolean> {
    const f = this.file!;
    const s = f.session!;
    const reject = (why: string) => {
      lead.state = "rejected";
      lead.why = why;
      lead.updatedAt = this.world.now();
      this.room("risk", "clearance", `RISK CLEARANCE ${lead.id} | ${why} | Verdict: REJECT`, { lead: lead.id });
      this.save();
      return false;
    };
    const m = await this.world.market(venue.id, lead.symbol);
    if (isRefusal(m)) return reject(`the venue did not price ${lead.symbol}: ${m.message}`);
    if (!m.open) return reject(`${lead.symbol} is not open for orders now${m.note ? ` (${m.note})` : ""}`);
    const price = m.price ?? (m.bid !== undefined && m.ask !== undefined ? (m.bid + m.ask) / 2 : undefined);
    if (price === undefined || !(price > 0)) return reject(`no price for ${lead.symbol}`);
    // the hard checks' numbers, worked out once the market is priced and kept on the lead whatever the verdict; judged below in their order
    const spread = m.bid !== undefined && m.ask !== undefined && m.bid > 0 ? ((m.ask - m.bid) / price) * 100 : undefined;
    const today = this.todayNumbers();
    const lossRoom = s.startEquityUsd * (f.objective.maxDailyLossPct / 100) + Math.min(0, today.pnlUsd);
    const maxSize = r2(Math.min(s.startEquityUsd * (f.objective.maxRiskPct / 100), limit.perOrderUsd, limit.leftUsd));
    lead.checks = { spreadPct: spread === undefined ? null : Number(spread.toFixed(4)), maxSizeUsd: maxSize, lossRoomUsd: r2(lossRoom), minNotionalUsd: m.minNotional ?? null };
    if (lead.side === "sell" && m.kind !== "perp") return reject(`a sell opens a short only on a perpetual; ${lead.symbol} is ${m.kind}`);
    if (spread !== undefined && spread > MAX_SPREAD_PCT) return reject(`spread ${spread.toFixed(2)}% is over ${MAX_SPREAD_PCT}%`);
    if (lossRoom <= 0) return reject(`no room left in the day's loss line (${usd(today.pnlUsd)} today)`);
    if (!(maxSize > 0)) return reject(`nothing left of the Sniper's limit (${usd(limit.leftUsd)} of ${usd(limit.budgetUsd)})`);
    if (m.minNotional !== undefined && maxSize < m.minNotional) return reject(`the most this lead may be (${usd(maxSize)}) is under the venue's smallest order (${usd(m.minNotional)})`);
    // the room's protocol (" | " between the parts, "Verdict: …" last) is what an outside seat follows; the figures in it are said as a
    // person reads them: the price grouped at the market's own places, the day's volume in the large ($603.9M)
    const checks = `market open${m.session?.phase && m.session.phase !== "regular" ? ` (${m.session.phase} session${m.session.extendedHours ? ", extended hours" : ""})` : ""} · price ${fig(price, stepPlaces(m.priceStep))} · spread ${spread === undefined ? "n/a" : `${spread.toFixed(2)}%`} · volume ${m.volumeUsd24h === undefined ? "n/a" : USD_COMPACT.format(m.volumeUsd24h)} · day's loss room ${usd(lossRoom)} · size up to ${usd(maxSize)}`;
    const seat = f.seats.find((x) => x.role === "risk");
    let plan = { ...PLAN, sizeUsd: maxSize, why: "the hard checks passed; no Risk seat, so the plan is the default" };
    if (seat) {
      const ans = await this.think("risk", "clear", seat.charter, `Lead ${lead.id}: ${JSON.stringify({ symbol: lead.symbol, side: lead.side, kind: m.kind, thesis: lead.thesis, price, bid: m.bid, ask: m.ask, spreadPct: spread, volumeUsd24h: m.volumeUsd24h, changePct24h: m.changePct24h, fundingRate: m.fundingRate, closeTime: m.closeTime, maxLeverage: m.maxLeverage })}. Hard checks (all passed): ${checks}. Objective: ${JSON.stringify(f.objective)}. Today: ${JSON.stringify(today)}. Open leads: ${JSON.stringify(this.openLeads().map((l) => ({ id: l.id, symbol: l.symbol, side: l.side, sizeUsd: l.sizeUsd })))}. Decide: clear or reject, why in one sentence, the size in dollars (at most ${maxSize}), the take-profit and stop in percent from the entry, and the time limit in hours.`, RiskOut, 600, lead.id);
      if (!ans) return reject("the Risk seat gave no verdict");
      if (ans.verdict !== "clear") return reject(plainText(ans.why, 200) || "rejected by Risk");
      plan = { sizeUsd: r2(clamp(ans.sizeUsd, 0, maxSize)), tpPct: clamp(ans.tpPct || PLAN.tpPct, ...PLAN_BOUNDS.tpPct), slPct: clamp(ans.slPct || PLAN.slPct, ...PLAN_BOUNDS.slPct), maxHours: clamp(ans.maxHours || PLAN.maxHours, ...PLAN_BOUNDS.maxHours), why: plainText(ans.why, 200) };
      if (!(plan.sizeUsd > 0)) return reject("Risk cleared it at no size");
    }
    lead.state = "cleared";
    lead.sizeUsd = plan.sizeUsd;
    lead.tpPct = plan.tpPct;
    lead.slPct = plan.slPct;
    lead.maxHours = plan.maxHours;
    lead.cleared = plan.why;
    lead.updatedAt = this.world.now();
    this.room("risk", "clearance", `RISK CLEARANCE ${lead.id} | ${checks} | ${plan.why} | size ${usd(plan.sizeUsd)} · TP +${short(plan.tpPct)}% · SL -${short(plan.slPct)}% · ${short(plan.maxHours)} h | Verdict: CLEAR → SNIPER`, { lead: lead.id, brain: !!seat || undefined });
    this.save();
    void page;
    return true;
  }

  /** the day's numbers, New York */
  private todayNumbers(): DeskView["today"] {
    const f = this.file!;
    const day = ny(Date.parse(this.world.now())).day;
    const today = f.leads.filter((l) => ny(Date.parse(l.at)).day === day);
    const closedToday = f.leads.filter((l) => l.state === "closed" && l.exit && ny(Date.parse(l.exit.at)).day === day);
    const realised = closedToday.reduce((s, l) => s + (l.pnlUsd ?? 0), 0);
    const unrealised = this.openLeads().reduce((s, l) => s + (l.unrealizedUsd ?? 0), 0);
    const pnlUsd = r2(realised + unrealised);
    const s = f.session;
    const lossRoomUsd = s ? r2(Math.max(0, s.startEquityUsd * (f.objective.maxDailyLossPct / 100) + Math.min(0, pnlUsd))) : 0;
    return { pnlUsd, wins: closedToday.filter((l) => (l.pnlUsd ?? 0) > 0).length, losses: closedToday.filter((l) => (l.pnlUsd ?? 0) <= 0).length, scanned: today.length, cleared: today.filter((l) => l.state !== "scanned" && l.state !== "rejected").length, executed: today.filter((l) => l.entry).length, closed: closedToday.length, lossRoomUsd };
  }

  // ---- Sniper ----

  private enter(lead: Lead, venue: AccountPage["venues"][number]): Promise<Entered> {
    return this.doing({ role: "sniper", what: "enter", lead: lead.id }, () => this.entering(lead, venue));
  }

  /** why the door placed a seat's order at once, in the room's words: the account in Beast, or the owner's autonomy at a paper account */
  private howPlaced(venue: AccountPage["venues"][number]): string {
    if (this.world.mode() === "open") return "Beast, inside the limit";
    return this.file?.autonomy?.paper === true && venue.paper === true ? "on its own on paper, inside the limit" : "inside the limit";
  }

  /** the Sniper's step: the cleared lead placed as one order through the door, signed with the house seat's key. What became of it: placed
   * (an order at the venue), a card (it waits for the owner), or nothing (refused, or no house seat to place it from) */
  private async entering(lead: Lead, venue: AccountPage["venues"][number]): Promise<Entered> {
    const f = this.file!;
    const key = this.seatKeyOf("sniper");
    const seat = f.seats.find((s) => s.role === "sniper");
    if (!seat || seat.kind !== "house" || isRefusal(key)) {
      this.room("sniper", "note", `${lead.id}: the Sniper seat is ${seat?.kind === "outside" ? "an outside agent's: it places the entry itself" : "not the house's"}; nothing placed from here.`, { lead: lead.id });
      return "none";
    }
    const m = await this.world.market(venue.id, lead.symbol);
    const eh = this.extendedLimit(m, lead.side);
    if (eh && !eh.ok) {
      lead.state = "refused";
      lead.why = eh.why;
      lead.updatedAt = this.world.now();
      this.room("sniper", "refusal", `${lead.id}: ${eh.why}`, { lead: lead.id });
      this.save();
      return "none";
    }
    if (eh) this.room("sniper", "note", `${lead.id}: the regular session is closed (${eh.phase} session): the entry goes as a day limit at ${eh.limit} with extended hours.`, { lead: lead.id });
    // at a PAPER account the plan's take-profit and stop go WITH the entry, as its bracket, where the market takes one: the paper account
    // places them the moment the entry fills and acts on them at its own price (paper.ts: the one that fills cancels the other), never at
    // the desk's next look. An extended-hours entry takes none; at a real venue the entry goes as it always has, the plan judged by the desk
    const bracket = eh || venue.paper !== true ? undefined : this.bracketOf(lead, m);
    const action = eh
      ? { type: "agentLiveOrder" as const, venue: venue.id, symbol: lead.symbol, side: lead.side, orderType: "limit", qty: "", usd: String(lead.sizeUsd ?? 0), limitPrice: eh.limit, tif: "day", extendedHours: "true", nonce: this.world.nonce() }
      : { type: "agentLiveOrder" as const, venue: venue.id, symbol: lead.symbol, side: lead.side, orderType: "market", qty: "", usd: String(lead.sizeUsd ?? 0), limitPrice: "", ...(bracket ? { takeProfit: bracket.takeProfit, stopLoss: bracket.stopLoss } : {}), nonce: this.world.nonce() };
    const out = await this.world.exchange(await signAgent(key, action));
    const now = this.world.now();
    lead.updatedAt = now;
    if (isRefusal(out)) {
      lead.state = "refused";
      lead.why = `${out.code}: ${out.message}`;
      this.room("sniper", "refusal", `${lead.id}: the door refused the entry — ${out.message}`, { lead: lead.id });
      this.save();
      return "none";
    }
    if (out.kind === "card") {
      lead.state = "confirmed";
      lead.card = out.card.id;
      this.room("sniper", "card", `${lead.id}: ${lead.side === "buy" ? "buy" : "sell"} ${usd(lead.sizeUsd ?? 0)} of ${lead.symbol} waits for you on ${out.card.id} (Guard).`, { lead: lead.id, refs: { card: out.card.id, symbol: lead.symbol } });
      this.save();
      return "card";
    }
    if (out.kind === "order") {
      this.tookOrder(lead, out.order);
      if (bracket) lead.exits = { takeProfit: Number(bracket.takeProfit), stopLoss: Number(bracket.stopLoss) };
      const px = out.order.avgPrice ?? out.order.price;
      const exits = bracket ? `, its take-profit at ${fig(Number(bracket.takeProfit))} and its stop at ${fig(Number(bracket.stopLoss))} held by the venue` : "";
      // the fill says which way it went: a reader of the room should never have to know the lead's side to read its trade
      this.room("sniper", "order", `${lead.id}: ${out.order.status === "filled" ? `filled, ${lead.side === "sell" ? "sold" : "bought"} ${fig(out.order.filledQty)} ${out.order.base}${px !== undefined ? ` at ${fig(px)}` : ""}` : `placed ${out.order.id} (${out.order.status})`} at ${venue.name} (${this.howPlaced(venue)})${exits}.`, { lead: lead.id, refs: { order: out.order.id, symbol: lead.symbol } });
      this.save();
      return "placed";
    }
    this.room("sniper", "note", `${lead.id}: the door answered ${out.kind}.`, { lead: lead.id });
    return "none";
  }

  /** THE PLAN AS A BRACKET: the lead's take-profit and stop (Risk's percents from the entry) as prices from where the entry fills now — the
   * ask for a buy, the bid for a sell — each a step beyond it on the market's own price step (a take-profit up and a stop down for a buy,
   * the other way for a sell), so the venue takes both as the entry's exits. None where the market takes no exits on an entry, or has no
   * price or plan to set them by */
  private bracketOf(lead: Lead, m: Market | Refusal): { takeProfit: string; stopLoss: string } | undefined {
    if (isRefusal(m) || m.brackets !== true || lead.tpPct === undefined || lead.slPct === undefined) return undefined;
    const ref = lead.side === "buy" ? (m.ask ?? m.price) : (m.bid ?? m.price);
    if (!(ref && ref > 0)) return undefined;
    const step = m.priceStep && m.priceStep > 0 ? m.priceStep : undefined;
    const up = (x: number) => (step ? ceilTo(x, step) : Number(x.toPrecision(10)));
    const down = (x: number) => (step ? floorTo(x, step) : Number(x.toPrecision(10)));
    const buy = lead.side === "buy";
    const tp = buy ? up(ref * (1 + lead.tpPct / 100)) : down(ref * (1 - lead.tpPct / 100));
    const sl = buy ? down(ref * (1 - lead.slPct / 100)) : up(ref * (1 + lead.slPct / 100));
    if (!(tp > 0 && sl > 0) || (buy ? !(tp > ref && sl < ref) : !(tp < ref && sl > ref))) return undefined;
    const text = (x: number) => Number(x.toFixed(10)).toString();
    return { takeProfit: text(tp), stopLoss: text(sl) };
  }

  /** an order of the desk's, as the account has it now: the lead follows it */
  private tookOrder(lead: Lead, o: LiveOrder): void {
    lead.order = o.id;
    lead.state = "executed";
    // the desk keeps one clock, the account's: a fill is dated when the desk saw it
    if (o.filledQty > 0 && o.avgPrice !== undefined && !lead.entry) lead.entry = { price: o.avgPrice, qty: o.filledQty, at: this.world.now(), feeUsd: o.feeUsd ?? 0, contractSize: o.contractSize ?? 1 };
    else if (o.filledQty > 0 && o.avgPrice !== undefined && lead.entry) lead.entry = { ...lead.entry, price: o.avgPrice, qty: o.filledQty, feeUsd: o.feeUsd ?? lead.entry.feeUsd };
    if (["canceled", "rejected", "expired"].includes(o.status) && !(o.filledQty > 0)) {
      lead.state = "refused";
      lead.why = `the entry order ended ${o.status}${o.note ? `: ${o.note}` : ""}`;
    }
    lead.updatedAt = this.world.now();
  }

  /** the leads' orders read back from the account: entries filled, cards answered, exits filled */
  private async followOrders(): Promise<void> {
    const f = this.file;
    if (!f) return;
    const live = f.leads.filter((l) => l.state === "confirmed" || l.state === "executed" || l.state === "closing");
    if (!live.length) return;
    // the Sniper's entries and the Exit's closes are read back: the step is the Exit's when only closes are out
    await this.doing({ role: live.every((l) => l.state === "closing") ? "exit" : "sniper", what: "follow" }, () => this.following(live));
  }

  private async following(live: Lead[]): Promise<void> {
    const page = await this.world.page();
    if (!page) return;
    // the leads' own orders, looked up among every order the account keeps (DeskWorld.ordersOf), never only the page's newest sixty: an
    // entry, a card's order, a close and the exits the venue holds for an entry are found however many orders came after them
    const orders = this.world.ordersOf(live.flatMap((l) => [l.order, l.card, l.exitOrder].filter((x): x is string => typeof x === "string" && x !== "")));
    let changed = false;
    for (const lead of live) {
      if (lead.state === "confirmed" && lead.card) {
        const o = orders.find((x) => x.card === lead.card);
        if (o) {
          const was = lead.state;
          this.tookOrder(lead, o);
          changed = true;
          const px = o.avgPrice ?? o.price;
          if (was === "confirmed") this.room("you", "order", `You approved ${lead.card}: ${lead.id} ${o.status === "filled" ? `filled${px !== undefined ? ` at ${fig(px)}` : ""}` : `placed (${o.status})`}.`, { lead: lead.id, refs: { order: o.id, card: lead.card } });
        } else if (!page.cards.some((c) => c.id === lead.card)) {
          lead.state = "refused";
          lead.why = `you did not approve ${lead.card} (rejected, or it expired)`;
          lead.updatedAt = this.world.now();
          changed = true;
          this.room("you", "card", `${lead.card} was not approved: ${lead.id} is off the desk.`, { lead: lead.id, refs: { card: lead.card } });
        }
        continue;
      }
      if (lead.state === "executed" && lead.order) {
        const o = orders.find((x) => x.id === lead.order);
        if (o && (o.filledQty !== (lead.entry?.qty ?? 0) || ["canceled", "rejected", "expired"].includes(o.status))) {
          const had = lead.entry !== undefined;
          this.tookOrder(lead, o);
          changed = true;
          if (!had && lead.entry) this.room("sniper", "order", `${lead.id}: filled ${fig(lead.entry.qty)} at ${fig(lead.entry.price)}.`, { lead: lead.id, refs: { order: o.id } });
          if ((lead.state as LeadState) === "refused") this.room("sniper", "refusal", `${lead.id}: ${lead.why}`, { lead: lead.id, refs: { order: o.id } });
        }
        // the entry's own exits, held by the venue (its bracket: entering): the one that filled closed the lead, at its own price
        const hit = lead.state === "executed" && lead.entry ? orders.find((x) => x.exitOf?.order === lead.order && x.status === "filled" && x.filledQty > 0 && x.avgPrice !== undefined) : undefined;
        if (hit) {
          lead.exitOrder = hit.id;
          lead.exitWhy = hit.exitOf!.kind === "take-profit" ? `TP HIT at ${fig(hit.avgPrice!)} (its take-profit, filled by the venue)` : `stop at ${fig(hit.avgPrice!)} (its stop-loss, filled by the venue)`;
          this.closed(lead, hit.avgPrice!, hit.filledQty, hit.feeUsd ?? 0);
          changed = true;
        }
        continue;
      }
      if (lead.state === "closing" && lead.exitOrder) {
        const o = orders.find((x) => x.id === lead.exitOrder);
        if (!o) continue;
        if (o.filledQty > 0 && o.avgPrice !== undefined && (o.status === "filled" || o.filledQty >= (lead.entry?.qty ?? 0))) {
          this.closed(lead, o.avgPrice, o.filledQty, o.feeUsd ?? 0);
          changed = true;
        } else if (["canceled", "rejected", "expired"].includes(o.status) && !(o.filledQty > 0)) {
          lead.state = "executed";
          delete lead.exitOrder;
          lead.updatedAt = this.world.now();
          changed = true;
          this.room("exit", "note", `${lead.id}: the close ended ${o.status}; the lead stays open.`, { lead: lead.id, refs: { order: o.id } });
        }
      }
    }
    if (changed) this.save();
  }

  private closed(lead: Lead, price: number, qty: number, feeUsd: number): void {
    const e = lead.entry;
    const dir = lead.side === "buy" ? 1 : -1;
    const q = Math.min(qty, e?.qty ?? qty);
    const gross = e ? dir * (price - e.price) * q * (e.contractSize ?? 1) : 0;
    const pnl = r2(gross - feeUsd - (e?.feeUsd ?? 0));
    lead.exit = { price, qty: q, at: this.world.now(), feeUsd };
    lead.pnlUsd = pnl;
    lead.roiPct = lead.sizeUsd ? r2((pnl / lead.sizeUsd) * 100) : 0;
    lead.state = "closed";
    delete lead.unrealizedUsd;
    lead.updatedAt = this.world.now();
    this.room("exit", "exit", `${lead.id} closed: ${lead.exitWhy ?? "closed"} · ${fig(q)} ${lead.symbol} at ${fig(price)} · ${usd(pnl)} (${pct(lead.roiPct)} on ${usd(lead.sizeUsd ?? 0)})`, { lead: lead.id, refs: { order: lead.exitOrder, symbol: lead.symbol } });
  }

  // ---- Exit and Watch ----

  /** the open leads marked, the plan applied (take-profit, stop, time), danger watched, the brain asked about the rest. Returns how many
   * were reviewed */
  private async exits(page: AccountPage, venue: AccountPage["venues"][number] | undefined, askBrain: boolean, between = false): Promise<number> {
    if (!this.file!.leads.some((l) => l.state === "executed" && l.entry) || !venue) return 0;
    return this.doing({ role: "exit", what: "exit" }, () => this.exiting(page, venue, askBrain, between));
  }

  /** the plan's exits alone, between cycles (the clock's tick): the open leads marked and closed at their take-profit, stop or time limit —
   * numbers, no brain asked */
  private async planExits(): Promise<void> {
    const f = this.file;
    if (!f || !f.leads.some((l) => l.state === "executed" && l.entry)) return;
    const page = await this.world.page();
    if (!page) return;
    await this.exits(page, page.venues.find((v) => v.id === f.objective.venue), false, true);
  }

  /** `between`: the clock's tick between cycles (planExits), not a cycle */
  private async exiting(page: AccountPage, venue: AccountPage["venues"][number] | undefined, askBrain: boolean, between = false): Promise<number> {
    const f = this.file!;
    const open = f.leads.filter((l) => l.state === "executed" && l.entry);
    if (!open.length || !venue) return 0;
    /** the entry's take-profit and stop still held by the venue (its bracket): the venue acts on them at their own price, so the desk does
     * not close the lead on them by its marks too. Once they are gone (canceled, or one filled) the plan's own numbers stand again */
    const exits = this.world.ordersOf(open.flatMap((l) => (l.order ? [l.order] : [])));
    const held = (lead: Lead): boolean => !!lead.order && exits.some((x) => x.exitOf?.order === lead.order && (x.status === "open" || x.status === "pending" || x.status === "partial"));
    const positions = await this.world.positions(venue.id);
    const pos = isRefusal(positions) ? [] : positions;
    const nowMs = Date.parse(this.world.now());
    // BETWEEN CYCLES (`between`: the clock's tick, no brain) what cannot change in thirty seconds is not tried or said again every thirty
    // seconds: a plan close that did not go (Lead.closeRefusedAt: the per-order cap, a holding already sold, no seat to send it) waits for
    // a cycle to have passed since, and a missing mark is said once a cycle. A cycle itself tries and says them as it always has
    const every = Math.max(1, f.objective.everyMin) * 60_000;
    const since = (iso: string | undefined): number => (iso === undefined ? Infinity : nowMs - Date.parse(iso));
    const waiting = (lead: Lead): boolean => between && since(lead.closeRefusedAt) < every;
    const toClose: Array<{ lead: Lead; why: string; from: RoleId }> = [];
    for (const lead of open) {
      const e = lead.entry!;
      const p = pos.find((x) => x.symbol === lead.symbol);
      // the market's live stream first (DeskWorld.mark: this moment's price, not a read kept a while), else the venue's own mark
      const live = this.world.mark?.(venue.id, lead.symbol);
      let mark = live?.price ?? p?.markPrice;
      if (mark === undefined) {
        const m = await this.world.market(venue.id, lead.symbol);
        if (!isRefusal(m)) mark = m.price ?? (lead.side === "buy" ? m.bid : m.ask);
      }
      if (mark === undefined) {
        if (!between || !(since(lead.noMarkAt) < every)) {
          lead.noMarkAt = this.world.now();
          this.room("watch", "warning", `${lead.id}: no mark for ${lead.symbol} — the venue did not price it this cycle.`, { lead: lead.id });
        }
        continue;
      }
      const dir = lead.side === "buy" ? 1 : -1;
      const movePct = (dir * (mark - e.price) * 100) / e.price;
      const unrealised = !live && p && p.unrealizedUsd !== undefined && Math.abs(p.qty - e.qty) < 1e-9 ? p.unrealizedUsd : dir * (mark - e.price) * e.qty * (e.contractSize ?? 1);
      lead.markPrice = mark;
      lead.unrealizedUsd = r2(unrealised);
      lead.markAt = this.world.now();
      const hours = (nowMs - Date.parse(e.at)) / HOUR;
      const venueHolds = held(lead);
      if (!venueHolds && lead.tpPct !== undefined && movePct >= lead.tpPct) toClose.push({ lead, why: `TP HIT at ${fig(mark)} (${pct(movePct)})`, from: "exit" });
      else if (!venueHolds && lead.slPct !== undefined && movePct <= -lead.slPct) toClose.push({ lead, why: `stop at ${fig(mark)} (${pct(movePct)})`, from: "exit" });
      else if (lead.maxHours !== undefined && hours >= lead.maxHours) toClose.push({ lead, why: `time limit: ${Math.round(hours)} h open (${pct(movePct)})`, from: "exit" });
      else if (p?.liquidationPrice !== undefined && p.liquidationPrice > 0) {
        const dist = (Math.abs(mark - p.liquidationPrice) / mark) * 100;
        if (dist < 3) toClose.push({ lead, why: `liquidation ${dist.toFixed(1)}% away at ${fig(p.liquidationPrice)}`, from: "watch" });
      }
    }
    // the plan's closes go first, before any brain is asked: a stop that is hit never waits for a call that may take two minutes. Between
    // cycles, one that did not go less than a cycle ago is not tried again yet (waiting): it is still the plan's, and not handed to the brain
    for (const c of toClose) if (!waiting(c.lead)) await this.close(c.lead, venue, c.why, c.from);
    const planned = new Set(toClose.map((c) => c.lead));
    toClose.length = 0;
    const rest = open.filter((l) => !planned.has(l) && l.state === "executed" && l.markPrice !== undefined);
    if (askBrain && rest.length) {
      const seat = f.seats.find((s) => s.role === "exit");
      if (seat) {
        const ans = await this.think("exit", "exit", seat.charter, `Open leads at ${venue.name}: ${JSON.stringify(rest.map((l) => ({ id: l.id, symbol: l.symbol, side: l.side, thesis: l.thesis, entry: l.entry!.price, mark: l.markPrice, unrealizedUsd: l.unrealizedUsd, movePct: r2((((l.side === "buy" ? 1 : -1) * (l.markPrice! - l.entry!.price)) / l.entry!.price) * 100), plan: { tpPct: l.tpPct, slPct: l.slPct, maxHours: l.maxHours }, hoursOpen: r2((nowMs - Date.parse(l.entry!.at)) / HOUR) })))}. The plan closes each at its take-profit, stop or time limit by itself. For each lead: hold, or close now with a reason (the thesis is gone, the market changed). Never add to one.`, ExitOut, 600);
        for (const d of ans?.decisions ?? []) {
          const lead = rest.find((l) => l.id === d.lead);
          if (lead && d.action === "close") toClose.push({ lead, why: `${plainText(d.why, 160) || "closed early"} (Exit)`, from: "exit" });
          else if (lead && d.why) this.room("exit", "note", `${lead.id}: hold — ${plainText(d.why, 160)}`, { lead: lead.id, brain: true });
        }
      }
    }
    for (const c of toClose) await this.close(c.lead, venue, c.why, c.from);
    this.save();
    return open.length;
  }

  /** Outside the regular session, where the venue trades the session that is on (a stock at Alpaca in pre-market, after-hours or
   * overnight: Market.session.extendedHours), a market order is not taken: the order goes as a DAY LIMIT with extended hours, a little
   * past the book — a buy over the ask, a sell under the bid, by EH_BAND — so that it fills now at the book or better, as a market order
   * would. Undefined where the regular session is on or the venue keeps no such session; not ok where no price is up to set the limit by */
  private extendedLimit(m: Market | Refusal, side: Side): { ok: true; limit: string; phase: string } | { ok: false; why: string } | undefined {
    if (isRefusal(m) || m.session?.extendedHours !== true || m.session.open) return undefined;
    const phase = m.session.phase ?? "extended";
    const px = side === "buy" ? (m.ask ?? m.price) : (m.bid ?? m.price);
    if (!(px && px > 0)) return { ok: false, why: `no price is up for ${m.symbol} in the ${phase} session to set an extended-hours limit by` };
    const step = m.priceStep ?? 0.01;
    const limit = side === "buy" ? ceilTo(px * (1 + EH_BAND), step) : floorTo(px * (1 - EH_BAND), step);
    return { ok: true, limit: Number(limit.toFixed(6)).toString(), phase };
  }

  /** a close, as the step of the seat that signs it: the one that called it (Exit, or Watch near liquidation), else the Exit */
  private close(lead: Lead, venue: AccountPage["venues"][number], why: string, from: RoleId): Promise<void> {
    const f = this.file!;
    const role = (f.seats.find((s) => s.role === from) ?? f.seats.find((s) => s.role === "exit"))?.role ?? from;
    return this.doing({ role, what: "close", lead: lead.id }, () => this.closing(lead, venue, why, from));
  }

  private async closing(lead: Lead, venue: AccountPage["venues"][number], why: string, from: RoleId): Promise<void> {
    const f = this.file!;
    const seat = f.seats.find((s) => s.role === from) ?? f.seats.find((s) => s.role === "exit");
    const key = seat && seat.kind === "house" ? this.seatKeyOf(seat.role) : undefined;
    if (!seat || !key || isRefusal(key)) {
      this.notClosed(lead, "no house seat to close it from here");
      this.room(from, "warning", `${lead.id}: ${why} — no house seat to close it from here.`, { lead: lead.id });
      return;
    }
    const e = lead.entry!;
    const perp = lead.kind === "perp";
    const side = lead.side === "buy" ? "sell" : "buy";
    // a stock outside its regular session: the venue takes a limit for the session that is on, and nothing else (Alpaca's extended hours)
    const eh = perp ? undefined : this.extendedLimit(await this.world.market(venue.id, lead.symbol), side);
    if (eh && !eh.ok) {
      this.notClosed(lead, eh.why);
      this.room(seat.role, "warning", `${lead.id}: ${why} — ${eh.why}`, { lead: lead.id });
      return;
    }
    if (eh) this.room(seat.role, "note", `${lead.id}: the regular session is closed (${eh.phase} session): the close goes as a day limit at ${eh.limit} with extended hours.`, { lead: lead.id });
    const action: AgentAction = perp
      ? { type: "agentLiveClose", venue: venue.id, symbol: lead.symbol, qty: "", nonce: this.world.nonce() }
      : eh
        ? { type: "agentLiveOrder", venue: venue.id, symbol: lead.symbol, side, orderType: "limit", qty: String(e.qty), usd: "", limitPrice: eh.limit, tif: "day", extendedHours: "true", nonce: this.world.nonce() }
        : { type: "agentLiveOrder", venue: venue.id, symbol: lead.symbol, side, orderType: "market", qty: String(e.qty), usd: "", limitPrice: "", nonce: this.world.nonce() };
    // why is said before the close goes: a paper account fills it inside the door's answer, and the journal writes the trip it closed then
    lead.exitWhy = why;
    const out = await this.world.exchange(await signAgent(key, action));
    lead.updatedAt = this.world.now();
    if (isRefusal(out)) {
      this.notClosed(lead, out.message);
      this.room(seat.role, "refusal", `${lead.id}: ${why} — the door refused the close: ${out.message}`, { lead: lead.id });
      return;
    }
    lead.closeRefusedAt = undefined;
    lead.closeRefused = undefined;
    if (out.kind === "card") {
      lead.state = "closing";
      lead.exitOrder = undefined;
      lead.card = out.card.id;
      this.room(seat.role, "card", `${lead.id}: ${why} — the close waits for you on ${out.card.id} (Guard).`, { lead: lead.id, refs: { card: out.card.id } });
      return;
    }
    if (out.kind === "order") {
      lead.state = "closing";
      lead.exitOrder = out.order.id;
      if (out.order.filledQty > 0 && out.order.avgPrice !== undefined && out.order.status === "filled") this.closed(lead, out.order.avgPrice, out.order.filledQty, out.order.feeUsd ?? 0);
      else this.room(seat.role, "exit", `${lead.id}: ${why} — closing (${out.order.id}, ${out.order.status}).`, { lead: lead.id, refs: { order: out.order.id } });
    }
  }

  /** a close of the lead did not go: when and why, so the clock's tick between cycles does not try it again before a cycle has passed
   * (exiting: waiting) */
  private notClosed(lead: Lead, why: string): void {
    lead.closeRefusedAt = this.world.now();
    lead.closeRefused = plainText(why, 200);
  }

  // ---- the equity, the halt ----

  private async markEquity(): Promise<void> {
    const f = this.file;
    if (!f || !f.session) return;
    this.lastEquityAt = Date.parse(this.world.now());
    const eq = this.equityNow();
    const last = f.equity[f.equity.length - 1];
    if (!last || last[1] !== eq || this.lastEquityAt - last[0] >= 5 * 60_000) {
      f.equity.push([this.lastEquityAt, eq]);
      if (f.equity.length > MAX_EQUITY_POINTS) f.equity = f.equity.filter((_, i) => i % 2 === 0 || i >= f.equity.length - 100);
      this.save();
    }
  }

  /** the session's equity now: its start, what its leads closed since realised, and each open lead's unrealised result — as the desk last
   * marked it, or as `unrealisedOf` says (the floor's read marks its open leads from the live stream: its equity is those same marks, so
   * the figure at its head and the leads beside it agree) */
  private equityNow(unrealisedOf?: (l: Lead) => number | undefined): number {
    const f = this.file!;
    const s = f.session!;
    const since = Date.parse(s.startedAt);
    const realised = f.leads.filter((l) => l.state === "closed" && l.exit && Date.parse(l.exit.at) >= since).reduce((x, l) => x + (l.pnlUsd ?? 0), 0);
    const unrealised = this.openLeads().reduce((x, l) => x + ((unrealisedOf ? unrealisedOf(l) : l.unrealizedUsd) ?? 0), 0);
    return r2(s.startEquityUsd + realised + unrealised);
  }

  private checkHalt(): boolean {
    const f = this.file!;
    const s = f.session!;
    if (s.halted) return true;
    const today = this.todayNumbers();
    const line = -s.startEquityUsd * (f.objective.maxDailyLossPct / 100);
    if (today.pnlUsd > line) return false;
    const until = new Date(nextNyMidnight(Date.parse(this.world.now()))).toISOString();
    s.halted = { at: this.world.now(), why: `the day's loss reached ${usd(today.pnlUsd)} (the line is ${usd(line)})`, until };
    this.save();
    this.room("head", "halt", `HALT: ${s.halted.why}. No new lead until ${this.when(until)}; open leads keep their plan.`);
    return true;
  }

  private when(iso: string | undefined): string {
    if (!iso) return "—";
    const ms = Date.parse(iso);
    const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value])) as Record<string, string>;
    return `${p.weekday} ${p.hour}:${p.minute} New York`;
  }

  // ---- the Head: reports and the review ----

  private async report(kind: DeskReport["kind"], force = false): Promise<void> {
    if (!this.file) return;
    await this.doing({ role: "head", what: "report" }, () => this.reporting(kind, force));
  }

  private async reporting(kind: DeskReport["kind"], force: boolean): Promise<void> {
    const f = this.file;
    if (!f) return;
    const now = this.world.now();
    const t = this.todayNumbers();
    const eq = f.session ? this.equityNow() : 0;
    const open = this.openLeads();
    const funnel = this.funnel();
    const closedAll = f.leads.filter((l) => l.state === "closed");
    const best = [...closedAll].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0))[0];
    const worst = [...closedAll].sort((a, b) => (a.pnlUsd ?? 0) - (b.pnlUsd ?? 0))[0];
    let text: string;
    // the funnel's line names the entries placed and not yet filled (an extended-hours day limit, a market order a venue fills later) only
    // where there are some: "→ 2 placed → 1 executed" — otherwise placed and executed are one number, said once as before (DeskFunnel)
    // the start of a session, whatever the hour: never called a morning status at night
    if (kind === "start") text = `SESSION START — Session of ${f.objective.hours} h from ${usd(f.session?.startEquityUsd ?? 0)} at ${this.venueLabel(f.objective.venue)}. Objective: “${f.objective.text}”. Target ${pct(f.objective.targetPct)} · at most ${f.objective.maxRiskPct}% a lead · halt at -${f.objective.maxDailyLossPct}% in a day · a cycle every ${f.objective.everyMin} min · report at ${f.objective.reportAt} New York. Seats: ${seatNames(f.seats)}.`;
    else {
      const head = kind === "end" ? "SESSION REPORT" : kind === "weekly" ? "WEEKLY REVIEW" : "EVENING REPORT";
      const failed = f.spend.failed ?? 0;
      const lines = [`${head} — Scanned: ${t.scanned} · Cleared: ${t.cleared} · Executed: ${t.executed} · Closed today: ${t.closed} · Open now: ${open.length}`, `PnL today: ${usd(t.pnlUsd)} · Session: ${usd(eq - (f.session?.startEquityUsd ?? eq))} (${pct(f.session && f.session.startEquityUsd ? ((eq - f.session.startEquityUsd) / f.session.startEquityUsd) * 100 : 0)}) · Win rate: ${t.wins + t.losses ? Math.round((t.wins / (t.wins + t.losses)) * 100) : 0}% (${t.wins}W ${t.losses}L)`, `Funnel (session): ${funnel.scanned} scanned → ${funnel.cleared} cleared → ${funnel.confirmed} confirmed → ${funnel.placed !== funnel.executed ? `${funnel.placed} placed → ` : ""}${funnel.executed} executed → ${funnel.closed} closed · ${funnel.rejected} rejected`, best ? `Best: ${best.symbol} ${usd(best.pnlUsd ?? 0)}` : "", worst && worst !== best ? `Worst: ${worst.symbol} ${usd(worst.pnlUsd ?? 0)}` : "", `Brain: ${f.spend.calls} calls · about ${usd(f.spend.usd)}${failed ? ` · ${failed} not answered` : ""}`].filter(Boolean);
      const seat = f.seats.find((s) => s.role === "head");
      if (seat && this.ready().ok && (force || t.scanned + t.closed > 0)) {
        const ans = await this.think("head", "report", seat.charter, `Write the two sentences of the ${head.toLowerCase()} from these numbers only: ${JSON.stringify({ today: t, open: open.map((l) => ({ id: l.id, symbol: l.symbol, unrealizedUsd: l.unrealizedUsd })), closedToday: closedAll.filter((l) => l.exit && ny(Date.parse(l.exit.at)).day === ny(Date.parse(now)).day).map((l) => ({ id: l.id, symbol: l.symbol, pnlUsd: l.pnlUsd, why: l.exitWhy })), rejectedToday: f.leads.filter((l) => l.state === "rejected" && ny(Date.parse(l.at)).day === ny(Date.parse(now)).day).map((l) => ({ id: l.id, symbol: l.symbol, why: l.why })), objective: f.objective })}. "worked": one thing that worked today, named by lead id. "change": one change for tomorrow. Plain sentences, no numbers the input does not have.`, ReportOut, 400);
        if (ans) lines.push(`One thing that worked: ${plainText(ans.worked, 240)}`, `One change for tomorrow: ${plainText(ans.change, 240)}`);
      }
      text = lines.join("\n");
    }
    f.reports.push({ at: now, kind, text });
    if (kind === "evening") f.reported = ny(Date.parse(now)).day;
    this.save();
    this.room("head", "report", text);
  }

  private async review(): Promise<void> {
    if (!this.file) return;
    await this.doing({ role: "head", what: "review" }, () => this.reviewing());
  }

  private async reviewing(): Promise<void> {
    const f = this.file;
    if (!f) return;
    const now = this.world.now();
    f.reviewed = ny(Date.parse(now)).day;
    const week = f.leads.filter((l) => Date.parse(l.at) >= Date.parse(now) - 7 * DAY);
    const closed = week.filter((l) => l.state === "closed");
    const refused = week.filter((l) => l.state === "refused").length;
    const days = this.daysWithoutRefusal();
    const lines = [`WEEKLY REVIEW — ${week.length} leads this week · ${closed.length} closed · ${closed.filter((l) => (l.pnlUsd ?? 0) > 0).length} won · ${usd(closed.reduce((s, l) => s + (l.pnlUsd ?? 0), 0))} · ${refused} refused at the door · days without a refusal: ${days}`];
    const seat = f.seats.find((s) => s.role === "head");
    if (seat && this.ready().ok) {
      const ans = await this.think("head", "review", seat.charter, `The week's leads: ${JSON.stringify(week.map((l) => ({ id: l.id, symbol: l.symbol, state: l.state, why: l.why, pnlUsd: l.pnlUsd, exitWhy: l.exitWhy })))}. Seats: ${f.seats.map((s) => s.role).join(", ")}. For each seat, one sentence on how it did this week; then "prune": the one thing to stop doing. Numbers only from the input.`, ReviewOut, 600);
      if (ans) lines.push(...ans.roles.map((r) => `${String(r.role).toUpperCase()}: ${plainText(r.verdict, 200)}`), `Prune: ${plainText(ans.prune, 200)}`);
    }
    const text = lines.join("\n");
    f.reports.push({ at: now, kind: "weekly", text });
    this.save();
    this.room("head", "review", text);
  }

  /** whole New York days since the door last refused a lead's order, counted from the session's start */
  private daysWithoutRefusal(): number {
    const f = this.file!;
    const since = f.session ? Date.parse(f.session.startedAt) : Date.parse(f.createdAt);
    const last = f.leads.filter((l) => l.state === "refused").map((l) => Date.parse(l.updatedAt)).sort((a, b) => b - a)[0];
    return Math.floor((Date.parse(this.world.now()) - Math.max(since, last ?? 0)) / DAY);
  }

  /** the session's funnel (DeskFunnel): one moment's count, read from the leads alone */
  private funnel(): DeskFunnel {
    const f = this.file;
    const since = f?.session ? Date.parse(f.session.startedAt) : 0;
    const leads = (f?.leads ?? []).filter((l) => Date.parse(l.at) >= since);
    const past = (states: LeadState[]) => leads.filter((l) => states.includes(l.state)).length;
    return { scanned: leads.length, cleared: past(["cleared", "confirmed", "executed", "closing", "closed", "refused"]), confirmed: past(["confirmed", "executed", "closing", "closed"]), placed: past(["executed", "closing", "closed"]), executed: leads.filter((l) => l.entry).length, closed: past(["closed"]), rejected: past(["rejected"]) };
  }

  // ---- the brain, asked ----

  private async think<T>(role: RoleId, what: DeskWork, charter: Charter, input: string, schema: z.ZodType<T>, maxTokens: number, lead?: string): Promise<T | null> {
    return (await this.ask(role, what, charter, input, schema, maxTokens, { lead })).out;
  }

  /** One brain call for a role, inside its step (`what`): counted in flight while it runs, its time on the wall clock and whether it gave a
   * decision kept as the role's last call, its tokens and cost added to the spend. The decision; or null, why (the reason alone, "the API
   * did not accept the key"), and whether the call got no answer at all (`failed`: thrown — the key refused, a rate limit, the API out of
   * reach) rather than an answer with no decision in it.
   *
   * The room hears of it: "No decision: …" or "The brain did not answer: …" as the role's line — unless `quiet`, where the caller says it
   * in one line of its own (Search). A refused key is said once for the fault, not at every call (keyRefused), and kept as the brain's
   * standing until a call is answered (keyAccepted). A call with no answer is counted in `spend.failed`, at no cost */
  private async ask<T>(role: RoleId, what: DeskWork, charter: Charter, input: string, schema: z.ZodType<T>, maxTokens: number, o: { lead?: string | undefined; quiet?: boolean | undefined } = {}): Promise<{ out: T | null; why?: string | undefined; failed: boolean }> {
    const f = this.file!;
    const spec = ROLE_SPECS[role];
    const system = `You are ${spec.tag}, the ${spec.name} on a trading desk that an account runs for its owner. The account enforces every limit: a seat trades only with a key the owner let in and inside a limit the owner signed, in Guard every order waits for the owner on a card. Your charter — owns: ${charter.owns} Good output: ${charter.good} Never: ${charter.never} The desk's objective this week: "${f.objective.text}". Decide only from the data given; name no number the data does not have; answer in the JSON shape asked for and nothing else.`;
    return this.doing({ role, what, lead: o.lead }, async () => {
      this.inFlight++;
      this.told();
      const t0 = performance.now();
      let ok = false;
      try {
        const a = await this.brain.decide({ role, brain: f.brain, system, input, schema, maxTokens });
        f.spend.calls++;
        f.spend.inputTokens += a.usage.inputTokens;
        f.spend.outputTokens += a.usage.outputTokens;
        const cost = costOf(f.brain, this.brain.models, a.usage.inputTokens, a.usage.outputTokens);
        if (cost === undefined) f.spend.unpricedTokens = (f.spend.unpricedTokens ?? 0) + a.usage.inputTokens + a.usage.outputTokens;
        else f.spend.usd += cost;
        // answered: whatever the key's fault was, it is gone (a brain that never reached the API — no key — answers without usage, and has
        // no fault of this kind to clear)
        if (a.usage.inputTokens + a.usage.outputTokens > 0 || a.out !== null) this.keyAccepted();
        ok = a.out !== null;
        if (a.out !== null) return { out: a.out, failed: false };
        const why = plainText(a.why ?? "the brain gave none", 200);
        if (!o.quiet && a.why) this.room(role, "note", `No decision: ${why}`);
        this.save();
        return { out: null, why, failed: false };
      } catch (err) {
        f.spend.failed = (f.spend.failed ?? 0) + 1;
        const why = plainText((err as Error)?.message ?? err, 200);
        if (isKeyRejected(err)) this.keyRefused(err);
        else if (!o.quiet) this.room(role, "note", `The brain did not answer: ${why}`);
        this.save();
        return { out: null, why, failed: true };
      } finally {
        this.inFlight = Math.max(0, this.inFlight - 1);
        this.lastThink[role] = { at: this.world.now(), ms: Math.round(performance.now() - t0), ok };
        this.told();
      }
    });
  }

  // ---- what the page and a seat read ----

  /** the spend as the page reads it: the dollars to the cent, the calls with no answer counted (0 in a file from before they were) */
  private spendNow(): DeskSpend {
    const sp = this.file!.spend;
    return { ...sp, usd: r2(sp.usd), failed: sp.failed ?? 0 };
  }

  async view(): Promise<DeskView | undefined> {
    const f = this.file;
    if (!f) return undefined;
    const page = await this.world.page();
    const nowMs = Date.parse(this.world.now());
    const standing = page ? this.standing(page) : new Map<RoleId, { status: "ok" | "not let in" | "expired" | "revoked"; limit?: SeatLimit | undefined; cards: number }>();
    const s = f.session;
    const { state, equity: eq, target, venue, nextCycleAt } = this.figures(nowMs, page);
    const { nowUsd: now, startUsd: start } = eq;
    const closed = f.leads.filter((l) => l.state === "closed" && l.exit && (!s || Date.parse(l.exit.at) >= Date.parse(s.startedAt)));
    const wins = closed.filter((l) => (l.pnlUsd ?? 0) > 0);
    const losses = closed.filter((l) => (l.pnlUsd ?? 0) <= 0);
    const avg = (xs: Lead[]) => (xs.length ? r2(xs.reduce((a, l) => a + (l.roiPct ?? 0), 0) / xs.length) : 0);
    const cards = (page?.cards ?? []).filter((c) => f.seats.some((x) => x.address === c.agent)).map((c) => ({ id: c.id, lead: f.leads.find((l) => l.card === c.id)?.id, reason: c.reason, usd: c.usd }));
    // the next moment the New York clock reads reportAt
    const reportMs = nextNyAt(nowMs, minutesOf(f.objective.reportAt));
    const weeklyMs = (() => {
      let t = reportMs;
      for (let i = 0; i < 8; i++, t += DAY) if (ny(t).dow === 0) return t;
      return t;
    })();
    const brain = this.standingOf();
    return {
      id: f.id,
      name: f.name,
      createdAt: f.createdAt,
      objective: f.objective,
      brain: { ...brain, provider: f.brain.provider, label: this.brain.label, model: f.brain.model, effort: f.brain.effort, ...(f.brain.price ? { price: f.brain.price } : {}), spend: this.spendNow() },
      ...(f.autonomy ? { autonomy: f.autonomy } : {}),
      ...(f.lastScan ? { lastScan: f.lastScan } : {}),
      seats: f.seats.map((x) => ({ ...x, status: standing.get(x.role)?.status ?? "not let in", limit: standing.get(x.role)?.limit, cards: standing.get(x.role)?.cards ?? 0 })),
      ...(s ? { session: { ...s, state, elapsedMs: Math.max(0, Math.min(nowMs, Date.parse(s.endedAt ?? s.endsAt)) - Date.parse(s.startedAt)), remainingMs: Math.max(0, Date.parse(s.endsAt) - nowMs) } } : {}),
      equity: { ...eq, mult: start ? Number((now / start).toFixed(3)) : 1, points: f.equity },
      target,
      funnel: this.funnel(),
      today: this.todayNumbers(),
      open: this.openLeads(),
      recent: [...f.leads].reverse().filter((l) => l.state !== "executed" && l.state !== "confirmed" && l.state !== "closing").slice(0, 40),
      tape: { wins: wins.length, losses: losses.length, winRatePct: closed.length ? Math.round((wins.length / closed.length) * 100) : 0, avgWinPct: avg(wins), avgLossPct: avg(losses), closes: closed.slice(-60).map((l) => ({ id: l.id, symbol: l.symbol, pnlUsd: l.pnlUsd ?? 0, roiPct: l.roiPct ?? 0, at: l.exit!.at })) },
      big: [...closed].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0)).slice(0, 5).map((l) => ({ id: l.id, symbol: l.symbol, side: l.side, pnlUsd: l.pnlUsd ?? 0, roiPct: l.roiPct ?? 0, at: l.exit!.at })),
      room: readRoom(this.world.home),
      routines: { everyMin: f.objective.everyMin, ...(nextCycleAt ? { nextCycleAt } : {}), reportAt: f.objective.reportAt, nextReportAt: new Date(reportMs).toISOString(), weeklyAt: new Date(weeklyMs).toISOString(), lastReport: f.reports[f.reports.length - 1] },
      reports: f.reports.slice(-10),
      cards,
      venue,
    };
  }

  /** THE STEP'S READ (backtest/desk.ts, at every bar): what the view says of the session, the venue's equity and the open leads, without what
   * only a page draws — the room, the seats' standing at the door, the routines' next times, the tape — so a step costs the account's page
   * and the desk's record in memory. Undefined when no desk is hired */
  async glance(): Promise<DeskGlance | undefined> {
    if (!this.file) return undefined;
    const page = await this.world.page();
    const f = this.file;
    if (!f) return undefined;
    const { state, venue } = this.figures(Date.parse(this.world.now()), page);
    const s = f.session;
    return { session: s ? { state, cycles: s.cycles, ...(s.halted ? { halted: s.halted } : {}) } : null, venueUsd: venue.usd, openUsd: this.openLeads().reduce((sum, l) => sum + Math.abs(l.sizeUsd ?? 0), 0), funnel: this.funnel() };
  }

  /** The lead an account order was placed for — its entry — as the journal tells the trade it opened (account/journal.ts, service.ts
   * journalTrip): its thesis, Search's confidence, Risk's reason, size, plan and hard checks, and why the desk closed it where it did.
   * Undefined when no lead in the desk's record placed it */
  leadOf(order: string): TradeLead | undefined {
    const l = this.file?.leads.find((x) => x.order === order);
    if (!l) return undefined;
    return { id: l.id, thesis: l.thesis, ...(l.confidence !== undefined ? { confidence: l.confidence } : {}), ...(l.cleared ? { cleared: l.cleared } : {}), ...(l.sizeUsd !== undefined ? { sizeUsd: l.sizeUsd } : {}), ...(l.tpPct !== undefined ? { tpPct: l.tpPct } : {}), ...(l.slPct !== undefined ? { slPct: l.slPct } : {}), ...(l.maxHours !== undefined ? { maxHours: l.maxHours } : {}), ...(l.exitWhy ? { exitWhy: l.exitWhy } : {}), ...(l.checks ? { checks: l.checks } : {}) };
  }

  /** the role of the desk's seat this agent key holds, if it holds one */
  roleOf(address: string): RoleId | undefined {
    const a = String(address).toLowerCase();
    return this.file?.seats.find((s) => s.address.toLowerCase() === a)?.role;
  }

  /** the figures the page's view and the floor's read share: the session's state, the equity now against the start (its open leads marked
   * as `unrealisedOf` says, where the read marks them itself), the target, the venue's row on the account, the next cycle (while the
   * session is live) */
  private figures(nowMs: number, page: AccountPage | undefined, unrealisedOf?: (l: Lead) => number | undefined): { state: "live" | "paused" | "halted" | "ended"; equity: Omit<DeskFeed["equity"], "tail">; target: DeskView["target"]; venue: DeskView["venue"]; nextCycleAt?: string | undefined } {
    const f = this.file!;
    const s = f.session;
    const state = !s || s.endedAt ? "ended" : s.halted ? "halted" : s.pausedAt ? "paused" : "live";
    const start = s?.startEquityUsd ?? 0;
    const now = s ? this.equityNow(unrealisedOf) : 0;
    const change = r2(now - start);
    const targetUsd = r2(start * (f.objective.targetPct / 100));
    const row = page?.venues.find((v) => v.id === f.objective.venue);
    return {
      state,
      equity: { nowUsd: now, startUsd: start, changeUsd: change, changePct: start ? r2((change / start) * 100) : 0 },
      target: { pct: f.objective.targetPct, progressPct: targetUsd > 0 ? r2(clamp((change / targetUsd) * 100, -100, 100)) : 0, reachedUsd: change, targetUsd },
      venue: { id: f.objective.venue, name: this.venueLabel(f.objective.venue, row), usd: row?.usd ?? 0, paper: row?.paper === true, connected: row?.live === true },
      // the next cycle: the first one soon after a hire, a resume or the clock's start (soon), else the last one and the objective's minutes
      ...(s && state === "live" ? { nextCycleAt: new Date(Math.max(nowMs, this.soonAt > this.lastCycleAt ? this.soonAt : this.lastCycleAt + f.objective.everyMin * 60_000)).toISOString() } : {}),
    };
  }

  /** THE FLOOR'S READ (GET /api/account/desk/feed?since=<seq>): DeskFeed. Asked every second while the floor shows, so it reads only what it
   * must — the room's tail after `since` (readRoomTail: never the whole file, and not at all when nothing was said since), the desk's own
   * record in memory, and the account's page (for the venue's row) at most every FEED_PAGE_MS. A `since` past the room's newest line (a
   * page left open across a new room) is read as 0. Undefined when no desk is hired */
  async feed(since: number): Promise<DeskFeed | undefined> {
    if (!this.file) return undefined;
    const asked = Date.parse(this.world.now());
    const age = this.feedPage ? asked - this.feedPage.at : Infinity;
    // the read is kept before it is awaited: a request that comes while it is under way shares it. A read that fails answers undefined (the
    // venue's row then says not connected, as a missing page does) and is asked again after FEED_PAGE_MS like any other
    if (!(age >= 0 && age < FEED_PAGE_MS)) this.feedPage = { at: asked, page: this.world.page().catch(() => undefined) };
    const kept = await this.feedPage!.page;
    // THE SNAPSHOT, taken whole after the one await and with none inside it: the room's tail, who is working, the leads, the session and the
    // funnel all of one moment. Taken before the await (as it once was), a cycle's step that landed meanwhile showed a lead already placed
    // without the room's lines that placed it
    const f = this.file;
    if (!f) return undefined;
    const nowMs = Date.parse(this.world.now());
    const seq = f.counters.seq;
    const from = since > seq ? 0 : since;
    const room = from >= seq ? [] : readRoomTail(this.world.home, from, FEED_ROOM_MAX);
    /** an open lead's mark and its unrealised result: its market's live stream's now (DeskWorld.mark) where it is live, else the desk's
     * last mark of it — each lead marked once a read, so the equity and the rows below are of the same marks */
    const marks = new Map<Lead, { markPrice: number | undefined; unrealizedUsd: number | undefined; markAt?: string | undefined; markFrom?: string | undefined }>();
    const liveMarked = (l: Lead): { markPrice: number | undefined; unrealizedUsd: number | undefined; markAt?: string | undefined; markFrom?: string | undefined } => {
      const had = marks.get(l);
      if (had) return had;
      const live = l.state === "executed" && l.entry ? this.world.mark?.(f.objective.venue, l.symbol) : undefined;
      const dir = l.side === "buy" ? 1 : -1;
      const out = !live || !l.entry ? { markPrice: l.markPrice, unrealizedUsd: l.unrealizedUsd } : { markPrice: live.price, unrealizedUsd: r2(dir * (live.price - l.entry.price) * l.entry.qty * (l.entry.contractSize ?? 1)), markAt: live.at, markFrom: live.from };
      marks.set(l, out);
      return out;
    };
    // the floor's equity is its open leads at the marks its rows show: start, plus what closed since, plus the sum of those leads' results
    const { state, equity, target, venue, nextCycleAt } = this.figures(nowMs, kept, (l) => liveMarked(l).unrealizedUsd);
    const standing = kept ? this.standing(kept) : new Map<RoleId, { status: "ok" | "not let in" | "expired" | "revoked"; limit?: SeatLimit | undefined; cards: number }>();
    const s = f.session;
    const brain = this.standingOf();
    return {
      seq,
      room,
      working: this.working(),
      inFlight: this.inFlight,
      lastThink: Object.fromEntries(Object.entries(this.lastThink).map(([k, v]) => [k, { ...v }])) as DeskFeed["lastThink"],
      lastScan: f.lastScan ?? null,
      autonomy: f.autonomy ?? null,
      session: s ? { state, startedAt: s.startedAt, endsAt: s.endsAt, hours: s.hours, cycles: s.cycles, ...(s.halted ? { halted: s.halted } : {}) } : null,
      venue,
      equity: { ...equity, tail: f.equity.slice(-FEED_EQUITY_TAIL).map(([t, u]) => [t, u] as [number, number]) },
      target,
      funnel: this.funnel(),
      today: this.todayNumbers(),
      leads: recentAndOpen(f.leads, FEED_LEADS).map((l) => ({
        id: l.id,
        at: l.at,
        state: l.state,
        symbol: l.symbol,
        name: l.name,
        kind: l.kind,
        side: l.side,
        thesis: l.thesis,
        cleared: l.cleared,
        sizeUsd: l.sizeUsd,
        confidence: l.confidence,
        checks: l.checks,
        why: l.why,
        entry: l.entry ? { price: l.entry.price, qty: l.entry.qty, at: l.entry.at } : undefined,
        exit: l.exit ? { price: l.exit.price, at: l.exit.at } : undefined,
        exitWhy: l.exitWhy,
        pnlUsd: l.pnlUsd,
        roiPct: l.roiPct,
        // an open lead marked from its market's live stream as the floor is read (each second while it shows), not only at the desk's tick
        ...liveMarked(l),
        tpPct: l.tpPct,
        slPct: l.slPct,
        maxHours: l.maxHours,
        updatedAt: l.updatedAt,
      })),
      routines: { everyMin: f.objective.everyMin, ...(nextCycleAt ? { nextCycleAt } : {}) },
      brain: { ok: brain.ok, ...(brain.ok || !brain.why ? {} : { why: brain.why }), ...(brain.ok || !brain.fix ? {} : { fix: brain.fix }), provider: f.brain.provider, label: this.brain.label, model: f.brain.model, spend: this.spendNow() },
      name: f.name,
      objective: { ...f.objective },
      seats: f.seats.map((x) => ({ role: x.role, kind: x.kind, name: x.name, status: standing.get(x.role)?.status ?? "not let in", ...(standing.get(x.role)?.limit ? { limit: standing.get(x.role)!.limit } : {}) })),
      hard: { maxSpreadPct: MAX_SPREAD_PCT },
    };
  }

  /** what hiring offers: the roles with their charters, the house seats' keys, the brain's standing */
  catalog(): DeskCatalog {
    const seats: Partial<Record<RoleId, Hex>> = {};
    for (const r of ROLES) {
      if (!ROLE_SPECS[r].house) continue;
      const k = this.seatKeyOf(r);
      if (!isRefusal(k)) seats[r] = k.address as Hex;
    }
    const b = this.file?.brain;
    // each brain with its standing and what it says of itself for the Brains place (BrainAbout: where it is reached, what it suggests, the
    // key's masked tail — never the key)
    const brains = this.brains.map((x) => ({ ...this.standingOf(x), id: x.id, label: x.label, models: x.models, ...(x.about ? x.about() : {}) }));
    const pick = b ? this.brain : (this.brains.find((x) => x.ready().ok) ?? this.brains[0]!);
    const st = this.standingOf(pick);
    return { roles: ROLES.map((r) => ROLE_SPECS[r]), seats, brain: { ...st, provider: pick.id, label: pick.label, model: b && b.provider === pick.id ? b.model : st.model || pick.models[0]?.id || "", models: pick.models, effort: b?.effort ?? DEFAULT_BRAIN.effort }, brains, universes: UNIVERSES, defaults: { universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 15, reportAt: "21:00", maxOpen: 3 }, hired: this.file !== undefined, autonomy: this.file?.autonomy ?? null, bounds: OBJECTIVE_BOUNDS };
  }

  /** the desk as a seat reads it (portfolio_desk): the seat's own charter, the objective, the funnel, the room's last lines */
  async forSeat(address: string): Promise<Record<string, unknown> | Refusal> {
    const f = this.file;
    if (!f) return no("E_ACCOUNT_BAD_ACTION", { message: "no desk is hired on this account" });
    const seat = f.seats.find((s) => s.address === address.toLowerCase());
    const v = await this.view();
    if (!v) return no("E_ACCOUNT_BAD_ACTION", { message: "no desk is hired on this account" });
    const scan = f.lastScan;
    return { desk: v.name, objective: v.objective, session: v.session ? { state: v.session.state, startedAt: v.session.startedAt, endsAt: v.session.endsAt, halted: v.session.halted } : undefined, autonomy: { paper: f.autonomy?.paper === true, ...(f.autonomy ? { at: f.autonomy.at } : {}) }, lastScan: scan ? { cycle: scan.cycle, at: scan.at, venue: scan.venue, scanned: scan.rows.length, picked: scan.picked.length, ...(scan.note ? { note: scan.note } : {}) } : null, yourSeat: seat ? { role: seat.role, name: ROLE_SPECS[seat.role].name, charter: seat.charter, trades: ROLE_SPECS[seat.role].trades } : null, seats: f.seats.map((s) => ({ role: s.role, kind: s.kind, name: s.name })), funnel: v.funnel, today: v.today, open: v.open.map((l) => ({ id: l.id, symbol: l.symbol, side: l.side, sizeUsd: l.sizeUsd, entry: l.entry?.price, mark: l.markPrice, unrealizedUsd: l.unrealizedUsd, plan: { tpPct: l.tpPct, slPct: l.slPct, maxHours: l.maxHours } })), room: v.room.slice(-40).map((m) => ({ seq: m.seq, at: m.at, from: m.from, kind: m.kind, lead: m.lead, text: m.text })) };
  }
}
