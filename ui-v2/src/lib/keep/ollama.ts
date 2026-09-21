import { createServerFn } from "@tanstack/react-start";

/**
 * Ollama NPC dialogue + ambient events.
 *
 * These are server functions: they run inside the Nitro server and talk to the
 * Keep HTTP API over loopback. The browser never holds a base URL (no CORS, no
 * VITE hostname), matching every other server fn in this repo (duty, gates,
 * pulse). The HTTP internals are separated out so the node test runner can
 * exercise them with a mocked fetch.
 */

const KEEP_HTTP_URL = process.env.KEEP_HTTP_URL?.trim() || "http://127.0.0.1:8112";

export type DialogueResponse = {
  ok: boolean;
  source: "ollama" | "fallback";
  npc_id?: string;
  reply?: string | null;
};

export type AmbientEventResponse = {
  ok: boolean;
  source: "ollama" | "fallback";
  event?: string | null;
};

export async function ollamaDialogueHttp(
  npcId: string,
  userQuery?: string,
  timeoutMs = 4000
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${KEEP_HTTP_URL}/api/dialogue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ npc_id: npcId, query: userQuery }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DialogueResponse;
    return data.ok && data.reply ? data.reply : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function ollamaAmbientHttp(timeoutMs = 4000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${KEEP_HTTP_URL}/api/ambient-event`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AmbientEventResponse;
    return data.ok && data.event ? data.event : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const fetchNpcDialogue = createServerFn({ method: "POST" })
  .validator((input: { npcId: string; userQuery?: string }) => input)
  .handler(async ({ data }) => ollamaDialogueHttp(data.npcId, data.userQuery));

export const fetchAmbientEvent = createServerFn({ method: "GET" }).handler(
  async () => ollamaAmbientHttp()
);