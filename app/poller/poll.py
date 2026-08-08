#!/usr/bin/env python3
"""Ravenstack Keep poller — read-only level + optional events.jsonl fold.

Never writes to Fortress. Atomic state.json only (.tmp then rename).
County / Story Factory: status fields only — never trigger.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

UTC_FMT = "%Y-%m-%dT%H:%M:%SZ"


def utc_now() -> str:
    return time.strftime(UTC_FMT, time.gmtime())


def http_json(url: str, timeout: float = 3.0) -> Any | None:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return None
            return json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError) as e:
        print(f"[poller] GET {url} failed: {e}", file=sys.stderr)
        return None


def http_ok(url: str, timeout: float = 3.0) -> bool:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"[poller] probe {url} failed: {e}", file=sys.stderr)
        return False


def atomic_write(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    data = json.dumps(obj, indent=2) + "\n"
    tmp.write_text(data, encoding="utf-8")
    os.replace(tmp, path)


def load_cursor(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        return int(json.loads(path.read_text()).get("offset", 0))
    except Exception:
        return 0


def save_cursor(path: Path, offset: int) -> None:
    atomic_write(path, {"offset": offset})


def rotate_events_if_needed(events_path: Path, max_bytes: int) -> None:
    if not events_path.exists():
        return
    if events_path.stat().st_size < max_bytes:
        return
    bak = events_path.with_suffix(".jsonl.1")
    if bak.exists():
        bak.unlink()
    events_path.rename(bak)
    events_path.write_text("", encoding="utf-8")
    print(f"[poller] rotated {events_path} -> {bak}", file=sys.stderr)


def read_new_events(events_path: Path, offset: int) -> tuple[list[dict], int]:
    if not events_path.exists():
        return [], offset
    raw = events_path.read_bytes()
    if offset > len(raw):
        offset = 0
    chunk = raw[offset:]
    events: list[dict] = []
    for line in chunk.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line.decode("utf-8")))
        except Exception as e:
            print(f"[poller] bad event line: {e}", file=sys.stderr)
    return events, len(raw)


def parse_ts(s: str | None) -> float:
    if not s:
        return 0.0
    try:
        # 2026-08-05T04:05:00Z
        return time.mktime(time.strptime(s.replace("Z", ""), "%Y-%m-%dT%H:%M:%S"))
    except Exception:
        return 0.0


def fold_events(agents: list[dict], events: list[dict], last_poll_ts: str) -> set[str]:
    """Hook wins on recency for transient state if newer than last poll.

    Returns set of agent ids that received a waiting_on_human edge this cycle.
    """
    by_id = {a["id"]: a for a in agents}
    poll_t = parse_ts(last_poll_ts)
    fresh_waiting: set[str] = set()
    for ev in events:
        aid = ev.get("agent_id")
        if not aid or aid not in by_id:
            continue
        et = parse_ts(ev.get("ts") or ev.get("updated_at"))
        # only skip events clearly older than previous poll
        if et and poll_t and et < poll_t:
            continue
        a = by_id[aid]
        etype = (ev.get("type") or "").lower()
        payload = ev.get("payload") or {}
        if etype in ("waiting_on_human", "gate_pending", "approval_required") or etype.endswith(
            "waiting_on_human"
        ):
            a["state"] = "waiting_on_human"
            a["task_text"] = payload.get("subject") or payload.get("task_text") or a.get("task_text")
            a["source"] = "hook"
            a["updated_at"] = ev.get("ts") or utc_now()
            fresh_waiting.add(aid)
        elif etype in ("working", "task_start") or etype.endswith("working"):
            a["state"] = "working"
            a["source"] = "hook"
            a["updated_at"] = ev.get("ts") or utc_now()
        elif etype in ("idle", "task_done", "gate_cleared") or etype.endswith("idle"):
            a["state"] = "idle"
            a["source"] = "hook"
            a["updated_at"] = ev.get("ts") or utc_now()
        elif etype in ("failed", "error"):
            a["state"] = "failed"
            a["source"] = "hook"
            a["updated_at"] = ev.get("ts") or utc_now()
    return fresh_waiting


def heal_waiting(agents: list[dict], gates: list[dict], fresh_waiting: set[str]) -> None:
    """Poll heals drift: no pending gate → clear stale hook waiting (not same-cycle edges)."""
    gated = {g.get("agent_id") for g in gates if g.get("agent_id")}
    for a in agents:
        if a.get("state") != "waiting_on_human":
            continue
        aid = a.get("id")
        if aid in fresh_waiting:
            # hook wins recency this cycle even if gate list empty
            continue
        if a.get("source") == "hook" and aid not in gated:
            a["state"] = "idle"
            a["task_text"] = None
            a["source"] = "poll"
            a["updated_at"] = utc_now()


# Map pipeline actor names → Keep agent ids (display only)
REQUESTER_TO_AGENT = {
    "silent_auditor": "analyst",
    "analyst": "analyst",
    "researcher": "researcher",
    "content_studio": "content_studio",
    "content-studio": "content_studio",
    "raziel": "raziel",
    "main": "raziel",
    "orchestrator": "raziel",
}


def map_requester(name: str | None) -> str:
    if not name:
        return "analyst"
    key = str(name).strip().lower().replace(" ", "_")
    return REQUESTER_TO_AGENT.get(key, "analyst")


def build_state(cfg: dict, prev: dict | None) -> dict:
    now = utc_now()
    ep = cfg.get("endpoints") or {}

    reclaw = http_json(ep.get("reclaw_health", "http://127.0.0.1:8000/health"))
    openclaw_ok = http_ok(ep.get("openclaw_health", "http://127.0.0.1:18789/health"))
    dash = http_json(ep.get("dashboard_status", "http://127.0.0.1:8081/status.json"))
    # Correct ReClaw routes (verified live): /state and /fortress-state — NOT /fortress/state
    platform_state = http_json(ep.get("platform_state", "http://127.0.0.1:8000/state"))
    fortress = http_json(ep.get("fortress_state", "http://127.0.0.1:8000/fortress-state"))

    tasks_running = None
    gates: list[dict] = []
    dash_rooms: dict = {}

    if isinstance(dash, dict):
        for r in dash.get("rooms") or []:
            dash_rooms[r.get("id")] = r
        agents_active = dash.get("agents_active")
        if isinstance(agents_active, int):
            tasks_running = agents_active

    # Primary ground truth for gates: GET /state → pending_approvals
    if isinstance(platform_state, dict):
        for g in platform_state.get("pending_approvals") or []:
            if not isinstance(g, dict):
                continue
            if (g.get("status") or "pending").lower() not in ("pending", ""):
                continue
            agent_id = map_requester(g.get("requested_by") or g.get("agent_id"))
            since = g.get("requested_at") or g.get("since") or now
            if isinstance(since, str) and since.endswith("+00:00"):
                since = since.replace("+00:00", "Z")
            gates.append(
                {
                    "id": str(g.get("id") or f"gate_{len(gates)}"),
                    "agent_id": agent_id,
                    "blocked_on": g.get("capability") or g.get("blocked_on") or "approval",
                    "subject": g.get("reason") or g.get("subject") or g.get("session_id") or "",
                    "since": since,
                    "session_id": g.get("session_id"),
                }
            )
        # jobs.running length as optional activity signal
        jobs = platform_state.get("jobs") or {}
        if isinstance(jobs, dict) and isinstance(jobs.get("running"), list):
            if tasks_running is None:
                tasks_running = len(jobs["running"])

    # Secondary: fortress-state pending_gates count (integer) + castle_map_rooms
    fortress_rooms = []
    if isinstance(fortress, dict):
        pg = fortress.get("pending_gates")
        if isinstance(pg, int) and not gates:
            # count only — no per-gate detail; leave gates empty but count for HUD
            pass
        fortress_rooms = fortress.get("castle_map_rooms") or []

    gates_pending = len(gates)
    if gates_pending == 0 and isinstance(fortress, dict) and isinstance(fortress.get("pending_gates"), int):
        # Prefer detailed list; fall back to count for HUD only
        gates_pending = int(fortress["pending_gates"])

    rooms_out = []
    for r in cfg.get("rooms") or []:
        rooms_out.append(
            {
                "id": r["id"],
                "name": r.get("name") or r["id"],
                "lock": r.get("lock") or "live",
                "agent_id": r.get("agent_id"),
            }
        )

    status_to_state = {
        "COMMANDING": "working",
        "HAMMERING": "working",
        "WORKING": "working",
        "IDLE": "idle",
        "WAITING": "waiting_on_human",
        "UNFORGED": "retired",
    }
    dash_agent_hint: dict[str, tuple[str, str | None]] = {}
    room_sources = list((dash or {}).get("rooms") or []) if isinstance(dash, dict) else []
    if not room_sources and fortress_rooms:
        room_sources = fortress_rooms
    for r in room_sources:
        rid = r.get("id") or ""
        st = (r.get("status") or "").upper()
        mapped = status_to_state.get(st)
        if rid == "orchestrator-throne" and mapped:
            dash_agent_hint["raziel"] = (mapped, r.get("status"))
        if rid == "clawforge-anvil" and mapped:
            dash_agent_hint["content_studio"] = (mapped, r.get("status"))

    # Agents with pending gates → waiting_on_human (poll ground truth)
    waiting_by_agent: dict[str, dict] = {}
    for g in gates:
        aid = g.get("agent_id") or "analyst"
        # keep newest/first as task text
        if aid not in waiting_by_agent:
            waiting_by_agent[aid] = g

    agents_out = []
    for a in cfg.get("agents") or []:
        state = "idle"
        task_text = None
        conf = None
        if a["id"] in waiting_by_agent:
            g = waiting_by_agent[a["id"]]
            state = "waiting_on_human"
            task_text = g.get("subject") or g.get("blocked_on")
        elif not openclaw_ok and a["id"] == "raziel":
            state = "failed"
            task_text = "gateway health failed"
        elif a["id"] in dash_agent_hint:
            state, label = dash_agent_hint[a["id"]]
            task_text = f"dashboard:{label}" if label else None
        agents_out.append(
            {
                "id": a["id"],
                "name": a.get("name") or a["id"],
                "sprite_key": a.get("sprite_key") or "mage_blue",
                "room": a.get("room"),
                "state": state,
                "task_text": task_text,
                "confidence": conf,
                "source": "poll",
                "updated_at": now,
            }
        )

    last_poll_ts = (prev or {}).get("generated_at") or now

    return {
        "schema_version": 1,
        "generated_at": now,
        "poll_interval_sec": int(cfg.get("poll_interval_sec") or 4),
        "global": {
            "spend_month_usd": None,  # never invent
            "spend_budget_usd": 10.0,
            "tasks_running": tasks_running,
            "gates_pending": gates_pending,
            "stale": False,
            "openclaw_ok": openclaw_ok,
            "reclaw_ok": bool(isinstance(reclaw, dict) and reclaw.get("status") == "ok"),
        },
        "rooms": rooms_out,
        "agents": agents_out,
        "gates": [
            {k: v for k, v in g.items() if k != "session_id"}  # schema-clean public gates
            for g in gates
        ],
        "_meta": {
            "last_poll_ts": last_poll_ts,
            "dashboard_rooms_seen": list(dash_rooms.keys()),
            "gates_detailed": len(gates),
        },
    }


def strip_meta(state: dict) -> dict:
    out = dict(state)
    out.pop("_meta", None)
    # strip non-schema keys from global if any extras for HUD only — keep openclaw_ok optional
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Ravenstack Keep poller (read-only)")
    ap.add_argument("--config", default="poller/config.example.json")
    ap.add_argument("--once", action="store_true", help="single poll then exit")
    ap.add_argument("--root", default=".", help="app root (contains data/)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    os.chdir(root)
    cfg_path = Path(args.config)
    if not cfg_path.is_absolute():
        cfg_path = root / cfg_path
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    state_path = root / cfg.get("state_path", "data/state.json")
    events_path = root / cfg.get("events_path", "data/events.jsonl")
    cursor_path = root / cfg.get("cursor_path", "data/cursor.json")
    max_bytes = int(cfg.get("events_max_bytes") or 10_485_760)
    interval = float(cfg.get("gate_poll_interval_sec") or cfg.get("poll_interval_sec") or 4)

    print(f"[poller] root={root} interval={interval}s state={state_path}", flush=True)

    while True:
        try:
            rotate_events_if_needed(events_path, max_bytes)
            prev = None
            if state_path.exists():
                try:
                    prev = json.loads(state_path.read_text(encoding="utf-8"))
                except Exception:
                    prev = None

            state = build_state(cfg, prev)
            last_poll_ts = (state.get("_meta") or {}).get("last_poll_ts") or state["generated_at"]

            offset = load_cursor(cursor_path)
            events, new_offset = read_new_events(events_path, offset)
            fresh_waiting = fold_events(state["agents"], events, last_poll_ts)
            heal_waiting(state["agents"], state["gates"], fresh_waiting)
            save_cursor(cursor_path, new_offset)

            # recompute gates_pending from gates list
            state["global"]["gates_pending"] = len(state["gates"])

            # if any agent waiting, ensure global reflects
            waiting = sum(1 for a in state["agents"] if a.get("state") == "waiting_on_human")
            if waiting and not state["global"]["gates_pending"]:
                # ground truth has no gates — heal already ran; waiting should be 0
                pass

            out = strip_meta(state)
            # remove non-schema extras from public global (keep minimal)
            g = out["global"]
            public_global = {
                "spend_month_usd": g.get("spend_month_usd"),
                "spend_budget_usd": g.get("spend_budget_usd"),
                "tasks_running": g.get("tasks_running"),
                "gates_pending": g.get("gates_pending"),
                "stale": False,
            }
            out["global"] = public_global
            atomic_write(state_path, out)
            print(
                f"[poller] wrote {state_path} at {out['generated_at']} "
                f"tasks={public_global['tasks_running']} gates={public_global['gates_pending']} "
                f"events_applied={len(events)}",
                flush=True,
            )
        except Exception as e:
            # observability must never crash the box hard — log and continue
            print(f"[poller] ERROR (swallowed): {e}", file=sys.stderr, flush=True)

        if args.once:
            return 0
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
