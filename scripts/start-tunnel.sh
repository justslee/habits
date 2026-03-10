#!/bin/bash
# Start the Mastery Tracker backend (Tailscale networking)
#
# With Tailscale, no tunnel process is needed — the backend is reachable
# directly via your MacBook's Tailscale hostname (e.g., macbook.tail12345.ts.net).
#
# Prerequisites:
#   1. Tailscale installed and running on MacBook: brew install tailscale && tailscale up
#   2. Tailscale installed on iPhone (App Store), logged into same account
#   3. (Optional) HTTPS cert: tailscale cert $(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
#
# Usage: ./scripts/start-tunnel.sh

set -e

cd "$(dirname "$0")/../backend"
source venv/bin/activate

# Cleanup on exit
cleanup() {
  echo "Shutting down backend..."
  kill $BACKEND_PID 2>/dev/null || true
  wait $BACKEND_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# Ensure migrations are up to date
alembic upgrade head

# Print Tailscale hostname for convenience
if command -v tailscale &> /dev/null; then
  TS_HOSTNAME=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "unknown")
  echo "=============================================="
  echo "Tailscale hostname: $TS_HOSTNAME"
  echo "Backend URL: https://$TS_HOSTNAME:8000"
  echo "=============================================="
else
  echo "WARNING: Tailscale not found. Backend will only be reachable on localhost."
  echo "Install with: brew install tailscale"
fi

# Start uvicorn — bind to 0.0.0.0 so Tailscale peers can reach it
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
for i in $(seq 1 10); do
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "Backend is healthy"
    break
  fi
  sleep 1
done

# Keep script alive until backend exits or user presses Ctrl-C
wait $BACKEND_PID
