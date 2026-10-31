/** The agent portfolio manager, in-process: the adapters, the openness dial,
 * the approval queue, the FLIGHT BOARD and a hash-chained ledger behind one
 * object. The HTTP server, the MCP server and the scripted demo all drive
 * this; it binds no port itself, so the unit tests and the headless demo run
 * anywhere.
 *
 * The airport: every agent request is a FLIGHT with a number whose prefix is
 * the agent's code (PM-0001 the page's scripted agent, CC-0002 Claude Code
 * over MCP, TD-0003 the terminal demo). A flight has LEGS — one per account
 * the money touches — and a leg can be an ok, a refusal in plain words, or a
 * card waiting for the human. Every ledger row carries the flight and the
 * agent, so the flight log reads end to end.
 *
 *   openFlight / fly / note     the page agent's multi-leg flights
 *   execute(account, intent, agent)  one-leg flight (the MCP server's write)
 *   quote / order               the tower's routing service: one order priced
 *                               at every venue (CEX books, DEX pools) and split
 *                               across them; `order` flies the slices as one
 *                               flight
 *   flyBatch                    the slices of one order: ONE decision — the
 *                               wallet judges the whole order (splitting never
 *                               slips under an allowance) and raises one card,
 *                               not one per slice
 *   decide(approvalId, …)       the human's answer to a card, as one more leg
 *   read / overview             never gated; one read across every account
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ledger, type LedgerRow } from "../agent/ledger.ts";
import { isRefusal, type Refusal } from "../core/errors.ts";
import { no, unaddressed, unaddressedDeep } from "./refuse.ts";
import { describeIntent, ENFORCER_LABEL, KIND_LABEL, KIND_ORDER, PRICES, qtyText, r2, SCRIPT_AGENT, tradeKinds, usdOf, WRITE_CAPS, type Account, type AccountAdapter, type AgentId, type Capability, type ExecOk, type ExecResult, type Holding, type Intent } from "./accounts.ts";
import { alpacaAccount, type AlpacaSeed } from "./adapters/alpaca.ts";
import { binanceAccount, type BinanceSeed } from "./adapters/binance.ts";
import { hyperliquidAccount, type HyperliquidSeed } from "./adapters/hyperliquid.ts";
import { kalshiAccount, type KalshiSeed } from "./adapters/kalshi.ts";
import { metamaskLiveAccount, metamaskSimAccount, type MetamaskSimSeed, type MmLiveOptions } from "./adapters/metamask.ts";
import { polymarketLiveAccount, polymarketSimAccount, type PolymarketSeed } from "./adapters/polymarket.ts";
import { okxAccount, type OkxSeed } from "./adapters/okx.ts";
import { ondoAccount, type OndoSeed } from "./adapters/ondo.ts";
import { compileOpenness, effectiveReach, evaluate, isExpired, parseOpenness, sessionFrom, type AskReason, type Card, type Mode, type Openness, type OpennessRow } from "./openness.ts";
import { aggregate, liquidity, type Aggregate, type Liquidity } from "./portfolio.ts";
import { ladder, type Ladder } from "./rails.ts";
import { chainName } from "./accounts.ts";
import { eventState, eventSymbol, eventTop, EVENTS, isEventSymbol, PREDICTION_VENUES, type EventState } from "./events.ts";
import { orderPlan, type OrderPlan, type Part } from "./router.ts";
import type { Side } from "./venues.ts";
import { cents, detailOf, plainRefusal, routeLine, sayOf, waitWords } from "./words.ts";
import { HOW_TEXT, MAX_NOTES, MemoryStore, NOTE_TEXT, TOPIC_WORDS, TOPICS, type MemoryNote, type MemoryRules, type Topic } from "./account/memory.ts";
import { etDate, isEarlyClose } from "./account/calendar.ts";
import { pairingCode } from "./account/pairing.ts";
import { AccountEngine, CARD_TTL_MS, slug, type AccountPage, type AccountSeed, type AgentAsk, type CardOffer, type DeclinedAsk, type Outcome, type WaitingConnection } from "./account/exchange.ts";
import { defaultKeyRef } from "./live/credentials.ts";
import { assetKey, byAsset, change24h, withEarn, type AssetRow, type DayChange, type EarnHeld, type MoneySummary } from "./account/holdings.ts";
import { NetWorthLog, NETWORTH_RANGES, networthPath, paperNetworthPath, bucketFor, type NetWorthHistory, type NetWorthRange, type NetWorthSnapshot } from "./account/networth.ts";
import { BUCKET_MS, paperCurve, paperRangeStart, type PaperHistory, type PaperVenueSeries } from "./account/paper-equity.ts";
import { paperBarsWanted, paperBookStart, rebuildEquity, type PriceSeries } from "./live/paper-history.ts";
import { loadBook, PAPER_MAX_CASH, paperBookPath, paperBooksOnDisk, paperDir, parsePaperCash, resetBookOnDisk, summaryOf, type PaperBook, type PaperBookSummary, type PaperChange } from "./live/paper.ts";
import { costBasis, ordersOf, type CostBasis, type LoggedOrder, type VenuePosition } from "./account/costbasis.ts";
import type { AutonomyHook, LiveOrder } from "./account/live-orders.ts";
import type { LiveEarn } from "./account/live-earn.ts";
import type { Payment } from "./account/payments.ts";
import { exploreAcross, type Exploration, type ExploreSort, type ExploreVenue } from "./live/explore.ts";
import { fixedHosts, holdBackMs, KEEP_MS as LISTING_KEEP_MS, publicSources, type PublicSource } from "./live/public-markets.ts";
import { SEC_HOSTS, SEC_TICKER, SEC_TIMEOUT_MS, SecEdgar, secUserAgent, type Company, type Financials } from "./live/edgar.ts";
import { TABS, type TabId } from "./live/categories.ts";
import { CHAIN_BY_ID, CHAINS, type ChainName } from "./live/chain.ts";
import { mountPayees, type PayeeWorld } from "./account/payees.ts";
import { doorOf, EXCHANGES } from "./account/doors.ts";
import { isSelfCustody, plug, type PlugSeed } from "./adapters/exchange.ts";
import { liveAccount } from "./adapters/live.ts";
import { KEY_SHAPES, keyFileStatus, liveOptions, openLive, parseConnector, type LiveDeps } from "./live/index.ts";
import { exchangeEarner, type EarnPosition, type EarnProduct, type LiveEarner } from "./live/earn.ts";
import { exchangeEarnHook } from "./live/exchange-trade.ts";
import type { LiveVenue } from "./account/live-moves.ts";
import { CANDLE_INTERVALS, CANDLE_RANGES, DONE, floorTo, HISTORY_MOST, inDollars, INTERVAL_MS, type Candle, type CandleInterval, type CandlePage, type CandleRange, type CandleWindow, type FundingLine, type LiveTrader, type Market, type MarketKind, type MarketStats, type OrderBook, type Position, type PublicTrade } from "./live/trade.ts";
import { historyKeep, INTERVAL_RANGE, keepMsOf, PAGE_MOST, pageOf, pageWeight, RANGE_BAR, rangeSince, sessionsSince, windowKey } from "./live/history.ts";
import { compareAcross, normalBase, type Comparison, type PlaceRule } from "./live/compare.ts";
import { fold, paperFillLine, type StatementLine } from "./account/statement.ts";
import { WalletProofs } from "./live/proof.ts";
import { proofHolds, readHistory, rebuild, runOf, type DialSnapshot, type Rebuilt, type RunMark } from "./account/restore.ts";
import { RealPayer } from "./account/pay-real.ts";
import { agentWalletKey, agentWalletKeyPath, hasKey } from "./account/keystore.ts";
import { agentWalletSource, agentWalletVenue } from "./live/agent-wallet.ts";
import { guardedHttp, type PayHttp } from "./live/guarded-http.ts";
import { publicSender } from "./live/chain.ts";
import { agentStatus, type FiredAlert, type SubAccount } from "./account/state.ts";
import { publicChain } from "./live/chain.ts";
import { realMm } from "./live/metamask.ts";
import { publicPrices } from "./live/prices.ts";
import { ROBINHOOD_MCP } from "./live/robinhood.ts";
import { OAuthSignIn } from "./live/signin.ts";
import { reachBanUntil, reachKeepMs, reachOf, type Reach } from "./live/reach.ts";
import { EDITIONS, KNOWN_EXCHANGES, venuesHere, verdictOf, type AvailabilityDeps, type VenueHere } from "./live/availability.ts";
import { termsHere, VENUE_TERMS } from "./live/eligibility.ts";
import { locator, type Locator } from "./live/location.ts";
import { isStable, realHttp, type PaperControls } from "./live/types.ts";
import { isPlain } from "./account/state.ts";
import type { AgentAction, Envelope, Hex, OwnerAction } from "./account/sign.ts";
import { Desk, type Brain, type BrainStatus, type BrainTest, type DeskWorld } from "./account/desk.ts";
import { AccountStream } from "./account/stream.ts";
import { BOOK_TOP, joinHubs, StreamHub, type HubTick, type HubVenue, type MarketHub } from "./live/stream-hub.ts";
import { applyBrainKey, BrainKeyStage, envBlocksOf, envWinsOf, type BrainKeyDone } from "./account/brain-keys.ts";
import { DETECT_BODY_WORDS, detectBrain, type Detected } from "./account/brain-detect.ts";
import { brainProviders, presetBest, presetHost, testBrain } from "./account/brains.ts";
import { marketText, realHistorySources, type HistorySources } from "./backtest/data.ts";
import { labWalkForward, WALK_COMBOS_MOST, WALK_FOLDS, WALK_RUNS_MOST, walkAskOf, walkSummary } from "./backtest/walk.ts";
import { askOf, DESK_INTERVALS, deskAskOf, holdoutStartMs, labCatalog, labEvaluate, labList, labRead, labRun, outcomeSummary, readHoldout, readTrials, setHoldout, WINDOW_DEFAULT_DAYS, type LabDeps, type TrialRow } from "./backtest/lab.ts";
import { DESK_NAME, DESK_PARAMS, deskParamWords, DESK_WORDS } from "./backtest/desk-params.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** the most work a backtest the service is asked for may take, in steps times markets: 200,000 is two years of hourly bars on ten markets
 * (some twenty-five seconds at the eight thousand market-steps a second measured on this machine); the command at the owner's terminal
 * may take more */
export const BACKTEST_API_WORK = 200_000;
/** the most work a walk-forward the service is asked for may take, over all its runs, in steps times markets: twice a run's, since a walk is
 * many short runs (some fifty seconds at the speed measured on this machine) */
export const BACKTEST_WALK_WORK = 400_000;
/** the most steps the desk may take when the owner's signature runs it (setBacktest desk): 4,500 holds the 180 days of hourly bars a run
 * takes when it names no start (4,320). The desk is a whole account stepping — about two milliseconds a step on one market measured on
 * this machine (the 4,321 hourly steps of BTC in 9.5 seconds, 67 before the desk's record was kept in memory for the run), about three a
 * market on more; the command at the owner's terminal may take more */
export const BACKTEST_DESK_STEPS = 4_500;
/** a desk step's time on each of its markets as measured on this machine, for the words before the owner signs: how long the run will
 * take, about */
const DESK_STEP_MS = 3;
/** a setBacktest whose change is none of the three, in words */
const LAB_CHANGES = (change: unknown): string => `a backtest's change is holdout (a day), evaluate (a training run's id) or desk (the desk's run, as JSON), not "${String(change).slice(0, 30)}"`;
export const FIXTURES = join(ROOT, "fixtures", "home", "portfolio");

export interface Seeds {
  binance: BinanceSeed;
  okx: OkxSeed;
  metamask: MetamaskSimSeed;
  polymarket: PolymarketSeed;
  kalshi: KalshiSeed;
  ondo: OndoSeed;
  /** the two front-line venues the account layer adds; absent in the original set */
  alpaca?: AlpacaSeed | undefined;
  hyperliquid?: HyperliquidSeed | undefined;
}

/** `classic`: the accounts the portfolio demo was built on · `frontline`: those plus a stock broker and Hyperliquid, with the two changes that make them reachable (an OKX key that can withdraw to verified addresses, USDC on Arbitrum in the wallet) */
export type VenueSet = "classic" | "frontline";

export interface ServiceOptions {
  /** where the ledger goes (`$BUYER_HOME`); never the repo */
  home: string;
  now?: () => string;
  /** replace the simulated MetaMask account with the real `mm` CLI (reads; writes stay off unless PORTFOLIO_MM_WRITES=1) */
  live?: boolean;
  mm?: MmLiveOptions;
  seeds?: Seeds;
  /** which accounts are mounted when no seeds are given (default `classic`) */
  venues?: VenueSet;
  /** mount the account layer (signed instructions, agent keys, spending approvals, payments with a clock). On by default with `frontline`; the original demo runs without it */
  account?: AccountSeed | undefined;
  openness?: unknown;
  /** start from an empty ledger even when a file with this name exists: a scripted run on a fixed clock gets the same file name every time and would otherwise append to its previous run */
  freshLedger?: boolean;
  /** a real account starts from nothing instead of continuing its ledgers (account/restore.ts): `--fresh` */
  fresh?: boolean | undefined;
  /** how a payee is asked when an agent pays with real money (live/guarded-http.ts); a stand-in in tests */
  payHttp?: PayHttp | undefined;
  /** the venues the owner could plug in (default: fixtures `connectable.json`) */
  connectable?: Record<string, PlugSeed> | undefined;
  /** stand-ins for what a live connection reaches — the exchange library, HTTP, the chain, the real clock — so tests never leave the process */
  liveDeps?: Partial<LiveDeps> | undefined;
  /** REAL money at venues connected live (the server's `--live-writes`): the most one movement may be, and the code the first owner types.
   * Absent: live venues are read, and nothing moves at them */
  liveWrites?: { capUsd: number; pairingCode: string } | undefined;
  /** the code the first owner types when nothing moves money either (a read-only real account): an owner paired without one would own the
   * account's later runs, money and all. With liveWrites, its own code is the one */
  pairingCode?: string | undefined;
  /** REAL accounts only (the server's default): no simulated venue is mounted, and the account layer has no simulated payee, plug-in
   * or clock. What is on the service is what the owner connected through each venue's own interface */
  real?: boolean | undefined;
  /** the keyless public market data Markets reads beside the connected venues (default: live/public-markets.ts publicSources over the live
   * connection's network and exchange library); stand-ins in tests */
  publicMarkets?: PublicSource[] | undefined;
  /** SEC EDGAR (live/edgar.ts), which the stock drawer's Financials are read from: the environment the owner's contact (SEC_CONTACT) is
   * read from (the process's own by default), or the user agent outright (tests) */
  sec?: { env?: NodeJS.ProcessEnv | undefined; userAgent?: string | undefined } | undefined;
  /** THE DESK (account/desk.ts), on a real account: the brains its house seats may think with and how often its clock ticks (0: only when
   * asked, as in tests). The brains, by default: every provider the Brains place offers (account/brains.ts brainProviders) — Claude through
   * the Anthropic API and each OpenAI-format preset — each ready when its key is there; a scripted one in tests. `env`: the environment
   * those brains read before their key files, as the answer to a key typed on the page says it (envWins); the process's own by default.
   * `deferSaves`: its record kept in memory until Desk.flush (DeskOptions.deferSaves; a desk played over recorded bars) */
  desk?: { brain?: Brain | Brain[] | undefined; tickMs?: number | undefined; firstCycleMs?: number | undefined; env?: NodeJS.ProcessEnv | undefined; deferSaves?: boolean | undefined } | undefined;
  /** THE VENUES' LIVE STREAMS as a test hands them in (a hub over a stand-in WebSocket, or test/standin's stand-in prices): the real server
   * starts its own instead (watchStreams), and without either nothing is streamed — every price is a REST read, as before */
  streams?: MarketHub | undefined;
  /** THE LAB (backtest/lab.ts): the history its backtests read (default: Hyperliquid's perpetuals, Coinbase's coins and the US stocks line,
   * keyless, over the service's own network; stand-ins in tests), the most steps a run the service is asked for may take, the most work a
   * walk-forward may, and the most steps the desk may when the owner signs for it */
  backtest?: { sources?: HistorySources | undefined; maxSteps?: number | undefined; maxWalkWork?: number | undefined; maxDeskSteps?: number | undefined } | undefined;
}

/** one slice of an order (or any step an agent flies): where, what, and the agent's words for it */
export interface BatchStep {
  account: string;
  intent: Intent;
  say?: string | undefined;
  compare?: string | undefined;
}

export interface Approval {
  id: string;
  at: string;
  account: string;
  intent: Intent;
  usd: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  /** what made the wallet ask */
  why: AskReason;
  flight: string;
  decidedAt?: string | undefined;
  result?: ExecResult | undefined;
  /** a split order waits on ONE card: every slice it covers (`account` / `intent` above are its first slice) */
  batch?: BatchStep[] | undefined;
  /** the order in words — `Sell 3 ETH (3 slices)` */
  title?: string | undefined;
  /** what each slice came back with, once approved */
  results?: ExecResult[] | undefined;
  /** lines the agent holds back until the card is approved and the writes have landed (where the proceeds are) */
  notes?: string[] | undefined;
  /** the account layer: the agent's signed instruction this card would release, and who signed it. Such a card is answered with the owner's signature, not with `decide` */
  action?: AgentAction | undefined;
  actionHash?: Hex | undefined;
  signer?: string | undefined;
  /** the account layer: a card does not wait for ever */
  expiresAt?: string | undefined;
  /** the account layer: what a payee asked for, when the card is about a payment to someone else */
  offer?: CardOffer | undefined;
  /** the account layer: what releasing the card produced (the payment, and what it bought), for the agent that asked */
  outcome?: unknown;
  /** the account layer: the spending approval this card holds its share of */
  approval?: string | undefined;
}

export type Pending = { ok: true; pending: true; approval: Approval };
export type ExecuteOutcome = ExecOk | Refusal | Pending;

export function isPending(v: ExecuteOutcome): v is Pending {
  return v.ok === true && (v as Pending).pending === true;
}

export type Mark = "ok" | "no" | "wait" | "note";

export interface Leg {
  seq: number;
  mark: Mark;
  /** a sentence a person reads; the code is on the ledger */
  text: string;
  account?: string | undefined;
  intent?: Intent | undefined;
  usd?: number | undefined;
  approvalId?: string | undefined;
  /** what this leg was chosen over: the other routes, the other venues; for a DEX swap, its route */
  compare?: string | undefined;
  /** a split order's proportions, drawn as one bar under the agent's narration */
  parts?: Part[] | undefined;
}

export interface Flight {
  no: string;
  agent: AgentId;
  at: string;
  /** what the agent was asked, in its words */
  request: string;
  legs: Leg[];
}

export interface MarketView {
  id: string;
  title: string;
  closesAt: string;
  /** open · awaiting (past its close, not yet resolved) · resolved */
  state: EventState;
  resolved?: string;
  /** what to pass as `base` to quote or order: `<id>:YES`, `<id>:NO` */
  symbols: string[];
  venues: Array<{ venue: string; name: string; ticker: string; yes: { bid?: number | undefined; ask?: number | undefined; bidSize?: number | undefined; askSize?: number | undefined }; rules: string }>;
}

export interface AccountView extends Account {
  kindLabel: string;
  enforcerLabel: string;
  reach: Capability[];
  revoked: boolean;
  usd: number;
  holdings: Holding[];
  readError?: string | undefined;
}

export interface Overview {
  now: string;
  live: boolean;
  mode: Mode;
  session: { expiresAt: string; expired: boolean };
  portfolio: Aggregate;
  liquidity: Liquidity;
  /** liquidity as amount × time × cost: how soon each holding can be at the hub chain, and for how much */
  ladder: Ladder;
  accounts: AccountView[];
  /** the simulation's dial, compiled per account, and the agent's day against its cap: the original statement's. A real account has none
   * of them (its venues are real, its limits are the owner's signed ones), so they are left out there */
  compiled?: OpennessRow[] | undefined;
  openness?: Openness | undefined;
  approvals: Approval[];
  flights: Flight[];
  agents: Array<AgentId & { flights: number }>;
  ledger: LedgerRow[];
  chain: { ok: boolean; rows: number; at?: number };
  daily?: { used: number; cap: number } | undefined;
  counters: { writes: number; refusals: number; cards: number };
  ledgerPath: string;
}

export function loadSeeds(venues: VenueSet = "classic"): Seeds {
  const base = JSON.parse(readFileSync(join(FIXTURES, "accounts.json"), "utf8")) as Seeds;
  if (venues === "classic") return base;
  const f = JSON.parse(readFileSync(join(FIXTURES, "frontline.json"), "utf8")) as { alpaca: AlpacaSeed; hyperliquid: HyperliquidSeed; okx: Partial<OkxSeed>; metamask: { allowlistAdd: string[]; holdingsAdd: MetamaskSimSeed["holdings"] } };
  return { ...base, alpaca: f.alpaca, hyperliquid: f.hyperliquid, okx: { ...base.okx, ...f.okx }, metamask: { ...base.metamask, allowlist: [...base.metamask.allowlist, ...f.metamask.allowlistAdd], holdings: [...base.metamask.holdings, ...f.metamask.holdingsAdd] } };
}

/** the venues the user has and has not plugged in: the simulated exchange side of each */
export function loadConnectable(): Record<string, PlugSeed> {
  const { note: _note, ...venues } = JSON.parse(readFileSync(join(FIXTURES, "connectable.json"), "utf8")) as Record<string, unknown>;
  return venues as Record<string, PlugSeed>;
}

export function loadOpenness(): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, "openness.json"), "utf8"));
}

export class PortfolioService {
  private adapters = new Map<string, AccountAdapter>();
  private openness: Openness;
  private ledger: Ledger;
  private approvals: Approval[] = [];
  private seq = 0;
  readonly flights: Flight[] = [];
  private flightSeq = 0;
  readonly counters = { writes: 0, refusals: 0, cards: 0 };
  readonly now: () => string;
  readonly live: boolean;
  /** the account layer, when it is mounted */
  readonly account: AccountEngine | undefined;
  /** what the agents remember, kept with the account layer (account/memory.ts): the conversation, their notes, the owner's About you */
  readonly memory: MemoryStore | undefined;
  /** the simulated payees an agent's payment can reach (x402, MPP, ACP, AP2), mounted with the account layer */
  readonly payees: PayeeWorld | undefined;
  /** the page's scripted agent, when a server has one: the owner talks to it through a signed instruction */
  sayHandler: ((text: string) => Promise<unknown>) | undefined;
  /** told when the owner connects or disconnects a venue: the server takes a net worth snapshot then (account/networth.ts) */
  onConnection: ((e: NonNullable<NetWorthSnapshot["event"]>) => void) | undefined;
  /** how far the simulated clock has been pushed ahead of the one the service was given */
  private skewMs = 0;
  /** venues the owner can plug into the account, by id */
  private catalog: Record<string, PlugSeed> = {};
  /** the simulated wallet's own allowlist: the hub sends only to what is on it */
  private walletAllow: string[] = [];
  /** a simulated venue whose place a live connection has taken: it comes back when the live one is unplugged */
  private readonly shadowed = new Map<string, AccountAdapter>();
  /** what real money can be asked of each venue connected live, and how */
  private readonly liveVenues = new Map<string, LiveVenue>();
  /** each venue connected live that has earn products (live/earn.ts), and how they are reached */
  private readonly earners = new Map<string, LiveEarner>();
  /** wallets that proved an address is the user's, by signing the sentence the account wrote */
  readonly proofs: WalletProofs;
  /** a real account restarted: what it brought back from its ledgers, and the restore still under way (venues connecting again) */
  restored: RestoreReport | undefined;
  restoring: Promise<void> | undefined;
  /** the account's own agents (account/desk.ts), on a real account */
  readonly desk: Desk | undefined;
  /** THE PUSH CHANNEL (account/stream.ts): one bus for every page listening at GET /api/account/stream. What a paper account's book tells
   * as it changes (paperSaid), what the ledger takes (toldRow: a statement line, an order's new state as the account follows it, a card) and
   * the desk's floor moving (Desk onChange) are emitted on it as they happen; a page that cannot resume from where it stopped is sent what
   * streamSnapshot() says the account is now. The server's close() ends it */
  readonly stream = new AccountStream({ snapshot: () => this.streamSnapshot(), onFollow: (client, keys) => this.pageFollows(client, keys), onAgain: (client, keys) => this.pageAgain(client, keys) });
  /** A brain's key typed on the page (account/brain-keys.ts), held in memory from the moment its route has checked it against the signed
   * fingerprint until that route answers — taken once by the door's handler, which writes the provider's key file. Nothing else reads it */
  readonly brainKeys = new BrainKeyStage();
  /** the most one order or movement may be worth, in dollars: the server's `--live-cap` to start with, then what the owner last signed
   * (setPolicy cap), which a restart brings back from the ledger */
  private capUsd: number;
  /** the venues of a restarted account are being connected again: what they hold is not on the account yet */
  private reconnecting = false;
  /** the code the first browser pairs with (absent: a server that asks for none): this run's own, and a new one once the last device has
   * signed out (newPairingCode) */
  private pairCode: string | undefined;

  private constructor(
    private readonly opts: ServiceOptions,
    private readonly seeds: Seeds,
    /** the accounts that read the real `mm` CLI (`--mm`): the MetaMask wallet and its Polymarket deposit wallet */
    private readonly liveAccounts: { metamask: AccountAdapter; polymarket: AccountAdapter } | undefined,
  ) {
    // the adapters and the ledger keep this one function: with no skew it answers exactly what the given clock answers
    const base = opts.now ?? (() => new Date().toISOString());
    this.now = () => (this.skewMs === 0 ? base() : new Date(Date.parse(base()) + this.skewMs).toISOString());
    this.live = liveAccounts !== undefined;
    this.proofs = opts.liveDeps?.proofs ?? new WalletProofs(opts.liveDeps?.clock);
    // the fixture's dial, when none is given, with the agents' session measured from this service's own clock (openness.ts sessionFrom):
    // its fixed date passes, and a service built on the real clock would otherwise refuse every agent write
    this.openness = parseOpenness(opts.openness ?? sessionFrom(loadOpenness() as object, Date.parse(this.now())));
    // real money starts Guard: every move an agent asks for waits for the owner until the owner signs the dial open
    if (opts.real) this.openness = { ...this.openness, mode: "guard" };
    this.capUsd = opts.liveWrites?.capUsd ?? 0;
    this.pairCode = opts.liveWrites?.pairingCode ?? opts.pairingCode;
    this.ledger = this.openLedger();
    this.mount();
    this.memory = opts.account !== undefined || opts.venues === "frontline" ? new MemoryStore(join(opts.home, "memory"), () => Date.parse(this.now())) : undefined;
    this.account = opts.account !== undefined || opts.venues === "frontline" ? new AccountEngine(this.host(), opts.account ?? {}) : undefined;
    if (this.account) this.catalog = opts.connectable ?? loadConnectable();
    // the desk lives on a real account only: its seats are keys at the real door, its leads orders at a venue connected live
    this.desk = this.account && opts.real ? new Desk(this.deskWorld(), { brain: opts.desk?.brain ?? brainProviders(opts.home, { env: opts.desk?.env }), tickMs: opts.desk?.tickMs, firstCycleMs: opts.desk?.firstCycleMs, deferSaves: opts.desk?.deferSaves, onChange: (c) => this.stream.emit("desk", { ...c, at: this.now() }) }) : undefined;
    // the payees are simulated hosts: a real account has none. A real account pays real ones, from agent wallets (account/pay-real.ts)
    this.payees = this.account && !opts.real ? mountPayees(this.account) : undefined;
    if (this.account && opts.real && opts.liveWrites) this.account.usePayer(new RealPayer(this.account, { http: opts.payHttp ?? guardedHttp, chain: this.liveDeps().chain, wallet: (name) => agentWalletKey(opts.home, name), clock: () => this.liveDeps().clock(), capUsd: () => this.capUsd }));
    if (this.account && !opts.freshLedger) this.rememberNonces(this.account);
  }

  /** A signature outlives the process that first saw it. On start, every signed envelope in this home's ledgers has its nonce marked used again,
   * so an instruction — or an approval the owner has since revoked — cannot be replayed into a freshly started, empty account. Each nonce is
   * remembered exactly (it refuses its own reuse and nothing else), so a row that was tampered with can make the account refuse more, never
   * less, and cannot lock a signer out. (A scripted run that asks for a fresh ledger declares it starts from nothing.) */
  private rememberNonces(engine: AccountEngine): void {
    const dir = join(this.opts.home, "portfolio");
    for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
      if (!/^ledger-.*\.jsonl$/.test(name)) continue;
      for (const row of new Ledger(join(dir, name), this.now).all()) if (row.signer && row.envelope) engine.recall(row.signer, row.envelope as Envelope);
    }
  }

  /** what the account layer may use of the service: the venues, the dial, the flight board, the ledger. A real account sees only the venues
   * connected live: the simulated ones stay on the statement page. And the order door's one question beyond the dial (AutonomyHook): is
   * this order the desk's own, at its paper account, under the autonomy the owner signed — asked of the desk only for a venue that is a
   * paper account on this account (the door checks the same of the venue it is placing at) */
  private host(): ConstructorParameters<typeof AccountEngine>[0] & AutonomyHook {
    const real = this.opts.real === true;
    const shown = (a: AccountAdapter | undefined) => (!real || a?.account.watchOnly ? a : undefined);
    return {
      real,
      now: () => this.now(),
      adapter: (id) => shown(this.adapters.get(id)),
      accounts: () => this.accounts().filter((a) => !real || a.watchOnly),
      views: async () => (await this.views()).filter((v) => !real || v.watchOnly),
      policy: () => this.openness,
      dailyOutUsd: (now) => this.dailyOutUsd(now),
      log: (row) => void this.ledger.append(unaddressedRow(row)),
      openFlight: (agent, request) => this.openFlight(agent, request),
      say: (no, text, mark = "note", extra = {}) => {
        const f = this.flight(no);
        if (!f) return;
        const leg = this.note(f, text, mark);
        if (extra.usd !== undefined) leg.usd = extra.usd;
        if (extra.approvalId !== undefined) leg.approvalId = extra.approvalId;
        if (extra.account !== undefined) leg.account = extra.account;
      },
      raiseCard: (no, c) => {
        const now = this.now();
        const approval: Approval = { id: `card-${String(++this.seq).padStart(4, "0")}`, at: now, account: c.account, intent: c.intent, usd: c.usd, reason: c.reason, status: "pending", why: c.why, flight: no, action: c.action, actionHash: c.actionHash, signer: c.signer, expiresAt: c.expiresAt, ...(c.offer ? { offer: c.offer } : {}), ...(c.approval ? { approval: c.approval } : {}) };
        this.approvals.unshift(approval);
        this.counters.cards++;
        const f = this.flight(no);
        this.ledger.append({ kind: "card", venue: c.account, intentId: approval.id, tool: c.action.type, outcome: "pending", reason: c.reason, notionalUsd: c.usd, flight: no, ...(f ? { agent: f.agent.id } : {}) });
        if (f) f.legs.push({ seq: f.legs.length + 1, mark: "wait", text: `${describeIntent(c.intent)}: ${waitWords(c.why)}`, account: c.account, intent: c.intent, usd: c.usd, approvalId: approval.id });
        return approval;
      },
      card: (id) => this.approvals.find((x) => x.id === id),
      cards: () => this.approvals,
      execute: async (accountId, intent, agent, signer) => {
        const r = await this.execute(accountId, intent, agent);
        // a card this raised remembers which agent key asked for it: it is answered only while that key stands
        if (signer && isPending(r)) r.approval.signer = signer;
        return r;
      },
      order: async (base, side, qty, agent, signer) => {
        const r = await this.order(base, side, qty, agent);
        // the card a routed order raised remembers which agent key asked for it, as an executed intent's does
        if (signer) for (const o of r.outcomes) if (isPending(o)) o.approval.signer = signer;
        return { flight: r.flight.no, legs: r.flight.legs.map((l) => `${l.mark === "ok" ? "✓" : l.mark === "no" ? "✗" : l.mark === "wait" ? "▣" : "·"} ${l.text}`), outcomes: r.outcomes };
      },
      decide: (id, decision) => this.decide(id, decision),
      closeCard: (id, status, note, outcome) => {
        const ap = this.approvals.find((x) => x.id === id);
        if (!ap) return;
        ap.status = status;
        ap.decidedAt = this.now();
        if (outcome !== undefined) ap.outcome = outcome;
        const f = this.flight(ap.flight);
        this.ledger.append({ kind: "card", venue: ap.account, intentId: ap.id, outcome: status, reason: note || ap.reason, notionalUsd: ap.usd, flight: ap.flight, ...(f ? { agent: f.agent.id } : {}) });
        if (f && note) this.note(f, note, "no");
      },
      widen: async (change, value) => {
        if (change === "say") {
          if (!this.sayHandler) return no("E_ACCOUNT_BAD_ACTION", { message: "no page agent is listening on this service" });
          return { ok: true, summary: `the owner told the page's agent: ${value.slice(0, 80)}`, data: await this.sayHandler(value) };
        }
        // a real account keeps the real clock, and its connections and payments are not the simulation's to wipe
        if (real && (change === "advance" || change === "reset")) return no("E_ACCOUNT_BAD_ACTION", { message: change === "reset" ? "this server holds your real accounts: it is not reset from here (restart it for a fresh one, and connect the accounts again)" : "this account runs on the real clock: nothing here is simulated" });
        if (change === "advance") {
          const minutes = Number(value);
          if (!(minutes > 0) || minutes > 60 * 24 * 30) return no("E_ACCOUNT_BAD_ACTION", { message: "the simulated clock moves ahead by 1 minute to 30 days" });
          return { ok: true, summary: `simulated clock +${minutes} min`, data: { now: await this.advance(minutes * 60_000) } };
        }
        if (change === "mode" && value === "open") {
          this.setMode("open");
          return { ok: true, summary: "Beast: agents trade and move inside their limits without asking" };
        }
        if (change === "cap") {
          // the most one order or movement may be worth on this server: the owner's to sign, up or down (the server's --live-cap is only
          // where it starts; a restart brings back the last signed figure). Nothing on a read-only server
          if (this.opts.liveWrites === undefined) return no("E_ACCOUNT_BAD_ACTION", { message: "this server was started read-only: it places no orders and moves no money, so there is no cap to set" });
          if (!/^\d{1,7}(\.\d{1,2})?$/.test(value) || !(Number(value) > 0)) return no("E_ACCOUNT_BAD_ACTION", { message: "the cap is a number of dollars, more than zero, to the cent" });
          this.capUsd = Number(value);
          this.ledger.append({ kind: "note", venue: "*", reason: `one order or movement may be worth up to $${value}`, detail: this.dialNow() });
          return { ok: true, summary: `one order or movement may be worth up to ${cents(this.capUsd)}` };
        }
        if (change === "maxLeverage") {
          // the most leverage an agent may set on a perpetual: widening, so it is the owner's to sign
          const lev = Number(value);
          if (!/^\d{1,3}$/.test(value) || !(lev >= 1)) return no("E_ACCOUNT_BAD_ACTION", { message: "the agents' leverage cap is a whole number, 1 or more" });
          this.openness = { ...this.openness, maxLeverage: lev };
          this.ledger.append({ kind: "note", venue: "*", reason: `agents may set leverage up to ${lev}x`, detail: this.dialNow() });
          return { ok: true, summary: `agents may set leverage up to ${lev}x` };
        }
        if (change === "session") {
          // a new session for the agents: thirty days from now. Widening, so it is the owner's to sign
          this.openness = { ...this.openness, sessionExpiresAt: new Date(Date.parse(this.now()) + 30 * 86_400_000).toISOString() };
          this.ledger.append({ kind: "note", venue: "*", reason: `a new session for the agents, until ${this.openness.sessionExpiresAt}`, detail: this.dialNow() });
          // the day as the page writes dates (New York, no year); the exact moment is the dial's, on the account page
          return { ok: true, summary: `agents may act again, until ${nyDay(this.openness.sessionExpiresAt)}` };
        }
        if (change === "restore") {
          const r = this.restore(value);
          return isRefusal(r) ? r : { ok: true, summary: `${this.nameOf(value)} is open to the agent again` };
        }
        if (change === "reach") {
          const [account, caps] = value.split(":");
          const r = this.setReach(account ?? "", (caps ?? "").split(",").filter(Boolean) as Capability[]);
          return isRefusal(r) ? r : { ok: true, summary: `reach at ${this.nameOf(account ?? "")} → ${r.reach.join(", ")}` };
        }
        if (change === "reset") {
          this.reset();
          return { ok: true, summary: "the simulation was reset" };
        }
        return no("E_ACCOUNT_BAD_ACTION", { message: `"${change}" is not a policy change the owner signs here` });
      },
      // a venue connected or disconnected is said to whoever keeps the net worth curve: the total moves, and that is not a gain or a loss
      connect: async (venue, connector, label, credentialRef) => {
        if (!connector.startsWith("live:")) {
          const r = this.plugIn(venue, connector, label, credentialRef);
          if (!isRefusal(r)) this.onConnection?.({ kind: "connect", venue, name: this.nameOf(venue) });
          return r;
        }
        const kept = connector === "live:paper" ? this.paperKeptRule(venue, credentialRef) : null;
        if (kept) return kept;
        const r = await this.plugOrWait(venue, connector, label, credentialRef);
        // connected, and read: the net worth moved. A connection kept waiting for its venue holds no money the account can see yet. A paper
        // account's connection is marked on the paper accounts' curve, not on the net worth's
        if (!isRefusal(r) && this.adapters.get(venue)?.account.watchOnly) this.onConnection?.({ kind: "connect", venue, name: this.nameOf(venue), ...(this.paperVenue(venue) ? { paper: true } : {}) });
        return r;
      },
      disconnect: (venue) => {
        const name = this.nameOf(venue);
        // whether it was a paper account is known only while it is connected
        const paper = this.paperVenue(venue);
        const r = this.unplug(venue);
        if (!isRefusal(r)) this.onConnection?.({ kind: "disconnect", venue, name, ...(paper ? { paper: true } : {}) });
        return r;
      },
      live: () => ({ ...liveOptions(this.opts.home), writes: this.liveWritesView(), waiting: this.waitingList() }),
      liveMoney: () => {
        // the doors (orders, earn) and the reads keep ONE hold per venue: what holds a venue's reads back holds its doors' asks, and a refusal
        // a door met holds its reads — the later of the two ends it, as for every read (ReadCache.hold)
        const money = {
          writes: () => this.liveWritesView(),
          venue: (id: string) => (this.adapters.get(id)?.account.watchOnly ? this.liveVenues.get(id) : undefined),
          realNow: () => this.liveDeps().clock(),
          held: (venue: string): Refusal | undefined => this.shutNow(venue),
          // mm reaches several venues (its swaps, Polymarket, Hyperliquid): a door's refusal at one of them holds the connection only when it
          // is mm's own (not installed, signed out) — one place rule must not freeze the others
          hold: (venue: string, r: Refusal): void => void ((this.adapters.get(venue)?.account.connector !== "live:metamask" || connectionWide(r)) && this.marketReads.hold(venue, r) && this.sawRule(venue, r)),
          // the earn door's hold: the mm connection's earn (LI.FI's vaults) is held apart from the rest of mm (earnAt)
          earnHeld: (venue: string): Refusal | undefined => this.shutNow(venue) ?? (this.earnAt(venue) !== venue ? this.marketReads.heldOf(this.earnAt(venue)) : undefined),
          earnHold: (venue: string, r: Refusal): void => {
            const at = this.earnAt(venue);
            if (at !== venue) this.marketReads.hold(at, r);
            else if (this.marketReads.hold(venue, r)) this.sawRule(venue, r);
          },
          // a venue on the account whose venue has not answered this network yet (connected by the owner so, or not back after the
          // restart): why (waitingWords) — its open orders are not "unfollowed" meanwhile
          waiting: (venue: string): string | undefined => this.waitingWords(venue),
        };
        return money;
      },
      liveEarn: () => ({ earner: (id) => (this.adapters.get(id)?.account.watchOnly ? this.earners.get(id) : undefined) }),
      venueVerdict: (venue) => {
        // the venue an agent names, as the connection the owner would make for it: an exchange by its own id, or a kind (a venue traded
        // through its -trade connection when there is one: Hyperliquid, Polymarket)
        // only an answer asked in the last ten minutes refuses at the door — counted from when the venue was asked, not from when the list
        // was put together (a rebuilt list reuses answers it kept): an older one may be of another network (a laptop moves), and then the
        // owner is asked, and the venue's own answer decides when they connect. The list takes each connection's newest answer as it comes
        const now = this.liveDeps().clock();
        const fresh = (connector: string): VenueHere | undefined => {
          const x = this.venuesKept?.v.find((y) => y.connector === connector);
          return x?.asked !== undefined && now - Date.parse(x.asked) < 600_000 ? x : undefined;
        };
        // a connection the owner has made already and whose venue has not answered this network yet (by the venue's id, or by the
        // connection an agent's name for the venue would be): the owner is not asked for what they have done
        const held = this.waiting.get(venue) ?? [...this.waiting.values()].find((w) => w.c.connector === `live:exchange:${venue}` || w.c.connector === `live:${venue}-trade` || w.c.connector === `live:${venue}`);
        if (held && !held.stopped) return { name: held.c.label || this.connectionName(held.c), verdict: "waiting", said: held.said, waiting: { code: held.last.code, said: held.said } };
        const main = fresh(`live:exchange:${venue}`) ?? fresh(`live:${venue}-trade`);
        const plain = fresh(`live:${venue}`);
        const shut = (x: VenueHere): boolean => x.verdict === "not-served" || x.verdict === "closed";
        // the trading connection refuses this network or offers no way in, and the venue read by its address does not: the ask goes to the
        // owner, for the connection that is open (Hyperliquid or Polymarket watched by its address, read only)
        if (main && plain && shut(main) && !shut(plain)) return { name: plain.name, verdict: plain.verdict, said: `${main.name} ${main.verdict === "not-served" ? "does not serve the network this account runs on" : "offers no way in for this account"}; ${plain.name} can be connected by its address, read only` };
        const v = main ?? plain;
        // an edition is asked for by its venue id, as the agent names venues: the exchange's own id, or the connection's kind
        const edition = v?.edition ? { venue: v.edition.connector.replace(/^live:(exchange:)?/, ""), name: v.edition.name } : undefined;
        return v ? { name: v.name, verdict: v.verdict, ...(v.said ? { said: v.said } : {}), ...(edition ? { edition } : {}) } : undefined;
      },
      pairingCode: () => this.pairCode,
      ownerGone: () => this.newPairingCode(),
      memory: () => this.memory,
      desk: (action, who) => (this.desk ? this.desk.apply(action, who) : Promise.resolve(no("E_ACCOUNT_BAD_ACTION", { message: "this account keeps no desk: it is the real account's" }))),
      // a brain's key (account/brain-keys.ts): the key staged for this signature is taken here — once — and written to the provider's file.
      // Taken whatever the handler answers, so a key is never left behind in memory by a refusal. Once a key file was written or removed, the
      // desk is told (Desk.keyChanged): a refusal the provider gave the OLD key stops being the brain's standing — the page, the feed and the
      // answer to this route then agree with no cycle in between — and the room says the key changed, by its fingerprint only (the desk
      // keeps a refusal standing when a variable in the service's environment wins over the file: that key is still the one in use). A clear
      // that found no file changed nothing, so the desk is not told: its line would say a key was taken away that never was
      brainKey: (action, who): BrainKeyDone | Refusal => {
        const staged = this.brainKeys.take(who.hash);
        if (!this.desk) return no("E_ACCOUNT_BAD_ACTION", { message: "this account keeps no desk, so it holds no brain's key: brain keys are the real account's" });
        const done = applyBrainKey(this.opts.home, this.desk.brains, action, staged);
        if (!isRefusal(done) && done.changed) this.desk.keyChanged(done.provider, done.fingerprint, { keyless: done.keyless === true });
        return done;
      },
      autonomy: (signer, venue) => (this.desk && this.paperVenue(venue) ? this.desk.autonomyFor(signer, venue) : undefined),
      // a paper account the account keeps itself, as its owner runs it (live/paper.ts): started again, or paper money added
      paper: (action) => this.paperControl(action),
      paperWords: (action) => this.paperControlWords(action),
      // the lab (backtest/lab.ts), as its owner runs it: the holdout moved, or a training run tried on the held-out data
      backtest: (action) => this.labAct(action),
      backtestWords: (action) => this.labWords(action),
      ...(real && this.opts.liveWrites
        ? {
            agentWalletAddress: (name: string) => {
              const k = agentWalletKey(this.opts.home, name);
              return isRefusal(k) ? k : (k.address as Hex);
            },
            agentWalletUp: (sub: SubAccount) => this.plugAgentWallet(sub),
          }
        : {}),
      connectable: () =>
        Object.entries(real ? {} : this.catalog)
          .filter(([id]) => !this.adapters.has(id))
          .map(([id, v]) => ({ id, name: v.name, connector: v.connector, via: isSelfCustody(v) ? "A self-custody wallet · by its address" : (EXCHANGES[v.connector]?.label ?? v.connector), credential: isSelfCustody(v) ? "no key: its address" : (EXCHANGES[v.connector]?.credential ?? "API key"), credentialRef: isSelfCustody(v) ? v.address : `home/credentials/${id}/api-key.json`, asks: isSelfCustody(v) ? "the chain: the address can be read and sent to, and nothing leaves it without your signature in that wallet" : (EXCHANGES[v.connector]?.probe ?? "what the key may do") })),
    };
  }

  /** Plug in a venue the owner already has. No code names it: the connector says how it is spoken to, the venue's own answer about the credential
   * says what may be done there, and the account's doors for it are compiled from that answer. */
  private plugIn(venue: string, connector: string, label: string, credentialRef: string): Refusal | { ok: true; summary: string; native?: unknown } {
    if (this.opts.real) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `this account connects real venues only, through their own interfaces: "${connector}" is a simulated connector` });
    if (this.adapters.has(venue)) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${this.nameOf(venue)} is already on the account` });
    const seed = this.catalog[venue];
    if (!seed) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue, message: `nothing answers as "${venue}" with that credential; what can be plugged in: ${Object.keys(this.catalog).join(", ") || "nothing"}`, detail: { connectable: Object.keys(this.catalog) } });
    if (seed.connector !== connector) return no("E_VENUE_REJECTED", { venue, message: `${seed.name} did not answer through "${connector}": it is reached through "${seed.connector}"`, detail: { connector: seed.connector } });
    const name = label.trim().slice(0, 40) || seed.name;
    const { adapter, probe } = plug(venue, { ...seed, name }, credentialRef.trim().slice(0, 120) || `home/credentials/${venue}/api-key.json`);
    this.adapters.set(venue, adapter);
    // the hub sends only to destinations on the wallet's own allowlist. In the simulation the owner's signature on this action adds the venue's
    // deposit destination to it; a real wallet's policy is the wallet's, and the owner adds it there
    const destination = adapter.account.address ?? venue;
    if (!this.live && !this.walletAllow.includes(destination)) this.walletAllow.push(destination);
    const door = doorOf(adapter.account);
    const who = (x: string | undefined) => (x === "agent" ? "an agent's key may" : x === "owner" ? "yours to sign" : x === "venue" ? "only at the venue itself" : "closed");
    const said = isSelfCustody(seed) ? `${name} plugged in by its address · ${probe.note}` : `${name} plugged in · the venue says this credential can ${probe.can.join(", ")} · ${probe.note}`;
    return { ok: true, summary: `${said} · money in: ${who(door.in[0]?.access)}; money out: ${who(door.out[0]?.access)}${this.live ? " · add its deposit address to the wallet's own allowlist before sending there" : ""}`, native: { connector, probe: probe.native } };
  }

  private liveWritesView(): { on: boolean; capUsd: number; turnOn: string } {
    return { on: this.opts.liveWrites !== undefined, capUsd: this.capUsd, turnOn: "npm run account" };
  }

  /** what a venue connected live trades: a few markets, or the ones matching a query (a minute old at most) */
  async liveMarkets(venue: string, query: string): Promise<Market[] | Refusal> {
    const v = this.tradingVenue(venue);
    return isRefusal(v) ? v : this.kept(v).markets(query);
  }

  /** what is held at a venue connected live, fifteen seconds old at most (the page asks often; the venue is asked once) */
  /** a venue on the account is a paper account (LiveSource.paper): its positions, orders and balances are no money */
  paperVenue(venue: string): boolean {
    return this.liveVenues.get(venue)?.paper === true;
  }

  async livePositions(venue: string): Promise<Position[] | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const engine = this.account;
    // the mm connection's positions hold nothing else of it (kept)
    const at = this.adapters.get(venue)?.account.connector === "live:metamask" ? `${venue}#positions` : venue;
    return this.marketReads.get(`positions|${venue}`, 15_000, () => engine.trade.positions(venue).catch((err: unknown) => thrownBy(venue, this.nameOf(venue), err)), this.liveVenues.has(venue) ? at : undefined);
  }

  /** one market at a venue connected live, with a price a few seconds old at most. An order itself is always valued at a fresh one */
  async liveMarket(venue: string, symbol: string): Promise<Market | Refusal> {
    const v = this.tradingVenue(venue);
    return isRefusal(v) ? v : this.kept(v).market(symbol);
  }
  /** The same thing at every venue connected live that trades it — a coin, a stock — ranked by the price an order would take there (the ask
   * for a buy, the bid for a sell). Kept fifteen seconds. A price far from the others' (more than 10% from their middle) is marked: it may be
   * another token under the same name. `asset` says which is meant where a name is both a coin and a stock */
  async liveCompare(base: string, side: "buy" | "sell", usd?: number, asset?: "crypto" | "stock"): Promise<Comparison | Refusal> {
    const b = base.trim();
    if (!b || b.length > 40) return no("E_ACCOUNT_BAD_ACTION", { message: "name what to compare: BTC, ETH, AAPL" });
    if (side !== "buy" && side !== "sell") return no("E_ACCOUNT_BAD_ACTION", { message: "compare a buy or a sell" });
    // each venue's reads go through the same short-lived cache as the order ticket's: a new amount or the other side asks no venue again.
    // A venue whose own place rule bars an order from this network says so on its row (placeRuleOf)
    // a venue that does not serve the network the account runs on now (its place rule, its edge) is not compared: it is not asked — nor is a
    // paper account, whose prices are its test environment's
    const venues = this.tradingVenues().filter((v) => !v.paper && notServedBy(this.shutNow(v.id)) === undefined).map((v) => ({ id: v.id, name: v.name, trader: this.kept(v), connector: this.adapters.get(v.id)?.account.connector }));
    return this.marketReads.get(`compare|${b.toUpperCase()}|${side}|${usd ?? ""}|${asset ?? ""}`, 15_000, async () => {
      // nor is one whose trading line closes this place (Hyperliquid's): the comparison is of where an order could go from here
      const placed = (await Promise.all(venues.map(async ({ connector, ...v }) => ({ ...v, ...(await this.placed(connector)) })))).filter((v) => v.place?.rule !== "closed");
      return compareAcross(placed, b, side, { timeoutMs: 4_000, ...(usd !== undefined ? { usd } : {}), ...(asset ? { asset } : {}) });
    });
  }

  /** A trading connection's own place rule for the network the account runs on — Hyperliquid's line, Polymarket's blocked or close-only —
   * as the list of where the user can connect judged it in the last ten minutes, or as the connection's keyless question answers now
   * (waited for two seconds at most: its answer is kept for the next time). What the comparison and Markets mark the venue's rows with;
   * the rule's own words, never the place or an address. A rule the venue's terms state (terms-exclude) is shown, not applied, and an
   * unknown place or no answer is no rule */
  private async placed(connector: string | undefined): Promise<{ place?: PlaceRule }> {
    if (connector !== "live:hyperliquid-trade" && connector !== "live:hyperliquid-paper" && connector !== "live:polymarket-trade") return {};
    const kept = this.venuesKept?.v.find((x) => x.connector === connector);
    let rule: { verdict: string; said?: string | undefined } | undefined = kept?.asked !== undefined && this.liveDeps().clock() - Date.parse(kept.asked) < 600_000 ? kept : undefined;
    if (!rule) {
      let t: ReturnType<typeof setTimeout> | undefined;
      const r = await Promise.race([this.connectReach([connector]).then(([x]) => x), new Promise<undefined>((go) => (t = setTimeout(() => go(undefined), 2_000)))]).finally(() => clearTimeout(t));
      rule = r ? verdictOf(r, undefined, "key-file") : undefined;
    }
    const words = unaddressed(rule?.said ?? "");
    if (rule?.verdict === "not-served" || rule?.verdict === "closed") return { place: { rule: "closed", words } };
    if (rule?.verdict === "close-only") return { place: { rule: "close-only", words } };
    return {};
  }

  /** the order ticket's reads, kept for a moment and shared while they are in flight: a page (or anything else on this machine) asking
   * again and again costs the venue one request, not one each — the venue's rate limit is for the orders */
  // kept on the account's real clock (liveDeps.clock: the wall clock on the server, a test's or a replay's own), so what is kept expires
  // as that clock moves — a replay walks a day in seconds, and a read kept by the wall clock would never let the day's prices through
  private readonly marketReads = new ReadCache((venue, r) => void this.sawRule(venue, r), () => this.realNow());

  /** a venue connected live that orders are placed through, or why it is not one */
  private tradingVenue(venue: string): LiveVenue | Refusal {
    const v = this.adapters.get(venue)?.account.watchOnly ? this.liveVenues.get(venue) : undefined;
    if (!v) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue, message: `"${venue}" is not a venue connected live` });
    if (!v.trader) return no("E_VENUE_RAIL_CLOSED", { venue, message: `${v.name}: ${v.noTradeBecause ?? "no orders are placed here from the account"}` });
    return v;
  }

  /** every venue connected live that orders are placed through */
  private tradingVenues(): LiveVenue[] {
    return [...this.liveVenues.values()].filter((v) => v.trader && this.adapters.get(v.id)?.account.watchOnly);
  }

  /** A venue's trader as every read here asks it: each answer kept a while (a market's price three seconds; its listings and its 24 hours a
   * minute; its events five; its price history by its window, in the bounded memory of histories — historyRead), at most two of its reads
   * on their way at once, and how it answered remembered for the venue's health. A trader that throws has answered in a way the account cannot read: that is a refusal like any other (held back as a
   * venue that did not answer), never an exception that takes a whole read down. Orders never pass through this: they are the account's
   * door's (account/live-orders.ts) */
  private kept(v: LiveVenue): LiveTrader {
    const t = v.trader!;
    const c = this.marketReads;
    const id = v.id;
    // the trader's reads also wait out a hold of a party that answers for the trader (LI.FI, for a wallet's swaps); the venue's other reads
    // (what it holds, its deposit address, its earn) do not
    // the mm connection reaches several venues (swaps, Polymarket, perpetuals): each read is held under the one it asks (mmInner), and only
    // what is mm's own (mm not running, signed out) holds them all; its listings and positions hold nothing else either
    const mm = this.adapters.get(id)?.account.connector === "live:metamask";
    const inner = (part: string | undefined): string => (mm ? `${id}#${part ?? "markets"}` : id);
    // a paper account's price history is its public source's, passed through with the source's own refusal: held under a part of its own
    // (`#history`), so a chart a source did not answer holds back no market read of the paper account — its quotes, its ticket — the
    // source's own reads holding that source back meanwhile (keptPublic)
    const historyAt = (sym: string): string => (v.paper ? `${id}#history` : inner(mmInner(sym)));
    const read = <T>(key: string, ttlMs: number, load: () => Promise<T | Refusal>, at = id): Promise<T | Refusal> => c.get(key, ttlMs, () => load().catch((err: unknown) => thrownBy(id, v.name, err)), at, true);
    return Object.assign(Object.create(t) as LiveTrader, {
      markets: (q: string) => read(`markets|${id}|${q.trim().toUpperCase()}`, 60_000, () => t.markets(q), inner("markets")),
      market: (sym: string) => read(`market|${id}|${sym}`, MARKET_KEEP_MS, () => t.market(sym), inner(mmInner(sym))),
      ...(t.stats ? { stats: (symbols?: string[]) => read(`stats|${id}|${symbols ? [...symbols].sort().join(",") : ""}`, 60_000, () => t.stats!(symbols), inner("markets")) } : {}),
      ...(t.events ? { events: (o: { category?: string | undefined; closingWithinMs?: number | undefined; limit: number }) => read(`events|${id}|${o.category ?? ""}|${o.closingWithinMs ?? ""}|${o.limit}`, 300_000, () => t.events!(o), inner("predict")) } : {}),
      // a history is kept by its window (live/history.ts windowKey): a first view by its range, a page by where it ends
      ...(t.candles ? { candles: (sym: string, interval: CandleInterval, w: CandleWindow) => this.historyRead(`candles|${id}|${sym}|${windowKey(interval, w)}`, historyAt(sym), keepMsOf(interval, w), () => t.candles!(sym, interval, w), id, v.name) } : {}),
    });
  }

  /** PRICE HISTORIES, kept in memory only and only to absorb the same ask repeated (the owner's rule: market data is fetched from the
   * providers when it is asked for, and nothing is written anywhere): at most HISTORY_KEPT answers and HISTORY_KEPT_BARS bars, each for its
   * window's seconds to minutes (live/history.ts keepMsOf), the one used longest ago let go first */
  private readonly histories = historyKeep<Candle[] | CandlePage>({ entries: HISTORY_KEPT, most: HISTORY_KEPT_BARS, weigh: pageWeight });
  /** one price history read: not asked while its venue is held back (its place rule, a ban, a wait it asked for — the read cache's holds,
   * which a refusal here sets as any read's does), shared while on its way, kept by its window; a throw is a refusal */
  private historyRead(key: string, at: string, ttlMs: number, load: () => Promise<Candle[] | CandlePage | Refusal>, id: string, name: string): Promise<Candle[] | CandlePage | Refusal> {
    const held = this.marketReads.heldOf(at);
    if (held) return Promise.resolve(held);
    return this.histories.get(key, ttlMs, async () => {
      const r = await load().catch((err: unknown) => thrownBy(id, name, err));
      if (isRefusal(r)) this.marketReads.hold(at, r);
      return r;
    });
  }

  /** A keyless public source as Markets, the Portfolio's 24 hours and the Market sheet read it: through the same cache as a venue's reads,
   * under the source's id — so an answer on its way is shared, a source that refuses this location (451), rate-limits this machine (429)
   * or does not answer is not asked again for the keep (a geoblock holds it back ten minutes), and a throw is a refusal. The source's own
   * keeping of the bodies it downloads (live/public-markets.ts) sits under this. Its holds, kept answers and health are under a name of its
   * own (`public:okx`), apart from a venue connected with a key under the same id: a keyless refusal neither holds that connection back nor
   * stands for its health — save a ban of this machine's address, which covers both */
  private keptPublic(s: PublicSource): PublicSource {
    const c = this.marketReads;
    const id = s.id;
    const ns = `public:${id}`;
    const parted = !!s.line;
    /** a refusal of this network by a parted source's part (its place rule, a 451; a ban of this machine's address): the source's whole, every
     * part of it held with it — never a part asked again after its provider refused where this machine is */
    const widen = <T>(v: T | Refusal): T | Refusal => {
      if (parted && isRefusal(v) && (v.code === "E_VENUE_GEOBLOCKED" || isBan(v))) c.hold(ns, v);
      return v;
    };
    const read = <T>(key: string, ttlMs: number, load: () => Promise<T | Refusal>, venue = ns): Promise<T | Refusal> => c.get(key, ttlMs, () => load().catch((err: unknown) => thrownBy(id, s.name, err)).then((v) => (venue === ns ? v : widen(v))), venue);
    // a source whose price history comes from another host than its listings (Polymarket's CLOB, beside Gamma): a refusal of the history
    // holds back the history alone. A SOURCE THAT ANSWERS ONE MARKET'S LINE ALONE (the US stocks line, which a paper account prices every
    // share it knows by) keeps each of its reads apart — its searches (listings, stats, events) under `#search`, its history under
    // `#history`, its line under `#line` — so a search's 429 or a chart's timeout holds back neither the line nor each other: no paper
    // fill waits on a refused chart. A refusal of this network (a 451, a ban of this machine's address) is the source's (widen), and holds
    // all three
    const history = s.historyApart || parted ? `${ns}#history` : ns;
    const search = parted ? `${ns}#search` : ns;
    this.publicRaw.set(ns, s);
    return {
      ...s,
      listings: (o) => read(`public-listings|${ns}|${(o.q ?? "").trim().toUpperCase()}|${o.limit}`, PUBLIC_KEEP_MS, () => s.listings(o), search),
      ...(s.stats ? { stats: (symbols?: string[]) => read(`public-stats|${ns}|${symbols ? [...symbols].sort().join(",") : ""}`, PUBLIC_KEEP_MS, () => s.stats!(symbols), search) } : {}),
      ...(s.events ? { events: (o: { category?: string | undefined; closingWithinMs?: number | undefined; limit: number }) => read(`public-events|${ns}|${o.category ?? ""}|${o.closingWithinMs ?? ""}|${o.limit}`, PUBLIC_KEEP_MS, () => s.events!(o), search) } : {}),
      // one market's line asked alone (a paper account pricing a share it knows: the US stocks line), kept a few seconds — the prices under it
      // are the background reader's (s.feed) — and held back apart from the listings, so a search's refusal (a 429 after a wide search) holds
      // back no paper fill's line, and the line's own refusal no search
      ...(s.line ? { line: (sym: string) => read(`public-line|${ns}|${sym.trim().toUpperCase()}`, LINE_KEEP_MS, () => s.line!(sym), `${ns}#line`) } : {}),
      // a history is kept by its window too (live/history.ts windowKey: a first view by its range, a page by where it ends, a start to the
      // minute): a source gives the bars of the window asked, so one asked from later (a paper account's week, then its day) never stands
      // in for the earlier bars it does not have
      ...(s.candles ? { candles: (sym: string, interval: CandleInterval, w: CandleWindow) => this.historyRead(`public-candles|${history}|${sym}|${windowKey(interval, w)}`, history, keepMsOf(interval, w), () => s.candles!(sym, interval, w).then((v) => (parted ? widen(v) : v)), id, s.name) } : {}),
    };
  }
  /** each keyless source as it was made, by its name in the read cache: what a re-check that finds its venue answering again tells it */
  private readonly publicRaw = new Map<string, PublicSource>();

  // ---- the wallet: what you own (Portfolio), what there is to trade (Markets), what can be sold (Trade) --------------------------------

  /** the connected venues that answered a read or a door with their own rule for the whole of this network, and when: once the hold
   * that answer set runs out, the venue's KEYLESS question decides whether its key is used again (stillShut), so a venue that still does not
   * serve the network is not asked with the account's key every ten minutes */
  private readonly ruleSeen = new Map<string, number>();
  /** a refusal that is the venue's rule for the whole network, taken on the shared hold: remembered (always answers true, for chaining) */
  private sawRule(venue: string, r: Refusal): true {
    if (notServedBy(r) !== undefined && !partyOf(r) && !venue.includes("#") && !venue.startsWith("public:")) this.ruleSeen.set(venue, Date.now());
    return true;
  }
  /** what holds a connected venue back now: the shared hold; else, for one whose rule refused this network before, its keyless question's
   * answer — kept as the list of where the user can connect keeps it, asked again (without the key) when it has run out. Its key is used
   * again only once that question finds it answering this network */
  private shutNow(venue: string): Refusal | undefined {
    const held = this.marketReads.heldOf(venue);
    if (held || !this.ruleSeen.has(venue)) return held;
    const connector = this.adapters.get(venue)?.account.connector;
    if (!connector || connector === "live:metamask") return undefined;
    const kept = this.reaches.get(connector);
    const now = this.liveDeps().clock();
    if (kept && "r" in kept && kept.until > now) {
      if (kept.r.state === "location") return no("E_VENUE_GEOBLOCKED", { venue, message: `${this.nameOf(venue)} does not serve this location: that is its own rule, and the account does not look for a way around it`, native: { keyless: true, ...(kept.r.said ? { said: kept.r.said } : {}) } });
      // it answers this network again: its key is used again
      this.ruleSeen.delete(venue);
      return undefined;
    }
    // asked again without the key; until it answers, the venue stands as it last said
    if (!kept || ("r" in kept && kept.until <= now)) void this.connectReach([connector]).catch(() => undefined);
    return no("E_VENUE_GEOBLOCKED", { venue, message: `${this.nameOf(venue)} does not serve this location: that is its own rule, and the account does not look for a way around it`, native: { keyless: true, asking: true } });
  }

  /** where an earn read is held: the mm connection's earn vaults are LI.FI's, one of the several venues mm reaches, so their own refusal of
   * this network holds them alone (`mm#earn`) — not the connection's swaps, Polymarket, perpetuals and balance. What is mm's own (signed out,
   * not installed) still holds the whole connection, as the base is checked too */
  private earnAt(id: string): string {
    return this.adapters.get(id)?.account.connector === "live:metamask" ? `${id}#earn` : id;
  }

  /** how each venue connected live has answered the account's reads lately: when it last answered, when it last failed and in its own
   * words, how long its last read took. A venue not read since it was connected has no entry yet */
  venueHealth(): Record<string, VenueHealth> {
    const out: Record<string, VenueHealth> = {};
    for (const id of this.liveVenues.keys()) {
      const h = this.adapters.get(id)?.account.watchOnly ? this.marketReads.healthOf(id) : undefined;
      if (h) out[id] = h;
    }
    return out;
  }

  /** the real clock: what venues, public markets and the net worth curve are timed by (a stand-in's in tests) */
  private realNow(): number {
    return (this.opts.liveDeps?.clock ?? Date.now)();
  }

  private publicMade: PublicSource[] | undefined;
  /** FINANCIALS: a US company's own filed figures — the fiscal years and quarters as filed, with revenue, net income and earnings a share,
   * and the shares outstanding — read keyless from SEC EDGAR's XBRL company facts (live/edgar.ts) with the contact the owner set; the
   * stock drawer's Financials part. Kept twelve hours; nothing is estimated. A read */
  async financials(symbol: string): Promise<Financials | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const sym = symbol.trim().toUpperCase();
    if (!SEC_TICKER.test(sym)) return no("E_ACCOUNT_BAD_ACTION", { message: "financials are read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
    return this.edgar().financials(sym);
  }
  /** COMPANY: a US company's own record — who it is, its fiscal year end, where it is incorporated, its latest annual and quarterly reports
   * and its newest filings — read keyless from SEC EDGAR's submissions file (live/edgar.ts) with the contact the owner set; the stock
   * drawer's Company part, and the agents' portfolio_financials. Kept an hour; nothing is estimated. A read */
  async company(symbol: string): Promise<Company | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const sym = symbol.trim().toUpperCase();
    if (!SEC_TICKER.test(sym)) return no("E_ACCOUNT_BAD_ACTION", { message: "a company's record is read for a US stock's ticker: letters, with a class letter after a dot (BRK.B)" });
    return this.edgar().company(sym);
  }
  private edgarMade: SecEdgar | undefined;
  /** the SEC reader, made once: the live connection's network behind the fixed-host guard for the SEC's two hosts, and the account's user
   * agent there — its name and the owner's contact (SEC_CONTACT), without which nothing is asked */
  private edgar(): SecEdgar {
    if (!this.edgarMade) {
      const deps = this.liveDeps();
      this.edgarMade = new SecEdgar({ http: fixedHosts(deps.http, SEC_HOSTS, SEC_TIMEOUT_MS), clock: deps.clock, userAgent: this.opts.sec?.userAgent ?? secUserAgent(this.opts.sec?.env ?? process.env) });
    }
    return this.edgarMade;
  }

  /** the keyless public sources, made once and kept (what each keeps — its answers for a while, its exchange client — lives in it), each
   * read through the account's own cache (`keptPublic`) */
  private publicMarkets(): PublicSource[] {
    if (!this.publicMade) {
      const deps = this.liveDeps();
      this.publicMade = (this.opts.publicMarkets ?? publicSources({ http: deps.http, open: deps.openExchange, clock: deps.clock })).map((s) => this.keptPublic(s));
    }
    return this.publicMade;
  }

  /** MARKETS: everything there is to trade — what the connected venues list, and what the venues not connected publish without a key
   * (marked "Connect to trade") — as one list, with its tabs, its movers, what closes soon and what trades most (live/explore.ts). A public
   * source is left out when its venue is connected: the connected venue speaks for itself. Robinhood's Stock Tokens, which no connection
   * trades, are always read. The same question is answered from what was found for thirty seconds; each venue's reads are kept as `kept`
   * keeps them. `key`, a row's own exactly as `items` names it, keeps only that row (live/explore.ts ExploreOptions.key). Nothing is ordered
   * or signed */
  async explore(o: { tab?: string | undefined; q?: string | undefined; key?: string | undefined; sort?: string | undefined; limit?: number | undefined } = {}): Promise<Exploration | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const tab = o.tab?.trim() || undefined;
    if (tab !== undefined && !TABS.some((t) => t.id === tab)) return no("E_ACCOUNT_BAD_ACTION", { message: `a tab is one of ${TABS.map((t) => t.id).join(", ")}` });
    const sort = o.sort?.trim() || undefined;
    if (sort !== undefined && !EXPLORE_SORTS.includes(sort as ExploreSort)) return no("E_ACCOUNT_BAD_ACTION", { message: `markets are sorted by ${EXPLORE_SORTS.join(", ")}` });
    const q = (o.q ?? "").trim();
    if (q.length > 60) return no("E_ACCOUNT_BAD_ACTION", { message: "a search is at most 60 characters" });
    const key = (o.key ?? "").trim();
    if (key.length > 200) return no("E_ACCOUNT_BAD_ACTION", { message: "a row's key is at most 200 characters" });
    const limit = o.limit === undefined ? 60 : Math.floor(o.limit);
    if (!(limit >= 1 && limit <= 200)) return no("E_ACCOUNT_BAD_ACTION", { message: "a limit is 1 to 200 markets" });
    // each connected venue with the connection it was made with: exploreAcross leaves out the public source that connection speaks for
    // and its own place rule for this network, where it has one that bars an order from here (placed)
    const connected: ExploreVenue[] = this.tradingVenues().map((v) => {
      const connector = this.adapters.get(v.id)?.account.connector;
      return { id: v.id, name: v.name, trader: this.kept(v), ...(connector ? { connector } : {}), ...(v.paper ? { paper: true as const } : {}) };
    });
    // the key exactly as asked (a row's key is not a search: kalshi:KXFED and kalshi:kxfed are not one row), written so that no `|` in it
    // reads as the next part of the question
    return this.marketReads.get(`explore|${tab ?? ""}|${q.toUpperCase()}|${encodeURIComponent(key)}|${sort ?? ""}|${limit}`, 30_000, async () => {
      const placed = await Promise.all(connected.map(async (v) => ({ ...v, ...(await this.placed(v.connector)) })));
      // what is listed is what serves the network the account runs on: a connected venue that does not now (its place rule, its edge, or
      // its trading line closed here), and a public source whose venue the list of where the user can connect judged not served or with
      // no way in, are left out — named in a note, without their words
      const away = new Set(placed.filter((v) => notServedBy(this.shutNow(v.id)) !== undefined || v.place?.rule === "closed").map((v) => v.id));
      // close-only too, for a venue not connected: nothing held there to sell, and nothing it would take from here
      const refusing = new Set((this.venuesKept?.v ?? []).filter((x) => x.verdict === "not-served" || x.verdict === "closed" || x.verdict === "close-only").map((x) => x.connector));
      const serves = (r: { id: string; connected: boolean; connector?: string | undefined }): boolean => (r.connected ? !away.has(r.id) : !(r.connector !== undefined && refusing.has(r.connector)));
      // a source more than one connection trades (US stocks: Alpaca, Robinhood) is offered through the first of them that serves this
      // network: Alpaca refusing it leaves Robinhood's way in, and the line stays listed — left out only where none of them serves
      const routed = this.publicMarkets().map((s) => {
        if (!s.alsoVia || !refusing.has(s.connector)) return s;
        const via = s.alsoVia.find((v) => !refusing.has(v.connector));
        return via ? { ...s, connectTo: via.connectTo, connector: via.connector } : s;
      });
      return exploreAcross({ connected: placed, public: routed }, { q, ...(key ? { key } : {}), limit, clock: () => this.realNow(), serves, ...(tab ? { tab: tab as TabId } : {}), ...(sort ? { sort: sort as ExploreSort } : {}) });
    });
  }

  /** PORTFOLIO: what the account holds, by asset across every venue (account/holdings.ts), the dollars that are ready and where they can go,
   * and what the holdings did in the last 24 hours — each coin's and share's own 24-hour change as a venue reports it (the connected
   * venues' first, then the exchanges' public tickers), never estimated: what no venue reports is `missing`. `cost`: also what was paid for
   * what is held (account/costbasis.ts), from the account's own orders and each venue's positions */
  /** `paper`: the PAPER accounts' holdings instead of the real ones — the page's Paper lens — summed as paper money, never as the account's */
  async holdings(opts: { cost?: boolean | undefined; paper?: boolean | undefined } = {}): Promise<HoldingsView | Refusal> {
    const h = await this.held(opts);
    return isRefusal(h) ? h : h.view;
  }

  private async held(opts: { cost?: boolean | undefined; paper?: boolean | undefined }): Promise<{ view: HoldingsView; page: AccountPage } | Refusal> {
    const page = await this.accountView();
    if (!page) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const { rows, money } = byAsset(page.venues, { writes: page.connectLive?.writes?.on === true, ...(opts.paper ? { paper: true } : {}) });
    const [day, pos] = await Promise.all([this.dayStats(rows), opts.cost ? this.allPositions() : undefined]);
    const held: HeldRow[] = rows.map((r) => {
      const s = day.stats.get(r.key);
      const pct = s ? pctOf(s) : undefined;
      return pct === undefined || !s ? r : { ...r, changePct24h: Number(pct.toFixed(4)), changeFrom: { venue: s.venue, venueName: s.venueName } };
    });
    // the paper accounts' total is paper money: said as that, apart from the account's own figure
    const view: HoldingsView = { asOf: page.now, totalUsd: opts.paper ? r2(page.venues.filter((v) => v.paper).reduce((s, v) => s + v.usd, 0)) : page.totalUsd, rows: held, money, change24h: change24h(rows, day.stats), missing: day.missing, ...(opts.paper ? { paper: true } : {}) };
    if (pos && !isRefusal(pos)) {
      // the paper accounts' orders and positions are the paper view's, the real ones the real view's: a paper buy is never a real cost
      const paper = opts.paper === true;
      const positions = pos.positions.filter((p) => (p.paper === true) === paper);
      view.positions = positions;
      // money in an earn product was not bought: what was paid is its asset's own row's
      view.cost = costBasis(this.allOrders().filter((o) => (o.paper === true) === paper), rows.filter((r) => r.class !== "earn"), positions);
      view.missing = [...view.missing, ...pos.missing];
    }
    return { view, page };
  }

  /** Each held coin's and share's last 24 hours, as a venue reports them: the connected venues' well-known markets first, then the shares
   * still without a figure at the venues that trade shares, then the coins still without one in the exchanges' public tickers. Every source
   * has four seconds; a figure is taken only where it says a change */
  private async dayStats(rows: readonly AssetRow[]): Promise<{ stats: Map<string, MarketStats & { venue: string; venueName: string }>; missing: ReadMissing[] }> {
    const want = new Set(rows.filter((r) => r.usd > 0 && (r.class === "crypto" || r.class === "equity")).map((r) => r.key));
    // money in an earn product changes as its coin does: the coin's 24 hours are asked for too
    for (const r of rows) if (r.class === "earn" && r.usd > 0 && r.earn && !isStable(r.earn.asset)) want.add(assetKey(r.earn.asset, "crypto"));
    const stats = new Map<string, MarketStats & { venue: string; venueName: string }>();
    const missing: ReadMissing[] = [];
    if (!want.size) return { stats, missing };
    const take = (key: string | undefined, s: MarketStats | undefined, venue: string, venueName: string) => {
      if (key !== undefined && s && want.has(key) && !stats.has(key) && pctOf(s) !== undefined) stats.set(key, { ...s, venue, venueName });
    };
    const ask = async (v: { id: string; name: string }, run: () => Promise<Map<string, MarketStats> | Refusal>, keyOf: (symbol: string) => string | undefined) => {
      const got = await within(STATS_MS, run(), v.id, v.name);
      if (isRefusal(got)) return void missing.push({ venue: v.id, venueName: v.name, why: got.message, code: got.code, part: "stats" });
      for (const [symbol, s] of got) take(keyOf(symbol), s, v.id, v.name);
    };
    // a venue trades shares when its connector's kinds say so, or its trader says it in words ("US stocks and ETFs")
    const venues = this.tradingVenues().filter((v) => v.trader!.stats).map((v) => ({ v, shares: (v.trader!.kinds ?? tradeKinds(this.adapters.get(v.id)?.account.connector, v.trader!.what)).includes("stock") || /\b(stocks?|shares?|ETFs?)\b/i.test(v.trader!.what) }));
    // a pair (BTC/USDT, BTC-USD, WETH/USDC@Base) is a coin's; a bare ticker is a share's, and only at a venue that trades shares. A
    // perpetual's, a future's or an event's (with a colon) speaks for nothing held
    const statKey = (shares: boolean) => (symbol: string): string | undefined => {
      if (symbol.includes(":")) return undefined;
      if (/[/@]/.test(symbol) || /-(USD|USDT|USDC)$/i.test(symbol)) return `crypto:${normalBase(symbol, "spot")}`;
      return shares ? `equity:${symbol.toUpperCase()}` : undefined;
    };
    await Promise.all(venues.map(({ v, shares }) => ask(v, () => this.kept(v).stats!(), statKey(shares))));
    const tickers = [...want].filter((k) => k.startsWith("equity:") && !stats.has(k)).map((k) => k.slice("equity:".length)).slice(0, 40);
    if (tickers.length) await Promise.all(venues.filter((x) => x.shares).map(({ v }) => ask(v, () => this.kept(v).stats!(tickers), statKey(true))));
    const coins = [...want].filter((k) => k.startsWith("crypto:") && !stats.has(k)).map((k) => k.slice("crypto:".length));
    if (coins.length) {
      // a source's ticker call takes forty symbols at a time: the coins go in lots of thirteen (three dollar pairs each), so every held
      // coin gets its 24 hours, however many are held. Each lot is kept under the source's id (`keptPublic`), as a venue's reads are
      const lots: string[][] = [];
      for (let i = 0; i < coins.length; i += 13) lots.push(coins.slice(i, i + 13).flatMap((c) => ["USD", "USDT", "USDC"].map((q) => `${c}/${q}`)));
      const exchanges = this.publicMarkets().filter((s) => s.kind === "exchange" && s.stats);
      const got = await Promise.all(exchanges.map(async (s) => ({ s, rs: await Promise.all(lots.map((symbols) => within(STATS_MS, s.stats!(symbols), s.id, s.name))) })));
      // in the sources' own order: the first that says a change for a coin is the one shown; a source that refused is named once
      for (const { s, rs } of got) {
        let said = false;
        for (const r of rs) {
          if (isRefusal(r)) {
            if (!said) missing.push({ venue: s.id, venueName: s.name, why: r.message, code: r.code, part: "stats" });
            said = true;
          } else for (const [symbol, x] of r) take(`crypto:${normalBase(symbol, "spot")}`, x, s.id, s.name);
        }
      }
    }
    return { stats, missing };
  }

  /** every position at every venue connected live that lists them, each venue's read kept fifteen seconds and all of them asked at once;
   * a venue that could not be read is in `missing` */
  async allPositions(): Promise<{ positions: VenuePosition[]; missing: ReadMissing[] } | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const venues = this.tradingVenues().filter((v) => v.trader!.positions);
    const got = await Promise.all(venues.map(async (v) => ({ v, r: await this.livePositions(v.id) })));
    const positions: VenuePosition[] = [];
    const missing: ReadMissing[] = [];
    for (const { v, r } of got) {
      if (isRefusal(r)) missing.push({ venue: v.id, venueName: v.name, why: r.message, code: r.code, part: "positions" });
      else positions.push(...r.map((p) => ({ ...p, venue: v.id, venueName: v.name, ...(v.paper ? { paper: true as const } : {}) })));
    }
    return { positions, missing };
  }

  /** FUNDING: what each venue's perpetuals paid and received, hour by hour, newest first — at one venue, or at every venue that lists it
   * (LiveTrader.funding: a paper account's own book; Hyperliquid's userFunding for the account's address, keyless) — `limit` lines at most
   * (FUNDING_LINES_MAX), each read through the same short-lived cache as the venues' positions (half a minute); a venue that could not be
   * read is in `missing`, in its own words. A read */
  async allFunding(o: { venue?: string | undefined; limit?: number | undefined } = {}): Promise<{ lines: VenueFunding[]; missing: ReadMissing[] } | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const limit = Math.max(1, Math.min(FUNDING_LINES_MAX, Math.floor(o.limit ?? FUNDING_LINES_MAX)));
    const all = this.tradingVenues();
    const venues = all.filter((v) => v.trader!.funding && (!o.venue || v.id === o.venue));
    if (o.venue && !venues.length) return no("E_VENUE_RAIL_CLOSED", { venue: o.venue, message: all.some((v) => v.id === o.venue) ? `${this.nameOf(o.venue)} lists no funding to the account` : `"${o.venue}" is not a venue connected live` });
    const got = await Promise.all(venues.map(async (v) => ({ v, r: await this.marketReads.get(`funding|${v.id}|${limit}`, 30_000, () => v.trader!.funding!({ limit }).catch((err: unknown) => thrownBy(v.id, v.name, err)), this.liveVenues.has(v.id) ? v.id : undefined) })));
    const lines: VenueFunding[] = [];
    const missing: ReadMissing[] = [];
    for (const { v, r } of got) {
      if (isRefusal(r)) missing.push({ venue: v.id, venueName: v.name, why: r.message, code: r.code, part: "funding" });
      else lines.push(...r.map((f) => ({ ...f, venue: v.id, venueName: v.name, ...(v.paper ? { paper: true as const } : {}) })));
    }
    lines.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
    return { lines: lines.slice(0, limit), missing };
  }

  /** EARN: the products the venues connected live offer (DeFi vaults through the MetaMask Agent Wallet's mm, OKX's Simple Earn, Kraken
   * Earn), in one asset when asked, and what the user has in them — at one venue, or at every venue that earns. Products are kept a minute
   * and what is held fifteen seconds, read through the same short-lived cache as the venues' markets; a venue that could not be read is in
   * `missing` with its own words. A read: what goes in or out is the account's earn door's (account/live-earn.ts) */
  async earn(o: { venue?: string | undefined; asset?: string | undefined } = {}): Promise<EarnView | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const asset = o.asset?.trim().toUpperCase() ?? "";
    if (asset !== "" && !/^[A-Z0-9.]{1,20}$/.test(asset)) return no("E_ACCOUNT_BAD_ACTION", { message: "an asset is its symbol: USDC, BTC" });
    const ids = [...this.earners.keys()].filter((id) => this.adapters.get(id)?.account.watchOnly && (!o.venue || id === o.venue));
    if (o.venue && !ids.length) {
      const waiting = this.waitingWords(o.venue);
      if (waiting) return no("E_VENUE_UNREACHABLE", { venue: o.venue, message: `${waiting}: its earn is read once it answers`, detail: { waiting: true } });
      return no("E_VENUE_RAIL_CLOSED", { venue: o.venue, message: this.adapters.get(o.venue)?.account.watchOnly ? `${this.nameOf(o.venue)} offers no earn products to the account` : `"${o.venue}" is not a venue connected live` });
    }
    const products: EarnView["products"] = [];
    const positions: EarnView["positions"] = [];
    const missing: ReadMissing[] = [];
    await Promise.all(ids.map(async (id) => {
      const x = this.earners.get(id)!;
      const name = this.nameOf(id);
      const c = this.marketReads;
      const at = this.earnAt(id);
      const [ps, held] = await Promise.all([
        within(STATS_MS * 2, c.get(`earn-products|${id}|${asset}`, 60_000, () => x.products(asset || undefined), at), id, name),
        within(STATS_MS * 2, c.get(`earn-positions|${id}`, 15_000, () => x.positions(), at), id, name),
      ]);
      if (isRefusal(ps)) missing.push({ venue: id, venueName: name, why: ps.message, code: ps.code, part: "earn" });
      // a product the venue answered it does not offer to this network is listed closed, in a word, until that answer's time runs out
      else products.push(...ps.filter((p) => !asset || p.asset.toUpperCase() === asset).map((p) => ({ ...p, venue: id, venueName: name, ...(this.account!.earn.offeredHere(id, p.id) ? {} : { canSupply: false, why: "Not offered on this network" }) })));
      // one line for a venue whose two earn reads met the same refusal (its place rule, its hold)
      if (isRefusal(held)) {
        if (!(isRefusal(ps) && ps.message === held.message)) missing.push({ venue: id, venueName: name, why: held.message, code: held.code, part: "earn" });
      } else positions.push(...held.filter((h) => !asset || h.asset.toUpperCase() === asset || products.some((p) => p.venue === id && p.id === h.product)).map((h) => ({ ...h, venue: id, venueName: name })));
    }));
    // the highest yield first; what is held, the most dollars first
    products.sort((a, b) => (b.apy ?? -1) - (a.apy ?? -1));
    positions.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    const venues = ids.map((id) => {
      const x = this.earners.get(id)!;
      return { venue: id, venueName: this.nameOf(id), can: x.can, what: x.what, ...(x.whyNot ? { whyNot: x.whyNot } : {}) };
    });
    return { asOf: new Date(this.realNow()).toISOString(), venues, products, positions, missing, writes: this.liveWritesView() };
  }

  /** Where to send `asset` on `network` so that it lands at `venue`: an exchange's own deposit address, as the exchange gives it (asked of it
   * now, kept a minute); a wallet's own address, when a wallet signed to show it is the user's (or the account holds its key). A watched
   * address, or a venue the account sends nothing to, gives none */
  async receive(venue: string, asset: string, network: string): Promise<ReceiveAddress | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const v = this.adapters.get(venue)?.account.watchOnly ? this.liveVenues.get(venue) : undefined;
    if (!v) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue, message: `"${venue}" is not a venue connected live` });
    const a = asset.trim().toUpperCase();
    if (!/^[A-Z0-9.]{1,15}$/.test(a)) return no("E_ACCOUNT_BAD_ACTION", { message: "name what is to be received: USDC, USDT, ETH" });
    if (!Object.hasOwn(CHAINS, network)) return no("E_ACCOUNT_BAD_ACTION", { message: `a network is one of ${Object.keys(CHAINS).join(", ")}` });
    const chain = network as ChainName;
    const base = { venue: v.id, venueName: v.name, asset: a, network: chain };
    // a venue that is an address of the user's own: only when a wallet signed for it. A Polymarket wallet lives on Polygon alone and takes
    // pUSD, so it is not "the same on every EVM chain" (Polymarket connected by its key carries no address: its writer answers below)
    if (v.address !== undefined) {
      if (!v.proven) return no("E_ACCOUNT_DESTINATION", { venue: v.id, message: `${v.name} is watched, not proven yours: the account gives no address to send to it. Connect it again from the wallet itself` });
      if (v.kind === "prediction") {
        if (chain !== "Polygon" || a !== "PUSD") return no("E_ACCOUNT_BAD_ACTION", { venue: v.id, message: `${v.name}'s wallet lives on Polygon and holds pUSD: send pUSD on Polygon, nothing on another chain` });
        return { ...base, address: v.address, whose: v.proven, note: "the Polymarket wallet, on Polygon: pUSD only" };
      }
      return { ...base, address: v.address, whose: v.proven, note: "the wallet's own address: the same on every EVM chain" };
    }
    if (!v.writer) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name}: ${v.readOnlyBecause ?? "the account reads it and sends it nothing"}` });
    if (!v.writer.can.receive) return no("E_VENUE_RAIL_CLOSED", { venue: v.id, message: `${v.name} takes nothing sent from here` });
    const writer = v.writer;
    const r = await this.marketReads.get(`receive|${v.id}|${a}|${chain}`, 60_000, () => writer.depositAddress(a, chain).catch((err: unknown) => thrownBy(v.id, v.name, err)), v.id);
    if (isRefusal(r)) return r;
    // the venue's own words about sending there (a bridge's minimum, what it is credited as) travel with the address
    return { ...base, address: r.address, ...(r.tag ? { tag: r.tag } : {}), ...(r.note ? { note: r.note } : {}), whose: `${v.name}'s own deposit address, as ${v.name} gives it` };
  }

  /** One point on the net worth curve (account/networth.ts): the account page's total, by class and by venue (every venue connected, with
   * what it holds, 0 included), and which venues' numbers are stale; with `event`, the venue connected or disconnected just now. None while
   * a restart is still connecting the venues again: a venue that is not back yet is not money gone */
  async snapshot(event?: NetWorthSnapshot["event"]): Promise<{ written: boolean; at: string } | Refusal | undefined> {
    if (!this.account || this.reconnecting) return undefined;
    const page = await this.accountView();
    if (!page) return undefined;
    const byClass: Record<string, number> = {};
    const byVenue: Record<string, number> = {};
    const paperClass: Record<string, number> = {};
    const paperVenue: Record<string, number> = {};
    for (const v of page.venues) {
      // a paper account's numbers are not money: not on the net worth curve, on the paper accounts' own (account/paper-equity.ts)
      const [classes, venues] = v.paper ? [paperClass, paperVenue] : [byClass, byVenue];
      venues[v.id] = v.usd;
      for (const h of v.holdings) if (h.usd > 0) classes[h.class] = r2((classes[h.class] ?? 0) + h.usd);
    }
    const stale = page.venues.filter((v) => v.stale).map((v) => v.id);
    // the event goes to the log of its own kind of account: a paper account's connection is not a step of the net worth
    const paperEvent = event && (event.paper || page.venues.some((v) => v.id === event.venue && v.paper));
    const ev = event ? { kind: event.kind, venue: event.venue, ...(event.name ? { name: event.name } : {}) } : undefined;
    if (Object.keys(paperVenue).length || paperEvent) {
      const p = this.paperNetWorth().append({ usd: r2(Object.values(paperVenue).reduce((x, n) => x + n, 0)), byClass: paperClass, byVenue: paperVenue, stale: stale.filter((id) => id in paperVenue), ...(paperEvent && ev ? { event: ev } : {}) });
      if (paperEvent) return p;
    }
    // what the account itself has paid out to someone else, in all, from every run's statement: the curve's change adds it back
    const paidOutUsd = r2(this.statement().filter((l) => l.kind === "pay" && l.status === "settled").reduce((sum, l) => sum + Math.abs(l.amountUsd), 0));
    return this.netWorth().append({ usd: page.totalUsd, byClass, byVenue, stale: stale.filter((id) => id in byVenue), paidOutUsd, ...(ev ? { event: ev } : {}) });
  }

  private netWorthLog: NetWorthLog | undefined;
  private netWorth(): NetWorthLog {
    return (this.netWorthLog ??= new NetWorthLog(networthPath(this.opts.home), () => this.realNow()));
  }
  private paperNetWorthLog: NetWorthLog | undefined;
  private paperNetWorth(): NetWorthLog {
    return (this.paperNetWorthLog ??= new NetWorthLog(paperNetworthPath(this.opts.home), () => this.realNow()));
  }
  /** a venue id that is, or was, a paper account here: connected as one now, or with a paper book in the home (a paper account the account
   * kept itself, disconnected since) */
  private paperId(venue: string): boolean {
    return this.paperVenue(venue) || existsSync(paperDir(this.opts.home, venue));
  }

  /** the net worth curve over the last day (1d), week (1w) or month (1m), or all of it: one point per bucket, the connections and
   * disconnections in it, and how the holdings changed — connections left out, the account's own payments to payees added back, a venue's
   * own deposits and withdrawals in it (account/networth.ts). It starts at the first snapshot: nothing before is known */
  history(range: string): NetWorthHistory | Refusal {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    // a paper account's connection written on this log before paper accounts had one of their own is not marked on the net worth curve
    return this.netWorth().read(range, this.realNow(), (venue) => this.paperId(venue));
  }

  /** THE PAPER ACCOUNTS' CURVE (account/paper-equity.ts): all of them, or the one `venue`, over the last day, week or month or since they
   * started — a paper account the account keeps itself told again from its own book and the public bars (live/paper-history.ts), the
   * points the service wrote winning where it wrote them; a venue's own paper account from those points alone. Kept a minute per range and
   * account */
  async paperHistory(range: string, venue?: string): Promise<PaperHistory | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    if (!(NETWORTH_RANGES as readonly string[]).includes(range)) return no("E_ACCOUNT_BAD_ACTION", { message: `a net worth range is one of ${NETWORTH_RANGES.join(", ")}: not "${range}"`, detail: { ranges: NETWORTH_RANGES } });
    const page = await this.accountView();
    if (!page) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const papers = page.venues.filter((v) => v.paper && (!venue || v.id === venue));
    if (venue && !papers.length) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${venue} is not a paper account connected here` });
    const key = `${range}|${venue ?? ""}`;
    const kept = this.paperCurves.get(key);
    const now = this.realNow();
    if (kept && now - kept.at < PAPER_CURVE_MS) return kept.curve;
    const books = new Map<string, PaperBook>();
    for (const v of papers) {
      if (this.adapters.get(v.id)?.account.connector !== "live:paper") continue;
      try {
        const b = loadBook(paperBookPath(this.opts.home, v.id));
        if (b) books.set(v.id, b);
      } catch {
        // a book this account cannot read: its curve is the written points alone
      }
    }
    const log = this.paperNetWorth();
    const r = range as NetWorthRange;
    // all of it starts where the earliest of them started: a book's start, or a venue's first written point
    const firstWritten = r === "all" ? log.rowsSince(0).points.find((p) => papers.some((v) => v.id in p.byVenue && !books.has(v.id))) : undefined;
    // a book's start as its rebuild reads it: one whose `createdAt` does not parse (edited by hand) starts at its first fill, and says so
    const starts: Array<{ createdAt?: number | undefined; recorded?: Array<{ at: number; usd: number }> | undefined }> = papers.filter((v) => books.has(v.id)).map((v) => ({ createdAt: paperBookStart(books.get(v.id)!) }));
    if (firstWritten) starts.push({ recorded: [{ at: firstWritten.at, usd: firstWritten.usd }] });
    const startMs = paperRangeStart(r, now, starts);
    const step = BUCKET_MS[bucketFor(r, now - startMs)];
    const rows = log.rowsSince(startMs);
    const series: PaperVenueSeries[] = await Promise.all(
      papers.map(async (v): Promise<PaperVenueSeries> => {
        const recorded = rows.points.filter((p) => typeof p.byVenue[v.id] === "number").map((p) => ({ at: p.at, usd: p.byVenue[v.id]!, ...(p.stale.includes(v.id) ? { partial: true as const } : {}) }));
        const book = books.get(v.id);
        if (!book) return { venue: v.id, name: v.name, recorded, nowUsd: v.usd };
        // from the range's start or the book's, never past now (a book stamped by a clock ahead of this one); the start the curve is told
        // is the rebuild's own, a time whatever the book says
        const begun = paperBookStart(book);
        const from = Math.min(now, begun === undefined ? startMs : Math.max(startMs, begun));
        const bars = await this.paperBars(v.id, book, from, now);
        const told = rebuildEquity(book, bars, { fromMs: from, toMs: now, stepMs: step, nowUsd: v.usd });
        const deposits = (book.deposits ?? []).map((d) => ({ at: Date.parse(d.at), usd: d.usd })).filter((d) => Number.isFinite(d.at) && Number.isFinite(d.usd));
        return { venue: v.id, name: v.name, startUsd: book.startCashUsd, createdAt: told.createdAt, ...(deposits.length ? { deposits } : {}), rebuilt: told.points, recorded, nowUsd: v.usd, inexact: told.inexact, missing: told.missing };
      }),
    );
    const curve = paperCurve(series, { range, now, events: rows.events.filter((e) => papers.some((v) => v.id === e.venue)), ...(venue ? { venue } : {}) });
    if (!isRefusal(curve)) this.paperCurves.set(key, { at: now, curve });
    return curve;
  }
  private readonly paperCurves = new Map<string, { at: number; curve: PaperHistory }>();

  /** the public bars a paper book's past is told with (live/paper-history.ts paperBarsWanted: every market it held or traded from `fromMs`
   * on, in the finest bars that reach back that far, and a US stock's daily closes whatever the range), each asked of the paper account's
   * own trader (its market's source) and given eight seconds. A market whose bars do not come is left out: its last fill price stands */
  private async paperBars(venue: string, book: PaperBook, fromMs: number, now: number): Promise<PriceSeries[]> {
    const trader = this.liveVenues.get(venue)?.trader;
    if (!trader?.candles) return [];
    const wants = paperBarsWanted(book, fromMs, now);
    const got = await Promise.all(
      wants.map(async (w) => {
        // kept by where the bars start, to the bar of their own size, in a memory bounded by answers and bars (PAPER_BARS_KEPT)
        const k = `${venue}|${w.symbol}|${w.interval}|${Math.floor(w.since / INTERVAL_MS[w.interval])}`;
        const r = await this.paperBarsKept.get(k, PAPER_CURVE_MS, () => within(PAPER_BARS_MS, trader.candles!(w.symbol, w.interval, { since: w.since }), venue, venue));
        const candles = isRefusal(r) ? undefined : Array.isArray(r) ? r : r.bars;
        return { ...w, candles };
      }),
    );
    // a US stock's daily bar is stamped at its session's open (public-stocks.ts): its close is known at the session's end, not a day later
    const sessionClose = (c: Candle): number => c.t + (isEarlyClose(c.t) ? 3.5 : 6.5) * 3_600_000;
    return got
      .filter((g) => g.candles?.length)
      .map((g) => ({ symbol: g.symbol, interval: g.interval, candles: g.candles!, ...(g.interval === "1d" && book.markets[g.symbol]?.kind === "stock" ? { closeAt: sessionClose } : {}) }));
  }
  private readonly paperBarsKept = historyKeep<Candle[] | CandlePage>({ entries: PAPER_BARS_KEPT, most: HISTORY_KEPT_BARS, weigh: pageWeight });

  /** One asset, as the Asset sheet shows it: its holdings row (when it is held), the same thing at every connected venue (live/compare.ts),
   * its price history at the first of them that keeps one, its positions, the account's open orders in it, its statement lines and what was
   * paid for it. `key` is a holdings key (`crypto:BTC`, `equity:AAPL`, `stable:USDC`, `event:<symbol>`); `coin:` and `stock:` are taken for
   * `crypto:` and `equity:`. The price history is in bars of `interval` over `range` (1D … MAX, as the candles read takes it: the Market
   * sheet asks the range its button says), else over the range that bar size alone is drawn over (INTERVAL_RANGE). A read */
  async asset(key: string, interval = "1h", range?: string): Promise<AssetDetail | Refusal> {
    const k = assetKeyOf(key);
    if (!k) return no("E_ACCOUNT_BAD_ACTION", { message: "an asset is named by its key: crypto:BTC, equity:AAPL, stable:USDC, rwa:USDY, event:<symbol>" });
    if (!(CANDLE_INTERVALS as readonly string[]).includes(interval)) return no("E_ACCOUNT_BAD_ACTION", { message: `price history is by ${CANDLE_INTERVALS.join(", ")}` });
    const r = range === undefined ? "" : range.trim().toUpperCase();
    if (r && !(CANDLE_RANGES as readonly string[]).includes(r)) return no("E_ACCOUNT_BAD_ACTION", { message: `a range is one of ${CANDLE_RANGES.join(", ")}` });
    const h = await this.held({ cost: true });
    if (isRefusal(h)) return h;
    const row = h.view.rows.find((r) => r.key === k.key);
    const positions = (h.view.positions ?? []).filter((p) => sameThing(k, p.kind, p.symbol, p.symbol));
    const orders = h.page.orders.filter((o) => !DONE.has(o.status) && sameThing(k, o.kind, o.base, o.symbol));
    const missing: ReadMissing[] = [];
    let compare: Comparison | undefined;
    if (k.cls === "crypto" || k.cls === "equity") {
      const c = await this.liveCompare(k.name, "buy", undefined, k.cls === "equity" ? "stock" : "crypto");
      if (isRefusal(c)) missing.push({ venue: "*", venueName: "every venue", why: c.message, code: c.code, part: "compare" });
      else compare = c;
    }
    const candles = await this.candlesFor(k, interval as CandleInterval, r ? (r as CandleRange) : INTERVAL_RANGE[interval as CandleInterval], compare, positions, row);
    if (candles.missing) missing.push(candles.missing);
    // the statement's lines about it: its orders, and for a dollar the movements of that dollar
    const keys = new Set<string>();
    const { before, now } = this.statementRows();
    for (const r of [...before, ...now]) {
      const n = (r.native ?? {}) as { order?: Partial<LiveOrder>; payment?: Partial<Payment> };
      if (n.order && typeof n.order.kind === "string" && sameThing(k, n.order.kind as MarketKind, String(n.order.base ?? ""), String(n.order.symbol ?? ""))) keys.add(r.detail.key);
      else if (n.payment && (k.cls === "stable" || k.cls === "cash") && [n.payment.token, n.payment.sourceToken].some((t) => typeof t === "string" && t.toUpperCase() === k.name)) keys.add(r.detail.key);
    }
    const lines = keys.size ? this.statement().filter((l) => keys.has(l.key)).slice(0, 50) : [];
    const held = new Set(positions.map((p) => `position:${p.venue}:${p.symbol}`));
    const cost = (h.view.cost ?? []).filter((c) => c.key === k.key || held.has(c.key));
    return { key: k.key, ...(row ? { row } : {}), ...(compare ? { compare } : {}), ...(candles.got ? { candles: candles.got } : {}), positions, orders, lines, cost, missing };
  }

  /** ONE MARKET'S PRICE HISTORY, as the Market sheet, the Trade page's chart and the Asset sheet draw it: at a venue connected live, its
   * trader's own (live/trade.ts candles; a paper account's is its market's public source's); at a venue not connected, its public source's,
   * without a key (live/public-markets.ts: Coinbase Exchange's and OKX's deep histories, Hyperliquid's latest 5,000 bars, the US stocks
   * line's Robinhood, Nasdaq and Cboe bars, Kalshi's public candlesticks, Polymarket's prices-history). `venue` is a venue's id on the
   * account or a public source's id as Markets lists it; `symbol` the market as that venue names it. Bars of 1m, 5m, 15m, 1h, 4h, 1d or 1w.
   * Asked one of two ways:
   *   a range     `range` (1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, MAX), in its own bar size unless one is named (live/history.ts RANGE_BAR) — the
   *               chart's first view: what the range needs, the latest HISTORY_MOST bars at most; neither a range nor `before`: the range of
   *               the bar size (INTERVAL_RANGE: a day of 5m bars, a month of hourly ones, a year of daily ones, as before ranges)
   *   a page      `before` (a bar's start, ms) and `limit` — the chart scrolled left: ONE page of the source's own before that bar, within
   *               its own deadline
   * The answer says whether older bars exist (`more`: ask `before` the first bar), and where the history ends inside what was asked, why
   * (`ends`), whose bars they are and what they are (`source`, `adjustment`, `session`, `folded`, `note`), the stretches with no bars
   * (`gaps`) and a daily bar built from intraday ones (`today`). Each answer kept seconds to minutes in a bounded memory (historyRead). The
   * symbol is only ever handed to the venue's own client or put in a fixed host's query string, encoded: nothing here is asked of a host the
   * symbol names */
  async candles(venue: string, symbol: string, interval: string, ask: { range?: string | undefined; before?: string | number | undefined; limit?: string | number | undefined } = {}): Promise<CandlesView | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const id = venue.trim();
    const sym = symbol.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) return no("E_ACCOUNT_BAD_ACTION", { message: "a venue is named by its id: lower-case letters, digits and dashes" });
    if (!sym || sym.length > 160 || !isPlain(sym)) return no("E_ACCOUNT_BAD_ACTION", { message: "a market is named by its symbol at that venue: 1 to 160 characters of plain text" });
    const asked = historyAsk(interval, ask);
    if (isRefusal(asked)) return asked;
    const { iv, range, before, limit } = asked;
    const now = this.realNow();
    const w: CandleWindow = before !== undefined ? { until: before, limit } : { since: rangeSince(range!, now), limit, range };
    // the window the answer is held to: a US stock's 1D and 5D are its latest sessions (the source counts them so), which may start earlier
    const held: CandleWindow = w.range !== undefined && w.since !== undefined ? { ...w, since: Math.min(w.since, sessionsSince(w.range, now)) } : w;
    const wait = before !== undefined ? PAGE_WAIT_MS : HISTORY_WAIT_MS;
    const said = (page: CandlePage, base: { venue: string; venueName: string; public?: true; from?: string }): CandlesView => ({
      ...base,
      symbol: sym,
      interval: page.interval ?? iv,
      ...(before !== undefined ? { before } : { range }),
      candles: page.bars,
      more: page.more,
      ...(page.partial ? { partial: true as const } : {}),
      ...(page.ends ? { ends: page.ends } : {}),
      ...(page.note ? { note: page.note } : {}),
      ...(page.source ? { source: page.source } : {}),
      ...(page.adjustment ? { adjustment: page.adjustment } : {}),
      ...(page.session ? { session: page.session } : {}),
      ...(page.folded ? { folded: page.folded } : {}),
      ...(page.gaps?.length ? { gaps: page.gaps } : {}),
      ...(page.today ? { today: page.today } : {}),
    });
    const live = this.adapters.get(id)?.account.watchOnly ? this.liveVenues.get(id) : undefined;
    if (live) {
      if (!live.trader) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${live.name}: ${live.noTradeBecause ?? "no markets are read here from the account"}` });
      if (!live.trader.candles) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${live.name} keeps no price history the account can read` });
      const got = await within(wait, this.kept(live).candles!(sym, iv, w), id, live.name);
      if (isRefusal(got)) return got;
      // a paper account's bars are its market's public source's: named, so the chart never calls them the paper account's own — and named
      // as the page names them where they are another exchange's (a Kraken pair's drawn from Coinbase Exchange: barsFrom)
      const named = live.trader.pricesFrom ? await live.trader.pricesFrom(sym).catch(() => undefined) : undefined;
      const page = pageOf(got, iv, held);
      const from = named !== undefined ? barsFrom(page, named, this.publicMarkets().find((x) => x.name === named)?.kind) : undefined;
      return said(page, { venue: id, venueName: live.name, ...(from ? { from } : {}) });
    }
    const src = this.publicMarkets().find((x) => x.id === id);
    if (!src) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: id, message: `"${id.slice(0, 40)}" is neither a venue connected live nor a public market source: Markets names both` });
    if (!src.candles) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${src.name} publishes no price history` });
    // kept under the source's id (`keptPublic`): a source that refused this location is not asked again for ten minutes
    const got = await within(wait, src.candles(sym, iv, w), id, src.name);
    if (isRefusal(got)) return got;
    const page = pageOf(got, iv, held);
    const from = barsFrom(page, src.name, src.kind);
    return said(page, { venue: id, venueName: src.name, public: true, ...(from !== src.name ? { from } : {}) });
  }

  /** ONE MARKET'S ORDER BOOK, as the Trade page's middle panel draws it: at a venue connected live, its trader's own (an exchange's client;
   * a paper account's market's public source, through the paper trader) — and where the trader reads none (Kalshi's, Polymarket's,
   * Hyperliquid's connections), the venue's own public book, read without a key from the public source that names the same connection
   * (`connector`: never another venue's, never Hyperliquid's mainnet for its testnet), asked by the name it knows the market by (twinNames);
   * at a venue not connected, its public source's (live/public-markets.ts). `venue` and `symbol` as `candles` takes them; `depth` levels a
   * side, 1 to 50, best first. A public source made for the connection that knows the market but cannot give its book now — no answer in
   * time, a place rule, a market it holds no book for — says so in its own words: its refusal is the answer, never a lesser book in its place.
   * Only where no book is read here at all (no such source, or none that knows this market: Hyperliquid's spot, its testnet; a broker; a
   * source with no book) is the market shown as what it carries: its best bid and best ask (`depth: "top"`, no size, since none is given),
   * named by the source its quote came from, stamped with the quote's own time, and with why that is all (`topOnly`: "none" where the source
   * publishes no depth at all — US stocks' public quotes — else "unread": it has a book the account does not read); one with neither says
   * so. Each answer kept a second and a half (BOOK_KEEP_MS), so the page's poll every two seconds asks the venue once. A read */
  async marketBook(venue: string, symbol: string, depth = 20): Promise<BookView | Refusal> {
    const asked = this.oneMarket(venue, symbol);
    if (isRefusal(asked)) return asked;
    const { id, sym } = asked;
    if (!(Number.isInteger(depth) && depth >= 1 && depth <= 50)) return no("E_ACCOUNT_BAD_ACTION", { message: "a book is read 1 to 50 levels a side" });
    const now = this.realNow();
    const live = this.adapters.get(id)?.account.watchOnly ? this.liveVenues.get(id) : undefined;
    if (live) {
      const t = live.trader;
      if (!t) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${live.name}: ${live.noTradeBecause ?? "no markets are read here from the account"}` });
      // a paper account whose market's source has no book says whether that source has none at all (live/paper.ts book)
      let topOnly: TopOnly = "unread";
      if (t.book) {
        const got = await within(BOOK_WAIT_MS, this.marketReads.get(`book|${id}|${sym}|${depth}`, BOOK_KEEP_MS, () => t.book!(sym, depth).catch((err: unknown) => thrownBy(id, live.name, err)), id, true), id, live.name);
        if (!noBookAt(got)) return isRefusal(got) ? got : { venue: id, venueName: live.name, symbol: sym, book: got };
        if ((got.detail as { topOnly?: unknown } | undefined)?.topOnly === "none") topOnly = "none";
      } else {
        // the venue's own public book, where a public source speaks for this very connection and knows the market
        const got = await this.twinRead(live, id, sym, "book", depth);
        if (got !== undefined) return isRefusal(got) ? got : { venue: id, venueName: live.name, symbol: sym, book: got as OrderBook };
      }
      // no book read here: the best bid and ask the market itself carries, as that. A paper account's comes from its source's listing, kept up
      // to LISTED_QUOTE_UP_TO_MS by then, and its market kept MARKET_KEEP_MS more here: where the quote carries no time of its own, the page
      // is told how old it may be
      const m = await within(BOOK_WAIT_MS, this.kept(live).market(sym), id, live.name);
      if (isRefusal(m)) return m;
      const top = topBook(m, live.name, now, topOnly, this.adapters.get(id)?.account.connector === "live:paper" ? LISTED_QUOTE_UP_TO_MS + MARKET_KEEP_MS : undefined);
      return top ? { venue: id, venueName: live.name, symbol: sym, book: top } : no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${live.name}: ${topOnly === "none" ? "its source publishes no order book" : "the account reads no order book there"}, and gives no best bid or ask for ${sym.slice(0, 60)} just now` });
    }
    const src = this.publicMarkets().find((x) => x.id === id);
    if (!src) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: id, message: `"${id.slice(0, 40)}" is neither a venue connected live nor a public market source: Markets names both` });
    if (src.book) {
      const got = await this.publicRead(src, "book", sym, depth);
      return isRefusal(got) ? got : { venue: id, venueName: src.name, symbol: sym, book: got as OrderBook, public: true };
    }
    // a source with no book: its listing's best bid and ask (the listings are kept as Markets keeps them). US stocks' public quotes have no
    // depth at all; the others (Stock Tokens, xStocks at Gate, the exchanges' pre-IPO contracts) have a book the account does not read
    const topOnly: TopOnly = src.kind === "stocks" ? "none" : "unread";
    const listed = await within(BOOK_WAIT_MS, src.listings({ q: sym, limit: 20 }), id, src.name);
    if (isRefusal(listed)) return listed;
    const m = listed.find((x) => x.symbol === sym);
    if (!m) return no("E_VENUE_REJECTED", { venue: id, message: `${src.name} lists no market ${sym.slice(0, 60)} just now` });
    const top = topBook(m, src.name, now, topOnly, LISTED_QUOTE_UP_TO_MS);
    return top ? { venue: id, venueName: src.name, symbol: sym, book: top, public: true } : no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${topOnly === "none" ? `${src.name} publishes no order book` : `The account reads no order book from ${src.name}`}, and it gives no best bid or ask for ${sym.slice(0, 60)} just now` });
  }

  /** ONE MARKET'S LATEST TRADES, newest first, `limit` of them at most (1 to 100), from where `marketBook` reads its book: a connected venue's
   * trader, else the public source that names the same connection (its refusal, where it knows the market, is the answer), else — a venue
   * not connected — its public source. A trade's side only where the source says which side took. Kept three seconds (TRADES_KEEP_MS). A
   * read.
   *
   * A venue or source that publishes no trades at all (a US stock's public quote; a paper account's market priced from one; a connection
   * with neither a trades read nor a public twin) is not refused: that is the source's fact, as a book that is only its best bid and ask is
   * answered as that. The answer is an empty list with `none`, the sentence saying so ("US stocks publishes no trades the account can
   * read"), and the page's Trades tab shows the sentence and stops asking until the market changes. Every other refusal — no answer in
   * time, a place rule, a market the source does not list — stays the refusal it is */
  async marketTrades(venue: string, symbol: string, limit = 30): Promise<TradesView | Refusal> {
    const asked = this.oneMarket(venue, symbol);
    if (isRefusal(asked)) return asked;
    const { id, sym } = asked;
    if (!(Number.isInteger(limit) && limit >= 1 && limit <= 100)) return no("E_ACCOUNT_BAD_ACTION", { message: "the latest trades are read 1 to 100 at a time" });
    const live = this.adapters.get(id)?.account.watchOnly ? this.liveVenues.get(id) : undefined;
    if (live) {
      const t = live.trader;
      if (!t) return no("E_VENUE_RAIL_CLOSED", { venue: id, message: `${live.name}: ${live.noTradeBecause ?? "no markets are read here from the account"}` });
      if (t.trades) {
        const got = await within(BOOK_WAIT_MS, this.marketReads.get(`trades|${id}|${sym}|${limit}`, TRADES_KEEP_MS, () => t.trades!(sym, limit).catch((err: unknown) => thrownBy(id, live.name, err)), id, true), id, live.name);
        // a paper account's market priced from a source with no trades (live/paper.ts trades: "Paper: US stocks publishes no trades") is
        // that source's fact, said as one; the paper account's own name is dropped, since the sentence is about the source
        const none = isRefusal(got) ? noTradesSaid(got, live.name) : undefined;
        if (none !== undefined) return { venue: id, venueName: live.name, symbol: sym, trades: [], none };
        return isRefusal(got) ? got : { venue: id, venueName: live.name, symbol: sym, trades: got };
      }
      const got = await this.twinRead(live, id, sym, "trades", limit);
      if (got !== undefined) return isRefusal(got) ? got : { venue: id, venueName: live.name, symbol: sym, trades: got as PublicTrade[] };
      return { venue: id, venueName: live.name, symbol: sym, trades: [], none: `${live.name} publishes no trades the account can read` };
    }
    const src = this.publicMarkets().find((x) => x.id === id);
    if (!src) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: id, message: `"${id.slice(0, 40)}" is neither a venue connected live nor a public market source: Markets names both` });
    if (!src.trades) return { venue: id, venueName: src.name, symbol: sym, trades: [], none: `${src.name} publishes no trades the account can read`, public: true };
    const got = await this.publicRead(src, "trades", sym, limit);
    return isRefusal(got) ? got : { venue: id, venueName: src.name, symbol: sym, trades: got as PublicTrade[], public: true };
  }

  /** the public sources that speak for the connection venue `id` was made with (the same `connector`: Kalshi's for live:kalshi, Hyperliquid's
   * perpetuals and its HIP-3 deployers' for live:hyperliquid-trade — and none for its testnet's live:hyperliquid-paper) */
  private publicTwins(id: string): PublicSource[] {
    const connector = this.adapters.get(id)?.account.connector;
    return connector ? this.publicMarkets().filter((s) => s.connector === connector) : [];
  }

  /** A connected venue's book or trades from the public sources made for its connection (publicTwins), each asked by the name it knows the
   * market by (twinNames): the first answer. Else the first refusal of a source that knows the market — no answer in time, a place rule, a
   * market it holds no book for: the venue's own words, the answer. Nothing (undefined) when there is no such source with the read, or none
   * of them names this market at all — each turned the NAME away (E_ACCOUNT_BAD_ACTION: Hyperliquid's perpetuals asked for its spot) — so
   * the caller uses what the connected market itself carries */
  private async twinRead(live: LiveVenue, id: string, sym: string, what: "book" | "trades", n: number): Promise<OrderBook | PublicTrade[] | Refusal | undefined> {
    const twins = this.publicTwins(id).filter((x) => (what === "book" ? x.book : x.trades));
    if (!twins.length) return undefined;
    const names = await this.twinNames(live, id, sym);
    let said: Refusal | undefined;
    for (const twin of twins) {
      for (const name of names) {
        const got = await this.publicRead(twin, what, name, n);
        if (!isRefusal(got)) return got;
        if (got.code !== "E_ACCOUNT_BAD_ACTION") said ??= got;
      }
    }
    return said;
  }

  /** The names the public sources made for a connection know one of its markets by: its own — and, for a perpetual the connection names
   * the exchange library's way (BASE/QUOTE:SETTLE), first the name the perpetual listings give it. That is Hyperliquid's connection: its
   * trader names a market as the library does (BTC/USDC:USDC, XYZ-NVDA/USDC:USDC — the coin in capitals, a HIP-3 one's dex before it with
   * a dash), its public listings by Hyperliquid's own coin (BTC-PERP, xyz:NVDA-PERP, kPEPE-PERP: its letters as Hyperliquid writes them).
   * So the perpetual is named by the coin the connected market carries in `base` — Hyperliquid's own letters (hyperliquid-trade.ts) — with
   * its dex in small letters, as every HIP-3 dex is written (perpDexs, live 2026-10-14: xyz, flx, vntl, hyna, km, abcd, cash, para, mkts,
   * io). The other connections that read their books here (Kalshi's, Polymarket's) name a market as their listings do; a spot market keeps
   * its name (no public source here lists Hyperliquid's spot) */
  private async twinNames(live: LiveVenue, id: string, sym: string): Promise<string[]> {
    const lib = /^([^/:]+)\/[^/:]+:[^/:]+$/.exec(sym);
    if (!lib) return [sym];
    const m = await within(BOOK_WAIT_MS, this.kept(live).market(sym), id, live.name);
    if (isRefusal(m) || m.kind !== "perp" || !m.base || !/^[A-Za-z0-9][A-Za-z0-9._]{0,30}$/.test(m.base)) return [sym];
    const head = lib[1]!.toUpperCase();
    const coin = m.base;
    if (head === coin.toUpperCase()) return [`${coin}-PERP`, sym];
    const tail = `-${coin.toUpperCase()}`;
    return head.endsWith(tail) && head.length > tail.length ? [`${head.slice(0, -tail.length).toLowerCase()}:${coin}-PERP`, sym] : [sym];
  }

  /** a public source's book or trades through the read cache, held under the source's name as its other reads are (a source that reads
   * them from another host than its listings, apart: `#history`), within BOOK_WAIT_MS */
  private publicRead(src: PublicSource, what: "book" | "trades", sym: string, n: number): Promise<OrderBook | PublicTrade[] | Refusal> {
    const at = `public:${src.id}${src.historyApart ? "#history" : ""}`;
    const load = (): Promise<OrderBook | PublicTrade[] | Refusal> => (what === "book" ? src.book!(sym, n) : src.trades!(sym, n)).catch((err: unknown) => thrownBy(src.id, src.name, err));
    return within(BOOK_WAIT_MS, this.marketReads.get(`public-${what}|${src.id}|${sym}|${n}`, what === "book" ? BOOK_KEEP_MS : TRADES_KEEP_MS, load, at), src.id, src.name);
  }

  /** a venue and a market as the book and the trades take them (as `candles` does): a venue's id, and the market as plain text */
  private oneMarket(venue: string, symbol: string): { id: string; sym: string } | Refusal {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const id = venue.trim();
    const sym = symbol.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) return no("E_ACCOUNT_BAD_ACTION", { message: "a venue is named by its id: lower-case letters, digits and dashes" });
    if (!sym || sym.length > 160 || !isPlain(sym)) return no("E_ACCOUNT_BAD_ACTION", { message: "a market is named by its symbol at that venue: 1 to 160 characters of plain text" });
    return { id, sym };
  }

  /** price history for the Asset sheet: at the first venue in the comparison whose trader keeps it (its spot or stock market before a
   * perpetual), or — an event contract — at a venue that holds it; at most two venues are asked, each within its time. A coin no connected
   * venue keeps a history of (a wallet's, a by-address venue's) is then asked of the exchanges' keyless public bars, as the Market sheet
   * reads them — its dollar pair at the first two sources that publish one. Only when every source refused is there none, in their words.
   * Over `range`: the one the sheet asked, or the range of the bar size alone (live/history.ts INTERVAL_RANGE) */
  private async candlesFor(k: AssetKey, interval: CandleInterval, range: CandleRange, compare: Comparison | undefined, positions: VenuePosition[], row: HeldRow | undefined): Promise<{ got?: CandleSeries; missing?: ReadMissing }> {
    const tries: Array<{ v: LiveVenue; symbol: string }> = [];
    const add = (venue: string, symbol: string) => {
      const v = this.liveVenues.get(venue);
      if (v?.trader?.candles && this.adapters.get(venue)?.account.watchOnly && !tries.some((t) => t.v.id === venue && t.symbol === symbol)) tries.push({ v, symbol });
    };
    for (const r of compare?.rows ?? []) if (r.kind !== "perp") add(r.venue, r.symbol);
    for (const r of compare?.rows ?? []) if (r.kind === "perp") add(r.venue, r.symbol);
    if (k.cls === "event") {
      for (const p of positions) add(p.venue, p.symbol);
      for (const l of row?.venues ?? []) add(l.venue, row!.asset);
    }
    const w: CandleWindow = { since: rangeSince(range, this.realNow()), limit: HISTORY_MOST, range };
    const barsOf = (got: Candle[] | CandlePage): CandlePage => pageOf(got, interval, { ...w, since: Math.min(w.since!, sessionsSince(range, this.realNow())) });
    let missing: ReadMissing | undefined;
    for (const t of tries.slice(0, 2)) {
      const got = await within(CANDLE_MS, this.kept(t.v).candles!(t.symbol, interval, w), t.v.id, t.v.name);
      if (isRefusal(got)) missing ??= { venue: t.v.id, venueName: t.v.name, why: got.message, code: got.code, part: "candles" };
      else {
        const page = barsOf(got);
        if (page.bars.length) return { got: { venue: t.v.id, venueName: t.v.name, symbol: t.symbol, interval: page.interval ?? interval, bars: page.bars, ...(page.source ? { source: page.source } : {}) } };
      }
    }
    if (k.cls === "crypto") {
      // the public exchanges that serve this network, in turn, until two have answered: a source held back (its place rule, a ban) is not
      // asked, one that refuses is passed over, and a place rule is never what is said in place of a chart
      let answered = 0;
      for (const s of this.publicMarkets().filter((x) => x.kind === "exchange" && x.candles && !this.marketReads.heldOf(`public:${x.id}`))) {
        if (answered >= 2) break;
        let refused = false;
        for (const quote of ["USD", "USDT", "USDC"]) {
          const symbol = `${k.name}/${quote}`;
          const got = await within(CANDLE_MS, s.candles!(symbol, interval, w), s.id, s.name);
          if (isRefusal(got)) {
            if (got.code !== "E_VENUE_GEOBLOCKED") missing ??= { venue: s.id, venueName: s.name, why: got.message, code: got.code, part: "candles" };
            if (holdBackMs(got) > 0) {
              refused = true;
              break;
            }
          } else {
            const page = barsOf(got);
            if (page.bars.length) return { got: { venue: s.id, venueName: s.name, symbol, interval: page.interval ?? interval, bars: page.bars, public: true, ...(page.source ? { source: page.source } : {}) } };
          }
        }
        if (!refused) answered++;
      }
    }
    return missing ? { missing } : {};
  }

  /** TRADE · Sell many: everything held that is not a dollar, venue by venue, with what selling all of it there would sign — a sell order in
   * a dollar market at that venue (a wallet's token in its pair with USDC on the chain it is held on), its size down to the market's step;
   * a perpetual or a future, its close; an event contract, its shares sold. Each says whether an order could go now, and if not why.
   * Nothing is placed: each one is still an order the owner signs, or an agent places inside its limit */
  async sellable(): Promise<{ items: Sellable[]; missing: ReadMissing[] } | Refusal> {
    const page = await this.accountView();
    if (!page) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const writes = page.connectLive?.writes?.on === true;
    const { rows } = byAsset(page.venues, { writes });
    const pos = await this.allPositions();
    if (isRefusal(pos)) return pos;
    const listsPositions = new Set(this.tradingVenues().filter((v) => v.trader!.positions).map((v) => v.id));
    const jobs: Array<Promise<Sellable>> = [];
    for (const row of rows) {
      // a dollar is not sold; money in an earn product is taken out first (a liveEarn withdraw), then sold
      if (row.class === "stable" || row.class === "cash" || row.class === "earn") continue;
      // an event contract at a venue that lists positions is sold from its position, below
      for (const line of row.venues) if (!(row.class === "event" && listsPositions.has(line.venue))) jobs.push(this.sellLine(row, line, writes));
    }
    for (const p of pos.positions) if (p.kind === "perp" || p.kind === "future" || p.kind === "event") jobs.push(this.sellPosition(p, writes));
    const items = (await Promise.all(jobs)).sort((a, b) => Number(b.ready) - Number(a.ready) || (b.usd ?? 0) - (a.usd ?? 0));
    return { items, missing: pos.missing };
  }

  /** what selling one venue's part of a holding would sign there */
  private async sellLine(row: AssetRow, line: AssetRow["venues"][number], writes: boolean): Promise<Sellable> {
    const base = { key: row.key, asset: row.asset, venue: line.venue, venueName: line.venueName, action: "sell" as const, held: line.amount };
    const not = (why: string): Sellable => ({ ...base, sellQty: 0, ready: false, why });
    if (line.inTransit) return not("on its way: it is not at the venue yet");
    if (line.watched) return not("a watched address: nothing is sold from it here");
    const v = this.liveVenues.get(line.venue);
    if (!v?.trader || !this.adapters.get(line.venue)?.account.watchOnly) return not(v?.noTradeBecause ?? "no orders are placed here from the account");
    const t = this.kept(v);
    const found = row.class === "event" ? await t.market(row.asset) : await dollarMarket(t, row, line);
    if (isRefusal(found)) return not(found.message);
    if (!found) return not(`${v.name} lists no dollar market for ${row.asset}${line.note ? ` (${line.note.split(" · ")[0]})` : ""}`);
    const fresh = row.class === "event" ? found : await t.market(found.symbol);
    const m = isRefusal(fresh) ? found : fresh;
    return this.sellOf(base, v, m, line.amount, writes);
  }

  /** a position's way out: a perpetual or a future closed at its venue, an event contract's shares sold */
  private async sellPosition(p: VenuePosition, writes: boolean): Promise<Sellable> {
    const v = this.liveVenues.get(p.venue)!;
    const base = { key: `position:${p.venue}:${p.symbol}`, asset: p.kind === "event" ? p.name : normalBase(p.symbol, p.kind) || p.symbol, venue: p.venue, venueName: p.venueName ?? v.name, held: p.qty };
    if (p.kind === "event") {
      const m = await this.kept(v).market(p.symbol);
      if (isRefusal(m)) return { ...base, action: "sell", symbol: p.symbol, kind: p.kind, side: p.side, sellQty: 0, ready: false, why: m.message };
      return this.sellOf({ ...base, action: "sell" }, v, m, p.qty, writes);
    }
    const why = !writes ? "this server was started read-only" : v.trader!.can === false ? (v.trader!.whyNot ?? "this key may not trade") : undefined;
    return { ...base, action: "close", symbol: p.symbol, kind: p.kind, side: p.side, sellQty: p.qty, ...(p.markPrice !== undefined ? { price: p.markPrice } : {}), ...(p.usd !== undefined ? { usd: r2(p.usd) } : {}), ready: why === undefined, ...(why ? { why } : {}) };
  }

  /** a sell of `held` in market `m`: down to its step, at its bid (its price where it shows no book), and whether it could go now */
  private sellOf(base: Omit<Sellable, "sellQty" | "ready" | "symbol" | "kind" | "price" | "usd" | "why">, v: LiveVenue, m: Market, held: number, writes: boolean): Sellable {
    const qty = floorTo(held, m.qtyStep);
    const price = m.bid ?? m.price;
    const usd = price !== undefined ? r2(qty * price * (m.contractSize ?? 1)) : undefined;
    const why = !writes ? "this server was started read-only" : v.trader!.can === false ? (v.trader!.whyNot ?? "this key may not trade") : !m.open ? (m.note ?? "the market is closed now") : !(qty > 0) ? "less than one step of size" : m.minQty !== undefined && qty < m.minQty ? `below the smallest order there (${m.minQty} ${m.base})` : m.minNotional !== undefined && usd !== undefined && usd < m.minNotional ? `below the smallest order there ($${m.minNotional})` : undefined;
    return { ...base, symbol: m.symbol, kind: m.kind, sellQty: qty, ...(price !== undefined ? { price } : {}), ...(usd !== undefined ? { usd } : {}), ready: why === undefined, ...(why ? { why } : {}) };
  }

  /** a fresh price for each of a few markets at venues connected live (each kept three seconds, as the order ticket's): what the page polls
   * for the cards it shows */
  async quotes(pairs: Array<{ venue: string; symbol: string }>): Promise<Array<{ venue: string; symbol: string; market?: Market; refusal?: Refusal }> | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    if (!pairs.length || pairs.length > 12) return no("E_ACCOUNT_BAD_ACTION", { message: "quotes are asked for 1 to 12 markets at once, each venue|symbol" });
    return Promise.all(pairs.map(async (p) => {
      const r = await this.liveMarket(p.venue, p.symbol);
      return isRefusal(r) ? { ...p, refusal: r } : { ...p, market: r };
    }));
  }

  /** THE AGENTS, one by one — what the Agent module reads: each key's standing and expiry, each limit the owner signed for it with what is
   * spent, held and left, the cards it is waiting on, its orders, its payments, its wallets, the owner's intents addressed to it (or to
   * every agent) and what it has asked the owner for, and its recent flights. Keys that asked to be let in are in `requests`. A read: what
   * an agent may do is still only what its limits and the owner's cards say */
  async agents(): Promise<AgentsView | Refusal> {
    const page = await this.accountView();
    if (!page) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    // a key approved again after its first approval ran out is listed twice: the later approval is the one that stands
    const keys = new Map<string, AccountPage["keys"][number]>();
    for (const k of page.keys) {
      const was = keys.get(k.address);
      if (!was || Date.parse(k.approvedAt) >= Date.parse(was.approvedAt)) keys.set(k.address, k);
    }
    const agents: AgentView[] = [...keys.values()].map((k) => ({
      address: k.address,
      name: k.name,
      code: k.code,
      status: k.status,
      validUntil: k.validUntil,
      approvedAt: k.approvedAt,
      limits: page.spend.filter((s) => s.agent === k.address).map((s) => ({ id: s.id, scope: s.scope, allow: s.allow, perPaymentUsd: s.perPaymentUsd, budgetUsd: s.budgetUsd, spentUsd: s.spentUsd, reservedUsd: s.reservedUsd, leftUsd: Number(Math.max(0, s.budgetUsd - s.spentUsd - s.reservedUsd).toFixed(6)), windowHours: s.windowHours, validUntil: s.validUntil, expired: s.expired })),
      cards: page.cards.filter((c) => c.agent === k.address),
      orders: page.orders.filter((o) => o.agent === k.address).slice(0, 20),
      payments: page.payments.filter((p) => p.agent === k.address).slice(0, 20),
      earns: page.earns.filter((e) => e.agent === k.address).slice(0, 20),
      wallets: page.subAccounts.filter((s) => s.agent === k.address).map((s) => {
        const venue = agentWalletVenue(s.name);
        const live = page.venues.find((v) => v.id === venue);
        return { ...s, venue, ...(live ? { usd: live.usd } : {}) };
      }),
      intents: page.intents.filter((i) => i.agent === k.address || i.agent === "*"),
      asks: page.asks.filter((a) => a.agent === k.address),
      declinedAsks: page.declinedAsks.filter((a) => a.agent === k.address),
      memory: this.memory ? { notes: this.memory.notes(k.address).filter((n) => !n.waiting).length, waiting: this.memory.notes(k.address).filter((n) => n.waiting).length } : { notes: 0, waiting: 0 },
      flights: this.flights.filter((f) => f.agent.name === k.name && f.agent.code === k.code).slice(-10).reverse().map((f) => ({ no: f.no, at: f.at, request: f.request, legs: f.legs.map((l) => `${l.mark === "ok" ? "✓" : l.mark === "no" ? "✗" : l.mark === "wait" ? "▣" : "·"} ${l.text}`) })),
    }));
    // the mode as every other read wires it (`guard` is Guard, `open` is Beast): the page puts the words on it
    return { asOf: page.now, mode: this.openness.mode === "open" ? "open" : "guard", agents, requests: page.requests };
  }

  /** MEMORY, as the owner reads it (Account › Memory; the canvas's F13): each agent the account let in (an earlier key included) and any
   * whose memory outlived its key — its notes (the waiting ones too), the owner's switches for it, and what its limits say as they stand */
  memoryView(): MemoryPage | Refusal {
    if (!this.account || !this.memory) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const nowMs = Date.parse(this.now());
    // the key that stands for an address, when there is one; else its latest
    const keys = new Map<string, { name: string; code: string; status: string }>();
    for (const k of this.account.state.agents) {
      const status = agentStatus(this.account.state, k.address, nowMs);
      if (!keys.has(k.address) || status === "ok") keys.set(k.address, { name: k.name, code: k.code, status });
    }
    const addresses = [...new Set([...keys.keys(), ...this.memory.agents()])];
    return {
      asOf: this.now(),
      agents: addresses.map((address) => {
        const k = keys.get(address);
        return { address, name: k?.name ?? "", code: k?.code ?? "", status: k?.status ?? "gone", rules: this.memory!.rules(address), notes: this.memory!.notes(address), fromLimits: this.memoryLimits(address) };
      }),
      limits: MEMORY_LIMITS,
    };
  }

  /** MEMORY, as one agent reads it (portfolio_memory): its notes kept, the ones waiting for the owner, what its limits say, and the memory of
   * every other agent whose owner's switch shares it; `q` narrows the notes to what mentions it. Words, never a permission */
  memoryFor(address: string, o: { q?: string | undefined } = {}): AgentMemoryView | Refusal {
    if (!this.account || !this.memory) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const a = address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) return no("E_ACCOUNT_BAD_ACTION", { message: "an agent's memory is read by the address of its key" });
    const own = this.memory.notes(a);
    const shared = this.memory.agents().filter((x) => x !== a && this.memory!.rules(x).share);
    return {
      asOf: this.now(),
      rules: this.memory.rules(a),
      notes: MemoryStore.matching(own.filter((n) => !n.waiting), o.q),
      waiting: own.filter((n) => n.waiting),
      fromLimits: this.memoryLimits(a),
      sharedWithYou: shared.map((x) => ({ agent: x, name: this.account!.agentName(x), notes: MemoryStore.matching(this.memory!.notes(x).filter((n) => !n.waiting), o.q) })).filter((x) => x.notes.length),
      limits: MEMORY_LIMITS,
    };
  }

  /** the agents' notes waiting for the owner (the switch "ask me first"), as Waiting for you shows them */
  memoryAsks(): Array<{ agent: string; agentName: string; id: string; topic: Topic; text: string; how?: string | undefined; at: string }> {
    if (!this.account || !this.memory) return [];
    return this.memory.waiting().map(({ address, note }) => ({ agent: address, agentName: this.account!.agentName(address), id: note.id, topic: note.topic, text: note.text, ...(note.how ? { how: note.how } : {}), at: note.at }));
  }

  /** "From your limit" (F13): what the owner's signed limits for this agent say, as they stand, and the mode — written out by the account,
   * kept nowhere, so never out of date; changed only by changing the limit or the mode */
  private memoryLimits(address: string): MemoryFromLimit[] {
    if (!this.account) return [];
    const nowMs = Date.parse(this.now());
    const dollars = (micro: number) => `$${(micro / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    const where = (allow: string[]) => (allow.includes("*") ? "every venue" : allow.map((v) => this.account!.name(v.split(":")[0]!)).join(", "));
    const items: MemoryFromLimit[] = this.account.state.spends
      .filter((x) => x.agent === address && x.revokedAt === undefined && x.budgetMicro > 0 && nowMs < x.validUntil)
      .map((x) => {
        const words =
          x.scope === "trade"
            ? `Up to ${dollars(x.perPaymentMicro)} an order, ${dollars(x.budgetMicro)} in all, at ${where(x.allow)}`
            : x.scope === "venues"
              ? `Moves money between your own accounts (${where(x.allow)}): up to ${dollars(x.perPaymentMicro)} a move, ${dollars(x.budgetMicro)} in all`
              : x.scope === "payees"
                ? `Pays ${x.allow.includes("*") ? "any payee" : x.allow.join(", ")} from its wallet: up to ${dollars(x.perPaymentMicro)} a payment, ${dollars(x.budgetMicro)} in all`
                : `Puts money into earn at ${where(x.allow)}: up to ${dollars(x.perPaymentMicro)} at a time, ${dollars(x.budgetMicro)} in all`;
        return { id: x.id, from: "limit" as const, topic: "rules" as const, text: `${words} · until ${etDate(x.validUntil)}`, at: x.at };
      });
    if (!items.length) return items;
    const open = this.openness.mode === "open";
    return [...items, { id: "mode", from: "mode", topic: "rules", text: open ? "Inside its limits it acts at once: your mode is Beast" : "Real money goes through you first: every order waits for you on a card (Guard)" }];
  }

  /** every order the account ever placed, as last logged, with each row at which more of it filled (account/costbasis.ts ordersOf): every run's */
  private allOrders(): LoggedOrder[] {
    const { before, now } = this.statementRows();
    return ordersOf([...before, ...now].map((r) => ({ kind: "statement", native: r.native })));
  }

  /** what a live connection reaches: the real network, unless a test handed in stand-ins */
  // ---- THE LAB (backtest/lab.ts): backtests run, kept and counted ----

  /** a backtest under way: the service runs one at a time */
  private labBusy = false;
  private labSources: HistorySources | undefined;
  /** the lab's reach: the home, the bars kept in it, the keyless sources they are read from (over the service's own network), its clock */
  private labDeps(): LabDeps {
    const deps = this.liveDeps();
    return { home: this.opts.home, cache: join(this.opts.home, "history"), sources: this.opts.backtest?.sources ?? (this.labSources ??= realHistorySources({ http: deps.http, open: deps.openExchange, clock: deps.clock })), clock: () => Date.parse(this.now()) };
  }
  /** one backtest at a time, whoever asks */
  private async labOnce<T>(run: () => Promise<T | Refusal>): Promise<T | Refusal> {
    if (this.labBusy) return no("E_ACCOUNT_LIMIT", { message: "a backtest is running: the account runs one at a time — ask again when it is done", detail: { busy: true } });
    this.labBusy = true;
    try {
      return await run();
    } finally {
      this.labBusy = false;
    }
  }

  /** A BACKTEST AN UNSIGNED REQUEST ASKS FOR (POST /api/account/backtest; an agent's portfolio_backtest): a TRAINING run — its window
   * ends at the holdout's start at the latest, and nothing unsigned runs on the held-out data — counted in the ledger with the seat it
   * names, and kept in the home. The answer is the run's figures and how it is judged; its trades and curve are in the kept run. One at a
   * time, at most BACKTEST_API_WORK steps across its markets */
  async backtestRun(body: Record<string, unknown>): Promise<Record<string, unknown> | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const ask = askOf(body);
    if (typeof ask === "string") return no("E_ACCOUNT_BAD_ACTION", { message: ask });
    return this.labOnce(async () => {
      const out = await labRun({ ...ask, window: "train", save: true, by: "request", maxSteps: this.opts.backtest?.maxSteps ?? Math.floor(BACKTEST_API_WORK / ask.refs.length) }, this.labDeps());
      return isRefusal(out) ? out : outcomeSummary(out);
    });
  }
  /** A WALK-FORWARD AN UNSIGNED REQUEST ASKS FOR (POST /api/account/backtest/walk; an agent's portfolio_backtest_walk): a grid's best on
   * each fold's past, tried on the fold, the folds chained (backtest/walk.ts) — on training data only, every try counted in the ledger with
   * the seat it names, the out-of-sample runs kept. One backtest at a time across the account, at most BACKTEST_WALK_WORK steps across its
   * markets over all its runs */
  async backtestWalk(body: Record<string, unknown>): Promise<Record<string, unknown> | Refusal> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    const ask = walkAskOf(body);
    if (typeof ask === "string") return no("E_ACCOUNT_BAD_ACTION", { message: ask });
    return this.labOnce(async () => {
      const w = await labWalkForward({ ...ask, by: "request", maxWork: this.opts.backtest?.maxWalkWork ?? BACKTEST_WALK_WORK }, this.labDeps());
      return isRefusal(w) ? w : walkSummary(w);
    });
  }
  /** THE LEDGER as it stands: the holdout, the rows and whether their chain holds, how many runs and distinct strategies, the latest runs */
  backtests(limit = 50): (ReturnType<typeof labList> & { catalog: Record<string, unknown> }) | Refusal {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    return {
      ...labList(this.opts.home, Date.parse(this.now()), limit),
      catalog: {
        ...labCatalog(),
        walk: { folds: WALK_FOLDS, combosMost: WALK_COMBOS_MOST, runsMost: WALK_RUNS_MOST, mostWork: this.opts.backtest?.maxWalkWork ?? BACKTEST_WALK_WORK },
        // the desk itself: its numbers as a strategy's are shown, run by the owner's signature only
        desk: { name: DESK_NAME, words: DESK_WORDS, params: DESK_PARAMS, intervals: DESK_INTERVALS, mostSteps: this.opts.backtest?.maxDeskSteps ?? BACKTEST_DESK_STEPS, by: "the owner's signature" },
      },
    };
  }
  /** one kept run in full — its trades, its curve, its notes — with its trial and how it is judged against the ledger now */
  backtestKept(id: string): Record<string, unknown> | Refusal {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted" });
    return labRead(this.opts.home, id.trim());
  }
  /** the owner's signed setBacktest, once the door has checked it: the holdout moved, a training run tried on the held-out data, or the
   * desk run over the training data */
  private async labAct(a: Extract<OwnerAction, { type: "setBacktest" }>): Promise<Refusal | { ok: true; summary: string; data?: unknown }> {
    if (a.change === "holdout") {
      // never while a backtest runs: a run that read the holdout before it moved would be counted as tried before it, over days it now holds out
      const h = await this.labOnce(async () => setHoldout(this.opts.home, a.value, "owner", Date.parse(this.now())));
      return isRefusal(h) ? h : { ok: true, summary: `the data from ${h.start} on is held out` };
    }
    if (a.change === "evaluate") {
      const out = await this.labOnce(() => labEvaluate(a.value.trim(), this.labDeps(), "owner"));
      if (isRefusal(out)) return out;
      return { ok: true, summary: `run ${a.value.trim()} tried on the held-out data from ${out.holdout.start}: look ${out.looks ?? 1} at it`, data: outcomeSummary(out, { curve: true }) };
    }
    if (a.change === "desk") {
      // THE DESK ITSELF over the training data, by the owner's signature: a whole account built to trade in and let go (backtest/desk.ts), a
      // minute and more of stepping — not for an unsigned request, which any program that reaches the account can send. A training run like
      // any other, counted and kept, its figures read back by anyone; the owner looks at the held-out data with it after, as with any
      const ask = deskAskOf(a.value);
      if (typeof ask === "string") return no("E_ACCOUNT_BAD_ACTION", { message: ask });
      const out = await this.labOnce(() => labRun({ ...ask, window: "train", benchmark: true, save: true, by: "owner", maxSteps: this.opts.backtest?.maxDeskSteps ?? BACKTEST_DESK_STEPS }, this.labDeps()));
      if (isRefusal(out)) return out;
      return { ok: true, summary: `the desk ran over ${out.trial.markets.join(", ")} from ${out.trial.from.slice(0, 10)} to ${out.trial.to.slice(0, 10)} as run ${out.id}`, data: outcomeSummary(out) };
    }
    return no("E_ACCOUNT_BAD_ACTION", { message: LAB_CHANGES(a.change) });
  }
  /** what a setBacktest would do, in words, for the dialog before it is signed — or why not, as the door would say it (the desk's steps
   * counted from its window, so a run past them is refused before it is signed) */
  private labWords(a: Extract<OwnerAction, { type: "setBacktest" }>): Refusal | { words: string } {
    const now = Date.parse(this.now());
    const h = readHoldout(this.opts.home, now);
    if (isRefusal(h)) return h;
    const ledger = readTrials(this.opts.home).rows;
    if (a.change === "holdout") {
      const day = a.value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return no("E_ACCOUNT_BAD_ACTION", { message: `a holdout starts on a day, YYYY-MM-DD, not "${day.slice(0, 20)}"` });
      return { words: `Hold out the data from ${day} on (it is held out from ${h.start} now). Strategies are tried only on what came before it; ${day > h.start ? `the days from ${h.start} to ${day} become data to try strategies on` : `the days from ${day} to ${h.start} are held out from now on`}.` };
    }
    if (a.change === "evaluate") {
      const trials = ledger.filter((r): r is TrialRow => r.kind === "trial");
      const t = trials.find((r) => r.run === a.value.trim());
      if (!t) return no("E_ACCOUNT_BAD_ACTION", { message: `no trial ran as ${a.value.trim().slice(0, 40)}` });
      if (t.window !== "train") return no("E_ACCOUNT_BAD_ACTION", { message: `${t.run} was itself a look at the holdout: look again from the training run it tried` });
      const params = Object.entries(t.params).map(([k, v]) => `${k} ${v}`).join(" · ");
      const looks = trials.filter((r) => r.window === "holdout").length;
      return { words: `Run ${t.strategy}${params ? ` (${params})` : ""} on ${t.markets.join(", ")} in ${t.interval} bars over the held-out data, from ${h.start} to now — look ${looks + 1} at it. A holdout looked at often is a holdout no more.` };
    }
    if (a.change === "desk") {
      const ask = deskAskOf(a.value);
      if (typeof ask === "string") return no("E_ACCOUNT_BAD_ACTION", { message: ask });
      // the window as the run will take it, and its steps: a run past them refused before it is signed, not after a minute of stepping
      const cut = holdoutStartMs(h);
      const to = ask.to ?? cut;
      if (to > cut) return no("E_ACCOUNT_BAD_ACTION", { message: `the data from ${h.start} on is held out: the desk is tried before it (a window ending ${h.start} at the latest), and Look at the holdout… on the run it makes looks at it after` });
      const from = ask.from ?? to - WINDOW_DEFAULT_DAYS * 86_400_000;
      if (!(to > from)) return no("E_ACCOUNT_BAD_ACTION", { message: "a backtest's window ends after it starts" });
      const steps = Math.floor((to - from) / INTERVAL_MS[ask.interval]);
      const most = this.opts.backtest?.maxDeskSteps ?? BACKTEST_DESK_STEPS;
      if (steps > most) return no("E_ACCOUNT_LIMIT", { message: `the desk steps ${most.toLocaleString("en-US")} times at most when it runs from here; this one would step about ${steps.toLocaleString("en-US")} — ${ask.interval === "1h" ? "4h bars or a shorter window" : "a shorter window"} (the terminal runs it longer)`, detail: { steps, most } });
      const secs = Math.round((steps * DESK_STEP_MS * ask.refs.length) / 1000);
      const took = secs < 2 ? "a second or two" : secs < 120 ? `some ${secs} seconds` : `some ${Math.round(secs / 60)} minutes`;
      const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
      return { words: `Run the desk (${deskParamWords(ask.spec.params)}) on ${ask.refs.map(marketText).join(", ")} in ${ask.interval} bars from ${day(from)} to ${day(to)}, with $${ask.cashUsd.toLocaleString("en-US")} on paper beside buying and holding them: about ${steps.toLocaleString("en-US")} steps, ${took}. A training run, counted in the trials like any other.` };
    }
    return no("E_ACCOUNT_BAD_ACTION", { message: LAB_CHANGES(a.change) });
  }

  private liveDeps(): LiveDeps {
    // made once: the chain clients and the price cache are kept between connections
    // a paper account prices itself at the same public sources Markets reads (live/paper.ts), through the service's own keeping of them
    return (this.liveMade ??= { home: this.opts.home, http: realHttp, clock: Date.now, mm: realMm(this.opts.mm?.bin, this.opts.mm?.timeoutMs), chain: this.opts.liveDeps?.chain ?? publicChain(), price: this.opts.liveDeps?.price ?? publicPrices({ open: this.opts.liveDeps?.openExchange, clock: this.opts.liveDeps?.clock }), signIn: (kind) => this.signIn(kind), publicSources: () => this.publicMarkets(), streams: () => this.hub, ...this.opts.liveDeps, proofs: this.proofs });
  }
  private liveMade: LiveDeps | undefined;

  /** the sign-in at a venue that speaks OAuth to MCP clients (Robinhood): one per venue, its tokens in memory only */
  private readonly signIns = new Map<string, OAuthSignIn>();
  signIn(kind: string): OAuthSignIn | undefined {
    if (kind !== "robinhood") return undefined;
    let s = this.signIns.get(kind);
    if (!s) {
      const deps = this.liveDeps();
      s = new OAuthSignIn({ resource: ROBINHOOD_MCP, name: "Robinhood", venue: "robinhood", http: deps.http, clock: deps.clock });
      this.signIns.set(kind, s);
    }
    return s;
  }
  /** whether a key file in this server's home is ready for a connection; names, never values */
  keyFile(kind: string, venue: string, ref: string, needs: string[] = []): ReturnType<typeof keyFileStatus> {
    return keyFileStatus(this.opts.home, kind, venue, ref, needs);
  }
  /** what each connection's venue answers from this machine before any key is made (live/reach.ts): its own first, keyless question. Kept
   * per connection (a location rule ten minutes, an answer two), asked once while an answer is on its way; `force` asks again now — save a
   * venue's own running ban of this machine's address, learned here or by its reads, which is waited out: asking a venue again from the
   * address it banned lengthens the ban */
  private readonly reaches = new Map<string, { r: Reach; until: number; ban?: true | undefined } | { pending: Promise<Reach> }>();
  connectReach(connectors: string[], force = false): Promise<Reach[]> {
    // a forced check learns the place again too (the laptop may have moved since it was learned): the probes that hold a venue's line to
    // the place (Hyperliquid's) ask it of the network the user is on now
    if (force) this.whereMade = undefined;
    return this.reachEach(connectors, force);
  }
  private reachEach(connectors: string[], force: boolean): Promise<Reach[]> {
    const deps = this.liveDeps();
    return Promise.all(
      connectors.map((c) => {
        const kept = this.reaches.get(c);
        // a forced check that meets a probe already on its way takes that answer as its own: what it lets go of, it lets go of
        if (kept && "pending" in kept) return force ? kept.pending.then((r) => (this.reached(c, r, true), r)) : kept.pending;
        if (kept && kept.until > deps.clock() && (!force || kept.ban)) return Promise.resolve(kept.r);
        const id = c.replace(/^live:(exchange:)?/, "");
        const banned = this.marketReads.banOf(id);
        if (banned) return Promise.resolve<Reach>({ connector: c, state: "unreachable", said: banned.refusal.message, at: new Date(banned.at).toISOString() });
        const pending = reachOf(c, { http: deps.http, clock: deps.clock, open: deps.openExchange, mm: deps.mm, signIn: (k) => this.signIn(k), where: this.where() })
          .catch((): Reach => ({ connector: c, state: "unreachable", said: "no answer just now; connecting asks again", at: new Date(deps.clock()).toISOString() }))
          .then((r) => {
            const now = deps.clock();
            const ban = reachBanUntil(r, now);
            this.reaches.set(c, { r, until: now + reachKeepMs(r, now), ...(ban ? { ban: true as const } : {}) });
            // the venue's reads (its connection's, its keyless source's) wait out the same ban — held on the wall clock, as they are timed
            if (ban) this.marketReads.hold(id, no("E_VENUE_UNREACHABLE", { venue: id, message: r.said ?? `${id} has banned this machine's address`, native: { ban: true, until: Date.now() + (ban - now) } }));
            this.reached(c, r, force);
            return r;
          });
        this.reaches.set(c, { pending });
        return pending;
      }),
    );
  }
  /** what a connection's newest answer changes. The list of where the user can connect, and the door's check of an agent's ask, take it
   * at once (a forced "Check again" is not overruled by an older answer kept in the list). A re-check the user (or the half-hourly watch)
   * asked for that finds the venue answering lets go of what was held from the network before: its keyless source's place hold and kept
   * refusals, a connected venue's — and asks a venue that did not come back after the restart again now */
  private reached(c: string, r: Reach, force: boolean): void {
    const kept = this.venuesKept;
    const i = kept ? kept.v.findIndex((x) => x.connector === c) : -1;
    const was = kept && i >= 0 ? kept.v[i]! : undefined;
    if (kept && was && (was.asked === undefined || Date.parse(r.at) >= Date.parse(was.asked))) {
      const now = verdictOf(r, was.terms, was.needs);
      if (now.verdict !== was.verdict) {
        // its edition, and the editions beside it, are judged again at the next read of the list
        const { said: _said, edition: _edition, ...rest } = was;
        this.venuesKept = { ...kept, v: kept.v.map((x, j) => (j === i ? { ...rest, verdict: now.verdict, ...(now.said ? { said: now.said } : {}), asked: r.at } : x)), sure: false };
      } else this.venuesKept = { ...kept, v: kept.v.map((x, j) => (j === i ? { ...was, asked: r.at } : x)) };
    }
    // a venue that lets this network close what is held (close-only) answers it too: a waiting connection connects, and sells only
    if (!force || (r.state !== "ok" && r.state !== "close-only")) return;
    for (const [ns, s] of this.publicRaw) {
      if (s.connector !== c) continue;
      // its parts (#history, #search, #line) with it
      this.marketReads.release(ns);
      // the source's own keeping of a refusal from the network before, where it has a way to let go of it
      s.reset?.();
    }
    for (const [id, a] of this.adapters) {
      if (!a.account.watchOnly || a.account.connector !== c) continue;
      this.marketReads.release(id);
      // its balance too: what was kept while it was held is not served for the rest of that hold; and the order door lets go of what it
      // learned from an order there, and sends an owner's cancel it could not send
      this.ruleSeen.delete(id);
      if (!this.marketReads.heldOf(id)) a.wake?.();
      this.account?.trade.letGo(id);
    }
    // the connections waiting for this venue; one it answered and refused (stopped) is the owner's to connect again, not a check's
    for (const [venue, w] of this.waiting) if (w.c.connector === c && !w.stopped) void this.tryAgain(venue);
  }
  /** WHERE THIS USER CAN CONNECT (live/availability.ts): every venue the account knows, judged from the network it runs on — the venue's
   * own answer to it (connectReach) and its own terms matched to where it is (in memory only). Asked automatically (watchVenues: at
   * start and every 30 minutes on the real server) and on request; one answer kept, and asked once while on its way. `sure`: every venue
   * answered and the place was learned */
  private venuesKept: { at: number; v: VenueHere[]; sure: boolean } | undefined;
  private venuesPending: { p: Promise<VenueHere[]>; force: boolean } | undefined;
  /** the residency hooks: each venue's own published terms (live/eligibility.ts), held to where this network is (live/location.ts: the
   * place learned on the machine the account runs on — the user's own — in memory only). Without a place the terms are shown, not judged;
   * either way they are never enforced. A test sets its own */
  venueTerms: AvailabilityDeps["terms"] = termsHere;
  venuePlace: AvailabilityDeps["place"] = () => this.where().place({ splits: (country) => SPLIT.has(country) });
  private whereMade: Locator | undefined;
  private where(): Locator {
    const deps = this.liveDeps();
    return (this.whereMade ??= locator({ http: deps.http, clock: deps.clock }));
  }
  async venuesHere(force = false): Promise<VenueHere[]> {
    const deps = this.liveDeps();
    // kept 30 minutes when every venue answered and the place was learned. Otherwise it is asked again after twenty seconds — only what did
    // not answer, and the place, are asked again then (the answers come from each connection's own keep) — behind the list kept, which is
    // answered at once for those 30 minutes: one venue that does not answer never makes every read wait for its probe
    const kept = this.venuesKept;
    const age = kept ? deps.clock() - kept.at : Infinity;
    if (!force && kept && (age < 20_000 || (kept.sure && age < 30 * 60_000))) return this.present(kept.v);
    if (!force && kept && age < 30 * 60_000) {
      void this.askVenues(false).catch(() => undefined);
      return this.present(kept.v);
    }
    return this.askVenues(force).then((v) => this.present(v));
  }
  /** the list as kept, with what is on the account NOW: the venues' answers are kept half an hour, but a connection the owner made or took
   * off since, or one that waits for its venue, is said as it stands at the moment of the read */
  private present(v: VenueHere[]): VenueHere[] {
    const on = new Set([...this.adapters.values()].filter((a) => a.account.watchOnly).map((a) => a.account.connector).filter((c): c is string => !!c));
    return v.map((x) => {
      const waiting = [...this.waiting.values()].find((w) => w.c.connector === x.connector && !w.stopped)?.said;
      const { waiting: _was, ...rest } = x;
      // a stopped one (the venue, or this account's own check, said no) is on neither list: it is read nowhere, and the owner's to connect again
      return { ...rest, connected: on.has(x.connector) || waiting !== undefined, ...(waiting !== undefined ? { waiting } : {}) };
    });
  }
  private askVenues(force: boolean): Promise<VenueHere[]> {
    // a check on its way answers this one too — unless this one is forced and that one is not: then this one is asked after it, of the
    // network the user is on now, and its answer is the one kept
    const before = this.venuesPending;
    if (before && (!force || before.force)) return before.p;
    const p = (before ? before.p.catch(() => undefined) : Promise.resolve()).then(() => this.assembleVenues(force));
    const mine = { p, force };
    this.venuesPending = mine;
    return p.finally(() => {
      if (this.venuesPending === mine) this.venuesPending = undefined;
    });
  }
  private async assembleVenues(force: boolean): Promise<VenueHere[]> {
    const deps = this.liveDeps();
    // a forced check learns the place again too: the laptop may be on another network than the one the place was learned on, and the
    // terms and editions are matched to where it is now (the old locator's own timer drops what it kept)
    if (force) this.whereMade = undefined;
    const page = await this.accountView();
    // on the account: the venues read, and the connections the owner signed that wait for their venue to answer this network
    const on = new Set([...(page?.venues ?? []).map((v) => v.connector).filter((c): c is string => !!c), ...[...this.waiting.values()].filter((w) => !w.stopped).map((w) => w.c.connector)]);
    const ask = this.venuePlace;
    let placed = ask === undefined;
    const v = await venuesHere({
      connections: venueCatalog(liveOptions(this.opts.home).options),
      reach: (cs) => this.reachEach(cs, force),
      terms: this.venueTerms,
      place: ask
        ? async () => {
            const p = await ask();
            placed = p !== undefined;
            return p;
          }
        : undefined,
      connected: (c) => on.has(c),
      waiting: (c) => [...this.waiting.values()].find((w) => w.c.connector === c && !w.stopped)?.said,
      clock: deps.clock,
    });
    this.venuesKept = { at: deps.clock(), v, sure: placed && !v.some((x) => x.verdict === "no-answer") };
    return v;
  }
  /** what the desk (account/desk.ts) needs of this service: the account's reads, the door, the seats' nonces, the ledger */
  private deskWorld(): DeskWorld {
    return {
      home: this.opts.home,
      now: () => this.now(),
      realNow: () => this.liveDeps().clock(),
      mode: () => (this.openness.mode === "open" ? "open" : "guard"),
      page: () => this.accountView(),
      explore: (o) => this.explore(o),
      market: (venue, symbol) => this.liveMarket(venue, symbol),
      mark: (venue, symbol) => this.liveMark(venue, symbol),
      positions: (venue) => this.livePositions(venue),
      ordersOf: (ids) => {
        const want = new Set(ids);
        return (this.account?.orders ?? []).filter((o) => want.has(o.id) || (o.card !== undefined && want.has(o.card)) || (o.exitOf !== undefined && want.has(o.exitOf.order)));
      },
      exchange: (envelope) => this.exchange(envelope),
      nonce: () => this.account!.nextNonce(),
      venueName: (id) => this.nameOf(id),
      log: (row) => void this.ledger.append(unaddressedRow(row)),
    };
  }
  /** How one of the desk's brains stands now that its key changed (account/brain-keys.ts), as the page, the feed and a seat read it — the
   * desk's own standing (Desk.catalog), which is the brain's word about itself (a key file is read again at every check, so a key just
   * written needs no restart) overlaid with a refusal the provider gave its key at a call, while that refusal stands. So the answer to the
   * route that set the key never says "ready" beside a card that says "Key refused": they are read from the same place. And the variable in
   * the service's environment that wins over the file, when one holds a key for it (envWins) — or that blocks the file without being used
   * itself (envBlocks: Claude behind a gateway's ANTHROPIC_BASE_URL, brain-claude.ts). Undefined: no desk, or no brain of that id */
  brainStanding(provider: string): { standing: BrainStatus; label: string; envWins?: string | undefined; envBlocks?: string | undefined } | undefined {
    const b = this.desk?.brains.find((x) => x.id === provider);
    if (!b) return undefined;
    const row = this.desk!.catalog().brains.find((x) => x.id === provider);
    const standing: BrainStatus = row ? { ok: row.ok, model: row.model, ...(row.how ? { how: row.how } : {}), ...(row.why ? { why: row.why } : {}), ...(row.fix ? { fix: row.fix } : {}) } : b.ready();
    const envWins = envWinsOf(b, this.opts.desk?.env ?? process.env);
    const envBlocks = envBlocksOf(b);
    return { standing, label: b.label, ...(envWins ? { envWins } : {}), ...(envBlocks ? { envBlocks } : {}) };
  }

  /** "Test the key" (POST /api/account/brain-test): the brain's own test — the one call that bills nothing, to the provider's own base URL
   * (desk.ts Brain.test, through brains.ts testBrain). One at a time per brain AND model: a second ask for the same pair while one is out
   * waits for the same answer, so the page (or anything local that asks) cannot make a run of calls of it — and an ask for another model
   * is its own test, so that its answer ("… X is listed") is never the words of a test about a different model. A brain with no test (a
   * script) says so; nothing is sent then. Undefined: no desk, or no brain of that id */
  async brainTest(provider: string, model = ""): Promise<BrainTest | undefined> {
    const b = this.desk?.brains.find((x) => x.id === provider);
    if (!b) return undefined;
    const key = `${provider}\u0000${model}`;
    const out = this.brainTests.get(key);
    if (out) return out;
    const asked = testBrain(this.desk!.brains, provider, model || undefined).finally(() => this.brainTests.delete(key));
    this.brainTests.set(key, asked);
    return asked;
  }
  private readonly brainTests = new Map<string, Promise<BrainTest>>();

  /** "Connect a key" (POST /api/account/brain-detect, account/brain-detect.ts): whose a pasted key is — by its shape, then by the provider's
   * own answer to the one call that bills nothing, its list of models — and the model the desk would think with. Nothing is written and
   * nothing is signed: saving it is the owner's signed setBrainKey, as ever. One key at a time: a second ask while one is out is told to
   * wait (the asking can take a provider or three, fifteen seconds each at most), so nothing local can make a run of calls of it.
   * Undefined: no desk */
  async brainDetect(apiKey: string): Promise<Detected | undefined> {
    if (!this.desk) return undefined;
    if (this.detecting) return { ok: false, code: "busy", words: DETECT_BODY_WORDS.busy };
    this.detecting = true;
    try {
      return await detectBrain(apiKey, this.desk.brains, { best: presetBest, host: presetHost });
    } finally {
      this.detecting = false;
    }
  }
  private detecting = false;

  /** the real server runs the desk's clock (never in tests, which tick it themselves) */
  watchDesk(): () => void {
    return this.desk ? this.desk.start() : () => undefined;
  }

  /** THE PAPER ACCOUNTS' OWN CLOCK: every few seconds each paper account the account keeps itself looks at its book (paper.ts settle) —
   * resting orders judged at the quote of that moment, stops and trailing stops watched, a bracket's exits placed and one canceling the
   * other, a day's orders ended with their session, funding paid, a position liquidated — so none of it waits for someone to open the
   * page. When a book changed, what was kept of its reads goes and the account's door asks how its orders stand (AccountEngine.settle), so
   * the statement follows. One look at a time (never in tests, which look themselves) */
  watchPaper(everyMs = PAPER_LOOK_MS): () => void {
    const every = setInterval(() => void this.lookAtPaper(), everyMs);
    every.unref?.();
    return () => clearInterval(every);
  }
  /** THE DOOR'S OWN CLOCK WHILE A PAGE LISTENS: the account follows real venues' orders, its payments, its earn requests and its cards'
   * time only when it settles (AccountEngine.settle), and it settles when it is read. A page on the push channel reads it far less often
   * (shell.js REFRESH_SLOW) — so, while one listens, the door looks by itself every DOOR_LOOK_MS: a resting order filled at Coinbase, at
   * Alpaca's paper account or Hyperliquid's testnet, a payment landed, an earn request answered or a card past its time is told to the
   * page (toldRow) as soon as it would have been while the page read every twenty seconds, or sooner. Only while something is under way
   * at a venue that does not tell its own book (the account's paper books tell theirs as they are written: paperSaid), and a card waiting
   * is only expired (the quick settle). One look at a time; never while no page listens, and never in tests (they look themselves) */
  watchDoor(everyMs = DOOR_LOOK_MS): () => void {
    const every = setInterval(() => void this.lookAtDoor(), everyMs);
    every.unref?.();
    return () => clearInterval(every);
  }
  /** one look of the door's own clock (watchDoor's, or a test's): whether it settled the account — "full" (something under way at a venue
   * whose book the account does not keep), "quick" (only cards waiting for their time), or "" (no page listens, or nothing is waiting) */
  async lookAtDoor(): Promise<"full" | "quick" | ""> {
    const a = this.account;
    if (!a || this.doorLooking || this.stream.listening === 0) return "";
    const away = (venue: string) => !this.paperControls.has(venue);
    const full = a.orders.some((o) => !DONE.has(o.status) && away(o.venue)) || a.payments.some((p) => !STATEMENT_FINAL.has(p.status)) || a.earns.some((e) => e.status === "pending");
    const quick = !full && this.approvals.some((c) => c.status === "pending" && c.expiresAt !== undefined);
    if (!full && !quick) return "";
    this.doorLooking = true;
    try {
      await a.settle(quick);
      return full ? "full" : "quick";
    } catch {
      return "";
    } finally {
      this.doorLooking = false;
    }
  }
  private doorLooking = false;

  /** THE PRICE ALERTS' OWN CLOCK: every half minute (ALERT_LOOK_MS) each standing alert's market is priced — at its venue when that is
   * connected, else from the venue's public side — and an alert whose figure the price has reached or crossed fires (lookAtAlerts): the
   * engine takes it off, the ledger gets its note, and every page listening is told at once. Whether or not a page is open: an alert is the
   * account's promise, not the page's. One look at a time; never in tests, which look themselves */
  watchAlerts(everyMs = ALERT_LOOK_MS): () => void {
    const every = setInterval(() => void this.lookAtAlerts(), everyMs);
    every.unref?.();
    return () => clearInterval(every);
  }
  /** one look at the standing price alerts (watchAlerts's, or a test's): each alert's market priced once — alerts on one market share the
   * read — and each alert whose condition the price meets fired: "above" fires at the figure or over it, "below" at the figure or under it.
   * A market nothing prices now leaves its alerts standing for the next look. Answers the alerts that fired, in the order they stood */
  async lookAtAlerts(): Promise<FiredAlert[]> {
    const a = this.account;
    if (!a || this.alertsLooking) return [];
    const now = Date.parse(this.now());
    const standing = a.state.alerts.filter((x) => now < Date.parse(x.expiresAt));
    if (!standing.length) return [];
    this.alertsLooking = true;
    try {
      const keyOf = (x: { venue: string; symbol: string }) => `${x.venue}|${x.symbol}`;
      const markets = [...new Map(standing.map((x) => [keyOf(x), { venue: x.venue, symbol: x.symbol }])).values()];
      const prices = new Map<string, { price: number; from: string }>();
      await Promise.all(markets.map(async (m) => {
        const p = await this.priceNow(m.venue, m.symbol).catch(() => undefined);
        if (p) prices.set(keyOf(m), p);
      }));
      const fired: FiredAlert[] = [];
      for (const x of standing) {
        const p = prices.get(keyOf(x));
        if (!p) continue;
        if (!(x.condition === "above" ? p.price >= x.price : p.price <= x.price)) continue;
        const f = a.fireAlert(x.id, p.price, p.from);
        if (!f) continue;
        fired.push(f);
        this.stream.emit("alert", { ...f, venueName: this.nameOf(f.venue), at: f.firedAt });
      }
      return fired;
    } finally {
      this.alertsLooking = false;
    }
  }
  private alertsLooking = false;
  /** ONE MARKET'S PRICE NOW, for a price alert: at a venue connected live, the venue's own (liveMarket: a few seconds old at most — its last
   * trade, else the middle of its book); at a venue that is not connected, the public side of it (the source whose venue it is, or that
   * trades its markets) — the venue's stream while the hub carries the market (its last trade; a perpetual's mark), else the source's
   * one-market line (the US stocks line), else its listings searched for the symbol. Each says whose price it is (`from`), in its own
   * words. Undefined where nothing prices it now */
  private async priceNow(venue: string, symbol: string): Promise<{ price: number; from: string } | undefined> {
    const ofMarket = (m: Market, from: string): { price: number; from: string } | undefined => {
      const mid = m.bid !== undefined && m.ask !== undefined && m.ask >= m.bid ? (m.bid + m.ask) / 2 : undefined;
      const price = m.price ?? mid;
      return price !== undefined && price > 0 ? { price, from: m.quoteFrom ?? from } : undefined;
    };
    const live = this.liveVenues.get(venue);
    if (live && this.adapters.get(venue)?.account.watchOnly) {
      const m = await this.liveMarket(venue, symbol);
      return isRefusal(m) ? undefined : ofMarket(m, live.name);
    }
    const src = this.publicMarkets().find((s) => s.id === venue || s.connectTo === venue || s.alsoVia?.some((v) => v.connectTo === venue));
    if (!src) return undefined;
    const hub = this.listenHub();
    if (hub?.covers(src.id, symbol)) {
      hub.want(src.id, symbol);
      const q = hub.quote(src.id, symbol);
      if (q?.live) {
        const mid = q.bid !== undefined && q.ask !== undefined && q.ask >= q.bid ? (q.bid + q.ask) / 2 : undefined;
        const price = /-PERP$/i.test(symbol) ? (q.mark ?? mid ?? q.last) : (q.last ?? mid);
        if (price !== undefined && price > 0) return { price, from: q.from ?? `${q.src} · live` };
      }
    }
    if (src.line) {
      const l = await src.line(symbol);
      if (l && !isRefusal(l)) return ofMarket(l, src.name);
    }
    const base = symbol.split(/[/@:]/)[0]?.replace(/-(PERP|USD[CT]?|SWAP)$/i, "") ?? symbol;
    const listed = await src.listings({ q: base, limit: 60 });
    if (isRefusal(listed)) return undefined;
    const l = listed.find((x) => x.symbol === symbol);
    return l ? ofMarket(l, src.name) : undefined;
  }
  async lookAtPaper(): Promise<string[]> {
    if (this.paperLooking || !this.paperLooks.size) return [];
    this.paperLooking = true;
    try {
      const changed: string[] = [];
      for (const [venue, look] of [...this.paperLooks]) if (await look().catch(() => false)) changed.push(venue);
      if (changed.length) {
        for (const v of changed) {
          this.marketReads.drop(v, true);
          // its balance read too: the cash and holdings the page shows are the book's after the fill, not those kept from before it
          this.adapters.get(v)?.wake?.();
          this.account?.trade.dueNow(v);
        }
        await this.account?.settle().catch(() => undefined);
      }
      return changed;
    } finally {
      this.paperLooking = false;
    }
  }
  private paperLooking = false;
  private readonly paperLooks = new Map<string, () => Promise<boolean>>();
  /** each paper account connected now whose book is listened to (paperSaid): how to stop listening, when it is unplugged or connected again */
  private readonly paperUnlisten = new Map<string, () => void>();
  /** each paper account connected now: how to let it go (its markets' ticks judge its book no more), and the source each of its markets is
   * priced by (what the streams are asked for it by) */
  private readonly paperStops = new Map<string, () => void>();
  private readonly priceSources = new Map<string, (symbol: string) => string | undefined>();

  // ---- THE VENUES' LIVE STREAMS (live/stream-hub.ts) -------------------------------------------------------------------------------------

  /** the hub the real server started (watchStreams), or the one a test handed in (opts.streams); none: nothing is streamed */
  private hubMade: MarketHub | undefined;
  private get hub(): MarketHub | undefined {
    return this.hubMade ?? this.opts.streams;
  }
  /** THE REAL SERVER STREAMS THE VENUES (never in tests, which hand in their own): the hub made now and listened to — and lazily, no socket
   * opens until a market is wanted (a paper account's resting order or position, a page showing it), so the server's listen never waits on
   * it. A venue is streamed only while its keyless REST answers this network (restAnswers). The function it returns closes it */
  watchStreams(): () => void {
    if (!this.hubMade && !this.opts.streams) {
      // the venues' streams, and beside them each public source's own background reader (the US stocks line's: live/us-quotes.ts
      // UsQuoteFeed), joined as one hub — a market is asked of the one that covers it
      const venues = new StreamHub({ answers: (v) => this.restAnswers(v) });
      const feeds = this.publicMarkets().flatMap((x) => (x.feed ? [x.feed] : []));
      this.hubMade = feeds.length ? joinHubs(venues, ...feeds) : venues;
    }
    this.listenHub();
    return () => this.closeStreams();
  }
  /** every stream closed and every timer of it let go (the server closing) */
  closeStreams(): void {
    this.hubOff?.();
    this.hubOff = undefined;
    this.hubHeard = undefined;
    this.hubMade?.close();
    this.hubMade = undefined;
  }
  /** every paper account's book written as it stands (what a fill a live tick found, or a trailing stop's move, still holds): the server
   * closing */
  async flushPaper(): Promise<void> {
    await Promise.all([...this.paperControls.values()].map((c) => c.flush().catch(() => undefined)));
  }
  private hubHeard: MarketHub | undefined;
  private hubOff: (() => void) | undefined;
  private listenHub(): MarketHub | undefined {
    const hub = this.hub;
    if (hub && hub !== this.hubHeard) {
      this.hubOff?.();
      this.hubHeard = hub;
      this.hubOff = hub.onTick((t) => this.marketTold(t));
    }
    return hub;
  }
  /** WHETHER A VENUE'S REST ANSWERS THIS NETWORK, as the hub asks before it streams the venue (location-neutral: never by where this
   * machine is, only by what the venue's own keyless REST said here): its listing answered in this run, through the account's own read
   * cache, and no refusal that is the venue's rule for this network — its place rule, the server in front of it, a ban — holds it back now.
   * A REST read that merely timed out or was told to wait does not close a stream; Hyperliquid's REST is either of its two listings */
  private restAnswers(venue: HubVenue): boolean {
    const ids = venue === "hyperliquid" ? ["hyperliquid", "hyperliquid-preipo"] : [venue];
    return ids.some((id) => {
      const ns = `public:${id}`;
      const held = this.marketReads.heldOf(ns);
      if (held && (notServedBy(held) !== undefined || isBan(held))) return false;
      return !!this.marketReads.healthOf(ns)?.lastOkAt;
    });
  }

  /** what each page follows: its client's name → each key it follows → the stream it holds for it, and its release */
  private readonly pageHolds = new Map<string, Map<string, { source: string; symbol: string; release: () => void }>>();
  /** the keys the pages follow, by the stream each stands for (`source|symbol` → each key, and how many pages follow it) */
  private readonly followers = new Map<string, Map<string, number>>();

  /** THE MARKETS A PAGE SHOWS (account/stream.ts follow, told here): each key — `<venue>:<symbol>` — held from the venues' streams while
   * the page follows it (its book too: the page shows it), its quote, book and trades pushed to the page as they move (marketTold), and
   * the ones it no longer follows let go (each stream a minute after nothing wants it: live/stream-hub.ts). A key with a "~" before it is a
   * market whose PRICE ALONE the page shows (a position's mark under the trading area's panels, ui/terminal.js): held without its book, and
   * only its quote pushed */
  private pageFollows(client: string, keys: string[]): void {
    const had = this.pageHolds.get(client) ?? new Map<string, { source: string; symbol: string; release: () => void }>();
    const kept = new Map<string, { source: string; symbol: string; release: () => void }>();
    for (const key of keys) {
      const was = had.get(key);
      if (!was) continue;
      kept.set(key, was);
      had.delete(key);
    }
    for (const [key, h] of had) {
      h.release();
      this.unfollowKey(key, `${h.source}|${h.symbol}`);
    }
    if (keys.length) this.pageHolds.set(client, kept);
    else this.pageHolds.delete(client);
    for (const key of keys) if (!kept.has(key)) void this.followKey(client, key).catch(() => undefined);
  }
  /** one key a page follows, held from its stream — once what it stands for is known (a paper market's source, read first where it has not
   * been yet) and only if the page still follows it then; what the stream has now told to the page at once */
  private async followKey(client: string, key: string): Promise<void> {
    const marked = key.startsWith("~");
    const at = await this.streamAt(marked ? key.slice(1) : key);
    const hub = this.listenHub();
    const mine = this.pageHolds.get(client);
    if (!at || !hub || !mine || mine.has(key) || !this.stream.followsOf(client)?.has(key)) return;
    // a market whose hub carries its price alone (a US share's real-time quote, read over REST: live/us-quotes.ts) is told its quote only
    const priceOnly = marked || hub.pricesOnly?.(at.source, at.symbol) === true;
    const release = hub.hold(at.source, at.symbol, { book: !priceOnly });
    mine.set(key, { ...at, release });
    const k = `${at.source}|${at.symbol}`;
    const keys = this.followers.get(k) ?? new Map<string, number>();
    keys.set(key, (keys.get(key) ?? 0) + 1);
    this.followers.set(k, keys);
    for (const what of priceOnly ? (["quote"] as const) : (["quote", "book", "trades"] as const)) this.tellMarket(k, what);
  }
  /** A PAGE'S STREAM OPENED AGAIN carrying over what it followed (account/stream.ts attach: the same tab come back before its old stream
   * was let go): each market it holds told to it again now — its quote, and its book and trades where it shows them whole — since the page
   * let go of what its old stream pushed as that dropped, and a quiet market would otherwise say nothing until its next move. A key whose
   * stream is still being found tells itself once it is held (followKey) */
  private pageAgain(client: string, keys: string[]): void {
    const mine = this.pageHolds.get(client);
    if (!mine) return;
    for (const key of keys) {
      const h = mine.get(key);
      if (!h) continue;
      const priceOnly = key.startsWith("~") || this.hub?.pricesOnly?.(h.source, h.symbol) === true;
      for (const what of priceOnly ? (["quote"] as const) : (["quote", "book", "trades"] as const)) this.tellMarket(`${h.source}|${h.symbol}`, what);
    }
  }
  private unfollowKey(key: string, k: string): void {
    const keys = this.followers.get(k);
    if (!keys) return;
    const n = (keys.get(key) ?? 1) - 1;
    if (n > 0) keys.set(key, n);
    else keys.delete(key);
    if (!keys.size) this.followers.delete(k);
  }
  /** the stream a page's market stands for: a paper account's market its listing source's (priceSource; the market read first where the
   * account has not listed it yet), a venue that is one of the streamed sources itself (Coinbase connected with a key trades Coinbase's
   * pairs) its own; nothing for the rest */
  private async streamAt(key: string): Promise<{ source: string; symbol: string } | undefined> {
    const i = key.indexOf(":");
    if (i <= 0) return undefined;
    const venue = key.slice(0, i).replace(/^public:/, "");
    const symbol = key.slice(i + 1);
    // a venue's id and a market as plain text, as every read of one takes them (oneMarket): nothing else is read for it, or held
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(venue) || !symbol || symbol.length > 160 || !isPlain(symbol)) return undefined;
    const priced = this.priceSources.get(venue);
    if (priced) {
      let source = priced(symbol);
      if (!source) {
        await this.liveVenues.get(venue)?.trader?.market(symbol);
        source = priced(symbol);
      }
      return source && this.hub?.covers(source, symbol) ? { source, symbol } : undefined;
    }
    return this.hub?.covers(venue, symbol) ? { source: venue, symbol } : undefined;
  }
  /** a stream's word, told to the pages that follow its market: a quote, a book or trades as they moved — and both quote and book when it
   * went live or stopped being so (the page says its age then) */
  private marketTold(t: HubTick): void {
    const k = `${t.source}|${t.symbol}`;
    if (!this.followers.get(k)?.size) return;
    for (const what of t.what === "live" ? (["quote", "book"] as const) : ([t.what] as const)) this.tellMarket(k, what);
  }
  /** one market's quote, book or trades as the stream has it, to each key the pages follow it by — written when it goes out (the bus
   * coalesces a market's events: 100 ms a quote or its trades, 250 ms its book), never sooner, so what was skipped costs nothing. A key
   * followed for its price alone ("~") is told its quote only */
  private tellMarket(k: string, what: "quote" | "book" | "trades"): void {
    const hub = this.hub;
    const keys = this.followers.get(k);
    if (!hub || !keys) return;
    const cut = k.indexOf("|");
    const source = k.slice(0, cut);
    const symbol = k.slice(cut + 1);
    // a market whose hub carries its price alone (a US share's) has no book and no trades to tell
    if (what !== "quote" && hub.pricesOnly?.(source, symbol) === true) return;
    for (const key of keys.keys()) {
      if (what !== "quote" && key.startsWith("~")) continue;
      const venue = key.slice(key.startsWith("~") ? 1 : 0, key.indexOf(":"));
      const head = { key, venue, symbol, source };
      const later = (data: () => Record<string, unknown>) => ({ toJSON: () => ({ ...head, ...data() }) });
      if (what === "quote") {
        this.stream.emit("quote", later(() => {
          const q = hub.quote(source, symbol);
          if (!q) return { live: false };
          return { ...(q.bid !== undefined ? { bid: q.bid } : {}), ...(q.ask !== undefined ? { ask: q.ask } : {}), ...(q.bidSz !== undefined ? { bidSz: q.bidSz } : {}), ...(q.askSz !== undefined ? { askSz: q.askSz } : {}), ...(q.last !== undefined ? { last: q.last } : {}), ...(q.mark !== undefined ? { mark: q.mark } : {}), ...(q.oracle !== undefined ? { oracle: q.oracle } : {}), ...(q.funding !== undefined ? { funding: q.funding } : {}), ...(q.openInterest !== undefined ? { openInterest: q.openInterest } : {}), ...(q.volumeUsd24h !== undefined ? { volumeUsd24h: q.volumeUsd24h } : {}), ...(q.prevDayPx !== undefined ? { prevDayPx: q.prevDayPx } : {}), ...(q.premium !== undefined ? { premium: q.premium } : {}), ...(q.bar ? { bar: q.bar } : {}), at: new Date(q.at).toISOString(), ...(q.priceAt !== undefined ? { priceAt: new Date(q.priceAt).toISOString() } : {}), seenAt: new Date(q.seenAt).toISOString(), from: q.from ?? `${q.src} · live`, ...(q.delayMs !== undefined ? { delayMs: q.delayMs } : {}), ...(q.everyMs !== undefined ? { everyMs: q.everyMs } : {}), ...(q.askedEveryMs !== undefined ? { askedEveryMs: q.askedEveryMs } : {}), live: q.live, seq: q.seq };
        }), key);
      } else if (what === "book") {
        this.stream.emit("book", later(() => {
          const bk = hub.book(source, symbol);
          // a stream that sends only its venue's top levels (Hyperliquid's and OKX's five, Kraken's ten) says each side may go on past its last
          return bk ? { bids: bk.bids, asks: bk.asks, at: new Date(bk.seenAt).toISOString(), from: `${bk.src} · live`, depth: "full", more: { bids: !bk.whole || bk.bids.length >= BOOK_TOP, asks: !bk.whole || bk.asks.length >= BOOK_TOP }, live: bk.live } : { live: false };
        }), key);
      } else {
        this.stream.emit("trades", later(() => ({ trades: hub.trades(source, symbol, 30), live: hub.quote(source, symbol)?.live === true })), key);
      }
    }
  }
  /** A MARKET'S LIVE MARK, as the desk marks its leads (account/desk.ts DeskWorld.mark): its stream's — a perpetual's venue mark, a coin's
   * last trade (else the middle of its book) — with the moment the stream confirmed it, while the stream is live; nothing otherwise (the
   * desk reads the venue as it did). The market wanted from the hub as it is asked */
  private liveMark(venue: string, symbol: string): { price: number; at: string; from: string } | undefined {
    const hub = this.listenHub();
    const source = this.priceSources.get(venue)?.(symbol) ?? venue;
    if (!hub || !hub.covers(source, symbol)) return undefined;
    hub.want(source, symbol);
    const q = hub.quote(source, symbol);
    if (!q?.live) return undefined;
    const mid = q.bid !== undefined && q.ask !== undefined && q.ask >= q.bid ? (q.bid + q.ask) / 2 : undefined;
    const price = /-PERP$/i.test(symbol) ? (q.mark ?? mid ?? q.last) : (q.last ?? mid);
    return price !== undefined && price > 0 ? { price, at: new Date(q.seenAt).toISOString(), from: q.from ?? `${q.src} · live` } : undefined;
  }

  /** A PAPER ACCOUNT'S BOOK MOVED (live/paper.ts PaperChange, told as the book is written — the owner's own order, a look of the service's
   * own, a reset or paper money added alike): told to the pages at once as the account's own events, in the shapes the page already reads —
   *   order      each order whose state moved: the account's own record of it (by the client id the account gave it, as the page's orders
   *              list carries it) with the book's state over it, since the account's door hears of it only at its next poll; an order the
   *              account has no record of (a bracket's exit not yet taken on) in the book's own words, with its client id
   *   fill       each fill, a background look's as the owner's own — its order's id where the account has one
   *   position   each position or holding as the account's positions read lists it (live/paper.ts positionRow), at its venue; null: gone
   *   balance    the paper cash, when it moved          paper   the book said of itself (and `reset` when it was started again)
   *   statement  read the statement again: a fill no order of the account's placed (a liquidation, a settlement) is a line read from the book
   * A change that moved what is held or the cash lets go of what was kept of the venue's reads (its balance among them), so the page's next
   * read is the book's; and the account's door asks how its orders there stand at its next poll (a page read is one), not after their wait */
  private paperSaid(venue: string, c: PaperChange): void {
    const venueName = this.nameOf(venue);
    const at = this.now();
    const ownOrder = (clientId: string | undefined) => (clientId ? this.account?.orders.find((o) => o.venue === venue && o.clientId === clientId) : undefined);
    if (c.fills.length || c.positions.length || c.cashUsd !== undefined || c.reset) {
      this.marketReads.drop(venue, true);
      this.adapters.get(venue)?.wake?.();
    }
    if (c.orders.length || c.fills.length) this.account?.trade.dueNow(venue);
    for (const o of c.orders) {
      const own = ownOrder(o.clientId);
      const state = { status: o.status, filledQty: o.filledQty, qty: o.qty, ...(o.avgPrice !== undefined ? { avgPrice: o.avgPrice } : {}), ...(o.feeUsd !== undefined ? { feeUsd: o.feeUsd } : {}), ...(o.limitPrice !== undefined ? { limitPrice: o.limitPrice } : {}), ...(o.stopPrice !== undefined ? { stopPrice: o.stopPrice } : {}), updatedAt: o.updatedAt };
      this.stream.emit("order", own ? { ...own, ...state, ...(o.note ? { note: o.note } : {}), paper: true, at: own.at } : { ...o, venue, venueName, paper: true });
    }
    for (const f of c.fills) {
      const own = ownOrder(f.clientId);
      this.stream.emit("fill", { ...f, venue, venueName, paper: true, ...(own ? { order: own.id, by: own.authority } : {}) });
    }
    for (const p of c.positions) this.stream.emit("position", { venue, venueName, paper: true, symbol: p.symbol, position: p.position ? { ...p.position, venue, venueName, paper: true } : null });
    if (c.cashUsd !== undefined) this.stream.emit("balance", { venue, venueName, paper: true, cashUsd: c.cashUsd, at });
    this.stream.emit("paper", { ...c.summary, ...(c.reset ? { reset: c.reset } : {}), at });
    if (c.fills.length || c.reset) this.stream.emit("statement", { venue, paper: true, at });
  }

  /** WHAT THE LEDGER TOOK, told to the pages (the push channel; every row passes here as it is written): a statement line (`statement`,
   * with the line — the history tabs read the statement again), an order's new state as the account placed it or follows it (`order`: the
   * account's own record of it, as the page's orders list carries it), with a `fill` for what it filled since it was last told (toldFill),
   * a card raised or answered (`card`) — and, as a `card` too (`waits`: what it is), what now waits for the owner without a card, which the
   * page shows in its counts and reads only with the account: an agent knocking to be let in (a new one, or one that gave a new name), an
   * agent's ask or a note it keeps for the owner to answer, a device asking to sign. Nothing else of the ledger goes out */
  private toldRow(row: LedgerRow): void {
    const waits = this.waitsOf(row);
    if (waits) return void this.stream.emit("card", { waits, venue: row.venue, at: row.ts });
    if (row.kind === "statement") {
      // an order's line carries the order (live-orders.ts line): one an earlier run placed is first seen in this run here (adopt), and what
      // it had filled then is where its fills are counted from — never said again as filled now
      const was = (row.native as { order?: Partial<LiveOrder> } | undefined)?.order;
      if (was && typeof was.id === "string" && !this.toldFills.has(was.id)) {
        this.toldFills.set(was.id, { qty: Number(was.filledQty) || 0, avg: was.avgPrice });
        if (this.toldFills.size > TOLD_FILLS_MAX) this.toldFills.delete(this.toldFills.keys().next().value!);
      }
      return void this.stream.emit("statement", { venue: row.venue, line: row.detail ?? null, at: row.ts });
    }
    if (row.kind === "card") return void this.stream.emit("card", { id: row.intentId, venue: row.venue, outcome: row.outcome, at: row.ts });
    if (row.kind !== "order") return;
    // an order's row names it first, by the account's id (live-orders.ts: "ord-0007 · …")
    const id = /^(ord-\d+)\b/.exec(row.reason ?? "")?.[1];
    const o = id ? this.account?.orders.find((x) => x.id === id) : undefined;
    if (!o) return;
    this.stream.emit("order", { ...o });
    this.toldFill(o);
  }

  /** what a ledger row puts in front of the owner that is not a card (toldRow): "letIn" — an agent not let in knocked, and the account's
   * list of them changed (a key that knocks again and again, as it is, is told once); "ask" — an agent's ask; "memory" — a note an agent
   * keeps, which may wait for the owner's yes, or one it forgot; "device" — a device asking to sign. "" for every other row */
  private waitsOf(row: LedgerRow): "letIn" | "ask" | "memory" | "device" | "" {
    if (row.kind === "account-refusal" && row.code === "E_ACCOUNT_UNKNOWN_SIGNER") {
      const now = JSON.stringify((this.account?.state.requests ?? []).map((r) => [r.address, r.name]));
      if (now === this.toldRequests) return "";
      this.toldRequests = now;
      return "letIn";
    }
    if (row.kind !== "action" || row.outcome === "taken") return "";
    if (row.tool === "agentAsk") return "ask";
    if (row.tool === "agentRemember" || row.tool === "agentForget") return "memory";
    if (row.tool === "account_pair" && (row.native as { pending?: unknown } | undefined)?.pending === true) return "device";
    return "";
  }
  private toldRequests = "[]";

  /** what each order had filled when the pages were last told of it, and at what average, by the account's id (toldFill) */
  private readonly toldFills = new Map<string, { qty: number; avg: number | undefined }>();
  /** AN ORDER THAT FILLED MORE SINCE THE PAGES WERE LAST TOLD OF IT: told as a fill of its own (`fill`, the shape a paper account's book
   * tells one in), so every fill is said once as it happens — at a real venue, at a venue's own paper account (Alpaca paper, Hyperliquid's
   * testnet) and an agent's order that filled as it was placed alike — however the page's own copy of the order stands: its read may have
   * come back with the fill before this push did. What it adds is the size since the last told, at its own price: (the new average × what
   * has filled − the old average × what had) ÷ what it adds, where both averages are known — else the order's average, said as one. The
   * account's own paper books (live:paper) tell their fills themselves as they are written (paperSaid): nothing is told twice from here. The
   * client id and what has filled in all are the page's key for a fill said once (core FILLS_SAID), whichever of this, the order's own
   * answer and the book's fill comes first */
  private toldFill(o: LiveOrder): void {
    const was = this.toldFills.get(o.id) ?? { qty: 0, avg: undefined };
    const filled = Number(o.filledQty) || 0;
    if (!(filled > was.qty + 1e-12)) return;
    this.toldFills.delete(o.id);
    this.toldFills.set(o.id, { qty: filled, avg: o.avgPrice });
    // bounded: the orders told longest ago go first (a run of the account that places this many has long let go of their pages' toasts)
    if (this.toldFills.size > TOLD_FILLS_MAX) this.toldFills.delete(this.toldFills.keys().next().value!);
    // the account's own book said this fill as it was written
    if (this.paperControls.has(o.venue)) return;
    const add = Number((filled - was.qty).toPrecision(12));
    const own = o.avgPrice !== undefined && was.qty <= 1e-12 ? o.avgPrice : o.avgPrice !== undefined && was.avg !== undefined ? (o.avgPrice * filled - was.avg * was.qty) / add : undefined;
    const good = own !== undefined && Number.isFinite(own) && own > 0;
    const price = good ? Number(own.toPrecision(8)) : o.avgPrice;
    const avg = !good && price !== undefined;
    this.stream.emit("fill", { venue: o.venue, venueName: o.venueName, ...(o.paper ? { paper: true } : {}), ref: o.ref, clientId: o.clientId, filledQty: filled, symbol: o.symbol, name: o.name, kind: o.kind, side: o.side, qty: add, ...(price !== undefined ? { price } : {}), ...(avg ? { avg: true } : {}), at: o.updatedAt, order: o.id, by: o.authority });
  }

  /** what a page that cannot resume is told the account is now (account/stream.ts snapshot): the orders still on a book or on their way, as
   * the page's orders list carries them, and each paper account's book said of itself. The page reads the rest afresh */
  private streamSnapshot(): Record<string, unknown> {
    return { orders: (this.account?.orders ?? []).filter((o) => !DONE.has(o.status)).slice(0, 60), paper: [...this.paperControls.values()].map((c) => c.summary()) };
  }

  /** THE LAST DEVICE SIGNED OUT (account/exchange.ts ownerGone): on a server that asks for a pairing code, a new one replaces this run's — a
   * code seen before lets no browser in now — and is said where the first one was, in the server's own output, which only the user reads
   * (`npm run account:service -- code` takes the last one said there) */
  private newPairingCode(): void {
    if (this.pairCode === undefined) return;
    this.pairCode = pairingCode();
    console.log(`signed out: no browser signs for the account now\n  pairing code: ${this.pairCode} — the next browser becomes the owner only with this code, typed on the page (the code before it no longer works)`);
  }

  /** A PAPER ACCOUNT the account keeps itself, as its owner runs it — what a signed resetPaper or topUpPaper does, once the door has checked
   * it (account/exchange.ts): the sum read as the connect form reads a paper account's starting money (dollars, "" for the default on a
   * reset; at most PAPER_MAX_CASH), then the book's own control (live/paper.ts). A reset of a book connected now archives it and starts it
   * again in place; one in the home that no connection has open is started again on disk, so its next connection opens the new book. Refused
   * while the account's desk has a lead open there (its leads would be left following a position the reset took away). What the paper
   * accounts' curve kept goes, and the venue's balance and positions are read again (exchange: venuesWritten) */
  private async paperControl(a: Extract<OwnerAction, { type: "resetPaper" | "topUpPaper" }>): Promise<Refusal | { ok: true; summary: string }> {
    const plan = this.paperControlPlan(a);
    if (isRefusal(plan)) return plan;
    const { venue, usd, controls } = plan;
    this.paperCurves.clear();
    if (a.type === "topUpPaper") {
      const r = controls!.topUp(usd);
      if (isRefusal(r)) return r;
      const added = this.adapters.get(venue);
      if (added) Object.assign(added.account, { paperAddedUsd: r.book.addedUsd });
      return { ok: true, summary: `${r.book.name}: ${cents(usd)} of paper money added · ${cents(r.book.cashUsd)} paper cash now · paper money, nothing real moved` };
    }
    const r = controls ? await controls.reset(usd) : resetBookOnDisk(this.opts.home, venue, usd, this.liveDeps().clock());
    if (isRefusal(r)) return r;
    const name = "book" in r && "name" in r.book ? r.book.name : venue;
    const adapter = this.adapters.get(venue);
    if (controls && adapter) {
      Object.assign(adapter.account, { paperStartUsd: usd });
      delete adapter.account.paperAddedUsd;
    }
    return { ok: true, summary: `${name} started again with ${cents(usd)} of paper money · the book before it is kept as ${r.archived} beside it, in ${paperDir(this.opts.home, venue)}${controls ? "" : " · it opens on the new book when it is connected"} · paper money, nothing real moved` };
  }
  /** what a resetPaper or topUpPaper would do, in words, for the dialog that shows it before it is signed — or why not */
  private paperControlWords(a: Extract<OwnerAction, { type: "resetPaper" | "topUpPaper" }>): Refusal | { words: string; usd: number } {
    const plan = this.paperControlPlan(a);
    if (isRefusal(plan)) return plan;
    const { usd, book } = plan;
    const holds = [book.holdings ? `${book.holdings} holding${book.holdings === 1 ? "" : "s"}` : "", book.positions ? `${book.positions} position${book.positions === 1 ? "" : "s"}` : "", book.open ? `${book.open} open order${book.open === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
    if (a.type === "topUpPaper") return { usd, words: `Add ${cents(usd)} of paper money to ${book.name}: ${cents(book.cashUsd)} paper cash now, ${cents(book.cashUsd + usd)} after. Counted as paper money put in, not as a gain. Nothing real moves.` };
    return { usd, words: `Start ${book.name} again with ${cents(usd)} of paper money. Its book as it stands — ${cents(book.cashUsd)} paper cash${holds ? `, ${holds}` : ""}, started with ${cents(book.startCashUsd)} on ${book.createdAt.slice(0, 10)} — is archived beside it, not deleted. Nothing real moves.` };
  }
  /** a resetPaper or topUpPaper read against the account: the venue (a paper account the account keeps itself, connected now — or, for a
   * reset, one whose book is in the home), the sum, the book as it stands, and its controls when it is connected */
  private paperControlPlan(a: Extract<OwnerAction, { type: "resetPaper" | "topUpPaper" }>): Refusal | { venue: string; usd: number; book: PaperBookSummary; controls?: PaperControls | undefined } {
    const venue = String(a.venue ?? "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(venue)) return no("E_ACCOUNT_BAD_ACTION", { venue, message: "a paper account is named by its id: lower-case letters, digits and dashes" });
    const raw = String(a.usd ?? "").trim();
    if (a.type === "topUpPaper" && raw === "") return no("E_ACCOUNT_BAD_ACTION", { venue, message: "say how much paper money to add, in dollars (1000, or $2,500)" });
    const usd = parsePaperCash(raw, venue);
    if (isRefusal(usd)) return no("E_ACCOUNT_BAD_ACTION", { venue, message: usd.message.replace("a paper account's starting money", a.type === "topUpPaper" ? "paper money added" : "a paper account's starting money"), detail: { field: "usd" } });
    const controls = this.paperControls.get(venue);
    const connected = this.adapters.get(venue);
    if (connected && !controls) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${connected.account.name} is not a paper account this account keeps itself: ${connected.account.connector === "live:alpaca-paper" || connected.account.connector === "live:hyperliquid-paper" ? "its paper money is the venue's own, reset there" : "nothing of it is started again from here"}` });
    if (!controls && a.type === "topUpPaper") return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${venue} is not a paper account connected now: connect it, then add paper money` });
    const book = controls ? controls.summary() : paperBooksOnDisk(this.opts.home).find((b) => b.venue === venue);
    if (!book) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue, message: `there is no paper account ${venue} on this account or in its home to start again` });
    if (a.type === "topUpPaper" && book.cashUsd + usd > PAPER_MAX_CASH) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${book.name}: a paper account holds at most ${cents(PAPER_MAX_CASH)} of paper cash; ${cents(usd)} more would make it ${cents(Number((book.cashUsd + usd).toFixed(2)))}` });
    if (a.type === "resetPaper") {
      const leads = this.desk?.openLeadsAt(venue) ?? 0;
      if (leads > 0) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `the desk has ${leads} lead${leads === 1 ? "" : "s"} open at ${book.name}: end the desk's session, or let ${leads === 1 ? "it" : "them"} close, before starting the paper account again` });
    }
    return { venue, usd, book, ...(controls ? { controls } : {}) };
  }
  /** A PAPER ACCOUNT'S CONNECTION THAT NAMES A STARTING SUM for an id whose book is kept in the home (B10, said by the server): connecting
   * that id continues its book, and the sum would go unused — the owner who typed $25,000 would trade on the $10,000 book kept from before
   * and never be told. Refused with words, whatever page or client sent it (the paper card's id picked from an old list of the books, the
   * connect form before it read them): continue it with no sum, start it again (resetPaper) with that sum, or open another id. A book just
   * started again with that very sum and untouched since (the connect form's Reset, then its connection) is the same as a new one: it
   * connects. Only the owner's connection here — never the restart's (plugAgain: the reference signed then names the sum the book started
   * with, and the book is continued as it always was). Null: nothing in the way */
  private paperKeptRule(venue: string, credentialRef: string): Refusal | null {
    const named = credentialRef.trim();
    if (!named) return null;
    const sum = parsePaperCash(named, venue);
    if (isRefusal(sum)) return null;
    let b: PaperBook | undefined;
    try {
      b = loadBook(paperBookPath(this.opts.home, venue));
    } catch {
      // a book that cannot be read: the connector says why
      return null;
    }
    if (!b) return null;
    const untouched = !Object.keys(b.orders ?? {}).length && !(b.fills ?? []).length && !Object.keys(b.holdings ?? {}).length && !Object.keys(b.positions ?? {}).length && !(b.deposits ?? []).length;
    if (untouched && b.startCashUsd === sum && b.cashUsd === sum) return null;
    return no("E_ACCOUNT_CREDENTIAL", { venue, message: `${b.name} is kept on this machine as ${venue}, with ${cents(b.cashUsd)} of paper cash: connecting ${venue} continues that book, so the ${cents(sum)} named would not be used. Connect it with no starting money to continue it, start it again with ${cents(sum)}, or open a paper account under another name`, detail: { field: "credentialRef", book: summaryOf(b) } });
  }
  /** each paper account the account keeps itself that is connected now: its book's own controls (live/paper.ts), by venue */
  private readonly paperControls = new Map<string, PaperControls>();
  /** the paper books in the home that no connection has open now: what connecting one of them would continue (the connect form says so,
   * and offers to start it again instead) */
  paperBooksIdle(): PaperBookSummary[] {
    return paperBooksOnDisk(this.opts.home).filter((b) => !this.adapters.has(b.venue));
  }

  /** the real server keeps the answer fresh without anyone asking: soon after it starts, then every 30 minutes (never in tests) */
  watchVenues(everyMs = 30 * 60_000): () => void {
    const run = () => {
      void this.venuesHere(true).catch(() => undefined);
      // a waiting connection the list does not ask about (an exchange outside the well-known few): asked here, so it comes back by itself
      const listed = new Set(venueCatalog(liveOptions(this.opts.home).options).map((c) => c.connector));
      const extra = [...new Set([...this.waiting.values()].filter((w) => !w.stopped).map((w) => w.c.connector))].filter((c) => !listed.has(c));
      if (extra.length) void this.connectReach(extra, true).catch(() => undefined);
    };
    const first = setTimeout(run, 3_000);
    const every = setInterval(run, everyMs);
    first.unref?.();
    every.unref?.();
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }
  /** which sign-in a state that came back belongs to */
  signInHolding(state: string): OAuthSignIn | undefined {
    return [...this.signIns.values()].find((s) => s.has(state));
  }

  /** Connect a venue the user REALLY has, read-only. The venue is asked through its own interface (live/): what it holds, and what it says the
   * credential may do. A live connection on the id of a simulated venue takes that venue's place until it is unplugged; either way every
   * door through it is shut, because the account sends a live venue nothing. */
  private async plugLive(venue: string, connector: string, label: string, credentialRef: string): Promise<Refusal | { ok: true; summary: string; native?: unknown }> {
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(venue)) return no("E_ACCOUNT_BAD_ACTION", { venue, message: "a venue's id is lower-case letters, digits and dashes" });
    const sim = this.adapters.get(venue);
    if (sim?.account.watchOnly) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${sim.account.name} is already connected live: unplug it before connecting it again` });
    const deps = this.liveDeps();
    const opened = await openLive({ venue, connector, label: label.trim().slice(0, 40) || sim?.account.name || "", reference: credentialRef.trim().slice(0, 200) }, deps);
    if (isRefusal(opened)) return opened;
    // its balance reads follow the same hold as its market reads: a venue that banned this address, or refuses this network, is asked
    // neither for one nor the other until the hold runs out (of the mm connection's, only what is mm's own holds its other reads)
    const adapter = await liveAccount(venue, opened.source, { connector, first: opened.first, clock: deps.clock, ...(opened.price ? { price: opened.price } : {}), held: () => this.shutNow(venue), refused: (r) => (connector !== "live:metamask" || connectionWide(r)) && this.marketReads.hold(venue, r) && this.sawRule(venue, r) });
    const src = opened.source;
    // a venue's own words for what it does not do here, as the page and the ledger show them, with this machine's address taken out (not all
    // of them passed through no())
    if (src.readOnlyBecause) src.readOnlyBecause = unaddressed(src.readOnlyBecause);
    if (src.noTradeBecause) src.noTradeBecause = unaddressed(src.noTradeBecause);
    // who showed the address is the user's: the wallet that signed the account's sentence, or the mm session on this machine
    const proven = src.address === undefined ? undefined : connector === "live:metamask" ? "the mm session on this machine" : deps.proofs.proven(src.address)?.wallet;
    // the account's own paper account says what it started with (paper.ts probe): the page shows what it made or lost since
    const native = (src.probe as { native?: { startCashUsd?: unknown } } | undefined)?.native;
    const paperStart = src.paper && typeof native?.startCashUsd === "number" && native.startCashUsd > 0 ? native.startCashUsd : undefined;
    // and the paper money its owner added since (topUpPaper), which is put in and not made
    const paperAdded = src.paperBook?.summary().addedUsd;
    Object.assign(adapter.account, { ...(proven ? { proven } : {}), ...(src.writer ? { liveCan: src.writer.can } : {}), ...(src.noTradeBecause ? { noTradeBecause: src.noTradeBecause } : {}), ...(src.readOnlyBecause ? { readOnlyBecause: src.readOnlyBecause } : {}), ...(src.paper ? { paper: true as const, ...(paperStart ? { paperStartUsd: paperStart } : {}), ...(paperAdded ? { paperAddedUsd: paperAdded } : {}) } : {}) });
    // what the key may do is read from the trader each time: a venue can say it only after connecting (Kalshi's key scopes)
    const trader = src.trader;
    // the kinds of market its trader offers, where it says them itself (the mm trader: tokens, event contracts, perpetuals); the page falls
    // back to the connector's own (accounts.ts tradeKinds) where it does not
    if (trader) Object.defineProperty(adapter.account, "liveTrade", { get: () => ({ can: trader.can, what: trader.what, ...(trader.kinds ? { kinds: [...trader.kinds] } : {}), positions: !!trader.positions, amend: !!trader.amend, leverage: !!trader.setLeverage, close: !!trader.close }), enumerable: true, configurable: true });
    this.liveVenues.set(venue, { id: venue, name: adapter.account.name, kind: adapter.account.kind, ...(src.address ? { address: src.address } : {}), ...(proven ? { proven } : {}), ...(src.writer ? { writer: src.writer } : {}), ...(src.readOnlyBecause ? { readOnlyBecause: src.readOnlyBecause } : {}), ...(src.trader ? { trader: src.trader } : {}), ...(src.noTradeBecause ? { noTradeBecause: src.noTradeBecause } : {}), ...(src.paper ? { paper: true as const } : {}), via: src.via });
    // a paper account the account keeps itself is looked at between the page's reads (watchPaper): its stops, its days, its funding; its
    // owner starts it again or adds paper money through its book's own controls (paperControl)
    if (src.settle) this.paperLooks.set(venue, src.settle);
    else this.paperLooks.delete(venue);
    if (src.paperBook) this.paperControls.set(venue, src.paperBook);
    else this.paperControls.delete(venue);
    // a paper account this one replaces is let go (its markets' ticks judge its book no more); this one's markets are priced by their own
    // sources' streams (priceSource)
    this.paperStops.get(venue)?.();
    if (src.stop) this.paperStops.set(venue, src.stop);
    else this.paperStops.delete(venue);
    if (src.priceSource) this.priceSources.set(venue, src.priceSource);
    else this.priceSources.delete(venue);
    // what its book tells as it changes goes to the pages at once (paperSaid): the listener of a connection this one replaces is let go first
    this.paperUnlisten.get(venue)?.();
    const off = src.paperEvents?.listen((c) => this.paperSaid(venue, c));
    if (off) this.paperUnlisten.set(venue, off);
    else this.paperUnlisten.delete(venue);
    // its earn: the source's own (the mm wallet's vaults), or — at OKX and Kraken — the exchange's, through the trader's own client and key
    const hook = exchangeEarnHook(src.trader);
    const earner = src.earner ?? (hook ? exchangeEarner({ ...hook, price: deps.price, now: deps.clock }) : undefined);
    if (earner) this.earners.set(venue, earner);
    else this.earners.delete(venue);
    if (sim) this.shadowed.set(venue, sim);
    this.adapters.set(venue, adapter);
    // the venue has just answered this network: no hold, kept read or health under its id from before carries over (a keyless source's
    // refusal on the network the user left, an earlier connection's)
    this.marketReads.forget(venue, true);
    this.ruleSeen.delete(venue);
    // Markets and the comparison were answered from what the venues listed before this one: they are asked again
    this.marketReads.forgetAll(["explore", "compare"]);
    const usd = r2((await adapter.read()).reduce((s, h) => s + h.usd, 0));
    // what this connection may do with the money there: nothing unless the server moves real money, and then only what the owner signs
    const writes = this.opts.liveWrites;
    const can = src.writer?.can;
    const leaves = !!can && (can.withdraw !== false || (can.ledgers.length > 1 && can.transfer !== false) || can.swap !== false || !!can.send);
    const mode = src.paper ? "a paper account: its orders are rehearsals and its balance is not money, so nothing of it is counted in your net worth or moved from here" : !src.writer ? `read only: ${src.readOnlyBecause ?? "nothing is sent to it from here"}` : !writes ? "read only: this server was started without real-money writes" : src.address !== undefined && !proven && src.writer.can.send === "wallet" ? "watched: no wallet signed for this address, so nothing is sent to or from it" : !leaves ? "this key only reads: money can be sent to it, nothing leaves it from here" : `real money moves only when you sign it, at most ${cents(writes.capUsd)} a movement`;
    // the wallet's proof rides on the connection's row: a restarted account checks the signature again rather than forgetting it was given
    const proof = src.address !== undefined && connector !== "live:metamask" ? deps.proofs.proven(src.address) : undefined;
    const kept = proof?.message && proof.signature ? { address: proof.address, wallet: proof.wallet, at: proof.at, message: proof.message, signature: proof.signature } : undefined;
    return { ok: true, summary: unaddressed(`${adapter.account.name} connected ${src.paper ? "· PAPER, no real money" : "live"} · ${cents(usd)} there now · ${opened.summary} · ${mode}${sim && !this.opts.real ? " · it stands in for the simulated one until it is unplugged" : ""}`), native: { connector, probe: opened.source.probe.native ?? null, ...(kept ? { proof: kept } : {}) } };
  }

  private unplug(venue: string): Refusal | { ok: true; summary: string } {
    const a = this.adapters.get(venue);
    // a connection still waiting for its venue to answer this network is read nowhere yet: disconnecting it stops the asking, and the
    // ledger row keeps a later restart from bringing it back
    const w = a ? undefined : this.waiting.get(venue);
    if (w && this.stopWaiting(venue, false)) return { ok: true, summary: `${this.connectionName(w.c)} is disconnected: ${w.stopped ? (byVenue(w.last) ? "the venue had refused the connection" : "this account could not open it") : w.how === "restart" ? "it was waiting to come back after the restart" : "it was waiting for the venue to answer this network"}, and the account will not ask it again. ${w.c.connector === "live:wallet" || w.c.connector === "live:polymarket" || w.c.connector === "live:hyperliquid" || w.c.connector === "live:ondo" ? "It was to be read by its address, so there is no key to delete" : "The key at the venue is untouched: delete it there"}` };
    if (!a) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue });
    if (!a.account.plugged) return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${a.account.name} is one of the venues the account opened with: only a venue that was plugged in can be unplugged` });
    // an agent wallet is the account's own: this account holds its key, and the money in it is the owner's. Disconnecting it would only
    // hide that money (and leave the wallet with no way back on the page); it is emptied instead, and goes with the agent's sub-account
    if (a.account.connector === "live:agent-wallet") return no("E_ACCOUNT_BAD_ACTION", { venue, message: `${a.account.name} is an agent wallet: it is not disconnected, because it holds money this account has the key for. Empty it with Take back… first; it leaves the account with the agent's sub-account` });
    this.liveVenues.delete(venue);
    this.paperLooks.delete(venue);
    this.paperControls.delete(venue);
    this.paperStops.get(venue)?.();
    this.paperStops.delete(venue);
    this.priceSources.delete(venue);
    this.paperUnlisten.get(venue)?.();
    this.paperUnlisten.delete(venue);
    this.earners.delete(venue);
    this.earnSeen.delete(venue);
    this.marketReads.forget(venue);
    this.ruleSeen.delete(venue);
    // Markets and the comparison were answered with this venue among the connected ones: they are asked again
    this.marketReads.forgetAll(["explore", "compare"]);
    // a live connection that stood in for a simulated venue: the simulated one comes back
    const sim = this.shadowed.get(venue);
    if (sim) {
      this.shadowed.delete(venue);
      this.adapters.set(venue, sim);
      // on a real account the simulated one comes back to the statement page only
      return { ok: true, summary: `${a.account.name} disconnected: the account no longer reads the real venue${this.opts.real ? "" : ", and the simulated one is back"}. The key at the venue is untouched: delete it there` };
    }
    if (a.account.watchOnly) {
      this.adapters.delete(venue);
      // what it holds stays where it is, at the venue or at the address: only the account's reading of it ends. A venue read by its
      // address had no key here to delete; one connected by a key keeps that key at the venue
      return { ok: true, summary: `${a.account.name} disconnected: the account no longer reads it. ${a.account.address ? "What is at the address stays there; it was read by its address, so there is no key to delete" : "The key at the venue is untouched: delete it there"}` };
    }
    this.adapters.delete(venue);
    const listed = this.walletAllow.indexOf(a.account.address ?? venue);
    if (listed >= 0) this.walletAllow.splice(listed, 1);
    return { ok: true, summary: `${a.account.name} unplugged: the account no longer reads it or routes through it. The credential at the venue is untouched: delete it there` };
  }

  /** the account layer's front door: one signed instruction. A write that reached a venue changes what that venue's reads say, so what was
   * kept of them goes (positions, prices, earn): the next page read sees the new position, leverage or balance within one poll, not when
   * the keep runs out. A card changes nothing at the venue yet; a refusal changes nothing at all — nor does a card the owner rejected, or a
   * move or order still waiting for the wallet to send it. Only a venue the outcome says was reached is taken as having answered, which
   * lifts a hold it set (a ban, its place rule): the other end of a move that only waits for the money is not */
  async exchange(envelope: Envelope): Promise<Outcome> {
    if (!this.account) return no("E_ACCOUNT_BAD_ACTION", { message: "the account layer is not mounted on this service" });
    const r = await this.account.exchange(envelope);
    if (isRefusal(r) || r.kind === "card") return r;
    const reached = reachedVenue(r);
    if (reached === "no") return r;
    const action = (envelope.action && typeof envelope.action === "object" ? envelope.action : {}) as { type?: unknown; card?: unknown };
    const card = action.type === "approveCard" ? this.approvals.find((x) => x.id === action.card) : undefined;
    const move = (card?.action as { type?: unknown } | undefined)?.type ?? action.type;
    const from = r.kind === "payment" ? r.payment.from : undefined;
    for (const v of this.venuesWritten(envelope.action)) {
      // a move's destination answered only when its deposit address was asked of it (an exchange's own answer; a wallet's address is its
      // own). A write whose answer was lost may have landed: what was kept of the venue's reads goes, and its hold stands
      const asked = reached === "yes" && (!(move === "liveMove" || move === "agentLiveMove") || v === from || this.liveVenues.get(v)?.address === undefined);
      this.marketReads.drop(v, asked);
      if (asked) this.adapters.get(v)?.wake?.();
    }
    return r;
  }

  /** the venues a signed instruction writes at, when it is one that writes at a venue: an order and what is done to it, a movement's two
   * ends, money into or out of earn, and a card the owner approved (the venue of what it released) */
  private venuesWritten(action: unknown): string[] {
    const a = (action && typeof action === "object" ? action : {}) as { type?: unknown; venue?: unknown; from?: unknown; to?: unknown; card?: unknown };
    const text = (x: unknown): string[] => (typeof x === "string" && x ? [x] : []);
    switch (a.type) {
      case "liveOrder":
      case "agentLiveOrder":
      case "liveCancel":
      case "agentLiveCancel":
      case "liveAmend":
      case "agentLiveAmend":
      case "liveClose":
      case "agentLiveClose":
      case "liveLeverage":
      case "agentLiveLeverage":
      case "liveEarn":
      case "agentLiveEarn":
      case "resetPaper":
      case "topUpPaper":
        return text(a.venue);
      case "liveMove":
      case "agentLiveMove":
        return [...new Set([...text(a.from), ...text(a.to)])];
      case "approveCard": {
        const card = this.approvals.find((x) => x.id === a.card);
        return card ? [...new Set([...text(card.account), ...(card.action ? this.venuesWritten(card.action) : [])])] : [];
      }
      default:
        return [];
    }
  }

  /** what the Account page reads: the engine's page, with what each venue connected live has in its earn products added to that venue
   * (account/holdings.ts withEarn) — so the venue's total, the live total and the net worth curve count it, once */
  async accountView(): Promise<AccountPage | undefined> {
    const page = await this.account?.view();
    // a real account's page waits only on cards about its real venues; the statement page answers the simulation's own
    if (page && this.opts.real) page.cards = page.cards.filter((c) => this.adapters.get(this.approvals.find((a) => a.id === c.id)?.account ?? "")?.account.watchOnly);
    if (page && this.restored) page.restore = this.restored;
    if (page) await this.withEarnings(page);
    // the key file a venue connected by API key reads, as the owner signed it (a path, never what is in it): a new key for the venue goes
    // in the same file, and connecting it again starts from that file — a second account at an exchange never from the first one's
    if (page) {
      for (const v of page.venues) {
        const kind = v.live && v.connector ? parseConnector(v.connector)?.kind : undefined;
        const ref = this.adapters.get(v.id)?.account.credentialRef;
        if (kind && KEY_SHAPES[kind] && ref) v.keyFile = ref;
        // a connected venue that does not serve the network the account runs on now (it moved, or the venue changed its line): said as
        // that state, with the edition for where the user is when the venue has one that serves it — not as a read that failed
        // the list of where the user can connect, as it judged this connection from the network the account runs on: a trading line that
        // closes this place (Hyperliquid's), or close-only (Polymarket's for a US network)
        // only an answer asked in the last ten minutes, as the door counts it: an older one may be of the network the user left
        const kept = v.live && v.connector ? this.venuesKept?.v.find((x) => x.connector === v.connector) : undefined;
        const judged = kept?.asked !== undefined && this.liveDeps().clock() - Date.parse(kept.asked) < 600_000 ? kept : undefined;
        const out = v.live ? (notServedBy(this.shutNow(v.id)) ?? (judged?.verdict === "not-served" ? judged.said ?? `${v.name} does not serve this location` : undefined)) : undefined;
        if (out) v.notServed = { said: out, ...(judged?.edition ? { edition: judged.edition } : {}) };
        else if (judged?.verdict === "close-only") v.closeOnly = { said: judged.said ?? `${v.name} lets this location close positions, not open new ones` };
      }
    }
    return page;
  }

  /** what each venue connected live had in its earn products when it last answered, with the balance it was read beside (that read's `asOf`,
   * and its lines as the engine gave them, before any earn was added): a read that fails or is late keeps these, marked stale, so a venue
   * that blinks does not look like money gone — and while they are young, the two are shown together, one moment's pair */
  private readonly earnSeen = new Map<string, { asOf: string; base: AccountPage["venues"][number]["holdings"]; held: EarnHeld[] }>();
  /** an earn vault's share token's symbol, by product id, as its chain gave it (read once: a token does not rename itself) */
  private readonly shareSymbols = new Map<string, string>();

  /** Each venue connected live that earns: its earn positions, added to its holdings with the balance lines that are the same money left
   * out, and the venue's total, the live total and the account's total moved by what that changes. The positions are read again whenever
   * the venue's balance is (they are kept under the balance's own `asOf`), so the two are always one moment's pair: money that went from
   * the balance into a product is never counted in both, or in neither, for the half minute one of them is older than the other. The page
   * waits at most three seconds for a venue's earn; when it is slower, or does not answer, the venue is marked stale (so a net worth point
   * taken then is `partial`) and shows the last pair the two were read in together — its balance from then as well as its earn, while that
   * pair is under two minutes old — so money that just moved between them is not counted twice or not at all. An older pair is not shown in
   * place of a newer balance: the newer balance stands, beside the earn as last read, and the venue stays marked. The read carries on for
   * next time */
  private async withEarnings(page: AccountPage): Promise<void> {
    const venues = page.venues.filter((v) => v.live && this.earners.has(v.id) && this.adapters.get(v.id)?.account.watchOnly);
    if (!venues.length) return;
    const now = this.realNow();
    const got = await Promise.all(venues.map(async (v) => {
      const id = v.id;
      const x = this.earners.get(id)!;
      const asOf = this.adapters.get(id)?.account.asOf ?? "";
      const base = v.holdings;
      // a pair is kept only if it is not older than the one already kept: a late answer to an older read does not push out a newer pair
      const keep = (r: EarnPosition[]): EarnHeld[] => {
        const held = r.map(heldOf);
        const was = this.earnSeen.get(id);
        if (!was || was.asOf <= asOf) this.earnSeen.set(id, { asOf, base, held });
        return held;
      };
      const read = this.marketReads.get(`earn-held|${id}|${asOf}`, KEEP_HELD_MS, () => x.positions(), this.earnAt(id));
      // whenever it answers, the next page has it, beside the balance it was read with
      void read.then((r) => (isRefusal(r) ? undefined : keep(r))).catch(() => undefined);
      const r = await within(3_000, read, id, this.nameOf(id));
      if (!isRefusal(r)) {
        const held = keep(r);
        return { v, base, held, stale: false, shares: await this.vaultShares(held) };
      }
      const seen = this.earnSeen.get(id);
      // its earn has never answered: there is nothing of it to show, and no pair — and the venue is marked, so a net worth point taken now
      // is partial and what later turns up in its earn products is money that appeared, not a gain
      if (!seen) return { v, base, held: [] as EarnHeld[], stale: true, shares: new Map<string, string>(), why: "its earn has not answered yet: what is in its earn products is not counted" };
      const shares = await this.vaultShares(seen.held);
      // the earn last answered beside this very balance read: the two are one moment's, only that moment is not now
      if (seen.asOf === asOf) return { v, base, held: seen.held, stale: seen.held.length > 0, shares };
      const at = Date.parse(seen.asOf);
      if (Number.isFinite(at) && now - at <= PAIR_MS) return { v, base: seen.base, held: seen.held, stale: true, shares, asOf: seen.asOf, why: `its earn did not answer in time, so its balance and its earn are both as read together at ${new Date(at).toISOString().slice(11, 19)} UTC` };
      return { v, base, held: seen.held, stale: true, shares, why: "its earn did not answer: what is in its earn products is the last read, beside a newer balance" };
    }));
    let delta = 0;
    for (const { v, base, held, stale, shares, asOf, why } of got) {
      if (why) {
        v.stale ??= why;
        if (asOf) v.asOf = asOf;
      }
      if (!held.length && base === v.holdings) continue;
      const before = v.usd;
      v.holdings = withEarn({ name: v.name, holdings: base }, held, { stale, shares }).holdings;
      v.usd = Number(v.holdings.reduce((s, h) => s + h.usd, 0).toFixed(2));
      v.cashUsd = Number(v.holdings.filter((h) => (h.class === "stable" || h.class === "cash") && !h.inTransit).reduce((s, h) => s + h.usd, 0).toFixed(2));
      delta += v.usd - before;
    }
    if (delta === 0) return;
    page.liveUsd = Number((page.liveUsd + delta).toFixed(2));
    page.totalUsd = Number((page.totalUsd + delta).toFixed(2));
  }

  /** the share token's symbol of each vault held (`<chain id>:<vault>` products), read from its chain once and kept; at most two seconds */
  private async vaultShares(held: EarnHeld[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const chain = this.liveDeps().chain;
    await Promise.all(held.map(async (p) => {
      const m = /^(\d{1,9}):(0x[0-9a-fA-F]{40})$/.exec(p.product);
      if (!m) return;
      const known = this.shareSymbols.get(p.product);
      if (known) return void out.set(p.product, known);
      const name = CHAIN_BY_ID.get(Number(m[1]));
      if (!name || !chain.symbol) return;
      const sym = await within(2_000, chain.symbol(name, m[2] as Hex).then((x) => x ?? no("E_VENUE_UNREACHABLE", { message: "no symbol" })), "chain", name);
      if (typeof sym === "string") {
        this.shareSymbols.set(p.product, sym);
        out.set(p.product, sym);
      }
    }));
    return out;
  }

  /** push the simulated clock ahead and land whatever came due on the way */
  async advance(ms: number): Promise<string> {
    if (!(ms > 0)) return this.now();
    this.skewMs += ms;
    this.ledger.append({ kind: "note", venue: "*", reason: `simulated clock +${Math.round(ms / 60_000)} min → ${this.now()}` });
    await this.account?.settle();
    return this.now();
  }

  static async create(opts: ServiceOptions): Promise<PortfolioService> {
    const seeds = opts.seeds ?? loadSeeds(opts.venues);
    // the `mm` reads stand in for two simulated accounts; a real service has none to stand in for (MetaMask is connected like any account)
    const live = opts.live && !opts.real ? { metamask: await metamaskLiveAccount(opts.mm), polymarket: await polymarketLiveAccount(opts.mm) } : undefined;
    const svc = new PortfolioService(opts, seeds, live);
    if (opts.real && svc.account && !opts.freshLedger) await svc.continueRuns();
    return svc;
  }

  /** A real account continues its earlier runs (account/restore.ts): this run's first row says which file it continues; the owner, the agents,
   * their limits, the dial and the ids come back at once — every signature checked again — and the venues are connected again in the
   * background, the door holding every instruction until they have been. `--fresh` starts from nothing instead */
  private async continueRuns(): Promise<void> {
    const engine = this.account!;
    const history = readHistory(join(this.opts.home, "portfolio"), this.ledger.path(), this.now);
    const fresh = this.opts.fresh === true || history.last === null;
    const mark: RunMark = { v: 1, continues: fresh ? null : history.last, fresh, n: history.lastRun + 1 };
    // a fresh account's first row also holds its dial, so that a restart keeps the session it started with rather than starting a new one
    this.ledger.append({ kind: "note", venue: "*", reason: fresh ? `account run started fresh${this.opts.fresh ? " (--fresh): nothing earlier is brought back" : ""}` : `account run started: it continues ${history.last}`, detail: { run: mark, ...(fresh ? this.dialNow() : {}) } });
    // the statement reads these files, the account's other runs and this run's — and no ledger that no account run wrote
    this.ledgerChain = fresh ? [] : history.files;
    if (fresh) return;
    // a replayed agent wallet is the key file it was made with: one that is gone is not made again under the same name (the wallet is
    // named, never the file: the message reaches the page and the agents' seats)
    const home = this.opts.home;
    const r = await rebuild(history.rows, engine.state, { ...engine.applyOptions(), nowMs: Date.parse(this.now()), codeRequired: (this.opts.liveWrites?.pairingCode ?? this.opts.pairingCode) !== undefined, walletAddress: (name) => (hasKey(agentWalletKeyPath(home, name)) ? (() => { const k = agentWalletKey(home, name); return isRefusal(k) ? k : (k.address as Hex); })() : no("E_ACCOUNT_CREDENTIAL", { message: `the agent wallet "${name}" is not brought back: its key file is gone from this account's home, and an agent wallet is the key it was made with`, detail: { wallet: name } })) });
    engine.adopt(r.state, r.ids, r.fired);
    this.seq = Math.max(this.seq, r.ids.card);
    if (r.dial) this.adoptDial(r.dial);
    const report: RestoreReport = { runs: history.files.length, from: history.files[0] ?? "", owner: r.owner, agents: r.state.agents.filter((a) => a.revokedAt === undefined && a.validUntil > Date.parse(this.now())).length, limits: r.state.spends.filter((x) => x.revokedAt === undefined && x.validUntil > Date.parse(this.now())).length, mode: this.openness.mode === "open" ? "Beast" : "Guard", venues: r.connections.map((c) => ({ venue: c.venue, ok: false, why: "connecting again" })), orders: r.orders.length, payments: r.payments.length + r.authorisations.length + r.earns.length, skipped: [...r.skipped, ...(history.broken ? [`${history.broken.file}: its hash chain breaks${history.broken.at ? ` at row ${history.broken.at}` : ""}, so nothing after the break (and nothing older) was brought back`] : [])], state: "restoring" };
    this.restored = report;
    this.reconnecting = true;
    this.restoring = engine
      .serially(() => this.reconnect(r, report))
      .catch(() => undefined)
      .finally(() => void (this.reconnecting = false));
  }

  /** an agent wallet on the account: read from the chains, proven the user's (the account holds its key), a place money can be sent to */
  private async plugAgentWallet(sub: SubAccount): Promise<void> {
    const venue = agentWalletVenue(sub.name);
    if (this.adapters.get(venue)?.account.watchOnly) return;
    const key = agentWalletKey(this.opts.home, sub.name);
    if (isRefusal(key)) return void this.ledger.append({ kind: "note", venue, reason: `the agent wallet "${sub.name}" is not shown: ${key.message}` });
    const deps = this.liveDeps();
    const opened = await agentWalletSource({ venue, label: `Agent wallet · ${sub.name}`, key, chain: deps.chain, sender: deps.sender ?? publicSender() });
    if (isRefusal(opened)) return void this.ledger.append({ kind: "note", venue, reason: `the agent wallet "${sub.name}" could not be read: ${opened.message}` });
    const adapter = await liveAccount(venue, opened.source, { connector: "live:agent-wallet", first: opened.first, clock: deps.clock, price: deps.price });
    const proven = "this account holds its key";
    Object.assign(adapter.account, { proven, liveCan: opened.source.writer!.can, noTradeBecause: opened.source.noTradeBecause, plugged: true });
    this.liveVenues.set(venue, { id: venue, name: adapter.account.name, kind: adapter.account.kind, address: key.address, proven, writer: opened.source.writer!, noTradeBecause: opened.source.noTradeBecause!, via: opened.source.via });
    this.adapters.set(venue, adapter);
    // one more venue on the account: Markets and the comparison are asked again
    this.marketReads.forgetAll(["explore", "compare"]);
  }

  /** the restore's second half: the venues, from the same credential references the owner signed; then what was in flight, followed again */
  private async reconnect(r: Rebuilt, report: RestoreReport): Promise<void> {
    const engine = this.account!;
    // the agent wallets the owner made: their keys are where they were made, in this home
    for (const sub of r.state.subAccounts) await this.plugAgentWallet(sub);
    for (const [i, c] of r.connections.entries()) {
      // a wallet's proof is the signature it gave, checked again; one that no longer checks out connects the address as watched
      if (c.proof && (await proofHolds(c.proof))) this.proofs.keep(c.proof);
      const out = await this.plugAgain(c);
      if (isRefusal(out)) {
        // how this network was just then (not an answer of the venue's or the key's): kept, and asked again, never given up for the run.
        // The venue's own no about the key or the account: kept too, stopped, in its words, for the owner to connect again or disconnect
        const w = this.wait(c, out, "restart", { report, i });
        this.ledger.append({ kind: "note", venue: c.venue, reason: w.stopped ? `not connected again after the restart: ${out.message}` : `not connected again after the restart yet: ${w.said}` });
        continue;
      }
      report.venues[i] = { venue: c.venue, ok: true };
      this.ledger.append({ kind: "note", venue: c.venue, reason: `connected again after the restart · ${out.summary}` });
    }
    for (const o of r.orders) engine.trade.adopt(o);
    for (const p of r.payments) engine.live.adopt(p);
    for (const e of r.earns) engine.earn.adopt(e);
    for (const k of r.authorisations) engine.adoptAuthorisation(k);
    report.state = "done";
    const back = report.venues.filter((v) => v.ok).length;
    const waiting = report.venues.filter((v) => v.waiting).length;
    this.ledger.append({ kind: "note", venue: "*", reason: `restored after a restart: ${report.owner ? "your device is still the owner" : "no owner yet"} · ${report.agents} agent${report.agents === 1 ? "" : "s"} · ${report.limits} limit${report.limits === 1 ? "" : "s"} · ${back} of ${report.venues.length} venue${report.venues.length === 1 ? "" : "s"} connected again${waiting ? ` (${waiting} asked again when ${waiting === 1 ? "it answers" : "they answer"})` : ""} · ${report.orders} order${report.orders === 1 ? "" : "s"} and ${report.payments} movement${report.payments === 1 ? "" : "s"} followed again · ${report.mode}${report.skipped.length ? ` · ${report.skipped.length} not brought back` : ""}`, detail: { restore: report } });
  }

  /** one saved connection, connected again from the credential reference the owner signed; a throw is no answer (its words, with this
   * machine's address taken out before they are cut) */
  private async plugAgain(c: Rebuilt["connections"][number]): Promise<Awaited<ReturnType<PortfolioService["plugLive"]>>> {
    try {
      return c.connector.startsWith("live:") ? await this.plugLive(c.venue, c.connector, c.label, c.credentialRef) : no("E_ACCOUNT_BAD_ACTION", { venue: c.venue, message: "not a live connection" });
    } catch (err) {
      return no("E_VENUE_UNREACHABLE", { venue: c.venue, message: unaddressed(String((err as Error)?.message ?? err)).slice(0, 160) });
    }
  }

  /** CONNECTIONS WAITING FOR THEIR VENUE TO ANSWER THIS NETWORK, by venue: a connection the owner signed whose venue refused the network
   * (its place rule, its edge), did not answer (no network yet at login, a captive portal, an outage, a ban or a wait until its time,
   * Hyperliquid's place not known just now) or sent the request elsewhere — met as the owner connected it (`how: connect`), or as a restart
   * brought it back (`how: restart`). Either way the connection is kept — the venue, the connector, the key file's place or the address, as
   * signed — and read nowhere until the venue answers. What this network answers decides nothing about the account's structure: a user on
   * another network, or this one on another day, gets the venue's own answer then. Each is asked again — one that did not answer on a
   * backoff (20 s, or 15 s after a redirect; then 30 s, 1 min … a quarter of an hour at most; a held refusal not before its hold runs out), and at once when a re-check of
   * this network finds its venue answering (Check again, or the half-hourly check) — until it connects. A place rule or an edge page is
   * asked again only by such a re-check: the venue's own rule is not knocked on, only learned again when the network has changed. The owner
   * connecting or disconnecting the venue meanwhile wins, and ends it. A venue that answers and refuses the connection itself (the key,
   * the account) — at a restart, or after a wait — ends the asking (`stopped`): the connection stays in the list with the venue's words,
   * read nowhere, for the owner to connect it again (one signature, after mending the key) or disconnect it; no check asks it again */
  private readonly waiting = new Map<string, Waiting>();

  /** the next ask for a waiting connection, and the words for it (kept on it: the page, the doors and the agents read them) */
  private waitLater(w: Waiting): string {
    if (w.timer) clearTimeout(w.timer);
    w.timer = undefined;
    // the venue's rule for this network, or a network that names no place (Hyperliquid's line cannot be held to it): asked again only when a
    // check of the network finds it changed — the venue's rule is not knocked on, nor are the place's sources every few minutes
    if (w.last.code === "E_VENUE_GEOBLOCKED" || ipListed(w.last)) w.said = `${w.last.message} — asked again when a check of this network finds it answering (Check again, or the half-hourly check)`;
    else {
      const ms = Math.max(COMING_BACK_MS[Math.min(w.tries, COMING_BACK_MS.length - 1)]!, holdBackMs(w.last));
      w.timer = setTimeout(() => void this.tryAgain(w.c.venue), ms);
      w.timer.unref?.();
      w.said = `${w.last.message} — asked again in ${waitText(ms)}`;
    }
    return w.said;
  }

  /** keep a connection the venue did not take (`r`: how): waiting, when `r` is how this network answered; stopped, when the venue answered
   * and refused the connection itself. In place of any earlier wait for the same venue; `row`: the restore report's line for it, kept up
   * to date while it waits */
  private wait(c: Rebuilt["connections"][number], r: Refusal, how: Waiting["how"], row?: Waiting["row"]): Waiting {
    const before = this.waiting.get(c.venue);
    if (before?.timer) clearTimeout(before.timer);
    // the restore report's line stays with the connection when the owner connects it again while a restart was bringing it back
    const line = row ?? before?.row;
    const w: Waiting = { c, how, since: this.liveDeps().clock(), ...(line ? { row: line } : {}), tries: 0, last: r, said: "" };
    this.waiting.set(c.venue, w);
    if (ofThisNetwork(r)) {
      this.waitLater(w);
      if (w.row) w.row.report.venues[w.row.i] = { venue: c.venue, ok: false, why: "connecting again", waiting: true, said: w.said };
    } else this.stop(w, r);
    return w;
  }

  /** the venue answered and said no to the connection itself, or this account's own check did (the key file not there, mm not installed):
   * not asked again. The connection stays, with the words, for the owner to connect it again (another key, one signature) or disconnect it */
  private stop(w: Waiting, r: Refusal): void {
    if (w.timer) clearTimeout(w.timer);
    w.timer = undefined;
    w.last = r;
    w.stopped = true;
    w.said = `${r.message}. Not asked again: connect it again, or disconnect it`;
    if (w.row) w.row.report.venues[w.row.i] = { venue: w.c.venue, ok: false, why: r.message };
  }

  /** The owner connects a venue: through its own interface, as plugLive does — and when the venue did not answer this network, or refuses
   * it, the connection is kept waiting rather than refused (`wait`): the account's structure is the owner's signature, not this network's
   * answer. A no about the key, the address or the account itself is the venue's answer, and a refusal as before */
  private async plugOrWait(venue: string, connector: string, label: string, credentialRef: string): Promise<Refusal | { ok: true; summary: string; native?: unknown }> {
    const c: Rebuilt["connections"][number] = { venue, connector, label: label.trim().slice(0, 40), credentialRef: credentialRef.trim().slice(0, 200), at: this.now() };
    const r = await this.plugAgain(c);
    if (!isRefusal(r)) {
      // connected by the owner: a wait for it (a restart still bringing it back) has nothing left to do
      this.stopWaiting(venue, true);
      return r;
    }
    if (!ofThisNetwork(r)) return r;
    const kind = parseConnector(connector)?.kind;
    const key = kind !== undefined && KEY_SHAPES[kind] !== undefined;
    // an address the owner's wallet signed for: the proof rides on the ledger row, as it does for a connection that answered
    const proof = !key && /^0x[0-9a-fA-F]{40}$/.test(c.credentialRef) ? this.liveDeps().proofs.proven(c.credentialRef) : undefined;
    const kept = proof?.message && proof.signature ? { address: proof.address, wallet: proof.wallet, at: proof.at, message: proof.message, signature: proof.signature } : undefined;
    const w = this.wait({ ...c, ...(kept ? { proof: kept } : {}) }, r, "connect");
    return { ok: true, summary: unaddressed(`${this.connectionName(c)} is on the account, waiting for the venue to answer this network: ${w.said}. Nothing is sent to it until it answers${key ? "; the key file stays where you saved it" : ""}`), native: { connector, waiting: true, ...(kept ? { proof: kept } : {}) } };
  }

  /** a waiting connection asked again now: its venue's own keyless question first, outside the account's line — a venue this network still
   * leaves unanswered (or refuses) is not connected under the line, which every signed instruction waits on; one blackholed venue must not
   * stall the others' orders and cancels — then the connection itself, through the line, so an instruction is not let through halfway. A
   * venue the owner connected in the meantime is left as the owner connected it */
  private async tryAgain(venue: string): Promise<void> {
    const w = this.waiting.get(venue);
    // asked already (a re-check and the backoff at once): one ask at a time
    if (!w || w.asking || !this.account) return;
    if (w.timer) clearTimeout(w.timer);
    w.timer = undefined;
    w.asking = true;
    let out: Awaited<ReturnType<PortfolioService["plugAgain"]>> | undefined;
    try {
      const here = await this.connectReach([w.c.connector]).then(([x]) => x, () => undefined);
      out = here && (here.state === "unreachable" || here.state === "location")
        ? no(here.state === "location" ? "E_VENUE_GEOBLOCKED" : "E_VENUE_UNREACHABLE", { venue, message: here.said ?? `${this.connectionName(w.c)} did not answer`, ...(here.until ? { native: { until: here.until } } : {}) })
        : await this.account.serially(async () => (this.waiting.get(venue) !== w || this.adapters.get(venue)?.account.watchOnly ? undefined : this.plugAgain(w.c)));
    } finally {
      w.asking = false;
    }
    // stopped meanwhile (the owner connected or disconnected it), or connected some other way: nothing more to ask
    if (this.waiting.get(venue) !== w) return;
    if (out === undefined) return void this.stopWaiting(venue, true);
    w.tries++;
    const name = this.connectionName(w.c);
    const asked = `asked ${w.tries + 1} times`;
    if (!isRefusal(out)) {
      this.waiting.delete(venue);
      this.account.trade.letGo(venue);
      if (w.row) w.row.report.venues[w.row.i] = { venue, ok: true };
      this.ledger.append({ kind: "note", venue, reason: w.how === "restart" ? `connected again after the restart (${asked}) · ${out.summary}` : `${name} answered this network and is connected (${asked} since you connected it) · ${out.summary}` });
      return;
    }
    if (!ofThisNetwork(out)) {
      this.stop(w, out);
      this.ledger.append({ kind: "note", venue, reason: w.how === "restart" ? `not connected again after the restart: ${out.message}` : `${byVenue(out) ? `${name} answered this network and refused the connection` : `${name} could not be connected`}: ${out.message}` });
      return;
    }
    w.last = out;
    w.stopped = undefined;
    this.waitLater(w);
    if (w.row) w.row.report.venues[w.row.i] = { venue, ok: false, why: "connecting again", waiting: true, said: w.said };
  }

  /** the owner connected or disconnected a venue that was waiting: the owner's act stands, and no more is asked for it. `connected`: what
   * the restore's report says of it now, when a restart was bringing it back */
  private stopWaiting(venue: string, connected: boolean): boolean {
    const w = this.waiting.get(venue);
    if (!w) return false;
    if (w.timer) clearTimeout(w.timer);
    this.waiting.delete(venue);
    if (w.row) w.row.report.venues[w.row.i] = connected ? { venue, ok: true } : { venue, ok: false, why: w.stopped ? "disconnected by the owner after it could not be connected" : "disconnected by the owner while it was waiting to come back" };
    return true;
  }

  /** while a connection on the account waits for its venue to answer this network: why, in the words its wait gives — what the account's
   * door tells someone who asks it to act there meanwhile (a cancel is not "unfollowed" while the venue may still answer). Nothing for one
   * the venue answered and refused: that one is not coming back on its own */
  waitingWords(venue: string): string | undefined {
    const w = this.waiting.get(venue);
    if (!w || w.stopped) return undefined;
    const name = this.connectionName(w.c);
    return w.how === "restart" ? `${name} has not come back after the restart yet: ${w.said}` : `${name} is connected but has not answered this network yet: ${w.said}`;
  }

  /** the connections waiting for their venue, as the page and the agents read them (account/exchange.ts WaitingConnection): the venue,
   * the connector, the key file's place or the address as the owner signed them, why, since when, and how they came to wait */
  waitingList(): WaitingConnection[] {
    const options = liveOptions(this.opts.home).options;
    return [...this.waiting.values()].map((w) => {
      const kind = parseConnector(w.c.connector)?.kind;
      const needs: WaitingConnection["needs"] = (kind && options.find((o) => o.kind === kind)?.needs) || "key-file";
      return {
        venue: w.c.venue,
        name: this.connectionName(w.c),
        connector: w.c.connector,
        needs,
        ...(needs === "key-file" ? { keyFile: w.c.credentialRef || defaultKeyRef(w.c.venue) } : {}),
        ...(needs === "address" ? { address: w.c.credentialRef } : {}),
        said: w.said,
        code: w.last.code,
        ...(w.how === "restart" ? lastRead(this.netWorth().lastOf(w.c.venue)) : {}),
        by: byVenue(w.last) ? ("venue" as const) : ("account" as const),
        since: new Date(w.since).toISOString(),
        how: w.how,
        ...(w.stopped ? { stopped: true as const } : {}),
      };
    });
  }

  /** a connection's name: the label the owner gave it, else its venue's name as the list of accounts has it (venueCatalog), else its id */
  private connectionName(c: { venue: string; connector: string; label: string }): string {
    return c.label || venueCatalog(liveOptions(this.opts.home).options).find((x) => x.connector === c.connector)?.name || c.venue;
  }

  /** the dial as the ledger last recorded it, the agents' session included: a restart neither opens a session the owner ended nor lengthens one
   * (a new session is the owner's to sign) */
  private adoptDial(d: DialSnapshot): void {
    // never later than this start would give a new account: a row cannot lengthen the session past what a restart grants anyway
    const session = d.sessionExpiresAt && (!this.openness.sessionExpiresAt || Date.parse(d.sessionExpiresAt) < Date.parse(this.openness.sessionExpiresAt)) ? d.sessionExpiresAt : this.openness.sessionExpiresAt;
    this.openness = { ...this.openness, mode: d.mode, revoked: d.revoked, reach: d.reach as Openness["reach"], ...(session ? { sessionExpiresAt: session } : {}), ...(d.maxLeverage !== undefined ? { maxLeverage: d.maxLeverage } : {}) };
    // the cap the owner last signed stands again, on a server that moves money; a read-only server has none
    if (d.capUsd !== undefined && d.capUsd > 0 && this.opts.liveWrites !== undefined) this.capUsd = d.capUsd;
  }

  /** the dial now, as the note rows record it after each change: a restart reads the last one */
  private dialNow(): { dial: DialSnapshot } {
    const ended = !!this.openness.sessionExpiresAt && Date.parse(this.openness.sessionExpiresAt) <= Date.parse(this.now());
    return { dial: { mode: this.openness.mode === "open" ? "open" : "guard", revoked: [...this.openness.revoked], reach: { ...this.openness.reach }, ...(this.openness.sessionExpiresAt ? { sessionExpiresAt: this.openness.sessionExpiresAt } : {}), ...(ended ? { ended: true } : {}), ...(this.openness.maxLeverage !== undefined ? { maxLeverage: this.openness.maxLeverage } : {}), ...(this.opts.liveWrites !== undefined ? { capUsd: this.capUsd } : {}) } };
  }

  private openLedger(): Ledger {
    const stamp = this.now().replace(/[:.]/g, "-");
    const file = join(this.opts.home, "portfolio", `ledger-${stamp}.jsonl`);
    if (this.opts.freshLedger) rmSync(file, { force: true });
    // every row the ledger takes is looked at for what the pages are told of it (toldRow)
    return new Ledger(file, this.now, (row) => this.toldRow(row));
  }

  /** the five simulators are rebuilt from the seeds; the live account is kept (its state is MetaMask's, not ours) */
  private mount(): void {
    const s = this.seeds;
    // a fresh mount is the simulation from its seeds: whatever was connected live is gone with the rest
    this.shadowed.clear();
    this.liveVenues?.clear();
    this.earners?.clear();
    // a real service starts empty: the owner connects what is there
    if (this.opts.real) return void (this.adapters = new Map());
    // the simulated wallet reads its allowlist from this array, so a venue plugged in later can be added to it
    this.walletAllow.length = 0;
    this.walletAllow.push(...s.metamask.allowlist);
    const list: AccountAdapter[] = [binanceAccount(s.binance), okxAccount(s.okx), this.liveAccounts?.metamask ?? metamaskSimAccount({ ...s.metamask, allowlist: this.walletAllow }, this.now), this.liveAccounts?.polymarket ?? polymarketSimAccount(s.polymarket, this.now), kalshiAccount(s.kalshi, this.now), ondoAccount(s.ondo, this.now)];
    if (s.alpaca) list.push(alpacaAccount(s.alpaca, this.now));
    if (s.hyperliquid) list.push(hyperliquidAccount(s.hyperliquid, this.now));
    this.adapters = new Map(list.map((a) => [a.account.id, a]));
  }

  accounts(): Account[] {
    return [...this.adapters.values()].map((a) => a.account).sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) || x.id.localeCompare(y.id));
  }

  adapter(id: string): AccountAdapter | undefined {
    return this.adapters.get(id);
  }

  nameOf(id: string): string {
    return this.adapters.get(id)?.account.name ?? id;
  }

  policy(): Openness {
    return this.openness;
  }

  // ---- reads: never gated -----------------------------------------------------

  async read(accountId?: string): Promise<Holding[]> {
    const targets = accountId ? [this.adapters.get(accountId)].filter((a): a is AccountAdapter => !!a) : [...this.adapters.values()];
    const rows = (await Promise.all(targets.map((a) => a.read()))).flat();
    this.ledger.append({ kind: "read", venue: accountId ?? "*", tool: "portfolio_read", outcome: `${rows.length} holdings across ${targets.length} account(s) · no card` });
    return rows;
  }

  async views(): Promise<AccountView[]> {
    return Promise.all(
      this.accounts().map(async (acct) => {
        const a = this.adapters.get(acct.id)!;
        let holdings: Holding[] = [];
        let readError: string | undefined;
        try {
          holdings = await a.read();
        } catch (err) {
          readError = (err as Error).message;
        }
        const view: AccountView = {
          ...acct,
          kindLabel: KIND_LABEL[acct.kind],
          enforcerLabel: ENFORCER_LABEL[acct.scope.enforcedBy],
          reach: effectiveReach(acct, this.openness),
          revoked: this.openness.revoked.includes(acct.id),
          usd: r2(holdings.reduce((s, h) => s + h.usd, 0)),
          holdings,
        };
        if (readError !== undefined) view.readError = readError;
        return view;
      }),
    );
  }

  /** the account holds real accounts only (the server's default): no simulated venue, dial or payee is on it */
  get real(): boolean {
    return this.opts.real === true;
  }

  /** The statement page's whole view. On a real account every venue is read as the account page reads it (`accountView`: what is in its
   * earn products counted, once, with its balance), so the totals here are the ones /api/account and /holdings give; the simulation's dial,
   * its compiled openness and the agent's day against its cap are left out, and `live` says whether venues connected live are on it */
  async overview(): Promise<Overview> {
    const now = this.now();
    const accounts = this.accounts();
    const views = await this.views();
    const page = this.real && this.account ? await this.accountView() : undefined;
    if (page) {
      for (const v of views) {
        const pv = page.venues.find((x) => x.id === v.id);
        if (!pv) continue;
        v.usd = pv.usd;
        v.holdings = pv.holdings.map((h) => ({ account: v.id, asset: h.asset, amount: h.amount, usd: h.usd, class: h.class, ...(h.note ? { note: h.note } : {}), ...(h.inTransit ? { inTransit: true } : {}) }));
      }
    }
    const holdings = views.flatMap((v) => v.holdings);
    const agents = new Map<string, AgentId & { flights: number }>();
    for (const f of this.flights) {
      const a = agents.get(f.agent.id) ?? { ...f.agent, flights: 0 };
      a.flights++;
      agents.set(f.agent.id, a);
    }
    const portfolio = aggregate(accounts, holdings);
    // the account page's total also counts money in flight between venues and what open payment sessions hold: the same number here
    if (page) portfolio.totalUsd = page.totalUsd;
    return {
      now,
      live: page ? views.some((v) => v.live === true) : this.live,
      mode: this.openness.mode,
      session: { expiresAt: this.openness.sessionExpiresAt, expired: isExpired(now, this.openness.sessionExpiresAt) },
      portfolio,
      // a real account's dollars move as each venue's own writer says they can (account/holdings.ts movesOut), and no route to a hub is
      // quoted from the simulation's rail table: the ladder is empty there. The simulated statement keeps both as they were
      liquidity: page ? liveLiquidity(page) : liquidity(views),
      ladder: page ? ladder([]) : ladder(views),
      accounts: views,
      ...(page ? {} : { compiled: compileOpenness(accounts, this.openness), openness: this.openness, daily: { used: this.dailyOutUsd(now), cap: this.openness.guard.dailyCapUsd } }),
      approvals: [...this.approvals],
      flights: this.flights.slice(-40),
      agents: [...agents.values()],
      ledger: [...this.ledger.all()].reverse().slice(0, 80),
      chain: this.ledger.verifyChain(),
      counters: { ...this.counters },
      ledgerPath: this.ledger.path(),
    };
  }

  /** USD the agent moved through the venues in the 24 h before `now` (ok writes only) */
  dailyOutUsd(now: string): number {
    const since = Date.parse(now) - 24 * 3600 * 1000;
    const moved = this.ledger.byKind("venue").filter((r) => Date.parse(r.ts) > since).reduce((s, r) => s + (r.notionalUsd ?? 0), 0);
    // what an agent key moved through the account layer counts too; what the owner signed never does
    const viaAccount = this.account ? this.ledger.byKind("action").filter((r) => r.outcome === "accepted" && r.agent !== undefined && Date.parse(r.ts) > since).reduce((s, r) => s + (r.notionalUsd ?? 0), 0) : 0;
    return r2(moved + viaAccount);
  }

  // ---- flights ------------------------------------------------------------------

  openFlight(agent: AgentId, request: string): Flight {
    const no = `${agent.code}-${String(++this.flightSeq).padStart(4, "0")}`;
    const f: Flight = { no, agent, at: this.now(), request, legs: [] };
    this.flights.push(f);
    this.ledger.append({ kind: "note", venue: "*", flight: no, agent: agent.id, reason: `flight ${no} · ${agent.name} · ${request}` });
    return f;
  }

  flight(no: string): Flight | undefined {
    return this.flights.find((f) => f.no === no);
  }

  note(f: Flight, text: string, mark: Mark = "note"): Leg {
    const leg: Leg = { seq: f.legs.length + 1, mark, text };
    f.legs.push(leg);
    return leg;
  }

  /** one leg of a flight: the wallet's checks, then the venue; the leg is written in the agent's words */
  async fly(f: Flight, accountId: string, intent: Intent, say?: string, compare?: string): Promise<ExecuteOutcome> {
    const r = await this.write(f, accountId, intent);
    const words = say ?? sayOf(intent, this.nameOf(accountId));
    if (isPending(r)) {
      const leg: Leg = { seq: f.legs.length + 1, mark: "wait", text: `${words}: ${waitWords(r.approval.why)}`, account: accountId, intent, usd: r.approval.usd, approvalId: r.approval.id };
      if (compare !== undefined) leg.compare = compare;
      f.legs.push(leg);
    } else this.land(f, words, accountId, intent, r, compare);
    return r;
  }

  /** a write that reached its venue, as a leg: the fill and what it netted, or the refusal in plain words; a DEX swap shows its route */
  private land(f: Flight, words: string, accountId: string, intent: Intent, r: ExecResult, compare?: string): Leg {
    const leg: Leg = { seq: f.legs.length + 1, mark: "ok", text: words, account: accountId, intent };
    if (isRefusal(r)) {
      leg.mark = "no";
      leg.text = `${words}: ${plainRefusal(r, (id) => this.nameOf(id))}`;
      if (compare !== undefined) leg.compare = compare;
    } else {
      leg.text = `${words}${detailOf(intent, r)}`;
      leg.usd = r.usd;
      const line = [routeLine(r.native), compare].filter((x): x is string => !!x).join("; ");
      if (line) leg.compare = line;
    }
    f.legs.push(leg);
    return leg;
  }

  /** the slices of ONE order. The wallet judges the order as a whole — its total against the allowance and the daily cap — and asks the human once; nothing goes to a venue until every slice has passed. */
  async flyBatch(f: Flight, title: string, steps: BatchStep[]): Promise<ExecuteOutcome[]> {
    if (steps.length <= 1) {
      const out: ExecuteOutcome[] = [];
      for (const s of steps) out.push(await this.fly(f, s.account, s.intent, s.say, s.compare));
      return out;
    }
    const ctx = { flight: f.no, agent: f.agent.id };
    const now = this.now();
    const daily = this.dailyOutUsd(now);
    const orderUsd = r2(steps.reduce((s, x) => s + usdOf(x.intent), 0));
    const label = `${title} (${steps.length} slices)`;
    let refusal: Refusal | undefined;
    let card: Card | undefined;
    let before = 0;
    for (const s of steps) {
      const tool = `portfolio_${s.intent.kind}`;
      const a = this.adapters.get(s.account);
      if (!a) {
        const r = no("E_WALLET_ACCOUNT_UNKNOWN", { venue: s.account, tool, detail: { known: [...this.adapters.keys()] } });
        this.ledger.append({ kind: "openness-refusal", venue: s.account, tool, code: r.code, reason: r.message, args: { ...s.intent }, ...ctx });
        refusal ??= r;
        continue;
      }
      this.ledger.append({ kind: "intent", venue: s.account, tool, args: { ...s.intent }, notionalUsd: usdOf(s.intent), reason: `${label} · ${describeIntent(s.intent)}`, ...ctx });
      const v = evaluate({ intent: s.intent, account: a.account, openness: this.openness, now, dailyOutUsd: daily + before, orderUsd });
      before += usdOf(s.intent);
      if (isRefusal(v)) {
        this.ledger.append({ kind: "openness-refusal", venue: s.account, tool, code: v.code, reason: v.message, detail: v.detail, ...ctx });
        refusal ??= v;
      } else if (v.card) card ??= v.card;
    }
    if (refusal) {
      this.counters.refusals++;
      f.legs.push({ seq: f.legs.length + 1, mark: "no", text: `${label}: ${plainRefusal(refusal, (id) => this.nameOf(id))}` });
      return steps.map(() => refusal);
    }
    if (card) {
      const first = steps[0]!;
      const approval: Approval = { id: `card-${String(++this.seq).padStart(4, "0")}`, at: now, account: first.account, intent: first.intent, usd: orderUsd, reason: card.reason, status: "pending", why: card.why, flight: f.no, batch: steps.map((s) => ({ ...s })), title: label, ...this.cardLife(now) };
      this.approvals.unshift(approval);
      this.counters.cards++;
      this.ledger.append({ kind: "card", venue: "*", intentId: approval.id, tool: "portfolio_order", outcome: "pending", reason: card.reason, notionalUsd: orderUsd, args: { slices: steps.map((s) => ({ account: s.account, ...s.intent })) }, ...ctx });
      f.legs.push({ seq: f.legs.length + 1, mark: "wait", text: `${label}: ${waitWords(card.why)}`, usd: orderUsd, approvalId: approval.id });
      return steps.map(() => ({ ok: true, pending: true, approval }));
    }
    const out: ExecuteOutcome[] = [];
    for (const s of steps) {
      const r = await this.settle(this.adapters.get(s.account)!, s.intent, undefined, ctx);
      this.land(f, s.say ?? sayOf(s.intent, this.nameOf(s.account)), s.account, s.intent, r, s.compare);
      out.push(r);
    }
    return out;
  }

  // ---- the routing service --------------------------------------------------------

  /** one order priced at every venue and split across them; a read (no card, nothing moves) */
  async quote(base: string, side: Side, qty: number): Promise<OrderPlan> {
    const plan = orderPlan(base, side, qty, await this.views(), this.now());
    this.ledger.append({ kind: "read", venue: "*", tool: "portfolio_quote", outcome: `${plan.title} · ${plan.split.quotes.length} venue(s) quoted · ${plan.split.slices.length} slice(s) · no card` });
    return plan;
  }

  /** route an order and fly it: one flight, one leg per slice, one card at most */
  async order(base: string, side: Side, qty: number, agent: AgentId = SCRIPT_AGENT): Promise<{ flight: Flight; plan: OrderPlan; outcomes: ExecuteOutcome[] }> {
    const plan = await this.quote(base, side, qty);
    const f = this.openFlight(agent, plan.title);
    const first = this.note(f, plan.narration);
    if (plan.parts) first.parts = plan.parts;
    const outcomes = await this.flyBatch(f, plan.title, plan.steps);
    await this.closeOrder(f, plan, outcomes);
    return { flight: f, plan, outcomes };
  }

  /** the event contracts an agent can trade on the simulated statement: each question, its state, and every venue's top of book. A real
   * account has no fixture: its event markets are what its venues list (explore) */
  markets(): MarketView[] {
    if (this.real) return [];
    const now = this.now();
    return EVENTS.map((e) => ({
      id: e.id,
      title: e.title,
      closesAt: e.closesAt,
      state: eventState(e, now),
      ...(e.resolved ? { resolved: e.resolved } : {}),
      symbols: [eventSymbol(e.id, "YES"), eventSymbol(e.id, "NO")],
      venues: Object.entries(e.listings).map(([venue, l]) => ({ venue, name: PREDICTION_VENUES[venue]?.name ?? venue, ticker: l.ticker, yes: eventTop(venue, eventSymbol(e.id, "YES")), rules: l.rules })),
    }));
  }

  /** the lines after an order's legs: what the plan left out, what the live wallet adds, and — only once it has filled — where the proceeds are (a pending card keeps that line until it is approved) */
  async closeOrder(f: Flight, plan: OrderPlan, outcomes: Array<ExecuteOutcome | null>): Promise<void> {
    for (const n of [...plan.notes, ...(await this.liveNotes(plan))]) this.note(f, n);
    if (!plan.after.length) return;
    const pending = outcomes.find((r): r is Pending => r !== null && isPending(r));
    if (pending) pending.approval.notes = plan.after;
    else if (outcomes.some((r) => r !== null && r.ok === true)) for (const n of plan.after) this.note(f, n);
  }

  /** what the LIVE MetaMask wallet can add to an order, read-only: the real spot price, and — for a DEX slice — the real swap quote, or why it could not be read */
  async liveNotes(plan: OrderPlan): Promise<string[]> {
    const mm = this.adapters.get("metamask");
    if (!this.live || !mm) return [];
    const notes: string[] = [];
    if (isEventSymbol(plan.base)) {
      // the real Polymarket book behind this contract: public data, readable even where orders are not taken
      try {
        const m = await this.adapters.get("polymarket")?.market?.(plan.base, plan.side, plan.qty);
        if (m) notes.push(`Live Polymarket book for "${m.question}" (mm predict): bid ${m.bid ?? "–"} · ask ${m.ask ?? "–"}${m.amountUsd !== undefined && m.filled ? `; ${plan.side === "buy" ? "buying" : "selling"} ${qtyText(m.filled)} there would ${plan.side === "buy" ? "cost" : "bring"} about ${cents(m.amountUsd)}` : ""}. The venue quotes above use the fixed table.`);
      } catch {
        // a market that has since closed, or a CLI that does not answer, is not worth a line
      }
      return notes;
    }
    if (!plan.steps.length) return [];
    try {
      const spot = await mm.spot?.(plan.base);
      if (spot !== undefined) notes.push(`Live spot price ${cents(spot)} (mm price spot); the venue quotes above use the fixed table at ${cents(PRICES[plan.base] ?? 0)}.`);
    } catch {
      // a price feed that does not answer is not worth a line
    }
    const dex = plan.steps.find((s) => s.account === "metamask" && s.intent.kind === "trade");
    if (dex && mm.quote) {
      try {
        const best = (await mm.quote(dex.intent)).sort((a, b) => (b.outUsd ?? 0) - (a.outUsd ?? 0) || a.feeUsd - b.feeUsd)[0];
        if (best) notes.push(`The live wallet's DEX quote (mm swap quote): ${best.label}${best.outUsd !== undefined ? ` · about ${cents(best.outUsd)} out` : ""} · fee ${cents(best.feeUsd)}.`);
      } catch (err) {
        const message = (err as Error).message;
        notes.push(`The live wallet could not give a DEX quote (${/"code":"([A-Z_]+)"/.exec(message)?.[1] ?? message.slice(0, 80)}); the DEX slice uses the simulated pools.`);
      }
    }
    return notes;
  }

  /** the MCP server's (and the demo's) write: a flight of one leg */
  async execute(accountId: string, intent: Intent, agent: AgentId = SCRIPT_AGENT): Promise<ExecuteOutcome> {
    const f = this.openFlight(agent, describeIntent(intent));
    return this.fly(f, accountId, intent);
  }

  private async write(f: Flight, accountId: string, intent: Intent): Promise<ExecuteOutcome> {
    const tool = `portfolio_${intent.kind}`;
    const ctx = { flight: f.no, agent: f.agent.id };
    const a = this.adapters.get(accountId);
    if (!a) {
      const r = no("E_WALLET_ACCOUNT_UNKNOWN", { venue: accountId, tool, detail: { known: [...this.adapters.keys()] } });
      this.counters.refusals++;
      this.ledger.append({ kind: "openness-refusal", venue: accountId, tool, code: r.code, reason: r.message, args: { ...intent }, ...ctx });
      return r;
    }
    const now = this.now();
    this.ledger.append({ kind: "intent", venue: accountId, tool, args: { ...intent }, notionalUsd: usdOf(intent), reason: describeIntent(intent), ...ctx });
    const v = evaluate({ intent, account: a.account, openness: this.openness, now, dailyOutUsd: this.dailyOutUsd(now) });
    if (isRefusal(v)) {
      this.counters.refusals++;
      this.ledger.append({ kind: "openness-refusal", venue: accountId, tool, code: v.code, reason: v.message, detail: v.detail, ...ctx });
      return v;
    }
    // the account layer: a first payment to a payee the owner has never paid is the owner's to approve, in any mode
    const card = v.card;
    if (card) {
      const approval: Approval = { id: `card-${String(++this.seq).padStart(4, "0")}`, at: now, account: accountId, intent, usd: v.usd, reason: card.reason, status: "pending", why: card.why, flight: f.no, ...this.cardLife(now) };
      this.approvals.unshift(approval);
      this.counters.cards++;
      this.ledger.append({ kind: "card", venue: accountId, intentId: approval.id, tool, outcome: "pending", reason: card.reason, notionalUsd: v.usd, args: { ...intent }, ...ctx });
      return { ok: true, pending: true, approval };
    }
    return this.settle(a, intent, undefined, ctx);
  }

  /** with the account layer mounted a card expires; without it (the original demo) a card is as it always was */
  private cardLife(now: string): { expiresAt?: string } {
    return this.account ? { expiresAt: new Date(Date.parse(now) + CARD_TTL_MS).toISOString() } : {};
  }

  /** Is what a card would release still allowed, now? The card was raised under the conditions of that moment: the session may have ended since,
   * the account may have been switched off, the address blocklisted, the day's cap used up. A second card is not asked for; a refusal stops it. */
  private recheck(ap: Approval, now: string): Refusal | null {
    const steps: Array<{ account: string; intent: Intent }> = ap.batch ?? [{ account: ap.account, intent: ap.intent }];
    const orderUsd = ap.batch ? r2(steps.reduce((s, x) => s + usdOf(x.intent), 0)) : undefined;
    const daily = this.dailyOutUsd(now);
    let before = 0;
    for (const s of steps) {
      const a = this.adapters.get(s.account);
      if (!a) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: s.account });
      const v = evaluate({ intent: s.intent, account: a.account, openness: this.openness, now, dailyOutUsd: daily + before, ...(orderUsd !== undefined ? { orderUsd } : {}) });
      before += usdOf(s.intent);
      if (isRefusal(v)) return v;
    }
    return null;
  }

  private async settle(a: AccountAdapter, intent: Intent, approvalId: string | undefined, ctx: { flight?: string | undefined; agent?: string | undefined }, via?: string): Promise<ExecResult> {
    const r = await a.execute(intent);
    const prefix = via ? `${via} · ` : "";
    if (isRefusal(r)) {
      this.counters.refusals++;
      this.ledger.append({ kind: "venue-refusal", venue: a.account.id, intentId: approvalId, tool: `portfolio_${intent.kind}`, code: r.code, reason: `${prefix}${r.message}`, native: r.native, detail: r.detail, ...ctx });
      return r;
    }
    this.counters.writes++;
    this.ledger.append({ kind: "venue", venue: a.account.id, intentId: approvalId, tool: `portfolio_${intent.kind}`, outcome: r.status, notionalUsd: r.usd, reason: `${prefix}${r.summary}`, venueOrderId: r.ref, native: r.native, ...ctx });
    // the rail delivers: a move that landed at one of our own accounts credits it there
    if (intent.kind === "move" && r.status === "sent") {
      const dest = [...this.adapters.values()].find((d) => d.account.id !== a.account.id && (d.account.address === intent.to || d.account.id === intent.to));
      if (dest?.credit) {
        // a bridge takes its fee out of what arrives
        const arrived = typeof (r.native as { arrived?: unknown } | undefined)?.arrived === "number" ? (r.native as { arrived: number }).arrived : intent.amount;
        dest.credit(intent.asset, arrived, chainName(intent.chainId) ?? dest.account.chain);
        this.ledger.append({ kind: "funding", venue: dest.account.id, tool: "rail", notionalUsd: r2(arrived * (r.usd / intent.amount)), reason: `${arrived} ${intent.asset} arrived from ${a.account.id}${chainName(intent.chainId) ? ` on ${chainName(intent.chainId)}` : ""}`, ...ctx });
      }
    }
    return r;
  }

  async decide(approvalId: string, decision: "approve" | "reject"): Promise<ExecResult> {
    const ap = this.approvals.find((x) => x.id === approvalId && x.status === "pending");
    if (!ap) return no("E_CARD_NOT_GRANTED", { tool: "portfolio_approve", message: `no pending card ${approvalId}` });
    if (ap.action) return no("E_ACCOUNT_OWNER_SURFACE", { tool: "portfolio_approve", message: `card ${ap.id} releases a signed instruction: it is answered with the owner's signature (approveCard), not here`, detail: { approval: ap.id } });
    const f = this.flight(ap.flight);
    const ctx = { flight: ap.flight, agent: f?.agent.id };
    ap.decidedAt = this.now();
    const where = ap.batch ? "*" : ap.account;
    if (decision === "reject") {
      ap.status = "rejected";
      const r = no("E_CARD_REJECTED", { venue: ap.account, tool: ap.batch ? "portfolio_order" : `portfolio_${ap.intent.kind}`, message: `the human rejected this card: ${ap.title ?? describeIntent(ap.intent)}`, detail: { approval: ap.id } });
      ap.result = r;
      this.counters.refusals++;
      this.ledger.append({ kind: "card", venue: where, intentId: ap.id, outcome: "rejected", code: r.code, reason: r.message, ...ctx });
      if (f) this.note(f, "You rejected it; nothing moved", "no");
      return r;
    }
    ap.status = "approved";
    this.ledger.append({ kind: "card", venue: where, intentId: ap.id, outcome: "approved", reason: ap.reason, notionalUsd: ap.usd, ...ctx });
    const stale = this.recheck(ap, ap.decidedAt);
    if (stale) {
      ap.result = stale;
      this.counters.refusals++;
      this.ledger.append({ kind: "openness-refusal", venue: where, intentId: ap.id, tool: ap.batch ? "portfolio_order" : `portfolio_${ap.intent.kind}`, code: stale.code, reason: `at approval: ${stale.message}`, detail: stale.detail, ...ctx });
      if (f) this.note(f, `Approved, but ${plainRefusal(stale, (id) => this.nameOf(id))}`, "no");
      return stale;
    }
    if (ap.batch) {
      // one yes covers every slice of the order
      const results: ExecResult[] = [];
      for (const s of ap.batch) {
        const r = await this.settle(this.adapters.get(s.account)!, s.intent, ap.id, ctx);
        results.push(r);
        if (f) this.land(f, `Approved · ${s.say ?? sayOf(s.intent, this.nameOf(s.account))}`, s.account, s.intent, r, s.compare);
      }
      ap.results = results;
      const done = results.filter((r): r is ExecOk => !isRefusal(r));
      const summary: ExecResult = results.find(isRefusal) ?? { ok: true, account: [...new Set(ap.batch.map((s) => s.account))].join("+"), status: "filled", summary: `${ap.title ?? "order"} · ${done.length} slices filled`, usd: r2(done.reduce((s, r) => s + r.usd, 0)), ref: `flight:${ap.flight}`, native: { slices: done.map((r) => ({ account: r.account, ref: r.ref, usd: r.usd })) } };
      ap.result = summary;
      if (f && done.length) for (const n of ap.notes ?? []) this.note(f, n);
      return summary;
    }
    const r = await this.settle(this.adapters.get(ap.account)!, ap.intent, ap.id, ctx);
    ap.result = r;
    if (f) {
      if (isRefusal(r)) this.note(f, `Approved, but ${plainRefusal(r, (id) => this.nameOf(id))}`, "no");
      else {
        const leg = this.note(f, `Approved · ${sayOf(ap.intent, this.nameOf(ap.account))}${detailOf(ap.intent, r)}`, "ok");
        leg.usd = r.usd;
        leg.account = ap.account;
        const route = routeLine(r.native);
        if (route) leg.compare = route;
        for (const n of ap.notes ?? []) this.note(f, n);
      }
    }
    return r;
  }

  /** a compromised agent with the credential, talking to the venue directly: the wallet is not consulted, the ledger still sees it (the operator records it) */
  async bypass(accountId: string, intent: Intent): Promise<ExecResult> {
    const a = this.adapters.get(accountId);
    if (!a) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: accountId });
    this.ledger.append({ kind: "bypass", venue: accountId, tool: `portfolio_${intent.kind}`, args: { ...intent }, reason: `bypassing the wallet, straight to the venue with the credential: ${describeIntent(intent)}` });
    return this.settle(a, intent, undefined, {}, "bypass");
  }

  // ---- the dial -----------------------------------------------------------------

  setMode(mode: Mode): void {
    this.openness = { ...this.openness, mode };
    this.ledger.append({ kind: "note", venue: "*", reason: `mode → ${mode}`, detail: this.dialNow() });
  }

  /** narrow (or restore) what the agent may do at one account; `read` is always on, and a full set means "maximal" (the entry is dropped) */
  setReach(accountId: string, caps: Capability[]): Refusal | { ok: true; reach: Capability[] } {
    const a = this.adapters.get(accountId);
    if (!a) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: accountId });
    const writes = caps.filter((c): c is Capability => WRITE_CAPS.includes(c) && a.account.scope.can.includes(c));
    const reach = { ...this.openness.reach };
    if (a.account.scope.can.filter((c) => c !== "read").every((c) => writes.includes(c))) delete reach[accountId];
    else reach[accountId] = writes;
    this.openness = { ...this.openness, reach };
    this.ledger.append({ kind: "note", venue: accountId, reason: `reach → ${writes.join(", ") || "read"}`, detail: this.dialNow() });
    return { ok: true, reach: effectiveReach(a.account, this.openness) };
  }

  revoke(accountId: string): Refusal | { ok: true; revoked: string[] } {
    if (!this.adapters.has(accountId)) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: accountId });
    this.openness = { ...this.openness, revoked: [...new Set([...this.openness.revoked, accountId])] };
    this.ledger.append({ kind: "note", venue: accountId, reason: "revoked: the agent keeps reads only; deleting the key at the exchange or freezing the token at the issuer is an operator action", detail: this.dialNow() });
    return { ok: true, revoked: this.openness.revoked };
  }

  restore(accountId: string): Refusal | { ok: true; revoked: string[] } {
    if (!this.adapters.has(accountId)) return no("E_WALLET_ACCOUNT_UNKNOWN", { venue: accountId });
    this.openness = { ...this.openness, revoked: this.openness.revoked.filter((x) => x !== accountId) };
    this.ledger.append({ kind: "note", venue: accountId, reason: "restored", detail: this.dialNow() });
    return { ok: true, revoked: this.openness.revoked };
  }

  /** end the agent's session: every write stops now, every read continues */
  revokeAll(): { ok: true; sessionExpiresAt: string } {
    this.openness = { ...this.openness, sessionExpiresAt: this.now() };
    this.ledger.append({ kind: "note", venue: "*", reason: "session ended: every write stops, reads continue", detail: this.dialNow() });
    return { ok: true, sessionExpiresAt: this.openness.sessionExpiresAt };
  }

  reset(): void {
    this.openness = parseOpenness(this.opts.openness ?? sessionFrom(loadOpenness() as object, Date.parse(this.now())));
    this.approvals = [];
    this.seq = 0;
    this.flights.length = 0;
    this.flightSeq = 0;
    this.counters.writes = this.counters.refusals = this.counters.cards = 0;
    this.skewMs = 0;
    this.ledger = this.openLedger();
    this.mount();
    this.account?.reset();
  }

  rows(): readonly LedgerRow[] {
    return this.ledger.all();
  }

  verifyChain(): { ok: boolean; rows: number; at?: number } {
    return this.ledger.verifyChain();
  }

  ledgerPath(): string {
    return this.ledger.path();
  }

  /** The statement: every transaction at the real venues, read back from every ledger in this home — this run's and the earlier ones' — the
   * last line written for each, newest first */
  statement(): StatementLine[] {
    const rows = this.statementRows();
    const lines: StatementLine[] = [...rows.before, ...rows.now].map((r) => r.detail);
    // what the paper accounts did on their own — a bracket's exit, a liquidation, a settlement — read from their books
    lines.push(...this.paperFillLines());
    const before = new Set(rows.before.map((r) => r.detail.key));
    const now = new Set(rows.now.map((r) => r.detail.key));
    // a line an earlier run left unfinished is not followed by this one: it says so, and counts only what had happened. Finished is each
    // line type's own last word: an order's (live/trade.ts DONE), a movement's (settled, failed, stranded), an earn request's (done, rejected)
    return fold(lines).map((l) => (before.has(l.key) && !now.has(l.key) && !STATEMENT_FINAL.has(l.status) ? { ...l, status: "not followed since a restart", ...(l.status === "waiting for wallet" ? { amountUsd: 0 } : {}) } : l));
  }

  /** The fills each paper account the account keeps itself made with no order of the account's (paper.ts: a liquidation, a settlement), as
   * statement lines (account/statement.ts paperFillLine): from its book, read again only when the book was written. A bracket's exits are
   * not here: they are the account's own orders (LiveOrders adoptExits), on the statement as those */
  private paperFillLines(): StatementLine[] {
    const out: StatementLine[] = [];
    for (const [id, v] of this.liveVenues) {
      if (!v.paper || this.adapters.get(id)?.account.connector !== "live:paper") continue;
      const path = paperBookPath(this.opts.home, id);
      let mtime: number;
      try {
        mtime = statSync(path).mtimeMs;
      } catch {
        continue;
      }
      let kept = this.paperBooksRead.get(id);
      if (!kept || kept.mtime !== mtime) {
        let book: PaperBook | undefined;
        try {
          book = loadBook(path);
        } catch {
          book = undefined;
        }
        kept = { mtime, book };
        this.paperBooksRead.set(id, kept);
      }
      const book = kept.book;
      if (!book) continue;
      for (const o of Object.values(book.orders)) {
        if (!(o.filledQty > 0) || o.avgPrice === undefined || o.parent || !(o.clientId.startsWith("liquidation-") || o.clientId.startsWith("settlement-"))) continue;
        const ref = book.markets[o.symbol];
        out.push(paperFillLine({ venue: id, venueName: v.name, ref: o.ref, clientId: o.clientId, symbol: o.symbol, name: ref?.name ?? o.symbol, base: ref?.kind === "event" ? o.symbol : (ref?.base ?? o.symbol), side: o.side, type: o.type, qty: o.filledQty, avgPrice: o.avgPrice, feeUsd: o.feeUsd ?? 0, at: o.at, filledAt: o.filledAt ?? o.updatedAt, note: o.note, ...(o.realizedUsd !== undefined ? { realizedUsd: o.realizedUsd } : {}) }));
      }
    }
    return out;
  }
  private readonly paperBooksRead = new Map<string, { mtime: number; book: PaperBook | undefined }>();

  /** the ledger files this run continues (account/restore.ts readHistory, oldest first). Unknown until a real account has read its
   * history: a service that keeps no history reads every ledger in the home, as before */
  private ledgerChain: string[] | undefined;

  /** the statement rows of the account's earlier runs (`before`, oldest file first) and this run's (`now`) — with what each row carries
   * whole (`native`: the order or the payment). An earlier run is a ledger this run continues, or any other ledger in the home that an
   * account run wrote (its first row carries the run mark: an earlier line of runs, one `--fresh` left behind); a ledger no account run
   * wrote — a demo's, a test's, another program's — is not the account's and is not read. An earlier run's file is read once and kept while
   * its size stays the same: the page asks for the statement every few seconds, and an old ledger only grows when another process shares
   * the home */
  private statementRows(): { before: StatementRow[]; now: StatementRow[] } {
    const dir = join(this.opts.home, "portfolio");
    const current = this.ledger.path();
    const before: StatementRow[] = [];
    const seen = new Set<string>();
    const chain = this.ledgerChain === undefined ? undefined : new Set(this.ledgerChain);
    for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
      if (!/^ledger-.*\.jsonl$/.test(name) || join(dir, name) === current) continue;
      let size: number;
      try {
        size = statSync(join(dir, name)).size;
      } catch {
        continue;
      }
      seen.add(name);
      let hit = this.oldLedgers.get(name);
      if (!hit || hit.size !== size) {
        const rows = new Ledger(join(dir, name), this.now).all();
        const ours = chain === undefined || chain.has(name) || runOf(rows[0]) !== undefined;
        hit = { size, rows: ours ? statementOf(rows) : [] };
        this.oldLedgers.set(name, hit);
      }
      before.push(...hit.rows);
    }
    for (const name of [...this.oldLedgers.keys()]) if (!seen.has(name)) this.oldLedgers.delete(name);
    return { before, now: statementOf(this.ledger.all()) };
  }
  private readonly oldLedgers = new Map<string, { size: number; rows: StatementRow[] }>();

  /** this run's ledger rows, oldest first */
  ledgerRows(): readonly LedgerRow[] {
    return this.ledger.all();
  }
}

/** a statement row of a ledger: the line as the statement shows it, and the order or payment it was written for */
interface StatementRow {
  detail: StatementLine;
  native: unknown;
}
const statementOf = (rows: readonly LedgerRow[]): StatementRow[] => rows.filter((r) => r.kind === "statement" && r.detail).map((r) => ({ detail: r.detail as StatementLine, native: r.native }));

// ---- what the wallet's reads answer -----------------------------------------------------------------------------------------------

/** a venue, or a part of one, that could not be read for an answer: why, in its own words where it gave some */
/** one funding payment at a venue (LiveTrader.funding), with the venue it is at — said paper where it is a paper account's */
export type VenueFunding = FundingLine & { venue: string; venueName: string; paper?: true | undefined };
/** the most funding lines one read lists */
export const FUNDING_LINES_MAX = 500;

export interface ReadMissing {
  venue: string;
  venueName: string;
  why: string;
  code?: string | undefined;
  /** which read: its 24 hours, its positions, its price history, the comparison, its earn, its funding */
  part?: "stats" | "positions" | "candles" | "compare" | "earn" | "funding" | undefined;
}

/** EARN across the venues connected live: which venues earn (and whether the key or wallet may put money in), the products they offer, what
 * is in them, the venues that could not be read, and whether this server moves money at all */
export interface EarnView {
  asOf: string;
  venues: Array<{ venue: string; venueName: string; can: boolean | "unknown"; what: string; whyNot?: string }>;
  products: Array<EarnProduct & { venue: string; venueName: string }>;
  positions: Array<EarnPosition & { venue: string; venueName: string }>;
  missing: ReadMissing[];
  writes: { on: boolean; capUsd: number; turnOn: string };
}

/** a holdings row with its market's last 24 hours, from the venue that reports them */
export interface HeldRow extends AssetRow {
  changePct24h?: number | undefined;
  changeFrom?: { venue: string; venueName: string } | undefined;
}

export interface HoldingsView {
  asOf: string;
  /** the account page's total: the venues, and what is in flight or held in escrow between them */
  totalUsd: number;
  rows: HeldRow[];
  /** the dollars that are ready, and where they can go (account/holdings.ts) */
  money: MoneySummary;
  /** what the rows did in the last 24 hours, and how much of them that covers */
  change24h: DayChange;
  missing: ReadMissing[];
  /** asked with `cost`: what was paid (account/costbasis.ts), and the positions it was read with */
  cost?: CostBasis[] | undefined;
  positions?: VenuePosition[] | undefined;
  /** asked with `paper`: these are the paper accounts' rows and total, paper money and not the account's */
  paper?: true | undefined;
}

export interface ReceiveAddress {
  venue: string;
  venueName: string;
  asset: string;
  network: ChainName;
  address: string;
  /** a memo the venue needs with it, when it does */
  tag?: string | undefined;
  /** whose address it is, in words: the venue's own deposit address, or the wallet that showed it is the user's */
  whose: string;
  note?: string | undefined;
}

/** one market's price history, as GET /api/account/candles answers it (service.ts candles; live/trade.ts CandlePage for the words) */
export interface CandlesView {
  venue: string;
  venueName: string;
  symbol: string;
  /** the bars' size: the one asked, or the coarser one the source drew a range in (`note` says why) */
  interval: CandleInterval;
  /** the range this first view covers, or the bar a page was asked before (ms) */
  range?: CandleRange | undefined;
  before?: number | undefined;
  /** oldest first */
  candles: Candle[];
  /** older bars exist: the next page is asked `before` the first bar's start */
  more: boolean;
  /** the answer stops short of what was asked for a reason other than the history (a page further back was refused, or did not answer:
   * live/trade.ts CandlePage.partial) — a page scrolled left with no bars and this is one that did not come, never where the history ends */
  partial?: true | undefined;
  /** where the history ends inside what was asked, and why, in a sentence */
  ends?: string | undefined;
  note?: string | undefined;
  /** whose bars these are (venue · market), what their prices are adjusted for, which hours they cover, what they were folded from */
  source?: string | undefined;
  adjustment?: string | undefined;
  session?: string | undefined;
  folded?: string | undefined;
  /** stretches inside the bars with none, [from, to) ms and why ("No overnight data"): said, never filled */
  gaps?: Array<{ from: number; to: number; why: string }> | undefined;
  /** the last bar built from intraday bars, and its words ("Today so far") */
  today?: { t: number; words: string } | undefined;
  /** read from the venue's public market data, without a key: the venue is not connected */
  public?: true | undefined;
  /** whose bars these are, where not the venue's own: a paper account's market's public source */
  from?: string | undefined;
}

/** one market's order book, as GET /api/account/book answers it */
export interface BookView {
  venue: string;
  venueName: string;
  symbol: string;
  book: OrderBook;
  /** read from the venue's public market data, without a key: the venue is not connected */
  public?: true | undefined;
}
/** one market's latest trades, newest first, as GET /api/account/trades answers it */
export interface TradesView {
  venue: string;
  venueName: string;
  symbol: string;
  trades: PublicTrade[];
  /** the source publishes no trades at all, in a sentence ("US stocks publishes no trades the account can read"); `trades` is then empty and
   * asking again would say the same, so the page stops asking until the market changes */
  none?: string | undefined;
  public?: true | undefined;
}

/** A paper account's trades read for a market whose public source publishes none says so as a refusal of its own (live/paper.ts trades:
 * E_VENUE_RAIL_CLOSED, "<paper account>: <source> publishes no trades"). That one sentence is the source's fact, not a failure, so
 * marketTrades answers it as `none`: the source's words, with the paper account's name taken off the front. Any other refusal is undefined
 * here and stays the refusal it is */
function noTradesSaid(r: Refusal, venueName: string): string | undefined {
  if (r.code !== "E_VENUE_RAIL_CLOSED" || typeof r.message !== "string") return undefined;
  const m = /^(?:(.+?): )?(.+) publishes no trades(?: the account can read)?$/.exec(r.message);
  if (!m || (m[1] !== undefined && m[1] !== venueName)) return undefined;
  return `${m[2]} publishes no trades the account can read`;
}

export interface CandleSeries {
  venue: string;
  venueName: string;
  symbol: string;
  interval: CandleInterval;
  /** oldest first */
  bars: Candle[];
  /** read from an exchange's keyless public bars: the venue is not connected */
  public?: true | undefined;
  /** whose bars these are, where the source names them (live/trade.ts CandlePage.source) */
  source?: string | undefined;
}

export interface AssetDetail {
  key: string;
  /** its holdings row, when the account holds it */
  row?: HeldRow | undefined;
  /** the same thing at every connected venue, priced for a buy */
  compare?: Comparison | undefined;
  candles?: CandleSeries | undefined;
  positions: VenuePosition[];
  /** the account's open orders in it */
  orders: LiveOrder[];
  /** its lines on the statement, newest first */
  lines: StatementLine[];
  /** what was paid for it: its row's, and its positions' */
  cost: CostBasis[];
  missing: ReadMissing[];
}

export interface Sellable {
  /** its holdings row, or its position (`position:<venue>:<symbol>`) */
  key: string;
  asset: string;
  venue: string;
  venueName: string;
  /** what selling it signs: a sell order in a dollar market there, or — a perpetual, a future — the position's close */
  action: "sell" | "close";
  /** the market, as an order there names it */
  symbol?: string | undefined;
  kind?: MarketKind | undefined;
  side?: "long" | "short" | undefined;
  /** what is held there, and what a sell of all of it is, down to the market's step */
  held: number;
  sellQty: number;
  /** the bid (the price where the market shows no book), and what the sell is worth at it */
  price?: number | undefined;
  usd?: number | undefined;
  /** an order could go now: the server trades, the key may, the market is open and the size is at least its smallest */
  ready: boolean;
  why?: string | undefined;
}

export interface AgentView {
  address: string;
  name: string;
  code: string;
  /** ok · expired · revoked */
  status: string;
  validUntil: string;
  approvedAt: string;
  /** each limit the owner signed for it: `trade` (orders), `venues` (moving money between the user's own places), `payees` (paying others),
   * `earn` (money put into venues' earn products) */
  limits: Array<{ id: string; scope: string; allow: string[]; perPaymentUsd: number; budgetUsd: number; spentUsd: number; reservedUsd: number; leftUsd: number; windowHours: number; validUntil: string; expired: boolean }>;
  /** the cards it is waiting on the owner for */
  cards: AccountPage["cards"];
  orders: LiveOrder[];
  payments: Payment[];
  /** what it put into earn products, or took out */
  earns: LiveEarn[];
  /** its agent wallets, with what the chains say they hold where they are read */
  wallets: Array<AccountPage["subAccounts"][number] & { venue: string; usd?: number | undefined }>;
  /** the owner's open intents addressed to it or to every agent: words, none of them a limit */
  intents: AccountPage["intents"];
  asks: AgentAsk[];
  /** what the owner declined of its asks in the last day */
  declinedAsks: DeclinedAsk[];
  flights: Array<{ no: string; at: string; request: string; legs: string[] }>;
  /** what it remembers about the owner (account/memory.ts): its notes kept, and the ones waiting for the owner */
  memory: { notes: number; waiting: number };
}

/** the most a memory takes, and its three parts with their words */
const MEMORY_LIMITS = { noteText: NOTE_TEXT, howText: HOW_TEXT, maxNotes: MAX_NOTES, topics: TOPICS.map((t) => ({ id: t, words: TOPIC_WORDS[t] })) };

/** a line of "From your limit": a signed limit (its id) or the mode, as they stand */
export interface MemoryFromLimit {
  id: string;
  from: "limit" | "mode";
  topic: "rules";
  text: string;
  /** when the limit was signed */
  at?: string | undefined;
}

/** the owner's view of what the agents remember */
export interface MemoryPage {
  asOf: string;
  /** `status` ok · expired · revoked, or gone: memory kept for a key the account no longer lists */
  agents: Array<{ address: string; name: string; code: string; status: string; rules: MemoryRules; notes: MemoryNote[]; fromLimits: MemoryFromLimit[] }>;
  limits: typeof MEMORY_LIMITS;
}

/** one agent's view of its memory */
export interface AgentMemoryView {
  asOf: string;
  rules: MemoryRules;
  notes: MemoryNote[];
  waiting: MemoryNote[];
  fromLimits: MemoryFromLimit[];
  sharedWithYou: Array<{ agent: string; name: string; notes: MemoryNote[] }>;
  limits: typeof MEMORY_LIMITS;
}

export interface AgentsView {
  asOf: string;
  /** guard (Guard: every agent order waits for the owner) · open (Beast: inside their limits, at once) */
  mode: "guard" | "open";
  agents: AgentView[];
  /** keys that asked to be let in, with the name they gave */
  requests: AccountPage["requests"];
}

const EXPLORE_SORTS: readonly ExploreSort[] = ["volume", "movers", "closing"];
/** how long a venue has for its 24 hours, and for its price history */
const STATS_MS = 4_000;
const CANDLE_MS = 6_000;
/** how long a chart's first view may take (Nasdaq's whole history of a share is about ten seconds), and one page scrolled left — the page
 * waits longer than either (ui/core.js HISTORY_TIMEOUT_MS and API_TIMEOUT_MS; test/unit/ui-chart.test.ts holds them apart) */
export const HISTORY_WAIT_MS = 20_000;
export const PAGE_WAIT_MS = 12_000;
/** WHOSE BARS A CHART SAYS THEY ARE (CandlesView.from): the source the market is priced from (`named`), unless its page names another
 * exchange's bars (a Kraken pair's chart drawn from Coinbase Exchange or OKX: its `source` "Coinbase Exchange · BTC-USD") — then that venue,
 * so the chart's name and the page's source never disagree. A source that speaks for several venues (the US stocks line, Robinhood's and
 * Nasdaq's and Cboe's bars under it) keeps its own name */
function barsFrom(page: CandlePage, named: string, kind: PublicSource["kind"] | undefined): string {
  const venue = page.source?.split(" · ")[0]?.trim();
  return kind === "exchange" && venue && !page.source!.startsWith(named) ? venue : named;
}

/** the bounded memory of price histories (historyRead) and of a paper curve's bars: answers, and bars in all */
const HISTORY_KEPT = 64;
const HISTORY_KEPT_BARS = 250_000;
const PAPER_BARS_KEPT = 200;

/** A PRICE HISTORY AS ASKED (GET /api/account/candles, portfolio_candles): the bar size (empty: the range's own, else 1h), a range or the
 * bar a page is asked before — never both — and the most bars, held to what can be asked; or why not, in words */
export function historyAsk(interval: string, ask: { range?: string | undefined; before?: string | number | undefined; limit?: string | number | undefined }): { iv: CandleInterval; range?: CandleRange | undefined; before?: number | undefined; limit: number } | Refusal {
  const r = String(ask.range ?? "").trim().toUpperCase();
  if (r && !(CANDLE_RANGES as readonly string[]).includes(r)) return no("E_ACCOUNT_BAD_ACTION", { message: `a range is one of ${CANDLE_RANGES.join(", ")}` });
  const b = String(ask.before ?? "").trim();
  if (b && !/^\d{1,15}$/.test(b)) return no("E_ACCOUNT_BAD_ACTION", { message: "a page of price history is asked before a bar's start, in milliseconds" });
  if (r && b) return no("E_ACCOUNT_BAD_ACTION", { message: "price history is asked for a range or for the page before a bar, not both" });
  const range = r ? (r as CandleRange) : undefined;
  const iv = (interval || (range ? RANGE_BAR[range] : "1h")).trim();
  if (!(CANDLE_INTERVALS as readonly string[]).includes(iv)) return no("E_ACCOUNT_BAD_ACTION", { message: `price history is by ${CANDLE_INTERVALS.join(", ")}` });
  const most = b ? PAGE_MOST : HISTORY_MOST;
  const l = String(ask.limit ?? "").trim();
  if (l && !(/^\d{1,6}$/.test(l) && Number(l) >= 1 && Number(l) <= most)) return no("E_ACCOUNT_BAD_ACTION", { message: `a ${b ? "page" : "view"} of price history holds 1 to ${most.toLocaleString("en-US")} bars` });
  const before = b ? Number(b) : undefined;
  if (before !== undefined && !(before > 0)) return no("E_ACCOUNT_BAD_ACTION", { message: "a page of price history is asked before a bar's start, in milliseconds" });
  return { iv: iv as CandleInterval, range: before !== undefined ? undefined : (range ?? INTERVAL_RANGE[iv as CandleInterval]), ...(before !== undefined ? { before } : {}), limit: l ? Number(l) : b ? 300 : HISTORY_MOST };
}

/** how long a book and the latest trades are kept (the page asks every two and every four seconds), and how long either is waited for */
const BOOK_KEEP_MS = 1_500;
const TRADES_KEEP_MS = 3_000;
const BOOK_WAIT_MS = 5_000;
/** a paper account's answer that its market's source has no book the account reads (live/paper.ts book: `detail.book: "none"`) */
const noBookAt = (r: unknown): r is Refusal => isRefusal(r) && r.code === "E_VENUE_RAIL_CLOSED" && (r.detail as { book?: unknown } | undefined)?.book === "none";
/** why a book is only its best bid and ask (trade.ts OrderBook.topOnly) */
type TopOnly = NonNullable<OrderBook["topOnly"]>;
/** A market's best bid and best ask as the market itself carries them, as a book of depth "top", and why that is all (`topOnly`): a source
 * that publishes no book (a US stock's public quote) shown as exactly that, and one whose book the account does not read said to be so. No
 * size: the market gives none. Stamped with the quote's own time where it has one (the page says it once it is old); else with now, and —
 * where the market came from a list kept a while (`keptMs`: a public listing's, a hundred and ten seconds, LISTED_QUOTE_UP_TO_MS) — how old
 * its quote may be (`upToMs`), so a kept quote is never taken for a live one. Named by the source its quote came from (`quoteFrom`), else the venue. Nothing when it carries
 * neither */
function topBook(m: Market, venueName: string, now: number, topOnly: TopOnly, keptMs?: number): OrderBook | undefined {
  const good = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);
  const bid = good(m.bid);
  const ask = good(m.ask);
  if (bid === undefined && ask === undefined) return undefined;
  const stamped = m.quoteAt ? Date.parse(m.quoteAt) : NaN;
  const own = Number.isFinite(stamped);
  return { bids: bid !== undefined ? [[bid, null]] : [], asks: ask !== undefined ? [[ask, null]] : [], at: new Date(own ? stamped : now).toISOString(), from: m.quoteFrom ?? venueName, depth: "top", topOnly, ...(!own && keptMs !== undefined ? { upToMs: keptMs } : {}) };
}

/** an answer within `ms`, or the venue's not answering as a refusal; a throw is a refusal too. The call is not stopped (nothing here can
 * stop one): its answer is just not waited for */
function within<T>(ms: number, p: Promise<T | Refusal>, venue: string, name: string): Promise<T | Refusal> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Refusal>((resolve) => {
    timer = setTimeout(() => resolve(no("E_VENUE_UNREACHABLE", { venue, message: `${name} did not answer in ${ms / 1000} seconds` })), ms);
  });
  const said = p.catch((err: unknown) => no("E_VENUE_UNREACHABLE", { venue, message: `${name}: ${String((err as Error)?.message ?? err).slice(0, 160)}` }));
  return Promise.race([said, late]).finally(() => clearTimeout(timer));
}

/** an earn position as the holdings read it */
const heldOf = (p: EarnPosition): EarnHeld => ({ product: p.product, asset: p.asset, amount: p.amount, ...(p.usd !== undefined ? { usd: p.usd } : {}), ...(p.apy !== undefined ? { apy: p.apy } : {}), ...(p.accrued !== undefined ? { accrued: p.accrued } : {}), ...(p.accruedUsd !== undefined ? { accruedUsd: p.accruedUsd } : {}), ...(p.name ? { name: p.name } : {}), ...(p.chain ? { chain: p.chain } : {}) });

/** a market's 24-hour change in percent: the venue's own, or its change in price against its own price a day ago. Never a guess */
function pctOf(s: MarketStats): number | undefined {
  if (typeof s.changePct24h === "number" && Number.isFinite(s.changePct24h) && s.changePct24h > -100) return s.changePct24h;
  if (typeof s.change24h === "number" && Number.isFinite(s.change24h) && typeof s.price === "number" && s.price > 0 && s.price - s.change24h > 0) return (s.change24h / (s.price - s.change24h)) * 100;
  return undefined;
}

type AssetKey = { key: string; cls: string; name: string };
/** a holdings key as account/holdings.ts writes it (a coin by its one name, anything else by its symbol in capitals); Markets' `coin:` and
 * `stock:` are its `crypto:` and `equity:` */
function assetKeyOf(raw: string): AssetKey | undefined {
  const m = /^(crypto|coin|stable|cash|equity|stock|rwa|event):(.{1,120})$/.exec(raw.trim());
  if (!m || /[\u0000-\u001f\u007f]/.test(m[2]!)) return undefined;
  const cls = m[1] === "coin" ? "crypto" : m[1] === "stock" ? "equity" : m[1]!;
  const name = cls === "crypto" ? normalBase(m[2]!, "crypto") || m[2]!.trim().toUpperCase() : m[2]!.trim().toUpperCase();
  return name ? { key: `${cls}:${name}`, cls, name } : undefined;
}

/** is a market (an order's, a position's) the asset `k`: a coin by its one name in any market but a stock's or an event's (a perpetual on it
 * included), a share by its ticker, an event contract by its symbol */
function sameThing(k: AssetKey, kind: MarketKind, base: string, symbol: string): boolean {
  const b = base || symbol;
  if (k.cls === "event") return kind === "event" && symbol.toUpperCase() === k.name;
  if (k.cls === "equity") return kind === "stock" && normalBase(b, "stock") === k.name;
  if (k.cls === "rwa") return kind === "token" && b.toUpperCase() === k.name;
  return kind !== "stock" && kind !== "event" && normalBase(b, kind) === k.name;
}

/** a holding's dollar market at its venue: the same thing (a coin by its one name, a share by its ticker, a token by its symbol), priced in
 * dollars, not a perpetual, a future or an event; from a wallet, the pair on the chain it is held on, and none on another */
async function dollarMarket(t: LiveTrader, row: AssetRow, line: AssetRow["venues"][number]): Promise<Market | Refusal | undefined> {
  const list = await t.markets(row.asset);
  if (isRefusal(list)) return list;
  const want = row.asset.toUpperCase();
  const fits = list.filter((m) => {
    if (!inDollars(m.quote) || m.kind === "perp" || m.kind === "future" || m.kind === "event") return false;
    if (row.class === "equity") return m.kind === "stock" && normalBase(m.base || m.symbol, "stock") === want;
    if (row.class === "rwa") return m.kind !== "stock" && (m.base || "").toUpperCase() === want;
    return m.kind !== "stock" && normalBase(m.base || m.symbol, m.kind) === want;
  });
  if (fits.some((m) => m.symbol.includes("@"))) {
    const chain = (line.note ?? "").split(" · ")[0]!.trim();
    return chain ? fits.find((m) => m.symbol.endsWith(`@${chain}`)) : undefined;
  }
  return fits.find((m) => m.quote.toUpperCase() === "USD") ?? fits[0];
}

/** what a restarted account brought back from its ledgers (account/restore.ts), as the page and the log say it */
export interface RestoreReport {
  /** how many earlier runs the account continues, and the first of them */
  runs: number;
  from: string;
  owner: boolean;
  agents: number;
  limits: number;
  mode: "Guard" | "Beast";
  /** each connection brought back: connected again, or why not — `waiting` while it is asked again (the network did not let it just then) */
  venues: Array<{ venue: string; ok: boolean; why?: string; waiting?: boolean; said?: string }>;
  orders: number;
  payments: number;
  skipped: string[];
  state: "restoring" | "done";
}

/** one connection waiting for its venue to answer this network (PortfolioService.waiting) */
interface Waiting {
  /** the connection as the owner signed it: venue, connector, label, the key file's place or the address, a wallet's proof */
  c: Rebuilt["connections"][number];
  /** connected by the owner while the venue did not answer, or not back after a restart */
  how: "connect" | "restart";
  /** when it began waiting (the real clock, ms) */
  since: number;
  /** the restore report's line for it, kept up to date, when a restart is bringing it back */
  row?: { report: RestoreReport; i: number } | undefined;
  tries: number;
  last: Refusal;
  /** why it waits and when it is asked again, in words (waitLater); the venue's no, when it answered and refused the connection itself */
  said: string;
  /** the venue answered and refused the connection itself: not asked again on its own */
  stopped?: true | undefined;
  timer?: ReturnType<typeof setTimeout> | undefined;
  asking?: boolean | undefined;
}

/** how a venue has answered the account's reads lately */
export interface VenueHealth {
  /** when it last answered (a refusal about the request itself is an answer) */
  lastOkAt?: string | undefined;
  /** when it last failed — it did not answer, it is rate-limiting this machine, it does not serve this location, the key may not read —
   * the code of that failure and the venue's words for it */
  lastFailAt?: string | undefined;
  code?: string | undefined;
  message?: string | undefined;
  /** how long its last read took, in milliseconds */
  ms?: number | undefined;
}

/** what a venue's earn positions are kept for at most, beside the balance read they belong to */
const KEEP_HELD_MS = 120_000;
/** how old a venue's last balance-and-earn pair may be and still be shown whole when its earn is late: past it, the newer balance stands */
const PAIR_MS = 120_000;

/** the venues the account knows, as connections to judge (live/availability.ts): each well-known exchange by its own id, and every other
 * way of connecting the server offers, under the names and groups the page gives them */
const EXCHANGE_NAMES: Record<string, string> = { okx: "OKX", okxus: "OKX US", kraken: "Kraken", coinbase: "Coinbase", bybit: "Bybit", binance: "Binance", binanceus: "Binance.US", kucoin: "KuCoin", gate: "Gate", bitget: "Bitget", mexc: "MEXC", deribit: "Deribit", krakenfutures: "Kraken Futures", kucoinfutures: "KuCoin Futures", cryptocom: "Crypto.com", gemini: "Gemini", bitstamp: "Bitstamp", bitfinex: "Bitfinex", htx: "HTX" };
const KIND_HERE: Record<string, { name: string; group: VenueHere["group"] }> = {
  alpaca: { name: "Alpaca", group: "Brokers" },
  robinhood: { name: "Robinhood", group: "Brokers" },
  "robinhood-crypto": { name: "Robinhood Crypto", group: "Brokers" },
  metamask: { name: "MetaMask Agent Wallet", group: "Wallets" },
  wallet: { name: "A wallet (a browser wallet, or an address watched)", group: "Wallets" },
  kalshi: { name: "Kalshi", group: "Markets and tokens" },
  "polymarket-us": { name: "Polymarket US", group: "Markets and tokens" },
  "polymarket-trade": { name: "Polymarket", group: "Markets and tokens" },
  polymarket: { name: "Polymarket · by address", group: "Markets and tokens" },
  "hyperliquid-trade": { name: "Hyperliquid", group: "Markets and tokens" },
  "hyperliquid-paper": { name: "Hyperliquid · paper (testnet)", group: "Markets and tokens" },
  "alpaca-paper": { name: "Alpaca · paper", group: "Brokers" },
  paper: { name: "Paper account (nothing to connect)", group: "Paper" },
  hyperliquid: { name: "Hyperliquid · by address", group: "Markets and tokens" },
  ondo: { name: "Ondo · OUSG", group: "Markets and tokens" },
};
export function venueCatalog(options: Array<{ kind?: string; needs: VenueHere["needs"]; label: string }>): AvailabilityDeps["connections"] {
  const exchanges = options.some((o) => o.kind === "exchange") ? KNOWN_EXCHANGES.map((id) => ({ connector: `live:exchange:${id}`, name: EXCHANGE_NAMES[id] ?? id, group: "Exchanges" as const, needs: "key-file" as const })) : [];
  const others = options.filter((o) => o.kind && o.kind !== "exchange").map((o) => ({ connector: `live:${o.kind}`, name: KIND_HERE[o.kind!]?.name ?? o.label.split(" · ")[0]!, group: KIND_HERE[o.kind!]?.group ?? ("Markets and tokens" as const), needs: o.needs }));
  return [...exchanges, ...others];
}

/** how long a venue that cannot be asked just now is not asked again: it did not answer, it is rate-limiting this machine, or it does not
 * serve this location — and ten minutes when it does not serve this location, a rule that does not change by the minute */
const FAIL_KEEP_MS = 20_000;
/** how long a public source's listings, tickers and events are kept here (its own keeping of the bodies it downloads sits under it) */
const PUBLIC_KEEP_MS = 20_000;
/** how old a listing's quote that carries no time of its own may be when a book here shows it: the source keeps the quote LISTING_KEEP_MS
 * from when it read it, and this service keeps the listing PUBLIC_KEEP_MS from when it asked — asked just before the source's keep ran
 * out, it is the old quote that is kept the twenty seconds more */
const LISTED_QUOTE_UP_TO_MS = LISTING_KEEP_MS + PUBLIC_KEEP_MS;
/** how long a venue's market, its price with it, is kept here (kept) */
const MARKET_KEEP_MS = 3_000;
/** how long one public market's line asked alone (PublicSource.line) is kept here: a paper account's quote of a share it knows stands on it,
 * its prices the background reader's while that is live */
const LINE_KEEP_MS = 3_000;
/** the paper accounts' curve, and each market's bars it is told with, are kept a minute: the page asks every minute */
const PAPER_CURVE_MS = 60_000;
/** the orders whose fills the pages were told of, kept to say only what each fills next (toldFill) */
const TOLD_FILLS_MAX = 5_000;
/** how often the service looks at each paper account's book on its own (watchPaper) */
const PAPER_LOOK_MS = 5_000;
/** how often the standing price alerts' markets are priced and each alert judged (service.ts watchAlerts): half a minute, which the page
 * says ("checked about every 30 seconds") */
export const ALERT_LOOK_MS = 30_000;
/** how often the account's door looks by itself while a page listens on the push channel (watchDoor). Each look asks a venue about an
 * order only once that order's own wait is up (live-orders.ts POLL_MS, ten seconds): a look every five seconds comes within five of it,
 * where a page that read every twenty seconds came within twenty — so a fill at a real venue is no later on screen than it was then */
const DOOR_LOOK_MS = 5_000;
/** one market's bars for the paper accounts' curve: eight seconds to come, or the curve goes on with its last fill price */
const PAPER_BARS_MS = 8_000;
/* the one rule for how long a refusal holds a venue back lives with the public sources (live/public-markets.ts holdBackMs): the same rule
   for a venue connected with a key and for a keyless source */
const holdsBack = (r: Refusal): boolean => holdBackMs(r) > 0;
/** a read that failed because of the venue or the key, not because of what was asked */
const venueFailed = (r: Refusal): boolean => holdsBack(r) || r.code === "E_VENUE_PERMISSION";
/** the venue's ban of this machine's address (its 418, or "banned until"): it covers every request from here, keyless or keyed */
const isBan = (r: Refusal): boolean => {
  const n = r.native as { ban?: unknown; status?: unknown } | undefined;
  return n?.ban === true || n?.status === 418;
};
/** a hold on the venue's own time — a ban, or a wait it named (`native.until`) that has not run out: no re-check from here lifts it */
const ownTime = (r: Refusal, now: number): boolean => {
  const until = (r.native as { until?: unknown } | undefined)?.until;
  return isBan(r) || (typeof until === "number" && until > now);
};
/** the party that gave a refusal, when it is not the venue itself (LI.FI, for a wallet's swaps): its hold is its own (`native.party`) */
const partyOf = (r: Refusal): string | undefined => {
  const p = (r.native as { party?: unknown } | undefined)?.party;
  return typeof p === "string" && p ? p : undefined;
};
/** the venue a read cache name stands for: `public:okx` is OKX's keyless source, read apart from an OKX connected with a key */
const bareVenue = (venue: string): string => venue.replace(/^public:/, "");
/** a read cache name that is the venue's, one of its parties' (`venue|party`) or one of its parts' (`venue#part`) */
const ofVenue = (name: string, venue: string): boolean => name === venue || name.startsWith(`${venue}|`) || name.startsWith(`${venue}#`);
/** the connection a read cache name is part of: `mm#swaps` (one of the venues mm reaches) is part of `mm`, whose own hold holds it too */
const baseVenue = (venue: string): string => venue.replace(/#.*$/, "");
/** one of the venues mm reaches, by the form of the symbol: a token swap (TOKEN/USDC@chain), a perpetual (COIN-PERP), a prediction market
 * (slug:outcome, or a token id). One asset's rule or one inner venue's hold is that venue's, not every read of the mm connection */
const mmInner = (symbol: string): string | undefined => (symbol.includes("@") ? "swaps" : /-PERP$/i.test(symbol) ? "perps" : symbol.includes(":") || /^\d{10,}$/.test(symbol) ? "predict" : undefined);
/** mm itself cannot be asked (not installed, the node it needs, signed out): every read of the mm connection waits it out */
const MM_WIDE: ReadonlySet<string> = new Set(["ENOENT", "UNSUPPORTED_NODE", "MISSING_AUTH_TOKEN", "AUTH_REQUIRED", "AUTH_FAILED", "AUTH_ERROR", "TOKEN_INVALID", "TOKEN_REFRESH_FAILED", "NOT_INITIALIZED"]);
const connectionWide = (r: Refusal): boolean => r.code === "E_ACCOUNT_CREDENTIAL" || MM_WIDE.has(String((r.native as { code?: unknown } | undefined)?.code));
/** how many of one venue's reads are on their way at once: the rest wait their turn */
const PER_VENUE = 2;
/** the longest anything is kept */
const KEEP_MAX_MS = 300_000;
/** the last word of each statement line type: an order's, a movement's (account/payments.ts), an earn request's (live/earn.ts EarnState) */
const STATEMENT_FINAL: ReadonlySet<string> = new Set([...DONE, "settled", "failed", "stranded", "done"]);

/** a connector that threw has answered in a way the account cannot read: the venue's refusal for it, with no word of the exception on the
 * wire (the exception is written to the server's log, once per throw; a thrower is held back like a venue that did not answer) */
function thrownBy(venue: string, name: string, err: unknown): Refusal {
  if (isRefusal(err)) return err;
  console.error(`${venue}: a read threw: ${String((err as Error)?.message ?? err).slice(0, 300)}`);
  return no("E_VENUE_UNREACHABLE", { venue, message: `${name} answered in a way the account could not read` });
}

/** the countries whose parts the lists in use name (US states in Binance.US's list, in a venue's terms): the place's part is looked up for
 * these when the first source gave only the country (location.ts place's `splits`) */
const SPLIT: ReadonlySet<string> = new Set(
  [...Object.values(EDITIONS).flatMap((es) => es.flatMap((e) => e.serves)), ...Object.values(VENUE_TERMS).flatMap((t) => [...(t.excludes ?? []), ...(t.serves ?? []), ...(t.routes?.places ?? [])])]
    .filter((code) => code.includes("-"))
    .map((code) => code.split("-")[0]!),
);

/** A refusal met while connecting a venue that is how THIS NETWORK is just now, not the venue's answer about the key or the account: no
 * answer (no network yet at login, a captive portal's page, an outage, a ban or rate limit until its time, Hyperliquid's place not known
 * just now), a redirect a portal answered in the venue's place, and a place rule or an edge page — the venue refusing the network the
 * account runs on. Such a refusal decides nothing about the account's structure: the connection is kept and asked again (service.ts
 * `wait`), whether the owner is connecting it now or a restart is bringing it back. A key, a permission or anything else the venue said
 * about the account is final, as before */
function ofThisNetwork(r: Refusal): boolean {
  const status = (r.native as { status?: unknown } | undefined)?.status;
  return r.code === "E_VENUE_UNREACHABLE" || (r.code === "E_VENUE_GEOBLOCKED" && holdBackMs(r) > 0) || (r.code === "E_VENUE_REJECTED" && typeof status === "number" && status >= 300 && status < 400) || ipListed(r);
}
/** the key is bound to a list of addresses, and this machine's is not on it now (OKX 50110, Bybit 10010 …): the key and the venue are fine,
 * and the address this network gives decides — a laptop back on the network the key was bound to answers again */
const ipListed = (r: Refusal): boolean => (r.code === "E_VENUE_PERMISSION" || r.code === "E_VENUE_UNAUTHORIZED") && (r.detail as { ipList?: unknown } | undefined)?.ipList === true;
/** what a venue held at its last good read, for a waiting row (nothing when the log never counted it) */
const lastRead = (l: { usd: number; at: string } | undefined): { lastUsd?: number; lastAt?: string } => (l && l.usd > 0 ? { lastUsd: l.usd, lastAt: l.at } : {});

/** a hold that is the venue's own line for the whole of the network the account runs on — its place rule, or the server in front of it
 * refusing the network — rather than a rule for one product or leverage (`detail.scope`), or a close-only answer that still lets what is
 * held be sold: its words, or nothing */
function notServedBy(r: Refusal | undefined): string | undefined {
  if (!r || r.code !== "E_VENUE_GEOBLOCKED") return undefined;
  if ((r.detail as { scope?: unknown } | undefined)?.scope !== undefined) return undefined;
  if ((r.native as { closeOnly?: unknown } | undefined)?.closeOnly === true) return undefined;
  return r.message;
}
/** whose no a refusal is: the venue's own (its codes), or this account's own check before anything was sent (a key file not there or
 * unreadable, mm not installed, no sign-in on this server) */
const byVenue = (r: Refusal): boolean => r.code.startsWith("E_VENUE_");
/** how long a connection whose venue did not answer waits before it is asked again: longer each time, a quarter of an hour at most */
const COMING_BACK_MS = [15_000, 30_000, 60_000, 120_000, 300_000, 900_000];
/** a wait, as a person says it */
const waitText = (ms: number): string => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/** A row on its way to the ledger with this machine's address taken out of the words in it — its reason, native and detail — so a venue's
 * words that never passed through no() do not write the address down. A row with no words is passed as it is; the signed envelope and a
 * wallet's proof (the sentence it signed, checked again at a restart) are kept exactly as signed */
function unaddressedRow<T extends { reason?: unknown; native?: unknown; detail?: unknown }>(row: T): T {
  const words = (v: unknown): boolean => (typeof v === "string" ? /[.:]/.test(v) : v !== null && typeof v === "object");
  if (!words(row.reason) && !words(row.native) && !words(row.detail)) return row;
  const native = row.native as { proof?: unknown } | undefined;
  return {
    ...row,
    ...(typeof row.reason === "string" ? { reason: unaddressed(row.reason) } : {}),
    ...(words(row.native) ? { native: native && typeof native === "object" && !Array.isArray(native) && "proof" in native ? { ...(unaddressedDeep({ ...native, proof: undefined }) as object), proof: native.proof } : unaddressedDeep(row.native) } : {}),
    ...(words(row.detail) ? { detail: unaddressedDeep(row.detail) } : {}),
  };
}

/** whether an outcome reached a venue: "no" for a card the owner rejected (its result a refusal), a move or order still waiting for the
 * wallet to send it (or taken back before it was), and an order the account stopped following because its venue is not connected;
 * "maybe" for a write whose answer was lost (`unsure`: it may have landed); "yes" for every other */
function reachedVenue(r: Exclude<Outcome, Refusal>): "yes" | "maybe" | "no" {
  const unsure = (native: unknown): boolean => (native as { unsure?: unknown } | undefined)?.unsure === true;
  if (r.kind === "result") {
    const x = (r.result && typeof r.result === "object" ? r.result : {}) as { wallet?: unknown; walletTxs?: unknown; earn?: { native?: unknown } };
    if (isRefusal(r.result) || x.wallet !== undefined || x.walletTxs !== undefined) return "no";
    // money into or out of earn whose answer was lost: it may have landed, and a hold the venue set (its place rule, a ban) stands
    return x.earn && unsure(x.earn.native) ? "maybe" : "yes";
  }
  if (r.kind === "order") return (r.order.walletTxs && !r.order.ref) || r.order.unfollowed ? "no" : unsure(r.order.native) ? "maybe" : "yes";
  if (r.kind === "payment") return r.payment.status === "authorized" ? "no" : unsure(r.payment.legs[0]?.native) ? "maybe" : "yes";
  return "yes";
}

/** a day as the page writes one: New York, weekday, day and month — "Thu Nov 5" */
const nyDay = (iso: string): string => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/** the liquidity map of a real account: each venue's ready dollars, movable or not as that venue's own writer says (account/holdings.ts
 * movesOut and why), never by the kind of venue it is. A wallet's line names the chain the dollars are on */
function liveLiquidity(page: AccountPage): Liquidity {
  const { money } = byAsset(page.venues, { writes: page.connectLive?.writes?.on === true });
  const out: Liquidity = { mobileUsd: 0, stuckUsd: 0, mobile: [], stuck: [] };
  for (const v of money.venues) {
    for (const l of v.lines) {
      const first = (l.note ?? "").split(" · ")[0]!.trim();
      const src = { account: v.venue, name: v.venueName, asset: l.asset, ...(Object.hasOwn(CHAINS, first) ? { chain: first } : {}), usd: l.usd };
      if (v.movesOut) out.mobile.push(src);
      else out.stuck.push({ ...src, why: v.why ?? "stays where it is" });
    }
  }
  out.mobileUsd = r2(out.mobile.reduce((s, x) => s + x.usd, 0));
  out.stuckUsd = r2(out.stuck.reduce((s, x) => s + x.usd, 0));
  return out;
}

/** Answers kept for a short while, and one request in flight per key: an answer still on its way is waited for whatever its age, so a venue
 * that takes ten seconds to say no is asked once, not once per poll. A refusal is not kept — the next ask asks the venue again — except one
 * that says the venue cannot be asked just now, which is kept twenty seconds (ten minutes for a geoblock) and holds back EVERY read of that
 * venue for as long, so a page polling every few seconds does not hammer a venue that is down, rate-limiting or refusing this location.
 * With a venue named: at most two of its reads on their way at once, and how each one went is its health.
 *
 * A hold ends when the LATER of the venue's refusals says (a timeout after a ban does not shorten the ban), a read that waited its turn is
 * not sent into a hold set while it waited, and a ban of this machine's address holds the venue's keyless source and its keyed connection
 * alike. A refusal from another party than the venue (`native.party`: LI.FI pricing a wallet's swaps) holds that party's reads only, and
 * one from a part of a connection (`mm#swaps`, one of the venues mm reaches; `public:polymarket#history`, a source's other host) holds that
 * part only — while the connection's own hold holds every part of it */
class ReadCache {
  /** `onRule`: a venue's own rule for the whole network, met by one of its reads and held here (the service remembers it for the keyless gate) */
  constructor(
    private readonly onRule?: (venue: string, r: Refusal) => void,
    /** the clock what is kept expires on: the wall clock unless given */
    private readonly clock: () => number = Date.now,
  ) {}
  private readonly kept = new Map<string, { at: number; value: Promise<unknown>; failed: boolean; settled: boolean }>();
  private readonly slots = new Map<string, { busy: number; waiting: Array<() => void> }>();
  private readonly health = new Map<string, VenueHealth>();
  /** a venue that said it cannot be asked just now: until when, and the refusal that stands for every read of it meanwhile. A party's own
   * hold is kept under `venue|party` */
  private readonly down = new Map<string, { until: number; refusal: Refusal }>();
  /** a ban of this machine's address, by the venue it is of (`binance` for the keyed connection and the keyless source both), and when it
   * was answered */
  private readonly bans = new Map<string, { until: number; refusal: Refusal; at: number }>();

  /** `parties`: the read is one of the venue's trader's (its markets, prices, history), which another party may answer for */
  get<T>(key: string, ttlMs: number, load: () => Promise<T>, venue?: string, parties = false): Promise<T> {
    const now = this.clock();
    const hit = this.kept.get(key);
    if (hit && (!hit.settled || now - hit.at < (hit.failed ? FAIL_KEEP_MS : ttlMs))) return hit.value as Promise<T>;
    const held = venue === undefined ? undefined : this.holding(venue, parties);
    if (held) return Promise.resolve(held.refusal as unknown as T);
    const entry: { at: number; value: Promise<unknown>; failed: boolean; settled: boolean } = { at: now, value: Promise.resolve(), failed: false, settled: false };
    // a read that waited its turn asks again whether the venue is held: it may have answered a ban, its place rule or an edge page to the
    // reads ahead of it. One turned away is not sent, and changes nothing of the venue's health
    const run =
      venue === undefined
        ? load
        : () =>
            this.slot(venue, () => {
              const since = this.holding(venue, parties);
              return since ? Promise.resolve(since.refusal as unknown as T) : this.timed(venue, load);
            });
    const value = run().then(
      (v) => {
        entry.settled = true;
        if (isRefusal(v) && this.kept.get(key) === entry) {
          if (holdsBack(v)) Object.assign(entry, { at: this.clock(), failed: true });
          else this.kept.delete(key);
        }
        return v;
      },
      (err: unknown) => {
        entry.settled = true;
        if (this.kept.get(key) === entry) this.kept.delete(key);
        throw err;
      },
    );
    entry.value = value;
    this.kept.set(key, entry);
    if (this.kept.size > 500) for (const [k, v] of this.kept) if (v.settled && now - v.at >= KEEP_MAX_MS) this.kept.delete(k);
    return value;
  }

  /** a venue disconnected, or connected afresh: what was kept of its answers, its hold-backs and its health go with it (a venue connected
   * again under the same id starts afresh). A ban of this machine's address stays — disconnecting does not lift it — unless the venue
   * `answered` just now (a connection it took) */
  forget(venue: string, answered = false): void {
    const ban = this.bans.get(bareVenue(venue));
    this.drop(venue, true);
    if (ban && !answered) this.bans.set(bareVenue(venue), ban);
    for (const k of [...this.health.keys()]) if (ofVenue(k, venue)) this.health.delete(k);
  }

  /** a write at a venue: what was kept of its reads goes, so the next read sees what the write changed. When the venue `answered` the
   * write it is not held back either; when nothing says it was reached (a card rejected, a move still waiting for the wallet), a hold it
   * set — a ban, its place rule — stands. Its health stays */
  drop(venue: string, answered = true): void {
    for (const k of [...this.kept.keys()]) if (ofVenue(k.split("|")[1] ?? "", venue)) this.kept.delete(k);
    if (!answered) return;
    for (const k of [...this.down.keys()]) if (ofVenue(k, venue)) this.down.delete(k);
    for (const k of [...this.bans.keys()]) if (ofVenue(k, bareVenue(venue))) this.bans.delete(k);
  }

  /** a re-check the user (or the half-hourly watch) asked for found the venue answering the network the user is on now: a hold learned on
   * the network before — its place rule, an edge page, no answer — and the refusals kept with it go. A hold on the venue's own time (a
   * ban, a wait it named) stands until then. Its health stays */
  release(venue: string): void {
    const now = Date.now();
    for (const [k, d] of [...this.down]) if ((k === venue || k.startsWith(`${venue}#`)) && !ownTime(d.refusal, now)) this.down.delete(k);
    if (this.holding(venue, false)) return;
    for (const [k, v] of this.kept) if (v.failed && v.settled && ofVenue(k.split("|")[1] ?? "", venue)) this.kept.delete(k);
  }

  /** every answer kept under these first segments (`explore`, `compare`): what a venue connected or disconnected changes */
  forgetAll(prefixes: readonly string[]): void {
    for (const k of [...this.kept.keys()]) if (prefixes.some((p) => k.startsWith(`${p}|`))) this.kept.delete(k);
  }

  /** the venue's health, as its reads through here went */
  healthOf(venue: string): VenueHealth | undefined {
    const h = this.health.get(venue);
    return h ? { ...h } : undefined;
  }

  /** the refusal that holds the venue back now, if one does: its own hold, or a ban of this machine's address learned by its keyless
   * source or its connection. What the venue's balance reads (adapters/live.ts) and its market reads follow alike */
  heldOf(venue: string): Refusal | undefined {
    return this.holding(venue, false)?.refusal;
  }

  /** a running ban of this machine's address by the venue, and when it was answered */
  banOf(venue: string): { refusal: Refusal; at: number } | undefined {
    const b = this.bans.get(bareVenue(venue));
    return b && Date.now() < b.until ? b : undefined;
  }

  /** a refusal the venue gave elsewhere on the account (its balance read, an order or earn door, the keyless probe's ban): held as one of
   * these, by the same rule — it lengthens a hold, never cuts one */
  hold(venue: string, r: Refusal): boolean {
    if (!holdsBack(r)) return false;
    this.holdBack(venue, r);
    // a party's refusal (LI.FI for a wallet's swaps) holds that party, not the venue: the venue's reads go on as before
    return !partyOf(r);
  }

  private holding(venue: string, parties: boolean): { until: number; refusal: Refusal } | undefined {
    const now = Date.now();
    const base = baseVenue(venue);
    for (const at of base === venue ? [venue] : [venue, base]) {
      const own = this.down.get(at);
      if (own && now < own.until) return own;
      const ban = this.bans.get(bareVenue(at));
      if (ban && now < ban.until) return ban;
    }
    if (parties) for (const [k, d] of this.down) if (k.startsWith(`${venue}|`) && now < d.until) return d;
    return undefined;
  }

  /** held back until the later of what is held and what this refusal says: a 429 or a timeout that lands after a ban does not shorten
   * it, nor does a 20-second "no answer" shorten a ten-minute place rule. Reads meanwhile answer in the words of the longer hold */
  private holdBack(venue: string, r: Refusal): void {
    if (!partyOf(r)) this.onRule?.(venue, r);
    const now = Date.now();
    const until = now + holdBackMs(r, now);
    const at = partyOf(r) ? `${venue}|${partyOf(r)}` : connectionWide(r) ? baseVenue(venue) : venue;
    const was = this.down.get(at);
    if (!was || was.until <= now || was.until < until) this.down.set(at, { until, refusal: r });
    if (isBan(r) && !partyOf(r)) {
      const b = this.bans.get(bareVenue(at));
      if (!b || b.until <= now || b.until < until) this.bans.set(bareVenue(at), { until, refusal: r, at: now });
    }
  }

  /** one of the venue's two places in line (one line for a whole connection, its parts included), handed straight to the next read
   * waiting when it is done */
  private async slot<T>(venue: string, run: () => Promise<T>): Promise<T> {
    let s = this.slots.get(baseVenue(venue));
    if (!s) this.slots.set(baseVenue(venue), (s = { busy: 0, waiting: [] }));
    const line = s;
    if (line.busy < PER_VENUE) line.busy++;
    else await new Promise<void>((go) => line.waiting.push(go));
    try {
      return await run();
    } finally {
      const next = line.waiting.shift();
      if (next) next();
      else line.busy--;
    }
  }

  /** one read, timed for the venue's health; a venue that said it cannot be asked just now is held back for the keep, whenever it said so.
   * Another party's refusal is that party's health and hold, not the venue's */
  private async timed<T>(venue: string, load: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const note = (h: VenueHealth, at = venue) => this.health.set(at, { ...this.health.get(at), ...h, ms: Date.now() - start });
    try {
      const v = await load();
      if (isRefusal(v) && venueFailed(v)) {
        note({ lastFailAt: new Date().toISOString(), code: v.code, message: v.message }, partyOf(v) ? `${venue}|${partyOf(v)}` : connectionWide(v) ? baseVenue(venue) : venue);
        if (holdsBack(v)) this.holdBack(venue, v);
      } else {
        note({ lastOkAt: new Date().toISOString() });
        // a part that answered: the connection answered
        if (baseVenue(venue) !== venue) note({ lastOkAt: new Date().toISOString() }, baseVenue(venue));
      }
      return v;
    } catch (err) {
      // the readers above turn a throw into a refusal before it gets here; one that still throws is held back the same way, and the
      // exception's words stay in the server's log
      const r = thrownBy(venue, venue, err);
      note({ lastFailAt: new Date().toISOString(), code: r.code, message: r.message });
      this.holdBack(venue, r);
      throw err;
    }
  }
}
