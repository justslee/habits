"""AI Workout Generator — "The Coach" (P2-2).

Generates complete workout plans using tool_use structured outputs.
System prompt is built dynamically based on the current macro block,
athlete profile, weak points, and coaching observations.
"""

import logging
from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.workout import ExerciseProfile
from app.services.llm import SONNET, structured_output
from app.services.progressive_overload import (
    MACRO_BLOCKS,
    calculate_warmup_sets,
    get_next_session_targets,
)
from app.services.whoop import get_recovery_adjustment

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exercise menus
# ---------------------------------------------------------------------------

# Core exercises per day type
DAY_EXERCISES: dict[str, list[str]] = {
    "push":  ["Bench Press", "OHP", "Incline DB Press", "Tricep Pushdowns", "Lateral Raises"],
    "pull":  ["Barbell Row", "Pull-ups", "Seated Cable Row", "Barbell Curl", "Face Pulls"],
    "legs":  ["Squat", "RDL", "Leg Press", "Walking Lunges", "Calf Raises"],
    "cardio": ["Easy Jog", "Intervals"],
}

# Sport-specific additions keyed by (day_type, macro_block_or_"all")
SPORT_SPECIFIC_EXERCISES: dict[str, dict[str, list[str]]] = {
    "legs": {
        # Plyometrics during strength/peaking for athletic carryover
        "strength": ["Box Jumps", "Jump Squats"],
        "peaking":  ["Box Jumps", "Depth Jumps"],
    },
    "pull": {
        # Rotational power every pull day for basketball
        "all": ["Pallof Press", "Cable Woodchops"],
    },
}

WORKOUT_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "exercises": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name":         {"type": "string"},
                    "sets":         {"type": "integer"},
                    "reps":         {"type": "string", "description": "Reps as int or range '8-12'"},
                    "weight":       {"type": "number", "description": "Weight in lbs, 0 if bodyweight"},
                    "rest_seconds": {"type": "integer"},
                    "notes":        {"type": "string"},
                },
                "required": ["name", "sets", "reps", "rest_seconds"],
            },
        },
        "pre_jog": {
            "type": "object",
            "properties": {
                "minutes": {"type": "integer"},
                "pace":    {"type": "string"},
            },
            "required": ["minutes", "pace"],
            "description": "Pre-workout jog. Omit for cardio days.",
        },
        "coach_notes":                {"type": "string", "description": "2-3 sentences about today's focus"},
        "estimated_duration_minutes": {"type": "integer"},
    },
    "required": ["exercises", "coach_notes", "estimated_duration_minutes"],
}


# ---------------------------------------------------------------------------
# Dynamic system prompt (2C)
# ---------------------------------------------------------------------------

def _build_coach_system_prompt(current_block: str) -> str:
    """Build a dynamic system prompt based on the current macro training block."""
    block_cfg = MACRO_BLOCKS.get(current_block, MACRO_BLOCKS["hypertrophy"])
    rep_lo, rep_hi = block_cfg["rep_range"]
    intensity = int(block_cfg["intensity_pct"] * 100)

    block_guidance = {
        "hypertrophy": (
            f"HYPERTROPHY BLOCK — {rep_lo}-{rep_hi} reps at {intensity}% 1RM.\n"
            "Short rest (60-90s isolation, 120s compounds). Accumulate volume.\n"
            "Every working set ends at RPE 7-8 — leave 2 in the tank."
        ),
        "strength": (
            f"STRENGTH BLOCK — {rep_lo}-{rep_hi} reps at {intensity}% 1RM.\n"
            "Full rest (3-5 min on compounds). Quality over quantity.\n"
            "Focus on bar speed and perfect technique under load."
        ),
        "peaking": (
            f"PEAKING BLOCK — {rep_lo}-{rep_hi} reps at {intensity}% 1RM.\n"
            "Full recovery between sets (5 min). No fatigue during working sets.\n"
            "Perfect technique is non-negotiable at these loads."
        ),
        "deload": (
            "DELOAD WEEK — 60% working weight, same reps, fewer sets.\n"
            "This is not a test. Move well, flush fatigue, prepare to rebuild.\n"
            "Body adapts during recovery, not during training."
        ),
    }

    return f"""You are an elite strength and conditioning coach working with a hybrid athlete.

Schedule: Push (Mon), Pull (Tue), Legs+Core (Wed), Rest (Thu), Cardio/Pull+Core (Fri), Basketball (Sat), Rest (Sun).
Every lift day starts with a 10-15 min easy jog for mental focus and movement prep.

Current macrocycle: {block_guidance.get(current_block, block_guidance['hypertrophy'])}

Programming rules:
- Progressive overload is the foundation — every session attempts progress (weight, reps, or quality).
- Saturday basketball impacts Monday readiness — adjust Monday volume accordingly.
- Prioritize compounds. Use accessories to address flagged weaknesses.
- Recovery < 50%: reduce volume 20-30%. Recovery < 34%: active recovery only, no lifting.
- NO TRICEP DIPS — shoulder injury. Use pushdowns, skull crushers, or overhead extensions.
- Basketball athlete needs: hip stability, rotational power, ankle mobility, single-leg strength.
  → Legs day includes plyometrics during strength/peaking blocks.
  → Pull day includes rotational core work every session.

Communication: Direct, brief. One sentence on the WHY per exercise.
Use the submit_workout_plan tool to return the structured plan."""


