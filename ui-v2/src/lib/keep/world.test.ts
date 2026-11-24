import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ROOMS, ROOM_TO_SPEC, SPECS } from "./catalog.ts";
import { HALL_NPCS, WALK, ZONES } from "../hall/world.ts";

/**
 * The Keep's room vocabulary used to live in five places that disagreed:
 * schemas/keep-rooms.schema.json, catalog.ROOMS, world.ZONES, the pulse
 * fixture and AGENTS.md prose. This test pins the one model
 * (keep-world.json) to the code that still holds the data, so any edit to a
 * room that skips the model fails here instead of drifting for three months.
 *
 * Stage 2 derives ROOMS/ZONES/HALL_NPCS from the model; until then this is the
 * ratchet that makes that derivation a mechanical change.
 */
type Rect = { x: number; y: number; w: number; h: number };

type WorldRoom = {
  id: string;
  name: string;
  wing: string;
  ledger: {
    occupant: string;
    role: string;
    lock: string;
    purpose: string;
    kill: string;
  };
  spec: string | null;
  specStatus: string;
  href: string | null;
  image?: string;
  modelDefault: string;
  col: number;
  row: number;
  zone?: Rect;
  note?: string;
};

type WorldPlace = {
  id: string;
  name: string;
  lock: string;
  href?: string;
  zone: Rect;
  note: string;
};

type WorldNpc = {
  id: string;
  name: string;
  role: string;
  place: string;
  x: number;
  y: number;
  radius: number;
  actor?: string;
  actorH?: number;
  talkScene?: string;
  portrait?: string;
  href?: string;
  greeting: string;
};

const worldPath = path.join(process.cwd(), "src/lib/keep/keep-world.json");
const worldRaw = fs.readFileSync(worldPath, "utf-8");
const world = JSON.parse(worldRaw) as {
  zoneOrder: string[];
  rooms: WorldRoom[];
  mapOnly: WorldPlace[];
  unplaced: WorldRoom[];
  npcs: WorldNpc[];
};

const allRooms: WorldRoom[] = [...world.rooms, ...world.unplaced];
const allPlaces = [...world.rooms, ...world.mapOnly];

