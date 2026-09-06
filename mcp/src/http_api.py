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
import re
import sys
import uuid
from datetime import datetime, timezone
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

# Scribe drop zone — sandboxed under vault (or local keep data)
_UPLOAD_MAX_BYTES = int(os.environ.get("KEEP_UPLOAD_MAX_BYTES", str(25 * 1024 * 1024)))
_UPLOAD_ALLOWED_EXT = {
    ".md",
    ".txt",
    ".pdf",
    ".epub",
    ".html",
    ".htm",
    ".json",
    ".csv",
    ".docx",  # may need later extract; still accepted as drop
}


def _upload_root() -> Path:
    """Prefer Obsidian vault incoming/library; fallback keep/data/incoming."""
    env = os.environ.get("KEEP_UPLOAD_DIR")
    if env:
        p = Path(env)
        p.mkdir(parents=True, exist_ok=True)
        return p
    for base in (
        Path(os.environ.get("OBSIDIAN_VAULT", "/root/obsidian_vault")),
        Path.home() / "obsidian_vault",
        REPO_ROOT / "mcp" / "data",
    ):
        if base.is_dir() or str(base).startswith("/root/obsidian"):
            root = base / "Ravenstack" / "incoming" / "library"
            try:
                root.mkdir(parents=True, exist_ok=True)
                return root
            except OSError:
                continue
    root = REPO_ROOT / "mcp" / "data" / "incoming" / "library"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_filename(name: str) -> str:
    base = Path(name).name
    base = re.sub(r"[^\w.\- ()\[\]]+", "_", base).strip("._") or "drop.bin"
    if len(base) > 120:
        stem, suf = Path(base).stem[:80], Path(base).suffix[:20]
        base = stem + suf
    return base

# Grid [x,y] → pixel layout for Phaser (128px rooms + gaps)
_PX_ORIGIN = (480, 420)
_PX_SCALE = (168, 156)  # center-to-center spacing for 128px rooms


