import fixture from "./pulse.fixture.json";
import { dashboardStatus } from "./box-adapter";
import { mcpConfigured } from "./mcp";

/** Where the occupancy chips came from. Never call paper "live". */
export type PulseSource = "live" | "paper";

export type PulseRoom = {
  id: string;
  keepSlug: string | null;
  name: string;
  empty: boolean;
  agent: string;
  status: string;
};

export type KeepPulse = {
  source: PulseSource;
  asOf: string;
  note?: string;
  network: string;
  networkDetail: string;
  agentsActive: number;
  rooms: PulseRoom[];
  services: {
    reclaw: string;
    openclaw: string;
    mcp: string;
  };
  queue: {
    status: string;
    cursor: number;
    pending?: number;
  };
  /** Local models the box's dashboard counts. May lag the Ollama server itself. */
  ollamaModels?: number;
};

/**
 * dashboard_status reports a service as a string on some builds and as an
 * object ({status} or {ok}) on others. Stringifying the object yields
 * "[object Object]" on the badge, so collapse it to a label here.
 */
function serviceLabel(v: unknown): string {
  if (v === null || v === undefined) return "unknown";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "ok" : "down";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.status === "string" && o.status) return o.status;
    if (typeof o.ok === "boolean") return o.ok ? "ok" : "down";
    if (typeof o.compose === "string" && o.compose) return o.compose;
  }
  return "unknown";
}

function asPulse(raw: unknown, source: PulseSource): KeepPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rooms = Array.isArray(o.rooms) ? o.rooms : [];
  const svc = o.services as Record<string, unknown> | undefined;
  // The box calls it county_queue; the fixture calls it queue.
  const queue = (o.queue ?? o.county_queue) as Record<string, unknown> | undefined;
  const mcpLabel = serviceLabel(svc?.mcp);
  const bridge = typeof o.bridge === "string" ? o.bridge : "";
  return {
    source,
    asOf: String(o.asOf ?? o.generated_at ?? new Date().toISOString()),
    note: typeof o.note === "string" ? o.note : undefined,
    network: String(o.network ?? "UNKNOWN"),
    networkDetail: String(o.networkDetail ?? o.network_detail ?? ""),
    agentsActive: Number(o.agentsActive ?? o.agents_active ?? 0),
    rooms: rooms.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        keepSlug: typeof row.keepSlug === "string" ? row.keepSlug : null,
        name: String(row.name ?? ""),
        empty: Boolean(row.empty),
        agent: String(row.agent ?? ""),
        status: String(row.status ?? ""),
      };
    }),
    services: {
      // The box names it reclaw_api; older fixtures say reclaw.
      reclaw: serviceLabel(svc?.reclaw ?? svc?.reclaw_api),
      openclaw: serviceLabel(svc?.openclaw),
      // dashboard_status deliberately leaves mcp "unprobed" (a self-probe
      // deadlocks the single-worker bridge), so fall back to the unit state.
      mcp: mcpLabel === "unprobed" && bridge ? bridge : mcpLabel,
    },
    queue: {
      status: String(queue?.status ?? "unknown"),
      cursor: Number(queue?.cursor ?? 0),
      pending:
        Number(queue?.pending ?? queue?.pending_county ?? 0) || undefined,
    },
    ollamaModels:
      typeof svc?.ollama_models === "number" ? (svc.ollama_models as number) : undefined,
  };
}

/** Paper fixture — last known box snapshot, labeled paper until KEEP_PULSE_URL answers. */
export function paperPulse(): KeepPulse {
  return asPulse(fixture, "paper") ?? {
    source: "paper",
    asOf: new Date().toISOString(),
    network: "UNKNOWN",
    networkDetail: "No pulse fixture",
    agentsActive: 0,
    rooms: [],
    services: { reclaw: "unknown", openclaw: "unknown", mcp: "unknown" },
    queue: { status: "unknown", cursor: 0 },
  };
}

/**
 * A live source with no room list is honest about occupancy rather than
 * letting empty chips read as "every room idle". Applies to both live paths.
 */
function withOccupancyNote(live: KeepPulse): KeepPulse {
  if (live.rooms.length) return live;
  return { ...live, note: "Box is live but reports no room occupancy — chips stay unknown." };
}

/**
 * Box adapter, in order of trust:
 *   1. MCP dashboard_status — the real control plane.
 *   2. KEEP_PULSE_URL — status.json or a same-network proxy.
 *   3. The paper fixture, always labeled paper.
 *
 * Never point either at a public Funnel URL from source control.
 */
export async function fetchKeepPulse(): Promise<KeepPulse> {
  const notes: string[] = [];

  if (mcpConfigured()) {
    const box = await dashboardStatus();
    if (box.ok && box.json) {
      const live = asPulse(box.json, "live");
      if (live) return withOccupancyNote(live);
      notes.push("MCP dashboard_status did not match the pulse shape");
    } else if (!box.ok) {
      notes.push(box.error);
    }
  }

  const url = process.env.KEEP_PULSE_URL?.trim();
  if (url) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const json: unknown = await res.json();
        const live = asPulse(json, "live");
        if (live) return withOccupancyNote(live);
        notes.push("pulse JSON did not match");
      } else {
        notes.push(`pulse HTTP ${res.status}`);
      }
    } catch (err) {
      notes.push(err instanceof Error ? err.message : "pulse fetch failed");
    }
  } else if (!mcpConfigured()) {
    notes.push("No MCP_BASE_URL and no KEEP_PULSE_URL — nothing to ask");
  }

  return { ...paperPulse(), note: notes.join(" | ") || undefined };
}

export function pulseForSlug(pulse: KeepPulse, slug: string) {
  return pulse.rooms.find((r) => r.keepSlug === slug) ?? null;
}
