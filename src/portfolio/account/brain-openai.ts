/** AN OPENAI-FORMAT BRAIN: any endpoint that speaks OpenAI's chat-completions format — OpenAI itself, DeepSeek, xAI's Grok models, Meta's
 * Muse models, Moonshot's Kimi, Qwen, OpenRouter, Gemini's compatibility layer, Groq, Together, an Ollama or a vLLM on this machine, an
 * endpoint the owner names — asked the one structured question at a time the desk asks (desk.ts), the same as the Claude brain
 * (brain-claude.ts). ONE BRAIN PER PRESET (brains.ts makes them all at once, so several can hold a key at the same time and the desk's
 * hired one is the one asked): a preset says who the provider is (its id and label), where it is reached by default (its base URL, or
 * none where the owner must name one — Qwen's per-workspace URL, a custom endpoint), the models to suggest (from the provider's own page,
 * dated: suggestions, never the whole list), the efforts it takes, and its quirks.
 *
 * The owner says where and with what: the preset's key file <home>/credentials/brains/<id>.json — {"apiKey", "baseUrl", "model"},
 * readable by the user alone, read again at every check, so a key put there needs no restart — written by hand from the fix's command or
 * by the page's key field; for the "openai" preset, the older credentials/openai/api-key.json is still read while the new file is not
 * there, so a key the owner put there before keeps working untouched; and, for an account started by hand, OPENAI_API_KEY (with
 * OPENAI_BASE_URL and OPENAI_MODEL) in the service's environment, which wins over both files for the "openai" preset alone. The model on the
 * hire form wins over the file's, and one of the two must name a model as the endpoint names it — an empty one, or the old how-to's
 * "<the model, as the endpoint names it>", is the example and is refused as such; the price is the owner's number on the form (the
 * suggestions may carry the price the provider's page gave on the day it was read, said with that day). A LOCAL SERVER (Ollama, vLLM:
 * keyOptional) ignores the key and needs no file at all: with none, it is reached at its default address (http://localhost:11434/v1,
 * http://localhost:8000/v1) with no key, and is ready as soon as a model is named — on the form that chooses it as the desk's brain, or in
 * the file. The file is there only for another address, a model of its own, or a key the server was started with.
 *
 * A base URL is https, or http only to this machine's own loopback (localhost, 127.x, ::1): the key goes as a bearer, and over plain http
 * to any other host it would cross the network in the clear. A base URL whose path, or a model's name, looks like an API key (keyShaped,
 * brain-key.ts: a key pasted into the wrong field) is refused in words that never repeat it — never sent as a request's model to some
 * provider, never shown on the page or written in the room. And an endpoint that answers with a redirect is not followed (fetch's
 * redirect "error"): the question, the portfolio in it and the key go to the base URL the owner named and nowhere else — a 307 would carry
 * the body on to any address, plain http to another host included — so the brain says, in plain words, that the endpoint redirected and
 * that the address it points to is the one to name. Not ready, the brain says what would make it so the way the Claude brain does
 * (BrainFix, brain-key.ts), and a key the endpoint refuses (401, 403) is thrown as E_BRAIN_KEY_REJECTED with its fix, which the desk keeps
 * as the brain's standing until a call is answered again.
 *
 * Endpoints differ in what they take: OpenAI's own wants max_completion_tokens and takes reasoning_effort and a JSON schema; many others
 * know only max_tokens, or json_object. The brain starts from what the preset and the base URL's host say (DeepSeek takes json_object
 * only, and its JSON mode wants the word "json" in the prompt; Meta's Muse Spark always reasons and answers 400 to an effort of "none",
 * which is never sent there; a Qwen workspace in Singapore — a host under ap-southeast-1.maas.aliyuncs.com — where Alibaba's page says
 * structured output is "not supported yet" for that region's models (2026-10-15), is asked in json_object mode from the first question)
 * and, when the endpoint answers 400, changes the field the answer names (unnamed: the next untried one) and asks again — three tries at
 * most, nothing billed for a refused request, and the dialect that worked is kept for the next question. An
 * effort the provider does not take is not sent: its own default applies. The answer is checked against the role's shape (zod). In
 * json_object mode nothing holds the answer to the shape, so an answer that comes back empty (DeepSeek's JSON mode "may occasionally
 * return empty content"), not JSON or not the shape is asked once more — once, its tokens counted with the first's. A cut-off answer, a
 * content filter, a refusal or JSON that still does not fit is "no decision", said so. A key the endpoint rejects, an out balance, a rate
 * limit, a model it does not serve or an endpoint that cannot be reached is an error the desk writes in its room — the endpoint's own
 * words, never the key.
 *
 * "Test the key" (test): GET <base>/models, the one call every one of these endpoints answers without billing a token — the key taken or
 * refused in the endpoint's own words (scrubbed), the models it lists (for the owner's model field), and whether the model the owner means
 * is among them. Nothing is sent anywhere but the base URL the brain would call.
 *
 * "Connect a key" (probe, asked by brain-detect.ts): the same GET <base>/models, with a key the owner PASTED and has not saved, at the
 * preset's own address — never the key file's or the environment's, which may point anywhere: a pasted key goes only to the provider it
 * was recognised as. A model API's alone (a local server, a custom endpoint and Qwen's per-workspace address have none of their own). Where
 * the list is public (OpenRouter's), or a key may be taken and still call no model (xAI's, until its access list allows one), the preset's
 * keyCheck is asked first. A refusal is a 401 or a 403 — or a 400 that says it is about the key, as xAI's and Gemini's layer answer one. A
 * redirect is not followed here either; a list is read in either shape (Together's is a bare array); a model id is kept only when it
 * looks like one and holds no piece of the key.
 */
