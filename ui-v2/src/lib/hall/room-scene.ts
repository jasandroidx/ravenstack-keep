import * as Phaser from "phaser";
import { RAVENLORD_SKINS } from "./world";
import { calculateVelocity, determineFacing, type Facing } from "./locomotion";
import { portalAt, type PortalTrigger } from "./portal";

const FRAME_W = 32;
const FRAME_H = 40;
const OP_W = 54;
const OP_H = 68;

/** A finished art sprite drawn on a furniture marker or hero item.
 *  src is a public asset URL (Set A only unless a Set B pack lands);
 *  sheet makes it an animated strip (frame size + frame list + rate). */
export type RoomSprite = {
  src: string;
  w: number;
  h: number;
  sheet?: { fw: number; fh: number; frames: number[]; rate: number };
};

export type RoomFurniture = {
  id: string;
  label: string;
  info: string;
  x: number;
  y: number;
  radius: number;
  sprite?: RoomSprite;
};

export type RoomLauncher = {
  /** Page name shown in the prompt, e.g. "RAVEN RECON". */
  label: string;
  /** Tailnet URL opened in a new tab on E / click. */
  url: string;
  /** Animation style: radar sweep, desk unfurl, terminal flicker, rune ring, beacon sweep. */
  kind: "radar" | "desk" | "terminal" | "circle" | "beacon";
  x: number;
  y: number;
  /** Optional art sprite drawn under the code-drawn hero animation. */
  sprite?: RoomSprite;
};

export type RoomOpts = {
  key: string;
  /** ONE animated hero item per room. Walks up, prompt, E/click opens url in a new tab.
   *  Never a physics body, never a collider — it cannot block walking. */
  launcher?: RoomLauncher;
  mapSrc: string;
  mapW: number;
  mapH: number;
  spawn: { x: number; y: number };
  portals: PortalTrigger[];
  furniture: RoomFurniture[];
  /** Ambient animated wall torches (Set A torch sheet, frames 6-11). */
  torches?: { x: number; y: number }[];
  /** Ambient animated braziers (Set A campfire sheet, all 40 frames). */
  braziers?: { x: number; y: number }[];
  walk: { x: number; y: number; w: number; h: number }[];
  /** Solid circles, e.g. a central pedestal. */
  solidCircles?: { x: number; y: number; r: number }[];
  onSceneReady?: (scene: RoomScene) => void;
};

/**
 * Lean walkable room scene, reused for every Raven room.
 * No NPCs, no Oracle eye, no war-table logic — just a painted map,
 * a player, furniture markers, and portal doors. Furniture info is
 * shown in-canvas on E / click-near, and is labelled FIXTURE when
 * it has no live backing fetch — never faked as live.
 */
export class RoomScene extends Phaser.Scene {
  private opts: RoomOpts;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private dest: { x: number; y: number } | null = null;
  private stickX = 0;
  private stickY = 0;
  private lastFacing: Facing = "down";
  private activeSkinId = "ravenlord";
  private isTransitioning = false;
  private portalExitRequired = false;
  private portalGraceUntil = 0;
  private infoText: Phaser.GameObjects.Text | null = null;
  private infoBg: Phaser.GameObjects.Rectangle | null = null;
  private launcherPrompt: Phaser.GameObjects.Text | null = null;
  public paused = false;
  public ready = false;

  constructor(opts: RoomOpts) {
    super({ key: opts.key });
    this.opts = opts;
    // Honor the saved outfit across reloads, like HallScene does — rooms
    // otherwise always reset to ravenlord no matter what was equipped.
    try {
      const saved = localStorage.getItem("ravenlord_skin");
      if (saved && RAVENLORD_SKINS.some((sk) => sk.id === saved)) this.activeSkinId = saved;
    } catch { /* ignore */ }
  }

  setDir(x: number, y: number) {
    this.stickX = x;
    this.stickY = y;
    if (x || y) this.dest = null;
    try { (window as unknown as Record<string, unknown>).__keepLastDir = { x, y, t: Date.now() }; } catch { /* no window */ }
  }

