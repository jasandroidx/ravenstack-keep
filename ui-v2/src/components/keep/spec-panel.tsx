import { Badge, LockBadge, SpecBadge } from "@/components/ui/badge";
import type { AgentSpec } from "@/lib/keep/types";

export function SpecPanel({ spec }: { spec: AgentSpec }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <SpecBadge status={spec.status} />
        <LockBadge lock={spec.lock} />
        <Badge>Tier {spec.modelDefault}</Badge>
        <Badge>{spec.localHint}</Badge>
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.16em] text-subtle">Character</p>
        <p className="mt-2 max-w-3xl text-muted">{spec.character}</p>
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.16em] text-subtle">Purpose</p>
        <p className="mt-2 font-display text-2xl leading-snug">{spec.purpose}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Fact label="Default" value={spec.modelDefault} />
        <Fact label="Escalate when" value={spec.escalateWhen} />
        <Fact label="God mode" value={spec.godMode} />
      </div>
      <Section title="Kill condition">
        <p className="text-muted">{spec.kill}</p>
      </Section>
      <Section title="Human gates">
        <ul className="space-y-2 text-muted">
          {spec.gates.map((g) => (
            <li key={g} className="border-l border-line pl-3">
              {g}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Tools">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-subtle">
              <tr>
                <th className="py-2 pr-4 font-medium">Tool</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Access</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {spec.tools.map((t) => (
                <tr key={t.name} className="border-t border-line">
                  <td className="py-2 pr-4 font-mono text-xs">{t.name}</td>
                  <td className="py-2 pr-4 text-muted">{t.source}</td>
                  <td className="py-2 pr-4 text-muted">{t.access}</td>
                  <td className="py-2 text-muted">{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Existing skills">
          {spec.existingSkills.length ? (
            spec.existingSkills.map((s) => (
              <p key={s.name} className="text-sm text-muted">
                <span className="text-fg">{s.name}</span> — {s.notes}
              </p>
            ))
          ) : (
            <p className="text-sm text-subtle">None listed.</p>
          )}
        </Section>
        <Section title="Forge must write">
          {spec.forgeSkills.length ? (
            spec.forgeSkills.map((s) => (
              <p key={s.name} className="text-sm text-muted">
                <span className="text-fg">{s.name}</span> — {s.notes}
              </p>
            ))
          ) : (
            <p className="text-sm text-subtle">None.</p>
          )}
        </Section>
      </div>
      <Section title="Knowledge seeds">
        <p className="text-sm text-muted">
          Indexes: {spec.indexes.join(", ")}. {spec.knowledgeNotes}
        </p>
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Handoffs out">
          {spec.handoffsOut.map((h) => (
            <p key={h.target} className="text-sm text-muted">
              → {h.target}: {h.when}
            </p>
          ))}
        </Section>
        <Section title="Handoffs in">
          {spec.handoffsIn.map((h) => (
            <p key={h.target + h.when} className="text-sm text-muted">
              ← {h.target}: {h.when}
            </p>
          ))}
        </Section>
      </div>
      <Section title="Success">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          {spec.success.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>
      {spec.notes ? <p className="text-sm text-subtle">{spec.notes}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-xl">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-2 text-sm text-muted">{value}</p>
    </div>
  );
}
