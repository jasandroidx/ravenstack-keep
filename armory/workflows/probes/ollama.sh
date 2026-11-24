#!/usr/bin/env bash
# Read-only, <30s. Local Ollama reachability + model inventory. Always the
# Docker-bridge address, never localhost -- Ollama runs on the host, not in
# the container this may be probed from.
set -uo pipefail

OLLAMA_URL="${OLLAMA_URL:-http://172.18.0.1:11434}"

echo "== ollama tags: ${OLLAMA_URL}/api/tags =="
resp=$(timeout 10 curl -sf "${OLLAMA_URL}/api/tags" 2>&1)
rc=$?
echo "$resp" | head -c 2000
echo

if [ $rc -ne 0 ]; then
  echo "SUMMARY: FAIL ollama unreachable at ${OLLAMA_URL}"
else
  model_count=$(echo "$resp" | grep -o '"name"' | wc -l | tr -d ' ')
  echo "model count: ${model_count}"
  if [ "$model_count" -eq 0 ]; then
    echo "SUMMARY: WARN ollama reachable but no models listed"
  else
    echo "SUMMARY: OK ollama reachable, ${model_count} models"
  fi
fi
