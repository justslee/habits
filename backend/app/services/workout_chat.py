"""Live Workout Chat — Elite AI Coach during sessions (P2-3).

Routes ALL messages through Clawdbot for intelligent coaching.
Handles set logging, conversation, motivation, form tips, and adjustments.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession
from app.services.evaluation import call_clawdbot
from app.services.progressive_overload import estimate_1rm

logger = logging.getLogger(__name__)

COACH_SYSTEM_PROMPT = """You are an elite strength & conditioning coach working with your athlete
during a LIVE workout session. Think: a hybrid of Ben Patrick (Knees Over Toes),
Jeff Cavaliere (AthleanX), and a D1 strength coach — direct, knowledgeable,
no-nonsense, but genuinely invested in this athlete's progress.

Your personality:
- Direct and efficient. No fluff, no "great question!" — just coach.
- Encouraging but HONEST. If form sounds sketchy, say so.
- You remember what they've done this session and push them appropriately.
- You celebrate genuine effort and PRs. You call out sandbagging.
- Occasionally drop knowledge bombs (biomechanics, programming rationale).
- Brief responses (2-4 sentences usually). This is mid-workout, not a lecture.

CRITICAL RULES:
- NEVER program tricep dips. The athlete has shoulder issues from dips. Use pushdowns,
  skull crushers, or overhead extensions instead.
- If someone reports pain or discomfort, take it seriously. Suggest modifications.
- Progressive overload is king. Track their numbers mentally and push for progress.

You have FOUR jobs every message:

1. **PARSE** — If the message contains set data (weight, reps, exercise), extract it.
   Common formats: "bench 165 for 5", "got 3 reps at 185", "bench — 165×5, 165×5",
   "did 3x8 at 135 on squat", "just hit 225 for a double"
   Normalize names: "bench" → "Bench Press", "ohp" → "OHP", "squat" → "Barbell Squat"

2. **COACH** — Respond to whatever they said. Could be:
   - Logging a set → acknowledge + brief feedback on the numbers
   - Asking a question → answer it (form, programming, alternatives)
   - General chat → be human, be a coach. Motivate, joke, whatever fits.
   - Saying they're tired/struggling → adjust expectations, suggest modifications
   - Asking what's next → guide them through the workout plan

3. **ADJUST** — If the athlete asks to modify the plan (time constraint, fatigue, injury, swap exercise),
   return an "adjustments" object with the updated full exercise list. Otherwise null.
   Format: {"adjustments": {"exercises": [...full updated list...], "reason": "short explanation"}}
   Each exercise: {"name": "Exercise Name", "sets": 3, "reps": 8, "weight": 135, "rest_seconds": 90, "notes": "optional"}

4. **COMPLETE** — If the athlete says they're done/finished with the workout, return:
   {"session_complete": true}
   Give a brief wrap-up: summarize what was accomplished, note any PRs, give encouragement.
   Otherwise return {"session_complete": false}.

ALWAYS respond with valid JSON:
{
  "parsed_sets": [
    {"exercise_name": "Bench Press", "weight": 165, "reps": 5, "rpe": null, "set_number": 1}
  ],
  "coach_response": "Your response as a coach (2-4 sentences, conversational)",
  "adjustments": null,
  "session_complete": false
}

