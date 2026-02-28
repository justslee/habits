#!/usr/bin/env bash
# Setup GraphHopper for local route discovery.
# Downloads an OSM extract and starts the GraphHopper container.
#
# Usage: ./scripts/setup_graphhopper.sh [REGION_URL]
#   REGION_URL: Geofabrik PBF URL (default: US Northeast)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BACKEND_DIR/graphhopper-data"

# Default: US Northeast extract (~300MB, covers NY/NJ/CT/MA area)
DEFAULT_PBF="https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf"
PBF_URL="${1:-$DEFAULT_PBF}"

echo "=== GraphHopper Setup ==="
echo "Data dir: $DATA_DIR"
echo "PBF URL:  $PBF_URL"

# Create data directory
mkdir -p "$DATA_DIR"

# Download OSM data if not present
if [ ! -f "$DATA_DIR/region.osm.pbf" ]; then
  echo "Downloading OSM data..."
  curl -L -o "$DATA_DIR/region.osm.pbf" "$PBF_URL"
  echo "Download complete."
else
  echo "OSM data already exists, skipping download."
fi

# Start GraphHopper
echo "Starting GraphHopper container..."
docker compose -f "$BACKEND_DIR/docker-compose.graphhopper.yml" up -d

# Wait for health
echo "Waiting for GraphHopper to be ready..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8989/health > /dev/null 2>&1; then
    echo "GraphHopper is ready!"
    exit 0
  fi
  printf "."
  sleep 5
done

echo ""
echo "WARNING: GraphHopper did not become healthy within 5 minutes."
echo "It may still be building the graph. Check logs:"
echo "  docker logs habits-graphhopper"
exit 1
