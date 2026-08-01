#!/usr/bin/env python3
"""Graph Gardener — structural vault graph report (OSB link_graph.py + heal patterns).

Dry-run / report-only. Never rewrites notes, never deletes, never auto-heals.
Typed relation awareness (supersedes/depends_on/...) matching OSB EDGE_INVERSE.

Reports:
  - nodes (notes under Ravenstack/), edges ([[wikilinks]])
  - hubs (high degree), orphans (zero inbound among claims)
  - dangling wikilink targets (no matching note title/path)
  - asymmetric relation pairs missing reciprocal (when relations: frontmatter present)
  - missing ai-first on claim/harvest/protocol subset
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

_LIB = Path(__file__).resolve().parent.parent / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))
from osb_patterns import scrub_ascii  # noqa: E402

WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")
RELATIONS_BLOCK = re.compile(r"(?ms)^relations:\s*\n((?:[ \t]+.+\n?)*)")
REL_LINE = re.compile(r"^[ \t]+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$")
LEGACY_SUPERSEDES = re.compile(r"(?m)^supersedes:\s*(.+)$")

EDGE_INVERSE = {
    "supersedes": "superseded_by",
    "superseded_by": "supersedes",
    "depends_on": "required_by",
    "required_by": "depends_on",
    "caused": "caused_by",
    "caused_by": "caused",
    "decided_by": "decides",
    "decides": "decided_by",
    "relates_to": "relates_to",
    "contradicts": "contradicts",
}
ASYMMETRIC = frozenset(t for t, inv in EDGE_INVERSE.items() if inv != t)

SKIP_PARTS = {".git", ".obsidian", ".trash", "raw", "templates", "_export", "boards", "Boards"}


def strip_code(text: str) -> str:
    text = CODE_FENCE.sub("", text)
    text = INLINE_CODE.sub("", text)
    return text


def nfc_title(s: str) -> str:
    return s.strip().lower().replace("\u2014", "-").replace("\u2013", "-")


def index_notes(root: Path) -> dict[str, Path]:
    """Map normalized title/stem/relative-path variants -> path."""
    index: dict[str, Path] = {}
    for p in root.rglob("*.md"):
        if any(part in SKIP_PARTS for part in p.parts):
            continue
        try:
            rel = p.relative_to(root)
        except ValueError:
            continue
        keys = {
            nfc_title(p.stem),
            nfc_title(p.name),
            nfc_title(str(rel).removesuffix(".md")),
            nfc_title(str(rel).replace("\\", "/").removesuffix(".md")),
        }
        for k in keys:
            index.setdefault(k, p)
    return index


def parse_relations(text: str) -> list[tuple[str, str]]:
    """Return list of (edge_type, target_title) from relations: or legacy supersedes:."""
    edges: list[tuple[str, str]] = []
    m = RELATIONS_BLOCK.search(text)
    if m:
        block = m.group(1)
        current_type = None
        for line in block.splitlines():
            lm = REL_LINE.match(line)
            if lm:
                key, rest = lm.group(1), lm.group(2).strip()
                if key in EDGE_INVERSE or key.endswith("_by") or key in (
                    "relates_to",
                    "contradicts",
                ):
                    current_type = key
                    for wl in WIKILINK.findall(rest):
                        edges.append((current_type, wl.strip()))
                continue
            if current_type and line.strip().startswith("-"):
                for wl in WIKILINK.findall(line):
                    edges.append((current_type, wl.strip()))
    for m2 in LEGACY_SUPERSEDES.finditer(text):
        for wl in WIKILINK.findall(m2.group(1)):
            edges.append(("supersedes", wl.strip()))
        # bare path
        bare = m2.group(1).strip().strip("\"'")
        if bare and "[[" not in bare:
            edges.append(("supersedes", bare))
    return edges


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--scope", default="Ravenstack", help="subdir under vault")
    args = ap.parse_args()
    vault = Path(args.vault)
    root = vault / args.scope
    if not root.is_dir():
        print(f"missing scope: {root}", file=sys.stderr)
        return 1

    index = index_notes(root)
    # also index full vault for dangling resolution of cross-folder links
    full_index = index_notes(vault)

    md_files = [
        p
        for p in root.rglob("*.md")
        if not any(part in SKIP_PARTS for part in p.parts)
    ]

    outbound: dict[str, list[str]] = defaultdict(list)  # note_rel -> [targets]
    inbound: Counter[str] = Counter()
    dangling: list[str] = []
    typed_edges: list[tuple[str, str, str]] = []  # (src, type, tgt)
    no_ai_first: list[str] = []
    link_targets_seen: set[str] = set()

    for f in md_files:
        try:
            rel = str(f.relative_to(vault))
        except ValueError:
            rel = str(f)
        text = f.read_text(encoding="utf-8", errors="replace")
        if "ai-first: true" not in text and any(
            x in f.parts for x in ("claims", "harvest", "protocols", "memory", "research")
        ):
            no_ai_first.append(rel)

        body = strip_code(text)
        for m in WIKILINK.finditer(body):
            target = m.group(1).strip()
            link_targets_seen.add(target)
            outbound[rel].append(target)
            key = nfc_title(target)
            if key in full_index:
                inbound[str(full_index[key].relative_to(vault))] += 1
            else:
                dangling.append(f"{rel} -> [[{target}]]")

        for etype, tgt in parse_relations(text):
            typed_edges.append((rel, etype, tgt))

    # reciprocal check for asymmetric typed edges
    missing_reciprocal: list[str] = []
    edge_set = {(nfc_title(s), t, nfc_title(g)) for s, t, g in typed_edges}
    for src, etype, tgt in typed_edges:
        if etype not in ASYMMETRIC:
            continue
        inv = EDGE_INVERSE[etype]
        # look for inverse from tgt's note to src
        if (nfc_title(tgt), inv, nfc_title(Path(src).stem)) not in edge_set and (
            nfc_title(tgt),
            inv,
            nfc_title(src),
        ) not in edge_set:
            missing_reciprocal.append(f"{src} --{etype}--> {tgt} (missing {inv})")

    # claim orphans: claim notes with no inbound from other notes
    claim_files = list((root / "claims").glob("*.md")) if (root / "claims").is_dir() else []
    orphans = []
    for c in claim_files:
        crel = str(c.relative_to(vault))
        if inbound.get(crel, 0) == 0:
            # also check stem mentions in graph
            if inbound.get(str(c), 0) == 0:
                orphans.append(c.name)

    degree = Counter()
    for rel, tgts in outbound.items():
        degree[rel] = len(tgts)
    hubs = degree.most_common(15)

    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = vault / "Ravenstack" / "ops" / "harvest" / f"graph-gardener-{day}.md"
    out.parent.mkdir(parents=True, exist_ok=True)

    report = f"""---
