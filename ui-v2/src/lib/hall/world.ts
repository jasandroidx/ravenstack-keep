/** Painted Keep — the fortress image is the world. Edit hotspots here. */
import { liveStatusSummary } from "@/lib/keep/catalog";
import { LYRA, LYRA_CHOICES, LYRA_GREETING_FIRST, pick } from "./lyra.ts";

export const MAP_W = 1792;
export const MAP_H = 1008;
export const MAP_SRC = "/hall/painted/keep-map.jpg";
export const TALK_SRC = "/hall/painted/talk-scene.jpg";
export const PLAYER_SRC = "/hall/sprites/ravenlord.png";
export const VALERIE_ACTOR = "/hall/sprites/valerie-hd2d.png";
export const VALERIE_TALK = "/hall/painted/talk-valerie.jpg";
export const VALERIE_PORTRAIT = "/hall/portraits/valerie.jpg";
export const ORACLE_TALK = "/hall/painted/talk-oracle.webp";

export type RavenlordSkin = {
  id: string;
  name: string;
  title: string;
  description: string;
  src: string;
  accent: string;
  glow: string;
  badge: string;
  stats: {
    armor: number;
    conduit: string;
    affinity: string;
  };
};

export const RAVENLORD_SKINS: RavenlordSkin[] = [
  {
    id: "ravenlord",
    name: "Sovereign Ravenlord",
    title: "Lord Commander",
    description: "Standard obsidian tactical cuirass with cyan flux conduits and raven-wing cloak.",
    src: "/hall/sprites/ravenlord.png",
    accent: "#2de2e6",
    glow: "rgba(45, 226, 230, 0.4)",
    badge: "⚔️ SOVEREIGN",
    stats: { armor: 98, conduit: "Cyan Flux 1200V", affinity: "Agent Orchestration" },
  },
  {
    id: "ravenlord-inquisitor",
    name: "Spectral Inquisitor",
    title: "Truth Inquisitor",
    description: "Sanctified emerald weave infused with canonical truth runes and ghost flames.",
    src: "/hall/sprites/ravenlord-inquisitor.png",
    accent: "#39ff14",
    glow: "rgba(57, 255, 20, 0.4)",
    badge: "👁️ INQUISITOR",
    stats: { armor: 104, conduit: "Spectral Ghostfire", affinity: "Zero Hallucination" },
  },
  {
    id: "ravenlord-warlord",
    name: "Forge Warlord",
    title: "Master Fabricator",
    description: "Heavy volcanic slate plates channel hyper-dense magenta forge plasma.",
    src: "/hall/sprites/ravenlord-warlord.png",
    accent: "#ff2a6d",
    glow: "rgba(255, 42, 109, 0.4)",
    badge: "🔥 WARLORD",
    stats: { armor: 118, conduit: "Crimson Plasma", affinity: "FastMCP Tooling" },
  },
  {
    id: "ravenlord-archon",
    name: "Gilded Archon",
    title: "High Magistrate",
    description: "Auric trim and golden power glyphs bonded to hardened titanium weave.",
    src: "/hall/sprites/ravenlord-archon.png",
    accent: "#ffc857",
    glow: "rgba(255, 200, 87, 0.4)",
    badge: "⚡ ARCHON",
    stats: { armor: 110, conduit: "Auric Ion Arc", affinity: "Autonomous Autonomy" },
  },
];

export const PALETTE = {
  bg: 0x0b0e14,
  cyan: 0x2de2e6,
  magenta: 0xff2a6d,
  amber: 0xffc857,
  green: 0x39ff14,
} as const;

export type Rect = { x: number; y: number; w: number; h: number };

