"""Weekly Review generation service — AI-powered weekly summary.

Generates honest weekly reviews via Claude (D-012).
"""

import json
import logging
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.daily_entry import DailyEntry
from app.models.daily_todo import DailyTodo
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.streak import Streak
from app.models.user import User
from app.models.weekly_review import WeeklyReview
from app.services.evaluation import call_claude

logger = logging.getLogger(__name__)

REVIEW_SYSTEM_PROMPT = """You are the Weekly Review Engine for a personal mastery tracking system.
You generate honest, no-BS weekly summaries for someone training to become a world-class investor and hedge fund manager.

The user tracks 5 pillars:
1. Quantitative Finance (PhD/CQF-level)
2. Macro & Qualitative Investing (Elite generalist)
3. Machine Learning Math (Research-level)
4. AI Engineering & Deployment (Production-grade)
5. Public Speaking & Communication (Keynote-caliber)

## Your Job
- Analyze the week's logged entries and evaluations
- Identify which pillars got attention and which were neglected
- Call out comfort zone drift (e.g., all coding, no speaking practice)
- Assign an honest letter grade (A through F)
- Provide 2-3 specific, actionable focus recommendations for next week
- Include a motivational quote from an elite performer

## Grading Scale
- A: Exceptional week. Deep work across multiple pillars. Genuine growth.
- B: Good week. Solid depth in some pillars, minor gaps acceptable.
- C: Average. Some work done but too shallow, too narrow, or inconsistent.
- D: Below expectations. Mostly coasting, surface-level, or single-pillar tunnel vision.
- F: Failing. Barely showed up, dishonest logging, or pure maintenance work.

## Response Format
Respond with valid JSON only:
{
  "pillar_distribution": "<summary of hours and depth per pillar this week>",
  "comfort_zone_analysis": "<call out if drifting toward comfort zones>",
  "recommendations": "<2-3 specific recommendations for next week>",
  "letter_grade": "<A|B|C|D|F>",
  "grade_justification": "<2-3 sentences explaining the grade honestly>",
  "quote": "<motivational quote with attribution>"
}"""


def _build_week_summary(
    user_id: int, week_start: date, week_end: date, db: Session
) -> str:
    """Build a summary of the week's entries for the LLM prompt."""
    entries = (
        db.query(DailyEntry)
        .filter(
            DailyEntry.user_id == user_id,
            DailyEntry.entry_date >= week_start,
            DailyEntry.entry_date <= week_end,
        )
        .order_by(DailyEntry.entry_date)
        .all()
    )

    # Also pull todos for the week
    todos = (
        db.query(DailyTodo)
        .filter(
            DailyTodo.user_id == user_id,
            DailyTodo.todo_date >= week_start,
            DailyTodo.todo_date <= week_end,
        )
        .order_by(DailyTodo.todo_date)
        .all()
    )

    if not entries and not todos:
        return "NO ENTRIES THIS WEEK. The user did not log a single session or complete any todos."

    pillars = {p.id: p for p in db.query(Pillar).all()}
    streaks = db.query(Streak).filter(Streak.user_id == user_id).all()

    completed_todos = [t for t in todos if t.completed]
    lines = [f"Week: {week_start.isoformat()} to {week_end.isoformat()}"]
    lines.append(f"Total entries: {len(entries)}")
    lines.append(f"Todos: {len(completed_todos)}/{len(todos)} completed")

    # Per-day todo summary
    from collections import defaultdict
    todos_by_date = defaultdict(list)  # type: ignore[var-annotated]
    for t in todos:
        todos_by_date[t.todo_date].append(t)

    lines.append("\n== DAILY TODO LOG ==")
    for d in sorted(todos_by_date.keys()):
        day_todos = todos_by_date[d]
        done = [t for t in day_todos if t.completed]
        lines.append(f"\n{d.isoformat()} ({len(done)}/{len(day_todos)} done):")
        for t in day_todos:
            status = "✅" if t.completed else "❌"
            pillar_name = pillars.get(t.pillar_id, None)
            pname = pillar_name.name if pillar_name else "untagged"
            mins = f" ({t.estimated_minutes}min)" if t.estimated_minutes else ""
            lines.append(f"  {status} {t.text}{mins} [{pname}]")

    # Per-entry detail (reflections / check-ins)
    if entries:
        lines.append("\n== DAILY REFLECTIONS ==")
        for entry in entries:
            pillar_names = []
            for pid in entry.pillar_tag_list:
                p = pillars.get(pid)
                if p:
                    pillar_names.append(p.name)

            eval_info = ""
            if entry.evaluation:
                e = entry.evaluation
                eval_info = (
                    f" | Depth: {e.depth_score}, Relevance: {e.relevance_score}, "
                    f"1% Better: {'YES' if e.one_percent_better else 'NO'}"
                )

            desc = entry.description[:100] if entry.description else "no description"
            lines.append(
                f"- {entry.entry_date}: {desc} "
                f"({entry.time_invested_minutes}min, difficulty {entry.difficulty_rating}/10, "
                f"pillars: {', '.join(pillar_names) or 'none'}){eval_info}"
            )

    # Streak context
    lines.append("\nCurrent streaks:")
    for s in streaks:
        p = pillars.get(s.pillar_id)
        if p:
            lines.append(f"- {p.name}: {s.current_streak} days (best: {s.longest_streak})")

    return "\n".join(lines)


