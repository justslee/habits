"""Pydantic schemas for Daily tab (todos + habits)."""

from typing import List, Optional
from pydantic import BaseModel


# --- Todos ---

class TodoCreate(BaseModel):
    text: str
    estimated_minutes: Optional[int] = None
    todo_date: Optional[str] = None  # YYYY-MM-DD, defaults to today


class TodoUpdate(BaseModel):
    text: Optional[str] = None
    pillar_id: Optional[int] = None
    estimated_minutes: Optional[int] = None
    sort_order: Optional[int] = None


class TodoResponse(BaseModel):
    id: int
    text: str
    todo_date: str
    pillar_id: Optional[int]
    pillar_name: Optional[str] = None
    pillar_confidence: Optional[float]
    completed: bool
    completed_at: Optional[str] = None
    entry_id: Optional[int]
    estimated_minutes: Optional[int]
    sort_order: int

    model_config = {"from_attributes": True}


# --- Habits ---

class HabitCreate(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class HabitResponse(BaseModel):
    id: int
    name: str
    icon: Optional[str]
    color: Optional[str]
    is_active: bool
    current_streak: int
    longest_streak: int
    total_completions: int
    completed_today: bool = False
    sort_order: int

    model_config = {"from_attributes": True}


# --- Daily Summary ---

class DailySummaryResponse(BaseModel):
    quote: str
    quote_author: str
    todos: List[TodoResponse]
    habits: List[HabitResponse]
    workout_preview: Optional[str] = None
    workout_day_type: Optional[str] = None
