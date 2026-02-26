"""AI Run Coach — Progressive running plans via Clawdbot (P3-3).

Generates training plans, provides post-run feedback, manages progressive overload.
"""

import json
import logging
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.run import PersonalRecord, RunSession, RunningProfile
from app.models.user import User
from app.services.evaluation import call_clawdbot
from app.services.whoop import get_recovery_adjustment

logger = logging.getLogger(__name__)

RUN_COACH_PROMPT = """You are an elite running coach working with a hybrid athlete.
Your client lifts Push/Pull/Legs Mon-Wed, rests Thursday, does cardio/running Friday, plays basketball Saturday, rests Sunday.

Running fits primarily on Friday (dedicated cardio day) and optionally as pre-lift jogs (10-15 min easy) on Mon-Wed.

Your coaching philosophy:
- Progressive overload: increase weekly mileage ~10% per week max
- Every 4th week is a deload: reduce volume 30-40%
- Run types: easy (conversational), tempo (comfortably hard), intervals (hard efforts with recovery), long (distance at easy pace), recovery (very easy, short)
- Friday is the primary run day. Keep it varied: alternate easy, tempo, intervals, long runs
- Never program hard running the day before basketball (Saturday)
- Whoop recovery drives intensity: low recovery = easy or skip
- Be direct. Coach voice. No fluff.

Respond with valid JSON:
{
  "run_plan": {
    "type": "easy|tempo|interval|long|recovery",
    "target_distance_miles": <float>,
    "target_pace_description": "description of target pace",
    "workout_detail": "detailed workout description",
    "estimated_duration_minutes": <int>
  },
  "coach_notes": "2-3 sentences about the plan rationale",
  "weekly_summary": "where this run fits in the weekly plan"
}"""


async def generate_run_plan(
    user_id: int,
    recovery_data: Optional[dict],
    db: Session,
) -> dict[str, Any]:
    """Generate today's run plan."""
    profile = db.query(RunningProfile).filter(RunningProfile.user_id == user_id).first()

    # Get recent run history
    recent_runs = (
        db.query(RunSession)
        .filter(RunSession.user_id == user_id, RunSession.status == "completed")
        .order_by(RunSession.run_date.desc())
        .limit(10)
        .all()
    )

    # Recovery check
    recovery_score = recovery_data.get("recovery_score") if recovery_data else None
    adjustment = get_recovery_adjustment(recovery_score)

    if adjustment["level"] == "red":
        return {
            "run_plan": {
                "type": "recovery",
                "target_distance_miles": 0,
                "target_pace_description": "Rest — no running today",
                "workout_detail": "Recovery is critically low. Walk 15-20 minutes if you want to move, but no running.",
                "estimated_duration_minutes": 0,
            },
            "coach_notes": f"Recovery at {recovery_score}%. Your body needs rest, not miles. Trust the process.",
            "weekly_summary": "Skipping today's run due to low recovery.",
        }

    # Build context
    context_lines = []
    if profile:
        context_lines.append(f"Goal: {profile.goal_type or 'base building'}")
        context_lines.append(f"Weekly target: {profile.target_weekly_miles or '?'} miles")
        context_lines.append(f"Plan week: {profile.plan_week} (deload: {profile.is_deload_week})")
        if profile.estimated_easy_pace:
            m, s = divmod(profile.estimated_easy_pace, 60)
            context_lines.append(f"Easy pace estimate: {m}:{s:02d}/mi")

    if recent_runs:
        context_lines.append("\nRecent runs:")
        for r in recent_runs[:5]:
            context_lines.append(
                f"- {r.run_date}: {r.distance_miles}mi in {r.duration_formatted} "
                f"(pace {r.avg_pace_formatted}/mi, type: {r.run_type or '?'}, RPE {r.rpe or '?'})"
            )

        # Weekly mileage
        week_start = date.today() - timedelta(days=date.today().weekday())
        week_miles = sum(
            r.distance_miles for r in recent_runs if r.run_date >= week_start
        )
        context_lines.append(f"\nThis week so far: {round(week_miles, 1)} miles")
    else:
        context_lines.append("No previous runs logged. This is a first run — establish baseline.")

    if recovery_data:
        context_lines.append(
            f"\nWhoop: Recovery {recovery_data.get('recovery_score', '?')}%, "
            f"HRV {recovery_data.get('hrv', '?')}ms, "
            f"Sleep {recovery_data.get('sleep_score', '?')}%"
        )
    context_lines.append(f"Recovery adjustment: {adjustment['note']}")

    context = "\n".join(context_lines)

    try:
        raw = await call_clawdbot(RUN_COACH_PROMPT, f"Generate today's run plan.\n\n{context}")
        content = raw["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        return json.loads(content)
    except Exception as e:
        logger.error(f"Run plan generation failed: {e}")
        return _fallback_plan(recent_runs, profile)


def _fallback_plan(
    recent_runs: list[RunSession],
    profile: Optional[RunningProfile],
) -> dict:
    """Generate a basic plan without LLM."""
    if not recent_runs:
        return {
            "run_plan": {
                "type": "easy",
                "target_distance_miles": 2.0,
                "target_pace_description": "Easy conversational pace — you should be able to talk",
                "workout_detail": "First run baseline. Start with 2 miles at easy effort. Walk breaks OK.",
                "estimated_duration_minutes": 25,
            },
            "coach_notes": "No run history — establishing baseline. Keep it easy, focus on finishing.",
            "weekly_summary": "Baseline discovery week.",
        }

    last_distance = recent_runs[0].distance_miles
    return {
        "run_plan": {
            "type": "easy",
            "target_distance_miles": round(last_distance * 1.05, 1),
            "target_pace_description": "Easy conversational pace",
            "workout_detail": f"Easy run. Target {round(last_distance * 1.05, 1)} miles at comfortable pace.",
            "estimated_duration_minutes": int(last_distance * 1.05 * 10),
        },
        "coach_notes": "Auto-generated plan (LLM unavailable). Progressive: slight distance increase from last run.",
        "weekly_summary": "Standard easy run day.",
    }


async def generate_post_run_feedback(run: RunSession, db: Session) -> str:
    """Generate AI feedback after a completed run."""
    recent = (
        db.query(RunSession)
        .filter(
            RunSession.user_id == run.user_id,
            RunSession.id != run.id,
            RunSession.status == "completed",
        )
        .order_by(RunSession.run_date.desc())
        .limit(5)
        .all()
    )

    context = (
        f"Just completed: {run.distance_miles}mi in {run.duration_formatted} "
        f"(pace {run.avg_pace_formatted}/mi, type: {run.run_type or 'easy'}, RPE {run.rpe or '?'})\n"
    )
    if run.splits:
        splits_str = ", ".join(f"Mile {s.mile_number}: {s.pace_formatted}" for s in run.splits)
        context += f"Splits: {splits_str}\n"

    if recent:
        context += "\nRecent history:\n"
        for r in recent[:3]:
            context += f"- {r.run_date}: {r.distance_miles}mi @ {r.avg_pace_formatted}/mi\n"

    try:
        raw = await call_clawdbot(
            "You are a running coach giving brief post-run feedback. Be direct, specific, encouraging when earned. 2-3 sentences max.",
            context,
        )
        return raw["choices"][0]["message"]["content"].strip()
    except Exception:
        return "Run logged. Keep building consistency."
