# KEEP BUILD 01 — courtyard spawn, remove the test boxes

Read KEEP-BRAINSTORM.md first (the fixed version). Implement idea #1 only.

## Do
1. Move PLAYER_SPAWN in ui-v2/src/lib/hall/world.ts to {x:760, y:870} — courtyard flagstones, verified walkable.
2. Delete the six cyan portal rectangles, their monospace labels, and their trigger checks (keep-hall.tsx, scene.ts) — EXCEPT keep walk-through triggers on the two painted arches: Library bottom-left, Workshop bottom-right.
3. Page rooms stay reachable from the [T] list only. Do NOT add doors anywhere else, especially not in the courtyard/yard.

## Do not touch
VALERIE_WORKSHOP confinement, the Teleportation Room, the [T] modal list, the Library unlock (separate data fix), any gated MCP tool.

## Verify
Follow the repo's AGENTS.md for the typecheck, tests, and box build commands. All must pass. Then check the Hall loads and the player spawns on the flagstones.

## Output
Code changes left UNCOMMITTED for Jason to review. Write KEEP-BUILD-01-REPORT.md: files changed, verification results, anything that still needs his eyes.

No commits, no pushes, no installs, no gated MCP calls.
