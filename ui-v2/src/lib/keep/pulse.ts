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

function asPulse(raw: unknown, source: PulseSource): KeepPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rooms = Array.isArray(o.rooms) ? o.rooms : [];
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
      reclaw: String((o.services as Record<string, unknown> | undefined)?.reclaw ?? "unknown"),
      openclaw: String((o.services as Record<string, unknown> | undefined)?.openclaw ?? "unknown"),
      mcp: String((o.services as Record<string, unknown> | undefined)?.mcp ?? "unknown"),
    },
    queue: {
      status: String((o.queue as Record<string, unknown> | undefined)?.status ?? "unknown"),
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
