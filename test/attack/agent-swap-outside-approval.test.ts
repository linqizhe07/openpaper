/** THE HOLE (found by an independent review on 2026-10-04) — attacker A, an agent with an authorised key and an ordinary `venues` approval.
 *
 * exchange.ts says every agent instruction is "inside a spending approval the owner signed … each still judged by the openness dial (Guard's
 * allowance and daily cap, an account switched off, an ended session)". `agentSwap` checked the approval's venue list and its per-payment
 * line and nothing else: it was never counted against the budget, `stillSigned` was not asked, and `evaluate()` was never called. So an
 * agent could swap back and forth without end (each swap costs the user a fee), and it kept swapping at a venue the owner had switched off
 * and after the owner had ended the agent's session — when `agentSendAsset` at the same venue was refused.
 *
 * THE REFUSAL: a swap is a payment like any other. It is counted against the budget — E_MANDATE_BUDGET once what is left is short of it —
 * and the dial judges it as it judges a transfer: E_WALLET_ACCOUNT_REVOKED at a venue the owner has switched off, E_WALLET_SESSION_EXPIRED
 * once the owner has ended the session. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const DAY = 86_400_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

describe("A · a swap is inside the budget and inside the dial", () => {
  it("a swap is counted against the budget, and it stops with the dial: the venue switched off, the session ended", async () => {
    let n = 0;
    const home = mkdtempSync(join(tmpdir(), "attack-swap-"));
    homes.push(home);
    const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: START + ++n } as OwnerAction));
    const ag = async (a: Record<string, unknown>) => svc.exchange(await signAgent(cc, { ...a, nonce: START + ++n } as AgentAction));
    const swap = (sell: string, buy: string, amount: string) => ag({ type: "agentSwap", venue: "okx", sell, buy, amount, minReceive: "0" });
    const transfer = () => ag({ type: "agentSendAsset", destination: "self", sourceDex: "okx", destinationDex: "hyperliquid", token: "USDC", amount: "100", fromSubAccount: "", maxFee: "5" });
    const stable = async () => (await svc.read("okx")).filter((h) => h.asset === "USDT" || h.asset === "USDC").reduce((s, h) => s + h.amount, 0);
    expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY }))).toBe("account");
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "venues", allow: "okx,metamask,hyperliquid", perPayment: "600", budget: "1000", windowHours: 0, validUntil: START + 30 * DAY }))).toBe("account");
    const spend = () => svc.account!.state.spends.find((s) => s.scope === "venues" && s.revokedAt === undefined)!;
    const swaps = () => svc.account!.payments.filter((p) => p.kind === "swap" && p.authority === "agent");
    const before = await stable();

    // $590 one way fits the $1,000 budget and is counted against it; $580 back, and six more tries, are more than the $410 left
    expect(code(await swap("USDT", "USDC", "590"))).toBe("payment");
    expect(spend().spentMicro).toBe(590_000_000);
    for (let i = 1; i < 8; i++) {
      const out = await swap(i % 2 ? "USDC" : "USDT", i % 2 ? "USDT" : "USDC", i % 2 ? "580" : "590");
      expect(code(out)).toBe("E_MANDATE_BUDGET");
      expect((out as Refusal).message).toMatch(/has \$410\.00 left of \$1000\.00/);
    }
    expect(swaps().reduce((s, p) => s + p.amountUsd, 0)).toBe(590);
    expect(spend().spentMicro).toBe(590_000_000);
    // one fee, not eight
    expect(Number((before - (await stable())).toFixed(2))).toBe(0.06);

    // the owner switches OKX off for the agent: a transfer is refused, and so is a swap
    svc.revoke("okx");
    expect(code(await transfer())).toBe("E_WALLET_ACCOUNT_REVOKED");
    const off = await swap("USDT", "USDC", "100");
    expect(code(off)).toBe("E_WALLET_ACCOUNT_REVOKED");
    expect((off as Refusal).message).toMatch(/switched off for the agent: reads only/);
    // switched back on, a $100 swap fits what is left and is counted
    svc.restore("okx");
    expect(code(await swap("USDT", "USDC", "100"))).toBe("payment");
    expect(spend().spentMicro).toBe(690_000_000);
    // the owner ends the agent's session ("every write stops"): a transfer is refused, and so is a swap
    svc.revokeAll();
    expect(code(await transfer())).toBe("E_WALLET_SESSION_EXPIRED");
    const ended = await swap("USDT", "USDC", "100");
    expect(code(ended)).toBe("E_WALLET_SESSION_EXPIRED");
    expect((ended as Refusal).message).toMatch(/every write stops, reads continue/);
    // two swaps on the ledger, $690 of the $1,000 spent, two fees
    expect(swaps().map((p) => p.amountUsd).sort((a, b) => a - b)).toEqual([100, 590]);
    expect(spend().spentMicro).toBe(690_000_000);
    expect(Number((before - (await stable())).toFixed(2))).toBe(0.07);
  });
});
