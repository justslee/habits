#!/usr/bin/env bash
# Nightly SQLite backup (com.habits.backup, 03:30).
# Consistent snapshot via sqlite's online backup API → iCloud Drive, 30-day rotation.
set -euo pipefail

HABITS_HOME="${HABITS_HOME:-$HOME/Library/Application Support/Habits}"
DB="$HABITS_HOME/mastery.db"
DEST_DIR="${HABITS_BACKUP_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Habits Backups}"
LOG_DIR="$HOME/Library/Logs/habits"
mkdir -p "$DEST_DIR" "$LOG_DIR"

[ -f "$DB" ] || { echo "no database at $DB" >&2; exit 1; }

stamp=$(date '+%Y%m%d-%H%M')
out="$DEST_DIR/mastery-$stamp.db"
sqlite3 "$DB" ".backup '$out'"
gzip -f "$out"
find "$DEST_DIR" -name 'mastery-*.db.gz' -mtime +30 -delete
printf '%s backup: %s.gz (%s)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$out" "$(du -h "$out.gz" | cut -f1)" >> "$LOG_DIR/events.log"
