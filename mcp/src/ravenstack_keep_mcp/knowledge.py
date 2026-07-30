"""Scoped knowledge queries — enforce Agent Spec knowledge_seeds."""

from __future__ import annotations

import fnmatch
import json
import re
from pathlib import Path
from typing import Any

import httpx

from .paths import vault_path
from .specs import load_spec


def explain_scope(agent_id: str) -> dict[str, Any]:
    spec = load_spec(agent_id)
    if not spec:
        return {
            "error": "not_found",
            "message": f"No Agent Spec for {agent_id}; cannot explain scope.",
        }
    seeds = spec.get("knowledge_seeds") or {}
    return {
        "agent_id": agent_id,
        "indexes": seeds.get("indexes") or [],
        "vault_globs": seeds.get("vault_globs") or [],
        "notes": seeds.get("notes"),
        "policy": {
            "general_forbidden": True,
            "out_of_seed_indexes": "scope_denied error",
            "missing_spec": "cannot query",
        },
    }


def list_knowledge_indexes() -> dict[str, Any]:
    return {
        "allowed_index_names": ["self", "domain", "longtail"],
        "forbidden": ["general"],
        "note": (
            "Keep never seeds a general index. Concrete indexes are defined per Agent Spec "
            "knowledge_seeds.indexes."
        ),
        "known_from_specs": _indexes_from_all_specs(),
    }


def _indexes_from_all_specs() -> dict[str, list[str]]:
    from .paths import agents_dir

    out: dict[str, list[str]] = {}
    d = agents_dir()
    if not d.is_dir():
        return out
    for path in d.glob("*.agent-spec.json"):
        try:
            spec = json.loads(path.read_text(encoding="utf-8"))
            aid = spec.get("id") or path.stem
            out[aid] = list((spec.get("knowledge_seeds") or {}).get("indexes") or [])
        except Exception:  # noqa: BLE001
            continue
    return out


def _path_allowed(rel: str, globs: list[str]) -> bool:
    if not globs:
        return True
    rel = rel.lstrip("./")
    for g in globs:
        g = g.lstrip("./")
        if fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(rel, g.rstrip("/") + "/**"):
            return True
        # prefix directory match for globs like Ravenstack/ops/**/*.md
        if g.endswith("/**") and rel.startswith(g[:-3]):
            return True
        if g.endswith("/**/*") and rel.startswith(g[:-5]):
            return True
    return False


def _local_vault_search(
    query: str,
    globs: list[str],
    top_k: int,
) -> list[dict[str, Any]]:
    vault = vault_path()
    if vault is None:
        return []
    tokens = [t.lower() for t in re.findall(r"[a-zA-Z0-9_]{3,}", query)]
    if not tokens:
        tokens = [query.lower()]
    hits: list[dict[str, Any]] = []
    for path in vault.rglob("*.md"):
        try:
            rel = str(path.relative_to(vault)).replace("\\", "/")
        except ValueError:
            continue
        if not _path_allowed(rel, globs):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        lower = text.lower()
        score = sum(1 for t in tokens if t in lower)
        if score <= 0:
            continue
        # snippet around first token
        idx = lower.find(tokens[0]) if tokens else 0
        start = max(0, idx - 80)
        snippet = text[start : start + 240].replace("\n", " ").strip()
        hits.append(
            {
                "path": rel,
                "section": None,
                "snippet": snippet,
                "score": float(score),
                "index": "self",
                "source": "local_vault_scan",
            }
        )
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits[:top_k]


def _proxy_reclaw_rag(query: str, top_k: int) -> list[dict[str, Any]] | None:
    """Optional proxy to ReClaw API if reachable. Returns None if offline."""
    import os

    url = os.environ.get(
        "RECLAW_RAG_URL",
        "http://100.108.130.82:8000/rag/search",
    )
    try:
        r = httpx.post(url, json={"query": query, "top_k": top_k}, timeout=5.0)
        if r.status_code != 200:
            return None
        data = r.json()
        # Normalize common shapes
        results = data.get("results") or data.get("hits") or data
        if not isinstance(results, list):
            return None
        out = []
        for item in results[:top_k]:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "path": item.get("path") or item.get("source") or item.get("id"),
                    "section": item.get("section"),
                    "snippet": item.get("snippet") or item.get("text") or item.get("content"),
                    "score": float(item.get("score") or item.get("similarity") or 0),
                    "index": "self",
                    "source": "reclaw_rag",
                }
            )
        return out
    except Exception:  # noqa: BLE001
        return None


def query_scoped_knowledge(
    agent_id: str,
    query: str,
    top_k: int = 5,
    indexes: list[str] | None = None,
) -> dict[str, Any]:
    top_k = max(1, min(int(top_k), 20))
    spec = load_spec(agent_id)
    if not spec:
        return {
            "error": "not_found",
            "message": f"No Agent Spec for agent_id={agent_id}",
        }

    seeds = spec.get("knowledge_seeds") or {}
    allowed = list(seeds.get("indexes") or [])
    globs = list(seeds.get("vault_globs") or [])

    requested = list(indexes) if indexes else list(allowed)
    for idx in requested:
        if idx == "general":
            return {
                "error": "scope_denied",
                "code": "scope_denied",
                "message": "Index 'general' is forbidden in Keep.",
            }
        if idx not in allowed:
            return {
                "error": "scope_denied",
                "code": "scope_denied",
                "message": f"Index {idx!r} not in agent knowledge_seeds.indexes={allowed}",
            }

    # Prefer local scoped scan; filter RAG proxy by globs if present
    local = _local_vault_search(query, globs, top_k)
    if local:
        return {
            "agent_id": agent_id,
            "indexes_used": requested,
            "results": local,
            "backend": "local_vault_scan",
        }

    remote = _proxy_reclaw_rag(query, top_k * 2)
    if remote is not None:
        filtered = []
        for hit in remote:
            path = str(hit.get("path") or "")
            if globs and path and not _path_allowed(path, globs):
                continue
            filtered.append(hit)
            if len(filtered) >= top_k:
                break
        return {
            "agent_id": agent_id,
            "indexes_used": requested,
            "results": filtered,
            "backend": "reclaw_rag_filtered",
        }

    return {
        "agent_id": agent_id,
        "indexes_used": requested,
        "results": [],
        "backend": "none",
        "note": (
            "No vault path and ReClaw RAG unreachable. "
            "Set KEEP_VAULT_PATH or RECLAW_OBSIDIAN_VAULT_PATH, or run on tailnet."
        ),
    }
