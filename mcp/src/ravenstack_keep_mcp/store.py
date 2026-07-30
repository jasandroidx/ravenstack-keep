"""SQLite state store for rooms, agent status, events, A2A stubs, costs, rituals."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .paths import db_path, seeds_dir


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class KeepStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or db_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self.bootstrap_from_seeds()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS rooms (
                    room_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    lock_state TEXT NOT NULL,
                    x REAL,
                    y REAL,
                    occupant_agent_id TEXT,
                    status_summary TEXT,
                    queue_depth INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agent_status (
                    agent_id TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    task TEXT,
                    confidence REAL,
                    session_id TEXT,
                    detail TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    room_id TEXT,
                    agent_id TEXT,
                    payload TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS a2a_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    trace_id TEXT NOT NULL,
                    from_agent TEXT,
                    to_agent TEXT,
                    msg_type TEXT,
                    body TEXT,
                    payload TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cost_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    model TEXT,
                    est_usd REAL NOT NULL DEFAULT 0,
                    note TEXT
                );

                CREATE TABLE IF NOT EXISTS ritual_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    goal TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT
                );

                CREATE TABLE IF NOT EXISTS pending_gates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    gate_type TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    payload TEXT
                );

                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

    def _castle_map_seed(self) -> Path | None:
        """Prefer canonical castle_map.json; fall back to legacy provisional name."""
        primary = seeds_dir() / "castle_map.json"
        legacy = seeds_dir() / "castle_map.provisional.json"
        if primary.is_file():
            return primary
        if legacy.is_file():
            return legacy
        return None

    def bootstrap_from_seeds(self) -> None:
        seed = self._castle_map_seed()
        if seed is None:
            return
        with self._conn() as conn:
            n = conn.execute("SELECT COUNT(*) AS c FROM rooms").fetchone()["c"]
            if n > 0:
                return
            data = json.loads(seed.read_text(encoding="utf-8"))
            now = _utc_now()
            for room in data.get("rooms", []):
                conn.execute(
                    """
                    INSERT OR IGNORE INTO rooms
                    (room_id, name, lock_state, x, y, occupant_agent_id,
                     status_summary, queue_depth, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        room["room_id"],
                        room["name"],
                        room["lock_state"],
                        room.get("x"),
                        room.get("y"),
                        room.get("occupant_agent_id"),
                        room.get("status_summary"),
                        int(room.get("queue_depth") or 0),
                        now,
                    ),
                )
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                ("sot_status", data.get("sot_status", "CANONICAL")),
            )
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                ("sot_note", data.get("sot_note", "")),
            )
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                ("castle_map_version", data.get("version", "unknown")),
            )
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                ("castle_map_seed", str(seed.name)),
            )
            # Seed idle status for known occupants
            for room in data.get("rooms", []):
                aid = room.get("occupant_agent_id")
                if aid:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO agent_status
                        (agent_id, state, task, confidence, session_id, detail, updated_at)
                        VALUES (?, 'idle', NULL, NULL, NULL, 'seeded', ?)
                        """,
                        (aid, now),
                    )

    # --- rooms ---

    def list_rooms(
        self,
        include_unforged: bool = True,
        lock_state: str | None = None,
    ) -> list[dict[str, Any]]:
        q = "SELECT * FROM rooms WHERE 1=1"
        args: list[Any] = []
        if not include_unforged:
            q += " AND lock_state != 'UNFORGED'"
        if lock_state:
            q += " AND lock_state = ?"
            args.append(lock_state)
        q += " ORDER BY room_id"
        with self._conn() as conn:
            rows = conn.execute(q, args).fetchall()
        return [dict(r) for r in rows]

    def get_room(self, room_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM rooms WHERE room_id = ?", (room_id,)
            ).fetchone()
        return dict(row) if row else None

    def update_room(self, room_id: str, **fields: Any) -> dict[str, Any] | None:
        allowed = {
            "name",
            "lock_state",
            "x",
            "y",
            "occupant_agent_id",
            "status_summary",
            "queue_depth",
        }
        updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if not updates:
            return self.get_room(room_id)
        updates["updated_at"] = _utc_now()
        cols = ", ".join(f"{k} = ?" for k in updates)
        vals = list(updates.values()) + [room_id]
        with self._conn() as conn:
            conn.execute(f"UPDATE rooms SET {cols} WHERE room_id = ?", vals)
        return self.get_room(room_id)

    # --- agent status ---

    def report_agent_status(
        self,
        agent_id: str,
        state: str,
        task: str | None = None,
        confidence: float | None = None,
        session_id: str | None = None,
        detail: str | None = None,
    ) -> dict[str, Any]:
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO agent_status
                (agent_id, state, task, confidence, session_id, detail, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(agent_id) DO UPDATE SET
                  state=excluded.state,
                  task=excluded.task,
                  confidence=excluded.confidence,
                  session_id=excluded.session_id,
                  detail=excluded.detail,
                  updated_at=excluded.updated_at
                """,
                (agent_id, state, task, confidence, session_id, detail, now),
            )
        self.append_event(
            "agent_status",
            agent_id=agent_id,
            payload={
                "state": state,
                "task": task,
                "confidence": confidence,
                "session_id": session_id,
                "detail": detail,
            },
        )
        return {
            "ok": True,
            "agent_id": agent_id,
            "state": state,
            "updated_at": now,
        }

    def get_agent_status(self, agent_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM agent_status WHERE agent_id = ?", (agent_id,)
            ).fetchone()
        return dict(row) if row else None

    def list_agent_statuses(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_status ORDER BY agent_id"
            ).fetchall()
        return [dict(r) for r in rows]

    def list_waiting_human(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_status WHERE state = 'waiting_human' ORDER BY updated_at"
            ).fetchall()
        return [dict(r) for r in rows]

    # --- events / A2A ---

    def append_event(
        self,
        kind: str,
        payload: dict[str, Any],
        room_id: str | None = None,
        agent_id: str | None = None,
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO events (ts, kind, room_id, agent_id, payload)
                VALUES (?, ?, ?, ?, ?)
                """,
                (_utc_now(), kind, room_id, agent_id, json.dumps(payload)),
            )

    def search_events(
        self,
        kind: str | None = None,
        room_id: str | None = None,
        agent_id: str | None = None,
        since: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        q = "SELECT * FROM events WHERE 1=1"
        args: list[Any] = []
        if kind:
            q += " AND kind = ?"
            args.append(kind)
        if room_id:
            q += " AND room_id = ?"
            args.append(room_id)
        if agent_id:
            q += " AND agent_id = ?"
            args.append(agent_id)
        if since:
            q += " AND ts >= ?"
            args.append(since)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(min(limit, 200))
        with self._conn() as conn:
            rows = conn.execute(q, args).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["payload"] = json.loads(d["payload"])
            out.append(d)
        return out

    def list_a2a(
        self,
        trace_id: str | None = None,
        from_agent: str | None = None,
        to_agent: str | None = None,
        since: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        q = "SELECT * FROM a2a_messages WHERE 1=1"
        args: list[Any] = []
        if trace_id:
            q += " AND trace_id = ?"
            args.append(trace_id)
        if from_agent:
            q += " AND from_agent = ?"
            args.append(from_agent)
        if to_agent:
            q += " AND to_agent = ?"
            args.append(to_agent)
        if since:
            q += " AND ts >= ?"
            args.append(since)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(min(limit, 200))
        with self._conn() as conn:
            rows = conn.execute(q, args).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["payload"] = json.loads(d["payload"]) if d.get("payload") else {}
            out.append(d)
        return out

    def get_agent_trace(self, trace_id: str) -> dict[str, Any]:
        msgs = self.list_a2a(trace_id=trace_id, limit=200)
        if not msgs:
            return {
                "trace_id": trace_id,
                "instrumented": False,
                "messages": [],
                "note": (
                    "No A2A messages stored for this trace_id. "
                    "A2A bus is not fully wired; Keep MCP will not invent traces."
                ),
            }
        return {
            "trace_id": trace_id,
            "instrumented": True,
            "messages": list(reversed(msgs)),
            "note": None,
        }

    # --- cost (stub ledger) ---

    def cost_summary(
        self, agent_id: str | None = None, month: str | None = None
    ) -> dict[str, Any]:
        if not month:
            month = datetime.now(timezone.utc).strftime("%Y-%m")
        prefix = month
        q = "SELECT agent_id, tier, est_usd FROM cost_events WHERE ts LIKE ?"
        args: list[Any] = [f"{prefix}%"]
        if agent_id:
            q += " AND agent_id = ?"
            args.append(agent_id)
        with self._conn() as conn:
            rows = conn.execute(q, args).fetchall()
        by: dict[str, dict[str, Any]] = {}
        total = 0.0
        for r in rows:
            aid = r["agent_id"]
            if aid not in by:
                by[aid] = {
                    "agent_id": aid,
                    "tier_breakdown": {"local": 0.0, "escalate": 0.0, "god": 0.0},
                    "est_usd": 0.0,
                    "call_count": 0,
                }
            tier = r["tier"] if r["tier"] in ("local", "escalate", "god") else "local"
            usd = float(r["est_usd"] or 0)
            by[aid]["tier_breakdown"][tier] = by[aid]["tier_breakdown"].get(tier, 0) + usd
            by[aid]["est_usd"] += usd
            by[aid]["call_count"] += 1
            total += usd
        return {
            "month": month,
            "currency": "USD",
            "monthly_ceiling": None,
            "total_est_usd": total,
            "by_agent": list(by.values()),
            "notes": (
                "v0 stub ledger. Cost event pipeline not wired (section E deferred). "
                "Zeros are honest, not estimates."
            ),
        }

    # --- rituals ---

    def record_ritual(self, goal: str, status: str, detail: str | None = None) -> dict[str, Any]:
        now = _utc_now()
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO ritual_runs (ts, goal, status, detail)
                VALUES (?, ?, ?, ?)
                """,
                (now, goal, status, detail),
            )
            rid = cur.lastrowid
        self.append_event("ritual", payload={"goal": goal, "status": status, "id": rid})
        return {"id": rid, "ts": now, "goal": goal, "status": status, "detail": detail}

    def last_ritual(self) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM ritual_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return dict(row) if row else None

    # --- gates ---

    def add_gate(
        self,
        gate_type: str,
        subject_id: str,
        summary: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = _utc_now()
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO pending_gates
                (created_at, gate_type, subject_id, summary, status, payload)
                VALUES (?, ?, ?, ?, 'pending', ?)
                """,
                (now, gate_type, subject_id, summary, json.dumps(payload or {})),
            )
            gid = cur.lastrowid
        return {
            "id": gid,
            "created_at": now,
            "gate_type": gate_type,
            "subject_id": subject_id,
            "summary": summary,
            "status": "pending",
        }

    def list_pending_gates(self, include_resolved: bool = False) -> list[dict[str, Any]]:
        q = "SELECT * FROM pending_gates"
        if not include_resolved:
            q += " WHERE status = 'pending'"
        q += " ORDER BY id DESC"
        with self._conn() as conn:
            rows = conn.execute(q).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["payload"] = json.loads(d["payload"] or "{}")
            out.append(d)
        return out

    def resolve_gate(self, gate_id: int, status: str) -> None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE pending_gates SET status = ? WHERE id = ?",
                (status, gate_id),
            )

    def get_meta(self, key: str, default: str | None = None) -> str | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT value FROM meta WHERE key = ?", (key,)
            ).fetchone()
        return row["value"] if row else default

    def set_meta(self, key: str, value: str) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                (key, value),
            )
