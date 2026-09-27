#!/usr/bin/env bash
# The grocery shopper: a Claude Code session (your Claude subscription, not the API) that
# builds carts in a dedicated Chrome profile when FOOD_EXECUTOR=agent.
#
#   shopper.sh supervise       launchd (com.habits.shopper): start a session whenever carts are
#                              queued; each session closes itself when the queue is empty
#   shopper.sh start           run a session in this terminal instead (debugging)
#   shopper.sh done            called by the session when it's finished: closes it
#   shopper.sh login [store]   open the shopper's Chrome profile to sign in to a store once
#   shopper.sh <cli args>      wait | next | cart | fail | status  (scripts/shopper.py)
#
# Sessions run in the deploy clone ($HABITS_SRV, always origin/main) inside tmux, with Remote
# Control on, so each one shows up in the Claude app. They get only the shop-browser MCP
# server (strict config), the order lock in every page, and the guard hook in
# .claude/settings.json. Supervised sessions are started only when carts are queued, close
# themselves when done, and are cut off after SHOPPER_MAX_SESSION_MIN.
set -euo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
HABITS_SRV="${HABITS_SRV:-$HOME/srv/habits}"
PROFILE="${FOOD_BROWSER_PROFILE:-$HABITS_HOME/chrome-profile}"
HERE="$HABITS_SRV/backend/ops/mac"
SESSION="habits-shopper"
MAX_SESSION_MIN="${SHOPPER_MAX_SESSION_MIN:-120}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

log() { echo "$(date '+%F %T') shopper: $*"; }

# The MCP config is written at start so every path is absolute: the browser profile, where
# screenshots land, and the order lock loaded into every page.
mcp_config() {
  local cfg="$HABITS_HOME/shopper-mcp.json"
  mkdir -p "$HABITS_HOME/carts"
  cat >"$cfg" <<EOF
{
  "mcpServers": {
    "shop-browser": {
      "command": "npx",
      "args": [
        "-y", "@playwright/mcp@0.0.82",
        "--browser", "chrome",
        "--user-data-dir", "$PROFILE",
        "--output-dir", "$HABITS_HOME/carts",
        "--viewport-size", "1280x900",
        "--init-script", "$HERE/shopper-guard.js"
      ]
    }
  }
}
EOF
  echo "$cfg"
}

session_cmd() {
  printf 'claude --remote-control %q --permission-mode auto --strict-mcp-config --mcp-config %q %q' \
    "Habits shopper" "$(mcp_config)" "/shop"
}

cli() {
  set -a
  # shellcheck disable=SC1091
  . "$HABITS_HOME/env"
  set +a
  export DATABASE_URL="${DATABASE_URL:-sqlite:///$HABITS_HOME/mastery.db}"
  export HABITS_SECRETS_DISABLED=1
  cd "$HABITS_SRV/backend"
  exec .venv/bin/python scripts/shopper.py "$@"
}

supervise() {
  local started=0 backoff=300
  log "supervising (sessions capped at ${MAX_SESSION_MIN} min)"
  while true; do
    "$0" wait --max-minutes 0 >/dev/null # returns once a cart needs the browser
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      if (($(date +%s) - started > MAX_SESSION_MIN * 60)); then
        log "session ran past ${MAX_SESSION_MIN} min; closing it"
        tmux kill-session -t "$SESSION" || true
      fi
      sleep 60
      continue
    fi
    # Carts are waiting and no session is running. If the last one ended within 10 minutes
    # anyway, back off (5 min, doubling to 1 h) so a broken start can't loop.
    if ((started && $(date +%s) - started < 600)); then
      log "last session ended early with carts still queued; retrying in $((backoff / 60)) min"
      sleep "$backoff"
      backoff=$((backoff * 2 > 3600 ? 3600 : backoff * 2))
    else
      backoff=300
    fi
    log "carts queued; starting a session"
    tmux new-session -d -s "$SESSION" -x 200 -y 50 -c "$HABITS_SRV" "$(session_cmd)"
    started=$(date +%s)
    sleep 60
  done
}

case "${1:-}" in
  supervise) supervise ;;
  done)
    # Detached, so the session's own tool call returns before tmux closes it.
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      nohup bash -c "sleep 5; tmux kill-session -t $SESSION" >/dev/null 2>&1 &
      echo "Queue empty. This session closes in a few seconds; the next cart starts a new one."
    else
      echo "Not running under the supervisor; you can close this session."
    fi
    ;;
  start)
    cd "$HABITS_SRV"
    eval "exec caffeinate -i $(session_cmd)"
    ;;
  login)
    case "${2:-}" in
      hmart) url="https://www.hmart.com/customer/account/login/" ;;
      wf) url="https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz" ;;
      weg) url="https://www.doordash.com/store/wegmans" ;;
      *) url="https://www.doordash.com/" ;;
    esac
    mkdir -p "$PROFILE"
    open -na "Google Chrome" --args --user-data-dir="$PROFILE" --no-first-run "$url"
    echo "Sign in, then quit that Chrome window (Cmd-Q) so the shopper can use the profile."
    ;;
  *) cli "$@" ;;
esac
