/**
 * Suikoden-style HQ layer — castle rank, officer talk lines, wing lore.
 * Does not invent agent work. Rank is derived from live rooms + real specs.
 */
import type { RoomChip } from "./types";

export interface HqRank {
  rank: number;
  title: string;
  next: string;
  liveRooms: number;
  realOfficers: number;
}

export interface Officer {
  id: string;
  name: string;
  role: string;
  home: string;
  portrait: string;
}

export const OFFICERS: Record<string, Officer> = {
  raziel: {
    id: "raziel",
    name: "Raziel",
    role: "Sovereign",
    home: "great-hall",
    portrait: "/art/portraits/portrait_raziel.png",
  },
  oracle: {
    id: "oracle",
    name: "Oracle",
    role: "Librarian",
    home: "library",
    portrait: "/art/portraits/portrait_oracle.png",
  },
  scribe: {
    id: "scribe",
    name: "Scribe",
    role: "Archivist",
    home: "library",
    portrait: "/art/portraits/portrait_scribe.png",
  },
  clawforge: {
    id: "clawforge",
    name: "Clawforge",
    role: "Smith",
    home: "alchemy-lab",
    portrait: "/art/portraits/portrait_clawforge.png",
  },
  corvid: {
    id: "corvid",
    name: "Corvid",
    role: "Scout",
    home: "roost",
    portrait: "/art/portraits/portrait_corvid.png",
  },
};

export const ROOM_LORE: Record<
  string,
  { title: string; line: string; suikoden: string }
> = {
  "great-hall": {
    title: "Great Hall",
    line: "The throne and the war table. Raziel holds command here.",
    suikoden: "Your HQ. Officers report. You give the order.",
  },
  library: {
    title: "Library",
    line: "Vault Q&A and the inbox mill. Oracle cites. Scribe files.",
    suikoden: "The archive. Knowledge you have actually earned.",
  },
  "alchemy-lab": {
    title: "Alchemy Lab",
    line: "Clawforge drafts Agent Specs. Nothing executes without you.",
    suikoden: "The smithy. New officers are forged, never spawned.",
  },
  armory: {
    title: "Armory",
    line: "Tools and MCP multiplex. Empty until Ops is recruited.",
    suikoden: "The armory. Weapons of the fortress, not soldiers.",
  },
  observatory: {
    title: "Observatory",
    line: "Arena bouts and the night sky. Ask a hard question here.",
    suikoden: "The lookout. A single question, many minds.",
  },
  vault: {
    title: "Vault",
    line: "Cost, secrets, restricted. Locked on purpose.",
    suikoden: "The treasury. You do not leave this door ajar.",
  },
  "round-table": {
    title: "Round Table",
    line: "Council chamber. Multiple models sit. You remain the chair.",
    suikoden: "The war room. Nobody speaks last but you.",
  },
  "clock-tower": {
    title: "Clock Tower",
    line: "Crons and heartbeats. The keep's pulse made visible.",
    suikoden: "The bell tower. Time is a unit you can see.",
  },
  kitchen: {
    title: "Kitchen",
    line: "Local models. The hearth. Cheap fire that never sleeps.",
    suikoden: "Hai Yo's kitchen — except the stew is tokens.",
  },
  roost: {
    title: "The Roost",
    line: "Corvid's nest. Residential fetches the fortress cannot do.",
    suikoden: "The messenger roost. Birds go out. Birds come back.",
  },
  gatehouse: {
    title: "Gatehouse",
    line: "Windows node. Stamps, grants, the night desk.",
    suikoden: "The front gate. Nobody enters without a seal.",
  },
};

