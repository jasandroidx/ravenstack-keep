/**
 * FastMCP & ReClaw live infrastructure client.
 *
 * Endpoints are supplied by the deployer, never committed. Set them on the box:
 *
 *   FASTMCP_FUNNEL_URL     public MCP ingress, e.g. https://<host>/
 *   FASTMCP_INTERNAL_URL   tailnet MCP endpoint, e.g. http://<tailnet-ip>:8100/mcp
 *   RECLAW_API_BASE        ReClaw 2.0 API base
 *   OPENCLAW_GATEWAY_WS    gateway websocket
 *
 * Unset endpoints are skipped. When no endpoint answers, calls fail closed:
 * `ok: false`, `source: "unreachable"`, `data: null`. This module never
 * synthesises tool output — a dead bridge reports dead. Fabricated county
 * ledgers or Oracle citations are worse than no answer.
 */

export interface FastMCPToolCall {
  tool: "audit_county_budget" | "tail_gateway_logs" | "get_castle_map" | "oracle_query" | "oracle_verify";
  params?: Record<string, unknown>;
}

export interface FastMCPToolResult<T = unknown> {
  ok: boolean;
  source: "live_funnel" | "live_internal" | "unreachable";
  endpoint: string;
  data: T | null;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

export interface IndianaCountyAudit {
  county: string;
  anchor: boolean;
  totalAppropriations: string;
  actualDisbursements: string;
  variance: string;
  sboaAuditStatus: "CLEAN_OPINION" | "FINDING_NOTED" | "EXCESS_LEVY_FLAGGED" | "PENDING_PRIMARY_SOURCE";
  verifiedDualSource: boolean;
  ledgerLines: Array<{
    fundCode: string;
    fundName: string;
    budgeted: number;
    expended: number;
    sboaCompliant: boolean;
    flags?: string;
  }>;
  redFlags: string[];
  auditorNotes: string;
}

export interface GatewayLogLine {
  id: string;
  timestamp: string;
  service: "gateway" | "fastmcp" | "reclaw_api" | "chroma" | "ollama";
  level: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  message: string;
  raw: string;
}

export interface CastleMapState {
  zones: Array<{
    id: string;
    name: string;
    slug: string;
    empty: boolean;
    activeAgent: string;
    status: string;
    mcpBindings: string[];
  }>;
  activeCount: number;
  bridgeStatus: "CONNECTED" | "DEGRADED" | "STANDALONE";
}

export interface OracleVerification {
  claim: string;
  verified: boolean;
  obsidianPath?: string;
  sboaCitation?: string;
  confidence: number;
  truthRulesChecked: string[];
  verdict: string;
}

export const FASTMCP_CONFIG = {
  primaryFunnel: process.env.FASTMCP_FUNNEL_URL?.trim() ?? "",
  fallbackInternal: process.env.FASTMCP_INTERNAL_URL?.trim() ?? "",
  reclawApiBase: process.env.RECLAW_API_BASE?.trim() ?? "",
  gatewayWs: process.env.OPENCLAW_GATEWAY_WS?.trim() ?? "",
};

/** True when at least one MCP endpoint is configured. */
export function isFastMCPConfigured(): boolean {
  return Boolean(FASTMCP_CONFIG.primaryFunnel || FASTMCP_CONFIG.fallbackInternal);
}

/**
 * Server-side execution of FastMCP tools against live endpoints with telemetry fallback.
 */
export async function executeFastMCPTool<T = unknown>(
  tool: FastMCPToolCall["tool"],
  params: Record<string, unknown> = {},
): Promise<FastMCPToolResult<T>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const attempts: string[] = [];

  const body = () =>
    JSON.stringify({
      jsonrpc: "2.0",
      id: `call-${Date.now()}`,
      method: "tools/call",
      params: { name: tool, arguments: params },
    });

  const stages: Array<{
    source: "live_funnel" | "live_internal";
    label: string;
    url: string;
    timeoutMs: number;
  }> = [
    {
      source: "live_funnel",
      label: "FASTMCP_FUNNEL_URL",
      url: FASTMCP_CONFIG.primaryFunnel ? `${FASTMCP_CONFIG.primaryFunnel.replace(/\/+$/, "")}/mcp` : "",
      timeoutMs: 3500,
    },
    {
      source: "live_internal",
      label: "FASTMCP_INTERNAL_URL",
      url: FASTMCP_CONFIG.fallbackInternal,
      timeoutMs: 2000,
    },
  ];

  for (const stage of stages) {
    if (!stage.url) {
      attempts.push(`${stage.label}: not set`);
      continue;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), stage.timeoutMs);
    try {
      const res = await fetch(stage.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body(),
        signal: controller.signal,
      });

      if (res.ok) {
        const json = await res.json();
        return {
          ok: true,
          source: stage.source,
          endpoint: stage.url,
          data: (json.result ?? json) as T,
          latencyMs: Date.now() - startTime,
          timestamp,
        };
      }
      attempts.push(`${stage.label}: HTTP ${res.status}`);
    } catch (err) {
      attempts.push(`${stage.label}: ${err instanceof Error ? err.message : "unreachable"}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fail closed. No endpoint answered, so there is no data — and we do not invent
  // any. Callers must render "bridge unreachable", never a plausible-looking result.
  return {
    ok: false,
    source: "unreachable",
    endpoint: "",
    data: null,
    latencyMs: Date.now() - startTime,
    timestamp,
    error: isFastMCPConfigured()
      ? `FastMCP bridge unreachable (${attempts.join("; ")}). No data was retrieved.`
      : "FastMCP bridge is not configured. Set FASTMCP_FUNNEL_URL or FASTMCP_INTERNAL_URL. No data was retrieved.",
  };
}
