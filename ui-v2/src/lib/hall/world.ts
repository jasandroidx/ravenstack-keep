/** Painted Keep — the fortress image is the world. Edit hotspots here. */
import { liveStatusSummary } from "../keep/catalog.ts";
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

/** A walk floor carries its name so the layout map and its test can say which
 *  floor is unreachable instead of which index is. */
export type WalkFloor = Rect & { name: string };

/** Walkable floors. Player feet must sit in one of these and outside SOLID. */
export const WALK: WalkFloor[] = [
  { x: 210, y: 175, w: 280, h: 340, name: "library floor" },
  { x: 230, y: 500, w: 180, h: 130, name: "library south" },
  { x: 470, y: 255, w: 100, h: 140, name: "library ↔ hall" },
  { x: 560, y: 235, w: 680, h: 450, name: "great hall" },
  { x: 740, y: 55, w: 320, h: 190, name: "throne dais" },
  { x: 1230, y: 270, w: 120, h: 160, name: "hall ↔ workshop" },
  { x: 1340, y: 190, w: 370, h: 500, name: "workshop floor" },
  { x: 800, y: 200, w: 160, h: 50, name: "stairs hall ↔ throne" },
  { x: 820, y: 670, w: 160, h: 70, name: "stairs to yard" },
  { x: 640, y: 720, w: 520, h: 240, name: "yard" },
];

/** Furnishings the player (and every walker) collides with. */
export type SolidProp = Rect & { name: string };

