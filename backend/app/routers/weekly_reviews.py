"""Weekly review API endpoints."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.models.weekly_review import WeeklyReview
from app.schemas.weekly_review import WeeklyReviewResponse
from app.services.weekly_review import (
    generate_weekly_review,
    get_last_week_bounds,
)

router = APIRouter(prefix="/api/v1/reviews", tags=["weekly-reviews"])


@router.post("/generate", response_model=WeeklyReviewResponse)
async def generate_review(
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Generate a weekly review. Defaults to last completed week."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    if week_start:
        ws = date.fromisoformat(week_start)
        we = ws + timedelta(days=6)
    else:
        ws, we = get_last_week_bounds()

    review = await generate_weekly_review(user.id, ws, we, db)
    return WeeklyReviewResponse(
        id=review.id,
        week_start=review.week_start.isoformat(),
        week_end=review.week_end.isoformat(),
        pillar_distribution=review.pillar_distribution,
        comfort_zone_analysis=review.comfort_zone_analysis,
        recommendations=review.recommendations,
        letter_grade=review.letter_grade,
        grade_justification=review.grade_justification,
        quote=review.quote,
        created_at=str(review.created_at),
    )


@router.get("/", response_model=list[WeeklyReviewResponse])
def list_reviews(limit: int = 10, db: Session = Depends(get_db)):
    """List past weekly reviews, newest first."""
    user = db.query(User).first()
    if not user:
        return []

    reviews = (
        db.query(WeeklyReview)
        .filter(WeeklyReview.user_id == user.id)
        .order_by(WeeklyReview.week_start.desc())
        .limit(limit)
        .all()
    )
    return [
        WeeklyReviewResponse(
            id=r.id,
            week_start=r.week_start.isoformat(),
            week_end=r.week_end.isoformat(),
            pillar_distribution=r.pillar_distribution,
            comfort_zone_analysis=r.comfort_zone_analysis,
            recommendations=r.recommendations,
            letter_grade=r.letter_grade,
            grade_justification=r.grade_justification,
            quote=r.quote,
            created_at=str(r.created_at),
        )
        for r in reviews
    ]


@router.get("/latest", response_model=Optional[WeeklyReviewResponse])
def get_latest_review(db: Session = Depends(get_db)):
    """Get the most recent weekly review."""
    user = db.query(User).first()
    if not user:
        return None

    review = (
        db.query(WeeklyReview)
        .filter(WeeklyReview.user_id == user.id)
        .order_by(WeeklyReview.week_start.desc())
        .first()
    )
    if not review:
        return None

    return WeeklyReviewResponse(
        id=review.id,
        week_start=review.week_start.isoformat(),
        week_end=review.week_end.isoformat(),
        pillar_distribution=review.pillar_distribution,
        comfort_zone_analysis=review.comfort_zone_analysis,
        recommendations=review.recommendations,
        letter_grade=review.letter_grade,
        grade_justification=review.grade_justification,
        quote=review.quote,
        created_at=str(review.created_at),
    )
