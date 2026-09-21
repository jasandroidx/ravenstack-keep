#!/usr/bin/env python3
"""Hermetic tests for the Phrase Farmer. No network, no lane, no real signals.

Run:  python3 -m unittest test_farmer -v
Requires: PyYAML (python3 -c 'import yaml').
"""
import os
import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phrase_farmer as farm

TARGET_YAML = """\
id: "npc_gasket"
name: "Gasket"
type: "npc"
voice: "Gruff, tired"
min_gate: 1
audio_seed: {type: "sawtooth", base_freq: 110, decay: 0.25}

categories:
  greetings:
    count: 3
    prompt: "Short 1-line hellos."
  ambient:
    count: 3
    prompt: "Self-mutterings about furnace heat."
  gossip:
    count: 2
    prompt: "Rumors or complaints about current gate status."
"""

GOOD_MODEL_JSON = {
    "categories": {
        "greetings": ["Ey up.", "Steam's up, you're not.", "Been a dog of a shift."],
        "ambient": ["Pipe's got a whine again.", "Hot today. Hottest shift yet.", "Crown nut's seized."],
        "gossip": ["Gate's been quiet. Too quiet.", "Furnace crew swapped three times."],
    }
}


class FarmerTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.targets = Path(self.tmp.name) / "targets"
        self.targets.mkdir()
        self.out = Path(self.tmp.name) / "out" / "phrases.json"
        (self.targets / "furnace_gasket.yaml").write_text(TARGET_YAML, encoding="utf-8")
        self._orig_targets = farm.TARGETS_DIR
        self._orig_output = farm.OUTPUT_FILE
        farm.TARGETS_DIR = self.targets
        farm.OUTPUT_FILE = self.out

    def tearDown(self):
        farm.TARGETS_DIR = self._orig_targets
        farm.OUTPUT_FILE = self._orig_output
        self.tmp.cleanup()

    def seed_old_pool(self, lines_by_cat, target_id="npc_gasket"):
        self.out.parent.mkdir(parents=True, exist_ok=True)
        pool = {
            "_meta": {"generated_at": 1},
            "targets": {
                target_id: {
                    "name": "Gasket",
                    "type": "npc",
                    "min_gate": 0,
                    "audio_seed": {"type": "sine"},
                    "lines": {
                        cat: [{"text": t, "weight": 10, "stale": False} for t in lines]
                        for cat, lines in lines_by_cat.items()
                    },
                }
            },
        }
        self.out.write_text(json.dumps(pool), encoding="utf-8")


class FarmerCompileTests(FarmerTestBase):
    def test_compile_success_writes_pool(self):
        farm.get_keep_state = mock.Mock(return_value={"gates": [], "waiting_human_agents": ["oracle"], "count": 1})
        farm.call_ollama_json = mock.Mock(return_value=GOOD_MODEL_JSON)

        farm.build_phrase_farmer()

        pool = json.loads(self.out.read_text(encoding="utf-8"))
        target = pool["targets"]["npc_gasket"]
        self.assertEqual(sorted(target["lines"]), ["ambient", "gossip", "greetings"])
        self.assertEqual(len(target["lines"]["greetings"]), 3)
        self.assertEqual(len(target["lines"]["ambient"]), 3)
        self.assertEqual(len(target["lines"]["gossip"]), 2)
        self.assertTrue(all(e["stale"] is False for cat in target["lines"] for e in target["lines"][cat]))
        self.assertEqual(target["audio_seed"]["type"], "sawtooth")
        self.assertEqual(target["min_gate"], 1)
        self.assertIn("state_snapshot", pool["_meta"])
        self.assertFalse(self.out.with_name(self.out.name + ".tmp").exists())

    def test_failure_keeps_previous_lines_stale(self):
        self.seed_old_pool({"greetings": ["Old hello."], "ambient": ["Old mutter."]})
        farm.call_ollama_json = mock.Mock(side_effect=Exception("lane down"))
        farm.get_keep_state = mock.Mock(return_value={"gates": [], "waiting_human_agents": [], "count": 0})

        farm.build_phrase_farmer()

        pool = json.loads(self.out.read_text(encoding="utf-8"))
        target = pool["targets"]["npc_gasket"]
        self.assertEqual(target["lines"]["greetings"][0]["text"], "Old hello.")
        self.assertTrue(target["lines"]["greetings"][0]["stale"])
        self.assertTrue(any(w.endswith("failed, kept stale") for w in pool["_meta"]["warnings"]))

    def test_bad_model_output_is_cleaned_and_missing_category_kept_stale(self):
        self.seed_old_pool({"gossip": ["Old rumor."]})
        bad = {
            "categories": {
                "greetings": ["Fine.", "", "x" * 300, "Fine."],
                "introduced_nonsense": ["Drop me"],
                "ambient": [],
            }
        }
        farm.call_ollama_json = mock.Mock(return_value=bad)
        farm.get_keep_state = mock.Mock(return_value={"gates": [], "waiting_human_agents": [], "count": 0})

        farm.build_phrase_farmer()

        pool = json.loads(self.out.read_text(encoding="utf-8"))
        target = pool["targets"]["npc_gasket"]
        self.assertNotIn("introduced_nonsense", target["lines"])
        self.assertEqual(target["lines"]["greetings"], [{"text": "Fine.", "weight": 10, "stale": False}])
        self.assertEqual(target["lines"]["ambient"], [])
        self.assertEqual(target["lines"]["gossip"][0]["text"], "Old rumor.")
        self.assertTrue(target["lines"]["gossip"][0]["stale"])


class ParsingTests(unittest.TestCase):
    def test_parse_json_block_strips_fences_and_prose(self):
        raw = 'Sure thing!\n```json\n{"categories": {"greetings": ["Ey up."]}}\n```\nHope that helps.'
        out = farm.parse_json_block(raw)
        self.assertEqual(out["categories"]["greetings"], ["Ey up."])

    def test_parse_json_block_requires_object(self):
        with self.assertRaises(ValueError):
            farm.parse_json_block("not json at all")

    def test_clean_lines_dedupes_caps_and_drops_nonstrings(self):
        lines = ["short", "short", "", "x" * 161, None, 5, "  padded  "]
        self.assertEqual(farm.clean_lines(lines), ["short", "padded"])


if __name__ == "__main__":
    unittest.main()