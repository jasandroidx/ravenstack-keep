# Keep art playbook — make our own look

**SOT for all Keep art.** Phaser shell on `:8120`. Fortress, not a cozy office.

Grok: load `game-asset-core` + the specialist (`game-animation-frames` / `game-tilesets` / `game-character-consistency` / `game-ui-icons`) + `imagine`.  
Gemini: paste the matching prompt from `PROMPTS-GEMINI-KEEP-ART.md`, save PNG into `ui/public/art/input/`, run the process script.

Do **not** import LimeZu / Star-Office office art (wrong world; their **art** is non-commercial). Steal *discipline*, not their pack.

---

## What we got wrong (fixed)

| Claim | Truth |
|-------|--------|
| Display agents at 48px for “more detail” | Native art is **32×32**. 48 is **1.5×** — smears the grid. Engine now uses `AGENT_SIZE = 32`. |
| Baked 96px rooms at 128px look sharper | **1.33×** smear. Next interiors: paint **128×128**, keep `ROOM_SIZE = 128`. |
| Crush everything to 9 hexes | Right for **tiles/chips**. Wrong for **characters** — kills volume. Process script no longer quantizes `agent_*`. |
| One Imagine portrait = a sprite | A sprite is a **sheet** (idle + walk). A portrait is a sticker. |
| One painted room PNG = a room | A room is **tiles + props + a light layer**. Agents stand *at* a desk tile. |

---

## Look contract (locked)

**World:** subterranean cyber-arcane. Slate + iron + runic neon. Cold, ritual, tactical.  
**Not:** cozy pixel office, cute sim, spaceship, photoreal.

| Layer | Hex | Use |
|-------|-----|-----|
| bg | `#0b0e14` | void |
| stoneDim | `#1e222b` | sealed |
| stone | `#3a3f4b` | masonry |
| stoneLive | `#4a5568` | live floor / conduit |
| neon | `#2de2e6` | idle / live rim |
| magenta | `#ff2a6d` | working |
| amber | `#ffc857` | wait / gate |
| green | `#39ff14` | success (tiny) |
| red | `#ff3b3b` | fail / lock |

**Tiles:** only the 9 above. Neon ≤ ~20% of a tile.  
**Characters:** those 9 **plus** cloth/skin midtones (see character palette below). Still fortress, not pastel.  
**Lights:** separate glow sprites (`glow_cyan`, `glow_magenta`, …), additive, not baked into the room painting.

**Perspective:** top-down 3/4, no iso skew.  
**Scale:** native sizes only — 16 / 32 / 64 / 128. Display = native × 1, 2, or 3. Never 1.5×.

**QA reject:** blur, AA, sub-pixel edges, readable text, iso 3D, neon flood, baked drop-shadows under sprites.

---

## Sizes & folders

```
ui/public/art/
  input/           raw Imagine / Gemini drops (this folder only)
  agents/          agent_<id>.png (32) + agent_<id>_idle.png + agent_<id>_walk.png (sheets)
  tiles/base/      48 or 16 floor/wall tiles (integer display)
  tiles/facades/   optional
  furniture/       prop_*.png  16 or 32, isolated, no floor
  lights/          glow_*.png  16 or 32, cyan/magenta/amber/red
  chips/           chip_*.png  16
  rooms/           DEPRECATED as the only room — compose instead
  hud/             selection, stamps
```

| Kind | Native | Display now |
|------|--------|-------------|
| Agent | 32 | **32** |
| Chip | 16 | 16 |
| Prop | 16 or 32 | same |
| Glow | 16 or 32 | same |
| Floor tile | 16 or 48 | 16/48/96 |
| Room compose | 128 target | 128 |
| Old room PNG | 96 | 128 until replaced |

---

## Two generators, one ingest

```
Imagine or Gemini
    → PNG (flat keyable bg #00FF00 or #0b0e14 — say which)
    → ui/public/art/input/<exact-name>.png
    → python3 ui/scripts/process_ravenstack_art.py
    → correct folder + size
    → rebuild UI / deploy dist
```

**Grok Imagine (this node)**

| Need | Tool |
|------|------|
| New base (no source) | `image_gen` aspect `1:1` |
| Same subject again | `image_edit` from the **canonical** PNG — never a fresh gen |
| Walk / idle motion | Prefer `image_to_video` then harvest. **This node:** video returns 400 (ZDR / no upload_url) — fall back to `image_edit` keyframes (left/right foot) + PIL sheet |
| Lights / chips / simple tiles | Prefer `generate_keep_art.py` (code). Imagine only for *style* if code looks dead |

