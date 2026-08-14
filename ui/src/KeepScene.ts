import Phaser from "phaser";
import type {
  CastleMapResponse,
  PathResponse,
  PipelineConfig,
  RoomChip,
} from "./types";
import {
  AGENT_SIZE,
  PALETTE,
  ROOM_HALF,
  ROOM_SIZE,
  activityIconKey,
  agentTextureKey,
  chipTextureKey,
  facadeTextureKey,
  gridToPx,
  roomFallbackTextureKey,
  roomTextureKey,
  stateColor,
  tierBadgeKey,
} from "./palette";

export type RoomClickFn = (room: RoomChip) => void;
export type PathFetchFn = (
  fromRoom: string,
  toRoom: string,
) => Promise<PathResponse | null>;

/** Free-moving agent (walks corridors; not stuck to room center). */
interface FreeAgent {
  agentId: string;
  homeRoomId: string;
  visualRoomId: string;
  sprite: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Image | Phaser.GameObjects.Arc | null;
  bubbleBg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | null;
  bubbleText: Phaser.GameObjects.Text | null;
  walking: boolean;
  walkChain?: Phaser.Tweens.TweenChain | Phaser.Tweens.Tween;
  bobTween?: Phaser.Tweens.Tween;
  roamTween?: Phaser.Tweens.Tween;
  state: string | null;
  task: string | null;
  agentReal: boolean;
  spriteHint: string | null;
}

interface RoomSpriteBundle {
  room: RoomChip;
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  select: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  chip: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  agent: Phaser.GameObjects.Image | null;
  aura: Phaser.GameObjects.Image | Phaser.GameObjects.Arc | null;
  shadow: Phaser.GameObjects.Rectangle;
  halo: Phaser.GameObjects.Rectangle;
  /** Dark plate behind in-tile name banner */
  namePlate: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  /** Compact status chip inside room bottom edge */
  statusPlate: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  /** Amber gate alert above room when pending human action */
  gateAlert: Phaser.GameObjects.Image | Phaser.GameObjects.Text | null;
  bubble?: Phaser.GameObjects.Container | null;
  bubbleBg?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | null;
  bubbleText?: Phaser.GameObjects.Text | null;
  activityIcon?: Phaser.GameObjects.Image | null;
  tierBadge?: Phaser.GameObjects.Image | null;
  useSprites: boolean;
  bobTween?: Phaser.Tweens.Tween;
  auraTween?: Phaser.Tweens.Tween;
  workTween?: Phaser.Tweens.Tween;
  haloTween?: Phaser.Tweens.Tween;
  gateTween?: Phaser.Tweens.Tween;
  roamTween?: Phaser.Tweens.Tween;
  baseAgentX: number;
  baseAgentY: number;
}

