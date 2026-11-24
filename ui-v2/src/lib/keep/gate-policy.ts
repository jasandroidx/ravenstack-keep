/**
 * Which bridge tools a browser may reach, and under what terms.
 *
 * Two separate questions, deliberately kept out of the server functions so
 * both can be tested without a request context:
 *
 * 1. `callFastMCP` — the general passthrough the status badge and the gateway
 *    streamer use. It is READ-ONLY by construction. Anything that writes is
 *    refused here, so a forged POST naming `county_queue_approve` cannot
 *    reach the bridge through the passthrough.
 * 2. `decideGate` / `approveKeepGate` — the gate decisions. Those do write,
 *    and the bridge itself refuses them without `confirm: true`. The client
 *    never supplies that flag: it says only that a human pressed the second
 *    button, and the server composes `confirm: true` itself. Any `confirm`
 *    key arriving inside `args` is discarded, so a caller cannot pre-approve
 *    a call by stuffing one into the payload.
 */

import type { FastMCPToolCall } from "./fastmcp";

export type McpTool = FastMCPToolCall["tool"];

/** Tools that change something on the box. Only a gate decision may run these. */
export const GATE_TOOLS = [
  "county_queue_approve",
  "county_queue_reject",
  "session_approve_capability",
] as const satisfies readonly McpTool[];

/** Everything else on the bridge surface. Reads only; safe to forward as-is. */
export const READ_ONLY_MCP_TOOLS = [
  "audit_county_budget",
  "tail_gateway_logs",
  "get_castle_map",
  "oracle_query",
  "oracle_verify",
  "query_knowledge",
  "pending_gates",
  "stack_health",
] as const satisfies readonly McpTool[];

export function isGateTool(tool: string): tool is (typeof GATE_TOOLS)[number] {
  return (GATE_TOOLS as readonly string[]).includes(tool);
}

export function isReadOnlyMcpTool(tool: string): tool is (typeof READ_ONLY_MCP_TOOLS)[number] {
  return (READ_ONLY_MCP_TOOLS as readonly string[]).includes(tool);
}

export type GateCall =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Build the exact arguments a gate decision will send. The only thing that
 * gets a gate approved is `confirmed === true` — the strict boolean a second,
 * deliberate operator press produces. Strings like "true" do not count.
 */
export function buildGateCall(
  tool: string,
  args: Record<string, unknown> | undefined,
  confirmed: unknown,
): GateCall {
  if (!isGateTool(tool)) {
    return { ok: false, error: `${tool} is not a gate decision tool.` };
  }
  if (confirmed !== true) {
    return {
      ok: false,
      error: "Refused: gate decisions require an explicit operator confirmation.",
    };
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (key === "confirm") continue;
    clean[key] = value;
  }
  return { ok: true, args: { ...clean, confirm: true } };
}

/**
 * Why a tool may not be called through the read-only passthrough, or null
 * when it may. Gate tools get their own message: they are not unknown, they
 * are decided elsewhere, on purpose.
 */
export function refuseNonReadOnly(tool: string): string | null {
  if (isReadOnlyMcpTool(tool)) return null;
  if (isGateTool(tool)) {
    return `${tool} writes to the box and is decided at the war table, never through the read passthrough.`;
  }
  return `${tool} is not on the read-only allowlist.`;
}
