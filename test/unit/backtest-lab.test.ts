import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { HistorySources } from "../../src/portfolio/backtest/data.ts";
import { appendTrial, holdoutFile, labEvaluate, labList, labRead, labRun, readHoldout, readTrials, setHoldout, trialsFile, type LabAsk, type LabDeps, type LabOutcome } from "../../src/portfolio/backtest/lab.ts";
import { DEFAULT_COSTS } from "../../src/portfolio/backtest/source.ts";
import { strategySpec, type StrategySpec } from "../../src/portfolio/backtest/strategies.ts";
import { expectedMaxSharpe, moments, normCdf, normInv, pbo, psr } from "../../src/portfolio/backtest/stats.ts";
import type { PublicSource } from "../../src/portfolio/live/public-markets.ts";
import type { Candle } from "../../src/portfolio/live/trade.ts";

/** THE LAB (src/portfolio/backtest/lab.ts, stats.ts): every run counted on a hash-chained ledger, the held-out data reached only when the
 * owner says so, a Sharpe deflated by the strategies tried before it. The figures against the papers' own worked examples; the holdout's
 * rules; the ledger's chain and what breaks it; runs over stand-in history (no network). */
const H = 3_600_000;
const D = 86_400_000;
const NOW = Date.parse("2026-10-29T12:34:00Z");

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "backtest-lab-"));
  homes.push(d);
  return d;
};
const spec = (id: string, params: Record<string, number> = {}): StrategySpec => {
  const s = strategySpec(id, params);
  if (typeof s === "string") throw new Error(s);
  return s;
};

describe("the statistics", () => {
  it("the normal distribution and its inverse, to the tables", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normCdf(-1.645)).toBeCloseTo(0.0499849, 6);
    expect(normInv(0.5)).toBeCloseTo(0, 9);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 6);
    expect(normInv(0.01)).toBeCloseTo(-2.326348, 6);
    expect(normInv(0.999)).toBeCloseTo(3.090232, 6);
    expect([normInv(0), normInv(1)]).toEqual([Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]);
  });

  it("moments: the mean, the standard deviation over n − 1, the skewness and the plain kurtosis", () => {
    const m = moments([1, 2, 3, 4, 5]);
    expect(m.mean).toBe(3);
    expect(m.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(m.skew).toBeCloseTo(0, 12);
    expect(m.kurt).toBeCloseTo(1.7, 12);
    expect(moments([2, 2, 2])).toMatchObject({ sd: 0, skew: 0, kurt: 3 });
  });

  it("the deflated Sharpe ratio of Bailey and López de Prado's worked example: 100 trials, a Sharpe of 2.5 a year over five years of days, skewed and fat-tailed — 0.9004", () => {
    // the trials' Sharpes vary by 0.5 a year: the best of 100 would show 1.79 a year by chance alone
    const sr0 = expectedMaxSharpe(100, 0.5);
    expect(sr0).toBeCloseTo(1.7893, 3);
    expect(psr(2.5 / Math.sqrt(250), sr0 / Math.sqrt(250), 1250, -3, 10)).toBeCloseTo(0.9004, 3);
    // one trial: the benchmark is zero, the probabilistic Sharpe itself
    expect(expectedMaxSharpe(1, 0.5)).toBe(0);
    expect(psr(0, 0, 100, 0, 3)).toBeCloseTo(0.5, 7);
  });

  it("the probability of overfitting: 1 where each trial shines in its own stretch only, 0 where one trial is best everywhere, none for one trial or too few steps", () => {
    // four trials, four stretches: trial k gains in stretch k and loses elsewhere — the best in sample is never the best out of it
    const lucky = [0, 1, 2, 3].map((k) => Array.from({ length: 80 }, (_, i) => (Math.floor(i / 20) === k ? 0.01 : -0.004) + Math.sin(i * (k + 2)) * 0.001));
    const p = pbo(lucky, 4)!;
    expect(p).toMatchObject({ pbo: 1, blocks: 4, combinations: 6, trials: 4, steps: 80 });
    // one trial earns more than the others in every stretch: picked in sample, best out of it
    const skilled = [0.004, 0.001, 0, -0.001].map((drift, k) => Array.from({ length: 160 }, (_, i) => drift + Math.sin(i * (k + 3)) * 0.002));
    expect(pbo(skilled)).toMatchObject({ pbo: 0, blocks: 16, combinations: 12_870 });
    expect(pbo([lucky[0]!])).toBeUndefined();
    expect(pbo([[0.1, 0.2, 0.3], [0.3, 0.2, 0.1]])).toBeUndefined();
  });
});

