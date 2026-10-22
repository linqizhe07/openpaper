/** THE HOLE (found by an independent review on 2026-10-04) — attacker A, an agent inside ordinary approvals; every payee here is honest.
 *
 * A waiting card holds its share of the budget (`reservedMicro`) in the approval it was raised under. When the owner answered it — approve,
 * REJECT, or after it expired — `answerCard`'s `release()` gave that share back to whichever approval was live for that agent NOW
 * (`spends.find(agent, scope, not revoked)`), clamped at zero. If the owner had re-issued the approval in between, the share came out of
 * money the NEW approval had set aside for something else — here an open session's deposit. The budget then had room it should not have:
 * the owner re-issued a $40 approval, rejected the stale card, approved two first payments that each fit — and $59 was spent under it.
 *
 * THE REFUSAL: a card's share goes back to the approval it was raised under, revoked or not. Rejecting the stale card leaves the session's
 * $25 set aside, a $29 first payment is E_MANDATE_BUDGET ($10 left of $40), and the session spends exactly its deposit: $30 on a $40 budget. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { cardHash, type CardLike, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const QUOTE = "https://data.sim/v1/quotes?symbol=NVDA";
const STREAM = "https://infer.sim/v1/stream";
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);
const carded = (o: Outcome): CardLike => {
  if (isRefusal(o) || o.kind !== "card") throw new Error(`expected a card, got ${code(o)}`);
  return o.card;
};

describe("A · a card from before the approval was re-issued", () => {
  it("rejecting it gives its share back to the approval it was raised under: the session's $25 stays set aside, and $30 is spent on a $40 budget", async () => {
    let t = START;
    let n = 0;
    const home = mkdtempSync(join(tmpdir(), "attack-stale-card-"));
    homes.push(home);
    const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    const engine = svc.account!;
    const world = svc.payees!;
    const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
    const pay = async (url: string, maxAmount: string, from = "research") => svc.exchange(await signAgent(cc, { type: "agentPay", url, maxAmount, fromSubAccount: from, nonce: t + ++n } as AgentAction));
    const answer = (card: CardLike, decision: string) => own({ type: "approveCard", card: card.id, action: cardHash(card), decision });
    const approval = () => own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "data.sim,infer.sim,shop.sim", perPayment: "30", budget: "40", windowHours: 0, validUntil: t + 30 * DAY });
    expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
    expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
    const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
    const route = await engine.resolve(fund, "owner");
    if (isRefusal(route)) throw new Error(route.message);
    expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
    t += 2 * MIN;
    await engine.settle();
    expect(code(await approval())).toBe("account");
    const spend = () => engine.state.spends.find((s) => s.scope === "payees" && s.revokedAt === undefined)!;
    const revoked = () => engine.state.spends.find((s) => s.scope === "payees" && s.revokedAt !== undefined)!;

    // 1 · the agent asks for a $30 payment: a first-payment card, which holds $30 of approval #1
    world.data.priceMicro = 30_000_000;
    const stale = carded(await pay(QUOTE, "30"));
    expect(spend().reservedMicro).toBe(30_000_000);
    // 2 · the owner re-issues the approval (same terms): approval #2 starts clean, approval #1 keeps the card's $30 set aside
    expect(code(await approval())).toBe("account");
    expect([spend().spentMicro, spend().reservedMicro]).toEqual([0, 0]);
    expect(revoked().reservedMicro).toBe(30_000_000);
    // 3 · a session under approval #2: $30 deposit, $5 a call. One call made, $25 still set aside
    world.infer.depositMicro = 30_000_000;
    world.infer.unitMicro = 5_000_000;
    expect(code(await answer(carded(await pay(STREAM, "5")), "approve"))).toBe("payment");
    expect([spend().spentMicro, spend().reservedMicro]).toEqual([5_000_000, 25_000_000]);

    // 4 · the owner REJECTS the stale card. Nothing moves: its share goes back to approval #1, and the session's $25 stays set aside
    expect(code(await answer(stale, "reject"))).toBe("result");
    expect(revoked().reservedMicro).toBe(0);
    expect([spend().spentMicro, spend().reservedMicro]).toEqual([5_000_000, 25_000_000]);

    // 5 · so a $29 first payment to data.sim is more than the $10 left of $40
    world.data.priceMicro = 29_000_000;
    const refused = await pay(QUOTE, "30");
    expect(code(refused)).toBe("E_MANDATE_BUDGET");
    expect((refused as Refusal).message).toMatch(/\$10\.00 left of \$40\.00/);
    // 6 · and the session spends exactly its deposit
    for (let i = 0; i < 5; i++) expect(code(await pay(STREAM, "5"))).toBe("payment");

    const spentBeyondBudget = spend().spentMicro > spend().budgetMicro;
    expect([spend().budgetMicro, spend().spentMicro, spend().reservedMicro, spentBeyondBudget]).toEqual([40_000_000, 30_000_000, 0, false]);
  });
});
