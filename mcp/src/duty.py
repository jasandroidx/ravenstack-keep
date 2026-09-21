"""Keep shift board — workplace lights + duty roster from real signals only.

This module never invents work. Every value is derived from a live signal:

  * keep.db `agent_status` (report-presence / report-status / OpenClaw sync)
  * keep.db `pending_gates` (approval / unlock gates)
  * ReClaw API (`/county-queue/status`, `/state`)
  * the Fortress outbox directory (delivered files)
  * the vault library inbox (files awaiting Scribe)

Durable artifacts live beside keep.db in the Keep data dir (mcp/data on Hetzner,
or KEEP_MCP_DATA). The JSON files written here are snapshots of what this module
computes on each call:

  keep-rooms.json  — five workplaces: gate, dock, auction pit, archive, watchtower
  keep-duty.json   — per-agent duty row: last_active, busy|idle|leave, last_real_work

Zero model calls. If a signal source is unreachable the room goes dark
(`"dark"`) — it is never pretended to be clean.

Schema: repo schemas/keep-rooms.schema.json, schemas/keep-duty.schema.json.
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import server as keep

# An agent with no real signal newer than this is off duty.
QUIET_LEAVE = timedelta(days=3)
QUIET_LEAVE_ISO = "P3D"

RECLAW_API_BASE = os.environ.get("RECLAW_API_BASE", "http://127.0.0.1:8000").rstrip("/")
OUTBOX_DIR = Path(os.environ.get("KEEP_OUTBOX_DIR", "/root/outbox"))

BUSY_STATES = frozenset({"working", "answering"})

# Keep data dir is the durable home for these files (env KEEP_MCP_DATA).
DATA_DIR = keep.DATA_DIR
KEEP_ROOMS_PATH = DATA_DIR / "keep-rooms.json"
KEEP_DUTY_PATH = DATA_DIR / "keep-duty.json"

HTTP_TIMEOUT = 3


def _fetch_json(url: str, timeout: int = HTTP_TIMEOUT) -> Optional[dict[str, Any]]:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, dict) else None
    except Exception:  # noqa: BLE001
        return None


def _parse_ts(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _age(ts: Optional[str], now: datetime) -> Optional[timedelta]:
    dt = _parse_ts(ts)
    if dt is None:
        return None
    return now - dt


# ---------------------------------------------------------------------------
# Duty roster
# ---------------------------------------------------------------------------


def _spec_roster() -> list[dict[str, Any]]:
    """Roster is the committed Agent Specs — machine SOT for who is on the Keep."""
    out: list[dict[str, Any]] = []
    for agent_id in sorted(keep._list_agent_specs()):
        data, _, err = keep._load_spec(agent_id)
        if err or not data:
            continue
        room = data.get("room") or {}
        out.append(
            {
                "agent_id": agent_id,
                "name": str(data.get("name") or agent_id),
                "room_id": str(room.get("room_id") or "") or None,
                "room_name": str(room.get("room_name") or "") or None,
            }
        )
    return out


def _duty_row(
    agent: dict[str, Any],
    live: dict[str, dict[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    st = live.get(agent["agent_id"])
    if not st:
        return {
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "room_id": agent["room_id"],
            "room_name": agent["room_name"],
            "status": "leave",
            "last_active": None,
            "last_real_work": None,
            "signal": "no-signal",
        }

    age = _age(st.get("updated_at"), now)
    state = str(st.get("state") or "idle")
    task = str(st.get("task") or "").strip() or str(st.get("detail") or "").strip()

    if age is None or age > QUIET_LEAVE:
        return {
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "room_id": st.get("room_id") or agent["room_id"],
            "room_name": agent["room_name"],
            "status": "leave",
            "last_active": st.get("updated_at"),
            "last_real_work": task or None,
            "signal": "keep:agent_status",
        }

    status = "busy" if state in BUSY_STATES else "idle"
    return {
        "agent_id": agent["agent_id"],
        "name": agent["name"],
        "room_id": st.get("room_id") or agent["room_id"],
        "room_name": agent["room_name"],
        "status": status,
        "last_active": st.get("updated_at"),
        "last_real_work": task or None,
        "signal": "keep:agent_status",
    }


# ---------------------------------------------------------------------------
# Workplaces
# ---------------------------------------------------------------------------


def _watchtower_room(now: datetime) -> dict[str, Any]:
    state = _fetch_json(f"{RECLAW_API_BASE}/state")
    if state is None:
        return {
            "room_id": "watchtower",
            "name": "Watchtower",
            "kind": "fortress health",
            "light": "dark",
            "occupants": [],
            "last_event": None,
            "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "detail": "ReClaw state unreachable — tower unread.",
        }
    services = state.get("services") or {}
    bits = []
    failing = []
    for name in ("reclaw_api", "openclaw", "mcp"):
        svc = services.get(name) or {}
        status = svc.get("status", "unknown")
        bits.append(f"{name}={status}")
        if status not in ("ok",):
            failing.append(name)
    detail = " · ".join(bits)
    light = "busy" if failing else "live"
    last_event = None
    for name in failing:
        svc = services.get(name) or {}
        detail_s = str(svc.get("detail") or "")[:240]
        if detail_s:
            last_event = f"{name}: {detail_s}"
            break
    return {
        "room_id": "watchtower",
        "name": "Watchtower",
        "kind": "fortress health",
        "light": light,
        "occupants": [],
        "last_event": last_event,
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "detail": detail,
    }


def _auction_pit_room(now: datetime) -> dict[str, Any]:
    q = _fetch_json(f"{RECLAW_API_BASE}/county-queue/status")
    if q is None:
        return {
            "room_id": "auction-pit",
            "name": "Auction Pit",
            "kind": "county queue",
            "light": "dark",
            "occupants": [],
            "last_event": None,
            "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "detail": "County queue unreachable — pit unread.",
        }
    status = str(q.get("queue_status") or "idle")
    county = (q.get("current_county") or {}).get("name") or "—"
    remaining = int(q.get("remaining") or 0)
    approved = int(q.get("approved_count") or 0)
    rejected = int(q.get("rejected_count") or 0)
    light = "busy" if status in ("running", "active") else "quiet"
    return {
        "room_id": "auction-pit",
        "name": "Auction Pit",
        "kind": "county queue",
        "light": light,
        "occupants": [],
        "last_event": f"{county} · {remaining} remaining",
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "detail": f"status={status} · {approved} approved · {rejected} rejected · {remaining} remaining",
    }


def _gate_room(now: datetime, conn: Any) -> dict[str, Any]:
    try:
        import gates

        gates.init_gates_table()
        pending = gates.list_pending_gates(include_resolved=False)
    except Exception:  # noqa: BLE001
        pending = []
    gate_count = len(pending)
    waiting = [
        a["agent_id"]
        for a in keep._live_agents(conn).values()
        if a.get("state") == "waiting_human"
    ]
    last_event = None
    if pending:
        newest = max(pending, key=lambda g: str(g.get("created_at") or ""))
        last_event = f"{newest.get('gate_type')} · {str(newest.get('summary') or '')[:160]}"
    light = "busy" if (gate_count > 0 or waiting) else "live"
    detail = f"{gate_count} pending gate(s) · {len(waiting)} waiting_human"
    return {
        "room_id": "gate",
        "name": "Gate",
        "kind": "approvals",
        "light": light,
        "occupants": waiting,
        "last_event": last_event,
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "detail": detail,
    }


def _newest_file(dir_path: Path) -> tuple[int, Optional[Path]]:
    """Return (file_count, newest_file_or_None) for a directory of flat files."""
    if not dir_path.is_dir():
        return 0, None
    items = []
    try:
        for p in dir_path.iterdir():
            if p.is_file() and not p.name.startswith("."):
                items.append(p)
    except OSError:
        return 0, None
    if not items:
        return 0, None
    newest = max(items, key=lambda p: p.stat().st_mtime)
    return len(items), newest


def _dock_room(now: datetime) -> dict[str, Any]:
    count, newest = _newest_file(OUTBOX_DIR)
    if not OUTBOX_DIR.is_dir():
        return {
            "room_id": "dock",
            "name": "Dock",
            "kind": "outbox",
            "light": "dark",
            "occupants": [],
            "last_event": None,
            "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "detail": "Outbox dir unreadable — dock unread.",
        }
    if newest is None:
        return {
            "room_id": "dock",
            "name": "Dock",
            "kind": "outbox",
            "light": "quiet",
            "occupants": [],
            "last_event": None,
            "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "detail": "0 delivered files",
        }
    mtime = datetime.fromtimestamp(newest.stat().st_mtime, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    age = now - datetime.fromtimestamp(newest.stat().st_mtime, tz=timezone.utc)
    light = "live" if age <= QUIET_LEAVE else "quiet"
    return {
        "room_id": "dock",
        "name": "Dock",
        "kind": "outbox",
        "light": light,
        "occupants": [],
        "last_event": f"{newest.name} · {mtime}",
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "detail": f"{count} delivered files",
    }


def _library_inbox_dirs() -> list[Path]:
    return [
        Path(os.environ.get("OBSIDIAN_VAULT", "")) / "Ravenstack" / "incoming" / "library",
        keep.REPO_ROOT / "mcp" / "data" / "incoming" / "library",
    ]


def _vault_root() -> Optional[Path]:
    for cand in (
        os.environ.get("OBSIDIAN_VAULT", ""),
        "/root/obsidian_vault",
    ):
        if cand and Path(cand).is_dir():
            return Path(cand)
    return None


def _archive_room(now: datetime) -> dict[str, Any]:
    now_s = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    readable = [d for d in _library_inbox_dirs() if d.is_dir()]
    if not readable:
        if _vault_root() is not None:
            return {
                "room_id": "archive",
                "name": "Archive",
                "kind": "library inbox",
                "light": "quiet",
                "occupants": [],
                "last_event": None,
                "updated_at": now_s,
                "detail": "No inbox yet — 0 files",
            }
        return {
            "room_id": "archive",
            "name": "Archive",
            "kind": "library inbox",
            "light": "dark",
            "occupants": [],
            "last_event": None,
            "updated_at": now_s,
            "detail": "Library inbox unreadable — archive unread.",
        }
    count, newest = _newest_file(readable[0])
    if count == 0:
        return {
            "room_id": "archive",
            "name": "Archive",
            "kind": "library inbox",
            "light": "live",
            "occupants": [],
            "last_event": None,
            "updated_at": now_s,
            "detail": "Inbox caught up — 0 files",
        }
    mtime = datetime.fromtimestamp(newest.stat().st_mtime, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    return {
        "room_id": "archive",
        "name": "Archive",
        "kind": "library inbox",
        "light": "busy",
        "occupants": [],
        "last_event": f"{newest.name} · {mtime}",
        "updated_at": now_s,
        "detail": f"{count} file(s) awaiting Scribe",
    }


def _collect_rooms(now: datetime, conn: Any) -> list[dict[str, Any]]:
    rooms = [_gate_room(now, conn), _dock_room(now), _auction_pit_room(now)]
    rooms.append(_archive_room(now))
    rooms.append(_watchtower_room(now))
    return rooms


# ---------------------------------------------------------------------------
# Compose + persist
# ---------------------------------------------------------------------------


def freshen_signals() -> dict[str, Any]:
    """Re-read live signal mirrors (OpenClaw sessions, pending gates)."""
    results: dict[str, Any] = {}
    try:
        from openclaw_sync import sync_openclaw_status

        results["openclaw"] = sync_openclaw_status()
    except Exception as e:  # noqa: BLE001
        results["openclaw_error"] = str(e)
    try:
        import gates

        results["gates"] = gates.refresh_gates_from_sot()
        results["gates_sync"] = gates.sync_status_from_gates()
    except Exception as e:  # noqa: BLE001
        results["gates_error"] = str(e)
    return results


def compose_duty_payload() -> dict[str, Any]:
    """Compute the full shift board from live signals and persist snapshots."""
    keep.init_db()
    freshen_signals()
    now = datetime.now(timezone.utc)
    with keep._connect() as conn:
        live = keep._live_agents(conn)
        duty = [_duty_row(a, live, now) for a in _spec_roster()]
        rooms = _collect_rooms(now, conn)

    duty_payload = {
        "schema": "keep-duty.v1",
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "quiet_leave_after": QUIET_LEAVE_ISO,
        "source": "live",
        "agents": duty,
    }
    rooms_payload = {
        "schema": "keep-rooms.v1",
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "live",
        "rooms": rooms,
    }

    _write_json(KEEP_DUTY_PATH, duty_payload)
    _write_json(KEEP_ROOMS_PATH, rooms_payload)

    return {
        "schema": "keep-boards.v1",
        "generated_at": duty_payload["generated_at"],
        "quiet_leave_after": QUIET_LEAVE_ISO,
        "source": "live",
        "rooms": rooms,
        "duty": duty,
    }


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def read_keep_rooms() -> Optional[dict[str, Any]]:
    if not KEEP_ROOMS_PATH.is_file():
        return None
    try:
        return json.loads(KEEP_ROOMS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def read_keep_duty() -> Optional[dict[str, Any]]:
    if not KEEP_DUTY_PATH.is_file():
        return None
    try:
        return json.loads(KEEP_DUTY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None