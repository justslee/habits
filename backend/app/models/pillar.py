"""Pillar model - the five core skill pillars."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Pillar(Base, TimestampMixin):
    """
    The five pillars of mastery.
    
    These are seeded on first run and rarely change.
    1. Quantitative Finance
    2. Macro & Qualitative Investing
    3. Machine Learning (Math)
    4. AI Engineering & Deployment
    5. Public Speaking & Communication
    """

    __tablename__ = "pillars"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    short_name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    depth_target: Mapped[str] = mapped_column(String(50), nullable=True)
    display_order: Mapped[int] = mapped_column(default=0)

    # Relationships
    pillar_scores = relationship("PillarScore", back_populates="pillar")
    streaks = relationship("Streak", back_populates="pillar")
    milestones = relationship("Milestone", back_populates="pillar")

    def __repr__(self) -> str:
        return f"<Pillar(id={self.id}, name='{self.name}')>"
