import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome, Prepared } from "../../src/portfolio/account/exchange.ts";
import { signOwner, simKey, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import type { HistorySources } from "../../src/portfolio/backtest/data.ts";
import { deskSpec, labRun, readTrials, setHoldout, type DeskSpec } from "../../src/portfolio/backtest/lab.ts";
import { DEFAULT_COSTS } from "../../src/portfolio/backtest/source.ts";
import type { LiveDeps } from "../../src/portfolio/live/index.ts";
import type { PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { Candle } from "../../src/portfolio/live/trade.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

/** BACKTESTS AT THE SERVICE (service.ts backtestRun · backtests · backtestKept, the owner's setBacktest through the door; server.ts POST
 * /api/account/backtest, GET /api/account/backtests and /api/account/backtest): an unsigned request runs a training run — counted with the
 * seat it names, kept, never on the held-out data — one at a time; the owner's signature alone looks at the held-out data or moves the
 * holdout, said in words before it is signed, good for ten minutes and once. History from stand-ins: no network. */
type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const H = 3_600_000;
const D = 86_400_000;
const START = Date.parse("2026-10-29T12:34:00Z");
const owner = simKey("owner");
const stranger = simKey("agent:claude-code");

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

function standIn(id: string, symbol: string): PublicSource {
  const first = Date.parse("2025-01-01T00:00:00Z");
  const px = (t: number): number => 20_000 * (1 + 0.08 * Math.sin(t / (53 * H)) + 0.04 * Math.sin(t / (13 * H)) + (t - first) / (3 * 365 * D));
  return {
    id,
    name: `Stand-in ${id}`,
    kind: "exchange",
    connectTo: id,
    connector: `live:${id}`,
    listings: async () => [{ symbol, name: `${symbol} (stand-in)`, kind: symbol.endsWith("-PERP") ? "perp" : "spot", base: "BTC", quote: "USD", open: true, types: [], maxLeverage: 20, fundingEveryH: 1 }],
    candles: async (_s, interval, w) => {
      const step = interval === "4h" ? 4 * H : interval === "1d" ? D : H;
      const bars: Candle[] = [];
      for (let t = Math.max(Math.ceil(w.since! / step) * step, first); t < w.until! && t + step <= START; t += step) bars.push({ t, o: px(t), h: Math.max(px(t), px(t + step)) * 1.002, l: Math.min(px(t), px(t + step)) * 0.998, c: px(t + step), v: 1000 });
      return { bars, more: false, source: `Stand-in ${id} · ${symbol}` };
    },
    fundingHistory: async (_s, from, to) => {
      const out: Array<{ at: number; rate: number }> = [];
      for (let t = Math.ceil(Math.max(from, first) / H) * H; t <= to; t += H) out.push({ at: t, rate: 0.00001 });
      return out;
    },
  };
}

async function boot(sources: HistorySources = { perp: standIn("hl", "BTC-PERP"), spot: standIn("cb", "BTC/USD"), stock: standIn("us", "AAPL") }) {
  const home = mkdtempSync(join(tmpdir(), "backtest-service-"));
  homes.push(home);
  let n = 0;
  const liveDeps: Partial<LiveDeps> = { clock: () => START, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: [], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] }, backtest: { sources } });
  const own = async (a: NoNonce<OwnerAction>, at = START + ++n): Promise<Outcome> => svc.exchange(await signOwner(owner, { ...a, nonce: at } as OwnerAction));
  return { svc, home, own };
}
const SMA = { strategy: "sma", params: { fast: 10, slow: 40 }, markets: "perp:BTC", interval: "4h", benchmark: false };
const ok = <T>(r: T | Refusal): T => {
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
};

