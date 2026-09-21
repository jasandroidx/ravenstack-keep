import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeepShell } from "@/components/keep/shell";
import { Button } from "@/components/ui/button";
import { PortraitStudioModal } from "@/components/gallery/portrait-studio-modal";
import { loadLocalGalleryPortraits, saveLocalGalleryPortrait } from "@/lib/gallery/storage";
import type { PortraitItem } from "@/lib/gallery/types";

export const Route = createFileRoute("/gallery")({ component: GalleryPage });

/** Eight sovereign wall frames, per Raziel's description of the room. */
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

function GalleryPage() {
  const [portraits, setPortraits] = useState<PortraitItem[]>([]);
  const [studioSlot, setStudioSlot] = useState<number | null>(null);

  // Portraits are cached per-viewer; the server copy in gallery_portraits is
  // the durable record. Read after mount so SSR never touches localStorage.
  useEffect(() => {
    setPortraits(loadLocalGalleryPortraits());
  }, []);

  const bySlot = new Map(portraits.map((p) => [p.slotNumber, p]));

  return (
    <KeepShell>
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Great Hall · the archway</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">The Grand Gallery</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Eight sovereign wall frames. Maestro Ross forges each portrait and writes its
        lore. Empty frames stay empty — the wall shows what has been commissioned,
        not what could be.
      </p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map((slot) => {
          const p = bySlot.get(slot);
          return (
            <article
              key={slot}
              className={`group relative aspect-[3/4] overflow-hidden rounded-lg border ${
                p ? "border-[#ffc857]/40" : "border-line border-dashed"
              } bg-surface`}
            >
              {p ? (
                <>
                  <img
                    src={p.imageUrl}
                    alt={`${p.subjectName}, ${p.arcaneTitle}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0e14] to-transparent p-3">
                    <p className="font-display text-lg leading-tight text-fg">{p.subjectName}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ffc857]">
                      {p.arcaneTitle}
                    </p>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setStudioSlot(slot)}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 text-subtle transition hover:text-fg"
                >
                  <span className="font-mono text-2xl">#{slot}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                    Empty frame
                  </span>
                </button>
              )}
            </article>
          );
        })}
      </section>

      <div className="mt-8">
        <Button
          type="button"
          onClick={() => setStudioSlot(SLOTS.find((s) => !bySlot.has(s)) ?? 1)}
        >
          Commission a portrait
        </Button>
      </div>

      {studioSlot != null && (
        <PortraitStudioModal
          initialSlot={studioSlot}
          existingPortraits={portraits}
          onClose={() => setStudioSlot(null)}
          onComplete={(portrait) => {
            saveLocalGalleryPortrait(portrait);
            setPortraits(loadLocalGalleryPortraits());
            setStudioSlot(null);
          }}
        />
      )}
    </KeepShell>
  );
}
