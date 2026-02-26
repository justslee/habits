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

## Backlog

### TASK-001: Project scaffolding
- **Status**: [ ] todo
- **Depends on**: none
- **Acceptance Criteria**:
  - [ ] Backend: FastAPI app runs on port 8000, `/health` returns `{"status": "ok"}`
  - [ ] Frontend: Vite React app runs on port 5173, renders default page
  - [ ] `.env.example` exists with all required vars documented
  - [ ] `pnpm test` and `pytest` both pass (even if no real tests yet)
- **Verify**: `curl http://localhost:8000/health && cd frontend && pnpm build`

### TASK-002: PWA configuration
- **Status**: [ ] todo
- **Depends on**: TASK-001
- **Acceptance Criteria**:
  - [ ] `manifest.json` present with name, icons (192x192, 512x512), start_url, display: standalone
  - [ ] Service worker registered
  - [ ] Lighthouse PWA audit passes
- **Verify**: `npx lighthouse http://localhost:5173 --only-categories=pwa --output=json | jq '.categories.pwa.score'`

### TASK-003: Vercel deployment
- **Status**: [ ] todo
- **Depends on**: TASK-002
- **Acceptance Criteria**:
  - [ ] Frontend deploys to Vercel on push to `main`
  - [ ] Production URL accessible and PWA installable
  - [ ] Environment variables configured in Vercel dashboard
- **Verify**: `curl -s -o /dev/null -w "%{http_code}" https://<project>.vercel.app`

<!-- Add more tasks as you flesh out SPEC.md -->
