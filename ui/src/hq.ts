/**
 * Suikoden-HQ layer — who stands where, what they actually do, and how the
 * castle ranks up.
 *
 * Rules this file obeys:
 *  - Every "ask" is a thing the officer can really be asked today. No flavor-
 *    only lines, no capabilities we have not wired.
 *  - Sealed wings describe what would unlock them, never pretend an occupant.
 *  - Rank is derived from live rooms + officers with a real Spec. Nothing here
 *    invents a number.
 */

import type { RoomChip } from "./types";

export interface Officer {
  agentId: string;
  name: string;
  /** One-line post, Suikoden roster style. */
  role: string;
  /** Room they stand in. */
  roomId: string;
  portrait: string;
  sprite: string;
  /** Spoken when you walk up. Short. Concrete. */
  greeting: string;
  /** What to actually ask this officer — shown as command lines. */
  asks: string[];
  /** Where the real work happens, so Jason knows where to go. */
  channel: string;
}

export const OFFICERS: Officer[] = [
  {
    agentId: "raziel",
    name: "Raziel",
    role: "Voice of the Keep",
    roomId: "great-hall",
    portrait: "/art/portraits/portrait_raziel.png",
    sprite: "/art/agents/agent_raziel.png",
    greeting:
      "The hall is yours. I hold the gates and I speak for the Keep — I do not stamp them.",
    asks: [
      "What is waiting on me right now?",
      "Give me the state of the Keep.",
      "Hand this job to Clawforge.",
    ],
    channel: "Discord · OpenClaw main",
  },
  {
    agentId: "oracle",
    name: "Oracle",
    role: "Keeper of the Vault Question",
    roomId: "library",
    portrait: "/art/portraits/portrait_oracle.png",
    sprite: "/art/agents/agent_oracle.png",
    greeting:
      "Ask a question with an answer already written down. I read the vault, I do not guess.",
    asks: [
      "What do my notes say about <topic>?",
      "Find the decision we made on <thing>.",
      "Which packages mention <term>?",
    ],
    channel: "Keep MCP · query_knowledge / read_vault_file",
  },
  {
    agentId: "scribe",
    name: "Scribe",
    role: "Master of the Inbox Mill",
    roomId: "library",
    portrait: "/art/portraits/portrait_scribe.png",
    sprite: "/art/agents/agent_scribe.png",
    greeting:
      "Bring me the pile. I cut it down to what needs your hand and what does not.",
    asks: [
      "Summarise this thread into a decision.",
      "Draft the reply — I will sign it.",
      "What came in that I have not read?",
    ],
    channel: "Keep MCP · notes and digests",
  },
  {
    agentId: "clawforge",
    name: "Clawforge",
    role: "Architect of the Forge",
    roomId: "alchemy-lab",
    portrait: "/art/portraits/portrait_clawforge.png",
    sprite: "/art/agents/agent_clawforge.png",
    greeting:
      "I draw the Spec. I never light the forge myself — that stamp is yours alone.",
    asks: [
      "Draft a Spec for a new officer.",
      "What would it take to forge the Kitchen?",
      "Review this Spec before I stamp it.",
    ],
    channel: "Keep MCP · draft_agent_spec (human gate on approve)",
  },
  {
    agentId: "corvid",
    name: "Corvid",
    role: "Gardener of the Graph",
    roomId: "roost",
    portrait: "/art/portraits/portrait_corvid.png",
    sprite: "/art/agents/agent_corvid.png",
    greeting:
      "The roost is cold. Stamp my Spec and I will fetch, and remember what I fetched.",
    asks: [
      "(sealed) Fetch and file this source.",
      "(sealed) What links to <note>?",
    ],
    channel: "Roost — UNFORGED, no always-on loop",
  },
];

const OFFICER_BY_AGENT = new Map(OFFICERS.map((o) => [o.agentId, o]));

export function getOfficer(agentId: string | null | undefined): Officer | null {
  if (!agentId) return null;
  return OFFICER_BY_AGENT.get(agentId) ?? null;
}

/** Officers whose post is this room (Library holds two). */
export function officersInRoom(roomId: string): Officer[] {
  return OFFICERS.filter((o) => o.roomId === roomId);
}

// ---------------------------------------------------------------------------
// Room lore — sealed wings say what earns them, never fake an occupant.
// ---------------------------------------------------------------------------

export interface RoomLore {
  title: string;
  /** Spoken line when you enter / talk with no officer present. */
  line: string;
  /** What this wing is for, plain language. */
  purpose: string;
  /** Only for sealed wings: what would forge it. */
  unlock?: string;
}

