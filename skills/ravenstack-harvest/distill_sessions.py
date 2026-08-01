#!/usr/bin/env python3
"""Distill recent ReClaw pipeline session folders into harvest candidates."""
from __future__ import annotations

import argparse
import hashlib
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--sessions-root", default="/root/ReClaw-2.0/data/sessions")
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()
    root = Path(args.sessions_root)
    out = Path(args.vault) / "Ravenstack" / "harvest" / "dry-run" / args.run_id / "sessions"
    out.mkdir(parents=True, exist_ok=True)
    if not root.is_dir():
        print({"written": 0, "note": f"no sessions root {root}"})
        return 0
    dirs = sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True)[: args.limit]
    written = 0
    for d in dirs:
        # collect small text files
        parts = []
        for f in sorted(d.rglob("*")):
            if f.is_file() and f.suffix in {".md", ".json", ".txt", ".log"} and f.stat().st_size < 200_000:
                try:
                    parts.append(f"## {f.relative_to(d)}\n" + f.read_text(encoding="utf-8", errors="replace")[:1500])
                except Exception:
                    continue
        blob = "\n\n".join(parts)[:8000] or "TBD — empty session folder"
        h = hashlib.sha256(blob.encode()).hexdigest()[:12]
        note = f"""---
date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}
type: harvest-candidate
tags: [harvest, session, candidate]
ai-first: true
source_kind: session
session_id: {d.name}
content_hash: {h}
status: draft
---

## For future agents
Distilled pipeline session `{d.name}` for harvest. Ephemeral ops context — promote only durable lessons.

# Session {d.name}

## Excerpt
{blob[:4000]}
"""
        (out / f"session-{d.name}-{h}.md").write_text(note, encoding="utf-8")
        written += 1
    print({"written": written, "out": str(out)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