Prompt shape: 2–5 sentences. Subject → pose/view → flat bg → “32px pixel-art game sprite, 1px outline, hard pixels, fortress slate+cyan neon, no anti-alias.”  
No “sprite sheet with labeled cells” in one gen — models wreck grids. One pose per image, **or** video-harvest. Assemble sheets in PIL.

**Gemini (Jason pastes)**

1. Open `PROMPTS-GEMINI-KEEP-ART.md`, copy the block for that asset.  
2. Attach the **canonical** PNG when it says “edit this.”  
3. Download PNG (not JPEG).  
4. Name it exactly (`agent_raziel.png`, `prop_desk.png`, `glow_cyan.png`).  
5. Drop in `input/`, tell Grok **process keep art**.

Gemini is good at following a long style lock. Imagine is on this machine and can video-harvest walks. Use both; **one canonical per subject**.

---

## How to make each kind

### Rooms (compose, don’t paint a poster)

1. Floor tile 16 or 48, seamless. Verify with a 2×2 composite.  
2. Wall / rim tile.  
3. 2–4 **props** per room (desk, bookshelf, anvil, crystal) — isolated, 32px.  
4. **Light** sprites sit on props (cyan idle, magenta work).  
5. Engine places them. Do not ship a new `room_great-hall.png` unless it’s a 128px *layout preview*.

Old 96px interiors stay until 128px compose exists.

### Sprites (characters)

Order:

1. **Canonical** — front 3/4 idle, 32×32, flat bg, 1px outline. `agent_<id>.png`  
2. **Turnaround** — `image_edit` from canonical: front, side, back.  
3. **Idle sheet** — video-first: in-place breathing/shift, harvest 4–6 frames that loop.  
4. **Walk sheet** — in-place walk, side or 3/4, harvest one gait cycle (even frame count).  
5. Work pose = walk frame 1 at the desk **or** a still `agent_<id>_work.png` from edit.

Identity freeze (every edit): same silhouette, cloak/hood color, 1px outline, 32px, flat bg.

| id | Read as |
|----|---------|
| raziel | Great Hall watchman, dark cloak, cyan rim |
| oracle | Library / knowledge, cooler stone, crystal accent |
| scribe | Ink / satchel, amber scrap |
| clawforge | Forge, magenta ember |
| corvid | Thin, sharp, less neon |

### Objects / props

Isolated, no floor, no drop shadow, same light as tiles (top-left). `prop_<name>.png` 16 or 32.

### Lights

`glow_cyan.png` / `glow_magenta.png` / `glow_amber.png` / `glow_red.png` — soft 16–32px runic bloom, **transparent** outside the glow. Engine tints/places. Do not paint glow into the floor tile.

---

## Character palette (allowed extras)

Keep the 9 fortress hexes, then:

| Extra | Hex | Use |
|-------|-----|-----|
| cloth | `#2a2433` | cloaks |
| clothLite | `#4a4060` | folds |
| skinDim | `#6b5344` | faces (little) |
| bone | `#c4b49a` | trim / parchment |
| iron | `#282d37` | metal |

Process script **does not** snap `agent_*` to 9 colors.

---

## Commands

```bash
cd ~/ravenstack-keep/ui

# Exact tiles/chips/lights (no model)
python3 scripts/generate_keep_art.py

# After dropping Imagine/Gemini PNGs into public/art/input/
python3 scripts/process_ravenstack_art.py

# Optional dense interiors (legacy 96) — prefer compose
python3 scripts/generate_room_interiors.py
```

Phrase to Grok: **keep art** / **process keep art** / **raziel walk sheet**.

---

## Engine hooks (when sheets exist)

`KeepScene` still uses one `Image` per agent. Next code (not this file): Phaser `Animation` from `agent_<id>_walk` / `_idle`. Until then, integer-scaled stills + tint for work/wait.

---

## Operator checklist (every asset)

- [ ] Right size (16/32/64/128)  
- [ ] Flat bg, isolated if sprite/prop  
- [ ] No text  
- [ ] Tiles tile (2×2 check)  
- [ ] Character edit-chained from canonical  
- [ ] Named for `process_ravenstack_art.py`  
- [ ] Looks like *our* fortress, not an office  
