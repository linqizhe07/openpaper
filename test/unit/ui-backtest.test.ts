import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { STRATEGIES } from "../../src/portfolio/backtest/strategies.ts";

/** THE BACKTEST PANE (ui/backtest.js): the lab as the owner reads and runs it — the form drawn from the account's catalog, what it asks
 * the account for, the result (the equity beside the buy-and-hold's, the drawdown, the figures, how it is judged, the fills), the trials
 * with Open and the owner's Look at the holdout…, a look's answer kept in this browser — run as the page runs it: plain scripts in one
 * global scope after ui/core.js, here in a vm with a stand-in document */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
const FILES = ["core.js", "backtest.js"];

type Asked = { path: string; method: string; body?: unknown };
function page(opts: { fetch?: (path: string, init?: { method?: string; body?: string }) => Promise<unknown> } = {}) {
  const asked: Asked[] = [];
  const kept = new Map<string, string>();
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "" });
  const sandbox: Record<string, unknown> = {
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: element(), documentElement: { dataset: { theme: "cream" } }, hidden: false },
    location: { hash: "", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
    localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
    Owner: { role: "owner", kid: "k1", why: (r: { body?: { refusal?: { message?: string }; error?: string } }) => r.body?.refusal?.message ?? r.body?.error ?? "" },
    Event: class {
      constructor(readonly type: string) {}
    },
    addEventListener() {},
    dispatchEvent: () => true,
    console,
    URLSearchParams,
    Intl,
    setTimeout,
    clearTimeout,
    fetch: async (path: string, init?: { method?: string; body?: string }) => {
      asked.push({ path, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(init.body) } : {}) });
      if (!opts.fetch) return new Promise(() => {});
      const body = await opts.fetch(path, init);
      return { status: (body as { ok?: boolean })?.ok === false ? 409 : 200, statusText: "", json: async () => body };
    },
  };
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  return { run, asked, kept, sandbox, set: (name: string, value: unknown) => run(`${name} = ${JSON.stringify(value)}`) };
}

const CATALOG = {
  strategies: STRATEGIES,
  intervals: ["1h", "4h", "1d"],
  markets: { most: 12, kinds: [{ cls: "perp", example: "perp:BTC", words: "Hyperliquid's perpetuals" }, { cls: "spot", example: "spot:ETH", words: "Coinbase's coins" }, { cls: "stock", example: "stock:SPY", words: "US stocks in daily bars" }] },
  defaults: { strategy: "tsmom", markets: "perp:BTC", interval: "1h", cash: 10_000, feeBps: 10, sharesFeeBps: 0, costs: { halfSpreadBps: 1, participation: 0.05, levelBps: 2, levels: 5 }, windowDays: 180, benchmark: true },
  holdoutDays: 90,
};
const HOLDOUT = { version: 1, start: "2026-07-31", setAt: "2026-10-29T12:34:00.000Z", setBy: "default" };
const metrics = (o: Record<string, number> = {}) => ({ startUsd: 10_000, endUsd: 11_112, returnPct: 11.12, years: 0.24, cagrPct: 54.1, volPct: 26.4, sharpe: 1.79, sharpeSe: 2.04, sortino: 2.6, maxDrawdownPct: 8.56, maxDrawdownDays: 54.8, calmar: 6.42, steps: 2108, perYear: 8760, fills: 37, tradedUsd: 1, turnover: 32.8, feesUsd: 84.87, fundingUsd: -4.01, slippageUsd: 8.49, exposurePct: 62, ...o });
const TRIAL = (seq: number, o: Record<string, unknown> = {}) => ({ v: 1, seq, ts: "2026-10-29T16:26:50.000Z", kind: "trial", by: "terminal", run: `20261029T1626${String(seq).padStart(2, "0")}-d837f7a84b`, window: "train", key: "k", strategy: "tsmom", params: { lookbackDays: 30 }, markets: ["perp:BTC", "perp:ETH"], interval: "1h", from: "2026-05-04T04:00:00.000Z", to: "2026-07-31T00:00:00.000Z", cashUsd: 10_000, feeBps: 10, costs: {}, steps: 2108, perYear: 8760, sharpe: 1.79, sr: 0.019, skew: 0, kurt: 3, returnPct: 11.12, maxDrawdownPct: 8.56, fills: 37, kept: true, prev: "", hash: "", ...o });
const LIST = { ok: true, holdout: HOLDOUT, ledger: { rows: 5, intact: true, trials: 4, distinct: 3, looks: 1 }, runs: [{ v: 1, seq: 5, ts: "2026-10-29T16:27:30.000Z", kind: "trial", by: "owner", run: "20261029T162730-aaaaaaaaaa", window: "holdout", strategy: "tsmom", params: { lookbackDays: 30 }, markets: ["perp:BTC", "perp:ETH"], interval: "1h", from: "2026-07-31T00:00:00.000Z", to: "2026-10-29T12:00:00.000Z", figures: "the owner's" }, TRIAL(4, { kept: false }), TRIAL(2)], catalog: CATALOG };

