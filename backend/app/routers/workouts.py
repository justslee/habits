"""Workout API endpoints — Phase 2."""

from __future__ import annotations

import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession
from app.schemas.workout import (
    ChatMessage,
    ChatResponse,
    ExerciseLogCreate,
    ExerciseLogResponse,
    ExerciseProfileResponse,
    WorkoutSessionCreate,
    WorkoutSessionResponse,
)
from app.services.progressive_overload import update_profile_after_session
from app.services.workout_chat import process_chat_message
from app.services.workout_generator import generate_workout_plan, get_day_type_for_date

router = APIRouter(prefix="/api/v1/workouts", tags=["workouts"])


def _session_to_response(session: WorkoutSession) -> WorkoutSessionResponse:
    return WorkoutSessionResponse(
        id=session.id,
        session_date=session.session_date.isoformat(),
        day_type=session.day_type,
        status=session.status,
        whoop_recovery_score=session.whoop_recovery_score,
        whoop_hrv=session.whoop_hrv,
        whoop_resting_hr=session.whoop_resting_hr,
        whoop_sleep_score=session.whoop_sleep_score,
        ai_plan=session.ai_plan,
        coach_notes=session.coach_notes,
        overall_rpe=session.overall_rpe,
        exercises=[
            ExerciseLogResponse(
                id=e.id,
                exercise_name=e.exercise_name,
                exercise_order=e.exercise_order,
                set_number=e.set_number,
                weight=e.weight,
                reps=e.reps,
                rpe=e.rpe,
                is_warmup=e.is_warmup,
                notes=e.notes,
                duration_minutes=e.duration_minutes,
                distance_miles=e.distance_miles,
            )
            for e in session.exercises
        ],
    )


@router.post("/", response_model=WorkoutSessionResponse)
def create_workout_session(
    payload: WorkoutSessionCreate,
    db: Session = Depends(get_db),
):
    """Create a workout session with exercise logs."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    session_date = (
        date.fromisoformat(payload.session_date)
        if payload.session_date
        else date.today()
    )

    session = WorkoutSession(
        user_id=user.id,
        session_date=session_date,
        day_type=payload.day_type,
        overall_rpe=payload.overall_rpe,
        status="completed" if payload.exercises else "planned",
    )
    db.add(session)
    db.flush()

    for i, ex in enumerate(payload.exercises):
        log = ExerciseLog(
            session_id=session.id,
            exercise_name=ex.exercise_name,
            exercise_order=i,
            set_number=ex.set_number,
            weight=ex.weight,
            reps=ex.reps,
            rpe=ex.rpe,
            is_warmup=ex.is_warmup,
            notes=ex.notes,
            duration_minutes=ex.duration_minutes,
            distance_miles=ex.distance_miles,
        )
        db.add(log)

    db.commit()
    db.refresh(session)

    # Update exercise profiles
    _update_profiles_from_session(session, db)

    return _session_to_response(session)


@router.get("/", response_model=list[WorkoutSessionResponse])
def list_workout_sessions(
    limit: int = 20,
    day_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List workout sessions, newest first."""
    user = db.query(User).first()
    if not user:
        return []

    q = db.query(WorkoutSession).filter(WorkoutSession.user_id == user.id)
    if day_type:
        q = q.filter(WorkoutSession.day_type == day_type)
    sessions = q.order_by(WorkoutSession.session_date.desc()).limit(limit).all()
    return [_session_to_response(s) for s in sessions]


