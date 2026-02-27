"""Evaluation model - AI assessment of daily entries."""

from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.daily_entry import DailyEntry


class Evaluation(Base, TimestampMixin):
    """
    AI evaluation of a daily entry.
    
    The "Honest Mirror" - brutally honest assessment of
    whether the user actually got 1% better.
    """

    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("daily_entries.id"), unique=True, nullable=False
    )

    # Depth score 0-100 (AC-2.1)
    # How deep was the engagement? PhD-level or surface skimming?
    depth_score: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relevance score 0-100 (AC-2.2)
    # How directly does this move the needle toward pillar goals?
    relevance_score: Mapped[int] = mapped_column(Integer, nullable=False)

    # Consistency multiplier (AC-2.3)
    # Based on streak data - showing up daily vs burst activity
    consistency_multiplier: Mapped[float] = mapped_column(default=1.0)

    # Binary 1% better verdict (AC-2.4)
    one_percent_better: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Explanation for the verdict (AC-2.4)
    verdict_explanation: Mapped[str] = mapped_column(Text, nullable=False)

    # Brutally honest commentary (AC-2.5)
    # "No participation trophies"
    commentary: Mapped[str] = mapped_column(Text, nullable=False)

    # Raw LLM response for debugging
    raw_llm_response: Mapped[str] = mapped_column(Text, nullable=True)

    # Soft delete (D-019)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship
    entry: Mapped["DailyEntry"] = relationship("DailyEntry", back_populates="evaluation")

    def __repr__(self) -> str:
        return f"<Evaluation(id={self.id}, depth={self.depth_score}, 1%={self.one_percent_better})>"

    @property
    def combined_score(self) -> float:
        """Combined score factoring in depth, relevance, and consistency."""
        base = (self.depth_score + self.relevance_score) / 2
        return base * self.consistency_multiplier
