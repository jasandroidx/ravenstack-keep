import { useEffect, useRef } from "react";
import type { Turn } from "@/lib/keep/chat";

export type { Turn } from "@/lib/keep/chat";

/**
 * Shared transcript for every agent surface.
 *
 * Each screen used to hold a single answer that the next question destroyed,
 * and reported failure through a toast that vanished — so a failed request
 * left the previous answer sitting there looking current. This keeps the
 * exchange, and keeps errors on screen with their hint.
 */
export function ChatLog({
  turns,
  busy,
  thinkingLabel = "Thinking",
  emptyLabel,
  className = "",
}: {
  turns: Turn[];
  busy?: boolean;
  thinkingLabel?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the exchange grows.
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  if (!turns.length && !busy) {
    return emptyLabel ? <p className={`text-sm text-subtle ${className}`}>{emptyLabel}</p> : null;
  }

  return (
    <div ref={ref} className={`max-h-[26rem] space-y-4 overflow-y-auto pr-2 ${className}`}>
      {turns.map((t, i) => (
        <div key={i}>
          {t.who === "you" ? (
            <p className="text-accent">
              <span className="mr-2 text-[11px] uppercase tracking-[0.18em] opacity-60">You</span>
              {t.text}
            </p>
          ) : t.who === "error" ? (
            <div className="rounded-md border border-[#ff3b3b]/40 bg-[#ff3b3b]/5 px-3 py-2">
              <p className="text-sm text-[#ff3b3b]">{t.text}</p>
              {t.hint ? <p className="mt-1 text-xs text-subtle">{t.hint}</p> : null}
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-muted">{t.text}</p>
              {t.footnote ? (
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-subtle">{t.footnote}</p>
              ) : null}
              {t.meta ? (
                <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-subtle">{t.meta}</p>
              ) : null}
            </>
          )}
        </div>
      ))}
      {busy ? <p className="text-sm italic text-subtle">{thinkingLabel}…</p> : null}
    </div>
  );
}

