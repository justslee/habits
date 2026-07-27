"""Daily tab API — todos, habits, and daily summary (Phase 4+)."""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.daily_entry import DailyEntry
from app.models.daily_todo import DailyHabit, DailyHabitLog, DailyTodo
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.user import User
from app.schemas.daily import (
    DailySummaryResponse, HabitCreate, HabitResponse, HabitUpdate,
    TodoCreate, TodoResponse, TodoUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/daily", tags=["daily"])

# Daily rotating quotes — deliberately spread across the domains this app tracks
# (markets, mathematics, ML, engineering, communication, strategy) plus craft,
# philosophy, and a handful of athletes. Attributions are kept conservative:
# widely-misattributed lines (e.g. the Aristotle "excellence is a habit" paraphrase,
# which is Will Durant's) are credited to their actual source.
QUOTES = [
    # --- Mathematics & science ---
    ("What I cannot create, I do not understand.", "Richard Feynman"),
    ("The first principle is that you must not fool yourself — and you are the easiest person to fool.", "Richard Feynman"),
    ("Study hard what interests you the most, in the most undisciplined, irreverent and original manner possible.", "Richard Feynman"),
    ("In mathematics you don't understand things. You just get used to them.", "John von Neumann"),
    ("There's no sense in being precise when you don't even know what you're talking about.", "John von Neumann"),
    ("All models are wrong, but some are useful.", "George E. P. Box"),
    ("Far better an approximate answer to the right question than an exact answer to the wrong question.", "John Tukey"),
    ("The purpose of computing is insight, not numbers.", "Richard Hamming"),
    ("If you don't work on important problems, it's not likely that you'll do important work.", "Richard Hamming"),
    ("If you can't solve a problem, then there is an easier problem you can solve: find it.", "George Pólya"),
    ("Information is the resolution of uncertainty.", "Claude Shannon"),
    ("It is not knowledge, but the act of learning, that grants the greatest enjoyment.", "Carl Friedrich Gauss"),
    ("Progress is obtained naturally and cumulatively as a consequence of hard work.", "Terence Tao"),
    ("An equation for me has no meaning unless it expresses a thought of God.", "Srinivasa Ramanujan"),
    ("Invert, always invert.", "Carl Jacobi"),

    # --- Engineering & systems ---
    ("Premature optimization is the root of all evil.", "Donald Knuth"),
    ("Science is what we understand well enough to explain to a computer. Art is everything else we do.", "Donald Knuth"),
    ("Simplicity is prerequisite for reliability.", "Edsger Dijkstra"),
    ("Testing shows the presence, not the absence, of bugs.", "Edsger Dijkstra"),
    ("The competent programmer is fully aware of the limited size of his own skull.", "Edsger Dijkstra"),
    ("The most dangerous phrase in the language is: we've always done it this way.", "Grace Hopper"),
    ("Talk is cheap. Show me the code.", "Linus Torvalds"),
    ("The best way to predict the future is to invent it.", "Alan Kay"),
    ("Real artists ship.", "Steve Jobs"),
    ("Focus means saying no to the hundred other good ideas.", "Steve Jobs"),

    # --- Markets & decision-making ---
    ("Risk comes from not knowing what you're doing.", "Warren Buffett"),
    ("Be fearful when others are greedy and greedy when others are fearful.", "Warren Buffett"),
    ("In investing, what is comfortable is rarely profitable.", "Robert Arnott"),
    ("Spend each day trying to be a little wiser than you were when you woke up.", "Charlie Munger"),
    ("The big money is not in the buying and selling, but in the waiting.", "Charlie Munger"),
    ("It's not whether you're right or wrong that's important, but how much money you make when you're right.", "George Soros"),
    ("Pain plus reflection equals progress.", "Ray Dalio"),
    ("You can't predict. You can prepare.", "Howard Marks"),
    ("Know what you own, and know why you own it.", "Peter Lynch"),
    ("Be guided by beauty.", "Jim Simons"),
    ("The power to hurt is bargaining power. To exploit it is diplomacy.", "Thomas Schelling"),
    ("Play long-term games with long-term people.", "Naval Ravikant"),

    # --- Communication & performance ---
    ("It usually takes me more than three weeks to prepare a good impromptu speech.", "Mark Twain"),
    ("People will forget what you said and what you did, but never how you made them feel.", "Maya Angelou"),
    ("If you can't explain it simply, you don't understand it well enough.", "Attributed to Albert Einstein"),
    ("The first draft of anything is garbage.", "Ernest Hemingway"),
    ("Your taste is why your work disappoints you. Close the gap by doing a huge volume of work.", "Ira Glass"),

    # --- Craft & art ---
    ("Inspiration exists, but it has to find you working.", "Pablo Picasso"),
    ("Do not fear mistakes. There are none.", "Miles Davis"),
    ("You can play a shoestring if you're sincere.", "John Coltrane"),
    ("The best art divides the audience.", "Rick Rubin"),

    # --- Philosophy & discipline ---
    ("We suffer more often in imagination than in reality.", "Seneca"),
    ("It is not that we have a short time to live, but that we waste a lot of it.", "Seneca"),
    ("You have power over your mind — not outside events. Realize this, and you will find strength.", "Marcus Aurelius"),
    ("The impediment to action advances action. What stands in the way becomes the way.", "Marcus Aurelius"),
    ("Waste no more time arguing what a good man should be. Be one.", "Marcus Aurelius"),
    ("It is impossible for a man to learn what he thinks he already knows.", "Epictetus"),
    ("We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant, on Aristotle"),
    ("It is not enough to be busy. The question is: what are we busy about?", "Henry David Thoreau"),
    ("Suffer the pain of discipline or suffer the pain of regret.", "Jim Rohn"),

    # --- Athletes ---
    ("I can accept failure. Everyone fails at something. But I can't accept not trying.", "Michael Jordan"),
    ("Rest at the end, not in the middle.", "Kobe Bryant"),
    ("I fear not the man who has practiced 10,000 kicks once, but the man who has practiced one kick 10,000 times.", "Bruce Lee"),
    ("The fight is won or lost far away from witnesses — behind the lines, in the gym, and out there on the road.", "Muhammad Ali"),
    ("Who's gonna carry the boats?", "David Goggins"),
    ("I'm not the next Usain Bolt or Michael Phelps. I'm the first Simone Biles.", "Simone Biles"),
]


def _get_daily_quote() -> tuple:
    """Get a deterministic daily quote based on the date.

    QUOTES is grouped by domain, so walking it one-per-day would serve a fortnight
    of mathematicians followed by a week of engineers. Stepping by a stride that is
    coprime with the list length scatters consecutive days across domains while
    still visiting every quote exactly once per cycle.
    """
    stride = 23  # coprime with len(QUOTES); any coprime stride gives a full cycle
    day_index = (date.today().toordinal() * stride) % len(QUOTES)
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


@router.put("/todos/reorder")
def reorder_todos(payload: dict, db: Session = Depends(get_db)):
    """Reorder todos by providing an ordered list of IDs."""
    ids = payload.get("ids", [])
    for i, todo_id in enumerate(ids):
        todo = db.query(DailyTodo).filter(DailyTodo.id == todo_id).first()
        if todo:
            todo.sort_order = i
    db.commit()
    return {"ok": True}


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


@router.put("/habits/reorder")
def reorder_habits(payload: dict, db: Session = Depends(get_db)):
    """Reorder habits by providing an ordered list of IDs."""
    ids = payload.get("ids", [])
    for i, habit_id in enumerate(ids):
        habit = db.query(DailyHabit).filter(DailyHabit.id == habit_id).first()
        if habit:
            habit.sort_order = i
    db.commit()
    return {"ok": True}


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
        whoop_data = await fetch_whoop_data(user.id, db)
        whoop_recovery = whoop_data.get("recovery_score")
    except Exception:
        pass  # Whoop not connected / unavailable — summary works without it

    return DailySummaryResponse(
        quote=quote_text,
        quote_author=quote_author,
        todos=[_todo_to_response(t) for t in todos],
        habits=[_habit_to_response(h, today, db) for h in habits],
        workout_preview=workout_preview,
        workout_day_type=workout_day_type,
        whoop_recovery=whoop_recovery,
    )


# ==================== HABIT ANALYTICS (P5-6) ====================

@router.get("/habits/analytics")
def get_habit_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get habit analytics: completion rates, streaks, discipline score, correlations."""
    from datetime import timedelta
    from collections import defaultdict

    user = db.query(User).first()
    if not user:
        return {"habits": [], "discipline_score": 0, "weekly_grade": "F", "perfect_day_count": 0, "daily_map": {}}

    today = date.today()
    s_date = date.fromisoformat(start_date) if start_date else today - timedelta(days=30)
    e_date = date.fromisoformat(end_date) if end_date else today

    # Get all active habits
    habits = (
        db.query(DailyHabit)
        .filter(DailyHabit.user_id == user.id, DailyHabit.is_active == True)
        .order_by(DailyHabit.sort_order)
        .all()
    )

    if not habits:
        return {"habits": [], "discipline_score": 0, "weekly_grade": "F", "perfect_day_count": 0, "daily_map": {}}

    # Get all habit logs in range
    habit_ids = [h.id for h in habits]
    logs = (
        db.query(DailyHabitLog)
        .filter(
            DailyHabitLog.habit_id.in_(habit_ids),
            DailyHabitLog.log_date >= s_date,
            DailyHabitLog.log_date <= e_date,
        )
        .all()
    )

    # Build lookup: {habit_id: set(dates)}
    habit_dates: dict[int, set[date]] = defaultdict(set)
    for log in logs:
        habit_dates[log.habit_id].add(log.log_date)

    # Build daily completion map: {date_str: [habit_ids]}
    daily_map: dict[str, list[int]] = {}
    current = s_date
    total_days = 0
    perfect_days = 0
    while current <= e_date:
        total_days += 1
        completed_ids = [h.id for h in habits if current in habit_dates[h.id]]
        daily_map[current.isoformat()] = completed_ids
        if len(completed_ids) == len(habits):
            perfect_days += 1
        current += timedelta(days=1)

    # Per-habit analytics
    total_possible = total_days
    habit_analytics = []
    for h in habits:
        completed_dates = habit_dates[h.id]
        completions_in_range = len([d for d in completed_dates if s_date <= d <= e_date])

        # Rolling completion rates
        last_7 = sum(1 for d in completed_dates if d > today - timedelta(days=7))
        last_30 = sum(1 for d in completed_dates if d > today - timedelta(days=30))

        habit_analytics.append({
            "id": h.id,
            "name": h.name,
            "icon": h.icon,
            "color": h.color,
            "total_completions": completions_in_range,
            "completion_rate": round(completions_in_range / max(total_possible, 1) * 100, 1),
            "rate_7d": round(last_7 / min(7, total_possible) * 100, 1),
            "rate_30d": round(last_30 / min(30, total_possible) * 100, 1),
            "current_streak": h.current_streak,
            "longest_streak": h.longest_streak,
        })

    # Overall discipline score
    total_completions = sum(h["total_completions"] for h in habit_analytics)
    total_possible_all = total_possible * len(habits)
    discipline_score = round(total_completions / max(total_possible_all, 1) * 100, 1)

    # Letter grade
    if discipline_score >= 90: grade = "A"
    elif discipline_score >= 80: grade = "B"
    elif discipline_score >= 70: grade = "C"
    elif discipline_score >= 60: grade = "D"
    else: grade = "F"

    return {
        "habits": habit_analytics,
        "discipline_score": discipline_score,
        "weekly_grade": grade,
        "perfect_day_count": perfect_days,
        "total_days": total_days,
        "daily_map": daily_map,
    }


# ==================== END-OF-DAY EVALUATION ====================

@router.post("/end-of-day")
async def end_of_day_evaluation(db: Session = Depends(get_db)):
    """Consolidate all completed todos into ONE overall AI evaluation for the day.

    Gathers all completed pillar-linked todos for today, combines with the
    daily reflection (focus, energy, takeaway), and runs a single holistic
    evaluation across all pillars.
    """
    from app.services.evaluation import evaluate_overall_day

    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    today = date.today()

    # 1. Get all completed todos with pillars for today
    completed_todos = (
        db.query(DailyTodo)
        .filter(
            DailyTodo.user_id == user.id,
            DailyTodo.todo_date == today,
            DailyTodo.completed == True,
            DailyTodo.pillar_id.isnot(None),
        )
        .all()
    )

    if not completed_todos:
        return {"evaluated": 0, "message": "No completed pillar-linked todos today."}

    # 2. Get today's daily reflection (entry with no pillar tags = reflection)
    reflection = (
        db.query(DailyEntry)
        .filter(
            DailyEntry.user_id == user.id,
            DailyEntry.entry_date == today,
            DailyEntry.deleted_at.is_(None),
            (DailyEntry.pillar_tags.is_(None)) | (DailyEntry.pillar_tags == ""),
        )
        .order_by(DailyEntry.created_at.desc())
        .first()
    )

    reflection_focus = reflection.difficulty_rating if reflection else None
    reflection_energy = reflection.energy_level if reflection else None
    reflection_takeaway = reflection.key_takeaway if reflection else None

    # 3. Check if already evaluated today (any entry with pillar tags + evaluation)
    already_evaluated_entry = (
        db.query(DailyEntry)
        .join(Evaluation, Evaluation.entry_id == DailyEntry.id)
        .filter(
            DailyEntry.user_id == user.id,
            DailyEntry.entry_date == today,
            DailyEntry.deleted_at.is_(None),
            DailyEntry.pillar_tags.isnot(None),
            DailyEntry.pillar_tags != "",
            Evaluation.deleted_at.is_(None),
        )
        .first()
    )

    # Build pillars_touched from actual todos (always needed for response)
    pillar_todos_map: dict[int, list[DailyTodo]] = {}
    for todo in completed_todos:
        pillar_todos_map.setdefault(todo.pillar_id, []).append(todo)

    all_pillar_ids = list(pillar_todos_map.keys())
    pillar_objs = {p.id: p for p in db.query(Pillar).filter(Pillar.id.in_(all_pillar_ids)).all()}
    total_minutes = sum(t.estimated_minutes or 30 for t in completed_todos)

    pillars_touched = [
        {
            "pillar_name": pillar_objs[pid].name if pid in pillar_objs else f"Pillar {pid}",
            "time_invested_minutes": sum(t.estimated_minutes or 30 for t in todos),
        }
        for pid, todos in pillar_todos_map.items()
    ]

    if already_evaluated_entry:
        eval_obj = already_evaluated_entry.evaluation
        return {
            "evaluated": 1,
            "result": {
                "depth_score": eval_obj.depth_score,
                "one_percent_better": eval_obj.one_percent_better,
                "verdict_explanation": eval_obj.verdict_explanation,
                "commentary": eval_obj.commentary,
                "pillars_touched": pillars_touched,
                "total_time_minutes": total_minutes,
            },
            "reflection_applied": reflection is not None,
        }

    # 4. Build pillar summaries for the overall prompt
    pillar_summaries = [
        {
            "pillar_id": pid,
            "pillar_name": pillar_objs[pid].name if pid in pillar_objs else f"Pillar {pid}",
            "depth_target": pillar_objs[pid].depth_target if pid in pillar_objs else "unspecified",
            "time_minutes": sum(t.estimated_minutes or 30 for t in todos),
            "todos": "; ".join(t.text for t in todos),
        }
        for pid, todos in pillar_todos_map.items()
    ]

    # 5. Create one combined DailyEntry covering all pillars
    combined_description = " | ".join(
        f"{ps['pillar_name']}: {ps['todos']}" for ps in pillar_summaries
    )

    entry = None
    for todo in completed_todos:
        if todo.entry_id:
            candidate = db.query(DailyEntry).filter(
                DailyEntry.id == todo.entry_id,
                DailyEntry.deleted_at.is_(None),
            ).first()
            if candidate and not candidate.evaluation:
                entry = candidate
                break

    if not entry:
        entry = DailyEntry(
            user_id=user.id,
            entry_date=today,
            description=combined_description,
            time_invested_minutes=total_minutes,
            difficulty_rating=reflection_focus or 5,
            energy_level=reflection_energy or 5,
            key_takeaway=reflection_takeaway or f"Completed {len(completed_todos)} tasks across {len(pillar_summaries)} pillars",
        )
        entry.pillar_tag_list = all_pillar_ids
        db.add(entry)
        db.flush()
    else:
        entry.description = combined_description
        entry.time_invested_minutes = total_minutes
        entry.pillar_tag_list = all_pillar_ids
        if reflection_focus:
            entry.difficulty_rating = reflection_focus
        if reflection_energy:
            entry.energy_level = reflection_energy
        if reflection_takeaway:
            entry.key_takeaway = reflection_takeaway
        db.flush()

    # 6. Run ONE overall AI evaluation
    try:
        evaluation = await evaluate_overall_day(entry, pillar_summaries, db)
    except Exception as e:
        logger.error(f"End-of-day overall evaluation failed: {e}")
        return {
            "evaluated": 0,
            "results": [],
            "reflection_applied": reflection is not None,
        }

    # Auto-trigger weekly review on Sundays
    weekly_review = None
    if today.weekday() == 6:  # Sunday
        try:
            from app.services.weekly_review import generate_weekly_review, get_current_week_bounds
            ws, we = get_current_week_bounds(today)
            review = await generate_weekly_review(user.id, ws, we, db)
            weekly_review = {
                "letter_grade": review.letter_grade,
                "grade_justification": review.grade_justification,
                "recommendations": review.recommendations,
            }
        except Exception as e:
            logger.error(f"Sunday weekly review generation failed: {e}")

    return {
        "evaluated": 1,
        "result": {
            "depth_score": evaluation.depth_score,
            "one_percent_better": evaluation.one_percent_better,
            "verdict_explanation": evaluation.verdict_explanation,
            "commentary": evaluation.commentary,
            "pillars_touched": pillars_touched,
            "total_time_minutes": total_minutes,
        },
        "reflection_applied": reflection is not None,
        "weekly_review": weekly_review,
    }


# ==================== HELPERS ====================

CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "pillar_id": {"type": "integer", "description": "Pillar ID or 0 if no pillar fits"},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": ["pillar_id", "confidence"],
}


async def _classify_pillar(text: str, db: Session) -> tuple:
    """Use Haiku to classify a todo into a pillar. Returns (pillar_id, confidence)."""
    from app.services.llm import HAIKU, structured_output

    pillars = db.query(Pillar).order_by(Pillar.display_order).all()
    pillar_list = "\n".join(f"{p.id}: {p.name} — {p.description or ''}" for p in pillars)

    prompt = f"""Classify this task into ONE of these pillars (or pillar_id=0 if it doesn't fit):

{pillar_list}

Task: "{text}"

If the task is a general "Life" task — errands, chores, admin, appointments,
workouts, anything that doesn't ladder up to a learning pillar — return
pillar_id=0 with confidence=0.0. Don't force a weak pillar match; "Life" is a
first-class, valid answer."""

    try:
        parsed = await structured_output(
            system="You classify tasks into learning pillars. Be precise.",
            user_prompt=prompt,
            tool_name="submit_classification",
            tool_description="Submit the pillar classification with confidence score.",
            output_schema=CLASSIFY_SCHEMA,
            model=HAIKU,
        )
        pid = parsed.get("pillar_id")
        conf = parsed.get("confidence", 0.5)
        # pillar_id=0 means no pillar
        if pid == 0:
            return (None, 0.0)
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
