/**
 * Box-side wiring (you fill this in on Hetzner).
 *
 * This Grok Build sandbox cannot reach Tailscale or :8100.
 * On the box, implement these with docker DNS / localhost — never a Funnel URL in git.
 *
 * Suggested first binds (Raziel's test):
 * 1. dashboard_status  → KeepPulse
 * 2. pending_gates     → war-table chip
 * 3. stack_health      → Sentinel / Mechanic diagnose
 * 4. query_knowledge   → Oracle (cited only)
 *
 * keep-mcp (castle_map, occupancy, specs) is a separate plane if :8110 exists.
 * Do not pretend those tools exist until the box lists them.
 */
export type BoxTool = "dashboard_status" | "pending_gates" | "stack_health" | "query_knowledge";

export const BOX_TOOL_PLAN: Record<
  BoxTool,
  { where: string; fallback: string; humanGate: boolean }
> = {
  dashboard_status: {
    where: "Hall occupancy chips + PulseBadge",
    fallback: "src/lib/keep/pulse.fixture.json (labeled paper)",
    humanGate: false,
  },
  pending_gates: {
    where: "War table",
    fallback: "queue.idle in the fixture",
    humanGate: true,
  },
  stack_health: {
    where: "Valerie Diagnose / Sentinel",
    fallback: "canned inspectConcern / xAI if key present",
    humanGate: false,
  },
  query_knowledge: {
    where: "Oracle",
    fallback: "catalog KNOWLEDGE docs only",
    humanGate: false,
  },
};
