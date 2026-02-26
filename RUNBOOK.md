# RUNBOOK.md — How to Run Everything

> **Deployer agent uses this file.** Keep commands copy-pasteable and idempotent.
> Update this whenever run steps change.

## Prerequisites

```bash
# One-time setup (user runs these manually)
brew install cloudflared node pnpm python@3.12
pip install fastapi uvicorn sqlalchemy --break-system-packages
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
```

Required vars (see `.env.example` for full list):
```
DATABASE_URL=postgresql://localhost:5432/myapp
VITE_API_URL=http://localhost:8000  # local dev
# VITE_API_URL=https://api.yourdomain.com  # production (tunnel)
```

---

## Backend (Local)

```bash
# Start
cd backend
pip install -r requirements.txt --break-system-packages
uvicorn app.main:app --reload --port 8000

# Health check
curl http://localhost:8000/health
# Expected: {"status": "ok"}
```

## Frontend (Local Dev)

```bash
# Start
cd frontend
pnpm install
pnpm dev

# Verify
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Expected: 200
```

## Frontend (Deploy to Vercel)

```bash
# First time: link project
cd frontend
pnpm i -g vercel
vercel link

# Deploy (production)
vercel --prod

# Verify
curl -s -o /dev/null -w "%{http_code}" https://<project>.vercel.app
# Expected: 200
```

> **Note**: After first manual deploy, Vercel auto-deploys on push to `main` if GitHub integration is connected.

---

## Cloudflare Tunnel (Expose Backend Securely)

```bash
# One-time setup
cloudflared tunnel login
cloudflared tunnel create my-app
cloudflared tunnel route dns my-app api.yourdomain.com

# Run tunnel (connects localhost:8000 to your domain)
cloudflared tunnel run --url http://localhost:8000 my-app

# Quick tunnel (no domain needed, gives you a random URL)
cloudflared tunnel --url http://localhost:8000

# Verify
curl https://api.yourdomain.com/health
# Expected: {"status": "ok"}
```

---

## Run Everything (Dev Mode)

Open 3 terminals:

```bash
# Terminal 1: Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend && pnpm dev

# Terminal 3: Tunnel (optional, for mobile access)
cloudflared tunnel --url http://localhost:8000
```

---

## Tests

```bash
# Backend tests
cd backend && pytest -v

# Frontend tests
cd frontend && pnpm test

# All tests (from repo root)
cd backend && pytest -v && cd ../frontend && pnpm test
```

---

## Smoke Tests (Deployer runs these)

```bash
# Backend alive
curl -f http://localhost:8000/health || echo "FAIL: backend not running"

# Frontend alive
curl -sf http://localhost:5173 > /dev/null || echo "FAIL: frontend not running"

# API returns valid JSON (update endpoints as features are added)
curl -sf http://localhost:8000/api/v1/health | python3 -c "import sys,json; json.load(sys.stdin)" || echo "FAIL: API not returning valid JSON"

# PWA manifest exists
curl -sf http://localhost:5173/manifest.json | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'name' in d" || echo "FAIL: PWA manifest missing or invalid"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 8000 in use | `lsof -ti:8000 \| xargs kill` |
| Port 5173 in use | `lsof -ti:5173 \| xargs kill` |
| Tunnel auth expired | `cloudflared tunnel login` (re-auth) |
| Vercel deploy fails | Check `vercel logs` or Vercel dashboard |
| DB connection refused | Start postgres: `brew services start postgresql@16` |
