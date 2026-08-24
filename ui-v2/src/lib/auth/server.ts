import { getCookie } from "@tanstack/react-start/server";
import { DEV_USER } from "./use-current-user";
import { GROK_PROVIDERS } from "./providers";

export const authConfigured = true;

export type ServerSession = {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
};

function parseSessionCookie(): ServerSession | null {
  try {
    const raw = getCookie("keep_session");
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw)) as ServerSession;
  } catch {
    return null;
  }
}

export const auth = {
  api: {
    async getSession({ headers }: { headers?: Headers } = {}): Promise<ServerSession | null> {
      // Check authorization header first
      const authHeader = headers?.get("Authorization") ?? headers?.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        const found = GROK_PROVIDERS.find((p) => p.providerId === token);
        if (found) {
          return {
            user: {
              id: found.providerId,
              name: found.name,
              email: found.email,
              image: found.profileImageUrl ?? null,
            },
            session: {
              id: `sess-${found.providerId}`,
              userId: found.providerId,
              expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
            },
          };
        }
        if (token) {
          return {
            user: {
              id: token,
              name: DEV_USER.displayName ?? "Jason Boyd",
              email: DEV_USER.primaryEmail ?? "jason@ravenstack.local",
              image: null,
            },
            session: {
              id: `sess-${token}`,
              userId: token,
              expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
            },
          };
        }
      }

      // Check cookie
      const fromCookie = parseSessionCookie();
      if (fromCookie) return fromCookie;

      // Fallback default dev user in preview
      return {
        user: {
          id: DEV_USER.id,
          name: DEV_USER.displayName ?? "Jason Boyd",
          email: DEV_USER.primaryEmail ?? "jason@ravenstack.local",
          image: null,
        },
        session: {
          id: "sess-default-preview",
          userId: DEV_USER.id,
          expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
        },
      };
    },
  },
  async handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.includes("get-session")) {
      const session = await auth.api.getSession({ headers: request.headers });
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname.includes("sign-out")) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "keep_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
        },
      });
    }
    return new Response(JSON.stringify({ ok: true, status: "active" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
