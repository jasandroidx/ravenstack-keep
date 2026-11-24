/**
 * NPC talk fallback chain (Jason, 2026-10-30: "ollama first and then
 * freellmapi"): Ollama -> FreeLLMAPI -> canned line. Pure, no "@/" imports,
 * so node tests load it directly. The legs themselves (fetch calls, keys)
 * live server-side in ai.ts; no key ever reaches this module or the browser.
 */
export type LegResult = { ok: true; text: string } | { ok: false; error: string };
export type Leg = () => Promise<LegResult>;
export type TalkSource = "ollama" | "freellmapi" | "canned";
export type TalkReply = { ok: true; text: string; source: TalkSource; tried: string[] };

/** A provider refusal ("I can't help with that") counts as a failed leg. */
export function isRefusal(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[’]/g, "'").slice(0, 160);
  if (/^as an ai\b/.test(t)) return true;
  return /^(?:(?:i'm|i am) sorry,?\s*(?:but\s*)?|sorry,?\s*(?:but\s*)?)?i (?:can't|cannot|can not|won't|will not|am unable to|'m unable to|am not able to|'m not able to) (?:help|assist|do that|continue|comply|provide|engage|create|write|generate|fulfil|fulfill|participate|go there)/.test(t);
}

/** Ollama gets this long before we move on (KEEP_NPC_OLLAMA_TIMEOUT_MS). */
export function npcOllamaTimeoutMs(env: Record<string, string | undefined> = {}): number {
  const n = parseInt(env.KEEP_NPC_OLLAMA_TIMEOUT_MS?.trim() || "", 10);
  return Number.isFinite(n) && n >= 500 ? n : 6000;
}

export async function talkChain(legs: { ollama: Leg; freellmapi: Leg }, canned: readonly string[], r = Math.random()): Promise<TalkReply> {
  const tried: string[] = [];
  for (const name of ["ollama", "freellmapi"] as const) {
    let res: LegResult;
    try { res = await legs[name](); } catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    if (res.ok && res.text.trim() && !isRefusal(res.text)) return { ok: true, text: res.text.trim(), source: name, tried: [...tried, `${name}:ok`] };
    tried.push(`${name}:${res.ok ? (res.text.trim() ? "refused" : "empty") : "fail"}`);
  }
  const lines = canned.length ? canned : ["…"];
  return { ok: true, text: lines[Math.floor(r * lines.length) % lines.length], source: "canned", tried };
}

/** Last-resort lines for the hall NPCs that have no canned set elsewhere. */
export const NPC_CANNED: Record<string, string[]> = {
  raziel: ["The Keep holds. Ask me again in a moment; the relays are quiet.", "Every gate stays shut until you approve it. That much I can tell you."],
  oracle: ["Not-in-knowledge right now. The wayfinder's lantern is dim; ask again shortly."],
  valerie: ["Lines are down on my bench. Smallest reversible step: try me again in a minute."],
};
