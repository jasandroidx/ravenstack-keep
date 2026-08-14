---
date: 2026-08-14
author: Claude (Claude Code, cloud session)
type: session
topic: suikoden-hq-build-and-verify
status: needs operator decision
blueprint_refs: []
files_reviewed:
  - mcp/src/server.py
  - mcp/src/http_api.py
  - ui/src/KeepScene.ts
  - ui/src/main.ts
  - ui/src/hud.ts
  - ui/src/api.ts
  - ui/src/palette.ts
  - ui/src/config/seats.ts
---

# Session: Suikoden HQ — built and verified, NOT deployed to live

## Summary

The Suikoden-HQ upgrade is built, runs, and is verified end-to-end against a
real Keep server on port 8120 — **but that server was in a cloud container, not
the fortress.** I could not reach `openclaw.tail20a090.ts.net`, so nothing was
deployed to live `:8120` and no live process was restarted. What is pushed is a
complete, buildable tree that needs a fortress-side pull + restart.

Two things in the handoff turned out to be false on inspection, and both changed
the plan:

1. **`origin/feat/suikoden-hq` does not exist.** Grok's Windows push failed. I
   reconstructed the work from the handoff spec rather than porting a branch.
2. **`origin/ravenstack` did not compile.** `escapeHtml` in `ui/src/hud.ts` had
   its HTML entities decoded (`.replace(/&/g, "&")` … and an unterminated
   `"""`), which is both a `tsc` syntax error and — once fixed — a silently
   broken escaper guarding `innerHTML`. Nobody could have built this branch.

## Where I actually was

| Thing | Result |
|---|---|
| Host | ephemeral cloud container (`vm`), repo cloned fresh at start |
| `tailscale` | not installed |
| `curl https://openclaw.tail20a090.ts.net:8120/api/health` | `curl: (35) Recv failure: Connection reset by peer` |
| `ss -lptn` | nothing listening on 8120 at session start |
| Fortress reachability | only via the Ravenstack MCP connector (read-only, scoped to `/root/ReClaw-2.0`) |

The MCP connector did confirm the fortress is healthy and gave me one piece of
real data I used: `ollama_models` → `gemma4:latest`, `phi4-mini:latest`,
`qwen3:1.7b`, plus `minimax-m3:cloud` and `nemotron-3-super:cloud`. That is what
the Kitchen chamber will show once deployed.

Because I could not diff against the live tree, **everything I wrote is additive
or surgical.** See "Merge, do not overwrite" below.

## What I built

### Killing the purple void

`ui/scripts/generate_keep_world.py` — new, Pillow-only, deterministic (fixed
seed, so reruns are byte-identical and git stays quiet). No downloaded sprite
packs, no Star-Office / LimeZu art. 48 files:

- `art/floor/` — `stone_floor`, `corridor_h`, `corridor_v`, `corridor_x`, 48×48,
  seam-tested tileable.
- `art/rooms/` — 11 rooms × 3 states (`live` / `_sealed` / `_locked`), 160×136,
  each with its own silhouette: throne + banners, library shelves, alchemy
  flasks, weapon racks, observatory dome, vault dial, round table with five
  seats, clock face + pendulum, kitchen hearth, roost with perched birds,
  gatehouse portcullis.
- `art/agents/` — 5 officers, 32×32 hooded figures.
- `art/portraits/` — 5 busts, 128×128, framed.
- Neon is accent only (a corridor pipe is ~6% of its tile). No text baked into
  any sprite.

`KeepScene.ts` was rewritten to render a **place**: a stone floor tiled across
the whole keep footprint (deliberately overdrawn 1600px past the camera bounds —
at zoom < 1 the viewport shows more world than the bounds rect, and any gap
reads as the old void), conduit corridors between grid-adjacent rooms, 160×136
interiors, and officer sprites standing at their posts with an idle bob.

### The five new wings

`NEW_WINGS` in `mcp/src/server.py`: `round-table (2,1)`, `clock-tower (0,2)`,
`kitchen (-1,0)`, `roost (2,0)`, `gatehouse (0,-1)`. All `UNFORGED`.

**The important part:** `init_db()` previously only seeded when the rooms table
was *empty*. On live it is not empty, so the new wings would never have appeared
no matter how many times you restarted. Replaced with `_insert_missing_rooms()`
— insert-if-missing by `room_id`, never `UPDATE`. Tested against a simulated
live DB (6 rooms, with an operator edit to Library):

