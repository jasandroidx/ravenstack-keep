"""Patterns ported from obsidian-second-brain (upstream best practices).

- Python-only .env load (never bash source)
- HTTP POST with 180s timeout, 3 retries, backoff on 429/5xx/network
- Fail-soft cost ledger (never aborts the observed call)
- Post-gen ASCII scrub matching validate-ai-first.sh ban list
- Gemini key in x-goog-api-key header (never query string)

Source: OSB lib/grok.py, gemini.py, usage.py, research_deep.py, validate-ai-first.sh
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Upstream grok.py / gemini.py
HTTP_TIMEOUT = 180
MAX_RETRIES = 3
BACKOFF_SECONDS = (1, 3, 8)
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})

# Upstream validate-ai-first.sh check 5
BANNED_ASCII = {
    "\u2014": " - ",  # em-dash
    "\u2013": " - ",  # en-dash
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
    "\u2265": ">=",
    "\u2264": "<=",
    "\u2260": "!=",
    "\u2026": "...",
    "\u00a0": " ",
}

DEFAULT_ENV_PATHS = (
    Path("/root/ReClaw-2.0/.env"),
    Path("/root/.env"),
    Path.home() / ".config" / "obsidian-second-brain" / ".env",
)


def load_dotenv(path: Path) -> None:
    """Parse KEY=VALUE lines into os.environ (setdefault). Never use bash source."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"[env] could not read {path}: {e}", file=sys.stderr)
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.replace("export ", "").strip()
        v = v.strip().strip('"').strip("'")
        if k:
            os.environ.setdefault(k, v)


def load_standard_env(extra: list[Path] | None = None) -> None:
    """Load known env SOTs before provider branching (OSB source_config pattern)."""
    paths = list(DEFAULT_ENV_PATHS)
    if extra:
        paths = list(extra) + paths
    for p in paths:
        load_dotenv(p)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _scrub_chars(text: str) -> str:
    return "".join(BANNED_ASCII.get(ch, ch) for ch in text)


def scrub_ascii(text: str) -> str:
    """Replace banned substitution Unicode with ASCII (lint ban list).

    OSB sweep_non_ascii.py: preserve [[wikilink]] interiors (filename chars)
    and leave content inside fenced code blocks alone for the fence lines
    themselves - we still scrub prose. Wikilink preservation is the critical
    contract so links do not break on em-dash titles.
    """
    if not text:
        return text
    # Preserve wikilink interiors verbatim
    parts: list[str] = []
    last = 0
    for m in re.finditer(r"\[\[[^\]]*\]\]", text):
        parts.append(_scrub_chars(text[last : m.start()]))
        parts.append(m.group(0))
        last = m.end()
    parts.append(_scrub_chars(text[last:]))
    return "".join(parts)


def cost_log(vault: Path, row: dict, *, relative: str = "Ravenstack/ops/harvest/cost-log.jsonl") -> None:
    """Append JSONL usage row. Fail-soft by contract (OSB usage.py)."""
    try:
        p = vault / relative
        p.parent.mkdir(parents=True, exist_ok=True)
        entry = {"ts": utc_now(), **row}
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:  # noqa: BLE001 - ledger is observability, never fatal
        print(f"[usage ledger] could not record call ({e}); continuing", file=sys.stderr)


def http_json(
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    method: str = "POST",
    timeout: int = HTTP_TIMEOUT,
    max_retries: int = MAX_RETRIES,
    label: str = "http",
) -> dict[str, Any]:
    """POST/GET JSON with OSB-style timeout + retry on 429/5xx/network.

    Returns parsed JSON dict on success.
    Raises RuntimeError after retries exhausted or on non-retryable HTTP status.
    """
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    last_err: Exception | None = None

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", errors="replace")
                if r.status == 200 or r.status == 201:
                    return json.loads(body) if body else {}
                # urlopen raises on most error statuses; this is defensive
                status = r.status
            if status in RETRY_STATUS:
                wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
                print(f"[{label} {status}, retrying in {wait}s...]", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"{label} API error {status}: {body[:500]}")
        except urllib.error.HTTPError as e:
            last_err = e
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                pass
            if e.code in RETRY_STATUS:
                wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
                print(f"[{label} {e.code}, retrying in {wait}s...]", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"{label} API error {e.code}: {err_body}") from e
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            last_err = e
            wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
            print(f"[{label} network/parse error: {e}, retrying in {wait}s...]", file=sys.stderr)
            time.sleep(wait)

    raise RuntimeError(f"{label} API failed after {max_retries} retries: {last_err}")


def openrouter_chat(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    max_chars: int = 12000,
) -> dict[str, Any]:
    """OpenRouter chat completions with retry. Free-tier model default."""
    from pricing import estimate_from_usage_block

    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        return {"ok": False, "error": "OPENROUTER_API_KEY missing", "est_usd": 0.0}
    model_id = (model or os.environ.get("RESEARCH_STRUCTURE_MODEL") or "openai/gpt-oss-20b:free")
    model_id = model_id.replace("openrouter/", "")
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt[:max_chars]})
    try:
        data = http_json(
            "https://openrouter.ai/api/v1/chat/completions",
            payload={"model": model_id, "messages": messages},
            headers={"Authorization": f"Bearer {key}"},
            label="OpenRouter",
        )
        text = data["choices"][0]["message"]["content"]
        est = estimate_from_usage_block(
            model_id, data.get("usage"), provider="openrouter"
        )
        return {
            "ok": True,
            "model": model_id,
            "text": scrub_ascii(text),
            "est_usd": est["est_usd"],
            "is_estimate": est["is_estimate"],
            "input_tokens": est["input_tokens"],
            "output_tokens": est["output_tokens"],
            "provider": "openrouter",
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "model": model_id, "est_usd": 0.0}


def gemini_generate(
    prompt: str,
    *,
    model: str | None = None,
    max_chars: int = 12000,
    max_output_tokens: int = 4000,
) -> dict[str, Any]:
    """Gemini generateContent with header API key + retry (OSB gemini.py)."""
    from pricing import estimate_from_usage_block

    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        return {"ok": False, "error": "GEMINI_API_KEY missing", "est_usd": 0.0}
    model_id = model or os.environ.get("RESEARCH_GEMINI_MODEL") or "gemini-2.5-flash"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_id}:generateContent"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt[:max_chars]}]}],
        "generationConfig": {"maxOutputTokens": max_output_tokens},
    }
    try:
        data = http_json(
            url,
            payload=payload,
            headers={"x-goog-api-key": key},
            label="Gemini",
        )
        parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
        if not text:
            reason = (data.get("candidates") or [{}])[0].get("finishReason")
            return {
                "ok": False,
                "error": f"Gemini returned no text (finishReason: {reason})",
                "model": model_id,
                "est_usd": 0.0,
            }
        est = estimate_from_usage_block(
            model_id, data.get("usageMetadata"), provider="gemini"
        )
        return {
            "ok": True,
            "model": model_id,
            "text": scrub_ascii(text),
            "est_usd": est["est_usd"],
            "is_estimate": est["is_estimate"],
            "input_tokens": est["input_tokens"],
            "output_tokens": est["output_tokens"],
            "provider": "gemini",
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "model": model_id, "est_usd": 0.0}
