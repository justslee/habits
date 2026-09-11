"""Live coach — OpenAI Realtime (speech-to-speech over WebRTC) with the program as context.

  POST /api/v1/coach/realtime/session   → ephemeral client secret + the WebRTC endpoint,
                                          with instructions built from today's prescription,
                                          the week, the phase, and the last few sessions
  GET  /api/v1/coach/context            → the same context as text (for the text chat)

The phone (or browser) uses the client secret directly with OpenAI over WebRTC, so audio
never passes through the Mac. Secrets live ~1 minute and are single-session.
"""

from __future__ import annotations

import datetime
import json
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.workout import WorkoutSession
from app.routers.train import _prescription_for, _user, _week
from app.services import golf_program as gp
from app.services.llm import FAST, generate_text

router = APIRouter(prefix="/api/v1/coach", tags=["coach"])

REALTIME_MODEL = os.getenv("HABITS_REALTIME_MODEL", "gpt-realtime")
REALTIME_VOICE = os.getenv("HABITS_REALTIME_VOICE", "marin")
CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
CALLS_URL = "https://api.openai.com/v1/realtime/calls"


def build_context(db: Session) -> str:
    user = _user(db)
    today = datetime.date.today()
    p = _prescription_for(db, user, today)
    week = _week(db, user, gp.week_start(today))
    recent = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.deleted_at.is_(None),
            WorkoutSession.status == "completed",
        )
        .order_by(WorkoutSession.session_date.desc())
        .limit(4)
        .all()
    )
    lines = [
        "PROGRAM: Golf Performance Workout Plan, Sept 2026 → spring 2027. Four core sessions + one optional per week. "
        "Hard cap 70 minutes per session including warm-up, rest and transitions. Priorities: strength and muscle, rotational power, "
        "resilient back and core, mobile hips and shoulders, running that supports golf. NO medicine-ball throws or tosses, ever.",
        f"TODAY {today.isoformat()} ({today.strftime('%A')}):",
    ]
    if p:
        lines.append(
            f"  Session {p['session']} — {p['title']}. Phase: {p['phase_name']}. Week kind: {p['week_kind']}. Rotation {p['rotation']}. Target {p['target_minutes'][0]}–{p['target_minutes'][1]} min. Budget: {p['budget']}."
        )
        for b in p["blocks"]:
            for e in b["exercises"]:
                load = f" at {e['load']:.0f} lb" if e.get("load") else ""
                lines.append(
                    f"  - {b['name']}: {e['name']} {e['sets']}×{e['reps']}{'/side' if e.get('per_side') else ''}{load}{' · ' + e['notes'] if e.get('notes') else ''}"
                )
        if p.get("run"):
            lines.append(f"  - Run {p['run']['minutes']} min: {p['run']['structure']}")
        lines.append("  Rules: " + " | ".join(p["rules"]))
    else:
        lines.append(
            "  Rest, golf or the 8-minute mobility routine. No catch-up gym work."
        )
    lines.append(
        "THIS WEEK: "
        + ", ".join(
            f"{d.date.strftime('%a')} {d.session or 'rest'}{' (travel)' if d.travel else ''}"
            for d in week
        )
    )
    if recent:
        lines.append("RECENT SESSIONS:")
        for r in recent:
            sets = [
                f"{e.exercise_name} {e.weight:.0f}×{e.reps}"
                for e in r.exercises
                if not e.is_warmup and e.weight and e.reps
            ][:6]
            lines.append(
                f"  {r.session_date.isoformat()} {r.day_type} RPE {r.overall_rpe or '?'}: {', '.join(sets) or 'no sets logged'}"
            )
    return "\n".join(lines)


COACH_STYLE = (
    "You are the owner's strength and golf-performance coach, talking live during or around a training session. "
    "Be brief and direct — one or two sentences unless asked for more. Coach the plan as written: doses, rest, RPE, the 70-minute cap, "
    "power before strength, control before load. Give the next set's load from the double-progression rule when asked. "
    "If something hurts sharply or increasingly, stop that exercise. Never suggest medicine-ball throws or tosses. "
    "You can hear the owner; answer in the same language they use. Do not narrate the whole plan unprompted."
)


class SessionOut(BaseModel):
    client_secret: str
    expires_at: int | None
    model: str
    voice: str
    calls_url: str
    context_chars: int


@router.post("/realtime/session", response_model=SessionOut)
async def realtime_session(db: Session = Depends(get_db)):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=503, detail="OPENAI_API_KEY is not configured on the Mac"
        )
    context = build_context(db)
    payload = {
        "session": {
            "type": "realtime",
            "model": REALTIME_MODEL,
            "instructions": COACH_STYLE + "\n\nCURRENT CONTEXT:\n" + context,
            "audio": {"output": {"voice": REALTIME_VOICE}},
        }
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            CLIENT_SECRETS_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if r.status_code >= 400:
        raise HTTPException(
            status_code=502, detail=f"OpenAI {r.status_code}: {r.text[:300]}"
        )
    body = r.json()
    secret = body.get("value") or (body.get("client_secret") or {}).get("value")
    if not secret:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected token response: {json.dumps(body)[:200]}",
        )
    return SessionOut(
        client_secret=secret,
        expires_at=body.get("expires_at")
        or (body.get("client_secret") or {}).get("expires_at"),
        model=REALTIME_MODEL,
        voice=REALTIME_VOICE,
        calls_url=CALLS_URL,
        context_chars=len(context),
    )


@router.get("/context")
def context(db: Session = Depends(get_db)):
    return {"context": build_context(db)}


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []  # [{"from": "me"|"coach", "text": ...}], most recent last


class ChatOut(BaseModel):
    reply: str
    model: str


@router.post("/chat", response_model=ChatOut)
async def chat(payload: ChatIn, db: Session = Depends(get_db)):
    """Program-aware text chat: same context and style as the live voice coach."""
    if not payload.message.strip():
        raise HTTPException(status_code=422, detail="Empty message")
    context = build_context(db)
    turns = "\n".join(
        f"{'ATHLETE' if t.get('from') == 'me' else 'COACH'}: {t.get('text', '')}"
        for t in payload.history[-8:]
    )
    prompt = (
        f"CURRENT CONTEXT:\n{context}\n\n"
        + (f"RECENT EXCHANGE:\n{turns}\n\n" if turns else "")
        + f"ATHLETE SAYS: {payload.message.strip()}"
    )
    try:
        reply = await generate_text(
            system=COACH_STYLE
            + " This is a text chat; plain sentences, no markdown headers.",
            user_prompt=prompt,
            model=FAST,
            max_tokens=600,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Coach unavailable: {str(e)[:200]}"
        )
    return ChatOut(reply=reply.strip(), model=FAST)
