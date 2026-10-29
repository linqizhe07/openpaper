/** A STAND-IN ACCOUNT: the real account page, server and doors, over stand-in venues — to look at and click through the page with NO
 * network and NO real money.
 *
 *   npx tsx test/standin/ui-standin.ts --port 4821      (never 4820: that port is the real account's)
 *     --cap 250        the most one order or movement may be worth (the server's --live-cap)
 *     --tick 3000      how often prices move, in milliseconds
 *     --no-desk        no desk hired: the page's own setup, with the real brains behind it — every preset the account knows (brains.ts:
 *                      Claude, OpenAI, DeepSeek, Grok · xAI, Muse · Meta, Kimi, Qwen, OpenRouter, Gemini, Groq, Together, Ollama,
 *                      vLLM, a custom endpoint) — each saying honestly that this home holds no key for it (the no-key fix: its key file's
 *                      path and the command that makes it), and Ollama and vLLM, which need no key and no file, that they need a model's
 *                      name. A key saved for one of them makes it ready (a local server: a model named for it), but the stand-in reaches no
 *                      network: its calls and its "Test the key" answer that the endpoint could not be reached
 *     --superagent     the desk hired as the SUPERAGENT at the account's own paper account (paper-momentum), its autonomy on paper signed,
 *                      its clock running every ten seconds and a cycle every minute, the first a few seconds after the start
 *     --cards          with --superagent: hired with the autonomy OFF, so in Guard every lead it clears waits for you on a card — the
 *                      Superagent pane's "Waits for you" strip, with real cards to approve or reject
 *     --no-paper       no paper account connected (neither the stand-in's own nor the account's live:paper one): Trade's paper onboarding
 *                      card shows, and opening one from it is signed there as any connection is (feat/paper-live phase 4). Not with
 *                      --superagent, which trades a paper account
 *     --brain-refuses  the scripted brain answers as the API does to a key it refuses (E_BRAIN_KEY_REJECTED, brain-key.ts): the desk's
 *                      standing turns "not ready" with the rejected-key fix, and the room says so once. The stand-in writes a stand-in key
 *                      to <home>/credentials/anthropic/api-key.json at the start; change what that file holds (the fix's command opens
 *                      it), or save a key for Claude on the page (credentials/brains/claude.json, which is read before it), and the next
 *                      call is answered, as a replaced key would be
 *     --providers      the model providers answer their list of models for a stand-in key — one that holds "standin", which no provider
 *                      ever issued (sk-proj-standin0000000000000000, sk-ant-api03-standin0000000000000000) — and refuse any other with a
 *                      401, as theirs would: so "Connect a key" (the Superagent's paste row, account/brain-detect.ts) can be clicked through
 *                      to the end. Nothing else of theirs answers: a desk that thinks with one meets no network, as without the flag
 *
 * THE BRAINS. With a desk (the default, --superagent), the desk thinks with a SCRIPT — never a model — held under Claude's preset id
 * ("claude", labelled "A script (stand-in, as Claude)"), beside every other preset's real brain: so the Brains place shows every provider
 * with its honest standing (no key in this fresh home; Ollama and vLLM ready once a model is named, needing neither key nor file), and
 * switching the brain away and back can be clicked through. The real brains here read no variable from the shell that started the stand-in
 * (so no ANTHROPIC_BASE_URL or OPENAI_API_KEY there changes what the page shows) and reach no network: a key saved on the page makes one
 * ready, and its calls then answer that the endpoint could not be reached.
 *
 * It starts the account exactly as `npm run account` does — real accounts only, trading on with a small cap, a pairing code printed here —
 * on a fresh temporary home, with every live connection's reach replaced by a stand-in (test/standin/venues.ts): the venues, the public
 * market data, the network (every request answers "no network"), the chains (an agent wallet's balance is the stand-in's), the payees (no
 * one is paid) and the mm command line. Nothing leaves the process.
 *
 * What it seeds, all of it through the account's own door — owner actions signed by the stand-in's seed key, agent actions by a simulated
 * agent key, the way the tests sign them:
 *
 *   venues        Stand-in Exchange (spot and perpetuals, a BTC perpetual it already held, and earn: a flexible USDT product and a bonded
 *                 ETH one), Stand-in Predictions (event contracts), Stand-in Wallet (tokens, an RWA among them), Stand-in Broker (AAPL,
 *                 NVDA and SPY in New York's market hours by the stand-in's clock; $2,000 in cash, 3 AAPL and 2 NVDA held); agents may set
 *                 leverage up to 5x. Each trader says the kinds of market it trades itself (live/trade.ts `kinds`)
 *   the owner's   a market buy of ETH, a resting limit buy of SOL (it fills when the price comes down to it), a limit sell of BTC above the
 *   own trading   market, a stop under SOL, 5x on the ETH perpetual and a long there, 50 YES contracts on the Fed, WETH bought from the
 *                 wallet, a limit placed and canceled; at the broker, while the US market is open, market buys of half a share of AAPL and
 *                 a share of NVDA (while it is closed no market order is taken: the broker held them already), and a limit buy of a
 *                 quarter share of SPY under the market — on the book, or held by the broker until the open; a fraction of a share is a
 *                 day order, so it lapses at its session's close; spot to futures, USDC swapped for USDT, $25 withdrawn to the agent's
 *                 wallet, $150 of USDT put into the flexible earn product (done on the next tick)
 *   the agent     "Claude Code": let in for 30 days, a trading limit ($150 an order, $600 in all, at the three venues), a limit between the
 *                 user's own places and a payees limit, an agent wallet; in Beast it places a limit buy of SOL inside its limit, then
 *                 in Guard it asks for a market buy of ETH, which waits on a card for the owner
 *   steering      two intents (one to Claude Code, one to every agent), Claude Code's report on the first, two asks (a bigger budget, a
 *                 venue connected), three watched markets — one at a venue that is not connected
 *   memory        what Claude Code remembers about the owner (account/memory.ts): two notes the owner wrote, two it learned, each
 *                 saying how (Account › Memory)
 *   the curve     net worth points over the last seven days, off the stand-in's own price curves, so the curve draws at once
 *
 * PAIRING. The seed key paired first, with the code, the way a browser does. The page then asks this browser for the code too: typed
 * right, the seed key signs one owner action (convertToMultiSigUser) that makes this browser an owner beside it, one signature enough.
 * The seed key stays an owner because every limit it signed is checked against the owners each time it is used: a limit whose signer is
 * gone no longer stands. A second browser after that waits until an owner lets it in under Devices, as on the real account.
 *
 * The agent wallet's key is made in the home the way a real one is (account/keystore.ts), so its address is a real address on every EVM
 * chain: its balance here is the stand-in chain's, and nothing real should ever be sent to it.
 *
 * While it runs: prices move every few seconds — the paper accounts' quotes and the page's pushed quote, book and trades with them, through a
 * stand-in for the venues' live streams (venues.ts standinHub; only while prices move, never in tests that step them) — a resting order fills
 * when the price crosses it (at the broker, only while the US market is open), a stop fires, the fifteen-minute bitcoin market rolls over and settles; Claude Code reports when its order fills, and when its
 * card expires unanswered the seed key closes it and Claude Code asks again (in Guard only).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { no } from "../../src/portfolio/refuse.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { BRAIN_MODELS, scriptedBrain, seatName, type Brain, type BrainAnswer, type BrainRequest, type RoleId } from "../../src/portfolio/account/desk.ts";
import { momentumScriptBrain } from "../../src/portfolio/account/brain-script.ts";
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_KEY_REF, CLAUDE_KEY_REF, type ClaudeClient, type ClaudeClientOptions } from "../../src/portfolio/account/brain-claude.ts";
import { keyRejected, present, rejectedFix } from "../../src/portfolio/account/brain-key.ts";
import { BRAIN_PRESETS, brainProviders } from "../../src/portfolio/account/brains.ts";
import type { OpenAIPreset } from "../../src/portfolio/account/brain-openai.ts";
import { agentWalletKey } from "../../src/portfolio/account/keystore.ts";
import { NetWorthLog, networthPath } from "../../src/portfolio/account/networth.ts";
import { isJwk, kidOf, signAgent, signDevice, simKey, type AgentAction, type OwnerAction, type SimKey } from "../../src/portfolio/account/sign.ts";
import { isOwner } from "../../src/portfolio/account/state.ts";
import type { LiveDeps } from "../../src/portfolio/live/index.ts";
import { isStable, type LiveBalance } from "../../src/portfolio/live/types.ts";
import { pairingCode, startPortfolioServer, type PortfolioServerHandle } from "../../src/portfolio/server.ts";
import { loadOpenness, PortfolioService } from "../../src/portfolio/service.ts";
import { standinHistory } from "./history.ts";
import { DAY, toStep } from "./model.ts";
import { makeWorld, publicSources, registerStandins, standinChain, standinHub, standinPrice, standinSender, stockSession, tick, type World } from "./venues.ts";

type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const HOUR = 3_600_000;
export const REAL_PORT = 4820;
export const AGENT_NAME = "Claude Code";

export interface StandinOptions {
  /** 0: any free port (tests) */
  port: number;
  /** the most one order or movement may be worth ($250) */
  capUsd?: number | undefined;
  /** how often prices move and resting orders are looked at (3000 ms); 0: only when `step()` is called */
  tickMs?: number | undefined;
  /** how often the agent looks at its orders and its card (15000 ms); 0: only when `step()` is called */
  agentMs?: number | undefined;
  /** how often the net worth curve gets a point (60000 ms) */
  snapshotMs?: number | undefined;
  /** the real clock (a stand-in's in tests) */
  clock?: (() => number) | undefined;
  /** the pairing code (a fresh one unless given) */
  code?: string | undefined;
  /** where the account keeps its ledger (a fresh temporary home unless given) */
  home?: string | undefined;
  /** the desk hired and run twice (true unless said): false leaves it to the page, with the scripted brain behind it (`--no-desk`) */
  desk?: boolean | undefined;
  /** the desk hired as a SUPERAGENT instead (`--superagent`): at the account's own paper account (paper-momentum), the paper autonomy
   * signed on, its clock running every ten seconds and a cycle every minute, the script picking from the very rows Search is shown — so
   * the Superagent pane's floor (#/trade?mode=superagent) plays real cycles: scans, handoffs, a rejection now and then, orders, fills and
   * exits */
  superagent?: boolean | undefined;
  /** with `superagent`: hired with its autonomy off (`--cards`), so in Guard each lead it clears waits for the owner on a card */
  cards?: boolean | undefined;
  /** the scripted brain refuses its key as the API would (`--brain-refuses`), until the stand-in's key file is changed (refusingBrain) */
  brainRefuses?: boolean | undefined;
  /** the paper accounts connected (true unless said): false connects none (`--no-paper`), so Trade offers to open one */
  paper?: boolean | undefined;
  /** the model providers answer their list of models for a stand-in key (`--providers`: providersFetch, providersClaude), so "Connect a
   * key" can be clicked through to the end; their models still answer nothing */
  providers?: boolean | undefined;
}

