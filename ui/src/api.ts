import type {
  CastleMapResponse,
  CostSummary,
  GatesResponse,
  PathResult,
  PipelineConfig,
} from "./types";
import { isKnownAgent } from "./config/seats";

const API = "/api";

/** Tiny in-memory ring for audit-friendly client logs (no network). */
const TOOL_LOG: Array<{ ts: string; tool: string; agent_id?: string; ok: boolean }> = [];
const TOOL_LOG_MAX = 40;

function logTool(tool: string, agent_id: string | undefined, ok: boolean) {
  TOOL_LOG.push({
    ts: new Date().toISOString(),
    tool,
    agent_id,
    ok,
  });
  if (TOOL_LOG.length > TOOL_LOG_MAX) TOOL_LOG.shift();
  // eslint-disable-next-line no-console
  console.debug(`[keep-api] ${tool}`, { agent_id, ok, ts: TOOL_LOG[TOOL_LOG.length - 1].ts });
}

export function getToolLog() {
  return [...TOOL_LOG];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ||
        (data as { error?: string }).error ||
        `${path} → ${res.status}`,
    );
  }
  return data;
}

/** Live map from Keep HTTP API; falls back to static seed if API down. */
export async function fetchCastleMap(): Promise<{
  map: CastleMapResponse;
  source: "api" | "seed";
}> {
  try {
    const map = await getJson<CastleMapResponse>(`${API}/castle-map`);
    logTool("castle-map", undefined, true);
    return { map, source: "api" };
  } catch {
    logTool("castle-map", undefined, false);
    const map = await getJson<CastleMapResponse>("/castle_map.json");
    // seed lacks live enrichment — do not invent idle activity chips
    map.rooms = map.rooms.map((r) => ({
      ...r,
      agent_state: r.agent_state ?? null,
      agent_real: false,
    }));
    return { map, source: "seed" };
  }
}

export async function fetchGates(): Promise<GatesResponse> {
  try {
    const g = await getJson<GatesResponse>(`${API}/gates`);
    logTool("gates", undefined, true);
    return g;
  } catch {
    logTool("gates", undefined, false);
    return { gates: [], waiting_human_agents: [], count: 0 };
  }
}

export async function fetchPipeline(): Promise<PipelineConfig> {
  try {
    return await getJson<PipelineConfig>("/pipeline.json");
  } catch {
    return { edges: [] };
  }
}

export async function approveSpec(agentId: string): Promise<unknown> {
  if (!isKnownAgent(agentId)) {
    logTool("approve-spec", agentId, false);
    throw new Error(`Unknown agent_id '${agentId}' — not in seats / known roster`);
  }
  try {
    const r = await postJson(`${API}/approve-spec`, {
      agent_id: agentId,
      confirm: true,
    });
    logTool("approve-spec", agentId, true);
    return r;
  } catch (e) {
    logTool("approve-spec", agentId, false);
    throw e;
  }
}

export async function unlockRoom(roomId: string): Promise<unknown> {
  try {
    const r = await postJson(`${API}/unlock-room`, {
      room_id: roomId,
      confirm: true,
    });
    logTool("unlock-room", undefined, true);
    return r;
  } catch (e) {
    logTool("unlock-room", undefined, false);
    throw e;
  }
}

/**
 * report_agent_status write path.
 * Only known agent_ids; confirm pattern is implicit (human/UI already gated).
 */
export async function reportStatus(
  agentId: string,
  state: string,
  task?: string,
): Promise<unknown> {
  if (!isKnownAgent(agentId)) {
    logTool("report-status", agentId, false);
    throw new Error(`Unknown agent_id '${agentId}' — refuse write (RBAC)`);
  }
  try {
    const r = await postJson(`${API}/report-status`, {
      agent_id: agentId,
      state,
      task,
    });
    logTool("report-status", agentId, true);
    return r;
  } catch (e) {
    logTool("report-status", agentId, false);
    throw e;
  }
}

/** Alias used by zone helpers. */
export const reportAgentStatus = reportStatus;

/**
 * Spatial path between rooms (MCP get_path via HTTP).
 * Fail soft → null so UI never crashes if MCP briefly down.
 */
