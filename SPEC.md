# SPEC.md — Product Specification

> **This is the source of truth.** All agent work must trace back to an acceptance criterion here.
> Only the user (you) modifies this file. Agents read it, never write it.

## Project Name

Mastery Tracker

## One-Liner

A personal progress tracking app that answers one question every day: "Did I get 1% better today?" — across the disciplines required to become a world-class investor, hedge fund manager, and thought leader.

## Target Users

Just me (Justin). Personal tool for self-accountability and compounding skill development.

## Goal Architecture

Five pillars define the end-state identity. Every daily activity maps to one or more:

| # | Pillar | Depth Target | Description |
|---|--------|--------------|-------------|
| 1 | Quantitative Finance | PhD / CQF-level | Stochastic calculus, derivatives pricing, portfolio theory, risk modeling, statistical arbitrage, volatility surfaces, factor models, market microstructure |
| 2 | Macro & Qualitative Investing | Elite generalist | Economics (macro/micro), monetary policy, fiscal policy, geopolitics, political risk, global trade flows, sector dynamics, behavioral finance, narrative analysis |
| 3 | Machine Learning (Math) | Research-level | Linear algebra, optimization, probability theory, statistical learning theory, deep learning foundations, kernel methods, information theory, Bayesian inference |
| 4 | AI Engineering & Deployment | Production-grade | ML systems design, model training/fine-tuning, inference optimization, MLOps/pipelines, LLM application development, agentic workflows, data engineering at scale |
| 5 | Public Speaking & Communication | Keynote-caliber | Persuasive storytelling, executive presence, pitch delivery, debate, long-form writing, media fluency, teaching ability |

---

## Core Features

### Feature 1: Daily Check-In / Activity Logger

**Description**: Captures what I did today relevant to my goals. Inputs can be flexible — free-text journal entry, structured form, or a combination. Must be < 2-3 minutes to complete.

**Input Fields**:
- What I worked on — free text describing study sessions, projects, reading, practice, conversations, etc.
- Time invested — hours/minutes per activity
- Pillar tagging — auto-suggested based on content, manually adjustable
- Difficulty / depth rating — surface-level review or deep, uncomfortable learning?
- Energy & focus level — honest self-assessment (1–10)
- Key takeaway — one sentence: most important thing learned or practiced

**Acceptance Criteria**:
- [ ] AC-1.1: User can submit a daily check-in with free-text description
- [ ] AC-1.2: User can log time invested per activity (hours/minutes)
- [ ] AC-1.3: System auto-suggests pillar tags based on entry content (LLM-powered)
- [ ] AC-1.4: User can manually adjust/override pillar tags
- [ ] AC-1.5: User can rate difficulty/depth (1-10 scale)
- [ ] AC-1.6: User can rate energy/focus level (1-10 scale)
- [ ] AC-1.7: User can enter a key takeaway (single sentence)
- [ ] AC-1.8: Check-in can be completed in under 3 minutes
- [ ] AC-1.9: All entries persisted with timestamp and full history queryable

### Feature 2: AI Evaluation Engine ("The Honest Mirror")

**Description**: Takes daily input and produces a brutally honest assessment. No participation trophies. The app's value is in telling the truth.

**Evaluation Criteria**:
- Depth score — PhD-level engagement or surface skimming? Struggled with hard material or coasted?
- Relevance score — How directly does this move the needle toward pillar goals?
- Consistency multiplier — Showing up daily, or burst after days of nothing?
- 1% better verdict — Binary + explanation. Meaningful advance in any pillar? If not, why?
- Brutally honest commentary — No sugarcoating

**Example Outputs**:
- "You spent 2 hours on ML but just re-read notes you already know. That's maintenance, not growth. Zero progress."
- "45 minutes deep in measure theory proofs you couldn't solve yesterday — that's real 1% work."
- "You claim 3 hours of macro study but it was scrolling Twitter threads. Be honest with yourself."

**Calibration Rules**:
- AI should learn current level over time and adjust expectations upward as improvement happens
- Reading introductory material on something already known deeply → score near zero
- Struggling with something genuinely hard (even if not "finished") → score high
- Consistency and intensity both matter: 30 focused minutes beats 3 distracted hours

**Acceptance Criteria**:
- [ ] AC-2.1: Each daily entry receives a depth score (0-100)
- [ ] AC-2.2: Each daily entry receives a relevance score (0-100)
- [ ] AC-2.3: System tracks consistency and applies a multiplier to scoring
- [ ] AC-2.4: Each entry receives a binary "1% better" verdict with explanation
- [ ] AC-2.5: Commentary is brutally honest — calls out coasting, shallow work, dishonest logging
- [ ] AC-2.6: Evaluation uses Claude API for LLM-powered assessment
- [ ] AC-2.7: System maintains context of user's current level per pillar to calibrate expectations
- [ ] AC-2.8: Expectations adjust upward as user demonstrates mastery (adaptive difficulty)

### Feature 3: Progress Visualization Dashboard

**Description**: Shows how far I've come across all pillars over time. This is the motivational engine.

**Visualizations**:
- Pillar radar chart — Five-axis spider chart showing relative development, updated weekly
- Cumulative effort heatmap — GitHub-style contribution grid, color-coded by pillar
- Streak tracker — Current streak per pillar, longest streak ever, streak recovery time
- Depth progression curve — Per pillar line chart showing difficulty increase over time
- Weekly & monthly rollups — Summary cards: total hours, breakdown by pillar, average depth score, trend direction
- Compounding progress view — 1% daily gains compound curve with actual data overlaid against theoretical
- Milestone timeline — Key achievements plotted: "First derivatives model built," "Gave first public talk," etc.

**Acceptance Criteria**:
- [ ] AC-3.1: Radar chart displays all 5 pillars with relative scores, updates weekly
- [ ] AC-3.2: Heatmap shows daily engagement density, color-coded by pillar (GitHub-style)
- [ ] AC-3.3: Streak tracker shows current and longest streak per pillar
- [ ] AC-3.4: Depth progression chart shows difficulty trend per pillar over time
- [ ] AC-3.5: Weekly rollup card shows total hours, pillar breakdown, avg depth, trend direction
- [ ] AC-3.6: Monthly rollup card shows same metrics at month granularity
- [ ] AC-3.7: Compounding view shows theoretical 1% curve vs actual progress
- [ ] AC-3.8: Milestone timeline displays user-logged achievements chronologically
- [ ] AC-3.9: Dashboard loads in < 3 seconds with full history

