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
