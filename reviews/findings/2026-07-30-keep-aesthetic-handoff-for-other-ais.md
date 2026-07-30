# Handoff — Keep visual shell aesthetics (for Super Grok / Gemini / Imagine)

**Date:** 2026-07-30  
**Status of shell:** Working V0 on laptop. Phaser 3 map + Keep HTTP API.  
**Do not:** rewrite the product, fork virtual-office, invent A2A, auto-approve oracle.

This document is a **paste-ready brief** so another AI can produce art/assets without re-litigating architecture.

---

## What already works (do not rebuild)

| Piece | Path / URL |
|-------|------------|
| Phaser map UI | `ui/` → dev `http://127.0.0.1:5173` |
| Keep HTTP + SPA | `python -m ravenstack_keep_mcp.http_api` → `:8120` |
| SOT rooms | `mcp/seeds/castle_map.json` + SQLite (CANONICAL) |
| Contract | `ui/docs/UI-CONTRACT.md` |
| Palette tokens | `ui/src/palette.ts` |

**Locked:** rooms/agents only; gates in HUD inbox; UNFORGED = sealed empty OK; working truth first.

---

## Aesthetic target (when ready to swap placeholders)

| Token | Value |
|-------|--------|
| Style | Mystical **stone + neon** fortress (dark cyber-arcane, not cute office) |
| Room tile size | **48×48** px (pixel art; Phaser `pixelArt: true`) |
| Background | `#0b0e14` |
| Stone | `#3a3f4b` / dim `#1e222b` / live `#4a5568` |
| Neon cyan | `#2de2e6` |
| Magenta | `#ff2a6d` |
| Amber (gates / waiting_human) | `#ffc857` |
| Green (working/answering) | `#39ff14` |
| Red (failed) | `#ff3b3b` |

### Room visual states (must map to contract)

1. **UNFORGED / sealed** — dim stone, dashed or muted border, low glow  
2. **live** — lit stone + cyan/magenta neon rim  
3. **locked** — dim + lock glyph  
4. **Agent chip** (small circle on room): color by `agent_state`  
   - idle → cyan  
   - working/answering → green  
   - waiting_human → amber  
   - failed → red  
   - retired → muted  

### Eight rooms (canonical ids — keep names)

| room_id | Display name | Notes |
|---------|--------------|--------|
| `oracle` | Oracle | Draft spec pending approve (human gate) |
| `orchestrator` | Orchestrator | live candidate |
| `clawforge` | Clawforge | live candidate |
| `scribe` | Scribe Warden | sealed candidate |
| `auditor` | Silent Auditor | sealed |
| `suno_studio` | Suno Studio | sealed |
| `flipper` | Flipper | empty sealed |
| `lead_forge` | Lead Forge | stays sealed for now (no fake gatekeeper agent) |

Pipeline edges (UI-only): `ui/public/pipeline.json`.

---

## What you can build now (asset pack)

Deliver under e.g. `ui/public/art/` or `ui/src/assets/rooms/` — **do not** change SOT JSON coordinates unless asked.

### Pack A — Room tiles (priority)

- `room-unforged-48.png` (or atlas)
- `room-live-48.png`
- `room-locked-48.png`
- Optional per-room façade variants (Oracle tower, Forge anvil, Scribe desk…) still **48×48** base footprint

### Pack B — Chips / FX

- Agent chip frames (idle / work / wait / fail) — 8–12 px diameter ok  
- Soft amber gate vignette / alert particle (optional)  
- Simple neon edge strip for selected room

### Pack C — HUD chrome (optional later)

- Stone panel background for right HUD  
- Gate card border / seal stamp  
- Favicon already exists (`ui/public/favicon.svg`)

### Imagine / Grok image agents — prompt scaffold

```
Pixel art 48x48 game tile, top-down fortress room, mystical dark stone masonry,
thin cyan neon edge light, no text, no UI chrome, centered, transparent or solid
dark void outside walls, style consistent with cyber-arcane keep, crisp pixels,
no anti-alias blur, game asset.
```

Variants: replace “cyan” with amber for sealed; add magenta rim for selected; add small
lock glyph for locked.

**Consistency:** one style sheet first (shared stone texture + neon language), then room variants.

---

## Integration notes (for when shell is ready to consume art)

1. Load textures in `KeepScene.ts` instead of solid `Rectangle` fills.  
2. Keep world coords from castle map (x,y already SOT).  
3. Do **not** move rooms on the map for aesthetics.  
4. Prefer spritesheet/atlas over 50 loose files.  
5. UI still polls Keep API — art is presentation only.

---

## Explicit non-goals for this handoff

- No OpenClaw session clutter on the map  
- No inventing roundtable / A2A activity  
- No auto-approve of Oracle  
- No forking pixel-agents / virtual-office as product core  
- No reclaw-platform ops merged into Keep map  

---

## Suggested AI roles

| AI | Best use |
|----|----------|
| **Gemini Pro** | Spec long room lore + art direction sheet; batch prompt list for all 8 rooms × 3 states; review consistency |
| **Super Grok + Imagine** | Generate the actual 48×48 sprites / sheets from the prompts |
| **Grok Build (this repo)** | Wire sprites into Phaser once files land; keep SOT/API untouched |

---

## Paste-ready starter prompt (copy below)

```
You are helping Ravenstack Keep visual shell aesthetics ONLY.

Read / assume:
- Working Phaser 3 fortress map already exists (placeholders: solid 48×48 blocks).
- Aesthetic: mystical stone + neon, dark cyber-arcane, pixel art.
- Room size: 48×48. Palette: bg #0b0e14, stone #3a3f4b, neon #2de2e6, magenta #ff2a6d, amber #ffc857.
- States: UNFORGED (dim sealed), live (neon rim), locked (lock glyph). Agent chip colors by idle/work/wait/fail.
- 8 rooms: Oracle, Orchestrator, Clawforge, Scribe Warden, Silent Auditor, Suno Studio, Flipper, Lead Forge.
- Do NOT change architecture, SOT, gates, or invent A2A.

Deliverables:
1) Art direction one-pager (style rules + do/don't).
2) Prompt list for Imagine: base tiles (unforged/live/locked) + optional 8 room façades.
3) If you can generate images: produce 48×48 PNG tiles (or a sprite sheet) with transparent or void outside, no text.
4) File naming: room-unforged-48.png, room-live-48.png, room-locked-48.png, optional room-<id>-live-48.png.

Output prompts + any assets; stop before rewriting the app.
```
