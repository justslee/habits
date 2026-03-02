"""Speaking Practice API — record, transcribe, evaluate presentations."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.speaking import SpeakingEvaluation, SpeakingSession
from app.models.user import User
from app.services.evaluation import call_clawdbot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/speaking", tags=["speaking"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "speaking")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ==================== TRANSCRIPTION ====================

async def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio using OpenAI gpt-4o-transcribe with timestamps for pause detection."""
    import httpx

    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        raise RuntimeError("OPENAI_API_KEY not set for transcription")

    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(audio_path, "rb") as f:
            resp = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {openai_key}"},
                files={"file": (os.path.basename(audio_path), f, "audio/m4a")},
                data={
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                },
            )
            resp.raise_for_status()
            data = resp.json()

    # Extract transcript text
    transcript = data.get("text", "").strip()

    # Detect pauses from segment timestamps
    pauses = []
    segments = data.get("segments", [])
    for i in range(1, len(segments)):
        prev_end = segments[i - 1].get("end", 0)
        curr_start = segments[i].get("start", 0)
        gap = curr_start - prev_end
        if gap >= 1.5:  # 1.5+ seconds = notable pause
            pauses.append({
                "after_text": segments[i - 1].get("text", "").strip()[-60:],
                "before_text": segments[i].get("text", "").strip()[:60],
                "duration": round(gap, 1),
                "timestamp": round(prev_end, 1),
            })

    return {
        "transcript": transcript,
        "pauses": pauses,
        "total_pause_seconds": round(sum(p["duration"] for p in pauses), 1),
        "pause_count": len(pauses),
    }


# ==================== EVALUATION ====================

SPEAKING_EVAL_PROMPT = """You are an elite presentation coach and communication expert.
You evaluate spoken explanations of technical concepts with surgical precision.

The user is practicing explaining concepts clearly — like pitching to investors,
teaching junior analysts, or giving conference talks.

## Scoring Dimensions (each 0-100)

### Clarity (Can a smart non-expert follow this?)
- 0-20: Incoherent, jumps around, impossible to follow
- 21-40: Some structure but confusing, assumes too much
- 41-60: Followable but requires effort, some unclear passages
- 61-80: Clear and logical, good flow, minor gaps
- 81-100: Crystal clear, perfect scaffolding, anyone could follow

### Accuracy (Is the content technically correct?)
- 0-20: Fundamental errors, dangerously wrong
- 21-40: Several mistakes, shaky understanding
- 41-60: Mostly correct, some imprecision
- 61-80: Accurate with minor simplifications that are appropriate
- 81-100: Technically precise, nuanced, expert-level

### Structure (Intro → Body → Conclusion, good transitions?)
- 0-20: No structure, stream of consciousness
- 21-40: Attempted structure but falls apart
- 41-60: Basic structure, weak transitions
- 61-80: Well structured with clear sections
- 81-100: Masterful structure, compelling narrative arc

### Conciseness (Tight or rambling? Filler words?)
- 0-20: Extremely verbose, constant filler, painful to listen to
- 21-40: Too much filler, repetitive, unfocused
- 41-60: Some filler and repetition but manageable
- 61-80: Tight delivery, minimal waste
- 81-100: Every word earns its place, zero fat

### Confidence (Authoritative or uncertain?)
- 0-20: Constant hedging, sounds unsure of everything
- 21-40: Frequent hedging ("basically", "I think maybe", "sort of")
- 41-60: Occasional hedging, mostly direct
- 61-80: Speaks with authority, rare hesitation
- 81-100: Commanding presence, zero hedging, owns every statement

## Filler Word Detection
Count ALL instances of: um, uh, like (as filler), you know, basically, sort of,
kind of, I mean, right?, so (as filler at start), actually (unnecessary).
Return exact counts.

## Specific Feedback
Identify 3-5 specific passages from the transcript. For each, quote the exact text
and provide targeted feedback. Mix strengths and improvements.

## Pause Analysis
You will also receive data about pauses detected in the recording (gaps ≥ 1.5s between speech segments).
Evaluate whether pauses are:
- **Strategic** — used for emphasis, letting a point land, transitioning between ideas (GOOD)
- **Hesitation** — losing train of thought, unsure what to say next, freezing up (BAD)
- **Excessive** — too many or too long, breaking flow and losing audience (BAD)
Include pause assessment in your commentary and factor it into the confidence score.

## Response Format (JSON only)
{
  "clarity_score": <int>,
  "accuracy_score": <int>,
  "structure_score": <int>,
  "conciseness_score": <int>,
  "confidence_score": <int>,
  "overall_score": <int — weighted average: clarity 25%, accuracy 25%, structure 20%, conciseness 15%, confidence 15%>,
  "filler_words": {"um": <count>, "like": <count>, ...},
  "filler_count": <total filler count>,
  "pause_assessment": "<1-2 sentences on pause usage — strategic vs hesitation>",
  "specific_feedback": [
    {"quote": "<exact text from transcript>", "feedback": "<targeted feedback>", "type": "improvement|strength"},
    ...
  ],
  "commentary": "<3-5 sentences of overall assessment, brutally honest>"
}"""


