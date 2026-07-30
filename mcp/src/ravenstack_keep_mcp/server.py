#!/usr/bin/env python3
"""Ravenstack Keep MCP — streamable-http / stdio control plane.

Does NOT replace reclaw-platform. Ops stay on reclaw; Keep owns rooms/specs/scope/gates.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Allow `python -m ravenstack_keep_mcp.server` and direct script run
_SRC = Path(__file__).resolve().parent.parent
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from mcp.server.fastmcp import FastMCP

from ravenstack_keep_mcp import SERVER_NAME, __version__
from ravenstack_keep_mcp import knowledge as kn
from ravenstack_keep_mcp import specs as sp
from ravenstack_keep_mcp.paths import REPO_ROOT, reclaw_mcp_url, vault_path
from ravenstack_keep_mcp.store import KeepStore

_store = KeepStore()

mcp = FastMCP(
    SERVER_NAME,
    instructions=(
        "You are connected to Ravenstack Keep MCP — the control plane for rooms, "
        "Agent Specs, scoped knowledge, A2A traces, and human gates. "
        "This is NOT reclaw-platform (fortress ops: sitrep, docker, county queue, vault RW). "
        "Prefer reads. Gated tools require confirm=true and explicit human intent. "
        "SOT is CANONICAL per KEEP-SOT-DECISION.md (repo owns rooms/Agent Specs). "
        "Never invent castle health or A2A traces — report not_instrumented when empty. "
        "No draft-to-execute: propose_agent_spec only writes backlog drafts."
    ),
)


def _err(code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"error": code, "code": code, "message": message, **extra}


def _require_confirm(confirm: bool, action: str) -> Optional[Dict[str, Any]]:
    if confirm is True:
        return None
    return _err(
        "confirm_required",
        f"Gated action {action!r} requires confirm=true and explicit human intent.",
        action=action,
    )


# ─── Health / SOT ───────────────────────────────────────────────────────────


@mcp.tool()
def keep_health() -> dict[str, Any]:
    """Keep MCP liveness: map seed, status store, vault path, SOT status."""
    rooms = _store.list_rooms()
    return {
        "status": "ok",
        "service": SERVER_NAME,
        "version": __version__,
        "transport": os.environ.get("MCP_TRANSPORT", "stdio"),
        "room_count": len(rooms),
        "spec_count": sp.list_agent_specs()["count"],
        "vault_path": str(vault_path()) if vault_path() else None,
        "sot_status": _store.get_meta("sot_status", "CANONICAL"),
        "db": str(_store.path),
        "reclaw_mcp_url": reclaw_mcp_url(),
    }


@mcp.tool()
def sot_versions() -> dict[str, Any]:
    """Which SOT sources this server loaded (canonical map, specs, meta)."""
    seed_primary = REPO_ROOT / "mcp" / "seeds" / "castle_map.json"
    seed_legacy = REPO_ROOT / "mcp" / "seeds" / "castle_map.provisional.json"
    seed = seed_primary if seed_primary.is_file() else seed_legacy
    seed_meta = {}
    if seed.is_file():
        try:
            seed_meta = json.loads(seed.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            seed_meta = {"error": str(e)}
    return {
        "sot_status": _store.get_meta("sot_status", "CANONICAL"),
        "sot_note": _store.get_meta("sot_note", ""),
        "castle_map_version": _store.get_meta("castle_map_version", "unknown"),
        "decision": "KEEP-SOT-DECISION.md",
        "seed_file": str(seed) if seed.is_file() else None,
        "seed_agents_with_spec": seed_meta.get("agents_with_spec"),
        "seed_agents_without_spec": seed_meta.get("agents_without_spec"),
        "repo_specs": sp.list_agent_specs(),
        "policy": {
            "agent_truth": "agents/*.agent-spec.json (validated against schema; status>=approved = real)",
            "map_truth": "mcp/seeds/castle_map.json (CANONICAL per KEEP-SOT-DECISION.md)",
            "narrative_truth": "vault RAVENSTACK-ORACLE.md / ARCHITECTURE (fortress knowledge, not room IDs)",
            "ops_truth": "reclaw-platform (not this server)",
        },
    }


# ─── A. Core rooms / agents ─────────────────────────────────────────────────


@mcp.tool()
def list_rooms(
    include_unforged: bool = True,
    lock_state: Optional[str] = None,
) -> dict[str, Any]:
    """Inventory Keep rooms and lock/occupant state."""
    rooms = _store.list_rooms(include_unforged=include_unforged, lock_state=lock_state)
    return {
        "rooms": rooms,
        "sot_status": _store.get_meta("sot_status", "CANONICAL"),
    }


@mcp.tool()
def get_room(room_id: str) -> dict[str, Any]:
    """Single room + occupant status + queue depth."""
    room = _store.get_room(room_id)
    if not room:
        return _err("not_found", f"Unknown room_id={room_id}")
    occupant = room.get("occupant_agent_id")
    status = _store.get_agent_status(occupant) if occupant else None
    return {"room": room, "occupant_status": status}


@mcp.tool()
def report_agent_status(
    agent_id: str,
    state: str,
    task: Optional[str] = None,
    confidence: Optional[float] = None,
    session_id: Optional[str] = None,
    detail: Optional[str] = None,
) -> dict[str, Any]:
    """Publish live agent status for the Keep UI (status row only)."""
    allowed = {"idle", "answering", "working", "waiting_human", "failed", "retired"}
    if state not in allowed:
        return _err("invalid_state", f"state must be one of {sorted(allowed)}")
    # Prefer known specs; still allow provisional roster agents from map
    known_spec = sp.load_spec(agent_id)
    if known_spec is None:
        # allow if appears as room occupant
        rooms = _store.list_rooms()
        occupants = {r.get("occupant_agent_id") for r in rooms}
        if agent_id not in occupants:
            return _err(
                "unknown_agent",
                f"agent_id={agent_id} has no spec and is not a map occupant",
            )
    return _store.report_agent_status(
        agent_id=agent_id,
        state=state,
        task=task,
        confidence=confidence,
        session_id=session_id,
        detail=detail,
    )


@mcp.tool()
def get_agent_spec(agent_id: str, format: str = "json") -> dict[str, Any]:
    """Return the Agent Spec that makes an agent real (json or markdown)."""
    fmt = format if format in ("json", "markdown") else "json"
    return sp.get_agent_spec(agent_id, fmt=fmt)


@mcp.tool()
def list_agent_specs() -> dict[str, Any]:
    """List all Agent Specs on disk with validation status."""
    return sp.list_agent_specs()


@mcp.tool()
def query_scoped_knowledge(
    agent_id: str,
    query: str,
    top_k: int = 5,
    indexes: Optional[List[str]] = None,
) -> dict[str, Any]:
    """RAG query that respects the calling agent's knowledge_seeds (scope_denied if out of bounds)."""
    return kn.query_scoped_knowledge(
        agent_id=agent_id, query=query, top_k=top_k, indexes=indexes
    )