def _grid_to_px(gx: Optional[int], gy: Optional[int]) -> tuple[int, int]:
    if gx is None or gy is None:
        return (480, 420)
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
    def _spec_meta(agent_id: Optional[str]) -> tuple[Any, Any, bool]:
        if not agent_id:
            return None, None, False
        sp = specs.get(agent_id)
        if not sp:
            return None, None, False
        try:
            data = json.loads(sp.read_text(encoding="utf-8"))
            stt = data.get("status")
            return stt, True, bool(stt in ("approved", "live"))
        except Exception:
            return None, False, False

    rooms_out = []
    for row in rows:
        r = keep._row_room(row)
        px, py = _grid_to_px(r["x"], r["y"])
        aid = r.get("occupant_agent_id")
        agent_ids = list(r.get("agent_ids") or ([aid] if aid else []))
        st = live.get(aid) if aid else None
        presence_room = (st or {}).get("room_id") if st else None
        spec_status, spec_valid, agent_real = _spec_meta(aid)

        occupants_out = []
        for oid in agent_ids:
            ost = live.get(oid)
            sst, sval, real = _spec_meta(oid)
            occupants_out.append(
                {
                    "agent_id": oid,
                    "agent_state": (ost or {}).get("state"),
                    "agent_task": (ost or {}).get("task"),
                    "sprite_hint": (ost or {}).get("sprite_hint") or oid,
                    "presence_room_id": (ost or {}).get("room_id") or r["room_id"],
                    "spec_status": sst,
                    "spec_valid": sval,
                    "agent_real": real,
                }
            )

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
                "co_occupants": r.get("co_occupants") or [],
                "agent_ids": agent_ids,
                "occupants": occupants_out,
                "status_summary": r.get("status_summary") or r.get("notes") or "",
                "queue_depth": 0,
                "updated_at": r.get("updated_at"),
                "agent_state": (st or {}).get("state"),
                "agent_task": (st or {}).get("task"),
                "agent_updated_at": (st or {}).get("updated_at"),
                "sprite_hint": (st or {}).get("sprite_hint"),
                "presence_room_id": presence_room,
                "model_tier": "local",
                "spec_status": spec_status,
                "spec_valid": spec_valid,
                "agent_real": agent_real,
            }
        )
    return _json(
        {
            "sot_status": "CANONICAL",
            "sot_note": "Keep MCP spatial six + Library multi-occupant + presence.",
            "version": "keep-mcp-0.3-library-duo",
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "poll_interval_sec": 3,
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
        room_id=body.get("room_id"),
        sprite_hint=body.get("sprite_hint"),
    )
    data = json.loads(raw)
    if data.get("error"):
        return _json(data, status=400)
    return _json(data)


async def report_presence_http(request: Request) -> JSONResponse:
    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    room_id = body.get("room_id")
    state = body.get("state")
    if not room_id or not state:
        return _err("invalid_input", "room_id and state required")
    raw = keep.report_presence(
        str(room_id),
        str(state),
        task_summary=body.get("task_summary") or body.get("task"),
        sprite_hint=body.get("sprite_hint"),
        agent_id=body.get("agent_id"),
        confidence=body.get("confidence"),
        session_id=body.get("session_id"),
    )
    data = json.loads(raw)
    if data.get("error"):
        return _json(data, status=400)
    return _json(data)


async def cost_summary(request: Request) -> JSONResponse:
    agent_id = request.query_params.get("agent_id")
    month = request.query_params.get("month")
    raw = keep.get_cost_summary(agent_id=agent_id, month=month)
    return _json(json.loads(raw))


async def specs(_: Request) -> JSONResponse:
    raw = keep.list_agent_specs()
    return _json(json.loads(raw))


async def library_inbox(_: Request) -> JSONResponse:
    """List files waiting for Scribe in the Library drop zone."""
    root = _upload_root()
    items = []
    try:
        for p in sorted(root.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if not p.is_file() or p.name.startswith("."):
                continue
            st = p.stat()
            items.append(
                {
                    "name": p.name,
                    "bytes": st.st_size,
                    "modified": datetime.fromtimestamp(
                        st.st_mtime, tz=timezone.utc
                    ).isoformat(),
                    "rel_path": f"Ravenstack/incoming/library/{p.name}",
                    "abs_path": str(p),
                }
            )
    except OSError as e:
        return _err("inbox_error", str(e), status=500)
    return _json(
        {
            "inbox_dir": str(root),
            "rel_root": "Ravenstack/incoming/library",
            "count": len(items),
            "files": items[:100],
            "agent": "scribe",
            "notes": "Upload is operator action only. Scribe triage still needs command/approval.",
        }
    )


async def compact_http(request: Request) -> JSONResponse:
    """Trigger Arcane spatial compaction (Library / any Keep room)."""
    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    room = str(body.get("room_name") or body.get("room") or "library")
    try:
        cur = int(body.get("current_token_count") or body.get("tokens") or 0)
        mx = int(body.get("max_tokens") or 8000)
    except (TypeError, ValueError):
        return _err("invalid_input", "token counts must be integers")
    snippet = body.get("context_snippet") or body.get("context") or ""
    force = body.get("force") is True
    raw = keep.trigger_spatial_compaction(
        room,
        cur,
        mx,
        context_snippet=str(snippet) if snippet is not None else "",
        force=force,
    )
    data = json.loads(raw)
    if data.get("error"):
        return _json(data, status=400)
    return _json(data)


async def compact_history_http(request: Request) -> JSONResponse:
    room = request.query_params.get("room_name") or request.query_params.get("room")
    try:
        limit = int(request.query_params.get("limit") or 20)
    except ValueError:
        limit = 20
    raw = keep.get_compaction_history(room_name=room, limit=limit)
    return _json(json.loads(raw))


async def spatial_memory_http(request: Request) -> JSONResponse:
    q = request.query_params.get("q") or request.query_params.get("query") or ""
    room = request.query_params.get("room_name") or request.query_params.get("room")
    try:
        top_k = int(request.query_params.get("top_k") or 5)
    except ValueError:
        top_k = 5
    raw = keep.query_spatial_memory(query=q, room_name=room, top_k=top_k)
    data = json.loads(raw)
    if data.get("error"):
        return _json(data, status=400)
    return _json(data)


async def library_upload(request: Request) -> JSONResponse:
    """Receive operator file picks for Scribe (multipart field 'files' or 'file').

    Writes only under Ravenstack/incoming/library/. Does NOT vault-write to knowledge/
    and does NOT invent agent work — optionally pings Scribe presence with a task note.
    """
    root = _upload_root()
    try:
        form = await request.form()
    except Exception as e:  # noqa: BLE001
        return _err("invalid_body", f"Expected multipart form: {e}", status=400)

    agent_id = str(form.get("agent_id") or "scribe").strip() or "scribe"
    note = str(form.get("note") or "").strip()
    auto_raw = str(form.get("auto_distill") or form.get("distill") or "1").strip().lower()
    auto_distill = auto_raw not in ("0", "false", "no", "off")
    raw_files = form.getlist("files")
    if not raw_files:
        one = form.get("file")
        raw_files = [one] if one is not None else []

    if not raw_files:
        return _err("invalid_body", "No files in form field 'files' or 'file'")

    saved: list[dict[str, Any]] = []
    errors: list[str] = []
    day = datetime.now(timezone.utc).strftime("%Y%m%d")

    for item in raw_files:
        if item is None:
            continue
        # Starlette UploadFile has .filename and .read()
        filename = getattr(item, "filename", None) or "drop.bin"
        safe = _safe_filename(str(filename))
        ext = Path(safe).suffix.lower()
        if ext not in _UPLOAD_ALLOWED_EXT:
            errors.append(f"{safe}: extension not allowed ({ext or 'none'})")
            continue
        try:
            data = await item.read()
        except Exception as e:  # noqa: BLE001
            errors.append(f"{safe}: read failed ({e})")
            continue
        if len(data) > _UPLOAD_MAX_BYTES:
            errors.append(
                f"{safe}: exceeds max {_UPLOAD_MAX_BYTES} bytes"
            )
            continue
        if len(data) == 0:
            errors.append(f"{safe}: empty file")
            continue
        # Unique path
        dest_name = f"{day}_{uuid.uuid4().hex[:8]}_{safe}"
        dest = root / dest_name
        try:
            dest.write_bytes(data)
        except OSError as e:
            errors.append(f"{safe}: write failed ({e})")
            continue
        rel = f"Ravenstack/incoming/library/{dest_name}"
        saved.append(
            {
                "original_name": safe,
                "stored_name": dest_name,
                "bytes": len(data),
                "rel_path": rel,
                "abs_path": str(dest),
            }
        )

    if not saved and errors:
        return _json(
            {"ok": False, "error": "upload_failed", "errors": errors, "saved": []},
            status=400,
        )

    # Optional: notify map that Scribe has work waiting (operator-authored task text)
    presence = None
    if saved and agent_id:
        names = ", ".join(s["original_name"] for s in saved[:3])
        if len(saved) > 3:
            names += f" +{len(saved) - 3} more"
        task = note or f"Inbox drop: {names} — triage USEFUL|WEAK|NOISE"
        try:
            raw = keep.report_presence(
                "library",
                "waiting_human",
                task_summary=task[:200],
                sprite_hint="scribe",
                agent_id=agent_id,
            )
            presence = json.loads(raw)
        except Exception as e:  # noqa: BLE001
            presence = {"error": str(e)}

    distill_result = None
    if saved and auto_distill:
        import library_distill_runner as ldr

        try:
            keep.report_presence(
                "library",
                "working",
                task_summary="library-distill after upload…",
                sprite_hint="scribe",
                agent_id=agent_id,
            )
        except Exception:
            pass
        distill_result = ldr.distill_inbox(
            names=[s["stored_name"] for s in saved],
            limit=len(saved),
        )
        try:
            n = distill_result.get("count") or 0
            keep.report_presence(
                "library",
                "idle",
                task_summary=f"Distilled {n} drop(s)",
                sprite_hint="scribe",
                agent_id=agent_id,
            )
        except Exception:
            pass

    return _json(
        {
            "ok": True,
            "saved": saved,
            "errors": errors,
            "inbox_dir": str(root),
            "agent_id": agent_id,
            "presence": presence,
            "auto_distill": auto_distill,
            "distill": distill_result,
            "next_step": (
                "Uploaded"
                + (" and distilled (library-distill local-batch)." if distill_result else ".")
                + " Check library/inbox or library/pointers."
            ),
        }
    )


async def library_distill(request: Request) -> JSONResponse:
    """Run library-distill skill local-batch on inbox files (SOT procedure)."""
    import library_distill_runner as ldr

    body: dict[str, Any] = {}
    if request.method == "POST":
        try:
            body = await request.json()
            if not isinstance(body, dict):
                body = {}
        except Exception:
            body = {}

    names = body.get("files") or body.get("names")
    if isinstance(names, str):
        names = [names]
    try:
        limit = int(body.get("limit") or 10)
    except (TypeError, ValueError):
        limit = 10

    # Presence: Scribe working
    try:
        keep.report_presence(
            "library",
            "working",
            task_summary="library-distill local-batch…",
            sprite_hint="scribe",
            agent_id="scribe",
        )
    except Exception:
        pass

    out = ldr.distill_inbox(names=names, limit=limit)

    # Summarize presence
    n_prod = sum(1 for r in out.get("results", []) if r.get("disposition") == "production")
    n_ptr = sum(1 for r in out.get("results", []) if r.get("disposition") == "pointer")
    n_skip = sum(1 for r in out.get("results", []) if r.get("disposition") == "skip")
    summary = f"Distill done: {n_prod} notes, {n_ptr} pointers, {n_skip} skip"
    try:
        keep.report_presence(
            "library",
            "idle" if (n_prod + n_ptr + n_skip) else "idle",
            task_summary=summary[:200],
            sprite_hint="scribe",
            agent_id="scribe",
        )
    except Exception:
        pass

    out["presence_summary"] = summary
    return _json(out)


async def jobs_run(request: Request) -> JSONResponse:
    """Walk-up jobs: real actions only (distill, wake, sync). No invented LLM work."""
    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    job = str(body.get("job") or body.get("action") or "").strip().lower()
    if job in ("distill", "distill_inbox", "library_distill"):
        # synthetic Request-like: call distill directly
        import library_distill_runner as ldr

        try:
            keep.report_presence(
                "library",
                "working",
                task_summary="Job: distill inbox",
                sprite_hint="scribe",
                agent_id="scribe",
            )
        except Exception:
            pass
        out = ldr.distill_inbox(limit=int(body.get("limit") or 10))
        try:
            keep.report_presence(
                "library",
                "idle",
                task_summary=f"Job done: {out.get('count', 0)} file(s)",
                sprite_hint="scribe",
                agent_id="scribe",
            )
        except Exception:
            pass
        return _json({"ok": True, "job": "distill_inbox", "result": out})

    if job in ("wake", "wake_castle"):
        stamp = datetime.now(timezone.utc).strftime("%H:%MZ")
        for agent_id, room, state, task in (
            ("clawforge", "alchemy-lab", "working", f"Operator wake @ {stamp}"),
            ("oracle", "library", "idle", "Ready for vault Q"),
            ("scribe", "library", "idle", "Inbox watch"),
            ("raziel", "great-hall", "idle", "Back at command"),
        ):
            try:
                keep.report_presence(
                    room,
                    state,
                    task_summary=task,
                    sprite_hint=agent_id if agent_id != "clawforge" else "ops",
                    agent_id=agent_id,
                )
            except Exception:
                pass
        return _json({"ok": True, "job": "wake", "at": stamp})

    if job in ("sync", "sync_openclaw"):
        try:
            from openclaw_sync import sync_openclaw_status

            result = sync_openclaw_status()
            return _json({"ok": True, "job": "sync_openclaw", "result": result})
        except Exception as e:  # noqa: BLE001
            return _err("sync_failed", str(e), status=500)

    if job in ("rag_sync", "rag_sync_vault", "full_rag_sync"):
        import library_distill_runner as ldr

        # Full vault reindex — slow; prefer auto per-note ingest after distill
        out = ldr.rag_sync_vault_full()
        return _json({"ok": bool(out.get("ok")), "job": "rag_sync_vault", "result": out})

    return _err(
        "unknown_job",
        "Unknown job. Try: distill_inbox | wake | sync_openclaw | rag_sync_vault",
    )


async def arena_bout(request: Request) -> JSONResponse:
    """Observatory Arena v0 — multi-seat opinions without inventing a new product.

    Prefer Ollama if up; else structured multi-perspective scaffold from the
    question (honest label: scaffold). Logs to vault ops/arena/.
    Inspired by Raven Arena notes + llm-council pattern (fan-out → chair).
    """
    body, err = await _body(request)
    if err:
        return err
    assert body is not None
    question = str(body.get("question") or body.get("q") or "").strip()
    if not question or len(question) < 3:
        return _err("invalid_input", "Provide question (string)")

    try:
        keep.report_presence(
            "observatory",
            "working",
            task_summary=f"Arena bout: {question[:80]}",
            sprite_hint="raziel",
            agent_id="raziel",
        )
    except Exception:
        pass

    seats = await _arena_generate_seats(question)
    chair = _arena_chair(question, seats)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rel = f"Ravenstack/ops/arena/bout-{stamp}.md"
    out_path = Path(os.environ.get("OBSIDIAN_VAULT", "/root/obsidian_vault")) / rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"# Arena bout — {day}",
        "",
        f"**Question:** {question}",
        f"**Mode:** {seats[0].get('mode', 'scaffold') if seats else 'scaffold'}",
        "",
        "## Contenders",
    ]
    for s in seats:
        lines.append(f"### {s.get('name', 'seat')}")
        lines.append(s.get("text", "")[:2000])
        lines.append("")
    lines.append("## Chairman (Raziel synthesize)")
    lines.append(chair)
    lines.append("")
    lines.append("## Provenance")
    lines.append("- Keep POST /api/arena/bout (v0)")
    lines.append("- Design: Ravenstack/ops/IDEAS-RAVEN-ARENA.md")
    out_path.write_text("\n".join(lines), encoding="utf-8")

    try:
        keep.report_presence(
            "great-hall",
            "idle",
            task_summary=f"Arena logged → {rel}",
            sprite_hint="raziel",
            agent_id="raziel",
        )
    except Exception:
        pass

    return _json(
        {
            "ok": True,
            "question": question,
            "seats": seats,
            "chair": chair,
            "log_rel": rel,
            "log_path": str(out_path),
        }
    )


async def _arena_generate_seats(question: str) -> list[dict[str, Any]]:
    """Try Ollama; fall back to labeled multi-angle scaffold."""
    import urllib.error
    import urllib.request

    models_try = ["gemma2:2b", "phi3:mini", "llama3.2:1b", "minimax-m3:cloud"]
    # probe tags
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:11434/api/tags", timeout=2
        ) as r:
            tags = json.loads(r.read().decode())
            names = [m.get("name") for m in tags.get("models") or []]
    except Exception:
        names = []

    picked = [m for m in models_try if any(m.split(":")[0] in (n or "") for n in names)]
    if not picked and names:
        picked = names[:2]

    seats: list[dict[str, Any]] = []
    personas = [
        ("Corvid", "Be concise, skeptical, ops-first. 5 bullets max."),
        ("Oracle", "Cite principles and risks. Structured answer."),
        ("Clawforge", "Practical build steps Jason can do this week."),
    ]
    if picked:
        for i, (name, style) in enumerate(personas[: min(3, max(2, len(picked)))]):
            model = picked[i % len(picked)]
            prompt = (
                f"You are {name} in Ravenstack Arena. {style}\n"
                f"Question: {question}\nAnswer:"
            )
            text = _ollama_generate(model, prompt)
            seats.append(
                {
                    "name": name,
                    "model": model,
                    "mode": "ollama",
                    "text": text or "(empty model response)",
                }
            )
        if seats:
            return seats

    # Scaffold (honest) — multi-angle without fake model claims
    seats = [
        {
            "name": "Corvid",
            "mode": "scaffold",
            "text": (
                f"**Skeptical take on:** {question}\n"
                "- What fails if we do nothing?\n"
                "- What's the cheapest test this week?\n"
                "- What should we refuse to automate?"
            ),
        },
        {
            "name": "Oracle",
            "mode": "scaffold",
            "text": (
                f"**Principles lens on:** {question}\n"
                "- Prefer vault SOT over new factories.\n"
                "- Human gates on irreversible writes.\n"
                "- One closed loop > many half-built agents."
            ),
        },
        {
            "name": "Clawforge",
            "mode": "scaffold",
            "text": (
                f"**Build plan for:** {question}\n"
                "1. Ship the smallest vertical slice.\n"
                "2. Wire Keep presence so you can see it.\n"
                "3. Log the result in the vault."
            ),
        },
    ]
    return seats


