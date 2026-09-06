"""Human gates for Keep Phase B — approve_spec / unlock_room.

All mutations require confirm=true. Never auto-approve.
"""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import server as keep

AGENTS_DIR = keep.AGENTS_DIR


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def init_gates_table() -> None:
    keep.init_db()
    with keep._connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_gates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at TEXT NOT NULL,
              gate_type TEXT NOT NULL,
              subject_id TEXT NOT NULL,
              summary TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              payload TEXT
            )
            """
        )
        # One-time Phase B seal for Library (do not re-seal after unlock_room)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS keep_meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
            """
        )
        sealed = conn.execute(
            "SELECT value FROM keep_meta WHERE key = 'phase_b_library_seal'"
        ).fetchone()
        if not sealed:
            conn.execute(
                """
                UPDATE rooms
                SET lock_state = 'UNFORGED',
                    status = 'Active',
                    notes = 'Knowledge / Oracle — sealed until unlock_room',
                    occupant_agent_id = COALESCE(NULLIF(occupant_agent_id, ''), 'oracle')
                WHERE room_id = 'library'
                """
            )
            conn.execute(
                "INSERT INTO keep_meta(key, value) VALUES ('phase_b_library_seal', 'done')"
            )


def add_gate(
    gate_type: str,
    subject_id: str,
    summary: str,
    payload: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    init_gates_table()
    with keep._connect() as conn:
        # de-dupe pending
        existing = conn.execute(
            """
            SELECT id FROM pending_gates
            WHERE gate_type = ? AND subject_id = ? AND status = 'pending'
            """,
            (gate_type, subject_id),
        ).fetchone()
        if existing:
            row = conn.execute(
                "SELECT * FROM pending_gates WHERE id = ?", (existing["id"],)
            ).fetchone()
            return _gate_row(row)
        cur = conn.execute(
            """
            INSERT INTO pending_gates
              (created_at, gate_type, subject_id, summary, status, payload)
            VALUES (?,?,?,?, 'pending', ?)
            """,
            (
                _utc_now(),
                gate_type,
                subject_id,
                summary,
                json.dumps(payload or {}),
            ),
        )
        gid = cur.lastrowid
        row = conn.execute(
            "SELECT * FROM pending_gates WHERE id = ?", (gid,)
        ).fetchone()
        return _gate_row(row)


def _gate_row(row: Any) -> dict[str, Any]:
    payload = {}
    try:
        payload = json.loads(row["payload"] or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "gate_type": row["gate_type"],
        "subject_id": row["subject_id"],
        "summary": row["summary"],
        "status": row["status"],
        "payload": payload,
    }


def list_pending_gates(include_resolved: bool = False) -> list[dict[str, Any]]:
    init_gates_table()
    with keep._connect() as conn:
        if include_resolved:
            rows = conn.execute(
                "SELECT * FROM pending_gates ORDER BY id DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM pending_gates
                WHERE status = 'pending'
                ORDER BY id ASC
                """
            ).fetchall()
    return [_gate_row(r) for r in rows]


def resolve_gate(gate_id: int, status: str) -> None:
    with keep._connect() as conn:
        conn.execute(
            "UPDATE pending_gates SET status = ? WHERE id = ?",
            (status, gate_id),
        )


def resolve_matching(gate_type: str, subject_id: str, status: str = "approved") -> int:
    n = 0
    for g in list_pending_gates(include_resolved=False):
        if g["gate_type"] == gate_type and g["subject_id"] == subject_id:
            resolve_gate(g["id"], status)
            n += 1
    return n


def refresh_gates_from_sot() -> dict[str, Any]:
    """Ensure pending gates exist for draft specs and sealed rooms (truthful)."""
    init_gates_table()
    created: list[str] = []

    # Draft agent specs → approve_spec gates
    for aid, path in keep._list_agent_specs().items():
        data, _, err = keep._load_spec(aid)
        if err or not data:
            continue
        st = data.get("status")
        if st == "draft":
            g = add_gate(
                "approve_spec",
                aid,
                f"Approve Agent Spec for {aid} (currently draft).",
                {"path": str(path)},
            )
            created.append(f"approve_spec:{aid}#{g['id']}")

    # UNFORGED rooms with occupant → unlock_room if occupant approved/live;
    # if occupant still draft, only approve_spec exists (unlock blocked in UI)
    with keep._connect() as conn:
        rooms = conn.execute(
            "SELECT * FROM rooms WHERE lock_state = 'UNFORGED'"
        ).fetchall()
    for row in rooms:
        rid = row["room_id"]
        occ = row["occupant_agent_id"]
        summary = f"Unlock room {row['name']} ({rid})"
        if occ:
            data, _, _ = keep._load_spec(occ)
            st = (data or {}).get("status")
            if st in ("approved", "live"):
                summary += f" — occupant {occ} is {st}."
            elif st == "draft":
                summary += f" — blocked until approve_spec({occ})."
            else:
                summary += f" — occupant {occ}."
        g = add_gate("unlock_room", rid, summary, {"name": row["name"]})
        created.append(f"unlock_room:{rid}#{g['id']}")

    return {"ok": True, "ensured": created, "pending": list_pending_gates()}


def approve_spec(agent_id: str, confirm: bool = False) -> dict[str, Any]:
    """GATED: write status=approved on agents/<id>.agent-spec.json."""
    if confirm is not True:
        return {
            "ok": False,
            "error": True,
            "code": "confirm_required",
            "message": "approve_spec requires confirm=true and explicit human intent.",
            "action": "approve_spec",
        }
    agent_id = agent_id.strip()
    data, path, err = keep._load_spec(agent_id)
    if err or not data or not path:
        return {
            "ok": False,
            "error": True,
            "code": "unknown_agent",
            "message": err or f"No Spec for {agent_id}",
        }
    if data.get("status") in ("approved", "live"):
        resolve_matching("approve_spec", agent_id, "approved")
        return {
            "ok": True,
            "agent_id": agent_id,
            "status": data.get("status"),
            "note": "Already approved/live; gates cleared.",
            "source_path": str(path),
        }

    # Backup then write
    bak = path.with_suffix(path.suffix + f".bak-pre-approve-{_utc_now().replace(':', '')}")
    shutil.copy2(path, bak)
    data["status"] = "approved"
    data["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    resolve_matching("approve_spec", agent_id, "approved")
    # Re-open unlock gate summary for home room if sealed
    room = data.get("room") or {}
    room_id = room.get("room_id")
    # Map Spec room_id → spatial room if needed
    spatial = _resolve_spatial_room(room_id, room.get("room_name"), agent_id)
    if spatial:
        add_gate(
            "unlock_room",
            spatial,
            f"Unlock room after approving {agent_id}.",
            {"after_approve": agent_id},
        )

    return {
        "ok": True,
        "agent_id": agent_id,
        "status": "approved",
        "source_path": str(path),
        "backup": str(bak),
        "note": "Room unlock is a separate gated tool (unlock_room).",
    }


def unlock_room(room_id: str, confirm: bool = False) -> dict[str, Any]:
    """GATED: set room lock_state → live."""
    if confirm is not True:
        return {
            "ok": False,
            "error": True,
            "code": "confirm_required",
            "message": "unlock_room requires confirm=true and explicit human intent.",
            "action": "unlock_room",
        }
    room_id = room_id.strip()
    init_gates_table()
    with keep._connect() as conn:
        row = keep._find_room(conn, room_id)
        if not row:
            return {
                "ok": False,
                "error": True,
                "code": "not_found",
                "message": f"Unknown room '{room_id}'",
            }
        rid = row["room_id"]
        occ = row["occupant_agent_id"]
        if occ:
            data, _, err = keep._load_spec(occ)
            if data and data.get("status") not in ("approved", "live"):
                return {
                    "ok": False,
                    "error": True,
                    "code": "spec_not_approved",
                    "message": (
                        f"Occupant {occ} status={data.get('status')}; "
                        "approve_spec first."
                    ),
                }
        if row["lock_state"] == "live":
            resolve_matching("unlock_room", rid, "approved")
            return {
                "ok": True,
                "room_id": rid,
                "lock_state": "live",
                "note": "Already live; gates cleared.",
            }
        now = _utc_now()
        conn.execute(
            """
            UPDATE rooms
            SET lock_state = 'live',
                status = CASE WHEN status = 'Restricted' THEN status ELSE 'Active' END,
                status_summary = ?,
                updated_at = ?
            WHERE room_id = ?
            """,
            (f"unlocked by human gate @ {now}", now, rid),
        )
        updated = conn.execute(
            "SELECT * FROM rooms WHERE room_id = ?", (rid,)
        ).fetchone()

    resolve_matching("unlock_room", rid, "approved")
    return {
        "ok": True,
        "room_id": rid,
        "name": updated["name"],
        "lock_state": updated["lock_state"],
        "occupant_agent_id": updated["occupant_agent_id"],
        "updated_at": updated["updated_at"],
    }


def _resolve_spatial_room(
    room_id: Optional[str], room_name: Optional[str], agent_id: str
) -> Optional[str]:
    """Map Spec room ids (oracle, clawforge) onto spatial rooms when needed."""
    aliases = {
        "oracle": "library",
        "clawforge": "alchemy-lab",
        "clawforge-anvil": "alchemy-lab",
        "orchestrator": "great-hall",
        "great-hall": "great-hall",
        "library": "library",
        "alchemy-lab": "alchemy-lab",
        "armory": "armory",
        "observatory": "observatory",
        "vault": "vault",
    }
    if room_id and room_id in aliases:
        return aliases[room_id]
    with keep._connect() as conn:
        if room_id:
            row = conn.execute(
                "SELECT room_id FROM rooms WHERE room_id = ?", (room_id,)
            ).fetchone()
            if row:
                return row["room_id"]
        if room_name:
            row = keep._find_room(conn, room_name)
            if row:
                return row["room_id"]
        row = conn.execute(
            "SELECT room_id FROM rooms WHERE occupant_agent_id = ?",
            (agent_id,),
        ).fetchone()
        if row:
            return row["room_id"]
    return None


_SYNC_GATE_DETAIL = "sync:pending_gate"
_SYNC_CLEAR_DETAIL = "sync:gate_cleared"


def sync_status_from_gates() -> dict[str, Any]:
    """Mirror pending gates → waiting_human chips (truthful only)."""
    init_gates_table()
    pending = list_pending_gates(include_resolved=False)
    wanted: dict[str, str] = {}
    for g in pending:
        gt = g["gate_type"]
        subject = g["subject_id"]
        summary = (g.get("summary") or f"pending {gt}").strip()
        if gt == "approve_spec" and subject:
            wanted[subject] = summary
        elif gt == "unlock_room" and subject:
            with keep._connect() as conn:
                row = keep._find_room(conn, subject)
            aid = (row["occupant_agent_id"] if row else None) or subject
            if aid:
                wanted[str(aid)] = summary

    updated: list[str] = []
    for agent_id, task in wanted.items():
        # Only report for known Spec agents
        if not keep._agent_known(agent_id):
            continue
        raw = keep.report_agent_status(
            agent_id,
            "waiting_human",
            task=task[:200],
            detail=_SYNC_GATE_DETAIL,
        )
        payload = json.loads(raw)
        if payload.get("ok"):
            updated.append(agent_id)

    cleared: list[str] = []
    with keep._connect() as conn:
        rows = conn.execute(
            """
            SELECT agent_id, state, detail FROM agent_status
            WHERE detail = ? AND state = 'waiting_human'
            """,
            (_SYNC_GATE_DETAIL,),
        ).fetchall()
    for row in rows:
        aid = row["agent_id"]
        if aid in wanted:
            continue
        keep.report_agent_status(
            aid, "idle", task=None, detail=_SYNC_CLEAR_DETAIL
        )
        cleared.append(aid)

    return {
        "ok": True,
        "waiting": sorted(wanted.keys()),
        "updated": updated,
        "cleared": cleared,
        "pending_gates": len(pending),
    }
