# Mobile SQLite Schema (Offline-First)

> **Status**: Documentation only — mobile DB not built yet.  
> **Decision**: D-011 — SQLite on both device and backend.

## Overview

The mobile app (React Native + Expo) will use a local SQLite database for offline-first support. Entries are created locally and synced to the backend when connectivity is available.

## Recommended Library

- [`expo-sqlite`](https://docs.expo.dev/versions/latest/sdk/sqlite/) — Expo's built-in SQLite module, no native module linking needed.

## Schema (mirrors backend)

```sql
-- Pillars (seeded on first launch, matches backend)
CREATE TABLE pillars (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    short_name TEXT NOT NULL UNIQUE,
    description TEXT,
    depth_target TEXT,
    display_order INTEGER DEFAULT 0
);

-- Daily entries (created offline, synced later)
CREATE TABLE daily_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,              -- NULL until synced to backend
    entry_date TEXT NOT NULL,        -- ISO 8601 date (YYYY-MM-DD)
    description TEXT NOT NULL,
    time_invested_minutes INTEGER NOT NULL,
    pillar_tags TEXT,                -- comma-separated pillar IDs
    suggested_pillar_tags TEXT,
    difficulty_rating INTEGER,
    energy_level INTEGER,
    key_takeaway TEXT,
    sync_status TEXT DEFAULT 'pending',  -- pending | synced | conflict
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Evaluations (pulled from backend after sync)
CREATE TABLE evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_server_id INTEGER NOT NULL,
    depth_score INTEGER NOT NULL,
    relevance_score INTEGER NOT NULL,
    consistency_multiplier REAL DEFAULT 1.0,
    one_percent_better INTEGER NOT NULL,  -- 0 or 1 (SQLite boolean)
    verdict_explanation TEXT NOT NULL,
    commentary TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Streaks (synced from backend, cached locally for display)
CREATE TABLE streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pillar_id INTEGER NOT NULL,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date TEXT,
    FOREIGN KEY (pillar_id) REFERENCES pillars(id)
);

-- Milestones (created offline, synced later)
CREATE TABLE milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    pillar_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    achieved_date TEXT NOT NULL,
    sync_status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pillar_id) REFERENCES pillars(id)
);
```

## Sync Strategy

1. **Create locally first** — entries and milestones get `sync_status = 'pending'`
2. **Background sync** — when online, POST pending entries to backend, receive `server_id`
3. **Pull evaluations** — after sync, fetch AI evaluations from backend
4. **Pull streaks/scores** — periodically refresh cached streak and pillar score data
5. **Conflict resolution** — last-write-wins (single user, conflicts are rare)

## Notes

- SQLite dates stored as ISO 8601 text strings (SQLite has no native date type)
- Booleans stored as 0/1 integers
- `server_id` is NULL for entries not yet synced — use this to find pending uploads
- Pillar data is seeded on app install and should match backend exactly
