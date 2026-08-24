import { useState } from "react";
import { maestroAudio } from "@/lib/gallery/audio";

interface MaestroDialogueProps {
  onCommission: () => void;
  onChronicle: () => void;
  onManageFrames: () => void;
  onClose: () => void;
}

const MAESTRO_QUOTES = [
  "There are no bugs in this code, friend. Just happy little runtime anomalies.",
  "Let's shake the canister and tap some happy little cyan pixels right onto the slate.",
  "Just beat the canister against the easel. Tap-tap-tap. That's where the magic happens.",
  "We don't make mistakes in the Keep, just happy little glitch accidents.",
  "A little bit of #2de2e6 cyan neon right over the obsidian masonry... feels right at home.",
  "Every line of stone has a soul. Every pixel on this wall tells a sovereign's story.",
];

export function MaestroDialogue({
  onCommission,
  onChronicle,
  onManageFrames,
  onClose,
}: MaestroDialogueProps) {
  const [quoteIndex, setQuoteIndex] = useState(() =>
    Math.floor(Math.random() * MAESTRO_QUOTES.length)
  );

  const handleRattleCan = () => {
    maestroAudio.playSprayCanSound();
    setQuoteIndex((prev) => (prev + 1) % MAESTRO_QUOTES.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0b0e14]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Stone Bordered Dialogue Panel */}
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-md border-2 border-[#3a3f4b] bg-[#1e222b] shadow-2xl ring-1 ring-[#2de2e6]/30">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-[#3a3f4b] bg-[#0b0e14]/90 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-sm border border-[#2de2e6] bg-[#0b0e14] shadow-[0_0_10px_rgba(45,226,230,0.35)]">
              {/* 16-bit Afro & Goggles Avatar */}
              <div className="text-xl">🎨</div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg tracking-wide text-[#e8ecf1]">
                  Maestro Ross
                </h2>
                <span className="rounded border border-[#2de2e6]/50 bg-[#2de2e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2de2e6]">
                  Royal Cyber-Artisan
                </span>
              </div>
              <p className="text-xs text-[#9aa3b2]">
                Master of Pigments, Canister Aerosols & Keep Lore
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

        {/* Dialogue Body */}
        <div className="space-y-4 p-5">
          {/* Quote Speech Bubble */}
          <div className="relative rounded-md border border-[#3a3f4b] bg-[#0b0e14]/80 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl text-[#2de2e6]">“</span>
              <p className="italic leading-relaxed text-[#e8ecf1]">
                {MAESTRO_QUOTES[quoteIndex]}
              </p>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleRattleCan}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-2.5 py-1 text-xs text-[#2de2e6] transition-all hover:border-[#2de2e6] hover:bg-[#2de2e6]/10 active:scale-95"
              >
                <span>🔊</span>
                <span>Shake Canister (Rattle & Hiss)</span>
              </button>
            </div>
          </div>

          {/* Action Choices */}
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9aa3b2]">
              Select Dialogue Option:
            </p>

            <button
              type="button"
              onClick={() => {
                maestroAudio.playSprayCanSound();
                onCommission();
              }}
              className="group flex w-full items-center justify-between rounded-sm border border-[#2de2e6]/50 bg-[#2de2e6]/10 p-3.5 text-left transition-all hover:border-[#2de2e6] hover:bg-[#2de2e6]/20 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl group-hover:scale-110 transition-transform">🎨</span>
                <div>
                  <div className="font-display text-sm text-[#2de2e6]">
                    [1] Commission a New Portrait (Easel Studio)
                  </div>
                  <div className="text-xs text-[#9aa3b2]">
                    Upload a portrait or selfie, choose cyber-arcane twists, and paint high-density pixel art.
                  </div>
                </div>
              </div>
              <span className="text-xs text-[#2de2e6] opacity-60 group-hover:opacity-100">
                Enter Studio →
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                maestroAudio.playSprayCanSound();
                onChronicle();
              }}
              className="group flex w-full items-center justify-between rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/60 p-3.5 text-left transition-all hover:border-[#ffc857] hover:bg-[#ffc857]/10 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl group-hover:scale-110 transition-transform">📜</span>
                <div>
                  <div className="font-display text-sm text-[#ffc857]">
                    [2] Chronicle & Re-Roll Lore
                  </div>
                  <div className="text-xs text-[#9aa3b2]">
                    Weave new sovereign tales, inside jokes, and Obsidian Ledger histories for hung portraits.
                  </div>
                </div>
              </div>
              <span className="text-xs text-[#ffc857] opacity-60 group-hover:opacity-100">
                Forge Lore →
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                maestroAudio.playSprayCanSound();
                onManageFrames();
              }}
              className="group flex w-full items-center justify-between rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/60 p-3.5 text-left transition-all hover:border-[#ff2a6d] hover:bg-[#ff2a6d]/10 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl group-hover:scale-110 transition-transform">🖼️</span>
                <div>
                  <div className="font-display text-sm text-[#ff2a6d]">
                    [3] Manage / Clear Wall Frames
                  </div>
                  <div className="text-xs text-[#9aa3b2]">
                    Inspect all 8 wall slots, rearrange gallery mounts, or clear custom commissions.
                  </div>
                </div>
              </div>
              <span className="text-xs text-[#ff2a6d] opacity-60 group-hover:opacity-100">
                Inspect Frames →
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-between rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/40 p-3 text-left transition-all hover:border-[#9aa3b2] hover:text-[#e8ecf1]"
            >
              <div className="flex items-center gap-3">
                <span>🚪</span>
                <span className="text-sm text-[#9aa3b2]">[4] Take your leave</span>
              </div>
              <span className="text-xs text-[#9aa3b2]">Esc</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