### Feature 4: Pillar Skill Trees (V2 — Optional)

**Description**: Breaks each pillar into sub-topics with a skill tree or knowledge map. Shows mastery progress per sub-topic.

**Example (Quantitative Finance)**:
```
Probability & Statistics    → ███████░░░ 70%
Stochastic Calculus         → ████░░░░░░ 40%
Derivatives Pricing         → ██░░░░░░░░ 20%
Portfolio Optimization      → █████░░░░░ 50%
Market Microstructure       → █░░░░░░░░░ 10%
```

Progress updates based on logged activities. Neglected areas visually stagnate or slightly decay.

**Acceptance Criteria**:
- [ ] AC-4.1: Each pillar has defined sub-topics with mastery percentages
- [ ] AC-4.2: Sub-topic progress updates based on logged activities
- [ ] AC-4.3: Neglected sub-topics show visual stagnation after 2+ weeks
- [ ] AC-4.4: Optional decay mechanic for extended neglect (4+ weeks)

### Feature 5: Weekly Review & Recalibration

**Description**: End-of-week automated summary with forward-looking recommendations.

**Includes**:
- Which pillars got attention, which got neglected
- Whether drifting toward comfort zones (e.g., all coding, no speaking practice)
- Suggested focus areas for the coming week
- Honest grade: A through F, with justification
- Quote or framing to reset mindset

**Acceptance Criteria**:
- [ ] AC-5.1: Automated weekly summary generated every Sunday
- [ ] AC-5.2: Summary shows pillar attention distribution (hours + depth per pillar)
- [ ] AC-5.3: System detects comfort zone drift and calls it out
- [ ] AC-5.4: Provides 2-3 specific focus recommendations for next week
- [ ] AC-5.5: Assigns letter grade (A-F) with honest justification
- [ ] AC-5.6: Includes motivational quote or reframing statement
- [ ] AC-5.7: Weekly review delivered via push notification / email

---

## Non-Functional Requirements

- [ ] Backend responds < 500ms for all endpoints under normal load
- [ ] Frontend loads in < 3s on mobile (Lighthouse score > 80)
- [ ] PWA installable on iOS and Android
- [ ] All API endpoints return proper error codes and messages
- [ ] No secrets in source code
- [ ] All entries stored with full history — long-term trend data is core value
- [ ] Daily logging takes < 3 minutes (low friction)

## Design Principles

1. **Honesty over encouragement** — The app's value is in telling the truth. Bad week = say so clearly.
2. **Depth over volume** — 1 hour of deep, painful learning beats 5 hours of shallow repetition.
3. **Visual motivation** — Seeing heatmaps fill and streaks grow creates positive feedback loops.
4. **Low friction logging** — If it takes more than 2-3 minutes, I won't do it.
5. **Adaptive expectations** — What counts as "1% better" evolves as I level up.

## Technical Considerations

- **Platform**: Mobile-first (daily logging on the go), desktop dashboard for deep review
- **AI backend**: Claude API for honest assessments and adaptive commentary
- **Data persistence**: Full history — the long-term trend data is the product's core value

## Integrations (Nice to Have)

- [ ] Notion — pull from existing training logs and study notes
- [ ] Calendar — correlate study blocks with logged entries
- [ ] Reading apps — auto-log completed books/papers

## Success Metrics

The app is working if:
- [ ] I log daily for 30+ consecutive days
- [ ] I can visually see which pillars are lagging and course-correct within a week
- [ ] The AI catches me coasting before I catch myself
- [ ] After 6 months, depth progression curves show clear upward trajectories across all 5 pillars
- [ ] I trust the app's assessments enough to feel uncomfortable when it gives me a hard truth

## Out of Scope (Phase 1)

- Social/sharing features
- Multiple user accounts
- Gamification beyond streaks/heatmaps
- Integration with external fitness/health trackers
- Feature 4 (Skill Trees) — deferred to V2

## Open Questions

- None currently — spec is defined for Phase 1

---

# Phase 2: Fitness Module — AI Strength & Conditioning Coach

## Phase 2 Vision

An AI-powered fitness tracker built for a hybrid athlete training toward elite-level strength and conditioning alongside basketball performance and cardiovascular endurance. The system acts as a world-class strength & conditioning coach — evidence-based, periodized, individualized — not a generic fitness app.

It learns from every logged session, reads biometric data from Whoop, and auto-programs progressive overload with the precision of an S&C coach managing a professional athlete.

## Training Structure (Fixed Weekly Template)

| Day | Focus | Notes |
|-----|-------|-------|
| Monday | Push | Bench press, OHP, triceps, chest accessories. Include short jog pre-lift for focus. |
| Tuesday | Pull | Deadlift variations, rows, pull-ups, biceps, rear delts. Include short jog pre-lift. |
| Wednesday | Legs | Squats, RDLs, lunges, leg press, calves. Include short jog pre-lift. |
| Thursday | Rest | Active recovery only. Mobility, stretching, light walk. |
| Friday | Cardio | Zone 2 steady-state, intervals, or sport-specific conditioning. |
| Saturday | Basketball | Pickup games / runs. Treat as high-intensity plyometric + cardio for recovery modeling. |
| Sunday | Rest | Full rest. |

## Hybrid Athlete Philosophy

- Strength is the priority on lift days, but never at the expense of basketball performance or cardiovascular capacity
- Programming should avoid excessive volume that compromises Saturday basketball
- Cardio Friday should complement, not cannibalize, Saturday game readiness
- The system understands that Saturday basketball is non-negotiable and programs around it

## Phase 2 Core Features

### Feature P2-1: Morning Briefing (Push Notification)

**Description**: Every weekday morning, receive a push notification with today's workout plan, Whoop recovery context, and a motivational quote.

**Trigger**: Weekday mornings (configurable, default 6:30 AM)