@mcp.tool()
def get_cost_summary(
    agent_id: Optional[str] = None,
    month: Optional[str] = None,
) -> dict[str, Any]:
    """Per-agent cost summary for a month (v0 may be zeros until cost pipeline exists)."""
    return _store.cost_summary(agent_id=agent_id, month=month)


# ─── B. Map / A2A / dashboard ───────────────────────────────────────────────


@mcp.tool()
def get_castle_map() -> dict[str, Any]:
    """Full castle map: rooms, coordinates, agent status chips, queue depths."""
    rooms = _store.list_rooms()
    statuses = {s["agent_id"]: s for s in _store.list_agent_statuses()}
    enriched = []
    for r in rooms:
        chip = dict(r)
        aid = r.get("occupant_agent_id")
        st = statuses.get(aid) if aid else None
        chip["agent_state"] = (st or {}).get("state")
        chip["agent_task"] = (st or {}).get("task")
        chip["agent_updated_at"] = (st or {}).get("updated_at")
        enriched.append(chip)
    return {
        "sot_status": _store.get_meta("sot_status", "CANONICAL"),
        "sot_note": _store.get_meta("sot_note", ""),
        "version": _store.get_meta("castle_map_version", "unknown"),
        "rooms": enriched,
        "agent_statuses": list(statuses.values()),
    }


