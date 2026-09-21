/**
 * Local inference plane — Ollama.
 *
 * Local-first is a rule in FORTRESS_BRIEF, so it has to be a code path, not a slogan.
 * Server-only: every env read happens inside a function so this never evaluates
 * in a browser bundle.
 *
 * Env:
 *   OLLAMA_BASE_URL   http://127.0.0.1:11434 (default). OLLAMA_HOST also accepted.
 *   KEEP_LOCAL_MODEL  pin one model. Otherwise the first preferred tag installed wins.
 *   KEEP_LOCAL_TIMEOUT_MS  default 120000. Cold local models are slow, not broken.
 */

import { errorText, isAbortError, isConnectionError } from "./net";

const DEFAULT_BASE = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 120_000;

/** Tried in order when KEEP_LOCAL_MODEL is unset. Instruct/chat tags only. */
const PREFERRED = [
  "qwen2.5:14b",
  "qwen2.5:7b",
  "llama3.1:8b",
  "llama3.1",
  "llama3.2",
  "mistral",
  "phi3",
  "gemma2",
];

export type OllamaModel = {
  name: string;
  sizeBytes: number;
  family: string;
  parameterSize: string;
  quantization: string;
};

export type OllamaFailure = { ok: false; error: string; hint?: string };

function env(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[name]?.trim() ?? "";
}

/** Accepts "127.0.0.1:11434" as well as a full URL — OLLAMA_HOST is often bare. */
export function ollamaBaseUrl(): string {
  const raw = env("OLLAMA_BASE_URL") || env("OLLAMA_HOST") || DEFAULT_BASE;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

function timeoutMs(): number {
  const n = Number(env("KEEP_LOCAL_TIMEOUT_MS"));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Never let a dead box hang a request forever — that reads as "the app is broken". */
async function fetchJson(url: string, init: RequestInit, ms: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`);
    }
    return body ? JSON.parse(body) : {};
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(err: unknown, base: string): OllamaFailure {
  const msg = errorText(err);
  if (isAbortError(err)) {
    return {
      ok: false,
      error: `Ollama timed out after ${timeoutMs()}ms at ${base}`,
      hint: "Model may be loading from cold. Raise KEEP_LOCAL_TIMEOUT_MS or pull a smaller tag.",
    };
  }
  if (isConnectionError(err)) {
    return {
      ok: false,
      error: `Ollama unreachable at ${base} (${msg})`,
      hint: "Start it with `ollama serve`, or point OLLAMA_BASE_URL at the box.",
    };
  }
  return { ok: false, error: `Ollama error at ${base}: ${msg}` };
}

let modelCache: { at: number; base: string; models: OllamaModel[] } | null = null;
const MODEL_TTL_MS = 30_000;

export async function listOllamaModels(
  opts: { force?: boolean } = {},
): Promise<{ ok: true; base: string; models: OllamaModel[] } | (OllamaFailure & { base: string })> {
  const base = ollamaBaseUrl();
  if (!opts.force && modelCache && modelCache.base === base && Date.now() - modelCache.at < MODEL_TTL_MS) {
    return { ok: true, base, models: modelCache.models };
  }
  try {
    const raw = (await fetchJson(`${base}/api/tags`, { method: "GET", headers: { Accept: "application/json" } }, 10_000)) as {
      models?: Array<{
        name?: string;
        model?: string;
        size?: number;
        details?: { family?: string; parameter_size?: string; quantization_level?: string };
      }>;
    };
    const models: OllamaModel[] = (raw.models ?? [])
      .map((m) => ({
        name: String(m.name ?? m.model ?? "").trim(),
        sizeBytes: Number(m.size ?? 0),
        family: String(m.details?.family ?? ""),
        parameterSize: String(m.details?.parameter_size ?? ""),
        quantization: String(m.details?.quantization_level ?? ""),
      }))
      .filter((m) => m.name.length > 0);
    modelCache = { at: Date.now(), base, models };
    return { ok: true, base, models };
  } catch (err) {
    modelCache = null;
    return { ...describeFailure(err, base), base };
  }
}

/** Exact tag, then bare-name match (llama3.1 → llama3.1:8b), then preference order. */
export function pickModel(installed: string[], preferred?: string): string | null {
  if (installed.length === 0) return null;
  const bare = (t: string) => t.split(":")[0];

  const want = (preferred ?? "").trim();
  if (want) {
    const exact = installed.find((m) => m === want);
    if (exact) return exact;
    const byBase = installed.find((m) => bare(m) === bare(want));
    if (byBase) return byBase;
  }

  for (const p of PREFERRED) {
    const exact = installed.find((m) => m === p);
    if (exact) return exact;
    const byBase = installed.find((m) => bare(m) === bare(p));
    if (byBase) return byBase;
  }
  return installed[0];
}

export async function resolveLocalModel(): Promise<
  { ok: true; model: string; base: string; installed: string[] } | (OllamaFailure & { base: string })
> {
  const listed = await listOllamaModels();
  if (!listed.ok) return listed;
  const installed = listed.models.map((m) => m.name);
  const model = pickModel(installed, env("KEEP_LOCAL_MODEL"));
  if (!model) {
    return {
      ok: false,
      base: listed.base,
      error: `Ollama is up at ${listed.base} but has no models installed`,
      hint: "Pull one, e.g. `ollama pull llama3.1:8b`.",
    };
  }
  return { ok: true, model, base: listed.base, installed };
}

export type OllamaChatOk = { ok: true; text: string; model: string; base: string };

export async function ollamaChat(input: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask the model for strict JSON. Used by Clawforge and the Round Table. */
  json?: boolean;
  model?: string;
}): Promise<OllamaChatOk | OllamaFailure> {
  const resolved = input.model
    ? { ok: true as const, model: input.model, base: ollamaBaseUrl() }
    : await resolveLocalModel();
  if (!resolved.ok) return resolved;

  const { model, base } = resolved;
  try {
    const raw = (await fetchJson(
      `${base}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          ...(input.json ? { format: "json" } : {}),
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          options: {
            temperature: input.temperature ?? 0.4,
            num_predict: input.maxTokens ?? 1800,
          },
        }),
      },
      timeoutMs(),
    )) as { message?: { content?: string }; error?: string };

    if (raw.error) return { ok: false, error: `Ollama refused: ${raw.error}` };
    const text = (raw.message?.content ?? "").trim();
    if (!text) return { ok: false, error: `Empty response from local model ${model}` };
    return { ok: true, text, model, base };
  } catch (err) {
    return describeFailure(err, base);
  }
}
