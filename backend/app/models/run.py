"""Run tracking models — Phase 3 GPS Run Tracking."""

import datetime
from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RunSession(Base, TimestampMixin):
    """A single GPS-tracked run."""

    __tablename__ = "run_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    run_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)

    # Core metrics
    distance_miles: Mapped[float] = mapped_column(Float, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_pace_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # seconds per mile
    elevation_gain_ft: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    calories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # GPS data (JSON array of {lat, lng, alt, timestamp})
    gps_polyline: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Run type: easy, tempo, interval, long, recovery, race
    run_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Conditions
    weather: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rpe: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Whoop context
    whoop_recovery_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    whoop_strain: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # AI feedback
    ai_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status: in_progress, completed, discarded
    status: Mapped[str] = mapped_column(String(20), default="completed")

    # Relationships
    splits: Mapped[list["RunSplit"]] = relationship(
        "RunSplit", back_populates="run", cascade="all, delete-orphan",
        order_by="RunSplit.mile_number"
    )

    def __repr__(self) -> str:
        return f"<RunSession(id={self.id}, date={self.run_date}, {self.distance_miles}mi)>"

    @property
    def avg_pace_formatted(self) -> str:
        """Format pace as M:SS."""
        if not self.avg_pace_seconds:
            return "—"
        m, s = divmod(self.avg_pace_seconds, 60)
        return f"{m}:{s:02d}"

    @property
    def duration_formatted(self) -> str:
        """Format duration as H:MM:SS or MM:SS."""
        h, rem = divmod(self.duration_seconds, 3600)
        m, s = divmod(rem, 60)
        if h:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m}:{s:02d}"


class RunSplit(Base, TimestampMixin):
    """Per-mile split within a run."""

    __tablename__ = "run_splits"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("run_sessions.id"), nullable=False)
    mile_number: Mapped[int] = mapped_column(Integer, nullable=False)
    pace_seconds: Mapped[int] = mapped_column(Integer, nullable=False)  # seconds per mile
    elevation_change_ft: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_heart_rate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationship
    run: Mapped["RunSession"] = relationship("RunSession", back_populates="splits")

    @property
    def pace_formatted(self) -> str:
        m, s = divmod(self.pace_seconds, 60)
        return f"{m}:{s:02d}"


class RunningProfile(Base, TimestampMixin):
    """User's running profile and training plan state."""

    __tablename__ = "running_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Goals
    goal_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # base_building, 5k, 10k, half_marathon
    target_weekly_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_weekly_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Plan state (JSON: current week's plan)
    current_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan_week: Mapped[int] = mapped_column(Integer, default=1)
    is_deload_week: Mapped[bool] = mapped_column(default=False)

    # Fitness estimates
    estimated_easy_pace: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # sec/mile
    estimated_tempo_pace: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estimated_interval_pace: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class PersonalRecord(Base, TimestampMixin):
    """Running personal records."""

    __tablename__ = "personal_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("run_sessions.id"), nullable=True)

    distance_label: Mapped[str] = mapped_column(String(30), nullable=False)  # mile, 5k, 10k, half_marathon, marathon
    time_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    record_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)

    @property
    def time_formatted(self) -> str:
        h, rem = divmod(self.time_seconds, 3600)
        m, s = divmod(rem, 60)
        if h:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m}:{s:02d}"
