"""Pydantic schemas for streak endpoints."""

from datetime import date
from typing import Optional

from pydantic import BaseModel


class StreakResponse(BaseModel):
    """Response schema for a single pillar streak."""

    id: int
    pillar_id: int
    pillar_name: str
    current_streak: int
    longest_streak: int
    longest_streak_start: Optional[date]
    last_activity_date: Optional[date]
    days_since_break: int

    model_config = {"from_attributes": True}
