import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/**
 * Pending Approvals — the Keep's OWN human gates (approve_spec / unlock_room),
 * the keep.db queue served by the Keep HTTP API (/api/gates), distinct from
 * the bridge gate queue (county/session) rendered by WarTablePanel.
 *
 * Human gates are permanent: the HTTP API itself refuses a call unless
 * `confirm: true` is present (403 confirm_required otherwise). These server
 * fns run inside the Nitro server and reach the API over loopback —
 * `KEEP_HTTP_URL` mirrors duty.ts, never a browser-facing URL.
 */

const KEEP_HTTP_URL = process.env.KEEP_HTTP_URL?.trim() || "http://127.0.0.1:8112";

export type JsonRecord = {
  [key: string]: string | number | boolean | null | JsonRecord | JsonRecord[];
};

export type Gate = {
  id: number;
  created_at: string;
  gate_type: "approve_spec" | "unlock_room";
  subject_id: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  payload: JsonRecord;
};

export type GatesResponse = {
  gates: Gate[];
  waiting_human_agents: JsonRecord[];
  count: number;
};

const EMPTY_GATES: GatesResponse = { gates: [], waiting_human_agents: [], count: 0 };

export const fetchKeepGates = createServerFn({ method: "GET" }).handler(async () => {
  return await loadKeepGates();
});

async function loadKeepGates(): Promise<GatesResponse> {
  try {
    const res = await fetch(`${KEEP_HTTP_URL}/api/gates`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return EMPTY_GATES;
    return (await res.json()) as GatesResponse;
  } catch {
    return EMPTY_GATES;
  }
}

/**
 * Approve a Keep gate.
 *
 * The HTTP API refuses this without `confirm: true`, so an auto-supplied flag
 * would make the gate decorative: anyone who could reach this function could
 * approve anything. The caller must therefore state that a human confirmed it
 * (`confirmed`, the result of the two-step ask in the UI) and the server adds
 * `confirm: true` only after that check passes.
 */
export const approveKeepGate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { agentId?: string; roomId?: string; confirmed?: boolean }) => ({
      agentId: input.agentId,
      roomId: input.roomId,
      confirmed: input.confirmed === true,
    })
  )
  .handler(async ({ data }) => {
    if (!data.confirmed) {
      return {
        ok: false as const,
        error: "Refused: a Keep gate needs an explicit operator confirmation.",
      };
    }
    const gateUrl = data.roomId
      ? `${KEEP_HTTP_URL}/api/unlock-room`
      : `${KEEP_HTTP_URL}/api/approve-spec`;
    const gateBody = data.roomId
      ? { room_id: data.roomId, confirm: true }
      : { agent_id: data.agentId, confirm: true };
    try {
      const res = await fetch(gateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gateBody),
      });
      const json = (await res.json().catch(() => ({}))) as JsonRecord;
      if (!res.ok) return { ok: false as const, error: String(json.error ?? `HTTP ${res.status}`) };
      return { ok: true as const, result: json };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Gate action failed" };
    }
  });