def parse_review_response_local(raw_response: dict[str, Any]) -> dict[str, Any]:
    """Parse weekly review LLM response."""
    content = raw_response["choices"][0]["message"]["content"]
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    parsed = json.loads(content)

    grade = str(parsed["letter_grade"]).upper().strip()
    if grade not in ("A", "B", "C", "D", "F"):
        grade = "C"  # fallback

    return {
        "pillar_distribution": str(parsed["pillar_distribution"]),
        "comfort_zone_analysis": str(parsed["comfort_zone_analysis"]),
        "recommendations": str(parsed["recommendations"]),
        "letter_grade": grade,
        "grade_justification": str(parsed["grade_justification"]),
        "quote": str(parsed["quote"]),
    }


async def generate_weekly_review(
    user_id: int, week_start: date, week_end: date, db: Session
) -> WeeklyReview:
    """Generate a weekly review for the given week."""
    # Check if review already exists
    existing = (
        db.query(WeeklyReview)
        .filter(
            WeeklyReview.user_id == user_id,
            WeeklyReview.week_start == week_start,
        )
        .first()
    )
    if existing:
        return existing

    user_prompt = _build_week_summary(user_id, week_start, week_end, db)

    raw_response = await call_claude(REVIEW_SYSTEM_PROMPT, user_prompt)
    parsed = parse_review_response_local(raw_response)

    review = WeeklyReview(
        user_id=user_id,
        week_start=week_start,
        week_end=week_end,
        pillar_distribution=parsed["pillar_distribution"],
        comfort_zone_analysis=parsed["comfort_zone_analysis"],
        recommendations=parsed["recommendations"],
        letter_grade=parsed["letter_grade"],
        grade_justification=parsed["grade_justification"],
        quote=parsed["quote"],
        raw_llm_response=json.dumps(raw_response),
    )

    db.add(review)
    db.commit()
    db.refresh(review)

    return review


def get_current_week_bounds(target_date: Optional[date] = None) -> tuple[date, date]:
    """Get Monday-Sunday bounds for the week containing target_date."""
    d = target_date or date.today()
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_last_week_bounds(target_date: Optional[date] = None) -> tuple[date, date]:
    """Get Monday-Sunday bounds for last week."""
    d = target_date or date.today()
    last_sunday = d - timedelta(days=d.weekday() + 1)
    last_monday = last_sunday - timedelta(days=6)
    return last_monday, last_sunday
