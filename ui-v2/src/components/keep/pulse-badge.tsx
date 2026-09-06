import { useEffect, useState } from "react";
import { getKeepSnapshot } from "@/lib/keep/server";
import type { KeepPulse } from "@/lib/keep/pulse";

export function PulseBadge() {
  const [pulse, setPulse] = useState<KeepPulse | null>(null);

  useEffect(() => {
    let alive = true;
    getKeepSnapshot()
      .then((snap) => {
        if (alive) setPulse(snap.pulse);
      })
      .catch(() => {
        if (alive) setPulse(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!pulse) {
    return <span className="hidden text-subtle sm:inline">pulse…</span>;
  }

  const live = pulse.source === "live";
  return (
    <span
      className="hidden items-center gap-2 text-xs uppercase tracking-[0.14em] sm:inline-flex"
      title={pulse.note ?? pulse.networkDetail}
    >
      <span className={live ? "text-[#39ff14]" : "text-[#ffc857]"}>{pulse.source}</span>
      <span className="text-subtle">
        {pulse.agentsActive} active · queue {pulse.queue.status}
      </span>
    </span>
  );
}