/** what was seeded, by id */
export interface Seeded {
  venues: string[];
  agent: { name: string; address: string; wallet: string };
  orders: Record<string, string>;
  card: string;
  intents: string[];
  asks: number;
  watch: number;
  alerts: number;
  curvePoints: number;
}

export interface Standin {
  url: string;
  code: string;
  home: string;
  svc: PortfolioService;
  world: World;
  seeded: Seeded;
  /** the seed key: an owner of the account */
  seed: SimKey;
  /** the agent's key */
  agent: SimKey;
  /** what the timers do, once, now: prices step and resting orders fill; the agent looks at its orders and its card */
  step(): Promise<void>;
  close(): Promise<void>;
}

/** every request the stand-in's connections would make, answered: there is no network here */
const noNetwork: LiveDeps["http"] = async () => ({ status: 599, body: undefined, text: "the stand-in reaches no network" });

const ok = <T extends Outcome | Refusal>(what: string, o: T): Exclude<T, Refusal> => {
  if (isRefusal(o)) throw new Error(`the stand-in could not seed ${what}: ${o.code} · ${o.message}`);
  return o as Exclude<T, Refusal>;
};
const orderOf = (what: string, o: Outcome): string => {
  const r = ok(what, o);
  if (r.kind !== "order") throw new Error(`the stand-in could not seed ${what}: it came back as ${r.kind}`);
  return r.order.id;
};

