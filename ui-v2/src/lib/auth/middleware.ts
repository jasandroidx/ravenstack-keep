import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions — the standard way to get the caller's
 * verified user id. When deployed the session cookie is same-origin and rides
 * along automatically. In the live preview the client also forwards the bearer
 * token (partitioned cookies) via the `.client` hook below — call sites do not
 * thread it themselves.
 *
 * The bearer travels in the `Authorization` request header, never in the
 * function context: TanStack serialises GET middleware context into the URL
 * query string, which would leak the preview session token into logs/history.
 * The server hook reads the header back off the actual request.
 *
 *   import { createServerFn } from "@tanstack/react-start";
 *   import { getSql } from "@/lib/db";
 *   import { authMiddleware } from "@/lib/auth/middleware";
 *
 *   export const listTodos = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => {
 *       const sql = await getSql();
 *       return sql`select * from todos where user_id = ${context.userId}`;
 *     });
 *
 * Signed out (auth on — the default, including live preview) -> throws
 * `UnauthorizedError` (see `verify.server.ts`). Only when auth is explicitly
 * disabled (`VITE_AUTH_ENABLED=false`) does it resolve the shared dev user and
 * never throw. Use it on every server function that touches per-user data, and
 * scope every query by `context.userId`.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    // Live preview (partitioned iframe): the session rides a bearer token, not a
    // cookie, so forward it to the server as a request header. Null when
    // deployed (cookie auth), so this is a no-op there.
    const { getBearerToken } = await import("./client");
    const token = getBearerToken() ?? "";
    if (!token) return next();
    return next({ headers: { authorization: `Bearer ${token}` } });
  })
  .server(async ({ next }) => {
    // ONLY import `*.server` modules here. This file is dual client/server
    // (bearer hook on the client). A plain `./isolation` path was renamed to
    // `isolation.server.ts` — keep this import in sync so image `tsc` resolves
    // it, and so Vite does not ship `@tanstack/react-start/server` to the browser.
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    // Reject scripted cross-site/sibling requests before touching per-user data.
    assertSameSiteRequest();

    // The client hook put the preview bearer in the Authorization header of the
    // actual HTTP request we are handling (never in the URL). Recover it here.
    const request = getRequest();
    const authz = request?.headers?.get ? request.headers.get("authorization") : undefined;
    const bearer = authz?.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : undefined;
    const userId = await requireUserId(bearer);
    return next({ context: { userId } });
  });