@mcp.tool()
def list_a2a_messages(
    trace_id: Optional[str] = None,
    from_agent: Optional[str] = None,
    to_agent: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
) -> dict[str, Any]:
    """List stored A2A messages (empty until A2A bus is instrumented)."""
    msgs = _store.list_a2a(
        trace_id=trace_id,
        from_agent=from_agent,
        to_agent=to_agent,
        since=since,
        limit=limit,
    )
    return {
        "count": len(msgs),
        "messages": msgs,
        "instrumented": len(msgs) > 0 or False,
        "note": (
            None
            if msgs
            else "A2A store empty — not_instrumented. Will not invent handoffs."
        ),
    }


@mcp.tool()
def get_agent_trace(trace_id: str) -> dict[str, Any]:
    """Replay A2A chain for one trace_id (honest empty if not instrumented)."""
    return _store.get_agent_trace(trace_id)


@mcp.tool()
def get_queue_depth(room_id: Optional[str] = None) -> dict[str, Any]:
    """Queue depth per room (or one room)."""
    if room_id:
        room = _store.get_room(room_id)
        if not room:
            return _err("not_found", f"Unknown room_id={room_id}")
        return {
            "room_id": room_id,
            "queue_depth": room.get("queue_depth", 0),
        }
    rooms = _store.list_rooms()
    return {
        "rooms": [
            {"room_id": r["room_id"], "queue_depth": r.get("queue_depth", 0)}
            for r in rooms
        ]
    }


@mcp.tool()
def list_waiting_human() -> dict[str, Any]:
    """All agents currently in waiting_human state."""
    waiting = _store.list_waiting_human()
    gates = _store.list_pending_gates(include_resolved=False)
    return {
        "agents": waiting,
        "pending_gates": gates,
        "count": len(waiting),
    }


@mcp.tool()
def get_desk_assignment(agent_id: Optional[str] = None) -> dict[str, Any]:
    """Agent → room → coordinates from castle map."""
    rooms = _store.list_rooms()
    desks = []
    for r in rooms:
        aid = r.get("occupant_agent_id")
        if not aid:
            continue
        if agent_id and aid != agent_id:
            continue
        desks.append(
            {
                "agent_id": aid,
                "room_id": r["room_id"],
                "room_name": r["name"],
                "x": r.get("x"),
                "y": r.get("y"),
                "lock_state": r.get("lock_state"),
            }
        )
    if agent_id and not desks:
        return _err("not_found", f"No desk assignment for agent_id={agent_id}")
    return {"desks": desks, "sot_status": _store.get_meta("sot_status", "CANONICAL")}


# ─── C. Governance (gated mutations) ────────────────────────────────────────


@mcp.tool()
def propose_agent_spec(agent_id: str, spec_json: str) -> dict[str, Any]:
    """Write a draft Agent Spec to backlog/ only (never auto-installs)."""
    try:
        spec = json.loads(spec_json)
    except json.JSONDecodeError as e:
        return _err("invalid_json", f"spec_json is not valid JSON: {e}")
    result = sp.save_proposed_spec(agent_id, spec)
    if result.get("ok"):
        gate = _store.add_gate(
            gate_type="approve_spec",
            subject_id=agent_id,
            summary=f"Draft Agent Spec proposed for {agent_id}",
            payload={"path": result.get("path")},
        )
        result["gate"] = gate
        _store.append_event(
            "propose_agent_spec",
            agent_id=agent_id,
            payload={"path": result.get("path")},
        )
    return result


@mcp.tool()
def approve_spec(agent_id: str, confirm: bool = False) -> dict[str, Any]:
    """GATED: promote draft → approved on disk. Does not unlock room."""
    bad = _require_confirm(confirm, "approve_spec")
    if bad:
        return bad
    result = sp.approve_spec_file(agent_id)
    if result.get("ok"):
        _store.append_event(
            "approve_spec",
            agent_id=agent_id,
            payload=result,
        )
        # resolve matching gates
        for g in _store.list_pending_gates():
            if g["gate_type"] == "approve_spec" and g["subject_id"] == agent_id:
                _store.resolve_gate(g["id"], "approved")
    return result


