---
name: keep-visual-pipeline
description: >
  Art and map contract for the painted Ravenstack Keep (this app).
  Use when adding rooms, sprites, talk plates, or regenerating hall art.
  Replaces the failed 48×48 tile pipeline in jasandroidx/ravenstack-keep/ui.
---

# Keep visual pipeline (painted hall)

The fortress is **one painted map**, not a tileset. The previous skill
(`generate_keep_art.py`, 48×48 façades, neon rims) is frozen. Do not revive it
for this UI.

## Canonical assets

| Role | Path | Rule |
|---|---|---|
| World | `public/hall/painted/keep-map.jpg` | 1792×1008. Do not regenerate unless Jason provides a new painting. |
| Raziel talk | `public/hall/painted/talk-scene.jpg` | Cinematic plate. |
| Valerie talk | `public/hall/painted/talk-valerie.jpg` | Workshop plate. |
| Valerie portrait | `public/hall/portraits/valerie.jpg` | Talk-sheet inset only. |
| Operator walker | `public/hall/sprites/operator-clone.png` | Recolor of the **map** Raziel. Same paint, cyan coat. 38×62 cells. |
| Hotspots | `src/lib/hall/world.ts` | WALK/SOLID rects, NPC x/y, talkScene paths. |

Talk art ≠ walk art. Never put a cinematic portrait on the map.

## If you must add a walker

1. Crop the figure from `keep-map.jpg` at native pixel size.
2. Recolor clothing only. Keep silhouette and paint.
3. Pack 4 facings × 4 bob frames. Magenta/void keyed from **edges**, not all dark pixels (that ghosts coats).
4. Display at **map-native height** (~Raziel at the table). Not half. Not a child. Not a unique HD-2D doll.

QA reject: SNES cartoon outline, glossy full-body portrait, transparent coat, figure twice Raziel’s height.

## If you must add a room

1. It is already painted on the map, or it does not exist yet.
2. Add a `ZONES` rect + optional NPC in `world.ts`.
3. Add a Ledger row in `src/lib/keep/catalog.ts` (purpose + kill_condition).
4. Lock state comes from Keep MCP / pulse — **never invent live occupancy in the scene**.

## Palette (locked — same as old ART-DIRECTION)

`#0b0e14` void · `#3a3f4b` stone · `#2de2e6` live · `#ff2a6d` working · `#ffc857` waiting_human · `#39ff14` success · `#ff3b3b` fail.

Neon ≤ ~20% of any overlay. Stone dominates.

## What this skill does not do

- Does not call Imagine to rebuild the keep.
- Does not write Funnel URLs, tokens, or raw IPs into art metadata.
- Does not replace Keep MCP (`list_rooms`, `get_castle_map`, gates). Art never moves rooms.
