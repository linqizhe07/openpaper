/** A session deposit comes home after the agent that opened the session is gone (found by an independent review on 2026-10-04): no
 * attacker needed — the owner revokes an agent's key (or its approval; or either expires) while the agent has a payment session open.
 *
 * "A session deposit can only come back to the float or go to the payee up to the vouchers." Closing a session was an AGENT instruction
 * only (`agentPay … close`), judged like any other: a revoked or expired key, or a revoked or expired approval, was refused. Nothing else
 * closed a session — `tick()` only withdraws what `close()` already asked back — and the owner had no instruction for it, so the deposit
 * stayed in escrow for good. The float's own balance had no way home either: no owner instruction took money out of a sub-account.
 *
 * What closes it: the deposit is the owner's. `setPolicy close-session <session id or host>` closes a session on the owner's signature,
 * whether or not the agent that opened it still can (payees.ts `closeByOwner`: the payee is asked to close and takes what the last voucher
 * says, the rest returns to the float; a payee that does not answer is bypassed through the escrow's grace period). And a float goes back
 * to the on-chain wallet on the owner's signature (exchange.ts `resolve`, `sub:<name>` → metamask) — only the owner's: an agent asking
 * for it is refused E_ACCOUNT_OWNER_ONLY. The revoked key itself is still refused at the door, E_ACCOUNT_AGENT_REVOKED; and neither the
 * revocation nor time closes a session by itself: sixty days on, it still waits for the owner. */
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
  const home = mkdtempSync(join(tmpdir(), "attack-session-revoke-"));
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

describe("the owner revokes an agent that has a session open", () => {
  it("the owner revokes the agent key with a session open: the agent's close is refused, the owner closes the session, and the deposit and the float come home", async () => {
    const x = await boot();
    x.world.infer.depositMicro = 20_000_000;
    expect(code(await x.payOk("0.05"))).toBe("payment");
    expect(x.start - x.float()).toBe(20_000_000);
    expect(code(await x.own({ type: "approveAgent", agentAddress: ZERO, agentName: "Claude Code", validUntil: 0 }))).toBe("account");
    // the revoked key is refused at the door, its close with it
    expect(code(await x.pay("0", true))).toBe("E_ACCOUNT_AGENT_REVOKED");
    // neither the revocation nor time closes the session: sixty days on, the deposit is still in escrow, and the session waits for the owner
    await x.pass(60 * DAY);
    const view = await x.engine.view();
    expect([x.world.chain.balance(x.world.escrow.address), view.pay.sessions.map((s) => s.status), x.start - x.float()]).toEqual([20_000_000, ["open"], 20_000_000]);

    // the owner closes it: the payee takes what the one voucher said ($0.01), and the rest of the deposit is back in the float
    const closed = await x.own({ type: "setPolicy", change: "close-session", value: "infer.sim" });
    expect(closed).toEqual({ ok: true, kind: "account", summary: 'session closed: $0.01 paid for 1 call, $19.99 back in float "research"' });
    const after = await x.engine.view();
    const session = x.engine.payments.find((p) => p.kind === "pay")!;
    expect([x.world.chain.balance(x.world.escrow.address), after.pay.sessions.map((s) => s.status), x.start - x.float(), session.status, session.amountUsd]).toEqual([0, ["closed"], 10_000, "settled", 0.01]);
    // a closed session is not closed twice
    expect(code(await x.own({ type: "setPolicy", change: "close-session", value: "infer.sim" }))).toBe("E_ACCOUNT_BAD_ACTION");

    // the float's own $49.99 goes home on the owner's signature — and only the owner's
    const home = { destination: "self", sourceDex: "sub:research", destinationDex: "metamask", token: "USDC", amount: "10" };
    const sweep = await x.engine.resolve(home, "owner");
    if (isRefusal(sweep)) throw new Error(`the owner's sweep was refused: ${sweep.code}`);
    expect([sweep.route.from, sweep.route.to, sweep.route.access]).toEqual(["sub:research", "metamask", "owner"]);
    const asAgent = await x.engine.resolve(home, "agent");
    expect(isRefusal(asAgent) && asAgent.code).toBe("E_ACCOUNT_OWNER_ONLY");
    const floatBefore = x.float();
    expect(code(await x.own({ type: "sendAsset", ...home, fromSubAccount: "", route: sweep.route.hash, maxFee: String(sweep.route.feeUsd), deadline: sweep.route.arrivalMs + MIN }))).toBe("payment");
    await x.pass(2 * MIN);
    const swept = x.engine.payments.find((p) => p.from === "sub:research" && p.to === "metamask")!;
    expect([floatBefore - x.float(), swept.kind, swept.status, swept.amountUsd]).toEqual([10_000_000, "withdraw", "settled", 10]);
  });
});
