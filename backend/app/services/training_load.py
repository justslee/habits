"""Training load tracking — acute/chronic load, A:C ratio, and recommendations.

Uses a TRIMP-inspired model: load per run = distance × intensity_factor.
Intensity is derived from pace relative to the athlete's easy pace, falling
back to run_type when pace data is unavailable.

Zones (A:C ratio):
  < 0.8   → undertrained (safe to add volume)
  0.8-1.3 → optimal (sweet spot, continue plan)
  1.3-1.5 → caution (easy day before quality work)
  > 1.5   → injury risk (recovery week needed)
"""

import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.run import RunSession, RunningProfile

logger = logging.getLogger(__name__)

# Intensity multipliers by run type (arbitrary units per mile)
INTENSITY_FACTORS: dict[str, float] = {
    "recovery": 0.7,
    "easy": 1.0,
    "long": 1.1,
    "fartlek": 1.3,
    "progression": 1.3,
    "tempo": 1.5,
    "intervals": 1.8,
}

LOAD_ZONES = [
    ("undertrained", 0.0, 0.80),
    ("optimal",      0.80, 1.30),
    ("caution",      1.30, 1.50),
    ("injury_risk",  1.50, float("inf")),
]


def calculate_run_load(run: RunSession, easy_pace_seconds: Optional[int] = None) -> float:
    """Training load for a single run (arbitrary units).

    Prefers pace-based intensity (easy_pace / actual_pace) when reference
    pace is available.  Falls back to run_type factor otherwise.
    """
    if not run.distance_miles or run.distance_miles <= 0:
        return 0.0

    if easy_pace_seconds and run.avg_pace_seconds and easy_pace_seconds > 0:
        # Faster than easy → intensity > 1; slower → < 1
        pace_intensity = easy_pace_seconds / run.avg_pace_seconds
        pace_intensity = max(0.5, min(2.5, pace_intensity))
        return run.distance_miles * pace_intensity

    factor = INTENSITY_FACTORS.get(run.run_type or "easy", 1.0)
    return run.distance_miles * factor


def get_training_loads(
    user_id: int,
    db: Session,
    reference_date: Optional[date] = None,
) -> dict:
    """Calculate acute (7d) and chronic (28d) training loads and A:C ratio.

    Returns:
        dict with acute_load, chronic_load, ac_ratio, zone, recommendation,
        recent_run_count, days_since_last_run.
    """
    today = reference_date or date.today()

    profile = db.query(RunningProfile).filter(RunningProfile.user_id == user_id).first()
    easy_pace = profile.estimated_easy_pace if profile else None

    cutoff_28 = today - timedelta(days=28)
    runs = (
        db.query(RunSession)
        .filter(
            RunSession.user_id == user_id,
            RunSession.status == "completed",
            RunSession.run_date >= cutoff_28,
            RunSession.deleted_at.is_(None),
        )
        .order_by(RunSession.run_date.asc())
        .all()
    )

    cutoff_7 = today - timedelta(days=7)
    acute_runs = [r for r in runs if r.run_date >= cutoff_7]

    acute_load = sum(calculate_run_load(r, easy_pace) for r in acute_runs)
    total_28d_load = sum(calculate_run_load(r, easy_pace) for r in runs)
    chronic_load = total_28d_load / 4.0  # avg weekly load

    if chronic_load < 0.1:
        ac_ratio = 1.0
    else:
        ac_ratio = acute_load / chronic_load

    zone = _zone_for_ratio(ac_ratio)

    return {
        "acute_load": round(acute_load, 1),
        "chronic_load": round(chronic_load, 1),
        "ac_ratio": round(ac_ratio, 2),
        "zone": zone,
        "recommendation": _recommendation(zone, ac_ratio),
        "recent_run_count": len(acute_runs),
        "days_since_last_run": _days_since_last(runs, today),
    }


def should_insert_recovery_week(user_id: int, db: Session) -> bool:
    """True if A:C ratio is above caution threshold (> 1.3)."""
    return get_training_loads(user_id, db)["ac_ratio"] > 1.3


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _zone_for_ratio(ratio: float) -> str:
    for name, lo, hi in LOAD_ZONES:
        if lo <= ratio < hi:
            return name
    return "optimal"


def _recommendation(zone: str, ratio: float) -> str:
    msgs = {
        "undertrained": f"A:C = {ratio:.2f} — below training baseline. Safe to add volume this week.",
        "optimal":      f"A:C = {ratio:.2f} — sweet spot. Continue planned training.",
        "caution":      f"A:C = {ratio:.2f} — elevated load. Include an easy day before any quality session.",
        "injury_risk":  f"A:C = {ratio:.2f} — injury risk zone. Recovery week strongly recommended.",
    }
    return msgs.get(zone, f"A:C = {ratio:.2f}")


def _days_since_last(runs: list, today: date) -> Optional[int]:
    if not runs:
        return None
    last = max(r.run_date for r in runs)
    return (today - last).days
