# Phase 4 Tasks — UI Revamp + Runna Clone

## UI Revamp (Pre-Requisite)

### TASK-P4-UI-1: Merge Progress + Dashboard into unified Progress tab
- **Status**: [x] done
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] 4-tab navigation: Log, Train, Run, Progress
  - [ ] "Train" tab = current Workout screen (renamed)
  - [ ] Progress tab top section: mastery stats (radar chart, heatmap, depth progression, compounding)
  - [ ] Progress tab middle section: strength grouped by muscle group
  - [ ] Muscle groups: Chest, Shoulders, Back, Arms, Legs, Core
  - [ ] Each group collapsible, shows exercises with current weight, e1RM, progression status pill
  - [ ] Progress tab bottom section: running stats summary (weekly mileage, pace trend, PRs)
  - [ ] Web build passes
- **Verify**: `npx expo export --platform web`

### TASK-P4-UI-2: Exercise-to-muscle-group mapping
- **Status**: [x] done
- **Depends on**: TASK-P4-UI-1
- **Acceptance Criteria**:
  - [ ] Backend: muscle_group field on ExerciseProfile model (or mapping table)
  - [ ] Seed data maps existing exercises: Bench→Chest, OHP→Shoulders, etc.
  - [ ] API returns exercise profiles with muscle_group field
  - [ ] Alembic migration for new field
- **Verify**: `pytest tests/test_workout_models.py`

---

## Training Plan System

### TASK-P4-010: Training plan data models & migrations
- **Status**: [x] done
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] TrainingPlan model (goal_type, start/end date, current_week, total_weeks, weekly_plan JSON, status, fitness_level)
  - [ ] PlannedRun model (plan FK, week_number, day_of_week, run_type, target_distance, target_pace, structure JSON, completed_run FK, status)
  - [ ] RunSegmentLog model (run FK, segment_index, segment_type, target/actual pace/duration, distance)
  - [ ] Update RunSession: add planned_run_id, ai_feedback, feel_rating, is_pr, pr_type
  - [ ] Alembic migration
- **Verify**: `pytest tests/test_run_models.py`

### TASK-P4-011: Training plan API endpoints
- **Status**: [x] done
- **Depends on**: TASK-P4-010
- **Acceptance Criteria**:
  - [ ] POST /api/v1/runs/plans — create new plan (goal, fitness level, available days, race date)
  - [ ] GET /api/v1/runs/plans/active — get active plan with current week
  - [ ] GET /api/v1/runs/plans/{id}/week/{n} — get specific week's planned runs
  - [ ] PUT /api/v1/runs/plans/{id}/replan — trigger adaptive replanning (missed runs)
  - [ ] GET /api/v1/runs/today — get today's planned run (if any)
  - [ ] POST /api/v1/runs/{id}/feedback — trigger AI post-run feedback
- **Verify**: `pytest tests/test_run_api.py`

### TASK-P4-012: AI training plan generator service
- **Status**: [x] done
- **Depends on**: TASK-P4-011
- **Acceptance Criteria**:
  - [ ] Generate multi-week plan via Clawdbot based on goal, fitness level, schedule
  - [ ] Plan respects strength schedule (Mon/Tue/Wed) and basketball (Sat)
  - [ ] Weekly mileage ramp ~10%/week with deload every 4th week
  - [ ] 80/20 easy/hard distribution
  - [ ] Run types: easy, tempo, intervals, long, recovery, fartlek, progression
  - [ ] Each planned run has specific pace targets and segment structure
  - [ ] Adaptive replanning when runs are missed
  - [ ] Whoop recovery integration (< 50% → easy or rest)
  - [ ] Post-run AI feedback generation
  - [ ] Fallback plan if Clawdbot unavailable
- **Verify**: `pytest tests/test_run_coach.py`

---

## Live Run Tracking (Runna-Quality)

### TASK-P4-020: Run screen redesign — Runna-style UI
- **Status**: [x] done
- **Depends on**: TASK-P4-UI-1
- **Acceptance Criteria**:
  - [ ] Pre-run screen: "Today's Run" card with type, distance, target pace, structure preview
  - [ ] Pre-run: visual segment timeline (warmup → work segments → cooldown)
  - [ ] 3-2-1 countdown animation before tracking starts
  - [ ] During run: full-bleed map with route polyline
  - [ ] During run: bottom sheet with large distance, secondary pace/time/elevation
  - [ ] During run: segment progress bar showing current position in structure
  - [ ] Swipeable metric cards (current split, avg pace, HR)
  - [ ] Pause/resume with visual state change
  - [ ] Stop: "How did it feel?" RPE selector → save
  - [ ] Run type color coding (easy=blue, tempo=orange, intervals=red, long=green, recovery=gray)

