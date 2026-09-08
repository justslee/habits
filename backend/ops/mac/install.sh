#!/usr/bin/env bash
# Install (or re-install) the Habits API as always-on launchd services on this Mac.
# Idempotent — re-run after editing anything in ops/mac/.
#
#   bash backend/ops/mac/install.sh
#
# Creates:
#   ~/Library/Application Support/Habits/{env,mastery.db}   config + data (never in git)
#   ~/srv/habits                                             deploy clone tracking origin/main
#   ~/Library/LaunchAgents/com.habits.{api,deploy,watchdog,backup}.plist
#   ~/Library/Logs/habits/
#
# Then, once: tailscale serve --bg --https=443 http://127.0.0.1:8000
set -euo pipefail

REPO_URL="https://github.com/justslee/habits.git"
HABITS_HOME="$HOME/Library/Application Support/Habits"
HABITS_SRV="$HOME/srv/habits"
LOG_DIR="$HOME/Library/Logs/habits"
AGENTS="$HOME/Library/LaunchAgents"
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-/opt/homebrew/bin/python3.12}"
UID_="$(id -u)"

mkdir -p "$HABITS_HOME" "$LOG_DIR" "$AGENTS" "$(dirname "$HABITS_SRV")"
chmod 700 "$HABITS_HOME"

echo "==> 1. env"
if [ ! -f "$HABITS_HOME/env" ]; then
  cp "$HERE/env.example" "$HABITS_HOME/env"
  chmod 600 "$HABITS_HOME/env"
  echo "    created $HABITS_HOME/env from env.example — FILL IT IN, then re-run"
  exit 78
fi

echo "==> 2. deploy clone"
if [ ! -d "$HABITS_SRV/.git" ]; then
  git clone -q "$REPO_URL" "$HABITS_SRV"
fi
git -C "$HABITS_SRV" fetch -q origin main
git -C "$HABITS_SRV" reset -q --hard origin/main
echo "    $HABITS_SRV @ $(git -C "$HABITS_SRV" rev-parse --short HEAD)"

echo "==> 3. python env"
cd "$HABITS_SRV/backend"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt

echo "==> 4. database"
set -a; . "$HABITS_HOME/env"; set +a
export DATABASE_URL="${DATABASE_URL:-sqlite:///$HABITS_HOME/mastery.db}"
export HABITS_SECRETS_DISABLED=1
.venv/bin/alembic upgrade head
echo "    $DATABASE_URL"

echo "==> 5. launchd agents"
chmod +x "$HERE"/*.sh
for tmpl in "$HERE"/plists/*.plist; do
  name="$(basename "$tmpl")"
  label="${name%.plist}"
  sed -e "s|__HOME__|$HOME|g" -e "s|__SRV__|$HABITS_SRV/backend/ops/mac|g" "$tmpl" > "$AGENTS/$name"
  launchctl bootout "gui/$UID_/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID_" "$AGENTS/$name"
  echo "    loaded $label"
done

echo "==> 6. health"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORT:-8000}/health" >/dev/null 2>&1; then
    echo "    API healthy on 127.0.0.1:${PORT:-8000}"
    echo "Done. Front it with:  tailscale serve --bg --https=443 http://127.0.0.1:${PORT:-8000}"
    exit 0
  fi
  sleep 1
done
echo "    API not healthy yet — see $LOG_DIR/api.err.log" >&2
exit 1
