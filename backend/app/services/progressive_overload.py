"""Progressive Overload Engine — Phase 2 killer feature.

Auto-calculates next session's weights/reps from logged history.
Double progression, stall detection, deload programming.
"""

import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession

logger = logging.getLogger(__name__)

# Weight increments
MIN_INCREMENT = 2.5  # lbs
STANDARD_INCREMENT = 5.0  # lbs

# Stall thresholds
STALL_SESSION_THRESHOLD = 3  # sessions at same weight before stall
DELOAD_CYCLE_WEEKS = 4  # deload every N weeks

# Volume landmarks (sets per muscle group per week)
MEV = {"push": 10, "pull": 10, "legs": 10}  # Minimum Effective Volume
MRV = {"push": 22, "pull": 22, "legs": 22}  # Maximum Recoverable Volume

# ---------------------------------------------------------------------------
# Macro periodization
# ---------------------------------------------------------------------------

MACRO_BLOCKS: dict[str, dict] = {
    "hypertrophy": {
        "weeks": 4,
        "rep_range": (8, 12),
        "set_range": (3, 4),
        "intensity_pct": 0.72,
        "description": "Volume accumulation — 8-12 reps, 70-75% 1RM",
    },
    "strength": {
        "weeks": 4,
        "rep_range": (3, 6),
        "set_range": (4, 5),
        "intensity_pct": 0.85,
        "description": "Neural adaptation — 3-6 reps, 80-90% 1RM",
    },
    "peaking": {
        "weeks": 3,
        "rep_range": (1, 3),
        "set_range": (4, 5),
        "intensity_pct": 0.93,
        "description": "Max strength expression — 1-3 reps, 90-100% 1RM",
    },
}
MACRO_BLOCK_ORDER = ["hypertrophy", "strength", "peaking"]


def get_block_rep_target(macro_block: str) -> int:
    """Middle of the rep range for the given macro block."""
    cfg = MACRO_BLOCKS.get(macro_block, MACRO_BLOCKS["hypertrophy"])
    lo, hi = cfg["rep_range"]
    return (lo + hi) // 2


def get_block_set_target(macro_block: str) -> int:
    """Default set count for the given macro block."""
    cfg = MACRO_BLOCKS.get(macro_block, MACRO_BLOCKS["hypertrophy"])
    lo, hi = cfg["set_range"]
    return (lo + hi) // 2


def _advance_macro_block(profile: ExerciseProfile) -> None:
    """Cycle to the next macro block after a deload completes."""
    current = getattr(profile, "macro_block", None) or "hypertrophy"
    try:
        idx = MACRO_BLOCK_ORDER.index(current)
        next_block = MACRO_BLOCK_ORDER[(idx + 1) % len(MACRO_BLOCK_ORDER)]
    except ValueError:
        next_block = "hypertrophy"

    profile.macro_block = next_block
    profile.macro_block_week = 1
    profile.current_rep_target = get_block_rep_target(next_block)
    profile.current_set_target = get_block_set_target(next_block)

    logger.info(
        "Exercise %s → %s block (reps: %s)",
        profile.exercise_name,
        next_block,
        MACRO_BLOCKS[next_block]["rep_range"],
    )


def estimate_1rm(weight: float, reps: int) -> float:
    """Estimate 1RM using Epley formula: weight × (1 + reps/30)."""
    if reps <= 0 or weight <= 0:
        return 0
    return round(weight * (1 + reps / 30), 1)


def calculate_warmup_sets(working_weight: float) -> list[dict]:
    """Generate warm-up sets based on working weight."""
    if working_weight <= 0:
        return []

    sets = []
    # Empty bar (45 lbs) if working weight > 95
    if working_weight > 95:
        sets.append({"weight": 45, "reps": 10, "is_warmup": True})

    # Progressive warm-ups
    percentages = [0.5, 0.7, 0.85]
    for pct in percentages:
        w = round(working_weight * pct / 5) * 5  # Round to nearest 5
        if w >= 45 and (not sets or w > sets[-1]["weight"]):
            reps = max(3, 8 - int(pct * 5))
            sets.append({"weight": w, "reps": reps, "is_warmup": True})

    return sets


