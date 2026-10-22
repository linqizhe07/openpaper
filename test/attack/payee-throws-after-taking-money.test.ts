/** A HOLE FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker B, a payee the owner has approved once.
 *
 * The hole: the payee TOOK the payment (the token ledger moved) and then answered with a receipt the account's code tripped over — x402
 * `payer: 5` (payees.ts `sameAddress(res.payer, …)` called `.toLowerCase()` on a number), AP2 a receipt that was not a string. The throw was
 * caught in `pay()` and turned into "…could not read: nothing further was sent", but `book()` never ran: the approval's budget was not
 * charged, no payment row existed, the ledger had no accepted row, and the next call passed the same budget check. An agent that retried the
 * error (or one that worked with the payee) emptied the float past the budget while the books said one payment had happened.
 *
 * What closes it: whether money moved is the ledger's word, never the receipt's. `sameAddress` takes only strings, so a receipt of any shape is
 * read without a throw; the x402 branch asks the chain whether the authorisation was used and books what moved however the receipt looks
 * (`E_PAYEE_UNVERIFIED` with `detail.paid: true` — "the payment is on the ledger"); and if reading an answer does throw, `afterTrouble` asks
 * the ledger the same way before answering. Every payment charges the budget, so the budget stops the call that would pass it. The test below
 * runs the attack as it went through then and asserts what holds now. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import * as X from "../../src/portfolio/account/protocols.ts";
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

interface Call { method: string; url: URL; header(name: string): string | undefined; body: unknown; nowMs: number }
interface Res { status: number; headers: Record<string, string>; body?: unknown }
type Handler = (c: Call) => Promise<Res> | Res;
/** the attacker's seat: whatever a payee host answers */
const hostsOf = (world: unknown) => (world as { hosts: Map<string, Handler> }).hosts;
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

/** an account with one agent key, a float of $50 called `research`, and a payees approval: $30 a payment */
async function boot(budget: string) {
  let t = START;
  let n = 0;
  const home = mkdtempSync(join(tmpdir(), "attack-payee-"));
  homes.push(home);
  const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
  const engine = svc.account!;
  const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
  const pay = async (url: string, maxAmount: string, from: string) => svc.exchange(await signAgent(cc, { type: "agentPay", url, maxAmount, fromSubAccount: from, nonce: t + ++n } as AgentAction));
  /** pay, and — when the account asks the owner first — approve */
  const payOk = async (url: string, maxAmount: string, from: string) => {
    const r = await pay(url, maxAmount, from);
    return !isRefusal(r) && r.kind === "card" ? own({ type: "approveCard", card: r.card.id, action: cardHash(r.card), decision: "approve" }) : r;
  };
  expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
  expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
  const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
  const route = await engine.resolve(fund, "owner");
  if (isRefusal(route)) throw new Error(route.message);
  expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
  t += 2 * MIN;
  await engine.settle();
  expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "data.sim,shop.sim", perPayment: "30", budget, windowHours: 0, validUntil: t + 30 * DAY }))).toBe("account");
  const float = () => engine.sub("research")!.balanceMicro;
  const spend = () => engine.state.spends.find((s) => s.scope === "payees" && s.revokedAt === undefined)!;
  return { svc, engine, world: svc.payees!, pay, payOk, float, spend, start: float() };
}

describe("B · the payee takes the money, then sends a receipt the account cannot read", () => {
  it("x402: every $9 the payee takes is booked against the budget, the agent is told it went, and the budget stops the fourth", async () => {
    const x = await boot("40");
    x.world.data.priceMicro = 9_000_000;
    expect(code(await x.payOk(QUOTE, "9", "research"))).toBe("payment");
    expect([x.start - x.float(), x.spend().spentMicro]).toEqual([9_000_000, 9_000_000]);

    // from here the payee settles honestly and lies only in the shape of its receipt: `payer` is a number
    const honest = x.world.data.handle;
    hostsOf(x.world).set("data.sim", async (c) => {
      const res = await honest(c);
      const receipt = res.headers["payment-response"];
      return receipt ? { ...res, headers: { ...res.headers, "payment-response": X.b64json({ ...X.unb64json<Record<string, unknown>>(receipt)!, payer: 5 }) } } : res;
    });
    const answers: Outcome[] = [];
    for (let i = 0; i < 4; i++) answers.push(await x.pay(QUOTE, "9", "research"));
    // three times the agent is told the money went and the receipt did not verify; the fourth is stopped by the budget, not by the payee
    expect(answers.map(code)).toEqual(["E_PAYEE_UNVERIFIED", "E_PAYEE_UNVERIFIED", "E_PAYEE_UNVERIFIED", "E_MANDATE_BUDGET"]);
    const pays = x.engine.payments.filter((p) => p.kind === "pay");
    for (const a of answers.slice(0, 3) as Refusal[]) {
      expect(a.message).toBe("data.sim took $9.00 and sent no valid receipt: the payment is on the ledger, and this payee should not be paid again");
      expect(a.detail?.paid).toBe(true);
      expect(pays.some((p) => p.id === a.detail?.payment)).toBe(true);
    }
    expect((answers[3] as Refusal).message).toBe("the spending approval has $4.00 left of $40.00; $9.00 is more than that");

    // what left the float is what the payee has and what the budget was charged — and it is inside the budget
    const leftTheFloat = x.start - x.float();
    expect([leftTheFloat, x.world.chain.balance(x.world.data.payTo), x.spend().spentMicro]).toEqual([36_000_000, 36_000_000, 36_000_000]);
    expect(leftTheFloat <= x.spend().budgetMicro).toBe(true);
    // and the books know of every payment: four rows of $9, settled, three of them noting the receipt
    expect(pays.map((p) => [p.amountUsd, p.status])).toEqual([[9, "settled"], [9, "settled"], [9, "settled"], [9, "settled"]]);
    expect(pays.filter((p) => p.note === "data.sim took the payment and sent no valid receipt")).toHaveLength(3);
    expect(x.svc.rows().filter((r) => r.tool === "agentPay" && r.outcome === "accepted")).toHaveLength(4);
  });
});
