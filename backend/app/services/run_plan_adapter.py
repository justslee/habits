"""Adaptive run plan management — adjusts plans based on performance and load.

After each completed run:
  1. Marks the planned run as done.
  2. Checks the A:C ratio — inserts a recovery week if > 1.5.
  3. Analyzes 2-week pace trends — increases remaining plan paces if
     athlete is consistently beating targets by ≥ 15 s/mi.
  4. Decreases volume if athlete is struggling and load is already low.
  5. Saves a running coaching observation for future prompts.
"""

import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.coaching import CoachingObservation
from app.models.run import PlannedRun, RunSession, TrainingPlan
from app.services.training_load import calculate_run_load, get_training_loads

logger = logging.getLogger(__name__)

PACE_IMPROVEMENT_THRESHOLD = 15  # s/mi faster than planned → beating target


# ---------------------------------------------------------------------------
# Run-vs-plan comparison
# ---------------------------------------------------------------------------

def analyze_run_vs_plan(run: RunSession, planned: Optional[PlannedRun]) -> dict:
    """Compare a completed run against its planned run.

    pace_delta > 0 means the athlete ran FASTER than planned.
    """
    if not planned or not run.avg_pace_seconds or not planned.target_pace_seconds:
        return {
            "comparison": "no_plan" if not planned else "no_target_pace",
            "pace_delta": None,
        }

    pace_delta = planned.target_pace_seconds - run.avg_pace_seconds
    distance_delta = (run.distance_miles or 0) - (planned.target_distance_miles or 0)

    return {
        "comparison": "complete",
        "pace_delta": pace_delta,
        "distance_delta": round(distance_delta, 2),
        "beat_pace_target": pace_delta >= PACE_IMPROVEMENT_THRESHOLD,
        "missed_pace_target": pace_delta < -30,
        "run_type_match": run.run_type == planned.run_type,
    }


# ---------------------------------------------------------------------------
# Pace trend analysis
# ---------------------------------------------------------------------------

def get_recent_pace_trend(user_id: int, db: Session, weeks: int = 2) -> dict:
    """Analyse whether the athlete is consistently outperforming pace targets."""
    cutoff = date.today() - timedelta(weeks=weeks)

    pairs = (
        db.query(RunSession, PlannedRun)
        .join(PlannedRun, RunSession.planned_run_id == PlannedRun.id)
        .filter(
            RunSession.user_id == user_id,
            RunSession.status == "completed",
            RunSession.run_date >= cutoff,
            RunSession.deleted_at.is_(None),
            PlannedRun.target_pace_seconds.isnot(None),
        )
        .all()
    )

    if len(pairs) < 3:
        return {"sufficient_data": False, "runs_analyzed": len(pairs)}

    comparisons = [
        c for c in (analyze_run_vs_plan(run, plan) for run, plan in pairs)
        if c["comparison"] == "complete" and c["pace_delta"] is not None
    ]

    if not comparisons:
        return {"sufficient_data": False, "runs_analyzed": 0}

    n = len(comparisons)
    beats  = sum(1 for c in comparisons if c.get("beat_pace_target"))
    misses = sum(1 for c in comparisons if c.get("missed_pace_target"))
    avg_delta = sum(c["pace_delta"] for c in comparisons) / n

    return {
        "sufficient_data": True,
        "runs_analyzed": n,
        "beats_pace_target": beats,
        "misses_pace_target": misses,
        "avg_pace_delta": round(avg_delta, 1),
        "consistently_fast": beats >= n * 0.70 and avg_delta >= PACE_IMPROVEMENT_THRESHOLD,
        "struggling": misses >= n * 0.60 and avg_delta < -20,
    }


# ---------------------------------------------------------------------------
# Main adapter
# ---------------------------------------------------------------------------

