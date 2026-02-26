"""Mastery Tracker API - FastAPI Backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import entries

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


app.include_router(entries.router)


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
