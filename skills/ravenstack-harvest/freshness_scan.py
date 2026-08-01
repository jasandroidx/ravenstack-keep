#!/usr/bin/env python3
"""Freshness scan — OKM / OSB freshness-policy + freshness_lint subset.

Rules enforced (report-only, never delete):
  FRESH-1: volatile quantitative present-tense claim without (as of) stamp
  FRESH-2: (as of) stamp older than window-days (default 7) on volatile claim
  FRESH-4 exempt: dated filenames / dated H2 / freshness: snapshot frontmatter

Maintenance answers for each finding: re-observe | convert-to-pointer | retire-to-dated
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

_LIB = Path(__file__).resolve().parent.parent / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))
from osb_patterns import scrub_ascii  # noqa: E402

DEFAULT_WINDOW_DAYS = 7

VOLATILE = {
    "deal",
    "deals",
    "ticket",
    "tickets",
    "issue",
    "issues",
    "budget",
    "budgets",
    "balance",
    "revenue",
    "salary",
    "salaries",
    "claim",
    "claims",
    "queue",
    "backlog",
    "pipeline",
    "total",
    "totals",
    "amount",
    "amounts",
    "count",
    "counts",
    "users",
    "subscribers",
    "vacancy",
    "vacancies",
}

CURRENT_MARKERS = re.compile(
    r"\b(currently|now|today|right now|at the moment|so far|to date|"
    r"has|have|is|are|stands at|open|active|pending|outstanding|"
    r"remaining|this (week|month|quarter))\b",
    re.I,
)
PAST_MARKERS = re.compile(
    r"\b(was|were|had|reached|hit|closed|shipped|merged|finished|completed|"
    r"grew|dropped|ended|launched|became)\b",
    re.I,
)
MODAL = re.compile(r"\b(can|could|may|might|would|should|must|will)\b", re.I)
AS_OF = re.compile(r"\bas of\s+(\d{4})-(\d{2})(?:-(\d{2}))?", re.I)
NUMBER = re.compile(r"(?<![\w./-])(?:\$\d[\d,.]*%?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+%|\d+\.\d+)(?![\w-])")
HEADING = re.compile(r"^(#{1,6})\s")
DATED_HEADING = re.compile(r"^(#{1,6})\s+(\d{4}-\d{2}(?:-\d{2})?)\b")
ISO_IN_NAME = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def parse_fm(lines: list[str]) -> tuple[dict[str, str], int]:
    if not lines or lines[0].strip() != "---":
        return {}, 0
    fm: dict[str, str] = {}
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return fm, i + 1
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip().lower()] = v.strip()
    return {}, 0


def parse_as_of(line: str) -> date | None:
    m = AS_OF.search(line)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3) or 1)
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def has_volatile_noun(line: str) -> bool:
    low = line.lower()
    # word-boundary-ish
    for n in VOLATILE:
        if re.search(rf"\b{re.escape(n)}\b", low):
            return True
    return False


def is_dated_container(path: Path, fm: dict, body_lines: list[str], line_idx: int) -> bool:
    if fm.get("freshness", "").lower() in ("snapshot", "wiring"):
        # wiring is timeless; treat snapshot as dated container
        if fm.get("freshness", "").lower() == "snapshot":
            return True
    if ISO_IN_NAME.search(path.name):
        return True
    # look upward for dated heading
    for j in range(line_idx, -1, -1):
        if j >= len(body_lines):
            continue
        if DATED_HEADING.match(body_lines[j]):
            return True
        if HEADING.match(body_lines[j]) and j < line_idx:
            break
    return False


def scan_file(path: Path, window: int, today: date) -> list[dict]:
    findings: list[dict] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return findings
    lines = text.splitlines()
    fm, body_start = parse_fm(lines)
    body = lines[body_start:]
    in_fence = False
    for i, line in enumerate(body):
        abs_line = body_start + i + 1
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if not NUMBER.search(line):
            continue
        if not has_volatile_noun(line) and not re.search(r"\$\d", line):
            # money counts as volatile even without noun list hit
            if not re.search(r"\$\d", line):
                continue
        if PAST_MARKERS.search(line) and not CURRENT_MARKERS.search(line):
            continue
        if MODAL.search(line) and not CURRENT_MARKERS.search(line):
            continue
        if is_dated_container(path, fm, body, i):
            continue

        stamp = parse_as_of(line)
        if stamp is None and CURRENT_MARKERS.search(line):
            findings.append(
                {
                    "rule": "FRESH-1",
                    "path": str(path),
                    "line": abs_line,
                    "text": line.strip()[:160],
                    "action": "add (as of YYYY-MM-DD), convert to pointer, or move under dated heading",
                }
            )
        elif stamp is not None:
            age = (today - stamp).days
            if age > window and (CURRENT_MARKERS.search(line) or has_volatile_noun(line)):
                findings.append(
                    {
                        "rule": "FRESH-2",
                        "path": str(path),
                        "line": abs_line,
                        "text": line.strip()[:160],
                        "age_days": age,
                        "action": "re-observe | convert-to-pointer | retire-to-dated-note",
                    }
                )
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    args = ap.parse_args()
    vault = Path(args.vault)
    roots = [
        vault / "Ravenstack" / "claims",
        vault / "Ravenstack" / "harvest" / "dry-run",
        vault / "Ravenstack" / "research",
        vault / "Ravenstack" / "ops" / "decisions",
    ]
    today = datetime.now(timezone.utc).date()
    findings: list[dict] = []
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*.md"):
            for f in scan_file(p, args.window_days, today):
                try:
                    f["path"] = str(p.relative_to(vault))
                except ValueError:
                    pass
                findings.append(f)

    day = today.isoformat()
    out = vault / "Ravenstack" / "ops" / "harvest" / f"freshness-{day}.md"
    out.parent.mkdir(parents=True, exist_ok=True)

    def fmt(f: dict) -> str:
        age = f" age={f['age_days']}d" if "age_days" in f else ""
        return f"`{f['path']}:{f['line']}` [{f['rule']}]{age}: {f['text']} → {f['action']}"

    report = f"""---
