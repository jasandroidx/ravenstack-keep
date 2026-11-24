import * as Phaser from "phaser";
import { RAVENLORD_SKINS, type HallNpc } from "./world";
import { calculateVelocity, determineFacing, type Facing } from "./locomotion";
import { portalAt, type PortalTrigger } from "./portal";
import { bindRegistry, discover, exposeDebugHooks, interactableAt, loadFlags, setFlag, type Interactable, type PlayerState } from "./interact";
import { discoveryJuice, ensureFxTextures, fadeThrough, floatLine, PromptLabel } from "./juice";
import { hallAudio } from "./audio";

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

export type RoomOpts = {
  key: string;
  /** In-canvas title; defaults to the scene key. */
  title?: string;
  /** Select E-gates (combined Keep, 2026-10-30): stepping in shows a prompt
   *  and NOTHING else; only E while inside transitions. Never auto-fire. */
  selectGates?: PortalTrigger[];
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
  /** Shared interaction system (interact.ts): E-prompt objects in this room. */
  interactables?: Interactable[];
  /** Two-frame props (frame 0 = closed, 1 = open), e.g. a chest. */
  props?: { id: string; src: string; fw: number; fh: number; x: number; y: number; w: number; h: number }[];
  /** Mirrors the single prompt to React (verb or null). */
  onPrompt?: (verb: string | null) => void;
  /** Talkable NPCs standing in this room (e.g. Lyra in the interior bedroom).
   *  Static actors, never colliders. x/y are room image pixels. */
  npcs?: HallNpc[];
  /** Player is in talk range of an NPC (or left it: null). */
  onNear?: (npc: HallNpc | null) => void;
  /** E / Engage on an NPC in range: React opens the talk panel. */
  onTalk?: (npc: HallNpc) => void;
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
  private preSit: { x: number; y: number } | null = null;
  private portalExitRequired = false;
  private portalGraceUntil = 0;
  private infoText: Phaser.GameObjects.Text | null = null;
  private infoBg: Phaser.GameObjects.Rectangle | null = null;
  private gatePrompt: Phaser.GameObjects.Text | null = null;
  public paused = false;
  private npcSprites: { npc: HallNpc; spr: Phaser.GameObjects.Sprite }[] = [];
  private nearNpc: HallNpc | null = null;
  public ready = false;
  public pstate: PlayerState = "walk";
  private promptLabel: PromptLabel | null = null;
  private lastVerb: string | null = "";
  private lastInteractAt = 0;
  private propSprites = new Map<string, Phaser.GameObjects.Sprite>();

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
  /** HUD "Ask" reply over a room NPC (HallScene has the same method). */
  showBubble(npcId: string, text: string) {
    const n = this.npcSprites.find((x) => x.npc.id === npcId);
    if (n) floatLine(this, n.spr.x, n.spr.y - 60, text.length > 140 ? text.slice(0, 137) + "…" : text, 5000);
  }
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
    for (const npc of this.opts.npcs ?? []) {
      if (npc.actor) this.load.spritesheet(`actor-${npc.id}`, npc.actor, { frameWidth: FRAME_W, frameHeight: FRAME_H });
    }
    for (const skin of RAVENLORD_SKINS) {
      this.load.spritesheet(`skin-${skin.id}`, skin.src, { frameWidth: FRAME_W, frameHeight: FRAME_H });
    }
    const spriteSrcs: { key: string; sprite: RoomSprite }[] = [];
    this.opts.furniture.forEach((f, i) => { if (f.sprite) spriteSrcs.push({ key: `spr-${this.opts.key}-f${i}`, sprite: f.sprite }); });
    for (const s of spriteSrcs) {
      if (s.sprite.sheet) this.load.spritesheet(s.key, s.sprite.src, { frameWidth: s.sprite.sheet.fw, frameHeight: s.sprite.sheet.fh });
      else this.load.image(s.key, s.sprite.src);
    }
    if (this.opts.torches?.length) this.load.spritesheet("fx-torch", "/assets/fx/torch.png", { frameWidth: 32, frameHeight: 32 });
    if (this.opts.braziers?.length) this.load.spritesheet("fx-campfire", "/assets/fx/campfire.png", { frameWidth: 32, frameHeight: 32 });
    for (const pr of this.opts.props ?? []) this.load.spritesheet(`prop-${this.opts.key}-${pr.id}`, pr.src, { frameWidth: pr.fw, frameHeight: pr.fh });
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
    this.pstate = "walk";
    this.lastVerb = "";
    this.propSprites.clear();
    bindRegistry(this.registry);
    exposeDebugHooks();
    ensureFxTextures(this);
    // Reused instance: React's setDir() went to the OLD run of this scene, so
    // stickX/stickY survive scene.start() and drift the player into the
    // return door on a second entry. Reset all carried input here.
    this.stickX = 0;
    this.stickY = 0;
    this.dest = null;
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
    // Select E-gates: amber outline + label, never auto-fire.
    for (const g of this.opts.selectGates ?? []) {
      this.add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h).setStrokeStyle(4, 0xffc857, 0.95).setDepth(3);
      this.add.text(g.x + g.w / 2, g.y - 8, g.label ?? "E — GATE", {
        fontFamily: "monospace", fontSize: "16px", color: "#ffc857",
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

    for (const pr of this.opts.props ?? []) {
      const spr = this.add.sprite(pr.x, pr.y, `prop-${this.opts.key}-${pr.id}`, loadFlags()[`opened:${pr.id}`] ? 1 : 0)
        .setDisplaySize(pr.w, pr.h).setDepth(4);
      this.propSprites.set(pr.id, spr);
    }
    this.promptLabel = new PromptLabel(this);
    this.add.text(this.opts.mapW / 2, 40, this.opts.title ?? this.opts.key, {
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

    // Room NPCs: idle actor + shadow + name tag (same look as the courtyard).
    this.npcSprites = [];
    this.nearNpc = null;
    for (const npc of this.opts.npcs ?? []) {
      if (!npc.actor) continue;
      const sc = npc.actorScale ?? 1;
      this.add.ellipse(npc.x, npc.y + (OP_H * sc) / 2 - 2, 28, 10, 0x000000, 0.45).setDepth(4);
      const spr = this.add.sprite(npc.x, npc.y, `actor-${npc.id}`, 0).setDisplaySize(OP_W * sc, OP_H * sc).setDepth(5);
      if (!this.anims.exists(`room-npc-idle-${npc.id}`)) {
        this.anims.create({ key: `room-npc-idle-${npc.id}`, frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: 0, end: 3 }), frameRate: 3, repeat: -1 });
      }
      spr.play(`room-npc-idle-${npc.id}`);
      this.add.text(npc.x, npc.y - (OP_H * sc) / 2 - 6, npc.name, {
        fontFamily: "monospace", fontSize: "11px", color: "#f3e3c3", backgroundColor: "#0b0e14b3", padding: { x: 3, y: 1 },
      }).setOrigin(0.5, 1).setDepth(6);
      this.npcSprites.push({ npc, spr });
    }
    try { (window as unknown as Record<string, unknown>).__keepNpcs = (this.opts.npcs ?? []).map((n) => ({ id: n.id, x: n.x, y: n.y, scene: this.opts.key })); } catch { /* ignore */ }

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
      this.input.keyboard.on("keydown-E", () => {
        // Select gate wins: only E, only while standing inside it.
        if (!this.isTransitioning && this.player) {
          const gate = portalAt(this.opts.selectGates ?? [], this.player.x, this.player.y);
          if (gate) { this.triggerPortal(gate); return; }
        }
        this.interact();
      });
      this.input.keyboard.on("keydown-SPACE", () => this.interact());
    }
    // Select-gate prompt, screen-anchored, shown only while standing in a gate.
    this.gatePrompt = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 60, "", {
      fontFamily: "monospace", fontSize: "16px", color: "#ffc857",
      backgroundColor: "#0b0e14e6", padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(40).setVisible(false);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.paused) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
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

  /** Interactable under the player's feet (shared system). */
  private objectHere(): Interactable | null {
    if (!this.player || !this.opts.interactables?.length) return null;
    return interactableAt(this.opts.interactables, this.player.x, this.player.y, { flags: loadFlags(), now: this.time.now, isNight: false });
  }

  private runInteractable(it: Interactable) {
    const lines = it.lines ?? [];
    const line = lines.length ? lines[Math.floor(Math.random() * lines.length)] : "";
    if (it.kind === "sit") {
      // Throne fix 2026-10-31: walk UP onto the seat first, don't just
      // freeze where the prompt fired. The old anchor (960,290) was on the
      // carpet in front of the throne, so pressing E looked like nothing
      // happened. Tween to the anchor (the seat itself), then sit.
      this.preSit = { x: this.player.x, y: this.player.y };
      const ax = it.anchor?.x ?? this.player.x;
      const ay = it.anchor?.y ?? this.player.y;
      this.player.setVelocity(0, 0);
      this.dest = null;
      this.pstate = "cutscene";
      const dist = Math.hypot(ax - this.player.x, ay - this.player.y);
      const dur = Math.min(1100, Math.max(450, dist * 2.5));
      this.lastFacing = "up";
      this.applyFacingAnim("walk");
      this.tweens.add({
        targets: this.player, x: ax, y: ay, duration: dur, ease: "Sine.easeInOut",
        onComplete: () => {
          this.player.body.reset(ax, ay);
          this.player.setVelocity(0, 0);
          this.lastFacing = it.anchor?.face ?? "down";
          this.applyFacingAnim("idle");
          this.pstate = "sit";
          setFlag(`sat:${it.id}`, true);
          hallAudio.playInteract();
          if (discover(it.id)) discoveryJuice(this, ax, ay - 20, this.player);
          floatLine(this, ax, ay - 44, line || "Seated.", 3000);
        },
      });
      return;
    }
    if (it.kind === "climb") {
      const d = it.data as { targetScene: string; targetSpawn: { x: number; y: number }; from?: string };
      this.pstate = "cutscene";
      this.isTransitioning = true;
      this.player.setVelocity(0, 0);
      this.dest = null;
      if (it.anchor) this.player.body.reset(it.anchor.x, it.anchor.y);
      this.lastFacing = "up";
      this.applyFacingAnim("idle");
      hallAudio.playCreak();
      this.tweens.add({ targets: this.player, y: this.player.y - 18, duration: 500, ease: "Sine.easeIn" });
      fadeThrough(this, () => this.scene.start(d.targetScene, { spawn: d.targetSpawn, from: d.from }), { outMs: 500 });
      return;
    }
    if (it.kind === "open") {
      const spr = this.propSprites.get(it.id);
      const first = !loadFlags()[`opened:${it.id}`];
      spr?.setFrame(1);
      setFlag(`opened:${it.id}`, true);
      hallAudio.playCreak();
      if (discover(it.id)) discoveryJuice(this, spr?.x ?? this.player.x, spr?.y ?? this.player.y, spr);
      floatLine(this, spr?.x ?? this.player.x, (spr?.y ?? this.player.y) - 34, first ? line : "Empty now. Someone was here first. (You.)", 3600);
      return;
    }
    hallAudio.playInteract();
    if (discover(it.id)) discoveryJuice(this, this.player.x, this.player.y - 30);
    if (line) floatLine(this, this.player.x, this.player.y - 46, line, 3600);
  }

  interact() {
    if (this.paused || !this.player) return;
    const nowMs = Date.now();
    if (nowMs - this.lastInteractAt < 200) return; // Phaser + React both fire on one E
    this.lastInteractAt = nowMs;
    if (this.pstate === "sit") {
      if (this.preSit) this.player.body.reset(this.preSit.x, this.preSit.y);
      this.preSit = null;
      this.pstate = "walk";
      this.cameras.main.zoomTo(1.0, 400, "Sine.easeInOut");
      hallAudio.playInteract();
      return;
    }
    if (this.pstate !== "walk") return;
    // Gate-fix 2026-10-30: same React-E / Phaser-E swallow as HallScene —
    // React preventDefaults E and calls interact() only, so Phaser's
    // keydown-E gate handler never fires. Gate must win here too, or the
    // interior->courtyard select gate can never fire via E.
    const gate = portalAt(this.opts.selectGates ?? [], this.player.x, this.player.y);
    if (gate) { this.triggerPortal(gate); return; }
    const it = this.objectHere();
    if (it) { this.runInteractable(it); return; }
    const npc = this.npcInRange();
    if (npc) {
      this.player.setVelocity(0, 0);
      this.dest = null;
      hallAudio.playInteract();
      this.opts.onTalk?.(npc);
      return;
    }
    const near = this.opts.furniture.find((f) => {
      const dx = f.x - this.player.x;
      const dy = f.y - this.player.y;
      return dx * dx + dy * dy < (f.radius + 60) * (f.radius + 60);
    });
    if (this.infoText) { this.infoText.destroy(); this.infoText = null; }
    if (this.infoBg) { this.infoBg.destroy(); this.infoBg = null; }
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
    this.stickX = 0;
    this.stickY = 0;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start(p.targetScene, { spawn: p.targetSpawn });
    });
  }

  /** Nearest room NPC within its talk radius (+ the player's reach). */
  private npcInRange(): HallNpc | null {
    if (!this.player) return null;
    let best: HallNpc | null = null;
    let bestD = Infinity;
    for (const { npc } of this.npcSprites) {
      const d = (npc.x - this.player.x) ** 2 + (npc.y - this.player.y) ** 2;
      const r = npc.radius + 30;
      if (d < r * r && d < bestD) { best = npc; bestD = d; }
    }
    return best;
  }

  private updatePrompt(it: Interactable | null) {
    // Objects win over NPCs (one prompt at a time), matching interact().
    const npc = it || this.pstate !== "walk" ? null : this.npcInRange();
    if (npc !== this.nearNpc) {
      this.nearNpc = npc;
      this.opts.onNear?.(npc);
    }
    const verb = it?.verb ?? (npc ? `Talk to ${npc.name}` : null);
    const at = it?.labelAt ?? it?.anchor ?? (npc ? { x: npc.x, y: npc.y - 62 } : { x: this.player.x, y: this.player.y - 46 });
    this.promptLabel?.show(verb, at.x, at.y);
    const v = verb;
    if (v !== this.lastVerb) {
      this.lastVerb = v;
      this.opts.onPrompt?.(it?.verb ?? null);
      try { (window as unknown as Record<string, unknown>).__keepPrompt = it ? { kind: "object", verb: it.verb, id: it.id } : npc ? { kind: "npc", verb: v, id: npc.id } : null; } catch { /* ignore */ }
    }
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
    if (this.pstate !== "walk") { this.player.setVelocity(0, 0); this.updatePrompt(null); return; }
    this.updatePrompt(this.objectHere());
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
    // Select E-gate prompt: standing inside shows it, stepping out hides it.
    // Stepping in alone never transitions — only the E handler above does.
    if (this.gatePrompt) {
      const gate = portalAt(this.opts.selectGates ?? [], this.player.x, this.player.y);
      if (gate) this.gatePrompt.setText(gate.label ?? "E — GATE").setVisible(true);
      else this.gatePrompt.setVisible(false);
    }
  }
}
