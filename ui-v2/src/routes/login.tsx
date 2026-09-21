import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grain relative min-h-dvh bg-bg text-fg">
      <img
        src="/keep-ridge.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-bg/40" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">Ravenstack</p>
        <h1 className="mt-3 font-display text-4xl">Enter the Keep</h1>
        <p className="mt-3 text-muted">
          Sign in to forge Agent Specs, convene the Round Table, and query the vault. The hall stays open to guests.
        </p>
        <div className="mt-8 space-y-3">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
        <Link to="/" className="mt-8 text-sm text-subtle hover:text-fg">
          Back to the hall
        </Link>
      </div>
    </main>
  );
}
