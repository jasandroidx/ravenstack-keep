/**
 * s1-lock-doors: the request-level identity gate for the Keep.
 *
 * The production Keep is reachable only through Tailscale Serve (MagicDNS host
 * -> :8130). Tailscale stamps every proxied request from a logged-in account
 * with `Tailscale-User-Login`; tagged devices sending an internal token are the
 * only other path in. This module turns those stamps into a single gate that
 * every router page, SSR render and server function passes through (registered
 * once in `src/start.ts`).
 *
 * Evaluation order (see `evaluateKeepGate`):
 *   1. VERCEL runtime -> skip entirely (Vercel previews sit behind Vercel's own
 *      auth and expose no box data).
 *   2. Local dev override: `VITE_AUTH_ENABLED=false` AND a loopback Host header
 *      ONLY. A tailnet host can never take this path, so serve cannot be bypassed
 *      by turning auth off.
 *   3. Tailscale-User-Login in KEEP_ALLOWED_LOGINS -> human.
 *   4. x-keep-internal === KEEP_INTERNAL_TOKEN -> tagged-device bot.
 *   5. Everything else -> 401.
 *
 * AGENTS.md: no secrets, no tailnet hostnames, no Funnel URLs in code. This
 * module names no host and compares the internal token only at runtime, from
 * env. It is a PURE module on purpose (no React/TanStack imports) so the unit
 * tests in `tailscale-gate.test.ts` run under plain `node --experimental-strip-types`.
 */

/** Default Tailscale-User-Login allowlist when KEEP_ALLOWED_LOGINS is unset. */
export const DEFAULT_ALLOWED_LOGINS = "jasonmboyd87@gmail.com";

/** Header Tailscale Serve adds for every authed proxied request. */
export const TAILSCALE_LOGIN_HEADER = "tailscale-user-login";

/** Header a tagged device sends instead, matched against KEEP_INTERNAL_TOKEN. */
export const INTERNAL_TOKEN_HEADER = "x-keep-internal";

/** What authenticated this request. The badge writes one line from it. */
export type KeepGateMode = "tailscale" | "internal" | "local" | "unmanaged" | "unauthorized";

export interface KeepGateVerdict {
  /** True when the request may continue. */
  allowed: boolean;
  mode: KeepGateMode;
  /** Tailnet account email when authenticated by Tailscale, else null. */
  login: string | null;
}

export interface KeepGateOptions {
  /** Normalized login allowlist (see `parseAllowedLogins`). Defaults to DEFAULT_ALLOWED_LOGINS. */
  allowedLogins?: string[];
  /** KEEP_INTERNAL_TOKEN value. Empty string leaves the internal path off entirely. */
  internalToken?: string;
  /** True when VITE_AUTH_ENABLED=false — unlocks the loopback dev override. */
  authDisabled?: boolean;
  /** True on Vercel — the gate is skipped. */
  skipTailscaleCheck?: boolean;
}

/** "a, B ,c" -> ["a","b","c"]. Source header values are case-insensitive. */
export function parseAllowedLogins(raw?: string): string[] {
  return (raw ?? DEFAULT_ALLOWED_LOGINS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Loopback hosts only. The dev override must never fire through serve. */
export function isLoopbackHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?$/i.test(host.trim());
}

/**
 * Built-asset paths never need the gate: the favicon, hall artwork and the
 * compiled JS/CSS bundles load before anything else can run. Everything else —
 * including SSR page loads and `/api/auth/*` — is gated.
 */
export function isStaticAssetPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/hall/") ||
    pathname.startsWith("/__grok/")
  ) {
    return true;
  }
  return /\.(?:woff2?|ttf|eot|png|jpe?g|webp|gif|ico|svg|webmanifest|txt|json|map)$/i.test(pathname);
}

/**
 * Pure gate predicate. Pure on purpose: unit-tested, and reused 1:1 by the
 * request middleware and by `getKeepIdentity` so the badge always agrees with
 * the gate that just let the request through.
 */
export function evaluateKeepGate(
  headers: Headers,
  options: KeepGateOptions = {},
): KeepGateVerdict {
  const login = (headers.get(TAILSCALE_LOGIN_HEADER) ?? "").trim() || null;
  const internal = (headers.get(INTERNAL_TOKEN_HEADER) ?? "").trim();
  const host = headers.get("host") ?? "";

  if (options.skipTailscaleCheck) {
    return { allowed: true, mode: "unmanaged", login: null };
  }

  if (options.authDisabled && isLoopbackHost(host)) {
    return { allowed: true, mode: "local", login: null };
  }

  const allowedLogins = options.allowedLogins ?? parseAllowedLogins();
  if (login && allowedLogins.includes(login.toLowerCase())) {
    return { allowed: true, mode: "tailscale", login };
  }

  const token = options.internalToken ?? "";
  if (token && internal && internal === token) {
    return { allowed: true, mode: "internal", login: null };
  }

  return { allowed: false, mode: "unauthorized", login };
}

/** Same predicate against a plain header record (tests, SSR helpers). */
export function evaluateKeepGateWithHeaders(
  headerRecord: Record<string, string>,
  options: KeepGateOptions = {},
): KeepGateVerdict {
  return evaluateKeepGate(new Headers(headerRecord), options);
}