const TALK: Record<string, Record<string, string[]>> = {
  raziel: {
    idle: [
      "The hall is quiet. Give the word and I move.",
      "Discord is open. I am still your voice.",
      "A keep is not walls. It is who answers when you call.",
    ],
    working: [
      "I am already on it. Watch the pipes.",
      "Command received. Walking it down.",
    ],
    waiting_human: ["This one needs your seal. I will not fake a yes."],
    failed: ["That run broke. I will not pretty it up."],
  },
  oracle: {
    idle: [
      "Ask. If it is in the vault, I will cite it. If not, I will say so.",
      "I do not invent. That is the whole job.",
    ],
    working: ["Searching. Wait for a path, not a vibe."],
    waiting_human: ["A draft sits on my altar. You stamp it, or it stays paper."],
    failed: ["No citation. I will not fill the hole with fog."],
  },
  scribe: {
    idle: [
      "Inbox is watched. Drop a page and I will mill it.",
      "Ink first. Then the vault. Never the other way.",
    ],
    working: ["Distilling. The useful stays. The rest is noise."],
    waiting_human: ["This note wants a human write-gate. I will not sneak it in."],
    failed: ["That file was noise. I binned it. Check the reason."],
  },
  clawforge: {
    idle: [
      "Bring me an idea. I will interrogate it, then wait for your stamp.",
      "I forge officers. I do not switch them on.",
    ],
    working: ["The anvil is hot. Spec is on the bench."],
    waiting_human: ["Spec is drafted. You approve, or it stays iron."],
    failed: ["That forge cracked. We do not ship a broken officer."],
  },
  corvid: {
    idle: [
      "Point me at a page the fortress cannot reach. I'll fly.",
      "The roost is open. The horse is real. Ask me to fetch.",
    ],
    working: ["Wings out. Don't wait up."],
    waiting_human: ["Caught something. You decide if it comes inside."],
    failed: ["The page bit back. I came home empty. That's the report."],
  },
};

export function officerFor(agentId: string | null | undefined): Officer | null {
  if (!agentId) return null;
  const id = agentId.toLowerCase();
  for (const key of Object.keys(OFFICERS)) {
    if (id.includes(key)) return OFFICERS[key];
  }
  return null;
}

export function talkLine(
  agentId: string | null | undefined,
  state: string | null | undefined,
): string {
  const off = officerFor(agentId);
  if (!off) {
    return "An empty post. Recruit someone, or leave it sealed.";
  }
  const bucket = TALK[off.id] || {};
  const key = state && bucket[state] ? state : "idle";
  const lines = bucket[key] || bucket.idle || ["…"];
  return lines[Math.floor(Math.random() * lines.length)];
}

export function computeHqRank(rooms: RoomChip[]): HqRank {
  const liveRooms = rooms.filter((r) => r.lock_state === "live").length;
  const realOfficers = new Set<string>();
  for (const r of rooms) {
    if (r.agent_real && r.occupant_agent_id) realOfficers.add(r.occupant_agent_id);
    for (const o of r.occupants || []) {
      if (o.agent_real) realOfficers.add(o.agent_id);
    }
  }
  const n = liveRooms;
  let rank = 1;
  let title = "Hideout";
  let next = "Unlock 3 live rooms → Watchtower";
  if (n >= 9) {
    rank = 6;
    title = "Ravenstack";
    next = "Vault live + five real officers → legend";
  } else if (n >= 7) {
    rank = 5;
    title = "Castle";
    next = "9 live wings → Ravenstack";
  } else if (n >= 5) {
    rank = 4;
    title = "Fortress";
    next = "7 live wings → Castle";
  } else if (n >= 4) {
    rank = 3;
    title = "Keep";
    next = "5 live wings → Fortress";
  } else if (n >= 3) {
    rank = 2;
    title = "Watchtower";
    next = "4 live wings → Keep";
  }
  if (rooms.some((r) => r.room_id === "vault" && r.lock_state === "live") && realOfficers.size >= 5) {
    rank = 6;
    title = "Ravenstack";
    next = "The castle is staffed. Grow the RAG, not the headcount.";
  }
  return { rank, title, next, liveRooms, realOfficers: realOfficers.size };
}

export function wakeCopy(): string {
  return "Rally — officers to their posts. The castle is awake.";
}

export function tourCopy(): string {
  return "Tour — Raziel walks the cyan pipes. You follow the commander.";
}
