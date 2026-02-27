"""Run tracking models — Phase 3 GPS Run Tracking."""

import datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
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

    # Phase 4: link to training plan
    planned_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # logical FK to planned_runs.id (no DB FK to avoid circular dep)
    route_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # logical FK to saved_routes.id
    feel_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1-10 post-run RPE
    is_pr: Mapped[bool] = mapped_column(default=False)
    pr_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # fastest_mile, 5k, etc.

    # Status: in_progress, completed, discarded
    status: Mapped[str] = mapped_column(String(20), default="completed")

    # Soft delete (D-019)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

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

    # Soft delete (D-019) — cascaded from run
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

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


class TrainingPlan(Base, TimestampMixin):
    """Multi-week progressive running plan (Runna-style)."""

    __tablename__ = "training_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    goal_type: Mapped[str] = mapped_column(String(30), nullable=False)  # base_building, 5k, 10k, half_marathon, marathon, general
    fitness_level: Mapped[str] = mapped_column(String(20), default="intermediate")  # beginner, intermediate, advanced
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)
    current_week: Mapped[int] = mapped_column(Integer, default=1)
    total_weeks: Mapped[int] = mapped_column(Integer, nullable=False)

    # Full plan structure (JSON: array of weeks)
    weekly_plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status: active, completed, abandoned
    status: Mapped[str] = mapped_column(String(20), default="active")

    # Available run days (JSON array of day-of-week ints, 0=Mon)
    available_days: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Target race date (optional)
    target_race_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)

    # Relationships
    planned_runs: Mapped[list["PlannedRun"]] = relationship(
        "PlannedRun", back_populates="plan", cascade="all, delete-orphan",
        order_by="PlannedRun.week_number, PlannedRun.day_of_week"
    )

    def __repr__(self) -> str:
        return f"<TrainingPlan(id={self.id}, goal={self.goal_type}, week {self.current_week}/{self.total_weeks})>"


class PlannedRun(Base, TimestampMixin):
    """A single planned run within a training plan."""

    __tablename__ = "planned_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("training_plans.id"), nullable=False)

    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Mon, 6=Sun
    planned_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)

    # Run spec
    run_type: Mapped[str] = mapped_column(String(20), nullable=False)  # easy, tempo, intervals, long, recovery, fartlek, progression
    target_distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_pace_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # per mile
    target_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Structure: JSON array of segments [{type, duration_minutes, distance_miles, target_pace}]
    structure: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Link to completed run
    completed_run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("run_sessions.id"), nullable=True)

    # Status: upcoming, completed, missed, swapped
    status: Mapped[str] = mapped_column(String(20), default="upcoming")

    # Relationships
    plan: Mapped["TrainingPlan"] = relationship("TrainingPlan", back_populates="planned_runs")

    def __repr__(self) -> str:
        return f"<PlannedRun(week={self.week_number}, day={self.day_of_week}, type={self.run_type})>"


class RunSegmentLog(Base, TimestampMixin):
    """Logged segment within a structured run (intervals, tempo blocks, etc.)."""

    __tablename__ = "run_segment_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("run_sessions.id"), nullable=False)
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)

    segment_type: Mapped[str] = mapped_column(String(20), nullable=False)  # warmup, work, recovery, cooldown
    target_pace_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_pace_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Soft delete (D-019) — cascaded from run
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<RunSegmentLog(run={self.run_id}, seg={self.segment_index}, type={self.segment_type})>"


class SavedRoute(Base, TimestampMixin):
    """A saved running route for reuse and comparison."""

    __tablename__ = "saved_routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Route geometry
    waypoints: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array of {lat, lng}
    polyline: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON array of {lat, lng, alt}
    distance_miles: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_gain_ft: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Metadata
    route_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # loop, out_and_back, point_to_point
    tags: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # comma-separated: flat, hilly, trail, track, neighborhood
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Stats (updated after runs on this route)
    times_run: Mapped[int] = mapped_column(Integer, default=0)
    best_time_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_run_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:
        return f"<SavedRoute(id={self.id}, name={self.name}, dist={self.distance_miles}mi)>"