@mcp.tool()
def unlock_room(room_id: str, confirm: bool = False) -> dict[str, Any]:
    """GATED: set room lock_state to live after human approval."""
    bad = _require_confirm(confirm, "unlock_room")
    if bad:
        return bad
    room = _store.get_room(room_id)
    if not room:
        return _err("not_found", f"Unknown room_id={room_id}")
    aid = room.get("occupant_agent_id")
    if aid:
        spec = sp.load_spec(aid)
        if spec and spec.get("status") not in ("approved", "live"):
            return _err(
                "spec_not_approved",
                f"Occupant {aid} status={spec.get('status')}; approve_spec first.",
            )
        if spec:
            # mark live on room field in store; update spec room.lock_state
            spec = dict(spec)
            spec["status"] = "live"
            if isinstance(spec.get("room"), dict):
                spec["room"] = dict(spec["room"])
                spec["room"]["lock_state"] = "live"
            from ravenstack_keep_mcp.paths import agents_dir

            path = agents_dir() / f"{aid}.agent-spec.json"
            path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    updated = _store.update_room(
        room_id,
        lock_state="live",
        status_summary="unlocked by human gate",
    )
    _store.append_event("unlock_room", room_id=room_id, payload={"room": updated})
    # Parity with HTTP: resolve matching unlock_room gates so map inbox clears.
    for g in _store.list_pending_gates():
        if g["gate_type"] == "unlock_room" and g["subject_id"] == room_id:
            _store.resolve_gate(g["id"], "approved")
    return {"ok": True, "room": updated}


@mcp.tool()
def retire_agent(agent_id: str, confirm: bool = False) -> dict[str, Any]:
    """GATED: set Agent Spec status=retired and lock its room if live."""
    bad = _require_confirm(confirm, "retire_agent")
    if bad:
        return bad
    result = sp.retire_spec(agent_id)
    if not result.get("ok"):
        return result
    # lock rooms where this agent is occupant
    for r in _store.list_rooms():
        if r.get("occupant_agent_id") == agent_id and r.get("lock_state") == "live":
            _store.update_room(
                r["room_id"],
                lock_state="locked",
                status_summary=f"locked: agent {agent_id} retired",
            )
    _store.report_agent_status(agent_id, state="retired", detail="retired via gate")
    _store.append_event("retire_agent", agent_id=agent_id, payload=result)
    return result


@mcp.tool()
def list_pending_gates(include_resolved: bool = False) -> dict[str, Any]:
    """Keep-wide human gates: specs, unlocks, etc."""
    gates = _store.list_pending_gates(include_resolved=include_resolved)
    waiting = _store.list_waiting_human()
    return {"gates": gates, "waiting_human_agents": waiting, "count": len(gates)}


@mcp.tool()
def diff_agent_spec(agent_id: str) -> dict[str, Any]:
    """Diff agents/ live file vs backlog draft for review before approve."""
    return sp.diff_spec(agent_id)


# ─── D. Rituals / knowledge hygiene ─────────────────────────────────────────


@mcp.tool()
def trigger_reload_ritual(
    goal: str,
    confirm: bool = False,
    dry_run: bool = True,
) -> dict[str, Any]:
    """GATED: run or dry-run the Ravenstack reload ritual (does not invent success)."""
    bad = _require_confirm(confirm, "trigger_reload_ritual")
    if bad:
        return bad
    if dry_run:
        rec = _store.record_ritual(goal, status="dry_run", detail="no shell executed")
        return {
            "ok": True,
            "dry_run": True,
            "would_run": f'python3 -m core.cell "Reload — {goal}"',
            "ritual": rec,
            "note": "Set dry_run=false with confirm=true to attempt execution on configured host.",
        }

    # Only execute if KEEP_RELOAD_CMD is set (never invent server shell by default)
    cmd_template = os.environ.get("KEEP_RELOAD_CMD")
    if not cmd_template:
        rec = _store.record_ritual(
            goal,
            status="skipped_no_cmd",
            detail="KEEP_RELOAD_CMD not set; refusing to invent shell",
        )
        return {
            "ok": False,
            "error": "not_configured",
            "message": (
                "KEEP_RELOAD_CMD is unset. Example on Hetzner: "
                'KEEP_RELOAD_CMD=\'cd /root/ReClaw-2.0 && .venv/bin/python -m core.cell "Reload — {goal}"\''
            ),
            "ritual": rec,
        }

    cmd = cmd_template.format(goal=goal)
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        detail = (proc.stdout or "")[-2000:] + "\n" + (proc.stderr or "")[-1000:]
        status = "ok" if proc.returncode == 0 else f"exit_{proc.returncode}"
        rec = _store.record_ritual(goal, status=status, detail=detail.strip())
        return {
            "ok": proc.returncode == 0,
            "dry_run": False,
            "returncode": proc.returncode,
            "ritual": rec,
        }
    except Exception as e:  # noqa: BLE001
        rec = _store.record_ritual(goal, status="error", detail=str(e))
        return {"ok": False, "error": "exec_failed", "message": str(e), "ritual": rec}


