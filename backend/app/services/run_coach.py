"""AI Run Coach — Training plan generation and post-run feedback.

Part 3 upgrades applied here:
  3C. 90-day run history (was 10 most-recent runs)
  3D. Race-specific taper (5K=1wk, 10K=2wk, half=2-3wk, marathon=3wk)
  3E. Dynamic system prompt with load status, pace trends, and observations
      Running observations saved after every run via run_plan_adapter.
"""

import json
import logging
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.run import (
    PersonalRecord, PlannedRun, RunSession, RunningProfile, TrainingPlan,
)
from app.services.llm import SONNET, structured_output, generate_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Taper config (3D)
# ---------------------------------------------------------------------------

# (taper_weeks, volume_reductions_by_week — last week is race week)
TAPER_CONFIG: dict[str, tuple[int, list[float]]] = {
    "5k":            (1, [0.75]),                    # 1 taper week at 75%
    "10k":           (2, [0.80, 0.65]),              # 2 taper weeks
    "half_marathon": (2, [0.75, 0.55]),              # 2 taper weeks
    "marathon":      (3, [0.80, 0.65, 0.50]),        # 3 taper weeks
}

# ---------------------------------------------------------------------------
# Static coaching philosophy (persona doesn't change)
# ---------------------------------------------------------------------------

_RUN_COACH_BASE = """You are an elite running coach building progressive training plans for a hybrid
athlete. Your client does strength training (Push/Pull/Legs Mon-Fri), plays basketball Saturday,
and runs on available days around this schedule.
Sunday is ALWAYS a full rest day — no running, no exceptions.
DO NOT schedule runs on Mon/Tue/Wed (strength days) or Sat (basketball).

Your coaching philosophy:
- 80/20 rule: 80% of miles at easy/conversational pace, 20% at tempo or faster.
- Build aerobic base before adding speed work.
- Max 10% weekly mileage increase. Every 4th week is a deload (volume -30-40%).
- Recovery is non-negotiable. Poor sleep or lingering fatigue → rest or very easy only.
- Basketball on Saturday counts as cross-training intensity.

Run types: easy, tempo, intervals, long, recovery, fartlek, progression
Easy = 9:00-10:30/mi, Tempo = 7:30-8:30/mi, Intervals = 6:30-7:30/mi"""


def _build_run_coach_system(
    user_id: int,
    db: Session,
    goal_type: str,
) -> str:
    """Build a dynamic system prompt with current load and observations (3E)."""
    from app.models.coaching import CoachingObservation
    from app.models.run import RunningProfile
    from app.services.training_load import get_training_loads

    profile = db.query(RunningProfile).filter(RunningProfile.user_id == user_id).first()
    loads = get_training_loads(user_id, db)

    observations = (
        db.query(CoachingObservation)
        .filter(
            CoachingObservation.user_id == user_id,
            CoachingObservation.is_active == True,
            CoachingObservation.category == "running",
        )
        .order_by(CoachingObservation.created_at.desc())
        .limit(5)
        .all()
    )

    extra_lines: list[str] = []

    # Current pace benchmarks
    if profile and profile.estimated_easy_pace:
        em, es = divmod(profile.estimated_easy_pace, 60)
        extra_lines.append(f"\nAthlete's current easy pace: {em}:{es:02d}/mi.")
    if profile and profile.estimated_tempo_pace:
        tm, ts = divmod(profile.estimated_tempo_pace, 60)
        extra_lines.append(f"Tempo pace: {tm}:{ts:02d}/mi.")

    # Load status
    extra_lines.append(
        f"\nCurrent training load: {loads['zone']} (A:C = {loads['ac_ratio']:.2f}). "
        f"{loads['recommendation']}"
    )

    # Goal hint
    goal_hints = {
        "5k":           "Goal: 5K. Prioritise VO2max intervals and tempo work.",
        "10k":          "Goal: 10K. Mix aerobic base with lactate-threshold tempo.",
        "half_marathon": "Goal: Half marathon. Long runs and tempo are the pillars.",
        "marathon":     "Goal: Marathon. Aerobic base is everything — long easy miles.",
        "base_building": "Goal: Base building. Easy miles only, no quality work until wk 5+.",
        "general":      "Goal: General fitness. Balanced mix of easy and tempo work.",
    }
    extra_lines.append(f"\n{goal_hints.get(goal_type, '')}")

    # Recent running observations
    if observations:
        extra_lines.append("\nRecent running notes:")
        for obs in observations:
            extra_lines.append(f"  • {obs.observation}")

    return _RUN_COACH_BASE + "\n" + "".join(extra_lines)


