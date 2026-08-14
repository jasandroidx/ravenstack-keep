import Phaser from "phaser";
import type { CastleMapResponse, PipelineConfig, RoomChip } from "./types";
import {
  PALETTE,
  WORLD_ROOM_H,
  WORLD_ROOM_W,
  chipTextureKey,
  roomFallbackTextureKey,
  stateColor,
  worldRoomTextureKey,
} from "./palette";
import { getSeatByAgentId, getSeatByRoomId } from "./config/seats";
import { OFFICERS, officersInRoom } from "./hq";

export type RoomClickFn = (room: RoomChip) => void;
export type ZoneActionFn = (
  room: RoomChip,
  action: "select" | "path" | "cost" | "status",
) => void;

/** Room ids the world art ships interiors for. */
const WORLD_ROOMS = [
  "great-hall",
  "library",
  "alchemy-lab",
  "armory",
  "observatory",
  "vault",
  "round-table",
  "clock-tower",
  "kitchen",
  "roost",
  "gatehouse",
] as const;

const TILE = 48;
/** Pixel slack between rooms — where the conduit trenches run. */
const FLOOR_PAD = 220;

interface RoomSpriteBundle {
  room: RoomChip;
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  select: Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  useSprites: boolean;
}

interface AgentActor {
  agentId: string;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Arc;
  homeRoomId: string;
  bob?: Phaser.Tweens.Tween;
  walking: boolean;
}

/** px = ox + gx*sx ; py = oy - gy*sy  (mirrors http_api._grid_to_px) */
interface GridTransform {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
}

const DEFAULT_TRANSFORM: GridTransform = { ox: 420, oy: 360, sx: 200, sy: 170 };

/**
 * Top-down keep. Stone floor, conduit corridors, 160x136 room interiors and
 * officers standing at their posts — the map is a place, not a chip chart.
 *
 * Falls back to the old rectangle rendering if world art is missing, so a
 * half-deployed tree still draws something honest.
 */
export class KeepScene extends Phaser.Scene {
  private bundles = new Map<string, RoomSpriteBundle>();
  private actors = new Map<string, AgentActor>();
  private floor: Phaser.GameObjects.TileSprite | null = null;
  private corridorLayer: Phaser.GameObjects.Container | null = null;
  private edgeGraphics!: Phaser.GameObjects.Graphics;
  private mapData: CastleMapResponse | null = null;
  private gateAlert = false;
  private pipeline: PipelineConfig = { edges: [] };
  private onRoomClick: RoomClickFn | null = null;
  private onZoneAction: ZoneActionFn | null = null;
  private selectedId: string | null = null;
  private transform: GridTransform = DEFAULT_TRANSFORM;
  private worldW = 1000;
  private worldH = 700;
  private ready = false;
  private worldArt = false;
  private pending: { map: CastleMapResponse; pipeline: PipelineConfig } | null =
    null;

  constructor() {
    super({ key: "KeepScene" });
  }

  setRoomClickHandler(fn: RoomClickFn) {
    this.onRoomClick = fn;
  }

  setZoneActionHandler(fn: ZoneActionFn) {
    this.onZoneAction = fn;
  }

  emitZoneAction(action: "select" | "path" | "cost" | "status") {
    if (!this.selectedId || !this.mapData) return;
    const room = this.mapData.rooms.find((r) => r.room_id === this.selectedId);
    if (room) this.onZoneAction?.(room, action);
  }

  preload() {
    // --- Suikoden-HQ world art ---
    this.load.image("stone_floor", "/art/floor/stone_floor.png");
    this.load.image("corridor_h", "/art/floor/corridor_h.png");
    this.load.image("corridor_v", "/art/floor/corridor_v.png");
    this.load.image("corridor_x", "/art/floor/corridor_x.png");
    for (const id of WORLD_ROOMS) {
      this.load.image(`room_${id}`, `/art/rooms/room_${id}.png`);
      this.load.image(`room_${id}_sealed`, `/art/rooms/room_${id}_sealed.png`);
      this.load.image(`room_${id}_locked`, `/art/rooms/room_${id}_locked.png`);
    }
    for (const o of OFFICERS) {
      this.load.image(`agent_${o.agentId}`, o.sprite);
    }

    // --- legacy 48x48 pack (chips still used for state dots) ---
    this.load.image("room_unforged", "/art/tiles/base/room_unforged_48.png");
    this.load.image("room_live", "/art/tiles/base/room_live_48.png");
    this.load.image("room_locked", "/art/tiles/base/room_locked_48.png");
    this.load.image("chip_idle", "/art/chips/chip_idle.png");
    this.load.image("chip_work", "/art/chips/chip_work.png");
    this.load.image("chip_wait", "/art/chips/chip_wait.png");
    this.load.image("chip_fail", "/art/chips/chip_fail.png");
    this.load.image("chip_retired", "/art/chips/chip_retired.png");

    // Missing files are tolerated — every draw path checks textures.exists().
    this.load.on("loaderror", (f: Phaser.Loader.File) => {
      console.debug(`[keep-art] missing ${f.key} (${f.url})`);
    });
  }