  setKeyboardEnabled(on: boolean) {
    if (!this.input?.keyboard) return;
    this.input.keyboard.enabled = on;
    if (on) this.input.keyboard.enableGlobalCapture();
    else this.input.keyboard.disableGlobalCapture();
  }

  centerCameraOnPlayer() {
    if (this.player && this.cameras.main) this.cameras.main.centerOn(this.player.x, this.player.y);
  }

  // No-op HallScene API surface, so React's Hall-only calls never crash in a room.
  pulseTorch() {}
  setTruthState(_s: string) {}
  flareQuarantine(_c?: string) {}
  pressSeal(_n: number) {}
  restoreSeals(_n: number) {}
  openTableau(_a: string, _b: string | null, _c: string, _d: string) {}
  closeTableau() {}

  setSkin(skinId: string) {
    if (!RAVENLORD_SKINS.some((s) => s.id === skinId)) return;
    this.activeSkinId = skinId;
    try { localStorage.setItem("ravenlord_skin", skinId); } catch { /* ignore */ }
  }

  private walkable(x: number, y: number): boolean {
    if (x < 40 || y < 40 || x > this.opts.mapW - 40 || y > this.opts.mapH - 40) return false;
    const inWalk = this.opts.walk.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (!inWalk) return false;
    if (this.opts.solidCircles?.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r)) return false;
    return true;
  }

  preload() {
    this.load.image("room-map", this.opts.mapSrc);
    for (const skin of RAVENLORD_SKINS) {
      this.load.spritesheet(`skin-${skin.id}`, skin.src, { frameWidth: FRAME_W, frameHeight: FRAME_H });
    }
    const spriteSrcs: { key: string; sprite: RoomSprite }[] = [];
    this.opts.furniture.forEach((f, i) => { if (f.sprite) spriteSrcs.push({ key: `spr-${this.opts.key}-f${i}`, sprite: f.sprite }); });
    if (this.opts.launcher?.sprite) spriteSrcs.push({ key: `spr-${this.opts.key}-hero`, sprite: this.opts.launcher.sprite });
    for (const s of spriteSrcs) {
      if (s.sprite.sheet) this.load.spritesheet(s.key, s.sprite.src, { frameWidth: s.sprite.sheet.fw, frameHeight: s.sprite.sheet.fh });
      else this.load.image(s.key, s.sprite.src);
    }
    if (this.opts.torches?.length) this.load.spritesheet("fx-torch", "/assets/fx/torch.png", { frameWidth: 32, frameHeight: 32 });
    if (this.opts.braziers?.length) this.load.spritesheet("fx-campfire", "/assets/fx/campfire.png", { frameWidth: 32, frameHeight: 32 });
  }

  /** Draw a furniture/hero sprite; animated sheets loop (guarded anim create). */
  private addRoomSprite(key: string, sprite: RoomSprite, x: number, y: number, depth: number) {
    if (sprite.sheet) {
      const animKey = `anim-${key}`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({ key: animKey, frames: this.anims.generateFrameNumbers(key, { frames: sprite.sheet.frames }), frameRate: sprite.sheet.rate, repeat: -1 });
      }
      const spr = this.add.sprite(x, y, key).setDisplaySize(sprite.w, sprite.h).setDepth(depth);
      spr.play(animKey);
      return spr;
    }
    return this.add.image(x, y, key).setDisplaySize(sprite.w, sprite.h).setDepth(depth);
  }

  create(data?: { spawn?: { x: number; y: number } }) {
    const spawn = data?.spawn ?? this.opts.spawn;
    this.isTransitioning = false;
    this.portalExitRequired = this.opts.portals.some(
      (p) => spawn.x >= p.x && spawn.x <= p.x + p.w && spawn.y >= p.y && spawn.y <= p.y + p.h,
    );
    this.cameras.main.setBackgroundColor(0x0b0e14);
    this.add.image(0, 0, "room-map").setOrigin(0, 0).setDisplaySize(this.opts.mapW, this.opts.mapH).setDepth(0);
    this.physics.world.setBounds(0, 0, this.opts.mapW, this.opts.mapH);
    this.cameras.main.setBounds(0, 0, this.opts.mapW, this.opts.mapH);
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.cameras.main.setZoom(1.0);
    this.cameras.main.setRoundPixels(true);

    for (const p of this.opts.portals) {
      this.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h).setStrokeStyle(4, 0x2de2e6, 0.95).setDepth(3);
      this.add.text(p.x + p.w / 2, p.y - 8, p.label ?? "DOOR", {
        fontFamily: "monospace", fontSize: "16px", color: "#2de2e6",
        backgroundColor: "#0b0e14cc", padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 1).setDepth(3);
    }
    for (const [i, f] of this.opts.furniture.entries()) {
      if (f.sprite) this.addRoomSprite(`spr-${this.opts.key}-f${i}`, f.sprite, f.x, f.y, 2);
      this.add.circle(f.x, f.y, f.radius, 0x2de2e6, 0.08).setDepth(3);
      this.add.text(f.x, f.y - f.radius - 6, f.label, {
        fontFamily: "monospace", fontSize: "14px", color: "#e8ecf1",
        backgroundColor: "#0b0e14cc", padding: { x: 5, y: 2 },
      }).setOrigin(0.5, 1).setDepth(3);
    }

    // Ambient animated torches + braziers (Set A sheets, looped for real).
    if (this.opts.torches?.length) {
      if (!this.anims.exists("torch-flame")) {
        this.anims.create({ key: "torch-flame", frames: this.anims.generateFrameNumbers("fx-torch", { frames: [6, 7, 8, 9, 10, 11] }), frameRate: 8, repeat: -1 });
      }
      for (const t of this.opts.torches) {
        const spr = this.add.sprite(t.x, t.y, "fx-torch").setDisplaySize(48, 48).setDepth(2);
        spr.play("torch-flame");
      }
    }
    if (this.opts.braziers?.length) {
      if (!this.anims.exists("campfire-flame")) {
        const frames = Array.from({ length: 40 }, (_, i) => i);
        this.anims.create({ key: "campfire-flame", frames: this.anims.generateFrameNumbers("fx-campfire", { frames }), frameRate: 10, repeat: -1 });
      }
      for (const b of this.opts.braziers) {
        const spr = this.add.sprite(b.x, b.y, "fx-campfire").setDisplaySize(64, 64).setDepth(2);
        spr.play("campfire-flame");
      }
    }

    // ONE animated hero launcher per room (Jason's launcher design, 2026-10-25).
    // Code-drawn primitives only — room paintings are still UNPROVEN placeholders
    // where the map is a floor tile, and no animation is faked in a screenshot:
    // these tweens loop for real. No physics body, no collider: walking is never blocked.
    if (this.opts.launcher) {
      const l = this.opts.launcher;
      if (l.sprite) this.addRoomSprite(`spr-${this.opts.key}-hero`, l.sprite, l.x, l.y, 1);
      this.add.text(l.x, l.y - 78, l.label, {
        fontFamily: "monospace", fontSize: "14px", color: "#ffc857",
        backgroundColor: "#0b0e14cc", padding: { x: 5, y: 2 },
      }).setOrigin(0.5, 1).setDepth(3);
      if (l.kind === "radar") {
        const c = this.add.container(l.x, l.y, [
          this.add.circle(0, 0, 46, 0x0b0e14, 0.55).setStrokeStyle(2, 0x2de2e6, 0.95),
          this.add.circle(0, 0, 46, 0x2de2e6, 0.12),
          this.add.rectangle(23, 0, 46, 3, 0x39ff14),
          this.add.circle(0, 0, 5, 0x39ff14),
        ]).setDepth(3);
        this.tweens.add({ targets: c, angle: 360, duration: 4000, repeat: -1, ease: "linear" });
        const glow = c.list[1] as Phaser.GameObjects.Arc;
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 1600, yoyo: true, repeat: -1 });
      } else if (l.kind === "desk") {
        this.add.rectangle(l.x, l.y, 110, 56, 0x1a2233).setStrokeStyle(2, 0x2de2e6, 0.95).setDepth(3);
        const scrolls = this.add.container(l.x, l.y - 28, [
          this.add.rectangle(0, 8, 90, 6, 0xe8ecf1),
          this.add.rectangle(0, 20, 70, 6, 0xe8ecf1),
          this.add.rectangle(0, 32, 80, 6, 0xe8ecf1),
        ]).setDepth(3);
        scrolls.setScale(1, 0.6);
        this.tweens.add({ targets: scrolls, scaleY: 1, duration: 1800, yoyo: true, repeat: -1, ease: "sine.inOut" });
        const typing = this.add.rectangle(l.x + 44, l.y + 20, 12, 6, 0x39ff14).setDepth(3);
        this.tweens.add({ targets: typing, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
      } else if (l.kind === "terminal") {
        const glowRect = this.add.rectangle(l.x, l.y, 120, 70, 0x39ff14, 0.08).setDepth(3);
        this.tweens.add({ targets: glowRect, alpha: 0.2, duration: 1500, yoyo: true, repeat: -1 });
        this.add.rectangle(l.x, l.y, 120, 70, 0x0b0e14).setStrokeStyle(2, 0x39ff14, 0.95).setDepth(3);
        const termText = this.add.text(l.x, l.y, ">_ msfconsole", {
          fontFamily: "monospace", fontSize: "14px", color: "#39ff14",
        }).setOrigin(0.5).setDepth(3);
        this.time.addEvent({ delay: 140, loop: true, callback: () => { termText.setAlpha(0.7 + Math.random() * 0.3); } });
      } else if (l.kind === "circle") {
        const c = this.add.container(l.x, l.y, [
          this.add.circle(0, 0, 52, 0x0b0e14, 0.55).setStrokeStyle(2, 0xffc857, 0.95),
          this.add.circle(0, 0, 52, 0xffc857, 0.12),
          this.add.text(0, 0, "ᚠᚢᚦᚨᚱᚲ", { fontFamily: "monospace", fontSize: "20px", color: "#ffc857" }).setOrigin(0.5),
        ]).setDepth(3);
        this.tweens.add({ targets: c, angle: 360, duration: 14000, repeat: -1, ease: "linear" });
        const glow = c.list[1] as Phaser.GameObjects.Arc;
        this.tweens.add({ targets: glow, alpha: 0.3, duration: 1600, yoyo: true, repeat: -1 });
      } else if (l.kind === "beacon") {
        const c = this.add.container(l.x, l.y, [
          this.add.triangle(0, 0, 0, 0, 100, -20, 100, 20, 0xffc857, 0.30),
          this.add.circle(0, 0, 18, 0x0b0e14, 0.8).setStrokeStyle(2, 0xffc857, 0.95),
          this.add.text(34, -30, "✦", { fontFamily: "monospace", fontSize: "18px", color: "#ffc857" }).setOrigin(0.5),
        ]).setDepth(3);
        c.setAngle(-25);
        this.tweens.add({ targets: c, angle: 25, duration: 3000, yoyo: true, repeat: -1, ease: "sine.inOut" });
        const glint = c.list[2] as Phaser.GameObjects.Text;
        this.tweens.add({ targets: glint, alpha: 0.2, duration: 900, yoyo: true, repeat: -1 });
      }
      this.launcherPrompt = this.add.text(l.x, l.y - 100, `E / CLICK — OPEN ${l.label}\n${l.url}`, {
        fontFamily: "monospace", fontSize: "13px", color: "#39ff14", align: "center",
        backgroundColor: "#0b0e14e6", padding: { x: 8, y: 5 },
      }).setOrigin(0.5, 1).setDepth(40).setVisible(false);
    }
    this.add.text(this.opts.mapW / 2, 40, this.opts.key, {
      fontFamily: "monospace", fontSize: "22px", color: "#ffc857",
      backgroundColor: "#0b0e14cc", padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setDepth(30);

    for (const skin of RAVENLORD_SKINS) {
      const texKey = `skin-${skin.id}`;
      if (!this.anims.exists(`${skin.id}-walk-down`)) {
        this.anims.create({ key: `${skin.id}-walk-down`, frames: this.anims.generateFrameNumbers(texKey, { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: `${skin.id}-walk-left`, frames: this.anims.generateFrameNumbers(texKey, { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: `${skin.id}-walk-right`, frames: this.anims.generateFrameNumbers(texKey, { start: 8, end: 11 }), frameRate: 8, repeat: -1 }); this.anims.create({ key: `${skin.id}-walk-up`, frames: this.anims.generateFrameNumbers(texKey, { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: `${skin.id}-idle-down`, frames: [{ key: texKey, frame: 0 }], frameRate: 1 });
        this.anims.create({ key: `${skin.id}-idle-left`, frames: [{ key: texKey, frame: 4 }], frameRate: 1 });
        this.anims.create({ key: `${skin.id}-idle-right`, frames: [{ key: texKey, frame: 8 }], frameRate: 1 }); this.anims.create({ key: `${skin.id}-idle-up`, frames: [{ key: texKey, frame: 12 }], frameRate: 1 });
      }
    }

    this.player = this.physics.add.sprite(spawn.x, spawn.y, `skin-${this.activeSkinId}`, 0).setDisplaySize(OP_W, OP_H).setDepth(14);
    this.player.body.setCircle(10, 6, 20);
    this.player.setCollideWorldBounds(true);
    if (this.anims.exists(`${this.activeSkinId}-idle-down`)) this.player.play(`${this.activeSkinId}-idle-down`);

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(200, 130);
    this.cameras.main.setZoom(1.0);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
      this.input.keyboard.on("keydown-E", () => this.interact());
      this.input.keyboard.on("keydown-SPACE", () => this.interact());
    }
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.paused) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.opts.launcher) {
        const l = this.opts.launcher;
        const pdx = l.x - this.player.x;
        const pdy = l.y - this.player.y;
        const cdx = l.x - w.x;
        const cdy = l.y - w.y;
        if (pdx * pdx + pdy * pdy < 130 * 130 && cdx * cdx + cdy * cdy < 70 * 70) {
          try { window.open(l.url, "_blank", "noopener"); } catch { /* no window */ }
          return;
        }
      }
      if (this.walkable(w.x, w.y)) this.dest = { x: w.x, y: w.y };
    });

    this.ready = true;
    this.portalGraceUntil = (this.time?.now ?? 0) + 800;
    try {
      (window as unknown as Record<string, unknown>).__keepSceneKey = this.scene.key;
      (window as unknown as Record<string, unknown>).__keepSpawn = spawn;
      (window as unknown as Record<string, unknown>).__keepPlayer = { x: spawn.x, y: spawn.y, vx: 0, vy: 0, paused: false, dest: null, stickX: 0, stickY: 0, sceneKey: this.scene.key, body: true };
    } catch { /* no window */ }
    this.cameras.main.fadeIn(250);
    this.opts.onSceneReady?.(this);
  }

  interact() {
    if (this.paused || !this.player) return;
    const near = this.opts.furniture.find((f) => {
      const dx = f.x - this.player.x;
      const dy = f.y - this.player.y;
      return dx * dx + dy * dy < (f.radius + 60) * (f.radius + 60);
    });
    if (this.infoText) { this.infoText.destroy(); this.infoText = null; }
    if (this.infoBg) { this.infoBg.destroy(); this.infoBg = null; }
    if (this.opts.launcher) {
      const l = this.opts.launcher;
      const dx = l.x - this.player.x;
      const dy = l.y - this.player.y;
      if (dx * dx + dy * dy < 130 * 130) {
        try { window.open(l.url, "_blank", "noopener"); } catch { /* no window */ }
        return;
      }
    }
    if (!near) return;
    const cam = this.cameras.main;
    this.infoBg = this.add.rectangle(cam.width / 2, cam.height - 90, Math.min(640, cam.width - 40), 90, 0x0b0e14, 0.92).setDepth(40).setScrollFactor(0);
    this.infoText = this.add.text(cam.width / 2, cam.height - 90, `${near.label}\n${near.info}`, {
      fontFamily: "monospace", fontSize: "13px", color: "#e8ecf1", align: "center",
      wordWrap: { width: Math.min(600, cam.width - 80) },
    }).setOrigin(0.5).setDepth(41).setScrollFactor(0);
  }

  private triggerPortal(p: PortalTrigger) {
    if (this.isTransitioning || !this.player) return;
    this.isTransitioning = true;
    this.player.setVelocity(0, 0);
    this.dest = null;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start(p.targetScene, { spawn: p.targetSpawn });
    });
  }

  private applyFacingAnim(prefix: "walk" | "idle") {
    const facing = this.lastFacing;
    // Right has its own drawn row (frames 8-11) -- never mirror left.
    this.player.setFlipX(false);
    const key = `${this.activeSkinId}-${prefix}-${facing}`;
    if (this.anims.exists(key)) this.player.play(key, true);
  }

  update(time: number, delta: number) {
    try { (window as unknown as Record<string, unknown>).__keepFrame = ((window as unknown as Record<string, number>).__keepFrame ?? 0) + 1; } catch { /* no window */ }
    if (!this.player?.body || this.paused) { this.player?.setVelocity(0, 0); return; }
    if (this.launcherPrompt && this.opts.launcher) {
      const l = this.opts.launcher;
      const dx = l.x - this.player.x;
      const dy = l.y - this.player.y;
      this.launcherPrompt.setVisible(dx * dx + dy * dy < 110 * 110);
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
      targetVel = calculateVelocity(inputX, inputY, speed);
    } else if (this.dest) {
      const dx = this.dest.x - this.player.x;
      const dy = this.dest.y - this.player.y;
      if (dx * dx + dy * dy < 64) this.dest = null;
      else targetVel = calculateVelocity(dx, dy, speed);
    }
    const feetX = this.player.x;
    const feetY = this.player.y;
    const stepTime = delta / 1000;
    const canMoveX = targetVel.x === 0 || (this.walkable(feetX + (targetVel.x > 0 ? 10 : -10) + targetVel.x * stepTime, feetY - 4) && this.walkable(feetX + (targetVel.x > 0 ? 10 : -10) + targetVel.x * stepTime, feetY + 4));
    const canMoveY = targetVel.y === 0 || (this.walkable(feetX - 6, feetY + (targetVel.y > 0 ? 10 : -10) + targetVel.y * stepTime) && this.walkable(feetX + 6, feetY + (targetVel.y > 0 ? 10 : -10) + targetVel.y * stepTime));
    const finalVx = canMoveX ? targetVel.x : 0;
    const finalVy = canMoveY ? targetVel.y : 0;
    this.player.setVelocity(finalVx, finalVy);
    const isMoving = finalVx !== 0 || finalVy !== 0;
    if (isMoving) {
      this.lastFacing = determineFacing(finalVx, finalVy, this.lastFacing);
      this.applyFacingAnim("walk");
    } else {
      this.applyFacingAnim("idle");
    }
    try {
      (window as unknown as Record<string, unknown>).__keepPlayer = { x: this.player.x, y: this.player.y, vx: finalVx, vy: finalVy, paused: this.paused, dest: this.dest, stickX: this.stickX, stickY: this.stickY, sceneKey: this.scene.key, body: true };
    } catch { /* no window */ }
    if (this.portalExitRequired) {
      if (!portalAt(this.opts.portals, this.player.x, this.player.y)) this.portalExitRequired = false;
    } else if (!this.isTransitioning && time >= this.portalGraceUntil) {
      const door = portalAt(this.opts.portals, this.player.x, this.player.y);
      if (door) this.triggerPortal(door);
    }
  }
}
