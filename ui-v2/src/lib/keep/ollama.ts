import type { HallState } from "@/lib/hall/barks";

const KEEP_HTTP_BASE = process.env.VITE_KEEP_HTTP_URL || "http://127.0.0.1:8120";

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

/**
 * Fetch dynamic NPC dialogue from Keep HTTP Ollama endpoint.
 * Non-blocking, returns null on failure/timeout to allow local bark fallback.
 */
export async function fetchNpcDialogue(
  npcId: string,
  userQuery?: string,
  state?: HallState | null,
  timeoutMs = 4000
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${KEEP_HTTP_BASE}/api/dialogue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        npc_id: npcId,
        query: userQuery,
        keep_state: state,
      }),
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = (await res.json()) as DialogueResponse;
    if (data.ok && data.reply) {
      return data.reply;
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Fetch dynamic ambient event line from Keep HTTP Ollama endpoint.
 */
export async function fetchAmbientEvent(timeoutMs = 3000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${KEEP_HTTP_BASE}/api/ambient-event`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = (await res.json()) as AmbientEventResponse;
    if (data.ok && data.event) {
      return data.event;
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
