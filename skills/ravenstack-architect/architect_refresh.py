#!/usr/bin/env python3
"""Sentinel-safe architecture note writer (OSB /obsidian-architect pattern).

1) Run architect_scan.py for facts (no invention)
2) Write/refresh Architecture notes under Ravenstack/architecture/<project>/
3) On re-run: replace only @generated blocks; preserve @user blocks

Never invents modules - only scan JSON. Prose is structural, not speculative.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

_LIB = Path(__file__).resolve().parent.parent / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))
from note_io import format_frontmatter, write_ai_first  # noqa: E402
from osb_patterns import scrub_ascii, utc_date  # noqa: E402
from sentinels import has_generated_markers, merge_note, wrap_generated  # noqa: E402

HERE = Path(__file__).resolve().parent


def run_scan(codebase: Path) -> dict:
    r = subprocess.run(
        [sys.executable, str(HERE / "architect_scan.py"), "--path", str(codebase)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if r.returncode != 0:
        raise SystemExit(f"scan failed: {r.stderr or r.stdout}")
    return json.loads(r.stdout)



def overview_generated(scan: dict) -> str:
    langs = scan.get("languages") or {}
    modules = scan.get("code_modules") or scan.get("modules") or []
    bloat = scan.get("bloat_modules") or []
    edges = scan.get("import_edges") or []
    insights = scan.get("operator_insights") or []
    core = [m for m in modules if m.get("kind") == "core"]
    support = [m for m in modules if m.get("kind") == "support"]
    # mermaid with edges when available
    nodes = set()
    for m in (core + support)[:20]:
        nodes.add(m["name"])
    for e in edges[:25]:
        nodes.add(e["from"])
        nodes.add(e["to"])
    mermaid_lines = ["```mermaid", "graph LR"]
    for n in sorted(nodes)[:24]:
        mermaid_lines.append(f'  {n}["{n}"]')
    for e in edges[:25]:
        mermaid_lines.append(f'  {e["from"]} -->|{e["weight"]}| {e["to"]}')
    if not edges:
        mermaid_lines.append("  note[no cross-top import edges in sample]")
    mermaid_lines.append("```")
    mermaid = "\n".join(mermaid_lines)
    core_lines = [
        f"- [[{m['name']}]] file_count={m['file_count']} path=`{m['path']}`" for m in core
    ] or ["- none"]
    support_lines = [
        f"- `{m['name']}` files={m['file_count']}" for m in support[:12]
    ] or ["- none"]
    bloat_lines = [
        f"- `{m['name']}` files={m['file_count']} (storage/noise — not behavior core)"
        for m in bloat[:10]
    ] or ["- none flagged"]
    insight_lines = [f"- {i}" for i in insights] or ["- none"]
    edge_lines = [
        f"- `{e['from']}` → `{e['to']}` (import weight {e['weight']})" for e in edges[:15]
    ] or ["- none detected in sample"]
    return "\n".join(
        [
            f"# Architecture - Overview: {scan.get('name')}",
            "",
            f"- kind: `{scan.get('kind')}`",
            f"- path: `{scan.get('path')}`",
            f"- files_scanned: {scan.get('files_scanned')}",
            f"- git_commit: `{(scan.get('git') or {}).get('commit') or 'unknown'}`",
            f"- languages: `{langs}`",
            f"- manifests: `{scan.get('dependencies_manifests')}`",
            f"- signals: `{scan.get('signals')}`",
            "",
            "## What is new / so-what (operator)",
            "These are scan-grounded observations — not a recap of folder names alone.",
            *insight_lines,
            "",
            "## Core modules (behavior)",
            *core_lines,
            "",
            "## Support modules",
            *support_lines,
            "",
            "## Data / bloat tops (do not confuse with app logic)",
            *bloat_lines,
            "",
            "## Coupling (Python import edges between tops)",
            *edge_lines,
            "",
            "## Module map",
            mermaid,
            "",
            "## Entry points",
            *([f"- `{e}`" for e in (scan.get("entry_points") or [])[:12]] or ["- none"]),
            "",
            "## Anti-fabrication",
            "- Only facts from architect_scan.py JSON",
            "- No invented modules, deps, or data flows",
            "- Import edges are sampled; weight is occurrence count not runtime load",
        ]
    )


def module_generated(m: dict, project: str) -> str:
    return "\n".join(
        [
            f"# Architecture - {m['name']}",
            "",
            f"- project: [[{project}]]",
            f"- path: `{m.get('path')}`",
            f"- kind: `{m.get('kind')}`",
            f"- file_count: {m.get('file_count')}",
            "",
            "## Role",
            f"Scanned top-level part of `{project}`. Describe code only after reading sources; this block is structural inventory.",
            "",
            "## Depends on",
            "- TBD - requires code read; not inferred by scan",
        ]
    )


def write_or_refresh(path: Path, fm: dict, preamble: str, generated: str) -> str:
    existing = path.read_text(encoding="utf-8") if path.is_file() else None
    if existing and has_generated_markers(existing):
        from sentinels import replace_generated

        text = replace_generated(existing, generated)
        # refresh scanned-commit in frontmatter line if present
        text = scrub_ascii(text)
        write_ai_first(path, text)
        return "refreshed-generated"
    fm_yaml = format_frontmatter(fm)
    text = merge_note(
        frontmatter_yaml=fm_yaml,
        preamble=preamble,
        generated_body=generated,
        existing=None,
        extra_outside="<!-- @user:start -->\n(Human notes go here; architect refresh never touches this block.)\n<!-- @user:end -->",
    )
    write_ai_first(path, text)
    return "created"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", required=True, help="codebase to scan")
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--project-name", default="", help="vault folder name; default = codebase name")
    args = ap.parse_args()
    codebase = Path(args.path).resolve()
    if not codebase.is_dir():
        raise SystemExit(f"not a directory: {codebase}")
    scan = run_scan(codebase)
    name = args.project_name or scan.get("name") or codebase.name
    dest = Path(args.vault) / "Ravenstack" / "architecture" / name
    dest.mkdir(parents=True, exist_ok=True)
    day = utc_date()
    commit = (scan.get("git") or {}).get("commit") or "unknown"

    actions = []
    ov_path = dest / "Architecture - Overview.md"
    actions.append(
        (
            "overview",
            write_or_refresh(
                ov_path,
                {
                    "date": day,
                    "type": "architecture-overview",
                    "tags": ["architecture", "architect", name],
                    "ai-first": True,
                    "scanned-commit": commit,
                    "codebase": str(codebase),
                },
                f"## For future agents\nArchitecture overview for `{name}` (as of {day}). "
                f"Generated from deterministic scan at commit `{commit}`. "
                f"Refresh replaces @generated only; @user preserved (OSB architect sentinels).",
                overview_generated(scan),
            ),
        )
    )

    for m in scan.get("modules") or []:
        if m.get("kind") != "core":
            continue
        mp = dest / f"Architecture - {m['name']}.md"
        actions.append(
            (
                m["name"],
                write_or_refresh(
                    mp,
                    {
                        "date": day,
                        "type": "architecture-module",
                        "tags": ["architecture", "module", name, m["name"]],
                        "ai-first": True,
                        "scanned-commit": commit,
                        "module": m["name"],
                    },
                    f"## For future agents\nModule note for `{m['name']}` in `{name}` (as of {day}). "
                    f"Scan-grounded only. Sentinel-safe refresh.",
                    module_generated(m, name),
                ),
            )
        )

    # decisions stub - only from scan signals, no commit miner required
    dec = dest / "Architecture - Key decisions.md"
    actions.append(
        (
            "decisions",
            write_or_refresh(
                dec,
                {
                    "date": day,
                    "type": "adr",
                    "tags": ["architecture", "decisions", name],
                    "ai-first": True,
                    "scanned-commit": commit,
                    "status": "draft",
                },
                f"## For future agents\nKey decisions candidates for `{name}` (as of {day}). "
                f"Mark inferred items confidence: speculation. Do not invent history.",
                "\n".join(
                    [
                        "# Architecture - Key decisions",
                        "",
                        "- Run mine_commit_decisions.py for ADR candidates when available.",
                        f"- Scan signals: `{json.dumps(scan.get('signals') or {})}`",
                        f"- Manifests present: `{scan.get('dependencies_manifests')}`",
                        "",
                        "## Candidates",
                        "- TBD - human or commit miner fills; do not fabricate ADRs",
                    ]
                ),
            ),
        )
    )

    print(
        json.dumps(
            {
                "project": name,
                "dest": str(dest),
                "commit": commit,
                "actions": actions,
                "modules_core": [m["name"] for m in (scan.get("modules") or []) if m.get("kind") == "core"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
