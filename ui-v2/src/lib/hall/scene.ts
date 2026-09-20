import * as Phaser from "phaser";
import {
  HALL_LIGHTS,
  HALL_NPCS,
  MAP_H,
  MAP_SRC,
  MAP_W,
  PALETTE,
  PLAYER_SPAWN,
  _SOLID,
  ZONES,
  RAVENLORD_SKINS,
  npcAtPoint,
  npcFacing,
  tableFacing,
  walkable,
  zoneAt,
  type HallNpc,
} from "./world";
import { hallAudio } from "./audio";
import { calculateVelocity, determineFacing, type Facing } from "./locomotion";

export type HallEvents = {
  onZone: (name: string, lock: string) => void;
  onPrompt: (npc: HallNpc | null, atTable: boolean) => void;
  onTalk: (npc: HallNpc) => void;
  onTable: () => void;
  onSkinChange?: (skinId: string) => void;
  /** Player stepped into the Quarantine Cell. */
  onEnterCell?: () => void;
};

/** Slicing dimensions in PNG source (128x160 -> 4x4 grid of 32x40) */
const FRAME_W = 32;
const FRAME_H = 40;

/** World display scale matched to 48px tile grid and environment */
const OP_W = 54;
const OP_H = 68;

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
  private stickX = 0;
  private stickY = 0;
  private lastFacing: Facing = "down";
  private stepTimer = 0;
  private wasMoving = false;
  private oracleThinking = false;

  /** The tableau overlays: dim background, title, prompt, evidence body. */
  private tableauOpen = false;
  private tableauFx: unknown = null;
  private tableau: Phaser.GameObjects.GameObject[] = [];

  /** Room decay states computed from visit history. */
  private visits: Record<string, number> = {};

  /** Dynamic hall lights placed over the painting. */
  private hallLights: Phaser.GameObjects.PointLight[] = [];
  private lightBase: number[] = [];
  private lightPhase: number[] = [];

  /** Time-of-day wash multiplier over the painting. */
  private daylight!: Phaser.GameObjects.Rectangle;

  /** Dynamic seals pressed into the Great Hall floor when gates are approved. */
  private seals: Phaser.GameObjects.Circle[] = [];

  /** Iris look-at position eased toward the player. */
  private oracleIris!: Phaser.GameObjects.Arc;
  private oraclePupil!: Phaser.GameObjects.Arc;
  private irisPos = { x: 380, y: 296 };

  /** Frozen frame counter for hit pause. Drains in update(). */
  private freezeMs = 0;

  public paused = false;

  constructor(eventsOut: HallEvents) {
    super({ key: "HallScene" });
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

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.add.image(0, 0, "keep-map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H).setDepth(0);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.centerOn(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.cameras.main.setZoom(1.45);
    this.cameras.main.setRoundPixels(true);

    // Full-screen Spectral Green Flash Vignette for Oracle Apparitions
    this.spectralVignette = this.add
      .rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x39ff14, 0)
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Register 4-Directional Animations for ALL Ravenlord Skins
    for (const skin of RAVENLORD_SKINS) {
      const texKey = `skin-${skin.id}`;
      this.anims.create({
        key: `${skin.id}-walk-down`,
        frames: this.anims.generateFrameNumbers(texKey, { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `${skin.id}-walk-left`,
        frames: this.anims.generateFrameNumbers(texKey, { start: 4, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `${skin.id}-walk-right`,
        frames: this.anims.generateFrameNumbers(texKey, { start: 8, end: 11 }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `${skin.id}-walk-up`,
        frames: this.anims.generateFrameNumbers(texKey, { start: 12, end: 15 }),
        frameRate: 8,
        repeat: -1,
      });
      this.anims.create({
        key: `${skin.id}-idle-down`,
        frames: [{ key: texKey, frame: 0 }],
        frameRate: 1,
      });
      this.anims.create({
        key: `${skin.id}-idle-left`,
        frames: [{ key: texKey, frame: 4 }],
        frameRate: 1,
      });
      this.anims.create({
        key: `${skin.id}-idle-right`,
        frames: [{ key: texKey, frame: 8 }],
        frameRate: 1,
      });
      this.anims.create({
        key: `${skin.id}-idle-up`,
        frames: [{ key: texKey, frame: 12 }],
        frameRate: 1,
      });
    }

    // Static NPC Sprites
    for (const npc of HALL_NPCS) {
      if (npc.actor) {
        const spr = this.add
          .sprite(npc.x, npc.y, `actor-${npc.id}`, 0)
          .setDisplaySize(OP_W, OP_H)
          .setDepth(5);
        this.add
          .ellipse(npc.x, npc.y + OP_H / 2 - 2, 28, 10, 0x000000, 0.45)
          .setDepth(4);

        this.anims.create({
          key: `npc-idle-${npc.id}`,
          frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: 0, end: 3 }),
          frameRate: 3,
          repeat: -1,
        });
        spr.play(`npc-idle-${npc.id}`);
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

    // Dynamic Point Lights
    for (const cfg of HALL_LIGHTS) {
      const light = this.add.pointlight(cfg.x, cfg.y, cfg.color, cfg.radius, cfg.intensity);
      light.setDepth(12);
      this.hallLights.push(light);
      this.lightBase.push(cfg.intensity);
      this.lightPhase.push(Math.random() * Math.PI * 2);
    }

    // Player Shadow & Sprite
    this.shadow = this.add.ellipse(PLAYER_SPAWN.x, PLAYER_SPAWN.y + 2, 28, 10, 0x000000, 0.42).setDepth(13);

    this.player = this.physics.add
      .sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, `skin-${this.activeSkinId}`, 0)
      .setDisplaySize(OP_W, OP_H)
      .setDepth(14);

    this.player.body.setCircle(10, 6, 20);
    this.player.setCollideWorldBounds(true);
    this.safePlayAnim(this.player, `${this.activeSkinId}-idle-down`);

    this.reticle = this.add
      .circle(0, 0, 6, 0x2de2e6, 0.4)
      .setStrokeStyle(1.5, 0x2de2e6, 0.9)
      .setVisible(false)
      .setDepth(15);

    this.loadVisits();

    // Time of day wash
    this.daylight = this.add
      .rectangle(0, 0, MAP_W, MAP_H, 0xffffff, 1)
      .setOrigin(0, 0)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.applyTimeOfDay();

    this.cameras.main.postFX.addVignette(0.5, 0.5, 0.75, 0.4);
    this.applyDecay(this.neglectByZone());

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(200, 130);
    this.cameras.main.setZoom(1.45);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
      this.input.keyboard.on("keydown-E", () => {
        if (this.tableauOpen) this.closeTableau();
        else this.interact();
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
      const distToPlayer = Math.hypot(w.x - this.player.x, w.y - this.player.y);
      if (hit && distToPlayer < 90) {
        if (hit.id === "oracle") {
          hallAudio.playOracleGaze();
        } else {
          hallAudio.playInteract();
        }
        this.eventsOut.onTalk(hit);
        return;
      }
      if (walkable(w.x, w.y)) {
        this.dest = { x: w.x, y: w.y };
        this.reticle.setPosition(w.x, w.y).setVisible(true);
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
  }

  public pulseTorch() {
    for (let i = 0; i < this.hallLights.length; i++) {
      this.hallLights[i].intensity = this.lightBase[i] * 1.8;
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
    this.safePlayAnim(this.player, `${this.activeSkinId}-idle-${this.lastFacing}`, true);
  }

  private safePlayAnim(target: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, key: string, ignoreIfPlaying = false) {
    if (this.anims.exists(key)) {
      target.play(key, ignoreIfPlaying);
    }
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
  private applyTimeOfDay() {
    const hour = new Date().getHours();
    let r = 255, g = 255, b = 255;
    if (hour >= 22 || hour < 5) {
      // Deep midnight navy tint
      r = 110; g = 130; b = 180;
    } else if (hour >= 5 && hour < 8) {
      // Arcane dawn violet-amber tint
      r = 220; g = 180; b = 190;
    } else if (hour >= 18 && hour < 22) {
      // Sunset twilight ember-cyan tint
      r = 200; g = 160; b = 180;
    }
    const color = (r << 16) | (g << 8) | b;
    this.daylight.setFillStyle(color, 1);
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
    this.truthState = state;
    const colors = {
      sourced: 0x39ff14, // Toxic Green
      thin: 0xffc857,    // Amber
      none: 0xff2a6d,    // Red Alert
    };
    const c = colors[state];
    this.oracleEye.setTint(c);
    this.oracleGlow.setFillStyle(c, 0.35);
    this.oracleHalo.setFillStyle(c, 0.18);
    this.oraclePupil.setFillStyle(c, 1.0);
    this.oracleProverbText.setColor(state === "sourced" ? "#39ff14" : state === "thin" ? "#ffc857" : "#ff2a6d");
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
    const npc = npcFacing(this.player.x, this.player.y, this.lastFacing);
    if (npc) {
      if (npc.id === "oracle") {
        hallAudio.playOracleGaze();
      } else {
        hallAudio.playInteract();
      }
      this.eventsOut.onTalk(npc);
      return;
    }
    if (tableFacing(this.player.x, this.player.y, this.lastFacing)) {
      hallAudio.playInteract();
      this.eventsOut.onTable();
    }
  }

  update(time: number, delta: number) {
    if (this.freezeMs > 0) {
      this.freezeMs -= delta;
      this.player?.setVelocity(0, 0);
      return;
    }

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
        if (a && this.oracleChains[i]) this.oracleChains[i].setTo(a.x, a.y, eyeX, eyeY);
      }
      this.oracleEye.setRotation(Math.sin(this.oracleDriftT * 1.7) * 0.05);

      for (let i = 0; i < this.hallLights.length; i++) {
        const cfg = HALL_LIGHTS[i];
        if (!cfg || cfg.flicker === 0) continue;
        this.lightPhase[i] += (delta / 1000) * ((Math.PI * 2) / cfg.period);
        const wobble = Math.sin(this.lightPhase[i]) * 0.6 + Math.sin(this.lightPhase[i] * 2.7) * 0.4;
        this.hallLights[i].intensity = this.lightBase[i] * (1 + wobble * cfg.flicker);
      }

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

    const speed = 175;
    let inputX = this.stickX;
    let inputY = this.stickY;

    if (this.cursors?.left?.isDown || this.wasd?.A?.isDown) inputX -= 1;
    if (this.cursors?.right?.isDown || this.wasd?.D?.isDown) inputX += 1;
    if (this.cursors?.up?.isDown || this.wasd?.W?.isDown) inputY -= 1;
    if (this.cursors?.down?.isDown || this.wasd?.S?.isDown) inputY += 1;

    let targetVel = { x: 0, y: 0 };

    if (inputX !== 0 || inputY !== 0) {
      this.dest = null;
      this.reticle.setVisible(false);
      targetVel = calculateVelocity(inputX, inputY, speed);
    } else if (this.dest) {
      const dx = this.dest.x - this.player.x;
      const dy = this.dest.y - this.player.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 64) {
        this.dest = null;
        this.reticle.setVisible(false);
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

    const isMoving = finalVx !== 0 || finalVy !== 0;

    if (isMoving !== this.wasMoving) {
      this.squash(isMoving ? 0.94 : 1.07, isMoving ? 1.07 : 0.93);
      this.wasMoving = isMoving;
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
    this.player.setDisplaySize(OP_W, OP_H);

    // Directional Facing & Animations
    if (isMoving) {
      this.lastFacing = determineFacing(finalVx, finalVy, this.lastFacing);
      this.safePlayAnim(this.player, `${this.activeSkinId}-walk-${this.lastFacing}`, true);
    } else {
      this.safePlayAnim(this.player, `${this.activeSkinId}-idle-${this.lastFacing}`, true);
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
      if (zone?.id === "quarantine") this.eventsOut.onEnterCell?.();
    }

    // Interaction Prompts using Facing Direction
    const npc = npcFacing(this.player.x, this.player.y, this.lastFacing);
    const atTable = tableFacing(this.player.x, this.player.y, this.lastFacing);
    const pkey = `${npc?.id ?? ""}:${atTable}`;
    if (pkey !== this.lastPrompt) {
      this.lastPrompt = pkey;
      this.eventsOut.onPrompt(npc, atTable);
    }
  }
}
