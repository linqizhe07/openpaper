import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import type { Refusal } from "../../src/core/errors.ts";
import { parseRecordArgs, RECORD_COINS_MOST } from "../../src/portfolio/account-record.ts";
import type { WebSocketLike } from "../../src/portfolio/live/stream-hub.ts";
import { checkDay, checkWords, minuteBars, tradesOf, type DayCheck, type HlMinute } from "../../src/portfolio/record/check.ts";
import { CHECK_AFTER_MS, hourWords, HyperliquidRecorder } from "../../src/portfolio/record/recorder.ts";
import { barsFile, CHANNELS, coverage, lockFile, rawFile, readManifest, readSessions, recordDir, RecordStore, releaseLock, takeLock } from "../../src/portfolio/record/store.ts";

/** THE RECORDER (npm run account:record; record/store.ts, recorder.ts, check.ts): Hyperliquid's public stream of a few perpetuals kept as it
 * came — a file an hour, gzipped and hashed once the hour is over, the sessions saying what was covered — the connection kept alive and
 * opened again, and a recorded day's bars built from its trades and checked against Hyperliquid's own. No network: a stand-in socket. */
const T0 = Date.parse("2026-10-29T12:34:00Z");
const DAY = "2026-10-29";
const at = (s: string): number => Date.parse(`${s}Z`);
const iso = (ms: number): string => new Date(ms).toISOString();
const COINS = ["BTC", "ETH", "SOL"];

const homes: string[] = [];
afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const tmp = (): string => {
  const h = mkdtempSync(join(tmpdir(), "record-"));
  homes.push(h);
  return h;
};
const lines = (file: string): unknown[] => (readFileSync(file, "utf8").split("\n").filter((l) => l.trim()) as string[]).map((l) => JSON.parse(l) as unknown);

/** stand-in WebSockets: what the recorder sends kept, and the test says what the venue does */
function sockets() {
  const made: StandIn[] = [];
  class StandIn implements WebSocketLike {
    readyState = 0;
    readonly sent: unknown[] = [];
    closed = false;
    private readonly ls = new Map<string, Array<(ev: { data?: unknown }) => void>>();
    constructor(readonly url: string) {
      made.push(this);
    }
    send(data: string): void {
      this.sent.push(JSON.parse(data));
    }
    close(): void {
      this.closed = true;
    }
    addEventListener(type: string, l: (ev: { data?: unknown }) => void): void {
      this.ls.set(type, [...(this.ls.get(type) ?? []), l]);
    }
    emit(type: "open" | "message" | "close" | "error", data?: unknown): void {
      for (const l of this.ls.get(type) ?? []) l({ data });
    }
    say(m: unknown): void {
      this.emit("message", JSON.stringify(m));
    }
  }
  return { made, Ws: StandIn };
}
const trade = (coin: string, tid: number, time: number, px: string, sz: string, side: "B" | "A") => ({ coin, side, px, sz, time, hash: "0x00", tid, users: ["0xa", "0xb"] });
const BBO = { coin: "ETH", time: T0, bbo: [{ px: "3999.9", sz: "1.2", n: 3 }, { px: "4000.0", sz: "0.8", n: 2 }] };
const CTX = { coin: "SOL", ctx: { funding: "0.0000125", openInterest: "100", oraclePx: "200.1", markPx: "200.0" } };

function recorder(o: { home?: string; now: () => number; dayEnded?: (day: string) => void }) {
  const home = o.home ?? tmp();
  const { made, Ws } = sockets();
  const r = new HyperliquidRecorder({ home, coins: COINS, WebSocket: Ws, clock: o.now, random: () => 0, lookMs: 0, dayEnded: o.dayEnded });
  return { home, made, r };
}

