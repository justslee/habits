"""Coach Context Builder — assembles rich athlete profiles for AI coaching.

Replaces static prompt context with data-driven context:
  - Per-exercise history and progression state
  - Weak-point analysis (stall patterns + relative strength ratios)
  - Active coaching observations from prior sessions

Used by workout_generator.py to build the user prompt that feeds
into the LLM, so the coach "sees" the athlete's current state.
"""

import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.coaching import CoachingObservation
from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exercise history
# ---------------------------------------------------------------------------

def get_exercise_history(
    db: Session,
    user_id: int,
    exercise_name: str,
    weeks: int = 8,
) -> list[dict]:
    """Per-session history for one exercise over the past N weeks.

    Returns list of session dicts, oldest first:
      {date, sets: [{weight, reps, rpe}], top_weight, top_e1rm, total_volume}
    """
    from app.services.progressive_overload import estimate_1rm

    cutoff = date.today() - timedelta(weeks=weeks)
    rows = (
        db.query(ExerciseLog, WorkoutSession.session_date, WorkoutSession.id)
        .join(WorkoutSession, ExerciseLog.session_id == WorkoutSession.id)
        .filter(
            WorkoutSession.user_id == user_id,
            ExerciseLog.exercise_name == exercise_name,
            ExerciseLog.is_warmup == False,
            WorkoutSession.session_date >= cutoff,
            WorkoutSession.deleted_at.is_(None),
        )
        .order_by(WorkoutSession.session_date.asc(), ExerciseLog.set_number.asc())
        .all()
    )

    sessions: dict[int, dict] = {}
    for log, session_date, sid in rows:
        if sid not in sessions:
            sessions[sid] = {
                "date": session_date.isoformat(),
                "sets": [],
                "top_weight": 0.0,
                "top_e1rm": 0.0,
                "total_volume": 0.0,
            }
        sessions[sid]["sets"].append(
            {"weight": log.weight, "reps": log.reps, "rpe": log.rpe}
        )
        vol = (log.weight or 0) * (log.reps or 0)
        sessions[sid]["total_volume"] += vol
        if log.weight and log.reps:
            e1rm = estimate_1rm(log.weight, log.reps)
            sessions[sid]["top_e1rm"]   = max(sessions[sid]["top_e1rm"],   e1rm)
            sessions[sid]["top_weight"] = max(sessions[sid]["top_weight"], log.weight)

    return list(sessions.values())


# ---------------------------------------------------------------------------
# Weak-point analysis
# ---------------------------------------------------------------------------

def identify_weak_points(db: Session, user_id: int) -> list[dict]:
    """Flag exercises with 2+ stalls in 8 weeks or poor relative-strength ratios."""
    profiles = (
        db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user_id)
        .all()
    )

    weak_points: list[dict] = []
    cutoff = date.today() - timedelta(weeks=8)

    # 1. Stall-based weakness
    for p in profiles:
        if p.stall_count < 2:
            continue
        # Confirm recency — must have trained this lift in the last 8 weeks
        recent_sessions = (
            db.query(WorkoutSession)
            .join(ExerciseLog, WorkoutSession.id == ExerciseLog.session_id)
            .filter(
                WorkoutSession.user_id == user_id,
                ExerciseLog.exercise_name == p.exercise_name,
                WorkoutSession.session_date >= cutoff,
                WorkoutSession.deleted_at.is_(None),
            )
            .distinct(WorkoutSession.id)
            .count()
        )
        if recent_sessions >= 2:
            weak_points.append({
                "exercise": p.exercise_name,
                "issue": f"stalled {p.stall_count}× in last 8 weeks",
                "current_weight": p.current_working_weight,
                "e1rm": p.estimated_1rm,
                "suggestion": (
                    "Consider: accessory work, technique focus, or rep-scheme change"
                ),
            })

    # 2. Relative strength ratios
    pm = {p.exercise_name: p for p in profiles}

    def _ratio_check(a_name: str, b_name: str, threshold: float, advice: str) -> None:
        a, b = pm.get(a_name), pm.get(b_name)
        if not (a and b and a.estimated_1rm and b.estimated_1rm):
            return
        ratio = b.estimated_1rm / a.estimated_1rm
        if ratio < threshold:
            weak_points.append({
                "exercise": b_name,
                "issue": f"{b_name}:{a_name} ratio {ratio:.0%} (target ≥{threshold:.0%})",
                "current_weight": b.current_working_weight,
                "e1rm": b.estimated_1rm,
                "suggestion": advice,
            })

    _ratio_check("Bench Press", "OHP", 0.65,
                 "Prioritize OHP — add lateral raises, improve shoulder mobility")
    _ratio_check("Bench Press", "Barbell Row", 0.85,
                 "Increase pull volume — face pulls, rear delt work, posture fix")
    _ratio_check("Squat", "RDL", 0.70,
                 "RDL lagging — add Romanian deadlift volume, focus hamstring/hip hinge")

    return weak_points


# ---------------------------------------------------------------------------
# Athlete profile
# ---------------------------------------------------------------------------

