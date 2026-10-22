/** THE HOLE (found by an independent review on 2026-10-04) — attacker A, an agent inside an ordinary approval.
 *
 * The float's cap is a limit the owner signed (`createSubAccount.float`: "a float of up to $60"). `resolve()` held a refill against the
 * float's LANDED balance; a refill takes 15 seconds to land, and refills still in flight were not counted. One refill that would pass the
 * cap was refused; five small ones in a row each fit, and together the float held $99.94.
 *
 * THE REFUSAL: a refill is held against what the float holds plus what is on its way to it. The first $10 fits; the four behind it are
 * E_WALLET_FLOAT_CAP while it is in the air, and the float lands at $59.98, under its cap. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);

/** an account with one agent key and a float called `research`: it may hold $60, and holds $50 less the gas of filling it */
async function boot() {
  let t = START;
  let n = 0;
  const home = mkdtempSync(join(tmpdir(), "attack-float-"));
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
  return { svc, engine, world: svc.payees!, own, ag, pass, now: () => t };
}

describe("A · the float's cap and refills that are still in flight", () => {
  it("one refill over the cap is refused, and so are four behind one that fits while it is in the air: a $60 float lands at $59.98", async () => {
    const x = await boot();
    // the owner lets the agent top its float up from the wallet: $11 at a time, $100 in all
    expect(code(await x.own({ type: "approveSpend", agent: cc.address, scope: "venues", allow: "metamask,sub:research", perPayment: "11", budget: "100", windowHours: 0, validUntil: x.now() + 30 * DAY }))).toBe("account");
    const refill = (amount: string) => x.ag({ type: "agentSendAsset", destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount, fromSubAccount: "", maxFee: "5" });
    const sub = () => x.engine.sub("research")!;
    expect([sub().capMicro, sub().balanceMicro]).toEqual([60_000_000, 49_990_000]);
    // the cap holds for one refill that would pass it…
    expect(code(await refill("10.02"))).toBe("E_WALLET_FLOAT_CAP");
    // …and for four behind one that fits: what is on its way to the float counts as held
    const answers: Outcome[] = [];
    for (let i = 0; i < 5; i++) answers.push(await refill("10"));
    expect(answers.map(code)).toEqual(["payment", "E_WALLET_FLOAT_CAP", "E_WALLET_FLOAT_CAP", "E_WALLET_FLOAT_CAP", "E_WALLET_FLOAT_CAP"]);
    expect((answers[1] as Refusal).message).toMatch(/\$9\.99 is on its way to it/);
    await x.pass(MIN);
    const overTheCap = sub().balanceMicro > sub().capMicro;
    expect([sub().balanceMicro, overTheCap]).toEqual([59_980_000, false]);
  });
});
