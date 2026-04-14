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
from app.services.llm import SONNET, structured_output

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/speaking", tags=["speaking"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "speaking")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ==================== WHISPERX TRANSCRIPTION ====================

# Lazy-loaded models (heavy — load once, reuse across requests)
_whisperx_model = None
_align_model = None
_align_metadata = None


def _get_whisperx_models():
    """Lazy-load WhisperX transcription and alignment models."""
    global _whisperx_model, _align_model, _align_metadata

    if _whisperx_model is None:
        import torch
        import functools

        # Patch torch.load for PyTorch 2.6+ compat with pyannote checkpoints
        _orig_load = torch.load

        @functools.wraps(_orig_load)
        def _safe_load(*a, **kw):
            kw['weights_only'] = False
            return _orig_load(*a, **kw)

        torch.load = _safe_load

        import whisperx

        logger.info("Loading WhisperX model (large-v3) on CPU...")
        _whisperx_model = whisperx.load_model(
            'large-v3', device='cpu', compute_type='float32'
        )
        logger.info("Loading WhisperX alignment model (en)...")
        _align_model, _align_metadata = whisperx.load_align_model(
            language_code='en', device='cpu'
        )
        logger.info("WhisperX models loaded.")

    return _whisperx_model, _align_model, _align_metadata


async def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio using WhisperX with word-level timestamps and pause detection."""
    import asyncio
    import whisperx as _wx

    def _run():
        model, align_model, align_metadata = _get_whisperx_models()

        audio = _wx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=4)
        segments = result.get("segments", [])

        # Word-level alignment via wav2vec2 forced alignment
        aligned = _wx.align(
            segments, align_model, align_metadata, audio, device='cpu'
        )
        word_segments = aligned.get("word_segments", [])

        # Build transcript from segments
        transcript = " ".join(
            s.get("text", "").strip() for s in segments
        ).strip()

        # Detect pauses from word-level timestamps (much more precise than segment-level)
        pauses = []
        for i in range(1, len(word_segments)):
            prev_end = word_segments[i - 1].get("end")
            curr_start = word_segments[i].get("start")
            if prev_end is not None and curr_start is not None:
                gap = curr_start - prev_end
                if gap >= 0.8:  # 0.8s+ between words = notable pause
                    pauses.append({
                        "after_text": word_segments[i - 1].get("word", ""),
                        "before_text": word_segments[i].get("word", ""),
                        "duration": round(gap, 1),
                        "timestamp": round(prev_end, 1),
                    })

        return transcript, pauses, len(word_segments)

    # Run in thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    transcript, pauses, word_count = await loop.run_in_executor(None, _run)

    return {
        "transcript": transcript,
        "pauses": pauses,
        "total_pause_seconds": round(sum(p["duration"] for p in pauses), 1),
        "pause_count": len(pauses),
    }


# ==================== EVALUATION ====================

SPEAKING_EVAL_PROMPT = """You are an elite presentation coach who has trained hedge fund managers,
TED speakers, and McKinsey partners. You are BRUTALLY honest. Most people are mediocre speakers
and you do not pretend otherwise. A score of 70+ means genuinely impressive. 80+ is exceptional.
90+ is world-class — almost nobody gets there.

## CRITICAL SCORING PHILOSOPHY
- **Do NOT grade on a curve.** A 10-second rambling intro with no content is a 5-15, not a 40.
- **Content is king.** If they didn't actually explain the topic, nothing else matters.
- **Short recordings are penalized.** If the target was 2 minutes and they spoke for 10 seconds, that's a failure.
- **"Good for a first try" is not a thing here.** Score the output, not the effort.
- Average speakers should score 30-50. Good speakers 50-70. Great speakers 70-85. Elite 85+.

## Audience-Specific Evaluation
The evaluation framework shifts based on the target audience:

### If audience is "Investors" or "Board":
- Clarity weighted HEAVILY (30%). Investors have zero patience for jargon without context.
- Must lead with the "so what" — why should they care? Burying the lede = massive clarity penalty.
- Confidence is critical (20%). Hedging = they won't give you money.
- Accuracy can use appropriate simplifications (15%).
- Structure must be: hook → problem → solution → ask (20%).

### If audience is "Technical" or "Engineers" or "Quants":
- Accuracy weighted HEAVILY (35%). Wrong technical details = credibility destroyed.
- Precision matters more than simplification. Dumbing down for a technical audience = penalty.
- Structure should be logical/mathematical (20%).
- Clarity still matters but assumes shared vocabulary (20%).

### If audience is "General" or "Non-technical" or "Students":
- Clarity weighted HEAVILY (30%). If a smart 20-year-old can't follow, you failed.
- Must use analogies and build from first principles. Jargon without explanation = penalty.
- Structure is key (25%) — scaffolding matters most for learning.
- Conciseness matters (15%) — don't lose them with tangents.

### Default (any other audience):
- Equal weighting across dimensions.

## Scoring Dimensions (each 0-100, score HARSHLY)

### Clarity
- 0-15: Incoherent, no real content delivered, false starts
- 16-30: Attempted but confusing, audience would be lost
- 31-50: Followable with effort, gaps in explanation
- 51-70: Clear and logical, good flow, minor gaps
- 71-85: Very clear, well-scaffolded, easy to follow
- 86-100: Crystal clear, a masterclass in communication

