import Phaser from "phaser";
import type { CastleMapResponse, PipelineConfig, RoomChip } from "./types";
import {
  PALETTE,
  ROOM_SIZE,
  chipTextureKey,
  roomFallbackTextureKey,
  roomTextureKey,
  stateColor,
} from "./palette";
import { getSeatByRoomId, getSeatByAgentId } from "./config/seats";

export type RoomClickFn = (room: RoomChip) => void;
/** Zone / room activate — for HUD Path/Cost/Status strip and future enter-zone. */
export type ZoneActionFn = (room: RoomChip, action: "select" | "path" | "cost" | "status") => void;

interface RoomSpriteBundle {
  room: RoomChip;
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  select: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  useSprites: boolean;
}

const FACADE_ROOMS = [
  "oracle",
  "orchestrator",
  "clawforge",
  "scribe",
  "auditor",
  "suno_studio",
  "flipper",
  "lead_forge",
  "great-hall",
  "alchemy-lab",
  "library",
  "armory",
  "observatory",
  "vault",
] as const;

/**
 * Top-down fortress map. Coords from castle_map (SOT).
 * Loads 48×48 art from /art/ when present; falls back to rectangles.
 *
 * TODO(Stage 3/4 — Agent Town conversion):
 * - Replace room-chip bodies with full Tiled keep_map + 32×32 keep_tiles layer.
 * - Spawn walking character sprites from seats[].spriteKey at defaultPosition / room center.
 * - Drive locomotion via get_path path_cells + tween along grid.
 * - Keep pixelArt: true / antialias: false.
 */
export class KeepScene extends Phaser.Scene {
  private bundles = new Map<string, RoomSpriteBundle>();
  private edgeGraphics!: Phaser.GameObjects.Graphics;
  private mapData: CastleMapResponse | null = null;
  private pipeline: PipelineConfig = { edges: [] };
  private onRoomClick: RoomClickFn | null = null;
  private onZoneAction: ZoneActionFn | null = null;
  private selectedId: string | null = null;
  private vignette!: Phaser.GameObjects.Rectangle;
  private worldW = 1000;
  private worldH = 700;
  private ready = false;
  private artLoaded = false;
  private pending: { map: CastleMapResponse; pipeline: PipelineConfig } | null =
    null;

  constructor() {
    super({ key: "KeepScene" });
  }

  setRoomClickHandler(fn: RoomClickFn) {
    this.onRoomClick = fn;
  }

  /** HUD / external: select | path | cost | status against current room. */
  setZoneActionHandler(fn: ZoneActionFn) {
    this.onZoneAction = fn;
  }

  /** Fire zone action from HUD strip without a second click on the map. */
  emitZoneAction(action: "select" | "path" | "cost" | "status") {
    if (!this.selectedId || !this.mapData) return;
    const room = this.mapData.rooms.find((r) => r.room_id === this.selectedId);
    if (room) this.onZoneAction?.(room, action);
  }

