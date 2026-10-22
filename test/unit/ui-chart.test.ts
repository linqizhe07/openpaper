import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { HISTORY_WAIT_MS, PAGE_WAIT_MS } from "../../src/portfolio/service.ts";

/** The chart (ui/chart.js), run as the page runs it: a plain script in one global scope after ui/core.js, here in a vm with a stand-in
 * document and fetch. What is checked is what the owner reads: round ticks on the price axis, the scales the candles are drawn with, the
 * readout's words, the time axis's labels, the last bar moved by a live price stamped inside its interval and by no other, a source's
 * refusal drawn in its own words with no axes, an empty history said quietly, an answer meant for another market or another bar size never
 * drawn, a pointer that moves only the crosshair and writes only the readout (whose box, laid over the plot, never changes a size: the
 * stylesheet is read for that, since a vm lays nothing out), nothing asked while the chart's pane is hidden, a live price that is no longer
 * the venue's word never laid over the source's close, a share's daily bar moved only in its regular session, and what release stops */
const UI = fileURLToPath(new URL("../../src/portfolio/public/ui/", import.meta.url));
// book.js after the chart, as account.html loads them: the chart asks it whether a read reached the account (bkUnanswered)
const FILES = ["core.js", "chart.js", "book.js"];

type Listener = (e: Record<string, unknown>) => void;
/** a stand-in element: what the chart writes into it (innerHTML through paint, attributes, classes, words) is kept to be read; its parts are
 * found by selector (each selector one stand-in, made on first ask); listeners are kept so a test can fire them */
interface Fake {
  sel: string;
  innerHTML: string;
  textContent: string;
  dataset: Record<string, string>;
  style: Record<string, string>;
  isConnected: boolean;
  /** the element's own hidden flag, as the chart sets it (its key back to the newest bar) */
  hidden?: boolean;
  clientWidth: number;
  clientHeight: number;
  attrs: Map<string, string>;
  classes: Set<string>;
  classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean; toggle(c: string, on?: boolean): void };
  querySelector(s: string): Fake;
  querySelectorAll(): Fake[];
  addEventListener(t: string, fn: Listener): void;
  removeEventListener(t: string, fn: Listener): void;
  setAttribute(k: string, v: unknown): void;
  getAttribute(k: string): string | null;
  removeAttribute(k: string): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  /** where set, the element's boxes (none: its pane is hidden); a stand-in without it counts as laid out */
  getClientRects?: () => unknown[];
  contains(): boolean;
  fire(type: string, e?: Record<string, unknown>): void;
  count(type: string): number;
}
function fake(sel = "root", size = { w: 640, h: 360 }): Fake {
  const kids = new Map<string, Fake>();
  const listeners = new Map<string, Set<Listener>>();
  const attrs = new Map<string, string>();
  const classes = new Set<string>();
  const el: Fake = {
    sel,
    innerHTML: "",
    textContent: "",
    dataset: {},
    style: {},
    isConnected: true,
    clientWidth: size.w,
    clientHeight: size.h,
    attrs,
    classes,
    classList: { add: (c) => void classes.add(c), remove: (c) => void classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => void ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)) },
    querySelector: (s) => {
      let k = kids.get(s);
      if (!k) kids.set(s, (k = fake(s, size)));
      return k;
    },
    querySelectorAll: () => [],
    addEventListener: (t, fn) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t, fn) => void listeners.get(t)?.delete(fn),
    setAttribute: (k, v) => void attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    removeAttribute: (k) => void attrs.delete(k),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: size.w, height: size.h }),
    contains: () => true,
    fire: (type, e = {}) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn({ preventDefault() {}, ...e });
    },
    count: (type) => listeners.get(type)?.size ?? 0,
  };
  return el;
}

/** a read's answer, by path: a body at once, or one the test hands over later (`later`). `ro`: a stand-in ResizeObserver whose callbacks
 * the test calls (the vm has none, so the chart falls back to the window's resize) */
type Answer = unknown | Promise<unknown>;
/** a browser's EventSource as ui/stream.js opens one: the test opens it and speaks through it (the account's stream: feat/paper-live p2b) */
class FakeES {
  static all: FakeES[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly heard = new Map<string, Array<(e: { data: string; lastEventId: string }) => void>>();
  constructor(readonly url: string) {
    FakeES.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data: string; lastEventId: string }) => void) {
    this.heard.set(type, [...(this.heard.get(type) ?? []), fn]);
  }
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(type: string, data: unknown) {
    for (const fn of this.heard.get(type) ?? []) fn({ data: JSON.stringify(data), lastEventId: "" });
  }
}
/** `stream`: the account's push channel (ui/stream.js) loaded between core and the chart, over a stand-in EventSource */
function page(answer: (path: string) => Answer = () => new Promise(() => {}), opts: { ro?: boolean; stream?: boolean; size?: { w: number; h: number } } = {}) {
  FakeES.all = [];
  const observers: Array<() => void> = [];
  const asked: string[] = [];
  const element = (): Record<string, unknown> => ({ addEventListener() {}, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, style: {}, hidden: false, innerHTML: "", textContent: "", value: "" });
  const sandbox: Record<string, unknown> = {
    // the document keeps its listeners (a stand-in element), so a test can press a key on the page
    document: Object.assign(fake("document") as unknown as Record<string, unknown>, { getElementById: element, querySelector: () => null, querySelectorAll: () => [], body: element(), documentElement: { dataset: { theme: "cream" } } }),
    location: { hash: "", origin: "http://127.0.0.1:4820" },
    history: { replaceState() {} },
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
    fetch: async (path: string) => {
      asked.push(path);
      const body = await answer(path);
      return { status: (body as { ok?: boolean })?.ok === false ? 409 : 200, statusText: "", json: async () => body };
    },
  };
  if (opts.ro)
    sandbox.ResizeObserver = class {
      constructor(fn: () => void) {
        observers.push(fn);
      }
      observe() {}
      disconnect() {}
    };
  if (opts.stream) Object.assign(sandbox, { EventSource: FakeES, setInterval, clearInterval });
  const ctx = createContext(sandbox);
  sandbox.window = runInContext("globalThis", ctx);
  for (const f of opts.stream ? ["core.js", "stream.js", "chart.js", "book.js"] : FILES) new Script(readFileSync(`${UI}${f}`, "utf8"), { filename: f }).runInContext(ctx);
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  const el = fake("root", opts.size);
  sandbox.EL = el;
  /** the stream started and open (connected); its markets followed as the terminal follows them */
  const connect = () => {
    run("stStart()");
    FakeES.all.at(-1)!.open();
    return FakeES.all.at(-1)!;
  };
  return { run, asked, el, sandbox, observers, connect };
}
const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
/** a read the test answers when it chooses */
function later() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** `n` hourly bars ending with the hour now running (its start `last`), each a little higher than the one before; volume on each */
function hourly(n: number, last = Math.floor(Date.now() / HOUR) * HOUR) {
  return Array.from({ length: n }, (_, k) => {
    const o = 83_000 + k * 10;
    return { t: last - (n - 1 - k) * HOUR, o, h: o + 40, l: o - 30, c: o + 12, v: 5 + k };
  });
}
const candles = (bars: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, venue: "okx", venueName: "OKX", symbol: "BTC/USDT", interval: "1h", candles: bars, ...extra });
/** the foot as the owner reads it: whose bars and what they are, then — at its right, never cut short — how old the last price is */
const footText = (el: Fake) => el.querySelector(".ch-foot").innerHTML.replace(/<span class="ch-fr">/, " · ").replace(/<[^>]+>/g, "");
/** the bar size picked in the head's menu, as a browser hands the change to the frame */
const pickSize = (el: Fake, iv: string) => el.fire("change", { target: { dataset: { chIvsel: "" }, value: iv } });
/** a range pressed in the head */
const pickRange = (el: Fake, r: string) => el.fire("click", { target: { closest: () => ({ dataset: { chR: r } }) } });

describe("the chart's pure parts", () => {
  it("puts five to seven round ticks inside the range, each as its step writes it", () => {
    const p = page();
    expect(p.run("chNiceTicks(81556, 84103, 6)")).toEqual([82000, 82500, 83000, 83500, 84000]);
    expect(p.run("chNiceTicks(92, 208, 6)")).toEqual([100, 120, 140, 160, 180, 200]);
    for (const [lo, hi] of [[0.1234, 0.1299], [99.2, 100.4], [0.00001201, 0.00001288], [3120.5, 3188.25], [55, 62.5], [1, 1], [-3, 4]]) {
      const ticks = p.run<number[]>(`chNiceTicks(${lo}, ${hi}, 6)`);
      expect(ticks.length, `${lo}–${hi}`).toBeGreaterThanOrEqual(5);
      expect(ticks.length, `${lo}–${hi}`).toBeLessThanOrEqual(7);
      const step = ticks[1]! - ticks[0]!;
      // a round step: 1, 2, 2.5 or 5 times a power of ten
      const mant = Number((step / 10 ** Math.floor(Math.log10(step))).toPrecision(6));
      expect([1, 2, 2.5, 5]).toContain(mant);
      // evenly spaced, with no float tails
      for (let k = 1; k < ticks.length; k++) expect(Math.abs(ticks[k]! - ticks[k - 1]! - step)).toBeLessThan(step * 1e-9);
      for (const t of ticks) expect(String(t)).not.toMatch(/0000000|9999999/);
      // inside the range, or at most a step outside it where five did not fit inside
      if (lo !== hi) for (const t of ticks) expect(t >= lo! - step && t <= hi! + step).toBe(true);
    }
    // 4 ticks at 100, 8 at 50: the larger step, and the nearest round price just outside added on the nearer side
    expect(p.run("chNiceTicks(82941, 83359, 6)")).toEqual([82900, 83000, 83100, 83200, 83300]);
    // the scale opens to hold them, a quarter step beyond, so no label sits on the edge
    p.run("globalThis.SC0 = chScale([{ t: 0, o: 83000, h: 83330, l: 82970, c: 83100 }], 300, 300, 0)");
    expect(p.run("SC0.ticks.length")).toBeGreaterThanOrEqual(5);
    expect(p.run("SC0.lo < SC0.ticks[0] && SC0.hi > SC0.ticks[SC0.ticks.length - 1]")).toBe(true);
    expect(p.run("chNiceTicks(NaN, 3, 6)")).toEqual([]);
  });

  it("scales the newest bars that fit: right-aligned slots, an odd body, the price pane above the volume pane, volume on its own scale", () => {
    const p = page();
    const bars = Array.from({ length: 10 }, (_, k) => ({ t: k * HOUR, o: 120, h: k === 4 ? 200 : 150, l: k === 7 ? 100 : 110, c: 130, v: k }));
    p.run(`globalThis.SC = chScale(${JSON.stringify(bars)}, 200, 300, 60)`);
    const sc = (code: string) => p.run(`SC.${code}`);
    // 192 usable pixels, ten bars: each a 16-pixel slot (the most), the history sitting at the right
    expect(sc("from")).toBe(0);
    expect(sc("to")).toBe(10);
    expect(sc("slot")).toBe(16);
    expect(sc("bw")).toBe(11);
    expect(sc("cx(0)")).toBe(40);
    expect(sc("cx(9)")).toBe(184);
    expect(sc("at(184)")).toBe(9);
    expect(sc("at(41)")).toBe(0);
    expect(sc("at(-50)")).toBe(0);
    expect(sc("at(5000)")).toBe(9);
    // 100–200 opened 8% either side; the price pane ends above the volume pane and its gap
    expect(sc("lo")).toBe(92);
    expect(sc("hi")).toBe(208);
    expect(sc("bottom")).toBe(234);
    expect(sc("y(208)")).toBe(0);
    expect(sc("y(92)")).toBe(234);
    expect(sc("y(150)")).toBe(117);
    expect(sc("price(117)")).toBe(150);
    expect(sc("ticks")).toEqual([100, 120, 140, 160, 180, 200]);
    // volume: the highest shown is the pane's height less two; none is no bar
    expect(sc("volTop")).toBe(240);
    expect(sc("vh(9)")).toBe(58);
    expect(sc("vh(0)")).toBe(0);
    // no volume pane: the price pane is the whole height and no volume has a height
    expect(p.run(`chScale(${JSON.stringify(bars)}, 200, 300, 0).bottom`)).toBe(300);
    expect(p.run(`chScale(${JSON.stringify(bars)}, 200, 300, 0).vh(9)`)).toBe(0);
    // three hundred bars at 320 pixels, fitted (no view: a range's first view): every one of them shown, each slot as wide as fits (312 / 300)
    const many = Array.from({ length: 300 }, (_, k) => ({ t: k * HOUR, o: 100, h: k === 0 ? 10_000 : 101, l: 99, c: 100.5 }));
    p.run(`globalThis.SC1 = chScale(${JSON.stringify(many)}, 320, 300, 0)`);
    expect(p.run("SC1.from")).toBe(0);
    expect(p.run("SC1.n")).toBe(300);
    expect(p.run("SC1.slot")).toBeCloseTo(1.04, 9);
    expect(p.run("SC1.bw")).toBe(1);
    // zoomed to five pixels a bar at the newest (a view the owner moved to): only the newest 62 are shown, and a spike in an older one does
    // not stretch the range
    p.run(`globalThis.SC2 = chScale(${JSON.stringify(many)}, 320, 300, 0, 0, { view: { slot: 5, end: 300 } })`);
    expect(p.run("SC2.from")).toBe(238);
    expect(p.run("SC2.n")).toBe(62);
    expect(p.run("SC2.hi")).toBeLessThan(102);
    expect(p.run("SC2.bw")).toBeGreaterThanOrEqual(1);
    expect(p.run("SC2.bw % 2")).toBe(1);
  });

  it("says a bar's open, high, low and close and its change from the close before, signed, in the market's own figures", () => {
    const p = page();
    expect(p.run("chReadout({ o: 83134, h: 84103, l: 81556, c: 81901 }, 83134, chFmt(0, false)).text")).toBe("O 83,134 H 84,103 L 81,556 C 81,901 −1,233.0 (−1.48%)");
    expect(p.run("chReadout({ o: 227.1, h: 228.4, l: 226.9, c: 228.12 }, 227.5, chFmt(2, false)).text")).toBe("O 227.10 H 228.40 L 226.90 C 228.12 +0.62 (+0.27%)");
    // the first bar has nothing before it: no change is said
    expect(p.run("chReadout({ o: 10, h: 11, l: 9, c: 10.5 }, null, chFmt(1, false)).text")).toBe("O 10.0 H 11.0 L 9.0 C 10.5");
    // an event contract's in cents
    expect(p.run("chReadout({ o: 61.5, h: 63, l: 60, c: 60.2 }, 61.5, chFmt(1, true)).text")).toBe("O 61.5¢ H 63.0¢ L 60.0¢ C 60.2¢ −1.3¢ (−2.11%)");
    // the html tints the figures by the bar's direction and the change by its sign; never colour alone (the sign is in the words)
    const html = p.run<string>("chReadout({ o: 83134, h: 84103, l: 81556, c: 81901 }, 83134, chFmt(0, false)).html");
    expect(html).toContain('<span class="ch-v down">81,901</span>');
    expect(html).toContain('<span class="ch-d down">−1,233.0 (−1.48%)</span>');
    expect(p.run("chReadout({ o: 1, h: 1, l: 1, c: 1 }, 1, chFmt(0, false)).text")).toBe("O 1 H 1 L 1 C 1 0.0 (0.00%)");
    // a change under a hundredth of a percent is not "0.00%"
    expect(p.run("chReadout({ o: 81499.99, h: 81511.93, l: 81499.99, c: 81503.78 }, 81499.99, chFmt(2, false)).text")).toBe("O 81,499.99 H 81,511.93 L 81,499.99 C 81,503.78 +3.79 (+0.0047%)");
    // a change too small for the figures is said to two significant figures, never a rounded zero with a sign
    expect(p.run("chReadout({ o: 100, h: 101, l: 99, c: 100.004 }, 100, chFmt(2, false)).text")).toBe("O 100.00 H 101.00 L 99.00 C 100.00 +0.004 (+0.004%)");
    expect(p.run("chReadout({ o: 100, h: 101, l: 99, c: 99.996 }, 100, chFmt(2, false)).text")).toBe("O 100.00 H 101.00 L 99.00 C 100.00 −0.004 (−0.004%)");
    expect(p.run("chReadout({ o: 50, h: 51, l: 49, c: 50.004 }, 50, chFmt(1, true)).text")).toBe("O 50.0¢ H 51.0¢ L 49.0¢ C 50.0¢ +0.004¢ (+0.008%)");
    // each key with its figure, and the change, one unit that does not break across lines
    expect(html).toContain('<span class="ch-kv"><span class="ch-k">O</span> <span class="ch-v down">83,134</span></span>');
  });

  it("carries the market's own precision: its price step's, else its bars' own held to five significant figures; cents for an event", () => {
    const p = page();
    expect(p.run('chDecimals([{ o: 83134.5, h: 83200, l: 83100, c: 83150.5 }], false)')).toBe(1);
    expect(p.run('chDecimals([{ o: 83134.51, h: 83200.123, l: 83100, c: 83150 }], false)')).toBe(2);
    expect(p.run('chDecimals([{ o: 227.52, h: 228, l: 227, c: 227.5 }], false)')).toBe(2);
    expect(p.run('chDecimals([{ o: 0.00001234, h: 0.00001301, l: 0.0000122, c: 0.00001288 }], false)')).toBe(8);
    expect(p.run('chDecimals([{ o: 1, h: 2, l: 1, c: 2 }], false, 0.01)')).toBe(2);
    expect(p.run('chDecimals([{ o: 61.5, h: 62, l: 60, c: 61 }], true)')).toBe(1);
    expect(p.run('chDecimals([], true, 0.01)')).toBe(0);
    expect(p.run('chDecimals([], true, 0.001)')).toBe(1);
    // a step of a cent never rounds the source's half cents away (Polymarket's prices-history: 66.5¢ on a market whose step is 0.01)
    expect(p.run('chDecimals([{ o: 65.5, h: 67.5, l: 65.5, c: 66.5 }], true, 0.01)')).toBe(1);
    expect(p.run('chDecimals([{ o: 66, h: 67, l: 65, c: 66 }], true, 0.01)')).toBe(0);
    // finer bars than the step: their own decimals (held to five significant figures); coarser bars: the step's
    expect(p.run('chDecimals([{ o: 1.234, h: 1.25, l: 1.2, c: 1.2345 }], false, 0.01)')).toBe(4);
    expect(p.run('chDecimals([{ o: 83134.517, h: 83200, l: 83100, c: 83150 }], false, 0.1)')).toBe(2);
    expect(p.run("chFmt(2, false)(1234.5)")).toBe("1,234.50");
    expect(p.run("chFmt(1, true)(62.5)")).toBe("62.5¢");
    expect(p.run("chFmt(2, false)(undefined)")).toBe("—");
  });

  it("labels the time axis by the bar size: HH:MM within a day and the date where one begins; a daily bar's own day", () => {
    const p = page();
    const t0 = Date.UTC(2026, 9, 14, 20);
    const bars = Array.from({ length: 9 }, (_, k) => ({ t: t0 + k * HOUR }));
    const got = p.run<Array<{ i: number; text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(bars)}, "1h", "UTC")`);
    expect(got.map((l) => `${l.text}/${l.rank}`)).toEqual(["21:00/2", "22:00/1", "23:00/1", "15 Oct/4", "01:00/1", "02:00/1", "03:00/2", "04:00/1"]);
    // on 5m bars: the quarter hours are candidates, the full hour ranks above them
    const fives = Array.from({ length: 13 }, (_, k) => ({ t: Date.UTC(2026, 9, 14, 9) + k * 300_000 }));
    expect(p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(fives)}, "5m", "UTC")`).map((l) => `${l.text}/${l.rank}`)).toEqual(["09:15/0.5", "09:30/1", "09:45/0.5", "10:00/2"]);
    // daily bars at Universal midnight: each the day it starts; a new month says its name and ranks above the days (October, a quarter's
    // first month, a little above the others)
    const days = Array.from({ length: 4 }, (_, k) => ({ t: Date.UTC(2026, 8, 29) + k * DAY }));
    const d = p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(days)}, "1d", "UTC")`);
    expect(d.map((l) => l.text)).toEqual(["30 Sept", "Oct", "2 Oct"].map((x) => x.replace("Sept", p.run<string>('new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 30)))'))));
    expect(d.find((l) => l.text === "Oct")!.rank).toBe(6.5);
    expect(d.find((l) => l.text === "2 Oct")!.rank).toBe(1);
    // a share's daily bars stamped at New York's open (13:30 Universal): the day in New York, whatever the viewer's clock
    const shares = [{ t: Date.UTC(2026, 9, 13, 13, 30) }, { t: Date.UTC(2026, 9, 14, 13, 30) }];
    expect(p.run<Array<{ text: string }>>(`chTimeLabels(${JSON.stringify(shares)}, "1d", "Asia/Tokyo")`).map((l) => l.text)).toEqual(["14 Oct"]);
    // the crosshair's time
    expect(p.run(`chWhen(${Date.UTC(2026, 9, 14, 13, 5)}, "1h", "UTC")`)).toBe("Wed 14 Oct 13:05");
    expect(p.run(`chWhen(${Date.UTC(2026, 9, 14)}, "1d", "Asia/Tokyo")`)).toBe("Wed 14 Oct 2026");
    // a daily bar from Hong Kong's (or Tokyo's) midnight in New York's winter is Hong Kong's day, not New York's morning before it; a
    // share's bar at New York's winter open is New York's day
    expect(p.run(`chWhen(${Date.UTC(2026, 0, 14, 16)}, "1d", "UTC")`)).toBe("Thu 15 Jan 2026");
    expect(p.run(`chWhen(${Date.UTC(2026, 6, 14, 16)}, "1d", "UTC")`)).toBe("Wed 15 Jul 2026");
    expect(p.run(`chWhen(${Date.UTC(2026, 0, 14, 15)}, "1d", "UTC")`)).toBe("Thu 15 Jan 2026");
    expect(p.run(`chWhen(${Date.UTC(2026, 0, 15, 14, 30)}, "1d", "Asia/Tokyo")`)).toBe("Thu 15 Jan 2026");
  });

  it("labels hourly bars on a clock half or three quarters of an hour off Universal Time: the bars' own round times, on that clock", () => {
    const p = page();
    const bars = Array.from({ length: 9 }, (_, k) => ({ t: Date.UTC(2026, 9, 14, 0) + k * HOUR }));
    // Kolkata (+5:30): the bars start at 05:30, 06:30 … — each still a candidate, ranked by its place among the bars' own hours
    expect(p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(bars)}, "1h", "Asia/Kolkata")`).map((l) => `${l.text}/${l.rank}`)).toEqual(["06:30/2.5", "07:30/1", "08:30/1", "09:30/2", "10:30/1", "11:30/1", "12:30/3", "13:30/1"]);
    for (const zone of ["Asia/Kathmandu", "Australia/Adelaide", "America/St_Johns"]) {
      const got = p.run<Array<{ text: string }>>(`chTimeLabels(${JSON.stringify(bars)}, "1h", ${JSON.stringify(zone)})`);
      // every bar after the first is a candidate (a time, or the date where a day begins): none left without a label
      expect(got.length, zone).toBe(8);
      expect(got.some((l) => /^\d\d:\d\d$/.test(l.text)), zone).toBe(true);
    }
    // a whole-hour clock is as before: New York's round hours
    expect(p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(bars)}, "1h", "America/New_York")`).map((l) => `${l.text}/${l.rank}`).slice(0, 3)).toEqual(["21:00/2", "22:00/1", "23:00/1"]);
    // 5m bars in Kolkata keep its own quarter hours
    const fives = Array.from({ length: 7 }, (_, k) => ({ t: Date.UTC(2026, 9, 14, 9) + k * 300_000 }));
    expect(p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(fives)}, "5m", "Asia/Kolkata")`).map((l) => `${l.text}/${l.rank}`)).toEqual(["14:45/0.5", "15:00/2.5"]);
  });

  it("takes a share's daily bar to the regular session only: the session the venue says, and the price's own time 09:30–16:00 New York", () => {
    const p = page();
    const at = (h: number, m = 0) => Date.UTC(2026, 9, 14, h, m); // 14 Oct 2026: New York is four hours behind
    expect(p.run(`chRegular({ open: true, phase: "regular" }, ${at(14)})`)).toBe(true);
    expect(p.run(`chRegular({ open: true }, ${at(13, 30)})`)).toBe(true);
    expect(p.run(`chRegular({ open: true }, ${at(13, 29)})`)).toBe(false);
    expect(p.run(`chRegular({ open: true, phase: "regular" }, ${at(20)})`)).toBe(false);
    expect(p.run(`chRegular({ open: false, phase: "after" }, ${at(19)})`)).toBe(false);
    expect(p.run(`chRegular({ open: false, phase: "overnight" }, ${at(14)})`)).toBe(false);
    expect(p.run(`chRegular({ open: false }, ${at(14)})`)).toBe(false);
    expect(p.run(`chRegular(undefined, ${at(14)})`)).toBe(false);
  });

  it("keeps room under the plot's top edge for the readout laid over it: set by the layout's width, never by the bar under the pointer", () => {
    const p = page();
    // four keys with nine-character figures and the change: one line at 600 pixels, two at 300, three at 200
    expect(p.run("chReadoutLines(9, 600)")).toBe(1);
    expect(p.run("chReadoutLines(9, 300)")).toBe(2);
    expect(p.run("chReadoutLines(9, 200)")).toBe(3);
    // a narrow chart's smaller words: three keys a line at 220 pixels, so two lines
    expect(p.run("chReadoutLines(9, 220, true)")).toBe(2);
    const bars = Array.from({ length: 10 }, (_, k) => ({ t: k * HOUR, o: 120, h: 150, l: 110, c: 130 }));
    // without room: 110–150 opened 8%, the highest high 7% under the edge; with 40 pixels kept, the highest high sits at 40
    p.run(`globalThis.S0 = chScale(${JSON.stringify(bars)}, 200, 300, 0); globalThis.S1 = chScale(${JSON.stringify(bars)}, 200, 300, 0, 40)`);
    expect(p.run("S0.y(150)")).toBeLessThan(40);
    expect(Math.round(p.run<number>("S1.y(150)"))).toBe(40);
    // the foot stays where it was: the range opened upward only
    expect(p.run("S1.lo")).toBe(p.run("S0.lo"));
    expect(p.run("S1.y(S1.lo)")).toBeCloseTo(300, 9);
    expect(p.run("S1.price(S1.y(137.5))")).toBeCloseTo(137.5, 9);
    // room already there (a short pane's padding is more than it): nothing opens
    expect(p.run(`chScale(${JSON.stringify(bars)}, 200, 300, 0, 5).hi`)).toBe(p.run("S0.hi"));
  });

  it("moves the last bar with a live price only while the price's time is inside that bar's interval, and never makes a bar", () => {
    const p = page();
    p.run(`globalThis.B = [{ t: 0, o: 10, h: 12, l: 9, c: 11 }, { t: ${HOUR}, o: 11, h: 13, l: 10, c: 12 }]`);
    expect(p.run(`chApplyQuote(B, { price: 14, at: ${HOUR + 60_000} }, ${HOUR})`)).toBe(true);
    expect(p.run("B[1]")).toEqual({ t: HOUR, o: 11, h: 14, l: 10, c: 14 });
    expect(p.run(`chApplyQuote(B, { price: 9.5, at: ${HOUR + 120_000} }, ${HOUR})`)).toBe(true);
    expect(p.run("B[1]")).toEqual({ t: HOUR, o: 11, h: 14, l: 9.5, c: 9.5 });
    // a price stamped in the bar before, or after the last bar's end: nothing moves, no bar is added
    expect(p.run(`chApplyQuote(B, { price: 20, at: ${HOUR - 1} }, ${HOUR})`)).toBe(false);
    expect(p.run(`chApplyQuote(B, { price: 20, at: ${2 * HOUR} }, ${HOUR})`)).toBe(false);
    expect(p.run("B.length")).toBe(2);
    expect(p.run("B[1].c")).toBe(9.5);
    expect(p.run(`chApplyQuote([], { price: 20, at: 0 }, ${HOUR})`)).toBe(false);
  });
});

