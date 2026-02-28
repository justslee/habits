"""DailyEntry model - the core daily check-in."""

from datetime import date, datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.evaluation import Evaluation


class DailyEntry(Base, TimestampMixin):
    """
    A daily check-in entry.

    Captures what the user worked on, time invested, difficulty,
    and key takeaways. Supports soft delete (D-019).
    """

    __tablename__ = "daily_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Date of the entry (can have multiple entries per day)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    
    # Core content (AC-1.1)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Time invested in minutes (AC-1.2)
    time_invested_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Pillar tags - stored as comma-separated pillar IDs
    # User can adjust these (AC-1.4)
    pillar_tags: Mapped[str] = mapped_column(String(50), nullable=True)
    
    # AI-suggested pillar tags (AC-1.3) - before user adjustment
    suggested_pillar_tags: Mapped[str] = mapped_column(String(50), nullable=True)
    
    # Difficulty/depth rating 1-10 (AC-1.5)
    difficulty_rating: Mapped[int] = mapped_column(Integer, nullable=True)
    
    # Energy/focus level 1-10 (AC-1.6)
    energy_level: Mapped[int] = mapped_column(Integer, nullable=True)
    
    # Key takeaway - one sentence (AC-1.7)
    key_takeaway: Mapped[str] = mapped_column(Text, nullable=True)

    # Soft delete (D-019, AC-P5-5.1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Timestamp is automatic via TimestampMixin (AC-1.9)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="entries")
    evaluation: Mapped["Evaluation"] = relationship(
        "Evaluation", back_populates="entry", uselist=False
    )

    def __repr__(self) -> str:
        return f"<DailyEntry(id={self.id}, date={self.entry_date})>"

    @property
    def pillar_tag_list(self) -> list[int]:
        """Parse pillar_tags string into list of IDs."""
        if not self.pillar_tags:
            return []
        return [int(x) for x in self.pillar_tags.split(",") if x.strip()]

    @pillar_tag_list.setter
    def pillar_tag_list(self, value: list[int]) -> None:
        """Set pillar_tags from list of IDs."""
        self.pillar_tags = ",".join(str(x) for x in value) if value else None