  preload() {
    // Base tiles (existing 48×48)
    this.load.image("room_unforged", "/art/tiles/base/room_unforged_48.png");
    this.load.image("room_live", "/art/tiles/base/room_live_48.png");
    this.load.image("room_locked", "/art/tiles/base/room_locked_48.png");
    // Chips
    this.load.image("chip_idle", "/art/chips/chip_idle.png");
    this.load.image("chip_work", "/art/chips/chip_work.png");
    this.load.image("chip_wait", "/art/chips/chip_wait.png");
    this.load.image("chip_fail", "/art/chips/chip_fail.png");
    this.load.image("chip_retired", "/art/chips/chip_retired.png");
    // Selection
    this.load.image("selection_outline", "/art/hud/selection_outline.png");
    // Facades
    for (const id of FACADE_ROOMS) {
      this.load.image(
        `facade_${id}_unforged`,
        `/art/tiles/facades/facade_${id}_unforged.png`,
      );
      this.load.image(
        `facade_${id}_live`,
        `/art/tiles/facades/facade_${id}_live.png`,
      );
    }

    // --- Future 32×32 gothic tileset + character sprites (Stage 3/4) ---
    // Paths match keep-asset-pipeline destination under public/assets.
    // 404s are expected until assets land; loaderror + textureOrFallback handle it.
    this.load.image("keep_tiles", "/assets/tilesets/keep-tiles.png");
    this.load.spritesheet("raziel_sprite", "/assets/sprites/raziel.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("ops_sprite", "/assets/sprites/ops.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("research_sprite", "/assets/sprites/research.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("architect_sprite", "/assets/sprites/architect.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet("gardener_sprite", "/assets/sprites/gardener.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.on("loaderror", () => {
      this.artLoaded = false;
    });
  }

  create() {
    this.artLoaded = this.textures.exists("room_live");
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.edgeGraphics = this.add.graphics().setDepth(0);

    this.vignette = this.add
      .rectangle(
        0,
        0,
        this.scale.width * 2,
        this.scale.height * 2,
        PALETTE.neonAmber,
        0,
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);

    this.scale.on("resize", () => {
      this.vignette.setPosition(this.scale.width / 2, this.scale.height / 2);
      this.vignette.setSize(this.scale.width, this.scale.height);
    });
    this.vignette.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.vignette.setSize(this.scale.width, this.scale.height);

    const g = this.add.graphics().setDepth(-1).setAlpha(0.12);
    g.lineStyle(1, PALETTE.stone, 1);
    for (let x = 0; x < 1200; x += 48) {
      g.lineBetween(x, 0, x, 800);
    }
    for (let y = 0; y < 800; y += 48) {
      g.lineBetween(0, y, 1200, y);
    }

    this.ready = true;
    if (this.pending) {
      const { map, pipeline } = this.pending;
      this.pending = null;
      this.applyMap(map, pipeline);
    }
  }

  applyMap(map: CastleMapResponse, pipeline: PipelineConfig) {
    this.mapData = map;
    this.pipeline = pipeline;
    if (!this.ready) {
      this.pending = { map, pipeline };
      return;
    }
    const nextIds = new Set(map.rooms.map((r) => r.room_id));
    const sameSet =
      this.bundles.size === nextIds.size &&
      [...this.bundles.keys()].every((id) => nextIds.has(id));
    if (sameSet && this.bundles.size > 0) {
      for (const room of map.rooms) {
        const b = this.bundles.get(room.room_id);
        if (b) {
          b.room = room;
          this.styleBundle(b);
        }
      }
      this.drawEdges();
      this.refreshVignette();
      return;
    }
    this.rebuildRooms();
    this.drawEdges();
    this.fitCamera();
  }

  updateMap(map: CastleMapResponse) {
    this.mapData = map;
    for (const room of map.rooms) {
      const b = this.bundles.get(room.room_id);
      if (b) {
        b.room = room;
        this.styleBundle(b);
      } else {
        this.rebuildRooms();
        break;
      }
    }
    this.refreshVignette();
  }

  setSelected(roomId: string | null) {
    this.selectedId = roomId;
    for (const b of this.bundles.values()) {
      this.styleBundle(b);
    }
  }

  focusRoom(roomId: string) {
    const b = this.bundles.get(roomId);
    if (!b) return;
    this.cameras.main.pan(b.room.x, b.room.y, 250, "Sine.easeInOut");
  }

  private rebuildRooms() {
    for (const b of this.bundles.values()) {
      b.body.destroy();
      b.select.destroy();
      b.chip.destroy();
      b.label.destroy();
      b.sub.destroy();
    }
    this.bundles.clear();
    if (!this.mapData) return;

    let maxX = 0;
    let maxY = 0;
    for (const room of this.mapData.rooms) {
      maxX = Math.max(maxX, room.x + ROOM_SIZE);
      maxY = Math.max(maxY, room.y + ROOM_SIZE);
      this.spawnRoom(room);
    }
    this.worldW = Math.max(900, maxX + 120);
    this.worldH = Math.max(600, maxY + 120);
    this.refreshVignette();
  }

  private textureOrFallback(key: string, fallback: string): string {
    if (this.textures.exists(key)) return key;
    if (this.textures.exists(fallback)) return fallback;
    return "";
  }

  private spawnRoom(room: RoomChip) {
    const cx = room.x;
    const cy = room.y;
    const useSprites = this.artLoaded;

    const onClick = () => {
      const live = this.bundles.get(room.room_id)?.room ?? room;
      this.onRoomClick?.(live);
      this.onZoneAction?.(live, "select");
    };

    let body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    let select: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    let chip: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

    if (useSprites) {
      const tKey = this.textureOrFallback(
        roomTextureKey(room.room_id, room.lock_state),
        roomFallbackTextureKey(room.lock_state),
      );
      body = this.add
        .image(cx, cy, tKey || "room_unforged")
        .setDisplaySize(ROOM_SIZE, ROOM_SIZE)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      body.on("pointerdown", onClick);

      select = this.add
        .image(cx, cy, "selection_outline")
        .setDisplaySize(ROOM_SIZE + 4, ROOM_SIZE + 4)
        .setDepth(4)
        .setVisible(false);

      const ck = chipTextureKey(room.agent_state);
      chip = this.add
        .image(cx + ROOM_SIZE / 2 - 8, cy - ROOM_SIZE / 2 + 8, ck)
        .setDisplaySize(12, 12)
        .setDepth(5);
    } else {
      body = this.add
        .rectangle(cx, cy, ROOM_SIZE, ROOM_SIZE, PALETTE.stone, 1)
        .setStrokeStyle(1, PALETTE.stoneDim, 1)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      body.on("pointerdown", onClick);

      select = this.add
        .rectangle(cx, cy, ROOM_SIZE + 6, ROOM_SIZE + 6, PALETTE.neonCyan, 0)
        .setStrokeStyle(2, PALETTE.neonCyan, 0.9)
        .setDepth(1)
        .setVisible(false);

      chip = this.add
        .circle(cx + ROOM_SIZE / 2 - 8, cy - ROOM_SIZE / 2 + 8, 5, PALETTE.neonCyan)
        .setDepth(3);
    }

    const label = this.add
      .text(cx, cy + ROOM_SIZE / 2 + 10, room.name, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e8ecf1",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    label.on("pointerdown", onClick);

    const sub = this.add
      .text(cx, cy + ROOM_SIZE / 2 + 24, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#8b93a7",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    sub.on("pointerdown", onClick);

    const bundle: RoomSpriteBundle = {
      room,
      body,
      select,
      chip,
      label,
      sub,
      useSprites,
    };
    this.bundles.set(room.room_id, bundle);
    this.styleBundle(bundle);
  }

  private styleBundle(b: RoomSpriteBundle) {
    const { room, body, select, chip, label, sub, useSprites } = b;
    const unforged = room.lock_state === "UNFORGED";
    const locked = room.lock_state === "locked";
    const selected = this.selectedId === room.room_id;
    const waiting =
      room.agent_state === "waiting_human" ||
      (room.lock_state === "UNFORGED" && room.spec_status === "draft");

    const seat =
      getSeatByRoomId(room.room_id) ||
      getSeatByAgentId(room.occupant_agent_id);

    if (useSprites && body instanceof Phaser.GameObjects.Image) {
      const key = this.textureOrFallback(
        roomTextureKey(room.room_id, room.lock_state),
        roomFallbackTextureKey(room.lock_state),
      );
      if (key && body.texture.key !== key) {
        body.setTexture(key);
        body.setDisplaySize(ROOM_SIZE, ROOM_SIZE);
      }
      body.setAlpha(unforged && !room.agent_real ? 0.92 : 1);
      label.setColor(unforged ? "#8b93a7" : "#e8ecf1");

      if (select instanceof Phaser.GameObjects.Image) {
        select.setVisible(selected || waiting);
        if (selected) {
          select.setTint(PALETTE.neonMagenta);
          select.setAlpha(1);
        } else if (waiting) {
          select.clearTint();
          select.setTint(PALETTE.neonAmber);
          select.setAlpha(0.85);
        } else {
          select.clearTint();
        }
      }

      if (chip instanceof Phaser.GameObjects.Image) {
        if (!room.occupant_agent_id) {
          chip.setVisible(false);
        } else {
          chip.setVisible(true);
          const ck = chipTextureKey(room.agent_state);
          if (this.textures.exists(ck)) chip.setTexture(ck);
          chip.setDisplaySize(12, 12);
          chip.setAlpha(room.agent_real ? 1 : 0.5);
        }
      }
    } else if (body instanceof Phaser.GameObjects.Rectangle) {
      if (unforged) {
        body.setFillStyle(PALETTE.stoneDim, 0.85);
        body.setStrokeStyle(1, PALETTE.seal, 0.7);
        label.setColor("#8b93a7");
      } else if (locked) {
        body.setFillStyle(PALETTE.stoneDim, 1);
        body.setStrokeStyle(2, PALETTE.textMuted, 0.8);
        label.setColor("#8b93a7");
      } else {
        body.setFillStyle(PALETTE.stoneLive, 1);
        body.setStrokeStyle(1, PALETTE.neonCyan, 0.5);
        label.setColor("#e8ecf1");
      }
      if (select instanceof Phaser.GameObjects.Rectangle) {
        select.setVisible(selected || waiting);
        if (selected) {
          select.setStrokeStyle(3, PALETTE.neonMagenta, 1);
        } else if (waiting) {
          select.setStrokeStyle(2, PALETTE.neonAmber, 0.9);
        }
      }
      if (chip instanceof Phaser.GameObjects.Arc) {
        if (!room.occupant_agent_id) {
          chip.setVisible(false);
        } else {
          chip.setVisible(true);
          chip.setFillStyle(
            stateColor(room.agent_state),
            room.agent_real ? 1 : 0.45,
          );
        }
      }
    }

    const lockBadge =
      room.lock_state === "UNFORGED"
        ? "SEALED"
        : room.lock_state === "locked"
          ? "LOCKED"
          : "LIVE";
    const reality = !room.occupant_agent_id
      ? "empty"
      : room.agent_real
        ? "real"
        : room.spec_status === "draft"
          ? "draft"
          : "candidate";
    const act = room.agent_state || "—";
    const seatHint = seat ? ` · ${seat.name}` : "";
    sub.setText(`${lockBadge} · ${reality} · ${act}${seatHint}`);
  }

  private drawEdges() {
    this.edgeGraphics.clear();
    if (!this.mapData || !this.pipeline.edges?.length) return;

    const byId = new Map(this.mapData.rooms.map((r) => [r.room_id, r]));
    this.edgeGraphics.lineStyle(1.5, PALETTE.neonMagenta, 0.35);

    for (const e of this.pipeline.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      this.edgeGraphics.lineBetween(a.x, a.y, b.x, b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.edgeGraphics.fillStyle(PALETTE.neonMagenta, 0.5);
      this.edgeGraphics.fillCircle(mx, my, 2);
    }
  }

  private fitCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    if (this.mapData?.rooms.length) {
      const xs = this.mapData.rooms.map((r) => r.x);
      const ys = this.mapData.rooms.map((r) => r.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      cam.centerOn(cx, cy);
    }
    cam.setZoom(1);
  }

  private refreshVignette() {
    const needs =
      this.mapData?.rooms.some((r) => r.agent_state === "waiting_human") ||
      false;
    if (needs) {
      this.vignette.setVisible(true);
      this.vignette.setFillStyle(PALETTE.neonAmber, 0.08);
    } else {
      this.vignette.setVisible(false);
    }
  }
}