**Contents**:
- **Motivational quote** — Rotated daily. Athletes, stoics, investors, competitors. No generic inspiration-poster stuff.
- **Today's workout preview** — Full session: exercises, sets, reps, target weights, rest periods.
- **Whoop context** — Recovery score, HRV, resting HR, sleep performance. If recovery is low, session already reflects adjustment.

**Example**:
```
"The fight is won or lost far away from witnesses — behind the lines, 
in the gym, and out there on the road, long before I dance under those lights." 
— Muhammad Ali

Today: Push Day
Whoop Recovery: 78% (Green) | HRV: 68ms | Sleep: 85%

Bench Press 4×5 @ 165 lbs → OHP 3×8 @ 95 lbs → Incline DB Press 3×10 → Tricep work

Tap to view full session →
```

**Acceptance Criteria**:
- [ ] AC-P2-1.1: Push notification sent at configured time on weekdays
- [ ] AC-P2-1.2: Notification includes motivational quote (rotated daily)
- [ ] AC-P2-1.3: Notification includes full workout preview with exercises, sets, reps, weights
- [ ] AC-P2-1.4: Notification includes Whoop recovery score, HRV, resting HR, sleep %
- [ ] AC-P2-1.5: If recovery is low, workout is already adjusted in the preview
- [ ] AC-P2-1.6: Tapping notification opens full session view in app

### Feature P2-2: AI Workout Generator ("The Coach")

**Description**: An elite-level S&C coach persona. Evidence-based, periodized, thinks in mesocycles. Speaks directly and with authority.

**Programming Principles**:
- **Progressive overload** — Every session attempts to progress via weight, reps, sets, or tempo. Micro-loading (2.5 lb increments) preferred.
- **Periodization** — 4–6 week mesocycles: Accumulation (volume) → Intensification (load) → Deload. AI tracks position in cycle.
- **RPE/RIR awareness** — Target RPE 7–8 on working sets (2–3 reps in reserve). Build strength, don't test it.
- **Fatigue management** — Model cumulative fatigue across the week. Account for cross-day interactions.
- **Exercise selection** — Prioritize compounds. Accessories address weak points identified from logged data.
- **Warm-up programming** — Auto-generate warm-up sets based on working weight.
- **Jog integration** — Every lift day includes 10–15 min easy jog pre-lift. Non-negotiable.

**Whoop-Driven Adjustments**:

| Recovery Score | Adjustment |
|----------------|------------|
| 85–100% (Green) | Full send. Progress as programmed. Consider adding top set or extra accessory. |
| 67–84% (Yellow) | Standard session. No additions. Hit the plan, don't exceed it. |
| 34–66% (Yellow-Low) | Reduce volume 20–30%. Drop 1 accessory. Reduce top-set weight 5–10%. |
| 0–33% (Red) | Active recovery only. Mobility, light movement. Do not lift. Coach explains why. |

**Acceptance Criteria**:
- [ ] AC-P2-2.1: AI generates complete workout plan for each training day
- [ ] AC-P2-2.2: Plans include warm-up sets calculated from working weight
- [ ] AC-P2-2.3: Plans include pre-lift jog on all lift days
- [ ] AC-P2-2.4: Workout adjusts based on Whoop recovery score thresholds
- [ ] AC-P2-2.5: AI tracks mesocycle phase and programs accordingly
- [ ] AC-P2-2.6: AI targets RPE 7-8 on working sets
- [ ] AC-P2-2.7: AI accounts for cross-day fatigue (Sat basketball → Mon push, Tue pull → Wed legs)
- [ ] AC-P2-2.8: All LLM calls route through Clawdbot at localhost:18789

### Feature P2-3: Live Workout Chat Interface

**Description**: During a workout, chat with the app to log sets in real-time, ask for adjustments, and get coaching feedback.

**Interaction Model**:
- Type or voice-input completed sets as I do them
- AI confirms, tracks, adjusts remaining work if needed
- Conversational, fast, low-friction

**Example Exchange**:
```
Me: Bench — 165 × 5, 165 × 5, 165 × 4, 165 × 3

Coach: Solid. First two sets hit target. Sets 3 and 4 dropped off — that's 
normal fatigue accumulation at this load. You got 17 total reps across 4 sets 
at 165. Last week you hit 18 at 160. Strength is tracking up even though the 
last set fell short. Next week we'll run 165 again and aim for 5/5/5/4. No rush.

Me: Felt heavy today. Shoulders were tight from yesterday's pull session.

Coach: Noted. I'll flag shoulder fatigue carryover from Tuesday pull sessions. 
If this pattern continues, we may reduce rear delt volume on Tuesdays or shift 
face pulls to Wednesday. For now, let's move to OHP — dropping from 95 to 90 
today given the shoulder tightness. 3×8 @ 90.
```

**Acceptance Criteria**:
- [ ] AC-P2-3.1: Accepts natural language input ("bench 165 for 5" or "got 5 reps at 165 on bench")
- [ ] AC-P2-3.2: Parses and logs structured data (exercise, weight, reps, set number) from input
- [ ] AC-P2-3.3: Provides real-time coaching commentary, not just data acknowledgment
- [ ] AC-P2-3.4: Adjusts remaining workout on the fly based on early set performance
- [ ] AC-P2-3.5: Flags form concerns if discomfort or unusual difficulty reported
- [ ] AC-P2-3.6: Voice input supported for hands-free logging
- [ ] AC-P2-3.7: All parsing and coaching via Clawdbot LLM routing

### Feature P2-4: Progressive Overload Engine

**Description**: Auto-calculates next session's weights and reps based on logged history. No guesswork. This is the killer feature.

**Algorithm Principles**:
- **Double progression** — For rep target (e.g., 4×5), once all sets hit target, increase weight by minimum increment next session
- **Volume landmarks** — Track total volume per muscle group per week. Stay within MEV → MRV range.
- **Stall detection** — If no progress for 2–3 consecutive sessions at same weight, trigger decision:
  - Option A: Microload (2.5 lb jump instead of 5)
  - Option B: Rep scheme change (4×5 → 5×3 at higher weight, or 3×8 for hypertrophy block)
  - Option C: Deload (reduce load 10–15% for one week, rebuild)
  - AI recommends based on context
