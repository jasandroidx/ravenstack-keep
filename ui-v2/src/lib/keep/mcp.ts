/**
 * Fortress MCP plane — streamable-HTTP JSON-RPC client for the FastMCP server.
 *
 * Replaces box-adapter.ts, which described these binds but never made a call.
 * Server-only. Env is read inside functions so this never lands in a browser bundle.
 *
 * Env:
 *   MCP_BASE_URL   e.g. http://127.0.0.1:8100/mcp  (KEEP_MCP_URL also accepted).
 *                  Prefer localhost/Tailscale. Never commit a Funnel URL.
 *   MCP_AUTH_TOKEN optional bearer. Never logged, never returned to the client.
 *   MCP_TIMEOUT_MS default 20000.
 *
 * FastMCP is single-worker by default: a tool that itself probes MCP can deadlock it.
 * Hence the hard timeout and the single in-flight initialize.
 */

import { errorText, isAbortError, isConnectionError } from "./net";

const DEFAULT_BASE = "http://127.0.0.1:8100/mcp";
const DEFAULT_TIMEOUT_MS = 20_000;
const PROTOCOL_VERSION = "2025-06-18";

function env(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[name]?.trim() ?? "";
}

/** The endpoint must end in /mcp — a bare host is the most common misconfiguration. */
export function mcpBaseUrl(): string {
  const raw = env("MCP_BASE_URL") || env("KEEP_MCP_URL") || DEFAULT_BASE;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const trimmed = withScheme.replace(/\/+$/, "");
  return /\/mcp$/i.test(trimmed) ? trimmed : `${trimmed}/mcp`;
}

export function mcpConfigured(): boolean {
  return Boolean(env("MCP_BASE_URL") || env("KEEP_MCP_URL"));
}

function timeoutMs(): number {
  const n = Number(env("MCP_TIMEOUT_MS"));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Redact anything that looks like a credential before it reaches a log or the UI. */
export function redact(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\b(sk|gsk|xai|ghp|glpat)-[A-Za-z0-9_-]{8,}/g, "[redacted-token]")
    .replace(/([?&](?:key|token|api_key|access_token)=)[^&\s]+/gi, "$1[redacted]");
}

export type McpFailure = { ok: false; error: string; hint?: string; base: string };

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

/** FastMCP answers either application/json or a one-shot SSE stream. Accept both. */
function parseRpcBody(body: string, contentType: string): JsonRpcResponse {
  const isSse = /text\/event-stream/i.test(contentType) || /^\s*(event|data):/m.test(body);
  if (!isSse) return JSON.parse(body) as JsonRpcResponse;

  let last: JsonRpcResponse | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      last = JSON.parse(payload) as JsonRpcResponse;
    } catch {
      /* keep the last parseable frame */
    }
  }
  if (!last) throw new Error("MCP returned an event stream with no JSON-RPC frame");
  return last;
}

let sessionId: string | null = null;
let sessionBase: string | null = null;
let initializing: Promise<void> | null = null;
let rpcId = 0;

function headers(base: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };
  const token = env("MCP_AUTH_TOKEN");
  if (token) h.Authorization = `Bearer ${token}`;
  if (sessionId && sessionBase === base) h["Mcp-Session-Id"] = sessionId;
  return h;
}