describe("the recordings on disk", () => {
  it("writes each message as it came, a file an hour; once the hour is over the file is gzipped, hashed and listed in the day's manifest, and never written over", () => {
    const home = tmp();
    const store = new RecordStore(home);
    store.write("BTC", "trades", at("2026-10-29T12:34:01"), [trade("BTC", 1, T0, "100", "1", "B")]);
    store.write("BTC", "trades", at("2026-10-29T12:59:59.500"), [trade("BTC", 2, T0, "101", "1", "A")]);
    store.write("BTC", "trades", at("2026-10-29T13:00:00.200"), [trade("BTC", 3, T0, "102", "1", "B")]);
    store.flush();
    const twelve = rawFile(home, "BTC", "trades", at("2026-10-29T12:00:00"));
    expect(lines(twelve)).toEqual([
      { r: at("2026-10-29T12:34:01"), d: [trade("BTC", 1, T0, "100", "1", "B")] },
      { r: at("2026-10-29T12:59:59.500"), d: [trade("BTC", 2, T0, "101", "1", "A")] },
    ]);
    // inside the five seconds after the hour: still open
    expect(store.closeHours(at("2026-10-29T13:00:04"))).toEqual([]);
    const closed = store.closeHours(at("2026-10-29T13:00:05"));
    const gz = readFileSync(`${twelve}.gz`);
    expect(closed).toEqual([{ path: `raw/BTC/trades/${DAY}/12.jsonl.gz`, lines: 2, bytes: gz.length, sha256: createHash("sha256").update(gz).digest("hex") }]);
    expect(existsSync(twelve)).toBe(false);
    expect(gunzipSync(gz).toString("utf8").split("\n").filter(Boolean).length).toBe(2);
    expect(readManifest(home, DAY).files).toEqual(closed);
    // a line for an hour already closed (the clock went back) goes to a file beside it, never over it
    store.write("BTC", "trades", at("2026-10-29T12:40:00"), [trade("BTC", 4, T0, "103", "1", "B")]);
    const again = store.closeHours(at("2026-10-29T13:00:10"));
    expect(again[0]!.path).toMatch(/^raw\/BTC\/trades\/2026-10-29\/12\.\d+\.jsonl\.gz$/);
    expect(readFileSync(`${twelve}.gz`)).toEqual(gz);
    expect(readManifest(home, DAY).files.map((f) => f.path)).toEqual([again[0]!.path, `raw/BTC/trades/${DAY}/12.jsonl.gz`].sort());
    expect(statSync(`${twelve}.gz`).mode & 0o777).toBe(0o600);
  });

  it("says what was covered: a session from its open to its close, one never closed to its last alive, and one across midnight closed then and opened again in the next day", () => {
    const home = tmp();
    const open = (s: string) => ({ at: iso(at(s)), event: "open" as const, coins: COINS, channels: CHANNELS });
    const store = new RecordStore(home);
    store.log(open("2026-10-29T10:00:00"));
    store.log({ at: iso(at("2026-10-29T10:01:00")), event: "alive" });
    store.log({ at: iso(at("2026-10-29T10:30:00")), event: "close", why: "the connection closed" });
    store.log(open("2026-10-29T10:31:00"));
    store.log({ at: iso(at("2026-10-29T10:32:00")), event: "alive" });
    // the recorder killed; a new one opens later and runs past midnight
    const next = new RecordStore(home);
    next.log(open("2026-10-29T11:00:00"));
    next.log({ at: iso(at("2026-10-29T23:59:30")), event: "alive" });
    next.log({ at: iso(at("2026-10-30T00:00:30")), event: "alive" });
    next.log({ at: iso(at("2026-10-30T00:10:00")), event: "close", why: "the recorder stopped" });
    expect(coverage(home, DAY)).toEqual([
      { from: iso(at("2026-10-29T10:00:00")), to: iso(at("2026-10-29T10:30:00")), why: "the connection closed" },
      { from: iso(at("2026-10-29T10:31:00")), to: iso(at("2026-10-29T10:32:00")), why: "the recorder stopped without closing it" },
      { from: iso(at("2026-10-29T11:00:00")), to: iso(at("2026-10-30T00:00:00")), why: "the day ended" },
    ]);
    expect(coverage(home, "2026-10-30")).toEqual([{ from: iso(at("2026-10-30T00:00:00")), to: iso(at("2026-10-30T00:10:00")), why: "the recorder stopped" }]);
    expect(readSessions(home, "2026-10-30")[0]).toMatchObject({ event: "open", continued: true });
  });

  it("one recorder a home: a second is refused while the first's process runs; a lock whose process is gone is taken over", () => {
    const home = tmp();
    const first = takeLock(home);
    if (!("token" in first)) throw new Error(first.error);
    expect(takeLock(home)).toEqual({ error: `a recorder is writing to ${recordDir(home)} already (process ${process.pid}): one at a time` });
    releaseLock(home, first.token);
    writeFileSync(lockFile(home), "99999999 gone");
    expect("token" in takeLock(home)).toBe(true);
  });
});

