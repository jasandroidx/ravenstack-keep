import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { getKeepIdentity } from "@/lib/keep/server";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

/**
 * Auth state components — plain wrappers around `useCurrentUserState()`.
 *
 * Auth is ON by default (including the sandbox live preview, which does real
 * sign-in). Visitors are signed out until they authenticate. The shared dev
 * user only appears when auth is explicitly disabled (`VITE_AUTH_ENABLED=false`).
 * While the session is still resolving, gates that care about signed-out state
 * render nothing so there's no signed-out flash on hard reload.
 */

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
 * session loading, which feels like a second "Loading…" on /login.
 *
 * Guard routes by waiting out `isPending` first (see `use-current-user`), then
 * render this.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

/**
 * Minimal signed-in identity chip + sign-out. Restyle freely (see the
 * `design-ui` skill). Sign-out is only shown when auth is enabled (the
 * disabled-auth dev user has nothing to sign out of).
 */
export function UserButton() {
  const user = useCurrentUser();
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {user.isDevFallback && <KeepIdentityBadge />}
      {authEnabled && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline"
        >
          Sign out
        </button>
      )}
    </div>
  );
}

/**
 * s1-lock-doors identity badge. Calls `getKeepIdentity` — the same gate
 * predicate that just let this request through — and paints its verdict as
 * the header chip. Renders nothing while resolving, and nothing on a refused
 * request (the 401 surfaces as a query error), so the header never invents an
 * identity it does not hold.
 */
function KeepIdentityBadge() {
  const { data } = useQuery({
    queryKey: ["keep-identity"],
    queryFn: () => getKeepIdentity(),
    retry: false,
  });
  if (!data || data.mode === "unauthorized") return null;
  const { mode, login } = data;

  const text =
    mode === "tailscale"
      ? (login?.split("@")[0] ?? "tailnet")
      : mode === "internal"
        ? "BOT · internal"
        : mode === "local"
          ? "DEV · local"
          : "REMOTE";

  const title =
    mode === "tailscale"
      ? `Tailscale identity · ${login}`
      : `${mode} identity — request-level Keep gate`;

  return (
    <span
      className="rounded-sm border border-[#ff2a6d]/60 bg-[#ff2a6d]/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#ff2a6d]"
      title={title}
    >
      {text}
    </span>
  );
}
