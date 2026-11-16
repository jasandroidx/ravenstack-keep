# KEEP BUILD 01 — REPORT

Courtyard spawn, test boxes gone, doors only on the two painted arches.

**Status: done, uncommitted, nothing pushed, no gated MCP tool called.**
Checked against `KEEP-BUILD-01-BRIEF.md` line by line on 2026-11-16 — nothing was missing, so nothing was finished off. The checks below were re-run from scratch this session.

---

## Files changed (5, all in `ui-v2`)

| File | Change |
|---|---|
| `src/lib/hall/world.ts` | `PLAYER_SPAWN` 760,650 → **760,870**; two doorway threshold `WALK` rects; new `HALL_DOORS` const + `DoorHref` type |
| `src/components/hall/keep-hall.tsx` | Hall spawns from `PLAYER_SPAWN`; the six portal definitions replaced by the two arches; `onDoor` → `navigate`; `HallTestCloneScene` removed |
| `src/lib/hall/scene.ts` | portal rectangle + monospace label drawing deleted; "HALL TEST CLONE" banner deleted; `triggerPortal` gains the `href` (page) branch |
| `src/lib/hall/portal.ts` | `targetScene`/`targetSpawn` now optional, `href?` added (a door can leave the map instead of starting a scene) |
| `src/lib/hall/room-scene.ts` | 3-line guard `if (!p.targetScene) return;` — type-only consequence of the optional field; room doors always set it, behaviour unchanged |

`ui/` (frozen pipeline), Valerie's confinement, the Teleportation Room, the `[T]` list, the Library lock and every gated MCP tool were not touched.

No test-door scaffolding survives in `ui-v2`: `HallTestCloneScene`, `stairs-to-yard-test`, `library-to-recon`, `workshop-to-search`, `yard-to-sploit`, `hall-to-citadel`, `yard-to-tower` all return zero matches outside this report.

---

## What was built

### 1. Spawn
`PLAYER_SPAWN = { x: 760, y: 870 }` — courtyard flagstones, left of the fountain. Verified against the painting, not assumed: the yard `WALK` rect is 640,720,520,240 and the fountain `SOLID` starts at x848, so 760/870 is clear floor. `keep-hall.tsx` no longer duplicates the number; it imports `PLAYER_SPAWN`.

### 2. The six test doors are gone
Deleted from the Hall: `stairs-to-yard-test`, `library-to-recon`, `workshop-to-search`, `yard-to-sploit`, `hall-to-citadel`, `yard-to-tower`, plus their cyan `setStrokeStyle(4, 0x2de2e6)` rectangles and monospace labels in `scene.ts` (the drawing loop is gone entirely, so nothing is painted over the art). Their trigger checks went with them.

Also deleted: `HallTestCloneScene` and its "HALL TEST CLONE — return door below" banner. Its only door was `stairs-to-yard-test`, so with that door gone the clone was unreachable dead code — and it instantiated a second full `HallScene` (double preload of every skin/NPC sheet). Trivially reversible if you still want the clone as a debug tool: `git checkout -- ui-v2/src/components/hall/keep-hall.tsx ui-v2/src/lib/hall/scene.ts` before you commit anything else.

### 3. Two doors, on the two painted arches only
Measured off `keep-map.jpg` (1792×1008), not guessed — the two doorways were cropped and inspected:

