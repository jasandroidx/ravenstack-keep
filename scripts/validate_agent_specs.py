#!/usr/bin/env python3
"""Validate all agents/*.agent-spec.json against schemas/agent-spec.schema.json.

Exit 0 if all valid (or no specs). Exit 1 on any failure.
Usage:
  python scripts/validate_agent_specs.py
  python scripts/validate_agent_specs.py --agents-dir path --schema path
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print("ERROR: jsonschema not installed. pip install jsonschema", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--agents-dir",
        type=Path,
        default=ROOT / "agents",
        help="Directory containing *.agent-spec.json",
    )
    ap.add_argument(
        "--schema",
        type=Path,
        default=ROOT / "schemas" / "agent-spec.schema.json",
        help="JSON Schema path",
    )
    args = ap.parse_args()

    if not args.schema.is_file():
        print(f"ERROR: schema not found: {args.schema}", file=sys.stderr)
        return 2

    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    paths = sorted(args.agents_dir.glob("*.agent-spec.json"))
    if not paths:
        print(f"No agent specs under {args.agents_dir} (ok)")
        return 0

    failed = 0
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"FAIL {path.name}: invalid JSON: {e}")
            failed += 1
            continue
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        if errors:
            print(f"FAIL {path.name}: {len(errors)} schema error(s)")
            for err in errors[:20]:
                loc = ".".join(str(p) for p in err.path) or "(root)"
                print(f"  - {loc}: {err.message}")
            failed += 1
        else:
            status = data.get("status", "?")
            aid = data.get("id", path.stem)
            print(f"OK   {path.name}  id={aid}  status={status}")

    if failed:
        print(f"\n{failed}/{len(paths)} spec(s) failed validation", file=sys.stderr)
        return 1
    print(f"\nAll {len(paths)} agent spec(s) valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
