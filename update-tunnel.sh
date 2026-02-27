#!/bin/bash
# Usage: ./update-tunnel.sh <backend-tunnel-url>
# Updates the runtime config without rebuilding the app
BACKEND_URL="${1:?Usage: ./update-tunnel.sh https://xxx.trycloudflare.com}"
echo "{\"apiUrl\":\"$BACKEND_URL\"}" > mobile/dist/config.json
echo "{\"apiUrl\":\"$BACKEND_URL\"}" > mobile/public/config.json
echo "Updated config.json → $BACKEND_URL"
