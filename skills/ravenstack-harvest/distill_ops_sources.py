#!/usr/bin/env python3
"""Distill decisions, morning briefs, and inbox into AI-First harvest candidates (dry-run).

Pattern aligned with obsidian-second-brain nightly consolidation + catchup:
- never raw dumps
- AI-first notes
- dry-run quarantine only
"""
from __future__ import annotations

import argparse
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path


def utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def already(out_root: Path, h: str) -> bool:
    if not out_root.is_dir():
        return False
    for p in out_root.rglob(f"*{h}*.md"):
        return True
    return False


def distill_file(src: Path, kind: str, out_dir: Path) -> Path | None:
    text = src.read_text(encoding="utf-8", errors="replace")
    h = file_hash(src)
    if already(out_dir.parent, h):
        return None
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("---")]
    # skip pure frontmatter-only
    bullets = []
    for ln in lines:
        if ln.startswith("#"):
            continue
        if ln.startswith("|") or ln.startswith("```"):
            continue
        bullets.append(ln[:240])
        if len(bullets) >= 12:
            break
    if not bullets:
        bullets = ["TBD — source had no distillable body lines"]
    body = "\n".join(f"- {b}" for b in bullets)
    note = f"""---
date: {utc_date()}
type: harvest-candidate
tags: [harvest, candidate, {kind}]
ai-first: true
source_kind: {kind}
source_path: "{src.as_posix().split('/obsidian_vault/')[-1] if '/obsidian_vault/' in src.as_posix() else src.name}"
content_hash: {h}
status: draft
provenance:
  model: harvest-distill-v1-deterministic
  harvested_at: {utc_now()}
---

## For future agents
Distilled {kind} candidate from `{src.name}` (hash {h}). Dry-run only. Promote selected bullets to claims via human or claim extract — do not treat as verified claims.

# {kind}: {src.stem[:80]}

## Distilled points
{body}

## Open questions
- Which bullets are durable claims vs ephemeral ops chatter?
"""
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{kind}-{h}-{src.stem[:40]}.md"
    out.write_text(note, encoding="utf-8")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--run-id", required=True)
    args = ap.parse_args()
    vault = Path(args.vault)
    out = vault / "Ravenstack" / "harvest" / "dry-run" / args.run_id / "ops-sources"
    written = []
    # decisions
    dec = vault / "Ravenstack" / "ops" / "decisions"
    if dec.is_dir():
        for p in sorted(dec.glob("*.md"))[-15:]:
            w = distill_file(p, "decision", out)
            if w:
                written.append(str(w))
    # morning briefs / digests
    ops = vault / "Ravenstack" / "ops"
    for pat in ("morning-brief-*.md", "morning-digest-*.md"):
        for p in sorted(ops.glob(pat))[-10:]:
            w = distill_file(p, "morning-brief", out)
            if w:
                written.append(str(w))
    # inbox
    inbox = vault / "Ravenstack" / "inbox"
    if inbox.is_dir():
        for p in sorted(inbox.glob("*.md")):
            if p.name == "README.md":
                continue
            w = distill_file(p, "inbox", out)
            if w:
                written.append(str(w))
    print({"written": len(written), "out": str(out)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
