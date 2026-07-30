"""Resolve repo, data, vault, and reclaw URLs from environment."""

from __future__ import annotations

import os
from pathlib import Path

# mcp/src/ravenstack_keep_mcp/paths.py → repo root = parents[3]
PKG_DIR = Path(__file__).resolve().parent
MCP_DIR = PKG_DIR.parent.parent  # .../mcp
REPO_ROOT = MCP_DIR.parent  # .../ravenstack-keep


def data_dir() -> Path:
    p = Path(os.environ.get("KEEP_MCP_DATA", str(MCP_DIR / "data")))
    p.mkdir(parents=True, exist_ok=True)
    return p


def seeds_dir() -> Path:
    return Path(os.environ.get("KEEP_MCP_SEEDS", str(MCP_DIR / "seeds")))


def agents_dir() -> Path:
    return Path(os.environ.get("KEEP_AGENTS_DIR", str(REPO_ROOT / "agents")))


def schema_path() -> Path:
    return Path(
        os.environ.get(
            "KEEP_AGENT_SPEC_SCHEMA",
            str(REPO_ROOT / "schemas" / "agent-spec.schema.json"),
        )
    )


def backlog_dir() -> Path:
    p = Path(os.environ.get("KEEP_BACKLOG_DIR", str(REPO_ROOT / "backlog" / "agent-specs")))
    p.mkdir(parents=True, exist_ok=True)
    return p


def vault_path() -> Path | None:
    raw = os.environ.get("RECLAW_OBSIDIAN_VAULT_PATH") or os.environ.get("KEEP_VAULT_PATH")
    if not raw:
        # Common laptop paths — optional
        for candidate in (
            Path.home() / "obsidian_vault",
            Path.home() / "Obsidian" / "obsidian_vault",
            Path("/root/obsidian_vault"),
        ):
            if candidate.is_dir():
                return candidate
        return None
    p = Path(raw)
    return p if p.is_dir() else None


def reclaw_mcp_url() -> str:
    return os.environ.get(
        "RECLAW_MCP_URL",
        "http://100.108.130.82:8100",
    ).rstrip("/")


def reclaw_rag_url() -> str:
    return os.environ.get(
        "RECLAW_RAG_URL",
        os.environ.get("RECLAW_GATEWAY_URL", "http://100.108.130.82:8000") + "/rag/search",
    )


def db_path() -> Path:
    return data_dir() / "keep.sqlite3"
