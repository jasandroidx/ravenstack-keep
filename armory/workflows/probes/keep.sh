#!/usr/bin/env bash
# Read-only, <30s. The three Keep systemd units + their last few log lines.
set -uo pipefail

UNITS=(ravenstack-keep-mcp ravenstack-keep-http ravenstack-keep-ui)
fail=0

for u in "${UNITS[@]}"; do
  state=$(timeout 5 systemctl is-active "$u" 2>&1)
  echo "$u: $state"
  [ "$state" != "active" ] && fail=$((fail + 1))
done

echo
echo "== recent journal (last 10 lines each) =="
for u in "${UNITS[@]}"; do
  echo "--- $u ---"
  timeout 5 journalctl -u "$u" -n 10 --no-pager 2>&1 || echo "(journal unavailable)"
done

if [ "$fail" -eq "${#UNITS[@]}" ]; then
  echo "SUMMARY: FAIL all Keep services down"
elif [ "$fail" -gt 0 ]; then
  echo "SUMMARY: WARN ${fail} of ${#UNITS[@]} Keep services not active"
else
  echo "SUMMARY: OK all Keep services active"
fi
