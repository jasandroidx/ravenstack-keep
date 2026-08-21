import { createFileRoute } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { ARCHITECTURE } from "@/lib/keep/catalog";

export const Route = createFileRoute("/stack")({ component: StackPage });

function StackPage() {
  return (
    <KeepShell>
      <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">2026 architecture</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">The stack</h1>
      <p className="mt-3 max-w-2xl text-muted">
        From the June 15 report — mapped onto this fortress. Ambient assistants finish the day, not the line.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Ideal assistant</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ARCHITECTURE.requirements.map((r, i) => (
            <article key={r.title} className="rounded-lg border border-line bg-surface p-4">
              <p className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 font-display text-xl">{r.title}</h3>
              <p className="mt-2 text-sm text-muted">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Four-scope memory</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Do not retrieve what the model already knows. Retrieve what it cannot.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ARCHITECTURE.memoryScopes.map((s) => (
            <article key={s.id} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="font-display text-xl">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {ARCHITECTURE.retrieval.map((r) => (
            <article key={r.title} className="rounded-lg border border-line bg-elevated p-4">
              <h3 className="text-sm font-medium">{r.title}</h3>
              <p className="mt-2 text-sm text-muted">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Gateway routing</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ARCHITECTURE.routing.map((r) => (
            <article key={r.title} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="font-display text-xl">{r.title}</h3>
              <p className="mt-2 text-sm text-muted">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">SOUL.md</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ARCHITECTURE.soul.map((s) => (
            <article key={s.title} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="font-display text-xl">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Memory vs context scorecard</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-elevated text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Dimension</th>
                <th className="px-4 py-3 font-medium">Ask</th>
                <th className="px-4 py-3 font-medium">Leans</th>
              </tr>
            </thead>
            <tbody>
              {ARCHITECTURE.scorecard.map((row) => (
                <tr key={row.dim} className="border-t border-line">
                  <td className="px-4 py-3 text-fg">{row.dim}</td>
                  <td className="px-4 py-3 text-muted">{row.q}</td>
                  <td className="px-4 py-3 text-muted">{row.pick}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </KeepShell>
  );
}