describe("the chart mounted", () => {
  it("draws the source's bars: candles, volume, both axes, the last price in a tag; the readout on the last bar; whose bars in the foot", async () => {
    const bars = hourly(30);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT" })');
    await settle();
    // a bar size alone (none named: the account's 1h) is asked over the range it is drawn over: a month
    expect(p.asked[0]).toBe("/api/account/candles?venue=okx&symbol=BTC%2FUSDT&interval=1h&range=1M");
    const draw = p.el.querySelector(".ch-draw").innerHTML;
    const live = p.el.querySelector(".ch-live").innerHTML;
    expect(draw).toMatch(/^<svg class="ch-svg" width="640" height="360"/);
    // up candles and their volume (every bar here closes above its open), the grid; the newest candle in the live layer over them
    expect(draw).toMatch(/<path class="ch-cu" d="M\d+ \d+h1v\d+h-1Z/);
    expect(draw).toContain('<path class="ch-cd" d=""/>');
    expect(draw).toMatch(/<path class="ch-vu" d="M/);
    expect(live).toMatch(/^<svg class="ch-svg ch-lsvg" width="640" height="360"/);
    expect(live).toMatch(/<path class="ch-cu" d="M\d+ \d+h1v\d+h-1Z/);
    // the price axis's figures, and the last price: a dashed line and its value in a tag, tinted by the last bar's direction — the live layer
    expect(live).toMatch(/<text class="ch-ax" x="\d+" y="\d+">83,\d00<\/text>/);
    const last = bars[bars.length - 1]!;
    expect(live).toContain('class="ch-last up"');
    expect(live).toContain(`<text class="ch-tagt"`);
    expect(live).toContain(`>${last.c.toLocaleString("en-US")}</text></svg>`);
    expect(live).toContain("BTC/USDT at OKX, 1h bars");
    expect(draw).not.toContain("ch-tagt");
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain(`<span class="ch-v up">${last.c.toLocaleString("en-US")}</span>`);
    expect(footText(p.el)).toMatch(/^OKX · 1h bars · prices in USDT · /);
    // the crosshair is drawn once, hidden until a pointer is over the plot
    expect(p.el.querySelector(".ch-cross").innerHTML).toContain('<g class="ch-xv"');
    expect(p.el.querySelector(".ch-cross").classes.has("on")).toBe(false);
    // the head: the nine ranges, 1M pressed; the bar sizes' menu on 1h; the log switch off
    expect(p.el.innerHTML).toContain('data-ch-r="1M" aria-pressed="true"');
    expect(p.el.innerHTML).toContain('data-ch-r="5Y" aria-pressed="false" data-fk="ch-r:5Y">5Y</button>');
    expect(p.el.innerHTML).toContain('<option value="1h" selected>1h</option>');
    expect(p.el.innerHTML).toContain('<option value="1w">1W</option>');
    expect(p.el.innerHTML).toContain('data-ch-log aria-pressed="false"');
    p.run("chRelease(EL)");
  });

  it("moves the last bar with a live price stamped inside its hour, and a price stamped in the hour before moves nothing", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(24, start);
    const last = bars[bars.length - 1]!;
    const inside = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : { ok: true, quotes: [{ venue: "okx", symbol: "BTC/USDT", market: { price: last.h + 500, quoteAt: new Date(start + 1_000).toISOString() } }] }));
    inside.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot" })');
    await settle();
    // the live price was asked as soon as the bars came, for this one market
    expect(inside.asked).toContain(`/api/account/quotes?pairs=${encodeURIComponent("okx|BTC/USDT")}`);
    expect(inside.run("CH.get(EL).bars.length")).toBe(24);
    expect(inside.run("CH.get(EL).bars.at(-1)")).toEqual({ ...last, c: last.h + 500, h: last.h + 500 });
    // the bar before is the source's, untouched; the tag and the readout say the new close
    expect(inside.run("CH.get(EL).bars.at(-2)")).toEqual(bars[22]);
    expect(inside.el.querySelector(".ch-live").innerHTML).toContain(`>${(last.h + 500).toLocaleString("en-US")}</text></svg>`);
    expect(inside.el.querySelector(".ch-ohlc").innerHTML).toContain(`H</span> <span class="ch-v up">${(last.h + 500).toLocaleString("en-US")}`);
    inside.run("chRelease(EL)");

    const before = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : { ok: true, quotes: [{ venue: "okx", symbol: "BTC/USDT", market: { price: last.h + 500, quoteAt: new Date(start - 1_000).toISOString() } }] }));
    before.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot" })');
    await settle();
    expect(before.asked.some((x) => x.startsWith("/api/account/quotes"))).toBe(true);
    expect(before.run("CH.get(EL).bars.at(-1)")).toEqual(last);
    expect(before.run("CH.get(EL).bars.length")).toBe(24);
    before.run("chRelease(EL)");
  });

  it("asks no live price for bars that ended long ago (a market closed since yesterday), and never adds a bar", async () => {
    const day = Math.floor(Date.now() / DAY) * DAY;
    const bars = Array.from({ length: 5 }, (_, k) => ({ t: day - (6 - k) * DAY, o: 100, h: 102, l: 99, c: 101 }));
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { interval: "1d" }) : { ok: true, quotes: [{ venue: "okx", symbol: "BTC/USDT", market: { price: 150 } }] }));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", interval: "1d" })');
    await settle();
    expect(p.asked.some((x) => x.startsWith("/api/account/quotes"))).toBe(false);
    p.run("chQuote(CH.get(EL))");
    await settle();
    // asked by hand, its unstamped price is now: after the last bar's day, so it moves nothing
    expect(p.run("CH.get(EL).bars.length")).toBe(5);
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(101);
    p.run("chRelease(EL)");
  });

  it("draws an event contract in cents: the axis, the tag and the readout; the live price too", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = [
      { t: start - HOUR, o: 0.6, h: 0.63, l: 0.59, c: 0.615 },
      { t: start, o: 0.615, h: 0.62, l: 0.6, c: 0.61 },
    ];
    const p = page((path) => (path.startsWith("/api/account/candles") ? { ok: true, venue: "kalshi", venueName: "Kalshi", symbol: "KXFED:YES", interval: "1h", candles: bars } : { ok: true, quotes: [{ venue: "kalshi", symbol: "KXFED:YES", market: { price: 0.633 } }] }));
    p.run('chMount(EL, { venue: "kalshi", symbol: "KXFED:YES", kind: "event", quote: "USD", priceStep: 0.001 })');
    await settle();
    const live = p.el.querySelector(".ch-live").innerHTML;
    expect(live).toMatch(/¢<\/text>/);
    // the live price (63.3¢, read now: inside the hour) moved the close and the high
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual({ t: start, o: 61.5, h: 63.3, l: 60, c: 63.3 });
    expect(live).toContain(">63.3¢</text></svg>");
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain("61.5¢");
    expect(footText(p.el)).toContain("prices in cents");
    // no log switch for an event contract's cents
    expect(p.el.innerHTML).not.toContain("data-ch-log");
    p.run("chRelease(EL)");
  });

  it("draws a source's refusal in its own words, escaped, with no axes and no crosshair; an empty history is a quiet line", async () => {
    const p = page(() => ({ ok: false, refusal: { code: "E_VENUE_RAIL_CLOSED", venue: "kalshi", message: "Kalshi publishes no price history for <b>this</b> market." } }));
    p.run('chMount(EL, { venue: "kalshi", symbol: "KXFED:YES", kind: "event" })');
    await settle();
    expect(p.el.querySelector(".ch-draw").innerHTML).toBe('<p class="ch-msg ch-no">Kalshi publishes no price history for &lt;b&gt;this&lt;/b&gt; market.</p>');
    expect(p.el.querySelector(".ch-cross").innerHTML).toBe("");
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toBe("");
    expect(p.el.querySelector(".ch-foot").innerHTML).toBe("");
    // no live price is asked for a chart with no bars
    expect(p.asked.some((x) => x.startsWith("/api/account/quotes"))).toBe(false);
    p.run("chRelease(EL)");

    // a read that never reached the account (core api's { ok: false, error } with the browser's own words): said in the page's words,
    // never the browser's error as it was thrown, with how long the chart now waits before asking again
    const none = page(() => ({ ok: false, error: "fetch failed" }));
    none.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    expect(none.el.querySelector(".ch-draw").innerHTML).toBe('<p class="ch-msg ch-no">No price history: the account is not answering. Asking again every 2 s.</p>');
    none.run("chRelease(EL)");
    // an error the account wrote itself is its own words, said as they are
    const own = page(() => ({ ok: false, error: "The account hit an error answering this; it was recorded." }));
    own.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    expect(own.el.querySelector(".ch-draw").innerHTML).toBe('<p class="ch-msg ch-no">The account hit an error answering this; it was recorded. Asking again every 2 s.</p>');
    own.run("chRelease(EL)");

    const empty = page(() => candles([], { venueName: "OKX <x>" }));
    empty.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    expect(empty.el.querySelector(".ch-draw").innerHTML).toBe('<p class="ch-msg">No 1h bars from OKX &lt;x&gt; for BTC/USDT yet.</p>');
    expect(empty.el.querySelector(".ch-draw").innerHTML).not.toContain("<svg");
    empty.run("chRelease(EL)");
  });

  it("never draws an answer meant for another market or another bar size", async () => {
    const waits = new Map<string, ReturnType<typeof later>>();
    const p = page((path) => {
      if (!path.startsWith("/api/account/candles")) return new Promise(() => {});
      const w = later();
      waits.set(path, w);
      return w.promise;
    });
    const path = (venue: string, symbol: string, interval: string, range = "1M") => `/api/account/candles?${new URLSearchParams({ venue, symbol, interval, range })}`;
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    p.run('chMount(EL, { venue: "kraken", symbol: "ETH/USD" })');
    await settle(2);
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain("Reading the 1h bars");
    waits.get(path("kraken", "ETH/USD", "1h"))!.resolve({ ok: true, venue: "kraken", venueName: "Kraken", symbol: "ETH/USD", interval: "1h", candles: hourly(5).map((b) => ({ ...b, o: 3100, h: 3120, l: 3090, c: 3110 })) });
    await settle();
    expect(p.el.querySelector(".ch-live").innerHTML).toContain("ETH/USD at Kraken, 1h bars");
    // the first market's answer comes late: it is not drawn
    waits.get(path("okx", "BTC/USDT", "1h"))!.resolve(candles(hourly(5)));
    await settle();
    expect(p.el.querySelector(".ch-live").innerHTML).toContain("ETH/USD at Kraken");
    expect(p.el.querySelector(".ch-live").innerHTML).not.toContain("BTC/USDT");

    // another bar size picked while the first is on its way: the menu says it at once, the range stays, and only its answer is drawn
    p.run('chMount(EL, { venue: "okx", symbol: "SOL/USDT", onInterval: (iv) => (globalThis.PICKED = iv) })');
    pickSize(p.el, "5m");
    expect(p.run("PICKED")).toBe("5m");
    expect(p.run("chInterval(EL)")).toBe("5m");
    expect(p.run("chRange(EL)")).toBe("1M");
    expect(p.el.querySelector(".ch-head").innerHTML).toContain('<option value="5m" selected>5m</option>');
    await settle(2);
    waits.get(path("okx", "SOL/USDT", "5m"))!.resolve({ ok: true, venue: "okx", venueName: "OKX", symbol: "SOL/USDT", interval: "5m", candles: hourly(5).map((b) => ({ ...b, o: 150, h: 151, l: 149, c: 150.5 })) });
    await settle();
    expect(p.el.querySelector(".ch-live").innerHTML).toContain("SOL/USDT at OKX, 5m bars");
    waits.get(path("okx", "SOL/USDT", "1h"))!.resolve({ ok: true, venue: "okx", venueName: "OKX", symbol: "SOL/USDT", interval: "1h", candles: hourly(5) });
    await settle();
    expect(p.el.querySelector(".ch-live").innerHTML).toContain("SOL/USDT at OKX, 5m bars");
    expect(p.run("CH.get(EL).bars[0].o")).toBe(150);
    p.run("chRelease(EL)");
  });

  it("draws nothing of a market or a bar size left behind even when its answer lands before the new one's", async () => {
    const waits = new Map<string, ReturnType<typeof later>>();
    const p = page((path) => {
      if (!path.startsWith("/api/account/candles")) return new Promise(() => {});
      const w = later();
      waits.set(path, w);
      return w.promise;
    });
    const path = (venue: string, symbol: string, interval: string, range = "1M") => `/api/account/candles?${new URLSearchParams({ venue, symbol, interval, range })}`;
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    p.run('chMount(EL, { venue: "kraken", symbol: "ETH/USD" })');
    await settle(2);
    // the first market's answer lands while the second's is still on its way: the panel keeps reading
    waits.get(path("okx", "BTC/USDT", "1h"))!.resolve(candles(hourly(5)));
    await settle();
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain("Reading the 1h bars");
    expect(p.el.querySelector(".ch-draw").innerHTML).not.toContain("BTC/USDT");
    expect(p.run("CH.get(EL).bars")).toBe(null);
    waits.get(path("kraken", "ETH/USD", "1h"))!.resolve({ ok: true, venue: "kraken", venueName: "Kraken", symbol: "ETH/USD", interval: "1h", candles: hourly(5) });
    await settle();
    expect(p.el.querySelector(".ch-live").innerHTML).toContain("ETH/USD at Kraken, 1h bars");

    // another bar size picked; the bar size before's answer lands first: still reading the new one
    pickSize(p.el, "1d");
    pickSize(p.el, "5m");
    await settle(2);
    waits.get(path("kraken", "ETH/USD", "1d"))!.resolve({ ok: true, venue: "kraken", venueName: "Kraken", symbol: "ETH/USD", interval: "1d", candles: hourly(5) });
    await settle();
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain("Reading the 5m bars");
    expect(p.run("CH.get(EL).bars")).toBe(null);
    // another range pressed; the range before's answer lands first: still reading the new one, in its own bar size
    pickRange(p.el, "5D");
    expect(p.run("chInterval(EL)")).toBe("5m");
    pickRange(p.el, "1Y");
    await settle(2);
    waits.get(path("kraken", "ETH/USD", "5m", "5D"))!.resolve({ ok: true, venue: "kraken", venueName: "Kraken", symbol: "ETH/USD", interval: "5m", candles: hourly(5) });
    await settle();
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain("Reading the 1D bars");
    expect(p.run("CH.get(EL).bars")).toBe(null);
    p.run("chRelease(EL)");
  });

  it("moves only the crosshair with the pointer: the picture is not drawn again, the readout says the bar under it", async () => {
    const bars = hourly(30);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    const draw = p.el.querySelector(".ch-draw");
    const picture = draw.innerHTML;
    const plot = p.el.querySelector(".ch-plot");
    const cross = p.el.querySelector(".ch-cross");
    const i = p.run<number>("CH.get(EL).L.sc.at(300)");
    const x = p.run<number>(`CH.get(EL).L.sc.cx(${i})`);
    const frame = p.el.innerHTML;
    // every part the pointer and the keys draw into, recorded
    p.run("globalThis.PN = []; globalThis.P0 = paint; paint = (el, html) => (PN.push(el.sel), P0(el, html))");
    plot.fire("pointermove", { clientX: 300, clientY: 100 });
    expect(draw.innerHTML).toBe(picture);
    expect(cross.classes.has("on")).toBe(true);
    expect(cross.querySelector(".ch-xv").attrs.get("transform")).toBe(`translate(${x} 0)`);
    expect(cross.querySelector(".ch-xh").attrs.get("transform")).toBe("translate(0 100)");
    expect(cross.querySelector(".ch-xh").attrs.get("visibility")).toBe("visible");
    expect(cross.querySelector(".ch-xpr").attrs.get("y")).toBe("-9");
    expect(cross.querySelector(".ch-xpt").attrs.get("y")).toBe("4");
    // the price at the pointer in its tag, the bar's time in the other
    expect(cross.querySelector(".ch-xpt").textContent).toBe(p.run<string>("CH.get(EL).L.fmt(CH.get(EL).L.sc.price(100))"));
    expect(cross.querySelector(".ch-xtt").textContent).toBe(p.run<string>(`chWhen(${bars[i]!.t}, "1h")`));
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain(`<span class="ch-v up">${bars[i]!.o.toLocaleString("en-US")}</span>`);
    // at the price pane's top edge: the line where the pointer is, its tag kept whole inside the pane
    plot.fire("pointermove", { clientX: 300, clientY: 2 });
    expect(cross.querySelector(".ch-xh").attrs.get("transform")).toBe("translate(0 2)");
    expect(cross.querySelector(".ch-xpr").attrs.get("y")).toBe("-2");
    expect(cross.querySelector(".ch-xpt").attrs.get("y")).toBe("11");
    // over the volume pane: no price line
    plot.fire("pointermove", { clientX: 300, clientY: 330 });
    expect(cross.querySelector(".ch-xh").attrs.get("visibility")).toBe("hidden");
    expect(draw.innerHTML).toBe(picture);
    // the keys: ← reads the bar before the last
    plot.fire("keydown", { key: "ArrowLeft" });
    plot.fire("keydown", { key: "ArrowLeft" });
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain(`<span class="ch-v up">${bars[28]!.o.toLocaleString("en-US")}</span>`);
    // away: no crosshair, the readout on the last bar again
    plot.fire("pointerleave");
    expect(cross.classes.has("on")).toBe(false);
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain(`<span class="ch-v up">${bars[29]!.o.toLocaleString("en-US")}</span>`);
    expect(draw.innerHTML).toBe(picture);
    // the pointer and the keys wrote into the readout and nothing else: the frame, the head, the foot and the picture are as they were
    expect(new Set(p.run<string[]>("PN"))).toEqual(new Set([".ch-ohlc"]));
    expect(p.el.innerHTML).toBe(frame);
    p.run("chRelease(EL)");
  });

  it("stops on release: no timer, no listener, and an answer that lands afterwards changes nothing", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(10, start);
    const quote = later();
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : quote.promise));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    const plot = p.el.querySelector(".ch-plot");
    expect(plot.count("pointermove")).toBe(1);
    expect(p.el.count("click")).toBe(1);
    expect(p.run("CH.get(EL).timer")).toBeTruthy();
    p.run("globalThis.ST = CH.get(EL)");
    p.run("chRelease(EL)");
    expect(p.run("CH.has(EL)")).toBe(false);
    expect(p.run("ST.alive")).toBe(false);
    expect(p.run("ST.timer")).toBe(0);
    expect(plot.count("pointermove")).toBe(0);
    expect(plot.count("keydown")).toBe(0);
    expect(p.el.count("click")).toBe(0);
    const picture = p.el.querySelector(".ch-draw").innerHTML;
    quote.resolve({ ok: true, quotes: [{ venue: "okx", symbol: "BTC/USDT", market: { price: 99_999, quoteAt: new Date(start + 1_000).toISOString() } }] });
    await settle();
    expect(p.run("ST.bars.at(-1).c")).toBe(bars[9]!.c);
    expect(p.el.querySelector(".ch-draw").innerHTML).toBe(picture);
    // a tick that was already due finds nothing mounted and asks nothing
    const n = p.asked.length;
    p.run("chTick(ST)");
    await settle();
    expect(p.asked.length).toBe(n);
  });

  it("asks nothing while the page is hidden, and asks again at once when it shows", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(hourly(10, start)) : { ok: true, quotes: [] }));
    const doc = p.sandbox.document as Record<string, unknown>;
    const heard: Array<() => void> = [];
    doc.addEventListener = (t: string, fn: () => void) => t === "visibilitychange" && heard.push(fn);
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    // each ask of the live price counted (the page keeps a quote three seconds, so the asks are counted, not the requests)
    p.run("globalThis.QN = 0; globalThis.Q0 = chQuote; chQuote = (s) => (QN++, Q0(s))");
    doc.visibilityState = "hidden";
    p.run("CH.get(EL).quoteWait = 0");
    p.run("clearTimeout(CH.get(EL).timer); chTick(CH.get(EL))");
    await settle();
    expect(p.run("QN")).toBe(0);
    expect(p.run("CH.get(EL).timer")).toBe(0);
    doc.visibilityState = "visible";
    for (const fn of heard) fn();
    await settle();
    expect(p.run("QN")).toBe(1);
    expect(p.run("CH.get(EL).timer")).toBeTruthy();
    p.run("chRelease(EL)");
  });

  it("lays the readout over the plot, out of the flow: the head and the foot are boxes of fixed height, so no word of it moves the plot", async () => {
    // a vm lays nothing out, so the stylesheet itself is read: the readout's box is absolute (its words never size anything), kept while
    // empty; the head and the foot have fixed heights and do not wrap
    const css = readFileSync(`${UI}chart.css`, "utf8");
    const rule = (sel: string) => new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
    expect(rule(".ch-ohlc")).toMatch(/position: absolute;/);
    expect(rule(".ch-ohlc")).toMatch(/pointer-events: none;/);
    expect(rule(".ch-ohlc:empty")).toMatch(/visibility: hidden;/);
    expect(css).not.toMatch(/\.ch-ohlc:empty \{[^}]*display: none/);
    expect(rule(".ch-head")).toMatch(/(^|[ ;])height: \d+px;/);
    expect(rule(".ch-head")).toMatch(/flex-wrap: nowrap;/);
    expect(rule(".ch-foot")).toMatch(/(^|[ ;])height: \d+px;/);
    expect(css).not.toMatch(/\.ch-foot:empty/);

    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(hourly(30)) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    // the frame: the head holds the nine ranges, the seven bar sizes' menu and the log switch; the readout, the hint and the key back to the
    // newest bar (hidden until the view is behind it) are inside the plot, between the picture's two layers and the crosshair
    expect(p.el.innerHTML).toMatch(/<div class="ch-head"><div class="ch-rs"[^>]*>(<button[^>]*>[^<]*<\/button>){9}<\/div><span class="ch-hsep"[^>]*><\/span><span class="ch-ivw"><select[^>]*>(<option[^>]*>[^<]*<\/option>){7}<\/select><\/span><button[^>]*data-ch-log[^>]*>Log<\/button><\/div><div class="ch-plot"[^>]*><div class="ch-draw"><\/div><div class="ch-live"><\/div><div class="ch-lines"><\/div><div class="ch-ohlc"><\/div><p class="ch-hint"[^>]*><\/p><button type="button" class="ch-now" data-ch-now hidden[^>]*>Now →<\/button><div class="ch-cross"/);
    // the hint, like the readout, is out of the flow and kept while empty
    expect(rule(".ch-hint")).toMatch(/position: absolute;/);
    expect(rule(".ch-hint")).toMatch(/pointer-events: none;/);
    expect(rule(".ch-hint:empty")).toMatch(/visibility: hidden;/);
    await settle();
    // its box as wide as the price pane, set by the layout; the price pane keeps room for it under the top edge
    const L = p.run<{ plotW: number; roomTop: number }>("({ plotW: CH.get(EL).L.plotW, roomTop: CH.get(EL).L.roomTop })");
    expect(p.el.querySelector(".ch-ohlc").style.width).toBe(`${L.plotW - 10}px`);
    expect(L.roomTop).toBeGreaterThan(15);
    const highest = Math.max(...hourly(30).map((b) => b.h));
    expect(p.run<number>(`CH.get(EL).L.sc.y(${highest})`)).toBeGreaterThanOrEqual(L.roomTop - 0.5);
    p.run("chRelease(EL)");
  });

  it("asks nothing while its pane is hidden (the plot has no boxes), and asks at once when the pane shows again", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(hourly(10, start)) : { ok: true, quotes: [] }), { ro: true });
    const plot = p.el.querySelector(".ch-plot");
    let boxes: unknown[] = [];
    plot.getClientRects = () => boxes;
    const reads = () => p.asked.filter((x) => x.startsWith("/api/account/candles")).length;
    const quotes = () => p.asked.filter((x) => x.startsWith("/api/account/quotes")).length;
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    // the bars are read once (the picture is ready when the pane shows); no live price is asked
    expect(reads()).toBe(1);
    expect(quotes()).toBe(0);
    // ticks while hidden, the bars two minutes old: nothing asked, the clock kept
    p.run("API.clear(); CH.get(EL).readAt = Date.now() - 120000; clearTimeout(CH.get(EL).timer); chTick(CH.get(EL))");
    await settle();
    expect(reads()).toBe(1);
    expect(quotes()).toBe(0);
    expect(p.run("CH.get(EL).timer")).toBeTruthy();
    // the pane shows: the size observer sees boxes again, and the bars and the live price are asked at once
    boxes = [{}];
    for (const fn of p.observers) fn();
    await settle();
    expect(reads()).toBe(2);
    expect(quotes()).toBe(1);
    expect(p.run("CH.get(EL).timer")).toBeTruthy();
    p.run("chRelease(EL)");
  });

  it("never lays a live price the venue no longer gives, or one older than a read of the bars, over the source's own close", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(10, start);
    const newer = bars.map((b, k) => (k === 9 ? { ...b, c: 81_999.99, h: Math.max(b.h, 81_999.99) } : b));
    const live = (price: number) => ({ ok: true, quotes: [{ venue: "okx", symbol: "BTC/USDT", market: { price, quoteAt: new Date(start + 1_000).toISOString() } }] });
    let q: unknown = live(81_111.11);
    let src = bars;
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(src) : q));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    const close = () => p.run<number>("CH.get(EL).bars.at(-1).c");
    expect(close()).toBe(81_111.11);
    // the bars read again while that price is fresh: it is laid over them (it is newer than any bar the account keeps)
    src = newer;
    p.run("API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(close()).toBe(81_111.11);
    // the venue refuses the price: it is dropped, and the next read of the bars draws the source's own close
    q = { ok: true, quotes: [{ venue: "okx", symbol: "BTC/USDT", refusal: { code: "E_VENUE_REJECTED", message: "no quote just now" } }] };
    p.run("API.clear(); chQuote(CH.get(EL))");
    await settle();
    expect(p.run("CH.get(EL).quote")).toBe(null);
    p.run("API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(close()).toBe(81_999.99);
    expect(p.el.querySelector(".ch-live").innerHTML).toContain(">81,999.99</text></svg>");
    // a price taken a minute before the bars were asked again, and none since: the source's close stands
    q = live(81_500);
    p.run("API.clear(); CH.get(EL).quoteWait = 0; chQuote(CH.get(EL))");
    await settle();
    expect(close()).toBe(81_500);
    p.run("CH.get(EL).quote.readAt = Date.now() - 60000; API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(close()).toBe(81_999.99);
    p.run("chRelease(EL)");
  });

  it("reads the bars again once after the last bar's end, then once a minute — never every thirty seconds for a market whose last bar is old", async () => {
    // a clock the test moves (the page's own read cache follows it too)
    const day = Math.floor(Date.now() / DAY) * DAY;
    const old = Array.from({ length: 5 }, (_, k) => ({ t: day - (6 - k) * DAY, o: 100, h: 102, l: 99, c: 101 }));
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(old, { interval: "1d" }) : { ok: true, quotes: [] }));
    p.run("globalThis.NOW = Date.now(); Date.now = () => NOW");
    const reads = () => p.asked.filter((x) => x.startsWith("/api/account/candles")).length;
    p.run('chMount(EL, { venue: "kalshi", symbol: "KXFED:YES", kind: "event", interval: "1d" })');
    await settle();
    // the five-second clock stopped: the test moves time and polls itself
    p.run("clearTimeout(CH.get(EL).timer)");
    expect(reads()).toBe(1);
    // five minutes in thirty-second steps: read at each minute only (five), never at the half minutes
    for (let k = 0; k < 10; k++) {
      p.run("NOW += 30000; chPoll(CH.get(EL))");
      await settle();
    }
    expect(reads()).toBe(6);
    p.run("chRelease(EL)");

    // a bar that ends twenty seconds after the bars were read: read once more thirty seconds after its end, then a minute after that
    const q = page((path) => (path.startsWith("/api/account/candles") ? candles(fives, { interval: "5m" }) : { ok: true, quotes: [] }));
    q.run("globalThis.NOW = Date.now(); Date.now = () => NOW");
    const t0 = q.run<number>("NOW");
    const fives = Array.from({ length: 6 }, (_, k) => ({ t: t0 + 20_000 - (6 - k) * 300_000, o: 10, h: 11, l: 9, c: 10.5 }));
    const qreads = () => q.asked.filter((x) => x.startsWith("/api/account/candles")).length;
    q.run('chMount(EL, { venue: "okx", symbol: "SOL/USDT", interval: "5m" })');
    await settle();
    q.run("clearTimeout(CH.get(EL).timer)");
    const at: number[] = [];
    for (let k = 1; k <= 11; k++) {
      const n = qreads();
      q.run("NOW += 10000; chPoll(CH.get(EL))");
      await settle();
      if (qreads() > n) at.push(k * 10);
    }
    // the bar ended at +20 s: read again at +50 s (its end and thirty seconds), then at +110 s (a minute after that read)
    expect(at).toEqual([50, 110]);
    q.run("chRelease(EL)");
  });

  it("moves a share's daily bar only with a price from its regular session; its hourly bars with any", async () => {
    const d = new Date();
    let T = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 30);
    if (T > Date.now()) T -= DAY;
    const days = [{ t: T - DAY, o: 200, h: 205, l: 198, c: 204 }, { t: T, o: 204, h: 206, l: 203, c: 205 }];
    const close = async (session: unknown, quoteAt: number, interval = "1d", bars: unknown[] = days) => {
      const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { interval }) : { ok: true, quotes: [{ venue: "alpaca", symbol: "AAPL", market: { price: 210, quoteAt: new Date(quoteAt).toISOString(), ...(session ? { session } : {}) } }] }));
      p.run(`chMount(EL, { venue: "alpaca", symbol: "AAPL", kind: "stock", quote: "USD", interval: "${interval}" })`);
      await settle();
      const c = p.run<number>("CH.get(EL).bars.at(-1).c");
      p.run("chRelease(EL)");
      return c;
    };
    // in the regular session, an hour after New York's open (in summer and in winter alike): the daily bar takes it
    expect(await close({ open: true, phase: "regular" }, T + HOUR)).toBe(210);
    // after-hours, or a stamp outside 09:30–16:00 New York, or no session said: the source's daily bar as it drew it
    expect(await close({ open: false, phase: "after" }, T + 7 * HOUR)).toBe(205);
    expect(await close({ open: true, phase: "regular" }, T + 9 * HOUR)).toBe(205);
    expect(await close({ open: false, phase: "overnight", extendedHours: true }, T + 14 * HOUR)).toBe(205);
    expect(await close(undefined, T + HOUR)).toBe(205);
    // an hourly bar takes an after-hours price: it is that hour's
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    expect(await close({ open: false, phase: "after" }, start + 1_000, "1h", hourly(3, start))).toBe(210);
  });

  it("keeps the source's half cents on an event contract whose step is a cent, and names the source the bars are from", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = [
      { t: start - HOUR, o: 0.655, h: 0.675, l: 0.655, c: 0.665 },
      { t: start, o: 0.665, h: 0.675, l: 0.665, c: 0.665 },
    ];
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "paper-1", venueName: "Paper account · paper", from: "Polymarket" }) : { ok: true, quotes: [] }));
    p.run('chMount(EL, { venue: "paper-1", symbol: "fed-no-change:Yes", kind: "event", quote: "USD", priceStep: 0.01 })');
    await settle();
    expect(p.run("CH.get(EL).dec")).toBe(1);
    expect(p.el.querySelector(".ch-live").innerHTML).toContain(">66.5¢</text></svg>");
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain('O</span> <span class="ch-v up">66.5¢</span>');
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain('H</span> <span class="ch-v up">67.5¢</span>');
    // whose bars: the source the account read for the paper account, not the paper account's own name
    expect(footText(p.el)).toMatch(/^Polymarket · 1h bars · prices in cents · /);
    p.run("chRelease(EL)");
  });

  it("asks a refused read of the bars again later and later — two seconds, doubling, at most a minute apart — each a read of its own, and once a minute once bars come", async () => {
    let refuse = true;
    const p = page((path) => (path.startsWith("/api/account/candles") ? (refuse ? { ok: false, refusal: { code: "E_VENUE_NOT_CONNECTED", message: "Momentum is not connected" } } : candles(hourly(30))) : { ok: true, quotes: [] }));
    p.run("globalThis.NOW = Date.now(); Date.now = () => NOW");
    const reads = () => p.asked.filter((x) => x.startsWith("/api/account/candles")).length;
    p.run('chMount(EL, { venue: "paper-momentum", symbol: "BTC/USD" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    expect(reads()).toBe(1);
    expect(p.run<number>("CH.get(EL).wait")).toBe(2_000);
    // one-second steps for three minutes: read at +2, +6, +14, +30, +62, +122 (each wait doubled, at most a minute), then a minute apart —
    // each asked of the account, never the refusal the page kept
    const at: number[] = [];
    for (let k = 1; k <= 180; k++) {
      const n = reads();
      p.run("NOW += 1000; chPoll(CH.get(EL))");
      await settle(2);
      if (reads() > n) at.push(k);
    }
    expect(at).toEqual([2, 6, 14, 30, 62, 122]);
    expect(p.run<number>("CH.get(EL).wait")).toBe(60_000);
    // the source comes back: bars drawn, the wait gone, read once a minute again
    refuse = false;
    for (let k = 0; k < 60; k++) {
      p.run("NOW += 1000; chPoll(CH.get(EL))");
      await settle(2);
    }
    expect(p.run<number>("CH.get(EL).wait")).toBe(0);
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain("<svg");
    p.run("chRelease(EL)");
  });
});

