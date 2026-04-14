# Phase 3 Tasks — GPS Run Tracking

## Data Layer

### TASK-P3-001: Run data models & migrations
- **Status**: [x] done
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] RunSession model (date, distance, duration, avg_pace, elevation_gain, gps_polyline JSON, splits JSON, weather, rpe, whoop data, status)
  - [ ] RunSplit model (run FK, mile number, pace, elevation_change, timestamp)
  - [ ] RunningProfile model (weekly_mileage_target, goal_type, current_plan JSON, plan_week, deload_week)
  - [ ] PersonalRecord model (distance_label, time_seconds, date, run FK)
  - [ ] Alembic migration
- **Verify**: `pytest tests/test_run_models.py`

## GPS & Tracking

### TASK-P3-002: GPS tracking service (mobile)
- **Status**: [x] done
- **Depends on**: TASK-P3-001
- **Acceptance Criteria**:
  - [ ] expo-location background tracking (AC-P3-1.6)
  - [ ] Real-time pace, distance, elapsed time calculation (AC-P3-1.1–1.3)
  - [ ] Elevation tracking (AC-P3-1.4)
  - [ ] GPS polyline recording with timestamps
  - [ ] Battery-efficient (AC-P3-1.9)
  - [ ] expo-task-manager for background task

### TASK-P3-003: Live run tracking screen
- **Status**: [x] done
- **Depends on**: TASK-P3-002
- **Acceptance Criteria**:
  - [ ] Start/pause/stop controls
  - [ ] Live pace, distance, time, elevation display
  - [ ] Mile split auto-detection and audio cue (AC-P3-1.7)
  - [ ] Map with real-time position (AC-P3-1.5)
  - [ ] Works with screen locked

## API Layer

### TASK-P3-004: Run session API endpoints
- **Status**: [x] done
- **Depends on**: TASK-P3-001
- **Acceptance Criteria**:
  - [ ] POST /api/v1/runs — save completed run with GPS data + splits
  - [ ] GET /api/v1/runs — list runs with date range
  - [ ] GET /api/v1/runs/{id} — run detail with splits and map data
  - [ ] GET /api/v1/runs/stats — weekly/monthly mileage, pace trends
  - [ ] GET /api/v1/runs/prs — personal records
  - [ ] POST /api/v1/runs/{id}/export-gpx — export to GPX

### TASK-P3-005: AI run coach service
- **Status**: [x] done
- **Depends on**: TASK-P3-004
- **Acceptance Criteria**:
  - [ ] Generate weekly running plan via Claude (AC-P3-3.1, AC-P3-3.2)
  - [ ] Adapt plan on missed runs (AC-P3-3.3)
  - [ ] Whoop recovery integration (AC-P3-3.4)
  - [ ] Post-run AI feedback (AC-P3-3.6)
  - [ ] Progressive overload ~10%/week (AC-P3-3.7)
  - [ ] Auto deload every 4th week (AC-P3-3.8)
  - [ ] PR detection and celebration

## Mobile UI

### TASK-P3-006: Run history & detail screens
- **Status**: [x] done
- **Depends on**: TASK-P3-004
- **Acceptance Criteria**:
  - [ ] Run history list (date, distance, pace, route preview)
  - [ ] Run detail: map with route, splits table, elevation chart
  - [ ] Tab navigation: add Run tab

### TASK-P3-007: Running stats & analytics screen
- **Status**: [x] done
- **Depends on**: TASK-P3-004
- **Acceptance Criteria**:
  - [ ] Weekly/monthly mileage chart (AC-P3-4.1)
  - [ ] Pace trend line (AC-P3-4.2)
  - [ ] PR board (AC-P3-4.4)
  - [ ] Training load visualization (AC-P3-4.5)
