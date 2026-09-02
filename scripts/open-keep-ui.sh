#!/usr/bin/env bash
# Open Ravenstack Keep visual shell.
set -euo pipefail
URL="https://openclaw.tail20a090.ts.net:8120/"
echo "Trying $URL ..."
if curl -skS -m 5 -o /dev/null -w "%{http_code}" "$URL" | grep -q 200; then
  echo "OK — open this (must be on Tailscale):"
  echo "  $URL"
  command -v xdg-open >/dev/null && xdg-open "$URL" 2>/dev/null || true
  exit 0
fi
echo "Tailnet HTTPS failed — using SSH local forward"
ssh -o BatchMode=yes -f -N -L 8120:127.0.0.1:8120 openclaw
sleep 1
echo "Open: http://127.0.0.1:8120/"
command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:8120/" 2>/dev/null || true
