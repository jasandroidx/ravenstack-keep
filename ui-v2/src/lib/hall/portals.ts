/**
 * The doors in the painted Keep.
 *
 * A door is a floor rect, not a sprite: step inside and `scene.ts` fades to
 * the target scene. They live here rather than inline in the Hall component so
 * the layout tool (`npm run world:map`) and its test can see the same list the
 * game walks on — a door that is drawn but not walked, or walked but not
 * drawn, is how you end up with a map that lies.
 *
 * `kind: "test"` marks a door that exists for development, not for the world.
 */
import type { PortalTrigger } from "./portal.ts";

export type KeepDoor = PortalTrigger & {
  /** Which room the door sits in, for the map and for overlap checks. */
  inZone: string;
  kind?: "test";
};

/**
 * EMPTY on purpose (2026-11-24, Jason): every auto-fire floor pad in the
 * courtyard is gone — recon, search, citadel, sploit and the tower pad that
 * used to sit 20px above the spawn. They were invisible (doors are painted
 * into the map, never boxed) and took you somewhere you did not ask to go.
 *
 * The ONE courtyard link left is the select E-gate to the interior
 * (`COURTYARD_GATE` in world.ts, wired in keep-hall.tsx as a selectGate, not
 * as a portal): step into it and nothing happens until you press E.
 *
 * The satellite rooms are still reachable, deliberately and visibly, from the
 * [T] teleport menu — an explicit choice instead of a floor you can trip over.
 */
export const HALL_PORTALS: KeepDoor[] = [];
