/** A HOLE FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker D, someone who can read the ledger file.
 *
 * The hole: an owner's signature covers `BigInt(Math.trunc(nonce))` (sign.ts, messageOf); the door asked only that the nonce be a finite
 * number, and the nonce book compared the number exactly. So the owner's envelope with nonce N was also a valid, never-seen envelope with
 * nonce N + 0.5. While the account was alive the result table (same signer, same digest) hid this; after `reset()`, and after a restart,
 * where the nonce books are rebuilt from the ledgers, the table was empty and the old approvals ran again, with nobody signing anything —
 * a key the owner had revoked among them.
 *
 * What closes it (account/exchange.ts take): the door takes exactly what the signature covers, and nothing else — a nonce that is not a
 * whole number of milliseconds is malformed, E_ACCOUNT_BAD_ACTION, before any signature is read and before anything is spent. The envelope
 * as it is stays a used nonce, E_ACCOUNT_NONCE: a signer's book outlives `reset()`, and a later run reads the instruction's digest back from
 * the ledger (recall). The agent key and its approval stay gone, and a key the owner revoked is not let back in. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, ZERO, type AgentAction, type Envelope, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const owner = simKey("owner");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));

const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);
const seed = { owners: [{ id: owner.address, kind: "eoa" as const, label: "owner", addedAt: new Date(START).toISOString() }] };
const home = () => {
  const h = mkdtempSync(join(tmpdir(), "attack-replay-"));
  homes.push(h);
  return h;
};
/** what the attacker does: read the signed envelopes out of a ledger file — each instruction's row that says it went through (the door's
 * "taken" row before it carries the same envelope) */
const envelopesIn = (file: string): Envelope[] =>
  readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { tool?: string; outcome?: string; envelope?: Envelope }).filter((r) => r.envelope !== undefined && r.outcome === "ok" && (r.tool === "approveAgent" || r.tool === "approveSpend")).map((r) => r.envelope!);
/** …and add a half to the nonce. The signature is untouched */
const half = (e: Envelope): Envelope => ({ ...e, nonce: e.nonce + 0.5, action: { ...e.action, nonce: e.action.nonce + 0.5 } as OwnerAction });
const transfer = (nonce: number) => signAgent(cc, { type: "agentSendAsset", destination: "self", sourceDex: "okx", destinationDex: "hyperliquid", token: "USDC", amount: "500", fromSubAccount: "", maxFee: "5", nonce } as AgentAction);
/** the envelope as it is: a nonce the signer's book has seen (`why` says from which run) */
const usedNonce = async (svc: PortfolioService, e: Envelope, why: RegExp) => {
  const out = await svc.exchange(e);
  expect(code(out)).toBe("E_ACCOUNT_NONCE");
  expect((out as Refusal).message).toMatch(why);
};
/** the same signature under nonce + 0.5: not a nonce at all. Refused before the signature is read, and nothing is spent */
const malformedNonce = async (svc: PortfolioService, e: Envelope) => {
  const out = await svc.exchange(half(e));
  expect(code(out)).toBe("E_ACCOUNT_BAD_ACTION");
  expect((out as Refusal).message).toMatch(/the nonce is a whole number of milliseconds/);
};

describe("D · an owner's old envelope, with half a millisecond added to its nonce", () => {
  it("after reset(): the envelope as it is is a used nonce, with the half it is malformed, and the agent key and its approval stay gone", async () => {
    const t = START;
    const svc = await PortfolioService.create({ home: home(), now: () => new Date(t).toISOString(), venues: "frontline", account: seed });
    expect(code(await svc.exchange(await signOwner(owner, { type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY, nonce: t + 1 })))).toBe("account");
    expect(code(await svc.exchange(await signOwner(owner, { type: "approveSpend", agent: cc.address, scope: "venues", allow: "okx,metamask,hyperliquid", perPayment: "600", budget: "2000", windowHours: 0, validUntil: t + 30 * DAY, nonce: t + 2 })))).toBe("account");
    const stolen = envelopesIn(svc.ledgerPath());
    expect(stolen.map((e) => e.action.type)).toEqual(["approveAgent", "approveSpend"]);

    svc.reset();
    expect([svc.account!.state.agents.length, svc.account!.state.spends.length]).toEqual([0, 0]);
    expect(code(await svc.exchange(await transfer(t + 10)))).toBe("E_ACCOUNT_UNKNOWN_SIGNER");
    // the signer's nonce book outlives the reset
    for (const e of stolen) await usedNonce(svc, e, /this nonce was used before/);
    for (const e of stolen) await malformedNonce(svc, e);

    expect([svc.account!.state.agents.length, svc.account!.state.spends.length]).toEqual([0, 0]);
    expect(code(await svc.exchange(await transfer(t + 11)))).toBe("E_ACCOUNT_UNKNOWN_SIGNER");
  });

  it("after a restart in the same home: the envelopes were taken by the earlier run, and the key the owner had REVOKED is not let back in", async () => {
    const h = home();
    const first = await PortfolioService.create({ home: h, now: () => new Date(START).toISOString(), venues: "frontline", account: seed });
    expect(code(await first.exchange(await signOwner(owner, { type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY, nonce: START + 1 })))).toBe("account");
    expect(code(await first.exchange(await signOwner(owner, { type: "approveSpend", agent: cc.address, scope: "venues", allow: "*", perPayment: "600", budget: "5000", windowHours: 0, validUntil: START + 30 * DAY, nonce: START + 2 })))).toBe("account");
    // the owner changes their mind
    expect(code(await first.exchange(await signOwner(owner, { type: "approveAgent", agentAddress: ZERO, agentName: "Claude Code", validUntil: 0, nonce: START + 3 })))).toBe("account");
    expect(first.account!.state.agents.map((k) => [k.address, k.revokedAt !== undefined])).toEqual([[cc.address, true]]);
    const stolen = envelopesIn(first.ledgerPath()).filter((e) => (e.action as { agentAddress?: string }).agentAddress !== ZERO);
    expect(stolen.map((e) => e.action.type)).toEqual(["approveAgent", "approveSpend"]);

    const second = await PortfolioService.create({ home: h, now: () => new Date(START + MIN).toISOString(), venues: "frontline", account: seed });
    for (const e of stolen) await usedNonce(second, e, /an earlier run of this account already took this instruction/);
    for (const e of stolen) await malformedNonce(second, e);
    // The simulation starts a run from its seed (only a real account brings its state back: service.ts continueRuns), so the revoked key is
    // not a revoked entry of this run: it is a stranger — E_ACCOUNT_UNKNOWN_SIGNER, where E_ACCOUNT_AGENT_REVOKED was expected. Either way
    // no key of the agent's is live, and the one instruction that would let it in, the owner's old approval, is refused above
    expect(second.account!.state.agents.filter((k) => k.address === cc.address && k.revokedAt === undefined)).toEqual([]);
    expect(code(await second.exchange(await transfer(START + MIN + 5)))).toBe("E_ACCOUNT_UNKNOWN_SIGNER");
  });
});
