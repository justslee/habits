"""Live Workout Chat — Coach interaction during sessions (P2-3).

Parses natural language set logging and provides coaching feedback.
"""

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession
from app.services.evaluation import call_clawdbot
from app.services.progressive_overload import estimate_1rm

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT = """You are an elite S&C coach during a live workout session.
The athlete sends you updates as they complete sets. Your job:

1. PARSE their input into structured set data
2. ACKNOWLEDGE the work with brief coaching feedback
3. ADJUST remaining exercises if needed based on performance

Input examples: "bench 165 for 5", "got 3 reps at 185", "bench — 165×5, 165×5, 165×4"

Respond with valid JSON:
{
  "parsed_sets": [
    {"exercise_name": "Bench Press", "weight": 165, "reps": 5, "set_number": 1}
  ],
  "coach_response": "Brief coaching feedback (2-3 sentences max)",
  "adjustments": null or "description of any workout adjustments"
}

Rules:
- Normalize exercise names (e.g., "bench" → "Bench Press", "ohp" → "OHP")
- If athlete reports discomfort, take it seriously and suggest modification
- Be direct. No fluff. Coach voice.
- NO TRICEP DIPS — suggest pushdowns, skull crushers, or overhead extensions instead."""


def _build_chat_context(session: WorkoutSession, db: Session) -> str:
    """Build context of what's been done so far in the session."""
    lines = [f"Session: {session.day_type.upper()} day"]

    if session.ai_plan:
        lines.append(f"Planned workout: {session.ai_plan[:500]}")

    # Completed sets
    completed = [e for e in session.exercises if not e.is_warmup]
    if completed:
        lines.append("\nCompleted so far:")
        exercise_groups: dict[str, list[ExerciseLog]] = {}
        for log in completed:
            exercise_groups.setdefault(log.exercise_name, []).append(log)

        for name, logs in exercise_groups.items():
            sets_str = ", ".join(f"{l.weight}×{l.reps}" for l in logs)
            total_volume = sum(l.volume_load for l in logs)
            lines.append(f"- {name}: {sets_str} (volume: {total_volume})")
    else:
        lines.append("\nNo sets logged yet.")

    # Exercise profiles for context
    exercise_names = set(e.exercise_name for e in session.exercises)
    profiles = (
        db.query(ExerciseProfile)
        .filter(
            ExerciseProfile.user_id == session.user_id,
            ExerciseProfile.exercise_name.in_(exercise_names) if exercise_names else False,
        )
        .all()
    )
    if profiles:
        lines.append("\nAthlete profiles:")
        for p in profiles:
            lines.append(
                f"- {p.exercise_name}: working {p.current_working_weight}lbs, "
                f"e1RM {p.estimated_1rm or '?'}, {p.progression_status}"
            )

    return "\n".join(lines)


async def process_chat_message(
    session: WorkoutSession,
    message: str,
    db: Session,
) -> dict[str, Any]:
    """Process a chat message during a live workout.

    Returns dict with: coach_response, parsed_sets, session_summary
    """
    context = _build_chat_context(session, db)
    user_prompt = f"{context}\n\nAthlete says: {message}"

    try:
        raw_response = await call_clawdbot(CHAT_SYSTEM_PROMPT, user_prompt)
        content = raw_response["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        parsed = json.loads(content)
    except Exception as e:
        logger.error(f"Chat parsing failed: {e}")
        return {
            "coach_response": "Couldn't parse that. Try: 'bench 165 for 5' or 'got 5 reps at 165'.",
            "parsed_sets": [],
            "session_summary": None,
        }

    # Log parsed sets to the session
    logged_sets = []
    for s in parsed.get("parsed_sets", []):
        # Determine set number
        existing = [
            e for e in session.exercises
            if e.exercise_name == s["exercise_name"] and not e.is_warmup
        ]
        set_num = s.get("set_number", len(existing) + 1)

        log = ExerciseLog(
            session_id=session.id,
            exercise_name=s["exercise_name"],
            exercise_order=0,
            set_number=set_num,
            weight=s.get("weight"),
            reps=s.get("reps"),
            rpe=s.get("rpe"),
        )
        db.add(log)
        logged_sets.append({
            "exercise_name": s["exercise_name"],
            "set_number": set_num,
            "weight": s.get("weight"),
            "reps": s.get("reps"),
        })

    if logged_sets:
        session.status = "in_progress"
    db.commit()

    return {
        "coach_response": parsed.get("coach_response", ""),
        "parsed_sets": logged_sets,
        "session_summary": None,
    }
