/** SIGNING OUT (account/sign.ts signOut): a browser's last signature. The door takes it only from the device it names and only at once; the
 * device leaves the account's signers; the last one gone leaves no owner's browser, and a new pairing code replaces the one the server
 * started with; a restart replays it. Then the browser's own key code (public/owner.js) against a real account over HTTP — its WebCrypto
 * key, an in-memory stand-in for its IndexedDB and localStorage: it pairs with the printed code, signs itself out through the page's own
 * routes, deletes its key, stays signed out across a reload, and signs in again only when asked, with the new code. Nothing leaves the
 * process. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext, Script } from "node:vm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { isRefusal, type Refusal } from "../../src/core/errors.ts";
import type { Outcome } from "../../src/portfolio/account/exchange.ts";
import { SIGN_OUT_TTL_MS, signAgent, signDevice, signOwner, simKey, type OwnerAction, type SimKey } from "../../src/portfolio/account/sign.ts";
import type { LiveDeps } from "../../src/portfolio/live/index.ts";
import { startPortfolioServer } from "../../src/portfolio/server.ts";
import { PortfolioService } from "../../src/portfolio/service.ts";

type NoNonce<T> = T extends unknown ? Omit<T, "nonce"> : never;
const START = Date.parse("2026-10-19T14:00:00.000Z");
const HOUR = 3_600_000;
/** the code the server printed when it started */
const CODE = "K7QX-M2PA";
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
afterEach(() => vi.restoreAllMocks());

const fresh = () => {
  const h = mkdtempSync(join(tmpdir(), "account-sign-out-"));
  homes.push(h);
  return h;
};
/** one run of a real account on `home`, `at` ms after the start, trading on and asking for CODE: what its browsers sign, signed with their
 * device keys as the page signs */
async function run(home: string, at = 0) {
  let n = 0;
  const liveDeps: Partial<LiveDeps> = { clock: () => START + at, http: async () => ({ status: 599, body: undefined, text: "" }), price: async () => undefined };
  const svc = await PortfolioService.create({ home, now: () => new Date(START + at).toISOString(), venues: "frontline", real: true, liveDeps, liveWrites: { capUsd: 100, pairingCode: CODE } });
  await svc.restoring;
  const engine = svc.account!;
  const nonce = () => START + at + ++n;
  const by = (device: SimKey, a: NoNonce<OwnerAction>) => {
    const action = { ...a, nonce: nonce() } as OwnerAction;
    return svc.exchange({ action, nonce: action.nonce, signature: signDevice(device, action) });
  };
  return { svc, engine, by, nonce };
}
const code = (o: Outcome | Refusal): string => (isRefusal(o) ? o.code : o.kind);
const refusal = (o: unknown): Refusal => {
  if (!isRefusal(o)) throw new Error(`expected a refusal, got ${JSON.stringify(o).slice(0, 200)}`);
  return o;
};
const owners = (x: { engine: { state: { owners: Array<{ id: string }> } } }) => x.engine.state.owners.map((o) => o.id);
/** what the server says to its own output, kept: the new pairing code is said there */
const said = () => {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
  return { lines, code: () => [...lines.join("\n").matchAll(/pairing code: ([A-Z0-9]{4}-[A-Z0-9]{4})/g)].at(-1)?.[1] };
};
const watch = { type: "setWatch", venue: "ex", symbol: "BTC/USDT", on: "true" } as const;

