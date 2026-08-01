"""Perplexity Sonar client (OSB research/lib/perplexity.py port).

Optional: only used when PERPLEXITY_API_KEY is set.
Timeout 120s (300s deep), retry 429/5xx, strip <think> blocks, fail-soft cost log.
"""
from __future__ import annotations

import os
import re
import sys
import time
from typing import Any

from osb_patterns import BACKOFF_SECONDS, MAX_RETRIES, RETRY_STATUS, scrub_ascii

API_URL = "https://perplexity.ai/chat/completions"
# Official endpoint (OSB):
API_URL = "https://api.perplexity.ai/chat/completions"
_THINK_BLOCK = re.compile(r"<think>.*?</think>\s*", re.DOTALL | re.IGNORECASE)


def call(
    prompt: str,
    *,
    model: str | None = None,
    deep: bool = False,
    max_tokens: int = 4000,
    command: str = "research",
    vault_for_cost=None,
) -> dict[str, Any]:
    key = os.environ.get("PERPLEXITY_API_KEY", "").strip()
    if not key:
        return {"ok": False, "error": "PERPLEXITY_API_KEY missing", "est_usd": 0.0}

    model = model or (
        os.environ.get("PERPLEXITY_DEEP_MODEL", "sonar-deep-research")
        if deep
        else os.environ.get("PERPLEXITY_RESEARCH_MODEL", "sonar-pro")
    )
    timeout = 300 if deep else 120
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
    }

    import json
    import urllib.error
    import urllib.request

    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                API_URL,
                data=json.dumps(body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read().decode("utf-8"))
            text = data["choices"][0]["message"]["content"]
            text = _THINK_BLOCK.sub("", text)
            if "<think>" in text:
                text = text.split("<think>")[0]
            text = scrub_ascii(text.strip())
            citations = data.get("citations") or data.get("search_results") or []
            u = data.get("usage") or {}
            from pricing import estimate_from_usage_block

            est = estimate_from_usage_block(model, u, provider="perplexity")
            in_tok = est["input_tokens"]
            out_tok = est["output_tokens"]
            if vault_for_cost is not None:
                from osb_patterns import cost_log

                cost_log(
                    vault_for_cost,
                    {
                        "stage": command,
                        "provider": "perplexity",
                        "model": model,
                        "input_tokens": in_tok,
                        "output_tokens": out_tok,
                        "est_usd": est["est_usd"],
                        "is_estimate": est["is_estimate"],
                        "ok": True,
                    },
                )
            return {
                "ok": True,
                "text": text,
                "citations": citations,
                "model": model,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "est_usd": est["est_usd"],
                "is_estimate": est["is_estimate"],
                "raw": data,
            }
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in RETRY_STATUS:
                wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
                print(f"[Perplexity {e.code}, retrying in {wait}s...]", file=sys.stderr)
                time.sleep(wait)
                continue
            body_err = ""
            try:
                body_err = e.read().decode("utf-8", errors="replace")[:500]
            except Exception:
                pass
            return {"ok": False, "error": f"HTTP {e.code}: {body_err}", "model": model, "est_usd": 0.0}
        except Exception as e:
            last_err = e
            wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
            print(f"[Perplexity network error: {e}, retrying in {wait}s...]", file=sys.stderr)
            time.sleep(wait)

    return {
        "ok": False,
        "error": f"Perplexity failed after {MAX_RETRIES} retries: {last_err}",
        "model": model,
        "est_usd": 0.0,
    }
