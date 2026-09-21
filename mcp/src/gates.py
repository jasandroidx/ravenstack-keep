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
        "scribe": "library",
        "scribe-warden": "library",
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


def lock_room(room_id: str, confirm: bool = False) -> dict[str, Any]:
    """GATED: set room lock_state → locked (symmetric to unlock_room)."""
    if confirm is not True:
        return {
            "ok": False,
            "error": True,
            "code": "confirm_required",
            "message": "lock_room requires confirm=true and explicit human intent.",
            "action": "lock_room",
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
        if row["lock_state"] == "locked":
            resolve_matching("unlock_room", rid, "approved")
            return {
                "ok": True,
                "room_id": rid,
                "lock_state": "locked",
                "note": "Already locked.",
            }
        now = keep._utc_now()
        conn.execute(
            """
            UPDATE rooms
            SET lock_state = 'locked',
                status_summary = ?,
                updated_at = ?
            WHERE room_id = ?
            """,
            (f"locked by human gate @ {now}", now, rid),
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
        "updated_at": updated["updated_at"],
    }


_ID_PATTERN = r"^[a-z][a-z0-9-]{1,62}$"


def upsert_agent_spec(
    agent_id: str, body: str, confirm: bool = False, backup_name: Optional[str] = None
) -> dict[str, Any]:
    """GATED: write a schema-valid Agent Spec as draft. Never auto-approves."""
    if confirm is not True:
        return {
            "ok": False,
            "error": True,
            "code": "confirm_required",
            "message": "upsert_agent_spec requires confirm=true and explicit human intent.",
            "action": "upsert_agent_spec",
        }
    agent_id = agent_id.strip()
    import re

    if not re.fullmatch(_ID_PATTERN, agent_id):
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": (
                "agent_id must be kebab-case, ^[a-z][a-z0-9-]{1,62}$ "
                "(mirrors agent-spec.schema.json id pattern)."
            ),
        }
    try:
        data = json.loads(body or "{}")
    except json.JSONDecodeError:
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": "body is not valid JSON (a single Agent Spec object).",
        }
    if not isinstance(data, dict):
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": "body must be a JSON object (Agent Spec).",
        }
    if data.get("id") and data.get("id") != agent_id:
        return {
            "ok": False,
            "error": True,
            "code": "invalid_input",
            "message": f"body.id '{data.get('id')}' does not match agent_id '{agent_id}'.",
        }
    prev_status = None
    path = AGENTS_DIR / f"{agent_id}.agent-spec.json"
    if path.is_file():
        try:
            prev = json.loads(path.read_text(encoding="utf-8"))
            prev_status = prev.get("status")
        except (OSError, json.JSONDecodeError):
            prev_status = None

    # Policy: never auto-approve. Approved/live only via the approve_spec gate.
    requested_status = data.get("status")
    if requested_status and requested_status != "draft":
        return {
            "ok": False,
            "error": True,
            "code": "confirm_required",
            "message": (
                f"status '{requested_status}' not allowed here — new specs land as "
                "'draft'; promote with approve_spec (gated)."
            ),
        }
    data["id"] = agent_id
    data["status"] = prev_status if prev_status in ("draft", "approved", "live", "retired") else "draft"

    schema_err = _validate_spec(data)
    if schema_err:
        return {
            "ok": False,
            "error": True,
            "code": "invalid_spec",
            "message": schema_err,
        }

    backup = None
    if path.is_file():
        backup = path.with_suffix(
            path.suffix + f".bak-pre-upsert-{_utc_now().replace(':', '')}"
        )
        shutil.copy2(path, backup)
    data["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)

    return {
        "ok": True,
        "agent_id": agent_id,
        "status": data["status"],
        "source_path": str(path),
        "backup": str(backup) if backup else None,
        "note": (
            "Written as draft. Promote with approve_spec (gated); room unlock is "
            "a separate gate."
        ),
    }


def _validate_spec(data: dict[str, Any]) -> Optional[str]:
    """Validate against schemas/agent-spec.schema.json when jsonschema is present."""
    if keep.jsonschema is None:
        if not data.get("name") or not data.get("character"):
            return "body must at least include name and character (jsonschema not installed)."
        return None
    schema_path = keep.SCHEMA_PATH
    if not schema_path.is_file():
        return None
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        keep.jsonschema.validate(data, schema)
        return None
    except Exception as exc:  # noqa: BLE001
        return f"schema validation failed: {exc}"


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