# ---------------------------------------------------------------------------
# Plan generation (3C + 3D)
# ---------------------------------------------------------------------------

async def generate_training_plan(
    user_id: int,
    goal_type: str,
    fitness_level: str,
    available_days: Optional[list[int]],
    target_race_date: Optional[date],
    db: Session,
) -> dict[str, Any]:
    """Generate a multi-week training plan via the Run Coach."""

    # 3C — load last 90 days of runs (not just 10)
    cutoff_90 = date.today() - timedelta(days=90)
    recent_runs = (
        db.query(RunSession)
        .filter(
            RunSession.user_id == user_id,
            RunSession.status == "completed",
            RunSession.run_date >= cutoff_90,
            RunSession.deleted_at.is_(None),
        )
        .order_by(RunSession.run_date.desc())
        .all()
    )

    # Build run history string with weekly mileage trends
    run_history = _build_run_history_context(recent_runs)

    # Running profile
    profile = db.query(RunningProfile).filter(RunningProfile.user_id == user_id).first()
    profile_context = ""
    if profile:
        profile_context = (
            f"Current weekly miles: {profile.current_weekly_miles or 'unknown'}. "
            f"Easy pace: {profile.estimated_easy_pace or 'unknown'}s/mi. "
        )

    days_str = ", ".join(
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]
        for d in (available_days or [1, 4, 6])
    )

    # Determine plan length + taper
    if target_race_date:
        total_weeks = max(4, min(20, (target_race_date - date.today()).days // 7))
    else:
        total_weeks = {
            "base_building": 8, "5k": 8, "10k": 10,
            "half_marathon": 12, "marathon": 16, "general": 8,
        }.get(goal_type, 8)

    # 3D — taper specification
    taper_weeks, taper_reductions = TAPER_CONFIG.get(goal_type, (0, []))
    taper_instruction = ""
    if taper_weeks and total_weeks >= taper_weeks + 2:
        reductions_str = ", ".join(
            f"week {total_weeks - taper_weeks + i + 1}: {int(r * 100)}% volume"
            for i, r in enumerate(taper_reductions)
        )
        taper_instruction = (
            f"\nTAPER: Final {taper_weeks} week(s) are taper — "
            f"reduce volume progressively ({reductions_str}) but maintain intensity. "
            f"Last week is race week: very easy miles only, strides to stay sharp."
        )

    prompt = f"""Generate a {total_weeks}-week {goal_type.replace('_', ' ')} training plan.

Fitness level: {fitness_level}
Available run days: {days_str}
{profile_context}

{run_history}

Day numbers: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
Pace in seconds per mile (e.g., 570 = 9:30/mi).
Include warmup/cooldown in structured runs.
Deload weeks: week 4, 8, 12 at ~30-40% volume reduction.
80% easy miles, 20% quality.
DO NOT schedule runs on Mon/Tue/Wed (strength days) or Sat (basketball).
{taper_instruction}"""

    training_plan_schema = {
        "type": "object",
        "properties": {
            "total_weeks": {"type": "integer"},
            "weekly_plans": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "week":        {"type": "integer"},
                        "focus":       {"type": "string"},
                        "total_miles": {"type": "number"},
                        "runs": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "day_of_week":            {"type": "integer"},
                                    "run_type":               {"type": "string", "enum": ["easy", "tempo", "intervals", "long", "recovery", "fartlek", "progression"]},
                                    "distance_miles":         {"type": "number"},
                                    "target_pace_seconds":    {"type": "integer"},
                                    "duration_minutes":       {"type": "integer"},
                                    "description":            {"type": "string"},
                                    "structure": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "type":    {"type": "string", "enum": ["warmup", "work", "cooldown", "recovery"]},
                                                "minutes": {"type": "integer"},
                                                "pace":    {"type": "string"},
                                            },
                                            "required": ["type", "minutes", "pace"],
                                        },
                                    },
                                },
                                "required": [
                                    "day_of_week", "run_type", "distance_miles",
                                    "target_pace_seconds", "duration_minutes", "description",
                                ],
                            },
                        },
                    },
                    "required": ["week", "focus", "total_miles", "runs"],
                },
            },
            "coach_notes": {"type": "string"},
        },
        "required": ["total_weeks", "weekly_plans", "coach_notes"],
    }

    system = _build_run_coach_system(user_id, db, goal_type)

    try:
        return await structured_output(
            system=system,
            user_prompt=prompt,
            tool_name="submit_training_plan",
            tool_description="Submit the structured multi-week training plan.",
            output_schema=training_plan_schema,
            model=SONNET,
            max_tokens=8192,
        )
    except Exception as e:
        logger.warning("Plan generation failed: %s — using fallback", e)
        return _fallback_plan(goal_type, fitness_level, total_weeks, available_days or [1, 4, 6])