  create() {
    this.worldArt = this.textures.exists("stone_floor");
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    this.corridorLayer = this.add.container(0, 0).setDepth(1);
    this.edgeGraphics = this.add.graphics().setDepth(2);

    // Gate alert is drawn by CSS (body.gate-alert in hud.ts). A scroll-locked
    // Phaser rectangle does not survive camera zoom — it painted a band across
    // part of the map instead of a full-screen tint.

    if (!this.worldArt) {
      // No world art on disk — keep the old faint grid so the map is not void.
      const g = this.add.graphics().setDepth(-1).setAlpha(0.12);
      g.lineStyle(1, PALETTE.stone, 1);
      for (let x = 0; x < 1600; x += TILE) g.lineBetween(x, 0, x, 1000);
      for (let y = 0; y < 1000; y += TILE) g.lineBetween(0, y, 1600, y);
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
    this.transform = deriveTransform(map.rooms);

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
      this.syncActors();
      this.drawEdges();
      this.refreshVignette();
      return;
    }

    this.rebuildWorld();
    this.drawEdges();
    this.fitCamera();
  }

  updateMap(map: CastleMapResponse) {
    this.mapData = map;
    let missing = false;
    for (const room of map.rooms) {
      const b = this.bundles.get(room.room_id);
      if (b) {
        b.room = room;
        this.styleBundle(b);
      } else {
        missing = true;
        break;
      }
    }
    if (missing) this.rebuildWorld();
    else this.syncActors();
    this.refreshVignette();
  }

  setSelected(roomId: string | null) {
    this.selectedId = roomId;
    for (const b of this.bundles.values()) this.styleBundle(b);
  }

  focusRoom(roomId: string) {
    const b = this.bundles.get(roomId);
    if (!b) return;
    this.cameras.main.pan(b.room.x, b.room.y, 250, "Sine.easeInOut");
  }

  // -------------------------------------------------------------------------
  // World build
  // -------------------------------------------------------------------------

  private rebuildWorld() {
    for (const b of this.bundles.values()) {
      b.body.destroy();
      b.select.destroy();
      b.chip.destroy();
      b.label.destroy();
      b.sub.destroy();
    }
    this.bundles.clear();
    for (const a of this.actors.values()) {
      a.bob?.remove();
      a.sprite.destroy();
      a.glow.destroy();
    }
    this.actors.clear();
    if (!this.mapData) return;

    const xs = this.mapData.rooms.map((r) => r.x);
    const ys = this.mapData.rooms.map((r) => r.y);
    const minX = Math.min(...xs) - FLOOR_PAD;
    const minY = Math.min(...ys) - FLOOR_PAD;
    const maxX = Math.max(...xs) + FLOOR_PAD;
    const maxY = Math.max(...ys) + FLOOR_PAD;

    this.worldW = maxX - minX;
    this.worldH = maxY - minY;

    // Stone floor across the whole keep footprint — this is what kills the void.
    this.floor?.destroy();
    this.floor = null;
    if (this.worldArt) {
      // Overdraw far past the camera bounds: at zoom < 1 the viewport shows
      // more world than the bounds rect, and any gap reads as the old void.
      const over = 1600;
      this.floor = this.add
        .tileSprite(
          minX - over,
          minY - over,
          this.worldW + over * 2,
          this.worldH + over * 2,
          "stone_floor",
        )
        .setOrigin(0, 0)
        .setDepth(0);
    }

    this.drawCorridors();

    for (const room of this.mapData.rooms) this.spawnRoom(room);
    this.syncActors();
    this.refreshVignette();
  }

