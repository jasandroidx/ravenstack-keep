#!/usr/bin/env bash
# Read-only, <30s. Container restart counts + failed systemd units + last
# error-level log lines for the Keep services and the gateway.
set -uo pipefail

echo "== docker container restart counts =="
containers=$(timeout 10 docker ps -a --format '{{.Names}}' 2>&1)
docker_rc=$?
[ $docker_rc -ne 0 ] && echo "docker ps failed: $containers" && containers=""

total_restarts=0
for c in $containers; do
  rc=$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null || echo 0)
  echo "$c: restarts=$rc"
  total_restarts=$((total_restarts + rc))
done

echo
echo "== systemd failed units =="
failed_units=$(timeout 5 systemctl --failed --no-legend 2>&1)
echo "${failed_units:-(none)}"
failed_count=0
[ -n "$failed_units" ] && failed_count=$(echo "$failed_units" | grep -c .)

echo
echo "== last errors: keep + gateway (journal, 5 lines each) =="
for u in ravenstack-keep-mcp ravenstack-keep-http ravenstack-keep-ui; do
  echo "--- $u errors ---"
  timeout 5 journalctl -u "$u" -p err -n 5 --no-pager 2>&1 || echo "(unavailable)"
done

if [ "$failed_count" -gt 0 ]; then
  echo "SUMMARY: FAIL ${failed_count} systemd unit(s) in failed state"
elif [ "$total_restarts" -gt 10 ]; then
  echo "SUMMARY: WARN high container restart counts (total ${total_restarts})"
else
  echo "SUMMARY: OK no failed units, restart counts normal (total ${total_restarts})"
fi
