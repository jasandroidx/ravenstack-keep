#!/usr/bin/env python3
"""Deterministic codebase scan for Ravenstack Architect (obsidian-architect style).

Writes nothing itself — prints JSON facts for note synthesis. Never invents modules.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter
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
        "dockerfile": (root / "Dockerfile").is_file() or (root / "docker-compose.yml").is_file(),
        "makefile": (root / "Makefile").is_file(),
        "ci": (root / ".github" / "workflows").is_dir(),
        "readme": (root / "README.md").is_file(),
    }
    deps = []
    for req in ("requirements.txt", "pyproject.toml", "package.json"):
        if (root / req).is_file():
            deps.append(req)

    n = 0
    for p in root.rglob("*"):
        if n >= args.max_files:
            break
        if not p.is_file():
            continue
        if any(x in p.parts for x in (".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache")):
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
        name = p.name
        if name in ("main.py", "cli.py", "app.py", "server.py", "__main__.py", "manage.py"):
            entry_points.append(str(rel))

    # modules = top-level dirs with enough files
    modules = []
    for d, count in top_dirs.most_common(30):
        if d.startswith("."):
            continue
        if not (root / d).is_dir():
            continue
        if count < 3:
            continue
        kind = "core" if d in {"core", "agents", "api", "rag", "tools", "mcp", "scripts", "dashboard"} else "support"
        modules.append({"name": d, "file_count": count, "kind": kind, "path": d})

    out = {
        "name": root.name,
        "path": str(root),
        "kind": "python-service" if lang.get("python") else "mixed",
        "languages": dict(lang.most_common()),
        "modules": modules,
        "dependencies_manifests": deps,
        "entry_points": entry_points[:40],
        "signals": signals,
        "git": {"commit": git_commit(root)},
        "files_scanned": n,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
