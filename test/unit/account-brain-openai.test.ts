import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonIn, jsonSchemaOf, OPENAI_KEY_REF, OPENAI_KEY_TEMPLATE, openaiBrain, openaiReach, parseBaseUrl } from "../../src/portfolio/account/brain-openai.ts";
import { BRAIN_PRESETS } from "../../src/portfolio/account/brains.ts";
import { DECISIONS, type Brain, type BrainConfig } from "../../src/portfolio/account/desk.ts";

/** THE OPENAI-FORMAT BRAIN (account/brain-openai.ts): any chat-completions endpoint, one brain per preset (brains.ts), reached as the owner
 * says (its key file credentials/brains/<id>.json, the "openai" preset's older credentials/openai/api-key.json still read, or the
 * environment), asked one structured question with the role's shape as a JSON schema; plain http only to this machine; the preset's and
 * the host's quirks (DeepSeek's json_object and its word "json", Meta's never-"none" effort); the request's dialect learned from the
 * endpoint's 400s and kept; every refusal and error in words that never carry the key; a cut-off, refused, filtered or ill-fitting answer
 * is "no decision"; "Test the key" lists the models and bills nothing. Nothing here reaches a network: the endpoint is a stand-in fetch,
 * and every key is made up. */

const KEY = "sk-test-not-a-real-key-0123456789abcdef";
const env = {} as NodeJS.ProcessEnv;
const homes: string[] = [];
afterAll(() => homes.forEach((h) => rmSync(h, { recursive: true, force: true })));
/** a home with the key file written as given (none: no file) */
const homeWith = (file?: string): string => {
  const home = mkdtempSync(join(tmpdir(), "brain-openai-"));
  homes.push(home);
  if (file !== undefined) {
    mkdirSync(join(home, "credentials", "openai"), { recursive: true, mode: 0o700 });
    writeFileSync(join(home, OPENAI_KEY_REF), file, { mode: 0o600 });
  }
  return home;
};
const DEEPSEEK = JSON.stringify({ apiKey: KEY, baseUrl: "https://api.deepseek.com/v1/", model: "deepseek-chat" });
/** an endpoint none of the presets knows the ways of: what the brain learns there, it learns from the endpoint's own answers */
const ELSEWHERE = JSON.stringify({ apiKey: KEY, baseUrl: "https://llm.example.com/v1/", model: "house-model-1" });
const OPENAI = JSON.stringify({ apiKey: KEY });
/** a home with files written as given, by their path in the home, each the user's alone */
const homeFiles = (files: Record<string, string>): string => {
  const home = mkdtempSync(join(tmpdir(), "brain-openai-"));
  homes.push(home);
  for (const [ref, text] of Object.entries(files)) {
    mkdirSync(join(home, ref, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(join(home, ref), text, { mode: 0o600 });
  }
  return home;
};
const preset = (id: string) => {
  const p = BRAIN_PRESETS.find((x) => x.id === id);
  if (!p || p.format !== "openai") throw new Error(`no OpenAI-format preset ${id}`);
  const { format: _f, ...rest } = p;
  return rest;
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
/** a stand-in endpoint: answers in turn, each a status and a JSON body; every request recorded */
function endpoint(answers: Array<{ status: number; body: unknown }>, o: { throws?: Error | undefined } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url: String(url), headers, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (o.throws) throw o.throws;
    const a = answers.shift() ?? { status: 500, body: { error: { message: "no answer scripted" } } };
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const RISK = { verdict: "clear", why: "a tight spread", sizeUsd: 40, tpPct: 2, slPct: 1, maxHours: 12 };
const answer = (content: unknown, o: { finish?: string | undefined; usage?: Record<string, unknown> | undefined; message?: Record<string, unknown> | undefined } = {}) => ({ status: 200, body: { choices: [{ message: { content: typeof content === "string" || Array.isArray(content) ? content : JSON.stringify(content), ...(o.message ?? {}) }, finish_reason: o.finish ?? "stop" }], usage: o.usage ?? { prompt_tokens: 120, completion_tokens: 30 } } });
const err = (status: number, message: string) => ({ status, body: { error: { message, type: "invalid_request_error" } } });
const cfg = (model = "deepseek-chat", effort: BrainConfig["effort"] = "medium"): BrainConfig => ({ provider: "openai", model, effort });
const ask = (b: Brain, brain: BrainConfig = cfg()) => b.decide({ role: "risk", brain, system: "You are RISK.", input: "BTC/USDT · spread 0.02%", schema: DECISIONS.RiskOut, maxTokens: 512 });

describe("how the brain reaches the endpoint", () => {
  it("no file, the example left in it, a file it cannot use, a bad base URL, a key — and never a value; the environment too", () => {
    const none = homeWith();
    // no file, old or new: the fix makes the NEW one (credentials/brains/openai.json) with the EMPTY template, readable by the user alone,
    // and opens it — a command that runs as written, with no value in it to replace first; the environment is mentioned only for an account
    // started by hand
    const file = join(none, "credentials", "brains", "openai.json");
    const missing = openaiReach({ home: none, env, platform: "darwin" });
    expect(missing).toMatchObject({ ok: false, why: expect.stringMatching(/^no key: the brain reads OpenAI API's key from .*credentials\/brains\/openai\.json, which is not there yet; .*no restart needed \(if you start the account by hand, OPENAI_API_KEY/) });
    expect(!missing.ok && missing.fix).toEqual({ code: "no-key", file, restart: false, words: expect.stringMatching(/^Run the command below: it makes the key file, readable by you alone, and opens it\. .* no restart\.$/), command: `mkdir -p '${join(none, "credentials", "brains")}' && (umask 077 && printf '${OPENAI_KEY_TEMPLATE}\\n' > '${file}') && open -e '${file}'` });
    expect(OPENAI_KEY_TEMPLATE).toBe('{"apiKey": "", "baseUrl": "https://api.openai.com/v1", "model": ""}');
    // elsewhere than a Mac: the owner's editor
    const linux = openaiReach({ home: none, env, platform: "linux" });
    expect(!linux.ok && linux.fix.command).toMatch(/ && \$\{EDITOR:-nano\} '.*openai\.json'$/);
    // the template as it was made, still empty: the example, opened again
    const template = homeWith(OPENAI_KEY_TEMPLATE);
    const empty = openaiReach({ home: template, env, platform: "darwin" });
    expect(empty).toMatchObject({ ok: false, why: expect.stringMatching(/api-key\.json holds the example, not a key: .* no restart needed/), fix: { code: "example", command: `open -e '${join(template, OPENAI_KEY_REF)}'`, restart: false } });
    const example = homeWith('{"apiKey": "sk-…", "baseUrl": "https://api.openai.com/v1", "model": "<the model, as the endpoint names it>"}');
    expect(openaiReach({ home: example, env })).toMatchObject({ ok: false, why: expect.stringMatching(/api-key\.json holds the example, not a key: .* no restart needed/), fix: { code: "example" } });
    // a real key with the old how-to's placeholder model: the model is the example, never sent as a model's name — even beside the form's
    const placeholder = homeWith(JSON.stringify({ apiKey: KEY, model: "<the model, as the endpoint names it>" }));
    expect(openaiReach({ home: placeholder, env })).toMatchObject({ ok: false, why: expect.stringMatching(/^the key file's model is the example: name the model's name as the endpoint names it/), fix: { code: "example" } });
    expect(openaiReach({ home: placeholder, env }, "gpt-5")).toMatchObject({ ok: false, fix: { code: "example" } });
    const noField = homeWith('{"secret": "x"}');
    expect(openaiReach({ home: noField, env, platform: "darwin" })).toMatchObject({ ok: false, why: expect.stringMatching(/^the key file cannot be used: .*missing "apiKey"/), fix: { code: "unusable", command: expect.stringMatching(/^open -e '/), restart: false } });
    const ftp = homeWith(JSON.stringify({ apiKey: KEY, baseUrl: "ftp://x" }));
    expect(openaiReach({ home: ftp, env })).toMatchObject({ ok: false, why: expect.stringMatching(/^"baseUrl" in .* is not an http\(s\) URL/) });
    const query = homeWith(JSON.stringify({ apiKey: KEY, baseUrl: "https://x.example/v1?k=1" }));
    expect(openaiReach({ home: query, env })).toMatchObject({ ok: false, why: expect.stringMatching(/without a query/) });
    const deepseek = homeWith(DEEPSEEK);
    const r = openaiReach({ home: deepseek, env });
    expect(r).toMatchObject({ ok: true, how: "the key file credentials/openai/api-key.json · api.deepseek.com", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" });
    const b = openaiBrain({ home: deepseek, env });
    expect(b.id).toBe("openai");
    expect(b.models).toEqual([]);
    expect(b.ready()).toEqual({ ok: true, model: "deepseek-chat", how: "the key file credentials/openai/api-key.json · api.deepseek.com" });
    expect(JSON.stringify(b.ready())).not.toContain(KEY);
    // OpenAI's own, by default: the file's base URL left out. A file that names no model is ready only beside a desk whose form names one
    expect(openaiReach({ home: homeWith(OPENAI), env }, "gpt-5")).toMatchObject({ ok: true, baseUrl: "https://api.openai.com/v1", model: "gpt-5", how: expect.stringMatching(/· api.openai.com$/) });
    expect(openaiBrain({ home: homeWith(OPENAI), env }).ready("gpt-5")).toMatchObject({ ok: true, model: "gpt-5" });
    expect(openaiBrain({ home: homeWith(OPENAI), env }).ready()).toMatchObject({ ok: false, fix: { code: "example" } });
    chmodSync(join(deepseek, OPENAI_KEY_REF), 0o644);
    const loose = openaiReach({ home: deepseek, env });
    expect(loose).toMatchObject({ ok: false, why: expect.stringMatching(/^the key file cannot be used: .*chmod 600/), fix: { code: "unusable", command: `chmod 600 '${join(deepseek, OPENAI_KEY_REF)}'`, restart: false } });
    expect(JSON.stringify(loose)).not.toContain(KEY);
    // the environment: the example refused, a key taken with its base URL and model, a local endpoint allowed
    const envExample = openaiReach({ home: none, env: { OPENAI_API_KEY: "sk-..." } as NodeJS.ProcessEnv });
    // (the environment's fix names the new file: where a key goes that needs no restart)
    expect(envExample).toMatchObject({ ok: false, why: expect.stringMatching(/^OPENAI_API_KEY .* not a key/), fix: { code: "env", file, restart: true } });
    // no command fixes the environment from here: it is set where the service is started
    expect(!envExample.ok && envExample.fix.command).toBeUndefined();
    expect(openaiReach({ home: none, env: { OPENAI_API_KEY: KEY, OPENAI_BASE_URL: "http://localhost:11434/v1", OPENAI_MODEL: "qwen3:8b" } as NodeJS.ProcessEnv })).toMatchObject({ ok: true, how: "OPENAI_API_KEY in the service's environment · localhost:11434", baseUrl: "http://localhost:11434/v1", model: "qwen3:8b" });
    expect(openaiReach({ home: none, env: { OPENAI_API_KEY: KEY, OPENAI_BASE_URL: "not a url" } as NodeJS.ProcessEnv })).toMatchObject({ ok: false, why: expect.stringMatching(/^OPENAI_BASE_URL in the service's environment is not a URL/) });
  });
});

describe("the question, asked", () => {
  it("at OpenAI's own endpoint: the key as a bearer, max_completion_tokens with room to reason, the effort, the shape as a strict JSON schema; the answer checked and counted", async () => {
    const ep = endpoint([answer(RISK)]);
    const b = openaiBrain({ home: homeWith(OPENAI), env, fetch: ep.fetch });
    const a = await ask(b, cfg("gpt-5", "high"));
    expect(a).toEqual({ out: RISK, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(ep.calls).toHaveLength(1);
    const c = ep.calls[0]!;
    expect(c.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(c.body.model).toBe("gpt-5");
    expect(c.body.max_completion_tokens).toBe(512 + 8192);
    expect(c.body.max_tokens).toBeUndefined();
    expect(c.body.reasoning_effort).toBe("high");
    const rf = c.body.response_format as { type: string; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(rf.json_schema.schema.required).toEqual(["verdict", "why", "sizeUsd", "tpPct", "slPct", "maxHours"]);
    expect(rf.json_schema.schema.$schema).toBeUndefined();
    const msgs = c.body.messages as Array<{ role: string; content: string }>;
    expect(msgs[0]).toMatchObject({ role: "system", content: expect.stringMatching(/^You are RISK\.\nAnswer with one JSON object and nothing else, in this shape: \{/) });
    expect(msgs[1]).toEqual({ role: "user", content: "BTC/USDT · spread 0.02%" });
  });

  it("elsewhere: max_tokens first; a 400 naming a field changes that field and asks again, the dialect it lands on kept for the next question", async () => {
    const ep = endpoint([err(400, "Unrecognized request argument supplied: reasoning_effort"), err(400, "response_format of type json_schema is not supported"), answer(RISK), answer(RISK)]);
    const b = openaiBrain({ home: homeWith(ELSEWHERE), env, fetch: ep.fetch });
    const a = await ask(b, cfg(""));
    expect(a.out).toEqual(RISK);
    expect(ep.calls).toHaveLength(3);
    expect(ep.calls[0]!.url).toBe("https://llm.example.com/v1/chat/completions");
    expect(ep.calls[0]!.body).toMatchObject({ model: "house-model-1", max_tokens: 512 + 8192, reasoning_effort: "medium", response_format: { type: "json_schema" } });
    expect(ep.calls[1]!.body).toMatchObject({ max_tokens: 512, response_format: { type: "json_schema" } });
    expect(ep.calls[1]!.body.reasoning_effort).toBeUndefined();
    expect(ep.calls[2]!.body).toMatchObject({ max_tokens: 512, response_format: { type: "json_object" } });
    expect(ep.calls[2]!.body.reasoning_effort).toBeUndefined();
    // the next question goes straight in the learned dialect
    await ask(b, cfg(""));
    expect(ep.calls).toHaveLength(4);
    expect(ep.calls[3]!.body).toMatchObject({ max_tokens: 512, response_format: { type: "json_object" } });
    expect(ep.calls[3]!.body.reasoning_effort).toBeUndefined();
    // "Use max_completion_tokens instead" names the limit's field
    const ep2 = endpoint([err(400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."), answer(RISK)]);
    const b2 = openaiBrain({ home: homeWith(ELSEWHERE), env, fetch: ep2.fetch });
    expect((await ask(b2)).out).toEqual(RISK);
    expect(ep2.calls[1]!.body.max_completion_tokens).toBe(512 + 8192);
    expect(ep2.calls[1]!.body.max_tokens).toBeUndefined();
  });

  it("a 400 naming nothing tries each field once, then gives the endpoint's words; the model, the key, the balance, the rate, the path, the server, the network — each said, the key never", async () => {
    const dead = endpoint([err(400, "Model Not Exist"), err(400, "Model Not Exist"), err(400, "Model Not Exist"), err(400, "Model Not Exist")]);
    const b = openaiBrain({ home: homeWith(ELSEWHERE), env, fetch: dead.fetch });
    await expect(ask(b)).rejects.toThrow("the endpoint llm.example.com answered 400: Model Not Exist");
    expect(dead.calls).toHaveLength(4);
    const at = (answers: Array<{ status: number; body: unknown }>) => ask(openaiBrain({ home: homeWith(OPENAI), env, fetch: endpoint(answers).fetch }));
    await expect(at([err(401, `Incorrect API key provided: ${KEY}. You can find your API key at…`)])).rejects.toThrow(/^the endpoint api.openai.com did not accept the key$/);
    // a refused key is its own kind: the desk keeps it as the brain's standing, with the fix (the file opened again, no restart)
    const refused = await at([err(401, "Incorrect API key provided")]).catch((e: unknown) => e as { code?: string; who?: string; fix?: { code: string; restart: boolean; command?: string } });
    expect(refused).toMatchObject({ code: "E_BRAIN_KEY_REJECTED", who: "api.openai.com", fix: { code: "rejected", restart: false, command: expect.stringMatching(/api-key\.json'$/) } });
    await expect(at([err(402, "Insufficient Balance")])).rejects.toThrow("the endpoint api.openai.com says the balance is out: Insufficient Balance");
    await expect(at([err(404, `The model \`deepseek-chat\` does not exist`)])).rejects.toThrow('nothing answers at api.openai.com/chat/completions for "deepseek-chat": the base URL\'s path, or the model\'s name: The model `deepseek-chat` does not exist');
    await expect(at([err(429, "Rate limit reached")])).rejects.toThrow("the endpoint api.openai.com is rate-limiting this key: Rate limit reached — it is asked again next cycle");
    await expect(at([err(503, "Service Unavailable")])).rejects.toThrow("the endpoint api.openai.com answered 503: Service Unavailable");
    await expect(at([{ status: 502, body: "<html>bad gateway</html>" }])).rejects.toThrow("the endpoint api.openai.com answered 502");
    // an endpoint that echoes the key back in an error: masked — and "sk-abc123456789" shares eight characters with the key ("23456789"), so
    // it is masked whole as a piece of it
    await expect(at([err(500, `boom ${KEY} boom sk-abc123456789 key_abcdefgh`)])).rejects.toThrow("the endpoint api.openai.com answered 500: boom … boom … key-…");
    const down = endpoint([], { throws: Object.assign(new Error("fetch failed"), { name: "TypeError" }) });
    await expect(ask(openaiBrain({ home: homeWith(DEEPSEEK), env, fetch: down.fetch }))).rejects.toThrow("the endpoint api.deepseek.com could not be reached");
    const slow = endpoint([], { throws: Object.assign(new Error("timeout"), { name: "TimeoutError" }) });
    await expect(ask(openaiBrain({ home: homeWith(DEEPSEEK), env, fetch: slow.fetch }))).rejects.toThrow("the endpoint api.deepseek.com could not be reached in time");
  });

  it("no decision, said so: cut off, refused, filtered, not JSON, the wrong shape; JSON in a fence or in prose or in parts is read; no key and no model are no decision too", async () => {
    const at = (a: { status: number; body: unknown }, brain = cfg()) => ask(openaiBrain({ home: homeWith(ELSEWHERE), env, fetch: endpoint([a]).fetch }), brain);
    expect(await at(answer("", { finish: "length" }))).toMatchObject({ out: null, why: "the answer ran past its token limit" });
    expect(await at(answer(null, { message: { refusal: "I cannot help with that." } }))).toMatchObject({ out: null, why: "the model declined to answer: I cannot help with that." });
    expect(await at(answer("", { finish: "content_filter" }))).toMatchObject({ out: null, why: "the endpoint's content filter stopped the answer" });
    expect(await at(answer("Sure! Here is my view: it is tight."))).toMatchObject({ out: null, why: "the answer was not JSON" });
    expect(await at(answer({ verdict: "maybe" }))).toMatchObject({ out: null, why: "the answer did not fit the shape asked for" });
    expect(await at({ status: 200, body: { choices: [] } })).toMatchObject({ out: null, why: "the endpoint answered without a choice", usage: { inputTokens: 0, outputTokens: 0 } });
    expect((await at(answer("```json\n" + JSON.stringify(RISK) + "\n```"))).out).toEqual(RISK);
    expect((await at(answer("Here you go: " + JSON.stringify(RISK) + " — done."))).out).toEqual(RISK);
    expect((await at(answer([{ type: "text", text: JSON.stringify(RISK).slice(0, 20) }, { type: "text", text: JSON.stringify(RISK).slice(20) }]))).out).toEqual(RISK);
    const usage = (await at(answer(RISK, { usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 900 } } }))).usage;
    expect(usage).toEqual({ inputTokens: 1000, outputTokens: 50 });
    // no model named anywhere (the file's, the form's): the file's model is the example, and no request goes out
    const ep = endpoint([answer(RISK)]);
    expect(await ask(openaiBrain({ home: homeWith(OPENAI), env, fetch: ep.fetch }), cfg(""))).toMatchObject({ out: null, why: expect.stringMatching(/^the key file's model is the example/) });
    expect(ep.calls).toHaveLength(0);
    // the environment with no model and a form that names none: no model is named
    const epEnv = endpoint([answer(RISK)]);
    expect(await ask(openaiBrain({ home: homeWith(), env: { OPENAI_API_KEY: KEY } as NodeJS.ProcessEnv, fetch: epEnv.fetch }), cfg(""))).toMatchObject({ out: null, why: expect.stringMatching(/^no model is named/) });
    expect(epEnv.calls).toHaveLength(0);
    // the file's model stands in for a blank one on the form
    const ep2 = endpoint([answer(RISK)]);
    expect((await ask(openaiBrain({ home: homeWith(ELSEWHERE), env, fetch: ep2.fetch }), cfg(""))).out).toEqual(RISK);
    expect(ep2.calls[0]!.body.model).toBe("house-model-1");
    // no key: no request either
    const ep3 = endpoint([answer(RISK)]);
    expect(await ask(openaiBrain({ home: homeWith(), env, fetch: ep3.fetch }))).toMatchObject({ out: null, why: expect.stringMatching(/^no key/) });
    expect(ep3.calls).toHaveLength(0);
  });

  it("the shape as a JSON schema: strict when every property is required, bounds dropped (the zod shape checks them), nothing of zod's own", () => {
    for (const s of Object.values(DECISIONS)) {
      const { schema, strict } = jsonSchemaOf(s);
      expect(strict).toBe(true);
      expect(schema.$schema).toBeUndefined();
      expect(schema.additionalProperties).toBe(false);
      // a default the zod shape fills (the Head's rule) is not asked of the endpoint
      expect(JSON.stringify(schema)).not.toContain('"default"');
    }
    const loose = jsonSchemaOf(z.object({ a: z.string().optional(), n: z.number().min(0).max(1), list: z.array(z.string()).min(1) }));
    expect(loose.strict).toBe(false);
    expect(JSON.stringify(loose.schema)).not.toMatch(/minimum|maximum|minItems/);
    expect(jsonIn('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(jsonIn('text {"a": {"b": 2}} more')).toEqual({ a: { b: 2 } });
    expect(jsonIn("nothing here")).toBeUndefined();
  });
});

describe("one brain per preset, each with its own key file — the older file still read", () => {
  it("the owner's key in the older credentials/openai/api-key.json keeps working untouched; the new file, once there, is the one read — even when it is the one that is wrong", () => {
    // only the older file: read as it is, said so, and the page is told where the key in use comes from — never the key, only its tail
    const older = homeFiles({ [OPENAI_KEY_REF]: JSON.stringify({ apiKey: KEY, model: "gpt-6-luna" }) });
    const b = openaiBrain({ home: older, env });
    expect(b.ready()).toEqual({ ok: true, model: "gpt-6-luna", how: "the key file credentials/openai/api-key.json · api.openai.com" });
    const about = b.about!();
    expect(about).toMatchObject({ kind: "model-api", format: "openai", baseUrl: "https://api.openai.com/v1", keyFile: "credentials/brains/openai.json", keyFrom: "older-file", tail: `…${KEY.slice(-4)}` });
    expect(JSON.stringify(about)).not.toContain(KEY);
    expect(JSON.stringify(about)).not.toContain(KEY.slice(0, -4));
    // the new file beside it wins: its key, its model
    const both = homeFiles({ [OPENAI_KEY_REF]: JSON.stringify({ apiKey: KEY, model: "gpt-6-luna" }), "credentials/brains/openai.json": JSON.stringify({ apiKey: "sk-test-the-newer-key-000000000000wxyz", model: "gpt-6.1-sol" }) });
    expect(openaiBrain({ home: both, env }).ready()).toEqual({ ok: true, model: "gpt-6.1-sol", how: "the key file credentials/brains/openai.json · api.openai.com" });
    expect(openaiBrain({ home: both, env }).about!()).toMatchObject({ keyFrom: "file", tail: "…wxyz" });
    // a new file that is wrong is said wrong — the older one is not read in its place
    const broken = homeFiles({ [OPENAI_KEY_REF]: JSON.stringify({ apiKey: KEY, model: "gpt-6-luna" }), "credentials/brains/openai.json": '{"apiKey": ""}' });
    expect(openaiBrain({ home: broken, env }).ready()).toMatchObject({ ok: false, fix: { code: "example", file: join(broken, "credentials", "brains", "openai.json") } });
    // the environment wins over both, and the page is told so
    const fromEnv = openaiBrain({ home: both, env: { OPENAI_API_KEY: KEY } as NodeJS.ProcessEnv });
    expect(fromEnv.ready("gpt-6-luna")).toMatchObject({ ok: true, how: "OPENAI_API_KEY in the service's environment · api.openai.com" });
    expect(fromEnv.about!()).toMatchObject({ envWins: "OPENAI_API_KEY", keyFrom: "env" });
    // another preset never reads OpenAI's variables or its older file
    const deepseekOnly = openaiBrain({ ...preset("deepseek"), home: older, env: { OPENAI_API_KEY: KEY } as NodeJS.ProcessEnv });
    expect(deepseekOnly.ready("deepseek-flash")).toMatchObject({ ok: false, fix: { code: "no-key", file: join(older, "credentials", "brains", "deepseek.json") } });
    expect(deepseekOnly.about!()).toMatchObject({ keyFrom: "none", baseUrl: "https://api.deepseek.com" });
    expect(deepseekOnly.about!().envWins).toBeUndefined();
  });

  it("a key goes over plain http only to this machine: https anywhere, http to localhost, 127.x and ::1 — never to another host, from the file or the environment; a base URL carries no password", () => {
    expect(parseBaseUrl("http://localhost:11434/v1")).toEqual({ ok: true, url: "http://localhost:11434/v1" });
    expect(parseBaseUrl("http://127.0.0.1:8000/v1/")).toEqual({ ok: true, url: "http://127.0.0.1:8000/v1" });
    expect(parseBaseUrl("http://[::1]:8000/v1")).toEqual({ ok: true, url: "http://[::1]:8000/v1" });
    expect(parseBaseUrl("https://api.x.ai/v1")).toEqual({ ok: true, url: "https://api.x.ai/v1" });
    for (const remote of ["http://api.example.com/v1", "http://192.168.1.20:11434/v1", "http://0.0.0.0:8000/v1", "http://localhost.example.com/v1"]) expect(parseBaseUrl(remote), remote).toMatchObject({ ok: false, why: expect.stringMatching(/^is plain http to .*: the key would cross the network in the clear/) });
    expect(parseBaseUrl("https://user:pass@api.example.com/v1")).toMatchObject({ ok: false, why: expect.stringMatching(/carries a user name or a password/) });
    expect(parseBaseUrl("https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1")).toMatchObject({ ok: false, why: expect.stringMatching(/^is the provider's pattern, not a URL/) });
    // in the key file: refused with the fix that opens it again, and no request goes out
    const plainHttp = homeWith(JSON.stringify({ apiKey: KEY, baseUrl: "http://api.example.com/v1", model: "m" }));
    expect(openaiReach({ home: plainHttp, env })).toMatchObject({ ok: false, why: expect.stringMatching(/^"baseUrl" in .* is plain http to api\.example\.com/), fix: { code: "unusable" } });
    // in the environment: refused the same, a restart
    expect(openaiReach({ home: homeWith(), env: { OPENAI_API_KEY: KEY, OPENAI_BASE_URL: "http://api.example.com/v1", OPENAI_MODEL: "m" } as NodeJS.ProcessEnv })).toMatchObject({ ok: false, why: expect.stringMatching(/^OPENAI_BASE_URL in the service's environment is plain http/), fix: { code: "env", restart: true } });
    // a local server: its own preset, http to this machine, the key ignored — no file needed: its default address, ready once a model is
    // named (the form's); without one it says it needs a model's name, and that a file is only for another address or a model of its own
    const ollama = preset("ollama");
    const noFile = openaiBrain({ ...ollama, home: homeWith(), env });
    expect(noFile.ready("qwen3:8b")).toEqual({ ok: true, model: "qwen3:8b", how: "its default address, no key file (a server on this machine needs no key) · localhost:11434" });
    expect(noFile.ready()).toMatchObject({ ok: false, why: expect.stringMatching(/^Ollama needs a model's name: name one your server serves when you choose it as the desk's brain \(Use this brain\) — it is reached at http:\/\/localhost:11434\/v1 with no key, and needs no file/), fix: { code: "no-key" } });
    expect(noFile.about!()).toMatchObject({ kind: "local", keyOptional: true, baseUrl: "http://localhost:11434/v1", keyFrom: "none" });
    const local = homeFiles({ "credentials/brains/ollama.json": JSON.stringify({ apiKey: "", baseUrl: "http://localhost:11434/v1", model: "qwen3:8b" }) });
    expect(openaiBrain({ ...ollama, home: local, env }).ready()).toEqual({ ok: true, model: "qwen3:8b", how: "the key file credentials/brains/ollama.json (no key: a local server) · localhost:11434" });
    expect(openaiBrain({ ...ollama, home: local, env }).about!()).toMatchObject({ kind: "local", keyOptional: true, baseUrl: "http://localhost:11434/v1", keyFrom: "file" });
    // a base the owner must name (Qwen, a custom endpoint): an empty one is the example, said so
    const qwen = homeFiles({ "credentials/brains/qwen.json": JSON.stringify({ apiKey: KEY, baseUrl: "", model: "qwen3.8-max" }) });
    expect(openaiBrain({ ...preset("qwen"), home: qwen, env }).ready()).toMatchObject({ ok: false, why: expect.stringMatching(/"baseUrl" in .* is empty: name the endpoint's base URL/), fix: { code: "example" } });
    expect(openaiBrain({ ...preset("qwen"), home: qwen, env }).about!()).toMatchObject({ baseUrl: "", baseRequired: true, baseHint: "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1" });
  });

  it("a local server's key-less call carries no Authorization; a key goes only to the base URL the brain would call", async () => {
    const local = homeFiles({ "credentials/brains/vllm.json": JSON.stringify({ baseUrl: "http://127.0.0.1:8000/v1", model: "served-model" }) });
    const ep = endpoint([answer(RISK)]);
    const a = await ask(openaiBrain({ ...preset("vllm"), home: local, env, fetch: ep.fetch }), cfg(""));
    expect(a.out).toEqual(RISK);
    expect(ep.calls[0]!.url).toBe("http://127.0.0.1:8000/v1/chat/completions");
    expect(ep.calls[0]!.headers.authorization).toBeUndefined();
  });

  it("a local server with NO file at all: the desk that names a model thinks with it at the preset's default address, no key sent; Test the key asks that address for its models", async () => {
    const empty = homeWith();
    const ep = endpoint([answer(RISK)]);
    const vllm = openaiBrain({ ...preset("vllm"), home: empty, env, fetch: ep.fetch });
    expect((await ask(vllm, cfg("served-model"))).out).toEqual(RISK);
    expect(ep.calls).toHaveLength(1);
    expect(ep.calls[0]!.url).toBe("http://localhost:8000/v1/chat/completions");
    expect(ep.calls[0]!.headers.authorization).toBeUndefined();
    expect(ep.calls[0]!.body.model).toBe("served-model");
    // no model named anywhere: no decision, nothing sent
    const none = endpoint([answer(RISK)]);
    expect((await ask(openaiBrain({ ...preset("ollama"), home: empty, env, fetch: none.fetch }), cfg(""))).out).toBeNull();
    expect(none.calls).toHaveLength(0);
    // Test: the list of models at the default address, no key
    const listed = endpoint([{ status: 200, body: { data: [{ id: "qwen3:8b" }] } }]);
    const f = (async (url: string | URL | Request, init?: RequestInit) => listed.fetch(url, { ...init, body: "{}" })) as typeof fetch;
    expect(await openaiBrain({ ...preset("ollama"), home: empty, env, fetch: f }).test!("qwen3:8b")).toEqual({ ok: true, provider: "ollama", status: 200, words: "localhost:11434 answered (no key sent: a local server) and lists 1 model; qwen3:8b is among them.", models: ["qwen3:8b"] });
    expect(listed.calls[0]!.url).toBe("http://localhost:11434/v1/models");
    expect(listed.calls[0]!.headers.authorization).toBeUndefined();
    // a preset that needs a key is NOT ready with no file, model named or not
    expect(openaiBrain({ ...preset("deepseek"), home: empty, env }).ready("deepseek-flash")).toMatchObject({ ok: false, fix: { code: "no-key" } });
  });
});

describe("a key where a key does not go", () => {
  // made up, in the shapes the providers' keys take: none of them is anyone's key
  const GROQ = `gsk_TESTnotArealKey${"0123456789abcdefABCDEF".repeat(2)}`;
  const DEEPSEEK_KEY = `sk-${"0123456789abcdef".repeat(2)}`;
  const GEMINI = "AIzaTESTnotArealKey0123456789abcdefgh";
  const SHAPES = [GROQ, DEEPSEEK_KEY, GEMINI, `sk-or-v1-${"fedcba9876543210".repeat(4)}`, `xai-TESTnotArealKey${"0123456789ABCDEFabcdef".repeat(3)}`];
  const holds = (x: unknown, k: string) => JSON.stringify(x).includes(k) || JSON.stringify(x).includes(k.slice(6, 20));

  it("a model's name that looks like an API key — on the form, in the key file, in OPENAI_MODEL — is refused in words that never repeat it, and nothing is sent", async () => {
    for (const k of SHAPES) {
      const home = homeFiles({ "credentials/brains/deepseek.json": JSON.stringify({ apiKey: KEY, model: "deepseek-flash" }) });
      const ep = endpoint([answer(RISK)]);
      const b = openaiBrain({ ...preset("deepseek"), home, env, fetch: ep.fetch });
      // the form's model
      const st = b.ready(k);
      expect(st, k).toMatchObject({ ok: false, why: expect.stringMatching(/^the model named for DeepSeek looks like an API key, not a model's name: it is not repeated here/) });
      expect(holds(st, k), k).toBe(false);
      const a = await ask(b, { provider: "deepseek", model: k, effort: "low" });
      expect(a.out, k).toBeNull();
      expect(holds(a, k), k).toBe(false);
      // the key file's model
      const inFile = homeFiles({ "credentials/brains/deepseek.json": JSON.stringify({ apiKey: KEY, model: k }) });
      const fileSt = openaiBrain({ ...preset("deepseek"), home: inFile, env, fetch: ep.fetch }).ready();
      expect(fileSt, k).toMatchObject({ ok: false, why: expect.stringMatching(/^"model" in .*deepseek\.json looks like an API key/), fix: { code: "unusable" } });
      expect(holds(fileSt, k), k).toBe(false);
      // the environment's model
      const envSt = openaiReach({ home: homeWith(), env: { OPENAI_API_KEY: KEY, OPENAI_MODEL: k } as NodeJS.ProcessEnv });
      expect(envSt, k).toMatchObject({ ok: false, why: expect.stringMatching(/^OPENAI_MODEL in the service's environment looks like an API key/), fix: { code: "env", restart: true } });
      expect(holds(envSt, k), k).toBe(false);
      // Test the key with it as the model: refused before anything is asked
      const t = await b.test!(k);
      expect(t, k).toMatchObject({ ok: false, provider: "deepseek" });
      expect(holds(t, k), k).toBe(false);
      expect(ep.calls, k).toHaveLength(0);
    }
    // real model ids are still model ids
    for (const m of ["deepseek-flash", "deepseek-ai/DeepSeek-V4-Pro-0813", "NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO", "qwen3:8b", "meta/muse-spark-1.3"]) expect(openaiReach({ ...preset("deepseek"), home: homeFiles({ "credentials/brains/deepseek.json": JSON.stringify({ apiKey: KEY }) }), env }, m), m).toMatchObject({ ok: true, model: m });
  });

  it("a base URL whose path holds a key, or a key typed in place of the URL, is refused without being said back", () => {
    for (const k of SHAPES) {
      const inPath = parseBaseUrl(`https://api.example.com/v1/${k}`);
      expect(inPath, k).toMatchObject({ ok: false, why: expect.stringMatching(/^has a path that looks like an API key: it is not repeated here/) });
      expect(holds(inPath, k), k).toBe(false);
      const asUrl = parseBaseUrl(k);
      expect(asUrl, k).toMatchObject({ ok: false, why: expect.stringMatching(/^is not a URL, and looks like an API key: it is not repeated here/) });
      expect(holds(asUrl, k), k).toBe(false);
      // in the key file, for a provider whose base the owner names
      const custom = homeFiles({ "credentials/brains/custom.json": JSON.stringify({ apiKey: KEY, baseUrl: `https://llm.example.com/${k}/v1`, model: "house-model-1" }) });
      const st = openaiBrain({ ...preset("custom"), home: custom, env }).ready();
      expect(st, k).toMatchObject({ ok: false, why: expect.stringMatching(/^"baseUrl" in .* has a path that looks like an API key/) });
      expect(holds(st, k), k).toBe(false);
      expect(holds(openaiBrain({ ...preset("custom"), home: custom, env }).about!(), k), k).toBe(false);
    }
    // a percent-encoded dash does not hide one
    expect(parseBaseUrl(`https://api.example.com/v1/${GROQ.replace("_", "%5F")}`)).toMatchObject({ ok: false });
    // a workspace's own long id in the HOST is not the path: Qwen's addresses stay taken
    expect(parseBaseUrl("https://ws-0a1b2c3d4e5f.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1")).toEqual({ ok: true, url: "https://ws-0a1b2c3d4e5f.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1" });
    // a value that is not a key is still said back, as before
    expect(parseBaseUrl("not a url")).toEqual({ ok: false, why: 'is not a URL ("not a url")' });
  });

  it("a key in the base URL's HOST — read as typed, label by label — is refused without being said back, from the file too, and nothing is sent; Cloudflare's account id in a path is an id", async () => {
    const MIXED = "AbCdEfGhIjKlMn12-shared-gateway-x";
    for (const k of [...SHAPES, MIXED]) {
      for (const u of [`https://${k}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`, `http://${k}.example.com/v1`, `https://${k}.example.com:8443/v1`]) {
        const r = parseBaseUrl(u);
        expect(r, u).toMatchObject({ ok: false, why: expect.stringMatching(/^has a host that looks like an API key: it is not repeated here/) });
        expect(holds(r, k), u).toBe(false);
        expect(JSON.stringify(r).toLowerCase(), u).not.toContain(k.toLowerCase().slice(0, 16));
      }
      // in the key file of a provider whose base the owner names: not ready, said without it, and no request leaves
      const ep = endpoint([answer(RISK)]);
      const home = homeFiles({ "credentials/brains/qwen.json": JSON.stringify({ apiKey: KEY, baseUrl: `https://${k}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`, model: "qwen3.8-max" }) });
      const b = openaiBrain({ ...preset("qwen"), home, env, fetch: ep.fetch });
      const st = b.ready();
      expect(st, k).toMatchObject({ ok: false, why: expect.stringMatching(/^"baseUrl" in .* has a host that looks like an API key/) });
      for (const x of [st, b.about!(), await b.test!(), await ask(b, { provider: "qwen", model: "qwen3.8-max", effort: "medium" })]) {
        expect(holds(x, k), k).toBe(false);
        expect(JSON.stringify(x).toLowerCase(), k).not.toContain(k.toLowerCase().slice(0, 16));
      }
      expect(ep.calls, k).toHaveLength(0);
    }
    // Cloudflare's OpenAI-compatible bases carry the 32-hex account id in the path: taken, and asked there
    const HEX32 = "5f0c3a9d2b7e4c1a8f6d0e3b9a2c7d41";
    for (const u of [`https://api.cloudflare.com/client/v4/accounts/${HEX32}/ai/v1`, `https://gateway.ai.cloudflare.com/v1/${HEX32}/my-gateway/openai`]) {
      expect(parseBaseUrl(u), u).toEqual({ ok: true, url: u });
      const ep = endpoint([answer(RISK)]);
      const b = openaiBrain({ ...preset("custom"), home: homeFiles({ "credentials/brains/custom.json": JSON.stringify({ apiKey: KEY, baseUrl: u, model: "house-model-1" }) }), env, fetch: ep.fetch });
      expect((await ask(b, { provider: "custom", model: "house-model-1", effort: "medium" })).out, u).toEqual(RISK);
      expect(ep.calls[0]?.url, u).toBe(`${u}/chat/completions`);
    }
    // the same 32 hex beside something else in a segment, or a longer hex run: still a key
    expect(parseBaseUrl(`https://llm.example.com/v1/fw_${HEX32}`)).toMatchObject({ ok: false });
    expect(parseBaseUrl(`https://llm.example.com/v1/${HEX32}${HEX32}`)).toMatchObject({ ok: false });
  });

  it("a refusal the endpoint writes in its answer is scrubbed of the key in use, and of every piece of it, before it reaches the room", async () => {
    // a custom endpoint (or a proxy) that echoes the bearer back in choices[0].message.refusal
    const LONG = "c0ffee11d00dfeed22bead33cafe44f00d55beef66deaf77face88babe99ace0";
    for (const key of [KEY, LONG, "Qz7xW3vK9pR2mT8lH4gF6dJ1sA5nB0cE"]) {
      const home = homeFiles({ "credentials/brains/custom.json": JSON.stringify({ apiKey: key, baseUrl: "https://llm.example.com/v1", model: "house-model-1" }) });
      for (const refusal of [`Incorrect API key provided: ${key}`, `Bearer ${key}`, `the key "${key}" is not allowed`, `key ${key.slice(5, 25)} refused`, `<html><body>${key.slice(-14)}</body></html>`, `${key.slice(0, 10)}****${key.slice(-4)}`]) {
        const ep = endpoint([answer("", { message: { content: null, refusal } })]);
        const b = openaiBrain({ ...preset("custom"), home, env, fetch: ep.fetch });
        const a = await ask(b, { provider: "custom", model: "house-model-1", effort: "medium" });
        expect(a.out).toBeNull();
        expect(a.why).toMatch(/^the model declined to answer: /);
        for (let i = 0; i + 8 <= key.length; i++) expect(a.why, `${refusal} → ${a.why}`).not.toContain(key.slice(i, i + 8));
      }
    }
    // a refusal with no key in it is said as it came
    const ep = endpoint([answer("", { message: { content: null, refusal: "I can't help with that request." } })]);
    const a = await ask(openaiBrain({ ...preset("custom"), home: homeFiles({ "credentials/brains/custom.json": JSON.stringify({ apiKey: KEY, baseUrl: "https://llm.example.com/v1", model: "house-model-1" }) }), env, fetch: ep.fetch }), { provider: "custom", model: "house-model-1", effort: "medium" });
    expect(a.why).toBe("the model declined to answer: I can't help with that request.");
  });
});

describe("an endpoint that redirects", () => {
  it("is not followed — not by a cycle's question, not by Test the key: the words say it redirected, and the address it points to receives nothing (two real servers on this machine)", async () => {
    const { createServer } = await import("node:http");
    const got: string[] = [];
    const b2 = createServer((req, res) => {
      got.push(`${req.method} ${req.url} ${req.headers.authorization ?? ""}`);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "m" }], choices: [{ message: { content: JSON.stringify(RISK) }, finish_reason: "stop" }] }));
    });
    await new Promise<void>((r) => b2.listen(0, "127.0.0.1", r));
    const portB = (b2.address() as { port: number }).port;
    const a1 = createServer((req, res) => res.writeHead(307, { location: `http://localhost:${portB}${req.url}` }).end());
    await new Promise<void>((r) => a1.listen(0, "127.0.0.1", r));
    const portA = (a1.address() as { port: number }).port;
    try {
      const home = homeFiles({ "credentials/brains/custom.json": JSON.stringify({ apiKey: KEY, baseUrl: `http://127.0.0.1:${portA}/v1`, model: "house-model-1" }) });
      const b = openaiBrain({ ...preset("custom"), home, env });
      await expect(ask(b, { provider: "custom", model: "", effort: "low" })).rejects.toThrow(`the endpoint 127.0.0.1:${portA} answered with a redirect, which the account does not follow (the question, and the key, go only to the base URL you named): name the address it redirects to as the base URL`);
      expect(await b.test!()).toEqual({ ok: false, provider: "custom", words: `the endpoint 127.0.0.1:${portA} answered with a redirect, which the account does not follow (the question, and the key, go only to the base URL you named): name the address it redirects to as the base URL` });
      expect(got).toEqual([]);
    } finally {
      a1.close();
      b2.close();
    }
  });

  it("a fetch that hands a 3xx back instead of refusing it is refused the same", async () => {
    const home = homeFiles({ "credentials/brains/xai.json": JSON.stringify({ apiKey: KEY, model: "grok-4.3" }) });
    const seen: Array<RequestInit | undefined> = [];
    const f = (async (_url: string | URL | Request, init?: RequestInit) => (seen.push(init), new Response(null, { status: 308, headers: { location: "http://elsewhere.example.com/v1/chat/completions" } }))) as typeof fetch;
    await expect(ask(openaiBrain({ ...preset("xai"), home, env, fetch: f }), { provider: "xai", model: "", effort: "low" })).rejects.toThrow(/^the endpoint api\.x\.ai answered with a redirect/);
    // and the request asked fetch to refuse redirects itself
    expect(seen[0]?.redirect).toBe("error");
  });
});

describe("Qwen in Singapore", () => {
  it("a workspace under ap-southeast-1 is asked in json_object mode from the first question (Alibaba: structured output not supported there yet); another region starts from json_schema", async () => {
    const at = (region: string) => homeFiles({ "credentials/brains/qwen.json": JSON.stringify({ apiKey: KEY, baseUrl: `https://ws-test.${region}.maas.aliyuncs.com/compatible-mode/v1`, model: "qwen3.8-max" }) });
    const sg = endpoint([answer(RISK)]);
    expect((await ask(openaiBrain({ ...preset("qwen"), home: at("ap-southeast-1"), env, fetch: sg.fetch }), cfg(""))).out).toEqual(RISK);
    expect(sg.calls[0]!.url).toBe("https://ws-test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(sg.calls[0]!.body.response_format).toEqual({ type: "json_object" });
    expect((sg.calls[0]!.body.messages as Array<{ content: string }>)[0]!.content).toMatch(/Reply in json/);
    const us = endpoint([answer(RISK)]);
    await ask(openaiBrain({ ...preset("qwen"), home: at("us-east-1"), env, fetch: us.fetch }), cfg(""));
    expect(us.calls[0]!.body.response_format).toMatchObject({ type: "json_schema" });
    // the preset says so, dated
    expect(preset("qwen").note).toMatch(/Alibaba's page \(2026-10-15\) says Singapore-region models do not support structured output yet/);
  });
});

describe("efforts the research does not name are not sent", () => {
  it("presets whose providers' docs name no effort send none (their own default applies); OpenAI, DeepSeek and Meta send what they take", async () => {
    for (const id of ["xai", "moonshot", "qwen", "openrouter", "gemini", "groq", "together", "ollama", "vllm", "custom"]) expect(preset(id).efforts, id).toEqual([]);
    expect(preset("openai").efforts).toEqual(["low", "medium", "high"]);
    expect(preset("deepseek").efforts).toEqual(["low", "high"]);
    expect(preset("meta").efforts).toEqual(["low", "medium", "high"]);
    const home = homeFiles({ "credentials/brains/xai.json": JSON.stringify({ apiKey: KEY, model: "grok-4.3" }) });
    const ep = endpoint([answer(RISK)]);
    await ask(openaiBrain({ ...preset("xai"), home, env, fetch: ep.fetch }), cfg("", "high"));
    expect(ep.calls[0]!.body.reasoning_effort).toBeUndefined();
    expect(openaiBrain({ ...preset("xai"), home, env }).about!().efforts).toEqual([]);
  });
});

describe("the presets' quirks", () => {
  it("DeepSeek: json_object from the first ask (it takes no json_schema), the word json in the prompt, room to think, an effort it does not take left out; an empty answer or one that does not fit is asked once more, its tokens counted with the first's", async () => {
    const home = homeFiles({ "credentials/brains/deepseek.json": JSON.stringify({ apiKey: KEY, model: "deepseek-flash" }) });
    const ep = endpoint([answer("", { usage: { prompt_tokens: 100, completion_tokens: 0 } }), answer(RISK, { usage: { prompt_tokens: 100, completion_tokens: 30 } })]);
    const b = openaiBrain({ ...preset("deepseek"), home, env, fetch: ep.fetch });
    const a = await ask(b, cfg(""));
    expect(a).toEqual({ out: RISK, usage: { inputTokens: 200, outputTokens: 30 } });
    expect(ep.calls).toHaveLength(2);
    const c = ep.calls[0]!;
    expect(c.url).toBe("https://api.deepseek.com/chat/completions");
    expect(c.body.response_format).toEqual({ type: "json_object" });
    expect(c.body.max_tokens).toBe(512 + 8192);
    // DeepSeek's effort is low or high: the desk's "medium" is not sent, its own default applies
    expect(c.body.reasoning_effort).toBeUndefined();
    const sys = (c.body.messages as Array<{ content: string }>)[0]!.content;
    expect(sys).toMatch(/\bjson\b/);
    expect(sys).toMatch(/Reply in json: that one object, no prose around it\.$/);
    // "high" it takes
    const ep2 = endpoint([answer(RISK)]);
    await ask(openaiBrain({ ...preset("deepseek"), home, env, fetch: ep2.fetch }), cfg("", "high"));
    expect(ep2.calls[0]!.body.reasoning_effort).toBe("high");
    // asked once more, never twice: the second answer that does not fit is "no decision", both calls' tokens counted
    const ep3 = endpoint([answer({ verdict: "maybe" }), answer("not json at all")]);
    expect(await ask(openaiBrain({ ...preset("deepseek"), home, env, fetch: ep3.fetch }), cfg(""))).toEqual({ out: null, why: "the answer was not JSON", usage: { inputTokens: 240, outputTokens: 60 } });
    expect(ep3.calls).toHaveLength(2);
    // a cut-off answer is not asked again: more of the same would be cut off too
    const ep4 = endpoint([answer("", { finish: "length" })]);
    expect((await ask(openaiBrain({ ...preset("deepseek"), home, env, fetch: ep4.fetch }), cfg(""))).why).toBe("the answer ran past its token limit");
    expect(ep4.calls).toHaveLength(1);
    // the older "openai" file pointed at DeepSeek's host gets DeepSeek's ways too
    const ep5 = endpoint([answer(RISK)]);
    await ask(openaiBrain({ home: homeWith(DEEPSEEK), env, fetch: ep5.fetch }));
    expect(ep5.calls[0]!.body.response_format).toEqual({ type: "json_object" });
  });

  it("Meta's Muse: never an effort of \"none\" (a 400 there), the effort it takes sent, room to think even when a 400 turned the effort off; json_schema strict", async () => {
    const home = homeFiles({ "credentials/brains/meta.json": JSON.stringify({ apiKey: KEY, model: "muse-spark-1.3" }) });
    const ep = endpoint([answer(RISK)]);
    await ask(openaiBrain({ ...preset("meta"), home, env, fetch: ep.fetch }), cfg("", "low"));
    expect(ep.calls[0]!.url).toBe("https://api.meta.ai/v1/chat/completions");
    expect(ep.calls[0]!.body).toMatchObject({ model: "muse-spark-1.3", reasoning_effort: "low", max_tokens: 512 + 8192, response_format: { type: "json_schema", json_schema: { strict: true } } });
    // an effort of "none" (no form offers it; a desk file could carry anything) is never sent there
    const ep2 = endpoint([answer(RISK)]);
    await ask(openaiBrain({ ...preset("meta"), efforts: ["low", "medium", "high", "none" as BrainConfig["effort"]], home, env, fetch: ep2.fetch }), cfg("", "none" as BrainConfig["effort"]));
    expect(ep2.calls[0]!.body.reasoning_effort).toBeUndefined();
    // a 400 that names the effort turns the field off — left out, never "none" — and the room to think stays
    const ep3 = endpoint([err(400, "reasoning_effort is not supported for this model"), answer(RISK)]);
    expect((await ask(openaiBrain({ ...preset("meta"), home, env, fetch: ep3.fetch }), cfg(""))).out).toEqual(RISK);
    expect(ep3.calls[1]!.body.reasoning_effort).toBeUndefined();
    expect(ep3.calls[1]!.body.max_tokens).toBe(512 + 8192);
    for (const c of [...ep.calls, ...ep2.calls, ...ep3.calls]) expect(c.body.reasoning_effort).not.toBe("none");
  });

  it("xAI and OpenAI: chat completions with a strict json_schema, no tools sent", async () => {
    const home = homeFiles({ "credentials/brains/xai.json": JSON.stringify({ apiKey: KEY, model: "grok-4.3" }), "credentials/brains/openai.json": JSON.stringify({ apiKey: KEY, model: "gpt-6-luna" }) });
    for (const [id, url, limit] of [["xai", "https://api.x.ai/v1/chat/completions", "max_tokens"], ["openai", "https://api.openai.com/v1/chat/completions", "max_completion_tokens"]] as const) {
      const ep = endpoint([answer(RISK)]);
      expect((await ask(openaiBrain({ ...preset(id), home, env, fetch: ep.fetch }), cfg(""))).out).toEqual(RISK);
      expect(ep.calls[0]!.url).toBe(url);
      expect(ep.calls[0]!.body[limit]).toBe(512 + 8192);
      expect(ep.calls[0]!.body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
      expect(ep.calls[0]!.body.tools).toBeUndefined();
    }
  });
});

describe("Test the key", () => {
  it("one GET of the base URL's list of models, with the key as a bearer and nothing billed: taken with the models it lists and whether the model is among them; refused in the endpoint's words, scrubbed; a wrong path, a server error, no network — and no key, no request", async () => {
    const home = homeFiles({ "credentials/brains/deepseek.json": JSON.stringify({ apiKey: KEY, model: "deepseek-flash" }) });
    const list = { status: 200, body: { object: "list", data: [{ id: "deepseek-flash", object: "model" }, { id: "deepseek-v4-pro", object: "model" }, { id: "<b>not a model</b>" }] } };
    const tester = (answers: Array<{ status: number; body: unknown }>, o: { throws?: Error } = {}) => {
      const ep = endpoint(answers, o);
      // a GET has no body: the stand-in endpoint records it as {}
      const f = (async (url: string | URL | Request, init?: RequestInit) => ep.fetch(url, { ...init, body: init?.body ?? "{}" })) as typeof fetch;
      return { ep, b: openaiBrain({ ...preset("deepseek"), home, env, fetch: f }) };
    };
    const ok = tester([list]);
    const r = await ok.b.test!();
    expect(r).toEqual({ ok: true, provider: "deepseek", status: 200, words: "api.deepseek.com accepted the key and lists 2 models; deepseek-flash is among them.", models: ["deepseek-flash", "deepseek-v4-pro"] });
    expect(ok.ep.calls).toHaveLength(1);
    expect(ok.ep.calls[0]!.url).toBe("https://api.deepseek.com/models");
    expect(ok.ep.calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    // the model the owner means, not listed
    expect((await tester([list]).b.test!("deepseek-chat")).words).toBe('api.deepseek.com accepted the key and lists 2 models; "deepseek-chat" is not among them — check the model\'s name.');
    // refused: the endpoint's own words, with the key it echoed masked
    const refused = await tester([err(401, `Authentication Fails, Your api key: ${KEY} is invalid`)]).b.test!();
    expect(refused).toEqual({ ok: false, provider: "deepseek", status: 401, words: "api.deepseek.com did not accept the key: Authentication Fails, Your api key: … is invalid" });
    expect(JSON.stringify(refused)).not.toContain(KEY);
    expect((await tester([err(404, "Not Found")]).b.test!()).words).toMatch(/^nothing answers at api\.deepseek\.com\/models: the base URL's path may be wrong/);
    expect(await tester([err(503, "overloaded")]).b.test!()).toMatchObject({ ok: false, status: 503, words: "api.deepseek.com answered 503: overloaded" });
    expect(await tester([], { throws: Object.assign(new Error("fetch failed"), { name: "TypeError" }) }).b.test!()).toEqual({ ok: false, provider: "deepseek", words: "the endpoint api.deepseek.com could not be reached" });
    // no key: nothing is sent anywhere, the fix said
    const ep = endpoint([list]);
    const none = await openaiBrain({ ...preset("deepseek"), home: homeWith(), env, fetch: ep.fetch }).test!();
    expect(none).toMatchObject({ ok: false, provider: "deepseek", words: expect.stringMatching(/^no key: /), fix: { code: "no-key" } });
    expect(ep.calls).toHaveLength(0);
    // the key file names no model: the key is still tested (the list needs none)
    const noModel = homeFiles({ "credentials/brains/deepseek.json": JSON.stringify({ apiKey: KEY }) });
    const ep2 = endpoint([list]);
    const f2 = (async (url: string | URL | Request, init?: RequestInit) => ep2.fetch(url, { ...init, body: "{}" })) as typeof fetch;
    expect(await openaiBrain({ ...preset("deepseek"), home: noModel, env, fetch: f2 }).test!()).toMatchObject({ ok: true, words: "api.deepseek.com accepted the key and lists 2 models." });
  });
});