export async function startStandin(o: StandinOptions): Promise<Standin> {
  if (o.port === REAL_PORT) throw new Error(`port ${REAL_PORT} is the real account's: the stand-in never starts there (use 4821)`);
  registerStandins();
  const clock = o.clock ?? Date.now;
  const world = makeWorld({ clock });
  const madeHome = o.home === undefined;
  const home = o.home ?? mkdtempSync(join(tmpdir(), "ui-standin-"));
  const code = o.code ?? pairingCode();
  const capUsd = o.capUsd ?? 250;
  const month = new Date(clock() + 30 * DAY).toISOString();
  // the venues' live streams, stood in for by the world's own prices (standinHub): while prices move (not in tests, which step them), the
  // paper accounts' quotes and the push channel's market events move with each tick — the public markets the account's own paper account
  // trades, and the stand-in's own exchange and its paper perpetuals under their venue ids (as a venue connected with a key is streamed), so
  // the trading area's bar, chart, book, tape and positions move with the world wherever it opens
  const hub = (o.tickMs ?? 3_000) > 0 ? standinHub(world, { ex: () => world.ex, paper: () => world.pubperps }) : undefined;
  const svc = await PortfolioService.create({
    home,
    venues: "frontline",
    real: true,
    fresh: true,
    liveWrites: { capUsd, pairingCode: code },
    openness: { ...(loadOpenness() as object), sessionExpiresAt: month },
    publicMarkets: publicSources(),
    ...(hub ? { streams: hub } : {}),
    // the lab's history (the Backtest pane): made-up bars and funding up to the stand-in's clock, so a backtest runs with no network
    backtest: { sources: standinHistory(clock) },
    // the desk's brain is a script: Search names the majors in turn, Risk clears $60 with a 1.2% take-profit and a 0.8% stop, Exit holds —
    // held under Claude's preset id beside every other preset's real brain (standinBrains). No desk seeded: the real brains alone stand
    // behind the hire form, each saying honestly that this home holds no key for it
    desk: { brain: o.desk === false ? realBrains(home, o.providers === true) : standinBrains(home, refusingIf(o.brainRefuses === true, o.superagent ? superagentBrain() : standinBrain(), home), o.providers === true), tickMs: o.superagent ? 10_000 : 0 },
    payHttp: async () => ({ status: 0, headers: {}, body: undefined, error: "the stand-in pays no one: it reaches no network" }),
    liveDeps: {
      http: noNetwork,
      clock,
      chain: standinChain(),
      sender: standinSender,
      price: standinPrice,
      mm: async () => {
        throw no("E_VENUE_UNREACHABLE", { venue: "metamask", message: "the stand-in runs no mm command line" });
      },
      openExchange: async () => undefined,
      openMcp: async () => {
        throw new Error("the stand-in reaches no MCP server");
      },
    },
  });
  await svc.restoring;
  const engine = svc.account!;

  // ---- the two signers the stand-in holds: its seed key (an owner) and the agent's key ----
  const seed = simKey("device:ui-standin-seed");
  const agent = simKey("agent:ui-standin-claude-code");
  const paired = engine.pairDevice(seed.jwk, "Stand-in seed key", code);
  if (isRefusal(paired) || paired.role !== "owner") throw new Error("the stand-in's seed key could not pair as the first owner");
  /** the owner asks, as the page does: prepared by the account, signed over exactly what it shows, sent through the door */
  const own = async (draft: Record<string, unknown>): Promise<Outcome> => {
    const p = await engine.prepare(draft);
    if (isRefusal(p)) return p;
    return svc.exchange({ action: p.action, nonce: p.action.nonce, signature: signDevice(seed, p.action) });
  };
  let agentNonce = 0;
  const ag = async (a: NoNonce<AgentAction>): Promise<Outcome> => {
    agentNonce = Math.max(agentNonce + 1, Date.now());
    return svc.exchange(await signAgent(agent, { ...a, nonce: agentNonce } as AgentAction));
  };
  const price = (book: "ex" | "predict" | "wallet" | "broker", symbol: string, side: "bid" | "ask" | "price" = "price"): number => {
    const m = world[book].market(symbol);
    if (!m?.[side]) throw new Error(`the stand-in has no price for ${symbol}`);
    return m[side]!;
  };
  const now = clock();

  // ---- the venues ----
  ok("Stand-in Exchange", await own({ type: "connectVenue", venue: "ex", connector: "live:standin-exchange", label: "Stand-in Exchange", credentialRef: "" }));
  ok("Stand-in Predictions", await own({ type: "connectVenue", venue: "predict", connector: "live:standin-events", label: "Stand-in Predictions", credentialRef: "" }));
  ok("Stand-in Wallet", await own({ type: "connectVenue", venue: "wallet", connector: "live:standin-wallet", label: "Stand-in Wallet", credentialRef: "" }));
  // the broker keeps New York's market hours by the stand-in's clock. While the market is closed it takes no market order, so the half share
  // of Apple and the share of NVIDIA the owner buys below while it is open were held there already
  const stocksOpen = stockSession(now).open;
  if (!stocksOpen) for (const [symbol, qty] of [["AAPL", 0.5], ["NVDA", 1]] as const) world.broker.add("stocks", symbol, qty);
  ok("Stand-in Broker", await own({ type: "connectVenue", venue: "broker", connector: "live:standin-broker", label: "Stand-in Broker", credentialRef: "" }));
  // a paper account beside the real ones: its chip says Paper, its balance is not in the net worth, its orders are rehearsals
  if (o.paper !== false) {
    ok("Stand-in Paper", await own({ type: "connectVenue", venue: "paper", connector: "live:standin-paper", label: "Stand-in Paper", credentialRef: "" }));
    // the account's own paper account (live:paper): paper money in the stand-in's public markets, its book in this home
    ok("Paper · Momentum", await own({ type: "connectVenue", venue: "paper-momentum", connector: "live:paper", label: "Momentum", credentialRef: "25000" }));
  }
  ok("the agents' leverage cap", await own({ type: "setPolicy", change: "maxLeverage", value: "5" }));

  // ---- the owner's own trading: the statement's first lines ----
  const orders: Record<string, string> = {};
  orders.ethBuy = orderOf("a market buy of ETH", await own({ type: "liveOrder", venue: "ex", symbol: "ETH/USDT", side: "buy", orderType: "market", qty: "0.04" }));
  orders.solLimit = orderOf("a limit buy of SOL", await own({ type: "liveOrder", venue: "ex", symbol: "SOL/USDT", side: "buy", orderType: "limit", qty: "0.5", limitPrice: String(toStep(price("ex", "SOL/USDT", "ask") * 0.997, 0.01, "floor")) }));
  orders.btcSell = orderOf("a limit sell of BTC", await own({ type: "liveOrder", venue: "ex", symbol: "BTC/USDT", side: "sell", orderType: "limit", qty: "0.002", limitPrice: String(toStep(price("ex", "BTC/USDT", "bid") * 1.012, 0.1, "ceil")) }));
  orders.solStop = orderOf("a stop under SOL", await own({ type: "liveOrder", venue: "ex", symbol: "SOL/USDT", side: "sell", orderType: "stop", qty: "0.6", stopPrice: String(toStep(price("ex", "SOL/USDT", "bid") * 0.965, 0.01, "floor")) }));
  ok("5x on the ETH perpetual", await own({ type: "liveLeverage", venue: "ex", symbol: "ETH/USDT:USDT", leverage: "5", marginMode: "cross" }));
  orders.ethPerp = orderOf("a long on the ETH perpetual", await own({ type: "liveOrder", venue: "ex", symbol: "ETH/USDT:USDT", side: "buy", orderType: "market", qty: "0.05" }));
  orders.fedYes = orderOf("50 YES on the Fed", await own({ type: "liveOrder", venue: "predict", symbol: "SI-FEDCUT-DEC:YES", side: "buy", orderType: "market", qty: "50" }));
  orders.weth = orderOf("WETH from the wallet", await own({ type: "liveOrder", venue: "wallet", symbol: "WETH/USDC@Base", side: "buy", orderType: "market", qty: "0.02" }));
  orders.btcCanceled = orderOf("a limit buy of BTC", await own({ type: "liveOrder", venue: "ex", symbol: "BTC/USDT", side: "buy", orderType: "limit", qty: "0.001", limitPrice: String(toStep(price("ex", "BTC/USDT", "bid") * 0.95, 0.1, "floor")) }));
  ok("the BTC limit canceled", await own({ type: "liveCancel", venue: "ex", order: orders.btcCanceled }));
  // stocks: market buys only while the market is open — half a share of Apple (a fraction: a day order, the broker's default) and a whole
  // share of NVIDIA (whole shares only) — and a limit buy of a quarter share of SPY under the market, open or closed: on the book, or held
  // by the broker for the open; a day order, so it lapses at its session's close
  if (stocksOpen) {
    orders.aaplBuy = orderOf("a market buy of AAPL", await own({ type: "liveOrder", venue: "broker", symbol: "AAPL", side: "buy", orderType: "market", qty: "0.5" }));
    orders.nvdaBuy = orderOf("a market buy of NVDA", await own({ type: "liveOrder", venue: "broker", symbol: "NVDA", side: "buy", orderType: "market", qty: "1" }));
  }
  orders.spyLimit = orderOf("a limit buy of SPY", await own({ type: "liveOrder", venue: "broker", symbol: "SPY", side: "buy", orderType: "limit", qty: "0.25", limitPrice: String(toStep(price("broker", "SPY", "bid") * 0.997, 0.01, "floor")) }));
  ok("spot to futures", await own({ type: "liveMove", kind: "transfer", from: "ex", fromLedger: "spot", to: "ex", toLedger: "futures", asset: "USDT", toAsset: "USDT", amount: "200" }));
  ok("USDC for USDT", await own({ type: "liveMove", kind: "swap", from: "ex", to: "ex", asset: "USDC", toAsset: "USDT", amount: "50" }));

  // ---- the agent: let in, its limits, its wallet ----
  ok("Claude Code let in", await own({ type: "approveAgent", agentAddress: agent.address, agentName: AGENT_NAME, validUntil: now + 30 * DAY }));
  ok("Claude Code's trading limit", await own({ type: "approveSpend", agent: agent.address, scope: "trade", allow: "ex,predict,wallet", perPayment: "150", budget: "600", windowHours: 0, validUntil: now + 7 * DAY }));
  // the agent wallet's key is made in the home now, so the stand-in chain can hold its starting dollars and gas before it is first read
  const walletKey = agentWalletKey(home, AGENT_NAME);
  if (isRefusal(walletKey)) throw new Error(`the stand-in could not make the agent wallet's key: ${walletKey.message}`);
  const walletAt = walletKey.address.toLowerCase();
  world.chain.set(`${walletAt}|Base|USDC`, 40);
  world.chain.set(`${walletAt}|Base|ETH`, 0.003);
  ok("Claude Code's agent wallet", await own({ type: "createSubAccount", name: AGENT_NAME, agent: agent.address, float: "100" }));
  const walletVenue = svc.accounts().find((a) => a.address?.toLowerCase() === walletAt)?.id ?? "agent-claude-code";
  ok("Claude Code's limit between your places", await own({ type: "approveSpend", agent: agent.address, scope: "venues", allow: `ex,${walletVenue}`, perPayment: "50", budget: "200", windowHours: 24, validUntil: now + 7 * DAY }));
  ok("Claude Code's payees limit", await own({ type: "approveSpend", agent: agent.address, scope: "payees", allow: "api.example.com", perPayment: "2", budget: "20", windowHours: 0, validUntil: now + 7 * DAY }));
  ok("$25 to the agent's wallet", await own({ type: "liveMove", kind: "withdraw", from: "ex", to: walletVenue, asset: "USDC", toAsset: "USDC", network: "Base", amount: "25" }));
  // money to earn: out of spot at once, done on the next tick (the timer's, or step()'s)
  ok("$150 of USDT to earn", await own({ type: "liveEarn", venue: "ex", kind: "supply", product: "flex:USDT", asset: "USDT", amount: "150" }));

  // ---- Beast: the agent's order inside its limit goes at once; Guard: its next one waits on a card ----
  ok("Beast", await own({ type: "setPolicy", change: "mode", value: "open" }));
  orders.agentSol = orderOf("Claude Code's SOL limit", await ag({ type: "agentLiveOrder", venue: "ex", symbol: "SOL/USDT", side: "buy", orderType: "limit", qty: "", usd: "100", limitPrice: String(toStep(price("ex", "SOL/USDT", "ask") * 0.99, 0.01, "floor")) }));
  svc.setMode("guard");
  const asked = ok("Claude Code's card", await ag({ type: "agentLiveOrder", venue: "ex", symbol: "ETH/USDT", side: "buy", orderType: "market", qty: "", usd: "120", limitPrice: "" }));
  if (asked.kind !== "card") throw new Error(`the stand-in's agent order came back as ${asked.kind}, not a card`);
  let card = asked.card.id;

  // ---- the desk (account/desk.ts): the account's own agents — five house seats let in, the two that trade given a limit at the
  // exchange, the desk hired; one cycle in Beast places a lead at once, the next in Guard raises a card ----
  const deskRoles: RoleId[] = ["head", "search", "risk", "sniper", "exit"];
  if (o.desk !== false) for (const role of deskRoles) {
    const k = svc.desk!.seatKeyOf(role);
    if (isRefusal(k)) throw new Error(`the stand-in could not make the ${role} seat's key: ${k.message}`);
    ok(`the ${role} seat let in`, await own({ type: "approveAgent", agentAddress: k.address, agentName: seatName(role), validUntil: now + 30 * DAY }));
    if (role === "sniper" || role === "exit") ok(`the ${role} seat's limit`, await own({ type: "approveSpend", agent: k.address, scope: "trade", allow: "ex", perPayment: "80", budget: "400", windowHours: 0, validUntil: now + 7 * DAY }));
  }
  if (o.desk !== false && o.superagent) {
    for (const role of deskRoles) {
      const k = svc.desk!.seatKeyOf(role);
      if (isRefusal(k)) throw new Error(`the stand-in could not make the ${role} seat's key: ${k.message}`);
      if (role === "sniper" || role === "exit") ok(`the ${role} seat's paper limit`, await own({ type: "approveSpend", agent: k.address, scope: "trade", allow: "paper-momentum", perPayment: "250", budget: "5000", windowHours: 0, validUntil: now + 7 * DAY }));
    }
    ok("the superagent hired", await own({ type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: "Momentum desk", objective: { text: "Ride the majors' momentum on paper, small and quick", venue: "paper-momentum", universe: "crypto", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 1, reportAt: "21:00", maxOpen: 3 }, brain: { model: "claude-opus-5-5", effort: "medium" }, roles: deskRoles.map((role) => ({ role, kind: "house" })), ...(o.cards ? {} : { autonomy: { paper: true } }) }) }));
    // the autonomy on paper is signed in the hire itself (account/desk.ts hire `autonomy`), so the desk never runs a moment without it;
    // `--cards`: it is never signed, so the desk's orders wait for the owner on cards (the account is in Guard by now)
  } else if (o.desk !== false) {
    ok("the desk hired", await own({ type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: "The desk", objective: { text: "Small, careful entries on the majors this week; nothing I could not explain", venue: "ex", universe: "all", targetPct: 3, maxRiskPct: 1, maxDailyLossPct: 5, hours: 22, everyMin: 15, reportAt: "21:00" }, brain: { model: "claude-opus-5-5", effort: "medium" }, roles: deskRoles.map((role) => ({ role, kind: "house" })) }) }));
    ok("Beast for the desk", await own({ type: "setPolicy", change: "mode", value: "open" }));
    await svc.desk!.cycle("the stand-in");
    svc.setMode("guard");
    await svc.desk!.cycle("the stand-in");
  }

  // ---- steering: intents, a report, asks, the watchlist ----
  ok("an intent for Claude Code", await own({ type: "setIntent", id: "", agent: agent.address, venue: "ex", symbol: "SOL/USDT", side: "buy", usd: "300", text: "Build a SOL position under $140, a little at a time", validUntil: now + 3 * DAY }));
  ok("an intent for every agent", await own({ type: "setIntent", id: "", agent: "*", venue: "", symbol: "BTC/USDT", side: "", usd: "", text: "Tell me if BTC moves more than 5% in a day", validUntil: now + 7 * DAY }));
  const intents = engine.state.intents.map((i) => i.id);
  const forAgent = engine.state.intents.find((i) => i.agent === agent.address)!.id;
  ok("Claude Code's report", await ag({ type: "agentReport", intent: forAgent, status: "taking", note: `Placed a $100 limit 1% under the market (${orders.agentSol}); I will add on dips under $140.`, refs: orders.agentSol }));
  ok("Claude Code's ask for a bigger budget", await ag({ type: "agentAsk", kind: "limit", venue: "ex", usd: "1000", text: "Raise my trading budget to $1,000 so I can finish the SOL position you asked for" }));
  ok("Claude Code's ask for a venue", await ag({ type: "agentAsk", kind: "venue", venue: "standin-pubex", usd: "", text: "Connect Stand-in Public Exchange: DOGE trades only there" }));
  for (const [venue, symbol] of [["ex", "BTC/USDT"], ["predict", "SI-FEDCUT-DEC:YES"], ["standin-pubex", "DOGE/USD"]] as const) ok(`${symbol} watched`, await own({ type: "setWatch", venue, symbol, on: "true" }));
  // price alerts (account/state.ts Alert): one far above BTC and one far under SOL at the exchange, one on the Fed contract, one at the
  // public exchange that is not connected — standing, so the bell, the Alerts list and the sheet can be clicked through; none fires on its own
  for (const [venue, symbol, condition, price] of [["ex", "BTC/USDT", "above", "90000"], ["ex", "SOL/USDT", "below", "80"], ["predict", "SI-FEDCUT-DEC:YES", "above", "0.8"], ["standin-pubex", "DOGE/USD", "below", "0.05"]] as const) ok(`${symbol} alert`, await own({ type: "setAlert", id: "", venue, symbol, condition, price, on: "true" }));
  // memory (account/memory.ts; the canvas's F13): what Claude Code remembers about the owner — two things the owner said, and two it
  // learned, signed with its key and saying how
  ok("the owner's style", await own({ type: "setMemory", scope: agent.address, id: "", topic: "style", text: "Value over hype: no chasing what is hot this week." }));
  ok("the owner's rule", await own({ type: "setMemory", scope: agent.address, id: "", topic: "rules", text: "Never leverage above 3x without asking me first." }));
  ok("what Claude Code learned of the owner", await ag({ type: "agentRemember", id: "", topic: "style", text: "Builds a position a little at a time, with limit orders on dips.", how: "from your intents" }));
  ok("what Claude Code worked out about the venues", await ag({ type: "agentRemember", id: "", topic: "venues", text: "SOL is cheaper at Stand-in Exchange than at the wallet's DEX.", how: "by comparing the venues" }));

  // ---- the net worth curve: points over the last seven days, off the same curves the candles come from ----
  const curvePoints = await drawThePast(svc, world, home, walletVenue, walletAt);

  const server: PortfolioServerHandle = await startPortfolioServer({ port: o.port, service: svc, snapshotMs: o.snapshotMs ?? 60_000 });

  // ---- the browser pairs with the code: the seed key makes it an owner beside it ----
  const pairDevice = engine.pairDevice.bind(engine);
  let misses = 0;
  let handed = false;
  const plain = (x: string) => x.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  engine.pairDevice = (jwk: unknown, label = "this browser", given?: string) => {
    if (handed || !isJwk(jwk) || isOwner(engine.state, `device:${kidOf(jwk)}`)) return pairDevice(jwk, label, given);
    const kid = kidOf(jwk);
    if (given === undefined || given === "") return { ok: true, kid, role: "needs-code" };
    if (misses >= 5) return no("E_ACCOUNT_OWNER_SURFACE", { message: "too many wrong pairing codes: restart the stand-in for a new one" });
    if (plain(given) !== plain(code)) {
      misses++;
      return no("E_ACCOUNT_OWNER_SURFACE", { message: `that is not the pairing code the stand-in printed in its terminal (${5 - misses} tries left)` });
    }
    const asking = pairDevice(jwk, label, given);
    if (isRefusal(asking)) return asking;
    // one owner action, through the door: the account's signers become this browser and the seed key, one signature enough. It is in the
    // door's line before anything this browser can sign
    const action: OwnerAction = { type: "convertToMultiSigUser", signers: JSON.stringify({ authorizedUsers: [`device:${kid}`, `device:${seed.kid}`].sort(), threshold: 1 }), nonce: engine.nextNonce() };
    handed = true;
    void svc.exchange({ action, nonce: action.nonce, signature: signDevice(seed, action) }).then((out) => {
      if (isRefusal(out)) console.error(`the stand-in could not make the browser an owner: ${out.code} · ${out.message}`);
    });
    return { ok: true, kid, role: "owner" };
  };

  // ---- while it runs ----
  let reported = false;
  const agentLooks = async () => {
    // how the orders stand at the venues, as a page read asks
    await engine.settle();
    const mine = engine.orders.find((x) => x.id === orders.agentSol);
    if (!reported && mine?.status === "filled") {
      reported = true;
      await ag({ type: "agentReport", intent: forAgent, status: "note", note: `My SOL limit filled: ${mine.filledQty} SOL at $${mine.avgPrice ?? mine.limitPrice}. I will wait for the next dip under $140.`, refs: mine.id });
    }
    // a card that expired unanswered: the seed key closes it (what it held is freed), and the agent asks again — in Guard only
    const c = engine.host.card(card);
    if (c?.status === "pending" && c.expiresAt && Date.now() >= Date.parse(c.expiresAt)) {
      await own({ type: "approveCard", card: c.id, action: cardHash(c), decision: "reject" });
      if (svc.policy().mode === "guard") {
        const again = await ag({ type: "agentLiveOrder", venue: "ex", symbol: "ETH/USDT", side: "buy", orderType: "market", qty: "", usd: "120", limitPrice: "" });
        if (!isRefusal(again) && again.kind === "card") card = again.card.id;
      }
    }
  };
  const step = async () => {
    tick(world);
    hub?.pulse();
    await agentLooks();
    await svc.desk?.tick();
  };
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const every = (ms: number, fn: () => unknown) => {
    if (!(ms > 0)) return;
    let busy = false;
    const t = setInterval(() => {
      if (busy) return;
      busy = true;
      Promise.resolve()
        .then(fn)
        .catch((err: unknown) => console.error(`stand-in: ${String((err as Error)?.message ?? err).slice(0, 200)}`))
        .finally(() => void (busy = false));
    }, ms);
    t.unref();
    timers.push(t);
  };
  every(o.tickMs ?? 3_000, () => {
    tick(world);
    hub?.pulse();
  });
  every(o.agentMs ?? 15_000, async () => {
    await agentLooks();
    await svc.desk?.tick();
  });
  // the superagent's own clock, as the real server runs it (service.ts watchDesk): every ten seconds, and its first cycle a few seconds
  // after the start rather than at the agent's next look. Not where prices only move when asked (tests: tickMs 0)
  const stopDesk = o.superagent && o.desk !== false && (o.tickMs ?? 3_000) > 0 ? svc.watchDesk() : undefined;
  // the price alerts' clock, as the real server runs it (service.ts watchAlerts): every half minute each standing alert's market is
  // priced and an alert whose figure the price reached fires — a toast on the page, the Fired list under Watching. Not where prices only
  // move when asked (tests: tickMs 0)
  const stopAlerts = (o.tickMs ?? 3_000) > 0 ? svc.watchAlerts() : undefined;

  const seeded: Seeded = { venues: ["ex", "predict", "wallet", "broker", ...(o.paper !== false ? ["paper", "paper-momentum"] : []), walletVenue], agent: { name: AGENT_NAME, address: agent.address, wallet: walletVenue }, orders, card, intents, asks: 2, watch: 3, alerts: 4, curvePoints };
  return {
    url: server.url,
    code,
    home,
    svc,
    world,
    seeded,
    seed,
    agent,
    step,
    close: async () => {
      stopDesk?.();
      stopAlerts?.();
      for (const t of timers) clearInterval(t);
      hub?.close();
      await server.close();
      // a home made for a test goes with it; the one the command line made is kept (its ledger, and the agent wallet's key)
      if (madeHome && !isMain && process.env.UI_STANDIN_KEEP !== "1") rmSync(home, { recursive: true, force: true });
    },
  };
}