def _ollama_generate(model: str, prompt: str) -> str:
    import urllib.request

    payload = json.dumps(
        {"model": model, "prompt": prompt, "stream": False, "options": {"num_predict": 400}}
    ).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read().decode())
            return str(data.get("response") or "").strip()
    except Exception as e:  # noqa: BLE001
        return f"(ollama error: {e})"


def _arena_chair(question: str, seats: list[dict[str, Any]]) -> str:
    bits = []
    for s in seats:
        bits.append(f"- **{s.get('name')}:** {(s.get('text') or '')[:200].replace(chr(10), ' ')}")
    return (
        f"On «{question}», the table agrees to prefer a small real slice over theater. "
        f"Synthesis:\n" + "\n".join(bits) + "\n\n"
        "**Chair call:** Do the useful closed loop first; log it; then add fun chrome."
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
        # Never cache the shell — hashed JS names change each build; stale
        # index.html pointing at a deleted bundle = blank page.
        return FileResponse(
            idx,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
            },
        )
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
            headers: dict[str, str] = {}
            # Hashed Vite bundles are immutable; everything else revalidate
            if "/assets/" in f"/{rel}" or rel.startswith("assets/"):
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif rel.endswith((".js", ".css", ".html")):
                headers["Cache-Control"] = "no-cache, must-revalidate"
            return FileResponse(cand, headers=headers)
    return _err("not_found", f"No file {rel}", status=404)


routes = [
    Route("/api/health", health),
    Route("/health", health),
    Route("/api/castle-map", castle_map),
    Route("/api/gates", gates),
    Route("/api/occupancy", occupancy),
    Route("/api/sync-openclaw", sync_openclaw),
    Route("/api/path", path),
    Route("/api/cost-summary", cost_summary),
    Route("/api/report-status", report_status, methods=["POST"]),
    Route("/api/report-presence", report_presence_http, methods=["POST"]),
    Route("/api/approve-spec", approve_spec_http, methods=["POST"]),
    Route("/api/unlock-room", unlock_room_http, methods=["POST"]),
    Route("/api/specs", specs),
    Route("/api/library/inbox", library_inbox),
    Route("/api/library/upload", library_upload, methods=["POST"]),
    Route("/api/library/distill", library_distill, methods=["GET", "POST"]),
    Route("/api/jobs/run", jobs_run, methods=["POST"]),
    Route("/api/arena/bout", arena_bout, methods=["POST"]),
    Route("/api/compact", compact_http, methods=["POST"]),
    Route("/api/compact/history", compact_history_http),
    Route("/api/spatial-memory", spatial_memory_http),
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