/** stand-in history: hourly bars of a perpetual and a coin from 2025-01-01 to the clock, waves of a few days on a slow drift, funding of
 * 0.001% an hour */
function standIn(id: string, symbol: string, now: () => number): PublicSource {
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
      for (let t = Math.max(Math.ceil(w.since! / step) * step, first); t < w.until! && t + step <= now(); t += step) {
        const [o, c] = [px(t), px(t + step)];
        bars.push({ t, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, c, v: 1000 });
      }
      return { bars, more: false, source: `Stand-in ${id} · ${symbol}` };
    },
    fundingHistory: async (_s, from, to) => {
      const out: Array<{ at: number; rate: number }> = [];
      for (let t = Math.ceil(Math.max(from, first) / H) * H; t <= to; t += H) out.push({ at: t, rate: 0.00001 });
      return out;
    },
  };
}

function lab(o: { now?: number } = {}): { deps: LabDeps; home: string; at: (ms: number) => void } {
  let now = o.now ?? NOW;
  const clock = () => now;
  const sources: HistorySources = { perp: standIn("hl", "BTC-PERP", clock), spot: standIn("cb", "BTC/USD", clock), stock: standIn("us", "AAPL", clock) };
  const home = tmp();
  return { deps: { home, cache: join(home, "history"), sources, clock }, home, at: (ms) => void (now = ms) };
}
const ask = (o: Partial<LabAsk> = {}): LabAsk => ({ spec: spec("sma", { fast: 10, slow: 40 }), refs: [{ cls: "perp", base: "BTC" }], interval: "4h", window: "train", cashUsd: 10_000, feeBps: 10, costs: DEFAULT_COSTS, benchmark: false, save: true, by: "terminal", ...o });
const ok = (r: LabOutcome | Refusal): LabOutcome => {
  if (isRefusal(r)) throw new Error(`${r.code}: ${r.message}`);
  return r;
};

describe("the holdout", () => {
  it("is the 90 days before the first time anything asks, from midnight UTC, written down once (0600) and said in the ledger — it never moves by itself", () => {
    const { home } = lab();
    const h = readHoldout(home, NOW) as { start: string; setBy: string };
    expect(h).toMatchObject({ version: 1, start: "2026-07-31", setBy: "default", setAt: new Date(NOW).toISOString() });
    expect(statSync(holdoutFile(home)).mode & 0o777).toBe(0o600);
    expect(readHoldout(home, NOW + 60 * D)).toMatchObject({ start: "2026-07-31" });
    expect(readTrials(home).rows).toMatchObject([{ seq: 1, kind: "holdout", by: "default", start: "2026-07-31" }]);
  });

  it("a holdout file that does not read is refused, not replaced — a new default would move the holdout", () => {
    const { home } = lab();
    readHoldout(home, NOW);
    writeFileSync(holdoutFile(home), "{not json");
    expect((readHoldout(home, NOW) as Refusal).message).toMatch(/^the holdout file \(.*holdout\.json\) does not read: put back the day it held out, or remove it/);
    expect(readFileSync(holdoutFile(home), "utf8")).toBe("{not json");
  });

  it("a training run ends at the holdout's start at the latest — and there when it names no end, over the 180 days before; a look at the holdout runs from its start to now, and is counted", async () => {
    const { deps } = lab();
    const past = await labRun(ask({ to: Date.parse("2026-08-15T00:00:00Z") }), deps);
    expect((past as Refusal).message).toBe("the data from 2026-07-31 on is held out: a strategy is tried before it (a window ending 2026-07-31 at the latest), and runs on it only when the account's owner says so");
    const train = ok(await labRun(ask(), deps));
    expect(train.run.to).toBe("2026-07-31T00:00:00.000Z");
    expect(train.trial).toMatchObject({ window: "train", from: "2026-02-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" });
    expect(train.notes).toContain("the data from 2026-07-31 on is held out (the 90 days before the first run): this run ends 2026-07-31 00:00 UTC");
    const look = ok(await labRun(ask({ window: "holdout", by: "owner" }), deps));
    expect(look.run.from).toBe("2026-07-31T00:00:00.000Z");
    expect(look.run.to).toBe("2026-10-29T12:00:00.000Z");
    expect(look).toMatchObject({ window: "holdout", looks: 1, trial: { window: "holdout", by: "owner" } });
    expect(look.psr).toBeGreaterThan(0);
    expect(look.deflated).toBeUndefined();
    expect(ok(await labRun(ask({ window: "holdout", by: "owner" }), deps)).looks).toBe(2);
  });

  it("is moved by the owner to a day that has come, said in the ledger with the day it was — never back over days a strategy was already tried on", async () => {
    const { deps, home } = lab();
    ok(await labRun(ask({ to: Date.parse("2026-07-01T00:00:00Z") }), deps));
    const no = (day: string) => (setHoldout(home, day, "owner", NOW) as Refusal).message;
    expect(no("2026-06-01")).toBe("the days after 2026-06-01 were already tried on (trial 2 ran to 2026-07-01): a holdout starts after every training run's end, 2026-07-01 or later");
    expect(no("2026-11-01")).toBe("a holdout starts on a day that has come: 2026-11-01 is after today (2026-10-29)");
    expect(no("2026-02-30")).toBe('a holdout starts on a day, YYYY-MM-DD, not "2026-02-30"');
    expect(no("2014-12-31")).toBe("a holdout starts on 2015-01-01 or later");
    expect(no("2026-07-31")).toBe("the holdout already starts on 2026-07-31");
    // back to the end of what was tried, and on to later: both allowed
    expect(setHoldout(home, "2026-07-01", "owner", NOW)).toMatchObject({ start: "2026-07-01", setBy: "owner" });
    expect(setHoldout(home, "2026-09-01", "terminal", NOW)).toMatchObject({ start: "2026-09-01", setBy: "terminal" });
    expect(readTrials(home).rows.slice(-2)).toMatchObject([
      { kind: "holdout", by: "owner", start: "2026-07-01", was: "2026-07-31" },
      { kind: "holdout", by: "terminal", start: "2026-09-01", was: "2026-07-01" },
    ]);
  });
});

