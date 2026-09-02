import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getStackHealth } from "@/lib/keep/server";
import { failing, symptomFor, type StackHealth, type Verdict } from "@/lib/keep/health";

const VERDICT_STYLE: Record<Verdict, { text: string; ring: string; label: string }> = {
  ok: { text: "text-[#39ff14]", ring: "border-[#39ff14]/60 bg-[#39ff14]/10", label: "STEADY" },
  degraded: { text: "text-[#ffc857]", ring: "border-[#ffc857]/60 bg-[#ffc857]/10", label: "DEGRADED" },
  critical: { text: "text-[#ff2a6d]", ring: "border-[#ff2a6d]/60 bg-[#ff2a6d]/10", label: "CRITICAL" },
  unknown: { text: "text-[#9aa3b2]", ring: "border-[#3a3f4b] bg-[#1e222b]/60", label: "UNREAD" },
};

/**
 * The Watchtower beacon.
 *
 * Sentinel watches; Valerie fixes. The tower names what is failing and hands
 * the symptom across — it never diagnoses. That handoff is written into the
 * room specs: Valerie escalates policy findings up here, and this sends wiring
 * findings back down to her bench.
 */
export function WatchtowerBeacon({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<StackHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    getStackHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !health) {
    return <p className="font-mono text-xs text-[#9aa3b2]">Lighting the beacon…</p>;
  }

  const verdict: Verdict = health?.ok ? health.verdict : "unknown";
  const style = VERDICT_STYLE[verdict];
  const bad = health?.ok ? failing(health) : [];

  function sendToValerie() {
    if (!health?.ok) return;
    navigate({ to: "/mechanic", search: { symptom: symptomFor(health) } });
  }

  return (
    <div className={`rounded-lg border p-4 ${style.ring}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${
              verdict === "ok"
                ? "bg-[#39ff14] shadow-[0_0_12px_#39ff14]"
                : verdict === "degraded"
                  ? "bg-[#ffc857] shadow-[0_0_12px_#ffc857] animate-pulse"
                  : verdict === "critical"
                    ? "bg-[#ff2a6d] shadow-[0_0_12px_#ff2a6d] animate-pulse"
                    : "bg-[#6b7280]"
            }`}
          />
          <span className={`font-mono text-sm font-bold tracking-wider ${style.text}`}>
            {style.label}
          </span>
        </div>
        <button
          type="button"
          onClick={load}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9aa3b2] hover:text-[#e8ecf1]"
        >
          Re-read
        </button>
      </div>

      {!health?.ok ? (
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-[#9aa3b2]">
          The tower was not read, so nothing is claimed about the stack. An unread
          tower is not a healthy one.
          {health?.error ? ` ${health.error}` : ""}
        </p>
      ) : bad.length === 0 ? (
        <p className="mt-3 font-mono text-[11px] text-[#9aa3b2]">
          Every subsystem the box reported is answering.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1 font-mono text-[11px]">
            {bad.map((s) => (
              <li key={s.name} className="flex items-baseline gap-2">
                <span className={s.state === "fail" ? "text-[#ff2a6d]" : "text-[#ffc857]"}>
                  {s.state === "fail" ? "✕" : "○"}
                </span>
                <span className="text-[#e8ecf1]">{s.name}</span>
                <span className="text-[#9aa3b2]">{s.detail ?? s.state}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={sendToValerie}
            className="mt-4 inline-flex h-9 items-center rounded-sm border border-[#ffc857]/60 bg-[#ffc857]/10 px-4 font-mono text-xs uppercase tracking-wider text-[#ffc857] transition hover:bg-[#ffc857]/20"
          >
            Send to Valerie
          </button>
          {!compact && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#9aa3b2]">
              The tower watches; the workshop fixes. She receives the observed state
              only — no cause is guessed here, because determining it is her job.
            </p>
          )}
        </>
      )}
    </div>
  );
}