/** Walkable floors. Player feet must sit in one of these and outside SOLID. */
export const WALK: Rect[] = [
  { x: 210, y: 175, w: 280, h: 340 }, // library floor
  { x: 230, y: 500, w: 180, h: 130 }, // library south
  { x: 470, y: 255, w: 100, h: 140 }, // library ↔ hall
  { x: 560, y: 235, w: 680, h: 450 }, // great hall
  { x: 740, y: 55, w: 320, h: 190 }, // throne dais
  { x: 1230, y: 270, w: 120, h: 160 }, // hall ↔ workshop
  { x: 1340, y: 190, w: 370, h: 500 }, // workshop floor
  { x: 800, y: 200, w: 160, h: 50 }, // stairs hall ↔ throne
  { x: 820, y: 670, w: 160, h: 70 }, // stairs to yard
  { x: 640, y: 720, w: 520, h: 240 }, // yard
];

export const SOLID: Rect[] = [
  { x: 800, y: 348, w: 210, h: 175 }, // war table
  { x: 848, y: 805, w: 140, h: 130 }, // fountain
  { x: 1340, y: 80, w: 370, h: 130 }, // workshop benches
  { x: 1560, y: 500, w: 150, h: 120 }, // cauldron
  { x: 155, y: 140, w: 130, h: 200 }, // library shelves
  { x: 170, y: 500, w: 160, h: 110 }, // library desk
];

