/**
 * Shared interaction system (HallScene + RoomScene + Basement).
 * Locked pattern (LOCKED-DECISIONS §3): overlap zone (never a collider) →
 * ONE "E - <verb>" prompt → E → player-state lock → saved flag.
 * Priority: door 40 > npc 30 > object 20 > table 10; ties → nearest anchor.
 * The pure helpers at the top (flags, pickPrompt, zonesAt) have no Phaser
 * import so node tests can run them.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
export type PlayerState = "walk" | "talk" | "sit" | "cutscene";
export type InteractKind = "sit" | "secret" | "climb" | "open" | "gaze" | "smell" | "read";

export type Interactable = {
  id: string;
  /** Overlap zone that holds the player's feet. Never a physics body. */
  rect: Rect;
  anchor?: Pt & { face?: "down" | "left" | "right" | "up" };
  verb: string;
  kind: InteractKind;
  priority?: number;
  /** Flags that must all be set before the prompt appears. */
  requires?: string[];
  /** Only offered at night ("night") or by day ("day"). */
  when?: "night" | "day";
  cooldownMs?: number;
  lines?: string[];
  /** World point the in-canvas prompt label floats over. */
  labelAt?: Pt;
  data?: Record<string, unknown>;
};

export const PRIORITY = { door: 40, npc: 30, object: 20, table: 10 } as const;

export type PromptCandidate = { kind: keyof typeof PRIORITY; verb: string; dSq: number; ref?: unknown };

/** One prompt at a time: highest priority wins, ties → nearest. */
export function pickPrompt(cands: (PromptCandidate | null | undefined)[]): PromptCandidate | null {
  let best: PromptCandidate | null = null;
  for (const c of cands) {
    if (!c) continue;
    if (!best || PRIORITY[c.kind] > PRIORITY[best.kind] || (PRIORITY[c.kind] === PRIORITY[best.kind] && c.dSq < best.dSq)) best = c;
  }
  return best;
}

export const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export type ZoneCtx = { flags: Flags; now: number; isNight: boolean; cooldowns?: Record<string, number> };

/** Best interactable whose zone holds (x,y), after flag / time / cooldown filters. */
export function interactableAt(list: Interactable[], x: number, y: number, ctx: ZoneCtx): Interactable | null {
  let best: Interactable | null = null;
  let bestScore = -Infinity;
  for (const it of list) {
    if (!inRect(it.rect, x, y)) continue;
    if (it.requires && !it.requires.every((f) => !!ctx.flags[f])) continue;
    if (it.when === "night" && !ctx.isNight) continue;
    if (it.when === "day" && ctx.isNight) continue;
    const cd = ctx.cooldowns?.[it.id] ?? 0;
    if (it.cooldownMs && ctx.now < cd) continue;
    const a = it.anchor ?? { x: it.rect.x + it.rect.w / 2, y: it.rect.y + it.rect.h / 2 };
    const dSq = (a.x - x) ** 2 + (a.y - y) ** 2;
    const score = (it.priority ?? PRIORITY.object) * 1e7 - dSq;
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return best;
}

// ---------- Flags (one versioned key, shared by every scene) ----------
export const FLAGS_KEY = "ravenstack.keep.flags.v1";
export type Flags = Record<string, string | number | boolean>;
let flagCache: Flags | null = null;
type RegistryLike = { set: (k: string, v: unknown) => unknown };
let registry: RegistryLike | null = null;

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
export function loadFlags(): Flags {
  if (flagCache) return flagCache;
  flagCache = {};
  try {
    const raw = storage()?.getItem(FLAGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) flagCache = parsed as Flags;
  } catch { flagCache = {}; }
  return flagCache;
}
export function getFlag(k: string) { return loadFlags()[k]; }
export function setFlag(k: string, v: string | number | boolean = true) {
  const f = loadFlags();
  f[k] = v;
  try { storage()?.setItem(FLAGS_KEY, JSON.stringify(f)); } catch { /* storage blocked */ }
  try { registry?.set(k, v); } catch { /* ignore */ }
}
/** Mirror flags into a Phaser registry (game-wide, so every scene sees them). */
export function bindRegistry(r: RegistryLike) {
  registry = r;
  for (const [k, v] of Object.entries(loadFlags())) { try { r.set(k, v); } catch { /* ignore */ } }
}
/** Test hook: forget the in-memory cache (re-read storage next call). */
export function resetFlagCache() { flagCache = null; }

/** Mark a first find. Returns true only the very first time. */
export function discover(id: string): boolean {
  const k = `found:${id}`;
  if (getFlag(k)) return false;
  setFlag(k, true);
  return true;
}

export function exposeDebugHooks() {
  try {
    const w = window as unknown as Record<string, unknown>;
    w.__keepFlags = () => ({ ...loadFlags() });
    w.__keepResetFlags = () => { flagCache = {}; try { storage()?.removeItem(FLAGS_KEY); } catch { /* ignore */ } };
  } catch { /* no window */ }
}
