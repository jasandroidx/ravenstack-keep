import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeepShell } from "@/components/keep/shell";
import { ChatLog } from "@/components/keep/chat-log";
import { errorTurn, type Turn } from "@/lib/keep/chat";
import { SignInGate } from "@/components/keep/sign-in-gate";
import { Button } from "@/components/ui/button";
import { KNOWLEDGE } from "@/lib/keep/catalog";
import { runOracle } from "@/lib/keep/server";

export const Route = createFileRoute("/oracle")({ component: OraclePage });

function OraclePage() {
  const [question, setQuestion] = useState("Where do agents save new Ravenstack knowledge?");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const say = (t: Turn) => setTurns((prev) => [...prev, t]);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    say({ who: "you", text: q });
    setBusy(true);
    try {
      const out = await runOracle({ data: q });
      if (!out.ok) {
        say(errorTurn(out, "Oracle failed"));
        toast.error(out.error);
        return;
      }
      say({
        who: "agent",
        text: out.answer,
        footnote: out.citations.length ? `Cited: ${out.citations.join(" · ")}` : undefined,
        meta: out.model ? `${out.model} · ${out.provider}` : undefined,
      });
    } catch (err) {
      say(errorTurn(err, "Oracle failed"));
      toast.error(err instanceof Error ? err.message : "Oracle failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeepShell>
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Library · UNFORGED</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">Oracle</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Citation-first. If it is not in the seeded fortress notes, Oracle will say not-in-knowledge rather than invent a path.
      </p>

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

      {turns.length || busy ? (
        <article className="mt-8 rounded-xl border border-line bg-surface p-6">
          <ChatLog turns={turns} busy={busy} thinkingLabel="Searching the vault" />
        </article>
      ) : null}

      <section className="mt-12">
        <h2 className="font-display text-2xl">Shelf (self-index)</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {KNOWLEDGE.map((doc) => (
            <article key={doc.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{doc.scope}</p>
              <h3 className="mt-1 font-display text-xl">{doc.title}</h3>
              <p className="mt-2 text-sm text-muted">{doc.body}</p>
            </article>
          ))}
        </div>
      </section>
    </KeepShell>
  );
}
