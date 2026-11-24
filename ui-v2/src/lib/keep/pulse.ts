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
  /** null when the payload did not report a count and none could be derived. */
  agentsActive: number | null;
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

/**
 * A real dashboard_status payload can report a service as an object
 * ({status} / {ok}) instead of a string — String(obj) then renders
 * "[object Object]" on the badge. Collapse it to a label instead.
 *
 * `fallback` is what the caller wants shown when the payload says NOTHING
 * about that service. Callers pass "unknown": a field the box omitted became
 * "ok" here once, which turned "we didn't hear" into "it's healthy".
 */
function serviceLabel(v: unknown, fallback: string): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "ok" : "down";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.status === "string" && o.status) return o.status;
    if (typeof o.ok === "boolean") return o.ok ? "ok" : "down";
    if (typeof o.compose === "string" && o.compose) return o.compose;
  }
  return fallback;
}

function asPulse(raw: unknown, baseSource: PulseSource): KeepPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rooms = Array.isArray(o.rooms) ? o.rooms : [];

  // A live endpoint that explicitly reports its source of truth as offline
  // is not live. Demote it rather than show a green network badge over a
  // dead system.
  const source: PulseSource =
    baseSource === "live" && o.sot_status === "offline" ? "paper" : baseSource;

  // A count is only reported when the payload actually carries one, or when
  // every room row exposes agent_ids so it can be derived honestly. Otherwise
  // it is null — "nobody is here" and "nobody looked" are different facts, and
  // defaulting to 0 states the first while meaning the second.
  const rawCount = o.agentsActive ?? o.agents_active;
  let agentsActive: number | null = null;
  if (typeof rawCount === "number" || typeof rawCount === "string") {
    const n = Number(rawCount);
    if (Number.isFinite(n)) agentsActive = n;
  } else if (
    rooms.length > 0 &&
    rooms.every((r) => Array.isArray((r as { agent_ids?: unknown })?.agent_ids))
  ) {
    agentsActive = rooms.reduce(
      (acc: number, r) =>
        acc + (r as { agent_ids: unknown[] }).agent_ids.length,
      0,
    );
  }

  return {
    source,
    asOf: String(o.asOf ?? o.generated_at ?? new Date().toISOString()),
    note: typeof o.note === "string" ? o.note : undefined,
    network: String(o.network ?? "unknown"),
    networkDetail: String(o.networkDetail ?? o.sot_note ?? ""),
    agentsActive,
    rooms: rooms.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      // agent_real false marks a seed-fixture row, not a live occupant.
      const isReal = row.agent_real !== false;
      let empty = Boolean(
        row.empty ?? (row.agent_ids as string[] | undefined)?.length === 0,
      );
      if ("occupant_agent_id" in row) empty = !row.occupant_agent_id;
      if (source === "paper" && !isReal) {
        // Never render an idle chip furnished by a paper seed.
        empty = true;
      }
      return {
        id: String(row.id ?? row.room_id ?? ""),
        keepSlug:
          typeof row.keepSlug === "string"
            ? row.keepSlug
            : typeof row.room_id === "string"
              ? row.room_id
              : null,
        name: String(row.name ?? ""),
        empty,
        agent: String(
          row.agent ?? row.occupant_agent_id ?? row.status_summary ?? "",
        ),
        status: String(
          row.status ??
            row.agent_state ??
            row.lock_state ??
            (isReal ? "" : "UNFORGED"),
        ),
      };
    }),
    services: {
      // Some payloads name it reclaw_api rather than reclaw.
      reclaw: serviceLabel(
        (o.services as Record<string, unknown> | undefined)?.reclaw ??
          (o.services as Record<string, unknown> | undefined)?.reclaw_api,
        "unknown",
      ),
      openclaw: serviceLabel(
        (o.services as Record<string, unknown> | undefined)?.openclaw,
        "unknown",
      ),
      mcp: serviceLabel(
        (o.services as Record<string, unknown> | undefined)?.mcp,
        "unknown",
      ),
    },
    queue: {
      // Some payloads name it county_queue rather than queue.
      status: String(
        (o.queue as Record<string, unknown> | undefined)?.status ??
          (o.county_queue as Record<string, unknown> | undefined)?.status ??
          "unknown",
      ),
      cursor: Number(
        (o.queue as Record<string, unknown> | undefined)?.cursor ??
          (o.county_queue as Record<string, unknown> | undefined)?.cursor ??
          0,
      ),
      pending:
        Number(
          (o.queue as Record<string, unknown> | undefined)?.pending ??
            (o.county_queue as Record<string, unknown> | undefined)
              ?.pending_county ??
            0,
        ) || undefined,
    },
  };
}

/**
 * Paper fixture — a timestamp and a note, nothing else. It used to carry a
 * stale box snapshot: two named agents mid-shift, green services, a queue
 * cursor. None of that was re-read, so all of it was a claim. Set
 * KEEP_PULSE_URL to read the box; until then this says only that.
 */
export function paperPulse(): KeepPulse {
  return (
    asPulse(fixture, "paper") ?? {
      source: "paper",
      asOf: new Date().toISOString(),
      network: "UNKNOWN",
      networkDetail: "No pulse fixture",
      agentsActive: null,
      rooms: [],
      services: { reclaw: "unknown", openclaw: "unknown", mcp: "unknown" },
      queue: { status: "unknown", cursor: 0 },
    }
  );
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
    return (
      asPulse(json, "live") ?? {
        ...paperPulse(),
        note: "pulse JSON did not match",
      }
    );
  } catch (err) {
    return {
      ...paperPulse(),
      note: err instanceof Error ? err.message : "pulse fetch failed",
    };
  }
}

export function pulseForSlug(pulse: KeepPulse, slug: string) {
  return pulse.rooms.find((r) => r.keepSlug === slug) ?? null;
}