def adapt_plan_after_run(
    user_id: int,
    run: RunSession,
    planned: Optional[PlannedRun],
    db: Session,
) -> dict:
    """Run post-run adaptation logic and persist any plan changes.

    Returns a summary dict with 'changes' list and load/trend info.
    """
    changes: list[str] = []

    # Mark planned run done
    if planned and planned.status != "completed":
        planned.status = "completed"
        planned.completed_run_id = run.id

    active_plan = (
        db.query(TrainingPlan)
        .filter(TrainingPlan.user_id == user_id, TrainingPlan.status == "active")
        .first()
    )

    # 1. Training load check
    loads = get_training_loads(user_id, db)

    if loads["ac_ratio"] > 1.5:
        _insert_recovery_week(active_plan, db, reason=f"A:C = {loads['ac_ratio']:.2f}")
        changes.append(
            f"Inserted recovery week — A:C ratio {loads['ac_ratio']:.2f} (injury risk zone)"
        )
    elif loads["ac_ratio"] > 1.3:
        changes.append(
            f"Load elevated (A:C = {loads['ac_ratio']:.2f}) — prioritise easy running this week"
        )

    # 2. Pace trend adaptation
    pace_trend = get_recent_pace_trend(user_id, db)

    if active_plan and pace_trend.get("consistently_fast"):
        adjustment = int(pace_trend["avg_pace_delta"] / 2)
        _increase_remaining_paces(active_plan, adjustment, db)
        changes.append(
            f"Increased remaining plan paces by ~{adjustment}s/mi — "
            f"consistently beating targets by {pace_trend['avg_pace_delta']:.0f}s/mi"
        )
    elif active_plan and pace_trend.get("struggling") and loads["ac_ratio"] < 1.0:
        _reduce_remaining_volume(active_plan, 0.90, db)
        changes.append("Reduced remaining volume 10% — missing targets with low load")

    # 3. Coaching observation
    comparison = analyze_run_vs_plan(run, planned)
    _save_run_observation(user_id, run, planned, comparison, loads, db)

    db.commit()
    return {"changes": changes, "loads": loads, "pace_trend": pace_trend}


# ---------------------------------------------------------------------------
# Plan mutation helpers
# ---------------------------------------------------------------------------

def _insert_recovery_week(
    plan: Optional[TrainingPlan], db: Session, reason: str
) -> None:
    """Convert next 7 days of planned runs to recovery runs."""
    if not plan:
        return
    today = date.today()
    upcoming = (
        db.query(PlannedRun)
        .filter(
            PlannedRun.plan_id == plan.id,
            PlannedRun.status == "upcoming",
            PlannedRun.planned_date > today,
            PlannedRun.planned_date <= today + timedelta(days=7),
        )
        .all()
    )
    for pr in upcoming:
        pr.run_type = "recovery"
        if pr.target_distance_miles:
            pr.target_distance_miles = round(pr.target_distance_miles * 0.60, 1)
        if pr.target_pace_seconds:
            pr.target_pace_seconds += 30
        pr.description = f"[RECOVERY WEEK — {reason}] {pr.description or ''}".strip()


def _increase_remaining_paces(plan: TrainingPlan, delta_seconds: int, db: Session) -> None:
    """Increase pace targets for upcoming non-interval runs."""
    today = date.today()
    upcoming = (
        db.query(PlannedRun)
        .filter(
            PlannedRun.plan_id == plan.id,
            PlannedRun.status == "upcoming",
            PlannedRun.planned_date > today,
            PlannedRun.run_type.in_(["easy", "long", "tempo", "fartlek", "progression"]),
        )
        .all()
    )
    for pr in upcoming:
        if pr.target_pace_seconds:
            pr.target_pace_seconds = max(300, pr.target_pace_seconds - delta_seconds)


def _reduce_remaining_volume(
    plan: TrainingPlan, multiplier: float, db: Session
) -> None:
    """Scale down distance and duration for upcoming planned runs."""
    today = date.today()
    upcoming = (
        db.query(PlannedRun)
        .filter(
            PlannedRun.plan_id == plan.id,
            PlannedRun.status == "upcoming",
            PlannedRun.planned_date > today,
        )
        .all()
    )
    for pr in upcoming:
        if pr.target_distance_miles:
            pr.target_distance_miles = round(pr.target_distance_miles * multiplier, 1)
        if pr.target_duration_minutes:
            pr.target_duration_minutes = int(pr.target_duration_minutes * multiplier)


# ---------------------------------------------------------------------------
# Observation saving
# ---------------------------------------------------------------------------

def _save_run_observation(
    user_id: int,
    run: RunSession,
    planned: Optional[PlannedRun],
    comparison: dict,
    loads: dict,
    db: Session,
) -> None:
    """Persist a running coaching observation for future prompt injection."""
    if not run.avg_pace_seconds:
        return

    pace_m, pace_s = divmod(run.avg_pace_seconds, 60)
    parts = [
        f"Run {run.run_date}: {run.distance_miles}mi {run.run_type or 'easy'} "
        f"at {pace_m}:{pace_s:02d}/mi."
    ]

    if comparison.get("pace_delta") is not None:
        delta = comparison["pace_delta"]
        direction = "faster" if delta > 0 else "slower"
        parts.append(f"{abs(delta)}s/mi {direction} than planned.")

    parts.append(
        f"A:C = {loads['ac_ratio']:.2f} ({loads['zone']}). "
        f"RPE: {run.rpe or 'N/A'}."
    )

    db.add(CoachingObservation(
        user_id=user_id,
        category="running",
        observation=" ".join(parts),
        source=f"post_run_{run.id}",
        confidence=0.90,
        is_active=True,
    ))
