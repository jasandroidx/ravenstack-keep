import type { PortraitItem } from "./types";
import { DEFAULT_LEGEND_AVATARS } from "./pixel-generator";

const STORAGE_KEY = "ravenstack_gallery_portraits_v1";
const AVATAR_KEY = "ravenstack_player_avatar_custom";

const DEFAULT_PORTRAITS: PortraitItem[] = [
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

export function getLocalGalleryPortraits(): PortraitItem[] {
  if (typeof window === "undefined") return DEFAULT_PORTRAITS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PORTRAITS));
      return DEFAULT_PORTRAITS;
    }
    const parsed = JSON.parse(raw) as PortraitItem[];
    return parsed;
  } catch (err) {
    console.error("Error reading gallery storage:", err);
    return DEFAULT_PORTRAITS;
  }
}

export function saveLocalGalleryPortrait(portrait: PortraitItem): PortraitItem[] {
  if (typeof window === "undefined") return [];
  const current = getLocalGalleryPortraits();
  // Filter out any existing item in the same slot
  const updated = current.filter((p) => p.slotNumber !== portrait.slotNumber);
  updated.push(portrait);
  updated.sort((a, b) => a.slotNumber - b.slotNumber);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("GALLERY_UPDATED", { detail: updated }));
  } catch (err) {
    console.error("Error saving gallery portrait:", err);
  }
  return updated;
}

export function removeLocalGalleryPortrait(slotNumber: number): PortraitItem[] {
  if (typeof window === "undefined") return [];
  const current = getLocalGalleryPortraits();
  const updated = current.filter((p) => p.slotNumber !== slotNumber);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("GALLERY_UPDATED", { detail: updated }));
  } catch (err) {
    console.error("Error removing gallery portrait:", err);
  }
  return updated;
}

export function clearAllCustomPortraits(): PortraitItem[] {
  if (typeof window === "undefined") return [];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PORTRAITS));
    window.dispatchEvent(new CustomEvent("GALLERY_UPDATED", { detail: DEFAULT_PORTRAITS }));
  } catch (err) {
    console.error("Error resetting gallery:", err);
  }
  return DEFAULT_PORTRAITS;
}

export function getCustomPlayerAvatar(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AVATAR_KEY);
}

export function setCustomPlayerAvatar(imageUrl: string | null): void {
  if (typeof window === "undefined") return;
  if (!imageUrl) {
    window.localStorage.removeItem(AVATAR_KEY);
  } else {
    window.localStorage.setItem(AVATAR_KEY, imageUrl);
  }
  window.dispatchEvent(new CustomEvent("AVATAR_UPDATED", { detail: imageUrl }));
}
