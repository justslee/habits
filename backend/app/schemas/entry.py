"""Pydantic schemas for daily entry endpoints."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class EntryCreate(BaseModel):
    """Request schema for creating a daily entry."""

    description: str = Field(..., min_length=1, max_length=5000)
    time_invested_minutes: int = Field(..., gt=0)
    pillar_tags: List[int] = Field(default_factory=list)
    difficulty_rating: int = Field(..., ge=1, le=10)
    energy_level: int = Field(..., ge=1, le=10)
    key_takeaway: str = Field(..., min_length=1, max_length=1000)
    entry_date: Optional[date] = None  # Defaults to today


class EntryUpdate(BaseModel):
    """Request schema for updating pillar tags only."""

    pillar_tags: List[int]


class EvaluationResponse(BaseModel):
    """Nested evaluation in entry response."""

    id: int
    depth_score: int
    relevance_score: int
    consistency_multiplier: float
    one_percent_better: bool
    verdict_explanation: str
    commentary: str

    model_config = {"from_attributes": True}


class EntryResponse(BaseModel):
    """Response schema for a daily entry."""

    id: int
    user_id: int
    entry_date: date
    description: str
    time_invested_minutes: int
    pillar_tags: List[int]
    difficulty_rating: Optional[int]
    energy_level: Optional[int]
    key_takeaway: Optional[str]
    created_at: datetime
    updated_at: datetime
    evaluation: Optional[EvaluationResponse] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_entry(cls, entry) -> "EntryResponse":
        """Build response from a DailyEntry ORM object."""
        eval_resp = None
        if entry.evaluation:
            eval_resp = EvaluationResponse.model_validate(entry.evaluation)
        return cls(
            id=entry.id,
            user_id=entry.user_id,
            entry_date=entry.entry_date,
            description=entry.description,
            time_invested_minutes=entry.time_invested_minutes,
            pillar_tags=entry.pillar_tag_list,
            difficulty_rating=entry.difficulty_rating,
            energy_level=entry.energy_level,
            key_takeaway=entry.key_takeaway,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            evaluation=eval_resp,
        )