export const SOLID: SolidProp[] = [
  // The painted tabletop itself, not an inset box: walkers are stopped at the
  // stone rim so nobody stands with their sprite on the table.
  { x: 780, y: 306, w: 258, h: 200, name: "war table" },
  { x: 848, y: 805, w: 140, h: 130, name: "fountain" },
  { x: 1340, y: 80, w: 370, h: 130, name: "workshop benches" },
  { x: 1560, y: 500, w: 150, h: 120, name: "cauldron" },
  { x: 155, y: 140, w: 130, h: 200, name: "library shelves" },
  { x: 170, y: 500, w: 160, h: 110, name: "library desk" },
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

/**
 * Rectangles the HUD names as rooms. ORDER IS LOOK-UP PRECEDENCE, not
 * geography: `zoneAt` returns the first hit, so a place painted inside another
 * room (the gallery doorway, the cell in the yard) has to come before the room
 * that contains it or it can never win. `world.test.ts` fails if any zone's
 * own centre resolves to a different zone.
 */
export const ZONES: Zone[] = [
  // Nested places first — these sit inside great-hall and yard respectively.
  { id: "gallery-arch", name: "The Grand Gallery", lock: "live", rect: { x: 600, y: 230, w: 100, h: 80 }, href: "/gallery" },
  { id: "library", name: "Library", lock: "unforged", rect: { x: 140, y: 120, w: 380, h: 540 }, href: "/oracle" },
  { id: "great-hall", name: "Great Hall", lock: "live", rect: { x: 540, y: 220, w: 720, h: 470 } },
  { id: "watchtower", name: "Watchtower", lock: "unforged", rect: { x: 700, y: 40, w: 400, h: 190 } },
  { id: "workshop", name: "Workshop", lock: "unforged", rect: { x: 1310, y: 60, w: 420, h: 680 }, href: "/mechanic" },
  { id: "yard", name: "Yard", lock: "unforged", rect: { x: 620, y: 700, w: 540, h: 260 } },
];

/**
 * Light sources mounted over the painting by scene.ts as soft additive glows
 * (mountHallLights). Not Light2D — that needs a normal map per surface and the
 * hall is one painting — and not PointLight, which drew a hard-edged disc.
 *
 * `flicker` is the amplitude of the brightness wobble — fire moves, conduits
 * pulse slowly, and the fountain does neither.
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
  // Yard fountain
  { x: 900, y: 850, radius: 200, color: 0x2de2e6, intensity: 0.8, flicker: 0.1, period: 4.0 },
];

export const PLAYER_SPAWN = { x: 750, y: 880 }; // courtyard start, inside yard walk, west of fountain

// --- Fortress Interior (hall v4) — combined Keep, 2026-10-30 ---
// The hall is a SECOND area, not a replacement for the courtyard. Sizes match
// the images exactly: courtyard 1792x1008, hall v4 1920x1280.
//
// Geometry re-measured 2026-11-24 against keep-map-v4.jpg itself (warm-wood
// fraction per row/column, flame-core clusters and the iron mask), not by eye
// on a scaled crop. Two findings changed the walk set: the wings' painted
// floor stops at y≈1050 (below it is the stone wall), and the gatehouse is a
// shut portcullis whose bars start at y≈1002 — the floor must stop in FRONT
// of it, not run down into the pit behind it.
export type InteriorFloor = Rect & { name: string };
export const INTERIOR_MAP_W = 1920;
export const INTERIOR_MAP_H = 1280;
export const INTERIOR_MAP_SRC = "/hall/painted/keep-map-v4.jpg";
export const INTERIOR_WALK: InteriorFloor[] = [
  { x: 330, y: 200, w: 420, h: 300, name: "bedroom floor" },
  { x: 330, y: 520, w: 420, h: 300, name: "armoury floor" },
  { x: 330, y: 840, w: 420, h: 210, name: "kitchen floor" },
  { x: 750, y: 300, w: 90, h: 700, name: "west link to hall" },
  { x: 830, y: 130, w: 360, h: 870, name: "hall + throne dais" },
  { x: 1190, y: 300, w: 90, h: 700, name: "east link to hall" },
  { x: 1280, y: 200, w: 420, h: 300, name: "library floor" },
  { x: 1280, y: 520, w: 420, h: 300, name: "stores floor" },
  { x: 1280, y: 840, w: 420, h: 210, name: "chapel floor" },
];

/** Painted furniture the player collides with, measured on keep-map-v4.jpg.
 *  Boxes are inset a touch from the art on purpose: an invisible wall reads
 *  worse than clipping a bed corner. Until 2026-11-24 the room's only collider
 *  was one circle at (1000,190) — beside the throne, not on it — so it put an
 *  invisible wall across the carpet and let the player walk through every bed,
 *  table, altar and anvil in the Keep. */
export type InteriorSolid = Rect & { name: string };
export const INTERIOR_SOLID_RECTS: InteriorSolid[] = [
  { x: 918, y: 88, w: 84, h: 90, name: "throne chair" }, // velvet x944-977 y102-164
  { x: 865, y: 1002, w: 210, h: 58, name: "portcullis" }, // bars x860-1080, rail y1002-1046
  { x: 362, y: 212, w: 148, h: 178, name: "bed" },
  { x: 430, y: 566, w: 105, h: 52, name: "tool bench" }, // checked on the art 2026-11-24
  { x: 430, y: 640, w: 82, h: 56, name: "anvil" },
  { x: 440, y: 838, w: 82, h: 55, name: "hearth" }, // flame core (480,869)
  { x: 398, y: 934, w: 118, h: 55, name: "food table" },
  { x: 1292, y: 202, w: 300, h: 48, name: "library shelves" },
  { x: 1386, y: 336, w: 100, h: 56, name: "library desk" },
  { x: 1400, y: 556, w: 82, h: 50, name: "stores chests" },
  { x: 1298, y: 680, w: 62, h: 44, name: "stores barrels" },
  { x: 1516, y: 680, w: 88, h: 48, name: "stores barrels" },
  { x: 1396, y: 884, w: 150, h: 58, name: "chapel altar" }, // candles (1460,915)
];

/** Select E-gates, copied from the proven test build — stepping in alone does
 *  NOTHING; only E moves you. Courtyard gate: top of courtyard, on the throne
 *  dais (walkable from y=55 up).
 *
 *  Interior gate, fixed 2026-11-24: the old rect (800,1190,320,90) sat behind
 *  the shut portcullis, out past the arch — you had to walk into the dark
 *  gatehouse pit to find the prompt. The threshold is the painted floor in
 *  FRONT of the bars (rail at y≈1002), so that is where it sits now. */
export const COURTYARD_GATE = { x: 800, y: 0, w: 192, h: 90 };
export const INTERIOR_GATE = { x: 890, y: 928, w: 140, h: 74 };
export const INTERIOR_SPAWN = { x: 960, y: 880 }; // inside the hall, gate at your back
export const COURTYARD_RETURN_SPAWN = { x: 896, y: 130 }; // on the throne dais, below the top gate

/** The eight rooms the painting actually contains, as HUD sub-zones. Was one
 *  label ("Fortress Interior") for six rooms and one hall. */
export const INTERIOR_ZONES: InteriorFloor[] = [
  { x: 330, y: 200, w: 420, h: 300, name: "Bedroom" },
  { x: 330, y: 520, w: 420, h: 300, name: "Armoury" },
  { x: 330, y: 840, w: 420, h: 210, name: "Kitchen" },
  { x: 1280, y: 200, w: 420, h: 300, name: "Library" },
  { x: 1280, y: 520, w: 420, h: 300, name: "Stores" },
  { x: 1280, y: 840, w: 420, h: 210, name: "Chapel" },
  { x: 830, y: 130, w: 360, h: 175, name: "Throne Dais" },
  { x: 830, y: 305, w: 360, h: 695, name: "Great Hall" },
];

/** Sconces, hearths and hearth-candles painted into v4, as light sources.
 *  Positions are flame-core clusters measured on the JPEG, radii are how far
 *  the glow reaches on the floor. They burn all night and sit at embers by
 *  day (RoomScene's DAY_LIGHT), which is why the interior used to read as
 *  permanent noon: nothing here was ever mounted. */
export const INTERIOR_LIGHTS: HallLight[] = [
  // West wing: bedroom, armoury, kitchen wall, kitchen hearth
  { x: 584, y: 209, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.35, period: 1.2 },
  { x: 519, y: 507, radius: 160, color: 0xffa53c, intensity: 1.2, flicker: 0.35, period: 1.0 },
  { x: 433, y: 801, radius: 140, color: 0xffa53c, intensity: 1.0, flicker: 0.4, period: 0.9 },
  { x: 480, y: 869, radius: 190, color: 0xff7a2a, intensity: 1.5, flicker: 0.5, period: 0.8 },
  // East wing: library, library door, stores, chapel candles
  { x: 1402, y: 201, radius: 170, color: 0xffa53c, intensity: 1.2, flicker: 0.3, period: 1.3 },
  { x: 1428, y: 422, radius: 150, color: 0xffa53c, intensity: 1.0, flicker: 0.3, period: 1.1 },
  { x: 1572, y: 632, radius: 150, color: 0xffa53c, intensity: 1.0, flicker: 0.3, period: 1.4 },
  { x: 1460, y: 915, radius: 160, color: 0xffc857, intensity: 0.9, flicker: 0.2, period: 1.8 },
  // Hall wall sconces, paired down both sides
  { x: 829, y: 326, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.35, period: 1.0 },
  { x: 1082, y: 327, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.35, period: 1.2 },
  { x: 808, y: 622, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.4, period: 0.9 },
  { x: 1092, y: 682, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.4, period: 1.3 },
  { x: 816, y: 939, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.4, period: 1.1 },
  { x: 1104, y: 935, radius: 150, color: 0xffa53c, intensity: 1.1, flicker: 0.4, period: 1.0 },
  // Throne arch candles: steady, pale, not fire
  { x: 960, y: 130, radius: 210, color: 0xffd9a0, intensity: 0.7, flicker: 0.12, period: 3.0 },
];

/** A looping fire drawn ON TOP of a flame already painted into the room.
 *  Art: CC0 "Free Pixel Loops" by cs5475 (public/assets/fx/LICENSE-free-pixel-loops.txt).
 *  x/y is the BASE of the flame in keep-map-v4.jpg pixels (origin bottom-centre),
 *  w/h the painted flame it has to cover — measured from the painting, because
 *  the sconce cups sit up to 70 px away from the glow centres in INTERIOR_LIGHTS.
 *  Those glows still do the lighting; this only animates the flame itself. */
export type InteriorFire = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 48 px sheet (16 frames) for the hearth; 32 px (12 frames) for sconces. */
  sheet: 32 | 48;
  /** A smoke column rising out of this fire (the kitchen hearth only). */
  smoke?: { w: number; h: number; alpha: number; dx: number };
};

