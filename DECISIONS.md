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

---

## 2026-02-25: Architecture Overhaul

### D-009: React Native + Expo (Not PWA)
**Decision**: Use React Native with Expo instead of React + Vite PWA.

**Rationale**:
- Need push notifications (PWA support is inconsistent)
- Need background GPS tracking (PWA cannot do this)
- Need native performance for live GPS display
- TestFlight distribution via Expo EAS Build

**Status**: Accepted — applies to all phases

---

### D-010: iPhone Only
**Decision**: No Android support. iPhone only.

**Rationale**: Single user (Justin). No need to maintain two platforms. TestFlight distribution is simple.

**Status**: Accepted

---

### D-011: SQLite (Not PostgreSQL)
**Decision**: Use SQLite for both device and backend databases.

**Rationale**: Single user, no concurrency requirements. SQLite is simpler, no server process, file-based backup. Works on both device (React Native) and backend (Python/SQLAlchemy).

**Status**: Accepted

---

### D-012: LLM Calls Through Clawdbot Only
**Decision**: All LLM calls route through Clawdbot at localhost:18789. Never call Claude API directly.

**Rationale**: 
- Clawdbot is already authenticated with Claude
- Avoids duplicate API costs
- Centralized LLM management
- Can leverage Clawdbot's context/memory if needed

**Implementation**: Backend calls `http://localhost:18789/v1/chat/completions` with OpenAI-compatible format.

**Status**: Accepted

---

### D-013: Cloudflare Tunnel for Backend Access
**Decision**: FastAPI backend runs locally on MacBook, exposed to iPhone via Cloudflare Tunnel.

**Rationale**:
- No cloud hosting costs
- Backend can access local resources (Clawdbot, SQLite files)
- HTTPS automatically provided by Cloudflare
- Simple setup, reliable

**Status**: Accepted

---

### D-014: Whoop API Read-Only
**Decision**: Whoop API is read-only. Never write/modify Whoop data.

**Rationale**: Whoop's API is primarily for reading recovery/sleep/strain data. We consume it to inform recommendations but don't attempt to push data back.

**Status**: Accepted

---

### D-015: No Secrets in Git
**Decision**: NEVER commit secrets, API keys, or tokens to Git. Use .env files only, always gitignored, with .env.example checked in.

**Rationale**: Security best practice. Even for personal projects, habits matter.

**Status**: Accepted — non-negotiable