describe("signing out: a browser's last signature, taken at the door", () => {
  it("a device signs ITSELF out — the account takes its signature no more, its other device signs on; another device's signature, or the owner's wallet key, signs no device out; a sign-out kept for later is refused", async () => {
    const x = await run(fresh());
    const a = simKey("device:sign-out-a");
    const b = simKey("device:sign-out-b");
    const wallet = simKey("owner-wallet");
    expect(x.engine.pairDevice(a.jwk, "this browser", CODE)).toMatchObject({ role: "owner" });
    // signed more than SIGN_OUT_TTL_MS before it reaches the door: a sign-out kept for later is never taken
    const late: OwnerAction = { type: "signOut", device: `device:${a.kid}`, nonce: START - SIGN_OUT_TTL_MS - 1 };
    expect(refusal(await x.svc.exchange({ action: late, nonce: late.nonce, signature: signDevice(a, late) }))).toMatchObject({ code: "E_ACCOUNT_EXPIRED" });
    expect(owners(x)).toEqual([`device:${a.kid}`]);
    // a second browser, and the owner's wallet key, let in beside it
    expect(x.engine.pairDevice(b.jwk, "the laptop")).toMatchObject({ role: "pending" });
    const users = [`device:${a.kid}`, `device:${b.kid}`, wallet.address.toLowerCase()].sort();
    expect(code(await x.by(a, { type: "convertToMultiSigUser", signers: JSON.stringify({ authorizedUsers: users, threshold: 1 }) }))).toBe("account");
    // neither signs `a` out: a browser signs only itself out
    expect(refusal(await x.by(b, { type: "signOut", device: `device:${a.kid}` })).message).toBe("a browser signs only itself out: this sign-out names another device");
    const byWallet: OwnerAction = { type: "signOut", device: `device:${a.kid}`, nonce: x.nonce() };
    expect(refusal(await x.svc.exchange(await signOwner(wallet, byWallet))).message).toBe("a browser signs only itself out: this sign-out names another device");
    expect(owners(x)).toEqual(users);
    // `a` signs itself out: it leaves the signers, its signature counts no more — `b` and the wallet key sign on
    const out = await x.by(a, { type: "signOut", device: `device:${a.kid}` });
    expect(out).toMatchObject({ ok: true, kind: "account", summary: `signed out: device ${a.kid.slice(0, 8)} no longer signs for the account` });
    expect(owners(x)).toEqual(users.filter((u) => u !== `device:${a.kid}`));
    expect(code(await x.by(a, watch))).toBe("E_ACCOUNT_BAD_SIGNATURE");
    expect(code(await x.by(b, watch))).toBe("account");
    // signing out again: its key is no longer the account's — and a device that no longer signs has nothing to sign out of
    expect(code(await x.by(a, { type: "signOut", device: `device:${a.kid}` }))).toBe("E_ACCOUNT_BAD_SIGNATURE");
    expect(refusal(await x.engine.prepare({ type: "signOut", device: `device:${a.kid}` })).message).toBe("this browser does not sign for the account: there is nothing to sign out of");
    // a wallet key is no device: it has no browser to sign out of
    expect(refusal(await x.engine.prepare({ type: "signOut", device: wallet.address.toLowerCase() })).message).toBe("this browser does not sign for the account: there is nothing to sign out of");
  });

  it("THE LAST DEVICE signed out: no browser signs for the account; the code the server started with lets no browser in — counted as a wrong try, the tries counted afresh — and a new one, said in the server's output, makes the next browser the owner", async () => {
    const x = await run(fresh());
    const a = simKey("device:last-a");
    const c = simKey("device:last-c");
    // four wrong tries before the right one: one more would have locked pairing until a restart
    for (let i = 0; i < 4; i++) expect(isRefusal(x.engine.pairDevice(a.jwk, "this browser", "AAAA-BBBB"))).toBe(true);
    expect(x.engine.pairDevice(a.jwk, "this browser", CODE)).toMatchObject({ role: "owner" });
    const out = said();
    expect(await x.by(a, { type: "signOut", device: `device:${a.kid}` })).toMatchObject({ ok: true, summary: `signed out: device ${a.kid.slice(0, 8)} no longer signs for the account · no browser signs for it now: the next one pairs with a new pairing code` });
    expect(owners(x)).toEqual([]);
    expect((await x.engine.view()).signers).toMatchObject({ owners: [], threshold: 1 });
    // a new code, said where the first one was — eight characters off the readable alphabet, not the old one
    const next = out.code();
    expect(next).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(next).not.toBe(CODE);
    expect(out.lines.join("\n")).toContain("signed out: no browser signs for the account now");
    // a browser now asks for the code — the one signed out too, were its key still here
    expect(x.engine.pairDevice(a.jwk)).toMatchObject({ role: "needs-code" });
    expect(x.engine.pairDevice(c.jwk)).toMatchObject({ role: "needs-code" });
    // the old code is a wrong try, counted from nothing again (four tries left, not the lock the earlier four would have made it)
    expect(refusal(x.engine.pairDevice(c.jwk, "this browser", CODE)).message).toBe("that is not the pairing code this server printed in its terminal (4 tries left)");
    // the new one lets the next browser in, as the owner's
    expect(x.engine.pairDevice(c.jwk, "this browser", next!.toLowerCase().replace("-", " "))).toMatchObject({ role: "owner" });
    expect(owners(x)).toEqual([`device:${c.kid}`]);
    expect(code(await x.by(c, watch))).toBe("account");
  });

  it("a restart replays it: the browser signed out does not come back as the owner's — the run says no owner yet — and the browser paired after it does", async () => {
    const home = fresh();
    const a = simKey("device:restart-a");
    const c = simKey("device:restart-c");
    const one = await run(home);
    expect(one.engine.pairDevice(a.jwk, "this browser", CODE)).toMatchObject({ role: "owner" });
    said();
    expect(code(await one.by(a, { type: "signOut", device: `device:${a.kid}` }))).toBe("account");
    // started again: nobody's browser, so the code this run printed is asked for
    const two = await run(home, HOUR);
    expect(two.svc.restored).toMatchObject({ owner: false, skipped: [] });
    expect(owners(two)).toEqual([]);
    expect(two.engine.pairDevice(a.jwk)).toMatchObject({ role: "needs-code" });
    expect(two.engine.pairDevice(c.jwk, "this browser", CODE)).toMatchObject({ role: "owner" });
    // and again: the browser paired after the sign-out is the owner's, the one signed out still is not
    const three = await run(home, 2 * HOUR);
    expect(three.svc.restored).toMatchObject({ owner: true, skipped: [] });
    expect(owners(three)).toEqual([`device:${c.kid}`]);
    expect(code(await three.by(a, watch))).toBe("E_ACCOUNT_BAD_SIGNATURE");
    expect(code(await three.by(c, watch))).toBe("account");
  });

  it("A LIMIT the browser signed counts no more once it signs out: the sign-out names it, the page shows it beside the limit with whose signature it was, the door's refusal says why — and a browser that signs now signs it again", async () => {
    const x = await run(fresh());
    const a = simKey("device:limits-a");
    const b = simKey("device:limits-b");
    const agent = simKey("agent:limits");
    expect(x.engine.pairDevice(a.jwk, "this browser", CODE)).toMatchObject({ role: "owner" });
    expect(x.engine.pairDevice(b.jwk, "the laptop")).toMatchObject({ role: "pending" });
    expect(code(await x.by(a, { type: "convertToMultiSigUser", signers: JSON.stringify({ authorizedUsers: [`device:${a.kid}`, `device:${b.kid}`].sort(), threshold: 1 }) }))).toBe("account");
    expect(code(await x.by(a, { type: "approveAgent", agentAddress: agent.address, agentName: "Claude Code", validUntil: START + 30 * 24 * HOUR }))).toBe("account");
    const limit = { type: "approveSpend", agent: agent.address, scope: "trade", allow: "ex", perPayment: "10", budget: "100", windowHours: 0, validUntil: START + 7 * 24 * HOUR } as const;
    expect(code(await x.by(a, limit))).toBe("account");
    let spend = (await x.engine.view()).spend;
    expect(spend).toEqual([expect.objectContaining({ agentName: "Claude Code", scope: "trade", signedBy: `device:${a.kid}` })]);
    expect(spend[0]!.void).toBeUndefined();
    // `a` signs out: the limit it signed is named in the sign-out's own words; `b` signs on, so no new pairing code is needed
    expect(await x.by(a, { type: "signOut", device: `device:${a.kid}` })).toMatchObject({ ok: true, summary: `signed out: device ${a.kid.slice(0, 8)} no longer signs for the account · a limit it signed counts no more until an owner signs it again: Claude Code's trading limit` });
    spend = (await x.engine.view()).spend;
    const why = `it was signed by device ${a.kid.slice(0, 8)}, which no longer signs for the account`;
    expect(spend[0]).toMatchObject({ signedBy: `device:${a.kid}`, void: why });
    // the agent's order stops at its limit, saying why and what makes it count again — before any venue is asked
    const order = { type: "agentLiveOrder", venue: "ex", symbol: "BTC/USDT", side: "buy", orderType: "market", qty: "", usd: "10", limitPrice: "" } as const;
    expect(refusal(await x.svc.exchange(await signAgent(agent, { ...order, nonce: x.nonce() })))).toMatchObject({ code: "E_ACCOUNT_BAD_SIGNATURE", message: `the trading limit's own signature no longer checks out against the account's owners: ${why} — it counts again once an owner signs it again` });
    // `b`, which signs now, signs the same limit again: it replaces the dead one and counts — the order gets past its limit, to the venue
    // this account does not have
    expect(code(await x.by(b, limit))).toBe("account");
    spend = (await x.engine.view()).spend;
    expect(spend).toEqual([expect.objectContaining({ signedBy: `device:${b.kid}` })]);
    expect(spend[0]!.void).toBeUndefined();
    expect(code(await x.svc.exchange(await signAgent(agent, { ...order, nonce: x.nonce() })))).not.toBe("E_ACCOUNT_BAD_SIGNATURE");
  });
});

