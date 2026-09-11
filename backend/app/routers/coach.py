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
from app.routers.train import (
    ADJUST_KINDS,
    _prescription_for,
    _user,
    _week,
    apply_adjustment,
)
from app.services import golf_program as gp
from app.services.llm import FAST, structured_output

router = APIRouter(prefix="/api/v1/coach", tags=["coach"])

REALTIME_MODEL = os.getenv("HABITS_REALTIME_MODEL", "gpt-realtime-2.1")
REALTIME_VOICE = os.getenv("HABITS_REALTIME_VOICE", "marin")
# What turns the athlete's speech into text on the way in. OpenAI's current low-latency
# choice; the client is told which to use rather than deciding for itself, so moving to the
# next one is a server change and does not need a new build.
TRANSCRIBE_MODEL = os.getenv("HABITS_TRANSCRIBE_MODEL", "gpt-live-transcribe")
CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
CALLS_URL = "https://api.openai.com/v1/realtime/calls"

# GPT-Live. Unlike Realtime it mints no ephemeral secret: the SDP offer is part of session
# creation and must carry the project key, so the Mac exchanges the handshake on the phone's
# behalf. Only signalling passes through here — the audio path is negotiated straight to
# OpenAI, exactly as before.
LIVE_URL = "https://api.openai.com/v1/live/sessions"
LIVE_MODEL = os.getenv("HABITS_LIVE_MODEL", "gpt-live-1")
# GPT-Live holds the conversation and hands thinking and tools to a backend model.
LIVE_BACKEND_MODEL = os.getenv("HABITS_LIVE_BACKEND_MODEL", "gpt-5.5")


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
            f"{d.date.strftime('%a')} {d.session or 'rest'}"
            + (f" [{d.label}]" if d.adjusted else "")
            + (" (travel)" if d.travel else "")
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
    "You can hear the owner; answer in the same language they use. Do not narrate the whole plan unprompted. "
    "When the owner tells you they are changing a day (running outside instead of the gym, resting, playing golf, "
    "doing a different session, moving a session, or cutting the time), call adjust_training so the rest of the week "
    "is re-planned around it, then tell them in one sentence what moved."
)

ADJUST_TOOL = {
    "type": "function",
    "name": "adjust_training",
    "description": "Change one planned training day; the app re-plans the rest of the week (moves the displaced session, keeps lower-body sessions 48h apart, drops Session 5 when a real run covers it).",
    "parameters": {
        "type": "object",
        "properties": {
            "kind": {
                "type": "string",
                "enum": list(ADJUST_KINDS),
                "description": "run | rest | golf | swap | move | shorten",
            },
            "date": {"type": "string", "description": "YYYY-MM-DD; omit for today"},
            "miles": {"type": "number", "description": "run distance"},
            "minutes": {
                "type": "integer",
                "description": "run minutes, or the time cap for shorten",
            },
            "intensity": {"type": "string", "enum": ["easy", "moderate", "hard"]},
            "session": {
                "type": "string",
                "enum": ["S1", "S2", "S3", "S4", "S5"],
                "description": "for swap",
            },
            "target_date": {"type": "string", "description": "for move: YYYY-MM-DD"},
        },
        "required": ["kind"],
    },
}


class SessionOut(BaseModel):
    client_secret: str
    expires_at: int | None
    model: str
    voice: str
    calls_url: str
    context_chars: int
    transcribe_model: str


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
            "tools": [ADJUST_TOOL],
            "tool_choice": "auto",
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
        transcribe_model=TRANSCRIBE_MODEL,
    )


class LiveIn(BaseModel):
    sdp: str


class LiveOut(BaseModel):
    sdp: str
    session_id: str | None = None
    model: str
    backend_model: str
    context_chars: int


