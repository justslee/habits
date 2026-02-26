"""Run tracking API endpoints — Phase 3."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.run import PersonalRecord, RunSession, RunSplit
from app.models.user import User
from app.schemas.run import (
    PersonalRecordResponse,
    RunSessionCreate,
    RunSessionResponse,
    RunSplitResponse,
    RunStatsResponse,
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
        whoop_recovery_score=run.whoop_recovery_score,
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
    """Save a completed run with GPS data and splits."""
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
        gps_polyline=payload.gps_polyline,
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

    q = db.query(RunSession).filter(RunSession.user_id == user.id)
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
        RunSession.user_id == user.id, RunSession.status == "completed"
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


@router.get("/{run_id}", response_model=RunSessionResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    """Get a single run with splits."""
    run = db.query(RunSession).filter(RunSession.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_response(run)


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