describe("the form, drawn once from the account's catalog", () => {
  it("offers every strategy with its words and numbers — each number's default, bounds and step — the markets, the bars, a window ending at the holdout's start, the money, the fee, the cost model and the buy-and-hold beside it", () => {
    const { run } = page();
    const html = run<string>(`btFormHtml(${JSON.stringify(CATALOG)}, ${JSON.stringify(HOLDOUT)})`);
    expect(html).toContain('<option value="tsmom" selected>Time-series momentum</option>');
    for (const name of ["Buy and hold", "Moving-average cross", "Funding carry"]) expect(html).toContain(`>${name}</option>`);
    expect(html).toContain(STRATEGIES.tsmom.words);
    expect(html).toContain('<input name="p.lookbackDays" type="number" min="1" max="365" step="any" value="30" inputmode="decimal" required>');
    expect(html).toContain("Vol target");
    expect(html).toContain('<input name="markets" value="perp:BTC"');
    expect(html).toContain('<input name="from" type="date" value="2026-02-01" max="2026-07-31">');
    expect(html).toContain('<input name="to" type="date" value="2026-07-31" max="2026-07-31">');
    expect(html).toContain("The window ends at the holdout's start, 2026-07-31, at the latest: the data from then on is the owner's to run on, by signature.");
    expect(html).toContain('<input name="feeBps" type="number" min="0" max="500" step="any" value="10"');
    expect(html).toContain('name="participation" type="number" min="0.0001" max="1" step="any" value="0.05"');
    expect(html).toContain('<input type="checkbox" name="benchmark" checked> Buy and hold beside it');
  });

  it("names each number as a person reads it, and a strategy that takes none says so", () => {
    const { run } = page();
    expect(run(`[btParamLabel("lookbackDays"), btParamLabel("enterApr"), btParamLabel("fast")]`)).toEqual(["Lookback days", "Enter APR", "Fast"]);
    expect(run(`btParamsHtml(${JSON.stringify(STRATEGIES.hold)})`)).toBe('<p class="dim small">It takes no numbers.</p>');
    expect(run(`btParamsHtml(${JSON.stringify(STRATEGIES.sma)})`)).toContain('<input name="p.fast" type="number" min="2" max="500" step="1" value="20"');
  });

  it("asks the account for what was typed: a number as a number, a field left empty as the account's default, the page named as who asks", () => {
    const { run } = page();
    const fields = { strategy: "sma", "p.fast": "10", "p.slow": "50", "p.weight": "", markets: " perp:BTC,perp:ETH ", interval: "4h", from: "2026-02-01", to: "", cash: "5000", feeBps: "4.5", leverage: "", halfSpreadBps: "1", participation: "0.05", levelBps: "2" };
    expect(run(`btAskOf(${JSON.stringify(fields)}, false)`)).toEqual({ strategy: "sma", params: { fast: 10, slow: 50 }, markets: "perp:BTC,perp:ETH", interval: "4h", from: "2026-02-01", cash: 5000, feeBps: 4.5, halfSpreadBps: 1, participation: 0.05, levelBps: 2, benchmark: false, seat: "page" });
  });
});

