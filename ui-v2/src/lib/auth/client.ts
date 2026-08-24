import { useSyncExternalStore } from "react";
import { GROK_PROVIDERS } from "./providers";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role?: string;
};

export type SessionData = {
  user: SessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
};

const STORAGE_KEY = "ravenstack_keep_session";
const COOKIE_NAME = "keep_session";

function getDefaultUser(): SessionUser {
  return {
    id: "dev-user",
    name: "Jason Boyd",
    email: "jason@ravenstack.local",
    image: null,
    role: "Fortress Keeper",
  };
}

let memorySession: SessionData | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function initMemorySession(): SessionData | null {
  if (initialized) return memorySession;
  initialized = true;
  if (typeof window === "undefined") {
    memorySession = {
      user: getDefaultUser(),
      session: {
        id: "sess-default-preview",
        userId: "dev-user",
        expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      },
    };
    return memorySession;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memorySession = JSON.parse(raw) as SessionData;
      return memorySession;
    }
    const initial: SessionData = {
      user: getDefaultUser(),
      session: {
        id: "sess-keeper-default",
        userId: "dev-user",
        expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    setCookie(COOKIE_NAME, JSON.stringify(initial));
    memorySession = initial;
    return initial;
  } catch {
    return memorySession;
  }
}

export function getStoredSession(): SessionData | null {
  if (!initialized) {
    return initMemorySession();
  }
  return memorySession;
}

export function setStoredSession(session: SessionData | null): void {
  memorySession = session;
  initialized = true;
  if (typeof window !== "undefined") {
    try {
      if (session) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setCookie(COOKIE_NAME, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        deleteCookie(COOKIE_NAME);
      }
    } catch {
      // Ignore storage errors
    }
  }
  notifyListeners();
}

export const authEnabled = true;
export { GROK_PROVIDERS };

export function getBearerToken(): string | null {
  const session = getStoredSession();
  return session?.user?.id ?? "dev-user";
}

export async function signIn(
  providerId: string,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<{ error?: { message: string } }> {
  const provider = GROK_PROVIDERS.find((p) => p.providerId === providerId) ?? GROK_PROVIDERS[0];
  const user: SessionUser = {
    id: provider.providerId === "keeper-jason" ? "dev-user" : provider.providerId,
    name: provider.name,
    email: provider.email,
    image: provider.profileImageUrl ?? null,
    role: provider.role,
  };

  const session: SessionData = {
    user,
    session: {
      id: `sess-${user.id}-${Date.now()}`,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
    },
  };

  setStoredSession(session);

  const target = opts.callbackURL ?? "/";
  if (typeof window !== "undefined") {
    if (window.location.pathname !== target) {
      window.location.href = target;
    }
  }
  return {};
}

export async function signOut(): Promise<void> {
  setStoredSession(null);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSessionSnapshot(): SessionData | null {
  return getStoredSession();
}

function getServerSnapshot(): SessionData | null {
  return memorySession;
}

export const authClient = {
  useSession() {
    const session = useSyncExternalStore(subscribe, getSessionSnapshot, getServerSnapshot);
    return {
      data: session,
      isPending: false,
      error: null,
    };
  },
  signIn,
  signOut,
  async getSession() {
    return { data: getStoredSession(), error: null };
  },
};
