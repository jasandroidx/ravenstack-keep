import { useMemo } from "react";
import { authClient, authEnabled } from "./client";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  role?: string;
  /** True when this is the sandbox/dev fallback (auth not configured). */
  isDevFallback: boolean;
};

/**
 * Stable fallback user, used as default Keep Sovereign Operator.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Jason Boyd",
  primaryEmail: "jason@ravenstack.local",
  profileImageUrl: null,
  role: "Fortress Keeper",
  isDevFallback: true,
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving. */
  isPending: boolean;
};

export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const rawUser = data?.user;

  const user = useMemo<AppUser | null>(() => {
    if (!authEnabled) return DEV_USER;
    if (!rawUser) return null;
    return {
      id: rawUser.id,
      displayName: rawUser.name ?? null,
      primaryEmail: rawUser.email ?? null,
      profileImageUrl: rawUser.image ?? null,
      role: rawUser.role,
      isDevFallback: rawUser.id === "dev-user",
    };
  }, [rawUser]);

  return { user, isPending: authEnabled ? isPending : false };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