def get_next_session_targets(
    profile: ExerciseProfile,
    db: Session,
) -> dict:
    """Calculate next session's targets based on history.

    Returns:
        dict with: weight, reps, sets, warmup_sets, rationale
    """
    if not profile.current_working_weight:
        return {
            "weight": None,
            "reps": profile.current_rep_target or 5,
            "sets": profile.current_set_target or 4,
            "warmup_sets": [],
            "rationale": "BASELINE DISCOVERY: Work up in moderate jumps to find a weight where you hit RPE 7-8. That becomes your working weight.",
            "is_baseline": True,
        }

    # Check if deload is due
    if profile.mesocycle_week >= DELOAD_CYCLE_WEEKS and profile.mesocycle_phase != "deload":
        deload_weight = round(profile.current_working_weight * 0.6 / 5) * 5
        return {
            "weight": deload_weight,
            "reps": profile.current_rep_target or 5,
            "sets": max(2, (profile.current_set_target or 4) - 1),
            "warmup_sets": calculate_warmup_sets(deload_weight),
            "rationale": f"Deload week (week {profile.mesocycle_week}). Reduced to 60% working weight.",
        }

    # Get last 3 sessions for this exercise
    recent_logs = (
        db.query(ExerciseLog)
        .join(WorkoutSession)
        .filter(
            ExerciseLog.exercise_name == profile.exercise_name,
            ExerciseLog.is_warmup == False,
            WorkoutSession.user_id == profile.user_id,
        )
        .order_by(WorkoutSession.session_date.desc(), ExerciseLog.set_number)
        .limit(20)  # ~4 sessions × 5 sets
        .all()
    )

    if not recent_logs:
        warmups = calculate_warmup_sets(profile.current_working_weight)
        return {
            "weight": profile.current_working_weight,
            "reps": profile.current_rep_target or 5,
            "sets": profile.current_set_target or 4,
            "warmup_sets": warmups,
            "rationale": "No previous logs. Starting at current working weight.",
        }

    # Group by session to get last session's performance
    last_session_id = recent_logs[0].session_id
    last_session_sets = [l for l in recent_logs if l.session_id == last_session_id]

    target_reps = profile.current_rep_target or 5
    target_sets = profile.current_set_target or 4

    # Check if all sets hit target reps (double progression)
    all_hit = all(
        (s.reps or 0) >= target_reps
        for s in last_session_sets
        if not s.is_warmup
    )
    working_sets = [s for s in last_session_sets if not s.is_warmup]

    if all_hit and len(working_sets) >= target_sets:
        # PROGRESS: increase weight
        increment = MIN_INCREMENT if profile.stall_count > 0 else STANDARD_INCREMENT
        new_weight = profile.current_working_weight + increment
        warmups = calculate_warmup_sets(new_weight)
        return {
            "weight": new_weight,
            "reps": target_reps,
            "sets": target_sets,
            "warmup_sets": warmups,
            "rationale": f"All sets hit {target_reps} reps last session. Progressing +{increment} lbs.",
        }

    # Didn't hit all reps — stay at current weight
    total_reps = sum(s.reps or 0 for s in working_sets)
    expected_reps = target_reps * target_sets
    warmups = calculate_warmup_sets(profile.current_working_weight)

    if profile.sessions_at_current_weight >= STALL_SESSION_THRESHOLD:
        # STALLED
        return {
            "weight": profile.current_working_weight,
            "reps": target_reps,
            "sets": target_sets,
            "warmup_sets": warmups,
            "rationale": (
                f"Stalled at {profile.current_working_weight} lbs for "
                f"{profile.sessions_at_current_weight} sessions "
                f"({total_reps}/{expected_reps} reps last time). "
                "Consider: microload (+2.5), rep scheme change, or deload."
            ),
            "stall_recommendation": _recommend_stall_fix(profile),
        }

    return {
        "weight": profile.current_working_weight,
        "reps": target_reps,
        "sets": target_sets,
        "warmup_sets": warmups,
        "rationale": (
            f"Repeat {profile.current_working_weight} lbs — "
            f"got {total_reps}/{expected_reps} reps last session. Push for all {target_sets}×{target_reps}."
        ),
    }


def _recommend_stall_fix(profile: ExerciseProfile) -> str:
    """Recommend how to break through a stall."""
    if profile.stall_count == 0:
        return f"Try microloading: +{MIN_INCREMENT} lbs instead of +{STANDARD_INCREMENT}."
    elif profile.stall_count == 1:
        reps = profile.current_rep_target or 5
        if reps >= 5:
            return f"Switch rep scheme: try {(profile.current_set_target or 4)+1}×{reps-2} at slightly higher weight."
        else:
            return f"Switch to volume block: 3×{reps+3} at {round(profile.current_working_weight * 0.85 / 5) * 5} lbs."
    else:
        return "Deload recommended: drop to 60% for one week, then rebuild."


