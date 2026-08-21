import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeepShell } from "@/components/keep/shell";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLANES, SKILL_SURFACE, SPECS } from "@/lib/keep/catalog";
import { runInspection } from "@/lib/keep/server";

export const Route = createFileRoute("/mechanic")({ component: MechanicPage });

function MechanicPage() {
  const spec = SPECS.mechanic;
  const [concern, setConcern] = useState(
    "Diagnose why a stack health check that calls openclaw mcp list can deadlock a single-worker streamable-http MCP.",
  );
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState<string | null>(null);

  async function onDiagnose(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await runInspection({ data: { kind: "mechanic", concern } });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      setFinding(out.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Diagnosis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeepShell>
      <img
        src="/workshop.jpg"
        alt="Workshop — iron, tools, cyan conduit"
        className="mb-8 h-48 w-full rounded-xl border border-line object-cover md:h-64"
      />
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Workshop · openclaw-mechanic</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">Valerie</h1>
      <p className="mt-3 max-w-2xl text-muted">{spec.purpose}</p>
      <p className="mt-4 max-w-2xl text-sm text-subtle">{spec.character}</p>
      <Link to="/rooms/$slug" params={{ slug: "workshop" }} className="mt-4 inline-block text-sm text-muted hover:text-fg">
        Full Agent Spec
      </Link>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Planes</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {PLANES.map((p) => (
            <article key={p.id} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="font-display text-xl">{p.title}</h3>
              <p className="mt-2 text-sm text-muted">{p.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Skill surface</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {SKILL_SURFACE.map((s) => (
            <article key={s.name} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <Badge>{s.kind}</Badge>
                <h3 className="font-display text-xl">{s.name}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{s.notes}</p>
            </article>
          ))}
        </div>
      </section>

      <form onSubmit={onDiagnose} className="mt-10">
        <SignInGate prompt="Sign in to run a Valerie diagnosis. Checklists only — nothing executes.">
          <div className="rounded-xl border border-line bg-surface p-5">
            <label className="text-sm text-muted">Concern</label>
            <textarea
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              rows={4}
              className="mt-3 w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Listening…" : "Diagnose"}
              </Button>
            </div>
          </div>
        </SignInGate>
      </form>

      {finding ? (
        <article className="mt-8 whitespace-pre-wrap rounded-xl border border-line bg-surface p-6 text-muted">
          {finding}
        </article>
      ) : null}
    </KeepShell>
  );
}
