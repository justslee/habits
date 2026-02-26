# TASKS.md — Backlog

> **Manager maintains this file.** Tasks are ordered by priority.
> Each task has acceptance criteria, dependency tracking, and a verify command.

## Format

```
### TASK-XXX: Title
- **Status**: [ ] todo | [~] in-progress | [x] done | [!] blocked
- **Depends on**: TASK-XXX (or "none")
- **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2
- **Verify**: `command to confirm this task is done`
- **Notes**: _optional context_
```

---

## Phase 1 Backlog

### TASK-001: Project scaffolding
- **Status**: [ ] todo
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] Backend: FastAPI app runs on port 8000, `/health` returns `{"status": "ok"}`
  - [ ] Frontend: Vite React app runs on port 5173, renders default page
  - [ ] `.env.example` exists with all required vars documented
  - [ ] `pytest` passes (even if no real tests yet)
  - [ ] `pnpm test` passes (even if no real tests yet)
  - [ ] Project structure follows conventions in CONTEXT.md
- **Verify**: `curl http://localhost:8000/health && cd frontend && pnpm build`

### TASK-002: Database schema & models
- **Status**: [ ] todo
- **Depends on**: TASK-001
- **Acceptance Criteria**:
  - [ ] PostgreSQL database configured and running
  - [ ] SQLAlchemy models for: User, DailyEntry, PillarScore, Streak, Milestone
  - [ ] Alembic migrations set up and initial migration created
  - [ ] Five pillars seeded as reference data
  - [ ] Models support full history queries (no soft deletes, append-only entries)
- **Verify**: `alembic upgrade head && pytest tests/test_models.py`
- **Notes**: Core entities: entries (daily logs), evaluations (AI scores), streaks, milestones

### TASK-003: Daily check-in API endpoints
- **Status**: [ ] todo
- **Depends on**: TASK-002
- **Acceptance Criteria**:
  - [ ] `POST /api/v1/entries` — create daily entry (AC-1.1 through AC-1.7)
  - [ ] `GET /api/v1/entries` — list entries with date range filtering
  - [ ] `GET /api/v1/entries/{id}` — get single entry with evaluation
  - [ ] `PATCH /api/v1/entries/{id}` — update pillar tags (AC-1.4)
  - [ ] Request validation for all required fields
  - [ ] Entries stored with timestamp (AC-1.9)
- **Verify**: `pytest tests/test_entries_api.py`

### TASK-004: Daily check-in UI (mobile-first)
- **Status**: [ ] todo
- **Depends on**: TASK-003
- **Acceptance Criteria**:
  - [ ] Check-in form with all input fields from spec
  - [ ] Free-text description input (AC-1.1)
  - [ ] Time input (hours/minutes picker) (AC-1.2)
  - [ ] Pillar tag selector (multi-select) (AC-1.4)
  - [ ] Difficulty/depth slider (1-10) (AC-1.5)
  - [ ] Energy/focus slider (1-10) (AC-1.6)
  - [ ] Key takeaway text input (AC-1.7)
  - [ ] Form submits in < 3 minutes typical flow (AC-1.8)
  - [ ] Mobile-responsive design
  - [ ] Success feedback on submission
- **Verify**: Manual test: complete check-in flow on mobile viewport

### TASK-005: AI evaluation engine — Claude integration
- **Status**: [ ] todo
- **Depends on**: TASK-003
- **Acceptance Criteria**:
  - [ ] Claude API integration configured (AC-2.6)
  - [ ] Evaluation prompt engineered for brutal honesty
  - [ ] Returns depth score 0-100 (AC-2.1)
  - [ ] Returns relevance score 0-100 (AC-2.2)
  - [ ] Returns binary "1% better" verdict with explanation (AC-2.4)
  - [ ] Returns brutally honest commentary (AC-2.5)
  - [ ] Evaluation stored alongside entry in database
