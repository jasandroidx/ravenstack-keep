import { createFileRoute } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { GalleryHall } from "@/components/gallery/gallery-hall";

export const Route = createFileRoute("/gallery")({ component: GalleryPage });

function GalleryPage() {
  return (
    <KeepShell bleed>
      <GalleryHall />
    </KeepShell>
  );
}
