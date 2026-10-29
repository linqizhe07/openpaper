/** Attacks on the lab's holdout and its ledger (backtest/lab.ts, the service's backtest routes, the owner's setBacktest):
 *
 *   the window      an unsigned request never runs a strategy on the held-out data: not by naming a later end, not by a window that starts
 *                   inside it, not by a field it does not know ("window", "by") — and a run that ends at the holdout's start reads no bar
 *                   that began at it or after
 *   the figures     what came of the owner's look at the held-out data is the owner's: an unsigned list says the look was taken and of
 *                   what, never its figures, and the run itself is refused — an agent that saw them could choose among strategies by them
 *   the signature   only the owner's key looks at the held-out data or moves the holdout: an agent let in on the account is refused, and
 *                   the owner's envelope sent again is the first answer, not a second look
 *   the ledger      a row changed or taken out is found where it is; the oldest training runs past the most kept are let go, the owner's
 *                   looks never
 *
 * The held-out prices themselves are public — any agent reads them with portfolio_candles and can test on them elsewhere. What these hold
 * is that THIS account's lab never ran a strategy on them unless the owner said so, and that each time it did is counted. History from
 * stand-ins: nothing leaves the process. */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { signOwner, simKey, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import type { HistorySources } from "../../src/portfolio/backtest/data.ts";
import { labList, pruneRuns, readTrials, runFile, trialsFile } from "../../src/portfolio/backtest/lab.ts";
import type { LiveDeps } from "../../src/portfolio/live/index.ts";
import type { PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { Candle } from "../../src/portfolio/live/trade.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const H = 3_600_000;
const D = 86_400_000;
const START = Date.parse("2026-10-29T12:34:00Z");
const HOLDOUT = Date.parse("2026-07-31T00:00:00Z");
const owner = simKey("owner");
const agent = simKey("agent:lab-holes");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const refusal = (r: unknown): Refusal => {
  if (!isRefusal(r)) throw new Error(`expected a refusal, got ${JSON.stringify(r).slice(0, 200)}`);
  return r;
};

/** every bar a stand-in was asked for, by its start: to see that no bar from the held-out data was read for a run before it */
const asked: number[] = [];
function standIn(id: string, symbol: string): PublicSource {
  const first = Date.parse("2025-01-01T00:00:00Z");
  const px = (t: number): number => 20_000 * (1 + 0.08 * Math.sin(t / (53 * H)) + 0.04 * Math.sin(t / (13 * H)));
  return {
    id,
    name: `Stand-in ${id}`,
    kind: "exchange",
    connectTo: id,
    connector: `live:${id}`,
    listings: async () => [{ symbol, name: symbol, kind: symbol.endsWith("-PERP") ? "perp" : "spot", base: "BTC", quote: "USD", open: true, types: [], maxLeverage: 20, fundingEveryH: 1 }],
    candles: async (_s, interval, w) => {
      const step = interval === "4h" ? 4 * H : interval === "1d" ? D : H;
      const bars: Candle[] = [];
      for (let t = Math.max(Math.ceil(w.since! / step) * step, first); t < w.until! && t + step <= START; t += step) bars.push({ t, o: px(t), h: Math.max(px(t), px(t + step)) * 1.002, l: Math.min(px(t), px(t + step)) * 0.998, c: px(t + step), v: 1000 });
      asked.push(...bars.map((b) => b.t));
      return { bars, more: false, source: `Stand-in ${id}` };
    },
    fundingHistory: async (_s, from, to) => {
      const out: Array<{ at: number; rate: number }> = [];
      for (let t = Math.ceil(Math.max(from, first) / H) * H; t <= to; t += H) out.push({ at: t, rate: 0.00001 });
      return out;
    },
  };
}

async function boot() {
  const home = mkdtempSync(join(tmpdir(), "lab-holes-"));
  homes.push(home);
  let n = 0;
  const sources: HistorySources = { perp: standIn("hl", "BTC-PERP"), spot: standIn("cb", "BTC/USD"), stock: standIn("us", "AAPL") };
  const liveDeps: Partial<LiveDeps> = { clock: () => START, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline", real: true, liveDeps, publicMarkets: [], liveWrites: { capUsd: 100, pairingCode: "K7QX-M2PA" }, account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] }, backtest: { sources } });
  const own = async (a: NoNonce<OwnerAction>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + ++n } as OwnerAction));
  return { svc, home, own };
}
const SMA = { strategy: "sma", params: { fast: 10, slow: 40 }, markets: "perp:BTC", interval: "4h", benchmark: false };

describe("the window: nothing unsigned runs on the held-out data", () => {
  it("not by naming a later end, a start inside it, or a field it does not know — and a run that ends at its start reads no bar that began at it or after", async () => {
    const { svc } = await boot();
    expect(refusal(await svc.backtestRun({ ...SMA, to: "2026-08-01" })).code).toBe("E_ACCOUNT_OWNER_ONLY");
    expect(refusal(await svc.backtestRun({ ...SMA, from: "2026-08-01" })).message).toBe("a backtest's window ends after it starts");
    expect(refusal(await svc.backtestRun({ ...SMA, from: "2026-08-01", to: "2026-10-01" })).code).toBe("E_ACCOUNT_OWNER_ONLY");
    for (const smuggled of [{ window: "holdout" }, { by: "owner" }, { save: false }, { maxSteps: 1e9 }]) expect(refusal(await svc.backtestRun({ ...SMA, ...smuggled })).message).toMatch(/^a backtest is asked with strategy, params/);
    asked.length = 0;
    const r = (await svc.backtestRun({ ...SMA, to: "2026-07-31" })) as { id: string; to: string };
    expect(r.to).toBe("2026-07-31T00:00:00.000Z");
    // the kept history may reach later (another run fetched it): the run itself holds none of it
    const kept = JSON.parse(readFileSync(runFile((svc as unknown as { opts: { home: string } }).opts.home, r.id), "utf8")) as { run: { markets: Array<{ last: string }>; equity: Array<{ t: number }> } };
    expect(Date.parse(kept.run.markets[0]!.last)).toBeLessThanOrEqual(HOLDOUT);
    expect(Math.max(...kept.run.equity.map((p) => p.t))).toBe(HOLDOUT);
    expect(asked.every((t) => t < HOLDOUT)).toBe(true);
  });
});

describe("the figures of a look at the held-out data are the owner's", () => {
  it("an unsigned list says the look was taken, by whom, of what — never its figures; the run itself is refused, over the routes as at the service", async () => {
    const { svc, own } = await boot();
    const train = (await svc.backtestRun(SMA)) as { id: string };
    const look = (await own({ type: "setBacktest", change: "evaluate", value: train.id })) as { result: { id: string; metrics: { returnPct: number } } };
    expect(typeof look.result.metrics.returnPct).toBe("number");
    const list = svc.backtests() as { runs: Array<Record<string, unknown>> };
    const row = list.runs.find((x) => x.run === look.result.id)!;
    expect(row).toEqual({ v: 1, seq: 3, ts: new Date(START).toISOString(), kind: "trial", by: "owner", run: look.result.id, window: "holdout", strategy: "sma", params: { fast: 10, slow: 40, weight: 1 }, markets: ["perp:BTC"], interval: "4h", from: "2026-07-31T00:00:00.000Z", to: "2026-10-29T12:00:00.000Z", figures: "the owner's" });
    expect(refusal(svc.backtestKept(look.result.id))).toMatchObject({ code: "E_ACCOUNT_OWNER_ONLY", message: `${look.result.id} is a look at the held-out data: what came of it is the owner's, answered to their signature and kept in the home` });
    // the training run it tried stays readable, its figures and all
    expect(isRefusal(svc.backtestKept(train.id))).toBe(false);
    const srv = await startPortfolioServer({ port: 0, service: svc, snapshotMs: 0 });
    try {
      const get = async (path: string) => (await (await fetch(`${srv.url}${path}`)).json()) as Record<string, unknown>;
      const listed = JSON.stringify(await get("/api/account/backtests"));
      expect(listed).not.toContain(String(look.result.metrics.returnPct));
      expect(await get(`/api/account/backtest?id=${look.result.id}`)).toMatchObject({ ok: false, refusal: { code: "E_ACCOUNT_OWNER_ONLY" } });
    } finally {
      await srv.close();
    }
    // the owner's own terminal reads them
    const home = (svc as unknown as { opts: { home: string } }).opts.home;
    expect(labList(home, START, 50, { owner: true }).runs.find((x) => x.run === look.result.id)).toMatchObject({ returnPct: look.result.metrics.returnPct });
  });
});

describe("the signature: only the owner looks, and once per envelope", () => {
  it("an agent let in on the account signs no look and no move of the holdout; the owner's envelope sent again is the first answer, not a second look", async () => {
    const { svc, own } = await boot();
    expect(await own({ type: "approveAgent", agentAddress: agent.address, agentName: "lab-holes", validUntil: START + 30 * D })).toMatchObject({ ok: true });
    const train = (await svc.backtestRun(SMA)) as { id: string };
    for (const a of [{ type: "setBacktest", change: "evaluate", value: train.id }, { type: "setBacktest", change: "holdout", value: "2026-09-01" }] as const) {
      expect(refusal(await svc.exchange(await signOwner(agent, { ...a, nonce: START + 900 } as OwnerAction))).code).toBe("E_ACCOUNT_OWNER_ONLY");
    }
    const env = await signOwner(owner, { type: "setBacktest", change: "evaluate", value: train.id, nonce: START + 950 });
    const first = await svc.exchange(env);
    expect(first).toMatchObject({ ok: true, kind: "result", result: { looks: 1 } });
    expect(await svc.exchange(env)).toEqual(first);
    expect((svc.backtests() as { ledger: { looks: number } }).ledger.looks).toBe(1);
  });
});

describe("the ledger", () => {
  it("a row changed or taken out is found where it is, and said in the list; runs go on", async () => {
    const { svc, home } = await boot();
    await svc.backtestRun(SMA);
    await svc.backtestRun({ ...SMA, params: { fast: 5, slow: 30 } });
    const lines = readFileSync(trialsFile(home), "utf8").trim().split("\n");
    writeFileSync(trialsFile(home), [lines[0], lines[1]!.replace(/"sharpe":-?[0-9.e-]+/, '"sharpe":9.99'), lines[2]].join("\n") + "\n");
    expect((svc.backtests() as { ledger: unknown }).ledger).toMatchObject({ intact: false, brokenAt: 2, why: "row 2 is not what was written" });
    expect(await svc.backtestRun({ ...SMA, params: { fast: 6, slow: 30 } })).toMatchObject({ ledger: { intact: false, brokenAt: 2 } });
  });

  it("the oldest training runs past the most kept are let go — their rows stay, saying what was tried — and the owner's looks never are", async () => {
    const { svc, home, own } = await boot();
    const ids: string[] = [];
    for (const fast of [5, 6, 7, 8]) ids.push(((await svc.backtestRun({ ...SMA, params: { fast, slow: 30 } })) as { id: string }).id);
    const look = (await own({ type: "setBacktest", change: "evaluate", value: ids[0]! })) as { result: { id: string } };
    pruneRuns(home, 2);
    const kept = readdirSync(join(home, "backtest", "runs")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(kept).toEqual([ids[2]!, ids[3]!, look.result.id].sort());
    expect(existsSync(runFile(home, ids[0]!))).toBe(false);
    expect(refusal(svc.backtestKept(ids[0]!)).message).toBe(`no run ${ids[0]} is kept`);
    expect(readTrials(home).rows.filter((r) => r.kind === "trial").length).toBe(5);
  });
});
