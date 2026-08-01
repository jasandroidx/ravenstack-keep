"""Sentinel-safe note sections (OSB /obsidian-architect pattern).

On refresh: replace ONLY content inside @generated blocks.
Never touch @user blocks or prose outside markers.

Markers (HTML comments so Obsidian renders cleanly):
  <!-- @generated:start --> ... <!-- @generated:end -->
  <!-- @user:start --> ... <!-- @user:end -->
"""
from __future__ import annotations

import re
from typing import Iterable

GEN_START = "<!-- @generated:start -->"
GEN_END = "<!-- @generated:end -->"
USER_START = "<!-- @user:start -->"
USER_END = "<!-- @user:end -->"

_GEN_BLOCK = re.compile(
    r"<!--\s*@generated:start\s*-->.*?<!--\s*@generated:end\s*-->",
    re.DOTALL | re.IGNORECASE,
)


def wrap_generated(body: str) -> str:
    body = body.strip()
    return f"{GEN_START}\n{body}\n{GEN_END}"


def wrap_user(body: str) -> str:
    body = body.strip()
    return f"{USER_START}\n{body}\n{USER_END}"


def has_generated_markers(text: str) -> bool:
    return bool(_GEN_BLOCK.search(text))


def replace_generated(existing: str, new_generated_body: str) -> str:
    """Replace first @generated block; if none, append a new block at end.

    Preserves all @user blocks and any content outside markers.
    """
    new_block = wrap_generated(new_generated_body)
    if _GEN_BLOCK.search(existing):
        return _GEN_BLOCK.sub(new_block, existing, count=1)
    # First run on an existing freeform note: append generated block
    return existing.rstrip() + "\n\n" + new_block + "\n"


def merge_note(
    *,
    frontmatter_yaml: str,
    preamble: str,
    generated_body: str,
    existing: str | None = None,
    extra_outside: str = "",
) -> str:
    """Build full note; if existing has markers, only refresh generated body.

    frontmatter_yaml should include opening/closing --- lines.
    """
    gen = wrap_generated(generated_body)
    if existing and has_generated_markers(existing):
        # keep existing frontmatter/preamble/user sections; only refresh gen
        return replace_generated(existing, generated_body)
    parts = [frontmatter_yaml.rstrip(), "", preamble.strip(), "", gen]
    if extra_outside.strip():
        parts.extend(["", extra_outside.strip()])
    return "\n".join(parts).rstrip() + "\n"
