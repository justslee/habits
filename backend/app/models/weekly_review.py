"""Weekly Review model — AI-generated weekly summary and grade."""

import datetime

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WeeklyReview(Base, TimestampMixin):
    """
    AI-generated weekly review with letter grade and recommendations.
    Generated every Sunday (AC-5.1).
    """

    __tablename__ = "weekly_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )

    # Week identification
    week_start: Mapped[datetime.date] = mapped_column(Date, nullable=False)  # Monday
    week_end: Mapped[datetime.date] = mapped_column(Date, nullable=False)  # Sunday

    # Pillar attention distribution (JSON string) (AC-5.2)
    pillar_distribution: Mapped[str] = mapped_column(Text, nullable=False)

    # Comfort zone drift analysis (AC-5.3)
    comfort_zone_analysis: Mapped[str] = mapped_column(Text, nullable=False)

    # Focus recommendations for next week (AC-5.4)
    recommendations: Mapped[str] = mapped_column(Text, nullable=False)

    # Letter grade A-F with justification (AC-5.5)
    letter_grade: Mapped[str] = mapped_column(String(2), nullable=False)
    grade_justification: Mapped[str] = mapped_column(Text, nullable=False)

    # Motivational quote (AC-5.6)
    quote: Mapped[str] = mapped_column(Text, nullable=False)

    # Raw LLM response for debugging
    raw_llm_response: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<WeeklyReview(id={self.id}, week={self.week_start}, grade={self.letter_grade})>"
