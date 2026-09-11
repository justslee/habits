#!/usr/bin/env bash
# Build the Expo web app and install it where the API serves it (com.habits.api mounts
# $HABITS_HOME/web at /). Run by deploy.sh on every deploy that touches mobile/, and by
# install.sh. Safe to re-run.
#
#   bash backend/ops/mac/build-web.sh
set -euo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
HABITS_SRV="${HABITS_SRV:-$HOME/srv/habits}"
MOBILE="$HABITS_SRV/mobile"
WEB_DIR="${HABITS_WEB_DIR:-$HABITS_HOME/web}"
LOG_DIR="$HOME/Library/Logs/habits"
mkdir -p "$LOG_DIR"

set -a; . "$HABITS_HOME/env"; set +a
TS_HOST="${TS_HOST:-justins-macbook-pro-2.tail2c4851.ts.net}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://$TS_HOST}"
export EXPO_PUBLIC_API_KEY="${EXPO_PUBLIC_API_KEY:-${API_KEY:-}}"
export PATH="/opt/homebrew/bin:$PATH"

cd "$MOBILE"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund >>"$LOG_DIR/web-build.log" 2>&1
fi
rm -rf dist
npx expo export --platform web --output-dir dist >>"$LOG_DIR/web-build.log" 2>&1
node scripts/fix-web.js >>"$LOG_DIR/web-build.log" 2>&1 || true
printf '{"apiUrl":"%s"}\n' "$EXPO_PUBLIC_API_URL" > dist/config.json

# atomic swap
rm -rf "$WEB_DIR.new"
cp -R dist "$WEB_DIR.new"
rm -rf "$WEB_DIR.old"
[ -d "$WEB_DIR" ] && mv "$WEB_DIR" "$WEB_DIR.old"
mv "$WEB_DIR.new" "$WEB_DIR"
rm -rf "$WEB_DIR.old"
printf '%s web: built %s → %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(git -C "$HABITS_SRV" rev-parse --short HEAD)" "$WEB_DIR" | tee -a "$LOG_DIR/events.log"