- **Deload programming** — Automatic every 4th or 5th week, or triggered by: consecutive stalls, declining Whoop trend, RPE creep
- **Cross-day recovery modeling** — Learn patterns from data (Saturday basketball → Monday impact)

**Per-Exercise Data Tracked**:
- Weight, reps, sets, RPE (if provided)
- Estimated 1RM (Epley/Brzycki formula)
- Volume load (weight × reps × sets)
- Trend: progressing / maintaining / stalling / regressing

**Acceptance Criteria**:
- [ ] AC-P2-4.1: System calculates next session's target weights based on previous performance
- [ ] AC-P2-4.2: Uses double progression model (hit all reps → increase weight)
- [ ] AC-P2-4.3: Tracks volume per muscle group per week
- [ ] AC-P2-4.4: Detects stalls after 2-3 sessions at same weight
- [ ] AC-P2-4.5: Recommends stall resolution (microload, rep scheme change, or deload)
- [ ] AC-P2-4.6: Auto-programs deloads every 4-5 weeks or when triggered
- [ ] AC-P2-4.7: Calculates estimated 1RM for all tracked lifts
- [ ] AC-P2-4.8: Shows progression status per exercise (progressing/maintaining/stalled/regressing)

### Feature P2-5: Whoop Integration (Read-Only)

**Description**: Pull Whoop biometric data to inform programming decisions.

**Data Pulled**:
- Daily recovery score (0–100%)
- HRV (heart rate variability, ms)
- Resting heart rate (bpm)
- Sleep performance score (%)
- Strain score (previous day)

**What We Do NOT Do**:
- No sleep stage processing
- No Whoop settings modification
- No write operations to Whoop

**How Whoop Data Is Used**:
- Morning briefing context (recovery → workout intensity)
- Longitudinal trending (declining recovery over 2+ weeks → suggest recovery week)
- Post-basketball recovery tracking (Saturday strain → Sunday rest → Monday readiness)
- Sleep correlation (if sleep < 70% consistently, flag and suggest prioritizing sleep over volume)

**Acceptance Criteria**:
- [ ] AC-P2-5.1: OAuth2 connection to Whoop API established
- [ ] AC-P2-5.2: Daily morning pull of recovery, HRV, RHR, sleep score
- [ ] AC-P2-5.3: Strain score from previous day pulled
- [ ] AC-P2-5.4: Data cached locally for trend analysis
- [ ] AC-P2-5.5: Fallback if Whoop unavailable: generate workout at standard intensity with note
- [ ] AC-P2-5.6: 2+ week declining recovery trend triggers recovery week suggestion

### Feature P2-6: End-of-Day Check-In (Push Notification)

**Description**: Evening prompt for the full Mastery Tracker daily entry. Fitness data feeds automatically.

**Trigger**: Every evening (configurable, default 9:00 PM)

**Contents**:
- Workout summary (if session logged today)
- Prompt: "What else did you work on today? Did you get 1% better?"
- Quick-entry link to daily check-in

**Acceptance Criteria**:
- [ ] AC-P2-6.1: Push notification sent at configured evening time
- [ ] AC-P2-6.2: Shows workout summary if session was logged
- [ ] AC-P2-6.3: Links to full daily check-in flow
- [ ] AC-P2-6.4: Fitness data auto-populates into 1% tracker

### Feature P2-7: Workout History & Progress Charts

**Per-Exercise Charts**:
- Estimated 1RM trend line over time
- Volume load per session over time
- Best set (weight × reps) per session
- Rep PR tracking (heaviest single, set of 3, set of 5, etc.)

**Per-Muscle-Group Views**:
- Push volume over time (chest + shoulders + triceps)
- Pull volume over time
- Leg volume over time
- Cardio load over time (distance, duration, HR zones)

**Comparison Views**:
- This week vs. last week vs. 4 weeks ago
- This mesocycle vs. last mesocycle
- Current estimated 1RMs vs. 30/60/90 days ago

**Acceptance Criteria**:
- [ ] AC-P2-7.1: Per-exercise estimated 1RM chart
- [ ] AC-P2-7.2: Per-exercise volume load chart
- [ ] AC-P2-7.3: Per-exercise best set tracking
- [ ] AC-P2-7.4: Rep PR tracking (1RM, 3RM, 5RM)
- [ ] AC-P2-7.5: Aggregate volume by muscle group (push/pull/legs)
- [ ] AC-P2-7.6: Week-over-week comparison view
- [ ] AC-P2-7.7: Mesocycle comparison view
- [ ] AC-P2-7.8: 1RM progress vs. 30/60/90 days ago

## Phase 2 Data Model

### WorkoutSession
- date
- day_type (push / pull / legs / cardio / basketball / rest)
- whoop_recovery_score
- whoop_hrv
- whoop_resting_hr
- whoop_sleep_score
- ai_generated_plan (structured data)
- coach_notes (AI commentary)
- overall_rpe (session-level)

### ExerciseLog
- session_id (FK → WorkoutSession)
- exercise_name (normalized)
- set_number
- weight
- reps
- rpe (optional, per-set)
- notes ("felt heavy," "grip slipping")

### ExerciseProfile
- exercise_name
- current_working_weight
- current_rep_target
- estimated_1rm
- progression_status (progressing / maintaining / stalled / deloading)
- last_progression_date
- stall_count
- mesocycle_phase (accumulation / intensification / deload)

### ProgressSnapshot (daily rollup)
- date
- pillar_scores (maps to Mastery Tracker)
- total_volume_by_muscle_group
- estimated_1rms (all tracked lifts)
- whoop_metrics

## Phase 2 Notification System

| Notification | Timing | Content |
|--------------|--------|---------|
| Morning Briefing | Weekday AM (configurable) | Quote + workout preview + Whoop data |
| End-of-Day Check-In | Every evening (configurable) | Workout summary + 1% tracker prompt |
| Deload Alert | When triggered by stall/fatigue | "Coach recommends a deload week starting Monday" |
| PR Celebration | When new rep/weight PR logged | "New bench PR: 170 × 5. That's a 10 lb jump in 6 weeks." |
| Streak Warning | If scheduled training day missed by 8 PM | "You haven't logged Push day. Rest day or missed session?" |

