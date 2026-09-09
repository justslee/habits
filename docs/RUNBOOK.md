# RUNBOOK.md — How to Run Everything

> Keep commands copy-pasteable and idempotent. Update whenever run steps change.
> Architecture: the backend runs **on the always-on MacBook**, reachable from the phone
> over **Tailscale**. Nothing is exposed to the public internet.

## Layout on the Mac

| Path | What |
|---|---|
| `~/habits` | development checkout (feature branches, tests) |
| `~/srv/habits` | **deploy clone**, always `origin/main`; the service runs from here. Never edit it. |
| `~/Library/Application Support/Habits/env` | runtime secrets (mode 600, never in git) |
| `~/Library/Application Support/Habits/mastery.db` | the database (SQLite) |
| `~/Library/Logs/habits/` | `api.log`, `api.err.log`, `deploy.log`, `events.log`, … |
| `~/Library/LaunchAgents/com.habits.*.plist` | launchd services (installed by `install.sh`) |

## Services (launchd)

| Label | Runs | Schedule |
|---|---|---|
| `com.habits.api` | `ops/mac/start-api.sh` → `alembic upgrade head` + uvicorn on `127.0.0.1:8000` | always (KeepAlive) |
| `com.habits.deploy` | `ops/mac/deploy.sh` → pull `origin/main`, deps, migrate, restart, health-check, roll back on failure | every 5 min |
| `com.habits.watchdog` | `ops/mac/watchdog.sh` → restart after 2 failed health checks | every 5 min |
| `com.habits.backup` | `ops/mac/backup.sh` → SQLite snapshot to iCloud Drive `Habits Backups/`, 30-day rotation | 03:30 daily |

```bash
# status / restart / logs
launchctl list | grep com.habits
launchctl kickstart -k gui/$(id -u)/com.habits.api
tail -f ~/Library/Logs/habits/api.err.log ~/Library/Logs/habits/events.log

# stop / start everything
for s in api deploy watchdog backup; do launchctl bootout gui/$(id -u)/com.habits.$s; done
bash ~/habits/backend/ops/mac/install.sh
```

## First-time setup on the Mac

```bash
# 0. prerequisites
brew install python@3.12 node gh sqlite awscli session-manager-plugin
# Tailscale from the App Store, logged in. In the admin console (DNS tab) enable
# MagicDNS and HTTPS Certificates.

# 1. runtime env — either pull the cloud one (while the EC2 box still exists) …
bash backend/ops/mac/pull-prod-env.sh
# … or start from the template and fill it in
cp backend/ops/mac/env.example "$HOME/Library/Application Support/Habits/env"

# 2. data — pull the production database down (one-off, while the box still exists)
bash backend/ops/mac/pull-prod-data.sh

# 3. services
bash backend/ops/mac/install.sh

# 4. HTTPS for the phone (real Let's Encrypt cert, tailnet-only)
tailscale serve --bg --https=443 http://127.0.0.1:8000
tailscale serve status

# 5. verify from the phone (Tailscale VPN on):  https://justins-macbook-pro-2.tail2c4851.ts.net/health
```

Optional, no-VPN public access on the same hostname (only if ever needed):
`tailscale funnel --bg 443`. The API key and rate limit still apply.

## Power and reboots

- `caffeinate -dimsu` runs from `com.looper.keepawake` (installed by the scorecard repo) so the Mac never sleeps.
- `sudo pmset -a autorestart 1` — restart after a power failure.
- FileVault is on: after a reboot the Mac waits at the unlock screen and nothing starts until the
  password is typed. Turn off automatic macOS update restarts (System Settings → General →
  Software Update → Automatic updates → off for "Install macOS updates").

## Backend (development)

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # dev values; the service uses ~/Library/Application Support/Habits/env
alembic upgrade head
uvicorn app.main:app --reload --port 8001      # 8000 is the always-on service
```

## Mobile

```bash
cd mobile
npm install
npx expo start                  # Expo Go / simulator
```

The server URL and API key are baked in from `mobile/.env` (`EXPO_PUBLIC_API_URL`,
`EXPO_PUBLIC_API_KEY`) at build time **and** can be changed on the phone without a rebuild
under **Me → Server** (stored in the keychain). `mobile/public/config.json` still overrides
the URL for the web build.

## Tests and gates

```bash
cd backend && source venv/bin/activate && pytest -q && ruff check app
cd mobile && npx tsc --noEmit && npx jest && npx expo export --platform web
```

## TestFlight

```bash
cd mobile
eas build --platform ios --profile production --auto-submit
```
Builds auto-increment the build number (`appVersionSource: remote`). Submission is
non-interactive (`ascAppId` in `eas.json`).

## Food: carts and ordering

The Food tab plans two-week cycles and builds store carts. Two executor modes:

| `FOOD_EXECUTOR` | What builds the cart |
|---|---|
| `dry_run` (default) | The API simulates the cart from bag prices, inline. Whole approval flow works with no browser. |
| `playwright` | `scripts/cart_worker.py` drives a dedicated Chrome profile (`~/Library/Application Support/Habits/chrome-profile`). |

```bash
cd ~/srv/habits/backend && source .venv/bin/activate
pip install playwright && playwright install chrome
FOOD_EXECUTOR=playwright python scripts/cart_worker.py --login hmart     # sign in once per store
FOOD_EXECUTOR=playwright python scripts/cart_worker.py                   # poll queued carts
```

The payment gate lives in `app/services/cart_service.py`: kill switch (`ordering_enabled`, off by
default), per-order and per-cycle caps, one order per store per cycle, Face ID single-use approvals
bound to the cart total with a 15-minute expiry, total re-verification before Place Order,
supervised mode (the executor parks on Place Order; you press it and confirm in the app),
idempotent order recording, and an event audit trail on every cart. Screenshots land in
`~/Library/Application Support/Habits/carts/`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone shows "Can't reach the server" | Turn on Tailscale on the phone; check `tailscale status` on the Mac; `launchctl list \| grep com.habits.api` |
| "API key rejected" banner | Me → Server: the key must equal `API_KEY` in the Mac env file |
| `tailscale serve` says certs unsupported | Enable HTTPS Certificates in the Tailscale admin console (DNS tab) |
| Service crash-looping | `tail -50 ~/Library/Logs/habits/api.err.log`; usually a missing env value or a migration error |
| Deploy rolled back | `~/Library/Logs/habits/events.log` names the SHA; DB snapshot at `mastery.pre-deploy.db` |
| Restore a backup | `gunzip -k "…/Habits Backups/mastery-YYYYMMDD-HHMM.db.gz"` then copy over `mastery.db` while the API is stopped |
