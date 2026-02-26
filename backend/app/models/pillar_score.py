"""PillarScore model - tracks user level per pillar over time."""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.pillar import Pillar


class PillarScore(Base, TimestampMixin):
    """
    Tracks user's current level and progress per pillar.
    
    Used for adaptive calibration (AC-2.7, AC-2.8):
    - Maintains rolling average depth score per pillar
    - Expectations adjust upward as mastery increases
    - Weekly snapshots for radar chart visualization
    """

    __tablename__ = "pillar_scores"
    __table_args__ = (
        UniqueConstraint("user_id", "pillar_id", "score_date", name="uq_user_pillar_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    pillar_id: Mapped[int] = mapped_column(ForeignKey("pillars.id"), nullable=False)
    
    # Date of this score snapshot (weekly for radar chart)
    score_date: Mapped[date] = mapped_column(Date, nullable=False)
    
    # Cumulative metrics
    total_time_minutes: Mapped[int] = mapped_column(Integer, default=0)
    total_entries: Mapped[int] = mapped_column(Integer, default=0)
    
    # Rolling average depth score (for adaptive calibration)
    avg_depth_score: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Current level estimate (0-100, increases over time)
    current_level: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Relative score for radar chart (normalized 0-100)
    radar_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="pillar_scores")
    pillar: Mapped["Pillar"] = relationship("Pillar", back_populates="pillar_scores")

    def __repr__(self) -> str:
        return f"<PillarScore(pillar={self.pillar_id}, level={self.current_level})>"
