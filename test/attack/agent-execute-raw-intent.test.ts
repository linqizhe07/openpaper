/** THE HOLE (found by an independent review on 2026-10-04) — attacker A, an agent with an authorised key (no spending approval needed).
 *
 * `agentExecute` — the older single-account write, "now under the agent's key" — forwarded `action.intent` to the service as it arrived.
 * The route it replaced (`POST /api/execute`) ran `parseIntent`, which refuses a size that is not more than zero; the MCP seat's schema
 * does too, but the agent signs its own envelope and the door checked only that the kind was not `move` or `pay`. A subscription of −$1,000
 * reached the venue (which here turned it into an instant redemption, no T+1) and was written to the ledger as −$1,000 moved — which is
 * what Guard's 24-hour cap adds up. The "hard line" then had $1,000 more room, and the agent could give it as much as it liked.
 *
 * THE REFUSAL: the door parses the intent the agent signed, as the unsigned route did. A size that is not more than zero is
 * E_ACCOUNT_BAD_ACTION: nothing reaches the venue, nothing is written to the ledger, and the day's figure does not move. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { parseIntent } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const DAY = 86_400_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

async function boot() {
  let n = 0;
  const home = mkdtempSync(join(tmpdir(), "attack-execute-"));
  homes.push(home);
  const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
  const execute = async (account: string, intent: Record<string, unknown>) => svc.exchange(await signAgent(cc, { type: "agentExecute", account, intent, nonce: START + ++n } as AgentAction));
  expect(code(await svc.exchange(await signOwner(owner, { type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY, nonce: START + ++n } as OwnerAction)))).toBe("account");
  return { svc, execute };
}

describe("A · agentExecute judges the intent the agent signed", () => {
  it("a subscription of −$1,000 is refused at the door: nothing reaches the venue, and Guard's 24-hour figure does not move", async () => {
    const x = await boot();
    x.svc.setMode("guard");
    const intent = { kind: "subscribe", fund: "OUSG", amountUsd: -1000 };
    // the check the unsigned route makes
    expect(parseIntent(intent)).toBeNull();
    const usdc = async () => (await x.svc.read("ondo")).find((h) => h.asset === "USDC")!.amount;
    const daily = () => x.svc.dailyOutUsd(new Date(START).toISOString());
    const before = await usdc();
    expect(daily()).toBe(0);

    const out = await x.execute("ondo", intent);
    expect(code(out)).toBe("E_ACCOUNT_BAD_ACTION");
    expect((out as Refusal).message).toMatch(/each more than zero/);
    // the venue never saw it, the ledger has no row for it, and the day's figure is where it was
    expect(await usdc()).toBe(before);
    expect(x.svc.account!.payments).toHaveLength(0);
    expect(daily()).toBe(0);

    // the same door, a well-formed intent: the venue takes it, and the day's figure counts it
    const ok = await x.execute("ondo", { kind: "subscribe", fund: "OUSG", amountUsd: 100 });
    expect(code(ok)).toBe("result");
    expect((ok as { result: { ok: boolean; status: string; usd: number } }).result).toMatchObject({ ok: true, status: "minted", usd: 100 });
    expect(before - (await usdc())).toBe(100);
    expect(daily()).toBe(100);
  });
});