describe("a paper account's live price is placed by its own moment, never taken as now (feat/paper-live p0)", () => {
  it("one that says no moment moves no bar; one stamped inside the last bar moves it, and the foot says how old it is", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(24, start);
    const last = bars[bars.length - 1]!;
    // a paper account's quote with no moment of its own: a kept listing of unknown age — never stamped as now
    const bare = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "paper-1", venueName: "Paper account", from: "Kraken" }) : { ok: true, quotes: [{ venue: "paper-1", symbol: "BTC/USD", market: { price: last.h + 500 } }] }));
    bare.run("A = { venues: [{ id: 'paper-1', name: 'Paper account', paper: true, connector: 'live:paper' }] }");
    bare.run('chMount(EL, { venue: "paper-1", symbol: "BTC/USD", kind: "spot" })');
    await settle();
    expect(bare.asked.some((x) => x.startsWith("/api/account/quotes"))).toBe(true);
    expect(bare.run("CH.get(EL).bars.at(-1)")).toEqual(last);
    expect(bare.run("CH.get(EL).quote")).toBe(null);
    bare.run("chRelease(EL)");
    // stamped: the moment its venue answered, inside the hour running — the bar moves, and the foot says the price's age
    const at = Math.max(start + 1_000, Date.now() - 47_000);
    const stamped = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "paper-1", venueName: "Paper account", from: "Kraken" }) : { ok: true, quotes: [{ venue: "paper-1", symbol: "BTC/USD", market: { price: last.h + 500, quoteAt: new Date(at).toISOString(), quoteFrom: "Kraken" } }] }));
    stamped.run("A = { venues: [{ id: 'paper-1', name: 'Paper account', paper: true, connector: 'live:paper' }] }");
    stamped.run('chMount(EL, { venue: "paper-1", symbol: "BTC/USD", kind: "spot" })');
    await settle();
    expect(stamped.run("CH.get(EL).bars.at(-1).c")).toBe(last.h + 500);
    const foot = footText(stamped.el);
    expect(foot).toMatch(/^Kraken · 1h bars · /);
    if (Date.now() - at >= 5_000) expect(foot).toMatch(/ · last price \d+ (s|min) old$/);
    stamped.run("chRelease(EL)");
  });

  it("a venue's own paper account (Alpaca paper) answers its market fresh: its unstamped price still moves the last bar", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(24, start);
    const last = bars[bars.length - 1]!;
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "alpaca-paper", venueName: "Alpaca paper" }) : { ok: true, quotes: [{ venue: "alpaca-paper", symbol: "BTC/USD", market: { price: last.h + 500 } }] }));
    p.run("A = { venues: [{ id: 'alpaca-paper', name: 'Alpaca paper', paper: true, connector: 'live:alpaca-paper' }] }");
    p.run('chMount(EL, { venue: "alpaca-paper", symbol: "BTC/USD", kind: "spot" })');
    await settle();
    expect(p.asked.some((x) => x.startsWith("/api/account/quotes"))).toBe(true);
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(last.h + 500);
    expect(p.run("CH.get(EL).quote.price")).toBe(last.h + 500);
    p.run("chRelease(EL)");
  });
});

