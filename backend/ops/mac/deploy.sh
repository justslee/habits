#!/usr/bin/env bash
# Poll origin/main and redeploy the API on this Mac when it moves (com.habits.deploy).
# Replaces the old EC2 SSM workflow. Runs every 5 minutes via launchd.
#
#   fetch → if main moved: reset deploy clone, install deps, migrate, restart, health-check
#   on failure: reset back to the previous SHA, restart, notify.
#
# The deploy clone (~/srv/habits) is disposable — never develop in it.
set -uo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
HABITS_SRV="${HABITS_SRV:-$HOME/srv/habits}"
LOG_DIR="$HOME/Library/Logs/habits"
LABEL="com.habits.api"
HEALTH_URL="http://127.0.0.1:${PORT:-8000}/health"
mkdir -p "$LOG_DIR"

log() { printf '%s deploy: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_DIR/events.log"; }
notify() {
  log "$1"
  osascript -e "display notification \"$1\" with title \"Habits deploy\"" >/dev/null 2>&1 || true
}
restart_api() { launchctl kickstart -k "gui/$(id -u)/$LABEL"; }
wait_healthy() {
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

cd "$HABITS_SRV" || { notify "deploy clone missing at $HABITS_SRV"; exit 1; }
git fetch -q origin main || { log "fetch failed (offline?)"; exit 0; }

OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0

log "main moved ${OLD:0:7} → ${NEW:0:7}, deploying"
git reset -q --hard "$NEW"

cd backend
set -a; . "$HABITS_HOME/env"; set +a
export DATABASE_URL="${DATABASE_URL:-sqlite:///$HABITS_HOME/mastery.db}"
export HABITS_SECRETS_DISABLED=1

if ! .venv/bin/pip install -q -r requirements.txt >>"$LOG_DIR/deploy.log" 2>&1; then
  notify "pip install failed at ${NEW:0:7}; rolling back"
  git reset -q --hard "$OLD"; exit 1
fi

# Snapshot the DB before migrating so a bad migration is recoverable.
DB_PATH="${DATABASE_URL#sqlite:///}"
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '$HABITS_HOME/mastery.pre-deploy.db'" 2>/dev/null || true
fi

if ! .venv/bin/alembic upgrade head >>"$LOG_DIR/deploy.log" 2>&1; then
  notify "alembic upgrade failed at ${NEW:0:7}; rolling back code (DB snapshot: mastery.pre-deploy.db)"
  git reset -q --hard "$OLD"; restart_api; exit 1
fi

# Web app: rebuild when mobile/ changed (or no build exists yet), before restarting so the
# new bundle is served by the new process.
if [ ! -d "$HABITS_HOME/web" ] || ! git -C "$HABITS_SRV" diff --quiet "$OLD" "$NEW" -- mobile/ ; then
  if bash "$HABITS_SRV/backend/ops/mac/build-web.sh" >>"$LOG_DIR/deploy.log" 2>&1; then
    log "web app rebuilt"
  else
    notify "web build failed at ${NEW:0:7} (API still deploys; see web-build.log)"
  fi
fi

restart_api
if wait_healthy; then
  log "deployed ${NEW:0:7} OK"
  exit 0
fi

notify "health check failed at ${NEW:0:7}; rolling back to ${OLD:0:7}"
git reset -q --hard "$OLD"
restart_api
wait_healthy || notify "rollback to ${OLD:0:7} is ALSO unhealthy — manual attention needed"
exit 1
