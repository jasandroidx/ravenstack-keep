import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRoutingStatus } from "@/lib/keep/server";

type Status = Awaited<ReturnType<typeof getRoutingStatus>>;

function Dot({ up }: { up: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 rounded-full ${up ? "bg-[#39ff14]" : "bg-[#ff2a6d]"}`}
    />
  );
}

/**
 * The bench readout. Shows which plane is actually answering, because
 * "nothing works" is unfixable until the operator can see which leg is down.
 */
export function RoutingPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await getRoutingStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read routing status");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl">Routing</h2>
        <Button type="button" onClick={() => void load()} disabled={busy}>
          {busy ? "Probing…" : "Re-probe"}
        </Button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm text-[#ff2a6d]">{error}</p>
      ) : null}

      {status ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Dot up={status.models.local.reachable && Boolean(status.models.local.selected)} />
              <h3 className="font-display text-xl">Local · Ollama</h3>
              <Badge>{status.models.route}</Badge>
            </div>
            <p className="mt-2 break-all text-xs text-subtle">{status.models.local.base}</p>
            {status.models.local.reachable ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  {status.models.local.models.length} model
                  {status.models.local.models.length === 1 ? "" : "s"} installed
                  {status.models.local.selected ? ` · serving ${status.models.local.selected}` : ""}
                </p>
                {status.models.local.models.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {status.models.local.models.map((m) => (
                      <li
                        key={m}
                        className={`rounded-sm border border-line px-2 py-0.5 text-xs ${
                          m === status.models.local.selected ? "text-fg" : "text-subtle"
                        }`}
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            {status.models.local.error ? (
              <p className="mt-2 text-sm text-[#ff2a6d]">{status.models.local.error}</p>
            ) : null}
            {status.models.local.hint ? (
              <p className="mt-1 text-xs text-subtle">{status.models.local.hint}</p>
            ) : null}
          </article>

          <article className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Dot up={status.mcp.reachable} />
              <h3 className="font-display text-xl">Fortress MCP</h3>
              {status.mcp.configured ? null : <Badge>default</Badge>}
            </div>
            <p className="mt-2 break-all text-xs text-subtle">{status.mcp.base}</p>
            {status.mcp.reachable ? (
              <p className="mt-2 text-sm text-muted">{status.mcp.toolCount} tools listed</p>
            ) : null}
            {status.mcp.error ? <p className="mt-2 text-sm text-[#ff2a6d]">{status.mcp.error}</p> : null}
            {status.mcp.hint ? <p className="mt-1 text-xs text-subtle">{status.mcp.hint}</p> : null}
            {status.binds ? (
              <p className="mt-2 text-xs text-subtle">
                Bound: {status.binds.present.join(", ") || "none"}
                {status.binds.missing.length ? ` · missing: ${status.binds.missing.join(", ")}` : ""}
              </p>
            ) : null}
            {status.bindsError ? <p className="mt-1 text-xs text-[#ff2a6d]">{status.bindsError}</p> : null}
          </article>

          <article className="rounded-lg border border-line bg-surface p-4 md:col-span-2">
            <div className="flex items-center gap-2">
              <Dot up={status.models.cloud.allowed} />
              <h3 className="font-display text-xl">Cloud fallback</h3>
            </div>
            <p className="mt-2 text-sm text-muted">
              {status.models.cloud.allowed
                ? `Enabled · ${status.models.cloud.model} (used only when local fails)`
                : status.models.cloud.keyPresent
                  ? "Disabled by KEEP_ALLOW_CLOUD=0"
                  : "No key set — local-only. That is the intended default."}
            </p>
          </article>
        </div>
      ) : null}
    </section>
  );
}
