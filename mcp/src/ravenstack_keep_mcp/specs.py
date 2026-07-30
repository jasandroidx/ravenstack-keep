"""Load and validate Agent Spec files from the repo."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .paths import agents_dir, backlog_dir, schema_path


def _load_schema() -> dict[str, Any]:
    return json.loads(schema_path().read_text(encoding="utf-8"))


def validator() -> Draft202012Validator:
    return Draft202012Validator(_load_schema())


def list_spec_paths() -> list[Path]:
    d = agents_dir()
    if not d.is_dir():
        return []
    return sorted(d.glob("*.agent-spec.json"))


def load_spec(agent_id: str) -> dict[str, Any] | None:
    path = agents_dir() / f"{agent_id}.agent-spec.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_spec_markdown(agent_id: str) -> str | None:
    path = agents_dir() / f"{agent_id}.md"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def validate_spec(spec: dict[str, Any]) -> list[str]:
    v = validator()
    return [e.message for e in sorted(v.iter_errors(spec), key=lambda e: list(e.path))]


def get_agent_spec(agent_id: str, fmt: str = "json") -> dict[str, Any]:
    if fmt == "markdown":
        body = load_spec_markdown(agent_id)
        if body is None:
            return {
                "error": "not_found",
                "message": f"No markdown spec for agent_id={agent_id}",
            }
        return {
            "agent_id": agent_id,
            "format": "markdown",
            "source_path": str(agents_dir() / f"{agent_id}.md"),
            "spec": body,
        }

    spec = load_spec(agent_id)
    if spec is None:
        return {
            "error": "not_found",
            "message": f"No Agent Spec JSON for agent_id={agent_id}",
            "hint": "Only agents with agents/<id>.agent-spec.json are real.",
        }
    errors = validate_spec(spec)
    if errors:
        return {
            "error": "invalid_spec",
            "agent_id": agent_id,
            "message": "Spec failed schema validation",
            "validation_errors": errors,
            "source_path": str(agents_dir() / f"{agent_id}.agent-spec.json"),
        }
    return {
        "agent_id": agent_id,
        "status": spec.get("status"),
        "format": "json",
        "source_path": str(agents_dir() / f"{agent_id}.agent-spec.json"),
        "spec": spec,
    }


def list_agent_specs() -> dict[str, Any]:
    items = []
    for path in list_spec_paths():
        try:
            spec = json.loads(path.read_text(encoding="utf-8"))
            errs = validate_spec(spec)
            items.append(
                {
                    "agent_id": spec.get("id") or path.stem.replace(".agent-spec", ""),
                    "name": spec.get("name"),
                    "status": spec.get("status"),
                    "room_id": (spec.get("room") or {}).get("room_id"),
                    "valid": len(errs) == 0,
                    "validation_errors": errs,
                    "source_path": str(path),
                }
            )
        except Exception as e:  # noqa: BLE001
            items.append(
                {
                    "agent_id": path.name,
                    "valid": False,
                    "validation_errors": [str(e)],
                    "source_path": str(path),
                }
            )
    return {"count": len(items), "agents": items}


def save_proposed_spec(agent_id: str, spec: dict[str, Any]) -> dict[str, Any]:
    """Write draft only under backlog/ — never auto-install to agents/."""
    errors = validate_spec(spec)
    if errors:
        return {
            "ok": False,
            "error": "invalid_spec",
            "validation_errors": errors,
        }
    if spec.get("id") != agent_id:
        return {
            "ok": False,
            "error": "id_mismatch",
            "message": f"spec.id {spec.get('id')!r} != agent_id {agent_id!r}",
        }
    # Force draft status for proposals
    spec = dict(spec)
    spec["status"] = "draft"
    out = backlog_dir() / f"{agent_id}.agent-spec.draft.json"
    out.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "agent_id": agent_id,
        "path": str(out),
        "status": "draft",
        "note": "Draft only. Human must approve before agents/ install or room unlock.",
    }


def approve_spec_file(agent_id: str) -> dict[str, Any]:
    """Promote backlog draft → agents/ with status=approved. Does not unlock room."""
    draft = backlog_dir() / f"{agent_id}.agent-spec.draft.json"
    if not draft.is_file():
        # Allow approving an in-place draft under agents/
        existing = load_spec(agent_id)
        if existing and existing.get("status") == "draft":
            existing["status"] = "approved"
            errors = validate_spec(existing)
            if errors:
                return {"ok": False, "error": "invalid_spec", "validation_errors": errors}
            path = agents_dir() / f"{agent_id}.agent-spec.json"
            path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
            return {
                "ok": True,
                "agent_id": agent_id,
                "status": "approved",
                "source_path": str(path),
                "note": "Room unlock is a separate gated tool.",
            }
        return {
            "ok": False,
            "error": "not_found",
            "message": f"No draft at {draft} and no draft status in agents/",
        }

    spec = json.loads(draft.read_text(encoding="utf-8"))
    spec["status"] = "approved"
    errors = validate_spec(spec)
    if errors:
        return {"ok": False, "error": "invalid_spec", "validation_errors": errors}
    dest = agents_dir() / f"{agent_id}.agent-spec.json"
    dest.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "agent_id": agent_id,
        "status": "approved",
        "source_path": str(dest),
        "promoted_from": str(draft),
        "note": "Room unlock is a separate gated tool (unlock_room).",
    }


def retire_spec(agent_id: str) -> dict[str, Any]:
    spec = load_spec(agent_id)
    if not spec:
        return {"ok": False, "error": "not_found", "message": f"No spec for {agent_id}"}
    spec["status"] = "retired"
    if isinstance(spec.get("room"), dict):
        spec["room"] = dict(spec["room"])
        if spec["room"].get("lock_state") == "live":
            spec["room"]["lock_state"] = "locked"
    path = agents_dir() / f"{agent_id}.agent-spec.json"
    path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "agent_id": agent_id,
        "status": "retired",
        "source_path": str(path),
    }


def diff_spec(agent_id: str) -> dict[str, Any]:
    """Diff agents/ live file vs backlog draft if present."""
    live = load_spec(agent_id)
    draft_path = backlog_dir() / f"{agent_id}.agent-spec.draft.json"
    draft = None
    if draft_path.is_file():
        draft = json.loads(draft_path.read_text(encoding="utf-8"))
    if live is None and draft is None:
        return {"error": "not_found", "agent_id": agent_id}
    live_s = json.dumps(live, indent=2, sort_keys=True) if live else ""
    draft_s = json.dumps(draft, indent=2, sort_keys=True) if draft else ""
    # Simple line-level unified-ish summary
    live_lines = live_s.splitlines()
    draft_lines = draft_s.splitlines()
    only_live = sorted(set(live_lines) - set(draft_lines))
    only_draft = sorted(set(draft_lines) - set(live_lines))
    return {
        "agent_id": agent_id,
        "has_live": live is not None,
        "has_draft": draft is not None,
        "live_status": (live or {}).get("status"),
        "draft_status": (draft or {}).get("status"),
        "lines_only_in_live_sample": only_live[:40],
        "lines_only_in_draft_sample": only_draft[:40],
        "identical": live_s == draft_s and live is not None and draft is not None,
        "note": "Shallow line-set diff for review; not a structural JSON patch.",
    }
