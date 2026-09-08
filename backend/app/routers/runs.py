"""Run tracking API endpoints — Phase 3."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.run import PersonalRecord, PlannedRun, RunSegmentLog, RunSession, RunSplit, TrainingPlan
from app.models.user import User
from app.schemas.run import (
    PersonalRecordResponse,
    PlannedRunResponse,
    PostRunFeedbackResponse,
    RunSessionCreate,
    RunSessionResponse,
    RunSplitResponse,
    RunStatsResponse,
    TodayRunResponse,
    TrainingPlanCreate,
    TrainingPlanResponse,
)

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])

# Standard PR distances in miles
PR_DISTANCES = {
    "mile": 1.0,
    "5k": 3.107,
    "10k": 6.214,
    "half_marathon": 13.109,
    "marathon": 26.219,
}


def _run_to_response(run: RunSession) -> RunSessionResponse:
    return RunSessionResponse(
        id=run.id,
        run_date=run.run_date.isoformat(),
        distance_miles=run.distance_miles,
        duration_seconds=run.duration_seconds,
        avg_pace_seconds=run.avg_pace_seconds,
        avg_pace_formatted=run.avg_pace_formatted,
        duration_formatted=run.duration_formatted,
        elevation_gain_ft=run.elevation_gain_ft,
        run_type=run.run_type,
        weather=run.weather,
        rpe=run.rpe,
        notes=run.notes,
        ai_feedback=run.ai_feedback,
        status=run.status,
        splits=[
            RunSplitResponse(
                id=s.id,
                mile_number=s.mile_number,
                pace_seconds=s.pace_seconds,
                pace_formatted=s.pace_formatted,
                elevation_change_ft=s.elevation_change_ft,
                avg_heart_rate=s.avg_heart_rate,
            )
            for s in run.splits
        ],
    )


@router.post("/", response_model=RunSessionResponse)
def create_run(payload: RunSessionCreate, db: Session = Depends(get_db)):
    """Save a manually-logged completed run with optional per-mile splits."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    run_date = date.fromisoformat(payload.run_date) if payload.run_date else date.today()

    # Calculate avg pace
    avg_pace = None
    if payload.distance_miles > 0:
        avg_pace = int(payload.duration_seconds / payload.distance_miles)

    run = RunSession(
        user_id=user.id,
        run_date=run_date,
        distance_miles=round(payload.distance_miles, 2),
        duration_seconds=payload.duration_seconds,
        avg_pace_seconds=avg_pace,
        elevation_gain_ft=payload.elevation_gain_ft,
        run_type=payload.run_type,
        weather=payload.weather,
        rpe=payload.rpe,
        notes=payload.notes,
        status="completed",
    )
    db.add(run)
    db.flush()

    for split in payload.splits:
        db.add(RunSplit(
            run_id=run.id,
            mile_number=split.mile_number,
            pace_seconds=split.pace_seconds,
            elevation_change_ft=split.elevation_change_ft,
            avg_heart_rate=split.avg_heart_rate,
        ))

    db.commit()
    db.refresh(run)

    # Check for PRs
    _check_and_update_prs(run, db)

    # Adaptive plan: mark planned run done, check A:C, adjust paces/volume
    try:
        planned = db.query(PlannedRun).filter(
            PlannedRun.plan_id.in_(
                db.query(TrainingPlan.id).filter(
                    TrainingPlan.user_id == user.id,
                    TrainingPlan.status == "active",
                )
            ),
            PlannedRun.planned_date == run_date,
            PlannedRun.status == "upcoming",
        ).first()

        # Back-link the run to the plan it fulfilled. Without this, run.planned_run_id
        # stays NULL forever, which silently disables the plan-vs-actual comparison in
        # generate_feedback() and the pace-trend join in run_plan_adapter.
        if planned:
            run.planned_run_id = planned.id
            db.commit()

        from app.services.run_plan_adapter import adapt_plan_after_run
        adapt_plan_after_run(user.id, run, planned, db)
    except Exception:
        pass  # Never fail the run save due to adaptation errors

    return _run_to_response(run)