import { z } from "zod";
import { isRefusal } from "../../core/errors.ts";
import { loadKeyFile, type KeyShape } from "../live/credentials.ts";
import { baseUrlKeyShaped, brainKeyRef, emptyField, envFix, exampleFix, fileProblem, holdsPieceOf, hostKeyShaped, hostSaid, isLoopback, keyFileAt, keyRejected, keyShaped, keyTail, noKeyFix, pathKeyShaped, present, rejectedFix, scrubbed, unusableFix } from "./brain-key.ts";
import { MODEL_ID, type Brain, type BrainAbout, type BrainAnswer, type BrainConfig, type BrainFix, type BrainProbe, type BrainRequest, type BrainStatus, type BrainSuggestions, type BrainTest } from "./desk.ts";

/** the older key file of the "openai" preset, read while credentials/brains/openai.json is not there */
export const OPENAI_KEY_REF = "credentials/openai/api-key.json";
/** the file's empty template: the key and the model go between their quotes, the base URL is OpenAI's until changed. It is what the
 * make-the-file command writes, and the readiness check refuses it as the example until a key and a model are there */
export const OPENAI_KEY_TEMPLATE = '{"apiKey": "", "baseUrl": "https://api.openai.com/v1", "model": ""}';
export const OPENAI_KEY_SHAPE: KeyShape = { required: ["apiKey"], optional: ["baseUrl", "model"], example: OPENAI_KEY_TEMPLATE };
export const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
export const OPENAI_LABEL = "OpenAI API";
/** a reasoning model thinks inside the completion limit: this much room above the answer's own */
const REASONING_ROOM = 8192;
/** "Test the key" waits this long for the list of models, at most */
const TEST_TIMEOUT_MS = 15_000;
/** the most model ids "Connect a key" reads from one list (OpenRouter lists several hundred) */
export const PROBE_MODELS_MAX = 1000;
const EFFORTS: ReadonlyArray<BrainConfig["effort"]> = ["low", "medium", "high"];

/** How an endpoint differs from OpenAI's own, as its provider's docs say (brains.ts names them per preset; a base URL's host may bring its
 * own, HOST_QUIRKS, so a preset pointed at DeepSeek's or Meta's API behaves as theirs):
 *   json     the JSON asked for first: "schema" (json_schema, strict where every property is required) or "object" (json_object only)
 *   limit    the completion limit's field to start from
 *   reasons  the model thinks by default (DeepSeek: on unless turned off) or always (Meta's Muse Spark): room for it above the answer,
 *            whatever the effort field says
 *   noEffortNone  an effort of "none" is never sent (Meta's Muse Spark answers it with a 400) */
export interface OpenAIQuirks {
  json?: "schema" | "object" | undefined;
  limit?: "max_completion_tokens" | "max_tokens" | undefined;
  reasons?: boolean | undefined;
  noEffortNone?: boolean | undefined;
}

/** a host's own ways, whichever preset reaches it */
const HOST_QUIRKS: Record<string, OpenAIQuirks> = {
  "api.openai.com": { limit: "max_completion_tokens" },
  "api.deepseek.com": { json: "object", reasons: true },
  "api.meta.ai": { noEffortNone: true, reasons: true },
};
/** The ways of hosts named by a pattern rather than one name. A Qwen workspace's address carries its own id and region
 * (https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1): Alibaba's structured-output page says Singapore-region
 * models are "not supported yet" for structured output (read 2026-10-15), so a host in ap-southeast-1 is asked in json_object mode from
 * the first question — the answer checked against the shape, and asked once more when it does not fit — rather than learning it from a
 * 400. The US and Beijing regions take json_schema, and start from it as any host does */
const HOST_PATTERN_QUIRKS: ReadonlyArray<{ host: RegExp; quirks: OpenAIQuirks }> = [{ host: /\.ap-southeast-1\.maas\.aliyuncs\.com$/i, quirks: { json: "object" } }];
/** what a base URL's host is known to want: by its name, else by a pattern, else nothing */
const hostQuirks = (baseUrl: string): OpenAIQuirks => {
  let hostname = "";
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return {};
  }
  return HOST_QUIRKS[hostOf(baseUrl)] ?? HOST_PATTERN_QUIRKS.find((x) => x.host.test(hostname))?.quirks ?? {};
};

/** The words for a model's name that looks like an API key (keyShaped): what is wrong, where a key does go — never the value itself */
export const KEY_AS_MODEL = "looks like an API key, not a model's name: it is not repeated here, and it is never sent as a model — a key goes only in the Brains place's key field (or \"apiKey\" in the key file); name the model as the endpoint names it";
/** The words for an endpoint that answered with a redirect, which the brain does not follow */
const redirectWords = (host: string): string => `the endpoint ${host} answered with a redirect, which the account does not follow (the question, and the key, go only to the base URL you named): name the address it redirects to as the base URL`;

/** WHO AN OPENAI-FORMAT BRAIN IS (brains.ts holds the list): its id and label, what kind of place it is, where it is reached by default
 * ("" where the owner names it: `baseHint` shows the provider's own pattern), its key file and the older one still read, the environment
 * variables that stand in for the file (`envPrefix`: <P>_API_KEY, <P>_BASE_URL, <P>_MODEL — the "openai" preset's alone), whether a key is
 * needed at all (a local server ignores it), the models to suggest, the efforts it takes, its quirks, and its pages */
export interface OpenAIPreset {
  id: string;
  label: string;
  kind: "model-api" | "local" | "custom";
  defaultBase: string;
  baseHint?: string | undefined;
  keyRef: string;
  legacyKeyRef?: string | undefined;
  envPrefix?: string | undefined;
  keyOptional?: boolean | undefined;
  suggestedModels: BrainSuggestions;
  efforts: ReadonlyArray<BrainConfig["effort"]>;
  quirks: OpenAIQuirks;
  docs?: string | undefined;
  keyPage?: string | undefined;
  note?: string | undefined;
  /** "Connect a key" (brain-detect.ts): the models a pasted key is connected with, best first — the first one the provider lists for the
   * key is the one chosen. Read from the provider's own pages on the day brains.ts says (BEST_READ) */
  best?: ReadonlyArray<string> | undefined;
  /** the path that says whether a key is taken, asked before the list of models — for a provider whose list is PUBLIC (OpenRouter's answers
   * without a key, so a 200 there says nothing of one), or whose key may be taken and still call no model (xAI's, until its access list
   * allows one) — and what its answer may say against the key (`judge`): one that manages the account and runs no model ("manages"), or
   * one that is blocked or may call no model yet ("blocked"), in a phrase that follows "<provider> took the key, but …" */
  keyCheck?: { path: string; judge?: ((json: unknown) => { kind: "manages" | "blocked"; words: string } | undefined) | undefined } | undefined;
}

