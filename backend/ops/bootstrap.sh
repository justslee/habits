#!/usr/bin/env bash
# Idempotent first stand-up / repair for the Habits API, co-located on the
# scorecard EC2 box. Safe to re-run.
#
#   habits.looperapp.org -> ALB (TLS) -> instance :80 (nginx) -> 127.0.0.1:8001 (uvicorn)
#   DB: a separate `habits` database + role on the box's existing local Postgres.
#
# Run as ubuntu on the box (typically via SSM):
#   HABITS_DB_PASSWORD=... bash /home/ubuntu/habits/backend/ops/bootstrap.sh
set -euo pipefail

REPO_DIR="/home/ubuntu/habits"
BACKEND_DIR="$REPO_DIR/backend"
DB_NAME="${HABITS_DB_NAME:-habits}"
DB_USER="${HABITS_DB_USER:-habits}"
DB_PASSWORD="${HABITS_DB_PASSWORD:-habits_local_pw}"
UV="/home/ubuntu/.local/bin/uv"

echo "==> 1. Postgres: create role + database (idempotent)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL || true
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

echo "==> 2. Dependencies (uv venv + pip install -r requirements.txt)"
cd "$BACKEND_DIR"
if [ ! -x "$UV" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
"$UV" venv .venv
"$UV" pip install --python "$BACKEND_DIR/.venv/bin/python" -r requirements.txt

echo "==> 3. Scaffold .env if missing (real secrets come from AWS Secrets Manager: habits/prod)"
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cat > "$BACKEND_DIR/.env" <<ENV
DATABASE_URL=postgresql+psycopg://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
OAUTH_REDIRECT_BASE=https://habits.looperapp.org
ALLOWED_ORIGINS=https://habits.looperapp.org
HABITS_SECRETS_NAME=habits/prod
TZ=America/New_York
DEBUG=false
ENV
fi

echo "==> 4. Migrate schema"
set -a; . "$BACKEND_DIR/.env"; set +a
"$UV" run alembic upgrade head

echo "==> 5. systemd unit"
sudo cp "$BACKEND_DIR/deploy/habits-api.service" /etc/systemd/system/habits-api.service
sudo systemctl daemon-reload
sudo systemctl enable habits-api
sudo systemctl restart habits-api

echo "==> 6. nginx server block"
sudo cp "$BACKEND_DIR/deploy/nginx-habits.conf" /etc/nginx/sites-available/habits
sudo ln -sf /etc/nginx/sites-available/habits /etc/nginx/sites-enabled/habits
sudo nginx -t
sudo systemctl reload nginx

echo "==> 7. Health check"
sleep 2
curl -fsS http://127.0.0.1:8001/health && echo " OK"
echo "Bootstrap complete."
echo "Manual AWS steps (once): Route53 habits.looperapp.org -> ALB; ensure ACM cert covers it;"
echo "grant the instance role secretsmanager:GetSecretValue on habits/prod."
