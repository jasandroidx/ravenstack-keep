import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="keep_duty_test_"))
os.environ["KEEP_MCP_DATA"] = str(TEST_DATA_DIR)
os.environ.pop("OBSIDIAN_VAULT", None)

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import server  # noqa: E402
import duty  # noqa: E402

OUTBOX = TEST_DATA_DIR / "outbox"
OUTBOX.mkdir(parents=True, exist_ok=True)
duty.OUTBOX_DIR = OUTBOX
duty.RECLAW_API_BASE = "http://127.0.0.1:1"  # unreachable -> dark, never fabricated


class DutyBoardTest(unittest.TestCase):
    def setUp(self):
        for p in (duty.KEEP_DUTY_PATH, duty.KEEP_ROOMS_PATH):
            p.unlink(missing_ok=True)
        server.DB_PATH = TEST_DATA_DIR / "test_keep.db"
        server.DB_PATH.unlink(missing_ok=True)
        server.init_db()
        duty.DATA_DIR = TEST_DATA_DIR
        duty.KEEP_DUTY_PATH = duty.DATA_DIR / "keep-duty.json"
        duty.KEEP_ROOMS_PATH = duty.DATA_DIR / "keep-rooms.json"
        # Hermetic: do not reach the live box's OpenClaw/gate signal mirrors.
        duty.freshen_signals = lambda: {"mocked": True}

    def tearDown(self):
        server.DB_PATH.unlink(missing_ok=True)

    def _compose(self):
        return duty.compose_duty_payload()

    def test_all_leave_with_no_signals(self):
        payload = self._compose()
        agents = {a["agent_id"]: a for a in payload["duty"]}
        self.assertEqual(sorted(agents), sorted(["raziel", "oracle", "scribe", "clawforge", "corvid"]))
        for row in payload["duty"]:
            self.assertEqual(row["status"], "leave", row)

    def test_busy_after_recent_real_report(self):
        server.report_agent_status("raziel", "working", task="reviewing smoke evidence")
        payload = self._compose()
        raziel = next(a for a in payload["duty"] if a["agent_id"] == "raziel")
        self.assertEqual(raziel["status"], "busy")
        self.assertEqual(raziel["last_real_work"], "reviewing smoke evidence")

    def test_stale_report_becomes_leave(self):
        server.report_agent_status("raziel", "working", task="old job")
        with server._connect() as conn:
            conn.execute(
                "UPDATE agent_status SET updated_at = ? WHERE agent_id = 'raziel'",
                (
                    (datetime.now(timezone.utc) - timedelta(days=4))
                    .strftime("%Y-%m-%dT%H:%M:%SZ"),
                ),
            )
        payload = self._compose()
        raziel = next(a for a in payload["duty"] if a["agent_id"] == "raziel")
        self.assertEqual(raziel["status"], "leave")

    def test_gate_room_busy_with_pending_gate(self):
        import gates

        gates.init_gates_table()
        gates.add_gate("approve_spec", "oracle", "Approve Oracle Spec")
        payload = self._compose()
        gate = next(r for r in payload["rooms"] if r["room_id"] == "gate")
        self.assertEqual(gate["light"], "busy")
        self.assertGreaterEqual(len(gate["occupants"]), 0)

    def test_dock_and_api_rooms_dark_when_unreadable(self):
        payload = self._compose()
        rooms = {r["room_id"]: r for r in payload["rooms"]}
        self.assertEqual(rooms["dock"]["light"], "quiet")  # empty outbox = quiet
        self.assertEqual(rooms["auction-pit"]["light"], "dark")  # api unreachable
        self.assertEqual(rooms["watchtower"]["light"], "dark")  # api unreachable

    def test_snapshots_written_and_schema_valid(self):
        import jsonschema

        self._compose()
        rooms_schema = json.load(
            open(Path(__file__).resolve().parents[1] / "schemas" / "keep-rooms.schema.json")
        )
        duty_schema = json.load(
            open(Path(__file__).resolve().parents[1] / "schemas" / "keep-duty.schema.json")
        )
        jsonschema.validate(json.loads(duty.KEEP_ROOMS_PATH.read_text()), rooms_schema)
        jsonschema.validate(json.loads(duty.KEEP_DUTY_PATH.read_text()), duty_schema)

    def test_no_ollama_in_duty_path(self):
        self.assertNotIn("ollama", duty.compose_duty_payload().get("source", ""))
        self.assertNotIn("phi4", json.dumps(self._compose()))


if __name__ == "__main__":
    unittest.main()