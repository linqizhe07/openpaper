/** THE HYPERLIQUID RECORDER (npm run account:record): Hyperliquid's public WebSocket for a few perpetuals — every trade, every change of
 * the best bid and ask (bbo, each block they change) and the mark, oracle and funding about once a second (activeAssetCtx) — kept as it
 * comes (record/store.ts). One keyless connection; the messages as live/stream-hub.ts reads them (checked live on 2026-10-16), but every
 * one written down rather than the latest kept in memory.
 *
 * Its own clock, every LOOK_MS: what came is flushed to disk, the hours that ended are closed, the connection kept alive (Hyperliquid
 * closes one that sends nothing for sixty seconds: a ping goes every KEEPALIVE_MS, and whenever it has said nothing for QUIET_PING_MS),
 * and a connection that closes, fails, is not open within OPEN_MS or says nothing for DEAD_MS is opened again after a jittered wait,
 * doubling from BACKOFF_MIN_MS to BACKOFF_MAX_MS. A look that comes SLEEP_MS late means the machine slept: the session is closed at the
 * last look before it and the connection opened again at once. Each opening, each minute it carries and each closing is a row of the
 * sessions record, so the time it was not recording is known — never filled in. Once a day is CHECK_AFTER_MS over, the day just ended is
 * handed to the check (record/check.ts) */
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, HUB_URLS, type WebSocketLike, type WebSocketMaker } from "../live/stream-hub.ts";
import { CHANNELS, type ClosedFile, dayOf, dayStart, DAY_MS, RecordStore, recordDir, releaseLock, takeLock, type Channel } from "./store.ts";

const LOOK_MS = 1_000;
/** a look this much later than it was due: the machine slept */
const SLEEP_MS = 5_000;
/** a connection open and silent this long is dead (a ping went every QUIET_PING_MS meanwhile) */
const DEAD_MS = 10_000;
/** a connection not open within this is given up and tried again */
const OPEN_MS = 10_000;
const QUIET_PING_MS = 1_500;
/** the longest the connection goes without sending anything */
const KEEPALIVE_MS = 25_000;
/** how often the sessions record is told the recording still carries */
const ALIVE_MS = 60_000;
/** a day is checked this long after it ended: Hyperliquid's candle of its last minute is final by then */
export const CHECK_AFTER_MS = 10 * 60_000;
const PING = JSON.stringify({ method: "ping" });

export interface RecorderOptions {
  home: string;
  /** Hyperliquid's coins, as it names them: BTC, ETH, SOL */
  coins: string[];
  /** the WebSocket to open (Node's global one unless said) */
  WebSocket?: WebSocketMaker | undefined;
  clock?: (() => number) | undefined;
  random?: (() => number) | undefined;
  /** what the recorder says: a line an hour, and what goes wrong */
  say?: ((line: string) => void) | undefined;
  /** a day just ended that was recorded, handed on once CHECK_AFTER_MS has passed (the command checks it: record/check.ts) */
  dayEnded?: ((day: string) => void) | undefined;
  /** how often it looks by itself; 0: never (a test looks itself) */
  lookMs?: number | undefined;
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

/** what closed in an hour, in a line: each coin's messages by channel, the files and their size */
export function hourWords(closed: readonly ClosedFile[]): string {
  const hours = [...new Set(closed.map((f) => `${f.path.split("/")[3]} ${f.path.split("/")[4]!.slice(0, 2)}:00`))].sort();
  const coins = [...new Set(closed.map((f) => f.path.split("/")[1]!))].sort();
  const per = coins.map((c) => `${c} ${CHANNELS.map((ch) => `${closed.filter((f) => f.path.startsWith(`raw/${c}/${ch}/`)).reduce((s, f) => s + f.lines, 0).toLocaleString("en-US")} ${ch === "activeAssetCtx" ? "ctx" : ch}`).join(" · ")}`);
  const bytes = closed.reduce((s, f) => s + f.bytes, 0);
  return `recorded ${hours.join(", ")} UTC: ${per.join("; ")} (${closed.length} file${closed.length === 1 ? "" : "s"}, ${(bytes / 1_048_576).toFixed(1)} MB)`;
}

export class HyperliquidRecorder {
  private readonly store: RecordStore;
  private readonly coins: Set<string>;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly lookMs: number;
  private ws: WebSocketLike | undefined;
  private state: "closed" | "connecting" | "open" = "closed";
  private recording = false;
  private stopped = true;
  private token: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private openedAt = 0;
  private lastMsgAt = 0;
  private lastSentAt = 0;
  private pingAt = 0;
  private aliveAt = 0;
  private lastLook = 0;
  private retryAt = 0;
  private attempt = 0;
  private readonly handedOn = new Set<string>();
  /** the messages kept this run, by coin and channel */
  readonly kept = new Map<string, number>();

  constructor(private readonly o: RecorderOptions) {
    this.store = new RecordStore(o.home);
    this.coins = new Set(o.coins);
    this.clock = o.clock ?? Date.now;
    this.random = o.random ?? Math.random;
    this.lookMs = o.lookMs ?? LOOK_MS;
  }

  /** the recording started — or why not: another recorder writes to this home */
  start(): string | undefined {
    const lock = takeLock(this.o.home);
    if ("error" in lock) return lock.error;
    this.token = lock.token;
    this.stopped = false;
    this.store.adoptLeftovers();
    const now = this.clock();
    this.lastLook = now;
    this.connect(now);
    if (this.lookMs > 0) this.timer = setInterval(() => this.look(), this.lookMs);
    return undefined;
  }

  /** the recording stopped: its session closed, what came flushed, the lock let go. The hour under way stays open for the next run */
  stop(why = "the recorder stopped"): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.lose(this.clock(), why);
    this.store.flush();
    if (this.token) releaseLock(this.o.home, this.token);
    this.token = undefined;
  }

