/** A HOLE FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker B, a payee the owner has approved once (or simply a payee that is broken).
 *
 * The hole: instructions are taken one at a time (`exchange()` chains every call on one promise), and a payment waited on the payee inside its
 * turn with no time limit (`PayeeWorld.fetch`). A payee that accepted the request and never answered held the door shut for everybody: the
 * owner's own instructions — revoke the agent's key, reset — queued behind it and never ran. The only controls left were the unsigned
 * tightening routes (`/api/mode`, `/api/revoke`), which do not go through the door.
 *
 * What closes it: a payee is waited for, not for ever. `PayeeWorld.fetch` races the answer against `timeoutMs` (three seconds by default), and
 * one that takes longer has not answered: the payment is refused by the payee layer — `E_PAYEE_REJECTED`, "did not answer" — nothing has
 * moved, and the instruction behind it is taken at once. The test below runs the attack as it went through then and asserts what holds now. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, ZERO, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
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
/** what a caller sees after half a second: the account's answer, or none yet */
const within = (p: Promise<Outcome>, ms = 500): Promise<Outcome | "NO ANSWER"> => Promise.race([p, new Promise<"NO ANSWER">((r) => setTimeout(() => r("NO ANSWER"), ms))]);
const seen = (o: Outcome | "NO ANSWER"): string => (o === "NO ANSWER" ? o : code(o));

describe("B · a payee that never answers", () => {
  it("is given up on inside the payment's turn: the payment is refused, nothing moves, and the owner's revoke and reset are taken right after it", async () => {
    let t = START;
    let n = 0;
    const home = mkdtempSync(join(tmpdir(), "attack-hang-"));
    homes.push(home);
    const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    const engine = svc.account!;
    const world = svc.payees!;
    const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
    const pay = async () => svc.exchange(await signAgent(cc, { type: "agentPay", url: QUOTE, maxAmount: "0.05", fromSubAccount: "research", nonce: t + ++n } as AgentAction));
    expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
    expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
    const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
    const route = await engine.resolve(fund, "owner");
    if (isRefusal(route)) throw new Error(route.message);
    expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
    t += 2 * MIN;
    await engine.settle();
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "data.sim", perPayment: "30", budget: "40", windowHours: 0, validUntil: t + 30 * DAY }))).toBe("account");
    const first = await pay();
    if (isRefusal(first) || first.kind !== "card") throw new Error(`expected a card, got ${code(first)}`);
    expect(code(await own({ type: "approveCard", card: first.card.id, action: cardHash(first.card), decision: "approve" }))).toBe("payment");
    const float = () => engine.sub("research")!.balanceMicro;
    const afterOnePayment = float();

    // (a payee is waited for three seconds by default; the test does not wait that long)
    world.timeoutMs = 100;
    // the payee stops answering: the connection opens, nothing ever comes back
    (world as unknown as { hosts: Map<string, () => Promise<never>> }).hosts.set("data.sim", () => new Promise<never>(() => {}));
    const hung = await within(pay());
    // within half a second the agent has its answer, from the payee layer: no answer, so nothing was paid
    expect(seen(hung)).toBe("E_PAYEE_REJECTED");
    expect((hung as Refusal).message).toBe("data.sim did not answer");
    expect(world.sent.at(-1)).toMatchObject({ host: "data.sim", status: 0 });
    expect(float()).toBe(afterOnePayment);

    // the owner wants the agent's key gone. The instruction is signed, sent — and taken at once: the door was never held
    const revoke = own({ type: "approveAgent", agentAddress: ZERO, agentName: "Claude Code", validUntil: 0 });
    expect(seen(await within(revoke))).toBe("account");
    expect(engine.state.agents.some((k) => k.address === cc.address && k.revokedAt === undefined)).toBe(false);
    // the agent's next instruction is refused at the door, and the hung payee is not asked again
    const asked = world.sent.length;
    expect(code(await pay())).toBe("E_ACCOUNT_AGENT_REVOKED");
    expect(world.sent.length).toBe(asked);
    const reset = own({ type: "setPolicy", change: "reset", value: "" });
    expect(seen(await within(reset))).toBe("account");
  });
});
