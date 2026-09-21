"""Keep lane diagnostics — read-only, no restarts, no state writes.

Mirrors the keep-routing-audit skill: probe the Keep HTTP endpoints on 127.0.0.1:8112,
flag SLA breaches (3.0 s), and report the live LLM dialogue lane (Grok VM phi4-mini)
vs static fallback pools. This module never restarts services and never writes state.
The /api/dialogue probe is a real, bounded call against the live lane.
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any, Optional

KEEP_HTTP = os.environ.get("KEEP_HTTP_URL", "http://127.0.0.1:8112").rstrip("/")
GROK_OLLAMA = os.environ.get("GROK_OLLAMA_URL", "http://100.97.223.55:11434")
SLA_MS = 3000
PROBE_TIMEOUT = 6


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _probe(
    path: str, method: str = "GET", body: Optional[dict[str, Any]] = None
) -> dict[str, Any]:
    url = f"{KEEP_HTTP}{path}"
    start = time.monotonic()
    try:
        data = json.dumps(body).encode("utf-8") if body else None
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        latency_ms = round((time.monotonic() - start) * 1000)
        status = resp.status
    except Exception as exc:  # noqa: BLE001
        return {
            "path": path,
            "reachable": False,
            "latency_ms": None,
            "source": None,
            "over_sla": False,
            "note": f"unreachable ({type(exc).__name__})",
        }
    source = None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            source = parsed.get("source")
    except (ValueError, json.JSONDecodeError):
        source = None
    return {
        "path": path,
        "reachable": True,
        "status": status,
        "latency_ms": latency_ms,
        "source": source,
        "over_sla": latency_ms > SLA_MS,
        "note": None,
    }


def _vm_state() -> dict[str, Any]:
    out: dict[str, Any] = {"reachable": False, "generated_at": None}
    try:
        with urllib.request.urlopen(
            urllib.request.Request(
                f"{GROK_OLLAMA}/api/ps", headers={"Accept": "application/json"}
            ),
            timeout=4,
        ) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        out["reachable"] = True
        out["generated_at"] = _utc_now()
        models = data.get("models") or []
        out["loaded_count"] = len(models)
        for m in models:
            if m.get("name", "").startswith("phi4-mini"):
                expires = str(m.get("expires_at") or "")
                pinned = expires.startswith("2319")
                out["phi4_mini"] = {
                    "loaded": True,
                    "pinned": pinned,
                    "context_length": m.get("context_length"),
                    "expires_at": expires,
                }
    except Exception as exc:  # noqa: BLE001
        out["note"] = f"unreachable ({type(exc).__name__})"
    return out


def routing_status() -> dict[str, Any]:
    """Consolidated read-only lane report: endpoints + fallback state + VM pin."""
    endpoints = [
        _probe("/api/gates", "GET"),
        _probe("/api/ambient-event", "GET"),
        _probe(
            "/api/dialogue",
            "POST",
            {"npc_id": "raziel", "query": "say exactly: ROUTING-OK"},
        ),
    ]
    issues: list[dict[str, Any]] = []
    for ep in endpoints:
        if not ep.get("reachable"):
            issues.append(
                {"path": ep["path"], "kind": "unreachable", "note": ep["note"]}
            )
        elif ep.get("over_sla"):
            issues.append(
                {
                    "path": ep["path"],
                    "kind": "sla",
                    "sla_ms": SLA_MS,
                    "latency_ms": ep["latency_ms"],
                }
            )
        elif ep.get("path") == "/api/dialogue" and ep.get("source") != "ollama":
            issues.append(
                {
                    "path": ep["path"],
                    "kind": "fallback",
                    "note": "dialogue not hitting live lane (static fallback pool)",
                }
            )
    vm = _vm_state()
    if vm.get("reachable") and not vm.get("phi4_mini", {}).get("pinned"):
        issues.append(
            {
                "kind": "lane_pin_lost",
                "note": "phi4-mini no longer pinned forever on the Grok VM "
                "(re-pin num_ctx 32768 + keep_alive -1).",
            }
        )
    return {
        "ok": True,
        "generated_at": _utc_now(),
        "sla_ms": SLA_MS,
        "keep_http": KEEP_HTTP,
        "grok_vm": GROK_OLLAMA,
        "endpoints": endpoints,
        "lane": vm,
        "issues": issues,
        "healthy": not issues and all(
            e.get("reachable") for e in endpoints
        ),
    }