/** Points on the net worth curve for the last seven days (every four hours, then every half hour over the last day): each venue's holdings
 * as they are now — read from the stand-in's books, since the account's own read of a venue is up to thirty seconds old — priced on the
 * stand-in's curves at that moment. Money the total counts and no venue holds (a withdrawal on its way) is carried as it is now. Written
 * before the server takes its first point, so the curve runs on into it */
async function drawThePast(svc: PortfolioService, world: World, home: string, walletVenue: string, walletAt: string): Promise<number> {
  const page = await svc.accountView();
  if (!page) return 0;
  const chain = [...world.chain].filter(([k]) => k.startsWith(`${walletAt}|`)).map(([k, amount]): LiveBalance => {
    const asset = k.split("|")[2]!;
    return { asset, amount, ...(isStable(asset) ? { class: "stable" as const } : {}) };
  });
  // what is in earn is the exchange's too (the account page counts it there), priced on the same curves
  const earned: LiveBalance[] = [...world.earn.held].filter(([, amount]) => amount > 0).map(([product, amount]) => {
    const asset = world.earn.specs.find((x) => x.id === product)!.asset;
    return { asset, amount, ...(isStable(asset) ? { class: "stable" as const } : {}) };
  });
  const held: Array<[string, LiveBalance[]]> = [["ex", [...world.ex.read(), ...earned]], ["predict", world.predict.read()], ["wallet", world.wallet.read()], ["broker", world.broker.read()], [walletVenue, chain]];
  const log = new NetWorthLog(networthPath(home), world.clock);
  const now = world.clock();
  const keyOf = (asset: string): { key: string; flip: boolean } | undefined => {
    const a = asset.toUpperCase();
    if (a.includes(":")) {
      const id = asset.slice(0, asset.lastIndexOf(":"));
      return world.prices.has(`ev:${id}`) ? { key: `ev:${id}`, flip: /:(NO|DOWN)$/i.test(asset) } : undefined;
    }
    const k = a === "WETH" ? "ETH" : a === "CBBTC" || a === "WBTC" ? "BTC" : a;
    return world.prices.has(k) ? { key: k, flip: false } : undefined;
  };
  const other = page.inFlightUsd + page.heldUsd;
  const times: number[] = [];
  for (let t = now - 7 * DAY; t < now - DAY; t += 4 * HOUR) times.push(t);
  for (let t = now - DAY; t < now - 10 * 60_000; t += HOUR / 2) times.push(t);
  let written = 0;
  for (const t of times) {
    const byVenue: Record<string, number> = {};
    const byClass: Record<string, number> = {};
    for (const [venue, rows] of held) {
      let sum = 0;
      for (const b of rows) {
        const cls = b.class ?? (isStable(b.asset) ? "stable" : "crypto");
        const k = cls === "stable" || cls === "cash" ? undefined : keyOf(b.asset);
        const p = k ? world.prices.at(k.key, t) : undefined;
        const usd = cls === "stable" || cls === "cash" ? b.amount : p === undefined ? (b.usd ?? 0) : b.amount * (k!.flip ? 1 - p : p);
        sum += usd;
        byClass[cls] = (byClass[cls] ?? 0) + usd;
      }
      byVenue[venue] = sum;
    }
    const usd = Object.values(byVenue).reduce((s, x) => s + x, 0) + other;
    const r = log.append({ at: t, usd, byClass, byVenue, stale: [], paidOutUsd: 0 });
    if (!isRefusal(r) && r.written) written++;
  }
  return written;
}

