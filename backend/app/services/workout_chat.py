"""Live Workout Chat — Elite AI Coach during sessions (P2-3).

Routes ALL messages through Claude for intelligent coaching.
Uses tool_use for structured responses (parsed sets, coaching, adjustments).
"""

import json
import logging
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession
from app.services.llm import SONNET, structured_output
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

Use the submit_coach_response tool to return your structured response.
If no sets to parse, return empty parsed_sets []. ALWAYS include a coach_response.
The coach_response should feel like texting your trainer — casual, direct, human."""

CHAT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "parsed_sets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "exercise_name": {"type": "string", "description": "Normalized exercise name (e.g. 'Bench Press', not 'bench')"},
                    "weight": {"type": "number"},
                    "reps": {"type": "integer"},
                    "rpe": {"type": "number", "description": "Rate of perceived exertion if mentioned"},
                    "set_number": {"type": "integer"},
                },
                "required": ["exercise_name", "weight", "reps", "set_number"],
            },
            "description": "Sets parsed from the athlete's message. Empty array if no sets mentioned.",
        },
        "coach_response": {"type": "string", "description": "2-4 sentence coaching response — casual, direct, human"},
        "adjustments": {
            "type": "object",
            "properties": {
                "exercises": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "sets": {"type": "integer"},
                            "reps": {"type": "integer"},
                            "weight": {"type": "number"},
                            "rest_seconds": {"type": "integer"},
                            "notes": {"type": "string"},
                        },
                        "required": ["name", "sets", "reps"],
                    },
                },
                "reason": {"type": "string"},
            },
            "required": ["exercises", "reason"],
            "description": "Only include if the athlete requested plan modifications. Otherwise omit.",
        },
        "session_complete": {"type": "boolean", "description": "True only if the athlete said they're done with the workout"},
    },
    "required": ["parsed_sets", "coach_response", "session_complete"],
}


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
        parsed = await structured_output(
            system=COACH_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            tool_name="submit_coach_response",
            tool_description="Submit the coaching response with any parsed sets, adjustments, and session status.",
            output_schema=CHAT_RESPONSE_SCHEMA,
            model=SONNET,
        )
    except Exception as e:
        logger.error(f"Coach chat call failed: {e}")
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
            from app.services.progressive_overload import update_profiles_after_session
            update_profiles_after_session(session, db)
        except Exception as e:
            logger.warning("Failed to update profiles after session: %s", e)

        # Generate and persist coaching observations (2D)
        try:
            await _analyze_session_and_save_observations(session, db)
        except Exception as e:
            logger.warning("Failed to save session observations: %s", e)

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
            from app.services.progressive_overload import update_profiles_after_session
            update_profiles_after_session(session, db)
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


# ---------------------------------------------------------------------------
# Post-session observation analysis (2D)
# ---------------------------------------------------------------------------

_OBSERVATION_SCHEMA = {
    "type": "object",
    "properties": {
        "observations": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "observation": {
                        "type": "string",
                        "description": "Specific, actionable observation in 1-2 sentences",
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Confidence 0.0-1.0",
                    },
                    "category": {
                        "type": "string",
                        "enum": ["strength", "running", "general"],
                    },
                },
                "required": ["observation", "confidence", "category"],
            },
        },
    },
    "required": ["observations"],
}


async def _analyze_session_and_save_observations(
    session: WorkoutSession,
    db: Session,
) -> None:
    """Analyze planned-vs-actual and persist 2-3 coaching observations.

    Called after session_complete.  Uses Haiku (cheap + fast) since this
    is a background analysis step, not a real-time response.
    """
    from app.models.coaching import CoachingObservation
    from app.services.llm import HAIKU, structured_output

    working_sets = [e for e in session.exercises if not e.is_warmup]
    if not working_sets:
        return

    # Build planned section
    planned_str = ""
    if session.ai_plan:
        try:
            plan = json.loads(session.ai_plan) if isinstance(session.ai_plan, str) else session.ai_plan
            planned_exercises = plan.get("exercises", [])
            if planned_exercises:
                planned_str = "Planned:\n" + "\n".join(
                    f"  {e.get('name')}: {e.get('sets')}×{e.get('reps')} "
                    f"@ {e.get('weight', '?')}lbs"
                    for e in planned_exercises
                )
        except (json.JSONDecodeError, TypeError):
            pass

    # Build actual section
    exercise_groups: Dict[str, List[ExerciseLog]] = {}
    for log in working_sets:
        exercise_groups.setdefault(log.exercise_name, []).append(log)

    actual_lines = ["Actual:"]
    for name, logs in exercise_groups.items():
        best_e1rm = max(
            (estimate_1rm(l.weight or 0, l.reps or 0) for l in logs), default=0
        )
        max_weight = max((l.weight or 0) for l in logs)
        max_reps   = max((l.reps   or 0) for l in logs)
        actual_lines.append(
            f"  {name}: {len(logs)} sets, "
            f"top {max_weight:.0f}lbs×{max_reps}r, "
            f"e1RM ~{best_e1rm:.0f}"
        )
    actual_str = "\n".join(actual_lines)

    prompt = f"""Analyze this completed {session.day_type.upper()} session and generate 2-3 specific coaching observations.
Be precise and data-driven. No vague encouragement — concrete patterns only.

RPE: {session.overall_rpe or 'N/A'} | WHOOP recovery: {session.whoop_recovery_score or '?'}%

{planned_str}

{actual_str}

Focus on:
- Progress or regression vs previous sessions
- Volume/intensity execution vs plan
- Specific exercises ready for progression or needing a fix
- Fatigue patterns or recovery implications"""

    try:
        result = await structured_output(
            system=(
                "You are a data-driven strength coach. Analyze workout logs and "
                "generate specific, actionable observations. Numbers only — "
                "no vague encouragement."
            ),
            user_prompt=prompt,
            tool_name="submit_observations",
            tool_description="Submit 2-3 post-session coaching observations.",
            output_schema=_OBSERVATION_SCHEMA,
            model=HAIKU,
        )

        saved = 0
        for obs_data in result.get("observations", []):
            text = obs_data.get("observation", "").strip()
            if not text:
                continue
            db.add(CoachingObservation(
                user_id=session.user_id,
                category=obs_data.get("category", "strength"),
                observation=text,
                source=f"session_{session.id}",
                confidence=float(obs_data.get("confidence", 0.8)),
                is_active=True,
            ))
            saved += 1

        logger.info("Saved %d coaching observations for session %d", saved, session.id)

    except Exception as e:
        logger.warning("Observation analysis failed for session %d: %s", session.id, e)
