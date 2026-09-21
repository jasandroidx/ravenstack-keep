#!/usr/bin/env python3
"""Phrase Farmer: batch generator of static NPC/prop content for the Keep.

Write-once, read-many. Runs on a systemd timer — never at interaction time —
and is the ONLY writer of the phrases pool the UI reads. The lane (Ollama)
cannot be called from the game/http path; the pool is always static per run.

Guards:
- stale > broken: a target that fails to compile keeps its previous lines,
  flagged stale: true, instead of vanishing from the pool.
- validation: output categories outside the YAML are discarded; over-long or
  empty lines dropped; missing/empty categories fall back to the old pool.
- model JSON is fence-stripped and brace-sliced before parsing.
- secrets never enter the prompt (only name/voice/categories + coarse signals).
"""
import os
import re
import json
import time
import urllib.request
import urllib.error
import yaml
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TARGETS_DIR = Path(os.getenv("FARMER_TARGETS_DIR", BASE_DIR / "farmer" / "targets"))
OUTPUT_FILE = Path(os.getenv("FARMER_OUTPUT_FILE", BASE_DIR / "public" / "data" / "phrases.json"))

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://100.97.223.55:11434")
KEEP_GATES_URL = os.getenv("KEEP_GATES_URL", "http://127.0.0.1:8112/api/gates")
MODEL_NAME = os.getenv("OLLAMA_MODEL", "phi4-mini")

SIGNALS_TIMEOUT = float(os.getenv("FARMER_SIGNALS_TIMEOUT", "3"))
LANE_TIMEOUT = float(os.getenv("FARMER_LANE_TIMEOUT", "30"))
MAX_LINE_CHARS = 160

LINE_WEIGHT = 10


def _out(obj) -> None:
    print(obj, flush=True)


def get_keep_state() -> dict:
    """Read coarse keep signals to seed prompts. Never required — empty on failure."""
    try:
        req = urllib.request.Request(KEEP_GATES_URL, headers={"User-Agent": "PhraseFarmer/1.0"})
        with urllib.request.urlopen(req, timeout=SIGNALS_TIMEOUT) as resp:
            raw = json.loads(resp.read().decode())
    except Exception as e:
        _out(f"[!] keep signals unavailable ({e}); using empty state")
        return {"gates": [], "waiting_human_agents": [], "count": 0}

    if isinstance(raw, list):
        return {"gates": raw, "waiting_human_agents": [], "count": len(raw)}

    gates = raw.get("gates", raw.get("items", []))
    if not isinstance(gates, list):
        gates = [] if gates is None else list(gates)
    waiting = raw.get("waiting_human_agents", [])
    waiting = waiting if isinstance(waiting, list) else []
    count = len(gates) or int(raw.get("count", 0) or 0)
    return {"gates": gates, "waiting_human_agents": waiting, "count": count}


def parse_json_block(raw: str) -> dict:
    """Model output -> dict. Strips markdown fences, then slices first-to-last brace."""
    data = raw.strip()
    if data.startswith("```"):
        data = re.sub(r"^```[a-zA-Z]*\s*", "", data)
        data = re.sub(r"\s*```$", "", data)
    start = data.find("{")
    end = data.rfind("}")
    if start == -1 or end < start:
        raise ValueError(f"no JSON object in model output: {data[:120]!r}")
    return json.loads(data[start:end + 1])


def call_ollama_json(system_prompt: str, user_prompt: str) -> dict:
    payload = {
        "model": MODEL_NAME,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt + "\nReturn strictly valid JSON."},
            {"role": "user", "content": user_prompt},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat", data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=LANE_TIMEOUT) as resp:
        res = json.loads(resp.read().decode())
    return parse_json_block(res["message"]["content"])


def clean_lines(lines) -> list:
    """Dedupe, non-empty, strip, drop anything over the bubble cap."""
    seen = set()
    out = []
    for line in lines if isinstance(lines, list) else []:
        if not isinstance(line, str):
            continue
        text = line.strip()
        if not text or len(text) > MAX_LINE_CHARS or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def load_previous_pool() -> dict:
    if not OUTPUT_FILE.exists():
        return {"_meta": {}, "targets": {}}
    try:
        previous = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
        return {"_meta": previous.get("_meta", {}), "targets": previous.get("targets", {})}
    except Exception as e:
        _out(f"[!] could not read previous pool ({e}); starting fresh")
        return {"_meta": {}, "targets": {}}