export const ROOM_LORE: Record<string, RoomLore> = {
  "great-hall": {
    title: "Great Hall",
    line: "Banners, a cold throne, and every road in the Keep meeting under it.",
    purpose: "Command. Raziel stands here and routes the work.",
  },
  "alchemy-lab": {
    title: "Alchemy Lab",
    line: "Glass, heat, and a bench that is never quite clean. Clawforge works here.",
    purpose: "The forge. Specs are drafted here — stamping them is yours.",
  },
  library: {
    title: "Library",
    line: "Two desks, one lamp. Oracle reads, Scribe writes.",
    purpose: "Knowledge. Vault questions and the inbox mill.",
  },
  armory: {
    title: "Armory",
    line: "Tools on the wall, all of them sharp, none of them yours to swing blind.",
    purpose: "Tools and MCP multiplex. No officer posted.",
  },
  observatory: {
    title: "Observatory",
    line: "The dome is open. Cold air, and a long look at things not decided yet.",
    purpose: "Watch and compare. The council moved to the Round Table.",
  },
  vault: {
    title: "Vault",
    line: "Sealed in iron. Cost, secrets, and the things that bite.",
    purpose: "Restricted. Locked by design — not a wing to earn.",
  },
  "round-table": {
    title: "Round Table",
    line: "Five empty seats and dust on the wood. No one has been called yet.",
    purpose: "Council — many models argue one question, you take the answer.",
    unlock:
      "Needs a Spec for the council, then your stamp. No model routing is wired yet.",
  },
  "clock-tower": {
    title: "Clock Tower",
    line: "The pendulum hangs still. The Keep keeps time somewhere else for now.",
    purpose: "Crons and heartbeats — when things fire, and when they last did.",
    unlock: "Reads real heartbeats already. Stamp it to let it schedule.",
  },
  kitchen: {
    title: "Kitchen",
    line: "A cold hearth, a hook, and a pot big enough to feed the whole roster.",
    purpose: "The hearth — local models that cost nothing to run.",
    unlock: "Stamp it to route work to the local models by default.",
  },
  roost: {
    title: "Roost",
    line: "Feathers on the beam. Corvid has a perch here and nothing to do.",
    purpose: "Fetch and graph memory.",
    unlock: "Corvid's Spec is not stamped. No always-on loop until it is.",
  },
  gatehouse: {
    title: "Gatehouse",
    line: "The portcullis is down. Everything that enters the Keep is counted here.",
    purpose: "The Windows node — stamps and grants pass through.",
    unlock: "Sealed on purpose. The node is reached from outside the Keep.",
  },
};

export function getLore(roomId: string, name?: string): RoomLore {
  return (
    ROOM_LORE[roomId] ?? {
      title: name || roomId,
      line: "Bare stone. Nothing has been built here.",
      purpose: "Unassigned wing.",
    }
  );
}

// ---------------------------------------------------------------------------
// HQ rank
// ---------------------------------------------------------------------------

export interface HqRank {
  rank: number;
  title: string;
  score: number;
  live_rooms: number;
  sealed_rooms: number;
  locked_rooms: number;
  total_rooms: number;
  officers_real: number;
  next_rank_at: number | null;
  to_next: number;
}

const RANK_TIERS: Array<[number, string]> = [
  [6, "Hold"],
  [9, "Keep"],
  [12, "Citadel"],
  [16, "Fortress"],
];

/** Client-side mirror of /api/hq, used when the route is not deployed yet. */
export function rankFromRooms(rooms: RoomChip[]): HqRank {
  const live = rooms.filter((r) => r.lock_state === "live").length;
  const sealed = rooms.filter((r) => r.lock_state === "UNFORGED").length;
  const locked = rooms.filter((r) => r.lock_state === "locked").length;
  const real = new Set(
    rooms.filter((r) => r.agent_real && r.occupant_agent_id).map((r) => r.occupant_agent_id!),
  ).size;
  const score = live + real;

  let rank = 1;
  let title = "Waystation";
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (score >= RANK_TIERS[i][0]) {
      rank = i + 2;
      title = RANK_TIERS[i][1];
    }
  }
  const nextTier = RANK_TIERS.find((t) => t[0] > score);
  return {
    rank,
    title,
    score,
    live_rooms: live,
    sealed_rooms: sealed,
    locked_rooms: locked,
    total_rooms: rooms.length,
    officers_real: real,
    next_rank_at: nextTier ? nextTier[0] : null,
    to_next: nextTier ? nextTier[0] - score : 0,
  };
}

/** One-line "how to command" for the Great Hall. Reality, not jargon. */
export const HOW_TO_COMMAND: string[] = [
  "Rally — writes real presence, then walks Raziel the pipes. Proof the Keep is awake.",
  "Tour — the same walk, no writes. Just a look around the castle.",
  "Compact — folds the Library's memory down. Not a visual mode.",
  "Click any room to talk. Sealed wings will tell you what earns them.",
];
