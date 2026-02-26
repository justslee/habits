"""Streak tracking API endpoints."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.models.streak import Streak
from app.models.user import User
from app.schemas.streak import StreakResponse

router = APIRouter(prefix="/api/v1/streaks", tags=["streaks"])


@router.get("", response_model=List[StreakResponse])
def list_streaks(db: Session = Depends(get_db)):
    """Get streak data for all pillars."""
    user = db.query(User).first()
    if not user:
        return []

    streaks = (
        db.query(Streak)
        .options(joinedload(Streak.pillar))
        .filter(Streak.user_id == user.id)
        .all()
    )
    return [
        StreakResponse(
            id=s.id,
            pillar_id=s.pillar_id,
            pillar_name=s.pillar.name,
            current_streak=s.current_streak,
            longest_streak=s.longest_streak,
            longest_streak_start=s.longest_streak_start,
            last_activity_date=s.last_activity_date,
            days_since_break=s.days_since_break,
        )
        for s in streaks
    ]