describe("the recorder", () => {
  it("subscribes every coin's trades, best bid and ask and context, and writes a recorded coin's messages as they came — nothing else", () => {
    let now = T0;
    const { home, made, r } = recorder({ now: () => now });
    expect(r.start()).toBeUndefined();
    expect(made.map((s) => s.url)).toEqual(["wss://api.hyperliquid.xyz/ws"]);
    const s = made[0]!;
    s.emit("open");
    expect(s.sent).toEqual(COINS.flatMap((coin) => CHANNELS.map((type) => ({ method: "subscribe", subscription: { type, coin } }))));
    expect(readSessions(home, DAY)).toEqual([{ at: iso(T0), event: "open", coins: COINS, channels: [...CHANNELS] }]);
    now += 1_000;
    const trades = [trade("BTC", 7, now - 5, "100000.0", "0.01", "B")];
    s.say({ channel: "subscriptionResponse", data: { method: "subscribe" } });
    s.say({ channel: "trades", data: trades });
    s.say({ channel: "bbo", data: BBO });
    s.say({ channel: "activeAssetCtx", data: CTX });
    s.say({ channel: "pong" });
    s.say({ channel: "bbo", data: { ...BBO, coin: "DOGE" } });
    s.emit("message", "not json");
    r.look();
    expect(lines(rawFile(home, "BTC", "trades", now))).toEqual([{ r: now, d: trades }]);
    expect(lines(rawFile(home, "ETH", "bbo", now))).toEqual([{ r: now, d: BBO }]);
    expect(lines(rawFile(home, "SOL", "activeAssetCtx", now))).toEqual([{ r: now, d: CTX }]);
    expect(existsSync(join(recordDir(home), "raw", "DOGE"))).toBe(false);
    expect([...r.kept]).toEqual([["BTC trades", 1], ["ETH bbo", 1], ["SOL activeAssetCtx", 1]]);
    // a second recorder on the same home is refused while this one runs
    const other = recorder({ home, now: () => now });
    expect(other.r.start()).toMatch(/^a recorder is writing to .* already/);
    r.stop();
    expect(readSessions(home, DAY).at(-1)).toEqual({ at: iso(now), event: "close", why: "the recorder stopped" });
    expect(existsSync(lockFile(home))).toBe(false);
  });

  it("keeps the connection alive: a ping once it has been quiet, one at least every 25 seconds, and an alive row every minute it carries", () => {
    let now = T0;
    const { home, made, r } = recorder({ now: () => now });
    r.start();
    const s = made[0]!;
    s.emit("open");
    const pings = () => s.sent.filter((m) => (m as { method?: string }).method === "ping").length;
    now += 1_000;
    r.look();
    expect(pings()).toBe(0);
    now += 600;
    r.look();
    expect(pings()).toBe(1);
    // talking every second: no quiet ping, but one when 25 seconds have gone without the recorder sending
    for (let i = 0; i < 30; i++) {
      now += 1_000;
      s.say({ channel: "bbo", data: BBO });
      r.look();
    }
    expect(pings()).toBe(2);
    for (let i = 0; i < 30; i++) {
      now += 1_000;
      s.say({ channel: "bbo", data: BBO });
      r.look();
    }
    expect(readSessions(home, DAY).filter((x) => x.event === "alive").map((x) => x.at)).toEqual([iso(T0 + 60_600)]);
  });

  it("a connection that closes is opened again after its wait; one silent ten seconds is given up; a sleep closes the session where the machine stopped — each said in the sessions", () => {
    let now = T0;
    const { home, made, r } = recorder({ now: () => now });
    r.start();
    made[0]!.emit("open");
    now += 2_000;
    made[0]!.say({ channel: "pong" });
    made[0]!.emit("close");
    r.look();
    // the wait: half a second at first (the jitter is the stand-in's 0)
    expect(made.length).toBe(1);
    now += 500;
    r.look();
    expect(made.length).toBe(2);
    made[1]!.emit("open");
    // nothing comes: given up after ten seconds, and opened again on the look after its wait
    for (let i = 0; i < 11; i++) {
      now += 1_000;
      r.look();
    }
    expect(made.length).toBe(2);
    now += 1_000;
    r.look();
    expect(made.length).toBe(3);
    made[2]!.emit("open");
    now += 2_000;
    made[2]!.say({ channel: "pong" });
    r.look();
    const slept = now;
    now += 60_000;
    r.look();
    expect(made.length).toBe(4);
    const closes = readSessions(home, DAY).filter((x) => x.event === "close");
    expect(closes).toEqual([
      { at: iso(T0 + 2_000), event: "close", why: "the connection closed" },
      { at: iso(T0 + 2_500 + 11_000), event: "close", why: "the connection said nothing for 10 seconds" },
      { at: iso(slept), event: "close", why: "the machine slept" },
    ]);
    expect(coverage(home, DAY).map((c) => [c.from, c.to])).toEqual([
      [iso(T0), iso(T0 + 2_000)],
      [iso(T0 + 2_500), iso(T0 + 13_500)],
      [iso(T0 + 14_500), iso(slept)],
    ]);
    r.stop();
  });

  it("hands a day it recorded on to the check once ten minutes of the next have passed, once; a day it did not record, never", () => {
    let now = at("2026-10-29T23:59:00");
    const ended: string[] = [];
    const { made, r } = recorder({ now: () => now, dayEnded: (d) => ended.push(d) });
    r.start();
    made[0]!.emit("open");
    while (now < at("2026-10-30T00:00:00") + CHECK_AFTER_MS + 5_000) {
      now += 1_000;
      made[0]!.say({ channel: "pong" });
      r.look();
      if (now < at("2026-10-30T00:00:00") + CHECK_AFTER_MS) expect(ended).toEqual([]);
    }
    expect(ended).toEqual([DAY]);
    r.stop();
    let later = at("2026-10-30T00:20:00");
    const none: string[] = [];
    const fresh = recorder({ now: () => later, dayEnded: (d) => none.push(d) });
    fresh.r.start();
    later += 1_000;
    fresh.r.look();
    expect(none).toEqual([]);
    fresh.r.stop();
  });

  it("says an hour's files in a line", () => {
    const f = (path: string, lines: number, bytes: number) => ({ path, lines, bytes, sha256: "0" });
    expect(hourWords([f(`raw/BTC/trades/${DAY}/12.jsonl.gz`, 1_234, 524_288), f(`raw/BTC/bbo/${DAY}/12.jsonl.gz`, 40_000, 524_288), f(`raw/ETH/activeAssetCtx/${DAY}/12.jsonl.gz`, 3_600, 0)])).toBe(`recorded ${DAY} 12:00 UTC: BTC 1,234 trades · 40,000 bbo · 0 ctx; ETH 0 trades · 0 bbo · 3,600 ctx (3 files, 1.0 MB)`);
  });
});