/** Spatial Keep rooms with interior art packs. */
const INTERIOR_ROOMS = [
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

const FACADE_ROOMS = [
  "oracle",
  "orchestrator",
  "clawforge",
  "scribe",
  "auditor",
  "suno_studio",
  "flipper",
  "lead_forge",
] as const;

/** Default adjacency if pipeline edges miss (Manhattan grid neighbors). */
const SPATIAL_EDGES: Array<{ from: string; to: string; label: string }> = [
  { from: "great-hall", to: "library", label: "command → knowledge" },
  { from: "great-hall", to: "armory", label: "command → tools" },
  { from: "library", to: "alchemy-lab", label: "knowledge → forge" },
  { from: "armory", to: "alchemy-lab", label: "tools → forge" },
  { from: "alchemy-lab", to: "observatory", label: "forge → sky" },
  { from: "great-hall", to: "vault", label: "command → secrets" },
  { from: "great-hall", to: "gatehouse", label: "command → gate" },
  { from: "great-hall", to: "kitchen", label: "command → hearth" },
  { from: "armory", to: "clock-tower", label: "tools → bells" },
  { from: "library", to: "roost", label: "knowledge → scouts" },
  { from: "alchemy-lab", to: "round-table", label: "forge → council" },
  { from: "clock-tower", to: "observatory", label: "bells → sky" },
];

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3.25;
const ZOOM_STEP = 1.12; // multiplicative step for buttons / keys

/**
 * Top-down fortress map. Coords from castle_map (SOT).
 * v4: interiors + corridors + wheel/button zoom + drag pan.
 */
export class KeepScene extends Phaser.Scene {
  private bundles = new Map<string, RoomSpriteBundle>();
  private edgeGraphics!: Phaser.GameObjects.Graphics;
  private corridorLayer!: Phaser.GameObjects.Container;
  private pulseNodes: Phaser.GameObjects.Arc[] = [];
  private mapData: CastleMapResponse | null = null;
  private pipeline: PipelineConfig = { edges: [] };
  private onRoomClick: RoomClickFn | null = null;
  private selectedId: string | null = null;
  private vignette!: Phaser.GameObjects.Rectangle;
  private worldW = 1200;
  private worldH = 900;
  private ready = false;
  private artLoaded = false;
  private pulseT = 0;
  private pending: { map: CastleMapResponse; pipeline: PipelineConfig } | null =
    null;
  /** User has adjusted zoom/pan — don't stomp on map refresh. */
  private userCamera = false;
  private defaultZoom = 1.25;
  private isPanning = false;
  private panLastX = 0;
  private panLastY = 0;
  private spaceDown = false;
  private onZoomChange: ((zoom: number) => void) | null = null;
  /** room_ids (or occupant subjects mapped) that have pending human gates */
  private gatedRoomIds = new Set<string>();
  /** Free agents that walk the pipes */
  private freeAgents = new Map<string, FreeAgent>();
  private pathFetcher: PathFetchFn | null = null;
  private trailGraphics: Phaser.GameObjects.Graphics | null = null;
  /** Interior command focus — one room dominates the view */
  private chamberRoomId: string | null = null;
  private chamberDim: Phaser.GameObjects.Rectangle | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  } | null = null;
  /** World units per second at zoom 1 (scales with zoom so feel stays consistent). */
  private panSpeed = 420;

  constructor() {
    super({ key: "KeepScene" });
  }

  setRoomClickHandler(fn: RoomClickFn) {
    this.onRoomClick = fn;
  }

  setZoomChangeHandler(fn: (zoom: number) => void) {
    this.onZoomChange = fn;
  }

  setPathFetcher(fn: PathFetchFn) {
    this.pathFetcher = fn;
  }

  /** External zoom controls (+ / − / reset). */
  zoomBy(factor: number) {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2 / cam.zoom;
    const cy = cam.scrollY + cam.height / 2 / cam.zoom;
    this.applyZoomAt(cam.zoom * factor, cx, cy);
  }

  zoomReset() {
    this.userCamera = false;
    this.fitCamera();
  }

  getZoom(): number {
    return this.cameras.main.zoom;
  }

  preload() {
    this.load.image("stone_floor", "/art/floor/stone_floor.png");
    this.load.image("corridor_h", "/art/floor/corridor_h.png");
    this.load.image("corridor_v", "/art/floor/corridor_v.png");
    this.load.image("room_unforged", "/art/tiles/base/room_unforged_48.png");
    this.load.image("room_live", "/art/tiles/base/room_live_48.png");
    this.load.image("room_locked", "/art/tiles/base/room_locked_48.png");
    for (const id of INTERIOR_ROOMS) {
      this.load.image(`room_${id}`, `/art/rooms/room_${id}.png`);
      this.load.image(`room_${id}_sealed`, `/art/rooms/room_${id}_sealed.png`);
    }
    this.load.image("agent_raziel", "/art/agents/agent_raziel.png");
    this.load.image("agent_oracle", "/art/agents/agent_oracle.png");
    this.load.image("agent_clawforge", "/art/agents/agent_clawforge.png");
    this.load.image("agent_corvid", "/art/agents/agent_corvid.png");
    this.load.image("agent_scribe", "/art/agents/agent_scribe.png");
    this.load.image("agent_generic", "/art/agents/agent_generic.png");
    this.load.image("icon_work", "/art/objects/icon_work.png");
    this.load.image("icon_idle", "/art/objects/icon_idle.png");
    this.load.image("icon_wait", "/art/objects/icon_wait.png");
    this.load.image("badge_local", "/art/objects/badge_local.png");
    this.load.image("badge_escalate", "/art/objects/badge_escalate.png");
    this.load.image("badge_god", "/art/objects/badge_god.png");
    this.load.image("speech_bubble", "/art/objects/speech_bubble.png");
    this.load.image("progress_bar", "/art/objects/progress_bar.png");
    this.load.image("rune_glow", "/art/objects/rune_glow.png");
    this.load.image("chip_idle", "/art/chips/chip_idle.png");
    this.load.image("chip_work", "/art/chips/chip_work.png");
    this.load.image("chip_wait", "/art/chips/chip_wait.png");
    this.load.image("chip_fail", "/art/chips/chip_fail.png");
    this.load.image("chip_retired", "/art/chips/chip_retired.png");
    this.load.image("selection_outline", "/art/hud/selection_outline.png");
    this.load.image("door_marker", "/art/hud/door_marker.png");
    this.load.image("agent_aura", "/art/hud/agent_aura.png");
    this.load.image("conduit_node", "/art/hud/conduit_node.png");
    this.load.image("gate_alert", "/art/hud/gate_alert.png");
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
    this.load.on("loaderror", () => {
      /* optional art missing is fine */
    });
  }

  create() {
    this.artLoaded =
      this.textures.exists("room_great-hall") ||
      this.textures.exists("room_live");
    this.cameras.main.setBackgroundColor(PALETTE.bg);

    if (this.textures.exists("stone_floor")) {
      this.add
        .tileSprite(0, 0, 2400, 1800, "stone_floor")
        .setOrigin(0, 0)
        .setDepth(-3)
        .setAlpha(0.55);
    }

    this.corridorLayer = this.add.container(0, 0).setDepth(0);
    this.edgeGraphics = this.add.graphics().setDepth(0.5);

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

    const g = this.add.graphics().setDepth(-2).setAlpha(0.08);
    g.lineStyle(1, PALETTE.stone, 1);
    for (let x = 0; x < 2400; x += 56) g.lineBetween(x, 0, x, 1800);
    for (let y = 0; y < 1800; y += 56) g.lineBetween(0, y, 2400, y);

    this.setupCameraControls();

    this.ready = true;
    if (this.pending) {
      const { map, pipeline } = this.pending;
      this.pending = null;
      this.applyMap(map, pipeline);
    }
  }

  private setupCameraControls() {
    // Stop page scroll while zooming over the canvas
    const canvas = this.game.canvas;
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
      },
      { passive: false },
    );
    canvas.style.touchAction = "none";

    // Wheel zoom toward pointer
    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _gos: unknown,
        _dx: number,
        dy: number,
      ) => {
        if (!this.ready) return;
        const factor = dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.applyZoomAt(this.cameras.main.zoom * factor, world.x, world.y);
      },
    );

    // Drag pan: middle mouse, right mouse, or Space+left drag
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const panBtn =
        pointer.middleButtonDown() ||
        pointer.rightButtonDown() ||
        (pointer.leftButtonDown() && this.spaceDown);
      if (!panBtn) return;
      this.isPanning = true;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
      this.input.setDefaultCursor("grabbing");
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.isPanning || !pointer.isDown) return;
      const cam = this.cameras.main;
      const dx = (pointer.x - this.panLastX) / cam.zoom;
      const dy = (pointer.y - this.panLastY) / cam.zoom;
      cam.scrollX -= dx;
      cam.scrollY -= dy;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
      this.userCamera = true;
    });

    this.input.on("pointerup", () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.input.setDefaultCursor("default");
      }
    });

    // Disable context menu on canvas (right-drag pan)
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keyboard: arrows/WASD pan, +/− zoom, 0 reset, Space drag-pan
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };

      this.input.keyboard.on("keydown-PLUS", () => this.zoomBy(ZOOM_STEP));
      this.input.keyboard.on("keydown-NUMPAD_ADD", () => this.zoomBy(ZOOM_STEP));
      this.input.keyboard.on("keydown-MINUS", () => this.zoomBy(1 / ZOOM_STEP));
      this.input.keyboard.on("keydown-NUMPAD_SUBTRACT", () =>
        this.zoomBy(1 / ZOOM_STEP),
      );
      this.input.keyboard.on("keydown-ZERO", () => this.zoomReset());
      this.input.keyboard.on("keydown-NUMPAD_ZERO", () => this.zoomReset());
      this.input.keyboard.on("keydown-EQUALS", () => this.zoomBy(ZOOM_STEP));
      // Home = fit view
      this.input.keyboard.on("keydown-HOME", () => this.zoomReset());

      const space = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE,
      );
      space.on("down", () => {
        this.spaceDown = true;
        this.input.setDefaultCursor("grab");
      });
      space.on("up", () => {
        this.spaceDown = false;
        if (!this.isPanning) this.input.setDefaultCursor("default");
      });
    }
  }

  private applyZoomAt(nextZoom: number, worldX: number, worldY: number) {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(z - cam.zoom) < 0.001) {
      this.emitZoom();
      return;
    }
    // Keep (worldX, worldY) under the same screen pixel after zoom
    const screenBefore = {
      x: (worldX - cam.scrollX) * cam.zoom,
      y: (worldY - cam.scrollY) * cam.zoom,
    };
    cam.setZoom(z);
    cam.scrollX = worldX - screenBefore.x / z;
    cam.scrollY = worldY - screenBefore.y / z;
    this.userCamera = true;
    this.emitZoom();
  }

  private emitZoom() {
    this.onZoomChange?.(Number(this.cameras.main.zoom.toFixed(2)));
  }

  update(_time: number, delta: number) {
    this.pulseT += delta;
    // Pulse conduit energy nodes along corridors
    const phase = (Math.sin(this.pulseT / 350) + 1) / 2;
    for (const n of this.pulseNodes) {
      n.setAlpha(0.35 + phase * 0.55);
      n.setScale(0.85 + phase * 0.35);
    }
    this.updateKeyboardPan(delta);
  }

  private updateKeyboardPan(delta: number) {
    if (!this.ready) return;
    // Don't steal arrows when user is typing in a form control
    const ae = document.activeElement;
    if (
      ae &&
      (ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.tagName === "SELECT" ||
        (ae as HTMLElement).isContentEditable)
    ) {
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.cursors) {
      if (this.cursors.left.isDown) dx -= 1;
      if (this.cursors.right.isDown) dx += 1;
      if (this.cursors.up.isDown) dy -= 1;
      if (this.cursors.down.isDown) dy += 1;
    }
    if (this.wasd) {
      if (this.wasd.a.isDown) dx -= 1;
      if (this.wasd.d.isDown) dx += 1;
      if (this.wasd.w.isDown) dy -= 1;
      if (this.wasd.s.isDown) dy += 1;
    }
    if (dx === 0 && dy === 0) return;

    // Normalize diagonal
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    const cam = this.cameras.main;
    // Move faster when zoomed out, slower when zoomed in (screen-constant feel)
    const speed = (this.panSpeed * (delta / 1000)) / cam.zoom;
    cam.scrollX += dx * speed;
    cam.scrollY += dy * speed;
    this.userCamera = true;
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
      void this.syncFreeAgents(map);
      return;
    }
    this.rebuildRooms();
    this.drawEdges();
    this.fitCamera();
    void this.syncFreeAgents(map);
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
    void this.syncFreeAgents(map);
  }

  setSelected(roomId: string | null) {
    this.selectedId = roomId;
    for (const b of this.bundles.values()) {
      this.styleBundle(b);
    }
  }

  /**
   * Mark rooms that need human attention (gate subject = room_id or occupant).
   * Call from shell whenever gates list updates.
   */
  setGatedSubjects(subjects: string[]) {
    const next = new Set<string>();
    if (this.mapData) {
      for (const sub of subjects) {
        for (const r of this.mapData.rooms) {
          if (r.room_id === sub || r.occupant_agent_id === sub) {
            next.add(r.room_id);
          }
        }
      }
    }
    this.gatedRoomIds = next;
    for (const b of this.bundles.values()) {
      this.styleBundle(b);
    }
  }

  focusRoom(roomId: string) {
    const b = this.bundles.get(roomId);
    if (!b) return;
    this.cameras.main.pan(b.room.x, b.room.y, 250, "Sine.easeInOut");
  }

  isChamberMode(): boolean {
    return this.chamberRoomId != null;
  }

  getChamberRoomId(): string | null {
    return this.chamberRoomId;
  }

  /**
   * Enter interior command focus: camera locks on one room, others dim.
   * This is where the operator commands — not a free roam overview.
   */
  enterChamber(roomId: string) {
    const b = this.bundles.get(roomId);
    if (!b) return;
    const switching = this.chamberRoomId !== roomId;
    this.chamberRoomId = roomId;
    this.userCamera = true;
    const cam = this.cameras.main;
    const targetZoom = Phaser.Math.Clamp(2.15, ZOOM_MIN, ZOOM_MAX);
    if (switching || Math.abs(cam.zoom - targetZoom) > 0.08) {
      cam.pan(b.room.x, b.room.y, 320, "Sine.easeInOut");
      this.tweens.add({
        targets: cam,
        zoom: targetZoom,
        duration: 320,
        ease: "Sine.easeInOut",
        onUpdate: () => this.emitZoom(),
      });
    } else {
      cam.centerOn(b.room.x, b.room.y);
    }
    // Dim the rest of the fortress
    if (!this.chamberDim) {
      this.chamberDim = this.add
        .rectangle(0, 0, 4000, 3000, 0x0b0e14, 0.55)
        .setOrigin(0, 0)
        .setDepth(3.5)
        .setScrollFactor(1);
    }
    this.chamberDim.setVisible(true);
    this.applyChamberDim(roomId);
    this.setSelected(roomId);
    this.emitZoom();
  }

  /** Re-apply dim after map restyle without moving camera. */
  applyChamberDim(roomId: string) {
    if (this.chamberRoomId !== roomId) return;
    for (const [id, bundle] of this.bundles) {
      const inChamber = id === roomId;
      bundle.body.setDepth(inChamber ? 4 : 2);
      if (bundle.body instanceof Phaser.GameObjects.Image) {
        bundle.body.setAlpha(inChamber ? 1 : 0.35);
      }
      bundle.namePlate.setDepth(inChamber ? 6.5 : 6.2);
      bundle.label.setDepth(inChamber ? 6.6 : 6.3);
      bundle.halo.setVisible(inChamber);
    }
    for (const fa of this.freeAgents.values()) {
      const here = fa.visualRoomId === roomId || fa.homeRoomId === roomId;
      fa.sprite.setDepth(here ? 12 : 5);
      fa.sprite.setAlpha(here ? (fa.agentReal ? 1 : 0.55) : 0.25);
      if (fa.aura instanceof Phaser.GameObjects.Image) {
        fa.aura.setAlpha(here ? 0.6 : 0.1);
      }
    }
  }

  /** Leave chamber — restore overview framing. */
  exitChamber() {
    if (!this.chamberRoomId) return;
    this.chamberRoomId = null;
    this.chamberDim?.setVisible(false);
    for (const bundle of this.bundles.values()) {
      bundle.body.setDepth(2);
      this.styleBundle(bundle);
    }
    for (const fa of this.freeAgents.values()) {
      fa.sprite.setDepth(9);
      this.styleFreeAgent(fa);
    }
    this.userCamera = false;
    this.fitCamera();
  }

  private clearFreeAgents() {
    for (const a of this.freeAgents.values()) {
      a.walkChain?.stop();
      a.bobTween?.stop();
      a.roamTween?.stop();
      a.sprite.destroy();
      a.aura?.destroy();
      a.bubbleBg?.destroy();
      a.bubbleText?.destroy();
    }
    this.freeAgents.clear();
    this.trailGraphics?.clear();
  }

  private rebuildRooms() {
    this.clearFreeAgents();
    for (const b of this.bundles.values()) {
      b.bobTween?.stop();
      b.auraTween?.stop();
      b.workTween?.stop();
      b.haloTween?.stop();
      b.gateTween?.stop();
      b.body.destroy();
      b.select.destroy();
      b.chip.destroy();
      b.namePlate.destroy();
      b.label.destroy();
      b.statusPlate.destroy();
      b.statusText.destroy();
      b.gateAlert?.destroy();
      b.bubbleText?.destroy();
      b.bubbleBg?.destroy();
      b.activityIcon?.destroy();
      b.tierBadge?.destroy();
      b.roamTween?.stop();
      b.agent?.destroy();
      b.aura?.destroy();
      b.shadow.destroy();
      b.halo.destroy();
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
    this.worldW = Math.max(900, maxX + 160);
    this.worldH = Math.max(600, maxY + 160);
    this.refreshVignette();
  }

  private textureOrFallback(...keys: string[]): string {
    for (const key of keys) {
      if (key && this.textures.exists(key)) return key;
    }
    return "";
  }

  private resolveRoomTexture(room: RoomChip): string {
    return this.textureOrFallback(
      roomTextureKey(room.room_id, room.lock_state),
      facadeTextureKey(room.room_id, room.lock_state),
      roomFallbackTextureKey(room.lock_state),
      "room_unforged",
    );
  }

  private spawnRoom(room: RoomChip) {
    const cx = room.x;
    const cy = room.y;
    const useSprites = this.artLoaded;

    const onClick = () => {
      const live = this.bundles.get(room.room_id)?.room ?? room;
      this.onRoomClick?.(live);
    };

    let body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    let select: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    let chip: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    let agent: Phaser.GameObjects.Image | null = null;
    let aura: Phaser.GameObjects.Image | Phaser.GameObjects.Arc | null = null;

    const shadow = this.add
      .rectangle(cx + 3, cy + 5, ROOM_SIZE + 4, ROOM_SIZE + 4, 0x000000, 0.38)
      .setDepth(1);
    const halo = this.add
      .rectangle(cx, cy, ROOM_SIZE + 16, ROOM_SIZE + 16, PALETTE.neonCyan, 0.08)
      .setDepth(1);

    if (useSprites) {
      const tKey = this.resolveRoomTexture(room);
      body = this.add
        .image(cx, cy, tKey || "room_unforged")
        .setDisplaySize(ROOM_SIZE, ROOM_SIZE)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      body.on("pointerdown", onClick);

      select = this.add
        .image(cx, cy, "selection_outline")
        .setDisplaySize(ROOM_SIZE + 16, ROOM_SIZE + 16)
        .setDepth(4)
        .setVisible(false);

      // Agent aura under feet
      if (this.textures.exists("agent_aura")) {
        aura = this.add
          .image(cx, cy + 22, "agent_aura")
          .setDisplaySize(56, 56)
          .setDepth(4.5)
          .setAlpha(0.55)
          .setVisible(!!room.occupant_agent_id);
      } else {
        aura = this.add
          .circle(cx, cy + 18, 14, PALETTE.neonCyan, 0.25)
          .setDepth(4.5)
          .setVisible(!!room.occupant_agent_id);
      }

      const aKey =
        agentTextureKey(room.occupant_agent_id, room.sprite_hint) ||
        (room.occupant_agent_id ? "agent_generic" : null);
      if (aKey && this.textures.exists(aKey)) {
        agent = this.add
          .image(cx, cy + 14, aKey)
          .setDisplaySize(AGENT_SIZE, AGENT_SIZE)
          .setDepth(5)
          .setInteractive({ useHandCursor: true });
        agent.on("pointerdown", onClick);
      } else if (room.occupant_agent_id && this.textures.exists("agent_generic")) {
        agent = this.add
          .image(cx, cy + 14, "agent_generic")
          .setDisplaySize(AGENT_SIZE, AGENT_SIZE)
          .setDepth(5)
          .setInteractive({ useHandCursor: true });
        agent.on("pointerdown", onClick);
      }

      const ck = chipTextureKey(room.agent_state);
      chip = this.add
        .image(cx + ROOM_HALF - 14, cy - ROOM_HALF + 14, ck)
        .setDisplaySize(16, 16)
        .setDepth(6);
    } else {
      body = this.add
        .rectangle(cx, cy, ROOM_SIZE, ROOM_SIZE, PALETTE.stone, 1)
        .setStrokeStyle(2, PALETTE.stoneDim, 1)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      body.on("pointerdown", onClick);

      select = this.add
        .rectangle(cx, cy, ROOM_SIZE + 10, ROOM_SIZE + 10, PALETTE.neonCyan, 0)
        .setStrokeStyle(2, PALETTE.neonCyan, 0.9)
        .setDepth(1)
        .setVisible(false);

      aura = this.add
        .circle(cx, cy + 16, 12, PALETTE.neonCyan, 0.2)
        .setDepth(3)
        .setVisible(!!room.occupant_agent_id);

      chip = this.add
        .circle(cx + ROOM_HALF - 10, cy - ROOM_HALF + 10, 6, PALETTE.neonCyan)
        .setDepth(3);
    }

    // ── In-tile name banner (top edge) — never collides with neighbor rooms
    const namePlate = this.add
      .rectangle(cx, cy - ROOM_HALF + 12, ROOM_SIZE - 16, 18, 0x0b0e14, 0.82)
      .setStrokeStyle(1, PALETTE.neonCyan, 0.45)
      .setDepth(6.2)
      .setInteractive({ useHandCursor: true });
    namePlate.on("pointerdown", onClick);

    const label = this.add
      .text(cx, cy - ROOM_HALF + 12, room.name.toUpperCase(), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e8ecf1",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(6.3)
      .setInteractive({ useHandCursor: true });
    label.on("pointerdown", onClick);

    // Compact status pill (bottom edge of tile)
    const statusPlate = this.add
      .rectangle(cx, cy + ROOM_HALF - 12, ROOM_SIZE - 20, 16, 0x0b0e14, 0.78)
      .setStrokeStyle(1, PALETTE.stone, 0.6)
      .setDepth(6.2)
      .setInteractive({ useHandCursor: true });
    statusPlate.on("pointerdown", onClick);

    const statusText = this.add
      .text(cx, cy + ROOM_HALF - 12, "", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#8b93a7",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(6.3)
      .setInteractive({ useHandCursor: true });
    statusText.on("pointerdown", onClick);

    // Gate alert (hidden unless gated)
    let gateAlert: Phaser.GameObjects.Image | Phaser.GameObjects.Text | null =
      null;
    if (this.textures.exists("gate_alert")) {
      gateAlert = this.add
        .image(cx, cy - ROOM_HALF - 10, "gate_alert")
        .setDisplaySize(22, 22)
        .setDepth(8)
        .setVisible(false);
    } else {
      gateAlert = this.add
        .text(cx, cy - ROOM_HALF - 10, "!", {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#ffc857",
          stroke: "#0b0e14",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(8)
        .setVisible(false);
    }

    // Activity icon + tier badge + speech bubble
    let activityIcon: Phaser.GameObjects.Image | null = null;
    let tierBadge: Phaser.GameObjects.Image | null = null;
    let bubbleBg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | null =
      null;
    let bubbleText: Phaser.GameObjects.Text | null = null;

    if (useSprites && this.textures.exists("icon_idle")) {
      activityIcon = this.add
        .image(cx - ROOM_HALF + 14, cy - ROOM_HALF + 36, "icon_idle")
        .setDisplaySize(14, 14)
        .setDepth(6.5)
        .setVisible(!!room.occupant_agent_id);
    }
    if (useSprites && this.textures.exists("badge_local")) {
      tierBadge = this.add
        .image(cx + ROOM_HALF - 18, cy + ROOM_HALF - 28, "badge_local")
        .setDisplaySize(22, 10)
        .setDepth(6.5)
        .setAlpha(0.9);
    }
    if (useSprites) {
      if (this.textures.exists("speech_bubble")) {
        bubbleBg = this.add
          .image(cx, cy - 28, "speech_bubble")
          .setDisplaySize(72, 28)
          .setDepth(7.5)
          .setVisible(false);
      } else {
        bubbleBg = this.add
          .rectangle(cx, cy - 28, 70, 22, 0x0b0e14, 0.9)
          .setStrokeStyle(1, PALETTE.neonCyan, 0.7)
          .setDepth(7.5)
          .setVisible(false);
      }
      bubbleText = this.add
        .text(cx, cy - 30, "", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#e8ecf1",
          align: "center",
          wordWrap: { width: 64 },
        })
        .setOrigin(0.5)
        .setDepth(7.6)
        .setVisible(false);
    }

    const bundle: RoomSpriteBundle = {
      room,
      body,
      select,
      chip,
      agent,
      aura,
      shadow,
      halo,
      namePlate,
      label,
      statusPlate,
      statusText,
      gateAlert,
      bubbleBg,
      bubbleText,
      activityIcon,
      tierBadge,
      useSprites,
      baseAgentX: cx,
      baseAgentY: cy + 14,
    };

    // Idle bob + aura breath + soft roam when idle
    if (agent) {
      bundle.bobTween = this.tweens.add({
        targets: agent,
        y: cy + 10,
        duration: 900 + Math.floor(Math.random() * 400),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      bundle.roamTween = this.tweens.add({
        targets: agent,
        x: cx + 10,
        duration: 2800 + Math.floor(Math.random() * 1200),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.floor(Math.random() * 800),
      });
    }
    if (aura) {
      bundle.auraTween = this.tweens.add({
        targets: aura,
        alpha: { from: 0.35, to: 0.75 },
        scale: { from: 0.9, to: 1.12 },
        duration: 1100 + Math.floor(Math.random() * 300),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.bundles.set(room.room_id, bundle);
    this.styleBundle(bundle);
  }

  private styleBundle(b: RoomSpriteBundle) {
    const {
      room,
      body,
      select,
      chip,
      agent,
      aura,
      halo,
      namePlate,
      label,
      statusPlate,
      statusText,
      gateAlert,
      useSprites,
    } = b;
    const unforged = room.lock_state === "UNFORGED";
    const locked = room.lock_state === "locked";
    const selected = this.selectedId === room.room_id;
    const gated = this.gatedRoomIds.has(room.room_id);
    const waiting =
      room.agent_state === "waiting_human" ||
      gated ||
      (room.lock_state === "UNFORGED" && room.spec_status === "draft");
    const working =
      room.agent_state === "working" || room.agent_state === "answering";
    const empty = !room.occupant_agent_id;
    const idleReal =
      !!room.occupant_agent_id &&
      room.agent_real &&
      (!room.agent_state || room.agent_state === "idle");

    // Visual hierarchy: dim empty/idle, glow active/gated
    let bodyAlpha = 1;
    if (empty) bodyAlpha = 0.62;
    else if (!room.agent_real && unforged) bodyAlpha = 0.78;
    else if (idleReal && !selected && !gated) bodyAlpha = 0.88;
    else if (locked) bodyAlpha = 0.85;

    // Halo by state
    b.haloTween?.stop();
    if (locked) {
      halo.setFillStyle(PALETTE.neonRed, 0.12);
    } else if (waiting || gated) {
      halo.setFillStyle(PALETTE.neonAmber, 0.2);
      b.haloTween = this.tweens.add({
        targets: halo,
        alpha: { from: 0.12, to: 0.35 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else if (working) {
      halo.setFillStyle(PALETTE.neonMagenta, 0.22);
      b.haloTween = this.tweens.add({
        targets: halo,
        alpha: { from: 0.14, to: 0.38 },
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else if (empty) {
      halo.setFillStyle(PALETTE.stone, 0.04);
    } else {
      halo.setFillStyle(PALETTE.neonCyan, 0.1);
    }

    // Name banner
    label.setText(room.name.toUpperCase());
    label.setColor(
      selected
        ? "#ff2a6d"
        : waiting
          ? "#ffc857"
          : empty || unforged || locked
            ? "#8b93a7"
            : "#e8ecf1",
    );
    namePlate.setStrokeStyle(
      1,
      selected
        ? PALETTE.neonMagenta
        : waiting
          ? PALETTE.neonAmber
          : empty
            ? PALETTE.stone
            : PALETTE.neonCyan,
      selected || waiting ? 0.85 : 0.45,
    );

    // Compact status (never long task strings — those go to HTML ticker)
    const lockBadge =
      room.lock_state === "UNFORGED"
        ? "SEALED"
        : room.lock_state === "locked"
          ? "LOCKED"
          : "LIVE";
    const reality = empty
      ? "empty"
      : room.agent_real
        ? "real"
        : room.spec_status === "draft"
          ? "draft"
          : "cand";
    const act = room.agent_state || (empty ? "—" : "idle");
    statusText.setText(`${lockBadge} · ${reality} · ${act}`);
    statusText.setColor(
      working
        ? "#ff2a6d"
        : waiting
          ? "#ffc857"
          : empty
            ? "#6b7280"
            : "#a8b0c0",
    );
    statusPlate.setStrokeStyle(
      1,
      working
        ? PALETTE.neonMagenta
        : waiting
          ? PALETTE.neonAmber
          : PALETTE.stone,
      0.55,
    );

    // Gate alert marker above room
    if (gateAlert) {
      const showGate = gated || room.agent_state === "waiting_human";
      gateAlert.setVisible(showGate);
      b.gateTween?.stop();
      if (showGate) {
        b.gateTween = this.tweens.add({
          targets: gateAlert,
          y: room.y - ROOM_HALF - 14,
          alpha: { from: 0.65, to: 1 },
          duration: 550,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      } else {
        gateAlert.setAlpha(1);
        gateAlert.setY(room.y - ROOM_HALF - 10);
      }
    }

    if (useSprites && body instanceof Phaser.GameObjects.Image) {
      const key = this.resolveRoomTexture(room);
      if (key && body.texture.key !== key) {
        body.setTexture(key);
        body.setDisplaySize(ROOM_SIZE, ROOM_SIZE);
      }
      body.setAlpha(bodyAlpha);
      // Soft tint for empty rooms
      if (empty) body.setTint(0x8899aa);
      else if (working) body.setTint(0xffdde8);
      else body.clearTint();

      if (select instanceof Phaser.GameObjects.Image) {
        select.setVisible(selected || waiting);
        if (selected) {
          select.setTint(PALETTE.neonMagenta);
          select.setAlpha(1);
        } else if (waiting) {
          select.clearTint();
          select.setTint(PALETTE.neonAmber);
          select.setAlpha(0.9);
        } else {
          select.clearTint();
        }
      }

      if (aura) {
        const show = !!room.occupant_agent_id;
        aura.setVisible(show);
        if (show) {
          const c = stateColor(room.agent_state);
          if (aura instanceof Phaser.GameObjects.Image) {
            aura.setTint(c);
            aura.setAlpha(room.agent_real ? (working ? 0.85 : 0.55) : 0.3);
          } else if (aura instanceof Phaser.GameObjects.Arc) {
            aura.setFillStyle(c, room.agent_real ? 0.3 : 0.15);
          }
        }
      }

      // Activity icon + tier badge
      if (b.activityIcon) {
        const showAct = !!room.occupant_agent_id;
        b.activityIcon.setVisible(showAct);
        if (showAct) {
          const ik = activityIconKey(room.agent_state);
          if (this.textures.exists(ik)) b.activityIcon.setTexture(ik);
        }
      }
      if (b.tierBadge) {
        const tk = tierBadgeKey(room.model_tier || "local");
        if (this.textures.exists(tk)) b.tierBadge.setTexture(tk);
        b.tierBadge.setVisible(room.lock_state === "live");
      }

      // Speech bubble — only when real task text exists (never invent)
      const task = (room.agent_task || "").trim();
      const showBubble =
        !!room.occupant_agent_id &&
        task.length > 0 &&
        (working ||
          room.agent_state === "waiting_human" ||
          room.agent_state === "answering");
      if (b.bubbleBg && b.bubbleText) {
        b.bubbleBg.setVisible(showBubble);
        b.bubbleText.setVisible(showBubble);
        if (showBubble) {
          const short =
            task.length > 28 ? `${task.slice(0, 26)}…` : task;
          b.bubbleText.setText(short);
        }
      }

      // Room-bound agent sprites stay hidden — freeAgents walk the corridors
      if (agent) {
        agent.setVisible(false);
        b.roamTween?.pause();
        b.bobTween?.pause();
      }
      if (b.bubbleBg) b.bubbleBg.setVisible(false);
      if (b.bubbleText) b.bubbleText.setVisible(false);
      if (aura) aura.setVisible(false);

      if (chip instanceof Phaser.GameObjects.Image) {
        if (!room.occupant_agent_id) {
          chip.setVisible(false);
        } else {
          chip.setVisible(true);
          const ck = chipTextureKey(room.agent_state);
          if (this.textures.exists(ck)) chip.setTexture(ck);
          chip.setDisplaySize(16, 16);
          chip.setAlpha(room.agent_real ? 1 : 0.55);
        }
      }
    } else if (body instanceof Phaser.GameObjects.Rectangle) {
      if (unforged) {
        body.setFillStyle(PALETTE.stoneDim, 0.85);
        body.setStrokeStyle(1, PALETTE.seal, 0.7);
      } else if (locked) {
        body.setFillStyle(PALETTE.stoneDim, 1);
        body.setStrokeStyle(2, PALETTE.neonRed, 0.55);
      } else {
        body.setFillStyle(PALETTE.stoneLive, 1);
        body.setStrokeStyle(1, PALETTE.neonCyan, 0.5);
      }
      body.setAlpha(bodyAlpha);
      if (select instanceof Phaser.GameObjects.Rectangle) {
        select.setVisible(selected || waiting);
        if (selected) select.setStrokeStyle(3, PALETTE.neonMagenta, 1);
        else if (waiting) select.setStrokeStyle(2, PALETTE.neonAmber, 0.9);
      }
      if (aura) aura.setVisible(!!room.occupant_agent_id);
      if (chip instanceof Phaser.GameObjects.Arc) {
        if (!room.occupant_agent_id) chip.setVisible(false);
        else {
          chip.setVisible(true);
          chip.setFillStyle(
            stateColor(room.agent_state),
            room.agent_real ? 1 : 0.45,
          );
        }
      }
    }
  }

  /** Resolve edges that actually exist among current rooms. */
  private resolvedEdges(): Array<{
    from: RoomChip;
    to: RoomChip;
    label?: string;
  }> {
    if (!this.mapData) return [];
    const byId = new Map(this.mapData.rooms.map((r) => [r.room_id, r]));
    const out: Array<{ from: RoomChip; to: RoomChip; label?: string }> = [];
    const seen = new Set<string>();

    const push = (fromId: string, toId: string, label?: string) => {
      const a = byId.get(fromId);
      const b = byId.get(toId);
      if (!a || !b) return;
      const key = [fromId, toId].sort().join("→");
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ from: a, to: b, label });
    };

    for (const e of this.pipeline.edges || []) {
      push(e.from, e.to, e.label);
    }
    // Fallback spatial graph if pipeline used stale facade ids
    if (out.length === 0) {
      for (const e of SPATIAL_EDGES) push(e.from, e.to, e.label);
    }
    return out;
  }

  private drawEdges() {
    this.edgeGraphics.clear();
    this.corridorLayer.removeAll(true);
    for (const n of this.pulseNodes) n.destroy();
    this.pulseNodes = [];

    const edges = this.resolvedEdges();
    if (!edges.length) return;

    for (const e of edges) {
      this.drawCorridor(e.from, e.to, e.label);
    }
  }

  private drawCorridor(a: RoomChip, b: RoomChip, label?: string) {
    const ax = a.x;
    const ay = a.y;
    const bx = b.x;
    const by = b.y;
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    // Exit points at room rim (not center → center through furniture)
    const ax2 = ax + ux * ROOM_HALF;
    const ay2 = ay + uy * ROOM_HALF;
    const bx2 = bx - ux * ROOM_HALF;
    const by2 = by - uy * ROOM_HALF;
    const mx = (ax2 + bx2) / 2;
    const my = (ay2 + by2) / 2;
    const corridorLen = Math.hypot(bx2 - ax2, by2 - ay2);
    const angle = Math.atan2(dy, dx);

    // Stone trench underlay (thick dark line)
    this.edgeGraphics.lineStyle(18, PALETTE.stoneDim, 0.85);
    this.edgeGraphics.lineBetween(ax2, ay2, bx2, by2);
    this.edgeGraphics.lineStyle(12, 0x1a1e28, 0.95);
    this.edgeGraphics.lineBetween(ax2, ay2, bx2, by2);

    // Neon conduit core
    const liveA = a.lock_state === "live";
    const liveB = b.lock_state === "live";
    const bothLive = liveA && liveB;
    const conduitColor = bothLive
      ? PALETTE.neonCyan
      : a.lock_state === "locked" || b.lock_state === "locked"
        ? PALETTE.neonRed
        : PALETTE.seal;
    this.edgeGraphics.lineStyle(3, conduitColor, bothLive ? 0.75 : 0.4);
    this.edgeGraphics.lineBetween(ax2, ay2, bx2, by2);
    this.edgeGraphics.lineStyle(1, PALETTE.neonMagenta, bothLive ? 0.45 : 0.2);
    this.edgeGraphics.lineBetween(ax2, ay2, bx2, by2);

    // Tiled corridor sprites when available
    const isHoriz = Math.abs(dx) >= Math.abs(dy);
    const tileKey = isHoriz ? "corridor_h" : "corridor_v";
    if (this.textures.exists(tileKey) && corridorLen > 24) {
      const tile = this.add
        .tileSprite(mx, my, Math.max(24, corridorLen - 8), isHoriz ? 14 : 14, tileKey)
        .setDepth(0.2)
        .setAlpha(0.9)
        .setRotation(isHoriz ? 0 : angle);
      // tileSprite rotation with non-axis can look odd — prefer axis-aligned
      if (isHoriz) {
        tile.setRotation(0);
        tile.setSize(Math.max(24, Math.abs(bx2 - ax2) - 4), 14);
      } else {
        tile.setRotation(0);
        tile.setTexture("corridor_v");
        tile.setSize(14, Math.max(24, Math.abs(by2 - ay2) - 4));
      }
      this.corridorLayer.add(tile);
    }

    // Door markers at each room edge
    if (this.textures.exists("door_marker")) {
      const d1 = this.add
        .image(ax2, ay2, "door_marker")
        .setDisplaySize(18, 12)
        .setRotation(angle)
        .setDepth(3)
        .setAlpha(0.95);
      const d2 = this.add
        .image(bx2, by2, "door_marker")
        .setDisplaySize(18, 12)
        .setRotation(angle + Math.PI)
        .setDepth(3)
        .setAlpha(0.95);
      this.corridorLayer.add(d1);
      this.corridorLayer.add(d2);
    } else {
      this.edgeGraphics.fillStyle(conduitColor, 0.9);
      this.edgeGraphics.fillRect(ax2 - 5, ay2 - 3, 10, 6);
      this.edgeGraphics.fillRect(bx2 - 5, by2 - 3, 10, 6);
    }

    // Junction / energy node mid-corridor
    if (this.textures.exists("conduit_node")) {
      const node = this.add
        .image(mx, my, "conduit_node")
        .setDisplaySize(14, 14)
        .setDepth(1)
        .setAlpha(0.95);
      this.corridorLayer.add(node);
    }
    const pulse = this.add
      .circle(mx, my, 4, conduitColor, 0.7)
      .setDepth(1.5);
    this.pulseNodes.push(pulse);

    // Optional edge label (tiny)
    if (label && bothLive) {
      const lbl = this.add
        .text(mx, my - 12, label, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#8b93a7",
          align: "center",
          stroke: "#0b0e14",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(1)
        .setAlpha(0.75);
      this.corridorLayer.add(lbl);
    }
  }

  private fitCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    // Always refresh bounds; only re-home zoom/center if user hasn't taken control
    if (this.userCamera) {
      this.emitZoom();
      return;
    }
    if (this.mapData?.rooms.length) {
      const xs = this.mapData.rooms.map((r) => r.x);
      const ys = this.mapData.rooms.map((r) => r.y);
      const pad = ROOM_SIZE * 0.55;
      const minX = Math.min(...xs) - pad;
      const maxX = Math.max(...xs) + pad;
      const minY = Math.min(...ys) - pad;
      const maxY = Math.max(...ys) + pad;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      cam.centerOn(cx, cy);
      const spanX = maxX - minX + 40;
      const spanY = maxY - minY + 72;
      const zoom = Math.min(cam.width / spanX, cam.height / spanY, 1.65);
      this.defaultZoom = Phaser.Math.Clamp(Math.max(0.72, zoom), ZOOM_MIN, ZOOM_MAX);
      cam.setZoom(this.defaultZoom);
    } else {
      this.defaultZoom = 1.25;
      cam.setZoom(this.defaultZoom);
    }
    this.emitZoom();
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

  // ── Free agents + corridor walks ─────────────────────────────

  private roomPx(
    roomId: string,
    agentId?: string,
  ): { x: number; y: number } | null {
    const r = this.mapData?.rooms.find((x) => x.room_id === roomId);
    if (!r) return null;
    // Offset co-residents so Library dual stack doesn't pile up
    let dx = 0;
    if (agentId && r.agent_ids && r.agent_ids.length > 1) {
      const idx = r.agent_ids.indexOf(agentId);
      if (idx >= 0) dx = (idx - (r.agent_ids.length - 1) / 2) * 22;
    } else if (agentId && r.co_occupants?.length) {
      const all = [
        r.occupant_agent_id,
        ...r.co_occupants,
      ].filter(Boolean) as string[];
      const idx = all.indexOf(agentId);
      if (idx >= 0) dx = (idx - (all.length - 1) / 2) * 22;
    }
    return { x: r.x + dx, y: r.y + 14 };
  }

  /**
   * Reconcile free-moving agents with map presence.
   * When presence room changes → walk cyan pipes via get_path.
   */
  private async syncFreeAgents(map: CastleMapResponse) {
    if (!this.ready) return;

    type Desired = {
      agentId: string;
      homeRoomId: string;
      visualRoomId: string;
      state: string | null;
      task: string | null;
      agentReal: boolean;
      spriteHint: string | null;
    };
    const desired = new Map<string, Desired>();

    for (const room of map.rooms) {
      // Multi-occupant rooms (Library: oracle + scribe)
      const memberIds =
        room.agent_ids?.length
          ? room.agent_ids
          : room.occupant_agent_id
            ? [room.occupant_agent_id, ...(room.co_occupants || [])]
            : [...(room.co_occupants || [])];
      const occById = new Map(
        (room.occupants || []).map((o) => [o.agent_id, o]),
      );
      for (const aid of memberIds) {
        if (!aid || desired.has(aid)) continue;
        const fromStatus = map.agent_statuses?.find((s) => s.agent_id === aid);
        const occ = occById.get(aid);
        const visual =
          occ?.presence_room_id ||
          fromStatus?.room_id ||
          (aid === room.occupant_agent_id ? room.presence_room_id : null) ||
          room.room_id;
        desired.set(aid, {
          agentId: aid,
          homeRoomId: room.room_id,
          visualRoomId: visual || room.room_id,
          state:
            occ?.agent_state ??
            (aid === room.occupant_agent_id ? room.agent_state : null) ??
            fromStatus?.state ??
            null,
          task:
            occ?.agent_task ??
            (aid === room.occupant_agent_id ? room.agent_task : null) ??
            fromStatus?.task ??
            null,
          agentReal:
            occ?.agent_real ??
            (aid === room.occupant_agent_id ? !!room.agent_real : false),
          spriteHint:
            occ?.sprite_hint ??
            fromStatus?.sprite_hint ??
            (aid === room.occupant_agent_id ? room.sprite_hint : null) ??
            aid,
        });
      }
    }
    // Also pick up status-only agents (presence without room occupant row)
    for (const st of map.agent_statuses || []) {
      if (desired.has(st.agent_id)) continue;
      if (!st.room_id) continue;
      desired.set(st.agent_id, {
        agentId: st.agent_id,
        homeRoomId: st.room_id,
        visualRoomId: st.room_id,
        state: st.state,
        task: st.task ?? null,
        agentReal: true,
        spriteHint: st.sprite_hint ?? null,
      });
    }

    // Remove agents no longer present
    for (const [id, fa] of this.freeAgents) {
      if (!desired.has(id)) {
        fa.walkChain?.stop();
        fa.bobTween?.stop();
        fa.roamTween?.stop();
        fa.sprite.destroy();
        fa.aura?.destroy();
        fa.bubbleBg?.destroy();
        fa.bubbleText?.destroy();
        this.freeAgents.delete(id);
      }
    }

    for (const d of desired.values()) {
      const existing = this.freeAgents.get(d.agentId);
      if (!existing) {
        this.spawnFreeAgent(d);
        continue;
      }
      // Update metadata always
      existing.state = d.state;
      existing.task = d.task;
      existing.agentReal = d.agentReal;
      existing.spriteHint = d.spriteHint;
      existing.homeRoomId = d.homeRoomId;
      this.styleFreeAgent(existing);

      if (existing.walking) continue;
      if (existing.visualRoomId !== d.visualRoomId) {
        await this.walkFreeAgent(existing, existing.visualRoomId, d.visualRoomId);
      } else {
        // Stay put / idle anim at room
        this.parkFreeAgent(existing, d.visualRoomId);
      }
    }
  }

  private spawnFreeAgent(d: {
    agentId: string;
    homeRoomId: string;
    visualRoomId: string;
    state: string | null;
    task: string | null;
    agentReal: boolean;
    spriteHint: string | null;
  }) {
    const pos = this.roomPx(d.visualRoomId, d.agentId);
    if (!pos) return;
    const key =
      agentTextureKey(d.agentId, d.spriteHint) || "agent_generic";
    const tex = this.textures.exists(key) ? key : "agent_generic";
    if (!this.textures.exists(tex)) return;

    const sprite = this.add
      .image(pos.x, pos.y, tex)
      .setDisplaySize(AGENT_SIZE, AGENT_SIZE)
      .setDepth(9)
      .setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => {
      const room =
        this.mapData?.rooms.find((r) => r.room_id === d.visualRoomId) ||
        this.mapData?.rooms.find((r) => r.occupant_agent_id === d.agentId);
      if (room) this.onRoomClick?.(room);
    });

    let aura: FreeAgent["aura"] = null;
    if (this.textures.exists("agent_aura")) {
      aura = this.add
        .image(pos.x, pos.y + 8, "agent_aura")
        .setDisplaySize(52, 52)
        .setDepth(8.5)
        .setAlpha(0.55);
    }

    let bubbleBg: FreeAgent["bubbleBg"] = null;
    let bubbleText: FreeAgent["bubbleText"] = null;
    if (this.textures.exists("speech_bubble")) {
      bubbleBg = this.add
        .image(pos.x, pos.y - 36, "speech_bubble")
        .setDisplaySize(72, 28)
        .setDepth(10)
        .setVisible(false);
    } else {
      bubbleBg = this.add
        .rectangle(pos.x, pos.y - 36, 70, 22, 0x0b0e14, 0.9)
        .setStrokeStyle(1, PALETTE.neonCyan, 0.7)
        .setDepth(10)
        .setVisible(false);
    }
    bubbleText = this.add
      .text(pos.x, pos.y - 38, "", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#e8ecf1",
        align: "center",
        wordWrap: { width: 64 },
      })
      .setOrigin(0.5)
      .setDepth(10.1)
      .setVisible(false);

    const fa: FreeAgent = {
      agentId: d.agentId,
      homeRoomId: d.homeRoomId,
      visualRoomId: d.visualRoomId,
      sprite,
      aura,
      bubbleBg,
      bubbleText,
      walking: false,
      state: d.state,
      task: d.task,
      agentReal: d.agentReal,
      spriteHint: d.spriteHint,
    };

    fa.bobTween = this.tweens.add({
      targets: sprite,
      y: pos.y - 4,
      duration: 900 + Math.floor(Math.random() * 400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    fa.roamTween = this.tweens.add({
      targets: sprite,
      x: pos.x + 10,
      duration: 2600 + Math.floor(Math.random() * 1000),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Math.floor(Math.random() * 600),
    });

    this.freeAgents.set(d.agentId, fa);
    this.styleFreeAgent(fa);
  }

  private parkFreeAgent(fa: FreeAgent, roomId: string) {
    const pos = this.roomPx(roomId, fa.agentId);
    if (!pos || fa.walking) return;
    fa.visualRoomId = roomId;
    fa.sprite.setPosition(pos.x, pos.y);
    fa.aura?.setPosition(pos.x, pos.y + 8);
    fa.bubbleBg?.setPosition(pos.x, pos.y - 36);
    fa.bubbleText?.setPosition(pos.x, pos.y - 38);
    // Restart roam around park point
    fa.roamTween?.stop();
    fa.bobTween?.stop();
    fa.bobTween = this.tweens.add({
      targets: fa.sprite,
      y: pos.y - 4,
      duration: 900 + Math.floor(Math.random() * 400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    const idle =
      !fa.state || fa.state === "idle" || fa.state === "retired";
    if (idle) {
      fa.roamTween = this.tweens.add({
        targets: fa.sprite,
        x: pos.x + 10,
        duration: 2600 + Math.floor(Math.random() * 1000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private styleFreeAgent(fa: FreeAgent) {
    const working = fa.state === "working" || fa.state === "answering";
    const waiting = fa.state === "waiting_human";
    fa.sprite.setAlpha(fa.agentReal ? 1 : 0.55);
    if (working) fa.sprite.setTint(PALETTE.neonMagenta);
    else if (waiting) fa.sprite.setTint(PALETTE.neonAmber);
    else if (fa.state === "failed") fa.sprite.setTint(PALETTE.neonRed);
    else fa.sprite.clearTint();

    const key = agentTextureKey(fa.agentId, fa.spriteHint) || "agent_generic";
    if (this.textures.exists(key) && fa.sprite.texture.key !== key) {
      fa.sprite.setTexture(key);
      fa.sprite.setDisplaySize(AGENT_SIZE, AGENT_SIZE);
    }

    const task = (fa.task || "").trim();
    const showBubble =
      task.length > 0 && (working || waiting || fa.state === "answering");
    fa.bubbleBg?.setVisible(showBubble);
    fa.bubbleText?.setVisible(showBubble);
    if (showBubble && fa.bubbleText) {
      fa.bubbleText.setText(task.length > 28 ? `${task.slice(0, 26)}…` : task);
    }
    if (fa.aura) {
      const c = stateColor(fa.state);
      if (fa.aura instanceof Phaser.GameObjects.Image) {
        fa.aura.setTint(c);
        fa.aura.setVisible(true);
      }
    }
  }

  private async walkFreeAgent(fa: FreeAgent, fromRoom: string, toRoom: string) {
    if (fa.walking || fromRoom === toRoom) {
      this.parkFreeAgent(fa, toRoom);
      return;
    }
    fa.walking = true;
    fa.bobTween?.pause();
    fa.roamTween?.stop();

    const start = this.roomPx(fromRoom);
    const end = this.roomPx(toRoom);
    if (!start || !end) {
      fa.walking = false;
      this.parkFreeAgent(fa, toRoom);
      return;
    }

    // Build pixel waypoints from MCP path cells
    let points: { x: number; y: number }[] = [start];
    if (this.pathFetcher) {
      try {
        const path = await this.pathFetcher(fromRoom, toRoom);
        const cells = path?.path_cells;
        if (cells && cells.length >= 2) {
          points = cells.map(([gx, gy]) => {
            const p = gridToPx(gx, gy);
            return { x: p.x, y: p.y + 14 };
          });
          // Ensure end snaps to dest room center
          points[points.length - 1] = end;
          points[0] = start;
        } else {
          points = [start, end];
        }
      } catch {
        points = [start, end];
      }
    } else {
      points = [start, end];
    }

    // Neon trail underfoot
    if (!this.trailGraphics) {
      this.trailGraphics = this.add.graphics().setDepth(8);
    }
    this.trailGraphics.clear();
    this.trailGraphics.lineStyle(2, PALETTE.neonMagenta, 0.55);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.trailGraphics.lineTo(points[i].x, points[i].y);
    }
    this.trailGraphics.strokePath();

    // Chain segment tweens
    const msPerCell = 380;
    const tweens: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
    for (let i = 1; i < points.length; i++) {
      const pt = points[i];
      tweens.push({
        targets: fa.sprite,
        x: pt.x,
        y: pt.y,
        duration: msPerCell,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          const x = fa.sprite.x;
          const y = fa.sprite.y;
          fa.aura?.setPosition(x, y + 8);
          fa.bubbleBg?.setPosition(x, y - 36);
          fa.bubbleText?.setPosition(x, y - 38);
        },
      });
    }

    if (tweens.length === 0) {
      fa.walking = false;
      this.parkFreeAgent(fa, toRoom);
      return;
    }

    // Slight bounce while walking
    fa.sprite.setTint(PALETTE.neonCyan);

    this.tweens.chain({
      targets: fa.sprite,
      tweens,
      onComplete: () => {
        fa.walking = false;
        fa.visualRoomId = toRoom;
        fa.sprite.clearTint();
        this.parkFreeAgent(fa, toRoom);
        this.styleFreeAgent(fa);
        // Fade trail
        this.tweens.add({
          targets: this.trailGraphics,
          alpha: 0,
          duration: 600,
          onComplete: () => {
            this.trailGraphics?.clear();
            this.trailGraphics?.setAlpha(1);
          },
        });
      },
    });
  }

  /** Force a demo walk (used by UI "Tour" button). */
  async demoWalk(agentId: string, toRoom: string): Promise<boolean> {
    const fa = this.freeAgents.get(agentId);
    if (!fa || fa.walking) return false;
    const from = fa.visualRoomId;
    if (from === toRoom) return false;
    await this.walkFreeAgent(fa, from, toRoom);
    return true;
  }

  listFreeAgentIds(): string[] {
    return [...this.freeAgents.keys()];
  }
}
