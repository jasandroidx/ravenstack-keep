import { useState, useRef, useEffect, type ReactNode } from "react";
import { Navigate, Link } from "@tanstack/react-router";
import { signOut, signIn } from "./client";
import { GROK_PROVIDERS } from "./providers";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

export const SIGN_IN_PATH = "/login";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function UserButton() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex h-8 items-center rounded border border-line px-2.5 text-xs text-muted hover:border-line-strong hover:text-fg"
      >
        Sign in
      </Link>
    );
  }

  const label = user.displayName ?? user.primaryEmail ?? "Operator";
  const initials = label.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-line bg-surface/80 px-2.5 py-1 text-xs text-fg transition-colors hover:border-line-strong"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/20 font-mono text-[10px] font-semibold text-accent">
          {initials}
        </span>
        <span className="max-w-[110px] truncate font-medium">{label}</span>
        <span className="text-[10px] text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-md border border-line bg-elevated p-2 shadow-panel z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="border-b border-line px-2 pb-2">
            <p className="font-medium text-xs text-fg">{label}</p>
            <p className="text-[10px] text-muted truncate">{user.primaryEmail}</p>
            {user.role && <p className="mt-0.5 text-[9px] text-accent/80 font-mono">{user.role}</p>}
          </div>

          <div className="py-1">
            <p className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-subtle">
              Switch Identity
            </p>
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => {
                  void signIn(p.providerId);
                  setOpen(false);
                }}
                className={`w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-surface ${
                  user.id === p.providerId || (user.id === "dev-user" && p.providerId === "keeper-jason")
                    ? "font-semibold text-accent"
                    : "text-muted hover:text-fg"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="border-t border-line pt-1">
            <button
              type="button"
              onClick={() => {
                void signOut();
                setOpen(false);
              }}
              className="w-full rounded px-2 py-1 text-left text-xs text-danger/90 hover:bg-surface hover:text-danger"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
