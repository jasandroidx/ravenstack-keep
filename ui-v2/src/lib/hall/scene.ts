import * as Phaser from "phaser";
import {
  HALL_NPCS,
  MAP_H,
  MAP_SRC,
  MAP_W,
  PALETTE,
  PLAYER_SPAWN,
  RAVENLORD_SKINS,
  npcAtPoint,
  npcNear,
  tableNear,
  walkable,
  zoneAt,
  type HallNpc,
} from "./world";
import { hallAudio } from "./audio";

export type HallEvents = {
  onZone: (name: string, lock: string) => void;
  onPrompt: (npc: HallNpc | null, atTable: boolean) => void;
  onTalk: (npc: HallNpc) => void;
  onTable: () => void;
  onSkinChange?: (skinId: string) => void;
};

/** Slicing dimensions in PNG source (128x160 -> 4x4 grid of 32x40) */
const FRAME_W = 32;
const FRAME_H = 40;

/** World display scale matched to 48px tile grid and environment */
const OP_W = 54;
const OP_H = 68;
const NPC_W = 54;
const NPC_H = 68;

type Facing = "down" | "up" | "left" | "right";

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
  private currentLean = 0;
  paused = false;

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
      this.load.spritesheet(`skin-${skin.id}`, skin.src, { frameWidth: FRAME_W, frameHeight: FRAME_H });
    }

    for (const npc of HALL_NPCS) {
      if (npc.id === "oracle") continue;
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

    // Full-screen Spectral Green Flash Vignette for Oracle Apparitions
    this.spectralVignette = this.add
      .rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0x39ff14, 0)
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Register 4-Directional Animations for ALL Ravenlord Skins
    for (const skin of RAVENLORD_SKINS) {
      const texKey = `skin-${skin.id}`;
      const hasTex = this.textures.exists(texKey);
      const totalFrames = hasTex ? this.textures.get(texKey).frameTotal : 0;

      if (totalFrames >= 4) {
        this.anims.create({
          key: `${skin.id}-walk-down`,
          frames: this.anims.generateFrameNumbers(texKey, { start: 0, end: Math.min(3, totalFrames - 1) }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (totalFrames >= 8) {
        this.anims.create({
          key: `${skin.id}-walk-left`,
          frames: this.anims.generateFrameNumbers(texKey, { start: 4, end: Math.min(7, totalFrames - 1) }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (totalFrames >= 12) {
        this.anims.create({
          key: `${skin.id}-walk-right`,
          frames: this.anims.generateFrameNumbers(texKey, { start: 8, end: Math.min(11, totalFrames - 1) }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (totalFrames >= 16) {
        this.anims.create({
          key: `${skin.id}-walk-up`,
          frames: this.anims.generateFrameNumbers(texKey, { start: 12, end: Math.min(15, totalFrames - 1) }),
          frameRate: 8,
          repeat: -1,
        });
      }

      if (totalFrames >= 1) {
        this.anims.create({ key: `${skin.id}-idle-down`, frames: [{ key: texKey, frame: 0 }], frameRate: 1 });
        this.anims.create({ key: `${skin.id}-idle-left`, frames: [{ key: texKey, frame: totalFrames > 4 ? 4 : 0 }], frameRate: 1 });
        this.anims.create({ key: `${skin.id}-idle-right`, frames: [{ key: texKey, frame: totalFrames > 8 ? 8 : 0 }], frameRate: 1 });
        this.anims.create({ key: `${skin.id}-idle-up`, frames: [{ key: texKey, frame: totalFrames > 12 ? 12 : 0 }], frameRate: 1 });
      }
    }

    // Spawn Non-Oracle NPCs
    for (const npc of HALL_NPCS) {
      if (npc.id === "oracle") continue;
      const chip =
        npc.state === "working" ? PALETTE.magenta : npc.state === "waiting_human" ? PALETTE.amber : PALETTE.cyan;
      const labelLift = 74;

      // Soft ground contact shadow under NPC feet
      this.add.ellipse(npc.x, npc.y + 2, 34, 12, 0x000000, 0.45).setDepth(5);

      if (npc.actor && this.textures.exists(`actor-${npc.id}`)) {
        const spr = this.add.sprite(npc.x, npc.y, `actor-${npc.id}`, 0).setOrigin(0.5, 1).setDepth(7);
        spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        spr.setDisplaySize(NPC_W, npc.actorH ?? NPC_H);
        try {
          const frames = this.textures.get(`actor-${npc.id}`).frameTotal;
          if (frames > 1) {
            this.anims.create({
              key: `idle-${npc.id}`,
              frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: 0, end: Math.min(3, frames - 1) }),
              frameRate: 4,
              repeat: -1,
            });
            this.safePlayAnim(spr, `idle-${npc.id}`);
          }
        } catch {
          // Keep static frame
        }
      }

      // Indicator Rune Pip
      this.add.circle(npc.x, npc.y - labelLift + 4, 3.5, chip, 0.95).setDepth(8);
      this.add
        .text(npc.x, npc.y - labelLift, npc.name, {
          fontFamily: "monospace",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#e8ecf1",
          stroke: "#0b0e14",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(8);
    }

    // ==========================================
    // THE ORACLE: Chained Celestial Floating Green Eye
    // ==========================================
    const oracle = HALL_NPCS.find((n) => n.id === "oracle") ?? { x: 380, y: 310, name: "The Oracle" };

    // Glowing Emerald Halos & Aura
    this.oracleHalo = this.add.circle(oracle.x, oracle.y - 14, 75, 0x39ff14, 0.22).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.oracleGlow = this.add.circle(oracle.x, oracle.y - 14, 40, 0x00ff66, 0.38).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);

    // Ethereal Green Flames & Smoke Aura
    this.tweens.add({
      targets: this.oracleGlow,
      scale: 1.25,
      alpha: 0.55,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // The Floating Green Eye Sprite
    this.oracleEye = this.add.image(oracle.x, oracle.y - 14, "oracle-eye").setOrigin(0.5, 0.5).setDepth(9);
    this.oracleEye.setDisplaySize(68, 68);

    // Dark Iron Arcane Chains Anchoring the Eye
    const chainAnchors = [
      { x: oracle.x - 140, y: oracle.y - 160 },
      { x: oracle.x + 140, y: oracle.y - 160 },
      { x: oracle.x - 130, y: oracle.y + 110 },
      { x: oracle.x + 130, y: oracle.y + 110 },
    ];
    for (const a of chainAnchors) {
      const chain = this.add.line(0, 0, a.x, a.y, oracle.x, oracle.y - 14, 0x1e222b).setLineWidth(2).setDepth(5);
      this.oracleChains.push(chain);
    }

    // Ghostly Truth Proverb Rune Banner
    this.oracleProverbText = this.add
      .text(oracle.x, oracle.y - 68, "TRUTH OVER COMFORT", {
        fontFamily: "monospace",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#39ff14",
        stroke: "#0b0e14",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(11);

    // Motion (bob, drift, look-at, lid) is driven in update() so the eye can
    // react to the player and to truth state instead of looping blindly.
    this.oracleAnchor = { x: oracle.x, y: oracle.y - 19 };

    // Proverb Text Pulse
    this.tweens.add({
      targets: this.oracleProverbText,
      alpha: 0.45,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Spawn Player (Ravenlord Jason Boyd)
    this.shadow = this.add.ellipse(PLAYER_SPAWN.x, PLAYER_SPAWN.y + 2, 34, 12, 0x000000, 0.45).setDepth(6);
    this.reticle = this.add.circle(0, 0, 3, PALETTE.cyan, 0.7).setDepth(5).setVisible(false);

    this.player = this.physics.add.sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, `skin-${this.activeSkinId}`, 0);
    this.player.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.player.setOrigin(0.5, 1).setCollideWorldBounds(true).setDepth(7);
    this.player.setDisplaySize(OP_W, OP_H);
    this.player.body.setAllowGravity(false);
    this.player.body.setSize(20, 14);
    this.player.body.setOffset(6, 26);
    this.player.setPosition(PLAYER_SPAWN.x, PLAYER_SPAWN.y);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.45);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
      this.input.keyboard.on("keydown-E", () => this.interact());
      this.input.keyboard.on("keydown-SPACE", () => this.interact());
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
      if (hit) {
        this.dest = { x: hit.x, y: hit.y + 18 };
        this.reticle.setPosition(hit.x, hit.y + 18).setVisible(true);
        hallAudio.playStep();
        return;
      }
      if (tableNear(w.x, w.y) && distToPlayer < 80) {
        hallAudio.playInteract();
        this.eventsOut.onTable();
        return;
      }
      if (walkable(w.x, w.y)) {
        this.dest = { x: w.x, y: w.y };
        this.reticle.setPosition(w.x, w.y).setVisible(true);
        hallAudio.playStep();
        return;
      }
    });
  }

  private safePlayAnim(sprite: Phaser.GameObjects.Sprite | null, key: string, ignoreIfPlaying = true) {
    if (!sprite || !sprite.anims) return;
    try {
      if (this.anims.exists(key)) {
        const anim = this.anims.get(key);
        if (anim && anim.frames && anim.frames.length > 0) {
          sprite.anims.play(key, ignoreIfPlaying);
        }
      }
    } catch {
      // Ignore animation frame playback error
    }
  }

  /**
   * Applies a Ravenlord Armor Skin swap in real-time
   */
  public setSkin(skinId: string) {
    const skin = RAVENLORD_SKINS.find((s) => s.id === skinId);
    if (!skin || !this.player) return;
    this.activeSkinId = skin.id;
    try {
      localStorage.setItem("ravenlord_skin", skin.id);
    } catch {
      // Ignore
    }

    if (this.textures.exists(`skin-${skin.id}`)) {
      this.player.setTexture(`skin-${skin.id}`);
      this.player.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.safePlayAnim(this.player, `${this.activeSkinId}-idle-${this.lastFacing}`, true);
    }

    // Audio & Visual Armor Forge Burst FX
    hallAudio.playInteract();
    const hexColor = parseInt(skin.accent.replace("#", "0x"), 16);
    const flare = this.add
      .circle(this.player.x, this.player.y - 30, 36, hexColor, 0.65)
      .setDepth(15)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: flare,
      scale: 2.4,
      alpha: 0,
      duration: 380,
      ease: "Cubic.easeOut",
      onComplete: () => flare.destroy(),
    });

    this.eventsOut.onSkinChange?.(skin.id);
  }

  public getSkin(): string {
    return this.activeSkinId;
  }

  /**
   * Triggers a terrifying spectral manifestation of The Oracle
   */
  // ==========================================
  // THE ORACLE — public state, driven by what retrieval actually found
  // ==========================================

  /** Palette per truth state. Green vouches; amber hesitates; red refuses. */
  private static ORACLE_COLOURS = {
    sourced: { halo: 0x39ff14, glow: 0x00ff66, text: "#39ff14" },
    thin: { halo: 0xffc857, glow: 0xffb020, text: "#ffc857" },
    none: { halo: 0xff2a6d, glow: 0xff2a6d, text: "#ff2a6d" },
  } as const;

  /**
   * Colour the eye by how well the last answer was supported.
   *
   * "sourced" — retrieval returned evidence the answer stands on.
   * "thin"    — it returned something, but little.
   * "none"    — it returned nothing. The Inquisitor visibly declines to vouch.
   */
  public setTruthState(state: "sourced" | "thin" | "none") {
    this.truthState = state;
    const c = HallScene.ORACLE_COLOURS[state];
    this.oracleHalo?.setFillStyle(c.halo, 0.22);
    this.oracleGlow?.setFillStyle(c.glow, 0.38);
    this.oracleProverbText?.setColor(c.text);
  }

  /**
   * Refusal. The eye closes and stays shut rather than producing prose — a
   * stronger "I cannot answer that" than any sentence it could generate.
   */
  public blinkRefusal(label = "NOT IN KNOWLEDGE") {
    this.setTruthState("none");
    this.oracleProverbText?.setText(label).setAlpha(1);
    this.lidTarget = 1;
    this.blinkTimer = 4000;
    this.time.delayedCall(1600, () => {
      this.lidTarget = 0;
    });
  }

  /**
   * A claim just landed in the quarantine cell. The eye flares wherever the
   * operator is standing — the Inquisitor catching a lie in real time.
   */
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

  public triggerOracleManifestation(customProverb?: string) {
    if (this.isManifesting) return;
    this.isManifesting = true;

    // Scary Sound Synthesizer: Sub-bass truth rumble, rattling chains, eerie dissonant drone, whisper sweep
    hallAudio.playOracleManifest();

    // Camera Shake & Green Flash Vignette
    this.cameras.main.shake(400, 0.0035);
    this.spectralVignette.setAlpha(0.32);
    this.tweens.add({
      targets: this.spectralVignette,
      alpha: 0,
      duration: 1800,
      ease: "Quad.easeOut",
    });

    // Intensify Oracle's Glowing Ectoplasm
    this.oracleHalo.setScale(1.8);
    this.oracleGlow.setScale(1.6);
    this.tweens.add({
      targets: [this.oracleHalo, this.oracleGlow],
      scale: 1.0,
      duration: 2200,
      ease: "Cubic.easeOut",
    });

    // Update Floating Truth Proverb
    const proverb =
      customProverb || TRUTH_PROVERBS[Math.floor(Math.random() * TRUTH_PROVERBS.length)];
    this.oracleProverbText.setText(proverb);
    this.oracleProverbText.setScale(1.35).setAlpha(1);
    this.tweens.add({
      targets: this.oracleProverbText,
      scale: 1.0,
      duration: 800,
      ease: "Back.easeOut",
    });

    // Chain Rattle Motion
    for (const chain of this.oracleChains) {
      this.tweens.add({
        targets: chain,
        alpha: 0.9,
        yoyo: true,
        duration: 300,
        repeat: 3,
      });
    }

    this.time.delayedCall(12000, () => {
      this.isManifesting = false;
    });
  }

  interact() {
    if (this.paused || !this.player) return;
    const npc = npcNear(this.player.x, this.player.y);
    if (npc) {
      if (npc.id === "oracle") {
        hallAudio.playOracleGaze();
      } else {
        hallAudio.playInteract();
      }
      this.eventsOut.onTalk(npc);
      return;
    }
    if (tableNear(this.player.x, this.player.y)) {
      hallAudio.playInteract();
      this.eventsOut.onTable();
    }
  }

  update(time: number, delta: number) {
    // ==========================================
    // THE ORACLE — a watcher, not a decoration
    // ==========================================
    if (this.oracleEye && this.player) {
      // Slow lissajous drift around its anchor. A sprite pinned to a fixed
      // coordinate reads as scenery; one that wanders reads as awake.
      this.oracleDriftT += delta * 0.00035;
      const driftX = Math.sin(this.oracleDriftT * 0.9) * 26;
      const driftY = Math.cos(this.oracleDriftT * 1.3) * 14 + Math.sin(this.oracleDriftT * 2.7) * 4;

      // Look-at: lean toward the operator, harder the closer they get.
      const dx = this.player.x - (this.oracleAnchor.x + driftX);
      const dy = this.player.y - (this.oracleAnchor.y + driftY);
      const dist = Math.hypot(dx, dy) || 1;
      const attention = Phaser.Math.Clamp(1 - (dist - 90) / 320, 0, 1);
      const leanX = (dx / dist) * 11 * attention;
      const leanY = (dy / dist) * 8 * attention;

      const eyeX = this.oracleAnchor.x + driftX + leanX;
      const eyeY = this.oracleAnchor.y + driftY + leanY;
      this.oracleEye.setPosition(eyeX, eyeY);

      // Blink. Idle blinks are quick; a refusal holds the lid shut.
      this.blinkTimer -= delta;
      if (this.blinkTimer <= 0 && this.lidTarget === 0) {
        this.lidTarget = 1;
        this.time.delayedCall(90, () => {
          this.lidTarget = 0;
        });
        this.blinkTimer = 2600 + Math.random() * 4200;
      }
      this.lidClosed += (this.lidTarget - this.lidClosed) * Math.min(1, delta * 0.022);
      this.oracleEye.setDisplaySize(68, Math.max(2, 68 * (1 - this.lidClosed * 0.97)));

      // Pupil dilation: the iris tightens and brightens as you close on it.
      const dilate = 1 + attention * 0.45;
      this.oracleGlow?.setPosition(eyeX, eyeY);
      this.oracleHalo?.setPosition(eyeX, eyeY);
      this.oracleGlow?.setScale(dilate * (1 - this.lidClosed * 0.8));
      this.oracleProverbText?.setPosition(eyeX, eyeY - 54);

      // Chains stay anchored to the room and follow wherever the eye drifts.
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
    let vx = this.stickX;
    let vy = this.stickY;
    if (this.cursors?.left?.isDown || this.wasd?.A?.isDown) vx -= 1;
    if (this.cursors?.right?.isDown || this.wasd?.D?.isDown) vx += 1;
    if (this.cursors?.up?.isDown || this.wasd?.W?.isDown) vy -= 1;
    if (this.cursors?.down?.isDown || this.wasd?.S?.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      this.dest = null;
      this.reticle.setVisible(false);
      const n = Math.hypot(vx, vy) || 1;
      vx = (vx / n) * speed;
      vy = (vy / n) * speed;
    } else if (this.dest) {
      const dx = this.dest.x - this.player.x;
      const dy = this.dest.y - this.player.y;
      if (Math.hypot(dx, dy) < 8) {
        this.dest = null;
        this.reticle.setVisible(false);
        vx = 0;
        vy = 0;
      } else {
        const n = Math.hypot(dx, dy);
        vx = (dx / n) * speed;
        vy = (dy / n) * speed;
      }
    }

    // Wall Sliding Physics with Bounding Capsule Checks
    const feetY = this.player.y;
    const feetX = this.player.x;
    const probeMargin = 12;

    // Check X movement with upper & lower foot bounds
    const canMoveX =
      vx === 0 ||
      (walkable(feetX + (vx > 0 ? probeMargin : -probeMargin) + (vx * delta) / 1000, feetY - 4) &&
       walkable(feetX + (vx > 0 ? probeMargin : -probeMargin) + (vx * delta) / 1000, feetY + 4));

    // Check Y movement with left & right foot bounds
    const canMoveY =
      vy === 0 ||
      (walkable(feetX - 6, feetY + (vy > 0 ? probeMargin : -probeMargin) + (vy * delta) / 1000) &&
       walkable(feetX + 6, feetY + (vy > 0 ? probeMargin : -probeMargin) + (vy * delta) / 1000));

    const finalVx = canMoveX ? vx : 0;
    const finalVy = canMoveY ? vy : 0;

    this.player.setVelocity(finalVx, finalVy);

    // Audio Step Synthesizer Synced with Movement
    const isMoving = Math.hypot(finalVx, finalVy) > 10;
    if (isMoving) {
      this.stepTimer += delta;
      if (this.stepTimer > 310) {
        hallAudio.playStep(true);
        this.stepTimer = 0;
      }
    } else {
      this.stepTimer = 260; // Ready for immediate step sound on start
    }

    // Keep sprite crisp without rotation distortion or stretching
    this.player.setRotation(0);
    this.player.setDisplaySize(OP_W, OP_H);

    // Directional Facing & Smooth Animations
    if (Math.abs(finalVx) >= Math.abs(finalVy) && finalVx !== 0) {
      if (finalVx < 0) {
        this.lastFacing = "left";
        this.safePlayAnim(this.player, `${this.activeSkinId}-walk-left`, true);
      } else {
        this.lastFacing = "right";
        this.safePlayAnim(this.player, `${this.activeSkinId}-walk-right`, true);
      }
    } else if (finalVy !== 0) {
      if (finalVy < 0) {
        this.lastFacing = "up";
        this.safePlayAnim(this.player, `${this.activeSkinId}-walk-up`, true);
      } else {
        this.lastFacing = "down";
        this.safePlayAnim(this.player, `${this.activeSkinId}-walk-down`, true);
      }
    } else {
      // Idle pose facing the last walked direction
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
    }

    // NPC Interaction Prompt
    const npc = npcNear(this.player.x, this.player.y);
    const atTable = tableNear(this.player.x, this.player.y);
    const pkey = `${npc?.id ?? ""}:${atTable}`;
    if (pkey !== this.lastPrompt) {
      this.lastPrompt = pkey;
      this.eventsOut.onPrompt(npc, atTable);
    }
  }
}