@router.get("/", response_model=list[RunSessionResponse])
def list_runs(
    limit: int = 20,
    run_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List runs, newest first."""
    user = db.query(User).first()
    if not user:
        return []

    q = db.query(RunSession).filter(
        RunSession.user_id == user.id,
        RunSession.deleted_at.is_(None),
    )
    if run_type:
        q = q.filter(RunSession.run_type == run_type)
    runs = q.order_by(RunSession.run_date.desc()).limit(limit).all()
    return [_run_to_response(r) for r in runs]


@router.get("/stats", response_model=RunStatsResponse)
def get_run_stats(db: Session = Depends(get_db)):
    """Get running statistics."""
    user = db.query(User).first()
    if not user:
        return RunStatsResponse(
            total_runs=0, total_miles=0, total_time_seconds=0,
            avg_pace_seconds=None, this_week_miles=0, this_month_miles=0,
            longest_run_miles=0, fastest_pace_seconds=None,
        )

    runs = db.query(RunSession).filter(
        RunSession.user_id == user.id,
        RunSession.status == "completed",
        RunSession.deleted_at.is_(None),
    ).all()

    if not runs:
        return RunStatsResponse(
            total_runs=0, total_miles=0, total_time_seconds=0,
            avg_pace_seconds=None, this_week_miles=0, this_month_miles=0,
            longest_run_miles=0, fastest_pace_seconds=None,
        )

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    total_miles = sum(r.distance_miles for r in runs)
    total_time = sum(r.duration_seconds for r in runs)
    avg_pace = int(total_time / total_miles) if total_miles > 0 else None

    return RunStatsResponse(
        total_runs=len(runs),
        total_miles=round(total_miles, 2),
        total_time_seconds=total_time,
        avg_pace_seconds=avg_pace,
        this_week_miles=round(
            sum(r.distance_miles for r in runs if r.run_date >= week_start), 2
        ),
        this_month_miles=round(
            sum(r.distance_miles for r in runs if r.run_date >= month_start), 2
        ),
        longest_run_miles=round(max(r.distance_miles for r in runs), 2),
        fastest_pace_seconds=min(
            (r.avg_pace_seconds for r in runs if r.avg_pace_seconds),
            default=None,
        ),
    )


@router.get("/prs", response_model=list[PersonalRecordResponse])
def get_prs(db: Session = Depends(get_db)):
    """Get personal records."""
    user = db.query(User).first()
    if not user:
        return []

    prs = (
        db.query(PersonalRecord)
        .filter(PersonalRecord.user_id == user.id)
        .order_by(PersonalRecord.distance_label)
        .all()
    )
    return [
        PersonalRecordResponse(
            id=pr.id,
            distance_label=pr.distance_label,
            time_seconds=pr.time_seconds,
            time_formatted=pr.time_formatted,
            record_date=pr.record_date.isoformat(),
        )
        for pr in prs
    ]


# --- Training Plan Endpoints (Phase 4) ---

@router.post("/plans", response_model=TrainingPlanResponse)
async def create_training_plan(
    payload: TrainingPlanCreate, db: Session = Depends(get_db)
):
    """Create a new training plan via AI coach."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    # Deactivate existing plans
    existing = db.query(TrainingPlan).filter(
        TrainingPlan.user_id == user.id, TrainingPlan.status == "active"
    ).all()
    for p in existing:
        p.status = "abandoned"

    from app.services.run_coach import generate_training_plan, create_plan_from_ai

    target_date = date.fromisoformat(payload.target_race_date) if payload.target_race_date else None
    available = [int(d) for d in payload.available_days.split(",")] if payload.available_days else [1, 4, 6]

    plan_data = await generate_training_plan(
        user.id, payload.goal_type, payload.fitness_level, available, target_date, db
    )

    plan = create_plan_from_ai(
        user.id, plan_data, payload.goal_type, payload.fitness_level,
        payload.available_days, target_date, db
    )

    return _plan_to_response(plan)


@router.get("/plans/active", response_model=Optional[TrainingPlanResponse])
def get_active_plan(db: Session = Depends(get_db)):
    """Get the active training plan."""
    user = db.query(User).first()
    if not user:
        return None

    plan = db.query(TrainingPlan).filter(
        TrainingPlan.user_id == user.id, TrainingPlan.status == "active"
    ).first()

    if not plan:
        return None
    return _plan_to_response(plan)


@router.get("/plans/{plan_id}/week/{week_num}", response_model=list[PlannedRunResponse])
def get_plan_week(plan_id: int, week_num: int, db: Session = Depends(get_db)):
    """Get planned runs for a specific week."""
    runs = db.query(PlannedRun).filter(
        PlannedRun.plan_id == plan_id, PlannedRun.week_number == week_num
    ).order_by(PlannedRun.day_of_week).all()
    return [_planned_run_to_response(r) for r in runs]


@router.get("/today-plan", response_model=TodayRunResponse)
async def get_today_plan(db: Session = Depends(get_db)):
    """Get today's planned run (if any).

    Skips the run plan if:
    - Today already has a completed (non-run) workout session
    - Today's schedule type doesn't include cardio/running
    """
    from app.models.workout import WorkoutSession as WS

    user = db.query(User).first()
    if not user:
        return TodayRunResponse(has_planned_run=False)

    today = date.today()

    # If there's already a completed workout today, don't suggest a run
    existing_workout = db.query(WS).filter(
        WS.user_id == user.id,
        WS.session_date == today,
        WS.status == "completed",
    ).first()
    if existing_workout:
        return TodayRunResponse(has_planned_run=False)

    plan = db.query(TrainingPlan).filter(
        TrainingPlan.user_id == user.id, TrainingPlan.status == "active"
    ).first()

    if not plan:
        return TodayRunResponse(has_planned_run=False)

    planned = db.query(PlannedRun).filter(
        PlannedRun.plan_id == plan.id,
        PlannedRun.planned_date == today,
        PlannedRun.status == "upcoming",
    ).first()

    if not planned:
        return TodayRunResponse(has_planned_run=False)

    return TodayRunResponse(
        has_planned_run=True,
        planned_run=_planned_run_to_response(planned),
        plan_name=f"{plan.goal_type.replace('_', ' ').title()} Plan",
        week_number=plan.current_week,
        total_weeks=plan.total_weeks,
    )


@router.post("/{run_id}/feedback", response_model=PostRunFeedbackResponse)
async def generate_feedback(run_id: int, db: Session = Depends(get_db)):
    """Generate AI post-run feedback."""
    run = db.query(RunSession).filter(
        RunSession.id == run_id,
        RunSession.deleted_at.is_(None),
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    planned = None
    if run.planned_run_id:
        planned = db.query(PlannedRun).filter(PlannedRun.id == run.planned_run_id).first()

    from app.services.run_coach import generate_post_run_feedback, detect_personal_records

    feedback = await generate_post_run_feedback(run, planned, db)
    run.ai_feedback = feedback
    db.commit()

    prs = detect_personal_records(run, run.user_id, db)

    return PostRunFeedbackResponse(
        feedback=feedback,
        is_pr=len(prs) > 0,
        pr_type=prs[0]["distance_label"] if prs else None,
    )


def _plan_to_response(plan: TrainingPlan) -> TrainingPlanResponse:
    return TrainingPlanResponse(
        id=plan.id, goal_type=plan.goal_type, fitness_level=plan.fitness_level,
        start_date=plan.start_date.isoformat(),
        end_date=plan.end_date.isoformat() if plan.end_date else None,
        current_week=plan.current_week, total_weeks=plan.total_weeks,
        status=plan.status, available_days=plan.available_days,
        target_race_date=plan.target_race_date.isoformat() if plan.target_race_date else None,
        planned_runs=[_planned_run_to_response(r) for r in plan.planned_runs],
    )


def _planned_run_to_response(r: PlannedRun) -> PlannedRunResponse:
    return PlannedRunResponse(
        id=r.id, week_number=r.week_number, day_of_week=r.day_of_week,
        planned_date=r.planned_date.isoformat() if r.planned_date else None,
        run_type=r.run_type, target_distance_miles=r.target_distance_miles,
        target_pace_seconds=r.target_pace_seconds,
        target_duration_minutes=r.target_duration_minutes,
        description=r.description, structure=r.structure,
        completed_run_id=r.completed_run_id, status=r.status,
    )


@router.get("/{run_id}", response_model=RunSessionResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    """Get a single run with splits."""
    run = db.query(RunSession).filter(
        RunSession.id == run_id,
        RunSession.deleted_at.is_(None),
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_response(run)


@router.delete("/{run_id}", status_code=200)
def soft_delete_run(run_id: int, db: Session = Depends(get_db)):
    """Soft-delete a run session and cascade to splits + segments (D-019, P5-5)."""
    run = db.query(RunSession).filter(
        RunSession.id == run_id,
        RunSession.deleted_at.is_(None),
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    now = datetime.utcnow()
    run.deleted_at = now

    # Cascade to splits
    for split in run.splits:
        split.deleted_at = now

    # Cascade to segment logs
    segments = db.query(RunSegmentLog).filter(RunSegmentLog.run_id == run_id).all()
    for seg in segments:
        seg.deleted_at = now

    # If this run held a PR, recalculate PRs
    prs_from_this_run = db.query(PersonalRecord).filter(
        PersonalRecord.run_id == run_id
    ).all()
    if prs_from_this_run:
        _recalculate_prs_after_delete(run, prs_from_this_run, db)

    db.commit()
    return {"detail": "Run deleted", "id": run_id}


@router.post("/{run_id}/restore", response_model=RunSessionResponse)
def restore_run(run_id: int, db: Session = Depends(get_db)):
    """Restore a soft-deleted run session and its splits + segments."""
    run = db.query(RunSession).filter(
        RunSession.id == run_id,
        RunSession.deleted_at.isnot(None),
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Deleted run not found")

    run.deleted_at = None
    for split in run.splits:
        split.deleted_at = None

    segments = db.query(RunSegmentLog).filter(RunSegmentLog.run_id == run_id).all()
    for seg in segments:
        seg.deleted_at = None

    db.commit()
    db.refresh(run)

    # Re-check PRs since this run is back
    _check_and_update_prs(run, db)

    return _run_to_response(run)


def _recalculate_prs_after_delete(
    deleted_run: RunSession,
    affected_prs: list[PersonalRecord],
    db: Session,
) -> None:
    """Recalculate PRs when a run that held records is deleted."""
    for pr in affected_prs:
        label = pr.distance_label
        dist = PR_DISTANCES.get(label)
        if not dist:
            db.delete(pr)
            continue

        # Find next best run for this distance
        best_run = (
            db.query(RunSession)
            .filter(
                RunSession.user_id == deleted_run.user_id,
                RunSession.id != deleted_run.id,
                RunSession.deleted_at.is_(None),
                RunSession.status == "completed",
                RunSession.distance_miles >= dist,
                RunSession.avg_pace_seconds.isnot(None),
            )
            .order_by(RunSession.avg_pace_seconds.asc())
            .first()
        )
        if best_run:
            pr.time_seconds = int(best_run.avg_pace_seconds * dist)
            pr.record_date = best_run.run_date
            pr.run_id = best_run.id
        else:
            db.delete(pr)


def _check_and_update_prs(run: RunSession, db: Session) -> list[str]:
    """Check if this run set any new PRs. Returns list of PR labels set."""
    new_prs = []
    for label, dist in PR_DISTANCES.items():
        if run.distance_miles >= dist:
            # Estimate time for this distance based on avg pace
            if run.avg_pace_seconds:
                estimated_time = int(run.avg_pace_seconds * dist)
            else:
                continue

            existing = (
                db.query(PersonalRecord)
                .filter(
                    PersonalRecord.user_id == run.user_id,
                    PersonalRecord.distance_label == label,
                )
                .first()
            )

            if not existing or estimated_time < existing.time_seconds:
                if existing:
                    existing.time_seconds = estimated_time
                    existing.record_date = run.run_date
                    existing.run_id = run.id
                else:
                    db.add(PersonalRecord(
                        user_id=run.user_id,
                        run_id=run.id,
                        distance_label=label,
                        time_seconds=estimated_time,
                        record_date=run.run_date,
                    ))
                new_prs.append(label)

    if new_prs:
        db.commit()
    return new_prs
