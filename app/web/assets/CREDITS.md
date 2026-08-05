# Keep asset credits

Mandatory for Ravenstack Keep. Every visual asset listed with source + license.

| Path | Description | Source | License |
|------|-------------|--------|---------|
| `tiles/keep_tileset.png` | 8× 32×32 fortress tiles (void, floor, wall, dark, carpet, amber, desk, door) | **Original** — generated for Ravenstack Keep (PIL, hard-edged pixels, no AA) | CC0-equivalent original work for this project |
| `sprites/mage_blue.png` | 32×32 character sheet (4 dir × 2 frame) | **Original** placeholder (PIL) — stand-in until Universal LPC sheet is dropped in | Original placeholder |
| `sprites/mage_green.png` | same | Original placeholder | Original placeholder |
| `sprites/mage_red.png` | same | Original placeholder | Original placeholder |
| `sprites/mage_gold.png` | same | Original placeholder | Original placeholder |
| `sprites/alert.png` | 16×16 alert marker | Original placeholder | Original placeholder |
| Phaser 3.80.1 (`cdn.jsdelivr.net`) | Game engine | [phaser.io](https://phaser.io/) | MIT |

## Planned free replacements (not yet vendored)

| Slot | Preferred free source | License note |
|------|----------------------|--------------|
| Characters | [Universal LPC Spritesheet Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) | CC-BY-SA / OGA-BY — **require attribution CSV → merge into this file** |
| Tiles | [Kenney Castle Kit](https://kenney.nl/assets/castle-kit) | CC0 — credit anyway |

## Rules

- No assets from non-commercial packs (e.g. LimeZu) without separate commercial rights.
- Never ship raw AI generator output without Pixel Snapper + chroma key (Phase 3+ only).
- Grid: 32×32 base, nearest-neighbor only, no anti-aliasing.