date: {day}
type: freshness-report
tags: [harvest, freshness, okm]
ai-first: true
window_days: {args.window_days}
report-only: true
---

## For future agents
OKM freshness policy (obsidian-second-brain references/freshness-policy.md). \
Findings need re-observe, convert to pointer, or retire — never silent delete. \
Report-only; this script never rewrites claims.

# Freshness scan — {day}

window_days: {args.window_days}
findings: {len(findings)}

## FRESH-1 (no stamp on current volatile quantity)
{chr(10).join(f'- {fmt(f)}' for f in findings if f['rule']=='FRESH-1')[:8000] or '- none'}

## FRESH-2 (stamp older than window)
{chr(10).join(f'- {fmt(f)}' for f in findings if f['rule']=='FRESH-2')[:8000] or '- none'}

## Maintenance loop
1. Re-observe home system, update value + stamp
2. Convert to pointer (where truth lives URL/path)
3. Retire into dated container (immutable snapshot)
"""
    # fix the join bug - list first then join
    f1 = [fmt(f) for f in findings if f["rule"] == "FRESH-1"][:80]
    f2 = [fmt(f) for f in findings if f["rule"] == "FRESH-2"][:80]
    report = f"""---
date: {day}
type: freshness-report
tags: [harvest, freshness, okm]
ai-first: true
window_days: {args.window_days}
report-only: true
---

## For future agents
OKM freshness policy (obsidian-second-brain references/freshness-policy.md). \
Findings need re-observe, convert to pointer, or retire - never silent delete. \
Report-only; this script never rewrites claims.

# Freshness scan - {day}

window_days: {args.window_days}
findings: {len(findings)}

## FRESH-1 (no stamp on current volatile quantity)
{chr(10).join(f'- {x}' for x in f1) or '- none'}

## FRESH-2 (stamp older than window)
{chr(10).join(f'- {x}' for x in f2) or '- none'}

## Maintenance loop
1. Re-observe home system, update value + stamp
2. Convert to pointer (where truth lives URL/path)
3. Retire into dated container (immutable snapshot)
"""
    out.write_text(scrub_ascii(report), encoding="utf-8")
    print(out, "findings", len(findings), "FRESH-1", len(f1), "FRESH-2", len(f2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
