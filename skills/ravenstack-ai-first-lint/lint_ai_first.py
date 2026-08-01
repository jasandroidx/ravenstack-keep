#!/usr/bin/env python3
"""AI-First note linter for Ravenstack (full OSB validate-ai-first.sh port).

Checks (aligned with hooks/validate-ai-first.sh):
  1. Frontmatter delimiters
  2. No tabs in frontmatter
  3. Required AI-first fields: date, type, tags, ai-first: true
  4. ## For future agents preamble
  5. Banned non-ASCII substitution characters
  6. High-precision secret patterns (never in vault notes)
plus Fortress claim/harvest rules (confidence, provenance, recency).

Exit 0 if clean, 1 if any FAIL. Does not modify files (warn-only contract
upstream; we use exit 1 for CI --strict gate).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PREAMBLE = re.compile(r"^##\s+For future agents\s*$", re.M)
AS_OF = re.compile(r"\(as of\s+[^)]+\)", re.I)

# Upstream banned substitution characters (validate-ai-first.sh check 5)
BANNED = {
    "\u2014": ("em-dash", " - "),
    "\u2013": ("en-dash", " - "),
    "\u201c": ("left double quote", '"'),
    "\u201d": ("right double quote", '"'),
    "\u2018": ("left single quote", "'"),
    "\u2019": ("right single quote", "'"),
    "\u2265": (">=", ">="),
    "\u2264": ("<=", "<="),
    "\u2260": ("!=", "!="),
    "\u2026": ("ellipsis", "..."),
    "\u00a0": ("nbsp", " "),
}

# High-precision only (false positives train people to ignore the hook)
SECRET_PATTERNS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key block"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AWS access key id"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"), "sk- API key"),
    (re.compile(r"\bghp_[A-Za-z0-9]{36}\b"), "GitHub personal token"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}\b"), "GitHub fine-grained token"),
    (re.compile(r"\bxox[bpars]-[A-Za-z0-9-]{10,}\b"), "Slack token"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"), "Google API key"),
    (
        re.compile(r"(?i)\b(?:password|passwd)\s*[:=]\s*['\"][^'\"\s]{8,}['\"]"),
        "quoted password assignment",
    ),
]

SKIP_PARTS = {
    "raw",
    "templates",
    "_export",
    ".obsidian",
    ".git",
    ".trash",
    "boards",
    "Boards",
    "Logs",
}
SKIP_NAMES = {
    "hot.md",  # executive surface
    "HOME.md",
    "index.md",
    "log.md",
    "catchup.md",
    "_CLAUDE.md",
    "CATALOG.md",
}


def skip_path(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_PARTS:
        return True
    if path.name in SKIP_NAMES:
        return True
    if path.name.startswith("_") and path.suffix == ".md":
        return True
    return False


def parse_fm(text: str) -> tuple[dict[str, str], str, list[str]]:
    issues: list[str] = []
    if not text.startswith("---"):
        return {}, text, ["no frontmatter (expected --- on first line)"]
    # find closing ---
    rest = text[3:]
    if rest.startswith("\n"):
        rest = rest[1:]
    end = rest.find("\n---")
    if end < 0:
        return {}, text, ["frontmatter missing closing ---"]
    fm_block = rest[:end]
    body = rest[end + 4 :]  # after \n---
    if "\t" in fm_block:
        issues.append("frontmatter contains tab characters (YAML needs spaces)")
    fm: dict[str, str] = {}
    for line in fm_block.splitlines():
        if ":" in line and not line.strip().startswith("#"):
            k, v = line.split(":", 1)
            fm[k.strip().lower()] = v.strip()
    return fm, body, issues


def lint_file(path: Path) -> list[str]:
    if path.suffix != ".md" or skip_path(path):
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    fm, body, issues = parse_fm(text)
    if issues and not fm:
        return issues

    for key in ("date", "type", "tags"):
        if key not in fm:
            issues.append(f"missing '{key}:' in frontmatter")
    ai = fm.get("ai-first", "").lower().strip()
    if ai not in ("true", "yes", "1"):
        issues.append("missing 'ai-first: true' in frontmatter")

    if not PREAMBLE.search(text):
        issues.append("missing '## For future agents' preamble")

    # banned unicode (check 5) — skip inside [[wikilinks]] interiors
    for i, line in enumerate(text.splitlines(), 1):
        # strip wikilinks for ban scan
        scan_line = re.sub(r"\[\[[^\]]*\]\]", "", line)
        for ch, (name, repl) in BANNED.items():
            if ch in scan_line:
                issues.append(f"L{i}: banned {name}; use {repl!r}")
                break

    # secrets (check 6)
    for i, line in enumerate(text.splitlines(), 1):
        for pat, label in SECRET_PATTERNS:
            if pat.search(line):
                issues.append(
                    f"L{i}: looks like a {label} - secrets never belong in vault notes; "
                    "keep them in env/password manager and reference by NAME only"
                )
                break

    ntype = fm.get("type", "").strip().strip("\"'")

    # Claim / harvest-candidate extras (Fortress + ledger schema)
    if ntype in ("claim", "harvest-candidate", "pattern", "pattern-draft"):
        if "confidence" not in fm and "confidence:" not in text[:800]:
            issues.append(f"type:{ntype} missing confidence (stated|high|medium|speculation)")
        if ntype == "claim":
            if "provenance" not in text[:1500] and "source_path" not in text[:1500]:
                issues.append("type:claim missing provenance/source_path")
            # recency: freshness field OR (as of in body
            has_fresh = "freshness" in fm or "freshness:" in text[:800]
            has_asof = bool(AS_OF.search(text))
            if not (has_fresh or has_asof):
                issues.append("type:claim missing recency: freshness: field or (as of ...) marker")

    # Research notes: prefer as of somewhere
    if ntype in ("research", "research-deep") and not AS_OF.search(text):
        issues.append(f"type:{ntype} has no (as of ...) recency markers on claims")

    return issues


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--strict", action="store_true", help="exit 1 on any issue (default)")
    args = ap.parse_args()
    files: list[Path] = []
    for p in args.paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.rglob("*.md")))
        elif path.is_file():
            files.append(path)
    bad = 0
    checked = 0
    for f in files:
        if skip_path(f) or f.suffix != ".md":
            continue
        checked += 1
        issues = lint_file(f)
        if issues:
            bad += 1
            print(f"FAIL {f}")
            for i in issues:
                print(f"  - {i}")
        else:
            print(f"OK   {f}")
    print(f"summary: {bad} file(s) with issues / {checked} checked")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
