"""Mastery Tracker API - FastAPI Backend."""

import hmac
import logging
import os
import time
from dotenv import load_dotenv

from pathlib import Path as _Path

load_dotenv(
    _Path(__file__).resolve().parent.parent / ".env", override=True
)  # override=True so .env wins over empty shell vars

# Pull prod secrets (OPENAI_API_KEY, API_KEY, …) from AWS Secrets Manager
# into the env BEFORE routers/services import. No-op locally (fail-open); never
# overrides an explicit env var / .env value.
from app.services.secrets import load_secrets_into_env  # noqa: E402

load_secrets_into_env()

# Run in the owner's timezone so date.today() (used everywhere for "today's"
# todos / workouts / summary) matches the user's calendar day rather than the
# UTC box's. datetime.utcnow() is unaffected, so absolute timestamps stay UTC.
os.environ.setdefault("TZ", "America/New_York")
time.tzset()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routers import (
    calendar,
    coach,
    train,
    concepts,
    daily,
    dashboard,
    devices,
    entries,
    food,
    milestones,
    runs,
    speaking,
    streaks,
    vdot,
    vision,
    weekly_reviews,
    workouts,
)

logger = logging.getLogger("mastery_tracker")

_debug = os.getenv("DEBUG", "false").lower() == "true"

app = FastAPI(
    title="Mastery Tracker API",
    description="Personal progress tracking API for compounding skill development",
    version="0.1.0",
    docs_url="/docs" if _debug else None,
    redoc_url="/redoc" if _debug else None,
    openapi_url="/openapi.json" if _debug else None,
)

# --- Rate limiting ---
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429, content={"detail": "Rate limit exceeded. Try again later."}
    )


# --- CORS — restrict to known origins ---
_allowed_origins = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:19006,http://localhost:8081"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# --- API key auth — fail-closed ---
_api_key = os.getenv("API_KEY", "")

_PUBLIC_PATHS = {"/", "/api", "/health", "/api/config-status"}


_testing = os.getenv("TESTING", "") == "1"


def _is_public_path(path: str) -> bool:
    # Everything outside /api is the web app (static files) or a health probe; data lives under /api/v1.
    return path in _PUBLIC_PATHS or not path.startswith("/api/")


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """Require API key for all non-public endpoints. Fail closed if no key configured."""
    # A CORS preflight carries no credentials by design; answering it is not access to data.
    if request.method == "OPTIONS":
        return await call_next(request)
    if _testing or _is_public_path(request.url.path):
        return await call_next(request)
    if not _api_key:
        return JSONResponse(
            status_code=503,
            content={"detail": "Server not configured (missing API_KEY)"},
        )
    provided = request.headers.get("X-API-Key", "")
    if not hmac.compare_digest(provided, _api_key):
        return JSONResponse(
            status_code=401, content={"detail": "Invalid or missing API key"}
        )
    return await call_next(request)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log all requests with timing (skip health checks to reduce noise)."""
    if request.url.path == "/health":
        return await call_next(request)
    start = time.time()
    response = await call_next(request)
    elapsed_ms = (time.time() - start) * 1000
    logger.info(
        "%s %s %s %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


app.include_router(daily.router)
app.include_router(dashboard.router)
app.include_router(entries.router)
app.include_router(milestones.router)
app.include_router(streaks.router)
app.include_router(weekly_reviews.router)
app.include_router(runs.router)
app.include_router(vdot.router)
app.include_router(workouts.router)
app.include_router(speaking.router)
app.include_router(vision.router)
app.include_router(devices.router)
app.include_router(food.router)
app.include_router(calendar.router)
app.include_router(train.router)
app.include_router(coach.router)
app.include_router(concepts.router)
app.include_router(concepts.link_router)


# --- Food scheduler: hourly in-process tick (calendar sync, cycle close-out, pushes) ---
_scheduler_task = None


async def _food_scheduler_loop():
    import asyncio

    from app.db.database import SessionLocal
    from app.services.food_scheduler import daily_tick

    await asyncio.sleep(20)  # let the server settle
    while True:
        db = SessionLocal()
        try:
            await daily_tick(db)
        except Exception as e:  # noqa: BLE001
            logger.warning("food scheduler tick failed: %s", e)
        finally:
            db.close()
        await asyncio.sleep(3600)


@app.on_event("startup")
async def _start_scheduler():
    global _scheduler_task
    import asyncio

    if _testing or os.getenv("FOOD_SCHEDULER", "1") != "1":
        return
    _scheduler_task = asyncio.create_task(_food_scheduler_loop())


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/config-status")
async def config_status():
    """Presence-check for required secrets (booleans only — never values).

    Lets us confirm the Secrets Manager loader populated the env after deploy
    without exposing any secret material.
    """

    def _set(name: str) -> bool:
        return bool(os.getenv(name))

    return {
        "openai": _set("OPENAI_API_KEY"),
        "api_key": _set("API_KEY"),
        "database_url": _set("DATABASE_URL"),
        "notion": _set("NOTION_TOKEN"),
    }


@app.get("/api")
async def root():
    """API root."""
    return {
        "app": "Mastery Tracker API",
        "version": "0.1.0",
        "docs": "/docs",
    }


# --- Web app (Expo web export) served by the same process, so the app works in a browser on
# any device on the tailnet. Built by ops/mac/build-web.sh into HABITS_WEB_DIR. Mounted last so
# API routes win; html=True serves index.html for unknown paths (client-side routing).
_web_dir = os.getenv(
    "HABITS_WEB_DIR",
    str(_Path.home() / "Library" / "Application Support" / "Habits" / "web"),
)
if os.path.isdir(_web_dir) and os.path.isfile(os.path.join(_web_dir, "index.html")):
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_web_dir, html=True), name="web")
