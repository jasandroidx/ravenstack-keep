import { createMiddleware } from "@tanstack/react-start";
import {
  evaluateKeepGate,
  isStaticAssetPath,
  parseAllowedLogins,
  type KeepGateVerdict,
} from "./tailscale-gate";

/**
 * The request middleware that actually locks the Keep (registered in
 * `src/start.ts`). Kept separate from the pure `tailscale-gate.ts` module so
 * the gate logic stays unit-testable without dragging TanStack in.
 *
 * Server-only hook. It runs before EVERY request — SSR page loads, server
 * functions and `/api/auth/*` alike — and returns a 401 Response the moment the
 * identity stamp at hand does not clear the gate. The `Mode:` badge on the
 * client re-evaluates the very same predicate via `getKeepIdentity`, so what
 * the UI shows is always what this hook just decided.
 */
export function createKeepGateRequestMiddleware() {
  return createMiddleware({ type: "request" }).server(async ({ request, pathname, next }) => {
    // Static assets load before any auth can exist. Exempt only those.
    if (isStaticAssetPath(pathname ?? "")) return next();

    const authDisabled = String(process.env.VITE_AUTH_ENABLED) === "false";
    const skipTailscaleCheck = Boolean(process.env.VERCEL);

    const verdict: KeepGateVerdict = evaluateKeepGate(request.headers, {
      internalToken: process.env.KEEP_INTERNAL_TOKEN?.trim() ?? "",
      allowedLogins: parseAllowedLogins(process.env.KEEP_ALLOWED_LOGINS),
      authDisabled,
      skipTailscaleCheck,
    });

    if (verdict.allowed) return next();

    return new Response("401 Unauthorized — this Keep requires a Tailscale identity or the internal token.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  });
}