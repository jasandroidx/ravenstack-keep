/** Mystical stone + neon — fortress visual tokens (v2 interiors + corridors). */

export const PALETTE = {
  bg: 0x0b0e14,
  stone: 0x3a3f4b,
  stoneDim: 0x1e222b,
  stoneLive: 0x4a5568,
  neonCyan: 0x2de2e6,
  neonMagenta: 0xff2a6d,
  neonAmber: 0xffc857,
  neonGreen: 0x39ff14,
  neonRed: 0xff3b3b,
  text: 0xe8ecf1,
  textMuted: 0x8b93a7,
  seal: 0x6b5b95,
} as const;

/** Room display size. Native interiors are 96px (1.33× smear at 128). Next art: paint 128px, keep this 128. */
export const ROOM_SIZE = 128;
/** Native agent art is 32×32. Was 48 (1.5× smear). Integer only: 32 or 64. */
export const AGENT_SIZE = 32;
export const ROOM_GAP_SCALE = 1;
/** Half-size used for corridor/door anchoring. */
export const ROOM_HALF = ROOM_SIZE / 2;

/** Must match mcp/src/http_api.py _PX_ORIGIN / _PX_SCALE */
export const GRID_ORIGIN = { x: 480, y: 420 } as const;
export const GRID_SCALE = { x: 168, y: 156 } as const;

/** Castle grid cell → Phaser world pixels (same formula as Keep HTTP). */
export function gridToPx(gx: number, gy: number): { x: number; y: number } {
  return {
    x: GRID_ORIGIN.x + gx * GRID_SCALE.x,
    y: GRID_ORIGIN.y - gy * GRID_SCALE.y,
  };
}

/** Phaser tint / legacy circle fill (matches art pack chips). */
export function stateColor(state: string | null | undefined): number {
  switch (state) {
    case "working":
    case "answering":
      return PALETTE.neonMagenta;
    case "waiting_human":
      return PALETTE.neonAmber;
    case "failed":
      return PALETTE.neonRed;
    case "retired":
      return PALETTE.textMuted;
    case "idle":
    default:
      return PALETTE.neonCyan;
  }
}

/** Texture key for agent chip sprites under /art/chips/. */
export function chipTextureKey(state: string | null | undefined): string {
  switch (state) {
    case "working":
    case "answering":
      return "chip_work";
    case "waiting_human":
      return "chip_wait";
    case "failed":
      return "chip_fail";
    case "retired":
      return "chip_retired";
    case "idle":
    default:
      return "chip_idle";
  }
}

/** Prefer detailed interior art for spatial room_ids. */
export function roomInteriorKey(
  roomId: string,
  lockState: string | null | undefined,
): string {
  const sealed =
    lockState === "UNFORGED" || lockState === "locked" ? "_sealed" : "";
  return `room_${roomId}${sealed}`;
}

/** Room body texture: interior art preferred. */
export function roomTextureKey(
  roomId: string,
  lockState: string | null | undefined,
): string {
  return roomInteriorKey(roomId, lockState);
}

/** Facade key for non-spatial / legacy blueprint rooms. */
export function facadeTextureKey(
  roomId: string,
  lockState: string | null | undefined,
): string {
  const live = lockState === "live" ? "live" : "unforged";
  return `facade_${roomId}_${live}`;
}

export function roomFallbackTextureKey(
  lockState: string | null | undefined,
): string {
  if (lockState === "locked") return "room_locked";
  if (lockState === "live") return "room_live";
  return "room_unforged";
}

/** Keep agent_id / sprite_hint → agent sprite texture key. */
export function agentTextureKey(
  agentId: string | null | undefined,
  spriteHint?: string | null,
): string | null {
  if (spriteHint) {
    const h = spriteHint.toLowerCase().replace(/^agent_/, "");
    const knownHint = [
      "raziel",
      "oracle",
      "clawforge",
      "corvid",
      "scribe",
      "generic",
    ];
    if (knownHint.includes(h)) return `agent_${h}`;
  }
  if (!agentId) return null;
  const id = agentId.toLowerCase();
  if (id.includes("raziel")) return "agent_raziel";
  if (id.includes("oracle")) return "agent_oracle";
  if (id.includes("clawforge") || id.includes("clawsmith"))
    return "agent_clawforge";
  if (id.includes("corvid")) return "agent_corvid";
  if (id.includes("scribe") || id.includes("scriptwriter"))
    return "agent_scribe";
  return "agent_generic";
}

export function activityIconKey(state: string | null | undefined): string {
  switch (state) {
    case "working":
    case "answering":
      return "icon_work";
    case "waiting_human":
      return "icon_wait";
    default:
      return "icon_idle";
  }
}

export function tierBadgeKey(tier: string | null | undefined): string {
  if (tier === "escalate") return "badge_escalate";
  if (tier === "god") return "badge_god";
  return "badge_local";
}
