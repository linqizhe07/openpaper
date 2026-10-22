/** TWO HOLES FOUND BY AN INDEPENDENT REVIEW (2026-10-04), closed — attacker C, a local process with no key at all, talking HTTP.
 *
 * What the unauthenticated surface gave away:
 *   1. `GET /api/overview` returned the last 80 ledger rows whole — including every signed envelope. Reading the ledger file was not needed
 *      to hold the owner's signed approvals (which made the replays in replay-fractional-nonce / multisig-cosigner-swap an HTTP attack).
 *   2. Trust on first use is accepted for the FIRST browser. But `reset()` put the owners back to the seed — on the server that is nobody —
 *      so the account was up for grabs again: whoever posted a key to `/api/account/pair` next was the owner, and the real owner's browser
 *      (the Account page offers its key again only on its next refresh, up to 20 s later) was left "pending". The new owner authorised its
 *      own agent key and approved its own spending.
 *
 * What closes them: no signed envelope leaves over HTTP — an overview row says `signed: true`, and the envelope stays in the ledger file
 * (server.ts, /api/overview); and a reset keeps the paired owner (account/exchange.ts reset), so the intruder stays pending, its device key
 * signs for nobody (401, E_ACCOUNT_BAD_SIGNATURE), and it holds no agent key and no approval. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Refusal } from "../../src/core/errors.ts";
import { signDevice, simKey, type Envelope, type OwnerAction, type SimKey } from "../../src/portfolio/account/sign.ts";
import { startPortfolioServer, type PortfolioServerHandle } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

const START = Date.parse("2026-10-05T14:00:00.000Z");
const DAY = 86_400_000;
const ownersBrowser = simKey("owner-device");
const intruder = simKey("intruder-device");
const cc = simKey("agent:claude-code");
const intrudersAgent = simKey("agent:intruder");
let home: string | undefined;
let server: PortfolioServerHandle | undefined;
afterAll(async () => {
  await server?.close();
  if (home) rmSync(home, { recursive: true, force: true });
});

describe("C · no key, only HTTP", () => {
  it("reads no signed envelope off /api/overview; after a reset the owner's browser is still the owner, and the intruder's key signs for nobody", async () => {
    let n = 0;
    home = mkdtempSync(join(tmpdir(), "attack-http-"));
    // the server as `npm run portfolio` starts it: the account layer mounted, no owner seeded
    const svc = await PortfolioService.create({ home, now: () => new Date(START).toISOString(), venues: "frontline" });
    server = await startPortfolioServer({ port: 0, service: svc });
    const url = server.url;
    const post = async (path: string, body: unknown) => {
      const r = await fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, body: (await r.json()) as Record<string, unknown> };
    };
    const get = async (path: string) => (await (await fetch(`${url}${path}`)).json()) as Record<string, unknown>;
    const signed = (by: SimKey, a: Record<string, unknown>) => {
      const action = { ...a, nonce: START + ++n } as OwnerAction;
      return post("/api/exchange", { action, nonce: action.nonce, signature: signDevice(by, action) });
    };
    const owners = async () => ((await get("/api/account")).signers as { owners: Array<{ id: string }> }).owners.map((o) => o.id);
    const refusalOf = (r: { status: number; body: Record<string, unknown> }) => [r.status, (r.body.refusal as Refusal | undefined)?.code];

    // the owner opens the page first and sets the account up
    expect((await post("/api/account/pair", { jwk: ownersBrowser.jwk })).body.role).toBe("owner");
    expect(await owners()).toEqual([`device:${ownersBrowser.kid}`]);
    expect((await signed(ownersBrowser, { type: "approveAgent", agentAddress: cc.address, agentName: "Claude Code", validUntil: START + 30 * DAY })).status).toBe(200);
    expect((await signed(ownersBrowser, { type: "approveSpend", agent: cc.address, scope: "venues", allow: "okx,metamask,hyperliquid", perPayment: "600", budget: "1000", windowHours: 0, validUntil: START + 30 * DAY })).status).toBe(200);

    // 1 · the overview says which rows are signed; the envelopes themselves do not leave over HTTP
    const ledger = (await get("/api/overview")).ledger as Array<{ tool?: string; signed?: boolean; envelope?: Envelope }>;
    expect(ledger.filter((r) => r.envelope !== undefined)).toEqual([]);
    expect([...new Set(ledger.filter((r) => r.signed === true).map((r) => r.tool))].sort()).toEqual(["approveAgent", "approveSpend"]);

    // a second browser cannot take the account while the owner holds it
    expect((await post("/api/account/pair", { jwk: intruder.jwk })).body.role).toBe("pending");

    // 2 · the owner resets the simulation (a signed instruction): the paired owner stays the owner
    expect((await signed(ownersBrowser, { type: "setPolicy", change: "reset", value: "" })).status).toBe(200);
    expect(await owners()).toEqual([`device:${ownersBrowser.kid}`]);
    // the intruder pairs before the owner's page refreshes: it is still waiting, and the owner's browser is still the owner
    expect((await post("/api/account/pair", { jwk: intruder.jwk })).body.role).toBe("pending");
    expect((await post("/api/account/pair", { jwk: ownersBrowser.jwk })).body.role).toBe("owner");
    expect(await owners()).toEqual([`device:${ownersBrowser.kid}`]);

    // the owner's own signature is still the owner's; the intruder's device key signs for nobody
    expect((await signed(ownersBrowser, { type: "userSetAbstraction", abstraction: "unifiedAccount" })).status).toBe(200);
    expect(refusalOf(await signed(intruder, { type: "approveAgent", agentAddress: intrudersAgent.address, agentName: "Mine", validUntil: START + 30 * DAY }))).toEqual([401, "E_ACCOUNT_BAD_SIGNATURE"]);
    expect(refusalOf(await signed(intruder, { type: "approveSpend", agent: intrudersAgent.address, scope: "venues", allow: "*", perPayment: "100000", budget: "100000", windowHours: 0, validUntil: START + 30 * DAY }))).toEqual([401, "E_ACCOUNT_BAD_SIGNATURE"]);
    const page = await get("/api/account");
    const keys = page.keys as Array<{ address: string }>;
    expect(keys.filter((k) => k.address === intrudersAgent.address)).toEqual([]);
    const spend = page.spend as Array<{ agent: string }>;
    expect(spend.filter((s) => s.agent === intrudersAgent.address)).toEqual([]);
  });
});