- `library-arch` — trigger x206–254, y652–712 (painted arch bottom-left of the Library wing, opens `/oracle`, the Registry Shelf)
- `workshop-arch` — trigger x1486–1538, y664–722 (painted arch bottom-right of the Workshop, opens `/mechanic`, Valerie's bench)

Both `href`s are the same targets `ZONES` already gives those rooms (`library → /oracle`, `workshop → /mechanic`), so the door goes where the room itself says the room is. They are data-only: `HALL_DOORS` in `world.ts`, consumed by `keep-hall.tsx`; the scene reports the destination through a new `onDoor` event and React owns routing.

Two `WALK` threshold rects were added at the arch mouths (204,606,52,108 and 1484,660,56,66). Without them the arch interiors are outside every walkable rect, so a walk-through trigger could never fire.

**Page rooms stayed out of it.** No door to Recon/Search/Citadel/Tower/Sploit was added, and nothing new was put in the courtyard.

---

## Verification

### Repo checks (AGENTS.md gate, run in `ui-v2`, re-run 2026-11-16)

```
npm run typecheck   → exit 0
npm test            → exit 0   (37 tests, 37 pass, 0 fail)
npm run build:box   → exit 0   (NITRO_PRESET=node-server → ui-v2/.output)
```

### Door geometry — re-proven first-hand this session
Bundled the real `world.ts` and `portal.ts` with esbuild and ran the actual exported functions (not a re-read of them):

```
spawn (760,870)                    walkable=true   zone=yard
flood fill from spawn              45325 walkable cells reached
library-arch  (206,652,48,60)      208 walkable cells, 208 reachable from spawn
workshop-arch (1486,664,52,58)     210 walkable cells, 210 reachable from spawn
portalAt library centre  (230,682) → library-arch
portalAt workshop centre (1513,693) → workshop-arch
portalAt spawn                     → none
zones intersecting an arch         → library, workshop only (nothing in the yard)
```

So both arches are walkable, fully connected to the spawn, correctly identified by the trigger test, and no door exists anywhere the brief forbade one.

### Hall in a real browser — from the original run, NOT re-run this session
Built Nitro server (`.output/server/index.mjs`) on `127.0.0.1:4173`, loaded in Chrome via Playwright at 1280×800:

- canvas mounts, `__keepSceneKey = "HallScene"`
- `__keepSpawn = {x:760, y:870}`, `__keepPlayer = {x:760, y:870}` — spawns exactly on the target tile
- HUD reads **"Yard · unforged"** — the spawn is in the courtyard, not the hall
- frame shows the Ravenlord on open flagstones left of the fountain, with **no cyan boxes or labels anywhere**
- walked the player into the Library wing: HUD flipped to "Library · unforged", the Oracle eye and the shelves rendered clean
- no console errors from the Hall

I did not repeat the browser pass in this session; the numbers above are from the run recorded when the change was made, and the code they were taken against is the same code (diff unchanged since).

### What is still not verified end-to-end
A full walk-through of an arch to fire in the browser was never achieved. The scripted walker (flood-fill path + key driving) wedged the player outside the `WALK` rects at the yard's south-east corner — it pressed up-left and never moved again, a pre-existing movement/collision quirk, not something this change introduced. What that leaves unproven is the last hop: `portalAt` hit → fade → `onDoor` → `navigate`. The trigger test, the reachability proof and typecheck cover everything up to it; the navigate itself is an unexercised new code path. Please walk the Library arch once by hand (from spawn: up the stairs, left through the hall, into the Library wing, out the south door).

---

## Needs your eyes

1. **Where the arches go.** No Library or Workshop room scene exists yet (that's BUILD 02), so each arch currently opens the room's own page. When the Library room scene lands, change that door's `href` to a `targetScene`/`targetSpawn` — `HALL_DOORS` is the only place to edit.
2. **`[T]` still teleports "Great Hall" to {760,650}** (mid-hall, the old spawn). The brief said don't touch the `[T]` list, so it was left; it now disagrees with the spawn.
3. **Spawn HUD says "Yard · unforged"** in amber. The courtyard being "unforged" is a lock-state question, not this issue — same family as the Library unlock you approved.
4. **The Library is still `UNFORGED`** — untouched, as instructed; that's the separate data fix.
5. **Room-page doors still draw cyan boxes.** `RoomScene` (Recon/Search/Sploit/Citadel/Tower interiors) still strokes its return door and labels it (`room-scene.ts:188`). Out of scope here — they're inside the page rooms, not the Hall — but it's the same look you just had me remove.
6. **A React error #419 appears in the console on page load** in the local build (before the canvas mounts). The Hall runs fine after it and nothing in the changed files is a Suspense boundary; it was never confirmed whether the unmodified build shows it too. Worth a look if you see a hydration warning on the box.
7. **`npm ci` was run.** `node_modules` did not exist, and typecheck/tests/build can't run without it. It installed the committed lockfile exactly — no dependency added, `package.json` and `package-lock.json` untouched.