describe("the price the account's stream pushes, on the bars (feat/paper-live p2b)", () => {
  it("moves the last bar inside its interval — a one-minute bar of the venue's widening its high and low — and, past its end, starts the bar its moment falls in at its own boundary, at the minute's open where the venue sent it; never for a market that keeps sessions, never one between", () => {
    const p = page();
    const bars = () => `[{ t: 0, o: 10, h: 12, l: 9, c: 11 }, { t: ${HOUR}, o: 11, h: 13, l: 10, c: 12 }]`;
    p.run(`globalThis.B = ${bars()}`);
    // inside the last hour: its close, and its high where the price passes it
    expect(p.run(`chApplyTick(B, { price: 13.5, at: ${HOUR + 60_000} }, ${HOUR}, true)`)).toBe(true);
    expect(p.run("B[1]")).toEqual({ t: HOUR, o: 11, h: 13.5, l: 10, c: 13.5 });
    // the venue's one-minute bar inside it: its trades' high and low widen the bar's, the close is the tick's
    expect(p.run(`chApplyTick(B, { price: 13, at: ${HOUR + 120_000}, bar: { t: ${HOUR + 120_000}, o: 13.4, h: 14.2, l: 9.6 } }, ${HOUR}, true)`)).toBe(true);
    expect(p.run("B[1]")).toEqual({ t: HOUR, o: 11, h: 14.2, l: 9.6, c: 13 });
    // nothing new: nothing moved
    expect(p.run(`chApplyTick(B, { price: 13, at: ${HOUR + 130_000} }, ${HOUR}, true)`)).toBe(false);
    // past the end: the next hour started at its boundary, opening at the minute's own open (its first trade), its high and low the minute's
    expect(p.run(`chApplyTick(B, { price: 15, at: ${2 * HOUR + 1_500}, bar: { t: ${2 * HOUR}, o: 14.6, h: 15.1, l: 14.5 } }, ${HOUR}, true)`)).toBe(true);
    expect(p.run("B.length")).toBe(3);
    expect(p.run("B[2]")).toEqual({ t: 2 * HOUR, o: 14.6, h: 15.1, l: 14.5, c: 15 });
    // no minute bar for it: it opens at the tick, and carries no volume of its own
    p.run(`globalThis.B = ${bars()}`);
    expect(p.run(`chApplyTick(B, { price: 15, at: ${2 * HOUR + 1_500} }, ${HOUR}, true)`)).toBe(true);
    expect(p.run("B[2]")).toEqual({ t: 2 * HOUR, o: 15, h: 15, l: 15, c: 15 });
    // a tick hours after the last bar: the hour it falls in, no bar between (nothing this page heard traded there)
    p.run(`globalThis.B = ${bars()}`);
    expect(p.run(`chApplyTick(B, { price: 15, at: ${4 * HOUR + 600_000} }, ${HOUR}, true)`)).toBe(true);
    expect(p.run("B.map((b) => b.t)")).toEqual([0, HOUR, 4 * HOUR]);
    // a market that keeps sessions (not `opens`): past the end nothing is started; a tick before the last bar moves nothing
    p.run(`globalThis.B = ${bars()}`);
    expect(p.run(`chApplyTick(B, { price: 15, at: ${2 * HOUR + 1_500} }, ${HOUR}, false)`)).toBe(false);
    expect(p.run(`chApplyTick(B, { price: 15, at: ${HOUR - 1} }, ${HOUR}, true)`)).toBe(false);
    expect(p.run("B.length")).toBe(2);
    expect(p.run(`chApplyTick([], { price: 15, at: 0 }, ${HOUR}, true)`)).toBe(false);
  });

  it("moves the last bar with each pushed price as it comes and says the price is live in the foot; reads the live price only once in thirty seconds while it comes, every five again once it stops; counts how long each drawn took to reach the screen", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(24, start);
    const last = bars[bars.length - 1]!;
    // the read of the live price answers with the source's price as it stood at the hour's start: older than every pushed one
    const read = { ok: true, quotes: [{ venue: "paper-1", symbol: "BTC/USD", market: { price: last.c, quoteAt: new Date(start + 1_000).toISOString(), quoteFrom: "Kraken" } }] };
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "paper-1", venueName: "Paper account", from: "Kraken" }) : read), { stream: true });
    const es = p.connect();
    p.run("stFollow(['paper-1:BTC/USD'])");
    p.run('chMount(EL, { venue: "paper-1", symbol: "BTC/USD", kind: "spot", quote: "USD" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer); globalThis.NOW = Date.now(); Date.now = () => NOW");
    const quotes = () => p.asked.filter((x) => x.startsWith("/api/account/quotes")).length;
    let seq = 100;
    // each quote's best bid and ask at a moment of the venue's own a millisecond after the last's (priceAt)
    const push = (price: number, extra: Record<string, unknown> = {}) => es.say("quote", { key: "paper-1:BTC/USD", venue: "paper-1", symbol: "BTC/USD", source: "kraken", bid: price - 0.5, ask: price + 0.5, last: price, at: new Date(p.run<number>("NOW") - 40).toISOString(), priceAt: new Date(p.run<number>("NOW") - 200 + seq).toISOString(), seenAt: new Date(p.run<number>("NOW") - 10).toISOString(), from: "Kraken · live", live: true, seq: ++seq, ...extra });
    push(last.h + 300);
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual({ ...last, c: last.h + 300, h: last.h + 300 });
    expect(p.el.querySelector(".ch-live").innerHTML).toContain(`>${(last.h + 300).toLocaleString("en-US")}</text></svg>`);
    expect(footText(p.el)).toMatch(/^Kraken · 1h bars · prices in USD · .* · last price live$/);
    // drawn — the market's first quote on the stream, its word on it as it stands: not counted (ui/stream.js stDrawn)
    expect(p.run("stLag()")).toBeNull();
    // the same message again moves nothing; a lower price moves the close and the low
    push(last.l - 100, { seq });
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(last.h + 300);
    push(last.l - 100);
    expect(p.run("CH.get(EL).bars.at(-1)")).toMatchObject({ c: last.l - 100, l: last.l - 100, h: last.h + 300 });
    // drawn: counted, from its venue's own moment to the screen
    expect(p.run<{ n: number }>("stLag()").n).toBe(1);
    // the five-second rounds while the pushes come: the live price read once in thirty seconds, never every five
    const before = quotes();
    for (let k = 0; k < 6; k++) {
      p.run("NOW += 5000; chPoll(CH.get(EL))");
      push(last.c + k);
      await settle();
    }
    expect(quotes() - before).toBe(1);
    // the pushes stop: past ten seconds, read every five again
    p.run("NOW += 11000; chPoll(CH.get(EL))");
    await settle();
    const n = quotes();
    p.run("NOW += 5000; chPoll(CH.get(EL))");
    await settle();
    expect(quotes() - n).toBe(1);
    // the stream says the market is not live: nothing moves, and once its last word is a while old the foot says how old
    push(last.c + 999, { live: false });
    expect(p.run("CH.get(EL).bars.at(-1).c")).not.toBe(last.c + 999);
    p.run("CH.get(EL).quote.seen = NOW - 12000; chFootAgain(CH.get(EL))");
    expect(footText(p.el)).toMatch(/ · last price 12 s old$/);
    p.run("chRelease(EL); stClose()");
  });

  it("never starts a bar from a pushed quote — its best bid and ask moved past the boundary, its last trade from before it — and starts the next from the first pushed trade at or past the last bar's end, reads the bars again thirty seconds after, and reconciles: the source's own bar stands where it has one, the bar started here is kept only while it has none yet", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(10, start);
    let src: unknown[] = bars;
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(src) : { ok: true, quotes: [] }), { stream: true });
    const es = p.connect();
    p.run("stFollow(['okx:BTC/USDT'])");
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer); globalThis.NOW = Date.now(); Date.now = () => NOW");
    const next = start + HOUR;
    const at = (ms: number) => new Date(ms).toISOString();
    // the first quote past the hour's end — its best bid and ask the venue's word after the boundary, the last trade it carries one from
    // before it (nothing traded since): nothing is started, and the hour that ended is not moved by it either
    es.say("quote", { venue: "okx", symbol: "BTC/USDT", source: "okx", bid: 83_500, ask: 83_501, last: 83_500.5, at: at(next + 400), seenAt: at(next + 450), from: "OKX · live", live: true, seq: 7 });
    expect(p.run("CH.get(EL).bars.length")).toBe(10);
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual(bars.at(-1));
    expect(p.run("CH.get(EL).local")).toBe(0);
    // the trades the stream says, its latest newest first: one from before the boundary (a subscription's snapshot sent again) moves the
    // hour it traded in, and starts nothing
    es.say("trades", { key: "okx:BTC/USDT", venue: "okx", symbol: "BTC/USDT", source: "okx", trades: [{ price: 83_499, size: 0.1, side: "buy", at: at(next - 2_000) }], live: true });
    expect(p.run("CH.get(EL).bars.length")).toBe(10);
    expect(p.run("CH.get(EL).bars.at(-1)")).toMatchObject({ t: start, c: 83_499, h: 83_499 });
    // the first trade past the end: the next hour started at its boundary, opening at that trade, the one after it moving it — the trade
    // from before the boundary said again with them laid on nothing
    es.say("trades", { key: "okx:BTC/USDT", venue: "okx", symbol: "BTC/USDT", source: "okx", trades: [{ price: 83_502, size: 0.2, at: at(next + 900) }, { price: 83_501, size: 0.1, at: at(next + 600) }, { price: 83_499, size: 0.1, side: "buy", at: at(next - 2_000) }], live: true });
    expect(p.run("CH.get(EL).bars.length")).toBe(11);
    expect(p.run("CH.get(EL).bars.at(-2)")).toMatchObject({ t: start, c: 83_499 });
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual({ t: next, o: 83_501, h: 83_502, l: 83_501, c: 83_502 });
    expect(p.run("CH.get(EL).local")).toBe(next);
    expect(p.run("CH.get(EL).reconcileAt")).toBe(next + 30_000);
    // the same trades said again lay nothing new; a quote inside the bar now standing moves its close to its last trade
    es.say("trades", { key: "okx:BTC/USDT", venue: "okx", symbol: "BTC/USDT", source: "okx", trades: [{ price: 83_502, size: 0.2, at: at(next + 900) }, { price: 83_501, size: 0.1, at: at(next + 600) }], live: true });
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual({ t: next, o: 83_501, h: 83_502, l: 83_501, c: 83_502 });
    es.say("quote", { venue: "okx", symbol: "BTC/USDT", source: "okx", bid: 83_503, ask: 83_504, last: 83_503.5, at: at(next + 1_200), seenAt: at(next + 1_200), from: "OKX · live", live: true, seq: 8 });
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual({ t: next, o: 83_501, h: 83_503.5, l: 83_501, c: 83_503.5 });
    // read again: the source has no bar for that hour yet — the one started here is kept after its bars
    p.run("API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(11);
    expect(p.run("CH.get(EL).bars.at(-1).t")).toBe(next);
    // thirty seconds after its start the bars are read again (once), and the source's own bar for the hour now stands in its place
    src = [...bars, { t: next, o: 83_490, h: 83_520, l: 83_480, c: 83_499, v: 3 }];
    p.run(`NOW = ${next + 31_000}; CH.get(EL).readAt = ${next + 1_000}; API.clear(); chPoll(CH.get(EL))`);
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(11);
    // the source's bar, with the live price still laid over it (fresh: read after it)
    expect(p.run("CH.get(EL).bars.at(-1)")).toMatchObject({ t: next, o: 83_490, h: 83_520, l: 83_480, v: 3 });
    expect(p.run("CH.get(EL).local")).toBe(0);
    expect(p.run("CH.get(EL).reconcileAt")).toBe(0);
    // a share's daily bar is never moved by a pushed price (it keeps its regular session, which the stream does not say)
    const d = page((path) => (path.startsWith("/api/account/candles") ? candles([{ t: Math.floor(Date.now() / DAY) * DAY, o: 200, h: 205, l: 198, c: 204 }], { interval: "1d" }) : { ok: true, quotes: [] }), { stream: true });
    const des = d.connect();
    d.run('chMount(EL, { venue: "alpaca", symbol: "AAPL", kind: "stock", interval: "1d" })');
    await settle();
    des.say("quote", { venue: "alpaca", symbol: "AAPL", last: 210, at: new Date().toISOString(), live: true, seq: 1 });
    des.say("trades", { venue: "alpaca", symbol: "AAPL", trades: [{ price: 211, size: 1, at: new Date().toISOString() }], live: true });
    expect(d.run("CH.get(EL).bars.at(-1).c")).toBe(204);
    d.run("chRelease(EL); stClose()");
    p.run("chRelease(EL); stClose()");
  });

  it("draws a perpetual's bars at its trades: a pushed quote moves the close to its last trade, never to the middle of its book or its mark — and one with no trade said yet moves nothing and leaves the live price read on its beat", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(6, start);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "paper-1", venueName: "Paper account", from: "Hyperliquid" }) : new Promise(() => {})), { stream: true });
    const es = p.connect();
    p.run("stFollow(['paper-1:BTC-PERP'])");
    p.run('chMount(EL, { venue: "paper-1", symbol: "BTC-PERP", kind: "perp", quote: "USDC" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const now = () => new Date().toISOString();
    // the mark and the book only (no trade said yet on this subscription)
    es.say("quote", { venue: "paper-1", symbol: "BTC-PERP", source: "hyperliquid", bid: 83_100, ask: 83_102, mark: 83_101.5, at: now(), seenAt: now(), from: "Hyperliquid · live", live: true, seq: 1 });
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual(bars.at(-1));
    expect(p.run("CH.get(EL).pushLive")).toBe(false);
    es.say("quote", { venue: "paper-1", symbol: "BTC-PERP", source: "hyperliquid", bid: 83_100, ask: 83_102, mark: 83_101.5, last: 83_095, at: now(), seenAt: now(), from: "Hyperliquid · live", live: true, seq: 2 });
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(83_095);
    expect(p.run("CH.get(EL).pushLive")).toBe(true);
    p.run("chRelease(EL); stClose()");
  });

  it("moves a share's intraday bar at its pushed real-time quote (feat/paper-live phase 3) — Robinhood's, which says no trade, at the middle of its bid and ask, as its line prices it; Nasdaq's at its last trade", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(6, start);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "paper-1", venueName: "Paper account", from: "US stocks" }) : new Promise(() => {})), { stream: true });
    const es = p.connect();
    p.run("stFollow(['paper-1:AAPL'])");
    p.run('chMount(EL, { venue: "paper-1", symbol: "AAPL", kind: "stock", quote: "USD", interval: "1h" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const now = () => new Date().toISOString();
    es.say("quote", { key: "paper-1:AAPL", venue: "paper-1", symbol: "AAPL", source: "cboe", bid: 342.4, ask: 342.6, at: now(), priceAt: now(), seenAt: now(), from: "Robinhood · real time", delayMs: 0, everyMs: 15_000, live: true, seq: 1 });
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(342.5);
    expect(p.run("CH.get(EL).pushLive")).toBe(true);
    expect(p.run("CH.get(EL).quote.from")).toBe("Robinhood · real time");
    es.say("quote", { key: "paper-1:AAPL", venue: "paper-1", symbol: "AAPL", source: "cboe", bid: 342.6, ask: 342.8, last: 342.71, at: now(), seenAt: now(), from: "Nasdaq · real time", delayMs: 0, askedEveryMs: 5_000, live: true, seq: 2 });
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(342.71);
    p.run("chRelease(EL); stClose()");
  });

  it("takes the pushed prices of a stream that started again (a snapshot: the account restarted, its stream's seqs counting from the start) however low their seq — and reads the live price on its beat until one comes", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(6, start);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})), { stream: true });
    const es = p.connect();
    p.run("stFollow(['okx:BTC/USDT'])");
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const q = (last: number, seq: number) => ({ venue: "okx", symbol: "BTC/USDT", source: "okx", bid: last - 1, ask: last + 1, last, at: new Date().toISOString(), seenAt: new Date().toISOString(), from: "OKX · live", live: true, seq });
    es.say("quote", q(83_200, 500_000));
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(83_200);
    // the account restarted: the stream's snapshot, then its new hub's quotes from seq 1 again
    es.say("snapshot", { orders: [] });
    expect(p.run("CH.get(EL).pushLive")).toBe(false);
    expect(p.run("chPushedNow(CH.get(EL))")).toBe(false);
    es.say("quote", q(83_210, 3));
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(83_210);
    expect(p.run("CH.get(EL).pushLive")).toBe(true);
    // the stream dropped and came back: likewise
    es.say("quote", q(83_220, 9));
    es.onerror?.();
    expect(p.run("CH.get(EL).pushLive")).toBe(false);
    es.open();
    es.say("quote", q(83_230, 4));
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(83_230);
    p.run("chRelease(EL); stClose()");
  });
});