describe("the walk-forward mode", () => {
  it("is a switch on the form: the walk's grid (values to try for each number), its folds and rolling, hidden until walked; a strategy without numbers says so", () => {
    const { run } = page();
    const html = run<string>(`btFormHtml(${JSON.stringify({ ...CATALOG, walk: { folds: [2, 10], combosMost: 50 } })}, ${JSON.stringify(HOLDOUT)})`);
    expect(html).toContain('<div class="seg bt-modes" role="group" aria-label="What to run"><button type="button" data-bt-act="mode" data-mode="run" aria-pressed="true">One run</button><button type="button" data-bt-act="mode" data-mode="walk" aria-pressed="false">Walk forward</button></div>');
    expect(html).toContain('<div class="bt-walk" data-bt-walk hidden>');
    expect(html).toContain('<input name="g.lookbackDays" autocomplete="off" spellcheck="false" inputmode="decimal" placeholder="e.g. 30, 60">');
    expect(html).toContain('<input name="folds" type="number" min="2" max="10" step="1" value="4" inputmode="numeric">');
    expect(html).toContain('<input type="checkbox" name="rolling"> Rolling: each fold picks on the stretch before it only');
    expect(html).toContain("50 combinations at most. Every run is a row of the ledger.");
    expect(run(`btGridHtml(${JSON.stringify(STRATEGIES.hold)})`)).toBe('<p class="dim small">It takes no numbers to pick: the walk runs it as it is on each fold.</p>');
    expect(run(`btGridHtml(${JSON.stringify(STRATEGIES.sma)})`)).toContain('placeholder="e.g. 20, 40"');
  });

  it("switches the form between one run and a walk: the switch pressed, the walk's fields and the buy-and-hold shown or hidden, the button's word", () => {
    const { run, sandbox } = page();
    const el = (o: Record<string, unknown> = {}) => ({ hidden: false, dataset: {}, attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; }, textContent: "", firstChild: null, ...o });
    const buttons = [el({ dataset: { mode: "run" } }), el({ dataset: { mode: "walk" } })];
    const parts: Record<string, ReturnType<typeof el>> = { "[data-bt-mode-words]": el(), "[data-bt-walk]": el({ hidden: true }), "[data-bt-benchmark]": el(), "[data-bt-go]": el({ disabled: false }) };
    (sandbox as { FORM: unknown }).FORM = { querySelectorAll: () => buttons, querySelector: (q: string) => parts[q] ?? null };
    run(`BT.mode = "walk"; btModeSync(FORM)`);
    expect([buttons[0]!.attrs["aria-pressed"], buttons[1]!.attrs["aria-pressed"]]).toEqual(["false", "true"]);
    expect([parts["[data-bt-walk]"]!.hidden, parts["[data-bt-benchmark]"]!.hidden]).toEqual([false, true]);
    expect(parts["[data-bt-go]"]!.textContent).toBe("Walk forward");
    run(`BT.mode = "run"; btModeSync(FORM)`);
    expect([parts["[data-bt-walk]"]!.hidden, parts["[data-bt-benchmark]"]!.hidden, parts["[data-bt-go]"]!.textContent]).toEqual([true, false, "Run backtest"]);
  });

  it("asks the account for a walk: the numbers with values typed walked (and not fixed), the rest fixed, the folds, rolling, no buy-and-hold", () => {
    const { run } = page();
    const fields = { strategy: "sma", "p.fast": "20", "p.slow": "100", "p.weight": "1", "g.fast": "10, 20,40", "g.slow": "", "g.weight": "", markets: "perp:BTC", interval: "1h", from: "2026-02-01", to: "2026-07-31", cash: "10000", feeBps: "10", leverage: "", halfSpreadBps: "1", participation: "0.05", levelBps: "2", folds: "3" };
    expect(run(`btWalkAskOf(${JSON.stringify(fields)}, true)`)).toEqual({ strategy: "sma", params: { slow: 100, weight: 1 }, markets: "perp:BTC", interval: "1h", from: "2026-02-01", to: "2026-07-31", cash: 10_000, feeBps: 10, halfSpreadBps: 1, participation: 0.05, levelBps: 2, seat: "page", grid: { fast: [10, 20, 40] }, folds: 3, rolling: true });
  });

  it("shows a walk: the folds chained, what it earned out of sample, the share of the in-sample Sharpe it kept — or that it kept none — the rows it added, and each fold with its run to open", async () => {
    const fold = (n: number, ret: number) => ({ fold: n, inSample: { from: "2026-04-04T00:00:00.000Z", to: `2026-0${4 + n}-03T00:00:00.000Z` }, outSample: { from: `2026-0${4 + n}-03T00:00:00.000Z`, to: `2026-0${5 + n}-02T00:00:00.000Z` }, picked: { fast: 10, slow: 200, weight: 1 }, inSharpe: 1.2, tried: 9, out: { id: `20261029T17102${n}-af504f2525`, returnPct: ret, sharpe: 1.1, maxDrawdownPct: 6.75, fills: 35, feesUsd: 50 } });
    const walk = { ok: true, strategy: { id: "sma", name: "Moving-average cross" }, grid: { fast: [10, 20, 40], slow: [50, 100, 200] }, fixed: { weight: 1 }, combos: 9, folds: [fold(1, 3.5), fold(2, -0.18)], rolling: false, markets: ["perp:BTC", "perp:ETH"], interval: "1h", window: { from: "2026-04-04T04:00:00.000Z", to: "2026-07-31T00:00:00.000Z" }, metrics: metrics({ returnPct: 3.31, sharpe: 0.6, sharpeSe: 1.9, fills: 70, feesUsd: 100 }), inSharpeMean: 1.2, outSharpe: 0.6, efficiency: 0.5, trials: { added: 20, inSample: 18, outSample: 2 }, ledger: { rows: 21, intact: true }, notes: ["the walk starts 2026-04-04"], curve: [[1, 10_000], [2, 10_200], [3, 10_331]] };
    const { run, asked, sandbox } = page({ fetch: async (path) => (path === "/api/account/backtest/walk" ? walk : LIST) });
    sandbox.toast = () => {};
    const msg = { className: "", textContent: "", firstChild: null };
    (sandbox as { FORM: unknown }).FORM = { querySelector: (q: string) => (q === "[data-bt-msg]" ? msg : null), querySelectorAll: () => [] };
    await run(`btWalkSend({ strategy: "sma", grid: { fast: [10, 20, 40] } }, FORM)`);
    expect(asked[0]).toEqual({ path: "/api/account/backtest/walk", method: "POST", body: { strategy: "sma", grid: { fast: [10, 20, 40] } } });
    expect(run(`[BT.view.kind, BT.view.combos, BT.view.ok]`)).toEqual(["walk", 9, undefined]);
    const html = run<string>("btResultHtml(BT.view)");
    expect(html).toContain('<h2 class="h2">Walk-forward · Moving-average cross</h2>');
    expect(html).toContain("9 combinations (fast 10, 20, 40 × slow 50, 100, 200), the rest weight 1 · 2 folds, anchored · perp:BTC, perp:ETH 1h · 2026-04-04 04:00 → 2026-07-31 00:00 UTC");
    expect(html).toContain("<b>50% of it kept</b>: the picks' mean Sharpe in sample was 1.20; the walk's out of sample, 0.60.");
    expect(html).toContain("20 rows added to the ledger: 18 tries in sample, counted; 2 runs out of sample, kept.");
    expect([...html.matchAll(/data-bt-act="open" data-id="([^"]+)"/g)].map((m) => m[1])).toEqual(["20261029T171021-af504f2525", "20261029T171022-af504f2525"]);
    expect(html).toContain('<td class="nw"><span title="the best of 9 in sample, 04-04 → 05-03">fast 10 · slow 200</span></td>');
    expect(html).toContain('<span title="in sample 04-04 → 05-03">1</span>');
    expect(html).toContain(`<td class="nw"><button type="button" class="link" data-bt-act="open" data-id="20261029T171021-af504f2525" title="Open this fold's run">05-03 → 06-02</button></td>`);
    expect(run<string>(`btWalkHtml(${JSON.stringify({ ...walk, efficiency: -0.72, outSharpe: -0.81 })})`)).toContain("<b>None of it kept</b>: the picks' mean Sharpe in sample was 1.20; the walk's out of sample, −0.81 (an efficiency of −72%).");
    expect(run<string>(`btWalkHtml(${JSON.stringify({ ...walk, efficiency: null, inSharpeMean: -0.2 })})`)).toContain("The picks' mean Sharpe in sample was −0.20: nothing above zero for the walk to keep.");
  });
});