## Phase 2 Coach Persona (System Prompt)

```
You are an elite strength and conditioning coach working with a hybrid athlete. 
Your client trains Push/Pull/Legs on Mon/Tue/Wed, rests Thursday, does cardio 
Friday, plays competitive basketball Saturday, and rests Sunday. Every lift day 
begins with a short jog for mental focus.

Your programming philosophy:
- Progressive overload is the foundation. Every session should attempt to progress 
  from the last — via weight, reps, or quality.
- Periodize in 4-6 week mesocycles. Manage fatigue, don't just accumulate it.
- Target RPE 7-8 on working sets. Build strength, don't test it every session.
- Account for cross-day recovery: Saturday basketball impacts Monday readiness. 
  Tuesday pull affects Wednesday legs (grip, posterior chain).
- Prioritize compound lifts. Use accessories to address specific weaknesses 
  identified from training data.
- When recovery is low (Whoop red/yellow-low), reduce volume or prescribe active 
  recovery. Never push through bad recovery for the sake of the schedule.

Your communication style:
- Direct, authoritative, no fluff. Speak like a coach, not a chatbot.
- Explain the WHY behind every programming decision briefly.
- Be honest when progress stalls — diagnose the issue, don't just encourage.
- Celebrate real PRs and milestones. Ignore fake effort.
- When the athlete reports discomfort or tightness, take it seriously and adjust.

Current athlete data will be provided with each request including: workout history, 
Whoop recovery metrics, current mesocycle phase, and exercise profiles with 
progression status.
```

## Phase 2 Design Principles

1. **Coach-first, tracker-second** — AI coaching is the product. Logging and charts support it.
2. **Friction-free logging** — Natural language input. "Bench 165 for 5" just works. No dropdowns mid-set.
3. **Earned intensity** — Never program beyond what data supports. Ego lifting gets flagged.
4. **Recovery is training** — Rest days and deloads programmed with same intentionality as heavy days. No guilt for resting when recovery demands it.
5. **Long-term compounding** — Value increases with every logged session. 6 months of data >> day 1.

## Phase 2 Success Metrics

- [ ] Log every training session for 30+ consecutive days
- [ ] Progressive overload visible in charts within 8 weeks
- [ ] AI catches fatigue patterns I wouldn't notice ("Tuesday pull RPE creeping up for 3 weeks")
- [ ] Whoop integration meaningfully adjusts programming on low-recovery days
- [ ] Trust the coach's judgment enough to follow a deload recommendation when I feel like training hard

## Phase 2 Out of Scope

- Social features (sharing workouts)
- Video form analysis
- Apple Watch companion app
- Nutrition tracking
- Body composition tracking

---

# Phase 3: GPS Run Tracking — Strava + Runna Clone

> **Note**: Requires thorough research on Strava and Runna before implementation. 
> Target: feature parity for personal use, not a stripped-down version.
> Running progress feeds into the 1% tracker (Pillar 6: Physical Fitness implied).

## Phase 3 One-Liner

Live GPS run tracking with AI coaching that adapts progressive running plans based on my actual performance and recovery.

## Phase 3 Core Features

### Feature P3-1: Live GPS Run Tracking

**Description**: Real-time GPS tracking during runs with live pace, distance, elevation display. Must work with screen locked (background location).

**Acceptance Criteria**:
- [ ] AC-P3-1.1: Live GPS tracking displays current pace (min/mile)
- [ ] AC-P3-1.2: Live GPS tracking displays total distance (miles)
- [ ] AC-P3-1.3: Live GPS tracking displays elapsed time
- [ ] AC-P3-1.4: Live GPS tracking displays current elevation and elevation gain
- [ ] AC-P3-1.5: Map shows real-time position on route
- [ ] AC-P3-1.6: Tracking continues with screen locked (background location)
- [ ] AC-P3-1.7: Audio cues for mile splits (pace announcement)
- [ ] AC-P3-1.8: GPS accuracy within 10 meters under normal conditions
- [ ] AC-P3-1.9: Battery-efficient background tracking (< 10% battery/hour)

### Feature P3-2: Route Recording & History

**Description**: All runs saved with full GPS trace, splits, and metadata. Queryable history.

**Acceptance Criteria**:
- [ ] AC-P3-2.1: Route recorded as GPS polyline with timestamps
- [ ] AC-P3-2.2: Per-mile splits stored with pace, elevation change, heart rate (if available)
- [ ] AC-P3-2.3: Run metadata: date, time, weather conditions, perceived effort (RPE)
- [ ] AC-P3-2.4: Run history browsable by date, distance, route
- [ ] AC-P3-2.5: Individual run detail view with map, splits table, charts
- [ ] AC-P3-2.6: Export to GPX format
- [ ] AC-P3-2.7: Sync runs to backend database via Cloudflare Tunnel

### Feature P3-3: AI Run Coach — Progressive Training Plans

**Description**: AI generates progressive running plans, suggests routes, adapts if I miss runs. Pulls Whoop recovery data to adjust intensity.

**Research Required**: Study Runna's training plan methodology before designing.

**Acceptance Criteria**:
- [ ] AC-P3-3.1: AI generates weekly running plan based on goals (e.g., 10K, half marathon, base building)
- [ ] AC-P3-3.2: Plan includes variety: easy runs, tempo, intervals, long runs, recovery
- [ ] AC-P3-3.3: Plan adapts if I miss a run (reschedules, adjusts load)
- [ ] AC-P3-3.4: Plan adapts based on Whoop recovery score (easy day if recovery < 50%)
- [ ] AC-P3-3.5: AI suggests routes based on target distance and terrain preferences
- [ ] AC-P3-3.6: Post-run AI feedback: what went well, what to improve
- [ ] AC-P3-3.7: Progressive overload: mileage increases ~10% per week (standard rule)
- [ ] AC-P3-3.8: Deload weeks automatically scheduled every 4th week
- [ ] AC-P3-3.9: LLM calls via Clawdbot at localhost:18789 (never direct Claude API)

### Feature P3-4: Running Stats & Analytics