function intersects(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

test("every Ledger room in the model matches catalog.ROOMS exactly", () => {
  for (const room of allRooms) {
    const row = ROOMS.find((r) => r.slug === room.id);
    assert.ok(row, `${room.id} is in the world model but not in catalog.ROOMS`);
    assert.equal(row.name, room.name, `${room.id} name`);
    assert.equal(row.wing, room.wing, `${room.id} wing`);
    assert.equal(row.occupant, room.ledger.occupant, `${room.id} occupant`);
    assert.equal(row.role, room.ledger.role, `${room.id} role`);
    assert.equal(row.lock, room.ledger.lock, `${room.id} lock`);
    assert.equal(row.purpose, room.ledger.purpose, `${room.id} purpose`);
    assert.equal(row.kill, room.ledger.kill, `${room.id} kill`);
    assert.equal(row.specStatus, room.specStatus, `${room.id} specStatus`);
    assert.equal(
      row.modelDefault,
      room.modelDefault,
      `${room.id} modelDefault`,
    );
    assert.equal(row.col, room.col, `${room.id} col`);
    assert.equal(row.row, room.row, `${room.id} row`);
    assert.equal(row.href ?? null, room.href, `${room.id} href`);
    assert.equal(row.image ?? null, room.image ?? null, `${room.id} image`);
  }
});

test("catalog.ROOMS has no room the world model does not know about", () => {
  for (const row of ROOMS) {
    assert.ok(
      allRooms.some((r) => r.id === row.slug),
      `${row.slug} is in catalog.ROOMS but not in keep-world.json`,
    );
  }
});

test("every model room's spec exists and points back at it", () => {
  for (const room of allRooms) {
    if (!room.spec) continue;
    const spec = SPECS[room.spec];
    assert.ok(
      spec,
      `${room.id} names spec "${room.spec}", which catalog.SPECS does not have`,
    );
    assert.equal(
      spec.roomId,
      room.id,
      `${room.spec}.roomId should be ${room.id}`,
    );
  }
  for (const [id, spec] of Object.entries(SPECS)) {
    assert.ok(
      allRooms.some((r) => r.id === spec.roomId),
      `SPECS.${id}.roomId "${spec.roomId}" is not a room in the world model`,
    );
  }
});

test("ROOM_TO_SPEC only names real rooms and real specs", () => {
  for (const [slug, specId] of Object.entries(ROOM_TO_SPEC)) {
    assert.ok(
      allRooms.some((r) => r.id === slug),
      `ROOM_TO_SPEC keys ${slug}, not a room`,
    );
    assert.ok(
      SPECS[specId],
      `ROOM_TO_SPEC maps ${slug} to missing spec ${specId}`,
    );
  }
});

test("ZONES matches the model, in zoneOrder", () => {
  assert.deepEqual(
    ZONES.map((z) => z.id),
    world.zoneOrder,
    "ZONES order is zone look-up precedence: gallery-arch must follow great-hall",
  );
  for (const id of world.zoneOrder) {
    const zone = ZONES.find((z) => z.id === id);
    assert.ok(zone, `${id} is in zoneOrder but missing from world.ZONES`);
    const model = allPlaces.find((p) => p.id === id) as
      WorldRoom | WorldPlace | undefined;
    assert.ok(
      model && model.zone,
      `${id} is in zoneOrder but has no zone in the model`,
    );
    const lock = "ledger" in model ? model.ledger.lock : model.lock;
    assert.equal(zone.name, model.name, `${id} zone name`);
    assert.deepEqual(zone.rect, model.zone, `${id} zone rect`);
    assert.equal(zone.lock, lock, `${id} zone lock`);
    assert.equal(zone.href ?? null, model.href ?? null, `${id} zone href`);
  }
});

test("every painted zone touches a walkable floor", () => {
  for (const id of world.zoneOrder) {
    const zone = ZONES.find((z) => z.id === id);
    assert.ok(zone);
    assert.ok(
      WALK.some((floor) => intersects(floor, zone.rect)),
      `${id} has no walkable floor inside its zone — the player cannot reach it`,
    );
  }
});

test("HALL_NPCS matches the model NPCs", () => {
  assert.deepEqual(
    HALL_NPCS.map((n) => n.id).sort(),
    world.npcs.map((n) => n.id).sort(),
    "the painted NPCs and the model NPCs must be the same people",
  );
  for (const npc of world.npcs) {
    const painted = HALL_NPCS.find((n) => n.id === npc.id);
    assert.ok(painted, `${npc.id} is in the model but not in HALL_NPCS`);
    assert.equal(painted.name, npc.name, `${npc.id} name`);
    assert.equal(painted.role, npc.role, `${npc.id} role`);
    assert.equal(painted.x, npc.x, `${npc.id} x`);
    assert.equal(painted.y, npc.y, `${npc.id} y`);
    assert.equal(painted.radius, npc.radius, `${npc.id} radius`);
    assert.equal(painted.actor ?? null, npc.actor ?? null, `${npc.id} actor`);
    assert.equal(
      painted.actorH ?? null,
      npc.actorH ?? null,
      `${npc.id} actorH`,
    );
    assert.equal(
      painted.talkScene ?? null,
      npc.talkScene ?? null,
      `${npc.id} talkScene`,
    );
    assert.equal(
      painted.portrait ?? null,
      npc.portrait ?? null,
      `${npc.id} portrait`,
    );
    assert.equal(painted.href ?? null, npc.href ?? null, `${npc.id} href`);
    assert.equal(painted.greeting, npc.greeting, `${npc.id} greeting`);
    assert.ok(
      allRooms.some((r) => r.id === npc.place) ||
        world.mapOnly.some((p) => p.id === npc.place),
      `${npc.id} stands in ${npc.place}, which is not a room or place`,
    );
  }
});

test("ids are unique across rooms, places and unplaced rooms", () => {
  const ids = [...allRooms.map((r) => r.id), ...world.mapOnly.map((p) => p.id)];
  assert.equal(
    new Set(ids).size,
    ids.length,
    "duplicate id in the world model",
  );
});

test("every room and place says what it is for and when it dies", () => {
  for (const room of allRooms) {
    assert.ok(
      room.ledger.purpose.length > 10,
      `${room.id} needs a purpose sentence`,
    );
    assert.ok(
      room.ledger.kill.length > 10,
      `${room.id} needs a kill condition`,
    );
  }
  for (const place of world.mapOnly) {
    assert.ok(
      place.note.length > 10,
      `${place.id} needs a note saying why it exists`,
    );
  }
  for (const room of world.unplaced) {
    assert.ok(room.note, `${room.id} is unplaced, so it must say why`);
  }
});

test("alchemy-lab is retired: no room, no spec home, no map zone", () => {
  assert.equal(
    worldRaw.includes("alchemy-lab"),
    false,
    "the retired room id came back",
  );
  assert.equal(
    "alchemy-lab" in ROOM_TO_SPEC,
    false,
    "ROOM_TO_SPEC still maps alchemy-lab",
  );
  assert.equal(
    Object.values(SPECS).some((s) => s.roomId === "alchemy-lab"),
    false,
    "a Spec still claims the retired room",
  );
});

test("the model carries no hostnames or URLs", () => {
  assert.equal(
    /https?:\/\//.test(worldRaw),
    false,
    "no URLs in the world model",
  );
  assert.equal(
    /\.ts\.net/.test(worldRaw),
    false,
    "no tailnet hostnames in the world model",
  );
});
