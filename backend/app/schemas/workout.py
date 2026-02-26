"""Pydantic schemas for workout endpoints."""

from typing import List, Optional

from pydantic import BaseModel


class ExerciseLogCreate(BaseModel):
    exercise_name: str
    set_number: int
    weight: Optional[float] = None
    reps: Optional[int] = None
    rpe: Optional[float] = None
    is_warmup: bool = False
    notes: Optional[str] = None
    duration_minutes: Optional[float] = None
    distance_miles: Optional[float] = None


class ExerciseLogResponse(BaseModel):
    id: int
    exercise_name: str
    exercise_order: int
    set_number: int
    weight: Optional[float]
    reps: Optional[int]
    rpe: Optional[float]
    is_warmup: bool
    notes: Optional[str]
    duration_minutes: Optional[float]
    distance_miles: Optional[float]

    model_config = {"from_attributes": True}


class WorkoutSessionCreate(BaseModel):
    day_type: str
    session_date: Optional[str] = None  # YYYY-MM-DD, defaults to today
    exercises: List[ExerciseLogCreate] = []
    overall_rpe: Optional[int] = None


class WorkoutSessionResponse(BaseModel):
    id: int
    session_date: str
    day_type: str
    status: str
    whoop_recovery_score: Optional[float]
    whoop_hrv: Optional[float]
    whoop_resting_hr: Optional[float]
    whoop_sleep_score: Optional[float]
    ai_plan: Optional[str]
    coach_notes: Optional[str]
    overall_rpe: Optional[int]
    exercises: List[ExerciseLogResponse]

    model_config = {"from_attributes": True}


class ExerciseProfileResponse(BaseModel):
    id: int
    exercise_name: str
    muscle_group: str
    current_working_weight: Optional[float]
    current_rep_target: Optional[int]
    current_set_target: Optional[int]
    estimated_1rm: Optional[float]
    progression_status: str
    stall_count: int
    sessions_at_current_weight: int
    mesocycle_phase: str
    mesocycle_week: int

    model_config = {"from_attributes": True}


class ChatMessage(BaseModel):
    message: str


class ChatResponse(BaseModel):
    coach_response: str
    parsed_sets: List[ExerciseLogCreate]
    session_summary: Optional[str] = None
