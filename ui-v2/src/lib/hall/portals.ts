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

export const HALL_PORTALS: KeepDoor[] = [
  {
    id: "library-to-recon",
    x: 300,
    y: 200,
    w: 120,
    h: 60,
    inZone: "library",
    targetScene: "ReconRoomScene",
    targetSpawn: { x: 800, y: 1400 },
    label: "RECON →",
  },
  {
    id: "workshop-to-search",
    x: 1500,
    y: 300,
    w: 120,
    h: 60,
    inZone: "workshop",
    targetScene: "SearchRoomScene",
    targetSpawn: { x: 800, y: 1400 },
    label: "SEARCH →",
  },
  {
    id: "hall-to-citadel",
    x: 600,
    y: 600,
    w: 120,
    h: 60,
    inZone: "great-hall",
    targetScene: "CitadelRoomScene",
    targetSpawn: { x: 800, y: 1400 },
    label: "CITADEL →",
  },
  {
    id: "yard-to-tower",
    x: 700,
    y: 800,
    w: 120,
    h: 60,
    inZone: "yard",
    targetScene: "TowerRoomScene",
    targetSpawn: { x: 800, y: 1400 },
    label: "TOWER →",
  },
  {
    // The pad used to sit under the Quarantine Cell's zone and the Cell's own
    // NPC, so walking to the cell teleported you here. North-west corner of the
    // yard is the free floor: clear of the fountain, the tower pad and Corvid.
    id: "yard-to-sploit",
    x: 660,
    y: 730,
    w: 120,
    h: 60,
    inZone: "yard",
    targetScene: "SploitRoomScene",
    targetSpawn: { x: 800, y: 1400 },
    label: "SPLOIT →",
  },
];