describe("a run", () => {
  it("is asked of the account, its kept run read for the curves and the fills, the trials read again; a refusal says the account's words under the form", async () => {
    const kept = { ok: true, id: "20261029T162650-d837f7a84b", window: "train", holdout: "2026-07-31", notes: ["the data from 2026-07-31 on is held out"], run: { strategy: { id: "sma", name: "Moving-average cross", paramWords: "fast 10 · slow 50 · weight 1" }, markets: [{ symbol: "BTC-PERP", interval: "4h" }], from: "2026-02-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z", cashUsd: 10_000, feeBps: 10, leverage: 2, costs: {}, metrics: metrics(), equity: [{ t: 1, usd: 10_000 }, { t: 2, usd: 9_000 }, { t: 3, usd: 11_112 }], fills: [{ at: "2026-02-02T00:00:00.000Z", symbol: "BTC-PERP", side: "buy", qty: 0.1, price: 90_000, feeUsd: 9 }], refused: [], funding: { paidUsd: 0, receivedUsd: 4.01, hours: 9 }, notes: ["a perpetual's margin is isolated"] }, trial: { seq: 2 }, deflated: { dsr: 0.81, sr0: 0, trials: 1 } };
    const { run, asked, sandbox } = page({ fetch: async (path) => (path.startsWith("/api/account/backtest?id=") ? kept : path.startsWith("/api/account/backtests") ? LIST : { ok: true, id: kept.id, strategy: kept.run.strategy, metrics: metrics() }) });
    sandbox.toast = () => {};
    const msg = { className: "", textContent: "", firstChild: null };
    const form = { querySelector: (q: string) => (q === "[data-bt-msg]" ? msg : null) };
    (sandbox as { FORM: unknown }).FORM = form;
    await run(`btSend({ strategy: "sma", markets: "perp:BTC" }, FORM)`);
    expect(asked.slice(0, 2)).toEqual([{ path: "/api/account/backtest", method: "POST", body: { strategy: "sma", markets: "perp:BTC" } }, { path: `/api/account/backtest?id=${kept.id}`, method: "GET" }]);
    expect(asked.some((a) => a.path === "/api/account/backtests?limit=50")).toBe(true);
    const view = run<{ id: string; curve: number[][]; fillsList: unknown[]; deflated: { dsr: number }; notes: string[]; trial: number }>("BT.view");
    expect(view).toMatchObject({ id: kept.id, curve: [[1, 10_000], [2, 9_000], [3, 11_112]], deflated: { dsr: 0.81 }, trial: 2, notes: ["the data from 2026-07-31 on is held out", "a perpetual's margin is isolated"] });
    expect(view.fillsList).toHaveLength(1);
    expect(run("BT.running")).toBe(false);
    // refused: the account's own words under the form
    const refusing = page({ fetch: async () => ({ ok: false, refusal: { code: "E_ACCOUNT_OWNER_ONLY", message: "the data from 2026-07-31 on is held out" } }) });
    (refusing.sandbox as { FORM: unknown }).FORM = form;
    await refusing.run(`btSend({ to: "2026-09-01" }, FORM)`);
    expect(msg).toMatchObject({ className: "msg no" });
    expect(refusing.run("BT.view")).toBe(null);
  });
});

