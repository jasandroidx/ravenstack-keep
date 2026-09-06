"""
Ravenstack Keep MCP — Phase-1 tools + spatial telemetry.

Spatial grid (castle map for visual Keep / Phaser):
  Library [1,0]   Observatory [1,2]
  Alchemy Lab [1,1]
  Armory [0,1]
  Great Hall [0,0]
  Vault [-1,-1]

Phase-1 tools (mcp/tools.md) stay canonical. Spatial tools are additive.
State: SQLite under mcp/data/keep.db. Specs: repo agents/*.agent-spec.json.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastmcp import FastMCP

try:
    import jsonschema
except ImportError:  # pragma: no cover
    jsonschema = None  # type: ignore

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SRC_DIR = Path(__file__).resolve().parent
MCP_DIR = SRC_DIR.parent
REPO_ROOT = MCP_DIR.parent
AGENTS_DIR = REPO_ROOT / "agents"
SCHEMA_PATH = REPO_ROOT / "schemas" / "agent-spec.schema.json"
DATA_DIR = Path(os.environ.get("KEEP_MCP_DATA", str(MCP_DIR / "data")))
DB_PATH = DATA_DIR / "keep.db"

# Optional vault roots for local scoped knowledge (no network required)
_VAULT_CANDIDATES = [
    Path(p)
    for p in (
        os.environ.get("OBSIDIAN_VAULT", ""),
        "/root/obsidian_vault",
        str(Path.home() / "Obsidian"),
        str(Path.home() / "obsidian_vault"),
    )
    if p
]

AGENT_STATES = frozenset(
    {"idle", "answering", "working", "waiting_human", "failed", "retired"}
)
LOCK_STATES = frozenset({"UNFORGED", "live", "locked"})

# Canonical six rooms — only these participate in pathing / castle map.
# status: fortress display (Active | Secure | Restricted)
# lock_state: Phase-1 contract (UNFORGED | live | locked)
SEED_ROOMS: list[dict[str, Any]] = [
    {
        "room_id": "great-hall",
        "name": "Great Hall",
        "x": 0,
        "y": 0,
        "status": "Secure",
        "lock_state": "live",
        "notes": "Orchestrator / command center (Raziel)",
        "occupant_agent_id": "raziel",
    },
    {
        "room_id": "alchemy-lab",
        "name": "Alchemy Lab",
        "x": 1,
        "y": 1,
        "status": "Active",
        "lock_state": "live",
        "notes": "Clawforge",
        "occupant_agent_id": "clawforge",
    },
    {
        "room_id": "library",
        "name": "Library",
        "x": 1,
        "y": 0,
        "status": "Active",
        "lock_state": "UNFORGED",
        "notes": "Knowledge stacks: Oracle (read/RAG) + Scribe (write/distill)",
        "occupant_agent_id": "oracle",
        "co_occupants": ["scribe"],
    },
    {
        "room_id": "armory",
        "name": "Armory",
        "x": 0,
        "y": 1,
        "status": "Secure",
        "lock_state": "live",
        "notes": "Tools & MCP multiplex",
        "occupant_agent_id": None,
    },
    {
        "room_id": "observatory",
        "name": "Observatory",
        "x": 1,
        "y": 2,
        "status": "Active",
        "lock_state": "live",
        "notes": "Round Table / multi-AI",
        "occupant_agent_id": None,
    },
    {
        "room_id": "vault",
        "name": "Vault",
        "x": -1,
        "y": -1,
        "status": "Restricted",
        "lock_state": "locked",
        "notes": "Cost, secrets, restricted",
        "occupant_agent_id": None,
    },
]

mcp = FastMCP(
    name="ravenstack-keep",
    instructions=(
        "Ravenstack Keep MCP: room inventory, agent status, specs, scoped "
        "knowledge, cost summary, and spatial castle telemetry for the visual Keep."
    ),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _ok(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, default=str)


def _err(message: str, code: str = "error", **extra: Any) -> str:
    body: dict[str, Any] = {"ok": False, "error": True, "code": code, "message": message}
    body.update(extra)
    return json.dumps(body, indent=2)


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create tables and seed the six spatial rooms on first run."""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS rooms (
              room_id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              x INTEGER,
              y INTEGER,
              status TEXT NOT NULL DEFAULT 'Active',
              lock_state TEXT NOT NULL DEFAULT 'live',
              occupant_agent_id TEXT,
              co_occupants TEXT,
              notes TEXT,
              status_summary TEXT,
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
            CREATE TABLE IF NOT EXISTS cost_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts TEXT NOT NULL,
              agent_id TEXT NOT NULL,
              tier TEXT NOT NULL DEFAULT 'local',
              model TEXT,
              est_usd REAL NOT NULL DEFAULT 0,
              note TEXT
            );
            """
        )
        # Migrate older rooms tables
        room_cols = {
            r[1] for r in conn.execute("PRAGMA table_info(rooms)").fetchall()
        }
        if "co_occupants" not in room_cols:
            conn.execute("ALTER TABLE rooms ADD COLUMN co_occupants TEXT")

        n = conn.execute("SELECT COUNT(*) AS c FROM rooms").fetchone()["c"]
        if n == 0:
            now = _utc_now()
            for r in SEED_ROOMS:
                co = r.get("co_occupants")
                co_json = json.dumps(co) if co else None
                conn.execute(
                    """
                    INSERT INTO rooms (
                      room_id, name, x, y, status, lock_state,
                      occupant_agent_id, co_occupants, notes, status_summary, updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        r["room_id"],
                        r["name"],
                        r["x"],
                        r["y"],
                        r["status"],
                        r["lock_state"],
                        r["occupant_agent_id"],
                        co_json,
                        r["notes"],
                        r["notes"],
                        now,
                    ),
                )
        else:
            # Phase A: ensure Raziel home room occupant without wiping live status
            conn.execute(
                """
                UPDATE rooms
                SET occupant_agent_id = COALESCE(occupant_agent_id, 'raziel'),
                    notes = COALESCE(notes, 'Orchestrator / command center (Raziel)')
                WHERE room_id = 'great-hall'
                  AND (occupant_agent_id IS NULL OR occupant_agent_id = ''
                       OR occupant_agent_id = 'raziel')
                """
            )
            # Library: Oracle primary + Scribe co-resident
            conn.execute(
                """
                UPDATE rooms
                SET occupant_agent_id = COALESCE(NULLIF(occupant_agent_id, ''), 'oracle'),
                    co_occupants = ?,
                    notes = 'Knowledge stacks: Oracle (read/RAG) + Scribe (write/distill)'
                WHERE room_id = 'library'
                """,
                (json.dumps(["scribe"]),),
            )
        # Presence columns for visual command layer (idempotent)
        cols = {
            r[1]
            for r in conn.execute("PRAGMA table_info(agent_status)").fetchall()
        }
        if "room_id" not in cols:
            conn.execute("ALTER TABLE agent_status ADD COLUMN room_id TEXT")
        if "sprite_hint" not in cols:
            conn.execute("ALTER TABLE agent_status ADD COLUMN sprite_hint TEXT")