/** the ids of a list of models as an endpoint answers it — OpenAI's {object: "list", data: [{id}]}, or, as Together's does, the bare array
 * — each as the chat endpoint names it (Gemini's list may say "models/<id>", and is asked "<id>") */
export function listedIds(json: unknown): string[] {
  const data = Array.isArray(json) ? json : json && typeof json === "object" ? (json as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return [];
  return data.map((x) => (x && typeof x === "object" ? (x as { id?: unknown }).id : undefined)).filter((x): x is string => typeof x === "string").map((x) => x.replace(/^models\//, ""));
}
/** a 400 whose words are about the key ("Incorrect API key provided" — xAI; "Please pass a valid API key" — Gemini's layer): a refusal of
 * the key, as a 401 is elsewhere */
const keyWords400 = (status: number, message: string): boolean => status === 400 && /api[ _-]?key|credential|authenticat|unauthori/i.test(message);

/** OpenAI's own: what openaiBrain is when no preset is named (the brain this file always was), the base for the "openai" preset */
export const OPENAI_PRESET: OpenAIPreset = {
  id: "openai",
  label: OPENAI_LABEL,
  kind: "model-api",
  defaultBase: OPENAI_DEFAULT_BASE,
  keyRef: brainKeyRef("openai"),
  legacyKeyRef: OPENAI_KEY_REF,
  envPrefix: "OPENAI",
  suggestedModels: { models: [], source: "" },
  efforts: EFFORTS,
  quirks: {},
};

export interface OpenAIBrainOptions extends Partial<OpenAIPreset> {
  home: string;
  env?: NodeJS.ProcessEnv | undefined;
  /** fetch, for tests (and the stand-in, which reaches no network) */
  fetch?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
  /** the machine the commands in a fix are for (tests); this one's by default */
  platform?: NodeJS.Platform | undefined;
}

/** the preset these options name: OpenAI's own, changed where they say, when they name no other id; else only what they say — another
 * preset never inherits OpenAI's environment variables or its older key file */
export function presetOf(o: Partial<OpenAIPreset>): OpenAIPreset {
  const id = o.id ?? OPENAI_PRESET.id;
  const base: OpenAIPreset = id === OPENAI_PRESET.id ? OPENAI_PRESET : { id, label: id, kind: "custom", defaultBase: "", keyRef: brainKeyRef(id), suggestedModels: { models: [], source: "" }, efforts: EFFORTS, quirks: {} };
  const given = Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && k in PRESET_KEYS)) as Partial<OpenAIPreset>;
  return { ...base, ...given };
}
const PRESET_KEYS: Record<keyof OpenAIPreset, true> = { id: true, label: true, kind: true, defaultBase: true, baseHint: true, keyRef: true, legacyKeyRef: true, envPrefix: true, keyOptional: true, suggestedModels: true, efforts: true, quirks: true, docs: true, keyPage: true, note: true, best: true, keyCheck: true };

/** the key file's empty template for a preset: one line, the key and the model empty, the base URL the preset's own (empty where the owner
 * names it) */
export const templateOf = (p: OpenAIPreset): string => `{"apiKey": "", "baseUrl": "${p.defaultBase}", "model": ""}`;
const shapeOf = (p: OpenAIPreset): KeyShape => ({ required: p.keyOptional ? [] : ["apiKey"], optional: p.keyOptional ? ["apiKey", "baseUrl", "model"] : ["baseUrl", "model"], example: templateOf(p) });

export type OpenAIReach =
  | { ok: true; how: string; apiKey: string; baseUrl: string; model: string; fromEnv?: string | undefined; file: string; ref: string }
  | { ok: false; why: string; fix: BrainFix };

/** could be a key: not the example from the how-to, not a fragment — a local endpoint may take any word, so nothing more is assumed */
const looksLikeKey = (k: string): boolean => k.length >= 8 && !/[\s…<>]|\.\.\./.test(k);
/** a model's name as the how-to's example wrote it ("<the model, as the endpoint names it>", "…"): never a model an endpoint serves */
const exampleModel = (m: string): boolean => /[<>…]/.test(m);
const modelWords = (p: OpenAIPreset): string => {
  const ex = p.suggestedModels.models.slice(0, 2);
  return `the model's name as the endpoint names it${ex.length ? ` (${ex.join(", ")}…)` : ""}`;
};

/** A base URL the brain may send the key to: http(s), no query, no user name or password in it, plain http only to this machine's loopback
 * (localhost, 127.x, ::1), no host that looks like an API key (hostKeyShaped: the host AS TYPED, label by label, before URL lower-cases it —
 * a key pasted where Qwen's how-to puts the workspace id would otherwise go out in the DNS query and the TLS handshake, and be said back in
 * every "could not be reached"), and no path that looks like one (pathKeyShaped: a key pasted into the base URL's field, or put after its
 * /v1 — a segment of nothing but 32 to 39 hex characters, Cloudflare's account id, is an id and passes). That is the base-URL rule,
 * brain-key.ts baseUrlKeyShaped, which the route, the door and the page share. The URL without its trailing slash, or why not (a phrase
 * that follows "the base URL …"). What the owner typed is said back only when it does not look like a key: a value that does is described,
 * never repeated, and a host is named only when it does not look like one ("another address": hostSaid) — these words reach the page and
 * the room */
export function parseBaseUrl(s: string | undefined, fallback = ""): { ok: true; url: string } | { ok: false; why: string } {
  const raw = (s ?? "").trim() || fallback;
  if (!raw) return { ok: false, why: "is empty: name the endpoint's base URL (it ends /v1 for most)" };
  const shown = keyShaped(raw) || baseUrlKeyShaped(raw) ? "" : ` ("${raw.slice(0, 80)}")`;
  if (/[{}]/.test(raw)) return { ok: false, why: `is the provider's pattern, not a URL: put your own in place of the part in braces${shown}` };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, why: shown ? `is not a URL${shown}` : 'is not a URL, and looks like an API key: it is not repeated here — the key goes in "apiKey" (the Brains place\'s key field), and the base URL is the endpoint\'s address' };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, why: `is not an http(s) URL${shown}` };
  if (hostKeyShaped(raw)) return { ok: false, why: 'has a host that looks like an API key: it is not repeated here — the key goes in "apiKey" (the Brains place\'s key field), never in the address; the base URL is the endpoint\'s own address (it ends /v1 for most)' };
  if (u.protocol === "http:" && !isLoopback(u.hostname)) return { ok: false, why: `is plain http to ${hostSaid(raw)}: the key would cross the network in the clear — use https, or http only to this machine (localhost, 127.0.0.1, ::1)` };
  if (u.username || u.password) return { ok: false, why: 'carries a user name or a password: the key goes in "apiKey", the base URL holds none' };
  if (u.search || u.hash) return { ok: false, why: "is the endpoint's base (…/v1), without a query" };
  if (pathKeyShaped(u.pathname, u.hostname)) return { ok: false, why: `has a path that looks like an API key: it is not repeated here — the key goes in "apiKey" (the Brains place's key field), never in the address; the base URL is ${hostSaid(raw)}'s endpoint base (it ends /v1 for most)` };
  return { ok: true, url: u.toString().replace(/\/+$/, "") };
}
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** where the key is read from: the environment (the preset's own variable, "openai" only), else the new key file, else — only while the new
 * one is not there — the older one */
function sourceOf(o: OpenAIBrainOptions, p: OpenAIPreset): { from: "env"; envVar: string } | { from: "file" | "older-file" | "none"; ref: string } {
  const env = o.env ?? process.env;
  const envVar = p.envPrefix ? `${p.envPrefix}_API_KEY` : undefined;
  if (envVar && env[envVar]) return { from: "env", envVar };
  if (present(o.home, p.keyRef)) return { from: "file", ref: p.keyRef };
  if (p.legacyKeyRef && present(o.home, p.legacyKeyRef)) return { from: "older-file", ref: p.legacyKeyRef };
  return { from: "none", ref: p.keyRef };
}

/** How the brain would reach the endpoint now, without reaching it; when it cannot, why (a sentence) and the fix (brain-key.ts). `model`:
 * the model the hired desk names on its form, which wins over the file's — with it, the file's model may stay empty; without it, the file
 * must name one. `needModel` false: only the key and the base URL are asked for ("Test the key" lists the models without naming one).
 *
 * A model's name that looks like an API key (keyShaped) — on the form, in the file, in <P>_MODEL — is refused wherever it comes from, in
 * words that never repeat it: it would otherwise be sent as the request's model (to this provider, which is not where that key belongs),
 * said back in the provider's 404, and shown as the standing's model on the page and in the room.
 *
 * A local server (keyOptional: Ollama, vLLM) with no file is reached at the preset's default address with no key, and is ready once a
 * model is named (the form's); its file, when the owner writes one, is read as for any other provider */
export function openaiReach(o: OpenAIBrainOptions, model?: string, needModel = true): OpenAIReach {
  const p = presetOf(o);
  const env = o.env ?? process.env;
  const newFile = keyFileAt(o.home, p.keyRef);
  const named = (model ?? "").trim();
  if (named && keyShaped(named)) return { ok: false, why: `the model named for ${p.label} ${KEY_AS_MODEL}`, fix: { code: "example", file: newFile, restart: false, words: `The model named for ${p.label} ${KEY_AS_MODEL}. Choose the brain again (Brain…) with the model's name.` } };
  const formModel = named && !exampleModel(named) ? named : "";
  const MODEL_WORDS = modelWords(p);
  const src = sourceOf(o, p);
  if (src.from === "env") {
    const P = p.envPrefix!;
    const key = env[src.envVar] ?? "";
    const restart = (what: string) => envFix(newFile, `${what} Set it where the service is started and restart it — or remove ${src.envVar} and put the key in the file below instead, which needs no restart.`);
    if (!looksLikeKey(key)) return { ok: false, why: `${src.envVar} in the service's environment is the example or a fragment, not a key: set the key itself and restart the service`, fix: restart(`${src.envVar} in the service's environment holds an example, not a key.`) };
    const base = parseBaseUrl(env[`${P}_BASE_URL`], p.defaultBase);
    if (!base.ok) return { ok: false, why: `${P}_BASE_URL in the service's environment ${base.why}`, fix: restart(`${P}_BASE_URL in the service's environment ${base.why}.`) };
    const envModel = (env[`${P}_MODEL`] ?? "").trim();
    if (keyShaped(envModel)) return { ok: false, why: `${P}_MODEL in the service's environment ${KEY_AS_MODEL}`, fix: restart(`${P}_MODEL in the service's environment ${KEY_AS_MODEL}.`) };
    if (exampleModel(envModel)) return { ok: false, why: `${P}_MODEL in the service's environment is the example: name ${MODEL_WORDS}`, fix: restart(`${P}_MODEL in the service's environment is the example, not a model: name ${MODEL_WORDS}.`) };
    return { ok: true, how: `${src.envVar} in the service's environment · ${hostSaid(base.url)}`, apiKey: key, baseUrl: base.url, model: formModel || envModel, fromEnv: src.envVar, file: newFile, ref: p.keyRef };
  }
  const ref = src.ref;
  const file = keyFileAt(o.home, ref);
  const envNote = p.envPrefix ? ` (if you start the account by hand, ${p.envPrefix}_API_KEY with ${p.envPrefix}_BASE_URL and ${p.envPrefix}_MODEL in its environment works too)` : "";
  const fill = `${p.keyOptional ? `${p.label} ignores the key: leave "apiKey" empty, or put the one your server was started with. Put` : `Paste your ${p.label} key between the quotes of "apiKey" and put`} ${MODEL_WORDS} between the quotes of "model" in the file below${p.defaultBase ? `; change "baseUrl" if the endpoint is not ${hostOf(p.defaultBase)}` : `, and the endpoint's base URL in "baseUrl"${p.baseHint ? ` (${p.label}'s look like ${p.baseHint})` : ""}`}. Save: it is read at the next cycle, no restart.`;
  if (src.from === "none" && p.keyOptional) {
    // a server on this machine needs no file: its default address, no key — ready once a model is named
    const base = parseBaseUrl(undefined, p.defaultBase);
    if (base.ok) {
      if (needModel && !formModel)
        return { ok: false, why: `${p.label} needs a model's name: name one your server serves when you choose it as the desk's brain (Use this brain) — it is reached at ${base.url} with no key, and needs no file; a file (${file}) only for another address or a model of its own`, fix: noKeyFix(newFile, templateOf(p), `Name the model when you choose ${p.label} as the desk's brain — nothing else is needed. Or, for another address or a model of its own, run the command below: it makes the file, readable by you alone, and opens it. ${fill}`, o.platform) };
      return { ok: true, how: `its default address, no key file (a server on this machine needs no key) · ${hostSaid(base.url)}`, apiKey: "", baseUrl: base.url, model: formModel, file: newFile, ref: p.keyRef };
    }
  }
  if (src.from === "none")
    return { ok: false, why: p.keyOptional ? `not set up: the brain reads ${p.label}'s base URL and model from ${file}, which is not there yet; it is read again at every check, no restart needed` : `no key: the brain reads ${p.label}'s key from ${file}, which is not there yet; it is read again at every check, no restart needed${envNote}`, fix: noKeyFix(newFile, templateOf(p), `Run the command below: it makes the key file, readable by you alone, and opens it. ${fill}`, o.platform) };
  const read = loadKeyFile(o.home, ref, shapeOf(p), p.id);
  const isExample = `${file} holds the example, not a key: put your key between the quotes of "apiKey" — the file is read again at every check, no restart needed`;
  if (!isRefusal(read)) {
    const apiKey = read.apiKey ?? "";
    // a local server ignores the key: whatever the file holds there (nothing, "ollama"…) is sent as it is, to this machine only
    if (!p.keyOptional && !looksLikeKey(apiKey)) return { ok: false, why: isExample, fix: exampleFix(file, `The key file holds an example, not a key. ${fill}`, o.platform) };
    const base = parseBaseUrl(read.baseUrl, p.defaultBase);
    if (!base.ok) return { ok: false, why: `"baseUrl" in ${file} ${base.why}`, fix: (read.baseUrl ?? "").trim() ? unusableFix(file, "content", `"baseUrl" in the key file ${base.why}. Make it the endpoint's base (it ends /v1 for most), save, and the next cycle reads it, no restart.`, o.platform) : exampleFix(file, `The key file names no base URL. ${fill}`, o.platform) };
    const fileModel = (read.model ?? "").trim();
    // a key put in "model" (the file's own key, or another): refused, never sent as a model, never said back
    if (keyShaped(fileModel)) return { ok: false, why: `"model" in ${file} ${KEY_AS_MODEL}`, fix: unusableFix(file, "content", `"model" in the key file ${KEY_AS_MODEL}. Open it with the command below, put the model's name there instead and save: the next cycle reads it, no restart.`, o.platform) };
    // the template's empty model, or the old how-to's placeholder, names no model an endpoint serves: the example, unless the form names one
    if (needModel && (exampleModel(fileModel) || (!fileModel && !formModel))) return { ok: false, why: `the key file's model is the example: name ${MODEL_WORDS}, in "model" in ${file}`, fix: exampleFix(file, `The key file names no model. Put ${MODEL_WORDS} between the quotes of "model" in the file below and save: it is read at the next cycle, no restart.`, o.platform) };
    return { ok: true, how: `the key file ${ref}${apiKey ? "" : " (no key: a local server)"} · ${hostSaid(base.url)}`, apiKey, baseUrl: base.url, model: formModel || (exampleModel(fileModel) ? "" : fileModel), file, ref };
  }
  const problem = fileProblem(read);
  if (problem === "content" && emptyField(o.home, ref, "apiKey")) return { ok: false, why: isExample, fix: exampleFix(file, `The key file is there, but its key is empty. ${fill}`, o.platform) };
  // the file is there but cannot be used (its mode, not JSON, no "apiKey"): its own reason — which names no value from it
  const words = problem === "mode" ? "The key file can be read by other users of this machine, so the brain does not read it. Run the command below so only you can read it; the next cycle reads it, no restart." : problem === "content" ? `The key file is not what the brain reads: it should hold one line, ${templateOf(p)}, with ${p.keyOptional ? "the model" : "your key and the model"} between their quotes. Open it with the command below, fix it and save; the next cycle reads it, no restart.` : `The key file cannot be used: ${read.message}`;
  return { ok: false, why: `the key file cannot be used: ${read.message}`, fix: unusableFix(file, problem === "missing" ? "other" : problem, words, o.platform) };
}

