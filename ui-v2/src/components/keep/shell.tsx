import { Link, useRouterState } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PulseBadge } from "@/components/keep/pulse-badge";
import { FastMCPStatusBadge } from "@/components/keep/fastmcp-status-badge";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/", label: "Keep" },
  { to: "/forge", label: "Forge" },
  { to: "/table", label: "Table" },
  { to: "/oracle", label: "Oracle" },
  { to: "/drive", label: "Drive" },
  { to: "/sentinel", label: "Sentinel" },
  { to: "/mechanic", label: "Mechanic" },
  { to: "/stack", label: "Stack" },
];

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-8 w-24 animate-pulse rounded-sm bg-elevated" />;
  }
  if (user) return <UserButton />;
  return (
    <Link
      to="/login"
      className="inline-flex h-9 items-center rounded-sm border border-line px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      Sign in
    </Link>
  );
}

export function KeepShell({ children, bleed = false }: { children: React.ReactNode; bleed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="grain flex min-h-dvh flex-col overscroll-none bg-bg text-fg">
      <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-6">
          <Link to="/" className="shrink-0 font-display text-lg tracking-tight">
            Ravenstack Keep
          </Link>
          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-sm px-2.5 py-1.5 text-sm transition-colors",
                    active ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <FastMCPStatusBadge />
            <PulseBadge />
            <AuthSlot />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "shrink-0 rounded-sm px-2.5 py-1 text-sm",
                  active ? "bg-elevated text-fg" : "text-muted",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={bleed ? "relative min-h-0 w-full flex-1 overflow-hidden" : "mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-10"}>{children}</main>
      {bleed ? null : (
      <footer className="mx-auto w-full max-w-6xl shrink-0 border-t border-line px-4 py-8 text-sm text-subtle md:px-6">
        <p>Local-first. Kill conditions mandatory. Human gates permanent.</p>
        <p className="mt-1">
          <SignedIn>Drafts and table sessions stay with your account.</SignedIn>
          <SignedOut>Sign in to forge, convene the table, or query the vault.</SignedOut>
        </p>
      </footer>
      )}
    </div>
  );
}
