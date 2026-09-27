#!/usr/bin/env bash
# The grocery shopper: a Claude Code session (your Claude subscription, not the API) that
# builds carts in a dedicated Chrome profile when FOOD_EXECUTOR=agent.
#
#   shopper.sh start           open the shopper session in this terminal (Remote Control on)
#   shopper.sh login [store]   open the shopper's Chrome profile to sign in to a store once
#   shopper.sh <cli args>      wait | next | cart | fail | status  (scripts/shopper.py)
#
# The session runs in the deploy clone ($HABITS_SRV, always origin/main) with Remote Control
# on, so it shows up in the Claude app. It gets only the shop-browser MCP server (strict
# config), the order lock in every page, and the guard hook in .claude/settings.json.
set -euo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
HABITS_SRV="${HABITS_SRV:-$HOME/srv/habits}"
PROFILE="${FOOD_BROWSER_PROFILE:-$HABITS_HOME/chrome-profile}"
HERE="$HABITS_SRV/backend/ops/mac"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

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

case "${1:-}" in
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
