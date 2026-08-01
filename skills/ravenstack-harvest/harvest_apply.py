#!/usr/bin/env python3
"""Apply dry-run harvest claims to Ravenstack/claims/ (Class B, after human OK).

Skips sensitive: true by default. Never flips package approval_status.
"""
from __future__ import annotations

import argparse
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


def is_sensitive(text: str) -> bool:
    m = re.search(r"^sensitive:\s*true\s*$", text, re.M | re.I)
    return bool(m)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", required=True, help="dry-run folder")
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--include-sensitive", action="store_true")
    ap.add_argument("--confirm", action="store_true", help="required to write")
    args = ap.parse_args()
    if not args.confirm:
        print("Refusing: pass --confirm after human approval")
        return 2
    run = Path(args.run_dir)
    claims_src = run / "claims"
    if not claims_src.is_dir():
        print("no claims dir", claims_src)
        return 1
    dest = Path(args.vault) / "Ravenstack" / "claims"
    dest.mkdir(parents=True, exist_ok=True)
    applied = []
    skipped = []
    for f in sorted(claims_src.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        if is_sensitive(text) and not args.include_sensitive:
            skipped.append(f.name)
            continue
        # mark status active on apply
        text2 = text.replace("status: draft", "status: active", 1)
        if "applied_at:" not in text2:
            text2 = text2.replace(
                "run_id:",
                f"applied_at: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n  run_id:",
                1,
            )
        out = dest / f.name
        out.write_text(text2, encoding="utf-8")
        applied.append(f.name)
    # copy report pointer
    rep = run / "HARVEST-REPORT.md"
    if rep.is_file():
        (dest / f"APPLY-LOG-{run.name}.md").write_text(
            f"""---
date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}
type: harvest-apply-log
tags: [harvest, apply]
ai-first: true
---

## For future agents
Apply log for dry-run `{run.name}`. Sensitive claims skipped unless include-sensitive.

# Apply log

- applied: {len(applied)}
- skipped_sensitive: {len(skipped)}
- files: {applied}
- skipped: {skipped}
""",
            encoding="utf-8",
        )
    print({"applied": applied, "skipped_sensitive": skipped})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
