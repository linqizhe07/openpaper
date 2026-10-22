/** THE HOLE (found by an independent review on 2026-10-04) — attacker A, an agent holding a `venues` approval for `*` that the owner signed earlier.
 *
 * `*` was "every own venue", read when the money moved — not the venues the account had when the owner signed. `connectVenue` (plugging in
 * a venue) says nothing about agents, yet the moment it landed every standing `*` approval reached the new venue, as a source and as a
 * destination. Two consequences, neither of which the owner signed for by name:
 *   · the agent pulled money OUT of the exchange that was just plugged in (its key can withdraw to the wallet);
 *   · the agent sent money INTO a self-custody wallet plugged in "by its address" — a place the account holds no key for, so nothing comes
 *     back from it through the account. For an agent key that is as close to "withdraw to an outside address" as the doors allow.
 *
 * THE REFUSAL: `*` is spelled out when the owner signs — the venues the account has at that moment. A venue plugged in afterwards is
 * E_MANDATE_RECIPIENT as a source and as a destination until the owner signs again; the venues named at signing go on working. */
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

describe("A · a standing `*` approval and a venue the owner plugs in afterwards", () => {
  it("the new exchange is not a source and the new wallet is not a destination until the owner signs again; the venues named at signing go on working", async () => {
    let t = START;
    let n = 0;
    const home = mkdtempSync(join(tmpdir(), "attack-plug-"));
    homes.push(home);
    const svc = await PortfolioService.create({ home, now: () => new Date(t).toISOString(), venues: "frontline", account: { owners: [{ id: owner.address, kind: "eoa", label: "owner", addedAt: new Date(START).toISOString() }] } });
    const engine = svc.account!;
    const own = async (a: Record<string, unknown>) => svc.exchange(await signOwner(owner, { ...a, nonce: t + ++n } as OwnerAction));
    const move = async (from: string, to: string, amount: string) => svc.exchange(await signAgent(cc, { type: "agentSendAsset", destination: "self", sourceDex: from, destinationDex: to, token: "USDC", amount, fromSubAccount: "", maxFee: "5", nonce: t + ++n } as AgentAction));
    const usdc = async (id: string) => (await svc.read(id)).filter((h) => h.asset === "USDC" && !h.inTransit).reduce((s, h) => s + h.amount, 0);
    const star = () => own({ type: "approveSpend", agent: cc.address, scope: "venues", allow: "*", perPayment: "600", budget: "2000", windowHours: 0, validUntil: t + 30 * DAY });
    expect(code(await own({ type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: t + 30 * DAY }))).toBe("account");
    // signed when the account had its first venues: `*` is spelled out as those
    expect(code(await star())).toBe("account");
    expect(code(await move("metamask", "okx-wallet", "300"))).toBe("E_WALLET_ACCOUNT_UNKNOWN");
    expect(code(await move("kraken", "hyperliquid", "500"))).toBe("E_WALLET_ACCOUNT_UNKNOWN");

    // later the owner plugs in an exchange and a self-custody wallet. Neither action names an agent
    expect(code(await own({ type: "connectVenue", venue: "kraken", connector: "unified", label: "", credentialRef: "" }))).toBe("account");
    expect(code(await own({ type: "connectVenue", venue: "okx-wallet", connector: "wallet", label: "", credentialRef: "0x0c4b…okxwallet" }))).toBe("account");
    const walletBefore = await usdc("okx-wallet");
    const krakenBefore = await usdc("kraken");

    // the agent, with no new signature from the owner: the new exchange is no source, the new wallet no destination
    const out = await move("kraken", "hyperliquid", "500");
    expect(code(out)).toBe("E_MANDATE_RECIPIENT");
    expect((out as Refusal).message).toMatch(/"kraken" is not in the spending approval .*: it cannot be a source/);
    const into = await move("metamask", "okx-wallet", "300");
    expect(code(into)).toBe("E_MANDATE_RECIPIENT");
    expect((into as Refusal).message).toMatch(/"okx-wallet" is not in the spending approval/);
    // a venue the account had when the owner signed goes on working
    expect(code(await move("okx", "hyperliquid", "100"))).toBe("payment");
    t += 10 * MIN;
    await engine.settle();
    expect([(await usdc("kraken")) - krakenBefore, (await usdc("okx-wallet")) - walletBefore]).toEqual([0, 0]);
    expect(engine.payments.filter((p) => p.authority === "agent").map((p) => [p.to, p.amountUsd])).toEqual([["hyperliquid", 100]]);
    // and that wallet is the owner's to sign in, elsewhere: the account could not have brought the money back
    const back = await engine.resolve({ destination: "self", sourceDex: "okx-wallet", destinationDex: "metamask", token: "USDC", amount: "100" }, "owner");
    expect(!isRefusal(back) && back.route.access).toBe("owner");
    const cannotComeBackThroughTheAccount = !isRefusal(back) && /only you can sign there/.test(back.route.blocker?.why ?? "");
    expect(cannotComeBackThroughTheAccount).toBe(true);

    // a `*` the owner signs after plugging them in is spelled out with them: the new venues take the owner's signature, not the agent's
    expect(code(await star())).toBe("account");
    expect(code(await move("kraken", "hyperliquid", "500"))).toBe("payment");
    expect(code(await move("metamask", "okx-wallet", "300"))).toBe("payment");
  });
});
