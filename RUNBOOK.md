# RUNBOOK.md — How to Run Everything

> **Deployer agent uses this file.** Keep commands copy-pasteable and idempotent.
> Update this whenever run steps change.

## Prerequisites

```bash
# One-time setup (user runs these manually)
brew install cloudflared node python@3.12
npm install -g eas-cli expo-cli
```

## Environment Variables

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your values
```

### Mobile
```bash
cd mobile
cp .env.example .env
# Edit .env with your API URL
```

---

## Backend (Local)

```bash
# First time setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run database migrations (creates data/mastery.db)
alembic upgrade head

# Seed reference data (pillars + default user)
python -c "from app.db.database import SessionLocal; from app.db.seed import seed_all; db = SessionLocal(); seed_all(db); db.close(); print('Seeded OK')"

# Start server
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Health check
curl http://localhost:8000/health
# Expected: {"status": "ok"}
```

## Mobile (Local Dev)

```bash
# First time setup
cd mobile
npm install

# Start Expo dev server
npm start

# Run on iOS Simulator (requires Xcode)
npm run ios

# Or scan QR code with Expo Go app on iPhone
```

---

## Cloudflare Tunnel (Expose Backend to iPhone)

```bash
# One-time setup
cloudflared tunnel login
cloudflared tunnel create mastery-tracker
cloudflared tunnel route dns mastery-tracker api.yourdomain.com

# Run tunnel (connects localhost:8000 to your domain)
cloudflared tunnel run --url http://localhost:8000 mastery-tracker

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
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2: Mobile
cd mobile && npm start

# Terminal 3: Tunnel (optional, for iPhone access outside dev mode)
cloudflared tunnel --url http://localhost:8000
```

---

## Tests

```bash
# Backend tests
cd backend && source venv/bin/activate && pytest -v

# Mobile tests
cd mobile && npm test

# All tests (from repo root)
cd backend && source venv/bin/activate && pytest -v && cd ../mobile && npm test
```

---

## EAS Build (TestFlight Deployment)

```bash
# One-time setup
cd mobile
eas login
eas build:configure

# Build for iOS
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios
```

---

## Smoke Tests (Deployer runs these)

```bash
# Backend alive
curl -f http://localhost:8000/health || echo "FAIL: backend not running"

# Backend returns valid JSON
curl -sf http://localhost:8000/ | python3 -c "import sys,json; json.load(sys.stdin)" || echo "FAIL: API not returning valid JSON"

# Mobile tests pass
cd mobile && npm test || echo "FAIL: mobile tests failed"

# Backend tests pass
cd backend && source venv/bin/activate && pytest -v || echo "FAIL: backend tests failed"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 8000 in use | `lsof -ti:8000 \| xargs kill` |
| Tunnel auth expired | `cloudflared tunnel login` (re-auth) |
| Expo not starting | `cd mobile && npx expo start --clear` |
| iOS Simulator not found | `xcrun simctl list devices` |
| Python venv not activated | `source backend/venv/bin/activate` |
