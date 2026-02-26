# Mobile Database (SQLite)

## Overview

The mobile app uses SQLite via `expo-sqlite` for offline-first support.

This will be implemented in a future task when the mobile UI is built.

## Planned Setup

```bash
npx expo install expo-sqlite
```

## Schema Mirror

The mobile database schema mirrors the backend schema:
- `daily_entries` - Local cache of entries for offline logging
- `pillars` - Synced from backend on first load
- Sync mechanism: TBD (likely background sync when online)

## Key Decisions (from DECISIONS.md)

- D-011: SQLite for both device and backend databases
- Offline-first: Entries logged locally, synced to backend when online
