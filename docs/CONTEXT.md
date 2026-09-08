# CONTEXT.md — Tech Stack & Conventions

> **Purpose**: Prevents agents from making conflicting tech choices across cycles.
> Update this ONCE at project start. Agents treat it as read-only.

## Stack

| Layer      | Choice           | Why                                      |
|------------|------------------|------------------------------------------|
| Language (BE) | Python 3.12+  | Existing Polars/quant stack              |
| Backend    | FastAPI          | Async, fast, great for APIs              |
| Frontend   | React Native + Expo | Push notifications, background GPS, native performance |
| Platform   | iPhone only      | Single user, TestFlight via EAS Build    |
| Database   | SQLite           | Single user, no need for Postgres. Both device and backend |
| ORM        | SQLAlchemy 2.0   | Async support, SQLite compatible         |
| Test (BE)  | pytest           | Standard, fast                           |
| Test (FE)  | Jest + React Native Testing Library | Expo default |
| Pkg (BE)   | pip + requirements.txt | Simple. Use pyproject.toml if complex |
| Pkg (FE)   | npm (Expo default) | Expo compatibility                     |
| Formatter  | ruff (BE), prettier (FE) | Non-negotiable, run before commit  |
| Port (BE)  | 8000             | FastAPI default                          |
| AI Backend | OpenAI Responses API (gpt-5.6-sol / gpt-5.5) | `structured_output()` / `generate_text()` in `services/llm.py`; requires `OPENAI_API_KEY` |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     iPhone (React Native)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Daily Log   │  │ Dashboard   │  │ GPS Run Tracker     │  │
│  │ (Phase 1)   │  │ (Phase 1)   │  │ (Phase 3)           │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                    SQLite (device)                           │
└──────────────────────────┼───────────────────────────────────┘
                           │ HTTPS
                           ▼
              ┌────────────────────────┐
              │   Cloudflare Tunnel    │
              └────────────┬───────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    MacBook (Local)                            │
│  ┌─────────────────┐     ┌─────────────────┐                 │
│  │   FastAPI :8000 │────▶│  SQLite (backend)│                │
│  └────────┬────────┘     └─────────────────┘                 │
│           │                                                   │
│           │ LLM calls                                         │
│           ▼                                                   │
│  ┌──────────────────────────────────────┐                    │
│  │  Anthropic SDK → Claude (Opus 4.6)  │                    │
│  └──────────────────────────────────────┘                    │
│                                                               │
│  ┌─────────────────┐                                         │
│  │   Whoop API     │ (read-only)                             │
│  └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
```

## Conventions

- All env vars go in `.env` (gitignored) with a `.env.example` checked in.
- **NEVER commit secrets, API keys, or tokens to Git.**
- API routes: `/api/v1/<resource>` (RESTful, plural nouns).
- Branch strategy: `main` is always deployable. Feature branches: `feat/<task-id>-<short-name>`.
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `chore:`).
- LLM calls use the Anthropic SDK directly via `call_claude()` in `app/services/evaluation.py`.
- Whoop API is read-only.

## Deployment Targets

| Component | Target                  | Access Method                      |
|-----------|-------------------------|------------------------------------|
| Frontend  | iPhone via TestFlight   | Expo EAS Build                     |
| Backend   | Always-on MacBook :8000 (launchd) | Tailscale (`tailscale serve`, HTTPS, tailnet-only) |
| LLM       | api.openai.com (Responses API) | OPENAI_API_KEY in the Mac env file |

## Expo / React Native Notes

- Use `expo-location` for GPS (background location support)
- Use `expo-notifications` for push notifications
- Use `expo-secure-store` for sensitive data on device
- Background tasks via `expo-task-manager`
- EAS Build for TestFlight distribution

## Overrides

> If SPEC.md specifies a different stack choice, SPEC wins. Document the override in DECISIONS.md.
