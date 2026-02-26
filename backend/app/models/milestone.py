"""Milestone model - tracks key achievements."""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.pillar import Pillar


class Milestone(Base, TimestampMixin):
    """
    User-logged milestones and achievements.
    
    Supports AC-3.8:
    - "First derivatives model built"
    - "Gave first public talk"
    - Displayed on timeline visualization
    """

    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    pillar_id: Mapped[int] = mapped_column(ForeignKey("pillars.id"), nullable=True)

    # Milestone title (short, display-friendly)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    
    # Detailed description
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Date achieved
    achieved_date: Mapped[date] = mapped_column(Date, nullable=False)
    
    # Optional: link to related entry
    related_entry_id: Mapped[int] = mapped_column(
        ForeignKey("daily_entries.id"), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="milestones")
    pillar: Mapped["Pillar"] = relationship("Pillar", back_populates="milestones")

    def __repr__(self) -> str:
        return f"<Milestone(title='{self.title}', date={self.achieved_date})>"
