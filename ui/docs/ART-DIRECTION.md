# Ravenstack Keep — Art Direction & Asset Pipeline

**Role:** Art Director contract for Phaser visual shell  
**Engine:** Phaser 3 (`pixelArt: true`, 48×48 room grid)  
**Domain:** Dark cyber-arcane / mystical stone + neon  

Full prompt pack and Gemini brief also live in:
- Desktop: `KEEP-ART-AND-GIT-INSTRUCTIONS.txt`
- `reviews/findings/2026-07-30-keep-aesthetic-handoff-for-other-ais.md`

## Vision

Subterranean cyber-arcane fortress: ancient runic citadel fused with computational conduits. Cold, tactical, ritualistic. **Not** cozy office, bright spaceship, or cute sim.

| Layer | Colors | Feel |
|-------|--------|------|
| Dark stone base | `#0b0e14` / `#1e222b` / `#3a3f4b` | Slate, obsidian, iron trims |
| Neon channels | `#2de2e6` / `#ff2a6d` / `#39ff14` / `#ffc857` / `#ff3b3b` | 1px laser rims, runic inlays |

**Glow discipline:** neon ≤ ~20% of any tile. Stone dominates.

## Palette (locked)

| Token | Hex | Use |
|-------|-----|-----|
| bg | `#0b0e14` | void / deep shadow |
| stoneDim | `#1e222b` | UNFORGED sealed |
| stone | `#3a3f4b` | masonry base |
| stoneLive | `#4a5568` | live floors / conduits |
| neon | `#2de2e6` | live rim, idle chip |
| magenta | `#ff2a6d` | working / forge energy |
| amber | `#ffc857` | waiting_human / gates |
| green | `#39ff14` | success accents |
| red | `#ff3b3b` | lock / fail |

## Chip ↔ agent_state

| Chip file | agent_state |
|-----------|-------------|
| `chip_idle.png` | idle / null |
| `chip_work.png` | working, answering |
| `chip_wait.png` | waiting_human |
| `chip_fail.png` | failed |
| `chip_retired.png` | retired |

## Layout on disk

```
ui/public/art/
  tiles/base/     room_unforged_48.png, room_live_48.png, room_locked_48.png
  tiles/facades/  facade_<room>_{unforged,live}.png
  chips/          chip_*.png
  hud/            selection, gate stamp, panels (P2)
  input/          raw Imagine drops before process_ravenstack_art.py
```

## Pipeline

```bash
# Deterministic P0+P1 facades (recommended default — palette exact):
cd ~/ravenstack-keep/ui && python3 scripts/generate_keep_art.py

# After dropping Imagine PNGs into ui/public/art/input/:
python3 scripts/process_ravenstack_art.py
```

## QA reject if

- blur / anti-alias / sub-pixel edges  
- legible text or numbers  
- wrong size  
- neon > ~20% of tile  
- isometric / 3D skew  
- colors outside locked palette  

## Integration

World `(x,y)` from Keep castle map only — art never moves rooms.  
`KeepScene` loads textures from `/art/...` and falls back to rectangles if missing.