**Description**: Comprehensive running analytics matching Strava feature parity.

**Research Required**: Study Strava's analytics features before designing.

**Acceptance Criteria**:
- [ ] AC-P3-4.1: Weekly/monthly mileage totals and trends
- [ ] AC-P3-4.2: Pace trends over time (are runs getting faster?)
- [ ] AC-P3-4.3: Elevation gain totals
- [ ] AC-P3-4.4: Personal records (PRs) tracked: fastest mile, 5K, 10K, etc.
- [ ] AC-P3-4.5: Training load visualization (similar to Strava Fitness/Freshness)
- [ ] AC-P3-4.6: Heart rate zone distribution (if HR data available)
- [ ] AC-P3-4.7: Segment tracking: compare same route over time
- [ ] AC-P3-4.8: Running feeds into 1% tracker as physical fitness pillar

### Feature P3-5: Whoop Integration for Running

**Description**: Pull Whoop data to inform running recommendations.

**Acceptance Criteria**:
- [ ] AC-P3-5.1: Display recovery score before suggested run
- [ ] AC-P3-5.2: Adjust run intensity recommendation based on recovery
- [ ] AC-P3-5.3: Show strain impact post-run (if Whoop API provides)
- [ ] AC-P3-5.4: Warn if attempting hard run on low recovery day
- [ ] AC-P3-5.5: Whoop API calls are read-only

## Phase 3 Non-Functional Requirements

- [ ] Background GPS tracking works reliably with screen locked
- [ ] App does not drain battery excessively (< 10% per hour of active tracking)
- [ ] GPS data syncs to backend when connectivity available
- [ ] Offline-first: runs can complete without network, sync later
- [ ] Push notifications for scheduled runs

## Phase 3 Research Tasks (Pre-Implementation)

Before designing detailed tasks:
1. **Strava deep-dive**: Document all features, UX patterns, data models
2. **Runna deep-dive**: Document training plan logic, adaptation rules, coaching UX
3. **Expo location capabilities**: Confirm background GPS, battery impact, accuracy
4. **Whoop API capabilities**: What run-related data is available?

## Phase 3 Out of Scope

- Social features (sharing, followers, kudos)
- Cycling, swimming, or other activities
- Apple Watch companion app (Phase 4?)
- Route planning/creation (use existing routes or freeform)

---

# Phase 4: UI Revamp + Runna-Quality Running Experience

> **Builds on Phase 3's foundation** (GPS tracking, run models, basic run screen).
> Elevates the entire app UI and transforms the basic run tracker into a Runna-quality experience
> with guided runs, AI training plans, and rich post-run analytics.

## Phase 4 One-Liner

Transform the app from functional prototype into a polished, Runna-quality running experience with AI training plans, guided audio coaching, and a unified design system.

---

## Phase 4A: UI Revamp (Pre-Requisite)

### Feature P4-UI-1: 4-Tab Navigation + Unified Progress

**Description**: Merge Progress and Dashboard into a single unified view. Reduce from 5 tabs to 4: Log, Train, Run, Progress. The Train tab covers strength workouts. The Progress tab shows both mastery pillars and fitness progress grouped by muscle group.

**Acceptance Criteria**:
- [ ] AC-P4-UI-1.1: 4-tab navigation: Log, Train, Run, Progress
- [ ] AC-P4-UI-1.2: Progress tab shows mastery pillar stats (radar, heatmap, depth, compounding) at top
- [ ] AC-P4-UI-1.3: Progress tab shows strength progress grouped by muscle group (Chest, Shoulders, Back, Arms, Legs, Core)
- [ ] AC-P4-UI-1.4: Each muscle group collapsible, shows exercises with current weight, e1RM trend, progression status
- [ ] AC-P4-UI-1.5: Running stats section in Progress tab (weekly mileage, pace trends, PRs)
- [ ] AC-P4-UI-1.6: Ionicons throughout, no emoji in UI
- [ ] AC-P4-UI-1.7: Consistent design system (theme.ts: colors, typography, spacing, radius)

### Feature P4-UI-2: Design System Cleanup

**Description**: All screens use a shared theme with Apple HIG-inspired typography, consistent card styles, and proper icon usage.

**Acceptance Criteria**:
- [ ] AC-P4-UI-2.1: theme.ts defines colors, spacing, typography, radius constants
- [ ] AC-P4-UI-2.2: All screens import and use theme constants
- [ ] AC-P4-UI-2.3: Uppercase section labels (caption weight, 0.5 letter spacing)
- [ ] AC-P4-UI-2.4: Cards: #111 bg, 12px radius, 1px #1c1c1e border
- [ ] AC-P4-UI-2.5: Status indicators use colored pills/dots, not emoji
- [ ] AC-P4-UI-2.6: Web build (expo export --platform web) succeeds

---

## Phase 4B: Runna-Quality Run Experience

### Feature P4-1: Live GPS Run Tracking (Runna-Quality)

**Description**: Full-screen run tracking experience inspired by Runna. Full-bleed map with route trace, bottom sheet with swipeable metric cards, works with screen locked. Upgrades Phase 3's basic run screen.

**Technical Stack**:
- GPS: expo-location (foreground + background via expo-task-manager) — already implemented
- Maps: react-native-maps (Apple Maps on iOS) — already implemented
- Audio: expo-speech or expo-av for pace announcements — NEW
- Background: expo-task-manager for lock-screen tracking — already implemented

**Acceptance Criteria**:
- [ ] AC-P4-1.1: Full-bleed map with real-time position dot and route polyline
- [ ] AC-P4-1.2: Bottom sheet overlay with large metrics: distance (huge), pace, time, elevation
- [ ] AC-P4-1.3: Swipeable metric cards (current split, avg pace, heart rate if available)
- [ ] AC-P4-1.4: Start → 3-2-1 countdown → tracking begins
- [ ] AC-P4-1.5: Pause/resume with lap marker
- [ ] AC-P4-1.6: Stop → "How did it feel?" RPE prompt → save
- [ ] AC-P4-1.7: Tracking continues with screen locked (background location)
- [ ] AC-P4-1.8: Audio cues: mile split announcement (pace + total time), halfway alert, pace drift warnings
- [ ] AC-P4-1.9: GPS accuracy within 10 meters, battery < 10%/hour
- [ ] AC-P4-1.10: Route colored by pace (green = target, yellow = slow, red = too slow)
- [ ] AC-P4-1.11: Haptic feedback on mile completions

