"""Daily tab API — todos, habits, and daily summary (Phase 4+)."""

from __future__ import annotations

import json
import logging
import random
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.daily_entry import DailyEntry
from app.models.daily_todo import DailyHabit, DailyHabitLog, DailyTodo
from app.models.pillar import Pillar
from app.models.user import User
from app.schemas.daily import (
    DailySummaryResponse, HabitCreate, HabitResponse, HabitUpdate,
    TodoCreate, TodoResponse, TodoUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/daily", tags=["daily"])

# Elite athlete quotes — rotated daily
QUOTES = [
    ("I can accept failure. Everyone fails at something. But I can't accept not trying.", "Michael Jordan"),
    ("Hard work beats talent when talent doesn't work hard.", "Tim Notke / Kevin Durant"),
    ("The only way to prove you're a good sport is to lose.", "Ernie Banks"),
    ("I'm not the next Usain Bolt or Michael Phelps. I'm the first Simone Biles.", "Simone Biles"),
    ("Rest at the end, not in the middle.", "Kobe Bryant"),
    ("Suffer the pain of discipline or suffer the pain of regret.", "Jim Rohn"),
    ("Don't count the days, make the days count.", "Muhammad Ali"),
    ("You miss 100% of the shots you don't take.", "Wayne Gretzky"),
    ("The more difficult the victory, the greater the happiness in winning.", "Pelé"),
    ("I hated every minute of training, but I said, don't quit.", "Muhammad Ali"),
    ("It's not about the size of the dog in the fight, but the size of the fight in the dog.", "Archie Griffin"),
    ("Pain is temporary. Quitting lasts forever.", "Lance Armstrong"),
    ("Who's gonna carry the boats?", "David Goggins"),
    ("Mamba mentality is about 4 a.m. workouts, trying to be better.", "Kobe Bryant"),
    ("The successful warrior is the average man, with laser-like focus.", "Bruce Lee"),
    ("I fear not the man who has practiced 10,000 kicks once, but the man who has practiced one kick 10,000 times.", "Bruce Lee"),
    ("Excellence is not a singular act, but a habit.", "Shaquille O'Neal"),
    ("Some people want it to happen, some wish it would happen, others make it happen.", "Michael Jordan"),
    ("Gold medals aren't really made of gold. They're made of sweat, determination, and hard-to-find alloy called guts.", "Dan Gable"),
    ("The fight is won or lost far away from witnesses — behind the lines, in the gym, and out there on the road.", "Muhammad Ali"),
    ("I became a better investor because I am a businessman and a better businessman because I am an investor.", "Warren Buffett"),
    ("In investing, what is comfortable is rarely profitable.", "Robert Arnott"),
    ("Risk comes from not knowing what you're doing.", "Warren Buffett"),
    ("Be fearful when others are greedy and greedy when others are fearful.", "Warren Buffett"),
]


def _get_daily_quote() -> tuple:
    """Get a deterministic daily quote based on the date."""
    day_index = date.today().toordinal() % len(QUOTES)
    return QUOTES[day_index]


# ==================== TODOS ====================

@router.post("/todos", response_model=TodoResponse)
async def create_todo(payload: TodoCreate, db: Session = Depends(get_db)):
    """Create a todo and auto-classify to a pillar via LLM."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    todo_date = date.fromisoformat(payload.todo_date) if payload.todo_date else date.today()

    # Classify pillar via LLM
    pillar_id, confidence = await _classify_pillar(payload.text, db)

    todo = DailyTodo(
        user_id=user.id,
        todo_date=todo_date,
        text=payload.text,
        pillar_id=pillar_id,
        pillar_confidence=confidence,
        estimated_minutes=payload.estimated_minutes,
        sort_order=db.query(DailyTodo).filter(
            DailyTodo.user_id == user.id, DailyTodo.todo_date == todo_date
        ).count(),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return _todo_to_response(todo)


@router.get("/todos", response_model=list[TodoResponse])
def list_todos(todo_date: Optional[str] = None, db: Session = Depends(get_db)):
    """List todos for a date (defaults to today)."""
    user = db.query(User).first()
    if not user:
        return []

    d = date.fromisoformat(todo_date) if todo_date else date.today()
    todos = (
        db.query(DailyTodo)
        .filter(DailyTodo.user_id == user.id, DailyTodo.todo_date == d)
        .order_by(DailyTodo.completed, DailyTodo.sort_order)
        .all()
    )
    return [_todo_to_response(t) for t in todos]


@router.put("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(todo_id: int, payload: TodoUpdate, db: Session = Depends(get_db)):
    """Update a todo (text, pillar override, etc.)."""
    todo = db.query(DailyTodo).filter(DailyTodo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    if payload.text is not None:
        todo.text = payload.text
    if payload.pillar_id is not None:
        todo.pillar_id = payload.pillar_id
        todo.pillar_confidence = 1.0  # manual override = 100% confidence
    if payload.estimated_minutes is not None:
        todo.estimated_minutes = payload.estimated_minutes
    if payload.sort_order is not None:
        todo.sort_order = payload.sort_order

    db.commit()
    db.refresh(todo)
    return _todo_to_response(todo)


@router.post("/todos/{todo_id}/complete", response_model=TodoResponse)
def complete_todo(todo_id: int, db: Session = Depends(get_db)):
    """Mark a todo complete. Auto-creates a DailyEntry if pillar is set."""
    todo = db.query(DailyTodo).filter(DailyTodo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo.completed = not todo.completed
    todo.completed_at = datetime.utcnow() if todo.completed else None

    # Auto-create DailyEntry when completing a pillar-linked todo
    if todo.completed and todo.pillar_id and not todo.entry_id:
        entry = DailyEntry(
            user_id=todo.user_id,
            entry_date=todo.todo_date,
            description=todo.text,
            time_invested_minutes=todo.estimated_minutes or 30,
            pillar_tags=str(todo.pillar_id),
            suggested_pillar_tags=str(todo.pillar_id),
            difficulty_rating=5,  # default, can be adjusted
            energy_level=5,
            key_takeaway=f"Completed: {todo.text}",
        )
        db.add(entry)
        db.flush()
        todo.entry_id = entry.id

    # If un-completing, don't delete the entry (append-only)
    db.commit()
    db.refresh(todo)
    return _todo_to_response(todo)


@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.query(DailyTodo).filter(DailyTodo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
    return {"ok": True}


# ==================== HABITS ====================

@router.post("/habits", response_model=HabitResponse)
def create_habit(payload: HabitCreate, db: Session = Depends(get_db)):
    """Create a new daily habit."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    habit = DailyHabit(
        user_id=user.id,
        name=payload.name,
        icon=payload.icon,
        color=payload.color,
        sort_order=db.query(DailyHabit).filter(DailyHabit.user_id == user.id).count(),
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return _habit_to_response(habit, date.today(), db)


@router.get("/habits", response_model=list[HabitResponse])
def list_habits(db: Session = Depends(get_db)):
    """List all habits with today's completion status."""
    user = db.query(User).first()
    if not user:
        return []

    habits = (
        db.query(DailyHabit)
        .filter(DailyHabit.user_id == user.id, DailyHabit.is_active == True)
        .order_by(DailyHabit.sort_order)
        .all()
    )
    today = date.today()
    return [_habit_to_response(h, today, db) for h in habits]


@router.put("/habits/{habit_id}", response_model=HabitResponse)
def update_habit(habit_id: int, payload: HabitUpdate, db: Session = Depends(get_db)):
    habit = db.query(DailyHabit).filter(DailyHabit.id == habit_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    for field in ("name", "icon", "color", "is_active", "sort_order"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(habit, field, val)

    db.commit()
    db.refresh(habit)
    return _habit_to_response(habit, date.today(), db)


@router.post("/habits/{habit_id}/toggle")
def toggle_habit(habit_id: int, db: Session = Depends(get_db)):
    """Toggle today's habit completion. Updates streaks."""
    habit = db.query(DailyHabit).filter(DailyHabit.id == habit_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    today = date.today()
    existing = (
        db.query(DailyHabitLog)
        .filter(DailyHabitLog.habit_id == habit_id, DailyHabitLog.log_date == today)
        .first()
    )

    if existing:
        db.delete(existing)
        habit.total_completions = max(0, habit.total_completions - 1)
        # Recalculate streak
        habit.current_streak = _calc_streak(habit_id, today, db, exclude_today=True)
    else:
        db.add(DailyHabitLog(habit_id=habit_id, log_date=today, completed=True))
        habit.total_completions += 1
        habit.current_streak = _calc_streak(habit_id, today, db, exclude_today=False)
        if habit.current_streak > habit.longest_streak:
            habit.longest_streak = habit.current_streak

    db.commit()
    return _habit_to_response(habit, today, db)


@router.delete("/habits/{habit_id}")
def delete_habit(habit_id: int, db: Session = Depends(get_db)):
    habit = db.query(DailyHabit).filter(DailyHabit.id == habit_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    db.delete(habit)
    db.commit()
    return {"ok": True}


# ==================== DAILY SUMMARY ====================

@router.get("/summary", response_model=DailySummaryResponse)
async def get_daily_summary(db: Session = Depends(get_db)):
    """Get the full daily summary: quote, todos, habits, workout preview."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    today = date.today()
    quote_text, quote_author = _get_daily_quote()

    # Todos
    todos = (
        db.query(DailyTodo)
        .filter(DailyTodo.user_id == user.id, DailyTodo.todo_date == today)
        .order_by(DailyTodo.completed, DailyTodo.sort_order)
        .all()
    )

    # Habits
    habits = (
        db.query(DailyHabit)
        .filter(DailyHabit.user_id == user.id, DailyHabit.is_active == True)
        .order_by(DailyHabit.sort_order)
        .all()
    )

    # Workout preview
    workout_preview = None
    workout_day_type = None
    whoop_recovery = None
    try:
        from app.services.workout_generator import get_day_type_for_date
        workout_day_type = get_day_type_for_date(today)
        if workout_day_type == "rest":
            workout_preview = "Rest day. Active recovery."
        else:
            workout_preview = f"{workout_day_type.upper()} day"
    except Exception:
        pass

    try:
        from app.services.whoop import fetch_whoop_data
        whoop_data = await fetch_whoop_data()
        whoop_recovery = whoop_data.get("recovery_score")
    except Exception:
        pass

    return DailySummaryResponse(
        quote=quote_text,
        quote_author=quote_author,
        todos=[_todo_to_response(t) for t in todos],
        habits=[_habit_to_response(h, today, db) for h in habits],
        workout_preview=workout_preview,
        workout_day_type=workout_day_type,
        whoop_recovery=whoop_recovery,
    )


# ==================== HELPERS ====================

async def _classify_pillar(text: str, db: Session) -> tuple:
    """Use LLM to classify a todo into a pillar. Returns (pillar_id, confidence)."""
    pillars = db.query(Pillar).order_by(Pillar.display_order).all()
    pillar_list = "\n".join(f"{p.id}: {p.name} — {p.description or ''}" for p in pillars)

    prompt = f"""Classify this task into ONE of these pillars (or "none" if it doesn't fit):

{pillar_list}

Task: "{text}"

Respond with ONLY valid JSON: {{"pillar_id": <int or null>, "confidence": <0.0-1.0>}}
If the task is general/lifestyle (workout, errands, etc.), return {{"pillar_id": null, "confidence": 0.0}}"""

    try:
        from app.services.evaluation import call_clawdbot
        result = await call_clawdbot(
            "You classify tasks into learning pillars. Be precise. Only return JSON.",
            prompt,
        )
        content = result["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        parsed = json.loads(content)
        pid = parsed.get("pillar_id")
        conf = parsed.get("confidence", 0.5)
        # Validate pillar_id exists
        if pid is not None:
            valid_ids = {p.id for p in pillars}
            if pid not in valid_ids:
                return (None, 0.0)
        return (pid, conf)
    except Exception as e:
        logger.warning(f"Pillar classification failed: {e}")
        return (None, 0.0)


def _calc_streak(habit_id: int, today: date, db: Session, exclude_today: bool = False) -> int:
    """Calculate current streak for a habit."""
    from datetime import timedelta
    streak = 0
    check_date = today if not exclude_today else today - timedelta(days=1)

    while True:
        log = (
            db.query(DailyHabitLog)
            .filter(DailyHabitLog.habit_id == habit_id, DailyHabitLog.log_date == check_date)
            .first()
        )
        if not log:
            break
        streak += 1
        check_date -= timedelta(days=1)

    return streak


def _todo_to_response(todo: DailyTodo) -> TodoResponse:
    return TodoResponse(
        id=todo.id,
        text=todo.text,
        todo_date=todo.todo_date.isoformat(),
        pillar_id=todo.pillar_id,
        pillar_name=todo.pillar.name if todo.pillar else None,
        pillar_confidence=todo.pillar_confidence,
        completed=todo.completed,
        completed_at=todo.completed_at.isoformat() if todo.completed_at else None,
        entry_id=todo.entry_id,
        estimated_minutes=todo.estimated_minutes,
        sort_order=todo.sort_order,
    )


def _habit_to_response(habit: DailyHabit, today: date, db: Session) -> HabitResponse:
    completed_today = (
        db.query(DailyHabitLog)
        .filter(DailyHabitLog.habit_id == habit.id, DailyHabitLog.log_date == today)
        .first()
    ) is not None

    return HabitResponse(
        id=habit.id,
        name=habit.name,
        icon=habit.icon,
        color=habit.color,
        is_active=habit.is_active,
        current_streak=habit.current_streak,
        longest_streak=habit.longest_streak,
        total_completions=habit.total_completions,
        completed_today=completed_today,
        sort_order=habit.sort_order,
    )
