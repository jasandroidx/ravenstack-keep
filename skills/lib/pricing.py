"""Token cost estimates (OSB usage.py pattern).

STALE tables are estimates for visibility, not billing. Unknown models fall
back to a conservative rate and set is_estimate=True.
Per 1M tokens USD unless noted.
"""
from __future__ import annotations

from typing import Any

# xAI (as of OSB 2026 tables + public list)
GROK_PRICING = {
    "grok-4.20-reasoning": {"input": 3.00, "output": 15.00},
    "grok-4.5": {"input": 3.00, "output": 15.00},
    "grok-4.3": {"input": 3.00, "output": 15.00},
    "grok-4": {"input": 3.00, "output": 15.00},
    "grok-3": {"input": 2.00, "output": 10.00},
}

PERPLEXITY_PRICING = {
    "sonar": {"input": 1.00, "output": 1.00},
    "sonar-pro": {"input": 3.00, "output": 15.00},
    "sonar-deep-research": {"input": 2.00, "output": 8.00},
    "sonar-reasoning-pro": {"input": 2.00, "output": 8.00},
}

# Gemini free tier flash: honest $0; pro/paid rates approximate public list
GEMINI_PRICING = {
    "gemini-2.5-flash": {"input": 0.0, "output": 0.0, "free_tier": True},
    "gemini-2.0-flash": {"input": 0.0, "output": 0.0, "free_tier": True},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
}

# OpenRouter: free models end with :free; paid models use rough defaults
OPENROUTER_FREE_SUFFIX = ":free"
# conservative default for unknown paid OR models (per 1M)
OR_DEFAULT = {"input": 0.50, "output": 1.50}


def _norm(model: str) -> str:
    return (model or "").strip().replace("openrouter/", "")


def is_free_model(model: str) -> bool:
    m = _norm(model).lower()
    if not m or m in ("none", "local", "phi4-mini", "phi4-mini:latest"):
        return True
    if m.endswith(OPENROUTER_FREE_SUFFIX):
        return True
    if m.startswith("ollama/") or m.startswith("phi") or m.startswith("gemma"):
        return True
    if m in GEMINI_PRICING and GEMINI_PRICING[m].get("free_tier"):
        return True
    return False


def estimate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    *,
    provider: str | None = None,
) -> dict[str, Any]:
    """Return {est_usd, is_estimate, provider, rates_used}."""
    m = _norm(model)
    in_t = max(0, int(input_tokens or 0))
    out_t = max(0, int(output_tokens or 0))
    prov = (provider or "").lower() or _guess_provider(m)

    if is_free_model(m):
        return {
            "est_usd": 0.0,
            "is_estimate": False,
            "provider": prov,
            "rates_used": {"input": 0.0, "output": 0.0},
            "input_tokens": in_t,
            "output_tokens": out_t,
            "model": m,
        }

    rates = None
    is_est = False

    if prov == "perplexity" or m in PERPLEXITY_PRICING:
        rates = PERPLEXITY_PRICING.get(m)
        if not rates:
            rates = PERPLEXITY_PRICING["sonar-pro"]
            is_est = True
        prov = "perplexity"
    elif prov == "gemini" or m in GEMINI_PRICING or m.startswith("gemini"):
        rates = GEMINI_PRICING.get(m)
        if not rates:
            # unknown gemini: treat as free-flash estimate
            rates = {"input": 0.0, "output": 0.0}
            is_est = True
        prov = "gemini"
    elif prov == "xai" or m.startswith("grok"):
        rates = GROK_PRICING.get(m)
        if not rates:
            rates = GROK_PRICING["grok-4.5"]
            is_est = True
        prov = "xai"
    else:
        # openrouter paid or unknown
        if m.endswith(OPENROUTER_FREE_SUFFIX):
            rates = {"input": 0.0, "output": 0.0}
        else:
            rates = dict(OR_DEFAULT)
            is_est = True
        prov = prov or "openrouter"

    cost = (in_t / 1_000_000) * float(rates["input"]) + (out_t / 1_000_000) * float(
        rates["output"]
    )
    return {
        "est_usd": round(cost, 6),
        "is_estimate": is_est,
        "provider": prov,
        "rates_used": {"input": rates["input"], "output": rates["output"]},
        "input_tokens": in_t,
        "output_tokens": out_t,
        "model": m,
    }


def _guess_provider(model: str) -> str:
    m = model.lower()
    if m.startswith("gemini") or "gemini" in m:
        return "gemini"
    if m.startswith("grok") or m.startswith("xai/"):
        return "xai"
    if m.startswith("sonar") or "perplexity" in m:
        return "perplexity"
    if m.startswith("ollama") or m in ("phi4-mini", "gemma4"):
        return "local"
    return "openrouter"


def estimate_from_usage_block(
    model: str,
    usage: dict | None,
    *,
    provider: str | None = None,
) -> dict[str, Any]:
    """Pull tokens from OpenAI-shaped or Gemini usageMetadata."""
    usage = usage or {}
    in_t = (
        usage.get("prompt_tokens")
        or usage.get("input_tokens")
        or usage.get("promptTokenCount")
        or 0
    )
    out_t = (
        usage.get("completion_tokens")
        or usage.get("output_tokens")
        or usage.get("candidatesTokenCount")
        or 0
    )
    return estimate_cost(model, int(in_t or 0), int(out_t or 0), provider=provider)
