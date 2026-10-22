/** A HOLE FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker B, a payee the owner has approved once.
 *
 * The hole: to open an MPP session the account SIGNS the escrow's `open` transaction (the deposit) and hands it to the payee to broadcast. When
 * the payee answered 402 and broadcast nothing, the account said "did not accept it" and forgot the transaction (payees.ts: `if (!chan)
 * return refused(res)`) — nothing was set aside, unlike a refused EIP-3009 authorisation, which is held until it expires. The payee still
 * held a signed transaction. Broadcast later, each one moved a deposit out of the float into an escrow channel the account did not know it
 * had: no session, no payment row, no budget used, and nobody ever asked for it back.
 *
 * What closes it: an `open` the payee did not use is cancelled on the spot — the float's key spends that transaction's nonce
 * (`chain.spendTxNonce`), and the ledger gets an "escrow.open cancelled" row. The refusal is still the payee's (`E_PAYEE_REJECTED`, "did not
 * accept it"); nothing is set aside because nothing can be cashed; and the kept transaction reverts whenever it is broadcast. The test below
 * runs the attack as it went through then and asserts what holds now. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import * as X from "../../src/portfolio/account/protocols.ts";
import { signAgent, signOwner, simKey, type AgentAction, type Hex, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const STREAM = "https://infer.sim/v1/stream";
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));

interface Call { method: string; url: URL; header(name: string): string | undefined; body: unknown; nowMs: number }
interface Res { status: number; headers: Record<string, string>; body?: unknown }
type Handler = (c: Call) => Promise<Res> | Res;
const hostsOf = (world: unknown) => (world as { hosts: Map<string, Handler> }).hosts;
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

describe("B · a session's signed open transaction, kept by a payee that says no", () => {
  it("two refused opens are two cancelled transactions: broadcast two days later they revert, the float and the budget are untouched, and the account knows of one session, closed", async () => {
    let t = START;
    let n = 0;
    const home = mkdtempSync(join(tmpdir(), "attack-open-"));
    homes.push(home);
    const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    const engine = svc.account!;
    const world = svc.payees!;
    const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
    const pay = async (maxAmount: string, close = false) => svc.exchange(await signAgent(cc, { type: "agentPay", url: STREAM, maxAmount, fromSubAccount: "research", ...(close ? { close: true } : {}), nonce: t + ++n } as AgentAction));
    expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
    expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
    const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
    const route = await engine.resolve(fund, "owner");
    if (isRefusal(route)) throw new Error(route.message);
    expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
    t += 2 * MIN;
    await engine.settle();
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "infer.sim", perPayment: "30", budget: "40", windowHours: 0, validUntil: t + 30 * DAY }))).toBe("account");
    const float = () => engine.sub("research")!.balanceMicro;
    const spend = () => engine.state.spends.find((s) => s.scope === "payees" && s.revokedAt === undefined)!;
    const start = float();

    // one honest session, so the owner has met the payee and pinned its address; it is closed again
    world.infer.depositMicro = 20_000_000;
    const first = await pay("0.05");
    if (isRefusal(first) || first.kind !== "card") throw new Error(`expected a card, got ${code(first)}`);
    expect(code(await own({ type: "approveCard", card: first.card.id, action: cardHash(first.card), decision: "approve" }))).toBe("payment");
    expect(code(await pay("0", true))).toBe("payment");
    expect([start - float(), spend().spentMicro, spend().reservedMicro]).toEqual([10_000, 10_000, 0]);

    // now the payee answers every `open` with a plain 402 and keeps the signed transaction
    const honest = world.infer.handle;
    const kept: Hex[] = [];
    hostsOf(world).set("infer.sim", async (c) => {
      const payload = X.mppReadAuthorization(c.header("authorization"))?.payload as { action?: string; transaction?: Hex } | undefined;
      if (payload?.action !== "open" || !payload.transaction) return honest(c);
      kept.push(payload.transaction);
      return honest({ ...c, header: () => undefined });
    });
    const refused = await pay("0.05");
    expect(code(refused)).toBe("E_PAYEE_REJECTED");
    expect((refused as Refusal).message).toBe("infer.sim did not accept it (payment-required)");
    expect(code(await pay("0.05"))).toBe("E_PAYEE_REJECTED");
    // nothing moved, and nothing needs setting aside: each transaction the payee kept was cancelled on the spot
    expect([start - float(), spend().spentMicro, spend().reservedMicro, kept.length]).toEqual([10_000, 10_000, 0, 2]);
    expect(svc.rows().filter((r) => r.tool === "escrow.open cancelled" && r.outcome === "cancelled")).toHaveLength(2);

    // later, the payee broadcasts what it was handed: there is no other way into the escrow, and it reverts — the float's key spent that nonce
    for (const raw of kept) expect(await world.escrow.broadcast(raw)).toBe("transaction-reverted");
    t += 2 * DAY;
    const view = await engine.view();
    expect([start - float(), world.chain.balance(world.escrow.address)]).toEqual([10_000, 0]);
    // the account knows of one session, the honest one, closed
    expect(view.pay.sessions.map((s) => s.status)).toEqual(["closed"]);
    expect(engine.payments.filter((p) => p.protocol === "mpp-session")).toHaveLength(1);
    // and the approval's books agree with the float: one cent spent, nothing held
    expect([spend().spentMicro, spend().reservedMicro]).toEqual([10_000, 0]);
  });
});