// ---- the browser's own key code against a real account ----------------------------------------------------------------------------------

const OWNER_JS = readFileSync(fileURLToPath(new URL("../../src/portfolio/public/owner.js", import.meta.url)), "utf8");

/** IndexedDB as owner.js uses it — one store, get, put and delete, each request answered in a later turn — over a Map that outlives a page */
function idbOver(keys: Map<string, unknown>) {
  const request = <T>(fn: () => T) => {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    queueMicrotask(() => {
      try {
        r.result = fn();
        r.onsuccess?.();
      } catch (e) {
        r.error = e;
        r.onerror?.();
      }
    });
    return r;
  };
  const store = { get: (k: string) => request(() => keys.get(k)), put: (v: unknown, k: string) => request(() => (keys.set(k, v), k)), delete: (k: string) => request(() => void keys.delete(k)) };
  return { open: () => request(() => ({ transaction: () => ({ objectStore: () => store }) })) };
}

/** owner.js as a page of this browser loads it: its key in `keys`, its localStorage in `kept`, its requests to the account at `base`, each
 * counted by path */
function browserPage(base: string, keys: Map<string, unknown>, kept: Map<string, string>) {
  const asked: string[] = [];
  const sandbox: Record<string, unknown> = {
    indexedDB: idbOver(keys),
    localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, String(v)), removeItem: (k: string) => void kept.delete(k) },
    crypto: globalThis.crypto,
    fetch: (path: string, init?: RequestInit) => {
      asked.push(path);
      return fetch(`${base}${path}`, init);
    },
    btoa,
    TextEncoder,
    location: { reload() {} },
    addEventListener() {},
  };
  const ctx = createContext(sandbox);
  new Script(`${OWNER_JS}\nglobalThis.Owner = Owner;`, { filename: "owner.js" }).runInContext(ctx);
  return { Owner: runInContext("Owner", ctx) as { ready(code?: string): Promise<{ role: string; refusal?: string }>; signOut(): Promise<{ status: number; body: Record<string, unknown> }>; signIn(): Promise<{ role: string }>; role: string; kid: string }, asked };
}

