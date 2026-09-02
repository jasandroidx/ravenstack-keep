/**
 * The Grand Gallery.
 *
 * These shapes were reconstructed from their call sites — the module was built
 * in AI Studio and never reached the repo, while portrait-studio-modal.tsx and
 * the commissionPortrait server function (since deleted, recoverable at 6743ca1)
 * did. Field names and optionality match that code exactly.
 */

export type PortraitItem = {
  id: string;
  slotNumber: number;
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
  imageUrl: string;
  thumbnailUrl: string;
  lore: string;
  createdAt: string;
  /**
   * Marks a portrait the slot grid renders as "★ Legend" instead of the
   * subject's name. Read by the modal, never written by the server — it is a
   * display flag, so it stays optional rather than being invented as a column.
   */
  isLegendary?: boolean;
};

/** A commission sent to the studio. The photo, when given, is a data: URL. */
export type CommissionRequest = {
  slotNumber: number;
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
  uploadedPhotoDataUrl?: string;
};

/** Re-roll the lore for a portrait without regenerating its image. */
export type LoreRerollRequest = {
  subjectName: string;
  arcaneTitle: string;
  customModifier?: string;
  trivia?: string;
};