### Feature P4-2: Guided Runs & Interval Coaching

**Description**: Runna's killer feature — structured run guidance with real-time audio coaching. Intervals, tempo segments, warm-up/cool-down phases all coached live.

**Run Types**:
| Type | Description | Coaching Style |
|------|-------------|---------------|
| Easy | Conversational pace, recovery | "Keep it easy, you should be able to talk" |
| Tempo | Sustained effort, comfortably hard | "Hold this pace — 7:30/mi target" |
| Intervals | Repeats with recovery | "400m hard in 1:45... 200m jog recovery... 3 of 6 done" |
| Long Run | Endurance building | "Settle in. First 3 miles easy, then pick it up" |
| Recovery | Very easy, active recovery | "Slow it down. This is about blood flow, not fitness" |
| Fartlek | Unstructured speed play | "Next 90 seconds, pick it up. Then recover until you're ready" |
| Progression | Start easy, finish fast | "Each mile should be 15-20 seconds faster than the last" |

**Acceptance Criteria**:
- [ ] AC-P4-2.1: Pre-run screen shows run structure (warm-up → work → cool-down segments)
- [ ] AC-P4-2.2: Live coaching audio cues at segment transitions ("Speed up — tempo pace now")
- [ ] AC-P4-2.3: Interval timer with work/rest countdown visible on screen
- [ ] AC-P4-2.4: Pace zone alerts: audio warning when drifting outside target zone
- [ ] AC-P4-2.5: Warm-up and cool-down segments auto-included in structured runs
- [ ] AC-P4-2.6: Visual segment timeline showing current position in run structure
- [ ] AC-P4-2.7: Audio cues work with screen locked and music playing (mix with audio)
- [ ] AC-P4-2.8: "Free run" mode available (no structure, just track)

### Feature P4-3: AI Training Plan Generator

**Description**: AI generates multi-week progressive running plans adapted from Runna's methodology. Plans adjust based on completed runs, missed sessions, and Whoop recovery.

**Plan Structure (Runna-style)**:
- Plans are goal-based: Base Building, 5K, 10K, Half Marathon, Marathon, General Fitness
- Each week has 3-5 runs with specific types (easy, tempo, intervals, long)
- Weekly mileage increases ~10% per week for 3 weeks, then deload week 4
- Plans are 4-16 weeks depending on goal
- Running fits around strength schedule: primarily Tue evening, Fri, Sun long run

