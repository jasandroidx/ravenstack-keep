#!/usr/bin/env python3
"""
Ravenstack Keep — post-process Imagine (or any) drops into palette-locked assets.

Usage:
  1. Drop raw PNGs/JPGs into ui/public/art/input/ with manifest names
     (e.g. room_live_48.png, facade_oracle_live.png, chip_idle.png)
  2. python3 scripts/process_ravenstack_art.py
  3. Outputs under ui/public/art/{tiles,chips,hud}/

Quantizes to locked palette, nearest-neighbor resize, optional Aseprite if installed.
"""
from __future__ import annotations

import os
import shutil
import subprocess
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

TARGET_DIRS = {
    "base": ART / "tiles" / "base",
    "facades": ART / "tiles" / "facades",
    "chips": ART / "chips",
    "hud": ART / "hud",
}


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
    min_dist = float("inf")
    closest = PALETTE_COLORS[0][1]
    for _, (pr, pg, pb) in PALETTE_COLORS:
        dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if dist < min_dist:
            min_dist = dist
            closest = (pr, pg, pb)
    if len(rgb) > 3:
        return (*closest, 255)
    return closest


def quantize_and_resize(image_path: Path, output_path: Path, target_size: tuple[int, int]) -> None:
    img = Image.open(image_path).convert("RGBA")
    img_resized = img.resize(target_size, Image.Resampling.NEAREST)
    pixels = img_resized.load()
    w, h = img_resized.size
    for y in range(h):
        for x in range(w):
            pixels[x, y] = find_nearest_palette_color(pixels[x, y])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img_resized.save(output_path)
    print(f"  {image_path.name} → {output_path.relative_to(ROOT)} {target_size}")


def route_size(filename: str) -> tuple[Path, tuple[int, int]]:
    if filename.startswith("chip_") or filename.startswith("prop_ether"):
        return TARGET_DIRS["chips"] / filename, (16, 16)
    if filename.startswith("hud_"):
        return TARGET_DIRS["hud"] / filename, (192, 64)
    if filename.startswith("gate_"):
        return TARGET_DIRS["hud"] / filename, (24, 24)
    if filename.startswith("selection_"):
        return TARGET_DIRS["hud"] / filename, (48, 48)
    if filename.startswith("prop_terminal"):
        return TARGET_DIRS["hud"] / filename, (32, 32)
    if filename.startswith("facade_"):
        return TARGET_DIRS["facades"] / filename, (48, 48)
    if filename.startswith("prop_"):
        return TARGET_DIRS["base"] / filename, (48, 48)
    return TARGET_DIRS["base"] / filename, (48, 48)


def build_phaser3_spritesheet() -> None:
    aseprite = shutil.which("aseprite")
    if not aseprite:
        print("  (aseprite not installed — skip spritesheet pack)")
        return
    tile_files = [str(f) for f in ART.glob("**/*.png") if f.name != "ravenstack_sheet.png"]
    if not tile_files:
        return
    sheet_png = ART / "ravenstack_sheet.png"
    sheet_json = ART / "ravenstack_sheet.json"
    cmd = [
        aseprite,
        "-b",
        *tile_files,
        "--sheet-type",
        "packed",
        "--sheet",
        str(sheet_png),
        "--data",
        str(sheet_json),
        "--format",
        "json-hash",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"  sheet → {sheet_png}")
    except subprocess.CalledProcessError as e:
        print(f"  sheet failed: {e}")


def main() -> None:
    for p in TARGET_DIRS.values():
        p.mkdir(parents=True, exist_ok=True)
    INPUT.mkdir(parents=True, exist_ok=True)
    gpl = create_gpl_palette(ART / "ravenstack_palette.gpl")
    print(f"Palette: {gpl}")

    raw = list(INPUT.glob("*.png")) + list(INPUT.glob("*.jpg"))
    if not raw:
        print(f"No images in {INPUT} — drop Imagine PNGs there, then re-run.")
        print("Or run: python3 scripts/generate_keep_art.py")
        return

    for img_path in raw:
        out, size = route_size(img_path.name)
        quantize_and_resize(img_path, out, size)
        aseprite = shutil.which("aseprite")
        if aseprite:
            try:
                subprocess.run(
                    [aseprite, "-b", str(out), "--palette", str(gpl), "--save-as", str(out)],
                    check=True,
                    capture_output=True,
                )
            except subprocess.CalledProcessError:
                pass

    build_phaser3_spritesheet()
    print("Done.")


if __name__ == "__main__":
    main()
