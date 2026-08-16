/** Keep Visual Shell — types aligned with live /api/castle-map */

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

export interface OccupantChip {
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
  status?: string;
  x: number;
  y: number;
  grid?: number[] | null;
  occupant_agent_id: string | null;
  co_occupants?: string[];
  agent_ids?: string[];
  occupants?: OccupantChip[];
  status_summary?: string;
  queue_depth?: number;
  updated_at?: string;
  agent_state?: AgentState;
  agent_task?: string | null;
  agent_updated_at?: string | null;
  spec_status?: string | null;
  spec_valid?: boolean | null;
  agent_real?: boolean;
  sprite_hint?: string | null;
  presence_room_id?: string | null;
  model_tier?: string | null;
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

export type RoomSelectHandler = (room: RoomChip | null) => void;

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

export interface PathResponse {
  from_room?: string;
  to_room?: string;
  manhattan?: number;
  rooms?: string[];
  path_cells?: number[][];
  steps?: Array<{ from: number[]; to: number[]; dir: string }>;
  step_count?: number;
  error?: boolean;
  message?: string;
  code?: string;
}

/** @deprecated use PathResponse */
export type PathResult = PathResponse;


/**
 * ReClaw (:8000) operator state, reached through the Keep's allow-listed
 * bridge at /api/reclaw/*. This is the "what needs a decision from me" half —
 * the Keep's own gates cover specs and rooms, ReClaw covers the county queue
 * and capability grants.
 */
export interface ReclawPendingApproval {
  session_id: string;
  capability?: string;
  name?: string;
  risk?: string;
  requested_at?: string;
  reason?: string;
}

export interface ReclawCountyCard {
  county?: string;
  status?: string;
  risk_score?: number | null;
  flag_count?: number;
  short_count?: number;
  top_finding?: string | null;
}

export interface ReclawState {
  generated_at?: string;
  county_queue?: {
    cursor?: number;
    status?: string;
    next_county?: { name?: string; fips?: string } | null;
    pending_card?: ReclawCountyCard | null;
    pending_review?: ReclawCountyCard | null;
    error?: string;
  };
  jobs?: { running?: unknown[]; recent?: unknown[] };
  pending_approvals?: ReclawPendingApproval[];
  error?: string;
}
