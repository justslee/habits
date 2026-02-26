"""DailyTodo and DailyHabit models — smart task + habit tracking.

Todos are one-off tasks that get auto-linked to pillars via LLM.
Completing a todo auto-generates a DailyEntry for mastery tracking.

Habits are recurring daily items with streak tracking.
"""

import datetime
from typing import Optional

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class DailyTodo(Base, TimestampMixin):
    """A single todo item for a specific day."""

    __tablename__ = "daily_todos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    todo_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)

    # Content
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Pillar classification (set by LLM on create)
    pillar_id: Mapped[Optional[int]] = mapped_column(ForeignKey("pillars.id"), nullable=True)
    pillar_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 0-1

    # Status
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(nullable=True)

    # When completed, the auto-generated DailyEntry ID
    entry_id: Mapped[Optional[int]] = mapped_column(ForeignKey("daily_entries.id"), nullable=True)

    # Time estimate (minutes) — optional, used for auto-entry
    estimated_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Display order
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    pillar: Mapped[Optional["Pillar"]] = relationship("Pillar", lazy="joined")

    def __repr__(self) -> str:
        return f"<DailyTodo(id={self.id}, text='{self.text[:30]}', done={self.completed})>"


class DailyHabit(Base, TimestampMixin):
    """A recurring daily habit (customizable)."""

    __tablename__ = "daily_habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Ionicon name
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # hex color

    # Tracking
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    total_completions: Mapped[int] = mapped_column(Integer, default=0)

    # Display
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    logs: Mapped[list["DailyHabitLog"]] = relationship(
        "DailyHabitLog", back_populates="habit", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<DailyHabit(id={self.id}, name='{self.name}', streak={self.current_streak})>"


class DailyHabitLog(Base, TimestampMixin):
    """Log entry for a daily habit completion."""

    __tablename__ = "daily_habit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("daily_habits.id"), nullable=False)
    log_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    habit: Mapped["DailyHabit"] = relationship("DailyHabit", back_populates="logs")

    def __repr__(self) -> str:
        return f"<DailyHabitLog(habit={self.habit_id}, date={self.log_date})>"


# Import for relationship resolution
from app.models.pillar import Pillar  # noqa: E402, F401
