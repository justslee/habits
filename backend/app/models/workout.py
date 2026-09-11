"""Workout models — Phase 2 Fitness Module.

WorkoutSession: a single training session (push day, cardio, etc.)
ExerciseLog: individual sets within a session
ExerciseProfile: persistent per-exercise tracking for progressive overload
"""

import datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WorkoutSession(Base, TimestampMixin):
    """A single workout session."""

    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    session_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)

    # Day type: push, pull, legs, cardio, basketball, rest
    day_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # AI-generated plan (JSON)
    ai_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    coach_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Session-level RPE (1-10, logged post-session)
    overall_rpe: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Status: planned, in_progress, completed
    status: Mapped[str] = mapped_column(String(20), default="planned")

    # Soft delete (D-019)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # Relationships
    exercises: Mapped[list["ExerciseLog"]] = relationship(
        "ExerciseLog",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ExerciseLog.exercise_order, ExerciseLog.set_number",
    )

    def __repr__(self) -> str:
        return f"<WorkoutSession(id={self.id}, date={self.session_date}, type={self.day_type})>"


class ExerciseLog(Base, TimestampMixin):
    """Individual set logged within a workout session."""

    __tablename__ = "exercise_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id"), nullable=False
    )

    exercise_name: Mapped[str] = mapped_column(String(100), nullable=False)
    exercise_order: Mapped[int] = mapped_column(Integer, default=0)  # order in session
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # lbs
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rpe: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # per-set RPE
    is_warmup: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # For cardio: duration in minutes, distance in miles
    duration_minutes: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Soft delete (D-019) — cascaded from session
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # Relationships
    session: Mapped["WorkoutSession"] = relationship(
        "WorkoutSession", back_populates="exercises"
    )

    def __repr__(self) -> str:
        return f"<ExerciseLog({self.exercise_name} set {self.set_number}: {self.weight}x{self.reps})>"

    @property
    def volume_load(self) -> float:
        """Weight × reps for this set."""
        return (self.weight or 0) * (self.reps or 0)


class ExerciseProfile(Base, TimestampMixin):
    """Persistent per-exercise tracking for progressive overload."""

    __tablename__ = "exercise_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    exercise_name: Mapped[str] = mapped_column(String(100), nullable=False)
    muscle_group: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # push, pull, legs, cardio

    # Current programming
    current_working_weight: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    current_rep_target: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_set_target: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Calculated metrics
    estimated_1rm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Progression tracking
    progression_status: Mapped[str] = mapped_column(
        String(20), default="progressing"
    )  # progressing, maintaining, stalled, deloading, regressing
    last_progression_date: Mapped[Optional[datetime.date]] = mapped_column(
        Date, nullable=True
    )
    stall_count: Mapped[int] = mapped_column(Integer, default=0)
    sessions_at_current_weight: Mapped[int] = mapped_column(Integer, default=0)

    # Mesocycle
    mesocycle_phase: Mapped[str] = mapped_column(
        String(20), default="accumulation"
    )  # accumulation, intensification, deload
    mesocycle_week: Mapped[int] = mapped_column(Integer, default=1)

    def __repr__(self) -> str:
        return f"<ExerciseProfile({self.exercise_name}: {self.current_working_weight}lbs, {self.progression_status})>"


class GolfEvent(Base, TimestampMixin):
    """Tournaments and important rounds. Tournament weeks switch the plan to the taper template."""

    __tablename__ = "golf_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    event_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[datetime.date]] = mapped_column(
        Date, nullable=True
    )  # multi-day events
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(
        String(20), default="tournament"
    )  # tournament | round | practice
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class TrainingSettings(Base, TimestampMixin):
    """Single-row knobs for the golf program."""

    __tablename__ = "training_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, unique=True
    )
    first_event_date: Mapped[Optional[datetime.date]] = mapped_column(
        Date, nullable=True
    )
    five_sessions: Mapped[bool] = mapped_column(default=True)
    extra_lighter_weeks: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # comma-separated week-start dates
