"""Mastery Tracker API - FastAPI Backend."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend directory (supports local dev without exporting vars)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import concepts, daily, dashboard, entries, milestones, routes, runs, streaks, vision, weekly_reviews, workouts

app = FastAPI(
    title="Mastery Tracker API",
    description="Personal progress tracking API for compounding skill development",
    version="0.1.0",
)

# CORS — restrict to known origins
_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:19006,http://localhost:8081").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple API key auth — protects tunnel-exposed endpoints
_api_key = os.getenv("API_KEY", "")

_PUBLIC_PATHS = {"/", "/health", "/docs", "/openapi.json", "/redoc"}


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """Require API key for all non-public endpoints."""
    if _api_key and request.url.path not in _PUBLIC_PATHS:
        provided = request.headers.get("X-API-Key", "")
        if provided != _api_key:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


app.include_router(daily.router)
app.include_router(dashboard.router)
app.include_router(entries.router)
app.include_router(milestones.router)
app.include_router(streaks.router)
app.include_router(weekly_reviews.router)
app.include_router(routes.router)
app.include_router(runs.router)
app.include_router(workouts.router)
app.include_router(vision.router)
app.include_router(concepts.router)


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