export const INTERIOR_FIRES: InteriorFire[] = [
  // West wing: bedroom sconce, armoury sconce, kitchen sconce, kitchen hearth
  { x: 584, y: 225, w: 26, h: 30, sheet: 32 },
  { x: 519, y: 528, w: 28, h: 34, sheet: 32 },
  { x: 441, y: 818, w: 18, h: 32, sheet: 32 },
  {
    x: 479, y: 892, w: 54, h: 52, sheet: 48,
    smoke: { w: 64, h: 62, alpha: 0.32, dx: 4 },
  },
  // East wing: library sconce, and four chapel candles on the altar
  { x: 1402, y: 218, w: 26, h: 30, sheet: 32 },
  { x: 1395, y: 882, w: 7, h: 14, sheet: 32 },
  { x: 1409, y: 880, w: 7, h: 14, sheet: 32 },
  { x: 1488, y: 891, w: 7, h: 14, sheet: 32 },
  { x: 1503, y: 889, w: 7, h: 14, sheet: 32 },
  // Great hall sconces, three a side, from the north wall to the gate
  { x: 839, y: 332, w: 13, h: 24, sheet: 32 },
  { x: 1078, y: 343, w: 14, h: 24, sheet: 32 },
  { x: 827, y: 694, w: 13, h: 22, sheet: 32 },
  { x: 1090, y: 692, w: 12, h: 18, sheet: 32 },
  { x: 817, y: 951, w: 12, h: 20, sheet: 32 },
  { x: 1106, y: 944, w: 16, h: 20, sheet: 32 },
];

