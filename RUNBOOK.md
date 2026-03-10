# RUNBOOK.md — How to Run Everything

> **Deployer agent uses this file.** Keep commands copy-pasteable and idempotent.
> Update this whenever run steps change.

## Prerequisites

```bash
# One-time setup (user runs these manually)
brew install tailscale node python@3.12
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

## Tailscale (Private Network — iPhone ↔ MacBook)

Tailscale creates a private WireGuard mesh. No public tunnel, zero internet exposure.

```bash
# --- One-time setup ---

# MacBook
brew install tailscale
tailscale up                          # Log in (creates Tailscale account if needed)

# Get your hostname (e.g., macbook.tail12345.ts.net)
tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))"

# Generate HTTPS cert for your hostname (optional but recommended for iOS ATS)
tailscale cert YOUR_MACBOOK.tail12345.ts.net

# iPhone
# Install Tailscale from App Store → log in with same account
# Both devices now share a private encrypted network

# --- Update configs with your Tailscale hostname ---

# backend/.env  →  ALLOWED_ORIGINS=...,https://YOUR_MACBOOK.tail12345.ts.net:8000
# mobile/public/config.json  →  {"apiUrl":"https://YOUR_MACBOOK.tail12345.ts.net:8000"}
# mobile/.env  →  EXPO_PUBLIC_API_URL=https://YOUR_MACBOOK.tail12345.ts.net:8000

# --- Verify ---
curl https://YOUR_MACBOOK.tail12345.ts.net:8000/health
# Expected: {"status": "ok"}
```

### Why Tailscale over Cloudflare Tunnel?
- **Stable URL**: Tailscale hostname never changes across restarts
- **Zero public exposure**: Only devices on your Tailscale network can connect
- **No tunnel process**: One fewer process to manage (no cloudflared)
- **WireGuard encryption**: Peer-to-peer, fast, low-latency

---

## Run Everything (Dev Mode)

Open 2 terminals (no tunnel needed with Tailscale):

```bash
# Terminal 1: Backend (reachable via Tailscale hostname automatically)
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Mobile
cd mobile && npm start
```

Or use the all-in-one script:
```bash
./scripts/start-tunnel.sh   # starts backend + prints Tailscale URL
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
| Tailscale not connected | `tailscale up` (reconnect) |
| Tailscale hostname unknown | `tailscale status` (shows hostname + IP) |
| Expo not starting | `cd mobile && npx expo start --clear` |
| iOS Simulator not found | `xcrun simctl list devices` |
| Python venv not activated | `source backend/venv/bin/activate` |
