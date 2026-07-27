# Habits

Personal mastery / training tracker — daily reflection + AI evaluation, strength &
running coaching, speaking practice, and a North Star progress view.

## Stack

| Piece | Tech |
| --- | --- |
| Backend | FastAPI (Python 3.12), SQLAlchemy, Alembic |
| Database | Postgres in production; SQLite for local dev |
| Mobile | React Native / Expo (SDK 54), TypeScript |
| AI | OpenAI Responses API — `gpt-5.6-sol` (reasoning), `gpt-5.5` (fast tier) |
| Speech-to-text | Deepgram `nova-3` |
| Hosting | EC2 (systemd + nginx) behind an ALB at `habits.looperapp.org` |

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

Push to `main` triggers `.github/workflows/deploy.yml`, which deploys the backend
via AWS SSM (git pull → deps → `alembic upgrade head` → restart `habits-api`).
Mobile ships via `eas build --platform ios --profile production --auto-submit`.
