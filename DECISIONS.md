# DECISIONS.md — Architectural Decision Records

> **Purpose**: Prevents agents from relitigating the same choices across cycles.
> When a non-trivial choice is made, log it here. Agents treat past decisions as final unless SPEC changes.

## Format

```
### ADR-XXX: Title
- **Date**: YYYY-MM-DD
- **Status**: Accepted / Superseded by ADR-XXX
- **Context**: Why did this decision come up?
- **Decision**: What was chosen?
- **Alternatives considered**: What else was on the table?
- **Consequences**: What does this mean going forward?
```

---

## Decisions

### ADR-001: Frontend deployment via Vercel
- **Date**: 2025-02-25
- **Status**: Accepted
- **Context**: Need a way to access the app from mobile without exposing local network IP.
- **Decision**: Deploy frontend to Vercel free tier. Auto-deploy on push to main.
- **Alternatives considered**: Cloudflare Pages (also good, slightly less React integration), Netlify (similar), self-hosted on EC2 (overkill, cost risk).
- **Consequences**: Frontend must be a static/SSR build. API calls go to backend via Cloudflare Tunnel URL. Vercel free tier limits apply (100 deploys/day, 100GB bandwidth/month — more than enough for personal use).

### ADR-002: Backend stays local, exposed via Cloudflare Tunnel
- **Date**: 2025-02-25
- **Status**: Accepted
- **Context**: Want fast local iteration without cloud costs, but need mobile access.
- **Decision**: Run backend on local machine, use Cloudflare Tunnel for secure external access.
- **Alternatives considered**: EC2 (cost risk, slower iteration), Railway (good but adds dependency), Lambda (cold starts, complexity).
- **Consequences**: Backend only available when your machine is running and tunnel is active. Acceptable for personal/dev use. If uptime matters later, migrate to Railway or Fly.io.

### ADR-003: PWA-first, Capacitor later if needed
- **Date**: 2025-02-25
- **Status**: Accepted
- **Context**: Want to "download" the app on phone.
- **Decision**: Build as PWA initially. Wrap with Capacitor later only if App Store distribution is needed.
- **Alternatives considered**: React Native / Expo (too much overhead for dashboards), native Swift/Kotlin (not feasible solo).
- **Consequences**: Builder writes standard React. PWA manifest + service worker required from TASK-002 onward. No native-only APIs (camera, etc.) until Capacitor is added.

<!-- Agents: add new decisions below. Never modify accepted decisions — supersede them with a new ADR. -->