async def evaluate_speaking(transcript: str, topic: str, audience: str, duration_seconds: int, pauses: list = None) -> dict:
    """Evaluate a speaking session transcript."""
    pause_block = ""
    if pauses:
        pause_lines = []
        for p in pauses:
            pause_lines.append(f"  - {p['duration']}s pause at {p['timestamp']}s (after: \"{p['after_text']}\" → before: \"{p['before_text']}\")")
        pause_block = f"\n\n**Pauses detected ({len(pauses)} pauses, {sum(p['duration'] for p in pauses):.1f}s total):**\n" + "\n".join(pause_lines)

    user_prompt = f"""Evaluate this spoken explanation:

**Topic:** {topic}
**Target audience:** {audience}
**Duration:** {duration_seconds} seconds ({duration_seconds // 60}m {duration_seconds % 60}s)

**Transcript:**
{transcript}{pause_block}

Be brutally honest. Reference specific parts of the transcript in your feedback."""

    raw = await call_clawdbot(SPEAKING_EVAL_PROMPT, user_prompt)
    content = raw["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    parsed = json.loads(content)

    return {
        "clarity_score": max(0, min(100, int(parsed["clarity_score"]))),
        "accuracy_score": max(0, min(100, int(parsed["accuracy_score"]))),
        "structure_score": max(0, min(100, int(parsed["structure_score"]))),
        "conciseness_score": max(0, min(100, int(parsed["conciseness_score"]))),
        "confidence_score": max(0, min(100, int(parsed["confidence_score"]))),
        "overall_score": max(0, min(100, int(parsed["overall_score"]))),
        "filler_words": parsed.get("filler_words", {}),
        "filler_count": int(parsed.get("filler_count", 0)),
        "specific_feedback": parsed.get("specific_feedback", []),
        "pause_assessment": str(parsed.get("pause_assessment", "")),
        "commentary": str(parsed["commentary"]),
        "raw": raw,
    }


# ==================== ENDPOINTS ====================

@router.post("/sessions")
async def create_speaking_session(
    audio: UploadFile = File(...),
    topic: str = Form(...),
    audience: str = Form("general"),
    target_seconds: int = Form(180),
    actual_seconds: int = Form(0),
    concept_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload audio, transcribe, evaluate, and store a speaking session."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    # Save audio file
    ext = audio.filename.split(".")[-1] if audio.filename else "m4a"
    audio_filename = f"speaking_{user.id}_{date.today().isoformat()}_{os.urandom(4).hex()}.{ext}"
    audio_path = os.path.join(UPLOAD_DIR, audio_filename)
    content = await audio.read()
    with open(audio_path, "wb") as f:
        f.write(content)

    # Transcribe
    try:
        transcription = await transcribe_audio(audio_path)
        transcript = transcription["transcript"]
        pauses = transcription["pauses"]
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

    # Create session
    session = SpeakingSession(
        user_id=user.id,
        topic=topic,
        audience=audience,
        target_seconds=target_seconds,
        actual_seconds=actual_seconds,
        concept_id=concept_id,
        audio_path=audio_path,
        transcript=transcript,
        session_date=date.today(),
    )
    db.add(session)
    db.flush()

    # Evaluate
    try:
        result = await evaluate_speaking(transcript, topic, audience, actual_seconds or target_seconds, pauses)
        evaluation = SpeakingEvaluation(
            session_id=session.id,
            clarity_score=result["clarity_score"],
            accuracy_score=result["accuracy_score"],
            structure_score=result["structure_score"],
            conciseness_score=result["conciseness_score"],
            confidence_score=result["confidence_score"],
            overall_score=result["overall_score"],
            filler_words=json.dumps(result["filler_words"]),
            filler_count=result["filler_count"],
            specific_feedback=json.dumps(result["specific_feedback"]),
            commentary=result["commentary"],
            raw_llm_response=json.dumps(result["raw"]),
        )
        db.add(evaluation)
    except Exception as e:
        logger.error(f"Speaking evaluation failed: {e}")
        # Still save the session even if eval fails
        db.commit()
        db.refresh(session)
        return _session_response(session)

    db.commit()
    db.refresh(session)
    return _session_response(session)


@router.get("/sessions")
def list_sessions(limit: int = 20, db: Session = Depends(get_db)):
    """List speaking sessions, newest first."""
    user = db.query(User).first()
    if not user:
        return []

    sessions = (
        db.query(SpeakingSession)
        .filter(SpeakingSession.user_id == user.id)
        .order_by(SpeakingSession.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_session_response(s) for s in sessions]


@router.get("/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    """Get a single session with evaluation."""
    session = db.query(SpeakingSession).filter(SpeakingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_response(session)


@router.get("/stats")
def speaking_stats(db: Session = Depends(get_db)):
    """Get speaking practice stats and progression."""
    user = db.query(User).first()
    if not user:
        return {"total_sessions": 0}

    sessions = (
        db.query(SpeakingSession)
        .filter(SpeakingSession.user_id == user.id)
        .order_by(SpeakingSession.created_at.desc())
        .all()
    )

    if not sessions:
        return {"total_sessions": 0, "total_minutes": 0, "avg_scores": None, "recent_trend": None}

    total_seconds = sum(s.actual_seconds or 0 for s in sessions)

    # Average scores from all evaluated sessions
    evals = [s.evaluation for s in sessions if s.evaluation]
    avg_scores = None
    if evals:
        avg_scores = {
            "clarity": round(sum(e.clarity_score for e in evals) / len(evals), 1),
            "accuracy": round(sum(e.accuracy_score for e in evals) / len(evals), 1),
            "structure": round(sum(e.structure_score for e in evals) / len(evals), 1),
            "conciseness": round(sum(e.conciseness_score for e in evals) / len(evals), 1),
            "confidence": round(sum(e.confidence_score for e in evals) / len(evals), 1),
            "overall": round(sum(e.overall_score for e in evals) / len(evals), 1),
        }

    # Trend: compare last 5 vs first 5
    recent_trend = None
    if len(evals) >= 4:
        recent_5 = evals[:min(5, len(evals) // 2)]
        early_5 = evals[-min(5, len(evals) // 2):]
        recent_avg = sum(e.overall_score for e in recent_5) / len(recent_5)
        early_avg = sum(e.overall_score for e in early_5) / len(early_5)
        recent_trend = {
            "recent_avg": round(recent_avg, 1),
            "early_avg": round(early_avg, 1),
            "delta": round(recent_avg - early_avg, 1),
            "improving": recent_avg > early_avg,
        }

    return {
        "total_sessions": len(sessions),
        "total_minutes": round(total_seconds / 60, 1),
        "avg_scores": avg_scores,
        "recent_trend": recent_trend,
    }


@router.get("/topics/suggest")
def suggest_topics(db: Session = Depends(get_db)):
    """Suggest speaking topics from recent concepts and todos."""
    from app.models.concept_touch import ConceptTouch
    from app.models.concept import PillarConcept
    from app.models.daily_todo import DailyTodo

    user = db.query(User).first()
    if not user:
        return []

    suggestions = []
    week_ago = date.today() - timedelta(days=7)

    # Recent concepts touched
    recent_concepts = (
        db.query(PillarConcept)
        .join(ConceptTouch, ConceptTouch.concept_id == PillarConcept.id)
        .filter(ConceptTouch.touch_date >= week_ago)
        .distinct()
        .limit(5)
        .all()
    )
    for c in recent_concepts:
        suggestions.append({
            "topic": f"Explain: {c.name}",
            "source": "concept",
            "concept_id": c.id,
        })

    # Recent completed todos with pillars
    recent_todos = (
        db.query(DailyTodo)
        .filter(
            DailyTodo.user_id == user.id,
            DailyTodo.completed == True,
            DailyTodo.todo_date >= week_ago,
            DailyTodo.pillar_id.isnot(None),
        )
        .order_by(DailyTodo.completed_at.desc())
        .limit(5)
        .all()
    )
    for t in recent_todos:
        suggestions.append({
            "topic": f"Explain: {t.text}",
            "source": "todo",
            "concept_id": None,
        })

    return suggestions[:8]


# ==================== HELPERS ====================

def _session_response(session: SpeakingSession) -> dict:
    """Build response dict for a speaking session."""
    resp = {
        "id": session.id,
        "topic": session.topic,
        "audience": session.audience,
        "target_seconds": session.target_seconds,
        "actual_seconds": session.actual_seconds,
        "transcript": session.transcript,
        "session_date": session.session_date.isoformat(),
        "created_at": str(session.created_at),
        "evaluation": None,
    }
    if session.evaluation:
        e = session.evaluation
        # Extract pause_assessment from raw LLM response if available
        pause_assessment = ""
        if e.raw_llm_response:
            try:
                raw = json.loads(e.raw_llm_response)
                content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
                if content.startswith("```"):
                    content = content.split("\n", 1)[1] if "\n" in content else content[3:]
                    if content.endswith("```"):
                        content = content[:-3]
                parsed_raw = json.loads(content.strip())
                pause_assessment = parsed_raw.get("pause_assessment", "")
            except Exception:
                pass
        resp["evaluation"] = {
            "clarity_score": e.clarity_score,
            "accuracy_score": e.accuracy_score,
            "structure_score": e.structure_score,
            "conciseness_score": e.conciseness_score,
            "confidence_score": e.confidence_score,
            "overall_score": e.overall_score,
            "filler_words": json.loads(e.filler_words) if e.filler_words else {},
            "filler_count": e.filler_count,
            "specific_feedback": json.loads(e.specific_feedback) if e.specific_feedback else [],
            "pause_assessment": pause_assessment,
            "commentary": e.commentary,
        }
    return resp
