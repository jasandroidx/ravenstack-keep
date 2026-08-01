#!/usr/bin/env python3
"""Sweep banned non-ASCII substitution characters (OSB scripts/sweep_non_ascii.py).

Dry-run by default; --apply writes; --check exits 1 if prose violations (CI).
Preserves [[wikilink]] interiors, fenced code, inline backticks.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SUBSTITUTIONS = [
    ("\u2014", " - "),
    ("\u2013", " - "),
    ("\u201c", '"'),
    ("\u201d", '"'),
    ("\u2018", "'"),
    ("\u2019", "'"),
    ("\u2265", ">="),
    ("\u2264", "<="),
    ("\u2260", "!="),
    ("\u2026", "..."),
    ("\u00a0", " "),
]

CODE_SPAN_RE = re.compile(r"(`+)(.+?)\1", re.DOTALL)
FENCE_RE = re.compile(r"^[ \t]*(`{3,}|~{3,})")
WIKILINK_RE = re.compile(r"\[\[[^\]]*\]\]")

SKIP_NAMES = {"sweep_non_ascii.py", "lint_ai_first.py", "validate-ai-first.sh"}


def substitute(text: str) -> str:
    for ch, rep in SUBSTITUTIONS:
        text = text.replace(ch, rep)
    return text


def substitute_outside_wikilinks(text: str) -> str:
    result = []
    last = 0
    for m in WIKILINK_RE.finditer(text):
        result.append(substitute(text[last : m.start()]))
        result.append(m.group(0))
        last = m.end()
    result.append(substitute(text[last:]))
    return "".join(result)


def process_line(line: str, is_md: bool) -> str:
    if not is_md:
        return substitute(line)
    result = []
    last = 0
    for m in CODE_SPAN_RE.finditer(line):
        result.append(substitute_outside_wikilinks(line[last : m.start()]))
        result.append(m.group(0))
        last = m.end()
    result.append(substitute_outside_wikilinks(line[last:]))
    return "".join(result)


def process_text(text: str, is_md: bool) -> str:
    out = []
    in_fence = False
    for line in text.splitlines(keepends=True):
        core = line.rstrip("\n\r")
        nl = line[len(core) :]
        if is_md and FENCE_RE.match(core):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence:
            out.append(line)
            continue
        out.append(process_line(core, is_md) + nl)
    return "".join(out)


def has_banned_prose(text: str, is_md: bool) -> list[tuple[int, str]]:
    hits = []
    in_fence = False
    for i, line in enumerate(text.splitlines(), 1):
        if is_md and FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        # remove wikilinks and code spans
        scan = WIKILINK_RE.sub("", line)
        scan = CODE_SPAN_RE.sub("", scan)
        for ch, rep in SUBSTITUTIONS:
            if ch in scan:
                hits.append((i, f"U+{ord(ch):04X} -> {rep!r}"))
                break
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*", default=["."])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true", help="CI: exit 1 if violations")
    args = ap.parse_args()
    files: list[Path] = []
    for p in args.paths:
        path = Path(p)
        if path.is_dir():
            files.extend(path.rglob("*.md"))
        elif path.is_file():
            files.append(path)

    changed = 0
    bad = 0
    for f in sorted(files):
        if f.name in SKIP_NAMES:
            continue
        if any(x in f.parts for x in (".git", "node_modules", ".venv")):
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            print(f"WARN cannot read {f}: {e}", file=sys.stderr)
            bad += 1
            continue
        is_md = f.suffix == ".md"
        hits = has_banned_prose(text, is_md)
        if not hits:
            continue
        bad += 1
        new = process_text(text, is_md)
        print(f"{f}: {len(hits)} hit(s) e.g. L{hits[0][0]} {hits[0][1]}")
        if args.apply and new != text:
            f.write_text(new, encoding="utf-8")
            changed += 1
            print(f"  applied")
    print(f"summary: files_with_hits={bad} applied={changed}")
    if args.check and bad:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
