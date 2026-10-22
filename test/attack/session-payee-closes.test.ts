/** A HOLE FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker B, a payee the owner has approved (or simply a payee that tidies up).
 *
 * The hole: the payee closes the channel itself — its right under MPP: it settles its highest voucher and the escrow refunds the rest to the
 * float. `close()` in payees.ts only finished a session when the PAYEE answered the account's close with a 200; here the payee answered
 * "channel-finalized", and `escrow.requestClose` said the same, so the answer was a refusal and nothing was tidied. From then on the session
 * was "open" for ever, its share of the budget stayed set aside for ever, the payment row stayed "pending", and the statement counted the
 * refunded deposit a second time as money "held". No instruction — the agent's or the owner's — cleared it.
 *
 * What closes it: the account reads the escrow, not the payee. `tick()` — run by `settle()` before anything reads or moves, and by every
 * session call — finds a channel the payee finalized and finishes the session with what the escrow settled: the payment row is settled at what
 * the payee took, the deposit's unused share is no longer set aside, nothing is "held", and the agent's next call opens a fresh session. The
 * test below runs the attack as it went through then and asserts what holds now. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, ZERO, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const STREAM = "https://infer.sim/v1/stream";
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

/** an account with one agent key, a float of $50 called `research`, and a payees approval for infer.sim: $30 a payment, $40 in all */
async function boot() {
  let t = START;
  let n = 0;
  const home = mkdtempSync(join(tmpdir(), "attack-session-close-"));
  homes.push(home);
  const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
  const engine = svc.account!;
  const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
  const pay = async (maxAmount: string, close = false) => svc.exchange(await signAgent(cc, { type: "agentPay", url: STREAM, maxAmount, fromSubAccount: "research", ...(close ? { close: true } : {}), nonce: t + ++n } as AgentAction));
  /** pay, and — when the account asks the owner first — approve */
  const payOk = async (maxAmount: string) => {
    const r = await pay(maxAmount);
    return !isRefusal(r) && r.kind === "card" ? own({ type: "approveCard", card: r.card.id, action: cardHash(r.card), decision: "approve" }) : r;
  };
  const pass = async (ms: number) => {
    t += ms;
    await engine.settle();
  };
  expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 90 * DAY }))).toBe("account");
  expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
  const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
  const route = await engine.resolve(fund, "owner");
  if (isRefusal(route)) throw new Error(route.message);
  expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
  await pass(2 * MIN);
  expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "infer.sim", perPayment: "30", budget: "40", windowHours: 0, validUntil: t + 90 * DAY }))).toBe("account");
  const float = () => engine.sub("research")!.balanceMicro;
  const spend = () => engine.state.spends.find((s) => s.scope === "payees" && s.revokedAt === undefined)!;
  return { svc, engine, world: svc.payees!, own, pay, payOk, pass, float, spend, start: float(), now: () => t };
}

describe("B · the payee closes a session's channel itself", () => {
  it("the payee closes the channel itself: the account's next look settles the session at what the payee took, frees the budget, counts the refund once, and the next call opens a fresh session", async () => {
    const x = await boot();
    x.world.infer.depositMicro = 20_000_000;
    expect(code(await x.payOk("0.05"))).toBe("payment");
    expect(code(await x.pay("0.05"))).toBe("payment");
    const session = x.engine.payments.find((p) => p.protocol === "mpp-session")!;
    const channel = session.legs[0]!.ref!;
    // two calls on a $20 deposit: two cents spent, $19.98 set aside
    expect([session.status, x.spend().spentMicro, x.spend().reservedMicro]).toEqual(["pending", 20_000, 19_980_000]);
    const before = (await x.engine.view()).totalUsd;

    // the payee settles its last voucher and closes: two cents to it, the rest of the deposit back to the float
    const last = x.world.infer.accepted.get(channel)!;
    expect(await x.world.escrow.settle(x.world.infer.recipient, channel, last.cumulative, last.signature, true)).toMatchObject({ paid: 20_000, refund: 19_980_000 });
    expect([x.start - x.float(), x.world.chain.balance(x.world.escrow.address)]).toEqual([20_000, 0]);

    // the account's next look at the ledger finds the channel finalized and finishes the session: settled at two cents, nothing set aside
    const after = await x.engine.view();
    expect(after.pay.sessions.map((s) => [s.status, s.note])).toEqual([["closed", 'infer.sim closed the session itself: $0.02 paid for 2 calls, $19.98 back in float "research"']]);
    expect([session.status, session.amountUsd, session.heldUsd]).toEqual(["settled", 0.02, undefined]);
    expect([x.spend().spentMicro, x.spend().reservedMicro]).toEqual([20_000, 0]);
    // and the statement counts the refund once: nothing "held", the total what it was
    expect([after.heldUsd, Number((after.totalUsd - before).toFixed(2))]).toEqual([0, 0]);

    // the agent's next call opens a fresh session, which it closes; five days on nothing lingers
    expect(code(await x.pay("0.05"))).toBe("payment");
    expect(x.engine.payments.filter((p) => p.protocol === "mpp-session").map((p) => p.status)).toEqual(["pending", "settled"]);
    expect(code(await x.pay("0", true))).toBe("payment");
    await x.pass(5 * DAY);
    const view = await x.engine.view();
    expect(view.pay.sessions.map((s) => s.status)).toEqual(["closed", "closed"]);
    expect(x.engine.payments.filter((p) => p.protocol === "mpp-session").map((p) => [p.status, p.amountUsd])).toEqual([["settled", 0.01], ["settled", 0.02]]);
    expect([x.start - x.float(), x.spend().spentMicro, x.spend().reservedMicro]).toEqual([30_000, 30_000, 0]);
    expect([view.heldUsd, Number((view.totalUsd - before).toFixed(2))]).toEqual([0, -0.01]);
    expect(x.svc.rows().filter((r) => r.tool === "escrow.close" && r.outcome === "settled")).toHaveLength(2);
  });
});
