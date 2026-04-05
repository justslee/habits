"""Mastery Tracker API - FastAPI Backend."""

import hmac
import logging
import os
import time
from dotenv import load_dotenv

from pathlib import Path as _Path
load_dotenv(_Path(__file__).resolve().parent.parent / ".env")  # Load .env before anything reads os.getenv

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routers import concepts, daily, dashboard, entries, milestones, routes, runs, speaking, streaks, vision, weekly_reviews, whoop, workouts

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
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Try again later."})


# --- CORS — restrict to known origins ---
_allowed_origins = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:19006,http://localhost:8081").split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# --- API key auth — fail-closed ---
_api_key = os.getenv("API_KEY", "")

_PUBLIC_PATHS = {"/", "/health"}


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """Require API key for all non-public endpoints. Fail closed if no key configured."""
    if request.url.path not in _PUBLIC_PATHS:
        if not _api_key:
            return JSONResponse(status_code=503, content={"detail": "Server not configured (missing API_KEY)"})
        provided = request.headers.get("X-API-Key", "")
        if not hmac.compare_digest(provided, _api_key):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log all requests with timing (skip health checks to reduce noise)."""
    if request.url.path == "/health":
        return await call_next(request)
    start = time.time()
    response = await call_next(request)
    elapsed_ms = (time.time() - start) * 1000
    logger.info("%s %s %s %.0fms", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


app.include_router(daily.router)
app.include_router(dashboard.router)
app.include_router(entries.router)
app.include_router(milestones.router)
app.include_router(streaks.router)
app.include_router(weekly_reviews.router)
app.include_router(routes.router)
app.include_router(runs.router)
app.include_router(workouts.router)
app.include_router(speaking.router)
app.include_router(vision.router)
app.include_router(whoop.router)
app.include_router(concepts.router)
app.include_router(concepts.link_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "app": "Mastery Tracker API",
        "version": "0.1.0",
        "docs": "/docs",
    }