const MIN = 60_000;
/** each bar size's length, as the chart counts it */
const IV_MS: Record<string, number> = { "1m": MIN, "5m": 5 * MIN, "15m": 15 * MIN, "1h": HOUR, "4h": 4 * HOUR, "1d": DAY, "1w": 7 * DAY };
/** `n` bars of `ms` each ending with the one now running (its start `last`), a little higher each, volume on each */
function series(n: number, ms: number, last = Math.floor(Date.now() / ms) * ms) {
  return Array.from({ length: n }, (_, k) => {
    const o = 83_000 + k;
    return { t: last - (n - 1 - k) * ms, o, h: o + 4, l: o - 3, c: o + 1, v: 1 + (k % 7) };
  });
}
/** the view as the layout drew it: its slot, its right edge, the bars shown, the slots in all */
const viewOf = (p: ReturnType<typeof page>) => p.run<{ slot: number; end: number; from: number; to: number; total: number }>("(({ sc }) => ({ slot: sc.slot, end: sc.end, from: sc.from, to: sc.to, total: sc.total }))(CH.get(EL).L)");

describe("long history, fetched on demand (feat/paper-live phase H)", () => {
  it("stands each bar in its own slot: the minutes a source has no bars for left empty (twelve at most, a longer hole with a break line), the source's own words for a stretch, a share's nights and weekends stepped over with a break line, its closed days no hole at all", () => {
    const p = page();
    const t0 = Date.UTC(2026, 9, 14, 12);
    const coin = [0, 1, 4, 5, 26].map((k) => ({ t: t0 + k * MIN }));
    type Slots = { pos: number[]; total: number; holes: Array<{ i: number; a: number; b: number; why: string; brk: boolean }>; ext: boolean };
    const sl = p.run<Slots>(`chSlots(${JSON.stringify(coin)}, 60000, { none: "No 1-minute bar from OKX here" })`);
    // two minutes missing: two empty slots; twenty missing: twelve, and a break line
    expect(sl.pos).toEqual([0, 1, 4, 5, 18]);
    expect(sl.total).toBe(19);
    expect(sl.holes.map((h) => [h.i, h.a, h.b, h.brk])).toEqual([[2, 2, 4, false], [4, 6, 18, true]]);
    expect(sl.holes[0]!.why).toBe("No 1-minute bar from OKX here");
    // the source's own words for a stretch it said it has none of
    const said = p.run<Slots>(`chSlots(${JSON.stringify(coin)}, 60000, { gaps: [{ from: ${t0 + 2 * MIN}, to: ${t0 + 4 * MIN}, why: "No trades at OKX" }] })`);
    expect(said.holes.map((h) => h.why)).toEqual(["No trades at OKX", "No bars from the source here"]);
    // a share's five-minute bars: Friday's last after-hours bars, then Monday's pre-market — a break and no empty slot; a bar missing inside
    // a session — an empty slot; bars outside 09:30–16:00 New York: they hold the pre-market and after-hours
    const fri = Date.UTC(2026, 9, 16, 23, 55);
    const mon = Date.UTC(2026, 9, 19, 8, 0);
    const share = [fri - 5 * MIN, fri, mon, mon + 5 * MIN, mon + 15 * MIN].map((t) => ({ t }));
    const st = p.run<Slots>(`chSlots(${JSON.stringify(share)}, 300000, { sessions: true, gaps: [{ from: ${fri + 5 * MIN}, to: ${mon}, why: "No overnight data" }] })`);
    expect(st.pos).toEqual([0, 1, 2, 3, 5]);
    expect(st.holes).toMatchObject([{ i: 2, a: 2, b: 2, why: "No overnight data", brk: true }, { i: 4, a: 4, b: 5, brk: false }]);
    expect(st.ext).toBe(true);
    // its daily bars: a weekend is no hole; a coin's daily bars: two missing days are two empty slots
    const days = [Date.UTC(2026, 9, 16, 13, 30), Date.UTC(2026, 9, 19, 13, 30)].map((t) => ({ t }));
    expect(p.run<Slots>(`chSlots(${JSON.stringify(days)}, 86400000, { sessions: true })`)).toMatchObject({ pos: [0, 1], holes: [], ext: false });
    const coinDays = [Date.UTC(2026, 9, 14), Date.UTC(2026, 9, 17)].map((t) => ({ t }));
    expect(p.run<Slots>(`chSlots(${JSON.stringify(coinDays)}, 86400000)`)).toMatchObject({ pos: [0, 3], holes: [{ a: 1, b: 3, brk: false }] });
  });

  it("scales by slots: a bar after a hole stands past its empty slots and the column over the hole reads the bar before it; a view shows only what is in it; a log scale puts equal ratios at equal heights, its ticks round figures thinned to fit", () => {
    const p = page();
    const bars = Array.from({ length: 10 }, (_, k) => ({ t: k * HOUR, o: 100, h: 110, l: 90, c: 105 }));
    const pos = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12];
    p.run(`globalThis.SL = chScale(${JSON.stringify(bars)}, 200, 300, 0, 0, { pos: ${JSON.stringify(pos)} })`);
    // thirteen slots fitted into 192 pixels
    expect(p.run("SL.total")).toBe(13);
    expect(p.run<number>("SL.slot")).toBeCloseTo(192 / 13, 9);
    expect(p.run<number>("SL.cx(5) - SL.cx(4)")).toBeGreaterThanOrEqual(Math.floor((4 * 192) / 13));
    const xHole = p.run<number>("Math.floor(SL.xOf(6.5))");
    expect(p.run(`SL.slotAt(${xHole})`)).toBe(6);
    expect(p.run(`SL.at(${xHole})`)).toBe(4);
    // a view twenty pixels a slot ending at slot 10: the bars whose middles are in it
    p.run(`globalThis.V = chScale(${JSON.stringify(bars)}, 200, 300, 0, 0, { pos: ${JSON.stringify(pos)}, view: { slot: 20, end: 10 } })`);
    expect(p.run("[V.from, V.to]")).toEqual([0, 7]);
    // log: 100 to 10,000
    const wide = [{ t: 0, o: 100, h: 120, l: 100, c: 110 }, { t: HOUR, o: 1000, h: 10_000, l: 900, c: 9_000 }];
    p.run(`globalThis.LG = chScale(${JSON.stringify(wide)}, 300, 400, 0, 0, { log: true })`);
    expect(p.run("LG.log")).toBe(true);
    expect(p.run<number>("LG.y(100) - LG.y(1000)")).toBeCloseTo(p.run<number>("LG.y(1000) - LG.y(10000)"), 6);
    expect(p.run<number>("LG.price(LG.y(2500))")).toBeCloseTo(2500, 6);
    const ticks = p.run<number[]>("LG.ticks");
    expect(ticks).toEqual(expect.arrayContaining([100, 1000, 10000]));
    for (let k = 1; k < ticks.length; k++) expect(p.run<number>(`LG.y(${ticks[k - 1]}) - LG.y(${ticks[k]})`)).toBeGreaterThanOrEqual(30);
    // the same prices straight: 1,000 to 10,000 is ten times as tall as 100 to 1,000
    p.run(`globalThis.LN = chScale(${JSON.stringify(wide)}, 300, 400, 0, 0)`);
    expect(p.run<number>("(LN.y(1000) - LN.y(10000)) / (LN.y(100) - LN.y(1000))")).toBeCloseTo(10, 6);
    // a price at zero has no logarithm: the scale stays straight; within a factor of three, round ticks as on a straight scale
    expect(p.run(`chScale(${JSON.stringify([{ t: 0, o: 0, h: 1, l: 0, c: 1 }])}, 300, 400, 0, 0, { log: true }).log`)).toBe(false);
    expect(p.run("chLogTicks(80000, 90000, 400)")).toEqual([80000, 82000, 84000, 86000, 88000, 90000]);
    expect(p.run("chLogTicks(100, 120000, 400)")).toEqual([100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]);
  });

  it("labels time from minutes to years: a year by its number, a month by its name (a quarter's first a little above), a day by its date, every five minutes on 1-minute bars — and the labels kept never touch", () => {
    const p = page();
    const mon = Date.UTC(2021, 9, 18);
    const weeks = Array.from({ length: 262 }, (_, k) => ({ t: mon + k * 7 * DAY, o: 1, h: 1, l: 1, c: 1 }));
    const w = p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(weeks)}, "1w", "UTC")`);
    expect(w.filter((l) => l.rank === 8).map((l) => l.text)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
    expect(w.find((l) => l.text === "Apr")!.rank).toBe(6.5);
    expect(w.find((l) => l.text === "May")!.rank).toBe(6);
    expect(w.find((l) => l.text === "25 Oct")!.rank).toBe(1);
    // five years of weeks 600 pixels wide: every year kept, no two labels closer than twelve pixels edge to edge, none past the edges
    p.run(`globalThis.SW = chScale(${JSON.stringify(weeks)}, 600, 300)`);
    const kept = p.run<Array<{ x: number; half: number; text: string }>>(`chThin(chTimeLabels(${JSON.stringify(weeks)}, "1w", "UTC"), SW.cx, 600)`);
    expect(kept.filter((l) => /^\d{4}$/.test(l.text)).length).toBe(5);
    for (let k = 1; k < kept.length; k++) expect(kept[k]!.x - kept[k - 1]!.x).toBeGreaterThanOrEqual(kept[k]!.half + kept[k - 1]!.half + 12);
    for (const l of kept) {
      expect(l.x - l.half).toBeGreaterThanOrEqual(0);
      expect(l.x + l.half).toBeLessThanOrEqual(600);
    }
    // a month of hourly bars 400 pixels wide: the days too close for all their dates — no time of day squeezed in among the ones drawn;
    // two days of them 600 wide: the dates and their round hours
    const hours = Array.from({ length: 24 * 30 }, (_, k) => ({ t: Date.UTC(2026, 8, 17) + k * HOUR, o: 1, h: 1, l: 1, c: 1 }));
    p.run(`globalThis.SH = chScale(${JSON.stringify(hours)}, 400, 300)`);
    const month = p.run<Array<{ text: string }>>(`chThin(chTimeLabels(${JSON.stringify(hours)}, "1h", "UTC"), SH.cx, 400)`);
    expect(month.some((l) => /^\d\d:\d\d$/.test(l.text))).toBe(false);
    expect(month.map((l) => l.text)).toContain("Oct");
    const two = hours.slice(0, 48);
    p.run(`globalThis.S2 = chScale(${JSON.stringify(two)}, 600, 300)`);
    const both = p.run<Array<{ text: string }>>(`chThin(chTimeLabels(${JSON.stringify(two)}, "1h", "UTC"), S2.cx, 600)`).map((l) => l.text);
    expect(both).toContain(`18 ${p.run<string>("CH_MON[8]")}`);
    expect(both.some((l) => /^\d\d:\d\d$/.test(l))).toBe(true);
    // an hour of minutes: every five a candidate, the half hour above the quarters, the hour above all
    const mins = Array.from({ length: 61 }, (_, k) => ({ t: Date.UTC(2026, 9, 14, 9) + k * MIN }));
    const m = p.run<Array<{ text: string; rank: number }>>(`chTimeLabels(${JSON.stringify(mins)}, "1m", "UTC")`);
    expect(m.length).toBe(12);
    expect(m.map((l) => `${l.text}/${l.rank}`).filter((x) => /\/(1|1\.5|2)$/.test(x))).toEqual(["09:15/1", "09:30/1.5", "09:45/1", "10:00/2"]);
    // a new year inside intraday bars says the year
    const eve = Array.from({ length: 3 }, (_, k) => ({ t: Date.UTC(2026, 11, 31, 23) + k * HOUR }));
    expect(p.run<Array<{ text: string }>>(`chTimeLabels(${JSON.stringify(eve)}, "1h", "UTC")`).map((l) => l.text)).toEqual(["2027", "01:00"]);
    // the crosshair says a weekly bar's day with its year
    expect(p.run(`chWhen(${mon}, "1w", "UTC")`)).toBe("Mon 18 Oct 2021");
  });

  it("starts a bar where its market's clock starts one: Universal days, four hours and Monday weeks for a coin; New York's four-hour buckets from 04:00, its 09:30 day and its Monday's week for a share, in summer and in winter", () => {
    const p = page();
    const at = (t: number, iv: string, clock: string) => new Date(p.run<number>(`chBarStart(${t}, "${iv}", "${clock}")`)).toISOString();
    expect(at(Date.UTC(2026, 9, 15, 7, 20), "1d", "utc")).toBe("2026-10-15T00:00:00.000Z");
    expect(at(Date.UTC(2026, 9, 15, 7, 20), "4h", "utc")).toBe("2026-10-15T04:00:00.000Z");
    expect(at(Date.UTC(2026, 9, 15, 7, 20), "1w", "utc")).toBe("2026-10-12T00:00:00.000Z");
    // 09:10 New York in summer (EDT) and in winter (EST): the 08:00 bucket
    expect(at(Date.UTC(2026, 9, 14, 13, 10), "4h", "new-york")).toBe("2026-10-14T12:00:00.000Z");
    expect(at(Date.UTC(2026, 0, 14, 14, 10), "4h", "new-york")).toBe("2026-01-14T13:00:00.000Z");
    // the day a share's moment is in New York (22:10 on the 14th there), stamped at its open; its week at its Monday's open
    expect(at(Date.UTC(2026, 9, 15, 2, 10), "1d", "new-york")).toBe("2026-10-14T13:30:00.000Z");
    expect(at(Date.UTC(2026, 9, 15, 23, 10), "1w", "new-york")).toBe("2026-10-12T13:30:00.000Z");
    expect(at(Date.UTC(2026, 9, 14, 13, 12), "5m", "new-york")).toBe("2026-10-14T13:10:00.000Z");
    // summer time starting inside the day: 05:30 New York on 8 March is in the 04:00 bucket
    expect(at(Date.UTC(2026, 2, 8, 9, 30), "4h", "new-york")).toBe("2026-03-08T08:00:00.000Z");
    // a pushed trade past a Monday week's end starts the next at Monday
    p.run(`globalThis.WK = [{ t: ${Date.UTC(2026, 9, 5)}, o: 1, h: 2, l: 1, c: 2 }]`);
    expect(p.run(`chApplyTick(WK, { price: 3, at: ${Date.UTC(2026, 9, 15, 7)} }, ${7 * DAY}, true, (t) => chBarStart(t, "1w", "utc"))`)).toBe(true);
    expect(p.run("WK.map((b) => b.t)")).toEqual([Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 12)]);
    // a boundary at or before the last bar's start starts nothing
    expect(p.run(`chApplyTick(WK, { price: 3, at: ${Date.UTC(2026, 9, 25)} }, ${7 * DAY}, true, () => ${Date.UTC(2026, 9, 12)})`)).toBe(false);
  });

  it("asks a range in its own bar size, takes the owner's bar size over it, says both back to the page — and where the source drew the range coarser, the menu says the size drawn and the hint why", async () => {
    let answer = (path: string): unknown => {
      const iv = new URLSearchParams(path.split("?")[1]).get("interval")!;
      return candles(series(40, IV_MS[iv]!), { interval: iv });
    };
    const p = page((path) => (path.startsWith("/api/account/candles") ? answer(path) : new Promise(() => {})));
    p.run('globalThis.SAID = []; chMount(EL, { venue: "okx", symbol: "BTC/USDT", range: "5D", onRange: (r) => SAID.push(`range ${r}`), onInterval: (iv) => SAID.push(`size ${iv}`) })');
    await settle();
    const reads = () => p.asked.filter((x) => x.startsWith("/api/account/candles"));
    const path = (interval: string, range: string) => `/api/account/candles?${new URLSearchParams({ venue: "okx", symbol: "BTC/USDT", interval, range })}`;
    expect(reads()[0]).toBe(path("5m", "5D"));
    expect(p.run("[chRange(EL), chInterval(EL)]")).toEqual(["5D", "5m"]);
    // a range pressed: in its own bar size
    pickRange(p.el, "YTD");
    expect(reads().at(-1)).toBe(path("1d", "YTD"));
    expect(p.run("SAID")).toEqual(["range YTD", "size 1d"]);
    expect(p.el.querySelector(".ch-head").innerHTML).toContain('data-ch-r="YTD" aria-pressed="true"');
    // a bar size picked: over the same range
    pickSize(p.el, "4h");
    expect(reads().at(-1)).toBe(path("4h", "YTD"));
    expect(p.run("SAID")).toEqual(["range YTD", "size 1d", "size 4h"]);
    // the range pressed again: its own bar size again (its read kept by the page a while: asked of the page, answered from what it kept)
    pickRange(p.el, "YTD");
    expect(p.run("[chRange(EL), chInterval(EL)]")).toEqual(["YTD", "1d"]);
    expect(p.run("SAID.slice(-1)")).toEqual(["size 1d"]);
    await settle();
    // a source whose latest 5,000 1-minute bars do not reach back a month draws it in 15-minute bars and says why
    const note = "Hyperliquid keeps only the latest 5,000 bars at this size: 1-minute bars do not reach back 1M, so it is drawn in 15-minute bars";
    answer = () => ({ ...candles(series(100, 15 * MIN), { interval: "15m" }), note });
    pickRange(p.el, "1M");
    pickSize(p.el, "1m");
    expect(reads().at(-1)).toBe(path("1m", "1M"));
    await settle();
    expect(p.run("chInterval(EL)")).toBe("15m");
    expect(p.el.querySelector(".ch-head").innerHTML).toContain('<option value="15m" selected>15m</option>');
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe(note);
    expect(footText(p.el)).toMatch(/^OKX · 15m bars · /);
    // the log switch: drawn again on a log scale, nothing read, said back to the page
    const n = reads().length;
    p.run("globalThis.LOG = []; CH.get(EL).onLog = (on) => LOG.push(on)");
    p.el.fire("click", { target: { closest: () => ({ dataset: { chLog: "" } }) } });
    expect(p.run("LOG")).toEqual([true]);
    expect(p.run("CH.get(EL).L.sc.log")).toBe(true);
    expect(p.el.querySelector(".ch-head").innerHTML).toContain('data-ch-log aria-pressed="true"');
    expect(footText(p.el)).toContain("log scale");
    expect(reads().length).toBe(n);
    p.run("chRelease(EL)");
  });

  it("moves through time: the wheel zooms around the pointer and moves sideways, a drag moves the view (never past the newest bar), a pinch zooms around its middle, + and − zoom, a double click fits the range — the crosshair and the readout staying with the pointer", async () => {
    const bars = series(300, HOUR);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    const plot = p.el.querySelector(".ch-plot");
    // fitted: every bar
    expect(viewOf(p)).toMatchObject({ from: 0, to: 300, end: 300 });
    const fit = viewOf(p).slot;
    // the wheel up at x = 300: zoomed in, the slot under the pointer still under it; the crosshair there, the readout on its bar
    const under = p.run<number>("CH.get(EL).L.sc.slotAt(300)");
    plot.fire("wheel", { clientX: 300, clientY: 100, deltaX: 0, deltaY: -400 });
    expect(viewOf(p).slot).toBeCloseTo(fit * Math.exp(0.6), 6);
    expect(p.run("CH.get(EL).L.sc.slotAt(300)")).toBe(under);
    expect(p.el.querySelector(".ch-cross").classes.has("on")).toBe(true);
    const i = p.run<number>("CH.get(EL).L.sc.at(300)");
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain(`<span class="ch-v up">${bars[i]!.o.toLocaleString("en-US")}</span>`);
    // a drag right by a hundred pixels: a hundred pixels' worth of slots back in time
    const before = viewOf(p);
    plot.fire("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300, clientY: 100 });
    plot.fire("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 400, clientY: 100 });
    expect(viewOf(p).end).toBeCloseTo(before.end - 100 / before.slot, 6);
    expect(plot.classes.has("drag")).toBe(true);
    plot.fire("pointerup", { pointerId: 1 });
    expect(plot.classes.has("drag")).toBe(false);
    // a press that hardly moves is a tap: the view stays
    const still = viewOf(p).end;
    plot.fire("pointerdown", { pointerId: 9, pointerType: "touch", button: 0, clientX: 300, clientY: 100 });
    plot.fire("pointermove", { pointerId: 9, pointerType: "touch", clientX: 302, clientY: 104 });
    plot.fire("pointerup", { pointerId: 9 });
    expect(viewOf(p).end).toBe(still);
    // dragged far the other way: the view stops at the newest bar
    plot.fire("pointerdown", { pointerId: 2, pointerType: "mouse", button: 0, clientX: 400, clientY: 100 });
    plot.fire("pointermove", { pointerId: 2, pointerType: "mouse", clientX: -5000, clientY: 100 });
    plot.fire("pointerup", { pointerId: 2 });
    expect(viewOf(p).end).toBe(300);
    // the wheel sideways: back in time
    plot.fire("wheel", { clientX: 300, clientY: 100, deltaX: -120, deltaY: 0 });
    expect(viewOf(p).end).toBeCloseTo(300 - 120 / viewOf(p).slot, 6);
    // + and − from the keyboard
    const s0 = viewOf(p).slot;
    plot.fire("keydown", { key: "+" });
    expect(viewOf(p).slot).toBeCloseTo(s0 * 1.25, 6);
    plot.fire("keydown", { key: "-" });
    expect(viewOf(p).slot).toBeCloseTo(s0, 6);
    // a pinch: two fingers spread to twice their distance — a slot twice as wide, the slot under their middle kept
    const s1 = viewOf(p).slot;
    const mid = p.run<number>("CH.get(EL).L.sc.slotAt(250)");
    plot.fire("pointerdown", { pointerId: 5, pointerType: "touch", button: 0, clientX: 200, clientY: 100 });
    plot.fire("pointerdown", { pointerId: 6, pointerType: "touch", button: 0, clientX: 300, clientY: 100 });
    plot.fire("pointermove", { pointerId: 5, pointerType: "touch", clientX: 150, clientY: 100 });
    plot.fire("pointermove", { pointerId: 6, pointerType: "touch", clientX: 350, clientY: 100 });
    expect(viewOf(p).slot).toBeCloseTo(s1 * 2, 6);
    expect(p.run("CH.get(EL).L.sc.slotAt(250)")).toBe(mid);
    plot.fire("pointerup", { pointerId: 5 });
    plot.fire("pointerup", { pointerId: 6 });
    // the keys walk the crosshair past the view's left edge: the view follows
    plot.fire("keydown", { key: "Home" });
    const left = viewOf(p).from;
    plot.fire("keydown", { key: "ArrowLeft" });
    expect(viewOf(p).from).toBe(left - 1);
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain(`<span class="ch-v up">${bars[left - 1]!.o.toLocaleString("en-US")}</span>`);
    // a double click: the range fitted again
    plot.fire("dblclick");
    expect(viewOf(p)).toMatchObject({ from: 0, to: 300, end: 300 });
    p.run("chRelease(EL)");
  });

  it("the range pressed again after pages scrolled left fits the range's own window — its month, never every bar brought under its label — a bar size picked over it presses no range, and Now → takes a view behind the newest bar back to it", async () => {
    const first = series(720, HOUR);
    const pages: Array<ReturnType<typeof later>> = [];
    const p = page((path) => {
      if (path.includes("before=")) {
        const w = later();
        pages.push(w);
        return w.promise;
      }
      return path.startsWith("/api/account/candles") ? candles(first, { more: true }) : new Promise(() => {});
    });
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", range: "1M" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    const drag = (from: number, to: number, id: number) => {
      plot.fire("pointerdown", { pointerId: id, pointerType: "mouse", button: 0, clientX: from, clientY: 100 });
      plot.fire("pointermove", { pointerId: id, pointerType: "mouse", clientX: to, clientY: 100 });
      plot.fire("pointerup", { pointerId: id });
    };
    for (let k = 0; k < 3; k++) plot.fire("keydown", { key: "+" });
    for (let k = 0; k < 40 && !pages.length; k++) drag(100, 1100, k + 1);
    expect(pages).toHaveLength(1);
    // a thousand older hours brought by scrolling left
    pages[0]!.resolve(candles(series(1_000, HOUR, first[0]!.t - HOUR), { more: true }));
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(1_720);
    // moved back in time, behind the newest bar: Now → shows, and takes the view back to it
    drag(100, 700, 90);
    await settle();
    expect(viewOf(p).end).toBeLessThan(viewOf(p).total - 0.5);
    expect(p.el.querySelector(".ch-now").hidden).toBe(false);
    p.el.querySelector(".ch-now").fire("click");
    await settle();
    expect(viewOf(p).end).toBe(viewOf(p).total);
    // 1M pressed again: the month's own bars across the plot, the older ones off its left edge
    pickRange(p.el, "1M");
    await settle();
    const v = viewOf(p);
    expect([v.from, v.to, v.end]).toEqual([1_000, 1_720, 1_720]);
    expect(p.el.querySelector(".ch-now").hidden).toBe(true);
    // a bar size picked over the range: the range is not said pressed over bars of another size
    p.el.fire("change", { target: { dataset: { chIvsel: "" }, value: "1m" } });
    expect(p.el.querySelector(".ch-head").innerHTML).toContain('data-ch-r="1M" aria-pressed="false"');
    p.run("chRelease(EL)");
  });

  it("scrolled to the oldest bar, asks the page before it — once, with a quiet hint while it comes — lays its bars on the left without the view jumping, keeps them through a read again, and says where the history ends in the source's words and asks no more", async () => {
    const first = series(120, HOUR);
    const pages: Array<ReturnType<typeof later>> = [];
    const p = page((path) => {
      if (path.includes("before=")) {
        const w = later();
        pages.push(w);
        return w.promise;
      }
      return path.startsWith("/api/account/candles") ? candles(first, { more: true }) : new Promise(() => {});
    });
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    const befores = () => p.asked.filter((x) => x.includes("before="));
    // the range fitted asks nothing older by itself
    expect(befores()).toHaveLength(0);
    // zoomed in, then dragged right until the oldest bar passes the left edge: the page before it is asked, once
    for (let k = 0; k < 3; k++) plot.fire("keydown", { key: "+" });
    const drag = (from: number, to: number, id: number) => {
      plot.fire("pointerdown", { pointerId: id, pointerType: "mouse", button: 0, clientX: from, clientY: 100 });
      plot.fire("pointermove", { pointerId: id, pointerType: "mouse", clientX: to, clientY: 100 });
      plot.fire("pointerup", { pointerId: id });
    };
    drag(100, 1100, 1);
    expect(befores()).toEqual([`/api/account/candles?venue=okx&symbol=BTC%2FUSDT&interval=1h&before=${first[0]!.t}&limit=1000`]);
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe("Loading older hourly bars…");
    expect(p.el.querySelector(".ch-hint").classes.has("busy")).toBe(true);
    drag(100, 300, 2);
    expect(befores()).toHaveLength(1);
    // the page: sixty older bars on the left — the bar at the plot's right still the one there (the view's slots moved with them), and the
    // empty space on the left the older bars
    const x = p.run<number>("Math.floor(CH.get(EL).L.sc.xOf(CH.get(EL).L.sc.end - 1.5))");
    const tAt = (at: number) => p.run<number>(`CH.get(EL).bars[CH.get(EL).L.sc.at(${at})].t`);
    const tx = tAt(x);
    const older = series(60, HOUR, first[0]!.t - HOUR);
    pages[0]!.resolve(candles(older, { more: true }));
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(180);
    expect(tAt(x)).toBe(tx);
    // still near the oldest: the next page asked before the bars it brought
    expect(befores()[1]).toContain(`before=${older[0]!.t}&`);
    // that one says the history ends: its words over the plot where the oldest bar is in view, a line where it starts, nothing more asked
    const oldest = series(10, HOUR, older[0]!.t - HOUR);
    pages[1]!.resolve(candles(oldest, { more: false, ends: "Coinbase Exchange's BTC-USD history starts Mon 20 Jul 2015" }));
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(190);
    drag(100, 1100, 3);
    expect(viewOf(p).from).toBe(0);
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe("Coinbase Exchange&#39;s BTC-USD history starts Mon 20 Jul 2015");
    expect(p.el.querySelector(".ch-hint").classes.has("busy")).toBe(false);
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain('<path class="ch-start"');
    expect(befores()).toHaveLength(2);
    // read again (the minute's read): the older bars stay, and so does where the history ends
    p.run("API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(190);
    expect(p.run("CH.get(EL).edge.more")).toBe(false);
    // another range: the older bars go with the range they were brought for
    pickRange(p.el, "5D");
    await settle();
    expect(p.run("CH.get(EL).paged")).toBe(0);
    p.run("chRelease(EL)");
  });

  it("keeps a drag under way where it was when older bars land on the left while it moves", async () => {
    const first = series(120, HOUR);
    const pages: Array<ReturnType<typeof later>> = [];
    const p = page((path) => {
      if (path.includes("before=")) {
        const w = later();
        pages.push(w);
        return w.promise;
      }
      return path.startsWith("/api/account/candles") ? candles(first, { more: true }) : new Promise(() => {});
    });
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    for (let k = 0; k < 3; k++) plot.fire("keydown", { key: "+" });
    plot.fire("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    plot.fire("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 1100, clientY: 100 });
    expect(pages).toHaveLength(1);
    const { end, slot } = viewOf(p);
    pages[0]!.resolve(candles(series(60, HOUR, first[0]!.t - HOUR), { more: false, ends: "OKX's BTC-USDT history starts Thu 11 Jan 2018" }));
    await settle();
    expect(viewOf(p).end).toBeCloseTo(end + 60, 6);
    // the drag moves on ten pixels: from where it was, never back by the sixty slots the page brought
    plot.fire("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 1110, clientY: 100 });
    expect(viewOf(p).end).toBeCloseTo(end + 60 - 10 / slot, 6);
    plot.fire("pointerup", { pointerId: 1 });
    p.run("chRelease(EL)");
  });

  it("says a page that did not come in its words, and asks it of the account again only after a wait", async () => {
    const first = series(120, HOUR);
    const p = page((path) => (path.includes("before=") ? { ok: false, refusal: { code: "E_VENUE_TIMEOUT", message: "OKX did not answer in 12 s" } } : path.startsWith("/api/account/candles") ? candles(first, { more: true }) : new Promise(() => {})));
    p.run("globalThis.NOW = Date.now(); Date.now = () => NOW");
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    const befores = () => p.asked.filter((x) => x.includes("before="));
    for (let k = 0; k < 3; k++) plot.fire("keydown", { key: "+" });
    const drag = (id: number) => {
      plot.fire("pointerdown", { pointerId: id, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
      plot.fire("pointermove", { pointerId: id, pointerType: "mouse", clientX: 1100, clientY: 100 });
      plot.fire("pointerup", { pointerId: id });
    };
    drag(1);
    await settle();
    expect(befores()).toHaveLength(1);
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe("Older bars did not come: OKX did not answer in 12 s.");
    // within five seconds: not asked again
    p.run("NOW += 3000");
    drag(2);
    await settle();
    expect(befores()).toHaveLength(1);
    // past them: asked of the account again, not answered from the refusal the page kept
    p.run("NOW += 3000");
    drag(3);
    await settle();
    expect(befores()).toHaveLength(2);
    p.run("chRelease(EL)");
  });

  it("redraws only the live layer when a pushed price keeps the scale — the picture under it is not built again — and the whole picture when the price takes the scale past its edge", async () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR;
    const bars = hourly(24, start);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})), { stream: true });
    const es = p.connect();
    p.run("stFollow(['okx:BTC/USDT'])");
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer); globalThis.BUILT = 0; globalThis.SV0 = chSvg; chSvg = (s, L) => (BUILT++, SV0(s, L))");
    const picture = p.el.querySelector(".ch-draw").innerHTML;
    const last = bars.at(-1)!;
    let seq = 10;
    const push = (price: number) => es.say("quote", { venue: "okx", symbol: "BTC/USDT", source: "okx", bid: price - 1, ask: price + 1, last: price, at: new Date().toISOString(), seenAt: new Date().toISOString(), from: "OKX · live", live: true, seq: ++seq });
    push(last.c + 1);
    expect(p.run("CH.get(EL).bars.at(-1).c")).toBe(last.c + 1);
    expect(p.run("BUILT")).toBe(0);
    expect(p.el.querySelector(".ch-draw").innerHTML).toBe(picture);
    expect(p.el.querySelector(".ch-live").innerHTML).toContain(`>${(last.c + 1).toLocaleString("en-US")}</text></svg>`);
    // far above every bar: the scale opens, and the picture is built again
    push(last.h + 5_000);
    expect(p.run("BUILT")).toBe(1);
    expect(p.el.querySelector(".ch-draw").innerHTML).not.toBe(picture);
    p.run("chRelease(EL); stClose()");
  });

  it("draws a hole as empty slots and never bridges it — the crosshair over it says why — a share's sessions meeting as a dashed break; says in the foot whose bars, what they were folded from, which hours they cover and what they are adjusted for; a daily bar built from intraday ones says so", async () => {
    const t0 = Math.floor(Date.now() / MIN) * MIN - 30 * MIN;
    const ks = [...Array.from({ length: 10 }, (_, k) => k), ...Array.from({ length: 10 }, (_, k) => 15 + k)];
    const coin = ks.map((k) => ({ t: t0 + k * MIN, o: 100, h: 101, l: 99, c: 100.5, v: 1 }));
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(coin, { interval: "1m", gaps: [{ from: t0 + 10 * MIN, to: t0 + 15 * MIN, why: "No trades at OKX" }] }) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", range: "1D" })');
    await settle();
    expect(p.run("CH.get(EL).L.sl.pos")).toEqual([...Array.from({ length: 10 }, (_, k) => k), ...Array.from({ length: 10 }, (_, k) => 15 + k)]);
    // the column over the hole: the readout says why no bar is there, the time tag says its minute
    const x = p.run<number>("Math.floor(CH.get(EL).L.sc.xOf(12.5))");
    p.el.querySelector(".ch-plot").fire("pointermove", { clientX: x, clientY: 50 });
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toBe('<span class="ch-gapw">No bar · No trades at OKX</span>');
    expect(p.el.querySelector(".ch-cross").querySelector(".ch-xtt").textContent).toBe(p.run<string>(`chWhen(${t0 + 12 * MIN}, "1m")`));
    // no candle in it, and none drawn across it: every wick stands outside the hole's columns
    const xs = [...`${p.el.querySelector(".ch-draw").innerHTML}${p.el.querySelector(".ch-live").innerHTML}`.matchAll(/M(\d+) \d+h1v/g)].map((m) => Number(m[1]));
    const [h0, h1] = p.run<number[]>("[CH.get(EL).L.sc.xOf(10), CH.get(EL).L.sc.xOf(15)]");
    expect(xs.length).toBe(20);
    expect(xs.every((v) => v < h0! || v >= h1!)).toBe(true);
    p.run("chRelease(EL)");

    // a share's five-minute bars over two sessions: a dashed break where they meet; whose bars and what they are, in the foot
    const fri = Date.UTC(2026, 9, 16, 23, 50);
    const mon = Date.UTC(2026, 9, 19, 8, 0);
    const share = [fri, fri + 5 * MIN, mon, mon + 5 * MIN].map((t, k) => ({ t, o: 200 + k, h: 201 + k, l: 199 + k, c: 200.5 + k }));
    const extended = "pre-market, regular and after-hours, 04:00–20:00 New York · no overnight data";
    const q = page((path) => (path.startsWith("/api/account/candles") ? candles(share, { venue: "stocks", venueName: "US stocks", interval: "5m", source: "Robinhood · AAPL", adjustment: "split-adjusted, not dividend-adjusted", session: extended, gaps: [{ from: fri + 10 * MIN, to: mon, why: "No overnight data" }] }) : new Promise(() => {})));
    q.run('chMount(EL, { venue: "stocks", symbol: "AAPL", kind: "stock", quote: "USD", range: "5D" })');
    await settle();
    expect(q.run("CH.get(EL).L.sl.pos")).toEqual([0, 1, 2, 3]);
    expect(q.el.querySelector(".ch-draw").innerHTML).toMatch(/<path class="ch-gapl" d="M\d+\.5 0V\d+"\/>/);
    expect(footText(q.el)).toMatch(new RegExp(`^Robinhood · AAPL · 5m bars · ${extended} · split-adjusted, not dividend-adjusted · prices in USD · `));
    expect(q.el.querySelector(".ch-foot").innerHTML).toContain(`title="Robinhood · AAPL · 5m bars · ${extended}`);
    q.run("chRelease(EL)");

    // a share's weeks folded from days, the last built from this week's intraday bars: the readout on it says so
    const weeks = [Date.UTC(2026, 9, 5, 13, 30), Date.UTC(2026, 9, 12, 13, 30)].map((t, k) => ({ t, o: 200 + k, h: 205 + k, l: 198 + k, c: 204 + k }));
    const r = page((path) => (path.startsWith("/api/account/candles") ? candles(weeks, { venue: "stocks", venueName: "US stocks", interval: "1w", source: "Cboe · AAPL", folded: "weekly bars folded from Cboe's daily bars (weeks from Monday)", session: "regular-session daily bars", today: { t: weeks[1]!.t, words: "This week so far: today so far" } }) : new Promise(() => {})));
    r.run('chMount(EL, { venue: "stocks", symbol: "AAPL", kind: "stock", quote: "USD", range: "5Y" })');
    await settle();
    expect(r.el.querySelector(".ch-ohlc").innerHTML).toContain('<span class="ch-today">This week so far: today so far</span>');
    expect(footText(r.el)).toMatch(/^Cboe · AAPL · 1W bars · weekly bars folded from Cboe&#39;s daily bars \(weeks from Monday\) · regular-session daily bars · prices in USD · each bar&#39;s own day/);
    r.run("chRelease(EL)");
  });

  it("starts a share's intraday bar from a pushed trade only inside the hours its bars keep, at New York's own boundary — never in the night they leave out — and never its daily bar", async () => {
    // Monday's last after-hours bars, 19:50 and 19:55 New York
    const bars = [Date.UTC(2026, 9, 19, 23, 50), Date.UTC(2026, 9, 19, 23, 55)].map((t) => ({ t, o: 200, h: 201, l: 199, c: 200.5 }));
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { venue: "stocks", venueName: "US stocks", interval: "5m" }) : new Promise(() => {})), { stream: true });
    const es = p.connect();
    p.run("stFollow(['stocks:AAPL'])");
    p.run('chMount(EL, { venue: "stocks", symbol: "AAPL", kind: "stock", quote: "USD", range: "1D" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const trade = (at: number, price: number) => es.say("trades", { venue: "stocks", symbol: "AAPL", trades: [{ price, size: 1, at: new Date(at).toISOString() }], live: true });
    // 21:00 New York: the night its bars leave out — nothing started
    trade(Date.UTC(2026, 9, 20, 1, 0), 202);
    expect(p.run("CH.get(EL).bars.length")).toBe(2);
    // 04:02 New York on Tuesday: the pre-market's first five minutes, from 04:00
    trade(Date.UTC(2026, 9, 20, 8, 2), 203);
    expect(p.run("CH.get(EL).bars.length")).toBe(3);
    expect(p.run("CH.get(EL).bars.at(-1)")).toEqual({ t: Date.UTC(2026, 9, 20, 8, 0), o: 203, h: 203, l: 203, c: 203 });
    p.run("chRelease(EL); stClose()");
  });

  it("draws only what is seen, fast: 2,000 and 8,000 bars — fitted (one candle a pixel's column), zoomed in, and a live price that redraws the live layer alone", async () => {
    for (const n of [2_000, 8_000]) {
      const bars = series(n, MIN);
      const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars, { interval: "1m" }) : new Promise(() => {})), { size: { w: 1200, h: 520 } });
      p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", interval: "1m", range: "5D" })');
      await settle();
      p.run("clearTimeout(CH.get(EL).timer)");
      const time = (code: string, runs = 20) => {
        p.run(code);
        const t = performance.now();
        for (let k = 0; k < runs; k++) p.run(code);
        return (performance.now() - t) / runs;
      };
      // the whole picture built afresh each time, as a drag or the wheel builds it each frame
      const fitted = time('CH.get(EL).staticKey = ""; chDraw(CH.get(EL))');
      // fitted: at most one candle a column of the plot
      expect(p.run("CH.get(EL).L.sc.n")).toBe(n);
      const candleMarks = [...p.el.querySelector(".ch-draw").innerHTML.matchAll(/<path class="ch-c[ud]" d="([^"]*)"/g)].reduce((k, m) => k + (m[1]!.match(/M/g) ?? []).length, 0);
      expect(candleMarks).toBeGreaterThan(500);
      expect(candleMarks).toBeLessThanOrEqual(1200);
      p.run(`CH.get(EL).view = { slot: 8, end: CH.get(EL).L.sc.total - ${Math.floor(n / 3)} }`);
      const zoomed = time('CH.get(EL).staticKey = ""; chDraw(CH.get(EL))');
      expect(p.run<number>("CH.get(EL).L.sc.n")).toBeLessThan(200);
      // a live price inside the newest bar's range: the live layer alone
      p.run("CH.get(EL).view = null; chDraw(CH.get(EL)); globalThis.BUILT = 0; globalThis.SV0 = chSvg; chSvg = (s, L) => (BUILT++, SV0(s, L))");
      const tick = time("{ const s = CH.get(EL); const b = s.bars.at(-1); b.c = b.c === b.h ? b.l : b.h; chDraw(s); }", 50);
      expect(p.run("BUILT")).toBe(0);
      // budgets well inside a frame (16 ms), with room for a slow machine running the whole suite
      expect(fitted, `${n} bars fitted: ${fitted.toFixed(2)} ms`).toBeLessThan(40);
      expect(zoomed, `${n} bars zoomed: ${zoomed.toFixed(2)} ms`).toBeLessThan(40);
      expect(tick, `${n} bars, a live price: ${tick.toFixed(2)} ms`).toBeLessThan(6);
      p.run("chRelease(EL)");
    }
  });

  it("keeps the keys' crosshair on its bar when older bars land on the left: the next arrow moves one bar, never a page", async () => {
    const first = series(300, MIN);
    const pages: Array<ReturnType<typeof later>> = [];
    const p = page((path) => {
      if (path.includes("before=")) {
        const w = later();
        pages.push(w);
        return w.promise;
      }
      return path.startsWith("/api/account/candles") ? candles(first, { interval: "1m", more: true }) : new Promise(() => {});
    });
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", range: "1D" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    // zoomed in, the crosshair put on the oldest bar shown, then walked left until the view, following it, asks the page before
    plot.fire("keydown", { key: "+" });
    plot.fire("keydown", { key: "+" });
    plot.fire("keydown", { key: "Home" });
    for (let k = 0; k < 300 && !pages.length; k++) plot.fire("keydown", { key: "ArrowLeft" });
    expect(pages).toHaveLength(1);
    const hovered = () => p.run<number>("CH.get(EL).bars[CH.get(EL).hover.i].t");
    const tag = () => p.el.querySelector(".ch-cross").querySelector(".ch-xtt").textContent;
    const t0 = hovered();
    const said = tag();
    const v0 = viewOf(p);
    pages[0]!.resolve(candles(series(300, MIN, first[0]!.t - MIN), { interval: "1m", more: true }));
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(600);
    // the same bar under the crosshair, the same time in its tag, the view on the same bars (three hundred slots on)
    expect(hovered()).toBe(t0);
    expect(tag()).toBe(said);
    const v1 = viewOf(p);
    expect(v1.from).toBe(v0.from + 300);
    // one press: the bar before it, and the view moved one bar at most
    plot.fire("keydown", { key: "ArrowLeft" });
    expect(hovered()).toBe(t0 - MIN);
    expect(viewOf(p).from).toBeGreaterThanOrEqual(v1.from - 1);
    // a read again of the range keeps it on that bar too
    p.run("API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(hovered()).toBe(t0 - MIN);
    p.run("chRelease(EL)");
  });

  it("takes a page that came back with no bars while older ones still exist as one that did not come — said, asked again after the wait — never as where the history ends; only an answer that says nothing older exists ends it", async () => {
    const first = series(120, HOUR);
    let reply: unknown = candles([], { more: true, partial: true });
    const p = page((path) => (path.includes("before=") ? reply : path.startsWith("/api/account/candles") ? candles(first, { more: true }) : new Promise(() => {})));
    p.run("globalThis.NOW = Date.now(); Date.now = () => NOW");
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    const befores = () => p.asked.filter((x) => x.includes("before="));
    for (let k = 0; k < 3; k++) plot.fire("keydown", { key: "+" });
    const drag = (id: number) => {
      plot.fire("pointerdown", { pointerId: id, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
      plot.fire("pointermove", { pointerId: id, pointerType: "mouse", clientX: 1100, clientY: 100 });
      plot.fire("pointerup", { pointerId: id });
    };
    // none, and only part of the page answered (a page further back refused): older bars still exist, no line where the history starts
    drag(1);
    await settle();
    expect(befores()).toHaveLength(1);
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe("Older bars did not come: OKX answered only part of the page this time.");
    expect(p.run("CH.get(EL).edge.more")).toBe(true);
    expect(p.el.querySelector(".ch-draw").innerHTML).not.toContain('class="ch-start"');
    // none at all, older bars still said to exist: the same — asked of the account again only after the wait
    reply = candles([], { more: true });
    p.run("NOW += 3000");
    drag(2);
    await settle();
    expect(befores()).toHaveLength(1);
    p.run("NOW += 3000");
    drag(3);
    await settle();
    expect(befores()).toHaveLength(2);
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe("Older bars did not come: OKX answered none this time.");
    expect(p.run("CH.get(EL).edge.more")).toBe(true);
    // the source says nothing older exists: the history ends there, in its words, with the line where it starts, and nothing more is asked
    reply = candles([], { more: false, ends: "OKX keeps no hourly BTC-USDT bars before Thu 11 Jan 2018" });
    p.run("NOW += 11000");
    drag(4);
    await settle();
    expect(befores()).toHaveLength(3);
    expect(p.run("CH.get(EL).edge.more")).toBe(false);
    expect(p.el.querySelector(".ch-hint").innerHTML).toBe("OKX keeps no hourly BTC-USDT bars before Thu 11 Jan 2018");
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain('<path class="ch-start"');
    p.run("NOW += 120000");
    drag(5);
    await settle();
    expect(befores()).toHaveLength(3);
    p.run("chRelease(EL)");
  });

  it("never leaves the time axis bare: a level too dense for the width is drawn evenly stepped — every 2nd or 5th year, the days by their number alone — and only then are the finer ones let go", () => {
    const p = page();
    type Kept = { x: number; half: number; text: string; t: number; kind: string };
    /** the labels a plot `w` wide keeps for `bars` fitted, each checked: whole inside it, none touching another */
    const thin = (bars: unknown[], interval: string, w: number) => {
      p.run(`globalThis.SC = chScale(${JSON.stringify(bars)}, ${w}, 300)`);
      const kept = p.run<Kept[]>(`chThin(chTimeLabels(${JSON.stringify(bars)}, "${interval}", "UTC"), SC.cx, ${w})`);
      for (let k = 1; k < kept.length; k++) expect(kept[k]!.x - kept[k - 1]!.x).toBeGreaterThanOrEqual(kept[k]!.half + kept[k - 1]!.half + 12);
      for (const l of kept) {
        expect(l.x - l.half).toBeGreaterThanOrEqual(0);
        expect(l.x + l.half).toBeLessThanOrEqual(w);
      }
      return kept;
    };
    /** Monday weeks from the first Monday on or after `from` to the week of 12 Oct 2026 (MAX in weekly bars) */
    const weeks = (from: number) => {
      const mon = from + ((1 - new Date(from).getUTCDay() + 7) % 7) * DAY;
      const out: Array<{ t: number; o: number; h: number; l: number; c: number }> = [];
      for (let t = mon; t <= Date.UTC(2026, 9, 12); t += 7 * DAY) out.push({ t, o: 10, h: 11, l: 9, c: 10.5 });
      return out;
    };
    // a share's MAX from Nasdaq (1990 on: 1,920 weeks) on a phone, the desktop terminal and a wide screen; BTC's from Coinbase (2015-07 on)
    // on phones: at least three years each, the same number of years between each two
    for (const [from, w] of [[Date.UTC(1990, 0, 1), 600], [Date.UTC(1990, 0, 1), 800], [Date.UTC(1990, 0, 1), 1140], [Date.UTC(2015, 6, 20), 300], [Date.UTC(2015, 6, 20), 262]] as const) {
      const bars = weeks(from);
      const years = thin(bars, "1w", w).filter((l) => l.kind === "y");
      expect(years.length, `${new Date(from).getUTCFullYear()} at ${w}`).toBeGreaterThanOrEqual(3);
      expect(new Set(years.slice(1).map((l, k) => Number(l.text) - Number(years[k]!.text))).size, `${new Date(from).getUTCFullYear()} at ${w}`).toBe(1);
    }
    expect(weeks(Date.UTC(1990, 0, 1)).length).toBe(1_920);
    // 1990 on, 600 wide: every fifth year (every second would touch), and no month or day squeezed in between
    const max = thin(weeks(Date.UTC(1990, 0, 1)), "1w", 600);
    expect(max.map((l) => l.text)).toEqual(["1995", "2000", "2005", "2010", "2015", "2020", "2025"]);
    // 5D of 5-minute bars on a phone: the days by their number alone, every one, a day apart; 600 wide they keep their dates
    const fives = Array.from({ length: 5 * 288 }, (_, k) => ({ t: Date.UTC(2026, 9, 11, 15) + k * 5 * MIN, o: 1, h: 1, l: 1, c: 1 }));
    const phone = thin(fives, "5m", 262).filter((l) => l.kind === "d");
    expect(phone.length).toBeGreaterThanOrEqual(3);
    expect(phone.every((l) => /^\d{1,2}$/.test(l.text))).toBe(true);
    expect(new Set(phone.slice(1).map((l, k) => l.t - phone[k]!.t))).toEqual(new Set([DAY]));
    expect(thin(fives, "5m", 600).filter((l) => l.kind === "d").every((l) => / /.test(l.text))).toBe(true);
    // a month of hourly bars 1,140 wide: every day by its number (its Mondays written so too), the month by its name
    const hours = Array.from({ length: 24 * 30 }, (_, k) => ({ t: Date.UTC(2026, 8, 17) + k * HOUR, o: 1, h: 1, l: 1, c: 1 }));
    const month = thin(hours, "1h", 1140);
    expect(month.filter((l) => l.kind === "d").length).toBeGreaterThanOrEqual(25);
    expect(month.filter((l) => l.kind === "d").every((l) => /^\d{1,2}$/.test(l.text))).toBe(true);
    expect(month.map((l) => l.text)).toContain("Oct");
    // a step the labels kept would break is not taken: six months of 4-hour bars 600 wide are their months alone (every second Monday by
    // the calendar would not fall on the months' firsts); five years of weeks 600 wide are their years and Julys (every second quarter's
    // month falls on the years: the half years)
    const six = Array.from({ length: 183 * 6 }, (_, k) => ({ t: Date.UTC(2026, 3, 16) + k * 4 * HOUR, o: 1, h: 1, l: 1, c: 1 }));
    expect(thin(six, "4h", 600).map((l) => l.kind)).toEqual(["m", "m", "m", "m", "m", "m"]);
    const five = thin(weeks(Date.UTC(2021, 9, 18)), "1w", 600) as Array<Kept & { mi: number }>;
    expect(five.filter((l) => l.kind === "y").length).toBeGreaterThanOrEqual(4);
    expect(five.filter((l) => l.kind === "m").length).toBeGreaterThanOrEqual(4);
    expect(five.filter((l) => l.kind === "m").every((l) => l.mi % 12 === 6)).toBe(true);
    expect(five.every((l) => l.kind === "y" || l.kind === "m")).toBe(true);
  });

  it("joins older bars of another source with a seam — a dashed line where they meet, both sources named in the foot, the far side's in the readout — and one source's pages run on with none", async () => {
    /** the latest `n` weekdays up to `last`, each at New York's open (13:30 Universal) */
    const weekdays = (n: number, last: number) => {
      const out: number[] = [];
      for (let t = last; out.length < n; t -= DAY) if (![0, 6].includes(new Date(t).getUTCDay())) out.unshift(t);
      return out.map((t, k) => ({ t, o: 200 + k / 10, h: 202 + k / 10, l: 199 + k / 10, c: 201 + k / 10, v: 1_000 }));
    };
    const year = weekdays(250, Date.UTC(2026, 9, 16, 13, 30));
    const older = weekdays(300, year[0]!.t - DAY);
    const oldest = weekdays(100, older[0]!.t - DAY);
    const stock = { venue: "stocks", venueName: "US stocks", symbol: "AAPL", interval: "1d", adjustment: "split-adjusted, not dividend-adjusted", more: true };
    const pages: Array<ReturnType<typeof later>> = [];
    const p = page((path) => {
      if (path.includes("before=")) {
        const w = later();
        pages.push(w);
        return w.promise;
      }
      return path.startsWith("/api/account/candles") ? candles(year, { ...stock, source: "Robinhood · AAPL" }) : new Promise(() => {});
    });
    p.run('chMount(EL, { venue: "stocks", symbol: "AAPL", kind: "stock", quote: "USD", range: "1Y" })');
    await settle();
    p.run("clearTimeout(CH.get(EL).timer)");
    const plot = p.el.querySelector(".ch-plot");
    for (let k = 0; k < 3; k++) plot.fire("keydown", { key: "+" });
    const drag = (id: number) => {
      plot.fire("pointerdown", { pointerId: id, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
      plot.fire("pointermove", { pointerId: id, pointerType: "mouse", clientX: 1100, clientY: 100 });
      plot.fire("pointerup", { pointerId: id });
    };
    // one source's bars: no seam, its name alone
    expect(p.el.querySelector(".ch-draw").innerHTML).not.toContain("ch-seam");
    expect(footText(p.el)).toMatch(/^Robinhood · AAPL · 1D bars · /);
    drag(1);
    expect(pages).toHaveLength(1);
    pages[0]!.resolve(candles(older, { ...stock, source: "Nasdaq · AAPL" }));
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(550);
    // the seam in view, where Robinhood's first bar's slot starts
    const x = p.run<number>(`Math.round(CH.get(EL).L.sc.xOf(CH.get(EL).L.sl.pos[300])) + 0.5`);
    expect(p.el.querySelector(".ch-draw").innerHTML).toContain(`<path class="ch-seam" d="M${x} 0V`);
    const when = p.run<string>(`chWhen(${year[0]!.t}, "1d")`);
    expect(footText(p.el)).toMatch(new RegExp(`^Robinhood · AAPL · before ${when}: Nasdaq · AAPL · 1D bars · `));
    // a bar on the far side says whose it is; one on the near side does not (the foot names theirs first)
    plot.fire("keydown", { key: "Home" });
    expect(p.run<number>("CH.get(EL).hover.i")).toBeLessThan(300);
    expect(p.el.querySelector(".ch-ohlc").innerHTML).toContain('<span class="ch-src">Nasdaq · AAPL</span>');
    plot.fire("keydown", { key: "End" });
    expect(p.run<number>("CH.get(EL).hover.i")).toBeGreaterThanOrEqual(300);
    expect(p.el.querySelector(".ch-ohlc").innerHTML).not.toContain("ch-src");
    // the next page is Nasdaq's as well: the same stretch goes back, no second seam
    drag(2);
    expect(pages).toHaveLength(2);
    pages[1]!.resolve(candles(oldest, { ...stock, source: "Nasdaq · AAPL" }));
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(650);
    expect(p.run("CH.get(EL).segs.length")).toBe(2);
    expect(footText(p.el).match(/before /g)).toHaveLength(1);
    // a read again of the range keeps whose the older bars are
    p.run("API.clear(); chRead(CH.get(EL), false)");
    await settle();
    expect(p.run("CH.get(EL).bars.length")).toBe(650);
    expect(footText(p.el)).toMatch(new RegExp(`^Robinhood · AAPL · before ${when}: Nasdaq · AAPL · `));
    p.run("chRelease(EL)");
  });

  it("says the scale it draws on: Log pressed with a price at zero in view stays straight, and the foot and a screen reader say so", async () => {
    const zero = series(40, HOUR);
    zero[10] = { ...zero[10]!, l: 0 };
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(zero) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", log: true })');
    await settle();
    expect(p.run("CH.get(EL).log")).toBe(true);
    expect(p.run("CH.get(EL).L.sc.log")).toBe(false);
    expect(footText(p.el)).toContain(" · straight scale: a price at or below zero has no logarithm");
    expect(footText(p.el)).not.toContain("log scale");
    const label = () => /aria-label="([^"]*)"/.exec(p.el.querySelector(".ch-live").innerHTML)![1]!;
    expect(label()).toContain("on a straight scale (a price at or below zero has no logarithm)");
    expect(label()).not.toContain("on a log scale");
    p.run("chRelease(EL)");
    // every price above zero: drawn on a log scale, and said to be
    const q = page((path) => (path.startsWith("/api/account/candles") ? candles(series(40, HOUR)) : new Promise(() => {})));
    q.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", log: true })');
    await settle();
    expect(q.run("CH.get(EL).L.sc.log")).toBe(true);
    expect(footText(q.el)).toContain(" · log scale");
    expect(/aria-label="([^"]*)"/.exec(q.el.querySelector(".ch-live").innerHTML)![1]).toContain("on a log scale");
    q.run("chRelease(EL)");
  });

  it("waits for a first view longer than the account gives its sources, and for a page longer than the account gives one: a slow view is never said to be one the account did not answer", async () => {
    const p = page();
    expect(p.run<number>("HISTORY_TIMEOUT_MS")).toBeGreaterThan(HISTORY_WAIT_MS);
    expect(p.run<number>("API_TIMEOUT_MS")).toBeGreaterThan(PAGE_WAIT_MS);
    p.run("globalThis.ASKS = []; globalThis.API0 = api; api = (path, o) => (ASKS.push([path, o && o.timeout]), API0(path, o))");
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", range: "MAX" })');
    expect(p.run<Array<[string, number | undefined]>>("ASKS")[0]).toEqual([`/api/account/candles?venue=okx&symbol=BTC%2FUSDT&interval=1w&range=MAX`, p.run<number>("HISTORY_TIMEOUT_MS")]);
    p.run("chRelease(EL)");
  });
});

