import type {
  CastleMapResponse,
  CostSummary,
  GatesResponse,
  PathResponse,
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

export async function fetchPath(
  fromRoom: string,
  toRoom: string,
): Promise<PathResponse | null> {
  try {
    return await getJson<PathResponse>(
      `${API}/path?from=${encodeURIComponent(fromRoom)}&to=${encodeURIComponent(toRoom)}`,
    );
  } catch {
    return null;
  }
}

export async function fetchCostSummary(
  agentId?: string,
): Promise<CostSummary | null> {
  try {
    const q = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return await getJson<CostSummary>(`${API}/cost-summary${q}`);
  } catch {
    return null;
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
  roomId?: string,
): Promise<unknown> {
  return postJson(`${API}/report-status`, {
    agent_id: agentId,
    state,
    task,
    room_id: roomId,
  });
}

export async function reportPresence(body: {
  room_id: string;
  state: string;
  task_summary?: string;
  agent_id?: string;
  sprite_hint?: string;
}): Promise<unknown> {
  return postJson(`${API}/report-presence`, body);
}

export async function fetchHealth(): Promise<{ status: string } | null> {
  try {
    return await getJson(`${API}/health`);
  } catch {
    return null;
  }
}

export interface LibraryInboxFile {
  name: string;
  bytes: number;
  modified: string;
  rel_path: string;
  abs_path?: string;
}

export interface LibraryInboxResponse {
  inbox_dir: string;
  rel_root: string;
  count: number;
  files: LibraryInboxFile[];
  notes?: string;
}

export async function fetchLibraryInbox(): Promise<LibraryInboxResponse | null> {
  try {
    return await getJson<LibraryInboxResponse>(`${API}/library/inbox`);
  } catch {
    return null;
  }
}

/** Operator file pick → stage + default auto library-distill local-batch. */
export async function uploadLibraryFiles(
  files: FileList | File[],
  opts?: { agentId?: string; note?: string; autoDistill?: boolean },
): Promise<{
  ok: boolean;
  saved?: Array<{ original_name: string; rel_path: string; bytes: number }>;
  errors?: string[];
  next_step?: string;
  error?: string;
  distill?: DistillResponse;
}> {
  const fd = new FormData();
  const list = Array.from(files as FileList);
  for (const f of list) fd.append("files", f, f.name);
  fd.append("agent_id", opts?.agentId || "scribe");
  if (opts?.note) fd.append("note", opts.note);
  // Default ON — select file should finish the loop
  fd.append("auto_distill", opts?.autoDistill === false ? "0" : "1");
  const res = await fetch(`${API}/library/upload`, {
    method: "POST",
    body: fd,
  });
  const data = (await res.json()) as {
    ok?: boolean;
    saved?: Array<{ original_name: string; rel_path: string; bytes: number }>;
    errors?: string[];
    next_step?: string;
    error?: string;
    message?: string;
    distill?: DistillResponse;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.message || data.error || `upload ${res.status}`,
      errors: data.errors,
    };
  }
  return {
    ok: !!data.ok,
    saved: data.saved,
    errors: data.errors,
    next_step: data.next_step,
    distill: data.distill,
  };
}

export interface DistillResultRow {
  ok?: boolean;
  disposition?: string;
  score?: number;
  reason?: string;
  source_name?: string;
  output_rel?: string | null;
  error?: string;
}

export interface DistillResponse {
  ok?: boolean;
  count?: number;
  results?: DistillResultRow[];
  presence_summary?: string;
  skill?: string;
  mode?: string;
}

/** library-distill local-batch on inbox (skill SOT). */
export async function distillLibraryInbox(opts?: {
  files?: string[];
  limit?: number;
}): Promise<DistillResponse> {
  const res = await fetch(`${API}/library/distill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: opts?.files,
      limit: opts?.limit ?? 10,
    }),
  });
  return (await res.json()) as DistillResponse;
}

/** Walk-up jobs: distill_inbox | wake | sync_openclaw */
export async function runKeepJob(
  job: string,
  extra?: Record<string, unknown>,
): Promise<{ ok?: boolean; job?: string; result?: unknown; message?: string }> {
  const res = await fetch(`${API}/jobs/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job, ...extra }),
  });
  return (await res.json()) as {
    ok?: boolean;
    job?: string;
    result?: unknown;
    message?: string;
  };
}

/** Observatory Arena bout v0 */
export async function runArenaBout(question: string): Promise<{
  ok?: boolean;
  chair?: string;
  log_rel?: string;
  seats?: Array<{ name?: string; mode?: string; text?: string }>;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${API}/arena/bout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return (await res.json()) as {
    ok?: boolean;
    chair?: string;
    log_rel?: string;
    seats?: Array<{ name?: string; mode?: string; text?: string }>;
    message?: string;
    error?: string;
  };
}
