#!/usr/bin/env python3
"""Ravenstack Keep — world art generator (Suikoden-HQ pass).

Procedural pixel art for the Keep map. No external assets, no network, no
downloaded sprite packs. Pillow only. Deterministic (fixed seed) so reruns
produce byte-identical output and git diffs stay quiet.

Emits under ui/public/art/:
  floor/      stone_floor, corridor_h, corridor_v, corridor_x   (48x48, tileable)
  rooms/      room_<id>.png / _sealed.png / _locked.png         (160x136)
  agents/     agent_<id>.png                                    (32x32)
  portraits/  portrait_<id>.png                                 (128x128)
  hud/        rank_frame.png                                    (talk/rank chrome)

Palette is locked by ART-DIRECTION: neon is accent only (<= ~20% of a tile),
and no text is ever baked into a sprite.

  python3 ui/scripts/generate_keep_world.py
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw

# --------------------------------------------------------------------------
# Locked palette
# --------------------------------------------------------------------------

VOID = (0x0B, 0x0E, 0x14, 255)
UNFORGED = (0x1E, 0x22, 0x2B, 255)
STONE = (0x3A, 0x3F, 0x4B, 255)
LIVE = (0x4A, 0x55, 0x68, 255)
CYAN = (0x2D, 0xE2, 0xE6, 255)
MAGENTA = (0xFF, 0x2A, 0x6D, 255)
AMBER = (0xFF, 0xC8, 0x57, 255)
GREEN = (0x39, 0xFF, 0x14, 255)
RED = (0xFF, 0x3B, 0x3B, 255)
SEAL = (0x6B, 0x5B, 0x95, 255)

FLOOR_LIVE = (0x26, 0x2B, 0x36, 255)
FLOOR_DARK = (0x16, 0x19, 0x1F, 255)
MORTAR = (0x15, 0x18, 0x1E, 255)

TILE = 48
ROOM_W, ROOM_H = 160, 136
AGENT_W, AGENT_H = 32, 32
PORTRAIT = 128

SEED = 0x5A17


def _mix(a, b, t):
    """Blend two RGBA tuples."""
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


def _dim(c, t=0.5):
    return _mix(VOID, c, t)


def _alpha(c, a):
    return (c[0], c[1], c[2], a)


# --------------------------------------------------------------------------
# Floor tiles (seamlessly tileable at 48x48)
# --------------------------------------------------------------------------


def stone_floor() -> Image.Image:
    """Dark keep flagstone. Brick-offset mortar so 48px tiling is seamless."""
    img = Image.new("RGBA", (TILE, TILE), FLOOR_LIVE)
    d = ImageDraw.Draw(img)
    rnd = random.Random(SEED)

    # Horizontal mortar courses at y=0 and y=24 (wrap-safe).
    for y in (0, 24):
        d.line([(0, y), (TILE - 1, y)], fill=MORTAR)
    # Vertical joints, offset per course -> running bond.
    for y0, xs in ((0, (16,)), (24, (0, 32))):
        for x in xs:
            d.line([(x, y0), (x, y0 + 23)], fill=MORTAR)

    # Subtle grain; keep it low-contrast so the map stays readable.
    for _ in range(70):
        x, y = rnd.randrange(TILE), rnd.randrange(TILE)
        if y in (0, 24):
            continue
        shade = _mix(FLOOR_LIVE, STONE, rnd.uniform(0.10, 0.34))
        img.putpixel((x, y), shade)
    for _ in range(26):
        x, y = rnd.randrange(TILE), rnd.randrange(TILE)
        img.putpixel((x, y), _mix(FLOOR_LIVE, VOID, rnd.uniform(0.15, 0.4)))
    return img


def _corridor_base() -> Image.Image:
    img = Image.new("RGBA", (TILE, TILE), _mix(FLOOR_LIVE, VOID, 0.35))
    d = ImageDraw.Draw(img)
    rnd = random.Random(SEED + 7)
    for _ in range(40):
        x, y = rnd.randrange(TILE), rnd.randrange(TILE)
        img.putpixel((x, y), _mix(FLOOR_DARK, STONE, rnd.uniform(0.1, 0.3)))
    return img


def corridor(vertical: bool = False, cross: bool = False) -> Image.Image:
    """Conduit trench: dark channel + thin cyan pipe. Neon stays ~6% of tile."""
    img = _corridor_base()
    d = ImageDraw.Draw(img)
    mid = TILE // 2

    def channel_h():
        d.rectangle([0, mid - 6, TILE - 1, mid + 5], fill=FLOOR_DARK)
        d.line([(0, mid - 6), (TILE - 1, mid - 6)], fill=_dim(STONE, 0.8))
        d.line([(0, mid + 5), (TILE - 1, mid + 5)], fill=_dim(STONE, 0.8))
        d.line([(0, mid), (TILE - 1, mid)], fill=_alpha(CYAN, 210))
        d.line([(0, mid - 1), (TILE - 1, mid - 1)], fill=_alpha(CYAN, 60))
        d.line([(0, mid + 1), (TILE - 1, mid + 1)], fill=_alpha(CYAN, 60))

    def channel_v():
        d.rectangle([mid - 6, 0, mid + 5, TILE - 1], fill=FLOOR_DARK)
        d.line([(mid - 6, 0), (mid - 6, TILE - 1)], fill=_dim(STONE, 0.8))
        d.line([(mid + 5, 0), (mid + 5, TILE - 1)], fill=_dim(STONE, 0.8))
        d.line([(mid, 0), (mid, TILE - 1)], fill=_alpha(CYAN, 210))
        d.line([(mid - 1, 0), (mid - 1, TILE - 1)], fill=_alpha(CYAN, 60))
        d.line([(mid + 1, 0), (mid + 1, TILE - 1)], fill=_alpha(CYAN, 60))

    if cross:
        channel_h()
        channel_v()
    elif vertical:
        channel_v()
    else:
        channel_h()
    return img


# --------------------------------------------------------------------------
# Room interiors
# --------------------------------------------------------------------------


def _room_shell(state: str) -> tuple[Image.Image, ImageDraw.ImageDraw, dict]:
    """Walls + floor. Returns (img, draw, theme)."""
    live = state == "live"
    wall = STONE if live else UNFORGED
    floor = FLOOR_LIVE if live else FLOOR_DARK
    trim = LIVE if live else _dim(STONE, 0.55)

    img = Image.new("RGBA", (ROOM_W, ROOM_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Outer wall block with a 1px darker keyline so rooms read against floor.
    d.rectangle([0, 0, ROOM_W - 1, ROOM_H - 1], fill=wall, outline=VOID)
    # Bevel: lit top/left, dark bottom/right.
    d.line([(1, 1), (ROOM_W - 2, 1)], fill=trim)
    d.line([(1, 1), (1, ROOM_H - 2)], fill=trim)
    d.line([(1, ROOM_H - 2), (ROOM_W - 2, ROOM_H - 2)], fill=_dim(wall, 0.55))
    d.line([(ROOM_W - 2, 1), (ROOM_W - 2, ROOM_H - 2)], fill=_dim(wall, 0.55))

    # Interior floor
    inset = 9
    d.rectangle([inset, inset, ROOM_W - 1 - inset, ROOM_H - 1 - inset], fill=floor)

    # Flagstone hint inside
    rnd = random.Random(SEED + 3)
    for _ in range(90):
        x = rnd.randrange(inset + 1, ROOM_W - inset - 1)
        y = rnd.randrange(inset + 1, ROOM_H - inset - 1)
        img.putpixel((x, y), _mix(floor, STONE, rnd.uniform(0.08, 0.26)))

    # Doorway on the south wall (where officers walk in).
    dx0, dx1 = ROOM_W // 2 - 11, ROOM_W // 2 + 10
    d.rectangle([dx0, ROOM_H - inset - 1, dx1, ROOM_H - 1], fill=FLOOR_DARK)
    if live:
        d.line(
            [(dx0, ROOM_H - 2), (dx1, ROOM_H - 2)],
            fill=_alpha(CYAN, 150),
        )

    theme = {
        "live": live,
        "wall": wall,
        "floor": floor,
        "trim": trim,
        "inset": inset,
        "cx": ROOM_W // 2,
        "cy": ROOM_H // 2 - 2,
    }
    return img, d, theme


def _accent(theme: dict, color, t_live: float = 1.0, t_dead: float = 0.22):
    """Neon accent that fades out for sealed/locked rooms."""
    return _mix(theme["floor"], color, t_live if theme["live"] else t_dead)


def _chains(d: ImageDraw.ImageDraw, color=AMBER):
    """Two diagonal chains across the room — 'not yet earned'."""
    c = _mix(UNFORGED, color, 0.45)
    link = _mix(UNFORGED, color, 0.68)
    for x0, y0, x1, y1 in ((6, 30, ROOM_W - 7, ROOM_H - 24),
                           (6, ROOM_H - 24, ROOM_W - 7, 30)):
        d.line([(x0, y0), (x1, y1)], fill=c, width=3)
        steps = 11
        for i in range(steps):
            t = i / (steps - 1)
            px = int(x0 + (x1 - x0) * t)
            py = int(y0 + (y1 - y0) * t)
            d.rectangle([px - 1, py - 1, px + 1, py + 1], fill=link)


def _seal_plate(d: ImageDraw.ImageDraw, color):
    """Small stamped plate over the doorway."""
    cx = ROOM_W // 2
    y = ROOM_H - 26
    d.rectangle([cx - 9, y, cx + 8, y + 11], fill=_mix(UNFORGED, color, 0.30),
                outline=_mix(UNFORGED, color, 0.62))
    d.line([(cx - 4, y + 5), (cx + 3, y + 5)], fill=_mix(UNFORGED, color, 0.75))


# --- per-room furniture -----------------------------------------------------


def _f_great_hall(d, t):
    cx, cy = t["cx"], t["cy"]
    # Long banner pair
    for bx in (cx - 46, cx + 39):
        d.rectangle([bx, 16, bx + 7, 60], fill=_mix(t["floor"], MAGENTA, 0.30 if t["live"] else 0.12))
        d.polygon([(bx, 60), (bx + 7, 60), (bx + 3, 67)],
                  fill=_mix(t["floor"], MAGENTA, 0.30 if t["live"] else 0.12))
    # Dais
    d.rectangle([cx - 26, cy - 4, cx + 25, cy + 26], fill=_mix(t["floor"], STONE, 0.55))
    d.rectangle([cx - 20, cy - 10, cx + 19, cy + 4], fill=_mix(t["floor"], STONE, 0.75))
    # Throne
    d.rectangle([cx - 11, cy - 34, cx + 10, cy + 2], fill=_mix(t["floor"], LIVE, 0.85))
    d.rectangle([cx - 8, cy - 31, cx + 7, cy - 8], fill=_dim(LIVE, 0.55))
    d.polygon([(cx - 11, cy - 34), (cx, cy - 44), (cx + 10, cy - 34)],
              fill=_accent(t, AMBER, 0.85, 0.20))
    d.line([(cx, cy - 40), (cx, cy - 36)], fill=_accent(t, AMBER, 1.0, 0.2))


def _f_library(d, t):
    cx, cy = t["cx"], t["cy"]
    shelf = _mix(t["floor"], STONE, 0.7)
    for sx in (t["inset"] + 4, ROOM_W - t["inset"] - 34):
        d.rectangle([sx, 16, sx + 29, ROOM_H - 40], fill=shelf)
        for row in range(4):
            ry = 20 + row * 20
            d.line([(sx + 2, ry + 14), (sx + 27, ry + 14)], fill=_dim(STONE, 0.4))
            rnd = random.Random(SEED + sx + row)
            bx = sx + 3
            while bx < sx + 26:
                bw = rnd.choice((2, 3, 3, 4))
                col = rnd.choice((CYAN, SEAL, AMBER, STONE))
                d.rectangle([bx, ry + 3, bx + bw - 1, ry + 13],
                            fill=_mix(t["floor"], col, 0.34 if t["live"] else 0.14))
                bx += bw + 1
    # Reading lectern
    d.polygon([(cx - 10, cy + 20), (cx + 9, cy + 20), (cx + 5, cy + 6), (cx - 6, cy + 6)],
              fill=_mix(t["floor"], LIVE, 0.8))
    d.line([(cx - 5, cy + 10), (cx + 4, cy + 10)], fill=_accent(t, CYAN, 0.9, 0.2))


def _f_alchemy(d, t):
    cx, cy = t["cx"], t["cy"]
    # Bench
    d.rectangle([cx - 40, cy + 6, cx + 39, cy + 22], fill=_mix(t["floor"], STONE, 0.72))
    # Flasks
    for i, col in enumerate((MAGENTA, CYAN, GREEN)):
        fx = cx - 26 + i * 26
        d.polygon([(fx - 6, cy + 6), (fx + 5, cy + 6), (fx + 2, cy - 8), (fx - 3, cy - 8)],
                  fill=_mix(t["floor"], STONE, 0.85))
        d.rectangle([fx - 4, cy, fx + 3, cy + 5],
                    fill=_mix(t["floor"], col, 0.55 if t["live"] else 0.16))
        if t["live"]:
            d.point((fx - 1, cy - 4), fill=_alpha(col, 190))
    # Forge glow under bench
    d.rectangle([cx - 14, cy + 23, cx + 13, cy + 27],
                fill=_accent(t, MAGENTA, 0.6, 0.15))


def _f_armory(d, t):
    cx, cy = t["cx"], t["cy"]
    d.rectangle([cx - 44, cy - 26, cx + 43, cy - 22], fill=_mix(t["floor"], STONE, 0.8))
    # Hanging blades / tools
    for i in range(6):
        bx = cx - 38 + i * 15
        d.line([(bx, cy - 22), (bx, cy + 4)], fill=_mix(t["floor"], LIVE, 0.85))
        d.polygon([(bx - 3, cy + 4), (bx + 3, cy + 4), (bx, cy + 13)],
                  fill=_mix(t["floor"], STONE, 0.95))
    # Rack + shield
    d.rectangle([cx - 18, cy + 18, cx + 17, cy + 28], fill=_mix(t["floor"], STONE, 0.6))
    d.polygon([(cx - 9, cy + 16), (cx + 8, cy + 16), (cx, cy + 30)],
              fill=_accent(t, CYAN, 0.35, 0.12))


def _f_observatory(d, t):
    cx, cy = t["cx"], t["cy"]
    # Dome arc
    d.arc([cx - 44, cy - 40, cx + 43, cy + 30], 180, 360,
          fill=_mix(t["floor"], STONE, 0.85), width=4)
    # Telescope
    d.line([(cx - 12, cy + 20), (cx + 18, cy - 14)],
           fill=_mix(t["floor"], LIVE, 0.95), width=5)
    d.rectangle([cx - 18, cy + 18, cx - 5, cy + 26], fill=_mix(t["floor"], STONE, 0.8))
    # Stars
    rnd = random.Random(SEED + 21)
    for _ in range(14):
        sx = rnd.randrange(t["inset"] + 3, ROOM_W - t["inset"] - 3)
        sy = rnd.randrange(t["inset"] + 3, cy)
        d.point((sx, sy), fill=_accent(t, CYAN, 0.9, 0.18))


def _f_vault(d, t):
    cx, cy = t["cx"], t["cy"]
    d.rectangle([cx - 34, cy - 30, cx + 33, cy + 28], fill=_mix(t["floor"], STONE, 0.9))
    d.rectangle([cx - 29, cy - 25, cx + 28, cy + 23], fill=_dim(STONE, 0.5))
    # Dial
    d.ellipse([cx - 13, cy - 13, cx + 12, cy + 12], outline=_mix(t["floor"], LIVE, 1.0), width=3)
    d.line([(cx, cy), (cx + 7, cy - 7)], fill=_accent(t, RED, 0.8, 0.35), width=2)
    # Bolts
    for bx, by in ((cx - 25, cy - 21), (cx + 24, cy - 21), (cx - 25, cy + 19), (cx + 24, cy + 19)):
        d.ellipse([bx - 2, by - 2, bx + 2, by + 2], fill=_mix(t["floor"], STONE, 1.0))


def _f_round_table(d, t):
    cx, cy = t["cx"], t["cy"]
    d.ellipse([cx - 34, cy - 20, cx + 33, cy + 21],
              fill=_mix(t["floor"], STONE, 0.78),
              outline=_mix(t["floor"], LIVE, 0.9), width=2)
    d.ellipse([cx - 22, cy - 12, cx + 21, cy + 13], fill=_dim(STONE, 0.45))
    # Five seats around the table
    seats = ((cx, cy - 30), (cx - 30, cy - 10), (cx + 29, cy - 10),
             (cx - 20, cy + 27), (cx + 19, cy + 27))
    for sx, sy in seats:
        d.rectangle([sx - 6, sy - 6, sx + 5, sy + 5],
                    fill=_mix(t["floor"], LIVE, 0.85 if t["live"] else 0.45))
    d.ellipse([cx - 4, cy - 4, cx + 3, cy + 3], fill=_accent(t, AMBER, 0.9, 0.18))


def _f_clock_tower(d, t):
    cx, cy = t["cx"], t["cy"]
    # Tower body
    d.rectangle([cx - 26, cy - 34, cx + 25, cy + 30], fill=_mix(t["floor"], STONE, 0.8))
    d.polygon([(cx - 30, cy - 34), (cx, cy - 52), (cx + 29, cy - 34)],
              fill=_mix(t["floor"], LIVE, 0.7))
    # Clock face
    d.ellipse([cx - 17, cy - 24, cx + 16, cy + 9],
              fill=_dim(STONE, 0.35), outline=_mix(t["floor"], LIVE, 1.0), width=2)
    d.line([(cx, cy - 8), (cx, cy - 19)], fill=_accent(t, AMBER, 1.0, 0.22), width=2)
    d.line([(cx, cy - 8), (cx + 8, cy - 4)], fill=_accent(t, AMBER, 0.85, 0.2), width=2)
    # Pendulum slot
    d.rectangle([cx - 3, cy + 12, cx + 2, cy + 26], fill=_dim(STONE, 0.3))
    d.ellipse([cx - 5, cy + 24, cx + 4, cy + 30], fill=_accent(t, CYAN, 0.6, 0.15))


def _f_kitchen(d, t):
    cx, cy = t["cx"], t["cy"]
    # Hearth
    d.rectangle([cx - 32, cy - 26, cx + 31, cy + 20], fill=_mix(t["floor"], STONE, 0.85))
    d.rectangle([cx - 24, cy - 16, cx + 23, cy + 20], fill=_dim(STONE, 0.28))
    # Fire
    if t["live"]:
        d.polygon([(cx - 13, cy + 18), (cx, cy - 8), (cx + 12, cy + 18)],
                  fill=_mix(t["floor"], AMBER, 0.55))
        d.polygon([(cx - 7, cy + 18), (cx, cy + 2), (cx + 6, cy + 18)],
                  fill=_mix(t["floor"], MAGENTA, 0.45))
    else:
        d.polygon([(cx - 13, cy + 18), (cx, cy - 4), (cx + 12, cy + 18)],
                  fill=_mix(t["floor"], STONE, 0.35))
    # Pot on a hook
    d.line([(cx, cy - 26), (cx, cy - 18)], fill=_mix(t["floor"], LIVE, 0.8))
    d.ellipse([cx - 10, cy - 18, cx + 9, cy - 6], fill=_mix(t["floor"], LIVE, 0.95))
    # Counter
    d.rectangle([cx - 40, cy + 24, cx + 39, cy + 30], fill=_mix(t["floor"], STONE, 0.7))


def _f_roost(d, t):
    cx, cy = t["cx"], t["cy"]
    # Perch beams
    d.rectangle([cx - 40, cy - 12, cx + 39, cy - 8], fill=_mix(t["floor"], STONE, 0.8))
    d.rectangle([cx - 28, cy + 12, cx + 27, cy + 16], fill=_mix(t["floor"], STONE, 0.7))
    for px in (cx - 30, cx - 6, cx + 20):
        d.line([(px, cy - 8), (px, cy + 12)], fill=_dim(STONE, 0.5))
    # Roosting birds (silhouettes)
    for bx, by in ((cx - 24, cy - 14), (cx + 4, cy - 14), (cx + 14, cy + 10)):
        d.ellipse([bx - 5, by - 7, bx + 4, by + 1], fill=_dim(STONE, 0.95))
        d.polygon([(bx + 3, by - 5), (bx + 9, by - 3), (bx + 3, by - 1)],
                  fill=_dim(STONE, 0.8))
        d.point((bx + 1, by - 5), fill=_accent(t, CYAN, 1.0, 0.25))
    # Sky slit
    d.rectangle([cx - 8, t["inset"] + 1, cx + 7, t["inset"] + 9],
                fill=_accent(t, CYAN, 0.28, 0.10))


def _f_gatehouse(d, t):
    cx, cy = t["cx"], t["cy"]
    # Twin towers
    for tx in (cx - 44, cx + 30):
        d.rectangle([tx, cy - 30, tx + 14, cy + 28], fill=_mix(t["floor"], STONE, 0.85))
        for i in range(3):
            d.rectangle([tx + i * 5, cy - 34, tx + 3 + i * 5, cy - 30],
                        fill=_mix(t["floor"], STONE, 0.85))
    # Portcullis arch
    d.rectangle([cx - 24, cy - 24, cx + 23, cy + 28], fill=_dim(STONE, 0.3))
    d.arc([cx - 24, cy - 40, cx + 23, cy - 8], 180, 360,
          fill=_mix(t["floor"], STONE, 0.9), width=4)
    grid = _mix(t["floor"], LIVE, 0.9 if t["live"] else 0.5)
    for gx in range(cx - 22, cx + 23, 7):
        d.line([(gx, cy - 22), (gx, cy + 26)], fill=grid)
    for gy in range(cy - 22, cy + 27, 9):
        d.line([(cx - 22, gy), (cx + 22, gy)], fill=grid)
    # Lantern
    d.ellipse([cx - 3, cy - 34, cx + 2, cy - 29], fill=_accent(t, AMBER, 0.9, 0.2))


FURNITURE = {
    "great-hall": _f_great_hall,
    "library": _f_library,
    "alchemy-lab": _f_alchemy,
    "armory": _f_armory,
    "observatory": _f_observatory,
    "vault": _f_vault,
    "round-table": _f_round_table,
    "clock-tower": _f_clock_tower,
    "kitchen": _f_kitchen,
    "roost": _f_roost,
    "gatehouse": _f_gatehouse,
}


def room_image(room_id: str, state: str) -> Image.Image:
    img, d, theme = _room_shell(state)
    fn = FURNITURE.get(room_id)
    if fn:
        fn(d, theme)
    if state == "sealed":
        _chains(d, AMBER)
        _seal_plate(d, AMBER)
    elif state == "locked":
        _chains(d, RED)
        _seal_plate(d, RED)
    return img


# --------------------------------------------------------------------------
# Agent sprites (32x32, south-facing standing pose)
# --------------------------------------------------------------------------

AGENT_THEMES = {
    #            robe,               trim,     skin/face
    "raziel":    ((0x1C, 0x20, 0x2E, 255), CYAN,    (0x9A, 0xA6, 0xBF, 255)),
    "oracle":    ((0x24, 0x1E, 0x38, 255), SEAL,    (0xB9, 0xA8, 0xD6, 255)),
    "scribe":    ((0x2A, 0x26, 0x1C, 255), AMBER,   (0xC9, 0xB6, 0x8A, 255)),
    "clawforge": ((0x2E, 0x1A, 0x24, 255), MAGENTA, (0xD1, 0x92, 0xA6, 255)),
    "corvid":    ((0x14, 0x16, 0x1C, 255), CYAN,    (0x6E, 0x78, 0x8C, 255)),
}


def agent_sprite(agent_id: str) -> Image.Image:
    robe, trim, face = AGENT_THEMES[agent_id]
    img = Image.new("RGBA", (AGENT_W, AGENT_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = AGENT_W // 2

    # Contact shadow
    d.ellipse([cx - 8, 27, cx + 7, 31], fill=(0, 0, 0, 90))

    # Robe body (tapered)
    d.polygon([(cx - 6, 12), (cx + 5, 12), (cx + 9, 28), (cx - 10, 28)], fill=robe)
    # Trim hem + center seam (neon kept thin)
    d.line([(cx - 9, 27), (cx + 8, 27)], fill=_mix(robe, trim, 0.65))
    d.line([(cx - 1, 14), (cx - 1, 26)], fill=_mix(robe, trim, 0.35))

    # Shoulders / arms
    d.rectangle([cx - 9, 13, cx - 6, 22], fill=_mix(robe, VOID, 0.25))
    d.rectangle([cx + 5, 13, cx + 8, 22], fill=_mix(robe, VOID, 0.25))

    # Hood
    d.polygon([(cx - 7, 12), (cx - 5, 4), (cx + 4, 4), (cx + 6, 12)],
              fill=_mix(robe, VOID, 0.12))
    # Face in shadow
    d.rectangle([cx - 4, 6, cx + 3, 12], fill=_mix(face, VOID, 0.45))
    # Eyes — the only full-strength neon on the sprite
    d.point((cx - 3, 9), fill=trim)
    d.point((cx + 2, 9), fill=trim)

    if agent_id == "corvid":
        # Beak + wing hint
        d.polygon([(cx + 3, 9), (cx + 8, 10), (cx + 3, 11)], fill=_mix(face, AMBER, 0.5))
        d.polygon([(cx + 5, 14), (cx + 11, 20), (cx + 5, 22)], fill=_mix(robe, VOID, 0.3))
    if agent_id == "clawforge":
        # Apron
        d.rectangle([cx - 5, 16, cx + 4, 26], fill=_mix(robe, STONE, 0.35))
    if agent_id == "scribe":
        # Scroll under arm
        d.rectangle([cx + 6, 17, cx + 10, 24], fill=_mix(face, AMBER, 0.35))
    if agent_id == "oracle":
        # Floating orb
        d.ellipse([cx + 6, 12, cx + 11, 17], fill=_mix(robe, trim, 0.55))
    if agent_id == "raziel":
        # Circlet
        d.line([(cx - 5, 5), (cx + 4, 5)], fill=_mix(robe, AMBER, 0.7))

    return img


# --------------------------------------------------------------------------
# Portraits (128x128 Suikoden-style bust)
# --------------------------------------------------------------------------


def portrait(agent_id: str) -> Image.Image:
    robe, trim, face = AGENT_THEMES[agent_id]
    img = Image.new("RGBA", (PORTRAIT, PORTRAIT), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Backdrop: vertical gradient from void to a hint of the officer's colour
    for y in range(PORTRAIT):
        t = y / (PORTRAIT - 1)
        d.line([(0, y), (PORTRAIT - 1, y)], fill=_mix(VOID, _mix(VOID, trim, 0.22), t))

    # Frame
    d.rectangle([0, 0, PORTRAIT - 1, PORTRAIT - 1], outline=STONE, width=3)
    d.rectangle([3, 3, PORTRAIT - 4, PORTRAIT - 4], outline=_mix(VOID, trim, 0.45))

    cx = PORTRAIT // 2

    # Shoulders
    d.polygon([(cx - 46, PORTRAIT - 4), (cx - 30, 78), (cx + 29, 78),
               (cx + 45, PORTRAIT - 4)], fill=robe)
    d.line([(cx - 30, 80), (cx + 29, 80)], fill=_mix(robe, trim, 0.4))

    # Neck + head
    d.rectangle([cx - 8, 66, cx + 7, 82], fill=_mix(face, VOID, 0.35))
    d.ellipse([cx - 21, 30, cx + 20, 78], fill=face)

    # Hood / cowl over the head
    d.polygon([(cx - 30, 84), (cx - 27, 40), (cx - 12, 22), (cx + 11, 22),
               (cx + 26, 40), (cx + 29, 84)], fill=_mix(robe, VOID, 0.10))
    # Inner cowl opening
    d.ellipse([cx - 20, 32, cx + 19, 80], fill=_mix(face, VOID, 0.18))
    d.ellipse([cx - 17, 36, cx + 16, 76], fill=face)

    # Brow shadow
    d.rectangle([cx - 17, 36, cx + 16, 50], fill=_mix(face, VOID, 0.5))

    # Eyes
    for ex in (cx - 9, cx + 6):
        d.rectangle([ex - 3, 54, ex + 2, 58], fill=_mix(VOID, face, 0.15))
        d.rectangle([ex - 2, 55, ex + 1, 57], fill=trim)
    # Nose + mouth
    d.line([(cx, 60), (cx - 1, 65)], fill=_mix(face, VOID, 0.35))
    d.line([(cx - 5, 70), (cx + 4, 70)], fill=_mix(face, VOID, 0.42))

    # Per-officer marks
    if agent_id == "raziel":
        d.line([(cx - 18, 34), (cx + 17, 34)], fill=_mix(robe, AMBER, 0.75), width=3)
        d.polygon([(cx - 4, 26), (cx, 18), (cx + 3, 26)], fill=_mix(robe, AMBER, 0.8))
    elif agent_id == "oracle":
        d.ellipse([cx + 24, 52, cx + 40, 68], fill=_mix(VOID, trim, 0.55))
        d.ellipse([cx + 28, 56, cx + 34, 62], fill=_mix(trim, (255, 255, 255, 255), 0.4))
    elif agent_id == "scribe":
        d.rectangle([cx + 22, 84, cx + 34, PORTRAIT - 10], fill=_mix(robe, AMBER, 0.42))
        d.line([(cx + 24, 90), (cx + 32, 90)], fill=_mix(robe, AMBER, 0.7))
        d.line([(cx + 24, 96), (cx + 32, 96)], fill=_mix(robe, AMBER, 0.7))
    elif agent_id == "clawforge":
        d.rectangle([cx - 20, 96, cx + 19, PORTRAIT - 4], fill=_mix(robe, STONE, 0.4))
        d.line([(cx - 14, 104), (cx + 13, 104)], fill=_mix(robe, MAGENTA, 0.6))
    elif agent_id == "corvid":
        d.polygon([(cx + 12, 60), (cx + 34, 64), (cx + 12, 68)],
                  fill=_mix(face, AMBER, 0.45))
        d.polygon([(cx - 30, 84), (cx - 44, 104), (cx - 26, 110)],
                  fill=_mix(robe, VOID, 0.25))

    return img


# --------------------------------------------------------------------------
# HUD chrome
# --------------------------------------------------------------------------


def rank_frame() -> Image.Image:
    """Small stone plate used behind the HQ rank pill."""
    w, h = 96, 28
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], fill=UNFORGED, outline=STONE)
    d.line([(1, 1), (w - 2, 1)], fill=LIVE)
    d.line([(2, h - 2), (w - 3, h - 2)], fill=VOID)
    for bx in (5, w - 6):
        d.ellipse([bx - 2, h // 2 - 2, bx + 1, h // 2 + 1], fill=_mix(UNFORGED, AMBER, 0.5))
    return img


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

ROOM_IDS = list(FURNITURE.keys())
AGENT_IDS = list(AGENT_THEMES.keys())


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate Ravenstack Keep world art")
    ap.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent.parent / "public" / "art"),
        help="output art root (default ui/public/art)",
    )
    args = ap.parse_args()
    out = Path(args.out)

    written = 0

    def save(img: Image.Image, *parts: str) -> None:
        nonlocal written
        p = out.joinpath(*parts)
        p.parent.mkdir(parents=True, exist_ok=True)
        img.save(p, "PNG", optimize=True)
        written += 1
        print(f"  {p.relative_to(out)}  {img.width}x{img.height}")

    print("floor/")
    save(stone_floor(), "floor", "stone_floor.png")
    save(corridor(vertical=False), "floor", "corridor_h.png")
    save(corridor(vertical=True), "floor", "corridor_v.png")
    save(corridor(cross=True), "floor", "corridor_x.png")

    print("rooms/")
    for rid in ROOM_IDS:
        save(room_image(rid, "live"), "rooms", f"room_{rid}.png")
        save(room_image(rid, "sealed"), "rooms", f"room_{rid}_sealed.png")
        save(room_image(rid, "locked"), "rooms", f"room_{rid}_locked.png")

    print("agents/")
    for aid in AGENT_IDS:
        save(agent_sprite(aid), "agents", f"agent_{aid}.png")

    print("portraits/")
    for aid in AGENT_IDS:
        save(portrait(aid), "portraits", f"portrait_{aid}.png")

    print("hud/")
    save(rank_frame(), "hud", "rank_frame.png")

    print(f"\n{written} files -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
