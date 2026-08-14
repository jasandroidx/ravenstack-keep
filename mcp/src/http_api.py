"""Thin HTTP API for the Keep visual shell (Phaser UI).

Same SQLite as Keep MCP (mcp/data/keep.db). Not a second control plane.

  KEEP_HTTP_PORT=8120 python mcp/src/http_api.py
  → http://127.0.0.1:8120/api/health
  → http://127.0.0.1:8120/api/castle-map
  → http://127.0.0.1:8120/  (SPA if ui/dist exists)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

# Import Keep MCP store helpers (same package dir)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import server as keep  # noqa: E402

REPO_ROOT = keep.REPO_ROOT
UI_DIR = REPO_ROOT / "ui"
UI_DIST = UI_DIR / "dist"
UI_PUBLIC = UI_DIR / "public"

# Grid [x,y] → pixel layout for Phaser (top-down map)
_PX_ORIGIN = (420, 360)
_PX_SCALE = (200, 170)


def _grid_to_px(gx: Optional[int], gy: Optional[int]) -> tuple[int, int]:
    if gx is None or gy is None:
        return (420, 360)
    return (
        int(_PX_ORIGIN[0] + gx * _PX_SCALE[0]),
        int(_PX_ORIGIN[1] - gy * _PX_SCALE[1]),
    )


def _json(data: Any, status: int = 200) -> JSONResponse:
    return JSONResponse(data, status_code=status)


def _err(code: str, message: str, status: int = 400, **extra: Any) -> JSONResponse:
    return _json({"error": code, "code": code, "message": message, **extra}, status=status)


async def _body(request: Request) -> tuple[Optional[dict[str, Any]], Optional[JSONResponse]]:
    try:
        body = await request.json()
    except Exception:
        return None, _err("invalid_body", "Request body must be JSON")
    if not isinstance(body, dict):
        return None, _err("invalid_body", "JSON body must be an object")
    return body, None


async def health(_: Request) -> JSONResponse:
    keep.init_db()
    with keep._connect() as conn:
        n = conn.execute("SELECT COUNT(*) AS c FROM rooms").fetchone()["c"]
    return _json(
        {
            "status": "ok",
            "service": "ravenstack-keep-http",
            "mcp": "http://127.0.0.1:8110/mcp",
            "room_count": n,
            "sot_status": "CANONICAL",
        }
    )


async def castle_map(_: Request) -> JSONResponse:
    """UI-shaped map: rooms[] with pixel x/y + agent chips."""
    keep.init_db()
    # Phase A: OpenClaw sessions → chips
    try:
        from openclaw_sync import sync_openclaw_status

        sync_openclaw_status()
    except Exception:
        pass
    # Phase B: pending gates → waiting_human + inbox
    try:
        import gates as g

        g.refresh_gates_from_sot()
        g.sync_status_from_gates()
    except Exception:
        pass
    with keep._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM rooms ORDER BY name COLLATE NOCASE"
        ).fetchall()
        live = keep._live_agents(conn)
    specs = keep._list_agent_specs()
    rooms_out = []
    for row in rows:
        r = keep._row_room(row)
        px, py = _grid_to_px(r["x"], r["y"])
        aid = r.get("occupant_agent_id")
        st = live.get(aid) if aid else None
        spec_path = specs.get(aid) if aid else None
        spec_status = None
        spec_valid = None
        if spec_path:
            try:
                data = json.loads(spec_path.read_text(encoding="utf-8"))
                spec_status = data.get("status")
                spec_valid = True
            except Exception:
                spec_valid = False
        rooms_out.append(
            {
                "room_id": r["room_id"],
                "name": r["name"],
                "lock_state": r["lock_state"],
                "status": r["status"],
                "x": px,
                "y": py,
                "grid": r["coords"],
                "occupant_agent_id": aid,
                "status_summary": r.get("status_summary") or r.get("notes") or "",
                "queue_depth": 0,
                "updated_at": r.get("updated_at"),
                "agent_state": (st or {}).get("state"),
                "agent_task": (st or {}).get("task"),
                "agent_updated_at": (st or {}).get("updated_at"),
                "spec_status": spec_status,
                "spec_valid": spec_valid,
                "agent_real": bool(
                    spec_valid and spec_status in ("approved", "live")
                ),
            }
        )
    return _json(
        {
            "sot_status": "CANONICAL",
            "sot_note": "Keep MCP spatial six + Phase-1 agent status (live SQLite).",
            "version": "keep-hq-0.4-suikoden",
            "rooms": rooms_out,
            "agent_statuses": list(live.values()),
        }
    )


async def gates(request: Request) -> JSONResponse:
    import gates as g

    include = request.query_params.get("include_resolved", "false").lower() == "true"
    try:
        g.refresh_gates_from_sot()
        g.sync_status_from_gates()
    except Exception:
        pass
    gate_list = g.list_pending_gates(include_resolved=include)
    with keep._connect() as conn:
        waiting = [
            a
            for a in keep._live_agents(conn).values()
            if a.get("state") == "waiting_human"
        ]
    return _json(
        {
            "gates": gate_list,
            "waiting_human_agents": waiting,
            "count": len(gate_list),
        }
    )


async def approve_spec_http(request: Request) -> JSONResponse:
    import gates as g

    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    agent_id = body.get("agent_id") or body.get("subject_id")
    if not agent_id:
        return _err("invalid_input", "agent_id required")
    result = g.approve_spec(str(agent_id), confirm=body.get("confirm") is True)
    if result.get("error") or result.get("ok") is False:
        code = 403 if result.get("code") == "confirm_required" else 400
        return _json(result, status=code)
    g.sync_status_from_gates()
    return _json(result)


async def unlock_room_http(request: Request) -> JSONResponse:
    import gates as g

    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    room_id = body.get("room_id") or body.get("subject_id")
    if not room_id:
        return _err("invalid_input", "room_id required")
    result = g.unlock_room(str(room_id), confirm=body.get("confirm") is True)
    if result.get("error") or result.get("ok") is False:
        code = 403 if result.get("code") == "confirm_required" else 400
        return _json(result, status=code)
    g.sync_status_from_gates()
    return _json(result)


async def occupancy(_: Request) -> JSONResponse:
    try:
        from openclaw_sync import sync_openclaw_status

        sync_openclaw_status()
    except Exception:
        pass
    return _json(json.loads(keep.get_occupancy_summary()))


async def sync_openclaw(_: Request) -> JSONResponse:
    """Force OpenClaw → Keep status sync (for debugging / external timers)."""
    try:
        from openclaw_sync import sync_openclaw_status

        return _json(sync_openclaw_status())
    except Exception as e:  # noqa: BLE001
        return _err("sync_failed", str(e), status=500)


async def path(request: Request) -> JSONResponse:
    q = request.query_params
    fr = q.get("from") or q.get("from_room")
    to = q.get("to") or q.get("to_room")
    if not fr or not to:
        return _err("invalid_input", "from and to query params required")
    return _json(json.loads(keep.get_path(fr, to)))


async def report_status(request: Request) -> JSONResponse:
    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    agent_id = body.get("agent_id")
    state = body.get("state")
    if not agent_id or not state:
        return _err("invalid_input", "agent_id and state required")
    raw = keep.report_agent_status(
        str(agent_id),
        str(state),
        task=body.get("task"),
        confidence=body.get("confidence"),
        session_id=body.get("session_id"),
        detail=body.get("detail"),
    )
    data = json.loads(raw)
    if data.get("error"):
        return _json(data, status=400)
    return _json(data)


async def specs(_: Request) -> JSONResponse:
    agents = []
    for aid, path in keep._list_agent_specs().items():
        data, _, err = keep._load_spec(aid)
        agents.append(
            {
                "agent_id": aid,
                "path": str(path),
                "status": (data or {}).get("status") if data else None,
                "valid": err is None and data is not None,
                "error": err,
            }
        )
    return _json({"agents": agents, "count": len(agents)})


# ---------------------------------------------------------------------------
# Suikoden-HQ chambers — read-only. Every field below is measured or absent.
# If a source cannot be reached we say so; we never synthesise a number.
# ---------------------------------------------------------------------------

OLLAMA_URL = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")


def _hq_rank(rooms: list[dict[str, Any]], officers: list[dict[str, Any]]) -> dict[str, Any]:
    """HQ rank from live rooms + real officers. Suikoden-style castle level."""
    live_rooms = [r for r in rooms if r.get("lock_state") == "live"]
    real = [o for o in officers if o.get("real")]
    score = len(live_rooms) + len(real)
    if score >= 16:
        rank, title = 5, "Fortress"
    elif score >= 12:
        rank, title = 4, "Citadel"
    elif score >= 9:
        rank, title = 3, "Keep"
    elif score >= 6:
        rank, title = 2, "Hold"
    else:
        rank, title = 1, "Waystation"
    nxt = {1: 6, 2: 9, 3: 12, 4: 16, 5: None}[rank]
    return {
        "rank": rank,
        "title": title,
        "score": score,
        "live_rooms": len(live_rooms),
        "sealed_rooms": len([r for r in rooms if r.get("lock_state") == "UNFORGED"]),
        "locked_rooms": len([r for r in rooms if r.get("lock_state") == "locked"]),
        "total_rooms": len(rooms),
        "officers_real": len(real),
        "next_rank_at": nxt,
        "to_next": (nxt - score) if nxt else 0,
        "basis": "live rooms + officers with an approved/live Spec",
    }


def _officer_roster() -> list[dict[str, Any]]:
    """Officers from Agent Specs on disk + their live status row."""
    out: list[dict[str, Any]] = []
    with keep._connect() as conn:
        live = keep._live_agents(conn)
        rooms = {
            r["occupant_agent_id"]: r["room_id"]
            for r in (keep._row_room(x) for x in conn.execute("SELECT * FROM rooms"))
            if r["occupant_agent_id"]
        }
    for aid in sorted(keep._list_agent_specs()):
        data, _path, err = keep._load_spec(aid)
        status = (data or {}).get("status")
        st = live.get(aid) or {}
        out.append(
            {
                "agent_id": aid,
                "spec_status": status,
                "spec_valid": err is None and data is not None,
                "real": bool(err is None and status in ("approved", "live")),
                "state": st.get("state"),
                "task": st.get("task"),
                "updated_at": st.get("updated_at"),
                "room_id": rooms.get(aid),
            }
        )
    return out


async def hq(_: Request) -> JSONResponse:
    keep.init_db()
    with keep._connect() as conn:
        rooms = [keep._row_room(r) for r in conn.execute("SELECT * FROM rooms")]
    officers = _officer_roster()
    return _json({"hq": _hq_rank(rooms, officers), "officers": officers})


async def kitchen(_: Request) -> JSONResponse:
    """The hearth: local models we can actually see. No pretend GPU meters."""
    import urllib.request

    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=2.0) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        return _json(
            {
                "source": "ollama",
                "reachable": False,
                "models": [],
                "count": 0,
                "note": f"no hearth source — {OLLAMA_URL} unreachable ({e.__class__.__name__})",
            }
        )
    models = []
    for m in data.get("models", []):
        name = m.get("name") or m.get("model")
        if not name:
            continue
        models.append(
            {
                "name": name,
                "size_bytes": m.get("size"),
                "family": (m.get("details") or {}).get("family"),
                "parameter_size": (m.get("details") or {}).get("parameter_size"),
                "local": not str(name).endswith(":cloud"),
            }
        )
    models.sort(key=lambda m: (not m["local"], m["name"]))
    return _json(
        {
            "source": "ollama",
            "reachable": True,
            "endpoint": OLLAMA_URL,
            "models": models,
            "count": len(models),
            "local_count": sum(1 for m in models if m["local"]),
            "note": "cost-free routing inventory — local models run on the fortress",
        }
    )


async def clock(_: Request) -> JSONResponse:
    """The pulse: real agent_status heartbeats. No source -> say so."""
    keep.init_db()
    with keep._connect() as conn:
        rows = list(
            conn.execute(
                "SELECT agent_id, state, task, updated_at FROM agent_status "
                "ORDER BY updated_at DESC"
            )
        )
    if not rows:
        return _json(
            {
                "has_pulse": False,
                "ticks": [],
                "count": 0,
                "note": "no pulse source — nothing has reported agent status yet",
            }
        )
    ticks = [
        {
            "agent_id": r["agent_id"],
            "state": r["state"],
            "task": r["task"],
            "at": r["updated_at"],
        }
        for r in rows
    ]
    return _json(
        {
            "has_pulse": True,
            "last_tick": ticks[0]["at"],
            "last_agent": ticks[0]["agent_id"],
            "ticks": ticks,
            "count": len(ticks),
            "note": "measured from Keep agent_status writes (real heartbeats only)",
        }
    )


async def round_table(_: Request) -> JSONResponse:
    """Council status. Read-only until the wing is stamped."""
    keep.init_db()
    with keep._connect() as conn:
        row = keep._find_room(conn, "round-table")
        lock = row["lock_state"] if row else None
    officers = _officer_roster()
    seated = [o for o in officers if o["real"]]
    forged = lock == "live"
    return _json(
        {
            "room_id": "round-table",
            "exists": row is not None,
            "lock_state": lock,
            "forged": forged,
            "seats": len(seated),
            "seated": [o["agent_id"] for o in seated],
            "note": (
                "Council is live — sit the table to open a question."
                if forged
                else "Council is UNFORGED — stamp the room after a Spec."
            ),
            "spend": "none — no multi-model routing is wired",
        }
    )


def _spa_index() -> Optional[Path]:
    for base in (UI_DIST, UI_PUBLIC):
        idx = base / "index.html"
        if idx.is_file():
            return idx
    return None


async def spa_or_root(_: Request) -> Response:
    idx = _spa_index()
    if idx:
        return FileResponse(idx)
    return _json(
        {
            "service": "ravenstack-keep-http",
            "hint": "UI not built — run npm run build in ui/",
            "api": ["/api/health", "/api/castle-map", "/api/path", "/api/report-status"],
        }
    )


async def static_fallback(request: Request) -> Response:
    """Serve files from ui/dist then ui/public (pipeline.json, assets)."""
    rel = request.path_params.get("path", "")
    if ".." in rel:
        return _err("invalid_path", "bad path", status=400)
    for base in (UI_DIST, UI_PUBLIC):
        cand = (base / rel).resolve()
        try:
            cand.relative_to(base.resolve())
        except ValueError:
            continue
        if cand.is_file():
            return FileResponse(cand)
    return _err("not_found", f"No file {rel}", status=404)


routes = [
    Route("/api/health", health),
    Route("/health", health),
    Route("/api/castle-map", castle_map),
    Route("/api/gates", gates),
    Route("/api/occupancy", occupancy),
    Route("/api/sync-openclaw", sync_openclaw),
    Route("/api/path", path),
    Route("/api/report-status", report_status, methods=["POST"]),
    Route("/api/approve-spec", approve_spec_http, methods=["POST"]),
    Route("/api/unlock-room", unlock_room_http, methods=["POST"]),
    Route("/api/specs", specs),
    # Suikoden-HQ chambers (read-only)
    Route("/api/hq", hq),
    Route("/api/kitchen", kitchen),
    Route("/api/clock", clock),
    Route("/api/round-table", round_table),
    Route("/", spa_or_root),
    Route("/{path:path}", static_fallback),
]

app = Starlette(routes=routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def main() -> None:
    import uvicorn

    keep.init_db()
    host = os.environ.get("KEEP_HTTP_HOST", "127.0.0.1")
    port = int(os.environ.get("KEEP_HTTP_PORT", "8120"))
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
