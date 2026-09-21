"""Unit tests for Ollama backend integration service in mcp/src/ollama_service.py."""

from unittest.mock import MagicMock, patch
import json

from src.ollama_service import (
    generate_npc_dialogue,
    generate_ambient_event,
    _call_ollama,
)


def test_call_ollama_success():
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps({"response": "  The Keep stands vigilant.  "}).encode("utf-8")

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value = mock_response
        result = _call_ollama("Hello", system="Test system")
        assert result == "The Keep stands vigilant."


def test_call_ollama_fallback_on_error():
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.side_effect = Exception("Connection refused")
        result = _call_ollama("Hello")
        assert result is None


def test_generate_npc_dialogue_with_context():
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps({"response": "3 gates await your seal."}).encode("utf-8")

    keep_state = {
        "gatesPending": 3,
        "quarantineOpen": 1,
        "stackVerdict": "ok",
        "failingServices": [],
    }

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value = mock_response
        result = generate_npc_dialogue(
            npc_id="raziel",
            user_query="What needs attention?",
            keep_state=keep_state,
        )
        assert result == "3 gates await your seal."

        # Verify request body contains persona and state
        req = mock_urlopen.call_args[0][0]
        body = json.loads(req.data.decode("utf-8"))
        assert body["model"] == "phi4-mini"
        assert "Raziel" in body["system"]
        assert "Pending Gates: 3" in body["prompt"]


def test_generate_ambient_event_success():
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps({"response": "A cold draft flickers the Great Hall torches."}).encode("utf-8")

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.return_value.__enter__.return_value = mock_response
        result = generate_ambient_event(keep_state={"stackVerdict": "ok"})
        assert result == "A cold draft flickers the Great Hall torches."