def _parse_co_occupants(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw if x]
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, list):
            return [str(x) for x in data if x]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _room_agent_ids(row: sqlite3.Row) -> list[str]:
    """Primary occupant + co_occupants (Library: oracle + scribe)."""
    keys = row.keys()
    ids: list[str] = []
    primary = row["occupant_agent_id"]
    if primary:
        ids.append(str(primary))
    if "co_occupants" in keys:
        for a in _parse_co_occupants(row["co_occupants"]):
            if a not in ids:
                ids.append(a)
    return ids


def _row_room(row: sqlite3.Row) -> dict[str, Any]:
    keys = row.keys()
    co = (
        _parse_co_occupants(row["co_occupants"])
        if "co_occupants" in keys
        else []
    )
    return {
        "room_id": row["room_id"],
        "name": row["name"],
        "coords": [row["x"], row["y"]] if row["x"] is not None else None,
        "x": row["x"],
        "y": row["y"],
        "status": row["status"],
        "lock_state": row["lock_state"],
        "occupant_agent_id": row["occupant_agent_id"],
        "co_occupants": co,
        "agent_ids": _room_agent_ids(row),
        "notes": row["notes"],
        "status_summary": row["status_summary"] or row["notes"] or "",
        "updated_at": row["updated_at"],
    }


def _find_room(conn: sqlite3.Connection, name_or_id: str) -> Optional[sqlite3.Row]:
    key = name_or_id.strip().lower()
    row = conn.execute(
        """
        SELECT * FROM rooms
        WHERE lower(name) = ? OR lower(room_id) = ?
           OR lower(replace(name, ' ', '-')) = ?
        LIMIT 1
        """,
        (key, key, key.replace(" ", "-")),
    ).fetchone()
    return row


