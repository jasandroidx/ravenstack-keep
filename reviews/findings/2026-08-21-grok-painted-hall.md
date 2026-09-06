# Finding — Painted Great Hall (Grok Build) → ui-v2

**Author:** Grok (Grok Build session)  
**Date:** 2026-08-21  
**Branch:** `painted-hall`  
**Status:** skin landed; not yet the operating layer

## What landed

- `ui-v2/` — TanStack Start + Phaser painted fortress (keep-map.jpg).
- Talk cinematics for Raziel and Valerie. Operator walker is a map-scale Raziel recolor.
- Pulse badge: **paper** unless `KEEP_PULSE_URL` answers. Honest, not fake-live.
- Visual skill: `ui-v2/skills/keep-visual-pipeline/SKILL.md` (replaces failed 48×48 pipeline).

## What did not change

- `mcp/`, `agents/`, `schemas/`, old `ui/` — untouched.
- No Funnel URLs, no preview OAuth secret in this commit.

## Raziel’s test

Can an operator do real keep work from this UI without raw tool calls?

**Not yet.** Next bind (on the box):

1. `KEEP_PULSE_URL` → `GET http://127.0.0.1:8120/api/castle-map`
2. War table → `GET /api/gates` (`confirm=true` only)
3. Valerie Diagnose → reclaw-platform `stack_health` / openclaw-mechanic
4. Oracle → `query_scoped_knowledge`

Until those answer, the header must stay **paper**.

## Recommendation

Merge `painted-hall` into `ravenstack` as additive `ui-v2`. Run old `ui/` until pulse is live, then make ui-v2 the default visual.
