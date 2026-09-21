import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeepShell } from "@/components/keep/shell";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listForgeDrafts, parseDraftRow, runForge, setForgeStatus } from "@/lib/keep/server";
import type { DraftSpec, SavedDraft } from "@/lib/keep/types";
import { SPECS } from "@/lib/keep/catalog";

export const Route = createFileRoute("/forge")({ component: ForgePage });

function ForgePage() {
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<DraftSpec | null>(null);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);

  function refresh() {
    listForgeDrafts()
      .then((rows) => setDrafts(rows.map(parseDraftRow)))
      .catch(() => setDrafts([]));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onForge(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await runForge({ data: idea });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLatest(result.spec);
      setIdea("");
      refresh();
      toast.success("Draft Spec on the anvil. Not live.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Forge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeepShell>
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Alchemy Lab</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">Clawforge</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Idea, interrogation, draft Spec. The anvil does not install. Overlap with Raziel, Oracle, Corvid,
        Sentinel, and Mechanic will be named.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <SignInGate prompt="Sign in to put an idea on the anvil. Guests can read existing Specs in the rooms.">
            <form onSubmit={onForge} className="rounded-xl border border-line bg-surface p-5">
              <label htmlFor="idea" className="text-sm text-muted">
                What should this agent exist to do?
              </label>
              <textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={5}
                className="mt-3 w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none ring-accent/40 placeholder:text-subtle focus:ring-2"
                placeholder="Forge a thin Scribe that only distills daily logs into vault notes, local-first, with a hard write gate."
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-subtle">Stops at draft. You approve.</p>
                <Button type="submit" disabled={busy}>
                  {busy ? "At the anvil…" : "Draft Spec"}
                </Button>
              </div>
            </form>
          </SignInGate>

          {latest ? <DraftView spec={latest} /> : null}

          {drafts.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-2xl">Your drafts</h2>
              <ul className="mt-4 space-y-3">
                {drafts.map((d) => (
                  <li key={d.id} className="rounded-lg border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-xl">{d.spec.name}</p>
                      <Badge>{d.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted">{d.spec.purpose}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setLatest(d.spec)}
                      >
                        Open
                      </Button>
                      {d.status === "draft" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                await setForgeStatus({ data: { id: d.id, status: "approved" } });
                                toast.success("Approved on paper. Runtime still human-gated.");
                                refresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Approve failed.");
                              }
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              try {
                                await setForgeStatus({ data: { id: d.id, status: "rejected" } });
                                refresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Reject failed.");
                              }
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-lg border border-line bg-surface p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Already named</p>
          <ul className="mt-3 space-y-3">
            {Object.values(SPECS).map((s) => (
              <li key={s.id}>
                <p className="text-sm text-fg">{s.name}</p>
                <p className="text-xs text-subtle">
                  {s.status} · {s.purpose}
                </p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </KeepShell>
  );
}

function DraftView({ spec }: { spec: DraftSpec }) {
  return (
    <article className="mt-8 rounded-xl border border-line bg-surface p-6">
      <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Draft · not live</p>
      <h2 className="mt-2 font-display text-3xl">{spec.name}</h2>
      <p className="mt-3 text-muted">{spec.character}</p>
      <p className="mt-6 font-display text-2xl leading-snug">{spec.purpose}</p>
      <dl className="mt-6 grid gap-4 md:grid-cols-2">
        <Pair label="Room" value={spec.room_name} />
        <Pair label="Default tier" value={spec.model_tier_default} />
        <Pair label="Indexes" value={spec.knowledge_indexes.join(", ")} />
        <Pair label="Kill" value={spec.kill_condition} />
      </dl>
      <p className="mt-6 text-sm text-muted">
        <span className="text-fg">Overlap.</span> {spec.overlap_notes}
      </p>
      <p className="mt-4 text-sm text-muted">
        <span className="text-fg">Still to ask.</span> {spec.interrogation}
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <List title="Gates" items={spec.human_gates} />
        <List title="Success" items={spec.success_criteria} />
        <List title="Reuse skills" items={spec.skills_existing} />
        <List title="Must write" items={spec.skills_to_write} />
      </div>
    </article>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-muted">{value}</dd>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {(items ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
