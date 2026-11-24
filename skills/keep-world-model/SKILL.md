---
name: keep-world-model
description: >
  The one world model for the Keep — rooms, agents, map zones, NPCs, launch
  links and art. Use when adding, renaming or retiring a room; when a room
  appears in the Ledger but not the Hall (or vice versa); when pulse/duty ids
  do not match catalog ids; or when wiring a portal, zone or NPC.
metadata:
  short-description: "Single source of truth for Keep rooms and map"
---

# Keep world model

The Keep is described in exactly one place: `ui-v2/src/lib/keep/keep-world.json`,
validated by `schemas/keep-world.schema.json`. Everything else reads from it.
If you find yourself typing a room id or a zone rect somewhere else, stop — that
is how the current drift happened.

## Why this skill exists — the five vocabularies

Verified 2026-11-24, before the model existed:

| Where                                          | Rooms                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `schemas/keep-rooms.schema.json` (shift board) | `gate, dock, auction-pit, archive, watchtower`                                                          |
| `ui-v2/src/lib/keep/catalog.ts` (Ledger)       | `watchtower, library, great-hall, roost, armory, workshop, yard`                                        |
| `ui-v2/src/lib/hall/world.ts` (ZONES)          | `library, great-hall, gallery-arch, watchtower, workshop, yard, quarantine`                             |
| `ui-v2/src/lib/keep/pulse.fixture.json`        | none — the paper fixture carries no rooms (the invented ones were removed)                             |
| `AGENTS.md` prose                              | "six rooms (great-hall, alchemy-lab, library, armory, observatory, vault)"                              |

`alchemy-lab` (Clawforge's home in `SPECS`) existed in none of the code lists; it
is retired as of 2026-11-24 and the id is gone from `keep-world.json`,
`ROOM_TO_SPEC` and `SPECS`. `quarantine` and `gallery-arch` exist only on the map —
they are `mapOnly` now. `observatory` and `vault` existed only in prose and are
gone from `AGENTS.md`. That is the bug this skill prevents.

**Stage status:** `keep-world.json` exists and `src/lib/keep/world.test.ts` pins
`catalog.ROOMS`, `world.ZONES` and `world.HALL_NPCS` to it. Those three still hold
the data themselves; deriving them from the model is stage 2.

## The model

```jsonc
{
  "schema": "keep-world.v1",
  "map": { "src": "/hall/painted/keep-map.jpg", "w": 1792, "h": 1008 },
  "rooms": [
    {
      "id": "great-hall",
      "name": "Great Hall",
      "wing": "Core",
      "ledger": {
        "occupant": "Raziel",
        "role": "Sovereign orchestrator",
        "lock": "live", // live | unforged | locked
        "purpose": "One sentence. Mandatory.",
        "kill": "Kill condition. Mandatory.",
      },
      "spec": "raziel", // key in agents/*.agent-spec.json, or null
      "href": null, // route the room links to, or null
      "zone": { "x": 540, "y": 220, "w": 720, "h": 470 },
      "pulse": { "boxIds": ["orchestrator-throne"], "slugs": ["great-hall"] },
    },
  ],
  // first match wins, so a place painted INSIDE a room must come before it:
  // the gallery doorway before great-hall, the cell before yard. Put them the
  // other way round and the doorway reports the hall and the cell's entry
  // event never fires. `world.test.ts` fails if a zone's centre resolves
  // elsewhere.
  "zoneOrder": ["gallery-arch", "quarantine", "library", "great-hall"],
  "mapOnly": [], // zones drawn on the painting with no Ledger row (quarantine, gallery arch)
  "unplaced": [], // Ledger rows with no painting yet (armory, roost)
  "npcs": [
    // Top-level, not nested: `place` may differ from the room's occupant
    // (Corvid stands in the yard because the Roost has no painted floor).
    {
      "id": "raziel",
      "name": "Raziel",
      "role": "Sovereign Arch-Orchestrator",
      "place": "great-hall",
      "x": 904,
      "y": 575,
      "radius": 64,
      "actor": "/hall/sprites/raziel.png",
      "actorH": 68,
      "greeting": "The hall is live. Walk it.",
    },
  ]
}
```

## The map is generated, never drawn

`cd ui-v2 && npm run world:map` writes `docs/keep/map.svg` from the code the game
runs — `world.WALK`/`SOLID`/`ZONES`/`HALL_NPCS`, `portals.HALL_PORTALS`, and
reachability from `walkable()` itself. It draws walk floors, solid props, zones,
doors, occupants with their wander leash, the spawn, and a findings list (dead
doors, door/room clashes, floors you cannot reach, unreachable doors).
`npm run world:map:check` and `scripts/world-map.test.mjs` fail when the
committed SVG is out of date, so the blueprint cannot drift. Do not hand-edit it.

## Rules

1. **`id` is the only key.** `catalog.ROOMS`, `catalog.SPECS[*].roomId`, `world.ZONES`,
   `world.HALL_NPCS`, `pulseForSlug()` and the `/rooms/$slug` route all resolve
   through it. Renaming an id is a migration, not an edit.
2. **The box wins at runtime.** Room existence, lock state and occupancy come from
   `keep.db` via `/api/duty` and pulse. The JSON supplies design and geometry only.
   A room in the JSON but absent from the box reads `unknown` — never `live`.
3. **`pulse.boxIds` is the reconciliation table.** `orchestrator-throne` →
   `great-hall` lives in data, not in a fixture.
4. **A room is in `rooms` or `unplaced`, never both, never neither.** Anything
   walkable needs a `zone`; anything with a `zone` must be in `rooms` or `mapOnly`.
5. **`mapOnly` exists so a painting detail does not need a fake agent.** The
   Quarantine Cell and the Grand Gallery arch are places, not agents.
6. **`unplaced` is honest, not shameful.** `armory`, `roost`, `alchemy-lab` are
   real capabilities with real Specs and no painted floor. Listing them there is
   correct; inventing a zone for them is not.
7. **Every entry in `rooms` needs `purpose` + `kill`.** AGENTS.md: one agent, one
   purpose sentence, kill condition mandatory. Empty UNFORGED rooms are fine —
   empty _undescribed_ rooms are not.
8. **No hardcoded box URLs.** Launch links come from env (`KEEP_LAUNCHER_*`);
   absent config renders "not configured". Never commit a tailnet hostname.

## Adding a room

1. Decide which case it is: painted and live (`rooms`), painted detail
   (`mapOnly`), or described only (`unplaced`).
2. Add the entry to `keep-world.json`. Ids are lower-kebab, stable.
3. If it is a real agent, the matching `agents/<id>.agent-spec.json` must exist
   and `spec` must point at it.
4. If it is walkable, add `zone`, ensure the rect lies inside `WALK` in the
   painting, and add any blocking prop as `SOLID` in the Hall's own data.
5. If it has an occupant on the map, add `npc` with the painted art path.
6. If the box names it differently, record that in `pulse.boxIds`.
7. Run `npm test` — `src/lib/keep/world.test.ts` asserts uniqueness, zone
   coverage, spec existence and pulse-slug validity.

## Forbidden

- Adding a room to `catalog.ts`, `world.ts`, `pulse.fixture.json` **and** a schema
  enum separately "for now". One file, one entry.
- Inventing a lock state, an occupant, or an "OK" status to make a room look live.
- Painting art in code (procedural rects standing in for a painting).
- Writing a Funnel URL, tailnet host, token or raw IP into the model.

## Verify

`npx tsc --noEmit`, `npm test` (world test), `npm run build:box`, then walk the
Hall: every zone shows its name, every NPC its prompt, every `href` resolves.