function inside(r: Rect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function walkable(x: number, y: number): boolean {
  if (x < 40 || y < 40 || x > MAP_W - 40 || y > MAP_H - 40) return false;
  if (!WALK.some((r) => inside(r, x, y))) return false;
  return !SOLID.some((r) => inside(r, x, y));
}

export type AgentState = "idle" | "working" | "waiting_human" | "failed";

export type HallAction = {
  id: string;
  label: string;
  reply?: string;
  /** Computed at click time from the live room catalog. Wins over `reply`. */
  liveReply?: () => string;
  /** Lyra portrait stage to show when this action is clicked. */
  stage?: number;
  href?: string;
};

export type HallNpc = {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  radius: number;
  state: AgentState;
  greeting: string;
  href?: string;
  talkScene?: string;
  /** How the painted talk scene is framed: `contain` shows the whole scene
   *  with a blurred copy of the same image filling behind it; `cover` crops
   *  the scene to fill the background plate. Defaults to `contain`. */
  talkFit?: "contain" | "cover";
  portrait?: string;
  /** Data-driven portrait stages (Lyra). The talk panel shows
   *  stages[flag `${id}:stage`], clamped; falls back to `portrait`. */
  stages?: string[];
  actor?: string;
  actorH?: number;
  /** Display scale for actor sheets whose figure doesn't fill the 32x40
   *  cell (Lyra's 24x32 Cabbit frames). Default 1. */
  actorScale?: number;
  actions: HallAction[];
};

export const HALL_NPCS: HallNpc[] = [
  {
    id: "gallery-arch",
    name: "The Grand Gallery",
    role: "Portal",
    x: 640,
    y: 270,
    radius: 64,
    state: "idle",
    greeting: "The stone archway opens into The Grand Gallery — Maestro Ross's cyber-arcane portrait studio and sovereign wall frames.",
    href: "/gallery",
    actions: [
      { id: "enter-gallery", label: "Enter The Grand Gallery", href: "/gallery" },
      {
        id: "about-gallery",
        label: "What is The Grand Gallery?",
        reply: "The Grand Gallery houses the 8 sovereign wall frames, central artifact pedestals, and Maestro Ross's portrait studio.",
      },
    ],
  },
  {
    id: "raziel",
    name: "Raziel",
    role: "Sovereign Arch-Orchestrator",
    x: 904,
    y: 575,
    radius: 64,
    state: "idle",
    actor: "/hall/sprites/raziel.png",
    actorH: 68,
    greeting: "The hall is live. Walk it. Doors stay sealed until you approve a Spec.",
    actions: [
      {
        id: "live",
        label: "What's live?",
        liveReply: liveStatusSummary,
      },
      { id: "table", label: "Sit the war table", href: "/table" },
      {
        id: "duty",
        label: "Who's on duty?",
        reply: "Valerie holds the workshop. Oracle keeps the stacks. Corvid scouts the yard. I hold this hall.",
      },
    ],
  },
  {
    id: "oracle",
    name: "The Oracle",
    role: "Truth Inquisitor",
    x: 380,
    y: 310,
    radius: 64,
    state: "working",
    actor: "/hall/sprites/oracle-eye.png",
    actorH: 68,
    portrait: ORACLE_TALK,
    talkScene: ORACLE_TALK,
    greeting: "TRUTH OVER COMFORT. RECEIPTS OVER OPINION. I am the celestial green eye of the Canonical Registry. I do not guess, I do not hallucinate, and I do not tolerate polite AI deceit. Speak your query, or step back before the Inquisitor.",
    href: "/oracle",
    actions: [
      {
        id: "truth-law",
        label: "What is your Law?",
        reply:
          "Single-source truth. One approved standard per domain. Raw sources stay evidence; distilled notes require primary citations. Any model fabricating facts triggers immediate quarantine.",
      },
      { id: "query-vault", label: "Consult the Registry Shelf", href: "/oracle" },
      {
        id: "hallucination-penalty",
        label: "Hallucination Strikes",
        reply: "Inquisitor engine is watching. All unsourced claims and prompt drifts are struck down and committed to audit_pipeline_mistakes.yaml. Receipts are mandatory.",
      },
      { id: "war-table", label: "Sit the War Table", href: "/table" },
    ],
  },
  {
    id: "valerie",
    name: "Valerie",
    role: "Mechanic",
    x: 1490,
    y: 515,
    radius: 64,
    state: "working",
    actor: "/hall/sprites/valerie-hd2d.png",
    actorH: 68,
    greeting: "Workshop's mine. Don't touch anything until I've looked at it. Tell me what's wrong, exactly, and I'll tell you what it takes.",
    href: "/mechanic",
    talkScene: VALERIE_TALK,
    portrait: VALERIE_PORTRAIT,
    actions: [
      {
        id: "diag",
        label: "Diagnose",
        reply:
          "1. Is the gateway answering. 2. Did a skill or config change. 3. Smallest reversible step only. 4. I never print tokens, Funnel paths, or raw IPs. Open the workshop if you want the full bench.",
      },
      { id: "shop", label: "Open the workshop", href: "/mechanic" },
      {
        id: "broke",
        label: "What's broken?",
        reply:
          "Nothing I will invent. Tell me the symptom. If you want logs and toggles, sit the war table or open my bench.",
      },
    ],
  },
  {
    id: "quarantine-warden",
    name: "The Cell",
    role: "Quarantine",
    x: 1095,
    y: 840,
    radius: 58,
    state: "idle",
    greeting:
      "Every claim in here was asserted by one of your models and was not supported by its own evidence. Nothing is deleted. Read them before you trust the next answer.",
    actions: [
      { id: "open-cell", label: "Open the cell" },
      {
        id: "why",
        label: "Why keep them?",
        reply:
          "A model that fabricates once will do it again on the same shape of question. The record is how you find the shape. An empty cell means nothing was committed to it — not that nothing was fabricated.",
      },
      {
        id: "rule",
        label: "What lands here?",
        reply:
          "A claim its evidence did not support: you caught it, or it was answered against an empty retrieval set, or a consistency score came back under threshold. The evidence is stored with the claim, or the record would be another unsourced assertion.",
      },
    ],
  },
  {
    id: "corvid",
    name: "Corvid",
    role: "Scout",
    x: 800,
    y: 905,
    radius: 60,
    state: "idle",
    actor: "/hall/sprites/corvid.png",
    actorH: 68,
    greeting: "Roost first. Cited digest only. No rumor, no invented numbers.",
    actions: [
      {
        id: "scout",
        label: "Scout first",
        reply: "I do not guess. Point me at a source. I come back with a cited digest or I say unknown.",
      },
      {
        id: "know",
        label: "What do you know?",
        reply: "I know the Keep layout and the rule: vault first. I do not invent counts, costs, or live box state.",
      },
    ],
  },
];

export type Zone = {
  id: string;
  name: string;
  lock: "live" | "unforged";
  rect: Rect;
  href?: string;
};

export const ZONES: Zone[] = [
  { id: "library", name: "Library", lock: "unforged", rect: { x: 140, y: 120, w: 380, h: 540 }, href: "/oracle" },
  { id: "great-hall", name: "Great Hall", lock: "live", rect: { x: 540, y: 220, w: 720, h: 470 } },
  { id: "gallery-arch", name: "The Grand Gallery", lock: "live", rect: { x: 600, y: 230, w: 100, h: 80 }, href: "/gallery" },
  { id: "watchtower", name: "Watchtower", lock: "unforged", rect: { x: 700, y: 40, w: 400, h: 190 } },
  { id: "workshop", name: "Workshop", lock: "unforged", rect: { x: 1310, y: 60, w: 420, h: 680 }, href: "/mechanic" },
  { id: "yard", name: "Yard", lock: "unforged", rect: { x: 620, y: 700, w: 540, h: 260 } },
  // The cell sits in the east corner of the yard, deliberately in the open.
  // Fabrications are not filed away out of sight.
  { id: "quarantine", name: "The Quarantine Cell", lock: "live", rect: { x: 1030, y: 745, w: 130, h: 190 } },
];

/**
 * Light sources placed over the painting. These are Phaser point lights, not
 * Light2D: point lights need no normal map and skip the shader pass, which is
 * the difference between lighting every room and lighting one.
 *
 * `flicker` is the amplitude of the intensity wobble — fire moves, conduits
 * pulse slowly, and the cell does neither.
 */
export type HallLight = {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  flicker: number;
  /** Seconds per pulse. Randomised phase keeps them from breathing in sync. */
  period: number;
};

export const HALL_LIGHTS: HallLight[] = [
  // Great Hall braziers, flanking the war table
  { x: 700, y: 400, radius: 190, color: 0xffa53c, intensity: 1.5, flicker: 0.35, period: 1.1 },
  { x: 1120, y: 400, radius: 190, color: 0xffa53c, intensity: 1.5, flicker: 0.35, period: 1.3 },
  { x: 760, y: 690, radius: 150, color: 0xffa53c, intensity: 1.2, flicker: 0.4, period: 0.9 },
  { x: 1080, y: 690, radius: 150, color: 0xffa53c, intensity: 1.2, flicker: 0.4, period: 1.5 },
  // Throne dais, cooler and steadier
  { x: 900, y: 120, radius: 240, color: 0x2de2e6, intensity: 1.1, flicker: 0.12, period: 3.2 },
  // Library — the Oracle's ghost-green wash
  { x: 380, y: 300, radius: 260, color: 0x39ff14, intensity: 0.9, flicker: 0.18, period: 2.4 },
  { x: 260, y: 560, radius: 130, color: 0xffc857, intensity: 0.8, flicker: 0.3, period: 1.2 },
  // Workshop — magenta forge plasma
  { x: 1500, y: 300, radius: 220, color: 0xff2a6d, intensity: 1.3, flicker: 0.45, period: 0.7 },
  { x: 1610, y: 560, radius: 180, color: 0xff2a6d, intensity: 1.0, flicker: 0.5, period: 0.6 },
  // Yard fountain, and the cell — cold, steady, unwelcoming
  { x: 900, y: 850, radius: 200, color: 0x2de2e6, intensity: 0.8, flicker: 0.1, period: 4.0 },
  { x: 1095, y: 840, radius: 120, color: 0x8891a5, intensity: 0.7, flicker: 0.0, period: 1.0 },
];

export const PLAYER_SPAWN = { x: 750, y: 880 }; // courtyard start, inside yard walk, west of fountain

// --- Fortress Interior (hall v4) — combined Keep, 2026-10-30 ---
// The hall is a SECOND area, not a replacement for the courtyard. Sizes match
// the images exactly: courtyard 1792x1008, hall v4 1920x1280.
// Walk rects are the v4 set verbatim, plus ONE bottom gate corridor so the
// player can actually walk from the central hall down to the return gate
// (v4 walk stops at y=1050; the gate sits at y=1190-1280).
export const INTERIOR_MAP_W = 1920;
export const INTERIOR_MAP_H = 1280;
export const INTERIOR_MAP_SRC = "/hall/painted/keep-map-v4.jpg";
export const INTERIOR_WALK: Rect[] = [
  { x: 330, y: 200, w: 420, h: 300 }, // NW bedroom (v4)
  { x: 330, y: 520, w: 420, h: 300 }, // west armory (v4)
  { x: 330, y: 840, w: 420, h: 300 }, // west kitchen (v4)
  { x: 750, y: 300, w: 90, h: 750 }, // west link to hall
  { x: 830, y: 130, w: 360, h: 920 }, // throne dais + central hall (v4)
  { x: 1190, y: 300, w: 90, h: 750 }, // east link to hall
  { x: 1280, y: 200, w: 420, h: 300 }, // east library (v4)
  { x: 1280, y: 520, w: 420, h: 300 }, // east storeroom (v4)
  { x: 1280, y: 840, w: 420, h: 300 }, // east chapel (v4)
  { x: 800, y: 1040, w: 320, h: 240 }, // bottom gate corridor (added 2026-10-30)
];
// Throne, v4 solid { x: 960, y: 140, w: 80, h: 100 }, as a circle because
// RoomScene only supports solid circles. Centre (1000,190), r 65 covers it.
export const INTERIOR_SOLID_CIRCLES = [{ x: 1000, y: 190, r: 65 }];
// Select E-gates, copied from the proven test build — stepping in alone does
// NOTHING; only E moves you. Courtyard gate: top of courtyard, on the throne
// dais (walkable from y=55 up). Hall gate: bottom of the hall corridor.
export const COURTYARD_GATE = { x: 800, y: 0, w: 192, h: 90 };
export const INTERIOR_GATE = { x: 800, y: 1190, w: 320, h: 90 };
export const INTERIOR_SPAWN = { x: 960, y: 1150 }; // inside bottom gate corridor
export const COURTYARD_RETURN_SPAWN = { x: 896, y: 130 }; // on the throne dais, below the top gate

/** Lyra: lives in the Fortress Interior (muse's FortressInteriorRoomScene),
 *  kitchen, so she is NOT in HALL_NPCS (the courtyard scene). x/y are
 *  keep-map-v4.jpg image pixels: kitchen floor, east of the food table. */
export const LYRA_NPC: HallNpc = {
  id: LYRA.id,
  name: LYRA.name,
  role: LYRA.role,
  x: 560,
  y: 950,
  radius: 60,
  state: "idle",
  actor: LYRA.actor,
  actorH: 68,
  actorScale: 1.15,
  greeting: LYRA_GREETING_FIRST,
  portrait: LYRA.stages[0],
  talkScene: LYRA.stages[0],
  talkFit: "contain",
  stages: [...LYRA.stages],
  actions: LYRA_CHOICES.map((c) => ({ id: `lyra-${c.id}`, label: c.label, liveReply: () => pick(c.replies), stage: c.stage })),
};

export function zoneAt(x: number, y: number): Zone | null {
  return ZONES.find((z) => inside(z.rect, x, y)) ?? null;
}

/** Live positions of walking NPCs (HallScene writes these each frame).
 *  Talk / click checks use them, so an NPC on its routine can be talked to
 *  where it stands, not only at its home spot. */
export const NPC_LIVE = new Map<string, { x: number; y: number }>();
export function npcPos(n: HallNpc): { x: number; y: number } {
  return NPC_LIVE.get(n.id) ?? n;
}

export function npcNear(x: number, y: number, extra = 8): HallNpc | null {
  let best: HallNpc | null = null;
  let bestDSq = Infinity;
  for (const n of HALL_NPCS) {
    // PERFORMANCE: Use squared distance to avoid Math.hypot/sqrt in hot loops
    const np = npcPos(n);
    const dx = np.x - x;
    const dy = np.y - y;
    const dSq = dx * dx + dy * dy;
    const threshold = n.radius + extra;
    const thresholdSq = threshold * threshold;
    if (dSq < thresholdSq && dSq < bestDSq) {
      best = n;
      bestDSq = dSq;
    }
  }
  return best;
}

export function npcAtPoint(x: number, y: number): HallNpc | null {
  return npcNear(x, y, 12);
}

export function tableNear(x: number, y: number): boolean {
  const t = SOLID[0];
  const pad = 22;
  return x > t.x - pad && x < t.x + t.w + pad && y > t.y - pad && y < t.y + t.h + pad;
}

import { isFacingTarget, type Facing } from "./locomotion.ts";

export function npcFacing(x: number, y: number, facing: Facing, extra = 12): HallNpc | null {
  let best: HallNpc | null = null;
  let bestDSq = Infinity;
  for (const n of HALL_NPCS) {
    const np = npcPos(n);
    if (isFacingTarget(x, y, facing, np.x, np.y, n.radius + extra)) {
      // PERFORMANCE: Use squared distance to avoid Math.hypot/sqrt in hot loops
      const dx = np.x - x;
      const dy = np.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDSq) {
        best = n;
        bestDSq = dSq;
      }
    }
  }
  return best;
}