describe("signing out from the browser: owner.js against a real account over HTTP", () => {
  it("pairs with the printed code, signs itself out through prepare and the door, deletes its key and stays signed out across a reload — asking nothing, making no key — until it signs in again: a new key, then the new code", async () => {
    const x = await run(fresh());
    const srv = await startPortfolioServer({ port: 0, service: x.svc, snapshotMs: 0 });
    try {
      const keys = new Map<string, unknown>();
      const kept = new Map<string, string>();
      const page = browserPage(srv.url, keys, kept);
      expect(await page.Owner.ready()).toEqual({ role: "needs-code" });
      expect(await page.Owner.ready(CODE)).toEqual({ role: "owner" });
      const kid = page.Owner.kid;
      expect(keys.has("device")).toBe(true);
      expect(owners(x)).toEqual([`device:${kid}`]);
      // signing out: the page's own routes — prepare, then the door — with the browser's WebCrypto signature over what was shown
      const out = said();
      const r = await page.Owner.signOut();
      expect(r).toMatchObject({ status: 200, body: { ok: true, kind: "account" } });
      expect(page.asked.slice(-2)).toEqual(["/api/account/prepare", "/api/exchange"]);
      expect([page.Owner.role, page.Owner.kid, keys.has("device"), kept.get("buyer-agent-signed-out")]).toEqual(["signed-out", "", false, "1"]);
      const account = (await (await fetch(`${srv.url}/api/account`)).json()) as { signers: { owners: unknown[] } };
      expect(account.signers.owners).toEqual([]);
      // signing out again, signed out: nothing to sign, nothing asked
      expect(await page.Owner.signOut()).toEqual({ status: 0, body: { ok: false, error: "This browser does not sign for the account." } });
      // a reload: signed out still — no key made, nothing offered to the account
      const reloaded = browserPage(srv.url, keys, kept);
      expect(await reloaded.Owner.ready()).toEqual({ role: "signed-out" });
      expect([reloaded.asked, keys.size]).toEqual([[], 0]);
      // signing in again: a new key, and the account asks for a code — the old one is refused, the new one said in the server's output lets it in
      expect(await reloaded.Owner.signIn()).toEqual({ role: "needs-code" });
      expect(keys.has("device")).toBe(true);
      expect(kept.has("buyer-agent-signed-out")).toBe(false);
      expect((await reloaded.Owner.ready(CODE)).refusal).toBe("that is not the pairing code this server printed in its terminal (4 tries left)");
      expect(await reloaded.Owner.ready(out.code())).toEqual({ role: "owner" });
      expect(reloaded.Owner.kid).not.toBe(kid);
      expect(owners(x)).toEqual([`device:${reloaded.Owner.kid}`]);
    } finally {
      await srv.close();
    }
  });

  it("a sign-out the account did not take leaves the browser signing, its key kept: the service not answering", async () => {
    const x = await run(fresh());
    const srv = await startPortfolioServer({ port: 0, service: x.svc, snapshotMs: 0 });
    const keys = new Map<string, unknown>();
    const kept = new Map<string, string>();
    const page = browserPage(srv.url, keys, kept);
    expect(await page.Owner.ready(CODE)).toEqual({ role: "owner" });
    await srv.close();
    const r = await page.Owner.signOut();
    expect(r).toEqual({ status: 0, body: { ok: false, error: "The account did not answer. Try again." } });
    expect([page.Owner.role, keys.has("device"), kept.has("buyer-agent-signed-out")]).toEqual(["owner", true, false]);
    expect(owners(x)).toHaveLength(1);
  });
});
