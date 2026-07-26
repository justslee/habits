"""Database configuration and session management.

Local dev defaults to a SQLite file; production sets DATABASE_URL to the local
Postgres on the shared EC2 box, e.g.
    postgresql+psycopg://habits:...@localhost:5432/habits
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure the local data directory exists (used only by the SQLite default).
DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# SQLite for local single-user dev; Postgres (psycopg) in prod via DATABASE_URL.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR}/mastery.db")

_is_sqlite = DATABASE_URL.startswith("sqlite")

# Create engine — check_same_thread is a SQLite-only connect arg; use pool_pre_ping
# for the long-lived Postgres connection in prod.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=not _is_sqlite,
    echo=False,
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