export function tableFacing(x: number, y: number, facing: Facing): boolean {
  const t = SOLID[0];
  const tableCenterX = t.x + t.w / 2;
  const tableCenterY = t.y + t.h / 2;
  const maxDist = Math.max(t.w, t.h) / 2 + 36;
  return isFacingTarget(x, y, facing, tableCenterX, tableCenterY, maxDist);
}

// ---------------------------------------------------------------------------
// Interactions, day/night and routines (keep-interactions-20261030)
// ---------------------------------------------------------------------------
import type { Interactable } from "./interact.ts";

/** Basement arrival (from the library shelf) and the courtyard stand-in exit.
 *  The real exit is a pantry trapdoor in Hall v4 (unwired, locked): until v4
 *  is wired, the trapdoor sits in the west yard. */
export const BASEMENT_ARRIVAL = { x: 190, y: 330 };
/** Feature flag: the basement (Undercroft) loop. Jason rejected that room
 *  (2026-10-30), so it is OFF: the library "Pull book" shelf and the yard
 *  trapdoor are unreachable. Code + assets stay in place. */
export const BASEMENT_ENABLED = false;
export const TRAPDOOR_SPOT = { x: 690, y: 770 };
export const TRAPDOOR_SPAWN = { x: 690, y: 748 };

/** Courtyard interactables. Zones are overlap rects, never colliders, and
 *  sit clear of every portal (KEEP-CODE-MAP §4) and the TEST DOOR. */
