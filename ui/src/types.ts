/** Keep Visual Shell — types aligned with ui/docs/UI-CONTRACT.md */

export type LockState = "UNFORGED" | "live" | "locked" | string;

export type AgentState =
  | "idle"
  | "answering"
  | "working"
  | "waiting_human"
  | "failed"
  | "retired"
  | null
  | undefined;

export interface RoomChip {
  room_id: string;
  name: string;
  lock_state: LockState;
  x: number;
  y: number;
  /** Grid coords [gx, gy] from the spatial SOT (used for corridors + walking). */
  grid?: [number, number] | null;
  occupant_agent_id: string | null;
  status_summary?: string;
  queue_depth?: number;
  updated_at?: string;
  agent_state?: AgentState;
  agent_task?: string | null;
  agent_updated_at?: string | null;
  spec_status?: string | null;
  spec_valid?: boolean | null;
  agent_real?: boolean;
  /** Optional seat binding (client-side only; not from SOT). */
  seat_id?: string | null;
  preferred_agent?: string | null;
}

export interface CastleMapResponse {
  sot_status: string;
  sot_note?: string;
  version?: string;
  rooms: RoomChip[];
  agent_statuses?: AgentStatus[];
}

export interface AgentStatus {
  agent_id: string;
  state: string;
  task?: string | null;
  confidence?: number | null;
  session_id?: string | null;
  detail?: string | null;
  updated_at?: string;
}

export interface Gate {
  id: number;
  created_at: string;
  gate_type: string;
  subject_id: string;
  summary: string;
  status: string;
  payload?: string | null;
}

export interface GatesResponse {
  gates: Gate[];
  waiting_human_agents: AgentStatus[];
  count: number;
}

export interface PipelineEdge {
  from: string;
  to: string;
  label?: string;
}

export interface PipelineConfig {
  version?: string;
  note?: string;
  edges: PipelineEdge[];
}

export type RoomSelectHandler = (room: RoomChip | null) => void;

/** Seat binding — see config/seats.ts */
export interface Seat {
  id: string;
  name: string;
  role: string;
  roomId: string;
  roomAliases?: string[];
  agentId: string;
  openclawAgentId?: string;
  spriteKey: string;
  defaultPosition: { x: number; y: number };
  notes?: string;
}

/** Cost summary from get_cost_summary (Phase 0 may be zeros). */
export interface CostSummary {
  month: string;
  currency: string;
  monthly_ceiling: number | null;
  total_est_usd: number;
  by_agent: Array<{
    agent_id: string;
    tier_breakdown: { local: number; escalate: number; god: number };
    est_usd: number;
    call_count: number;
  }>;
  notes?: string;
}

/** Path result from get_path spatial tool. */
export interface PathResult {
  from_room: string;
  to_room: string;
  manhattan: number;
  rooms: string[];
  path_cells?: number[][];
  steps?: Array<{ from: number[]; to: number[]; dir: string }>;
  step_count?: number;
  error?: boolean;
  message?: string;
  code?: string;
}