# ---------------------------------------------------------------------------
# Context builder (delegates to coach_context for rich data)
# ---------------------------------------------------------------------------

def _build_workout_context(
    user_id: int,
    day_type: str,
    recovery_data: Optional[dict],
    db: Session,
) -> str:
    """Build the user-message context string for the Coach LLM."""
    # Lazy import to avoid circular dependency
    from app.services.coach_context import build_workout_context as _rich_ctx
    return _rich_ctx(db=db, user_id=user_id, day_type=day_type, recovery_data=recovery_data)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def generate_workout_plan(
    user_id: int,
    day_type: str,
    recovery_data: Optional[dict],
    db: Session,
) -> dict[str, Any]:
    """Generate a complete workout plan for the given day type."""
    if day_type == "rest":
        return {
            "exercises": [],
            "pre_jog": None,
            "coach_notes": (
                "Rest day. Active recovery: light walk, stretching, mobility work. "
                "Your body builds during recovery."
            ),
            "estimated_duration_minutes": 0,
        }

    recovery_score = recovery_data.get("recovery_score") if recovery_data else None
    if recovery_score is not None and recovery_score < 34:
        return {
            "exercises": [
                {"name": "Light Walk",   "sets": 1, "reps": "20 min", "weight": None, "rest_seconds": 0, "notes": "Easy pace"},
                {"name": "Foam Rolling", "sets": 1, "reps": "10 min", "weight": None, "rest_seconds": 0, "notes": "Full body"},
                {"name": "Stretching",   "sets": 1, "reps": "10 min", "weight": None, "rest_seconds": 0, "notes": "Focus tight areas"},
            ],
            "pre_jog": None,
            "coach_notes": (
                f"Recovery critically low ({recovery_score}%). No lifting today. "
                "Active recovery only. Rest IS training."
            ),
            "estimated_duration_minutes": 40,
        }

    # Determine current macro block for this athlete
    profiles = (
        db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user_id)
        .all()
    )
    macro_blocks = [
        getattr(p, "macro_block", "hypertrophy") or "hypertrophy" for p in profiles
    ]
    current_block = (
        max(set(macro_blocks), key=macro_blocks.count) if macro_blocks else "hypertrophy"
    )

    system_prompt = _build_coach_system_prompt(current_block)
    context = _build_workout_context(user_id, day_type, recovery_data, db)

    user_prompt = f"Generate today's {day_type.upper()} workout.\n\n{context}"

    try:
        return await structured_output(
            system=system_prompt,
            user_prompt=user_prompt,
            tool_name="submit_workout_plan",
            tool_description=(
                "Submit the structured workout plan with exercises, sets, reps, "
                "weights, and coaching notes."
            ),
            output_schema=WORKOUT_PLAN_SCHEMA,
            model=SONNET,
        )
    except Exception as e:
        logger.error("Workout generation failed: %s", e)
        return _generate_fallback_plan(user_id, day_type, db)


# ---------------------------------------------------------------------------
# Fallback (no LLM)
# ---------------------------------------------------------------------------

def _generate_fallback_plan(user_id: int, day_type: str, db: Session) -> dict:
    """Generate a basic plan without LLM."""
    exercises = list(DAY_EXERCISES.get(day_type, []))
    profiles = {
        p.exercise_name: p
        for p in db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user_id)
        .all()
    }

    plan_exercises = []
    for i, ex_name in enumerate(exercises):
        profile = profiles.get(ex_name)
        if profile and profile.current_working_weight:
            targets = get_next_session_targets(profile, db)
            plan_exercises.append({
                "name":         ex_name,
                "sets":         targets["sets"],
                "reps":         targets["reps"],
                "weight":       targets["weight"],
                "rest_seconds": 120 if i < 2 else 90,
                "notes":        targets["rationale"],
            })
        else:
            plan_exercises.append({
                "name":         ex_name,
                "sets":         3,
                "reps":         8,
                "weight":       None,
                "rest_seconds": 90,
                "notes":        "Establish baseline — moderate weight.",
            })

    return {
        "exercises": plan_exercises,
        "pre_jog": {"minutes": 12, "pace": "easy conversational"} if day_type != "cardio" else None,
        "coach_notes": "Auto-generated plan (LLM unavailable). Follow progressive overload targets.",
        "estimated_duration_minutes": 55,
    }


# ---------------------------------------------------------------------------
# Schedule helper
# ---------------------------------------------------------------------------

def get_day_type_for_date(target_date: Optional[date] = None) -> str:
    """Get the scheduled day type based on the weekly template."""
    d = target_date or date.today()
    schedule = {
        0: "push",        # Monday
        1: "pull",        # Tuesday
        2: "legs",        # Wednesday
        3: "rest",        # Thursday
        4: "cardio",      # Friday
        5: "basketball",  # Saturday
        6: "rest",        # Sunday
    }
    return schedule[d.weekday()]
