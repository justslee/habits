#!/usr/bin/env bash
# Health watchdog for the Habits API (com.habits.watchdog, every 5 minutes).
# Two consecutive failed health checks → restart the service and notify.
set -uo pipefail

LOG_DIR="$HOME/Library/Logs/habits"
STATE="$LOG_DIR/watchdog.fails"
LABEL="com.habits.api"
HEALTH_URL="http://127.0.0.1:${PORT:-8000}/health"
mkdir -p "$LOG_DIR"

if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
  rm -f "$STATE"
  exit 0
fi

fails=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE"
printf '%s watchdog: health check failed (%d)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$fails" >> "$LOG_DIR/events.log"
[ "$fails" -lt 2 ] && exit 0

launchctl kickstart -k "gui/$(id -u)/$LABEL"
printf '%s watchdog: restarted %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$LABEL" >> "$LOG_DIR/events.log"
osascript -e 'display notification "API was down; restarted it" with title "Habits watchdog"' >/dev/null 2>&1 || true
rm -f "$STATE"
