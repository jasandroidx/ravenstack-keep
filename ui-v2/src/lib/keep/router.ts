/**
 * Model routing. One place decides which plane answers a prompt.
 *
 * FORTRESS_BRIEF says local-first and "paid tiers only when the operator is
 * explicit", so local is the default and cloud is a fallback that requires a key.
 *
 * Env:
 *   KEEP_MODEL_ROUTE  local-first (default) | local | cloud-first | cloud
 *   KEEP_ALLOW_CLOUD  0 disables the cloud leg outright, key present or not
 *   KEEP_CLOUD_MODEL  default gemini-3.7-flash (inherited — verify against the SDK)
 *   GEMINI_API_KEY / GOOGLE_GENAI_API_KEY  cloud credential
 */

import { listOllamaModels, ollamaBaseUrl, ollamaChat, resolveLocalModel } from "./ollama";

export type Route = "local-first" | "local" | "cloud-first" | "cloud";
export type Provider = "local" | "cloud";

export type CompleteOk = { ok: true; text: string; provider: Provider; model: string };
export type CompleteErr = { ok: false; error: string; hint?: string };
export type CompleteResult = CompleteOk | CompleteErr;

const DEFAULT_CLOUD_MODEL = "gemini-3.7-flash";

function env(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[name]?.trim() ?? "";
}

export function route(): Route {
  const raw = env("KEEP_MODEL_ROUTE").toLowerCase();
  if (raw === "local" || raw === "cloud" || raw === "cloud-first" || raw === "local-first") return raw;
  return "local-first";
}

export function cloudKey(): string {
  return env("GEMINI_API_KEY") || env("GOOGLE_GENAI_API_KEY");
}

export function cloudModel(): string {
  return env("KEEP_CLOUD_MODEL") || DEFAULT_CLOUD_MODEL;
}

export function cloudAllowed(): boolean {
  if (env("KEEP_ALLOW_CLOUD") === "0") return false;
  return Boolean(cloudKey());
}

/**
 * Dynamic import: @google/genai lives in the root workspace, so a hoisting or
 * install problem must not crash every local-first screen at module load.
 */
export type GenAiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };
export type GenAiResponse = {
  text?: string;
  candidates?: Array<{ content?: { parts?: GenAiPart[] } }>;
};

type GenAiLike = {
  models: {
    generateContent: (req: unknown) => Promise<GenAiResponse>;
  };
};

let genAiClient: GenAiLike | null = null;

export async function getGenAI(): Promise<GenAiLike> {
  if (genAiClient) return genAiClient;
  const mod = (await import("@google/genai")) as { GoogleGenAI: new (opts?: unknown) => GenAiLike };
  const key = cloudKey();
  genAiClient = new mod.GoogleGenAI(key ? { apiKey: key } : {});
  return genAiClient;
}

async function completeLocal(
  system: string,
  user: string,
  maxTokens: number,
  opts: { json?: boolean; temperature?: number },
): Promise<CompleteResult> {
  const res = await ollamaChat({ system, user, maxTokens, temperature: opts.temperature, json: opts.json });
  if (!res.ok) return { ok: false, error: res.error, hint: res.hint };
  return { ok: true, text: res.text, provider: "local", model: res.model };
}

async function completeCloud(
  system: string,
  user: string,
  maxTokens: number,
  opts: { temperature?: number },
): Promise<CompleteResult> {
  if (env("KEEP_ALLOW_CLOUD") === "0") {
    return { ok: false, error: "Cloud routing is disabled (KEEP_ALLOW_CLOUD=0)" };
  }
  if (!cloudKey()) {
    return { ok: false, error: "No cloud key set", hint: "Set GEMINI_API_KEY, or run local by installing an Ollama model." };
  }
  const model = cloudModel();
  try {
    const ai = await getGenAI();
    const response = await ai.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature: opts.temperature ?? 0.4,
      },
    });
    const text = response.text?.trim() ?? "";
    if (!text) return { ok: false, error: `Empty response from cloud model ${model}` };
    return { ok: true, text, provider: "cloud", model };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cloud (${model}) error: ${message}` };
  }
}

/**
 * Run a prompt through the configured route. Both legs failing returns both
 * reasons — a bare "it didn't work" is what made this app unreadable.
 */
export async function complete(
  system: string,
  user: string,
  maxTokens = 1800,
  opts: { json?: boolean; temperature?: number } = {},
): Promise<CompleteResult> {
  const r = route();
  const legs: Provider[] =
    r === "local" ? ["local"] : r === "cloud" ? ["cloud"] : r === "cloud-first" ? ["cloud", "local"] : ["local", "cloud"];

  const failures: string[] = [];
  let hint: string | undefined;

  for (const leg of legs) {
    const res =
      leg === "local"
        ? await completeLocal(system, user, maxTokens, opts)
        : await completeCloud(system, user, maxTokens, opts);
    if (res.ok) return res;
    failures.push(`${leg}: ${res.error}`);
    hint = hint ?? res.hint;
  }

  return {
    ok: false,
    error: `No model plane answered (route=${r}). ${failures.join(" | ")}`,
    hint: hint ?? "Open the Workshop bench to see which plane is down.",
  };
}

export type RoutingStatus = {
  route: Route;
  local: {
    base: string;
    reachable: boolean;
    models: string[];
    selected: string | null;
    error?: string;
    hint?: string;
  };
  cloud: {
    allowed: boolean;
    keyPresent: boolean;
    model: string;
  };
};

/** Honest snapshot for the mechanic bench. Never throws, never prints a key. */
export async function routingStatus(): Promise<RoutingStatus> {
  const listed = await listOllamaModels({ force: true });
  const base = listed.ok ? listed.base : ollamaBaseUrl();

  let selected: string | null = null;
  let error: string | undefined;
  let hint: string | undefined;
  let models: string[] = [];

  if (listed.ok) {
    models = listed.models.map((m) => m.name);
    const resolved = await resolveLocalModel();
    if (resolved.ok) selected = resolved.model;
    else {
      error = resolved.error;
      hint = resolved.hint;
    }
  } else {
    error = listed.error;
    hint = listed.hint;
  }

  return {
    route: route(),
    local: { base, reachable: listed.ok, models, selected, error, hint },
    cloud: { allowed: cloudAllowed(), keyPresent: Boolean(cloudKey()), model: cloudModel() },
  };
}
