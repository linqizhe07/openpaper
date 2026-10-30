/** THE RECORDER'S COMMAND (npm run account:record): Hyperliquid's public stream for a few perpetuals — every trade, every change of the
 * best bid and ask, the mark, oracle and funding — kept in the home for backtests and research (record/recorder.ts, record/store.ts), until
 * Ctrl-C; a line an hour says what was kept. Once a recorded day is over, its one-minute bars are built from its trades and checked
 * against Hyperliquid's own candles (record/check.ts); --check does that for one day and stops.
 *
 *   npm run account:record
 *   npm run account:record -- --coins BTC,ETH,SOL,HYPE
 *   npm run account:record -- --check 2026-10-29
 *   --coins   Hyperliquid perpetuals by coin, as it names them (BTC,ETH,SOL)     --home   the account's home (~/.openpaper, or OPENPAPER_HOME)
 *   --check   a recorded day, YYYY-MM-DD in UTC: its bars built and checked      --quiet  no line an hour
 * Recording is the owner's own act at their terminal: Markets and the charts write no market data (live/history.ts). One recorder a
 * home at a time; it needs Node's WebSocket (Node 22 or later). */
import { fileURLToPath } from "node:url";
import { isRefusal } from "../core/errors.ts";
import { defaultHome } from "./home.ts";
import { hyperliquidInfo } from "./live/public-markets.ts";
import { realHttp } from "./live/types.ts";
import { checkDay, checkWords, hyperliquidMinutes } from "./record/check.ts";
import { HyperliquidRecorder } from "./record/recorder.ts";
import { CHANNELS, isDay, recordDir } from "./record/store.ts";

export const RECORD_COINS_DEFAULT = ["BTC", "ETH", "SOL"];
/** the most coins one recorder keeps */
export const RECORD_COINS_MOST = 20;

const USAGE = `usage: npm run account:record -- [--coins ${RECORD_COINS_DEFAULT.join(",")}] [--home DIR] [--quiet]
       npm run account:record -- --check YYYY-MM-DD [--coins ${RECORD_COINS_DEFAULT.join(",")}] [--home DIR]
Records Hyperliquid's public stream of the coins' perpetuals — every trade, every change of the best bid and ask, the mark, oracle and
funding — into <home>/recordings/hyperliquid/ for backtests and research, until Ctrl-C. Once a recorded day is over, its one-minute bars
are built from its trades and checked against Hyperliquid's own candles; --check does that for one day (within three days of its end).`;

export type RecordOptions = { coins: string[]; home: string; quiet: boolean } | { check: string; coins: string[]; home: string };

export function parseRecordArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env): RecordOptions | { error: string } | { help: true } {
  const switches = new Set(["--quiet", "--help", "-h"]);
  const known = new Set(["--coins", "--home", "--check", ...switches]);
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const eq = a.indexOf("=");
    const name = eq > 0 && a.startsWith("--") ? a.slice(0, eq) : a;
    if (!known.has(name)) return { error: `unknown option ${a.slice(0, 40)}\n${USAGE}` };
    if (switches.has(name)) {
      flags.set(name, true);
      continue;
    }
    const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (value === undefined || value.startsWith("--")) return { error: `${name} needs a value\n${USAGE}` };
    flags.set(name, value);
  }
  if (flags.has("--help") || flags.has("-h")) return { help: true };
  const coinsText = flags.get("--coins");
  const coins = typeof coinsText === "string" ? coinsText.split(",").map((c) => c.trim()).filter(Boolean) : RECORD_COINS_DEFAULT;
  if (!coins.length) return { error: "--coins names at least one coin: BTC,ETH,SOL" };
  for (const c of coins) if (!/^[A-Za-z0-9]{1,12}$/.test(c)) return { error: `a coin is Hyperliquid's own name for it, letters and digits (BTC, kPEPE), not "${c.slice(0, 20)}"` };
  if (new Set(coins).size !== coins.length) return { error: "--coins names a coin twice" };
  if (coins.length > RECORD_COINS_MOST) return { error: `a recorder keeps ${RECORD_COINS_MOST} coins at most` };
  const home = typeof flags.get("--home") === "string" ? (flags.get("--home") as string) : defaultHome(env);
  const check = flags.get("--check");
  if (typeof check === "string") {
    if (!isDay(check)) return { error: `--check is a day, YYYY-MM-DD, not "${check.slice(0, 20)}"` };
    if (flags.has("--quiet")) return { error: "--quiet goes with recording, not with --check" };
    return { check, coins, home };
  }
  return { coins, home, quiet: flags.has("--quiet") };
}

/** a day checked for each coin, said line by line; whether every check ran */
async function checkAll(day: string, coins: readonly string[], home: string, say: (line: string) => void): Promise<boolean> {
  const minutes = hyperliquidMinutes(hyperliquidInfo(realHttp, 15_000));
  let ok = true;
  for (const coin of coins) {
    const c = await checkDay(home, coin, day, minutes, Date.now());
    if (isRefusal(c)) {
      ok = false;
      say(`${coin} ${day}: not checked — ${c.message ?? c.code}`);
    } else say(checkWords(c));
  }
  return ok;
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const parsed = parseRecordArgs(process.argv.slice(2));
  if ("help" in parsed) {
    console.log(USAGE);
    process.exit(0);
  }
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(2);
  }
  if ("check" in parsed) {
    const ok = await checkAll(parsed.check, parsed.coins, parsed.home, (l) => console.log(l));
    process.exit(ok ? 0 : 1);
  }
  const say = (line: string): void => console.log(`${new Date().toISOString().slice(0, 19).replace("T", " ")}  ${line}`);
  const recorder = new HyperliquidRecorder({
    home: parsed.home,
    coins: parsed.coins,
    say: parsed.quiet ? (line) => (line.startsWith("recorded ") ? undefined : say(line)) : say,
    dayEnded: (day) => void checkAll(day, parsed.coins, parsed.home, say).catch((e: unknown) => say(`the check of ${day} failed: ${String((e as Error)?.message ?? e)}`)),
  });
  const refused = recorder.start();
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
  console.log(`recording Hyperliquid's ${parsed.coins.join(", ")} perpetuals (${CHANNELS.join(", ")}) into ${recordDir(parsed.home)} · a line an hour · Ctrl-C to stop`);
  const stop = (): void => {
    recorder.stop();
    const kept = [...recorder.kept].map(([k, n]) => `${k} ${n.toLocaleString("en-US")}`).join(" · ");
    console.log(`stopped: ${kept || "nothing came"} (messages this run)`);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
