#!/usr/bin/env node
/**
 * Compose the satellite room maps (Search / Sploit / Citadel / Tower) from a
 * 16x16 top-down castle-interior tileset instead of stretching one 48x48 floor
 * tile across 1600 px.
 *
 * Art: "Pixel Castle Interior Tileset" by reodesuxz. Its LICENSE.txt allows
 * commercial use and modification, requires no credit, and forbids reselling or
 * redistributing the asset files themselves — so only the COMPOSED ROOM MAPS
 * ship here, never the tile set. Point --tiles at a folder of that pack's
 * `PNG/native/**` PNGs (flat, names like `stone_wall.png`, `wood_floor.png`).
 *
 * Usage:
 *   node scripts/build-room-maps.mjs --tiles /path/to/PNG/native --out /tmp/rooms [--only search]
 *
 * Output is one 528x528 PNG per room (33 x 33 tiles at 16 px). It is upscaled
 * x3 with NEAREST (PhotoCraft `image.imageSize`) to 1584x1584 and padded to
 * 1600x1600 with the Keep's void colour by the caller; the RoomScene map is
 * 1600x1600 with a 48 px tile on screen.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TILE = 16;
const COLS = 33;
const ROWS = 33;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const tilesDir = arg("tiles", process.env.KEEP_TILES_DIR ?? "");
const outDir = arg("out", "");
const only = arg("only", "");
if (!tilesDir || !outDir) {
  console.error("need --tiles <dir> and --out <dir>");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

/** Decode a 16x16 RGBA PNG once per tile name, via ffmpeg rawvideo. */
const cache = new Map();
function tilePixels(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(tilesDir, `${name}.png`);
  if (!fs.existsSync(file)) throw new Error(`missing tile: ${file}`);
  const tmp = path.join(os.tmpdir(), `keep-tile-${process.pid}-${name}.rgba`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", tmp]);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  if (buf.length !== TILE * TILE * 4) throw new Error(`${name}: expected ${TILE}x${TILE}, got ${buf.length} bytes`);
  cache.set(name, buf);
  return buf;
}

/** Alpha-composite one 16x16 tile onto the canvas at tile (cx, cy). */
function draw(canvas, name, cx, cy, w = 1, h = 1) {
  const px = tilePixels(name);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const ox = (cx + tx) * TILE;
      const oy = (cy + ty) * TILE;
      if (ox < 0 || oy < 0 || ox + TILE > COLS * TILE || oy + TILE > ROWS * TILE) continue;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const s = (y * TILE + x) * 4;
          const d = ((oy + y) * COLS * TILE + (ox + x)) * 4;
          const a = px[s + 3] / 255;
          if (a === 0) continue;
          for (let c = 0; c < 3; c++) canvas[d + c] = Math.round(px[s + c] * a + canvas[d + c] * (1 - a));
          canvas[d + 3] = 255;
        }
      }
    }
  }
}

/** Deterministic per-tile variation: no Math.random, so a rebuild is identical. */
const hash = (x, y) => (x * 73856093) ^ (y * 19349663);

/**
 * Shared shell: three rows of wall, a wall face, floor, then the south wall with
 * a three-tile doorway under the return portal (x 700..900, y 1400..1560).
 */
function room({ floor, floorAlt, wall, wallFace, accents, props, rug, runner }) {
  const px = new Uint8Array(COLS * TILE * ROWS * TILE * 4);
  // Void first, so any gap is the Keep's background, never transparent haze.
  for (let i = 0; i < px.length; i += 4) { px[i] = 0x0b; px[i + 1] = 0x0e; px[i + 2] = 0x14; px[i + 3] = 255; }

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const edge = cx < 3 || cx > 29 || cy < 4 || cy > 29;
      if (edge) {
        if (cy <= 2 || cy >= 30) draw(px, wall, cx, cy);
        else draw(px, wallFace, cx, cy);
        continue;
      }
      draw(px, hash(cx, cy) % 9 === 0 ? floorAlt : floor, cx, cy);
    }
  }
  // Doorway in the south wall: the return portal sits on top of it, so the
  // opening is framed with pillars instead of being a hole in the bricks.
  for (let cx = 15; cx <= 17; cx++) {
    for (let cy = 30; cy <= 32; cy++) draw(px, "door_open", cx, cy);
  }
  for (let cy = 30; cy <= 32; cy++) {
    draw(px, "pillar", 14, cy);
    draw(px, "pillar", 18, cy);
  }
  // Runner from the door up to the room's focal prop.
  for (const [cx, cy, name] of runner) draw(px, name, cx, cy);
  for (const [cx, cy, name] of rug) draw(px, name, cx, cy);
  for (const [cx, cy, name] of accents) draw(px, name, cx, cy);
  for (const [cx, cy, name] of props) draw(px, name, cx, cy);
  return px;
}