@router.get("/today", response_model=Optional[WorkoutSessionResponse])
async def get_today_plan(db: Session = Depends(get_db)):
    """Get or generate today's workout plan."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    today = date.today()
    day_type = get_day_type_for_date(today)

    # Check for existing session
    existing = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.session_date == today,
        )
        .first()
    )
    if existing:
        return _session_to_response(existing)

    # Generate plan
    plan = await generate_workout_plan(user.id, day_type, None, db)

    session = WorkoutSession(
        user_id=user.id,
        session_date=today,
        day_type=day_type,
        ai_plan=json.dumps(plan),
        coach_notes=plan.get("coach_notes"),
        status="planned",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return _session_to_response(session)


@router.get("/{session_id}", response_model=WorkoutSessionResponse)
def get_workout_session(session_id: int, db: Session = Depends(get_db)):
    """Get a single workout session with all exercises."""
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_response(session)


@router.post("/{session_id}/exercises", response_model=ExerciseLogResponse)
def add_exercise_log(
    session_id: int,
    payload: ExerciseLogCreate,
    db: Session = Depends(get_db),
):
    """Log an individual set to an existing session."""
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get next exercise order
    max_order = max((e.exercise_order for e in session.exercises), default=-1)
    same_exercise = [e for e in session.exercises if e.exercise_name == payload.exercise_name]
    order = same_exercise[0].exercise_order if same_exercise else max_order + 1

    log = ExerciseLog(
        session_id=session.id,
        exercise_name=payload.exercise_name,
        exercise_order=order,
        set_number=payload.set_number,
        weight=payload.weight,
        reps=payload.reps,
        rpe=payload.rpe,
        is_warmup=payload.is_warmup,
        notes=payload.notes,
        duration_minutes=payload.duration_minutes,
        distance_miles=payload.distance_miles,
    )
    db.add(log)
    session.status = "in_progress"
    db.commit()
    db.refresh(log)

    return ExerciseLogResponse(
        id=log.id,
        exercise_name=log.exercise_name,
        exercise_order=log.exercise_order,
        set_number=log.set_number,
        weight=log.weight,
        reps=log.reps,
        rpe=log.rpe,
        is_warmup=log.is_warmup,
        notes=log.notes,
        duration_minutes=log.duration_minutes,
        distance_miles=log.distance_miles,
    )


@router.post("/{session_id}/chat", response_model=ChatResponse)
async def chat_with_coach(
    session_id: int,
    payload: ChatMessage,
    db: Session = Depends(get_db),
):
    """Send a message during a live workout and get coach feedback."""
    session = db.query(WorkoutSession).filter(WorkoutSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await process_chat_message(session, payload.message, db)

    return ChatResponse(
        coach_response=result["coach_response"],
        parsed_sets=[
            ExerciseLogCreate(
                exercise_name=s["exercise_name"],
                set_number=s["set_number"],
                weight=s.get("weight"),
                reps=s.get("reps"),
            )
            for s in result["parsed_sets"]
        ],
        session_summary=result.get("session_summary"),
    )


# Exercise profiles

@router.get("/exercises/profiles", response_model=list[ExerciseProfileResponse])
def list_exercise_profiles(db: Session = Depends(get_db)):
    """List all exercise profiles."""
    user = db.query(User).first()
    if not user:
        return []
    profiles = (
        db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user.id)
        .order_by(ExerciseProfile.muscle_group, ExerciseProfile.exercise_name)
        .all()
    )
    return [ExerciseProfileResponse.model_validate(p) for p in profiles]


@router.get("/exercises/{exercise_name}/history")
def get_exercise_history(
    exercise_name: str,
    limit: int = 30,
    db: Session = Depends(get_db),
):
    """Get workout history for a specific exercise."""
    user = db.query(User).first()
    if not user:
        return []

    logs = (
        db.query(ExerciseLog, WorkoutSession.session_date)
        .join(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            ExerciseLog.exercise_name == exercise_name,
            ExerciseLog.is_warmup == False,
        )
        .order_by(WorkoutSession.session_date.desc())
        .limit(limit * 5)
        .all()
    )

    # Group by session date
    from collections import OrderedDict
    from app.services.progressive_overload import estimate_1rm

    sessions: dict = OrderedDict()
    for log, session_date in logs:
        d = session_date.isoformat()
        if d not in sessions:
            sessions[d] = {"date": d, "sets": [], "total_volume": 0, "best_e1rm": 0}
        sessions[d]["sets"].append({
            "set_number": log.set_number,
            "weight": log.weight,
            "reps": log.reps,
            "rpe": log.rpe,
        })
        sessions[d]["total_volume"] += log.volume_load
        e1rm = estimate_1rm(log.weight or 0, log.reps or 0)
        if e1rm > sessions[d]["best_e1rm"]:
            sessions[d]["best_e1rm"] = e1rm

    return list(sessions.values())[:limit]


@router.get("/exercises/volume-summary")
def get_volume_summary(db: Session = Depends(get_db)):
    """Get weekly volume by muscle group."""
    user = db.query(User).first()
    if not user:
        return []

    from app.services.progressive_overload import get_weekly_volume
    groups = ["push", "pull", "legs"]
    return [get_weekly_volume(user.id, g, db) for g in groups]


def _update_profiles_from_session(session: WorkoutSession, db: Session) -> None:
    """Update exercise profiles based on completed session data."""
    if not session.exercises:
        return

    exercise_names = set(e.exercise_name for e in session.exercises if not e.is_warmup)
    for name in exercise_names:
        profile = (
            db.query(ExerciseProfile)
            .filter(
                ExerciseProfile.user_id == session.user_id,
                ExerciseProfile.exercise_name == name,
            )
            .first()
        )
        if profile:
            session_logs = [e for e in session.exercises if e.exercise_name == name]
            update_profile_after_session(profile, session_logs, db)
