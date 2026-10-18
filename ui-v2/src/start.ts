import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { createKeepGateRequestMiddleware } from "./lib/auth/keep-gate-middleware";

/**
 * The single start entry for the Keep. Before this file existed the build fell
 * back to the framework default (`startInstance = undefined`), which left
 * `requestMiddleware` empty. Creating it here is the switch that turns on the
 * s1-lock-doors gate: `createStartHandler` now uses `startOptions.requestMiddleware`
 * for every request instead of the bare CSRF fallback.
 *
 * NOTE ON BUNDLING: this module is imported BOTH by the Nitro server
 * (`createStartHandler`) and by the browser (`hydrateStart`). Keep all
 * `process.env` access and every `*.server` / node-only import inside
 * server-only scopes below. The request middleware itself runs only server-side,
 * so no browser asset ever evaluates the gate.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [
    // Identity first: any request without a Tailscale identity or the internal
    // token dies here (401 Response) before CSRF or a single server callback runs.
    createKeepGateRequestMiddleware(),
    // The framework's CSRF protection for server functions, restored explicitly
    // so it survives us providing our own middleware array.
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
  ],
}));

if (import.meta.env.SSR) {
  // The box is supposed to bind this app to loopback only, with Tailscale serve
  // as the single doorway. If NITRO_HOST was ever pointed somewhere public, say
  // so at startup — once. (Current systemd unit pins NITRO_HOST=127.0.0.1.)
  const nitroHost = process.env.NITRO_HOST;
  if (nitroHost && !/^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|::1)$/.test(nitroHost)) {
    console.warn(
      `[keep-gate] NITRO_HOST=${nitroHost} is not loopback — the Keep UI may be ` +
        `reachable beyond Tailscale serve. Pin NITRO_HOST=127.0.0.1 in the systemd unit.`,
    );
  }
}