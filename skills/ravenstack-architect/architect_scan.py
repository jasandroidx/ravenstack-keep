#!/usr/bin/env python3
"""Deterministic codebase scan for Ravenstack Architect (obsidian-architect style).

Writes nothing itself — prints JSON facts for note synthesis. Never invents modules.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

CODE_EXT = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".go": "go",
    ".rs": "rust",
    ".sh": "shell",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".sql": "sql",
}

SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", "dist", "build"}
# dirs that are storage/noise, not architecture "modules"
BLOAT_HINTS = {"data", "outputs", "scratch", "generated", "node_modules", ".git", "vault"}

IMPORT_RE = re.compile(
    r"^(?:from|import)\s+([a-zA-Z_][\w\.]*)",
    re.M,
)


def git_commit(path: Path) -> str | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode == 0:
            return r.stdout.strip()
    except Exception:
        return None
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", required=True)
    ap.add_argument("--max-files", type=int, default=8000)
    args = ap.parse_args()
    root = Path(args.path).resolve()
    if not root.is_dir():
        raise SystemExit(f"not a directory: {root}")

    lang = Counter()
    top_dirs: Counter[str] = Counter()
    entry_points = []
    signals = {
        "dockerfile": (root / "Dockerfile").is_file()
        or (root / "docker-compose.yml").is_file()
        or (root / "compose.yml").is_file(),
        "makefile": (root / "Makefile").is_file(),
        "ci": (root / ".github" / "workflows").is_dir(),
        "readme": (root / "README.md").is_file(),
    }
    deps = []
    for req in ("requirements.txt", "pyproject.toml", "package.json"):
        if (root / req).is_file():
            deps.append(req)

    n = 0
    py_by_top: dict[str, list[Path]] = defaultdict(list)
    for p in root.rglob("*"):
        if n >= args.max_files:
            break
        if not p.is_file():
            continue
        if any(x in p.parts for x in SKIP):
            continue
        n += 1
        ext = p.suffix.lower()
        if ext in CODE_EXT:
            lang[CODE_EXT[ext]] += 1
        try:
            rel = p.relative_to(root)
        except ValueError:
            continue
        if len(rel.parts) >= 1:
            top_dirs[rel.parts[0]] += 1
            if ext == ".py":
                py_by_top[rel.parts[0]].append(p)
        name = p.name
        if name in ("main.py", "cli.py", "app.py", "server.py", "__main__.py", "manage.py"):
            entry_points.append(str(rel))

    # modules
    modules = []
    code_modules = []
    bloat_modules = []
    for d, count in top_dirs.most_common(40):
        if d.startswith("."):
            continue
        if not (root / d).is_dir():
            continue
        if count < 3:
            continue
        is_bloat = d.lower() in BLOAT_HINTS or d.startswith("generated")
        kind = (
            "data-bloat"
            if is_bloat
            else (
                "core"
                if d in {"core", "agents", "api", "rag", "tools", "mcp", "scripts", "dashboard", "skills"}
                else "support"
            )
        )
        m = {"name": d, "file_count": count, "kind": kind, "path": d}
        modules.append(m)
        (bloat_modules if is_bloat else code_modules).append(m)

    # import edges between top-level packages (sample py files)
    edge_counts: Counter[tuple[str, str]] = Counter()
    top_names = {m["name"] for m in code_modules}
    for top, files in py_by_top.items():
        if top not in top_names:
            continue
        for f in files[:80]:
            try:
                src = f.read_text(encoding="utf-8", errors="replace")[:50000]
            except OSError:
                continue
            for m in IMPORT_RE.finditer(src):
                mod = m.group(1).split(".")[0]
                if mod in top_names and mod != top:
                    edge_counts[(top, mod)] += 1

    edges = [
        {"from": a, "to": b, "weight": w}
        for (a, b), w in edge_counts.most_common(40)
    ]

    # operator so-what
    total_bloat = sum(m["file_count"] for m in bloat_modules)
    total_code = sum(m["file_count"] for m in code_modules) or 1
    insights = []
    if total_bloat > total_code:
        insights.append(
            f"Storage dominates scan: data-like dirs hold {total_bloat} files vs "
            f"~{sum(m['file_count'] for m in code_modules)} in code-ish tops — "
            "architecture notes should de-emphasize data/ when reasoning about behavior."
        )
    if edges:
        hub = Counter()
        for e in edges:
            hub[e["to"]] += e["weight"]
            hub[e["from"]] += e["weight"]
        top_hub = hub.most_common(3)
        insights.append(
            "Import hubs (most coupled tops): "
            + ", ".join(f"{n}({c})" for n, c in top_hub)
        )
    else:
        insights.append(
            "No cross-top import edges detected in sample (namespace packages or non-py dominant)."
        )
    if not signals.get("ci"):
        insights.append("No .github/workflows detected — CI gap if this is production-critical.")
    if entry_points:
        insights.append("Entry points: " + ", ".join(entry_points[:8]))

    out = {
        "name": root.name,
        "path": str(root),
        "kind": "python-service" if lang.get("python") else "mixed",
        "languages": dict(lang.most_common()),
        "modules": modules,
        "code_modules": code_modules,
        "bloat_modules": bloat_modules,
        "import_edges": edges,
        "operator_insights": insights,
        "dependencies_manifests": deps,
        "entry_points": entry_points[:40],
        "signals": signals,
        "git": {"commit": git_commit(root)},
        "files_scanned": n,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