def update_profile_after_session(
    profile: ExerciseProfile,
    session_logs: list[ExerciseLog],
    db: Session,
) -> ExerciseProfile:
    """Update exercise profile after a completed session."""
    working_sets = [s for s in session_logs if not s.is_warmup and s.exercise_name == profile.exercise_name]

    if not working_sets:
        return profile

    # Baseline discovery: set working weight from first real session
    if not profile.current_working_weight:
        heaviest = max(working_sets, key=lambda s: s.weight or 0)
        if heaviest.weight:
            profile.current_working_weight = heaviest.weight
            profile.progression_status = "progressing"
            profile.sessions_at_current_weight = 1
            profile.estimated_1rm = estimate_1rm(heaviest.weight, heaviest.reps or 1)
            db.commit()
            return profile

    # Update e1RM from best set
    best_set = max(working_sets, key=lambda s: estimate_1rm(s.weight or 0, s.reps or 0))
    if best_set.weight and best_set.reps:
        profile.estimated_1rm = estimate_1rm(best_set.weight, best_set.reps)

    # Check if all sets hit target
    target_reps = profile.current_rep_target or 5
    target_sets = profile.current_set_target or 4
    all_hit = (
        len(working_sets) >= target_sets
        and all((s.reps or 0) >= target_reps for s in working_sets)
    )

    if all_hit:
        # Progress next time
        increment = MIN_INCREMENT if profile.stall_count > 0 else STANDARD_INCREMENT
        profile.current_working_weight = (profile.current_working_weight or 0) + increment
        profile.sessions_at_current_weight = 0
        profile.stall_count = 0
        profile.progression_status = "progressing"
        profile.last_progression_date = date.today()
    else:
        profile.sessions_at_current_weight += 1
        if profile.sessions_at_current_weight >= STALL_SESSION_THRESHOLD:
            profile.stall_count += 1
            profile.progression_status = "stalled"
        else:
            profile.progression_status = "maintaining"

    # Update mesocycle week
    profile.mesocycle_week += 1
    if profile.mesocycle_week > DELOAD_CYCLE_WEEKS:
        if profile.mesocycle_phase != "deload":
            profile.mesocycle_phase = "deload"
        else:
            # Deload complete — advance macro block and reset mesocycle
            profile.mesocycle_phase = "accumulation"
            profile.mesocycle_week = 1
            _advance_macro_block(profile)

    # Increment macro_block_week (separate from mesocycle)
    if profile.mesocycle_phase != "deload":
        current_block = getattr(profile, "macro_block", "hypertrophy")
        block_max = MACRO_BLOCKS.get(current_block, {}).get("weeks", 4)
        new_block_week = (getattr(profile, "macro_block_week", 1) or 1) + 1
        if new_block_week <= block_max:
            profile.macro_block_week = new_block_week

    db.commit()
    return profile


def update_profiles_after_session(
    session: WorkoutSession,
    db: Session,
) -> list[ExerciseProfile]:
    """Update all exercise profiles touched in a completed session.

    This is the plural form called from workout_chat.py after session_complete.
    Delegates to update_profile_after_session for each exercise.
    """
    exercise_names = {
        log.exercise_name
        for log in session.exercises
        if not log.is_warmup and log.exercise_name
    }

    updated = []
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
            session_logs = [l for l in session.exercises if l.exercise_name == name]
            updated.append(update_profile_after_session(profile, session_logs, db))

    return updated


def get_weekly_volume(user_id: int, muscle_group: str, db: Session) -> dict:
    """Get weekly volume for a muscle group."""
    week_start = date.today() - timedelta(days=date.today().weekday())

    logs = (
        db.query(ExerciseLog)
        .join(WorkoutSession)
        .join(ExerciseProfile, ExerciseLog.exercise_name == ExerciseProfile.exercise_name)
        .filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_date >= week_start,
            ExerciseProfile.muscle_group == muscle_group,
            ExerciseLog.is_warmup == False,
        )
        .all()
    )

    total_sets = len(logs)
    total_volume = sum(l.volume_load for l in logs)

    mev = MEV.get(muscle_group, 10)
    mrv = MRV.get(muscle_group, 22)

    return {
        "muscle_group": muscle_group,
        "total_sets": total_sets,
        "total_volume": round(total_volume, 1),
        "mev": mev,
        "mrv": mrv,
        "status": (
            "below_mev" if total_sets < mev
            else "optimal" if total_sets <= mrv
            else "above_mrv"
        ),
    }
