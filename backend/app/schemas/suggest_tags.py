"""Pydantic schemas for tag suggestion endpoint."""

from pydantic import BaseModel, Field


class SuggestTagsRequest(BaseModel):
    """Request schema for suggesting pillar tags."""

    description: str = Field(..., min_length=1, max_length=5000)


class PillarSuggestion(BaseModel):
    """A single pillar suggestion with confidence and sub-topics."""

    pillar_id: int
    pillar_name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    sub_topics: list[str] = Field(default_factory=list)


class SuggestTagsResponse(BaseModel):
    """Response schema for tag suggestions."""

    suggestions: list[PillarSuggestion]
