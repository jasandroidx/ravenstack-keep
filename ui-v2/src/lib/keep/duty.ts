export type DutyStatus = "busy" | "idle" | "leave";
export type RoomLight = "busy" | "live" | "quiet" | "dark";

export type DutyAgent = {
  agent_id: string;
  name: string;
  room_id: string | null;
  room_name: string | null;
  status: DutyStatus;
  last_active: string | null;
  last_real_work: string | null;
  signal: string;
};

export type DutyRoom = {
  room_id: string;
  name: string;
  kind: string;
  light: RoomLight;
  occupants: string[];
  last_event: string | null;
  updated_at: string | null;
  detail: string;
};

export type DutyBoard = {
  schema: string;
  generated_at: string;
  quiet_leave_after: string;
  source: string;
  rooms: DutyRoom[];
  duty: DutyAgent[];
};

export type DutyBoardRead =
  | { ok: true; board: DutyBoard }
  | { ok: false; error: string };

const KEEP_HTTP_URL = (
  process.env.KEEP_HTTP_URL?.trim() || "http://127.0.0.1:8112"
).replace(/\/$/, "");

/**
 * Shift board read. Runs server-side (TanStack Start SSR) so it can reach the
 * Keep HTTP API on the box. Fails closed: an unreadable board returns an error
 * string, never a fabricated roster. Zero model calls.
 */
export async function fetchDutyBoard(): Promise<DutyBoardRead> {
  try {
    const res = await fetch(`${KEEP_HTTP_URL}/api/duty`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `Keep http ${res.status}` };
    const json: unknown = await res.json();
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Duty payload was not an object" };
    }
    const board = json as DutyBoard;
    if (!Array.isArray(board.duty) || !Array.isArray(board.rooms)) {
      return { ok: false, error: "Duty payload did not match the board contract" };
    }
    return { ok: true, board };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Duty fetch failed",
    };
  }
}

export const LIGHT_META: Record<RoomLight, { label: string; color: string }> = {
  busy: { label: "busy", color: "#ff2a6d" },
  live: { label: "live", color: "#39ff14" },
  quiet: { label: "quiet", color: "#ffc857" },
  dark: { label: "dark", color: "#3a3f4b" },
};

export const DUTY_META: Record<DutyStatus, { label: string; color: string }> = {
  busy: { label: "busy", color: "#ff2a6d" },
  idle: { label: "idle", color: "#39ff14" },
  leave: { label: "leave", color: "#ff3b3b" },
};