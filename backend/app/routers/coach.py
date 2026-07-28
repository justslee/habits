"""General coaching chat — an LLM-backed coach for the Train tab.

Distinct from the workout-scoped live chat (/workouts/{id}/chat): this answers
general training / planning / "what should I do" questions grounded in the
athlete's pillars, north star, and recent training. Previously the Train-tab
coach had no backend and returned canned local replies.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.pillar import Pillar
from app.models.run import RunSession, TrainingPlan
from app.models.user import User
from app.models.vision import Vision
from app.models.workout import WorkoutSession
from app.services.llm import FAST, generate_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/coach", tags=["coach"])

SYSTEM_PROMPT = """You are this athlete's elite coach — a hybrid of a D1 strength coach, an
endurance coach, and a sharp performance mentor. You know their focus areas and
recent training and you speak to them specifically.

Style:
- Direct, honest, no fluff. No "great question!" — just coach.
- Answer the actual question. If they ask what to do, give a concrete
  recommendation, not a list of questions back at them.
- Brief: 2-5 sentences unless they ask for detail.
- Ground advice in their context (pillars, recent training, active plan) when relevant.

Hard rules:
- Never program tricep dips (the athlete has shoulder issues) — use pushdowns,
  skull crushers, or overhead extensions instead.
- Take any mention of pain seriously and suggest modifications."""


class ChatTurn(BaseModel):
    role: str  # "user" | "coach"
    text: str


class CoachChatRequest(BaseModel):
    message: str
    history: list[ChatTurn] = []


def _athlete_context(user_id: int, db: Session) -> str:
    lines: list[str] = []

    pillars = db.query(Pillar).all()
    if pillars:
        lines.append("Focus areas (pillars): " + ", ".join(p.name for p in pillars))

    vision = db.query(Vision).filter(Vision.user_id == user_id).first()
    if vision and vision.vision_text:
        lines.append("North star: " + vision.vision_text.strip()[:300])

    since = date.today() - timedelta(days=14)
    workouts = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.session_date >= since,
            WorkoutSession.deleted_at.is_(None),
        )
        .count()
    )
    runs = (
        db.query(RunSession)
        .filter(
            RunSession.user_id == user_id,
            RunSession.run_date >= since,
            RunSession.deleted_at.is_(None),
        )
        .count()
    )
    lines.append(f"Last 14 days: {workouts} workouts, {runs} runs logged.")

    plan = (
        db.query(TrainingPlan)
        .filter(TrainingPlan.user_id == user_id, TrainingPlan.status == "active")
        .first()
    )
    if plan:
        lines.append(
            f"Active running plan: {plan.goal_type} — week {plan.current_week} of {plan.total_weeks}."
        )

    return "\n".join(lines) if lines else "No training context yet."


@router.post("/chat")
async def coach_chat(payload: CoachChatRequest, db: Session = Depends(get_db)):
    """Answer a general coaching question grounded in the athlete's context."""
    user = db.query(User).first()
    if not user:
        return {"reply": "Set up your profile first and I'll have context to coach from."}

    context = _athlete_context(user.id, db)
    convo = "\n".join(
        f"{'Athlete' if t.role == 'user' else 'Coach'}: {t.text}" for t in payload.history[-8:]
    )
    user_prompt = (
        f"Athlete context:\n{context}\n\n"
        + (f"Conversation so far:\n{convo}\n\n" if convo else "")
        + f"Athlete: {payload.message}\nCoach:"
    )

    try:
        reply = await generate_text(
            system=SYSTEM_PROMPT, user_prompt=user_prompt, model=FAST, max_tokens=500
        )
        return {"reply": reply.strip() or "Say more and I'll give you a straight answer."}
    except Exception as e:
        logger.error("coach chat failed: %s", e)
        return {"reply": "I can't reach my brain right now — try again in a moment."}
