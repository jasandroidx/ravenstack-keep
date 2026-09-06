export type LockState = "live" | "unforged" | "locked";
export type SpecStatus = "draft" | "approved" | "live" | "retired";
export type ModelTier = "local" | "escalate" | "god";

export type Room = {
  slug: string;
  name: string;
  wing: string;
  occupant: string;
  role: string;
  lock: LockState;
  specStatus: SpecStatus;
  purpose: string;
  kill: string;
  modelDefault: ModelTier;
  col: 1 | 2 | 3;
  row: 1 | 2 | 3 | 4;
  href?: string;
  image?: string;
};

export type ToolRow = {
  name: string;
  source: string;
  access: string;
  notes: string;
};

export type AgentSpec = {
  id: string;
  name: string;
  status: SpecStatus;
  character: string;
  roomName: string;
  roomId: string;
  lock: LockState;
  purpose: string;
  modelDefault: ModelTier;
  allowedTiers: ModelTier[];
  localHint: string;
  escalateWhen: string;
  godMode: string;
  tools: ToolRow[];
  existingSkills: { name: string; notes: string }[];
  forgeSkills: { name: string; notes: string }[];
  indexes: string[];
  vaultGlobs: string[];
  knowledgeNotes: string;
  onDemand: boolean;
  cron: string | null;
  triggerNotes: string;
  handoffsOut: { target: string; when: string }[];
  handoffsIn: { target: string; when: string }[];
  gates: string[];
  kill: string;
  success: string[];
  examples: string[];
  notes: string;
};

export type KnowledgeDoc = {
  id: string;
  title: string;
  scope: "self" | "domain" | "longtail";
  body: string;
};

export type DraftSpec = {
  id: string;
  name: string;
  character: string;
  room_name: string;
  purpose: string;
  model_tier_default: ModelTier;
  tools: string[];
  skills_existing: string[];
  skills_to_write: string[];
  knowledge_indexes: string[];
  human_gates: string[];
  kill_condition: string;
  success_criteria: string[];
  overlap_notes: string;
  interrogation: string;
};

export type CouncilSeat = {
  seat: string;
  stance: string;
};

export type TableResult = {
  chair: string;
  seats: CouncilSeat[];
  consensus: string;
  risks: string[];
  next: string;
};

export type SavedDraft = {
  id: number;
  idea: string;
  interrogation: string | null;
  spec: DraftSpec;
  status: string;
  created_at: string;
};