// ---- the request's dialect, learned from the endpoint's answers -------------------------------------------------------------------

interface Dialect {
  limit: "max_completion_tokens" | "max_tokens";
  effort: boolean;
  json: "schema" | "object";
}
const KNOBS = ["effort", "limit", "json"] as const;
type Knob = (typeof KNOBS)[number];

/** the quirks at a base URL: the preset's own, and where it says nothing, the host's */
const quirksAt = (p: OpenAIPreset, baseUrl: string): OpenAIQuirks => {
  const h = hostQuirks(baseUrl);
  return { json: p.quirks.json ?? h.json, limit: p.quirks.limit ?? h.limit, reasons: p.quirks.reasons ?? h.reasons, noEffortNone: p.quirks.noEffortNone ?? h.noEffortNone };
};
const guessDialect = (q: OpenAIQuirks): Dialect => ({ limit: q.limit ?? "max_tokens", effort: true, json: q.json ?? "schema" });
/** which of the fields a 400 names — the one to change */
const knobNamed = (message: string): Knob | undefined => {
  const m = message.toLowerCase();
  if (/reasoning_effort|reasoning\.effort|\beffort\b/.test(m)) return "effort";
  if (/max_completion_tokens|max_tokens/.test(m)) return "limit";
  if (/response_format|json_schema|json schema|\bschema\b|json_object/.test(m)) return "json";
  return undefined;
};
const flip = (d: Dialect, k: Knob): Dialect => (k === "effort" ? { ...d, effort: !d.effort } : k === "limit" ? { ...d, limit: d.limit === "max_tokens" ? "max_completion_tokens" : "max_tokens" } : { ...d, json: d.json === "schema" ? "object" : "schema" });

