# KEEP BRAINSTORM 2 — what the Craft programs change

Brainstorm only. **No code changed, no commits, nothing pushed, no gated MCP tool called.**
Build #1 is untouched by this pass; it stays as it was (uncommitted, checks green — see `KEEP-BUILD-01-REPORT.md`).

---

## What I actually ran, on this machine

**Craft binaries (checked with `which`, versions from `<app>-cli --version`):**

| Program | Here? | Version | Notes |
|---|---|---|---|
| AniCraft | **yes** | 0.2.1 | `anicraft-cli commands` → **240 engine commands** |
| PhotoCraft | **yes** | **0.22.0** | subcommands: `convert info run batch droplet commands mcp serve` |
| FigCraft | yes | 0.17.0 | |
| EffectCraft | yes | 0.23.1 | |
| VectorCraft | yes | 0.23.0 | |
| Craft Anything | yes | 0.6.0 | |
| MaterialCraft | yes | — | `--version` not run for this one; binary present |
| DesignCraft | yes | — | present, no job in this Keep |
| CADCraft | yes | 0.19.0 | present, no job in this Keep |
| **DeckCraft** | **no** | — | not installed |
| **SoundCraft** | **no** | — | not installed |
| **FilmCraft** | **no** | — | not installed |
| **WordCraft** | **no** | — | not installed |
| **TextureCraft** | **no** | — | not installed |
| GridCraft / LightCraft / PdfCraft | **no** | — | not installed |

**Assets measured, not assumed** (`file` on every file under `ui-v2/public/hall` + `/assets`):

- `keep-map.jpg` **1792×1008** = exactly `MAP_W`/`MAP_H` ✅
- `talk-scene.jpg`, `hall-close.jpg` also 1792×1008
- `talk-valerie.jpg` and `portraits/valerie.jpg` 1152×1728; `talk-oracle.webp` **896×896** (a first `file` pass printed `1x895` — that was the regex, the real header says 896×896)
- `rooms/recon.jpg` **1600×1600** = exactly the room canvas
- player/NPC sheets **128×160** = 4×4 of **32×40**, drawn at 54×68
- `oracle-eye.png` 96×96, `oracle.png` 64×64, `player.png` 128×128
- `fx/torch.png` 192×128 (6×4 of 32), `fx/campfire.png` 160×256 (5×8 of 32), `fx/portal.png` 640×64 (10×64)
- `hall/tiles/*.png` **48×48** — and 1792/48 is 37.33, so these can never tile the painting

**Code re-read end to end for this pass:** `world.ts`, `scene.ts` (all 1,100 lines), `room-scene.ts`, `keep-hall.tsx`, `audio.ts`, `keep/catalog.ts` — plus the BUILD 01 diff.

---

## Two corrections to Brainstorm 1, before anything builds on them

