import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeepShell } from "@/components/keep/shell";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ARCHITECTURE, SPECS } from "@/lib/keep/catalog";
import { runInspection } from "@/lib/keep/server";
import { FastMCPSentinelWorkbench } from "@/components/sentinel/fastmcp-sentinel-workbench";
import { WatchtowerBeacon } from "@/components/keep/watchtower-beacon";

export const Route = createFileRoute("/sentinel")({ component: SentinelPage });

function SentinelPage() {
  const spec = SPECS.sentinel;
  const [concern, setConcern] = useState(
    "Score the fortress against the 2026 red flags and say whether credential isolation is holding.",
  );
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState<string | null>(null);

  async function onInspect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await runInspection({ data: { kind: "sentinel", concern } });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      setFinding(out.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inspection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeepShell>
      <img
        src="/watchtower.jpg"
        alt="Watchtower interior — lamp, maps, rain on stone"
        className="mb-8 h-48 w-full rounded-xl border border-line object-cover md:h-64"
      />
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Watchtower · ravenstack-sentinel</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">Sentinel</h1>
      <p className="mt-3 max-w-2xl text-muted">{spec.purpose}</p>
      <p className="mt-4 max-w-2xl text-sm text-subtle">{spec.character}</p>
      <Link to="/rooms/$slug" params={{ slug: "watchtower" }} className="mt-4 inline-block text-sm text-muted hover:text-fg">
        Full Agent Spec
      </Link>

      {/* The beacon. What the tower can see, and the handoff to the bench. */}
      <section className="mt-8">
        <h2 className="font-display text-2xl">Beacon</h2>
        <p className="mt-1 text-sm text-subtle">
          Live stack state. The tower watches and names; the workshop repairs.
        </p>
        <div className="mt-4">
          <WatchtowerBeacon />
        </div>
      </section>

      {/* FastMCP Live Tool Execution Layer (Indiana Ledger & Oracle RAG) */}
      <section className="mt-10">
        <FastMCPSentinelWorkbench />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Red flags</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ARCHITECTURE.redFlags.map((f) => (
            <article key={f.title} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <Badge className={f.level === "critical" ? "border-danger/40 text-danger" : "border-warn/40 text-warn"}>
                  {f.level}
                </Badge>
                <h3 className="font-display text-xl">{f.title}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Harness</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ARCHITECTURE.harness.map((h) => (
            <article key={h.title} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="font-display text-xl">{h.title}</h3>
              <p className="mt-2 text-sm text-muted">{h.body}</p>
            </article>
          ))}
        </div>
      </section>

      <form onSubmit={onInspect} className="mt-10">
        <SignInGate prompt="Sign in to run a Sentinel inspection. Findings are read-only.">
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
                {busy ? "Watching…" : "Inspect"}
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
