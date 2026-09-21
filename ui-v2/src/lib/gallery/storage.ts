import type { PortraitItem } from "./types";

/**
 * Per-viewer portrait cache.
 *
 * The commission already writes to gallery_portraits server-side; this is the
 * local mirror so a freshly forged portrait appears on the wall without a
 * round trip. Browser storage can throw outright (private windows, blocked
 * site data), so every access is guarded and a failure is silent — a portrait
 * that cannot be cached is not an error worth interrupting the operator for.
 */

const KEY = "ravenstack.gallery.portraits";
const MAX = 32;

export function loadLocalGalleryPortraits(): PortraitItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PortraitItem[]) : [];
  } catch {
    return [];
  }
}

/** Newest first; one portrait per slot, the latest commission winning. */
export function saveLocalGalleryPortrait(portrait: PortraitItem): void {
  try {
    const kept = loadLocalGalleryPortraits().filter(
      (p) => p.id !== portrait.id && p.slotNumber !== portrait.slotNumber,
    );
    localStorage.setItem(KEY, JSON.stringify([portrait, ...kept].slice(0, MAX)));
  } catch {
    /* Storage unavailable or full. The server copy is the real record. */
  }
}

export function removeLocalGalleryPortrait(id: string): void {
  try {
    const kept = loadLocalGalleryPortraits().filter((p) => p.id !== id);
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* As above. */
  }
}
