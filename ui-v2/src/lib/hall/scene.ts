import * as Phaser from "phaser";
import {
  HALL_LIGHTS,
  HALL_NPCS,
  MAP_H,
  MAP_SRC,
  MAP_W,
  PALETTE,
  PLAYER_SPAWN,
  VALERIE_LEASH,
  ZONES,
  RAVENLORD_SKINS,
  npcAtPoint,
  npcNear,
  npcPos,
  tableFacing,
  walkable,
  zoneAt,
  type HallNpc,
  BASEMENT_ARRIVAL,
  COURTYARD_INTERACTABLES,
  FIREFLY_AREA,
  NPC_LIVE,
  NPC_NIGHT_LINES,
  NPC_ROUTINES,
  TORCHES,
  TRAPDOOR_SPAWN,
  BASEMENT_ENABLED,
  TRAPDOOR_SPOT,
  routineStopAt,
  type RoutineStop,
} from "./world";
import {
  bindRegistry,
  discover,
  exposeDebugHooks,
  interactableAt,
  loadFlags,
  pickPrompt,
  setFlag,
  type Interactable,
  type PlayerState,
  type PromptCandidate,
} from "./interact";
import { discoveryJuice, ensureFxTextures, fadeThrough, floatLine, FX, PromptLabel } from "./juice";
import { firefliesOut, gameHour, isNight, phaseOf, torchesLit, washRGB } from "./clock";
import { hallAudio } from "./audio";
import { portalAt, type PortalTrigger } from "./portal";
import { calculateVelocity, determineFacing, type Facing } from "./locomotion";

type NpcWalker = {
  npc: HallNpc;
  spr: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Text | null;
  shadow: Phaser.GameObjects.Ellipse;
  target: { x: number; y: number } | null;
  pauseUntil: number;
  facing: Facing;
  bubble: Phaser.GameObjects.Text | null;
  bubbleUntil: number;
  lineIdx: number;
  proxUntil: number;
  /** Routine: the stop it is heading to / at, and the waypoints left. */
  stopId: string;
  path: { x: number; y: number }[];
  stallMs: number;
};

const NPC_SPEED = 60;

/** Peak alpha of a light with intensity 1. Additive, so this is colour added on
 *  top of the painting — high values blow the sprite to white. */
const LIGHT_ALPHA = 0.12;

/** Preset lines only — these work with no model at all. No live numbers,
 *  no invented status: Raziel's lines are generic Keep truths, and his
 *  "What's live?" action already reports real status when asked. There is
 *  no Ravenlord NPC (the Ravenlord is the player), so Keep-status lines
 *  live on Raziel, the orchestrator. */
const NPC_LINES: Record<string, string[]> = {
  valerie: [
    "Workshop's cold until you forge it — but I can still diagnose. Numbered steps, reversible, no secrets.",
    "REA rule one: own code or open source. Commercial binaries don't get decompiled here.",
    "Tiny binary first. A small test already burned ~907KB of tool output — big ones wait for your yes.",
    "Ghidra and Java stay on the laptop until you say the download's fine.",
  ],
  raziel: [
    "The hall is live. Doors stay sealed until you approve a Spec.",
    "One map. One URL. Wake it or it sleeps.",
    "Walk it. The rooms you built are the ones that answer.",
    "Human remains the final gate — I don't fire anything on my own.",
  ],
  corvid: [
    "Roost first. Cited digest only — no rumor, no invented numbers.",
    "Point me at a source and I come back with citations, or I say unknown.",
    "If it isn't in the source, it isn't in my answer.",
  ],
};

const NPC_PROX_LINES: Record<string, string> = {
  valerie: "Need a diagnosis, or a decompile plan? Both start small.",
  raziel: "The Keep holds. What are you walking toward?",
  corvid: "Got a source? I'll cite it or say unknown.",
};

export type HallEvents = {
  onZone: (name: string, lock: string) => void;
  /** verb is set for an object interactable ("Pull book"); null otherwise. */
  onPrompt: (npc: HallNpc | null, atTable: boolean, verb?: string | null) => void;
  onTalk: (npc: HallNpc) => void;
  onTable: () => void;
  onSkinChange?: (skinId: string) => void;
  /** A scene finished create() — React must point its ref at the live scene. */
  onSceneReady?: (scene: HallScene) => void;
};

/** Slicing dimensions in PNG source (128x160 -> 4x4 grid of 32x40) */
const FRAME_W = 32;
const FRAME_H = 40;

/** World display scale matched to 48px tile grid and environment */
const OP_W = 54;
const OP_H = 68;

/** Sprite centre to feet: NPC walk checks probe this point, not the centre. */
const WALKER_FEET = OP_H / 2 - 4;

const VISITS_KEY = "ravenstack.keep.visits";

const TRUTH_PROVERBS = [
  "TRUTH OVER COMFORT.",
  "RECEIPTS OVER OPINION.",
  "I SEE ALL UNGROUNDED FABRICATIONS.",
  "THE CANONICAL REGISTRY REMEMBERS.",
  "ONE APPROVED STANDARD PER DOMAIN.",
  "GROUND YOUR CLAIMS IN PRIMARY RECORDS.",
  "HALLUCINATIONS WILL BE QUARANTINED.",
  "NO INVENTED CITATIONS PERMITTED.",
];

