# Gemini paste pack — Keep art

Copy **one** block. Download **PNG**. Name it as written. Drop in `ravenstack-keep/ui/public/art/input/`. Tell Grok **process keep art**.

When a block says “use this image,” attach the canonical PNG.

Style lock (prepend if Gemini drifts):

> Dark cyber-arcane fortress pixel art. Hard pixels, 1px dark outline, no anti-alias, no blur, no isometric 3D, no readable text. Slate stone #3a3f4b, void #0b0e14, cyan neon #2de2e6 (small), magenta #ff2a6d only for work/forge. Not a cozy office, not cute, not photoreal.

---

## Agent canonical (32×32) — first time only

**Save as:** `agent_raziel.png` (or oracle / scribe / clawforge / corvid)

> Pixel-art game sprite, 32 by 32 pixels, of Raziel, a fortress watchman: dark hooded cloak, cyan rim light, small readable silhouette, front three-quarter view, idle standing. Isolated on a flat #00FF00 background. Hard pixels, 1px outline, no ground, no shadow, no scenery.

Repeat per agent (oracle = crystal/cool stone; scribe = satchel/amber scrap; clawforge = ember/magenta; corvid = thin/sharp).

## Agent turnaround

**Attach** `agent_<id>.png`. **Save as:** `agent_<id>_side.png` / `_back.png`

> Keep this exact character — same colors, outline, 32px, green flat background. Change only the view to a strict side profile (then: strict back view). No new clothes. No scenery.

## Agent idle / walk (if Gemini won’t do video)

Ask for **one pose per image**, not a labeled sheet.

Idle: `agent_<id>_idle_01.png` … `_04.png` — tiny weight shift, loop.  
Walk: `agent_<id>_walk_01.png` … `_08.png` — in-place walk, side or 3/4, even count.

> Same character as the attached sprite. Same size, outline, background. Only the pose changes: (describe one walk phase). Isolated, no floor.

Grok can assemble a sheet from those frames.

## Prop

**Save as:** `prop_desk.png` / `prop_bookshelf.png` / `prop_anvil.png` / `prop_crystal.png`

> 32 by 32 pixel-art fortress prop: a stone-and-iron writing desk with a faint cyan inlay. Isolated on flat #00FF00. Top-down three-quarter, 1px outline, no floor tile, no character, no text.

## Floor tile (seamless)

**Save as:** `tile_floor_live.png`

> Seamless 48 by 48 pixel-art slate floor tile, fortress keep, faint darker grout, tiny cyan flecks at most 10 percent. Pattern continues off every edge. No landmark, no text, no character. Orthographic top-down.

## Glow / light

**Save as:** `glow_cyan.png` (also magenta, amber, red)

> 32 by 32 soft runic cyan glow bloom, center bright #2de2e6, edges fade to full transparency. No stone, no character, no square frame. Looks like a small neon sigil light for a pixel game.

## Do not ask Gemini for

- A full room painting (we compose tiles + props)  
- A labeled sprite sheet with numbers  
- Cute office / LimeZu copies  
- JPEG  