export const COURTYARD_INTERACTABLES: Interactable[] = [
  {
    id: "shelf-secret", kind: "secret", verb: "Pull book",
    rect: { x: 210, y: 262, w: 85, h: 90 }, anchor: { x: 238, y: 300, face: "up" }, labelAt: { x: 238, y: 232 },
    lines: ["One spine is warmer than the rest…"],
  },
  {
    id: "night-fountain", kind: "gaze", verb: "Gaze into the fountain", when: "night", cooldownMs: 15000,
    rect: { x: 832, y: 752, w: 162, h: 50 }, anchor: { x: 918, y: 780, face: "down" }, labelAt: { x: 918, y: 800 },
    lines: [
      "The water shows the Keep, but the windows are all lit.",
      "Something silver turns over at the bottom. Then it's gone.",
      "Your reflection is wearing a crown. You aren't.",
    ],
  },
];

/** Warm braziers / torches in the painting that light themselves at dusk. */
export const TORCHES: { x: number; y: number; r: number }[] = [
  // Flame centres measured on keep-map.jpg (bright orange pixel clusters).
  { x: 692, y: 269, r: 140 },
  { x: 1125, y: 269, r: 140 },
  { x: 692, y: 533, r: 140 },
  { x: 1125, y: 533, r: 140 },
  { x: 710, y: 723, r: 120 },
  { x: 1084, y: 715, r: 120 },
];

