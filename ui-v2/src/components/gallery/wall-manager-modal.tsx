import { useState } from "react";
import { toast } from "sonner";
import { maestroAudio } from "@/lib/gallery/audio";
import { clearAllCustomPortraits } from "@/lib/gallery/storage";
import type { PortraitItem } from "@/lib/gallery/types";
import { cn } from "@/lib/cn";

interface WallManagerModalProps {
  portraits: PortraitItem[];
  onSelectSlot: (slot: number) => void;
  onCommissionSlot: (slot: number) => void;
  onResetToDefaults: () => void;
  onClose: () => void;
}

export function WallManagerModal({
  portraits,
  onSelectSlot,
  onCommissionSlot,
  onResetToDefaults,
  onClose,
}: WallManagerModalProps) {
  const [activeTab, setActiveTab] = useState<"all" | "empty" | "occupied">("all");

  const slots = Array.from({ length: 8 }, (_, i) => {
    const slotNum = i + 1;
    const item = portraits.find((p) => p.slotNumber === slotNum);
    return {
      slotNum,
      item,
    };
  });

  const filteredSlots = slots.filter((s) => {
    if (activeTab === "empty") return !s.item;
    if (activeTab === "occupied") return Boolean(s.item);
    return true;
  });

  const handleReset = () => {
    if (confirm("Reset gallery wall to the 3 default Sovereign Legends (Jason Boyd, Valerie, Raziel)?")) {
      clearAllCustomPortraits();
      onResetToDefaults();
      maestroAudio.playArcaneChime();
      toast.success("Gallery reset to Sovereign Legends.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0b0e14]/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 my-auto w-full max-w-4xl overflow-hidden rounded-md border-2 border-[#3a3f4b] bg-[#1e222b] shadow-2xl ring-1 ring-[#ff2a6d]/30">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3a3f4b] bg-[#0b0e14]/90 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-[#ff2a6d] bg-[#0b0e14] text-xl shadow-[0_0_10px_rgba(255,42,109,0.3)]">
              🖼️
            </div>
            <div>
              <h2 className="font-display text-xl tracking-wide text-[#e8ecf1]">
                Grand Gallery Wall Frame Roster
              </h2>
              <p className="text-xs text-[#9aa3b2]">
                8 Wall Frame Mounts · High-Density Silhouettes · Slot Management
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#3a3f4b] text-[#9aa3b2] transition-colors hover:border-[#ff2a6d] hover:text-[#ff2a6d]"
          >
            ✕
          </button>
        </div>

        {/* Filter Bar & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3a3f4b] bg-[#161922] px-6 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors",
                activeTab === "all"
                  ? "bg-[#2de2e6]/20 text-[#2de2e6] border border-[#2de2e6]"
                  : "text-[#9aa3b2] hover:text-[#e8ecf1]"
              )}
            >
              All Frames (8)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("occupied")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors",
                activeTab === "occupied"
                  ? "bg-[#2de2e6]/20 text-[#2de2e6] border border-[#2de2e6]"
                  : "text-[#9aa3b2] hover:text-[#e8ecf1]"
              )}
            >
              Mounted ({portraits.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("empty")}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors",
                activeTab === "empty"
                  ? "bg-[#2de2e6]/20 text-[#2de2e6] border border-[#2de2e6]"
                  : "text-[#9aa3b2] hover:text-[#e8ecf1]"
              )}
            >
              Available ({8 - portraits.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-1 text-xs text-[#ff2a6d] hover:border-[#ff2a6d] transition-colors"
          >
            ↺ Restore Sovereign Defaults
          </button>
        </div>

        {/* Slots Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 max-h-[60vh] overflow-y-auto">
          {filteredSlots.map(({ slotNum, item }) => {
            return (
              <div
                key={slotNum}
                className={cn(
                  "relative flex flex-col rounded-sm border p-3 transition-all",
                  item
                    ? "border-[#3a3f4b] bg-[#0b0e14]/70 hover:border-[#2de2e6] hover:shadow-[0_0_15px_rgba(45,226,230,0.2)]"
                    : "border-dashed border-[#3a3f4b]/60 bg-[#0b0e14]/30 hover:border-[#ffc857]"
                )}
              >
                {/* Slot Badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-[#9aa3b2]">
                    Slot #{slotNum}
                  </span>
                  {item?.isLegendary && (
                    <span className="rounded bg-[#ffc857]/20 px-1 py-0.2 text-[9px] font-bold text-[#ffc857]">
                      LEGEND
                    </span>
                  )}
                </div>

                {/* Portrait Preview or Placeholder */}
                <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-[#3a3f4b] bg-[#0b0e14]">
                  {item ? (
                    <img
                      src={item.imageUrl}
                      alt={item.subjectName}
                      className="h-full w-full object-contain [image-rendering:pixelated]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-[#9aa3b2]/50 p-2 text-center">
                      <span className="text-2xl mb-1 opacity-40">🖼️</span>
                      <span className="text-[10px] uppercase tracking-wider">Unclaimed Wall Frame</span>
                    </div>
                  )}
                </div>

                {/* Details & Actions */}
                <div className="mt-2 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="font-display text-sm font-semibold text-[#e8ecf1] truncate">
                      {item ? item.subjectName : `Frame Slot #${slotNum}`}
                    </p>
                    <p className="text-[11px] text-[#9aa3b2] truncate">
                      {item ? item.arcaneTitle : "Ready for commission"}
                    </p>
                  </div>

                  <div className="mt-3 flex gap-1.5">
                    {item ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSlot(slotNum);
                        }}
                        className="w-full rounded-sm border border-[#2de2e6]/60 bg-[#2de2e6]/10 py-1 text-[11px] font-semibold text-[#2de2e6] hover:bg-[#2de2e6]/20 transition-colors"
                      >
                        Inspect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onCommissionSlot(slotNum);
                        }}
                        className="w-full rounded-sm border border-[#ffc857]/60 bg-[#ffc857]/10 py-1 text-[11px] font-semibold text-[#ffc857] hover:bg-[#ffc857]/20 transition-colors"
                      >
                        + Paint
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#3a3f4b] bg-[#0b0e14]/90 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-[#3a3f4b] px-4 py-1.5 text-xs uppercase tracking-wider text-[#9aa3b2] hover:text-[#e8ecf1]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
