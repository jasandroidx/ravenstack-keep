/**
 * Box-side binds. These used to be a plan; they are calls now.
 *
 * Raziel's test: a chip must call a live tool or it is theater. Every bind here
 * returns { ok:false } with the real reason instead of pretending, so the hall
 * can label a chip "paper" honestly rather than inventing idle state.
 *
 * Reads are free. Gated tools require an explicit confirm from a human-gated
 * caller — never defaulted in this file.
 *
 * Suggested first binds (Raziel's test):
 * 1. dashboard_status  → KeepPulse
 * 2. pending_gates     → war-table chip
 * 3. stack_health      → Sentinel / Mechanic diagnose
 * 4. query_knowledge   → Oracle (cited only)
 */

import { mcpCallTool, mcpListTools, type McpFailure } from "./mcp";

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
    fallback: "canned inspectConcern via the local model",
    humanGate: false,
  },
  query_knowledge: {
    where: "Oracle",
    fallback: "catalog KNOWLEDGE docs only",
    humanGate: false,
  },
};

export type BoxResult<T = unknown> = { ok: true; json: T | null; text: string } | McpFailure;

/** Which of the planned binds the box actually lists right now. */
export async function boxToolsAvailable(): Promise<{ ok: true; present: BoxTool[]; missing: BoxTool[] } | McpFailure> {
  const listed = await mcpListTools();
  if (!listed.ok) return listed;
  const names = new Set(listed.tools.map((t) => t.name));
  const planned = Object.keys(BOX_TOOL_PLAN) as BoxTool[];
  return {
    ok: true,
    present: planned.filter((t) => names.has(t)),
    missing: planned.filter((t) => !names.has(t)),
  };
}

export async function dashboardStatus(): Promise<BoxResult> {
  return mcpCallTool("dashboard_status", {});
}

export async function stackHealth(): Promise<BoxResult> {
  return mcpCallTool("stack_health", {});
}

/**
 * Read-only view of the gate queue. Approving is a separate, confirmed call.
 *
 * reclaw-platform calls it pending_gates; Keep MCP calls it list_pending_gates.
 * Verified against both servers, so try whichever the endpoint actually lists.
 */
export async function pendingGates(): Promise<BoxResult> {
  const listed = await mcpListTools();
  if (!listed.ok) return listed;
  const names = new Set(listed.tools.map((t) => t.name));
  if (names.has("pending_gates")) return mcpCallTool("pending_gates", {});
  if (names.has("list_pending_gates")) return mcpCallTool("list_pending_gates", {});
  return { ok: false, base: listed.base, error: "Box lists no gate tool (pending_gates / list_pending_gates)" };
}

/**
 * Oracle's bind. Prefers the scoped tool per HANDOFF.md — unscoped query_knowledge
 * is the fallback only when the box does not list the scoped one.
 */
export async function queryKnowledge(question: string): Promise<BoxResult> {
  const listed = await mcpListTools();
  if (!listed.ok) return listed;
  const names = new Set(listed.tools.map((t) => t.name));
  if (names.has("query_scoped_knowledge")) {
    return mcpCallTool("query_scoped_knowledge", { question });
  }
  if (names.has("query_knowledge")) {
    return mcpCallTool("query_knowledge", { question });
  }
  return { ok: false, base: listed.base, error: "Box lists no knowledge tool (query_scoped_knowledge / query_knowledge)" };
}

/** Local model inventory as the box sees it — second opinion against direct Ollama. */
export async function ollamaModelsViaBox(): Promise<BoxResult> {
  return mcpCallTool("ollama_models", {});
}