describe("the account's own lines on the chart, pulled to change an order — signed (feat/paper-live phase 4)", () => {
  it("draws each line in view across the price pane — its words at the left, its price on the axis — leaves one out of range undrawn, never covers the last price's tag, and moves a price to the market's step", async () => {
    const bars = hourly(30);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT", priceStep: 0.5 })');
    await settle();
    const last = bars[bars.length - 1]!;
    p.run(`var DRAGGED = []; chLines(EL, [{ id: "o1:limit", ref: "o1", price: 83100, label: "Limit Sell 0.1", kind: "sell", drag: "limitPrice" }, { id: "pos:entry", price: ${last.c}, label: "Long 0.1 · entry", kind: "entry" }, { id: "pos:liq", price: 50000, label: "Liq. price", kind: "liq" }, { id: "x", price: 0, label: "no price", kind: "buy" }], { onDrag: (l, px) => DRAGGED.push([l.id, px]) })`);
    await settle();
    const html = p.el.querySelector(".ch-lines").innerHTML;
    expect(html).toMatch(/^<svg class="ch-svg ch-lnsvg" width="640" height="360" viewBox="0 0 640 360" aria-hidden="true" focusable="false">/);
    expect(html).toContain('<g class="ch-ln sell drag" data-ln="o1:limit">');
    expect(html).toContain(">Limit Sell 0.1</text>");
    expect(html).toContain(">83,100.0</text>");
    // the entry sits on the last price: its tag on the axis is left out (the last price's own stays), its price said in its words instead
    expect(html).toContain(`>Long 0.1 · entry · ${last.c.toLocaleString("en-US", { minimumFractionDigits: 1 })}</text>`);
    expect((html.match(/<g class="ch-ln entry"[^]*?<\/g>/) || [""])[0].match(/<rect/g)!.length).toBe(1);
    // out of the pane's range (the scale is the bars'): not drawn; no price: no line
    expect(html).not.toContain("pos:liq");
    expect(html).not.toContain("no price");
    expect(p.run("[chSnap(83101.37, 0.5), chSnap(83101.2, 0.5), chSnap(0.123456789, 0)]")).toEqual([83101.5, 83101, 0.1234567890]);
    p.run("chRelease(EL)");
  });

  it("STACKS the tags of lines that sit close together — each at least a tag's height under the one above, at the left and on the axis alike, never over the last price's — and on a narrow plot says each line by its kind and size alone, the whole of it on hover", async () => {
    const bars = hourly(30);
    const lines = (step: number) => `[{ id: "o1:limit", ref: "o1", price: 83100, label: "Limit Buy 0.00161", short: "Buy 0.00161", kind: "buy" }, { id: "o2:stop", ref: "o2", price: ${83100 - step}, label: "SL 0.00157", short: "SL 0.00157", kind: "sl" }, { id: "pos:entry", price: ${83100 + step}, label: "Long 0.00157 · entry", short: "Entry", kind: "entry" }]`;
    const ys = (html: string, x: string) => [...html.matchAll(new RegExp(`<rect class="ch-lnr" x="${x}" y="(-?\\d+(?:\\.\\d+)?)"`, "g"))].map((m) => Number(m[1])).sort((a, b) => a - b);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT", priceStep: 0.5 })');
    await settle();
    p.run(`chLines(EL, ${lines(1)})`);
    await settle();
    const html = p.el.querySelector(".ch-lines").innerHTML;
    const left = ys(html, "2");
    expect(left).toHaveLength(3);
    for (let i = 1; i < left.length; i++) expect(left[i]! - left[i - 1]!).toBeGreaterThanOrEqual(17);
    const axis = [...html.matchAll(/<rect class="ch-lnr" x="(\d+)" y="(-?\d+(?:\.\d+)?)"/g)].filter((m) => m[1] !== "2").map((m) => Number(m[2])).sort((a, b) => a - b);
    for (let i = 1; i < axis.length; i++) expect(axis[i]! - axis[i - 1]!).toBeGreaterThanOrEqual(17);
    expect(html).toContain(">Limit Buy 0.00161</text>");
    expect(html).toContain(`<title>SL 0.00157 · ${(83099).toLocaleString("en-US", { minimumFractionDigits: 1 })}</title>`);
    p.run("chRelease(EL)");
    // a phone's plot: the kind and the size alone
    const q = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})), { size: { w: 330, h: 300 } });
    q.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT", priceStep: 0.5 })');
    await settle();
    q.run(`chLines(EL, ${lines(2)})`);
    await settle();
    const narrow = q.el.querySelector(".ch-lines").innerHTML;
    expect(narrow).toMatch(/<text[^>]*>Buy 0\.00161/);
    expect(narrow).toMatch(/<text[^>]*>Entry/);
    expect(narrow).not.toMatch(/<text[^>]*>Limit Buy/);
    // the whole of it on hover
    expect(narrow).toContain("<title>Limit Buy 0.00161 · ");
    q.run("chRelease(EL)");
  });

  it("PULLS a line that drags — the view stays, the line says where it would go — and hands it, let go, to the page at that price on the market's step; a line that does not drag, or a press that does not move, hands nothing", async () => {
    const bars = hourly(30);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT", priceStep: 0.5 })');
    await settle();
    p.run(`var DRAGGED = []; chLines(EL, [{ id: "o1:limit", ref: "o1", price: 83100, label: "Limit Sell 0.1", kind: "sell", drag: "limitPrice" }, { id: "pos:entry", price: 83200, label: "Long 0.1 · entry", kind: "entry" }], { onDrag: (l, px) => DRAGGED.push([l.id, px]) })`);
    await settle();
    const plot = p.el.querySelector(".ch-plot");
    const y = p.run<number>("CH.get(EL).L.sc.y(83100)");
    const yEntry = p.run<number>("CH.get(EL).L.sc.y(83200)");
    // over the line: the plot's cursor says it can be pulled; over the entry (it does not drag): not
    plot.fire("pointermove", { clientX: 200, clientY: y + 1, pointerId: 1 });
    expect(plot.classes.has("ln-hover")).toBe(true);
    plot.fire("pointermove", { clientX: 200, clientY: yEntry, pointerId: 1 });
    expect(plot.classes.has("ln-hover")).toBe(false);
    // pressed and moved 30 pixels down: the line is drawn where it would go, the view not moved
    plot.fire("pointerdown", { clientX: 200, clientY: y + 2, pointerId: 7, pointerType: "mouse", button: 0 });
    plot.fire("pointermove", { clientX: 200, clientY: y + 32, pointerId: 7 });
    await settle();
    const want = p.run<number>(`chSnap(CH.get(EL).L.sc.price(${y + 32}), 0.5)`);
    expect(want).toBeLessThan(83100);
    expect(p.el.querySelector(".ch-lines").innerHTML).toContain(`Limit Sell 0.1 → ${want.toLocaleString("en-US", { minimumFractionDigits: 1 })}`);
    expect(p.run("CH.get(EL).view")).toBe(null);
    plot.fire("pointerup", { pointerId: 7 });
    expect(p.run<Array<[string, number]>>("DRAGGED")).toEqual([["o1:limit", want]]);
    // drawn back at its own price until the order is changed (signed, on the page)
    await settle();
    expect(p.el.querySelector(".ch-lines").innerHTML).not.toContain("→");
    // a press on the line that does not move, and a press on the entry: nothing handed over (the entry press pans the view as before)
    plot.fire("pointerdown", { clientX: 200, clientY: y, pointerId: 8, pointerType: "mouse", button: 0 });
    plot.fire("pointerup", { pointerId: 8 });
    plot.fire("pointerdown", { clientX: 200, clientY: yEntry, pointerId: 9, pointerType: "mouse", button: 0 });
    plot.fire("pointermove", { clientX: 200, clientY: yEntry + 30, pointerId: 9 });
    plot.fire("pointerup", { pointerId: 9 });
    expect(p.run<unknown[]>("DRAGGED").length).toBe(1);
    // a pull the browser took (pointercancel): the line drawn back, nothing handed over — no Change sheet at the price it reached
    plot.fire("pointerdown", { clientX: 200, clientY: y, pointerId: 10, pointerType: "pen", button: 0 });
    plot.fire("pointermove", { clientX: 200, clientY: y + 12, pointerId: 10 });
    expect(p.run("CH.get(EL).lineDrag && CH.get(EL).lineDrag.moved")).toBe(true);
    plot.fire("pointercancel", { pointerId: 10 });
    expect(p.run("CH.get(EL).lineDrag")).toBe(null);
    await settle();
    expect(p.el.querySelector(".ch-lines").innerHTML).not.toContain("→");
    expect(p.run<unknown[]>("DRAGGED").length).toBe(1);
    // a finger on a line: the page's scroll (touch-action: pan-y), never a pull — the line stays, nothing is handed over
    plot.fire("pointerdown", { clientX: 200, clientY: y, pointerId: 11, pointerType: "touch" });
    expect(p.run("CH.get(EL).lineDrag")).toBe(null);
    plot.fire("pointermove", { clientX: 200, clientY: y + 30, pointerId: 11 });
    plot.fire("pointerup", { pointerId: 11 });
    expect(p.run<unknown[]>("DRAGGED").length).toBe(1);
    // lines with no handler offered: none drags
    p.run(`chLines(EL, [{ id: "o1:limit", ref: "o1", price: 83100, label: "Limit Sell 0.1", kind: "sell", drag: "limitPrice" }])`);
    expect(p.run(`chLineAt(CH.get(EL), ${y})`)).toBe(null);
    p.run("chRelease(EL)");
  });
});

