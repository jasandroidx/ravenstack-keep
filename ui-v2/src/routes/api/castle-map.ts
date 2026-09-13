import { createFileRoute } from "@tanstack/react-router";
import { fetchKeepPulse } from "@/lib/keep/pulse";

/** Same data getKeepSnapshot() uses server-side. source: "live" (Keep HTTP) vs "paper" (seed fixture) — never invented. */
export const Route = createFileRoute("/api/castle-map")({
  server: {
    handlers: {
      GET: async () => Response.json(await fetchKeepPulse()),
    },
  },
});
