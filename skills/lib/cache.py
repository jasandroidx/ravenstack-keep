"""File-based JSON cache for free research sources (OSB research/lib/cache.py).

Layout: ~/.cache/ravenstack-research/<source>-<sha1(q)>.json
TTL via mtime. Misses return None. Cache failure is non-fatal.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any


def _cache_dir() -> Path:
    p = Path(os.path.expanduser("~/.cache/ravenstack-research"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def _normalize(query: str) -> str:
    return " ".join(query.lower().split())


def _key(source: str, query: str) -> Path:
    sha = hashlib.sha1(_normalize(query).encode("utf-8")).hexdigest()[:16]
    return _cache_dir() / f"{source}-{sha}.json"


def get(source: str, query: str, ttl_hours: int = 24) -> list[dict[str, Any]] | None:
    path = _key(source, query)
    if not path.exists():
        return None
    age_s = time.time() - path.stat().st_mtime
    if age_s > ttl_hours * 3600:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def put(source: str, query: str, results: list[Any]) -> None:
    path = _key(source, query)
    try:
        path.write_text(json.dumps(results, default=str), encoding="utf-8")
    except OSError:
        pass


def clear() -> int:
    count = 0
    for f in _cache_dir().glob("*.json"):
        try:
            f.unlink()
            count += 1
        except OSError:
            pass
    return count