def _list_agent_specs() -> dict[str, Path]:
    out: dict[str, Path] = {}
    if not AGENTS_DIR.is_dir():
        return out
    for p in sorted(AGENTS_DIR.glob("*.agent-spec.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            aid = data.get("id")
            if isinstance(aid, str):
                out[aid] = p
        except (OSError, json.JSONDecodeError):
            continue
    return out


def _load_spec(agent_id: str) -> tuple[Optional[dict[str, Any]], Optional[Path], Optional[str]]:
    """Return (spec_dict, path, error_message)."""
    specs = _list_agent_specs()
    path = specs.get(agent_id)
    if not path:
        # try filename stem
        cand = AGENTS_DIR / f"{agent_id}.agent-spec.json"
        if cand.is_file():
            path = cand
        else:
            return None, None, f"Unknown agent_id '{agent_id}' (no Agent Spec)."
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return None, path, f"Failed to read spec: {e}"
    if jsonschema is not None and SCHEMA_PATH.is_file():
        try:
            schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
            jsonschema.validate(data, schema)
        except Exception as e:  # noqa: BLE001 — surface as tool error
            return None, path, f"Spec failed schema validation: {e}"
    return data, path, None


def _agent_known(agent_id: str) -> bool:
    if agent_id in _list_agent_specs():
        return True
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM agent_status WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        return row is not None


def _manhattan(a: tuple[int, int], b: tuple[int, int]) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _grid_path(
    start: tuple[int, int], goal: tuple[int, int]
) -> Optional[list[tuple[int, int]]]:
    """BFS on free 4-directional grid cells between room coordinates.

    Empty cells are walkable so Vault [-1,-1] can reach Great Hall [0,0]
    via intermediate tiles even when no room sits on those tiles.
    """
    if start == goal:
        return [start]
    q: deque[tuple[int, int]] = deque([start])
    prev: dict[tuple[int, int], Optional[tuple[int, int]]] = {start: None}
    # Bound search: generous box around both points
    xs = [start[0], goal[0]]
    ys = [start[1], goal[1]]
    min_x, max_x = min(xs) - 4, max(xs) + 4
    min_y, max_y = min(ys) - 4, max(ys) + 4
    dirs = ((1, 0), (-1, 0), (0, 1), (0, -1))
    while q:
        cur = q.popleft()
        for dx, dy in dirs:
            nxt = (cur[0] + dx, cur[1] + dy)
            if nxt in prev:
                continue
            if not (min_x <= nxt[0] <= max_x and min_y <= nxt[1] <= max_y):
                continue
            prev[nxt] = cur
            if nxt == goal:
                path: list[tuple[int, int]] = []
                node: Optional[tuple[int, int]] = goal
                while node is not None:
                    path.append(node)
                    node = prev[node]
                path.reverse()
                return path
            q.append(nxt)
    return None


def _rooms_on_cells(
    conn: sqlite3.Connection, cells: list[tuple[int, int]]
) -> list[str]:
    by_coord: dict[tuple[int, int], str] = {}
    for row in conn.execute(
        "SELECT name, x, y FROM rooms WHERE x IS NOT NULL AND y IS NOT NULL"
    ):
        by_coord[(row["x"], row["y"])] = row["name"]
    names: list[str] = []
    for c in cells:
        if c in by_coord:
            names.append(by_coord[c])
    return names


def _live_agents(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in conn.execute("SELECT * FROM agent_status"):
        keys = row.keys()
        out[row["agent_id"]] = {
            "agent_id": row["agent_id"],
            "state": row["state"],
            "task": row["task"],
            "confidence": row["confidence"],
            "session_id": row["session_id"],
            "detail": row["detail"],
            "updated_at": row["updated_at"],
            "room_id": row["room_id"] if "room_id" in keys else None,
            "sprite_hint": row["sprite_hint"] if "sprite_hint" in keys else None,
        }
    return out


def _agent_home_room(conn: sqlite3.Connection, agent_id: str) -> Optional[str]:
    row = conn.execute(
        "SELECT room_id FROM rooms WHERE occupant_agent_id = ? LIMIT 1",
        (agent_id,),
    ).fetchone()
    return row["room_id"] if row else None


def _resolve_vault() -> Optional[Path]:
    for p in _VAULT_CANDIDATES:
        try:
            if p.is_dir() and os.access(p, os.R_OK):
                return p
        except OSError:
            continue
    return None


def _glob_match(path: str, patterns: list[str]) -> bool:
    # Simple glob: ** and * only
    for pat in patterns:
        rx = (
            re.escape(pat)
            .replace(r"\*\*", "<<<DD>>>")
            .replace(r"\*", "[^/]*")
            .replace("<<<DD>>>", ".*")
        )
        if re.fullmatch(rx, path) or re.fullmatch(rx, path.replace("\\", "/")):
            return True
        # also match suffix paths
        if re.search(rx, path.replace("\\", "/")):
            return True
    return False


# ---------------------------------------------------------------------------
# Phase-1 tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_rooms(
    include_unforged: bool = True,
    lock_state: Optional[str] = None,
) -> str:
    """Inventory Keep rooms and lock/occupant state (Phase-1)."""
    try:
        init_db()
        if lock_state is not None and lock_state not in LOCK_STATES:
            return _err(
                f"lock_state must be one of {sorted(LOCK_STATES)}",
                code="invalid_input",
            )
        with _connect() as conn:
            rows = conn.execute(
                "SELECT * FROM rooms ORDER BY name COLLATE NOCASE"
            ).fetchall()
        rooms = []
        for row in rows:
            if not include_unforged and row["lock_state"] == "UNFORGED":
                continue
            if lock_state is not None and row["lock_state"] != lock_state:
                continue
            r = _row_room(row)
            rooms.append(
                {
                    "room_id": r["room_id"],
                    "name": r["name"],
                    "lock_state": r["lock_state"],
                    "occupant_agent_id": r["occupant_agent_id"],
                    "status_summary": r["status_summary"],
                    "status": r["status"],
                    "coords": r["coords"],
                    "updated_at": r["updated_at"],
                }
            )
        return _ok({"rooms": rooms})
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def report_agent_status(
    agent_id: str,
    state: str,
    task: Optional[str] = None,
    confidence: Optional[float] = None,
    session_id: Optional[str] = None,
    detail: Optional[str] = None,
    room_id: Optional[str] = None,
    sprite_hint: Optional[str] = None,
) -> str:
    """Publish live agent status for the Keep UI (Phase-1 write).

    Optional room_id / sprite_hint feed visual presence (item 1).
    """
    try:
        init_db()
        agent_id = agent_id.strip()
        if not agent_id:
            return _err("agent_id is required", code="invalid_input")
        if state not in AGENT_STATES:
            return _err(
                f"state must be one of {sorted(AGENT_STATES)}",
                code="invalid_input",
            )
        if not _agent_known(agent_id):
            return _err(
                f"Unknown agent_id '{agent_id}' — must match agents/*.agent-spec.json",
                code="unknown_agent",
            )
        if confidence is not None and not (0.0 <= float(confidence) <= 1.0):
            return _err("confidence must be between 0.0 and 1.0", code="invalid_input")
        now = _utc_now()
        # Only set room_id when caller passes it — OpenClaw sync must not
        # stomp presence walks back to home.
        explicit_room = (room_id or "").strip() or None
        explicit_sprite = (sprite_hint or "").strip() or None
        with _connect() as conn:
            home = _agent_home_room(conn, agent_id)
            if explicit_room and not _find_room(conn, explicit_room):
                return _err(
                    f"Unknown room_id '{explicit_room}'",
                    code="unknown_room",
                )
            # Preserve existing presence when not explicitly updated
            prev = conn.execute(
                "SELECT room_id, sprite_hint FROM agent_status WHERE agent_id = ?",
                (agent_id,),
            ).fetchone()
            prev_room = prev["room_id"] if prev else None
            prev_sprite = prev["sprite_hint"] if prev else None
            rid = explicit_room or prev_room or home
            spr = explicit_sprite or prev_sprite
            conn.execute(
                """
                INSERT INTO agent_status (
                  agent_id, state, task, confidence, session_id, detail,
                  updated_at, room_id, sprite_hint
                ) VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(agent_id) DO UPDATE SET
                  state=excluded.state,
                  task=excluded.task,
                  confidence=excluded.confidence,
                  session_id=excluded.session_id,
                  detail=excluded.detail,
                  updated_at=excluded.updated_at,
                  room_id=excluded.room_id,
                  sprite_hint=excluded.sprite_hint
                """,
                (
                    agent_id,
                    state,
                    task,
                    confidence,
                    session_id,
                    (detail or "")[:500] or None,
                    now,
                    rid,
                    spr,
                ),
            )
            with_occ = conn.execute(
                "SELECT room_id FROM rooms WHERE occupant_agent_id = ?",
                (agent_id,),
            ).fetchone()
            # Prefer presence room for summary; fall back to home occupant row
            target_room = rid or (with_occ["room_id"] if with_occ else None)
            if target_room:
                conn.execute(
                    """
                    UPDATE rooms SET status_summary = ?, updated_at = ?
                    WHERE room_id = ?
                    """,
                    ((task or state)[:200], now, target_room),
                )
                if explicit_room:
                    conn.execute(
                        """
                        UPDATE rooms SET occupant_agent_id = ?
                        WHERE room_id = ?
                          AND (occupant_agent_id IS NULL OR occupant_agent_id = '')
                        """,
                        (agent_id, explicit_room),
                    )
                if state == "retired":
                    conn.execute(
                        "UPDATE rooms SET occupant_agent_id = NULL WHERE room_id = ?",
                        (target_room,),
                    )
        return _ok(
            {
                "ok": True,
                "agent_id": agent_id,
                "state": state,
                "room_id": rid,
                "updated_at": now,
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def report_presence(
    room_id: str,
    state: str,
    task_summary: Optional[str] = None,
    sprite_hint: Optional[str] = None,
    agent_id: Optional[str] = None,
    confidence: Optional[float] = None,
    session_id: Optional[str] = None,
) -> str:
    """Publish spatial presence for the visual Keep (feeds agent sprites).

    Maps to agent_status + room status_summary. Does not invent work —
    caller must only report real activity. If agent_id omitted, uses
    current occupant of the room.
    """
    try:
        init_db()
        room_id = room_id.strip()
        if not room_id:
            return _err("room_id is required", code="invalid_input")
        if state not in AGENT_STATES:
            return _err(
                f"state must be one of {sorted(AGENT_STATES)}",
                code="invalid_input",
            )
        with _connect() as conn:
            room = _find_room(conn, room_id)
            if not room:
                return _err(f"Unknown room '{room_id}'", code="unknown_room")
            rid = room["room_id"]
            aid = (agent_id or room["occupant_agent_id"] or "").strip()
            if not aid:
                return _err(
                    "No agent_id and room has no occupant",
                    code="no_agent",
                )
            if not _agent_known(aid):
                return _err(
                    f"Unknown agent_id '{aid}'",
                    code="unknown_agent",
                )
        # Delegate to report_agent_status for single write path
        return report_agent_status(
            agent_id=aid,
            state=state,
            task=task_summary,
            confidence=confidence,
            session_id=session_id,
            detail=f"presence:{rid}",
            room_id=rid,
            sprite_hint=sprite_hint,
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def list_agent_specs(status: Optional[str] = None) -> str:
    """List Agent Specs on disk (id, status, room, path)."""
    try:
        specs = _list_agent_specs()
        out = []
        for aid, path in sorted(specs.items()):
            data, _, err = _load_spec(aid)
            if err or not data:
                out.append(
                    {
                        "agent_id": aid,
                        "status": "invalid",
                        "error": err,
                        "source_path": str(path),
                    }
                )
                continue
            st = data.get("status")
            if status and st != status:
                continue
            room = None
            if isinstance(data.get("room"), dict):
                room = data["room"].get("room_id")
            room = room or data.get("room_id")
            try:
                rel = str(path.relative_to(REPO_ROOT))
            except ValueError:
                rel = str(path)
            out.append(
                {
                    "agent_id": data.get("id", aid),
                    "status": st,
                    "name": data.get("name") or data.get("display_name"),
                    "room_id": room,
                    "source_path": rel,
                }
            )
        return _ok({"specs": out, "count": len(out)})
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_room(room_id: str) -> str:
    """Alias for get_room_status — single room detail for UI / agents."""
    return get_room_status(room_id)


@mcp.tool()
def get_agent_spec(agent_id: str, format: str = "json") -> str:
    """Return Agent Spec JSON or markdown (Phase-1)."""
    try:
        agent_id = agent_id.strip()
        fmt = (format or "json").lower()
        if fmt not in ("json", "markdown"):
            return _err("format must be 'json' or 'markdown'", code="invalid_input")
        if fmt == "markdown":
            md_path = AGENTS_DIR / f"{agent_id}.md"
            if not md_path.is_file():
                return _err(
                    f"No markdown brief at agents/{agent_id}.md",
                    code="not_found",
                )
            return _ok(
                {
                    "agent_id": agent_id,
                    "status": None,
                    "spec": md_path.read_text(encoding="utf-8"),
                    "source_path": str(md_path.relative_to(REPO_ROOT)),
                }
            )
        data, path, err = _load_spec(agent_id)
        if err:
            return _err(err, code="invalid_spec" if path else "unknown_agent")
        assert data is not None and path is not None
        try:
            rel = str(path.relative_to(REPO_ROOT))
        except ValueError:
            rel = str(path)
        return _ok(
            {
                "agent_id": data.get("id", agent_id),
                "status": data.get("status"),
                "spec": data,
                "source_path": rel,
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def query_scoped_knowledge(
    agent_id: str,
    query: str,
    top_k: int = 5,
    indexes: Optional[list[str]] = None,
) -> str:
    """RAG-style query respecting the agent's knowledge_seeds (Phase-1).

    v0: local file snippet search under vault_globs when a vault path exists.
    Refuses indexes not listed on the agent's seeds (scope_denied).
    """
    try:
        agent_id = agent_id.strip()
        query = (query or "").strip()
        if not query:
            return _err("query is required", code="invalid_input")
        top_k = max(1, min(int(top_k or 5), 20))
        data, _, err = _load_spec(agent_id)
        if err or not data:
            return _err(err or "unknown agent", code="unknown_agent")
        seeds = data.get("knowledge_seeds") or {}
        allowed = list(seeds.get("indexes") or [])
        if "general" in allowed:
            allowed = [i for i in allowed if i != "general"]
        if not allowed:
            return _err(
                "Agent has no knowledge_seeds.indexes",
                code="scope_denied",
            )
        requested = list(indexes) if indexes else list(allowed)
        for idx in requested:
            if idx == "general":
                return _err(
                    "'general' is never a valid Keep index",
                    code="scope_denied",
                )
            if idx not in allowed:
                return _err(
                    f"Index '{idx}' not in agent knowledge_seeds {allowed}",
                    code="scope_denied",
                    agent_id=agent_id,
                    allowed_indexes=allowed,
                )
        globs = list(seeds.get("vault_globs") or ["**/*.md"])
        vault = _resolve_vault()
        results: list[dict[str, Any]] = []
        if vault:
            q_terms = [t.lower() for t in re.findall(r"[a-zA-Z0-9_]{3,}", query)]
            scored: list[tuple[float, dict[str, Any]]] = []
            try:
                md_iter = vault.rglob("*.md")
            except OSError:
                md_iter = []
            for path in md_iter:
                try:
                    rel = str(path.relative_to(vault)).replace("\\", "/")
                except (ValueError, OSError):
                    continue
                if not _glob_match(rel, globs):
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                low = text.lower()
                if not q_terms:
                    continue
                hits = sum(low.count(t) for t in q_terms)
                if hits <= 0:
                    continue
                # snippet around first term
                pos = min(
                    (low.find(t) for t in q_terms if low.find(t) >= 0),
                    default=0,
                )
                start = max(0, pos - 80)
                snippet = re.sub(r"\s+", " ", text[start : start + 220]).strip()
                score = min(1.0, hits / (5.0 * len(q_terms)))
                scored.append(
                    (
                        score,
                        {
                            "path": rel,
                            "section": path.stem,
                            "snippet": snippet,
                            "score": round(score, 3),
                            "index": requested[0] if requested else "self",
                        },
                    )
                )
            scored.sort(key=lambda x: -x[0])
            results = [s[1] for s in scored[:top_k]]
        return _ok(
            {
                "agent_id": agent_id,
                "indexes_used": requested,
                "results": results,
                "notes": (
                    "v0 local vault scan"
                    if vault
                    else "No local vault mounted; scope check only. "
                    "Set OBSIDIAN_VAULT or mount /root/obsidian_vault."
                ),
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_cost_summary(
    agent_id: Optional[str] = None,
    month: Optional[str] = None,
) -> str:
    """Per-agent / monthly cost attribution (Phase-1; zeros OK in v0)."""
    try:
        init_db()
        if month:
            if not re.fullmatch(r"\d{4}-\d{2}", month):
                return _err("month must be YYYY-MM", code="invalid_input")
            ym = month
        else:
            ym = datetime.now(timezone.utc).strftime("%Y-%m")
        with _connect() as conn:
            sql = """
              SELECT agent_id, tier, COUNT(*) AS call_count,
                     COALESCE(SUM(est_usd), 0) AS est_usd
              FROM cost_events
              WHERE substr(ts, 1, 7) = ?
            """
            params: list[Any] = [ym]
            if agent_id:
                sql += " AND agent_id = ?"
                params.append(agent_id.strip())
            sql += " GROUP BY agent_id, tier"
            rows = conn.execute(sql, params).fetchall()
        by_agent: dict[str, dict[str, Any]] = {}
        for row in rows:
            aid = row["agent_id"]
            slot = by_agent.setdefault(
                aid,
                {
                    "agent_id": aid,
                    "tier_breakdown": {"local": 0.0, "escalate": 0.0, "god": 0.0},
                    "est_usd": 0.0,
                    "call_count": 0,
                },
            )
            tier = row["tier"] if row["tier"] in ("local", "escalate", "god") else "local"
            usd = float(row["est_usd"] or 0)
            if tier == "local":
                usd = 0.0  # local always $0 marginal
            slot["tier_breakdown"][tier] = slot["tier_breakdown"].get(tier, 0.0) + usd
            slot["est_usd"] += usd
            slot["call_count"] += int(row["call_count"] or 0)
        # Always include requested agent with zeros if missing
        if agent_id and agent_id.strip() not in by_agent:
            by_agent[agent_id.strip()] = {
                "agent_id": agent_id.strip(),
                "tier_breakdown": {"local": 0.0, "escalate": 0.0, "god": 0.0},
                "est_usd": 0.0,
                "call_count": 0,
            }
        agents = sorted(by_agent.values(), key=lambda a: a["agent_id"])
        total = sum(a["est_usd"] for a in agents)
        return _ok(
            {
                "month": ym,
                "currency": "USD",
                "monthly_ceiling": None,
                "total_est_usd": round(total, 4),
                "by_agent": agents,
                "notes": (
                    "v0 may return zeros until cost events are wired (Phase 4)."
                ),
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


# ---------------------------------------------------------------------------
# Spatial telemetry tools
# ---------------------------------------------------------------------------


@mcp.tool()
def get_castle_map() -> str:
    """Full six-room castle map: coords, status, occupancy, live agent info."""
    try:
        init_db()
        with _connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM rooms
                WHERE x IS NOT NULL AND y IS NOT NULL
                ORDER BY y, x
                """
            ).fetchall()
            live = _live_agents(conn)
        rooms: dict[str, Any] = {}
        for row in rows:
            r = _row_room(row)
            occ = r["occupant_agent_id"]
            rooms[r["name"]] = {
                "room_id": r["room_id"],
                "name": r["name"],
                "coords": r["coords"],
                "status": r["status"],
                "lock_state": r["lock_state"],
                "notes": r["notes"],
                "occupant_agent_id": occ,
                "agent": live.get(occ) if occ else None,
                "updated_at": r["updated_at"],
            }
        return _ok(
            {
                "rooms": rooms,
                "room_count": len(rooms),
                "grid": "manhattan-4dir",
                "generated_at": _utc_now(),
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_room_status(room_name: str) -> str:
    """Single room by name (case-insensitive)."""
    try:
        init_db()
        with _connect() as conn:
            row = _find_room(conn, room_name)
            if not row:
                return _err(f"Unknown room '{room_name}'", code="not_found")
            live = _live_agents(conn)
            r = _row_room(row)
            occ = r["occupant_agent_id"]
            r["agent"] = live.get(occ) if occ else None
            return _ok(r)
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_path(from_room: str, to_room: str) -> str:
    """Path between rooms: BFS on 4-dir grid + Manhattan distance.

    Example: get_path("Great Hall", "Vault")
    """
    try:
        init_db()
        with _connect() as conn:
            a = _find_room(conn, from_room)
            b = _find_room(conn, to_room)
            if not a:
                return _err(f"Unknown from_room '{from_room}'", code="not_found")
            if not b:
                return _err(f"Unknown to_room '{to_room}'", code="not_found")
            if a["x"] is None or b["x"] is None:
                return _err(
                    "Both rooms need spatial coordinates for pathing",
                    code="not_spatial",
                )
            start = (int(a["x"]), int(a["y"]))
            goal = (int(b["x"]), int(b["y"]))
            cells = _grid_path(start, goal)
            if cells is None:
                return _err(
                    f"No path from {a['name']} to {b['name']}",
                    code="no_path",
                )
            rooms = _rooms_on_cells(conn, cells)
            steps = [
                {
                    "from": list(cells[i]),
                    "to": list(cells[i + 1]),
                    "dir": _step_dir(cells[i], cells[i + 1]),
                }
                for i in range(len(cells) - 1)
            ]
            return _ok(
                {
                    "from_room": a["name"],
                    "to_room": b["name"],
                    "manhattan": _manhattan(start, goal),
                    "rooms": rooms if rooms else [a["name"], b["name"]],
                    "path_cells": [list(c) for c in cells],
                    "steps": steps,
                    "step_count": len(steps),
                }
            )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


def _step_dir(a: tuple[int, int], b: tuple[int, int]) -> str:
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 1:
        return "east"
    if dx == -1:
        return "west"
    if dy == 1:
        return "north"
    if dy == -1:
        return "south"
    return "unknown"


@mcp.tool()
def rooms_within_distance(room_name: str, max_distance: int) -> str:
    """Rooms within Manhattan distance of room_name, sorted nearest-first.

    Example: rooms_within_distance("Great Hall", 2)
    """
    try:
        init_db()
        max_distance = int(max_distance)
        if max_distance < 0:
            return _err("max_distance must be >= 0", code="invalid_input")
        with _connect() as conn:
            origin = _find_room(conn, room_name)
            if not origin:
                return _err(f"Unknown room '{room_name}'", code="not_found")
            if origin["x"] is None:
                return _err("Room has no coordinates", code="not_spatial")
            o = (int(origin["x"]), int(origin["y"]))
            found: list[dict[str, Any]] = []
            for row in conn.execute(
                "SELECT * FROM rooms WHERE x IS NOT NULL AND y IS NOT NULL"
            ):
                c = (int(row["x"]), int(row["y"]))
                d = _manhattan(o, c)
                if d <= max_distance:
                    found.append(
                        {
                            "name": row["name"],
                            "room_id": row["room_id"],
                            "coords": [row["x"], row["y"]],
                            "distance": d,
                            "status": row["status"],
                            "lock_state": row["lock_state"],
                        }
                    )
            found.sort(key=lambda r: (r["distance"], r["name"]))
            return _ok(
                {
                    "origin": origin["name"],
                    "max_distance": max_distance,
                    "rooms": found,
                    "count": len(found),
                }
            )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_adjacent_rooms(room_name: str) -> str:
    """Rooms with Manhattan distance exactly 1 (4-directional neighbors)."""
    try:
        init_db()
        with _connect() as conn:
            origin = _find_room(conn, room_name)
            if not origin:
                return _err(f"Unknown room '{room_name}'", code="not_found")
            if origin["x"] is None:
                return _err("Room has no coordinates", code="not_spatial")
            o = (int(origin["x"]), int(origin["y"]))
            adj = []
            for row in conn.execute(
                "SELECT * FROM rooms WHERE x IS NOT NULL AND y IS NOT NULL"
            ):
                c = (int(row["x"]), int(row["y"]))
                if _manhattan(o, c) == 1:
                    adj.append(
                        {
                            "name": row["name"],
                            "room_id": row["room_id"],
                            "coords": [row["x"], row["y"]],
                            "status": row["status"],
                        }
                    )
            adj.sort(key=lambda r: r["name"])
            return _ok(
                {
                    "room": origin["name"],
                    "adjacent": adj,
                    "count": len(adj),
                }
            )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_occupancy_summary() -> str:
    """Total agents, rooms by status, restricted rooms flagged."""
    try:
        init_db()
        with _connect() as conn:
            rooms = [
                _row_room(r)
                for r in conn.execute("SELECT * FROM rooms").fetchall()
            ]
            agents = list(_live_agents(conn).values())
        by_status: dict[str, int] = {}
        by_lock: dict[str, int] = {}
        restricted = []
        for r in rooms:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
            by_lock[r["lock_state"]] = by_lock.get(r["lock_state"], 0) + 1
            if r["status"] == "Restricted" or r["lock_state"] == "locked":
                restricted.append(r["name"])
        active_agents = [
            a for a in agents if a["state"] not in ("retired", "idle")
        ]
        return _ok(
            {
                "agent_count": len(agents),
                "active_agent_count": len(active_agents),
                "agents": agents,
                "room_count": len(rooms),
                "rooms_by_status": by_status,
                "rooms_by_lock_state": by_lock,
                "restricted_rooms": restricted,
                "generated_at": _utc_now(),
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


# ---------------------------------------------------------------------------
# Arcane Library Spatial Context Compactor
# ---------------------------------------------------------------------------


@mcp.tool()
def trigger_spatial_compaction(
    room_name: str,
    current_token_count: int,
    max_tokens: int,
    context_snippet: Optional[str] = None,
    force: bool = False,
) -> str:
    """Compact context when near capacity, biased to Keep room coordinates.

    Archives low spatial-relevance material, writes Obsidian note + vector row.
    Default threshold 85% of max_tokens unless force=true.
    """
    try:
        from context_compactor import default_compactor

        ctx = context_snippet or ""
        if not ctx.strip() and not force:
            return _err(
                "context_snippet required unless testing with empty+force",
                code="invalid_input",
            )
        result = default_compactor().compact(
            room_name=room_name,
            current_token_count=int(current_token_count),
            max_tokens=int(max_tokens),
            context=ctx,
            force=bool(force),
            source="mcp:trigger_spatial_compaction",
        )
        # Don't dump full context_after to MCP clients by default (huge)
        if "context_after" in result and len(result.get("context_after") or "") > 2000:
            result = dict(result)
            result["context_after_preview"] = (result.pop("context_after") or "")[:1500]
        return _ok(result)
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def get_compaction_history(room_name: Optional[str] = None, limit: int = 20) -> str:
    """List recent Arcane Library compaction events."""
    try:
        from context_compactor import default_compactor

        return _ok(default_compactor().history(room_name=room_name, limit=limit))
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def query_spatial_memory(
    query: str,
    room_name: Optional[str] = None,
    top_k: int = 5,
) -> str:
    """Vector search over compacted memory, spatially biased to a Keep room."""
    try:
        from context_compactor import default_compactor

        return _ok(
            default_compactor().query_spatial_memory(
                query=query, room_name=room_name, top_k=top_k
            )
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


# ---------------------------------------------------------------------------
# Phase B — human gates (confirm=true required for writes)
# ---------------------------------------------------------------------------


@mcp.tool()
def list_pending_gates(include_resolved: bool = False) -> str:
    """Keep-wide human gates (approve_spec, unlock_room, …)."""
    try:
        import gates as g

        g.refresh_gates_from_sot()
        gates = g.list_pending_gates(include_resolved=include_resolved)
        with _connect() as conn:
            waiting = [
                a
                for a in _live_agents(conn).values()
                if a.get("state") == "waiting_human"
            ]
        return _ok(
            {
                "gates": gates,
                "waiting_human_agents": waiting,
                "count": len(gates),
            }
        )
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def approve_spec(agent_id: str, confirm: bool = False) -> str:
    """GATED: promote Agent Spec to approved on disk. Does not unlock room."""
    try:
        import gates as g

        return _ok(g.approve_spec(agent_id, confirm=confirm))
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


@mcp.tool()
def unlock_room(room_id: str, confirm: bool = False) -> str:
    """GATED: set room lock_state → live (requires approved occupant if any)."""
    try:
        import gates as g

        return _ok(g.unlock_room(room_id, confirm=confirm))
    except Exception as e:  # noqa: BLE001
        return _err(str(e), code="internal_error")


# ---------------------------------------------------------------------------
# Health (for streamable-http ops)
# ---------------------------------------------------------------------------



try:
    from starlette.responses import JSONResponse

    @mcp.custom_route("/health", methods=["GET"])
    async def health(_request):  # type: ignore[no-untyped-def]
        """Liveness for systemd / Tailscale probes."""
        return JSONResponse(
            {
                "status": "ok",
                "service": "ravenstack-keep",
                "transport": "streamable-http",
                "port": int(os.environ.get("KEEP_MCP_PORT", "8110")),
            }
        )
except Exception:  # pragma: no cover
    pass


def main() -> None:
    """Entry: stdio by default; HTTP when KEEP_MCP_TRANSPORT=http."""
    init_db()
    transport = os.environ.get("KEEP_MCP_TRANSPORT", "stdio").lower()
    if transport in ("http", "streamable-http", "sse"):
        host = os.environ.get("KEEP_MCP_HOST", "127.0.0.1")
        port = int(os.environ.get("KEEP_MCP_PORT", "8110"))
        # Bind 127.0.0.1 by default (Tailscale Serve / local). Set
        # KEEP_MCP_HOST=0.0.0.0 only on a private interface.
        mcp.run(transport="http", host=host, port=port)
    else:
        mcp.run()


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------------------
# Manual smoke examples (python -c / REPL after init_db):
#
#   init_db()
#   print(get_castle_map())
#   print(get_path("Great Hall", "Vault"))
#   print(rooms_within_distance("Great Hall", 2))
#   print(list_rooms())
#   print(get_agent_spec("oracle"))
#   print(report_agent_status("oracle", "answering", task="smoke"))
#   print(get_cost_summary(agent_id="oracle"))
# ---------------------------------------------------------------------------