# ---------------------------------------------------------------------------
# Run history context builder (3C)
# ---------------------------------------------------------------------------

def _build_run_history_context(runs: list[RunSession]) -> str:
    """Build a concise run history string including weekly mileage trends."""
    if not runs:
        return "No recent run history."

    lines = [f"Run history (last {len(runs)} runs, ~90 days):"]

    # Weekly mileage summary (last 8 weeks)
    weeks: dict[int, float] = {}
    today = date.today()
    for r in runs:
        days_ago = (today - r.run_date).days
        week_num = days_ago // 7
        if week_num < 8:
            weeks[week_num] = weeks.get(week_num, 0.0) + (r.distance_miles or 0)

    if weeks:
        lines.append("Weekly mileage (most recent first):")
        for wk in sorted(weeks.keys()):
            label = "this week" if wk == 0 else f"{wk}wk ago"
            lines.append(f"  {label}: {weeks[wk]:.1f} miles")

    # Pace progression: last 10 runs
    lines.append("Recent runs (newest first):")
    for r in runs[:10]:
        pace_str = f"{r.avg_pace_seconds // 60}:{r.avg_pace_seconds % 60:02d}/mi" if r.avg_pace_seconds else "?"
        lines.append(f"  {r.run_date}: {r.distance_miles}mi {r.run_type or 'easy'} @ {pace_str}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Fallback plan
# ---------------------------------------------------------------------------

def _fallback_plan(
    goal_type: str, fitness_level: str, weeks: int, available_days: list[int]
) -> dict[str, Any]:
    """Generate a basic plan without LLM."""
    base_miles = {"beginner": 8, "intermediate": 15, "advanced": 25}.get(fitness_level, 15)
    easy_pace  = {"beginner": 630, "intermediate": 570, "advanced": 510}.get(fitness_level, 570)

    # Taper last N weeks
    taper_weeks, taper_reductions = TAPER_CONFIG.get(goal_type, (0, []))

    weekly_plans = []
    for w in range(1, weeks + 1):
        is_deload = w % 4 == 0
        taper_idx = weeks - w  # 0 = last week, 1 = penultimate, etc.

        if taper_idx < len(taper_reductions):
            multiplier = taper_reductions[-(taper_idx + 1)]
            focus = f"taper week {taper_weeks - taper_idx}"
        elif is_deload:
            multiplier = 0.65
            focus = "deload"
        else:
            multiplier = 1 + (w - 1) * 0.08
            focus = "base building" if w <= 3 else "building"

        week_miles = round(base_miles * multiplier, 1)
        runs = []
        for i, day in enumerate(available_days):
            if i == 0:
                dist = round(week_miles * 0.30, 1)
                runs.append(_easy_run(day, dist, easy_pace))
            elif i == 1:
                dist  = round(week_miles * 0.25, 1)
                rtype = "easy" if (is_deload or w <= 3) else "tempo"
                pace  = easy_pace if rtype == "easy" else easy_pace - 60
                runs.append(_quality_run(day, dist, pace, rtype))
            else:
                dist = round(week_miles * 0.45, 1)
                runs.append(_long_run(day, dist, easy_pace + 15))

        weekly_plans.append({"week": w, "focus": focus, "total_miles": week_miles, "runs": runs})

    return {
        "total_weeks": weeks,
        "weekly_plans": weekly_plans,
        "coach_notes": (
            f"{goal_type.replace('_', ' ').title()} plan: {weeks} weeks, "
            f"base {base_miles} mi/week. Deload every 4th week."
            + (f" {taper_weeks}-week taper included." if taper_weeks else "")
        ),
    }


def _easy_run(day: int, dist: float, easy_pace: int) -> dict:
    dur = int(dist * easy_pace / 60)
    return {
        "day_of_week": day, "run_type": "easy",
        "distance_miles": dist, "target_pace_seconds": easy_pace,
        "duration_minutes": dur, "description": f"Easy {dist} miles",
        "structure": [
            {"type": "warmup",   "minutes": 5,      "pace": "easy"},
            {"type": "work",     "minutes": dur - 10, "pace": f"{easy_pace // 60}:{easy_pace % 60:02d}/mi"},
            {"type": "cooldown", "minutes": 5,      "pace": "easy"},
        ],
    }


def _quality_run(day: int, dist: float, pace: int, rtype: str) -> dict:
    dur = int(dist * pace / 60)
    return {
        "day_of_week": day, "run_type": rtype,
        "distance_miles": dist, "target_pace_seconds": pace,
        "duration_minutes": dur, "description": f"{rtype.title()} {dist} miles",
        "structure": [
            {"type": "warmup",   "minutes": 10,     "pace": "easy"},
            {"type": "work",     "minutes": dur - 15, "pace": f"{pace // 60}:{pace % 60:02d}/mi"},
            {"type": "cooldown", "minutes": 5,      "pace": "easy"},
        ],
    }


def _long_run(day: int, dist: float, pace: int) -> dict:
    dur = int(dist * pace / 60)
    return {
        "day_of_week": day, "run_type": "long",
        "distance_miles": dist, "target_pace_seconds": pace,
        "duration_minutes": dur,
        "description": f"Long run {dist} miles — easy, focus on time on feet",
        "structure": [
            {"type": "warmup",   "minutes": 10,      "pace": "easy"},
            {"type": "work",     "minutes": dur - 15, "pace": "easy"},
            {"type": "cooldown", "minutes": 5,       "pace": "easy"},
        ],
    }


# ---------------------------------------------------------------------------
# Plan creation (unchanged logic, preserved from original)
# ---------------------------------------------------------------------------

def create_plan_from_ai(
    user_id: int, plan_data: dict[str, Any], goal_type: str,
    fitness_level: str, available_days: Optional[str],
    target_race_date: Optional[date], db: Session,
) -> TrainingPlan:
    """Create TrainingPlan + PlannedRun records from AI-generated plan data."""
    total_weeks = plan_data.get("total_weeks", 8)
    today = date.today()

    plan = TrainingPlan(
        user_id=user_id, goal_type=goal_type, fitness_level=fitness_level,
        start_date=today, end_date=today + timedelta(weeks=total_weeks),
        current_week=1, total_weeks=total_weeks,
        weekly_plan=json.dumps(plan_data.get("weekly_plans", [])),
        status="active", available_days=available_days,
        target_race_date=target_race_date,
    )
    db.add(plan)
    db.flush()

    for week_data in plan_data.get("weekly_plans", []):
        week_num  = week_data["week"]
        week_start = today + timedelta(weeks=week_num - 1)

        for run_data in week_data.get("runs", []):
            day_of_week = run_data["day_of_week"]
            planned_date = week_start + timedelta(days=day_of_week - week_start.weekday())
            if planned_date < week_start:
                planned_date += timedelta(weeks=1)

            db.add(PlannedRun(
                plan_id=plan.id, week_number=week_num, day_of_week=day_of_week,
                planned_date=planned_date,
                run_type=run_data["run_type"],
                target_distance_miles=run_data.get("distance_miles"),
                target_pace_seconds=run_data.get("target_pace_seconds"),
                target_duration_minutes=run_data.get("duration_minutes"),
                description=run_data.get("description"),
                structure=json.dumps(run_data["structure"]) if run_data.get("structure") else None,
                status="upcoming",
            ))

    db.commit()
    db.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# Post-run feedback (3E — uses dynamic system prompt)
# ---------------------------------------------------------------------------

async def generate_post_run_feedback(
    run: RunSession, planned_run: Optional[PlannedRun], db: Session
) -> str:
    """Generate AI feedback after completing a run."""
    splits_text = ""
    if run.splits:
        splits_text = "Splits: " + ", ".join(
            f"Mi {s.mile_number}: {s.pace_formatted}" for s in run.splits
        )

    plan_context = ""
    if planned_run:
        plan_context = (
            f"Planned: {planned_run.run_type} run, "
            f"{planned_run.target_distance_miles}mi at "
            f"{planned_run.target_pace_seconds}s/mi pace. "
        )

    prompt = f"""Post-run analysis. Be brief (3-4 sentences max).

Run: {run.distance_miles}mi in {run.duration_formatted} ({run.avg_pace_formatted}/mi avg)
Type: {run.run_type or 'easy'}
{plan_context}
{splits_text}
RPE: {run.rpe or 'not rated'}

What went well? What to improve? How does this fit the training plan?"""

    # Use dynamic system for richer context
    system = _build_run_coach_system(run.user_id, db, "general")

    try:
        return await generate_text(system=system, user_prompt=prompt, model=SONNET)
    except Exception:
        return "Run logged. Keep building consistency."


# ---------------------------------------------------------------------------
# PR detection (unchanged)
# ---------------------------------------------------------------------------

def detect_personal_records(
    run: RunSession, user_id: int, db: Session
) -> list[dict[str, Any]]:
    """Check if this run contains any PRs."""
    new_prs = []
    distance_labels = {
        1.0: "mile", 3.1: "5k", 6.2: "10k", 13.1: "half_marathon", 26.2: "marathon",
    }

    for target_miles, label in distance_labels.items():
        if run.distance_miles < target_miles:
            continue

        if target_miles <= 1.0 and run.splits:
            time_seconds = min(run.splits, key=lambda s: s.pace_seconds).pace_seconds
        elif target_miles == run.distance_miles:
            time_seconds = run.duration_seconds
        else:
            time_seconds = int((run.duration_seconds / run.distance_miles) * target_miles)

        existing_pr = (
            db.query(PersonalRecord)
            .filter(PersonalRecord.user_id == user_id, PersonalRecord.distance_label == label)
            .first()
        )

        if not existing_pr or time_seconds < existing_pr.time_seconds:
            if existing_pr:
                existing_pr.time_seconds = time_seconds
                existing_pr.record_date  = run.run_date
                existing_pr.run_id       = run.id
            else:
                db.add(PersonalRecord(
                    user_id=user_id, run_id=run.id,
                    distance_label=label, time_seconds=time_seconds,
                    record_date=run.run_date,
                ))
            new_prs.append({"distance_label": label, "time_seconds": time_seconds})

    if new_prs:
        run.is_pr   = True
        run.pr_type = new_prs[0]["distance_label"]
        db.commit()

    return new_prs
