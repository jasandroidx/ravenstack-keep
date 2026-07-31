#!/usr/bin/env python3
"""Minimal Ravenstack Keep MCP HTTP client (streamable-http + session).

Usage:
  python3 keep_mcp_client.py keep_health
  python3 keep_mcp_client.py list_agent_specs
  python3 keep_mcp_client.py list_rooms

Default URL: http://100.108.130.82:8110/mcp
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request


def post(url: str, body: dict, session_id: str | None = None) -> tuple[str | None, dict]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session_id:
        headers["mcp-session-id"] = session_id
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        sid = r.headers.get("mcp-session-id") or session_id
        raw = r.read().decode("utf-8", errors="replace")
    payload = None
    for line in raw.splitlines():
        if line.startswith("data:"):
            payload = json.loads(line[5:].strip())
            break
    if payload is None:
        raise RuntimeError(f"No SSE data in response: {raw[:300]}")
    return sid, payload


def call_tool(url: str, name: str, arguments: dict | None = None) -> dict:
    sid, init = post(
        url,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "keep_mcp_client", "version": "1.0"},
            },
        },
    )
    if not sid:
        raise RuntimeError(f"No mcp-session-id from initialize: {init}")
    # required by streamable-http servers that reject early tool calls
    try:
        post(url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    except Exception:
        pass
    _, result = post(
        url,
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments or {}},
        },
        sid,
    )
    if "error" in result:
        raise RuntimeError(json.dumps(result["error"]))
    res = result.get("result") or {}
    if "structuredContent" in res:
        return res["structuredContent"]
    content = res.get("content") or []
    if content and content[0].get("type") == "text":
        text = content[0]["text"]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"text": text}
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("tool")
    ap.add_argument("--url", default=os.environ.get("KEEP_MCP_URL", "http://100.108.130.82:8110/mcp"))
    ap.add_argument("--args", default="{}", help="JSON object of tool arguments")
    args = ap.parse_args()
    out = call_tool(args.url, args.tool, json.loads(args.args))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