  /** Conduit trenches between grid-adjacent rooms. */
  private drawCorridors() {
    const layer = this.corridorLayer;
    if (!layer || !this.mapData) return;
    layer.removeAll(true);
    if (!this.worldArt) return;

    const rooms = this.mapData.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const link = adjacency(a, b, this.transform);
        if (!link) continue;

        if (link === "h") {
          const [left, right] = a.x < b.x ? [a, b] : [b, a];
          const x0 = left.x + WORLD_ROOM_W / 2;
          const x1 = right.x - WORLD_ROOM_W / 2;
          const w = x1 - x0;
          if (w <= 0) continue;
          layer.add(
            this.add
              .tileSprite(x0, left.y - TILE / 2, w, TILE, "corridor_h")
              .setOrigin(0, 0),
          );
        } else {
          const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
          const y0 = top.y + WORLD_ROOM_H / 2;
          const y1 = bottom.y - WORLD_ROOM_H / 2;
          const h = y1 - y0;
          if (h <= 0) continue;
          layer.add(
            this.add
              .tileSprite(top.x - TILE / 2, y0, TILE, h, "corridor_v")
              .setOrigin(0, 0),
          );
        }
      }
    }
  }

  private spawnRoom(room: RoomChip) {
    const cx = room.x;
    const cy = room.y;
    const worldKey = worldRoomTextureKey(room.room_id, room.lock_state);
    const useSprites = this.worldArt && this.textures.exists(worldKey);

    const onClick = () => {
      const live = this.bundles.get(room.room_id)?.room ?? room;
      this.onRoomClick?.(live);
      this.onZoneAction?.(live, "select");
    };

    let body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (useSprites) {
      body = this.add
        .image(cx, cy, worldKey)
        .setDisplaySize(WORLD_ROOM_W, WORLD_ROOM_H)
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
    } else {
      const legacy = roomFallbackTextureKey(room.lock_state);
      if (this.textures.exists(legacy)) {
        body = this.add
          .image(cx, cy, legacy)
          .setDisplaySize(WORLD_ROOM_W, WORLD_ROOM_H)
          .setDepth(3)
          .setInteractive({ useHandCursor: true });
      } else {
        body = this.add
          .rectangle(cx, cy, WORLD_ROOM_W, WORLD_ROOM_H, PALETTE.stone, 1)
          .setStrokeStyle(1, PALETTE.stoneDim, 1)
          .setDepth(3)
          .setInteractive({ useHandCursor: true });
      }
    }
    body.on("pointerdown", onClick);

    const select = this.add
      .rectangle(cx, cy, WORLD_ROOM_W + 8, WORLD_ROOM_H + 8, PALETTE.neonCyan, 0)
      .setStrokeStyle(2, PALETTE.neonCyan, 0.9)
      .setDepth(4)
      .setVisible(false);

    const chipX = cx + WORLD_ROOM_W / 2 - 12;
    const chipY = cy - WORLD_ROOM_H / 2 + 12;
    const ck = chipTextureKey(room.agent_state);
    const chip: Phaser.GameObjects.Image | Phaser.GameObjects.Arc =
      this.textures.exists(ck)
        ? this.add.image(chipX, chipY, ck).setDisplaySize(14, 14).setDepth(8)
        : this.add.circle(chipX, chipY, 6, PALETTE.neonCyan).setDepth(8);

    const label = this.add
      .text(cx, cy + WORLD_ROOM_H / 2 + 6, room.name, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e8ecf1",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    label.on("pointerdown", onClick);

    const sub = this.add
      .text(cx, cy + WORLD_ROOM_H / 2 + 20, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#8b93a7",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(9)
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
    const { room, body, select, chip, label, sub } = b;
    const unforged = room.lock_state === "UNFORGED";
    const locked = room.lock_state === "locked";
    const selected = this.selectedId === room.room_id;
    const waiting =
      room.agent_state === "waiting_human" ||
      (unforged && room.spec_status === "draft");

    const seat =
      getSeatByRoomId(room.room_id) || getSeatByAgentId(room.occupant_agent_id);

    if (body instanceof Phaser.GameObjects.Image) {
      const key = worldRoomTextureKey(room.room_id, room.lock_state);
      if (this.textures.exists(key) && body.texture.key !== key) {
        body.setTexture(key);
        body.setDisplaySize(WORLD_ROOM_W, WORLD_ROOM_H);
      }
      body.setAlpha(1);
    } else if (body instanceof Phaser.GameObjects.Rectangle) {
      if (unforged) body.setFillStyle(PALETTE.stoneDim, 0.9);
      else if (locked) body.setFillStyle(PALETTE.stoneDim, 1);
      else body.setFillStyle(PALETTE.stoneLive, 1);
    }

    label.setColor(unforged || locked ? "#8b93a7" : "#e8ecf1");

    select.setVisible(selected || waiting);
    select.setStrokeStyle(
      selected ? 3 : 2,
      selected ? PALETTE.neonMagenta : PALETTE.neonAmber,
      selected ? 1 : 0.9,
    );

    if (!room.occupant_agent_id) {
      chip.setVisible(false);
    } else {
      chip.setVisible(true);
      if (chip instanceof Phaser.GameObjects.Image) {
        const ck = chipTextureKey(room.agent_state);
        if (this.textures.exists(ck)) chip.setTexture(ck);
        chip.setDisplaySize(14, 14);
        chip.setAlpha(room.agent_real ? 1 : 0.5);
      } else {
        chip.setFillStyle(
          stateColor(room.agent_state),
          room.agent_real ? 1 : 0.45,
        );
      }
    }

    const lockBadge = unforged ? "SEALED" : locked ? "LOCKED" : "LIVE";
    const reality = !room.occupant_agent_id
      ? "empty"
      : room.agent_real
        ? "real"
        : room.spec_status === "draft"
          ? "draft"
          : "candidate";
    const act = room.agent_state || "—";
    // Rooms sit 200px apart; a long sub-label overlaps its neighbour.
    const who = seat?.name ?? "";
    const full =
      `${lockBadge} · ${reality}` +
      (act !== "—" ? ` · ${act}` : "") +
      (who ? ` · ${who}` : "");
    sub.setText(full.length > 30 ? `${full.slice(0, 29)}…` : full);
  }

  // -------------------------------------------------------------------------
  // Officers
  // -------------------------------------------------------------------------

  /** Place / refresh an officer sprite for each room that has one posted. */
  private syncActors() {
    if (!this.mapData) return;
    const roomById = new Map(this.mapData.rooms.map((r) => [r.room_id, r]));

    for (const officer of OFFICERS) {
      const room = roomById.get(officer.roomId);
      const key = `agent_${officer.agentId}`;
      if (!room || !this.textures.exists(key)) continue;

      const peers = officersInRoom(officer.roomId);
      const idx = peers.findIndex((p) => p.agentId === officer.agentId);
      const spread = peers.length > 1 ? (idx - (peers.length - 1) / 2) * 34 : 0;
      const px = room.x + spread;
      const py = room.y + WORLD_ROOM_H / 2 - 26;

      let actor = this.actors.get(officer.agentId);
      if (!actor) {
        const glow = this.add
          .circle(px, py + 12, 10, stateColor(room.agent_state), 0.18)
          .setDepth(5);
        const sprite = this.add
          .image(px, py, key)
          .setDisplaySize(32, 32)
          .setDepth(6);
        const bob = this.tweens.add({
          targets: sprite,
          y: py - 2,
          duration: 1400 + idx * 180,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        actor = {
          agentId: officer.agentId,
          sprite,
          glow,
          homeRoomId: officer.roomId,
          bob,
          walking: false,
        };
        this.actors.set(officer.agentId, actor);
      }

      actor.homeRoomId = officer.roomId;
      if (!actor.walking) {
        actor.sprite.setPosition(px, py);
        actor.glow.setPosition(px, py + 12);
      }

      // Sealed wings: the officer is a ghost until the room is forged.
      const sealed = room.lock_state !== "live";
      actor.sprite.setAlpha(sealed ? 0.35 : 1);
      actor.glow.setFillStyle(stateColor(room.agent_state), sealed ? 0.06 : 0.2);
    }
  }

  /** World-pixel centre of a grid cell (mirrors the server transform). */
  cellToPixel(cell: [number, number]): { x: number; y: number } {
    const t = this.transform;
    return { x: t.ox + cell[0] * t.sx, y: t.oy - cell[1] * t.sy };
  }

  hasActor(agentId: string): boolean {
    return this.actors.has(agentId);
  }

  /**
   * Walk an officer along real path cells from get_path.
   * Returns a promise that resolves when the walk finishes (or immediately if
   * there is nothing to draw — we never pretend a walk happened).
   */
  walkAgentCells(
    agentId: string,
    cells: Array<[number, number]>,
    opts: { stepMs?: number; release?: boolean } = {},
  ): Promise<boolean> {
    const actor = this.actors.get(agentId);
    if (!actor || cells.length < 2) return Promise.resolve(false);

    // release=false keeps the officer where the leg ended, so a multi-leg walk
    // does not snap home between legs (which silently made leg 2 a no-op).
    const stepMs = opts.stepMs ?? 700;
    const release = opts.release !== false;

    actor.walking = true;
    actor.bob?.pause();

    const points = cells.map((c) => this.cellToPixel(c));
    // Stand near the doorway, not dead centre of the wall art.
    const yOffset = WORLD_ROOM_H / 2 - 26;

    return new Promise((resolve) => {
      let i = 0;
      const stepTo = () => {
        i++;
        if (i >= points.length) {
          if (release) {
            actor.walking = false;
            actor.bob?.resume();
            this.syncActors();
          }
          resolve(true);
          return;
        }
        const p = points[i];
        this.tweens.add({
          targets: [actor.sprite],
          x: p.x,
          y: p.y + yOffset,
          duration: stepMs,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            actor.glow.setPosition(actor.sprite.x, actor.sprite.y + 12);
          },
          onComplete: stepTo,
        });
      };
      stepTo();
    });
  }

  /** Pan the camera to follow an officer for the length of a walk. */
  followAgent(agentId: string, on: boolean) {
    const actor = this.actors.get(agentId);
    if (!actor) return;
    if (on) this.cameras.main.startFollow(actor.sprite, true, 0.06, 0.06);
    else this.cameras.main.stopFollow();
  }

  private drawEdges() {
    this.edgeGraphics.clear();
    if (!this.mapData || !this.pipeline.edges?.length) return;
    const byId = new Map(this.mapData.rooms.map((r) => [r.room_id, r]));
    this.edgeGraphics.lineStyle(1.5, PALETTE.neonMagenta, 0.22);
    for (const e of this.pipeline.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      this.edgeGraphics.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  private fitCamera() {
    const cam = this.cameras.main;
    if (!this.mapData?.rooms.length) return;
    const xs = this.mapData.rooms.map((r) => r.x);
    const ys = this.mapData.rooms.map((r) => r.y);
    const minX = Math.min(...xs) - FLOOR_PAD;
    const minY = Math.min(...ys) - FLOOR_PAD;
    const maxX = Math.max(...xs) + FLOOR_PAD;
    const maxY = Math.max(...ys) + FLOOR_PAD;
    cam.setBounds(minX, minY, maxX - minX, maxY - minY);
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2);

    // Zoom out enough that the whole keep is on screen.
    const zx = this.scale.width / (maxX - minX);
    const zy = this.scale.height / (maxY - minY);
    cam.setZoom(Math.min(1, Math.max(0.4, Math.min(zx, zy))));
  }

  /** Gate alert -> CSS class on <body>; survives camera zoom, unlike a
   *  scroll-locked Phaser rectangle. */
  private refreshVignette() {
    const needs =
      this.mapData?.rooms.some((r) => r.agent_state === "waiting_human") || false;
    if (needs === this.gateAlert) return;
    this.gateAlert = needs;
    document.body.classList.toggle("gate-alert", needs);
  }
}

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

function gridOf(r: RoomChip): [number, number] | null {
  const g = r.grid;
  if (Array.isArray(g) && g.length === 2 && typeof g[0] === "number") {
    return [g[0], g[1]];
  }
  return null;
}

/**
 * Recover the server's grid→pixel transform from the rooms themselves, so the
 * client never hardcodes constants that live may have changed.
 */
export function deriveTransform(rooms: RoomChip[]): GridTransform {
  const withGrid = rooms
    .map((r) => ({ g: gridOf(r), x: r.x, y: r.y }))
    .filter((r): r is { g: [number, number]; x: number; y: number } => !!r.g);

  if (withGrid.length < 2) return DEFAULT_TRANSFORM;

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < withGrid.length && (!sx || !sy); i++) {
    for (let j = i + 1; j < withGrid.length; j++) {
      const a = withGrid[i];
      const b = withGrid[j];
      const dgx = b.g[0] - a.g[0];
      const dgy = b.g[1] - a.g[1];
      if (!sx && dgx !== 0 && b.g[1] === a.g[1]) sx = (b.x - a.x) / dgx;
      if (!sy && dgy !== 0 && b.g[0] === a.g[0]) sy = -(b.y - a.y) / dgy;
    }
  }
  if (!sx) sx = DEFAULT_TRANSFORM.sx;
  if (!sy) sy = DEFAULT_TRANSFORM.sy;

  const base = withGrid[0];
  return {
    sx,
    sy,
    ox: base.x - base.g[0] * sx,
    oy: base.y + base.g[1] * sy,
  };
}

/** "h" | "v" if the two rooms are neighbours on the grid, else null. */
function adjacency(
  a: RoomChip,
  b: RoomChip,
  t: GridTransform,
): "h" | "v" | null {
  const ga = gridOf(a);
  const gb = gridOf(b);
  if (ga && gb) {
    const dx = Math.abs(ga[0] - gb[0]);
    const dy = Math.abs(ga[1] - gb[1]);
    if (dx === 1 && dy === 0) return "h";
    if (dy === 1 && dx === 0) return "v";
    return null;
  }
  // No grid in the payload — fall back to pixel spacing.
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dy < 4 && Math.abs(dx - t.sx) < 4) return "h";
  if (dx < 4 && Math.abs(dy - t.sy) < 4) return "v";
  return null;
}