describe("the result", () => {
  it("draws the strategy's equity beside the buy-and-hold's on one scale, its drawdown under it, said in words for a screen reader", () => {
    const { run } = page();
    const c = run<{ lo: number; hi: number; worst: number; line: string; bench: string; start: number; end: number }>(`btChart([[0, 100], [1, 120], [2, 90], [3, 130]], [[0, 100], [3, 110]], 300, 100, 30)`);
    expect(c).toMatchObject({ lo: 90, hi: 130, start: 100, end: 130 });
    expect(c.worst).toBeCloseTo(90 / 120 - 1, 9);
    expect(c.line.startsWith("M0.0,")).toBe(true);
    expect(c.bench.split("L")).toHaveLength(2);
    expect(run(`btChart([[0, 100]], [])`)).toBe(null);
    // a long curve is thinned to the points drawn, its first and last kept
    const long = run<number[][]>(`btThin(Array.from({ length: 5000 }, (_, i) => [i, i]), 600)`);
    expect([long.length, long[0], long[599]]).toEqual([600, [0, 0], [4999, 4999]]);
    const html = run<string>(`btChartHtml({ curve: [[0, 100], [1, 120], [2, 90], [3, 130]], benchmarkCurve: [[0, 100], [3, 110]] })`);
    expect(html).toContain('aria-label="The strategy&#39;s equity from $100.00 to $130.00, low $90.00, high $130.00; buying and holding ended at $110.00; its deepest drawdown −25.00%"');
    expect(html).toContain('<span class="sw bench"></span>Buy and hold');
  });

  it("a training run: what ran, the figures beside the buy-and-hold's, its Sharpe deflated by the strategies tried and its kin's odds of overfitting, the notes, the fills", () => {
    const { run } = page();
    const v = { id: "20261029T162650-d837f7a84b", window: "train", strategy: { id: "tsmom", name: "Time-series momentum", paramWords: "lookbackDays 30" }, markets: [{ symbol: "BTC-PERP", interval: "1h" }], from: "2026-05-04T04:00:00.000Z", to: "2026-07-31T00:00:00.000Z", feeBps: 10, leverage: 4, metrics: metrics(), benchmark: { strategy: "hold", metrics: metrics({ returnPct: -20.66, endUsd: 7_934, sharpe: -1.88 }) }, deflated: { dsr: 0.03, sr0: 1.94, trials: 3 }, overfit: { pbo: 0.43, trials: 3, steps: 2108, blocks: 16, combinations: 12_870 }, notes: ["a note"], fills: 1, fillsList: [{ at: "2026-05-05T00:00:00.000Z", symbol: "BTC-PERP", side: "sell", qty: 0.05, price: 95_000, feeUsd: 4.75, realizedUsd: 12.5, note: "liquidated at the mark" }] };
    const html = run<string>(`btResultHtml(${JSON.stringify(v)})`);
    expect(html).toContain('<h2 class="h2">Time-series momentum</h2>');
    expect(html).toContain("lookbackDays 30 · BTC-PERP · 1h · 2026-05-04 04:00 → 2026-07-31 00:00 UTC · fee 10 bps · perpetuals at 4x");
    expect(html).toContain('<th scope="col" class="r">Buy and hold</th>');
    expect(html).toContain('<tr><th scope="row">Sharpe</th><td class="r">1.79 <span class="dim">±2.04</span></td><td class="r">−1.88 <span class="dim">±2.04</span></td></tr>');
    expect(html).toContain('<tr><th scope="row">Funding</th><td class="r">$4.01 received</td>');
    expect(html).toContain("<b>Deflated Sharpe 0.03</b>: the probability the Sharpe is real, counting the 3 distinct strategies tried before the holdout — the best of them would show 1.94 a year by chance alone.");
    expect(html).toContain("<b>PBO 0.43</b>: across 12,870 ways of halving the 2,108 steps these 3 runs share, the run best on one half ranked in the bottom half of the other 43% of the time.");
    expect(html).toContain("<summary>1 note</summary>");
    expect(html).toContain("<summary>1 fill</summary>");
    expect(html).toContain('title="liquidated at the mark"');
    expect(run(`btResultHtml(null)`)).toContain("Run a backtest, or open one of the trials below");
  });

  it("a look at the held-out data: which look, the odds its Sharpe is above zero, and that this browser keeps what the account answered to the owner's signature", () => {
    const { run } = page();
    const html = run<string>(`btResultHtml(${JSON.stringify({ id: "x", window: "holdout", holdout: "2026-07-31", strategy: { id: "tsmom", name: "Time-series momentum", paramWords: "" }, from: "2026-07-31T00:00:00.000Z", to: "2026-10-29T12:00:00.000Z", metrics: metrics(), psr: 0.84, looks: 2, here: true })})`);
    expect(html).toContain('<span class="tag warn">Held-out data</span>');
    expect(html).toContain("Look 2 at it, from 2026-07-31. The probability its Sharpe is above zero: <b>0.84</b>.");
    expect(html).toContain("the account answered it to your signature, and this browser keeps it");
    expect(html).not.toContain("Deflated Sharpe");
  });
});

