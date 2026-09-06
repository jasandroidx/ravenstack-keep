/** Mystical stone + neon — 48×48 era palette tokens (v0 solid blocks). */

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

export const ROOM_SIZE = 48;
export const ROOM_GAP_SCALE = 1; // coords from castle_map used as-is (world units)

/** Phaser tint / legacy circle fill (matches art pack chips). */
export function stateColor(state: string | null | undefined): number {
  switch (state) {
    case "working":
    case "answering":
      return PALETTE.neonMagenta; // art bible: work = magenta
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

/** Room body texture: prefer per-room façade, else universal base tile. */
export function roomTextureKey(
  roomId: string,
  lockState: string | null | undefined,
): string {
  const live = lockState === "live";
  const locked = lockState === "locked";
  if (locked) return "room_locked";
  const state = live ? "live" : "unforged";
  const facade = `facade_${roomId}_${state}`;
  // facades registered for known rooms; missing keys fall back in scene
  return facade;
}

export function roomFallbackTextureKey(
  lockState: string | null | undefined,
): string {
  if (lockState === "locked") return "room_locked";
  if (lockState === "live") return "room_live";
  return "room_unforged";
}
