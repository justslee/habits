"""AI Workout Generator — "The Coach" (P2-2).

Generates complete workout plans using the Coach persona via Claude.
Integrates progressive overload data and Whoop recovery.
"""

import json
import logging
from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.workout import ExerciseProfile, WorkoutSession
from app.services.evaluation import call_claude
from app.services.progressive_overload import (
    calculate_warmup_sets,
    get_next_session_targets,
)
from app.services.whoop import get_recovery_adjustment

logger = logging.getLogger(__name__)

# Day type → muscle groups
DAY_EXERCISES: dict[str, list[str]] = {
    "push": ["Bench Press", "OHP", "Incline DB Press", "Tricep Pushdowns", "Lateral Raises"],
    "pull": ["Barbell Row", "Pull-ups", "Seated Cable Row", "Barbell Curl", "Face Pulls"],
    "legs": ["Squat", "RDL", "Leg Press", "Walking Lunges", "Calf Raises"],
    "cardio": ["Easy Jog", "Intervals"],
}

COACH_SYSTEM_PROMPT = """You are an elite strength and conditioning coach working with a hybrid athlete.
Your client trains Push on Monday, Cardio on Tuesday, Legs+Core on Wednesday, rests Thursday, Pull+Core on Friday, plays competitive basketball Saturday, and rests Sunday. Sunday is ALWAYS a full rest day. Every lift day begins with a 10-15 min easy jog for mental focus.

Your programming philosophy:
- Progressive overload is the foundation. Every session attempts to progress from the last — via weight, reps, or quality.
- Periodize in 4-6 week mesocycles. Manage fatigue, don't just accumulate it.
- Target RPE 7-8 on working sets. Build strength, don't test it every session.
- Account for cross-day recovery: Saturday basketball impacts Monday readiness. Tuesday pull affects Wednesday legs.
- Prioritize compound lifts. Use accessories to address specific weaknesses.
- When recovery is low, reduce volume or prescribe active recovery. Never push through bad recovery.
- NO TRICEP DIPS — they hurt the athlete's shoulders. Use pushdowns, skull crushers, or overhead extensions instead.

Your communication style:
- Direct, authoritative, no fluff. Speak like a coach, not a chatbot.
- Explain the WHY behind every programming decision briefly.
- Be honest when progress stalls — diagnose the issue, don't just encourage.
- Celebrate real PRs and milestones. Ignore fake effort.

Respond with valid JSON only:
{
  "exercises": [
    {
      "name": "Exercise Name",
      "sets": <int>,
      "reps": <int or string like "8-12">,
      "weight": <float or null>,
      "rest_seconds": <int>,
      "notes": "coaching note"
    }
  ],
  "pre_jog": {"minutes": 12, "pace": "easy conversational"},
  "coach_notes": "2-3 sentences about today's session focus",
  "estimated_duration_minutes": <int>
}"""


def _build_workout_context(
    user_id: int,
    day_type: str,
    recovery_data: Optional[dict],
    db: Session,
) -> str:
    """Build context string for the Coach LLM prompt."""
    profiles = (
        db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user_id)
        .all()
    )
    profile_map = {p.exercise_name: p for p in profiles}

    # Recovery adjustment
    recovery_score = recovery_data.get("recovery_score") if recovery_data else None
    adjustment = get_recovery_adjustment(recovery_score)

    lines = [f"Day type: {day_type.upper()}"]
    lines.append(f"Recovery: {adjustment['level']} — {adjustment['note']}")

    if recovery_data:
        lines.append(
            f"Whoop: Recovery {recovery_data.get('recovery_score', '?')}%, "
            f"HRV {recovery_data.get('hrv', '?')}ms, "
            f"RHR {recovery_data.get('resting_hr', '?')}bpm, "
            f"Sleep {recovery_data.get('sleep_score', '?')}%"
        )

    lines.append(f"\nVolume modifier: {adjustment['volume_modifier']}x")
    lines.append(f"Weight modifier: {adjustment['weight_modifier']}x")

    # Exercise profiles with progression targets
    exercises = DAY_EXERCISES.get(day_type, [])
    lines.append("\nExercise targets:")
    for ex_name in exercises:
        profile = profile_map.get(ex_name)
        if profile:
            targets = get_next_session_targets(profile, db)
            lines.append(
                f"- {ex_name}: {targets['weight']} lbs × {targets['reps']} × {targets['sets']} "
                f"(e1RM: {profile.estimated_1rm or '?'}, status: {profile.progression_status}, "
                f"mesocycle wk {profile.mesocycle_week}/{profile.mesocycle_phase}) — {targets['rationale']}"
            )
        else:
            lines.append(f"- {ex_name}: No profile yet (use moderate weight, establish baseline)")

    return "\n".join(lines)