export async function fetchPath(
  fromRoom: string,
  toRoom: string,
): Promise<PathResult | null> {
  try {
    const q = new URLSearchParams({ from: fromRoom, to: toRoom });
    const data = await getJson<PathResult>(`${API}/path?${q}`);
    logTool("path", undefined, !data.error);
    if (data.error) return null;
    return data;
  } catch {
    logTool("path", undefined, false);
    return null;
  }
}

/**
 * Cost summary (Phase 0 may return zeros / notes).
 * Fail soft → null-shaped Phase 0 note.
 */
export async function fetchCostSummary(
  agentId?: string,
): Promise<CostSummary | null> {
  try {
    const q = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    const data = await getJson<CostSummary>(`${API}/cost-summary${q}`);
    logTool("cost-summary", agentId, true);
    return data;
  } catch {
    logTool("cost-summary", agentId, false);
    return {
      month: new Date().toISOString().slice(0, 7),
      currency: "USD",
      monthly_ceiling: null,
      total_est_usd: 0,
      by_agent: agentId
        ? [
            {
              agent_id: agentId,
              tier_breakdown: { local: 0, escalate: 0, god: 0 },
              est_usd: 0,
              call_count: 0,
            },
          ]
        : [],
      notes: "cost unknown — Phase 0 open (or /api/cost-summary not wired yet)",
    };
  }
}

// ---------------------------------------------------------------------------
// Suikoden-HQ chambers (read-only)
// ---------------------------------------------------------------------------

export interface HqResponse {
  hq: {
    rank: number;
    title: string;
    score: number;
    live_rooms: number;
    sealed_rooms: number;
    locked_rooms: number;
    total_rooms: number;
    officers_real: number;
    next_rank_at: number | null;
    to_next: number;
  };
  officers: Array<{
    agent_id: string;
    spec_status: string | null;
    real: boolean;
    state?: string | null;
    task?: string | null;
    updated_at?: string | null;
    room_id?: string | null;
  }>;
}

export interface KitchenResponse {
  reachable: boolean;
  models: Array<{ name: string; local: boolean; parameter_size?: string | null }>;
  count: number;
  local_count?: number;
  note: string;
}

export interface ClockResponse {
  has_pulse: boolean;
  last_tick?: string;
  last_agent?: string;
  ticks: Array<{ agent_id: string; state: string; task?: string | null; at: string }>;
  count: number;
  note: string;
}

export interface RoundTableResponse {
  lock_state: string | null;
  forged: boolean;
  seats: number;
  seated: string[];
  note: string;
  spend: string;
}

/** All four fail soft to null — the chamber then says "not on this build". */
export async function fetchHq(): Promise<HqResponse | null> {
  try {
    return await getJson<HqResponse>(`${API}/hq`);
  } catch {
    return null;
  }
}

export async function fetchKitchen(): Promise<KitchenResponse | null> {
  try {
    return await getJson<KitchenResponse>(`${API}/kitchen`);
  } catch {
    return null;
  }
}

export async function fetchClock(): Promise<ClockResponse | null> {
  try {
    return await getJson<ClockResponse>(`${API}/clock`);
  } catch {
    return null;
  }
}

export async function fetchRoundTable(): Promise<RoundTableResponse | null> {
  try {
    return await getJson<RoundTableResponse>(`${API}/round-table`);
  } catch {
    return null;
  }
}

/**
 * Arcane Library compaction hook. The route only exists on builds that wired
 * it; a 404 is reported honestly rather than faked as success.
 */
export async function libraryCompact(): Promise<
  { ok: true; data: unknown } | { ok: false; reason: string }
> {
  try {
    const res = await fetch(`${API}/library/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    if (res.status === 404 || res.status === 405) {
      return { ok: false, reason: "no compaction hook on this build" };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        reason:
          (data as { message?: string }).message || `compact → ${res.status}`,
      };
    }
    logTool("library-compact", undefined, true);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function fetchHealth(): Promise<{ status: string } | null> {
  try {
    return await getJson(`${API}/health`);
  } catch {
    return null;
  }
}