- **Verify**: `pytest tests/test_evaluation_engine.py`
- **Notes**: Prompt must enforce honesty — "no participation trophies"

### TASK-006: AI context & adaptive calibration
- **Status**: [ ] todo
- **Depends on**: TASK-005
- **Acceptance Criteria**:
  - [ ] System maintains user level context per pillar (AC-2.7)
  - [ ] Evaluation prompt includes recent entry history for calibration
  - [ ] Consistency multiplier calculated from streak data (AC-2.3)
  - [ ] Expectations adjust based on demonstrated mastery (AC-2.8)
  - [ ] Reading intro material on known topics scores near zero
  - [ ] Struggling with hard material scores high even if incomplete
- **Verify**: `pytest tests/test_adaptive_calibration.py`
- **Notes**: Track "current level" per pillar, update based on depth scores over time

### TASK-007: Auto-suggest pillar tags
- **Status**: [ ] todo
- **Depends on**: TASK-005
- **Acceptance Criteria**:
  - [ ] LLM analyzes entry text and suggests relevant pillars (AC-1.3)
  - [ ] Suggestions appear before user manually selects
  - [ ] User can accept/reject/modify suggestions
  - [ ] Sub-topic hints included where applicable
- **Verify**: Manual test: enter "studied stochastic calculus proofs" → should suggest Quant Finance

### TASK-008: Streak tracking system
- **Status**: [ ] todo
- **Depends on**: TASK-003
- **Acceptance Criteria**:
  - [ ] Track current streak per pillar (AC-3.3)
  - [ ] Track longest streak ever per pillar (AC-3.3)
  - [ ] Track streak recovery time (days since broken streak)
  - [ ] Streak updates on each daily entry
  - [ ] API endpoint: `GET /api/v1/streaks`
- **Verify**: `pytest tests/test_streaks.py`

### TASK-009: Progress dashboard — basic stats
- **Status**: [ ] todo
- **Depends on**: TASK-003, TASK-008
- **Acceptance Criteria**:
  - [ ] Dashboard page loads in < 3 seconds (AC-3.9)
  - [ ] Shows total hours logged (all time, this week, this month)
  - [ ] Shows breakdown by pillar
  - [ ] Shows average depth score
  - [ ] Shows trend direction (improving/plateauing/declining)
- **Verify**: Manual test: dashboard displays correct aggregations

### TASK-010: Heatmap visualization
- **Status**: [ ] todo
- **Depends on**: TASK-009
- **Acceptance Criteria**:
  - [ ] GitHub-style contribution heatmap (AC-3.2)
  - [ ] Color-coded by pillar (or intensity)
  - [ ] Shows daily engagement density
  - [ ] Clickable cells show that day's entry summary
  - [ ] Displays last 365 days
- **Verify**: Manual test: heatmap renders with real entry data

### TASK-011: Radar chart visualization
- **Status**: [ ] todo
- **Depends on**: TASK-009
- **Acceptance Criteria**:
  - [ ] Five-axis spider chart for all pillars (AC-3.1)
  - [ ] Scores based on cumulative depth + time investment
  - [ ] Updates weekly (or on-demand refresh)
  - [ ] Visually clear which pillars are lagging
- **Verify**: Manual test: radar chart renders with relative pillar scores

### TASK-012: Depth progression curves
- **Status**: [ ] todo
- **Depends on**: TASK-009
- **Acceptance Criteria**:
  - [ ] Line chart per pillar showing depth score over time (AC-3.4)
  - [ ] Filterable by date range (week/month/quarter/year/all)
  - [ ] Shows trendline (moving average)
  - [ ] Clear visual of whether tackling harder material over time
- **Verify**: Manual test: depth chart shows progression for pillar with 10+ entries

