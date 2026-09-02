# Ravenstack Keep — Art Direction (short)

**Full how-to:** [[KEEP-ART-PLAYBOOK]] (`ui/docs/KEEP-ART-PLAYBOOK.md`)

Phaser 3, `pixelArt: true`. Fortress slate + neon. Not a cozy office.

| Native | Display |
|--------|---------|
| Agents 32×32 | **32** (was wrongly 48) |
| Tiles 16/48 | 16/48/96 |
| Rooms compose; old bake 96 | 128 until 128px art exists |
| Chips/props/glows 16 or 32 | same |

Integer scale only. Characters: do not 9-color crush. Tiles: locked 9 hexes.

**Imagine:** `PROMPTS-IMAGINE-KEEP-ART.md`  
**Gemini:** `PROMPTS-GEMINI-KEEP-ART.md` → `art/input/` → `python3 scripts/process_ravenstack_art.py`

Code tiles: `python3 scripts/generate_keep_art.py`
