#!/usr/bin/env python3
"""Contradiction / reconcile surface for claims (obsidian-reconcile pattern, dry-run).

Scans Ravenstack/claims + latest dry-run claims for numeric conflicts on same county/topic.
Writes a conflict report; does not auto-resolve (second-brain: destructive fixes need confirm).
"""
from __future__ import annotations

import argparse
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


MONEY = re.compile(r"\$[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?%")


def load_claims(paths: list[Path]) -> list[dict]:
    out = []
    for p in paths:
        text = p.read_text(encoding="utf-8", errors="replace")
        title = p.stem
        m = re.search(r"^# (.+)$", text, re.M)
        if m:
            title = m.group(1).strip()
        county = ""
        cm = re.search(r"^county:\s*(.+)$", text, re.M)
        if cm:
            county = cm.group(1).strip()
        nums = MONEY.findall(text)
        out.append({"path": str(p), "title": title, "county": county, "nums": nums, "text": text[:2000]})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--extra-dir", default="", help="optional dry-run claims dir")
    args = ap.parse_args()
    vault = Path(args.vault)
    paths = list((vault / "Ravenstack" / "claims").glob("*.md")) if (vault / "Ravenstack" / "claims").is_dir() else []
    if args.extra_dir:
        paths += list(Path(args.extra_dir).glob("*.md"))
    claims = load_claims(paths)
    # group by county + rough keyword
    groups: dict[str, list] = defaultdict(list)
    for c in claims:
        key = (c["county"] or "unknown").lower()
        groups[key].append(c)
    conflicts = []
    for county, items in groups.items():
        # if same county has both 13m-ish and 19m-ish style big budgets in different notes
        big = []
        for c in items:
            for n in c["nums"]:
                raw = n.replace("$", "").replace(",", "")
                try:
                    if raw.endswith("%"):
                        continue
                    val = float(raw)
                except ValueError:
                    continue
                if val >= 1_000_000:
                    big.append((val, c))
        # distinct magnitudes
        buckets = {}
        for val, c in big:
            b = int(val // 1_000_000)
            buckets.setdefault(b, []).append((val, c["path"], c["title"]))
        if len(buckets) >= 2:
            conflicts.append({"county": county, "buckets": {str(k): v[:5] for k, v in buckets.items()}})
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = vault / "Ravenstack" / "ops" / "harvest" / f"reconcile-{day}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "---",
        f"date: {day}",
        "type: conflict-report",
        "tags: [harvest, reconcile, conflict]",
        "ai-first: true",
        "status: open",
        "---",
        "",
        "## For future agents",
        "Reconcile surface for harvest claims (second-brain /obsidian-reconcile pattern). Auto-detect only; human resolves. Do not delete competing claims — mark superseded or disputed.",
        "",
        f"# Reconcile report — {day}",
        "",
        f"- claims_scanned: {len(claims)}",
        f"- county_groups: {len(groups)}",
        f"- conflict_groups: {len(conflicts)}",
        "",
        "## Conflicts",
    ]
    if not conflicts:
        lines.append("- none detected by numeric multi-million bucket heuristic")
    for c in conflicts:
        lines.append(f"### {c['county']}")
        lines.append(f"```json\n{c['buckets']}\n```")
        lines.append("- action: human mark one claim disputed/superseded or add dual-track research")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
