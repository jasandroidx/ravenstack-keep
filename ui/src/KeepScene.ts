import Phaser from "phaser";
import type { CastleMapResponse, PipelineConfig, RoomChip } from "./types";
import { PALETTE, ROOM_SIZE, stateColor } from "./palette";

export type RoomClickFn = (room: RoomChip) => void;

interface RoomSpriteBundle {
  room: RoomChip;
  body: Phaser.GameObjects.Rectangle;
  rim: Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
}

/**
 * Top-down fortress map. Coords from castle_map.json (SOT).
 * 48×48 room bodies; UNFORGED dimmed; live lit with neon rim.
 */
export class KeepScene extends Phaser.Scene {
  private bundles = new Map<string, RoomSpriteBundle>();
  private edgeGraphics!: Phaser.GameObjects.Graphics;
  private mapData: CastleMapResponse | null = null;
  private pipeline: PipelineConfig = { edges: [] };
  private onRoomClick: RoomClickFn | null = null;
  private selectedId: string | null = null;
  private vignette!: Phaser.GameObjects.Rectangle;
  private worldW = 1000;
  private worldH = 700;
  private ready = false;
  private pending: { map: CastleMapResponse; pipeline: PipelineConfig } | null =
    null;

  constructor() {
    super({ key: "KeepScene" });
  }

  setRoomClickHandler(fn: RoomClickFn) {
    this.onRoomClick = fn;
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.edgeGraphics = this.add.graphics().setDepth(0);

    this.vignette = this.add
      .rectangle(0, 0, this.scale.width * 2, this.scale.height * 2, PALETTE.neonAmber, 0)
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

    // Subtle grid
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
    // Incremental update when room set is stable (avoids selection flicker on poll).
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
    // refresh chips without full destroy if possible
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

  /** Pan camera so a room is centered (e.g. gate card click). */
  focusRoom(roomId: string) {
    const b = this.bundles.get(roomId);
    if (!b) return;
    this.cameras.main.pan(b.room.x, b.room.y, 250, "Sine.easeInOut");
  }

  private rebuildRooms() {
    for (const b of this.bundles.values()) {
      b.body.destroy();
      b.rim.destroy();
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

  private spawnRoom(room: RoomChip) {
    const cx = room.x;
    const cy = room.y;
    const rim = this.add
      .rectangle(cx, cy, ROOM_SIZE + 6, ROOM_SIZE + 6, PALETTE.neonCyan, 0)
      .setStrokeStyle(2, PALETTE.neonCyan, 0.9)
      .setDepth(1);
    const body = this.add
      .rectangle(cx, cy, ROOM_SIZE, ROOM_SIZE, PALETTE.stone, 1)
      .setStrokeStyle(1, PALETTE.stoneDim, 1)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });

    const onClick = () => {
      const live = this.bundles.get(room.room_id)?.room ?? room;
      this.onRoomClick?.(live);
    };
    body.on("pointerdown", onClick);

    const chip = this.add
      .circle(cx + ROOM_SIZE / 2 - 8, cy - ROOM_SIZE / 2 + 8, 5, PALETTE.neonCyan)
      .setDepth(3);

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

    const bundle: RoomSpriteBundle = { room, body, rim, chip, label, sub };
    this.bundles.set(room.room_id, bundle);
    this.styleBundle(bundle);
  }

  private styleBundle(b: RoomSpriteBundle) {
    const { room, body, rim, chip, label, sub } = b;
    const unforged = room.lock_state === "UNFORGED";
    const locked = room.lock_state === "locked";
    const selected = this.selectedId === room.room_id;
    const waiting =
      room.agent_state === "waiting_human" ||
      (room.lock_state === "UNFORGED" && room.spec_status === "draft");

    if (unforged) {
      body.setFillStyle(PALETTE.stoneDim, 0.85);
      body.setStrokeStyle(1, PALETTE.seal, 0.7);
      rim.setStrokeStyle(1, PALETTE.seal, 0.35);
      rim.setVisible(true);
      label.setColor("#8b93a7");
    } else if (locked) {
      body.setFillStyle(PALETTE.stoneDim, 1);
      body.setStrokeStyle(2, PALETTE.textMuted, 0.8);
      rim.setVisible(false);
      label.setColor("#8b93a7");
    } else {
      body.setFillStyle(PALETTE.stoneLive, 1);
      body.setStrokeStyle(1, PALETTE.neonCyan, 0.5);
      rim.setStrokeStyle(2, PALETTE.neonCyan, 0.85);
      rim.setVisible(true);
      label.setColor("#e8ecf1");
    }

    if (selected) {
      rim.setStrokeStyle(3, PALETTE.neonMagenta, 1);
      rim.setVisible(true);
    }

    // Status chip
    if (!room.occupant_agent_id) {
      chip.setVisible(false);
    } else {
      chip.setVisible(true);
      const c = stateColor(room.agent_state);
      chip.setFillStyle(c, room.agent_real ? 1 : 0.45);
      if (!room.agent_real) {
        chip.setStrokeStyle(1, PALETTE.textMuted, 0.9);
      } else {
        chip.setStrokeStyle(0);
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
    sub.setText(`${lockBadge} · ${reality} · ${act}`);

    if (waiting && !selected) {
      rim.setStrokeStyle(2, PALETTE.neonAmber, 0.9);
      rim.setVisible(true);
    }
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
      // small arrow mid
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.edgeGraphics.fillStyle(PALETTE.neonMagenta, 0.5);
      this.edgeGraphics.fillCircle(mx, my, 2);
    }
  }

  private fitCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    // Center on map content
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
    // gates handled by HUD; room-level waiting still soft-glows vignette
    if (needs) {
      this.vignette.setVisible(true);
      this.vignette.setFillStyle(PALETTE.neonAmber, 0.08);
    } else {
      this.vignette.setVisible(false);
    }
  }
}