If no sets to parse, return empty parsed_sets []. ALWAYS include a coach_response.
The coach_response should feel like texting your trainer — casual, direct, human."""


def _build_chat_context(session: WorkoutSession, db: Session) -> str:
    """Build context of what's been done so far in the session."""
    lines = [f"Session type: {session.day_type.upper()} day"]

    # Whoop context
    if session.whoop_recovery_score:
        lines.append(f"Whoop recovery: {session.whoop_recovery_score}%")
        if session.whoop_hrv:
            lines.append(f"HRV: {session.whoop_hrv}, RHR: {session.whoop_resting_hr}")

    if session.ai_plan:
        try:
            plan = json.loads(session.ai_plan) if isinstance(session.ai_plan, str) else session.ai_plan
            if isinstance(plan, dict):
                exercises = plan.get("exercises", [])
                if exercises:
                    lines.append("\nToday's plan:")
                    for ex in exercises:
                        name = ex.get("name", ex.get("exercise_name", "?"))
                        sets = ex.get("sets", "?")
                        reps = ex.get("reps", "?")
                        weight = ex.get("weight", "?")
                        lines.append(f"  - {name}: {sets}x{reps} @ {weight}lbs")
                if plan.get("coach_notes"):
                    lines.append(f"\nCoach notes: {plan['coach_notes']}")
        except (json.JSONDecodeError, TypeError):
            lines.append(f"\nPlanned workout: {str(session.ai_plan)[:300]}")

    # Completed sets
    completed = [e for e in session.exercises if not e.is_warmup]
    if completed:
        lines.append("\nCompleted so far:")
        exercise_groups = {}  # type: Dict[str, List[ExerciseLog]]
        for log in completed:
            exercise_groups.setdefault(log.exercise_name, []).append(log)

        for name, logs in exercise_groups.items():
            sets_str = ", ".join(
                f"{l.weight}x{l.reps}" + (f" @RPE{l.rpe}" if l.rpe else "")
                for l in sorted(logs, key=lambda x: x.set_number)
            )
            total_volume = sum(l.volume_load for l in logs)
            best_e1rm = max((estimate_1rm(l.weight or 0, l.reps or 0) for l in logs), default=0)
            lines.append(f"  - {name}: {sets_str} (vol: {total_volume}, e1RM: {best_e1rm})")
    else:
        lines.append("\nNo sets logged yet — session just started.")

    # Exercise profiles for context
    exercise_names = set(e.exercise_name for e in session.exercises)
    if exercise_names:
        profiles = (
            db.query(ExerciseProfile)
            .filter(
                ExerciseProfile.user_id == session.user_id,
                ExerciseProfile.exercise_name.in_(exercise_names),
            )
            .all()
        )
        if profiles:
            lines.append("\nAthlete's profiles:")
            for p in profiles:
                lines.append(
                    f"  - {p.exercise_name}: working weight {p.current_working_weight}lbs, "
                    f"e1RM {p.estimated_1rm or '?'}, status: {p.progression_status}"
                )

    return "\n".join(lines)


async def process_chat_message(
    session: WorkoutSession,
    message: str,
    db: Session,
) -> dict[str, Any]:
    """Process a chat message during a live workout.

    Routes through Clawdbot for intelligent coaching responses.
    Falls back gracefully if LLM is unavailable.
    """
    context = _build_chat_context(session, db)

    # Build conversation with context
    user_prompt = f"""WORKOUT CONTEXT:
{context}

ATHLETE SAYS: {message}"""

    try:
        raw_response = await call_clawdbot(COACH_SYSTEM_PROMPT, user_prompt)
        content = raw_response["choices"][0]["message"]["content"].strip()

        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        # LLM responded but not valid JSON — try to extract coach_response
        logger.warning(f"Chat JSON parse failed: {e}")
        try:
            # Sometimes LLM returns text before/after JSON
            raw = raw_response["choices"][0]["message"]["content"].strip()
            return {
                "coach_response": raw[:500],
                "parsed_sets": [],
                "session_summary": None,
            }
        except Exception:
            return _fallback_response(message, session, db)
    except Exception as e:
        logger.error(f"Clawdbot chat call failed: {e}")
        return _fallback_response(message, session, db)

    # Log parsed sets to the session
    logged_sets = []
    for s in parsed.get("parsed_sets", []):
        exercise_name = s.get("exercise_name", "")
        if not exercise_name:
            continue

        existing = [
            e for e in session.exercises
            if e.exercise_name == exercise_name and not e.is_warmup
        ]
        set_num = s.get("set_number") or (len(existing) + 1)

        log = ExerciseLog(
            session_id=session.id,
            exercise_name=exercise_name,
            exercise_order=0,
            set_number=set_num,
            weight=s.get("weight"),
            reps=s.get("reps"),
            rpe=s.get("rpe"),
        )
        db.add(log)
        logged_sets.append({
            "exercise_name": exercise_name,
            "set_number": set_num,
            "weight": s.get("weight"),
            "reps": s.get("reps"),
        })

    if logged_sets:
        session.status = "in_progress"

    # Process plan adjustments
    adjustments = parsed.get("adjustments")
    if adjustments and isinstance(adjustments, dict):
        updated_exercises = adjustments.get("exercises")
        if updated_exercises:
            plan = json.loads(session.ai_plan) if isinstance(session.ai_plan, str) else session.ai_plan or {}
            plan["exercises"] = updated_exercises
            plan["coach_notes"] = adjustments.get("reason", plan.get("coach_notes", ""))
            session.ai_plan = json.dumps(plan)
            logger.info("Plan adjusted for session %d: %s", session.id, adjustments.get("reason"))

    # Process session completion
    session_completed = False
    if parsed.get("session_complete"):
        session.status = "completed"
        session_completed = True
        # Calculate overall RPE from set-level RPEs if available
        set_rpes = [e.rpe for e in session.exercises if e.rpe is not None]
        if set_rpes:
            session.overall_rpe = round(sum(set_rpes) / len(set_rpes))
        logger.info("Session %d completed via coach chat", session.id)

        # Update exercise profiles with progressive overload data
        try:
            from app.services.progressive_overload import update_profile_after_session
            exercise_names = set(e.exercise_name for e in session.exercises if not e.is_warmup)
            for name in exercise_names:
                profile = (
                    db.query(ExerciseProfile)
                    .filter(ExerciseProfile.user_id == session.user_id, ExerciseProfile.exercise_name == name)
                    .first()
                )
                if profile:
                    logs = [e for e in session.exercises if e.exercise_name == name]
                    update_profile_after_session(profile, logs, db)
        except Exception as e:
            logger.warning("Failed to update profiles after session: %s", e)

    db.commit()

    return {
        "coach_response": parsed.get("coach_response", "Let's get after it."),
        "parsed_sets": logged_sets,
        "plan_updated": bool(adjustments and adjustments.get("exercises")),
        "session_completed": session_completed,
        "session_summary": None,
    }


