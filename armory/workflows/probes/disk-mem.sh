#!/usr/bin/env bash
# Read-only, <30s. Disk and memory pressure on the root filesystem.
set -uo pipefail

echo "== disk usage =="
df -h / 2>&1

echo
echo "== memory =="
free -m 2>&1

disk_pct=$(df -P / 2>/dev/null | awk 'NR==2 { gsub("%","",$5); print $5 }')
mem_pct=$(free -m 2>/dev/null | awk '/^Mem:/ { printf "%.0f", ($3/$2)*100 }')

echo
echo "disk_used_pct=${disk_pct:-unknown}"
echo "mem_used_pct=${mem_pct:-unknown}"

if [ -z "${disk_pct:-}" ] || [ -z "${mem_pct:-}" ]; then
  echo "SUMMARY: WARN could not parse disk/mem usage"
elif [ "$disk_pct" -ge 90 ] || [ "$mem_pct" -ge 95 ]; then
  echo "SUMMARY: FAIL disk ${disk_pct}% / mem ${mem_pct}% -- critical"
elif [ "$disk_pct" -ge 80 ] || [ "$mem_pct" -ge 85 ]; then
  echo "SUMMARY: WARN disk ${disk_pct}% / mem ${mem_pct}% -- elevated"
else
  echo "SUMMARY: OK disk ${disk_pct}% / mem ${mem_pct}%"
fi
