/** THE COMMAND LINES, in one place: every option each entry point takes, with its default and a line of help, so that `--help` and the
 * README say the same thing — and a misspelt option is refused with the list instead of ignored (`--readonly` once left real trading on at
 * the default cap). Node's own util.parseArgs does the parsing. Nothing here imports the account: the site's numbers script and the service
 * read the defaults without starting anything. */
import { parseArgs } from "node:util";

export const DEFAULT_PORT = 4820;
export const DEFAULT_CAP_USD = 100;

export interface Flag {
  name: string;
  /** what follows the flag; none for a switch */
  value?: "number" | "dir" | "dollars";
  help: string;
  default?: string;
}

const HOME_DEFAULT = "$OPENPAPER_HOME, else ~/.openpaper (an earlier version's ~/.buyer-agent-demo is kept in use)";

/** `npm run account -- …` (src/portfolio/server.ts) */
export const SERVER_FLAGS: readonly Flag[] = [
  { name: "port", value: "number", help: "the port the page and the API listen on, on 127.0.0.1 only", default: String(DEFAULT_PORT) },
  { name: "home", value: "dir", help: "the home directory: ledgers, key files, paper books, seats", default: HOME_DEFAULT },
  { name: "live-cap", value: "dollars", help: "the most one order or movement may be worth when the server starts; from Settings the owner signs another figure, which a restart keeps", default: String(DEFAULT_CAP_USD) },
  { name: "read-only", help: "place no order and move no money: the account reads only" },
  { name: "live-writes", help: "trading on, which is the default; kept for commands written before --read-only existed" },
  { name: "fresh", help: "start the account from nothing instead of continuing its earlier runs" },
  { name: "classic", help: "the original simulated statement, without the account layer" },
  { name: "mm", help: "with --classic: the simulated statement reads the real mm CLI" },
  { name: "help", help: "this list" },
];

/** `npm run account:check -- …` (src/portfolio/account-check.ts) */
export const CHECK_FLAGS: readonly Flag[] = [
  { name: "keys", help: "also open each connection whose key file is in the home, read-only: what the venue says the key may do" },
  { name: "home", value: "dir", help: "the home whose key files --keys reads", default: HOME_DEFAULT },
  { name: "json", help: "the report as JSON instead of Markdown" },
  { name: "help", help: "this list" },
];

/** `npm run account:service -- <command> …` (src/portfolio/account-service.ts) */
export const SERVICE_COMMANDS: readonly { name: string; help: string }[] = [
  { name: "install", help: "run `npm run account -- <options>` in the background from now on; the server's options follow" },
  { name: "status", help: "is it running, and does it answer (the default)" },
  { name: "restart", help: "start it again, after an update" },
  { name: "logs", help: "the last lines it wrote" },
  { name: "code", help: "the pairing code, while the account has no owner yet" },
  { name: "uninstall", help: "stop it and take it out of the service manager; ledgers and keys stay" },
  { name: "help", help: "this list" },
];

export interface EnvVar {
  name: string;
  help: string;
  /** read by */
  where: string;
  /** carried into the background service's environment by `account:service install` */
  service: boolean;
}

/** every environment variable the account reads, with where */
export const ENV_VARS: readonly EnvVar[] = [
  { name: "OPENPAPER_HOME", help: "the home directory when --home is not given", where: "home.ts", service: true },
  { name: "BUYER_HOME", help: "the earlier name of OPENPAPER_HOME, still honoured", where: "home.ts", service: true },
  { name: "SEC_CONTACT", help: "your email address: the SEC asks every EDGAR reader to send one; without it a US share's Financials are off", where: "live/edgar.ts", service: true },
  { name: "PORTFOLIO_URL", help: "where an MCP seat finds the account (default http://127.0.0.1:4820)", where: "mcp.ts", service: false },
  { name: "PORTFOLIO_AGENT", help: "the seat's name when the MCP client sends none", where: "mcp.ts", service: false },
  { name: "PORTFOLIO_SEAT_KEYS", help: "sim: derive a seat's key from its name instead of a key file — demos and tests only", where: "mcp.ts", service: false },
  { name: "PORTFOLIO_RPC_<CHAIN>", help: "your own RPC endpoint for ETHEREUM, OPTIMISM, BNB, POLYGON, BASE, ARBITRUM or ROBINHOOD", where: "live/chain.ts", service: true },
  { name: "PORTFOLIO_MM_BIN", help: "the mm command for the MetaMask Agent Wallet (default mm)", where: "live/metamask.ts", service: false },
  { name: "PORTFOLIO_MM_WRITES", help: "1: the MetaMask Agent Wallet may send real transactions; off otherwise", where: "live/writes.ts", service: false },
  { name: "PORTFOLIO_MM", help: "1: with --classic, the simulated statement reads the real mm CLI (the same as --mm)", where: "server.ts", service: false },
  { name: "ANTHROPIC_API_KEY", help: "Claude's key from the shell, instead of a key file or one pasted on the page", where: "account/brain-claude.ts", service: false },
  { name: "ANTHROPIC_AUTH_TOKEN", help: "Claude's token from the shell, where a gateway wants one", where: "account/brain-claude.ts", service: false },
  { name: "ANTHROPIC_BASE_URL", help: "a gateway in front of Anthropic; when it is not Anthropic's own host the key file is not used", where: "account/brain-claude.ts", service: false },
  { name: "OPENAI_API_KEY", help: "OpenAI's key from the shell, instead of a key file or one pasted on the page", where: "account/brain-openai.ts", service: false },
  { name: "OPENAI_BASE_URL", help: "another host with OpenAI's API shape, for the OpenAI preset", where: "account/brain-openai.ts", service: false },
  { name: "OPENAI_MODEL", help: "the model the OpenAI preset asks for", where: "account/brain-openai.ts", service: false },
  { name: "NODE_ENV", help: "development: read the page's files again on every request", where: "server.ts", service: false },
];

