# SPECS.md — Feature Specs & Implementation Plan

## Feature 1: Weekly Review Synthesis (Sunday Board Meeting)

### What exists
- `WeeklyReview` model with grade, pillar distribution, comfort zone analysis, recommendations, quote
- `generate_weekly_review()` service that gathers week's entries + evals, calls Opus, produces JSON
- API endpoints: `POST /reviews/generate`, `GET /reviews/`, `GET /reviews/latest`
- Push token registration endpoint
- No frontend UI for viewing reviews

### What's needed

**Backend:**
- Auto-trigger: generate review Sunday evening (via cron or end-of-day endpoint on Sundays)
- Enhance the LLM prompt to also include:
  - Focus/energy trends across the week (from daily reflections)
  - Best session of the week (highest depth score)
  - Most neglected pillar (longest gap or lowest hours)
  - Week-over-week comparison (vs prior week's grade and hours)
- Add `focus_energy_summary`, `best_session`, `neglected_pillar`, `week_over_week` fields to WeeklyReview model (or pack into existing text fields)

**Frontend — new WeeklyReviewScreen:**
- Accessed from Progress tab (new "Weekly" section or card that links to it)
- Letter grade displayed prominently (big colored letter, A=green, B=blue, C=yellow, D/F=red)
- Sections: Pillar Distribution (mini bar chart), Comfort Zone Analysis, Best Session highlight, Recommendations (numbered list), Quote
- Past reviews list (scrollable, tap to expand)
- "Generate Review" button for manual trigger

**Notifications:**
- Push notification Sunday 8pm: "Your weekly review is ready 📊"

### Implementation tasks
1. `backend` — Add new fields to weekly review prompt + response parsing
2. `backend` — Add Sunday auto-trigger in end-of-day or new cron endpoint
3. `mobile` — Create `WeeklyReviewScreen.tsx` with full review display
4. `mobile` — Add navigation from Progress tab to WeeklyReviewScreen
5. `mobile` — Push notification on Sunday evening

---

## Feature 3: Eval Feedback Loop in Check-In

### What exists
- Check-In saves reflection → triggers `POST /daily/end-of-day` → runs AI eval per pillar
- Success screen just shows "Logged" with a checkmark
- Eval results (depth score, 1% verdict, commentary) exist in the response but aren't shown

### What's needed

**Backend:**
- `POST /daily/end-of-day` already returns `results[]` with `depth_score` and `one_percent_better` — extend to also return `verdict_explanation` and `commentary` per pillar

**Frontend — Enhanced success screen:**
- After reflection submit, show a loading state "Evaluating your day..." while end-of-day runs
- On completion, replace the generic success screen with the eval results:
  - Per-pillar cards showing: pillar name, depth score (circular progress ring), 1% better badge (✓/✗)
  - Tap a pillar card to expand and show the AI commentary (brutally honest feedback)
  - Overall summary: "You got 1% better in 2/3 pillars today"
- If no pillar-linked todos were completed, show simpler "Reflection saved" without eval
- Keep the "Done" button at bottom

### Implementation tasks
1. `backend` — Extend end-of-day response with full eval details
2. `mobile` — Add loading state in CheckInScreen during eval
3. `mobile` — Build eval results UI (pillar cards, depth rings, commentary)
4. `mobile` — Handle edge cases (no todos, eval failure fallback)

---

## Feature 4: Concept Mastery Map (Skill Tree)

### What exists
- `PillarConcept` model: 5-tier concept tree per pillar (Foundation → Frontier)
- `ConceptLink` model: cross-pillar connections (shared_skill, prerequisite, related)
- Full CRUD API for concepts + links + LLM seeding
- `ConceptGraph.tsx` — SVG-based interactive tree with zoom/pan/tap
- `PillarDetailScreen.tsx` — list + graph view toggle, concept status cycling, add/edit/delete
- Concepts are NOT auto-updated from evaluations (static status — manual toggle only)

### What's needed

**Backend — Auto-tag concepts from evaluations:**
- When end-of-day eval runs, have the AI also identify which concepts were touched in the session
- New field on Evaluation or separate table: `concepts_touched` (list of concept IDs or names)
- Update concept status automatically: if a concept is touched 3+ times across sessions, move to `in_progress`; if depth scores for sessions touching it average > 70, move to `mastered`
- New endpoint: `GET /pillars/{id}/concepts/progress` — returns concept-level stats (times touched, avg depth when touched)

**Frontend — Enhanced ConceptGraph:**
- Pulsing/glow effect on recently-touched concepts (last 7 days)
- Progress ring around each node showing progression toward mastery (not just color)
- Concept detail modal: show when it was last touched, session descriptions that referenced it, current mastery %
- Add a "Mastery Map" section to Progress tab (overview across all pillars — total concepts, % mastered per pillar)

**Frontend — Progress tab integration:**
- New mastery map card in Progress > Mastery section
- Shows all 5 pillars as mini skill trees or simple bar (X/Y concepts mastered)
- Tap to navigate to PillarDetailScreen

### Implementation tasks
1. `backend` — Extend eval prompt to identify concepts touched per session
2. `backend` — Create concept progress tracking (touch counts, auto-status updates)
3. `backend` — New endpoint for concept-level progress stats
4. `mobile` — Enhance ConceptGraph with pulse/glow effects and progress rings
5. `mobile` — Build concept detail modal with history
6. `mobile` — Add Mastery Map overview to Progress tab

---

## Implementation Order

### Phase 1: Eval Feedback Loop (Feature 3)
**Why first:** Smallest scope, highest immediate impact. Closes the daily feedback loop — you see results every time you check in. ~2 tasks.

### Phase 2: Weekly Review UI (Feature 1)
**Why second:** Backend is 90% done. Mainly a frontend screen + auto-trigger wiring. Gives you the Sunday board meeting ritual. ~3 tasks.

### Phase 3: Concept Mastery Map (Feature 4)
**Why third:** Most complex, most infrastructure exists but needs the AI concept-tagging integration. Build incrementally — start with auto-tagging, then enhance the graph. ~4 tasks.
