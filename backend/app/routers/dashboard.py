"""Dashboard stats API endpoint."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.streak import Streak
from app.models.user import User
from app.schemas.dashboard import (
    DashboardStatsResponse,
    HoursBreakdown,
    PillarStats,
)
from app.schemas.streak import StreakResponse

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


def _hours(minutes: int | None) -> float:
    """Convert minutes to hours, rounded to 2 decimals."""
    return round((minutes or 0) / 60, 2)


def _sum_hours(db: Session, user_id: int, since: date | None = None) -> float:
    """Sum time_invested_minutes for a user, optionally since a date."""
    q = db.query(func.coalesce(func.sum(DailyEntry.time_invested_minutes), 0)).filter(
        DailyEntry.user_id == user_id
    )
    if since:
        q = q.filter(DailyEntry.entry_date >= since)
    return _hours(q.scalar())


def _compute_trend(db: Session, user_id: int) -> str:
    """
    Compare average depth score of recent entries (last 7 days)
    vs older entries (8-30 days ago) to determine trend.
    """
    today = date.today()
    recent_start = today - timedelta(days=7)
    older_start = today - timedelta(days=30)

    def avg_depth(start: date, end: date) -> float | None:
        result = (
            db.query(func.avg(Evaluation.depth_score))
            .join(DailyEntry, Evaluation.entry_id == DailyEntry.id)
            .filter(
                DailyEntry.user_id == user_id,
                DailyEntry.entry_date >= start,
                DailyEntry.entry_date <= end,
            )
            .scalar()
        )
        return result

    recent_avg = avg_depth(recent_start, today)
    older_avg = avg_depth(older_start, recent_start - timedelta(days=1))

    if recent_avg is None or older_avg is None:
        return "plateauing"

    diff = recent_avg - older_avg
    if diff > 3:
        return "improving"
    elif diff < -3:
        return "declining"
    return "plateauing"


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get aggregated dashboard statistics."""
    user = db.query(User).first()
    if not user:
        return DashboardStatsResponse(
            hours=HoursBreakdown(all_time=0, this_week=0, this_month=0),
            pillar_breakdown=[],
            avg_depth_score=None,
            trend="plateauing",
            streaks=[],
        )

    today = date.today()
    # Monday of current week
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    # Hours breakdown
    hours = HoursBreakdown(
        all_time=_sum_hours(db, user.id),
        this_week=_sum_hours(db, user.id, since=week_start),
        this_month=_sum_hours(db, user.id, since=month_start),
    )

    # Pillar breakdown
    pillars = db.query(Pillar).order_by(Pillar.display_order).all()
    pillar_breakdown = []
    for p in pillars:
        # Get all entries tagged with this pillar
        entries = (
            db.query(DailyEntry)
            .filter(
                DailyEntry.user_id == user.id,
                DailyEntry.pillar_tags.contains(str(p.id)),
            )
            .all()
        )
        total_minutes = sum(e.time_invested_minutes for e in entries)

        # Avg depth from evaluations on these entries
        entry_ids = [e.id for e in entries]
        avg_depth = None
        if entry_ids:
            avg_depth = (
                db.query(func.avg(Evaluation.depth_score))
                .filter(Evaluation.entry_id.in_(entry_ids))
                .scalar()
            )
            if avg_depth is not None:
                avg_depth = round(avg_depth, 1)

        pillar_breakdown.append(
            PillarStats(
                pillar_id=p.id,
                pillar_name=p.name,
                total_hours=_hours(total_minutes),
                avg_depth_score=avg_depth,
                entry_count=len(entries),
            )
        )

    # Overall avg depth
    overall_avg = (
        db.query(func.avg(Evaluation.depth_score))
        .join(DailyEntry, Evaluation.entry_id == DailyEntry.id)
        .filter(DailyEntry.user_id == user.id)
        .scalar()
    )
    if overall_avg is not None:
        overall_avg = round(overall_avg, 1)

    # Trend
    trend = _compute_trend(db, user.id)

    # Streaks
    streaks = (
        db.query(Streak)
        .options(joinedload(Streak.pillar))
        .filter(Streak.user_id == user.id)
        .all()
    )
    streak_responses = [
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

    return DashboardStatsResponse(
        hours=hours,
        pillar_breakdown=pillar_breakdown,
        avg_depth_score=overall_avg,
        trend=trend,
        streaks=streak_responses,
    )
