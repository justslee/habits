# Phase 2 Tasks — Fitness Module

## Data Layer

### TASK-P2-001: Workout data models & migrations
- **Status**: [x] done
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] WorkoutSession model (date, day_type, whoop data, ai plan, coach notes, overall RPE)
  - [ ] ExerciseLog model (session FK, exercise name, set number, weight, reps, RPE, notes)
  - [ ] ExerciseProfile model (exercise name, working weight, rep target, e1RM, progression status, stall count, mesocycle phase)
  - [ ] Alembic migration created and applied
  - [ ] Seed data: core exercises with initial profiles
- **Verify**: `alembic upgrade head && pytest tests/test_workout_models.py`

### TASK-P2-002: Whoop integration service
- **Status**: [x] done
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] Whoop API client with OAuth2 token refresh (AC-P2-5.1)
  - [ ] Pull recovery, HRV, RHR, sleep score (AC-P2-5.2)
  - [ ] Pull previous day strain (AC-P2-5.3)
  - [ ] Cache data locally in DB for trending (AC-P2-5.4)
  - [ ] Graceful fallback when Whoop unavailable (AC-P2-5.5)
  - [ ] Detect 2+ week declining recovery trend (AC-P2-5.6)
- **Verify**: `pytest tests/test_whoop_service.py`

## AI Engine

### TASK-P2-003: Progressive overload engine
- **Status**: [x] done
- **Depends on**: TASK-P2-001
- **Acceptance Criteria**:
  - [ ] Calculate next session targets from history (AC-P2-4.1)
  - [ ] Double progression: all reps hit → increase weight (AC-P2-4.2)
  - [ ] Track volume per muscle group per week (AC-P2-4.3)
  - [ ] Detect stalls after 2-3 sessions (AC-P2-4.4)
  - [ ] Recommend stall resolution (AC-P2-4.5)
  - [ ] Auto-program deloads (AC-P2-4.6)
  - [ ] Calculate estimated 1RM via Epley formula (AC-P2-4.7)
  - [ ] Progression status per exercise (AC-P2-4.8)
- **Verify**: `pytest tests/test_progressive_overload.py`

### TASK-P2-004: AI workout generator (Coach persona)
- **Status**: [x] done
- **Depends on**: TASK-P2-001, TASK-P2-002, TASK-P2-003
- **Acceptance Criteria**:
  - [ ] Generate complete workout plan per day (AC-P2-2.1)
  - [ ] Include warm-up sets from working weight (AC-P2-2.2)
  - [ ] Include pre-lift jog (AC-P2-2.3)
  - [ ] Adjust based on Whoop recovery thresholds (AC-P2-2.4)
  - [ ] Track mesocycle phase (AC-P2-2.5)
  - [ ] Target RPE 7-8 (AC-P2-2.6)
  - [ ] Account for cross-day fatigue (AC-P2-2.7)
  - [ ] Route through Clawdbot (AC-P2-2.8)
  - [ ] Coach persona system prompt injected
- **Verify**: `pytest tests/test_workout_generator.py`

## API Layer

### TASK-P2-005: Workout session API endpoints
- **Status**: [x] done
- **Depends on**: TASK-P2-001
- **Acceptance Criteria**:
  - [ ] POST /api/v1/workouts — create session with exercise logs
  - [ ] GET /api/v1/workouts — list sessions with date range
  - [ ] GET /api/v1/workouts/{id} — session detail with all sets
  - [ ] GET /api/v1/workouts/today — today's plan
  - [ ] POST /api/v1/workouts/{id}/exercises — log individual sets
- **Verify**: `pytest tests/test_workout_api.py`

### TASK-P2-006: Workout chat API (live coaching)
- **Status**: [x] done
- **Depends on**: TASK-P2-004, TASK-P2-005
- **Acceptance Criteria**:
  - [ ] POST /api/v1/workouts/{id}/chat — send message, get coach response
  - [ ] Parse natural language into structured set data (AC-P2-3.1, AC-P2-3.2)
  - [ ] Coach provides real-time commentary (AC-P2-3.3)
  - [ ] Adjusts remaining workout on the fly (AC-P2-3.4)
  - [ ] Flags discomfort/form concerns (AC-P2-3.5)
- **Verify**: `pytest tests/test_workout_chat.py`

### TASK-P2-007: Exercise profiles & progress API
- **Status**: [x] done
- **Depends on**: TASK-P2-003
- **Acceptance Criteria**:
  - [ ] GET /api/v1/exercises — list all exercise profiles
  - [ ] GET /api/v1/exercises/{name}/history — full history for an exercise
  - [ ] GET /api/v1/exercises/{name}/progression — progression status + e1RM chart data
  - [ ] GET /api/v1/exercises/volume — weekly volume by muscle group
- **Verify**: `pytest tests/test_exercise_api.py`

## Mobile UI

### TASK-P2-008: Workout plan screen
- **Status**: [x] done
- **Depends on**: TASK-P2-005
- **Acceptance Criteria**:
  - [ ] Shows today's workout plan (exercises, sets, reps, target weights)
  - [ ] Warm-up sets displayed
  - [ ] Whoop recovery context shown
  - [ ] Mesocycle phase indicator
  - [ ] Tab navigation: add Workout tab

### TASK-P2-009: Live workout chat screen
- **Status**: [x] done
- **Depends on**: TASK-P2-006
- **Acceptance Criteria**:
  - [ ] Chat interface for logging sets
  - [ ] Natural language input
  - [ ] Real-time coach responses
  - [ ] Running tally of completed sets
  - [ ] Voice input support (AC-P2-3.6)

### TASK-P2-010: Workout history & progress charts
- **Status**: [x] done
- **Depends on**: TASK-P2-007
- **Acceptance Criteria**:
  - [ ] Per-exercise e1RM trend chart (AC-P2-7.1)
  - [ ] Volume per muscle group chart (AC-P2-7.5)
  - [ ] Week-over-week comparison (AC-P2-7.6)
  - [ ] Progression status badges per exercise (AC-P2-7.8)

## Notifications

### TASK-P2-011: Morning briefing notification
- **Status**: [x] done
- **Depends on**: TASK-P2-004, TASK-P2-002
- **Acceptance Criteria**:
  - [ ] Weekday morning push notification (AC-P2-1.1)
  - [ ] Includes quote (AC-P2-1.2)
  - [ ] Includes workout preview (AC-P2-1.3)
  - [ ] Includes Whoop data (AC-P2-1.4)
  - [ ] Adjusted if recovery low (AC-P2-1.5)

### TASK-P2-012: End-of-day check-in notification
- **Status**: [x] done
- **Depends on**: TASK-P2-005
- **Acceptance Criteria**:
  - [ ] Evening push notification (AC-P2-6.1)
  - [ ] Shows workout summary (AC-P2-6.2)
  - [ ] Links to daily check-in (AC-P2-6.3)
  - [ ] Fitness data auto-populates (AC-P2-6.4)
