# Plan — Local-first Habits: always-on Mac server, personal assistant, self-shipping loop

> Written 2026-09-08 after a review of `main` at `8712e93`. This is a plan, not a spec.
> Owner decisions are marked **DECIDE**. Everything else is a recommended default.

## 0. What is actually true today

| Area | State (verified 2026-09-08) |
|---|---|
| Repo | Local `main` was 20 commits behind `origin/main`. Fast-forwarded to `8712e93` (PR #14, merged 2026-07-28). |
| Backend hosting | **Live on EC2** at `https://habits.looperapp.org` (shared box with scorecard, nginx → uvicorn :8001, Postgres, secrets from AWS Secrets Manager `habits/prod`). `/health` returns 200. |
| Deploy | `.github/workflows/deploy.yml` deploys to EC2 via SSM on every push to `main` touching `backend/**`. |
| Data | Prod Postgres has the newest data (workouts through 2026-08-16). Local `backend/data/mastery.db` is stale (last written 2026-06-10: 68 todos, 62 workouts, 7 runs, 46 entries). |
| LLM | OpenAI Responses API (`gpt-5.6-sol` reasoning, `gpt-5.5` fast) via raw httpx in `backend/app/services/llm.py`. Speech-to-text is Deepgram `nova-3`. Anthropic SDK was removed in PR #14. |
| Mobile | Expo SDK 54, TestFlight build 15 (2026-07-28). `EXPO_PUBLIC_API_URL=https://habits.looperapp.org` is **baked in at build time**; the `/config.json` runtime override only works on web. Changing the server URL on the phone currently requires a rebuild. |
| Auth | Single shared `X-API-Key` header, rate limit 60/min, CORS allowlist. No user accounts (single user). |
| Tests | Backend: 210 pass, 1 pre-existing failure (`test_workout_api.py::TestExerciseProfiles::test_list_empty`, also noted in PR #14). Mobile: 1 Jest smoke test. |
| This Mac | M2 Pro, 32 GB, macOS 26.2. `caffeinate -dimsu` already runs from `com.looper.keepawake` (scorecard). FileVault **on**. Tailscale installed but **stopped** (tailnet `tail2c4851`). `cloudflared` installed, not logged in. AWS CLI creds present. Xcode present. `eas` logged in as the owner. |
| Existing agents | OpenClaw gateway **retired 2026-09-08** (launchd job removed, package uninstalled). Claude Code reaches the phone through Remote Control (the Claude app); the Telegram plugin is retired. Scorecard has a mature always-on loop: `ops/mac/start.sh`, `.claude/agents`, guard hook, bundle-to-ship policy. |
| Repo docs | Root still carries the Feb starter-kit files (`manager.md`, `builder.md`, `TASKS*.md`, `SPEC.md`, ...) duplicated under `docs/`. `docs/CONTEXT.md`/`STATUS.md` describe the Feb architecture (Anthropic, Cloudflare tunnel), not what runs. |

Implication: this is not "deploy to the Mac for the first time". It is a **migration back from the cloud** with a data move, a URL change on the phone, and a deploy pipeline swap.

---

## 1. Target architecture

```
iPhone (TestFlight)                     Anywhere
  Habits app ── Tailscale VPN (WireGuard) ──► https://justins-macbook-pro-2.tail2c4851.ts.net
  Claude app (Remote Control) ─────────────► Claude Code operator session
  TestFlight app  ◄── new builds ─────────── EAS (cloud build, auto-submit)

MacBook (always on, tailnet only, nothing public)
  launchd: com.habits.api      uvicorn 127.0.0.1:8000 (FastAPI + SQLite)
  tailscale serve :443 ──► 127.0.0.1:8000   (real Let's Encrypt cert, tailnet-only)
  launchd: com.habits.deploy   polls origin/main, pulls, migrates, restarts, health-checks, rolls back
  launchd: com.habits.backup   nightly SQLite snapshot → iCloud Drive (+ optional S3)
  launchd: com.looper.keepawake (exists)
  Claude Code "Habits operator": /loop — builds backlog, merges when gates pass, ships TestFlight,
      runs browser tasks (Playwright, headed Chrome profile), reachable from the Claude app
  Backend brain (metered API, OpenAI or Anthropic): in-app evaluations, coaching, assistant chat
```

Two brains, on purpose:

- **In-app intelligence** (evaluations, coaches, assistant chat) runs inside the FastAPI backend against a metered API key. It must, because the phone talks to the backend.
- **The operator** (self-development, TestFlight uploads, browser tasks, ordering) is a Claude Code session on the Mac under the Max subscription, exactly like scorecard's Looper. Not `claude -p`; that meters at API rates.

---

## 2. Decisions (recommended defaults)

**DECIDE A — Remote access: Tailscale (recommended) vs public HTTPS.**
Tailscale keeps the server invisible to the internet, which matters once this box holds logged-in shopping sessions and an approval flow for payments. Cost: the phone runs the Tailscale app with the VPN on (it can stay on permanently; battery impact is negligible). `tailscale serve` gives a real certificate, so no ATS exceptions. If you later want no-VPN access, `tailscale funnel` is a one-line toggle on the same hostname. Cloudflare Tunnel would keep `habits.looperapp.org` but needs the zone moved from Route 53 to Cloudflare; not worth it.

**DECIDE B — Database: SQLite on the Mac (recommended), Notion as an optional mirror.**
Single user, one machine, ~1 MB of data. SQLite is already the local path; backups are a file copy. Notion is a poor primary store for relational workout/run data and adds latency to every request. Use Notion where a human wants to browse or edit by hand (preferences, orders ledger) via a one-way sync, not as the source of truth.

**DECIDE C — LLM provider for the backend: keep OpenAI for now.**
Nothing to change today; `llm.py` already abstracts two tiers. The assistant work in Phase 4 needs tool calling, which both providers support. If you want everything on Anthropic (the OpenClaw config already prefers `claude-opus-4-6`), that is a one-file swap in `llm.py` plus re-adding the SDK. Decide when Phase 4 starts.

**DECIDE D — Merge policy: auto-merge when gates pass (recommended).**
You said you do not want to review PRs granularly. So: the operator opens a PR, gates run (pytest, `tsc --noEmit`, jest, `expo export`, `/code-review`), and it merges itself. Your review surface becomes the TestFlight build plus a one-word revert from the Claude app. Branch protection requires the checks, not a human.

**DECIDE E — OpenClaw: retired (done 2026-09-08).**
The `ai.openclaw.gateway` launchd job was removed and the global package uninstalled. Claude Code is the single operator. The `~/.openclaw` folder (424 MB of config, logs and browser profiles) was left in place for you to delete.

---

## 3. Phases

Ordered by dependency. Phase 1 and 2 together get the app off the cloud. Phases 3 to 5 are independent of each other once 1 and 2 are done.

### Phase 1 — Backend runs on the Mac, reachable from the phone

1. **Migrate data down from prod.** Reverse the direction of `backend/scripts/migrate_sqlite_to_pg.py` (generalize it to any source → any target). Reach prod Postgres through an SSM port-forward (`aws ssm start-session --document-name AWS-StartPortForwardingSession`, needs the session-manager plugin), run `alembic upgrade head` on a fresh local SQLite, copy tables in FK order, verify row counts against prod API responses. Keep the stale June DB as `mastery.db.pre-migration`.
2. **Local env.** Rewrite `backend/.env`: `DATABASE_URL=sqlite:///./data/mastery.db`, `HABITS_SECRETS_DISABLED=1`, `OAUTH_REDIRECT_BASE` and `ALLOWED_ORIGINS` set to the Tailscale hostname, `TZ=America/New_York`. Pull `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `API_KEY` once from Secrets Manager with the AWS CLI. Keep `API_KEY` identical to the one baked into build 15 so the existing app keeps authenticating.
3. **Whoop.** Removed entirely on 2026-09-08 (no Whoop subscription); the OAuth integration layer, snapshot cache and per-session columns went with it.
4. **launchd service `com.habits.api`.** `backend/ops/mac/start-api.sh` (activate venv, `alembic upgrade head`, `uvicorn --host 127.0.0.1 --port 8000`), plist with `RunAtLoad` + `KeepAlive`, logs to `~/Library/Logs/habits/`. Bind to loopback only; Tailscale fronts it.
5. **Tailscale.** `tailscale up`, enable start-at-login in the app, confirm MagicDNS + HTTPS are on in the admin console, then `tailscale serve --bg --https=443 http://127.0.0.1:8000`. Test `curl https://justins-macbook-pro-2.tail2c4851.ts.net/health` from the phone on cellular with the VPN on.
6. **Backups.** `com.habits.backup` runs nightly: `sqlite3 mastery.db ".backup ..."` into iCloud Drive with 30-day rotation. Optional: Litestream to S3 for continuous replication.
7. **Uptime.** A tiny watchdog (launchd, every 5 min): if `/health` fails twice, restart the service and post a macOS notification and log the event. Also surface a "server unreachable" state in the app (Phase 2).
8. **Power and reboots.** `caffeinate` already prevents sleep. Set `pmset -a autorestart 1` for power-failure recovery. Known limit: FileVault means a reboot stops at the unlock screen and nothing starts until you type the password. Mitigation: turn off automatic macOS update restarts; accept a manual unlock after rare reboots.
9. **Decommission the cloud.** After 3 days of the phone hitting the Mac with no issues: `systemctl disable --now habits-api` on EC2 via SSM (scorecard untouched), delete `.github/workflows/deploy.yml`, `backend/deploy/`, `backend/ops/bootstrap.sh`, `backend/app/services/secrets.py`, drop `boto3` and `psycopg` from requirements. Leave the Route 53 record until the last cloud-era build is off every device.

Acceptance: app on the phone, on cellular, loads today's data from the Mac; Mac reboot (after unlock) brings the API back without a terminal.

### Phase 2 — Mobile: runtime server config, then TestFlight build 16

1. **Server settings in the Me tab.** A "Server" section: URL and API key, stored with `expo-secure-store` (add the dependency; `docs/CONTEXT.md` already prescribes it). `client.ts` reads from secure store first, then `EXPO_PUBLIC_API_URL`. This is what makes future URL changes free.
2. **Connectivity state.** A small banner when `/health` fails, with the hint "Turn on Tailscale". Retry with backoff instead of 30 s hangs on every screen.
3. **Push tokens to the server.** `notifications.ts` already registers Expo push tokens; add `POST /api/v1/devices` so the backend can push (needed by Phases 4 and 5).
4. **Build 16** with `EXPO_PUBLIC_API_URL` defaulting to the Tailscale hostname, `eas build --platform ios --profile production --auto-submit`. Keep `mobile/public/config.json` for the web build.

### Phase 3 — Self-developing loop that ships prototypes, not PRs

Reuse scorecard's proven scaffolding, adapted:

1. **Consolidate the repo brain.** Move the Feb starter-kit files out of the root (`manager.md`, `builder.md`, `deployer.md`, `TASKS*.md`, `SPEC.md` duplicates, `WORKOUT-UI-REDESIGN.md`, `update-tunnel.sh`, `scripts/start-tunnel.sh`) into `docs/archive/` or delete. Write a real `CLAUDE.md` (commands, gates, layout, rules) and `.claude/agents/` (eng-lead, builder, reviewer, qa, release-manager) plus `.claude/hooks/guard.sh` that hard-blocks `.env`, migrations edits without tests, force-push, and `rm -rf`. Rewrite `docs/CONTEXT.md`, `STATUS.md`, `RUNBOOK.md` to describe the Mac architecture.
2. **Backlog as data.** `backlog.json` with priority, size, and a `visible_to_owner` flag. The operator picks the next item; you add items from the Claude app ("add to backlog: ...") or from the in-app feedback button (below).
3. **Gates, then self-merge.** PR → CI (GitHub Actions on `ubuntu-latest`: pytest, ruff, `tsc --noEmit`, jest, `expo export --platform web`) → `/code-review` → `/security-review` for anything touching auth, data, or new endpoints → `gh pr merge --squash --auto`. Branch protection: required checks, no required reviewers.
4. **Backend auto-deploy on the Mac.** `com.habits.deploy` polls `origin/main` every 5 min. On change: `git pull --ff-only`, `pip install -r`, `alembic upgrade head`, restart `com.habits.api`, health-check, and on failure `git checkout` the previous SHA + restart + macOS notification. This replaces `deploy.yml`.
5. **Auto-TestFlight.** A GitHub Actions workflow on push to `main` with `paths: mobile/**`: `eas build --platform ios --profile production --auto-submit --non-interactive` using an `EXPO_TOKEN` repo secret. Throttle to at most one build per day (a concurrency group plus a "changed since last build" check) so the 30-builds/month free tier lasts; the operator can force one. Fallback for outages or speed: `eas build --local` on the Mac, which has Xcode.
6. **Prototypes behind Labs.** New or experimental screens ship behind a "Labs" section in the Me tab with a per-feature toggle, so a half-done idea can reach your phone without touching the main flow. You tap in, try it, and say "keep" or "kill" from the Claude app. Promotion out of Labs is a backlog item.
7. **Feedback from inside the prototype.** A shake-to-report or "Feedback" button posts `{screen, text, screenshot}` to `POST /api/v1/feedback`; the operator turns unread feedback into backlog items each loop. This closes the loop without you writing prompts.
8. **Notifications, rarely.** Remote Control push only for: a new TestFlight build (with a three-line "what to try"), a blocker, or a rollback. Never for routine merges.
9. **Run it.** `ops/mac/start.sh` → `caffeinate claude --remote-control "Habits operator" --permission-mode auto`, then `/loop 4h ...`. Supervise the first day, as scorecard's RUN.md prescribes.

### Phase 4 — Assistant and memory

1. **Memory schema (SQLite).** `memories` (kind: preference | fact | routine | order, key, value JSON, source, confidence, last_confirmed), `orders` (merchant, items JSON, total, currency, status, approved_at, receipt_url, task_id), `merchant_accounts` (merchant, allowed, monthly_cap). Alembic migration + `GET/POST /api/v1/memory` with search.
2. **Seed memory from what exists.** Workouts, runs, habits, and speaking data are already there; add extractors that write durable facts ("prefers 5 lb increments", "no dips") so the assistant does not re-derive them each time.
3. **Assistant chat surface.** Backend `POST /api/v1/assistant/chat` (SSE streaming) with tool calling over the app's own data: todos, habits, workouts, runs, Whoop, memory, and "queue an operator task". Model it on `workout_chat.py`. Mobile: an Assistant screen (fold into Daily or a new tab) with a persistent thread.
4. **Server push.** Backend → Expo push API using tokens from Phase 2. Used for morning briefings, coach nudges, and approval requests.
5. **Notion mirror (optional).** One-way nightly export of preferences and the orders ledger to a Notion database, reusing the token pattern in `notion_kb.py`.

### Phase 5 — Browser agent with secure checkout

1. **Task queue.** `assistant_tasks` (type, payload, status: queued | running | needs_approval | approved | done | failed, artifacts: screenshots, summary). Created from the app chat, the Claude app, or a schedule ("weekly groceries").
2. **Executor on the Mac.** The operator session picks up queued tasks and drives a dedicated headed Chrome profile via Playwright MCP. You log that profile into each merchant once. Merchant allowlist plus per-merchant monthly caps live in `merchant_accounts`.
3. **Build → verify → ask → submit.** Agent builds the cart, screenshots the final cart page, writes a plain summary (items, quantities, total, delivery window), and sets the task to `needs_approval`. Backend pushes to the phone; the app shows an approval sheet gated by Face ID (`expo-local-authentication`). Approve → task `approved` → agent submits using the merchant's saved payment method → receipt screenshot stored on the task, an `orders` row written, push confirmation.
4. **Hard rules.** The app never stores card numbers. No checkout without an approved task. Approval expires in 15 minutes and is bound to the cart total; a changed total requires re-approval. Every task keeps its full screenshot trail.
5. **Why it needs Phase 1's choices.** Logged-in merchant sessions live on this Mac; that is why the API stays tailnet-only and the Chrome profile is separate from your own.

---

## 4. Order of work and effort

| Step | Depends on | Size |
|---|---|---|
| 1. Data migration + local env + launchd + Tailscale serve | — | 1 day |
| 2. Mobile server settings + build 16 | 1 | 1 day |
| 3. Decommission EC2, delete cloud code, rewrite docs | 1, 2 verified | half day |
| 4. Operator scaffolding: CLAUDE.md, agents, guard, backlog, CI gates, auto-merge, Mac auto-deploy | 1 | 1–2 days |
| 5. Auto-TestFlight workflow + Labs + in-app feedback | 2, 4 | 1 day |
| 6. Memory schema + assistant chat + server push | 2 | 2–3 days |
| 7. Task queue + browser executor + approval flow | 4, 6 | 3–5 days |

Steps 1–3 are the migration and should happen first and together. After step 4 the operator does steps 5–7 itself.

---

## 5. Immediate next actions (Phase 1, day one)

1. Install the SSM session-manager plugin, port-forward to prod Postgres, run the reverse migration into a fresh `mastery.db`, verify counts.
2. Write `backend/ops/mac/` (start-api.sh, plists, deploy poller, backup, watchdog) and install them.
3. `tailscale up` + `tailscale serve`; verify from the phone on cellular.
4. Open the Phase 2 PR (server settings in Me tab, connectivity banner, device token endpoint) and cut build 16.
