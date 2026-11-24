#!/usr/bin/env node
/**
 * The Keep's layout map — where you can walk, what you can't, who stands where,
 * who wanders, and where the doors go.
 *
 *   npm run world:map          (from ui-v2/)  → docs/keep/map.svg
 *   npm run world:map:check    fails if the committed SVG is out of date
 *
 * Everything here is read from the code the game actually runs: WALK/SOLID/
 * ZONES/HALL_NPCS from lib/hall/world.ts, HALL_PORTALS from lib/hall/portals.ts,
 * and reachability from `walkable()` itself. Nothing is hand-placed, so the map
 * cannot drift from the world — it is the world, drawn. The one thing it does
 * not show is the painting; a map that needed the JPEG would be a screenshot.
 *
 * Deliberately has no timestamp: output is a pure function of the code, so the
 * test in world-map.test.mjs can compare it byte for byte.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HALL_LIGHTS,
  HALL_NPCS,
  MAP_H,
  MAP_SRC,
  MAP_W,
  PLAYER_SPAWN,
  SOLID,
  VALERIE_LEASH,
  WALK,
  ZONES,
  walkable,
} from "../src/lib/hall/world.ts";
import { HALL_PORTALS } from "../src/lib/hall/portals.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT_PATH = path.resolve(HERE, "../../docs/keep/map.svg");

const M = 24; // page margin
const HEADER = 96; // title block above the map
const MAP_Y = HEADER + 8;
const PAGE_W = MAP_W + M * 2;
const LEGEND_Y = MAP_Y + MAP_H + 40;

const C = {
  bg: "#0b0e14",
  ink: "#e8ecf1",
  dim: "#8891a5",
  grid: "#1a2028",
  walk: "#39ff14",
  solid: "#ff2a6d",
  zone: "#2de2e6",
  door: "#c792ea",
  test: "#ffc857",
  npc: "#ffc857",
  spawn: "#2de2e6",
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const rectAttrs = (r) => `x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"`;

/** Same predicate scene.ts uses to decide who is a walking sprite. */
function walks(npc) {
  return Boolean(npc.actor) && npc.id !== "oracle";
}

/**
 * Reachability, by flood fill over the real `walkable()` on an 8px lattice.
 * This is the only way to answer "can I actually get there": a floor rect can
 * be declared walkable and still be walled off by a prop.
 */
function reachable({ step = 8 } = {}) {
  const cols = Math.ceil(MAP_W / step);
  const rows = Math.ceil(MAP_H / step);
  const seen = new Uint8Array(cols * rows);
  const at = (i, j) => j * cols + i;
  const cx = (i) => i * step + step / 2;
  const cy = (j) => j * step + step / 2;

  const startI = Math.floor(PLAYER_SPAWN.x / step);
  const startJ = Math.floor(PLAYER_SPAWN.y / step);
  const stack = [[startI, startJ]];
  if (walkable(cx(startI), cy(startJ))) seen[at(startI, startJ)] = 1;
  else stack.length = 0;

  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      if (seen[at(ni, nj)]) continue;
      if (!walkable(cx(ni), cy(nj))) continue;
      seen[at(ni, nj)] = 1;
      stack.push([ni, nj]);
    }
  }

  /** Is any cell whose centre lies inside `r` reachable from spawn? */
  function touches(r) {
    const i0 = Math.max(0, Math.floor(r.x / step));
    const j0 = Math.max(0, Math.floor(r.y / step));
    const i1 = Math.min(cols - 1, Math.floor((r.x + r.w) / step));
    const j1 = Math.min(rows - 1, Math.floor((r.y + r.h) / step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = cx(i);
        const y = cy(j);
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        if (seen[at(i, j)]) return true;
      }
    }
    return false;
  }

  // `open` is every centre `walkable()` accepts; `cells` is the subset the
  // flood actually reached. The difference is floor that exists and cannot be
  // walked to from spawn.
  let cells = 0;
  let open = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = at(i, j);
      if (seen[k]) cells += 1;
      if (walkable(cx(i), cy(j))) open += 1;
    }
  }
  return { touches, cells, open, step };
}

