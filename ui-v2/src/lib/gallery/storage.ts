import type { PortraitItem } from "./types";
import { DEFAULT_LEGEND_AVATARS } from "./pixel-generator";

/**
 * Per-viewer portrait cache.
 *
 * The commission already writes to gallery_portraits server-side; this is the
 * local mirror so a freshly forged portrait appears on the wall without a
 * round trip. Browser storage can throw outright (private windows, blocked
 * site data), so every access is guarded and a failure is silent — a portrait
 * that cannot be cached is not an error worth interrupting the operator for.
 *
 * Empty frames stay empty: an untouched cache reads as `[]`, and the wall shows
 * what has been commissioned, not what could be. The three sovereign legend
 * frames are preserved as data (see DEFAULT_PORTRAITS) for the gallery-hall
 * view that seeds them, but the plain wall never invents commissions.
 */

const KEY = "ravenstack.gallery.portraits";
const AVATAR_KEY = "ravenstack_player_avatar_custom";
const MAX = 32;

/** The three sovereign frames (Boyd, Valerie, Raziel), for views that seed them. */
export const DEFAULT_PORTRAITS: PortraitItem[] = [
  {
    id: "legend-boydimus",
    slotNumber: 1,
    subjectName: "Jason Boyd",
    arcaneTitle: "The Ravenlord & Sovereign Architect",
    customModifier: "Raven-crested obsidian cowl, cybernetic scrying eye, and runic keystroke mantle",
    trivia: "Commands the 92-county Indiana SBOA audit mesh and architect of the sovereign Ravenstack Keep.",
    imageUrl: DEFAULT_LEGEND_AVATARS.boydimus,
    thumbnailUrl: DEFAULT_LEGEND_AVATARS.boydimus,
    lore: "Inscribed in the Obsidian Ledger of Pike County: Master Boydimus anchored the fortress against the shifting tides of external cloud lords. By his decree, no token is burned without covenant, and every gateway answers to the local iron.",
    createdAt: "2026-08-20T12:00:00.000Z",
    isLegendary: true,
  },
  {
    id: "legend-valerie",
    slotNumber: 2,
    subjectName: "Valerie",
    arcaneTitle: "Royal Machine Priestess & Fortress Mechanic",
    customModifier: "Grease-smudged brass visor, plasma blowtorch wrench, and glowing circuit tattoos",
    trivia: "Diagnoses OpenClaw nodes with zero secret leaks and reversible AST patches.",
    imageUrl: DEFAULT_LEGEND_AVATARS.valerie,
    thumbnailUrl: DEFAULT_LEGEND_AVATARS.valerie,
    lore: "Forged in the fires of the eastern workshop, Valerie maintains the physical relays of the Keep. Her diagnostic canons are sacred: smallest reversible diff first, zero secret leaks, and unyielding contempt for bloated cloud dependencies.",
    createdAt: "2026-08-21T14:30:00.000Z",
    isLegendary: true,
  },
  {
    id: "legend-raziel",
    slotNumber: 3,
    subjectName: "Raziel",
    arcaneTitle: "Sovereign Arch-Orchestrator",
    customModifier: "Cyan-glowing crown of consensus, velvet mantle, and floating token soul-meter",
    trivia: "Chairs the Great Hall and enforces human gates before any draft goes live.",
    imageUrl: DEFAULT_LEGEND_AVATARS.raziel,
    thumbnailUrl: DEFAULT_LEGEND_AVATARS.raziel,
    lore: "He who sits upon the dais of the Great Hall speaks with the calm certainty of mathematical consensus. Raziel decomposes grand operator decrees into atomic tasks, halting every sensitive rite until the Keeper's signature is forged in stone.",
    createdAt: "2026-08-22T09:15:00.000Z",
    isLegendary: true,
  },
];

function readCache(): PortraitItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PortraitItem[]) : [];
  } catch {
    return [];
  }
}

function writeCache(list: PortraitItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* Storage unavailable or full. The server copy is the real record. */
  }
  window.dispatchEvent(new CustomEvent("GALLERY_UPDATED", { detail: list }));
}

/** Empty wall, newest first. The plain gallery wall's read. */
export function loadLocalGalleryPortraits(): PortraitItem[] {
  return readCache();
}

/**
 * Gallery-hall read: legend frames seed the wall when nothing has been
 * commissioned yet, slot 1 leftmost as forged.
 */
export function getLocalGalleryPortraits(): PortraitItem[] {
  const cached = readCache();
  return cached.length ? cached : DEFAULT_PORTRAITS;
}

/** Newest first; one portrait per slot, the latest commission winning. */
export function saveLocalGalleryPortrait(portrait: PortraitItem): PortraitItem[] {
  const kept = readCache().filter(
    (p) => p.id !== portrait.id && p.slotNumber !== portrait.slotNumber,
  );
  const next = [portrait, ...kept].slice(0, MAX);
  writeCache(next);
  return next;
}

/** Remove by slot number (gallery-hall) or by portrait id (wall), per call site. */
export function removeLocalGalleryPortrait(key: string | number): PortraitItem[] {
  const kept =
    typeof key === "number"
      ? readCache().filter((p) => p.slotNumber !== key)
      : readCache().filter((p) => p.id !== key);
  writeCache(kept);
  return kept;
}

/** Restore the wall to the three sovereign frames only. */
export function clearAllCustomPortraits(): PortraitItem[] {
  writeCache(DEFAULT_PORTRAITS);
  return DEFAULT_PORTRAITS;
}

export function getCustomPlayerAvatar(): string | null {
  try {
    return localStorage.getItem(AVATAR_KEY);
  } catch {
    return null;
  }
}

export function setCustomPlayerAvatar(imageUrl: string | null): void {
  try {
    if (!imageUrl) {
      localStorage.removeItem(AVATAR_KEY);
    } else {
      localStorage.setItem(AVATAR_KEY, imageUrl);
    }
  } catch {
    /* Storage unavailable. Non-fatal — avatar is a display nicety. */
  }
  window.dispatchEvent(new CustomEvent("AVATAR_UPDATED", { detail: imageUrl }));
}