/** the role's shape as a JSON schema the endpoint can hold the answer to. OpenAI's strict mode wants every property required and no
 * additional ones, and knows no bounds (minimum, pattern…): the bounds are dropped here — the answer is checked against the zod shape
 * anyway — and so is a default, which the zod shape fills where an answer leaves the field out (the Head's rule, desk.ts); strict is asked
 * only when every property is required */
export function jsonSchemaOf(schema: z.ZodType): { schema: Record<string, unknown>; strict: boolean } {
  const js = z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  let strict = true;
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return void n.forEach(walk);
    const o = n as Record<string, unknown>;
    for (const k of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "multipleOf", "default"]) delete o[k];
    if (o.type === "object" && o.properties && typeof o.properties === "object") {
      const keys = Object.keys(o.properties as object);
      const req = Array.isArray(o.required) ? (o.required as unknown[]) : [];
      if (keys.some((k) => !req.includes(k))) strict = false;
      o.additionalProperties = false;
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(js);
  return { schema: js, strict };
}

const ZERO = { inputTokens: 0, outputTokens: 0 };
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
/** the JSON object in an answer: as it is, or inside a ``` fence, or the first { … last } */
export const jsonIn = (text: string): unknown => {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    /* not whole JSON */
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      /* not JSON either */
    }
  }
  return undefined;
};