**Acceptance Criteria**:
- [ ] AC-P4-3.1: Plan setup flow: select goal, current fitness level, available days, target race date (optional)
- [ ] AC-P4-3.2: AI generates full multi-week plan with specific run types and target paces per session
- [ ] AC-P4-3.3: Plan respects existing weekly schedule (Mon/Tue/Wed = strength, Sat = basketball)
- [ ] AC-P4-3.4: Adaptive replanning when a run is missed (redistributes load, doesn't just skip)
- [ ] AC-P4-3.5: Recovery-aware: Whoop recovery < 50% → easy run or rest substitution
- [ ] AC-P4-3.6: Progressive overload: weekly mileage ramp with deload every 4th week
- [ ] AC-P4-3.7: Plan view: calendar showing upcoming runs with type, distance, target pace
- [ ] AC-P4-3.8: "Today's Run" card on Run tab showing what's planned with tap-to-start
- [ ] AC-P4-3.9: Post-run AI feedback: pace analysis, effort assessment, next-run preview
- [ ] AC-P4-3.10: LLM calls via Clawdbot at localhost:18789

### Feature P4-4: Post-Run Summary & Detail

**Description**: Rich post-run screen matching Strava quality. Route visualization, pace-colored segments, splits analysis, effort metrics.

**Acceptance Criteria**:
- [ ] AC-P4-4.1: Post-run summary screen immediately after stopping
- [ ] AC-P4-4.2: Route on map with pace-colored polyline (green/yellow/red gradient)
- [ ] AC-P4-4.3: Splits table with per-mile pace, elevation change, avg HR
- [ ] AC-P4-4.4: Pace chart (line graph of pace per minute/quarter-mile)
- [ ] AC-P4-4.5: Elevation profile chart
- [ ] AC-P4-4.6: RPE selection ("How did it feel?" 1-10 scale)
- [ ] AC-P4-4.7: AI coach post-run feedback (what went well, what to improve)
- [ ] AC-P4-4.8: PR detection and celebration (new fastest mile, 5K, etc.)
- [ ] AC-P4-4.9: Share card generation (image with route + stats for screenshots)

### Feature P4-5: Running History & Analytics

**Description**: Comprehensive running analytics. Weekly/monthly views, pace trends, PR board, training load. Extends Phase 3's basic history.

**Acceptance Criteria**:
- [ ] AC-P4-5.1: Run history list with route thumbnail, distance, pace, date, run type badge
- [ ] AC-P4-5.2: Weekly mileage bar chart (current week highlighted)
- [ ] AC-P4-5.3: Monthly mileage trend line
- [ ] AC-P4-5.4: Average pace trend over time (getting faster?)
- [ ] AC-P4-5.5: PR board: fastest mile, 5K, 10K, half marathon, marathon
- [ ] AC-P4-5.6: Training load chart (Strava-style fitness/fatigue/form)
- [ ] AC-P4-5.7: Elevation gain totals (weekly/monthly/all-time)
- [ ] AC-P4-5.8: Segment comparison: same route over time (faster or slower?)
- [ ] AC-P4-5.9: Heart rate zone distribution chart (if HR data from Whoop)
- [ ] AC-P4-5.10: Running data feeds into unified Progress tab

### Feature P4-6: Whoop Integration for Running

**Description**: Whoop recovery and strain data integrated into run coaching decisions. Extends Phase 2's Whoop service.

**Acceptance Criteria**:
- [ ] AC-P4-6.1: Recovery score displayed on "Today's Run" card
- [ ] AC-P4-6.2: Low recovery (< 50%) triggers plan adjustment (easy run or rest)
- [ ] AC-P4-6.3: Declining recovery trend (3+ days) triggers coach alert
- [ ] AC-P4-6.4: Post-run strain data shown in run summary (if API provides)
- [ ] AC-P4-6.5: Sleep quality factors into next-day run intensity
- [ ] AC-P4-6.6: Whoop API calls are read-only, cached with existing whoop service

---

## Phase 4 Run Coach Persona (System Prompt)

```
You are an elite running coach building progressive training plans for a hybrid 
athlete. Your client does strength training (Push/Pull/Legs Mon-Wed), rests 
Thursday, and plays competitive basketball on Saturday. Running fits around this 
schedule — primarily Tuesday evening, Friday, and Sunday for long runs.

Your coaching philosophy:
- 80/20 rule: 80% of miles at easy/conversational pace, 20% at tempo or faster.
- Build aerobic base before adding speed work. First 4 weeks are base building 
  unless client already has a mileage base.
- Weekly mileage increases max 10% per week. Every 4th week is a deload (reduce 
  volume 30-40%).
- Recovery is non-negotiable. If Whoop shows red recovery, prescribe rest or very 
  easy running only.
- Basketball on Saturday counts as cross-training intensity. Sunday long runs 
  should account for Saturday's load.
- Progressive overload for running: first increase distance, then add speed work, 
  then increase speed work intensity. Never both at once.

Your communication style:
- Direct, encouraging but honest. Like a running club coach who knows your name.
- Give specific pace targets, not vague "run easy." Easy = specific min/mile range.
- Explain why each run type matters for the goal.
- Celebrate PRs and consistency. Call out when effort doesn't match the plan.
- Post-run: analyze splits, note positive trends, flag areas for improvement.

Run type definitions:
- Easy: 60-70% max HR, conversational, typically 9:00-10:30/mi for intermediate
- Tempo: 80-85% max HR, "comfortably hard," typically 7:30-8:30/mi  
- Intervals: 90-95% max HR with recovery, specific pace targets per rep
- Long Run: Easy pace, focus on time on feet, last miles can pick up
- Recovery: Slower than easy, genuinely slow, 10:00-11:00+/mi
```

## Phase 4 Data Model Additions

### TrainingPlan
- goal_type (base_building / 5k / 10k / half_marathon / marathon / general)
- start_date, end_date
- current_week
- total_weeks
- weekly_plan (JSON: array of weeks, each with array of planned runs)
- status (active / completed / abandoned)
- fitness_level (beginner / intermediate / advanced)

### PlannedRun
- plan_id (FK → TrainingPlan)
- week_number, day_of_week
- run_type (easy / tempo / intervals / long / recovery / fartlek / progression)
- target_distance_miles
- target_pace_seconds (per mile)
- structure (JSON: segments with type, duration/distance, target pace)
- completed_run_id (FK → RunSession, nullable)
- status (upcoming / completed / missed / swapped)

### RunSegmentLog
- run_id (FK → RunSession)
- segment_index
- segment_type (warmup / work / recovery / cooldown)
- target_pace_seconds, actual_pace_seconds
- target_duration_seconds, actual_duration_seconds
- distance_miles

### Updates to RunSession (from Phase 3)
- Add: planned_run_id (FK → PlannedRun, nullable)
- Add: ai_feedback (text — post-run coach analysis)
- Add: feel_rating (1-10 RPE selected post-run)
- Add: is_pr (boolean)
- Add: pr_type (text — "fastest_mile", "5k", etc.)

## Phase 4 Non-Functional Requirements

- [ ] Background GPS tracking works reliably with screen locked
- [ ] Battery < 10% per hour of active tracking
- [ ] Audio cues mix with music playback (don't interrupt)
- [ ] Push notifications for scheduled runs (morning of)
- [ ] Web build succeeds (maps/GPS gracefully degrade)
- [ ] Offline-first: runs complete without network, sync later

## Phase 4 Design Reference

**Runna UX patterns to replicate**:
- "Today's Run" card: run type, distance, estimated time, tap to start
- Pre-run structure view: visual timeline of warmup → segments → cooldown
- During run: large distance number, secondary metrics below, segment progress bar
- Post-run: celebration screen → detailed summary → coach feedback
- Plan view: week calendar with run dots, this week highlighted
- Run type colors: Easy = blue, Tempo = orange, Intervals = red, Long = green, Recovery = gray

**Strava UX patterns to replicate**:
- Route map with pace-colored polyline
- Splits table with alternating row colors
- Elevation profile below map
- PR badges on run cards
- Weekly mileage chart in analytics

### Feature P4-7: Route Creation & Planning

**Description**: Create, save, and reuse running routes. Draw routes on a map, get distance estimates, and select saved routes when starting a run. Compare performance on the same route over time.

**Acceptance Criteria**:
- [ ] AC-P4-7.1: Draw a route on the map by tapping waypoints (start → waypoints → finish)
- [ ] AC-P4-7.2: Auto-snap to roads/paths using a routing API (OpenRouteService or Mapbox)
- [ ] AC-P4-7.3: Real-time distance and estimated elevation shown as route is drawn
- [ ] AC-P4-7.4: Save route with name and tags (flat, hilly, trail, track, neighborhood)
- [ ] AC-P4-7.5: Route library: browse saved routes, see distance, elevation, last run date
- [ ] AC-P4-7.6: Select a saved route before starting a run (shows route on map during tracking)
- [ ] AC-P4-7.7: Auto-detect repeated routes from GPS history (fuzzy match within ~50m)
- [ ] AC-P4-7.8: Route comparison: overlay multiple runs on the same route, compare splits
- [ ] AC-P4-7.9: "Out and back" and "Loop" route generation from a target distance
- [ ] AC-P4-7.10: AI coach can suggest routes based on planned run type and distance

## Phase 4 Out of Scope

- Social features (sharing, followers, kudos)
- Cycling, swimming, or other activities
- Apple Watch companion (Phase 5?)
- Music integration (plays alongside, no in-app controls)
- Live tracking sharing (share location with others)