/** Lyra: lives in the Fortress Interior (muse's FortressInteriorRoomScene),
 *  kitchen, so she is NOT in HALL_NPCS (the courtyard scene). x/y are
 *  keep-map-v4.jpg image pixels: kitchen floor, clear of the table
 *  (398-516 × 934-989) and of the hearth. Her day is LYRA_ROUTINE below. */
export const LYRA_NPC: HallNpc = {
  id: LYRA.id,
  name: LYRA.name,
  role: LYRA.role,
  x: 600,
  y: 900,
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

/** Lyra's kitchen day, on the ONE clock (routineStopAt). Before this she stood
 *  in one spot facing down at 3am and noon alike, and RoomScene had no clock at
 *  all. Every stop is open kitchen floor and the straight line between stops
 *  clears the food table and the hearth, because RoomScene tweens between them
 *  and does not pathfind. */
export const LYRA_ROUTINE: RoutineStop[] = [
  { id: "hearth", from: 6, at: { x: 600, y: 900 }, face: "left" }, // cooking, east of the fire
  { id: "table", from: 11, at: { x: 600, y: 1000 }, face: "up" }, // serving at the table
  { id: "shelf", from: 19, at: { x: 690, y: 930 }, face: "left" }, // banked fire, wiping down
];

/** Where Valerie may wander. The workshop zone rect (1310,60,420,680) is NOT
 *  her floor — it includes the benches strip and the hall↔workshop corridor,
 *  so the walkable floor is inset 30px and she is confined to this instead.
 *  `scene.ts` enforces it on every step; the layout map draws it. */
export const VALERIE_LEASH = { x: 1370, y: 220, w: 310, h: 440 };

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
