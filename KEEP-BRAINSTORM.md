# KEEP BRAINSTORM

Brainstorm only. No code changed, nothing committed, no gated MCP tool called.

---

## What I actually read / ran

**Code read end-to-end:** `ui-v2/src/lib/hall/{scene,world,locomotion,room-scene,portal,barks,herald,audio}.ts`,
`ui-v2/src/components/hall/keep-hall.tsx`, `ui-v2/src/lib/keep/{catalog,ollama,ai}.ts`,
`ui-v2/src/lib/keep/server.ts` (hall server fns), `ui-v2/src/routes/index.tsx`,
`mcp/src/{http_api,ollama_service,duty}.py`, `ACTIVE.md`, `tools/walk.mjs`.

**keep-mcp (stdio, throwaway `mcp/data/keep.db`) answered:**

- 6 rooms. `library` = **UNFORGED** with Oracle as occupant; `vault` = **locked**; everything else `live`.
- 5 Agent Specs: `raziel` (live), `clawforge`, `corvid`, `oracle`, `scribe` (approved). **No `valerie`.**
- `get_agent_spec("valerie")` → `unknown_agent`. The spec is `mechanic` (name "Valerie", room `workshop`).
- `get_rooms_snapshot()` → `total: 0` (no shift-board snapshot written in this DB).
- `get_routing_status()` → `healthy: false`; `/api/gates`, `/api/ambient-event`, `/api/dialogue` all unreachable from this box (expected here — that's the live `:8112` plane, not this throwaway DB).
- `get_path("Great Hall","Library")` → 1 step east. Spatial model is a clean manhattan grid.

**Measured asset dimensions (checked, not assumed):**

| asset | real size | how the code uses it |
|---|---|---|
| `hall/painted/keep-map.jpg` | **1792×1008** | matches `MAP_W`/`MAP_H` exactly |
| `hall/rooms/recon.jpg` | 1600×1600 | matches `RoomScene` `mapW/mapH` 1600×1600 |
| player/NPC sheets | 128×160 | 4×4 of 32×40, drawn at 54×68 |
| `hall/tiles/*.png` | 48×48 | **1792/48 = 37.33, 1008/48 = 21** — 48px tiles can never align to this painting |
| `assets/fx/campfire.png` | 160×256 | 5×8 of 32×32 = exactly the 40 frames the code asks for ✅ |
| `assets/fx/torch.png` | 192×128 | 6×4 of 32×32; frames 6–11 are row 2 ✅ |
| `assets/fx/portal.png` | 640×64 | 10 frames of 64×64, matches the launcher sheet ✅ |
| `hall/painted/talk-valerie.jpg` | 1152×1728 | portrait plate, tall |

**Craft CLIs on this machine:** `figcraft`, `photocraft`, `cadcraft`, `craft-anything`, `godot` present. **`anicraft` and `deckcraft` are not installed** — so any idea needing animated sprite sheets is out; every animation below is drawn in code or tweened from frames that already exist.

---

## Corrections to the brief's "known gaps" (before I build on them)

Four of the listed gaps are out of date. Building on the stale version would waste work:

1. **"NPCs are fixed-position statues with no wander loop"** — false. `scene.ts` has `updateNpcWander()`: waypoint picking against `walkable()`, per-direction walk anims, proximity stop-and-face, 30s proximity lines, and Valerie hard-confined to `VALERIE_WORKSHOP` (1370,220,310,440). The real gap is that wander is *aimless* — no destinations, no purpose, no reaction to work.
2. **"/api/ambient-event exists but the Hall never uses it"** — half false. `keep-hall.tsx` → `herald.ts:pickHeraldLineAsync()` → `fetchAmbientEvent()` → `/api/ambient-event` every 45–90s. It works. The output only ever lands as an italic line in the HUD corner; it never reaches the scene. Real gap, wrong wording.
3. **"Dialogue is single-threaded to one Ollama endpoint with no FreeLLMAPI fallback"** — true only for the *greeting* leg. `barks.ts:pickBarkAsync()` → `fetchNpcDialogue()` → `/api/dialogue` → `ollama_service.py` (Ollama only). But the Ask box uses `talkInHall()` → `ai.ts:talkHall()` → `complete()`, which is FreeLLMAPI-first with Ollama fallback. So the Hall has two dialogue planes and only one of them has the fallback.
4. **"The Hall code has no doors to the Raven Pages"** — false in the exact sense: `keep-hall.tsx` already builds five page scenes (`ReconRoomScene`, `SearchRoomScene`, `SploitRoomScene`, `CitadelRoomScene`, `TowerRoomScene`) and six portals out of the Hall. The problems are different and worse: those doors are unlabelled boxes in painted rooms, four of the five rooms render `/hall/tiles/floor_dim.png` stretched 48→1600 (a declared placeholder, which the locked rules forbid), and the page list (`…Sploit…`) contradicts the locked five (Citadel, Search, Panel, Tower, Recon).

Also: the catalogue is **seven** rooms (`catalog.ts:ROOMS`), not eight.

Room-model census, for the record: DB spatial **6** · catalogue **7** · Hall zones **7** · duty `/api/rooms` **5** (gate, dock, auction pit, archive, watchtower) · Hall NPCs **6** · Agent Specs **5**. That is five different answers to "what rooms does the Keep have".

---

## The ideas, ranked best-first

Scoring: **Fit** = does it hold the locked design · **Effort** = small / medium / large · **Wow** = what the player feels. A dependency note says when an idea needs another one first.

| # | Idea | Fit | Effort | Wow |
|---|---|---|---|---|
| 1 | Start in the courtyard; make doors real doors | high | small | high |
| 2 | Walk into the Library wing and ask it something | high | medium | high |
| 3 | Weather and birds over the courtyard | high | medium | high |
| 4 | Live roster decides who stands in the Hall | high | medium | high |
| 5 | Sealed doors look sealed | high | small | medium |
| 6 | Night shift: lanterns, windows, hour-aware light | high | small–med | med-high |
| 7 | Valerie works the bench, not the wander loop | high | small–med | med-high |
| 8 | One room model, three consumers | high | medium | low now, multiplier |
| 9 | The cell remembers out loud | high | small–med | med-high |
| 10 | One talk plane for the Hall | high | small | low–medium |
| 11 | A sound bed per area | high | small | medium |
| 12 | Talk plates for Raziel and Corvid (`photocraft`) | high | small | medium |
| 13 | Real floors for the page rooms (`photocraft`) | high | small–med | medium |
| 14 | Collision read from the painting | high | medium | medium (felt, not seen) |

---

### 1. Start in the courtyard; make doors real doors

Spawn the player on the yard flagstones, and replace the six cyan portal rectangles with drawn doorways that swing open as you approach.

**Files:** `ui-v2/src/lib/hall/world.ts` (`PLAYER_SPAWN`, `WALK`, `ZONES`), `ui-v2/src/components/hall/keep-hall.tsx` (Hall constructor `spawn` + `portals`), `ui-v2/src/lib/hall/scene.ts` (`create()` portal drawing, portal trigger check), `ui-v2/src/lib/hall/portal.ts` (add `state`, `kind`).

**Why:** the locked design says the player starts in the courtyard and doors open and close. Today `PLAYER_SPAWN = {x:760, y:650}` — that is inside `ZONES` great-hall (540,220,720,470) and inside the hall `WALK` rect, i.e. mid-hall. Every door is a `setStrokeStyle(4, 0x2de2e6)` rectangle with a monospace label sitting on a painted dungeon. Moving spawn to **{x:760, y:870}** is verified walkable: yard `WALK` is 640,720,520,240 and the fountain `SOLID` starts at x848, so 760/870 is clear flagstone. The map already has two painted arched doors (library wing bottom-left, workshop bottom-right); the portal rects should sit on those, not float in the corridor.

**Effort:** small.

---

### 2. Walk into the Library wing and ask it something

A real Library room scene you enter through the Hall's left doorway: shelves, the Oracle eye, and a query desk that answers from the vault with citations.

**Files:** `ui-v2/src/components/hall/keep-hall.tsx` (new `LibraryRoomScene` + the Hall→Library portal), `ui-v2/src/lib/hall/room-scene.ts` (furniture markers, launcher, `mapSrc`), `ui-v2/src/lib/hall/world.ts` (door rect, `ORACLE_TALK`), `ui-v2/src/lib/keep/server.ts` (`talkInHall`/`askOracle`), `mcp/src/http_api.py` (`/api/spatial-memory` and `/api/compact` already exist and are unused by the Hall), `ui-v2/migrations/0003_quarantine.sql` (read path for evidence).

**Why:** the Library wing is required by the locked design and it is the only room whose answer *is* the product. Today you can physically stand in the painted library (zone rect 140,120,380,540) and nothing happens — the Oracle is an eye floating in the great hall. This is the room that makes the Keep worth opening.

**Art constraint, checked:** don't invent a new painting. Crop the library region of `keep-map.jpg` — 380×540 at (140,120) — and 2× nearest-neighbour it to **760×1080**, then set `mapW/mapH` to 760/1080. `photocraft` does the crop and resize in one pass and can print the result dimensions for verification. Real painted art, no gray floor.

**Effort:** medium (the room and dialogue reuse everything that already exists; only the scene wiring is new).

---

### 3. Weather and birds over the courtyard

A code-drawn weather layer — rain streaks, drifting embers, a small flock crossing the yard — driven by the `/api/ambient-event` line that already arrives every 45–90s.

**Files:** `ui-v2/src/lib/hall/scene.ts` (new weather layer above depth 20 + update), `ui-v2/src/lib/hall/world.ts` (`WEATHER` zones + `HALL_LIGHTS` style config), `ui-v2/src/lib/hall/herald.ts` (`category` → effect map, add a `weather` variant), `ui-v2/src/components/hall/keep-hall.tsx` (pass the line to the scene, not just state).

**Why:** this is the cheapest possible "the Keep is alive" signal and it uses a live data path that is already paid for. The herald text is good writing rendered as 10px italics in a corner; the same sentence as actual rain on the courtyard flagstones is the whole point of a walkable scene.

**Constraint:** `anicraft` is not installed, so no bird sprite sheets. Draw the flock as 3–5 short two-pixel strokes in a `Graphics` object with a slow sine path — cheaper than a texture, stays crisp under `pixelArt: true`, and deletes cleanly on scene restart (the reused-scene black-canvas bug class from `scene.ts`'s own comments).

**Effort:** medium.

---

### 4. Live roster decides who stands in the Hall

An agent that is on leave should not be standing in the Hall with a status line. Drive sprites, chips and bubbles from the real duty board.

**Files:** `ui-v2/src/components/hall/keep-hall.tsx`, `ui-v2/src/lib/hall/scene.ts` (new `setNpcPresence(id, state)`), `ui-v2/src/lib/keep/duty.ts` (server fn already returns the board), `mcp/src/duty.py` (roster source of truth), `ui-v2/src/lib/keep/catalog.ts` (`ROOM_TO_SPEC` is the id bridge).

**Why:** this is the repo's own NO FAKE UI rule, applied to the room it matters most in. Right now `HALL_NPCS` is a constant array: Raziel is always in the hall, Valerie always at her bench, regardless of `agent_status` or spec status. The duty board already carries `busy|idle|leave` + `last_real_work` per agent — using it turns the Hall from a diorama into a dashboard.

**Dependency:** needs #8 (or at least the `valerie`↔`mechanic` id bridge) to be honest about who is who.

**Effort:** medium.

---

### 5. Sealed doors look sealed

Door plate reflects real lock state: a live door is lit, an UNFORGED door is chained and dark, the Vault is barred.

**Files:** `ui-v2/src/lib/hall/scene.ts` (portal draw), `ui-v2/src/lib/hall/world.ts` (`ZONES[].lock`, portal list), `ui-v2/src/lib/keep/catalog.ts` (`ROOMS[].lock`), `ui-v2/src/components/hall/keep-hall.tsx` (pass lock into `portals`), `mcp/src/server.py` (`lock_state`).

**Why:** the Keep's entire promise is "doors stay sealed until you approve a Spec", and the painted map is full of doors — but every door in code is the same cyan rectangle whether it is live, `UNFORGED`, or the locked Vault. Sealing is visible in the data (`get_castle_map` returned `library: UNFORGED`, `vault: locked`) and invisible on screen. Small change, large thematic payoff.

**Constraint:** the 48px `door_live.png`/`door_sealed.png` tiles are from the frozen `ui/` pipeline and cannot align to a 1792×1008 painting (37.33 tiles wide). Draw door state as a stroke + chain/mote overlay sized to the portal rect instead of importing those tiles.

**Effort:** small.

---

### 6. Night shift: lanterns, windows, hour-aware light

Replace the flat MULTIPLY wash with painted light sources that brighten as the hour turns.

**Files:** `ui-v2/src/lib/hall/scene.ts` (`applyTimeOfDay`, add a 60s repaint so a session that crosses dusk changes), `ui-v2/src/lib/hall/world.ts` (`LANTERNS`, same coord space as the existing `HALL_LIGHTS`).

**Why:** `applyTimeOfDay()` currently picks one of four RGB multipliers on `new Date().getHours()` at `create()` only. The painting is full of lanterns and braziers with painted glow — at night the tint dims the glow along with the stone, so the room looks wrong rather than dark. Additive sprites at the painted lantern positions (the existing `HALL_LIGHTS` array is already coordinates in the 1792×1008 space, so it's the same discipline) plus a window-shaft rectangle that follows the hour. `HALL_LIGHTS` flicker loop exists and is currently dead code because the point lights were removed — this is the cheap way to reuse it without the "flat colour blob" problem the comments describe.

**Effort:** small–medium.

---

### 7. Valerie works the bench, not the wander loop

Give Valerie stations inside the workshop — bench, cauldron, shelf — with a hammer SFX, a spark burst, and a real "working" state while a mechanic job runs.

**Files:** `ui-v2/src/lib/hall/scene.ts` (`VALERIE_WORKSHOP`, `pickWaypoint`, the 40% work-pause branch), `ui-v2/src/lib/hall/audio.ts` (new `playAnvil()`), `ui-v2/src/lib/hall/world.ts` (workshop station coords), `ui-v2/src/components/hall/keep-hall.tsx` (ask/run hooks).

**Why:** she is the best-behaved NPC in the codebase — hard confinement to 1370,220,310,440, a facing change during "work" pauses — and the reward for that discipline is currently that she wanders aimlessly with a 6s pause. Stations turn confinement into character, which is exactly the locked design ("may walk around it and work there"). The spark burst already exists in `keep-hall.tsx:burst()` for teleports; reuse it.

**Constraint:** keep `VALERIE_WORKSHOP` exactly as is. Do not widen it toward the hall↔workshop corridor (1230,270,120,160) — that rect is the bug the current comment is guarding against.

**Effort:** small–medium.

---

### 8. One room model, three consumers

A single room table that the Hall zones, the catalogue, the duty board and the MCP spatial six all read from.

**Files:** `ui-v2/src/lib/keep/catalog.ts` (`ROOMS`, `ROOM_TO_SPEC`), `ui-v2/src/lib/hall/world.ts` (`ZONES`, `HALL_NPCS[].id`), `mcp/src/duty.py` (five workplaces), `mcp/src/server.py` (rooms seed / `lock_state`), `mcp/src/http_api.py` (`castle_map`, `rooms_state_http`), `ui-v2/src/routes/rooms.$slug.tsx`.

**Why:** five answers to "what rooms does the Keep have" (see census above) means every label is a guess: the door says "Library", the chip says `UNFORGED`, `/rooms/library` says something else, `/api/rooms` doesn't list it at all, and `get_agent_spec("valerie")` fails because the spec is `mechanic`. This is the multiplier idea — #4, #5 and #9 all get more honest for free once it exists — but it is invisible on its own, so it should not be first.

**Shape:** one `ROOM_IDS` const (spatial id, Hall zone id, catalogue slug, spec id, display name, lock), imported by `world.ts` and `catalog.ts`; the Python side keeps its own table but gains a test that the ids match. Do not make the Hall depend on a network read for its own layout.

**Effort:** medium.

---

### 9. The cell remembers out loud

When you pass the Quarantine Cell, the Oracle reads the newest claim's evidence — not just its count.

**Files:** `ui-v2/src/lib/hall/scene.ts` (zone `quarantine`, `flareQuarantine`), `ui-v2/src/components/hall/keep-hall.tsx` (`onEnterCell`), `ui-v2/src/lib/keep/server.ts` (`listQuarantine`), `ui-v2/migrations/0003_quarantine.sql`, `ui-v2/src/lib/hall/audio.ts` (`playChainRattle` already exists and is unused outside the Oracle).

**Why:** the cell is the Keep's moral centre and the only room whose data is genuinely dramatic, and the wiring is 90% done — `flareQuarantine`, the black-and-white tableau, `listQuarantine`, real evidence stored with each claim. What's missing is a beat: the chain rattle on approach, the evidence line spoken as a bubble, and a door that reads `N open` from the real row count instead of nothing.

**Effort:** small–medium.

---

### 10. One talk plane for the Hall

Route Hall greetings and ask-bubbles through the same FreeLLMAPI-first ladder every other surface uses.

**Files:** `ui-v2/src/lib/hall/barks.ts` (`pickBarkAsync`), `ui-v2/src/lib/keep/ollama.ts` (`fetchNpcDialogue`), `ui-v2/src/lib/keep/ai.ts` (`talkHall` / `complete`), `mcp/src/ollama_service.py` (`PERSONA_PROMPTS`, `/api/dialogue` with no FreeLLMAPI leg).

**Why:** when the box's Ollama is cold, every NPC in the Hall goes silent and falls back to preset lines, while the Oracle page, the table and the mechanic all keep answering through FreeLLMAPI. `ollama_service.py` is also the only place the NPC voices are defined twice (once in `barks.ts` rules, once in Python prompts). Collapsing to one plane removes a whole failure mode and a drift source.

**Constraint:** keep the 4s timeout. A greeting must never block a scene; the preset pool is the correct fallback and should stay the fallback, not become the guarantee of silence.

**Effort:** small.

---

### 11. A sound bed per area

A low drone, drips and a distant forge per zone — one loop each, synthesised, no files.

**Files:** `ui-v2/src/lib/hall/audio.ts` (new `playAmbience(zone)` / `stopAmbience()`), `ui-v2/src/lib/hall/scene.ts` (zone-change hook already fires `eventsOut.onZone`), `ui-v2/src/components/hall/keep-hall.tsx` (settings.sound).

**Why:** `hallAudio` is a genuinely good procedural engine and every single sound is a one-shot. Standing still in the Hall is silent, which reads as "the page is broken" rather than "the Keep is quiet". One filtered noise loop + a slow sine at low gain per zone, gated by `document.hidden` and `settings.sound`, is maybe 40 lines in the file that already owns the AudioContext.

**Effort:** small.

---

### 12. Talk plates for Raziel and Corvid

Give the two NPCs without a plate a real one, cut from art that already exists.

**Files:** `ui-v2/src/lib/hall/world.ts` (`HALL_NPCS[].talkScene` / `portrait`), `ui-v2/src/components/hall/talk-sheet.tsx`, new `ui-v2/public/hall/portraits/raziel.jpg`, `…/corvid.jpg`.

**Why:** Oracle has `talk-oracle.webp`, Valerie has `talk-valerie.jpg` + a portrait; Raziel and Corvid fall back to `talk-scene.jpg`, which is the whole Hall painting — so opening a conversation with the orchestrator shows you the room you're standing in. Use `photocraft` on `hall/sprites/raziel.png` (128×160, frame 0 is 32×40 at 0,0): crop, 8× nearest → 256×320 portrait. Same for `corvid.png`. That is a real portrait derived from real art, not generated slop, and `photocraft --help` can verify the output size before it ships.

**Effort:** small.

---

### 13. Real floors for the page rooms

Replace the stretched 48px `floor_dim.png` with a painted floor tile that tiles evenly.

**Files:** `ui-v2/src/components/hall/keep-hall.tsx` (`mapSrc`/`mapW`/`mapH` for Search/Sploit/Citadel/Tower), new `ui-v2/public/hall/rooms/floor_stone_320.png` (via `photocraft`), `ui-v2/src/lib/hall/room-scene.ts` (tile the map instead of one stretched image).

**Why:** the locked rule is "real free tiles, never a gray floor placeholder", and four of the five page rooms literally render `floor_dim.png` at 48×48 scaled to 1600×1600 — a 33× blur — while their own furniture label says `ROOM PAINTING — PLACEHOLDER`. This is the honest-art fix, and it's cheap: a 320×320 painted floor × 5 = exactly 1600, so the room size stays and `RoomScene` only grows a tile pass. Not the Teleportation Room, not a new page — just the rooms that already exist.

**Effort:** small–medium.

---

### 14. Collision read from the painting

Generate a walk mask from `keep-map.jpg` once and stop hand-drawing `WALK` rectangles.

**Files:** new `tools/walkmask.mjs` (build-time, Node), `ui-v2/public/hall/painted/keep-map.walk.json`, `ui-v2/src/lib/hall/world.ts` (`walkable()`), `ui-v2/src/lib/hall/scene.ts` (`walkable` call sites unchanged).

**Why:** `WALK` is 10 rects and `SOLID` is 6, hand-guessed against a 1792×1008 painting. Players still click a painted pillar and hit nothing, or walk through painted benches — the code even carries a wedge-clear hack in `update()` (`destStallMs > 550`) and a smooth-slide probe to paper over it. An 8px-sampled mask is 224×126 cells (~28KB JSON) and removes the whole class. No GPU, no runtime cost, build-time only.

**Effort:** medium (the mask is easy; hand-tuning threshold on a dark painting is the work).

---

## Held — locked design says no, or needs a human yes

**The Teleportation Room** — planned, not built. Do not propose building it here; item-by-item approval only. Flagging one live contradiction while it stays parked: the current `[T]` modal in `keep-hall.tsx` (`TELEPORT_TARGETS`) lists **Recon, Search, Sploit, Citadel, Tower**, but the locked set is **Citadel, Search, Panel, Tower, Recon** (plus Hall and Courtyard returns). `Sploit` is not one of the five; `Panel` is missing; `HallScene` and the courtyard return are there but unlabelled as such. That modal is a dev shortcut, not the room — leave the room alone, but fix the list so nobody learns the wrong five.

**Do not touch:** Valerie's workshop confinement (1370,220,310,440) · the single gateway / single OpenClaw (page rooms stay launchers into existing pages, never re-implemented) · Library answers must stay vault-backed with citations (the `askOracle` "retrieval missed → not-in-knowledge" path is load-bearing) · the gated MCP tools.

**Proposals only — never called by me, each needs your explicit yes:**

- `unlock_room("library")` — `keep.db` says `library` is **UNFORGED** while its spec is approved and Oracle/Scribe are its occupants. That is the one lock-state inconsistency in the model.
- `approve_spec("mechanic")` — Valerie's spec is still `draft`, and its id is `mechanic`, not `valerie`. `get_agent_spec("valerie")` returns `unknown_agent` today.
- `upsert_agent_spec` — only if you want the Hall NPC id to match the spec id (this is the #8 fix, gated).
- `write_room_note` — after something is actually built, not before.

**Rejected option, for the record:** Phaser → Godot. `godot` is installed and the local-godot skill covers it, and Godot would give real tilemaps, 2D lights and a proper animation player. But the Hall is 1,300 lines of working Phaser with signed-off art, a synth engine, and a working portal system, against $0 and no GPU. Migrating is a large rewrite for lighting quality that #6 gets most of the way to in a small change. Not worth it.

---

## Start here — 3 to do first, in order

1. **Start in the courtyard; make doors real doors** (#1, small). One constant, six portals, one draw call. It makes the locked design true on the first frame and it is the cheapest test of whether the doorway geometry reads against the painting.
2. **Weather and birds over the courtyard** (#3, medium). Reuses a live API path the Hall already pays for, needs no new assets or CLIs, and is the single biggest "this place is alive" jump per line of code.
3. **Walk into the Library wing** (#2, medium). The required room, the product answer, and the first time the Keep's whole thesis (walk to a room, ask it something, get a cited answer) actually happens in the Hall rather than on a page beside it.

If you only ever do one, do #2 — but #1 first, because walking into the Library through a painted door is worth much more than walking into it through a cyan box.