### TASK-P4-021: Guided run audio coaching
- **Status**: [x] done
- **Depends on**: TASK-P4-020, TASK-P4-012
- **Acceptance Criteria**:
  - [ ] Audio cues via expo-speech at segment transitions
  - [ ] Mile split announcements (pace + total time)
  - [ ] Pace drift warnings ("You're running too fast for an easy run")
  - [ ] Interval countdown ("30 seconds... 10 seconds... recover")
  - [ ] Halfway notification
  - [ ] Final mile notification
  - [ ] Audio mixes with music (doesn't pause/stop music)
  - [ ] Haptic feedback on mile completions
  - [ ] Audio works with screen locked

### TASK-P4-022: Route pace coloring
- **Status**: [x] done
- **Depends on**: TASK-P4-020
- **Acceptance Criteria**:
  - [ ] Route polyline colored by pace segments (green=on target, yellow=slow, red=too slow)
  - [ ] Color gradient based on deviation from target pace
  - [ ] Works both during live tracking and in post-run/history views

---

## Post-Run Experience

### TASK-P4-030: Post-run summary screen
- **Status**: [x] done
- **Depends on**: TASK-P4-020
- **Acceptance Criteria**:
  - [ ] Celebration animation on PR
  - [ ] Route map with pace-colored polyline
  - [ ] Key stats: distance, time, avg pace, elevation, calories estimate
  - [ ] Splits table with per-mile pace, elevation, HR
  - [ ] Pace chart (line graph)
  - [ ] Elevation profile chart
  - [ ] AI coach feedback section
  - [ ] PR badge display if applicable
  - [ ] "Save & Close" button

### TASK-P4-031: PR detection engine
- **Status**: [x] done
- **Depends on**: TASK-P4-010
- **Acceptance Criteria**:
  - [ ] Detect PRs for: fastest mile, 5K, 10K, half marathon, marathon
  - [ ] Detect PRs within a run (e.g., fastest 5K split within a 10K run)
  - [ ] Store in PersonalRecord model
  - [ ] PR celebration in post-run screen
  - [ ] PR board in analytics

---

## History & Analytics

### TASK-P4-040: Run history screen (enhanced)
- **Status**: [x] done
- **Depends on**: TASK-P4-011
- **Acceptance Criteria**:
  - [ ] Run list: route thumbnail, distance, pace, date, run type badge
  - [ ] Tap for full detail view (map + splits + charts + AI feedback)
  - [ ] Filter by run type, date range
  - [ ] Infinite scroll / pagination

### TASK-P4-041: Running analytics dashboard
- **Status**: [ ] todo
- **Depends on**: TASK-P4-040
- **Acceptance Criteria**:
  - [ ] Weekly mileage bar chart (current week highlighted)
  - [ ] Monthly mileage trend line
  - [ ] Average pace trend over time
  - [ ] PR board: fastest times per distance
  - [ ] Training load chart (fitness/fatigue/form — Strava-style)
  - [ ] Elevation gain totals (weekly/monthly/all-time)
  - [ ] Heart rate zone distribution (if Whoop HR available)

### TASK-P4-042: Training plan calendar view
- **Status**: [ ] todo
- **Depends on**: TASK-P4-012
- **Acceptance Criteria**:
  - [ ] Week calendar showing planned runs with type color dots
  - [ ] Current week highlighted
  - [ ] Completed runs show checkmark, missed runs show X
  - [ ] Tap planned run to see details / start run
  - [ ] Plan progress: week X of Y, total mileage vs planned

---

## Integration

### TASK-P4-050: Unified Progress tab — running section
- **Status**: [x] done
- **Depends on**: TASK-P4-041, TASK-P4-UI-1
- **Acceptance Criteria**:
  - [ ] Running stats summary card in Progress tab
  - [ ] Weekly mileage, current pace trend, next planned run
  - [ ] Link to full run analytics
  - [ ] Running data feeds into 1% tracker

### TASK-P4-051: Whoop recovery for run coaching
- **Status**: [x] done
- **Depends on**: TASK-P4-012
- **Acceptance Criteria**:
  - [ ] Recovery score shown on Today's Run card
  - [ ] Low recovery (< 50%) → plan auto-adjusts (easy run or rest)
  - [ ] Declining recovery trend (3+ days) → coach alert
  - [ ] Sleep quality factors into intensity recommendation
  - [ ] Uses existing whoop service (cached snapshots)

---

## Route Creation & Planning

### TASK-P4-060: Route data model & API
- **Status**: [x] done
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] SavedRoute model (name, waypoints JSON, polyline JSON, distance_miles, elevation_gain_ft, tags, route_type)
  - [ ] POST /api/v1/routes — save a new route
  - [ ] GET /api/v1/routes — list saved routes
  - [ ] GET /api/v1/routes/{id} — route detail with polyline
  - [ ] DELETE /api/v1/routes/{id}
  - [ ] GET /api/v1/routes/{id}/runs — all runs on this route
  - [ ] Link RunSession to SavedRoute (optional FK)
  - [ ] Alembic migration
