/** Painted Keep — the fortress image is the world. Edit hotspots here. */

export const MAP_W = 1792;
export const MAP_H = 1008;
export const MAP_SRC = "/hall/painted/keep-map.jpg";
export const TALK_SRC = "/hall/painted/talk-scene.jpg";
export const PLAYER_SRC = "/hall/sprites/operator-clone.png";
export const VALERIE_ACTOR = "/hall/sprites/valerie-hd2d.png";
export const VALERIE_TALK = "/hall/painted/talk-valerie.jpg";
export const VALERIE_PORTRAIT = "/hall/portraits/valerie.jpg";

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
  portrait?: string;
  actor?: string;
  actorH?: number;
  actions: HallAction[];
};

export const HALL_NPCS: HallNpc[] = [
  {
    id: "raziel",
    name: "Raziel",
    role: "Sovereign",
    x: 904,
    y: 575,
    radius: 56,
    state: "idle",
    greeting: "The hall is live. Walk it. Doors stay sealed until you approve a Spec.",
    actions: [
      {
        id: "live",
        label: "What's live?",
        reply:
          "Great Hall is live. Alchemy Lab is approved. Library, Workshop, Roost, Watchtower stay unforged until you sign a Spec. I do not invent status.",
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
    id: "raziel",
    name: "Raziel",
    role: "Sovereign",
    x: 910,
    y: 145,
    radius: 56,
    state: "idle",
    greeting: "From the dais: the hall is live. Specs still stop for you.",
    actions: [
      {
        id: "live",
        label: "What's live?",
        reply:
          "Great Hall is live. Alchemy Lab is approved. Library, Workshop, Roost, Watchtower stay unforged until you sign a Spec.",
      },
      { id: "table", label: "Sit the war table", href: "/table" },
    ],
  },
  {
    id: "oracle",
    name: "Oracle",
    role: "Wayfinder",
    x: 380,
    y: 310,
    radius: 56,
    state: "idle",
    greeting: "Ask where something lives. I answer from the vault, or I say not-in-knowledge.",
    href: "/oracle",
    actions: [
      {
        id: "where",
        label: "Where do I put this?",
        reply:
          "Incoming files go to the vault ingest path. Distilled notes go to the Library. Specs go to Clawforge and stop for you. If I do not know the shelf, I say not-in-knowledge.",
      },
      { id: "library", label: "Open the library", href: "/oracle" },
      {
        id: "find",
        label: "Where is the mechanic?",
        reply: "Valerie is in the east workshop, by the glass and the cauldron. Walk the hall east.",
      },
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
    greeting: "Workshop is cold until you forge it. I can still diagnose — numbered, reversible, no secret leaks.",
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
    id: "corvid",
    name: "Corvid",
    role: "Scout",
    x: 800,
    y: 905,
    radius: 56,
    state: "idle",
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
  { id: "watchtower", name: "Watchtower", lock: "unforged", rect: { x: 700, y: 40, w: 400, h: 190 }, href: "/sentinel" },
  { id: "workshop", name: "Workshop", lock: "unforged", rect: { x: 1310, y: 60, w: 420, h: 680 }, href: "/mechanic" },
  { id: "yard", name: "Yard", lock: "unforged", rect: { x: 620, y: 700, w: 540, h: 260 } },
];

export const PLAYER_SPAWN = { x: 760, y: 650 };

export function zoneAt(x: number, y: number): Zone | null {
  return ZONES.find((z) => inside(z.rect, x, y)) ?? null;
}

export function npcNear(x: number, y: number, extra = 8): HallNpc | null {
  let best: HallNpc | null = null;
  let bestD = Infinity;
  for (const n of HALL_NPCS) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < n.radius + extra && d < bestD) {
      best = n;
      bestD = d;
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