describe("the desk's trades on the chart (the superagent's desk: chMarks)", () => {
  it("finds the bar a moment falls in: the last bar that starts at or before it — the last bar only until its end — and none before the first", () => {
    const p = page();
    p.run("var BARS = [{ t: 0 }, { t: 100 }, { t: 200 }]");
    expect(p.run("[chBarOf(BARS, 0, 100), chBarOf(BARS, 150, 100), chBarOf(BARS, 299, 100), chBarOf(BARS, 300, 100), chBarOf(BARS, -1, 100), chBarOf([], 5, 100), chBarOf(BARS, NaN, 100)]")).toEqual([0, 1, 2, -1, -1, -1, -1]);
  });

  it("draws each trade in view at its bar and its price — an entry's words under its dot, an exit's over it, the two joined — an older one a dot with its words on hover, and what just happened ringing with its result floating up; nothing out of view, out of the pane, or with no price or moment", async () => {
    const bars = hourly(30);
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT", priceStep: 0.5 })');
    await settle();
    // ten minutes into bar k
    const at = (k: number) => bars[k]!.t + 10 * 60_000;
    p.run(`chMarks(EL, [
      { id: "L-1:in", t: ${at(20)}, price: ${bars[20]!.c}, side: "buy", kind: "in", label: "BUY 0.002 BTC · 83,212", short: "BUY", tone: "up", lead: "L-1" },
      { id: "L-1:out", t: ${at(26)}, price: ${bars[26]!.c}, side: "sell", kind: "out", label: "SOLD · take-profit · +$1.50", short: "+$1.50", tone: "ink", lead: "L-1", fresh: true, float: "+$1.50", floatTone: "up" },
      { id: "L-0:in", t: ${at(12)}, price: ${bars[12]!.c}, side: "buy", kind: "in", label: "BUY 0.001 BTC · 83,132", tone: "up", lead: "L-0", quiet: true },
      { id: "before", t: ${bars[0]!.t - 5 * HOUR}, price: 83000, kind: "in", label: "before the bars" },
      { id: "after", t: ${bars[29]!.t + 2 * HOUR}, price: 83000, kind: "in", label: "after the bars" },
      { id: "over", t: ${at(10)}, price: 99999, kind: "in", label: "over the pane" },
      { id: "x", t: ${at(10)}, price: 0, kind: "in", label: "no price" },
      { id: "y", t: NaN, price: 83000, kind: "in", label: "no moment" },
    ])`);
    await settle();
    const html = p.el.querySelector(".ch-lines").innerHTML;
    // a layer of its own over the account's lines, keyed so a repaint keeps it (and the animations of what is in it)
    expect(html).toContain('<svg class="ch-svg ch-mksvg" data-k="marks" width="640" height="360" viewBox="0 0 640 360" aria-hidden="true" focusable="false">');
    expect([...html.matchAll(/data-mk="([^"]+)"/g)].map((m) => m[1])).toEqual(["L-0:in", "L-1:in", "L-1:out"]);
    for (const gone of ["before", "after", "over", "no price", "no moment"]) expect(html, gone).not.toContain(gone);
    // each at its bar's middle and at its price
    const cx = (k: number) => p.run<number>(`CH.get(EL).L.sc.cx(${k}) + 0.5`);
    const cy = (price: number) => p.run<number>(`Math.round(CH.get(EL).L.sc.y(${price})) + 0.5`);
    expect(html).toContain(`<circle class="ch-mkd" cx="${cx(20)}" cy="${cy(bars[20]!.c)}" r="5"/>`);
    expect(html).toContain(`<circle class="ch-mkd" cx="${cx(26)}" cy="${cy(bars[26]!.c)}" r="5"/>`);
    // the lead's entry and its exit joined
    expect(html).toContain(`<path class="ch-mkj" d="M${cx(20)} ${cy(bars[20]!.c)}L${cx(26)} ${cy(bars[26]!.c)}"/>`);
    // the entry's words under its dot, the exit's over it
    const tagY = (id: string) => Number((new RegExp(`data-mk="${id}">[^]*?<rect class="ch-mkr" x="-?\\d+" y="(-?\\d+)"`).exec(html) || [])[1]);
    expect(tagY("L-1:in")).toBeGreaterThan(cy(bars[20]!.c));
    expect(tagY("L-1:out")).toBeLessThan(cy(bars[26]!.c));
    expect(html).toContain(">BUY 0.002 BTC · 83,212</text>");
    expect(html).toContain('<g class="ch-mk up in" data-k="mk:L-1:in" data-mk="L-1:in"><title>BUY 0.002 BTC · 83,212</title>');
    // the exit just happened: a ring round its dot, its result floating up beside it
    expect(html).toContain('<g class="ch-mk ink out fresh" data-k="mk:L-1:out" data-mk="L-1:out">');
    expect(html).toContain(`<circle class="ch-mkp" cx="${cx(26)}" cy="${cy(bars[26]!.c)}" r="6"/><text class="ch-mkf up" x="${Math.round(cx(26) + 12)}" y="${Math.round(cy(bars[26]!.c) + 5)}">+$1.50</text>`);
    // an older trade: its dot alone, its words on hover
    const quiet = (/<g class="ch-mk up in" data-k="mk:L-0:in" data-mk="L-0:in">([^]*?)<\/g>/.exec(html) || [])[1] || "";
    expect(quiet).toBe(`<title>BUY 0.001 BTC · 83,132</title><circle class="ch-mkd" cx="${cx(12)}" cy="${cy(bars[12]!.c)}" r="5"/>`);
    // three closes a bar apart at one price: their words stack, none over another
    p.run(`chMarks(EL, [0, 1, 2].map((k) => ({ id: "c" + k, t: ${at(22)} + k * ${HOUR}, price: 83150, kind: "out", label: "SOLD · stop · −$0.40", tone: "ink" })))`);
    await settle();
    const rects = [...p.el.querySelector(".ch-lines").innerHTML.matchAll(/<rect class="ch-mkr" x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => m.slice(1).map(Number));
    expect(rects).toHaveLength(3);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [ax, ay, aw, ah] = rects[i]!;
        const [bx, by, bw, bh] = rects[j]!;
        expect(ax! < bx! + bw! && bx! < ax! + aw! && ay! < by! + bh! && by! < ay! + ah!, `${i} and ${j}`).toBe(false);
      }
    }
    // none: the layer goes
    p.run("chMarks(EL, [])");
    await settle();
    expect(p.el.querySelector(".ch-lines").innerHTML).not.toContain("ch-mksvg");
    p.run("chRelease(EL)");
  });

  it("turns an entry's words over its dot where the pane's foot is near, and on a narrow plot says each trade by its short words — the whole of it on hover", async () => {
    const bars = hourly(30);
    const q = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})), { size: { w: 330, h: 360 } });
    q.run('chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT", priceStep: 0.5 })');
    await settle();
    // a price just over the price pane's foot
    const low = q.run<number>("CH.get(EL).L.sc.price(CH.get(EL).L.sc.bottom - 10)");
    q.run(`chMarks(EL, [{ id: "a", t: ${bars[15]!.t + 60_000}, price: ${bars[15]!.c}, kind: "in", label: "BUY 0.002 BTC · 83,162", short: "BUY", tone: "up" }, { id: "b", t: ${bars[1]!.t + 60_000}, price: ${low}, kind: "in", label: "BUY 0.001 BTC · low", short: "BUY", tone: "up" }])`);
    await settle();
    const html = q.el.querySelector(".ch-lines").innerHTML;
    expect(html).toMatch(/<text class="ch-mkt"[^>]*>BUY<\/text>/);
    expect(html).not.toMatch(/<text class="ch-mkt"[^>]*>BUY 0\.00/);
    expect(html).toContain("<title>BUY 0.002 BTC · 83,162</title>");
    // the low entry: under its dot there is no room above the pane's foot, so its words go over it
    const y = q.run<number>(`Math.round(CH.get(EL).L.sc.y(${low})) + 0.5`);
    expect(y + 12 + 20).toBeGreaterThan(q.run<number>("CH.get(EL).L.sc.bottom"));
    const tag = Number((/data-mk="b">[^]*?<rect class="ch-mkr" x="-?\d+" y="(-?\d+)"/.exec(html) || [])[1]);
    expect(tag).toBeLessThan(y);
    q.run("chRelease(EL)");
  });
});

