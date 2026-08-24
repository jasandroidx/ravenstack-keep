import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [customName, setCustomName] = useState("");

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const customId = `custom-${customName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    void signIn(customId, { callbackURL: "/" });
    void navigate({ to: "/" });
  };

  return (
    <main className="grain relative min-h-dvh bg-bg text-fg">
      <img
        src="/keep-ridge.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/40" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Ravenstack Keep</p>
        <h1 className="mt-3 font-display text-4xl">Enter the Keep</h1>
        <p className="mt-3 text-muted">
          Select an identity to forge Agent Specs, convene the Round Table, and query the vault with Gemini.
        </p>

        <div className="mt-8 space-y-3">
          {GROK_PROVIDERS.map((p) => (
            <Button
              key={p.providerId}
              type="button"
              variant="secondary"
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => {
                void signIn(p.providerId, { callbackURL: "/" });
                void navigate({ to: "/" });
              }}
            >
              <div>
                <p className="text-sm font-medium text-fg">{p.label}</p>
                <p className="text-[11px] text-muted">{p.role}</p>
              </div>
              <span className="text-xs text-accent font-mono">Enter →</span>
            </Button>
          ))}
        </div>

        <form onSubmit={handleCustomLogin} className="mt-6 pt-6 border-t border-line">
          <label htmlFor="customName" className="block text-xs font-mono uppercase text-subtle">
            Or Enter Custom Operator Handle
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="customName"
              type="text"
              placeholder="e.g. Apprentice Mason"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 rounded-md border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <Button type="submit" variant="default" disabled={!customName.trim()}>
              Sign In
            </Button>
          </div>
        </form>

        <Link to="/" className="mt-8 text-sm text-subtle hover:text-fg text-center">
          ← Back to the Painted Hall
        </Link>
      </div>
    </main>
  );
}
