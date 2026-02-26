"""Mastery Tracker API - FastAPI Backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import dashboard, entries, milestones, streaks, weekly_reviews, workouts

app = FastAPI(
    title="Mastery Tracker API",
    description="Personal progress tracking API for compounding skill development",
    version="0.1.0",
)

# CORS configuration for mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Will restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(dashboard.router)
app.include_router(entries.router)
app.include_router(milestones.router)
app.include_router(streaks.router)
app.include_router(weekly_reviews.router)
app.include_router(workouts.router)


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