/** the superagent's brain in the stand-in: the momentum script (account/brain-script.ts), which a replay of a recorded day thinks with
 * too — it picks from the very table Search is shown (the paper account's rows), in turn; Risk clears most at $60 with a quick 0.4%
 * take-profit and stop, and rejects every third with its reason; Exit holds; the Head writes two fixed sentences. A script, so nothing
 * here is any model's judgement: it only makes the desk's real steps happen on the stand-in */
const superagentBrain = (): Brain => momentumScriptBrain();

/** The stand-in's brain answering as the Anthropic API does to a key it refuses (`--brain-refuses`): every call throws E_BRAIN_KEY_REJECTED
 * with the fix brain-claude.ts gives for a key from the file (the file opened again, no restart), so the page shows the rejected-key
 * standing with real paths. A stand-in key is written to <home>/credentials/anthropic/api-key.json, the user's alone, at the start: while
 * the file holds exactly that, the calls are refused; once it holds anything else — the owner "replaced the key" — the script answers
 * again, and the desk clears the fault on that answer. Its standing (ready) stays the script's: a refused key's shape looks fine, which is
 * the point — only a call finds it out */
function refusingIf(on: boolean, brain: Brain, home: string): Brain {
  if (!on) return brain;
  const file = join(home, ANTHROPIC_KEY_REF);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, '{"apiKey": "sk-ant-standin-key-the-api-refuses-0000"}\n', { mode: 0o600 });
  const refused = readFileSync(file, "utf8");
  // the file Claude's brain reads now: the new one once it is there (a key saved on the page), else the older one
  const inUse = (): string => (present(home, CLAUDE_KEY_REF) ? join(home, CLAUDE_KEY_REF) : file);
  const now = (): string => {
    try {
      return readFileSync(inUse(), "utf8");
    } catch {
      return "";
    }
  };
  return {
    ...brain,
    async decide<T>(r: BrainRequest<T>): Promise<BrainAnswer<T>> {
      if (now() === refused) throw keyRejected("the API did not accept the key", "Anthropic", rejectedFix(inUse(), undefined, "Anthropic"));
      return brain.decide(r);
    },
  };
}