  /** THE RECORDER'S OWN LOOK (every LOOK_MS, or a test's): see the top of this file */
  look(): void {
    if (this.stopped) return;
    const now = this.clock();
    if (now - this.lastLook - this.lookMs > SLEEP_MS) {
      this.lose(this.lastLook, "the machine slept");
      this.attempt = 0;
      this.retryAt = now;
    }
    this.lastLook = now;
    if (this.state === "connecting" && now - this.openedAt > OPEN_MS) this.lose(now, `the connection was not open within ${OPEN_MS / 1000} seconds`);
    else if (this.state === "open") {
      if (now - this.lastMsgAt > DEAD_MS) this.lose(now, `the connection said nothing for ${DEAD_MS / 1000} seconds`);
      else {
        if (now - this.lastSentAt >= KEEPALIVE_MS || (now - this.lastMsgAt >= QUIET_PING_MS && now - this.pingAt >= QUIET_PING_MS)) {
          this.send(PING);
          this.pingAt = now;
        }
        if (this.recording && now - this.aliveAt >= ALIVE_MS) {
          this.store.log({ at: new Date(now).toISOString(), event: "alive" });
          this.aliveAt = now;
        }
      }
    }
    if (this.state === "closed" && now >= this.retryAt) this.connect(now);
    const closed = this.store.closeHours(now);
    if (closed.length) this.o.say?.(hourWords(closed));
    const yesterday = dayOf(dayStart(dayOf(now)) - DAY_MS);
    if (now - dayStart(dayOf(now)) >= CHECK_AFTER_MS && !this.handedOn.has(yesterday)) {
      this.handedOn.add(yesterday);
      if (this.store.recorded(yesterday)) this.o.dayEnded?.(yesterday);
    }
  }

  /** where it writes */
  get dir(): string {
    return recordDir(this.o.home);
  }

  private connect(now: number): void {
    const Ws = this.o.WebSocket ?? (globalThis as { WebSocket?: WebSocketMaker }).WebSocket;
    if (!Ws) {
      this.o.say?.("no WebSocket in this Node: the recorder needs Node 22 or later");
      this.stop("no WebSocket");
      return;
    }
    let ws: WebSocketLike;
    try {
      ws = new Ws(HUB_URLS.hyperliquid);
    } catch {
      this.backOff(now);
      return;
    }
    this.ws = ws;
    this.state = "connecting";
    this.openedAt = now;
    ws.addEventListener("open", () => this.opened(ws));
    ws.addEventListener("message", (e) => this.heard(ws, e.data));
    ws.addEventListener("close", () => this.closedBy(ws, "the connection closed"));
    ws.addEventListener("error", () => this.closedBy(ws, "the connection failed"));
  }

  /** open: every coin's channels subscribed, and the session opened in the record */
  private opened(ws: WebSocketLike): void {
    if (ws !== this.ws || this.stopped) return;
    const now = this.clock();
    this.state = "open";
    this.lastMsgAt = now;
    for (const coin of this.coins) for (const type of CHANNELS) this.send(JSON.stringify({ method: "subscribe", subscription: { type, coin } }));
    this.store.log({ at: new Date(now).toISOString(), event: "open", coins: [...this.coins], channels: CHANNELS });
    this.recording = true;
    this.aliveAt = now;
  }

  /** a message: a trade, a best bid and ask or a market's context of a coin recorded is written as it came; a pong or a subscription's
   * answer only says the connection carries; an error is said */
  private heard(ws: WebSocketLike, d: unknown): void {
    if (ws !== this.ws) return;
    const now = this.clock();
    this.lastMsgAt = now;
    this.attempt = 0;
    const text = typeof d === "string" ? d : d instanceof ArrayBuffer ? Buffer.from(d).toString("utf8") : ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength).toString("utf8") : "";
    let m: Record<string, unknown>;
    try {
      m = rec(JSON.parse(text));
    } catch {
      return;
    }
    const channel = m.channel;
    let coin: unknown;
    if (channel === "trades" && Array.isArray(m.data)) coin = rec(m.data[0]).coin;
    else if (channel === "bbo" || channel === "activeAssetCtx") coin = rec(m.data).coin;
    else {
      if (channel === "error") this.o.say?.(`Hyperliquid said: ${String(m.data).slice(0, 200)}`);
      return;
    }
    if (typeof coin !== "string" || !this.coins.has(coin)) return;
    this.store.write(coin, channel as Channel, now, m.data);
    const k = `${coin} ${channel as string}`;
    this.kept.set(k, (this.kept.get(k) ?? 0) + 1);
  }

  private closedBy(ws: WebSocketLike, why: string): void {
    if (ws !== this.ws) return;
    this.lose(this.clock(), why);
  }

  /** the connection let go of: the session closed at `at` with why, and opened again after its wait */
  private lose(at: number, why: string): void {
    const ws = this.ws;
    this.ws = undefined;
    this.state = "closed";
    try {
      ws?.close();
    } catch {
      // gone already
    }
    if (this.recording) {
      this.store.log({ at: new Date(at).toISOString(), event: "close", why });
      this.recording = false;
    }
    if (!this.stopped) this.backOff(this.clock());
  }

  private backOff(now: number): void {
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempt);
    this.retryAt = now + BACKOFF_MIN_MS + this.random() * (cap - BACKOFF_MIN_MS);
    this.attempt = Math.min(this.attempt + 1, 16);
  }

  private send(text: string): void {
    if (!this.ws || this.state !== "open") return;
    try {
      this.ws.send(text);
      this.lastSentAt = this.clock();
    } catch {
      this.lose(this.clock(), "the connection failed");
    }
  }
}
