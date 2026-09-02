#!/usr/bin/env python3
"""Ingest Imagine / Gemini drops from ui/public/art/input/.

Tiles/chips/glows: nearest-neighbor + 9-color fortress snap.
agent_*: resize only (no 9-color crush).
Integer sizes only (16/32/48/64/128).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public" / "art"
INPUT = ART / "input"

PALETTE_COLORS = [
    ("bg", (11, 14, 20)),
    ("stoneDim", (30, 34, 43)),
    ("stone", (58, 63, 75)),
    ("stoneLive", (74, 85, 104)),
    ("neon", (45, 226, 230)),
    ("magenta", (255, 42, 109)),
    ("amber", (255, 200, 87)),
    ("green", (57, 255, 20)),
    ("red", (255, 59, 59)),
]


def create_gpl_palette(filename: Path) -> Path:
    lines = ["GIMP Palette", "Name: Ravenstack Keep Locked Palette", "Columns: 3", "#"]
    for name, (r, g, b) in PALETTE_COLORS:
        lines.append(f"{r:3d} {g:3d} {b:3d}\t{name}")
    filename.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return filename


def find_nearest_palette_color(rgb: tuple) -> tuple:
    r, g, b = rgb[:3]
    if len(rgb) > 3 and rgb[3] < 128:
        return (0, 0, 0, 0)
    closest = PALETTE_COLORS[0][1]
    min_dist = float("inf")
    for _, (pr, pg, pb) in PALETTE_COLORS:
        dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if dist < min_dist:
            min_dist = dist
            closest = (pr, pg, pb)
    if len(rgb) > 3:
        return (*closest, 255)
    return closest


def resize_nn(src: Path, dest: Path, target: tuple[int, int], quantize: bool) -> None:
    img = Image.open(src).convert("RGBA")
    img = img.resize(target, Image.Resampling.NEAREST)
    if quantize:
        px = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                px[x, y] = find_nearest_palette_color(px[x, y])
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    q = "quantized" if quantize else "resize-only"
    print(f"  {src.name} → {dest.relative_to(ROOT)} {target} ({q})")


def route(filename: str) -> tuple[Path, tuple[int, int], bool]:
    """Return dest, size, quantize?"""
    n = filename.lower()
    if n.startswith("agent_"):
        return ART / "agents" / filename, (32, 32), False
    if n.startswith("chip_"):
        return ART / "chips" / filename, (16, 16), True
    if n.startswith("glow_") or n.startswith("light_"):
        return ART / "lights" / filename, (32, 32), False
    if n.startswith("prop_"):
        return ART / "furniture" / filename, (32, 32), True
    if n.startswith("tile_") or n.startswith("room_unforged") or n.startswith("room_live") or n.startswith("room_locked"):
        return ART / "tiles" / "base" / filename, (48, 48), True
    if n.startswith("facade_"):
        return ART / "tiles" / "facades" / filename, (48, 48), True
    if n.startswith("room_"):
        return ART / "rooms" / filename, (128, 128), True
    if n.startswith("hud_") or n.startswith("gate_") or n.startswith("selection_"):
        size = (24, 24) if n.startswith("gate_") else (48, 48) if n.startswith("selection_") else (192, 64)
        return ART / "hud" / filename, size, True
    return ART / "tiles" / "base" / filename, (48, 48), True


def main() -> None:
    INPUT.mkdir(parents=True, exist_ok=True)
    (ART / "lights").mkdir(parents=True, exist_ok=True)
    gpl = create_gpl_palette(ART / "ravenstack_palette.gpl")
    print(f"Palette: {gpl}")

    raw = list(INPUT.glob("*.png")) + list(INPUT.glob("*.jpg"))
    if not raw:
        print(f"No images in {INPUT} — drop Imagine/Gemini PNGs there.")
        print("Or: python3 scripts/generate_keep_art.py")
        return

    known = (
        "agent_",
        "chip_",
        "glow_",
        "light_",
        "prop_",
        "tile_",
        "facade_",
        "room_",
        "hud_",
        "gate_",
        "selection_",
    )
    for img_path in raw:
        dest = img_path.stem + ".png"
        if not dest.lower().startswith(known):
            print(f"  skip {img_path.name} (name must start with agent_/prop_/tile_/glow_/…)")
            continue
        out, size, quant = route(dest)
        resize_nn(img_path, out, size, quantize=quant)

    print("Done. Rebuild UI dist if you ship to :8120.")


if __name__ == "__main__":
    main()
