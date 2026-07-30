"""Thin HTTP API for the Keep visual shell.

Serves JSON that mirrors Keep MCP tools so a browser can poll status
and invoke gated actions with confirm=true. Not a second control plane —
same KeepStore + specs as the MCP server.

  KEEP_HTTP_PORT=8120 PYTHONPATH=mcp/src .venv/bin/python -m ravenstack_keep_mcp.http_api
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
from starlette.responses import JSONResponse, FileResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from ravenstack_keep_mcp import SERVER_NAME, __version__
from ravenstack_keep_mcp import specs as sp
from ravenstack_keep_mcp.paths import REPO_ROOT
from ravenstack_keep_mcp.store import KeepStore

_store = KeepStore()
UI_DIR = REPO_ROOT / "ui"
UI_DIST = UI_DIR / "dist"
UI_PUBLIC = UI_DIR / "public"


def _json(data: Any, status: int = 200) -> JSONResponse:
    return JSONResponse(data, status_code=status)


def _err(code: str, message: str, status: int = 400, **extra: Any) -> JSONResponse:
    return _json({"error": code, "code": code, "message": message, **extra}, status=status)


def _require_confirm(body: dict[str, Any], action: str) -> Optional[JSONResponse]:
    if body.get("confirm") is True:
        return None
    return _err(
        "confirm_required",
        f"Gated action {action!r} requires confirm=true and explicit human intent.",
        status=403,
        action=action,
    )


async def _json_body(request: Request) -> tuple[Optional[dict[str, Any]], Optional[JSONResponse]]:
    """Parse JSON object body; return (body, error_response)."""
    try:
        body = await request.json()
    except Exception:
        return None, _err("invalid_body", "Request body must be JSON", status=400)
    if not isinstance(body, dict):
        return None, _err("invalid_body", "JSON body must be an object", status=400)
    return body, None


# Detail prefix for status rows written only from pending-gate truth (Track 2).
_SYNC_GATE_DETAIL = "sync:pending_gate"
_SYNC_CLEAR_DETAIL = "sync:gate_cleared"


def sync_status_from_gates() -> dict[str, Any]:
    """Mirror pending human gates into agent_status chips.

    Real signal only (no A2A invention):
    - pending approve_spec → agent waiting_human with gate summary
    - pending unlock_room → occupant waiting_human when room has occupant
    - clear prior sync:pending_gate rows when gate is gone
    """
    pending = _store.list_pending_gates()
    wanted: dict[str, str] = {}
    for g in pending:
        gt = g.get("gate_type")
        subject = g.get("subject_id") or ""
        summary = (g.get("summary") or f"pending {gt}").strip()
        if gt == "approve_spec" and subject:
            wanted[subject] = summary
        elif gt == "unlock_room" and subject:
            room = _store.get_room(subject)
            aid = (room or {}).get("occupant_agent_id")
            if aid:
                wanted[str(aid)] = summary

    updated: list[str] = []
    for agent_id, task in wanted.items():
        cur = _store.get_agent_status(agent_id)
        if (
            cur
            and cur.get("state") == "waiting_human"
            and cur.get("task") == task
            and (cur.get("detail") or "") == _SYNC_GATE_DETAIL
        ):
            continue
        _store.report_agent_status(
            agent_id,
            state="waiting_human",
            task=task[:200],
            detail=_SYNC_GATE_DETAIL,
        )
        updated.append(agent_id)

    cleared: list[str] = []
    for st in _store.list_agent_statuses():
        if st.get("agent_id") in wanted:
            continue
        if (st.get("detail") or "") != _SYNC_GATE_DETAIL:
            continue
        if st.get("state") != "waiting_human":
            continue
        _store.report_agent_status(
            st["agent_id"],
            state="idle",
            task=None,
            detail=_SYNC_CLEAR_DETAIL,
        )
        cleared.append(st["agent_id"])

    return {"ok": True, "waiting": sorted(wanted.keys()), "updated": updated, "cleared": cleared}


async def health(_: Request) -> JSONResponse:
    rooms = _store.list_rooms()
    return _json(
        {
            "status": "ok",
            "service": f"{SERVER_NAME}-http",
            "version": __version__,
            "room_count": len(rooms),
            "spec_count": sp.list_agent_specs()["count"],
            "sot_status": _store.get_meta("sot_status", "CANONICAL"),
        }
    )


async def castle_map(_: Request) -> JSONResponse:
    # Track 2: keep chips truthful vs pending gates without manual curl.
    sync_status_from_gates()
    rooms = _store.list_rooms()
    statuses = {s["agent_id"]: s for s in _store.list_agent_statuses()}
    specs = {a["agent_id"]: a for a in sp.list_agent_specs().get("agents", [])}
    enriched = []
    for r in rooms:
        chip = dict(r)
        aid = r.get("occupant_agent_id")
        st = statuses.get(aid) if aid else None
        spec_meta = specs.get(aid) if aid else None
        chip["agent_state"] = (st or {}).get("state")
        chip["agent_task"] = (st or {}).get("task")
        chip["agent_updated_at"] = (st or {}).get("updated_at")
        chip["spec_status"] = (spec_meta or {}).get("status")  # None = candidate
        chip["spec_valid"] = (spec_meta or {}).get("valid")
        chip["agent_real"] = bool(
            spec_meta
            and spec_meta.get("valid")
            and spec_meta.get("status") in ("approved", "live")
        )
        enriched.append(chip)
    return _json(
        {
            "sot_status": _store.get_meta("sot_status", "CANONICAL"),
            "sot_note": _store.get_meta("sot_note", ""),
            "version": _store.get_meta("castle_map_version", "unknown"),
            "rooms": enriched,
            "agent_statuses": list(statuses.values()),
        }
    )


async def gates(request: Request) -> JSONResponse:
    include = request.query_params.get("include_resolved", "false").lower() == "true"
    gate_list = _store.list_pending_gates(include_resolved=include)
    waiting = _store.list_waiting_human()
    return _json(
        {
            "gates": gate_list,
            "waiting_human_agents": waiting,
            "count": len(gate_list),
        }
    )


async def specs(_: Request) -> JSONResponse:
    return _json(sp.list_agent_specs())


async def report_status(request: Request) -> JSONResponse:
    body, err = await _json_body(request)
    if err:
        return err
    assert body is not None
    agent_id = body.get("agent_id")
    state = body.get("state")
    if not agent_id or not state:
        return _err("invalid_body", "agent_id and state required")
    allowed = {"idle", "answering", "working", "waiting_human", "failed", "retired"}
    if state not in allowed:
        return _err("invalid_state", f"state must be one of {sorted(allowed)}")
    known_spec = sp.load_spec(agent_id)
    if known_spec is None:
        rooms = _store.list_rooms()
        occupants = {r.get("occupant_agent_id") for r in rooms}
        if agent_id not in occupants:
            return _err(
                "unknown_agent",
                f"agent_id={agent_id} has no spec and is not a map occupant",
            )
    result = _store.report_agent_status(
        agent_id=agent_id,
        state=state,
        task=body.get("task"),
        confidence=body.get("confidence"),
        session_id=body.get("session_id"),
        detail=body.get("detail"),
    )
    return _json(result)


async def approve_spec(request: Request) -> JSONResponse:
    body, err = await _json_body(request)
    if err:
        return err
    assert body is not None
    bad = _require_confirm(body, "approve_spec")
    if bad:
        return bad
    agent_id = body.get("agent_id")
    if not agent_id:
        return _err("invalid_body", "agent_id required")
    result = sp.approve_spec_file(agent_id)
    if result.get("ok"):
        _store.append_event("approve_spec", agent_id=agent_id, payload=result)
        for g in _store.list_pending_gates():
            if g["gate_type"] == "approve_spec" and g["subject_id"] == agent_id:
                _store.resolve_gate(g["id"], "approved")
        # Re-sync chips after gate resolve
        sync_status_from_gates()
    status = 200 if result.get("ok") else 400
    return _json(result, status=status)


async def unlock_room(request: Request) -> JSONResponse:
    body, err = await _json_body(request)
    if err:
        return err
    assert body is not None
    bad = _require_confirm(body, "unlock_room")
    if bad:
        return bad
    room_id = body.get("room_id")
    if not room_id:
        return _err("invalid_body", "room_id required")
    room = _store.get_room(room_id)
    if not room:
        return _err("not_found", f"Unknown room_id={room_id}", status=404)
    aid = room.get("occupant_agent_id")
    if aid:
        spec = sp.load_spec(aid)
        if spec and spec.get("status") not in ("approved", "live"):
            return _err(
                "spec_not_approved",
                f"Occupant {aid} status={spec.get('status')}; approve_spec first.",
            )
        if spec:
            from ravenstack_keep_mcp.paths import agents_dir

            spec = dict(spec)
            spec["status"] = "live"
            if isinstance(spec.get("room"), dict):
                spec["room"] = dict(spec["room"])
                spec["room"]["lock_state"] = "live"
            path = agents_dir() / f"{aid}.agent-spec.json"
            path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    updated = _store.update_room(
        room_id,
        lock_state="live",
        status_summary="unlocked by human gate (http)",
    )
    _store.append_event("unlock_room", room_id=room_id, payload={"room": updated})
    for g in _store.list_pending_gates():
        if g["gate_type"] == "unlock_room" and g["subject_id"] == room_id:
            _store.resolve_gate(g["id"], "approved")
    sync_status_from_gates()
    return _json({"ok": True, "room": updated})


async def pipeline(_: Request) -> Response:
    """Serve pipeline edges config (ui data, not SOT)."""
    candidates = [
        UI_DIR / "public" / "pipeline.json",
        UI_PUBLIC / "pipeline.json",
        UI_DIST / "pipeline.json",
    ]
    for path in candidates:
        if path.is_file():
            return FileResponse(path, media_type="application/json")
    return _json({"edges": [], "note": "no pipeline.json yet"})


async def root(_: Request) -> Response:
    index = UI_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    dev = UI_DIR / "index.html"
    if dev.is_file():
        return _json(
            {
                "service": f"{SERVER_NAME}-http",
                "hint": "UI dist not built. Run: cd ui && npm run dev (proxy to this API) or npm run build",
                "api": ["/api/health", "/api/castle-map", "/api/gates"],
            }
        )
    return _err("ui_missing", "No UI found", status=404)


# Root-level Vite public files (request-time so rebuilds do not need new mounts).
_DIST_ROOT_FILES = frozenset(
    {
        "favicon.ico",
        "favicon.svg",
        "pipeline.json",
        "castle_map.json",
        "icons.svg",
    }
)


async def dist_root_file(request: Request) -> Response:
    name = request.path_params["name"]
    if name not in _DIST_ROOT_FILES:
        return Response(status_code=404)
    for base in (UI_DIST, UI_PUBLIC):
        path = base / name
        if path.is_file():
            return FileResponse(path)
    return Response(status_code=404)


async def dist_asset(request: Request) -> Response:
    """Serve Vite hashed assets under /assets/* (path resolved at request time)."""
    rel = request.path_params.get("path", "")
    if not rel or ".." in rel.split("/") or rel.startswith(("/", "\\")):
        return Response(status_code=404)
    path = (UI_DIST / "assets" / rel).resolve()
    assets_root = (UI_DIST / "assets").resolve()
    try:
        path.relative_to(assets_root)
    except ValueError:
        return Response(status_code=404)
    if path.is_file():
        return FileResponse(path)
    return Response(status_code=404)


async def sync_status(_: Request) -> JSONResponse:
    """Optional explicit sync (also runs on GET /api/castle-map)."""
    return _json(sync_status_from_gates())


routes = [
    Route("/", root),
    Route("/api/health", health),
    Route("/api/castle-map", castle_map),
    Route("/api/gates", gates),
    Route("/api/specs", specs),
    Route("/api/pipeline", pipeline),
    Route("/api/sync-status", sync_status, methods=["GET", "POST"]),
    Route("/api/report-status", report_status, methods=["POST"]),
    Route("/api/approve-spec", approve_spec, methods=["POST"]),
    Route("/api/unlock-room", unlock_room, methods=["POST"]),
    Route("/assets/{path:path}", dist_asset),
    Route("/{name:str}", dist_root_file),
]

# Optional Mount fallback if StaticFiles preferred for large trees (kept for /data seed).
if UI_PUBLIC.is_dir():
    routes.append(Mount("/data", app=StaticFiles(directory=UI_PUBLIC), name="public-data"))

app = Starlette(routes=routes)

# Default: Vite dev origin only. Same-origin prod on :8120 needs no CORS.
# Override: KEEP_HTTP_CORS_ORIGINS=http://a,http://b  or * for open (unsafe on network bind).
_cors_raw = os.environ.get(
    "KEEP_HTTP_CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173",
).strip()
_cors_origins = (
    ["*"]
    if _cors_raw == "*"
    else [o.strip() for o in _cors_raw.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def main() -> None:
    import uvicorn

    host = os.environ.get("KEEP_HTTP_HOST", "127.0.0.1")
    port = int(os.environ.get("KEEP_HTTP_PORT", "8120"))
    print(f"Keep visual HTTP API on http://{host}:{port}", file=sys.stderr)
    print(f"  map:   http://{host}:{port}/api/castle-map", file=sys.stderr)
    print(f"  gates: http://{host}:{port}/api/gates", file=sys.stderr)
    print(f"  cors:  {_cors_origins}", file=sys.stderr)
    if host not in ("127.0.0.1", "localhost", "::1") and _cors_origins == ["*"]:
        print(
            "  WARN: non-loopback bind with CORS=* — gated writes lack auth; set KEEP_HTTP_CORS_ORIGINS",
            file=sys.stderr,
        )
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
