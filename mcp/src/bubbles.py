"""Keep speech bubbles (A2) — async phi4-mini one-liners, never awaited by the UI.

Schema: repo schemas/keep-bubbles.schema.json. The durable cache lives beside
keep.db in KEEP_MCP_DATA (`keep-bubbles.json`). The UI reads this file only; it
never blocks on a generation. This module is the A2 worker seam: an async worker
(or a human) publishes bubbles here and MCP/UI read them back.

`publish_bubble` does NOT generate text — it stores text a worker already
produced, and is human-gated (confirm=true). No AI call happens in this module.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import server as keep

MAX_TEXT = 160
MAX_BUBBLES = 50


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _bubbles_path() -> Path:
    return keep.DATA_DIR / "keep-bubbles.json"


def _load() -> list[dict[str, Any]]:
    path = _bubbles_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, dict):
        return []
    rows = data.get("bubbles") or []
    return rows if isinstance(rows, list) else []


def _write(rows: list[dict[str, Any]]) -> None:
    payload = {
        "schema": "keep-bubbles.v1",
        "generated_at": _utc_now(),
        "bubbles": rows,
    }
    path = _bubbles_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _room_exists(room_id: str) -> bool:
    with keep._connect() as conn:
        return keep._find_room(conn, room_id) is not None


def get_bubbles(
    room_id: Optional[str] = None,
    limit: int = 20,
    format: str = "json",
) -> dict[str, Any]:
    """Read the bubble cache, optionally filtered to one room."""
    fmt = (format or "json").lower()
    if fmt not in ("json", "markdown"):
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": "format must be 'json' or 'markdown'",
        }
    row_limit = max(1, min(int(limit or 20), 100))
    rows = _load()
    room = (room_id or "").strip()
    if room:
        room_low = room.lower()
        rows = [b for b in rows if str(b.get("room_id", "")).lower() == room_low]
    rows = rows[:row_limit]  # newest first (prepended on publish)
    if fmt == "markdown":
        lines = [
            f"- **{b.get('agent_id')}** @ {b.get('room_id')}: {b.get('text')} "
            f"({b.get('model')}, {b.get('generated_at')})"
            for b in rows
        ]
        return {
            "ok": True,
            "schema": "keep-bubbles.v1",
            "total": len(_load()),
            "count": len(rows),
            "markdown": "\n".join(lines) if lines else "No bubbles.",
        }
    return {
        "ok": True,
        "schema": "keep-bubbles.v1",
        "generated_at": _utc_now(),
        "total": len(rows),
        "count": len(rows),
        "limit": row_limit,
        "has_more": len(rows) == row_limit,
        "room_id": room or None,
        "bubbles": rows,
    }


def publish_bubble(
    agent_id: str,
    room_id: str,
    text: str,
    model: str = "phi4-mini",
    confirm: bool = False,
    max_bubbles: int = MAX_BUBBLES,
) -> dict[str, Any]:
    """GATED: store a pre-generated bubble (text produced elsewhere). No LLM call."""
    if confirm is not True:
        return {
            "ok": False,
            "error": True,
            "code": "confirm_required",
            "message": "publish_bubble requires confirm=true and explicit human intent.",
            "action": "publish_bubble",
        }
    agent_id = agent_id.strip()
    room_id = room_id.strip()
    text = (text or "").strip()
    if not agent_id or not room_id or not text:
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": "agent_id, room_id, and text are all required.",
        }
    if len(text) > MAX_TEXT:
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": f"bubble text exceeds {MAX_TEXT} chars (schema maxLength).",
            "max_length": MAX_TEXT,
            "length": len(text),
        }
    if not keep._agent_known(agent_id):
        return {
            "ok": False,
            "error": True,
            "code": "unknown_agent",
            "message": f"No Agent Spec for '{agent_id}'; bubbles are for known Keep agents.",
        }
    if not _room_exists(room_id):
        return {
            "ok": False,
            "error": True,
            "code": "not_found",
            "message": f"Unknown room '{room_id}'.",
        }
    model = (model or "phi4-mini").strip() or "phi4-mini"
    bubble = {
        "agent_id": agent_id,
        "room_id": room_id,
        "text": text,
        "generated_at": _utc_now(),
        "model": model,
    }
    rows = _load()
    rows.insert(0, bubble)
    cap = max(1, min(int(max_bubbles or MAX_BUBBLES), 500))
    rows = rows[:cap]
    _write(rows)
    return {
        "ok": True,
        "bubble": bubble,
        "total": len(rows),
        "max_bubbles": cap,
    }