@mcp.tool()
def reload_status() -> dict[str, Any]:
    """Last reload ritual run recorded by Keep MCP."""
    last = _store.last_ritual()
    return {
        "last": last,
        "note": None if last else "No ritual runs recorded yet.",
    }


@mcp.tool()
def list_knowledge_indexes() -> dict[str, Any]:
    """Allowed Keep indexes (never general) and per-spec seed indexes."""
    return kn.list_knowledge_indexes()


@mcp.tool()
def explain_scope(agent_id: str) -> dict[str, Any]:
    """What knowledge an agent may query (indexes + vault_globs)."""
    return kn.explain_scope(agent_id)


@mcp.tool()
def search_castle_events(
    kind: Optional[str] = None,
    room_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Search structured Keep events (status, gates, rituals)."""
    events = _store.search_events(
        kind=kind,
        room_id=room_id,
        agent_id=agent_id,
        since=since,
        limit=limit,
    )
    return {"count": len(events), "events": events}


# ─── F. Round table stubs ───────────────────────────────────────────────────


@mcp.tool()
def start_roundtable(
    topic: str,
    agents: Optional[List[str]] = None,
    confirm: bool = False,
) -> dict[str, Any]:
    """GATED stub: Round Table sessions not instrumented in v0."""
    bad = _require_confirm(confirm, "start_roundtable")
    if bad:
        return bad
    return {
        "ok": False,
        "error": "not_instrumented",
        "message": "Round Table MCP is planned (section F) but not implemented yet.",
        "topic": topic,
        "agents": agents or [],
    }


@mcp.tool()
def get_roundtable_status(session_id: str) -> dict[str, Any]:
    """Stub: round table status."""
    return {
        "error": "not_instrumented",
        "session_id": session_id,
        "message": "Round Table not implemented in Keep MCP v0.",
    }


@mcp.tool()
def submit_roundtable_vote(
    session_id: str,
    agent_id: str,
    vote: str,
    confirm: bool = False,
) -> dict[str, Any]:
    """GATED stub: round table vote."""
    bad = _require_confirm(confirm, "submit_roundtable_vote")
    if bad:
        return bad
    return {
        "error": "not_instrumented",
        "session_id": session_id,
        "agent_id": agent_id,
        "vote": vote,
    }


@mcp.tool()
def get_consensus_result(trace_id: str) -> dict[str, Any]:
    """Stub: consensus result for a trace."""
    return {
        "error": "not_instrumented",
        "trace_id": trace_id,
        "message": "Consensus tooling not implemented in v0.",
    }


# ─── entrypoints ────────────────────────────────────────────────────────────


def main() -> None:
    transport = os.environ.get("MCP_TRANSPORT", "stdio").lower()
    if transport in ("streamable-http", "http", "sse"):
        # FastMCP 1.x run HTTP
        host = os.environ.get("FASTMCP_HOST", "127.0.0.1")
        port = int(os.environ.get("FASTMCP_PORT", "8110"))
        # Prefer streamable-http when available
        try:
            mcp.settings.host = host
            mcp.settings.port = port
        except Exception:  # noqa: BLE001
            pass
        print(
            f"[ravenstack-keep] streamable-http on {host}:{port}/mcp",
            file=sys.stderr,
        )
        mcp.run(transport="streamable-http")
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