1. **"`anicraft` is not installed, so no sprite sheets" — wrong on this machine.** AniCraft 0.2.1 is at `/usr/bin/anicraft-cli` with 240 commands. Every idea in Brainstorm 1 that was downgraded because "no animation possible" (#3's birds, #7's bench work, the sprite polish) needs re-reading against that fact. The rest of this document does that.
2. **Version drift.** Brainstorm 1's per-app notes came from the skill cards; the binaries here are older than the cards say: PhotoCraft **0.22.0** (card says 0.23.1), FigCraft 0.17.0 (0.18.1), VectorCraft 0.23.0 (0.24.1), EffectCraft 0.23.1 (0.24.1), CADCraft 0.19.0 (0.20.1), Craft Anything 0.6.0 (0.6.1). The binary wins — treat the cards' counts as upstream, not local.

---

## What these programs honestly can and cannot do here

Craft is a set of **editors and bakers**, not an art generator. None of them draws a new Keep painting, and there is no image-generation route wired into this machine (Muse/Horde are a different, deliberate path). So:

- **PhotoCraft** can crop, resize (nearest for pixel art), layer, colour, and export — from art that already exists. It is the honest tool for "use the painting we have".
- **AniCraft** tweens art you give it: keyframes, easing, camera, then bake to a sprite sheet, PNG sequence, GIF, Lottie or video. It cannot invent a wing, an arm or a new pose. It can smooth a cycle that is already drawn.
- **EffectCraft** composites: bloom, blur, grade, roto, render to frames or video. Same limit — it works on layers it is given.
- **FigCraft** designs interfaces (frames → PNG), so it fits design-before-build, not the game canvas.
- **VectorCraft** makes SVGs that stay crisp — real use for marks and plates, not for painting.
- **SoundCraft is absent**, so the sound bed idea (Brainstorm 1 #11) stays procedural Web Audio. No ambience files.

That constraint is what makes the list below short and specific instead of "generate better art".

---

## The ideas, ranked best-first

Fit = holds the locked design · Effort = small / medium / large · Wow = what the player feels.
Needs = which program, and whether it is actually installed here.

| # | Idea | Fit | Effort | Wow | Needs |
|---|---|---|---|---|---|
| 1 | Doors made of the painting's own stone | high | small | medium | PhotoCraft ✅ |
| 2 | Valerie swings the hammer | high | small–med | med-high | AniCraft ✅ |
| 3 | Every room is a window into the same painting | high | medium | high | PhotoCraft ✅ |
| 4 | Six-frame walk cycles | high | medium–large | high | AniCraft ✅ |
| 5 | The Oracle manifests for real | high | medium | med-high | EffectCraft ✅ |
| 6 | Design the Library desk before building it | high | small | medium | FigCraft ✅ |
| 7 | Page-room floor from a baked stone tile | high | small–med | medium | MaterialCraft ✅ |
| 8 | Room sigils as SVG | high | small | low–med | VectorCraft ✅ |
| 9 | A first-visit title card | med | small | medium | AniCraft ✅ |

---

### 1. Doors made of the painting's own stone

Crop each of the two painted arches out of `keep-map.jpg` at its real size and export two states per arch — **lit** and **sealed** (darkened, chained). Phaser draws that image instead of `setStrokeStyle(4, 0x2de2e6)`, and the state comes from `ZONES[].lock`. `RoomScene`'s cyan `RETURN → HALL` boxes (`room-scene.ts:188`) get the same treatment, which is the look you had me delete from the Hall but left behind inside every page room.

**Files:** new `ui-v2/public/hall/doors/{library,workshop}-arch-{live,sealed}.png`; `ui-v2/src/lib/hall/world.ts` (`HALL_DOORS` gains `art` + `lock`); `ui-v2/src/lib/hall/scene.ts` (image instead of rectangle, in `create()`); `ui-v2/src/lib/hall/room-scene.ts` (return door); `ui-v2/src/components/hall/keep-hall.tsx` (pass the lock through).

**Why:** the Keep's whole promise is "doors stay sealed until you approve a Spec" and the sealing is invisible — every door in code is the same cyan rect whether it's `live`, `UNFORGED`, or the locked Vault. This is Brainstorm 1's #5, done with the painting's own pixels instead of a stroke and a label. Same size, same position, nothing invented.

**Shape:** the arch regions are already measured (206,652,48,60 and 1486,664,52,58 for the triggers — crop the whole painted arch around those, roughly 120×180, and keep the trigger rect as the trigger). Do it in a layered `.pcraft` so the sealed variant is a second layer state of the same crop, and print dimensions with `photocraft-cli info` before anything is installed.

**Effort:** small. **Two-yes:** the pair of PNGs is the review artefact.

---

### 2. Valerie swings the hammer

Her "work pause" today is: stop moving, face up, wait 6–12s (`scene.ts`, the `Math.random() < 0.4` branch). AniCraft can bake a 6-frame loop from her existing sprite and a hammer-stroke keyframe, and the pause becomes actual work — plus `playAnvil()` in `audio.ts`, which does not exist yet (every other sound in that file does).

**Files:** new `ui-v2/public/hall/sprites/valerie-work.png`; `ui-v2/src/lib/hall/scene.ts` (anim create + the work-pause branch); `ui-v2/src/lib/hall/audio.ts` (`playAnvil()`); `ui-v2/src/lib/hall/world.ts` (only if the sheet key belongs next to `VALERIE_ACTOR`).

**Why:** she is the most disciplined NPC in the codebase — hard-confined to 1370,220,310,440, facing logic already written — and the payoff for that discipline is a 6-second stare at the wall. This is Brainstorm 1's #7 with the part that was missing now possible. **Keep `VALERIE_WORKSHOP` exactly as it is**; do not widen it toward the hall↔workshop corridor (1230,270,120,160).

**Honest constraint:** AniCraft tweens, it does not draw. If there is no hammer pose in the sheet, the bake is a shoulder dip and a lean — which may read as "working" or may read as a glitch. Judge it at 54×68 on screen, not at 4× on a contact sheet. Frame bases differ: CLI `--frame` is **1-based**, command/MCP frames are **0-based**. Export a sheet whose cell grid stays **32×40** so `setDisplaySize(54,68)` and the 4-row layout keep working.

**Effort:** small–medium.

---

### 3. Every room is a window into the same painting

One layered PhotoCraft master that owns the crops: Library, Workshop, Yard, Cell — each exported as a real room painting, replacing `/hall/tiles/floor_dim.png` stretched 48→1600 (still a declared placeholder in four of five page rooms) and giving BUILD 02 its Library art in the same pass.

**Files:** new `ui-v2/public/hall/rooms/{library,workshop,yard,cell}.jpg`; `ui-v2/src/components/hall/keep-hall.tsx` (new `LibraryRoomScene` + `mapSrc`/`mapW`/`mapH`, and the other rooms' `mapSrc`); `ui-v2/src/lib/hall/world.ts` (the `library-arch` `href` becomes a `targetScene` once the scene exists — `HALL_DOORS` is the only edit); `ui-v2/src/lib/hall/room-scene.ts` unchanged.

**Why:** the locked rule is real free art, never a gray floor placeholder, and this is the only honest way to get it from what exists. It is also the cheapest route to the required Library: the painting already contains the shelves, the eye's green wash and the stone, and `ZONES` already gives exact rects.

**Shape, measured:** crop `ZONES` rects and 2× nearest —
`library` 140,120,380,540 → **760×1080** · `workshop` 1310,60,420,680 → 840×1360 · `yard` 620,700,540,260 → 1080×520 · `cell` 1030,745,130,190 → 260×380 (3× = 390×570, it's small).
`RoomScene` already takes `mapW`/`mapH` per room, so set them to the crop's true size instead of 1600 — but then every `walk` rect and `solidCircles` entry must be rewritten in the crop's coordinate space, and the spawn moves to the arch end of the room.

**Honest caveat:** a crop of `keep-map.jpg` is the painting's stone and shelves — it is not a new interior composition, and it will show the map's top-down perspective once you're "inside". If that reads wrong at 1× zoom, the idea is dead and should be dropped rather than dressed up.

**Effort:** medium (the crops are minutes; the walk rects are the work).

---

### 4. Six-frame walk cycles

Every character walks on **four frames per direction, an 8fps cycle** — down 0–3, left 4–7, right 8–11, up 12–15 in a 128×160 sheet. AniCraft can bake in-betweens to six frames per row and export a sheet with the same cell size, so the gait stops reading as a shuffle.

**Files:** `ui-v2/public/hall/sprites/{ravenlord,ravenlord-inquisitor,ravenlord-warlord,ravenlord-archon,raziel,valerie-hd2d,corvid}.png`; `ui-v2/src/lib/hall/scene.ts` (`FRAME_W`/`FRAME_H`, every `generateFrameNumbers({start,end})`); `ui-v2/src/lib/hall/room-scene.ts` (same, plus its own anim create); `ui-v2/src/lib/hall/world.ts` (`actorH` if display size shifts).

**Why:** Brainstorm 1 never reached this because no animation tool existed. It is the single most visible cheapness in the Hall — you notice it in the first two seconds, before any feature.

**Honest constraint:** changing the grid is a breaking change to **every** sheet and **both** scene files at once — `generateFrameNumbers` ranges are hardcoded, and right is drawn, never mirrored (the code says so twice). Do **raziel only**, first, behind the same 4-row contract (6 columns instead of 4 = 192×160 cells 32×40), prove it in the browser, then extend. If a bake blurts at 32×40 pixel art, it does not ship — nearest only.

**Effort:** medium–large. **Wow:** highest on the list. Ranked below 1–3 only because of the blast radius.

---

### 5. The Oracle manifests for real

`triggerOracleManifestation()` currently shakes the camera and flashes a **flat ADD rectangle** (`spectralVignette`) — the code's own comment elsewhere admits the flat-blob problem. EffectCraft can composite the apparition properly over the `oracle-eye.png` plate: a bloom, a green spectral grade, a slow chain-swing, 1.2s, exported as a short WebM or a PNG sequence.

**Files:** new `ui-v2/public/assets/fx/oracle-manifest.*`; `ui-v2/src/lib/hall/scene.ts` (`triggerOracleManifestation`, the `spectralVignette` field and its `create()`).

**Why:** the Oracle is the Keep's thesis and its manifestation is the one moment with real theatre in it. This is the one idea where a compositor genuinely beats code-drawn arcs.

**Constraints:** ≤1.5s, no loop, no audio track, must not block input or the keyboard, must be skipped entirely under `prefers-reduced-motion`, and a WebM must be proven to decode in Chrome by playing it — an export that returned zero is not proof.

**Effort:** medium.

---

### 6. Design the Library desk before building it

The Library's product surface is "walk in, ask the room, get a cited answer". FigCraft's job is that panel: the question field, the answer body, the citation list, and the three honest states (sourced / thin / none — the same three `setTruthState` already uses).

**Files:** design artefact only at first (`~/keep-brainstorm/shots/` or a FigCraft work folder); later `ui-v2/src/components/hall/library-desk.tsx` and `ui-v2/src/routes/oracle.tsx`.

**Why:** BUILD 02 is a scene *and* a UI, and the UI is what decides whether the room is the product or another diorama. Cheaper to judge two frames than two rounds of React.

**Shape:** three frames at the Keep's real breakpoints (390 wide, 768, 1280), exported PNG, put in front of you before any component exists. Reference the existing `TalkSheet` and `WarTablePanel` so it doesn't arrive as a fourth visual language.

**Effort:** small.

---

### 7. Page-room floor from a baked stone tile

If #3 is declined: one **320×320 tileable stone floor**, tiled 5× across exactly 1600 (the room canvas stays, `RoomScene` grows one tile pass). MaterialCraft bakes the maps as PNG; for 2D the only usable output is the baked image, and its per-app card is explicitly **provisional** on this VM — so this is the fallback, not the plan.

**Files:** new `ui-v2/public/hall/rooms/floor_stone_320.png`; `ui-v2/src/components/hall/keep-hall.tsx` (four `mapSrc` swaps); `ui-v2/src/lib/hall/room-scene.ts` (tile pass in `create()`).

**Why:** it removes the "PLACEHOLDER" furniture label from four rooms without pretending a generic tile equals a painting. **TextureCraft is not installed**, so there is no paint-on-model path here — and none is needed for a flat floor.

**Effort:** small–medium. Verify the exported file is actually 320×320 and actually tiles (seams visible when repeated 5×) before install.

---

### 8. Room sigils as SVG

Six marks — eye, anvil, chain, gate, tower, stack — as VectorCraft SVGs, used on the `/rooms` cards and as the small plate above each painted arch. Text stays text.

**Files:** new `ui-v2/public/hall/sigils/*.svg`; `ui-v2/src/routes/rooms.index.tsx`; `ui-v2/src/lib/hall/world.ts` (`HALL_DOORS` gains a sigil).

**Why:** the room model currently announces itself in monospace only, and the six rooms are the one thing the Keep is *for*. Low risk, low ceiling. Keep `shape-rendering: crispEdges` and stick to the locked palette (`#0b0e14 #3a3f4b #2de2e6 #ff2a6d #ffc857 #39ff14 #ff3b3b`) or it will look like a different app.

**Effort:** small.

---

### 9. A first-visit title card

AniCraft's `title-pop` template, baked to a 1.5s PNG sequence or WebM, played **once per browser** before the courtyard fades in, skippable by any key.

**Files:** new `ui-v2/public/hall/painting-title.*`; `ui-v2/src/components/hall/keep-hall.tsx` (one-shot gate on localStorage, before the scene fades in).

**Why:** there is currently no establishing beat — you land on flagstones mid-scene. **But** it delays the locked "you start in the courtyard", so it is ranked last and should be treated as optional. If it costs the spawn even one frame, drop it.

**Effort:** small.

---

## Held, rejected, or impossible with this toolset

**Rejected — bird sprite sheets, still.** AniCraft cannot invent a wing; it tweens keyframes you supply. Without new drawn poses there is nothing to interpolate, so the code-drawn 3–5 stroke flock from Brainstorm 1 #3 stays the correct answer. If you ever draw two keyframes (wings up, wings down), AniCraft can tween them into a sheet — that's the only version that would ship.

**Rejected — real audio files.** SoundCraft is not installed, so Brainstorm 1 #11 (sound bed per area) stays procedural Web Audio, which is already the right call: `audio.ts` is 400 lines of working synth and an ambience loop belongs there, not in a WAV.

**Rejected — a deck of the plan.** DeckCraft is not installed. If you want the roadmap as slides, that's an install with a yes, not a proposal.

**Rejected — CARDCraft/DesignCraft/FilmCraft/WordCraft/PdfCraft/GridCraft/LightCraft.** Installed or not, none has a job in this Keep. CADCraft could dimension the map, but the arch measurements have already been taken and verified against the painting, so it would be ceremony.

**Not proposed, per the locks:** the Teleportation Room (parked, item-by-item approval only) · any second gateway or second OpenClaw · doors anywhere but the two painted arches, anything standing in the courtyard · Valerie leaving the Workshop · Library answers without vault backing and citations · any gated MCP call.

**Two-yes rule:** every idea above is a proposal, and every finished artefact (PNG, sheet, composite, frame, SVG) goes to you before it enters the game or a page. Nothing here is pre-approved by being written down.

---

## Start here — 3 to do first, in order

1. **Doors made of the painting's own stone (#1, small).** Smallest diff on the list, uses art that already exists, and it fixes the cyan boxes you just had me delete from the Hall but which are still inside all five page rooms.
2. **Valerie swings the hammer (#2, small–medium).** The first real use of AniCraft, on the one NPC whose confinement already earns character; and it adds the `playAnvil` the sound engine is missing.
3. **Every room is a window into the same painting (#3, medium).** The Library crop is BUILD 02's art and its acceptance test in one, and it retires the last placeholder floors.

If only one ships this week, ship **#1** — it is the cheapest visible honesty in the repo. **#4** is the biggest wow and should be next after these, raziel-first.