```
BEFORE: ['alchemy-lab','armory','great-hall','library','observatory','vault']
AFTER : 11 rooms
  library        live      OPERATOR NOTE - do not clobber   <- preserved
  round-table    UNFORGED  ...                              <- added
PASS: operator edits preserved, 5 wings added UNFORGED, idempotent across 2 runs
```

Coords keep every wing Manhattan-adjacent to the live core, so the existing
`_grid_path` BFS reaches them with no path-graph changes:

```
/api/path?from=great-hall&to=round-table -> cells [[0,0],[1,0],[2,0],[2,1]], 3 steps
/api/path?from=great-hall&to=kitchen     -> cells [[0,0],[-1,0]]
```

### Rally / Tour / Compact — now say what they do

Relabelled with tooltips, and each reports in plain language to a **new
`#keep-status` element**. (It needed its own element: the 3-second `refresh()`
owns `#map-meta` and was wiping the Rally message the instant it appeared.)

- **Rally** → writes real presence (`clawforge` working, `oracle` + `scribe`
  idle), then walks Raziel. Reports `Rally: 3/3 officers reported, Raziel walked
  the pipes.`
- **Tour** → the same walk, zero writes. `Tour: Raziel walked Great Hall →
  Library → home. Nothing was written.`
- **Compact** → POSTs `/api/library/compact`. That route does not exist on this
  build, and it says so: `Compact: no compaction hook on this build. Nothing was
  changed.` It does not fake success.

**A walk bug worth naming.** My first version reported a successful walk while
drawing almost nothing. Each leg called `syncActors()` on completion, which
snaps an officer home — so leg 2 (Library → Great Hall) started from home and
tweened to home: a no-op. The whole "tour" was one 420ms hop. Caught it by
sampling the corridor strip frame-by-frame during a Tour, not by reading the
status text. Fixed with a `release` flag so multi-leg walks hold position
between legs, 700ms steps, and a 700ms dwell at the far end. Re-measured:

```
changed pixels vs idle (sampled 1/4)   before fix -> after fix
  t0   24 -> 151
  t1   35 -> 144
  t2   24 -> 136
  after 24 -> 11
```

### Talk

`ui/src/talk.ts` — portrait, name plate, typewriter reveal, click/Enter to
advance, Esc to close. `ui/src/hq.ts` holds officer lore and room lore.

