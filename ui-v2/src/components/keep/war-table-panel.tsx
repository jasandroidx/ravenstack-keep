import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getPendingGates, decideGate } from "@/lib/keep/server";
import { riskLabel, type Gate, type GateEffect, type GatesSnapshot } from "@/lib/keep/gates";

const RISK_STYLE: Record<string, string> = {
  high: "border-[#ff2a6d]/60 bg-[#ff2a6d]/10 text-[#ff2a6d]",
  medium: "border-[#ffc857]/60 bg-[#ffc857]/10 text-[#ffc857]",
  low: "border-[#2de2e6]/60 bg-[#2de2e6]/10 text-[#2de2e6]",
};

/**
 * The effect of a decision, rendered before it can be taken. The operator
 * approves this, not a description of an intention.
 */
function EffectPreview({ effect }: { effect: GateEffect }) {
  return (
    <div className="mt-3 rounded-sm border border-[#1e222b] bg-[#05020d] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9aa3b2]">
        What sealing this does
      </p>
      <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-[#e8ecf1]">
        {effect.consequence}
      </p>
      {effect.bounds && (
        <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-[#9aa3b2]">
          {effect.bounds}
        </p>
      )}
      <pre className="mt-2 overflow-x-auto border-t border-[#1e222b] pt-2 font-mono text-[10px] leading-relaxed text-[#2de2e6]">
{effect.tool}({JSON.stringify(effect.args, null, 2)})
      </pre>
    </div>
  );
}

function GateCard({ gate, onDone }: { gate: Gate; onDone: () => void }) {
  // Two-step. The first press arms; only the second sends confirm: true.
  const [armed, setArmed] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(effect: GateEffect) {
    setBusy(true);
    try {
      const out = await decideGate({
        data: { tool: effect.tool as never, args: { ...effect.args, confirm: true } },
      });
      if (out.ok) {
        toast.success("Sealed. The box has it.");
        onDone();
      } else {
        toast.error(out.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gate decision failed");
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  const effect = armed === "reject" ? gate.reject : gate.approve;

  return (
    <article className="rounded-lg border border-[#3a3f4b] bg-[#0b0e14] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-mono text-sm font-bold text-[#e8ecf1]">{gate.title}</h3>
          <p className="mt-1 font-mono text-[11px] text-[#9aa3b2]">{gate.detail}</p>
        </div>
        <span
          className={`shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
            RISK_STYLE[gate.risk] ?? RISK_STYLE.low
          }`}
        >
          {riskLabel(gate.risk)} RISK
        </span>
      </div>

      {armed && effect ? (
        <>
          <EffectPreview effect={effect} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(effect)}
              className="inline-flex h-9 items-center rounded-sm bg-[#39ff14] px-4 font-mono text-xs font-bold uppercase tracking-wider text-[#0b0e14] transition hover:bg-[#39ff14]/90 disabled:opacity-50"
            >
              {busy ? "Sealing…" : `Confirm ${armed}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setArmed(null)}
              className="inline-flex h-9 items-center rounded-sm border border-[#3a3f4b] px-4 font-mono text-xs uppercase tracking-wider text-[#9aa3b2] hover:text-[#e8ecf1]"
            >
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setArmed("approve")}
            className="inline-flex h-9 items-center rounded-sm border border-[#39ff14]/60 bg-[#39ff14]/10 px-4 font-mono text-xs uppercase tracking-wider text-[#39ff14] hover:bg-[#39ff14]/20"
          >
            Review to seal
          </button>
          {gate.reject && (
            <button
              type="button"
              onClick={() => setArmed("reject")}
              className="inline-flex h-9 items-center rounded-sm border border-[#3a3f4b] px-4 font-mono text-xs uppercase tracking-wider text-[#9aa3b2] hover:text-[#e8ecf1]"
            >
              Review to refuse
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function WarTablePanel() {
  const [snap, setSnap] = useState<GatesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getPendingGates()
      .then(setSnap)
      .catch(() => setSnap(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading && !snap) {
    return <p className="mt-3 font-mono text-sm text-[#9aa3b2]">Reading the table…</p>;
  }

  if (!snap || !snap.ok) {
    return (
      <div className="mt-3 rounded-sm border border-[#ffc857]/50 bg-[#ffc857]/5 p-4">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#ffc857]">
          ⚠ Bridge unreachable — the table is unread
        </p>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-[#9aa3b2]">
          No gates are shown because none were retrieved. An empty table here would
          be a claim that nothing is pending, and that claim has not been verified.
        </p>
        {snap?.error && (
          <p className="mt-2 font-mono text-[11px] text-[#9aa3b2]">{snap.error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9aa3b2]">
        <span>
          {snap.gates.length} pending · read {new Date(snap.asOf).toLocaleTimeString()}
        </span>
        <button type="button" onClick={load} className="hover:text-[#e8ecf1]">
          Re-read
        </button>
      </div>

      {snap.countyQueue && (
        <p className="mt-2 font-mono text-[11px] text-[#9aa3b2]">
          County queue: <span className="text-[#e8ecf1]">{snap.countyQueue.status}</span> at
          cursor {snap.countyQueue.cursor}
          {snap.countyQueue.pendingReview ? "" : " · nothing awaiting review"}
        </p>
      )}

      {snap.gates.length === 0 ? (
        <p className="mt-4 font-mono text-sm text-[#9aa3b2]">
          The table is clear. Nothing is waiting on your seal.
        </p>
      ) : (
        <div className="mt-4 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
          {snap.gates.map((g) => (
            <GateCard key={g.id} gate={g} onDone={load} />
          ))}
        </div>
      )}

      {snap.rule && (
        <p className="mt-4 border-t border-[#1e222b] pt-3 font-mono text-[10px] leading-relaxed text-[#9aa3b2]">
          Box rule: {snap.rule}
        </p>
      )}
    </div>
  );
}