export type Parsed =
  | { kind: "ok"; get(name: string): string | undefined; has(name: string): boolean; number(name: string): number | undefined }
  | { kind: "help"; text: string }
  | { kind: "refused"; text: string };

const EXAMPLE: Record<NonNullable<Flag["value"]>, string> = { number: "<number>", dir: "<dir>", dollars: "<dollars>" };

/** the list `--help` prints: the command, each option with its default, then the environment */
export function usage(spec: readonly Flag[], o: { command: string; intro: string; env?: boolean }): string {
  const left = spec.map((f) => `--${f.name}${f.value ? ` ${EXAMPLE[f.value]}` : ""}`);
  const width = Math.max(...left.map((s) => s.length)) + 3;
  const lines = [`${o.command}${spec.length ? " [options]" : ""}`, `  ${o.intro}`, ""];
  spec.forEach((f, i) => lines.push(`  ${left[i]!.padEnd(width)}${f.help}${f.default ? ` (${f.default})` : ""}`));
  if (o.env !== false) {
    const w = Math.max(...ENV_VARS.map((v) => v.name.length)) + 3;
    lines.push("", "Environment:");
    for (const v of ENV_VARS) lines.push(`  ${v.name.padEnd(w)}${v.help}`);
  }
  return `${lines.join("\n")}\n`;
}

/** the service's own list: its commands, then the server's options that follow `install` */
export function serviceUsage(): string {
  const w = Math.max(...SERVICE_COMMANDS.map((c) => c.name.length)) + 3;
  const lines = ["npm run account:service -- <command>", "  The account as a background service: started when you log in, started again if it stops.", ""];
  for (const c of SERVICE_COMMANDS) lines.push(`  ${c.name.padEnd(w)}${c.help}`);
  return `${lines.join("\n")}\nAfter install, the server's options:\n\n${usage(SERVER_FLAGS, { command: "npm run account --", intro: "", env: true }).split("\n").slice(3).join("\n")}`;
}

/** a flag's value checked against its kind, or the sentence that refuses it */
function badValue(f: Flag, v: string): string | undefined {
  if (f.value === "number") return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65_535 ? undefined : `--${f.name} takes a whole number from 1 to 65535, not "${v}"`;
  if (f.value === "dollars") return /^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) > 0 ? undefined : `--${f.name} is a number of dollars, more than zero, to the cent, not "${v}"`;
  if (f.value === "dir") return v.trim() ? undefined : `--${f.name} takes a directory`;
  return undefined;
}

/** Parse `args` against `spec`. An unknown option, a missing or wrong value or a stray word is refused with the list of options; `--help`
 * and `-h` answer with the usage. Nothing here exits: the entry point prints and decides. */
export function parseFlags(args: readonly string[], spec: readonly Flag[], o: { command: string; intro: string; env?: boolean }): Parsed {
  const known = spec.map((f) => `--${f.name}`).join(", ");
  const options: Record<string, { type: "string" | "boolean"; short?: string }> = {};
  for (const f of spec) options[f.name] = { type: f.value ? "string" : "boolean", ...(f.name === "help" ? { short: "h" } : {}) };
  let values: Record<string, string | boolean | undefined>;
  try {
    values = parseArgs({ args: [...args], options, strict: true, allowPositionals: false }).values as Record<string, string | boolean | undefined>;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const what = e.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? /'([^']+)'/.exec(e.message)?.[1] ?? "an option" : undefined;
    const why = e.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? `unknown option ${what}` : e.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" ? e.message.replace(/^Option '([^']+)'.*$/s, "option $1 wants a value, or was given one it does not take") : e.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL" ? e.message.replace(/^Unexpected argument '([^']*)'.*$/s, "a stray word, \"$1\"") : e.message;
    return { kind: "refused", text: `${why}; ${o.command} takes: ${known} (see --help)` };
  }
  if (values.help) return { kind: "help", text: usage(spec, o) };
  for (const f of spec) {
    const v = values[f.name];
    if (f.value && typeof v === "string") {
      const bad = badValue(f, v);
      if (bad) return { kind: "refused", text: `${bad}; ${o.command} takes: ${known} (see --help)` };
    }
  }
  return {
    kind: "ok",
    get: (name) => (typeof values[name] === "string" ? (values[name] as string) : undefined),
    has: (name) => values[name] === true,
    number: (name) => (typeof values[name] === "string" ? Number(values[name]) : undefined),
  };
}

export const SERVER_USAGE = { command: "npm run account --", intro: "Your accounts on one page at http://127.0.0.1:4820, and agents that trade inside the limits you sign." };
export const CHECK_USAGE = { command: "npm run account:check --", intro: "What the account can reach from this network, in each venue's own words. Safe to paste: no key, balance or address.", env: false };

/** the sentence that refuses the server options `args`, or undefined when the server would take them: for the service's `install`, which
 * writes them into the service manager, and for tests */
export function checkServerArgs(args: readonly string[]): string | undefined {
  const p = parseFlags(args, SERVER_FLAGS, SERVER_USAGE);
  if (p.kind === "refused") return p.text;
  if (p.kind === "help") return "--help is not an option to install the service with";
  if (p.has("read-only") && p.has("live-writes")) return "--read-only and --live-writes say opposite things: pick one";
  return undefined;
}
