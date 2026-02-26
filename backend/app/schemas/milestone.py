"""Pydantic schemas for milestone endpoints."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class MilestoneCreate(BaseModel):
    """Request schema for creating a milestone."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    achieved_date: date
    pillar_id: Optional[int] = None
    related_entry_id: Optional[int] = None


class MilestoneResponse(BaseModel):
    """Response schema for a milestone."""

    id: int
    user_id: int
    title: str
    description: Optional[str]
    achieved_date: date
    pillar_id: Optional[int]
    related_entry_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