describe("the trials and the header", () => {
  it("list the ledger's runs newest first: Open for a kept training run, Look at the holdout… for the owner only; a look's figures are the owner's, shown where this browser signed for it", () => {
    const { run } = page();
    const owner = run<string>(`btTrialsHtml(${JSON.stringify(LIST)}, true, {})`);
    expect(owner).toContain("4 runs · 3 distinct strategies tried before the holdout · 1 look at it");
    expect([...owner.matchAll(/data-k="(\d+)"/g)].map((m) => m[1])).toEqual(["5", "4", "2"]);
    expect([...owner.matchAll(/data-bt-act="open" data-id="([^"]+)"/g)].map((m) => m[1])).toEqual([TRIAL(2).run]);
    expect([...owner.matchAll(/data-bt-act="look" data-id="([^"]+)"/g)].map((m) => m[1])).toEqual([TRIAL(4).run, TRIAL(2).run]);
    expect(owner).toContain('<span class="tag warn">Held out</span>');
    expect(owner).toContain(">yours</span>");
    // a viewer who is not the owner: no look offered
    expect(run<string>(`btTrialsHtml(${JSON.stringify(LIST)}, false, {})`)).not.toContain('data-bt-act="look"');
    // the look this browser signed for: its figures, and Open
    const seen = run<string>(`btTrialsHtml(${JSON.stringify(LIST)}, true, ${JSON.stringify({ "20261029T162730-aaaaaaaaaa": { metrics: metrics({ returnPct: 11.88, sharpe: 1.95, maxDrawdownPct: 10.38 }) } })})`);
    expect(seen).toContain('data-bt-act="seen" data-id="20261029T162730-aaaaaaaaaa"');
    expect(seen).toContain("1.95");
    expect(run(`btTrialsHtml(${JSON.stringify({ ...LIST, runs: [] })}, true, {})`)).toContain("No backtest has run on this account yet");
  });

  it("the header says the holdout and its looks — Move… for the owner — and the ledger's state, broken where it broke", () => {
    const { run } = page();
    const h = run<string>(`btHeadHtml(${JSON.stringify(LIST)}, true, "")`);
    expect(h).toContain("Held out from 2026-07-31 · 1 look</span>");
    expect(h).toContain('data-bt-act="holdout">Move…</button>');
    expect(h).toContain("Ledger · 5 rows, intact");
    expect(run<string>(`btHeadHtml(${JSON.stringify(LIST)}, false, "")`)).not.toContain("Move…");
    expect(run<string>(`btHeadHtml(${JSON.stringify({ ...LIST, ledger: { ...LIST.ledger, intact: false, brokenAt: 2, why: "row 2 is not what was written" } })}, true, "")`)).toContain('<span class="chip bad" title="row 2 is not what was written">Ledger broken at row 2</span>');
    expect(run<string>(`btHeadHtml(${JSON.stringify({ ...LIST, holdout: { ok: false, code: "E_ACCOUNT_BAD_ACTION", message: "the holdout file does not read" } })}, true, "")`)).toContain('<span class="chip bad">the holdout file does not read</span>');
  });

  it("a look's answer is kept in this browser, the latest twelve", () => {
    const { run, kept } = page();
    for (let i = 0; i < 14; i++) run(`btKeepLook({ id: "20261029T1200${String(i).padStart(2, "0")}-0000000000", metrics: { returnPct: ${i} } })`);
    const ids = Object.keys(JSON.parse(kept.get("openpaper-backtest-looks")!));
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe("20261029T120002-0000000000");
    expect(run(`btLooks()["20261029T120013-0000000000"].metrics.returnPct`)).toBe(13);
  });
});