describe("a backtest an unsigned request asks for", () => {
  it("is a training run — before the holdout, its window there when it names no end — counted with the seat it names, kept; the answer its figures and how it is judged, the trades and curve in the kept run", async () => {
    const { svc, home } = await boot();
    const r = ok(await svc.backtestRun({ ...SMA, seat: "0xSeat" })) as { id: string; window: string; holdout: string; from: string; to: string; metrics: { steps: number }; deflated: { trials: number }; trial: number; ledger: unknown; kept: boolean; fills: number };
    expect(r).toMatchObject({ window: "train", holdout: "2026-07-31", to: "2026-07-31T00:00:00.000Z", trial: 2, ledger: { rows: 2, intact: true }, kept: true, deflated: { trials: 1 } });
    expect(r.metrics.steps).toBeGreaterThan(900);
    expect(typeof r.fills).toBe("number");
    expect(readTrials(home).rows[1]).toMatchObject({ kind: "trial", by: "request", seat: "0xSeat", strategy: "sma", run: r.id });
    const list = ok(svc.backtests());
    expect(list.ledger).toEqual({ rows: 2, intact: true, trials: 1, distinct: 1, looks: 0 });
    expect(list.runs.map((x) => x.run)).toEqual([r.id]);
    const kept = ok(svc.backtestKept(r.id)) as { run: { fills: unknown[]; equity: unknown[] }; by: string; seat: string };
    expect(kept).toMatchObject({ by: "request", seat: "0xSeat" });
    expect(kept.run.equity.length).toBe(r.metrics.steps + 1);
    // past the holdout's start: only the owner's signature runs there
    const past = (await svc.backtestRun({ ...SMA, to: "2026-09-01" })) as Refusal;
    expect(past).toMatchObject({ code: "E_ACCOUNT_OWNER_ONLY" });
    expect(past.message).toMatch(/^the data from 2026-07-31 on is held out: a strategy is tried before it/);
  });

  it("is read strictly: a field it does not know, a number out of its bounds, a strategy's number it does not take — each refused in words", async () => {
    const { svc } = await boot();
    const no = async (body: Record<string, unknown>) => ((await svc.backtestRun(body)) as Refusal).message;
    expect(await no({ ...SMA, code: "import os" })).toBe('a backtest is asked with strategy, params, markets, interval, from, to, cash, feeBps, leverage, halfSpreadBps, participation, levelBps, benchmark, seat — not "code"');
    expect(await no({ strategy: "magic" })).toBe('a strategy is one of hold, sma, tsmom, carry, not "magic"');
    expect(await no({ strategy: "sma", params: { fast: 1e9 } })).toMatch(/^sma's fast is /);
    expect(await no({ strategy: "hold", params: { weight: 2 } })).toBe('hold takes no parameter, not "weight"');
    expect(await no({ markets: "future:BTC" })).toBe('a market is perp:COIN, spot:COIN or stock:TICKER, not "future:BTC"');
    expect(await no({ interval: "1m" })).toBe("interval is 1h, 4h, 1d");
    expect(await no({ from: "2026-02-30" })).toBe("from is a day, YYYY-MM-DD");
    expect(await no({ from: "2026-05-01", to: "2026-04-01" })).toBe("to is after from");
    expect(await no({ cash: 1e12 })).toBe("cash is 100 to 100000000");
    expect(await no({ participation: 0 })).toBe("participation is more than 0 to 1");
    expect(await no({ seat: "a b" })).toBe("seat names who asks: up to 80 letters, digits and . : @ _ -");
    expect(await no({ benchmark: "yes" })).toBe("benchmark is true or false");
  });

  it("runs one at a time: a second asked while one runs is answered busy — and the first is not disturbed", async () => {
    const { svc } = await boot();
    const first = svc.backtestRun(SMA);
    const second = (await svc.backtestRun(SMA)) as Refusal;
    expect(second).toMatchObject({ code: "E_ACCOUNT_LIMIT", message: "a backtest is running: the account runs one at a time — ask again when it is done", detail: { busy: true } });
    expect(isRefusal(await first)).toBe(false);
    expect(isRefusal(await svc.backtestRun(SMA))).toBe(false);
  });

  it("over the routes: 200 with the run, 409 refused, 400 a body that is no object or a limit that is no count, the list and a run by its id", async () => {
    const { svc } = await boot();
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
        const r = await fetch(`${srv.url}${path}`, { method, headers: { "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        return { status: r.status, body: (await r.json()) as Record<string, unknown> };
      };
      const run = await call("POST", "/api/account/backtest", SMA);
      expect(run.status).toBe(200);
      expect(run.body).toMatchObject({ ok: true, window: "train" });
      expect((await call("POST", "/api/account/backtest", { ...SMA, to: "2026-10-01" })).status).toBe(409);
      expect(await call("POST", "/api/account/backtest", [1, 2])).toEqual({ status: 400, body: { ok: false, error: "need {strategy, params, markets, interval, from, to, cash, feeBps, leverage, …}" } });
      const list = await call("GET", "/api/account/backtests?limit=5");
      expect(list.body).toMatchObject({ ok: true, holdout: { start: "2026-07-31" }, ledger: { trials: 1 } });
      expect((await call("GET", "/api/account/backtests?limit=0")).status).toBe(400);
      const one = await call("GET", `/api/account/backtest?id=${String(run.body.id)}`);
      expect(one.body).toMatchObject({ ok: true, id: run.body.id, trial: { run: run.body.id } });
      // its round trips debriefed by the account, counted as the run kept them
      const trips = (one.body.run as { trips: unknown[] }).trips;
      expect(one.body.debrief).toMatchObject({ trades: trips.length, inversion: { verdict: expect.any(String) } });
      // the journal's debrief over the route: the choices held to their words
      expect(await call("GET", "/api/account/debrief")).toMatchObject({ status: 200, body: { ok: true, debrief: { trades: 0 }, venues: [], latest: [] } });
      expect(await call("GET", "/api/account/debrief?who=someone")).toEqual({ status: 400, body: { ok: false, error: "who is you, desk or agents (or nothing: everyone)" } });
      expect((await call("GET", "/api/account/debrief?days=8")).status).toBe(400);
      expect((await call("GET", "/api/account/journal?limit=0")).status).toBe(400);
      expect(await call("GET", "/api/account/journal")).toMatchObject({ status: 200, body: { ok: true, trades: [], total: 0, intact: true } });
      expect((await call("GET", "/api/account/backtest?id=..%2F..%2Fsecrets")).body).toMatchObject({ ok: false, refusal: { message: "a run's id is like 20261029T120000-0123456789" } });
    } finally {
      await srv.close();
    }
  });
});

describe("a walk-forward an unsigned request asks for", () => {
  it("walks the training data — every try a row with the seat named, the out-of-sample runs kept — one backtest at a time across the account, refused past the holdout or for the desk; the catalog says its limits", async () => {
    const { svc, home } = await boot();
    const body = { strategy: "sma", grid: { fast: [5, 10] }, params: { slow: 30 }, folds: 2, markets: "perp:BTC", interval: "4h", from: "2026-05-01", seat: "0xWalker" };
    const w = ok(await svc.backtestWalk(body)) as { folds: Array<{ out: { id: string } }>; trials: { added: number; inSample: number; outSample: number }; curve: unknown[]; markets: string[] };
    expect(w.trials).toEqual({ added: 2 * 2 + 2, inSample: 4, outSample: 2 });
    expect(w.markets).toEqual(["perp:BTC"]);
    expect(w.curve.length).toBeGreaterThan(10);
    const rows = readTrials(home).rows.filter((r) => r.kind === "trial") as Array<{ by: string; seat?: string; run: string; kept: boolean }>;
    expect(rows.every((r) => r.by === "request" && r.seat === "0xWalker")).toBe(true);
    expect(rows.filter((r) => r.kept).map((r) => r.run)).toEqual(w.folds.map((f) => f.out.id));
    expect(isRefusal(svc.backtestKept(w.folds[0]!.out.id))).toBe(false);
    expect(((await svc.backtestWalk({ ...body, to: "2026-09-01" })) as Refusal).code).toBe("E_ACCOUNT_OWNER_ONLY");
    expect(((await svc.backtestWalk({ strategy: "desk" })) as Refusal).message).toMatch(/^the desk does not walk/);
    // one at a time, whichever is asked first
    const running = svc.backtestRun(SMA);
    expect(((await svc.backtestWalk(body)) as Refusal).detail).toEqual({ busy: true });
    await running;
    expect((ok(svc.backtests()).catalog as { walk?: unknown }).walk).toEqual({ folds: [2, 10], combosMost: 50, runsMost: 300, mostWork: 400_000 });
  });

  it("over the route: 200 with the walk, 400 a body that is no object, 409 a walk past its work", async () => {
    const { svc } = await boot();
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const post = async (body: unknown) => {
        const r = await fetch(`${srv.url}/api/account/backtest/walk`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: r.status, body: (await r.json()) as Record<string, unknown> };
      };
      const one = await post({ strategy: "sma", grid: { fast: [5, 10] }, params: { slow: 30 }, folds: 2, markets: "perp:BTC", interval: "4h", from: "2026-06-01" });
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ ok: true, combos: 2, rolling: false });
      expect(await post([1])).toEqual({ status: 400, body: { ok: false, error: "need {strategy, grid, folds, rolling, params, markets, interval, from, to, …}" } });
      // 24 combinations over 10 folds is 250 runs, within the most; a year of hourly bars on two markets is far past the work
      const big = await post({ strategy: "sma", grid: { fast: [5, 6, 7, 8, 9, 10], slow: [30, 40, 50, 60] }, folds: 10, markets: "perp:BTC,perp:ETH", interval: "1h", from: "2025-08-01" });
      expect(big.status).toBe(409);
      expect(big.body).toMatchObject({ ok: false, refusal: { code: "E_ACCOUNT_LIMIT" } });
    } finally {
      await srv.close();
    }
  });
});

