#!/usr/bin/env bash
# One-shot: copy the production backend/.env from the EC2 box into this Mac's runtime
# env file, then rewrite the values that differ on the Mac (SQLite, Tailscale hostname).
#
#   bash backend/ops/mac/pull-prod-env.sh
#
# Same transport as pull-prod-data.sh: the file is served on the box's loopback and
# fetched through an SSM port-forward, so nothing secret appears in SSM history.
set -euo pipefail

INSTANCE="i-0826ae70df62d9fe8"
REGION="us-east-1"
PORT=18082
HABITS_HOME="$HOME/Library/Application Support/Habits"
DEST="$HABITS_HOME/env"
TS_HOST="${TS_HOST:-justins-macbook-pro-2.tail2c4851.ts.net}"
mkdir -p "$HABITS_HOME"; chmod 700 "$HABITS_HOME"

ssm() {
  local id
  id=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
        --comment "$1" --parameters "commands=[\"$2\"]" --query 'Command.CommandId' --output text)
  aws ssm wait command-executed --region "$REGION" --command-id "$id" --instance-id "$INSTANCE" 2>/dev/null || true
  aws ssm get-command-invocation --region "$REGION" --command-id "$id" --instance-id "$INSTANCE" \
    --query 'StandardOutputContent' --output text
}

echo "==> serving env on the box (loopback only)"
ssm "habits env serve" "rm -rf /tmp/hx2 && mkdir -p /tmp/hx2 && cp /home/ubuntu/habits/backend/.env /tmp/hx2/env && cd /tmp/hx2 && (nohup python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &) && sleep 1 && echo serving"

echo "==> downloading through SSM port-forward"
aws ssm start-session --region "$REGION" --target "$INSTANCE" --document-name AWS-StartPortForwardingSession \
  --parameters "{\"portNumber\":[\"$PORT\"],\"localPortNumber\":[\"$PORT\"]}" >/tmp/ssm-pf-env.log 2>&1 &
pf=$!
trap 'kill $pf 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  sleep 1
  curl -fsS -o "$DEST.tmp" "http://127.0.0.1:$PORT/env" && break
done
[ -s "$DEST.tmp" ] || { echo "download failed (see /tmp/ssm-pf-env.log)" >&2; exit 1; }

echo "==> cleaning up on the box"
ssm "habits env cleanup" "pkill -f 'http.server $PORT' || true; rm -rf /tmp/hx2; echo cleaned"

echo "==> adapting for the Mac"
{
  grep -v -E '^(DATABASE_URL|OAUTH_REDIRECT_BASE|WHOOP_CLIENT_ID|WHOOP_CLIENT_SECRET|ALLOWED_ORIGINS|HABITS_SECRETS_DISABLED|HABITS_SECRETS_NAME|TESTING|PORT)=' "$DEST.tmp"
  echo ""
  echo "# --- Mac overrides (written by ops/mac/pull-prod-env.sh) ---"
  echo "DATABASE_URL=sqlite:///$HABITS_HOME/mastery.db"
  echo "ALLOWED_ORIGINS=https://$TS_HOST,http://localhost:8081,http://localhost:19006"
  echo "HABITS_SECRETS_DISABLED=1"
  echo "PORT=8000"
} > "$DEST"
rm -f "$DEST.tmp"
chmod 600 "$DEST"
echo "==> keys present:"
grep -v '^#' "$DEST" | grep -E '^[A-Z_]+=.+' | sed 's/=.*//' | tr '\n' ' '; echo
echo "Done: $DEST"
