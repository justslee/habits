# DECISIONS.md — Architectural Decision Log

> **Purpose**: Record significant technical and product decisions so agents don't relitigate them.
> Format: Decision, rationale, date. Append-only.

---

## 2026-02-25: Initial Architecture Decisions

### D-001: Five Pillars as Core Data Model
**Decision**: The five pillars (Quant Finance, Macro Investing, ML Math, AI Engineering, Public Speaking) are hardcoded as the identity framework.

**Rationale**: This is a personal tool for Justin. The pillars represent his target end-state identity and won't change. Hardcoding simplifies the data model and UI.

**Status**: Accepted

---

### D-002: Claude API for Evaluation Engine
**Decision**: Use Claude API (Anthropic) for the AI evaluation engine, not OpenAI.

**Rationale**: 
- Justin already uses Claude extensively (Opus for reasoning tasks)
- Better at nuanced, honest feedback vs. sycophantic responses
- Existing integration patterns in other projects (scorecard, etc.)

**Status**: Accepted

---

### D-003: Brutal Honesty as Core Product Value
**Decision**: The AI must be brutally honest. No participation trophies. This is non-negotiable.

**Rationale**: The app's entire value proposition is telling the truth. If the AI sugarcoats, the product fails. Prompt engineering must enforce this.

**Status**: Accepted

---

### D-004: Mobile-First, Desktop Dashboard
**Decision**: Daily logging optimized for mobile. Deep analytics/dashboard optimized for desktop.

**Rationale**: 
- Logging happens on-the-go throughout the day
- Deep review/reflection happens at a desk
- Both experiences must be excellent, but different priorities

**Status**: Accepted

---

### D-005: Append-Only Entry History
**Decision**: All entries are append-only. No deletions. Full history preserved forever.

**Rationale**: Long-term trend data is the core product value. The compounding visualization requires complete history. Users should not be able to "hide" bad days.

**Status**: Accepted

---

### D-006: Skill Trees Deferred to V2
**Decision**: Feature 4 (Pillar Skill Trees with sub-topics) is out of scope for Phase 1.

**Rationale**: Core loop is: log → evaluate → visualize → review. Skill trees add complexity without improving the core loop. Ship Phase 1 first.

**Status**: Accepted

---

### D-007: Stack Confirmation
**Decision**: Confirm stack from CONTEXT.md:
- Backend: Python 3.12+ / FastAPI / PostgreSQL / SQLAlchemy 2.0
- Frontend: React + Vite + pnpm
- Deploy: Vercel (frontend) + Cloudflare Tunnel (backend)

**Rationale**: Aligns with Justin's existing quant stack. Fast iteration. Free/cheap hosting.

**Status**: Accepted

---

### D-008: Adaptive Expectations via Level Tracking
**Decision**: Track "current level" per pillar based on rolling depth scores. Use this to calibrate expectations.

**Rationale**: What counts as "1% better" must evolve. Beginner gains are easy; elite gains require proportionally more. The AI needs context on where the user currently is.

**Implementation**: Store rolling average depth score per pillar. Include in evaluation prompt context.

**Status**: Accepted