describe("a recorded day's bars, checked", () => {
  /** a day recorded: the trades as they came (one hour before it, one after), and a session over its first three minutes */
  function recorded(home: string): void {
    const store = new RecordStore(home);
    store.log({ at: iso(at("2026-10-29T00:00:00")), event: "open", coins: ["BTC"], channels: CHANNELS });
    store.log({ at: iso(at("2026-10-29T00:03:00")), event: "close", why: "the recorder stopped" });
    store.write("BTC", "trades", at("2026-10-28T23:59:59.900"), [trade("BTC", 1, at("2026-10-29T00:00:00.050"), "100", "1", "B")]);
    store.write("BTC", "trades", at("2026-10-29T00:00:01"), [trade("BTC", 2, at("2026-10-29T00:00:00.500"), "101", "2", "A"), trade("BTC", 3, at("2026-10-29T00:00:59.999"), "99", "1", "B")]);
    // a subscription's first message: Hyperliquid's recent trades again, and one new
    store.write("BTC", "trades", at("2026-10-29T00:01:00.500"), [trade("BTC", 2, at("2026-10-29T00:00:00.500"), "101", "2", "A"), trade("BTC", 3, at("2026-10-29T00:00:59.999"), "99", "1", "B"), trade("BTC", 4, at("2026-10-29T00:01:00.100"), "102", "1", "B")]);
    store.write("BTC", "trades", at("2026-10-30T00:00:00.300"), [trade("BTC", 5, at("2026-10-29T23:59:59.900"), "103", "1", "A"), trade("BTC", 6, at("2026-10-30T00:00:01"), "104", "1", "B")]);
    store.flush();
    // the hours before the last one closed (gzipped), the last still open: both are read
    store.closeHours(at("2026-10-29T23:00:00"));
  }

  it("builds a day's one-minute bars from its trades — each trade once, by the exchange's time, the hour on either side read too", () => {
    const home = tmp();
    recorded(home);
    const { trades, repeated } = tradesOf(home, "BTC", DAY);
    expect(trades.map((t) => t.tid)).toEqual(["1", "2", "3", "4", "5"]);
    expect(repeated).toBe(2);
    expect(minuteBars(trades)).toEqual([
      { t: at("2026-10-29T00:00:00"), o: 100, h: 101, l: 99, c: 99, v: 4, n: 3, buy: 2, vwap: 100.25 },
      { t: at("2026-10-29T00:01:00"), o: 102, h: 102, l: 102, c: 102, v: 1, n: 1, buy: 1, vwap: 102 },
      { t: at("2026-10-29T23:59:00"), o: 103, h: 103, l: 103, c: 103, v: 1, n: 1, buy: 0, vwap: 103 },
    ]);
  });

  it("checks the minutes the recording covered whole against Hyperliquid's own — a differing one counted and said — and keeps the bars and the check", async () => {
    const home = tmp();
    recorded(home);
    const theirs: HlMinute[] = [
      { t: at("2026-10-29T00:00:00"), o: "100", h: "101", l: "99", c: "99", v: "4.0", n: 3 },
      { t: at("2026-10-29T00:01:00"), o: "102", h: "102", l: "102", c: "102", v: "1.0", n: 2 },
      { t: at("2026-10-29T00:02:00"), o: "102", h: "102", l: "102", c: "102", v: "0.0", n: 0 },
      { t: at("2026-10-29T00:05:00"), o: "105", h: "105", l: "105", c: "105", v: "3.0", n: 4 },
    ];
    const asked: Array<[string, number, number]> = [];
    const minutesOf = async (coin: string, from: number, to: number) => {
      asked.push([coin, from, to]);
      return theirs;
    };
    const now = at("2026-10-30T01:00:00");
    const c = (await checkDay(home, "BTC", DAY, minutesOf, now)) as DayCheck;
    expect(asked).toEqual([["BTC", at("2026-10-29T00:00:00"), at("2026-10-30T00:00:00")]]);
    expect(c).toMatchObject({ coin: "BTC", day: DAY, trades: 5, repeated: 2, bars: 3, compared: 3, matched: 2, differ: 1, onlyHere: 0, onlyThere: 0, outside: 1_437 });
    expect(c.examples).toEqual(["00:01 here o 102 h 102 l 102 c 102 v 1 n 1; Hyperliquid o 102 h 102 l 102 c 102 v 1.0 n 2"]);
    expect(checkWords(c)).toBe(`BTC ${DAY}: 5 trades in 3 one-minute bars · 3 minutes compared, 2 the same, 1 minute differ · 1,437 minutes not covered\n  00:01 here o 102 h 102 l 102 c 102 v 1 n 1; Hyperliquid o 102 h 102 l 102 c 102 v 1.0 n 2`);
    const kept = JSON.parse(readFileSync(barsFile(home, "BTC", DAY), "utf8")) as { bars: unknown[]; check: DayCheck; interval: string };
    expect(kept.bars.length).toBe(3);
    expect(kept.interval).toBe("1m");
    expect(readManifest(home, DAY).checks.BTC).toEqual(c);
    // a day not over, one past Hyperliquid's latest 5,000 minutes, one that is not a day: refused in words
    expect(((await checkDay(home, "BTC", "2026-10-30", minutesOf, now)) as Refusal).message).toBe("2026-10-30 has not ended: a day is checked once it is over");
    expect(((await checkDay(home, "BTC", "2026-10-20", minutesOf, now)) as Refusal).message).toMatch(/^Hyperliquid keeps its latest 5,000 one-minute candles/);
    expect(((await checkDay(home, "BTC", "yesterday", minutesOf, now)) as Refusal).message).toBe('a day is YYYY-MM-DD, not "yesterday"');
  });
});