describe("the chart filling the window", () => {
  const bars = hourly(30);
  const mount = (opts = "") => {
    const p = page((path) => (path.startsWith("/api/account/candles") ? candles(bars) : new Promise(() => {})));
    p.run(`chMount(EL, { venue: "okx", symbol: "BTC/USDT", kind: "spot", quote: "USDT"${opts} })`);
    return p;
  };
  const doc = (p: ReturnType<typeof page>) => p.sandbox.document as Omit<Fake, "querySelector"> & { documentElement: { dataset: Record<string, string> }; querySelector: () => unknown };
  const pressFull = (el: Fake) => el.fire("click", { target: { closest: () => ({ dataset: { chFull: "" } }) } });

  it("offers the button only where the page asked for it; pressed, the frame fills the window and the page behind holds still; again, the page's own layout", async () => {
    const plain = mount();
    await settle();
    expect(plain.el.innerHTML).not.toContain("data-ch-full");
    plain.run("chFull(EL, true)");
    expect(plain.el.classes.has("ch-full")).toBe(false);
    plain.run("chRelease(EL)");
    const p = mount(", fullscreen: true");
    await settle();
    expect(p.el.innerHTML).toContain('<button type="button" class="ch-iv ch-fullb" data-ch-full aria-pressed="false" data-fk="ch-full" aria-label="Fill the window" title="Fill the window with the chart (F)">');
    pressFull(p.el);
    expect(p.el.classes.has("ch-full")).toBe(true);
    expect(doc(p).documentElement.dataset.chartFull).toBe("");
    // the head drawn again: the button says the way back
    const head = () => p.el.querySelector(".ch-head").innerHTML;
    expect(head()).toContain('data-ch-full aria-pressed="true" data-fk="ch-full" aria-label="Back to the page" title="Back to the page (Esc, or F)">');
    pressFull(p.el);
    expect(p.el.classes.has("ch-full")).toBe(false);
    expect(doc(p).documentElement.dataset.chartFull).toBeUndefined();
    expect(head()).toContain('data-ch-full aria-pressed="false"');
    p.run("chRelease(EL)");
  });

  it("F on the plot fills the window and brings the page back; Esc anywhere brings it back unless a sheet or the drawer is open; the page's own call, and release, bring it back", async () => {
    const p = mount(", fullscreen: true");
    await settle();
    const plot = p.el.querySelector(".ch-plot");
    plot.fire("keydown", { key: "f" });
    expect(p.el.classes.has("ch-full")).toBe(true);
    // a chord is the browser's own
    plot.fire("keydown", { key: "f", ctrlKey: true });
    expect(p.el.classes.has("ch-full")).toBe(true);
    plot.fire("keydown", { key: "F" });
    expect(p.el.classes.has("ch-full")).toBe(false);
    plot.fire("keydown", { key: "f" });
    // Esc pressed inside a sheet: the sheet's own
    doc(p).fire("keydown", { key: "Escape", target: { closest: (sel: string) => (sel === "dialog" ? {} : null) } });
    expect(p.el.classes.has("ch-full")).toBe(true);
    // a sheet open anywhere on the page
    doc(p).querySelector = () => ({ open: true });
    doc(p).fire("keydown", { key: "Escape", target: { closest: () => null } });
    expect(p.el.classes.has("ch-full")).toBe(true);
    doc(p).querySelector = () => null;
    doc(p).fire("keydown", { key: "Escape", target: { closest: () => null } });
    expect(p.el.classes.has("ch-full")).toBe(false);
    expect(doc(p).documentElement.dataset.chartFull).toBeUndefined();
    // the page leaving the chart's tab asks the same; release lets the view go with the chart
    p.run("chFull(EL, true)");
    expect(p.el.classes.has("ch-full")).toBe(true);
    p.run("chFull(EL, false)");
    expect(p.el.classes.has("ch-full")).toBe(false);
    p.run("chFull(EL, true)");
    p.run("chRelease(EL)");
    expect(p.el.classes.has("ch-full")).toBe(false);
    expect(doc(p).documentElement.dataset.chartFull).toBeUndefined();
  });
});
