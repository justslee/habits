# CONTEXT.md — Tech Stack & Conventions

> **Purpose**: Prevents agents from making conflicting tech choices across cycles.
> Update this ONCE at project start. Agents treat it as read-only.

## Stack

| Layer      | Choice           | Why                                      |
|------------|------------------|------------------------------------------|
| Language   | Python 3.12+     | Your existing Polars/quant stack          |
| Backend    | FastAPI          | Async, fast, great for APIs              |
| Frontend   | React + Vite     | Fast builds, PWA-ready, Capacitor-ready  |
| Database   | PostgreSQL       | Default. Override in SPEC if needed      |
| ORM        | SQLAlchemy 2.0   | Async support, well-documented           |
| Test (BE)  | pytest           | Standard, fast                           |
| Test (FE)  | Vitest           | Vite-native, fast                        |
| Pkg (BE)   | pip + requirements.txt | Simple. Use pyproject.toml if complex |
| Pkg (FE)   | pnpm             | Fast, strict                             |
| Formatter  | ruff (BE), prettier (FE) | Non-negotiable, run before commit  |
| Port (BE)  | 8000             | FastAPI default                          |
| Port (FE)  | 5173             | Vite default                             |

## Conventions

- All env vars go in `.env` (gitignored) with a `.env.example` checked in.
- API routes: `/api/v1/<resource>` (RESTful, plural nouns).
- Branch strategy: `main` is always deployable. Feature branches: `feat/<task-id>-<short-name>`.
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `chore:`).
- No secrets or credentials in code. Ever. Use env vars.

## Deployment Targets

| Component | Target                  | URL Pattern                        |
|-----------|-------------------------|------------------------------------|
| Frontend  | Vercel (free tier)      | `https://<project>.vercel.app`     |
| Backend   | Local + Cloudflare Tunnel | `https://<app>.<your-domain>.com` |

## Overrides

> If SPEC.md specifies a different stack choice, SPEC wins. Document the override in DECISIONS.md.