describe("the command", () => {
  const env = { OPENPAPER_HOME: "/h" };
  it("records BTC, ETH and SOL into the home by default; reads --coins, --home, --quiet and --check, = or not", () => {
    expect(parseRecordArgs([], env)).toEqual({ coins: COINS, home: "/h", quiet: false });
    expect(parseRecordArgs(["--coins", "BTC,kPEPE", "--quiet", "--home=/x"], env)).toEqual({ coins: ["BTC", "kPEPE"], home: "/x", quiet: true });
    expect(parseRecordArgs(["--check=2026-10-29", "--coins=ETH"], env)).toEqual({ check: "2026-10-29", coins: ["ETH"], home: "/h" });
    expect(parseRecordArgs(["-h"], env)).toEqual({ help: true });
  });

  it("refuses anything else, in words", () => {
    const err = (argv: string[]) => (parseRecordArgs(argv, env) as { error: string }).error;
    expect(err(["--fast"]).split("\n")[0]).toBe("unknown option --fast");
    expect(err(["--coins"]).split("\n")[0]).toBe("--coins needs a value");
    expect(err(["--coins", "BTC-PERP"])).toBe('a coin is Hyperliquid\'s own name for it, letters and digits (BTC, kPEPE), not "BTC-PERP"');
    expect(err(["--coins", "BTC,BTC"])).toBe("--coins names a coin twice");
    expect(err(["--coins", Array.from({ length: RECORD_COINS_MOST + 1 }, (_, i) => `C${i}`).join(",")])).toBe(`a recorder keeps ${RECORD_COINS_MOST} coins at most`);
    expect(err(["--check", "yesterday"])).toBe('--check is a day, YYYY-MM-DD, not "yesterday"');
    expect(err(["--check", "2026-10-29", "--quiet"])).toBe("--quiet goes with recording, not with --check");
  });
});
