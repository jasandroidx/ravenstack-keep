#!/usr/bin/env bash
# Read-only, <30s. Tailscale connectivity + serve/funnel config. Never
# prints secret Funnel paths in full -- output is truncated, not redacted
# per-field, so operators should still treat this drop as semi-sensitive.
set -uo pipefail

echo "== tailscale status =="
ts_status=$(timeout 10 tailscale status 2>&1)
ts_rc=$?
echo "$ts_status" | head -n 20

echo
echo "== tailscale serve status =="
serve_status=$(timeout 10 tailscale serve status 2>&1)
serve_rc=$?
echo "$serve_status" | head -n 20

if [ $ts_rc -ne 0 ]; then
  echo "SUMMARY: FAIL tailscale status command failed (is tailscaled running?)"
elif echo "$ts_status" | grep -qi "logged out\|stopped"; then
  echo "SUMMARY: FAIL tailscale is logged out or stopped"
elif [ $serve_rc -ne 0 ]; then
  echo "SUMMARY: WARN tailscale up but serve/funnel status unreadable"
else
  echo "SUMMARY: OK tailscale up, serve status readable"
fi
