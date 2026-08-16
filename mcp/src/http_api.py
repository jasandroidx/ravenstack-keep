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
            "sot_note": "Keep MCP spatial HQ + Phase-1 agent status (live SQLite).",
            "version": "keep-mcp-0.4-hq",
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



# ── ReClaw bridge ────────────────────────────────────────────────────────────
#
# The Keep shows what exists and what needs a decision; ReClaw (:8000) owns the
# county queue, jobs and capability gates. The browser cannot call :8000
# directly without CORS and a second hostname, so the Keep proxies a small,
# explicit allow-list. This is deliberately NOT a general proxy: only the
# endpoints below are reachable, so the Keep can never be used to drive
# arbitrary ReClaw routes.
#
# stdlib only — this package depends on fastmcp + jsonschema and nothing else,
# and urlopen runs in a worker thread so it never blocks the event loop.

RECLAW_BASE = os.environ.get("RECLAW_API_BASE", "http://127.0.0.1:8000").rstrip("/")
RECLAW_TIMEOUT = float(os.environ.get("RECLAW_TIMEOUT", "10"))


def _reclaw_call(method: str, path: str, payload: Optional[dict] = None) -> tuple[int, Any]:
    """Blocking call to ReClaw. Returns (status, parsed-or-text)."""
    import urllib.error
    import urllib.request

    url = f"{RECLAW_BASE}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=RECLAW_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw
    except Exception as exc:  # connection refused, DNS, timeout
        return 0, str(exc)


async def _reclaw(method: str, path: str, payload: Optional[dict] = None) -> JSONResponse:
    import asyncio

    status, body = await asyncio.to_thread(_reclaw_call, method, path, payload)
    if status == 0:
        # ReClaw down is a normal state, not a crash — the Keep stays usable.
        return _err("reclaw_unreachable", f"{RECLAW_BASE}: {body}", status=503)
    return _json(body if isinstance(body, (dict, list)) else {"result": body}, status=status)


async def reclaw_state(_: Request) -> JSONResponse:
    """Queue, running/recent jobs, sessions and pending capability gates."""
    return await _reclaw("GET", "/state")


async def reclaw_county_status(_: Request) -> JSONResponse:
    return await _reclaw("GET", "/county-queue/status")


async def reclaw_county_approve(request: Request) -> JSONResponse:
    body, err = await _body(request)
    if err:
        return err
    body = body or {}
    if not body.get("confirm"):
        return _err("confirm_required", "Approving publishes a county package. Send confirm=true.", status=400)
    payload = {"granted_by": body.get("granted_by") or "human:keep"}
    if body.get("publish_formats"):
        payload["publish_formats"] = body["publish_formats"]
    return await _reclaw("POST", "/county-queue/approve", payload)


async def reclaw_county_reject(request: Request) -> JSONResponse:
    body, err = await _body(request)
    if err:
        return err
    body = body or {}
    reason = (body.get("reason") or "").strip()
    if not reason:
        # ReClaw logs the reason into the lessons ledger, so it must be real.
        return _err("reason_required", "Reject needs a reason — it is logged for the next run.", status=400)
    return await _reclaw("POST", "/county-queue/reject", {"reason": reason})


async def reclaw_session_approve(request: Request) -> JSONResponse:
    """Grant one pending capability for one session (the /state gates)."""
    body, err = await _body(request)
    if err:
        return err
    body = body or {}
    session_id = (body.get("session_id") or "").strip()
    capability = (body.get("capability") or "").strip()
    if not session_id or not capability:
        return _err("bad_request", "session_id and capability are required", status=400)
    if not body.get("confirm"):
        return _err("confirm_required", "Granting a capability is a real permission change. Send confirm=true.", status=400)
    # Path segments are user-supplied; refuse anything that could traverse.
    if "/" in session_id or ".." in session_id:
        return _err("bad_request", "invalid session_id", status=400)
    from urllib.parse import quote, urlencode

    qs = urlencode({"capability": capability, "granted_by": "human:keep"})
    return await _reclaw("POST", f"/sessions/{quote(session_id)}/approve?{qs}")


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
    # ReClaw bridge (allow-listed; see _reclaw above)
    Route("/api/reclaw/state", reclaw_state),
    Route("/api/reclaw/county", reclaw_county_status),
    Route("/api/reclaw/county/approve", reclaw_county_approve, methods=["POST"]),
    Route("/api/reclaw/county/reject", reclaw_county_reject, methods=["POST"]),
    Route("/api/reclaw/session/approve", reclaw_session_approve, methods=["POST"]),
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