def build_athlete_profile(db: Session, user_id: int) -> dict:
    """Full athlete snapshot: profiles, observations, weak points."""
    profiles = (
        db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user_id)
        .all()
    )

    weak_points  = identify_weak_points(db, user_id)

    observations = (
        db.query(CoachingObservation)
        .filter(
            CoachingObservation.user_id == user_id,
            CoachingObservation.is_active == True,
        )
        .order_by(CoachingObservation.created_at.desc())
        .limit(10)
        .all()
    )

    week_start = date.today() - timedelta(days=date.today().weekday())
    recent_sessions = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_date >= date.today() - timedelta(weeks=8),
            WorkoutSession.status == "completed",
            WorkoutSession.deleted_at.is_(None),
        )
        .order_by(WorkoutSession.session_date.desc())
        .all()
    )

    return {
        "exercise_profiles": [
            {
                "name": p.exercise_name,
                "muscle_group": p.muscle_group,
                "working_weight": p.current_working_weight,
                "rep_target": p.current_rep_target,
                "set_target": p.current_set_target,
                "e1rm": p.estimated_1rm,
                "status": p.progression_status,
                "stall_count": p.stall_count,
                "macro_block": getattr(p, "macro_block", "hypertrophy"),
                "macro_block_week": getattr(p, "macro_block_week", 1),
                "mesocycle_week": p.mesocycle_week,
                "mesocycle_phase": p.mesocycle_phase,
            }
            for p in profiles
        ],
        "weak_points": weak_points,
        "coaching_observations": [
            {
                "category": o.category,
                "observation": o.observation,
                "confidence": o.confidence,
                "source": o.source,
            }
            for o in observations
        ],
        "recent_session_count": len(recent_sessions),
        "sessions_this_week": sum(
            1 for s in recent_sessions if s.session_date >= week_start
        ),
    }


# ---------------------------------------------------------------------------
# Workout context string (user prompt)
# ---------------------------------------------------------------------------

def build_workout_context(
    db: Session,
    user_id: int,
    day_type: str,
) -> str:
    """Build the full context string for the workout generation prompt.

    Returns a structured text block fed into the LLM user message.
    """
    from app.services.progressive_overload import get_next_session_targets
    from app.services.workout_generator import DAY_EXERCISES, SPORT_SPECIFIC_EXERCISES

    athlete = build_athlete_profile(db, user_id)

    lines = ["=== ATHLETE CONTEXT ==="]


    # Current macro block (majority vote across all profiles)
    macro_blocks = [
        p["macro_block"] for p in athlete["exercise_profiles"]
        if p.get("macro_block")
    ]
    current_block = (
        max(set(macro_blocks), key=macro_blocks.count) if macro_blocks else "hypertrophy"
    )
    BLOCK_DESC = {
        "hypertrophy": "HYPERTROPHY (8-12 reps, 70-75% 1RM, build volume)",
        "strength":    "STRENGTH (3-6 reps, 80-90% 1RM, neural adaptation)",
        "peaking":     "PEAKING (1-3 reps, 90-100% 1RM, express max strength)",
        "deload":      "DELOAD (60% working weight, reduced sets, active recovery)",
    }
    lines.append(f"\nMacro block: {BLOCK_DESC.get(current_block, current_block)}")

    # Per-exercise targets
    lines.append(f"\n=== {day_type.upper()} DAY TARGETS ===")
    exercises = list(DAY_EXERCISES.get(day_type, []))

    # Sport-specific additions based on macro block
    sport_adds = SPORT_SPECIFIC_EXERCISES.get(day_type, {})
    for block_key, extra in sport_adds.items():
        if block_key == "all" or block_key == current_block:
            for ex in extra:
                if ex not in exercises:
                    exercises.append(ex)

    if current_block in ("strength", "peaking") and day_type == "legs":
        lines.append("Note: include plyometric work (box jumps / jump squats) for sport carryover.")

    if day_type == "pull":
        lines.append("Note: include rotational core work (Pallof Press / cable woodchops) for basketball carryover.")

    for ex_name in exercises:
        profile = (
            db.query(ExerciseProfile)
            .filter(
                ExerciseProfile.user_id == user_id,
                ExerciseProfile.exercise_name == ex_name,
            )
            .first()
        )
        if profile:
            targets = get_next_session_targets(profile, db)
            history = get_exercise_history(db, user_id, ex_name, weeks=6)
            recent_3 = history[-3:] if len(history) >= 3 else history

            def _fmt_session(h: dict) -> str:
                sets = h["sets"]
                avg_reps = int(sum(s["reps"] or 0 for s in sets) / max(len(sets), 1))
                return f"{h['date']}: {h['top_weight']:.0f}×{avg_reps}r"

            hist_str = ", ".join(_fmt_session(h) for h in recent_3) or "no history"
            lines.append(
                f"\n{ex_name}:"
                f"\n  Target: {targets['weight']} lbs × {targets['reps']} "
                f"× {targets['sets']} sets"
                f"\n  e1RM: {profile.estimated_1rm or '?'} | "
                f"block: {getattr(profile, 'macro_block', '?')}/wk"
                f"{getattr(profile, 'macro_block_week', '?')} | "
                f"{profile.progression_status}"
                f"\n  Recent (last 3): {hist_str}"
                f"\n  Note: {targets['rationale']}"
            )
            if targets.get("stall_recommendation"):
                lines.append(f"  ⚠ STALL: {targets['stall_recommendation']}")
        else:
            lines.append(f"\n{ex_name}: No profile — establish baseline today")

    # Weak points
    if athlete["weak_points"]:
        lines.append("\n=== WEAK POINTS ===")
        for wp in athlete["weak_points"]:
            lines.append(f"⚠ {wp['exercise']}: {wp['issue']} — {wp['suggestion']}")

    # Recent coaching observations (strength + general only)
    relevant_obs = [
        o for o in athlete["coaching_observations"]
        if o["category"] in ("strength", "general")
    ][:5]
    if relevant_obs:
        lines.append("\n=== RECENT COACH NOTES ===")
        for obs in relevant_obs:
            lines.append(f"• [{obs['confidence']:.0%}] {obs['observation']}")

    return "\n".join(lines)
