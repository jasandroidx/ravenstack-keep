import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="keep_extras_test_"))
os.environ["KEEP_MCP_DATA"] = str(TEST_DATA_DIR)
os.environ.pop("OBSIDIAN_VAULT", None)

SRC = Path(__file__).resolve().parent / "src"
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC))

import server  # noqa: E402
import gates  # noqa: E402
import bubbles  # noqa: E402
import duty  # noqa: E402
import routing_status  # noqa: E402

SPEC_TMPL = None


class KeepExtrasTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        global SPEC_TMPL
        src_spec = REPO / "agents" / "raziel.agent-spec.json"
        if src_spec.is_file():
            data = json.loads(src_spec.read_text(encoding="utf-8"))
            SPEC_TMPL = data

    def setUp(self):
        server.DATA_DIR = TEST_DATA_DIR
        server.DB_PATH = TEST_DATA_DIR / "keep_extras.db"
        server.DB_PATH.unlink(missing_ok=True)
        server.AGENTS_DIR = REPO / "agents"
        gates.AGENTS_DIR = server.AGENTS_DIR
        self.agents_dir = TEST_DATA_DIR / "agents"
        self.agents_dir.mkdir(exist_ok=True)
        if SPEC_TMPL is not None:
            (self.agents_dir / "raziel.agent-spec.json").write_text(
                json.dumps(SPEC_TMPL, indent=2) + "\n", encoding="utf-8"
            )
        server.AGENTS_DIR = self.agents_dir
        gates.AGENTS_DIR = self.agents_dir
        server.init_db()
        bubbles._bubbles_path().unlink(missing_ok=True)
        duty.DATA_DIR = TEST_DATA_DIR
        duty.KEEP_DUTY_PATH = duty.DATA_DIR / "keep-duty.json"
        duty.KEEP_ROOMS_PATH = duty.DATA_DIR / "keep-rooms.json"
        outbox = TEST_DATA_DIR / "outbox"
        outbox.mkdir(exist_ok=True)
        duty.OUTBOX_DIR = outbox
        duty.RECLAW_API_BASE = "http://127.0.0.1:1"
        duty.freshen_signals = lambda: {"mocked": True}

    def tearDown(self):
        server.DB_PATH.unlink(missing_ok=True)
        server.AGENTS_DIR = REPO / "agents"
        gates.AGENTS_DIR = server.AGENTS_DIR

    # -- bubbles -------------------------------------------------------------

    def test_bubbles_empty_when_no_cache(self):
        result = bubbles.get_bubbles()
        self.assertTrue(result["ok"])
        self.assertEqual(result["bubbles"], [])

    def test_publish_requires_confirm(self):
        result = bubbles.publish_bubble("raziel", "great-hall", "hello")
        self.assertFalse(result.get("ok"))
        self.assertEqual(result.get("code"), "confirm_required")

    def test_publish_then_read_roundtrip(self):
        result = bubbles.publish_bubble(
            "raziel", "great-hall", "Night is kept", confirm=True
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["bubble"]["agent_id"], "raziel")
        read = bubbles.get_bubbles()
        self.assertEqual(read["total"], 1)
        self.assertEqual(read["bubbles"][0]["model"], "phi4-mini")
        filtered = bubbles.get_bubbles(room_id="library")
        self.assertEqual(filtered["bubbles"], [])

    def test_bubbles_reject_unknown_agent_and_room(self):
        self.assertEqual(
            bubbles.publish_bubble("ghost", "great-hall", "x", confirm=True).get("code"),
            "unknown_agent",
        )
        self.assertEqual(
            bubbles.publish_bubble("raziel", "nowhere", "x", confirm=True).get("code"),
            "not_found",
        )

    def test_bubbles_reject_overlong_text(self):
        result = bubbles.publish_bubble(
            "raziel", "great-hall", "x" * 161, confirm=True
        )
        self.assertEqual(result.get("code"), "invalid_input")

    def test_bubbles_respect_cap(self):
        for i in range(5):
            bubbles.publish_bubble(
                "raziel", "great-hall", f"bubble {i}", confirm=True, max_bubbles=2
            )
        read = bubbles.get_bubbles()
        self.assertEqual(read["total"], 2)
        self.assertEqual(read["bubbles"][0]["text"], "bubble 4")

    # -- gates ---------------------------------------------------------------

    def test_lock_room_requires_confirm(self):
        result = gates.lock_room("armory")
        self.assertEqual(result.get("code"), "confirm_required")

    def test_lock_unlock_roundtrip(self):
        locked = gates.lock_room("armory", confirm=True)
        self.assertTrue(locked["ok"])
        self.assertEqual(locked["lock_state"], "locked")
        unlocked = gates.unlock_room("armory", confirm=True)
        self.assertEqual(unlocked["lock_state"], "live")

    def test_lock_unknown_room(self):
        result = gates.lock_room("nope", confirm=True)
        self.assertEqual(result.get("code"), "not_found")

    def test_upsert_spec_requires_confirm_and_valid_json(self):
        self.assertEqual(
            gates.upsert_agent_spec("flipper", "{}").get("code"), "confirm_required"
        )
        self.assertEqual(
            gates.upsert_agent_spec("flipper", "{not json", confirm=True).get("code"),
            "invalid_input",
        )

    def test_upsert_spec_writes_draft(self):
        if SPEC_TMPL is None:
            self.skipTest("no spec template available")
        body = dict(SPEC_TMPL)
        body["id"] = "flipper"
        body["name"] = "Flipper"
        body["status"] = "draft"
        result = gates.upsert_agent_spec("flipper", json.dumps(body), confirm=True)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["status"], "draft")
        self.assertTrue(Path(result["source_path"]).is_file())

    def test_upsert_spec_never_auto_approves(self):
        if SPEC_TMPL is None:
            self.skipTest("no spec template available")
        body = dict(SPEC_TMPL)
        body["id"] = "flipper2"
        body["status"] = "live"
        result = gates.upsert_agent_spec("flipper2", json.dumps(body), confirm=True)
        self.assertEqual(result.get("code"), "confirm_required")

    # -- routing status ------------------------------------------------------

    def test_routing_status_reports_unreachable(self):
        routing_status.KEEP_HTTP = "http://127.0.0.1:1"
        routing_status.GROK_OLLAMA = "http://127.0.0.1:1"
        report = routing_status.routing_status()
        self.assertTrue(report["ok"])
        self.assertTrue(all(not e["reachable"] for e in report["endpoints"]))
        self.assertFalse(report["healthy"])
        self.assertTrue(report["issues"])

    # -- shift board delegation ---------------------------------------------

    def test_shift_board_tools_parse(self):
        import json

        board = json.loads(server.get_shift_board(refresh=True))
        self.assertTrue(board["ok"])
        self.assertIn("duty", board)
        self.assertIn("rooms", board)
        roster = json.loads(server.get_duty_roster())
        self.assertEqual(roster["total"], len(roster["duty"]))
        self.assertIn("rooms", json.loads(server.get_rooms_snapshot()))


if __name__ == "__main__":
    unittest.main()