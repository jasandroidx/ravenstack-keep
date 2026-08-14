#!/usr/bin/env python3
"""Generate palette-locked Keep world art: floors, corridors, rooms, agents, HUD.

Existing 96px interiors in public/art/rooms/ are kept. This fills everything
the live KeepScene preload() expects, plus new HQ wings.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
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
    "skin": (196, 164, 132, 255),
    "skin2": (168, 132, 110, 255),
    "void": (0, 0, 0, 0),
    "cloak": (28, 24, 40, 255),
}


def new(w: int, h: int, fill=None) -> Image.Image:
    return Image.new("RGBA", (w, h), fill or PAL["void"])


def px(d: ImageDraw.ImageDraw, x: int, y: int, c, s: int = 1) -> None:
    d.rectangle([x, y, x + s - 1, y + s - 1], fill=c)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"  {path.relative_to(ROOT)} {img.size[0]}x{img.size[1]}")


def stone_floor(w: int = 64, h: int = 64) -> Image.Image:
    img = new(w, h, PAL["stoneDim"])
    d = ImageDraw.Draw(img)
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            off = 4 if (y // 8) % 2 else 0
            grout = PAL["bg"]
            d.rectangle([x + off, y, x + off + 7, y + 7], outline=grout)
            if (x + y) % 16 == 0:
                px(d, x + off + 2, y + 2, PAL["stone"])
    return img


def corridor(horizontal: bool) -> Image.Image:
    if horizontal:
        img = new(48, 16, PAL["stoneDim"])
        d = ImageDraw.Draw(img)
        d.rectangle([0, 6, 47, 9], fill=PAL["iron"])
        d.rectangle([0, 7, 47, 8], fill=PAL["neon"])
    else:
        img = new(16, 48, PAL["stoneDim"])
        d = ImageDraw.Draw(img)
        d.rectangle([6, 0, 9, 47], fill=PAL["iron"])
        d.rectangle([7, 0, 8, 47], fill=PAL["neon"])
    return img


def room_base(size: int = 128, live: bool = True) -> Image.Image:
    img = new(size, size, PAL["bg"])
    d = ImageDraw.Draw(img)
    floor = PAL["stoneLive"] if live else PAL["stoneDim"]
    d.rectangle([4, 4, size - 5, size - 5], fill=floor)
    for y in range(8, size - 8, 10):
        for x in range(8, size - 8, 10):
            if (x + y) % 20 == 0:
                px(d, x, y, PAL["stone"], 2)
    rim = PAL["neon"] if live else PAL["stone"]
    d.rectangle([2, 2, size - 3, size - 3], outline=rim)
    d.rectangle([3, 3, size - 4, size - 4], outline=PAL["iron"])
    return img


def furnish(img: Image.Image, kind: str, live: bool) -> Image.Image:
    d = ImageDraw.Draw(img)
    c = PAL["neon"] if live else PAL["iron"]
    a = PAL["amber"] if live else PAL["stone"]
    m = PAL["magenta"] if live else PAL["iron"]
    g = PAL["green"] if live else PAL["iron"]
    if kind == "great-hall":
        d.rectangle([50, 28, 78, 52], fill=PAL["stone"], outline=c)
        d.rectangle([56, 20, 72, 28], fill=PAL["iron"], outline=c)
        px(d, 62, 24, a, 4)
        for x in (20, 100):
            d.ellipse([x, 70, x + 12, 82], outline=c, fill=PAL["iron"])
            if live:
                px(d, x + 4, 74, c, 4)
    elif kind == "library":
        for y in (18, 40, 62, 84):
            d.rectangle([14, y, 50, y + 12], fill=PAL["iron"], outline=c)
            for x in range(18, 48, 6):
                px(d, x, y + 4, a if live else PAL["stone"], 3)
        d.rectangle([70, 50, 108, 78], fill=PAL["stoneDim"], outline=c)
    elif kind == "alchemy-lab":
        d.rectangle([40, 48, 88, 78], fill=PAL["iron"], outline=m)
        d.rectangle([52, 36, 76, 48], fill=PAL["stone"], outline=m)
        if live:
            d.rectangle([56, 58, 72, 70], fill=m)
            px(d, 62, 40, g, 4)
    elif kind == "armory":
        for x in (18, 40, 62):
            d.rectangle([x, 20, x + 14, 100], fill=PAL["iron"], outline=c)
            for y in range(26, 96, 10):
                d.line([(x + 2, y), (x + 12, y)], fill=c)
        d.rectangle([88, 50, 112, 86], fill=PAL["stoneDim"], outline=a)
    elif kind == "observatory":
        d.ellipse([36, 20, 92, 76], outline=c)
        d.ellipse([48, 32, 80, 64], outline=c)
        if live:
            px(d, 60, 44, c, 6)
        d.rectangle([20, 88, 108, 108], fill=PAL["iron"], outline=a)
    elif kind == "vault":
        d.rectangle([36, 28, 92, 96], fill=PAL["stoneDim"], outline=PAL["red"])
        d.ellipse([54, 50, 74, 70], outline=PAL["red"])
        px(d, 62, 58, PAL["red"], 4)
        d.rectangle([58, 68, 70, 80], fill=PAL["red"])
    elif kind == "round-table":
        d.ellipse([28, 28, 100, 100], outline=c, fill=PAL["stoneDim"])
        d.ellipse([44, 44, 84, 84], outline=a)
        for ang in range(0, 360, 45):
            # seats as small blocks around the ring
            pass
        for p in [(32, 56), (88, 56), (60, 32), (60, 88), (40, 40), (80, 40), (40, 80), (80, 80)]:
            d.rectangle([p[0], p[1], p[0] + 8, p[1] + 8], fill=PAL["iron"], outline=c)
        if live:
            px(d, 60, 60, a, 6)
    elif kind == "clock-tower":
        d.ellipse([36, 20, 92, 76], outline=a, fill=PAL["stoneDim"])
        d.line([(64, 48), (64, 28)], fill=c, width=2)
        d.line([(64, 48), (82, 48)], fill=a, width=2)
        px(d, 62, 46, a, 4)
        for y in (84, 96, 108):
            d.rectangle([20, y, 108, y + 6], fill=PAL["iron"], outline=c)
    elif kind == "kitchen":
        d.rectangle([20, 60, 70, 108], fill=PAL["iron"], outline=m)
        d.rectangle([28, 40, 62, 60], fill=PAL["stoneDim"], outline=m)
        if live:
            d.rectangle([34, 80, 56, 100], fill=m)
            px(d, 42, 48, PAL["amber"], 6)
        d.rectangle([82, 30, 112, 108], fill=PAL["stone"], outline=c)
        for y in (40, 60, 80):
            d.rectangle([86, y, 108, y + 10], fill=PAL["stoneDim"])
    elif kind == "roost":
        d.ellipse([24, 24, 72, 56], outline=c)
        d.polygon([(30, 50), (48, 20), (66, 50)], outline=c)
        if live:
            px(d, 44, 34, c, 6)
        d.rectangle([80, 40, 114, 100], fill=PAL["iron"], outline=c)
        d.rectangle([20, 80, 70, 112], fill=PAL["stoneDim"], outline=a)
    elif kind == "gatehouse":
        d.rectangle([20, 20, 108, 50], fill=PAL["stone"], outline=a)
        d.rectangle([44, 50, 84, 112], fill=PAL["stoneDim"], outline=a)
        d.rectangle([52, 70, 76, 112], fill=PAL["bg"], outline=PAL["amber"])
        d.ellipse([56, 86, 72, 102], outline=PAL["amber"])
        if live:
            px(d, 62, 90, PAL["amber"], 4)
    return img


def sealed(img: Image.Image) -> Image.Image:
    out = img.copy()
    d = ImageDraw.Draw(out)
    d.rectangle([2, 2, out.size[0] - 3, out.size[1] - 3], outline=PAL["stone"])
    # chains
    for i in range(8, out.size[0] - 8, 10):
        px(d, i, i, PAL["red"], 2)
        px(d, out.size[0] - 8 - i, i, PAL["red"], 2)
    return out


def agent_sprite(kind: str) -> Image.Image:
    img = new(48, 48, PAL["void"])
    d = ImageDraw.Draw(img)
    # shadow
    d.ellipse([14, 40, 34, 46], fill=(11, 14, 20, 180))
    body = {
        "raziel": PAL["cloak"],
        "oracle": PAL["stoneLive"],
        "scribe": (90, 100, 88, 255),
        "clawforge": (70, 40, 48, 255),
        "corvid": (32, 48, 80, 255),
        "generic": PAL["stone"],
    }[kind]
    accent = {
        "raziel": PAL["neon"],
        "oracle": PAL["amber"],
        "scribe": PAL["green"],
        "clawforge": PAL["magenta"],
        "corvid": PAL["neon"],
        "generic": PAL["stoneLive"],
    }[kind]
    d.rectangle([16, 20, 31, 38], fill=body)
    d.ellipse([16, 8, 31, 24], fill=PAL["skin"] if kind != "raziel" else PAL["cloak"])
    if kind == "raziel":
        d.rectangle([14, 8, 33, 16], fill=PAL["cloak"])
        px(d, 20, 14, PAL["neon"], 2)
        px(d, 26, 14, PAL["neon"], 2)
        d.rectangle([12, 22, 16, 36], fill=PAL["iron"])
        px(d, 12, 18, accent, 3)
    elif kind == "oracle":
        px(d, 20, 14, accent, 2)
        d.ellipse([20, 26, 28, 32], outline=accent)
    elif kind == "scribe":
        d.rectangle([30, 24, 36, 34], fill=PAL["amber"])
        px(d, 32, 18, PAL["cloak"], 2)
    elif kind == "clawforge":
        d.rectangle([28, 18, 36, 28], fill=PAL["iron"])
        px(d, 30, 14, accent, 3)
    elif kind == "corvid":
        d.ellipse([28, 8, 40, 18], fill=PAL["cloak"])
        px(d, 36, 10, PAL["amber"], 2)
    else:
        px(d, 21, 14, accent, 2)
    d.rectangle([18, 38, 22, 44], fill=PAL["iron"])
    d.rectangle([26, 38, 30, 44], fill=PAL["iron"])
    # outline
    d.rectangle([16, 20, 31, 38], outline=accent)
    return img


def icon(kind: str) -> Image.Image:
    img = new(16, 16, PAL["void"])
    d = ImageDraw.Draw(img)
    if kind == "work":
        d.ellipse([3, 3, 12, 12], fill=PAL["magenta"])
    elif kind == "idle":
        d.ellipse([3, 3, 12, 12], fill=PAL["neon"])
    elif kind == "wait":
        d.rectangle([3, 3, 12, 12], fill=PAL["amber"])
    return img


def badge(kind: str) -> Image.Image:
    img = new(12, 12, PAL["void"])
    d = ImageDraw.Draw(img)
    c = {"local": PAL["green"], "escalate": PAL["amber"], "god": PAL["magenta"]}[kind]
    d.rectangle([1, 1, 10, 10], outline=c, fill=PAL["iron"])
    px(d, 4, 4, c, 4)
    return img


def bubble() -> Image.Image:
    img = new(48, 24, PAL["void"])
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([1, 1, 46, 18], radius=4, fill=PAL["stoneDim"], outline=PAL["neon"])
    d.polygon([(20, 18), (24, 23), (28, 18)], fill=PAL["stoneDim"], outline=PAL["neon"])
    return img


def hud_bits() -> None:
    # aura
    img = new(48, 48, PAL["void"])
    d = ImageDraw.Draw(img)
    d.ellipse([4, 4, 43, 43], outline=PAL["neon"])
    d.ellipse([10, 10, 37, 37], outline=(45, 226, 230, 80))
    save(img, ART / "hud" / "agent_aura.png")

    img = new(16, 16, PAL["void"])
    d = ImageDraw.Draw(img)
    d.ellipse([2, 2, 13, 13], outline=PAL["neon"], fill=PAL["iron"])
    px(d, 6, 6, PAL["neon"], 4)
    save(img, ART / "hud" / "conduit_node.png")

    img = new(16, 16, PAL["void"])
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (15, 15), (1, 15)], outline=PAL["amber"], fill=PAL["stoneDim"])
    px(d, 7, 6, PAL["amber"], 2)
    px(d, 7, 11, PAL["amber"], 2)
    save(img, ART / "hud" / "gate_alert.png")

    img = new(16, 24, PAL["void"])
    d = ImageDraw.Draw(img)
    d.rectangle([4, 2, 11, 22], fill=PAL["stone"], outline=PAL["amber"])
    d.rectangle([6, 10, 9, 22], fill=PAL["bg"])
    save(img, ART / "hud" / "door_marker.png")

    img = new(32, 6, PAL["void"])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 1, 31, 4], fill=PAL["iron"], outline=PAL["stone"])
    d.rectangle([1, 2, 20, 3], fill=PAL["magenta"])
    save(img, ART / "objects" / "progress_bar.png")

    img = new(16, 16, PAL["void"])
    d = ImageDraw.Draw(img)
    d.ellipse([2, 2, 13, 13], outline=PAL["neon"])
    px(d, 7, 7, PAL["neon"], 2)
    save(img, ART / "objects" / "rune_glow.png")


def main() -> None:
    print("Generating Keep world art…")
    save(stone_floor(), ART / "floor" / "stone_floor.png")
    save(corridor(True), ART / "floor" / "corridor_h.png")
    save(corridor(False), ART / "floor" / "corridor_v.png")

    rooms = [
        "great-hall",
        "library",
        "alchemy-lab",
        "armory",
        "observatory",
        "vault",
        "round-table",
        "clock-tower",
        "kitchen",
        "roost",
        "gatehouse",
    ]
    for name in rooms:
        dest = ART / "rooms" / f"room_{name}.png"
        if dest.exists() and name in {
            "great-hall",
            "library",
            "alchemy-lab",
            "armory",
            "observatory",
            "vault",
        }:
            # keep hand-authored interiors; still write sealed variant
            live = Image.open(dest).convert("RGBA")
            if live.size != (128, 128):
                live = live.resize((128, 128), Image.Resampling.NEAREST)
                save(live, dest)
            save(sealed(live), ART / "rooms" / f"room_{name}_sealed.png")
            continue
        live = furnish(room_base(128, True), name, True)
        dead = furnish(room_base(128, False), name, False)
        save(live, dest)
        save(sealed(dead), ART / "rooms" / f"room_{name}_sealed.png")

    for kind in ("raziel", "oracle", "scribe", "clawforge", "corvid", "generic"):
        save(agent_sprite(kind), ART / "agents" / f"agent_{kind}.png")

    save(icon("work"), ART / "objects" / "icon_work.png")
    save(icon("idle"), ART / "objects" / "icon_idle.png")
    save(icon("wait"), ART / "objects" / "icon_wait.png")
    save(badge("local"), ART / "objects" / "badge_local.png")
    save(badge("escalate"), ART / "objects" / "badge_escalate.png")
    save(badge("god"), ART / "objects" / "badge_god.png")
    save(bubble(), ART / "objects" / "speech_bubble.png")
    hud_bits()
    print("Done.")


if __name__ == "__main__":
    main()
