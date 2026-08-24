import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { maestroAudio } from "@/lib/gallery/audio";
import { getLocalGalleryPortraits } from "@/lib/gallery/storage";
import { MaestroDialogue } from "./maestro-dialogue";
import { PortraitStudioModal } from "./portrait-studio-modal";
import { PortraitInspectionModal } from "./portrait-inspection-modal";
import { WallManagerModal } from "./wall-manager-modal";
import type { PortraitItem } from "@/lib/gallery/types";
import { cn } from "@/lib/cn";

export function GalleryHall() {
  const [portraits, setPortraits] = useState<PortraitItem[]>([]);
  const [selectedPortrait, setSelectedPortrait] = useState<PortraitItem | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSlot, setStudioSlot] = useState<number>(4);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [wallManagerOpen, setWallManagerOpen] = useState(false);
  const [activePedestal, setActivePedestal] = useState<string | null>(null);

  // Load and subscribe to gallery storage
  useEffect(() => {
    setPortraits(getLocalGalleryPortraits());

    const handleUpdate = () => {
      setPortraits(getLocalGalleryPortraits());
    };

    window.addEventListener("GALLERY_UPDATED", handleUpdate);
    return () => {
      window.removeEventListener("GALLERY_UPDATED", handleUpdate);
    };
  }, []);

  const openStudioForSlot = (slot: number) => {
    setStudioSlot(slot);
    setStudioOpen(true);
    setDialogueOpen(false);
    setWallManagerOpen(false);
    maestroAudio.playSprayCanSound();
  };

  const handleMaestroClick = () => {
    maestroAudio.playSprayCanSound();
    setDialogueOpen(true);
  };

  const handleFrameClick = (slotNumber: number) => {
    const existing = portraits.find((p) => p.slotNumber === slotNumber);
    if (existing) {
      setSelectedPortrait(existing);
      maestroAudio.playArcaneChime();
    } else {
      openStudioForSlot(slotNumber);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#0b0e14] text-[#e8ecf1] select-none">
      {/* Ambient Gothic Stone & Torchlight Canvas */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1e222b] via-[#0b0e14] to-[#05070a]" />

      {/* Stone Wall Masonry Grid Pattern Overlay */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage: `linear-gradient(#3a3f4b 1px, transparent 1px), linear-gradient(90deg, #3a3f4b 1px, transparent 1px)`,
          backgroundSize: "64px 32px",
        }}
      />

      {/* Top Gallery Header Ribbon */}
      <div className="relative z-20 flex flex-wrap items-center justify-between border-b border-[#3a3f4b] bg-[#0b0e14]/85 px-4 py-3 backdrop-blur-md md:px-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏛️</span>
            <h1 className="font-display text-xl tracking-wider text-[#e8ecf1] md:text-2xl">
              The Grand Gallery
            </h1>
            <span className="rounded border border-[#2de2e6]/50 bg-[#2de2e6]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#2de2e6]">
              Live Room
            </span>
          </div>
          <p className="text-xs text-[#9aa3b2]">
            Upper Wall Frame Sanctuary · Royal Cyber-Artisan Maestro Ross · Obsidian Chronicles
          </p>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            type="button"
            onClick={handleMaestroClick}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#2de2e6] bg-[#2de2e6]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#2de2e6] shadow-[0_0_10px_rgba(45,226,230,0.25)] transition-all hover:bg-[#2de2e6]/20 active:scale-95"
          >
            <span>🎨</span>
            <span>Talk to Maestro Ross</span>
          </button>

          <button
            type="button"
            onClick={() => setWallManagerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-3 py-1.5 text-xs uppercase tracking-wider text-[#9aa3b2] transition-colors hover:border-[#e8ecf1] hover:text-[#e8ecf1]"
          >
            <span>🖼️</span>
            <span>Frames ({portraits.length}/8)</span>
          </button>

          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-1.5 text-xs uppercase tracking-wider text-[#9aa3b2] hover:text-[#e8ecf1]"
          >
            <span>← Great Hall</span>
          </Link>
        </div>
      </div>

      {/* Main Panoramic Gothic Hall Viewport */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-8 space-y-12">
        {/* UPPER WALL SECTION: 8 Wall-Mounted Portrait Frames */}
        <div>
          <div className="flex items-center justify-between border-b border-[#3a3f4b] pb-2 mb-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#ffc857] shadow-[0_0_8px_#ffc857]" />
              <h2 className="font-display text-sm uppercase tracking-widest text-[#ffc857]">
                Upper Stone Wall · Wall-Mounted Portrait Frames
              </h2>
            </div>
            <span className="text-[11px] text-[#9aa3b2]">
              Shrouded high-density silhouettes with glowing neon rim channels
            </span>
          </div>

          {/* 8 Upper Wall Frame Slots Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {Array.from({ length: 8 }, (_, idx) => {
              const slotNumber = idx + 1;
              const portrait = portraits.find((p) => p.slotNumber === slotNumber);

              return (
                <div
                  key={slotNumber}
                  onClick={() => handleFrameClick(slotNumber)}
                  className={cn(
                    "group relative flex flex-col items-center justify-between rounded-md border-2 p-3 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm",
                    portrait
                      ? "border-[#3a3f4b] bg-[#161922]/90 hover:border-[#2de2e6] hover:shadow-[0_0_20px_rgba(45,226,230,0.35)] hover:-translate-y-1"
                      : "border-dashed border-[#3a3f4b]/60 bg-[#0b0e14]/40 hover:border-[#ffc857] hover:bg-[#ffc857]/5 hover:-translate-y-0.5"
                  )}
                >
                  {/* Slot Number Indicator */}
                  <div className="flex w-full items-center justify-between text-[10px] font-mono text-[#9aa3b2] mb-1.5">
                    <span>#{slotNumber}</span>
                    {portrait?.isLegendary && (
                      <span className="text-[#ffc857]">★</span>
                    )}
                  </div>

                  {/* Shrouded Pixel Art Canvas Frame */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-[#3a3f4b] bg-[#0b0e14]">
                    {portrait ? (
                      <>
                        {/* Shrouded Blurred Pixel Silhouette with Pulsing Neon Rim */}
                        <img
                          src={portrait.thumbnailUrl || portrait.imageUrl}
                          alt={portrait.subjectName}
                          className="h-full w-full object-cover filter blur-[1.5px] scale-105 group-hover:blur-0 group-hover:scale-100 transition-all duration-300 [image-rendering:pixelated]"
                        />
                        {/* Pulsing Cyan / Magenta Neon Border Halo */}
                        <div className="pointer-events-none absolute inset-0 border border-[#2de2e6]/70 shadow-[inset_0_0_8px_rgba(45,226,230,0.4)] group-hover:border-[#ff2a6d] group-hover:shadow-[inset_0_0_12px_rgba(255,42,109,0.5)] transition-all" />
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-[#9aa3b2]/60">
                        <span className="text-xl mb-1 group-hover:scale-110 transition-transform">➕</span>
                        <span className="text-[9px] uppercase tracking-wider group-hover:text-[#ffc857]">Commission</span>
                      </div>
                    )}
                  </div>

                  {/* Subject Nameplate */}
                  <div className="mt-2 w-full text-center">
                    <p className="font-display text-xs font-semibold text-[#e8ecf1] truncate group-hover:text-[#2de2e6] transition-colors">
                      {portrait ? portrait.subjectName : `Frame #${slotNumber}`}
                    </p>
                    <p className="text-[9px] text-[#9aa3b2] truncate">
                      {portrait ? portrait.arcaneTitle : "Empty Wall Mount"}
                    </p>
                  </div>

                  {/* Hover Proximity Action Pill */}
                  <div className="absolute inset-x-2 bottom-2 translate-y-10 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
                    <div className="rounded-sm bg-[#2de2e6] py-1 text-center text-[9px] font-bold uppercase tracking-wider text-[#0b0e14] shadow-md">
                      {portrait ? "Inspect 🔍" : "Paint 🎨"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER HALL & FLOOR STAGE: Velvet Runner, Pedestals, Maestro Ross at his Easel */}
        <div className="relative rounded-lg border border-[#3a3f4b] bg-[#12161f]/80 p-6 md:p-8 backdrop-blur-md shadow-2xl">
          {/* Torchlight Sconces along walls */}
          <div className="absolute -top-3 left-8 flex items-center gap-1.5 rounded-full border border-[#ffc857]/60 bg-[#0b0e14] px-2.5 py-0.5 shadow-[0_0_12px_rgba(255,200,87,0.4)]">
            <span className="animate-pulse text-xs">🔥</span>
            <span className="text-[10px] font-mono text-[#ffc857]">Amber Torchlight</span>
          </div>

          <div className="absolute -top-3 right-8 flex items-center gap-1.5 rounded-full border border-[#2de2e6]/60 bg-[#0b0e14] px-2.5 py-0.5 shadow-[0_0_12px_rgba(45,226,230,0.4)]">
            <span className="animate-pulse text-xs">⚡</span>
            <span className="text-[10px] font-mono text-[#2de2e6]">Cyan Neon Runes</span>
          </div>

          {/* Purple Velvet Carpet Runner */}
          <div className="relative mx-auto max-w-4xl rounded-sm border-x-2 border-[#ff2a6d]/40 bg-gradient-to-b from-[#2d122e]/80 via-[#3d1a3f]/70 to-[#2d122e]/80 p-6 shadow-inner">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              
              {/* Left & Center: 3 Floor Artifact Pedestals */}
              <div className="md:col-span-8 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🏛️</span>
                  <h3 className="font-display text-sm uppercase tracking-widest text-[#e8ecf1]">
                    Central Stone Pedestals (Reserved for Artifacts)
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "alpha", name: "Pedestal Alpha", status: "Awaiting Runic Relic", icon: "💎" },
                    { id: "beta", name: "Pedestal Beta", status: "Obsidian Seal Intact", icon: "🗝️" },
                    { id: "gamma", name: "Pedestal Gamma", status: "Chamber of Antiquities", icon: "📜" },
                  ].map((ped) => (
                    <div
                      key={ped.id}
                      onClick={() => setActivePedestal(ped.name)}
                      className="group flex flex-col items-center justify-center rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/70 p-4 text-center transition-all hover:border-[#ff2a6d] hover:bg-[#ff2a6d]/10 cursor-pointer"
                    >
                      <div className="relative mb-2 flex h-12 w-12 items-center justify-center rounded-sm border border-[#3a3f4b] bg-[#1e222b] text-2xl group-hover:scale-110 transition-transform">
                        {ped.icon}
                        <div className="absolute -bottom-1 inset-x-2 h-0.5 bg-[#ff2a6d] shadow-[0_0_6px_#ff2a6d]" />
                      </div>
                      <p className="font-display text-xs font-semibold text-[#e8ecf1]">
                        {ped.name}
                      </p>
                      <p className="text-[10px] text-[#9aa3b2] mt-0.5 truncate max-w-full">
                        {ped.status}
                      </p>
                    </div>
                  ))}
                </div>

                {activePedestal && (
                  <div className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14] p-3 text-xs text-[#9aa3b2] flex items-center justify-between">
                    <span>
                      🏛️ <strong className="text-[#e8ecf1]">{activePedestal}:</strong> Reserved for sovereign Keep relics & county audit tokens.
                    </span>
                    <button
                      type="button"
                      onClick={() => setActivePedestal(null)}
                      className="text-[#ff2a6d] text-xs hover:underline ml-2"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Right Corner: Maestro Ross at the Royal Easel */}
              <div className="md:col-span-4 flex flex-col items-center">
                <div 
                  onClick={handleMaestroClick}
                  className="group relative flex flex-col items-center rounded-md border-2 border-[#2de2e6] bg-[#0b0e14] p-5 shadow-[0_0_20px_rgba(45,226,230,0.3)] transition-all hover:scale-105 cursor-pointer text-center"
                >
                  {/* Maestro 16-bit Avatar & Easel Visual */}
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-md border border-[#2de2e6] bg-[#161922] shadow-inner mb-3">
                    <span className="text-4xl filter drop-shadow-[0_0_8px_rgba(45,226,230,0.8)]">
                      🎨
                    </span>
                    {/* Glowing Goggles Accent */}
                    <div className="absolute top-4 left-4 right-4 h-1.5 rounded-full bg-[#2de2e6] shadow-[0_0_8px_#2de2e6]" />
                  </div>

                  <span className="font-display text-base font-bold text-[#2de2e6] group-hover:underline">
                    Maestro Ross
                  </span>
                  <span className="text-xs text-[#ffc857] font-semibold">
                    Royal Cyber-Artisan
                  </span>
                  <span className="mt-1 text-[11px] text-[#9aa3b2] italic">
                    "Happy little runtime anomalies"
                  </span>

                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-[#2de2e6] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0b0e14] shadow-md group-hover:bg-[#2de2e6]/90"
                  >
                    <span>💬</span>
                    <span>Interact</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Quick Navigation Archways at Bottom */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-[#3a3f4b]/60">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-4 py-2 text-xs uppercase tracking-wider text-[#9aa3b2] transition-colors hover:border-[#2de2e6] hover:text-[#2de2e6]"
          >
            <span>🏛️</span>
            <span>Archway to Great Hall</span>
          </Link>

          <Link
            to="/table"
            className="flex items-center gap-2 rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-4 py-2 text-xs uppercase tracking-wider text-[#9aa3b2] transition-colors hover:border-[#ffc857] hover:text-[#ffc857]"
          >
            <span>⚔️</span>
            <span>To The War Table</span>
          </Link>

          <Link
            to="/forge"
            className="flex items-center gap-2 rounded-sm border border-[#3a3f4b] bg-[#1e222b] px-4 py-2 text-xs uppercase tracking-wider text-[#9aa3b2] transition-colors hover:border-[#ff2a6d] hover:text-[#ff2a6d]"
          >
            <span>🔨</span>
            <span>To The Alchemy Forge</span>
          </Link>
        </div>
      </div>

      {/* Modals & Dialogues */}
      {dialogueOpen && (
        <MaestroDialogue
          onCommission={() => {
            setDialogueOpen(false);
            setStudioSlot(4);
            setStudioOpen(true);
          }}
          onChronicle={() => {
            setDialogueOpen(false);
            if (portraits.length > 0) {
              setSelectedPortrait(portraits[0]);
            } else {
              setStudioOpen(true);
            }
          }}
          onManageFrames={() => {
            setDialogueOpen(false);
            setWallManagerOpen(true);
          }}
          onClose={() => setDialogueOpen(false)}
        />
      )}

      {studioOpen && (
        <PortraitStudioModal
          initialSlot={studioSlot}
          existingPortraits={portraits}
          onComplete={(newPortrait) => {
            setStudioOpen(false);
            setSelectedPortrait(newPortrait);
          }}
          onClose={() => setStudioOpen(false)}
        />
      )}

      {selectedPortrait && (
        <PortraitInspectionModal
          portrait={selectedPortrait}
          onUpdate={(updated) => {
            setSelectedPortrait(updated);
          }}
          onRemove={() => {
            setSelectedPortrait(null);
          }}
          onClose={() => setSelectedPortrait(null)}
        />
      )}

      {wallManagerOpen && (
        <WallManagerModal
          portraits={portraits}
          onSelectSlot={(slot) => {
            const item = portraits.find((p) => p.slotNumber === slot);
            if (item) {
              setWallManagerOpen(false);
              setSelectedPortrait(item);
            }
          }}
          onCommissionSlot={(slot) => {
            setWallManagerOpen(false);
            openStudioForSlot(slot);
          }}
          onResetToDefaults={() => {
            setPortraits(getLocalGalleryPortraits());
          }}
          onClose={() => setWallManagerOpen(false)}
        />
      )}
    </div>
  );
}
