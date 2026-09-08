#!/usr/bin/env bash
# One-shot: copy the production Postgres data (EC2) into a SQLite file on this Mac.
#
#   bash backend/ops/mac/pull-prod-data.sh            # → ~/Library/Application Support/Habits/mastery.db
#   bash backend/ops/mac/pull-prod-data.sh /tmp/x.db  # or somewhere else
#
# How: runs scripts/copy_db.py ON the box (Postgres → /tmp/hx/mastery.db at the same
# Alembic revision), serves that file on the box's loopback, port-forwards through SSM,
# downloads it, then cleans up. No secrets leave the box; SSM command history only
# shows row counts. Needs: aws cli with SSM permissions, session-manager-plugin, and
# copy_db.py present on origin/$BRANCH.
set -euo pipefail

INSTANCE="i-0826ae70df62d9fe8"
REGION="us-east-1"
BRANCH="${BRANCH:-main}"
PORT=18081
DEST="${1:-$HOME/Library/Application Support/Habits/mastery.db}"
mkdir -p "$(dirname "$DEST")"

# Runs a multi-line script on the box as ubuntu. Lines are shipped as a heredoc inside
# the SSM command so no shell quoting or encoding is involved.
ssm_run() {  # $1 = comment, $2 = script body
  local params id
  params=$(python3 - "$2" <<'PY'
import json, sys
body = sys.argv[1].strip("\n").split("\n")
cmds = ["cat > /tmp/habits_remote.sh <<'HABITS_EOF'"] + body + [
    "HABITS_EOF",
    "chown ubuntu /tmp/habits_remote.sh",
    "su - ubuntu -c 'bash /tmp/habits_remote.sh'",
    "rm -f /tmp/habits_remote.sh",
]
print(json.dumps({"commands": cmds, "executionTimeout": ["600"]}))
PY
)
  id=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
        --comment "$1" --parameters "$params" --query 'Command.CommandId' --output text)
  aws ssm wait command-executed --region "$REGION" --command-id "$id" --instance-id "$INSTANCE" 2>/dev/null || true
  aws ssm get-command-invocation --region "$REGION" --command-id "$id" --instance-id "$INSTANCE" \
    --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
}

echo "==> copying Postgres → SQLite on the box"
out=$(ssm_run "habits pg->sqlite copy" "
set -e
cd ~/habits
git fetch -q origin $BRANCH
git show origin/$BRANCH:backend/scripts/copy_db.py > /tmp/copy_db.py
rm -rf /tmp/hx && mkdir -p /tmp/hx
cd backend
set -a; . ./.env; set +a
SRC=\"\$DATABASE_URL\"
export DATABASE_URL=sqlite:////tmp/hx/mastery.db
.venv/bin/alembic upgrade head >/tmp/hx/alembic.log 2>&1 || { echo ALEMBIC_FAILED; tail -20 /tmp/hx/alembic.log; exit 1; }
SRC_URL=\"\$SRC\" DST_URL=\"\$DATABASE_URL\" .venv/bin/python /tmp/copy_db.py
cd /tmp/hx && (nohup python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &)
sleep 1; echo SERVING
")
echo "$out"
grep -q "SERVING" <<<"$out" || { echo "remote copy failed" >&2; exit 1; }

echo "==> downloading through SSM port-forward"
aws ssm start-session --region "$REGION" --target "$INSTANCE" --document-name AWS-StartPortForwardingSession \
  --parameters "{\"portNumber\":[\"$PORT\"],\"localPortNumber\":[\"$PORT\"]}" >/tmp/ssm-pf.log 2>&1 &
pf=$!
trap 'kill $pf 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  sleep 1
  curl -fsS -o "$DEST.tmp" "http://127.0.0.1:$PORT/mastery.db" && break
done
[ -s "$DEST.tmp" ] || { echo "download failed (see /tmp/ssm-pf.log)" >&2; exit 1; }
[ -f "$DEST" ] && mv "$DEST" "$DEST.pre-pull-$(date +%Y%m%d-%H%M)"
mv "$DEST.tmp" "$DEST"

echo "==> cleaning up on the box"
ssm_run "habits copy cleanup" "pkill -f 'http.server $PORT' || true; rm -rf /tmp/hx /tmp/copy_db.py; echo cleaned" | tail -1

echo "==> verify"
sqlite3 "$DEST" "select 'workouts', count(*) from workout_sessions union all select 'todos', count(*) from daily_todos union all select 'runs', count(*) from run_sessions union all select 'alembic', version_num from alembic_version;"
echo "Done: $DEST"
