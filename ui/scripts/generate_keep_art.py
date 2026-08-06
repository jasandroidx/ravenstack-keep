#!/usr/bin/env python3
"""Ravenstack Keep — generate engine-ready P0/P1 art (palette-locked, nearest-neighbor).

Prefer this over raw Imagine for base tiles/chips: exact 48×48 / 16×16 and locked hex.
Imagine can still supply façade style refs into art/input/ then process_ravenstack_art.py.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]  # ui/
ART = ROOT / "public" / "art"

PAL = {
    "bg": (11, 14, 20, 255),
    "stoneDim": (30, 34, 43, 255),
    "stone": (58, 63, 75, 255),
    "stoneLive": (74, 85, 104, 255),
    "neon": (45, 226, 230, 255),
    "magenta": (255, 42, 109, 255),
    "amber": (255, 200, 87, 255),
    "green": (57, 255, 20, 255),
    "red": (255, 59, 59, 255),
    "iron": (40, 45, 55, 255),
    "void": (0, 0, 0, 0),
}


def new(w: int, h: int, fill=None) -> Image.Image:
    img = Image.new("RGBA", (w, h), fill or PAL["void"])
    return img


def px(draw: ImageDraw.ImageDraw, x: int, y: int, c, size: int = 1) -> None:
    draw.rectangle([x, y, x + size - 1, y + size - 1], fill=c)


def brick_floor(draw: ImageDraw.ImageDraw, w: int, h: int, base, grout, margin: int = 2) -> None:
    """Simple masonry pattern on 16px-ish grid."""
    draw.rectangle([margin, margin, w - 1 - margin, h - 1 - margin], fill=base)
    # horizontal seams
    for y in range(margin + 8, h - margin, 8):
        for x in range(margin, w - margin):
            if (x // 8 + y // 8) % 2 == 0:
                px(draw, x, y, grout)
    # vertical staggered seams
    for y in range(margin, h - margin, 8):
        offset = 4 if (y // 8) % 2 else 0
        for x in range(margin + offset, w - margin, 8):
            for dy in range(0, 8):
                if margin <= y + dy < h - margin:
                    px(draw, x, y + dy, grout)


def rim(draw: ImageDraw.ImageDraw, w: int, h: int, color, thickness: int = 1) -> None:
    for t in range(thickness):
        draw.rectangle([t, t, w - 1 - t, h - 1 - t], outline=color)


def dashed_rim(draw: ImageDraw.ImageDraw, w: int, h: int, color) -> None:
    # 2 on, 2 off along edge
    for i in range(0, w, 4):
        for j in range(min(2, w - i)):
            px(draw, i + j, 0, color)
            px(draw, i + j, h - 1, color)
    for i in range(0, h, 4):
        for j in range(min(2, h - i)):
            px(draw, 0, i + j, color)
            px(draw, w - 1, i + j, color)


def room_unforged() -> Image.Image:
    img = new(48, 48, PAL["bg"])
    d = ImageDraw.Draw(img)
    brick_floor(d, 48, 48, PAL["stoneDim"], PAL["bg"], margin=1)
    # wall ring
    rim(d, 48, 48, PAL["stone"], 2)
    dashed_rim(d, 48, 48, PAL["stone"])
    # inert conduit cross (dark only)
    for x in range(18, 30):
        px(d, x, 23, PAL["iron"])
        px(d, x, 24, PAL["iron"])
    for y in range(18, 30):
        px(d, 23, y, PAL["iron"])
        px(d, 24, y, PAL["iron"])
    return img


def room_live() -> Image.Image:
    img = new(48, 48, PAL["bg"])
    d = ImageDraw.Draw(img)
    brick_floor(d, 48, 48, PAL["stoneLive"], PAL["stone"], margin=2)
    rim(d, 48, 48, PAL["stone"], 2)
    # 1px cyan neon inner rim
    rim(d, 48, 48, PAL["neon"], 1)
    # runic floor channel +
    for x in range(16, 32):
        px(d, x, 23, PAL["neon"])
    for y in range(16, 32):
        px(d, 23, y, PAL["neon"])
    # corner iron
    for c in [(2, 2), (44, 2), (2, 44), (44, 44)]:
        px(d, c[0], c[1], PAL["iron"], 2)
    return img


def room_locked() -> Image.Image:
    img = new(48, 48, PAL["bg"])
    d = ImageDraw.Draw(img)
    brick_floor(d, 48, 48, PAL["stoneDim"], PAL["bg"], margin=1)
    rim(d, 48, 48, PAL["stone"], 2)
    rim(d, 48, 48, PAL["red"], 1)
    # lock body (center ~12×14)
    cx, cy = 24, 24
    # shackle
    for x in range(cx - 5, cx + 6):
        px(d, x, cy - 8, PAL["red"])
    for y in range(cy - 8, cy - 2):
        px(d, cx - 5, y, PAL["red"])
        px(d, cx + 5, y, PAL["red"])
    # body
    d.rectangle([cx - 7, cy - 2, cx + 7, cy + 8], fill=PAL["red"])
    d.rectangle([cx - 5, cy, cx + 5, cy + 6], fill=PAL["stoneDim"])
    # keyhole
    px(d, cx, cy + 2, PAL["red"])
    px(d, cx, cy + 3, PAL["red"])
    px(d, cx, cy + 4, PAL["red"])
    return img


def chip(core_color, shape: str = "orb") -> Image.Image:
    img = new(16, 16, PAL["void"])
    d = ImageDraw.Draw(img)
    # iron frame
    d.rectangle([2, 2, 13, 13], outline=PAL["stone"], fill=PAL["iron"])
    if shape == "orb":
        d.ellipse([5, 5, 10, 10], fill=core_color)
    elif shape == "square":
        d.rectangle([5, 5, 10, 10], fill=core_color)
    elif shape == "crack":
        d.ellipse([5, 5, 10, 10], fill=core_color)
        px(d, 7, 6, PAL["stoneDim"])
        px(d, 8, 7, PAL["stoneDim"])
        px(d, 7, 8, PAL["stoneDim"])
    elif shape == "dead":
        d.rectangle([5, 5, 10, 10], fill=PAL["stoneDim"])
        d.rectangle([6, 6, 9, 9], fill=PAL["stone"])
    return img


# --- façade motifs (drawn on unforged or live base) ---

def base_for(live: bool) -> Image.Image:
    return room_live().copy() if live else room_unforged().copy()


def motif_eye(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["neon"] if live else PAL["stone"]
    # eye oval
    d.ellipse([14, 18, 33, 30], outline=c)
    d.ellipse([20, 20, 27, 28], fill=c if live else PAL["iron"])
    if live:
        px(d, 23, 23, PAL["bg"])
        px(d, 24, 24, PAL["bg"])


def motif_hub(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["neon"] if live else PAL["iron"]
    # center node + 4 spokes
    d.rectangle([20, 20, 27, 27], fill=c)
    for x in range(8, 40):
        px(d, x, 23, c)
    for y in range(8, 40):
        px(d, 23, y, c)
    if live:
        for p in [(12, 12), (34, 12), (12, 34), (34, 34)]:
            px(d, p[0], p[1], PAL["magenta"], 2)


def motif_anvil(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["magenta"] if live else PAL["iron"]
    body = PAL["stoneLive"] if live else PAL["stone"]
    d.rectangle([14, 22, 33, 28], fill=body)
    d.rectangle([18, 18, 29, 22], fill=body)
    d.rectangle([20, 28, 27, 34], fill=PAL["stone"])
    # spark / top plate
    for x in range(16, 32):
        px(d, x, 17, c)


def motif_scrolls(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["neon"] if live else PAL["iron"]
    # three shelf lines
    for y in (16, 24, 32):
        d.rectangle([12, y, 35, y + 3], fill=PAL["stone"])
        for x in range(14, 34, 4):
            px(d, x, y + 1, c)


def motif_lens(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["green"] if live else PAL["iron"]
    d.ellipse([14, 14, 33, 33], outline=c)
    d.ellipse([18, 18, 29, 29], outline=c)
    if live:
        d.ellipse([21, 21, 26, 26], fill=c)


def motif_wave(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["neon"] if live else PAL["iron"]
    # simple waveform across mid
    pts = [12, 24, 16, 18, 20, 28, 24, 16, 28, 30, 32, 20, 36, 24]
    for i in range(0, len(pts) - 2, 2):
        x0, y0, x1, y1 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        d.line([(x0, y0), (x1, y1)], fill=c, width=1)


def motif_ledger(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["amber"] if live else PAL["iron"]
    d.rectangle([14, 14, 33, 34], outline=c)
    for y in range(18, 32, 4):
        d.line([(16, y), (31, y)], fill=c, width=1)


def motif_furnace(d: ImageDraw.ImageDraw, live: bool) -> None:
    c = PAL["magenta"] if live else PAL["iron"]
    d.rectangle([12, 16, 35, 36], fill=PAL["stoneDim"], outline=PAL["stone"])
    d.rectangle([16, 20, 31, 32], fill=PAL["bg"])
    # grate
    for x in range(18, 30, 3):
        d.line([(x, 20), (x, 32)], fill=c, width=1)
    if live:
        d.rectangle([18, 28, 29, 31], fill=c)


FACADES = {
    "oracle": motif_eye,
    "orchestrator": motif_hub,
    "clawforge": motif_anvil,
    "scribe": motif_scrolls,
    "auditor": motif_lens,
    "suno_studio": motif_wave,
    "flipper": motif_ledger,
    "lead_forge": motif_furnace,
}


def selection_outline() -> Image.Image:
    img = new(48, 48, PAL["void"])
    d = ImageDraw.Draw(img)
    # corner brackets only (transparent center)
    c = PAL["neon"]
    for (x0, y0, dx, dy) in [
        (0, 0, 1, 0),
        (0, 0, 0, 1),
        (47, 0, -1, 0),
        (47, 0, 0, 1),
        (0, 47, 1, 0),
        (0, 47, 0, -1),
        (47, 47, -1, 0),
        (47, 47, 0, -1),
    ]:
        for i in range(8):
            px(d, x0 + dx * i, y0 + dy * i, c)
    return img


def gate_seal() -> Image.Image:
    img = new(24, 24, PAL["void"])
    d = ImageDraw.Draw(img)
    d.ellipse([2, 2, 21, 21], outline=PAL["amber"], fill=PAL["stoneDim"])
    d.ellipse([6, 6, 17, 17], outline=PAL["amber"])
    # wax blob
    d.ellipse([9, 9, 14, 14], fill=PAL["amber"])
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"  wrote {path.relative_to(ROOT)} ({img.size[0]}×{img.size[1]})")


def main() -> None:
    print("Generating Ravenstack Keep art pack…")
    base = ART / "tiles" / "base"
    facades = ART / "tiles" / "facades"
    chips = ART / "chips"
    hud = ART / "hud"

    save(room_unforged(), base / "room_unforged_48.png")
    save(room_live(), base / "room_live_48.png")
    save(room_locked(), base / "room_locked_48.png")

    save(chip(PAL["neon"], "orb"), chips / "chip_idle.png")
    save(chip(PAL["magenta"], "orb"), chips / "chip_work.png")
    save(chip(PAL["amber"], "square"), chips / "chip_wait.png")
    save(chip(PAL["red"], "crack"), chips / "chip_fail.png")
    save(chip(PAL["stoneDim"], "dead"), chips / "chip_retired.png")

    for name, motif in FACADES.items():
        for live, suffix in ((False, "unforged"), (True, "live")):
            img = base_for(live)
            d = ImageDraw.Draw(img)
            motif(d, live)
            save(img, facades / f"facade_{name}_{suffix}.png")

    save(selection_outline(), hud / "selection_outline.png")
    save(gate_seal(), hud / "gate_seal_stamp.png")

    # simple conduit prop
    prop = room_live().copy()
    d = ImageDraw.Draw(prop)
    for x in range(0, 48):
        px(d, x, 23, PAL["neon"])
        px(d, x, 24, PAL["neon"])
    save(prop, ART / "tiles" / "base" / "prop_conduit_trench.png")

    print("Done. Load via KeepScene textures under /art/…")


if __name__ == "__main__":
    main()