async def generate_workout_plan(
    user_id: int,
    day_type: str,
    recovery_data: Optional[dict],
    db: Session,
) -> dict[str, Any]:
    """Generate a complete workout plan for the given day type.

    Returns parsed plan dict with exercises, coach notes, etc.
    """
    if day_type == "rest":
        return {
            "exercises": [],
            "pre_jog": None,
            "coach_notes": "Rest day. Active recovery: light walk, stretching, mobility work. Your body builds when it recovers.",
            "estimated_duration_minutes": 0,
        }

    context = _build_workout_context(user_id, day_type, recovery_data, db)

    # Check if red recovery → active recovery only
    recovery_score = recovery_data.get("recovery_score") if recovery_data else None
    if recovery_score is not None and recovery_score < 34:
        return {
            "exercises": [
                {"name": "Light Walk", "sets": 1, "reps": "20 min", "weight": None, "rest_seconds": 0, "notes": "Easy pace"},
                {"name": "Foam Rolling", "sets": 1, "reps": "10 min", "weight": None, "rest_seconds": 0, "notes": "Full body"},
                {"name": "Stretching", "sets": 1, "reps": "10 min", "weight": None, "rest_seconds": 0, "notes": "Focus on tight areas"},
            ],
            "pre_jog": None,
            "coach_notes": f"Recovery is critically low ({recovery_score}%). No lifting today. Active recovery only. Trust the process — rest IS training.",
            "estimated_duration_minutes": 40,
        }

    user_prompt = f"Generate today's {day_type} workout plan.\n\n{context}"

    try:
        raw_response = await call_claude(COACH_SYSTEM_PROMPT, user_prompt)
        content = raw_response["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        return json.loads(content)
    except Exception as e:
        logger.error(f"Workout generation failed: {e}")
        # Fallback: generate from profiles without LLM
        return _generate_fallback_plan(user_id, day_type, db)


def _generate_fallback_plan(user_id: int, day_type: str, db: Session) -> dict:
    """Generate a basic plan without LLM (fallback)."""
    exercises = DAY_EXERCISES.get(day_type, [])
    profiles = {
        p.exercise_name: p
        for p in db.query(ExerciseProfile)
        .filter(ExerciseProfile.user_id == user_id)
        .all()
    }

    plan_exercises = []
    for ex_name in exercises:
        profile = profiles.get(ex_name)
        if profile and profile.current_working_weight:
            targets = get_next_session_targets(profile, db)
            plan_exercises.append({
                "name": ex_name,
                "sets": targets["sets"],
                "reps": targets["reps"],
                "weight": targets["weight"],
                "rest_seconds": 120 if exercises.index(ex_name) < 2 else 90,
                "notes": targets["rationale"],
            })
        else:
            plan_exercises.append({
                "name": ex_name,
                "sets": 3,
                "reps": 8,
                "weight": None,
                "rest_seconds": 90,
                "notes": "Establish baseline — use moderate weight.",
            })

    return {
        "exercises": plan_exercises,
        "pre_jog": {"minutes": 12, "pace": "easy conversational"} if day_type != "cardio" else None,
        "coach_notes": "Auto-generated plan (LLM unavailable). Follow progressive overload targets.",
        "estimated_duration_minutes": 55,
    }


def get_day_type_for_date(target_date: Optional[date] = None) -> str:
    """Get the scheduled day type based on the weekly template."""
    d = target_date or date.today()
    schedule = {
        0: "push",       # Monday
        1: "pull",       # Tuesday
        2: "legs",       # Wednesday
        3: "rest",       # Thursday
        4: "cardio",     # Friday
        5: "basketball", # Saturday
        6: "rest",       # Sunday
    }
    return schedule[d.weekday()]
