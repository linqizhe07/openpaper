/** The ledger rows are evidence: the rows an accepted agent instruction leaves carry its signed envelope and its signer (found by an
 * independent review on 2026-10-04) — invariant 7: "the ledger rows are evidence: hash chain, embedded envelopes".
 *
 * The door logged the signed envelope for a transfer, a swap, a single payment and every refusal, and three kinds of accepted, signed
 * agent instruction left rows with NO envelope and NO signer, so nothing on the ledger proved which key asked:
 *   · `agentExecute` / `agentOrder` that went through (the rows were the older path's `intent` and `venue`);
 *   · every call inside a payment session after the first (`mpp voucher`) — each is its own signed `agentPay`, and each moves money;
 *   · closing a session (`escrow.close`).
 * And because `rememberNonces` rebuilds the nonce books from the rows that carry an envelope, these instructions were not remembered
 * across a restart: sent again inside their ten-minute lifetime, they were taken again.
 *
 * What closes it: the door writes a `taken` row for every instruction it takes, before anything runs, with the envelope as the agent
 * signed it (its action, nonce and signature — exchange.ts `ledgered`) and the signer; and the rows the instruction's work leaves
 * (`handed on`, `mpp voucher`, `mpp close`) carry the same. The older path's `note`, `intent` and `venue` rows and a payment's own life
 * row (`escrow.close`) still carry none: the proof is on the instruction's rows, under the same hash chain. A real account continues its
 * earlier runs from those rows (account/restore.ts), so these instructions are remembered across a restart too: restore-holes R4 holds
 * an envelope sent again after a restart to E_ACCOUNT_NONCE. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { LedgerRow } from "../../src/agent/ledger.ts";
import { isRefusal } from "../../src/core/errors.ts";
import { cardHash, type Outcome } from "../../src/portfolio/account/exchange.ts";
import { signAgent, signOwner, simKey, type AgentAction, type OwnerAction } from "../../src/portfolio/account/sign.ts";
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

describe("the ledger holds the signed instruction behind every accepted write", () => {
  it("a trade through agentExecute, a session's later calls and its close: the rows that took and did each instruction carry its envelope and its signer", async () => {
    let t = START;
    let n = 0;
    const home = mkdtempSync(join(tmpdir(), "attack-evidence-"));
    homes.push(home);
    const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    const engine = svc.account!;
    const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
    const sign = (a: Record<string, unknown>) => signAgent(cc, { ...a, nonce: t + ++n } as AgentAction);
    const payment = (extra: Record<string, unknown> = {}) => ({ type: "agentPay", url: STREAM, maxAmount: "0.05", fromSubAccount: "research", ...extra });
    expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
    expect(code(await own({ type: "createSubAccount", name: "research", agent: cc.address, float: "60" }))).toBe("account");
    const fund = { destination: "self", sourceDex: "metamask", destinationDex: "sub:research", token: "USDC", amount: "50" };
    const route = await engine.resolve(fund, "owner");
    if (isRefusal(route)) throw new Error(route.message);
    expect(code(await own({ type: "sendAsset", ...fund, fromSubAccount: "", route: route.route.hash, maxFee: String(route.route.feeUsd), deadline: route.route.arrivalMs + MIN }))).toBe("payment");
    t += 2 * MIN;
    await engine.settle();
    expect(code(await own({ type: "approveSpend", agent: cc.address, scope: "payees", allow: "infer.sim", perPayment: "30", budget: "40", windowHours: 0, validUntil: t + 30 * DAY }))).toBe("account");
    const label = (r: LedgerRow) => `${r.kind}/${r.tool ?? ""}/${r.outcome ?? ""}`;
    /** an instruction signed by the agent and sent: the rows it left behind, as `kind/tool/outcome`, and among them the proof of who asked —
     * every row that names the agent's key as its signer, with the envelope it carries */
    const rowsOf = async (a: Record<string, unknown>) => {
      const envelope = await sign(a);
      const from = svc.rows().length;
      const out = await svc.exchange(envelope);
      const rows = svc.rows().slice(from);
      return { out, envelope, rows: rows.map(label), proof: rows.filter((r) => r.signer === cc.address).map((r) => [label(r), r.envelope]) };
    };

    // 1 · a trade under the agent's key: the row that took the instruction and the one that handed it on carry the envelope the agent signed
    const trade = await rowsOf({ type: "agentExecute", account: "binance", intent: { kind: "trade", symbol: "BTCUSDT", side: "buy", qty: 0.001 } });
    expect((trade.out as { result: { status: string } }).result.status).toBe("filled");
    expect(trade.rows).toEqual(["action/agentExecute/taken", "action/agentExecute/handed on", "note//", "intent/portfolio_trade/", "venue/portfolio_trade/filled"]);
    expect(trade.proof).toEqual([["action/agentExecute/taken", trade.envelope], ["action/agentExecute/handed on", trade.envelope]]);

    // the session's first call is a card, whose rows carry the agent's envelope and the owner's
    const first = await svc.exchange(await sign(payment()));
    if (isRefusal(first) || first.kind !== "card") throw new Error(`expected a card, got ${code(first)}`);
    expect(code(await own({ type: "approveCard", card: first.card.id, action: cardHash(first.card), decision: "approve" }))).toBe("payment");

    // 2 · the second call: money moves on the agent's signature, and the ledger keeps that signature — on the row that took it and on the voucher's
    const second = await rowsOf(payment());
    expect(code(second.out)).toBe("payment");
    expect(second.rows).toEqual(["action/agentPay/taken", "note//", "spend//", "action/mpp voucher/accepted"]);
    expect(second.proof).toEqual([["action/agentPay/taken", second.envelope], ["action/mpp voucher/accepted", second.envelope]]);

    // 3 · closing the session: the same on the row that took it and on the close's; the payment's own life row carries the payment's id
    const closed = await rowsOf(payment({ maxAmount: "0", close: true }));
    expect(code(closed.out)).toBe("payment");
    expect(closed.rows).toEqual(["action/agentPay/taken", "note//", "payment/escrow.close/settled", "action/mpp close/closed"]);
    expect(closed.proof).toEqual([["action/agentPay/taken", closed.envelope], ["action/mpp close/closed", closed.envelope]]);

    expect(svc.verifyChain().ok).toBe(true);
  });
});
