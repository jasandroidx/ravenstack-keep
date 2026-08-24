import * as Phaser from "phaser";
import {
  HALL_NPCS,
  MAP_H,
  MAP_SRC,
  MAP_W,
  PALETTE,
  PLAYER_SPAWN,
  PLAYER_SRC,
  npcAtPoint,
  npcNear,
  tableNear,
  walkable,
  zoneAt,
  type HallNpc,
} from "./world";

export type HallEvents = {
  onZone: (name: string, lock: string) => void;
  onPrompt: (npc: HallNpc | null, atTable: boolean) => void;
  onTalk: (npc: HallNpc) => void;
  onTable: () => void;
};

/** Map walker = Raziel crop, recolored. Cell 38×62 matches the map figure. */
const OP_W = 38;
const OP_H = 62;
const NPC_W = 32;
const NPC_H = 40;

export class HallScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private shadow!: Phaser.GameObjects.Ellipse;
  private reticle!: Phaser.GameObjects.Arc;
  private eventsOut: HallEvents;
  private lastZone = "";
  private lastPrompt = "";
  private dest: { x: number; y: number } | null = null;
  private stickX = 0;
  private stickY = 0;
  paused = false;

  constructor(eventsOut: HallEvents) {
    super({ key: "HallScene" });
    this.eventsOut = eventsOut;
  }

  setDir(x: number, y: number) {
    this.stickX = x;
    this.stickY = y;
    if (x || y) this.dest = null;
  }

  preload() {
    this.load.image("keep-map", MAP_SRC);
    this.load.spritesheet("operator", PLAYER_SRC, { frameWidth: OP_W, frameHeight: OP_H });
    for (const npc of HALL_NPCS) {
      if (npc.actor) this.load.spritesheet(`actor-${npc.id}`, npc.actor, { frameWidth: NPC_W, frameHeight: NPC_H });
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.add.image(0, 0, "keep-map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H).setDepth(0);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.centerOn(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.cameras.main.setZoom(1.45);

    this.anims.create({ key: "walk-down", frames: this.anims.generateFrameNumbers("operator", { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "walk-left", frames: this.anims.generateFrameNumbers("operator", { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "walk-right", frames: this.anims.generateFrameNumbers("operator", { start: 8, end: 11 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "walk-up", frames: this.anims.generateFrameNumbers("operator", { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

    for (const npc of HALL_NPCS) {
      const chip =
        npc.state === "working" ? PALETTE.magenta : npc.state === "waiting_human" ? PALETTE.amber : PALETTE.cyan;
      const labelLift = npc.actor ? 46 : 38;
      if (npc.actor) {
        const spr = this.add.sprite(npc.x, npc.y, `actor-${npc.id}`, 0).setOrigin(0.5, 1).setDepth(7);
        spr.setDisplaySize(NPC_W, npc.actorH ?? NPC_H);
        if (npc.state === "working") {
          this.anims.create({
            key: `idle-${npc.id}`,
            frames: this.anims.generateFrameNumbers(`actor-${npc.id}`, { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1,
          });
          spr.play(`idle-${npc.id}`);
        }
      }
      this.add.circle(npc.x, npc.y - labelLift + 4, 4, chip, 0.95).setDepth(8);
      this.add
        .text(npc.x, npc.y - labelLift, npc.name, {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: "#e8ecf1",
          stroke: "#0b0e14",
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(8);
    }

    this.shadow = this.add.ellipse(PLAYER_SPAWN.x, PLAYER_SPAWN.y + 2, 22, 8, 0x000000, 0.45).setDepth(6);
    this.reticle = this.add.circle(0, 0, 6, PALETTE.cyan, 0.0).setStrokeStyle(2, PALETTE.cyan, 0.9).setDepth(5).setVisible(false);

    this.player = this.physics.add.sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, "operator", 0);
    this.player.setOrigin(0.5, 1).setCollideWorldBounds(true).setDepth(7);
    this.player.setDisplaySize(OP_W, OP_H);
    this.player.body.setAllowGravity(false);
    this.player.setPosition(PLAYER_SPAWN.x, PLAYER_SPAWN.y);

    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
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
        this.eventsOut.onTalk(hit);
        return;
      }
      if (hit) {
        this.dest = { x: hit.x, y: hit.y + 18 };
        this.reticle.setPosition(hit.x, hit.y + 18).setVisible(true);
        return;
      }
      if (tableNear(w.x, w.y) && distToPlayer < 80) {
        this.eventsOut.onTable();
        return;
      }
      if (walkable(w.x, w.y)) {
        this.dest = { x: w.x, y: w.y };
        this.reticle.setPosition(w.x, w.y).setVisible(true);
        return;
      }
      const mark = this.add.rectangle(w.x, w.y, 8, 8, 0xff3b3b, 0.85).setDepth(20);
      this.tweens.add({ targets: mark, alpha: 0, duration: 280, onComplete: () => mark.destroy() });
    });
  }

  interact() {
    if (this.paused || !this.player) return;
    const npc = npcNear(this.player.x, this.player.y);
    if (npc) {
      this.eventsOut.onTalk(npc);
      return;
    }
    if (tableNear(this.player.x, this.player.y)) this.eventsOut.onTable();
  }

  update() {
    if (this.shadow && this.player) {
      this.shadow.setPosition(this.player.x, this.player.y + 2);
    }
    if (!this.player?.body || this.paused) {
      this.player?.setVelocity(0, 0);
      return;
    }

    const speed = 170;
    let vx = this.stickX;
    let vy = this.stickY;
    if (this.cursors?.left.isDown || this.wasd?.A.isDown) vx -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) vx += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) vy -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) vy += 1;

    if (vx || vy) {
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

    const feetY = this.player.y;
    const canX = walkable(this.player.x + vx / 55, feetY);
    const canY = walkable(this.player.x, feetY + vy / 55);
    this.player.setVelocity(canX ? vx : 0, canY ? vy : 0);

    const ax = canX ? vx : 0;
    const ay = canY ? vy : 0;
    if (Math.abs(ax) > Math.abs(ay) && ax) {
      this.player.anims.play(ax < 0 ? "walk-left" : "walk-right", true);
    } else if (ay) {
      this.player.anims.play(ay < 0 ? "walk-up" : "walk-down", true);
    } else {
      this.player.anims.stop();
    }

    const zone = zoneAt(this.player.x, this.player.y);
    const zkey = zone ? `${zone.name}:${zone.lock}` : "";
    if (zkey !== this.lastZone) {
      this.lastZone = zkey;
      this.eventsOut.onZone(zone?.name ?? "Keep", zone?.lock ?? "live");
    }

    const npc = npcNear(this.player.x, this.player.y);
    const atTable = tableNear(this.player.x, this.player.y);
    const pkey = `${npc?.id ?? ""}:${atTable}`;
    if (pkey !== this.lastPrompt) {
      this.lastPrompt = pkey;
      this.eventsOut.onPrompt(npc, atTable);
    }
  }
}