const pointIn = (r, x, y) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function rectDistance(r, x, y) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Computed findings. Anything that would make the drawing misleading. */
function findings(reach) {
  const out = [];

  const stranded = WALK.filter((f) => !reach.touches(f));
  if (stranded.length) {
    out.push(
      `UNREACHABLE FLOOR: ${stranded.map((f) => f.name).join(", ")} — declared walkable, settled by nothing from spawn.`,
    );
  }

  for (const door of HALL_PORTALS) {
    const cx = door.x + door.w / 2;
    const cy = door.y + door.h / 2;
    const hosts = ZONES.filter((z) => pointIn(z.rect, cx, cy));
    for (const z of hosts) {
      if (z.id !== door.inZone) {
        out.push(
          `DOOR/ROOM CLASH: ${door.id} sits in ${z.id}'s zone but claims ${door.inZone} — the cell-entry event fires on a teleport pad.`,
        );
      }
    }
    if (!WALK.some((f) => pointIn(f, cx, cy))) {
      out.push(`DEAD DOOR: ${door.id} is not on any walk floor, so nobody can step on it.`);
    }
    for (const npc of HALL_NPCS) {
      if (rectDistance(door, npc.x, npc.y) < 24) {
        out.push(
          `DOOR UNDERFOOT: ${npc.name} stands on ${door.id}; walking up to talk to them teleports you.`,
        );
      }
    }
    if (door.kind === "test") {
      out.push(
        `TEST DOOR IN THE WORLD: ${door.id} (${door.label}) is live in the Hall and occupies the ${WALK.find((f) => pointIn(f, cx, cy))?.name ?? "floor"} floor.`,
      );
    }
  }

  const isolated = reach.open - reach.cells;
  if (isolated > 0) {
    out.push(
      `ISOLATED FLOOR: ${isolated} of ${reach.open} open points (${Math.round((isolated / reach.open) * 100)}%) cannot be reached from spawn at all.`,
    );
  }

  const roamers = HALL_NPCS.filter((n) => walks(n) && n.id !== "valerie");
  if (roamers.length) {
    out.push(
      `WANDER: ${roamers.map((n) => n.name).join(", ")} pick any walkable point on the map — their rooms are not their homes. Only Valerie is leashed.`,
    );
  }

  out.push(
    "STEPS: every walker move is validated per axis by walkable(), so nobody clips a prop. There is no pathfinding, so there are no routes to draw.",
  );
  return out;
}

