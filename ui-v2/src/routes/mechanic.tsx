import { createFileRoute, Link } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { SPECS } from "@/lib/keep/catalog";
import { ReverseEngineerPanel } from "@/components/mechanic/reverse-engineer-panel";

export const Route = createFileRoute("/mechanic")({
  component: MechanicPage,
});

function MechanicPage() {
  const spec = SPECS.mechanic;

  return (
    <KeepShell>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#ffc857] font-mono">Workshop · Valerie — mechanic + reverse-engineer</p>
          </div>
          <h1 className="mt-1 font-display text-4xl md:text-5xl text-fg">Valerie's Mechanic Workbench</h1>
          <p className="mt-2 max-w-2xl text-muted text-sm md:text-base">{spec.purpose}</p>
          <p className="mt-2 max-w-2xl text-muted text-sm">
            Valerie's workbench: mechanic work plus a reverse-engineer panel (REA handler) for your own and open-source targets only. The
            old diagnostic probes and gateway streamer are gone from this page — they pointed at dead ports and stale diagnoses. No health
            board lives here anymore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/rooms/$slug"
            params={{ slug: "workshop" }}
            className="rounded-md border border-[#3a3f4b] bg-surface px-3 py-1.5 text-xs font-mono text-muted hover:border-[#2de2e6] hover:text-[#2de2e6] transition-colors"
          >
            📜 Workshop Room Spec
          </Link>
        </div>
      </div>

      <section className="mb-8">
        <ReverseEngineerPanel />
      </section>
    </KeepShell>
  );
}