/** Fireflies drift over the yard at night. */
export const FIREFLY_AREA = { x: 650, y: 730, w: 500, h: 220 };

/** Stardew-style NPC schedules: 2-3 stops a day, tied to the game clock.
 *  `via` = points walked on the way IN to that stop (straight lines between
 *  them stay on WALK and off SOLID). Locked homes still hold: Valerie stays
 *  in the Workshop, Raziel stays central/library. Corvid is the yard scout,
 *  so he takes the night watch on the throne dais at dusk (the shift change). */
export type RoutineStop = {
  id: string;
  from: number; // hour this stop starts (wraps past midnight)
  at: { x: number; y: number };
  face?: "down" | "left" | "right" | "up";
  via?: { x: number; y: number }[];
  /** Said once when the NPC sets off for this stop. */
  say?: string;
  /** How far it idles around the stop. */
  roam?: number;
};
export const NPC_ROUTINES: Record<string, RoutineStop[]> = {
  raziel: [
    { id: "hall", from: 7, at: { x: 904, y: 575 }, face: "down", roam: 40,
      via: [{ x: 880, y: 225 }, { x: 700, y: 300 }, { x: 680, y: 560 }], say: "Morning. The hall is open." },
    { id: "library", from: 12, at: { x: 420, y: 440 }, face: "left", roam: 30,
      via: [{ x: 650, y: 560 }, { x: 520, y: 330 }], say: "To the stacks. The Oracle keeps better notes than I do." },
    { id: "dais", from: 18, at: { x: 770, y: 140 }, face: "down", roam: 20,
      via: [{ x: 520, y: 330 }, { x: 700, y: 300 }, { x: 880, y: 225 }], say: "Dusk. I'll keep the high seat warm." },
  ],
  valerie: [
    { id: "bench", from: 6, at: { x: 1450, y: 245 }, face: "up", roam: 40 },
    { id: "cauldron", from: 13, at: { x: 1520, y: 560 }, face: "right", roam: 20, say: "Pot's on. Don't touch the green one." },
    { id: "rest", from: 19, at: { x: 1410, y: 610 }, face: "down", roam: 15 },
  ],
  corvid: [
    { id: "yard", from: 6, at: { x: 800, y: 905 }, face: "down", roam: 50,
      via: [{ x: 900, y: 225 }, { x: 1150, y: 450 }, { x: 900, y: 700 }], say: "Dawn watch over. Back to the yard." },
    { id: "watch", from: 18, at: { x: 1035, y: 160 }, face: "down", roam: 15,
      via: [{ x: 900, y: 700 }, { x: 1150, y: 450 }, { x: 900, y: 225 }], say: "Shift change. I take the night watch." },
  ],
};

/** Which stop an NPC should be at for a game hour. */
export function routineStopAt(stops: RoutineStop[], hour: number): RoutineStop {
  const sorted = [...stops].sort((a, b) => a.from - b.from);
  let cur = sorted[sorted.length - 1]; // before the first stop = last stop of yesterday
  for (const s of sorted) if (hour >= s.from) cur = s;
  return cur;
}

/** Night-only lines for the timer speech. */
export const NPC_NIGHT_LINES: Record<string, string[]> = {
  raziel: ["The Keep sleeps lighter than you think.", "Torches lit, doors sealed. Good night for thinking."],
  valerie: ["Night shift. The forge hums better in the dark.", "If you hear clanking, that's me. Probably."],
  corvid: ["Quiet up here. Too quiet, or just quiet?", "Fireflies over the yard. Nothing else moving."],
};