### TASK-013: Compounding progress view
- **Status**: [ ] todo
- **Depends on**: TASK-009
- **Acceptance Criteria**:
  - [ ] Shows theoretical 1% daily compound curve (AC-3.7)
  - [ ] Overlays actual cumulative progress
  - [ ] Visual comparison: am I tracking the curve or falling behind?
  - [ ] Timeframes: 30 / 90 / 365 days
- **Verify**: Manual test: compound chart renders with actual vs theoretical

### TASK-014: Milestone tracking
- **Status**: [ ] todo
- **Depends on**: TASK-003
- **Acceptance Criteria**:
  - [ ] User can log milestones (AC-3.8)
  - [ ] `POST /api/v1/milestones` — create milestone with title, description, date, pillar
  - [ ] `GET /api/v1/milestones` — list all milestones
  - [ ] Timeline visualization shows milestones chronologically
- **Verify**: `pytest tests/test_milestones.py`

### TASK-015: Weekly review — automated generation
- **Status**: [ ] todo
- **Depends on**: TASK-005, TASK-008, TASK-009
- **Acceptance Criteria**:
  - [ ] Automated weekly summary generated Sunday (AC-5.1)
  - [ ] Shows pillar attention distribution (AC-5.2)
  - [ ] Detects and calls out comfort zone drift (AC-5.3)
  - [ ] Provides 2-3 focus recommendations (AC-5.4)
  - [ ] Assigns letter grade A-F with justification (AC-5.5)
  - [ ] Includes motivational quote (AC-5.6)
  - [ ] Stored in database for history
- **Verify**: `pytest tests/test_weekly_review.py`

### TASK-016: Weekly review — notification delivery
- **Status**: [ ] todo
- **Depends on**: TASK-015
- **Acceptance Criteria**:
  - [ ] Weekly review delivered via push notification or email (AC-5.7)
  - [ ] User can configure delivery preference
  - [ ] Delivery happens Sunday evening (configurable time)
- **Verify**: Manual test: receive weekly review notification

### TASK-017: PWA configuration
- **Status**: [ ] todo
- **Depends on**: TASK-004
- **Acceptance Criteria**:
  - [ ] `manifest.json` present with name, icons, start_url, display: standalone
  - [ ] Service worker registered
  - [ ] Lighthouse PWA audit passes (score > 80)
  - [ ] Installable on iOS and Android
- **Verify**: `npx lighthouse http://localhost:5173 --only-categories=pwa --output=json | jq '.categories.pwa.score'`

### TASK-018: Vercel deployment (frontend)
- **Status**: [ ] todo
- **Depends on**: TASK-017
- **Acceptance Criteria**:
  - [ ] Frontend deploys to Vercel on push to `main`
  - [ ] Production URL accessible and PWA installable
  - [ ] Environment variables configured in Vercel dashboard
- **Verify**: `curl -s -o /dev/null -w "%{http_code}" https://mastery-tracker.vercel.app`

### TASK-019: Backend deployment (Cloudflare Tunnel)
- **Status**: [ ] todo
- **Depends on**: TASK-015
- **Acceptance Criteria**:
  - [ ] FastAPI backend accessible via Cloudflare Tunnel
  - [ ] HTTPS configured
  - [ ] Health endpoint accessible from public URL
  - [ ] Database persistence configured
- **Verify**: `curl https://mastery-api.<domain>/health`

---

## Phase 2 Backlog (Deferred)

### TASK-P2-001: Pillar skill trees
- **Status**: [ ] todo (V2)
- **Depends on**: Phase 1 complete
- **Notes**: Feature 4 from spec — sub-topic breakdown with mastery percentages

### TASK-P2-002: Notion integration
- **Status**: [ ] todo (V2)
- **Notes**: Pull from existing training logs and study notes

### TASK-P2-003: Calendar integration
- **Status**: [ ] todo (V2)
- **Notes**: Correlate study blocks with logged entries

### TASK-P2-004: Reading app integration
- **Status**: [ ] todo (V2)
- **Notes**: Auto-log completed books/papers
