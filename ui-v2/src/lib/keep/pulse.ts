import fixture from "./pulse.fixture.json";

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
};

function asPulse(raw: unknown, baseSource: PulseSource): KeepPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rooms = Array.isArray(o.rooms) ? o.rooms : [];

  // A live endpoint that explicitly reports its source of truth as offline
  // is not live. Demote it rather than show a green network badge over a
  // dead system.
  const source: PulseSource = baseSource === "live" && o.sot_status === "offline" ? "paper" : baseSource;

  const agentsActive = Number(o.agentsActive ?? o.agents_active ?? rooms.reduce((acc: number, r: any) => acc + (r?.agent_ids?.length || 0), 0) ?? 0);

  return {
    source,
    asOf: String(o.asOf ?? o.generated_at ?? new Date().toISOString()),
    note: typeof o.note === "string" ? o.note : undefined,
    network: String(o.network ?? "CONNECTED"),
    networkDetail: String(o.networkDetail ?? o.sot_note ?? ""),
    agentsActive,
    rooms: rooms.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      // agent_real false marks a seed-fixture row, not a live occupant.
      const isReal = row.agent_real !== false;
      let empty = Boolean(row.empty ?? ((row.agent_ids as string[] | undefined)?.length === 0));
      if ("occupant_agent_id" in row) empty = !row.occupant_agent_id;
      if (source === "paper" && !isReal) {
        // Never render an idle chip furnished by a paper seed.
        empty = true;
      }
      return {
        id: String(row.id ?? row.room_id ?? ""),
        keepSlug: typeof row.keepSlug === "string" ? row.keepSlug : typeof row.room_id === "string" ? row.room_id : null,
        name: String(row.name ?? ""),
        empty,
        agent: String(row.agent ?? row.occupant_agent_id ?? row.status_summary ?? ""),
        status: String(row.status ?? row.agent_state ?? row.lock_state ?? (isReal ? "" : "UNFORGED")),
      };
    }),
    services: {
      reclaw: String((o.services as Record<string, unknown> | undefined)?.reclaw ?? "ok"),
      openclaw: String((o.services as Record<string, unknown> | undefined)?.openclaw ?? "ok"),
      mcp: String((o.services as Record<string, unknown> | undefined)?.mcp ?? "ok"),
    },
    queue: {
      status: String((o.queue as Record<string, unknown> | undefined)?.status ?? "idle"),
      cursor: Number((o.queue as Record<string, unknown> | undefined)?.cursor ?? 0),
      pending: Number((o.queue as Record<string, unknown> | undefined)?.pending ?? 0) || undefined,
    },
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
 * Box adapter. KEEP_PULSE_URL should be status.json or a same-network proxy.
 * Never point this at a public Funnel URL from source control.
 */
export async function fetchKeepPulse(): Promise<KeepPulse> {
  const url = process.env.KEEP_PULSE_URL?.trim();
  if (!url) return paperPulse();
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ...paperPulse(), note: `pulse HTTP ${res.status}` };
    const json: unknown = await res.json();
    return asPulse(json, "live") ?? { ...paperPulse(), note: "pulse JSON did not match" };
  } catch (err) {
    return { ...paperPulse(), note: err instanceof Error ? err.message : "pulse fetch failed" };
  }
}

export function pulseForSlug(pulse: KeepPulse, slug: string) {
  return pulse.rooms.find((r) => r.keepSlug === slug) ?? null;
}