### Accuracy
- 0-15: No real content to evaluate, or fundamentally wrong
- 16-30: Several mistakes or dangerously imprecise
- 31-50: Mostly correct, some meaningful errors
- 51-70: Accurate with acceptable simplifications
- 71-85: Technically precise, nuanced
- 86-100: Expert-level precision, publication-ready

### Structure
- 0-15: No structure, abandoned attempt, stream of consciousness
- 16-30: Attempted structure but collapsed
- 31-50: Basic structure, weak transitions, no clear arc
- 51-70: Well structured with clear sections
- 71-85: Strong narrative arc, compelling flow
- 86-100: Masterful structure, TED-talk caliber

### Conciseness
- 0-15: All filler, no substance, or barely spoke
- 16-30: Extremely verbose, constant filler words
- 31-50: Some filler and repetition but has content
- 51-70: Reasonably tight delivery
- 71-85: Tight, minimal waste, every sentence adds value
- 86-100: Every word earns its place, surgically precise

### Confidence
- 0-15: Froze up, couldn't deliver, constant hedging
- 16-30: Sounds unsure of everything, frequent hedging
- 31-50: Occasional hedging, some authority
- 51-70: Speaks with reasonable authority
- 71-85: Commanding presence, rare hesitation
- 86-100: Absolute conviction, owns every statement

## Filler Word Detection
Count ALL instances of: um, uh, like (as filler), you know, basically, sort of,
kind of, I mean, right?, so (as filler at start), actually (unnecessary).
Return exact counts.

## Specific Feedback
Identify 3-5 specific passages from the transcript. For each, quote the exact text
and provide targeted feedback. Mix strengths and improvements.

## Pause Analysis
You will also receive data about pauses detected via word-level alignment (gaps ≥ 0.8s between words).
Evaluate whether pauses are:
- **Strategic** — used for emphasis, letting a point land, transitioning between ideas (GOOD)
- **Hesitation** — losing train of thought, unsure what to say next, freezing up (BAD)
- **Excessive** — too many or too long, breaking flow and losing audience (BAD)
Include pause assessment in your commentary and factor it into the confidence score.

Use the submit_speaking_evaluation tool to return the structured evaluation."""

SPEAKING_EVAL_SCHEMA = {
    "type": "object",
    "properties": {
        "clarity_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "accuracy_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "structure_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "conciseness_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "confidence_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "overall_score": {"type": "integer", "minimum": 0, "maximum": 100, "description": "Audience-weighted overall. Default: clarity 25%, accuracy 25%, structure 20%, conciseness 15%, confidence 15%"},
        "filler_words": {"type": "object", "description": "Counts of each filler word type (um, like, etc.)", "additionalProperties": {"type": "integer"}},
        "filler_count": {"type": "integer", "description": "Total filler word count"},
        "pause_assessment": {"type": "string", "description": "1-2 sentences on pause usage — strategic vs hesitation"},
        "specific_feedback": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "quote": {"type": "string", "description": "Exact text from transcript"},
                    "feedback": {"type": "string", "description": "Targeted feedback"},
                    "type": {"type": "string", "enum": ["improvement", "strength"]},
                },
                "required": ["quote", "feedback", "type"],
            },
        },
        "commentary": {"type": "string", "description": "3-5 sentences of brutally honest overall assessment"},
    },
    "required": ["clarity_score", "accuracy_score", "structure_score", "conciseness_score", "confidence_score", "overall_score", "filler_words", "filler_count", "pause_assessment", "specific_feedback", "commentary"],
}


async def evaluate_speaking(transcript: str, topic: str, audience: str, duration_seconds: int, pauses: list = None) -> dict:
    """Evaluate a speaking session transcript using tool_use structured output."""
    pause_block = ""
    if pauses:
        pause_lines = []
        for p in pauses:
            pause_lines.append(f"  - {p['duration']}s pause at {p['timestamp']}s (after: \"{p['after_text']}\" -> before: \"{p['before_text']}\")")
        pause_block = f"\n\n**Pauses detected ({len(pauses)} pauses, {sum(p['duration'] for p in pauses):.1f}s total):**\n" + "\n".join(pause_lines)

    user_prompt = f"""Evaluate this spoken explanation:

**Topic:** {topic}
**Target audience:** {audience}
**Duration:** {duration_seconds} seconds ({duration_seconds // 60}m {duration_seconds % 60}s)

**Transcript:**
{transcript}{pause_block}

Be brutally honest. Reference specific parts of the transcript in your feedback."""

    parsed = await structured_output(
        system=SPEAKING_EVAL_PROMPT,
        user_prompt=user_prompt,
        tool_name="submit_speaking_evaluation",
        tool_description="Submit the structured speaking evaluation with scores, filler counts, feedback, and commentary.",
        output_schema=SPEAKING_EVAL_SCHEMA,
        model=SONNET,
    )

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
        "raw": parsed,
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
        # Extract pause_assessment from raw LLM response (stored as structured dict)
        pause_assessment = ""
        if e.raw_llm_response:
            try:
                raw = json.loads(e.raw_llm_response)
                pause_assessment = raw.get("pause_assessment", "")
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
