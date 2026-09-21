import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeepShell } from "@/components/keep/shell";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Button } from "@/components/ui/button";
import { listTableSessions, parseTableRow, runTable } from "@/lib/keep/server";
import { approveKeepGate, fetchKeepGates, type Gate } from "@/lib/keep/keep-gates";
import type { TableResult } from "@/lib/keep/types";

export const Route = createFileRoute("/table")({ component: TablePage });

const STARTERS = [
  "Should we smoke-test Oracle against live RAG before cost-truth on the box is settled?",
  "Is a dedicated Keep MCP still the right Phase 2, or wrap reclaw-platform first?",
  "When should Flipper stay UNFORGED given marketplace ToS risk?",
];

function TablePage() {
  const [question, setQuestion] = useState(STARTERS[0]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TableResult | null>(null);
  const [history, setHistory] = useState<{ id: number; question: string; table: TableResult }[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [gatesBusy, setGatesBusy] = useState(false);

  useEffect(() => {
    listTableSessions()
      .then((rows) => setHistory(rows.map(parseTableRow)))
      .catch(() => setHistory([]));
    refreshGates();
  }, []);

  async function refreshGates() {
    try {
      const res = await fetchKeepGates();
      setGates(Array.isArray(res.gates) ? res.gates : []);
    } catch {
      setGates([]);
    }
  }

  async function handleApprove(gate: Gate) {
    const via = gate.gate_type === "unlock_room" ? "unlock this room" : "approve this spec";
    if (!window.confirm(`Are you sure — ${via} for ${gate.subject_id}?\n\n${gate.summary}`)) return;
    setGatesBusy(true);
    try {
      const out = await approveKeepGate({
        data:
          gate.gate_type === "unlock_room"
            ? { roomId: gate.subject_id }
            : { agentId: gate.subject_id },
      });
      if (!out.ok) toast.error(out.error);
      else toast.success(gate.gate_type === "unlock_room" ? "Room unlocked." : "Spec approved.");
      await refreshGates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve gate");
    } finally {
      setGatesBusy(false);
    }
  }

  async function onConvene(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await runTable({ data: question });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      setResult(out.table);
      toast.success("The table has spoken. You still decide.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Table failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeepShell>
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Great Hall</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">Round Table</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Hard questions only. Subscription seats. Grok chairs. Daily build stays with you and the repo.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Pending Approvals</h2>
        <p className="mt-1 text-sm text-muted">
          The Keep's own human gates (spec approvals, room unlocks). Human gates are permanent —
          the API refuses these without <span className="font-mono">confirm: true</span>.
        </p>
        {gates.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-surface p-6 text-center">
            <p className="text-sm text-muted">No pending approvals.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {gates.map((gate) => (
              <li
                key={gate.id}
                className="flex flex-col justify-between gap-4 rounded-md border border-line bg-surface px-5 py-4 md:flex-row md:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-subtle">
                      [{gate.gate_type}]
                    </span>
                    <span className="text-sm font-semibold">{gate.subject_id}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{gate.summary}</p>
                </div>
                <SignInGate prompt="Sign in to approve this gate.">
                  <Button
                    type="button"
                    onClick={() => handleApprove(gate)}
                    disabled={gatesBusy}
                    className="shrink-0"
                  >
                    {gatesBusy ? "Processing…" : "Approve (confirm=true)"}
                  </Button>
                </SignInGate>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={onConvene} className="mt-8">
        <SignInGate prompt="Sign in to convene the table. Findings stay with your account.">
          <div className="rounded-xl border border-line bg-surface p-5">
            <label htmlFor="q" className="text-sm text-muted">
              The question
            </label>
            <textarea
              id="q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              className="mt-3 w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuestion(s)}
                  className="rounded-sm border border-line px-2 py-1 text-left text-xs text-muted hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Seats are thinking…" : "Convene"}
              </Button>
            </div>
          </div>
        </SignInGate>
      </form>

      {result ? <Finding table={result} /> : null}

      {history.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl">Prior sittings</h2>
          <ul className="mt-4 space-y-2">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="w-full rounded-md border border-line bg-surface px-4 py-3 text-left text-sm text-muted hover:text-fg"
                  onClick={() => setResult(h.table)}
                >
                  {h.question}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </KeepShell>
  );
}

function Finding({ table }: { table: TableResult }) {
  return (
    <section className="mt-10 space-y-6">
      <article className="rounded-xl border border-line bg-surface p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Chair</p>
        <p className="mt-3 text-muted">{table.chair}</p>
      </article>
      <div className="grid gap-3 md:grid-cols-3">
        {(table.seats ?? []).map((s) => (
          <article key={s.seat} className="rounded-lg border border-line bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{s.seat}</p>
            <p className="mt-2 text-sm text-muted">{s.stance}</p>
          </article>
        ))}
      </div>
      <article className="rounded-xl border border-line bg-surface p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Consensus</p>
        <p className="mt-3 text-muted">{table.consensus}</p>
        <p className="mt-6 text-[11px] uppercase tracking-[0.16em] text-subtle">Next</p>
        <p className="mt-2 text-fg">{table.next}</p>
        {table.risks?.length ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
            {table.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
      </article>
    </section>
  );
}
