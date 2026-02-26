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
