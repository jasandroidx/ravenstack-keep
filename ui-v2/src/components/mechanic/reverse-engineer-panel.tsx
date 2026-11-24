import { useState } from "react";
import { RE_TARGETS, REA_SETUP_STEPS, runReverseEngineerAnalysis, type ReResult } from "@/lib/keep/reverse-engineer";

/**
 * Valerie, REA handler. Target picker is limited to the four listed
 * targets — Jason's own code and one open-source smoke test, tiny first.
 * No commercial target is offered, and none is accepted by the server.
 * REA is not installed on ravenserve: native decompiles say so and stop
 * at the laptop setup steps instead of faking a run. JS/TS code analysis
 * runs here through the FreeLLMAPI leg, for code that lives here.
 */
export function ReverseEngineerPanel() {
  const [target, setTarget] = useState<string>("tiny-tool");
  const [result, setResult] = useState<ReResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const out = await runReverseEngineerAnalysis({ data: target });
      setResult(out);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-2xl text-fg">Reverse-engineer panel — Valerie, REA handler</h2>
      <p className="mt-1 text-sm text-muted">
        Own and open-source targets only. No commercial games or apps, ever. Start tiny: token burn is real — a tiny binary already produced
        ~907KB of tool output in the plan, so big binaries get a warning first and are never run blind.
      </p>
      <div className="mt-4 rounded-md border border-line bg-bg p-3">
        <p className="text-sm text-fg">REA not installed here yet — run the laptop setup for native binary decompiles.</p>
        <p className="mt-1 text-xs text-muted">
          Code analysis for JS/TS targets below runs here through the FreeLLMAPI leg, no install needed. Native decompiles do not run here.
        </p>
        <ol className="mt-2 list-decimal pl-5 text-xs text-muted">
          {REA_SETUP_STEPS.map((step) => (
            <li key={step} className="mt-1 font-mono">
              {step}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-mono text-muted" htmlFor="re-target">
          Target
        </label>
        <select
          id="re-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-[#3a3f4b] bg-bg px-3 py-1.5 text-sm text-fg"
        >
          {RE_TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-md border border-[#3a3f4b] bg-surface px-3 py-1.5 text-xs font-mono text-muted hover:border-[#2de2e6] hover:text-[#2de2e6] transition-colors disabled:opacity-50"
        >
          {loading ? "Analysing…" : "Analyse"}
        </button>
      </div>
      {error ? <p className="mt-4 text-sm text-[#ff2a6d]">{error}</p> : null}
      {result && result.ok ? (
        <div className="mt-4 rounded-md border border-line bg-bg p-3">
          <p className="font-mono text-xs text-muted">
            Via {result.provider} · {result.model}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">{result.source}</p>
          <p className="mt-2 text-sm text-fg whitespace-pre-wrap">{result.analysis}</p>
        </div>
      ) : null}
      {result && !result.ok ? (
        <div className="mt-4 rounded-md border border-line bg-bg p-3">
          <p className="text-sm text-fg">{result.error}</p>
          {result.needsLaptop ? <p className="mt-1 text-xs text-muted">Needs the laptop REA install. Nothing was run here.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