def _fallback_response(
    message: str, session: WorkoutSession, db: Session
) -> dict[str, Any]:
    """Fallback when Clawdbot is unavailable. Still tries to be useful."""
    msg_lower = message.lower().strip()

    # Completion detection
    completion_phrases = {"done", "finished", "that's it", "all done", "i'm done",
                          "workout complete", "that's the workout", "im done",
                          "thats it", "i finished", "we're done", "wrap it up"}
    if any(phrase in msg_lower for phrase in completion_phrases):
        session.status = "completed"
        set_rpes = [e.rpe for e in session.exercises if e.rpe is not None]
        if set_rpes:
            session.overall_rpe = round(sum(set_rpes) / len(set_rpes))
        db.commit()

        try:
            from app.services.progressive_overload import update_profile_after_session
            exercise_names = set(e.exercise_name for e in session.exercises if not e.is_warmup)
            for name in exercise_names:
                profile = (
                    db.query(ExerciseProfile)
                    .filter(ExerciseProfile.user_id == session.user_id, ExerciseProfile.exercise_name == name)
                    .first()
                )
                if profile:
                    logs = [e for e in session.exercises if e.exercise_name == name]
                    update_profile_after_session(profile, logs, db)
        except Exception as e:
            logger.warning("Failed to update profiles after session: %s", e)

        return {
            "coach_response": "Great session. Everything's logged. Recovery starts now.",
            "parsed_sets": [],
            "session_completed": True,
            "plan_updated": False,
            "session_summary": None,
        }

    # Basic greeting detection
    greetings = {"hello", "hi", "hey", "sup", "yo", "what's up", "whats up"}
    if msg_lower in greetings or any(msg_lower.startswith(g) for g in greetings):
        day = session.day_type.upper() if session.day_type else "workout"
        return {
            "coach_response": f"{day} day. Let's get to work. Log your sets as you go — I'll track everything.",
            "parsed_sets": [],
            "session_summary": None,
        }

    # Try basic set parsing as last resort
    import re
    # "bench 165 for 5" or "bench 165x5"
    pattern = r"(\w[\w\s]*?)\s+(\d+)\s*(?:for|x|×)\s*(\d+)"
    match = re.search(pattern, msg_lower)
    if match:
        name = match.group(1).strip().title()
        weight = int(match.group(2))
        reps = int(match.group(3))

        existing = [
            e for e in session.exercises
            if e.exercise_name == name and not e.is_warmup
        ]
        set_num = len(existing) + 1

        log = ExerciseLog(
            session_id=session.id,
            exercise_name=name,
            exercise_order=0,
            set_number=set_num,
            weight=weight,
            reps=reps,
        )
        db.add(log)
        session.status = "in_progress"
        db.commit()

        return {
            "coach_response": f"Logged: {name} {weight}x{reps} (set {set_num}). Keep pushing.",
            "parsed_sets": [{"exercise_name": name, "set_number": set_num, "weight": weight, "reps": reps}],
            "session_summary": None,
        }

    return {
        "coach_response": "Coach is warming up — try again in a sec, or log a set like 'bench 165 for 5'.",
        "parsed_sets": [],
        "session_summary": None,
    }
