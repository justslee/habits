"""Streak model - tracks consistency per pillar."""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.pillar import Pillar


class Streak(Base, TimestampMixin):
    """
    Tracks current and longest streaks per pillar.
    
    Supports AC-3.3:
    - Current streak per pillar
    - Longest streak ever per pillar
    - Streak recovery time (days since broken)
    """

    __tablename__ = "streaks"
    __table_args__ = (
        UniqueConstraint("user_id", "pillar_id", name="uq_user_pillar_streak"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    pillar_id: Mapped[int] = mapped_column(ForeignKey("pillars.id"), nullable=False)

    # Current streak
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    
    # Date of last activity (to detect breaks)
    last_activity_date: Mapped[date] = mapped_column(Date, nullable=True)
    
    # Longest streak ever achieved
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    
    # Date when longest streak started
    longest_streak_start: Mapped[date] = mapped_column(Date, nullable=True)
    
    # Days since last broken streak (recovery time)
    days_since_break: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="streaks")
    pillar: Mapped["Pillar"] = relationship("Pillar", back_populates="streaks")

    def __repr__(self) -> str:
        return f"<Streak(pillar={self.pillar_id}, current={self.current_streak})>"

    def update_streak(self, activity_date: date) -> None:
        """Update streak based on new activity."""
        if self.last_activity_date is None:
            # First activity ever
            self.current_streak = 1
            self.last_activity_date = activity_date
        elif activity_date == self.last_activity_date:
            # Same day, no change
            pass
        elif (activity_date - self.last_activity_date).days == 1:
            # Consecutive day - extend streak
            self.current_streak += 1
            self.last_activity_date = activity_date
        else:
            # Streak broken
            self.days_since_break = (activity_date - self.last_activity_date).days
            self.current_streak = 1
            self.last_activity_date = activity_date

        # Update longest streak if current exceeds it
        if self.current_streak > self.longest_streak:
            self.longest_streak = self.current_streak
            # Set start date by calculating back from current date
            from datetime import timedelta
            self.longest_streak_start = activity_date - timedelta(days=self.current_streak - 1)
