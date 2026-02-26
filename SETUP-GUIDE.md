# SETUP-GUIDE.md — How to Apply This to Clawdbot / OpenClaw

## What You Just Got

```
agent-starter-kit/
├── SPEC.md              ← YOU fill this out (your product requirements)
├── TASKS.md             ← Manager maintains (backlog with dependencies)
├── STATUS.md            ← Manager maintains (cycle-by-cycle progress)
├── RUNBOOK.md           ← How to run everything (Deployer's playbook)
├── CONTEXT.md           ← Tech stack decisions (agents read, you own)
├── DECISIONS.md         ← Architectural decision log (prevents re-debates)
└── AGENTS/
    ├── manager.md       ← Orchestrator loop
    ├── builder.md       ← Implementation rules + exec allowlist
    ├── tester.md        ← Test execution + failure reporting
    ├── reviewer.md      ← PR review checklist
    └── deployer.md      ← Local backend + Vercel frontend + tunnel
```

---

## Step 1: One-Time Prerequisites

Run these on your machine (you only do this once):

```bash
# Cloudflare Tunnel (secure backend access from phone)
brew install cloudflared

# Vercel CLI (frontend deployment)
pnpm i -g vercel

# Login to both
cloudflared tunnel login
vercel login
```

---

## Step 2: Create Your Project Repo

```bash
mkdir my-project && cd my-project
git init
```

Copy this entire starter kit into the repo root:

```bash
# If you downloaded the files to ~/Downloads/agent-starter-kit:
cp -r ~/Downloads/agent-starter-kit/* .
cp -r ~/Downloads/agent-starter-kit/AGENTS .
git add -A && git commit -m "chore: add agent starter kit"
```

---

## Step 3: Fill Out SPEC.md (This Is Your Only Job)

Open `SPEC.md` and replace the TODOs with your actual product requirements.
Be specific about acceptance criteria — the agents can only be as good as your spec.

Example for a prediction market dashboard:

```markdown
### Feature 1: Live Market Prices

**Description**: Display real-time bid/ask for Kalshi markets.

**Acceptance Criteria**:
- [ ] Dashboard shows top 10 markets by volume
- [ ] Prices update every 5 seconds via WebSocket
- [ ] Each market shows: name, last price, bid, ask, 24h change
- [ ] Mobile responsive (usable on iPhone 15 screen)
```

Once SPEC is done, commit it:

```bash
git add SPEC.md && git commit -m "feat: define product spec"
```

---

## Step 4: Configure Clawdbot Skills

This is where you connect the starter kit to Clawdbot. Skills live in `~/clawd/` based
on your existing setup.

### Option A: Copy Agent Files as Clawdbot Skills

Each `.md` file in `AGENTS/` becomes a skill that Clawdbot can use:

```bash
# Copy agent specs into your Clawdbot skills directory
cp AGENTS/manager.md ~/clawd/skills/manager.md
cp AGENTS/builder.md ~/clawd/skills/builder.md
cp AGENTS/tester.md ~/clawd/skills/tester.md
cp AGENTS/reviewer.md ~/clawd/skills/reviewer.md
cp AGENTS/deployer.md ~/clawd/skills/deployer.md
```

### Option B: Point Clawdbot at the Repo

If Clawdbot supports project directories, point it at your repo root.
It should pick up the AGENTS/ folder and markdown files automatically.

Check your Clawdbot config:
```bash
cat ~/.clawdbot/clawdbot.json
```

Look for a `workspace` or `projects` setting and point it at your repo.

---

## Step 5: Kick Off the Manager Loop

In your Clawdbot dashboard (`http://127.0.0.1:18789/`) or via Telegram (@schwaebot),
send the manager prompt:

```
You are the Manager agent. Read AGENTS/manager.md for your full instructions.

Project root is: /path/to/my-project

Begin the operating loop:
1. Read SPEC.md, TASKS.md, CONTEXT.md
2. Select the next task(s)
3. Execute the cycle (Builder → Tester + Reviewer → Deployer)
4. Update STATUS.md and TASKS.md
5. Repeat

Start now.
```

The Manager will read its instructions, pick the first task, and start coordinating.

---

## Step 6: Monitor Progress

You have three ways to check what's happening:

1. **STATUS.md** — Manager updates this after every cycle. `cat STATUS.md` to see progress.
2. **Clawdbot Dashboard** — `http://127.0.0.1:18789/` shows agent activity.
3. **Telegram** — @schwaebot will send updates if configured.

### When the Manager asks you a question:
It will ask ONE question at a time with a proposed default. Either answer it or accept the default.

---

## Step 7: Access Your App on Your Phone

Once the Deployer has completed frontend deployment:

### PWA Install (recommended)
1. Open `https://<project>.vercel.app` on your phone in Safari (iOS) or Chrome (Android)
2. **iOS**: Tap Share → "Add to Home Screen"
3. **Android**: Tap the install banner or Menu → "Add to Home Screen"
4. App icon appears on your home screen, launches fullscreen

### Backend Access (when you need it)
1. Make sure your laptop is running the backend + tunnel:
   ```bash
   # Terminal 1
   cd backend && uvicorn app.main:app --port 8000
   # Terminal 2
   cloudflared tunnel --url http://localhost:8000
   ```
2. The tunnel URL is accessible from anywhere (not just your WiFi)

---

## Step 8: Day-to-Day Workflow

Once everything is running, your daily workflow is:

```
1. Update SPEC.md if requirements change
2. Tell Manager to resume → it picks up where it left off via STATUS.md
3. Review STATUS.md periodically
4. Answer questions when Manager is blocked
5. App auto-deploys to Vercel on push to main
```

You write the spec. The agents do the rest.

---

## Customizing the Stack

The starter kit defaults to **FastAPI + React + Vite**. To change:

1. Edit `CONTEXT.md` with your preferred stack
2. Update `RUNBOOK.md` commands accordingly
3. Update `TASKS.md` TASK-001 scaffolding criteria
4. Log the change in `DECISIONS.md`

Everything else (agent roles, loop logic, deployment targets) stays the same.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Manager loops without progress | Check STATUS.md — likely a flaky test or unclear spec |
| Builder uses wrong tech | Check CONTEXT.md is complete and DECISIONS.md has no conflicts |
| Vercel deploy fails | Run `vercel logs` or check dashboard |
| Tunnel drops | Restart: `cloudflared tunnel --url http://localhost:8000` |
| Agents ignore instructions | Ensure AGENTS/*.md files are in Clawdbot's skills path |
| Cost concerns | STATUS.md budget section tracks cycle count; all cloud ops require your approval |