describe("the trials", () => {
  it("are one row a run, hash-chained, 0600: what was tried, by whom, its figures — and a row changed, taken out or not JSON breaks the chain where it is", async () => {
    const { deps, home } = lab();
    ok(await labRun(ask(), deps));
    ok(await labRun(ask({ spec: spec("sma", { fast: 20, slow: 60 }), by: "request", seat: "0xabc" }), deps));
    const read = readTrials(home);
    expect(read.intact).toBe(true);
    expect(read.rows.map((r) => [r.seq, r.kind])).toEqual([[1, "holdout"], [2, "trial"], [3, "trial"]]);
    expect(read.rows[2]).toMatchObject({ by: "request", seat: "0xabc", strategy: "sma", params: { fast: 20, slow: 60, weight: 1 }, markets: ["perp:BTC"], interval: "4h", feeBps: 10, costs: DEFAULT_COSTS, kept: true, prev: read.rows[1]!.hash });
    expect(statSync(trialsFile(home)).mode & 0o777).toBe(0o600);
    const lines = readFileSync(trialsFile(home), "utf8").trim().split("\n");
    // a figure changed
    writeFileSync(trialsFile(home), [lines[0], lines[1]!.replace(/"returnPct":-?[0-9.e-]+/, '"returnPct":99'), lines[2]].join("\n") + "\n");
    expect(readTrials(home)).toMatchObject({ intact: false, brokenAt: 2, why: "row 2 is not what was written" });
    // a row taken out
    writeFileSync(trialsFile(home), [lines[0], lines[2]].join("\n") + "\n");
    expect(readTrials(home)).toMatchObject({ intact: false, brokenAt: 2, why: "row 2 says it is row 3" });
    // not JSON
    writeFileSync(trialsFile(home), [lines[0], "{", lines[2]].join("\n") + "\n");
    expect(readTrials(home)).toMatchObject({ intact: false, brokenAt: 2, why: "row 2 is not JSON" });
    // a run after the break goes on (chained to the last row), and the break is still said
    writeFileSync(trialsFile(home), lines.join("\n") + "\n");
    const after = ok(await labRun(ask({ spec: spec("hold") }), deps));
    expect(after.ledger).toEqual({ rows: 4, intact: true });
  });

  it("deflate a run's Sharpe by the DISTINCT strategies tried before the holdout: the same one again is not one more", async () => {
    const { deps } = lab();
    const one = ok(await labRun(ask(), deps));
    expect(one.deflated).toMatchObject({ trials: 1, sr0: 0 });
    expect(ok(await labRun(ask(), deps)).deflated!.trials).toBe(1);
    const three = [ok(await labRun(ask({ spec: spec("sma", { fast: 5, slow: 30 }) }), deps)), ok(await labRun(ask({ spec: spec("sma", { fast: 20, slow: 80 }) }), deps))][1]!;
    expect(three.deflated!.trials).toBe(3);
    expect(three.deflated!.sr0).toBeGreaterThan(0);
    // more tried, a higher bar: the first run read again now is deflated by all three
    const again = labRead(deps.home, one.id) as { deflated: { trials: number; dsr: number } };
    expect(again.deflated.trials).toBe(3);
    expect(again.deflated.dsr).toBeLessThanOrEqual(one.deflated!.dsr);
    // runs on the same markets and bars, kept: judged together for overfitting
    expect(three.overfit).toMatchObject({ trials: 3 });
    expect(three.overfit!.pbo).toBeGreaterThanOrEqual(0);
    expect(three.overfit!.pbo).toBeLessThanOrEqual(1);
  });

  it("a run not kept is counted still, and is left out of the overfitting it has no curve for", async () => {
    const { deps, home } = lab();
    const r = ok(await labRun(ask({ save: false }), deps));
    expect(r.saved).toBeUndefined();
    expect(existsSync(join(home, "backtest", "runs", `${r.id}.json`))).toBe(false);
    expect(r.trial).toMatchObject({ kept: false });
    expect(r.overfit).toBeUndefined();
  });

  it("are listed newest first with the holdout and the ledger's state; a run is read back by its id only — never a path", async () => {
    const { deps, home } = lab();
    const a = ok(await labRun(ask(), deps));
    const b = ok(await labRun(ask({ spec: spec("tsmom", { lookbackDays: 10, volDays: 10 }) }), deps));
    const list = labList(home, NOW);
    expect(list.holdout).toMatchObject({ start: "2026-07-31" });
    expect(list.ledger).toEqual({ rows: 3, intact: true, trials: 2, distinct: 2, looks: 0, screens: 0 });
    expect(list.runs.map((r) => r.run)).toEqual([b.id, a.id]);
    const read = labRead(home, a.id) as { id: string; run: { metrics: unknown }; trial: { run: string } };
    expect(read.id).toBe(a.id);
    expect(read.trial.run).toBe(a.id);
    expect(read.run.metrics).toEqual(a.run.metrics);
    expect((labRead(home, "../../etc/passwd") as Refusal).message).toBe("a run's id is like 20261029T120000-0123456789");
    expect((labRead(home, "20261029T120000-0123456789") as Refusal).message).toBe("no run 20261029T120000-0123456789 is kept");
  });

  it("the owner's look at the holdout tries a training run again exactly — its strategy, numbers, markets, bars, money and costs — on the held-out data", async () => {
    const { deps } = lab();
    const train = ok(await labRun(ask({ spec: spec("sma", { fast: 8, slow: 30, weight: 0.5 }), feeBps: 4, cashUsd: 25_000, costs: { ...DEFAULT_COSTS, halfSpreadBps: 3 } }), deps));
    const look = ok(await labEvaluate(train.id, deps, "owner"));
    expect(look.trial).toMatchObject({ window: "holdout", by: "owner", strategy: "sma", params: { fast: 8, slow: 30, weight: 0.5 }, markets: ["perp:BTC"], interval: "4h", feeBps: 4, cashUsd: 25_000, costs: { halfSpreadBps: 3 }, from: "2026-07-31T00:00:00.000Z" });
    expect(look.benchmark?.strategy.id).toBe("hold");
    expect((await labEvaluate(look.id, deps, "owner") as Refusal).message).toBe(`${look.id} was itself a look at the holdout: look again from the training run it tried`);
    expect((await labEvaluate("20261029T120000-0123456789", deps, "owner") as Refusal).message).toBe("no trial ran as 20261029T120000-0123456789");
  });

  it("a row appended by another writer meanwhile is chained to, not written over (the command and the service share the ledger)", () => {
    const { home } = lab();
    readHoldout(home, NOW);
    appendTrial(home, { kind: "holdout", by: "terminal", start: "2026-08-01", was: "2026-07-31" }, NOW);
    appendTrial(home, { kind: "holdout", by: "owner", start: "2026-08-02", was: "2026-08-01" }, NOW + 1);
    expect(readTrials(home)).toMatchObject({ intact: true, rows: [{ seq: 1 }, { seq: 2 }, { seq: 3 }] });
  });
});