def build_phrase_farmer() -> None:
    _out(f"=== Starting Phrase Farmer ({MODEL_NAME} @ {OLLAMA_URL}) ===")

    keep_state = get_keep_state()
    signal_summary = (
        f"Active Gate Count: {keep_state['count']}, "
        f"Waiting Agents: {len(keep_state['waiting_human_agents'])}"
    )
    _out(f"[*] Ingested State Signals: {signal_summary}")

    previous = load_previous_pool()
    old_targets = previous["targets"]
    now = int(time.time())

    compiled_pool = {
        "_meta": {
            "generated_at": now,
            "previous_generated_at": previous["_meta"].get("generated_at"),
            "state_snapshot": signal_summary,
            "warnings": [],
        },
        "targets": {},
    }
    telephone_rumors = []

    if not TARGETS_DIR.exists():
        _out(f"[!] no targets dir {TARGETS_DIR}; nothing to compile")
        compiled_pool["_meta"]["warnings"].append("no targets dir")
    else:
        yaml_files = sorted(TARGETS_DIR.glob("*.yaml"))
        if not yaml_files:
            _out(f"[!] no YAML targets in {TARGETS_DIR}; nothing to compile")
            compiled_pool["_meta"]["warnings"].append("no YAML targets")

        for target_path in yaml_files:
            with open(target_path, "r", encoding="utf-8") as f:
                target = yaml.safe_load(f)

            target_id = target["id"]
            expected_categories = dict(target.get("categories", {}))
            _out(f"[*] Compiling target: {target['name']} ({target_id})...")

            system_prompt = (
                f"You are a narrative generator for Keep. Target Name: {target['name']}. "
                f"Type: {target['type']}. Voice: {target.get('voice', 'Neutral')}. "
                f"State: {signal_summary}. "
                "Speak only in character. Never claim to take actions, "
                "remember prior visitors, or know anything beyond the state given."
            )
            user_prompt = "Generate categories:\n"
            for cat_name, cat_cfg in expected_categories.items():
                user_prompt += f"- Category '{cat_name}' ({cat_cfg['count']} items): {cat_cfg['prompt']}\n"
            if telephone_rumors:
                user_prompt += f"\nMisunderstand and rewrite rumors: {json.dumps(telephone_rumors[-2:])}"
            user_prompt += '\nOutput JSON structure: {"categories": {"category_name": ["line 1"]}}'

            previous_target = old_targets.get(target_id)

            try:
                result = call_ollama_json(system_prompt, user_prompt)
                categories_out = result.get("categories", {})
                if not isinstance(categories_out, dict):
                    raise ValueError("categories in model output is not an object")

                fresh_lines = {
                    cat: clean_lines(categories_out.get(cat, []))
                    for cat in expected_categories
                }
                gossip = categories_out.get("gossip")
                if gossip:
                    telephone_rumors.extend(t for t in clean_lines(gossip))

                lines = {}
                for cat in expected_categories:
                    new = fresh_lines.get(cat, [])
                    if new:
                        lines[cat] = [{"text": t, "weight": LINE_WEIGHT, "stale": False} for t in new]
                        continue
                    old = (previous_target or {}).get("lines", {}).get(cat, [])
                    if old:
                        lines[cat] = [dict(entry, stale=True) for entry in old]
                        compiled_pool["_meta"]["warnings"].append(f"{target_id}/{cat}: empty, kept stale")
                    else:
                        lines[cat] = []
                        compiled_pool["_meta"]["warnings"].append(f"{target_id}/{cat}: empty, none to keep")

                compiled_pool["targets"][target_id] = {
                    "name": target["name"],
                    "type": target["type"],
                    "min_gate": target.get("min_gate", 0),
                    "audio_seed": target.get("audio_seed", {"type": "sine", "base_freq": 220, "decay": 0.1}),
                    "lines": lines,
                }
                total = sum(len(v) for v in lines.values())
                _out(f"  [✓] Compiled {total} lines.")
            except Exception as e:
                _out(f"  [✗] Failed to compile {target_id}: {e}")
                if previous_target:
                    compiled_pool["targets"][target_id] = {
                        "name": target["name"],
                        "type": target["type"],
                        "min_gate": target.get("min_gate", 0),
                        "audio_seed": target.get("audio_seed", {"type": "sine", "base_freq": 220, "decay": 0.1}),
                        "lines": {cat: [dict(entry, stale=True) for entry in entry_list]
                                  for cat, entry_list in previous_target.get("lines", {}).items()},
                    }
                    compiled_pool["_meta"]["warnings"].append(f"{target_id}: failed, kept stale")
                else:
                    compiled_pool["_meta"]["warnings"].append(f"{target_id}: failed, no previous pool")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp_output = OUTPUT_FILE.with_name(OUTPUT_FILE.name + ".tmp")
    with open(tmp_output, "w", encoding="utf-8") as f:
        json.dump(compiled_pool, f, indent=2, ensure_ascii=False)
    os.replace(tmp_output, OUTPUT_FILE)
    _out(f"=== Compilation Complete -> {OUTPUT_FILE} ===")


if __name__ == "__main__":
    build_phrase_farmer()