#!/usr/bin/env bash
# Read-only, <30s. OpenClaw gateway container + Control UI reachability.
# Container name and port are fixed per operator instruction, not guessed.
set -uo pipefail

CONTAINER="openclaw-gateway"
CONTROL_PORT="${OPENCLAW_CONTROL_PORT:-18789}"

echo "== docker inspect: ${CONTAINER} =="
status=$(timeout 10 docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>&1)
docker_rc=$?
if [ $docker_rc -ne 0 ]; then
  echo "docker inspect failed: $status"
else
  echo "container status: $status"
  restarts=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "?")
  echo "restart count: $restarts"
fi

echo
echo "== control UI :${CONTROL_PORT} =="
tcp_ok=1
if timeout 5 bash -c "exec 3<>/dev/tcp/127.0.0.1/${CONTROL_PORT}" 2>/dev/null; then
  tcp_ok=0
  echo "TCP connect to 127.0.0.1:${CONTROL_PORT}: OK"
else
  echo "TCP connect to 127.0.0.1:${CONTROL_PORT}: FAILED"
fi

echo
echo "== recent gateway logs (tail 20) =="
timeout 10 docker logs --tail 20 "$CONTAINER" 2>&1 || echo "(logs unavailable)"

if [ $docker_rc -ne 0 ]; then
  echo "SUMMARY: FAIL gateway container ${CONTAINER} not found or unreachable"
elif [ "$status" != "running" ]; then
  echo "SUMMARY: FAIL gateway container status is '${status}'"
elif [ $tcp_ok -ne 0 ]; then
  echo "SUMMARY: WARN container running but Control UI :${CONTROL_PORT} not reachable"
else
  echo "SUMMARY: OK gateway running, Control UI :${CONTROL_PORT} reachable"
fi
