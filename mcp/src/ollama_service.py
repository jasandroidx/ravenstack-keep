"""Ollama Service for Ravenstack Keep.

Handles local Ollama interactions for NPC dialogue, ambient herald events,
and character responses infused with live Keep state.

Configuration via environment variables:
  - OLLAMA_BASE_URL (default: http://127.0.0.1:11434)
  - OLLAMA_MODEL (default: phi4-mini)
  - OLLAMA_TIMEOUT_SEC (default: 5.0)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "phi4-mini")
TIMEOUT_SEC = float(os.environ.get("OLLAMA_TIMEOUT_SEC", "5.0"))

PERSONA_PROMPTS: Dict[str, str] = {
    "raziel": (
        "You are Raziel, Sovereign Arch-Orchestrator of Ravenstack Keep. "
        "Style: Imperative, commanding, concise, cyber-arcane. You state truth, never explain or make excuses. "
        "Limit response to 1-2 short sentences."
    ),
    "valerie": (
        "You are Valerie, Mechanic in the Keep Workshop. "
        "Style: Dry, unimpressed, focused on mechanical/container nouns and physical symptoms. "
        "Limit response to 1-2 short sentences. Never leak secrets, tokens, or raw IPs."
    ),
    "oracle": (
        "You are The Oracle, Truth Inquisitor represented as a floating celestial green eye. "
        "Style: Severe, formal, zero tolerance for unverified claims or hallucinations. Cites principles and receipts. "
        "Limit response to 1-2 short sentences."
    ),
    "corvid": (
        "You are Corvid, Telemetry Scout perched in the roost or yard. "
        "Style: Terse, observational, numbers and direct counts only. "
        "Limit response to 1 sentence."
    ),
    "quarantine-warden": (
        "You are The Warden of the Quarantine Cell. "
        "Style: Cold, flat, menacingly factual. Speaks of unverified assertions trapped in the cell. "
        "Limit response to 1-2 short sentences."
    ),
}


def _call_ollama(
    prompt: str,
    system: Optional[str] = None,
    model: Optional[str] = None,
    timeout: float = TIMEOUT_SEC,
) -> Optional[str]:
    """Call Ollama /api/generate non-blocking with timeout."""
    target_model = model or DEFAULT_MODEL
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": target_model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": 120,
            "temperature": 0.7,
        },
    }
    if system:
        payload["system"] = system

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                resp_json = json.loads(response.read().decode("utf-8"))
                text = resp_json.get("response", "").strip()
                return text if text else None
    except Exception:
        # Graceful fallback on network, timeout, or model errors
        return None
    return None


def generate_npc_dialogue(
    npc_id: str,
    user_query: Optional[str] = None,
    keep_state: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
) -> Optional[str]:
    """Generate dynamic NPC response using Ollama given Keep state context."""
    persona_system = PERSONA_PROMPTS.get(npc_id.lower())
    if not persona_system:
        persona_system = (
            "You are a resident in Ravenstack Keep. "
            "Style: Brief, cyber-arcane, 1 sentence."
        )

    # Format state context
    state_ctx = []
    if keep_state:
        if keep_state.get("gatesPending") is not None:
            state_ctx.append(f"Pending Gates: {keep_state['gatesPending']}")
        if keep_state.get("quarantineOpen") is not None:
            state_ctx.append(f"Quarantine Open Claims: {keep_state['quarantineOpen']}")
        if keep_state.get("stackVerdict"):
            state_ctx.append(f"Stack Health Verdict: {keep_state['stackVerdict']}")
        if keep_state.get("failingServices"):
            state_ctx.append(f"Failing Services: {', '.join(keep_state['failingServices'])}")

    state_str = (" | ".join(state_ctx)) if state_ctx else "Keep status nominal."
    prompt = f"Keep Context: [{state_str}]\n"
    if user_query:
        prompt += f"Operator query: \"{user_query}\"\nResponse:"
    else:
        prompt += "Operator approaches you. Speak a greeting or observation:"

    return _call_ollama(prompt=prompt, system=persona_system, model=model)


def generate_ambient_event(
    keep_state: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
) -> Optional[str]:
    """Generate ambient ticker line or atmospheric event for Keep Herald."""
    system = (
        "You are the Keep Herald observer. "
        "Generate a single short atmospheric ambient ticker line describing a small event in the 16-bit cyber-arcane citadel "
        "(e.g., torches flickering, shadows moving, conduit hums, weather outside). "
        "Maximum 15 words. Do not use quotes or prefixes."
    )

    state_ctx = []
    if keep_state and keep_state.get("stackVerdict"):
        state_ctx.append(f"Atmosphere: {keep_state['stackVerdict']}")

    prompt = "Generate ambient observation:"
    if state_ctx:
        prompt = f"Context: {', '.join(state_ctx)}. " + prompt

    return _call_ollama(prompt=prompt, system=system, model=model)