/** what a real brain's call meets in the stand-in: no network. The OpenAI-format brains' fetch fails as an unreachable endpoint does;
 * Claude's client fails as an unreachable API does — for a call and for "Test the key" alike */
const noNetworkFetch = (async () => {
  throw new TypeError("the stand-in reaches no network");
}) as unknown as typeof fetch;
const noNetworkClaude = (): ClaudeClient => {
  const down = async (): Promise<never> => {
    throw new Anthropic.APIConnectionError({ message: "the stand-in reaches no network" });
  };
  return { messages: { parse: down as never }, models: { list: down as never } };
};

/** A stand-in key: one that holds "standin", which no provider ever issued — the only kind the providers answer with `--providers` */
const standinKey = (key: unknown): boolean => String(key ?? "").includes("standin");

/** What the model providers answer in the stand-in with `--providers`: their list of models — GET <base>/models at each preset's own
 * address, and OpenRouter's GET /key (its list is public, so the key is asked about there) — for a stand-in key, with the very ids the
 * preset knows (and an embedding model, which "Connect a key" must pass over), as each lists them (Gemini's "models/<id>"); any other key
 * refused with a 401, in the words OpenAI's API uses for one; and nothing else: a desk's call to a model meets no network, as without it */
const providersFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const preset = BRAIN_PRESETS.find((p) => p.format === "openai" && p.defaultBase && `${url.origin}${url.pathname}`.startsWith(`${p.defaultBase.replace(/\/+$/, "")}/`)) as (OpenAIPreset & { format: "openai" }) | undefined;
  const asked = url.pathname.replace(/\/+$/, "").split("/").pop();
  if (!preset || String(init?.method ?? "GET").toUpperCase() !== "GET" || (asked !== "models" && asked !== "key" && asked !== "api-key")) throw new TypeError("the stand-in reaches no network");
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const taken = standinKey(new Headers(init?.headers).get("authorization"));
  // the key's own endpoints, where the presets ask them first: OpenRouter's GET /key, xAI's GET /api-key (whose bad key is a 400, as xAI's is)
  if (asked === "key") return taken ? json(200, { data: { label: "stand-in", usage: 0, limit: null, is_free_tier: false, is_management_key: false } }) : json(401, { error: { message: "User not found.", code: 401 } });
  if (asked === "api-key") return taken ? json(200, { name: "stand-in", acls: ["api-key:endpoint:*", "api-key:model:*"], api_key_blocked: false, api_key_disabled: false, team_blocked: false }) : json(400, { code: "invalid-argument", error: "Incorrect API key provided." });
  if (!taken && preset.id !== "openrouter") return json(401, { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } });
  const ids = [...new Set([...(preset.best ?? []), ...preset.suggestedModels.models, "text-embedding-3-small"])];
  return json(200, { object: "list", data: ids.map((id) => ({ id: preset.id === "gemini" ? `models/${id}` : id, object: "model" })) });
}) as unknown as typeof fetch;