- **Verify**: `pytest tests/test_route_api.py`

### TASK-P4-061: Route drawing screen
- **Status**: [ ] todo
- **Depends on**: TASK-P4-060
- **Acceptance Criteria**:
  - [ ] Full-screen map with tap-to-add-waypoint
  - [ ] Road-snapped polyline between waypoints (OpenRouteService or Mapbox Directions API)
  - [ ] Live distance + elevation estimate as route is drawn
  - [ ] Undo last waypoint, clear all
  - [ ] "Out and back" button: mirrors route from last waypoint back to start
  - [ ] "Loop" generation: given target distance, suggest a loop from start point
  - [ ] Save route with name and tags (flat, hilly, trail, track, neighborhood)

### TASK-P4-062: Route library & selection
- **Status**: [ ] todo
- **Depends on**: TASK-P4-061
- **Acceptance Criteria**:
  - [ ] Route library screen: list of saved routes with map thumbnail, distance, elevation, last run date
  - [ ] Select route before starting a run (pre-loads route on tracking map)
  - [ ] Route overlay during live tracking (see planned route vs actual path)
  - [ ] Auto-detect repeated routes from GPS history (fuzzy match ~50m corridor)

### TASK-P4-063: Route comparison & analytics
- **Status**: [ ] todo
- **Depends on**: TASK-P4-062, TASK-P4-040
- **Acceptance Criteria**:
  - [ ] Overlay multiple runs on the same route
  - [ ] Side-by-side split comparison (mile 1 pace across runs)
  - [ ] "Route PR" detection (fastest time on a saved route)
  - [ ] Route-specific pace trend chart

---

## Task Dependency Graph

```
UI Revamp:
  TASK-P4-UI-1 → TASK-P4-UI-2

Training Plans:
  TASK-P4-010 → TASK-P4-011 → TASK-P4-012

Live Tracking (depends on UI-1):
  TASK-P4-020 → TASK-P4-021
  TASK-P4-020 → TASK-P4-022

Post-Run (depends on 020, 010):
  TASK-P4-030 → (needs 020)
  TASK-P4-031 → (needs 010)

History & Analytics (depends on 011):
  TASK-P4-040 → TASK-P4-041
  TASK-P4-042 → (needs 012)

Routes:
  TASK-P4-060 → TASK-P4-061 → TASK-P4-062 → TASK-P4-063
  TASK-P4-062 → (needs 020 for live overlay)
  TASK-P4-063 → (needs 040 for run history)

Integration (depends on everything):
  TASK-P4-050 → (needs 041, UI-1)
  TASK-P4-051 → (needs 012)
```

## Recommended Build Order

1. **TASK-P4-UI-1, UI-2** — UI revamp (4-tab, muscle groups)
2. **TASK-P4-010, 011** — Training plan data + API
3. **TASK-P4-012** — AI plan generator
4. **TASK-P4-020** — Run screen redesign
5. **TASK-P4-021, 022** — Guided runs + pace coloring
6. **TASK-P4-030, 031** — Post-run experience
7. **TASK-P4-060, 061** — Route data model + drawing screen
8. **TASK-P4-062** — Route library + live overlay during runs
9. **TASK-P4-040, 041, 042** — History + analytics + calendar
10. **TASK-P4-063** — Route comparison analytics
11. **TASK-P4-050, 051** — Integration + Whoop
