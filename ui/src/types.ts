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
