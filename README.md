# Habits

Personal mastery / training tracker — daily reflection + AI evaluation, strength &
running coaching, speaking practice, and a North Star progress view.

## Stack

| Piece | Tech |
| --- | --- |
| Backend | FastAPI (Python 3.12), SQLAlchemy, Alembic |
| Database | SQLite on the always-on Mac (nightly backups to iCloud Drive) |
| Mobile | React Native / Expo (SDK 54), TypeScript |
| AI | OpenAI Responses API — `gpt-5.6-sol` (reasoning), `gpt-5.5` (fast tier) |
| Speech-to-text | Deepgram `nova-3` |
| Hosting | Always-on MacBook (launchd) behind Tailscale at `justins-macbook-pro-2.tail2c4851.ts.net` |

## Layout

```
backend/     FastAPI app, Alembic migrations, deploy + ops scripts
mobile/      Expo app (EAS build → TestFlight)
docs/        Project documentation (see below)
```

## Docs

- [SPEC.md](docs/SPEC.md) — product spec (source of truth)
- [CONTEXT.md](docs/CONTEXT.md) — tech stack & conventions
- [DECISIONS.md](docs/DECISIONS.md) — architecture decision log
- [STATUS.md](docs/STATUS.md) — current project status
- [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) — mobile design system
- [RUNBOOK.md](docs/RUNBOOK.md) — how to run & deploy

## Quick start

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in OPENAI_API_KEY, API_KEY, SECRET_KEY, …
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Mobile
cd mobile
npm install
npx expo start
```

## Deploy

The backend self-deploys on the Mac: `com.habits.deploy` polls `origin/main` every 5 minutes
and pulls, migrates, restarts and health-checks (rolling back on failure). See
[docs/RUNBOOK.md](docs/RUNBOOK.md) and `backend/ops/mac/`.
Mobile ships via `eas build --platform ios --profile production --auto-submit`.
