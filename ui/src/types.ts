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

export type ModelTier = "local" | "escalate" | "god" | string;

/** One agent living in / visiting a room (Library can host two). */
export interface RoomOccupant {
  agent_id: string;
  agent_state?: AgentState;
  agent_task?: string | null;
  sprite_hint?: string | null;
  presence_room_id?: string | null;
  spec_status?: string | null;
  spec_valid?: boolean | null;
  agent_real?: boolean;
}

export interface RoomChip {
  room_id: string;
  name: string;
  lock_state: LockState;
  x: number;
  y: number;
  grid?: number[] | null;
  occupant_agent_id: string | null;
  /** Co-residents (e.g. scribe beside oracle in Library). */
  co_occupants?: string[];
  agent_ids?: string[];
  occupants?: RoomOccupant[];
  status_summary?: string;
  queue_depth?: number;
  updated_at?: string;
  agent_state?: AgentState;
  agent_task?: string | null;
  agent_updated_at?: string | null;
  sprite_hint?: string | null;
  presence_room_id?: string | null;
  model_tier?: ModelTier;
  spec_status?: string | null;
  spec_valid?: boolean | null;
  agent_real?: boolean;
}

export interface CastleMapResponse {
  sot_status: string;
  sot_note?: string;
  version?: string;
  generated_at?: string;
  poll_interval_sec?: number;
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
  room_id?: string | null;
  sprite_hint?: string | null;
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

export interface PathResponse {
  path_cells?: number[][];
  steps?: Array<{ dir?: string; to?: number[] }>;
  rooms?: string[];
  manhattan?: number;
  error?: string;
  code?: string;
}

export interface CostSummary {
  month?: string;
  total_est_usd?: number;
  by_agent?: Array<{
    agent_id: string;
    est_usd: number;
    tier_breakdown?: Record<string, number>;
  }>;
  notes?: string;
}

export type RoomSelectHandler = (room: RoomChip | null) => void;
