import { useState } from "react";
import { toast } from "sonner";
import { maestroAudio } from "@/lib/gallery/audio";
import { setCustomPlayerAvatar, getCustomPlayerAvatar, removeLocalGalleryPortrait, saveLocalGalleryPortrait } from "@/lib/gallery/storage";
import { rerollPortraitLoreServer } from "@/lib/keep/server";
import type { PortraitItem } from "@/lib/gallery/types";
import { cn } from "@/lib/cn";

interface PortraitInspectionModalProps {
  portrait: PortraitItem;
  onUpdate: (updated: PortraitItem) => void;
  onRemove: (slotNumber: number) => void;
  onClose: () => void;
}

export function PortraitInspectionModal({
  portrait,
  onUpdate,
  onRemove,
  onClose,
}: PortraitInspectionModalProps) {
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(() => getCustomPlayerAvatar());
  const [rerolling, setRerolling] = useState(false);
  const [currentLore, setCurrentLore] = useState(portrait.lore);

  const isCurrentAvatar = currentAvatar === portrait.imageUrl;

  const handleDownload = () => {
    if (!portrait.imageUrl) return;
    const link = document.createElement("a");
    link.download = `ravenstack-portrait-slot-${portrait.slotNumber}-${portrait.subjectName.toLowerCase().replace(/\s+/g, "_")}.png`;
    link.href = portrait.imageUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Portrait PNG downloaded.");
  };

  const handleSetAvatar = () => {
    if (isCurrentAvatar) {
      setCustomPlayerAvatar(null);
      setCurrentAvatar(null);
      toast.info("Player avatar reset to default operator.");
    } else {
      setCustomPlayerAvatar(portrait.imageUrl);
      setCurrentAvatar(portrait.imageUrl);
      maestroAudio.playArcaneChime();
      toast.success(`Active player avatar set to ${portrait.subjectName}!`);
    }
  };

  const handleRerollLore = async () => {
    setRerolling(true);
    maestroAudio.playSprayCanSound();
    try {
      const res = await rerollPortraitLoreServer({
        data: {
          id: portrait.id,
          subjectName: portrait.subjectName,
          arcaneTitle: portrait.arcaneTitle,
          customModifier: portrait.customModifier,
          trivia: portrait.trivia,
        },
      });

      if (res.ok && res.lore) {
        setCurrentLore(res.lore);
        const updatedItem: PortraitItem = {
          ...portrait,
          lore: res.lore,
          updatedAt: new Date().toISOString(),
        };
        saveLocalGalleryPortrait(updatedItem);
        onUpdate(updatedItem);
        maestroAudio.playArcaneChime();
        toast.success("Keep Chronicler re-inscribed the lore!");
      } else {
        toast.error("Failed to re-roll lore.");
      }
    } catch {
      toast.error("Lore re-roll connection failed.");
    } finally {
      setRerolling(false);
    }
  };

  const handleRemove = () => {
    if (portrait.isLegendary) {
      if (!confirm("This is a Legendary Sovereign frame. Are you sure you wish to remove it from the wall?")) {
        return;
      }
    }
    removeLocalGalleryPortrait(portrait.slotNumber);
    toast.info(`Slot #${portrait.slotNumber} cleared from the Grand Gallery.`);
    onRemove(portrait.slotNumber);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0b0e14]/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 my-auto w-full max-w-4xl overflow-hidden rounded-md border-2 border-[#3a3f4b] bg-[#1e222b] shadow-2xl ring-1 ring-[#2de2e6]/40">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-[#3a3f4b] bg-[#0b0e14]/90 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="rounded border border-[#ffc857]/50 bg-[#ffc857]/10 px-2 py-0.5 text-xs font-mono font-bold text-[#ffc857]">
              Wall Slot #{portrait.slotNumber}
            </span>
            <span className="font-display text-sm uppercase tracking-widest text-[#9aa3b2]">
              Grand Gallery Inscription
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#3a3f4b] text-[#9aa3b2] transition-colors hover:border-[#ff2a6d] hover:text-[#ff2a6d]"
          >
            ✕
          </button>
        </div>

        {/* Content Columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6">
          {/* Left Column: Framed Portrait & Avatar Actions */}
          <div className="md:col-span-5 flex flex-col items-center">
            {/* Gilded Stone Outer Frame */}
            <div className="relative w-full max-w-[280px] rounded-md border-4 border-[#d4af37] bg-[#0b0e14] p-3 shadow-[0_0_25px_rgba(212,175,55,0.2)]">
              {/* Inner Cyan Rim */}
              <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-[#2de2e6] bg-[#0b0e14]">
                <img
                  src={portrait.imageUrl}
                  alt={portrait.subjectName}
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                />
                {/* Corner Neon Dots */}
                <div className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-[#2de2e6] shadow-[0_0_6px_#2de2e6]" />
                <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#ff2a6d] shadow-[0_0_6px_#ff2a6d]" />
                <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-[#ff2a6d] shadow-[0_0_6px_#ff2a6d]" />
                <div className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[#2de2e6] shadow-[0_0_6px_#2de2e6]" />
              </div>

              {/* Nameplate */}
              <div className="mt-2 text-center border-t border-[#3a3f4b] pt-1.5">
                <p className="font-display text-sm font-semibold tracking-wider text-[#d4af37]">
                  {portrait.subjectName}
                </p>
                <p className="text-[10px] text-[#9aa3b2] truncate">
                  {portrait.arcaneTitle}
                </p>
              </div>
            </div>

            {/* Avatar & Download Buttons */}
            <div className="mt-4 flex flex-col w-full max-w-[280px] gap-2">
              <button
                type="button"
                onClick={handleSetAvatar}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-sm border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
                  isCurrentAvatar
                    ? "border-[#39ff14] bg-[#39ff14]/15 text-[#39ff14]"
                    : "border-[#2de2e6] bg-[#2de2e6]/10 text-[#2de2e6] hover:bg-[#2de2e6]/20"
                )}
              >
                <span>{isCurrentAvatar ? "✓" : "🎭"}</span>
                <span>{isCurrentAvatar ? "Active Player Avatar" : "Set as Player Avatar"}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-2 text-xs uppercase tracking-wider text-[#9aa3b2] transition-colors hover:border-[#e8ecf1] hover:text-[#e8ecf1]"
              >
                <span>💾</span>
                <span>Download Masterwork PNG</span>
              </button>
            </div>
          </div>

          {/* Right Column: Titles & Parchment Lore */}
          <div className="md:col-span-7 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl md:text-3xl text-[#e8ecf1]">
                    {portrait.subjectName}
                  </h1>
                  {portrait.isLegendary && (
                    <span className="rounded border border-[#ffc857] bg-[#ffc857]/10 px-1.5 py-0.5 text-[10px] uppercase font-bold text-[#ffc857]">
                      Legendary
                    </span>
                  )}
                </div>
                <p className="font-display text-sm tracking-wide text-[#2de2e6]">
                  {portrait.arcaneTitle}
                </p>
              </div>

              {/* Metadata Badges */}
              <div className="flex flex-wrap gap-2 text-[11px] text-[#9aa3b2]">
                <span className="rounded border border-[#3a3f4b] bg-[#0b0e14] px-2 py-0.5">
                  📅 Inscribed: {new Date(portrait.createdAt).toLocaleDateString()}
                </span>
                {portrait.customModifier && (
                  <span className="rounded border border-[#ff2a6d]/40 bg-[#ff2a6d]/10 px-2 py-0.5 text-[#ff2a6d]">
                    Twist: {portrait.customModifier}
                  </span>
                )}
              </div>

              {/* Chronicles Parchment Box */}
              <div className="relative rounded-md border-2 border-[#ffc857]/40 bg-[#161922] p-4 shadow-inner">
                <div className="flex items-center justify-between border-b border-[#ffc857]/20 pb-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📜</span>
                    <span className="font-display text-xs font-bold uppercase tracking-widest text-[#ffc857]">
                      Chronicles of the Keep
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#9aa3b2]">
                    Obsidian Ledger Index
                  </span>
                </div>

                <p className="leading-relaxed text-[#e8ecf1] text-sm font-serif italic selection:bg-[#ffc857]/30">
                  {currentLore}
                </p>

                {portrait.trivia && (
                  <div className="mt-3 border-t border-[#3a3f4b] pt-2">
                    <p className="text-[11px] text-[#9aa3b2]">
                      <span className="text-[#ffc857] font-semibold">Real-World Footnote:</span> {portrait.trivia}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#3a3f4b] pt-4">
              <button
                type="button"
                disabled={rerolling}
                onClick={handleRerollLore}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[#ffc857] bg-[#ffc857]/10 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-[#ffc857] transition-all hover:bg-[#ffc857]/20 active:scale-95 disabled:opacity-50"
              >
                <span>📜</span>
                <span>{rerolling ? "Chronicling..." : "Re-Roll Lore"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRemove}
                  className="rounded-sm border border-[#3a3f4b] px-3 py-2 text-xs uppercase tracking-wider text-[#ff2a6d] hover:border-[#ff2a6d] hover:bg-[#ff2a6d]/10 transition-colors"
                >
                  🗑️ Remove from Wall
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-4 py-2 text-xs uppercase tracking-wider text-[#9aa3b2] hover:text-[#e8ecf1]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
