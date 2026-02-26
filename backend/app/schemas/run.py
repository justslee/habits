"""Pydantic schemas for run tracking endpoints."""

from typing import List, Optional

from pydantic import BaseModel


class RunSplitCreate(BaseModel):
    mile_number: int
    pace_seconds: int
    elevation_change_ft: Optional[float] = None
    avg_heart_rate: Optional[int] = None


class RunSplitResponse(BaseModel):
    id: int
    mile_number: int
    pace_seconds: int
    pace_formatted: str
    elevation_change_ft: Optional[float]
    avg_heart_rate: Optional[int]

    model_config = {"from_attributes": True}


class RunSessionCreate(BaseModel):
    run_date: Optional[str] = None  # YYYY-MM-DD
    distance_miles: float
    duration_seconds: int
    elevation_gain_ft: Optional[float] = None
    gps_polyline: Optional[str] = None
    run_type: Optional[str] = None
    weather: Optional[str] = None
    rpe: Optional[int] = None
    notes: Optional[str] = None
    splits: List[RunSplitCreate] = []


class RunSessionResponse(BaseModel):
    id: int
    run_date: str
    distance_miles: float
    duration_seconds: int
    avg_pace_seconds: Optional[int]
    avg_pace_formatted: str
    duration_formatted: str
    elevation_gain_ft: Optional[float]
    run_type: Optional[str]
    weather: Optional[str]
    rpe: Optional[int]
    notes: Optional[str]
    whoop_recovery_score: Optional[float]
    ai_feedback: Optional[str]
    status: str
    splits: List[RunSplitResponse]

    model_config = {"from_attributes": True}


class RunStatsResponse(BaseModel):
    total_runs: int
    total_miles: float
    total_time_seconds: int
    avg_pace_seconds: Optional[int]
    this_week_miles: float
    this_month_miles: float
    longest_run_miles: float
    fastest_pace_seconds: Optional[int]


class PersonalRecordResponse(BaseModel):
    id: int
    distance_label: str
    time_seconds: int
    time_formatted: str
    record_date: str

    model_config = {"from_attributes": True}


# --- Phase 4: Training Plans ---

class TrainingPlanCreate(BaseModel):
    goal_type: str  # base_building, 5k, 10k, half_marathon, marathon, general
    fitness_level: str = "intermediate"
    available_days: Optional[str] = None  # JSON array of day ints
    target_race_date: Optional[str] = None  # YYYY-MM-DD


class PlannedRunResponse(BaseModel):
    id: int
    week_number: int
    day_of_week: int
    planned_date: Optional[str]
    run_type: str
    target_distance_miles: Optional[float]
    target_pace_seconds: Optional[int]
    target_duration_minutes: Optional[int]
    description: Optional[str]
    structure: Optional[str]
    completed_run_id: Optional[int]
    status: str

    model_config = {"from_attributes": True}


class TrainingPlanResponse(BaseModel):
    id: int
    goal_type: str
    fitness_level: str
    start_date: str
    end_date: Optional[str]
    current_week: int
    total_weeks: int
    status: str
    available_days: Optional[str]
    target_race_date: Optional[str]
    planned_runs: List[PlannedRunResponse] = []

    model_config = {"from_attributes": True}


class TodayRunResponse(BaseModel):
    has_planned_run: bool
    planned_run: Optional[PlannedRunResponse] = None
    plan_name: Optional[str] = None
    week_number: Optional[int] = None
    total_weeks: Optional[int] = None
    recovery_score: Optional[float] = None


class PostRunFeedbackResponse(BaseModel):
    feedback: str
    is_pr: bool
    pr_type: Optional[str] = None
