"""AI Run Coach — Training plan generation and post-run feedback.

Uses Claude for LLM calls. Generates Runna-style progressive training plans
with structured run types and pace targets.
"""

import json
import logging
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.run import (
    PersonalRecord, PlannedRun, RunSession, RunningProfile, TrainingPlan,
)
from app.services.evaluation import call_claude

logger = logging.getLogger(__name__)

RUN_COACH_SYSTEM = """You are an elite running coach building progressive training plans for a hybrid
athlete. Your client does strength training (Push/Cardio/Legs+Core Mon-Wed), rests Thursday,
does Pull+Core on Friday, and plays competitive basketball on Saturday.
Sunday is ALWAYS a full rest day — no running, no exceptions.
Running fits around this schedule on non-rest days only.

Your coaching philosophy:
- 80/20 rule: 80% of miles at easy/conversational pace, 20% at tempo or faster.
- Build aerobic base before adding speed work. First 4 weeks are base building
  unless client already has a mileage base.
- Weekly mileage increases max 10% per week. Every 4th week is a deload (reduce
  volume 30-40%).
- Recovery is non-negotiable. If Whoop shows red recovery, prescribe rest or very
  easy running only.
- Basketball on Saturday counts as cross-training intensity. Sunday long runs
  should account for Saturday's load.

Your communication style:
- Direct, encouraging but honest. Give specific pace targets.
- Explain why each run type matters.
- Celebrate PRs and consistency.

Run types: easy, tempo, intervals, long, recovery, fartlek, progression
Easy = 9:00-10:30/mi, Tempo = 7:30-8:30/mi, Intervals = 6:30-7:30/mi (with recovery)
"""