describe("the owner's signed setBacktest", () => {
  it("runs outside the door's line once it is taken: what the owner signs while a look runs is answered at once, the same look sent again is answered when it is done, and the holdout does not move under it", async () => {
    // a look whose bars wait until let go
    let hold: Promise<void> | undefined;
    let release = (): void => undefined;
    const held = (s: PublicSource): PublicSource => ({ ...s, candles: async (symbol, interval, w) => (await hold, s.candles!(symbol, interval, w)) });
    const { svc, home, own } = await boot({ perp: held(standIn("hl", "BTC-PERP")), spot: standIn("cb", "BTC/USD"), stock: standIn("us", "AAPL") });
    const train = ok(await svc.backtestRun(SMA)) as { id: string };
    hold = new Promise((r) => (release = r));
    const env = await signOwner(owner, { type: "setBacktest", change: "evaluate", value: train.id, nonce: START + 900 });
    let done = false;
    const look = svc.exchange(env).finally(() => (done = true));
    // an agent let in while the look waits on its bars: through the door, and on the account, before the look is done
    const waited = new Promise((r) => setTimeout(() => r("still waiting behind the look"), 2000));
    expect(await Promise.race([own({ type: "approveAgent", agentAddress: stranger.address, agentName: "Claude Code", validUntil: START + 30 * D }), waited])).toMatchObject({ ok: true, kind: "account" });
    expect(svc.account!.state.agents.some((k) => k.address === stranger.address)).toBe(true);
    expect(done).toBe(false);
    // the holdout is not moved while a backtest runs
    expect(await own({ type: "setBacktest", change: "holdout", value: "2026-09-01" })).toMatchObject({ code: "E_ACCOUNT_LIMIT", detail: { busy: true } });
    const again = svc.exchange(env);
    release();
    const first = await look;
    expect(first).toMatchObject({ ok: true, kind: "result", result: { window: "holdout", looks: 1 } });
    expect(await again).toEqual(first);
    expect(readTrials(home).rows.filter((r) => r.kind === "trial" && r.window === "holdout")).toHaveLength(1);
    expect(ok(svc.backtests()).holdout).toMatchObject({ start: "2026-07-31" });
  });

  it("runs the desk over the training data — said in words first, its steps counted and capped before it is signed — a training run like any other, by the owner, read back unsigned; a request is told where the desk runs, and a key that is not the owner's signs none", async () => {
    const { svc, home, own } = await boot();
    const ask = { markets: "perp:BTC", interval: "4h", from: "2026-07-20", cash: 25_000, params: { tpPct: 3 } };
    const prepared = (await svc.account!.prepare({ type: "setBacktest", change: "desk", value: JSON.stringify(ask) })) as Prepared;
    expect(prepared.quote?.words).toBe("Run the desk (sizeUsd 1000 · tpPct 3 · slPct 1 · maxHours 24 · riskPct 10 · maxOpen 3 · dayLossPct 5) on perp:BTC in 4h bars from 2026-07-20 to 2026-07-31, with $25,000 on paper beside buying and holding them: about 66 steps, a second or two. A training run, counted in the trials like any other.");
    const ran = (await own({ type: "setBacktest", change: "desk", value: JSON.stringify(ask) })) as { ok: true; kind: "result"; result: { id: string } };
    expect(ran).toMatchObject({ ok: true, kind: "result", result: { window: "train", strategy: { id: "desk" }, from: "2026-07-20T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z", feeBps: 10, cashUsd: 25_000, benchmark: { strategy: "hold" }, kept: true } });
    expect(readTrials(home).rows.at(-1)).toMatchObject({ kind: "trial", by: "owner", window: "train", strategy: "desk", params: { tpPct: 3 }, feeBps: 10, cashUsd: 25_000 });
    // a training run: read back unsigned, its trades and its curve in the kept run
    expect(ok(svc.backtestKept(ran.result.id))).toMatchObject({ by: "owner", window: "train" });
    // refused in words before it is signed: past the steps it may take from here, past the holdout's start, a market it does not trade
    const words = async (o: Record<string, unknown>) => svc.account!.prepare({ type: "setBacktest", change: "desk", value: JSON.stringify(o) });
    expect(await words({ from: "2025-06-01" })).toMatchObject({ code: "E_ACCOUNT_LIMIT", message: "the desk steps 4,500 times at most when it runs from here; this one would step about 10,200 — 4h bars or a shorter window (the terminal runs it longer)", detail: { steps: 10_200, most: 4_500 } });
    expect(await words({ to: "2026-09-01" })).toMatchObject({ code: "E_ACCOUNT_BAD_ACTION", message: expect.stringMatching(/^the data from 2026-07-31 on is held out: the desk is tried before it/) });
    expect(await words({ markets: "spot:BTC" })).toMatchObject({ code: "E_ACCOUNT_BAD_ACTION", message: "the desk trades perpetuals here: perp:COIN markets only" });
    // an unsigned request is told where the desk runs; a key the account does not know as its owner's signs none
    expect(((await svc.backtestRun({ strategy: "desk" })) as Refusal).message).toMatch(/^the desk runs by the owner's signature/);
    expect(await svc.exchange(await signOwner(stranger, { type: "setBacktest", change: "desk", value: "{}", nonce: START + 700 }))).toMatchObject({ code: "E_ACCOUNT_UNKNOWN_SIGNER" });
    // the catalog says what the desk takes, and how far it runs from here
    expect((ok(svc.backtests()).catalog as { desk?: unknown }).desk).toMatchObject({ name: "The desk", intervals: ["1h", "4h"], mostSteps: 4_500, by: "the owner's signature", params: { sizeUsd: { default: 1000 } } });
  });

  it("a look at a desk run plays the desk again inside the service — its own account built and let go — over the held-out data", async () => {
    const { svc, home, own } = await boot();
    // the desk runs at the owner's terminal: its training run is written there, into the same home
    expect(setHoldout(home, "2026-10-22", "terminal", START)).toMatchObject({ start: "2026-10-22" });
    const sources: HistorySources = { perp: standIn("hl", "BTC-PERP"), spot: standIn("cb", "BTC/USD"), stock: standIn("us", "AAPL") };
    const train = await labRun({ spec: deskSpec() as DeskSpec, refs: [{ cls: "perp", base: "BTC" }], interval: "4h", from: Date.parse("2026-10-15T00:00:00Z"), window: "train", cashUsd: 10_000, feeBps: 10, costs: DEFAULT_COSTS, benchmark: false, save: true, by: "terminal" }, { home, cache: join(home, "history"), sources, clock: () => START });
    if (isRefusal(train)) throw new Error(train.message);
    const look = (await own({ type: "setBacktest", change: "evaluate", value: train.id })) as { ok: true; kind: "result"; result: { window: string; strategy: { id: string }; from: string; looks: number } };
    expect(look).toMatchObject({ ok: true, kind: "result", result: { window: "holdout", strategy: { id: "desk" }, from: "2026-10-22T00:00:00.000Z", looks: 1 } });
  });

  it("looks at the held-out data with a training run tried again exactly — said in words before it is signed, counted as a look, by the owner", async () => {
    const { svc, home, own } = await boot();
    const train = ok(await svc.backtestRun(SMA)) as { id: string };
    const prepared = (await svc.account!.prepare({ type: "setBacktest", change: "evaluate", value: train.id })) as Prepared;
    expect(prepared.quote?.words).toBe("Run sma (fast 10 · slow 40 · weight 1) on perp:BTC in 4h bars over the held-out data, from 2026-07-31 to now — look 1 at it. A holdout looked at often is a holdout no more.");
    expect(prepared.shown).toEqual([{ name: "change", value: "evaluate" }, { name: "value", value: train.id }, { name: "nonce", value: String(prepared.action.nonce) }]);
    const look = (await own({ type: "setBacktest", change: "evaluate", value: train.id })) as { ok: true; kind: "result"; result: { window: string; looks: number; from: string; strategy: { id: string } } };
    expect(look).toMatchObject({ ok: true, kind: "result", result: { window: "holdout", looks: 1, from: "2026-07-31T00:00:00.000Z", strategy: { id: "sma" } } });
    expect(readTrials(home).rows.at(-1)).toMatchObject({ kind: "trial", window: "holdout", by: "owner" });
    expect(ok(svc.backtests()).ledger.looks).toBe(1);
  });

  it("moves the holdout — never back over days already tried on — and is good for ten minutes and once; a key that is not the owner's signs nothing of it", async () => {
    const { svc, home, own } = await boot();
    ok(await svc.backtestRun({ ...SMA, to: "2026-07-01" }));
    expect((await svc.account!.prepare({ type: "setBacktest", change: "holdout", value: "2026-09-01" }) as Prepared).quote?.words).toBe("Hold out the data from 2026-09-01 on (it is held out from 2026-07-31 now). Strategies are tried only on what came before it; the days from 2026-07-31 to 2026-09-01 become data to try strategies on.");
    expect(await own({ type: "setBacktest", change: "holdout", value: "2026-06-01" })).toMatchObject({ code: "E_ACCOUNT_BAD_ACTION", message: "the days after 2026-06-01 were already tried on (trial 2 ran to 2026-07-01): a holdout starts after every training run's end, 2026-07-01 or later" });
    expect(await own({ type: "setBacktest", change: "holdout", value: "2026-09-01" })).toEqual({ ok: true, kind: "account", summary: "the data from 2026-09-01 on is held out" });
    expect(ok(svc.backtests()).holdout).toMatchObject({ start: "2026-09-01", setBy: "owner" });
    expect(await own({ type: "setBacktest", change: "forget", value: "" })).toMatchObject({ code: "E_ACCOUNT_BAD_ACTION", message: 'a backtest\'s change is holdout (a day), evaluate (a training run\'s id) or desk (the desk\'s run, as JSON), not "forget"' });
    // signed eleven minutes ago: refused before anything is looked at
    expect(await own({ type: "setBacktest", change: "holdout", value: "2026-09-02" }, START - 11 * 60_000)).toMatchObject({ code: "E_ACCOUNT_EXPIRED" });
    // the same envelope twice: the first answer again, and nothing runs twice — one row in the ledger for it
    const env = await signOwner(owner, { type: "setBacktest", change: "holdout", value: "2026-09-03", nonce: START + 500 });
    const once = await svc.exchange(env);
    expect(once).toEqual({ ok: true, kind: "account", summary: "the data from 2026-09-03 on is held out" });
    const rows = readTrials(home).rows.length;
    expect(await svc.exchange(env)).toEqual(once);
    expect(readTrials(home).rows.length).toBe(rows);
    // a key the account does not know as its owner's
    expect(await svc.exchange(await signOwner(stranger, { type: "setBacktest", change: "holdout", value: "2026-09-04", nonce: START + 600 }))).toMatchObject({ code: "E_ACCOUNT_UNKNOWN_SIGNER" });
    expect(ok(svc.backtests()).holdout).toMatchObject({ start: "2026-09-03" });
  });
});
