import { createFileRoute, Link } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { Badge } from "@/components/ui/badge";
import { PLANES, SKILL_SURFACE, SPECS } from "@/lib/keep/catalog";
import { MechanicWorkbench } from "@/components/mechanic/mechanic-workbench";
import { FastMCPGatewayStreamer } from "@/components/mechanic/fastmcp-gateway-streamer";

export const Route = createFileRoute("/mechanic")({ component: MechanicPage });

function MechanicPage() {
  const spec = SPECS.mechanic;

  return (
    <KeepShell>
      {/* Top Banner & Title */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#ffc857] font-mono">
              Workshop · openclaw-mechanic · FastMCP :8100
            </p>
          </div>
          <h1 className="mt-1 font-display text-4xl md:text-5xl text-fg">Valerie's Mechanic Workbench</h1>
          <p className="mt-2 max-w-2xl text-muted text-sm md:text-base">
            {spec.purpose}
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
          <Link
            to="/stack"
            className="rounded-md border border-[#3a3f4b] bg-surface px-3 py-1.5 text-xs font-mono text-muted hover:border-[#ffc857] hover:text-[#ffc857] transition-colors"
          >
            🗺️ Stack Architecture
          </Link>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRIMARY FULL-WIDTH DIAGNOSTIC WORKBENCH (RETRO 16-BIT CRT TERMINAL) */}
      {/* ========================================================================= */}
      <section className="mb-8">
        <MechanicWorkbench />
      </section>

      {/* ========================================================================= */}
      {/* LIVE OPENCLAW GATEWAY LOG STREAMER (FASTMCP tail_gateway_logs) */}
      {/* ========================================================================= */}
      <section className="mb-12">
        <FastMCPGatewayStreamer />
      </section>

      {/* Workshop Planes & Specs Reference */}
      <div className="border-t border-line pt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl">Diagnostic Planes & Skill Surfaces</h2>
            <p className="text-sm text-muted mt-1">
              Hierarchical diagnostic boundaries monitored by Valerie's workshop.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {PLANES.map((p) => (
            <article key={p.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-fg">{p.title}</h3>
                <span className="font-mono text-[10px] text-[#2de2e6] uppercase">PLANE #{p.id}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{p.detail}</p>
            </article>
          ))}
        </div>

        <section className="mt-8">
          <h3 className="font-display text-xl mb-4">Live Skill Surface</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {SKILL_SURFACE.map((s) => (
              <article key={s.name} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <Badge>{s.kind}</Badge>
                  <h4 className="font-display text-base text-fg">{s.name}</h4>
                </div>
                <p className="mt-2 text-xs text-muted">{s.notes}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </KeepShell>
  );
}
