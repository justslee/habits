"""Coaching observation model — persistent notes from the AI coach.

Observations are generated after each completed session (workout or run)
and fed back into subsequent session prompts to create a learning loop.
"""

from sqlalchemy import Boolean, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CoachingObservation(Base, TimestampMixin):
    """A persistent coaching observation generated after a session.

    Stored by the AI coach after each workout or run; injected into the
    system prompt for future sessions so the coach "remembers" patterns.
    """

    __tablename__ = "coaching_observations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    # Category drives which coach sees this observation
    category: Mapped[str] = mapped_column(
        String(20), nullable=False, default="general"
    )  # strength | running | general

    # The observation text — specific, actionable, 1-3 sentences
    observation: Mapped[str] = mapped_column(Text, nullable=False)

    # Source: e.g. "session_42", "post_run_87", "weekly_analysis"
    source: Mapped[str] = mapped_column(String(100), nullable=False)

    # LLM-assigned confidence 0.0–1.0
    confidence: Mapped[float] = mapped_column(Float, default=0.8)

    # Soft-disable stale observations without deleting history
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return (
            f"<CoachingObservation(id={self.id}, cat={self.category}, "
            f"src={self.source}, active={self.is_active})>"
        )
