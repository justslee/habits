#!/usr/bin/env bash
# Foreground entrypoint for the Habits API under launchd (com.habits.api).
#
# Layout (see install.sh):
#   $HABITS_HOME               ~/Library/Application Support/Habits
#   $HABITS_HOME/env           the real environment (secrets) — NOT in any git checkout
#   $HABITS_HOME/mastery.db    the database
#   $HABITS_SRV                ~/srv/habits  (deploy clone, always on origin/main)
#
# The server binds to loopback only; `tailscale serve` fronts it with HTTPS.
set -euo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
HABITS_SRV="${HABITS_SRV:-$HOME/srv/habits}"
BACKEND="$HABITS_SRV/backend"

if [ ! -f "$HABITS_HOME/env" ]; then
  echo "missing $HABITS_HOME/env — copy backend/ops/mac/env.example there and fill it in" >&2
  exit 78
fi

set -a
# shellcheck disable=SC1091
. "$HABITS_HOME/env"
set +a
export DATABASE_URL="${DATABASE_URL:-sqlite:///$HABITS_HOME/mastery.db}"
export HABITS_SECRETS_DISABLED=1

cd "$BACKEND"
# shellcheck disable=SC1091
. .venv/bin/activate

alembic upgrade head

exec uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips '*'