export function renderWorldMap() {
  const reach = reachable();
  const notes = findings(reach);

  const g = [];

  // ---- page frame -------------------------------------------------------
  g.push(
    `<rect width="${PAGE_W}" height="100%" fill="${C.bg}"/>`,
    `<text x="${M}" y="40" fill="${C.ink}" font-size="24" letter-spacing="4">RAVENSTACK KEEP — LAYOUT</text>`,
    `<text x="${M}" y="64" fill="${C.dim}" font-size="12">${MAP_W}×${MAP_H} painted map (${MAP_SRC}) · ${WALK.length} walk floors · ${SOLID.length} solid props · ${ZONES.length} zones · ${HALL_NPCS.length} occupants · ${HALL_PORTALS.length} doors · ${HALL_LIGHTS.length} lights</text>`,
    `<text x="${M}" y="82" fill="${C.dim}" font-size="12">generated from lib/hall/world.ts + lib/hall/portals.ts — regenerate: cd ui-v2 &amp;&amp; npm run world:map — do not edit by hand</text>`,
    `<g transform="translate(${M},${MAP_Y})">`,
  );

  // ---- map frame + grid -------------------------------------------------
  g.push(
    `<rect width="${MAP_W}" height="${MAP_H}" fill="#080a0f" stroke="${C.grid}"/>`,
  );
  for (let x = 100; x < MAP_W; x += 100) {
    const strong = x % 200 === 0;
    g.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${MAP_H}" stroke="${C.grid}" stroke-width="${strong ? 1 : 0.5}" stroke-opacity="${strong ? 0.9 : 0.5}"/>`,
    );
    if (strong) {
      g.push(`<text x="${x + 3}" y="12" fill="${C.dim}" font-size="9">${x}</text>`);
    }
  }
  for (let y = 100; y < MAP_H; y += 100) {
    const strong = y % 200 === 0;
    g.push(
      `<line x1="0" y1="${y}" x2="${MAP_W}" y2="${y}" stroke="${C.grid}" stroke-width="${strong ? 1 : 0.5}" stroke-opacity="${strong ? 0.9 : 0.5}"/>`,
    );
    if (strong) {
      g.push(`<text x="4" y="${y - 4}" fill="${C.dim}" font-size="9">${y}</text>`);
    }
  }

  // ---- walkable floors --------------------------------------------------
  for (const f of WALK) {
    const dead = !reach.touches(f);
    g.push(
      `<rect ${rectAttrs(f)} fill="${C.walk}" fill-opacity="${dead ? 0.02 : 0.07}" stroke="${C.walk}" stroke-opacity="${dead ? 0.9 : 0.45}" stroke-width="${dead ? 2 : 1}"${dead ? ' stroke-dasharray="4 3"' : ""}/>`,
    );
    g.push(
      `<text x="${f.x + 6}" y="${f.y + 14}" fill="${C.walk}" fill-opacity="${dead ? 0.95 : 0.7}" font-size="10">${esc(dead ? `${f.name} — UNREACHABLE` : f.name)}</text>`,
    );
  }

  // ---- solid props ------------------------------------------------------
  for (const s of SOLID) {
    g.push(
      `<rect ${rectAttrs(s)} fill="${C.solid}" fill-opacity="0.16" stroke="${C.solid}" stroke-opacity="0.6"/>`,
      `<text x="${s.x + s.w / 2}" y="${s.y + s.h / 2 + 3}" fill="${C.solid}" font-size="10" text-anchor="middle" fill-opacity="0.9">${esc(s.name)}</text>`,
    );
  }

  // ---- rooms (zones) ----------------------------------------------------
  for (const z of ZONES) {
    const forgiven = z.lock === "live";
    g.push(
      `<rect ${rectAttrs(z.rect)} fill="none" stroke="${C.zone}" stroke-opacity="${forgiven ? 0.85 : 0.4}" stroke-width="2" stroke-dasharray="${forgiven ? "none" : "10 6"}"/>`,
    );
    const label = `${z.name}${forgiven ? "" : " · unforged"}`;
    g.push(
      `<text x="${z.rect.x + 8}" y="${z.rect.y + 20}" fill="${C.zone}" fill-opacity="${forgiven ? 1 : 0.65}" font-size="13" letter-spacing="1">${esc(label)}</text>`,
    );
  }

  // ---- Valerie's leash --------------------------------------------------
  g.push(
    `<rect ${rectAttrs(VALERIE_LEASH)} fill="none" stroke="${C.solid}" stroke-opacity="0.5" stroke-dasharray="2 4"/>`,
    `<text x="${VALERIE_LEASH.x + 6}" y="${VALERIE_LEASH.y + 14}" fill="${C.solid}" fill-opacity="0.75" font-size="9">VALERIE LEASH</text>`,
  );

  // ---- doors ------------------------------------------------------------
  for (const door of HALL_PORTALS) {
    const colour = door.kind === "test" ? C.test : C.door;
    g.push(
      `<rect ${rectAttrs(door)} fill="${colour}" fill-opacity="0.18" stroke="${colour}" stroke-opacity="0.95" stroke-width="2"/>`,
      `<text x="${door.x + door.w / 2}" y="${door.y + door.h / 2 + 4}" fill="${colour}" font-size="10" text-anchor="middle">${esc(door.label ?? door.id)}</text>`,
      `<text x="${door.x + door.w / 2}" y="${door.y + door.h + 12}" fill="${colour}" fill-opacity="0.6" font-size="8" text-anchor="middle">${esc(door.targetScene)}</text>`,
    );
  }

  // ---- occupants --------------------------------------------------------
  for (const npc of HALL_NPCS) {
    const moving = walks(npc);
    const leash =
      !moving
        ? "does not walk"
        : npc.id === "valerie"
          ? "leashed to the workshop"
          : "roams the whole map";
    g.push(
      `<circle cx="${npc.x}" cy="${npc.y}" r="${npc.radius}" fill="none" stroke="${C.npc}" stroke-opacity="0.35" stroke-dasharray="4 4"/>`,
      `<circle cx="${npc.x}" cy="${npc.y}" r="5" fill="${C.npc}"/>`,
      `<text x="${npc.x}" y="${npc.y - 10}" fill="${C.npc}" font-size="12" text-anchor="middle">${esc(npc.name)}</text>`,
      `<text x="${npc.x}" y="${npc.y + npc.radius + 12}" fill="${C.npc}" fill-opacity="0.65" font-size="9" text-anchor="middle">${esc(leash)}</text>`,
    );
    if (npc.href) {
      g.push(
        `<text x="${npc.x}" y="${npc.y + npc.radius + 23}" fill="${C.zone}" fill-opacity="0.8" font-size="9" text-anchor="middle">portal ${esc(npc.href)}</text>`,
      );
    }
  }

  // ---- lights -----------------------------------------------------------
  // scene.ts mounts these as additive glows over the painting, so the circle is
  // the radius that actually brightens — useful when placing a prop or a room.
  for (const light of HALL_LIGHTS) {
    const hex = `#${light.color.toString(16).padStart(6, "0")}`;
    g.push(
      `<circle cx="${light.x}" cy="${light.y}" r="${light.radius}" fill="${hex}" fill-opacity="0.06" stroke="${hex}" stroke-opacity="0.4" stroke-dasharray="2 4"/>`,
      `<circle cx="${light.x}" cy="${light.y}" r="3" fill="${hex}" fill-opacity="0.9"/>`,
    );
  }

  // ---- spawn ------------------------------------------------------------
  g.push(
    `<line x1="${PLAYER_SPAWN.x - 14}" y1="${PLAYER_SPAWN.y}" x2="${PLAYER_SPAWN.x + 14}" y2="${PLAYER_SPAWN.y}" stroke="${C.spawn}" stroke-width="1.5"/>`,
    `<line x1="${PLAYER_SPAWN.x}" y1="${PLAYER_SPAWN.y - 14}" x2="${PLAYER_SPAWN.x}" y2="${PLAYER_SPAWN.y + 14}" stroke="${C.spawn}" stroke-width="1.5"/>`,
    `<text x="${PLAYER_SPAWN.x + 18}" y="${PLAYER_SPAWN.y + 4}" fill="${C.spawn}" font-size="10">SPAWN</text>`,
  );

  g.push(`</g>`);

  // ---- legend -----------------------------------------------------------
  const colA = M;
  const colB = M + 880;
  let y = LEGEND_Y;
  const title = (x, yy, s) =>
    `<text x="${x}" y="${yy}" fill="${C.ink}" font-size="13" letter-spacing="2">${esc(s)}</text>`;
  const rowAt = (x, yy, cells, widths) => {
    let out = [];
    let cursor = x;
    cells.forEach((cell, i) => {
      out.push(
        `<text x="${cursor}" y="${yy}" fill="${C.dim}" font-size="11">${esc(cell)}</text>`,
      );
      cursor += widths[i];
    });
    return out.join("");
  };

  g.push(title(colA, y, "ROOMS"));
  y += 20;
  g.push(rowAt(colA, y, ["id", "name", "lock", "rect", "href"], [128, 190, 84, 200, 150]));
  y += 14;
  for (const z of ZONES) {
    g.push(
      rowAt(
        colA,
        y,
        [
          z.id,
          z.name,
          z.lock,
          `${z.rect.x},${z.rect.y} ${z.rect.w}×${z.rect.h}`,
          z.href ?? "—",
        ],
        [128, 190, 84, 200, 150],
      ),
    );
    y += 16;
  }

  y += 18;
  g.push(title(colA, y, "OCCUPANTS"));
  y += 20;
  g.push(rowAt(colA, y, ["id", "name", "role", "place", "at"], [128, 150, 210, 130, 100]));
  y += 14;
  for (const npc of HALL_NPCS) {
    g.push(
      rowAt(
        colA,
        y,
        [npc.id, npc.name, clip(npc.role, 28), npc.place, `${npc.x},${npc.y}`],
        [128, 150, 210, 130, 100],
      ),
    );
    y += 16;
  }

  let yb = LEGEND_Y;
  g.push(title(colB, yb, "DOORS"));
  yb += 20;
  g.push(
    rowAt(
      colB,
      yb,
      ["id", "label", "rect", "target scene"],
      [170, 130, 160, 200],
    ),
  );
  yb += 14;
  for (const door of HALL_PORTALS) {
    const colour = door.kind === "test" ? C.test : C.door;
    g.push(
      rowAt(
        colB,
        yb,
        [
          door.id,
          door.label ?? "—",
          `${door.x},${door.y} ${door.w}×${door.h}`,
          door.targetScene,
        ],
        [170, 130, 160, 200],
      ),
    );
    if (door.kind === "test") {
      g.push(
        `<text x="${colB + 640}" y="${yb}" fill="${colour}" font-size="10">test door</text>`,
      );
    }
    yb += 16;
  }

  yb += 18;
  g.push(title(colB, yb, "WHAT THIS MAP IS TELLING YOU"));
  yb += 20;
  for (const note of notes) {
    g.push(`<text x="${colB}" y="${yb}" fill="${C.dim}" font-size="10">${esc(clip(note, 112))}</text>`);
    yb += 14;
  }

  yb += 18;
  g.push(
    `<text x="${colB}" y="${yb}" fill="${C.dim}" font-size="10">reachable: ${reach.cells} of ${reach.open} open points (${Math.round((reach.cells / reach.open) * 100)}%), flood fill from spawn on a ${reach.step}px lattice</text>`,
  );

  const pageH = Math.max(y, yb) + M + 12;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${pageH}" viewBox="0 0 ${PAGE_W} ${pageH}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">`,
    `<rect width="${PAGE_W}" height="${pageH}" fill="${C.bg}"/>`,
    ...g,
    `</svg>`,
    "",
  ].join("\n");
}

function main() {
  const svg = renderWorldMap();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUTPUT_PATH)
      ? fs.readFileSync(OUTPUT_PATH, "utf-8")
      : "";
    if (current !== svg) {
      console.error(
        `docs/keep/map.svg is out of date with the world. Run: npm run world:map`,
      );
      process.exitCode = 1;
      return;
    }
    console.log("docs/keep/map.svg matches the world.");
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, svg);
  const bytes = Buffer.byteLength(svg);
  console.log(`wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (${bytes} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
