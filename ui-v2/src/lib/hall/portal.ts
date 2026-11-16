/** Portal doors between Phaser scenes. A door is a floor rect; stepping in
 *  (after leaving the spawn rect, so arrival never instantly retriggers)
 *  fades out and starts the target scene at its spawn. A door with an `href`
 *  leaves the walkable map instead and opens that page — the Hall's two
 *  painted arches use `href`, so they carry no targetScene. */
export type PortalTrigger = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetScene?: string;
  targetSpawn?: { x: number; y: number };
  href?: string;
  label?: string;
};

export function portalAt(portals: PortalTrigger[], x: number, y: number): PortalTrigger | null {
  for (const p of portals) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
  }
  return null;
}