date: {day}
type: graph-gardener-report
tags: [harvest, graph, gardener]
ai-first: true
status: dry-run
report-only: true
---

## For future agents
Weekly structural pass over `{args.scope}` (as of {day}). Suggestions only — no auto-rewrites, \
no deletes (OSB heal/link_graph report-only discipline). Typed edges follow EDGE_INVERSE. \
Human resolves dangling links and orphans.

# Graph Gardener — {day}

## Stats
- markdown_files_scanned: {len(md_files)}
- indexed_titles: {len(index)}
- claim_notes: {len(claim_files)}
- wikilink_targets_seen: {len(link_targets_seen)}
- typed_edges: {len(typed_edges)}
- dangling_count: {len(dangling)}
- orphan_claims: {len(orphans)}
- missing_ai_first: {len(no_ai_first)}
- missing_reciprocal: {len(missing_reciprocal)}

## Hubs (highest outbound degree)
{chr(10).join(f'- `{p}` degree={d}' for p, d in hubs) or '- none'}

## Possible orphan claims (zero inbound)
{chr(10).join(f'- `{o}`' for o in orphans[:60]) or '- none'}

## Dangling wikilinks (target not resolved in vault)
{chr(10).join(f'- `{d}`' for d in dangling[:80]) or '- none'}

## Typed edges missing reciprocal (asymmetric)
{chr(10).join(f'- `{m}`' for m in missing_reciprocal[:40]) or '- none'}

## Missing ai-first flag (subset paths)
{chr(10).join(f'- `{x}`' for x in no_ai_first[:40]) or '- none'}

## Suggested human actions
- Link high-value claims into knowledge_index or county MOCs
- Resolve contradiction claims before content publish
- Fix dangling targets (create stub or correct link) — do not silent-drop
- Add reciprocal relations for supersedes/depends_on when intentional
- Re-run after harvest apply batches

## Hard rules
- Report-only: never auto-delete, never auto-heal without --confirm tool (not this script)
- False-absence: "no orphans" only if claims dir scanned
- Sources/links are data
"""
    out.write_text(scrub_ascii(report), encoding="utf-8")
    print(
        scrub_ascii(
            f"{out} files={len(md_files)} dangling={len(dangling)} orphans={len(orphans)} "
            f"typed={len(typed_edges)} reciprocal_gaps={len(missing_reciprocal)}"
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