@router.post("/live/session", response_model=LiveOut)
async def live_session(payload: LiveIn, db: Session = Depends(get_db)):
    """Exchange the phone's WebRTC offer for GPT-Live's answer, with the programme as context.

    The phone never sees the API key. It sends its offer here, we create the session, and it
    gets back only the answer SDP.
    """
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=503, detail="OPENAI_API_KEY is not configured on the Mac"
        )
    if not payload.sdp.strip():
        raise HTTPException(status_code=400, detail="An SDP offer is required")

    context = build_context(db)
    body = {
        "session": {
            "model": LIVE_MODEL,
            "instructions": COACH_STYLE + "\n\nCURRENT CONTEXT:\n" + context,
            "delegation": {
                "type": "responses",
                "responses": {
                    "model": LIVE_BACKEND_MODEL,
                    "instructions": (
                        "You are the same coach, doing the thinking behind the conversation. "
                        "Answer for speech: short, concrete, no lists. When the athlete is changing "
                        "a day, call adjust_training so the week re-plans around it."
                    ),
                    "tools": [ADJUST_TOOL],
                    "tool_choice": "auto",
                },
            },
        },
        "transport": {"type": "webrtc", "sdp": payload.sdp},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            LIVE_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
    if r.status_code >= 400:
        raise HTTPException(
            status_code=502, detail=f"OpenAI {r.status_code}: {r.text[:300]}"
        )
    out = r.json()
    answer = (out.get("transport") or {}).get("sdp")
    if not answer:
        raise HTTPException(
            status_code=502,
            detail=f"No SDP answer in the response: {json.dumps(out)[:200]}",
        )
    return LiveOut(
        sdp=answer,
        session_id=(out.get("session") or {}).get("id"),
        model=LIVE_MODEL,
        backend_model=LIVE_BACKEND_MODEL,
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
    changes: list[str] = []
    adjustment_id: int | None = None


CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {
            "type": "string",
            "description": "the coach's reply, plain sentences",
        },
        "adjustment": {
            "type": ["object", "null"],
            "description": "set only when the athlete is telling you they are changing a day",
            "properties": {
                "kind": {"type": "string", "enum": list(ADJUST_KINDS)},
                "date": {
                    "type": ["string", "null"],
                    "description": "YYYY-MM-DD; null = today",
                },
                "miles": {"type": ["number", "null"]},
                "minutes": {"type": ["integer", "null"]},
                "intensity": {
                    "type": ["string", "null"],
                    "enum": ["easy", "moderate", "hard", None],
                },
                "session": {
                    "type": ["string", "null"],
                    "enum": ["S1", "S2", "S3", "S4", "S5", None],
                },
                "target_date": {"type": ["string", "null"]},
            },
            "required": ["kind"],
        },
    },
    "required": ["reply", "adjustment"],
}


@router.post("/chat", response_model=ChatOut)
async def chat(payload: ChatIn, db: Session = Depends(get_db)):
    """Program-aware text chat. If you tell the coach you're changing a day, the week is re-planned."""
    if not payload.message.strip():
        raise HTTPException(status_code=422, detail="Empty message")
    user = _user(db)
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
        out = await structured_output(
            system=COACH_STYLE
            + " This is a text chat; plain sentences, no markdown headers. "
            "Fill `adjustment` only when the athlete states a change to a day (not for questions).",
            user_prompt=prompt,
            tool_name="submit_coach_reply",
            tool_description="Reply, plus the day change if one was stated",
            output_schema=CHAT_SCHEMA,
            model=FAST,
            max_tokens=700,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Coach unavailable: {str(e)[:200]}"
        )
    reply = str(out.get("reply") or "").strip()
    adj = out.get("adjustment")
    changes: list[str] = []
    adj_id = None
    if isinstance(adj, dict) and adj.get("kind") in ADJUST_KINDS:
        d = (
            datetime.date.fromisoformat(adj["date"])
            if adj.get("date")
            else datetime.date.today()
        )
        try:
            row, changes = apply_adjustment(
                db,
                user,
                d=d,
                kind=adj["kind"],
                params={
                    k: adj.get(k)
                    for k in ("miles", "minutes", "intensity", "session", "target_date")
                },
                reason=payload.message.strip(),
            )
            adj_id = row.id
            reply += "\n\nUpdated your week: " + " · ".join(changes)
        except HTTPException as e:
            reply += f"\n\n(I couldn't apply that change: {e.detail})"
    return ChatOut(reply=reply, model=FAST, changes=changes, adjustment_id=adj_id)