export class HallScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private shadow!: Phaser.GameObjects.Ellipse;
  private reticle!: Phaser.GameObjects.Arc;
  public activeSkinId = "ravenlord";

  // The Oracle: Chained Spectral Green Eye
  private oracleEye!: Phaser.GameObjects.Image;
  private oracleGlow!: Phaser.GameObjects.Arc;
  private oracleHalo!: Phaser.GameObjects.Arc;
  private oracleChains: Phaser.GameObjects.Line[] = [];
  private oracleProverbText!: Phaser.GameObjects.Text;
  private spectralVignette!: Phaser.GameObjects.Rectangle;
  private oracleSpawnTimer = 0;
  private isManifesting = false;

  /** Anchor the eye drifts around, and the phase of that drift. */
  private oracleAnchor = { x: 380, y: 296 };
  private oracleDriftT = 0;
  /** How well the last answer was supported by its evidence. Drives the eye's colour. */
  private truthState: "sourced" | "thin" | "none" = "sourced";
  /** Lid closure, 0 open .. 1 shut. Refusal closes the eye rather than talking. */
  private lidClosed = 0;
  private lidTarget = 0;
  private blinkTimer = 2400;

  private eventsOut: HallEvents;
  private lastZone = "";
  private lastPrompt = "";
  private dest: { x: number; y: number } | null = null;
  /** NPC the player clicked: once they reach the walkable approach tile, the
   *  NPC's dialogue opens automatically. Cleared by manual input. */
  private pendingApproach: HallNpc | null = null;
  /** Walking NPCs (Hall only). Reset in create() — scene instances are
   *  reused on portal return, so stale sprite refs would touch destroyed
   *  objects (the black-canvas bug class). */
  private npcWalkers = new Map<string, NpcWalker>();
  private nextSpeechAt = 0;
  private speechIdx = 0;
  /** How long the player has been wedged with an active dest (prop or wall
   *  between them and the click). Clears so they don't grind an edge. */
  private destStallMs = 0;
  private stickX = 0;
  private stickY = 0;
  private lastFacing: Facing = "down";
  private stepTimer = 0;
  private debugFrame = 0;
  private wasMoving = false;
  private oracleThinking = false;

  /** The tableau overlays: dim background, title, prompt, evidence body. */
  private tableauOpen = false;
  private tableauFx: unknown = null;
  private tableau: Phaser.GameObjects.GameObject[] = [];

  /** Room decay states computed from visit history. */
  private visits: Record<string, number> = {};

  /** Soft glow sprites standing in for the hall's light sources. */
  private hallLights: Phaser.GameObjects.Image[] = [];
  private lightBase: number[] = [];
  private lightPhase: number[] = [];
  /** Decaying brightness boost from pulseTorch(): 1 = freshly lit. */
  private lightPulse = 0;

  /** Time-of-day wash multiplier over the painting. */
  private daylight!: Phaser.GameObjects.Rectangle;

  /** Dynamic seals pressed into the Great Hall floor when gates are approved. */
  private seals: Phaser.GameObjects.Arc[] = [];

  /** Iris look-at position eased toward the player. */
  private oracleIris!: Phaser.GameObjects.Arc;
  private oraclePupil!: Phaser.GameObjects.Arc;
  private irisPos = { x: 380, y: 296 };

  /** Frozen frame counter for hit pause. Drains in update(). */
  private freezeMs = 0;

  public paused = false;
  private portalOpts: { key: string; spawn: { x: number; y: number }; portals: PortalTrigger[] };
  // Select E-gates (combined Keep, 2026-10-30): stepping into one does
  // NOTHING on its own — only pressing E while inside moves you. They are
  // deliberately NOT in portalOpts.portals, so the auto-fire check in
  // update() can never trigger them.
  private selectGates: PortalTrigger[] = [];
  private gatePrompt: Phaser.GameObjects.Text | null = null;
  private isTransitioning = false;
  private portalExitRequired = false;
  private portalGraceUntil = 0;

  /** True once create() finished wiring up the scene objects. */
  public ready = false;

  // --- Interaction system (interact.ts) ---
  public pstate: PlayerState = "walk";
  private preSit: { x: number; y: number } | null = null;
  private interactables: Interactable[] = [];
  private curInteract: Interactable | null = null;
  private promptLabel: PromptLabel | null = null;
  private lastInteractAt = 0;
  private cooldowns: Record<string, number> = {};
  // --- Day/night (clock.ts) ---
  private torchFx: { glow: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image; r: number; phase: number }[] = [];
  private torchLevel = 0;
  private torchesOn: boolean | null = null;
  private flies: { dot: Phaser.GameObjects.Image; bx: number; by: number; ph: number; sp: number }[] = [];
  private flyLevel = 0;
  private nextClockApply = 0;
  private lastPhase = "";
  private hourNow = 12;
  private hatch: Phaser.GameObjects.Container | null = null;

  constructor(
    eventsOut: HallEvents,
    opts?: { key?: string; spawn?: { x: number; y: number }; portals?: PortalTrigger[]; selectGates?: PortalTrigger[] },
  ) {
    super({ key: opts?.key ?? "HallScene" });
    this.portalOpts = {
      key: opts?.key ?? "HallScene",
      spawn: opts?.spawn ?? PLAYER_SPAWN,
      portals: opts?.portals ?? [],
    };
    this.selectGates = opts?.selectGates ?? [];
    this.eventsOut = eventsOut;
    try {
      const saved = localStorage.getItem("ravenlord_skin");
      if (saved && RAVENLORD_SKINS.some((s) => s.id === saved)) {
        this.activeSkinId = saved;
      }
    } catch {
      // Ignore
    }
  }

      setDir(x: number, y: number) {
    this.stickX = x;
    this.stickY = y;
    if (x || y) this.dest = null;
    try { (window as unknown as Record<string, unknown>).__keepLastDir = { x, y, t: Date.now() }; } catch { /* no window */ }
  }

  preload() {
    this.load.image("keep-map", MAP_SRC);
    this.load.image("oracle-eye", "/hall/sprites/oracle-eye.png");

    // Load all Ravenlord Armor Skins
    for (const skin of RAVENLORD_SKINS) {
      this.load.spritesheet(`skin-${skin.id}`, skin.src, {
        frameWidth: FRAME_W,
        frameHeight: FRAME_H,
      });
    }

    // Load static agent sprites
    for (const npc of HALL_NPCS) {
      if (npc.actor) {
        this.load.spritesheet(`actor-${npc.id}`, npc.actor, {
          frameWidth: FRAME_W,
          frameHeight: FRAME_H,
        });
      }
    }
  }

  create(data?: { spawn?: { x: number; y: number }; from?: string }) {
    const spawn = data?.spawn ?? this.portalOpts.spawn;
    // Interaction + day/night state is per-visit (instance is reused).
    this.pstate = "walk";
    this.preSit = null;
    this.curInteract = null;
    this.cooldowns = {};
    this.torchFx = [];
    this.torchesOn = null;
    this.flies = [];
    this.nextClockApply = 0;
    this.lastPhase = "";
    this.hatch = null;
    NPC_LIVE.clear();
    this.interactables = this.scene.key === "HallScene"
      ? COURTYARD_INTERACTABLES.filter((it) => BASEMENT_ENABLED || it.kind !== "secret")
      : [];
    bindRegistry(this.registry);
    exposeDebugHooks();
    ensureFxTextures(this);
    // Scene restart cleanup (black-canvas-after-return fix): this scene
    // instance is REUSED on portal return, so create() runs again on the
    // same instance. Any array filled in create() must be reset here, or
    // update() keeps touching destroyed GameObjects from the previous run
    // (the Oracle chains are the observed case: their setTo threw on a
    // destroyed line, freezing the returned Hall at a black canvas).
    this.oracleChains = [];
    this.npcWalkers.clear();
    // Reused instance: drop stick/click input left over from the last visit.
    this.stickX = 0;
    this.stickY = 0;
    this.dest = null;
    this.lastZone = "";
    this.lastPrompt = "";
    this.nextSpeechAt = 0;
    this.speechIdx = 0;
    this.isTransitioning = false;
    this.portalExitRequired = this.portalOpts.portals.some(
      (p) => spawn.x >= p.x && spawn.x <= p.x + p.w && spawn.y >= p.y && spawn.y <= p.y + p.h,
    );
    this.portalGraceUntil = 0;
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.add.image(0, 0, "keep-map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H).setDepth(0);
    // Doors are painted into the map: no box and no name is drawn over a
    // threshold, so the art carries the door on its own.
    // Select E-gates: amber outline + label, never auto-fire (see field note).
    for (const g of this.selectGates) {
      this.add
        .rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h)
        .setStrokeStyle(4, 0xffc857, 0.95)
        .setDepth(3);
      this.add
        .text(g.x + g.w / 2, g.y - 8, g.label ?? "E — GATE", {
          fontFamily: "monospace", fontSize: "14px", color: "#ffc857",
          backgroundColor: "#0b0e14cc", padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(3);
    }
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.cameras.main.setZoom(1.45);
    this.cameras.main.setRoundPixels(true);

    // Full-screen Spectral Green Flash Vignette for Oracle Apparitions
    this.spectralVignette = this.add
      .rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x39ff14, 0)
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Register directional animations for ALL Ravenlord Skins. All four
    // directions are drawn in the sheet (down 0-3, left 4-7, right 8-11,
    // up 12-15) -- right is NOT a mirror of left, see applyFacingAnim.
    for (const skin of RAVENLORD_SKINS) {
      const texKey = `skin-${skin.id}`;
      // AnimationManager is global per Game, not per Scene: on portal
      // return this create() runs again, so guard every create or Phaser
      // logs "AnimationManager key already exists" for every key.
      const mk = (key: string, frames: unknown, frameRate: number, repeat: number) => {
        if (!this.anims.exists(key)) this.anims.create({ key, frames: frames as never, frameRate, repeat });
      };
      mk(`${skin.id}-walk-down`, this.anims.generateFrameNumbers(texKey, { start: 0, end: 3 }), 8, -1);
      mk(`${skin.id}-walk-left`, this.anims.generateFrameNumbers(texKey, { start: 4, end: 7 }), 8, -1);
      mk(`${skin.id}-walk-right`, this.anims.generateFrameNumbers(texKey, { start: 8, end: 11 }), 8, -1);
      mk(`${skin.id}-walk-up`, this.anims.generateFrameNumbers(texKey, { start: 12, end: 15 }), 8, -1);
      mk(`${skin.id}-idle-down`, [{ key: texKey, frame: 0 }], 1, 0);
      mk(`${skin.id}-idle-left`, [{ key: texKey, frame: 4 }], 1, 0);
      mk(`${skin.id}-idle-right`, [{ key: texKey, frame: 8 }], 1, 0);
      mk(`${skin.id}-idle-up`, [{ key: texKey, frame: 12 }], 1, 0);
    }

    // NPC sprites. Every actor NPC except the Oracle eye walks: waypoint
    // wander, same walkable/solid rules as the player, no pathfinding lib.
    for (const npc of HALL_NPCS) {
      let spr: Phaser.GameObjects.Sprite | null = null;
      let shadow: Phaser.GameObjects.Ellipse | null = null;
      if (npc.actor) {
        spr = this.add
          .sprite(npc.x, npc.y, `actor-${npc.id}`, 0)
          .setDisplaySize(OP_W, OP_H)
          .setDepth(5);
        shadow = this.add
          .ellipse(npc.x, npc.y + OP_H / 2 - 2, 28, 10, 0x000000, 0.45)
          .setDepth(4);

        if (!this.anims.exists(`npc-idle-${npc.id}`)) {
          this.anims.create({
            key: `npc-idle-${npc.id}`,
            frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: 0, end: 3 }),
            frameRate: 3,
            repeat: -1,
          });
        }
        // Direction anims for walkers only (actor sheets are 128x160, 4x4
        // at 32x40 like the player: down 0-3, left 4-7, right 8-11, up 12-15).
        // The Oracle eye sheet is 96x96, a different layout — excluded.
        if (npc.id !== "oracle") {
          const dirs: { dir: Facing; start: number; end: number; idle: number }[] = [
            { dir: "down", start: 0, end: 3, idle: 0 },
            { dir: "left", start: 4, end: 7, idle: 4 },
            { dir: "right", start: 8, end: 11, idle: 8 },
            { dir: "up", start: 12, end: 15, idle: 12 },
          ];
          for (const d of dirs) {
            if (!this.anims.exists(`npc-walk-${npc.id}-${d.dir}`)) {
              this.anims.create({
                key: `npc-walk-${npc.id}-${d.dir}`,
                frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: d.start, end: d.end }),
                frameRate: 6,
                repeat: -1,
              });
            }
            if (!this.anims.exists(`npc-idle-${npc.id}-${d.dir}`)) {
              this.anims.create({
                key: `npc-idle-${npc.id}-${d.dir}`,
                frames: [{ key: `actor-${npc.id}`, frame: d.idle }],
                frameRate: 1,
              });
            }
          }
        }
        spr.play(`npc-idle-${npc.id}`);
      }

      // Small pixel name tag above every character. The Oracle paints its own
      // proverb above the eye, so it is left to speak for itself.
      let tag: Phaser.GameObjects.Text | null = null;
      if (npc.actor && npc.id !== "oracle") {
        tag = this.add
          .text(npc.x, npc.y - OP_H / 2 - 6, npc.name, {
            fontFamily: "monospace",
            fontSize: "8px",
            color: "#e8ecf1",
            backgroundColor: "#0b0e14aa",
            padding: { x: 3, y: 1 },
          })
          .setOrigin(0.5, 1)
          .setDepth(12)
          .setAlpha(0.92);
      }
      if (npc.actor && npc.id !== "oracle" && spr && shadow) {
        const w: NpcWalker = {
          npc, spr, tag, shadow, target: null, pauseUntil: 0, facing: "down",
          bubble: null, bubbleUntil: 0, lineIdx: 0, proxUntil: 0, stopId: "", path: [], stallMs: 0,
        };
        const stops = NPC_ROUTINES[npc.id];
        if (stops) {
          // Arrive already at the stop for this hour (no walk on load).
          const st = routineStopAt(stops, gameHour());
          w.stopId = st.id;
          this.placeWalker(w, st.at.x, st.at.y);
          if (st.face) this.faceToward(w, st.face === "left" ? -1 : st.face === "right" ? 1 : 0, st.face === "up" ? -1 : st.face === "down" ? 1 : 0);
        }
        this.npcWalkers.set(npc.id, w);
      }
    }

    // The Oracle Eye
    const ax = this.oracleAnchor.x;
    const ay = this.oracleAnchor.y;

    const chainAnchors = [
      { x: ax - 140, y: ay - 141 },
      { x: ax + 140, y: ay - 141 },
      { x: ax - 130, y: ay + 129 },
      { x: ax + 130, y: ay + 129 },
    ];
    for (const a of chainAnchors) {
      const line = this.add
        .line(0, 0, a.x, a.y, ax, ay, 0x1e222b)
        .setLineWidth(2, 2)
        .setDepth(6)
        .setAlpha(0.75);
      this.oracleChains.push(line);
    }

    this.oracleHalo = this.add
      .arc(ax, ay, 46, 0, 360, false, 0x39ff14, 0.18)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.oracleGlow = this.add
      .arc(ax, ay, 32, 0, 360, false, 0x39ff14, 0.35)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.oracleEye = this.add
      .image(ax, ay, "oracle-eye")
      .setDisplaySize(68, 68)
      .setDepth(8)
      .setTint(0x39ff14);

    this.oracleIris = this.add.arc(ax, ay, 12, 0, 360, false, 0x0b0e14, 1.0).setDepth(9);
    this.oraclePupil = this.add.arc(ax, ay, 5, 0, 360, false, 0x39ff14, 1.0).setDepth(10);

    this.oracleProverbText = this.add
      .text(ax, ay - 54, "TRUTH OVER COMFORT.", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#39ff14",
        backgroundColor: "#0b0e14d0",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.mountHallLights();

    // Player Shadow & Sprite
    this.shadow = this.add.ellipse(spawn.x, spawn.y + 2, 28, 10, 0x000000, 0.42).setDepth(13);

    this.player = this.physics.add
      .sprite(spawn.x, spawn.y, `skin-${this.activeSkinId}`, 0)
      .setDisplaySize(OP_W, OP_H)
      .setDepth(14);

    this.player.body.setCircle(10, 6, 20);
    this.player.setCollideWorldBounds(true);
    this.safePlayAnim(this.player, `${this.activeSkinId}-idle-down`);

    this.reticle = this.add
      .circle(0, 0, 6, 0x2de2e6, 0.4)
      .setStrokeStyle(1.5, 0x2de2e6, 0.55)
      .setVisible(false)
      .setDepth(15);

    // Select-gate prompt, screen-anchored, shown only while standing in a gate.
    this.gatePrompt = this.add
      .text(this.cameras.main.width / 2, this.cameras.main.height - 60, "", {
        fontFamily: "monospace", fontSize: "16px", color: "#ffc857",
        backgroundColor: "#0b0e14e6", padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40)
      .setVisible(false);

    this.loadVisits();

    // Time of day wash
    this.daylight = this.add
      .rectangle(0, 0, MAP_W, MAP_H, 0xffffff, 1)
      .setOrigin(0, 0)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.buildNightFx();
    this.applyTimeOfDay();
    this.buildTrapdoor(data?.from === "basement");
    this.promptLabel = new PromptLabel(this);

    this.cameras.main.postFX.addVignette(0.5, 0.5, 0.75, 0.4);
    this.applyDecay(this.neglectByZone());

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(200, 130);
    this.cameras.main.setZoom(1.45);

    // Spawn fully on-screen: the first painted frames may precede the final
    // sized resize, which can leave the player half-cut under the HUD bar.
    // Snap the camera onto the player one frame in, then let the follow ease.
    this.time.delayedCall(32, () => this.centerCameraOnPlayer());

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
      this.input.keyboard.on("keydown-E", () => {
        if (this.tableauOpen) this.closeTableau();
        else if (!this.isTransitioning && this.player) {
          // Select gate wins: only E, only while standing inside it.
          const gate = portalAt(this.selectGates, this.player.x, this.player.y);
          if (gate) this.triggerPortal(gate);
          else this.interact();
        }
      });
      this.input.keyboard.on("keydown-SPACE", () => {
        if (this.tableauOpen) this.closeTableau();
        else this.interact();
      });
      this.input.keyboard.on("keydown-ESC", () => this.closeTableau());
    }

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.paused) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const hit = npcAtPoint(w.x, w.y);
      // PERF: squared distance avoids Math.hypot in the hot path
      const dx = w.x - this.player.x;
      const dy = w.y - this.player.y;
      const distSqToPlayer = dx * dx + dy * dy;
      if (hit) {
        if (hit.id === "oracle") hallAudio.playOracleGaze();
        else hallAudio.playInteract();
        if (distSqToPlayer < 8100) {
          // Already at the NPC: talk immediately. E/Space does the same.
          this.eventsOut.onTalk(hit);
          return;
        }
        // Far NPC: walk the player next to them, then open the dialogue.
        this.pendingApproach = null;
        this.approach(hit);
        return;
      }
      if (walkable(w.x, w.y)) {
        this.dest = { x: w.x, y: w.y };
        this.pendingApproach = null;
        this.reticle.setPosition(w.x, w.y).setVisible(true);
        try { (window as unknown as Record<string, unknown>).__keepLastClick = { x: w.x, y: w.y, dest: this.dest, t: Date.now() }; } catch { /* no window */ }
      }
    });

    try {
      const stored = localStorage.getItem("ravenstack.keep.seals");
      if (stored) {
        const n = parseInt(stored, 10);
        if (n > 0) this.restoreSeals(n);
      }
    } catch {
      // LocalStorage blocked
    }

    // React holds a ref to this scene the moment the bridge exists, but the
    // scene's create() runs on Phaser's async boot. Signals that the objects
    // below are all live before external code touches them.
    this.ready = true;
    this.portalGraceUntil = (this.time?.now ?? 0) + 800;
    try {
      (window as unknown as Record<string, unknown>).__keepSceneKey = this.scene.key;
      (window as unknown as Record<string, unknown>).__keepSpawn = spawn;
    } catch { /* headless / no window */ }
    this.cameras.main.fadeIn(250);
    try {
      (window as unknown as Record<string, unknown>).__keepPlayer = { x: spawn.x, y: spawn.y, vx: 0, vy: 0, paused: false, dest: null, stickX: 0, stickY: 0, sceneKey: this.scene.key };
    } catch { /* no window */ }
    this.eventsOut.onSceneReady?.(this);
  }

  private triggerPortal(p: PortalTrigger) {
    if (this.isTransitioning || !this.player) return;
    this.isTransitioning = true;
    this.player.setVelocity(0, 0);
    this.dest = null;
    this.stickX = 0;
    this.stickY = 0;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start(p.targetScene, { spawn: p.targetSpawn });
    });
  }

  /** Brighten every light for a beat; updateHallLights() fades it back. */
  public pulseTorch() {
    this.lightPulse = 1;
  }

  /**
   * Mount HALL_LIGHTS as soft additive glows.
   *
   * These were Phaser PointLights and got pulled, because a point light over a
   * painted backdrop with no normal map renders as a flat, hard-edged colour
   * disc rather than a torch. A radial-gradient texture on BlendModes.ADD only
   * adds colour and has a long smooth tail, so it reads as light falling on the
   * painting. Depth 21 sits above the time-of-day multiply wash at 20, so the
   * braziers stay orange when midnight turns the hall navy.
   */
  private mountHallLights() {
    this.hallLights = [];
    this.lightBase = [];
    this.lightPhase = [];
    this.lightPulse = 0;
    for (const cfg of HALL_LIGHTS) {
      const key = `hall-light-${cfg.color.toString(16).padStart(6, "0")}`;
      if (!this.textures.exists(key) && !this.makeGlowTexture(key, cfg.color)) continue;
      const base = cfg.intensity * LIGHT_ALPHA;
      this.hallLights.push(
        this.add
          .image(cfg.x, cfg.y, key)
          .setDisplaySize(cfg.radius * 2, cfg.radius * 2)
          .setAlpha(base)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(21),
      );
      this.lightBase.push(base);
      // Random phase, or every fire in the hall breathes in lockstep.
      this.lightPhase.push(Math.random() * Math.PI * 2);
    }
  }

  /** One soft radial gradient per light colour. The colour is baked into the
   *  texture rather than applied with setTint, which is WebGL-only and would
   *  leave white discs on a canvas renderer. */
  private makeGlowTexture(key: string, color: number): boolean {
    const size = 128;
    const canvas = this.textures.createCanvas(key, size, size);
    if (!canvas) return false;
    const ctx = canvas.getContext();
    const half = size / 2;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},0.16)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
    return true;
  }

  /** Flicker and pulse, every frame — independent of what the Oracle is doing. */
  private updateHallLights(delta: number) {
    if (this.hallLights.length === 0) return;
    this.lightPulse = Math.max(0, this.lightPulse - delta / 900);
    const boost = 1 + this.lightPulse * 1.4;
    for (let i = 0; i < this.hallLights.length; i++) {
      const cfg = HALL_LIGHTS[i];
      if (!cfg) continue;
      let wobble = 0;
      if (cfg.flicker !== 0) {
        this.lightPhase[i] += (delta / 1000) * ((Math.PI * 2) / cfg.period);
        wobble = Math.sin(this.lightPhase[i]) * 0.6 + Math.sin(this.lightPhase[i] * 2.7) * 0.4;
      }
      const alpha = this.lightBase[i] * boost * (1 + wobble * cfg.flicker);
      this.hallLights[i].setAlpha(Math.min(1, alpha));
    }
  }

  public squash(sx: number, sy: number) {
    if (!this.player) return;
    this.tweens.add({
      targets: this.player,
      scaleX: (OP_W / FRAME_W) * sx,
      scaleY: (OP_H / FRAME_H) * sy,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  public setSkin(skinId: string) {
    if (!RAVENLORD_SKINS.some((s) => s.id === skinId)) return;
    this.activeSkinId = skinId;
    try {
      localStorage.setItem("ravenlord_skin", skinId);
    } catch {
      // Ignore
    }
    this.eventsOut.onSkinChange?.(skinId);
    this.applyFacingAnim("idle", true);
  }

  private safePlayAnim(target: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, key: string, ignoreIfPlaying = false) {
    if (this.anims.exists(key)) {
      target.play(key, ignoreIfPlaying);
    }
  }

  /**
   * All four directions have their own drawn row (right = frames 8-11).
   * Never mirror: flipping the left row gives a wrong right (641-700 of
   * 1280 pixels differ per frame from the drawn right row), which is
   * exactly the sideways snap Jason reported. Play the facing's own
   * anim; ignoreIfPlaying keeps the cycle running when facing is unchanged.
   */
  private applyFacingAnim(prefix: "walk" | "idle", ignoreIfPlaying = false) {
    const facing = this.lastFacing;
    this.player.setFlipX(false);
    this.safePlayAnim(this.player, `${this.activeSkinId}-${prefix}-${facing}`, ignoreIfPlaying);
  }

  private loadVisits() {
    try {
      const raw = localStorage.getItem(VISITS_KEY);
      if (raw) this.visits = JSON.parse(raw);
    } catch {
      this.visits = {};
    }
  }

  private markVisited(zoneId: string) {
    this.visits[zoneId] = Date.now();
    try {
      localStorage.setItem(VISITS_KEY, JSON.stringify(this.visits));
    } catch {
      // Storage blocked
    }
  }

  /** Calculates hours elapsed since last visit to each room. */
  private neglectByZone(): Record<string, number> {
    const now = Date.now();
    const result: Record<string, number> = {};
    for (const z of ZONES) {
      const last = this.visits[z.id];
      if (!last) result[z.id] = 72; // Default to 3 days unvisited
      else result[z.id] = (now - last) / (1000 * 60 * 60);
    }
    return result;
  }

  /** Time-of-day wash calculation over the keep map. */
  /** Time-of-day wash from the ONE game clock (clock.ts). Was run once in
   *  create(); now re-applied every 500 ms from update(), so the light moves
   *  with the clock, torches catch at dusk and fireflies come out at night. */
  private applyTimeOfDay() {
    const hour = gameHour();
    this.hourNow = hour;
    const [r, g, b] = washRGB(hour);
    this.daylight.setFillStyle((r << 16) | (g << 8) | b, 1);
    const lit = torchesLit(hour);
    if (this.torchesOn !== null && lit && !this.torchesOn) {
      hallAudio.playTorchLight();
      for (const t of this.torchFx) {
        t.core.setScale(0.1);
        this.tweens.add({ targets: t.core, scale: 0.42, duration: 450, ease: "Back.easeOut" });
      }
    }
    this.torchesOn = lit;
    const phase = phaseOf(hour);
    if (this.lastPhase && phase !== this.lastPhase && this.player) {
      if (phase === "night") floatLine(this, this.player.x, this.player.y - 50, "Night falls on the Keep.", 2600);
      if (phase === "dawn") floatLine(this, this.player.x, this.player.y - 50, "Dawn. The torches gutter out.", 2600);
    }
    this.lastPhase = phase;
    try {
      (window as unknown as Record<string, unknown>).__keepTime = {
        hour: Math.round(hour * 100) / 100, phase, torches: lit, fireflies: firefliesOut(hour), night: isNight(hour),
      };
    } catch { /* ignore */ }
  }

  /** Torch glows (soft radial, ADD) above the wash so they read in the dark,
   *  plus a firefly swarm over the yard. Alpha follows the clock. */
  private buildNightFx() {
    for (const t of TORCHES) {
      const glow = this.add.image(t.x, t.y, FX.GLOW).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff9a3c).setDisplaySize(t.r * 2, t.r * 2).setAlpha(0);
      const core = this.add.image(t.x, t.y, FX.GLOW).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffe2a0).setScale(0.42).setAlpha(0);
      this.torchFx.push({ glow, core, r: t.r, phase: Math.random() * Math.PI * 2 });
    }
    const a = FIREFLY_AREA;
    for (let i = 0; i < 22; i++) {
      const bx = a.x + Math.random() * a.w;
      const by = a.y + Math.random() * a.h;
      const dot = this.add.image(bx, by, FX.GLOW).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xd8ff7a).setScale(0.09).setAlpha(0);
      this.flies.push({ dot, bx, by, ph: Math.random() * 10, sp: 0.4 + Math.random() * 0.6 });
    }
    this.torchLevel = torchesLit(gameHour()) ? 1 : 0;
    this.flyLevel = firefliesOut(gameHour()) ? 1 : 0;
  }

  private updateNightFx(time: number, delta: number) {
    if (time >= this.nextClockApply) { this.nextClockApply = time + 500; this.applyTimeOfDay(); }
    const k = Math.min(1, delta / 900);
    this.torchLevel += ((this.torchesOn ? 1 : 0) - this.torchLevel) * k;
    this.flyLevel += ((firefliesOut(this.hourNow) ? 1 : 0) - this.flyLevel) * k;
    for (const t of this.torchFx) {
      t.phase += delta * 0.012;
      const fl = 0.82 + Math.sin(t.phase) * 0.08 + Math.sin(t.phase * 2.7 + 1.3) * 0.06 + (Math.random() - 0.5) * 0.06;
      t.glow.setAlpha(0.55 * fl * this.torchLevel);
      t.core.setAlpha(0.8 * fl * this.torchLevel);
      t.glow.setDisplaySize(t.r * 2 * (0.97 + fl * 0.05), t.r * 2 * (0.97 + fl * 0.05));
    }
    if (this.flyLevel > 0.01) {
      const ts = time / 1000;
      for (const f of this.flies) {
        const x = f.bx + Math.sin(ts * f.sp + f.ph) * 26 + Math.sin(ts * f.sp * 2.3 + f.ph) * 9;
        const y = f.by + Math.cos(ts * f.sp * 0.8 + f.ph) * 16;
        const blink = 0.5 + 0.5 * Math.sin(ts * 3 * f.sp + f.ph * 3);
        f.dot.setPosition(x, y).setAlpha(this.flyLevel * (0.25 + 0.75 * blink));
      }
    } else {
      for (const f of this.flies) f.dot.setAlpha(0);
    }
  }

  /** The courtyard end of the basement loop: a hatch in the west yard.
   *  Stand-in for the Hall v4 pantry trapdoor (v4 stays unwired). It only
   *  shows once found, and only opens from below (one-way shortcut). */
  private buildTrapdoor(arriving: boolean) {
    if (this.scene.key !== "HallScene") return;
    if (!BASEMENT_ENABLED) return;
    if (!arriving && !loadFlags()["found:trapdoor"]) return;
    const { x, y } = TRAPDOOR_SPOT;
    const frame = this.add.rectangle(0, 0, 46, 30, 0x2a1c12).setStrokeStyle(2, 0x120c08);
    const lid = this.add.rectangle(0, 0, 40, 24, 0x6b4a2c).setStrokeStyle(1, 0x3a2716);
    const plank1 = this.add.rectangle(0, -6, 40, 1, 0x3a2716);
    const plank2 = this.add.rectangle(0, 6, 40, 1, 0x3a2716);
    const ring = this.add.circle(12, 0, 3, 0x000000, 0).setStrokeStyle(1.5, 0xb0a080);
    this.hatch = this.add.container(x, y, [frame, lid, plank1, plank2, ring]).setDepth(4);
    if (arriving) {
      this.pstate = "cutscene";
      lid.setScale(1, 0.15);
      hallAudio.playCreak();
      this.time.delayedCall(450, () => {
        this.tweens.add({ targets: lid, scaleY: 1, duration: 260, ease: "Bounce.easeOut" });
        if (discover("trapdoor")) discoveryJuice(this, x, y, this.hatch ?? undefined);
        if (this.player) floatLine(this, this.player.x, this.player.y - 46, "You climb out through a hidden trapdoor.", 3000);
        this.time.delayedCall(350, () => { if (this.pstate === "cutscene") this.pstate = "walk"; });
      });
    }
  }

  /** Object interactable under the player's feet (flag / night / cooldown filtered). */
  private objectHere(): Interactable | null {
    if (!this.player || this.interactables.length === 0) return null;
    return interactableAt(this.interactables, this.player.x, this.player.y, {
      flags: loadFlags(), now: this.time.now, isNight: isNight(this.hourNow), cooldowns: this.cooldowns,
    });
  }

  private pickLine(it: Interactable): string {
    const ls = it.lines ?? [];
    return ls.length ? ls[Math.floor(Math.random() * ls.length)] : "";
  }

  private runInteractable(it: Interactable) {
    if (!this.player) return;
    if (it.cooldownMs) this.cooldowns[it.id] = this.time.now + it.cooldownMs;
    const ax = it.anchor?.x ?? this.player.x;
    const ay = it.anchor?.y ?? this.player.y;
    if (it.kind === "sit") {
      this.preSit = { x: this.player.x, y: this.player.y };
      this.player.body.reset(ax, ay);
      this.player.setVelocity(0, 0);
      this.dest = null;
      this.lastFacing = it.anchor?.face ?? "down";
      this.applyFacingAnim("idle");
      this.pstate = "sit";
      setFlag(`sat:${it.id}`, true);
      this.cameras.main.zoomTo(1.7, 500, "Sine.easeInOut");
      if (discover(it.id)) discoveryJuice(this, ax, ay - 20, this.player);
      else hallAudio.playInteract();
      floatLine(this, ax, ay - 44, this.pickLine(it) || "Seated.", 3000);
      return;
    }
    if (it.kind === "gaze") {
      hallAudio.playInteract();
      if (discover(it.id)) discoveryJuice(this, ax, ay + 40);
      floatLine(this, ax, ay - 40, this.pickLine(it), 4200);
      return;
    }
    if (it.kind === "secret") { this.pullSecretBook(it); return; }
  }

  private standUp() {
    if (!this.player) return;
    if (this.preSit) this.player.body.reset(this.preSit.x, this.preSit.y);
    this.preSit = null;
    this.pstate = "walk";
    this.cameras.main.zoomTo(1.45, 400, "Sine.easeInOut");
    hallAudio.playInteract();
  }

  /** Library secret: pull book → shelf slides with a grind → fade → basement. */
  private pullSecretBook(it: Interactable) {
    if (!BASEMENT_ENABLED) return;
    if (!this.player || this.isTransitioning) return;
    this.pstate = "cutscene";
    this.isTransitioning = true;
    this.player.setVelocity(0, 0);
    this.dest = null;
    this.stickX = 0;
    this.stickY = 0;
    if (it.anchor) this.player.body.reset(it.anchor.x, it.anchor.y);
    this.lastFacing = "up";
    this.applyFacingAnim("idle");
    hallAudio.playCreak();
    floatLine(this, this.player.x, this.player.y - 46, this.pickLine(it) || "Click.", 1500);
    // Slab = a frame cut from the painted map itself, drawn over a dark gap,
    // so the painted shelf slides aside. The map is never edited.
    // Middle library bookcase, measured on keep-map.jpg (world 188-288 x 70-198).
    const SX = 188, SY = 70, SW = 100, SH = 128;
    // NOTE: never add a named frame to "keep-map": Phaser makes the first
    // added frame the texture's default, and the map then draws as that frame.
    const gap = this.add.rectangle(SX + SW / 2, SY + SH / 2, SW - 8, SH - 6, 0x050304, 1).setDepth(1);
    for (let i = 0; i < 3; i++) this.add.rectangle(SX + SW / 2, SY + SH - 14 - i * 16, SW - 30 - i * 12, 3, 0x2a211a, 1).setDepth(1);
    const slab = this.add.image(0, 0, "keep-map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H).setCrop(SX, SY, SW, SH).setDepth(2);
    this.time.delayedCall(350, () => {
      hallAudio.playStoneGrind();
      this.cameras.main.shake(700, 0.0016);
      this.tweens.add({ targets: slab, x: -64, duration: 750, ease: "Sine.easeInOut" });
      const first = discover("secret-shelf");
      this.time.delayedCall(780, () => {
        if (first) discoveryJuice(this, SX + SW / 2, SY + SH / 2, gap);
        try { (window as unknown as Record<string, unknown>).__keepShelfOpen = true; } catch { /* ignore */ }
        this.time.delayedCall(first ? 900 : 300, () => {
          fadeThrough(this, () => {
            this.scene.start("BasementRoomScene", { spawn: BASEMENT_ARRIVAL, from: "shelf" });
          }, { outMs: 450 });
        });
      });
    });
  }

  /** Move a walker and its shadow / tag together. */
  private placeWalker(w: NpcWalker, x: number, y: number) {
    w.spr.setPosition(x, y);
    w.shadow.setPosition(x, y + OP_H / 2 - 2);
    w.tag?.setPosition(x, y - OP_H / 2 - 6);
    NPC_LIVE.set(w.npc.id, { x, y });
  }

  /** Routine tick: if the clock moved this NPC to a new stop, queue the walk. */
  private updateRoutine(w: NpcWalker, time: number): RoutineStop | null {
    const stops = NPC_ROUTINES[w.npc.id];
    if (!stops) return null;
    const st = routineStopAt(stops, this.hourNow);
    if (st.id !== w.stopId) {
      w.stopId = st.id;
      w.path = [...(st.via ?? []), st.at];
      w.target = w.path.shift() ?? null;
      w.pauseUntil = 0;
      w.stallMs = 0;
      if (st.say && !w.bubble) this.showBubble(w.npc.id, st.say, 4000);
      try { (window as unknown as Record<string, unknown>).__keepLastRoutine = { id: w.npc.id, stop: st.id, t: time }; } catch { /* ignore */ }
    }
    return st;
  }

  private applyDecay(hoursByZone: Record<string, number>) {
    for (const [zoneId, hours] of Object.entries(hoursByZone)) {
      if (hours > 24) {
        const zone = ZONES.find((z) => z.id === zoneId);
        if (!zone) continue;
        const count = Math.min(8, Math.floor(hours / 12));
        for (let i = 0; i < count; i++) {
          const dx = zone.rect.x + Math.random() * zone.rect.w;
          const dy = zone.rect.y + Math.random() * zone.rect.h;
          if (walkable(dx, dy)) {
            this.add.circle(dx, dy, 1.5 + Math.random() * 2, 0x3a3f4b, 0.35).setDepth(3);
          }
        }
      }
    }
  }

  public setTruthState(state: "sourced" | "thin" | "none") {
    if (!this.oracleEye) return;
    this.truthState = state;
    const colors = {
      sourced: 0x39ff14, // Toxic Green
      thin: 0xffc857,    // Amber
      none: 0xff2a6d,    // Red Alert
    };
    const c = colors[state];
    this.oracleEye.setTint(c);
    this.oracleGlow?.setFillStyle?.(c, 0.35);
    this.oracleHalo?.setFillStyle?.(c, 0.18);
    this.oraclePupil?.setFillStyle?.(c, 1.0);
    this.oracleProverbText?.setColor(state === "sourced" ? "#39ff14" : state === "thin" ? "#ffc857" : "#ff2a6d");
  }

  public setOracleThinking(thinking: boolean) {
    this.oracleThinking = thinking;
    if (thinking) {
      this.oracleProverbText.setText("CONSULTING CANONICAL REGISTRY...").setColor("#2de2e6");
    } else {
      const proverb = TRUTH_PROVERBS[Math.floor(Math.random() * TRUTH_PROVERBS.length)];
      this.oracleProverbText.setText(proverb);
      this.setTruthState(this.truthState);
    }
  }

  public flareQuarantine(claim?: string) {
    this.setTruthState("none");
    this.oracleProverbText
      ?.setText(claim ? `QUARANTINED: ${claim.slice(0, 42)}…` : "A LIE ENTERS THE CELL")
      .setAlpha(1)
      .setScale(1.3);
    this.oracleHalo?.setScale(2.4);
    this.oracleGlow?.setScale(2.0);
    this.cameras.main.shake(180, 0.004);
    this.tweens.add({ targets: [this.oracleHalo, this.oracleGlow], scale: 1, duration: 1400, ease: "Cubic.easeOut" });
    this.tweens.add({ targets: this.oracleProverbText, scale: 1, duration: 900, ease: "Back.easeOut" });
  }

  public pressSeal(count: number) {
    const radius = 90;
    const angle = (count * 0.9) % (Math.PI * 2);
    const center = { x: 900, y: 480 };
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * (radius * 0.6);

    const seal = this.add.circle(x, y, 12, 0xff2a6d, 0.95).setDepth(15);
    seal.setStrokeStyle(3, 0xffc857, 0.95);
    this.seals.push(seal);

    this.hitPause(120);
    seal.setScale(2.6).setAlpha(0);
    this.tweens.add({ targets: seal, scale: 1, alpha: 0.85, duration: 320, ease: "Back.easeOut" });
    this.cameras.main.shake(90, 0.0025);
  }

  public restoreSeals(count: number) {
    for (let i = this.seals.length; i < count; i++) {
      const before = this.freezeMs;
      this.pressSeal(i + 1);
      this.freezeMs = before;
      const seal = this.seals[this.seals.length - 1];
      this.tweens.killTweensOf(seal);
      seal.setScale(1).setAlpha(0.85);
    }
  }

  public openTableau(claim: string, prompt: string | null, evidence: string, _when: string) {
    if (this.tableauOpen) return;
    this.tableauOpen = true;
    this.paused = true;

    const cam = this.cameras.main;
    this.tableauFx = cam.postFX.addColorMatrix();
    (this.tableauFx as Phaser.FX.ColorMatrix).blackWhite();

    const shroud = this.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width * 1.5, cam.height * 1.5, 0x05020d, 0.88)
      .setDepth(40)
      .setScrollFactor(0);

    const mono = (y: number, text: string, sz = 13, color = "#e8ecf1", alpha = 1) =>
      this.add
        .text(cam.width / 2, y, text, {
          fontFamily: "monospace",
          fontSize: `${sz}px`,
          color,
          align: "center",
          wordWrap: { width: Math.min(620, cam.width - 48) },
        })
        .setOrigin(0.5, 0)
        .setDepth(42)
        .setScrollFactor(0)
        .setAlpha(alpha);

    const items: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [shroud];
    items.push(mono(64, "THE CELL — RECORD OF FABRICATION", 11, "#ff2a6d"));
    items.push(mono(88, claim, 17, "#e8ecf1"));

    if (prompt) {
      items.push(mono(150, `PROMPT: ${prompt}`, 11, "#9aa3b2"));
    }

    const evY = prompt ? 190 : 160;
    items.push(
      mono(
        evY,
        evidence.length > 0 ? `EVIDENCE:\n${evidence}` : "EVIDENCE: (None attached to claim)",
        11,
        "#2de2e6",
        0.9
      )
    );

    items.push(mono(cam.height - 104, "[E] or [ESC] to step back", 11, "#9aa3b2", 0.7));

    for (const item of items) {
      item.setAlpha(0);
      this.tweens.add({ targets: item, alpha: item === shroud ? 0.88 : 1, duration: 700, ease: "Sine.easeInOut" });
    }
    this.tableau = items;
    this.cameras.main.shake(220, 0.003);
  }

  public closeTableau() {
    if (!this.tableauOpen) return;
    this.tableauOpen = false;
    this.paused = false;
    if (this.tableauFx) {
      this.cameras.main.postFX.remove(this.tableauFx as unknown as Phaser.FX.Controller);
      this.tableauFx = null;
    }
    for (const item of this.tableau) item.destroy();
    this.tableau = [];
  }

  public hitPause(ms = 100) {
    this.freezeMs = Math.max(this.freezeMs, ms);
  }

  public triggerOracleManifestation(customProverb?: string) {
    if (this.isManifesting) return;
    this.isManifesting = true;

    hallAudio.playOracleManifest();

    this.cameras.main.shake(400, 0.0035);
    this.spectralVignette.setAlpha(0.32);
    this.tweens.add({
      targets: this.spectralVignette,
      alpha: 0,
      duration: 1800,
      ease: "Quad.easeOut",
    });

    this.oracleHalo.setScale(1.8);
    this.oracleGlow.setScale(1.6);
    this.tweens.add({
      targets: [this.oracleHalo, this.oracleGlow],
      scale: 1,
      duration: 1200,
      ease: "Quad.easeOut",
    });

    const proverb = customProverb ?? TRUTH_PROVERBS[Math.floor(Math.random() * TRUTH_PROVERBS.length)];
    this.oracleProverbText.setText(proverb).setAlpha(1);

    this.time.delayedCall(12000, () => {
      this.isManifesting = false;
    });
  }

  interact() {
    if (this.paused || !this.player) return;
    // One E press reaches here twice (Phaser keydown-E and React's window
    // listener). Toggles like sit/stand must only see it once.
    const nowMs = Date.now();
    if (nowMs - this.lastInteractAt < 200) return;
    this.lastInteractAt = nowMs;
    if (this.pstate === "sit") { this.standUp(); return; }
    if (this.pstate !== "walk") return;
    // Gate-fix 2026-10-30: React's window E handler preventDefaults E and
    // calls interact() only, so Phaser's keydown-E gate handler never sees
    // the key (Phaser drops defaultPrevented events). Gate must win here
    // too, or the courtyard->interior select gate can never fire via E.
    const gate = portalAt(this.selectGates, this.player.x, this.player.y);
    if (gate) { this.triggerPortal(gate); return; }
    // Nearest NPC in range wins, whichever way you face (one E prompt rule).
    const npc = npcNear(this.player.x, this.player.y, 12);
    if (npc) {
      if (npc.id === "oracle") {
        hallAudio.playOracleGaze();
      } else {
        hallAudio.playInteract();
      }
      this.eventsOut.onTalk(npc);
      return;
    }
    const it = this.objectHere();
    if (it) { this.runInteractable(it); return; }
    if (tableFacing(this.player.x, this.player.y, this.lastFacing)) {
      hallAudio.playInteract();
      this.eventsOut.onTable();
    }
  }

  /**
   * Clicked a far NPC: set a walkable approach tile inside the NPC's talk
   * radius and remember to open their dialogue on arrival. Picks the point
   * on the player's side of the NPC first, then any nearest walkable tile.
   */
  private approach(npcIn: HallNpc) {
    const npc = { ...npcIn, ...npcPos(npcIn) };
    if (!this.player || !walkable(npc.x, npc.y)) return;
    const dx = this.player.x - npc.x;
    const dy = this.player.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDist = npc.radius + 10;
    let tx = npc.x + (dx / dist) * targetDist;
    let ty = npc.y + (dy / dist) * targetDist;
    if (!walkable(tx, ty)) {
      let best: { x: number; y: number; dSq: number } | null = null;
      for (let a = 0; a < 32; a++) {
        const ang = (a / 32) * Math.PI * 2;
        const cx = npc.x + Math.cos(ang) * targetDist;
        const cy = npc.y + Math.sin(ang) * targetDist;
        if (!walkable(cx, cy)) continue;
        const ddx = cx - this.player.x;
        const ddy = cy - this.player.y;
        const dSq = ddx * ddx + ddy * ddy;
        if (!best || dSq < best.dSq) best = { x: cx, y: cy, dSq };
      }
      if (!best) return;
      tx = best.x;
      ty = best.y;
    }
    this.dest = { x: tx, y: ty };
    this.pendingApproach = npcIn;
    this.reticle.setPosition(tx, ty).setVisible(true);
  }

  /** Snap the camera back onto the player (spawn / post-resize). */
  public centerCameraOnPlayer() {
    if (this.player && this.cameras.main) {
      this.cameras.main.centerOn(this.player.x, this.player.y);
    }
  }

  /**
   * Enable or disable Phaser's keyboard while React owns the focus (talk /
   * table / wardrobe modals). Instead of fully pausing the scene, the keyboard
   * plugin is switched off so typing in an input never fires E/Space/ESC into
   * the game, then re-enabled (with global capture) when a modal closes.
   */
  public setKeyboardEnabled(on: boolean) {
    if (!this.input?.keyboard) return;
    this.input.keyboard.enabled = on;
    if (on) this.input.keyboard.enableGlobalCapture();
    else this.input.keyboard.disableGlobalCapture();
  }


  /** Show a speech bubble above a walking NPC. Callers keep it to one
   *  bubble at a time (see npcBubbleActive). Used by the timer, proximity
   *  lines, and the React ask box (live answers). */
  public showBubble(npcId: string, text: string, ms = 4500) {
    const w = this.npcWalkers.get(npcId);
    if (!w) return;
    if (w.bubble) { try { w.bubble.destroy(); } catch { /* ignore */ } w.bubble = null; }
    w.bubble = this.add.text(w.spr.x, w.spr.y - OP_H / 2 - 30, text, {
      fontFamily: "monospace", fontSize: "12px", color: "#e8ecf1", align: "center",
      backgroundColor: "#0b0e14e6", padding: { x: 8, y: 5 },
      wordWrap: { width: 220 },
    }).setOrigin(0.5, 1).setDepth(30);
    w.bubbleUntil = this.time.now + ms;
  }

  private npcBubbleActive(): boolean {
    for (const w of this.npcWalkers.values()) if (w.bubble) return true;
    return false;
  }

  // Valerie stays in the Workshop. Workshop floor in world.ts WALK is
  // The rect and why it is not the zone rect: see VALERIE_LEASH in world.ts.
  private static readonly VALERIE_WORKSHOP = VALERIE_LEASH;

  private inWorkshop(x: number, y: number): boolean {
    const r = (this.constructor as typeof HallScene).VALERIE_WORKSHOP;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private pickWaypoint(npcId?: string): { x: number; y: number } | null {
          if (npcId === "valerie") {
      const r = (this.constructor as typeof HallScene).VALERIE_WORKSHOP;
      for (let i = 0; i < 24; i++) {
        const x = r.x + Math.random() * r.w;
        const y = r.y + Math.random() * r.h;
        if (walkable(x, y + WALKER_FEET)) return { x, y };
      }
      return null;
    }
    for (let i = 0; i < 12; i++) {
      const x = 120 + Math.random() * (MAP_W - 240);
      const y = 120 + Math.random() * (MAP_H - 240);
      if (walkable(x, y + WALKER_FEET)) return { x, y };
    }
    return null;
  }

  /** Idle spot near a routine stop (walkable, Valerie kept in the Workshop). */
  private pickNear(stop: RoutineStop): { x: number; y: number } | null {
    const r = stop.roam ?? 30;
    for (let i = 0; i < 12; i++) {
      const x = stop.at.x + (Math.random() * 2 - 1) * r;
      const y = stop.at.y + (Math.random() * 2 - 1) * r;
      if (walkable(x, y)) return { x, y };
    }
    return { ...stop.at };
  }

  private faceToward(w: NpcWalker, dx: number, dy: number) {
    const facing: Facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
    if (facing !== w.facing || w.spr.anims.currentAnim?.key !== `npc-idle-${w.npc.id}-${facing}`) {
      w.facing = facing;
      if (this.anims.exists(`npc-idle-${w.npc.id}-${facing}`)) w.spr.play(`npc-idle-${w.npc.id}-${facing}`);
    }
  }

  private updateNpcWander(time: number, delta: number) {
    if (!this.player) return;
    if (this.nextSpeechAt === 0) this.nextSpeechAt = time + 20000 + Math.random() * 20000;
    const step = (NPC_SPEED * delta) / 1000;
    for (const w of this.npcWalkers.values()) {
      if (w.bubble) {
        w.bubble.setPosition(w.spr.x, w.spr.y - OP_H / 2 - 30);
        if (time > w.bubbleUntil) { try { w.bubble.destroy(); } catch { /* ignore */ } w.bubble = null; }
      }
      const stop = this.updateRoutine(w, time);
      const travelling = w.path.length > 0 || (!!stop && !!w.target && (w.target.x - stop.at.x) ** 2 + (w.target.y - stop.at.y) ** 2 < 4 && (w.spr.x - stop.at.x) ** 2 + (w.spr.y - stop.at.y) ** 2 > 90 * 90);
      const dx = this.player.x - w.spr.x;
      const dy = this.player.y - w.spr.y;
      if (!travelling && dx * dx + dy * dy < 140 * 140) {
        // Close: stop wandering, face the player, proximity line (30s cooldown).
        w.target = null;
        this.faceToward(w, dx, dy);
        if (time > w.proxUntil && !this.npcBubbleActive()) {
          const line = NPC_PROX_LINES[w.npc.id];
          if (line) this.showBubble(w.npc.id, line);
          w.proxUntil = time + 30000;
        }
        continue;
      }
      if (w.target) {
        const tx = w.target.x - w.spr.x;
        const ty = w.target.y - w.spr.y;
        if (tx * tx + ty * ty < 64) {
          w.target = null;
          w.stallMs = 0;
          if (w.path.length > 0) { w.target = w.path.shift() ?? null; continue; }
          if (stop?.face && (w.spr.x - stop.at.x) ** 2 + (w.spr.y - stop.at.y) ** 2 < 100) {
            this.faceToward(w, stop.face === "left" ? -1 : stop.face === "right" ? 1 : 0, stop.face === "up" ? -1 : stop.face === "down" ? 1 : 0);
            w.pauseUntil = time + 4000 + Math.random() * 5000;
            continue;
          }
          if (w.npc.id === "valerie" && Math.random() < 0.4) {
            // Work pause: longer, facing up toward the workshop benches.
            // No new art — pause + facing change only.
            w.pauseUntil = time + 6000 + Math.random() * 6000;
            this.faceToward(w, 0, -1);
          } else {
            w.pauseUntil = time + 1500 + Math.random() * 2500;
          }
          if (this.anims.exists(`npc-idle-${w.npc.id}-${w.facing}`)) w.spr.play(`npc-idle-${w.npc.id}-${w.facing}`);
          continue;
        }
        const facing: Facing = Math.abs(tx) >= Math.abs(ty) ? (tx >= 0 ? "right" : "left") : (ty >= 0 ? "down" : "up");
        let nx = w.spr.x;
        let ny = w.spr.y;
        const mx = Math.max(-step, Math.min(step, tx));
        const my = Math.max(-step, Math.min(step, ty));
        // Sprites are centred on their middle, so probe the FEET. Otherwise a
        // walker's centre can sit on bare floor while the body stands on the
        // painted war table.
        if (walkable(w.spr.x + mx, w.spr.y + WALKER_FEET)) nx = w.spr.x + mx;
        if (walkable(nx, w.spr.y + my + WALKER_FEET)) ny = w.spr.y + my;
        if (w.npc.id === "valerie") {
          // Hard confinement: never accept a step that leaves the workshop.
          if (!this.inWorkshop(nx, w.spr.y)) nx = w.spr.x;
          if (!this.inWorkshop(nx, ny)) ny = w.spr.y;
        }
        // Stuck on an edge for 1.5 s: hop to the waypoint rather than grind.
        if (nx === w.spr.x && ny === w.spr.y) {
          w.stallMs += delta;
          if (w.stallMs > 1500) { nx = w.target.x; ny = w.target.y; w.stallMs = 0; }
        } else w.stallMs = 0;
        this.placeWalker(w, nx, ny);
        if (facing !== w.facing || w.spr.anims.currentAnim?.key !== `npc-walk-${w.npc.id}-${facing}`) {
          w.facing = facing;
          if (this.anims.exists(`npc-walk-${w.npc.id}-${facing}`)) w.spr.play(`npc-walk-${w.npc.id}-${facing}`);
        }
        continue;
      }
      if (time > w.pauseUntil) {
        w.target = stop ? this.pickNear(stop) : this.pickWaypoint(w.npc.id);
        if (!w.target) w.pauseUntil = time + 2000;
      } else if (this.anims.exists(`npc-idle-${w.npc.id}-${w.facing}`) && w.spr.anims.currentAnim?.key !== `npc-idle-${w.npc.id}-${w.facing}`) {
        w.spr.play(`npc-idle-${w.npc.id}-${w.facing}`);
      }
    }
    try {
      (window as unknown as Record<string, unknown>).__keepNpcs = [...this.npcWalkers.values()].map((v) => ({
        id: v.npc.id, x: Math.round(v.spr.x), y: Math.round(v.spr.y),
        facing: v.facing, target: v.target, paused: time < v.pauseUntil, stop: v.stopId, pathLeft: v.path.length,
      }));
    } catch { /* ignore */ }
    // Timer speech: one NPC at a time, every 20-40s, cycling preset lines.
    if (time >= this.nextSpeechAt && !this.npcBubbleActive()) {
      const walkers = [...this.npcWalkers.values()];
      if (walkers.length > 0) {
        const w = walkers[this.speechIdx % walkers.length];
        this.speechIdx += 1;
        const lines = (isNight(this.hourNow) ? NPC_NIGHT_LINES[w.npc.id] : null) ?? NPC_LINES[w.npc.id] ?? [];
        if (lines.length > 0) {
          this.showBubble(w.npc.id, lines[w.lineIdx % lines.length]);
          w.lineIdx += 1;
        }
      }
      this.nextSpeechAt = time + 20000 + Math.random() * 20000;
    }
  }

  update(time: number, delta: number) {
    try { (window as unknown as Record<string, unknown>).__keepFrame = ((window as unknown as Record<string, number>).__keepFrame ?? 0) + 1; } catch { /* no window */ }
    if (this.freezeMs > 0) {
      this.freezeMs -= delta;
      this.player?.setVelocity(0, 0);
      return;
    }

    this.updateHallLights(delta);

    // Oracle Eye updates
    if (this.oracleEye && this.player) {
      this.oracleDriftT += delta * 0.00035;
      const driftX = Math.sin(this.oracleDriftT * 0.9) * 26;
      const driftY = Math.cos(this.oracleDriftT * 1.3) * 14 + Math.sin(this.oracleDriftT * 2.7) * 4;

      const dx = this.player.x - (this.oracleAnchor.x + driftX);
      const dy = this.player.y - (this.oracleAnchor.y + driftY);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const attention = Phaser.Math.Clamp(1 - (dist - 90) / 320, 0, 1);
      const leanX = (dx / dist) * 11 * attention;
      const leanY = (dy / dist) * 8 * attention;

      const eyeX = this.oracleAnchor.x + driftX + leanX;
      const eyeY = this.oracleAnchor.y + driftY + leanY;
      this.oracleEye.setPosition(eyeX, eyeY);

      this.blinkTimer -= delta;
      if (this.oracleThinking) this.blinkTimer = 1200;
      if (!this.oracleThinking && this.blinkTimer <= 0 && this.lidTarget === 0) {
        this.lidTarget = 1;
        this.time.delayedCall(90, () => {
          this.lidTarget = 0;
        });
        this.blinkTimer = 2600 + Math.random() * 4200;
      }
      this.lidClosed += (this.lidTarget - this.lidClosed) * Math.min(1, delta * 0.022);
      this.oracleEye.setDisplaySize(68, Math.max(2, 68 * (1 - this.lidClosed * 0.97)));

      const dilate = 1 + attention * 0.45;
      this.oracleGlow?.setPosition(eyeX, eyeY);
      this.oracleHalo?.setPosition(eyeX, eyeY);
      this.oracleGlow?.setScale(dilate * (1 - this.lidClosed * 0.8));
      this.oracleProverbText?.setPosition(eyeX, eyeY - 54);

      const gazeMax = 13;
      const tx = eyeX + (dx / dist) * gazeMax * Math.min(1, attention + 0.25);
      const ty = eyeY + (dy / dist) * gazeMax * Math.min(1, attention + 0.25);
      const lag = Math.min(1, delta * 0.004);
      this.irisPos.x += (tx - this.irisPos.x) * lag;
      this.irisPos.y += (ty - this.irisPos.y) * lag;

      const lidScale = Math.max(0.04, 1 - this.lidClosed);
      this.oracleIris?.setPosition(this.irisPos.x, this.irisPos.y).setScale(1, lidScale);
      this.oraclePupil
        ?.setPosition(this.irisPos.x, this.irisPos.y)
        .setScale(1 - attention * 0.35, lidScale * (1 - attention * 0.35));

      const ax = this.oracleAnchor.x;
      const ay = this.oracleAnchor.y + 19;
      const chainAnchors = [
        { x: ax - 140, y: ay - 160 },
        { x: ax + 140, y: ay - 160 },
        { x: ax - 130, y: ay + 110 },
        { x: ax + 130, y: ay + 110 },
      ];
      for (let i = 0; i < this.oracleChains.length; i++) {
        const a = chainAnchors[i];
        if (a && this.oracleChains[i]?.active) this.oracleChains[i].setTo(a.x, a.y, eyeX, eyeY);
      }
      this.oracleEye.setRotation(Math.sin(this.oracleDriftT * 1.7) * 0.05);

      this.oracleSpawnTimer += delta;
      if (this.oracleSpawnTimer > 48000) {
        this.oracleSpawnTimer = 0;
        this.triggerOracleManifestation();
      }

      if (dist < 110 && !this.isManifesting && this.oracleSpawnTimer > 15000) {
        this.oracleSpawnTimer = 0;
        this.triggerOracleManifestation("WHO CALLS UPON THE INQUISITOR?");
      }
    }

    if (this.shadow && this.player) {
      this.shadow.setPosition(this.player.x, this.player.y + 2);
    }

    if (!this.player?.body || this.paused) {
      this.player?.setVelocity(0, 0);
      return;
    }
    this.updateNightFx(time, delta);
    this.updateNpcWander(time, delta);

    // Player-state lock: anything but "walk" freezes movement. While seated,
    // any move key (or E) stands you back up.
    if (this.pstate !== "walk") {
      this.player.setVelocity(0, 0);
      if (this.pstate === "sit") {
        const mv = this.stickX || this.stickY || this.cursors?.left?.isDown || this.cursors?.right?.isDown || this.cursors?.up?.isDown || this.cursors?.down?.isDown
          || this.wasd?.A?.isDown || this.wasd?.D?.isDown || this.wasd?.W?.isDown || this.wasd?.S?.isDown;
        if (mv) this.standUp();
        this.showPrompt({ kind: "object", verb: "Stand up", dSq: 0 }, null, null, this.player.x, this.player.y - 46);
      } else this.showPrompt(null, null, null, 0, 0);
      return;
    }

    const wSpeed = (window as unknown as Record<string, unknown>).__keepWalkSpeed;
    const speed = typeof wSpeed === "number" ? wSpeed : 175;
    let inputX = this.stickX;
    let inputY = this.stickY;

    if (this.cursors?.left?.isDown || this.wasd?.A?.isDown) inputX -= 1;
    if (this.cursors?.right?.isDown || this.wasd?.D?.isDown) inputX += 1;
    if (this.cursors?.up?.isDown || this.wasd?.W?.isDown) inputY -= 1;
    if (this.cursors?.down?.isDown || this.wasd?.S?.isDown) inputY += 1;

    let targetVel = { x: 0, y: 0 };

    if (inputX !== 0 || inputY !== 0) {
      this.dest = null;
      this.pendingApproach = null;
      this.reticle.setVisible(false);
      targetVel = calculateVelocity(inputX, inputY, speed);
    } else if (this.dest) {
      const dx = this.dest.x - this.player.x;
      const dy = this.dest.y - this.player.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 64) {
        this.dest = null;
        this.reticle.setVisible(false);
        if (this.pendingApproach) {
          const npc = this.pendingApproach;
          this.pendingApproach = null;
          hallAudio.playInteract();
          this.eventsOut.onTalk(npc);
        }
      } else {
        targetVel = calculateVelocity(dx, dy, speed);
      }
    }

    // Foot Collision & Smooth Wall Sliding
    const feetX = this.player.x;
    const feetY = this.player.y;
    const probeMargin = 10;
    const stepTime = delta / 1000;

    const canMoveX =
      targetVel.x === 0 ||
      (walkable(feetX + (targetVel.x > 0 ? probeMargin : -probeMargin) + targetVel.x * stepTime, feetY - 4) &&
       walkable(feetX + (targetVel.x > 0 ? probeMargin : -probeMargin) + targetVel.x * stepTime, feetY + 4));

    const canMoveY =
      targetVel.y === 0 ||
      (walkable(feetX - 6, feetY + (targetVel.y > 0 ? probeMargin : -probeMargin) + targetVel.y * stepTime) &&
       walkable(feetX + 6, feetY + (targetVel.y > 0 ? probeMargin : -probeMargin) + targetVel.y * stepTime));

    const finalVx = canMoveX ? targetVel.x : 0;
    const finalVy = canMoveY ? targetVel.y : 0;

    this.player.setVelocity(finalVx, finalVy);
    if (import.meta.env.DEV && (this.debugFrame++ % 30) === 0) {
      try {
        (window as unknown as Record<string, unknown>).__keepPlayer = { x: this.player.x, y: this.player.y, vx: finalVx, vy: finalVy, paused: this.paused, dest: this.dest, stickX: this.stickX, stickY: this.stickY, sceneKey: this.scene.key, body: !!this.player.body };
      } catch { /* no window */ }
    }

    const isMoving = finalVx !== 0 || finalVy !== 0;

    // Walk-fix 2026-10-30 #2: squash removed — it fired on every start/stop, stacked tweens on direction changes, and stretched the sprite while walking. wasMoving kept for step timing only.
    this.wasMoving = isMoving;

    // Wedge clear: a click that sits behind a prop or wall leaves the player
    // pushing against the boundary forever. If a dest is set but the player
    // can't move, drop it (and any pending NPC approach) after half a second.
    if (this.dest && !isMoving) {
      this.destStallMs += delta;
    } else {
      this.destStallMs = 0;
    }
    if (this.destStallMs > 550) {
      this.dest = null;
      this.pendingApproach = null;
      this.destStallMs = 0;
      this.reticle.setVisible(false);
    }

    if (isMoving) {
      this.stepTimer += delta;
      if (this.stepTimer > 310) {
        hallAudio.playStep(true);
        this.stepTimer = 0;
      }
    } else {
      this.stepTimer = 260;
    }

    this.player.setRotation(0);
    // Walk-fix 2026-10-30: per-frame setDisplaySize removed — it fought the squash tween and flickered scale. Size is set once at player creation.

    // Directional Facing & Animations
    if (isMoving) {
      this.lastFacing = determineFacing(finalVx, finalVy, this.lastFacing);
      this.applyFacingAnim("walk", true);
    } else {
      this.applyFacingAnim("idle", true);
    }

    // Portal doors (debounced: fade once, spawn-exit required, grace after create).
    if (this.portalExitRequired) {
      if (!portalAt(this.portalOpts.portals, this.player.x, this.player.y)) {
        this.portalExitRequired = false;
      }
    } else if (!this.isTransitioning && time >= this.portalGraceUntil) {
      const door = portalAt(this.portalOpts.portals, this.player.x, this.player.y);
      if (door) this.triggerPortal(door);
    }

    // Select E-gate prompt: standing inside shows it, stepping out hides it.
    // Stepping in alone never transitions — only the E handler above does.
    if (this.gatePrompt && this.player) {
      const gate = portalAt(this.selectGates, this.player.x, this.player.y);
      if (gate) {
        this.gatePrompt.setText(gate.label ?? "E — GATE").setVisible(true);
      } else {
        this.gatePrompt.setVisible(false);
      }
    }

    // Zone Transition Triggers
    const zone = zoneAt(this.player.x, this.player.y);
    const zkey = zone ? `${zone.name}:${zone.lock}` : "";
    if (zkey !== this.lastZone) {
      if (this.lastZone !== "") {
        hallAudio.playZoneTransition();
      }
      this.lastZone = zkey;
      this.eventsOut.onZone(zone?.name ?? "Keep", zone?.lock ?? "live");
      if (zone) this.markVisited(zone.id);
    }

    // ONE prompt: door (auto-step, no prompt) > NPC > object > table.
    const px = this.player.x;
    const py = this.player.y;
    const npc = npcNear(px, py, 12);
    const it = this.objectHere();
    const table = tableFacing(px, py, this.lastFacing);
    const cands: (PromptCandidate | null)[] = [
      npc ? { kind: "npc", verb: `Talk to ${npc.name}`, dSq: (npcPos(npc).x - px) ** 2 + (npcPos(npc).y - py) ** 2, ref: npc } : null,
      it ? { kind: "object", verb: it.verb, dSq: 0, ref: it } : null,
      table ? { kind: "table", verb: "Sit the war table", dSq: 1e9 } : null,
    ];
    const pick = pickPrompt(cands);
    this.curInteract = pick?.kind === "object" ? it : null;
    const lab = this.curInteract?.labelAt ?? this.curInteract?.anchor ?? { x: px, y: py - 46 };
    this.showPrompt(pick, pick?.kind === "npc" ? npc : null, this.curInteract, lab.x, lab.y);
  }

  /** Drive the single prompt: React (onPrompt) + the in-canvas label for objects. */
  private showPrompt(pick: PromptCandidate | null, npc: HallNpc | null, it: Interactable | null, lx: number, ly: number) {
    const verb = pick && pick.kind === "object" ? pick.verb : null;
    this.promptLabel?.show(verb, lx, ly);
    const atTable = pick?.kind === "table";
    const pkey = `${npc?.id ?? ""}:${atTable}:${verb ?? ""}`;
    if (pkey !== this.lastPrompt) {
      this.lastPrompt = pkey;
      this.eventsOut.onPrompt(npc, atTable, verb);
      try { (window as unknown as Record<string, unknown>).__keepPrompt = pick ? { kind: pick.kind, verb: pick.verb, id: it?.id ?? npc?.id ?? null } : null; } catch { /* ignore */ }
    }
  }
}
