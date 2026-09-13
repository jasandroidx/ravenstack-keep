import json
import os
import unittest
from pathlib import Path

# Ensure KEEP_MCP_DATA points to temporary directory before importing server
TEST_DATA_DIR = Path("/tmp/keep_mcp_test_data")
TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["KEEP_MCP_DATA"] = str(TEST_DATA_DIR)

from src import server  # noqa: E402


class TestServerOccupancySummary(unittest.TestCase):
    def setUp(self):
        server.DB_PATH = TEST_DATA_DIR / "test_keep.db"
        if server.DB_PATH.exists():
            server.DB_PATH.unlink()
        server.init_db()

    def tearDown(self):
        if server.DB_PATH.exists():
            server.DB_PATH.unlink()

    def test_get_occupancy_summary(self):
        # Call get_occupancy_summary and parse output
        res_raw = server.get_occupancy_summary()
        res = json.loads(res_raw)

        # Seed rooms: 6 total rooms
        # Secure: 2 (Great Hall, Armory)
        # Active: 3 (Alchemy Lab, Library, Observatory)
        # Restricted: 1 (Vault)
        # lock_state live: 4 (Great Hall, Alchemy Lab, Armory, Observatory)
        # lock_state UNFORGED: 1 (Library)
        # lock_state locked: 1 (Vault)
        self.assertEqual(res["room_count"], 6)
        self.assertEqual(res["rooms_by_status"], {"Secure": 2, "Active": 3, "Restricted": 1})
        self.assertEqual(res["rooms_by_lock_state"], {"live": 4, "UNFORGED": 1, "locked": 1})
        self.assertIn("Vault", res["restricted_rooms"])

    def test_get_occupancy_summary_with_custom_rooms(self):
        with server._connect() as conn:
            conn.execute(
                """
                INSERT INTO rooms (room_id, name, x, y, status, lock_state, updated_at)
                VALUES ('secret-dungeon', 'Secret Dungeon', -2, -2, 'Restricted', 'locked', '2026-09-13T00:00:00Z')
                """
            )

        res = json.loads(server.get_occupancy_summary())
        self.assertEqual(res["room_count"], 7)
        self.assertEqual(res["rooms_by_status"]["Restricted"], 2)
        self.assertEqual(res["rooms_by_lock_state"]["locked"], 2)
        self.assertIn("Secret Dungeon", res["restricted_rooms"])
        self.assertIn("Vault", res["restricted_rooms"])


if __name__ == "__main__":
    unittest.main()
