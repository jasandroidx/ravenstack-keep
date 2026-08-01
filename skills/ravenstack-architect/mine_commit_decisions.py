#!/usr/bin/env python3
"""Mine recent commits for decision-shaped messages (OSB mine_commit_decisions pattern).

Surfaces ADR candidates only - never writes vault notes unless --write (future).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

DECISIONISH = re.compile(
    r"\b(decide[sd]?|decision|adopt|switch(?:ed)? to|migrate(?:d)?|replace(?:d)?|"
    r"chose|choose|prefer|drop(?:ped)?|remove(?:d)? support|breaking)\b",
    re.I,
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    repo = Path(args.repo)
    r = subprocess.run(
        [
            "git",
            "-C",
            str(repo),
            "log",
            f"-n{args.limit}",
            "--pretty=format:%H%x09%h%x09%ad%x09%s",
            "--date=short",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if r.returncode != 0:
        print(r.stderr, file=__import__("sys").stderr)
        return 1
    cands = []
    for line in r.stdout.splitlines():
        parts = line.split("\t", 3)
        if len(parts) < 4:
            continue
        full, short, day, subj = parts
        if DECISIONISH.search(subj):
            cands.append(
                {
                    "sha": short,
                    "date": day,
                    "subject": subj,
                    "confidence": "speculation",
                    "note": "candidate only - verify before ADR",
                }
            )
    if args.json:
        print(json.dumps({"repo": str(repo), "candidates": cands}, indent=2))
    else:
        for c in cands:
            print(f"{c['date']} {c['sha']} {c['subject']}")
        print(f"# {len(cands)} candidates / last {args.limit} commits", file=__import__("sys").stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