/** Claude's client in the stand-in with `--providers`: its list of models — Claude's own, and one more — for a stand-in key, a 401 in the
 * API's words for any other; a question to a model meets no network */
const providersClaude = (c: ClaudeClientOptions): ClaudeClient => {
  const down = async (): Promise<never> => {
    throw new Anthropic.APIConnectionError({ message: "the stand-in reaches no network" });
  };
  const list = async () => {
    if (!standinKey(c.apiKey)) throw Anthropic.APIError.generate(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, undefined, new Headers());
    return { data: [...BRAIN_MODELS.map((m) => ({ id: m.id })), { id: "claude-standin-legacy" }], has_more: false };
  };
  return { messages: { parse: down as never }, models: { list: list as never } };
};

/** every preset's real brain, as the account makes them (brains.ts), reading no variable from the shell and reaching no network — but, with
 * `providers`, the providers answering their list of models for a stand-in key (providersFetch, providersClaude) */
function realBrains(home: string, providers = false): Brain[] {
  return brainProviders(home, { env: {}, fetch: providers ? providersFetch : noNetworkFetch, newClaudeClient: providers ? providersClaude : noNetworkClaude });
}

/** The desk's brains in the stand-in: every preset's real brain, with Claude's place held by the stand-in's script — its id "claude"
 * (so the desk is hired with it as with the default brain, and the Brains place can switch away and back), Claude's listed models, what
 * Claude's real brain says of its place (its base URL, its key file and the key's tail), and a label that says it is a script */