async function post(base: string, payload: unknown): Promise<{ status: number; body: string; contentType: string; session: string | null }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs());
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: headers(base),
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    return {
      status: res.status,
      body: await res.text(),
      contentType: res.headers.get("content-type") ?? "",
      session: res.headers.get("mcp-session-id"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function initialize(base: string): Promise<void> {
  const res = await post(base, {
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ravenstack-keep-hall", version: "0.1.0" },
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`initialize failed: HTTP ${res.status} — ${redact(res.body.slice(0, 300))}`);
  }
  const parsed = parseRpcBody(res.body, res.contentType);
  if (parsed.error) throw new Error(`initialize rejected: ${parsed.error.message ?? "unknown"}`);

  sessionId = res.session;
  sessionBase = base;

  // Required by the spec before any tool call. A 202 with no body is the norm.
  await post(base, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => undefined);
}

async function ensureSession(base: string): Promise<void> {
  if (sessionId && sessionBase === base) return;
  if (!initializing) {
    initializing = initialize(base).finally(() => {
      initializing = null;
    });
  }
  await initializing;
}

function describeFailure(err: unknown, base: string): McpFailure {
  const msg = redact(errorText(err));
  if (isAbortError(err)) {
    return {
      ok: false,
      base,
      error: `MCP timed out after ${timeoutMs()}ms at ${base}`,
      hint: "A single-worker FastMCP deadlocks if a tool probes MCP itself. Check the server, or raise MCP_TIMEOUT_MS.",
    };
  }
  if (isConnectionError(err)) {
    return {
      ok: false,
      base,
      error: `MCP unreachable at ${base} (${msg})`,
      hint: "Is the bridge up, and is Tailscale connected? The URL must end in /mcp.",
    };
  }
  return { ok: false, base, error: `MCP error at ${base}: ${msg}` };
}

async function rpc(method: string, params: unknown): Promise<unknown> {
  const base = mcpBaseUrl();
  await ensureSession(base);

  let res = await post(base, { jsonrpc: "2.0", id: ++rpcId, method, params });

  // 404/400 here means the server dropped our session. Re-handshake exactly once.
  if (res.status === 404 || res.status === 400) {
    sessionId = null;
    sessionBase = null;
    await ensureSession(base);
    res = await post(base, { jsonrpc: "2.0", id: ++rpcId, method, params });
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${method}: HTTP ${res.status} — ${redact(res.body.slice(0, 300))}`);
  }
  const parsed = parseRpcBody(res.body, res.contentType);
  if (parsed.error) throw new Error(`${method}: ${parsed.error.message ?? "unknown JSON-RPC error"}`);
  return parsed.result;
}

export type McpTool = { name: string; description: string };

export async function mcpListTools(): Promise<{ ok: true; base: string; tools: McpTool[] } | McpFailure> {
  const base = mcpBaseUrl();
  try {
    const result = (await rpc("tools/list", {})) as { tools?: Array<{ name?: string; description?: string }> };
    const tools = (result.tools ?? [])
      .map((t) => ({ name: String(t.name ?? ""), description: String(t.description ?? "") }))
      .filter((t) => t.name.length > 0);
    return { ok: true, base, tools };
  } catch (err) {
    return describeFailure(err, base);
  }
}

export type McpCallOk = { ok: true; base: string; text: string; json: unknown | null };

/**
 * Call one tool. Read-only by default — a gated tool still needs its own confirm
 * argument supplied by a human-gated caller, never defaulted here.
 */
export async function mcpCallTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallOk | McpFailure> {
  const base = mcpBaseUrl();
  try {
    const result = (await rpc("tools/call", { name, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    };

    const text = (result.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n")
      .trim();

    if (result.isError) {
      return { ok: false, base, error: `MCP tool ${name} reported an error: ${redact(text || "no detail")}` };
    }

    let json: unknown | null = result.structuredContent ?? null;
    if (json === null && text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { ok: true, base, text, json };
  } catch (err) {
    return describeFailure(err, base);
  }
}

/** Cheap liveness probe for the mechanic bench. Never throws. */
export async function mcpHealth(): Promise<{
  configured: boolean;
  base: string;
  reachable: boolean;
  toolCount: number;
  tools: string[];
  error?: string;
  hint?: string;
}> {
  const base = mcpBaseUrl();
  const listed = await mcpListTools();
  if (!listed.ok) {
    return { configured: mcpConfigured(), base, reachable: false, toolCount: 0, tools: [], error: listed.error, hint: listed.hint };
  }
  return {
    configured: mcpConfigured(),
    base,
    reachable: true,
    toolCount: listed.tools.length,
    tools: listed.tools.map((t) => t.name),
  };
}
