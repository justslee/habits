#!/bin/bash
# Start Cloudflare Tunnel exposing the FastAPI backend
# Usage: ./scripts/start-tunnel.sh

set -e

echo "Starting backend..."
cd "$(dirname "$0")/../backend"
source venv/bin/activate

# Ensure migrations are up to date
alembic upgrade head

# Start uvicorn in background
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

# Start tunnel
echo "Starting Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:8000

# Cleanup on exit
trap "kill $BACKEND_PID 2>/dev/null" EXIT
