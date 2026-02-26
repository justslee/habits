"""Pydantic schemas for dashboard stats endpoint."""

from typing import List, Optional

from pydantic import BaseModel

from app.schemas.streak import StreakResponse


class PillarStats(BaseModel):
    """Stats for a single pillar."""

    pillar_id: int
    pillar_name: str
    total_hours: float
    avg_depth_score: Optional[float]
    entry_count: int


class HoursBreakdown(BaseModel):
    """Hours logged across time periods."""

    all_time: float
    this_week: float
    this_month: float


class DashboardStatsResponse(BaseModel):
    """Full dashboard stats response."""

    hours: HoursBreakdown
    pillar_breakdown: List[PillarStats]
    avg_depth_score: Optional[float]
    trend: str  # "improving", "plateauing", "declining"
    streaks: List[StreakResponse]