interface Answered {
  status: number;
  json: unknown;
  message: string;
}

/** the system prompt's last line in json_object mode: nothing else holds the answer to the shape, and DeepSeek's JSON mode wants the word
 * "json" itself in the prompt */
const JSON_WORD = "Reply in json: that one object, no prose around it.";

export function openaiBrain(o: OpenAIBrainOptions): Brain {
  const p = presetOf(o);
  let dialect: Dialect | undefined;
  let dialectAt = "";
  const call = async (reach: Extract<OpenAIReach, { ok: true }>, path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown> | undefined; timeoutMs: number }): Promise<Answered> => {
    const f = o.fetch ?? fetch;
    const host = hostSaid(reach.baseUrl);
    let res: Response;
    try {
      // redirect "error": a redirect is never followed — on a 307 or 308 fetch would carry the body (the system prompt, the portfolio) on to
      // whatever address the endpoint names, plain http to another host included; the key's header it drops, the question it does not
      res = await f(`${reach.baseUrl}${path}`, { method: init.method, redirect: "error", headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(reach.apiKey ? { authorization: `Bearer ${reach.apiKey}` } : {}) }, ...(init.body ? { body: JSON.stringify(init.body) } : {}), signal: AbortSignal.timeout(init.timeoutMs) });
    } catch (err) {
      // undici refuses a redirect as "fetch failed", its cause "unexpected redirect": said as what it is, not as an endpoint out of reach
      const e = err as { name?: unknown; message?: unknown; cause?: { message?: unknown } | undefined };
      if (/redirect/i.test(`${String(e?.message ?? "")} ${String(e?.cause?.message ?? "")}`)) throw new Error(redirectWords(host));
      throw new Error(`the endpoint ${host} could not be reached${e?.name === "TimeoutError" ? " in time" : ""}`);
    }
    // a fetch that hands the redirect back instead of refusing it (another runtime, a stand-in) is refused the same, its body unread
    if ((res.status >= 300 && res.status < 400) || res.redirected) throw new Error(redirectWords(host));
    let text: string;
    try {
      text = await res.text();
    } catch {
      // a body cut off on the way: said in these words, never in the runtime's own (which are not the endpoint's, and are not scrubbed)
      throw new Error(`the endpoint ${host} answered ${res.status}, but its answer could not be read`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const e = (json && typeof json === "object" ? (json as { error?: unknown }).error : undefined) as { message?: unknown } | string | undefined;
    const raw = typeof e === "string" ? e : e && typeof e === "object" && typeof e.message === "string" ? e.message : res.ok ? "" : text;
    // the endpoint's own words, scrubbed of the key and every piece of it (brain-key.ts scrubbed) — read from the first 4 KB only: a page of
    // HTML from a proxy is not scrubbed whole to be cut to 160 characters, and a key cut at the 4 KB mark is still masked as a piece of it
    return { status: res.status, json, message: scrubbed(raw.slice(0, 4096), reach.apiKey).slice(0, 160) };
  };
  const wordsFor = (r: Answered, reach: Extract<OpenAIReach, { ok: true }>, model: string): string => {
    const host = hostSaid(reach.baseUrl);
    const said = r.message ? `: ${r.message}` : "";
    if (r.status === 401 || r.status === 403) return `the endpoint ${host} did not accept the key`;
    if (r.status === 402) return `the endpoint ${host} says the balance is out${said}`;
    if (r.status === 404) return `nothing answers at ${host}/chat/completions for "${scrubbed(model, reach.apiKey).slice(0, 80)}": the base URL's path, or the model's name${said}`;
    if (r.status === 429) return `the endpoint ${host} is rate-limiting this key${said} — it is asked again next cycle`;
    return `the endpoint ${host} answered ${r.status}${said}`;
  };
  /** the answer read: the decision, or why none — and whether asking once more could help (json_object mode: nothing held the shape).
   * `key`: the key in use, so that a refusal's words — the one string from the endpoint said as it came — are scrubbed of it, and of every
   * piece of it, before they reach the room (an endpoint or a proxy that echoes the bearer back in "refusal" would otherwise put the key
   * there, where the feed, the seat's view and outside agents over MCP read it) */
  const read = <T>(j: unknown, schema: z.ZodType<T>, key: string): BrainAnswer<T> & { again?: boolean } => {
    const a = (j && typeof j === "object" ? j : {}) as { choices?: Array<{ message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }>; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    const usage = { inputTokens: num(a.usage?.prompt_tokens), outputTokens: num(a.usage?.completion_tokens) };
    const c = Array.isArray(a.choices) ? a.choices[0] : undefined;
    if (!c) return { out: null, why: "the endpoint answered without a choice", usage };
    const m = c.message ?? {};
    if (typeof m.refusal === "string" && m.refusal) return { out: null, why: `the model declined to answer: ${scrubbed(m.refusal, key).slice(0, 160)}`, usage };
    if (c.finish_reason === "length") return { out: null, why: "the answer ran past its token limit", usage };
    if (c.finish_reason === "content_filter") return { out: null, why: "the endpoint's content filter stopped the answer", usage };
    const text = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((x) => (x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : "")).join("") : "";
    if (!text.trim()) return { out: null, why: "the answer was empty", usage, again: true };
    const raw = jsonIn(text);
    if (raw === undefined) return { out: null, why: "the answer was not JSON", usage, again: true };
    const parsed = schema.safeParse(raw);
    return parsed.success ? { out: parsed.data, usage } : { out: null, why: "the answer did not fit the shape asked for", usage, again: true };
  };
  return {
    id: p.id,
    label: p.label,
    models: [],
    ready(model?: string): BrainStatus {
      const r = openaiReach(o, model);
      return r.ok ? { ok: true, model: r.model, how: r.how } : { ok: false, model: "", why: r.why, fix: r.fix };
    },
    about(): BrainAbout {
      const env = o.env ?? process.env;
      const src = sourceOf(o, p);
      // the base URL it would call now, shown only when it is one the brain would send the key to ("" otherwise: the standing says why)
      const shown = (raw: string | undefined): string => {
        const b = parseBaseUrl(raw, p.defaultBase);
        return b.ok ? b.url : "";
      };
      let baseUrl = shown(undefined);
      let tail: string | undefined;
      if (src.from === "env") {
        tail = keyTail(env[src.envVar]);
        baseUrl = shown(env[`${p.envPrefix}_BASE_URL`]);
      } else if (src.from !== "none") {
        const r = loadKeyFile(o.home, src.ref, shapeOf(p), p.id);
        if (!isRefusal(r)) {
          tail = keyTail(r.apiKey);
          baseUrl = shown(r.baseUrl);
        }
      }
      return {
        kind: p.kind,
        format: "openai",
        baseUrl,
        ...(p.defaultBase ? {} : { baseRequired: true }),
        ...(p.baseHint ? { baseHint: p.baseHint } : {}),
        ...(p.keyOptional ? { keyOptional: true } : {}),
        suggested: { ...p.suggestedModels, models: [...p.suggestedModels.models] },
        efforts: p.efforts,
        ...(tail ? { tail } : {}),
        ...(src.from === "env" ? { envWins: src.envVar } : {}),
        keyFile: p.keyRef,
        keyFrom: src.from,
        ...(p.docs ? { docs: p.docs } : {}),
        ...(p.keyPage ? { keyPage: p.keyPage } : {}),
        ...(p.note ? { note: p.note } : {}),
      };
    },
    async test(model?: string): Promise<BrainTest> {
      // a model's name that looks like a key is refused before anything is sent, in words that do not repeat it
      if (keyShaped((model ?? "").trim())) return { ok: false, provider: p.id, words: `the model named ${KEY_AS_MODEL}` };
      const reach = openaiReach(o, undefined, false);
      if (!reach.ok) return { ok: false, provider: p.id, words: reach.why, fix: reach.fix };
      const host = hostSaid(reach.baseUrl);
      let r: Answered;
      try {
        r = await call(reach, "/models", { method: "GET", timeoutMs: o.timeoutMs ?? TEST_TIMEOUT_MS });
      } catch (err) {
        return { ok: false, provider: p.id, words: scrubbed(String((err as Error)?.message ?? err), reach.apiKey) };
      }
      const said = r.message ? `: ${r.message}` : "";
      if (r.status === 401 || r.status === 403) return { ok: false, provider: p.id, status: r.status, words: `${host} did not accept the key${said}` };
      if (r.status === 404) return { ok: false, provider: p.id, status: r.status, words: `nothing answers at ${host}${new URL(reach.baseUrl).pathname.replace(/\/$/, "")}/models: the base URL's path may be wrong (it ends /v1 for most), or the endpoint keeps no list of models — the desk's first call will tell` };
      if (r.status < 200 || r.status >= 300) return { ok: false, provider: p.id, status: r.status, words: `${host} answered ${r.status}${said}` };
      // each id (from a list in either shape: listedIds) checked to look like a model's name, and to hold no piece of the key in use, before
      // the page is shown it (at most 200)
      const models = [...new Set(listedIds(r.json).filter((x) => MODEL_ID.test(x) && !keyShaped(x) && !holdsPieceOf(x, reach.apiKey)))].slice(0, 200);
      const want = (model ?? "").trim() || reach.model;
      const among = !want ? "" : models.includes(want) ? `; ${want} is among them` : models.length ? `; "${want.slice(0, 80)}" is not among them — check the model's name` : "";
      const took = reach.apiKey ? `${host} accepted the key` : `${host} answered (no key sent: a local server)`;
      return { ok: true, provider: p.id, status: r.status, words: `${took}${models.length ? ` and lists ${models.length} model${models.length === 1 ? "" : "s"}` : ""}${among}.`, models };
    },
    async probe(key: string): Promise<BrainProbe> {
      // the provider's own address, and no other: a pasted key goes only to the provider it was recognised as — never to a base URL in the
      // key file or the environment, which may name any host
      const base = p.kind === "model-api" && p.defaultBase ? parseBaseUrl(undefined, p.defaultBase) : undefined;
      if (!base || !base.ok) return { outcome: "error", words: `${p.label} has no address of its own to ask a pasted key at` };
      const reach = { ok: true as const, how: "", apiKey: key, baseUrl: base.url, model: "", file: "", ref: "" };
      const host = hostSaid(base.url);
      const ask = (path: string): Promise<Answered> => call(reach, path, { method: "GET", timeoutMs: o.timeoutMs ?? TEST_TIMEOUT_MS });
      const said = (r: Answered) => (r.message ? { said: r.message } : {});
      const refused = (r: Answered): BrainProbe => ({ outcome: "refused", status: r.status, words: `${host} did not accept the key`, ...said(r) });
      const other = (r: Answered): BrainProbe => ({ outcome: "error", status: r.status, words: `${host} answered ${r.status}`, ...said(r) });
      // the key refused: 401, 403, or a 400 that says so (xAI's, Gemini's layer)
      const keyNo = (r: Answered): boolean => r.status === 401 || r.status === 403 || keyWords400(r.status, r.message);
      try {
        // the provider's own word on the key first, where its list of models says nothing of it (a public list) or says too little (a key
        // that may call no model yet)
        if (p.keyCheck) {
          const k = await ask(p.keyCheck.path);
          if (keyNo(k)) return refused(k);
          if (k.status < 200 || k.status >= 300) return other(k);
          const against = p.keyCheck.judge?.(k.json);
          if (against) return { outcome: "refused", kind: against.kind, status: k.status, words: against.words };
        }
        const r = await ask("/models");
        if (keyNo(r)) return refused(r);
        if (r.status < 200 || r.status >= 300) return other(r);
        // each id as the chat endpoint names it, from a list in either shape (listedIds), checked to look like a model's name and to hold no
        // piece of the key before anything else reads it
        const models = [...new Set(listedIds(r.json).filter((x) => MODEL_ID.test(x) && !keyShaped(x) && !holdsPieceOf(x, key)))].slice(0, PROBE_MODELS_MAX);
        return { outcome: "taken", status: r.status, words: `${host} accepted the key${models.length ? ` and lists ${models.length} model${models.length === 1 ? "" : "s"}` : " and lists no model"}`, models };
      } catch (err) {
        // no answer, none in time, or a redirect (call() says which): the words name the host, never the key
        const m = String((err as Error)?.message ?? err);
        return { outcome: "unreachable", words: /redirect/i.test(m) ? `${host} answered with a redirect, which the account does not follow` : `no answer from ${host}${/in time/.test(m) ? " in time" : ""}` };
      }
    },
    async decide<T>(req: BrainRequest<T>): Promise<BrainAnswer<T>> {
      const reach = openaiReach(o, req.brain.model);
      if (!reach.ok) return { out: null, why: reach.why, usage: ZERO };
      const model = req.brain.model.trim() || reach.model;
      if (!model) return { out: null, why: 'no model is named: the model on the hire form, or "model" in the key file', usage: ZERO };
      if (dialectAt !== reach.baseUrl) {
        dialect = undefined;
        dialectAt = reach.baseUrl;
      }
      const q = quirksAt(p, reach.baseUrl);
      const { schema, strict } = jsonSchemaOf(req.schema);
      const system = `${req.system}\nAnswer with one JSON object and nothing else, in this shape: ${JSON.stringify(schema)}`;
      const limit = req.maxTokens ?? 1024;
      // the effort as the provider takes it: one it does not take is not sent (its default applies), and "none" never where it is a 400
      const effort: string | undefined = p.efforts.includes(req.brain.effort) && !(q.noEffortNone && (req.brain.effort as string) === "none") ? req.brain.effort : undefined;
      let d = dialect ?? guessDialect(q);
      const tried = new Set<Knob>();
      let spent = { ...ZERO };
      let again = true;
      for (;;) {
        const body: Record<string, unknown> = {
          model,
          messages: [
            { role: "system", content: d.json === "object" ? `${system}\n${JSON_WORD}` : system },
            { role: "user", content: req.input },
          ],
          [d.limit]: d.effort || q.reasons ? limit + REASONING_ROOM : limit,
          ...(d.effort && effort ? { reasoning_effort: effort } : {}),
          response_format: d.json === "schema" ? { type: "json_schema", json_schema: { name: "decision", schema, strict } } : { type: "json_object" },
        };
        const r = await call(reach, "/chat/completions", { method: "POST", body, timeoutMs: o.timeoutMs ?? 120_000 });
        if (r.status === 400 && tried.size < KNOBS.length) {
          const named = knobNamed(r.message);
          const k = named && !tried.has(named) ? named : KNOBS.find((x) => !tried.has(x));
          if (k) {
            tried.add(k);
            d = flip(d, k);
            continue;
          }
        }
        // a key the endpoint refused is the brain's standing, not one bad cycle: thrown as its own kind with the fix (brain-key.ts), which the
        // desk keeps until a call is answered again
        if (r.status === 401 || r.status === 403) throw keyRejected(wordsFor(r, reach, model), hostSaid(reach.baseUrl), rejectedFix(reach.file, reach.fromEnv, `The endpoint ${hostSaid(reach.baseUrl)}`, o.platform));
        if (r.status < 200 || r.status >= 300) throw new Error(wordsFor(r, reach, model));
        dialect = d;
        const a = read(r.json, req.schema, reach.apiKey);
        spent = { inputTokens: spent.inputTokens + a.usage.inputTokens, outputTokens: spent.outputTokens + a.usage.outputTokens };
        // json_object holds no shape: an empty answer, prose or the wrong shape is asked once more, its tokens counted with the first's
        if (a.out === null && a.again && d.json === "object" && again) {
          again = false;
          continue;
        }
        return a.out !== null ? { out: a.out, usage: spent } : { out: null, why: a.why, usage: spent };
      }
    },
  };
}
