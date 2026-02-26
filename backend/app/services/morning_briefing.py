"""Morning Briefing Service — P2-1.

Generates the daily workout briefing with Whoop context and motivational quote.
Designed to be triggered by a scheduler (cron/heartbeat).
"""

import json
import logging
import random
from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.whoop import WhoopUnavailableError, fetch_whoop_data, get_recovery_adjustment
from app.services.workout_generator import generate_workout_plan, get_day_type_for_date

logger = logging.getLogger(__name__)

QUOTES = [
    '"The fight is won or lost far away from witnesses — behind the lines, in the gym." — Muhammad Ali',
    '"I fear not the man who has practiced 10,000 kicks once, but the man who has practiced one kick 10,000 times." — Bruce Lee',
    '"Hard work beats talent when talent doesn\'t work hard." — Tim Notke',
    '"The only way to prove you are a good sport is to lose." — Ernie Banks',
    '"I\'ve failed over and over again in my life. And that is why I succeed." — Michael Jordan',
    '"Suffer the pain of discipline or suffer the pain of regret." — Jim Rohn',
    '"Don\'t count the days. Make the days count." — Muhammad Ali',
    '"The more I train, the more I realize I have more speed in me." — Usain Bolt',
    '"Excellence is not a singular act, but a habit. You are what you repeatedly do." — Shaquille O\'Neal',
    '"I hated every minute of training, but I said, Don\'t quit. Suffer now and live the rest of your life as a champion." — Muhammad Ali',
    '"Obsessed is just a word the lazy use to describe the dedicated." — Kobe Bryant',
    '"When you\'re not practicing, someone else is getting better." — Allen Iverson',
    '"Rest at the end, not in the middle." — Kobe Bryant',
    '"The separation is in the preparation." — Russell Wilson',
    '"You miss 100% of the shots you don\'t take." — Wayne Gretzky',
]


async def generate_morning_briefing(db: Session) -> dict[str, Any]:
    """Generate the full morning briefing.

    Returns dict with: quote, day_type, workout_preview, whoop_data, recovery_note
    """
    today = date.today()
    day_type = get_day_type_for_date(today)
    quote = random.choice(QUOTES)

    # Pull Whoop data
    whoop_data = None
    try:
        whoop_data = await fetch_whoop_data()
    except WhoopUnavailableError as e:
        logger.warning(f"Whoop unavailable for morning briefing: {e}")

    # Get recovery context
    recovery_score = whoop_data.get("recovery_score") if whoop_data else None
    adjustment = get_recovery_adjustment(recovery_score)

    # Generate workout plan
    user = db.query(User).first()
    workout_plan = None
    if user and day_type not in ("rest",):
        try:
            workout_plan = await generate_workout_plan(
                user.id, day_type, whoop_data, db
            )
        except Exception as e:
            logger.error(f"Failed to generate workout plan: {e}")

    # Format workout preview
    workout_preview = ""
    if workout_plan and workout_plan.get("exercises"):
        exercises = workout_plan["exercises"]
        preview_lines = []
        for ex in exercises[:4]:  # Top 4 exercises for preview
            line = f"{ex['name']} {ex['sets']}×{ex['reps']}"
            if ex.get("weight"):
                line += f" @ {ex['weight']} lbs"
            preview_lines.append(line)
        workout_preview = " → ".join(preview_lines)
        if len(exercises) > 4:
            workout_preview += f" + {len(exercises) - 4} more"

    # Format Whoop line
    whoop_line = ""
    if whoop_data:
        parts = []
        if whoop_data.get("recovery_score") is not None:
            parts.append(f"Recovery {whoop_data['recovery_score']}%")
        if whoop_data.get("hrv") is not None:
            parts.append(f"HRV {whoop_data['hrv']}ms")
        if whoop_data.get("sleep_score") is not None:
            parts.append(f"Sleep {whoop_data['sleep_score']}%")
        whoop_line = " | ".join(parts)

    return {
        "quote": quote,
        "day_type": day_type,
        "workout_preview": workout_preview,
        "workout_plan": workout_plan,
        "whoop_data": whoop_data,
        "whoop_line": whoop_line,
        "recovery_note": adjustment["note"],
        "estimated_duration": workout_plan.get("estimated_duration_minutes") if workout_plan else None,
    }


def format_briefing_text(briefing: dict[str, Any]) -> str:
    """Format briefing into a readable text message."""
    lines = [briefing["quote"], ""]

    day_labels = {
        "push": "💪 Push Day",
        "pull": "🏋️ Pull Day",
        "legs": "🦵 Leg Day",
        "cardio": "🏃 Cardio",
        "basketball": "🏀 Basketball",
        "rest": "🛌 Rest Day",
    }
    lines.append(f"Today: {day_labels.get(briefing['day_type'], briefing['day_type'])}")

    if briefing["whoop_line"]:
        lines.append(f"Whoop: {briefing['whoop_line']}")

    if briefing["recovery_note"]:
        lines.append(briefing["recovery_note"])

    if briefing["workout_preview"]:
        lines.append(f"\n{briefing['workout_preview']}")

    if briefing["estimated_duration"]:
        lines.append(f"~{briefing['estimated_duration']} min")

    return "\n".join(lines)
