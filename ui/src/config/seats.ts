/**
 * Keep seats — maps spatial rooms ↔ agent roster.
 * Does not own lock_state or runtime status; those come from MCP /api/castle-map.
 * Room ids prefer the spatial six (great-hall, alchemy-lab, …).
 * Seed fallback (orchestrator, clawforge, …) is also recognized via aliases.
 */

export interface Seat {
  id: string;
  name: string;
  role: string;
  /** Primary room_id on the spatial map (MCP SOT). */
  roomId: string;
  /** Alternate room_ids from seed / older maps that resolve to this seat. */
  roomAliases?: string[];
  /** Agent Spec id (agents/*.agent-spec.json). */
  agentId: string;
  /** OpenClaw agent id when different (e.g. main → raziel). */
  openclawAgentId?: string;
  spriteKey: string;
  defaultPosition: { x: number; y: number };
  /** Optional fortress display status hint (not authoritative). */
  notes?: string;
}

/** Core roster only — no invented always-on agents. Phase 0 cost discipline. */
export const SEATS: Seat[] = [
  {
    id: "seat_throne",
    name: "Raziel",
    role: "Sovereign Arch-Orchestrator",
    roomId: "great-hall",
    roomAliases: ["orchestrator", "great_hall", "throne"],
    agentId: "raziel",
    openclawAgentId: "main",
    spriteKey: "raziel_sprite",
    defaultPosition: { x: 0, y: 0 },
    notes: "Great Hall · OpenClaw main maps to Keep agent_id raziel",
  },
  {
    id: "seat_ops",
    name: "Ops Warden",
    role: "Infrastructure & Heartbeat",
    roomId: "armory",
    roomAliases: ["scribe", "scribe-warden"],
    agentId: "ops", // no Spec yet — candidate only until forged
    spriteKey: "ops_sprite",
    defaultPosition: { x: 0, y: 1 },
    notes: "Armory · tools & MCP multiplex; Spec not required for seat map",
  },
  {
    id: "seat_research",
    name: "Oracle",
    role: "Research / Knowledge",
    roomId: "library",
    roomAliases: ["oracle", "observatory"],
    agentId: "oracle",
    spriteKey: "research_sprite",
    defaultPosition: { x: 1, y: 0 },
    notes: "Library · sealed until unlock_room after approve_spec",
  },
  {
    id: "seat_architect",
    name: "Clawforge",
    role: "Architect / Forge",
    roomId: "alchemy-lab",
    roomAliases: ["clawforge", "architect"],
    agentId: "clawforge",
    spriteKey: "architect_sprite",
    defaultPosition: { x: 1, y: 1 },
    notes: "Alchemy Lab · Spec APPROVED; runtime still human-gated",
  },
  {
    id: "seat_gardener",
    name: "Corvid",
    role: "Graph Gardener / Memory",
    roomId: "roost",
    roomAliases: ["library", "graph-gardener", "graph_gardener"],
    agentId: "corvid",
    spriteKey: "gardener_sprite",
    defaultPosition: { x: 1, y: 0 },
    notes: "Library / Roost · Spec may be draft; no always-on loop",
  },
];

const byRoom = new Map<string, Seat>();
const byAgent = new Map<string, Seat>();

for (const s of SEATS) {
  byRoom.set(s.roomId, s);
  for (const a of s.roomAliases || []) byRoom.set(a, s);
  byAgent.set(s.agentId, s);
  if (s.openclawAgentId) byAgent.set(s.openclawAgentId, s);
}

export function getSeatByRoomId(roomId: string | null | undefined): Seat | null {
  if (!roomId) return null;
  return byRoom.get(roomId) ?? byRoom.get(roomId.toLowerCase()) ?? null;
}

export function getSeatByAgentId(agentId: string | null | undefined): Seat | null {
  if (!agentId) return null;
  return byAgent.get(agentId) ?? byAgent.get(agentId.toLowerCase()) ?? null;
}

/** Known agent ids for RBAC-style client guards (writes only for listed ids). */
export const KNOWN_AGENT_IDS: ReadonlySet<string> = new Set(
  SEATS.flatMap((s) =>
    [s.agentId, s.openclawAgentId].filter((x): x is string => !!x),
  ),
);

export function isKnownAgent(agentId: string | null | undefined): boolean {
  if (!agentId) return false;
  return KNOWN_AGENT_IDS.has(agentId) || KNOWN_AGENT_IDS.has(agentId.toLowerCase());
}
