#!/usr/bin/env bash
# Read-only, <30s. Quick fortress-wide overview: docker, tailscale, disk/mem,
# failed systemd units. Never touches 127.0.0.1:8100 (MCP bridge deadlocks).
set -uo pipefail

echo "== sitrep =="
echo "date: $(date -Is)"
echo "uptime: $(uptime -p 2>&1)"

echo
echo "-- docker containers --"
timeout 10 docker ps --format '{{.Names}}: {{.Status}}' 2>&1
docker_rc=$?

echo
echo "-- tailscale --"
timeout 5 tailscale status 2>&1 | head -n 10

echo
echo "-- disk / mem --"
df -h / 2>&1 | tail -n 1
free -m 2>&1 | awk '/^Mem:/'

echo
echo "-- systemd failed units --"
failed=$(timeout 5 systemctl --failed --no-legend 2>&1)
echo "${failed:-(none)}"
fail_count=0
[ -n "$failed" ] && fail_count=$(echo "$failed" | grep -c .)

if [ "$docker_rc" -ne 0 ]; then
  echo "SUMMARY: FAIL docker daemon unreachable"
elif [ "$fail_count" -gt 0 ]; then
  echo "SUMMARY: WARN ${fail_count} systemd unit(s) failed"
else
  echo "SUMMARY: OK docker reachable, no failed units"
fi
