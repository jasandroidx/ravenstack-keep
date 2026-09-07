import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

const GATES_URL = "http://127.0.0.1:8120/api/gates";
const APPROVE_URL = "http://127.0.0.1:8120/api/approve-spec";
const UNLOCK_URL = "http://127.0.0.1:8120/api/unlock-room";

export type Gate = {
  id: number;
  created_at: string;
  gate_type: "approve_spec" | "unlock_room";
  subject_id: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  payload: Record<string, any>;
};

export type GatesResponse = {
  gates: Gate[];
  waiting_human_agents: any[];
  count: number;
};

export const fetchGates = createServerFn({ method: "GET" }).handler(async (): Promise<GatesResponse> => {
  try {
    const res = await fetch(GATES_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return { gates: [], waiting_human_agents: [], count: 0 };
    return await res.json();
  } catch {
    return { gates: [], waiting_human_agents: [], count: 0 };
  }
});

export const approveSpecServer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((agentId: string) => agentId)
  .handler(async ({ data: agentId }) => {
    try {
      const res = await fetch(APPROVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "Failed to approve spec" };
      return { ok: true, result: data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Approval failed" };
    }
  });

export const unlockRoomServer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((roomId: string) => roomId)
  .handler(async ({ data: roomId }) => {
    try {
      const res = await fetch(UNLOCK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "Failed to unlock room" };
      return { ok: true, result: data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unlock failed" };
    }
  });
