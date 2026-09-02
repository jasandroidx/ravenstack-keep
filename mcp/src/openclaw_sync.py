"""Mirror OpenClaw session lifecycle into Keep agent_status (Phase A).

Truthful only: reads OpenClaw sessions.json on the gateway host and maps
known agents → Keep report_agent_status. Called from castle-map so the UI
poll itself keeps chips live — no fake ambient activity.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Optional

import server as keep

# OpenClaw agent directory name → Keep agent_id (must have Agent Spec)
OPENCLAW_TO_KEEP: dict[str, str] = {
    "main": "raziel",
    # Optional later:
    # "ops": "ops",
    # "architect": "architect",
}

# Session keys that represent the primary "live" session for an agent
PRIMARY_SESSION_SUFFIXES = (
    ":main",  # agent:main:main
)

DEFAULT_OPENCLAW_ROOT = Path(
    os.environ.get("OPENCLAW_STATE_DIR", "/root/.openclaw")
)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _map_session_to_state(entry: dict[str, Any], now_ms: int) -> tuple[str, str]:
    """Return (keep_state, task_hint)."""
    status = (entry.get("status") or "").lower()
    updated = int(entry.get("updatedAt") or entry.get("updated_at") or 0)
    age = max(0, now_ms - updated) if updated else 10**12
    channel = entry.get("lastChannel") or entry.get("channel") or ""
    model = entry.get("model") or entry.get("modelOverride") or ""

    task_bits = []
    if channel:
        task_bits.append(str(channel))
    if model:
        task_bits.append(str(model)[:40])
    task = " · ".join(task_bits) if task_bits else "openclaw session"

    # Explicit terminal states
    if status in ("failed", "timeout", "error"):
        # Keep failed chip hot for 3 minutes, then idle (don't sticky forever)
        if age < 180_000:
            return "failed", f"failed ({task})"
        return "idle", task

    if status in ("done", "completed", "idle"):
        return "idle", task

    if status in ("running", "active", "in_progress", "working", "streaming"):
        return "working", f"working ({task})"

    # Recent activity without clear status → treat as working
    if age < 25_000:
        return "working", f"active ({task})"

    # Moderately recent failed-cleared / quiet
    if age < 120_000 and status:
        return "idle", task

    return "idle", task


def _pick_primary_entry(sessions: dict[str, Any], openclaw_agent: str) -> Optional[dict[str, Any]]:
    """Prefer agent:<id>:main, else most recently updated session for that agent."""
    prefix = f"agent:{openclaw_agent}:"
    primary_key = f"agent:{openclaw_agent}:main"
    if primary_key in sessions and isinstance(sessions[primary_key], dict):
        return sessions[primary_key]

    best: Optional[dict[str, Any]] = None
    best_ts = -1
    for key, ent in sessions.items():
        if not isinstance(ent, dict):
            continue
        if not str(key).startswith(prefix):
            continue
        ts = int(ent.get("updatedAt") or 0)
        if ts >= best_ts:
            best_ts = ts
            best = ent
    return best


def sync_openclaw_status(
    openclaw_root: Optional[Path] = None,
) -> dict[str, Any]:
    """Read OpenClaw sessions and push Keep status for mapped agents."""
    root = Path(openclaw_root or DEFAULT_OPENCLAW_ROOT)
    agents_dir = root / "agents"
    now = _now_ms()
    results: list[dict[str, Any]] = []

    if not agents_dir.is_dir():
        return {
            "ok": False,
            "error": f"OpenClaw agents dir missing: {agents_dir}",
            "updated": [],
        }

    keep.init_db()

    for oc_id, keep_id in OPENCLAW_TO_KEEP.items():
        # Must be a known Keep agent (Spec)
        if not keep._agent_known(keep_id):
            results.append(
                {
                    "openclaw": oc_id,
                    "keep": keep_id,
                    "skipped": "no_keep_spec",
                }
            )
            continue

        sess_path = agents_dir / oc_id / "sessions" / "sessions.json"
        if not sess_path.is_file():
            results.append(
                {
                    "openclaw": oc_id,
                    "keep": keep_id,
                    "skipped": "no_sessions_file",
                }
            )
            continue

        try:
            sessions = json.loads(sess_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            results.append(
                {
                    "openclaw": oc_id,
                    "keep": keep_id,
                    "skipped": f"read_error:{e}",
                }
            )
            continue

        if not isinstance(sessions, dict):
            results.append(
                {
                    "openclaw": oc_id,
                    "keep": keep_id,
                    "skipped": "bad_sessions_shape",
                }
            )
            continue

        entry = _pick_primary_entry(sessions, oc_id)
        if not entry:
            # No session yet → idle
            state, task = "idle", "no session"
        else:
            state, task = _map_session_to_state(entry, now)

        # Avoid write storms: only write if changed.
        # Do not touch room_id — presence walks are owned by report_presence.
        with keep._connect() as conn:
            cur = conn.execute(
                "SELECT state, task, detail, room_id FROM agent_status WHERE agent_id = ?",
                (keep_id,),
            ).fetchone()
            # Skip overwrite if a recent presence report holds a non-home room
            # (agent is mid-walk / away) unless OpenClaw says working/failed.
            if cur and cur["detail"] and str(cur["detail"]).startswith("presence:"):
                if state in ("idle",) and cur["room_id"] and cur["room_id"] != "great-hall":
                    # Keep visual presence task until tour/presence clears
                    if cur["state"] in ("working", "answering", "idle"):
                        age_ok = True  # presence detail is sticky for map walks
                        if age_ok and cur["state"] != "failed":
                            results.append(
                                {
                                    "openclaw": oc_id,
                                    "keep": keep_id,
                                    "state": cur["state"],
                                    "skipped": "presence_override",
                                    "room_id": cur["room_id"],
                                }
                            )
                            continue
            if cur and cur["state"] == state and (cur["task"] or "") == task:
                results.append(
                    {
                        "openclaw": oc_id,
                        "keep": keep_id,
                        "state": state,
                        "unchanged": True,
                    }
                )
                continue

        raw = keep.report_agent_status(
            keep_id,
            state,
            task=task[:200],
            session_id=str((entry or {}).get("sessionId") or "") or None,
            detail="sync:openclaw_session",
            # room_id intentionally omitted — preserves walk destination
        )
        payload = json.loads(raw)
        results.append(
            {
                "openclaw": oc_id,
                "keep": keep_id,
                "state": state,
                "task": task,
                "report": payload,
            }
        )

        # Ensure Great Hall (etc.) shows occupant
        _ensure_occupant(keep_id)

    return {
        "ok": True,
        "synced_at": keep._utc_now(),
        "updated": results,
    }


def _ensure_occupant(keep_id: str) -> None:
    """Point the Spec's home room at this agent if empty or already them."""
    data, _, err = keep._load_spec(keep_id)
    if err or not data:
        return
    room = data.get("room") or {}
    rid = room.get("room_id")
    rname = room.get("room_name")
    if not rid and not rname:
        return
    with keep._connect() as conn:
        row = None
        if rid:
            row = conn.execute(
                "SELECT room_id, occupant_agent_id FROM rooms WHERE room_id = ?",
                (rid,),
            ).fetchone()
        if not row and rname:
            row = keep._find_room(conn, rname)
        if not row:
            return
        occ = row["occupant_agent_id"]
        if occ and occ != keep_id:
            return
        conn.execute(
            """
            UPDATE rooms
            SET occupant_agent_id = ?, updated_at = ?
            WHERE room_id = ?
            """,
            (keep_id, keep._utc_now(), row["room_id"]),
        )