Every "ask" is a real thing the officer can be asked (Oracle: *"What do my notes
say about &lt;topic&gt;?"*, Clawforge: *"What would it take to forge the
Kitchen?"*). Sealed wings open a talk box with room lore and what would unlock
them, and show a stone plate instead of a portrait — never a fake officer.

### Three chambers with first real behavior

Read-only routes, additive to the route table:

- `/api/kitchen` — live Ollama `/api/tags`. Real model names, local vs cloud
  split. Unreachable → `"no hearth source — <url> unreachable"`. No GPU meters.
- `/api/clock` — real `agent_status` heartbeats. Empty → `"no pulse source"`.
  In verification it read genuine gate-driven writes (`corvid waiting_human`).
- `/api/round-table` — council status from the room's `lock_state`. UNFORGED →
  *"Council is UNFORGED — stamp the room after a Spec."* Reports
  `spend: "none — no multi-model routing is wired"`.
- `/api/hq` — rank from live rooms + officers with an approved/live Spec.
  Currently `HQ 2 · Hold` (score 6: 4 live rooms + 2 real officers).

### Scribe got a Spec

Rally's presence write for `scribe` returned `400 unknown_agent` — the server
requires `agents/*.agent-spec.json`. Live evidently has one; this tree did not.
Added `agents/scribe.agent-spec.json` with **`status: "draft"`** — declared, not
approved, nothing unlocked.

## Verified (against a real server on :8120, in-container)

All art URLs 200:

```
/art/rooms/room_great-hall.png          200
/art/rooms/room_round-table.png         200
/art/rooms/room_round-table_sealed.png  200
/art/agents/agent_raziel.png            200
/art/portraits/portrait_raziel.png      200
/art/floor/stone_floor.png              200
/art/floor/corridor_h.png               200
/art/hud/rank_frame.png                 200
/assets/tilesets/keep-tiles.png         404   <- legacy stub, tolerated by design
```

Browser pass (headless Chromium, 1440×900):

- [x] Map is not a purple void — floor, 11 chambers, corridors, officers
- [x] 11 rooms in API; the 5 new ones UNFORGED
- [x] Rally walks + updates chips (`3/3 officers reported`)
- [x] Tour walks (frame-diff proven, not just status text)
- [x] Talk portraits render (`portrait_raziel.png` resolved in computed style)
- [x] Chamber enter/exit; Esc closes
- [x] Canvas clicks on Kitchen / Round Table / Clock Tower open the right wings
- [x] Great Hall, Alchemy, Armory, Observatory still live; **Vault still locked**
- [x] Gates intact — Roost shows *unlock blocked until approve_spec(corvid)*,
      Unlock button disabled
- [x] No unlocks, no approvals, no new model routing
- [x] **Zero console errors, zero 4xx/5xx** on the final pass
- [x] New bundle hash (`index-Ck_J6Zke.js`) — the old `index-BwDMsyUJ.js` is gone

## What still sucks

- **Not on live.** This is the big one. Everything above was verified in a
  container. Fortress deploy is untested by me.
- **Bundle is 1.23 MB** (332 KB gzip) — Phaser, unsplit. Fine on a LAN, not great.
- **Room sub-labels can still crowd** their neighbours; I truncate at 30 chars.
- **Portrait faces are flat.** They read as distinct officers, but they are
  procedural shapes, not drawn art. Good enough to ship; worth replacing.
- **Corridors are drawn between every grid-adjacent pair**, including pairs with
  no real relationship. It looks like a castle; it is not a semantic graph.
- **Gatehouse and Roost got lore and sealed art only** — no node status call, as
  scoped.
- **Compact still has nothing to call** on this tree. If the fortress has
  `/api/library/compact`, it will start working the moment you deploy; if not,
  it keeps telling the truth.

## Merge, do not overwrite

The fortress tree is ahead of GitHub (live reports `keep-mcp-0.3-library-duo`;
this branch was at `keep-mcp-0.1`). I could not diff against it. So:

- **Safe to take wholesale:** `ui/public/art/**`, `ui/scripts/generate_keep_world.py`,
  `ui/src/hq.ts`, `ui/src/talk.ts`, `agents/scribe.agent-spec.json` — all new paths.
- **Merge, do not replace:** `mcp/src/http_api.py`. If the fortress has routes
  this branch lacks (`/api/library/*`, `/api/jobs/run`, `/api/arena/bout`,
  `/api/report-presence`), keep them and add my four route entries plus the
  handlers. My change to `version` (`keep-hq-0.4-suikoden`) is cosmetic.
- **Merge carefully:** `mcp/src/server.py` — take `NEW_WINGS` and
  `_insert_missing_rooms`. The `init_db` change is behavioural: seeding now runs
  on every boot instead of only on an empty table. It is insert-only and tested
  non-destructive, but it is the change to read closely.
- **Expect conflicts:** `ui/src/KeepScene.ts` and `ui/src/main.ts`. Live has
  walking agents, chambers and audio that GitHub does not. Do not paste mine
  over a newer file. The HQ layer is deliberately decoupled — `hq.ts` and
  `talk.ts` know nothing about the scene, so the wiring is a handful of lines.
- **Back up first:** `cp -a mcp/data/keep.db mcp/data/keep.db.bak-$(date -u +%Y%m%dT%H%M%SZ)`

Deploy on the fortress:

```bash
cd "$KEEP" && git fetch origin && git checkout claude/ravenstack-keep-upgrade-guvajo
python3 ui/scripts/generate_keep_world.py
cd ui && npm install && npm run build
# restart the Keep HTTP process, then hard-refresh (Ctrl+Shift+R)
```

## Recommendations

1. Deploy and look at it. If the floor renders, everything else follows.
2. Decide on the Vault: it is `locked`, not `UNFORGED`, and I left it that way.
3. Round Table stays sealed until you want a Spec drafted for it. I did not
   draft one — that is Clawforge's job and your stamp.
4. The `escapeHtml` breakage means `origin/ravenstack` has been unbuildable for
   a while. Worth understanding how a decoded-entity edit landed there.

## Not done, deliberately

No unlocks. No `approve_spec`. No paid model routing. No second gateway. No
funnel. No touching `:8443`. No `system.run` on the Windows node. No always-on
agents. The county pipeline was not touched.
