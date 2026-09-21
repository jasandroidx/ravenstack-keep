/**
 * Arcane Library Spatial Context Compactor — Phaser hook for Ravenstack Keep.
 *
 * The Keep has no classic platformer "player"; command focus is chamber mode
 * and free agents. This hook treats **entering Library chamber** (and optional
 * high token metrics) as the high-density zone overlap.
 *
 * Emits COMPACT_SPATIAL_CONTEXT for the shell to POST /api/compact.
 */

import type Phaser from "phaser";

export const COMPACT_SPATIAL_CONTEXT = "COMPACT_SPATIAL_CONTEXT";

export type CompactSpatialPayload = {
  spatialId: string;
  roomName: string;
  coords: [number, number];
  currentTokens: number;
  maxTokens: number;
  ratio: number;
  reason: "zone_enter" | "threshold" | "manual";
};

export type CompactEmitter = (payload: CompactSpatialPayload) => void;

/** Keep spatial registry — Library primary high-density zone. */
export const HIGH_DENSITY_ZONES: Record<
  string,
  { coords: [number, number]; density: number }
> = {
  library: { coords: [1, 0], density: 1.0 },
  "alchemy-lab": { coords: [1, 1], density: 0.55 },
  observatory: { coords: [1, 2], density: 0.45 },
  "great-hall": { coords: [0, 0], density: 0.35 },
  armory: { coords: [0, 1], density: 0.3 },
  vault: { coords: [-1, -1], density: 0.25 },
};

const DEFAULT_MAX_TOKENS = 8000;
const THRESHOLD = 0.85;

/**
 * Drop-in hook. Call from Keep shell when chamber enters / token metrics update.
 * Optional Arcade overlap if a player sprite is ever added.
 */
export class ArcaneLibraryCompactorHook {
  private scene: Phaser.Scene | null = null;
  private emit: CompactEmitter;
  private maxTokens: number;
  private currentTokens: number;
  private lastEmitMs = 0;
  private cooldownMs: number;
  private player: Phaser.Types.Physics.Arcade.GameObjectWithBody | null = null;
  private zoneBodies: Phaser.GameObjects.Zone[] = [];

  constructor(
    emit: CompactEmitter,
    opts?: { maxTokens?: number; cooldownMs?: number },
  ) {
    this.emit = emit;
    this.maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.currentTokens = 0;
    this.cooldownMs = opts?.cooldownMs ?? 60_000;
  }

  /** Attach to a Phaser scene (optional physics zones). */
  attach(
    scene: Phaser.Scene,
    opts?: {
      player?: Phaser.Types.Physics.Arcade.GameObjectWithBody;
      /** World-pixel centers for rooms: roomId -> {x,y,size} */
      roomWorld?: Record<string, { x: number; y: number; size: number }>;
    },
  ) {
    this.scene = scene;
    this.player = opts?.player ?? null;
    this.clearZones();

    if (opts?.roomWorld && this.player && scene.physics) {
      for (const roomId of Object.keys(HIGH_DENSITY_ZONES)) {
        const world = opts.roomWorld[roomId];
        if (!world) continue;
        const zone = scene.add
          .zone(world.x, world.y, world.size * 1.1, world.size * 1.1)
          .setRectangleDropZone(world.size * 1.1, world.size * 1.1);
        // Arcade overlap if body exists
        try {
          scene.physics.add.existing(zone, true);
          scene.physics.add.overlap(this.player, zone, () => {
            this.onZoneEnter(roomId);
          });
        } catch {
          /* physics not configured — chamber path still works */
        }
        this.zoneBodies.push(zone as Phaser.GameObjects.Zone);
      }
    }
  }

  setTokenMetrics(current: number, max?: number) {
    this.currentTokens = Math.max(0, current);
    if (max != null && max > 0) this.maxTokens = max;
    const ratio = this.currentTokens / this.maxTokens;
    if (ratio >= THRESHOLD) {
      this.fire("library", "threshold");
    }
  }

  /** Call when operator enters chamber for a room (Keep command focus). */
  onChamberEnter(roomId: string) {
    const z = HIGH_DENSITY_ZONES[roomId];
    if (!z) return;
    if (z.density >= 0.85 || roomId === "library") {
      this.onZoneEnter(roomId);
    }
  }

  onZoneEnter(roomId: string) {
    const ratio = this.maxTokens
      ? this.currentTokens / this.maxTokens
      : 0;
    // Enter Library always notifies; other zones only at token threshold
    if (roomId === "library" || ratio >= THRESHOLD) {
      this.fire(roomId, roomId === "library" ? "zone_enter" : "threshold");
    }
  }

  /** Manual compact from UI. */
  requestManual(roomId = "library") {
    this.fire(roomId, "manual", true);
  }

  private fire(
    roomId: string,
    reason: CompactSpatialPayload["reason"],
    bypassCooldown = false,
  ) {
    const now = Date.now();
    if (!bypassCooldown && now - this.lastEmitMs < this.cooldownMs) return;
    this.lastEmitMs = now;
    const z = HIGH_DENSITY_ZONES[roomId] || HIGH_DENSITY_ZONES.library;
    const payload: CompactSpatialPayload = {
      spatialId: roomId,
      roomName: roomId,
      coords: z.coords,
      currentTokens: this.currentTokens,
      maxTokens: this.maxTokens,
      ratio: this.maxTokens ? this.currentTokens / this.maxTokens : 0,
      reason,
    };
    this.emit(payload);
    this.scene?.events.emit(COMPACT_SPATIAL_CONTEXT, payload);
  }

  private clearZones() {
    for (const z of this.zoneBodies) {
      try {
        z.destroy();
      } catch {
        /* */
      }
    }
    this.zoneBodies = [];
  }

  destroy() {
    this.clearZones();
    this.scene = null;
    this.player = null;
  }
}
