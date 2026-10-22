/**
 * The numbers the site (site/) shows, computed from this repository — never typed by hand.
 *
 *   node --import tsx scripts/site-numbers.ts            writes site/data/numbers.json
 *   node --import tsx scripts/site-numbers.ts --check    exit 1 when that file no longer says what the repository says
 *
 * test/unit/site-numbers.test.ts compares the file and every data-stat on the page with compute(); the Pages workflow runs --check.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TABS } from "../src/portfolio/live/categories.ts";
import { exchangeList } from "../src/portfolio/live/exchange.ts";
import { CONNECTORS } from "../src/portfolio/live/index.ts";
import { DEFAULT_CAP_USD } from "../src/portfolio/cli.ts";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const NUMBERS_FILE = join(ROOT, "site", "data", "numbers.json");

/** the wordmark strip ("Your own accounts at"), in the long README's own order (docs/README.zh.md, its 能接什么 table): a name is here only because that table
 * has a row for it; an exchange carries its library id so the count of the ones not named is computed, not guessed */
export const STRIP: ReadonlyArray<{ name: string; exchangeId?: string; watch?: boolean }> = [
  { name: "OKX", exchangeId: "okx" },
  { name: "Kraken", exchangeId: "kraken" },
  { name: "Coinbase", exchangeId: "coinbase" },
  { name: "Binance", exchangeId: "binance" },
  { name: "Bybit", exchangeId: "bybit" },
  { name: "KuCoin", exchangeId: "kucoin" },
  { name: "Alpaca" },
  { name: "Robinhood" },
  { name: "Kalshi" },
  { name: "Polymarket US" },
  { name: "Polymarket" },
  { name: "MetaMask" },
  { name: "OKX Wallet" },
  { name: "Hyperliquid" },
  { name: "Ondo", watch: true },
];

export interface SiteNumbers {
  /** the day the file was written (not compared) */
  generatedAt: string;
  mcpTools: { real: number; simulationOnly: number; names: string[] };
  marketKinds: { count: number; labels: string[] };
  connectionKinds: { count: number; ids: string[] };
  exchanges: { byApiKey: number; named: number; more: number };
  capUsd: number;
  cardMinutes: number;
  tests: { files: number; attackFiles: number };
  strip: Array<{ name: string; watch?: boolean }>;
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** registrations in src/portfolio/mcp.ts: the file starts a stdio server when imported, so it is read, not imported. A call at column 0
 * is always registered; an indented one sits inside an `if (!REAL)` block and exists only on the simulated statement (--classic) */
export function mcpTools(): SiteNumbers["mcpTools"] {
  const lines = read("src/portfolio/mcp.ts").split("\n");
  const names = { real: [] as string[], sim: [] as string[] };
  lines.forEach((line, i) => {
    const m = /^(\s*)server\.registerTool\($/.exec(line);
    if (!m) return;
    const name = /"(portfolio_[a-z_]+)"/.exec(`${lines[i + 1] ?? ""}\n${lines[i + 2] ?? ""}`)?.[1];
    if (!name) throw new Error(`mcp.ts line ${i + 1}: a registerTool without a "portfolio_…" name on the next line`);
    (m[1] ? names.sim : names.real).push(name);
  });
  if (names.real.length === 0) throw new Error("mcp.ts: no registrations found");
  return { real: names.real.length, simulationOnly: names.sim.length, names: names.real };
}

/** --live-cap's default, the one cli.ts gives the server */
export function capUsd(): number {
  return DEFAULT_CAP_USD;
}

/** how long a card waits for the owner, from mode-rules.ts */
export function cardMinutes(): number {
  const m = /CARD_TTL_MS\s*=\s*(\d+)\s*\*\s*60_?000/.exec(read("src/portfolio/account/mode-rules.ts"));
  if (!m) throw new Error("mode-rules.ts: CARD_TTL_MS was not found as <minutes> * 60_000");
  return Number(m[1]);
}

/** every test file, and the attack reproductions among them */
export function tests(): SiteNumbers["tests"] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".test.ts")) files.push(relative(ROOT, p));
    }
  };
  walk(join(ROOT, "test"));
  return { files: files.length, attackFiles: files.filter((f) => f.startsWith("test/attack/")).length };
}

export async function compute(): Promise<SiteNumbers> {
  const exchanges = await exchangeList();
  const ids = new Set(exchanges.map((x) => x.id));
  for (const s of STRIP) if (s.exchangeId && !ids.has(s.exchangeId)) throw new Error(`the strip names exchange "${s.exchangeId}", which the library no longer lists`);
  const named = STRIP.filter((s) => s.exchangeId).length;
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    mcpTools: mcpTools(),
    marketKinds: { count: TABS.filter((t) => t.id !== "all").length, labels: TABS.filter((t) => t.id !== "all").map((t) => t.label) },
    connectionKinds: { count: CONNECTORS.length, ids: CONNECTORS.map((c) => c.kind) },
    exchanges: { byApiKey: exchanges.length, named, more: exchanges.length - named },
    capUsd: capUsd(),
    cardMinutes: cardMinutes(),
    tests: tests(),
    strip: STRIP.map(({ name, watch }) => (watch ? { name, watch } : { name })),
  };
}

/** what is compared: everything but the day */
export const comparable = (n: SiteNumbers) => {
  const { generatedAt: _, ...rest } = n;
  return rest;
};

/** a value for a data-stat key such as "exchanges.byApiKey" */
export const statAt = (n: SiteNumbers, key: string): unknown => key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), n);

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const n = await compute();
  if (process.argv.includes("--check")) {
    const file = JSON.parse(readFileSync(NUMBERS_FILE, "utf8")) as SiteNumbers;
    const a = JSON.stringify(comparable(file), null, 2);
    const b = JSON.stringify(comparable(n), null, 2);
    if (a !== b) {
      console.error(`site/data/numbers.json is stale: run \`npm run site:numbers\`\n--- file\n${a}\n--- repository\n${b}`);
      process.exit(1);
    }
    console.log("site/data/numbers.json says what the repository says");
  } else {
    writeFileSync(NUMBERS_FILE, JSON.stringify(n, null, 2) + "\n");
    console.log(`wrote ${relative(ROOT, NUMBERS_FILE)}`);
    console.log(JSON.stringify(comparable(n), null, 2));
  }
}
