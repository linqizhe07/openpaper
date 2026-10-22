/** A HOLE FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker D, someone who can read the ledger file, on an account that needs two signers.
 *
 * The hole: "the same envelope → the same answer" was keyed on `${signer}:${digest}`, and the nonce was spent in the PRIMARY signer's book
 * only. A ledger row holds the envelope with its cosignatures. With the cosigner's signature first and the first signer's among the
 * cosignatures, the digest was the same and both signatures still good — but the key and the nonce book were the other signer's, so the
 * instruction ran again: a replayed spending approval replaced the spent one with a fresh budget, and a `sendAsset` inside its ten minutes
 * would have been sent twice.
 *
 * What closes it (account/exchange.ts take): an owner's instruction is ONE instruction whoever of the owners signed first. Its answer is
 * kept under `owner:${digest}`, so the swapped envelope gets the first answer back and nothing runs; the nonce is spent in EVERY signer's
 * book; and a later run of the account reads the digest back from the ledger (recall), so after a restart the swap is refused outright as
 * E_ACCOUNT_NONCE. The budget is spent once. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { cosign, signAgent, signOwner, simKey, type AgentAction, type Envelope, type OwnerAction } from "../../src/portfolio/account/sign.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const owner = simKey("owner");
const second = simKey("co-signer");
const cc = simKey("agent:claude-code");
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
const code = (o: Outcome): string => (isRefusal(o) ? o.code : o.kind);
const seed = { owners: [{ id: owner.address, kind: "eoa" as const, label: "owner", addedAt: new Date(START).toISOString() }] };

describe("D · a two-signer account: the signature and the cosignature change places", () => {
  it("is the same instruction: the first answer comes back, nothing runs, and the budget is spent once", async () => {
    const home = mkdtempSync(join(tmpdir(), "attack-multisig-"));
    homes.push(home);
    let n = 0;
    const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline", account: seed });
    const both = async (a: Record<string, unknown>): Promise<Envelope> => {
      const action = { ...a, nonce: START + ++n } as OwnerAction;
      return { ...(await signOwner(owner, action)), cosignatures: [await cosign(second, action)] };
    };
    const move = async () => svc.exchange(await signAgent(cc, { type: "agentSendAsset", destination: "self", sourceDex: "okx", destinationDex: "hyperliquid", token: "USDC", amount: "600", fromSubAccount: "", maxFee: "5", nonce: START + ++n } as AgentAction));

    expect(code(await svc.exchange(await signOwner(owner, { type: "convertToMultiSigUser", signers: JSON.stringify({ authorizedUsers: [owner.address, second.address].sort(), threshold: 2 }), nonce: START + ++n })))).toBe("account");
    expect(code(await svc.exchange(await both({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY })))).toBe("account");
    const approved = await svc.exchange(await both({ type: "approveSpend", agent: cc.address, scope: "venues", allow: "okx,metamask,hyperliquid", perPayment: "600", budget: "600", windowHours: 0, validUntil: START + 30 * DAY }));
    expect(code(approved)).toBe("account");

    expect(code(await move())).toBe("payment");
    expect(code(await move())).toBe("E_MANDATE_BUDGET");

    // the attacker reads the approval's row off the ledger file…
    const row = readFileSync(svc.ledgerPath(), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { tool?: string; envelope?: Envelope }).find((r) => r.tool === "approveSpend" && r.envelope !== undefined)!;
    const seen = row.envelope!;
    expect(seen.cosignatures).toHaveLength(1);
    // …sent again as it is: the first answer, and nothing runs
    expect(await svc.exchange(seen)).toEqual(approved);
    expect(code(await move())).toBe("E_MANDATE_BUDGET");
    // …with the two signatures in each other's place: the same digest is the same instruction, whoever of the owners signed first. The
    // first answer again, and nothing runs
    const swapped: Envelope = { action: seen.action, nonce: seen.nonce, signature: seen.cosignatures![0]!, cosignatures: [seen.signature] };
    expect(await svc.exchange(swapped)).toEqual(approved);
    // the nonce is spent in both signers' books, not in the first signer's only
    expect([owner, second].map((k) => svc.account!.nonces.check(k.address, seen.nonce, START))).toEqual(["used", "used"]);

    const approvals = svc.account!.state.spends.filter((s) => s.agent === cc.address && s.scope === "venues");
    expect(approvals).toHaveLength(1);
    expect(code(await move())).toBe("E_MANDATE_BUDGET");
    const movedUsd = svc.account!.payments.filter((p) => p.authority === "agent").reduce((s, p) => s + p.amountUsd, 0);
    expect(movedUsd).toBe(600);

    // after a restart in the same home, the account has read every earlier run's instructions back by their digest (recall): the swap is
    // refused outright, whichever of the signers presents it first, and nothing is replayed into the new run. (The simulation starts a run
    // from its seed — both signers here — and only a real account brings its state back: service.ts continueRuns)
    const later = await PortfolioService.create({ home, now: () => new Date(START + MIN).toISOString(), venues: "frontline", account: { owners: [...seed.owners, { id: second.address, kind: "eoa" as const, label: "co-signer", addedAt: new Date(START).toISOString() }] } });
    for (const e of [seen, swapped]) {
      const again = await later.exchange(e);
      expect(code(again)).toBe("E_ACCOUNT_NONCE");
      expect((again as Refusal).message).toMatch(/an earlier run of this account already took this instruction/);
    }
    expect(later.account!.state.spends).toEqual([]);
  });
});
