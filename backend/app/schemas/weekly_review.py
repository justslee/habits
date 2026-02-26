"""Pydantic schemas for weekly review endpoints."""

from typing import Optional

from pydantic import BaseModel


class WeeklyReviewResponse(BaseModel):
    id: int
    week_start: str
    week_end: str
    pillar_distribution: str
    comfort_zone_analysis: str
    recommendations: str
    letter_grade: str
    grade_justification: str
    quote: str
    created_at: str

    model_config = {"from_attributes": True}