function standinBrains(home: string, script: Brain, providers = false): Brain[] {
  const real = realBrains(home, providers);
  const claude = real.find((b) => b.id === "claude")!;
  const asClaude: Brain = { ...script, id: "claude", label: "A script (stand-in, as Claude)", models: BRAIN_MODELS, ...(claude.about ? { about: () => claude.about!() } : {}), ...(claude.probe ? { probe: (key: string) => claude.probe!(key) } : {}) };
  return real.map((b) => (b.id === "claude" ? asClaude : b));
}

/** the desk's brain in the stand-in: a script. Search names ETH, SOL and BTC at the exchange in turn; Risk clears at $60 with a 1.2%
 * take-profit, a 0.8% stop and twelve hours; Exit holds; the Head writes two fixed sentences */
function standinBrain() {
  let n = 0;
  const picks = ["ETH/USDT", "SOL/USDT", "BTC/USDT"];
  return scriptedBrain(({ role }) => {
    if (role === "search") {
      const symbol = picks[n++ % picks.length]!;
      return { leads: [{ symbol, side: "buy", thesis: `${symbol.split("/")[0]} leads the majors on volume today`, confidence: 0.66 }], note: "" };
    }
    if (role === "risk") return { verdict: "clear", why: "a tight spread, the day's loss room untouched", sizeUsd: 60, tpPct: 1.2, slPct: 0.8, maxHours: 12 };
    if (role === "exit") return { decisions: [] };
    if (role === "head") return { worked: "The clearance named its numbers before the order went.", change: "Scan the perpetuals too." };
    return null;
  }, "claude-opus-5-5");
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = process.argv.slice(2);
  const at = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const port = Number(at("--port") ?? 4821);
  if (!Number.isInteger(port) || port < 0) throw new Error("--port is a port number");
  if (port === REAL_PORT) {
    console.error(`port ${REAL_PORT} is the real account's: the stand-in never starts there. Use --port 4821`);
    process.exit(1);
  }
  const capUsd = Number(at("--cap") ?? 250);
  const tickMs = Number(at("--tick") ?? 3_000);
  if (!(capUsd > 0) || !(tickMs > 0)) throw new Error("--cap is dollars and --tick milliseconds, both more than zero");
  if (args.includes("--cards") && !args.includes("--superagent")) throw new Error("--cards goes with --superagent: it hires the superagent with its autonomy off");
  if (args.includes("--no-paper") && args.includes("--superagent")) throw new Error("--no-paper does not go with --superagent: the superagent trades a paper account");
  const s = await startStandin({ port, capUsd, tickMs, desk: !args.includes("--no-desk"), superagent: args.includes("--superagent"), cards: args.includes("--cards"), brainRefuses: args.includes("--brain-refuses"), paper: !args.includes("--no-paper"), providers: args.includes("--providers") }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error(`port ${port} is already in use: is a stand-in running already? Open http://127.0.0.1:${port}, or pick another with --port`);
      process.exit(1);
    }
    throw e;
  });
  const v = s.seeded;
  console.log(
    [
      "STAND-IN ACCOUNT · no network, no real money: every venue, price and fill on this page is made up (test/standin)",
      `  page          ${s.url}`,
      `  pairing code  ${s.code}  — type it on the page: your browser becomes an owner beside the stand-in's seed key`,
      `  home          ${s.home}  (fresh, kept after you stop; its ledger is ${s.svc.ledgerPath()})`,
      `  trading       on, at most $${capUsd} an order or a movement`,
      `  agent wallet  ${v.agent.wallet} holds a real key made in this home, so its address is a real one: send it nothing real`,
      `  seeded        venues ${v.venues.join(", ")} · ${Object.keys(v.orders).length} orders · ${v.agent.name} with trade, venues and payees limits and an agent wallet · 1 card waiting (${v.card}) · ${v.intents.length} intents · a report · ${v.asks} asks · ${v.watch} watched markets · ${v.alerts} price alerts · ${v.curvePoints} net worth points over 7 days`,
      ...(args.includes("--superagent") ? [`  superagent    the desk at paper-momentum (paper money), ${args.includes("--cards") ? "its autonomy off: in Guard each lead it clears waits for you on a card" : "trading on its own on paper"} · ${s.url}/#/trade?mode=superagent`] : []),
      args.includes("--no-desk") ? "  brains        every preset's real brain, none with a key in this fresh home; they reach no network here" : "  brain         a script under Claude's id (no model thinks here), beside every other preset's real brain (no key, no network)",
      ...(args.includes("--brain-refuses") ? [`  brain         refuses its key, as the API does, until ${join(s.home, ANTHROPIC_KEY_REF)} holds something else (or a key is saved for Claude on the page)`] : []),
      ...(args.includes("--providers") ? ['  providers     answer their list of models for a stand-in key — one that holds "standin", like sk-proj-standin0000000000000000 — and refuse any other with a 401; their models answer nothing'] : []),
      `  prices move every ${tickMs / 1000} s · Ctrl-C to stop`,
    ].join("\n"),
  );
  const stop = () => s.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