async def generate_training_plan(
    user_id: int,
    goal_type: str,
    fitness_level: str,
    available_days: Optional[list[int]],
    target_race_date: Optional[date],
    db: Session,
) -> dict[str, Any]:
    """Generate a multi-week training plan via Claude."""

    # Get recent run history for context
    recent_runs = (
        db.query(RunSession)
        .filter(RunSession.user_id == user_id, RunSession.status == "completed")
        .order_by(RunSession.run_date.desc())
        .limit(10)
        .all()
    )

    run_history = ""
    if recent_runs:
        run_history = "Recent runs:\n"
        for r in recent_runs:
            run_history += f"- {r.run_date}: {r.distance_miles}mi, {r.duration_formatted}, {r.run_type or 'easy'}\n"

    # Get running profile
    profile = db.query(RunningProfile).filter(RunningProfile.user_id == user_id).first()
    profile_context = ""
    if profile:
        profile_context = f"Current weekly miles: {profile.current_weekly_miles or 'unknown'}. "
        profile_context += f"Easy pace: {profile.estimated_easy_pace or 'unknown'}s/mi. "

    days_str = ", ".join(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d] for d in (available_days or [1, 4, 6]))

    # Determine plan length
    if target_race_date:
        weeks = max(4, min(16, (target_race_date - date.today()).days // 7))
    else:
        weeks = {"base_building": 8, "5k": 8, "10k": 10, "half_marathon": 12, "marathon": 16, "general": 8}.get(goal_type, 8)

    prompt = f"""Generate a {weeks}-week {goal_type.replace('_', ' ')} training plan.

Fitness level: {fitness_level}
Available run days: {days_str}
{profile_context}
{run_history}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation. Format:
{{
  "total_weeks": {weeks},
  "weekly_plans": [
    {{
      "week": 1,
      "focus": "base building",
      "total_miles": 12,
      "runs": [
        {{
          "day_of_week": 1,
          "run_type": "easy",
          "distance_miles": 3.0,
          "target_pace_seconds": 570,
          "duration_minutes": 30,
          "description": "Easy 3 miles at conversational pace",
          "structure": [
            {{"type": "warmup", "minutes": 5, "pace": "easy"}},
            {{"type": "work", "minutes": 20, "pace": "9:30/mi"}},
            {{"type": "cooldown", "minutes": 5, "pace": "easy"}}
          ]
        }}
      ]
    }}
  ],
  "coach_notes": "Overview of the plan and why it's structured this way"
}}

Day numbers: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
Pace in seconds per mile (e.g., 570 = 9:30/mi)
Include warmup/cooldown in all structured runs.
Week 4, 8, 12 should be deload weeks (~30-40% volume reduction).
80% easy miles, 20% quality (tempo/intervals).
DO NOT schedule runs on Mon/Tue/Wed (strength days) or Sat (basketball)."""

    try:
        result = await call_claude(
            system_prompt=RUN_COACH_SYSTEM,
            user_prompt=prompt,
        )
        plan = json.loads(result["choices"][0]["message"]["content"])
        return plan
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Plan generation failed: {e}, using fallback")
        return _fallback_plan(goal_type, fitness_level, weeks, available_days or [1, 4, 6])


def _fallback_plan(
    goal_type: str, fitness_level: str, weeks: int, available_days: list[int]
) -> dict[str, Any]:
    """Generate a basic plan without LLM."""
    base_miles = {"beginner": 8, "intermediate": 15, "advanced": 25}.get(fitness_level, 15)
    easy_pace = {"beginner": 630, "intermediate": 570, "advanced": 510}.get(fitness_level, 570)

    weekly_plans = []
    for w in range(1, weeks + 1):
        is_deload = w % 4 == 0
        multiplier = 0.65 if is_deload else 1 + (w - 1) * 0.1
        week_miles = round(base_miles * multiplier, 1)

        runs = []
        for i, day in enumerate(available_days):
            if i == 0:  # first run day: easy
                dist = round(week_miles * 0.3, 1)
                runs.append({
                    "day_of_week": day, "run_type": "easy",
                    "distance_miles": dist, "target_pace_seconds": easy_pace,
                    "duration_minutes": int(dist * easy_pace / 60),
                    "description": f"Easy {dist} miles",
                    "structure": [
                        {"type": "warmup", "minutes": 5, "pace": "easy"},
                        {"type": "work", "minutes": int(dist * easy_pace / 60) - 10, "pace": f"{easy_pace // 60}:{easy_pace % 60:02d}/mi"},
                        {"type": "cooldown", "minutes": 5, "pace": "easy"},
                    ],
                })
            elif i == 1:  # second run day: tempo or easy
                dist = round(week_miles * 0.25, 1)
                rtype = "easy" if is_deload or w <= 3 else "tempo"
                pace = easy_pace if rtype == "easy" else easy_pace - 60
                runs.append({
                    "day_of_week": day, "run_type": rtype,
                    "distance_miles": dist, "target_pace_seconds": pace,
                    "duration_minutes": int(dist * pace / 60),
                    "description": f"{'Tempo' if rtype == 'tempo' else 'Easy'} {dist} miles",
                    "structure": [
                        {"type": "warmup", "minutes": 10, "pace": "easy"},
                        {"type": "work", "minutes": int(dist * pace / 60) - 15, "pace": f"{pace // 60}:{pace % 60:02d}/mi"},
                        {"type": "cooldown", "minutes": 5, "pace": "easy"},
                    ],
                })
            else:  # third run day: long run
                dist = round(week_miles * 0.45, 1)
                runs.append({
                    "day_of_week": day, "run_type": "long",
                    "distance_miles": dist, "target_pace_seconds": easy_pace + 15,
                    "duration_minutes": int(dist * (easy_pace + 15) / 60),
                    "description": f"Long run {dist} miles — easy pace, focus on time on feet",
                    "structure": [
                        {"type": "warmup", "minutes": 10, "pace": "easy"},
                        {"type": "work", "minutes": int(dist * (easy_pace + 15) / 60) - 15, "pace": "easy"},
                        {"type": "cooldown", "minutes": 5, "pace": "easy"},
                    ],
                })

        weekly_plans.append({
            "week": w,
            "focus": "deload" if is_deload else ("base building" if w <= 3 else "building"),
            "total_miles": week_miles,
            "runs": runs,
        })

    return {
        "total_weeks": weeks,
        "weekly_plans": weekly_plans,
        "coach_notes": f"{goal_type.replace('_', ' ').title()} plan: {weeks} weeks, starting at {base_miles} mi/week. Deload every 4th week.",
    }


def create_plan_from_ai(
    user_id: int, plan_data: dict[str, Any], goal_type: str,
    fitness_level: str, available_days: Optional[str],
    target_race_date: Optional[date], db: Session,
) -> TrainingPlan:
    """Create TrainingPlan + PlannedRun records from AI-generated plan."""
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

    # Create individual PlannedRun records
    for week_data in plan_data.get("weekly_plans", []):
        week_num = week_data["week"]
        week_start = today + timedelta(weeks=week_num - 1)

        for run_data in week_data.get("runs", []):
            day_of_week = run_data["day_of_week"]
            planned_date = week_start + timedelta(days=day_of_week - week_start.weekday())
            if planned_date < week_start:
                planned_date += timedelta(weeks=1)

            pr = PlannedRun(
                plan_id=plan.id, week_number=week_num, day_of_week=day_of_week,
                planned_date=planned_date,
                run_type=run_data["run_type"],
                target_distance_miles=run_data.get("distance_miles"),
                target_pace_seconds=run_data.get("target_pace_seconds"),
                target_duration_minutes=run_data.get("duration_minutes"),
                description=run_data.get("description"),
                structure=json.dumps(run_data.get("structure")) if run_data.get("structure") else None,
                status="upcoming",
            )
            db.add(pr)

    db.commit()
    db.refresh(plan)
    return plan


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
        plan_context = f"Planned: {planned_run.run_type} run, {planned_run.target_distance_miles}mi at {planned_run.target_pace_seconds}s/mi pace. "

    prompt = f"""Post-run analysis. Be brief (3-4 sentences max).

Run: {run.distance_miles}mi in {run.duration_formatted} ({run.avg_pace_formatted}/mi avg)
Type: {run.run_type or 'easy'}
{plan_context}
{splits_text}
RPE: {run.rpe or 'not rated'}
Whoop recovery: {run.whoop_recovery_score or 'unknown'}%

What went well? What to improve? How does this fit the training plan?"""

    try:
        result = await call_claude(
            system_prompt=RUN_COACH_SYSTEM,
            user_prompt=prompt,
        )
        return result["choices"][0]["message"]["content"]
    except Exception:
        return "Run logged successfully. Keep building consistency."


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

        # Calculate time for this distance from splits
        if target_miles <= 1.0 and run.splits:
            best_split = min(run.splits, key=lambda s: s.pace_seconds)
            time_seconds = best_split.pace_seconds
        elif target_miles == run.distance_miles:
            time_seconds = run.duration_seconds
        else:
            # Estimate from avg pace
            time_seconds = int((run.duration_seconds / run.distance_miles) * target_miles)

        existing_pr = (
            db.query(PersonalRecord)
            .filter(PersonalRecord.user_id == user_id, PersonalRecord.distance_label == label)
            .first()
        )

        if not existing_pr or time_seconds < existing_pr.time_seconds:
            if existing_pr:
                existing_pr.time_seconds = time_seconds
                existing_pr.record_date = run.run_date
                existing_pr.run_id = run.id
            else:
                pr = PersonalRecord(
                    user_id=user_id, run_id=run.id,
                    distance_label=label, time_seconds=time_seconds,
                    record_date=run.run_date,
                )
                db.add(pr)

            new_prs.append({"distance_label": label, "time_seconds": time_seconds})

    if new_prs:
        run.is_pr = True
        run.pr_type = new_prs[0]["distance_label"]
        db.commit()

    return new_prs
