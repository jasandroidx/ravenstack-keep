import { createFileRoute } from "@tanstack/react-router";
import { fetchGates } from "@/lib/keep/keep-http";

export const Route = createFileRoute("/api/gates")({
  server: {
    handlers: {
      GET: async () => Response.json(await fetchGates()),
    },
  },
});
