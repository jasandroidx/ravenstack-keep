import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeepShell } from "@/components/keep/shell";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Button } from "@/components/ui/button";
import { listQuarantine, logQuarantine, dismissQuarantine } from "@/lib/keep/server";

export const Route = createFileRoute("/quarantine")({ component: QuarantinePage });

type Row = Awaited<ReturnType<typeof listQuarantine>>[number];

const DETECTED_LABEL: Record<string, string> = {
  operator: "You caught it",
  no_evidence: "Answered with no evidence",
  hhem: "Consistency score below threshold",
};

function QuarantinePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [claim, setClaim] = useState("");
  const [model, setModel] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listQuarantine()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  async function onLog(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await logQuarantine({
        data: {
          claim,
          model: model.trim() || "unknown",
          room: "operator-entry",
          evidence,
          detectedBy: "operator",
        },
      });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      toast.success("Committed to the cell.");
      setClaim("");
      setEvidence("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not commit the record");
    } finally {
      setBusy(false);
    }
  }

  const open = (rows ?? []).filter((r) => r.status === "open");
  const dismissed = (rows ?? []).filter((r) => r.status !== "open");

  return (
    <KeepShell>
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Yard · quarantine</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">The Quarantine Cell</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Every claim a model asserted that its own evidence did not support. Records are
        kept with the evidence that failed them, and they are never deleted — a pile you
        can empty is not a record.
      </p>

      <div className="mt-6 flex flex-wrap gap-6 border-y border-line py-4 font-mono text-sm">
        <span>
          <span className="text-2xl text-[#ff2a6d]">{open.length}</span>{" "}
          <span className="text-subtle">open</span>
        </span>
        <span>
          <span className="text-2xl text-muted">{dismissed.length}</span>{" "}
          <span className="text-subtle">dismissed</span>
        </span>
      </div>

      {rows === null ? (
        <p className="mt-8 text-muted">Opening the cell…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-muted">
          The cell is empty. That means nothing has been committed to it — not that nothing
          has been fabricated.
        </p>
      ) : (
        <section className="mt-8 space-y-3">
          {[...open, ...dismissed].map((r) => (
            <article
              key={r.id}
              className={`rounded-lg border bg-surface p-4 ${
                r.status === "open" ? "border-[#ff2a6d]/40" : "border-line opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-fg">{r.claim}</p>
                {r.status === "open" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await dismissQuarantine({ data: { id: r.id } });
                      load();
                    }}
                    className="shrink-0 rounded-sm border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-subtle hover:text-fg"
                  >
                    Dismiss
                  </button>
                )}
              </div>
              <p className="mt-2 font-mono text-[11px] text-subtle">
                {r.model} · {r.room} · {DETECTED_LABEL[r.detected_by] ?? r.detected_by}
                {r.consistency_score != null && ` · score ${r.consistency_score.toFixed(2)}`}
                {" · "}
                {new Date(r.created_at).toLocaleString()}
              </p>
              {r.prompt && (
                <p className="mt-2 font-mono text-[11px] text-muted">Asked: {r.prompt}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-[11px] text-subtle hover:text-fg">
                  Evidence it was checked against
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm border border-line bg-elevated p-3 font-mono text-[11px] text-muted">
{r.evidence.trim() ? r.evidence : "(empty — the answer was given against no retrieved evidence at all)"}
                </pre>
              </details>
              {r.note && <p className="mt-2 text-sm text-subtle">{r.note}</p>}
            </article>
          ))}
        </section>
      )}

      <form onSubmit={onLog} className="mt-10">
        <SignInGate prompt="Sign in to commit a record. The cell is per-operator.">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-display text-2xl">Commit a fabrication</h2>
            <p className="mt-1 text-sm text-subtle">
              Paste the claim exactly as the model stated it, and the evidence it was
              supposed to be drawing on. Leave the evidence empty if there wasn't any.
            </p>
            <label className="mt-4 block text-sm text-muted">The claim</label>
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={2}
              placeholder="Verified against Obsidian vault and Indiana SBOA statutes…"
              className="mt-2 w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <label className="mt-4 block text-sm text-muted">Which model</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gemma4 / gemini-2.5 / unknown"
              className="mt-2 w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <label className="mt-4 block text-sm text-muted">Evidence it had</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={busy || !claim.trim()}>
                {busy ? "Committing…" : "Commit to the cell"}
              </Button>
            </div>
          </div>
        </SignInGate>
      </form>
    </KeepShell>
  );
}
