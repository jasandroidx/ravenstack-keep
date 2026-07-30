import type {
  CastleMapResponse,
  GatesResponse,
  PipelineConfig,
} from "./types";

const API = "/api";

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
    return { map, source: "api" };
  } catch {
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
    return await getJson<GatesResponse>(`${API}/gates`);
  } catch {
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
  return postJson(`${API}/approve-spec`, {
    agent_id: agentId,
    confirm: true,
  });
}

export async function unlockRoom(roomId: string): Promise<unknown> {
  return postJson(`${API}/unlock-room`, {
    room_id: roomId,
    confirm: true,
  });
}

export async function reportStatus(
  agentId: string,
  state: string,
  task?: string,
): Promise<unknown> {
  return postJson(`${API}/report-status`, {
    agent_id: agentId,
    state,
    task,
  });
}

export async function fetchHealth(): Promise<{ status: string } | null> {
  try {
    return await getJson(`${API}/health`);
  } catch {
    return null;
  }
}
