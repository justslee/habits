#!/usr/bin/env bash
# The grocery shopper: a Claude Code session (your Claude subscription, not the API) that
# builds carts in a dedicated Chrome profile when FOOD_EXECUTOR=agent.
#
#   shopper.sh start           open the shopper session in this terminal (Remote Control on)
#   shopper.sh login [store]   open the shopper's Chrome profile to sign in to a store once
#   shopper.sh <cli args>      wait | next | cart | checkout | fail | status  (scripts/shopper.py)
#
# The CLI runs the deployed code ($HABITS_SRV) against the live database, like start-api.sh.
set -euo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
HABITS_SRV="${HABITS_SRV:-$HOME/srv/habits}"
HABITS_REPO="${HABITS_REPO:-$HOME/habits}"
PROFILE="${FOOD_BROWSER_PROFILE:-$HABITS_HOME/chrome-profile}"

case "${1:-}" in
  start)
    cd "$HABITS_REPO"
    exec caffeinate -i claude --remote-control "Habits shopper" --permission-mode auto "/shop"
    ;;
  login)
    case "${2:-}" in
      hmart) url="https://www.hmart.com/customer/account/login/" ;;
      wf)    url="https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz" ;;
      weg)   url="https://www.doordash.com/store/wegmans" ;;
      *)     url="https://www.doordash.com/" ;;
    esac
    mkdir -p "$PROFILE"
    open -na "Google Chrome" --args --user-data-dir="$PROFILE" --no-first-run "$url"
    echo "Sign in, then quit that Chrome window (Cmd-Q) so the shopper can use the profile."
    exit 0
    ;;
esac

set -a
# shellcheck disable=SC1091
. "$HABITS_HOME/env"
set +a
export DATABASE_URL="${DATABASE_URL:-sqlite:///$HABITS_HOME/mastery.db}"
export HABITS_SECRETS_DISABLED=1

cd "$HABITS_SRV/backend"
exec .venv/bin/python scripts/shopper.py "$@"
