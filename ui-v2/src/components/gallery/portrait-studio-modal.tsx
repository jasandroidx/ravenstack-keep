import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { toast } from "sonner";
import { maestroAudio } from "@/lib/gallery/audio";
import { saveLocalGalleryPortrait } from "@/lib/gallery/storage";
import { commissionPortrait } from "@/lib/keep/server";
import type { PortraitItem } from "@/lib/gallery/types";
import { cn } from "@/lib/cn";

interface PortraitStudioModalProps {
  initialSlot?: number;
  existingPortraits: PortraitItem[];
  onComplete: (portrait: PortraitItem) => void;
  onClose: () => void;
}

const QUICK_MODIFIER_TAGS = [
  "Wicked Witch",
  "Cyber-Necromancer",
  "Iron Blacksmith",
  "Royal Sovereign",
  "Glitch Phantom",
  "Cyber-Vampire",
  "Void Weaver",
  "High Inquisitor",
];

export function PortraitStudioModal({
  initialSlot = 4,
  existingPortraits,
  onComplete,
  onClose,
}: PortraitStudioModalProps) {
  const [slotNumber, setSlotNumber] = useState<number>(initialSlot);
  const [subjectName, setSubjectName] = useState("");
  const [arcaneTitle, setArcaneTitle] = useState("");
  const [customModifier, setCustomModifier] = useState("");
  const [trivia, setTrivia] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressStep, setProgressStep] = useState("Maestro Ross is forging pixels with Imagen 3...");
  const [apiError, setApiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP).");
      return;
    }

    // Read and downscale large image using an offscreen canvas to avoid oversized base64 payloads
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1024;
        let w = img.width;
        let h = img.height;

        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const downscaledUrl = canvas.toDataURL("image/jpeg", 0.88);
          setPhotoDataUrl(downscaledUrl);
        } else {
          setPhotoDataUrl(rawDataUrl);
        }
        maestroAudio.playSprayCanSound();
        toast.info(`Photo loaded & optimized (${w}×${h}px) for pixel transformation.`);
      };
      img.onerror = () => {
        setPhotoDataUrl(rawDataUrl);
        maestroAudio.playSprayCanSound();
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handlePaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!subjectName.trim()) {
      toast.error("Please provide a Subject Name for the portrait.");
      return;
    }
    if (!arcaneTitle.trim()) {
      toast.error("Please provide an Arcane Title (e.g. Sovereign of the West).");
      return;
    }

    setBusy(true);
    const stepText = photoDataUrl
      ? "Maestro Ross is transforming photo with Nano Banana..."
      : "Maestro Ross is forging pixels with Nano Banana...";
    setProgressStep(stepText);
    maestroAudio.playSprayCanSound();

    try {
      // Call server commission function wired to Nano Banana & Imagen 3
      const serverRes = await commissionPortrait({
        data: {
          slotNumber,
          subjectName: subjectName.trim(),
          arcaneTitle: arcaneTitle.trim(),
          customModifier: customModifier.trim() || undefined,
          trivia: trivia.trim() || undefined,
          uploadedPhotoDataUrl: photoDataUrl || undefined,
        },
      });

      if (!serverRes.ok || !serverRes.portrait?.imageUrl) {
        const errMsg = !serverRes.ok && serverRes.error ? serverRes.error : "Nano Banana / Imagen 3 API error: No image returned.";
        setApiError(errMsg);
        toast.error(errMsg);
        return;
      }

      const portraitResult: PortraitItem = {
        ...serverRes.portrait,
        imageUrl: serverRes.portrait.imageUrl,
        thumbnailUrl: serverRes.portrait.imageUrl,
      };

      saveLocalGalleryPortrait(portraitResult);
      maestroAudio.playArcaneChime();

      toast.success(`Portrait of ${subjectName} successfully forged with Nano Banana and mounted to Slot #${slotNumber}!`);
      onComplete(portraitResult);
    } catch (err: unknown) {
      console.error("Studio error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setApiError(`Nano Banana Connection Error: ${errMsg}`);
      toast.error(`Nano Banana Error: ${errMsg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0b0e14]/85 backdrop-blur-md transition-opacity"
        onClick={!busy ? onClose : undefined}
      />

      {/* Modal Container */}
      <div className="relative z-10 my-auto w-full max-w-3xl overflow-hidden rounded-md border-2 border-[#3a3f4b] bg-[#1e222b] shadow-2xl ring-1 ring-[#2de2e6]/40">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3a3f4b] bg-[#0b0e14]/90 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-[#2de2e6] bg-[#0b0e14] text-xl shadow-[0_0_10px_rgba(45,226,230,0.3)]">
              🎨
            </div>
            <div>
              <h2 className="font-display text-xl tracking-wide text-[#e8ecf1]">
                Maestro Ross's Portrait & Lore Studio
              </h2>
              <p className="text-xs text-[#9aa3b2]">
                Image Generation (Nano Banana) · 16-Bit Cyber-Arcane Pixel Synthesis · Keep Chronicler
              </p>
            </div>
          </div>

          {!busy && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#3a3f4b] text-[#9aa3b2] transition-colors hover:border-[#ff2a6d] hover:text-[#ff2a6d]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Studio Form */}
        <form onSubmit={handlePaint} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* API Error Display Banner */}
          {apiError && (
            <div className="rounded-sm border-2 border-[#ff3b3b] bg-[#0b0e14] p-4 text-left shadow-[0_0_15px_rgba(255,59,59,0.3)]">
              <div className="flex items-start gap-3">
                <span className="text-2xl text-[#ff3b3b]">⚠️</span>
                <div>
                  <h3 className="text-sm font-bold text-[#ff3b3b] uppercase tracking-wider">
                    Nano Banana Generation Error
                  </h3>
                  <p className="mt-1 text-xs font-mono text-[#e8ecf1] break-all">
                    {apiError}
                  </p>
                  <p className="mt-2 text-[11px] text-[#9aa3b2]">
                    Please verify your API key quota or parameters. The studio refuses procedural canvas fallbacks to guarantee authentic Nano Banana pixel art synthesis.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Target Wall Slot Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] mb-2">
              1. Choose Gallery Wall Slot (1 — 8)
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => {
                const occupied = existingPortraits.find((p) => p.slotNumber === slot);
                const isSelected = slotNumber === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSlotNumber(slot);
                      maestroAudio.playSprayCanSound();
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded-sm border transition-all text-xs",
                      isSelected
                        ? "border-[#2de2e6] bg-[#2de2e6]/20 text-[#2de2e6] ring-1 ring-[#2de2e6]"
                        : occupied
                        ? "border-[#3a3f4b] bg-[#0b0e14]/60 text-[#e8ecf1] hover:border-[#ffc857]"
                        : "border-[#3a3f4b]/60 bg-[#0b0e14]/30 text-[#9aa3b2] hover:border-[#2de2e6]/50"
                    )}
                  >
                    <span className="font-mono font-bold">#{slot}</span>
                    <span className="text-[9px] truncate max-w-full text-center mt-0.5">
                      {occupied ? (occupied.isLegendary ? "★ Legend" : occupied.subjectName.slice(0, 6)) : "Empty"}
                    </span>
                  </button>
                );
              })}
            </div>
            {existingPortraits.some((p) => p.slotNumber === slotNumber) && (
              <p className="mt-1 text-[11px] text-[#ffc857]">
                ⚠️ Slot #{slotNumber} is currently occupied and will be replaced on commission.
              </p>
            )}
          </div>

          {/* Photo Upload Area */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] mb-2">
              2. Upload Photo or Selfie (Optional — Facial Preservation Contract)
            </label>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-sm border-2 border-dashed p-4 transition-all cursor-pointer",
                isDragging
                  ? "border-[#2de2e6] bg-[#2de2e6]/10"
                  : photoDataUrl
                  ? "border-[#39ff14] bg-[#0b0e14]/80"
                  : "border-[#3a3f4b] bg-[#0b0e14]/50 hover:border-[#2de2e6]/60"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onInputChange}
                className="hidden"
                disabled={busy}
              />

              {photoDataUrl ? (
                <div className="flex items-center gap-4 w-full">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-sm border border-[#39ff14]">
                    <img
                      src={photoDataUrl}
                      alt="Source Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#39ff14]">
                      ✓ Photo Loaded for Imagen 3 Pixel Synthesis
                    </p>
                    <p className="text-xs text-[#9aa3b2] mt-0.5">
                      Facial geometry and features will be preserved under the cyber-arcane palette.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotoDataUrl(null);
                      }}
                      className="mt-2 text-xs text-[#ff2a6d] hover:underline"
                    >
                      Remove Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <span className="text-3xl">📸</span>
                  <p className="mt-1 text-sm text-[#e8ecf1]">
                    Drag and drop a photo here, or <span className="text-[#2de2e6] underline">browse</span>
                  </p>
                  <p className="text-xs text-[#9aa3b2] mt-0.5">
                    Supports selfies, friends, avatars (PNG, JPG, WebP)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Name and Title Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] mb-1">
                Subject Name *
              </label>
              <input
                type="text"
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. Jason Boyd, Lord Malakor, Alice"
                disabled={busy}
                className="w-full rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#9aa3b2]/50 focus:border-[#2de2e6] focus:outline-none focus:ring-1 focus:ring-[#2de2e6]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] mb-1">
                Arcane Title *
              </label>
              <input
                type="text"
                required
                value={arcaneTitle}
                onChange={(e) => setArcaneTitle(e.target.value)}
                placeholder="e.g. The Sovereign Architect, Grand Scribe"
                disabled={busy}
                className="w-full rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#9aa3b2]/50 focus:border-[#2de2e6] focus:outline-none focus:ring-1 focus:ring-[#2de2e6]"
              />
            </div>
          </div>

          {/* Custom Modifier / Quick Tags */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] mb-1">
              Custom Theme / Arcane Twist (Optional)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_MODIFIER_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCustomModifier((prev) => (prev ? `${prev}, ${tag}` : tag));
                    maestroAudio.playSprayCanSound();
                  }}
                  className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14]/60 px-2 py-0.5 text-[11px] text-[#9aa3b2] transition-colors hover:border-[#2de2e6] hover:text-[#2de2e6]"
                >
                  +{tag}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={customModifier}
              onChange={(e) => setCustomModifier(e.target.value)}
              placeholder="e.g. Cyber-Necromancer with glowing skull implants, purple velvet mantle, and dithered neon aura"
              disabled={busy}
              className="w-full rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#9aa3b2]/50 focus:border-[#2de2e6] focus:outline-none focus:ring-1 focus:ring-[#2de2e6]"
            />
          </div>

          {/* Real World Facts / Trivia / Inside Jokes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#9aa3b2] mb-1">
              Real-World Facts / Trivia / Inside Jokes (Optional — Keep Lore Weaving)
            </label>
            <textarea
              rows={2}
              value={trivia}
              onChange={(e) => setTrivia(e.target.value)}
              placeholder="e.g. Always burns coffee at 3 AM; once audited 92 Indiana counties in a single weekend; refuses to use light mode."
              disabled={busy}
              className="w-full rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#9aa3b2]/50 focus:border-[#ffc857] focus:outline-none focus:ring-1 focus:ring-[#ffc857]"
            />
            <p className="mt-1 text-[11px] text-[#9aa3b2]">
              The Keep Chronicler will translate your real-world facts into legendary cyber-arcane history.
            </p>
          </div>

          {/* Busy Progress Indicator with exact text */}
          {busy && (
            <div className="rounded-sm border-2 border-[#2de2e6] bg-[#0b0e14] p-5 text-center shadow-[0_0_20px_rgba(45,226,230,0.25)]">
              <div className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full border-2 border-[#2de2e6] border-t-transparent animate-spin">
                <span className="text-xl">✨</span>
              </div>
              <p className="font-display text-base font-bold text-[#2de2e6] tracking-wide">
                {progressStep}
              </p>
              <p className="text-xs text-[#9aa3b2] mt-1.5 font-mono">
                Model: Image Generation (Nano Banana / Gemini Flash Image) · High-Density 16/32-bit Chiaroscuro
              </p>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 border-t border-[#3a3f4b] pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-sm border border-[#3a3f4b] bg-[#0b0e14] px-4 py-2 text-xs uppercase tracking-wider text-[#9aa3b2] hover:text-[#e8ecf1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-sm bg-[#2de2e6] px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-[#0b0e14] shadow-[0_0_15px_rgba(45,226,230,0.4)] transition-all hover:bg-[#2de2e6]/90 active:scale-95 disabled:opacity-50"
            >
              <span>🎨</span>
              <span>{busy ? "Forging Pixels..." : "Forge & Mount Portrait"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
