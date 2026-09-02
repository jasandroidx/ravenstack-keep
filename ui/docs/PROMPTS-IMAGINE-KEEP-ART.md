# Imagine prompts — Keep art (Grok)

Use with `image_gen` / `image_edit` / `image_to_video`. Then `process_ravenstack_art.py`.  
Load skills: `imagine` + `game-asset-core` + specialist.

Aspect: `1:1`. Save into `ui/public/art/input/` with the names below.

## Canonical agent — `image_gen`

`agent_raziel.png`

> Raziel, fortress watchman as a 32-pixel game sprite: dark hooded cloak, cyan rim light, compact silhouette, front three-quarter idle. Flat green chroma background, hard pixels, one-pixel outline, no ground and no scenery. Dark slate-and-neon keep, not cute, not photoreal.

Then `image_edit` that file for oracle / scribe / clawforge / corvid (change only costume/role).

## Turnaround — `image_edit` from canonical

> Keep this exact character, colors, outline, and green background. Change only the camera to a strict side profile.

Then back view the same way.

## Walk / idle

**This Grok team:** `image_to_video` fails (HTTP 400, ZDR must provide `output.upload_url`). Do **not** pretend video works here.

Fallback: `image_edit` the canonical — left-foot walk, right-foot walk — then PIL sheet (`agent_<id>_walk.png`, 32×N cells, no dividers).

If video is enabled later: 6s in-place walk, camera locked → `ffmpeg -i clip.mp4 -vf fps=12 f%03d.png` → pick a loop.

## Prop — `image_gen`

`prop_desk.png`

> A 32-pixel fortress writing desk of iron and slate with a thin cyan inlay, isolated on flat green, three-quarter top-down, hard pixels, no character, no floor.

## Tile — prefer code (`generate_keep_art.py`). If Imagine:

> Seamless 48-pixel slate floor tile, grout continues off every edge, almost no neon, top-down, no motif you could spot twice.

**Must** 2×2 composite-check.

## Light — `image_gen`

`glow_cyan.png`

> A small cyan runic glow, 32 pixels, bright center fading to full transparency, no stone and no frame.

## Consistency

One canonical per agent. Every later shot is `image_edit` or video from that file. Never a second “new Raziel” gen.
