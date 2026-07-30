"""Tests for Keep MCP store, specs, scope, and gated tools."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "mcp" / "src"
sys.path.insert(0, str(SRC))

from ravenstack_keep_mcp import knowledge as kn  # noqa: E402
from ravenstack_keep_mcp import specs as sp  # noqa: E402
from ravenstack_keep_mcp.store import KeepStore  # noqa: E402


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("KEEP_MCP_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("KEEP_MCP_SEEDS", str(ROOT / "mcp" / "seeds"))
    monkeypatch.setenv("KEEP_AGENTS_DIR", str(ROOT / "agents"))
    monkeypatch.setenv(
        "KEEP_AGENT_SPEC_SCHEMA", str(ROOT / "schemas" / "agent-spec.schema.json")
    )
    # force re-import path resolution — KeepStore uses db_path() at init
    s = KeepStore(path=tmp_path / "data" / "keep.sqlite3")
    # bootstrap seeds manually if empty
    s.bootstrap_from_seeds()
    return s


def test_bootstrap_rooms(store: KeepStore):
    rooms = store.list_rooms()
    assert len(rooms) >= 5
    ids = {r["room_id"] for r in rooms}
    assert "oracle" in ids
    assert "clawforge" in ids
    assert store.get_meta("sot_status") == "CANONICAL"
    assert store.get_meta("castle_map_seed") in ("castle_map.json", "castle_map.provisional.json")


def test_report_and_waiting(store: KeepStore):
    store.report_agent_status("oracle", "waiting_human", task="approve draft")
    waiting = store.list_waiting_human()
    assert any(w["agent_id"] == "oracle" for w in waiting)


def test_get_oracle_spec_valid():
    result = sp.get_agent_spec("oracle")
    assert "error" not in result
    assert result["status"] == "draft"
    assert result["spec"]["id"] == "oracle"


def test_scope_denied_general():
    out = kn.query_scoped_knowledge("oracle", "test", indexes=["general"])
    assert out.get("error") == "scope_denied" or out.get("code") == "scope_denied"


def test_scope_denied_unknown_index():
    out = kn.query_scoped_knowledge("oracle", "test", indexes=["domain"])
    assert out.get("code") == "scope_denied"


def test_explain_scope_oracle():
    out = kn.explain_scope("oracle")
    assert out["agent_id"] == "oracle"
    assert "self" in out["indexes"]


def test_cost_summary_zeros(store: KeepStore):
    c = store.cost_summary()
    assert c["total_est_usd"] == 0.0
    assert "zeros" in c["notes"].lower() or "stub" in c["notes"].lower()


def test_a2a_empty_honest(store: KeepStore):
    t = store.get_agent_trace("does-not-exist")
    assert t["instrumented"] is False
    assert t["messages"] == []


def test_gate_confirm_pattern():
    # import server helpers via functions
    from ravenstack_keep_mcp.server import approve_spec, unlock_room

    r = approve_spec("oracle", confirm=False)
    assert r.get("code") == "confirm_required" or r.get("error") == "confirm_required"
    r2 = unlock_room("oracle", confirm=False)
    assert r2.get("code") == "confirm_required"


def test_propose_writes_backlog(tmp_path, monkeypatch):
    monkeypatch.setenv("KEEP_BACKLOG_DIR", str(tmp_path / "backlog"))
    monkeypatch.setenv("KEEP_AGENTS_DIR", str(ROOT / "agents"))
    monkeypatch.setenv(
        "KEEP_AGENT_SPEC_SCHEMA", str(ROOT / "schemas" / "agent-spec.schema.json")
    )
    live = sp.load_spec("oracle")
    assert live
    draft = dict(live)
    draft["id"] = "oracle"
    draft["status"] = "draft"
    out = sp.save_proposed_spec("oracle", draft)
    assert out["ok"] is True
    assert Path(out["path"]).is_file()