const LAYOUTS = {
  // Search — a reading room: wood floor, shelves to the north, a scant carpet,
  // and the query desk on its rug dead centre (the scene's own anchor).
  search: () =>
    room({
      floor: "stone_floor_1", floorAlt: "stone_floor_3",
      wall: "stone_wall", wallFace: "wall_with_base",
      runner: [
        [16, 29, "carpet_runner_v"], [16, 28, "carpet_runner_v"], [16, 27, "carpet_runner_v"],
        [16, 26, "carpet_runner_v"], [16, 25, "carpet_runner_v"],
      ],
      // No rug block: the pack's rugs are single-tile motifs, and a cross of
      // them reads as a pattern bug. The runner is the only floor dressing.
      rug: [],
      accents: [
        // North wall: banners over the shelves, treasures on the face.
        [8, 1, "banner_blue"], [16, 1, "tapestry"], [24, 1, "banner_red"],
        [3, 9, "wall_torch_lit"], [29, 9, "wall_torch_lit"],
        [3, 22, "wall_torch_lit"], [29, 22, "wall_torch_lit"],
      ],
      props: [
        // Shelves against the north wall, clear of the Set A sprites at cols 9-11
        // and 22-24 (those are furniture markers with their own images).
        [4, 4, "bookshelf"], [5, 4, "bookshelf"], [6, 4, "bookshelf"],
        [13, 4, "bookshelf"], [14, 4, "bookshelf"],
        [18, 4, "bookshelf"], [19, 4, "bookshelf"],
        [27, 4, "bookshelf"], [28, 4, "bookshelf"],
        // Side shelves, row by row down both walls.
        [3, 11, "bookshelf"], [3, 13, "bookshelf"], [3, 15, "bookshelf"],
        [29, 11, "bookshelf"], [29, 13, "bookshelf"], [29, 15, "bookshelf"],
        // The query desk itself: a table on the rug, a stool behind it.
        [16, 17, "wooden_table"], [16, 19, "stool"],
        // The scroll bank (scene anchor 300,600) and the engine brazier (1300,600).
        [6, 12, "scroll"], [7, 12, "scroll"], [6, 13, "scroll"],
        [27, 12, "brazier"],
        // Reading clusters, low traffic on purpose: two tables and chairs.
        [9, 20, "wooden_table"], [9, 21, "wooden_chair"],
        [23, 20, "wooden_table"], [23, 21, "wooden_chair"],
        [12, 25, "wooden_table"], [13, 25, "wooden_chair"],
        [20, 25, "wooden_table"], [19, 25, "wooden_chair"],
        // Quiet corners, and just enough clutter that the floor is not a field.
        [4, 27, "potted_plant"], [28, 27, "potted_plant"],
        [4, 24, "wooden_crate"], [5, 26, "wooden_crate"], [27, 24, "barrel"], [28, 26, "barrel"],
        [3, 19, "barrel"], [29, 19, "barrel"],
        [12, 24, "stool"], [20, 24, "stool"],
        [13, 9, "candelabra"], [19, 9, "candelabra"],
        [7, 10, "wooden_crate"], [25, 10, "wooden_crate"],
      ],
    }),
};

for (const [id, build] of Object.entries(LAYOUTS)) {
  if (only && only !== id) continue;
  const px = build();
  const raw = path.join(os.tmpdir(), `keep-room-${id}.rgba`);
  fs.writeFileSync(raw, px);
  const out = path.join(outDir, `${id}.png`);
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${COLS * TILE}x${ROWS * TILE}`, "-i", raw, out,
  ]);
  fs.unlinkSync(raw);
  console.log(`${out}  ${COLS * TILE}x${ROWS * TILE}`);
}
