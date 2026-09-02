import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HardDrive } from "lucide-react";
import { KeepShell } from "@/components/keep/shell";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Button } from "@/components/ui/button";
import { KNOWLEDGE } from "@/lib/keep/catalog";
import { runOracle } from "@/lib/keep/server";

export const Route = createFileRoute("/oracle")({ component: OraclePage });

function OraclePage() {
  const [question, setQuestion] = useState("Where do agents save new Ravenstack knowledge?");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<string[]>([]);
  const [retrieved, setRetrieved] = useState(true);
  const [customKnowledge, setCustomKnowledge] = useState<
    Array<{ id: string; scope: string; title: string; body: string; sourceUrl?: string }>
  >([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ravenstack_custom_knowledge") || "[]");
      setCustomKnowledge(stored);
    } catch {
      // ignore
    }
  }, []);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await runOracle({ data: question });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      setAnswer(out.answer);
      setCitations(out.citations);
      setRetrieved(out.retrieved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Oracle failed");
    } finally {
      setBusy(false);
    }
  }

  const allDocs = [...customKnowledge, ...KNOWLEDGE];

  return (
    <KeepShell>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Library · UNFORGED</p>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">Oracle</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Citation-first. If it is not in the seeded fortress notes or ingested Google Drive documents, Oracle will say not-in-knowledge rather than invent a path.
          </p>
        </div>
        <Link
          to="/drive"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-medium text-fg hover:border-line-strong hover:bg-elevated transition-colors"
        >
          <HardDrive className="h-4 w-4 text-accent" />
          <span>Ingest from Google Drive</span>
        </Link>
      </div>

      <form onSubmit={onAsk} className="mt-8">
        <SignInGate prompt="Sign in to query Oracle. The shelf below is readable without an account.">
          <div className="rounded-xl border border-line bg-surface p-5">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Searching the vault…" : "Ask"}
              </Button>
            </div>
          </div>
        </SignInGate>
      </form>

      {answer ? (
        <article
          className={`mt-8 rounded-xl border bg-surface p-6 ${
            retrieved ? "border-line" : "border-[#ff2a6d]/50"
          }`}
        >
          {!retrieved && (
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[#ff2a6d]">
              ⃠ No vault excerpt matched this question — the Oracle answered against
              nothing. Anything asserted below is unsourced.
            </p>
          )}
          <p className="whitespace-pre-wrap text-muted">{answer}</p>
          {citations.length ? (
            <p className="mt-6 text-xs uppercase tracking-[0.14em] text-subtle">
              Cited: {citations.join(" · ")}
            </p>
          ) : (
            <p className="mt-6 text-xs uppercase tracking-[0.14em] text-subtle">
              Cited: nothing. Retrieval returned no matching excerpt.
            </p>
          )}
        </article>
      ) : null}

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Shelf (self-index)</h2>
          {customKnowledge.length > 0 && (
            <span className="rounded bg-elevated px-2 py-0.5 text-xs text-accent">
              {customKnowledge.length} Drive document{customKnowledge.length === 1 ? "" : "s"} active
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {allDocs.map((doc) => (
            <article key={doc.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{doc.scope}</p>
              <h3 className="mt-1 font-display text-xl">{doc.title}</h3>
              <p className="mt-2 text-sm text-muted line-clamp-4">{doc.body}</p>
            </article>
          ))}
        </div>
      </section>
    </KeepShell>
  );
}
