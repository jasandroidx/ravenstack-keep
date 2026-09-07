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

/** Map walker = Ravenlord sprite. Cell 38×62. */
const OP_W = 38;
const OP_H = 62;
const NPC_W = 32;
const NPC_H = 40;

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
  private oracleParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private oracleProverbText!: Phaser.GameObjects.Text;
  private spectralVignette!: Phaser.GameObjects.Rectangle;
  private oracleSpawnTimer = 0;
  private isManifesting = false;

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
      this.load.spritesheet(`skin-${skin.id}`, skin.src, { frameWidth: OP_W, frameHeight: OP_H });
    }

    for (const npc of HALL_NPCS) {
      if (npc.id === "oracle") continue;
      if (npc.actor) {
        this.load.spritesheet(`actor-${npc.id}`, npc.actor, {
          frameWidth: NPC_W,
          frameHeight: npc.actorH ?? NPC_H,
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

      this.anims.create({ key: `${skin.id}-idle-down`, frames: [{ key: texKey, frame: 0 }], frameRate: 1 });
      this.anims.create({ key: `${skin.id}-idle-left`, frames: [{ key: texKey, frame: 4 }], frameRate: 1 });
      this.anims.create({ key: `${skin.id}-idle-right`, frames: [{ key: texKey, frame: 8 }], frameRate: 1 });
      this.anims.create({ key: `${skin.id}-idle-up`, frames: [{ key: texKey, frame: 12 }], frameRate: 1 });
    }

    // Spawn Non-Oracle NPCs
    for (const npc of HALL_NPCS) {
      if (npc.id === "oracle") continue;
      const chip =
        npc.state === "working" ? PALETTE.magenta : npc.state === "waiting_human" ? PALETTE.amber : PALETTE.cyan;
      const labelLift = npc.actor ? 48 : 38;

      // Pedestal glow
      this.add.ellipse(npc.x, npc.y, 32, 12, chip, 0.28).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);

      if (npc.actor) {
        const spr = this.add.sprite(npc.x, npc.y, `actor-${npc.id}`, 0).setOrigin(0.5, 1).setDepth(7);
        spr.setDisplaySize(NPC_W, npc.actorH ?? NPC_H);
        try {
          if (this.textures.get(`actor-${npc.id}`).frameTotal > 1) {
            this.anims.create({
              key: `idle-${npc.id}`,
              frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: 0, end: Math.min(3, this.textures.get(`actor-${npc.id}`).frameTotal - 1) }),
              frameRate: 4,
              repeat: -1,
            });
            spr.play(`idle-${npc.id}`);
          }
        } catch {
          // Keep static frame
        }
      }

      // Indicator Rune Pip
      this.add.circle(npc.x, npc.y - labelLift + 4, 4, chip, 0.95).setDepth(8);
      this.add
        .text(npc.x, npc.y - labelLift, npc.name, {
          fontFamily: "monospace",
          fontSize: "11px",
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

    // Ethereal Green Flames & Smoke Emitter
    this.oracleParticles = this.add.particles(0, 0, undefined, {
      x: oracle.x,
      y: oracle.y - 12,
      quantity: 2,
      frequency: 90,
      lifespan: { min: 800, max: 1800 },
      speedX: { min: -12, max: 12 },
      speedY: { min: -25, max: -65 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0x39ff14, 0x00ff66, 0x2de2e6],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.oracleParticles.setDepth(6);

    // Glowing Emerald Halos
    this.oracleHalo = this.add.circle(oracle.x, oracle.y - 14, 65, 0x39ff14, 0.22).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.oracleGlow = this.add.circle(oracle.x, oracle.y - 14, 34, 0x00ff66, 0.38).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);

    // The Floating Green Eye Sprite
    this.oracleEye = this.add.image(oracle.x, oracle.y - 14, "oracle-eye").setOrigin(0.5, 0.5).setDepth(9);
    this.oracleEye.setDisplaySize(54, 54);

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
      .text(oracle.x, oracle.y - 56, "TRUTH OVER COMFORT", {
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#39ff14",
        stroke: "#0b0e14",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(11);

    // Bobbing Sine Tween on the Eyeball
    this.tweens.add({
      targets: [this.oracleEye, this.oracleGlow],
      y: oracle.y - 24,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

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
    this.shadow = this.add.ellipse(PLAYER_SPAWN.x, PLAYER_SPAWN.y + 2, 24, 9, 0x000000, 0.55).setDepth(6);
    this.reticle = this.add.circle(0, 0, 8, PALETTE.cyan, 0.0).setStrokeStyle(2, PALETTE.cyan, 0.9).setDepth(5).setVisible(false);

    this.player = this.physics.add.sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, `skin-${this.activeSkinId}`, 0);
    this.player.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.player.setOrigin(0.5, 1).setCollideWorldBounds(true).setDepth(7);
    this.player.setDisplaySize(OP_W, OP_H);
    this.player.body.setAllowGravity(false);
    this.player.body.setSize(22, 18);
    this.player.body.setOffset(8, 44);
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
      const mark = this.add.rectangle(w.x, w.y, 8, 8, 0xff3b3b, 0.85).setDepth(20);
      this.tweens.add({ targets: mark, alpha: 0, duration: 280, onComplete: () => mark.destroy() });
    });
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

    this.player.setTexture(`skin-${skin.id}`);
    this.player.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.player.anims.play(`${this.activeSkinId}-idle-${this.lastFacing}`, true);

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
    // Oracle Chains & Eye Tracking
    if (this.oracleEye && this.player) {
      const eyeX = this.oracleEye.x;
      const eyeY = this.oracleEye.y;

      // Update particle emitter position to follow bobbing eye
      this.oracleParticles.setPosition(eyeX, eyeY);
      this.oracleHalo.setPosition(eyeX, eyeY);

      // Chains dynamic anchoring to current bobbing eye position
      const chainAnchors = [
        { x: 380 - 140, y: 310 - 160 },
        { x: 380 + 140, y: 310 - 160 },
        { x: 380 - 130, y: 310 + 110 },
        { x: 380 + 130, y: 310 + 110 },
      ];
      for (let i = 0; i < this.oracleChains.length; i++) {
        const a = chainAnchors[i];
        if (a && this.oracleChains[i]) {
          this.oracleChains[i].setTo(a.x, a.y, eyeX, eyeY);
        }
      }

      // Ocular pupil gaze tracking toward player
      const angle = Math.atan2(this.player.y - eyeY, this.player.x - eyeX);
      const subtleTilt = Math.sin(angle) * 0.08;
      this.oracleEye.setRotation(subtleTilt);

      // Random Haunting / Spectral Manifestation Timer (every ~45s)
      this.oracleSpawnTimer += delta;
      if (this.oracleSpawnTimer > 48000) {
        this.oracleSpawnTimer = 0;
        this.triggerOracleManifestation();
      }

      // Proximity Trigger: When entering Library Sanctum near Oracle for the first time
      const distToOracle = Math.hypot(this.player.x - eyeX, this.player.y - eyeY);
      if (distToOracle < 110 && !this.isManifesting && this.oracleSpawnTimer > 15000) {
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

    // Orientation Rotation based on Movement Direction & Velocity Vector
    // Banks naturally into turns (left/right leaning) and adds dynamic stride inertia
    let targetLean = 0;
    if (isMoving) {
      // Dynamic tilt based on horizontal velocity and slight vertical sway
      const horizRatio = finalVx / speed;
      const vertRatio = finalVy / speed;
      targetLean = horizRatio * 0.12 + Math.sin(time * 0.016) * 0.035 * (Math.abs(horizRatio) > 0.1 ? 1 : 0.4);

      // Subtle stride height bobbing on body
      const strideBob = Math.sin(time * 0.018) * 1.2;
      this.player.setDisplaySize(OP_W, OP_H + (vertRatio > 0 ? strideBob : -strideBob * 0.5));
    } else {
      this.player.setDisplaySize(OP_W, OP_H);
    }

    // Smoothly interpolate rotation angle
    this.currentLean = Phaser.Math.Linear(this.currentLean, targetLean, 0.22);
    this.player.setRotation(this.currentLean);

    // Directional Facing & Smooth Animations
    if (Math.abs(finalVx) > Math.abs(finalVy) && finalVx !== 0) {
      if (finalVx < 0) {
        this.lastFacing = "left";
        this.player.anims.play(`${this.activeSkinId}-walk-left`, true);
      } else {
        this.lastFacing = "right";
        this.player.anims.play(`${this.activeSkinId}-walk-right`, true);
      }
    } else if (finalVy !== 0) {
      if (finalVy < 0) {
        this.lastFacing = "up";
        this.player.anims.play(`${this.activeSkinId}-walk-up`, true);
      } else {
        this.lastFacing = "down";
        this.player.anims.play(`${this.activeSkinId}-walk-down`, true);
      }
    } else {
      // Idle pose facing the last walked direction
      this.player.anims.play(`${this.activeSkinId}-idle-${this.lastFacing}`, true);
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

