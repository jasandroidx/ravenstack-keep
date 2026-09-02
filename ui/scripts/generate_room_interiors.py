#!/usr/bin/env python3
"""Legacy 96×96 baked interiors + 32×32 agents.

Prefer KEEP-ART-PLAYBOOK.md: compose tiles + props + lights; next rooms are 128×128.
This script remains for regenerating the current bake until compose lands.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public" / "art"

# Locked palette + useful intermediates (still fortress tones)
PAL = {
    "bg": (11, 14, 20, 255),
    "void": (0, 0, 0, 0),
    "stoneDim": (30, 34, 43, 255),
    "stone": (58, 63, 75, 255),
    "stoneLive": (74, 85, 104, 255),
    "stoneLite": (96, 108, 128, 255),
    "iron": (40, 45, 55, 255),
    "ironDark": (22, 26, 34, 255),
    "neon": (45, 226, 230, 255),
    "neonDim": (28, 120, 128, 255),
    "magenta": (255, 42, 109, 255),
    "magentaDim": (140, 30, 70, 255),
    "amber": (255, 200, 87, 255),
    "amberDim": (140, 110, 50, 255),
    "green": (57, 255, 20, 255),
    "red": (255, 59, 59, 255),
    "wood": (72, 52, 38, 255),
    "woodLite": (98, 72, 52, 255),
    "parchment": (180, 160, 120, 255),
    "glass": (60, 100, 120, 200),
    "purple": (90, 70, 130, 255),
    "purpleDim": (50, 40, 70, 255),
}


def new(w: int, h: int, fill=None) -> Image.Image:
    return Image.new("RGBA", (w, h), fill or PAL["void"])


def px(d: ImageDraw.ImageDraw, x: int, y: int, c, s: int = 1) -> None:
    d.rectangle([x, y, x + s - 1, y + s - 1], fill=c)


def rect(d: ImageDraw.ImageDraw, x0, y0, x1, y1, c) -> None:
    d.rectangle([x0, y0, x1, y1], fill=c)


def outline(d: ImageDraw.ImageDraw, x0, y0, x1, y1, c) -> None:
    d.rectangle([x0, y0, x1, y1], outline=c)


def floor_tiles(d: ImageDraw.ImageDraw, w: int, h: int, base, grout, m: int = 4) -> None:
    """Checker / flagstone floor with slight variation."""
    rect(d, m, m, w - 1 - m, h - 1 - m, base)
    tile = 8
    for y in range(m, h - m, tile):
        for x in range(m, w - m, tile):
            # grout lines
            for gx in range(x, min(x + tile, w - m)):
                px(d, gx, y, grout)
            for gy in range(y, min(y + tile, h - m)):
                px(d, x, gy, grout)
            # slight plate highlight
            if ((x // tile) + (y // tile)) % 3 == 0:
                for dy in range(1, min(3, tile - 1)):
                    for dx in range(1, min(3, tile - 1)):
                        if m < x + dx < w - m and m < y + dy < h - m:
                            px(d, x + dx, y + dy, PAL["stoneLite"] if base == PAL["stoneLive"] else PAL["stone"])


def wall_frame(d: ImageDraw.ImageDraw, w: int, h: int, rim_c, live: bool) -> None:
    """Heavy stone walls + neon rim when live."""
    # outer void already bg
    # wall thickness 4px
    for t in range(4):
        c = PAL["iron"] if t < 2 else PAL["stone"]
        outline(d, t, t, w - 1 - t, h - 1 - t, c)
    # inner rim
    if live:
        outline(d, 4, 4, w - 5, h - 5, rim_c)
        # corner runes
        for cx, cy in [(6, 6), (w - 8, 6), (6, h - 8), (w - 8, h - 8)]:
            px(d, cx, cy, rim_c, 2)
            px(d, cx + 2, cy, PAL["neonDim"])
    else:
        # dashed seal
        for i in range(5, w - 5, 4):
            px(d, i, 4, PAL["seal"] if "seal" in PAL else PAL["purple"], 2)
            px(d, i, h - 5, PAL["purple"], 2)
        for i in range(5, h - 5, 4):
            px(d, 4, i, PAL["purple"], 2)
            px(d, w - 5, i, PAL["purple"], 2)


def draw_table(d, x, y, w=18, h=10, accent=None) -> None:
    """Low table / desk."""
    rect(d, x, y, x + w - 1, y + h - 1, PAL["wood"])
    outline(d, x, y, x + w - 1, y + h - 1, PAL["ironDark"])
    # top edge highlight
    for dx in range(1, w - 1):
        px(d, x + dx, y + 1, PAL["woodLite"])
    if accent:
        # terminal / rune plate on table
        rect(d, x + 4, y + 3, x + w - 5, y + h - 3, PAL["ironDark"])
        px(d, x + w // 2 - 1, y + h // 2 - 1, accent, 2)


def draw_bookshelf(d, x, y, w=10, h=22) -> None:
    rect(d, x, y, x + w - 1, y + h - 1, PAL["wood"])
    outline(d, x, y, x + w - 1, y + h - 1, PAL["ironDark"])
    # shelves
    for sy in range(y + 4, y + h - 2, 5):
        for dx in range(1, w - 1):
            px(d, x + dx, sy, PAL["ironDark"])
        # books
        colors = [PAL["magentaDim"], PAL["neonDim"], PAL["amberDim"], PAL["purple"], PAL["woodLite"]]
        bx = x + 1
        while bx < x + w - 2:
            bw = 2 if (bx + y) % 3 else 1
            c = colors[(bx + sy) % len(colors)]
            for dy in range(1, 4):
                if sy - dy > y:
                    for dx in range(bw):
                        if bx + dx < x + w - 1:
                            px(d, bx + dx, sy - dy, c)
            bx += bw + 1


def draw_cauldron(d, x, y) -> None:
    # base
    rect(d, x + 2, y + 8, x + 12, y + 14, PAL["iron"])
    # bowl
    rect(d, x + 1, y + 3, x + 13, y + 10, PAL["ironDark"])
    outline(d, x + 1, y + 3, x + 13, y + 10, PAL["stoneLite"])
    # brew glow
    rect(d, x + 3, y + 5, x + 11, y + 8, PAL["magentaDim"])
    px(d, x + 5, y + 6, PAL["magenta"], 2)
    px(d, x + 8, y + 5, PAL["neon"], 1)
    # legs
    px(d, x + 2, y + 14, PAL["iron"], 2)
    px(d, x + 10, y + 14, PAL["iron"], 2)


def draw_anvil(d, x, y) -> None:
    rect(d, x + 2, y + 6, x + 14, y + 12, PAL["stone"])
    rect(d, x, y + 4, x + 16, y + 8, PAL["stoneLive"])
    outline(d, x, y + 4, x + 16, y + 8, PAL["ironDark"])
    px(d, x + 14, y + 5, PAL["neonDim"], 2)  # spark channel
    # base
    rect(d, x + 5, y + 12, x + 11, y + 16, PAL["iron"])


def draw_weapon_rack(d, x, y) -> None:
    # uprights
    for uy in range(y, y + 20):
        px(d, x, uy, PAL["iron"])
        px(d, x + 10, uy, PAL["iron"])
    # crossbars + blades
    for i, cy in enumerate([y + 4, y + 10, y + 16]):
        for dx in range(1, 10):
            px(d, x + dx, cy, PAL["stone"])
        # blade glow tip
        tip = PAL["neon"] if i % 2 == 0 else PAL["magenta"]
        px(d, x + 5, cy - 2, tip, 2)
        px(d, x + 5, cy - 4, PAL["stoneLite"])


def draw_telescope(d, x, y) -> None:
    # mount
    rect(d, x + 4, y + 14, x + 10, y + 18, PAL["iron"])
    # tube diagonal-ish (stepped)
    rect(d, x + 2, y + 8, x + 14, y + 12, PAL["stoneLive"])
    rect(d, x + 6, y + 4, x + 16, y + 9, PAL["stone"])
    outline(d, x + 6, y + 4, x + 16, y + 9, PAL["ironDark"])
    # lens
    rect(d, x + 14, y + 5, x + 17, y + 8, PAL["neonDim"])
    px(d, x + 15, y + 6, PAL["neon"], 1)
    # tripod
    px(d, x + 2, y + 16, PAL["iron"], 2)
    px(d, x + 12, y + 16, PAL["iron"], 2)


def draw_chest(d, x, y, sealed=False) -> None:
    rect(d, x, y + 4, x + 16, y + 14, PAL["wood"])
    outline(d, x, y + 4, x + 16, y + 14, PAL["ironDark"])
    # lid
    rect(d, x, y + 2, x + 16, y + 6, PAL["woodLite"])
    # lock plate
    lock_c = PAL["amber"] if sealed else PAL["neon"]
    rect(d, x + 6, y + 7, x + 10, y + 11, PAL["iron"])
    px(d, x + 7, y + 8, lock_c, 2)


def draw_throne(d, x, y) -> None:
    # seat
    rect(d, x + 2, y + 10, x + 14, y + 18, PAL["purpleDim"])
    outline(d, x + 2, y + 10, x + 14, y + 18, PAL["purple"])
    # back
    rect(d, x + 2, y, x + 14, y + 12, PAL["purple"])
    outline(d, x + 2, y, x + 14, y + 12, PAL["ironDark"])
    # crest neon
    px(d, x + 6, y + 2, PAL["neon"], 2)
    px(d, x + 8, y + 2, PAL["magenta"], 2)
    # armrests
    rect(d, x, y + 10, x + 3, y + 16, PAL["stone"])
    rect(d, x + 13, y + 10, x + 16, y + 16, PAL["stone"])


def draw_server_rack(d, x, y) -> None:
    rect(d, x, y, x + 12, y + 24, PAL["ironDark"])
    outline(d, x, y, x + 12, y + 24, PAL["stoneLite"])
    for i, sy in enumerate(range(y + 2, y + 22, 4)):
        for dx in range(2, 11):
            px(d, x + dx, sy, PAL["stone"])
        led = [PAL["neon"], PAL["magenta"], PAL["amber"], PAL["green"]][i % 4]
        px(d, x + 3, sy + 1, led)
        px(d, x + 5, sy + 1, led if i % 2 else PAL["neonDim"])
        px(d, x + 8, sy + 1, PAL["stoneLive"])


def draw_conduit(d, x0, y0, x1, y1, c=None) -> None:
    c = c or PAL["neonDim"]
    # horizontal then vertical L
    if y0 == y1:
        for x in range(min(x0, x1), max(x0, x1) + 1):
            px(d, x, y0, c)
    elif x0 == x1:
        for y in range(min(y0, y1), max(y0, y1) + 1):
            px(d, x0, y, c)
    else:
        for x in range(min(x0, x1), max(x0, x1) + 1):
            px(d, x, y0, c)
        for y in range(min(y0, y1), max(y0, y1) + 1):
            px(d, x1, y, c)


def draw_carpet(d, x, y, w, h, accent) -> None:
    rect(d, x, y, x + w - 1, y + h - 1, PAL["purpleDim"])
    outline(d, x, y, x + w - 1, y + h - 1, accent)
    # center diamond
    cx, cy = x + w // 2, y + h // 2
    px(d, cx - 1, cy, accent, 2)
    px(d, cx, cy - 1, accent)


def draw_pillar(d, x, y) -> None:
    rect(d, x, y, x + 6, y + 16, PAL["stone"])
    outline(d, x, y, x + 6, y + 16, PAL["ironDark"])
    px(d, x + 2, y + 2, PAL["neonDim"], 2)
    px(d, x + 2, y + 12, PAL["neonDim"], 2)


def draw_crystal(d, x, y) -> None:
    # pedestal
    rect(d, x + 2, y + 10, x + 10, y + 14, PAL["stone"])
    # crystal
    rect(d, x + 4, y + 2, x + 8, y + 10, PAL["neonDim"])
    px(d, x + 5, y + 3, PAL["neon"], 2)
    px(d, x + 5, y + 6, PAL["magenta"], 1)


def base_room(live: bool = True) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = new(96, 96, PAL["bg"])
    d = ImageDraw.Draw(img)
    base = PAL["stoneLive"] if live else PAL["stoneDim"]
    grout = PAL["ironDark"] if live else PAL["bg"]
    floor_tiles(d, 96, 96, base, grout, m=5)
    wall_frame(d, 96, 96, PAL["neon"] if live else PAL["purple"], live)
    return img, d


def seal_overlay(img: Image.Image) -> Image.Image:
    """Dim + seal stamp for UNFORGED variants."""
    out = img.copy()
    d = ImageDraw.Draw(out)
    # darken overlay
    overlay = Image.new("RGBA", (96, 96), (11, 14, 20, 110))
    out = Image.alpha_composite(out, overlay)
    d = ImageDraw.Draw(out)
    # seal circle center
    cx, cy = 48, 48
    for r in range(14, 18):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=PAL["purple"])
    d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], outline=PAL["amber"])
    # X bars
    for i in range(-8, 9):
        px(d, cx + i, cy + i, PAL["amber"])
        px(d, cx + i, cy - i, PAL["amber"])
    # outer dashed already in wall for sealed
    return out


# ── Room builders ──────────────────────────────────────────────

def room_great_hall(live=True) -> Image.Image:
    img, d = base_room(live)
    draw_carpet(d, 28, 36, 40, 28, PAL["neon"] if live else PAL["purple"])
    draw_throne(d, 40, 18)
    draw_pillar(d, 14, 28)
    draw_pillar(d, 76, 28)
    draw_pillar(d, 14, 58)
    draw_pillar(d, 76, 58)
    draw_table(d, 22, 68, 20, 8, PAL["amber"] if live else None)
    draw_table(d, 54, 68, 20, 8, PAL["neon"] if live else None)
    if live:
        draw_conduit(d, 48, 36, 48, 50, PAL["neonDim"])
        draw_conduit(d, 20, 20, 20, 70, PAL["neonDim"])
        draw_conduit(d, 76, 20, 76, 70, PAL["neonDim"])
    return img


def room_library(live=True) -> Image.Image:
    img, d = base_room(live)
    # wall shelves
    draw_bookshelf(d, 8, 12, 12, 28)
    draw_bookshelf(d, 8, 44, 12, 28)
    draw_bookshelf(d, 76, 12, 12, 28)
    draw_bookshelf(d, 76, 44, 12, 28)
    draw_bookshelf(d, 24, 10, 14, 18)
    draw_bookshelf(d, 58, 10, 14, 18)
    # reading desk center
    draw_table(d, 34, 42, 28, 12, PAL["amber"] if live else PAL["stoneLite"])
    # parchment stack
    rect(d, 38, 44, 46, 48, PAL["parchment"])
    rect(d, 48, 45, 54, 49, PAL["parchment"])
    # lectern
    rect(d, 42, 58, 54, 68, PAL["wood"])
    outline(d, 42, 58, 54, 68, PAL["ironDark"])
    px(d, 46, 60, PAL["neon"] if live else PAL["stoneLite"], 3)
    # floor rune
    if live:
        draw_carpet(d, 36, 28, 24, 12, PAL["neonDim"])
        draw_crystal(d, 64, 60)
    return img


def room_alchemy_lab(live=True) -> Image.Image:
    img, d = base_room(live)
    draw_cauldron(d, 38, 40)
    draw_table(d, 12, 20, 22, 10, PAL["magenta"] if live else None)
    draw_table(d, 62, 20, 22, 10, PAL["green"] if live else None)
    draw_table(d, 12, 64, 20, 10, PAL["neon"] if live else None)
    # shelves with vials
    rect(d, 70, 50, 86, 78, PAL["wood"])
    outline(d, 70, 50, 86, 78, PAL["ironDark"])
    for i, (vx, vy, vc) in enumerate([
        (72, 54, PAL["magenta"]),
        (78, 54, PAL["neon"]),
        (72, 62, PAL["amber"]),
        (78, 62, PAL["green"]),
        (74, 70, PAL["purple"]),
    ]):
        rect(d, vx, vy, vx + 3, vy + 5, PAL["glass"])
        px(d, vx + 1, vy + 3, vc, 2)
    # pipes / conduits
    if live:
        draw_conduit(d, 24, 30, 40, 30, PAL["magentaDim"])
        draw_conduit(d, 50, 30, 70, 30, PAL["neonDim"])
        draw_conduit(d, 45, 54, 45, 70, PAL["magentaDim"])
    # floor stain / rune circle under cauldron
    for r in range(10, 14):
        d.ellipse([48 - r, 52 - r, 48 + r, 52 + r], outline=PAL["magentaDim"] if live else PAL["stone"])
    return img


def room_armory(live=True) -> Image.Image:
    img, d = base_room(live)
    draw_anvil(d, 38, 48)
    draw_weapon_rack(d, 12, 18)
    draw_weapon_rack(d, 74, 18)
    draw_weapon_rack(d, 12, 50)
    # forge hearth
    rect(d, 58, 58, 82, 78, PAL["ironDark"])
    outline(d, 58, 58, 82, 78, PAL["stoneLite"])
    rect(d, 62, 62, 78, 74, PAL["magentaDim"] if live else PAL["stone"])
    if live:
        px(d, 66, 66, PAL["magenta"], 3)
        px(d, 70, 68, PAL["amber"], 2)
        px(d, 72, 64, PAL["red"], 1)
    # workbench
    draw_table(d, 28, 20, 24, 10, PAL["neon"] if live else None)
    # shield on wall
    rect(d, 44, 28, 54, 38, PAL["stoneLive"])
    outline(d, 44, 28, 54, 38, PAL["neon"] if live else PAL["stone"])
    px(d, 47, 31, PAL["magenta"] if live else PAL["stoneLite"], 3)
    return img


def room_observatory(live=True) -> Image.Image:
    img, d = base_room(live)
    # domed floor circle
    for r in range(22, 26):
        d.ellipse([48 - r, 50 - r, 48 + r, 50 + r], outline=PAL["neonDim"] if live else PAL["stone"])
    d.ellipse([48 - 18, 50 - 18, 48 + 18, 50 + 18], outline=PAL["stoneLive"])
    # star map center
    rect(d, 40, 42, 56, 56, PAL["ironDark"])
    outline(d, 40, 42, 56, 56, PAL["neon"] if live else PAL["stone"])
    for sx, sy in [(44, 46), (50, 48), (46, 52), (52, 44), (48, 50)]:
        px(d, sx, sy, PAL["amber"] if live else PAL["stoneLite"])
    draw_telescope(d, 62, 20)
    draw_telescope(d, 14, 58)
    # console banks
    draw_server_rack(d, 10, 16)
    draw_table(d, 30, 68, 36, 10, PAL["neon"] if live else None)
    # hanging orrery bits
    if live:
        px(d, 48, 18, PAL["neon"], 2)
        draw_conduit(d, 48, 20, 48, 40, PAL["neonDim"])
        px(d, 30, 24, PAL["magenta"])
        px(d, 66, 28, PAL["amber"])
        px(d, 55, 22, PAL["green"])
    return img


def room_vault(live=True) -> Image.Image:
    img, d = base_room(live)
    # reinforced floor plate
    rect(d, 24, 28, 72, 72, PAL["ironDark"])
    outline(d, 24, 28, 72, 72, PAL["stoneLite"])
    # central seal
    for r in range(12, 18):
        d.ellipse([48 - r, 50 - r, 48 + r, 50 + r], outline=PAL["amber"] if live else PAL["purple"])
    px(d, 46, 48, PAL["amber"] if live else PAL["stone"], 4)
    # chests
    draw_chest(d, 28, 32, sealed=not live)
    draw_chest(d, 52, 32, sealed=not live)
    draw_chest(d, 28, 58, sealed=True)
    draw_chest(d, 52, 58, sealed=not live)
    # pillars / bars
    for bx in [18, 74]:
        for by in range(20, 78, 2):
            px(d, bx, by, PAL["stoneLite"] if by % 4 == 0 else PAL["iron"])
    if live:
        draw_conduit(d, 24, 24, 72, 24, PAL["amberDim"])
        draw_conduit(d, 24, 76, 72, 76, PAL["amberDim"])
    return img


# ── Agents 32×32 ───────────────────────────────────────────────

def agent_base(robe, accent, trim) -> Image.Image:
    """Top-down-ish small agent sprite on transparent bg."""
    img = new(32, 32, PAL["void"])
    d = ImageDraw.Draw(img)
    # soft ground shadow
    d.ellipse([8, 24, 24, 30], fill=(0, 0, 0, 80))
    # boots
    rect(d, 10, 22, 14, 26, PAL["ironDark"])
    rect(d, 17, 22, 21, 26, PAL["ironDark"])
    # body / robe
    rect(d, 9, 12, 22, 23, robe)
    outline(d, 9, 12, 22, 23, trim)
    # belt
    for x in range(10, 22):
        px(d, x, 18, accent)
    # arms
    rect(d, 6, 13, 9, 20, robe)
    rect(d, 22, 13, 25, 20, robe)
    # head
    rect(d, 11, 5, 20, 13, (200, 180, 150, 255))
    outline(d, 11, 5, 20, 13, PAL["ironDark"])
    # eyes glow
    px(d, 13, 8, accent, 2)
    px(d, 17, 8, accent, 2)
    # hood / hair top
    rect(d, 10, 3, 21, 7, trim)
    return img


def agent_raziel() -> Image.Image:
    img = agent_base(PAL["purpleDim"], PAL["neon"], PAL["purple"])
    d = ImageDraw.Draw(img)
    # staff
    for y in range(4, 28):
        px(d, 26, y, PAL["stoneLite"])
    px(d, 25, 4, PAL["neon"], 3)
    # shoulder plates
    rect(d, 7, 12, 10, 15, PAL["stoneLive"])
    rect(d, 21, 12, 24, 15, PAL["stoneLive"])
    return img


def agent_oracle() -> Image.Image:
    img = agent_base(PAL["ironDark"], PAL["amber"], PAL["stoneLive"])
    d = ImageDraw.Draw(img)
    # floating orbs
    px(d, 4, 8, PAL["amber"], 2)
    px(d, 26, 10, PAL["neon"], 2)
    px(d, 5, 18, PAL["magenta"], 2)
    # third eye
    px(d, 14, 6, PAL["amber"], 2)
    return img


def agent_clawforge() -> Image.Image:
    img = agent_base(PAL["stone"], PAL["magenta"], PAL["ironDark"])
    d = ImageDraw.Draw(img)
    # hammer
    for y in range(10, 26):
        px(d, 27, y, PAL["iron"])
    rect(d, 24, 8, 30, 13, PAL["stoneLive"])
    px(d, 25, 9, PAL["magenta"], 2)
    # apron
    rect(d, 11, 16, 20, 24, PAL["ironDark"])
    px(d, 14, 18, PAL["amber"])
    return img


# ── Floor tile 64×64 seamless-ish ──────────────────────────────

def stone_floor() -> Image.Image:
    img = new(64, 64, PAL["bg"])
    d = ImageDraw.Draw(img)
    tile = 16
    for y in range(0, 64, tile):
        for x in range(0, 64, tile):
            base = PAL["stone"] if ((x // tile) + (y // tile)) % 2 == 0 else PAL["stoneDim"]
            rect(d, x, y, x + tile - 1, y + tile - 1, base)
            outline(d, x, y, x + tile - 1, y + tile - 1, PAL["ironDark"])
            # crack detail
            if (x + y) % 32 == 0:
                for i in range(3, 12):
                    px(d, x + i, y + 8 + (i % 3), PAL["ironDark"])
            # dim neon fleck occasionally
            if (x * 3 + y * 7) % 48 == 0:
                px(d, x + 6, y + 6, PAL["neonDim"])
    return img


# ── Furniture props (optional overlays) ────────────────────────

def prop_table() -> Image.Image:
    img = new(24, 16, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_table(d, 2, 2, 20, 12, PAL["neon"])
    return img


def prop_bookshelf() -> Image.Image:
    img = new(16, 28, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_bookshelf(d, 2, 2, 12, 24)
    return img


def prop_chest() -> Image.Image:
    img = new(20, 18, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_chest(d, 2, 2)
    return img


def prop_cauldron() -> Image.Image:
    img = new(18, 20, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_cauldron(d, 1, 1)
    return img


def prop_anvil() -> Image.Image:
    img = new(20, 20, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_anvil(d, 1, 1)
    return img


def prop_crystal() -> Image.Image:
    img = new(16, 18, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_crystal(d, 1, 1)
    return img


def prop_server() -> Image.Image:
    img = new(16, 28, PAL["void"])
    d = ImageDraw.Draw(img)
    draw_server_rack(d, 2, 2)
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(f"  {path.relative_to(ROOT)} {img.size}")


def main() -> None:
    rooms_dir = ART / "rooms"
    agents_dir = ART / "agents"
    floor_dir = ART / "floor"
    furn_dir = ART / "furniture"

    builders = {
        "great-hall": room_great_hall,
        "library": room_library,
        "alchemy-lab": room_alchemy_lab,
        "armory": room_armory,
        "observatory": room_observatory,
        "vault": room_vault,
    }

    print("=== Room interiors (live + sealed) ===")
    for rid, fn in builders.items():
        live = fn(True)
        sealed = seal_overlay(fn(False))
        save(live, rooms_dir / f"room_{rid}.png")
        save(sealed, rooms_dir / f"room_{rid}_sealed.png")

    print("=== Agents ===")
    save(agent_raziel(), agents_dir / "agent_raziel.png")
    save(agent_oracle(), agents_dir / "agent_oracle.png")
    save(agent_clawforge(), agents_dir / "agent_clawforge.png")

    print("=== Floor ===")
    save(stone_floor(), floor_dir / "stone_floor.png")

    print("=== Furniture props ===")
    for name, fn in [
        ("prop_table", prop_table),
        ("prop_bookshelf", prop_bookshelf),
        ("prop_chest", prop_chest),
        ("prop_cauldron", prop_cauldron),
        ("prop_anvil", prop_anvil),
        ("prop_crystal", prop_crystal),
        ("prop_server", prop_server),
    ]:
        save(fn(), furn_dir / f"{name}.png")

    # Also upgrade base tiles a bit
    print("=== Base tiles ===")
    base = ART / "tiles" / "base"
    # live
    img, d = base_room(True)
    # smaller crop feel — actually regenerate 48x48
    live48 = new(48, 48, PAL["bg"])
    d = ImageDraw.Draw(live48)
    floor_tiles(d, 48, 48, PAL["stoneLive"], PAL["ironDark"], m=2)
    for t in range(2):
        outline(d, t, t, 47 - t, 47 - t, PAL["stone"])
    outline(d, 2, 2, 45, 45, PAL["neon"])
    px(d, 4, 4, PAL["neon"], 2)
    px(d, 42, 4, PAL["neon"], 2)
    px(d, 4, 42, PAL["neon"], 2)
    px(d, 42, 42, PAL["neon"], 2)
    # mini desk
    draw_table(d, 14, 20, 20, 10, PAL["neon"])
    save(live48, base / "room_live_48.png")

    unf = new(48, 48, PAL["bg"])
    d = ImageDraw.Draw(unf)
    floor_tiles(d, 48, 48, PAL["stoneDim"], PAL["bg"], m=2)
    for t in range(2):
        outline(d, t, t, 47 - t, 47 - t, PAL["stone"])
    for i in range(3, 45, 4):
        px(d, i, 2, PAL["purple"], 2)
        px(d, i, 45, PAL["purple"], 2)
        px(d, 2, i, PAL["purple"], 2)
        px(d, 45, i, PAL["purple"], 2)
    save(unf, base / "room_unforged_48.png")

    locked = unf.copy()
    d = ImageDraw.Draw(locked)
    for i in range(-6, 7):
        px(d, 24 + i, 24 + i, PAL["red"])
        px(d, 24 + i, 24 - i, PAL["red"])
    outline(d, 16, 16, 31, 31, PAL["red"])
    save(locked, base / "room_locked_48.png")

    print("Done.")


if __name__ == "__main__":
    main()
