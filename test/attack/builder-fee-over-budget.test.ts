/** THE HOLE (found by an independent review on 2026-10-04) — attacker A, an agent inside an ordinary approval.
 *
 * "Fees … must not get past the budget." `gate()` held the PAYMENT against the approval's budget; `book()` then added the payment AND the
 * app's fee to what was spent. A payment that exactly fit the budget left the approval overspent by the fee (here 0.1%: $0.029).
 *
 * THE REFUSAL: the approval judges the payment together with its fee, on every line. $29 plus $0.029 on a $29-a-payment, $29-in-all
 * approval is E_MANDATE_PER_ORDER_CAP — the per-payment line stands before the budget line, and both read $29. Two halves of $14.50 pass
 * the per-payment line; the first is booked with its fee, and the second is E_MANDATE_BUDGET. A refused payment spends nothing and pays
 * the builder nothing. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const QUOTE = "https://data.sim/v1/quotes?symbol=NVDA";
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

/** an account with one agent key and a float called `research`: it may hold $60, and holds $50 less the gas of filling it; the owner has
 * approved a builder's fee of 0.1% and a payees approval for data.sim of $29 a payment, $29 in all */
async function boot() {
  let t = START;
  let n = 0;
  const home = mkdtempSync(join(tmpdir(), "attack-fee-"));
  homes.push(home);
  const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
  const engine = svc.account!;
  const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
  const ag = async (a: Record<string, unknown>) => svc.exchange(await signAgent(cc, { ...a, nonce: t + ++n } as AgentAction));
  const pass = async (ms: number) => {
    t += ms;
    await engine.settle();
  };
  expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
  expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
  const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
  const route = await engine.resolve(fund, "owner");
  if (isRefusal(route)) throw new Error(route.message);
  expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
  await pass(2 * MIN);
  const builder = simKey("builder").address;
  expect(code(await own({ type: "approveBuilderFee", builder, maxFeeRate: "0.1%" }))).toBe("account");
  expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "data.sim", perPayment: "29", budget: "29", windowHours: 0, validUntil: t + 30 * DAY }))).toBe("account");
  const world = svc.payees!;
  const pay = () => ag({ type: "agentPay", url: QUOTE, maxAmount: "29", fromSubAccount: "research", builder: { b: builder, f: 100 } });
  const spend = () => engine.state.spends.find((s) => s.scope === "payees" && s.revokedAt === undefined)!;
  const float = () => engine.sub("research")!.balanceMicro;
  const paidToBuilder = () => world.chain.balance(builder);
  return { svc, engine, world, own, pay, spend, float, paidToBuilder, rows: engine.payments.length };
}

describe("A · the budget and an app's fee", () => {
  it("a $29 payment on a $29 budget is judged with its fee, $29.029, and refused: nothing is spent, and the builder is paid nothing", async () => {
    const x = await boot();
    x.world.data.priceMicro = 29_000_000;
    const first = await x.pay();
    // the budget line sits behind the per-payment line and both read $29, so the per-payment line is the one that says no here
    // (E_MANDATE_BUDGET was expected from the file's name; the budget line is reached in the case below)
    expect(code(first)).toBe("E_MANDATE_PER_ORDER_CAP");
    expect((first as Refusal).message).toMatch(/above the approval's per-payment maximum/);
    expect((first as Refusal).detail).toMatchObject({ perPayment: 29, amount: 29.029 });
    // no card was raised, nothing was spent or set aside, the float is whole, and the builder was paid nothing
    expect([x.spend().budgetMicro, x.spend().spentMicro, x.spend().reservedMicro]).toEqual([29_000_000, 0, 0]);
    expect(x.float()).toBe(49_990_000);
    expect(x.engine.payments).toHaveLength(x.rows);
    expect(x.paidToBuilder()).toBe(0);
  });

  it("two $14.50 payments on a $29 budget: the first is booked with its fee, and the second is more than the $14.49 left", async () => {
    const x = await boot();
    x.world.data.priceMicro = 14_500_000;
    const first = await x.pay();
    if (isRefusal(first) || first.kind !== "card") throw new Error(`expected a card, got ${code(first)}`);
    expect(code(await x.own({ type: "approveCard", card: first.card.id, action: cardHash(first.card), decision: "approve" }))).toBe("payment");
    expect([x.spend().spentMicro, x.spend().reservedMicro]).toEqual([14_514_500, 0]);
    expect(x.paidToBuilder()).toBe(14_500);
    const second = await x.pay();
    expect(code(second)).toBe("E_MANDATE_BUDGET");
    expect((second as Refusal).message).toMatch(/has \$14\.49 left of \$29\.00; \$14\.51 is more than that/);
    // the second payment spent nothing and paid the builder nothing; the approval is under its budget
    const spentBeyondBudget = x.spend().spentMicro > x.spend().budgetMicro;
    expect([x.spend().budgetMicro, x.spend().spentMicro, x.spend().reservedMicro, spentBeyondBudget]).toEqual([29_000_000, 14_514_500, 0, false]);
    expect(x.paidToBuilder()).toBe(14_500);
  });
});
